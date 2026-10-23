/**
 * The risk engine.
 *
 * A transparent additive model — not a learned one, and not an LLM:
 *
 *  - The ranking *is* the product. An operator who cannot see why a row scores 72
 *    will not trust the row, and an untrusted queue gets worked out of order.
 *  - Every weight below is a number an ops lead can argue with and change. That is
 *    the point: `TUNING` is the whole model's surface area.
 *  - It is pure and synchronous, so it is unit-testable and runs identically on the
 *    server and the client.
 *
 * The trade-off: an additive model cannot learn interactions. A stalled driver on a
 * contract account in rush hour is worse than the sum of its parts, and this model
 * cannot know that. See README.
 */

import type { Delivery, Driver, OperationSnapshot, Shipper } from "./domain";

export type SignalCode =
  | "eta_breach"
  | "driver_stalled"
  | "repeat_contact"
  | "failed_attempt"
  | "address_risk"
  | "access_risk"
  | "sla_account"
  | "window_closing";

export type RiskTier = "critical" | "high" | "watch" | "cleared";

export interface Signal {
  code: SignalCode;
  /** Pre-printed caption register: short and scannable. */
  label: string;
  /** One line of operator language explaining what actually happened. */
  detail: string;
  points: number;
}

export interface ScoredDelivery {
  delivery: Delivery;
  driver: Driver | null;
  shipper: Shipper;
  score: number;
  tier: RiskTier;
  signals: Signal[];
  /** Projected arrival, ISO, or null when it cannot be projected (no driver yet). */
  projectedArrival: string | null;
  /** Minutes past the promised window end. Negative means still comfortable. */
  slipMinutes: number | null;
  /** Minutes until the promised window closes. Negative means already closed. */
  minutesToWindowEnd: number;
}

/**
 * Every tunable in one object. Changing operational behaviour should never mean
 * reading the scoring functions.
 */
export const TUNING = {
  /** Travel time between two consecutive stops, minutes. */
  legMinutes: 7,
  /** Time on the ground per stop, minutes. */
  serviceMinutes: 4,

  etaBreach: {
    /** Slip below this is noise, not a signal. */
    ignoreBelowMinutes: 5,
    base: 12,
    perMinute: 0.7,
    maxPoints: 45,
  },
  driverStalled: {
    thresholdMinutes: 12,
    points: 25,
    /**
     * A stalled van only threatens the stops it is about to miss. Beyond this horizon
     * the stall may well be resolved before it ever matters, and flagging those stops
     * fills the queue with rows an operator cannot act on.
     */
    horizonMinutes: 120,
  },
  repeatContact: { windowMinutes: 90, twoContacts: 20, threeOrMore: 28 },
  failedAttempt: { points: 30 },
  addressRisk: { priorFailure: 15, missingUnit: 10, corrected: 8 },
  accessRisk: { points: 14 },
  slaAccount: { points: 12 },
  windowClosing: {
    thresholdMinutes: 25,
    points: 22,
    /** Once the window is actually past, this stops being a warning and becomes a breach. */
    perMinuteOverdue: 0.5,
    maxPoints: 40,
  },

  tiers: { critical: 60, high: 40, watch: 20 },
} as const;

const MINUTE = 60_000;

