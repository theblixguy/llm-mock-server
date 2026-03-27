import { describe, it, expect, beforeEach } from "vitest";
import { RuleEngine } from "#/rule-engine.js";
import { makeReq } from "./helpers/make-req.js";

describe("RuleEngine", () => {
  let engine: RuleEngine;

  beforeEach(() => {
    engine = new RuleEngine();
  });

  it("matches a string (substring, case-insensitive)", () => {
    engine.add("hello", "Hi!");
    const rule = engine.match(makeReq({ lastMessage: "say Hello world" }));
    if (!rule) throw new Error("expected match");
    expect(rule.description).toBe('"hello"');
  });

  it("matches a regex", () => {
    engine.add(/explain (\w+)/i, "Here is an explanation.");
    const rule = engine.match(
      makeReq({ lastMessage: "Can you explain recursion?" }),
    );
    expect(rule).toBeDefined();
  });

  it("matches a predicate function", () => {
    engine.add((req) => req.messages.length > 2, "Long conversation");
    const rule = engine.match(
      makeReq({
        messages: [
          { role: "system", content: "You are helpful" },
          { role: "user", content: "hi" },
          { role: "assistant", content: "hello" },
        ],
      }),
    );
    expect(rule).toBeDefined();
  });

  it("matches a MatchObject with model", () => {
    engine.add({ model: "gpt-5.4" }, "I'm GPT-5.4");
    expect(engine.match(makeReq({ model: "gpt-5.4" }))).toBeDefined();
    expect(engine.match(makeReq({ model: "claude-3" }))).toBeUndefined();
  });

  it("matches a MatchObject with message + model", () => {
    engine.add({ model: "gpt-5.4", message: "hello" }, "Hi from GPT-5.4");
    expect(
      engine.match(makeReq({ model: "gpt-5.4", lastMessage: "hello" })),
    ).toBeDefined();
    expect(
      engine.match(makeReq({ model: "gpt-5.4", lastMessage: "bye" })),
    ).toBeUndefined();
    expect(
      engine.match(makeReq({ model: "claude", lastMessage: "hello" })),
    ).toBeUndefined();
  });

  it("matches a MatchObject with system", () => {
    engine.add({ system: /pirate/i }, "Arrr!");
    expect(
      engine.match(makeReq({ systemMessage: "You are a pirate" })),
    ).toBeDefined();
    expect(
      engine.match(makeReq({ systemMessage: "You are helpful" })),
    ).toBeUndefined();
  });

  it("matches a MatchObject with format", () => {
    engine.add({ format: "anthropic" }, "Anthropic only");
    expect(engine.match(makeReq({ format: "anthropic" }))).toBeDefined();
    expect(engine.match(makeReq({ format: "openai" }))).toBeUndefined();
  });

  it("returns first match (first-match-wins)", () => {
    engine.add("hello", "First");
    engine.add("hello", "Second");
    const rule = engine.match(makeReq());
    if (!rule) throw new Error("expected match");
    expect(rule.resolve).toBe("First");
  });

  it("returns undefined when no rules match", () => {
    engine.add("goodbye", "Bye!");
    expect(engine.match(makeReq({ lastMessage: "hello" }))).toBeUndefined();
  });

  describe("times()", () => {
    it("decrements and removes rule after N matches", () => {
      const rule = engine.add("hello", "Once");
      rule.remaining = 1;

      expect(engine.match(makeReq())).toBeDefined();
      expect(engine.match(makeReq())).toBeUndefined();
    });

    it("allows multiple matches with times > 1", () => {
      const rule = engine.add("hello", "Twice");
      rule.remaining = 2;

      expect(engine.match(makeReq())).toBeDefined();
      expect(engine.match(makeReq())).toBeDefined();
      expect(engine.match(makeReq())).toBeUndefined();
    });

    it("isDone() returns true when all limited rules are consumed", () => {
      const rule = engine.add("hello", "Once");
      rule.remaining = 1;
      engine.add("world", "Unlimited"); // no times limit

      expect(engine.isDone()).toBe(false);
      engine.match(makeReq());
      expect(engine.isDone()).toBe(true);
    });
  });

  it("clear() removes all rules", () => {
    engine.add("hello", "Hi");
    engine.add("bye", "Bye");
    engine.clear();
    expect(engine.ruleCount).toBe(0);
  });

  it("addHandler adds a handler-style rule", () => {
    engine.addHandler(
      (req) => req.lastMessage.includes("test"),
      "Handler reply",
    );
    expect(
      engine.match(makeReq({ lastMessage: "this is a test" })),
    ).toBeDefined();
  });

  describe("toolName matching", () => {
    it("matches when toolNames includes the specified tool", () => {
      engine.add({ toolName: "get_weather" }, "Weather tool present");
      expect(
        engine.match(makeReq({ toolNames: ["get_weather", "search"] })),
      ).toBeDefined();
      expect(engine.match(makeReq({ toolNames: ["search"] }))).toBeUndefined();
    });
  });

  describe("toolCallId matching", () => {
    it("matches when lastToolCallId equals the specified id", () => {
      engine.add({ toolCallId: "call_abc" }, "Tool result");
      expect(
        engine.match(makeReq({ lastToolCallId: "call_abc" })),
      ).toBeDefined();
      expect(
        engine.match(makeReq({ lastToolCallId: "call_xyz" })),
      ).toBeUndefined();
      expect(engine.match(makeReq())).toBeUndefined();
    });
  });

  describe("moveToFront()", () => {
    it("moves an existing rule to the front", () => {
      engine.add("hello", "First");
      const rule = engine.add("hello", "Second");
      engine.moveToFront(rule);
      const matched = engine.match(makeReq());
      if (!matched) throw new Error("expected match");
      expect(matched.resolve).toBe("Second");
    });
  });

  describe("MatchObject with predicate", () => {
    it("combines structured fields with a predicate function", () => {
      engine.add(
        { model: "gpt-5.4", predicate: (req) => req.messages.length > 2 },
        "Complex match",
      );
      expect(engine.match(makeReq({ model: "gpt-5.4" }))).toBeUndefined();

      expect(
        engine.match(
          makeReq({
            model: "gpt-5.4",
            messages: [
              { role: "system", content: "sys" },
              { role: "user", content: "a" },
              { role: "assistant", content: "b" },
            ],
          }),
        ),
      ).toBeDefined();
    });

    it("predicate runs after other fields (short-circuits)", () => {
      let called = false;
      engine.add(
        {
          model: "claude",
          predicate: () => {
            called = true;
            return true;
          },
        },
        "Never reached",
      );
      engine.match(makeReq({ model: "gpt-5.4" }));
      expect(called).toBe(false);
    });
  });

  describe("global/sticky regex safety", () => {
    it("strips the g flag so test() is not stateful", () => {
      engine.add(/hello/g, "Hi!");
      expect(engine.match(makeReq())).toBeDefined();
      expect(engine.match(makeReq())).toBeDefined();
      expect(engine.match(makeReq())).toBeDefined();
    });

    it("strips the y flag so test() is not stateful", () => {
      engine.add(/hello/y, "Hi!");
      expect(engine.match(makeReq())).toBeDefined();
      expect(engine.match(makeReq())).toBeDefined();
    });

    it("strips g flag from regex inside a MatchObject", () => {
      engine.add({ message: /hello/gi }, "Hi!");
      expect(engine.match(makeReq())).toBeDefined();
      expect(engine.match(makeReq())).toBeDefined();
      expect(engine.match(makeReq())).toBeDefined();
    });
  });
});
