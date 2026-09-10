/**
 * The single internal representation of a book (D6).
 *
 * Every format parser (EPUB, FB2, HTML, TXT, PDF) produces exactly this shape.
 * The reader and the AI layer work only with it and know nothing about the
 * source format. Adding a format means writing a parser, not changing half
 * the application.
 */

export type BookFormat = 'epub' | 'fb2' | 'html' | 'txt' | 'pdf';

/**
 * A sentence is the smallest unit the main interaction works with (D1):
 * click a word, get the translation of the sentence that word sits in.
 */
export interface Sentence {
  /** Stable id within the book, e.g. `c3p12s2` (D16). */
  id: string;
  /** Zero-based position of the sentence within its paragraph. */
  index: number;
  /** Sentence text with normalised whitespace and no markup. */
  text: string;
}

export interface Paragraph {
  /** Stable id within the book, e.g. `c3p12`. */
  id: string;
  index: number;
  sentences: Sentence[];
}

export interface Chapter {
  /** Stable id within the book, e.g. `c3`. */
  id: string;
  index: number;
  title: string;
  paragraphs: Paragraph[];
}

export interface BookMetadata {
  title: string;
  author: string | null;
  /** BCP 47, e.g. `en`. Taken from the file; null when the file omits it. */
  language: string | null;
}

export interface BookStats {
  chapters: number;
  paragraphs: number;
  sentences: number;
  words: number;
}

export interface Book {
  meta: BookMetadata;
  source: {
    format: BookFormat;
    fileName: string;
  };
  chapters: Chapter[];
  stats: BookStats;
}

export type BookParseErrorReason = 'corrupt' | 'unsupported' | 'no-text-layer' | 'empty';

/**
 * The file could not be parsed, and the reason is something a reader can
 * understand rather than a stack trace. These states are named explicitly in
 * the requirements: unsupported format, a scan with no text layer, a damaged
 * file.
 */
export class BookParseError extends Error {
  readonly reason: BookParseErrorReason;

  constructor(message: string, reason: BookParseErrorReason) {
    super(message);
    this.name = 'BookParseError';
    this.reason = reason;
  }
}

export function collectStats(chapters: Chapter[]): BookStats {
  let paragraphs = 0;
  let sentences = 0;
  let words = 0;

  for (const chapter of chapters) {
    paragraphs += chapter.paragraphs.length;
    for (const paragraph of chapter.paragraphs) {
      sentences += paragraph.sentences.length;
      for (const sentence of paragraph.sentences) {
        words += countWords(sentence.text);
      }
    }
  }

  return { chapters: chapters.length, paragraphs, sentences, words };
}

function countWords(text: string): number {
  const matches = text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu);
  return matches ? matches.length : 0;
}
