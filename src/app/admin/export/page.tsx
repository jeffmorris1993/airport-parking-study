import { requireAdmin } from '@/lib/server/admin-auth';
import { AdminShell, Card, H1 } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';

const FILES = [
  ['responses_wide', 'Answers, one row per participant', 'Every screener, survey, checkpoint, and behavior answer as its own column. Best for spreadsheets and crosstabs.'],
  ['responses_long', 'Answers, one row per answer', 'Includes time to answer and how many times the answer changed. Best for AI coding of open-ended answers.'],
  ['step_metrics', 'Step timings', 'One row per screen visit: outcome, active time, idle time, first tap, taps, dead and rage taps, scroll depth.'],
  ['events', 'All interaction events', 'Every tap, field, change, scroll, navigation and checkpoint event with position and viewport.'],
  ['participants', 'Participants', 'Status, persona, journey order, device, referral, timestamps. No contact details.'],
  ['interviews', 'Interview contacts', 'Names and contact details for people who opted in. Handle with care.'],
] as const;

export default async function Export() {
  const email = await requireAdmin();
  return (
    <AdminShell active="/admin/export" email={email}>
      <H1 sub="CSV downloads of everything collected so far. Participant codes link the files together and to interview notes.">Export</H1>
      <div className="grid gap-4 md:grid-cols-2">
        {FILES.map(([k, t, d]) => (
          <Card key={k} title={t}>
            <p className="mb-4 text-[14px] text-ink2">{d}</p>
            <a className="btn-primary min-h-[44px]" href={`/admin/export/${k}`}>Download {k}.csv</a>
          </Card>
        ))}
      </div>
    </AdminShell>
  );
}
