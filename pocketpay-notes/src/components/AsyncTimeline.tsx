import { useState } from 'react';

// Three requests on one thread, without and with async. Timings are illustrative; the behaviour
// (one task runs at a time, await hands the thread to the next task) is from the asyncio docs.
type Seg = { from: number; to: number; kind: 'work' | 'wait' };
type Req = { name: string; waitsFor: string; segs: Seg[] };

const plain: Req[] = [
  { name: 'Riya pays ₹40', waitsFor: 'database', segs: [{ from: 0, to: 1, kind: 'work' }, { from: 1, to: 4, kind: 'wait' }, { from: 4, to: 5, kind: 'work' }] },
  { name: 'Arjun checks balance', waitsFor: 'database', segs: [{ from: 5, to: 6, kind: 'work' }, { from: 6, to: 8, kind: 'wait' }, { from: 8, to: 9, kind: 'work' }] },
  { name: 'Agent asks the LLM', waitsFor: 'LLM API', segs: [{ from: 9, to: 10, kind: 'work' }, { from: 10, to: 16, kind: 'wait' }, { from: 16, to: 17, kind: 'work' }] },
];

const withAsync: Req[] = [
  { name: 'Riya pays ₹40', waitsFor: 'database', segs: [{ from: 0, to: 1, kind: 'work' }, { from: 1, to: 4, kind: 'wait' }, { from: 4, to: 5, kind: 'work' }] },
  { name: 'Arjun checks balance', waitsFor: 'database', segs: [{ from: 1, to: 2, kind: 'work' }, { from: 2, to: 4, kind: 'wait' }, { from: 5, to: 6, kind: 'work' }] },
  { name: 'Agent asks the LLM', waitsFor: 'LLM API', segs: [{ from: 2, to: 3, kind: 'work' }, { from: 3, to: 9, kind: 'wait' }, { from: 9, to: 10, kind: 'work' }] },
];

const colors = ['var(--sat)', 'var(--sun)', 'var(--keep)'];
const W = 17;

export default function AsyncTimeline() {
  const [isAsync, setAsync] = useState(false);
  const reqs = isAsync ? withAsync : plain;
  const total = Math.max(...reqs.flatMap((r) => r.segs.map((s) => s.to)));
  const x = (t: number) => 190 + (t / W) * 600;
  const rowY = (i: number) => 30 + i * 52;

  return (
    <figure className="not-prose my-6 rounded-lg border border-rule bg-panel p-5 text-ink">
      <div className="mb-4 inline-flex rounded-lg border border-rule p-1" role="tablist">
        <button role="tab" aria-selected={!isAsync} onClick={() => setAsync(false)} className={`rounded-md px-3.5 py-1.5 font-medium ${!isAsync ? 'bg-sat text-on-sat' : 'text-muted'}`}>One at a time</button>
        <button role="tab" aria-selected={isAsync} onClick={() => setAsync(true)} className={`rounded-md px-3.5 py-1.5 font-medium ${isAsync ? 'bg-sat text-on-sat' : 'text-muted'}`}>With async / await</button>
      </div>

      <div className="overflow-x-auto">
        <svg viewBox="0 0 820 260" className="block h-auto w-full min-w-[620px]" role="img" aria-label={`Timeline of three requests, ${isAsync ? 'with async: waits overlap' : 'one at a time: each waits for the previous one'}`}>
          {reqs.map((r, i) => (
            <g key={r.name}>
              <text x={10} y={rowY(i) + 16} fontSize={14} fontWeight={700} fill="var(--ink)">{r.name}</text>
              <text x={10} y={rowY(i) + 33} fontSize={12} fill="var(--muted)">waits for the {r.waitsFor}</text>
              {r.segs.map((s, k) => (
                <rect key={k} x={x(s.from)} y={rowY(i) + 4} width={x(s.to) - x(s.from)} height={30} rx={4}
                  fill={s.kind === 'work' ? colors[i] : 'none'} stroke={colors[i]} strokeWidth={2} strokeDasharray={s.kind === 'wait' ? '5 4' : undefined}
                  style={{ transition: 'x 400ms ease, width 400ms ease' }} />
              ))}
            </g>
          ))}

          <line x1={190} y1={196} x2={790} y2={196} stroke="var(--rule)" strokeWidth={1.5} />
          <text x={10} y={214} fontSize={14} fontWeight={700} fill="var(--ink)">The one thread</text>
          {reqs.flatMap((r, i) => r.segs.filter((s) => s.kind === 'work').map((s, k) => (
            <rect key={`${i}-${k}`} x={x(s.from)} y={202} width={x(s.to) - x(s.from)} height={20} rx={3} fill={colors[i]} style={{ transition: 'x 400ms ease' }} />
          )))}
          <line x1={x(total)} y1={20} x2={x(total)} y2={232} stroke="var(--cut)" strokeWidth={2} />
          <text x={x(total) + 6} y={248} fontSize={14} fontWeight={800} fill="var(--cut)">all done at {total}</text>
        </svg>
      </div>

      <div className="mt-2 flex flex-wrap gap-4 text-sm text-muted">
        <span><span className="mr-1.5 inline-block h-3 w-6 rounded-sm bg-sat align-middle" />working (needs the thread)</span>
        <span><span className="mr-1.5 inline-block h-3 w-6 rounded-sm border-2 border-dashed border-sat align-middle" />waiting (doesn’t need it)</span>
      </div>
      <p className="mt-3 rounded-r-lg border-l-4 border-sun bg-sun-soft px-4 py-3 leading-relaxed" aria-live="polite">
        {isAsync
          ? 'While Riya’s request waits for the database, the thread starts Arjun’s, then the agent’s. The waits overlap, so everything finishes at 10 instead of 17. The thread still only does one piece of work at a time.'
          : 'Each request holds the thread the whole time, even while it’s only waiting. Arjun can’t start until Riya is completely done. Most of the time, the thread is doing nothing.'}
      </p>
      <figcaption className="mt-2 text-sm text-muted">Timings are made up to show the idea; real database calls take milliseconds and LLM calls take seconds.</figcaption>
    </figure>
  );
}
