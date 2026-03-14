import { describe, it, expect } from "vitest";
import { OpenAIRequestSchema } from "../../src/formats/openai/schema.js";

describe("OpenAIRequestSchema", () => {
  const validRequest = {
    model: "gpt-5.4",
    messages: [{ role: "user", content: "Hello" }],
  };

  it("accepts a valid minimal request", () => {
    expect(OpenAIRequestSchema.safeParse(validRequest).success).toBe(true);
  });

  it("rejects missing model", () => {
    expect(OpenAIRequestSchema.safeParse({
      messages: [{ role: "user", content: "Hello" }],
    }).success).toBe(false);
  });

  it("rejects empty model string", () => {
    expect(OpenAIRequestSchema.safeParse({
      model: "",
      messages: [{ role: "user", content: "Hello" }],
    }).success).toBe(false);
  });

  it("rejects empty messages array", () => {
    expect(OpenAIRequestSchema.safeParse({
      model: "gpt-5.4",
      messages: [],
    }).success).toBe(false);
  });

  it("rejects missing messages", () => {
    expect(OpenAIRequestSchema.safeParse({
      model: "gpt-5.4",
    }).success).toBe(false);
  });

  it("accepts array content format in messages", () => {
    expect(OpenAIRequestSchema.safeParse({
      model: "gpt-5.4",
      messages: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
    }).success).toBe(true);
  });

  it("accepts null content", () => {
    expect(OpenAIRequestSchema.safeParse({
      model: "gpt-5.4",
      messages: [{ role: "assistant", content: null }],
    }).success).toBe(true);
  });

  it("accepts optional fields", () => {
    expect(OpenAIRequestSchema.safeParse({
      ...validRequest,
      temperature: 0.7,
      top_p: 0.9,
      max_tokens: 100,
      presence_penalty: 0.5,
      frequency_penalty: 0.5,
      user: "test-user",
    }).success).toBe(true);
  });

  it("accepts tools array", () => {
    expect(OpenAIRequestSchema.safeParse({
      ...validRequest,
      tools: [{
        type: "function",
        function: {
          name: "get_weather",
          description: "Get the weather",
          parameters: { type: "object", properties: {} },
        },
      }],
    }).success).toBe(true);
  });

  it("accepts stream: true", () => {
    const result = OpenAIRequestSchema.safeParse({ ...validRequest, stream: true });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.stream).toBe(true);
  });

  it("accepts stream: false", () => {
    const result = OpenAIRequestSchema.safeParse({ ...validRequest, stream: false });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.stream).toBe(false);
  });

  it("accepts messages with tool_calls", () => {
    expect(OpenAIRequestSchema.safeParse({
      model: "gpt-5.4",
      messages: [{
        role: "assistant",
        tool_calls: [{
          id: "call_1",
          type: "function",
          function: { name: "search", arguments: "{}" },
        }],
      }],
    }).success).toBe(true);
  });
});
