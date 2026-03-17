import { describe, it, expect } from "vitest";
import { responsesFormat } from "../../src/formats/openai/responses/index.js";
import type {
  ResponsesEvent,
  ResponsesComplete,
  ResponsesError,
} from "../../src/formats/openai/responses/schema.js";

function parse<T>(chunk: { data: string }): T {
  return JSON.parse(chunk.data) as T;
}

describe("Responses Format", () => {
  describe("parseRequest", () => {
    it("parses string input", () => {
      const req = responsesFormat.parseRequest({
        model: "codex-mini",
        input: "Hello world",
      });
      expect(req.format).toBe("responses");
      expect(req.model).toBe("codex-mini");
      expect(req.lastMessage).toBe("Hello world");
    });

    it("parses array input with items", () => {
      const req = responsesFormat.parseRequest({
        model: "codex-mini",
        input: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi" },
          { role: "user", content: "How are you?" },
        ],
      });
      expect(req.lastMessage).toBe("How are you?");
      expect(req.messages).toHaveLength(3);
    });

    it("parses instructions as system message", () => {
      const req = responsesFormat.parseRequest({
        model: "codex-mini",
        input: "Hello",
        instructions: "You are a helpful assistant",
      });
      expect(req.systemMessage).toBe("You are a helpful assistant");
    });

    it("parses content block arrays", () => {
      const req = responsesFormat.parseRequest({
        model: "codex-mini",
        input: [
          {
            role: "user",
            content: [{ type: "input_text", text: "Hello there" }],
          },
        ],
      });
      expect(req.lastMessage).toBe("Hello there");
    });

    it("parses tools", () => {
      const req = responsesFormat.parseRequest({
        model: "codex-mini",
        input: "read file",
        tools: [
          {
            type: "function",
            name: "read_file",
            description: "Read",
            parameters: {},
          },
        ],
      });
      expect(req.tools).toHaveLength(1);
      expect(req.toolNames).toEqual(["read_file"]);
    });

    it("extracts lastToolCallId from function_call_output items", () => {
      const req = responsesFormat.parseRequest({
        model: "codex-mini",
        input: [
          { role: "user", content: "hi" },
          {
            type: "function_call_output",
            call_id: "call_abc",
            output: "result",
          },
        ],
      });
      expect(req.lastToolCallId).toBe("call_abc");
    });

    it("handles content blocks with non-text types (image, etc.)", () => {
      const req = responsesFormat.parseRequest({
        model: "codex-mini",
        input: [
          {
            role: "user",
            content: [
              { type: "image_url", url: "https://example.com/img.png" },
              { type: "input_text", text: "describe this" },
            ],
          },
        ],
      });
      expect(req.lastMessage).toBe("describe this");
    });

    it("accepts requests with only instructions (no input)", () => {
      const req = responsesFormat.parseRequest({
        model: "codex-mini",
        instructions: "You are helpful",
      });
      expect(req.systemMessage).toBe("You are helpful");
      expect(req.lastMessage).toBe("");
    });

    it("parses function tools without description", () => {
      const req = responsesFormat.parseRequest({
        model: "codex-mini",
        input: "hi",
        tools: [{ type: "function", name: "run_code" }],
      });
      expect(req.tools![0]!.name).toBe("run_code");
      expect(req.tools![0]!.description).toBeUndefined();
    });

    it("filters out non-function tools", () => {
      const req = responsesFormat.parseRequest({
        model: "codex-mini",
        input: "hi",
        tools: [{ type: "function", name: "run_code" }, { type: "web_search" }],
      });
      expect(req.tools).toHaveLength(1);
      expect(req.tools![0]!.name).toBe("run_code");
    });
  });

  describe("serialize (streaming)", () => {
    it("starts with response.created and response.in_progress", () => {
      const chunks = responsesFormat.serialize({ text: "Hello" }, "codex-mini");
      expect(parse<ResponsesEvent>(chunks[0]!).type).toBe("response.created");
      expect(parse<ResponsesEvent>(chunks[1]!).type).toBe(
        "response.in_progress",
      );
    });

    it("ends with response.completed", () => {
      const chunks = responsesFormat.serialize({ text: "Hello" }, "codex-mini");
      expect(parse<ResponsesEvent>(chunks.at(-1)!).type).toBe(
        "response.completed",
      );
    });

    it("assigns incrementing sequence_number to every event", () => {
      const chunks = responsesFormat.serialize({ text: "Hello" }, "codex-mini");
      const seqNumbers = chunks.map(
        (c) => parse<ResponsesEvent>(c).sequence_number!,
      );
      for (let i = 1; i < seqNumbers.length; i++) {
        expect(seqNumbers[i]).toBe(seqNumbers[i - 1]! + 1);
      }
      expect(seqNumbers[0]).toBe(0);
    });

    it("uses same created_at across created, in_progress, and completed envelopes", () => {
      const chunks = responsesFormat.serialize({ text: "Hello" }, "codex-mini");
      const created = parse<ResponsesEvent>(chunks[0]!).response?.created_at;
      const inProgress = parse<ResponsesEvent>(chunks[1]!).response?.created_at;
      const completed = parse<ResponsesEvent>(chunks.at(-1)!).response
        ?.created_at;
      expect(created).toBe(inProgress);
      expect(created).toBe(completed);
    });

    it("produces text delta events with item_id", () => {
      const chunks = responsesFormat.serialize({ text: "Hello" }, "codex-mini");
      const delta = chunks.find(
        (c) => parse<ResponsesEvent>(c).type === "response.output_text.delta",
      );
      expect(delta).toBeDefined();
      const data = parse<ResponsesEvent>(delta!);
      expect(data.delta).toBe("Hello");
      expect(data.item_id).toBeTypeOf("string");
    });

    it("output items have status: in_progress when added, completed when done", () => {
      const chunks = responsesFormat.serialize({ text: "Hello" }, "codex-mini");
      const added = chunks.find((c) => {
        const d = parse<ResponsesEvent>(c);
        return (
          d.type === "response.output_item.added" && d.item?.type === "message"
        );
      });
      expect(parse<ResponsesEvent>(added!).item?.status).toBe("in_progress");

      const done = chunks.find((c) => {
        const d = parse<ResponsesEvent>(c);
        return (
          d.type === "response.output_item.done" && d.item?.type === "message"
        );
      });
      expect(parse<ResponsesEvent>(done!).item?.status).toBe("completed");
    });

    it("includes annotations on output_text parts", () => {
      const chunks = responsesFormat.serialize({ text: "Hello" }, "codex-mini");
      const partAdded = chunks.find(
        (c) => parse<ResponsesEvent>(c).type === "response.content_part.added",
      );
      expect(parse<ResponsesEvent>(partAdded!).part?.annotations).toEqual([]);
    });

    it("includes content_part.done event with full text", () => {
      const chunks = responsesFormat.serialize({ text: "Hello" }, "codex-mini");
      const partDone = chunks.find(
        (c) => parse<ResponsesEvent>(c).type === "response.content_part.done",
      );
      expect(partDone).toBeDefined();
      expect(parse<ResponsesEvent>(partDone!).part?.text).toBe("Hello");
    });

    it("emits reasoning events before message events", () => {
      const chunks = responsesFormat.serialize(
        { text: "42", reasoning: "Let me think..." },
        "codex-mini",
      );
      const types = chunks.map((c) => parse<ResponsesEvent>(c).type);

      expect(types).toContain("response.reasoning_summary_part.added");
      expect(types).toContain("response.reasoning_summary_text.delta");
      expect(types).toContain("response.reasoning_summary_text.done");
      expect(types).toContain("response.reasoning_summary_part.done");

      const reasoningDone = types.indexOf(
        "response.reasoning_summary_text.done",
      );
      const textDelta = types.indexOf("response.output_text.delta");
      expect(reasoningDone).toBeLessThan(textDelta);
    });

    it("includes reasoning output item in completed response", () => {
      const chunks = responsesFormat.serialize(
        { text: "42", reasoning: "Let me think" },
        "codex-mini",
      );
      const completed = parse<ResponsesEvent>(chunks.at(-1)!);
      expect(completed.response?.output[0]!.type).toBe("reasoning");
      expect(completed.response?.output[1]!.type).toBe("message");
    });

    it("accumulates text in completed output", () => {
      const chunks = responsesFormat.serialize(
        { text: "hello world" },
        "codex-mini",
      );
      const completed = parse<ResponsesEvent>(chunks.at(-1)!);
      expect(completed.response?.output[0]!.content?.[0]?.text).toBe(
        "hello world",
      );
    });

    it("produces function_call events for tool calls", () => {
      const chunks = responsesFormat.serialize(
        { tools: [{ name: "read_file", args: { path: "/tmp" } }] },
        "codex-mini",
      );
      const fnAdded = chunks.find((c) => {
        const d = parse<ResponsesEvent>(c);
        return (
          d.type === "response.output_item.added" &&
          d.item?.type === "function_call"
        );
      });
      expect(fnAdded).toBeDefined();
      const item = parse<ResponsesEvent>(fnAdded!).item!;
      expect(item.name).toBe("read_file");
      expect(item.status).toBe("in_progress");
    });

    it("no named events (responses uses data-only SSE)", () => {
      const chunks = responsesFormat.serialize({ text: "hi" }, "codex-mini");
      for (const chunk of chunks) {
        expect(chunk.event).toBeUndefined();
      }
    });

    it("works without reasoning events", () => {
      const chunks = responsesFormat.serialize({ text: "hello" }, "codex-mini");
      const completed = parse<ResponsesEvent>(chunks.at(-1)!);
      expect(completed.response?.output).toHaveLength(1);
      expect(completed.response?.output[0]!.type).toBe("message");
    });
  });

  describe("serializeComplete (non-streaming)", () => {
    it("produces correct top-level structure", () => {
      const result = responsesFormat.serializeComplete(
        { text: "Hello" },
        "codex-mini",
      ) as ResponsesComplete;
      expect(result.object).toBe("response");
      expect(result.status).toBe("completed");
      expect(result.model).toBe("codex-mini");
      expect(result.created_at).toBeTypeOf("number");
    });

    it("includes message output item with status and annotations", () => {
      const result = responsesFormat.serializeComplete(
        { text: "Hello, world!" },
        "codex-mini",
      ) as ResponsesComplete;
      const msg = result.output[0]!;
      expect(msg.type).toBe("message");
      expect(msg.status).toBe("completed");
      expect(msg.role).toBe("assistant");
      expect(msg.content?.[0]?.type).toBe("output_text");
      expect(msg.content?.[0]?.text).toBe("Hello, world!");
      expect(msg.content?.[0]?.annotations).toEqual([]);
    });

    it("includes reasoning before message in output", () => {
      const result = responsesFormat.serializeComplete(
        { text: "42", reasoning: "Thinking..." },
        "codex-mini",
      ) as ResponsesComplete;
      expect(result.output[0]!.type).toBe("reasoning");
      expect(result.output[1]!.type).toBe("message");
    });

    it("includes function_call in output for tool calls", () => {
      const result = responsesFormat.serializeComplete(
        { tools: [{ name: "read_file", args: { path: "/tmp" } }] },
        "codex-mini",
      ) as ResponsesComplete;
      const fnCall = result.output.find((o) => o.type === "function_call");
      if (!fnCall) throw new Error("expected function_call output");
      expect(fnCall.name).toBe("read_file");
      expect(fnCall.status).toBe("completed");
      expect(fnCall.call_id).toBeTypeOf("string");
    });

    it("generates unique IDs for multiple tools", () => {
      const result = responsesFormat.serializeComplete(
        {
          tools: [
            { name: "read_file", args: { path: "/a" } },
            { name: "write_file", args: { path: "/b" } },
          ],
        },
        "codex-mini",
      ) as ResponsesComplete;
      const calls = result.output.filter((o) => o.type === "function_call");
      if (calls.length !== 2)
        throw new Error("expected 2 function_call outputs");
      expect(calls[0].call_id).not.toBe(calls[1].call_id);
    });

    it("includes usage tokens", () => {
      const result = responsesFormat.serializeComplete(
        { text: "hi", usage: { input: 20, output: 15 } },
        "codex-mini",
      ) as ResponsesComplete;
      expect(result.usage).toEqual({
        input_tokens: 20,
        output_tokens: 15,
        total_tokens: 35,
      });
    });
  });

  describe("serializeError", () => {
    it("produces Responses error format", () => {
      const result = responsesFormat.serializeError({
        status: 500,
        message: "Internal error",
      }) as ResponsesError;
      expect(result.error.message).toBe("Internal error");
    });
  });
});
