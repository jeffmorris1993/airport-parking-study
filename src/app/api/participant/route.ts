import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getStore } from '@/lib/server/store';
import {
  currentParticipantId,
  newParticipantCode,
  newParticipantId,
  resumeToken,
  setParticipantCookie,
} from '@/lib/server/session';
import { rateLimited } from '@/lib/server/ingest';
import type { Participant } from '@/lib/server/types';

export const dynamic = 'force-dynamic';

const CreateIn = z.object({
  consent: z.literal(true),
  ref: z.string().max(20).nullable().optional(),
  utm: z.record(z.string(), z.string().max(120)).nullable().optional(),
  device: z.string().max(20).nullable().optional(),
  vw: z.number().nullable().optional(),
  vh: z.number().nullable().optional(),
  tz: z.string().max(64).nullable().optional(),
});

function publicView(p: Participant) {
  return { id: p.id, code: p.code, status: p.status, state: p.state, resume: resumeToken(p.code) };
}

/** Current participant (for resuming), if the cookie is valid. */
export async function GET() {
  const id = await currentParticipantId();
  if (!id) return NextResponse.json({ participant: null });
  const p = await getStore().getParticipant(id);
  return NextResponse.json({ participant: p ? publicView(p) : null });
}

/** Called when someone accepts the consent screen. */
export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (rateLimited(`create:${ip}`, 20)) return NextResponse.json({ error: 'slow_down' }, { status: 429 });

  const parsed = CreateIn.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  const store = getStore();
  const existingId = await currentParticipantId();
  if (existingId) {
    const existing = await store.getParticipant(existingId);
    if (existing) return NextResponse.json({ participant: publicView(existing) });
  }

  const now = new Date().toISOString();
  const b = parsed.data;
  const p: Participant = {
    id: newParticipantId(),
    code: newParticipantCode(),
    ref_code: b.ref ? b.ref.toUpperCase().replace(/[^A-Z0-9-]/g, '') : null,
    status: 'consented',
    consent_at: now,
    created_at: now,
    updated_at: now,
    completed_at: null,
    qualified_owner: null,
    qualified_renter: null,
    screen_out_reason: null,
    journey_order: null,
    last_step: 'consent',
    device: b.device ?? null,
    user_agent: req.headers.get('user-agent')?.slice(0, 300) ?? null,
    viewport_w: b.vw ?? null,
    viewport_h: b.vh ?? null,
    timezone: b.tz ?? null,
    utm: b.utm ?? null,
    state: null,
  };
  await store.createParticipant(p);
  await setParticipantCookie(p.id);
  return NextResponse.json({ participant: publicView(p) });
}

/** "Start over" on a shared device: forget this browser's participant. Data already sent is kept. */
export async function DELETE() {
  const { cookies } = await import('next/headers');
  (await cookies()).delete('ms_p');
  return NextResponse.json({ ok: true });
}
