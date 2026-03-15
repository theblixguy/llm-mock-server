import type { ReplyObject, ReplyOptions } from "../../types.js";
import type { SSEChunk } from "../types.js";
import { splitText, genId, toolId, shouldEmitText, finishReason, DEFAULT_USAGE } from "../serialize-helpers.js";

function buildUsage(usage: { input: number; output: number }) {
  return { input_tokens: usage.input, output_tokens: usage.output };
}

function contentBlock(index: number, startBlock: unknown, deltas: SSEChunk[]): SSEChunk[] {
  return [
    { event: "content_block_start", data: JSON.stringify({ type: "content_block_start", index, content_block: startBlock }) },
    ...deltas,
    { event: "content_block_stop", data: JSON.stringify({ type: "content_block_stop", index }) },
  ];
}

function delta(index: number, payload: Record<string, unknown>): SSEChunk {
  return { event: "content_block_delta", data: JSON.stringify({ type: "content_block_delta", index, delta: payload }) };
}

function reasoningBlock(i: number, reasoning: string): SSEChunk[] {
  return contentBlock(i, { type: "thinking", thinking: "" }, [
    delta(i, { type: "thinking_delta", thinking: reasoning }),
  ]);
}

function textBlock(i: number, text: string, chunkSize: number): SSEChunk[] {
  return contentBlock(
    i,
    { type: "text", text: "" },
    splitText(text, chunkSize).map((piece) => delta(i, { type: "text_delta", text: piece })),
  );
}

function toolBlocks(startIndex: number, tools: ReplyObject["tools"]): SSEChunk[] {
  return (tools ?? []).flatMap((tool, i) => {
    const idx = startIndex + i;
    const id = toolId(tool, "toolu", idx);
    return contentBlock(
      idx,
      { type: "tool_use", id, name: tool.name, input: {} },
      [delta(idx, { type: "input_json_delta", partial_json: JSON.stringify(tool.args) })],
    );
  });
}

export function serialize(reply: ReplyObject, model: string, options: ReplyOptions = {}): readonly SSEChunk[] {
  const id = genId("msg");
  const usage = reply.usage ?? DEFAULT_USAGE;
  let idx = 0;

  const reasoningChunks = reply.reasoning ? reasoningBlock(idx++, reply.reasoning) : [];
  const textChunks = shouldEmitText(reply) ? textBlock(idx++, reply.text ?? "", options.chunkSize ?? 0) : [];
  const toolChunks = toolBlocks(idx, reply.tools);

  return [
    { event: "message_start", data: JSON.stringify({
      type: "message_start",
      message: { id, type: "message", role: "assistant", model, content: [], stop_reason: null, usage: { ...buildUsage(usage), output_tokens: 0 } },
    })},
    ...reasoningChunks,
    ...textChunks,
    ...toolChunks,
    { event: "message_delta", data: JSON.stringify({
      type: "message_delta",
      delta: { stop_reason: finishReason(reply, "tool_use", "end_turn"), stop_sequence: null },
      usage: { output_tokens: usage.output },
    })},
    { event: "message_stop", data: JSON.stringify({ type: "message_stop" }) },
  ];
}

export function serializeComplete(reply: ReplyObject, model: string): Record<string, unknown> {
  const id = genId("msg");
  const usage = reply.usage ?? DEFAULT_USAGE;

  const content: unknown[] = [
    ...(reply.reasoning ? [{ type: "thinking", thinking: reply.reasoning }] : []),
    ...(shouldEmitText(reply) ? [{ type: "text", text: reply.text ?? "" }] : []),
    ...(reply.tools ?? []).map((tool) => ({
      type: "tool_use", id: toolId(tool, "toolu", 0), name: tool.name, input: tool.args,
    })),
  ];

  return {
    id, type: "message", role: "assistant", model, content,
    stop_reason: finishReason(reply, "tool_use", "end_turn"),
    stop_sequence: null,
    usage: buildUsage(usage),
  };
}

export function serializeError(error: { status: number; message: string; type?: string }): Record<string, unknown> {
  return { type: "error", error: { type: error.type ?? "api_error", message: error.message } };
}
