import type { FastifyInstance } from 'fastify';
import multipart, { type MultipartFile } from '@fastify/multipart';
import { BookParseError } from '../domain/book.ts';
import { parseEpub } from '../parsers/epub.ts';
import { BookStore, bookIdFromBytes } from '../books/store.ts';

/**
 * Largest upload accepted. Text-only EPUBs are a few hundred kilobytes and
 * illustrated ones rarely pass ten megabytes, so this is generous for books
 * and still refuses a file that would only exhaust memory. A property of the
 * product rather than of the environment, hence a constant and not a config
 * variable (D31).
 */
export const DEFAULT_MAX_FILE_BYTES = 20 * 1024 * 1024;

export interface BooksRoutesOptions {
  store: BookStore;
  /** Override for tests; production uses the default. */
  maxFileBytes?: number;
}

/**
 * Error body shared by every failure of these routes. `reason` is a stable
 * machine-readable word the frontend can branch on; `message` is for people.
 */
interface ErrorBody {
  error: {
    reason: string;
    message: string;
  };
}

/**
 * Book routes. The book is served in pieces so the phone never holds all of
 * it (D4): upload and metadata separately from the chapter list, and each
 * chapter's text separately again.
 *
 * `POST /books` — upload a book file, parse it on the server, keep the
 * result in memory (D19) and answer with the id and metadata. The request is
 * `multipart/form-data` with the book in a file field — what a browser sends
 * for `<input type="file">` through `FormData`. An upload over the limit is
 * answered 413 the moment the limit is crossed and the connection is closed,
 * so the rest of the file is never read.
 *
 * `GET /books/:id` — metadata, totals and the chapter list without any text.
 *
 * `GET /books/:id/chapters/:index` — one chapter with its paragraphs and
 * sentences, ids intact (D16), so the reader can name a sentence when it
 * asks for a translation.
 */
export async function booksRoutes(app: FastifyInstance, options: BooksRoutesOptions): Promise<void> {
  const { store, maxFileBytes = DEFAULT_MAX_FILE_BYTES } = options;

  // Registered here rather than in app.ts: only these routes accept files,
  // and Fastify scopes a plugin to the routes registered alongside it.
  await app.register(multipart, { limits: { fileSize: maxFileBytes, files: 1 } });

  const { RequestFileTooLargeError, InvalidMultipartContentTypeError } = app.multipartErrors;

  /**
   * `part.toBuffer()` rejects with the "too large" error only once the file
   * part has ended — busboy discards the bytes past the limit but keeps
   * reading them, so the whole upload would cross the network before the
   * client heard 413. Busboy does emit `limit` at the byte it stops storing,
   * so this races the buffer against that event and settles at once.
   */
  function readWithinLimit(part: MultipartFile): Promise<Buffer> {
    const buffered = part.toBuffer();
    // When `limit` wins, `buffered` still settles later, on its own; nobody
    // is waiting for it by then, so its rejection must not go unhandled.
    buffered.catch(() => {});

    const limitReached = new Promise<never>((_resolve, reject) => {
      const reject413 = () => reject(new RequestFileTooLargeError());
      // The limit may have been hit while this handler was still being
      // scheduled: busboy parses a whole network chunk synchronously.
      if (part.file.truncated) {
        reject413();
      } else {
        part.file.once('limit', reject413);
      }
    });

    return Promise.race([buffered, limitReached]);
  }

  app.post('/books', async (request, reply) => {
    const part = await request.file();
    if (!part) {
      return reply.code(400).send(fail('no-file', 'Send the book as a file field of a multipart/form-data request.'));
    }

    const bytes = await readWithinLimit(part);
    const id = bookIdFromBytes(bytes);

    // The id is the content hash, so a known id means the same bytes: skip
    // the parse and refresh the book's place in the eviction order.
    const book = store.get(id) ?? (await parseEpub(bytes, part.filename));
    store.put(id, book);

    // 201 for a repeated upload too: the same bytes yield the same id, so the
    // request is idempotent and the client needs no second code path.
    return reply.code(201).send({ id, meta: book.meta, stats: book.stats });
  });

  app.get<{ Params: { id: string } }>('/books/:id', async (request, reply) => {
    const { id } = request.params;
    const book = store.get(id);
    if (!book) {
      return reply.code(404).send(bookNotFound(id));
    }
    return {
      id,
      meta: book.meta,
      stats: book.stats,
      chapters: book.chapters.map((chapter) => ({
        id: chapter.id,
        index: chapter.index,
        title: chapter.title,
        paragraphs: chapter.paragraphs.length,
        sentences: chapter.paragraphs.reduce((total, paragraph) => total + paragraph.sentences.length, 0),
      })),
    };
  });

  app.get<{ Params: { id: string; index: string } }>('/books/:id/chapters/:index', async (request, reply) => {
    const { id } = request.params;
    const book = store.get(id);
    if (!book) {
      return reply.code(404).send(bookNotFound(id));
    }
    // Route parameters are strings; only a plain non-negative integer is a
    // chapter index. `Number("1e2")` or `Number("")` would pass silently.
    if (!/^\d+$/.test(request.params.index)) {
      return reply.code(400).send(fail('bad-index', 'The chapter index must be a non-negative integer.'));
    }
    const chapter = book.chapters[Number(request.params.index)];
    if (!chapter) {
      return reply
        .code(404)
        .send(fail('not-found', `Book "${id}" has ${book.chapters.length} chapters; there is no chapter ${request.params.index}.`));
    }
    return chapter;
  });

  // Scoped to this plugin: other routes keep Fastify's default handler.
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof BookParseError) {
      return reply.code(422).send(fail(error.reason, error.message));
    }
    if (error instanceof RequestFileTooLargeError) {
      // The client is still sending. Left alone, Node would read the rest of
      // the body into nowhere to keep the connection reusable, so once the
      // 413 has been written the connection is closed instead. A client that
      // only reads the response after finishing its upload may see the
      // closed connection rather than the 413; that is the accepted cost.
      reply.raw.once('finish', () => request.raw.destroy());
      return reply
        .code(413)
        .header('connection', 'close')
        .send(fail('too-large', `The file is larger than the limit of ${maxFileBytes} bytes.`));
    }
    if (error instanceof InvalidMultipartContentTypeError) {
      return reply.code(400).send(fail('not-multipart', 'The request must be multipart/form-data with the book as a file field.'));
    }
    // Anything else is a bug or an unknown failure: let the default handler
    // log it and answer 500 without leaking details.
    throw error;
  });
}

function fail(reason: string, message: string): ErrorBody {
  return { error: { reason, message } };
}

function bookNotFound(id: string): ErrorBody {
  // Books live only in memory (D19): a restart or ten newer uploads drop
  // them. The message says what to do rather than just "not found".
  return fail('not-found', `No book with id "${id}" is loaded. Upload the file again.`);
}
