import 'server-only';
import { randomUUID } from 'node:crypto';
import TARGETS from '@config/demo-targets.json';
import { CHECKPOINTS } from '@config/questions';
import { JOURNEYS, type Persona, type ScreenStep } from '@config/journeys';
import { BROWSE_CARS } from '@config/screen-data';
import { STUDY } from '@config/study';
import { getStore } from './store';
import type { EventRow, InterviewContact, Participant, ResponseRow } from './types';

/**
 * Demo data so the team can see what the dashboards look like with ~100 people.
 * Every demo participant has a code starting with "D-" and utm.demo = "1",
 * so deleteDemo() removes all of it and nothing else.
 */

export const DEMO_PREFIX = 'D-';

type Target = { id: string | null; label: string; x: number; y: number; w: number; h: number; vy?: number };
type ScreenTargets = { docH: number; targets: Target[]; dead: { label: string; x: number; y: number; w: number; h: number }[] };
const T = TARGETS as unknown as Record<string, ScreenTargets>;
// A negative vy means the element was measured scrolled out of view, not pinned; treat it as a normal in-page target.
for (const s of Object.values(T)) for (const tg of s.targets) if (tg.vy != null && tg.vy < 0) delete tg.vy;

/* ---------------- deterministic randomness ---------------- */

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class R {
  constructor(private r: () => number) {}
  f() {
    return this.r();
  }
  chance(p: number) {
    return this.r() < p;
  }
  int(a: number, b: number) {
    return a + Math.floor(this.r() * (b - a + 1));
  }
  pick<T>(xs: readonly T[]): T {
    return xs[Math.floor(this.r() * xs.length)];
  }
  weighted<T>(pairs: readonly (readonly [T, number])[]): T {
    const total = pairs.reduce((a, [, w]) => a + w, 0);
    let x = this.r() * total;
    for (const [v, w] of pairs) if ((x -= w) <= 0) return v;
    return pairs[pairs.length - 1][0];
  }
  some<T>(xs: readonly T[], min: number, max: number): T[] {
    const n = this.int(min, Math.min(max, xs.length));
    return [...xs].sort(() => this.r() - 0.5).slice(0, n);
  }
  normal(mean: number, sd: number) {
    const u = 1 - this.r();
    const v = this.r();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  /** Log-normal around a median, for durations. */
  logn(median: number, sigma = 0.5) {
    return Math.max(median * 0.2, median * Math.exp(this.normal(0, sigma)));
  }
  scale(mean: number, min: number, max: number, sd = 1) {
    return Math.max(min, Math.min(max, Math.round(this.normal(mean, sd))));
  }
}

/* ---------------- content pools ---------------- */

const FIRST = ['Maya', 'Andre', 'Keisha', 'Luis', 'Priya', 'Marcus', 'Elena', 'Darnell', 'Sofia', 'James', 'Aisha', 'Tom', 'Rachel', 'Omar', 'Grace', 'Kevin', 'Nina', 'Derek', 'Leah', 'Carlos', 'Brianna', 'Sam', 'Tasha', 'Victor'];
const LAST = ['Johnson', 'Rivera', 'Patel', 'Williams', 'Nguyen', 'Brown', 'Garcia', 'Lee', 'Thompson', 'Hall', 'Adams', 'King', 'Wright', 'Lopez', 'Hill', 'Scott'];
const CARS: [string, string, string][] = [
  ['2019', 'Honda', 'Accord'], ['2021', 'Toyota', 'Camry'], ['2020', 'Toyota', 'RAV4'], ['2018', 'Ford', 'Escape'], ['2022', 'Tesla', 'Model Y'],
  ['2017', 'Chevrolet', 'Malibu'], ['2023', 'Hyundai', 'Tucson'], ['2020', 'Jeep', 'Grand Cherokee'], ['2019', 'Nissan', 'Rogue'], ['2021', 'Kia', 'Sorento'],
  ['2016', 'Honda', 'CR-V'], ['2022', 'Subaru', 'Outback'], ['2018', 'Chevrolet', 'Equinox'], ['2021', 'Ford', 'F-150'], ['2020', 'BMW', 'X3'],
];
const COLORS = ['Black', 'White', 'Silver', 'Gray', 'Blue', 'Red', 'Dark green'];
const HOME = [['MDW', 34], ['ORD', 30], ['DTW', 8], ['MKE', 5], ['ATL', 4], ['DEN', 3], ['IND', 4], ['STL', 3], ['CLE', 3], ['other:Gary/Chicago', 2], ['MSP', 4]] as const;
const DEST = ['ATL', 'LAX', 'DFW', 'MCO', 'LAS', 'DEN', 'JFK', 'LGA', 'MIA', 'PHX', 'BNA', 'HOU', 'MSY', 'SEA', 'BOS', 'FLL', 'TPA', 'CLT', 'DCA', 'SAN'];

const CONCERNS = [
  'Someone damaging my car while I am gone and me having to fight about who pays.',
  'I would worry about strangers driving my car. My insurance might not cover it.',
  'How do I know the person renting it is a safe driver?',
  'Getting my car back late when I land and having no way home.',
  'Not sure the earnings would be worth the wear and tear on my car.',
  'Security of the lot. Has there been theft at off-site lots before?',
  'Hidden fees. Airport parking already feels like a rip-off.',
  'If the shuttle is slow I could miss my flight.',
  'Mileage on my car. I just paid it off.',
  'I would want to approve every single renter myself.',
  'Whether my personal insurance goes up if a renter crashes.',
  'Cleanliness when I get the car back. Smoke smell would be a deal-breaker.',
  'Honestly the price. I usually just get an Uber.',
  'Trusting a new company with my keys.',
  'What happens if the renter gets a ticket or a toll in my name?',
  'Nothing really, sounds like a good idea if the insurance is real.',
];
const FOLLOW: Record<string, string[]> = {
  cp1_why: ['Not sure if renting is required or optional.', 'What happens to my car while I am away?', 'Clear enough.', 'Is this a parking lot or a car rental company?', 'How the earnings work.'],
  cp2_why: ['Phone number validation was picky.', 'Nothing, it was quick.', 'Why do you need my phone number?', 'Password rules.'],
  cp3_why: ['Knowing who stores my license photo.', 'A known company doing the check (like CLEAR).', 'Explain why you need a selfie.', 'If it was quicker.', 'Seeing that renters go through the same check.'],
  cp4_why: ['Photos or video of the lot.', 'Reviews from other members.', 'Cameras and a gate with a guard.', 'Knowing exactly where the lot is.', 'A guarantee if the car is stolen.', 'Police reports or crime stats for the area.'],
  cp5_why: ['The actual policy and deductible.', 'Who pays if the renter crashes.', 'Whether my own insurance is involved at all.', 'How fast claims get paid.', 'Name of the insurance company.', 'Coverage limits in dollars.'],
  cp7_why: ['Real photos of this exact car.', 'Reviews from other renters.', 'A guarantee if the owner cancels.', 'Seeing the owner rating.'],
  cp8_why: ['A free first year.', 'If it included the parking.', 'Show me how much I would save vs airport parking.', 'If I made money back on the first trip.', 'Lower the fee.', 'It is fine.'],
  cp9_why: ['Trust in a new company.', 'Insurance details.', 'Letting strangers drive my car.', 'Nothing, I would do it.', 'The price.', 'Getting to the terminal on time.', 'Need to see reviews first.'],
  cp10: ['When it asked for my ID and a selfie.', 'Turning on the rental option. I was not sure about insurance.', 'The membership price before I knew what I was getting.', 'Seeing the 25% fee on my earnings.', 'Not knowing how far the lot is from the terminal.', 'Deciding on a daily price. I had no idea what to charge.', 'None really, it was smooth.', 'Whether the car would actually be there when I land.', 'The house rules and late fees.', 'Wondering who the owner is and if they would cancel.'],
};
const CONDITIONS = ['approve_each', 'vetting', 'insurance', 'back_before', 'condition_photos', 'mileage', 'my_price', 'reviews'] as const;

/* ---------------- timing per step (median active seconds) ---------------- */

const MEDIAN_S: Record<string, number> = {
  overview: 24, 'sign-up': 46, 'verify-id': 31, security: 19, 'insurance-owner': 23, 'insurance-renter': 18,
  membership: 27, 'add-vehicle': 52, 'plan-trip': 78, browse: 36, 'car-detail': 41, 'request-car': 44,
};
const DROP: Record<string, number> = {
  overview: 0.02, 'sign-up': 0.04, 'verify-id': 0.07, security: 0.01, 'insurance-owner': 0.03, 'insurance-renter': 0.02,
  membership: 0.08, 'add-vehicle': 0.03, 'plan-trip': 0.04, browse: 0.03, 'car-detail': 0.04, 'request-car': 0.07,
};
const BLOCKED_LINKS = ['Back to setup', '← Home', 'My vehicles', 'Trips', 'Privacy policy', 'Do this later', 'Contact support', 'Terms', 'My bookings →', 'rental terms', 'Get help'];

/* ---------------- generator ---------------- */

type Segment = 'owner' | 'renter' | 'dual' | 'none_air' | 'none_match' | 'minor';

export async function generateDemo(count = 100, seed = Date.now()) {
  const r = new R(mulberry32(seed));
  const store = getStore();
  const now = Date.now();

  const segs: Segment[] = [];
  const plan: [Segment, number][] = [['owner', 0.31], ['renter', 0.27], ['dual', 0.25], ['none_air', 0.06], ['none_match', 0.08], ['minor', 0.03]];
  for (const [s, share] of plan) for (let i = 0; i < Math.round(count * share); i++) segs.push(s);
  while (segs.length < count) segs.push('owner');
  segs.length = count;

  let made = 0;
  let totalEvents = 0;
  for (const seg of segs) {
    const { participant, responses, events, contact } = makeParticipant(r, seg, now);
    await store.createParticipant(participant);
    for (let i = 0; i < responses.length; i += 200) await store.upsertResponses(responses.slice(i, i + 200));
    for (let i = 0; i < events.length; i += 800) await store.insertEvents(events.slice(i, i + 800));
    if (contact) await store.addInterviewContact(contact);
    made++;
    totalEvents += events.length;
  }
  return { participants: made, events: totalEvents };
}

export async function deleteDemo() {
  const store = getStore();
  const demo = (await store.listParticipants()).filter((p) => p.code.startsWith(DEMO_PREFIX));
  for (const p of demo) await store.deleteParticipant(p.id);
  return { deleted: demo.length };
}

export async function demoCount() {
  return (await getStore().listParticipants()).filter((p) => p.code.startsWith(DEMO_PREFIX)).length;
}

function demoCode(r: R) {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return DEMO_PREFIX + Array.from({ length: 5 }, () => a[r.int(0, a.length - 1)]).join('');
}

function makeParticipant(r: R, seg: Segment, now: number) {
  const id = randomUUID();
  const session = randomUUID();
  const device = r.weighted([['mobile', 58], ['desktop', 35], ['tablet', 7]] as const);
  const vw = device === 'mobile' ? r.pick([375, 390, 393, 414, 430]) : device === 'tablet' ? r.pick([768, 820, 834]) : r.pick([1280, 1440, 1470, 1536, 1920]);
  // Spread sign-ups over the last two weeks, mostly afternoons and evenings.
  const day = r.int(0, 13);
  const startMs = Math.min(now - 60 * 60_000, now - day * 86_400_000 - r.int(0, 10) * 3_600_000);
  let t = startMs;
  const ts = () => new Date(Math.min(t, now - 60_000)).toISOString();
  let seq = 0;
  const events: EventRow[] = [];
  const responses: ResponseRow[] = [];
  const ev = (type: string, extra: Partial<EventRow> = {}) =>
    events.push({
      participant_id: id, session_id: session, seq: ++seq, client_ts: ts(), journey: null, step_id: null, screen_id: null,
      type, element_id: null, label: null, x: null, y: null, doc_w: null, doc_h: null, vw: null, vh: null, meta: null, ...extra,
    });
  const answer = (phase: ResponseRow['phase'], question_id: string, value: unknown, journey = '', step_id: string | null = null, ms: number | null = null) =>
    responses.push({ participant_id: id, phase, question_id, journey, step_id, value, ms_to_answer: ms, change_count: r.chance(0.12) ? 1 : 0, answered_at: ts() });

  const isOwner = seg === 'owner' || seg === 'dual';
  const isRenter = seg === 'renter' || seg === 'dual';
  const ref = r.chance(0.35) ? `${DEMO_PREFIX}${'ABCDEFGH'[r.int(0, 7)]}REF${r.int(1, 4)}` : null;

  const participant: Participant = {
    id, code: demoCode(r), ref_code: ref, status: 'consented', consent_at: ts(), created_at: ts(), updated_at: ts(), completed_at: null,
    qualified_owner: null, qualified_renter: null, screen_out_reason: null, journey_order: null, last_step: 'consent',
    device, user_agent: 'demo-data', viewport_w: vw, viewport_h: device === 'mobile' ? 844 : 900, timezone: 'America/Chicago',
    utm: { demo: '1' }, state: null,
  };
  ev('consent_given');

  /* ----- screener ----- */
  const q = (id: string, v: unknown, phase: 'screener' | 'survey' = 'screener', s = 4) => {
    t += r.logn(s * 1000, 0.6);
    answer(phase, id, v, '', id, Math.round(r.logn(s * 1000, 0.6)));
  };
  q('s_age', seg === 'minor' ? 'no' : 'yes', 'screener', 2);
  if (seg === 'minor') {
    participant.status = 'screened_out';
    participant.screen_out_reason = 'under_18';
    participant.qualified_owner = false;
    participant.qualified_renter = false;
    participant.last_step = 'not_eligible';
    participant.updated_at = ts();
    return { participant, responses, events, contact: null };
  }
  q('s_flown', seg === 'none_air' ? 'no' : 'yes');
  q('s_vehicle', isOwner || (seg !== 'renter' && r.chance(0.5)) ? 'yes' : 'no');
  q('s_license', isRenter || r.chance(0.8) ? 'yes' : 'no');
  q('s_paid_parking', isOwner ? r.weighted([['usually', 40], ['sometimes', 35], ['would_consider', 25]] as const) : 'no');
  q('s_rent_scenarios', isRenter ? r.some(['business', 'family', 'multistop', 'no_rideshare'], 1, 3) : ['none'], 'screener', 6);

  /* ----- survey ----- */
  const flights = isOwner ? r.weighted([['1–2', 18], ['3–5', 38], ['6–10', 27], ['11+', 17]] as const) : r.weighted([['0', 4], ['1–2', 30], ['3–5', 36], ['6–10', 20], ['11+', 10]] as const);
  q('q1_flights', seg === 'none_air' ? '0' : flights, 'survey');
  const home = r.weighted(HOME);
  q('q2_home_airport', home, 'survey', 7);
  const dests = r.some(DEST, 1, 3);
  q('q3_dest_airports', dests, 'survey', 10);
  q('q_trip_length', r.weighted([['1-2', 22], ['3-5', 42], ['6-9', 26], ['10+', 10]] as const), 'survey');
  q('q_distance', r.weighted([['<15', 14], ['15-30', 38], ['30-60', 34], ['60+', 14]] as const), 'survey');
  q('q4_ground', isOwner ? r.weighted([['park_airport', 45], ['offsite_lot', 30], ['rideshare', 12], ['friend_family', 13]] as const) : r.weighted([['rideshare', 45], ['friend_family', 25], ['transit', 15], ['park_airport', 8], ['other:Shuttle bus', 7]] as const), 'survey');
  q('q5_rideshare', r.weighted([['uber', 45], ['lyft', 12], ['both', 30], ['neither', 13]] as const), 'survey');
  q('q6_park_at_airport', isOwner ? (r.chance(0.7) ? 'yes' : 'no') : r.chance(0.15) ? 'yes' : 'no', 'survey');
  q('q7_idle_vehicle', isOwner ? (r.chance(0.35) ? 'yes' : 'no') : r.chance(0.3) ? 'yes' : 'no', 'survey');
  const sharing = r.chance(0.18) ? ['none'] : r.some(['p2p_rent', 'airbnb_guest', 'airbnb_guest', 'airbnb_host', 'p2p_list'], 1, 3).filter((v, i, a) => a.indexOf(v) === i);
  q('q_sharing', sharing, 'survey');
  q('q8_wtp', isOwner ? r.weighted([['$0', 6], ['$25', 18], ['$55', 36], ['$75', 18], ['$99', 15], ['$125+', 7]] as const) : r.weighted([['$0', 22], ['$25', 34], ['$55', 26], ['$75', 10], ['$99', 6], ['$125+', 2]] as const), 'survey');
  q('q9_concern', r.pick(CONCERNS), 'survey', 25);

  ev('qualified', { meta: { owner: isOwner, renter: isRenter } });
  participant.qualified_owner = isOwner;
  participant.qualified_renter = isRenter;
  if (!isOwner && !isRenter) {
    participant.status = 'screened_out';
    participant.screen_out_reason = seg === 'none_air' ? 'no_air_travel' : 'no_persona_match';
    participant.last_step = 'not_eligible';
    participant.journey_order = [];
    participant.updated_at = ts();
    return { participant, responses, events, contact: null };
  }

  const order: Persona[] = seg === 'dual' ? (r.chance(0.5) ? ['owner', 'renter'] : ['renter', 'owner']) : [isOwner ? 'owner' : 'renter'];
  participant.journey_order = order;
  participant.status = 'in_journey';

  // Each person has a general disposition that nudges all their scores together.
  const warmth = r.normal(0, 0.7);
  const cpDone = new Set<string>();
  let dropped = false;
  let rentOn = false;
  const [cy, cmake, cmodel] = r.pick(CARS);

  const runCheckpoint = (cpId: string, persona: Persona, stepId: string) => {
    const shared = ['cp1', 'cp2', 'cp3', 'cp4'].includes(cpId);
    const key = shared ? cpId : `${cpId}@${persona}`;
    if (cpDone.has(key)) return;
    cpDone.add(key);
    const cp = CHECKPOINTS[cpId];
    const journey = shared ? '' : persona;
    const ms = Math.round(r.logn(cp.main.type === 'text' ? 18000 : 6000, 0.5));
    ev('checkpoint_shown', { journey: persona, step_id: stepId, meta: { checkpoint: cpId } });
    t += ms;
    const base: Record<string, number> = { cp1: 4.0, cp2: 4.2, cp3: 3.2, cp4: 3.3, cp5: persona === 'owner' ? 2.9 : 3.5, cp7: 3.6 };
    let main: unknown;
    if (cpId in base) main = r.scale(base[cpId] + warmth, 1, 5, 0.9);
    else if (cpId === 'cp6') main = rentOn ? r.weighted([['yes', 60], ['maybe', 40]] as const) : r.weighted([['maybe', 45], ['no', 45], ['yes', 10]] as const);
    else if (cpId === 'h2') main = Math.round(r.logn(140, 0.5) / 5) * 5;
    else if (cpId === 'cp8') main = r.weighted([['too_low', 10], ['about_right', Math.max(5, 52 + warmth * 15)], ['too_high', Math.max(5, 38 - warmth * 15)]] as const);
    else if (cpId === 'cp9') main = r.scale((persona === 'owner' ? (rentOn ? 7 : 5.4) : 6.7) + warmth * 1.4, 0, 10, 1.8);
    else if (cpId === 'cp10') main = r.pick(FOLLOW.cp10);
    answer('checkpoint', cp.main.id, main, journey, stepId, ms);
    ev('checkpoint_answered', { journey: persona, step_id: stepId, meta: { checkpoint: cpId, ms, changes: 0 } });
    if (cp.followup) {
      if (cp.followup.id === 'cp6_conditions') {
        if (main !== 'no' || r.chance(0.5)) answer('checkpoint', 'cp6_conditions', [...r.some<string>(CONDITIONS, 2, 4), ...(r.chance(0.08) ? ['other:Only renters over 30'] : [])], journey, stepId);
      } else if (cp.followup.id === 'h2_need') {
        answer('checkpoint', 'h2_need', Math.round(((main as number) * r.f() * 0.8 + (main as number) * 0.9) / 5) * 5, journey, stepId);
      } else if (FOLLOW[cp.followup.id] && r.chance(typeof main === 'number' && main <= 3 ? 0.75 : 0.4)) {
        answer('checkpoint', cp.followup.id, r.pick(FOLLOW[cp.followup.id]), journey, stepId);
      }
    }
    t += r.int(400, 1500);
  };

  const behavior = (key: string, value: unknown, persona: Persona, stepId: string) => answer('behavior', key, value, persona, stepId);

  for (let ji = 0; ji < order.length && !dropped; ji++) {
    const persona = order[ji];
    const steps = JOURNEYS[persona].steps.filter((s) => ji === 0 || !s.shared);
    t += r.logn(9000, 0.4);
    const trip = persona === 'owner' ? { from: home, to: dests[0] } : { arrive: dests[0] };
    behavior(`${persona}.trip_airports`, trip, persona, `${persona}.intro`);
    ev('step_exit', { journey: persona, step_id: `${persona}.intro`, screen_id: 'shell:journey_intro', meta: { outcome: 'advanced', duration_ms: 9000, airports: trip } });

    for (const step of steps) {
      if (simulateStep(step, persona)) {
        dropped = true;
        break;
      }
    }
  }

  function simulateStep(step: ScreenStep, persona: Persona): boolean {
    const screen = step.screen;
    const tg = T[screen];
    const ctx = { journey: persona, step_id: step.id, screen_id: screen };
    const enteredAt = t;
    ev('step_enter', { ...ctx, meta: { title: step.title } });
    ev('screen_loaded', { ...ctx, doc_w: 390, doc_h: tg?.docH ?? 844, vw: 390, vh: 844 });
    t += r.int(300, 900);

    let clicks = 0, dead = 0, rage = 0, blocked = 0, fields = 0, idle = 0;
    let firstAt: number | null = null;
    const scrollMax = Math.max(0, (tg?.docH ?? 844) - 844);
    let scrollY = 0;
    const click = (target: { label: string; id?: string | null; x: number; y: number; w: number; h: number; vy?: number }, type = 'click') => {
      t += r.logn(1800, 0.7);
      if (target.vy == null) scrollY = Math.max(scrollY, Math.min(scrollMax, target.y - r.int(150, 600)));
      else scrollY = r.int(Math.max(0, scrollY - 100), scrollMax);
      const x = Math.round(target.x + target.w * (0.2 + 0.6 * r.f()));
      const y = Math.round((target.vy != null ? target.vy + scrollY : target.y) + target.h * (0.2 + 0.6 * r.f()));
      if (firstAt == null) firstAt = t;
      if (type === 'dead_click') dead++;
      else clicks++;
      const pin = target.vy != null ? { pin: 'bottom', pin_offset: Math.max(4, 844 - (y - scrollY)) } : {};
      ev(type, { ...ctx, element_id: target.id || `demo:${target.label}`, label: target.label, x, y, doc_w: 390, doc_h: tg?.docH ?? 844, vw: 390, vh: 844, meta: { surface: 'screen', interactive: type !== 'dead_click', ...pin } });
      return { x, y };
    };
    const byId = (id: string) => tg?.targets.find((x) => x.id === id);
    const byLabel = (re: RegExp) => tg?.targets.find((x) => re.test(x.label));
    const field = (id: string, ms: number, fieldType = 'text') => {
      const target = byId(id);
      if (!target) return;
      click(target);
      fields++;
      ev('field_focus', { ...ctx, element_id: id, label: target.label, meta: { field_type: fieldType } });
      t += r.logn(ms, 0.5);
      ev('field_blur', { ...ctx, element_id: id, label: target.label, meta: { field_type: fieldType, focus_ms: Math.round(r.logn(ms, 0.5)), length: r.int(3, 18), filled: true, invalid: r.chance(0.06) } });
    };

    // Reading time first.
    t += r.logn((MEDIAN_S[screen] ?? 30) * 350, 0.5);

    // Dead taps on non-interactive content (info cards, photos, headings).
    const deadRate = /overview|security|insurance|car-detail|browse/.test(screen) ? 0.45 : 0.18;
    while (tg?.dead.length && r.chance(deadRate) && dead < 4) click(r.pick(tg.dead), 'dead_click');

    // Occasionally tap a link that isn't part of the walkthrough.
    const links = tg?.targets.filter((x) => BLOCKED_LINKS.some((l) => x.label.startsWith(l))) || [];
    if (links.length && r.chance(0.14)) {
      const l = r.pick(links);
      click(l);
      blocked++;
      ev('blocked_nav', { ...ctx, label: l.label, element_id: `link:${l.label}`, meta: { target: `nav:${l.label.toLowerCase().replace(/[^a-z]+/g, '-')}` } });
    }

    // Some people step away mid-screen.
    if (r.chance(0.09)) {
      const ms = r.int(32_000, 140_000);
      ev('idle_start', ctx);
      t += ms;
      idle += ms;
      ev('idle_end', { ...ctx, meta: { idle_ms: ms } });
    }

    const pauses = step.pauses || {};
    const rageOn = (target: Target | undefined, p: number) => {
      if (!target || !r.chance(p)) return;
      const first = click(target);
      const pin = target.vy != null ? { pin: 'bottom', pin_offset: Math.max(4, 844 - (first.y - scrollY)) } : {};
      for (let i = 0; i < 2; i++) {
        t += r.int(120, 280);
        clicks++;
        ev('click', { ...ctx, element_id: target.id || `demo:${target.label}`, label: target.label, x: first.x + r.int(-6, 6), y: first.y + r.int(-6, 6), doc_w: 390, doc_h: tg.docH, vw: 390, vh: 844, meta: { surface: 'screen', interactive: true, ...pin } });
      }
      rage++;
      ev('rage_click', { ...ctx, element_id: target.id || `demo:${target.label}`, label: target.label, x: first.x, y: first.y, doc_w: 390, doc_h: tg.docH, vw: 390, vh: 844, meta: { count: 3, surface: 'screen', ...pin } });
    };

    const willDrop = r.chance((DROP[screen] ?? 0.02) * 0.6);

    switch (screen) {
      case 'sign-up':
        field('#email', 7000);
        field('#phone', 6000, 'tel');
        field('#pass', 6500, 'password');
        if (r.chance(0.2)) click(byId('#reveal')!);
        if (!willDrop) click(byId('#submit')!);
        break;
      case 'verify-id':
        if (!willDrop) {
          click(byId('#startBtn')!);
          rageOn(byId('#startBtn'), 0.07);
          t += 4000;
          const c = byLabel(/^Continue/);
          if (c) click(c);
        }
        break;
      case 'membership': {
        const pay = byId('#pay')!;
        if (willDrop) {
          if (r.chance(0.5)) click(byId('#backLink')!);
          break;
        }
        click(pay);
        rageOn(pay, 0.05);
        break;
      }
      case 'add-vehicle':
        for (const f of ['#i-year', '#i-make', '#i-model', '#i-color', '#i-plate']) field(f, 4500);
        if (!willDrop) click(byId('#nextBtn')!);
        break;
      case 'plan-trip': {
        if (r.chance(0.35)) field('#dd', 5000, 'date');
        if (r.chance(0.3)) field('#rd', 5000, 'date');
        const want = r.chance(0.62 + 0.15 * Math.tanh(warmth));
        if (want || r.chance(0.3)) {
          click(byId('#rentSw')!);
          ev('change', { ...ctx, element_id: '#rentSw', label: 'rentSw', meta: { field_type: 'checkbox', value: true } });
          rentOn = true;
          if (!want) {
            t += r.logn(6000, 0.5);
            click(byId('#rentSw')!);
            ev('change', { ...ctx, element_id: '#rentSw', label: 'rentSw', meta: { field_type: 'checkbox', value: false } });
            rentOn = false;
          } else if (r.chance(0.55)) {
            field('#price', 6000, 'number');
          } else {
            const s = byId('#useSug');
            if (s) click(s);
          }
        }
        if (!willDrop) {
          const gos = tg.targets.filter((x) => x.id === '#go');
          const go = (rentOn ? gos[1] : gos[0]) ?? gos[0];
          if (go) { click(go); rageOn(go, 0.04); }
        }
        break;
      }
      case 'browse': {
        const cards = tg.targets.filter((x) => /trips|New listing/.test(x.label));
        if (r.chance(0.3)) field('#pd', 4000, 'date');
        if (!willDrop && cards.length) click(cards[r.weighted(cards.map((_, i) => [i, [26, 22, 24, 12, 6, 10][i] ?? 5] as const))]);
        break;
      }
      case 'car-detail':
        if (r.chance(0.2)) click(byLabel(/Browse cars|Change dates/) ?? tg.targets[0]);
        if (!willDrop) click(byId('#mbB')!);
        break;
      case 'request-car':
        if (r.chance(0.25)) click(byLabel(/rental terms/) ?? tg.targets[0]);
        click(byId('#agree')!);
        if (!willDrop) click(byId('#go')!);
        rageOn(byId('#go'), 0.04);
        break;
      default:
        if (!willDrop) click(byId('#continue') ?? tg.targets[0]);
    }

    // Fill in the rest of the time on screen.
    const active = r.logn((MEDIAN_S[screen] ?? 30) * 1000, 0.5);
    t = Math.max(t, enteredAt + active + idle);

    if (willDrop) {
      // Left the study on this screen: no exit event, just silence.
      participant.last_step = step.id;
      participant.updated_at = ts();
      return true;
    }

    // Mid-screen pauses (checkpoints before the action completes) and behavior records.
    let cpMs = 0;
    for (const [name, ids] of Object.entries(pauses)) {
      const before = t;
      if (screen === 'membership' && name === 'pay') behavior('owner.membership:pay', { price: STUDY.pricing.membershipFounding }, persona, step.id);
      if (screen === 'plan-trip' && name === 'book') behavior('owner.trip:book', { rent: rentOn, price: rentOn ? r.int(30, 70) : 45 }, persona, step.id);
      if (screen === 'car-detail' && name === 'request') {
        const car = BROWSE_CARS[r.weighted(BROWSE_CARS.map((_, i) => [i, [26, 22, 24, 12, 6, 10][i]] as const))];
        behavior('renter.car:request', { car: `${car.y} ${car.mm}`, rate: car.p }, persona, step.id);
      }
      if (screen === 'request-car' && name === 'send') behavior('renter.request:send', { total: r.int(90, 260) }, persona, step.id);
      ev('pause', { ...ctx, meta: { name } });
      for (const id of ids) runCheckpoint(id, persona, step.id);
      cpMs += t - before;
    }
    if (screen === 'membership') {
      t += 2600;
      const pay = byId('#pay')!;
      click({ ...pay, label: 'Next: add your vehicle →', id: null });
    }
    if (screen === 'add-vehicle') behavior('owner.vehicle:vehicle', { year: cy, make: cmake, model: cmodel, color: r.pick(COLORS) }, persona, step.id);
    if (screen === 'plan-trip') {
      const price = rentOn ? r.int(30, 70) : 45;
      const days = r.int(3, 10);
      behavior('owner.trip:confirmed', { rent: rentOn, price, days, estEarnings: rentOn ? Math.round(price * Math.max(0, days - 2) * 0.75 * 100) / 100 : 0 }, persona, step.id);
    }
    if (screen === 'request-car') behavior('renter.request:confirmed', { total: r.int(90, 260), days: r.int(2, 6) }, persona, step.id);

    const duration = t - enteredAt;
    ev('step_exit', {
      ...ctx,
      meta: {
        outcome: 'advanced', via: 'demo', duration_ms: duration, active_ms: Math.max(1000, duration - idle - cpMs), idle_ms: idle, hidden_ms: 0, checkpoint_ms: cpMs,
        first_interaction_ms: firstAt ? firstAt - enteredAt : null, clicks, dead_clicks: dead, rage_clicks: rage, blocked_navs: blocked, fields_touched: fields,
        max_scroll_pct: Math.min(100, Math.round(((844 + (tg?.docH && tg.docH > 844 ? r.int(Math.round(scrollMax * 0.5), scrollMax) : 0)) / (tg?.docH ?? 844)) * 100)),
      },
    });
    for (const id of step.after || []) runCheckpoint(id, persona, step.id);
    participant.last_step = step.id;
    return false;
  }

  if (!dropped) {
    participant.status = 'completed';
    t += r.logn(20000, 0.4);
    const optIn = r.chance(0.4);
    answer('wrapup', 'interview_opt_in', optIn, '', 'interview');
    participant.completed_at = ts();
    participant.last_step = 'done';
    participant.updated_at = ts();
    const contact: InterviewContact | null = optIn
      ? (() => {
          const fn = r.pick(FIRST);
          const ln = r.pick(LAST);
          return {
            participant_id: id, name: fn, email: `${fn}.${ln}`.toLowerCase() + '@example.com', phone: r.chance(0.5) ? `(312) 555-01${r.int(10, 99)}` : null,
            best_time: r.pick(['Weekday evenings', 'Weekends', 'Lunch hour', 'Anytime after 5', null]), persona: order.length === 2 ? 'dual' : order[0], created_at: ts(),
          };
        })()
      : null;
    return { participant, responses, events, contact };
  }
  return { participant, responses, events, contact: null };
}
