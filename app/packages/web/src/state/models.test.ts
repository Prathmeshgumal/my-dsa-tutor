import { configureModels, nearestEffort, splitModels, useModels, type ClaudeModel } from './models'

const LIST: ClaudeModel[] = [
  { value: 'default', displayName: 'Default (recommended)', description: 'Opus 5.5', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
  { value: 'sonnet', displayName: 'Sonnet 5.5', description: 'Efficient', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
  { value: 'claude-sonnet-4-6', displayName: 'Sonnet 4.6', description: 'Older', efforts: ['low', 'medium', 'high', 'max'] },
]

beforeEach(() => useModels.setState({ models: [], status: 'idle', error: null }))

test('the list is asked for once, and kept', async () => {
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ models: LIST })))
  configureModels({ fetchImpl: fetchImpl as unknown as typeof fetch })
  await useModels.getState().load()
  await useModels.getState().load()
  expect(fetchImpl).toHaveBeenCalledTimes(1)
  expect(fetchImpl).toHaveBeenCalledWith('/api/claude/models')
  expect(useModels.getState()).toMatchObject({ models: LIST, status: 'ready' })
})

test('a failed load says why, and can be tried again', async () => {
  configureModels({ fetchImpl: (async () => new Response(JSON.stringify({ error: 'Not logged in' }), { status: 502 })) as unknown as typeof fetch })
  await useModels.getState().load()
  expect(useModels.getState()).toMatchObject({ status: 'error', error: 'Not logged in' })
  configureModels({ fetchImpl: (async () => new Response(JSON.stringify({ models: LIST }))) as unknown as typeof fetch })
  await useModels.getState().load()
  expect(useModels.getState().status).toBe('ready')
})

test('the main models (named by family) come first, the older full ids after', () => {
  expect(splitModels(LIST)).toEqual({ main: LIST.slice(0, 2), more: LIST.slice(2) })
})

test('switching to a model without the chosen effort moves to the nearest one it has', () => {
  expect(nearestEffort(['low', 'medium', 'high', 'max'], 'xhigh')).toBe('high')
  expect(nearestEffort(['low', 'medium', 'high', 'xhigh', 'max'], 'xhigh')).toBe('xhigh')
  expect(nearestEffort(['low', 'medium', 'high', 'max'], null)).toBeNull()
  expect(nearestEffort([], 'high')).toBeNull()
})
