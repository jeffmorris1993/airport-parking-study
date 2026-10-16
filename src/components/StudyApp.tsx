'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STUDY, airportDisplay, type TripAirport } from '@config/study';
import { AIRPORTS, CHECKPOINTS, airportFromAnswer, type Question } from '@config/questions';
import { JOURNEYS, type Persona } from '@config/journeys';
import type { ParticipantVehicle } from '@config/screen-data';
import { buildPlan, chooseJourneyOrder, personaLabel, qualify, type Answers, type PlanStep } from '@/lib/flow/plan';
import { transport, type OutResponse } from '@/lib/client/transport';
import { tracker } from '@/lib/client/tracker';
import { startReplay } from '@/lib/client/replay';
import { preloadScreens } from '@/lib/client/screens';
import { QuestionInput, isAnswered } from './QuestionInput';
import { ScreenStep } from './ScreenStep';
import type { CheckpointAnswer } from './CheckpointSheet';

type FlowState = {
  v: 1;
  pid: string;
  code: string;
  resume: string;
  cursor: number;
  answers: Answers;
  journeyOrder: Persona[] | null;
  vehicle: ParticipantVehicle | null;
  carry: string;
  cpDone: string[];
  startedAt: string;
  /** Airports the participant chose for each walkthrough (survey answer format: code or "other:Name"). */
  trip?: { from?: string; to?: string; arrive?: string };
};

const KEY = 'ms_flow_v1';

function loadLocal(): FlowState | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    return s?.v === 1 ? (s as FlowState) : null;
  } catch {
    return null;
  }
}
function saveLocal(s: FlowState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode: server copy still lets them resume */
  }
}

/** Checkpoints asked in a shared step (overview, sign-up, ID, security) are asked once. */
const SHARED_CPS = new Set(['cp1', 'cp2', 'cp3', 'cp4']);
const cpKey = (cpId: string, persona: Persona) => (SHARED_CPS.has(cpId) ? cpId : `${cpId}@${persona}`);

