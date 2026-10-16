'use client';

import { useId, useMemo, useState } from 'react';
import { AIRPORTS, type Question } from '@config/questions';

type Props = {
  q: Question;
  value: unknown;
  onChange: (v: unknown) => void;
  compact?: boolean;
  autoFocus?: boolean;
};

const Check = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l5 5 9-11" />
  </svg>
);

/** Whether an answer is complete enough to continue. */
export function isAnswered(q: Question, v: unknown): boolean {
  if (q.optional) return true;
  switch (q.type) {
    case 'multi':
    case 'airports':
      return Array.isArray(v) && v.length > 0 && (!hasOther(v) || !!otherText(v));
    case 'text':
      return typeof v === 'string' && v.trim().length > 0;
    case 'currency':
      return typeof v === 'number' && Number.isFinite(v) && v >= 0;
    case 'single':
      if (v === 'other') return false;
      return typeof v === 'string' && v.length > 0;
    default:
      return v !== undefined && v !== null && v !== '';
  }
}

const OTHER = 'other:';
const hasOther = (v: unknown[]) => v.some((x) => x === 'other' || (typeof x === 'string' && x.startsWith(OTHER)));
const otherText = (v: unknown[]) => {
  const o = v.find((x) => typeof x === 'string' && x.startsWith(OTHER)) as string | undefined;
  return o ? o.slice(OTHER.length).trim() : '';
};

export function QuestionInput({ q, value, onChange, compact, autoFocus }: Props) {
  const gid = useId();
  switch (q.type) {
    case 'yesno':
    case 'single':
      return <Single q={q} value={value} onChange={onChange} name={gid} compact={compact} />;
    case 'multi':
      return <Multi q={q} value={value} onChange={onChange} compact={compact} />;
    case 'scale':
      return <Scale q={q} value={value} onChange={onChange} />;
    case 'text':
      return (
        <textarea
          className="field min-h-[112px] resize-y leading-relaxed"
          placeholder={q.placeholder}
          value={typeof value === 'string' ? value : ''}
          maxLength={2000}
          autoFocus={autoFocus}
          aria-label={q.prompt}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'currency':
      return (
        <div className="relative max-w-[220px]">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink2 font-semibold">$</span>
          <input
            className="field pl-8 tabular-nums text-lg font-semibold"
            type="number"
            inputMode="decimal"
            min={0}
            max={100000}
            step={1}
            placeholder={q.placeholder}
            autoFocus={autoFocus}
            aria-label={q.prompt}
            value={typeof value === 'number' ? value : ''}
            onChange={(e) => onChange(e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)))}
          />
        </div>
      );
    case 'airport':
      return <AirportPicker q={q} value={value} onChange={onChange} max={1} />;
    case 'airports':
      return <AirportPicker q={q} value={value} onChange={onChange} max={q.max ?? 3} />;
  }
}

function Single({ q, value, onChange, name, compact }: Props & { name: string }) {
  const v = typeof value === 'string' ? value : '';
  const isOther = v === 'other' || v.startsWith(OTHER);
  return (
    <div role="radiogroup" aria-label={q.prompt} className={compact ? 'grid gap-2' : 'grid gap-2.5'}>
      {q.options!.map((o) => {
        const on = o.value === 'other' ? isOther : v === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            name={name}
            data-track={`option:${q.id}:${o.value}`}
            className={`choice ${compact ? 'min-h-[48px] py-2.5' : ''}`}
            onClick={() => onChange(o.value === 'other' ? (isOther ? v : 'other') : o.value)}
          >
            <span className="mark">{on && <span className="block h-2 w-2 rounded-full bg-white" />}</span>
            {o.label}
          </button>
        );
      })}
      {q.other && isOther && (
        <input
          className="field"
          autoFocus
          maxLength={200}
          placeholder="Tell us more"
          aria-label="Other, please specify"
          value={v.startsWith(OTHER) ? v.slice(OTHER.length) : ''}
          onChange={(e) => onChange(e.target.value ? OTHER + e.target.value : 'other')}
        />
      )}
    </div>
  );
}

function Multi({ q, value, onChange, compact }: Props) {
  const arr = Array.isArray(value) ? (value as string[]) : [];
  const other = arr.find((x) => x === 'other' || x.startsWith(OTHER));
  const toggle = (val: string) => {
    let next = arr.filter((x) => !(val === 'other' ? x === 'other' || x.startsWith(OTHER) : x === val));
    const had = next.length !== arr.length;
    if (!had) {
      if (q.exclusive && val === q.exclusive) next = [val];
      else next = [...next.filter((x) => x !== q.exclusive), val];
    }
    if (q.max && next.length > q.max) return;
    onChange(next);
  };
  return (
    <div role="group" aria-label={q.prompt} className={compact ? 'grid gap-2' : 'grid gap-2.5'}>
      {q.options!.map((o) => {
        const on = o.value === 'other' ? !!other : arr.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            role="checkbox"
            aria-checked={on}
            data-track={`option:${q.id}:${o.value}`}
            className={`choice multi ${compact ? 'min-h-[48px] py-2.5 text-[15px]' : ''}`}
            onClick={() => toggle(o.value)}
          >
            <span className="mark">{on && <Check />}</span>
            {o.label}
          </button>
        );
      })}
      {q.other && other && (
        <input
          className="field"
          autoFocus
          maxLength={200}
          placeholder="Tell us more"
          aria-label="Other, please specify"
          value={other.startsWith(OTHER) ? other.slice(OTHER.length) : ''}
          onChange={(e) =>
            onChange([...arr.filter((x) => x !== other), e.target.value ? OTHER + e.target.value : 'other'])
          }
        />
      )}
    </div>
  );
}

