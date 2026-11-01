import { useState } from 'react';

// Riya pays Arjun while Arjun pays Riya, at the same moment. Behaviour follows the PostgreSQL docs
// (13.3.4 Deadlocks, deadlock_timeout); the people, amounts and timeline are an example.
type T = 'A' | 'B';
type Row = 'riya' | 'arjun';
type Step = { holds: Partial<Record<Row, T>>; waits: { t: T; row: Row }[]; note: string; alert?: boolean; done?: T[]; aborted?: T };

const payerFirst: Step[] = [
  { holds: {}, waits: [], note: 'Payment A: Riya pays Arjun ₹40. Payment B: Arjun pays Riya ₹20. Both start at the same moment. Each one locks the payer’s account first, then the payee’s.' },
  { holds: { riya: 'A' }, waits: [], note: 'A locks Riya’s account (A’s payer).' },
  { holds: { riya: 'A', arjun: 'B' }, waits: [], note: 'At the same moment, B locks Arjun’s account (B’s payer). So far, so good.' },
  { holds: { riya: 'A', arjun: 'B' }, waits: [{ t: 'A', row: 'arjun' }], note: 'A now needs Arjun’s account, but B is holding it. A waits for B to finish.' },
  { holds: { riya: 'A', arjun: 'B' }, waits: [{ t: 'A', row: 'arjun' }, { t: 'B', row: 'riya' }], alert: true,
    note: 'B now needs Riya’s account, but A is holding it. B waits for A. A is waiting for B, and B is waiting for A. Neither can ever move. This is a deadlock.' },
  { holds: { riya: 'A' }, waits: [{ t: 'A', row: 'arjun' }], aborted: 'B',
    note: 'After waiting for deadlock_timeout (1 second by default), Postgres checks, finds the loop, and cancels one transaction with error 40P01 (deadlock_detected). Here it picked B; the docs say you can’t predict which. B’s lock is released.' },
  { holds: {}, waits: [], done: ['A'], aborted: 'B',
    note: 'A gets Arjun’s account, writes its payment and commits. B failed, so Arjun’s payment didn’t happen. Our code has to notice the error and retry B.' },
];

const idOrder: Step[] = [
  { holds: {}, waits: [], note: 'Same two payments. This time both follow one rule: lock the account with the lower ID first. Riya’s is #1, Arjun’s is #2.' },
  { holds: { riya: 'A' }, waits: [], note: 'A locks Riya’s account (#1).' },
  { holds: { riya: 'A' }, waits: [{ t: 'B', row: 'riya' }], note: 'B also starts with #1, Riya’s account, even though B’s payer is Arjun. A holds it, so B waits. B isn’t holding anything yet.' },
  { holds: { riya: 'A', arjun: 'A' }, waits: [{ t: 'B', row: 'riya' }], note: 'A locks Arjun’s account (#2). Nobody else wants to hold it, so there’s no loop.' },
  { holds: { riya: 'B' }, waits: [], done: ['A'], note: 'A writes its payment and commits, releasing both locks. B gets Riya’s account.' },
  { holds: {}, waits: [], done: ['A', 'B'], note: 'B locks Arjun’s account, writes its payment and commits. Both payments succeed, one after the other. No deadlock is possible.' },
];

const pos: Record<T, { x: number; y: number }> = { A: { x: 95, y: 130 }, B: { x: 605, y: 130 } };
const rowPos: Record<Row, { x: number; y: number; label: string }> = {
  riya: { x: 350, y: 55, label: 'Riya’s account #1' },
  arjun: { x: 350, y: 205, label: 'Arjun’s account #2' },
};
const tone: Record<T, string> = { A: 'var(--sat)', B: 'var(--sun)' };

