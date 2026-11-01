// What the spending agent can reach, and the setting that closes off each thing it can't.
const allowed = [
  { name: 'get_balance', what: 'Riya’s balance now' },
  { name: 'spending_summary', what: 'totals by category, added up in SQL' },
  { name: 'list_payments', what: 'each payment: shop, time, amount' },
];

const blocked = [
  { what: 'Claude Code’s own tools: read and edit files, run shell commands, fetch web pages', by: 'tools=[]' },
  { what: 'Any tool call not on the list above, instead of asking you', by: 'permission_mode="dontAsk"' },
  { what: 'Other MCP servers set up in your Claude Code', by: 'strict_mcp_config=True' },
  { what: 'Your ~/.claude settings and any CLAUDE.md files', by: 'setting_sources=[]' },
  { what: 'Skills', by: 'skills=[]' },
  { what: 'A file path typed into the question (“@/etc/passwd”) being read in', by: 'verbatim_prompts=True' },
  { what: 'Running forever', by: 'max_turns=6' },
  { what: 'Anyone else’s wallet', by: 'no tool takes a user ID' },
];

export default function AgentFence() {
  return (
    <figure className="not-prose my-6 rounded-lg border border-rule bg-panel p-4 text-ink sm:p-5">
      <div className="grid gap-4 md:grid-cols-[1fr_1.5fr]">
        <div className="rounded-lg border-2 p-3" style={{ borderColor: 'var(--keep)' }}>
          <div className="mb-2 font-bold" style={{ color: 'var(--keep)' }}>Inside: all it can do</div>
          <ul className="space-y-2">
            {allowed.map((t) => (
              <li key={t.name}>
                <code className="text-sm font-semibold">mcp__wallet__{t.name}</code>
                <div className="text-sm text-muted">{t.what}</div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted">All three only read, and only Riya’s rows.</p>
        </div>
        <div className="rounded-lg border-2 border-dashed p-3" style={{ borderColor: 'var(--cut)' }}>
          <div className="mb-2 font-bold" style={{ color: 'var(--cut)' }}>Outside: shut off</div>
          <ul className="divide-y divide-rule">
            {blocked.map((b) => (
              <li key={b.by} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-1.5">
                <span className="text-sm">{b.what}</span>
                <code className="text-xs text-muted">{b.by}</code>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <figcaption className="mt-3 text-sm text-muted">Claude Code is built to edit code and run commands. For a wallet assistant almost all of that has to go, and each piece is switched off by one option in agent_options().</figcaption>
    </figure>
  );
}
