'use client';

import { STUDY } from '@config/study';
import { tracker } from './tracker';

/**
 * Session replay with rrweb. Recording runs on the study shell; rrweb follows
 * the same-origin prototype iframes automatically. All inputs are masked, and
 * anything inside .rr-block (the interview contact form) is never recorded.
 */

type RrEvent = { type: number; timestamp: number; data?: unknown };

let stopFn: (() => void) | undefined;
let buffer: RrEvent[] = [];
let idx = 0;
let chunkStart = new Date().toISOString();
let timer: ReturnType<typeof setInterval> | null = null;

async function gzip(text: string): Promise<{ body: BodyInit; gz: boolean }> {
  if (typeof CompressionStream === 'undefined') return { body: text, gz: false };
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return { body: await new Response(stream).blob(), gz: true };
}

function idxKey() {
  return `ms_replay_idx_${tracker.session}`;
}

async function flush(useBeacon = false) {
  if (!buffer.length) return;
  const events = buffer;
  buffer = [];
  const i = idx++;
  try {
    sessionStorage.setItem(idxKey(), String(idx));
  } catch {
    /* ignore */
  }
  const startedAt = chunkStart;
  chunkStart = new Date().toISOString();
  const text = JSON.stringify(events);
  const qs = (gz: boolean) =>
    `/api/replay?s=${encodeURIComponent(tracker.session)}&i=${i}&t=${encodeURIComponent(startedAt)}&gz=${gz ? 1 : 0}`;
  if (useBeacon && navigator.sendBeacon) {
    // Beacons must be synchronous, so they go uncompressed.
    navigator.sendBeacon(qs(false), new Blob([text], { type: 'application/octet-stream' }));
    return;
  }
  try {
    const { body, gz } = await gzip(text);
    await fetch(qs(gz), { method: 'POST', body, credentials: 'same-origin', keepalive: false });
  } catch {
    /* a lost chunk only leaves a gap in the replay */
  }
}

export async function startReplay() {
  if (stopFn || typeof window === 'undefined') return;
  try {
    idx = Number(sessionStorage.getItem(idxKey()) || '0');
  } catch {
    idx = 0;
  }
  const { record } = await import('rrweb');
  stopFn = record({
    emit(event) {
      buffer.push(event as RrEvent);
      if (buffer.length >= 1500) void flush();
    },
    maskAllInputs: true,
    blockClass: 'rr-block',
    inlineStylesheet: true,
    recordCanvas: false,
    collectFonts: false,
    sampling: { mousemove: 50, scroll: 150, input: 'last', media: 800 },
    checkoutEveryNms: 5 * 60_000,
  }) as (() => void) | undefined;

  timer = setInterval(() => void flush(), STUDY.tracking.replayFlushMs);
  window.addEventListener('pagehide', () => void flush(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush(true);
  });
}

export function stopReplay() {
  stopFn?.();
  stopFn = undefined;
  if (timer) clearInterval(timer);
  timer = null;
  void flush();
}

export const replayFlush = () => flush();
