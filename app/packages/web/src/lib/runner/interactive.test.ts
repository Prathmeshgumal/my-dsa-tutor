import { LANGUAGES } from '@dsa/core/languages'
import { INTERACTIVE_TIMEOUT_MS, prepareSource, startSession, type SessionEvent, type SocketLike } from './interactive'

class FakeSocket implements SocketLike {
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: ((e: { code: number; reason: string }) => void) | null = null
  onerror: (() => void) | null = null
  sent: Record<string, unknown>[] = []
  closed = false
  send(data: string) {
    this.sent.push(JSON.parse(data))
  }
  close() {
    this.closed = true
  }
  /** A message from Piston */
  piston(m: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(m) })
  }
}

function start(source = 'int main(){}') {
  const socket = new FakeSocket()
  const events: SessionEvent[] = []
  const session = startSession({
    language: LANGUAGES.cpp,
    source,
    fileName: 'two_sum.cpp',
    onEvent: (e) => events.push(e),
    connect: () => socket,
  })
  socket.onopen?.()
  return { socket, events, session, done: () => events.find((e) => e.type === 'done') as Extract<SessionEvent, { type: 'done' }> }
}

test('starts the program with a long time limit, since waiting for you counts', () => {
  const { socket } = start()
  expect(socket.sent[0]).toMatchObject({ type: 'init', language: 'c++', run_timeout: INTERACTIVE_TIMEOUT_MS })
})

test('output streams in, typed input goes to the program, and the run ends with a result', () => {
  const { socket, events, session, done } = start()
  socket.piston({ type: 'stage', stage: 'compile' })
  socket.piston({ type: 'exit', stage: 'compile', code: 0 })
  socket.piston({ type: 'stage', stage: 'run' })
  socket.piston({ type: 'data', stream: 'stdout', data: 'first: ' })
  session.write('4\n')
  expect(socket.sent.at(-1)).toEqual({ type: 'data', stream: 'stdin', data: '4\n' })
  socket.piston({ type: 'data', stream: 'stdout', data: 'sum 9\n' })
  socket.piston({ type: 'exit', stage: 'run', code: 0, signal: null })
  expect(events.filter((e) => e.type === 'output')).toEqual([
    { type: 'output', stream: 'stdout', data: 'first: ' },
    { type: 'output', stream: 'stdout', data: 'sum 9\n' },
  ])
  expect(done().result).toMatchObject({ status: 'success', stdout: 'first: sum 9\n', timeMs: null })
  expect(socket.closed).toBe(true)
})

test('compile errors are reported without the chmod noise', () => {
  const { socket, done } = start()
  socket.piston({ type: 'stage', stage: 'compile' })
  socket.piston({ type: 'data', stream: 'stderr', data: "two_sum.cpp:1:20: error: 'x' was not declared\n" })
  socket.piston({ type: 'data', stream: 'stderr', data: "chmod: cannot access 'a.out': No such file or directory\n" })
  socket.piston({ type: 'exit', stage: 'compile', code: 1 })
  expect(done().result).toMatchObject({ status: 'compile_error', compileOutput: "two_sum.cpp:1:20: error: 'x' was not declared\n" })
})

test.each([
  [{ code: 3, signal: null }, 'runtime_error', 'Runtime error (exit 3)'],
  [{ code: 139, signal: null }, 'runtime_error', 'Runtime error (segmentation fault)'],
  [{ code: null, signal: 'SIGKILL' }, 'time_limit', 'Stopped after 2 minutes'],
])('a run that ends with %j is %s', (exit, status, statusText) => {
  const { socket, done } = start()
  socket.piston({ type: 'stage', stage: 'run' })
  socket.piston({ type: 'exit', stage: 'run', ...exit })
  expect(done().result).toMatchObject({ status, statusText })
})

test('Stop ends the run at once and says it was you, even though Piston ignores the kill signal', () => {
  const { socket, session, done } = start()
  socket.piston({ type: 'stage', stage: 'run' })
  socket.piston({ type: 'data', stream: 'stdout', data: 'rows: ' })
  session.stop()
  expect(socket.sent.at(-1)).toEqual({ type: 'signal', signal: 'SIGKILL' })
  expect(done().result).toMatchObject({ statusText: 'Stopped', stdout: 'rows: ' })
  expect(socket.closed).toBe(true)
})

test('no Piston: a clear message', () => {
  const socket = new FakeSocket()
  const events: SessionEvent[] = []
  startSession({ language: LANGUAGES.cpp, source: '', fileName: 'a.cpp', onEvent: (e) => events.push(e), connect: () => socket })
  socket.onclose?.({ code: 1006, reason: '' })
  expect(events).toEqual([{ type: 'done', result: expect.objectContaining({ status: 'internal_error', statusText: expect.stringMatching(/Couldn’t reach Piston/) }) }])
})

test('C++ prompts printed with printf show before the program waits; line numbers stay the student’s', () => {
  const src = prepareSource(LANGUAGES.cpp, 'int main(){}', 'two_sum.cpp')
  expect(src).toContain('setvbuf(stdout, nullptr, _IONBF, 0)')
  expect(src).toMatch(/#line 1 "two_sum.cpp"\nint main\(\)\{\}$/)
  expect(prepareSource(LANGUAGES.python, 'print(1)', 'a.py')).toBe('print(1)')
})
