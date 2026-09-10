import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import {
  BookParseError,
  collectStats,
  type Book,
  type Chapter,
  type Paragraph,
  type Sentence,
} from '../domain/book.ts';
import { parseMarkupSection } from './markup.ts';
import { splitIntoSentences } from '../text/sentences.ts';

/**
 * EPUB into the internal book representation (D6).
 *
 * An EPUB is a zip containing ordinary XHTML. Parsing follows three steps, as
 * the OCF/OPF specification requires:
 *
 *   1. `META-INF/container.xml` — the one file at a fixed path. It says where
 *      the package document (`.opf`) lives.
 *   2. The `.opf` — book metadata, the `manifest` (every file) and the `spine`
 *      (reading order). Chapter order comes from the spine rather than from
 *      file names: names in real books are arbitrary, for example
 *      `8761230412384829988_11-h-2.htm.xhtml`.
 *   3. Each XHTML in the spine goes through the shared markup normaliser.
 *
 * The dedicated EPUB packages on npm (`epub2`, `@gxl/epub-parser`) have not
 * been released since 2022–2023, and internally perform exactly these three
 * steps over the same generic libraries. So this is not "writing our own
 * instead of using something ready", but declining an unmaintained middleman.
 */

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  // Values such as the language "en" or a date must not be coerced to numbers.
  parseTagValue: false,
  parseAttributeValue: false,
});

export async function parseEpub(file: Buffer | Uint8Array, fileName: string): Promise<Book> {
  const zip = await openZip(file);

  const opfPath = await readRootFilePath(zip);
  const opf = await readXml(zip, opfPath);
  const packageNode = opf.package;
  if (!packageNode) {
    throw new BookParseError('The EPUB package document has no <package> element.', 'corrupt');
  }

  // Paths inside the .opf are relative to the directory holding the .opf itself.
  const basePath = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';

  const manifest = buildManifest(packageNode);
  const chapters = await readChapters(zip, packageNode, manifest, basePath);

  if (chapters.length === 0) {
    throw new BookParseError(
      'No text was found in this book. It may be an EPUB made of scanned images, which is not supported.',
      'no-text-layer',
    );
  }

  return {
    meta: readMetadata(packageNode, fileName),
    source: { format: 'epub', fileName },
    chapters,
    stats: collectStats(chapters),
  };
}

async function openZip(file: Buffer | Uint8Array): Promise<JSZip> {
  try {
    return await JSZip.loadAsync(file);
  } catch {
    throw new BookParseError('This file is not a valid EPUB: the archive could not be opened.', 'corrupt');
  }
}

async function readRootFilePath(zip: JSZip): Promise<string> {
  const container = await readXml(zip, 'META-INF/container.xml');
  const rootFiles = toArray(container.container?.rootfiles?.rootfile);
  const path = rootFiles[0]?.['@full-path'];

  if (typeof path !== 'string' || !path) {
    throw new BookParseError(
      'This file is not a valid EPUB: META-INF/container.xml does not point to a package document.',
      'corrupt',
    );
  }
  return path;
}

/** The manifest maps a file id to its path; the spine refers to those same ids. */
function buildManifest(packageNode: XmlNode): Map<string, ManifestItem> {
  const items = new Map<string, ManifestItem>();

  for (const item of toArray(packageNode.manifest?.item)) {
    const id = item['@id'];
    const href = item['@href'];
    if (typeof id === 'string' && typeof href === 'string') {
      items.set(id, { href, mediaType: asString(item['@media-type']) ?? '' });
    }
  }
  return items;
}

