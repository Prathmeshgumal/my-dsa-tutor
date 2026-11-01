import { useState } from 'react';

// Tap Pay twice, with and without an idempotency key, and watch the balance.
const PRICE = 4000; // paise
const START = 20000;
const newKey = () => 'pay_' + Math.random().toString(36).slice(2, 7);
const rupees = (p: number) => '₹' + (p / 100).toFixed(0);

type Line = { text: string; kind: 'charged' | 'saved' | 'declined' };

export default function DoubleTapDemo() {
  const [useKey, setUseKey] = useState(true);
  const [key, setKey] = useState(newKey);
  const [balance, setBalance] = useState(START);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [log, setLog] = useState<Line[]>([]);

  // One request reaching the server. Taps are applied in order, like a real queue.
  const request = (state: { balance: number; seen: Set<string>; lines: Line[] }) => {
    const n = state.lines.length + log.length + 1;
    const tag = useKey ? `key ${key}` : 'no key';
    if (useKey && state.seen.has(key)) {
      state.lines.push({ kind: 'saved', text: `Request ${n} (${tag}): already done. Returned the saved result. No new charge.` });
    } else if (state.balance < PRICE) {
      state.lines.push({ kind: 'declined', text: `Request ${n} (${tag}): declined, balance too low.` });
    } else {
      state.balance -= PRICE;
      if (useKey) state.seen = new Set(state.seen).add(key);
      state.lines.push({ kind: 'charged', text: `Request ${n} (${tag}): charged ${rupees(PRICE)}.` });
    }
  };

  const tap = (times: number) => {
    const state = { balance, seen, lines: [] as Line[] };
    for (let i = 0; i < times; i++) request(state);
    setBalance(state.balance);
    setSeen(state.seen);
    setLog((l) => [...l, ...state.lines]);
  };

  const reset = () => {
    setBalance(START);
    setSeen(new Set());
    setLog([]);
    setKey(newKey());
  };

  const colors = { charged: 'text-cut', saved: 'text-keep', declined: 'text-muted' };

  return (
    <figure className="not-prose my-6 rounded-lg border border-rule bg-panel p-5 text-ink">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">Teen’s wallet</p>
          <p className="text-4xl font-black tracking-tight">{rupees(balance)}</p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 font-medium">
          <input type="checkbox" checked={useKey} onChange={(e) => setUseKey(e.target.checked)} className="h-5 w-5 accent-[var(--keep)]" />
          Send an idempotency key
        </label>
      </div>

      <p className="mt-3 text-sm text-muted">
        This checkout’s key: <code className="rounded bg-sat-soft px-1.5 font-mono">{useKey ? key : 'none'}</code>. The app makes one key when the
        canteen checkout opens and sends the same key with every tap and retry.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={() => tap(1)} className="rounded-md bg-sat px-3.5 py-1.5 font-medium text-on-sat">Tap Pay ₹40</button>
        <button onClick={() => tap(2)} className="rounded-md bg-sat px-3.5 py-1.5 font-medium text-on-sat">Double-tap Pay</button>
        <button onClick={() => setKey(newKey())} className="rounded-md border-[1.5px] border-rule px-3.5 py-1.5 font-medium">New checkout (new key)</button>
        <button onClick={reset} className="rounded-md border-[1.5px] border-rule px-3.5 py-1.5 font-medium">Reset</button>
      </div>

      <ol className="mt-4 min-h-[3rem] space-y-1 text-[0.95rem]" aria-live="polite">
        {log.length === 0 && <li className="text-muted">Double-tap Pay with the key on, then turn it off and try again.</li>}
        {log.slice(-6).map((l, i) => (
          <li key={i} className={colors[l.kind]}>{l.text}</li>
        ))}
      </ol>
    </figure>
  );
}
