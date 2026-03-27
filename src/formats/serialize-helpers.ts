import type { ReplyObject } from "#/types/reply.js";

export const MS_PER_SECOND = 1000;
export const DEFAULT_USAGE = { input: 10, output: 5 } as const;

export function splitText(text: string, chunkSize: number): string[] {
  if (chunkSize <= 0 || text.length <= chunkSize) return [text];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

const ID_SUFFIX_LENGTH = 12;

function randomSuffix(): string {
  return crypto.randomUUID().replaceAll("-", "").slice(0, ID_SUFFIX_LENGTH);
}

export function genId(prefix: string): string {
  return `${prefix}_${randomSuffix()}`;
}

export function toolId(
  tool: { id?: string | undefined },
  prefix: string,
  index: number,
): string {
  return tool.id ?? `${prefix}_${randomSuffix()}_${index}`;
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
