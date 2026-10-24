import { decodeBase64, encodeBase64 } from './base64'

test('base64 round-trips unicode', () => {
  expect(decodeBase64(encodeBase64('a → é ✓'))).toBe('a → é ✓')
})

test('encodes ASCII like btoa', () => {
  expect(encodeBase64('hi')).toBe('aGk=')
})

test('decode null', () => {
  expect(decodeBase64(null)).toBe('')
})
