import { describe, it, expect } from "vitest";
import { anthropicFormat } from "../../src/formats/anthropic/index.js";
import type {
  AnthropicMessageStart, AnthropicBlockEvent, AnthropicDelta,
  AnthropicComplete, AnthropicError,
} from "../../src/formats/anthropic/schema.js";

function parse<T>(chunk: { data: string }): T {
  return JSON.parse(chunk.data) as T;
}

describe("Anthropic Format", () => {
  describe("parseRequest", () => {
    it("parses messages with top-level system", () => {
      const req = anthropicFormat.parseRequest({
        model: "claude-sonnet-4-6",
        system: "You are a pirate",
        messages: [{ role: "user", content: "Hello" }],
        max_tokens: 1024,
        stream: true,
      });
      expect(req.format).toBe("anthropic");
      expect(req.model).toBe("claude-sonnet-4-6");
      expect(req.systemMessage).toBe("You are a pirate");
      expect(req.lastMessage).toBe("Hello");
      expect(req.messages).toHaveLength(2);
    });

    it("parses system as array of blocks", () => {
      const req = anthropicFormat.parseRequest({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: [{ type: "text", text: "Be helpful" }],
        messages: [{ role: "user", content: "hi" }],
      });
      expect(req.systemMessage).toBe("Be helpful");
    });

    it("parses content block arrays in messages", () => {
      const req = anthropicFormat.parseRequest({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: [{ role: "user", content: [{ type: "text", text: "Hello there" }] }],
      });
      expect(req.lastMessage).toBe("Hello there");
    });

    it("parses tools with input_schema", () => {
      const req = anthropicFormat.parseRequest({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: [{ role: "user", content: "read file" }],
        tools: [{ name: "read_file", description: "Read", input_schema: { type: "object" } }],
      });
      expect(req.tools).toHaveLength(1);
      expect(req.tools![0]!.name).toBe("read_file");
    });

    it("extracts toolNames from tools array", () => {
      const req = anthropicFormat.parseRequest({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: [{ role: "user", content: "hi" }],
        tools: [
          { name: "get_weather", input_schema: {} },
          { name: "search", input_schema: {} },
        ],
      });
      expect(req.toolNames).toEqual(["get_weather", "search"]);
    });

    it("extracts lastToolCallId from tool_result blocks", () => {
      const req = anthropicFormat.parseRequest({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: [
          { role: "user", content: "hi" },
          { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_123", content: "result" }] },
        ],
      });
      expect(req.lastToolCallId).toBe("toolu_123");
    });
  });

  describe("serialize (streaming)", () => {
    it("produces correct event sequence for text", () => {
      const chunks = anthropicFormat.serialize({ text: "Hello" }, "claude-sonnet-4-6");
      const events = chunks.map((c) => c.event);
      expect(events).toEqual([
        "message_start",
        "content_block_start",
        "content_block_delta",
        "content_block_stop",
        "message_delta",
        "message_stop",
      ]);
    });

    it("message_start contains correct structure", () => {
      const chunks = anthropicFormat.serialize({ text: "Hello" }, "claude-sonnet-4-6");
      const msg = parse<AnthropicMessageStart>(chunks[0]!);
      expect(msg.message).toMatchObject({
        type: "message",
        role: "assistant",
        model: "claude-sonnet-4-6",
        content: [],
        stop_reason: null,
      });
      expect(msg.message.usage.input_tokens).toBeTypeOf("number");
      expect(msg.message.usage.output_tokens).toBe(0);
    });

    it("text block uses index 0 when no reasoning", () => {
      const chunks = anthropicFormat.serialize({ text: "Hello" }, "claude-sonnet-4-6");
      const blockStart = chunks.find((c) => c.event === "content_block_start");
      const data = parse<AnthropicBlockEvent>(blockStart!);
      expect(data.index).toBe(0);
      expect(data.content_block?.type).toBe("text");
    });

    it("thinking block at index 0 and text block at index 1 when reasoning present", () => {
      const chunks = anthropicFormat.serialize(
        { text: "42", reasoning: "Let me think" },
        "claude-sonnet-4-6",
      );
      const blockStarts = chunks
        .filter((c) => c.event === "content_block_start")
        .map((c) => parse<AnthropicBlockEvent>(c));

      expect(blockStarts[0]!.index).toBe(0);
      expect(blockStarts[0]!.content_block?.type).toBe("thinking");
      expect(blockStarts[1]!.index).toBe(1);
      expect(blockStarts[1]!.content_block?.type).toBe("text");
    });

    it("thinking delta has correct type and content", () => {
      const chunks = anthropicFormat.serialize(
        { text: "42", reasoning: "Let me think" },
        "claude-sonnet-4-6",
      );
      const thinkingDelta = chunks.find((c) => {
        if (c.event !== "content_block_delta") return false;
        return parse<AnthropicBlockEvent>(c).delta?.type === "thinking_delta";
      });
      expect(thinkingDelta).toBeDefined();
      expect(parse<AnthropicBlockEvent>(thinkingDelta!).delta?.thinking).toBe("Let me think");
    });

    it("closes thinking block before text block starts", () => {
      const chunks = anthropicFormat.serialize(
        { text: "answer", reasoning: "think" },
        "claude-sonnet-4-6",
      );
      const events = chunks.map((c) => ({ event: c.event, data: parse<AnthropicBlockEvent>(c) }));
      const thinkingStop = events.findIndex((e) => e.event === "content_block_stop" && e.data.index === 0);
      const textStart = events.findIndex((e) => e.event === "content_block_start" && e.data.content_block?.type === "text");
      expect(thinkingStop).toBeLessThan(textStart);
    });

    it("includes tool_use blocks with correct structure", () => {
      const chunks = anthropicFormat.serialize(
        { tools: [{ name: "read_file", args: { path: "/tmp" } }] },
        "claude-sonnet-4-6",
      );
      const toolStart = chunks.find((c) => {
        if (c.event !== "content_block_start") return false;
        return parse<AnthropicBlockEvent>(c).content_block?.type === "tool_use";
      });
      expect(toolStart).toBeDefined();
      const block = parse<AnthropicBlockEvent>(toolStart!).content_block!;
      expect(block.name).toBe("read_file");
      expect(block.id).toBeTypeOf("string");
      expect(block.input).toEqual({});
    });

    it("sets stop_reason to tool_use when tools present", () => {
      const chunks = anthropicFormat.serialize(
        { tools: [{ name: "read_file", args: {} }] },
        "claude-sonnet-4-6",
      );
      const delta = chunks.find((c) => c.event === "message_delta");
      expect(parse<AnthropicDelta>(delta!).delta).toMatchObject({ stop_reason: "tool_use" });
    });

    it("includes stop_sequence: null in message_delta", () => {
      const chunks = anthropicFormat.serialize({ text: "Hello" }, "claude-sonnet-4-6");
      const delta = chunks.find((c) => c.event === "message_delta");
      expect(parse<AnthropicDelta>(delta!).delta.stop_sequence).toBeNull();
    });

    it("message_delta includes output_tokens in usage", () => {
      const chunks = anthropicFormat.serialize({ text: "Hello", usage: { input: 20, output: 15 } }, "claude-sonnet-4-6");
      const delta = chunks.find((c) => c.event === "message_delta");
      expect(parse<AnthropicDelta>(delta!).usage.output_tokens).toBe(15);
    });
  });

  describe("serializeComplete (non-streaming)", () => {
    it("produces correct top-level structure", () => {
      const result = anthropicFormat.serializeComplete({ text: "Hello" }, "claude-sonnet-4-6") as AnthropicComplete;
      expect(result.type).toBe("message");
      expect(result.role).toBe("assistant");
      expect(result.model).toBe("claude-sonnet-4-6");
      expect(result.stop_reason).toBe("end_turn");
      expect(result.stop_sequence).toBeNull();
    });

    it("includes text content block", () => {
      const result = anthropicFormat.serializeComplete({ text: "Hello, world!" }, "claude-sonnet-4-6") as AnthropicComplete;
      expect(result.content[0]).toMatchObject({ type: "text", text: "Hello, world!" });
    });

    it("includes thinking before text when reasoning provided", () => {
      const result = anthropicFormat.serializeComplete(
        { text: "42", reasoning: "Thinking..." },
        "claude-sonnet-4-6",
      ) as AnthropicComplete;
      expect(result.content[0]!.type).toBe("thinking");
      expect(result.content[0]!.thinking).toBe("Thinking...");
      expect(result.content[1]!.type).toBe("text");
    });

    it("includes tool_use with correct structure", () => {
      const result = anthropicFormat.serializeComplete(
        { tools: [{ name: "read_file", args: { path: "/tmp" } }] },
        "claude-sonnet-4-6",
      ) as AnthropicComplete;
      const tool = result.content.find((c) => c.type === "tool_use");
      if (!tool) throw new Error("expected tool_use content block");
      expect(tool.name).toBe("read_file");
      expect(tool.input).toEqual({ path: "/tmp" });
      expect(tool.id).toBeTypeOf("string");
    });

    it("sets stop_reason to tool_use when tools present", () => {
      const result = anthropicFormat.serializeComplete(
        { tools: [{ name: "read_file", args: {} }] },
        "claude-sonnet-4-6",
      ) as AnthropicComplete;
      expect(result.stop_reason).toBe("tool_use");
    });

    it("includes usage tokens", () => {
      const result = anthropicFormat.serializeComplete(
        { text: "hi", usage: { input: 20, output: 15 } },
        "claude-sonnet-4-6",
      ) as AnthropicComplete;
      expect(result.usage).toEqual({ input_tokens: 20, output_tokens: 15 });
    });
  });

  describe("serializeError", () => {
    it("produces Anthropic error format", () => {
      const result = anthropicFormat.serializeError({ status: 400, message: "Bad request", type: "invalid_request_error" }) as AnthropicError;
      expect(result.type).toBe("error");
      expect(result.error.type).toBe("invalid_request_error");
      expect(result.error.message).toBe("Bad request");
    });
  });
});
