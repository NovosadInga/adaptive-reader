import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
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
 * `POST /books` — upload a book file, parse it on the server (D4), keep the
 * result in memory (D19) and answer with the id and metadata. The text
 * itself is not in the response: chapters are fetched one at a time.
 *
 * The request is `multipart/form-data` with the book in a file field — what
 * a browser sends for `<input type="file">` through `FormData`. The plugin
 * counts bytes as they arrive and stops at the limit, so an oversized upload
 * is refused without being read to the end.
 */
export async function booksRoutes(app: FastifyInstance, options: BooksRoutesOptions): Promise<void> {
  const { store, maxFileBytes = DEFAULT_MAX_FILE_BYTES } = options;

  // Registered here rather than in app.ts: only these routes accept files,
  // and Fastify scopes a plugin to the routes registered alongside it.
  await app.register(multipart, { limits: { fileSize: maxFileBytes, files: 1 } });

  app.post('/books', async (request, reply) => {
    const part = await request.file();
    if (!part) {
      return reply.code(400).send(fail('no-file', 'Send the book as a file field of a multipart/form-data request.'));
    }

    // Throws the plugin's "too large" error as soon as the limit is crossed.
    const bytes = await part.toBuffer();
    const book = await parseEpub(bytes, part.filename);
    const id = bookIdFromBytes(bytes);
    store.put(id, book);

    // 201 for a repeated upload too: the same bytes yield the same id, so the
    // request is idempotent and the client needs no second code path.
    return reply.code(201).send({ id, meta: book.meta, stats: book.stats });
  });

  const { RequestFileTooLargeError, InvalidMultipartContentTypeError } = app.multipartErrors;

  // Scoped to this plugin: other routes keep Fastify's default handler.
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof BookParseError) {
      return reply.code(422).send(fail(error.reason, error.message));
    }
    if (error instanceof RequestFileTooLargeError) {
      return reply.code(413).send(fail('too-large', `The file is larger than the limit of ${maxFileBytes} bytes.`));
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
