import Link from 'next/link';
import { requireAdmin } from '@/lib/server/admin-auth';
import { fmtMs, journeyMetrics } from '@/lib/server/analytics';
import { AdminShell, BarList, Card, H1, SEG_COLOR, Stat } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';

export default async function Journey({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const email = await requireAdmin();
  const { order: o } = await searchParams;
  const order = o === 'first' || o === 'second' ? o : 'all';
  const { journeys, behavior } = await journeyMetrics(order);
  const tab = (k: string, label: string) => (
    <Link href={k === 'all' ? '/admin/journey' : `/admin/journey?order=${k}`} className={`rounded-lg px-3 py-2 font-medium ${order === k ? 'bg-accent-soft text-accent-dark' : 'text-ink2 hover:bg-surface2'}`}>
      {label}
    </Link>
  );
  return (
    <AdminShell active="/admin/journey" email={email}>
      <H1 sub="Where people slow down, get stuck, or leave. Time is active time on the screen: idle stretches, hidden tabs, and checkpoint questions are taken out.">
        Journey
      </H1>
      <div className="mb-5 flex flex-wrap gap-2 text-[14px]">
        {tab('all', 'All journeys')}
        {tab('first', 'First journey only')}
        {tab('second', 'Second journey only (dual)')}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Owners who booked parking" value={behavior.ownersBooked} />
        <Stat
          label="Turned on renting"
          value={behavior.ownersBooked ? `${Math.round((behavior.ownersRentOn / behavior.ownersBooked) * 100)}%` : '—'}
          sub={`${behavior.ownersRentOn} of ${behavior.ownersBooked} at booking`}
        />
        <Stat label="Median daily price set" value={behavior.medianPrice != null ? `$${behavior.medianPrice}` : '—'} sub="Owners who turned on renting" />
        <Stat label="Renter requests sent" value={behavior.renterCars.reduce((a, [, n]) => a + n, 0)} />
      </div>

      {journeys.map((j) => (
        <Card key={j.persona} className="mb-6" title={<span className="flex items-center gap-2"><span className="h-3 w-3 rounded-[3px]" style={{ background: SEG_COLOR[j.persona] }} />{j.title} journey</span>}>
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[920px] text-left text-[13.5px]">
              <thead className="text-[12px] uppercase tracking-[0.8px] text-ink3">
                <tr className="border-b border-line">
                  <th className="py-2 pr-3 font-semibold">Step</th>
                  <th className="py-2 pr-3 font-semibold">Reached</th>
                  <th className="py-2 pr-3 font-semibold">Completed</th>
                  <th className="py-2 pr-3 font-semibold">Left here</th>
                  <th className="py-2 pr-3 font-semibold">Median time</th>
                  <th className="py-2 pr-3 font-semibold">90th pct</th>
                  <th className="py-2 pr-3 font-semibold">First tap</th>
                  <th className="py-2 pr-3 font-semibold">Dead / rage</th>
                  <th className="py-2 pr-3 font-semibold">Blocked links</th>
                  <th className="py-2 pr-3 font-semibold">Idle / back</th>
                  <th className="py-2 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {j.rows.map((r, i) => {
                  const rate = r.reached ? r.advanced / r.reached : 0;
                  return (
                    <tr key={r.id} className="border-b border-line-soft align-top">
                      <td className="py-2.5 pr-3">
                        <div className="font-medium">{i + 1}. {r.title}</div>
                        {r.topBlocked.length > 0 && (
                          <div className="mt-0.5 text-[12px] text-ink3">Tried: {r.topBlocked.map(([l, n]) => `${l} (${n})`).join(', ')}</div>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 tabular-nums">{r.reached}</td>
                      <td className="py-2.5 pr-3 tabular-nums">
                        {r.advanced} <span className="text-ink3">{r.reached ? `· ${Math.round(rate * 100)}%` : ''}</span>
                      </td>
                      <td className={`py-2.5 pr-3 tabular-nums ${r.dropped ? 'font-semibold text-danger' : ''}`}>{r.dropped}</td>
                      <td className="py-2.5 pr-3 tabular-nums">{fmtMs(r.medianActiveMs)}</td>
                      <td className="py-2.5 pr-3 tabular-nums text-ink2">{fmtMs(r.p90ActiveMs)}</td>
                      <td className="py-2.5 pr-3 tabular-nums text-ink2">{fmtMs(r.medianFirstMs)}</td>
                      <td className="py-2.5 pr-3 tabular-nums">{r.deadClicks} / {r.rageClicks}</td>
                      <td className="py-2.5 pr-3 tabular-nums">{r.blocked}</td>
                      <td className="py-2.5 pr-3 tabular-nums">{r.idle} / {r.backs}</td>
                      <td className="py-2.5">
                        <Link className="font-medium text-accent hover:underline" href={`/admin/heatmaps?screen=${r.screen}`}>Heatmap</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[12.5px] text-ink3">
            “Left here” counts people who reached a step, never finished it, and haven’t completed the study. In a dual participant’s second journey, the shared first four steps are skipped.
          </p>
        </Card>
      ))}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Cars renters requested">
          <BarList rows={behavior.renterCars.map(([label, value]) => ({ label, value }))} empty="No requests yet." />
        </Card>
        <Card title="Airports chosen for the walkthrough" className="lg:col-span-2" right={<span className="text-[12.5px] text-ink3">Prefilled from the survey; participants can change them</span>}>
          <BarList rows={behavior.tripAirports.map(([label, value]) => ({ label: label.replace(/other:/g, ''), value }))} empty="No walkthroughs started yet." />
        </Card>
        <Card title="Cars owners added">
          <BarList rows={behavior.ownerCars.map(([label, value]) => ({ label, value }))} empty="No vehicles yet." />
        </Card>
      </div>
    </AdminShell>
  );
}
