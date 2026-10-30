import { NextResponse } from 'next/server';
import { adminEmail } from '@/lib/server/admin-auth';
import { heatmapData } from '@/lib/server/analytics';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!(await adminEmail())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const u = new URL(req.url);
  const screen = (u.searchParams.get('screen') || '').replace(/[^a-z0-9-]/g, '');
  const l = u.searchParams.get('layout');
  const layout = l === 'desktop' ? 'desktop' : 'phone';
  if (!screen) return NextResponse.json({ error: 'screen required' }, { status: 400 });
  return NextResponse.json(await heatmapData(screen, layout));
}
