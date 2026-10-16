'use client';

import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

export function LoginForm({ url, anon }: { url: string; anon: string }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('sending');
    const sb = createBrowserClient(url, anon);
    const { error } = await sb.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/admin/auth/callback`, shouldCreateUser: true },
    });
    setState(error ? 'error' : 'sent');
  };
  if (state === 'sent')
    return <p className="mt-5 rounded-lg bg-accent-soft px-3 py-3 text-[14.5px] text-accent-dark">Check {email} for your sign-in link.</p>;
  return (
    <form onSubmit={send} className="mt-5 grid gap-3">
      <label className="grid gap-1.5 text-[14px] font-semibold">
        Email
        <input className="field font-normal" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <button className="btn-primary" disabled={state === 'sending'}>
        {state === 'sending' ? 'Sending…' : 'Email me a link'}
      </button>
      {state === 'error' && <p className="text-[14px] text-danger">Couldn’t send the link. Try again in a minute.</p>}
    </form>
  );
}
