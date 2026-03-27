import type { MockRequest, Message, ToolDef } from "#/types/request.js";
import {
  buildMockRequest,
  type RequestMeta,
} from "#/formats/request-helpers.js";
import {
  ResponsesRequestSchema,
  FunctionToolSchema,
  type ResponsesRequest,
} from "./schema.js";

function extractInputContent(
  content: string | Record<string, unknown>[],
): string {
  if (typeof content === "string") return content;
  return content
    .filter((b) => b["type"] === "input_text" || b["type"] === "text")
    .map((b) => String(b["text"] ?? ""))
    .join("\n");
}

function parseInput(req: ResponsesRequest): readonly Message[] {
  const instructions: Message[] = req.instructions
    ? [{ role: "system", content: req.instructions }]
    : [];

  if (req.input === undefined) return instructions;

  if (typeof req.input === "string") {
    return [...instructions, { role: "user", content: req.input }];
  }

  const messages = req.input.map((item): Message => {
    if ("call_id" in item) {
      return {
        role: "tool",
        content: "output" in item ? item.output : item.arguments,
        toolCallId: item.call_id,
      };
    }
    return {
      role: item.role === "developer" ? "system" : item.role,
      content: extractInputContent(item.content),
    };
  });

  return [...instructions, ...messages];
}

function parseTools(req: ResponsesRequest): readonly ToolDef[] | undefined {
  if (!req.tools) return undefined;
  return req.tools
    .map((t) => FunctionToolSchema.safeParse(t))
    .filter((r) => r.success)
    .map((r) => ({
      name: r.data.name,
      description: r.data.description,
      parameters: r.data.parameters,
    }));
}

export function parseRequest(body: unknown, meta?: RequestMeta): MockRequest {
  const req = ResponsesRequestSchema.parse(body);
  return buildMockRequest(
    "responses",
    req,
    parseInput(req),
    parseTools(req),
    "codex-mini",
    body,
    meta,
  );
}
