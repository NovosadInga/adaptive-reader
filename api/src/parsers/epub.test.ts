import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseEpub } from './epub.ts';
import { BookParseError, collectStats } from '../domain/book.ts';

/**
 * The fixture is a real book, committed to the repository on purpose: the
 * counts below are exact, and Project Gutenberg regenerates its EPUBs from
 * time to time, so a freshly downloaded copy would drift from them.
 *
 * Jack London, "The Call of the Wild" — Project Gutenberg #215, public domain.
 */
const FIXTURE_NAME = 'pg215-the-call-of-the-wild.epub';
const FIXTURE_URL = new URL(`../../../books/public-domain/${FIXTURE_NAME}`, import.meta.url);

const book = await parseEpub(await readFile(FIXTURE_URL), FIXTURE_NAME);

test('reads metadata from the package document', () => {
  assert.deepEqual(book.meta, {
    title: 'The call of the wild',
    author: 'Jack London',
    language: 'en',
  });
  assert.deepEqual(book.source, { format: 'epub', fileName: FIXTURE_NAME });
});

test('produces the expected totals for the whole book', () => {
  assert.deepEqual(book.stats, {
    chapters: 9,
    paragraphs: 342,
    sentences: 1686,
    words: 32141,
  });
  assert.deepEqual(book.stats, collectStats(book.chapters));
});

test('keeps chapters in spine order with their headings as titles', () => {
  // Seven real chapters plus the two Gutenberg service pages that wrap them.
  // Dropping those pages is a known open item; until then they are chapters.
  assert.deepEqual(
    book.chapters.map((chapter) => chapter.title),
    [
      'The Project Gutenberg eBook of The call of the wild',
      'Chapter I. Into the Primitive',
      'Chapter II. The Law of Club and Fang',
      'Chapter III. The Dominant Primordial Beast',
      'Chapter IV. Who Has Won to Mastership',
      'Chapter V. The Toil of Trace and Trail',
      'Chapter VI. For the Love of a Man',
      'Chapter VII. The Sounding of the Call',
      'THE FULL PROJECT GUTENBERG™ LICENSE',
    ],
  );
  assert.deepEqual(
    book.chapters.map((chapter) => [chapter.id, chapter.index]),
    book.chapters.map((_, index) => [`c${index}`, index]),
  );
});

test('assigns stable ids that encode chapter, paragraph and sentence (D16)', () => {
  const chapterOne = book.chapters[1]!;
  const sentence = chapterOne.paragraphs[2]!.sentences[1]!;

  assert.equal(chapterOne.paragraphs[2]!.id, 'c1p2');
  assert.deepEqual(sentence, {
    id: 'c1p2s1',
    index: 1,
    text: 'Judge Miller’s place, it was called.',
  });
});

test('extracts sentence text without markup and with normalised whitespace', () => {
  const chapterOne = book.chapters[1]!;

  // The chapter opens with a verse epigraph; its line breaks are joined.
  assert.equal(
    chapterOne.paragraphs[0]!.sentences[0]!.text,
    '“Old longings nomadic leap, Chafing at custom’s chain; Again from its brumal sleep Wakens the ferine strain.”',
  );
  assert.equal(
    chapterOne.paragraphs[1]!.sentences[0]!.text,
    'Buck did not read the newspapers, or he would have known that trouble was brewing, ' +
      'not alone for himself, but for every tide-water dog, strong of muscle and with warm, ' +
      'long hair, from Puget Sound to San Diego.',
  );

  const lastChapter = book.chapters[7]!;
  const lastSentence = lastChapter.paragraphs.at(-1)!.sentences.at(-1)!;
  assert.equal(lastSentence.id, 'c7p49s1');
  assert.match(lastSentence.text, /^When the long winter nights come on .* the song of the pack\.$/);
});

test('rejects a file that is not a zip archive as corrupt', async () => {
  await assert.rejects(
    parseEpub(Buffer.from('this is not an epub'), 'broken.epub'),
    (error: unknown) => error instanceof BookParseError && error.reason === 'corrupt',
  );
});
