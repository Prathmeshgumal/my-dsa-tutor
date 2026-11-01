import { useState } from 'react';

// The life of one row in idempotency_keys, as built in backend/pocketpay/payments.py (PocketPay's own design).
// Pick a situation to see which moves happen and what the client gets back.
type Edge = 'claim' | 'finish' | 'takeover' | 'release' | 'replay' | 'busy';

const situations: { name: string; path: Edge[]; at: ('none' | 'started' | 'finished')[]; answer: string; say: string }[] = [
  { name: 'First request', path: ['claim', 'finish'], at: ['none', 'started', 'finished'], answer: '201 Created',
    say: 'No row exists, so the INSERT succeeds and this request owns the key. It pays, saves its answer on the row, and commits both together.' },
  { name: 'Repeat while it’s running', path: ['busy'], at: ['started'], answer: '409 Conflict',
    say: 'The INSERT finds the row already there, still started and recently claimed. The first request is mid-payment, so this one is told to try again later. Nothing changes.' },
  { name: 'Repeat after it finished', path: ['replay'], at: ['finished'], answer: 'the saved answer',
    say: 'The row is finished, with the first request’s status code and body saved on it. This request gets exactly that back, so the app sees the same payment ID as the first time.' },
  { name: 'Same key, different body', path: [], at: ['started', 'finished'], answer: '422',
    say: 'Before anything else, the request’s fingerprint is compared with the one saved on the row. They differ (say, ₹40 then ₹400), so the key is being misused. Refused, whatever state the row is in.' },
  { name: 'Not enough money', path: ['claim', 'finish'], at: ['none', 'started', 'finished'], answer: '422 (saved)',
    say: 'The request owns the key, but the ledger refuses the payment. Only the payment part is undone; the refusal itself is saved on the key, so a retry gets the same 422 instead of a surprise.' },
  { name: 'The server crashes mid-payment', path: ['claim', 'takeover', 'finish'], at: ['none', 'started', 'finished'], answer: '201 (for the retry)',
    say: 'The payment’s transaction never committed, so no money moved, but the row is stuck at started. After 60 seconds untouched, a retry takes the key over with a new owner ID and pays.' },
  { name: 'An unexpected error', path: ['claim', 'release'], at: ['none', 'started'], answer: '500, then a retry works',
    say: 'A bug or a database hiccup breaks the payment. Its transaction rolls back, and the request deletes the key it claimed before answering 500, so a retry can start fresh straight away.' },
];

const box = { none: { x: 20, label: 'no row', sub: 'key never seen' }, started: { x: 340, label: 'started', sub: 'one request owns it' }, finished: { x: 660, label: 'finished', sub: 'answer saved' } };
const BW = 180;
const Y = 110;

const edges: Record<Edge, { d: string; label: string; lx: number; ly: number }> = {
  claim: { d: `M${20 + BW},${Y + 10} H${340}`, label: 'INSERT: claim it', lx: 280, ly: Y },
  finish: { d: `M${340 + BW},${Y + 10} H${660}`, label: 'pay + save answer', lx: 600, ly: Y },
  takeover: { d: `M${400},${Y - 26} C${400},${Y - 90} ${460},${Y - 90} ${460},${Y - 26}`, label: 'stale for 60 s: take over', lx: 430, ly: Y - 92 },
  release: { d: `M${380},${Y + 46} C${380},${Y + 110} ${110},${Y + 110} ${110},${Y + 46}`, label: 'error: delete it (release)', lx: 245, ly: Y + 126 },
  replay: { d: `M${720},${Y - 26} C${720},${Y - 90} ${780},${Y - 90} ${780},${Y - 26}`, label: 'repeat: send saved answer', lx: 750, ly: Y - 92 },
  busy: { d: `M${440},${Y + 46} C${440},${Y + 90} ${490},${Y + 90} ${490},${Y + 46}`, label: 'repeat: 409, no change', lx: 560, ly: Y + 84 },
};

export default function KeyLifecycle() {
  const [i, setI] = useState(0);
  const s = situations[i];
  const lit = new Set(s.path);
  const litBox = new Set(s.at);

  return (
    <figure className="not-prose my-6 rounded-lg border border-rule bg-panel p-4 text-ink sm:p-5">
      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Pick a situation">
        {situations.map((x, k) => (
          <button key={x.name} onClick={() => setI(k)} aria-pressed={i === k}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium ${i === k ? 'border-sat bg-sat text-on-sat' : 'border-rule'}`}>{x.name}</button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <svg viewBox="0 0 860 260" className="mx-auto block h-auto w-full min-w-[620px]" role="img"
          aria-label={`Life of an idempotency key. ${s.name}: ${s.say} The client gets ${s.answer}.`}>
          <defs>
            <marker id="kl-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
            </marker>
          </defs>
          {(Object.keys(edges) as Edge[]).map((e) => {
            const on = lit.has(e);
            return (
              <g key={e}>
                <path d={edges[e].d} fill="none" stroke={on ? 'var(--sun)' : 'var(--rule)'} strokeWidth={on ? 3.2 : 1.6}
                  markerEnd="url(#kl-arrow)" className={on ? 'arch-flow' : undefined} />
                <text x={edges[e].lx} y={edges[e].ly} textAnchor="middle" fontSize={12} fontWeight={on ? 800 : 500}
                  fill={on ? 'var(--ink)' : 'var(--muted)'}>{edges[e].label}</text>
              </g>
            );
          })}
          {(Object.keys(box) as (keyof typeof box)[]).map((k) => {
            const on = litBox.has(k);
            return (
              <g key={k}>
                <rect x={box[k].x} y={Y - 26} width={BW} height={72} rx={12} fill={on ? 'var(--sat)' : 'var(--paper)'}
                  stroke="var(--sat)" strokeWidth={on ? 2.6 : 1.6} strokeDasharray={k === 'none' ? '6 4' : undefined} />
                <text x={box[k].x + BW / 2} y={Y + 6} textAnchor="middle" fontSize={16} fontWeight={800} fontFamily="var(--font-mono)"
                  fill={on ? 'var(--on-sat)' : 'var(--ink)'}>{box[k].label}</text>
                <text x={box[k].x + BW / 2} y={Y + 26} textAnchor="middle" fontSize={12} fill={on ? 'var(--on-sat)' : 'var(--muted)'}>{box[k].sub}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="mt-3 rounded-r-lg border-l-4 border-sun bg-sun-soft px-4 py-3 leading-relaxed" aria-live="polite">
        <span className="font-bold">{s.name} → {s.answer}. </span>{s.say}
      </p>
      <figcaption className="mt-2 text-sm text-muted">One row of the idempotency_keys table, keyed by (user, key). Our design; the 409 and 422 codes follow the IETF draft.</figcaption>
    </figure>
  );
}
