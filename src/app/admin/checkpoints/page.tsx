import { requireAdmin } from '@/lib/server/admin-auth';
import { checkpointResults, fmtMs, SEGMENT_LABEL, type Segment } from '@/lib/server/analytics';
import { AdminShell, BarList, Card, H1, Quotes, SEG_COLOR } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';

type Part = {
  journey: string;
  n: number;
  dist: { label: string; count: number }[];
  texts: { text: string; segment: Segment; pid: string }[];
  mean: number | null;
  median: number | null;
  followDist: { label: string; count: number }[] | null;
  followTexts: { text: string; segment: Segment; pid: string }[];
  medianMs: number | null;
};

export default async function Checkpoints() {
  const email = await requireAdmin();
  const cps = await checkpointResults();
  return (
    <AdminShell active="/admin/checkpoints" email={email}>
      <H1 sub="The 10 in-the-moment questions from the prospectus, plus the added earnings questions. Questions asked in both journeys are shown per journey.">
        Checkpoints
      </H1>
      <div className="grid gap-4">
        {cps.map((cp) => (
          <Card key={cp.id} title={<><span className="mr-2 text-[12px] font-bold uppercase tracking-[1px] text-ink3">{cp.label}</span>{cp.prompt}</>}>
            {cp.parts.length === 0 && <p className="text-[14px] text-ink3">No answers yet.</p>}
            <div className="grid gap-6 lg:grid-cols-2">
              {(cp.parts as Part[]).map((p) => (
                <div key={p.journey || 'all'}>
                  <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink2">
                    {p.journey ? (
                      <span className="flex items-center gap-1.5 font-semibold text-ink">
                        <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: SEG_COLOR[p.journey] }} />
                        {p.journey === 'owner' ? 'Owner journey' : 'Renter journey'}
                      </span>
                    ) : (
                      <span className="font-semibold text-ink">All participants</span>
                    )}
                    <span className="tabular-nums">n={p.n}</span>
                    {p.mean != null && <span className="tabular-nums">Mean {cp.type === 'currency' ? `$${Math.round(p.mean)}` : p.mean.toFixed(2)}{cp.type === 'scale' ? ` of ${cp.max}` : ''}</span>}
                    {p.median != null && <span className="tabular-nums">Median ${p.median}</span>}
                    {p.medianMs != null && <span className="tabular-nums">Answered in {fmtMs(p.medianMs)}</span>}
                  </div>
                  {cp.type === 'text' ? (
                    <Quotes items={p.texts.map((t) => ({ text: t.text, who: SEGMENT_LABEL[t.segment], href: `/admin/participants/${t.pid}` }))} />
                  ) : (
                    <BarList rows={p.dist.map((d) => ({ label: d.label, value: d.count }))} />
                  )}
                  {cp.followPrompt && (p.followDist || p.followTexts.length > 0) && (
                    <div className="mt-4">
                      <div className="mb-2 text-[13px] font-semibold text-ink2">{cp.followPrompt}</div>
                      {p.followDist && <BarList rows={p.followDist.map((d) => ({ label: d.label, value: d.count }))} total={p.n} />}
                      {p.followTexts.length > 0 && (
                        <div className={p.followDist ? 'mt-3' : ''}>
                          <Quotes items={p.followTexts.map((t) => ({ text: t.text, who: SEGMENT_LABEL[t.segment], href: `/admin/participants/${t.pid}` }))} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </AdminShell>
  );
}
