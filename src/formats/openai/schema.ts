import { z } from "zod";

const ContentPartSchema = z.looseObject({
  type: z.string(),
  text: z.string().optional(),
});

const MessageSchema = z.object({
  role: z.enum(["system", "developer", "user", "assistant", "tool"]).optional(),
  content: z.union([z.string(), z.array(ContentPartSchema), z.null()]).optional(),
  name: z.string().optional(),
  tool_calls: z.array(z.object({
    index: z.number().optional(),
    id: z.string().optional(),
    type: z.string().optional(),
    function: z.object({
      name: z.string(),
      arguments: z.string(),
    }),
  })).optional(),
  tool_call_id: z.string().optional(),
});

const ToolSchema = z.object({
  type: z.string(),
  function: z.object({
    name: z.string(),
    description: z.string().optional(),
    parameters: z.record(z.string(), z.unknown()).optional(),
  }),
});

export const OpenAIRequestSchema = z.looseObject({
  model: z.string().min(1),
  messages: z.array(MessageSchema).min(1),
  temperature: z.number().optional(),
  top_p: z.number().optional(),
  n: z.number().optional(),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  max_tokens: z.number().optional(),
  presence_penalty: z.number().optional(),
  frequency_penalty: z.number().optional(),
  tools: z.array(ToolSchema).optional(),
  stream: z.boolean().optional(),
  tool_choice: z.unknown().optional(),
  user: z.string().optional(),
  audio: z.unknown().optional(),
  function_call: z.unknown().optional(),
  functions: z.array(z.unknown()).optional(),
  logit_bias: z.record(z.string(), z.number()).optional(),
  logprobs: z.boolean().optional(),
  max_completion_tokens: z.number().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  modalities: z.array(z.string()).optional(),
  parallel_tool_calls: z.boolean().optional(),
  prediction: z.unknown().optional(),
  prompt_cache_key: z.string().optional(),
  prompt_cache_retention: z.string().optional(),
  reasoning_effort: z.string().optional(),
  response_format: z.unknown().optional(),
  safety_identifier: z.string().optional(),
  seed: z.number().optional(),
  service_tier: z.string().optional(),
  store: z.boolean().optional(),
  stream_options: z.unknown().optional(),
  top_logprobs: z.number().optional(),
  verbosity: z.string().optional(),
  web_search_options: z.unknown().optional(),
});

export type OpenAIRequest = z.infer<typeof OpenAIRequestSchema>;

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
