import { createHash } from 'node:crypto';
import type { Book } from '../domain/book.ts';

/**
 * In-memory home for parsed books (D19: no database in the vertical slice).
 *
 * Books are keyed by a hash of the uploaded bytes, so uploading the same file
 * again lands on the same id instead of a second copy — during development
 * the same book is uploaded many times. The store is bounded: past `capacity`
 * the book that was added or refreshed longest ago is dropped, so a public
 * demo cannot grow the process until it is killed. Everything here is lost on
 * restart; that is the accepted cost of D19.
 */
export class BookStore {
  // A Map keeps insertion order, which is the eviction order below.
  readonly #books = new Map<string, Book>();
  readonly #capacity: number;

  constructor(capacity = 10) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError(`BookStore capacity must be a positive integer, got ${capacity}`);
    }
    this.#capacity = capacity;
  }

  get size(): number {
    return this.#books.size;
  }

  get(id: string): Book | undefined {
    return this.#books.get(id);
  }

  /**
   * Stores the book under `id`. Re-adding an existing id moves it to the
   * newest position rather than counting it twice, so an id that is still in
   * use is not the first to be evicted.
   */
  put(id: string, book: Book): void {
    this.#books.delete(id);
    if (this.#books.size >= this.#capacity) {
      const oldest = this.#books.keys().next().value;
      if (oldest !== undefined) {
        this.#books.delete(oldest);
      }
    }
    this.#books.set(id, book);
  }
}

/**
 * Book id from the file bytes: the first 16 hex characters of SHA-256.
 *
 * 64 bits is far more than enough to tell a handful of books apart, and a
 * short id keeps URLs readable. Being derived from content, the id is the
 * same on every server and after every restart for the same file.
 */
export function bookIdFromBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 16);
}
