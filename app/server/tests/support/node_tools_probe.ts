// Answers MCP messages with the Node server's real editor-tool definitions, for checking the Python port:
//   node tests/support/node_tools_probe.ts < messages.jsonl   (one JSON-RPC message per line in, one answer per line out)
// Each tool answers with the arguments it received after checking, so what the checks keep or drop shows too.
import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk'
import { createInterface } from 'node:readline'
import { TOOL_NAMES, toSdkTools, type EditorTools } from '../../../packages/server/src/editorTools.ts'

const echo = Object.fromEntries(TOOL_NAMES.map((n) => [n, async (args: unknown) => ({ text: JSON.stringify(args) })])) as unknown as EditorTools
const server = createSdkMcpServer({ name: 'editor', tools: toSdkTools(echo) })
let answer: (m: unknown) => void = () => {}
await server.instance.connect({
  async start() {},
  async close() {},
  async send(m: unknown) {
    answer(m)
  },
} as never)
const transport = (server.instance as unknown as { server: { transport: { onmessage(m: unknown): void } } }).server.transport
for await (const line of createInterface({ input: process.stdin })) {
  if (!line.trim()) continue
  const reply = new Promise((resolve) => (answer = resolve))
  transport.onmessage(JSON.parse(line))
  process.stdout.write(JSON.stringify(await reply) + '\n')
}
