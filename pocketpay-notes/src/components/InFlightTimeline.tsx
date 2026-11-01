import { useState } from 'react';

// Where Riya's ₹40 is, moment by moment, when the credit to a merchant fails.
// Deadlines from RBI's TAT circular (20 Sept 2019); the timeline itself is an example.
const stops = [
  { label: 'In Riya’s account', place: 0, note: 'Before the payment. The ₹40 is in Riya’s bank account.' },
  { label: 'Debited', place: 1, note: 'Riya’s bank debits ₹40 (step 7 of the UPI flow). It has left her account.' },
  { label: 'In flight', place: 1, note: 'The credit to the canteen’s bank fails or no reply comes back. The ₹40 is in neither account’s balance. This is “in flight”.', alert: true },
  { label: 'Reversed', place: 0, note: 'The reversal is a new credit back to Riya. For a merchant payment, RBI’s deadline is T+5 days; for a payment to a person it’s T+1. After that, ₹100 per day compensation.' },
];
const places = ['Riya’s account', 'In flight', 'Canteen’s account'];

export default function InFlightTimeline() {
  const [i, setI] = useState(0);
  const s = stops[i];
  const x = (p: number) => 110 + p * 300;

  return (
    <figure className="not-prose my-6 rounded-lg border border-rule bg-panel p-5 text-ink">
      <div className="overflow-x-auto">
        <svg viewBox="0 0 820 130" className="block h-auto w-full min-w-[560px]" role="img" aria-label="Where the ₹40 is at each moment of a failed payment">
          {places.map((p, k) => (
            <g key={p}>
              <rect x={x(k) - 100} y={40} width={200} height={56} rx={8}
                fill={k === 1 ? 'var(--sun-soft)' : 'var(--sat-soft)'}
                stroke={k === 1 ? 'var(--sun)' : 'var(--sat)'} strokeWidth={1.5} strokeDasharray={k === 1 ? '6 4' : undefined} />
              <text x={x(k)} y={74} textAnchor="middle" fontSize={18} fontWeight={700} fill="var(--ink)">{p}</text>
            </g>
          ))}
          <text x={x(2)} y={120} textAnchor="middle" fontSize={14} fill="var(--muted)">never reached in this example</text>
          <g style={{ transform: `translateX(${x(s.place) - 110}px)`, transition: 'transform 400ms ease' }}>
            <circle cx={110} cy={22} r={21} fill={s.alert ? 'var(--cut)' : 'var(--sun)'} />
            <text x={110} y={27} textAnchor="middle" fontSize={14} fontWeight={800} fill="var(--paper)">₹40</text>
          </g>
        </svg>
      </div>

      <ol className="mt-3 flex flex-wrap gap-2">
        {stops.map((st, k) => (
          <li key={st.label}>
            <button onClick={() => setI(k)} className={`rounded-md border-[1.5px] px-3 py-1.5 font-medium ${k === i ? 'border-sun bg-sun-soft' : 'border-rule'}`}>
              {k + 1}. {st.label}
            </button>
          </li>
        ))}
      </ol>
      <p className="mt-3 rounded-r-lg border-l-4 border-sun bg-sun-soft px-4 py-3 leading-relaxed" aria-live="polite">{s.note}</p>
    </figure>
  );
}
