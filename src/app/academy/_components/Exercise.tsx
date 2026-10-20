'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import type { AcademyLocale, Exercise as ExerciseData, Text } from '@/lib/academy/types';
import { permutation, seedOf, type Answer } from '@/lib/academy/engine';

export const tx = (t: Text, locale: AcademyLocale) => t[locale] || t.en;

interface ExerciseProps {
  exercise: ExerciseData;
  lessonId: string;
  locale: AcademyLocale;
  /** The answer is in: the controls freeze and show what was right. */
  locked: boolean;
  /** The child's answer so far, or null while it is incomplete. */
  onAnswer: (a: Answer | null) => void;
}

/** One question, in whichever form it takes. The child builds an answer here;
 *  the lesson's Check key decides. Shuffles are seeded by lesson and question,
 *  so a replay shows the same order and nothing reshuffles on a re-render. */
export function Exercise({ exercise, lessonId, locale, locked, onAnswer }: ExerciseProps) {
  const t = useTranslations('academy.lesson');
  const seed = seedOf(`${lessonId}:${exercise.id}`);
  const hint = exercise.kind === 'order' ? t('orderHint') : exercise.kind === 'match' ? t('matchHint') : exercise.kind === 'choice' ? t('chooseHint') : null;
  return (
    <div className="ac-ex" data-kind={exercise.kind}>
      {exercise.image && (
        <div className="ac-ex__image">
          <Image src={exercise.image} alt="" fill sizes="(max-width: 640px) 90vw, 480px" />
        </div>
      )}
      <h2 className="ac-ex__prompt">{tx(exercise.prompt, locale)}</h2>
      {hint && <p className="ac-ex__hint">{hint}</p>}
      {exercise.kind === 'choice' && <Choice options={exercise.options} answer={exercise.answer} locale={locale} locked={locked} seed={seed} onAnswer={onAnswer} />}
      {exercise.kind === 'truefalse' && <TrueFalse answer={exercise.answer} locked={locked} onAnswer={onAnswer} />}
      {exercise.kind === 'order' && <Order items={exercise.items} locale={locale} locked={locked} seed={seed} onAnswer={onAnswer} />}
      {exercise.kind === 'match' && <Match pairs={exercise.pairs} locale={locale} locked={locked} seed={seed} onAnswer={onAnswer} />}
    </div>
  );
}

function Choice({ options, answer, locale, locked, seed, onAnswer }: { options: Text[]; answer: number; locale: AcademyLocale; locked: boolean; seed: number; onAnswer: (a: Answer | null) => void }) {
  const order = useMemo(() => permutation(options.length, seed), [options.length, seed]);
  const [pick, setPick] = useState<number | null>(null);
  return (
    <div className="ac-choices" role="radiogroup">
      {order.map((i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={pick === i}
          className="ac-choice"
          data-state={locked ? (i === answer ? 'right' : pick === i ? 'wrong' : 'idle') : pick === i ? 'picked' : 'idle'}
          disabled={locked}
          onClick={() => { setPick(i); onAnswer({ kind: 'choice', pick: i }); }}
        >
          {tx(options[i], locale)}
        </button>
      ))}
    </div>
  );
}

function TrueFalse({ answer, locked, onAnswer }: { answer: boolean; locked: boolean; onAnswer: (a: Answer | null) => void }) {
  const t = useTranslations('academy.lesson');
  const [pick, setPick] = useState<boolean | null>(null);
  return (
    <div className="ac-tf" role="radiogroup">
      {[true, false].map((v) => (
        <button
          key={String(v)}
          type="button"
          role="radio"
          aria-checked={pick === v}
          className="ac-choice ac-choice--big"
          data-state={locked ? (v === answer ? 'right' : pick === v ? 'wrong' : 'idle') : pick === v ? 'picked' : 'idle'}
          disabled={locked}
          onClick={() => { setPick(v); onAnswer({ kind: 'truefalse', value: v }); }}
        >
          {v ? t('true') : t('false')}
        </button>
      ))}
    </div>
  );
}

