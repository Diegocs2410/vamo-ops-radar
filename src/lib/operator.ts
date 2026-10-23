/**
 * What the operator has done about each issue.
 *
 * Kept separate from the triaged board on purpose: triage says what is true about the
 * operation, this says what we have done about it. Merging the two would mean a
 * resolution could never survive a re-score, and the board re-scores every few seconds.
 */

import type { TriagedIssue } from "./triage";

/**
 * Why an issue was closed.
 *
 * `needed_more` is the important one and it is not a courtesy option. The whole product
 * claim is that the context sheet replaces opening the phone system, Slack and the admin
 * tool by hand; the only honest way to find out whether it does is to let the operator say
 * when it did not. See PRODUCT.md.
 */
export type ResolveReason = "answered" | "actioned" | "escalated" | "needed_more";

export const RESOLVE_REASONS: Record<ResolveReason, string> = {
  answered: "Answered from here",
  actioned: "Actioned from here",
  escalated: "Escalated",
  needed_more: "Needed another system",
};

/** Accepted on the command line, including the shorthand an operator will actually type. */
export const RESOLVE_ALIASES: Record<string, ResolveReason> = {
  answered: "answered",
  answer: "answered",
  replied: "answered",
  actioned: "actioned",
  action: "actioned",
  done: "actioned",
  escalated: "escalated",
  escalate: "escalated",
  more: "needed_more",
  "needed-more": "needed_more",
  elsewhere: "needed_more",
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
  issueId: string,
  nowMs: number,
): Disposition {
  const current = dispositions[issueId];
  if (!current) return OPEN;

  // A snooze that has run out is just an open issue again.
  if (current.kind === "snoozed" && current.untilMs <= nowMs) return OPEN;
  return current;
}

export type SpentDisposition = Extract<Disposition, { kind: "resolved" } | { kind: "snoozed" }>;

/** Resolved and snoozed rows are spent: still on the sheet, but out of the way. */
export function isSpent(disposition: Disposition): disposition is SpentDisposition {
  return disposition.kind === "resolved" || disposition.kind === "snoozed";
}

export interface QueueRow {
  triaged: TriagedIssue;
  disposition: Disposition;
}

/**
 * Build the working queue, worst first, with spent rows sunk to the bottom rather than
 * removed. Removing them would make the operator doubt whether the action landed.
 */
export function buildQueue(
  board: TriagedIssue[],
  dispositions: Dispositions,
  nowMs: number,
): QueueRow[] {
  return board
    .map((triaged) => ({
      triaged,
      disposition: dispositionOf(dispositions, triaged.issue.id, nowMs),
    }))
    .sort(
      (a, b) =>
        Number(isSpent(a.disposition)) - Number(isSpent(b.disposition)),
    );
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
