import { useState } from 'react';

// Names point at objects; `b = a` adds a second name for the same list, `a.copy()` makes a new list.
// Behaviour from the Python language reference, "Objects, values and types".
type Obj = { id: string; items: number[] };
type State = { names: Record<string, string>; objs: Obj[]; note: string };

const scenarios: Record<'alias' | 'copy', { lines: string[]; states: State[] }> = {
  alias: {
    lines: ['a = [1, 2]', 'b = a', 'b.append(3)'],
    states: [
      { names: { a: 'L1' }, objs: [{ id: 'L1', items: [1, 2] }], note: 'Python makes a list object, then sticks the name a on it.' },
      { names: { a: 'L1', b: 'L1' }, objs: [{ id: 'L1', items: [1, 2] }], note: 'No copy is made. b is a second name for the same list, so a is b is True.' },
      { names: { a: 'L1', b: 'L1' }, objs: [{ id: 'L1', items: [1, 2, 3] }], note: 'Changing the list through b changes what a sees too: a is now [1, 2, 3].' },
    ],
  },
  copy: {
    lines: ['a = [1, 2]', 'b = a.copy()', 'b.append(3)'],
    states: [
      { names: { a: 'L1' }, objs: [{ id: 'L1', items: [1, 2] }], note: 'Python makes a list object, then sticks the name a on it.' },
      { names: { a: 'L1', b: 'L2' }, objs: [{ id: 'L1', items: [1, 2] }, { id: 'L2', items: [1, 2] }], note: 'copy() builds a second list with the same items. a == b is True, but a is b is False.' },
      { names: { a: 'L1', b: 'L2' }, objs: [{ id: 'L1', items: [1, 2] }, { id: 'L2', items: [1, 2, 3] }], note: 'Only the copy changed. a is still [1, 2].' },
    ],
  },
};

export default function NamesDiagram() {
  const [kind, setKind] = useState<'alias' | 'copy'>('alias');
  const [step, setStep] = useState(0);
  const { lines, states } = scenarios[kind];
  const s = states[step];
  const objY = (id: string) => (id === 'L1' ? 40 : 130);
  const nameY = (n: string) => (n === 'a' ? 40 : 130);

  return (
    <figure className="not-prose my-6 rounded-lg border border-rule bg-panel p-5 text-ink">
      <div className="mb-4 inline-flex rounded-lg border border-rule p-1" role="tablist">
        {(['alias', 'copy'] as const).map((k) => (
          <button key={k} role="tab" aria-selected={kind === k} onClick={() => { setKind(k); setStep(0); }}
            className={`rounded-md px-3.5 py-1.5 font-medium ${kind === k ? 'bg-sat text-on-sat' : 'text-muted'}`}>
            {k === 'alias' ? 'b = a' : 'b = a.copy()'}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,14rem)_1fr]">
        <ol className="space-y-1 font-mono text-sm">
          {lines.map((l, i) => (
            <li key={l}>
              <button onClick={() => setStep(i)} aria-current={i === step}
                className={`w-full rounded px-2 py-1 text-left ${i === step ? 'bg-sun-soft font-bold' : i < step ? 'text-ink' : 'text-muted'}`}>
                {i + 1}&nbsp;&nbsp;{l}
              </button>
            </li>
          ))}
        </ol>

        <svg viewBox="0 0 440 180" className="block h-auto w-full" role="img" aria-label={s.note}>
          <defs>
            <marker id="nd-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--ink)" />
            </marker>
          </defs>
          <text x={10} y={14} fontSize={12} fill="var(--muted)">names</text>
          <text x={200} y={14} fontSize={12} fill="var(--muted)">objects in memory</text>
          {Object.entries(s.names).map(([n, target]) => (
            <g key={n}>
              <rect x={10} y={nameY(n) - 4} width={50} height={36} rx={6} fill="var(--sun-soft)" stroke="var(--sun)" strokeWidth={2} />
              <text x={35} y={nameY(n) + 19} fontSize={18} fontWeight={700} textAnchor="middle" fill="var(--ink)" fontFamily="monospace">{n}</text>
              <line x1={62} y1={nameY(n) + 14} x2={196} y2={objY(target) + 14} stroke="var(--ink)" strokeWidth={2} markerEnd="url(#nd-arrow)" />
            </g>
          ))}
          {s.objs.map((o) => (
            <g key={o.id}>
              <rect x={200} y={objY(o.id) - 4} width={30 + o.items.length * 44} height={36} rx={6} fill="var(--paper)" stroke="var(--sat)" strokeWidth={2} />
              {o.items.map((v, i) => (
                <g key={i}>
                  {i > 0 && <line x1={215 + i * 44} y1={objY(o.id) - 4} x2={215 + i * 44} y2={objY(o.id) + 32} stroke="var(--rule)" />}
                  <text x={237 + i * 44} y={objY(o.id) + 19} fontSize={16} textAnchor="middle" fill="var(--ink)" fontFamily="monospace">{v}</text>
                </g>
              ))}
              <text x={205} y={objY(o.id) + 50} fontSize={12} fill="var(--muted)">list object {o.id === 'L1' ? '#1' : '#2'}</text>
            </g>
          ))}
        </svg>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} className="rounded-md border border-rule px-3 py-1 disabled:opacity-40">Back</button>
        <button onClick={() => setStep(Math.min(lines.length - 1, step + 1))} disabled={step === lines.length - 1} className="rounded-md bg-sat px-3 py-1 text-on-sat disabled:opacity-40">Next line</button>
      </div>
      <p className="mt-3 rounded-r-lg border-l-4 border-sun bg-sun-soft px-4 py-3 leading-relaxed" aria-live="polite">{s.note}</p>
    </figure>
  );
}
