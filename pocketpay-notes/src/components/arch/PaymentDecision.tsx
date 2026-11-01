import { useState } from 'react';
import ArchFigure from './ArchFigure';

// Every check a POST /payments goes through, in order, as a flowchart. Pick a situation to light up its path.
// PocketPay's own design (a draft). 429 is from RFC 6585; 409 and 422 for idempotency keys follow the IETF draft.
type N = { id: string; kind: 'start' | 'dec' | 'ok' | 'stop'; cx: number; cy: number; lines: string[] };
type E = { id: string; d: string; label?: string; lx?: number; ly?: number };

const X = 300;
const OUT = 680;
const STEP = 110; // vertical distance between decisions
const Y = (k: number) => 40 + k * STEP; // row k: 0 = start, 1 = rate limit … 8 = success
const DW = 130; // half width of a diamond
const DH = 34; // half height

const dec = (id: string, k: number, lines: string[]): N => ({ id, kind: 'dec', cx: X, cy: Y(k), lines });
const stop = (id: string, k: number, lines: string[]): N => ({ id, kind: 'stop', cx: OUT, cy: Y(k), lines });
const nodes: N[] = [
  { id: 'start', kind: 'start', cx: X, cy: Y(0), lines: ['POST /payments arrives'] },
  dec('rate', 1, ['Under the', 'rate limit?']),
  dec('key', 2, ['Idempotency-Key', 'seen before?']),
  dec('agent', 3, ['Sent by', 'an AI agent?']),
  dec('mand', 4, ['Within its', 'mandate?']),
  dec('appr', 5, ['Over the approval', 'threshold?']),
  dec('risk', 6, ['Suspicious', 'burst?']),
  dec('funds', 7, ['Enough in', 'the wallet?']),
  { id: 'ok', kind: 'ok', cx: X, cy: Y(8), lines: ['201 Created · processing', 'ledger + payment + outbox, one transaction'] },
  stop('o429', 1, ['429 Too Many Requests', 'database never touched']),
  stop('okey', 2, ['finished, same body → saved answer', 'still running → 409 · new body → 422']),
  stop('o403', 4, ['403 Forbidden', 'nothing moved']),
  stop('oappr', 5, ['202 Accepted · held', 'waits for a parent to approve']),
  stop('orisk', 6, ['202 Accepted · held', 'for a risk review']),
  stop('o422', 7, ['422 · insufficient funds', 'nothing moved']),
];

// Straight down from row k to row k + 1, or right from row k to its outcome box.
const down = (id: string, k: number, label: string, toBox = false): E => ({
  id, d: `M${X},${Y(k) + DH} V${Y(k + 1) - (toBox ? 26 : DH)}`, label, lx: X + 8, ly: Y(k) + DH + 22,
});
const right = (id: string, k: number, label: string): E => ({
  id, d: `M${X + DW},${Y(k)} H${OUT - 150}`, label, lx: X + DW + 10, ly: Y(k) - 8,
});
const edges: E[] = [
  { id: 'start-rate', d: `M${X},${Y(0) + 22} V${Y(1) - DH}` },
  down('rate-key', 1, 'yes'),
  right('rate-o', 1, 'no'),
  down('key-agent', 2, 'no'),
  right('key-o', 2, 'yes'),
  down('agent-mand', 3, 'yes'),
  { id: 'agent-risk', d: `M${X - DW},${Y(3)} H70 V${Y(6)} H${X - DW}`, label: 'no', lx: 80, ly: Y(3) - 8 },
  down('mand-appr', 4, 'yes'),
  right('mand-o', 4, 'no'),
  down('appr-risk', 5, 'no'),
  right('appr-o', 5, 'yes'),
  down('risk-funds', 6, 'no'),
  right('risk-o', 6, 'yes'),
  down('funds-ok', 7, 'yes', true),
  right('funds-o', 7, 'no'),
];

const common = ['start-rate', 'rate-key', 'key-agent'];
const person = [...common, 'agent-risk'];
const agent = [...common, 'agent-mand'];
const cases = [
  { name: 'Riya pays ₹40', path: [...person, 'risk-funds', 'funds-ok'], say: 'Every check passes. The payment is created and Riya gets 201 with status processing.' },
  { name: 'Double tap', path: ['start-rate', 'rate-key', 'key-o'], say: 'The second tap carries the same key. If the first is finished, the saved answer comes back and no second payment is made; if it is still running, 409.' },
  { name: 'A buggy app floods', path: ['start-rate', 'rate-o'], say: 'Hundreds of requests a minute: the rate limiter answers 429 before any database work.' },
  { name: 'Not enough money', path: [...person, 'risk-funds', 'funds-o'], say: 'The ledger refuses the overdraft. The transaction rolls back and nothing is saved.' },
  { name: 'Stolen-phone burst', path: [...person, 'risk-o'], say: 'Six payments in ten minutes trips the velocity rule. The payment is held, not refused, until someone looks.' },
  { name: 'Agent, within limits', path: [...agent, 'mand-appr', 'appr-risk', 'risk-funds', 'funds-ok'], say: 'The agent’s mandate allows it, it is under the approval threshold, so it continues exactly like Riya’s own payment.' },
  { name: 'Agent, injected', path: [...agent, 'mand-o'], say: '“Send ₹5,000 to shop99” breaks the per-payment max and the allowlist. 403, whatever the prompt said.' },
  { name: 'Agent, big but allowed', path: [...agent, 'mand-appr', 'appr-o'], say: 'Within the mandate, but above the amount the parent wants to approve personally. Held until they say yes.' },
];

