import { describe, expect, it } from "vitest";

import { LIMITS, buildPrompt, parseDraftRequest, templateFor } from "./draft";

const body = {
  consignmentNo: "VM-480201",
  consignee: "Marta Ibáñez",
  shipper: "Nórdica Muebles",
  action: "notify_consignee",
  audience: "consignee",
  windowLabel: "11:00–13:00",
  projectedLabel: "13:45",
  slipMinutes: 45,
  signals: [{ label: "ETA breach", detail: "Projected 45 min past the window close" }],
};

describe("parseDraftRequest", () => {
  it("accepts a well-formed request", () => {
    const parsed = parseDraftRequest(body)!;
    expect(parsed.consignmentNo).toBe("VM-480201");
    expect(parsed.slipMinutes).toBe(45);
    expect(parsed.signals).toHaveLength(1);
  });

  it("rejects anything that is not an object", () => {
    for (const junk of [null, undefined, "nope", 42, []]) {
      expect(parseDraftRequest(junk)).toBeNull();
    }
  });

  it("rejects a request with no consignment or no action", () => {
    expect(parseDraftRequest({ ...body, consignmentNo: "" })).toBeNull();
    expect(parseDraftRequest({ ...body, action: "" })).toBeNull();
  });

  it("rejects an audience it does not recognise", () => {
    expect(parseDraftRequest({ ...body, audience: "everyone" })).toBeNull();
    expect(parseDraftRequest({ ...body, audience: 7 })).toBeNull();
  });

  it("clamps oversized text rather than passing it through to the prompt", () => {
    const parsed = parseDraftRequest({ ...body, consignee: "A".repeat(5_000) })!;
    expect(parsed.consignee.length).toBe(LIMITS.text);
  });

  it("caps how many signals a caller can stuff in", () => {
    const parsed = parseDraftRequest({
      ...body,
      signals: Array.from({ length: 200 }, (_, i) => ({ label: `S${i}`, detail: "x" })),
    })!;
    expect(parsed.signals.length).toBe(LIMITS.signals);
  });

  it("drops malformed signal entries instead of failing the whole request", () => {
    const parsed = parseDraftRequest({
      ...body,
      signals: [null, "nope", { detail: "no label" }, { label: "Real", detail: "yes" }],
    })!;
    expect(parsed.signals).toEqual([{ label: "Real", detail: "yes" }]);
  });

  it("survives a missing or unusable slip", () => {
    expect(parseDraftRequest({ ...body, slipMinutes: null })!.slipMinutes).toBeNull();
    expect(parseDraftRequest({ ...body, slipMinutes: "soon" })!.slipMinutes).toBeNull();
  });

  it("falls back to usable wording when optional fields are blank", () => {
    const parsed = parseDraftRequest({
      ...body,
      consignee: "",
      shipper: "",
      windowLabel: "",
      projectedLabel: "",
    })!;
    expect(parsed.consignee).toBe("there");
    expect(parsed.shipper).toBe("the shipper");
    expect(parsed.windowLabel).toBe("the agreed window");
    expect(parsed.projectedLabel).toBeNull();
  });
});

describe("templateFor", () => {
  it("writes a usable message for every play that drafts one", () => {
    const actions = [
      "notify_consignee",
      "reply_consignee",
      "reschedule",
      "confirm_address",
      "request_access",
      "flag_account",
    ] as const;

    for (const action of actions) {
      const message = templateFor({ ...parseDraftRequest(body)!, action });
      expect(message.length).toBeGreaterThan(40);
      expect(message).toContain("VM-480201");
      // The stock wording is what goes out when the model is unavailable, so it must
      // never leak a placeholder.
      expect(message).not.toMatch(/undefined|null|\{\{/);
    }
  });

  it("names the delay only when there is one", () => {
    const base = parseDraftRequest(body)!;
    expect(templateFor(base)).toContain("45 minutes");
    expect(templateFor({ ...base, slipMinutes: null })).not.toContain("minutes behind");
  });

  it("addresses the shipper, not the customer, when flagging an account", () => {
    const message = templateFor({ ...parseDraftRequest(body)!, action: "flag_account" });
    expect(message.startsWith("Nórdica Muebles")).toBe(true);
  });

  it("says plainly that nothing needs sending for a play with no message", () => {
    const message = templateFor({ ...parseDraftRequest(body)!, action: "monitor" });
    expect(message).toContain("no outbound message");
  });
});

describe("buildPrompt", () => {
  const prompt = buildPrompt(parseDraftRequest(body)!);

  it("hands the model the facts it must not invent", () => {
    expect(prompt).toContain("VM-480201");
    expect(prompt).toContain("Marta Ibáñez");
    expect(prompt).toContain("11:00–13:00");
    expect(prompt).toContain("13:45");
    expect(prompt).toContain("45");
  });

  it("passes the detected signals through so the message can be specific", () => {
    expect(prompt).toContain("ETA breach");
    expect(prompt).toContain("Projected 45 min past the window close");
  });

  it("gives the model the stock wording as a floor to beat", () => {
    expect(prompt).toContain(templateFor(parseDraftRequest(body)!));
  });

  it("names the audience, so a shipper note does not read like a customer text", () => {
    const toShipper = buildPrompt({
      ...parseDraftRequest(body)!,
      audience: "shipper",
      action: "flag_account",
    });
    expect(toShipper).toContain("Write a message to the shipper.");
  });
});