async function readChapters(
  zip: JSZip,
  packageNode: XmlNode,
  manifest: Map<string, ManifestItem>,
  basePath: string,
): Promise<Chapter[]> {
  const chapters: Chapter[] = [];

  for (const itemRef of toArray(packageNode.spine?.itemref)) {
    const idref = itemRef['@idref'];
    if (typeof idref !== 'string') continue;

    const item = manifest.get(idref);
    if (!item || !item.mediaType.includes('xhtml')) continue;

    const markup = await readText(zip, resolvePath(basePath, item.href));
    if (markup === null) continue;

    const section = parseMarkupSection(markup);

    // The cover and other service pages are markup without text. They are
    // filtered out by having no content, not by their file name.
    if (section.paragraphs.length === 0) continue;

    const index = chapters.length;
    const id = `c${index}`;

    chapters.push({
      id,
      index,
      title: section.title ?? `Chapter ${index + 1}`,
      paragraphs: buildParagraphs(section.paragraphs, id),
    });
  }

  return chapters;
}

/**
 * Stable ids (D16) are positional: `c3`, `c3p12`, `c3p12s2`.
 *
 * A position is stable as long as the same file is parsed by the same parser
 * version, and a book is parsed once and then stored. The price: changing the
 * parser's logic shifts the ids, so difficulty analysis results (R8) would have
 * to be recomputed. The alternative — ids as a hash of the text — survives
 * parser changes but not repeated sentences ("He nodded." occurs dozens of
 * times in a book).
 */
function buildParagraphs(texts: string[], chapterId: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  for (const text of texts) {
    const index = paragraphs.length;
    const paragraphId = `${chapterId}p${index}`;

    const sentences: Sentence[] = splitIntoSentences(text).map((sentenceText, sentenceIndex) => ({
      id: `${paragraphId}s${sentenceIndex}`,
      index: sentenceIndex,
      text: sentenceText,
    }));

    if (sentences.length === 0) continue;

    paragraphs.push({ id: paragraphId, index, sentences });
  }

  return paragraphs;
}

function readMetadata(packageNode: XmlNode, fileName: string) {
  const metadata = packageNode.metadata ?? {};

  return {
    title: firstText(metadata['dc:title'] ?? metadata.title) ?? fileName,
    author: firstText(metadata['dc:creator'] ?? metadata.creator),
    language: firstText(metadata['dc:language'] ?? metadata.language),
  };
}

// --- Working with the zip and the XML ---------------------------------------

interface ManifestItem {
  href: string;
  mediaType: string;
}

// The XML of an arbitrary book is data of unknown shape, not one of our types.
// Parsing it defensively, `any` here is more honest than an invented interface
// that guarantees nothing.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type XmlNode = any;

async function readXml(zip: JSZip, path: string): Promise<XmlNode> {
  const content = await readText(zip, path);
  if (content === null) {
    throw new BookParseError(`This file is not a valid EPUB: it contains no ${path}.`, 'corrupt');
  }

  try {
    return xml.parse(content);
  } catch {
    throw new BookParseError(`This file is not a valid EPUB: ${path} contains invalid XML.`, 'corrupt');
  }
}

async function readText(zip: JSZip, path: string): Promise<string | null> {
  // Paths inside an EPUB are URL-encoded ("Chapter%201.xhtml") while the zip
  // stores them as they are.
  const entry = zip.file(path) ?? zip.file(safeDecode(path));
  return entry ? entry.async('string') : null;
}

function resolvePath(basePath: string, href: string): string {
  // Drop the anchor: the spine sometimes carries "text.xhtml#section2".
  const path = href.split('#')[0] ?? href;
  return normalizeRelative(basePath + path);
}

/** Collapses `..` and `.` — hrefs such as "../Text/chapter1.xhtml" do occur. */
function normalizeRelative(path: string): string {
  const parts: string[] = [];

  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}

function safeDecode(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function toArray(value: unknown): XmlNode[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * In the metadata the same tag may be a string, an object carrying attributes
 * (`<dc:creator id="author_0">`), or an array — a book with two authors.
 */
function firstText(value: unknown): string | null {
  for (const node of toArray(value)) {
    const text = typeof node === 'object' && node !== null ? node['#text'] : node;
    const result = asString(text);
    if (result) return result;
  }
  return null;
}
