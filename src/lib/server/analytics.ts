import 'server-only';
import { CHECKPOINTS, SCREENER, SURVEY, type Question } from '@config/questions';
import { JOURNEYS, type Persona } from '@config/journeys';
import { STUDY } from '@config/study';
import { getStore } from './store';
import type { EventRow, Participant, ResponseRow } from './types';

export type Segment = 'owner' | 'renter' | 'dual' | 'not_qualified' | 'in_progress';

export const SEGMENT_LABEL: Record<Segment, string> = {
  owner: 'Owner only',
  renter: 'Renter only',
  dual: 'Both',
  not_qualified: 'Not qualified',
  in_progress: 'Not screened yet',
};

const ABANDON_AFTER_MS = 6 * 60 * 60 * 1000;

export function segmentOf(p: Participant): Segment {
  if (p.qualified_owner == null && p.qualified_renter == null) return p.status === 'screened_out' ? 'not_qualified' : 'in_progress';
  if (p.qualified_owner && p.qualified_renter) return 'dual';
  if (p.qualified_owner) return 'owner';
  if (p.qualified_renter) return 'renter';
  return 'not_qualified';
}

export function effectiveStatus(p: Participant, now = Date.now()) {
  if (p.status === 'completed' || p.status === 'screened_out') return p.status;
  return now - new Date(p.updated_at).getTime() > ABANDON_AFTER_MS ? 'abandoned' : p.status;
}

export function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export function quantile(xs: number[], q: number) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1) + 0.5))];
}
const meta = (e: EventRow, k: string) => (e.meta as Record<string, unknown> | null)?.[k];

/* ------------------------------------------------------------------ */

export async function loadCore() {
  const store = getStore();
  const [participants, responses, stepEvents] = await Promise.all([
    store.listParticipants(),
    store.listResponses(),
    store.listEvents({ types: ['step_enter', 'step_exit', 'blocked_nav', 'rage_click', 'dead_click', 'idle_start', 'nav'] }),
  ]);
  return { participants, responses, stepEvents };
}

/* ---------------- overview ---------------- */

export async function overview() {
  const { participants, stepEvents } = await loadCore();
  const now = Date.now();
  const seg = participants.map(segmentOf);
  const qualified = seg.filter((s) => s === 'owner' || s === 'renter' || s === 'dual').length;
  const statuses = participants.map((p) => effectiveStatus(p, now));
  const startedJourney = new Set(stepEvents.filter((e) => e.type === 'step_enter' && e.journey && e.step_id?.includes('.')).map((e) => e.participant_id));
  const surveyed = participants.filter((p) => p.qualified_owner != null || p.qualified_renter != null || p.status === 'screened_out').length;
  const completed = statuses.filter((s) => s === 'completed').length;

  const funnel = [
    { label: 'Consented', value: participants.length },
    { label: 'Finished survey', value: surveyed },
    { label: 'Qualified', value: qualified },
    { label: 'Started walkthrough', value: startedJourney.size },
    { label: 'Completed', value: completed },
  ];

  const bySegment = (['owner', 'renter', 'dual', 'not_qualified', 'in_progress'] as Segment[]).map((s) => ({
    key: s,
    label: SEGMENT_LABEL[s],
    value: seg.filter((x) => x === s).length,
  }));

  const reasons = new Map<string, number>();
  for (const p of participants) if (p.screen_out_reason) reasons.set(p.screen_out_reason, (reasons.get(p.screen_out_reason) || 0) + 1);

  const daily = new Map<string, number>();
  for (const p of participants) {
    const d = new Date(p.created_at).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
    daily.set(d, (daily.get(d) || 0) + 1);
  }

  const durations = participants
    .filter((p) => p.completed_at && p.consent_at)
    .map((p) => new Date(p.completed_at!).getTime() - new Date(p.consent_at!).getTime());

  const refs = new Map<string, number>();
  for (const p of participants) if (p.ref_code) refs.set(p.ref_code, (refs.get(p.ref_code) || 0) + 1);
  const codeToSeg = new Map(participants.map((p) => [p.code, p]));

  const devices = new Map<string, number>();
  for (const p of participants) devices.set(p.device || 'unknown', (devices.get(p.device || 'unknown') || 0) + 1);

  return {
    total: participants.length,
    qualified,
    target: STUDY.targetQualified,
    completed,
    abandoned: statuses.filter((s) => s === 'abandoned').length,
    inProgress: statuses.filter((s) => s === 'consented' || s === 'surveyed' || s === 'in_journey').length,
    funnel,
    bySegment,
    reasons: [...reasons].map(([label, value]) => ({ label: REASON_LABEL[label] || label, value })),
    daily: [...daily].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value })),
    medianMinutes: durations.length ? Math.round((median(durations)! / 60000) * 10) / 10 : null,
    topReferrers: [...refs]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([code, value]) => ({ code, value, known: codeToSeg.has(code) })),
    devices: [...devices].map(([label, value]) => ({ label, value })),
  };
}

