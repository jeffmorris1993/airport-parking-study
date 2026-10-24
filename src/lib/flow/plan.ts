import { SCREENER, SURVEY, type Question } from '@config/questions';
import { JOURNEYS, type Persona, type ScreenStep } from '@config/journeys';

export type Answers = Record<string, unknown>;

export type PlanStep =
  | { kind: 'consent'; id: 'consent' }
  | { kind: 'question'; id: string; phase: 'screener' | 'survey'; q: Question; extras: Question[]; index: number; total: number }
  | { kind: 'qualify'; id: 'qualify' }
  | { kind: 'not_eligible'; id: 'not_eligible' }
  | { kind: 'journey_intro'; id: string; persona: Persona; number: number; of: number }
  | { kind: 'screen'; id: string; persona: Persona; step: ScreenStep; skippedShared: boolean }
  | { kind: 'interview'; id: 'interview' }
  | { kind: 'done'; id: 'done' };

export type Qualification = { owner: boolean; renter: boolean; defaulted: Persona | null };

/**
 * Persona rules from the prospectus (p.8). Age, flying, and license are hard
 * stops handled in buildPlan, so everyone reaching this point runs a journey:
 * participants matching neither persona default by vehicle.
 */
export function qualify(a: Answers): Qualification {
  const yes = (k: string) => a[k] === 'yes';
  const considers = (k: string) => ['usually', 'sometimes', 'would_consider'].includes(String(a[k]));
  const parking = considers('s_parking_onsite') || considers('s_parking_offsite');
  const scenarios = Array.isArray(a.s_rent_scenarios) ? (a.s_rent_scenarios as string[]) : [];
  const wouldRent = scenarios.length > 0 && !scenarios.includes('none');

  const owner = yes('s_vehicle') && parking;
  const renter = yes('s_license') && wouldRent;
  const defaulted: Persona | null = owner || renter ? null : yes('s_vehicle') ? 'owner' : 'renter';
  return { owner, renter, defaulted };
}

export type HardStopReason = 'under_18' | 'no_air_travel' | 'no_license';

/** Disqualified respondents stop right away; no further data is collected from them. */
export function hardStopReason(a: Answers): HardStopReason | null {
  if (a.s_age === 'under_18') return 'under_18';
  if (a.s_flown === 'no') return 'no_air_travel';
  if (a.s_license === 'no') return 'no_license';
  return null;
}

const HARD_STOPS: Record<string, (a: Answers) => boolean> = {
  s_age: (a) => a.s_age === 'under_18',
  s_flown: (a) => a.s_flown === 'no',
  s_license: (a) => a.s_license === 'no',
};

export function visibleQuestions(list: Question[], a: Answers) {
  return list.filter((q) => !q.when || q.when(a));
}

/**
 * The full, ordered plan for one participant. Deterministic given their answers
 * and journey order, so a saved cursor index always points at the same step.
 */
export function buildPlan(a: Answers, journeyOrder: Persona[] | null): PlanStep[] {
  const plan: PlanStep[] = [{ kind: 'consent', id: 'consent' }];

  const screener = visibleQuestions(SCREENER, a);
  const survey = visibleQuestions(SURVEY, a);

  // Fold `withPrevious` questions into the previous step; one step can carry extras.
  type Grouped = { phase: 'screener' | 'survey'; q: Question; extras: Question[] };
  const grouped: Grouped[] = [];
  for (const [phase, list] of [['screener', screener], ['survey', survey]] as const) {
    for (const q of list) {
      const prev = grouped[grouped.length - 1];
      if (q.withPrevious && prev && prev.phase === phase) prev.extras.push(q);
      else grouped.push({ phase, q, extras: [] });
    }
  }
  const total = grouped.length;

  const resolve = (q: Question): Question => {
    const hidden = q.hideOptions?.(a);
    return hidden?.length && q.options ? { ...q, options: q.options.filter((o) => !hidden.includes(o.value)) } : q;
  };

  for (let i = 0; i < grouped.length; i++) {
    const g = grouped[i];
    plan.push({ kind: 'question', id: g.q.id, phase: g.phase, q: resolve(g.q), extras: g.extras.map(resolve), index: i, total });
    // Stop right after a disqualifying answer; nothing more is asked.
    if (HARD_STOPS[g.q.id]?.(a)) {
      plan.push({ kind: 'not_eligible', id: 'not_eligible' });
      return plan;
    }
  }
  plan.push({ kind: 'qualify', id: 'qualify' });

  if (!journeyOrder) return plan;
  if (!journeyOrder.length) {
    // Legacy saved states only: new participants always get a journey.
    plan.push({ kind: 'not_eligible', id: 'not_eligible' });
    return plan;
  }

  journeyOrder.forEach((persona, ji) => {
    plan.push({ kind: 'journey_intro', id: `${persona}.intro`, persona, number: ji + 1, of: journeyOrder.length });
    for (const step of JOURNEYS[persona].steps) {
      if (ji > 0 && step.shared) continue;
      plan.push({ kind: 'screen', id: step.id, persona, step, skippedShared: false });
    }
  });
  plan.push({ kind: 'interview', id: 'interview' });
  plan.push({ kind: 'done', id: 'done' });
  return plan;
}

/** Random journey order for dual-qualifiers; the order is recorded for analysis. */
export function chooseJourneyOrder(q: Qualification): Persona[] {
  if (q.owner && q.renter) return Math.random() < 0.5 ? ['owner', 'renter'] : ['renter', 'owner'];
  if (q.owner) return ['owner'];
  if (q.renter) return ['renter'];
  return q.defaulted ? [q.defaulted] : [];
}

export function personaLabel(order: Persona[] | null | undefined) {
  if (!order?.length) return 'none';
  return order.length === 2 ? 'dual' : order[0];
}
