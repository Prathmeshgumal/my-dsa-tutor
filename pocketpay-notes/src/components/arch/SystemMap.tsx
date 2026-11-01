import { useState } from 'react';
import ArchFigure from './ArchFigure';

// The whole of PocketPay on one map. Click a box to read about it, or follow a request through it step by step.
// The design is PocketPay's own plan (a draft); statuses are where each part stands on 31 Oct 2026.
type Status = 'built' | 'next' | 'planned' | 'outside';
type Node = { id: string; x: number; y: number; w: number; h: number; title: string; sub?: string; status: Status; block?: string; about: string; chip?: boolean };
type Edge = { id: string; d: string; label?: string; lx?: number; ly?: number; anchor?: 'start' | 'middle' | 'end'; noArrow?: boolean };

const nodes: Node[] = [
  { id: 'teen', x: 20, y: 20, w: 170, h: 64, title: 'Riya’s app', sub: 'any HTTP client', status: 'outside',
    about: 'Whatever sends requests to PocketPay. There is no app screen in this project: requests come from tests, curl and the agents. In real life this would be the phone app.' },
  { id: 'parent', x: 210, y: 20, w: 170, h: 64, title: 'Parent', sub: 'sets agent limits', status: 'outside',
    about: 'A parent creates a mandate for an AI agent: how much it may spend per day and per payment, at which merchants, until when. They can revoke it at any time.' },
  { id: 'claude', x: 440, y: 20, w: 190, h: 64, title: 'Claude Desktop', sub: 'MCP host', status: 'outside',
    about: 'An AI app Riya chats with. It connects to PocketPay’s MCP server and can use its wallet tools on her behalf.' },
  { id: 'support', x: 650, y: 20, w: 190, h: 64, title: 'Support chat', sub: 'Riya has a problem', status: 'outside',
    about: 'Where Riya raises a dispute or asks for a refund. The support agent answers her.' },
  { id: 'llm', x: 880, y: 20, w: 200, h: 64, title: 'LLM API', sub: 'the model', status: 'outside',
    about: 'The language model behind every agent. It reads messages and tool lists and decides which tool to ask for. It never moves money itself: it can only ask, and PocketPay’s code decides.' },

  { id: 'loop', x: 80, y: 140, w: 210, h: 70, title: 'Tool-calling loop', sub: '~100 lines, no framework', status: 'planned', block: 'Block 7',
    about: 'A tiny agent that answers questions like “How much did I spend on food this week?”. It shows that an agent is just a loop: the model asks for a tool, our code runs it, the result goes back to the model.' },
  { id: 'mcp', x: 440, y: 140, w: 190, h: 70, title: 'MCP server', sub: 'wallet tools', status: 'planned', block: 'Block 8',
    about: 'Exposes get_balance, list_transactions, create_payment and request_refund as MCP tools, so any MCP host can use them. It holds no rules of its own: every tool calls the payments API.' },
  { id: 'lg', x: 650, y: 140, w: 190, h: 70, title: 'Support agent', sub: 'LangGraph + RAG', status: 'planned', block: 'Block 10',
    about: 'Answers disputes from the refund policy (retrieval-augmented generation). Refunds over ₹500 pause the graph with interrupt() until a person approves.' },
  { id: 'langfuse', x: 880, y: 140, w: 200, h: 70, title: 'Langfuse', sub: 'traces + evals', status: 'planned', block: 'Block 11',
    about: 'Records every model call and tool call as a trace. The 25-case eval suite, including prompt-injection attacks, is checked against these runs.' },

  { id: 'api', x: 20, y: 270, w: 840, h: 180, title: 'PocketPay API', sub: 'FastAPI + Pydantic, async', status: 'built', block: 'Block 3 on',
    about: 'The one door to money. Every client, person or agent, goes through these endpoints, and every rule is checked here, in code. The chips inside are the parts it is made of.' },
  { id: 'auth', x: 40, y: 312, w: 190, h: 52, chip: true, title: 'Auth + agent tokens', status: 'planned', block: 'Block 9',
    about: 'Works out who is calling: Riya herself, or an agent holding a scoped token tied to one mandate. An agent token can never do more than its mandate allows.' },
  { id: 'rate', x: 250, y: 312, w: 190, h: 52, chip: true, title: 'Rate limiter', status: 'next', block: 'Block 4',
    about: 'Counts requests per user per time window in Redis and answers 429 Too Many Requests when there are too many. Cheap, so it runs first.' },
  { id: 'idem', x: 460, y: 312, w: 190, h: 52, chip: true, title: 'Idempotency keys', status: 'built', block: 'Block 3',
    about: 'Every money-moving request carries an Idempotency-Key. A repeat of a finished request gets the saved answer; a repeat of one still running gets 409. A double tap charges once.' },
  { id: 'mand', x: 670, y: 312, w: 170, h: 52, chip: true, title: 'Mandates + risk', status: 'planned', block: 'Blocks 9, 12',
    about: 'Checks agent requests against their mandate (caps, allowlist, expiry), sends big ones for approval, and holds suspicious bursts of payments. In the service, never in the prompt.' },
  { id: 'sm', x: 40, y: 380, w: 190, h: 52, chip: true, title: 'State machines', status: 'built', block: 'Block 3',
    about: 'A payment can only move along allowed paths (processing → succeeded, never failed → succeeded). A card can be paused, resumed or blocked, and blocked is final.' },
  { id: 'refunds', x: 250, y: 380, w: 190, h: 52, chip: true, title: 'Refunds', status: 'planned', block: 'Block 5',
    about: 'Full and partial refunds, each with its own idempotency key, never more than what is still refundable on the payment.' },
  { id: 'ledger', x: 460, y: 380, w: 190, h: 52, chip: true, title: 'Ledger', status: 'built', block: 'Block 2',
    about: 'Built. Double-entry bookkeeping in ledger.py: every movement of money is a balanced journal entry, locked and checked in one transaction. Mistakes are fixed with reversals, never edits.' },
  { id: 'cb', x: 670, y: 380, w: 170, h: 52, chip: true, title: 'Bank callbacks', status: 'next', block: 'Block 4',
    about: 'The endpoint the partner bank calls to say a payment succeeded or failed. Callbacks come late, twice, or out of order, so each one is recorded by ID and handled once.' },

  { id: 'bank', x: 900, y: 290, w: 180, h: 80, title: 'Partner bank', sub: 'a mock we build', status: 'next', block: 'Block 4',
    about: 'A wallet company holds customer money with a bank. Ours is a mock that pays merchants, confirms asynchronously (sometimes twice, or out of order), and produces a CSV statement each night.' },

  { id: 'pg', x: 20, y: 490, w: 520, h: 70, title: 'PostgreSQL', sub: 'ledger · payments · idempotency keys · outbox · mandates', status: 'built', block: 'Block 2 on',
    about: 'The source of truth. The ledger tables exist now; payments, keys, outbox, mandates and the rest join them block by block. Anything that must not be lost lives here.' },
  { id: 'redis', x: 580, y: 490, w: 180, h: 70, title: 'Redis', sub: 'rate-limit counters', status: 'planned', block: 'Block 4',
    about: 'Fast, in-memory counters for rate limiting. Nothing in Redis is precious: if it were wiped, limits would simply restart.' },

  { id: 'relay', x: 20, y: 610, w: 180, h: 64, title: 'Outbox relay', sub: 'background worker', status: 'next', block: 'Block 4',
    about: 'Reads events that were saved in the outbox table in the same transaction as the payment, and publishes them to Redpanda. It may publish one twice after a crash, never zero times.' },
  { id: 'kafka', x: 240, y: 610, w: 220, h: 64, title: 'Redpanda', sub: 'event log, Kafka API', status: 'next', block: 'Block 4',
    about: 'A durable log of events like payment.created. Consumers read it at their own pace; delivery is at least once.' },
  { id: 'cons', x: 500, y: 610, w: 230, h: 64, title: 'Consumers', sub: 'payouts · reward coins', status: 'next', block: 'Block 4',
    about: 'Background workers that react to events: ask the bank to pay the merchant, add reward coins. Each records the event IDs it has handled, so a repeat does nothing.' },
  { id: 'recon', x: 900, y: 610, w: 180, h: 64, title: 'Reconcile job', sub: 'nightly', status: 'planned', block: 'Block 5',
    about: 'Each night, compares the bank’s CSV statement with our ledger and reports anything missing, extra or different.' },
];

