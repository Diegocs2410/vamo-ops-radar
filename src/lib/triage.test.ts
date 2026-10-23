import { describe, expect, it } from "vitest";

import type { Delivery, Driver, Issue, Route, Shipper } from "./domain";
import { TRIAGE_TUNING, tierFor, triageIssue } from "./triage";
import { resolutionFor } from "./resolution";

const NOW = "2026-10-22T10:00:00.000Z";

function at(minutesFromNow: number): string {
  return new Date(Date.parse(NOW) + minutesFromNow * 60_000).toISOString();
}

function makeShipper(over: Partial<Shipper> = {}): Shipper {
  return { id: "shp_1", name: "Tienda Norte", slaTier: "standard", podRequired: false, ...over };
}

function makeDriver(over: Partial<Driver> = {}): Driver {
  return {
    id: "drv_1",
    code: "V-14",
    name: "Lucía Ferrer",
    phone: "+34600000000",
    status: "driving",
    lastPingAt: at(-1),
    minutesSinceMovement: 1,
    atStopGeofence: false,
    ...over,
  };
}

function makeRoute(over: Partial<Route> = {}): Route {
  return {
    id: "rte_1",
    code: "R-412",
    driverId: "drv_1",
    shipperId: "shp_1",
    pickupAt: at(-120),
    pickupLocation: "Hub Vallecas",
    stopCount: 12,
    stopsCompleted: 4,
    status: "in_progress",
    payCents: 4200,
    payStatus: "scheduled",
    ...over,
  };
}

function makeDelivery(over: Partial<Delivery> = {}): Delivery {
  return {
    id: "dlv_1",
    consignmentNo: "VM-480200",
    routeId: "rte_1",
    consignee: { name: "Marta Ibáñez", phone: "+34600111222" },
    address: { line: "Calle de Alcalá 112", district: "Salamanca", postcode: "28009" },
    shipperId: "shp_1",
    driverId: "drv_1",
    status: "en_route",
    stopsAhead: 1,
    windowStart: at(-60),
    windowEnd: at(180),
    attempts: 0,
    contacts: [],
    addressHistory: {
      priorFailedAttempts: 0,
      corrected: false,
      missingUnit: false,
      requiresAccessCode: false,
      accessNoteOnFile: false,
    },
    lastScanAt: at(-30),
    podPhotoId: null,
    ...over,
  };
}

function makeIssue(over: Partial<Issue> = {}): Issue {
  return {
    id: "iss_1",
    ref: "ISS-2040",
    source: "driver_sms",
    kind: "route_missing",
    openedAt: at(-10),
    raisedBy: { kind: "driver", id: "drv_1", name: "V-14 · Lucía Ferrer" },
    routeId: "rte_1",
    deliveryId: null,
    messages: [],
    answeredAt: null,
    slackThread: null,
    ...over,
  };
}

function triage(
  issue: Issue,
  over: {
    route?: Route | null;
    driver?: Driver;
    shipper?: Shipper;
    deliveries?: Delivery[];
  } = {},
) {
  const route = over.route === undefined ? makeRoute() : over.route;
  const driver = over.driver ?? makeDriver();
  const shipper = over.shipper ?? makeShipper();

  return triageIssue(issue, {
    now: NOW,
    routes: route ? { [route.id]: route } : {},
    deliveries: over.deliveries ?? [],
    drivers: { [driver.id]: driver },
    shippers: { [shipper.id]: shipper },
  });
}

function codes(issue: Issue, over?: Parameters<typeof triage>[1]) {
  return triage(issue, over).signals.map((signal) => signal.code);
}

describe("unanswered", () => {
  it("is quiet for the first couple of minutes — somebody may already be typing", () => {
    expect(codes(makeIssue({ openedAt: at(-1) }))).not.toContain("unanswered");
  });

  it("fires once the grace period passes, and grows with the wait", () => {
    const fresh = triage(makeIssue({ openedAt: at(-5) }));
    const stale = triage(makeIssue({ openedAt: at(-45) }));

    const freshPoints = fresh.signals.find((s) => s.code === "unanswered")!.points;
    const stalePoints = stale.signals.find((s) => s.code === "unanswered")!.points;
    expect(stalePoints).toBeGreaterThan(freshPoints);
  });

  it("stops entirely once somebody has replied", () => {
    const answered = makeIssue({ openedAt: at(-90), answeredAt: at(-60) });
    expect(codes(answered)).not.toContain("unanswered");
    expect(triage(answered).waitingMinutes).toBe(0);
  });

  it("never outgrows its ceiling, however long the day has been", () => {
    const ancient = triage(makeIssue({ openedAt: at(-600) }));
    expect(ancient.signals.find((s) => s.code === "unanswered")!.points).toBe(
      TRIAGE_TUNING.unanswered.maxPoints,
    );
  });
});

