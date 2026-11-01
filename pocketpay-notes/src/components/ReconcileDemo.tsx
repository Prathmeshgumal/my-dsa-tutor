import { useState } from 'react';

// Example nightly reconciliation: PocketPay's records vs the partner bank's statement.
type Line = { ref: string; text: string; amount: string };
const ours: Line[] = [
  { ref: 'P1', text: 'Top-up from Riya', amount: '+₹200' },
  { ref: 'P2', text: 'Top-up from Arjun', amount: '+₹500' },
  { ref: 'P3', text: 'Top-up from Meera (marked failed)', amount: '₹0' },
  { ref: 'P4', text: 'Payout to canteen', amount: '−₹40' },
  { ref: 'P4', text: 'Payout to canteen (duplicate)', amount: '−₹40' },
];
const bank: Line[] = [
  { ref: 'P1', text: 'Credit from Riya', amount: '+₹200' },
  { ref: 'P2', text: 'Credit from Arjun', amount: '+₹500' },
  { ref: 'P3', text: 'Credit from Meera', amount: '+₹100' },
  { ref: 'P4', text: 'Transfer to canteen', amount: '−₹40' },
];
// Result per row, in order: our row index → bank row index, or a problem.
const results: { ours?: number; bank?: number; ok: boolean; why: string }[] = [
  { ours: 0, bank: 0, ok: true, why: 'Matches.' },
  { ours: 1, bank: 1, ok: true, why: 'Matches.' },
  { ours: 2, bank: 2, ok: false, why: 'We marked it failed, but the bank received ₹100. Meera was charged and her wallet shows nothing.' },
  { ours: 3, bank: 3, ok: true, why: 'Matches.' },
  { ours: 4, ok: false, why: 'We recorded the payout twice, but the bank sent it once. Our books are ₹40 short of reality.' },
];

export default function ReconcileDemo() {
  const [shown, setShown] = useState(0);
  const done = shown >= results.length;
  const rowState = (side: 'ours' | 'bank', idx: number) => {
    const r = results.slice(0, shown).find((x) => x[side] === idx);
    return r ? (r.ok ? 'ok' : 'bad') : 'idle';
  };
  const style = { ok: 'border-keep bg-panel', bad: 'border-cut bg-sun-soft', idle: 'border-rule bg-panel' };

  return (
    <figure className="not-prose my-6 rounded-lg border border-rule bg-panel p-5 text-ink">
      <div className="grid gap-5 sm:grid-cols-2">
        {([['PocketPay’s ledger', ours, 'ours'], ['Partner bank’s statement', bank, 'bank']] as const).map(([title, lines, side]) => (
          <div key={side}>
            <p className="mb-2 font-bold">{title}</p>
            <ul className="space-y-2">
              {lines.map((l, i) => {
                const st = rowState(side, i);
                return (
                  <li key={i} className={`flex justify-between gap-3 rounded-md border-l-4 px-3 py-2 text-sm ${style[st]}`}>
                    <span><span className="mr-2 font-mono text-muted">{l.ref}</span>{l.text}</span>
                    <span className="font-mono font-bold">{l.amount}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button onClick={() => setShown((s) => Math.min(results.length, s + 1))} disabled={done} className="rounded-md bg-sat px-3.5 py-1.5 font-medium text-on-sat disabled:opacity-40">
          Compare next line
        </button>
        <button onClick={() => setShown(0)} className="rounded-md border-[1.5px] border-rule px-3.5 py-1.5 font-medium">Start again</button>
        <span className="text-sm text-muted">{shown} of {results.length} compared</span>
      </div>

      {shown > 0 && (
        <p className={`mt-3 rounded-r-lg border-l-4 px-4 py-3 leading-relaxed ${results[shown - 1].ok ? 'border-keep bg-sat-soft' : 'border-cut bg-sun-soft'}`} aria-live="polite">
          <b>{ours[results[shown - 1].ours ?? 0].ref}:</b> {results[shown - 1].why}
          {done && ' Done: 2 mismatches to investigate and fix with new ledger entries.'}
        </p>
      )}
    </figure>
  );
}
