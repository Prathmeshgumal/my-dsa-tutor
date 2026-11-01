import { useState } from 'react';

// UPI pay (push) flow where every party is separate: NPCI's "Four Party Model (Push)"
// in the UPI Procedural Guidelines v1.5 (July 2016), applied to ₹40 at the school canteen.
const lanes = [
  { x: 70, name: 'You + app', sub: 'PocketPay (TPAP)' },
  { x: 215, name: 'Payer PSP', sub: 'your app’s bank' },
  { x: 360, name: 'NPCI', sub: 'UPI switch' },
  { x: 505, name: 'Payee PSP', sub: 'owns @pocket' },
  { x: 650, name: 'Your bank', sub: 'remitter' },
  { x: 795, name: 'Canteen’s bank', sub: 'beneficiary' },
];

type Step = { from: number; to: number; label: string; reply?: boolean; title: string; text: string };
const steps: Step[] = [
  { from: 0, to: 0, label: 'Scan QR: payee, amount, ref', title: 'Scan the QR',
    text: 'The QR holds a upi://pay link. The app reads the payee’s UPI ID (pa), name (pn), amount (am) and transaction reference (tr) from it, and shows them to you.' },
  { from: 0, to: 0, label: 'Enter PIN in NPCI library', title: 'Enter your UPI PIN',
    text: 'You type the PIN into NPCI’s Common Library, which is built into the app. The PIN is encrypted with UPI’s public key, so the app never has it in plain form.' },
  { from: 0, to: 1, label: 'Pay request', title: 'App → payer PSP',
    text: 'An app run by a non-bank company (a TPAP) takes part in UPI through its PSP bank, so the request goes there first.' },
  { from: 1, to: 2, label: 'ReqPay', title: 'Payer PSP → NPCI',
    text: 'The payer PSP sends the payment request, with your encrypted credentials, to the UPI switch.' },
  { from: 2, to: 3, label: 'ReqAuthDetails', title: 'NPCI asks the payee PSP',
    text: 'NPCI asks the PSP that owns the @pocket handle to resolve canteen@pocket into a real bank account. This is “address resolution”.' },
  { from: 3, to: 2, label: 'RespAuthDetails', reply: true, title: 'Payee PSP replies',
    text: 'The payee PSP looks up canteen@pocket in its own records and sends back the canteen’s account details.' },
  { from: 2, to: 4, label: 'Debit ₹40', title: 'NPCI → your bank',
    text: 'NPCI sends the debit request. Your bank decrypts the PIN with its private key, checks it, and takes ₹40 from your account.' },
  { from: 4, to: 2, label: 'Debited', reply: true, title: 'Your bank confirms the debit',
    text: 'If the PIN is wrong or the balance is too low, this reply is a decline and the payment stops. Nothing has moved.' },
  { from: 2, to: 5, label: 'Credit ₹40', title: 'NPCI → canteen’s bank',
    text: 'NPCI sends the credit request. Your money has already left your account at this point.' },
  { from: 5, to: 2, label: 'Credited', reply: true, title: 'Canteen’s bank confirms the credit',
    text: 'The canteen’s bank credits the canteen’s account and tells NPCI.' },
  { from: 2, to: 1, label: 'Success', reply: true, title: 'NPCI → payer PSP',
    text: 'NPCI sends the result back to the payer PSP.' },
  { from: 1, to: 0, label: 'Success ✓', reply: true, title: 'Payer PSP → app',
    text: 'The payer PSP passes the confirmation to the app, which shows you success.' },
  { from: 2, to: 3, label: 'Success', reply: true, title: 'NPCI → payee PSP',
    text: 'The payee’s side also gets the confirmation, so the canteen knows it has been paid.' },
];
const settle = {
  title: 'Banks settle later',
  text: 'Steps 7 and 9 changed account balances. The banks pay each other later: at each settlement cycle NPCI works out each bank’s net amount to pay or receive, and settles it through the banks’ settlement accounts at the RBI.',
};
const all = [...steps.map((s) => ({ title: s.title, text: s.text })), settle];

const W = 870;
const y = (i: number) => 104 + i * 42;
const settleY = y(steps.length - 1) + 54;
const height = settleY + 44;