describe("blocks_route", () => {
  it("weighs the stops that cannot move until this is answered", () => {
    const small = triage(makeIssue(), { route: makeRoute({ stopCount: 6, stopsCompleted: 5 }) });
    const large = triage(makeIssue(), { route: makeRoute({ stopCount: 20, stopsCompleted: 0 }) });

    const smallPoints = small.signals.find((s) => s.code === "blocks_route")!.points;
    const largePoints = large.signals.find((s) => s.code === "blocks_route")!.points;
    expect(largePoints).toBeGreaterThan(smallPoints);
  });

  it("does not fire for a kind that blocks nothing", () => {
    expect(codes(makeIssue({ kind: "pay_question" }))).not.toContain("blocks_route");
  });

  it("does not fire for a route that is already finished", () => {
    const done = makeRoute({ stopCount: 9, stopsCompleted: 9 });
    expect(codes(makeIssue(), { route: done })).not.toContain("blocks_route");
  });
});

describe("stops_at_risk", () => {
  it("asks the delivery-risk engine what the frozen route is actually costing", () => {
    // A stop whose window has already closed with the driver several stops away.
    const doomed = makeDelivery({ windowEnd: at(-90), stopsAhead: 6 });
    const result = triage(makeIssue(), { deliveries: [doomed] });

    expect(result.signals.map((s) => s.code)).toContain("stops_at_risk");
    expect(result.affected).toHaveLength(1);
  });

  it("stays quiet when the route's stops are all comfortable", () => {
    const calm = makeDelivery({ windowEnd: at(300), stopsAhead: 1 });
    expect(codes(makeIssue(), { deliveries: [calm] })).not.toContain("stops_at_risk");
  });

  it("ignores stops that are already delivered", () => {
    const done = makeDelivery({ status: "delivered", windowEnd: at(-200) });
    const result = triage(makeIssue(), { deliveries: [done] });
    expect(result.affected).toHaveLength(0);
  });
});

describe("pickup_imminent", () => {
  it("fires for an unclaimed route with the pickup clock running", () => {
    const unclaimed = makeRoute({ status: "unclaimed", driverId: null, pickupAt: at(20) });
    expect(codes(makeIssue({ kind: "route_unclaimed" }), { route: unclaimed })).toContain(
      "pickup_imminent",
    );
  });

  it("weighs more heavily once the pickup is actually past", () => {
    const soon = triage(makeIssue({ kind: "route_unclaimed" }), {
      route: makeRoute({ status: "unclaimed", driverId: null, pickupAt: at(20) }),
    });
    const missed = triage(makeIssue({ kind: "route_unclaimed" }), {
      route: makeRoute({ status: "unclaimed", driverId: null, pickupAt: at(-30) }),
    });

    expect(missed.signals.find((s) => s.code === "pickup_imminent")!.points).toBeGreaterThan(
      soon.signals.find((s) => s.code === "pickup_imminent")!.points,
    );
  });

  it("does not fire for a pickup comfortably in the future", () => {
    const later = makeRoute({ status: "unclaimed", driverId: null, pickupAt: at(240) });
    expect(codes(makeIssue({ kind: "route_unclaimed" }), { route: later })).not.toContain(
      "pickup_imminent",
    );
  });
});

describe("money", () => {
  it("weighs a dispute above a question, because one of them loses us a driver", () => {
    const question = triage(makeIssue({ kind: "pay_question" }));
    const dispute = triage(makeIssue({ kind: "pay_dispute" }));

    expect(dispute.signals.find((s) => s.code === "money")!.points).toBeGreaterThan(
      question.signals.find((s) => s.code === "money")!.points,
    );
  });
});

describe("driver_silent", () => {
  it("fires for a vehicle that has stopped moving mid-route", () => {
    const silent = makeDriver({ status: "stopped", minutesSinceMovement: 40 });
    expect(codes(makeIssue(), { driver: silent })).toContain("driver_silent");
  });

  it("does not fire for a driver parked at a stop — that is the job", () => {
    const working = makeDriver({
      status: "stopped",
      minutesSinceMovement: 40,
      atStopGeofence: true,
    });
    expect(codes(makeIssue(), { driver: working })).not.toContain("driver_silent");
  });

  it("does not fire before the route has even started", () => {
    const silent = makeDriver({ status: "stopped", minutesSinceMovement: 40 });
    const notStarted = makeRoute({ status: "at_pickup" });
    expect(codes(makeIssue(), { driver: silent, route: notStarted })).not.toContain(
      "driver_silent",
    );
  });
});

