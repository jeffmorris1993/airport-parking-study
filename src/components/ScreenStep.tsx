'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CHECKPOINTS } from '@config/questions';
import type { Persona, ScreenStep as StepCfg } from '@config/journeys';
import { BROWSE_CARS, planCars, type ParticipantVehicle } from '@config/screen-data';
import type { TripAirport } from '@config/study';
import { tracker } from '@/lib/client/tracker';
import { buildSrcdoc, loadScreen, navSignal } from '@/lib/client/screens';
import { CheckpointSheet, type CheckpointAnswer } from './CheckpointSheet';

declare global {
  interface Window {
    __studyHost?: { bridge: (win: Window) => unknown };
  }
}

export type ScreenStepProps = {
  step: StepCfg;
  persona: Persona;
  /** Earlier steps in the same journey: navigating to one of their screens goes back. */
  earlier: { planIndex: number; screen: string }[];
  carry: string;
  /** The airport this journey happens at (owner: departure, renter: arrival). */
  airport: TripAirport | null;
  vehicle: ParticipantVehicle | null;
  cpDone: (cpId: string) => boolean;
  onCheckpoint: (cpId: string, a: CheckpointAnswer) => void;
  onBehavior: (key: string, value: unknown) => void;
  onVehicle: (v: ParticipantVehicle) => void;
  onCarry: (query: string) => void;
  onAdvance: () => void;
  onBack: (planIndex: number) => void;
  progress: { n: number; of: number };
};

function matches(entry: string, signal: string) {
  if (entry === signal) return true;
  if (!entry.startsWith('nav:')) return false;
  // nav:onboarding matches nav:onboarding and nav:onboarding?x=y; nav:a?b=c needs that exact query prefix.
  return entry.includes('?') ? signal.startsWith(entry) : signal === entry || signal.startsWith(entry + '?');
}

const addDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};
const iso = (d: Date) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};

