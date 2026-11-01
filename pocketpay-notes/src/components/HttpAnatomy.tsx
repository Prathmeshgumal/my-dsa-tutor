import { useState } from 'react';

// A real HTTP exchange, captured with `curl -v` against a small FastAPI app on our laptop (31 Oct 2026).
// The message layout (start line, header lines, empty line, body) is from RFC 9112; meanings are cited on the page.
type Line = { text: string; part: string; say: string };

const request: Line[] = [
  { text: 'POST /payments HTTP/1.1', part: 'Request line', say: 'Three things separated by spaces: the method (POST: “do something with what I’m sending”), the path (/payments: which thing on the server), and the HTTP version.' },
  { text: 'Host: 127.0.0.1:8765', part: 'Header', say: 'Which server and port the request is for. Every HTTP/1.1 request carries it.' },
  { text: 'User-Agent: curl/8.18.0', part: 'Header', say: 'Which client sent the request. Here, the curl command-line tool. Riya’s app would put its own name here.' },
  { text: 'Accept: */*', part: 'Header', say: 'What kinds of answer the client can read. */* means “anything”.' },
  { text: 'Content-Type: application/json', part: 'Header', say: 'What the body is written in: JSON. FastAPI reads the body as JSON because of this.' },
  { text: 'Content-Length: 30', part: 'Header', say: 'How long the body is, in bytes, so the server knows where the request ends.' },
  { text: '', part: 'Empty line', say: 'A blank line means “the headers are over”. Everything after it is the body.' },
  { text: '{"to":"canteen","amount":4000}', part: 'Body', say: 'The data itself, as JSON: pay 4000 paise (₹40) to the canteen. This is what our Pydantic model will check.' },
];

const response: Line[] = [
  { text: 'HTTP/1.1 201 Created', part: 'Status line', say: 'The version, the status code, and a short phrase. 201 means the request worked and created something new: a payment.' },
  { text: 'date: Sat, 31 Oct 2026 13:20:30 GMT', part: 'Header', say: 'When the response was made.' },
  { text: 'server: uvicorn', part: 'Header', say: 'The program that answered. It says Uvicorn, not FastAPI: Uvicorn is the web server; FastAPI runs inside it.' },
  { text: 'content-length: 59', part: 'Header', say: 'The body is 59 bytes long.' },
  { text: 'content-type: application/json', part: 'Header', say: 'The body is JSON. FastAPI set this because our function returned Python data that it turned into JSON.' },
  { text: '', part: 'Empty line', say: 'End of the headers.' },
  { text: '{"id":1,"to":"canteen","amount":4000,"status":"processing"}', part: 'Body', say: 'What our function returned: a Python dict, turned into JSON by FastAPI.' },
];

const rejected: Line[] = [
  { text: 'POST /payments HTTP/1.1  …same headers…', part: 'Request line', say: 'The same request, but with a negative amount in the body.' },
  { text: '{"to":"canteen","amount":-5}', part: 'Body', say: 'amount is -5. Our Pydantic model says amount must be greater than 0.' },
  { text: 'HTTP/1.1 422 Unprocessable Entity', part: 'Status line', say: '422: the server understood the request, but can’t act on what’s inside it. FastAPI answered this by itself; our function never ran. (Uvicorn still sends the old phrase “Unprocessable Entity”; RFC 9110 renamed it “Unprocessable Content”. Programs only look at the number.)' },
  { text: '{"detail":[{"type":"greater_than","loc":["body","amount"],"msg":"Input should be greater than 0","input":-5,"ctx":{"gt":0}}]}', part: 'Body', say: 'FastAPI’s error body says exactly what was wrong and where: in the body, the field amount, should be greater than 0, and you sent -5.' },
];

const tabs = [
  { name: 'The request', lines: request },
  { name: 'The response', lines: response },
  { name: 'A rejected request', lines: rejected },
];

export default function HttpAnatomy() {
  const [t, setT] = useState(0);
  const [i, setI] = useState(0);
  const lines = tabs[t].lines;
  const cur = lines[Math.min(i, lines.length - 1)];

  return (
    <figure className="not-prose my-6 rounded-lg border border-rule bg-panel p-4 text-ink sm:p-5">
      <div className="mb-3 inline-flex flex-wrap rounded-lg border border-rule p-1" role="tablist">
        {tabs.map((x, k) => (
          <button key={x.name} role="tab" aria-selected={t === k} onClick={() => { setT(k); setI(0); }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${t === k ? 'bg-sat text-on-sat' : 'text-muted'}`}>{x.name}</button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-md border border-rule bg-paper font-mono text-[13px]">
        {lines.map((l, k) => (
          <button key={k} onClick={() => setI(k)} aria-pressed={i === k}
            className={`flex w-full items-baseline gap-3 whitespace-nowrap px-3 py-1 text-left ${i === k ? 'bg-sun-soft' : ''}`}>
            <span className="w-24 shrink-0 font-sans text-xs text-muted">{l.part}</span>
            <span className={l.part.endsWith('line') && l.text ? 'font-bold text-sat' : l.part === 'Body' ? 'font-bold' : ''}>{l.text || '(blank)'}</span>
          </button>
        ))}
      </div>
      <p className="mt-3 rounded-r-lg border-l-4 border-sun bg-sun-soft px-4 py-3 leading-relaxed" aria-live="polite">
        <span className="font-bold">{cur.part}: </span>{cur.say}
      </p>
      <figcaption className="mt-2 text-sm text-muted">A real exchange with a small test app on our laptop, captured with <code>curl -v</code>. Click any line.</figcaption>
    </figure>
  );
}
