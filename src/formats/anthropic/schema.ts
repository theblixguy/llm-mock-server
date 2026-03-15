import { z } from "zod";

export {
  AnthropicRequestSchema,
  type AnthropicRequest,
} from "llm-schemas/anthropic";

const ResponseContentBlockSchema = z.object({
  type: z.string(),
  text: z.string().optional(),
  thinking: z.string().optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  input: z.unknown().optional(),
});

export const AnthropicMessageStartSchema = z.object({
  message: z.object({
    id: z.string(),
    type: z.literal("message"),
    role: z.literal("assistant"),
    content: z.array(z.unknown()),
    model: z.string(),
    stop_reason: z.string().nullable(),
    usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }),
  }),
});

export type AnthropicMessageStart = z.infer<typeof AnthropicMessageStartSchema>;

export const AnthropicBlockEventSchema = z.object({
  index: z.number(),
  content_block: ResponseContentBlockSchema.optional(),
  delta: z
    .object({
      type: z.string(),
      text: z.string().optional(),
      thinking: z.string().optional(),
      partial_json: z.string().optional(),
    })
    .optional(),
});

export type AnthropicBlockEvent = z.infer<typeof AnthropicBlockEventSchema>;

export const AnthropicDeltaSchema = z.object({
  delta: z.object({
    stop_reason: z.string(),
    stop_sequence: z.string().nullable(),
  }),
  usage: z.object({ output_tokens: z.number() }),
});

export type AnthropicDelta = z.infer<typeof AnthropicDeltaSchema>;

export const AnthropicCompleteSchema = z.object({
  id: z.string(),
  type: z.literal("message"),
  role: z.literal("assistant"),
  model: z.string(),
  content: z.array(ResponseContentBlockSchema),
  stop_reason: z.string(),
  stop_sequence: z.string().nullable(),
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }),
});

export type AnthropicComplete = z.infer<typeof AnthropicCompleteSchema>;

export const AnthropicErrorSchema = z.object({
  type: z.literal("error"),
  error: z.object({ type: z.string(), message: z.string() }),
});

export type AnthropicError = z.infer<typeof AnthropicErrorSchema>;
