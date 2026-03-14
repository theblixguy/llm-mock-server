import type { MockRequest, Message, ToolDef } from "../../types.js";
import { buildMockRequest, type RequestMeta } from "../parse-helpers.js";
import { AnthropicRequestSchema, type AnthropicRequest } from "./schema.js";

function extractSystem(system: AnthropicRequest["system"]): Message[] {
  if (system == null) return [];
  if (typeof system === "string") return system ? [{ role: "system", content: system }] : [];
  const text = system.map((b) => b.text).join("\n");
  return text ? [{ role: "system", content: text }] : [];
}

function extractContent(content: AnthropicRequest["messages"][number]["content"]): { content: string; toolCallId?: string | undefined } {
  if (typeof content === "string") return { content };
  const text = content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  const toolResult = content.find((b) => b.type === "tool_result");
  const toolCallId = toolResult?.type === "tool_result" ? toolResult.tool_use_id : undefined;
  return { content: text, toolCallId };
}

function parseMessages(req: AnthropicRequest): readonly Message[] {
  const system = extractSystem(req.system);
  const conversation = req.messages.map((m) => {
    const extracted = extractContent(m.content);
    return {
      role: m.role,
      content: extracted.content,
      ...(extracted.toolCallId !== undefined && { toolCallId: extracted.toolCallId }),
    };
  });
  return [...system, ...conversation];
}

function parseTools(req: AnthropicRequest): readonly ToolDef[] | undefined {
  if (!req.tools) return undefined;
  return req.tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.input_schema,
  }));
}

export function parseRequest(body: unknown, meta?: RequestMeta): MockRequest {
  const req = AnthropicRequestSchema.parse(body);
  return buildMockRequest("anthropic", req, parseMessages(req), parseTools(req), "claude-sonnet-4-6", body, meta);
}
