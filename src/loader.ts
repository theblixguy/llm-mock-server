import { readFile, readdir, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import JSON5 from "json5";
import { z } from "zod";
import type { Handler, Match, MatchObject, Reply } from "./types.js";
import { type RuleEngine, createSequenceResolver } from "./rule-engine.js";

interface LoadContext {
  engine: RuleEngine;
  setFallback?: (reply: Reply) => void;
}

const json5MatchSchema = z.union([
  z.string(),
  z.object({
    message: z.string().optional(),
    model: z.string().optional(),
    system: z.string().optional(),
    format: z.enum(["openai", "anthropic", "responses"]).optional(),
  }),
]);

const json5ReplySchema = z.union([
  z.string(),
  z.object({
    text: z.string().optional(),
    reasoning: z.string().optional(),
    tools: z
      .array(
        z.object({ name: z.string(), args: z.record(z.string(), z.unknown()) }),
      )
      .optional(),
  }),
]);

const json5ReplyRef = z.union([json5ReplySchema, z.string().startsWith("$")]);

const json5SequenceEntrySchema = z.union([
  json5ReplyRef,
  z.object({
    reply: json5ReplyRef,
    latency: z.int().nonnegative().optional(),
    chunkSize: z.int().nonnegative().optional(),
  }),
]);

const json5RuleSchema = z.union([
  z.object({
    when: json5MatchSchema,
    reply: json5ReplyRef,
    times: z.int().positive().optional(),
  }),
  z.object({
    when: json5MatchSchema,
    replies: z.array(json5SequenceEntrySchema).min(1),
  }),
]);

const json5FileSchema = z.union([
  z.array(json5RuleSchema),
  z.object({
    templates: z.record(z.string(), json5ReplySchema).optional(),
    fallback: json5ReplySchema.optional(),
    rules: z.array(json5RuleSchema),
  }),
]);

function parseRegexString(s: string): RegExp | string {
  const match = /^\/(.+)\/([dgimsuyv]*)$/.exec(s);
  if (match) {
    return new RegExp(match[1]!, match[2]);
  }
  return s;
}

type Json5ReplyRef = z.infer<typeof json5ReplyRef>;
type Templates = Record<string, z.infer<typeof json5ReplySchema>> | undefined;

function compileMatch(when: z.infer<typeof json5MatchSchema>): Match {
  if (typeof when === "string") {
    return parseRegexString(when);
  }
  const obj: MatchObject = {
    ...(when.message !== undefined && {
      message: parseRegexString(when.message),
    }),
    ...(when.model !== undefined && { model: parseRegexString(when.model) }),
    ...(when.system !== undefined && { system: parseRegexString(when.system) }),
    ...(when.format !== undefined && { format: when.format }),
  };
  return obj;
}

function resolveReplyRef(
  ref: Json5ReplyRef,
  templates: Templates,
  filePath: string,
): z.infer<typeof json5ReplySchema> {
  if (typeof ref === "string" && ref.startsWith("$")) {
    const name = ref.slice(1);
    const resolved = templates?.[name];
    if (!resolved) throw new Error(`Unknown template "${name}" in ${filePath}`);
    return resolved;
  }
  return ref;
}

function addSequenceRule(
  engine: RuleEngine,
  match: Match,
  entries: z.infer<typeof json5SequenceEntrySchema>[],
  templates: Templates,
  filePath: string,
): void {
  const steps = entries.map((entry) => {
    if (typeof entry === "string" || !("reply" in entry)) {
      return { reply: resolveReplyRef(entry, templates, filePath) };
    }
    return {
      reply: resolveReplyRef(entry.reply, templates, filePath),
      options: {
        ...(entry.latency !== undefined && { latency: entry.latency }),
        ...(entry.chunkSize !== undefined && { chunkSize: entry.chunkSize }),
      },
    };
  });
  const rule = engine.add(match, "");
  const { resolver, entryCount } = createSequenceResolver(steps, rule);
  rule.resolve = resolver;
  rule.remaining = entryCount;
}

async function loadJson5File(
  filePath: string,
  ctx: LoadContext,
): Promise<void> {
  const content = await readFile(filePath, "utf-8");
  const parsed = json5FileSchema.parse(JSON5.parse(content));

  const rules = Array.isArray(parsed) ? parsed : parsed.rules;
  const templates = Array.isArray(parsed) ? undefined : parsed.templates;

  if (
    !Array.isArray(parsed) &&
    parsed.fallback !== undefined &&
    ctx.setFallback
  ) {
    ctx.setFallback(parsed.fallback);
  }

  for (const r of rules) {
    const match = compileMatch(r.when);
    if ("replies" in r) {
      addSequenceRule(ctx.engine, match, r.replies, templates, filePath);
    } else {
      const reply = resolveReplyRef(r.reply, templates, filePath);
      const rule = ctx.engine.add(match, reply);
      if (r.times !== undefined) {
        rule.remaining = r.times;
      }
    }
  }
}

const handlerSchema = z.custom<Handler>((val): val is Handler => {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj["match"] === "function" && typeof obj["respond"] === "function"
  );
});

const handlerExportSchema = z.object({
  default: z.union([handlerSchema, z.array(handlerSchema)]),
  fallback: json5ReplySchema.optional(),
});

async function loadHandlerFile(
  filePath: string,
  ctx: LoadContext,
): Promise<void> {
  const mod = await import(filePath);
  const parsed = handlerExportSchema.safeParse(mod);
  if (!parsed.success) {
    throw new Error(
      `Invalid handler file ${filePath}. Expected default export with { match: Function, respond: Function }.`,
    );
  }
  const handlers = Array.isArray(parsed.data.default)
    ? parsed.data.default
    : [parsed.data.default];

  if (parsed.data.fallback !== undefined && ctx.setFallback) {
    ctx.setFallback(parsed.data.fallback);
  }

  for (const handler of handlers) {
    ctx.engine.addHandler(
      handler.match,
      handler.respond,
      `(handler: ${filePath})`,
    );
  }
}

type FileLoader = (filePath: string, ctx: LoadContext) => Promise<void>;

const loaderByExtension: ReadonlyMap<string, FileLoader> = new Map([
  [".json5", loadJson5File],
  [".json", loadJson5File],
  [".ts", loadHandlerFile],
  [".js", loadHandlerFile],
  [".mjs", loadHandlerFile],
]);

export async function loadRulesFromPath(
  pathOrDir: string,
  ctx: LoadContext,
): Promise<void> {
  const info = await stat(pathOrDir);

  if (info.isFile()) {
    const ext = extname(pathOrDir);
    const loader = loaderByExtension.get(ext);
    if (!loader) {
      throw new Error(`Unsupported file extension "${ext}" for ${pathOrDir}`);
    }
    await loader(pathOrDir, ctx);
    return;
  }

  if (!info.isDirectory()) return;

  const entries = (await readdir(pathOrDir)).toSorted();
  for (const entry of entries) {
    const fullPath = join(pathOrDir, entry);
    const entryStat = await stat(fullPath);
    if (entryStat.isDirectory()) {
      await loadRulesFromPath(fullPath, ctx);
    } else if (entryStat.isFile()) {
      const loader = loaderByExtension.get(extname(fullPath));
      if (loader) await loader(fullPath, ctx);
    }
  }
}
