'use client';

import { STUDY } from '@config/study';
import { transport, type OutEvent } from './transport';

export type TrackContext = {
  journey: string | null;
  step_id: string | null;
  screen_id: string | null;
};

type StepStats = {
  ctx: TrackContext;
  enteredAt: number;
  firstInteractionAt: number | null;
  idleMs: number;
  hiddenMs: number;
  idleSince: number | null;
  hiddenSince: number | null;
  checkpointMs: number;
  checkpointSince: number | null;
  clicks: number;
  deadClicks: number;
  rageClicks: number;
  blocked: number;
  fields: number;
  maxScrollPct: number;
};

const INTERACTIVE =
  'a[href],button,input,select,textarea,label,summary,[role="button"],[role="link"],[role="switch"],[role="tab"],[role="radio"],[role="checkbox"],[onclick],[contenteditable="true"]';

/** Input types whose chosen value is safe and useful to log. Free text never is. */
const VALUE_TYPES = new Set(['checkbox', 'radio', 'date', 'time', 'datetime-local', 'range', 'number', 'select-one', 'select-multiple']);

function sessionId() {
  const k = 'ms_session';
  try {
    let s = sessionStorage.getItem(k);
    if (!s) {
      s = crypto.randomUUID();
      sessionStorage.setItem(k, s);
    }
    return s;
  } catch {
    return crypto.randomUUID();
  }
}

/** A stable, human-readable id for an element: data-track > id > aria-label > text, plus a short path. */
export function elementId(el: Element): { id: string; label: string } {
  const h = el as HTMLElement;
  const text = (h.innerText || h.textContent || '').replace(/\s+/g, ' ').trim();
  const label =
    h.getAttribute('data-track') ||
    h.getAttribute('aria-label') ||
    (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) ? fieldLabel(el as HTMLInputElement) : '') ||
    text.slice(0, 80) ||
    h.getAttribute('title') ||
    h.getAttribute('placeholder') ||
    el.tagName.toLowerCase();
  const key =
    h.getAttribute('data-track') ||
    (h.id ? `#${h.id}` : '') ||
    `${cssPath(el)}${text ? `:${text.slice(0, 32)}` : ''}`;
  return { id: key.slice(0, 255), label: label.slice(0, 255) };
}

function fieldLabel(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) {
  if (el.id) {
    const l = el.ownerDocument.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (l) return (l.textContent || '').trim().slice(0, 80);
  }
  const wrap = el.closest('label');
  if (wrap) return (wrap.textContent || '').trim().slice(0, 80);
  return el.getAttribute('aria-label') || el.name || el.id || el.type;
}

function cssPath(el: Element) {
  const parts: string[] = [];
  let cur: Element | null = el;
  for (let i = 0; cur && i < 4 && cur.tagName !== 'BODY'; i++) {
    let p = cur.tagName.toLowerCase();
    if (cur.id) {
      parts.unshift(`${p}#${cur.id}`);
      break;
    }
    const cls = [...cur.classList].filter((c) => !/^(on|off|bad|show|active)$/.test(c)).slice(0, 2);
    if (cls.length) p += '.' + cls.join('.');
    parts.unshift(p);
    cur = cur.parentElement;
  }
  return parts.join('>');
}

/**
 * Captures what a participant does on any document we attach it to (the study
 * shell and each prototype screen iframe), plus per-step timing summaries.
 */
class Tracker {
  readonly session = typeof window !== 'undefined' ? sessionId() : 'ssr';
  private seq = 0;
  private ctx: TrackContext = { journey: null, step_id: null, screen_id: null };
  private step: StepStats | null = null;
  private lastActivity = Date.now();
  private idleTimer: ReturnType<typeof setInterval> | null = null;
  private recentClicks: { t: number; x: number; y: number; id: string }[] = [];
  private globalBound = false;

  setContext(ctx: TrackContext) {
    this.ctx = ctx;
  }

  get context() {
    return this.ctx;
  }

  emit(type: string, extra: Partial<OutEvent> = {}) {
    if (!transport.enabled) return;
    transport.event({
      session_id: this.session,
      seq: this.nextSeq(),
      client_ts: new Date().toISOString(),
      journey: this.ctx.journey,
      step_id: this.ctx.step_id,
      screen_id: this.ctx.screen_id,
      type,
      ...extra,
    });
  }

  private nextSeq() {
    // Sequence survives reloads in the same tab so the server can drop duplicates.
    try {
      const k = 'ms_seq';
      const n = Number(sessionStorage.getItem(k) || '0') + 1;
      sessionStorage.setItem(k, String(n));
      this.seq = n;
    } catch {
      this.seq++;
    }
    return this.seq;
  }

  /* ---------------- step lifecycle ---------------- */

