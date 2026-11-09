import { publicTranslation, translationPair } from '../shared/comments/translationPairs.js';
import { cleanTranslation, detectCommentLanguage, translationMessages } from '../server/shareLinks/commentTranslate.js';

test('only English and French pairs are accepted', () => {
  expect(translationPair('en-fr').toLabel).toBe('French');
  expect(translationPair('fr-en').control).toBe('FR → EN');
  expect(translationPair('es-en')).toBeNull();
});

test('a saved translation is the pair plus the text, nothing else', () => {
  expect(publicTranslation({ pair: 'en-fr', text: '  Bonjour  ', extra: 'nope' })).toEqual({ pair: 'en-fr', text: 'Bonjour' });
  expect(publicTranslation('{"pair":"fr-en","text":"Hello"}')).toEqual({ pair: 'fr-en', text: 'Hello' });
  expect(publicTranslation({ pair: 'en-de', text: 'Hallo' })).toBeNull();
  expect(publicTranslation(null)).toBeNull();
  expect(publicTranslation('{')).toBeNull();
});

test('the model is asked for a bare translation of this comment', () => {
  const messages = translationMessages('See you at noon', translationPair('en-fr'));
  expect(messages[0].content).toMatch(/English to French/);
  expect(messages[1].content).toBe('See you at noon');
});

test('one accent in an English sentence does not make it French', () => {
  expect(detectCommentLanguage('See you at the café')).toBe('en');
  expect(detectCommentLanguage('Résumé ready')).toBeNull();
  expect(detectCommentLanguage('naïve idea')).toBeNull();
});

test('fences, quotes and a language label come off the model reply', () => {
  expect(cleanTranslation('```\n"Bonjour"\n```')).toBe('Bonjour');
  expect(cleanTranslation('French: À tout à l\'heure')).toBe('À tout à l\'heure');
  expect(cleanTranslation('«Salut»')).toBe('Salut');
  expect(() => cleanTranslation('   ')).toThrow(/empty translation/);
});