export function StudyApp() {
  const [state, setState] = useState<FlowState | null>(null);
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const plateRef = useRef<string | undefined>(undefined);

  /* ---------- boot: resume from this browser or the server ---------- */
  useEffect(() => {
    (async () => {
      const url = new URL(window.location.href);
      if (url.searchParams.get('new') === '1') {
        await fetch('/api/participant', { method: 'DELETE' }).catch(() => undefined);
        localStorage.removeItem(KEY);
        transport.reset();
        url.searchParams.delete('new');
        window.history.replaceState(null, '', url.toString());
      }
      let local = loadLocal();
      try {
        const r = await fetch('/api/participant', { cache: 'no-store' });
        const { participant } = await r.json();
        if (participant) {
          const serverState = participant.state as FlowState | null;
          if (!local || local.pid !== participant.id) local = serverState?.v === 1 ? serverState : null;
          if (local) local = { ...local, pid: participant.id, code: participant.code, resume: participant.resume };
        } else {
          local = null; // no valid cookie: start fresh
        }
      } catch {
        /* offline: carry on with what this browser has */
      }
      if (local) {
        setState(local);
        transport.start();
        void startReplay();
      }
      setBooting(false);
    })();
  }, []);

  const plan = useMemo(() => (state ? buildPlan(state.answers, state.journeyOrder) : buildPlan({}, null)), [state]);
  const cursor = state ? Math.min(state.cursor, plan.length - 1) : 0;
  const current: PlanStep = plan[cursor];

  /* ---------- persistence ---------- */
  const commit = useCallback((next: FlowState, patch: Record<string, unknown> = {}) => {
    saveLocal(next);
    setState(next);
    const p = buildPlan(next.answers, next.journeyOrder);
    const step = p[Math.min(next.cursor, p.length - 1)];
    transport.update({ last_step: step?.id ?? null, state: next, ...patch });
  }, []);

  const go = useCallback(
    (delta: number, patch: Record<string, unknown> = {}, mutate?: (s: FlowState) => FlowState) => {
      setState((prev) => {
        if (!prev) return prev;
        let next = mutate ? mutate(prev) : prev;
        next = { ...next, cursor: Math.max(0, next.cursor + delta) };
        queueMicrotask(() => commit(next, patch));
        return next;
      });
      window.scrollTo(0, 0);
    },
    [commit],
  );

  const jumpTo = useCallback(
    (index: number) => {
      setState((prev) => {
        if (!prev) return prev;
        const next = { ...prev, cursor: index };
        queueMicrotask(() => commit(next));
        return next;
      });
    },
    [commit],
  );

  const respond = (r: Omit<OutResponse, 'answered_at'>) =>
    transport.response({ ...r, answered_at: new Date().toISOString() });

  /* ---------- consent ---------- */
  const consent = async () => {
    setBootError(null);
    const url = new URL(window.location.href);
    const utm: Record<string, string> = {};
    url.searchParams.forEach((v, k) => {
      if (k.startsWith('utm_')) utm[k] = v.slice(0, 120);
    });
    const vw = window.innerWidth;
    try {
      const r = await fetch('/api/participant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          consent: true,
          ref: url.searchParams.get('ref'),
          utm: Object.keys(utm).length ? utm : null,
          device: vw < 640 ? 'mobile' : vw < 1024 ? 'tablet' : 'desktop',
          vw,
          vh: window.innerHeight,
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      if (!r.ok) throw new Error(String(r.status));
      const { participant } = await r.json();
      const s: FlowState = {
        v: 1,
        pid: participant.id,
        code: participant.code,
        resume: participant.resume,
        cursor: 1,
        answers: {},
        journeyOrder: null,
        vehicle: null,
        carry: '',
        cpDone: [],
        startedAt: new Date().toISOString(),
      };
      transport.start();
      void startReplay();
      tracker.emit('consent_given');
      commit(s, { status: 'consented' });
    } catch {
      setBootError('We couldn’t start the study. Check your connection and try again.');
    }
  };

  /* ---------- qualify (runs automatically) ---------- */
  useEffect(() => {
    if (!state || current?.kind !== 'qualify') return;
    const q = qualify(state.answers);
    const order = state.journeyOrder ?? chooseJourneyOrder(q);
    const next: FlowState = { ...state, journeyOrder: order, cursor: state.cursor + 1 };
    tracker.emit('qualified', { meta: { owner: q.owner, renter: q.renter, order } });
    const t = setTimeout(
      () =>
        commit(next, {
          status: order.length ? 'surveyed' : 'screened_out',
          qualified_owner: q.owner,
          qualified_renter: q.renter,
          journey_order: order,
          screen_out_reason: q.reason,
        }),
      900,
    );
    return () => clearTimeout(t);
  }, [state, current, commit]);

  // Under-18 stop and journey completion statuses
  useEffect(() => {
    if (!state || !current) return;
    if (current.kind === 'not_eligible' && state.answers.s_age === 'no') {
      transport.update({ status: 'screened_out', screen_out_reason: 'under_18' });
    }
    if (current.kind === 'done') {
      transport.update({ status: 'completed', completed_at: new Date().toISOString() });
      void transport.flushNow();
    }
  }, [state, current]);

  // Preload the next few screens so transitions feel instant.
  useEffect(() => {
    const ids = plan
      .slice(cursor, cursor + 4)
      .filter((p): p is Extract<PlanStep, { kind: 'screen' }> => p.kind === 'screen')
      .map((p) => p.step.screen);
    preloadScreens(ids);
  }, [plan, cursor]);

  // Context for events fired on the study shell (survey, intros).
  const shellKey = current && current.kind !== 'screen' ? `${current.kind}|${current.id}|${cursor}` : null;
  useEffect(() => {
    if (!shellKey || !current || current.kind === 'screen' || !state) return;
    const journey = current.kind === 'journey_intro' ? current.persona : null;
    tracker.enterStep({ journey, step_id: current.id, screen_id: `shell:${current.kind}` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shellKey, !!state]);

  useEffect(() => {
    const detach = tracker.attach(window);
    return detach;
  }, []);

  if (booting) return <Center>Loading…</Center>;

  if (!state || current.kind === 'consent') return <Consent onAccept={consent} error={bootError} />;

  const screenSteps = plan
    .map((p, i) => ({ p, i }))
    .filter((x): x is { p: Extract<PlanStep, { kind: 'screen' }>; i: number } => x.p.kind === 'screen');

  switch (current.kind) {
    case 'question':
      return (
        <QuestionScreen
          key={current.id}
          step={current}
          value={state.answers[current.q.id]}
          onBack={cursor > 1 ? () => go(-1) : undefined}
          onNext={(value, ms, changes) => {
            respond({ phase: current.phase, question_id: current.q.id, journey: '', step_id: current.id, value, ms_to_answer: ms, change_count: changes });
            tracker.exitStep('advanced');
            go(1, {}, (s) => ({ ...s, answers: { ...s.answers, [current.q.id]: value } }));
          }}
        />
      );

    case 'qualify':
      return <Center>Thanks. One moment…</Center>;

    case 'not_eligible':
      return <NotEligible underage={state.answers.s_age === 'no'} />;

    case 'journey_intro': {
      const j = JOURNEYS[current.persona];
      const persona = current.persona;
      const dest = Array.isArray(state.answers.q3_dest_airports) ? (state.answers.q3_dest_airports as string[])[0] : undefined;
      const home = typeof state.answers.q2_home_airport === 'string' ? state.answers.q2_home_airport : undefined;
      const defaults = {
        from: state.trip?.from ?? home ?? STUDY.airport.code,
        to: state.trip?.to ?? dest ?? '',
        arrive: state.trip?.arrive ?? dest ?? home ?? STUDY.airport.code,
      };
      return (
        <JourneyIntro
          key={current.id}
          persona={persona}
          heading={j.intro.heading}
          body={j.intro.body}
          defaults={defaults}
          label={current.of > 1 ? `Walkthrough ${current.number} of ${current.of} · ${j.title}` : j.title}
          onStart={(trip) => {
            const picked = persona === 'owner' ? { from: trip.from, to: trip.to || null } : { arrive: trip.arrive };
            respond({ phase: 'behavior', question_id: `${persona}.trip_airports`, journey: persona, step_id: current.id, value: picked, ms_to_answer: null, change_count: 0 });
            tracker.exitStep('advanced', { airports: picked });
            go(1, { status: 'in_journey' }, (s) => ({ ...s, trip: { ...s.trip, ...trip } }));
          }}
        />
      );
    }

    case 'screen': {
      const persona = current.persona;
      const inJourney = screenSteps.filter((x) => x.p.persona === persona);
      const n = inJourney.findIndex((x) => x.i === cursor) + 1;
      const earlier = inJourney.filter((x) => x.i < cursor).map((x) => ({ planIndex: x.i, screen: x.p.step.screen }));
      return (
        <ScreenStep
          key={`${current.id}`}
          step={current.step}
          persona={persona}
          earlier={earlier}
          carry={state.carry}
          airport={airportFromAnswer(persona === 'owner' ? state.trip?.from : state.trip?.arrive) ?? airportFromAnswer(STUDY.airport.code)}
          vehicle={state.vehicle ? { ...state.vehicle, plate: plateRef.current } : null}
          progress={{ n, of: inJourney.length }}
          cpDone={(id) => state.cpDone.includes(cpKey(id, persona))}
          onCheckpoint={(cpId, a) => {
            const cp = CHECKPOINTS[cpId];
            const journey = SHARED_CPS.has(cpId) ? '' : persona;
            respond({ phase: 'checkpoint', question_id: cp.main.id, journey, step_id: current.id, value: a.main, ms_to_answer: a.msToAnswer, change_count: a.changes });
            if (cp.followup && a.followup !== undefined && a.followup !== '') {
              respond({ phase: 'checkpoint', question_id: cp.followup.id, journey, step_id: current.id, value: a.followup, ms_to_answer: null, change_count: 0 });
            }
            setState((prev) => {
              if (!prev) return prev;
              const next = { ...prev, cpDone: [...new Set([...prev.cpDone, cpKey(cpId, persona)])] };
              saveLocal(next);
              return next;
            });
          }}
          onBehavior={(key, value) =>
            respond({ phase: 'behavior', question_id: key.slice(0, 64), journey: persona, step_id: current.id, value, ms_to_answer: null, change_count: 0 })
          }
          onVehicle={(v) => {
            plateRef.current = v.plate;
            setState((prev) => (prev ? { ...prev, vehicle: { year: v.year, make: v.make, model: v.model, color: v.color } } : prev));
          }}
          onCarry={(q) => setState((prev) => (prev ? { ...prev, carry: q } : prev))}
          onAdvance={() => go(1)}
          onBack={(i) => jumpTo(i)}
        />
      );
    }

    case 'interview':
      return (
        <Interview
          persona={personaLabel(state.journeyOrder)}
          onDone={(contact) => {
            if (contact) {
              void fetch('/api/ingest', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ interview: { ...contact, persona: personaLabel(state.journeyOrder) } }),
              });
            }
            respond({ phase: 'wrapup', question_id: 'interview_opt_in', journey: '', step_id: 'interview', value: !!contact, ms_to_answer: null, change_count: 0 });
            tracker.exitStep('advanced');
            go(1);
          }}
        />
      );

    case 'done':
      return <Done code={state.code} />;
  }
}

