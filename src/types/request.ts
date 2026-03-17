/** The LLM API wire format that was detected for a request. */
export type FormatName = "openai" | "anthropic" | "responses";

/**
 * A normalised view of an incoming request, regardless of the original wire format.
 * This is what rule matchers and resolvers receive.
 */
export interface MockRequest {
  /** Which API format route the request came in on. */
  readonly format: FormatName;
  /** The model string from the request, e.g. `"gpt-5.4"` or `"claude-sonnet-4-6"`. */
  readonly model: string;
  /** Whether the client asked for SSE streaming (`stream` field, defaults to `true`). */
  readonly streaming: boolean;
  /** Full conversation, normalised from whatever format came in. */
  readonly messages: readonly Message[];
  /** The last user message's text. This is what most matchers check. */
  readonly lastMessage: string;
  /** System prompt text, or empty string if there wasn't one. */
  readonly systemMessage: string;
  /** Tool definitions from the request, if any were sent. */
  readonly tools?: readonly ToolDef[] | undefined;
  /** Tool names pulled out from `tools` for quick lookups via `whenTool()`. */
  readonly toolNames: readonly string[];
  /** Set when the last message was a tool result. Used by `whenToolResult()`. */
  readonly lastToolCallId: string | undefined;
  /** The raw request body, for anything we don't extract. */
  readonly raw: unknown;
  /** HTTP headers from the incoming request. */
  readonly headers: Readonly<Record<string, string | undefined>>;
  /** The URL path that was hit, e.g. `/v1/chat/completions`. */
  readonly path: string;
}

/** A single conversation message, normalised across all supported formats. */
export interface Message {
  /** The role of the message sender. */
  readonly role: "system" | "user" | "assistant" | "tool";
  /** The text content of the message. */
  readonly content: string;
  /** Links the result back to its tool call. Only set on `"tool"` messages. */
  readonly toolCallId?: string | undefined;
}

/** A tool definition from the request's `tools` array, normalised across formats. */
export interface ToolDef {
  /** The tool function name. */
  readonly name: string;
  /** A description of what the tool does. */
  readonly description?: string | undefined;
  /** JSON Schema for the tool's parameters, passed through as-is. */
  readonly parameters?: unknown;
}
