import { adminEmail } from '@/lib/server/admin-auth';
import { getStore } from '@/lib/server/store';
import { effectiveStatus, segmentOf } from '@/lib/server/analytics';

export const dynamic = 'force-dynamic';

function csv(rows: Record<string, unknown>[], columns?: string[]) {
  const cols = columns || [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cell = (v: unknown) => {
    if (v == null) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    // Neutralize spreadsheet formula injection from participant text.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n');
}

export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  if (!(await adminEmail())) return new Response('Unauthorized', { status: 401 });
  const { kind } = await params;
  const store = getStore();
  const participants = await store.listParticipants();
  const code = new Map(participants.map((p) => [p.id, p.code]));
  let body = '';

  if (kind === 'participants') {
    body = csv(
      participants.map((p) => ({
        code: p.code,
        status: effectiveStatus(p),
        persona: segmentOf(p),
        qualified_owner: p.qualified_owner,
        qualified_renter: p.qualified_renter,
        journey_order: p.journey_order?.join('>') ?? '',
        screen_out_reason: p.screen_out_reason,
        last_step: p.last_step,
        device: p.device,
        viewport: p.viewport_w ? `${p.viewport_w}x${p.viewport_h}` : '',
        timezone: p.timezone,
        ref_code: p.ref_code,
        utm: p.utm,
        consent_at: p.consent_at,
        completed_at: p.completed_at,
        created_at: p.created_at,
      })),
    );
  } else if (kind === 'responses_long') {
    const rs = await store.listResponses();
    body = csv(rs.map((r) => ({ code: code.get(r.participant_id), phase: r.phase, question_id: r.question_id, journey: r.journey, step_id: r.step_id, value: r.value, ms_to_answer: r.ms_to_answer, change_count: r.change_count, answered_at: r.answered_at })));
  } else if (kind === 'responses_wide') {
    const rs = await store.listResponses();
    const by = new Map<string, Record<string, unknown>>();
    for (const p of participants) by.set(p.id, { code: p.code, status: effectiveStatus(p), persona: segmentOf(p), journey_order: p.journey_order?.join('>') ?? '', ref_code: p.ref_code, device: p.device });
    const qcols = new Set<string>();
    for (const r of rs) {
      const k = r.journey ? `${r.question_id}@${r.journey}` : r.question_id;
      qcols.add(k);
      const row = by.get(r.participant_id);
      if (row) row[k] = Array.isArray(r.value) ? r.value.join('; ') : r.value;
    }
    body = csv([...by.values()], ['code', 'status', 'persona', 'journey_order', 'ref_code', 'device', ...[...qcols].sort()]);
  } else if (kind === 'step_metrics') {
    const es = await store.listEvents({ types: ['step_exit'] });
    body = csv(
      es.map((e) => {
        const m = (e.meta || {}) as Record<string, unknown>;
        return { code: code.get(e.participant_id), journey: e.journey, step_id: e.step_id, screen_id: e.screen_id, exited_at: e.client_ts, outcome: m.outcome, duration_ms: m.duration_ms, active_ms: m.active_ms, idle_ms: m.idle_ms, hidden_ms: m.hidden_ms, checkpoint_ms: m.checkpoint_ms, first_interaction_ms: m.first_interaction_ms, clicks: m.clicks, dead_clicks: m.dead_clicks, rage_clicks: m.rage_clicks, blocked_navs: m.blocked_navs, fields_touched: m.fields_touched, max_scroll_pct: m.max_scroll_pct };
      }),
    );
  } else if (kind === 'events') {
    const es = await store.listEvents();
    body = csv(es.map((e) => ({ code: code.get(e.participant_id), session_id: e.session_id, seq: e.seq, client_ts: e.client_ts, journey: e.journey, step_id: e.step_id, screen_id: e.screen_id, type: e.type, element_id: e.element_id, label: e.label, x: e.x, y: e.y, doc_w: e.doc_w, doc_h: e.doc_h, vw: e.vw, vh: e.vh, meta: e.meta })));
  } else if (kind === 'interviews') {
    const cs = await store.listInterviewContacts();
    body = csv(cs.map((c) => ({ code: code.get(c.participant_id), persona: c.persona, name: c.name, email: c.email, phone: c.phone, best_time: c.best_time, created_at: c.created_at })));
  } else {
    return new Response('Unknown export', { status: 404 });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response('﻿' + body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${kind}-${stamp}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
