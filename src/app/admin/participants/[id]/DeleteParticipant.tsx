'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function DeleteParticipant({ id, code }: { id: string; code: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const del = async () => {
    setBusy(true);
    setError(null);
    const r = await fetch(`/admin/api/participants/${id}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: typed.trim() }),
    });
    if (r.ok) {
      router.push('/admin/participants');
      router.refresh();
    } else {
      setBusy(false);
      setError('Couldn’t delete. Check the code and try again.');
    }
  };
  if (!open)
    return (
      <button className="rounded-lg px-3 py-2 text-[13.5px] font-semibold text-danger hover:bg-[#fbe3e1]" onClick={() => setOpen(true)}>
        Delete participant
      </button>
    );
  return (
    <div className="rounded-2xl border border-[#f2c4c0] bg-[#fdf3f2] p-4">
      <p className="text-[14px] text-ink">
        This permanently removes <b className="font-mono">{code}</b>: answers, events, replays, and any interview contact details. Type the code to confirm.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input className="field max-w-[180px] font-mono" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={code} aria-label="Participant code" />
        <button className="rounded-xl bg-danger px-4 py-3 text-[14px] font-semibold text-white disabled:opacity-40" disabled={busy || typed.trim().toUpperCase() !== code} onClick={del}>
          {busy ? 'Deleting…' : 'Delete permanently'}
        </button>
        <button className="btn-ghost min-h-[44px]" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {error && <p className="mt-2 text-[13.5px] text-danger">{error}</p>}
    </div>
  );
}
