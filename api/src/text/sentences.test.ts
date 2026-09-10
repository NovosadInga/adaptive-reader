import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitIntoSentences } from './sentences.ts';

test('splits ordinary sentences', () => {
  assert.deepEqual(splitIntoSentences('He went out. She stayed. Why?'), [
    'He went out.',
    'She stayed.',
    'Why?',
  ]);
});

test('does not break a sentence on an abbreviation', () => {
  assert.deepEqual(splitIntoSentences('Mr. Holmes went out. He said nothing.'), [
    'Mr. Holmes went out.',
    'He said nothing.',
  ]);
});

test('does not break a sentence on initials', () => {
  assert.deepEqual(splitIntoSentences('J. R. R. Tolkien wrote it. It sold well.'), [
    'J. R. R. Tolkien wrote it.',
    'It sold well.',
  ]);
});

test('keeps quoted speech containing punctuation as one sentence', () => {
  assert.deepEqual(splitIntoSentences('“Don’t wait!” he said.'), [
    '“Don’t wait!” he said.',
  ]);
});

test('joins line wrapping inside a paragraph into continuous text', () => {
  const wrapped = 'She stayed at home\n   for the whole evening.\n   Nobody called.';
  assert.deepEqual(splitIntoSentences(wrapped), [
    'She stayed at home for the whole evening.',
    'Nobody called.',
  ]);
});

test('does not detach a speech attribution from its line', () => {
  assert.deepEqual(
    splitIntoSentences('“Curiouser and curiouser!” cried Alice. She was surprised.'),
    ['“Curiouser and curiouser!” cried Alice.', 'She was surprised.'],
  );
});

test('a paragraph ending in an abbreviation is not lost', () => {
  assert.deepEqual(splitIntoSentences('Published by Random House Inc.'), [
    'Published by Random House Inc.',
  ]);
});

test('an empty paragraph yields an empty list', () => {
  assert.deepEqual(splitIntoSentences('   \n  '), []);
});
