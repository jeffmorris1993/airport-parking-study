import { SCREENER, SURVEY, type Question } from '@config/questions';
import { JOURNEYS, type Persona, type ScreenStep } from '@config/journeys';

export type Answers = Record<string, unknown>;

export type PlanStep =
  | { kind: 'consent'; id: 'consent' }
  | { kind: 'question'; id: string; phase: 'screener' | 'survey'; q: Question; index: number; total: number }
  | { kind: 'qualify'; id: 'qualify' }
  | { kind: 'not_eligible'; id: 'not_eligible' }
  | { kind: 'journey_intro'; id: string; persona: Persona; number: number; of: number }
  | { kind: 'screen'; id: string; persona: Persona; step: ScreenStep; skippedShared: boolean }
  | { kind: 'interview'; id: 'interview' }
  | { kind: 'done'; id: 'done' };

export type Qualification = { owner: boolean; renter: boolean; reason: string | null };

/** Persona rules from the prospectus (p.8). */
export function qualify(a: Answers): Qualification {
  const yes = (k: string) => a[k] === 'yes';
  const adult = yes('s_age');
  const flies = yes('s_flown');
  const parking = ['usually', 'sometimes', 'would_consider'].includes(String(a.s_paid_parking));
  const scenarios = Array.isArray(a.s_rent_scenarios) ? (a.s_rent_scenarios as string[]) : [];
  const wouldRent = scenarios.length > 0 && !scenarios.includes('none');

  const owner = adult && flies && yes('s_vehicle') && parking;
  const renter = adult && flies && yes('s_license') && wouldRent;
  let reason: string | null = null;
  if (!owner && !renter) {
    reason = !adult ? 'under_18' : !flies ? 'no_air_travel' : 'no_persona_match';
  }
  return { owner, renter, reason };
}

/** Under-18 respondents stop right away; no further data is collected from them. */
export function hardStop(a: Answers): boolean {
  return a.s_age === 'no';
}

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
  const total = screener.length + survey.length;
  if (hardStop(a)) {
    // Stop right after the age question; nothing more is asked of minors.
    plan.push({ kind: 'question', id: screener[0].id, phase: 'screener', q: screener[0], index: 0, total });
    plan.push({ kind: 'not_eligible', id: 'not_eligible' });
    return plan;
  }
  screener.forEach((q, i) => plan.push({ kind: 'question', id: q.id, phase: 'screener', q, index: i, total }));
  survey.forEach((q, i) =>
    plan.push({ kind: 'question', id: q.id, phase: 'survey', q, index: screener.length + i, total }),
  );
  plan.push({ kind: 'qualify', id: 'qualify' });

  if (!journeyOrder) return plan;
  if (!journeyOrder.length) {
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
  return [];
}

export function personaLabel(order: Persona[] | null | undefined) {
  if (!order?.length) return 'none';
  return order.length === 2 ? 'dual' : order[0];
}