export function ScreenStep(props: ScreenStepProps) {
  const { step, persona } = props;
  const [srcdoc, setSrcdoc] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [queue, setQueue] = useState<string[]>([]);
  const [queueTotal, setQueueTotal] = useState(0);
  /** Checkpoints the participant closed with the X, to answer later. */
  const [deferred, setDeferred] = useState<{ ids: string[]; done: (() => void) | null } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [taskOpen, setTaskOpen] = useState(true);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const detachRef = useRef<(() => void) | null>(null);
  const advancing = useRef(false);
  const resolvers = useRef<(() => void)[]>([]);
  const afterDone = useRef<(() => void) | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const query = useMemo(() => {
    const parts = [step.query, step.useCarry ? props.carry : ''].filter(Boolean);
    return parts.join('&');
    // carry is read once per step visit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id]);

  /* ---------- checkpoint queue ---------- */

  const openCheckpoints = useCallback((ids: string[], done: () => void) => {
    setDeferred(null);
    const todo = ids.filter((id) => CHECKPOINTS[id] && !propsRef.current.cpDone(id));
    if (!todo.length) {
      done();
      return;
    }
    tracker.checkpointOpen();
    setQueue(todo);
    setQueueTotal(todo.length);
    afterDone.current = done;
  }, []);

  const answer = (a: CheckpointAnswer) => {
    const id = queue[0];
    tracker.emit('checkpoint_answered', { meta: { checkpoint: id, ms: a.msToAnswer, changes: a.changes } });
    propsRef.current.onCheckpoint(id, a);
    const rest = queue.slice(1);
    setQueue(rest);
    if (!rest.length) {
      tracker.checkpointClose();
      const fn = afterDone.current;
      afterDone.current = null;
      fn?.();
    }
  };

  useEffect(() => {
    if (queue[0]) tracker.emit('checkpoint_shown', { meta: { checkpoint: queue[0] } });
  }, [queue]);

  /** Close the sheet without answering; the pending pause/advance waits until they resume. */
  const dismiss = () => {
    tracker.emit('checkpoint_dismissed', { meta: { checkpoint: queue[0], remaining: queue.length } });
    tracker.checkpointClose();
    setDeferred({ ids: queue, done: afterDone.current });
    setQueue([]);
    setQueueTotal(0);
    afterDone.current = null;
  };

  const resume = () => {
    if (!deferred) return;
    const { ids, done } = deferred;
    tracker.emit('checkpoint_resumed', { meta: { remaining: ids.length } });
    openCheckpoints(ids, done ?? (() => undefined));
  };

  /* ---------- advancing / back ---------- */

  const advance = useCallback(
    (via: string) => {
      if (advancing.current) return;
      advancing.current = true;
      const s = propsRef.current.step;
      const finish = () => {
        tracker.exitStep('advanced', { via });
        openCheckpoints(s.after || [], () => propsRef.current.onAdvance());
      };
      if (s.advanceDelayMs) setTimeout(finish, s.advanceDelayMs);
      else finish();
    },
    [openCheckpoints],
  );

  /* ---------- the bridge each screen talks to ---------- */

  useEffect(() => {
    const showToast = (msg: string) => {
      setToast(msg);
      window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 2400);
    };

    window.__studyHost = {
      bridge: () => ({
        signal(name: string, data?: unknown) {
          const p = propsRef.current;
          tracker.emit('signal', { meta: { name, data: data ?? null } });
          if (name === 'vehicle' && data && typeof data === 'object') {
            p.onVehicle(data as ParticipantVehicle);
            const { plate: _plate, ...safe } = data as ParticipantVehicle;
            void _plate;
            p.onBehavior(`${p.step.id}:vehicle`, safe);
          } else if (name !== 'advance') {
            p.onBehavior(`${p.step.id}:${name}`, data ?? true);
          }
          if (p.step.advanceOn.some((e) => matches(e, name))) advance(name);
        },
        nav(href: string, el: Element | null) {
          const p = propsRef.current;
          const { signal, slug, query: q } = navSignal(href);
          const label = el ? ((el as HTMLElement).innerText || el.getAttribute('aria-label') || '').trim().slice(0, 80) : null;
          if (advancing.current) return;
          if (p.step.advanceOn.some((e) => matches(e, signal))) {
            tracker.emit('nav', { label, meta: { target: signal, result: 'advance' } });
            if (q) p.onCarry(q);
            advance(signal);
            return;
          }
          const back = [...p.earlier].reverse().find((e) => e.screen === slug);
          if (back) {
            tracker.emit('nav', { label, meta: { target: signal, result: 'back' } });
            tracker.exitStep('back', { to: slug });
            if (q) p.onCarry(q);
            p.onBack(back.planIndex);
            return;
          }
          tracker.noteBlocked();
          tracker.emit('blocked_nav', { label, element_id: label ? `link:${label}` : null, meta: { target: signal } });
          showToast('That part isn’t included in this walkthrough.');
        },
        pause(name: string, data?: unknown) {
          const p = propsRef.current;
          tracker.emit('pause', { meta: { name, data: data ?? null } });
          p.onBehavior(`${p.step.id}:${name}`, data ?? true);
          const ids = p.step.pauses?.[name] || [];
          return new Promise<void>((resolve) => {
            resolvers.current.push(resolve);
            openCheckpoints(ids, () => {
              const rs = resolvers.current;
              resolvers.current = [];
              rs.forEach((r) => r());
            });
          });
        },
        date: (n: number) => iso(addDays(n)),
        dateLabel: (n: number) => addDays(n).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        planCars: () => planCars(propsRef.current.vehicle),
        car: (i: unknown) => BROWSE_CARS[Math.min(BROWSE_CARS.length - 1, Math.max(0, Number(i) || 0))],
      }),
    };
    return () => {
      delete window.__studyHost;
    };
  }, [advance, openCheckpoints]);

  /* ---------- load the screen ---------- */

  useEffect(() => {
    let alive = true;
    advancing.current = false;
    setQueue([]);
    setQueueTotal(0);
    setDeferred(null);
    setSrcdoc(null);
    setError(false);
    setTaskOpen(true);
    tracker.enterStep({ journey: persona, step_id: step.id, screen_id: step.screen }, { title: step.title, query: query || null });
    loadScreen(step.screen)
      .then((html) => alive && setSrcdoc(buildSrcdoc(html, query, propsRef.current.airport)))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
      detachRef.current?.();
      detachRef.current = null;
    };
  }, [step.id, step.screen, step.title, persona, query]);

  // A participant who leaves mid-screen still gets a step_exit with what we know.
  useEffect(() => {
    const onHide = () => tracker.emit('page_hidden_on_step');
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, []);

  const onLoad = () => {
    const win = frameRef.current?.contentWindow;
    if (!win) return;
    detachRef.current?.();
    try {
      detachRef.current = tracker.attach(win, 'screen');
    } catch {
      /* cross-origin should never happen for srcdoc */
    }
    tracker.emit('screen_loaded', {
      doc_w: win.document.documentElement.scrollWidth,
      doc_h: win.document.documentElement.scrollHeight,
      vw: win.innerWidth,
      vh: win.innerHeight,
    });
  };

  const cp = queue[0] ? CHECKPOINTS[queue[0]] : null;

  return (
    <div className="flex h-[100dvh] flex-col items-center md:justify-center md:gap-4 md:py-4">
      {/* Task instruction */}
      <div className="w-full shrink-0 border-b border-line bg-surface md:max-w-[430px] md:rounded-2xl md:border md:shadow-card">
        <button
          type="button"
          className="flex w-full items-start gap-3 px-4 py-3 text-left"
          aria-expanded={taskOpen}
          onClick={() => setTaskOpen((o) => !o)}
          data-track="task-toggle"
        >
          <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-soft text-[12px] font-bold tabular-nums text-accent-dark">
            {props.progress.n}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11.5px] font-bold uppercase tracking-[1.1px] text-ink3">
              Your task · {props.progress.n} of {props.progress.of}
            </span>
            {taskOpen && <span className="mt-0.5 block text-[15px] font-medium leading-snug text-ink">{step.task}</span>}
          </span>
          <svg className={`mt-1 shrink-0 text-ink3 transition-transform ${taskOpen ? 'rotate-180' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      {/* The prototype, in a phone-sized frame on larger screens */}
      <div className="relative w-full flex-1 overflow-hidden bg-bg md:h-[min(844px,calc(100dvh-140px))] md:w-[390px] md:flex-none md:rounded-[34px] md:border-[10px] md:border-[#0a1a36] md:shadow-[0_24px_60px_rgba(10,26,54,.28)]">
        {srcdoc && (
          <iframe
            key={step.id}
            ref={frameRef}
            title={step.title}
            srcDoc={srcdoc}
            onLoad={onLoad}
            className="absolute inset-0 h-full w-full border-0 bg-bg"
            aria-hidden={!!cp}
          />
        )}
        {!srcdoc && !error && <div className="absolute inset-0 grid place-items-center text-ink3">Loading…</div>}
        {error && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-ink2">
            This screen didn’t load. Check your connection and refresh the page.
          </div>
        )}
        {cp && <CheckpointSheet cp={cp} position={{ n: queueTotal - queue.length + 1, of: queueTotal }} onSubmit={answer} onDismiss={dismiss} />}
        {deferred && !cp && (
          <button
            type="button"
            onClick={resume}
            data-track="checkpoint-resume"
            className="fade-in absolute inset-x-6 bottom-6 z-20 rounded-full bg-ink px-5 py-3 text-center text-[14.5px] font-semibold text-white shadow-lg"
          >
            Answer {deferred.ids.length === 1 ? '1 quick question' : `${deferred.ids.length} quick questions`} to continue
          </button>
        )}
        {toast && (
          <div role="status" className="fade-in pointer-events-none absolute inset-x-4 bottom-24 z-20 rounded-xl bg-ink px-4 py-3 text-center text-[14.5px] text-white shadow-lg">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
