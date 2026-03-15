import { describe, expect, it } from "vitest";
import {
  splitText,
  genId,
  toolId,
  shouldEmitText,
  finishReason,
  MS_PER_SECOND,
  DEFAULT_USAGE,
} from "../../src/formats/serialize-helpers.js";
import {
  isStreaming,
  buildMockRequest,
} from "../../src/formats/request-helpers.js";
import type { ReplyObject } from "../../src/types.js";

describe("parse-helpers", () => {
  describe("constants", () => {
    it("MS_PER_SECOND is 1000", () => {
      expect(MS_PER_SECOND).toBe(1000);
    });

    it("DEFAULT_USAGE has expected shape", () => {
      expect(DEFAULT_USAGE).toEqual({ input: 10, output: 5 });
    });
  });

  describe("splitText", () => {
    it("returns the full string when chunkSize is 0", () => {
      expect(splitText("hello", 0)).toEqual(["hello"]);
    });

    it("returns the full string when chunkSize is negative", () => {
      expect(splitText("hello", -1)).toEqual(["hello"]);
    });

    it("returns the full string when text fits in one chunk", () => {
      expect(splitText("hello", 10)).toEqual(["hello"]);
    });

    it("returns the full string when chunkSize equals text length", () => {
      expect(splitText("hello", 5)).toEqual(["hello"]);
    });

    it("splits text into equal chunks", () => {
      expect(splitText("abcdef", 2)).toEqual(["ab", "cd", "ef"]);
    });

    it("handles a remainder chunk", () => {
      expect(splitText("abcde", 2)).toEqual(["ab", "cd", "e"]);
    });

    it("splits into single characters with chunkSize 1", () => {
      expect(splitText("abc", 1)).toEqual(["a", "b", "c"]);
    });

    it("returns single-element array for empty string", () => {
      expect(splitText("", 5)).toEqual([""]);
    });
  });

  describe("genId", () => {
    it("starts with the given prefix", () => {
      const id = genId("chatcmpl");
      expect(id).toMatch(/^chatcmpl_/);
    });

    it("generates unique ids", () => {
      const a = genId("msg");
      const b = genId("msg");
      // Could collide if Date.now() returns the same ms, but format is still valid
      expect(a).toMatch(/^msg_[a-z0-9]+$/);
      expect(b).toMatch(/^msg_[a-z0-9]+$/);
    });
  });

  describe("toolId", () => {
    it("uses the tool's own id when present", () => {
      expect(toolId({ id: "call_abc" }, "call", 0)).toBe("call_abc");
    });

    it("generates an id when tool has no id", () => {
      const id = toolId({}, "call", 2);
      expect(id).toMatch(/^call_[a-z0-9]+_2$/);
    });

    it("generates an id when tool id is undefined", () => {
      const id = toolId({ id: undefined }, "call", 0);
      expect(id).toMatch(/^call_[a-z0-9]+_0$/);
    });
  });

  describe("shouldEmitText", () => {
    it("returns true when reply has text", () => {
      expect(shouldEmitText({ text: "hello" })).toBe(true);
    });

    it("returns true when reply has no text, no tools, no reasoning", () => {
      expect(shouldEmitText({})).toBe(true);
    });

    it("returns false when reply has only tools", () => {
      expect(shouldEmitText({ tools: [{ name: "fn", args: {} }] })).toBe(false);
    });

    it("returns false when reply has only reasoning", () => {
      expect(shouldEmitText({ reasoning: "thinking..." })).toBe(false);
    });

    it("returns true when reply has text and tools", () => {
      expect(shouldEmitText({ text: "hi", tools: [{ name: "fn", args: {} }] })).toBe(true);
    });

    it("returns true for empty text with no tools or reasoning", () => {
      expect(shouldEmitText({ text: "" })).toBe(true);
    });
  });

  describe("finishReason", () => {
    it("returns onTools when tools are present", () => {
      const reply: ReplyObject = { tools: [{ name: "fn", args: {} }] };
      expect(finishReason(reply, "tool_calls", "stop")).toBe("tool_calls");
    });

    it("returns onStop when no tools", () => {
      expect(finishReason({ text: "hi" }, "tool_calls", "stop")).toBe("stop");
    });

    it("returns onStop when tools array is empty", () => {
      expect(finishReason({ tools: [] }, "tool_calls", "stop")).toBe("stop");
    });

    it("returns onStop when tools is undefined", () => {
      expect(finishReason({}, "tool_calls", "stop")).toBe("stop");
    });
  });

  describe("isStreaming", () => {
    it("returns true when stream is true", () => {
      expect(isStreaming({ stream: true })).toBe(true);
    });

    it("returns false when stream is false", () => {
      expect(isStreaming({ stream: false })).toBe(false);
    });

    it("returns true when stream is absent", () => {
      expect(isStreaming({})).toBe(true);
    });

    it("returns true for null body", () => {
      expect(isStreaming(null)).toBe(true);
    });

    it("returns true for non-object body", () => {
      expect(isStreaming("not an object")).toBe(true);
    });

    it("returns true for undefined body", () => {
      expect(isStreaming(undefined)).toBe(true);
    });
  });

  describe("buildMockRequest", () => {
    it("builds a minimal request with defaults", () => {
      const result = buildMockRequest(
        "openai",
        {},
        [{ role: "user", content: "hello" }],
        undefined,
        "gpt-4",
        { messages: [] },
      );

      expect(result.format).toBe("openai");
      expect(result.model).toBe("gpt-4");
      expect(result.streaming).toBe(true);
      expect(result.lastMessage).toBe("hello");
      expect(result.systemMessage).toBe("");
      expect(result.tools).toBeUndefined();
      expect(result.toolNames).toEqual([]);
      expect(result.lastToolCallId).toBeUndefined();
      expect(result.headers).toEqual({});
      expect(result.path).toBe("");
    });

    it("uses model from body when provided", () => {
      const result = buildMockRequest(
        "anthropic",
        { model: "claude-sonnet" },
        [],
        undefined,
        "default-model",
        {},
      );
      expect(result.model).toBe("claude-sonnet");
    });

    it("falls back to default model when body model is empty string", () => {
      const result = buildMockRequest(
        "openai",
        { model: "" },
        [],
        undefined,
        "gpt-4",
        {},
      );
      expect(result.model).toBe("gpt-4");
    });

    it("extracts last user message", () => {
      const messages = [
        { role: "user" as const, content: "first" },
        { role: "assistant" as const, content: "reply" },
        { role: "user" as const, content: "second" },
      ];
      const result = buildMockRequest("openai", {}, messages, undefined, "m", {});
      expect(result.lastMessage).toBe("second");
    });

    it("extracts system message", () => {
      const messages = [
        { role: "system" as const, content: "be helpful" },
        { role: "user" as const, content: "hi" },
      ];
      const result = buildMockRequest("openai", {}, messages, undefined, "m", {});
      expect(result.systemMessage).toBe("be helpful");
    });

    it("extracts tool names", () => {
      const tools = [
        { name: "get_weather", parameters: {} },
        { name: "search", parameters: {} },
      ];
      const result = buildMockRequest("openai", {}, [], tools, "m", {});
      expect(result.toolNames).toEqual(["get_weather", "search"]);
    });

    it("extracts last tool call id", () => {
      const messages = [
        { role: "tool" as const, content: "result1", toolCallId: "call_1" },
        { role: "tool" as const, content: "result2", toolCallId: "call_2" },
      ];
      const result = buildMockRequest("openai", {}, messages, undefined, "m", {});
      expect(result.lastToolCallId).toBe("call_2");
    });

    it("sets streaming to false when stream is false", () => {
      const result = buildMockRequest("openai", { stream: false }, [], undefined, "m", {});
      expect(result.streaming).toBe(false);
    });

    it("uses provided meta for headers and path", () => {
      const meta = {
        headers: { authorization: "Bearer sk-test" },
        path: "/v1/chat/completions",
      };
      const result = buildMockRequest("openai", {}, [], undefined, "m", {}, meta);
      expect(result.headers).toEqual({ authorization: "Bearer sk-test" });
      expect(result.path).toBe("/v1/chat/completions");
    });

    it("returns empty lastMessage when no user messages", () => {
      const result = buildMockRequest(
        "openai",
        {},
        [{ role: "system" as const, content: "sys" }],
        undefined,
        "m",
        {},
      );
      expect(result.lastMessage).toBe("");
    });
  });
});
