import { fireEvent, render, screen } from '@testing-library/react'
import type { ProblemEntry } from '@/lib/problems'
import { useAiChat } from '@/state/aiChat'
import { configureNotes, useNotes } from '@/state/notes'
import { configurePlayground, usePlayground } from '@/state/playground'
import { configureProblems, useProblems } from '@/state/problems'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useSettings } from '@/state/settings'
import { ProblemScreen } from './ProblemScreen'

const renderScreen = () =>
  render(
    <TooltipProvider>
      <ProblemScreen />
    </TooltipProvider>,
  )

vi.mock('@monaco-editor/react', () => import('@/test/monacoStub'))

const entry: ProblemEntry = {
  slug: 'two-sum',
  problem: {
    title: 'Two Sum',
    difficulty: 'easy',
    description: 'Find **two** numbers.',
    params: [{ name: 'nums', type: 'vector<int>' }],
    compare: 'exact',
    tests: [{ input: ['[1,2]'], expected: '3', example: true, addedBy: 'problem' }],
    createdAt: 1,
    notes: ['note-1.md'],
  },
  solution: 'optimal code',
  versions: [{ name: 'brute.cpp', content: 'brute code' }],
  driver: '',
  solved: false,
  attempts: 0,
}

const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body)))

beforeEach(() => {
  configureProblems({ fetchImpl: ((url: string) => json(url === '/api/problems' ? [entry] : [])) as typeof fetch })
  configureNotes({
    fetchImpl: (() =>
      json([
        { name: 'note-1.md', content: '# Hash map trick' },
        { name: 'note-2.md', content: '# Unrelated' },
      ])) as typeof fetch,
  })
  configurePlayground({
    fetchImpl: (() =>
      json([
        {
          name: 'a.json',
          content: JSON.stringify({
            id: 'a',
            title: 'Dry run of two sum',
            problem: 'two-sum',
            createdAt: 1,
            steps: [{ note: 'x' }],
          }),
        },
        {
          name: 'b.json',
          content: JSON.stringify({ id: 'b', title: 'Other dry run', createdAt: 1, steps: [{ note: 'x' }] }),
        },
      ])) as typeof fetch,
  })
  useProblems.setState({ entries: [], activeSlug: 'two-sum', activeFile: 'solution.cpp', status: 'idle' })
  useNotes.setState({ notes: [], status: 'idle' })
  usePlayground.setState({ runs: [], status: 'idle' })
  useAiChat.setState({
    chats: [
      { id: 'c1', title: 'Hint for two sum', sessionId: null, messages: [], updatedAt: 1, problemSlug: 'two-sum' },
      { id: 'c2', title: 'General chat', sessionId: null, messages: [], updatedAt: 1, problemSlug: null },
    ],
  })
})

test('shows the problem with its own notes, dry runs and chats', async () => {
  renderScreen()
  expect(await screen.findByRole('heading', { name: 'Two Sum' })).toBeInTheDocument()

  fireEvent.click(await screen.findByRole('tab', { name: /^notes\s*1$/i }))
  expect(screen.getByText('Hash map trick')).toBeInTheDocument()
  expect(screen.queryByText('Unrelated')).not.toBeInTheDocument()

  fireEvent.click(await screen.findByRole('tab', { name: /^dry runs\s*1$/i }))
  expect(screen.getByText('Dry run of two sum')).toBeInTheDocument()
  expect(screen.queryByText('Other dry run')).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('tab', { name: /^chats\s*1$/i }))
  expect(screen.getByText('Hint for two sum')).toBeInTheDocument()
  expect(screen.queryByText('General chat')).not.toBeInTheDocument()
})

test('switches between versions of the code', async () => {
  renderScreen()
  const editor = await screen.findByTestId('monaco')
  expect(editor).toHaveValue('optimal code')
  fireEvent.click(screen.getByRole('tab', { name: 'brute.cpp' }))
  expect(await screen.findByDisplayValue('brute code')).toHaveAttribute('data-path', 'problem:two-sum/brute.cpp')
})

test('the problem list can be hidden, and the problem stays open', async () => {
  useSettings.setState({ problemListOpen: true })
  renderScreen()
  expect(await screen.findByRole('list', { name: 'Problems' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Hide problems' }))
  expect(useSettings.getState().problemListOpen).toBe(false)
  expect(screen.queryByRole('list', { name: 'Problems' })).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Two Sum' })).toBeInTheDocument()
  useSettings.setState({ problemListOpen: true })
})

test('problems saved by a newer editor are named, with what to do', async () => {
  configureProblems({
    fetchImpl: ((url: string) => json(url === '/api/problems' ? [entry] : url === '/api/problems/_newer' ? ['graph-colouring'] : [])) as typeof fetch,
  })
  renderScreen()
  expect(await screen.findByText(/graph-colouring/)).toHaveTextContent(
    'Not shown: graph-colouring. A newer version of the editor saved it; update the editor to open it.',
  )
})