  enterStep(ctx: TrackContext, meta?: Record<string, unknown>) {
    // Re-entering the same step right away (React re-mount) is not a new visit.
    if (this.step && this.step.ctx.step_id === ctx.step_id && Date.now() - this.step.enteredAt < 1500 && !this.step.clicks) return;
    if (this.step) this.exitStep('replaced');
    this.setContext(ctx);
    const now = Date.now();
    this.step = {
      ctx,
      enteredAt: now,
      firstInteractionAt: null,
      idleMs: 0,
      hiddenMs: 0,
      idleSince: null,
      hiddenSince: document.visibilityState === 'hidden' ? now : null,
      checkpointMs: 0,
      checkpointSince: null,
      clicks: 0,
      deadClicks: 0,
      rageClicks: 0,
      blocked: 0,
      fields: 0,
      maxScrollPct: 0,
    };
    this.lastActivity = now;
    this.emit('step_enter', { meta: { ...meta, vw: window.innerWidth, vh: window.innerHeight } });
  }

  exitStep(outcome: 'advanced' | 'back' | 'abandoned' | 'replaced' | 'skipped', meta?: Record<string, unknown>) {
    const s = this.step;
    if (!s) return;
    const now = Date.now();
    if (s.idleSince) s.idleMs += now - s.idleSince;
    if (s.hiddenSince) s.hiddenMs += now - s.hiddenSince;
    if (s.checkpointSince) s.checkpointMs += now - s.checkpointSince;
    const duration = now - s.enteredAt;
    const saved = this.ctx;
    this.ctx = s.ctx;
    this.emit('step_exit', {
      meta: {
        outcome,
        duration_ms: duration,
        active_ms: Math.max(0, duration - s.idleMs - s.hiddenMs - s.checkpointMs),
        checkpoint_ms: s.checkpointMs,
        idle_ms: s.idleMs,
        hidden_ms: s.hiddenMs,
        first_interaction_ms: s.firstInteractionAt ? s.firstInteractionAt - s.enteredAt : null,
        clicks: s.clicks,
        dead_clicks: s.deadClicks,
        rage_clicks: s.rageClicks,
        blocked_navs: s.blocked,
        fields_touched: s.fields,
        max_scroll_pct: s.maxScrollPct,
        ...meta,
      },
    });
    this.ctx = saved;
    this.step = null;
  }

  /** Time spent answering a mid-screen checkpoint doesn't count as time on the screen. */
  checkpointOpen() {
    if (this.step && !this.step.checkpointSince) this.step.checkpointSince = Date.now();
  }

  checkpointClose() {
    const s = this.step;
    if (s?.checkpointSince) {
      s.checkpointMs += Date.now() - s.checkpointSince;
      s.checkpointSince = null;
    }
    this.lastActivity = Date.now();
  }

  noteBlocked() {
    if (this.step) this.step.blocked++;
  }

  private activity() {
    const now = Date.now();
    const s = this.step;
    if (s) {
      if (!s.firstInteractionAt) s.firstInteractionAt = now;
      if (s.idleSince) {
        s.idleMs += now - s.idleSince;
        this.emit('idle_end', { meta: { idle_ms: now - s.idleSince } });
        s.idleSince = null;
      }
    }
    this.lastActivity = now;
  }

  /* ---------------- window-level listeners (once) ---------------- */

