import { useState } from 'react';
import { Link } from 'react-router';

// Where the rupees actually are: a UPI payment from a bank account vs a payment from a PocketPay wallet.
type Mode = 'bank' | 'wallet';
type WalletStep = 0 | 1 | 2;

const walletSteps = [
  {
    title: 'Top up ₹200',
    real: 'Real money moves bank to bank: from Riya’s bank account to PocketPay’s escrow account at its partner bank.',
    ledger: ['Dr Cash at bank ₹200', 'Cr Riya’s wallet ₹200'],
  },
  {
    title: 'Pay the canteen ₹40',
    real: 'No bank money moves. The ₹40 stays in the escrow account; only PocketPay’s ledger changes who it belongs to, from Riya to the canteen.',
    ledger: ['Dr Riya’s wallet ₹40', 'Cr Owed to canteen ₹40'],
  },
  {
    title: 'Pay out to the canteen',
    real: 'Real money moves bank to bank again: from the escrow account to the canteen’s bank account.',
    ledger: ['Dr Owed to canteen ₹40', 'Cr Cash at bank ₹40'],
  },
];

function Box({ x, y, w, h, title, sub, active = true, dashed = false }: { x: number; y: number; w: number; h: number; title: string; sub?: string; active?: boolean; dashed?: boolean }) {
  return (
    <g style={{ opacity: active ? 1 : 0.35, transition: 'opacity 200ms' }}>
      <rect x={x} y={y} width={w} height={h} rx={8} fill="var(--sat-soft)" stroke="var(--sat)" strokeWidth={1.5} strokeDasharray={dashed ? '6 4' : undefined} />
      <text x={x + w / 2} y={y + (sub ? 24 : h / 2 + 5)} textAnchor="middle" fontSize={16} fontWeight={700} fill="var(--ink)">{title}</text>
      {sub && <text x={x + w / 2} y={y + 42} textAnchor="middle" fontSize={13} fill="var(--muted)">{sub}</text>}
    </g>
  );
}

function Arrow({ d, label, lx, ly, on, dotted = false }: { d: string; label: string; lx: number; ly: number; on: boolean; dotted?: boolean }) {
  return (
    <g style={{ opacity: on ? 1 : 0.12, transition: 'opacity 200ms' }}>
      <path d={d} fill="none" stroke={dotted ? 'var(--muted)' : 'var(--sun)'} strokeWidth={dotted ? 2 : 3.5} strokeDasharray={dotted ? '3 5' : undefined} markerEnd={dotted ? 'url(#mm-arrow-muted)' : 'url(#mm-arrow)'} />
      <text x={lx} y={ly} textAnchor="middle" fontSize={15} fontWeight={700} fill="var(--ink)">{label}</text>
    </g>
  );
}

