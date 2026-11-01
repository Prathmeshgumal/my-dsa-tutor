import { useState } from 'react';

// psycopg 3 on a non-autocommit connection: any query opens a transaction implicitly, after which
// conn.transaction() only makes a savepoint. Behaviour from the psycopg "Transactions management" docs.
type Line = { code: string; sql: string; status: 'IDLE' | 'INTRANS'; note?: string; bad?: boolean };

const right: Line[] = [
  { code: 'async with pool.connection() as conn:', sql: '(borrow a connection)', status: 'IDLE' },
  { code: '    async with conn.transaction():', sql: 'BEGIN', status: 'INTRANS', note: 'The real transaction starts here.' },
  { code: '        await conn.execute("SELECT … FOR UPDATE", …)', sql: 'SELECT … FOR UPDATE', status: 'INTRANS', note: 'Locks are held by this transaction.' },
  { code: '        await conn.execute("INSERT …", …)', sql: 'INSERT …', status: 'INTRANS' },
  { code: '    # end of transaction() block', sql: 'COMMIT', status: 'IDLE', note: 'Saved, and locks released, right here.' },
];

const wrong: Line[] = [
  { code: 'async with pool.connection() as conn:', sql: '(borrow a connection)', status: 'IDLE' },
  { code: '    await conn.execute("SELECT type FROM accounts …")', sql: 'BEGIN (automatic!)  SELECT …', status: 'INTRANS', note: 'psycopg quietly opened a transaction for this SELECT.', bad: true },
  { code: '    async with conn.transaction():', sql: 'SAVEPOINT', status: 'INTRANS', note: 'Not a new transaction: only a savepoint inside the one already open.', bad: true },
  { code: '        await conn.execute("INSERT …", …)', sql: 'INSERT …', status: 'INTRANS' },
  { code: '    # end of transaction() block', sql: 'RELEASE SAVEPOINT', status: 'INTRANS', note: 'Nothing is committed yet, and the locks are still held.', bad: true },
  { code: '# end of pool.connection() block', sql: 'COMMIT', status: 'IDLE', note: 'Only now is it saved. It works, but the transaction is not where the code says it is.' },
];

export default function TxGotcha() {
  const [isWrong, setWrong] = useState(false);
  const lines = isWrong ? wrong : right;

  return (
    <figure className="not-prose my-6 rounded-lg border border-rule bg-panel p-5 text-ink">
      <div className="mb-4 inline-flex rounded-lg border border-rule p-1" role="tablist">
        <button role="tab" aria-selected={!isWrong} onClick={() => setWrong(false)} className={`rounded-md px-3.5 py-1.5 font-medium ${!isWrong ? 'bg-keep text-paper' : 'text-muted'}`}>transaction() first</button>
        <button role="tab" aria-selected={isWrong} onClick={() => setWrong(true)} className={`rounded-md px-3.5 py-1.5 font-medium ${isWrong ? 'bg-cut text-paper' : 'text-muted'}`}>A query before transaction()</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] border-collapse text-sm">
          <thead>
            <tr className="text-left">
              <th className="pb-2 font-bold">Your Python</th>
              <th className="pb-2 font-bold">What Postgres receives</th>
              <th className="pb-2 font-bold">Connection status</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className={`border-t border-rule align-top ${l.bad ? 'bg-sun-soft' : ''}`}>
                <td className="py-2 pr-3 font-mono text-[0.8rem] whitespace-pre">{l.code}</td>
                <td className="py-2 pr-3">
                  <span className="font-mono text-[0.8rem] font-bold">{l.sql}</span>
                  {l.note && <span className={`mt-0.5 block ${l.bad ? 'text-cut' : 'text-muted'}`}>{l.note}</span>}
                </td>
                <td className="py-2"><span className={`rounded px-2 py-0.5 font-mono text-[0.75rem] font-bold ${l.status === 'IDLE' ? 'bg-sat-soft text-sat' : 'bg-sun-soft text-ink'}`}>{l.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
