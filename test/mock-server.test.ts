import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMock, MockServer } from "../src/index.js";

interface OpenAIResponse {
  choices: { message: { role: string; content: string }; finish_reason: string }[];
  error?: { type: string; message: string };
}

interface AnthropicResponse {
  content: { type: string; text?: string; thinking?: string }[];
  error?: { type: string; message: string };
}

interface ResponsesAPIResponse {
  output: { type: string; content: { type: string; text: string }[] }[];
}

describe("MockServer (end-to-end)", () => {
  let server: MockServer;

  beforeEach(async () => {
    server = await createMock({ port: 0 });
  });

  afterEach(async () => {
    await server.stop();
  });

  async function post(path: string, body: unknown): Promise<Response> {
    return fetch(`${server.url}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function postOpenAI(content: string, opts: Record<string, unknown> = {}): Promise<OpenAIResponse> {
    const res = await post("/v1/chat/completions", {
      model: "gpt-5.4",
      messages: [{ role: "user", content }],
      stream: false,
      ...opts,
    });
    return res.json() as Promise<OpenAIResponse>;
  }

  async function postAnthropic(content: string, opts: Record<string, unknown> = {}): Promise<AnthropicResponse> {
    const res = await post("/v1/messages", {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content }],
      max_tokens: 100,
      stream: false,
      ...opts,
    });
    return res.json() as Promise<AnthropicResponse>;
  }

  async function postResponses(input: string, opts: Record<string, unknown> = {}): Promise<ResponsesAPIResponse> {
    const res = await post("/v1/responses", {
      model: "codex-mini",
      input,
      stream: false,
      ...opts,
    });
    return res.json() as Promise<ResponsesAPIResponse>;
  }

  async function readSSE(res: Response): Promise<string[]> {
    const text = await res.text();
    return text
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => line.slice(6));
  }

  describe("shared rules across endpoints", () => {
    it("same rule matches on all three endpoints", async () => {
      server.when("hello").reply("Hi there!");

      const openai = await postOpenAI("hello");
      expect(openai.choices[0]!.message.content).toBe("Hi there!");

      const anthropic = await postAnthropic("hello");
      expect(anthropic.content[0]!.text).toBe("Hi there!");

      const responses = await postResponses("hello");
      expect(responses.output[0]!.content[0]!.text).toBe("Hi there!");
    });
  });

  describe("OpenAI streaming", () => {
    it("streams SSE chunks ending with [DONE]", async () => {
      server.when("hello").reply("Hi!");
      const res = await post("/v1/chat/completions", {
        model: "gpt-5.4",
        messages: [{ role: "user", content: "hello" }],
      });
      expect(res.headers.get("content-type")).toBe("text/event-stream");
      const data = await readSSE(res);
      expect(data.at(-1)).toBe("[DONE]");

      const contentChunk = JSON.parse(data[1]!);
      expect(contentChunk.choices[0].delta.content).toBe("Hi!");
    });
  });

  describe("Anthropic streaming", () => {
    it("streams named SSE events", async () => {
      server.when("hello").reply("Hi!");
      const res = await post("/v1/messages", {
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "hello" }],
        max_tokens: 100,
      });
      const text = await res.text();
      expect(text).toContain("event: message_start");
      expect(text).toContain("event: content_block_delta");
      expect(text).toContain("event: message_stop");
    });
  });

  describe("Responses API streaming", () => {
    it("streams response events", async () => {
      server.when("hello").reply("Hi!");
      const res = await post("/v1/responses", {
        model: "codex-mini",
        input: "hello",
      });
      const data = await readSSE(res);
      const types = data.map((d) => JSON.parse(d).type);
      expect(types).toContain("response.created");
      expect(types).toContain("response.output_text.delta");
      expect(types).toContain("response.completed");
    });
  });

  describe("regex match", () => {
    it("matches regex against last user message", async () => {
      server.when(/explain (\w+)/i).reply("Here is an explanation.");
      const json = await postOpenAI("Can you explain recursion?");
      expect(json.choices[0]!.message.content).toBe("Here is an explanation.");
    });
  });

  describe("dynamic resolver", () => {
    it("calls resolver function with MockRequest", async () => {
      server.when("hello").reply((req) => `You said: ${req.lastMessage}`);
      const json = await postOpenAI("hello");
      expect(json.choices[0]!.message.content).toBe("You said: hello");
    });
  });

  describe("async resolver", () => {
    it("supports async resolver functions", async () => {
      server.when("async").reply(async () => {
        return { text: "async result" };
      });
      const json = await postOpenAI("async");
      expect(json.choices[0]!.message.content).toBe("async result");
    });
  });

  describe("structured reply (text + reasoning)", () => {
    it("sends text and reasoning in Anthropic format", async () => {
      server.when("think").reply({ text: "42", reasoning: "Deep thought..." });
      const json = await postAnthropic("think");
      expect(json.content[0]!.type).toBe("thinking");
      expect(json.content[0]!.thinking).toBe("Deep thought...");
      expect(json.content[1]!.type).toBe("text");
      expect(json.content[1]!.text).toBe("42");
    });
  });

  describe("tool call reply", () => {
    it("returns tool calls in OpenAI format", async () => {
      server.when("read").reply({
        tools: [{ name: "read_file", args: { path: "/tmp/foo" } }],
      });
      const json = await postOpenAI("read the file");
      expect(json.choices[0]!.finish_reason).toBe("tool_calls");
    });
  });

  describe("times()", () => {
    it("rule is consumed after N matches", async () => {
      server.when("once").reply("First time!").times(1);
      server.fallback("Fallback.");

      const j1 = await postOpenAI("once");
      expect(j1.choices[0]!.message.content).toBe("First time!");

      const j2 = await postOpenAI("once");
      expect(j2.choices[0]!.message.content).toBe("Fallback.");
    });
  });

  describe("fallback", () => {
    it("uses fallback when no rule matches", async () => {
      server.fallback("I don't understand.");
      const json = await postOpenAI("something random");
      expect(json.choices[0]!.message.content).toBe("I don't understand.");
    });
  });

  describe("history", () => {
    it("records requests with matched rule info", async () => {
      server.when("hello").reply("Hi!");
      await postOpenAI("hello");

      expect(server.history.count()).toBe(1);
      expect(server.history.last()?.request.lastMessage).toBe("hello");
      expect(server.history.first()?.rule).toBe('"hello"');
    });

    it("captures request headers and path", async () => {
      server.when("hello").reply("Hi!");
      await fetch(`${server.url}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Custom": "test-value" },
        body: JSON.stringify({
          model: "gpt-5.4",
          messages: [{ role: "user", content: "hello" }],
          stream: false,
        }),
      });

      const entry = server.history.last()!;
      expect(entry.request.path).toBe("/v1/chat/completions");
      expect(entry.request.headers["x-custom"]).toBe("test-value");
    });
  });

  describe("request metadata in predicates", () => {
    it("matches on headers", async () => {
      server.when({ predicate: (req) => req.headers["x-team"] === "alpha" }).reply("Alpha team!");
      server.when("hello").reply("Default");

      const res = await fetch(`${server.url}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Team": "alpha" },
        body: JSON.stringify({
          model: "gpt-5.4",
          messages: [{ role: "user", content: "hello" }],
          stream: false,
        }),
      });

      expect(await res.json()).toMatchObject({
        choices: [{ message: { content: "Alpha team!" } }],
      });
    });
  });

  describe("rules", () => {
    it("returns summaries of registered rules", () => {
      server.when("hello").reply("Hi!");
      server.when(/bye/i).reply("Goodbye!").times(3);

      expect(server.rules).toEqual([
        { description: '"hello"', remaining: Infinity },
        { description: "/bye/i", remaining: 3 },
      ]);
    });
  });

  describe("isDone()", () => {
    it("returns true when all limited rules consumed", async () => {
      server.when("hello").reply("Hi!").times(1);
      expect(server.isDone()).toBe(false);

      await postOpenAI("hello");
      expect(server.isDone()).toBe(true);
    });
  });

  describe("replySequence()", () => {
    it("advances through the sequence and then stops matching", async () => {
      server.when("step").replySequence(["First.", "Second.", "Third."]);
      server.fallback("Done.");

      const results: string[] = [];
      for (let i = 0; i < 4; i++) {
        const json = await postOpenAI("step");
        results.push(json.choices[0]!.message.content);
      }

      expect(results).toEqual(["First.", "Second.", "Third.", "Done."]);
    });

    it("supports per-step options", async () => {
      server.when("step").replySequence([
        "Plain.",
        { reply: { text: "With options." }, options: { chunkSize: 5 } },
      ]);

      const json = await postOpenAI("step");
      expect(json.choices[0]!.message.content).toBe("Plain.");
    });

    it("throws on empty sequence", () => {
      expect(() => server.when("step").replySequence([])).toThrow(
        "Sequence requires at least one entry",
      );
    });
  });

  describe("request validation", () => {
    it("returns 400 for invalid request body", async () => {
      const res = await post("/v1/chat/completions", { invalid: true });
      expect(res.status).toBe(400);
      const json = (await res.json()) as OpenAIResponse;
      expect(json.error?.type).toBe("invalid_request_error");
    });

    it("returns 400 for Anthropic request missing max_tokens", async () => {
      const res = await post("/v1/messages", {
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "hi" }],
      });
      expect(res.status).toBe(400);
    });
  });

  describe("history fluent API", () => {
    it("at() returns entry by index", async () => {
      server.when("a").reply("A");
      server.when("b").reply("B");
      await postOpenAI("a");
      await postOpenAI("b");

      expect(server.history.at(0)?.request.lastMessage).toBe("a");
      expect(server.history.at(1)?.request.lastMessage).toBe("b");
      expect(server.history.at(99)).toBeUndefined();
    });

    it("all returns readonly array of entries", async () => {
      server.when("hello").reply("Hi!");
      await postOpenAI("hello");

      expect(server.history.all).toHaveLength(1);
      expect(server.history.all[0]?.request.lastMessage).toBe("hello");
    });

    it("is iterable with for...of", async () => {
      server.when("hello").reply("Hi!");
      await postOpenAI("hello");

      const messages: string[] = [];
      for (const entry of server.history) {
        messages.push(entry.request.lastMessage);
      }
      expect(messages).toEqual(["hello"]);
    });
  });

  describe("reset()", () => {
    it("clears rules and history", async () => {
      server.when("hello").reply("Hi!");
      await postOpenAI("hello");
      expect(server.history.count()).toBe(1);

      server.reset();
      expect(server.history.count()).toBe(0);
      expect(server.ruleCount).toBe(0);
    });
  });

  describe("model match", () => {
    it("matches on model name", async () => {
      server.when({ model: "gpt-5.4" }).reply("I'm GPT-5.4.");
      server.when({ model: /claude/ }).reply("I'm Claude.");

      const openai = await postOpenAI("who are you");
      expect(openai.choices[0]!.message.content).toBe("I'm GPT-5.4.");

      const anthropic = await postAnthropic("who are you");
      expect(anthropic.content[0]!.text).toBe("I'm Claude.");
    });
  });

  describe("url property", () => {
    it("returns the base URL", () => {
      expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    });
  });

  describe("error injection", () => {
    it("nextError returns a one-shot error response", async () => {
      server.nextError(429, "Rate limited", "rate_limit_error");
      server.when("hello").reply("Hi!");

      const r1 = await post("/v1/chat/completions", {
        model: "gpt-5.4",
        messages: [{ role: "user", content: "hello" }],
        stream: false,
      });
      expect(r1.status).toBe(429);
      const err = (await r1.json()) as OpenAIResponse;
      expect(err.error?.message).toBe("Rate limited");

      const r2 = await post("/v1/chat/completions", {
        model: "gpt-5.4",
        messages: [{ role: "user", content: "hello" }],
        stream: false,
      });
      expect(r2.status).toBe(200);
    });

    it("error reply works as a normal rule", async () => {
      server.when("fail").reply({ error: { status: 500, message: "Internal error" } });
      server.when("hello").reply("Hi!");

      const r1 = await post("/v1/chat/completions", {
        model: "gpt-5.4",
        messages: [{ role: "user", content: "fail please" }],
        stream: false,
      });
      expect(r1.status).toBe(500);

      const r2 = await post("/v1/chat/completions", {
        model: "gpt-5.4",
        messages: [{ role: "user", content: "hello" }],
        stream: false,
      });
      expect(r2.status).toBe(200);
    });
  });

  describe("chunkSize", () => {
    it("splits text into multiple SSE delta chunks", async () => {
      server.when("hello").reply("Hello, world!", { chunkSize: 5 });
      const res = await post("/v1/chat/completions", {
        model: "gpt-5.4",
        messages: [{ role: "user", content: "hello" }],
      });
      const data = await readSSE(res);
      const contentDeltas = data
        .filter((d) => d !== "[DONE]")
        .map((d) => JSON.parse(d))
        .filter((d: { choices?: { delta?: { content?: string } }[] }) =>
          d.choices?.[0]?.delta?.content !== undefined,
        )
        .map((d: { choices: { delta: { content: string } }[] }) =>
          d.choices[0]!.delta.content,
        );
      expect(contentDeltas.length).toBe(3);
      expect(contentDeltas.join("")).toBe("Hello, world!");
    });
  });

  describe("whenTool()", () => {
    it("matches when request has the specified tool", async () => {
      server.whenTool("get_weather").reply("Weather tool detected!");
      server.fallback("No match.");

      const j1 = await postOpenAI("what's the weather?", {
        tools: [{ type: "function", function: { name: "get_weather", parameters: {} } }],
      });
      expect(j1.choices[0]!.message.content).toBe("Weather tool detected!");

      const j2 = await postOpenAI("what's the weather?");
      expect(j2.choices[0]!.message.content).toBe("No match.");
    });
  });

  describe("whenToolResult()", () => {
    it("matches when request has a tool result with the specified id", async () => {
      server.whenToolResult("call_abc").reply("Got the tool result!");
      server.fallback("No match.");

      const json = await postOpenAI("use the tool", {
        messages: [
          { role: "user", content: "use the tool" },
          { role: "assistant", content: null, tool_calls: [{ id: "call_abc", type: "function", function: { name: "test", arguments: "{}" } }] },
          { role: "tool", tool_call_id: "call_abc", content: "result data" },
        ],
      });
      expect(json.choices[0]!.message.content).toBe("Got the tool result!");
    });
  });

  describe(".first()", () => {
    it("moves a rule to the front of the match list", async () => {
      server.when("hello").reply("First rule");
      server.when("hello").reply("Second rule").first();

      const json = await postOpenAI("hello");
      expect(json.choices[0]!.message.content).toBe("Second rule");
    });
  });

  describe(".times() chaining", () => {
    it("returns RuleHandle for chaining with .first()", async () => {
      server.when("hello").reply("Normal");
      server.when("hello").reply("Priority one-shot").times(1).first();
      server.fallback("Fallback.");

      const j1 = await postOpenAI("hello");
      expect(j1.choices[0]!.message.content).toBe("Priority one-shot");

      const j2 = await postOpenAI("hello");
      expect(j2.choices[0]!.message.content).toBe("Normal");
    });
  });

  describe("resolver error handling", () => {
    it("falls back when resolver throws", async () => {
      server.when("boom").reply(() => { throw new Error("resolver failed"); });
      server.fallback("Safe fallback.");

      const json = await postOpenAI("boom");
      expect(json.choices[0]!.message.content).toBe("Safe fallback.");
    });
  });

  describe("async dispose", () => {
    it("stops the server via Symbol.asyncDispose", async () => {
      const s = await createMock({ port: 0 });
      const url = s.url;
      await s[Symbol.asyncDispose]();
      await expect(fetch(`${url}/v1/chat/completions`)).rejects.toThrow();
    });
  });

  describe("logging", () => {
    it("exercises all log levels including warn and error paths", async () => {
      const s = await createMock({ port: 0, logLevel: "debug" });

      s.when("test").reply("ok");
      await fetch(`${s.url}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-5.4", messages: [{ role: "user", content: "test" }], stream: false }),
      });

      await fetch(`${s.url}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-5.4", messages: [{ role: "user", content: "unmatched" }], stream: false }),
      });

      s.when("throw").reply(() => { throw new Error("boom"); });
      await fetch(`${s.url}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-5.4", messages: [{ role: "user", content: "throw" }], stream: false }),
      });

      await s.stop();
    });
  });

  describe("streaming with latency", () => {
    it("streams with latency between chunks", async () => {
      server.when("hello").reply("Hi!", { latency: 5 });
      const res = await post("/v1/chat/completions", {
        model: "gpt-5.4",
        messages: [{ role: "user", content: "hello" }],
      });
      expect(res.headers.get("content-type")).toBe("text/event-stream");
      const data = await readSSE(res);
      expect(data.at(-1)).toBe("[DONE]");
    });
  });
});
