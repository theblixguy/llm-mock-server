import type { Format } from "#/formats/types.js";
import { isStreaming } from "#/formats/request-helpers.js";
import { parseRequest } from "./parse.js";
import { serialize, serializeComplete, serializeError } from "./serialize.js";

export const anthropicFormat: Format = {
  name: "anthropic",
  route: "/v1/messages",
  parseRequest,
  isStreaming,
  serialize,
  serializeComplete,
  serializeError,
};
