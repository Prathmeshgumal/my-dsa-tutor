import { useState } from 'react';

// What Riya sees on her phone, and which requests reach PocketPay, in four situations.
// An illustration of how a payments app could be built (PocketPay is API-only; the app is someone else's code).
type Screen = 'pay' | 'tap' | 'spin' | 'warn' | 'done' | 'done2';
type Req = { text: string; bad?: boolean };
type Frame = { screen: Screen; key?: string; say: string; reqs?: Req[] };

const stories: { name: string; frames: Frame[]; lesson: string }[] = [
  {
    name: 'The app resends by itself',
    frames: [
      { screen: 'pay', key: 'k-81f3', say: 'The pay screen opens. The app makes a key for this payment. Riya never sees it.' },
      { screen: 'spin', say: 'Riya taps Pay once.', reqs: [{ text: 'POST #1 · k-81f3 → server pays ₹40 and saves its answer. The reply is lost on the way back.', bad: true }] },
      { screen: 'spin', say: 'No reply after a few seconds. The app sends the same request again by itself. Riya still sees “Paying…”.', reqs: [{ text: 'POST #2 · k-81f3 → key already finished: the saved 201 is sent back. No money moves.' }] },
      { screen: 'done', say: 'The app shows the payment from the saved answer.' },
    ],
    lesson: 'No button was pressed. Most retries look like this: the app’s network code resends after a timeout.',
  },
  {
    name: 'Two fast taps',
    frames: [
      { screen: 'pay', key: 'k-81f3', say: 'The pay screen opens and the app makes its key.' },
      { screen: 'tap', say: 'Riya taps twice, before the button has had time to switch off.', reqs: [{ text: 'POST #1 · k-81f3 → claims the key and pays ₹40.' }, { text: 'POST #2 · k-81f3 → key already claimed: 409, nothing paid.' }] },
      { screen: 'done', say: 'The app shows request #1’s answer and ignores the 409.' },
    ],
    lesson: 'Both taps happened on the same screen, so both carried the same key.',
  },
  {
    name: 'No internet for a while',
    frames: [
      { screen: 'pay', key: 'k-81f3', say: 'The pay screen opens and the app makes its key.' },
      { screen: 'spin', say: 'Riya taps Pay.', reqs: [{ text: 'POST #1 · k-81f3 → the server pays ₹40. The reply is lost.', bad: true }] },
      { screen: 'spin', say: 'The app resends once by itself, but the Wi-Fi is gone completely.', reqs: [{ text: 'POST #2 · k-81f3 → never reaches the server.', bad: true }] },
      { screen: 'warn', say: 'The app stops retrying on its own and tells the truth: it doesn’t know yet. It does not say “failed”.' },
      { screen: 'done', say: 'Back online, Riya taps “Check again”.', reqs: [{ text: 'POST #3 · k-81f3 → the saved 201. Still one payment.' }] },
    ],
    lesson: 'The only case with a button, and it resends the same request with the same key.',
  },
  {
    name: 'A second lunch',
    frames: [
      { screen: 'done', say: 'The first payment is finished. Riya taps Done.' },
      { screen: 'pay', key: 'k-a42c', say: 'She starts paying for a friend’s lunch. A new pay screen opens, so the app makes a new key.' },
      { screen: 'spin', say: 'She taps Pay.', reqs: [{ text: 'POST · k-a42c → a key the server has never seen: a new ₹40 payment.' }] },
      { screen: 'done2', say: 'Two lunches, two payments. That’s correct.' },
    ],
    lesson: 'A new key means a new payment. Making a new key only for a new pay screen is the app’s job.',
  },
];

function Phone({ f }: { f: Frame }) {
  const paid = f.screen === 'done' || f.screen === 'done2';
  return (
    <div className="flex h-[210px] w-[124px] shrink-0 flex-col rounded-[20px] border-2 border-ink bg-paper p-2.5 text-center text-ink">
      <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-rule" />
      {paid ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sat text-xl font-bold text-on-sat">✓</div>
          <div className="text-sm font-bold">Paid ₹40</div>
          <div className="text-xs text-muted">{f.screen === 'done2' ? 'payment #813' : 'payment #812'}</div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col">
          <div className="text-xs text-muted">School canteen</div>
          <div className="mt-1 text-2xl font-bold">₹40</div>
          <div className="flex flex-1 items-center justify-center">
            {f.screen === 'spin' && <span className="text-sm text-muted">◌ Paying…</span>}
            {f.screen === 'tap' && <span className="text-sm font-bold text-sat">tap tap</span>}
            {f.screen === 'warn' && <span className="text-xs leading-snug"><span className="font-bold text-cut">⚠</span> We couldn’t confirm this payment yet.</span>}
          </div>
        </div>
      )}
      <div className={`rounded-lg py-1 text-xs font-semibold ${f.screen === 'spin' ? 'bg-rule text-muted' : 'bg-sat text-on-sat'}`}>
        {paid ? 'Done' : f.screen === 'warn' ? 'Check again' : 'Pay ₹40'}
      </div>
    </div>
  );
}

export default function PayScreens() {
  const [i, setI] = useState(0);
  const s = stories[i];
  return (
    <figure className="not-prose my-6 rounded-lg border border-rule bg-panel p-4 text-ink sm:p-5">
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Pick a situation">
        {stories.map((x, k) => (
          <button key={x.name} onClick={() => setI(k)} aria-pressed={i === k}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium ${i === k ? 'border-sat bg-sat text-on-sat' : 'border-rule'}`}>{x.name}</button>
        ))}
      </div>
      <ol className="flex flex-wrap gap-3 pb-2">
        {s.frames.map((f, k) => (
          <li key={k} className="flex w-[132px] shrink-0 flex-col items-center gap-2">
            <div className="text-xs font-bold text-muted">{k + 1}</div>
            <Phone f={f} />
            {f.key && <div className="rounded bg-sun-soft px-2 py-0.5 font-mono text-xs">key {f.key} made</div>}
            <p className="text-[13px] leading-snug">{f.say}</p>
            {f.reqs?.map((r) => (
              <p key={r.text} className={`w-full rounded border-l-4 bg-paper px-2 py-1 font-mono text-[10.5px] leading-snug ${r.bad ? 'border-cut' : 'border-sat'}`}>{r.text}</p>
            ))}
          </li>
        ))}
      </ol>
      <p className="mt-3 rounded-r-lg border-l-4 border-sun bg-sun-soft px-4 py-3 leading-relaxed" aria-live="polite">{s.lesson}</p>
      <figcaption className="mt-2 text-sm text-muted">An illustration of how a payments app could behave. PocketPay is only the API; what matters to it is which requests arrive, and with which key.</figcaption>
    </figure>
  );
}
