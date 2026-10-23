import { describe, expect, it } from "vitest";

import { classifyMessage, extractReferences } from "./classify";

describe("classifyMessage", () => {
  describe("drivers", () => {
    it("reads the ones that stop a route dead", () => {
      expect(
        classifyMessage("Buenas, no me aparece la ruta de hoy en la app", "driver").kind,
      ).toBe("route_missing");
      expect(
        classifyMessage("En el almacén me faltan 3 bolsas, me dieron solo 11", "driver").kind,
      ).toBe("pickup_problem");
    });

    it("separates a pay question from a pay dispute, because they are different jobs", () => {
      expect(classifyMessage("¿Cuánto paga la R-417?", "driver").kind).toBe("pay_question");
      expect(
        classifyMessage("La R-408 me pagaron 22€ y eran 31€, me pagaron de menos", "driver").kind,
      ).toBe("pay_dispute");
    });

    it("reads English just as well, for a bilingual fleet", () => {
      expect(classifyMessage("I can't see my route today", "driver").kind).toBe("route_missing");
      expect(classifyMessage("How much does this route pay?", "driver").kind).toBe("pay_question");
    });
  });

  describe("consignees", () => {
    it("tells apart the three things a customer actually writes about", () => {
      expect(classifyMessage("¿Dónde está mi pedido? Sigue sin llegar", "customer").kind).toBe(
        "where_is_order",
      );
      expect(
        classifyMessage("La dirección está mal, es el 4º izquierda", "customer").kind,
      ).toBe("wrong_address");
      expect(
        classifyMessage("El repartidor necesita el código del portal", "customer").kind,
      ).toBe("access_problem");
    });

    it("puts an entry-code problem ahead of a generic address complaint", () => {
      // Both rules could match "portal"; the access one is the actionable read.
      const result = classifyMessage("No puede entrar, el código del portal no va", "customer");
      expect(result.kind).toBe("access_problem");
    });
  });

  describe("businesses", () => {
    it("recognises a proof-of-delivery request and a bulk issue list", () => {
      expect(
        classifyMessage("Necesitamos la prueba de entrega del pedido", "business").kind,
      ).toBe("pod_request");
      expect(
        classifyMessage("Adjunto el listado de incidencias de ayer", "business").kind,
      ).toBe("issue_list");
    });
  });

  it("will not read a driver's text as a customer's, or the reverse", () => {
    // Same words, different sender: a driver asking where their route is is not a
    // consignee asking where their parcel is.
    expect(classifyMessage("¿Cuánto paga?", "customer").kind).toBe("unknown");
    expect(classifyMessage("Adjunto el listado", "driver").kind).toBe("unknown");
  });

  it("returns an honest blank rather than guessing", () => {
    const result = classifyMessage("Oye una cosa, lo de ayer al final cómo quedó?", "driver");
    expect(result.kind).toBe("unknown");
    expect(result.confidence).toBe("low");
    expect(result.matched).toBeNull();
  });

  it("reports the phrase that decided it, so the operator can check the reasoning", () => {
    const result = classifyMessage("No me aparece la ruta", "driver");
    expect(result.confidence).toBe("high");
    expect(result.matched).toBeTruthy();
  });

  it("keeps the references even when it cannot classify", () => {
    const result = classifyMessage("Oye, lo de la R-412 cómo quedó?", "driver");
    expect(result.kind).toBe("unknown");
    expect(result.routeCode).toBe("R-412");
  });
});

describe("extractReferences", () => {
  it("finds a route code and a consignment number anywhere in the text", () => {
    expect(extractReferences("llevo 20 min esperando, R-412")).toEqual({
      routeCode: "R-412",
      consignmentNo: null,
    });
    expect(extractReferences("¿dónde está VM-480200?")).toEqual({
      routeCode: null,
      consignmentNo: "VM-480200",
    });
  });

  it("normalises the case the sender happened to type", () => {
    expect(extractReferences("la r-412 y el vm-480200")).toEqual({
      routeCode: "R-412",
      consignmentNo: "VM-480200",
    });
  });

  it("does not invent references that are not there", () => {
    expect(extractReferences("ya he terminado, gracias")).toEqual({
      routeCode: null,
      consignmentNo: null,
    });
    // A bare number is not a reference.
    expect(extractReferences("son 412 euros").routeCode).toBeNull();
  });
});