const edges: Edge[] = [
  { id: 'teen-api', d: 'M45,84 V270', label: 'pay', lx: 50, ly: 250, anchor: 'start' },
  { id: 'teen-loop', d: 'M150,84 V140' },
  { id: 'parent-api', d: 'M330,84 V270', label: 'mandates', lx: 336, ly: 250, anchor: 'start' },
  { id: 'claude-mcp', d: 'M535,84 V140', label: 'tools/call', lx: 541, ly: 128, anchor: 'start' },
  { id: 'support-lg', d: 'M745,84 V140' },
  { id: 'loop-api', d: 'M185,210 V270' },
  { id: 'mcp-api', d: 'M535,210 V270' },
  { id: 'lg-api', d: 'M745,210 V270' },
  { id: 'llm', d: 'M215,140 V112 M600,84 V112 M800,140 V112 M215,112 H960 V84', label: 'model calls', lx: 870, ly: 106, anchor: 'middle' },
  { id: 'llm-lf', d: 'M1040,84 V140', label: 'traces', lx: 1046, ly: 118, anchor: 'start' },
  { id: 'bank-cb', d: 'M900,345 C870,345 870,406 840,406', label: 'callbacks', lx: 885, ly: 392, anchor: 'start' },
  { id: 'api-pg', d: 'M280,450 V490' },
  { id: 'api-redis', d: 'M670,450 V490', label: 'INCR', lx: 676, ly: 476, anchor: 'start' },
  { id: 'pg-relay', d: 'M110,560 V610', label: 'outbox', lx: 116, ly: 592, anchor: 'start' },
  { id: 'relay-kafka', d: 'M200,642 H240' },
  { id: 'kafka-cons', d: 'M460,642 H500' },
  { id: 'cons-api', d: 'M560,610 V450', label: 'coins', lx: 554, ly: 600, anchor: 'end' },
  { id: 'cons-bank', d: 'M730,642 C870,642 940,520 960,370', label: 'payouts', lx: 1108, ly: 430, anchor: 'end' },
  { id: 'bank-recon', d: 'M1040,370 V610', label: 'CSV', lx: 1046, ly: 500, anchor: 'start' },
  { id: 'recon-pg', d: 'M900,628 Q880,585 840,585 H560 Q540,585 540,566' },
];

