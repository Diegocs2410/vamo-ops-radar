import { describe, expect, it } from "vitest";

import { buildSnapshot } from "./seed";
import { scoreBoard } from "./risk";
import { atRisk, countTiers, precision } from "./stats";

const NOW = "2026-10-22T10:00:00.000Z";

describe("the demo board", () => {
  it("is identical on every build, so a screenshot and a bug report agree", () => {
    const a = buildSnapshot(NOW);
    const b = buildSnapshot(NOW);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("references only drivers and shippers it actually defines", () => {
    const snapshot = buildSnapshot(NOW);

    for (const delivery of snapshot.deliveries) {
      expect(snapshot.shippers[delivery.shipperId]).toBeDefined();
      if (delivery.driverId) {
        expect(snapshot.drivers[delivery.driverId]).toBeDefined();
      }
    }
  });

  it("holds a legible spread of severities, not all noise and not all fire", () => {
    const counts = countTiers(scoreBoard(buildSnapshot(NOW)));

    expect(counts.critical).toBeGreaterThanOrEqual(2);
    expect(counts.high).toBeGreaterThanOrEqual(2);
    expect(counts.watch).toBeGreaterThanOrEqual(2);
    // Most of the day is fine. A board where everything is an incident teaches nothing.
    expect(counts.cleared).toBeGreaterThan(counts.critical + counts.high + counts.watch);
  });

  it("keeps the queue short enough for one person to actually work", () => {
    const queue = atRisk(scoreBoard(buildSnapshot(NOW)));
    expect(queue.length).toBeLessThanOrEqual(20);
  });

  it("gives every queued row a reason, because an unexplained row is ignored", () => {
    for (const row of atRisk(scoreBoard(buildSnapshot(NOW)))) {
      expect(row.signals.length).toBeGreaterThan(0);
      expect(row.score).toBeGreaterThan(0);
    }
  });

  it("derives masthead numbers that are internally consistent", () => {
    const { shift } = buildSnapshot(NOW);
    const queue = atRisk(scoreBoard(buildSnapshot(NOW)));

    expect(shift.incidentsToday).toBe(queue.length + shift.resolvedToday);
    expect(shift.detectedProactively).toBeLessThanOrEqual(queue.length);
    expect(shift.medianLeadTimeMin).toBeGreaterThan(0);
    expect(precision(shift)).toBeGreaterThan(0.5);
  });

  it("moves with the clock rather than sitting at a fixed date", () => {
    const later = buildSnapshot("2026-10-22T16:00:00.000Z");
    const earlier = buildSnapshot(NOW);

    expect(Date.parse(later.deliveries[0].windowEnd)).toBeGreaterThan(
      Date.parse(earlier.deliveries[0].windowEnd),
    );
  });
});
