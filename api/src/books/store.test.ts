import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BookStore, bookIdFromBytes } from './store.ts';
import type { Book } from '../domain/book.ts';

function fakeBook(title: string): Book {
  return {
    meta: { title, author: null, language: null },
    source: { format: 'epub', fileName: `${title}.epub` },
    chapters: [],
    stats: { chapters: 0, paragraphs: 0, sentences: 0, words: 0 },
  };
}

test('stores and returns a book by id', () => {
  const store = new BookStore();
  store.put('a', fakeBook('A'));

  assert.equal(store.get('a')?.meta.title, 'A');
  assert.equal(store.get('missing'), undefined);
  assert.equal(store.size, 1);
});

test('evicts the oldest book once the capacity is reached', () => {
  const store = new BookStore(2);
  store.put('a', fakeBook('A'));
  store.put('b', fakeBook('B'));
  store.put('c', fakeBook('C'));

  assert.equal(store.size, 2);
  assert.equal(store.get('a'), undefined);
  assert.equal(store.get('b')?.meta.title, 'B');
  assert.equal(store.get('c')?.meta.title, 'C');
});

test('re-adding an id refreshes it instead of counting it twice', () => {
  const store = new BookStore(2);
  store.put('a', fakeBook('A'));
  store.put('b', fakeBook('B'));
  store.put('a', fakeBook('A again'));
  store.put('c', fakeBook('C'));

  // "a" was refreshed after "b", so "b" is now the oldest and goes first.
  assert.equal(store.size, 2);
  assert.equal(store.get('b'), undefined);
  assert.equal(store.get('a')?.meta.title, 'A again');
  assert.equal(store.get('c')?.meta.title, 'C');
});

test('reading a book refreshes it, so the book being read is not evicted', () => {
  const store = new BookStore(2);
  store.put('a', fakeBook('A'));
  store.put('b', fakeBook('B'));
  store.get('a');
  store.put('c', fakeBook('C'));

  // "a" was read after "b" was added, so "b" is the least recently used.
  assert.equal(store.get('b'), undefined);
  assert.equal(store.get('a')?.meta.title, 'A');
  assert.equal(store.get('c')?.meta.title, 'C');
});

test('rejects a capacity that is not a positive integer', () => {
  assert.throws(() => new BookStore(0), RangeError);
  assert.throws(() => new BookStore(1.5), RangeError);
});

test('derives the same short id from the same bytes', () => {
  const id = bookIdFromBytes(Buffer.from('hello'));

  assert.match(id, /^[0-9a-f]{16}$/);
  assert.equal(bookIdFromBytes(Buffer.from('hello')), id);
  assert.notEqual(bookIdFromBytes(Buffer.from('hello!')), id);
});
