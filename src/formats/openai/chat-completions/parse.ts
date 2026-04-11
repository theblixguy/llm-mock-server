import type { MockRequest, Message, ToolDef } from "#types/request.js";
import {
  buildMockRequest,
  type RequestMeta,
} from "#formats/request-helpers.js";
import { OpenAIRequestSchema, type OpenAIRequest } from "./schema.js";

function extractContent(
  content: OpenAIRequest["messages"][number]["content"],
): string {
  if (content == null) return "";
  if (typeof content === "string") return content;
  return content
    .filter((p) => p.type === "text" && p.text !== undefined)
    .map((p) => p.text!)
    .join("\n");
}

function parseMessages(req: OpenAIRequest): readonly Message[] {
  return req.messages.map((m) => ({
    role: m.role === "developer" ? "system" : (m.role ?? "user"),
    content: extractContent(m.content),
    ...(m.tool_call_id !== undefined && { toolCallId: m.tool_call_id }),
  }));
}

function parseTools(req: OpenAIRequest): readonly ToolDef[] | undefined {
  if (!req.tools) return undefined;
  return req.tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    parameters: t.function.parameters,
  }));
}

export function parseRequest(body: unknown, meta?: RequestMeta): MockRequest {
  const req = OpenAIRequestSchema.parse(body);
  return buildMockRequest(
    "openai",
    req,
    parseMessages(req),
    parseTools(req),
    "gpt-5.4",
    body,
    meta,
  );
}
