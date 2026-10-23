/**
 * Domain model for a last-mile delivery operation.
 *
 * The unit of work here is an **issue**, not a delivery. Vamo's ops board already flags
 * stalled drivers, late pickups and cancellations on its own; what still lands on a human
 * is a text, a call or a Slack thread, and the context needed to answer it is spread
 * across the phone system, Slack and the admin tool.
 *
 * So an issue arrives one of two ways — detected by their existing board, or raised by a
 * person — and from that point the job is identical: assemble the context and answer.
 *
 * This is the shape Radar expects real systems to hand it. `seed.ts` produces it
 * synthetically; swapping in real feeds means replacing that one module.
 */

export type DeliveryStatus =
  | "pending"
  | "assigned"
  | "en_route"
  | "attempted"
  | "delivered"
  | "failed";

export type DriverStatus = "idle" | "driving" | "stopped" | "offline";

/** The business sending the parcel. B2B2C: they hold the contract, the consignee holds the opinion. */
export interface Shipper {
  id: string;
  name: string;
  /** `contract` accounts carry penalty windows and proof-of-delivery obligations. */
  slaTier: "standard" | "contract";
  podRequired: boolean;
}

export interface Driver {
  id: string;
  /** Call sign the ops team uses on the radio. */
  code: string;
  name: string;
  phone: string;
  status: DriverStatus;
  /** Last telemetry ping, ISO. */
  lastPingAt: string;
  /** Minutes since the vehicle last moved meaningfully. */
  minutesSinceMovement: number;
  /** True when the vehicle is parked inside a delivery geofence — a legitimate stop. */
  atStopGeofence: boolean;
}

export type RouteStatus =
  | "unclaimed"
  | "claimed"
  | "at_pickup"
  | "in_progress"
  | "completed"
  | "cancelled";

/**
 * A block of stops a driver claims and runs. Drivers talk about routes, not deliveries —
 * "where's my route", "what does this route pay" — so a product that only knows about
 * parcels cannot answer most of what arrives.
 */
export interface Route {
  id: string;
  /** What everyone says out loud. */
  code: string;
  driverId: string | null;
  shipperId: string;
  pickupAt: string;
  pickupLocation: string;
  stopCount: number;
  stopsCompleted: number;
  status: RouteStatus;
  payCents: number;
  payStatus: "scheduled" | "paid" | "disputed";
}

/** What we already know about this address from previous visits. */
export interface AddressHistory {
  priorFailedAttempts: number;
  /** The address has been corrected by hand before. */
  corrected: boolean;
  /** Multi-unit street with no apartment or unit number on the order. */
  missingUnit: boolean;
  requiresAccessCode: boolean;
  accessNoteOnFile: boolean;
}

export interface ContactEvent {
  at: string;
  channel: "call" | "whatsapp" | "email";
  from: "consignee" | "shipper";
  note: string;
}

export interface Delivery {
  id: string;
  /** The number everyone reads out loud on the phone. */
  consignmentNo: string;
  routeId: string | null;
  consignee: { name: string; phone: string };
  address: { line: string; district: string; postcode: string };
  shipperId: string;
  driverId: string | null;
  status: DeliveryStatus;
  /**
   * How many stops the driver still has to make before reaching this one. A property
   * of the stop's position in the route, not of the driver — one driver holds many
   * stops at different distances.
   */
  stopsAhead: number;
  /** Promised delivery window, ISO. */
  windowStart: string;
  windowEnd: string;
  attempts: number;
  contacts: ContactEvent[];
  addressHistory: AddressHistory;
  /** Last parcel scan event, ISO. */
  lastScanAt: string;
  /** Delivery photo on file, which is what a proof-of-delivery request wants. */
  podPhotoId: string | null;
}

/* ─────────────────────────── Issues ─────────────────────────── */

/**
 * Where the issue came from. `detected` means their existing ops board raised it — Radar
 * ingests those flags rather than reinventing them. Everything else is a human who
 * expects an answer.
 */
export type IssueSource =
  | "detected"
  | "driver_sms"
  | "driver_call"
  | "customer_sms"
  | "customer_call"
  | "business_email"
  | "slack";

/**
 * The taxonomy is taken from what the ops team says actually reaches them by hand. Note
 * how much of it is driver-side: a product that only models the customer misses most of
 * the day's work.
 */
export type IssueKind =
  // Driver-side
  | "route_missing"
  | "pay_question"
  | "pay_dispute"
  | "route_unclaimed"
  | "pickup_problem"
  | "driver_silent"
  // Customer-side
  | "where_is_order"
  | "wrong_address"
  | "access_problem"
  // Business-side
  | "pod_request"
  | "issue_list"
  // Raised by their own ops board
  | "stalled_driver"
  | "late_pickup"
  | "driver_cancelled"
  | "delivered_far_from_address"
  // The classifier could not tell
  | "unknown";

export type Channel = "sms" | "call" | "email" | "slack" | "system";

export interface IssueMessage {
  at: string;
  channel: Channel;
  from: "driver" | "customer" | "business" | "ops" | "system";
  /** For a call, this is the note the operator typed afterwards. */
  body: string;
}

export interface Issue {
  id: string;
  /** What you say out loud: "ISS-2041". */
  ref: string;
  source: IssueSource;
  kind: IssueKind;
  openedAt: string;
  raisedBy: {
    kind: "driver" | "customer" | "business" | "system";
    /** Driver id, delivery consignee, shipper id, or the flagging system. */
    id: string;
    name: string;
  };
  /** What it is about. Either may be null — working that out is half the job. */
  routeId: string | null;
  deliveryId: string | null;
  /** The thread as it arrived. Empty for a detected issue. */
  messages: IssueMessage[];
  /** When a human first answered, if they have. */
  answeredAt: string | null;
  /** A Slack thread someone started about it, if there is one. */
  slackThread: { channel: string; url: string; replies: number } | null;
}

/* ─────────────────────────── Snapshot ─────────────────────────── */

/** Everything the engine needs, resolved and denormalised. */
export interface OperationSnapshot {
  /** Server time the snapshot was taken, ISO. Scoring is always relative to this. */
  now: string;
  issues: Issue[];
  routes: Record<string, Route>;
  deliveries: Delivery[];
  drivers: Record<string, Driver>;
  shippers: Record<string, Shipper>;
  /** Synthetic shift-to-date numbers for the masthead. See README. */
  shift: ShiftStats;
}

export interface ShiftStats {
  /** Issues closed so far this shift. */
  resolvedToday: number;
  /** Median minutes an issue waited before a human answered it. */
  medianFirstReplyMin: number;
  /** Issues whose answer needed nothing but this screen. */
  answeredFromOneScreen: number;
  /** Of those closed, how many came back. */
  reopenedToday: number;
}
