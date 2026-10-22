/**
 * Message drafting — the one place an LLM earns its keep here.
 *
 * The split is deliberate. Deciding *what* is wrong and *what to do* is the risk engine's
 * job: it has to be deterministic, testable and explainable. Writing the sentence that
 * goes to an upset customer is language work, which is what a model is actually good at.
 *
 * Every draft has a template behind it. An ops tool cannot have a dead button, so a
 * missing API key, a rate limit or a refusal degrades to the template rather than failing
 * — the operator still gets something to send, and the UI says which they got.
 */

import type { PlayAction } from "./plays";

export interface DraftRequest {
  consignmentNo: string;
  consignee: string;
  shipper: string;
  action: PlayAction;
  audience: "consignee" | "shipper" | "driver";
  /** Promised window, pre-formatted: "11:00–13:00". */
  windowLabel: string;
  /** Revised arrival, pre-formatted, when there is one. */
  projectedLabel: string | null;
  /** Minutes past the promised window. */
  slipMinutes: number | null;
  /** The signals that fired, heaviest first. */
  signals: { label: string; detail: string }[];
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
  signals: 8,
  signalText: 160,
  outputChars: 600,
} as const;

function clip(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/**
 * Validate and clamp whatever arrived on the wire.
 *
 * The browser supplies this payload, which is only acceptable because the feed itself is
 * synthetic. Against a real dispatch system the route would look the delivery up server
 * side by id and build the prompt from trusted rows — a client that can dictate prompt
 * contents can dictate the message that goes to a customer.
 */
export function parseDraftRequest(body: unknown): DraftRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const raw = body as Record<string, unknown>;

  const consignmentNo = clip(raw.consignmentNo, 32);
  const action = clip(raw.action, 32) as PlayAction;
  if (!consignmentNo || !action) return null;

  const audience = clip(raw.audience, 16);
  if (audience !== "consignee" && audience !== "shipper" && audience !== "driver") {
    return null;
  }

  // Deliberately not `Number(...)`: that turns null into 0, which would quietly convert
  // "we cannot project an arrival" into "arriving exactly on time".
  const slipMinutes =
    typeof raw.slipMinutes === "number" && Number.isFinite(raw.slipMinutes)
      ? Math.round(raw.slipMinutes)
      : null;

  return {
    consignmentNo,
    consignee: clip(raw.consignee, LIMITS.text) || "there",
    shipper: clip(raw.shipper, LIMITS.text) || "the shipper",
    action,
    audience,
    windowLabel: clip(raw.windowLabel, 32) || "the agreed window",
    projectedLabel: clip(raw.projectedLabel, 32) || null,
    slipMinutes,
    signals: Array.isArray(raw.signals)
      ? raw.signals.slice(0, LIMITS.signals).flatMap((entry) => {
          if (typeof entry !== "object" || entry === null) return [];
          const item = entry as Record<string, unknown>;
          const label = clip(item.label, 48);
          if (!label) return [];
          return [{ label, detail: clip(item.detail, LIMITS.signalText) }];
        })
      : [],
  };
}

/** The floor every draft is measured against, and the fallback when the model is unavailable. */
export function templateFor(request: DraftRequest): string {
  const { consignee, consignmentNo, shipper, windowLabel, projectedLabel } = request;
  const late = request.slipMinutes !== null && request.slipMinutes > 0 ? request.slipMinutes : null;

  switch (request.action) {
    case "notify_consignee":
      return [
        `Hi ${consignee} — Vamo here about your ${shipper} delivery ${consignmentNo}.`,
        late
          ? `We are running about ${late} minutes behind the ${windowLabel} window.`
          : `We are running behind the ${windowLabel} window.`,
        projectedLabel ? `The driver now expects to be with you around ${projectedLabel}.` : "",
        "Sorry about that. Reply here if that no longer works and we will rebook you.",
      ]
        .filter(Boolean)
        .join(" ");

    case "reply_consignee":
      return [
        `Hi ${consignee} — Vamo here, sorry for the wait on ${consignmentNo}.`,
        projectedLabel
          ? `The driver is on the way and should reach you around ${projectedLabel}.`
          : "The driver is on the way and we are tracking it now.",
        "Thanks for bearing with us.",
      ].join(" ");

    case "reschedule":
      return [
        `Hi ${consignee} — Vamo here. We tried to deliver ${consignmentNo} today and could not complete it.`,
        "We would rather not leave it sitting: reply with a day that suits you and we will book the redelivery.",
      ].join(" ");

    case "confirm_address":
      return [
        `Hi ${consignee} — Vamo here about ${consignmentNo}, due ${windowLabel}.`,
        "We have had trouble at this address before, so before the driver sets off: can you confirm the street number and the flat or unit?",
      ].join(" ");

    case "request_access":
      return [
        `Hi ${consignee} — Vamo here about ${consignmentNo}, due ${windowLabel}.`,
        "The building needs an entry code and we do not have one on file. Can you send the code, or the buzzer name, so the driver can get in?",
      ].join(" ");

    case "flag_account":
      return [
        `${shipper} — heads up on consignment ${consignmentNo}, promised ${windowLabel}.`,
        late
          ? `It is currently projecting about ${late} minutes past the window.`
          : "It is showing early warning signs on our board.",
        "Nothing is lost yet and we are working it. Flagging it now because of the penalty window on your account.",
      ].join(" ");

    default:
      return `Consignment ${consignmentNo}: no outbound message is needed for this play.`;
  }
}

const SYSTEM_PROMPT = `You write short outbound messages for the operations team of Vamo, a last-mile delivery company.

The operator will read your draft, maybe tweak a word, and send it. Write it so they do not have to.

Rules:
- One short paragraph. Two or three sentences. Never more than 55 words.
- Plain, warm, specific. No corporate throat-clearing, no "we apologise for any inconvenience caused", no emoji, no exclamation marks.
- Lead with the fact the recipient needs, not with an apology.
- Give a concrete time or a concrete question. Never promise a time you were not given.
- Never invent a reason for the delay, a compensation offer, a discount, or a policy. If you were not told why, do not say why.
- Never mention risk scores, signals, internal tooling, or that this was written by a model.
- End with the one thing you want the recipient to do, if there is one.
- Output only the message body. No greeting line of your own, no signature block, no quotation marks, no preamble.`;

export function buildPrompt(request: DraftRequest): string {
  const lines = [
    `Write a message to the ${request.audience}.`,
    "",
    `Consignment: ${request.consignmentNo}`,
    `Recipient name: ${request.consignee}`,
    `Shipper: ${request.shipper}`,
    `Promised window: ${request.windowLabel}`,
  ];

  if (request.projectedLabel) {
    lines.push(`Revised arrival we can commit to: ${request.projectedLabel}`);
  }
  if (request.slipMinutes !== null && request.slipMinutes > 0) {
    lines.push(`Minutes past the promised window: ${request.slipMinutes}`);
  }

  lines.push("", "What our system detected:");
  for (const signal of request.signals) {
    lines.push(`- ${signal.label}: ${signal.detail}`);
  }

  lines.push(
    "",
    `The operator's intended action is: ${request.action.replace(/_/g, " ")}.`,
    "",
    "For reference, here is the team's stock wording for this situation. Beat it — keep what is accurate, drop what is stiff:",
    templateFor(request),
  );

  return lines.join("\n");
}

export { SYSTEM_PROMPT, LIMITS };
