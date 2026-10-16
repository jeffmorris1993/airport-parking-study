import { NextResponse } from 'next/server';
import { getStore } from '@/lib/server/store';
import { resumeToken, setParticipantCookie } from '@/lib/server/session';
import { timingSafeEqual } from 'node:crypto';

export const dynamic = 'force-dynamic';

/** /resume?c=P-XXXXX&k=<token> lets a participant continue on another device. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = (url.searchParams.get('c') || '').toUpperCase();
  const key = url.searchParams.get('k') || '';
  const home = new URL('/', url);
  const expected = Buffer.from(resumeToken(code));
  const got = Buffer.from(key);
  if (!code || expected.length !== got.length || !timingSafeEqual(expected, got)) return NextResponse.redirect(home);
  const p = await getStore().getParticipantByCode(code);
  if (p) await setParticipantCookie(p.id);
  home.searchParams.set('resume', '1');
  return NextResponse.redirect(home);
}
