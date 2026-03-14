import { z } from "zod";

const TextBlockSchema = z.object({ type: z.literal("text"), text: z.string() });

const ToolUseBlockSchema = z.object({
  type: z.literal("tool_use"),
  id: z.string(),
  name: z.string(),
  input: z.record(z.string(), z.unknown()),
});

const ToolResultBlockSchema = z.object({
  type: z.literal("tool_result"),
  tool_use_id: z.string(),
  content: z.union([z.string(), z.array(TextBlockSchema)]).optional(),
});

const KnownContentBlockSchema = z.discriminatedUnion("type", [
  TextBlockSchema,
  ToolUseBlockSchema,
  ToolResultBlockSchema,
]);

const LooseContentBlockSchema = z.union([
  KnownContentBlockSchema,
  z.looseObject({ type: z.string() }),
]);

const KNOWN_BLOCK_TYPES = new Set(["text", "tool_use", "tool_result"]);

type KnownBlock = z.infer<typeof KnownContentBlockSchema>;

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.union([
    z.string(),
    z.array(LooseContentBlockSchema).transform((blocks) =>
      blocks.filter((b): b is KnownBlock => KNOWN_BLOCK_TYPES.has(b.type)),
    ),
  ]),
});

const ToolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  input_schema: z.record(z.string(), z.unknown()),
});

export const AnthropicRequestSchema = z.looseObject({
  model: z.string().min(1),
  max_tokens: z.number().int().positive(),
  system: z.union([z.string(), z.array(TextBlockSchema)]).optional(),
  messages: z.array(MessageSchema).min(1),
  tools: z.array(ToolDefinitionSchema).optional(),
  stream: z.boolean().optional(),
  temperature: z.number().optional(),
  top_p: z.number().optional(),
  top_k: z.number().optional(),
  stop_sequences: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  cache_control: z.unknown().optional(),
  container: z.string().optional(),
  inference_geo: z.string().optional(),
  output_config: z.unknown().optional(),
  service_tier: z.string().optional(),
  thinking: z.unknown().optional(),
  tool_choice: z.unknown().optional(),
});

export type AnthropicRequest = z.infer<typeof AnthropicRequestSchema>;

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
  delta: z.object({
    type: z.string(),
    text: z.string().optional(),
    thinking: z.string().optional(),
    partial_json: z.string().optional(),
  }).optional(),
});

export type AnthropicBlockEvent = z.infer<typeof AnthropicBlockEventSchema>;

export const AnthropicDeltaSchema = z.object({
  delta: z.object({ stop_reason: z.string(), stop_sequence: z.string().nullable() }),
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
