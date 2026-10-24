'use client';

import { useEffect, useRef, useState } from 'react';
import type { Checkpoint } from '@config/questions';
import { QuestionInput, isAnswered } from './QuestionInput';

export type CheckpointAnswer = {
  main: unknown;
  followup: unknown;
  msToAnswer: number;
  changes: number;
};

/**
 * Bottom sheet that freezes the prototype screen behind it and asks one
 * checkpoint: the main question plus its optional follow-up.
 */
export function CheckpointSheet({
  cp,
  position,
  onSubmit,
  onDismiss,
}: {
  cp: Checkpoint;
  position: { n: number; of: number } | null;
  onSubmit: (a: CheckpointAnswer) => void;
  /** Close the sheet and return to the screen; the question re-opens later. */
  onDismiss?: () => void;
}) {
  const [main, setMain] = useState<unknown>(undefined);
  const [follow, setFollow] = useState<unknown>(undefined);
  const shownAt = useRef(Date.now());
  const changes = useRef(0);
  const headRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    shownAt.current = Date.now();
    changes.current = 0;
    setMain(undefined);
    setFollow(undefined);
    headRef.current?.focus();
  }, [cp.id]);

  const ready = isAnswered(cp.main, main);
  const submit = () => {
    if (!ready) return;
    onSubmit({ main, followup: follow, msToAnswer: Date.now() - shownAt.current, changes: changes.current });
  };

  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end" role="dialog" aria-modal="true" aria-labelledby={`cp-${cp.id}`}>
      <div className="fade-in absolute inset-0 bg-[rgba(10,26,54,.38)]" aria-hidden="true" />
      <div className="sheet-in relative max-h-[88%] overflow-y-auto rounded-t-[22px] bg-surface px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_40px_rgba(10,26,54,.25)]">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" aria-hidden="true" />
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[12px] font-bold uppercase tracking-[1.2px] text-accent">Quick question</span>
          <span className="flex items-center gap-2">
            {position && position.of > 1 && (
              <span className="text-[12.5px] tabular-nums text-ink3">
                {position.n} of {position.of}
              </span>
            )}
            {onDismiss && (
              <button
                type="button"
                aria-label="Close and answer later"
                className="grid h-7 w-7 place-items-center rounded-full text-ink3 hover:bg-line-soft"
                onClick={onDismiss}
                data-track={`checkpoint-dismiss:${cp.id}`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            )}
          </span>
        </div>
        <h2 id={`cp-${cp.id}`} ref={headRef} tabIndex={-1} className="mb-4 text-[19px] font-semibold leading-snug tracking-[-0.2px] outline-none">
          {cp.main.prompt}
        </h2>
        <QuestionInput
          q={cp.main}
          value={main}
          compact
          onChange={(v) => {
            if (main !== undefined) changes.current++;
            setMain(v);
          }}
        />
        {cp.followup && (ready || cp.main.type === 'text') && (
          <div className="fade-in mt-5">
            <label className="mb-2 block text-[15.5px] font-semibold">
              {cp.followup.prompt}
              {cp.followup.optional && <span className="ml-1.5 font-normal text-ink3">Optional</span>}
            </label>
            <QuestionInput q={cp.followup} value={follow} onChange={setFollow} compact />
          </div>
        )}
        <button type="button" className="btn-primary mt-5 w-full" disabled={!ready} onClick={submit} data-track={`checkpoint-submit:${cp.id}`}>
          Continue
        </button>
      </div>
    </div>
  );
}
