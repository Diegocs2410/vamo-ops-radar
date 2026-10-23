import { describe, expect, it } from "vitest";

import { type CommandContext, matchesSearch, parseCommand } from "./commands";

const context: CommandContext = {
  rows: [
    { id: "a", ref: "ISS-2040", tier: "critical" },
    { id: "b", ref: "ISS-2041", tier: "critical" },
    { id: "c", ref: "ISS-2050", tier: "watch" },
  ],
  selectedId: "a",
};

const unselected: CommandContext = { ...context, selectedId: null };

describe("parseCommand", () => {
  it("says nothing at all about an empty line", () => {
    expect(parseCommand("", context)).toBeNull();
    expect(parseCommand("   ", context)).toBeNull();
  });

  it("rejects a verb it does not know, and points at help", () => {
    const plan = parseCommand("yeet", context)!;
    expect(plan.ok).toBe(false);
    expect(plan.summary).toContain("help");
  });

  it("defaults a command to the selected block", () => {
    const plan = parseCommand("take", context)!;
    expect(plan.ok).toBe(true);
    expect(plan.affected).toEqual(["a"]);
    expect(plan.summary).toContain("ISS-2040");
  });

  it("refuses to act when nothing is selected, rather than guessing", () => {
    const plan = parseCommand("take", unselected)!;
    expect(plan.ok).toBe(false);
    expect(plan.affected).toEqual([]);
  });

  it("targets an issue by ref, with or without the prefix", () => {
    expect(parseCommand("take ISS-2050", context)!.affected).toEqual(["c"]);
    expect(parseCommand("take 2050", context)!.affected).toEqual(["c"]);
  });

  it("will not act on an ambiguous number", () => {
    const plan = parseCommand("take 20", context)!;
    expect(plan.ok).toBe(false);
    expect(plan.summary).toContain("matches 3 issues");
  });

  it("targets a whole tier, so one command can clear a batch", () => {
    const plan = parseCommand("resolve answered critical", context)!;
    expect(plan.ok).toBe(true);
    expect(plan.affected).toEqual(["a", "b"]);
    expect(plan.summary).toContain("2 critical issues");
  });

  it("says so when a targeted tier is empty, instead of succeeding silently", () => {
    const plan = parseCommand("resolve answered high", context)!;
    expect(plan.ok).toBe(false);
    expect(plan.summary).toContain("No high issues");
  });

  describe("resolve", () => {
    it("needs a reason — an unexplained close teaches the model nothing", () => {
      const plan = parseCommand("resolve", context)!;
      expect(plan.ok).toBe(false);
      expect(plan.summary).toContain("answered");
    });

    it("accepts the shorthand an operator would actually type", () => {
      for (const alias of ["answered", "replied", "done", "escalate", "more"]) {
        expect(parseCommand(`resolve ${alias}`, context)!.ok).toBe(true);
      }
    });

    it("stamps 'needed another system' differently, because it means something different", () => {
      expect(parseCommand("resolve more", context)!.ghost).toBe("Needed more");
      expect(parseCommand("resolve answered", context)!.ghost).toBe("Resolved");
    });
  });

  describe("snooze", () => {
    it("has a sane default", () => {
      const plan = parseCommand("snooze", context)!;
      expect(plan.effect).toEqual({ kind: "snooze", ids: ["a"], minutes: 15 });
    });

    it("takes minutes, and a target after the minutes", () => {
      expect(parseCommand("snooze 30", context)!.effect).toEqual({
        kind: "snooze",
        ids: ["a"],
        minutes: 30,
      });
      expect(parseCommand("snooze 30 watch", context)!.effect).toEqual({
        kind: "snooze",
        ids: ["c"],
        minutes: 30,
      });
    });

    it("reads a bare tier as a target, not as minutes", () => {
      expect(parseCommand("snooze watch", context)!.effect).toEqual({
        kind: "snooze",
        ids: ["c"],
        minutes: 15,
      });
    });

    it("refuses a duration nobody meant", () => {
      expect(parseCommand("snooze 0", context)!.ok).toBe(false);
      expect(parseCommand("snooze 9000", context)!.ok).toBe(false);
    });
  });

  describe("draft", () => {
    it("drafts for one block only", () => {
      expect(parseCommand("draft", context)!.effect).toEqual({ kind: "draft", id: "a" });
      expect(parseCommand("draft critical", context)!.ok).toBe(false);
    });
  });

  describe("show and find", () => {
    it("filters by tier", () => {
      expect(parseCommand("show critical", context)!.effect).toEqual({
        kind: "filter",
        tier: "critical",
      });
      expect(parseCommand("show all", context)!.effect).toEqual({
        kind: "filter",
        tier: "all",
      });
    });

    it("needs to know which tier", () => {
      expect(parseCommand("show", context)!.ok).toBe(false);
      expect(parseCommand("show everything", context)!.ok).toBe(false);
    });

    it("searches with a verb or with the slash shorthand", () => {
      expect(parseCommand("find serrano", context)!.effect).toEqual({
        kind: "find",
        text: "serrano",
      });
      expect(parseCommand("/serrano", context)!.effect).toEqual({
        kind: "find",
        text: "serrano",
      });
    });

    it("keeps multi-word searches whole", () => {
      expect(parseCommand("find calle de goya", context)!.effect).toEqual({
        kind: "find",
        text: "calle de goya",
      });
    });

    it("will not search for nothing", () => {
      expect(parseCommand("/", context)!.ok).toBe(false);
      expect(parseCommand("find", context)!.ok).toBe(false);
    });
  });

  it("never marks a failed plan as affecting anything", () => {
    const failures = ["resolve", "show", "find", "snooze 0", "take 20", "nonsense"];
    for (const input of failures) {
      const plan = parseCommand(input, context)!;
      expect(plan.ok).toBe(false);
      expect(plan.affected).toEqual([]);
      expect(plan.effect).toBeNull();
    }
  });
});

describe("matchesSearch", () => {
  const fields = {
    ref: "ISS-2040",
    consignment: "VM-480200",
    consignee: "Marta Ibáñez",
    address: "Calle de Alcalá 112, Salamanca",
    driver: "V-07 Lucía Ferrer",
    shipper: "Nórdica Muebles",
  };

  it("matches any field, ignoring case", () => {
    expect(matchesSearch("alcalá", fields)).toBe(true);
    expect(matchesSearch("MARTA", fields)).toBe(true);
    expect(matchesSearch("v-07", fields)).toBe(true);
    expect(matchesSearch("nórdica", fields)).toBe(true);
    expect(matchesSearch("480200", fields)).toBe(true);
  });

  it("does not match what is not there", () => {
    expect(matchesSearch("barcelona", fields)).toBe(false);
  });

  it("treats an empty search as no filter at all", () => {
    expect(matchesSearch("", fields)).toBe(true);
    expect(matchesSearch("  ", fields)).toBe(true);
  });
});
