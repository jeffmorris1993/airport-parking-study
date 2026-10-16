import Link from 'next/link';
import type { ReactNode } from 'react';
import { STUDY } from '@config/study';

/** Persona colors: categorical slots 1–3 of the validated reference palette (all-pairs safe). */
export const SEG_COLOR: Record<string, string> = {
  owner: '#2a78d6',
  renter: '#eb6834',
  dual: '#1baf7a',
};
export const BAR = '#1d6b5f';

const NAV = [
  ['/admin', 'Overview'],
  ['/admin/survey', 'Survey'],
  ['/admin/journey', 'Journey'],
  ['/admin/checkpoints', 'Checkpoints'],
  ['/admin/heatmaps', 'Heatmaps'],
  ['/admin/participants', 'Participants'],
  ['/admin/interviews', 'Interviews'],
  ['/admin/export', 'Export'],
] as const;

export function AdminShell({ active, children, email }: { active: string; children: ReactNode; email: string }) {
  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 md:px-6">
          <Link href="/admin" className="serif text-[21px] leading-none text-ink">
            {STUDY.studyTitle} <span className="font-sans text-[12px] font-semibold uppercase tracking-[1.2px] text-ink3">Admin</span>
          </Link>
          <nav className="-mx-1 flex flex-1 gap-1 overflow-x-auto" aria-label="Admin">
            {NAV.map(([href, label]) => (
              <Link
                key={href}
                href={href}
                aria-current={active === href ? 'page' : undefined}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-[14px] font-medium ${
                  active === href ? 'bg-accent-soft text-accent-dark' : 'text-ink2 hover:bg-surface2 hover:text-ink'
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>
          <span className="hidden text-[13px] text-ink3 lg:inline">{email}</span>
        </div>
      </header>
      <main className="mx-auto max-w-[1240px] px-4 py-6 md:px-6 md:py-8">{children}</main>
    </div>
  );
}

export function H1({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="serif text-[34px] leading-tight">{children}</h1>
      {sub && <p className="mt-1 max-w-[760px] text-[15px] text-ink2">{sub}</p>}
    </div>
  );
}

export function Card({ title, children, right, className = '' }: { title?: ReactNode; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-surface p-5 shadow-card ${className}`}>
      {(title || right) && (
        <div className="mb-4 flex items-start justify-between gap-4">
          {title && <h2 className="text-[15.5px] font-semibold leading-snug">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <div className="text-[13px] font-medium text-ink2">{label}</div>
      <div className="mt-1 text-[32px] font-semibold tabular-nums leading-none tracking-[-0.5px]">{value}</div>
      {sub && <div className="mt-2 text-[13px] text-ink3">{sub}</div>}
    </div>
  );
}

/** Horizontal bars, one series. Every bar is labeled with its count, so no axis is needed. */
export function BarList({
  rows,
  total,
  color = BAR,
  empty = 'No answers yet.',
}: {
  rows: { label: string; value: number; hint?: string }[];
  total?: number;
  color?: string;
  empty?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const sum = total ?? rows.reduce((a, r) => a + r.value, 0);
  if (!rows.length || !sum) return <p className="text-[14px] text-ink3">{empty}</p>;
  return (
    <ul className="grid gap-2.5">
      {rows.map((r) => {
        const pct = sum ? Math.round((r.value / sum) * 100) : 0;
        return (
          <li key={r.label} className="group relative">
            <div className="mb-1 flex items-baseline justify-between gap-3 text-[13.5px]">
              <span className="min-w-0 truncate text-ink">{r.label}</span>
              <span className="shrink-0 tabular-nums text-ink2">
                {r.value} <span className="text-ink3">· {pct}%</span>
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-line-soft">
              <div className="h-full rounded-[4px]" style={{ width: `${(r.value / max) * 100}%`, background: color, minWidth: r.value ? 4 : 0 }} />
            </div>
            <Tip>
              <b>{r.label}</b>
              <br />
              {r.value} of {sum} ({pct}%){r.hint ? <><br />{r.hint}</> : null}
            </Tip>
          </li>
        );
      })}
    </ul>
  );
}

/** Hover/focus tooltip for a bar row. */
export function Tip({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute left-0 top-full z-20 mt-1 hidden rounded-lg bg-ink px-3 py-2 text-[12.5px] leading-snug text-white shadow-lg group-hover:block">
      {children}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink2" aria-label="Legend">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: i.color }} aria-hidden="true" />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/** Answer counts split by persona: one thin bar per persona, 2px gap, value labels in ink. */
export function SegmentBars({
  rows,
  segments,
}: {
  rows: { label: string; bySegment: Record<string, number> }[];
  segments: { key: string; label: string }[];
}) {
  const totals = Object.fromEntries(segments.map((s) => [s.key, rows.reduce((a, r) => a + (r.bySegment[s.key] || 0), 0)]));
  return (
    <div>
      <Legend items={segments.map((s) => ({ label: `${s.label} (n=${totals[s.key]})`, color: SEG_COLOR[s.key] }))} />
      <ul className="mt-3 grid gap-3">
        {rows.map((r) => (
          <li key={r.label}>
            <div className="mb-1 text-[13.5px]">{r.label}</div>
            <div className="grid gap-[2px]">
              {segments.map((s) => {
                const n = r.bySegment[s.key] || 0;
                const pct = totals[s.key] ? (n / totals[s.key]) * 100 : 0;
                return (
                  <div key={s.key} className="group relative flex items-center gap-2">
                    <div className="h-2 flex-1 rounded-full bg-line-soft">
                      <div className="h-full rounded-[4px]" style={{ width: `${pct}%`, background: SEG_COLOR[s.key], minWidth: n ? 4 : 0 }} />
                    </div>
                    <span className="w-12 text-right text-[12px] tabular-nums text-ink2">{Math.round(pct)}%</span>
                    <Tip>
                      {s.label}: {n} of {totals[s.key]} ({Math.round(pct)}%)
                    </Tip>
                  </div>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Quotes({ items, empty = 'No written answers yet.' }: { items: { text: string; who?: string; href?: string }[]; empty?: string }) {
  if (!items.length) return <p className="text-[14px] text-ink3">{empty}</p>;
  return (
    <ul className="grid max-h-[340px] gap-2 overflow-y-auto pr-1">
      {items.map((t, i) => (
        <li key={i} className="rounded-xl bg-surface2 px-3.5 py-2.5 text-[14px] leading-relaxed">
          “{t.text}”
          {t.who && (
            <span className="ml-1.5 text-[12.5px] text-ink3">
              {t.href ? <Link className="underline-offset-2 hover:underline" href={t.href}>{t.who}</Link> : t.who}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  const cls = {
    neutral: 'bg-surface2 text-ink2',
    good: 'bg-[#dcf2e6] text-[#0e6b3a]',
    warn: 'bg-warn-soft text-warn',
    bad: 'bg-[#fbe3e1] text-danger',
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold ${cls}`}>{children}</span>;
}
