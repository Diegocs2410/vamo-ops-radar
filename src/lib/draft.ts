/**
 * Drafting the reply.
 *
 * Deciding what an issue is, how urgent it is, and what the move should be is the job of
 * `classify.ts`, `triage.ts` and `resolution.ts` — deterministic, testable, explainable.
 * Writing the sentence that goes back to a driver who has been waiting 23 minutes is
 * language work, which is what a model is good at. So the model drafts, and nothing else.
 *
 * Replies go out in the recipient's language: Spanish to drivers and consignees, English
 * to the shipper's account team. One language per audience, never a mix.
 *
 * Every draft has a template behind it. A missing API key, a rate limit or a refusal
 * degrades to the template rather than failing, because an ops tool cannot have a dead
 * button when somebody is waiting on an answer.
 */

import type { IssueKind } from "./domain";
import type { ResolutionAction } from "./resolution";

export type DraftLanguage = "es" | "en";
export type DraftAudience = "driver" | "customer" | "business";

export interface DraftRequest {
  issueRef: string;
  kind: IssueKind;
  action: ResolutionAction;
  audience: DraftAudience;
  language: DraftLanguage;
  recipientName: string;
  /** The message being replied to, when there is one. */
  inbound: string | null;
  routeCode: string | null;
  /** Pre-formatted, e.g. "€42.00". */
  routePay: string | null;
  /** Pre-formatted, e.g. "09:15 · Hub Vallecas". */
  pickupLabel: string | null;
  stopCount: number | null;
  consignmentNo: string | null;
  windowLabel: string | null;
  etaLabel: string | null;
  podLabel: string | null;
  driverCode: string | null;
}

export type DraftSource = "model" | "template";

export interface DraftResult {
  message: string;
  source: DraftSource;
  /** Present when the model was asked but could not answer. */
  note?: string;
}

const LIMITS = {
  text: 120,
  inbound: 600,
  outputChars: 700,
} as const;

function clip(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function optional(value: unknown, max: number): string | null {
  const text = clip(value, max);
  return text === "" ? null : text;
}

/**
 * Validate and clamp whatever arrived on the wire.
 *
 * The browser supplies this payload, which is only acceptable because the feed is
 * synthetic. Against real systems the route would look the issue up server side by id and
 * build the prompt from trusted rows — a client that can dictate prompt contents can
 * dictate what gets sent to a driver.
 */
export function parseDraftRequest(body: unknown): DraftRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const raw = body as Record<string, unknown>;

  const issueRef = clip(raw.issueRef, 32);
  const action = clip(raw.action, 32) as ResolutionAction;
  if (!issueRef || !action) return null;

  const audience = clip(raw.audience, 16);
  if (audience !== "driver" && audience !== "customer" && audience !== "business") {
    return null;
  }

  const language = clip(raw.language, 4);
  if (language !== "es" && language !== "en") return null;

  const stopCount =
    typeof raw.stopCount === "number" && Number.isFinite(raw.stopCount)
      ? Math.round(raw.stopCount)
      : null;

  return {
    issueRef,
    kind: (clip(raw.kind, 48) || "unknown") as IssueKind,
    action,
    audience,
    language,
    recipientName: clip(raw.recipientName, LIMITS.text) || (language === "es" ? "hola" : "there"),
    inbound: optional(raw.inbound, LIMITS.inbound),
    routeCode: optional(raw.routeCode, 16),
    routePay: optional(raw.routePay, 16),
    pickupLabel: optional(raw.pickupLabel, 64),
    stopCount,
    consignmentNo: optional(raw.consignmentNo, 32),
    windowLabel: optional(raw.windowLabel, 32),
    etaLabel: optional(raw.etaLabel, 32),
    podLabel: optional(raw.podLabel, 64),
    driverCode: optional(raw.driverCode, 16),
  };
}