type Flow = { name: string; steps: { ids: string[]; say: string }[] };
const flows: Flow[] = [
  { name: 'Riya pays the canteen', steps: [
    { ids: ['teen', 'teen-api', 'api'], say: 'Riya’s app sends POST /payments with an Idempotency-Key.' },
    { ids: ['rate', 'api-redis', 'redis'], say: 'The rate limiter counts her requests in Redis. Too many → 429.' },
    { ids: ['idem'], say: 'Seen this key before? Then return the saved answer instead of paying again.' },
    { ids: ['mand'], say: 'The risk check looks for a suspicious burst of payments.' },
    { ids: ['ledger', 'api-pg', 'pg'], say: 'The ledger moves ₹40 and an outbox event is saved, in one transaction.' },
    { ids: ['sm'], say: 'The payment is processing. Riya gets her answer now.' },
    { ids: ['pg-relay', 'relay', 'relay-kafka', 'kafka'], say: 'The outbox relay publishes payment.created to Redpanda.' },
    { ids: ['kafka-cons', 'cons', 'cons-bank', 'bank', 'cons-api'], say: 'Consumers ask the bank to pay the canteen and add Riya’s reward coins.' },
    { ids: ['bank-cb', 'cb'], say: 'The bank’s callback (perhaps twice) moves the payment to succeeded, once.' },
  ] },
  { name: 'An AI agent pays', steps: [
    { ids: ['claude'], say: 'Riya asks Claude Desktop to pay the canteen ₹40.' },
    { ids: ['llm'], say: 'The model decides to call the create_payment tool.' },
    { ids: ['claude-mcp', 'mcp'], say: 'Claude Desktop calls the PocketPay MCP server.' },
    { ids: ['mcp-api', 'api', 'auth'], say: 'The MCP server calls the API with a scoped agent token.' },
    { ids: ['mand'], say: 'The mandate is checked in code: caps, allowlist, expiry. An injected “send ₹5,000” stops here.' },
    { ids: ['idem', 'ledger', 'api-pg', 'pg'], say: 'Then the ordinary payment path: idempotency, ledger, outbox.' },
    { ids: ['llm-lf', 'langfuse'], say: 'Every model and tool call is traced for the evals.' },
  ] },
  { name: 'A ₹800 refund', steps: [
    { ids: ['support', 'support-lg', 'lg'], say: 'Riya asks the support agent for a refund.' },
    { ids: ['llm'], say: 'The agent reads the refund policy (RAG) and the model says she is eligible.' },
    { ids: ['lg'], say: '₹800 is over ₹500, so the graph pauses with interrupt() until a person approves.' },
    { ids: ['lg-api', 'api', 'refunds', 'idem'], say: 'Approved: it calls the refunds API with an idempotency key.' },
    { ids: ['ledger', 'api-pg', 'pg', 'sm'], say: 'The ledger posts the refund; the payment becomes refunded.' },
  ] },
  { name: 'The nightly check', steps: [
    { ids: ['bank', 'bank-recon', 'recon'], say: 'The bank’s statement arrives as a CSV.' },
    { ids: ['recon-pg', 'pg'], say: 'The reconcile job reads what our ledger says happened at the bank.' },
    { ids: ['recon'], say: 'It matches them line by line and reports every mismatch.' },
  ] },
];

