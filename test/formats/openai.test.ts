import { describe, it, expect } from "vitest";
import { openaiFormat } from "../../src/formats/openai/index.js";
import type { OpenAIChunk, OpenAIComplete, OpenAIError } from "../../src/formats/openai/schema.js";

function parse<T>(chunk: { data: string }): T {
  return JSON.parse(chunk.data) as T;
}

describe("OpenAI Format", () => {
  describe("parseRequest", () => {
    it("parses a basic chat completion request", () => {
      const req = openaiFormat.parseRequest({
        model: "gpt-5.4",
        messages: [
          { role: "system", content: "You are helpful" },
          { role: "user", content: "Hello" },
        ],
        stream: true,
      });
      expect(req.format).toBe("openai");
      expect(req.model).toBe("gpt-5.4");
      expect(req.streaming).toBe(true);
      expect(req.lastMessage).toBe("Hello");
      expect(req.systemMessage).toBe("You are helpful");
      expect(req.messages).toHaveLength(2);
    });

    it("defaults stream to true", () => {
      const req = openaiFormat.parseRequest({ model: "gpt-5.4", messages: [{ role: "user", content: "hi" }] });
      expect(req.streaming).toBe(true);
    });

    it("detects stream: false", () => {
      const req = openaiFormat.parseRequest({ model: "gpt-5.4", messages: [{ role: "user", content: "hi" }], stream: false });
      expect(req.streaming).toBe(false);
    });

    it("parses tools with function wrapper", () => {
      const req = openaiFormat.parseRequest({
        model: "gpt-5.4",
        messages: [{ role: "user", content: "read file" }],
        tools: [{ type: "function", function: { name: "read_file", description: "Read a file", parameters: {} } }],
      });
      expect(req.tools).toHaveLength(1);
      expect(req.tools![0]!.name).toBe("read_file");
    });

    it("extracts toolNames from tools array", () => {
      const req = openaiFormat.parseRequest({
        model: "gpt-5.4",
        messages: [{ role: "user", content: "hi" }],
        tools: [
          { type: "function", function: { name: "get_weather" } },
          { type: "function", function: { name: "search" } },
        ],
      });
      expect(req.toolNames).toEqual(["get_weather", "search"]);
    });

    it("extracts lastToolCallId from tool messages", () => {
      const req = openaiFormat.parseRequest({
        model: "gpt-5.4",
        messages: [
          { role: "user", content: "hi" },
          { role: "tool", tool_call_id: "call_123", content: "result" },
        ],
      });
      expect(req.lastToolCallId).toBe("call_123");
    });

    it("handles non-string content (array of content parts)", () => {
      const req = openaiFormat.parseRequest({
        model: "gpt-5.4",
        messages: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
      });
      expect(req.lastMessage).toContain("Hello");
    });

    it("rejects requests with invalid role values", () => {
      expect(() => openaiFormat.parseRequest({
        model: "gpt-5.4",
        messages: [{ role: "banana", content: "hi" }],
      })).toThrow();
    });

    it("rejects requests missing model", () => {
      expect(() => openaiFormat.parseRequest({
        messages: [{ role: "user", content: "hi" }],
      })).toThrow();
    });
  });

  describe("serialize (streaming)", () => {
    it("starts with role delta and ends with [DONE]", () => {
      const chunks = openaiFormat.serialize({ text: "Hello world" }, "gpt-5.4");
      const first = parse<OpenAIChunk>(chunks[0]!);
      expect(first.choices[0]!.delta).toEqual({ role: "assistant" });
      expect(chunks.at(-1)!.data).toBe("[DONE]");
    });

    it("content delta has correct structure", () => {
      const chunks = openaiFormat.serialize({ text: "Hello world" }, "gpt-5.4");
      const content = parse<OpenAIChunk>(chunks[1]!);
      expect(content.object).toBe("chat.completion.chunk");
      expect(content.model).toBe("gpt-5.4");
      expect(content.choices[0]!.delta).toEqual({ content: "Hello world" });
      expect(content.choices[0]!.finish_reason).toBeNull();
    });

    it("finish chunk has finish_reason: stop for text", () => {
      const chunks = openaiFormat.serialize({ text: "Hello" }, "gpt-5.4");
      const finish = parse<OpenAIChunk>(chunks.at(-3)!);
      expect(finish.choices[0]!.finish_reason).toBe("stop");
    });

    it("finish chunk has finish_reason: tool_calls for tools", () => {
      const chunks = openaiFormat.serialize(
        { tools: [{ name: "read_file", args: { path: "/tmp" } }] },
        "gpt-5.4",
      );
      const finish = parse<OpenAIChunk>(chunks.at(-3)!);
      expect(finish.choices[0]!.finish_reason).toBe("tool_calls");
    });

    it("includes usage chunk before [DONE]", () => {
      const chunks = openaiFormat.serialize({ text: "Hello", usage: { input: 10, output: 5 } }, "gpt-5.4");
      const usageChunk = parse<OpenAIChunk>(chunks.at(-2)!);
      expect(usageChunk.usage).toMatchObject({
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      });
      expect(usageChunk.usage?.completion_tokens_details?.reasoning_tokens).toBe(0);
      expect(usageChunk.usage?.prompt_tokens_details?.cached_tokens).toBe(0);
    });

    it("tool call delta has correct structure", () => {
      const chunks = openaiFormat.serialize(
        { tools: [{ name: "read_file", args: { path: "/tmp" } }] },
        "gpt-5.4",
      );
      const toolChunk = chunks.find((c) => {
        if (c.data === "[DONE]") return false;
        return parse<OpenAIChunk>(c).choices[0]?.delta.tool_calls !== undefined;
      });
      expect(toolChunk).toBeDefined();
      const tc = parse<OpenAIChunk>(toolChunk!).choices[0]!.delta.tool_calls![0]!;
      expect(tc.type).toBe("function");
      expect(tc.id).toBeTypeOf("string");
      expect(tc.function.name).toBe("read_file");
    });

    it("no named events (openai uses data-only SSE)", () => {
      const chunks = openaiFormat.serialize({ text: "hi" }, "gpt-5.4");
      for (const chunk of chunks) {
        expect(chunk.event).toBeUndefined();
      }
    });

    it("splits text into multiple delta chunks with chunkSize", () => {
      const chunks = openaiFormat.serialize({ text: "Hello, world!" }, "gpt-5.4", { chunkSize: 5 });
      const contentDeltas = chunks
        .filter((c) => c.data !== "[DONE]")
        .map((c) => parse<OpenAIChunk>(c))
        .filter((d) => d.choices[0]?.delta.content !== undefined)
        .map((d) => d.choices[0]!.delta.content);
      expect(contentDeltas).toEqual(["Hello", ", wor", "ld!"]);
    });

    it("all chunks share same id and created timestamp", () => {
      const chunks = openaiFormat.serialize({ text: "Hello" }, "gpt-5.4");
      const dataChunks = chunks.filter((c) => c.data !== "[DONE]").map((c) => parse<OpenAIChunk>(c));
      const ids = dataChunks.map((c) => c.id);
      const created = dataChunks.map((c) => c.created);
      expect(new Set(ids).size).toBe(1);
      expect(new Set(created).size).toBe(1);
    });
  });

  describe("serializeComplete (non-streaming)", () => {
    it("produces correct top-level structure", () => {
      const result = openaiFormat.serializeComplete({ text: "Hello, world!" }, "gpt-5.4") as OpenAIComplete;
      expect(result.object).toBe("chat.completion");
      expect(result.model).toBe("gpt-5.4");
      expect(result.id).toBeTypeOf("string");
      expect(result.created).toBeTypeOf("number");
    });

    it("message has correct content and finish_reason", () => {
      const result = openaiFormat.serializeComplete({ text: "Hello, world!" }, "gpt-5.4") as OpenAIComplete;
      expect(result.choices[0]!.message.role).toBe("assistant");
      expect(result.choices[0]!.message.content).toBe("Hello, world!");
      expect(result.choices[0]!.finish_reason).toBe("stop");
    });

    it("includes tool_calls with correct structure", () => {
      const result = openaiFormat.serializeComplete(
        { tools: [{ name: "read_file", args: { path: "/tmp" } }] },
        "gpt-5.4",
      ) as OpenAIComplete;
      expect(result.choices[0]!.finish_reason).toBe("tool_calls");
      const tc = result.choices[0]!.message.tool_calls![0]!;
      expect(tc.type).toBe("function");
      expect(tc.id).toBeTypeOf("string");
      expect(tc.function.name).toBe("read_file");
    });

    it("includes usage tokens with details", () => {
      const result = openaiFormat.serializeComplete(
        { text: "hi", usage: { input: 20, output: 15 } },
        "gpt-5.4",
      ) as OpenAIComplete;
      expect(result.usage).toMatchObject({ prompt_tokens: 20, completion_tokens: 15, total_tokens: 35 });
      expect(result.usage?.completion_tokens_details?.reasoning_tokens).toBe(0);
      expect(result.usage?.prompt_tokens_details?.cached_tokens).toBe(0);
    });

    it("includes service_tier and system_fingerprint", () => {
      const result = openaiFormat.serializeComplete({ text: "hi" }, "gpt-5.4") as OpenAIComplete;
      expect(result.service_tier).toBe("default");
      expect(result.system_fingerprint).toBeNull();
    });

    it("includes logprobs: null on choices", () => {
      const result = openaiFormat.serializeComplete({ text: "hi" }, "gpt-5.4") as OpenAIComplete;
      expect(result.choices[0]!.logprobs).toBeNull();
    });
  });

  describe("serializeError", () => {
    it("produces OpenAI error format", () => {
      const result = openaiFormat.serializeError({ status: 429, message: "Rate limited", type: "rate_limit_error" }) as OpenAIError;
      expect(result.error.message).toBe("Rate limited");
      expect(result.error.type).toBe("rate_limit_error");
      expect(result.error.code).toBeNull();
    });

    it("defaults type to server_error", () => {
      const result = openaiFormat.serializeError({ status: 500, message: "Internal" }) as OpenAIError;
      expect(result.error.type).toBe("server_error");
    });
  });
});
