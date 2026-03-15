import type { Match, MatchObject, MockRequest, Resolver, Reply, ReplyOptions, Rule, RuleSummary } from "./types.js";

function safeRegex(re: RegExp): RegExp {
  return (re.global || re.sticky) ? new RegExp(re.source, re.flags.replace(/[gy]/g, "")) : re;
}

function compilePattern(pattern: string | RegExp): (value: string) => boolean {
  if (typeof pattern === "string") {
    const lower = pattern.toLowerCase();
    return (value) => value.toLowerCase().includes(lower);
  }
  const re = safeRegex(pattern);
  return (value) => re.test(value);
}

function compileMatcher(match: Match): (req: MockRequest) => boolean {
  if (typeof match === "string") {
    const test = compilePattern(match);
    return (req) => test(req.lastMessage);
  }
  if (match instanceof RegExp) {
    const test = compilePattern(match);
    return (req) => test(req.lastMessage);
  }
  if (typeof match === "function") {
    return match;
  }
  const obj = match;
  const messageTest = obj.message !== undefined ? compilePattern(obj.message) : undefined;
  const modelTest = obj.model !== undefined ? compilePattern(obj.model) : undefined;
  const systemTest = obj.system !== undefined ? compilePattern(obj.system) : undefined;
  return (req) => {
    if (messageTest && !messageTest(req.lastMessage)) return false;
    if (modelTest && !modelTest(req.model)) return false;
    if (systemTest && !systemTest(req.systemMessage)) return false;
    if (obj.format !== undefined && req.format !== obj.format) return false;
    if (obj.toolName !== undefined && !req.toolNames.includes(obj.toolName)) return false;
    if (obj.toolCallId !== undefined && req.lastToolCallId !== obj.toolCallId) return false;
    if (obj.predicate && !obj.predicate(req)) return false;
    return true;
  };
}

function describeMatch(match: Match): string {
  if (typeof match === "string") return `"${match}"`;
  if (match instanceof RegExp) return match.toString();
  if (typeof match === "function") return "(predicate)";
  const obj: MatchObject = match;
  const parts = Object.entries(obj)
    .filter(([, v]) => v !== undefined && typeof v !== "function")
    .map(([k, v]) => `${k}=${String(v)}`);
  return `{${parts.join(", ")}}`;
}

function createRule(match: Match, resolve: Resolver, options: ReplyOptions, description?: string): Rule {
  return {
    description: description ?? describeMatch(match),
    match: compileMatcher(match),
    resolve,
    options,
    remaining: Infinity,
  };
}

interface SequenceStep {
  readonly reply: Reply;
  readonly options?: ReplyOptions | undefined;
}

export function createSequenceResolver(
  steps: readonly SequenceStep[],
  rule: { options: ReplyOptions },
): { resolver: () => Reply; entryCount: number } {
  if (steps.length === 0) throw new Error("Sequence requires at least one entry.");
  let index = 0;
  const last = steps[steps.length - 1]!;
  return {
    resolver: () => {
      const step = steps[index++] ?? last;
      rule.options = step.options ?? {};
      return step.reply;
    },
    entryCount: steps.length,
  };
}

export class RuleEngine {
  private readonly rules: Rule[] = [];

  add(match: Match, resolve: Resolver, options: ReplyOptions = {}): Rule {
    const rule = createRule(match, resolve, options);
    this.rules.push(rule);
    return rule;
  }

  moveToFront(rule: Rule): void {
    const idx = this.rules.indexOf(rule);
    if (idx > 0) {
      this.rules.splice(idx, 1);
      this.rules.unshift(rule);
    }
  }

  addHandler(matchFn: (req: MockRequest) => boolean, respond: Resolver, description = "(handler)"): Rule {
    const rule = createRule(matchFn, respond, {}, description);
    this.rules.push(rule);
    return rule;
  }

  match(req: MockRequest): Rule | undefined {
    for (let i = 0; i < this.rules.length; i++) {
      const rule = this.rules[i]!;

      if (rule.remaining <= 0) continue;
      if (!rule.match(req)) continue;

      rule.remaining--;
      if (rule.remaining <= 0) {
        this.rules.splice(i, 1);
      }
      return rule;
    }
    return undefined;
  }

  isDone(): boolean {
    return this.rules.every((r) => !Number.isFinite(r.remaining) || r.remaining <= 0);
  }

  get ruleCount(): number {
    return this.rules.length;
  }

  describe(): readonly RuleSummary[] {
    return this.rules.map((r) => ({ description: r.description, remaining: r.remaining }));
  }

  clear(): void {
    this.rules.length = 0;
  }
}
