/**
 * Domain model for a last-mile delivery operation.
 *
 * This is the shape Radar expects a real dispatch system to hand it. The seed
 * generator in `seed.ts` produces it synthetically; swapping in a real feed means
 * replacing that one module, not touching the engine or the UI.
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
}

/** Everything the engine needs to score a board, resolved and denormalised. */
export interface OperationSnapshot {
  /** Server time the snapshot was taken, ISO. Scoring is always relative to this. */
  now: string;
  deliveries: Delivery[];
  drivers: Record<string, Driver>;
  shippers: Record<string, Shipper>;
  /** Synthetic shift-to-date numbers for the masthead. See README. */
  shift: ShiftStats;
}

export interface ShiftStats {
  /** Incidents Radar flagged before any inbound contact, out of total incidents today. */
  detectedProactively: number;
  incidentsToday: number;
  /** Median minutes between a flag and the window breaching. */
  medianLeadTimeMin: number;
  resolvedToday: number;
  falsePositivesToday: number;
}