/* ================================================================== */
/* Shell pieces                                                        */
/* ================================================================== */

function Center({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-[100dvh] place-items-center p-6 text-center text-[17px] text-ink2">{children}</div>;
}

function Page({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-[560px] flex-col px-5 pb-6 pt-6 md:pt-14">
      <div className="mb-8 flex items-center justify-between">
        <span className="serif text-[22px] leading-none">{STUDY.studyTitle}</span>
      </div>
      <main className="flex-1">{children}</main>
      {footer && <div className="sticky bottom-0 -mx-5 mt-8 bg-bg/95 px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 backdrop-blur">{footer}</div>}
    </div>
  );
}

function Consent({ onAccept, error }: { onAccept: () => void; error: string | null }) {
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Page
      footer={
        <>
          {error && <p className="mb-3 text-[14.5px] text-danger" role="alert">{error}</p>}
          <button
            className="btn-primary w-full"
            disabled={!agree || busy}
            data-track="consent-start"
            onClick={async () => {
              setBusy(true);
              await onAccept();
              setBusy(false);
            }}
          >
            {busy ? 'Starting…' : 'Start the study'}
          </button>
        </>
      }
    >
      <p className="mb-3 text-[12.5px] font-bold uppercase tracking-[1.4px] text-accent">About {STUDY.estimatedMinutes} minutes</p>
      <h1 className="serif text-[40px] leading-[1.05]">Help shape a new way to travel</h1>
      <p className="mt-4 text-[17px] leading-relaxed text-ink2">
        We’re researching how people get to the airport and what they do with their car while they’re away. You’ll answer a few
        questions, then try out an early version of an app and tell us what you think.
      </p>
      <div className="mt-7 rounded-2xl border border-line bg-surface p-5 shadow-card">
        <h2 className="text-[16px] font-semibold">Before you start</h2>
        <ul className="mt-3 grid gap-3 text-[15px] leading-relaxed text-ink2">
          <li><b className="text-ink">Nothing is real.</b> No payments, ID checks, or bookings happen. Made-up details are fine wherever you’re asked to type.</li>
          <li><b className="text-ink">We record how you use the app</b>, like taps, scrolling, and time on each screen, plus a replay of the session. What you type in text fields is hidden from the replay.</li>
          <li><b className="text-ink">Your answers are used for research only</b> and reported in summary. You can stop at any time.</li>
          <li>You must be 18 or older to take part.</li>
        </ul>
        <p className="mt-4 text-[14px] text-ink3">Questions? Email {STUDY.contactEmail}.</p>
      </div>
      <label className="mt-6 flex cursor-pointer items-start gap-3 text-[15.5px]">
        <input type="checkbox" className="mt-1 h-5 w-5 accent-[#1d6b5f]" checked={agree} onChange={(e) => setAgree(e.target.checked)} data-track="consent-checkbox" />
        <span>I understand and agree to take part.</span>
      </label>
    </Page>
  );
}

