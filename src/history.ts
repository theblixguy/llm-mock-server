import type { MockRequest } from "./types/request.js";

/** A recorded request with the rule that matched and when it happened. */
export interface RecordedRequest {
  /** The normalised request that was received. */
  readonly request: MockRequest;
  /** Description of the rule that matched, or `undefined` if the fallback was used. */
  readonly rule: string | undefined;
  /** When the request was recorded (`Date.now()` value). */
  readonly timestamp: number;
}

/**
 * Records every request the server handles.
 * Iterable and has fluent query methods for test assertions.
 *
 * @example
 * ```ts
 * expect(server.history.count()).toBe(3);
 * expect(server.history.last()?.request.lastMessage).toBe("hello");
 * const matched = server.history.where(r => r.rule !== undefined);
 * ```
 */
export class RequestHistory {
  private readonly entries: RecordedRequest[] = [];

  record(request: MockRequest, rule: string | undefined): void {
    this.entries.push({ request, rule, timestamp: Date.now() });
  }

  /** Number of recorded requests. */
  count(): number {
    return this.entries.length;
  }

  /** First recorded request, or `undefined` if empty. */
  first(): RecordedRequest | undefined {
    return this.entries[0];
  }

  /** Most recent recorded request, or `undefined` if empty. */
  last(): RecordedRequest | undefined {
    return this.entries.at(-1);
  }

  /** Get the entry at a specific index. Supports negative indices. */
  at(index: number): RecordedRequest | undefined {
    return this.entries.at(index);
  }

  /** Filter entries by a predicate. */
  where(predicate: (entry: RecordedRequest) => boolean): RecordedRequest[] {
    return this.entries.filter(predicate);
  }

  /** All entries as a readonly array. */
  get all(): readonly RecordedRequest[] {
    return this.entries;
  }

  /** Remove all recorded entries. */
  clear(): void {
    this.entries.length = 0;
  }

  /** Enables `for...of` iteration over recorded entries. */
  [Symbol.iterator](): Iterator<RecordedRequest> {
    return this.entries[Symbol.iterator]();
  }
}
