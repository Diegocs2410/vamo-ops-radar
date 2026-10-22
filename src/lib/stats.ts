/**
 * The masthead numbers.
 *
 * These are derived from the live board rather than configured, because the product's
 * whole claim is that it buys the operator time — so the claim has to be measurable
 * from what is on screen, not asserted next to it.
 */

import type { ShiftStats } from "./domain";
import type { RiskTier, ScoredDelivery } from "./risk";

export type TierCounts = Record<RiskTier, number>;

export function countTiers(board: ScoredDelivery[]): TierCounts {
  const counts: TierCounts = { critical: 0, high: 0, watch: 0, cleared: 0 };
  for (const row of board) counts[row.tier] += 1;
  return counts;
}

/** Everything the queue should actually show: anything above the noise floor. */
export function atRisk(board: ScoredDelivery[]): ScoredDelivery[] {
  return board.filter((row) => row.tier !== "cleared");
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
 * Lead time: minutes between a flag and the promised window closing. It is the headline
 * metric because it is the operator's room to act — below roughly twenty minutes there is
 * no play left to make, only an apology.
 *
 * Only rows whose window is still open contribute. A row already past its window has a
 * lead time of zero by definition and would drag the median toward a number that says
 * nothing about how early we caught things.
 */
export function computeShiftStats(
  board: ScoredDelivery[],
  history: Pick<ShiftStats, "resolvedToday" | "falsePositivesToday">,
): ShiftStats {
  const flagged = atRisk(board);

  const leadTimes = flagged
    .map((row) => row.minutesToWindowEnd)
    .filter((minutes) => minutes > 0);

  // Proactive means Radar got there first: flagged, and the consignee has not
  // contacted us about it yet.
  const detectedProactively = flagged.filter(
    (row) => row.delivery.contacts.length === 0,
  ).length;

  return {
    detectedProactively,
    incidentsToday: flagged.length + history.resolvedToday,
    medianLeadTimeMin: median(leadTimes),
    resolvedToday: history.resolvedToday,
    falsePositivesToday: history.falsePositivesToday,
  };
}

/**
 * Precision, as the operator's own resolutions report it. Fed by the "false positive"
 * resolve reason, which is why that button exists.
 */
export function precision(stats: ShiftStats): number | null {
  if (stats.resolvedToday === 0) return null;
  return (stats.resolvedToday - stats.falsePositivesToday) / stats.resolvedToday;
}
