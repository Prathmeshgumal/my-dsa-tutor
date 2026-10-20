import { dryRunProblems } from './dryRun'

const code = 'int a = 1;\nint b = 2;\n'

test('a sensible dry run has no problems', () => {
  expect(
    dryRunProblems({
      code,
      steps: [{ line: 1, note: 'a = 1', structures: [{ kind: 'array', name: 'arr', values: [1, 2], pointers: { i: 0, j: 1 } }] }],
    }),
  ).toEqual([])
})

test('catches the mistakes that would draw wrongly', () => {
  const problems = dryRunProblems({
    code,
    steps: [
      { line: 9, note: 'x' },
      { note: 'y', structures: [{ kind: 'array', name: 'arr', values: [1], pointers: { i: 5 } }] },
      { note: 'z', structures: [{ kind: 'grid', name: 'dp', rows: [[0]], current: [2, 0] }] },
      { note: 'w', structures: [{ kind: 'graph', name: 'g', nodes: ['A'], edges: [['A', 'B']] }] },
    ],
  })
  expect(problems).toHaveLength(4)
  expect(problems[0]).toMatch(/Step 1: line 9/)
  expect(problems[1]).toMatch(/pointer i=5/)
  expect(problems[2]).toMatch(/\[2, 0\]/)
  expect(problems[3]).toMatch(/A→B/)
})

test('needs at least one step', () => {
  expect(dryRunProblems({ steps: [] })).toEqual(['It needs at least one step.'])
})
