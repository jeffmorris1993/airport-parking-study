import { requireAdmin } from '@/lib/server/admin-auth';
import { overview } from '@/lib/server/analytics';
import { AdminShell, BarList, Card, H1, Stat } from '@/components/admin/ui';
import { getStore } from '@/lib/server/store';
import { demoCount } from '@/lib/server/demo';
import { DemoTools } from '@/components/admin/DemoTools';

export const dynamic = 'force-dynamic';

export default async function AdminHome() {
  const email = await requireAdmin();
  const o = await overview();
  const pct = Math.min(100, Math.round((o.qualified / o.target) * 100));
  const local = getStore().kind === 'local';
  const demo = await demoCount();
  return (
    <AdminShell active="/admin" email={email}>
      <H1 sub="Live results from the survey and walkthrough. Numbers update as participants finish each step.">Overview</H1>
      {local && (
        <p className="mb-5 rounded-xl bg-warn-soft px-4 py-3 text-[14px] text-warn">
          Local mode: data is stored in ./.data on this machine, not Supabase.
        </p>
      )}

      <DemoTools count={demo} />

      <div className="mb-6 rounded-2xl border border-line bg-surface p-5 shadow-card">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <div className="text-[13px] font-medium text-ink2">Progress to target</div>
            <div className="mt-1 text-[32px] font-semibold tabular-nums leading-none">
              {o.qualified} <span className="text-[18px] font-medium text-ink3">of {o.target} qualified</span>
            </div>
          </div>
          <div className="text-[14px] tabular-nums text-ink2">{pct}%</div>
        </div>
        <div className="mt-4 h-3 rounded-full bg-line-soft" role="progressbar" aria-valuenow={o.qualified} aria-valuemax={o.target} aria-label="Qualified participants">
          <div className="h-full rounded-[4px] bg-accent" style={{ width: `${pct}%`, minWidth: o.qualified ? 6 : 0 }} />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Started" value={o.total} sub="Accepted consent" />
        <Stat label="Completed" value={o.completed} sub={o.medianMinutes != null ? `Median ${o.medianMinutes} min` : 'No completions yet'} />
        <Stat label="In progress" value={o.inProgress} sub="Active in the last 6 hours" />
        <Stat label="Abandoned" value={o.abandoned} sub="No activity for 6+ hours" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Funnel">
          <BarList rows={o.funnel.map((f) => ({ label: f.label, value: f.value }))} total={o.funnel[0].value} />
        </Card>
        <Card title="Who qualified">
          <BarList
            rows={o.bySegment.map((s) => ({ label: s.label, value: s.value }))}
            total={o.total}
          />
          <p className="mt-4 text-[13px] text-ink3">
            Owner and renter follow the prospectus persona rules. “Both” see both walkthroughs in random order.
          </p>
        </Card>
        <Card title="Why people didn’t qualify">
          <BarList rows={o.reasons} empty="Nobody screened out yet." />
        </Card>
        <Card title="Sign-ups per day (Chicago time)">
          <BarList rows={o.daily.map((d) => ({ label: d.date, value: d.value }))} empty="No sign-ups yet." />
        </Card>
        <Card title="Devices">
          <BarList rows={o.devices} />
        </Card>
        <Card title="Top referrers" right={<span className="text-[12.5px] text-ink3">From each participant’s share link</span>}>
          <BarList rows={o.topReferrers.map((r) => ({ label: r.code, value: r.value }))} empty="No referrals yet." />
        </Card>
      </div>
    </AdminShell>
  );
}
