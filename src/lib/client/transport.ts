'use client';

import { STUDY } from '@config/study';

export type OutEvent = {
  session_id: string;
  seq: number;
  client_ts: string;
  journey?: string | null;
  step_id?: string | null;
  screen_id?: string | null;
  type: string;
  element_id?: string | null;
  label?: string | null;
  x?: number | null;
  y?: number | null;
  doc_w?: number | null;
  doc_h?: number | null;
  vw?: number | null;
  vh?: number | null;
  meta?: Record<string, unknown> | null;
};

export type OutResponse = {
  phase: 'screener' | 'survey' | 'checkpoint' | 'behavior' | 'wrapup';
  question_id: string;
  journey: string;
  step_id?: string | null;
  value: unknown;
  ms_to_answer?: number | null;
  change_count: number;
  answered_at: string;
};

export type OutPatch = Record<string, unknown>;

const PENDING_KEY = 'ms_pending_v1';
const MAX_BATCH = 400;

/**
 * Queues everything the participant does and ships it to /api/ingest in batches.
 * Unsent data is mirrored to localStorage so a crash or closed tab loses little.
 */
class Transport {
  private events: OutEvent[] = [];
  private responses = new Map<string, OutResponse>();
  private patch: OutPatch = {};
  private timer: ReturnType<typeof setInterval> | null = null;
  private inflight = false;
  enabled = false;

  start() {
    if (this.timer || typeof window === 'undefined') return;
    this.restore();
    this.enabled = true;
    this.timer = setInterval(() => void this.flush(), STUDY.tracking.flushMs);
    const onHide = () => this.flush(true);
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') onHide();
    });
  }

  event(e: OutEvent) {
    this.events.push(e);
    if (this.events.length >= MAX_BATCH) void this.flush();
    else this.persist();
  }

  response(r: OutResponse) {
    this.responses.set(`${r.question_id}|${r.journey}`, r);
    this.persist();
  }

  update(p: OutPatch) {
    Object.assign(this.patch, p);
    this.persist();
  }

  /** Flush now and wait (used before navigation-like transitions). */
  async flushNow() {
    await this.flush();
  }

  private body() {
    const events = this.events.splice(0, MAX_BATCH);
    const responses = [...this.responses.values()];
    this.responses.clear();
    const patch = this.patch;
    this.patch = {};
    const payload: Record<string, unknown> = {};
    if (events.length) payload.events = events;
    if (responses.length) payload.responses = responses;
    if (Object.keys(patch).length) payload.patch = patch;
    return { payload, events, responses, patch };
  }

  private requeue(events: OutEvent[], responses: OutResponse[], patch: OutPatch) {
    this.events.unshift(...events);
    for (const r of responses) {
      const k = `${r.question_id}|${r.journey}`;
      if (!this.responses.has(k)) this.responses.set(k, r);
    }
    this.patch = { ...patch, ...this.patch };
    this.persist();
  }

  async flush(beacon = false) {
    if (!this.enabled || (this.inflight && !beacon)) return;
    const { payload, events, responses, patch } = this.body();
    if (!Object.keys(payload).length) return;
    const json = JSON.stringify(payload);
    if (beacon && navigator.sendBeacon) {
      const ok = navigator.sendBeacon('/api/ingest', new Blob([json], { type: 'text/plain' }));
      if (!ok) this.requeue(events, responses, patch);
      else this.persist();
      return;
    }
    this.inflight = true;
    try {
      const res = await fetch('/api/ingest', {
        method: 'POST',
        body: json,
        headers: { 'content-type': 'application/json' },
        keepalive: json.length < 60_000,
        credentials: 'same-origin',
      });
      if (!res.ok && res.status !== 400) this.requeue(events, responses, patch);
      else this.persist();
    } catch {
      this.requeue(events, responses, patch);
    } finally {
      this.inflight = false;
    }
    if (this.events.length) void this.flush();
  }

  private persist() {
    try {
      localStorage.setItem(
        PENDING_KEY,
        JSON.stringify({ e: this.events.slice(-2000), r: [...this.responses.values()], p: this.patch }),
      );
    } catch {
      /* storage full or blocked: data still goes out on the next flush */
    }
  }

  private restore() {
    try {
      const raw = localStorage.getItem(PENDING_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as { e?: OutEvent[]; r?: OutResponse[]; p?: OutPatch };
      if (d.e) this.events.push(...d.e);
      for (const r of d.r || []) this.responses.set(`${r.question_id}|${r.journey}`, r);
      if (d.p) this.patch = { ...d.p, ...this.patch };
    } catch {
      /* ignore */
    }
  }

  /** Clear the local mirror, e.g. when a new participant starts on a shared device. */
  reset() {
    this.events = [];
    this.responses.clear();
    this.patch = {};
    try {
      localStorage.removeItem(PENDING_KEY);
    } catch {
      /* ignore */
    }
  }
}

export const transport = new Transport();
