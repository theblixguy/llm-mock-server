import type {
  Reply,
  ReplyOptions,
  Resolver,
  SequenceEntry,
} from "./types/reply.js";
import type { Match, PendingRule, Rule, RuleHandle } from "./types/rule.js";
import type { RuleEngine } from "./rule-engine.js";
import { createSequenceResolver } from "./rule-engine.js";

function makeHandle(engine: RuleEngine, rule: Rule): RuleHandle {
  return {
    times(n: number): RuleHandle {
      rule.remaining = n;
      return this;
    },
    first(): RuleHandle {
      engine.moveToFront(rule);
      return this;
    },
  };
}

export class RuleBuilder {
  constructor(private readonly engine: RuleEngine) {}

  when(match: Match): PendingRule {
    const engine = this.engine;
    return {
      reply(response: Resolver, options?: ReplyOptions): RuleHandle {
        return makeHandle(engine, engine.add(match, response, options));
      },
      replySequence(entries: readonly SequenceEntry[]): RuleHandle {
        const steps = normaliseSequenceEntries(entries);
        const rule = engine.add(match, "");
        const { resolver, entryCount } = createSequenceResolver(steps, rule);
        rule.resolve = resolver;
        rule.remaining = entryCount;
        return makeHandle(engine, rule);
      },
    };
  }

  whenTool(toolName: string): PendingRule {
    return this.when({ toolName });
  }

  whenToolResult(toolCallId: string): PendingRule {
    return this.when({ toolCallId });
  }

  nextError(status: number, message: string, type?: string): RuleHandle {
    return this.when(() => true)
      .reply({ error: { status, message, type } })
      .times(1)
      .first();
  }
}

export function normaliseSequenceEntries(
  entries: readonly SequenceEntry[],
): { reply: Reply; options?: ReplyOptions | undefined }[] {
  return entries.map((entry) =>
    typeof entry === "string" || !("reply" in entry)
      ? { reply: entry as Reply }
      : { reply: entry.reply, options: entry.options },
  );
}