describe("triageIssue", () => {
  it("sums its signals and orders them heaviest first", () => {
    const result = triage(
      makeIssue({ openedAt: at(-40), kind: "pay_dispute" }),
      { shipper: makeShipper({ slaTier: "contract" }) },
    );

    expect(result.priority).toBe(
      result.signals.reduce((total, signal) => total + signal.points, 0),
    );
    const points = result.signals.map((s) => s.points);
    expect(points).toEqual([...points].sort((a, b) => b - a));
  });

  it("clamps at 100 when everything is wrong at once", () => {
    const doomed = [
      makeDelivery({ id: "a", windowEnd: at(-200), stopsAhead: 8 }),
      makeDelivery({ id: "b", windowEnd: at(-180), stopsAhead: 7 }),
      makeDelivery({ id: "c", windowEnd: at(-160), stopsAhead: 6 }),
    ];
    const result = triage(
      makeIssue({ openedAt: at(-300), kind: "pay_dispute" }),
      {
        route: makeRoute({ stopCount: 20, stopsCompleted: 0, status: "unclaimed", pickupAt: at(-60) }),
        driver: makeDriver({ status: "stopped", minutesSinceMovement: 90 }),
        shipper: makeShipper({ slaTier: "contract", podRequired: true }),
        deliveries: doomed,
      },
    );

    expect(result.priority).toBe(100);
  });

  it("survives an issue linked to nothing at all", () => {
    const orphan = makeIssue({ kind: "unknown", routeId: null, deliveryId: null });
    const result = triage(orphan, { route: null });

    expect(result.route).toBeNull();
    expect(result.priority).toBeGreaterThanOrEqual(0);
    expect(resolutionFor(result).action).toBe("read_and_route");
  });
});

describe("tierFor", () => {
  it("places priorities on the right side of every threshold", () => {
    const { critical, high, watch } = TRIAGE_TUNING.tiers;

    expect(tierFor(critical)).toBe("critical");
    expect(tierFor(critical - 1)).toBe("high");
    expect(tierFor(high)).toBe("high");
    expect(tierFor(high - 1)).toBe("watch");
    expect(tierFor(watch)).toBe("watch");
    expect(tierFor(watch - 1)).toBe("cleared");
  });
});

describe("resolutionFor", () => {
  it("gives a driver who cannot see their route a resend, not an apology", () => {
    const resolution = resolutionFor(triage(makeIssue({ kind: "route_missing" })));
    expect(resolution.action).toBe("resend_route");
    expect(resolution.language).toBe("es");
    expect(resolution.title).toContain("R-412");
  });

  it("sends a pay dispute to payroll rather than drafting a reassurance", () => {
    expect(resolutionFor(triage(makeIssue({ kind: "pay_dispute" }))).action).toBe(
      "escalate_payroll",
    );
  });

  it("answers a pay question with the actual figure on the route", () => {
    const resolution = resolutionFor(triage(makeIssue({ kind: "pay_question" })));
    expect(resolution.title).toContain("€42.00");
  });

  it("knows when the move is a phone call and offers no draft", () => {
    for (const kind of ["pickup_problem", "driver_silent", "late_pickup"] as const) {
      expect(resolutionFor(triage(makeIssue({ kind }))).drafts).toBe(false);
    }
  });

  it("writes to a business in English and to a consignee in Spanish", () => {
    expect(resolutionFor(triage(makeIssue({ kind: "pod_request" }))).language).toBe("en");
    expect(resolutionFor(triage(makeIssue({ kind: "where_is_order" }))).language).toBe("es");
  });
});

describe("detected flags versus people", () => {
  it("does not call a board flag 'unanswered' — nobody asked us anything", () => {
    const flagged = makeIssue({ source: "detected", kind: "stalled_driver", openedAt: at(-60) });
    expect(codes(flagged)).not.toContain("unanswered");
  });

  it("still ages a flag nobody has looked at, just more cheaply", () => {
    const flagged = triage(
      makeIssue({ source: "detected", kind: "stalled_driver", openedAt: at(-60) }),
    );
    const asked = triage(makeIssue({ openedAt: at(-60) }));

    const flaggedPoints = flagged.signals.find((s) => s.code === "unreviewed")!.points;
    const askedPoints = asked.signals.find((s) => s.code === "unanswered")!.points;

    expect(flaggedPoints).toBeGreaterThan(0);
    expect(flaggedPoints).toBeLessThan(askedPoints);
  });

  it("gives a person waiting the same length of time the higher priority", () => {
    const flagged = triage(makeIssue({ source: "detected", openedAt: at(-45) }));
    const asked = triage(makeIssue({ source: "driver_sms", openedAt: at(-45) }));
    expect(asked.priority).toBeGreaterThan(flagged.priority);
  });
});
