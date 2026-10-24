import { routeArrow, type Box } from './arrowRoute'

// A strip of 48px cells at y = 100, like arr[0..3].
const cell = (i: number): Box => ({ left: i * 48, top: 100, width: 48, height: 48 })
// A variable bucket in the row above.
const bucket = (left: number): Box => ({ left, top: 0, width: 48, height: 40 })

test('neighbouring cells: the arrow attaches off-centre, between the index numbers, and arcs above', () => {
  const r = routeArrow(cell(2), cell(3))
  // Index numbers are centred over each cell (x = 120 and 168); the ends stay clear of them.
  expect(r.x1).toBe(120 + 14)
  expect(r.x2).toBe(168 - 14)
  expect(r.y1).toBeLessThan(100)
  expect(r.labelY).toBeLessThan(100)
})

test('right to left attaches on the facing sides too', () => {
  const r = routeArrow(cell(3), cell(0))
  expect(r.x1).toBe(168 - 14)
  expect(r.x2).toBe(24 + 14)
})

test('the return half of a swap arcs below', () => {
  const r = routeArrow(cell(3), cell(2), { below: true })
  expect(r.y1).toBeGreaterThan(148)
  expect(r.y2).toBeGreaterThan(148)
  expect(r.labelY).toBeGreaterThan(148)
})

test('up to a variable in the row above: from the cell top into the bucket bottom, not over its name', () => {
  const r = routeArrow(cell(3), bucket(64))
  expect(r.y1).toBeLessThan(100)
  expect(r.y2).toBe(40 + 4)
  // Every point of the curve stays between the two rows.
  expect(r.path).toMatch(/^M 154 98 C 154 71, 102 71, 102 44$/)
  expect(r.labelAnchor).toBe('start')
})

test('down from a variable to a cell: from the bucket bottom into the cell top, beside its index number', () => {
  const r = routeArrow(bucket(64), cell(0))
  expect(r.y1).toBe(42)
  expect(r.y2).toBe(96)
  expect(r.x2).toBe(24 + 14)
})

test('narrow boxes attach nearer the centre so the arrow still lands on them', () => {
  const r = routeArrow({ left: 0, top: 0, width: 20, height: 20 }, { left: 100, top: 0, width: 20, height: 20 })
  expect(r.x1).toBe(12)
  expect(r.x2).toBe(108)
})

test('an arrow into a cell showing its old value (top-right) lands on the left of the top edge', () => {
  const r = routeArrow(bucket(64), { ...cell(0), topRightTaken: true })
  expect(r.x2).toBe(24 - 14)
  // Arcs along the bottom don't care.
  expect(routeArrow(cell(0), { ...cell(1), topRightTaken: true }, { below: true }).x2).toBe(72 - 14)
})
