import type { ReplyObject, ReplyOptions } from "../../../types/reply.js";
import type { SSEChunk } from "../../types.js";
import {
  splitText,
  genId,
  toolId,
  finishReason,
  MS_PER_SECOND,
  DEFAULT_USAGE,
} from "../../serialize-helpers.js";

function buildUsage(usage: { input: number; output: number }) {
  return {
    prompt_tokens: usage.input,
    completion_tokens: usage.output,
    total_tokens: usage.input + usage.output,
    prompt_tokens_details: { cached_tokens: 0, audio_tokens: 0 },
    completion_tokens_details: {
      reasoning_tokens: 0,
      audio_tokens: 0,
      accepted_prediction_tokens: 0,
      rejected_prediction_tokens: 0,
    },
  };
}

function chunkEnvelope(
  id: string,
  created: number,
  model: string,
  delta: Record<string, unknown>,
  finish_reason: string | null = null,
  usage: Record<string, unknown> | null = null,
): SSEChunk {
  return {
    data: JSON.stringify({
      id,
      object: "chat.completion.chunk",
      created,
      model,
      system_fingerprint: null,
      service_tier: "default",
      choices: [{ index: 0, delta, logprobs: null, finish_reason }],
      usage,
    }),
  };
}

export function serialize(
  reply: ReplyObject,
  model: string,
  options: ReplyOptions = {},
): readonly SSEChunk[] {
  const id = genId("chatcmpl");
  const created = Math.floor(Date.now() / MS_PER_SECOND);
  const usage = reply.usage ?? DEFAULT_USAGE;

  const textChunks = reply.text
    ? splitText(reply.text, options.chunkSize ?? 0).map((piece) =>
        chunkEnvelope(id, created, model, { content: piece }),
      )
    : [];

  const toolChunks = (reply.tools ?? []).map((tool, i) =>
    chunkEnvelope(id, created, model, {
      tool_calls: [
        {
          index: i,
          id: toolId(tool, "call", i),
          type: "function",
          function: { name: tool.name, arguments: JSON.stringify(tool.args) },
        },
      ],
    }),
  );

  const usageChunk = buildUsage(usage);

  return [
    chunkEnvelope(id, created, model, { role: "assistant" }),
    ...textChunks,
    ...toolChunks,
    chunkEnvelope(
      id,
      created,
      model,
      {},
      finishReason(reply, "tool_calls", "stop"),
    ),
    chunkEnvelope(id, created, model, {}, null, usageChunk),
    { data: "[DONE]" },
  ];
}

export function serializeComplete(
  reply: ReplyObject,
  model: string,
): Record<string, unknown> {
  const id = genId("chatcmpl");
  const created = Math.floor(Date.now() / MS_PER_SECOND);
  const usage = reply.usage ?? DEFAULT_USAGE;

  const message: Record<string, unknown> = {
    role: "assistant",
    content: reply.text ?? null,
    ...(reply.tools?.length && {
      tool_calls: reply.tools.map((tool, i) => ({
        id: toolId(tool, "call", i),
        type: "function",
        function: { name: tool.name, arguments: JSON.stringify(tool.args) },
      })),
    }),
  };

  return {
    id,
    object: "chat.completion",
    created,
    model,
    system_fingerprint: null,
    service_tier: "default",
    choices: [
      {
        index: 0,
        message,
        logprobs: null,
        finish_reason: finishReason(reply, "tool_calls", "stop"),
      },
    ],
    usage: buildUsage(usage),
  };
}

export function serializeError(error: {
  status: number;
  message: string;
  type?: string;
}): Record<string, unknown> {
  return {
    error: {
      message: error.message,
      type: error.type ?? "server_error",
      code: null,
    },
  };
}