function QuestionScreen({
  step,
  value: initial,
  onNext,
  onBack,
}: {
  step: Extract<PlanStep, { kind: 'question' }>;
  value: unknown;
  onNext: (value: unknown, ms: number, changes: number) => void;
  onBack?: () => void;
}) {
  const [value, setValue] = useState<unknown>(initial);
  const shown = useRef(Date.now());
  const changes = useRef(0);
  const q: Question = step.q;
  const ready = isAnswered(q, value);
  const pct = Math.round(((step.index + 1) / step.total) * 100);
  return (
    <Page
      footer={
        <div className="flex items-center gap-2">
          {onBack && (
            <button className="btn-ghost" onClick={onBack} data-track="question-back">
              Back
            </button>
          )}
          <button className="btn-primary flex-1" disabled={!ready} onClick={() => onNext(value, Date.now() - shown.current, changes.current)} data-track={`question-next:${q.id}`}>
            Next
          </button>
        </div>
      }
    >
      <div className="mb-6" aria-hidden="true">
        <div className="h-1.5 overflow-hidden rounded-full bg-line-soft">
          <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-[13px] tabular-nums text-ink3">
          Question {step.index + 1} of {step.total}
        </p>
      </div>
      <h1 className="text-[23px] font-semibold leading-snug tracking-[-0.3px]">{q.prompt}</h1>
      {q.help && <p className="mt-2 text-[15px] text-ink2">{q.help}</p>}
      <div className="mt-6">
        <QuestionInput
          q={q}
          value={value}
          onChange={(v) => {
            if (value !== undefined) changes.current++;
            setValue(v);
          }}
        />
      </div>
    </Page>
  );
}

