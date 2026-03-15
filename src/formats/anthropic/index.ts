import type { Format } from "../types.js";
import { isStreaming } from "../request-helpers.js";
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
