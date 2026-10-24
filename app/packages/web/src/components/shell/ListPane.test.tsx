import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Trash2 } from 'lucide-react'
import { useSettings } from '@/state/settings'
import { LIST_PANE, ListPane, ListRow } from './ListPane'

const opened: string[] = []
const deleted: string[] = []

function Fruits({ names }: { names: string[] }) {
  return (
    <ListPane title="Fruits" count={names.length} onNew={() => opened.push('new')} newLabel="New fruit" search empty="No fruit yet.">
      {names.map((n) => (
        <ListRow
          key={n}
          icon={<span />}
          title={n}
          meta={n === 'Apple' ? 'red' : undefined}
          active={n === 'Cherry'}
          onOpen={() => opened.push(n)}
          actions={[{ label: 'Delete', icon: <Trash2 />, destructive: true, onSelect: () => deleted.push(n) }]}
        />
      ))}
    </ListPane>
  )
}

const rows = () => within(screen.getByRole('list', { name: 'Fruits' })).queryAllByRole('listitem')

beforeEach(() => {
  opened.length = 0
  deleted.length = 0
})

test('shows its title, count and rows, and opens a row when clicked', async () => {
  render(<Fruits names={['Apple', 'Banana', 'Cherry']} />)
  expect(screen.getByRole('region', { name: 'Fruits' })).toHaveTextContent('3')
  expect(rows().map((r) => r.textContent)).toEqual([
    expect.stringContaining('Apple'),
    expect.stringContaining('Banana'),
    expect.stringContaining('Cherry'),
  ])
  expect(rows()[0]).toHaveTextContent('red')
  await userEvent.click(screen.getByRole('button', { name: /^Banana/ }))
  expect(opened).toEqual(['Banana'])
})

test('the open row is marked', () => {
  render(<Fruits names={['Apple', 'Cherry']} />)
  expect(screen.getByRole('button', { name: /^Cherry/ })).toHaveAttribute('aria-current', 'true')
  expect(screen.getByRole('button', { name: /^Apple/ })).not.toHaveAttribute('aria-current')
})

test('search keeps only rows whose title matches, ignoring case', async () => {
  render(<Fruits names={['Apple', 'Banana', 'Pineapple']} />)
  await userEvent.type(screen.getByRole('searchbox', { name: 'Search fruits' }), 'APP')
  expect(rows().map((r) => r.textContent)).toEqual([expect.stringContaining('Apple'), expect.stringContaining('Pineapple')])
  await userEvent.clear(screen.getByRole('searchbox', { name: 'Search fruits' }))
  await userEvent.type(screen.getByRole('searchbox', { name: 'Search fruits' }), 'kiwi')
  expect(rows()).toHaveLength(0)
  expect(screen.getByText('Nothing matches “kiwi”.')).toBeInTheDocument()
})

test('an empty list says so, and New is there', async () => {
  render(<Fruits names={[]} />)
  expect(screen.getByText('No fruit yet.')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'New fruit' }))
  expect(opened).toEqual(['new'])
})

test('a row’s actions are icon buttons on the row itself: Delete is a bin, no menu', async () => {
  render(<Fruits names={['Apple', 'Banana']} />)
  expect(screen.queryByRole('button', { name: /^Actions for/ })).not.toBeInTheDocument()
  const bin = screen.getByRole('button', { name: 'Delete Banana' })
  expect(bin.querySelector('svg.lucide-trash2, svg.lucide-trash-2')).not.toBeNull()
  await userEvent.click(bin)
  expect(deleted).toEqual(['Banana'])
  expect(opened).toEqual([])
})

test('rows keep to the list’s width, so long titles are shortened and the buttons stay in view', () => {
  render(<Fruits names={['Apple']} />)
  const row = rows()[0]
  expect(row).toHaveClass('min-w-0')
  expect(screen.getByRole('list', { name: 'Fruits' })).toHaveClass('grid-cols-1')
})

describe('the list can be made wider or narrower', () => {
  beforeEach(() => useSettings.setState({ listWidth: LIST_PANE.default }))
  const handle = () => screen.getByRole('separator', { name: 'Resize list' })
  const pane = () => screen.getByRole('region', { name: 'Fruits' })

  test('dragging its right edge to the right widens it, and the width is remembered', () => {
    render(<Fruits names={['Apple']} />)
    expect(pane()).toHaveStyle({ width: `${LIST_PANE.default}px` })
    fireEvent.pointerDown(handle(), { clientX: 240, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: 320, pointerId: 1 })
    fireEvent.pointerUp(window, { pointerId: 1 })
    expect(useSettings.getState().listWidth).toBe(LIST_PANE.default + 80)
    expect(pane()).toHaveStyle({ width: `${LIST_PANE.default + 80}px` })
  })

  test('it stays between the minimum and maximum, and double-click resets it', () => {
    render(<Fruits names={['Apple']} />)
    fireEvent.pointerDown(handle(), { clientX: 240, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: -1000, pointerId: 1 })
    expect(useSettings.getState().listWidth).toBe(LIST_PANE.min)
    fireEvent.pointerMove(window, { clientX: 3000, pointerId: 1 })
    expect(useSettings.getState().listWidth).toBe(LIST_PANE.max)
    fireEvent.pointerUp(window, { pointerId: 1 })
    fireEvent.doubleClick(handle())
    expect(useSettings.getState().listWidth).toBe(LIST_PANE.default)
  })

  test('arrow keys resize: right is wider, left is narrower', () => {
    render(<Fruits names={['Apple']} />)
    fireEvent.keyDown(handle(), { key: 'ArrowRight' })
    expect(useSettings.getState().listWidth).toBe(LIST_PANE.default + LIST_PANE.step)
    fireEvent.keyDown(handle(), { key: 'ArrowLeft' })
    fireEvent.keyDown(handle(), { key: 'ArrowLeft' })
    expect(useSettings.getState().listWidth).toBe(LIST_PANE.default - LIST_PANE.step)
  })
})
