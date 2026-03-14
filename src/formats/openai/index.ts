import type { Format } from "../types.js";
import { isStreaming } from "../parse-helpers.js";
import { parseRequest } from "./parse.js";
import { serialize, serializeComplete, serializeError } from "./serialize.js";

export const openaiFormat: Format = {
  name: "openai",
  route: "/v1/chat/completions",
  parseRequest,
  isStreaming,
  serialize,
  serializeComplete,
  serializeError,
};