const REASON_LABEL: Record<string, string> = {
  under_18: 'Under 18',
  no_air_travel: 'No air travel in a 12-month window',
  no_persona_match: 'Didn’t match owner or renter criteria',
};

/* ---------------- survey ---------------- */

export type Dist = { value: string; label: string; count: number; bySegment: Record<string, number> }[];

function distribution(q: Question, rows: ResponseRow[], segOf: Map<string, Segment>): { dist: Dist; texts: { text: string; segment: Segment; pid: string }[]; n: number } {
  const counts = new Map<string, { label: string; count: number; bySegment: Record<string, number> }>();
  const texts: { text: string; segment: Segment; pid: string }[] = [];
  const add = (value: string, label: string, pid: string) => {
    const c = counts.get(value) || { label, count: 0, bySegment: {} };
    c.count++;
    const s = segOf.get(pid) || 'in_progress';
    c.bySegment[s] = (c.bySegment[s] || 0) + 1;
    counts.set(value, c);
  };
  for (const o of q.options || []) counts.set(o.value, { label: o.label, count: 0, bySegment: {} });
  if (q.type === 'scale') for (let v = q.min ?? 1; v <= (q.maxScale ?? 5); v++) counts.set(String(v), { label: String(v), count: 0, bySegment: {} });
  const optLabel = (v: string) => q.options?.find((o) => o.value === v)?.label ?? v;
  for (const r of rows) {
    const v = r.value;
    if (q.type === 'text') {
      if (typeof v === 'string' && v.trim()) texts.push({ text: v.trim(), segment: segOf.get(r.participant_id) || 'in_progress', pid: r.participant_id });
      continue;
    }
    const list = Array.isArray(v) ? v : [v];
    for (const item of list) {
      if (item == null || item === '') continue;
      const s = String(item);
      if (s.startsWith('other:')) {
        add('other', 'Other', r.participant_id);
        texts.push({ text: s.slice(6), segment: segOf.get(r.participant_id) || 'in_progress', pid: r.participant_id });
      } else add(s, optLabel(s), r.participant_id);
    }
  }
  let dist: Dist = [...counts].map(([value, c]) => ({ value, ...c }));
  if (q.type === 'airport' || q.type === 'airports') dist = dist.sort((a, b) => b.count - a.count).slice(0, 12);
  if (q.type === 'currency') {
    const nums = rows.map((r) => Number(r.value)).filter(Number.isFinite);
    dist = bucketCurrency(nums, rows, segOf);
  }
  return { dist, texts, n: new Set(rows.map((r) => r.participant_id)).size };
}

function bucketCurrency(_nums: number[], rows: ResponseRow[], segOf: Map<string, Segment>): Dist {
  const edges = [0, 25, 50, 100, 200, 400, Infinity];
  const out: Dist = edges.slice(0, -1).map((lo, i) => ({
    value: String(lo),
    label: edges[i + 1] === Infinity ? `$${lo}+` : `$${lo}–${edges[i + 1] - 1}`,
    count: 0,
    bySegment: {},
  }));
  for (const r of rows) {
    const n = Number(r.value);
    if (!Number.isFinite(n)) continue;
    const i = edges.findIndex((e, k) => n >= e && n < edges[k + 1]);
    if (i < 0) continue;
    out[i].count++;
    const s = segOf.get(r.participant_id) || 'in_progress';
    out[i].bySegment[s] = (out[i].bySegment[s] || 0) + 1;
  }
  return out;
}

export async function surveyResults() {
  const { participants, responses } = await loadCore();
  const segOf = new Map(participants.map((p) => [p.id, segmentOf(p)]));
  const byQ = groupBy(responses.filter((r) => r.phase === 'screener' || r.phase === 'survey'), (r) => r.question_id);
  return [...SCREENER.map((q) => ({ q, phase: 'Screener' })), ...SURVEY.map((q) => ({ q, phase: 'Survey' }))].map(({ q, phase }) => ({
    id: q.id,
    prompt: q.prompt,
    phase,
    added: !!q.added,
    type: q.type,
    ...distribution(q, byQ.get(q.id) || [], segOf),
  }));
}

/* ---------------- journey ---------------- */

