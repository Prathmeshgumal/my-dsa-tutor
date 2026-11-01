import { useState } from 'react';

// The seven steps of post() in backend/pocketpay/ledger.py, each with the code it runs and how it can fail.
const steps = [
  {
    title: 'Check the shape',
    say: 'Before touching the database: at least two postings. Each Posting is a Pydantic model, so a zero amount or an unknown direction was already refused when it was created.',
    code: 'if len(postings) < 2:\n    raise InvalidPosting("an entry needs at least two postings")',
    fail: 'InvalidPosting. Nothing was started, so there’s nothing to undo.',
  },
  {
    title: 'Start a database transaction',
    say: 'Everything inside this block is saved together or not at all. If any exception escapes the block, psycopg rolls the whole transaction back. transaction() comes first, before any query.',
    code: 'async with self.pool.connection() as conn, conn.transaction():\n    ...  # steps 3 to 6 happen in here',
    fail: 'A database error (for example, Postgres is down).',
  },
  {
    title: 'Lock the accounts, lowest ID first',
    say: 'Sort the account IDs, remove duplicates, then lock each row with FOR UPDATE. Any other payment touching these accounts now waits for us. The fixed order prevents deadlocks.',
    code: 'for account_id in sorted({p.account_id for p in postings}):\n    cur = await conn.execute(\n        "SELECT type, currency FROM accounts "\n        "WHERE id = %s FOR UPDATE", (account_id,)\n    )\n    row = await cur.fetchone()',
    fail: 'AccountNotFound. For a reversal, also AlreadyReversed.',
  },
  {
    title: 'Debits = credits, per currency',
    say: 'Add debits, subtract credits, separately for INR and COIN. Every total must come out to zero.',
    code: 'per_currency[currency] += (\n    p.amount if p.direction == Direction.DEBIT else -p.amount\n)\nif any(diff != 0 for diff in per_currency.values()):\n    raise Unbalanced(...)',
    fail: 'Unbalanced.',
  },
  {
    title: 'No balance goes below zero',
    say: 'For each account that would shrink, work out its current balance from its postings and check it can afford the change. We hold the locks, so nobody can change these balances under us.',
    code: 'current = await _balance(conn, account_id, account.type)\nif current + delta < 0:\n    raise InsufficientFunds(...)',
    fail: 'InsufficientFunds.',
  },
  {
    title: 'Write the entry and its postings',
    say: 'One row in journal_entries, then one row in postings per line. RETURNING id gives us the new entry’s ID.',
    code: 'INSERT INTO journal_entries (...) RETURNING id\nINSERT INTO postings (...)   -- once per line',
    fail: 'A database error. A reversal that slipped past step 3 hits the UNIQUE rule (UniqueViolation) and becomes AlreadyReversed.',
  },
  {
    title: 'Commit',
    say: 'Leaving the transaction block normally commits: everything becomes permanent and visible to others at once, and the locks are released.',
    code: '# end of the `async with` block → COMMIT\nreturn entry_id',
    fail: 'A database error. Then nothing was saved.',
  },
];

export default function PostFlow() {
  const [i, setI] = useState(0);
  const s = steps[i];

  return (
    <figure className="not-prose my-6 grid gap-4 rounded-lg border border-rule bg-panel p-5 text-ink md:grid-cols-[15rem_1fr]">
      <ol className="relative space-y-1.5">
        <span className="absolute top-3 bottom-3 left-[0.95rem] w-0.5 bg-rule" aria-hidden />
        {steps.map((st, k) => (
          <li key={st.title} className="relative">
            <button onClick={() => setI(k)} className={`flex w-full items-center gap-3 rounded-md px-1.5 py-1.5 text-left ${k === i ? 'bg-sun-soft font-bold' : ''}`}>
              <span className={`z-10 grid h-6 w-6 shrink-0 place-items-center rounded-full text-sm font-black ${k === i ? 'bg-sun text-paper' : 'bg-sat-soft text-sat'}`}>{k + 1}</span>
              <span className="text-[0.95rem] leading-snug">{st.title}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="min-w-0">
        <p className="text-lg font-bold">{i + 1}. {s.title}</p>
        <p className="mt-1 leading-relaxed">{s.say}</p>
        <pre className="mt-3 overflow-x-auto rounded-md border border-rule bg-paper p-3 font-mono text-[0.85rem] leading-relaxed">{s.code}</pre>
        <p className="mt-3 rounded-r-md border-l-4 border-cut bg-sun-soft px-3 py-2 text-[0.95rem]">
          <b>If this step fails:</b> {s.fail} {i > 0 && 'The exception leaves the transaction block, psycopg rolls back everything since step 2, and the locks are released.'}
        </p>
        <div className="mt-3 flex gap-2">
          <button onClick={() => setI(Math.max(0, i - 1))} className="rounded-md bg-sat px-3.5 py-1.5 font-medium text-on-sat">Back</button>
          <button onClick={() => setI(Math.min(steps.length - 1, i + 1))} className="rounded-md bg-sat px-3.5 py-1.5 font-medium text-on-sat">Next step</button>
        </div>
      </div>
    </figure>
  );
}
