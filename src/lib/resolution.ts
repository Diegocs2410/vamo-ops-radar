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
          "He can't start until this is sorted, and the whole block of stops is sitting still behind it. Usually it's one resend.",
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
          "The figure is on the route record. Send the breakdown, not just the number — it saves the second message.",
        drafts: true,
        audience: "driver",
        language: "es",
      };

    case "pay_dispute":
      return {
        action: "escalate_payroll",
        title: `Escalate ${routeCode} to payroll with the route record attached`,
        rationale:
          "This is a supply problem wearing a support ticket's clothes. A driver who feels short-changed doesn't take tomorrow's route, so it goes to someone who can actually move money.",
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
          "Nobody's taken it and the pickup clock is running. Still fixable, for now.",
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
          "Bag counts get sorted by whoever's standing in the warehouse, not over text. He's blocked until they are.",
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
          "Off-geofence silence is a breakdown, an accident, or someone who's given up on the day. We can't plan anything downstream until we know which.",
        drafts: false,
        audience: "driver",
        language: null,
      };

    case "where_is_order":
      return {
        action: "send_eta",
        title: "Reply with the live ETA and the tracking link",
        rationale:
          "The ETA's on the stop already. They've written in anyway, so the automated late text clearly didn't land for them.",
        drafts: true,
        audience: "customer",
        language: "es",
      };

    case "wrong_address":
      return {
        action: "confirm_address",
        title: "Confirm the corrected address before the driver gets there",
        rationale:
          "Catch it before arrival and it costs a message. After arrival it's a failed attempt and a redelivery leg.",
        drafts: true,
        audience: "customer",
        language: "es",
      };

    case "access_problem":
      return {
        action: "request_access",
        title: "Get the entry code or buzzer name from the consignee",
        rationale:
          "He's at the door and can't get in. The code only exists in the consignee's head.",
        drafts: true,
        audience: "customer",
        language: "es",
      };

    case "pod_request":
      return {
        action: "send_pod",
        title: "Send the delivery photo and timestamp",
        rationale:
          "We've got the photo and the scan time. They shouldn't have had to ask a person for this.",
        drafts: true,
        audience: "business",
        language: "en",
      };

    case "issue_list":
      return {
        action: "triage_list",
        title: "Acknowledge the list and split it into its own issues",
        rationale:
          "One email with a day's problems hides every clock inside it. Acknowledge, then split.",
        drafts: true,
        audience: "business",
        language: "en",
      };

    case "late_pickup":
      return {
        action: "call_driver",
        title: `Call ${driverCode} — pickup is late and the stops have not started`,
        rationale:
          "The route's behind before it starts. Either they're on the way or they're not coming, and those need very different next moves.",
        drafts: false,
        audience: "driver",
        language: null,
      };

    case "driver_cancelled":
      return {
        action: "offer_route",
        title: `Reassign ${routeCode} — the driver cancelled`,
        rationale:
          "Offer it out while the pickup window is still reachable.",
        drafts: true,
        audience: "driver",
        language: "es",
      };

    case "delivered_far_from_address":
      return {
        action: "confirm_address",
        title: "Check the drop point with the consignee before the business does",
        rationale:
          "Either a geocoding miss or a parcel left somewhere wrong. Both are cheaper to hear from us than from a complaint.",
        drafts: true,
        audience: "customer",
        language: "es",
      };

    default:
      return {
        action: "read_and_route",
        title: "Read it and route it — we could not classify this one",
        rationale:
          "The classifier would rather say nothing than guess. Four words of reading sorts it.",
        drafts: false,
        audience: audience === "ops" ? null : audience,
        language: null,
      };
  }
}