export default function PaymentDecision() {
  const [c, setC] = useState(0);
  const path = new Set(cases[c].path);
  const lit = new Set(cases[c].path.flatMap((e) => e.split('-')).map((id) => (id === 'o' ? '' : id)));
  // The outcome box at the end of the path.
  const last = cases[c].path[cases[c].path.length - 1];
  const end = last.endsWith('-o') ? { 'rate-o': 'o429', 'key-o': 'okey', 'mand-o': 'o403', 'appr-o': 'oappr', 'risk-o': 'orisk', 'funds-o': 'o422' }[last] : 'ok';
  if (end) lit.add(end);

  return (
    <ArchFigure label="Payment checks flowchart">
      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Pick a situation">
        {cases.map((k, i) => (
          <button key={k.name} onClick={() => setC(i)} aria-pressed={c === i}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium ${c === i ? 'border-sat bg-sat text-on-sat' : 'border-rule'}`}>{k.name}</button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <svg viewBox="0 0 900 950" className="mx-auto block h-auto w-full max-w-[760px] min-w-[600px]" role="img" aria-label={`Flowchart of the checks on a payment. ${cases[c].name}: ${cases[c].say}`}>
          <defs>
            <marker id="pd-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
            </marker>
          </defs>
          {edges.map((e) => {
            const on = path.has(e.id);
            return (
              <g key={e.id}>
                <path d={e.d} fill="none" stroke={on ? 'var(--sun)' : 'var(--rule)'} strokeWidth={on ? 3.2 : 1.6} markerEnd="url(#pd-arrow)" className={on ? 'arch-flow' : undefined} />
                {e.label && <text x={e.lx} y={e.ly} fontSize={13} fontWeight={700} fill={on ? 'var(--ink)' : 'var(--muted)'}>{e.label}</text>}
              </g>
            );
          })}
          {nodes.map((n) => {
            const on = lit.has(n.id);
            const fill = on ? (n.kind === 'stop' ? 'var(--cut)' : n.kind === 'ok' ? 'var(--keep)' : 'var(--sun-soft)') : 'var(--paper)';
            const stroke = on ? (n.kind === 'stop' ? 'var(--cut)' : n.kind === 'ok' ? 'var(--keep)' : 'var(--sun)') : 'var(--rule)';
            const ink = on && (n.kind === 'stop' || n.kind === 'ok') ? 'var(--paper)' : 'var(--ink)';
            return (
              <g key={n.id}>
                {n.kind === 'dec' ? (
                  <path d={`M${n.cx},${n.cy - DH} L${n.cx + DW},${n.cy} L${n.cx},${n.cy + DH} L${n.cx - DW},${n.cy} Z`} fill={fill} stroke={stroke} strokeWidth={on ? 2.6 : 1.6} />
                ) : (
                  <rect x={n.cx - (n.kind === 'start' ? 120 : 150)} y={n.cy - (n.kind === 'start' ? 22 : 26)} width={n.kind === 'start' ? 240 : 300} height={n.kind === 'start' ? 44 : 52}
                    rx={n.kind === 'start' ? 22 : 8} fill={n.kind === 'start' ? 'var(--sat)' : fill} stroke={n.kind === 'start' ? 'var(--sat)' : stroke} strokeWidth={on ? 2.6 : 1.6} />
                )}
                {n.lines.map((l, i) => (
                  <text key={l} x={n.cx} y={n.cy + (i - (n.lines.length - 1) / 2) * 17 + 5} textAnchor="middle"
                    fontSize={n.kind === 'dec' ? 13.5 : i === 0 ? 14 : 12} fontWeight={i === 0 || n.kind === 'dec' ? 800 : 500}
                    fill={n.kind === 'start' ? 'var(--on-sat)' : ink}>{l}</text>
                ))}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="mt-3 rounded-r-lg border-l-4 border-sun bg-sun-soft px-4 py-3 leading-relaxed" aria-live="polite">
        <span className="font-bold">{cases[c].name}: </span>{cases[c].say}
      </p>
    </ArchFigure>
  );
}
