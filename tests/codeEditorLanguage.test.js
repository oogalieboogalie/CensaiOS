import { describe, expect, test } from '@jest/globals';
import {
  detectLanguage,
  displayNameForLanguage,
  extensionForFileName,
  isFormattableLanguage,
  prettierParserForLanguage,
  sniffLanguageFromCode,
} from '../src/components/codeEditor/languageDetect.js';

describe('extensionForFileName', () => {
  test('extracts lowercase extensions', () => {
    expect(extensionForFileName('App.jsx')).toBe('jsx');
    expect(extensionForFileName('src/pages/Index.TSX')).toBe('tsx');
    expect(extensionForFileName('a.css?x=1')).toBe('css');
  });
  test('returns empty for dotfiles and extensionless names', () => {
    expect(extensionForFileName('.env')).toBe('');
    expect(extensionForFileName('Makefile')).toBe('');
    expect(extensionForFileName(null)).toBe('');
  });
});

describe('detectLanguage', () => {
  test('detects from file extension', () => {
    expect(detectLanguage({ fileName: 'index.html' })).toBe('html');
    expect(detectLanguage({ fileName: 'App.jsx' })).toBe('jsx');
    expect(detectLanguage({ filePath: 'C:\\Project\\src\\App.tsx' })).toBe('tsx');
    expect(detectLanguage({ fileName: 'data.json' })).toBe('json');
    expect(detectLanguage({ fileName: 'main.py' })).toBe('python');
  });
  test('explicit win.language wins when recognized', () => {
    expect(detectLanguage({ fileName: 'note.txt', language: 'html' })).toBe('html');
    expect(detectLanguage({ fileName: 'App.jsx', language: 'python' })).toBe('python');
  });
  test('sniffs content when there is no filename signal', () => {
    expect(detectLanguage({ code: '<!DOCTYPE html><html></html>' })).toBe('html');
    expect(detectLanguage({ code: '{"a": 1}' })).toBe('json');
    expect(detectLanguage({ code: 'SELECT * FROM agents' })).toBe('sql');
  });
  test('falls back to plaintext', () => {
    expect(detectLanguage({})).toBe('plaintext');
    expect(detectLanguage({ code: 'just some words' })).toBe('plaintext');
  });
});

describe('sniffLanguageFromCode', () => {
  test('returns empty for blank input', () => {
    expect(sniffLanguageFromCode('')).toBe('');
    expect(sniffLanguageFromCode('   ')).toBe('');
  });
});

describe('prettier parser mapping', () => {
  test('maps formattable languages to parsers', () => {
    expect(prettierParserForLanguage('html')).toBe('html');
    expect(prettierParserForLanguage('javascript')).toBe('babel');
    expect(prettierParserForLanguage('typescript')).toBe('typescript');
    expect(prettierParserForLanguage('json')).toBe('json');
  });
  test('returns null for unmapped languages', () => {
    expect(prettierParserForLanguage('python')).toBeNull();
    expect(prettierParserForLanguage('plaintext')).toBeNull();
  });
  test('isFormattableLanguage mirrors the mapping', () => {
    expect(isFormattableLanguage('html')).toBe(true);
    expect(isFormattableLanguage('python')).toBe(false);
  });
  test('displayNameForLanguage has friendly names', () => {
    expect(displayNameForLanguage('html')).toBe('HTML');
    expect(displayNameForLanguage('tsx')).toBe('TSX');
    expect(displayNameForLanguage('plaintext')).toBe('Plain text');
  });
});
