import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireAdmin } from '@/lib/server/admin-auth';
import { fmtMs, participantDetail, SEGMENT_LABEL } from '@/lib/server/analytics';
import { AdminShell, Card, H1, Pill } from '@/components/admin/ui';
import { CHECKPOINTS, SCREENER, SURVEY } from '@config/questions';
import { ReplayPlayer } from './ReplayPlayer';
import { DeleteParticipant } from './DeleteParticipant';

export const dynamic = 'force-dynamic';

const PROMPTS: Record<string, string> = Object.fromEntries([
  ...[...SCREENER, ...SURVEY].map((q) => [q.id, q.prompt]),
  ...Object.values(CHECKPOINTS).flatMap((c) => [[c.main.id, c.main.prompt], ...(c.followup ? [[c.followup.id, c.followup.prompt]] : [])]),
]);

const TYPE_LABEL: Record<string, string> = {
  step_enter: 'Opened',
  step_exit: 'Left',
  click: 'Tap',
  dead_click: 'Dead tap',
  rage_click: 'Rage tap',
  field_focus: 'Field focus',
  field_blur: 'Field done',
  change: 'Changed',
  checkpoint_shown: 'Question shown',
  checkpoint_answered: 'Question answered',
  blocked_nav: 'Blocked link',
  nav: 'Navigated',
  signal: 'Screen event',
  pause: 'Paused for question',
  idle_start: 'Went idle',
  idle_end: 'Back from idle',
  tab_hidden: 'Left the tab',
  tab_visible: 'Returned to tab',
  scroll_depth: 'Scrolled',
  screen_loaded: 'Screen loaded',
};

function show(v: unknown): string {
  if (v == null) return '—';
  if (Array.isArray(v)) return v.map(show).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v).replace(/^other:/, 'Other: ');
}

function eventDetail(m: Record<string, unknown> | null, type: string) {
  if (!m) return '';
  if (type === 'step_exit') return `${m.outcome} · active ${fmtMs(Number(m.active_ms))} · ${m.clicks} taps${m.dead_clicks ? ` · ${m.dead_clicks} dead` : ''}${m.max_scroll_pct ? ` · saw ${m.max_scroll_pct}%` : ''}`;
  if (type === 'field_blur') return `${m.field_type} · ${fmtMs(Number(m.focus_ms))}${m.filled ? '' : ' · left empty'}${m.invalid ? ' · invalid' : ''}`;
  if (type === 'change') return m.value !== undefined ? `→ ${show(m.value)}` : String(m.field_type || '');
  if (type === 'checkpoint_answered') return `${m.checkpoint} in ${fmtMs(Number(m.ms))}`;
  if (type === 'checkpoint_shown') return String(m.checkpoint);
  if (type === 'signal' || type === 'pause') return `${m.name}${m.data ? ` ${show(m.data)}` : ''}`;
  if (type === 'nav' || type === 'blocked_nav') return `${m.target}${m.result ? ` (${m.result})` : ''}`;
  if (type === 'idle_end') return fmtMs(Number(m.idle_ms));
  if (type === 'scroll_depth') return `${m.seen_pct}%`;
  return '';
}

export default async function ParticipantPage({ params }: { params: Promise<{ id: string }> }) {
  const email = await requireAdmin();
  const { id } = await params;
  const d = await participantDetail(id);
  if (!d) notFound();
  const { p, responses, events, chunks } = d;
  const t0 = events.length ? new Date(events[0].client_ts).getTime() : 0;
  const skip = new Set(['scroll_depth', 'screen_loaded', 'field_focus']);
  const timeline = events.filter((e) => !skip.has(e.type));
  return (
    <AdminShell active="/admin/participants" email={email}>
      <Link href="/admin/participants" className="mb-3 inline-block text-[14px] font-medium text-ink2 hover:text-ink">← All participants</Link>
      <H1 sub={<>Started {new Date(p.created_at).toLocaleString('en-US', { timeZone: 'America/Chicago' })} · {p.device || 'unknown device'}{p.viewport_w ? ` (${p.viewport_w}×${p.viewport_h})` : ''}{p.ref_code ? ` · referred by ${p.ref_code}` : ''}</>}>
        <span className="font-mono">{p.code}</span>
      </H1>
      <div className="mb-6 flex flex-wrap items-start gap-2">
        <Pill tone={d.status === 'completed' ? 'good' : d.status === 'abandoned' ? 'bad' : 'neutral'}>{d.status.replace('_', ' ')}</Pill>
        <Pill>{SEGMENT_LABEL[d.segment]}</Pill>
        {p.journey_order?.length ? <Pill>Order: {p.journey_order.join(' → ')}</Pill> : null}
        <Pill>{events.length} events</Pill>
        <span className="ml-auto"><DeleteParticipant id={p.id} code={p.code} /></span>
      </div>

      <Card title="Session replay" className="mb-6" right={<span className="text-[12.5px] text-ink3">{chunks.length} chunks · inputs are masked</span>}>
        {chunks.length ? <ReplayPlayer participantId={p.id} /> : <p className="text-[14px] text-ink3">No replay recorded.</p>}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Answers">
          <ul className="grid gap-3">
            {responses.map((r) => (
              <li key={`${r.question_id}|${r.journey}`} className="border-b border-line-soft pb-3 last:border-0">
                <div className="text-[12px] font-semibold uppercase tracking-[0.8px] text-ink3">
                  {r.phase}{r.journey ? ` · ${r.journey}` : ''}{r.ms_to_answer ? ` · ${fmtMs(r.ms_to_answer)}` : ''}{r.change_count ? ` · changed ${r.change_count}×` : ''}
                </div>
                <div className="text-[13.5px] text-ink2">{PROMPTS[r.question_id] || r.question_id}</div>
                <div className="mt-0.5 text-[14.5px] font-medium">{show(r.value)}</div>
              </li>
            ))}
            {!responses.length && <li className="text-[14px] text-ink3">No answers yet.</li>}
          </ul>
        </Card>
        <Card title="Timeline">
          <ol className="grid max-h-[900px] gap-1 overflow-y-auto pr-1 text-[13px]">
            {timeline.map((e) => (
              <li key={`${e.session_id}-${e.seq}`} className={`grid grid-cols-[64px_1fr] gap-2 rounded-lg px-2 py-1.5 ${e.type === 'step_enter' ? 'mt-2 bg-surface2' : ''}`}>
                <span className="tabular-nums text-ink3">{fmtMs(new Date(e.client_ts).getTime() - t0)}</span>
                <span>
                  <b className={e.type === 'dead_click' || e.type === 'rage_click' || e.type === 'blocked_nav' ? 'text-danger' : ''}>{TYPE_LABEL[e.type] || e.type}</b>
                  {e.type === 'step_enter' && <span className="ml-1.5 font-mono text-[12px] text-ink2">{e.step_id}</span>}
                  {e.label && e.type !== 'step_enter' && <span className="ml-1.5 text-ink2">“{e.label}”</span>}
                  <span className="ml-1.5 text-ink3">{eventDetail(e.meta, e.type)}</span>
                </span>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </AdminShell>
  );
}
