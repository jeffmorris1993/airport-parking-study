import { NextResponse } from 'next/server';
import { getStore } from '@/lib/server/store';
import { currentParticipantId } from '@/lib/server/session';
import { IngestBody, MAX_BODY_BYTES, rateLimited } from '@/lib/server/ingest';
import type { EventRow, ResponseRow } from '@/lib/server/types';

export const dynamic = 'force-dynamic';

/**
 * Batched writes from the participant's browser: interaction events,
 * answers, flow-state updates, and the optional interview opt-in.
 * Sent with fetch(keepalive) or navigator.sendBeacon, so the body may be text/plain.
 */
export async function POST(req: Request) {
  const pid = await currentParticipantId();
  if (!pid) return NextResponse.json({ error: 'no_participant' }, { status: 401 });
  if (rateLimited(`ingest:${pid}`, 240)) return NextResponse.json({ error: 'slow_down' }, { status: 429 });

  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) return NextResponse.json({ error: 'too_large' }, { status: 413 });
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }
  const parsed = IngestBody.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'bad_request', issues: parsed.error.issues.slice(0, 3) }, { status: 400 });

  const store = getStore();
  const participant = await store.getParticipant(pid);
  if (!participant) return NextResponse.json({ error: 'no_participant' }, { status: 401 });

  const { events, responses, patch, interview } = parsed.data;
  const received = new Date().toISOString();

  if (events?.length) {
    const rows: EventRow[] = events.map((e) => ({
      participant_id: pid,
      session_id: e.session_id,
      seq: e.seq,
      client_ts: e.client_ts,
      received_at: received,
      journey: e.journey ?? null,
      step_id: e.step_id ?? null,
      screen_id: e.screen_id ?? null,
      type: e.type,
      element_id: e.element_id ?? null,
      label: e.label ?? null,
      x: e.x ?? null,
      y: e.y ?? null,
      doc_w: e.doc_w ?? null,
      doc_h: e.doc_h ?? null,
      vw: e.vw ?? null,
      vh: e.vh ?? null,
      meta: e.meta ?? null,
    }));
    await store.insertEvents(rows);
  }

  if (responses?.length) {
    const rows: ResponseRow[] = responses.map((r) => ({
      participant_id: pid,
      phase: r.phase,
      question_id: r.question_id,
      journey: r.journey ?? '',
      step_id: r.step_id ?? null,
      value: r.value ?? null,
      ms_to_answer: r.ms_to_answer ?? null,
      change_count: r.change_count ?? 0,
      answered_at: r.answered_at,
    }));
    await store.upsertResponses(rows);
  }

  if (patch && Object.keys(patch).length) await store.updateParticipant(pid, patch);

  if (interview) {
    await store.addInterviewContact({
      participant_id: pid,
      name: interview.name,
      email: interview.email ?? null,
      phone: interview.phone ?? null,
      best_time: interview.best_time ?? null,
      persona: interview.persona,
      created_at: received,
    });
  }

  return NextResponse.json({ ok: true });
}
