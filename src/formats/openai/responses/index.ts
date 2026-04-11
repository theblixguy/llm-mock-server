import type { Format } from "#formats/types.js";
import { isStreaming } from "#formats/request-helpers.js";
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
