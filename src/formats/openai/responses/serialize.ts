import type { ReplyObject, ReplyOptions, ToolCall } from "#/types/reply.js";
import type { SSEChunk } from "#/formats/types.js";
import {
  splitText,
  genId,
  toolId,
  shouldEmitText,
  MS_PER_SECOND,
  DEFAULT_USAGE,
} from "#/formats/serialize-helpers.js";

function buildUsage(usage: { input: number; output: number }) {
  return {
    input_tokens: usage.input,
    output_tokens: usage.output,
    total_tokens: usage.input + usage.output,
  };
}

interface StreamBlock {
  chunks: SSEChunk[];
  outputItem: unknown;
}

const NO_ANNOTATIONS: readonly unknown[] = [];

type Chunk = (payload: Record<string, unknown>) => SSEChunk;

function createChunk(): Chunk {
  let seq = 0;
  return (payload) => ({
    data: JSON.stringify({ ...payload, sequence_number: seq++ }),
  });
}

function reasoningStreamBlock(
  c: Chunk,
  i: number,
  reasoning: string,
): StreamBlock {
  const itemId = `rs_${genId("rs")}`;
  const summaryPart = { type: "summary_text" as const, text: reasoning };
  const item = {
    type: "reasoning",
    id: itemId,
    status: "completed",
    summary: [summaryPart],
  };

  return {
    outputItem: item,
    chunks: [
      c({
        type: "response.output_item.added",
        output_index: i,
        item: {
          type: "reasoning",
          id: itemId,
          status: "in_progress",
          summary: [],
        },
      }),
      c({
        type: "response.reasoning_summary_part.added",
        item_id: itemId,
        output_index: i,
        summary_index: 0,
        part: { type: "summary_text", text: "" },
      }),
      c({
        type: "response.reasoning_summary_text.delta",
        item_id: itemId,
        output_index: i,
        summary_index: 0,
        delta: reasoning,
      }),
      c({
        type: "response.reasoning_summary_text.done",
        item_id: itemId,
        output_index: i,
        summary_index: 0,
        text: reasoning,
      }),
      c({
        type: "response.reasoning_summary_part.done",
        item_id: itemId,
        output_index: i,
        summary_index: 0,
        part: summaryPart,
      }),
      c({ type: "response.output_item.done", output_index: i, item }),
    ],
  };
}

function textStreamBlock(
  c: Chunk,
  i: number,
  text: string,
  chunkSize: number,
): StreamBlock {
  const itemId = `msg_${genId("msg")}`;
  const outputText = {
    type: "output_text" as const,
    text,
    annotations: NO_ANNOTATIONS,
  };
  const outputItem = {
    type: "message",
    id: itemId,
    status: "completed",
    role: "assistant",
    content: [outputText],
  };

  return {
    outputItem,
    chunks: [
      c({
        type: "response.output_item.added",
        output_index: i,
        item: {
          type: "message",
          id: itemId,
          status: "in_progress",
          role: "assistant",
          content: [],
        },
      }),
      c({
        type: "response.content_part.added",
        item_id: itemId,
        output_index: i,
        content_index: 0,
        part: { type: "output_text", text: "", annotations: [] },
      }),
      ...splitText(text, chunkSize).map((piece) =>
        c({
          type: "response.output_text.delta",
          item_id: itemId,
          output_index: i,
          content_index: 0,
          delta: piece,
        }),
      ),
      c({
        type: "response.output_text.done",
        item_id: itemId,
        output_index: i,
        content_index: 0,
        text,
      }),
      c({
        type: "response.content_part.done",
        item_id: itemId,
        output_index: i,
        content_index: 0,
        part: outputText,
      }),
      c({
        type: "response.output_item.done",
        output_index: i,
        item: outputItem,
      }),
    ],
  };
}

function toolStreamBlock(c: Chunk, i: number, tool: ToolCall): StreamBlock {
  const callId = toolId(tool, "call", i);
  const argsJson = JSON.stringify(tool.args);
  const outputItem = {
    type: "function_call",
    id: callId,
    status: "completed",
    name: tool.name,
    call_id: callId,
    arguments: argsJson,
  };

  return {
    outputItem,
    chunks: [
      c({
        type: "response.output_item.added",
        output_index: i,
        item: { ...outputItem, status: "in_progress", arguments: "" },
      }),
      c({
        type: "response.function_call_arguments.delta",
        item_id: callId,
        output_index: i,
        delta: argsJson,
      }),
      c({
        type: "response.function_call_arguments.done",
        item_id: callId,
        output_index: i,
        arguments: argsJson,
      }),
      c({
        type: "response.output_item.done",
        output_index: i,
        item: outputItem,
      }),
    ],
  };
}

export function serialize(
  reply: ReplyObject,
  model: string,
  options: ReplyOptions = {},
): readonly SSEChunk[] {
  const id = genId("resp");
  const createdAt = Math.floor(Date.now() / MS_PER_SECOND);
  const usage = reply.usage ?? DEFAULT_USAGE;
  const c = createChunk();
  let i = 0;

  const baseResponse = { id, object: "response", created_at: createdAt, model };
  const header = [
    c({
      type: "response.created",
      response: { ...baseResponse, status: "in_progress", output: [] },
    }),
    c({
      type: "response.in_progress",
      response: { ...baseResponse, status: "in_progress", output: [] },
    }),
  ];

  const blocks: StreamBlock[] = [
    ...(reply.reasoning ? [reasoningStreamBlock(c, i++, reply.reasoning)] : []),
    ...(shouldEmitText(reply)
      ? [textStreamBlock(c, i++, reply.text ?? "", options.chunkSize ?? 0)]
      : []),
    ...(reply.tools ?? []).map((tool) => toolStreamBlock(c, i++, tool)),
  ];

  const allChunks = blocks.flatMap((b) => b.chunks);
  const output = blocks.map((b) => b.outputItem);

  return [
    ...header,
    ...allChunks,
    c({
      type: "response.completed",
      response: {
        ...baseResponse,
        status: "completed",
        output,
        usage: buildUsage(usage),
      },
    }),
  ];
}

export function serializeComplete(
  reply: ReplyObject,
  model: string,
): Record<string, unknown> {
  const id = genId("resp");
  const createdAt = Math.floor(Date.now() / MS_PER_SECOND);
  const usage = reply.usage ?? DEFAULT_USAGE;

  const output: unknown[] = [
    ...(reply.reasoning
      ? [
          {
            type: "reasoning",
            id: `rs_${genId("rs")}`,
            status: "completed",
            summary: [{ type: "summary_text", text: reply.reasoning }],
          },
        ]
      : []),
    ...(shouldEmitText(reply)
      ? [
          {
            type: "message",
            id: `msg_${genId("msg")}`,
            status: "completed",
            role: "assistant",
            content: [
              { type: "output_text", text: reply.text ?? "", annotations: [] },
            ],
          },
        ]
      : []),
    ...(reply.tools ?? []).map((tool, i) => {
      const callId = toolId(tool, "call", i);
      return {
        type: "function_call",
        id: callId,
        status: "completed",
        name: tool.name,
        call_id: callId,
        arguments: JSON.stringify(tool.args),
      };
    }),
  ];

  return {
    id,
    object: "response",
    created_at: createdAt,
    status: "completed",
    model,
    output,
    usage: buildUsage(usage),
  };
}

export function serializeError(error: {
  status: number;
  message: string;
  type?: string;
}): Record<string, unknown> {
  return {
    type: "error",
    error: {
      message: error.message,
      type: error.type ?? "server_error",
      code: error.type ?? "server_error",
    },
  };
}
