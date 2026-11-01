import { useState } from 'react';

// How `t.something` is found: the instance first, then its class, then each base class in turn.
// Rule from the Python tutorial, "Classes" (9.5 Inheritance). Example classes are from the revision page.
const layers = [
  { title: 't  (the instance)', names: ['owner', '_balance', 'daily_limit'] },
  { title: 'class TeenWallet', names: ['__init__', 'deposit'] },
  { title: 'class Wallet', names: ['currency', '__init__', 'balance', 'deposit', 'from_rupees', 'to_rupees', '__repr__'] },
  { title: 'class object', names: ['__eq__', '__hash__', '__str__', '…'] },
];

const lookups = ['owner', 'deposit', 'currency', 'to_rupees', '__str__', 'nickname'];

export default function AttributeLookup() {
  const [attr, setAttr] = useState('deposit');
  const found = layers.findIndex((l) => l.names.includes(attr));
  const stopAt = found === -1 ? layers.length - 1 : found;

  return (
    <figure className="not-prose my-6 rounded-lg border border-rule bg-panel p-5 text-ink">
      <p className="mb-2 text-sm text-muted">Pick an attribute to look up on <code className="font-mono">t = TeenWallet("Riya")</code>:</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {lookups.map((a) => (
          <button key={a} onClick={() => setAttr(a)} aria-pressed={attr === a}
            className={`rounded-md border px-3 py-1 font-mono text-sm ${attr === a ? 'border-sat bg-sat text-on-sat' : 'border-rule'}`}>
            t.{a}
          </button>
        ))}
      </div>

      <ol className="space-y-2">
        {layers.map((l, i) => {
          const searched = i <= stopAt;
          const hit = i === found;
          return (
            <li key={l.title} className={`rounded-lg border-2 px-4 py-3 transition-colors ${hit ? 'border-keep bg-sat-soft' : searched ? 'border-sun' : 'border-rule opacity-50'}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-mono font-bold">{l.title}</span>
                <span className={`text-sm font-medium ${hit ? 'text-keep' : 'text-muted'}`}>
                  {hit ? 'found here, search stops' : searched ? 'not here, keep looking ↓' : 'never checked'}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {l.names.map((n) => (
                  <span key={n} className={`rounded px-1.5 py-0.5 font-mono text-[0.8rem] ${hit && n === attr ? 'bg-keep font-bold text-paper' : 'bg-paper text-muted'}`}>{n}</span>
                ))}
              </div>
            </li>
          );
        })}
      </ol>

      <p className="mt-3 rounded-r-lg border-l-4 border-sun bg-sun-soft px-4 py-3 leading-relaxed" aria-live="polite">
        {found === -1
          ? `nickname isn't anywhere in the chain, so Python raises AttributeError.`
          : found === 1 && attr === 'deposit'
            ? 'TeenWallet defines its own deposit, so Wallet.deposit is never reached. That is overriding. Inside it, super().deposit(...) jumps to the next class up on purpose.'
            : `Found in ${layers[found].title.replace('  (the instance)', ', the instance itself')}. Every layer above it was checked first.`}
      </p>
    </figure>
  );
}
