import { NextResponse } from 'next/server';
import { adminEmail } from '@/lib/server/admin-auth';
import { deleteDemo, generateDemo } from '@/lib/server/demo';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Add demo participants (codes start with D-) so the dashboards have something to show. */
export async function POST(req: Request) {
  const who = await adminEmail();
  if (!who) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { count } = (await req.json().catch(() => ({}))) as { count?: number };
  const n = Math.max(1, Math.min(200, Number(count) || 100));
  const result = await generateDemo(n);
  console.info(`[admin] ${who} generated ${result.participants} demo participants`);
  return NextResponse.json(result);
}

/** Remove every demo participant and nothing else. */
export async function DELETE() {
  const who = await adminEmail();
  if (!who) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const result = await deleteDemo();
  console.info(`[admin] ${who} deleted ${result.deleted} demo participants`);
  return NextResponse.json(result);
}
