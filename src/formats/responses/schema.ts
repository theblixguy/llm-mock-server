import { z } from "zod";

const InputMessageSchema = z.object({
  type: z.literal("message").optional(),
  role: z.enum(["user", "assistant", "system", "developer"]),
  content: z.union([z.string(), z.array(z.record(z.string(), z.unknown()))]),
});

const FunctionCallInputSchema = z.object({
  type: z.literal("function_call"),
  id: z.string().optional(),
  call_id: z.string(),
  name: z.string(),
  arguments: z.string(),
});

const FunctionCallOutputSchema = z.object({
  type: z.literal("function_call_output"),
  call_id: z.string(),
  output: z.string(),
});

const InputItemSchema = z.union([
  InputMessageSchema,
  FunctionCallInputSchema,
  FunctionCallOutputSchema,
]);

const RawToolSchema = z.record(z.string(), z.unknown());

export const FunctionToolSchema = z.object({
  type: z.literal("function"),
  name: z.string(),
  description: z.string().optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
});

export type FunctionTool = z.infer<typeof FunctionToolSchema>;

export const ResponsesRequestSchema = z.looseObject({
  model: z.string().min(1).optional(),
  input: z.union([z.string(), z.array(InputItemSchema)]).optional(),
  instructions: z.string().optional(),
  tools: z.array(RawToolSchema).optional(),
  stream: z.boolean().optional(),
  temperature: z.number().optional(),
  previous_response_id: z.string().optional(),
  background: z.boolean().optional(),
  context_management: z.unknown().optional(),
  conversation: z.unknown().optional(),
  include: z.array(z.string()).optional(),
  max_output_tokens: z.number().optional(),
  max_tool_calls: z.number().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  parallel_tool_calls: z.boolean().optional(),
  prompt: z.unknown().optional(),
  prompt_cache_key: z.string().optional(),
  prompt_cache_retention: z.string().optional(),
  reasoning: z.unknown().optional(),
  safety_identifier: z.string().optional(),
  service_tier: z.string().optional(),
  store: z.boolean().optional(),
  stream_options: z.unknown().optional(),
  text: z.unknown().optional(),
  tool_choice: z.unknown().optional(),
  top_logprobs: z.number().optional(),
  top_p: z.number().optional(),
  truncation: z.string().optional(),
  user: z.string().optional(),
});

export type ResponsesRequest = z.infer<typeof ResponsesRequestSchema>;

const OutputContentSchema = z.object({
  type: z.string(),
  text: z.string(),
  annotations: z.array(z.unknown()).optional(),
});

const OutputItemSchema = z.object({
  type: z.string(),
  id: z.string().optional(),
  status: z.string().optional(),
  role: z.string().optional(),
  content: z.array(OutputContentSchema).optional(),
  call_id: z.string().optional(),
  name: z.string().optional(),
  arguments: z.string().optional(),
  summary: z.array(z.object({ type: z.string(), text: z.string() })).optional(),
});

export type ResponsesOutputItem = z.infer<typeof OutputItemSchema>;

export const ResponsesEventSchema = z.object({
  type: z.string(),
  sequence_number: z.number().optional(),
  response: z.object({
    id: z.string(),
    object: z.string(),
    created_at: z.number(),
    model: z.string(),
    status: z.string(),
    output: z.array(OutputItemSchema),
    usage: z.object({
      input_tokens: z.number(),
      output_tokens: z.number(),
      total_tokens: z.number(),
    }).optional(),
  }).optional(),
  item: OutputItemSchema.optional(),
  part: z.object({
    type: z.string(),
    text: z.string().optional(),
    annotations: z.array(z.unknown()).optional(),
  }).optional(),
  delta: z.string().optional(),
  item_id: z.string().optional(),
});

export type ResponsesEvent = z.infer<typeof ResponsesEventSchema>;

export const ResponsesCompleteSchema = z.object({
  id: z.string(),
  object: z.literal("response"),
  created_at: z.number(),
  status: z.literal("completed"),
  model: z.string(),
  output: z.array(OutputItemSchema),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
    total_tokens: z.number(),
  }),
});

export type ResponsesComplete = z.infer<typeof ResponsesCompleteSchema>;

export const ResponsesErrorSchema = z.object({
  type: z.literal("error"),
  error: z.object({ message: z.string(), type: z.string().optional(), code: z.string().optional() }),
});

export type ResponsesError = z.infer<typeof ResponsesErrorSchema>;
