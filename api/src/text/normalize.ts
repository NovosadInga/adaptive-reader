/**
 * Text normalisation shared by every format parser.
 *
 * In EPUB and HTML a paragraph is almost always broken into lines for the sake
 * of readable markup: a `<p>` contains newlines and indentation that are not
 * part of the text. The reader lays out the paragraph itself, so what reaches
 * the representation must be one continuous string.
 */
export function normalizeWhitespace(text: string): string {
  return text
    // Non-breaking spaces behave like a space but break `\s` in some engines
    // and corrupt word boundaries during selection.
    .replace(/[   ]/g, ' ')
    // Soft hyphen: an invisible character that leaves a break inside a word.
    .replace(/­/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
