import { useEffect, useState } from 'react';
import ArchFigure from './ArchFigure';
import { sequences, type Step } from './sequences';

// A sequence diagram you step through: one message at a time, with what's happening written underneath.
const COL = 152;
const TOP = 70;
const ROW = 50;

const tone = {
  call: 'var(--sat)',
  reply: 'var(--muted)',
  self: 'var(--sat)',
  async: 'var(--sun)',
  refuse: 'var(--cut)',
} as const;

export default function Sequence({ name }: { name: keyof typeof sequences }) {
  const seq = sequences[name];
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const last = seq.steps.length - 1;

  useEffect(() => {
    if (!playing) return;
    if (i >= last) return setPlaying(false);
    const t = setTimeout(() => setI((n) => n + 1), 1400);
    return () => clearTimeout(t);
  }, [playing, i, last]);

  const col = (id: string) => 90 + seq.actors.findIndex((a) => a.id === id) * COL;
  const rowY = (k: number) => TOP + 40 + k * ROW;
  // Extra room on the right only if the last actor talks to itself (its label sits to the right).
  const lastActor = seq.actors[seq.actors.length - 1].id;
  const width = 180 + (seq.actors.length - 1) * COL + (seq.steps.some((s) => s.from === lastActor && s.to === lastActor) ? 260 : 10);
  const height = rowY(seq.steps.length) + 10;
  const step = seq.steps[i];

  return (
    <ArchFigure label={seq.title}>
      <figcaption className="mb-3 font-bold">{seq.title}</figcaption>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} style={{ minWidth: width * 0.8 }} className="block h-auto w-full"
          role="img" aria-label={`${seq.title}. Step ${i + 1} of ${seq.steps.length}: ${step.label}`}>
          <defs>
            {Object.entries(tone).map(([k, c]) => (
              <marker key={k} id={`sq-${name}-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                {k === 'async' ? <path d="M0,0 L10,5 L0,10" fill="none" stroke={c} strokeWidth={1.6} /> : <path d="M0,0 L10,5 L0,10 z" fill={c} />}
              </marker>
            ))}
          </defs>

          {seq.groups?.map((g) => {
            const xs = g.actors.map(col);
            const x1 = Math.min(...xs) - 68;
            const x2 = Math.max(...xs) + 68;
            const shown = i >= g.from;
            return (
              <g key={g.label} opacity={shown ? 1 : 0.25}>
                <rect x={x1} y={rowY(g.from) - 30} width={x2 - x1} height={(g.to - g.from + 1) * ROW + 6} rx={8}
                  fill="var(--sun-soft)" stroke="var(--sun)" strokeDasharray="5 4" />
                <text x={x2 - 8} y={rowY(g.to) + 22} textAnchor="end" fontSize={11.5} fontWeight={700} fill="var(--ink)">{g.label}</text>
              </g>
            );
          })}

          {seq.actors.map((a) => (
            <g key={a.id}>
              <line x1={col(a.id)} y1={TOP + 12} x2={col(a.id)} y2={height - 6} stroke="var(--rule)" strokeWidth={1.5} strokeDasharray="4 4" />
              <rect x={col(a.id) - 70} y={8} width={140} height={TOP - 8} rx={8}
                fill={a.outside ? 'var(--paper)' : 'var(--sat-soft)'} stroke={a.outside ? 'var(--rule)' : 'var(--sat)'} strokeWidth={1.5} />
              <text x={col(a.id)} y={a.sub ? 34 : 44} textAnchor="middle" fontSize={13.5} fontWeight={800} fill="var(--ink)">{a.label}</text>
              {a.sub && <text x={col(a.id)} y={52} textAnchor="middle" fontSize={11} fill="var(--muted)">{a.sub}</text>}
            </g>
          ))}

          {seq.steps.map((s, k) => (
            <Message key={k} s={s} k={k} y={rowY(k)} x1={col(s.from)} x2={col(s.to)} state={k < i ? 'past' : k === i ? 'now' : 'future'} marker={`sq-${name}-${s.kind}`} />
          ))}
        </svg>
      </div>

      <div className="sticky bottom-0 z-10 -mx-1 mt-1 bg-panel px-1 pt-2 pb-1">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => { setPlaying(false); setI(Math.max(0, i - 1)); }} disabled={i === 0}
          className="rounded-md border border-rule px-3 py-1 disabled:opacity-40">Back</button>
        <button onClick={() => { setPlaying(false); setI(Math.min(last, i + 1)); }} disabled={i === last}
          className="rounded-md bg-sat px-3 py-1 text-on-sat disabled:opacity-40">Next step</button>
        <button onClick={() => { if (i === last) setI(0); setPlaying((p) => !p); }}
          className="rounded-md border border-rule px-3 py-1">{playing ? 'Pause' : i === last ? 'Replay' : 'Play'}</button>
        <span className="ml-auto text-sm text-muted">Step {i + 1} of {seq.steps.length}</span>
      </div>
      <p className="mt-3 rounded-r-lg border-l-4 border-sun bg-sun-soft px-4 py-3 leading-relaxed" aria-live="polite">
        <span className="font-bold">{i + 1}. </span>{step.say}
      </p>
      </div>
    </ArchFigure>
  );
}

function Message({ s, k, y, x1, x2, state, marker }: { s: Step; k: number; y: number; x1: number; x2: number; state: 'past' | 'now' | 'future'; marker: string }) {
  const color = tone[s.kind];
  const opacity = state === 'future' ? 0.12 : 1;
  const weight = state === 'now' ? 3 : 1.6;
  const dash = s.kind === 'reply' ? '6 4' : s.kind === 'async' ? '2 3' : undefined;
  const textW = state === 'now' ? 800 : 500;

  if (s.from === s.to) {
    return (
      <g opacity={opacity}>
        {state === 'now' && <rect x={x1 + 4} y={y - 24} width={250} height={40} rx={6} fill="var(--sat-soft)" opacity={0.6} />}
        <path d={`M${x1},${y - 10} h34 v18 h-30`} fill="none" stroke={color} strokeWidth={weight} markerEnd={`url(#${marker})`} />
        <text x={x1 + 42} y={y + 3} fontSize={12} fontWeight={textW} fill={s.kind === 'refuse' ? 'var(--cut)' : 'var(--ink)'}>
          <tspan fill="var(--muted)" fontWeight={700}>{k + 1} </tspan>{s.label}
        </text>
      </g>
    );
  }
  const dir = x2 > x1 ? 1 : -1;
  const mid = (x1 + x2) / 2;
  return (
    <g opacity={opacity}>
      {state === 'now' && <rect x={Math.min(x1, x2)} y={y - 24} width={Math.abs(x2 - x1)} height={32} rx={6} fill="var(--sat-soft)" opacity={0.6} />}
      <line x1={x1 + dir * 3} y1={y} x2={x2 - dir * 3} y2={y} stroke={color} strokeWidth={weight} strokeDasharray={dash} markerEnd={`url(#${marker})`} />
      <text x={mid} y={y - 8} textAnchor="middle" fontSize={12} fontWeight={textW} fill={s.kind === 'refuse' ? 'var(--cut)' : 'var(--ink)'}>
        <tspan fill="var(--muted)" fontWeight={700}>{k + 1} </tspan>{s.label}
      </text>
    </g>
  );
}
