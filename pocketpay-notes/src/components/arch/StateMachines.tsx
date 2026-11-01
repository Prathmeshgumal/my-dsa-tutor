import { useState } from 'react';

// The payment and card state machines. Press events to move the current state; an event that isn't allowed from
// the current state is refused, which is the whole point of a state machine. PocketPay's own design (a draft).
type Machine = {
  name: string;
  start: string;
  states: { id: string; x: number; y: number; final?: boolean; bad?: boolean }[];
  moves: { from: string; to: string; on: string; d: string; lx: number; ly: number }[];
  events: string[];
  note: string;
};

const machines: Machine[] = [
  {
    name: 'Payment',
    start: 'created',
    states: [
      { id: 'created', x: 90, y: 150 },
      { id: 'held', x: 300, y: 50 },
      { id: 'processing', x: 300, y: 150 },
      { id: 'failed', x: 300, y: 270, final: true, bad: true },
      { id: 'succeeded', x: 530, y: 150 },
      { id: 'partially_refunded', x: 760, y: 70 },
      { id: 'refunded', x: 760, y: 230, final: true },
    ],
    moves: [
      { from: 'created', to: 'processing', on: 'checks pass', d: 'M160,150 H222', lx: 191, ly: 141 },
      { from: 'created', to: 'held', on: 'risk hold', d: 'M130,128 Q170,50 222,50', lx: 128, ly: 80 },
      { from: 'held', to: 'processing', on: 'approved', d: 'M300,72 V128', lx: 308, ly: 104 },
      { from: 'held', to: 'failed', on: 'rejected', d: 'M378,58 Q440,160 352,262', lx: 418, ly: 210 },
      { from: 'processing', to: 'succeeded', on: 'bank: success', d: 'M378,150 H452', lx: 415, ly: 141 },
      { from: 'processing', to: 'failed', on: 'bank: failure', d: 'M300,172 V248', lx: 308, ly: 214 },
      { from: 'succeeded', to: 'partially_refunded', on: 'refund part', d: 'M590,132 Q640,70 672,70', lx: 590, ly: 92 },
      { from: 'succeeded', to: 'refunded', on: 'refund all', d: 'M590,168 Q640,230 690,230', lx: 600, ly: 226 },
      { from: 'partially_refunded', to: 'partially_refunded', on: 'refund part', d: 'M800,50 C850,0 880,40 848,64', lx: 860, ly: 24 },
      { from: 'partially_refunded', to: 'refunded', on: 'refund rest', d: 'M760,92 V208', lx: 768, ly: 156 },
    ],
    events: ['checks pass', 'risk hold', 'approved', 'rejected', 'bank: success', 'bank: failure', 'refund part', 'refund all', 'refund rest'],
    note: 'failed and refunded are final: nothing moves a payment out of them. A late “bank: success” for a failed payment is refused, and the reconciliation report flags it for a person.',
  },
  {
    name: 'Card',
    start: 'active',
    states: [
      { id: 'active', x: 200, y: 110 },
      { id: 'paused', x: 520, y: 110 },
      { id: 'blocked', x: 360, y: 260, final: true, bad: true },
    ],
    moves: [
      { from: 'active', to: 'paused', on: 'pause', d: 'M262,96 H458', lx: 360, ly: 86 },
      { from: 'paused', to: 'active', on: 'resume', d: 'M458,124 H262', lx: 360, ly: 144 },
      { from: 'active', to: 'blocked', on: 'block', d: 'M230,132 Q260,250 288,258', lx: 210, ly: 210 },
      { from: 'paused', to: 'blocked', on: 'block', d: 'M490,132 Q460,250 432,258', lx: 488, ly: 210 },
    ],
    events: ['pause', 'resume', 'block'],
    note: 'Pausing is reversible, for a card left at home. Blocking is final, for a lost or stolen card: a new card would be a new row.',
  },
];

