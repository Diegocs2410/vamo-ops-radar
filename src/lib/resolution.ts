/**
 * The suggested next move for an issue.
 *
 * A queue that only ranks still leaves the operator to work out what to do, which is the
 * slow part. Each issue therefore carries one move, derived from its kind rather than from
 * its score — the score says *when* to deal with it, the kind says *how*.
 *
 * One move, not a menu: an operator holding a phone and handed five options is back to
 * deciding.
 */

import { KIND_AUDIENCE } from "./classify";
import type { IssueKind } from "./domain";
import type { TriagedIssue } from "./triage";

export type ResolutionAction =
  | "resend_route"
  | "answer_pay"
  | "escalate_payroll"
  | "offer_route"
  | "call_pickup"
  | "call_driver"
  | "send_eta"
  | "confirm_address"
  | "request_access"
  | "send_pod"
  | "triage_list"
  | "read_and_route";

export interface Resolution {
  action: ResolutionAction;
  /** Imperative, in operator language. Goes in the REMARKS box of the row. */
  title: string;
  /** Why this is the move. */
  rationale: string;
  /** Whether a drafted message is the right output, or this is a phone call / an action. */
  drafts: boolean;
  audience: "driver" | "customer" | "business" | null;
  /**
   * The language the reply goes out in. Drivers and consignees here are Spanish-speaking;
   * the ops surface is English. One language per audience, never a mix.
   */
  language: "es" | "en" | null;
}

function money(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}

export function resolutionFor(triaged: TriagedIssue): Resolution {
  const { issue, route, driver } = triaged;
  const kind: IssueKind = issue.kind;
  const audience = KIND_AUDIENCE[kind];
  const driverCode = driver?.code ?? "the driver";
  const routeCode = route?.code ?? "the route";

  switch (kind) {
    case "route_missing":
      return {
        action: "resend_route",
        title: `Resend ${routeCode} to ${driverCode} and confirm they can see it`,
        rationale:
          "A driver who cannot see their route is not driving. Every minute here is the whole block of stops standing still, and the fix is usually one resend.",
        drafts: true,
        audience: "driver",
        language: "es",
      };

    case "pay_question":
      return {
        action: "answer_pay",
        title: route
          ? `Answer with the pay breakdown for ${routeCode} — ${money(route.payCents)}`
          : "Answer with the route's pay breakdown",
        rationale:
          "The number is already on the route record. Answering with the breakdown rather than the figure stops the follow-up question.",
        drafts: true,
        audience: "driver",
        language: "es",
      };

    case "pay_dispute":
      return {
        action: "escalate_payroll",
        title: `Escalate ${routeCode} to payroll with the route record attached`,
        rationale:
          "This is a supply problem, not a support ticket. A driver who feels short-changed is tomorrow's unclaimed route, so it goes to someone who can actually move money — today.",
        drafts: true,
        audience: "driver",
        language: "es",
      };

    case "route_unclaimed":
      return {
        action: "offer_route",
        title: route
          ? `Offer ${routeCode} to nearby drivers — ${money(route.payCents)}, pickup at ${route.pickupLocation}`
          : "Offer the route to nearby drivers",
        rationale:
          "Nobody has taken it and the pickup clock is running. This is the one failure mode entirely inside our control, and it is still fixable right now.",
        drafts: true,
        audience: "driver",
        language: "es",
      };

    case "pickup_problem":
      return {
        action: "call_pickup",
        title: route
          ? `Call the pickup contact at ${route.pickupLocation}`
          : "Call the pickup contact",
        rationale:
          "Bag counts and stop order get resolved by the person standing in the warehouse, not over text. The driver is blocked until they are.",
        drafts: false,
        audience: "driver",
        language: null,
      };

    case "driver_silent":
    case "stalled_driver":
      return {
        action: "call_driver",
        title: `Call ${driverCode} — no movement and no answer`,
        rationale:
          "Silence off-geofence is a breakdown, an accident, or a driver who has given up on the day. Nothing downstream can be planned until someone knows which.",
        drafts: false,
        audience: "driver",
        language: null,
      };

    case "where_is_order":
      return {
        action: "send_eta",
        title: "Reply with the live ETA and the tracking link",
        rationale:
          "The ETA is already on the stop. Sending it beats the automated late text, because this consignee has already decided the automated text was not enough.",
        drafts: true,
        audience: "customer",
        language: "es",
      };

    case "wrong_address":
      return {
        action: "confirm_address",
        title: "Confirm the corrected address before the driver gets there",
        rationale:
          "Catching this before arrival saves a failed attempt and a redelivery leg. After arrival it costs both.",
        drafts: true,
        audience: "customer",
        language: "es",
      };

    case "access_problem":
      return {
        action: "request_access",
        title: "Get the entry code or buzzer name from the consignee",
        rationale:
          "The driver is at the door and cannot get in. The code only exists in the consignee's head, so asking is the whole fix.",
        drafts: true,
        audience: "customer",
        language: "es",
      };

    case "pod_request":
      return {
        action: "send_pod",
        title: "Send the delivery photo and timestamp",
        rationale:
          "We already hold the photo and the scan time. This is a lookup the business should never have had to ask a person for.",
        drafts: true,
        audience: "business",
        language: "en",
      };

    case "issue_list":
      return {
        action: "triage_list",
        title: "Acknowledge the list and split it into its own issues",
        rationale:
          "One email holding a day's problems hides every individual clock inside it. Acknowledge now, split so each one gets ranked on its own.",
        drafts: true,
        audience: "business",
        language: "en",
      };

    case "late_pickup":
      return {
        action: "call_driver",
        title: `Call ${driverCode} — pickup is late and the stops have not started`,
        rationale:
          "The whole route is behind before it begins. Either they are on the way or they are not coming, and the two need very different next moves.",
        drafts: false,
        audience: "driver",
        language: null,
      };

    case "driver_cancelled":
      return {
        action: "offer_route",
        title: `Reassign ${routeCode} — the driver cancelled`,
        rationale:
          "An abandoned route becomes an unclaimed route the moment we stop looking at it. Offer it out while the pickup window is still reachable.",
        drafts: true,
        audience: "driver",
        language: "es",
      };

    case "delivered_far_from_address":
      return {
        action: "confirm_address",
        title: "Check the drop point with the consignee before the business does",
        rationale:
          "Marked delivered a long way from the address is either a geocoding miss or a parcel left somewhere wrong. Both are much cheaper to find out from us than from a complaint.",
        drafts: true,
        audience: "customer",
        language: "es",
      };

    default:
      return {
        action: "read_and_route",
        title: "Read it and route it — we could not classify this one",
        rationale:
          "The classifier would rather say nothing than guess. Four words of reading sorts it, and a confidently wrong label would have cost more.",
        drafts: false,
        audience: audience === "ops" ? null : audience,
        language: null,
      };
  }
}
