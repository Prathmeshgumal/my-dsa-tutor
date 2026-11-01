import { useState } from 'react';

// PocketPay's connection string (from backend/tests/conftest.py), split into its parts. The URI layout and
// the meaning of sslmode=disable are from the libpq docs, cited on the page.
const parts = [
  { text: 'postgres://', name: 'Scheme', color: 'var(--muted)', say: 'Says “this is a Postgres address”. Postgres accepts both postgres:// and postgresql://.' },
  { text: 'pocketpay', name: 'User', color: 'var(--sat)', say: 'The database user to log in as. Postgres has its own users, separate from the users of your computer. Ours was created by the Docker image from POSTGRES_USER.' },
  { text: ':pocketpay', name: 'Password', color: 'var(--cut)', say: 'That user’s password. Fine for a local practice database; in real code it comes from .env and is never committed.' },
  { text: '@localhost', name: 'Host', color: 'var(--keep)', say: 'Which computer the server runs on. localhost means this same computer. Docker forwards it into the container.' },
  { text: ':5432', name: 'Port', color: 'var(--sun)', say: 'Which “door” on that computer the server listens at. 5432 is Postgres’s default port.' },
  { text: '/pocketpay', name: 'Database', color: 'var(--sat)', say: 'Which database inside the server. One Postgres server can hold many separate databases; ours is called pocketpay.' },
  { text: '?sslmode=disable', name: 'Options', color: 'var(--muted)', say: 'Extra settings. sslmode=disable means “only try a connection without SSL encryption”. That’s fine for a server on your own laptop, and wrong for one across the internet.' },
];

export default function ConnString() {
  const [i, setI] = useState(3);
  return (
    <figure className="not-prose my-6 rounded-lg border border-rule bg-panel p-4 text-ink sm:p-5">
      <div className="overflow-x-auto pb-1">
        <div className="flex w-max font-mono text-[14px] sm:text-base" role="group" aria-label="Parts of the connection string">
          {parts.map((p, k) => (
            <button key={p.name} onClick={() => setI(k)} aria-pressed={i === k}
              className={`rounded px-0.5 py-1 font-bold underline decoration-2 underline-offset-[6px] ${i === k ? 'bg-sun-soft' : ''}`}
              style={{ color: p.color, textDecorationColor: i === k ? p.color : 'transparent' }}>{p.text}</button>
          ))}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-sm">
        {parts.map((p, k) => (
          <button key={p.name} onClick={() => setI(k)} aria-pressed={i === k}
            className={`rounded-md border px-2.5 py-1 ${i === k ? 'border-sat bg-sat text-on-sat' : 'border-rule text-muted'}`}>{p.name}</button>
        ))}
      </div>
      <p className="mt-3 rounded-r-lg border-l-4 border-sun bg-sun-soft px-4 py-3 leading-relaxed" aria-live="polite">
        <span className="font-bold">{parts[i].name}: </span>{parts[i].say}
      </p>
      <figcaption className="mt-2 text-sm text-muted">Click any part. This is the exact string our tests use.</figcaption>
    </figure>
  );
}
