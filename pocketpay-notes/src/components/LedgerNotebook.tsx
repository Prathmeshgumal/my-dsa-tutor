import { useState } from 'react';

// A ledger drawn as a notebook: lines of money in and out, and a balance worked out by adding them up. Example data.
type Line = { date: string; what: string; amount: number };
const start: Line[] = [
  { date: '30 Oct', what: 'Added money from bank', amount: 200 },
  { date: '30 Oct', what: 'Paid the canteen', amount: -40 },
];
const extra: Line[] = [
  { date: '31 Oct', what: 'Paid the stationery shop', amount: -20 },
  { date: '31 Oct', what: 'Got back a refund', amount: 20 },
  { date: '1 Nov', what: 'Added money from bank', amount: 100 },
];
const rupees = (n: number) => `${n < 0 ? '−' : '+'}₹${Math.abs(n)}`;

export default function LedgerNotebook() {
  const [lines, setLines] = useState(start);
  const next = extra[lines.length - start.length];
  const balance = lines.reduce((s, l) => s + l.amount, 0);

  return (
    <figure className="not-prose my-6 text-ink">
      <div className="mx-auto max-w-[520px] overflow-hidden rounded-lg border border-rule bg-panel shadow-[4px_4px_0_var(--rule)]">
        <div className="border-b-2 border-sat bg-sat-soft px-5 py-3 font-bold">Riya’s wallet: the ledger</div>
        <ul>
          {lines.map((l, i) => (
            <li key={i} className={`grid grid-cols-[4.5rem_1fr_auto] gap-3 border-b border-rule px-5 py-2.5 ${i === lines.length - 1 && i >= start.length ? 'grow-in bg-sun-soft' : ''}`}>
              <span className="text-muted">{l.date}</span>
              <span>{l.what}</span>
              <span className={`font-mono font-bold ${l.amount < 0 ? 'text-cut' : 'text-keep'}`}>{rupees(l.amount)}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-baseline justify-between px-5 py-3">
          <span className="text-muted">Balance = add up every line</span>
          <span className="font-mono text-xl font-black">₹{balance}</span>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        <button disabled={!next} onClick={() => next && setLines([...lines, next])} className="rounded-md bg-sat px-3.5 py-1.5 font-medium text-on-sat disabled:opacity-40">
          {next ? `Write a new line: ${next.what.toLowerCase()}` : 'No more example lines'}
        </button>
        <button onClick={() => setLines(start)} className="rounded-md border-[1.5px] border-rule px-3.5 py-1.5 font-medium">Start again</button>
      </div>
      <figcaption className="mt-2 text-center text-sm text-muted">Lines are only ever added. The balance is never typed in; it’s always the sum of the lines.</figcaption>
    </figure>
  );
}