export default function UpiFlow() {
  const [cur, setCur] = useState(-1); // -1 = show everything
  const go = (i: number) => setCur(Math.max(0, Math.min(all.length - 1, i)));
  const style = (i: number) => ({
    opacity: cur < 0 || i === cur ? 1 : i < cur ? 0.4 : 0.12,
    transition: 'opacity 200ms',
  });
  const stroke = (i: number) => (i === cur ? 'var(--sun)' : 'var(--sat)');

  return (
    <figure className="not-prose my-6 text-ink">
      <div className="overflow-x-auto rounded-lg border border-rule bg-panel px-1 py-2">
        <svg viewBox={`0 0 ${W} ${height}`} className="block h-auto w-full min-w-[760px]" role="img" aria-label="Sequence diagram of a UPI pay request between the app, payer PSP, NPCI, payee PSP, your bank and the canteen's bank">
          <defs>
            <marker id="upi-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
            </marker>
          </defs>

          {lanes.map((l) => (
            <g key={l.name}>
              <rect x={l.x - 64} y={8} width={128} height={48} rx={6} fill="var(--sat-soft)" stroke="var(--sat)" strokeWidth={1.5} />
              <text x={l.x} y={29} textAnchor="middle" fontSize={14} fontWeight={700} fill="var(--ink)">{l.name}</text>
              <text x={l.x} y={46} textAnchor="middle" fontSize={12} fill="var(--muted)">{l.sub}</text>
              <line x1={l.x} y1={56} x2={l.x} y2={height - 8} stroke="var(--rule)" strokeWidth={1.5} strokeDasharray="3 4" />
            </g>
          ))}

          {steps.map((s, i) => {
            const x1 = lanes[s.from].x;
            const x2 = lanes[s.to].x;
            const yy = y(i);
            const common = { stroke: stroke(i), strokeWidth: i === cur ? 3 : 2, fill: 'none', markerEnd: 'url(#upi-arrow)' };
            const label = `${i + 1}. ${s.label}`;
            if (s.from === s.to) {
              return (
                <g key={i} style={style(i)}>
                  <path d={`M${x1},${yy - 10} h40 v20 h-36`} {...common} />
                  <text x={x1 + 48} y={yy + 4} fontSize={13.5} fontWeight={i === cur ? 700 : 500} fill="var(--ink)">{label}</text>
                </g>
              );
            }
            const dir = x2 > x1 ? 1 : -1;
            return (
              <g key={i} style={style(i)}>
                <line x1={x1 + dir * 4} y1={yy} x2={x2 - dir * 4} y2={yy} strokeDasharray={s.reply ? '6 4' : undefined} {...common} />
                <text x={(x1 + x2) / 2} y={yy - 8} textAnchor="middle" fontSize={13.5} fontWeight={i === cur ? 700 : 500} fill="var(--ink)">{label}</text>
              </g>
            );
          })}

          <g style={style(steps.length)}>
            <rect x={lanes[2].x - 70} y={settleY - 18} width={lanes[5].x - lanes[2].x + 140} height={36} rx={6} fill="var(--sun-soft)" stroke="var(--sun)" strokeWidth={1.5} strokeDasharray="5 4" />
            <text x={(lanes[2].x + lanes[5].x) / 2} y={settleY + 5} textAnchor="middle" fontSize={13.5} fontWeight={500} fill="var(--ink)">
              {steps.length + 1}. Later: NPCI settles each bank’s net amount through RBI
            </text>
          </g>
        </svg>
      </div>

      {cur >= 0 && (
        <p className="mt-3 min-h-[4.5em] rounded-r-lg border-l-4 border-sun bg-sun-soft px-4 py-3 leading-relaxed" aria-live="polite">
          <span className="mr-1.5 font-black text-sun">{cur + 1}</span>
          <b>{all[cur].title}.</b> {all[cur].text}
        </p>
      )}

      <div className="my-3 flex flex-wrap items-center gap-2">
        <button onClick={() => go(cur - 1)} className="rounded-md border-[1.5px] border-sat bg-sat px-3.5 py-1.5 font-medium text-on-sat">Back</button>
        <button onClick={() => go(cur + 1)} className="rounded-md border-[1.5px] border-sat bg-sat px-3.5 py-1.5 font-medium text-on-sat">Next step</button>
        <button onClick={() => setCur(-1)} className="rounded-md border-[1.5px] border-rule px-3.5 py-1.5 font-medium">Show all</button>
        <span className="ml-1 text-sm text-muted">{cur < 0 ? 'Showing every step' : `Step ${cur + 1} of ${all.length}`}</span>
      </div>

      <ol className="list-decimal space-y-1 pl-7 marker:font-bold marker:text-sat">
        {all.map((s, i) => (
          <li key={i} className="pl-1">
            <button
              onClick={() => go(i)}
              className={`block w-full rounded-md px-2.5 py-1.5 text-left leading-relaxed ${i === cur ? 'bg-sun-soft shadow-[inset_3px_0_0_var(--sun)]' : ''}`}
            >
              <b>{s.title}.</b> {s.text}
            </button>
          </li>
        ))}
      </ol>
    </figure>
  );
}
