/** The LLM API wire format that was detected for a request. */
export type FormatName = "openai" | "anthropic" | "responses";

/** A normalised view of an incoming request, regardless of the original wire format. */
export interface MockRequest {
  readonly format: FormatName;
  readonly model: string;
  readonly streaming: boolean;
  /** Full conversation, normalised from whatever format came in. */
  readonly messages: readonly Message[];
  /** The last user message's text. This is what most matchers check. */
  readonly lastMessage: string;
  /** Empty string if there wasn't one. */
  readonly systemMessage: string;
  readonly tools?: readonly ToolDef[] | undefined;
  /** Pulled out from `tools` for quick lookups. */
  readonly toolNames: readonly string[];
  /** Set when the last message was a tool result. */
  readonly lastToolCallId: string | undefined;
  /** The raw request body, for anything we don't extract. */
  readonly raw: unknown;
  readonly headers: Readonly<Record<string, string | undefined>>;
  /** e.g. `/v1/chat/completions` */
  readonly path: string;
}

/** A single conversation message, normalised across all supported formats. */
export interface Message {
  readonly role: "system" | "user" | "assistant" | "tool";
  readonly content: string;
  /** Links the result back to its tool call. Only set on `"tool"` messages. */
  readonly toolCallId?: string | undefined;
}

/** A tool definition from the request's `tools` array, normalised across formats. */
export interface ToolDef {
  readonly name: string;
  readonly description?: string | undefined;
  /** JSON Schema, passed through as-is. */
  readonly parameters?: unknown;
}
