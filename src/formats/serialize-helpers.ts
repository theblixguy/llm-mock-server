import type { ReplyObject } from "../types.js";

export const MS_PER_SECOND = 1000;
const BASE_36 = 36;
export const DEFAULT_USAGE = { input: 10, output: 5 } as const;

export function splitText(text: string, chunkSize: number): string[] {
  if (chunkSize <= 0 || text.length <= chunkSize) return [text];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

export function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(BASE_36)}`;
}

export function toolId(
  tool: { id?: string | undefined },
  prefix: string,
  index: number,
): string {
  return tool.id ?? `${prefix}_${Date.now().toString(BASE_36)}_${index}`;
}

export function shouldEmitText(reply: ReplyObject): boolean {
  return Boolean(reply.text) || (!reply.tools?.length && !reply.reasoning);
}

export function finishReason(
  reply: ReplyObject,
  onTools: string,
  onStop: string,
): string {
  return reply.tools?.length ? onTools : onStop;
}
