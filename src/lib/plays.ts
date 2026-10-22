/**
 * The suggested play.
 *
 * A ranked queue that only says "this is bad" still leaves the operator to decide what
 * to do, which is the slow part. Each incident therefore carries one next move, derived
 * from its heaviest signal. One move, not a menu: a busy operator presented with five
 * options is back to deciding.
 */

import type { ScoredDelivery, SignalCode } from "./risk";

export type PlayAction =
  | "notify_consignee"
  | "call_driver"
  | "reply_consignee"
  | "reschedule"
  | "confirm_address"
  | "request_access"
  | "dispatch"
  | "flag_account"
  | "monitor";

export interface Play {
  action: PlayAction;
  /** Imperative, in operator language. Appears in the REMARKS box of the row. */
  title: string;
  /** Why this is the move, for the detail sheet. */
  rationale: string;
  /** Whether the LLM can usefully draft the outbound message for this play. */
  drafts: boolean;
  /** Who the drafted message is addressed to. */
  audience: "consignee" | "shipper" | "driver" | null;
}

/**
 * Tie-break order when two signals carry identical weight. Earlier wins. Ordered by
 * how irreversible the situation is: a failed attempt is already a loss, a stalled
 * driver is becoming one, an SLA flag is only context.
 */
const TIE_BREAK: SignalCode[] = [
  "failed_attempt",
  "driver_stalled",
  "eta_breach",
  "repeat_contact",
  "window_closing",
  "address_risk",
  "access_risk",
  "sla_account",
];

export function dominantSignal(scored: ScoredDelivery): SignalCode | null {
  if (scored.signals.length === 0) return null;

  const top = scored.signals.reduce((best, candidate) => {
    if (candidate.points > best.points) return candidate;
    if (candidate.points < best.points) return best;
    return TIE_BREAK.indexOf(candidate.code) < TIE_BREAK.indexOf(best.code)
      ? candidate
      : best;
  });

  return top.code;
}

export function playFor(scored: ScoredDelivery): Play {
  const code = dominantSignal(scored);
  const driverCode = scored.driver?.code ?? "unassigned";
  const slip = scored.slipMinutes === null ? 0 : Math.round(scored.slipMinutes);
  const toClose = Math.round(scored.minutesToWindowEnd);

  switch (code) {
    case "eta_breach":
      return {
        action: "notify_consignee",
        title: `Notify consignee of a revised ETA, ${slip} min late`,
        rationale:
          "The window will be missed. Telling the consignee before they notice converts a complaint into an accepted delay.",
        drafts: true,
        audience: "consignee",
      };

    case "driver_stalled":
      return {
        action: "call_driver",
        title: `Call ${driverCode} — the vehicle has stopped moving`,
        rationale:
          "A stall off-geofence is a breakdown, an accident, or an unscheduled break. Nothing downstream can be planned until someone knows which.",
        drafts: false,
        audience: "driver",
      };

    case "repeat_contact":
      return {
        action: "reply_consignee",
        title: "Reply to the consignee — they have chased us more than once",
        rationale:
          "Repeated contact means the relationship is already damaged, independently of whether the parcel is actually late. Answering is the cheapest repair available.",
        drafts: true,
        audience: "consignee",
      };

    case "failed_attempt":
      return {
        action: "reschedule",
        title: "Rebook the delivery — a failed attempt is sitting idle",
        rationale:
          "A failed attempt with no reattempt booked ages silently until the shipper asks about it. Rebooking now is the only action that closes it.",
        drafts: true,
        audience: "consignee",
      };

    case "address_risk":
      return {
        action: "confirm_address",
        title: "Confirm the address before the driver gets there",
        rationale:
          "This address has failed before. A one-minute confirmation now avoids a second failed attempt and a redelivery leg.",
        drafts: true,
        audience: "consignee",
      };

    case "access_risk":
      return {
        action: "request_access",
        title: "Get the entry code — none is on file",
        rationale:
          "The driver will arrive and not be able to get in. The code has to come from the consignee, and asking takes one message.",
        drafts: true,
        audience: "consignee",
      };

    case "window_closing":
      return {
        action: "dispatch",
        title:
          toClose < 0
            ? "Dispatch or rebook now — the window has already closed"
            : `Dispatch now — the window closes in ${toClose} min`,
        rationale:
          "Nobody has picked this up. It is the one failure mode entirely inside our control, and it is still fixable right now.",
        drafts: false,
        audience: null,
      };

    case "sla_account":
      return {
        action: "flag_account",
        title: `Flag to the account manager for ${scored.shipper.name}`,
        rationale:
          "Nothing is operationally wrong yet, but this account carries a penalty window, so the account manager would rather hear it early.",
        drafts: true,
        audience: "shipper",
      };

    default:
      return {
        action: "monitor",
        title: "No action needed",
        rationale: "No signal is firing on this delivery.",
        drafts: false,
        audience: null,
      };
  }
}