/** Tap the shuffled items into a row, in order; tap one in the row to take it back. */
function Order({ items, locale, locked, seed, onAnswer }: { items: Text[]; locale: AcademyLocale; locked: boolean; seed: number; onAnswer: (a: Answer | null) => void }) {
  const pool = useMemo(() => permutation(items.length, seed), [items.length, seed]);
  const [placed, setPlaced] = useState<number[]>([]);
  const update = (next: number[]) => {
    setPlaced(next);
    onAnswer(next.length === items.length ? { kind: 'order', order: next } : null);
  };
  return (
    <div className="ac-order">
      <ol className="ac-order__row" aria-live="polite">
        {items.map((_, slot) => {
          const i = placed[slot];
          return (
            <li key={slot} className="ac-order__slot" data-filled={i !== undefined} data-state={locked && i !== undefined ? (i === slot ? 'right' : 'wrong') : undefined}>
              <span className="ac-order__n">{slot + 1}</span>
              {i !== undefined ? (
                <button type="button" className="ac-chip ac-chip--placed" disabled={locked} onClick={() => update(placed.filter((p) => p !== i))}>
                  {tx(items[i], locale)}
                </button>
              ) : <span className="ac-order__empty" />}
            </li>
          );
        })}
      </ol>
      <div className="ac-order__pool">
        {pool.map((i) => (
          <button key={i} type="button" className="ac-chip" disabled={locked || placed.includes(i)} data-used={placed.includes(i)} onClick={() => update([...placed, i])}>
            {tx(items[i], locale)}
          </button>
        ))}
      </div>
      {locked && (
        <ol className="ac-order__answer">
          {items.map((it, i) => <li key={i}>{tx(it, locale)}</li>)}
        </ol>
      )}
    </div>
  );
}

const PAIR_HUES = [205, 35, 150, 290];

/** Tap a left item, then its partner on the right. Tapping a paired item again unpairs it. */
function Match({ pairs, locale, locked, seed, onAnswer }: { pairs: { left: Text; right: Text }[]; locale: AcademyLocale; locked: boolean; seed: number; onAnswer: (a: Answer | null) => void }) {
  const rightOrder = useMemo(() => permutation(pairs.length, seed), [pairs.length, seed]);
  /** For each left index, the original index of the right item paired with it. */
  const [links, setLinks] = useState<(number | null)[]>(() => pairs.map(() => null));
  const [left, setLeft] = useState<number | null>(null);
  const commit = (next: (number | null)[]) => {
    setLinks(next);
    onAnswer(next.every((v) => v !== null) ? { kind: 'match', pairs: next as number[] } : null);
  };
  const tapLeft = (i: number) => {
    if (links[i] !== null) { const next = links.slice(); next[i] = null; commit(next); setLeft(i); return; }
    setLeft(left === i ? null : i);
  };
  const tapRight = (r: number) => {
    const owner = links.indexOf(r);
    if (left === null) {
      if (owner >= 0) { const next = links.slice(); next[owner] = null; commit(next); }
      return;
    }
    const next = links.map((v) => (v === r ? null : v));
    next[left] = r;
    commit(next);
    setLeft(null);
  };
  const hueOfLeft = (i: number) => (links[i] !== null ? PAIR_HUES[i % PAIR_HUES.length] : undefined);
  return (
    <div className="ac-match">
      <div className="ac-match__col">
        {pairs.map((p, i) => (
          <button
            key={i}
            type="button"
            className="ac-chip ac-chip--match"
            disabled={locked}
            aria-pressed={left === i}
            data-state={locked ? (links[i] === i ? 'right' : 'wrong') : left === i ? 'picked' : undefined}
            style={hueOfLeft(i) !== undefined ? ({ '--pair': hueOfLeft(i) } as React.CSSProperties) : undefined}
            data-paired={links[i] !== null}
            onClick={() => tapLeft(i)}
          >
            {tx(p.left, locale)}
          </button>
        ))}
      </div>
      <div className="ac-match__col">
        {rightOrder.map((r) => {
          const owner = links.indexOf(r);
          return (
            <button
              key={r}
              type="button"
              className="ac-chip ac-chip--match"
              disabled={locked}
              data-paired={owner >= 0}
              data-state={locked ? (owner === r ? 'right' : 'wrong') : undefined}
              style={owner >= 0 ? ({ '--pair': PAIR_HUES[owner % PAIR_HUES.length] } as React.CSSProperties) : undefined}
              onClick={() => tapRight(r)}
            >
              {tx(pairs[r].right, locale)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The right answer, written out, for the feedback sheet after a miss. */
export function answerText(ex: ExerciseData, locale: AcademyLocale, t: (k: 'true' | 'false') => string): string {
  switch (ex.kind) {
    case 'choice': return tx(ex.options[ex.answer], locale);
    case 'truefalse': return ex.answer ? t('true') : t('false');
    case 'order': return ex.items.map((i) => tx(i, locale)).join(' → ');
    case 'match': return ex.pairs.map((p) => `${tx(p.left, locale)}: ${tx(p.right, locale)}`).join(' · ');
  }
}
