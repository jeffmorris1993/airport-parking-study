import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { getStore, localStoreAllowed } from './store';

export function supabaseConfigured() {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function supabaseServer() {
  const jar = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => jar.set(name, value, options));
        } catch {
          /* called from a Server Component; the middleware-less refresh is fine here */
        }
      },
    },
  });
}

/** The signed-in admin's email, or null. Local development needs no login. */
export async function adminEmail(): Promise<string | null> {
  if (!supabaseConfigured()) return localStoreAllowed() ? 'local-dev' : null;
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  const email = data.user?.email;
  if (!email) return null;
  return (await getStore().isAdminEmail(email)) ? email : null;
}

export async function requireAdmin() {
  const email = await adminEmail();
  if (!email) redirect('/admin/login');
  return email;
}
