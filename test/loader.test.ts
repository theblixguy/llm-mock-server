import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { RuleEngine } from "../src/rule-engine.js";
import { loadRulesFromPath } from "../src/loader.js";
import type { MockRequest } from "../src/types.js";

const tmpDir = join(import.meta.dirname, ".tmp-loader-test");

function makeReq(overrides: Partial<MockRequest> = {}): MockRequest {
  return {
    format: "openai",
    model: "gpt-5.4",
    streaming: true,
    messages: [{ role: "user", content: "hello" }],
    lastMessage: "hello",
    systemMessage: "",
    toolNames: [],
    lastToolCallId: undefined,
    raw: {},
    headers: {},
    path: "/v1/chat/completions",
    ...overrides,
  };
}

describe("Loader", () => {
  let engine: RuleEngine;

  beforeEach(async () => {
    engine = new RuleEngine();
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe("JSON5 files", () => {
    it("loads rules from a .json5 file", async () => {
      const rulesPath = join(tmpDir, "rules.json5");
      await writeFile(
        rulesPath,
        `[
          {
            when: "explain recursion",
            reply: "A function that calls itself.",
          },
          {
            when: { model: "gpt-5.4", message: "hello" },
            reply: "Hi from GPT-5.4!",
          },
        ]`,
      );

      await loadRulesFromPath(rulesPath, { engine });
      expect(engine.ruleCount).toBe(2);

      const match1 = engine.match(makeReq({ lastMessage: "Please explain recursion" }));
      expect(match1).toBeDefined();
      expect(match1!.resolve).toBe("A function that calls itself.");

      const match2 = engine.match(makeReq({ model: "gpt-5.4", lastMessage: "hello" }));
      expect(match2).toBeDefined();
    });

    it("loads regex patterns from JSON5", async () => {
      const rulesPath = join(tmpDir, "regex.json5");
      await writeFile(
        rulesPath,
        `[
          {
            when: "/explain (\\\\w+)/i",
            reply: "Here is an explanation.",
          },
        ]`,
      );

      await loadRulesFromPath(rulesPath, { engine });
      const match = engine.match(makeReq({ lastMessage: "explain polymorphism" }));
      expect(match).toBeDefined();
    });

    it("loads regex patterns with modern flags (d, v)", async () => {
      const rulesPath = join(tmpDir, "flags.json5");
      await writeFile(
        rulesPath,
        `[{ when: "/hello/di", reply: "With d flag" }]`,
      );

      await loadRulesFromPath(rulesPath, { engine });
      expect(engine.match(makeReq({ lastMessage: "hello world" }))).toBeDefined();
    });

    it("loads rules with times", async () => {
      const rulesPath = join(tmpDir, "times.json5");
      await writeFile(
        rulesPath,
        `[{ when: "once", reply: "One time!", times: 1 }]`,
      );

      await loadRulesFromPath(rulesPath, { engine });
      expect(engine.match(makeReq({ lastMessage: "once" }))).toBeDefined();
      expect(engine.match(makeReq({ lastMessage: "once" }))).toBeUndefined();
    });

    it("resolves $template references", async () => {
      const rulesPath = join(tmpDir, "templates.json5");
      await writeFile(
        rulesPath,
        `{
          templates: {
            greeting: "Hello from template!",
            toolReply: { tools: [{ name: "search", args: { q: "test" } }] },
          },
          rules: [
            { when: "hi", reply: "$greeting" },
            { when: "search", reply: "$toolReply" },
          ],
        }`,
      );

      await loadRulesFromPath(rulesPath, { engine });
      expect(engine.ruleCount).toBe(2);

      const match1 = engine.match(makeReq({ lastMessage: "hi" }));
      expect(match1?.resolve).toBe("Hello from template!");

      const match2 = engine.match(makeReq({ lastMessage: "search" }));
      expect(match2?.resolve).toMatchObject({ tools: [{ name: "search" }] });
    });

    it("throws on unknown template reference", async () => {
      const rulesPath = join(tmpDir, "bad-ref.json5");
      await writeFile(
        rulesPath,
        `{
          rules: [{ when: "hi", reply: "$nonexistent" }],
        }`,
      );

      await expect(loadRulesFromPath(rulesPath, { engine })).rejects.toThrow("Unknown template");
    });

    it("loads a replies sequence", async () => {
      const rulesPath = join(tmpDir, "seq.json5");
      await writeFile(
        rulesPath,
        `[{ when: "step", replies: ["First.", "Second."] }]`,
      );

      await loadRulesFromPath(rulesPath, { engine });
      expect(engine.ruleCount).toBe(1);

      const req = makeReq({ lastMessage: "step" });
      const match1 = engine.match(req);
      expect(match1).toBeDefined();
      expect((match1!.resolve as () => string)()).toBe("First.");

      const match2 = engine.match(req);
      expect(match2).toBeDefined();
      expect((match2!.resolve as () => string)()).toBe("Second.");

      expect(engine.match(req)).toBeUndefined();
    });

    it("loads fallback from JSON5 file", async () => {
      const rulesPath = join(tmpDir, "fb.json5");
      await writeFile(
        rulesPath,
        `{
          fallback: "Default reply.",
          rules: [{ when: "hi", reply: "Hello!" }],
        }`,
      );

      let capturedFallback: unknown;
      await loadRulesFromPath(rulesPath, {
        engine,
        setFallback: (reply) => { capturedFallback = reply; },
      });

      expect(capturedFallback).toBe("Default reply.");
      expect(engine.ruleCount).toBe(1);
    });
  });

  describe("handler files", () => {
    it("loads a single handler from a .ts file", async () => {
      const handlerPath = join(tmpDir, "single.ts");
      await writeFile(
        handlerPath,
        `export default {
          match: (req) => req.lastMessage.includes("summarize"),
          respond: (req) => "Here is a summary.",
        };`,
      );

      await loadRulesFromPath(handlerPath, { engine });
      expect(engine.ruleCount).toBe(1);

      const match = engine.match(makeReq({ lastMessage: "summarize this article" }));
      expect(match).toBeDefined();
      expect(match!.resolve).toBeTypeOf("function");
    });

    it("loads an array of handlers from a .ts file", async () => {
      const handlerPath = join(tmpDir, "multi.ts");
      await writeFile(
        handlerPath,
        `export default [
          {
            match: (req) => req.lastMessage.includes("hello"),
            respond: () => "Hi!",
          },
          {
            match: (req) => req.lastMessage.includes("bye"),
            respond: () => "Goodbye!",
          },
        ];`,
      );

      await loadRulesFromPath(handlerPath, { engine });
      expect(engine.ruleCount).toBe(2);

      expect(engine.match(makeReq({ lastMessage: "hello" }))).toBeDefined();
      expect(engine.match(makeReq({ lastMessage: "bye" }))).toBeDefined();
      expect(engine.match(makeReq({ lastMessage: "nothing" }))).toBeUndefined();
    });

    it("handler respond function receives the request", async () => {
      const handlerPath = join(tmpDir, "dynamic.ts");
      await writeFile(
        handlerPath,
        `export default {
          match: (req) => req.lastMessage.includes("echo"),
          respond: (req) => \`Echo: \${req.lastMessage}\`,
        };`,
      );

      await loadRulesFromPath(handlerPath, { engine });
      const rule = engine.match(makeReq({ lastMessage: "echo this" }));
      expect(rule).toBeDefined();

      const resolver = rule!.resolve as (req: MockRequest) => string;
      const result = resolver(makeReq({ lastMessage: "echo this" }));
      expect(result).toBe("Echo: echo this");
    });

    it("throws on invalid handler file (missing match/respond)", async () => {
      const handlerPath = join(tmpDir, "bad.ts");
      await writeFile(handlerPath, `export default { mach: () => true, respond: () => "hi" };`);

      await expect(loadRulesFromPath(handlerPath, { engine })).rejects.toThrow("Invalid handler file");
    });

    it("loads fallback from handler file", async () => {
      const handlerPath = join(tmpDir, "with-fallback.ts");
      await writeFile(
        handlerPath,
        `export const fallback = "Default reply.";
         export default {
           match: (req) => req.lastMessage.includes("hello"),
           respond: () => "Hi!",
         };`,
      );

      let capturedFallback: unknown;
      await loadRulesFromPath(handlerPath, {
        engine,
        setFallback: (reply) => { capturedFallback = reply; },
      });

      expect(capturedFallback).toBe("Default reply.");
      expect(engine.ruleCount).toBe(1);
    });
  });

  describe("directory loading", () => {
    it("loads all .json5 files from a directory", async () => {
      await writeFile(
        join(tmpDir, "a.json5"),
        `[{ when: "aaa", reply: "A" }]`,
      );
      await writeFile(
        join(tmpDir, "b.json5"),
        `[{ when: "bbb", reply: "B" }]`,
      );

      await loadRulesFromPath(tmpDir, { engine });
      expect(engine.ruleCount).toBe(2);
    });

    it("loads mixed .json5 and .ts files from a directory", async () => {
      await writeFile(
        join(tmpDir, "rules.json5"),
        `[{ when: "static", reply: "From JSON5" }]`,
      );
      await writeFile(
        join(tmpDir, "handler.ts"),
        `export default {
          match: (req) => req.lastMessage.includes("dynamic"),
          respond: () => "From handler",
        };`,
      );

      await loadRulesFromPath(tmpDir, { engine });
      expect(engine.ruleCount).toBe(2);

      expect(engine.match(makeReq({ lastMessage: "static" }))).toBeDefined();
      expect(engine.match(makeReq({ lastMessage: "dynamic" }))).toBeDefined();
    });
  });
});