export async function journeyMetrics(order: 'all' | 'first' | 'second' = 'all') {
  const { participants, responses, stepEvents } = await loadCore();
  const pmap = new Map(participants.map((p) => [p.id, p]));
  const keep = (e: EventRow) => {
    if (order === 'all' || !e.journey) return true;
    const jo = pmap.get(e.participant_id)?.journey_order || [];
    const pos = jo.indexOf(e.journey);
    return order === 'first' ? pos === 0 : pos === 1;
  };
  const ev = stepEvents.filter(keep);
  const result = (['owner', 'renter'] as Persona[]).map((persona) => {
    const steps = JOURNEYS[persona].steps;
    const rows = steps.map((s, i) => {
      const enters = ev.filter((e) => e.type === 'step_enter' && e.step_id === s.id);
      const exits = ev.filter((e) => e.type === 'step_exit' && e.step_id === s.id);
      const reached = new Set(enters.map((e) => e.participant_id));
      const advancedExits = exits.filter((e) => meta(e, 'outcome') === 'advanced');
      const advanced = new Set(advancedExits.map((e) => e.participant_id));
      // Shared steps are skipped in a second journey: count those as passed through.
      const next = steps[i + 1];
      const active = advancedExits.map((e) => Number(meta(e, 'active_ms'))).filter(Number.isFinite);
      const first = advancedExits.map((e) => Number(meta(e, 'first_interaction_ms'))).filter((n) => Number.isFinite(n) && n > 0);
      const sum = (k: string) => exits.reduce((a, e) => a + (Number(meta(e, k)) || 0), 0);
      const dropped = [...reached].filter((pid) => !advanced.has(pid) && pmap.get(pid)?.status !== 'completed');
      const idle = ev.filter((e) => e.type === 'idle_start' && e.step_id === s.id).length;
      const backs = exits.filter((e) => meta(e, 'outcome') === 'back').length;
      const blockedTargets = new Map<string, number>();
      for (const e of ev.filter((x) => x.type === 'blocked_nav' && x.step_id === s.id)) {
        const k = e.label || String(meta(e, 'target') || 'link');
        blockedTargets.set(k, (blockedTargets.get(k) || 0) + 1);
      }
      return {
        id: s.id,
        title: s.title,
        screen: s.screen,
        reached: reached.size,
        advanced: advanced.size,
        dropped: dropped.length,
        medianActiveMs: median(active),
        p90ActiveMs: quantile(active, 0.9),
        medianFirstMs: median(first),
        deadClicks: sum('dead_clicks'),
        rageClicks: sum('rage_clicks'),
        blocked: sum('blocked_navs'),
        idle,
        backs,
        topBlocked: [...blockedTargets].sort((a, b) => b[1] - a[1]).slice(0, 3),
        nextId: next?.id ?? null,
      };
    });
    return { persona, title: JOURNEYS[persona].title, rows };
  });

  // Key behaviors recorded by the screens.
  const beh = responses.filter((r) => r.phase === 'behavior');
  const confirmedOwner = beh.filter((r) => r.question_id === 'owner.trip:confirmed').map((r) => r.value as Record<string, unknown>);
  const rentOn = confirmedOwner.filter((v) => v?.rent);
  const prices = rentOn.map((v) => Number(v.price)).filter(Number.isFinite);
  const renterCars = new Map<string, number>();
  for (const r of beh.filter((x) => x.question_id === 'renter.car:request')) {
    const car = String((r.value as Record<string, unknown>)?.car || 'unknown');
    renterCars.set(car, (renterCars.get(car) || 0) + 1);
  }
  const ownerCars = new Map<string, number>();
  for (const r of beh.filter((x) => x.question_id === 'owner.vehicle:vehicle')) {
    const v = r.value as Record<string, string>;
    const k = [v?.make, v?.model].filter(Boolean).join(' ') || 'unknown';
    ownerCars.set(k, (ownerCars.get(k) || 0) + 1);
  }
  const tripAirports = new Map<string, number>();
  for (const r of beh.filter((x) => x.question_id.endsWith('.trip_airports'))) {
    const v = (r.value || {}) as Record<string, string | null>;
    const k = r.journey === 'owner' ? `Owner · ${v.from || '?'}${v.to ? ` → ${v.to}` : ''}` : `Renter · into ${v.arrive || '?'}`;
    tripAirports.set(k, (tripAirports.get(k) || 0) + 1);
  }
  return {
    journeys: result,
    behavior: {
      tripAirports: [...tripAirports].sort((a, b) => b[1] - a[1]).slice(0, 15),
      ownersBooked: confirmedOwner.length,
      ownersRentOn: rentOn.length,
      medianPrice: median(prices),
      prices,
      renterCars: [...renterCars].sort((a, b) => b[1] - a[1]),
      ownerCars: [...ownerCars].sort((a, b) => b[1] - a[1]).slice(0, 10),
    },
  };
}

/* ---------------- checkpoints ---------------- */