function Scale({ q, value, onChange }: Props) {
  const min = q.min ?? 1;
  const max = q.maxScale ?? 5;
  const n = max - min + 1;
  const vals = Array.from({ length: n }, (_, i) => min + i);
  return (
    <div>
      <div
        role="radiogroup"
        aria-label={q.prompt}
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
      >
        {vals.map((v) => {
          const on = value === v;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`${v}${v === min ? `, ${q.minLabel}` : v === max ? `, ${q.maxLabel}` : ''}`}
              data-track={`scale:${q.id}:${v}`}
              onClick={() => onChange(v)}
              className={`grid place-items-center rounded-xl border-[1.5px] font-semibold tabular-nums transition-colors ${
                n > 7 ? 'h-11 text-[15px]' : 'h-14 text-lg'
              } ${on ? 'border-accent bg-accent text-white' : 'border-line bg-surface text-ink hover:border-[#b7c2d6]'}`}
            >
              {v}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[13px] text-ink2">
        <span>{q.minLabel}</span>
        <span>{q.maxLabel}</span>
      </div>
    </div>
  );
}

function AirportPicker({ q, value, onChange, max }: Props & { max: number }) {
  const selected = useMemo(
    () => (max === 1 ? (typeof value === 'string' && value ? [value] : []) : Array.isArray(value) ? (value as string[]) : []),
    [value, max],
  );
  const [term, setTerm] = useState('');
  const t = term.trim().toLowerCase();
  const matches = (t
    ? AIRPORTS.filter((a) => a.code.toLowerCase().startsWith(t) || a.city.toLowerCase().includes(t) || a.name.toLowerCase().includes(t))
    : AIRPORTS.slice(0, 8)
  ).slice(0, 8);
  const label = (code: string) => {
    if (code.startsWith('other:')) return code.slice(6);
    const a = AIRPORTS.find((x) => x.code === code);
    return a ? `${a.city} · ${a.name} (${a.code})` : code;
  };
  const set = (arr: string[]) => onChange(max === 1 ? arr[0] ?? '' : arr);
  const add = (code: string) => {
    if (selected.includes(code)) return;
    if (max === 1) set([code]);
    else if (selected.length < max) set([...selected, code]);
    setTerm('');
  };
  const full = selected.length >= max;
  return (
    <div className="grid gap-3">
      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Selected airports">
          {selected.map((c) => (
            <li key={c} className="flex items-center gap-1.5 rounded-full bg-accent-soft py-1.5 pl-3.5 pr-1.5 text-[14.5px] font-semibold text-accent-dark">
              {label(c)}
              <button
                type="button"
                aria-label={`Remove ${label(c)}`}
                data-track={`airport-remove:${q.id}`}
                className="grid h-7 w-7 place-items-center rounded-full hover:bg-white/70"
                onClick={() => set(selected.filter((x) => x !== c))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {!full && (
        <>
          <input
            className="field"
            type="search"
            placeholder={q.placeholder}
            value={term}
            aria-label={q.prompt}
            onChange={(e) => setTerm(e.target.value)}
            data-private
          />
          <div className="grid gap-1.5" role="listbox" aria-label="Airports">
            {matches.map((a) => (
              <button
                key={a.code}
                type="button"
                role="option"
                aria-selected={selected.includes(a.code)}
                data-track={`airport:${q.id}:${a.code}`}
                className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3 text-left hover:border-[#b7c2d6] disabled:opacity-40"
                disabled={selected.includes(a.code)}
                onClick={() => add(a.code)}
              >
                <span>
                  <span className="font-semibold">{a.city}</span> <span className="text-ink2">· {a.name}</span>
                </span>
                <span className="font-mono text-[13px] font-semibold text-ink2">{a.code}</span>
              </button>
            ))}
            {t.length >= 2 && (
              <button
                type="button"
                data-track={`airport-other:${q.id}`}
                className="rounded-xl border border-dashed border-line px-4 py-3 text-left text-ink2 hover:border-[#b7c2d6]"
                onClick={() => add(`other:${term.trim().slice(0, 60)}`)}
              >
                Use “{term.trim()}”
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
