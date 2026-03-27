import type {
  FormatName,
  Message,
  MockRequest,
  ToolDef,
} from "#/types/request.js";

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body === "object" && body !== null)
    return body as Record<string, unknown>;
  return {};
}

export function isStreaming(body: unknown): boolean {
  return asRecord(body)["stream"] !== false;
}

export interface RequestMeta {
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly path: string;
}

const EMPTY_META: RequestMeta = { headers: {}, path: "" };

interface ParsedBody {
  readonly model?: string | undefined;
  readonly stream?: boolean | undefined;
}

export function buildMockRequest(
  format: FormatName,
  body: ParsedBody,
  messages: readonly Message[],
  tools: readonly ToolDef[] | undefined,
  defaultModel: string,
  raw: unknown,
  meta: RequestMeta = EMPTY_META,
): MockRequest {
  const userMessages = messages.filter((m) => m.role === "user");
  const toolCallMsgs = messages.filter((m) => m.toolCallId !== undefined);

  return {
    format,
    model: body.model || defaultModel,
    streaming: body.stream !== false,
    messages,
    lastMessage: userMessages.at(-1)?.content ?? "",
    systemMessage: messages.find((m) => m.role === "system")?.content ?? "",
    tools,
    toolNames: tools?.map((t) => t.name) ?? [],
    lastToolCallId: toolCallMsgs.at(-1)?.toolCallId,
    raw,
    headers: meta.headers,
    path: meta.path,
  };
}
