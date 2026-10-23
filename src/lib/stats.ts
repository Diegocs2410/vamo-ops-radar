/**
 * The masthead numbers.
 *
 * Derived from the live board rather than configured, because the product's claim is that
 * it collapses three systems into one screen — so the claim has to be measurable from what
 * is on screen, not asserted next to it.
 */

import { sourcesFor, systemCount } from "./context";
import type { ShiftStats } from "./domain";
import type { RiskTier } from "./risk";
import type { TriagedIssue } from "./triage";

export type TierCounts = Record<RiskTier, number>;

export function countTiers(board: TriagedIssue[]): TierCounts {
  const counts: TierCounts = { critical: 0, high: 0, watch: 0, cleared: 0 };
  for (const row of board) counts[row.tier] += 1;
  return counts;
}

/** Everything still waiting on a person. */
export function openIssues(board: TriagedIssue[]): TriagedIssue[] {
  return board.filter((row) => row.issue.answeredAt === null);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : Math.round(sorted[mid]);
}

/**
 * How many lookups this screen is standing in for right now, and across how many systems.
 *
 * This is the headline, because it is the problem in the ops team's own words: the context
 * for any one issue is spread across the phone system, Slack and the admin tool, and they
 * piece it together by hand.
 */
export function assemblyLoad(board: TriagedIssue[]): {
  lookups: number;
  systems: number;
} {
  const open = openIssues(board);
  let lookups = 0;
  const systems = new Set<string>();

  for (const row of open) {
    const sources = sourcesFor(row);
    lookups += sources.length;
    for (const source of sources) systems.add(source.system);
  }

  return { lookups, systems: systems.size };
}

/** Share of open issues that arrived from a person rather than from their ops board. */
export function inboundShare(board: TriagedIssue[]): number | null {
  const open = openIssues(board);
  if (open.length === 0) return null;

  const inbound = open.filter((row) => row.issue.source !== "detected").length;
  return inbound / open.length;
}

export function computeShiftStats(
  board: TriagedIssue[],
  history: Pick<ShiftStats, "resolvedToday" | "answeredFromOneScreen" | "reopenedToday">,
): ShiftStats {
  // The live number that matters: how long the people waiting have been waiting.
  const waits = openIssues(board).map((row) => row.waitingMinutes);

  return {
    resolvedToday: history.resolvedToday,
    answeredFromOneScreen: history.answeredFromOneScreen,
    reopenedToday: history.reopenedToday,
    medianFirstReplyMin: median(waits),
  };
}

/** Of what we closed, how much stayed closed. */
export function stuckRate(stats: ShiftStats): number | null {
  if (stats.resolvedToday === 0) return null;
  return (stats.resolvedToday - stats.reopenedToday) / stats.resolvedToday;
}

/** Of what we closed, how much needed nothing but this screen. */
export function oneScreenRate(stats: ShiftStats): number | null {
  if (stats.resolvedToday === 0) return null;
  return stats.answeredFromOneScreen / stats.resolvedToday;
}

export { systemCount };
