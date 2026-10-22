/**
 * What the operator has done about each incident.
 *
 * Kept separate from the scored board on purpose: the engine says what is true about
 * the operation, this says what we have done about it. Merging the two would mean a
 * resolution could never survive a re-score, and the board re-scores every few seconds.
 */

import type { ScoredDelivery } from "./risk";

/**
 * Why a row was closed. `false_positive` is not a courtesy option — it is the only
 * honest source of precision data, and precision is how we find out whether the model
 * deserves the operator's attention. See PRODUCT.md.
 */
export type ResolveReason =
  | "notified"
  | "rebooked"
  | "driver_contacted"
  | "false_positive";

export const RESOLVE_REASONS: Record<ResolveReason, string> = {
  notified: "Consignee notified",
  rebooked: "Rebooked",
  driver_contacted: "Driver contacted",
  false_positive: "False positive",
};

/** Accepted on the command line, including the shorthand an operator will actually type. */
export const RESOLVE_ALIASES: Record<string, ResolveReason> = {
  notified: "notified",
  notify: "notified",
  rebooked: "rebooked",
  rebook: "rebooked",
  reschedule: "rebooked",
  driver: "driver_contacted",
  "driver-contacted": "driver_contacted",
  fp: "false_positive",
  "false-positive": "false_positive",
  falsepositive: "false_positive",
};

export type Disposition =
  | { kind: "open" }
  | { kind: "taken"; at: number }
  | { kind: "snoozed"; untilMs: number }
  | { kind: "resolved"; reason: ResolveReason; at: number };

export type Dispositions = Record<string, Disposition>;

export const OPEN: Disposition = { kind: "open" };

export function dispositionOf(
  dispositions: Dispositions,
  deliveryId: string,
  nowMs: number,
): Disposition {
  const current = dispositions[deliveryId];
  if (!current) return OPEN;

  // A snooze that has run out is just an open incident again.
  if (current.kind === "snoozed" && current.untilMs <= nowMs) return OPEN;
  return current;
}

export type SpentDisposition = Extract<Disposition, { kind: "resolved" } | { kind: "snoozed" }>;

/** Resolved and snoozed rows are spent: still on the sheet, but out of the way. */
export function isSpent(disposition: Disposition): disposition is SpentDisposition {
  return disposition.kind === "resolved" || disposition.kind === "snoozed";
}

export interface QueueRow {
  scored: ScoredDelivery;
  disposition: Disposition;
}

/**
 * Build the working queue: everything above the noise floor, worst first, with spent
 * rows sunk to the bottom rather than removed. Removing them would make the operator
 * doubt whether the action landed.
 */
export function buildQueue(
  board: ScoredDelivery[],
  dispositions: Dispositions,
  nowMs: number,
): QueueRow[] {
  return board
    .filter((scored) => scored.tier !== "cleared")
    .map((scored) => ({
      scored,
      disposition: dispositionOf(dispositions, scored.delivery.id, nowMs),
    }))
    .sort((a, b) => {
      const spent = Number(isSpent(a.disposition)) - Number(isSpent(b.disposition));
      if (spent !== 0) return spent;
      return 0; // the board is already ranked; keep it stable
    });
}

export function dispositionLabel(disposition: Disposition, nowMs: number): string | null {
  switch (disposition.kind) {
    case "taken":
      return "in hand";
    case "snoozed": {
      const minutes = Math.max(1, Math.round((disposition.untilMs - nowMs) / 60_000));
      return `snoozed ${minutes}m`;
    }
    case "resolved":
      return RESOLVE_REASONS[disposition.reason].toLowerCase();
    default:
      return null;
  }
}
