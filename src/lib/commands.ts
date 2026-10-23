/**
 * The command rule.
 *
 * Commands rehearse before they commit. Parsing therefore has to produce a *plan* — what
 * would change, on which blocks, described in one line — before anything is applied. The
 * manifest renders that plan on itself, so pressing Enter only keeps what the operator
 * can already see is true.
 *
 * Pure and synchronous, so the preview costs nothing to recompute on every keystroke.
 */

import { RESOLVE_ALIASES, type ResolveReason, RESOLVE_REASONS } from "./operator";
import type { RiskTier } from "./risk";

export type TierFilter = RiskTier | "all";

export type Effect =
  | { kind: "take"; ids: string[] }
  | { kind: "resolve"; ids: string[]; reason: ResolveReason }
  | { kind: "snooze"; ids: string[]; minutes: number }
  | { kind: "draft"; id: string }
  | { kind: "filter"; tier: TierFilter }
  | { kind: "find"; text: string }
  | { kind: "help" };

export interface CommandPlan {
  ok: boolean;
  /** Short uppercase verb for the delta strip. */
  verb: string;
  /** One line describing the consequence, in operator language. */
  summary: string;
  /** Delivery ids the manifest should show as about to change. */
  affected: string[];
  /** Short text for the ghost stamp hovering over each affected block. */
  ghost: string | null;
  effect: Effect | null;
}

/** What the parser needs to know about the board to resolve a target. */
export interface CommandContext {
  rows: { id: string; ref: string; tier: RiskTier }[];
  selectedId: string | null;
}

const DEFAULT_SNOOZE_MINUTES = 15;

export const COMMAND_HELP: { keys: string; what: string }[] = [
  { keys: "take", what: "Put the selected issue in your hands" },
  { keys: "resolve answered", what: "Close it: answered · actioned · escalated" },
  { keys: "resolve more", what: "Close it as having needed another system — this is the honest one" },
  { keys: "snooze 20", what: "Set it aside for N minutes" },
  { keys: "draft", what: "Have the reply written" },
  { keys: "show critical", what: "Filter: critical · high · watch · all" },
  { keys: "find R-412", what: "Search the ref, route, driver, consignee or message text" },
  { keys: "resolve answered watch", what: "Any command can target a whole tier instead of one issue" },
];

function fail(verb: string, error: string): CommandPlan {
  return { ok: false, verb, summary: error, affected: [], ghost: null, effect: null };
}

const TIER_WORDS: Record<string, TierFilter> = {
  critical: "critical",
  high: "high",
  watch: "watch",
  all: "all",
};

/**
 * Resolve the trailing target of a command.
 *
 * Returns the ids it refers to, plus how to name them in the summary. An empty word list
 * means "the selected block", which is what an operator working the queue top-down wants
 * nine times out of ten.
 */
function resolveTarget(
  words: string[],
  context: CommandContext,
): { ids: string[]; label: string } | { error: string } {
  if (words.length === 0) {
    if (!context.selectedId) return { error: "Nothing selected" };
    const row = context.rows.find((r) => r.id === context.selectedId);
    return { ids: [context.selectedId], label: row ? row.ref : "the selected issue" };
  }

  const word = words[0].toLowerCase();

  if (word in TIER_WORDS) {
    const tier = TIER_WORDS[word];
    const ids =
      tier === "all" ? context.rows.map((r) => r.id) : context.rows.filter((r) => r.tier === tier).map((r) => r.id);

    if (ids.length === 0) return { error: `No ${word} issues on the sheet` };
    return {
      ids,
      label: `${ids.length} ${tier === "all" ? "issue" : word + " issue"}${ids.length === 1 ? "" : "s"}`,
    };
  }

  // An issue ref, with or without its ISS- prefix.
  const needle = word.replace(/^iss-/i, "");
  const matches = context.rows.filter((r) =>
    r.ref.toLowerCase().replace(/^iss-/, "").includes(needle),
  );

  if (matches.length === 0) return { error: `Nothing matches "${words[0]}"` };
  if (matches.length > 1) return { error: `"${words[0]}" matches ${matches.length} issues` };
  return { ids: [matches[0].id], label: matches[0].ref };
}