/** The floor every draft is measured against, and the fallback when the model is away. */
export function templateFor(request: DraftRequest): string {
  const {
    recipientName: name,
    routeCode,
    routePay,
    pickupLabel,
    stopCount,
    consignmentNo,
    etaLabel,
    podLabel,
  } = request;

  const route = routeCode ?? "la ruta";
  const parcel = consignmentNo ?? "tu pedido";

  switch (request.action) {
    case "resend_route":
      return [
        `Hola ${name}, acabo de reenviarte la ruta ${route} a la app.`,
        "Cierra la aplicación y vuelve a abrirla; debería aparecerte ya.",
        "Si en dos minutos sigue sin salir, dímelo por aquí y la gestiono yo.",
      ].join(" ");

    case "answer_pay":
      return [
        `Hola ${name}, la ruta ${route} paga ${routePay ?? "la tarifa estándar"}`,
        stopCount ? ` por ${stopCount} paradas` : "",
        pickupLabel ? `, con recogida ${pickupLabel}` : "",
        ". El importe se abona con la liquidación de la semana.",
      ]
        .join("")
        .replace(" .", ".");

    case "escalate_payroll":
      return [
        `Hola ${name}, tienes razón en que hay que revisarlo.`,
        `He pasado la ruta ${route} a nóminas con el registro adjunto.`,
        "Te confirmo hoy mismo qué ha pasado con la diferencia.",
      ].join(" ");

    case "offer_route":
      return [
        `Ruta ${route} disponible`,
        stopCount ? `: ${stopCount} paradas` : "",
        routePay ? `, ${routePay}` : "",
        pickupLabel ? `, recogida ${pickupLabel}` : "",
        ". ¿La coges? Responde y te la asigno.",
      ]
        .join("")
        .replace(" .", ".");

    case "send_eta":
      return [
        `Hola ${name}, ${parcel} va en camino`,
        etaLabel ? ` y el repartidor llega sobre las ${etaLabel}` : "",
        ". Perdona la espera; si a esa hora ya no te viene bien, dímelo y lo reprogramamos.",
      ]
        .join("")
        .replace(" .", ".");

    case "confirm_address":
      return [
        `Hola ${name}, para que no falle la entrega de ${parcel}:`,
        "¿me confirmas la dirección completa, con piso y puerta?",
        "Se la paso al repartidor antes de que salga hacia allí.",
      ].join(" ");

    case "request_access":
      return [
        `Hola ${name}, el repartidor está en el portal con ${parcel} y no consigue entrar.`,
        "¿Me pasas el código de acceso o el nombre del timbre?",
        "En cuanto me lo digas se lo doy y sube.",
      ].join(" ");

    case "send_pod":
      return [
        `Proof of delivery for ${consignmentNo ?? "the consignment"} attached`,
        podLabel ? `: ${podLabel}` : "",
        ". Let us know if you need the signature record as well.",
      ]
        .join("")
        .replace(" .", ".");

    case "triage_list":
      return [
        `Thanks — we have your list and we are on it.`,
        "We are splitting it into individual cases so each one gets its own owner and clock,",
        "and we will come back to you on each rather than in one lump.",
      ].join(" ");

    default:
      return `${request.issueRef}: this one is a phone call, not a message.`;
  }
}

const SYSTEM_PROMPT = `You write short replies for the operations team of Vamo, a last-mile delivery company.

The operator will read your draft, maybe change a word, and send it. Write it so they do not have to.

Who you are writing to matters:
- DRIVERS are colleagues, not customers. They are usually standing in a warehouse or sitting in a van, often annoyed, and they want the answer first and the apology never. Be direct and practical. Never be deferential.
- CONSIGNEES are the public. Warm, plain, specific. Lead with the fact, not the apology.
- BUSINESSES are account contacts. Brief and factual, no warmth required.

Rules:
- Write in the language you are told to write in. Spanish means natural peninsular Spanish, the way a Madrid ops coordinator actually texts — not translated English.
- Two or three sentences. Never more than 55 words.
- No corporate filler, no "lamentamos las molestias", no emoji, no exclamation marks.
- Use only the facts you are given. Never invent a time, an amount, a reason or a policy. If you were not told why something happened, do not say why.
- Never mention risk scores, triage, internal tooling, or that a model wrote this.
- End with the one thing you want the recipient to do, if there is one.
- Output only the message body: no subject line, no greeting of your own invention, no signature, no quotation marks, no preamble.`;

export function buildPrompt(request: DraftRequest): string {
  const lines = [
    `Write a reply to the ${request.audience}, in ${request.language === "es" ? "Spanish" : "English"}.`,
    "",
    `Issue: ${request.issueRef} (${request.kind.replace(/_/g, " ")})`,
    `Recipient: ${request.recipientName}`,
    `The operator's intended action: ${request.action.replace(/_/g, " ")}`,
  ];

  if (request.inbound) {
    lines.push("", "They wrote:", `"""${request.inbound}"""`);
  }

  const facts: [string, string | number | null][] = [
    ["Route", request.routeCode],
    ["Route pay", request.routePay],
    ["Stops on the route", request.stopCount],
    ["Pickup", request.pickupLabel],
    ["Consignment", request.consignmentNo],
    ["Promised window", request.windowLabel],
    ["Live ETA", request.etaLabel],
    ["Proof of delivery on file", request.podLabel],
    ["Driver", request.driverCode],
  ];

  const known = facts.filter(([, value]) => value !== null && value !== "");
  if (known.length > 0) {
    lines.push("", "Facts you may use (and must not contradict):");
    for (const [label, value] of known) lines.push(`- ${label}: ${value}`);
  }

  lines.push(
    "",
    "The team's stock wording for this situation, for reference. Beat it — keep what is accurate, drop what is stiff:",
    templateFor(request),
  );

  return lines.join("\n");
}

export { SYSTEM_PROMPT, LIMITS };
