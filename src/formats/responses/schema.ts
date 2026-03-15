import { z } from "zod";

export { ResponsesRequestSchema, FunctionToolSchema, type ResponsesRequest } from "llm-schemas/openai/responses";

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
