import { useState } from 'react';
import ArchFigure from './ArchFigure';

// PocketPay's tables. Built tables match backend/migrations (001_ledger.sql, 002_payments.sql); the rest are a
// first draft that each block will refine. Click a table to see what it links to and why it exists.
type Table = { id: string; x: number; y: number; cols: string[]; built?: boolean; block: string; why: string };
const W = 260;
const HEAD = 30;
const ROW = 21;

const tables: Table[] = [
  { id: 'users', x: 20, y: 20, built: true, block: 'Block 3', cols: ['id', 'name', 'birth_date', 'parent_id → users', 'wallet_account_id → accounts', 'coins_account_id → accounts', 'created_at'],
    why: 'A teen or a parent. Each teen points at two ledger accounts: their ₹ wallet and their reward coins. Birth date drives age-based limits (Block 12).' },
  { id: 'cards', x: 20, y: 215, built: true, block: 'Block 3', cols: ['id', 'user_id → users', 'status', 'created_at'],
    why: 'One card per teen. Status is active, paused or blocked, moved only by the card state machine.' },
  { id: 'agent_mandates', x: 20, y: 350, block: 'Block 9', cols: ['id', 'user_id → users', 'agent_name', 'daily_cap', 'per_payment_max', 'approval_above', 'merchants', 'expires_at', 'revoked_at'],
    why: 'The limits a parent sets for one agent. Checked in the payment service on every agent request.' },
  { id: 'agent_tokens', x: 20, y: 595, block: 'Block 9', cols: ['token_hash', 'mandate_id → agent_mandates', 'expires_at'],
    why: 'What an agent presents instead of a password. Stored hashed; useless beyond its one mandate.' },

  { id: 'payments', x: 295, y: 20, built: true, block: 'Block 3', cols: ['id', 'user_id → users', 'merchant_id → merchants', 'amount', 'status', 'entry_id → journal_entries', 'created_at', 'updated_at'],
    why: 'One row per payment, with its current state. The money itself is in the ledger; entry_id says which entry moved it. (Block 9 adds mandate_id for agent payments.)' },
  { id: 'refunds', x: 295, y: 255, block: 'Block 5', cols: ['id', 'payment_id → payments', 'amount', 'entry_id → journal_entries'],
    why: 'One row per refund. The sum of a payment’s refunds can never exceed its amount.' },
  { id: 'idempotency_keys', x: 295, y: 395, built: true, block: 'Block 3', cols: ['user_id → users  (key part 1)', 'key  (key part 2)', 'request_hash', 'status', 'owner', 'locked_at', 'response_code', 'response_body', 'created_at'],
    why: 'Remembers each money-moving request, per user, so a repeat gets the saved answer. request_hash spots a key reused with a different body; owner and locked_at let a retry take over a key whose request crashed.' },

  { id: 'journal_entries', x: 570, y: 20, built: true, block: 'Block 2', cols: ['id', 'description', 'reverses_entry_id → journal_entries', 'created_at'],
    why: 'Built. One row per money event. A reversal points back at the entry it undoes, and UNIQUE stops a second reversal.' },
  { id: 'postings', x: 570, y: 170, built: true, block: 'Block 2', cols: ['id', 'entry_id → journal_entries', 'account_id → accounts', 'direction', 'amount'],
    why: 'Built. The debit and credit lines of each entry. Never updated or deleted; balances are their sum.' },
  { id: 'accounts', x: 570, y: 330, built: true, block: 'Block 2', cols: ['id', 'name', 'type', 'currency', 'created_at'],
    why: 'Built. Every pot of money: wallets, cash at the bank, owed to merchants, reward coins.' },
  { id: 'merchants', x: 570, y: 500, built: true, block: 'Block 3', cols: ['id', 'name', 'account_id → accounts', 'created_at'],
    why: 'Who can be paid. Each merchant has one ledger account, “owed to this merchant”, which payments are credited to until the merchant is paid out (Block 4).' },

  { id: 'outbox_events', x: 845, y: 20, block: 'Block 4', cols: ['id', 'topic', 'payload', 'created_at', 'published_at'],
    why: 'Events written in the same transaction as the change they describe. The relay publishes the rows with no published_at.' },
  { id: 'processed_events', x: 845, y: 175, block: 'Block 4', cols: ['consumer', 'event_id', 'processed_at'],
    why: 'Which events and bank callbacks each consumer has already handled. A repeat finds its row and does nothing.' },
];

const height = (t: Table) => HEAD + t.cols.length * ROW + 8;

// Every "→ table" column becomes a line to that table.
const links = tables.flatMap((t) =>
  t.cols.map((c, i) => ({ from: t.id, row: i, to: c.split('→ ')[1] })).filter((l) => l.to),
);

