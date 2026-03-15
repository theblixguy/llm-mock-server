import type { FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import type {
  Reply,
  ReplyObject,
  ReplyOptions,
  MockRequest,
  Rule,
} from "./types.js";
import type { Format } from "./formats/types.js";
import type { RuleEngine } from "./rule-engine.js";
import type { RequestHistory } from "./history.js";
import type { Logger } from "./logger.js";
import { writeSSE } from "./sse-writer.js";

const HTTP_BAD_REQUEST = 400;

function normalizeReply(reply: Reply): ReplyObject {
  if (typeof reply === "string") return { text: reply };
  return reply;
}

async function resolveReply(
  matched: Rule | undefined,
  mockReq: MockRequest,
  fallback: Reply,
  logger: Logger,
): Promise<{ reply: ReplyObject; ruleDesc: string | undefined }> {
  if (!matched) {
    logger.warn(
      `No matching rule for "${mockReq.lastMessage}", using fallback`,
    );
    return { reply: normalizeReply(fallback), ruleDesc: undefined };
  }

  try {
    const raw =
      typeof matched.resolve === "function"
        ? await matched.resolve(mockReq)
        : matched.resolve;
    logger.debug(`Matched rule ${matched.description}`);
    return { reply: normalizeReply(raw), ruleDesc: matched.description };
  } catch (err) {
    logger.error(`Resolver threw for rule ${matched.description}`, err);
    return { reply: normalizeReply(fallback), ruleDesc: matched.description };
  }
}

interface RouteHandlerDeps {
  engine: RuleEngine;
  history: RequestHistory;
  logger: Logger;
  defaultOptions: ReplyOptions;
  getFallback: () => Reply;
}

export function createRouteHandler(
  format: Format,
  deps: RouteHandlerDeps,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  const { engine, history, logger, defaultOptions, getFallback } = deps;

  return async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body;
    const headers: Record<string, string | undefined> = {};
    for (const [key, val] of Object.entries(request.headers)) {
      headers[key] = Array.isArray(val) ? val.join(", ") : val;
    }
    const meta = { headers, path: request.url };

    let mockReq: MockRequest;
    try {
      mockReq = format.parseRequest(body, meta);
    } catch (err) {
      if (err instanceof ZodError) {
        logger.warn(
          `Invalid ${format.name} request: ${err.issues.map((i) => i.message).join(", ")}`,
        );
        return reply
          .status(HTTP_BAD_REQUEST)
          .type("application/json")
          .send(
            format.serializeError({
              status: HTTP_BAD_REQUEST,
              message: "Invalid request body",
              type: "invalid_request_error",
            }),
          );
      }
      throw err;
    }
    const startTime = Date.now();

    logger.debug(
      `${format.name} request: model=${mockReq.model} streaming=${mockReq.streaming} messages=${mockReq.messages.length}`,
    );

    const matched = engine.match(mockReq);
    const { reply: resolvedReply, ruleDesc } = await resolveReply(
      matched,
      mockReq,
      getFallback(),
      logger,
    );

    if (resolvedReply.error) {
      const { error } = resolvedReply;
      logger.info(`Error reply: ${String(error.status)} ${error.message}`);
      history.record(mockReq, ruleDesc);
      return reply
        .status(error.status)
        .type("application/json")
        .send(format.serializeError(error));
    }

    history.record(mockReq, ruleDesc);

    const isStreaming = format.isStreaming(body);
    const effectiveOptions = { ...defaultOptions, ...matched?.options };
    const elapsed = Date.now() - startTime;
    const mode = isStreaming ? "stream" : "json";

    logger.info(
      `POST ${format.route} [${mode}] "${mockReq.lastMessage}" -> ${ruleDesc ?? "fallback"} (${elapsed}ms)`,
    );
    if (resolvedReply.text) {
      logger.debug(`Reply text: "${resolvedReply.text}"`);
    }
    if (resolvedReply.tools?.length) {
      logger.debug(
        `Reply tool calls: ${resolvedReply.tools.map((t) => t.name).join(", ")}`,
      );
    }

    if (!isStreaming) {
      return reply
        .type("application/json")
        .send(format.serializeComplete(resolvedReply, mockReq.model));
    }

    const chunks = format.serialize(
      resolvedReply,
      mockReq.model,
      effectiveOptions,
    );
    await writeSSE(reply, chunks, effectiveOptions);
  };
}
