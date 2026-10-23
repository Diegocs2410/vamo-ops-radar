import { describe, expect, it } from "vitest";

import { sourcesFor, systemCount } from "./context";
import { buildSnapshot } from "./seed";
import { assemblyLoad, countTiers, openIssues } from "./stats";
import { triageBoard } from "./triage";

const NOW = "2026-10-22T10:00:00.000Z";

describe("the demo board", () => {
  it("is identical on every build, so a screenshot and a bug report agree", () => {
    expect(JSON.stringify(buildSnapshot(NOW))).toBe(JSON.stringify(buildSnapshot(NOW)));
  });

  it("references only routes, drivers and shippers it actually defines", () => {
    const snapshot = buildSnapshot(NOW);

    for (const delivery of snapshot.deliveries) {
      expect(snapshot.shippers[delivery.shipperId]).toBeDefined();
      if (delivery.routeId) expect(snapshot.routes[delivery.routeId]).toBeDefined();
      if (delivery.driverId) expect(snapshot.drivers[delivery.driverId]).toBeDefined();
    }
    for (const issue of snapshot.issues) {
      if (issue.routeId) expect(snapshot.routes[issue.routeId]).toBeDefined();
      if (issue.deliveryId) {
        expect(snapshot.deliveries.some((d) => d.id === issue.deliveryId)).toBe(true);
      }
    }
  });

  it("holds a legible spread of urgency, not all noise and not all fire", () => {
    const counts = countTiers(triageBoard(buildSnapshot(NOW)));

    expect(counts.critical).toBeGreaterThanOrEqual(2);
    expect(counts.high).toBeGreaterThanOrEqual(2);
    expect(counts.watch).toBeGreaterThanOrEqual(1);
  });

  it("stays short enough for one person to actually work", () => {
    expect(triageBoard(buildSnapshot(NOW)).length).toBeLessThanOrEqual(20);
  });

  it("gives every issue still waiting on a person a reason to be where it is", () => {
    // An already-answered issue with nothing attached legitimately scores zero and sinks.
    // Anything still waiting has to justify its position, or the ranking is noise.
    for (const row of openIssues(triageBoard(buildSnapshot(NOW)))) {
      expect(row.signals.length).toBeGreaterThan(0);
      expect(row.priority).toBeGreaterThan(0);
    }
  });

  it("is mostly things people raised, not things a board flagged", () => {
    // The whole premise of the pivot: their ops board already detects. What lands on a
    // human is a text, a call or an email.
    const issues = buildSnapshot(NOW).issues;
    const inbound = issues.filter((issue) => issue.source !== "detected");
    expect(inbound.length).toBeGreaterThan(issues.length / 2);
  });

  it("covers the driver side, which is where most of the manual load actually is", () => {
    const kinds = new Set(buildSnapshot(NOW).issues.map((issue) => issue.kind));

    for (const kind of ["route_missing", "pay_dispute", "pickup_problem", "route_unclaimed"]) {
      expect(kinds.has(kind as never)).toBe(true);
    }
  });

  it("lets the classifier do the classifying, including when it cannot", () => {
    // One seeded message is written so the rules cannot read it. If this stops being
    // `unknown`, either the rules got better or the fixture got easier — both worth knowing.
    const kinds = buildSnapshot(NOW).issues.map((issue) => issue.kind);
    expect(kinds).toContain("unknown");
  });

  it("resolves references out of the message text where the sender gave them", () => {
    const snapshot = buildSnapshot(NOW);
    const withRouteInText = snapshot.issues.find((issue) =>
      issue.messages.some((message) => message.body.includes("R-412")),
    );

    expect(withRouteInText).toBeDefined();
    expect(withRouteInText!.routeId).not.toBeNull();
    expect(snapshot.routes[withRouteInText!.routeId!].code).toBe("R-412");
  });

  it("assembles context worth assembling — several lookups across several systems", () => {
    const board = triageBoard(buildSnapshot(NOW));
    const load = assemblyLoad(board);

    expect(load.lookups).toBeGreaterThan(board.length);
    expect(load.systems).toBeGreaterThanOrEqual(2);

    // The busiest issue should span more than one system, or the sheet is not earning much.
    const busiest = board
      .map((row) => systemCount(sourcesFor(row)))
      .sort((a, b) => b - a)[0];
    expect(busiest).toBeGreaterThanOrEqual(2);
  });

  it("derives masthead numbers that are internally consistent", () => {
    const snapshot = buildSnapshot(NOW);
    const open = openIssues(triageBoard(snapshot));

    expect(open.length).toBeLessThanOrEqual(snapshot.issues.length);
    expect(snapshot.shift.medianFirstReplyMin).toBeGreaterThan(0);
    expect(snapshot.shift.answeredFromOneScreen).toBeLessThanOrEqual(snapshot.shift.resolvedToday);
  });

  it("moves with the clock rather than sitting at a fixed date", () => {
    const later = buildSnapshot("2026-10-22T16:00:00.000Z");
    const earlier = buildSnapshot(NOW);

    expect(Date.parse(later.issues[0].openedAt)).toBeGreaterThan(
      Date.parse(earlier.issues[0].openedAt),
    );
  });
});
