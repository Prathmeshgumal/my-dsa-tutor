import { fireEvent, render, screen } from '@testing-library/react'
import { useSettings } from '@/state/settings'
import { SIDE_PANEL, SidePanelResizer } from './SidePanelResizer'

beforeEach(() => useSettings.setState({ sidePanelWidth: SIDE_PANEL.default }))

const handle = () => screen.getByRole('separator', { name: 'Resize panel' })

test('dragging the left edge to the left makes the panel wider, and to the right narrower', () => {
  render(<SidePanelResizer />)
  fireEvent.pointerDown(handle(), { clientX: 1000, pointerId: 1 })
  fireEvent.pointerMove(window, { clientX: 900, pointerId: 1 })
  expect(useSettings.getState().sidePanelWidth).toBe(SIDE_PANEL.default + 100)
  fireEvent.pointerMove(window, { clientX: 1050, pointerId: 1 })
  expect(useSettings.getState().sidePanelWidth).toBe(SIDE_PANEL.default - 50)
  fireEvent.pointerUp(window, { pointerId: 1 })
  fireEvent.pointerMove(window, { clientX: 500, pointerId: 1 })
  expect(useSettings.getState().sidePanelWidth).toBe(SIDE_PANEL.default - 50)
})

test('width stays between the minimum and maximum', () => {
  render(<SidePanelResizer />)
  fireEvent.pointerDown(handle(), { clientX: 1000, pointerId: 1 })
  fireEvent.pointerMove(window, { clientX: 2000, pointerId: 1 })
  expect(useSettings.getState().sidePanelWidth).toBe(SIDE_PANEL.min)
  fireEvent.pointerMove(window, { clientX: -2000, pointerId: 1 })
  expect(useSettings.getState().sidePanelWidth).toBe(SIDE_PANEL.max)
})

test('arrow keys resize, double-click resets', () => {
  render(<SidePanelResizer />)
  fireEvent.keyDown(handle(), { key: 'ArrowLeft' })
  expect(useSettings.getState().sidePanelWidth).toBe(SIDE_PANEL.default + 20)
  fireEvent.keyDown(handle(), { key: 'ArrowRight' })
  fireEvent.keyDown(handle(), { key: 'ArrowRight' })
  expect(useSettings.getState().sidePanelWidth).toBe(SIDE_PANEL.default - 20)
  fireEvent.doubleClick(handle())
  expect(useSettings.getState().sidePanelWidth).toBe(SIDE_PANEL.default)
})

test('announces its width for screen readers', () => {
  render(<SidePanelResizer />)
  expect(handle()).toHaveAttribute('aria-valuenow', String(SIDE_PANEL.default))
  expect(handle()).toHaveAttribute('aria-orientation', 'vertical')
})
