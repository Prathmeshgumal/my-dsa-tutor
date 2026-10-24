import {
  LANGUAGES,
  languageFromFilename,
  uniqueName,
  validateFileName,
  withLanguage,
} from './languages'

test('ids and extensions', () => {
  expect(LANGUAGES.cpp).toMatchObject({ ext: '.cpp', monaco: 'cpp' })
  expect(LANGUAGES.java).toMatchObject({ ext: '.java' })
  expect(LANGUAGES.python).toMatchObject({ ext: '.py' })
})

test('piston language names and fixed file names', () => {
  expect(LANGUAGES.cpp.piston).toEqual({ language: 'c++', fileName: 'main' })
  expect(LANGUAGES.java.piston).toEqual({ language: 'java', fileName: 'Main.java' })
  expect(LANGUAGES.python.piston).toEqual({ language: 'python', fileName: 'main.py' })
})

test('cpp template', () => {
  expect(LANGUAGES.cpp.template).toContain('#include <bits/stdc++.h>')
  expect(LANGUAGES.cpp.template).toContain('using namespace std;')
  expect(LANGUAGES.cpp.template).toMatch(/int main\(\)/)
})

test('java template uses class Main', () => {
  expect(LANGUAGES.java.template).toMatch(/public class Main\b/)
})

test('languageFromFilename', () => {
  expect(languageFromFilename('a.CPP')?.id).toBe('cpp')
  expect(languageFromFilename('x.py')?.id).toBe('python')
  expect(languageFromFilename('notes.txt')).toBeNull()
  expect(languageFromFilename('noext')).toBeNull()
})

test('withLanguage', () => {
  expect(withLanguage('sol.cpp', 'python')).toBe('sol.py')
  expect(withLanguage('sol', 'java')).toBe('sol.java')
})

test.each([
  ['', 'Name can’t be empty'],
  ['   ', 'Name can’t be empty'],
  ['a/b.cpp', 'Name can’t contain /'],
  ['notes.txt', 'Use .cpp, .java or .py'],
  ['Main.CPP', 'A file with this name already exists'],
])('validateFileName(%j) rejects', (name, error) => {
  expect(validateFileName(name, ['main.cpp'])).toEqual({ ok: false, error })
})

test('validateFileName trims', () => {
  expect(validateFileName('  two.py ', [])).toEqual({ ok: true, name: 'two.py' })
})

test('uniqueName', () => {
  expect(uniqueName('main.cpp', ['main.cpp', 'main-1.cpp'])).toBe('main-2.cpp')
  expect(uniqueName('fresh.py', ['main.cpp'])).toBe('fresh.py')
})
