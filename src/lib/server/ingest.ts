import 'server-only';
import { z } from 'zod';

const str = (max: number) => z.string().max(max);
const num = z.number().finite();

export const EventIn = z.object({
  session_id: str(64),
  seq: z.number().int().nonnegative(),
  client_ts: str(40),
  journey: str(16).nullable().optional(),
  step_id: str(64).nullable().optional(),
  screen_id: str(64).nullable().optional(),
  type: str(40),
  element_id: str(255).nullable().optional(),
  label: str(255).nullable().optional(),
  x: num.nullable().optional(),
  y: num.nullable().optional(),
  doc_w: num.nullable().optional(),
  doc_h: num.nullable().optional(),
  vw: num.nullable().optional(),
  vh: num.nullable().optional(),
  meta: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const ResponseIn = z.object({
  phase: z.enum(['screener', 'survey', 'checkpoint', 'behavior', 'wrapup']),
  question_id: str(64),
  journey: str(16).default(''),
  step_id: str(64).nullable().optional(),
  value: z.unknown(),
  ms_to_answer: num.nullable().optional(),
  change_count: z.number().int().nonnegative().default(0),
  answered_at: str(40),
});

export const PatchIn = z
  .object({
    status: z.enum(['consented', 'screened_out', 'surveyed', 'in_journey', 'completed', 'abandoned']),
    last_step: str(64).nullable(),
    state: z.record(z.string(), z.unknown()),
    qualified_owner: z.boolean().nullable(),
    qualified_renter: z.boolean().nullable(),
    screen_out_reason: str(64).nullable(),
    journey_order: z.array(str(16)).max(2).nullable(),
    completed_at: str(40).nullable(),
  })
  .partial();

export const InterviewIn = z.object({
  name: str(120),
  email: str(200).nullable().optional(),
  phone: str(40).nullable().optional(),
  best_time: str(200).nullable().optional(),
  persona: str(16),
});

export const IngestBody = z.object({
  events: z.array(EventIn).max(500).optional(),
  responses: z.array(ResponseIn).max(100).optional(),
  patch: PatchIn.optional(),
  interview: InterviewIn.optional(),
});

/** Best-effort per-instance rate limit: N requests per window per key. */
const buckets = new Map<string, { n: number; reset: number }>();
export function rateLimited(key: string, limit = 120, windowMs = 60_000) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    if (buckets.size > 5000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
    return false;
  }
  b.n++;
  return b.n > limit;
}

export const MAX_BODY_BYTES = 512 * 1024;
export const MAX_REPLAY_BYTES = 4 * 1024 * 1024;
