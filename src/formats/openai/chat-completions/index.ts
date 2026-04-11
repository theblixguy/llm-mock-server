import type { Format } from "#formats/types.js";
import { isStreaming } from "#formats/request-helpers.js";
import { parseRequest } from "./parse.js";
import { serialize, serializeComplete, serializeError } from "./serialize.js";

export const chatCompletionsFormat: Format = {
  name: "openai",
  route: "/v1/chat/completions",
  parseRequest,
  isStreaming,
  serialize,
  serializeComplete,
  serializeError,
};
