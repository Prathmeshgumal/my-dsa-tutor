// The agent loop: Claude either asks for a tool (go round again) or answers (stop). Who does what is colour-coded:
// Claude decides, Claude Code runs the loop, our code runs the tools.
export default function AgentLoop() {
  const box = (x: number, y: number, w: number, h: number, title: string, sub: string, fill = 'var(--paper)', stroke = 'var(--ink)', ink = 'var(--ink)') => (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={12} fill={fill} stroke={stroke} strokeWidth={1.8} />
      <text x={x + w / 2} y={y + h / 2 - 4} textAnchor="middle" fontSize={15} fontWeight={800} fill={ink}>{title}</text>
      <text x={x + w / 2} y={y + h / 2 + 15} textAnchor="middle" fontSize={12} fill={ink === 'var(--ink)' ? 'var(--muted)' : ink}>{sub}</text>
    </g>
  );
  return (
    <figure className="not-prose my-6 rounded-lg border border-rule bg-panel p-4 text-ink sm:p-5">
      <div className="overflow-x-auto">
        <svg viewBox="0 0 780 380" className="mx-auto block h-auto w-full min-w-[600px]" role="img"
          aria-label="The agent loop. Riya's question goes to Claude. Claude either asks for a tool, which our code runs against Postgres and whose result goes back to Claude, or it replies with text and no tool calls, which is the answer and ends the loop. Claude Code runs the loop; our code runs the tools.">
          <defs>
            <marker id="al-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
            </marker>
          </defs>

          <rect x={180} y={20} width={340} height={236} rx={18} fill="none" stroke="var(--sun)" strokeWidth={2} strokeDasharray="7 5" />
          <text x={350} y={44} textAnchor="middle" fontSize={13} fontWeight={800} fill="var(--sun)">Claude Code runs this loop (the SDK)</text>

          {box(10, 82, 140, 64, 'Riya asks', '“food this week?”')}
          {box(290, 62, 200, 64, 'Claude decides', 'tool call, or answer?', 'var(--sat)', 'var(--sat)', 'var(--on-sat)')}
          {box(290, 176, 200, 64, 'Run the tool', 'MCP tools/call')}
          {box(652, 62, 122, 64, 'The answer', '“₹225.00 on food”', 'var(--paper)', 'var(--keep)')}
          {box(250, 296, 280, 64, 'Our code: tools.py', 'checks arguments, then SQL', 'var(--paper)', 'var(--keep)')}

          <path d="M150,104 H286" stroke="var(--ink)" strokeWidth={2} fill="none" markerEnd="url(#al-arrow)" />
          {/* down: tool call */}
          <path d="M340,126 V172" stroke="var(--sat)" strokeWidth={2.2} fill="none" markerEnd="url(#al-arrow)" />
          <text x={334} y={154} textAnchor="end" fontSize={12} fill="var(--sat)" fontWeight={700}>tool_use</text>
          {/* up: result */}
          <path d="M440,176 V130" stroke="var(--keep)" strokeWidth={2.2} fill="none" markerEnd="url(#al-arrow)" />
          <text x={446} y={154} fontSize={12} fill="var(--keep)" fontWeight={700}>tool_result</text>
          {/* to our code and back */}
          <path d="M370,240 V292" stroke="var(--ink)" strokeWidth={1.8} fill="none" markerEnd="url(#al-arrow)" />
          <path d="M410,292 V244" stroke="var(--ink)" strokeWidth={1.8} fill="none" markerEnd="url(#al-arrow)" />
          <text x={418} y={272} fontSize={12} fill="var(--muted)">into our process</text>
          {/* answer */}
          <path d="M490,94 H648" stroke="var(--keep)" strokeWidth={2.2} fill="none" markerEnd="url(#al-arrow)" />
          <text x={586} y={86} textAnchor="middle" fontSize={12} fill="var(--keep)" fontWeight={700}>text, no tool calls</text>
          <text x={586} y={116} textAnchor="middle" fontSize={11} fill="var(--muted)">this ends the loop</text>
          <text x={198} y={244} fontSize={11} fill="var(--muted)">at most 6 turns</text>
        </svg>
      </div>
      <figcaption className="mt-2 text-sm text-muted">One trip round the circle is one turn. Claude never touches the database: it can only ask, and our code decides what asking is allowed to do.</figcaption>
    </figure>
  );
}