type Trip = { from: string; to: string; arrive: string };

function airportLabel(v: string) {
  const a = airportFromAnswer(v);
  return a ? airportDisplay(a as TripAirport) : 'your airport';
}

/** Native select: easy on phones, works with screen readers, and keeps any custom airport typed in the survey. */
function AirportSelect({ label, value, onChange, optional, id }: { label: string; value: string; onChange: (v: string) => void; optional?: boolean; id: string }) {
  const sorted = [...AIRPORTS].sort((a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name));
  return (
    <label className="grid gap-1.5 text-[15px] font-semibold" htmlFor={id}>
      {label}
      <select id={id} className="field font-normal" value={value} onChange={(e) => onChange(e.target.value)} data-track={`trip-airport:${id}`}>
        {optional && <option value="">Not sure yet</option>}
        {value.startsWith('other:') && <option value={value}>{value.slice(6)}</option>}
        {sorted.map((a) => (
          <option key={a.code} value={a.code}>
            {a.city} · {a.name} ({a.code})
          </option>
        ))}
      </select>
    </label>
  );
}

function JourneyIntro({
  persona,
  heading,
  body,
  label,
  defaults,
  onStart,
}: {
  persona: Persona;
  heading: string;
  body: string[];
  label: string;
  defaults: Trip;
  onStart: (t: Trip) => void;
}) {
  const [trip, setTrip] = useState<Trip>(defaults);
  const fill = (p: string) =>
    p
      .replace('{from}', airportLabel(trip.from))
      .replace('{to}', trip.to ? ` to ${airportLabel(trip.to)}` : '')
      .replace('{arrive}', airportLabel(trip.arrive));
  return (
    <Page footer={<button className="btn-primary w-full" onClick={() => onStart(trip)} data-track="journey-start">Start the walkthrough</button>}>
      <p className="mb-3 text-[12.5px] font-bold uppercase tracking-[1.4px] text-accent">{label}</p>
      <h1 className="serif text-[40px] leading-[1.05]">{heading}</h1>
      <div className="mt-6 grid gap-4 rounded-2xl border border-line bg-surface p-5 shadow-card">
        <p className="text-[14.5px] text-ink2">We filled these in from your answers. Change them if you like.</p>
        {persona === 'owner' ? (
          <>
            <AirportSelect id="from" label="Flying out of" value={trip.from} onChange={(v) => setTrip((t) => ({ ...t, from: v }))} />
            <AirportSelect id="to" label="Flying to" optional value={trip.to} onChange={(v) => setTrip((t) => ({ ...t, to: v }))} />
          </>
        ) : (
          <AirportSelect id="arrive" label="Flying into" value={trip.arrive} onChange={(v) => setTrip((t) => ({ ...t, arrive: v }))} />
        )}
      </div>
      <div className="mt-6 grid gap-4 text-[17px] leading-relaxed text-ink2">
        {body.map((p) => (
          <p key={p}>{fill(p)}</p>
        ))}
      </div>
      <div className="mt-7 rounded-2xl border border-line bg-surface p-5 text-[15px] leading-relaxed text-ink2 shadow-card">
        <b className="text-ink">Tips:</b> Your task for each screen is shown at the top. Some links aren’t part of the walkthrough, and that’s
        fine. There are no wrong answers. We’re testing the app, not you.
      </div>
    </Page>
  );
}

function NotEligible({ underage }: { underage: boolean }) {
  return (
    <Page>
      <h1 className="serif text-[40px] leading-[1.05]">Thank you</h1>
      <p className="mt-4 text-[17px] leading-relaxed text-ink2">
        {underage
          ? 'This study is only open to people 18 and older, so we’ll stop here. Thanks for your interest.'
          : 'Your answers are recorded and really help. The next part of the study is for people with a different travel pattern, so you’re all done. Thanks for your time.'}
      </p>
    </Page>
  );
}

