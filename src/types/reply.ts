import type { MockRequest } from "./request.js";

/** A reply is either a plain string (turns into `{ text: "..." }`) or a full reply object. */
export type Reply = string | ReplyObject;

/**
 * A structured reply. Text, reasoning, tool calls, usage, and errors are all optional.
 *
 * @example
 * ```ts
 * server.when("hello").reply({ text: "Hi!", reasoning: "Simple greeting." });
 * server.when("weather").reply({
 *   tools: [{ name: "get_weather", args: { city: "London" } }],
 * });
 * ```
 */
export interface ReplyObject {
  /** Text content to send back. */
  readonly text?: string | undefined;
  /** Extended thinking or chain-of-thought. Works with Anthropic and Responses formats. */
  readonly reasoning?: string | undefined;
  /** Tool calls the model wants to make. */
  readonly tools?: readonly ToolCall[] | undefined;
  /** Token counts to report. Falls back to `{ input: 10, output: 5 }` if omitted. */
  readonly usage?:
    | { readonly input: number; readonly output: number }
    | undefined;
  /** When set, the server responds with this HTTP error instead of a normal reply. */
  readonly error?: ErrorReply | undefined;
}

/** An HTTP error response. The server returns this status code with a format-appropriate body. */
export interface ErrorReply {
  /** HTTP status code, e.g. `429` or `500`. */
  readonly status: number;
  /** Error message in the response body. */
  readonly message: string;
  /** Error type string in the response body. Each format has its own default if omitted. */
  readonly type?: string | undefined;
}

/** A tool call in the mock response. */
export interface ToolCall {
  /** Explicit ID for the call. Auto-generated if omitted. */
  readonly id?: string | undefined;
  /** Tool function name. */
  readonly name: string;
  /** Arguments to pass to the tool. */
  readonly args: Readonly<Record<string, unknown>>;
}

/**
 * A reply value or a function that produces one. Async functions are supported.
 *
 * @example
 * ```ts
 * server.when("echo").reply((req) => `You said: ${req.lastMessage}`);
 * server.when("slow").reply(async (req) => {
 *   return { text: "Done thinking." };
 * });
 * ```
 */
export type Resolver = Reply | ((req: MockRequest) => Reply | Promise<Reply>);

/** Per-rule streaming options. Merged with server-level defaults, with per-rule values winning. */
export interface ReplyOptions {
  /** Milliseconds to wait between SSE chunks. */
  readonly latency?: number | undefined;
  /** Split text into chunks of this many characters for more realistic streaming. */
  readonly chunkSize?: number | undefined;
}

/**
 * A single entry in a reply sequence. Can be a plain reply or a reply with per-step options.
 *
 * @example
 * ```ts
 * server.when("step").replySequence([
 *   "Starting.",
 *   { reply: "Done.", options: { latency: 100 } },
 * ]);
 * ```
 */
export type SequenceEntry =
  | Reply
  | { readonly reply: Reply; readonly options?: ReplyOptions };
