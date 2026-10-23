/**
 * Classifying what just arrived.
 *
 * An inbound text says "no me aparece la ruta" or "¿cuánto paga la R-412?". Before anything
 * useful can happen, two questions have to be answered: what kind of problem is this, and
 * what is it about.
 *
 * This module answers both deterministically, from patterns. An LLM does it better on the
 * messy cases and that is exactly what `/api/classify` is for — but the rules stay as the
 * floor, because an ops queue that silently stops sorting when a model is rate-limited is
 * worse than one that sorts a little worse.
 *
 * Messages arrive in Spanish, because the drivers and consignees are in Madrid. The ops
 * surface is English. Patterns cover both so the rules survive a bilingual fleet.
 */

import type { IssueKind } from "./domain";

export type Confidence = "high" | "low";

export interface Classification {
  kind: IssueKind;
  confidence: Confidence;
  /** The phrase that decided it, shown in the UI so the operator can see the reasoning. */
  matched: string | null;
  routeCode: string | null;
  consignmentNo: string | null;
}

export type Sender = "driver" | "customer" | "business";

interface Rule {
  kind: IssueKind;
  from: Sender[];
  patterns: RegExp[];
}

/**
 * Ordered by specificity: the first match wins, so a pay dispute has to be tested before a
 * pay question, and an entry-code problem before a generic address complaint.
 */
const RULES: Rule[] = [
  {
    kind: "pay_dispute",
    from: ["driver"],
    patterns: [
      /me pagaron de menos|pagaron mal|falta(n)? .{0,12}(pago|euros|€)|no me han pagado|cobr[ée] menos|est[áa] mal el pago|pago incorrecto/i,
      /underpaid|paid (me )?wrong|missing pay|short.?paid/i,
    ],
  },
  {
    kind: "pay_question",
    from: ["driver"],
    patterns: [
      /cu[áa]nto (paga|me pagan|es)|qu[ée] paga|tarifa|cu[áa]nto sale/i,
      /how much (does .{0,20})?pay|what(?:'s| is) the pay|rate for/i,
    ],
  },
  {
    kind: "route_missing",
    from: ["driver"],
    patterns: [
      /no me (aparece|sale|carga)|no (puedo )?ve[or]|d[óo]nde est[áa] mi ruta|sin ruta|no tengo ruta|no figura/i,
      /can.?t see (my )?route|where.?s my route|no route (showing|assigned)|route (is )?missing/i,
    ],
  },
  {
    kind: "pickup_problem",
    from: ["driver"],
    patterns: [
      /bolsa|falta(n)? .{0,15}(paquete|pedido|bulto)|no est[áa]n? list|almac[ée]n|recogida|orden de (las )?paradas|me dieron|sobra/i,
      /bags?|missing (parcel|order)|not ready|warehouse|pickup|stop order|wrong order/i,
    ],
  },
  {
    kind: "access_problem",
    from: ["customer", "driver"],
    patterns: [
      /c[óo]digo|portero|timbre|no puede entrar|no pudo entrar|no contesta.{0,12}portal|verja|puerta cerrada/i,
      /entry code|buzzer|can.?t get in|gate code|door code|intercom/i,
    ],
  },
  {
    kind: "wrong_address",
    from: ["customer"],
    patterns: [
      /direcci[óo]n (est[áa] )?(mal|incorrecta|equivocada)|no es mi direcci[óo]n|me he mudado|cambiar la direcci[óo]n|el piso es/i,
      /wrong address|address is (wrong|incorrect)|moved house|change the address/i,
    ],
  },
  {
    kind: "where_is_order",
    from: ["customer"],
    patterns: [
      /d[óo]nde est[áa] mi (pedido|paquete|env[íi]o)|no (me )?(ha )?lleg|cu[áa]ndo llega|sigue sin llegar|para cu[áa]ndo/i,
      /where.?s my (order|parcel|package)|hasn.?t arrived|when will it|still waiting/i,
    ],
  },
  {
    kind: "pod_request",
    from: ["business"],
    patterns: [
      /prueba de entrega|justificante|foto de (la )?entrega|albar[áa]n firmado|confirmaci[óo]n de entrega|\bpod\b/i,
      /proof of delivery|delivery photo|signed (receipt|docket)|\bpod\b/i,
    ],
  },
  {
    kind: "issue_list",
    from: ["business"],
    patterns: [
      /incidencias|listado|varios (pedidos|env[íi]os)|adjunto|resumen del d[íi]a|los siguientes/i,
      /list of (issues|problems)|several orders|attached|following orders/i,
    ],
  },
];

const ROUTE_CODE = /\bR-\d{3}\b/i;
const CONSIGNMENT_NO = /\bVM-\d{6}\b/i;

/** Pull the references a human would scan for first. */
export function extractReferences(body: string): {
  routeCode: string | null;
  consignmentNo: string | null;
} {
  return {
    routeCode: body.match(ROUTE_CODE)?.[0].toUpperCase() ?? null,
    consignmentNo: body.match(CONSIGNMENT_NO)?.[0].toUpperCase() ?? null,
  };
}

export function classifyMessage(body: string, from: Sender): Classification {
  const references = extractReferences(body);

  for (const rule of RULES) {
    if (!rule.from.includes(from)) continue;

    for (const pattern of rule.patterns) {
      const match = body.match(pattern);
      if (match) {
        return {
          kind: rule.kind,
          confidence: "high",
          matched: match[0],
          ...references,
        };
      }
    }
  }

  /*
   * Nothing matched. Rather than guess, say so: an `unknown` issue still reaches the queue
   * and still carries its references, and the operator reads four words to sort it out.
   * A confidently wrong label costs more than an honest blank.
   */
  return { kind: "unknown", confidence: "low", matched: null, ...references };
}

/** Human-readable name for a kind, used in the UI and in prompts. */
export const KIND_LABELS: Record<IssueKind, string> = {
  route_missing: "Route not showing",
  pay_question: "Pay question",
  pay_dispute: "Pay dispute",
  route_unclaimed: "Route unclaimed",
  pickup_problem: "Pickup problem",
  driver_silent: "Driver gone quiet",
  where_is_order: "Where is my order",
  wrong_address: "Wrong address",
  access_problem: "Cannot get in",
  pod_request: "Proof of delivery",
  issue_list: "Issue list",
  stalled_driver: "Driver stalled",
  late_pickup: "Pickup late",
  driver_cancelled: "Driver cancelled",
  delivered_far_from_address: "Marked far from address",
  unknown: "Unclassified",
};

/** Who the issue is about, for routing and for the right reply language. */
export const KIND_AUDIENCE: Record<IssueKind, "driver" | "customer" | "business" | "ops"> = {
  route_missing: "driver",
  pay_question: "driver",
  pay_dispute: "driver",
  route_unclaimed: "ops",
  pickup_problem: "driver",
  driver_silent: "driver",
  where_is_order: "customer",
  wrong_address: "customer",
  access_problem: "customer",
  pod_request: "business",
  issue_list: "business",
  stalled_driver: "driver",
  late_pickup: "driver",
  driver_cancelled: "ops",
  delivered_far_from_address: "customer",
  unknown: "ops",
};
