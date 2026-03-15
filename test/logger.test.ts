import { describe, it, expect, vi, afterEach } from "vitest";
import { Logger, LEVEL_PRIORITY } from "../src/logger.js";
import type { LogLevel } from "../src/logger.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LEVEL_PRIORITY", () => {
  it("has the expected keys and ascending values", () => {
    expect(LEVEL_PRIORITY).toEqual({
      none: 0,
      error: 1,
      warning: 2,
      info: 3,
      debug: 4,
      all: 5,
    });
  });

  it("is ordered so that each named level is strictly higher than the previous", () => {
    expect(LEVEL_PRIORITY.none).toBeLessThan(LEVEL_PRIORITY.error);
    expect(LEVEL_PRIORITY.error).toBeLessThan(LEVEL_PRIORITY.warning);
    expect(LEVEL_PRIORITY.warning).toBeLessThan(LEVEL_PRIORITY.info);
    expect(LEVEL_PRIORITY.info).toBeLessThan(LEVEL_PRIORITY.debug);
    expect(LEVEL_PRIORITY.debug).toBeLessThan(LEVEL_PRIORITY.all);
  });
});

describe("Logger", () => {
  describe("constructor", () => {
    it("defaults to 'info' level when no argument is provided", () => {
      const logger = new Logger();
      expect(logger.level).toBe("info");
    });

    it("accepts an explicit level", () => {
      const logger = new Logger("debug");
      expect(logger.level).toBe("debug");
    });

    it("level property is readonly and accessible", () => {
      const logger = new Logger("warning");
      expect(logger.level).toBe("warning");
    });
  });

  describe("error()", () => {
    it("logs to console.error when level is 'error'", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const logger = new Logger("error");
      logger.error("something broke");
      expect(spy).toHaveBeenCalledOnce();
      expect(spy.mock.calls[0]![0]).toContain("something broke");
    });

    it("logs to console.error when level is 'info' (threshold above error)", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const logger = new Logger("info");
      logger.error("boom");
      expect(spy).toHaveBeenCalledOnce();
    });

    it("logs to console.error when level is 'all'", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const logger = new Logger("all");
      logger.error("critical");
      expect(spy).toHaveBeenCalledOnce();
    });

    it("is silent when level is 'none'", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const logger = new Logger("none");
      logger.error("should not appear");
      expect(spy).not.toHaveBeenCalled();
    });

    it("passes extra arguments through to console.error", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const logger = new Logger("error");
      const extra = { code: 500 };
      logger.error("fail", extra);
      expect(spy).toHaveBeenCalledOnce();
      expect(spy.mock.calls[0]).toContain(extra);
    });
  });

  describe("warn()", () => {
    it("logs to console.warn when level is 'warning'", () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const logger = new Logger("warning");
      logger.warn("heads up");
      expect(spy).toHaveBeenCalledOnce();
      expect(spy.mock.calls[0]![0]).toContain("heads up");
    });

    it("logs to console.warn when level is 'info' (threshold above warning)", () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const logger = new Logger("info");
      logger.warn("watch out");
      expect(spy).toHaveBeenCalledOnce();
    });

    it("logs to console.warn when level is 'debug'", () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const logger = new Logger("debug");
      logger.warn("careful");
      expect(spy).toHaveBeenCalledOnce();
    });

    it("is silent when level is 'error' (threshold below warning)", () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const logger = new Logger("error");
      logger.warn("should not appear");
      expect(spy).not.toHaveBeenCalled();
    });

    it("is silent when level is 'none'", () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const logger = new Logger("none");
      logger.warn("nope");
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe("info()", () => {
    it("logs to console.log when level is 'info'", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      const logger = new Logger("info");
      logger.info("status update");
      expect(spy).toHaveBeenCalledOnce();
      expect(spy.mock.calls[0]![0]).toContain("status update");
    });

    it("logs to console.log when level is 'debug' (threshold above info)", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      const logger = new Logger("debug");
      logger.info("still visible");
      expect(spy).toHaveBeenCalledOnce();
    });

    it("logs to console.log when level is 'all'", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      const logger = new Logger("all");
      logger.info("everything mode");
      expect(spy).toHaveBeenCalledOnce();
    });

    it("is silent when level is 'warning' (threshold below info)", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      const logger = new Logger("warning");
      logger.info("should not appear");
      expect(spy).not.toHaveBeenCalled();
    });

    it("is silent when level is 'error'", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      const logger = new Logger("error");
      logger.info("nope");
      expect(spy).not.toHaveBeenCalled();
    });

    it("is silent when level is 'none'", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      const logger = new Logger("none");
      logger.info("nothing");
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe("debug()", () => {
    it("logs to console.log when level is 'debug'", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      const logger = new Logger("debug");
      logger.debug("trace data");
      expect(spy).toHaveBeenCalledOnce();
      expect(spy.mock.calls[0]![0]).toContain("trace data");
    });

    it("logs to console.log when level is 'all'", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      const logger = new Logger("all");
      logger.debug("everything");
      expect(spy).toHaveBeenCalledOnce();
    });

    it("is silent when level is 'info' (threshold below debug)", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      const logger = new Logger("info");
      logger.debug("should not appear");
      expect(spy).not.toHaveBeenCalled();
    });

    it("is silent when level is 'warning'", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      const logger = new Logger("warning");
      logger.debug("nope");
      expect(spy).not.toHaveBeenCalled();
    });

    it("is silent when level is 'error'", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      const logger = new Logger("error");
      logger.debug("nope");
      expect(spy).not.toHaveBeenCalled();
    });

    it("is silent when level is 'none'", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      const logger = new Logger("none");
      logger.debug("nothing");
      expect(spy).not.toHaveBeenCalled();
    });

    it("passes extra arguments through to console.log", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      const logger = new Logger("debug");
      const obj = { detail: true };
      logger.debug("check", obj);
      expect(spy).toHaveBeenCalledOnce();
      expect(spy.mock.calls[0]).toContain(obj);
    });
  });

  describe("all methods silent at level 'none'", () => {
    it("produces no output for any method", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const logger = new Logger("none");
      logger.error("e");
      logger.warn("w");
      logger.info("i");
      logger.debug("d");

      expect(errorSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe("all methods active at level 'all'", () => {
    it("produces output for every method", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const logger = new Logger("all");
      logger.error("e");
      logger.warn("w");
      logger.info("i");
      logger.debug("d");

      expect(errorSpy).toHaveBeenCalledOnce();
      expect(warnSpy).toHaveBeenCalledOnce();
      // Info and debug both use console.log
      expect(logSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe("each level as constructor argument", () => {
    const cases: Array<{ level: LogLevel; expectError: boolean; expectWarn: boolean; expectInfo: boolean; expectDebug: boolean }> = [
      { level: "none",    expectError: false, expectWarn: false, expectInfo: false, expectDebug: false },
      { level: "error",   expectError: true,  expectWarn: false, expectInfo: false, expectDebug: false },
      { level: "warning", expectError: true,  expectWarn: true,  expectInfo: false, expectDebug: false },
      { level: "info",    expectError: true,  expectWarn: true,  expectInfo: true,  expectDebug: false },
      { level: "debug",   expectError: true,  expectWarn: true,  expectInfo: true,  expectDebug: true  },
      { level: "all",     expectError: true,  expectWarn: true,  expectInfo: true,  expectDebug: true  },
    ];

    for (const { level, expectError, expectWarn, expectInfo, expectDebug } of cases) {
      it(`level '${level}' enables the correct methods`, () => {
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

        const logger = new Logger(level);
        logger.error("e");
        logger.warn("w");
        logger.info("i");
        logger.debug("d");

        expect(errorSpy).toHaveBeenCalledTimes(expectError ? 1 : 0);
        expect(warnSpy).toHaveBeenCalledTimes(expectWarn ? 1 : 0);

        let expectedLogCalls = 0;
        if (expectInfo) expectedLogCalls++;
        if (expectDebug) expectedLogCalls++;
        expect(logSpy).toHaveBeenCalledTimes(expectedLogCalls);
      });
    }
  });
});
