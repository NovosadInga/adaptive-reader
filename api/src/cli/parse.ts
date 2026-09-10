/**
 * Manual check of the parser against a real file.
 *
 *   node src/cli/parse.ts book.epub                   — short report
 *   node src/cli/parse.ts book.epub --json out.json   — full representation to a file
 *
 * This is a developer tool, not part of the API: the parser has to be visible
 * against real books before an HTTP layer and a frontend exist.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { parseEpub } from '../parsers/epub.ts';
import { BookParseError, type Book } from '../domain/book.ts';

const [, , filePath, ...flags] = process.argv;

if (!filePath) {
  console.error('Usage: node src/cli/parse.ts <file.epub> [--json <output.json>]');
  process.exit(1);
}

const jsonFlagIndex = flags.indexOf('--json');
const jsonOutput = jsonFlagIndex === -1 ? null : flags[jsonFlagIndex + 1] ?? 'book.json';

try {
  const format = extname(filePath).toLowerCase();
  if (format !== '.epub') {
    console.error(`Format ${format || '(no extension)'} is not supported yet. Only .epub for now.`);
    process.exit(1);
  }

  const file = await readFile(filePath);
  const startedAt = performance.now();
  const book = await parseEpub(file, basename(filePath));
  const elapsedMs = performance.now() - startedAt;

  report(book, elapsedMs);

  if (jsonOutput) {
    await writeFile(jsonOutput, JSON.stringify(book, null, 2), 'utf8');
    console.log(`\nFull representation written to ${jsonOutput}`);
  }
} catch (error) {
  if (error instanceof BookParseError) {
    console.error(`Could not parse the book (${error.reason}): ${error.message}`);
    process.exit(1);
  }
  throw error;
}

function report(book: Book, elapsedMs: number): void {
  const { meta, stats } = book;

  console.log(`Title:    ${meta.title}`);
  console.log(`Author:   ${meta.author ?? '—'}`);
  console.log(`Language: ${meta.language ?? '—'}`);
  console.log(
    `Parsed in ${elapsedMs.toFixed(0)} ms — ` +
      `${stats.chapters} chapters, ${stats.paragraphs} paragraphs, ` +
      `${stats.sentences} sentences, ${stats.words} words`,
  );

  console.log('\nChapters:');
  for (const chapter of book.chapters) {
    const sentences = chapter.paragraphs.reduce((sum, p) => sum + p.sentences.length, 0);
    console.log(
      `  ${chapter.id.padEnd(5)} ${String(sentences).padStart(4)} sent.  ${truncate(chapter.title, 60)}`,
    );
  }

  const sample = book.chapters[1] ?? book.chapters[0];
  const firstParagraph = sample?.paragraphs[0];
  if (firstParagraph) {
    console.log(`\nSample sentences (${sample?.title}):`);
    for (const sentence of firstParagraph.sentences.slice(0, 4)) {
      console.log(`  [${sentence.id}] ${truncate(sentence.text, 90)}`);
    }
  }
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
