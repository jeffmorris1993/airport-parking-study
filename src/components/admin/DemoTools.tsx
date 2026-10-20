'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function DemoTools({ count }: { count: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<'add' | 'delete' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const run = async (kind: 'add' | 'delete') => {
    if (kind === 'delete' && !confirm(`Delete all ${count} demo participants? Real participants are not touched.`)) return;
    setBusy(kind);
    setMsg(null);
    const r = await fetch('/admin/api/demo', {
      method: kind === 'add' ? 'POST' : 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: kind === 'add' ? JSON.stringify({ count: 100 }) : undefined,
    });
    const d = await r.json().catch(() => ({}));
    setBusy(null);
    setMsg(r.ok ? (kind === 'add' ? `Added ${d.participants} demo participants.` : `Deleted ${d.deleted} demo participants.`) : 'Something went wrong. Try again.');
    router.refresh();
  };
  return (
    <div className={`mb-6 rounded-2xl border p-5 ${count ? 'border-[#f0d9a8] bg-warn-soft' : 'border-line bg-surface shadow-card'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-[720px]">
          <h2 className="text-[15.5px] font-semibold">{count ? `Showing ${count} demo participants` : 'Demo data'}</h2>
          <p className="mt-1 text-[14px] text-ink2">
            {count
              ? 'Every chart and table includes them. Their codes start with D-. Delete them before the study goes live on Nov 1.'
              : 'Add 100 made-up participants to preview the dashboards. Their codes start with D- and one click removes them all.'}
          </p>
          {msg && <p className="mt-2 text-[13.5px] font-medium text-ink">{msg}</p>}
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost min-h-[44px] border border-line bg-surface" disabled={!!busy} onClick={() => run('add')}>
            {busy === 'add' ? 'Adding… (about a minute)' : 'Add 100 demo participants'}
          </button>
          {count > 0 && (
            <button className="min-h-[44px] rounded-[14px] bg-danger px-4 text-[14.5px] font-semibold text-white disabled:opacity-40" disabled={!!busy} onClick={() => run('delete')}>
              {busy === 'delete' ? 'Deleting…' : 'Delete all demo data'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
