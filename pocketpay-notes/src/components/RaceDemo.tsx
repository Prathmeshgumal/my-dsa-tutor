import { useState } from 'react';

// Two payments from the same ₹50 wallet at the same moment, with and without SELECT ... FOR UPDATE.
// Behaviour follows the PostgreSQL docs on row-level locks; the timeline itself is an example.
type Row = { a?: string; b?: string; balance: number; note: string; wait?: 'a' | 'b'; bad?: boolean };

const unlocked: Row[] = [
  { a: 'BEGIN', b: 'BEGIN', balance: 50, note: 'Both payments start at the same moment. Riya has ₹50.' },
  { a: 'Read balance → ₹50', balance: 50, note: 'A reads ₹50. Enough for ₹40.' },
  { b: 'Read balance → ₹50', balance: 50, note: 'B also reads ₹50, because A hasn’t written anything yet. B thinks there’s enough too.' },
  { a: 'Write −₹40, COMMIT', balance: 10, note: 'A writes its ₹40 payment. Balance is now ₹10.' },
  { b: 'Write −₹40, COMMIT', balance: -30, note: 'B writes its ₹40 payment based on the old ₹50 it read. Balance is −₹30. The wallet is overdrawn.', bad: true },
];

const locked: Row[] = [
  { a: 'BEGIN', b: 'BEGIN', balance: 50, note: 'Both payments start at the same moment. Riya has ₹50.' },
  { a: 'SELECT … FOR UPDATE (lock), read ₹50', balance: 50, note: 'A locks Riya’s account row, then reads ₹50.' },
  { b: 'SELECT … FOR UPDATE', wait: 'b', balance: 50, note: 'B asks for the same lock and is blocked: other transactions “will be blocked until the current transaction ends” (PostgreSQL docs).' },
  { a: 'Write −₹40, COMMIT (lock released)', wait: 'b', balance: 10, note: 'A writes its payment and commits. Balance is ₹10, and the lock is released.' },
  { b: 'Gets the lock, reads ₹10', balance: 10, note: 'B now gets the lock and reads the new balance: ₹10.' },
  { b: 'Not enough → ROLLBACK', balance: 10, note: 'B sees ₹10 isn’t enough for ₹40 and rolls back. Balance stays ₹10. Correct.' },
];

export default function RaceDemo() {
  const [withLock, setWithLock] = useState(false);
  const [step, setStep] = useState(0);
  const rows = withLock ? locked : unlocked;
  const cur = rows[Math.min(step, rows.length - 1)];
  const switchMode = (v: boolean) => {
    setWithLock(v);
    setStep(0);
  };

  return (
    <figure className="not-prose my-6 rounded-lg border border-rule bg-panel p-5 text-ink">
      <div className="mb-4 inline-flex rounded-lg border border-rule p-1" role="tablist">
        <button role="tab" aria-selected={!withLock} onClick={() => switchMode(false)} className={`rounded-md px-3.5 py-1.5 font-medium ${!withLock ? 'bg-cut text-paper' : 'text-muted'}`}>Without a lock</button>
        <button role="tab" aria-selected={withLock} onClick={() => switchMode(true)} className={`rounded-md px-3.5 py-1.5 font-medium ${withLock ? 'bg-keep text-paper' : 'text-muted'}`}>With FOR UPDATE</button>
      </div>

      <div className="grid grid-cols-[1fr_1fr_auto] gap-x-3 text-sm">
        <div className="pb-2 font-bold">Payment A (Riya’s phone)</div>
        <div className="pb-2 font-bold">Payment B (Riya’s agent)</div>
        <div className="pb-2 text-right font-bold">Balance</div>
        {rows.map((r, i) => {
          const shown = i <= step;
          const active = i === step;
          return (
            <div key={i} className="contents">
              <Cell text={r.a} shown={shown} active={active} />
              <Cell text={r.wait === 'b' && !r.b ? 'waiting for the lock…' : r.b} shown={shown} active={active} waiting={r.wait === 'b' && !r.b} />
              <div className={`py-1.5 text-right font-mono font-bold transition-opacity ${shown ? 'opacity-100' : 'opacity-0'} ${r.balance < 0 ? 'text-cut' : ''}`}>₹{r.balance}</div>
            </div>
          );
        })}
      </div>

      <p className={`mt-4 min-h-[3.5em] rounded-r-lg border-l-4 px-4 py-3 leading-relaxed ${cur.bad ? 'border-cut bg-sun-soft' : 'border-sun bg-sun-soft'}`} aria-live="polite">
        <span className="mr-1.5 font-black text-sun">{Math.min(step, rows.length - 1) + 1}</span>
        {cur.note}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button onClick={() => setStep((s) => Math.max(0, s - 1))} className="rounded-md bg-sat px-3.5 py-1.5 font-medium text-on-sat">Back</button>
        <button onClick={() => setStep((s) => Math.min(rows.length - 1, s + 1))} className="rounded-md bg-sat px-3.5 py-1.5 font-medium text-on-sat">Next step</button>
        <span className="ml-1 text-sm text-muted">Step {Math.min(step, rows.length - 1) + 1} of {rows.length}</span>
      </div>
    </figure>
  );
}

function Cell({ text, shown, active, waiting }: { text?: string; shown: boolean; active: boolean; waiting?: boolean }) {
  return (
    <div className={`border-t border-rule py-1.5 transition-opacity ${shown ? 'opacity-100' : 'opacity-0'}`}>
      {text && (
        <span className={`inline-block rounded px-2 py-0.5 font-mono text-[0.8rem] ${active ? 'bg-sun-soft font-bold' : ''} ${waiting ? 'text-muted italic' : ''}`}>{text}</span>
      )}
    </div>
  );
}
