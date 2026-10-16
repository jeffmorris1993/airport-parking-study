import { NextResponse } from 'next/server';
import { gunzipSync } from 'node:zlib';
import { adminEmail } from '@/lib/server/admin-auth';
import { getStore } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

/** All replay chunks for one participant, merged per session, in time order. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await adminEmail())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const store = getStore();
  const chunks = await store.listReplayChunks(id);
  const sessions = new Map<string, { events: { timestamp: number }[]; started: string }>();
  for (const c of chunks) {
    const raw = await store.getReplay(c.storage_path);
    if (!raw) continue;
    let text: string;
    try {
      text = c.storage_path.endsWith('.gz') ? gunzipSync(raw).toString('utf8') : Buffer.from(raw).toString('utf8');
    } catch {
      continue;
    }
    let events: { timestamp: number }[] = [];
    try {
      events = JSON.parse(text);
    } catch {
      continue;
    }
    const s = sessions.get(c.session_id) || { events: [], started: c.started_at };
    s.events.push(...events);
    sessions.set(c.session_id, s);
  }
  const out = [...sessions].map(([session, s]) => ({
    session,
    started: s.started,
    events: s.events.sort((a, b) => a.timestamp - b.timestamp),
  }));
  return NextResponse.json({ sessions: out });
}
