import type { Format } from "../types.js";
import { isStreaming } from "../parse-helpers.js";
import { parseRequest } from "./parse.js";
import { serialize, serializeComplete, serializeError } from "./serialize.js";

export const responsesFormat: Format = {
  name: "responses",
  route: "/v1/responses",
  parseRequest,
  isStreaming,
  serialize,
  serializeComplete,
  serializeError,
};
