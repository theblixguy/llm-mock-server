import type { FormatName, MockRequest, ReplyObject, ReplyOptions } from "../types.js";
import type { RequestMeta } from "./parse-helpers.js";

export interface SSEChunk {
  readonly event?: string | undefined;
  readonly data: string;
}

export interface Format {
  readonly name: FormatName;
  readonly route: string;
  parseRequest(body: unknown, meta?: RequestMeta): MockRequest;
  isStreaming(body: unknown): boolean;
  serialize(reply: ReplyObject, model: string, options?: ReplyOptions): readonly SSEChunk[];
  serializeComplete(reply: ReplyObject, model: string): unknown;
  serializeError(error: { status: number; message: string; type?: string | undefined }): unknown;
}
