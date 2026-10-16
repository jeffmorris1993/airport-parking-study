import { requireAdmin } from '@/lib/server/admin-auth';
import { getStore } from '@/lib/server/store';
import { AdminShell, Card, H1, Pill } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';

/** Small deterministic PRNG so a drawn sample can be reproduced from its seed. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
function shuffle<T>(xs: T[], seed: number) {
  const r = rng(seed);
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const STRATA = [
  ['owner', 'Owner only'],
  ['renter', 'Renter only'],
  ['dual', 'Both'],
] as const;

export default async function Interviews({ searchParams }: { searchParams: Promise<{ n?: string; seed?: string }> }) {
  const email = await requireAdmin();
  const sp = await searchParams;
  const store = getStore();
  const [contacts, participants] = await Promise.all([store.listInterviewContacts(), store.listParticipants()]);
  const code = new Map(participants.map((p) => [p.id, p.code]));
  const n = Math.max(1, Math.min(20, Number(sp.n) || 4));
  const seed = Number(sp.seed) || 0;
  const sample = seed
    ? STRATA.flatMap(([k]) => shuffle(contacts.filter((c) => c.persona === k), seed + k.length).slice(0, n))
    : [];
  const picked = new Set(sample.map((c) => c.participant_id));
  return (
    <AdminShell active="/admin/interviews" email={email}>
      <H1 sub="Participants who agreed to a follow-up conversation. Draw a stratified random sample: the same seed always gives the same picks, so the draw can be documented.">
        Interviews
      </H1>
      <Card className="mb-6" title="Draw a sample">
        <form className="flex flex-wrap items-end gap-3" action="/admin/interviews">
          <label className="grid gap-1 text-[13.5px] font-medium">
            Per group
            <input className="field min-h-[42px] w-24 py-2" type="number" name="n" min={1} max={20} defaultValue={n} />
          </label>
          <input type="hidden" name="seed" value={Math.floor(Date.now() / 1000)} />
          <button className="btn-primary min-h-[42px]">Draw new sample</button>
          {seed > 0 && <span className="text-[13px] text-ink3">Seed {seed} · {sample.length} picked</span>}
        </form>
        <div className="mt-4 flex flex-wrap gap-2 text-[13px]">
          {STRATA.map(([k, l]) => (
            <Pill key={k}>{l}: {contacts.filter((c) => c.persona === k).length} opted in</Pill>
          ))}
        </div>
      </Card>
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
        <table className="w-full min-w-[760px] text-left text-[13.5px]">
          <thead className="text-[12px] uppercase tracking-[0.8px] text-ink3">
            <tr className="border-b border-line">
              {['', 'Code', 'Persona', 'Name', 'Email', 'Phone', 'Best time', 'Opted in'].map((h) => (
                <th key={h} className="px-4 py-3 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...contacts].sort((a, b) => Number(picked.has(b.participant_id)) - Number(picked.has(a.participant_id))).map((c) => (
              <tr key={c.participant_id} className={`border-b border-line-soft ${picked.has(c.participant_id) ? 'bg-accent-soft/50' : ''}`}>
                <td className="px-4 py-2.5">{picked.has(c.participant_id) && <Pill tone="good">Picked</Pill>}</td>
                <td className="px-4 py-2.5 font-mono">
                  <a className="text-accent hover:underline" href={`/admin/participants/${c.participant_id}`}>{code.get(c.participant_id)}</a>
                </td>
                <td className="px-4 py-2.5">{STRATA.find(([k]) => k === c.persona)?.[1] ?? c.persona}</td>
                <td className="px-4 py-2.5">{c.name}</td>
                <td className="px-4 py-2.5">{c.email || '—'}</td>
                <td className="px-4 py-2.5">{c.phone || '—'}</td>
                <td className="px-4 py-2.5 text-ink2">{c.best_time || '—'}</td>
                <td className="px-4 py-2.5 tabular-nums text-ink2">{new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
              </tr>
            ))}
            {!contacts.length && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-ink3">Nobody has opted in yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
