import { NextResponse } from 'next/server';
import { adminEmail } from '@/lib/server/admin-auth';
import { getStore } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

/** Permanently delete one participant (for test runs or a participant's deletion request). */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await adminEmail();
  if (!who) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const { code } = (await req.json().catch(() => ({}))) as { code?: string };
  const store = getStore();
  const p = await store.getParticipant(id);
  if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  // The caller must echo the participant code, so a stray request can't delete the wrong person.
  if (!code || code.toUpperCase() !== p.code) return NextResponse.json({ error: 'code_mismatch' }, { status: 400 });
  await store.deleteParticipant(id);
  console.info(`[admin] ${who} deleted participant ${p.code}`);
  return NextResponse.json({ ok: true });
}