export default function DeadlockDemo() {
  const [ordered, setOrdered] = useState(false);
  const [i, setI] = useState(0);
  const steps = ordered ? idOrder : payerFirst;
  const s = steps[i];
  const pick = (v: boolean) => { setOrdered(v); setI(0); };

  // Pull a line's end back so arrows stop at the edge of the box or circle.
  const edge = (from: { x: number; y: number }, to: { x: number; y: number }, back: number) => {
    const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy);
    return { x: to.x - (dx / len) * back, y: to.y - (dy / len) * back };
  };

  return (
    <figure className="not-prose my-6 rounded-lg border border-rule bg-panel p-5 text-ink">
      <div className="mb-4 inline-flex rounded-lg border border-rule p-1" role="tablist">
        <button role="tab" aria-selected={!ordered} onClick={() => pick(false)} className={`rounded-md px-3.5 py-1.5 font-medium ${!ordered ? 'bg-cut text-paper' : 'text-muted'}`}>Lock the payer first</button>
        <button role="tab" aria-selected={ordered} onClick={() => pick(true)} className={`rounded-md px-3.5 py-1.5 font-medium ${ordered ? 'bg-keep text-paper' : 'text-muted'}`}>Lock the lower ID first</button>
      </div>

      <div className="overflow-x-auto">
        <svg viewBox="0 0 700 260" className="block h-auto w-full min-w-[520px]" role="img" aria-label="Which payment holds which account lock, and which payment is waiting">
          <defs>
            <marker id="dl-wait" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--cut)" />
            </marker>
          </defs>

          {(Object.keys(rowPos) as Row[]).map((r) => {
            const p = rowPos[r], h = s.holds[r];
            return (
              <g key={r}>
                <rect x={p.x - 95} y={p.y - 30} width={190} height={60} rx={8} fill={h ? 'var(--sun-soft)' : 'var(--paper)'} stroke={h ? tone[h] : 'var(--rule)'} strokeWidth={h ? 3 : 1.5} />
                <text x={p.x} y={p.y - 4} textAnchor="middle" fontSize={16} fontWeight={700} fill="var(--ink)">{p.label}</text>
                <text x={p.x} y={p.y + 17} textAnchor="middle" fontSize={14} fill="var(--muted)">{h ? `🔒 locked by ${h}` : 'unlocked'}</text>
              </g>
            );
          })}

          {(Object.entries(s.holds) as [Row, T][]).map(([r, t]) => {
            const end = edge(pos[t], rowPos[r], 100);
            return <line key={`h${r}`} x1={pos[t].x} y1={pos[t].y} x2={end.x} y2={end.y} stroke={tone[t]} strokeWidth={5} />;
          })}
          {s.waits.map((w) => {
            const end = edge(pos[w.t], rowPos[w.row], 104);
            const mid = { x: (pos[w.t].x + end.x) / 2, y: (pos[w.t].y + end.y) / 2 };
            return (
              <g key={`w${w.t}`}>
                <line x1={pos[w.t].x} y1={pos[w.t].y} x2={end.x} y2={end.y} stroke="var(--cut)" strokeWidth={2.5} strokeDasharray="7 5" markerEnd="url(#dl-wait)" />
                <text x={mid.x} y={mid.y + (w.row === 'riya' ? -10 : 22)} textAnchor="middle" fontSize={14} fontWeight={700} fill="var(--cut)">waits</text>
              </g>
            );
          })}

          {(['A', 'B'] as T[]).map((t) => {
            const p = pos[t], ok = s.done?.includes(t), bad = s.aborted === t;
            return (
              <g key={t} opacity={bad ? 0.45 : 1}>
                <circle cx={p.x} cy={p.y} r={44} fill={tone[t]} />
                <text x={p.x} y={p.y + 2} textAnchor="middle" fontSize={22} fontWeight={800} fill="var(--paper)">{t}</text>
                <text x={p.x} y={p.y + 22} textAnchor="middle" fontSize={12} fill="var(--paper)">{t === 'A' ? 'Riya → Arjun' : 'Arjun → Riya'}</text>
                {(ok || bad) && (
                  <text x={p.x} y={p.y + 68} textAnchor="middle" fontSize={15} fontWeight={800} fill={ok ? 'var(--keep)' : 'var(--cut)'}>{ok ? '✓ committed' : '✗ cancelled'}</text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <p className={`mt-3 min-h-[4.5em] rounded-r-lg border-l-4 px-4 py-3 leading-relaxed ${s.alert ? 'border-cut bg-sun-soft' : 'border-sun bg-sun-soft'}`} aria-live="polite">
        <span className="mr-1.5 font-black text-sun">{i + 1}</span>{s.note}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button onClick={() => setI(Math.max(0, i - 1))} className="rounded-md bg-sat px-3.5 py-1.5 font-medium text-on-sat">Back</button>
        <button onClick={() => setI(Math.min(steps.length - 1, i + 1))} className="rounded-md bg-sat px-3.5 py-1.5 font-medium text-on-sat">Next step</button>
        <span className="ml-1 text-sm text-muted">Step {i + 1} of {steps.length}. Solid line: holds the lock. Dashed red: waiting for it.</span>
      </div>
    </figure>
  );
}
