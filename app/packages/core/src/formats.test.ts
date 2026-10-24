import { FORMATS, NewerFormatError, parseSaved, stamp, upgrade } from './formats'

test('stamp adds the current version', () => {
  expect(stamp('problem', { title: 'x' })).toEqual({ title: 'x', formatVersion: FORMATS.problem })
})

test('a file from before versions existed is upgraded to the current version', () => {
  expect(upgrade('dryRun', { id: 'a', steps: [] })).toEqual({ id: 'a', steps: [], formatVersion: FORMATS.dryRun })
})

test('a current file reads back as it was saved', () => {
  const saved = stamp('attempt', { at: 1, passed: 3 })
  expect(parseSaved('attempt', JSON.stringify(saved))).toEqual(saved)
})

test('a file from a newer editor is refused, not misread', () => {
  expect(() => upgrade('problem', { formatVersion: FORMATS.problem + 1 })).toThrow(NewerFormatError)
})

test.each([[null], [[1, 2]], ['text'], [{ formatVersion: 'one' }], [{ formatVersion: -1 }]])('%j is not a saved object', (raw) => {
  expect(() => upgrade('problem', raw)).toThrow(Error)
  expect(() => upgrade('problem', raw)).not.toThrow(NewerFormatError)
})
