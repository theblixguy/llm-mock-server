# llm-mock-server

A mock LLM server for testing. It handles OpenAI `/chat/completions`, Anthropic `/messages`, and OpenAI `/responses` API formats, with both streaming (SSE) and non-streaming responses. Point any client at it and get instant, deterministic replies.

## Table of contents

- [Quick start](#quick-start)
- [API endpoints](#api-endpoints)
- [Basic usage](#basic-usage)
  - [Matching rules](#matching-rules)
  - [Replies](#replies)
  - [Fallback](#fallback)
  - [Request history](#request-history)
- [Advanced usage](#advanced-usage)
  - [Tool matching](#tool-matching)
  - [Error injection](#error-injection)
  - [Rule lifecycle](#rule-lifecycle)
  - [Rule inspection](#rule-inspection)
  - [Streaming options](#streaming-options)
  - [Advanced patterns](#advanced-patterns)
- [Loading rules from files](#loading-rules-from-files)
  - [JSON5 format](#json5-format)
  - [Handler files](#handler-files)
- [Logging](#logging)
- [CLI](#cli)
- [Security](#security)
- [Architecture](#architecture)
- [API reference](#api-reference)
- [Licence](#licence)

## Quick start

```bash
npm install llm-mock-server
```

```typescript
import { createMock } from "llm-mock-server";

await using server = await createMock();
server.when("hello").reply("Hi there!");

// Point your OpenAI/Anthropic/Codex client at server.url
const response = await fetch(`${server.url}/v1/chat/completions`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "gpt-5.4",
    messages: [{ role: "user", content: "hello" }],
    stream: false,
  }),
});
// server.stop() is called automatically when the scope exits
```

The same rule matches on all three endpoints, so you don't need to set up separate mocks per provider. By default it binds to `127.0.0.1`. Pass `host: "0.0.0.0"` if you need it reachable from other machines or containers.

## API endpoints

| Route | Format |
| ----- | ------ |
| `POST /v1/chat/completions` | OpenAI |
| `POST /v1/messages` | Anthropic |
| `POST /v1/responses` | OpenAI Responses |

All three support streaming and non-streaming responses.

## Basic usage

### Matching rules

Rules are evaluated in order and the first match wins. A string does case-insensitive substring matching on the last user message. You can also use regex, object matchers, or predicate functions.

```typescript
server.when("hello").reply("Hi!");
server.when(/explain (\w+)/i).reply("Here's an explanation.");

// Match on model, system prompt, format, or tool presence
server.when({ model: /claude/, system: /pirate/ }).reply("Arrr!");
server.when({ format: "anthropic" }).reply("Anthropic request detected.");

// Predicate function for full control
server.when((req) => req.messages.length > 5).reply("Long conversation!");

// Combine structured fields with a predicate
server.when({
  model: /claude/,
  predicate: (req) => req.headers["x-team"] === "alpha",
}).reply("Alpha team on Claude!");
```

### Replies

Replies can be strings, objects, or functions.

```typescript
server.when("hello").reply("Hi!");

// Extended thinking (works with Anthropic and Responses formats)
server.when("think").reply({ text: "42", reasoning: "Let me work through this..." });

server.when("weather").reply({
  tools: [{ name: "get_weather", args: { location: "London" } }],
});

// Dynamic reply based on the request
server.when("echo").reply((req) => `You said: ${req.lastMessage}`);

// Async resolvers work too
server.when("slow").reply(async (req) => {
  return { text: "Done thinking." };
});
```

### Fallback

When no rule matches, the server uses a fallback reply. You can change it to whatever you like.

```typescript
server.fallback("I don't understand.");
server.fallback({ error: { status: 404, message: "No matching rule" } });
```

You can also set the fallback from a JSON5 file or handler file. See [loading rules from files](#loading-rules-from-files).

### Request history

Every request that hits the server gets recorded. You can query it with fluent methods in your test assertions.

```typescript
server.when("hello").reply("Hi!");

await post("/v1/chat/completions", { ... });

expect(server.history.count()).toBe(1);
expect(server.history.last()?.request.lastMessage).toBe("hello");
expect(server.history.first()?.rule).toBe('"hello"');

const matched = server.history.where(r => r.rule !== undefined);

for (const entry of server.history) {
  console.log(entry.request.lastMessage);
}

const last = server.history.last();
console.log(last?.request.headers["authorization"]);
console.log(last?.request.path);
```

## Advanced usage

### Tool matching

```typescript
server.whenTool("get_weather").reply({
  tools: [{ name: "get_weather", args: { location: "London" } }],
});

server.whenToolResult("call_abc").reply("Got your result!");
```

### Error injection

Errors are first-class replies and follow the same rule system as everything else.

```typescript
// One-shot error for the next request, then back to normal
server.nextError(429, "Rate limited");

// Pattern-matched error that fires every time
server.when("fail").reply({ error: { status: 500, message: "Internal error" } });
```

### Rule lifecycle

```typescript
server.when("hello").reply("Hi!").times(2);
server.when("catch-all").reply("Fallback.").first();
server.when("hello").reply("First time only!").times(1).first();

server.isDone(); // true when all .times() rules are consumed
```

### Rule inspection

You can see what rules are registered and how many matches they have left.

```typescript
server.when("hello").reply("Hi!");
server.when(/bye/i).reply("Goodbye!").times(3);

server.rules;
// [{ description: '"hello"', remaining: Infinity }, { description: '/bye/i', remaining: 3 }]
```

### Streaming options

You can control how text gets chunked during SSE streaming, both per-rule and at the server level.

```typescript
server.when("hello").reply("Hello, world!", { latency: 50, chunkSize: 5 });

const server = new MockServer({ defaultLatency: 30, defaultChunkSize: 10 });
```

### Advanced patterns

These show how to combine the building blocks for more complex scenarios.

#### Reply sequences

Instead of registering multiple rules for multi-turn conversations, pass an array. Each match advances through the sequence. Once exhausted, the rule stops matching and falls through to the next rule or fallback.

```typescript
server.when("next step").replySequence([
  "Starting the engine.",
  "Engine is running.",
  { reply: { text: "All done." }, options: { latency: 100 } },
]);
```

#### Conditional replies

Use a function resolver when the reply depends on the request content.

```typescript
server.when("status").reply((req) => {
  const hasTools = req.toolNames.length > 0;
  return hasTools ? "Tools are available." : "No tools configured.";
});
```

#### Simulating flaky APIs

Use a closure to fail every Nth request.

```typescript
let count = 0;
server.when(() => ++count % 3 === 0)
  .reply({ error: { status: 503, message: "Service unavailable" } })
  .first();
```

#### Async lookups

Resolvers can be async if you need to compute the reply.

```typescript
server.when("data").reply(async (req) => {
  const result = await someAsyncOperation(req.lastMessage);
  return { text: result };
});
```

#### Matching on multiple conditions

Structured fields and predicates combine with AND logic.

```typescript
server.when({
  model: /gpt/,
  format: "openai",
  system: /you are a translator/i,
  predicate: (req) => req.messages.length > 2,
}).reply("Translated output here.");
```

## Loading rules from files

Rules can live in JSON5 files or TypeScript handler files. You can load a single file or a whole directory.

```typescript
await server.load("./rules");
```

### JSON5 format

`rules/greetings.json5`:

```json5
[
  {
    when: "hello",
    reply: "Hi there!",
  },
  {
    when: "/explain (\\w+)/i",
    reply: "Here's an explanation.",
    times: 3,
  },
  {
    when: { model: "gpt-5.4", message: "hello" },
    reply: { text: "Hi from GPT!", reasoning: "Simple greeting." },
  },
]
```

If you have replies that repeat across multiple rules, you can define them once as templates. Use a `$name` reference in the `reply` field to pull from the templates section.

`rules/with-templates.json5`:

```json5
{
  templates: {
    weatherTool: { tools: [{ name: "get_weather", args: { location: "London" } }] },
    done: "All done!",
  },
  rules: [
    { when: "forecast", reply: "$weatherTool" },
    { when: "weather", reply: "$weatherTool" },
    { when: "finish", reply: "$done" },
  ],
}
```

Sequences work in JSON5 too. Use `replies` instead of `reply` to define a multi-step sequence.

`rules/conversation.json5`:

```json5
[
  {
    when: "next step",
    replies: [
      "Starting the engine.",
      { reply: "Engine is running.", latency: 50 },
      "All done.",
    ],
  },
]
```

You can also set a fallback reply in the object format.

`rules/with-fallback.json5`:

```json5
{
  fallback: "Sorry, I don't know about that.",
  rules: [
    { when: "hello", reply: "Hi!" },
  ],
}
```

Both bare arrays and the object format work. Use bare arrays for simple cases and the object format when you need templates, sequences, or fallbacks.

### Handler files

`rules/echo.ts`:

```typescript
import type { Handler } from "llm-mock-server";

export default {
  match: (req) => req.lastMessage.includes("echo"),
  respond: (req) => `Echo: ${req.lastMessage}`,
} satisfies Handler;
```

Using `satisfies Handler` catches typos and wrong field names at compile time. The server also validates the shape at load time with Zod, so you get a clear error either way.

Handler files can export an array of handlers. To set a fallback, export a named `fallback` alongside the default:

```typescript
import type { Handler } from "llm-mock-server";

export const fallback = "I'm not sure about that.";
export default {
  match: (req) => req.lastMessage.includes("echo"),
  respond: (req) => `Echo: ${req.lastMessage}`,
} satisfies Handler;
```

## Logging

```typescript
const server = new MockServer({ logLevel: "info" });
```

The available levels are `none`, `error`, `warning`, `info`, `debug`, and `all`. At `info` you get one line per request. At `debug` you also get the parsed request details and reply previews.

## CLI

```bash
llm-mock-server [options]
```

| Option | Short | Default | Description |
| ------ | ----- | ------- | ----------- |
| `--port` | `-p` | `5555` | Port to listen on |
| `--host` | `-H` | `127.0.0.1` | Host to bind to |
| `--rules` | `-r` | | Path to rules file or directory |
| `--handler` | | | Path to handler file |
| `--latency` | `-l` | `0` | Ms between SSE chunks |
| `--chunk-size` | `-c` | `0` | Characters per SSE chunk |
| `--fallback` | `-f` | | Fallback reply text |
| `--watch` | `-w` | | Watch rules path and reload on changes |
| `--log-level` | | `info` | Log verbosity |

```bash
llm-mock-server -p 8080 -r ./rules --log-level debug

# Auto-reload rules when files change
llm-mock-server -r ./rules --watch
```

## Security

This is a testing tool, not a production service. It's designed to run locally or in CI, loading rule files that you wrote. A few things to be aware of.

### Handler files execute code

When you call `server.load()` or pass `--handler` on the CLI, `.ts`/`.js` files are loaded via dynamic `import()`. They run with the same permissions as the rest of your Node.js process. Only load files you trust.

### JSON5 rule files are data only

They go through Zod validation at load time and never execute code. Regex patterns in rule files are compiled with `new RegExp()`, which is safe but could hang on pathological patterns if you write something like `/^(a+)+$/`. Keep patterns simple.

### Network binding

The server binds to `127.0.0.1` by default, so it's only reachable from your machine. If you bind to `0.0.0.0`, anything on the network can send requests to it. That's fine for container setups, just be aware of it.

### Request limits

Request bodies are capped at 1 MB by Fastify's default. Responses are serialised through JSON, so there's no injection risk in the SSE output.

## Architecture

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the codebase is structured, the request lifecycle, rule matching, and response serialisation.

## API reference

Full API docs are available [here](https://theblixguy.github.io/llm-mock-server/).

## Licence

MIT License

Copyright (c) 2026 Suyash Srijan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
