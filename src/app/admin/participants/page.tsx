import Link from 'next/link';
import { requireAdmin } from '@/lib/server/admin-auth';
import { participantList, SEGMENT_LABEL } from '@/lib/server/analytics';
import { AdminShell, H1, Pill } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<string, 'neutral' | 'good' | 'warn' | 'bad'> = {
  completed: 'good',
  abandoned: 'bad',
  screened_out: 'neutral',
  in_journey: 'warn',
  surveyed: 'warn',
  consented: 'warn',
};
const STATUS_LABEL: Record<string, string> = {
  completed: 'Completed',
  abandoned: 'Abandoned',
  screened_out: 'Screened out',
  in_journey: 'In walkthrough',
  surveyed: 'Finished survey',
  consented: 'In survey',
};

export default async function Participants({ searchParams }: { searchParams: Promise<{ status?: string; segment?: string }> }) {
  const email = await requireAdmin();
  const { status, segment } = await searchParams;
  let rows = await participantList();
  if (status) rows = rows.filter((r) => r.status === status);
  if (segment) rows = rows.filter((r) => r.segment === segment);
  const f = (k: string, v: string, label: string, current?: string) => {
    const on = current === v;
    const params = new URLSearchParams();
    if (k === 'status' ? !on : status) params.set('status', k === 'status' ? v : status!);
    if (k === 'segment' ? !on : segment) params.set('segment', k === 'segment' ? v : segment!);
    return (
      <Link key={v} href={`/admin/participants?${params}`} className={`rounded-lg px-3 py-1.5 text-[13.5px] font-medium ${on ? 'bg-accent-soft text-accent-dark' : 'text-ink2 hover:bg-surface2'}`}>
        {label}
      </Link>
    );
  };
  return (
    <AdminShell active="/admin/participants" email={email}>
      <H1 sub="Everyone who accepted consent. Open a participant to see their answers, a timeline of every action, and the session replay.">Participants</H1>
      <div className="mb-4 flex flex-wrap items-center gap-1">
        {Object.entries(STATUS_LABEL).map(([v, l]) => f('status', v, l, status))}
        <span className="mx-2 h-5 w-px bg-line" />
        {(['owner', 'renter', 'dual', 'not_qualified'] as const).map((v) => f('segment', v, SEGMENT_LABEL[v], segment))}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
        <table className="w-full min-w-[860px] text-left text-[13.5px]">
          <thead className="text-[12px] uppercase tracking-[0.8px] text-ink3">
            <tr className="border-b border-line">
              {['Code', 'Started', 'Status', 'Persona', 'Order', 'Last step', 'Minutes', 'Device', 'Referred by'].map((h) => (
                <th key={h} className="px-4 py-3 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line-soft hover:bg-surface2">
                <td className="px-4 py-2.5 font-mono font-semibold">
                  <Link className="text-accent hover:underline" href={`/admin/participants/${r.id}`}>{r.code}</Link>
                </td>
                <td className="px-4 py-2.5 tabular-nums text-ink2">{new Date(r.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' })}</td>
                <td className="px-4 py-2.5"><Pill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status] || r.status}</Pill></td>
                <td className="px-4 py-2.5">{SEGMENT_LABEL[r.segment]}</td>
                <td className="px-4 py-2.5 text-ink2">{r.order?.join(' → ') || '—'}</td>
                <td className="px-4 py-2.5 font-mono text-[12.5px] text-ink2">{r.last_step || '—'}</td>
                <td className="px-4 py-2.5 tabular-nums">{r.minutes ?? '—'}</td>
                <td className="px-4 py-2.5 text-ink2">{r.device || '—'}</td>
                <td className="px-4 py-2.5 font-mono text-[12.5px] text-ink2">{r.ref || '—'}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-ink3">Nobody here yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