  private bindGlobal() {
    if (this.globalBound) return;
    this.globalBound = true;
    this.idleTimer = setInterval(() => {
      const s = this.step;
      if (!s || s.idleSince || s.hiddenSince || s.checkpointSince) return;
      if (Date.now() - this.lastActivity >= STUDY.tracking.idleMs) {
        s.idleSince = this.lastActivity + STUDY.tracking.idleMs;
        this.emit('idle_start');
      }
    }, 2000);
    document.addEventListener('visibilitychange', () => {
      const s = this.step;
      const now = Date.now();
      if (document.visibilityState === 'hidden') {
        if (s && !s.hiddenSince) s.hiddenSince = now;
        this.emit('tab_hidden');
      } else {
        if (s?.hiddenSince) {
          s.hiddenMs += now - s.hiddenSince;
          s.hiddenSince = null;
        }
        this.lastActivity = now;
        this.emit('tab_visible');
      }
    });
    let rt: ReturnType<typeof setTimeout> | undefined;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(
        () => this.emit('resize', { vw: window.innerWidth, vh: window.innerHeight, meta: { orientation: screen.orientation?.type ?? null } }),
        400,
      );
    });
  }

  /* ---------------- per-document listeners ---------------- */

  /** Attach to a document (the shell or a screen iframe). Returns a detach function. */
  /** surface: 'screen' for a prototype iframe, 'shell' for the study app around it. */
  attach(win: Window, surface: 'screen' | 'shell' = 'shell') {
    this.bindGlobal();
    const doc = win.document;
    const ac = new AbortController();
    const o = { capture: true, signal: ac.signal, passive: true } as AddEventListenerOptions;
    const focusAt = new WeakMap<Element, number>();

    const coords = (e: MouseEvent) => ({
      x: Math.round(e.pageX),
      y: Math.round(e.pageY),
      doc_w: doc.documentElement.scrollWidth,
      doc_h: doc.documentElement.scrollHeight,
      vw: win.innerWidth,
      vh: win.innerHeight,
    });

    doc.addEventListener(
      'click',
      (e) => {
        const target = e.target as Element | null;
        if (!target || !(target instanceof (win as unknown as { Element: typeof Element }).Element)) return;
        this.activity();
        const interactive = target.closest(INTERACTIVE);
        const el = interactive || target;
        const { id, label } = elementId(el);
        const c = coords(e);
        const isDead =
          !interactive && win.getComputedStyle(target).cursor !== 'pointer' && !target.closest('[data-track]');
        if (this.step) this.step.clicks++;
        this.emit(isDead ? 'dead_click' : 'click', {
          element_id: id,
          label,
          ...c,
          meta: { tag: el.tagName.toLowerCase(), interactive: !!interactive, surface },
        });
        if (isDead && this.step) this.step.deadClicks++;

        // Rage: N clicks within the window and radius.
        const now = Date.now();
        const t = STUDY.tracking;
        this.recentClicks = this.recentClicks.filter((r) => now - r.t < t.rageWindowMs);
        this.recentClicks.push({ t: now, x: c.x, y: c.y, id });
        const near = this.recentClicks.filter((r) => r.id === id && Math.hypot(r.x - c.x, r.y - c.y) <= t.rageRadiusPx);
        if (near.length === t.rageClicks) {
          if (this.step) this.step.rageClicks++;
          this.emit('rage_click', { element_id: id, label, ...c, meta: { count: near.length, surface } });
        }
      },
      o,
    );

    doc.addEventListener(
      'focusin',
      (e) => {
        const el = e.target as HTMLInputElement;
        if (!el || !/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return;
        this.activity();
        focusAt.set(el, Date.now());
        if (this.step) this.step.fields++;
        const { id, label } = elementId(el);
        this.emit('field_focus', { element_id: id, label, meta: { field_type: el.type || el.tagName.toLowerCase() } });
      },
      o,
    );

    doc.addEventListener(
      'focusout',
      (e) => {
        const el = e.target as HTMLInputElement;
        if (!el || !/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return;
        const started = focusAt.get(el);
        const { id, label } = elementId(el);
        const type = el.type || el.tagName.toLowerCase();
        this.emit('field_blur', {
          element_id: id,
          label,
          meta: {
            field_type: type,
            focus_ms: started ? Date.now() - started : null,
            // Length only, never what was typed.
            length: typeof el.value === 'string' ? el.value.length : null,
            filled: !!el.value,
            invalid: el.getAttribute('aria-invalid') === 'true',
          },
        });
      },
      o,
    );

    doc.addEventListener(
      'change',
      (e) => {
        const el = e.target as HTMLInputElement;
        if (!el || !/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return;
        this.activity();
        const type = el.type || el.tagName.toLowerCase();
        const { id, label } = elementId(el);
        const safe = VALUE_TYPES.has(type) && !el.closest('[data-private]');
        this.emit('change', {
          element_id: id,
          label,
          meta: {
            field_type: type,
            value: safe ? (type === 'checkbox' || type === 'radio' ? el.checked : el.value) : undefined,
            option: safe && type === 'radio' ? el.value : undefined,
          },
        });
      },
      o,
    );

    for (const ev of ['keydown', 'pointerdown', 'touchstart', 'wheel'] as const) {
      doc.addEventListener(ev, () => this.activity(), o);
    }

    let st: ReturnType<typeof setTimeout> | undefined;
    win.addEventListener(
      'scroll',
      () => {
        this.activity();
        clearTimeout(st);
        st = setTimeout(() => {
          const de = doc.documentElement;
          const max = Math.max(1, de.scrollHeight - win.innerHeight);
          const pct = Math.min(100, Math.round(((win.scrollY + 0) / max) * 100));
          const seen = Math.min(100, Math.round(((win.scrollY + win.innerHeight) / de.scrollHeight) * 100));
          if (this.step && seen > this.step.maxScrollPct) {
            this.step.maxScrollPct = seen;
            this.emit('scroll_depth', { meta: { pct, seen_pct: seen, doc_h: de.scrollHeight } });
          }
        }, 300);
      },
      { signal: ac.signal, passive: true },
    );

    win.addEventListener(
      'error',
      (e) => {
        const ev = e as ErrorEvent;
        if (!ev.message) return;
        this.emit('js_error', { meta: { message: String(ev.message).slice(0, 300), source: (ev.filename || '').slice(-80), line: ev.lineno } });
      },
      { signal: ac.signal },
    );

    // Initial scroll depth for screens that fit without scrolling.
    setTimeout(() => {
      try {
        const de = doc.documentElement;
        const seen = Math.min(100, Math.round((win.innerHeight / Math.max(1, de.scrollHeight)) * 100));
        if (this.step && seen > this.step.maxScrollPct) this.step.maxScrollPct = seen;
      } catch {
        /* document went away */
      }
    }, 800);

    return () => ac.abort();
  }
}

export const tracker = new Tracker();