function Interview({ persona, onDone }: { persona: string; onDone: (c: { name: string; email: string | null; phone: string | null; best_time: string | null } | null) => void }) {
  const [want, setWant] = useState<boolean | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [best, setBest] = useState('');
  const valid = name.trim() && (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || phone.replace(/\D/g, '').length >= 10);
  void persona;
  return (
    <Page
      footer={
        <button
          className="btn-primary w-full"
          disabled={want === null || (want && !valid)}
          data-track="interview-submit"
          onClick={() => onDone(want ? { name: name.trim(), email: email.trim() || null, phone: phone.trim() || null, best_time: best.trim() || null } : null)}
        >
          {want ? 'Send and finish' : 'Finish'}
        </button>
      }
    >
      <p className="mb-3 text-[12.5px] font-bold uppercase tracking-[1.4px] text-accent">Almost done</p>
      <h1 className="serif text-[38px] leading-[1.05]">Could we talk for 30 minutes?</h1>
      <p className="mt-4 text-[17px] leading-relaxed text-ink2">
        We’re inviting some participants to a short follow-up conversation about their experience. Not everyone who says yes will be contacted.
      </p>
      <div className="mt-6 grid gap-2.5" role="radiogroup" aria-label="Open to a follow-up conversation">
        {[
          [true, 'Yes, I’m open to it'],
          [false, 'No thanks'],
        ].map(([v, l]) => (
          <button key={String(v)} type="button" role="radio" aria-checked={want === v} className="choice" onClick={() => setWant(v as boolean)} data-track={`interview:${v}`}>
            <span className="mark">{want === v && <span className="block h-2 w-2 rounded-full bg-white" />}</span>
            {l as string}
          </button>
        ))}
      </div>
      {want && (
        <div className="rr-block fade-in mt-6 grid gap-4" data-private>
          <label className="grid gap-1.5 text-[15px] font-semibold">
            First name
            <input className="field font-normal" autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </label>
          <label className="grid gap-1.5 text-[15px] font-semibold">
            Email
            <input className="field font-normal" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} />
          </label>
          <label className="grid gap-1.5 text-[15px] font-semibold">
            Phone <span className="text-[13.5px] font-normal text-ink3">Email or phone is fine</span>
            <input className="field font-normal" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} />
          </label>
          <label className="grid gap-1.5 text-[15px] font-semibold">
            Best days or times <span className="text-[13.5px] font-normal text-ink3">Optional</span>
            <input className="field font-normal" value={best} onChange={(e) => setBest(e.target.value)} maxLength={200} placeholder="e.g. weekday evenings" />
          </label>
          <p className="text-[13.5px] text-ink3">Your contact details are stored separately from your answers and used only to schedule the conversation.</p>
        </div>
      )}
    </Page>
  );
}

function Done({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const link = typeof window !== 'undefined' ? `${window.location.origin}/?ref=${encodeURIComponent(code)}` : '';
  const share = async () => {
    tracker.emit('referral_share');
    try {
      if (navigator.share) await navigator.share({ title: STUDY.studyTitle, text: 'I took a short travel study. Want to try it?', url: link });
      else {
        await navigator.clipboard.writeText(link);
        setCopied(true);
      }
    } catch {
      /* dismissed */
    }
  };
  return (
    <Page>
      <p className="mb-3 text-[12.5px] font-bold uppercase tracking-[1.4px] text-accent">All done</p>
      <h1 className="serif text-[42px] leading-[1.05]">Thank you!</h1>
      <p className="mt-4 text-[17px] leading-relaxed text-ink2">Your answers are saved. This really helps us build something travelers actually want.</p>
      <div className="mt-7 rounded-2xl border border-line bg-surface p-5 shadow-card">
        <h2 className="text-[16px] font-semibold">Know someone who flies?</h2>
        <p className="mt-1.5 text-[15px] leading-relaxed text-ink2">Share the study with a friend. Your personal link:</p>
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-surface2 p-3 font-mono text-[13.5px] break-all">{link}</div>
        <button className="btn-primary mt-4 w-full" onClick={share} data-track="referral-share">
          {copied ? 'Link copied' : 'Share the study'}
        </button>
      </div>
      <p className="mt-6 text-[14px] text-ink3">Your participant code: <b className="font-mono text-ink2">{code}</b></p>
    </Page>
  );
}
