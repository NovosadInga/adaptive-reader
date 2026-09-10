import { normalizeWhitespace } from './normalize.ts';

/**
 * Splitting a paragraph into sentences.
 *
 * The base is the built-in `Intl.Segmenter` — Unicode UAX #29 rules, with no
 * dependency and no NLP model. But UAX #29 knows punctuation, not language,
 * and gets fiction wrong in two recurring ways:
 *
 *   "Mr. Holmes went out."     -> "Mr." + "Holmes went out."   (abbreviation)
 *   "“Don’t wait!” he said."   -> "“Don’t wait!”" + "he said."  (dialogue)
 *
 * For this product that is not a cosmetic flaw. The sentence is the unit of the
 * main interaction (D1): a truncated sentence means truncated context for the
 * translation, which means a worse hint. Hence two merge heuristics on top.
 *
 * Both lean deliberately towards merging: surplus context in a hint hurts less
 * than context that was cut off.
 */

/**
 * Abbreviations after which a full stop almost never ends a sentence.
 * The list is deliberately short — every entry is a trade-off, since "No." at
 * the end of a sentence does occur.
 */
const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'st', 'sr', 'jr', 'rev', 'hon',
  'capt', 'col', 'gen', 'lt', 'sgt', 'maj', 'gov', 'pres',
  'vs', 'etc', 'inc', 'ltd', 'co', 'corp', 'dept', 'est',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sept', 'sep', 'oct', 'nov', 'dec',
  'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun',
  'no', 'vol', 'ed', 'fig', 'p', 'pp', 'cf', 'al',
]);

const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });

/** The fragment ends in an abbreviation, so its full stop is not a sentence end. */
function endsWithAbbreviation(segment: string): boolean {
  const trimmed = segment.trimEnd();
  if (!trimmed.endsWith('.')) return false;

  const lastWord = trimmed.slice(0, -1).match(/[\p{L}]+$/u)?.[0];
  if (!lastWord) return false;

  // Initials: "J. R. R. Tolkien" — a single letter followed by a full stop.
  if (lastWord.length === 1) return true;

  return ABBREVIATIONS.has(lastWord.toLowerCase());
}

/**
 * The fragment starts with a lowercase letter, so it is not a new sentence but
 * the tail of the previous one: "“Don’t wait!” he said." An English sentence
 * effectively never begins in lowercase.
 */
function startsMidSentence(segment: string): boolean {
  const firstLetter = segment.match(/\p{L}/u)?.[0];
  if (!firstLetter) return false;
  return firstLetter.toLowerCase() === firstLetter && firstLetter.toUpperCase() !== firstLetter;
}

export function splitIntoSentences(paragraph: string): string[] {
  const text = normalizeWhitespace(paragraph);
  if (!text) return [];

  const sentences: string[] = [];

  for (const { segment } of segmenter.segment(text)) {
    const previous = sentences.at(-1);

    if (previous !== undefined && (endsWithAbbreviation(previous) || startsMidSentence(segment))) {
      sentences[sentences.length - 1] = `${previous} ${segment.trim()}`.trim();
      continue;
    }

    const sentence = segment.trim();
    if (sentence) sentences.push(sentence);
  }

  return sentences;
}