export function parseCommand(input: string, context: CommandContext): CommandPlan | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;

  // `/text` is the search shorthand, so a search never collides with a verb.
  if (trimmed.startsWith("/")) {
    const text = trimmed.slice(1).trim();
    if (text === "") return fail("FIND", "Type what to search for");
    return {
      ok: true,
      verb: "FIND",
      summary: `Filter the sheet to issues matching "${text}"`,
      affected: [],
      ghost: null,
      effect: { kind: "find", text },
    };
  }

  const [verb, ...rest] = trimmed.split(/\s+/);
  const command = verb.toLowerCase();

  switch (command) {
    case "help":
    case "?":
      return {
        ok: true,
        verb: "HELP",
        summary: "Show the command sheet",
        affected: [],
        ghost: null,
        effect: { kind: "help" },
      };

    case "show":
    case "filter": {
      const word = (rest[0] ?? "").toLowerCase();
      if (!(word in TIER_WORDS)) {
        return fail("SHOW", "Show what? critical · high · watch · all");
      }
      const tier = TIER_WORDS[word];
      return {
        ok: true,
        verb: "SHOW",
        summary: tier === "all" ? "Show the whole sheet" : `Show ${tier} issues only`,
        affected: [],
        ghost: null,
        effect: { kind: "filter", tier },
      };
    }

    case "find":
    case "search": {
      const text = rest.join(" ").trim();
      if (text === "") return fail("FIND", "Type what to search for");
      return {
        ok: true,
        verb: "FIND",
        summary: `Filter the sheet to issues matching "${text}"`,
        affected: [],
        ghost: null,
        effect: { kind: "find", text },
      };
    }

    case "take": {
      const target = resolveTarget(rest, context);
      if ("error" in target) return fail("TAKE", target.error);
      return {
        ok: true,
        verb: "TAKE",
        summary: `${target.label} → in your hands`,
        affected: target.ids,
        ghost: "In hand",
        effect: { kind: "take", ids: target.ids },
      };
    }

    case "draft": {
      const target = resolveTarget(rest, context);
      if ("error" in target) return fail("DRAFT", target.error);
      if (target.ids.length > 1) return fail("DRAFT", "Draft one reply at a time");
      return {
        ok: true,
        verb: "DRAFT",
        summary: `Write the reply for ${target.label}`,
        affected: target.ids,
        ghost: null,
        effect: { kind: "draft", id: target.ids[0] },
      };
    }

    case "snooze": {
      // `snooze 20` and `snooze 20 watch` and `snooze watch` all mean something sensible.
      const minutesWord = rest[0];
      const hasMinutes = minutesWord !== undefined && /^\d+$/.test(minutesWord);
      const minutes = hasMinutes ? Number(minutesWord) : DEFAULT_SNOOZE_MINUTES;
      if (hasMinutes && (minutes < 1 || minutes > 480)) {
        return fail("SNOOZE", "Snooze between 1 and 480 minutes");
      }

      const target = resolveTarget(hasMinutes ? rest.slice(1) : rest, context);
      if ("error" in target) return fail("SNOOZE", target.error);
      return {
        ok: true,
        verb: "SNOOZE",
        summary: `${target.label} → set aside for ${minutes} min`,
        affected: target.ids,
        ghost: `${minutes}m`,
        effect: { kind: "snooze", ids: target.ids, minutes },
      };
    }

    case "resolve":
    case "close": {
      const reasonWord = (rest[0] ?? "").toLowerCase();
      const reason = RESOLVE_ALIASES[reasonWord];
      if (!reason) {
        return fail("RESOLVE", "Resolve how? answered · actioned · escalated · more");
      }

      const target = resolveTarget(rest.slice(1), context);
      if ("error" in target) return fail("RESOLVE", target.error);
      return {
        ok: true,
        verb: "RESOLVE",
        summary: `${target.label} → ${RESOLVE_REASONS[reason].toLowerCase()}`,
        affected: target.ids,
        ghost: reason === "needed_more" ? "Needed more" : "Resolved",
        effect: { kind: "resolve", ids: target.ids, reason },
      };
    }

    default:
      return fail("?", `"${verb}" is not a command — type help`);
  }
}

/** Does this row match a free-text search? */
export function matchesSearch(
  text: string,
  fields: Record<string, string>,
): boolean {
  const needle = text.trim().toLowerCase();
  if (needle === "") return true;

  return Object.values(fields).some((value) => value.toLowerCase().includes(needle));
}
