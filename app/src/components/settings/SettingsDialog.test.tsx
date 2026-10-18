import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useSettings } from '@/state/settings'
import { SettingsDialog, useSettingsDialog } from './SettingsDialog'

beforeEach(() => {
  useSettings.setState({ apiKey: '', runner: 'judge0' })
  useSettingsDialog.setState({ open: false, reason: 'manual' })
})

test('closed by default, show() opens it', async () => {
  render(<SettingsDialog />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  useSettingsDialog.getState().show()
  expect(await screen.findByRole('dialog')).toBeInTheDocument()
})

test('saves trimmed key to settings and closes', async () => {
  useSettingsDialog.getState().show()
  render(<SettingsDialog />)
  await userEvent.type(screen.getByLabelText('RapidAPI key'), '  abc123  ')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(useSettings.getState().apiKey).toBe('abc123')
  expect(useSettingsDialog.getState().open).toBe(false)
})

test('prefills the saved key', () => {
  useSettings.setState({ apiKey: 'saved' })
  useSettingsDialog.getState().show()
  render(<SettingsDialog />)
  expect(screen.getByLabelText('RapidAPI key')).toHaveValue('saved')
})

test('reason no_key shows explanation and link to RapidAPI Judge0 CE', () => {
  useSettingsDialog.getState().show('no_key')
  render(<SettingsDialog />)
  expect(screen.getByText(/add your rapidapi key to run code/i)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /judge0 ce on rapidapi/i })).toHaveAttribute(
    'href',
    'https://rapidapi.com/judge0-official/api/judge0-ce',
  )
})

test('key input is type=password with show/hide toggle', async () => {
  useSettingsDialog.getState().show()
  render(<SettingsDialog />)
  const input = screen.getByLabelText('RapidAPI key')
  expect(input).toHaveAttribute('type', 'password')
  await userEvent.click(screen.getByRole('button', { name: 'Show key' }))
  expect(input).toHaveAttribute('type', 'text')
  await userEvent.click(screen.getByRole('button', { name: 'Hide key' }))
  expect(input).toHaveAttribute('type', 'password')
})

test('choosing Local (Piston) hides the key field and saves the runner', async () => {
  useSettingsDialog.getState().show()
  render(<SettingsDialog />)
  await userEvent.click(screen.getByRole('radio', { name: /local \(piston\)/i }))
  expect(screen.queryByLabelText('RapidAPI key')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(useSettings.getState().runner).toBe('piston')
})

test('Piston selected shows how to start it', () => {
  useSettings.setState({ runner: 'piston' })
  useSettingsDialog.getState().show()
  render(<SettingsDialog />)
  expect(screen.getByRole('radio', { name: /local \(piston\)/i })).toBeChecked()
  expect(screen.getByText(/docker compose up -d/)).toBeInTheDocument()
})
