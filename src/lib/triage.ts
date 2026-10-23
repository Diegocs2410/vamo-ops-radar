/**
 * The triage engine: how urgent is this issue, and why.
 *
 * Same shape as the delivery-risk model in `risk.ts`, and for the same reason — an
 * operator who cannot see why an issue sits at the top will work the queue out of order,
 * and the ordering is the product. Every weight lives in `TRIAGE_TUNING`.
 *
 * What it is *not* is a detector. Vamo's ops board already flags stalled drivers, late
 * pickups and cancellations; those arrive here as issues with `source: "detected"` and get
 * ranked alongside the texts and calls, rather than being computed again.
 *
 * Delivery risk still matters, but it has been demoted from the headline to one input:
 * `stops_at_risk` asks `risk.ts` what a frozen route is actually costing.
 */

import type { Delivery, Driver, Issue, OperationSnapshot, Route, Shipper } from "./domain";
import { type RiskTier, type ScoredDelivery, scoreDelivery } from "./risk";

export type TriageSignalCode =
  | "unanswered"
  | "unreviewed"
  | "blocks_route"
  | "stops_at_risk"
  | "contract_account"
  | "pickup_imminent"
  | "customer_waiting"
  | "driver_silent"
  | "money";

export interface TriageSignal {
  code: TriageSignalCode;
  label: string;
  detail: string;
  points: number;
}

export interface TriagedIssue {
  issue: Issue;
  route: Route | null;
  driver: Driver | null;
  shipper: Shipper | null;
  delivery: Delivery | null;
  /** Stops on the affected route, scored, worst first. The cost of leaving this alone. */
  affected: ScoredDelivery[];
  priority: number;
  tier: RiskTier;
  signals: TriageSignal[];
  /** Minutes this has been waiting on a human. Zero once answered. */
  waitingMinutes: number;
}

export const TRIAGE_TUNING = {
  /**
   * The headline, and it applies only to issues a person raised: somebody asked us
   * something and nobody has replied. Detected flags age through their own operational
   * signals instead.
   */
  unanswered: { graceMinutes: 3, base: 6, perMinute: 1.1, maxPoints: 40 },

  /**
   * The detected counterpart. A flag nobody has looked at is not a person left waiting,
   * so it is worth less — but it is not worth nothing, and without this a quiet flag
   * scores zero and falls off the bottom of the queue forever.
   */
  unreviewed: { graceMinutes: 5, base: 4, perMinute: 0.35, maxPoints: 18 },

  /** The driver cannot start or continue, so the whole block of stops is frozen. */
  blocksRoute: { perStop: 2.5, maxPoints: 30 },

  /** What the freeze is costing, asked of the delivery-risk engine. */
  stopsAtRisk: { perCriticalStop: 6, perHighStop: 3, maxPoints: 24 },

  contractAccount: { points: 10 },

  pickupImminent: {
    thresholdMinutes: 45,
    base: 20,
    perMinuteOverdue: 0.6,
    maxPoints: 32,
  },

  customerWaiting: { twoContacts: 14, threeOrMore: 20 },

  driverSilent: { thresholdMinutes: 20, base: 10, perMinute: 0.4, maxPoints: 22 },

  /**
   * Pay is not a customer-service problem, it is a supply problem: a driver who feels
   * short-changed is tomorrow's unclaimed route.
   */
  money: { question: 8, dispute: 18 },

  tiers: { critical: 60, high: 40, watch: 20 },
} as const;

/** Issue kinds that stop a route dead until someone answers. */
const BLOCKING_KINDS = new Set<Issue["kind"]>([
  "route_missing",
  "pickup_problem",
  "driver_silent",
  "stalled_driver",
  "late_pickup",
  "driver_cancelled",
  "route_unclaimed",
]);

const MINUTE = 60_000;

