import { act, render as rtlRender, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { DryRun, Structure } from '@/lib/dryRun'
import { usePlayground } from '@/state/playground'
import { Playground } from './Playground'
import { StructureView } from './StructureView'

const render = (ui: React.ReactElement) => rtlRender(<TooltipProvider>{ui}</TooltipProvider>)
const load = vi.fn(async () => {})
const remove = vi.fn(async () => {})

const run: DryRun = {
  id: 'r1',
  title: 'Dry run: twoSum on [2,7,11,15]',
  file: 'two_sum.cpp',
  language: 'cpp',
  code: 'int i = 0;\nint j = 3;\nwhile (i < j) {\n  i++;\n}',
  input: '[2,7,11,15], 9',
  createdAt: 1,
  steps: [
    { line: 1, note: 'Start i at the left end.', vars: { i: 0 }, structures: [{ kind: 'array', name: 'nums', values: [2, 7, 11, 15], pointers: { i: 0, j: 3 } }] },
    { line: 4, note: 'Sum too big, move j left.', vars: { i: 0, j: 2 }, output: '0 1', mistake: true, structures: [] },
  ],
}

beforeEach(() => {
  load.mockClear()
  remove.mockClear()
  usePlayground.setState({ runs: [run], activeId: 'r1', step: 0, playing: false, speed: 1, status: 'ready', load, remove })
})

test('is a labelled screen that loads saved dry runs', () => {
  render(<Playground />)
  expect(screen.getByRole('main', { name: 'Playground' })).toBeInTheDocument()
  expect(load).toHaveBeenCalled()
})

test('shows the title, input, the step note, variables, and the code with the current line', () => {
  render(<Playground />)
  expect(screen.getByRole('heading', { name: 'Dry run: twoSum on [2,7,11,15]' })).toBeInTheDocument()
  expect(screen.getByText('[2,7,11,15], 9')).toBeInTheDocument()
  expect(screen.getByTestId('step-note')).toHaveTextContent('Start i at the left end.')
  expect(screen.getByRole('list', { name: 'Variables' })).toHaveTextContent('i0')
  const current = screen.getByRole('list', { name: 'Code' }).querySelector('[aria-current="step"]')
  expect(current).toHaveTextContent('int i = 0;')
})

test('next / previous step, the step counter and the slider', async () => {
  render(<Playground />)
  expect(screen.getByText('Step 1 of 2')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Next step' }))
  expect(screen.getByText('Step 2 of 2')).toBeInTheDocument()
  expect(screen.getByTestId('step-note')).toHaveTextContent('Sum too big')
  expect(screen.getByRole('list', { name: 'Code' }).querySelector('[aria-current="step"]')).toHaveTextContent('i++;')
  await userEvent.click(screen.getByRole('button', { name: 'Previous step' }))
  expect(screen.getByText('Step 1 of 2')).toBeInTheDocument()
  expect(screen.getByRole('slider', { name: 'Step' })).toBeInTheDocument()
})

test('arrow keys and space control playback', async () => {
  render(<Playground />)
  await userEvent.keyboard('{ArrowRight}')
  expect(usePlayground.getState().step).toBe(1)
  await userEvent.keyboard('{ArrowLeft}')
  expect(usePlayground.getState().step).toBe(0)
  await userEvent.keyboard(' ')
  expect(usePlayground.getState().playing).toBe(true)
  act(() => usePlayground.getState().togglePlay())
})

test('the step where the bug shows up is flagged, and printed output is shown', async () => {
  render(<Playground />)
  await userEvent.click(screen.getByRole('button', { name: 'Next step' }))
  expect(screen.getByTestId('step-note')).toHaveTextContent(/here’s the bug/i)
  expect(screen.getByTestId('step-output')).toHaveTextContent('0 1')
})

test('the list of dry runs can delete one after a second click', async () => {
  render(<Playground />)
  const list = screen.getByRole('list', { name: 'Dry runs' })
  await userEvent.click(within(list).getByRole('button', { name: 'Delete dry run: Dry run: twoSum on [2,7,11,15]' }))
  expect(remove).not.toHaveBeenCalled()
  await userEvent.click(within(list).getByRole('button', { name: 'Confirm delete dry run: Dry run: twoSum on [2,7,11,15]' }))
  expect(remove).toHaveBeenCalledWith('r1')
})

test('with nothing yet, explains how to get one and offers the example', async () => {
  usePlayground.setState({ runs: [], activeId: null })
  render(<Playground />)
  expect(screen.getByText(/ask claude/i)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Watch an example' }))
  expect(usePlayground.getState().activeId).toBe('example-bubble-sort')
})

describe('structures', () => {
  const show = (s: Structure) => rtlRender(<StructureView structure={s} />)

  test('array: cells with indices and pointer labels', () => {
    show({ kind: 'array', name: 'nums', values: [2, 7, 11], pointers: { i: 0, j: 2 }, highlight: [0], done: [2] })
    const fig = screen.getByRole('figure', { name: 'nums' })
    expect(within(fig).getAllByTestId('cell').map((c) => c.textContent)).toEqual(['2', '7', '11'])
    expect(within(fig).getByText('i')).toBeInTheDocument()
    expect(within(fig).getByText('j')).toBeInTheDocument()
    expect(within(fig).getAllByTestId('cell')[0]).toHaveAttribute('data-state', 'highlight')
    expect(within(fig).getAllByTestId('cell')[2]).toHaveAttribute('data-state', 'done')
  })

  test('grid: rows and the current cell', () => {
    show({ kind: 'grid', name: 'dp', rows: [[0, 1], [1, 2]], current: [1, 1], colLabels: ['a', 'b'] })
    const fig = screen.getByRole('figure', { name: 'dp' })
    expect(within(fig).getAllByRole('row')).toHaveLength(3)
    expect(within(fig).getByText('2').closest('td')).toHaveAttribute('data-state', 'current')
  })

  test('map: key → value entries', () => {
    show({ kind: 'map', name: 'seen', entries: [[2, 0], [7, 1]], highlight: [7] })
    const fig = screen.getByRole('figure', { name: 'seen' })
    expect(within(fig).getAllByRole('row')).toHaveLength(3)
    expect(within(fig).getByText('7').closest('tr')).toHaveAttribute('data-state', 'highlight')
  })

  test('stack shows the top; queue shows front and back', () => {
    show({ kind: 'stack', name: 'st', values: [1, 2, 3] })
    expect(screen.getByRole('figure', { name: 'st' })).toHaveTextContent('top')
    show({ kind: 'queue', name: 'q', values: [1, 2] })
    expect(screen.getByRole('figure', { name: 'q' })).toHaveTextContent(/front.*back/)
  })

  test('linked list: nodes, pointers and null', () => {
    show({ kind: 'linked_list', name: 'head', nodes: [1, 2, 3], pointers: { slow: 0, fast: 2, prev: null } })
    const fig = screen.getByRole('figure', { name: 'head' })
    expect(within(fig).getAllByTestId('node').map((n) => n.textContent)).toEqual(['1', '2', '3'])
    expect(fig).toHaveTextContent('slow')
    expect(fig).toHaveTextContent('prev → null')
  })

  test('tree: draws the nodes from level order, skipping nulls', () => {
    show({ kind: 'tree', name: 'root', nodes: [3, 9, 20, null, null, 15, 7], highlight: [2] })
    const fig = screen.getByRole('figure', { name: 'root' })
    expect(within(fig).getAllByTestId('node').map((n) => n.textContent)).toEqual(['3', '9', '20', '15', '7'])
  })

  test('graph: nodes and edges', () => {
    show({ kind: 'graph', name: 'g', nodes: ['A', 'B', 'C'], edges: [['A', 'B'], ['B', 'C', 4]], visited: ['A'], current: 'B' })
    const fig = screen.getByRole('figure', { name: 'g' })
    expect(within(fig).getAllByTestId('node')).toHaveLength(3)
    expect(within(fig).getAllByTestId('edge')).toHaveLength(2)
    expect(within(fig).getByText('4')).toBeInTheDocument()
  })
})
