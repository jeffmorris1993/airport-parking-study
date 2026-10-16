import { requireAdmin } from '@/lib/server/admin-auth';
import { AdminShell, H1 } from '@/components/admin/ui';
import { JOURNEYS } from '@config/journeys';
import { Heatmap } from './Heatmap';

export const dynamic = 'force-dynamic';

export default async function Heatmaps({ searchParams }: { searchParams: Promise<{ screen?: string }> }) {
  const email = await requireAdmin();
  const { screen } = await searchParams;
  const seen = new Set<string>();
  const screens = [...JOURNEYS.owner.steps, ...JOURNEYS.renter.steps]
    .filter((s) => (seen.has(s.screen) ? false : (seen.add(s.screen), true)))
    .map((s) => ({ id: s.screen, title: s.title }));
  return (
    <AdminShell active="/admin/heatmaps" email={email}>
      <H1 sub="Every tap on a screen, drawn over the screen as participants first saw it. Darker means more taps. Dead taps landed on something that isn’t clickable.">
        Heatmaps
      </H1>
      <Heatmap screens={screens} initial={screens.some((s) => s.id === screen) ? screen! : screens[0].id} />
    </AdminShell>
  );
}