function minutesBetween(fromIso: string, toIso: string): number {
  return (Date.parse(toIso) - Date.parse(fromIso)) / MINUTE;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function unansweredSignal(issue: Issue, waitingMinutes: number): TriageSignal | null {
  // Only a person can be left unanswered. A flag from their ops board is not waiting for a
  // reply, and letting it collect this signal would push detected issues above the texts
  // and calls that are the whole reason this queue exists.
  if (issue.source === "detected") return null;
  if (issue.answeredAt !== null) return null;
  if (waitingMinutes < TRIAGE_TUNING.unanswered.graceMinutes) return null;

  const { base, perMinute, maxPoints } = TRIAGE_TUNING.unanswered;
  const points = clamp(Math.round(base + waitingMinutes * perMinute), base, maxPoints);

  return {
    code: "unanswered",
    label: "Unanswered",
    detail: `Waiting ${Math.round(waitingMinutes)} min with no reply`,
    points,
  };
}

function unreviewedSignal(issue: Issue, waitingMinutes: number): TriageSignal | null {
  if (issue.source !== "detected") return null;
  if (issue.answeredAt !== null) return null;
  if (waitingMinutes < TRIAGE_TUNING.unreviewed.graceMinutes) return null;

  const { base, perMinute, maxPoints } = TRIAGE_TUNING.unreviewed;
  const points = clamp(Math.round(base + waitingMinutes * perMinute), base, maxPoints);

  return {
    code: "unreviewed",
    label: "Unreviewed",
    detail: `Flagged ${Math.round(waitingMinutes)} min ago and nobody has looked at it`,
    points,
  };
}

function blocksRouteSignal(issue: Issue, route: Route | null): TriageSignal | null {
  if (!BLOCKING_KINDS.has(issue.kind)) return null;
  if (!route) return null;

  const frozen = Math.max(0, route.stopCount - route.stopsCompleted);
  if (frozen === 0) return null;

  const points = clamp(
    Math.round(frozen * TRIAGE_TUNING.blocksRoute.perStop),
    1,
    TRIAGE_TUNING.blocksRoute.maxPoints,
  );

  return {
    code: "blocks_route",
    label: "Route blocked",
    detail: `${plural(frozen, "stop")} on ${route.code} cannot move until this is answered`,
    points,
  };
}

function stopsAtRiskSignal(affected: ScoredDelivery[]): TriageSignal | null {
  const critical = affected.filter((stop) => stop.tier === "critical").length;
  const high = affected.filter((stop) => stop.tier === "high").length;
  if (critical === 0 && high === 0) return null;

  const { perCriticalStop, perHighStop, maxPoints } = TRIAGE_TUNING.stopsAtRisk;
  const points = clamp(critical * perCriticalStop + high * perHighStop, 1, maxPoints);

  const parts = [
    critical > 0 ? `${critical} critical` : "",
    high > 0 ? `${high} high` : "",
  ].filter(Boolean);

  return {
    code: "stops_at_risk",
    label: "Stops at risk",
    detail: `${parts.join(" and ")} on this route are already projecting past their window`,
    points,
  };
}

function contractAccountSignal(shipper: Shipper | null): TriageSignal | null {
  if (!shipper || shipper.slaTier !== "contract") return null;

  return {
    code: "contract_account",
    label: "Contract SLA",
    detail: `${shipper.name} carries a penalty window${
      shipper.podRequired ? " and requires proof of delivery" : ""
    }`,
    points: TRIAGE_TUNING.contractAccount.points,
  };
}

/** An unclaimed route is the one failure entirely inside our control, and it has a clock. */
function pickupImminentSignal(
  issue: Issue,
  route: Route | null,
  now: string,
): TriageSignal | null {
  if (!route) return null;
  if (route.status !== "unclaimed" && issue.kind !== "late_pickup") return null;

  const minutesToPickup = minutesBetween(now, route.pickupAt);
  if (minutesToPickup > TRIAGE_TUNING.pickupImminent.thresholdMinutes) return null;

  const { base, perMinuteOverdue, maxPoints } = TRIAGE_TUNING.pickupImminent;
  const overdue = Math.max(0, -minutesToPickup);
  const points = clamp(Math.round(base + overdue * perMinuteOverdue), base, maxPoints);

  return {
    code: "pickup_imminent",
    label: route.status === "unclaimed" ? "Nobody claimed it" : "Pickup late",
    detail:
      overdue > 0
        ? `Pickup was ${Math.round(overdue)} min ago and the route is ${route.status}`
        : `Pickup in ${Math.round(minutesToPickup)} min and the route is ${route.status}`,
    points,
  };
}

function customerWaitingSignal(delivery: Delivery | null, now: string): TriageSignal | null {
  if (!delivery) return null;

  const cutoff = Date.parse(now) - 90 * MINUTE;
  const recent = delivery.contacts.filter(
    (contact) => contact.from === "consignee" && Date.parse(contact.at) >= cutoff,
  );
  if (recent.length < 2) return null;

  return {
    code: "customer_waiting",
    label: "Chased repeatedly",
    detail: `${recent.length} contacts from this consignee in the last 90 min`,
    points:
      recent.length >= 3
        ? TRIAGE_TUNING.customerWaiting.threeOrMore
        : TRIAGE_TUNING.customerWaiting.twoContacts,
  };
}

function driverSilentSignal(driver: Driver | null, route: Route | null): TriageSignal | null {
  if (!driver || !route) return null;
  if (route.status !== "in_progress") return null;
  if (driver.minutesSinceMovement < TRIAGE_TUNING.driverSilent.thresholdMinutes) return null;
  if (driver.atStopGeofence) return null;

  const { base, perMinute, maxPoints } = TRIAGE_TUNING.driverSilent;
  const points = clamp(
    Math.round(base + driver.minutesSinceMovement * perMinute),
    base,
    maxPoints,
  );

  return {
    code: "driver_silent",
    label: "No signal",
    detail: `${driver.code} has not moved for ${driver.minutesSinceMovement} min, mid-route`,
    points,
  };
}

function moneySignal(issue: Issue, route: Route | null): TriageSignal | null {
  if (issue.kind !== "pay_question" && issue.kind !== "pay_dispute") return null;

  const dispute = issue.kind === "pay_dispute";
  return {
    code: "money",
    label: dispute ? "Pay disputed" : "Pay question",
    detail: dispute
      ? `A driver says ${route ? route.code : "a route"} paid wrong — unanswered pay is how we lose drivers`
      : `A driver is asking what ${route ? route.code : "a route"} pays`,
    points: dispute ? TRIAGE_TUNING.money.dispute : TRIAGE_TUNING.money.question,
  };
}

export function tierFor(priority: number): RiskTier {
  if (priority >= TRIAGE_TUNING.tiers.critical) return "critical";
  if (priority >= TRIAGE_TUNING.tiers.high) return "high";
  if (priority >= TRIAGE_TUNING.tiers.watch) return "watch";
  return "cleared";
}

export function triageIssue(
  issue: Issue,
  snapshot: Pick<OperationSnapshot, "routes" | "deliveries" | "drivers" | "shippers" | "now">,
): TriagedIssue {
  const { now } = snapshot;
  const route = issue.routeId ? snapshot.routes[issue.routeId] ?? null : null;
  const driverId = issue.routeId ? route?.driverId ?? null : null;
  const driver = driverId ? snapshot.drivers[driverId] ?? null : null;
  const delivery = issue.deliveryId
    ? snapshot.deliveries.find((d) => d.id === issue.deliveryId) ?? null
    : null;
  const shipper = route
    ? snapshot.shippers[route.shipperId] ?? null
    : delivery
      ? snapshot.shippers[delivery.shipperId] ?? null
      : null;

  // How long this has been sitting with us — whether a person is waiting on a reply or a
  // flag is waiting to be looked at.
  const waitingMinutes =
    issue.answeredAt === null ? Math.max(0, minutesBetween(issue.openedAt, now)) : 0;

  // What the affected route is costing right now, asked of the delivery-risk engine.
  const affected = route
    ? snapshot.deliveries
        .filter((d) => d.routeId === route.id && d.status !== "delivered")
        .map((d) =>
          scoreDelivery(
            d,
            d.driverId ? snapshot.drivers[d.driverId] ?? null : null,
            snapshot.shippers[d.shipperId],
            now,
          ),
        )
        .sort((a, b) => b.score - a.score)
    : [];

  const signals = [
    unansweredSignal(issue, waitingMinutes),
    unreviewedSignal(issue, waitingMinutes),
    blocksRouteSignal(issue, route),
    stopsAtRiskSignal(affected),
    contractAccountSignal(shipper),
    pickupImminentSignal(issue, route, now),
    customerWaitingSignal(delivery, now),
    driverSilentSignal(driver, route),
    moneySignal(issue, route),
  ].filter((signal): signal is TriageSignal => signal !== null);

  const priority = clamp(
    signals.reduce((total, signal) => total + signal.points, 0),
    0,
    100,
  );

  signals.sort((a, b) => b.points - a.points);

  return {
    issue,
    route,
    driver,
    shipper,
    delivery,
    affected,
    priority,
    tier: tierFor(priority),
    signals,
    waitingMinutes,
  };
}

/**
 * Triage the whole board. Ties break on who has been waiting longest, because between
 * two equally urgent issues the fair one to answer is the older one.
 */
export function triageBoard(snapshot: OperationSnapshot): TriagedIssue[] {
  return snapshot.issues
    .map((issue) => triageIssue(issue, snapshot))
    .sort((a, b) => b.priority - a.priority || b.waitingMinutes - a.waitingMinutes);
}
