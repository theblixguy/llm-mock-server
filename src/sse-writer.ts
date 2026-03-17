import type { FastifyReply } from "fastify";
import type { SSEChunk } from "./formats/types.js";
import type { ReplyOptions } from "./types/reply.js";

const HTTP_OK = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatSSEChunk(chunk: SSEChunk): string {
  const eventLine = chunk.event ? `event: ${chunk.event}\n` : "";
  return `${eventLine}data: ${chunk.data}\n\n`;
}

export async function writeSSE(
  reply: FastifyReply,
  chunks: readonly SSEChunk[],
  options: ReplyOptions = {},
): Promise<void> {
  const latency = options.latency ?? 0;

  reply.raw.writeHead(HTTP_OK, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  for (const chunk of chunks) {
    reply.raw.write(formatSSEChunk(chunk));
    if (latency > 0) await sleep(latency);
  }

  reply.raw.end();
}
