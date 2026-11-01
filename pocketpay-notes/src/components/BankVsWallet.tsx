import { useState } from 'react';

// Two ways an app can let Riya pay: straight from her bank account, or from money she first adds to the app (a wallet).
type Mode = 'bank' | 'wallet';

function Node({ x, y, w, title, sub, tone = 'sat' }: { x: number; y: number; w: number; title: string; sub?: string; tone?: 'sat' | 'sun' }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={72} rx={10} fill={`var(--${tone}-soft)`} stroke={`var(--${tone})`} strokeWidth={2} />
      <text x={x + w / 2} y={y + (sub ? 31 : 42)} textAnchor="middle" fontSize={18} fontWeight={700} fill="var(--ink)">{title}</text>
      {sub && <text x={x + w / 2} y={y + 54} textAnchor="middle" fontSize={14} fill="var(--muted)">{sub}</text>}
    </g>
  );
}

function Arrow({ x1, x2, y, label, n }: { x1: number; x2: number; y: number; label: string; n: number }) {
  return (
    <g>
      <line x1={x1} y1={y} x2={x2 - 6} y2={y} stroke="var(--sun)" strokeWidth={4} markerEnd="url(#bw-arrow)" />
      <circle cx={(x1 + x2) / 2} cy={y - 30} r={12} fill="var(--sun)" />
      <text x={(x1 + x2) / 2} y={y - 25} textAnchor="middle" fontSize={13} fontWeight={800} fill="var(--paper)">{n}</text>
      <text x={(x1 + x2) / 2} y={y + 26} textAnchor="middle" fontSize={15} fontWeight={600} fill="var(--ink)">{label}</text>
    </g>
  );
}

export default function BankVsWallet() {
  const [mode, setMode] = useState<Mode>('bank');
  const wallet = mode === 'wallet';

  return (
    <figure className="not-prose my-6 text-ink">
      <div className="mb-3 inline-flex rounded-lg border border-rule p-1" role="tablist">
        {(['bank', 'wallet'] as Mode[]).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
            className={`rounded-md px-3.5 py-1.5 font-medium ${mode === m ? 'bg-sat text-on-sat' : 'text-muted'}`}>
            {m === 'bank' ? 'Pay straight from the bank' : 'Pay from a wallet'}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-lg border border-rule bg-panel p-2">
        <svg viewBox="0 0 860 230" className="block h-auto w-full min-w-[600px]" role="img"
          aria-label={wallet ? 'Riya adds money from her bank to the app, then pays the canteen from the app' : 'Riya pays the canteen straight from her bank account; the app only passes on the request'}>
          <defs>
            <marker id="bw-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--sun)" />
            </marker>
          </defs>
          {!wallet ? (
            <>
              <Node x={20} y={60} w={200} title="Riya’s bank" sub="holds her money" />
              <Node x={640} y={60} w={200} title="Canteen’s bank" sub="holds the canteen’s money" />
              <Arrow x1={220} x2={640} y={96} label="₹40 goes bank to bank" n={1} />
              <rect x={330} y={160} width={200} height={56} rx={10} fill="none" stroke="var(--muted)" strokeWidth={2} strokeDasharray="6 5" />
              <text x={430} y={186} textAnchor="middle" fontSize={16} fontWeight={700} fill="var(--ink)">The app</text>
              <text x={430} y={206} textAnchor="middle" fontSize={13} fill="var(--muted)">holds ₹0, only passes the request</text>
            </>
          ) : (
            <>
              <Node x={10} y={60} w={180} title="Riya’s bank" sub="holds her money" />
              <Node x={340} y={60} w={180} title="PocketPay wallet" sub="Riya’s ₹200 is here" tone="sun" />
              <Node x={670} y={60} w={180} title="Canteen" sub="gets paid" />
              <Arrow x1={190} x2={340} y={96} label="Add ₹200 first" n={1} />
              <Arrow x1={520} x2={670} y={96} label="Spend ₹40 later" n={2} />
              <text x={430} y={196} textAnchor="middle" fontSize={15} fill="var(--ink)">The app now holds Riya’s money. That makes it a <tspan fontWeight={800}>prepaid wallet (PPI)</tspan>.</text>
            </>
          )}
        </svg>
      </div>
      <p className="mt-3 rounded-r-lg border-l-4 border-sat bg-sat-soft px-4 py-3 leading-relaxed">
        {wallet
          ? 'Money goes in first, then gets spent. Because the app is holding people’s money, RBI’s prepaid-wallet rules apply to it.'
          : 'The money never touches the app. The two banks move it. The app is just the button Riya presses.'}
      </p>
    </figure>
  );
}