function path(l: { from: string; row: number; to: string }) {
  const a = tables.find((t) => t.id === l.from)!;
  const b = tables.find((t) => t.id === l.to)!;
  const y1 = a.y + HEAD + l.row * ROW + 14;
  const y2 = b.y + 15;
  if (a === b) return `M${a.x + W},${y1} C${a.x + W + 40},${y1} ${a.x + W + 40},${y2} ${a.x + W},${y2}`;
  const right = b.x > a.x;
  const sameCol = b.x === a.x;
  if (sameCol) {
    const x = a.x;
    return `M${x},${y1} C${x - 18},${y1} ${x - 18},${y2} ${x},${y2}`;
  }
  const x1 = right ? a.x + W : a.x;
  const x2 = right ? b.x : b.x + W;
  const mid = (x1 + x2) / 2;
  return `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`;
}

export default function DataModel() {
  const [picked, setPicked] = useState('payments');
  const t = tables.find((x) => x.id === picked)!;
  const related = new Set(links.filter((l) => l.from === picked || l.to === picked).flatMap((l) => [l.from, l.to]));

  return (
    <ArchFigure label="PocketPay data model">
      <div className="overflow-x-auto">
        <svg viewBox="0 0 1125 700" className="block h-auto w-full min-w-[760px]" role="img"
          aria-label="PocketPay's tables and how they link. The ledger and payment tables are built; the rest are planned.">
          <defs>
            <marker id="dm-dot" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6">
              <circle cx="5" cy="5" r="4" fill="context-stroke" />
            </marker>
          </defs>
          {links.map((l, i) => {
            const on = l.from === picked || l.to === picked;
            return <path key={i} d={path(l)} fill="none" stroke={on ? 'var(--sun)' : 'var(--rule)'} strokeWidth={on ? 2.6 : 1.4} markerEnd="url(#dm-dot)" opacity={on ? 1 : 0.8} />;
          })}
          {tables.map((tb) => {
            const on = tb.id === picked;
            const near = related.has(tb.id);
            return (
              <g key={tb.id} onClick={() => setPicked(tb.id)} className="cursor-pointer" role="button" tabIndex={0}
                aria-label={`Table ${tb.id}${tb.built ? ', built' : ', planned'}`} aria-pressed={on}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPicked(tb.id); } }}>
                <rect x={tb.x} y={tb.y} width={W} height={height(tb)} rx={8} fill="var(--paper)"
                  stroke={on ? 'var(--sun)' : tb.built ? 'var(--keep)' : 'var(--sat)'} strokeWidth={on ? 3 : near ? 2.2 : 1.5}
                  strokeDasharray={tb.built || on ? undefined : '6 4'} />
                <rect x={tb.x} y={tb.y} width={W} height={HEAD} rx={8} fill={tb.built ? 'var(--keep)' : on ? 'var(--sun)' : 'var(--sat)'} />
                <rect x={tb.x} y={tb.y + HEAD - 8} width={W} height={8} fill={tb.built ? 'var(--keep)' : on ? 'var(--sun)' : 'var(--sat)'} />
                <text x={tb.x + 12} y={tb.y + 20} fontSize={14} fontWeight={800} fill="var(--on-sat)" fontFamily="var(--font-mono)">{tb.id}</text>
                <text x={tb.x + W - 10} y={tb.y + 20} textAnchor="end" fontSize={10.5} fontWeight={700} fill="var(--on-sat)">{tb.built ? 'BUILT' : tb.block}</text>
                {tb.cols.map((c, i) => {
                  const [name, ref] = c.split(' → ');
                  return (
                    <text key={c} x={tb.x + 12} y={tb.y + HEAD + i * ROW + 18} fontSize={12.5} fontFamily="var(--font-mono)" fill="var(--ink)">
                      {name}{ref && <tspan fill="var(--muted)"> → {ref}</tspan>}
                    </text>
                  );
                })}
              </g>
            );
          })}
          <text x={845} y={290} fontSize={12} fill="var(--muted)">
            <tspan x={845} dy={0}>No links on purpose: outbox_events is</tspan>
            <tspan x={845} dy={17}>written in the same transaction as</tspan>
            <tspan x={845} dy={17}>payments, and processed_events is</tspan>
            <tspan x={845} dy={17}>keyed by event ID.</tspan>
          </text>
        </svg>
      </div>
      <p className="mt-3 rounded-r-lg border-l-4 border-sun bg-sun-soft px-4 py-3 leading-relaxed" aria-live="polite">
        <span className="font-mono font-bold">{t.id}</span> <span className="text-sm text-muted">({t.built ? 'built' : `planned, ${t.block}`})</span>: {t.why}
      </p>
      <figcaption className="mt-2 text-sm text-muted">Green tables exist today. Dashed ones are a first draft; each block will settle their exact columns. Amounts are paise (or whole coins), always BIGINT.</figcaption>
    </ArchFigure>
  );
}
