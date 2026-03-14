import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import type {
  Match, PendingRule, Reply, ReplyOptions, Resolver, Rule, RuleHandle, RuleSummary, SequenceEntry,
} from "./types.js";
import { RuleEngine } from "./rule-engine.js";
import { RequestHistory } from "./history.js";
import { openaiFormat } from "./formats/openai/index.js";
import { anthropicFormat } from "./formats/anthropic/index.js";
import { responsesFormat } from "./formats/responses/index.js";
import type { Format } from "./formats/types.js";
import { Logger } from "./logger.js";
import type { LogLevel } from "./logger.js";
import { createRouteHandler } from "./route-handler.js";

const formats: readonly Format[] = [openaiFormat, anthropicFormat, responsesFormat];

export interface MockServerOptions {
  readonly port?: number;
  /** Defaults to `"127.0.0.1"`. Set to `"0.0.0.0"` to listen on all interfaces. */
  readonly host?: string;
  /** Defaults to `"none"` (silent). */
  readonly logLevel?: LogLevel;
  /** Default ms delay between SSE chunks. Individual rules can override this. */
  readonly defaultLatency?: number;
  /** Default characters per SSE text chunk. Individual rules can override this. */
  readonly defaultChunkSize?: number;
}

/**
 * Mock LLM server that handles OpenAI, Anthropic, and Responses API formats.
 * Register rules with `when()`, point your SDK at `url`, and go.
 *
 * Supports `await using` for automatic cleanup.
 *
 * @example
 * ```ts
 * const server = new MockServer({ logLevel: "info" });
 * server.when("hello").reply("Hi there!");
 * await server.start();
 * // Point your client at server.url
 * await server.stop();
 * ```
 */
export class MockServer {
  private readonly app: FastifyInstance;
  private readonly engine = new RuleEngine();
  private readonly history_ = new RequestHistory();
  private readonly logger: Logger;
  private readonly host: string;
  private readonly defaultOptions: ReplyOptions;
  private fallbackReply: Reply = "Mock server: no matching rule.";
  private listening = false;

  constructor(options: MockServerOptions = {}) {
    this.host = options.host ?? "127.0.0.1";
    this.logger = new Logger(options.logLevel ?? "none");
    this.defaultOptions = {
      ...(options.defaultLatency !== undefined && { latency: options.defaultLatency }),
      ...(options.defaultChunkSize !== undefined && { chunkSize: options.defaultChunkSize }),
    };
    this.app = Fastify({ logger: false });

    const deps = {
      engine: this.engine,
      history: this.history_,
      logger: this.logger,
      defaultOptions: this.defaultOptions,
      getFallback: () => this.fallbackReply,
    };

    for (const format of formats) {
      this.app.post(format.route, createRouteHandler(format, deps));
    }
  }

  /**
   * Register a matching rule. Call `.reply()` on the result to set the response.
   *
   * @example
   * ```ts
   * server.when("hello").reply("Hi!");
   * server.when(/explain (\w+)/i).reply((req) => `Let me explain ${req.lastMessage}`);
   * server.when({ model: /claude/ }).reply("I'm Claude.");
   * ```
   */
  when(match: Match): PendingRule {
    const engine = this.engine;

    const makeHandle = (rule: Rule): RuleHandle => ({
      times(n: number): RuleHandle {
        rule.remaining = n;
        return this;
      },
      first(): RuleHandle {
        engine.moveToFront(rule);
        return this;
      },
    });

    return {
      reply(response: Resolver, options?: ReplyOptions): RuleHandle {
        return makeHandle(engine.add(match, response, options));
      },
      replySequence(entries: readonly SequenceEntry[]): RuleHandle {
        if (entries.length === 0) throw new Error("replySequence requires at least one entry.");
        let index = 0;
        const last = entries[entries.length - 1]!;
        const rule = engine.add(match, () => {
          const entry = entries[index++] ?? last;
          if (typeof entry === "string" || !("reply" in entry)) {
            rule.options = {};
            return entry;
          }
          rule.options = entry.options ?? {};
          return entry.reply;
        });
        rule.remaining = entries.length;
        return makeHandle(rule);
      },
    };
  }

  /**
   * Register a rule that matches when the request includes a tool with this name.
   *
   * @example
   * ```ts
   * server.whenTool("get_weather").reply({
   *   tools: [{ name: "get_weather", args: { location: "London" } }],
   * });
   * ```
   */
  whenTool(toolName: string): PendingRule {
    return this.when({ toolName });
  }

  /**
   * Register a rule that matches when the last message is a tool result with this call ID.
   *
   * @example
   * ```ts
   * server.whenToolResult("call_abc").reply("Got your result, cheers!");
   * ```
   */
  whenToolResult(toolCallId: string): PendingRule {
    return this.when({ toolCallId });
  }

  /**
   * Queue a one-shot error for the very next request, regardless of content.
   * Fires once then removes itself.
   *
   * @example
   * ```ts
   * server.nextError(429, "Rate limited");
   * // next request gets a 429, after that normal matching resumes
   * ```
   */
  nextError(status: number, message: string, type?: string): RuleHandle {
    return this.when(() => true)
      .reply({ error: { status, message, type } })
      .times(1)
      .first();
  }

  /** Set the reply used when no rule matches. Defaults to a generic message. */
  fallback(reply: Reply): void {
    this.fallbackReply = reply;
  }

  /** Load rules from a `.json5` file, a `.ts`/`.js` handler file, or a directory containing them. */
  async load(pathOrDir: string): Promise<void> {
    const before = this.engine.ruleCount;
    const { loadRulesFromPath } = await import("./loader.js");
    await loadRulesFromPath(pathOrDir, {
      engine: this.engine,
      setFallback: (reply) => { this.fallbackReply = reply; },
    });
    const loaded = this.engine.ruleCount - before;
    this.logger.info(`Loaded ${loaded} rule${loaded !== 1 ? "s" : ""} from ${pathOrDir}`);
  }

  /** Every request the server has handled. */
  get history(): RequestHistory {
    return this.history_;
  }

  /** Returns `true` when all rules with a `.times()` limit have been consumed. */
  isDone(): boolean {
    return this.engine.isDone();
  }

  /** Clear all rules, request history, and reset the fallback to its default. */
  reset(): void {
    this.engine.clear();
    this.history_.clear();
    this.fallbackReply = "Mock server: no matching rule.";
    this.logger.info("Server reset: rules and history cleared");
  }

  /** The base URL the server is listening on, e.g. `http://127.0.0.1:12345`. Throws if the server hasn't started. */
  get url(): string {
    if (!this.listening) throw new Error("Server is not running. Call start() first.");
    const addr = this.app.server.address();
    const port = addr !== null && typeof addr === "object" ? addr.port : 0;
    return `http://${this.host}:${port}`;
  }

  get ruleCount(): number {
    return this.engine.ruleCount;
  }

  /** A snapshot of all registered rules with their descriptions and remaining match counts. */
  get rules(): readonly RuleSummary[] {
    return this.engine.describe();
  }

  /** Start listening. Pass `0` (the default) for a random port. */
  async start(port = 0): Promise<void> {
    if (this.listening) throw new Error("Server is already running.");
    await this.app.listen({ port, host: this.host });
    this.listening = true;
    this.logger.info(`Listening on ${this.url}`);
  }

  async stop(): Promise<void> {
    if (!this.listening) return;
    await this.app.close();
    this.listening = false;
    this.logger.info("Server stopped");
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.stop();
  }
}
