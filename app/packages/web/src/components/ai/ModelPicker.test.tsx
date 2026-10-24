import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { configureModels, useModels, type ClaudeModel } from '@/state/models'
import { useSettings } from '@/state/settings'
import { ModelPicker } from './ModelPicker'

const ALL = ['low', 'medium', 'high', 'xhigh', 'max'] as const
const LIST: ClaudeModel[] = [
  { value: 'default', displayName: 'Default (recommended)', description: 'Opus 5.5 · Best for everyday, complex tasks', efforts: [...ALL] },
  { value: 'sonnet', displayName: 'Sonnet 5.5', description: 'Most efficient for simpler tasks', efforts: [...ALL] },
  { value: 'claude-sonnet-4-6', displayName: 'Sonnet 4.6', description: 'Efficient for routine tasks', efforts: ['low', 'medium', 'high', 'max'] },
  { value: 'claude-haiku-4-5-20251001', displayName: 'Haiku 4.5', description: 'Fastest for quick answers', efforts: [] },
]

const answer = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

beforeEach(() => {
  useSettings.setState({ claudeModel: null, claudeEffort: null })
  useModels.setState({ models: [], status: 'idle', error: null })
  configureModels({ fetchImpl: answer({ models: LIST }) })
})

const chip = () => screen.getByRole('button', { name: /^Model and effort/ })
const models = () => screen.getByRole('radiogroup', { name: 'Model' })
const choice = () => useSettings.getState()

async function open() {
  render(<ModelPicker />)
  await userEvent.click(chip())
  await screen.findByRole('radiogroup', { name: 'Model' })
}

test('the chip says what Claude will use: Default until you pick, then the model and effort', () => {
  const { unmount } = render(<ModelPicker />)
  expect(chip()).toHaveTextContent('Default')
  unmount()
  useSettings.setState({ claudeModel: { value: 'sonnet', name: 'Sonnet 5.5' }, claudeEffort: 'xhigh' })
  render(<ModelPicker />)
  expect(chip()).toHaveTextContent('Sonnet 5.5 · Extra high')
})

test('opening it lists the engine’s models, the current one ticked, older ones under More models', async () => {
  await open()
  const radios = within(models()).getAllByRole('radio')
  expect(radios.map((r) => r.textContent)).toEqual(['Default (recommended)Opus 5.5 · Best for everyday, complex tasks', 'Sonnet 5.5Most efficient for simpler tasks'])
  expect(radios[0]).toHaveAttribute('aria-checked', 'true')
  await userEvent.click(screen.getByRole('button', { name: 'More models' }))
  expect(within(models()).getByRole('radio', { name: /Sonnet 4\.6/ })).toBeInTheDocument()
})

test('picking a model saves it; picking Default goes back to Claude Code’s choice', async () => {
  await open()
  await userEvent.click(within(models()).getByRole('radio', { name: /Sonnet 5\.5/ }))
  expect(choice().claudeModel).toEqual({ value: 'sonnet', name: 'Sonnet 5.5' })
  await userEvent.click(within(models()).getByRole('radio', { name: /Default/ }))
  expect(choice().claudeModel).toBeNull()
})

test('the effort slider stops at the model’s levels and shows the one picked', async () => {
  useSettings.setState({ claudeEffort: 'medium' })
  await open()
  const slider = screen.getByRole('slider', { name: 'Effort' })
  expect(slider).toHaveAttribute('aria-valuetext', 'Medium')
  expect(screen.getByTestId('effort-stops')).toHaveTextContent('LowMediumHighExtra highMax')
  act(() => slider.focus())
  fireEvent.keyDown(slider, { key: 'ArrowRight' })
  expect(choice().claudeEffort).toBe('high')
  fireEvent.keyDown(slider, { key: 'End' })
  expect(choice().claudeEffort).toBe('max')
})

test('with no effort picked the slider says Default, and moving it picks one', async () => {
  await open()
  const slider = screen.getByRole('slider', { name: 'Effort' })
  expect(slider).toHaveAttribute('aria-valuetext', 'Default')
  act(() => slider.focus())
  fireEvent.keyDown(slider, { key: 'Home' })
  expect(choice().claudeEffort).toBe('low')
})

test('a model without the picked level moves to the nearest it has; one with no effort setting hides the slider', async () => {
  useSettings.setState({ claudeEffort: 'xhigh' })
  await open()
  await userEvent.click(screen.getByRole('button', { name: 'More models' }))
  await userEvent.click(within(models()).getByRole('radio', { name: /Sonnet 4\.6/ }))
  expect(choice()).toMatchObject({ claudeModel: { value: 'claude-sonnet-4-6' }, claudeEffort: 'high' })
  expect(screen.getByTestId('effort-stops')).toHaveTextContent('LowMediumHighMax')
  await userEvent.click(within(models()).getByRole('radio', { name: /Haiku 4\.5/ }))
  expect(choice().claudeEffort).toBeNull()
  expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  expect(screen.getByText('Haiku 4.5 has no effort setting.')).toBeInTheDocument()
})

test('Reset to default clears both', async () => {
  useSettings.setState({ claudeModel: { value: 'sonnet', name: 'Sonnet 5.5' }, claudeEffort: 'max' })
  await open()
  await userEvent.click(screen.getByRole('button', { name: 'Reset to default' }))
  expect(choice()).toMatchObject({ claudeModel: null, claudeEffort: null })
})

test('if the list can’t be loaded it says why and can try again', async () => {
  configureModels({ fetchImpl: answer({ error: 'Couldn’t list the models: not logged in' }, 502) })
  render(<ModelPicker />)
  await userEvent.click(chip())
  expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t list the models: not logged in')
  configureModels({ fetchImpl: answer({ models: LIST }) })
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByRole('radiogroup', { name: 'Model' })).toBeInTheDocument()
})
