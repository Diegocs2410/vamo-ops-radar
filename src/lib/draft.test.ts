import { describe, expect, it } from "vitest";

import { LIMITS, buildPrompt, parseDraftRequest, templateFor } from "./draft";

const body = {
  issueRef: "ISS-2040",
  kind: "route_missing",
  action: "resend_route",
  audience: "driver",
  language: "es",
  recipientName: "Lucía",
  inbound: "No me aparece la ruta de hoy en la app",
  routeCode: "R-412",
  routePay: "€42.00",
  pickupLabel: "09:15 · Hub Vallecas",
  stopCount: 14,
  consignmentNo: null,
  windowLabel: null,
  etaLabel: null,
  podLabel: null,
  driverCode: "V-07",
};

describe("parseDraftRequest", () => {
  it("accepts a well-formed request", () => {
    const parsed = parseDraftRequest(body)!;
    expect(parsed.issueRef).toBe("ISS-2040");
    expect(parsed.routeCode).toBe("R-412");
    expect(parsed.stopCount).toBe(14);
  });

  it("rejects anything that is not an object", () => {
    for (const junk of [null, undefined, "nope", 42, []]) {
      expect(parseDraftRequest(junk)).toBeNull();
    }
  });

  it("rejects a request with no issue or no action", () => {
    expect(parseDraftRequest({ ...body, issueRef: "" })).toBeNull();
    expect(parseDraftRequest({ ...body, action: "" })).toBeNull();
  });

  it("rejects an audience or a language it does not recognise", () => {
    expect(parseDraftRequest({ ...body, audience: "everyone" })).toBeNull();
    expect(parseDraftRequest({ ...body, language: "fr" })).toBeNull();
    expect(parseDraftRequest({ ...body, language: 7 })).toBeNull();
  });

  it("clamps oversized text rather than passing it through to the prompt", () => {
    const parsed = parseDraftRequest({ ...body, recipientName: "A".repeat(5_000) })!;
    expect(parsed.recipientName.length).toBe(LIMITS.text);
  });

  it("clamps the quoted inbound message", () => {
    const parsed = parseDraftRequest({ ...body, inbound: "x".repeat(10_000) })!;
    expect(parsed.inbound!.length).toBe(LIMITS.inbound);
  });

  it("turns blank optionals into nulls rather than empty strings", () => {
    const parsed = parseDraftRequest({ ...body, routeCode: "", pickupLabel: "   " })!;
    expect(parsed.routeCode).toBeNull();
    expect(parsed.pickupLabel).toBeNull();
  });

  it("survives a missing or unusable stop count", () => {
    // Deliberately not Number(...): that turns null into 0, and "no route" is not "zero stops".
    expect(parseDraftRequest({ ...body, stopCount: null })!.stopCount).toBeNull();
    expect(parseDraftRequest({ ...body, stopCount: "many" })!.stopCount).toBeNull();
  });

  it("falls back to a usable greeting in the right language", () => {
    expect(parseDraftRequest({ ...body, recipientName: "" })!.recipientName).toBe("hola");
    expect(
      parseDraftRequest({ ...body, recipientName: "", language: "en" })!.recipientName,
    ).toBe("there");
  });
});

describe("templateFor", () => {
  const actions = [
    "resend_route",
    "answer_pay",
    "escalate_payroll",
    "offer_route",
    "send_eta",
    "confirm_address",
    "request_access",
    "send_pod",
    "triage_list",
  ] as const;

  it("writes a usable message for every action that drafts one", () => {
    for (const action of actions) {
      const message = templateFor({ ...parseDraftRequest(body)!, action });
      expect(message.length).toBeGreaterThan(40);
      // The stock wording is what goes out when the model is away, so it must never leak
      // a placeholder or a dangling separator.
      expect(message).not.toMatch(/undefined|null|\{\{|\s,|\s\./);
    }
  });

  it("writes to drivers in Spanish and to businesses in English", () => {
    const toDriver = templateFor(parseDraftRequest(body)!);
    expect(toDriver).toContain("R-412");
    expect(toDriver.toLowerCase()).toContain("ruta");

    const toBusiness = templateFor({
      ...parseDraftRequest(body)!,
      action: "send_pod",
      consignmentNo: "VM-480203",
      podLabel: "IMG-7101, scanned 11:42",
    });
    expect(toBusiness).toContain("Proof of delivery");
    expect(toBusiness).toContain("VM-480203");
  });

  it("quotes the pay figure it was given and invents nothing when it has none", () => {
    const withPay = templateFor({ ...parseDraftRequest(body)!, action: "answer_pay" });
    expect(withPay).toContain("€42.00");
    expect(withPay).toContain("14 paradas");

    const without = templateFor({
      ...parseDraftRequest(body)!,
      action: "answer_pay",
      routePay: null,
      stopCount: null,
    });
    expect(without).not.toMatch(/€|\d+ paradas/);
  });

  it("says plainly that nothing needs sending when the move is a phone call", () => {
    const message = templateFor({ ...parseDraftRequest(body)!, action: "call_driver" });
    expect(message).toContain("phone call");
  });
});

describe("buildPrompt", () => {
  const prompt = buildPrompt(parseDraftRequest(body)!);

  it("names the language and the audience, so a driver text is not written like a customer one", () => {
    expect(prompt).toContain("Write a reply to the driver, in Spanish.");
  });

  it("quotes what they actually wrote", () => {
    expect(prompt).toContain("No me aparece la ruta de hoy");
  });

  it("hands the model the facts it must not contradict", () => {
    expect(prompt).toContain("R-412");
    expect(prompt).toContain("€42.00");
    expect(prompt).toContain("09:15 · Hub Vallecas");
  });

  it("leaves out facts it does not have, rather than offering empty ones", () => {
    expect(prompt).not.toContain("Consignment:");
    expect(prompt).not.toContain("Live ETA:");
  });

  it("gives the model the stock wording as a floor to beat", () => {
    expect(prompt).toContain(templateFor(parseDraftRequest(body)!));
  });
});