export default function StateMachines() {
  const [m, setM] = useState(0);
  const mc = machines[m];
  const [state, setState] = useState(mc.start);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const [lastMove, setLastMove] = useState<string | null>(null);

  const pick = (k: number) => { setM(k); setState(machines[k].start); setMsg(null); setLastMove(null); };
  const fire = (ev: string) => {
    const mv = mc.moves.find((x) => x.from === state && x.on === ev);
    if (!mv) {
      setMsg({ text: `Refused: “${ev}” isn’t allowed from ${state}. The code raises an error and nothing changes.`, bad: true });
      setLastMove(null);
      return;
    }
    setState(mv.to);
    setLastMove(`${mv.from}>${mv.to}>${mv.on}`);
    setMsg({ text: `${mv.from} → ${mv.to}`, bad: false });
  };

  return (
    <figure className="not-prose my-6 rounded-lg border border-rule bg-panel p-4 text-ink sm:p-5">
      <div className="mb-3 inline-flex rounded-lg border border-rule p-1" role="tablist">
        {machines.map((x, k) => (
          <button key={x.name} role="tab" aria-selected={m === k} onClick={() => pick(k)}
            className={`rounded-md px-3.5 py-1.5 font-medium ${m === k ? 'bg-sat text-on-sat' : 'text-muted'}`}>{x.name}</button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={m === 0 ? '0 0 900 310' : '0 0 720 300'} className="mx-auto block h-auto w-full min-w-[560px]" role="img"
          aria-label={`${mc.name} state machine. Current state: ${state}.`}>
          <defs>
            <marker id="st-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
            </marker>
          </defs>
          {mc.moves.map((mv) => {
            const on = lastMove === `${mv.from}>${mv.to}>${mv.on}`;
            const possible = mv.from === state;
            return (
              <g key={`${mv.from}-${mv.to}-${mv.on}`}>
                <path d={mv.d} fill="none" stroke={on ? 'var(--sun)' : possible ? 'var(--sat)' : 'var(--rule)'} strokeWidth={on ? 3.2 : possible ? 2.2 : 1.5}
                  markerEnd="url(#st-arrow)" className={on ? 'arch-flow' : undefined} />
                <text x={mv.lx} y={mv.ly} textAnchor="middle" fontSize={12} fontWeight={possible || on ? 700 : 500} fill={possible || on ? 'var(--ink)' : 'var(--muted)'}>{mv.on}</text>
              </g>
            );
          })}
          {mc.states.map((s) => {
            const here = s.id === state;
            const w = Math.max(118, s.id.length * 9 + 26);
            return (
              <g key={s.id}>
                <rect x={s.x - w / 2} y={s.y - 22} width={w} height={44} rx={22}
                  fill={here ? (s.bad ? 'var(--cut)' : 'var(--sat)') : 'var(--paper)'} stroke={s.bad ? 'var(--cut)' : 'var(--sat)'} strokeWidth={here ? 3 : 1.8} />
                {s.final && <rect x={s.x - w / 2 + 4} y={s.y - 18} width={w - 8} height={36} rx={18} fill="none" stroke={here ? 'var(--paper)' : s.bad ? 'var(--cut)' : 'var(--sat)'} strokeWidth={1.2} />}
                <text x={s.x} y={s.y + 5} textAnchor="middle" fontSize={13.5} fontWeight={800} fontFamily="var(--font-mono)" fill={here ? 'var(--paper)' : 'var(--ink)'}>{s.id}</text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Events">
        {mc.events.map((ev) => {
          const ok = mc.moves.some((x) => x.from === state && x.on === ev);
          return (
            <button key={ev} onClick={() => fire(ev)}
              className={`rounded-md border px-3 py-1 text-sm ${ok ? 'border-sat font-medium' : 'border-rule text-muted'}`}>{ev}</button>
          );
        })}
        <button onClick={() => pick(m)} className="ml-auto rounded-md border border-rule px-3 py-1 text-sm">Start over</button>
      </div>
      <p className={`mt-3 rounded-r-lg border-l-4 px-4 py-3 leading-relaxed ${msg?.bad ? 'border-cut bg-sun-soft' : 'border-sun bg-sun-soft'}`} aria-live="polite">
        {msg ? <span className={msg.bad ? 'font-medium text-cut' : 'font-mono font-bold'}>{msg.text}</span> : <>Current state: <span className="font-mono font-bold">{state}</span>. Press an event. Blue arrows are the moves allowed right now.</>}
      </p>
      <figcaption className="mt-2 text-sm text-muted">{mc.note} Double outlines mark final states.</figcaption>
    </figure>
  );
}
