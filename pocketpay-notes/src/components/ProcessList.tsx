import { useState } from 'react';

// Real output of `docker top payments-app-postgres-1 -o pid,args` on our laptop, 31 Oct 2026, before, during and
// after a psycopg pool of 3 was open. Process roles are from the PostgreSQL docs (glossary, "Standard Unix Tools").
type Proc = { pid: number; args: string; kind: 'main' | 'helper' | 'client' };

const base: Proc[] = [
  { pid: 16226, args: 'postgres', kind: 'main' },
  { pid: 16326, args: 'postgres: io worker 0', kind: 'helper' },
  { pid: 16327, args: 'postgres: io worker 2', kind: 'helper' },
  { pid: 16328, args: 'postgres: io worker 1', kind: 'helper' },
  { pid: 16329, args: 'postgres: checkpointer', kind: 'helper' },
  { pid: 16330, args: 'postgres: background writer', kind: 'helper' },
  { pid: 16333, args: 'postgres: walwriter', kind: 'helper' },
  { pid: 16334, args: 'postgres: autovacuum launcher', kind: 'helper' },
  { pid: 16335, args: 'postgres: logical replication launcher', kind: 'helper' },
];
const clients: Proc[] = [
  { pid: 16458, args: 'postgres: pocketpay pocketpay 172.29.0.1(53790) idle', kind: 'client' },
  { pid: 16459, args: 'postgres: pocketpay pocketpay 172.29.0.1(53796) idle', kind: 'client' },
  { pid: 16460, args: 'postgres: pocketpay pocketpay 172.29.0.1(53810) idle', kind: 'client' },
];

const moments = [
  { name: 'Nobody connected', procs: base, say: 'Postgres has just started and no client is connected. There are nine processes, and none of them works for a client: one main process plus helpers.' },
  { name: 'Pool of 3 open', procs: [...base, ...clients], say: 'Our program opened a pool of three connections. Three new processes appeared, one per connection. These are the “server processes” from the diagrams.' },
  { name: 'After pool.close()', procs: base, say: 'The pool closed its connections, and the three server processes exited. The main process and the helpers keep running.' },
];

const explain = {
  main: 'The main postgres process. The docs call it the postmaster: “the very first process” of a running Postgres, which starts the helper processes and “creates backend processes on demand”, one for each new connection.',
  helper: 'A helper (background) process that the main process starts by itself. Each one does a housekeeping job for the whole database, such as writing changed data to disk. None of them belongs to a client.',
  client: 'A server process for one client connection: ours. The title follows the pattern postgres: user database host activity. So: user pocketpay, database pocketpay, the address the connection came from, and what it’s doing right now (idle, waiting for a command).',
};

export default function ProcessList() {
  const [m, setM] = useState(1);
  const [sel, setSel] = useState<number>(16458);
  const procs = moments[m].procs;
  const picked = procs.find((p) => p.pid === sel) ?? procs[0];

  return (
    <figure className="not-prose my-6 rounded-lg border border-rule bg-panel p-4 text-ink sm:p-5">
      <div className="mb-3 inline-flex flex-wrap rounded-lg border border-rule p-1" role="tablist">
        {moments.map((x, k) => (
          <button key={x.name} role="tab" aria-selected={m === k} onClick={() => setM(k)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${m === k ? 'bg-sat text-on-sat' : 'text-muted'}`}>{x.name}</button>
        ))}
      </div>
      <p className="mb-2 text-sm text-muted">{moments[m].say}</p>

      <div className="overflow-x-auto rounded-md border border-rule bg-paper font-mono text-[13px]">
        <div className="flex gap-4 border-b border-rule px-3 py-1.5 font-bold text-muted"><span className="w-14">PID</span><span>COMMAND</span></div>
        {procs.map((p) => (
          <button key={p.pid} onClick={() => setSel(p.pid)} aria-pressed={picked.pid === p.pid}
            className={`flex w-full gap-4 whitespace-nowrap px-3 py-1 text-left ${picked.pid === p.pid ? 'bg-sun-soft' : ''}`}>
            <span className="w-14 shrink-0 text-muted">{p.pid}</span>
            <span className={p.kind === 'client' ? 'font-bold text-sat' : p.kind === 'main' ? 'font-bold' : ''}>{p.args}</span>
          </button>
        ))}
      </div>

      <p className="mt-3 rounded-r-lg border-l-4 border-sun bg-sun-soft px-4 py-3 leading-relaxed" aria-live="polite">
        <span className="font-mono font-bold">{picked.args}</span><br />{explain[picked.kind]}
      </p>
      <figcaption className="mt-2 text-sm text-muted">Real output from our laptop: <code>docker top payments-app-postgres-1 -o pid,args</code>. Click any line.</figcaption>
    </figure>
  );
}
