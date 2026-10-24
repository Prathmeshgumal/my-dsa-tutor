import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ListPane, ListRow } from './ListPane'

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
          actions={[{ label: 'Delete', destructive: true, onSelect: () => deleted.push(n) }]}
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

test('a row’s actions are in its menu', async () => {
  render(<Fruits names={['Apple', 'Banana']} />)
  await userEvent.click(screen.getByRole('button', { name: 'Actions for Banana' }))
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
  expect(deleted).toEqual(['Banana'])
  expect(opened).toEqual([])
})
