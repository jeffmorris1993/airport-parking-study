import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/server/admin-auth';
import { getStore } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const to = (path: string) => NextResponse.redirect(new URL(path, url));
  if (!code) return to('/admin/login?error=link');
  const sb = await supabaseServer();
  const { data, error } = await sb.auth.exchangeCodeForSession(code);
  if (error || !data.user?.email) return to('/admin/login?error=link');
  if (!(await getStore().isAdminEmail(data.user.email))) {
    await sb.auth.signOut();
    return to('/admin/login?error=not_allowed');
  }
  return to('/admin');
}
