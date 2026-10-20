// Where to draw a dry-run arrow between two boxes, so it stays clear of their labels.
// Boxes have their index or name centred above them, so arrows never attach at the centre of a top
// edge: they attach off-centre, on the side facing the other box. Between rows they run through
// the gap (top edge of the lower box to bottom edge of the upper one) instead of looping over names.

export interface Box {
  left: number
  top: number
  width: number
  height: number
  /** Something sits in the top-right corner (a cell's old value): arrows meet the top edge on the left. */
  topRightTaken?: boolean
}

export interface Route {
  path: string
  /** Start and end points */
  x1: number
  y1: number
  x2: number
  y2: number
  labelX: number
  labelY: number
  /** How the label text lines up with labelX */
  labelAnchor: 'middle' | 'start'
}

/** How far from the centre an arrow attaches: past a centred label, but inside the box. */
const OFFSET = 14
/** Room for the arrowhead between the line's end and the box. */
const HEAD = 4

const cx = (b: Box) => b.left + b.width / 2
const cy = (b: Box) => b.top + b.height / 2
const bottom = (b: Box) => b.top + b.height

/** An x on box b, nudged off-centre towards x (but clear of a taken top-right corner on the top edge). */
function attachX(b: Box, towardX: number, edge: 'top' | 'bottom'): number {
  const room = Math.max(0, Math.min(OFFSET, b.width / 2 - 8))
  if (edge === 'top' && b.topRightTaken) return cx(b) - room
  const dx = towardX - cx(b)
  return cx(b) + (Math.abs(dx) < 1 ? 0 : Math.sign(dx) * room)
}

export function routeArrow(a: Box, b: Box, opts: { below?: boolean } = {}): Route {
  const sameRow = Math.abs(cy(a) - cy(b)) < Math.min(a.height, b.height) / 2

  if (!sameRow) {
    // Straight from one row to the other through the gap between them.
    const down = cy(b) > cy(a)
    const x1 = attachX(a, cx(b), down ? 'bottom' : 'top')
    const x2 = attachX(b, cx(a), down ? 'top' : 'bottom')
    const y1 = down ? bottom(a) + 2 : a.top - 2
    const y2 = down ? b.top - HEAD : bottom(b) + HEAD
    const my = (y1 + y2) / 2
    return {
      path: `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`,
      x1,
      y1,
      x2,
      y2,
      // To the right of the curve's middle, so the text doesn't sit on the line.
      labelX: Math.max(x1, x2) + 8,
      labelY: my + 4,
      labelAnchor: 'start',
    }
  }

  const edge = opts.below ? 'bottom' : 'top'
  const x1 = attachX(a, cx(b), edge)
  const x2 = attachX(b, cx(a), edge)
  const lift = 26 + Math.min(56, Math.abs(x2 - x1) * 0.18)
  if (opts.below) {
    const y1 = bottom(a) + 2
    const y2 = bottom(b) + HEAD
    const c = Math.max(y1, y2) + lift
    return {
      path: `M ${x1} ${y1} C ${x1} ${c}, ${x2} ${c}, ${x2} ${y2}`,
      x1,
      y1,
      x2,
      y2,
      labelX: (x1 + x2) / 2,
      // The curve's lowest point is 3/4 of the way to the control points; the label goes just under it.
      labelY: c - lift / 4 + 13,
      labelAnchor: 'middle',
    }
  }
  const y1 = a.top - 2
  const y2 = b.top - HEAD
  const c = Math.min(y1, y2) - lift
  return {
    path: `M ${x1} ${y1} C ${x1} ${c}, ${x2} ${c}, ${x2} ${y2}`,
    x1,
    y1,
    x2,
    y2,
    labelX: (x1 + x2) / 2,
    // Just above the curve's highest point.
    labelY: c + lift / 4 - 6,
    labelAnchor: 'middle',
  }
}
