import { describe, it, expect } from "vitest";
import { AnthropicRequestSchema } from "../../src/formats/anthropic/schema.js";

describe("AnthropicRequestSchema", () => {
  const validRequest = {
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{ role: "user", content: "Hello" }],
  };

  it("accepts a valid minimal request", () => {
    expect(AnthropicRequestSchema.safeParse(validRequest).success).toBe(true);
  });

  it("rejects missing model", () => {
    const { model: _model, ...rest } = validRequest;
    expect(AnthropicRequestSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects empty model string", () => {
    expect(AnthropicRequestSchema.safeParse({
      ...validRequest, model: "",
    }).success).toBe(false);
  });

  it("rejects missing max_tokens", () => {
    const { max_tokens: _mt, ...rest } = validRequest;
    expect(AnthropicRequestSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects non-positive max_tokens", () => {
    expect(AnthropicRequestSchema.safeParse({ ...validRequest, max_tokens: 0 }).success).toBe(false);
    expect(AnthropicRequestSchema.safeParse({ ...validRequest, max_tokens: -1 }).success).toBe(false);
  });

  it("rejects empty messages array", () => {
    expect(AnthropicRequestSchema.safeParse({ ...validRequest, messages: [] }).success).toBe(false);
  });

  it("rejects missing messages", () => {
    const { messages: _m, ...rest } = validRequest;
    expect(AnthropicRequestSchema.safeParse(rest).success).toBe(false);
  });

  it("accepts string content shorthand", () => {
    expect(AnthropicRequestSchema.safeParse(validRequest).success).toBe(true);
  });

  it("accepts array content with text blocks", () => {
    expect(AnthropicRequestSchema.safeParse({
      ...validRequest,
      messages: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
    }).success).toBe(true);
  });

  it("accepts array content with tool_use blocks", () => {
    const result = AnthropicRequestSchema.safeParse({
      ...validRequest,
      messages: [{
        role: "assistant",
        content: [{
          type: "tool_use", id: "toolu_01", name: "get_weather", input: { location: "SF" },
        }],
      }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.messages[0]!.content).toEqual([
        { type: "tool_use", id: "toolu_01", name: "get_weather", input: { location: "SF" } },
      ]);
    }
  });

  it("accepts tool_result blocks with string content", () => {
    expect(AnthropicRequestSchema.safeParse({
      ...validRequest,
      messages: [{
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "toolu_01", content: "Sunny, 72F" }],
      }],
    }).success).toBe(true);
  });

  it("accepts tool_result blocks with TextBlock[] content", () => {
    expect(AnthropicRequestSchema.safeParse({
      ...validRequest,
      messages: [{
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "toolu_02", content: [{ type: "text", text: "Result" }] }],
      }],
    }).success).toBe(true);
  });

  it("accepts mixed content blocks in a single message", () => {
    const result = AnthropicRequestSchema.safeParse({
      ...validRequest,
      messages: [{
        role: "assistant",
        content: [
          { type: "text", text: "Let me check." },
          { type: "tool_use", id: "toolu_01", name: "get_weather", input: { location: "SF" } },
        ],
      }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.messages[0]!.content).toHaveLength(2);
    }
  });

  it("filters out unknown content block types", () => {
    const result = AnthropicRequestSchema.safeParse({
      ...validRequest,
      messages: [{
        role: "assistant",
        content: [
          { type: "thinking", thinking: "Let me consider..." },
          { type: "text", text: "Here is my answer." },
        ],
      }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const blocks = result.data.messages[0]!.content;
      expect(blocks).toHaveLength(1);
      expect(blocks).toEqual([{ type: "text", text: "Here is my answer." }]);
    }
  });

  it("accepts a message where all blocks are unknown", () => {
    const result = AnthropicRequestSchema.safeParse({
      ...validRequest,
      messages: [{
        role: "assistant",
        content: [
          { type: "thinking", thinking: "hmm" },
          { type: "server_tool_use", id: "st_01", name: "web_search" },
        ],
      }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.messages[0]!.content).toHaveLength(0);
    }
  });

  it("accepts system as string", () => {
    expect(AnthropicRequestSchema.safeParse({
      ...validRequest, system: "You are a helpful assistant.",
    }).success).toBe(true);
  });

  it("accepts system as TextBlock array", () => {
    expect(AnthropicRequestSchema.safeParse({
      ...validRequest, system: [{ type: "text", text: "You are a helpful assistant." }],
    }).success).toBe(true);
  });

  it("accepts stream: true", () => {
    const result = AnthropicRequestSchema.safeParse({ ...validRequest, stream: true });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.stream).toBe(true);
  });

  it("accepts stream: false", () => {
    const result = AnthropicRequestSchema.safeParse({ ...validRequest, stream: false });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.stream).toBe(false);
  });

  it("accepts optional fields", () => {
    expect(AnthropicRequestSchema.safeParse({
      ...validRequest,
      temperature: 0.7,
      top_p: 0.9,
      top_k: 40,
      stop_sequences: ["Human:"],
      metadata: { user_id: "test" },
    }).success).toBe(true);
  });

  it("accepts tools array", () => {
    expect(AnthropicRequestSchema.safeParse({
      ...validRequest,
      tools: [{
        name: "get_weather",
        description: "Get the weather",
        input_schema: { type: "object", properties: { location: { type: "string" } } },
      }],
    }).success).toBe(true);
  });
});
