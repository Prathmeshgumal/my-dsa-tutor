// The main things you do in the editor, clicked through in a real browser against the real server.
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { SOLUTIONS, STATE } from './paths.ts'

const tabs = (page: Page) => page.getByRole('tablist', { name: 'Open files' }).getByRole('tab')
const editor = (page: Page) => page.locator('.monaco-editor').first()
/** Monaco comes from a CDN (jsdelivr), which can take a while on a cold start. */
const MONACO_LOAD = { timeout: 30_000 }

async function openFile(page: Page, name: string) {
  await page.getByRole('button', { name: 'Files' }).click()
  await page.getByText(name, { exact: true }).first().click()
  await expect(tabs(page).filter({ hasText: name })).toHaveAttribute('aria-selected', 'true')
}

test('opens a file and saves what you type to the solutions folder', async ({ page }) => {
  await page.goto('/')
  await openFile(page, 'two_sum.cpp')
  await expect(editor(page)).toContainText('std::cout << 3;', MONACO_LOAD)
  await editor(page).click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type('// checked by the browser tests')
  await expect.poll(() => readFile(path.join(SOLUTIONS, 'two_sum.cpp'), 'utf8')).toContain('// checked by the browser tests')
  await expect(page.getByText('Saved', { exact: false }).first()).toBeVisible()
})

test('everything the page asks for is there: scripts, styles, fonts', async ({ page }) => {
  const missing: string[] = []
  page.on('response', (res) => {
    if (res.status() >= 400) missing.push(`${res.status()} ${res.url()}`)
  })
  await page.goto('/', { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  expect(missing).toEqual([])
  expect(await page.evaluate(() => document.fonts.check('16px "Geist"'))).toBe(true)
})

test('runs a program and takes what you type as its input', async ({ page }) => {
  await page.goto('/')
  await openFile(page, 'two_sum.cpp')
  await page.getByRole('button', { name: 'Run', exact: true }).first().click()
  const input = page.getByRole('textbox', { name: 'Type input for the program' })
  await expect(page.getByText('Name?')).toBeVisible()
  await input.fill('prathmesh')
  await input.press('Enter')
  await expect(page.getByText('hi prathmesh')).toBeVisible()
  await expect(page.getByText('Success', { exact: true })).toBeVisible()
})

test('a file changed outside the editor shows up straight away', async ({ page }) => {
  await page.goto('/')
  await openFile(page, 'hello.py')
  await expect(editor(page)).toBeVisible(MONACO_LOAD)
  await writeFile(path.join(SOLUTIONS, 'hello.py'), 'print("changed in VS Code")\n')
  await expect(editor(page)).toContainText('changed in VS Code')
  await writeFile(path.join(SOLUTIONS, 'new_file.cpp'), 'int main() {}\n')
  await page.getByRole('button', { name: 'Files' }).click()
  await expect(page.getByText('new_file.cpp', { exact: true })).toBeVisible()
})

test('open tabs and the theme come back from disk after the browser forgets everything', async ({ page }) => {
  await page.goto('/')
  await openFile(page, 'two_sum.cpp')
  await openFile(page, 'hello.py')
  await page.getByRole('button', { name: 'Toggle theme' }).click()
  await page.getByRole('menuitem', { name: 'Dark' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  // Wait until both reached disk.
  await expect.poll(() => readFile(path.join(STATE, 'settings.json'), 'utf8').catch(() => '')).toContain('"theme":"dark"')
  await expect.poll(() => readFile(path.join(STATE, 'workspace.json'), 'utf8').catch(() => '')).toContain('hello.py')

  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(tabs(page).filter({ hasText: 'two_sum.cpp' })).toBeVisible()
  await expect(tabs(page).filter({ hasText: 'hello.py' })).toHaveAttribute('aria-selected', 'true')
})

test('Setup says what is missing and how to fix it', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Setup' }).click()
  const checks = page.getByRole('list', { name: 'Setup checks' })
  await expect(checks.getByText('Java missing')).toBeVisible()
  await expect(checks.getByText(/Java isn’t installed/)).toBeVisible()
  await expect(checks.getByText('solutions, notes, playground, problems, state, logs: all writable.')).toBeVisible()
})

test('other websites can’t use the editor’s API', async ({ request }) => {
  const res = await request.get('/api/files', { headers: { 'Sec-Fetch-Site': 'cross-site', Origin: 'https://evil.example' } })
  expect(res.status()).toBe(403)
})
