'use client';

import { useEffect, useRef, useState } from 'react';
import 'rrweb-player/dist/style.css';

type Session = { session: string; started: string; events: { timestamp: number }[] };

export function ReplayPlayer({ participantId }: { participantId: string }) {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/admin/api/replay/${participantId}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setSessions(d.sessions || []))
      .catch(() => setSessions([]));
  }, [participantId]);

  useEffect(() => {
    const el = box.current;
    const s = sessions?.[active];
    if (!el || !s || s.events.length < 2) return;
    let player: { $destroy?: () => void } | null = null;
    let cancelled = false;
    import('rrweb-player').then(({ default: RRWebPlayer }) => {
      if (cancelled) return;
      el.innerHTML = '';
      const width = Math.min(el.clientWidth || 900, 1100);
      player = new RRWebPlayer({
        target: el,
        props: { events: s.events as never, width, height: Math.round(width * 0.6), autoPlay: false, skipInactive: true, showController: true },
      }) as unknown as { $destroy?: () => void };
    });
    return () => {
      cancelled = true;
      player?.$destroy?.();
    };
  }, [sessions, active]);

  if (!sessions) return <p className="text-[14px] text-ink3">Loading replay…</p>;
  if (!sessions.length) return <p className="text-[14px] text-ink3">No replay recorded.</p>;
  return (
    <div>
      {sessions.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {sessions.map((s, i) => (
            <button key={s.session} onClick={() => setActive(i)} aria-pressed={active === i} className={`rounded-lg px-3 py-1.5 text-[13px] font-medium ${active === i ? 'bg-accent-soft text-accent-dark' : 'text-ink2 hover:bg-surface2'}`}>
              Session {i + 1} · {new Date(s.started).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </button>
          ))}
        </div>
      )}
      <div ref={box} className="overflow-hidden rounded-xl bg-surface2" />
    </div>
  );
}