function minutesBetween(fromIso: string, toIso: string): number {
  return (Date.parse(toIso) - Date.parse(fromIso)) / MINUTE;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Projected arrival for a stop, from where the driver currently sits in their manifest.
 *
 * A stall needs no term of its own here: while the vehicle sits still `now` advances
 * and `stopsAhead` does not, so the projection slips on its own. The `driver_stalled`
 * signal exists to name the cause, not to double-count the delay.
 */
export function projectArrival(
  delivery: Delivery,
  driver: Driver | null,
  now: string,
): string | null {
  if (delivery.status === "delivered") return null;
  if (!driver || driver.status === "offline") return null;

  const remaining =
    TUNING.legMinutes +
    delivery.stopsAhead * (TUNING.serviceMinutes + TUNING.legMinutes);

  return new Date(Date.parse(now) + remaining * MINUTE).toISOString();
}

function etaBreachSignal(slipMinutes: number | null): Signal | null {
  if (slipMinutes === null) return null;
  if (slipMinutes < TUNING.etaBreach.ignoreBelowMinutes) return null;

  const { base, perMinute, maxPoints } = TUNING.etaBreach;
  const points = clamp(Math.round(base + slipMinutes * perMinute), base, maxPoints);

  return {
    code: "eta_breach",
    label: "ETA breach",
    detail: `Projected ${Math.round(slipMinutes)} min past the window close`,
    points,
  };
}

function driverStalledSignal(
  driver: Driver | null,
  minutesToWindowEnd: number,
): Signal | null {
  if (!driver) return null;
  if (driver.status !== "stopped") return null;
  if (driver.atStopGeofence) return null;
  if (driver.minutesSinceMovement < TUNING.driverStalled.thresholdMinutes) return null;
  if (minutesToWindowEnd > TUNING.driverStalled.horizonMinutes) return null;

  return {
    code: "driver_stalled",
    label: "Driver stalled",
    detail: `${driver.code} has not moved for ${driver.minutesSinceMovement} min, and is not at a stop`,
    points: TUNING.driverStalled.points,
  };
}

function repeatContactSignal(delivery: Delivery, now: string): Signal | null {
  const cutoff = Date.parse(now) - TUNING.repeatContact.windowMinutes * MINUTE;
  const recent = delivery.contacts.filter(
    (c) => c.from === "consignee" && Date.parse(c.at) >= cutoff,
  );
  if (recent.length < 2) return null;

  return {
    code: "repeat_contact",
    label: "Repeat contact",
    detail: `${recent.length} consignee contacts in the last ${TUNING.repeatContact.windowMinutes} min`,
    points:
      recent.length >= 3
        ? TUNING.repeatContact.threeOrMore
        : TUNING.repeatContact.twoContacts,
  };
}

function failedAttemptSignal(delivery: Delivery): Signal | null {
  if (delivery.status !== "attempted" && delivery.status !== "failed") return null;

  return {
    code: "failed_attempt",
    label: "Attempt failed",
    detail: `Attempt ${delivery.attempts} failed and no reattempt is booked`,
    points: TUNING.failedAttempt.points,
  };
}

/** One signal for the address, taking the most severe applicable reason. */
function addressRiskSignal(delivery: Delivery): Signal | null {
  const history = delivery.addressHistory;

  if (history.priorFailedAttempts >= 1) {
    return {
      code: "address_risk",
      label: "Risky address",
      detail: `${history.priorFailedAttempts} previous failed attempt(s) at this address`,
      points: TUNING.addressRisk.priorFailure,
    };
  }
  if (history.missingUnit) {
    return {
      code: "address_risk",
      label: "Risky address",
      detail: "Multi-unit street with no unit number on the order",
      points: TUNING.addressRisk.missingUnit,
    };
  }
  if (history.corrected) {
    return {
      code: "address_risk",
      label: "Risky address",
      detail: "Address was corrected by hand on a previous order",
      points: TUNING.addressRisk.corrected,
    };
  }
  return null;
}

function accessRiskSignal(delivery: Delivery): Signal | null {
  const { requiresAccessCode, accessNoteOnFile } = delivery.addressHistory;
  if (!requiresAccessCode || accessNoteOnFile) return null;

  return {
    code: "access_risk",
    label: "Access unknown",
    detail: "Building needs an entry code and none is on file",
    points: TUNING.accessRisk.points,
  };
}

function slaAccountSignal(shipper: Shipper): Signal | null {
  if (shipper.slaTier !== "contract") return null;

  return {
    code: "sla_account",
    label: "Contract SLA",
    detail: `${shipper.name} carries a penalty window${
      shipper.podRequired ? " and requires proof of delivery" : ""
    }`,
    points: TUNING.slaAccount.points,
  };
}

/**
 * Nobody has picked this up yet. Only fires before dispatch: once the parcel is en
 * route, `eta_breach` is the sharper statement of the same worry.
 */
function windowClosingSignal(
  delivery: Delivery,
  minutesToWindowEnd: number,
): Signal | null {
  if (delivery.status !== "pending" && delivery.status !== "assigned") return null;
  if (minutesToWindowEnd > TUNING.windowClosing.thresholdMinutes) return null;

  const { points: base, perMinuteOverdue, maxPoints } = TUNING.windowClosing;
  const overdue = Math.max(0, -minutesToWindowEnd);
  const points = clamp(Math.round(base + overdue * perMinuteOverdue), base, maxPoints);

  return {
    code: "window_closing",
    label: "Not dispatched",
    detail:
      overdue > 0
        ? `Window closed ${Math.round(overdue)} min ago and it is still ${delivery.status}`
        : `Window closes in ${Math.round(minutesToWindowEnd)} min and it is still ${delivery.status}`,
    points,
  };
}

export function tierFor(score: number): RiskTier {
  if (score >= TUNING.tiers.critical) return "critical";
  if (score >= TUNING.tiers.high) return "high";
  if (score >= TUNING.tiers.watch) return "watch";
  return "cleared";
}

export function scoreDelivery(
  delivery: Delivery,
  driver: Driver | null,
  shipper: Shipper,
  now: string,
): ScoredDelivery {
  const minutesToWindowEnd = minutesBetween(now, delivery.windowEnd);
  const projectedArrival = projectArrival(delivery, driver, now);
  const slipMinutes =
    projectedArrival === null
      ? null
      : minutesBetween(delivery.windowEnd, projectedArrival);

  if (delivery.status === "delivered") {
    return {
      delivery,
      driver,
      shipper,
      score: 0,
      tier: "cleared",
      signals: [],
      projectedArrival: null,
      slipMinutes: null,
      minutesToWindowEnd,
    };
  }

  const signals = [
    etaBreachSignal(slipMinutes),
    driverStalledSignal(driver, minutesToWindowEnd),
    repeatContactSignal(delivery, now),
    failedAttemptSignal(delivery),
    addressRiskSignal(delivery),
    accessRiskSignal(delivery),
    slaAccountSignal(shipper),
    windowClosingSignal(delivery, minutesToWindowEnd),
  ].filter((s): s is Signal => s !== null);

  const score = clamp(
    signals.reduce((total, s) => total + s.points, 0),
    0,
    100,
  );

  // Heaviest contribution first: the row has to read its own reason top-down.
  signals.sort((a, b) => b.points - a.points);

  return {
    delivery,
    driver,
    shipper,
    score,
    tier: tierFor(score),
    signals,
    projectedArrival,
    slipMinutes,
    minutesToWindowEnd,
  };
}

/**
 * Score a whole board and rank it. Ties break on the tighter window, because between
 * two equally risky stops the one closing sooner is the one to work first.
 */
export function scoreBoard(snapshot: OperationSnapshot): ScoredDelivery[] {
  return snapshot.deliveries
    .map((delivery) =>
      scoreDelivery(
        delivery,
        delivery.driverId ? snapshot.drivers[delivery.driverId] ?? null : null,
        snapshot.shippers[delivery.shipperId],
        snapshot.now,
      ),
    )
    .sort((a, b) => b.score - a.score || a.minutesToWindowEnd - b.minutesToWindowEnd);
}
