import { useState } from 'react';

// The escrow account as a locked box at the bank. Allowed and blocked moves follow RBI MD-PPIs para 12.3; the numbers are an example.
type State = { riya: number; arjun: number; canteen: number; box: number };
const initial: State = { riya: 0, arjun: 500, canteen: 0, box: 500 };

type Action = { label: string; allowed: boolean; apply?: (s: State) => State | null; say: string };
const actions: Action[] = [
  { label: 'Riya adds ₹200', allowed: true, apply: (s) => ({ ...s, riya: s.riya + 200, box: s.box + 200 }),
    say: 'Riya’s bank sends ₹200 into the box. PocketPay’s ledger writes “Riya: +₹200”. Money in from adding to a wallet is allowed.' },
  { label: 'Riya pays the canteen ₹40', allowed: true, apply: (s) => (s.riya < 40 ? null : { ...s, riya: s.riya - 40, canteen: s.canteen + 40 }),
    say: 'Nothing enters or leaves the box. Only the ledger changes: Riya −₹40, canteen +₹40. The box total stays the same.' },
  { label: 'Send the canteen its money', allowed: true, apply: (s) => (s.canteen === 0 ? null : { ...s, box: s.box - s.canteen, canteen: 0 }),
    say: 'The box pays the canteen’s own bank account. Paying shops is allowed. The ledger writes “canteen: paid out”.' },
  { label: 'PocketPay pays its office rent', allowed: false,
    say: 'Blocked. Rent isn’t on RBI’s list of things the box can pay for. The money is kept for users and shops, not for running the company.' },
];

export default function EscrowBox() {
  const [s, setS] = useState(initial);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean }>({ text: 'Try the buttons. Watch the box and the list underneath it.' });
  const owed = s.riya + s.arjun + s.canteen;

  const run = (a: Action) => {
    if (!a.allowed) return setMsg({ text: a.say, bad: true });
    const n = a.apply!(s);
    if (!n) return setMsg({ text: 'Nothing to do yet. Try another button first.', bad: true });
    setS(n);
    setMsg({ text: a.say });
  };

  const rows = [
    { name: 'Riya’s wallet', v: s.riya },
    { name: 'Arjun’s wallet', v: s.arjun },
    { name: 'Owed to the canteen', v: s.canteen },
  ];

  return (
    <figure className="not-prose my-6 rounded-lg border border-rule bg-panel p-5 text-ink">
      <div className="grid items-start gap-5 sm:grid-cols-2">
        <div className="rounded-lg border-2 border-dashed border-muted p-3">
          <p className="mb-2 text-sm text-muted">Partner bank</p>
          <div className="rounded-lg border-[3px] border-sat bg-sat-soft p-4 text-center">
            <div className="text-2xl" aria-hidden>🔒</div>
            <p className="font-bold">PocketPay’s escrow account</p>
            <p className="font-mono text-3xl font-black">₹{s.box}</p>
            <p className="text-sm text-muted">The bank only sees this one number.</p>
          </div>
        </div>
        <div>
          <p className="mb-2 font-bold">PocketPay’s ledger: whose money is it?</p>
          <ul className="space-y-1.5">
            {rows.map((r) => (
              <li key={r.name} className="flex justify-between rounded-md border border-rule px-3 py-1.5">
                <span>{r.name}</span><span className="font-mono font-bold">₹{r.v}</span>
              </li>
            ))}
            <li className="flex justify-between px-3 py-1.5 font-bold">
              <span>Total owed</span><span className="font-mono">₹{owed}</span>
            </li>
          </ul>
          <p className={`mt-2 rounded-md px-3 py-2 text-sm font-semibold ${s.box >= owed ? 'bg-sat-soft text-keep' : 'bg-sun-soft text-cut'}`}>
            End-of-day check: box ₹{s.box} {s.box >= owed ? '≥' : '<'} owed ₹{owed} {s.box >= owed ? '✓ OK' : '✗ report to RBI'}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {actions.map((a) => (
          <button key={a.label} onClick={() => run(a)}
            className={`rounded-md border-[1.5px] px-3.5 py-1.5 font-medium ${a.allowed ? 'border-sat' : 'border-cut text-cut'}`}>
            {a.label}
          </button>
        ))}
        <button onClick={() => { setS(initial); setMsg({ text: 'Back to the start.' }); }} className="rounded-md px-3.5 py-1.5 font-medium text-muted underline">Start again</button>
      </div>
      <p className={`mt-3 rounded-r-lg border-l-4 px-4 py-3 leading-relaxed ${msg.bad ? 'border-cut bg-sun-soft' : 'border-sun bg-sun-soft'}`} aria-live="polite">{msg.text}</p>
    </figure>
  );
}
