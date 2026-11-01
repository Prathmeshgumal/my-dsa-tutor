import { useState } from 'react';

// Where everything runs on the laptop: our program, Docker's port forward, the postgres container and its
// processes. One server process per connection is from the PostgreSQL docs; the setup is ours (docker-compose.yml).
const views = [
  { name: 'Nothing connected', py: 0, psql: false, say: 'Postgres is running in its container and listening on port 5432, but no one is connected. Only the main postgres process (and some background helpers we leave out here) exists.' },
  { name: 'One connection', py: 1, psql: false, say: 'Our program connects once. Postgres starts one server process for it. That pair, our program at one end and that process at the other, is “a connection”.' },
  { name: 'A pool of 3', py: 3, psql: false, say: 'A pool opens three connections and keeps them open. Postgres now runs three server processes, one per connection, even while they sit idle waiting for work.' },
  { name: 'Plus psql', py: 3, psql: true, say: 'psql, Postgres’s own command-line tool, is just another client. It gets its own connection and its own server process, exactly like our program.' },
];

export default function DbMap() {
  const [v, setV] = useState(2);
  const view = views[v];
  const conns = [...Array(view.py).keys()].map((k) => ({ id: `py${k}`, from: 'py', y: 142 + k * 42 }));
  if (view.psql) conns.push({ id: 'psql', from: 'psql', y: 142 + 3 * 42 });

  return (
    <figure className="not-prose my-6 rounded-lg border border-rule bg-panel p-4 text-ink sm:p-5">
      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Pick a situation">
        {views.map((x, k) => (
          <button key={x.name} onClick={() => setV(k)} aria-pressed={v === k}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium ${v === k ? 'border-sat bg-sat text-on-sat' : 'border-rule'}`}>{x.name}</button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <svg viewBox="0 0 880 330" className="mx-auto block h-auto w-full min-w-[620px]" role="img"
          aria-label={`Diagram of our program, Docker and Postgres. ${view.name}: ${view.say}`}>
          <defs>
            <marker id="dm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
            </marker>
          </defs>

          {/* the laptop */}
          <rect x={8} y={8} width={864} height={314} rx={12} fill="none" stroke="var(--rule)" strokeWidth={1.5} strokeDasharray="6 5" />
          <text x={24} y={32} fontSize={13} fontWeight={700} fill="var(--muted)">Your laptop</text>

          {/* clients */}
          <rect x={30} y={96} width={190} height={120} rx={10} fill="var(--sat-soft)" stroke="var(--sat)" strokeWidth={1.6} />
          <text x={125} y={124} textAnchor="middle" fontSize={14} fontWeight={800} fill="var(--ink)">Our Python program</text>
          <text x={125} y={142} textAnchor="middle" fontSize={11.5} fill="var(--muted)">the tests now, the API later</text>
          <text x={125} y={160} textAnchor="middle" fontSize={11.5} fill="var(--muted)">talks through psycopg</text>
          {view.py > 1 && <text x={125} y={196} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--sat)">pool: {view.py} open connections</text>}

          <g opacity={view.psql ? 1 : 0.25}>
            <rect x={30} y={238} width={190} height={56} rx={10} fill="var(--paper)" stroke={view.psql ? 'var(--sat)' : 'var(--rule)'} strokeWidth={1.6} />
            <text x={125} y={262} textAnchor="middle" fontSize={14} fontWeight={800} fill="var(--ink)">psql</text>
            <text x={125} y={280} textAnchor="middle" fontSize={11.5} fill="var(--muted)">another client</text>
          </g>

          {/* the port forward */}
          <rect x={300} y={70} width={110} height={230} rx={10} fill="var(--paper)" stroke="var(--sun)" strokeWidth={1.6} />
          <text x={355} y={92} textAnchor="middle" fontSize={13} fontWeight={800} fill="var(--ink)">localhost</text>
          <text x={355} y={110} textAnchor="middle" fontSize={13} fontWeight={800} fill="var(--sun)">:5432</text>
          <text x={355} y={128} textAnchor="middle" fontSize={11} fill="var(--muted)">Docker forwards it</text>

          {/* the container */}
          <rect x={470} y={40} width={390} height={270} rx={12} fill="var(--paper)" stroke="var(--sat)" strokeWidth={1.6} />
          <text x={486} y={62} fontSize={13} fontWeight={700} fill="var(--muted)">Docker container · postgres:18 · listening on 5432</text>
          <rect x={490} y={74} width={150} height={34} rx={8} fill="var(--sat)" />
          <text x={565} y={96} textAnchor="middle" fontSize={13} fontWeight={800} fill="var(--on-sat)">postgres (main)</text>
          <text x={490} y={128} fontSize={11.5} fill="var(--muted)">always running, waits for new connections</text>

          {conns.map((c) => (
            <g key={c.id}>
              <path d={`M220,${c.from === 'py' ? 150 : 266} C260,${c.from === 'py' ? 150 : 266} 270,${c.y + 15} 300,${c.y + 15} H600`}
                fill="none" stroke="var(--sat)" strokeWidth={2.2} markerEnd="url(#dm-arrow)" markerStart="url(#dm-arrow)" />
              <rect x={604} y={c.y} width={160} height={30} rx={8} fill="var(--sat-soft)" stroke="var(--sat)" strokeWidth={1.4} />
              <text x={684} y={c.y + 20} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--ink)">server process {c.id === 'psql' ? '(psql)' : `#${Number(c.id.slice(2)) + 1}`}</text>
            </g>
          ))}
          {conns.length === 0 && <text x={684} y={190} textAnchor="middle" fontSize={12.5} fill="var(--muted)">no server processes for clients yet</text>}

          <rect x={778} y={74} width={74} height={44} rx={6} fill="var(--paper)" stroke="var(--rule)" strokeWidth={1.4} />
          <text x={815} y={94} textAnchor="middle" fontSize={11.5} fontWeight={700} fill="var(--ink)">data files</text>
          <text x={815} y={109} textAnchor="middle" fontSize={10.5} fill="var(--muted)">volume pgdata</text>
        </svg>
      </div>
      <p className="mt-3 rounded-r-lg border-l-4 border-sun bg-sun-soft px-4 py-3 leading-relaxed" aria-live="polite">
        <span className="font-bold">{view.name}: </span>{view.say}
      </p>
    </figure>
  );
}
