import { useState } from 'react';

// Eight requests that each need one query, with and without a connection pool. Timings are illustrative:
// connecting is drawn 3× as long as a query so both fit; on our laptop it measured about 30× (see the page).
const ARRIVE = [0, 0, 1, 1, 2, 3, 3, 4];
const CONNECT = 6;
const QUERY = 2;
const W = 18;

type Row = { arrive: number; wait: number; connect: number; start: number; end: number; conn: number };

function noPool(): Row[] {
  return ARRIVE.map((a, k) => ({ arrive: a, wait: 0, connect: CONNECT, start: a + CONNECT, end: a + CONNECT + QUERY, conn: k }));
}

function withPool(size: number): Row[] {
  const free = Array(size).fill(0); // when each pooled connection is next free
  return ARRIVE.map((a) => {
    const conn = free.indexOf(Math.min(...free));
    const start = Math.max(a, free[conn]);
    free[conn] = start + QUERY;
    return { arrive: a, wait: start - a, connect: 0, start, end: start + QUERY, conn };
  });
}

// The most connections open at the same moment.
function peak(rows: Row[], pooled: number | null) {
  if (pooled !== null) return pooled;
  let best = 0;
  for (let t = 0; t < W; t += 0.5) best = Math.max(best, rows.filter((r) => r.arrive <= t && t < r.end).length);
  return best;
}

const connColors = ['var(--sat)', 'var(--sun)', 'var(--keep)', 'var(--cut)'];

export default function PoolDemo() {
  const [pooled, setPooled] = useState(false);
  const [size, setSize] = useState(3);
  const rows = pooled ? withPool(size) : noPool();
  const done = Math.max(...rows.map((r) => r.end));
  const connecting = rows.reduce((s, r) => s + r.connect, 0);
  const waited = rows.reduce((s, r) => s + r.wait, 0);
  const x = (t: number) => 170 + (t / W) * 620;
  const rowY = (k: number) => 34 + k * 34;

  return (
    <figure className="not-prose my-6 rounded-lg border border-rule bg-panel p-4 text-ink sm:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-rule p-1" role="tablist">
          <button role="tab" aria-selected={!pooled} onClick={() => setPooled(false)} className={`rounded-md px-3.5 py-1.5 font-medium ${!pooled ? 'bg-sat text-on-sat' : 'text-muted'}`}>New connection each time</button>
          <button role="tab" aria-selected={pooled} onClick={() => setPooled(true)} className={`rounded-md px-3.5 py-1.5 font-medium ${pooled ? 'bg-sat text-on-sat' : 'text-muted'}`}>With a pool</button>
        </div>
        {pooled && (
          <label className="flex items-center gap-2 text-sm">
            Pool size
            <input type="range" min={1} max={4} value={size} onChange={(e) => setSize(Number(e.target.value))} className="accent-[var(--sat)]" />
            <span className="w-4 font-mono font-bold">{size}</span>
          </label>
        )}
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 820 ${rowY(ARRIVE.length) + 30}`} className="block h-auto w-full min-w-[620px]" role="img"
          aria-label={`Eight requests ${pooled ? `sharing a pool of ${size} connections` : 'each opening a new connection'}. All done at ${done}.`}>
          <defs>
            <pattern id="pd-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="var(--paper)" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--muted)" strokeWidth="2.5" />
            </pattern>
          </defs>
          {[0, 3, 6, 9, 12, 15, 18].map((t) => (
            <g key={t}>
              <line x1={x(t)} y1={28} x2={x(t)} y2={rowY(ARRIVE.length)} stroke="var(--rule)" strokeWidth={0.8} />
              <text x={x(t)} y={rowY(ARRIVE.length) + 16} textAnchor="middle" fontSize={11} fill="var(--muted)">{t}</text>
            </g>
          ))}
          {rows.map((r, k) => {
            const c = pooled ? connColors[r.conn] : 'var(--sat)';
            return (
              <g key={k}>
                <text x={10} y={rowY(k) + 18} fontSize={12.5} fontWeight={700} fill="var(--ink)">Request {k + 1}</text>
                <text x={86} y={rowY(k) + 18} fontSize={11} fill="var(--muted)">arrives at {r.arrive}</text>
                {r.wait > 0 && <rect x={x(r.arrive)} y={rowY(k) + 5} width={x(r.start) - x(r.arrive)} height={20} rx={3} fill="none" stroke="var(--muted)" strokeWidth={1.5} strokeDasharray="4 3" />}
                {r.connect > 0 && <rect x={x(r.arrive)} y={rowY(k) + 5} width={x(r.arrive + r.connect) - x(r.arrive)} height={20} rx={3} fill="url(#pd-hatch)" stroke="var(--muted)" strokeWidth={1} />}
                <rect x={x(r.start)} y={rowY(k) + 5} width={x(r.end) - x(r.start)} height={20} rx={3} fill={c} />
                {pooled && <text x={x(r.end) + 6} y={rowY(k) + 19} fontSize={11} fontWeight={700} fill="var(--muted)">conn {r.conn + 1}</text>}
              </g>
            );
          })}
          <line x1={x(done)} y1={22} x2={x(done)} y2={rowY(ARRIVE.length)} stroke="var(--cut)" strokeWidth={2} />
          <text x={x(done) + 6} y={18} textAnchor="middle" fontSize={12} fontWeight={800} fill="var(--cut)">all done at {done}</text>
        </svg>
      </div>

      <div className="mt-2 flex flex-wrap gap-4 text-sm text-muted">
        <span><span className="mr-1.5 inline-block h-3 w-6 rounded-sm border border-muted align-middle" style={{ background: 'repeating-linear-gradient(45deg, var(--muted) 0 2px, var(--paper) 2px 5px)' }} />opening a connection</span>
        <span><span className="mr-1.5 inline-block h-3 w-6 rounded-sm bg-sat align-middle" />running the query{pooled ? ' (colour = which connection)' : ''}</span>
        <span><span className="mr-1.5 inline-block h-3 w-6 rounded-sm border-2 border-dashed border-muted align-middle" />waiting for a free connection</span>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
        <div className="rounded-md border border-rule p-2"><dt className="text-muted">time spent connecting</dt><dd className="text-lg font-bold">{connecting}</dd></div>
        <div className="rounded-md border border-rule p-2"><dt className="text-muted">time spent waiting</dt><dd className="text-lg font-bold">{waited}</dd></div>
        <div className="rounded-md border border-rule p-2"><dt className="text-muted">most server processes at once</dt><dd className="text-lg font-bold">{peak(rows, pooled ? size : null)}</dd></div>
      </dl>

      <p className="mt-3 rounded-r-lg border-l-4 border-sun bg-sun-soft px-4 py-3 leading-relaxed" aria-live="polite">
        {!pooled
          ? 'Every request pays the full price of opening a connection before its query can start, then throws the connection away. Postgres also has to start and stop a server process each time, and a burst of requests means a burst of processes.'
          : size === 1
            ? 'One connection, shared by everyone. Nobody pays to connect, but the requests queue up and take turns, so most of the time goes to waiting. Too small a pool is a bottleneck.'
            : `The ${size} connections were opened once, when the program started, so no request pays to connect. A request takes whichever connection is free and gives it back when done. When all ${size} are busy, the next request waits its turn.`}
      </p>
      <figcaption className="mt-2 text-sm text-muted">Timings are made up to show the idea. Connecting is drawn 3× as long as a query; on our laptop it measured about 30×.</figcaption>
    </figure>
  );
}
