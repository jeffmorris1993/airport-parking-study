import { redirect } from 'next/navigation';
import { adminEmail, supabaseConfigured } from '@/lib/server/admin-auth';
import { STUDY } from '@config/study';
import { LoginForm } from './LoginForm';

export const dynamic = 'force-dynamic';

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await adminEmail()) redirect('/admin');
  const { error } = await searchParams;
  return (
    <div className="grid min-h-screen place-items-center bg-bg px-5">
      <div className="w-full max-w-[400px] rounded-2xl border border-line bg-surface p-7 shadow-card">
        <h1 className="serif text-[30px] leading-tight">{STUDY.studyTitle}</h1>
        <p className="mt-1 text-[15px] text-ink2">Admin sign-in. We’ll email you a one-time link.</p>
        {error && (
          <p className="mt-4 rounded-lg bg-[#fbe3e1] px-3 py-2 text-[14px] text-danger" role="alert">
            {error === 'not_allowed' ? 'That email isn’t on the admin list.' : 'That sign-in link didn’t work. Request a new one.'}
          </p>
        )}
        {supabaseConfigured() ? (
          <LoginForm url={process.env.NEXT_PUBLIC_SUPABASE_URL!} anon={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!} />
        ) : (
          <p className="mt-5 text-[14px] text-ink2">Supabase isn’t configured. Set the Supabase environment variables to enable sign-in.</p>
        )}
      </div>
    </div>
  );
}
