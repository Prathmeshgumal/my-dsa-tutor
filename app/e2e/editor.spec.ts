// The main things you do in the editor, clicked through in a real browser against the real server.
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { PROBLEMS, SOLUTIONS, STATE } from './paths.ts'

const tabs = (page: Page) => page.getByRole('tablist', { name: 'Open files' }).getByRole('tab')
const editor = (page: Page) => page.locator('.monaco-editor').first()
/** Monaco comes from a CDN (jsdelivr), which can take a while on a cold start. */
const MONACO_LOAD = { timeout: 30_000 }

const rail = (page: Page) => page.getByRole('navigation', { name: 'Sidebar' })

async function openFile(page: Page, name: string) {
  await page.getByRole('region', { name: 'Files' }).getByRole('button', { name, exact: true }).click()
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
  await expect(page.getByRole('region', { name: 'Files' }).getByText('new_file.cpp', { exact: true })).toBeVisible()
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

test('Reset puts a problem back to its starting code, and Ctrl+Z brings yours back', async ({ page }) => {
  await page.goto('/')
  await rail(page).getByRole('button', { name: 'Problems' }).click()
  await page.getByRole('region', { name: 'Problems' }).getByRole('button', { name: /^Pair Sum/ }).click()
  const code = page.locator('.monaco-editor').first()
  await expect(code).toContainText('// my answer', MONACO_LOAD)

  await page.getByRole('button', { name: 'Reset code' }).click()
  await page.getByRole('button', { name: 'Confirm reset code' }).click()
  const starter = 'class Solution {\npublic:\n    vector<int> pairSum(vector<int>& nums, int target) {\n        \n    }\n};'
  await expect.poll(() => readFile(path.join(PROBLEMS, 'pair-sum', 'solution.cpp'), 'utf8')).toBe(starter)
  await expect(code).not.toContainText('// my answer')

  await code.click()
  await page.keyboard.press('ControlOrMeta+z')
  await expect(code).toContainText('// my answer')
  await expect.poll(() => readFile(path.join(PROBLEMS, 'pair-sum', 'solution.cpp'), 'utf8')).toContain('// my answer')
})

test('every section opens from the left bar with its list, and Claude folds the list away', async ({ page }) => {
  await page.goto('/')
  const sections = [
    ['Problems', 'Problems'],
    ['Code', 'Files'],
    ['Notes', 'Notes'],
    ['Dry runs', 'Dry runs'],
    ['Chats', 'Chats'],
  ] as const
  // The page opens on the section you were last on, where a press would hide its list: start from Chats.
  const chats = rail(page).getByRole('button', { name: 'Chats' })
  if ((await chats.getAttribute('aria-current')) !== 'page') await chats.click()
  for (const [button, list] of sections) {
    await rail(page).getByRole('button', { name: button }).click()
    await expect(rail(page).getByRole('button', { name: button })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('region', { name: list })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'You are here' })).toContainText(button)
  }

  await rail(page).getByRole('button', { name: 'Code' }).click()
  await rail(page).getByRole('button', { name: 'Claude' }).click()
  await expect(page.getByRole('complementary', { name: 'Claude' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Files' })).toBeHidden()
  await rail(page).getByRole('button', { name: 'Claude' }).click()
  await expect(page.getByRole('region', { name: 'Files' })).toBeVisible()
})

test('a row’s menu opens with the mouse, next to the resizable problem panels', async ({ page }) => {
  await page.goto('/')
  // Settings come from disk, where an earlier test may have left Claude open (which folds the list away).
  const claude = rail(page).getByRole('button', { name: 'Claude' })
  if ((await claude.getAttribute('aria-pressed')) === 'true') await claude.click()
  const problems = rail(page).getByRole('button', { name: 'Problems' })
  if ((await problems.getAttribute('aria-current')) !== 'page') await problems.click()
  const list = page.getByRole('region', { name: 'Problems' })
  await list.getByRole('button', { name: /^Pair Sum/ }).hover()
  await list.getByRole('button', { name: 'Actions for Pair Sum' }).click()
  await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeHidden()
})
