import { requireAdmin } from '@/lib/server/admin-auth';
import { SEGMENT_LABEL, surveyResults } from '@/lib/server/analytics';
import { AdminShell, BarList, Card, H1, Pill, Quotes, SegmentBars } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';

const SEGS = (['owner', 'renter', 'dual'] as const).map((k) => ({ key: k, label: SEGMENT_LABEL[k] }));

export default async function Survey({ searchParams }: { searchParams: Promise<{ split?: string }> }) {
  const email = await requireAdmin();
  const { split } = await searchParams;
  const bySeg = split === 'persona';
  const qs = await surveyResults();
  return (
    <AdminShell active="/admin/survey" email={email}>
      <H1 sub="Screener and baseline survey answers. Questions marked Added aren’t in the prospectus; they fill its measurement gaps.">Survey</H1>
      <div className="mb-5 flex gap-2 text-[14px]">
        <a href="/admin/survey" className={`rounded-lg px-3 py-2 font-medium ${!bySeg ? 'bg-accent-soft text-accent-dark' : 'text-ink2 hover:bg-surface2'}`}>All respondents</a>
        <a href="/admin/survey?split=persona" className={`rounded-lg px-3 py-2 font-medium ${bySeg ? 'bg-accent-soft text-accent-dark' : 'text-ink2 hover:bg-surface2'}`}>Split by persona</a>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {qs.map((q) => (
          <Card
            key={q.id}
            className={q.id === 'q8_wtp' ? 'lg:col-span-2' : ''}
            title={
              <>
                <span className="mr-2 text-[12px] font-bold uppercase tracking-[1px] text-ink3">{q.phase}</span>
                {q.prompt}
              </>
            }
            right={
              <div className="flex shrink-0 items-center gap-2">
                {q.added && <Pill>Added</Pill>}
                <span className="text-[12.5px] tabular-nums text-ink3">n={q.n}</span>
              </div>
            }
          >
            {q.type === 'text' ? (
              <Quotes items={q.texts.map((t) => ({ text: t.text, who: SEGMENT_LABEL[t.segment], href: `/admin/participants/${t.pid}` }))} />
            ) : bySeg ? (
              <SegmentBars rows={q.dist.map((d) => ({ label: d.label, bySegment: d.bySegment }))} segments={SEGS} />
            ) : (
              <BarList rows={q.dist.map((d) => ({ label: d.label, value: d.count }))} total={q.type === 'multi' || q.type === 'airports' ? q.n : undefined} />
            )}
            {q.type !== 'text' && q.texts.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 text-[13px] font-semibold text-ink2">“Other” answers</div>
                <Quotes items={q.texts.map((t) => ({ text: t.text }))} />
              </div>
            )}
          </Card>
        ))}
      </div>
    </AdminShell>
  );
}
