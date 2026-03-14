import { z } from "zod";

export { OpenAIRequestSchema, type OpenAIRequest } from "llm-schemas/openai/chat-completions";

const ToolCallResponseSchema = z.object({
  id: z.string(),
  type: z.string(),
  function: z.object({ name: z.string(), arguments: z.string() }),
});

const UsageSchema = z.object({
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  total_tokens: z.number(),
  prompt_tokens_details: z.object({
    cached_tokens: z.number().optional(),
    audio_tokens: z.number().optional(),
  }).optional(),
  completion_tokens_details: z.object({
    reasoning_tokens: z.number().optional(),
    audio_tokens: z.number().optional(),
    accepted_prediction_tokens: z.number().optional(),
    rejected_prediction_tokens: z.number().optional(),
  }).optional(),
});

export const OpenAIChunkSchema = z.object({
  id: z.string(),
  object: z.literal("chat.completion.chunk"),
  created: z.number(),
  model: z.string(),
  system_fingerprint: z.string().nullable().optional(),
  service_tier: z.string().optional(),
  choices: z.array(z.object({
    index: z.number(),
    delta: z.object({
      role: z.string(),
      content: z.string(),
      tool_calls: z.array(ToolCallResponseSchema),
    }).partial(),
    logprobs: z.unknown().nullable().optional(),
    finish_reason: z.string().nullable(),
  })),
  usage: UsageSchema.nullable().optional(),
});

export type OpenAIChunk = z.infer<typeof OpenAIChunkSchema>;

export const OpenAICompleteSchema = z.object({
  id: z.string(),
  object: z.literal("chat.completion"),
  created: z.number(),
  model: z.string(),
  system_fingerprint: z.string().nullable().optional(),
  service_tier: z.string().optional(),
  choices: z.array(z.object({
    index: z.number(),
    message: z.object({
      role: z.string(),
      content: z.string().nullable(),
      tool_calls: z.array(ToolCallResponseSchema).optional(),
    }),
    logprobs: z.unknown().nullable().optional(),
    finish_reason: z.string(),
  })),
  usage: UsageSchema.optional(),
});

export type OpenAIComplete = z.infer<typeof OpenAICompleteSchema>;

export const OpenAIErrorSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string(),
    code: z.string().nullable(),
  }),
});

export type OpenAIError = z.infer<typeof OpenAIErrorSchema>;