const statusStyle: Record<Status, { fill: string; stroke: string; dash?: string; label: string }> = {
  built: { fill: 'var(--sat-soft)', stroke: 'var(--keep)', label: 'Built' },
  next: { fill: 'var(--sat-soft)', stroke: 'var(--sun)', label: 'Next' },
  planned: { fill: 'var(--paper)', stroke: 'var(--sat)', dash: '6 4', label: 'Planned' },
  outside: { fill: 'var(--panel)', stroke: 'var(--rule)', label: 'Outside PocketPay' },
};

export default function SystemMap() {
  const [flow, setFlow] = useState<number | null>(0);
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);

  const f = flow === null ? null : flows[flow];
  const seen = new Set(f ? f.steps.slice(0, step + 1).flatMap((s) => s.ids) : []);
  const now = new Set(f ? f.steps[step].ids : []);
  const order = new Map<string, number>();
  f?.steps.slice(0, step + 1).forEach((s, k) => s.ids.forEach((id) => { if (!order.has(id) && nodes.some((n) => n.id === id)) order.set(id, k + 1); }));
  const dim = (id: string) => f !== null && !seen.has(id);
  const node = nodes.find((n) => n.id === picked);

  const choose = (k: number | null) => { setFlow(k); setStep(0); };

  return (
    <ArchFigure label="PocketPay system map">
      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Follow a request">
        {flows.map((fl, k) => (
          <button key={fl.name} onClick={() => choose(k)} aria-pressed={flow === k}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium ${flow === k ? 'border-sat bg-sat text-on-sat' : 'border-rule'}`}>{fl.name}</button>
        ))}
        <button onClick={() => choose(null)} aria-pressed={flow === null}
          className={`rounded-md border px-3 py-1.5 text-sm font-medium ${flow === null ? 'border-sat bg-sat text-on-sat' : 'border-rule'}`}>Show everything</button>
      </div>

      <div className="overflow-x-auto">
        <svg viewBox="0 0 1100 690" className="block h-auto w-full min-w-[760px]" role="img"
          aria-label="PocketPay system map: people and agents at the top, the PocketPay API in the middle, the database and background workers at the bottom.">
          <defs>
            <marker id="sm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
            </marker>
          </defs>

          {edges.map((e) => {
            const on = now.has(e.id);
            const was = seen.has(e.id);
            return (
              <g key={e.id} opacity={dim(e.id) ? 0.3 : 1}>
                <path d={e.d} fill="none" stroke={on ? 'var(--sun)' : was ? 'var(--sat)' : 'var(--muted)'} strokeWidth={on ? 3.2 : was ? 2.4 : 1.6}
                  markerEnd={e.noArrow ? undefined : 'url(#sm-arrow)'} className={on ? 'arch-flow' : undefined} />
                {e.label && <text x={e.lx} y={e.ly} textAnchor={e.anchor} fontSize={11.5} fontWeight={600} fill="var(--muted)">{e.label}</text>}
              </g>
            );
          })}

          {nodes.map((n) => {
            const st = statusStyle[n.status];
            const on = now.has(n.id);
            const isApi = n.id === 'api';
            return (
              <g key={n.id} opacity={dim(n.id) && !(isApi && f) ? 0.4 : 1} onClick={() => setPicked(n.id)} className="cursor-pointer"
                role="button" tabIndex={0} aria-label={`${n.title}: ${st.label}${n.block ? `, ${n.block}` : ''}. Show details.`}
                onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setPicked(n.id); } }}>
                <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={n.chip ? 7 : 10}
                  fill={isApi ? 'var(--panel)' : on ? 'var(--sun-soft)' : st.fill}
                  stroke={on ? 'var(--sun)' : picked === n.id ? 'var(--ink)' : st.stroke}
                  strokeWidth={on || picked === n.id ? 3 : isApi ? 2 : 1.8} strokeDasharray={on ? undefined : st.dash} />
                <text x={isApi ? n.x + 16 : n.x + n.w / 2} y={isApi ? n.y + 26 : n.sub ? n.y + n.h / 2 - 3 : n.y + n.h / 2 + 5}
                  textAnchor={isApi ? 'start' : 'middle'} fontSize={isApi ? 17 : n.chip ? 13.5 : 15} fontWeight={800} fill="var(--ink)">{n.title}</text>
                {n.sub && (
                  <text x={isApi ? n.x + 152 : n.x + n.w / 2} y={isApi ? n.y + 26 : n.y + n.h / 2 + 15} textAnchor={isApi ? 'start' : 'middle'}
                    fontSize={isApi ? 13 : 11.5} fill="var(--muted)">{n.sub}</text>
                )}
                {n.status === 'built' && <text x={n.x + n.w - 8} y={n.y + 15} textAnchor="end" fontSize={10.5} fontWeight={800} fill="var(--keep)">BUILT</text>}
                {order.has(n.id) && !isApi && (
                  <g>
                    <circle cx={n.x + 4} cy={n.y + 4} r={11} fill={on ? 'var(--sun)' : 'var(--sat)'} />
                    <text x={n.x + 4} y={n.y + 8} textAnchor="middle" fontSize={11.5} fontWeight={800} fill="var(--on-sat)">{order.get(n.id)}</text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
        {(['built', 'next', 'planned', 'outside'] as Status[]).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <svg width="22" height="12" aria-hidden><rect x="1" y="1" width="20" height="10" rx="3" fill={statusStyle[s].fill} stroke={statusStyle[s].stroke} strokeWidth="1.8" strokeDasharray={statusStyle[s].dash} /></svg>
            {statusStyle[s].label}
          </span>
        ))}
      </div>

      {f && (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} className="rounded-md border border-rule px-3 py-1 disabled:opacity-40">Back</button>
            <button onClick={() => setStep(Math.min(f.steps.length - 1, step + 1))} disabled={step === f.steps.length - 1} className="rounded-md bg-sat px-3 py-1 text-on-sat disabled:opacity-40">Next step</button>
            <span className="ml-auto text-sm text-muted">Step {step + 1} of {f.steps.length}</span>
          </div>
          <p className="mt-3 rounded-r-lg border-l-4 border-sun bg-sun-soft px-4 py-3 leading-relaxed" aria-live="polite">
            <span className="font-bold">{step + 1}. </span>{f.steps[step].say}
          </p>
        </div>
      )}

      <div className="mt-3 rounded-lg border border-rule bg-paper px-4 py-3" aria-live="polite">
        {node ? (
          <>
            <p className="font-bold">
              {node.title}
              <span className="ml-2 text-sm font-medium text-muted">{statusStyle[node.status].label}{node.block ? ` · ${node.block}` : ''}</span>
            </p>
            <p className="mt-1 leading-relaxed">{node.about}</p>
          </>
        ) : (
          <p className="text-muted">Click any box to see what it does and which block builds it.</p>
        )}
      </div>
    </ArchFigure>
  );
}
