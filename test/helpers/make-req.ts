import type { MockRequest } from "../../src/types.js";

export function makeReq(overrides: Partial<MockRequest> = {}): MockRequest {
  return {
    format: "openai",
    model: "gpt-5.4",
    streaming: true,
    messages: [{ role: "user", content: "hello" }],
    lastMessage: "hello",
    systemMessage: "",
    toolNames: [],
    lastToolCallId: undefined,
    raw: {},
    headers: {},
    path: "/v1/chat/completions",
    ...overrides,
  };
}
