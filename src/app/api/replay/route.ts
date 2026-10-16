import { NextResponse } from 'next/server';
import { getStore } from '@/lib/server/store';
import { currentParticipantId } from '@/lib/server/session';
import { MAX_REPLAY_BYTES, rateLimited } from '@/lib/server/ingest';

export const dynamic = 'force-dynamic';

/** One gzipped chunk of rrweb events: POST /api/replay?s=<session>&i=<index>&t=<startedAt>&gz=1 */
export async function POST(req: Request) {
  const pid = await currentParticipantId();
  if (!pid) return NextResponse.json({ error: 'no_participant' }, { status: 401 });
  if (rateLimited(`replay:${pid}`, 60)) return NextResponse.json({ error: 'slow_down' }, { status: 429 });

  const url = new URL(req.url);
  const session = (url.searchParams.get('s') || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64);
  const idx = Number(url.searchParams.get('i'));
  const startedAt = url.searchParams.get('t') || new Date().toISOString();
  const gz = url.searchParams.get('gz') === '1';
  if (!session || !Number.isInteger(idx) || idx < 0 || idx > 100_000) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const body = new Uint8Array(await req.arrayBuffer());
  if (!body.length) return NextResponse.json({ ok: true });
  if (body.length > MAX_REPLAY_BYTES) return NextResponse.json({ error: 'too_large' }, { status: 413 });

  const path = `${pid}/${session}/${String(idx).padStart(5, '0')}.json${gz ? '.gz' : ''}`;
  await getStore().putReplay(
    {
      participant_id: pid,
      session_id: session,
      idx,
      storage_path: path,
      started_at: new Date(startedAt).toISOString(),
      bytes: body.length,
    },
    body,
  );
  return NextResponse.json({ ok: true });
}