export default function MoneyMap() {
  const [mode, setMode] = useState<Mode>('bank');
  const [step, setStep] = useState<WalletStep>(0);
  const wallet = mode === 'wallet';

  return (
    <figure className="not-prose my-6 text-ink">
      <div className="mb-3 inline-flex rounded-lg border border-rule p-1" role="tablist">
        {(['bank', 'wallet'] as Mode[]).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`rounded-md px-3.5 py-1.5 font-medium ${mode === m ? 'bg-sat text-on-sat' : 'text-muted'}`}
          >
            {m === 'bank' ? 'Pay from a bank account (UPI)' : 'Pay from a PocketPay wallet'}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-rule bg-panel px-1 py-2">
        <svg viewBox="0 0 860 380" className="block h-auto w-full min-w-[640px]" role="img" aria-label="Diagram of where money moves in a bank-account UPI payment versus a wallet payment">
          <defs>
            <marker id="mm-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--sun)" />
            </marker>
            <marker id="mm-arrow-muted" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--muted)" />
            </marker>
          </defs>

          <Box x={30} y={30} w={190} h={60} title="Riya’s bank" sub="her savings account" />
          <Box x={640} y={30} w={190} h={60} title="Canteen’s bank" sub="the canteen’s account" />

          {!wallet && (
            <>
              <Box x={335} y={30} w={190} h={60} title="NPCI" sub="UPI switch" />
              <Arrow d="M220,60 L330,60" label="debit ₹40" lx={275} ly={50} on />
              <Arrow d="M525,60 L635,60" label="credit ₹40" lx={580} ly={50} on />
              <Box x={250} y={200} w={360} h={130} title="PocketPay app" dashed />
              <text x={430} y={258} textAnchor="middle" fontSize={13} fill="var(--ink)">Sends the request through its PSP bank.</text>
              <text x={430} y={280} textAnchor="middle" fontSize={13} fill="var(--ink)">Holds no rupees. Records the payment’s status</text>
              <text x={430} y={300} textAnchor="middle" fontSize={13} fill="var(--ink)">and any reward coins.</text>
              <Arrow d="M430,198 L430,96" label="request (via PSP)" lx={500} ly={150} on dotted />
            </>
          )}

          {wallet && (
            <>
              <Box x={320} y={140} w={220} h={60} title="PocketPay’s escrow" sub="account at its partner bank" />
              <Arrow d="M150,92 C150,170 230,170 316,170" label="₹200 top-up" lx={200} ly={190} on={step === 0} />
              <Arrow d="M544,170 C640,170 720,170 720,96" label="₹40 payout" lx={665} ly={190} on={step === 2} />

              <rect x={150} y={240} width={560} height={120} rx={10} fill="none" stroke="var(--sat)" strokeWidth={1.5} />
              <text x={430} y={262} textAnchor="middle" fontSize={13} fontWeight={700} fill="var(--sat)">PocketPay’s ledger (who the escrow money belongs to)</text>
              {[
                { x: 168, name: 'Riya’s wallet' },
                { x: 356, name: 'Owed to canteen' },
                { x: 544, name: 'Cash at bank' },
              ].map((a) => (
                <g key={a.name}>
                  <rect x={a.x} y={280} width={148} height={60} rx={6} fill="var(--panel)" stroke="var(--rule)" strokeWidth={1.5} />
                  <text x={a.x + 74} y={316} textAnchor="middle" fontSize={15} fontWeight={600} fill="var(--ink)">{a.name}</text>
                </g>
              ))}
              <Arrow d="M318,310 L352,310" label="" lx={0} ly={0} on={step === 1} />
              <line x1={430} y1={200} x2={618} y2={278} stroke="var(--rule)" strokeWidth={1.5} strokeDasharray="3 4" />
            </>
          )}
        </svg>
      </div>

      {!wallet ? (
        <p className="mt-3 rounded-r-lg border-l-4 border-sat bg-sat-soft px-4 py-3 leading-relaxed">
          <b>Bank-account UPI payment.</b> The ₹40 moves from Riya’s bank to the canteen’s bank. The app only sends the request and records what happened.
          This is the four-party flow from the <Link className="font-medium text-sat underline underline-offset-4" to="/day-1/upi-primer#the-payment-step-by-step">UPI primer</Link>, shown here as a summary.
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {walletSteps.map((s, i) => (
              <button
                key={s.title}
                onClick={() => setStep(i as WalletStep)}
                className={`rounded-md border-[1.5px] px-3.5 py-1.5 font-medium ${step === i ? 'border-sun bg-sun-soft' : 'border-rule'}`}
              >
                {i + 1}. {s.title}
              </button>
            ))}
          </div>
          <div className="mt-3 grid gap-3 rounded-r-lg border-l-4 border-sun bg-sun-soft px-4 py-3 sm:grid-cols-[1fr_auto]">
            <p className="m-0 leading-relaxed"><b>{walletSteps[step].title}.</b> {walletSteps[step].real}</p>
            <div className="font-mono text-sm whitespace-nowrap">
              {walletSteps[step].ledger.map((l) => (
                <div key={l} className={l.startsWith('Cr') ? 'pl-5' : ''}>{l}</div>
              ))}
            </div>
          </div>
        </>
      )}
    </figure>
  );
}