export async function checkpointResults() {
  const { participants, responses } = await loadCore();
  const segOf = new Map(participants.map((p) => [p.id, segmentOf(p)]));
  const cps = responses.filter((r) => r.phase === 'checkpoint');
  return Object.values(CHECKPOINTS).map((cp) => {
    const journeys = ['', 'owner', 'renter'];
    const parts = journeys
      .map((j) => {
        const main = cps.filter((r) => r.question_id === cp.main.id && r.journey === j);
        if (!main.length) return null;
        const follow = cp.followup ? cps.filter((r) => r.question_id === cp.followup!.id && r.journey === j) : [];
        const d = distribution(cp.main, main, segOf);
        const nums = main.map((r) => Number(r.value)).filter(Number.isFinite);
        const f = cp.followup ? distribution(cp.followup, follow, segOf) : null;
        return {
          journey: j,
          n: d.n,
          dist: d.dist,
          texts: d.texts,
          mean: cp.main.type === 'scale' || cp.main.type === 'currency' ? (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null) : null,
          median: cp.main.type === 'currency' ? median(nums) : null,
          followDist: f && cp.followup?.type !== 'text' ? f.dist : null,
          followTexts: f ? f.texts : [],
          medianMs: median(main.map((r) => r.ms_to_answer || 0).filter((x) => x > 0)),
        };
      })
      .filter(Boolean) as NonNullable<unknown>[];
    return { id: cp.id, label: cp.label, prompt: cp.main.prompt, type: cp.main.type, min: cp.main.min, max: cp.main.maxScale, followPrompt: cp.followup?.prompt ?? null, parts };
  });
}

/* ---------------- participants ---------------- */

export async function participantList() {
  const { participants, stepEvents } = await loadCore();
  const now = Date.now();
  const lastSeen = new Map<string, string>();
  for (const e of stepEvents) {
    const prev = lastSeen.get(e.participant_id);
    if (!prev || e.client_ts > prev) lastSeen.set(e.participant_id, e.client_ts);
  }
  return participants
    .map((p) => ({
      id: p.id,
      code: p.code,
      created_at: p.created_at,
      status: effectiveStatus(p, now),
      segment: segmentOf(p),
      order: p.journey_order,
      last_step: p.last_step,
      device: p.device,
      ref: p.ref_code,
      minutes: p.completed_at && p.consent_at ? Math.round((new Date(p.completed_at).getTime() - new Date(p.consent_at).getTime()) / 6000) / 10 : null,
      last_seen: lastSeen.get(p.id) || p.updated_at,
    }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function participantDetail(id: string) {
  const store = getStore();
  const [p, responses, events, chunks] = await Promise.all([
    store.getParticipant(id),
    store.listResponses(id),
    store.listEvents({ participantId: id }),
    store.listReplayChunks(id),
  ]);
  if (!p) return null;
  return { p, segment: segmentOf(p), status: effectiveStatus(p), responses, events, chunks };
}

/* ---------------- heatmaps ---------------- */

export async function heatmapData(screenId: string, device: 'mobile' | 'desktop' | 'all') {
  const events = await getStore().listEvents({ screenId, types: ['click', 'dead_click', 'rage_click', 'step_exit', 'blocked_nav'] });
  const fits = (e: EventRow) => {
    if (device === 'all' || e.vw == null) return true;
    return device === 'mobile' ? e.vw < 500 : e.vw >= 500;
  };
  const clicks = events
    .filter((e) => (e.type === 'click' || e.type === 'dead_click' || e.type === 'rage_click') && meta(e, 'surface') === 'screen' && e.x != null && e.y != null && fits(e))
    .map((e) => ({ x: e.x!, y: e.y!, w: e.doc_w || e.vw || 390, t: e.type, label: e.label }));
  const scroll = events.filter((e) => e.type === 'step_exit').map((e) => Number(meta(e, 'max_scroll_pct'))).filter(Number.isFinite);
  const topTargets = new Map<string, { count: number; dead: number; rage: number }>();
  for (const c of clicks) {
    const k = c.label || '(no label)';
    const v = topTargets.get(k) || { count: 0, dead: 0, rage: 0 };
    if (c.t === 'rage_click') v.rage++;
    else {
      v.count++;
      if (c.t === 'dead_click') v.dead++;
    }
    topTargets.set(k, v);
  }
  return {
    clicks,
    scroll,
    visits: scroll.length,
    topTargets: [...topTargets].sort((a, b) => b[1].count - a[1].count).slice(0, 12),
  };
}

/* ---------------- helpers ---------------- */

export function groupBy<T, K>(xs: T[], f: (x: T) => K) {
  const m = new Map<K, T[]>();
  for (const x of xs) {
    const k = f(x);
    const a = m.get(k);
    if (a) a.push(x);
    else m.set(k, [x]);
  }
  return m;
}

export function fmtMs(ms: number | null | undefined) {
  if (ms == null) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)} s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}
