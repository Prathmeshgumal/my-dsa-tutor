import { useState } from 'react';

// Inside the API process: the layers a request passes through, top to bottom. Pick a request to see what each
// layer does with it. PocketPay's own design; file names other than db.py and ledger.py are planned, not final.
type Layer = { id: string; name: string; files: string; rule: string; built?: boolean };

const layers: Layer[] = [
  { id: 'route', name: 'Routes', files: 'pocketpay/api/payments.py · refunds.py · cards.py · mandates.py · bank_callbacks.py',
    rule: 'Turn HTTP into a Python call, and Python errors into HTTP status codes. No business rules here.' },
  { id: 'guard', name: 'Request checks', files: 'Pydantic request models · auth.py · rate_limit.py · idempotency.py',
    rule: 'Reject bad input, work out who is calling, limit the rate, and catch repeats. Cheap checks first.' },
  { id: 'service', name: 'Services', files: 'pocketpay/payments.py · refunds.py · cards.py · mandates.py · risk.py',
    rule: 'The business rules: state machines, mandate limits, risk holds. Each one opens the transaction.' },
  { id: 'ledger', name: 'Ledger', files: 'pocketpay/ledger.py', built: true,
    rule: 'The money rules: balanced entries, no overdrafts, locks in ID order, reversals instead of edits.' },
  { id: 'db', name: 'Database access', files: 'pocketpay/db.py · migrations/*.sql', built: true,
    rule: 'One async connection pool, plain SQL with %s placeholders, numbered migrations.' },
];

type Req = { name: string; does: Record<string, string>; worker?: string };
const requests: Req[] = [
  { name: 'POST /payments', does: {
    route: 'payments.py receives the request and hands it on as a typed PaymentRequest.',
    guard: 'Pydantic checks amount > 0 and the merchant format. Auth finds Riya. Redis counts her requests. The Idempotency-Key is saved as “started”, or the saved answer is returned.',
    service: 'payments.create(): risk check, then BEGIN. Inserts the payment (processing) and an outbox event.',
    ledger: 'post(): wallet → “owed to canteen”, in the same transaction the service opened.',
    db: 'COMMIT. Payment, postings, outbox event and the saved response all land together.',
  }, worker: 'Afterwards, the outbox relay and the payout consumer take over, in their own processes.' },
  { name: 'POST /bank/callbacks', does: {
    route: 'bank_callbacks.py receives the bank’s message: payment 812, SUCCESS, callback ID cb-55.',
    guard: 'Checks the message really comes from the bank (a shared secret). No idempotency key here: the callback’s own ID plays that role.',
    service: 'payments.confirm(): records cb-55 as processed; if it was already there, does nothing. Moves processing → succeeded, or failed.',
    ledger: 'On failure, reverse() puts the ₹40 back in Riya’s wallet. On success, nothing to post.',
    db: 'One transaction, so “recorded the callback” and “changed the status” can’t come apart.',
  } },
  { name: 'Agent: create_payment', does: {
    route: 'The MCP server calls the same POST /payments route. There is no separate “agent” route to forget a check on.',
    guard: 'Auth sees an agent token, not Riya’s login, and loads the mandate it belongs to.',
    service: 'mandates.check(): per-payment max, daily cap, allowlist, expiry, revoked. Over the approval threshold → held for a parent. Then the normal payments.create().',
    ledger: 'Exactly as for Riya: the ledger doesn’t care who asked.',
    db: 'The mandate’s spend for today is read inside the same transaction, so two agent payments at once can’t both squeeze under the cap.',
  } },
];

export default function BackendLayers() {
  const [r, setR] = useState(0);
  const req = requests[r];

  return (
    <figure className="not-prose my-6 rounded-lg border border-rule bg-panel p-4 text-ink sm:p-5">
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Pick a request">
        {requests.map((q, k) => (
          <button key={q.name} onClick={() => setR(k)} aria-pressed={r === k}
            className={`rounded-md border px-3 py-1.5 font-mono text-sm ${r === k ? 'border-sat bg-sat text-on-sat' : 'border-rule'}`}>{q.name}</button>
        ))}
      </div>

      <ol className="relative space-y-3 pl-8">
        <span aria-hidden className="absolute top-3 bottom-3 left-3 w-0.5 bg-sat" />
        {layers.map((l, k) => (
          <li key={l.id} className="relative">
            <span aria-hidden className="absolute top-4 -left-8 grid size-6 place-items-center rounded-full bg-sat text-xs font-bold text-on-sat">{k + 1}</span>
            <div className={`rounded-lg border-2 bg-paper p-3.5 ${l.built ? 'border-keep' : 'border-dashed border-sat'}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-lg font-black">{l.name}</span>
                <span className={`text-xs font-bold ${l.built ? 'text-keep' : 'text-muted'}`}>{l.built ? 'BUILT' : 'PLANNED'}</span>
              </div>
              <p className="mt-0.5 font-mono text-[0.78rem] text-muted">{l.files}</p>
              <p className="mt-2 rounded-md bg-sun-soft px-3 py-2 leading-relaxed" aria-live="polite">{req.does[l.id]}</p>
              <p className="mt-2 text-sm text-muted"><span className="font-bold text-ink">Rule of this layer: </span>{l.rule}</p>
            </div>
          </li>
        ))}
      </ol>
      {req.worker && <p className="mt-3 text-sm text-muted">{req.worker}</p>}
      <figcaption className="mt-2 text-sm text-muted">Each layer only calls the one below it. Planned file names may change as each block is built.</figcaption>
    </figure>
  );
}
