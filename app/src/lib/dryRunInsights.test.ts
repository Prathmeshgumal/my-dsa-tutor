import type { DryRun, DryRunStep } from './dryRun'
import { cellsChangedSince, finalCheck, lineHits, phases, stepChanges, traceColumns } from './dryRunInsights'

const run = (steps: DryRunStep[], extra: Partial<DryRun> = {}): DryRun => ({ id: 'r', title: 't', createdAt: 0, steps, ...extra })

describe('stepChanges: what this step changed', () => {
  test('variables that changed, appeared or went away', () => {
    expect(stepChanges({ note: '', vars: { i: 0, sum: 2, tmp: 9 } }, { note: '', vars: { i: 1, sum: 2, j: 3 } })).toEqual([
      { ref: 'i', from: '0', to: '1' },
      { ref: 'tmp', from: '9', to: null },
      { ref: 'j', from: null, to: '3' },
    ])
  })

  test('cells of arrays, grids and maps, named like the arrows name them', () => {
    const prev: DryRunStep = {
      note: '',
      structures: [
        { kind: 'array', name: 'arr', values: [3, 1, 2] },
        { kind: 'grid', name: 'm', rows: [[1, 2], [3, 4]] },
        { kind: 'map', name: 'seen', entries: [[7, 0]] },
      ],
    }
    const now: DryRunStep = {
      note: '',
      structures: [
        { kind: 'array', name: 'arr', values: [1, 3, 2, 5] },
        { kind: 'grid', name: 'm', rows: [[1, 2], [4, 4]] },
        { kind: 'map', name: 'seen', entries: [[7, 1], [2, 1]] },
      ],
    }
    expect(stepChanges(prev, now)).toEqual([
      { ref: 'arr[0]', from: '3', to: '1' },
      { ref: 'arr[1]', from: '1', to: '3' },
      { ref: 'arr[3]', from: null, to: '5' },
      { ref: 'm[1][0]', from: '3', to: '4' },
      { ref: 'seen[7]', from: '0', to: '1' },
      { ref: 'seen[2]', from: null, to: '1' },
    ])
  })

  test('the first step changes nothing (it is the start)', () => {
    expect(stepChanges(undefined, { note: '', vars: { i: 0 } })).toEqual([])
  })
})

test('cellsChangedSince: boxes whose value differs from the start', () => {
  expect([...cellsChangedSince({ kind: 'array', name: 'a', values: [1, 2, 3] }, { kind: 'array', name: 'a', values: [1, 9, 3, 4] })]).toEqual([
    'a[1]',
    'a[3]',
  ])
  expect([...cellsChangedSince(undefined, { kind: 'array', name: 'a', values: [1] })]).toEqual([])
  expect([...cellsChangedSince({ kind: 'grid', name: 'g', rows: [[1, 2]] }, { kind: 'grid', name: 'g', rows: [[2, 2]] })]).toEqual(['g[0][0]'])
})

test('lineHits: how many times each line has run, up to this step', () => {
  const r = run([{ note: '', line: 2 }, { note: '', line: 3 }, { note: '', line: 2 }, { note: '' }, { note: '', line: 3 }])
  expect(lineHits(r, 2)).toEqual(new Map([[2, 2], [3, 1]]))
  expect(lineHits(r, 4)).toEqual(new Map([[2, 2], [3, 2]]))
})

describe('finalCheck: does the output match the expected answer', () => {
  test('matches, ignoring extra spaces and line endings', () => {
    expect(finalCheck(run([{ note: '', output: '1 2 3 \n' }], { expected: '1 2 3' }))).toEqual({ expected: '1 2 3', actual: '1 2 3 \n', match: true })
  })
  test('differs', () => {
    expect(finalCheck(run([{ note: '', output: '1 3' }], { expected: '1 2' }))).toMatchObject({ match: false })
  })
  test('nothing to check without an expected answer or any output', () => {
    expect(finalCheck(run([{ note: '', output: 'x' }]))).toBeNull()
    expect(finalCheck(run([{ note: '' }], { expected: '1' }))).toBeNull()
  })
  test('the output is the last step that has one', () => {
    expect(finalCheck(run([{ note: '', output: '5' }, { note: '' }], { expected: '5' }))).toMatchObject({ match: true })
  })
})

test('phases: runs of steps sharing a phase name', () => {
  const r = run([{ note: '', phase: 'Transpose' }, { note: '', phase: 'Transpose' }, { note: '' }, { note: '', phase: 'Reverse' }])
  expect(phases(r)).toEqual([
    { name: 'Transpose', from: 0, to: 2 },
    { name: 'Reverse', from: 3, to: 3 },
  ])
})

test('traceColumns: every variable, in the order it first appears', () => {
  const r = run([{ note: '', vars: { i: 0 } }, { note: '', vars: { i: 1, sum: 2 } }, { note: '', vars: { j: 0, i: 2 } }])
  expect(traceColumns(r)).toEqual(['i', 'sum', 'j'])
})
