import { parse, type HTMLElement } from 'node-html-parser';
import { normalizeWhitespace } from '../text/normalize.ts';

/**
 * The shared markup normaliser: an XHTML document becomes a title and a list
 * of paragraphs.
 *
 * This is the layer that makes EPUB, HTML and FB2 cost "almost one parser"
 * (D5). Format-specific work — unpacking a zip, reading the `.opf`, resolving
 * the reading order — stays in the format's own parser; turning markup into
 * text happens here.
 */

/** Block elements, each of which becomes one paragraph. */
const BLOCK_SELECTOR = 'p, div.poem, blockquote, pre, li, dd';

/** Elements whose text is not part of the book. */
const NON_CONTENT_SELECTOR = 'script, style, head, nav, sup.footnote, .pagenum, .pageno';

export interface MarkupSection {
  title: string | null;
  paragraphs: string[];
}

export function parseMarkupSection(markup: string): MarkupSection {
  const root = parse(markup, {
    // These tags matter to the text: <pre> preserves the lines of a poem, and
    // empty <p> elements are dropped by their text, not by their markup.
    blockTextElements: { script: false, noscript: false, style: false, pre: true },
  });

  for (const node of root.querySelectorAll(NON_CONTENT_SELECTOR)) {
    node.remove();
  }

  const body = root.querySelector('body') ?? root;

  return {
    title: extractTitle(root, body),
    paragraphs: extractParagraphs(body),
  };
}

function extractTitle(root: HTMLElement, body: HTMLElement): string | null {
  // A heading inside the text is more accurate than <title>: in Gutenberg files
  // <title> duplicates the h2, but a bare service title like "Chapter 2" with
  // no name also occurs.
  const heading = body.querySelector('h1, h2, h3, h4, h5, h6');
  const fromHeading = heading ? normalizeWhitespace(textOf(heading)) : '';
  if (fromHeading) return fromHeading;

  const fromTitleTag = normalizeWhitespace(root.querySelector('title')?.text ?? '');
  return fromTitleTag || null;
}

function extractParagraphs(body: HTMLElement): string[] {
  const blocks = body.querySelectorAll(BLOCK_SELECTOR);
  const paragraphs: string[] = [];

  for (const block of blocks) {
    // Nested blocks (an <li> inside an <li>, a <p> inside a <blockquote>) would
    // otherwise contribute the same text twice: once via the parent, once via
    // the child.
    if (block.querySelector(BLOCK_SELECTOR)) continue;

    const text = normalizeWhitespace(textOf(block));
    if (text) paragraphs.push(text);
  }

  return paragraphs;
}

/**
 * The text of an element with `<br/>` treated as a line boundary.
 *
 * `node-html-parser` returns `.text` without accounting for `<br/>`, so the
 * heading "CHAPTER II.<br/>The Pool of Tears" would come back glued together
 * as "CHAPTER II.The Pool of Tears".
 */
function textOf(element: HTMLElement): string {
  return element.innerHTML.replace(/<br\s*\/?>/gi, ' ') === element.innerHTML
    ? element.text
    : parse(element.innerHTML.replace(/<br\s*\/?>/gi, ' ')).text;
}
