export { MockServer } from "./mock-server.js";
export type { MockServerOptions } from "./mock-server.js";
export type { LogLevel } from "./logger.js";
export { RequestHistory } from "./history.js";
export type { RecordedRequest } from "./history.js";
export type {
  FormatName,
  MockRequest,
  Message,
  ToolDef,
  Reply,
  ReplyObject,
  ToolCall,
  Resolver,
  Match,
  MatchObject,
  ReplyOptions,
  ErrorReply,
  PendingRule,
  RuleHandle,
  RuleSummary,
  SequenceEntry,
  Handler,
} from "./types.js";

import { MockServer } from "./mock-server.js";
import type { MockServerOptions } from "./mock-server.js";

/**
 * Create a server and start it in one go.
 *
 * @example
 * ```ts
 * const server = await createMock({ port: 0, logLevel: "info" });
 * server.when("hello").reply("Hi!");
 * // run your tests
 * await server.stop();
 * ```
 */
export async function createMock(options: MockServerOptions = {}): Promise<MockServer> {
  const server = new MockServer(options);
  await server.start(options.port ?? 0);
  return server;
}
