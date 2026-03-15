import type { MockRequest, FormatName } from "./request.js";
import type { Resolver, ReplyOptions, Reply, SequenceEntry } from "./reply.js";

/**
 * Determines whether a rule matches an incoming request.
 *
 * A `string` does a case-insensitive substring match on the last user message.
 * A `RegExp` gets tested against the last user message.
 * A `MatchObject` checks multiple fields at once with AND logic.
 * A function receives the normalised request and returns a boolean.
 */
export type Match =
  | string
  | RegExp
  | MatchObject
  | ((req: MockRequest) => boolean);

/** A structured matcher. Every field you set must match for the rule to fire. */
export interface MatchObject {
  readonly message?: string | RegExp;
  readonly model?: string | RegExp;
  readonly system?: string | RegExp;
  readonly format?: FormatName;
  /** Match when the request includes a tool definition with this name. */
  readonly toolName?: string;
  /** Match when the last tool-result message has this `tool_call_id`. */
  readonly toolCallId?: string;
  /** Extra check that runs after all other fields pass. */
  readonly predicate?: (req: MockRequest) => boolean;
}

/** Returned by `when()`. Call `.reply()` or `.replySequence()` on it to complete the rule. */
export interface PendingRule {
  reply(response: Resolver, options?: ReplyOptions): RuleHandle;
  /** Each match advances through the array. The last entry repeats once exhausted. */
  replySequence(entries: readonly SequenceEntry[]): RuleHandle;
}

/** A handle to a registered rule. All methods return `this` for chaining. */
export interface RuleHandle {
  times(n: number): RuleHandle;
  first(): RuleHandle;
}

/**
 * The shape of a handler file's default export.
 * You can export a single handler or an array of them.
 */
export interface Handler {
  match: (req: MockRequest) => boolean;
  respond: (req: MockRequest) => Reply | Promise<Reply>;
}

/** A summary of a registered rule, for inspection. */
export interface RuleSummary {
  readonly description: string;
  /** `Infinity` means unlimited. */
  readonly remaining: number;
}

export interface Rule {
  readonly description: string;
  readonly match: (req: MockRequest) => boolean;
  resolve: Resolver;
  options: ReplyOptions;
  remaining: number;
}
