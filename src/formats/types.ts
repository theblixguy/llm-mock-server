import type { FormatName, MockRequest } from "../types/request.js";
import type { ReplyObject, ReplyOptions } from "../types/reply.js";
import type { RequestMeta } from "./request-helpers.js";

export interface SSEChunk {
  readonly event?: string | undefined;
  readonly data: string;
}

export interface Format {
  readonly name: FormatName;
  readonly route: string;
  parseRequest(body: unknown, meta?: RequestMeta): MockRequest;
  isStreaming(body: unknown): boolean;
  serialize(
    reply: ReplyObject,
    model: string,
    options?: ReplyOptions,
  ): readonly SSEChunk[];
  serializeComplete(reply: ReplyObject, model: string): Record<string, unknown>;
  serializeError(error: {
    status: number;
    message: string;
    type?: string | undefined;
  }): Record<string, unknown>;
}
