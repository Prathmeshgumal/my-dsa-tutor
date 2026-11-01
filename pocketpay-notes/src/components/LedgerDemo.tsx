import { useState } from 'react';

// A tiny double-entry ledger in the browser. Example only: PocketPay's real ledger lives in Postgres.
type Currency = 'INR' | 'COIN';
type Account = { id: string; name: string; type: 'Asset' | 'Liability' | 'Expense'; currency: Currency };
type Posting = { account: string; direction: 'debit' | 'credit'; amount: number }; // amount: paise or coins, always positive
type Entry = { id: number; description: string; postings: Posting[]; reverses?: number };

const accounts: Account[] = [
  { id: 'bank', name: 'Cash at bank', type: 'Asset', currency: 'INR' },
  { id: 'riya', name: 'Riya’s wallet', type: 'Liability', currency: 'INR' },
  { id: 'canteen', name: 'Owed to canteen', type: 'Liability', currency: 'INR' },
  { id: 'coins', name: 'Riya’s coins', type: 'Liability', currency: 'COIN' },
  { id: 'rewards', name: 'Rewards expense', type: 'Expense', currency: 'COIN' },
];
const debitNormal = (a: Account) => a.type === 'Asset' || a.type === 'Expense';
const fmt = (a: Account, v: number) => (a.currency === 'INR' ? `₹${(v / 100).toFixed(2)}` : `${v} coins`);

function balance(entries: Entry[], acc: Account) {
  let debits = 0;
  let credits = 0;
  for (const e of entries) for (const p of e.postings) if (p.account === acc.id) p.direction === 'debit' ? (debits += p.amount) : (credits += p.amount);
  return debitNormal(acc) ? debits - credits : credits - debits;
}

export default function LedgerDemo() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [message, setMessage] = useState('Start with a top-up.');
  const byId = (id: string) => accounts.find((a) => a.id === id)!;

  const add = (description: string, postings: Posting[], reverses?: number) =>
    setEntries((es) => [...es, { id: es.length + 1, description, postings, reverses }]);

  const topUp = () => {
    add('Riya tops up ₹200 from her bank', [
      { account: 'bank', direction: 'debit', amount: 20000 },
      { account: 'riya', direction: 'credit', amount: 20000 },
    ]);
    setMessage('Top-up recorded: the bank now holds ₹200 more, and PocketPay owes Riya ₹200 more.');
  };

  const pay = () => {
    if (balance(entries, byId('riya')) < 4000) {
      setMessage('Rejected: Riya’s wallet has less than ₹40. No entry was written, so nothing changed.');
      return;
    }
    add('Riya pays the canteen ₹40', [
      { account: 'riya', direction: 'debit', amount: 4000 },
      { account: 'canteen', direction: 'credit', amount: 4000 },
    ]);
    add('Riya earns 4 coins for the payment', [
      { account: 'rewards', direction: 'debit', amount: 4 },
      { account: 'coins', direction: 'credit', amount: 4 },
    ]);
    setMessage('Two entries: the ₹40 moved from Riya’s wallet to what we owe the canteen, and 4 coins were issued. Each entry balances on its own.');
  };

  const reverseLast = () => {
    const last = [...entries].reverse().find((e) => !e.reverses && !entries.some((x) => x.reverses === e.id));
    if (!last) {
      setMessage('Nothing left to reverse.');
      return;
    }
    add(`Reversal of entry #${last.id}`, last.postings.map((p) => ({ ...p, direction: p.direction === 'debit' ? 'credit' : 'debit' })), last.id);
    setMessage(`Entry #${last.id} is still there. A new entry with the opposite directions cancels its effect.`);
  };

  const totals = (c: Currency) => {
    let d = 0;
    let cr = 0;
    for (const e of entries) for (const p of e.postings) if (byId(p.account).currency === c) p.direction === 'debit' ? (d += p.amount) : (cr += p.amount);
    return { d, cr };
  };
  const inr = totals('INR');
  const coin = totals('COIN');

  return (
    <figure className="not-prose my-6 rounded-lg border border-rule bg-panel p-5 text-ink">
      <div className="flex flex-wrap gap-2">
        <button onClick={topUp} className="rounded-md bg-sat px-3.5 py-1.5 font-medium text-on-sat">Top up ₹200</button>
        <button onClick={pay} className="rounded-md bg-sat px-3.5 py-1.5 font-medium text-on-sat">Pay canteen ₹40</button>
        <button onClick={reverseLast} className="rounded-md border-[1.5px] border-rule px-3.5 py-1.5 font-medium">Reverse last entry</button>
        <button onClick={() => { setEntries([]); setMessage('Start with a top-up.'); }} className="rounded-md border-[1.5px] border-rule px-3.5 py-1.5 font-medium">Reset</button>
      </div>
      <p className="mt-3 text-[0.95rem]" aria-live="polite">{message}</p>

      <div className="mt-4 grid gap-5 md:grid-cols-2">
        <div>
          <p className="mb-2 font-bold">Balances (worked out from the entries)</p>
          <table className="w-full text-[0.92rem]">
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="border-b border-rule last:border-0">
                  <td className="py-1.5">{a.name}<span className="block text-xs text-muted">{a.type}, {debitNormal(a) ? 'debit' : 'credit'} normal</span></td>
                  <td className="py-1.5 text-right font-mono">{fmt(a, balance(entries, a))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={`mt-3 text-sm font-medium ${inr.d === inr.cr && coin.d === coin.cr ? 'text-keep' : 'text-cut'}`}>
            Debits = credits: ₹{(inr.d / 100).toFixed(2)} = ₹{(inr.cr / 100).toFixed(2)}, and {coin.d} = {coin.cr} coins
          </p>
        </div>

        <div>
          <p className="mb-2 font-bold">Journal (append-only)</p>
          <ol className="max-h-72 space-y-2 overflow-y-auto text-[0.88rem]">
            {entries.length === 0 && <li className="text-muted">No entries yet.</li>}
            {[...entries].reverse().map((e) => (
              <li key={e.id} className="rounded-md border border-rule px-3 py-2">
                <b>#{e.id}</b> {e.description}
                <ul className="mt-1 font-mono text-xs">
                  {e.postings.map((p, i) => (
                    <li key={i} className={p.direction === 'credit' ? 'pl-6' : ''}>
                      {p.direction === 'debit' ? 'Dr' : 'Cr'} {byId(p.account).name} {fmt(byId(p.account), p.amount)}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </figure>
  );
}
