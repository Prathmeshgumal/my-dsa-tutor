import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ProblemEntry } from '@dsa/core/problems'
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

test('two tabs: Description and Related', async () => {
  renderScreen()
  expect(await screen.findByRole('heading', { name: 'Two Sum' })).toBeInTheDocument()
  expect(screen.getAllByRole('tab').map((t) => t.textContent?.replace(/\d+$/, ''))).toEqual(
    expect.arrayContaining(['Description', 'Related']),
  )
  expect(screen.queryByRole('tab', { name: /^notes/i })).not.toBeInTheDocument()
})

test('Related shows the problem’s own notes, dry runs, chats and submissions', async () => {
  renderScreen()
  fireEvent.click(await screen.findByRole('tab', { name: /^related\s*3$/i }))
  const related = screen.getByRole('tabpanel', { name: /related/i })
  await within(related).findByText('Hash map trick')
  expect(within(related).getByRole('heading', { name: /^Notes\s*1$/ })).toBeInTheDocument()
  expect(within(related).queryByText('Unrelated')).not.toBeInTheDocument()
  expect(within(related).getByText('Dry run of two sum')).toBeInTheDocument()
  expect(within(related).queryByText('Other dry run')).not.toBeInTheDocument()
  expect(within(related).getByText('Hint for two sum')).toBeInTheDocument()
  expect(within(related).queryByText('General chat')).not.toBeInTheDocument()
  expect(within(related).getByRole('heading', { name: /^Submissions/ })).toBeInTheDocument()
})

test('a dry run or chat in Related opens in its own section', async () => {
  renderScreen()
  fireEvent.click(await screen.findByRole('tab', { name: /^related/i }))
  fireEvent.click(await screen.findByRole('button', { name: /^Dry run of two sum/ }))
  expect(useSettings.getState().section).toBe('dryruns')
  expect(usePlayground.getState().activeId).toBe('a')
  fireEvent.click(screen.getByRole('button', { name: /^Hint for two sum/ }))
  expect(useSettings.getState().section).toBe('chats')
  expect(useAiChat.getState().activeChatId).toBe('c1')
})

test('switches between versions of the code', async () => {
  renderScreen()
  const editor = await screen.findByTestId('monaco')
  expect(editor).toHaveValue('optimal code')
  fireEvent.click(screen.getByRole('tab', { name: 'brute.cpp' }))
  expect(await screen.findByDisplayValue('brute code')).toHaveAttribute('data-path', 'problem:two-sum/brute.cpp')
})

test('the problem list uses the shared list and can be hidden from the left bar', async () => {
  useSettings.setState({ section: 'problems' })
  useSettings.getState().setListOpen('problems', true)
  renderScreen()
  const list = await screen.findByRole('list', { name: 'Problems' })
  expect(within(list).getByRole('button', { name: /^Two Sum/ })).toHaveAttribute('aria-current', 'true')
  expect(within(list).getByRole('button', { name: /^Two Sum/ })).toHaveTextContent('Easy')
  act(() => useSettings.getState().pressSection('problems'))
  expect(screen.queryByRole('list', { name: 'Problems' })).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Two Sum' })).toBeInTheDocument()
  act(() => useSettings.getState().pressSection('problems'))
})

test('deleting a problem asks first', async () => {
  const remove = vi.fn(async () => {})
  renderScreen()
  await screen.findByTestId('monaco')
  useProblems.setState({ remove })
  // From the keyboard: in jsdom every box is 0×0, so the resize handles' pointer listener claims any press.
  act(() => screen.getByRole('button', { name: 'Actions for Two Sum' }).focus())
  await userEvent.keyboard('{Enter}')
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
  expect(remove).not.toHaveBeenCalled()
  await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }))
  expect(remove).toHaveBeenCalledWith('two-sum')
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


test('Reset asks first, then puts the open code back to how the problem started', async () => {
  const starter = 'class Solution {\npublic:\n    int f() {\n        \n    }\n};'
  configureProblems({
    fetchImpl: ((url: string) => json(url === '/api/problems' ? [{ ...entry, problem: { ...entry.problem, starter } }] : [])) as typeof fetch,
  })
  renderScreen()
  expect(await screen.findByTestId('monaco')).toHaveValue('optimal code')
  fireEvent.click(screen.getByRole('button', { name: 'Reset code' }))
  expect(screen.getByTestId('monaco')).toHaveValue('optimal code')
  fireEvent.click(screen.getByRole('button', { name: 'Confirm reset code' }))
  expect(await screen.findByTestId('monaco')).toHaveValue(starter)
})

test('Reset is off when the starting code can’t be worked out', async () => {
  renderScreen()
  await screen.findByTestId('monaco')
  expect(screen.getByRole('button', { name: 'Reset code' })).toBeDisabled()
})

const withProblem = (extra: Partial<ProblemEntry['problem']>) =>
  configureProblems({
    fetchImpl: ((url: string) => json(url === '/api/problems' ? [{ ...entry, problem: { ...entry.problem, ...extra } }] : [])) as typeof fetch,
  })

test('a LeetCode problem has a button that opens the question', async () => {
  withProblem({ link: 'https://leetcode.com/problems/two-sum/' })
  renderScreen()
  const link = await screen.findByRole('link', { name: /LeetCode/ })
  expect(link).toHaveAttribute('href', 'https://leetcode.com/problems/two-sum/')
  expect(link).toHaveAttribute('target', '_blank')
})

test('a link that isn’t a web address is never shown as one', async () => {
  withProblem({ link: 'javascript:alert(1)' })
  renderScreen()
  await screen.findByRole('heading', { name: 'Two Sum' })
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
})

test('Add link suggests the LeetCode address and saves what you confirm', async () => {
  const sent: { url: string; body: unknown }[] = []
  configureProblems({
    fetchImpl: ((url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') sent.push({ url, body: JSON.parse(init.body as string) })
      return url === '/api/problems' ? json([entry]) : Promise.resolve(new Response(null, { status: 204 }))
    }) as typeof fetch,
  })
  renderScreen()
  fireEvent.click(await screen.findByRole('button', { name: 'Add link' }))
  const box = screen.getByRole('textbox', { name: 'Link to the question' })
  expect(box).toHaveValue('https://leetcode.com/problems/two-sum/')
  fireEvent.click(screen.getByRole('button', { name: 'Save link' }))
  expect(await screen.findByRole('link', { name: /LeetCode/ })).toHaveAttribute('href', 'https://leetcode.com/problems/two-sum/')
  expect(sent).toEqual([{ url: '/api/problems/two-sum/link', body: { link: 'https://leetcode.com/problems/two-sum/' } }])
})

test('a note linked to the problem opens in the Notes section', async () => {
  useSettings.setState({ section: 'problems' })
  renderScreen()
  fireEvent.click(await screen.findByRole('tab', { name: /^related/i }))
  fireEvent.click(await screen.findByRole('button', { name: /^Hash map trick/ }))
  await vi.waitFor(() => expect(useNotes.getState().activeName).toBe('note-1.md'))
  expect(useSettings.getState().section).toBe('notes')
})
