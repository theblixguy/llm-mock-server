import { describe, it, expect, beforeEach } from "vitest";
import { RequestHistory, type RecordedRequest } from "../src/history.js";
import { makeReq } from "./helpers/make-req.js";

describe("RequestHistory", () => {
  let history: RequestHistory;

  beforeEach(() => {
    history = new RequestHistory();
  });

  describe("record()", () => {
    it("adds an entry", () => {
      history.record(makeReq(), "rule-1");
      expect(history.count()).toBe(1);
    });

    it("adds multiple entries in order", () => {
      history.record(makeReq({ lastMessage: "first" }), "r1");
      history.record(makeReq({ lastMessage: "second" }), "r2");
      history.record(makeReq({ lastMessage: "third" }), undefined);

      expect(history.count()).toBe(3);
      expect(history.first()?.request.lastMessage).toBe("first");
      expect(history.last()?.request.lastMessage).toBe("third");
    });

    it("stores the matched rule name", () => {
      history.record(makeReq(), "my-rule");
      expect(history.first()?.rule).toBe("my-rule");
    });

    it("stores undefined rule when fallback was used", () => {
      history.record(makeReq(), undefined);
      expect(history.first()?.rule).toBeUndefined();
    });

    it("sets a numeric timestamp", () => {
      const before = Date.now();
      history.record(makeReq(), "r");
      const after = Date.now();

      const ts = history.first()!.timestamp;
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });
  });

  describe("count()", () => {
    it("returns 0 for empty history", () => {
      expect(history.count()).toBe(0);
    });

    it("returns the correct count after multiple records", () => {
      history.record(makeReq(), "a");
      history.record(makeReq(), "b");
      history.record(makeReq(), "c");
      expect(history.count()).toBe(3);
    });

    it("returns 0 after clear", () => {
      history.record(makeReq(), "a");
      history.clear();
      expect(history.count()).toBe(0);
    });
  });

  describe("first()", () => {
    it("returns undefined when history is empty", () => {
      expect(history.first()).toBeUndefined();
    });

    it("returns the first recorded entry", () => {
      history.record(makeReq({ lastMessage: "alpha" }), "r1");
      history.record(makeReq({ lastMessage: "beta" }), "r2");

      const entry = history.first();
      expect(entry).toBeDefined();
      expect(entry!.request.lastMessage).toBe("alpha");
      expect(entry!.rule).toBe("r1");
    });
  });

  describe("last()", () => {
    it("returns undefined when history is empty", () => {
      expect(history.last()).toBeUndefined();
    });

    it("returns the most recent entry", () => {
      history.record(makeReq({ lastMessage: "alpha" }), "r1");
      history.record(makeReq({ lastMessage: "beta" }), "r2");

      const entry = history.last();
      expect(entry).toBeDefined();
      expect(entry!.request.lastMessage).toBe("beta");
      expect(entry!.rule).toBe("r2");
    });

    it("returns the same entry as first() when there is only one", () => {
      history.record(makeReq(), "only");
      expect(history.first()).toBe(history.last());
    });
  });

  describe("at()", () => {
    beforeEach(() => {
      history.record(makeReq({ lastMessage: "zero" }), "r0");
      history.record(makeReq({ lastMessage: "one" }), "r1");
      history.record(makeReq({ lastMessage: "two" }), "r2");
    });

    it("returns the entry at a positive index", () => {
      expect(history.at(0)?.request.lastMessage).toBe("zero");
      expect(history.at(1)?.request.lastMessage).toBe("one");
      expect(history.at(2)?.request.lastMessage).toBe("two");
    });

    it("returns the entry at a negative index", () => {
      expect(history.at(-1)?.request.lastMessage).toBe("two");
      expect(history.at(-2)?.request.lastMessage).toBe("one");
      expect(history.at(-3)?.request.lastMessage).toBe("zero");
    });

    it("returns undefined for out-of-bounds positive index", () => {
      expect(history.at(3)).toBeUndefined();
      expect(history.at(100)).toBeUndefined();
    });

    it("returns undefined for out-of-bounds negative index", () => {
      expect(history.at(-4)).toBeUndefined();
      expect(history.at(-100)).toBeUndefined();
    });

    it("returns undefined when history is empty", () => {
      const empty = new RequestHistory();
      expect(empty.at(0)).toBeUndefined();
      expect(empty.at(-1)).toBeUndefined();
    });
  });

  describe("where()", () => {
    beforeEach(() => {
      history.record(makeReq({ lastMessage: "hello", model: "gpt-5.4" }), "rule-a");
      history.record(makeReq({ lastMessage: "world", model: "claude-4" }), undefined);
      history.record(makeReq({ lastMessage: "hello again", model: "gpt-5.4" }), "rule-b");
    });

    it("filters entries by predicate", () => {
      const matched = history.where((e) => e.rule !== undefined);
      expect(matched).toHaveLength(2);
      expect(matched[0].rule).toBe("rule-a");
      expect(matched[1].rule).toBe("rule-b");
    });

    it("filters by request properties", () => {
      const claudeRequests = history.where((e) => e.request.model === "claude-4");
      expect(claudeRequests).toHaveLength(1);
      expect(claudeRequests[0].request.lastMessage).toBe("world");
    });

    it("returns an empty array when nothing matches", () => {
      const none = history.where((e) => e.request.lastMessage === "nonexistent");
      expect(none).toEqual([]);
    });

    it("returns all entries when predicate always returns true", () => {
      const all = history.where(() => true);
      expect(all).toHaveLength(3);
    });

    it("returns an empty array on empty history", () => {
      const empty = new RequestHistory();
      expect(empty.where(() => true)).toEqual([]);
    });
  });

  describe("all getter", () => {
    it("returns an empty array when history is empty", () => {
      expect(history.all).toEqual([]);
      expect(history.all).toHaveLength(0);
    });

    it("returns all recorded entries in insertion order", () => {
      history.record(makeReq({ lastMessage: "a" }), "r1");
      history.record(makeReq({ lastMessage: "b" }), "r2");

      const entries = history.all;
      expect(entries).toHaveLength(2);
      expect(entries[0].request.lastMessage).toBe("a");
      expect(entries[1].request.lastMessage).toBe("b");
    });

    it("returns a readonly array (same reference as internal entries)", () => {
      history.record(makeReq(), "r");
      const a = history.all;
      const b = history.all;
      expect(a).toBe(b);
    });

    it("reflects mutations after further records", () => {
      history.record(makeReq({ lastMessage: "before" }), "r");
      const ref = history.all;
      expect(ref).toHaveLength(1);

      history.record(makeReq({ lastMessage: "after" }), "r2");
      // `all` exposes the internal array, so the earlier reference sees the new entry
      expect(ref).toHaveLength(2);
    });
  });

  describe("clear()", () => {
    it("empties the history", () => {
      history.record(makeReq(), "r1");
      history.record(makeReq(), "r2");
      expect(history.count()).toBe(2);

      history.clear();
      expect(history.count()).toBe(0);
      expect(history.first()).toBeUndefined();
      expect(history.last()).toBeUndefined();
      expect(history.all).toHaveLength(0);
    });

    it("is idempotent on empty history", () => {
      history.clear();
      expect(history.count()).toBe(0);
      history.clear();
      expect(history.count()).toBe(0);
    });

    it("allows recording again after clear", () => {
      history.record(makeReq({ lastMessage: "old" }), "r1");
      history.clear();
      history.record(makeReq({ lastMessage: "new" }), "r2");

      expect(history.count()).toBe(1);
      expect(history.first()?.request.lastMessage).toBe("new");
    });
  });

  describe("Iterator protocol (for...of)", () => {
    it("iterates over all entries in order", () => {
      history.record(makeReq({ lastMessage: "a" }), "r1");
      history.record(makeReq({ lastMessage: "b" }), "r2");
      history.record(makeReq({ lastMessage: "c" }), "r3");

      const messages: string[] = [];
      for (const entry of history) {
        messages.push(entry.request.lastMessage);
      }

      expect(messages).toEqual(["a", "b", "c"]);
    });

    it("yields nothing for empty history", () => {
      const messages: string[] = [];
      for (const entry of history) {
        messages.push(entry.request.lastMessage);
      }
      expect(messages).toEqual([]);
    });

    it("works with spread operator", () => {
      history.record(makeReq({ lastMessage: "x" }), "r1");
      history.record(makeReq({ lastMessage: "y" }), "r2");

      const entries: RecordedRequest[] = [...history];
      expect(entries).toHaveLength(2);
      expect(entries[0].request.lastMessage).toBe("x");
      expect(entries[1].request.lastMessage).toBe("y");
    });

    it("works with Array.from()", () => {
      history.record(makeReq(), "r1");
      history.record(makeReq(), "r2");

      const arr = Array.from(history);
      expect(arr).toHaveLength(2);
    });

    it("supports destructuring", () => {
      history.record(makeReq({ lastMessage: "first" }), "r1");
      history.record(makeReq({ lastMessage: "second" }), "r2");
      history.record(makeReq({ lastMessage: "third" }), "r3");

      const [first, second, third] = history;
      expect(first.request.lastMessage).toBe("first");
      expect(second.request.lastMessage).toBe("second");
      expect(third.request.lastMessage).toBe("third");
    });
  });

  describe("edge cases", () => {
    it("preserves the full MockRequest object", () => {
      const req = makeReq({
        format: "anthropic",
        model: "claude-4",
        streaming: false,
        lastMessage: "test message",
        systemMessage: "be helpful",
        toolNames: ["search", "calc"],
        lastToolCallId: "call_123",
        path: "/v1/messages",
      });

      history.record(req, "complex-rule");
      const recorded = history.first()!;

      expect(recorded.request.format).toBe("anthropic");
      expect(recorded.request.model).toBe("claude-4");
      expect(recorded.request.streaming).toBe(false);
      expect(recorded.request.lastMessage).toBe("test message");
      expect(recorded.request.systemMessage).toBe("be helpful");
      expect(recorded.request.toolNames).toEqual(["search", "calc"]);
      expect(recorded.request.lastToolCallId).toBe("call_123");
      expect(recorded.request.path).toBe("/v1/messages");
    });

    it("handles many entries without issue", () => {
      for (let i = 0; i < 1000; i++) {
        history.record(makeReq({ lastMessage: `msg-${i}` }), `rule-${i}`);
      }

      expect(history.count()).toBe(1000);
      expect(history.first()?.request.lastMessage).toBe("msg-0");
      expect(history.last()?.request.lastMessage).toBe("msg-999");
      expect(history.at(500)?.request.lastMessage).toBe("msg-500");
    });

    it("where() does not modify the original entries", () => {
      history.record(makeReq(), "r1");
      history.record(makeReq(), "r2");

      const filtered = history.where(() => false);
      expect(filtered).toHaveLength(0);
      expect(history.count()).toBe(2);
    });

    it("each entry gets its own timestamp", () => {
      history.record(makeReq(), "r1");
      history.record(makeReq(), "r2");

      const t1 = history.at(0)!.timestamp;
      const t2 = history.at(1)!.timestamp;
      expect(t2).toBeGreaterThanOrEqual(t1);
    });
  });
});
