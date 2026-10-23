import { describe, expect, it } from "vitest";

import type { Delivery, Driver, OperationSnapshot, Shipper } from "./domain";
import { TUNING, projectArrival, scoreBoard, scoreDelivery, tierFor } from "./risk";

const NOW = "2026-10-22T10:00:00.000Z";

function at(minutesFromNow: number): string {
  return new Date(Date.parse(NOW) + minutesFromNow * 60_000).toISOString();
}

function makeShipper(over: Partial<Shipper> = {}): Shipper {
  return {
    id: "shp_1",
    name: "Tienda Norte",
    slaTier: "standard",
    podRequired: false,
    ...over,
  };
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

function makeDelivery(over: Partial<Delivery> = {}): Delivery {
  return {
    id: "dlv_1",
    consignmentNo: "VM-480221",
    routeId: null,
    consignee: { name: "Marta Ibáñez", phone: "+34600111222" },
    address: { line: "Calle de Alcalá 112", district: "Salamanca", postcode: "28009" },
    shipperId: "shp_1",
    driverId: "drv_1",
    status: "en_route",
    stopsAhead: 0,
    windowStart: at(-60),
    windowEnd: at(60),
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

/** Score a single delivery against the default shipper/driver unless overridden. */
function score(
  delivery: Delivery,
  driver: Driver | null = makeDriver(),
  shipper: Shipper = makeShipper(),
) {
  return scoreDelivery(delivery, driver, shipper, NOW);
}

function codes(delivery: Delivery, driver?: Driver | null, shipper?: Shipper) {
  return score(delivery, driver, shipper).signals.map((s) => s.code);
}

describe("projectArrival", () => {
  it("is one leg away when the driver has no stops ahead", () => {
    const projected = projectArrival(makeDelivery({ stopsAhead: 0 }), makeDriver(), NOW);
    expect(projected).toBe(at(TUNING.legMinutes));
  });

  it("adds a service and a leg for every stop ahead", () => {
    const projected = projectArrival(makeDelivery({ stopsAhead: 4 }), makeDriver(), NOW);
    const expected =
      TUNING.legMinutes + 4 * (TUNING.serviceMinutes + TUNING.legMinutes);
    expect(projected).toBe(at(expected));
  });

  it("cannot project without a driver, or for an offline one", () => {
    expect(projectArrival(makeDelivery(), null, NOW)).toBeNull();
    expect(
      projectArrival(makeDelivery(), makeDriver({ status: "offline" }), NOW),
    ).toBeNull();
  });

  it("does not project a delivery that is already done", () => {
    const done = makeDelivery({ status: "delivered" });
    expect(projectArrival(done, makeDriver(), NOW)).toBeNull();
  });
});

describe("eta_breach", () => {
  it("stays quiet while the projection lands inside the window", () => {
    // 3 stops ahead => 40 min out, window closes in 60.
    const delivery = makeDelivery({ windowEnd: at(60), stopsAhead: 3 });
    expect(codes(delivery)).not.toContain("eta_breach");
  });

  it("stays quiet for a slip smaller than the noise floor", () => {
    // 0 stops ahead => 7 min out; window closes in 4 => 3 min slip, under the floor.
    const delivery = makeDelivery({ windowEnd: at(4), stopsAhead: 0 });
    expect(codes(delivery)).not.toContain("eta_breach");
  });

  it("fires once the slip clears the floor, and scales with the slip", () => {
    const small = score(makeDelivery({ windowEnd: at(-5), stopsAhead: 0 }));
    const large = score(makeDelivery({ windowEnd: at(-5), stopsAhead: 3 }));

    const smallPoints = small.signals.find((s) => s.code === "eta_breach")!.points;
    const largePoints = large.signals.find((s) => s.code === "eta_breach")!.points;

    expect(smallPoints).toBeGreaterThan(0);
    expect(largePoints).toBeGreaterThan(smallPoints);
  });

  it("never exceeds its ceiling, however catastrophic the slip", () => {
    const hopeless = score(makeDelivery({ windowEnd: at(-240), stopsAhead: 12 }));
    const points = hopeless.signals.find((s) => s.code === "eta_breach")!.points;
    expect(points).toBe(TUNING.etaBreach.maxPoints);
  });
});

describe("driver_stalled", () => {
  const stalled = (over: Partial<Driver>) =>
    makeDriver({ status: "stopped", minutesSinceMovement: 25, ...over });

  it("fires for a vehicle stopped off-geofence past the threshold", () => {
    expect(codes(makeDelivery(), stalled({}))).toContain("driver_stalled");
  });

  it("does not fire for a vehicle parked at a stop — that is the job", () => {
    expect(codes(makeDelivery(), stalled({ atStopGeofence: true }))).not.toContain(
      "driver_stalled",
    );
  });

  it("does not fire for a pause shorter than the threshold", () => {
    const brief = stalled({ minutesSinceMovement: TUNING.driverStalled.thresholdMinutes - 1 });
    expect(codes(makeDelivery(), brief)).not.toContain("driver_stalled");
  });

  it("ignores a stall for a stop that is still hours away", () => {
    const distant = makeDelivery({
      windowEnd: at(TUNING.driverStalled.horizonMinutes + 60),
    });
    expect(codes(distant, stalled({}))).not.toContain("driver_stalled");
  });

  it("names the driver and the duration, so the row explains itself", () => {
    const signal = score(makeDelivery(), stalled({ code: "V-09" })).signals.find(
      (s) => s.code === "driver_stalled",
    )!;
    expect(signal.detail).toContain("V-09");
    expect(signal.detail).toContain("25 min");
  });
});

describe("repeat_contact", () => {
  const contact = (minutesAgo: number, from: "consignee" | "shipper" = "consignee") => ({
    at: at(-minutesAgo),
    channel: "whatsapp" as const,
    from,
    note: "Where is my parcel?",
  });

  it("ignores a single chase", () => {
    expect(codes(makeDelivery({ contacts: [contact(10)] }))).not.toContain(
      "repeat_contact",
    );
  });

  it("fires on a second chase inside the window", () => {
    const delivery = makeDelivery({ contacts: [contact(40), contact(10)] });
    expect(codes(delivery)).toContain("repeat_contact");
  });

  it("weighs a third chase more heavily than a second", () => {
    const two = score(makeDelivery({ contacts: [contact(40), contact(10)] }));
    const three = score(makeDelivery({ contacts: [contact(40), contact(20), contact(5)] }));

    const twoPoints = two.signals.find((s) => s.code === "repeat_contact")!.points;
    const threePoints = three.signals.find((s) => s.code === "repeat_contact")!.points;
    expect(threePoints).toBeGreaterThan(twoPoints);
  });

  it("forgets contacts older than the window", () => {
    const stale = TUNING.repeatContact.windowMinutes + 30;
    const delivery = makeDelivery({ contacts: [contact(stale), contact(stale + 10)] });
    expect(codes(delivery)).not.toContain("repeat_contact");
  });

  it("counts the consignee chasing us, not the shipper", () => {
    const delivery = makeDelivery({
      contacts: [contact(20, "shipper"), contact(10, "shipper")],
    });
    expect(codes(delivery)).not.toContain("repeat_contact");
  });
});

describe("failed_attempt", () => {
  it("fires for an attempted or failed delivery", () => {
    expect(codes(makeDelivery({ status: "attempted", attempts: 1 }))).toContain(
      "failed_attempt",
    );
    expect(codes(makeDelivery({ status: "failed", attempts: 2 }))).toContain(
      "failed_attempt",
    );
  });

  it("does not fire while the parcel is still moving", () => {
    expect(codes(makeDelivery({ status: "en_route" }))).not.toContain("failed_attempt");
  });
});

describe("address_risk", () => {
  const withHistory = (over: Partial<Delivery["addressHistory"]>) =>
    makeDelivery({ addressHistory: { ...makeDelivery().addressHistory, ...over } });

  it("takes the most severe reason and emits exactly one signal", () => {
    const scored = score(
      withHistory({ priorFailedAttempts: 2, missingUnit: true, corrected: true }),
    );
    const matching = scored.signals.filter((s) => s.code === "address_risk");

    expect(matching).toHaveLength(1);
    expect(matching[0].points).toBe(TUNING.addressRisk.priorFailure);
  });

  it("falls back to a missing unit number, then to a hand correction", () => {
    expect(score(withHistory({ missingUnit: true })).signals[0].points).toBe(
      TUNING.addressRisk.missingUnit,
    );
    expect(score(withHistory({ corrected: true })).signals[0].points).toBe(
      TUNING.addressRisk.corrected,
    );
  });

  it("stays quiet for an address with a clean record", () => {
    expect(codes(makeDelivery())).not.toContain("address_risk");
  });
});

describe("access_risk", () => {
  it("fires when a code is needed and none is on file", () => {
    const delivery = makeDelivery({
      addressHistory: {
        ...makeDelivery().addressHistory,
        requiresAccessCode: true,
        accessNoteOnFile: false,
      },
    });
    expect(codes(delivery)).toContain("access_risk");
  });

  it("goes quiet as soon as the note exists", () => {
    const delivery = makeDelivery({
      addressHistory: {
        ...makeDelivery().addressHistory,
        requiresAccessCode: true,
        accessNoteOnFile: true,
      },
    });
    expect(codes(delivery)).not.toContain("access_risk");
  });
});

describe("sla_account", () => {
  it("fires only for contract accounts", () => {
    expect(codes(makeDelivery(), makeDriver(), makeShipper({ slaTier: "contract" })))
      .toContain("sla_account");
    expect(codes(makeDelivery(), makeDriver(), makeShipper({ slaTier: "standard" })))
      .not.toContain("sla_account");
  });

  it("mentions proof of delivery when the account requires it", () => {
    const shipper = makeShipper({ slaTier: "contract", podRequired: true });
    const signal = score(makeDelivery(), makeDriver(), shipper).signals.find(
      (s) => s.code === "sla_account",
    )!;
    expect(signal.detail).toContain("proof of delivery");
  });
});

describe("window_closing", () => {
  it("fires for an undispatched parcel with the window nearly shut", () => {
    const delivery = makeDelivery({ status: "pending", driverId: null, windowEnd: at(10) });
    expect(codes(delivery, null)).toContain("window_closing");
  });

  it("stays quiet once the parcel is en route — eta_breach says it better", () => {
    const delivery = makeDelivery({ status: "en_route", windowEnd: at(10) });
    expect(codes(delivery)).not.toContain("window_closing");
  });

  it("weighs more heavily the longer the window has been shut", () => {
    const warning = score(makeDelivery({ status: "assigned", windowEnd: at(10) }), null);
    const breach = score(makeDelivery({ status: "assigned", windowEnd: at(-45) }), null);

    const warningPoints = warning.signals.find((s) => s.code === "window_closing")!.points;
    const breachPoints = breach.signals.find((s) => s.code === "window_closing")!.points;

    expect(warningPoints).toBe(TUNING.windowClosing.points);
    expect(breachPoints).toBeGreaterThan(warningPoints);
    expect(breachPoints).toBeLessThanOrEqual(TUNING.windowClosing.maxPoints);
  });

  it("keeps firing after the window has closed, and says so", () => {
    const delivery = makeDelivery({ status: "assigned", windowEnd: at(-20) });
    const signal = score(delivery, null).signals.find((s) => s.code === "window_closing")!;
    expect(signal.detail).toContain("closed 20 min ago");
  });
});

describe("scoreDelivery", () => {
  it("zeroes out a delivered parcel, whatever its history", () => {
    const messy = makeDelivery({
      status: "delivered",
      windowEnd: at(-120),
      contacts: [
        { at: at(-10), channel: "call", from: "consignee", note: "late" },
        { at: at(-20), channel: "call", from: "consignee", note: "late" },
      ],
    });
    const scored = score(messy);

    expect(scored.score).toBe(0);
    expect(scored.signals).toEqual([]);
    expect(scored.tier).toBe("cleared");
  });

  it("sums its signals", () => {
    const scored = score(
      makeDelivery({ status: "attempted", attempts: 1 }),
      makeDriver({ status: "stopped", minutesSinceMovement: 30 }),
    );
    const sum = scored.signals.reduce((total, s) => total + s.points, 0);
    expect(scored.score).toBe(sum);
  });

  it("clamps at 100 when everything is on fire at once", () => {
    const worst = makeDelivery({
      status: "attempted",
      attempts: 2,
      stopsAhead: 9,
      windowEnd: at(-180),
      contacts: [
        { at: at(-5), channel: "call", from: "consignee", note: "furious" },
        { at: at(-20), channel: "call", from: "consignee", note: "furious" },
        { at: at(-40), channel: "whatsapp", from: "consignee", note: "furious" },
      ],
      addressHistory: {
        priorFailedAttempts: 3,
        corrected: true,
        missingUnit: true,
        requiresAccessCode: true,
        accessNoteOnFile: false,
      },
    });
    const scored = score(
      worst,
      makeDriver({ status: "stopped", minutesSinceMovement: 45 }),
      makeShipper({ slaTier: "contract", podRequired: true }),
    );

    expect(scored.score).toBe(100);
  });

  it("orders signals heaviest first", () => {
    const scored = score(
      makeDelivery({ status: "attempted", attempts: 1, windowEnd: at(-60), stopsAhead: 2 }),
      makeDriver(),
      makeShipper({ slaTier: "contract" }),
    );
    const points = scored.signals.map((s) => s.points);
    expect(points).toEqual([...points].sort((a, b) => b - a));
  });
});

describe("tierFor", () => {
  it("places scores on the right side of every threshold", () => {
    const { critical, high, watch } = TUNING.tiers;

    expect(tierFor(critical)).toBe("critical");
    expect(tierFor(critical - 1)).toBe("high");
    expect(tierFor(high)).toBe("high");
    expect(tierFor(high - 1)).toBe("watch");
    expect(tierFor(watch)).toBe("watch");
    expect(tierFor(watch - 1)).toBe("cleared");
    expect(tierFor(0)).toBe("cleared");
  });
});

describe("scoreBoard", () => {
  function snapshot(deliveries: Delivery[]): OperationSnapshot {
    return {
      now: NOW,
      deliveries,
      drivers: { drv_1: makeDriver() },
      shippers: { shp_1: makeShipper() },
      issues: [],
      routes: {},
      shift: {
        resolvedToday: 0,
        medianFirstReplyMin: 0,
        answeredFromOneScreen: 0,
        reopenedToday: 0,
      },
    };
  }

  it("ranks by score, worst first", () => {
    const calm = makeDelivery({ id: "calm", windowEnd: at(180) });
    const bad = makeDelivery({ id: "bad", status: "attempted", attempts: 1, windowEnd: at(-90) });

    const ranked = scoreBoard(snapshot([calm, bad]));
    expect(ranked.map((r) => r.delivery.id)).toEqual(["bad", "calm"]);
  });

  it("breaks a tie on the tighter window", () => {
    const later = makeDelivery({ id: "later", status: "attempted", attempts: 1, windowEnd: at(90) });
    const sooner = makeDelivery({ id: "sooner", status: "attempted", attempts: 1, windowEnd: at(30) });

    const ranked = scoreBoard(snapshot([later, sooner]));
    expect(ranked[0].score).toBe(ranked[1].score);
    expect(ranked[0].delivery.id).toBe("sooner");
  });
});
