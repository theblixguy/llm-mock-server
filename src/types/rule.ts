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
  /** Substring or regex against the last user message. */
  readonly message?: string | RegExp;
  /** Substring or regex against the model name. */
  readonly model?: string | RegExp;
  /** Substring or regex against the system prompt. */
  readonly system?: string | RegExp;
  /** Only match requests from this API format. */
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
  /** Each match advances through the array. The last entry repeats once the sequence is exhausted. */
  replySequence(entries: readonly SequenceEntry[]): RuleHandle;
}

/** A handle to a registered rule. All methods return `this` for chaining. */
export interface RuleHandle {
  /** Auto-expire the rule after `n` matches. */
  times(n: number): RuleHandle;
  /** Move this rule to the front of the list so it matches first. */
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
  /** Human-readable description of what the rule matches. */
  readonly description: string;
  /** How many matches are left. `Infinity` means unlimited. */
  readonly remaining: number;
}

export interface Rule {
  readonly description: string;
  readonly match: (req: MockRequest) => boolean;
  readonly resolve: Resolver;
  options: ReplyOptions;
  remaining: number;
}
