import type { MockRequest, FormatName } from "./request.js";
import type { Resolver, ReplyOptions, Reply, SequenceEntry } from "./reply.js";

/**
 * Determines whether a rule matches an incoming request.
 *
 * A `string` does a case-insensitive substring match on the last user message.
 * A `RegExp` gets tested against the last user message.
 * A `MatchObject` checks multiple fields at once with AND logic.
 * A function receives the normalised request and returns a boolean.
 *
 * @example
 * ```ts
 * server.when("hello").reply("Hi!");
 * server.when(/explain (\w+)/i).reply("Here's an explanation.");
 * server.when({ model: /claude/, format: "anthropic" }).reply("Bonjour!");
 * server.when((req) => req.messages.length > 5).reply("Long conversation!");
 * ```
 */
export type Match =
  | string
  | RegExp
  | MatchObject
  | ((req: MockRequest) => boolean);

/**
 * A structured matcher. Every field you set must match for the rule to fire.
 *
 * @example
 * ```ts
 * server.when({
 *   model: /gpt/,
 *   format: "openai",
 *   system: /translator/i,
 *   predicate: (req) => req.messages.length > 2,
 * }).reply("Translated output.");
 * ```
 */
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
  /** Extra predicate that runs after all other fields pass. */
  readonly predicate?: (req: MockRequest) => boolean;
}

/**
 * Returned by `when()`. Call `.reply()` or `.replySequence()` on it to complete the rule.
 *
 * @example
 * ```ts
 * server.when("hello").reply("Hi!");
 * server.when("step").replySequence(["First.", "Second.", "Done."]);
 * ```
 */
export interface PendingRule {
  /** Set the response for this rule. Accepts a static value, object, or resolver function. */
  reply(response: Resolver, options?: ReplyOptions): RuleHandle;
  /** Set a sequence of replies. Each match advances through the array. */
  replySequence(entries: readonly SequenceEntry[]): RuleHandle;
}

/**
 * A handle to a registered rule. All methods return `this` for chaining.
 *
 * @example
 * ```ts
 * server.when("hello").reply("Hi!").times(3);
 * server.when("urgent").reply("On it!").first();
 * ```
 */
export interface RuleHandle {
  /** Auto-expire the rule after `n` matches. */
  times(n: number): RuleHandle;
  /** Move this rule to the front of the list so it matches first. */
  first(): RuleHandle;
}

/**
 * The shape of a handler file's default export.
 * You can export a single handler or an array of them.
 *
 * @example
 * ```ts
 * import type { Handler } from "llm-mock-server";
 * export default {
 *   match: (req) => req.lastMessage.includes("echo"),
 *   respond: (req) => `Echo: ${req.lastMessage}`,
 * } satisfies Handler;
 * ```
 */
export interface Handler {
  /** Return `true` if this handler should respond to the request. */
  match: (req: MockRequest) => boolean;
  /** Produce the reply for a matched request. Can be async. */
  respond: (req: MockRequest) => Reply | Promise<Reply>;
}

/** A summary of a registered rule, for inspection via `server.rules`. */
export interface RuleSummary {
  /** Human-readable description of what the rule matches. */
  readonly description: string;
  /**
   * How many matches are left.
   * @defaultValue `Infinity` (unlimited)
   */
  readonly remaining: number;
}

export interface Rule {
  readonly description: string;
  readonly match: (req: MockRequest) => boolean;
  resolve: Resolver;
  options: ReplyOptions;
  remaining: number;
}
