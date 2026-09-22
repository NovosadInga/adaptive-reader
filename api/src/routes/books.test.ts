import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import Fastify from 'fastify';
import { buildApp } from '../app.ts';
import { booksRoutes } from './books.ts';
import { BookStore, bookIdFromBytes } from '../books/store.ts';

const FIXTURE_NAME = 'pg215-the-call-of-the-wild.epub';
const FIXTURE_URL = new URL(`../../../books/public-domain/${FIXTURE_NAME}`, import.meta.url);
const epub = await readFile(FIXTURE_URL);

const app = buildApp({ port: 0, host: '127.0.0.1', corsOrigin: 'http://localhost:5173' });
after(() => app.close());

/** What a browser sends for `<input type="file">` submitted through `FormData`. */
function upload(bytes: Uint8Array, fileName: string): FormData {
  const form = new FormData();
  form.append('file', new Blob([bytes]), fileName);
  return form;
}

test('POST /books parses an EPUB and answers 201 with id, metadata and stats', async () => {
  const response = await app.inject({ method: 'POST', url: '/books', payload: upload(epub, FIXTURE_NAME) });

  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.json(), {
    id: bookIdFromBytes(epub),
    meta: { title: 'The call of the wild', author: 'Jack London', language: 'en' },
    stats: { chapters: 9, paragraphs: 342, sentences: 1686, words: 32141 },
  });
});

test('the same file uploaded twice gets the same id and is not parsed again', async () => {
  const store = new BookStore();
  const own = Fastify();
  after(() => own.close());
  await own.register(booksRoutes, { store });

  const first = await own.inject({ method: 'POST', url: '/books', payload: upload(epub, FIXTURE_NAME) });
  const second = await own.inject({ method: 'POST', url: '/books', payload: upload(epub, 'renamed.epub') });

  assert.equal(second.statusCode, 201);
  assert.equal(second.json().id, first.json().id);
  assert.equal(store.size, 1);
  // The stored book still carries the first file name: the second upload
  // was recognised by its bytes and the parser did not run again.
  assert.equal(store.get(first.json().id)?.source.fileName, FIXTURE_NAME);
});

test('a damaged file answers 422 with the parse reason, not a stack trace', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/books',
    payload: upload(Buffer.from('this is not a zip archive'), 'broken.epub'),
  });

  assert.equal(response.statusCode, 422);
  const body = response.json();
  assert.equal(body.error.reason, 'corrupt');
  assert.equal(typeof body.error.message, 'string');
  assert.equal(body.stack, undefined);
});

test('a multipart request without a file answers 400', async () => {
  const form = new FormData();
  form.append('note', 'no file here');
  const response = await app.inject({ method: 'POST', url: '/books', payload: form });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.reason, 'no-file');
});

test('a request that is not multipart answers 400', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/books',
    headers: { 'content-type': 'application/json' },
    payload: { file: 'nope' },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.reason, 'not-multipart');
});

test('GET /books/:id returns metadata and the chapter list without any text', async () => {
  const uploaded = await app.inject({ method: 'POST', url: '/books', payload: upload(epub, FIXTURE_NAME) });
  const { id } = uploaded.json();

  const response = await app.inject({ method: 'GET', url: `/books/${id}` });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.id, id);
  assert.deepEqual(body.meta, uploaded.json().meta);
  assert.deepEqual(body.stats, uploaded.json().stats);
  assert.equal(body.chapters.length, 9);
  assert.deepEqual(body.chapters[2], {
    id: 'c2',
    index: 2,
    title: 'Chapter II. The Law of Club and Fang',
    paragraphs: 26,
    sentences: 167,
  });
  // The list carries counts, not paragraphs: no sentence text anywhere.
  assert.equal(response.body.includes('Buck'), false);
  assert.equal(
    body.chapters.reduce((total: number, chapter: { sentences: number }) => total + chapter.sentences, 0),
    body.stats.sentences,
  );
});

test('GET /books/:id/chapters/:index returns one chapter with sentence ids intact', async () => {
  const { id } = (await app.inject({ method: 'POST', url: '/books', payload: upload(epub, FIXTURE_NAME) })).json();

  const response = await app.inject({ method: 'GET', url: `/books/${id}/chapters/2` });

  assert.equal(response.statusCode, 200);
  const chapter = response.json();
  assert.equal(chapter.id, 'c2');
  assert.equal(chapter.index, 2);
  assert.equal(chapter.title, 'Chapter II. The Law of Club and Fang');
  assert.equal(chapter.paragraphs[0].id, 'c2p0');
  assert.equal(chapter.paragraphs[0].sentences[0].id, 'c2p0s0');
  assert.equal(typeof chapter.paragraphs[0].sentences[0].text, 'string');
});

test('an unknown book id answers 404 with a hint to upload again', async () => {
  const book = await app.inject({ method: 'GET', url: '/books/0000000000000000' });
  const chapter = await app.inject({ method: 'GET', url: '/books/0000000000000000/chapters/0' });

  assert.equal(book.statusCode, 404);
  assert.equal(book.json().error.reason, 'not-found');
  assert.match(book.json().error.message, /upload/i);
  assert.equal(chapter.statusCode, 404);
  assert.equal(chapter.json().error.reason, 'not-found');
});

test('a chapter index that does not exist answers 404, a malformed one 400', async () => {
  const { id } = (await app.inject({ method: 'POST', url: '/books', payload: upload(epub, FIXTURE_NAME) })).json();

  const missing = await app.inject({ method: 'GET', url: `/books/${id}/chapters/9` });
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.json().error.reason, 'not-found');

  for (const bad of ['-1', '1e2', 'abc', '1.5']) {
    const response = await app.inject({ method: 'GET', url: `/books/${id}/chapters/${bad}` });
    assert.equal(response.statusCode, 400, `index "${bad}"`);
    assert.equal(response.json().error.reason, 'bad-index');
  }
});

test('a file over the size limit answers 413', async () => {
  // A small limit, so the test does not need to allocate 20 MB.
  const limited = Fastify();
  after(() => limited.close());
  await limited.register(booksRoutes, { store: new BookStore(), maxFileBytes: 1024 });

  const response = await limited.inject({ method: 'POST', url: '/books', payload: upload(epub, FIXTURE_NAME) });

  assert.equal(response.statusCode, 413);
  assert.equal(response.json().error.reason, 'too-large');
  assert.equal(response.headers.connection, 'close');
});

test('an oversized upload is refused before it has been read to the end', { timeout: 5000 }, async () => {
  const limited = Fastify();
  after(() => limited.close());
  await limited.register(booksRoutes, { store: new BookStore(), maxFileBytes: 1024 });

  // A hand-built multipart body whose file part starts, crosses the limit
  // and then never ends — like a client still uploading. If the route
  // waited for the part to finish, this request would never be answered
  // and the test would hit its timeout.
  const boundary = 'test-boundary';
  const body = new Readable({ read() {} });
  body.push(
    `--${boundary}\r\n` +
      'Content-Disposition: form-data; name="file"; filename="endless.epub"\r\n' +
      'Content-Type: application/epub+zip\r\n\r\n',
  );
  body.push(Buffer.alloc(4096, 'x'));
  after(() => body.destroy());

  const response = await limited.inject({
    method: 'POST',
    url: '/books',
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: body,
  });

  assert.equal(response.statusCode, 413);
  assert.equal(response.json().error.reason, 'too-large');
});
