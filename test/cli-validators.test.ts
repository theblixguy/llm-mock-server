import { describe, it, expect } from "vitest";
import {
  parsePort,
  parseHost,
  parseChunkSize,
  parseLogLevel,
  parseLatency,
} from "#cli/validators.js";

describe("parsePort", () => {
  it("parses a valid port", () => {
    expect(parsePort("5555")).toBe(5555);
  });

  it("accepts port 1", () => {
    expect(parsePort("1")).toBe(1);
  });

  it("accepts port 65535", () => {
    expect(parsePort("65535")).toBe(65535);
  });

  it("throws on port 0", () => {
    expect(() => parsePort("0")).toThrow('Invalid port "0"');
  });

  it("throws on port above 65535", () => {
    expect(() => parsePort("65536")).toThrow('Invalid port "65536"');
  });

  it("throws on negative port", () => {
    expect(() => parsePort("-1")).toThrow('Invalid port "-1"');
  });

  it("throws on non-numeric string", () => {
    expect(() => parsePort("abc")).toThrow('Invalid port "abc"');
  });

  it("throws on empty string", () => {
    expect(() => parsePort("")).toThrow('Invalid port ""');
  });

  it("throws on floating point", () => {
    expect(() => parsePort("80.5")).toThrow('Invalid port "80.5"');
  });

  it("throws on numeric string with trailing chars", () => {
    expect(() => parsePort("80abc")).toThrow('Invalid port "80abc"');
  });
});

describe("parseLogLevel", () => {
  it.each(["none", "error", "warning", "info", "debug", "all"] as const)(
    "accepts %s",
    (level) => {
      expect(parseLogLevel(level)).toBe(level);
    },
  );

  it("throws on invalid level", () => {
    expect(() => parseLogLevel("verbose")).toThrow(
      'Invalid log level "verbose"',
    );
  });

  it("throws on empty string", () => {
    expect(() => parseLogLevel("")).toThrow('Invalid log level ""');
  });
});

describe("parseHost", () => {
  it("accepts 127.0.0.1", async () => {
    await expect(parseHost("127.0.0.1")).resolves.toBe("127.0.0.1");
  });

  it("accepts 0.0.0.0", async () => {
    await expect(parseHost("0.0.0.0")).resolves.toBe("0.0.0.0");
  });

  it("accepts localhost", async () => {
    await expect(parseHost("localhost")).resolves.toBe("localhost");
  });

  it("accepts an IPv6 address", async () => {
    await expect(parseHost("::1")).resolves.toBe("::1");
  });

  it("rejects an empty string", async () => {
    await expect(parseHost("")).rejects.toThrow('Invalid host ""');
  });

  it("rejects an unresolvable hostname", async () => {
    await expect(parseHost("not.a.real.host.invalid")).rejects.toThrow(
      "Invalid host",
    );
  });

  it("rejects a string with spaces", async () => {
    await expect(parseHost("local host")).rejects.toThrow(
      'Invalid host "local host"',
    );
  });
});

describe("parseLatency", () => {
  it("parses a valid latency", () => {
    expect(parseLatency("100")).toBe(100);
  });

  it("accepts zero", () => {
    expect(parseLatency("0")).toBe(0);
  });

  it("throws on negative value", () => {
    expect(() => parseLatency("-1")).toThrow('Invalid latency "-1"');
  });

  it("throws on non-numeric value", () => {
    expect(() => parseLatency("abc")).toThrow('Invalid latency "abc"');
  });

  it("throws on empty string", () => {
    expect(() => parseLatency("")).toThrow('Invalid latency ""');
  });

  it("throws on floating point", () => {
    expect(() => parseLatency("50.7")).toThrow('Invalid latency "50.7"');
  });

  it("throws on numeric string with trailing chars", () => {
    expect(() => parseLatency("50abc")).toThrow('Invalid latency "50abc"');
  });
});

describe("parseChunkSize", () => {
  it("parses a valid chunk size", () => {
    expect(parseChunkSize("20")).toBe(20);
  });

  it("accepts zero", () => {
    expect(parseChunkSize("0")).toBe(0);
  });

  it("throws on negative value", () => {
    expect(() => parseChunkSize("-5")).toThrow('Invalid chunk size "-5"');
  });

  it("throws on non-numeric value", () => {
    expect(() => parseChunkSize("abc")).toThrow('Invalid chunk size "abc"');
  });
});
