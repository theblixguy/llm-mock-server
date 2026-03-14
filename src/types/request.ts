/** The LLM API wire format that was detected for a request. */
export type FormatName = "openai" | "anthropic" | "responses";

/** A normalised view of an incoming request, regardless of the original wire format. */
export interface MockRequest {
  /** Which format route the request hit. */
  readonly format: FormatName;
  readonly model: string;
  /** Whether the client asked for SSE streaming. */
  readonly streaming: boolean;
  /** Full conversation, normalised from whatever format came in. */
  readonly messages: readonly Message[];
  /** The last user message's text. This is what most matchers check. */
  readonly lastMessage: string;
  /** System prompt text, or `""` if there wasn't one. */
  readonly systemMessage: string;
  /** Tool definitions from the request, if any were sent. */
  readonly tools?: readonly ToolDef[] | undefined;
  /** The names from `tools`, pulled out for quick lookups. */
  readonly toolNames: readonly string[];
  /** If the last message was a tool result, this is its `tool_call_id`. */
  readonly lastToolCallId: string | undefined;
  /** The raw request body, in case you need something we don't extract. */
  readonly raw: unknown;
  /** HTTP headers from the incoming request. */
  readonly headers: Readonly<Record<string, string | undefined>>;
  /** The URL path that was hit, e.g. `/v1/chat/completions`. */
  readonly path: string;
}

/** A single conversation message, normalised across all supported formats. */
export interface Message {
  readonly role: "system" | "user" | "assistant" | "tool";
  readonly content: string;
  /** Only set on `"tool"` messages. Links the result back to its tool call. */
  readonly toolCallId?: string | undefined;
}

/** A tool definition from the request's `tools` array, normalised across formats. */
export interface ToolDef {
  readonly name: string;
  readonly description?: string | undefined;
  /** JSON Schema for the tool's parameters, passed through as-is. */
  readonly parameters?: unknown;
}
