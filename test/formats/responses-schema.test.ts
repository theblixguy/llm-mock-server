import { describe, it, expect } from "vitest";
import { ResponsesRequestSchema, FunctionToolSchema } from "../../src/formats/responses/schema.js";

describe("ResponsesRequestSchema", () => {
  const validRequest = {
    model: "codex-mini",
    input: "Hello",
  };

  it("accepts a valid minimal request with string input", () => {
    expect(ResponsesRequestSchema.safeParse(validRequest).success).toBe(true);
  });

  it("accepts array input with a user message", () => {
    expect(ResponsesRequestSchema.safeParse({
      model: "codex-mini",
      input: [{ role: "user", content: "Hello" }],
    }).success).toBe(true);
  });

  it("accepts array input with function_call and function_call_output", () => {
    expect(ResponsesRequestSchema.safeParse({
      model: "codex-mini",
      input: [
        { type: "function_call", call_id: "call_1", name: "search", arguments: "{}" },
        { type: "function_call_output", call_id: "call_1", output: "result" },
      ],
    }).success).toBe(true);
  });

  it("accepts missing model", () => {
    expect(ResponsesRequestSchema.safeParse({ input: "Hello" }).success).toBe(true);
  });

  it("rejects empty model string", () => {
    expect(ResponsesRequestSchema.safeParse({ model: "", input: "Hello" }).success).toBe(false);
  });

  it("accepts missing input", () => {
    expect(ResponsesRequestSchema.safeParse({ model: "codex-mini" }).success).toBe(true);
  });

  it("accepts stream: true", () => {
    const result = ResponsesRequestSchema.safeParse({ ...validRequest, stream: true });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.stream).toBe(true);
  });

  it("accepts stream: false", () => {
    const result = ResponsesRequestSchema.safeParse({ ...validRequest, stream: false });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.stream).toBe(false);
  });

  it("accepts optional fields", () => {
    expect(ResponsesRequestSchema.safeParse({
      ...validRequest,
      instructions: "Be helpful",
      temperature: 0.5,
      previous_response_id: "resp_abc",
    }).success).toBe(true);
  });

  it("accepts tools array with function tools", () => {
    expect(ResponsesRequestSchema.safeParse({
      ...validRequest,
      tools: [{
        type: "function",
        name: "search",
        description: "Search the web",
        parameters: { type: "object", properties: {} },
      }],
    }).success).toBe(true);
  });

  it("accepts tools array with non-function tools", () => {
    expect(ResponsesRequestSchema.safeParse({
      ...validRequest,
      tools: [{ type: "web_search" }],
    }).success).toBe(true);
  });

  it("accepts message input with array content", () => {
    expect(ResponsesRequestSchema.safeParse({
      model: "codex-mini",
      input: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
    }).success).toBe(true);
  });
});

describe("FunctionToolSchema", () => {
  it("accepts a valid function tool", () => {
    const result = FunctionToolSchema.safeParse({
      type: "function",
      name: "search",
      description: "Search the web",
      parameters: { type: "object" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a function tool without optional fields", () => {
    const result = FunctionToolSchema.safeParse({ type: "function", name: "run" });
    expect(result.success).toBe(true);
  });

  it("rejects a non-function tool", () => {
    expect(FunctionToolSchema.safeParse({ type: "web_search" }).success).toBe(false);
  });

  it("rejects a tool missing name", () => {
    expect(FunctionToolSchema.safeParse({ type: "function" }).success).toBe(false);
  });
});
