import Anthropic from "@anthropic-ai/sdk";

import {
  type DraftRequest,
  type DraftResult,
  LIMITS,
  SYSTEM_PROMPT,
  buildPrompt,
  parseDraftRequest,
  templateFor,
} from "@/lib/draft";

/**
 * POST /api/draft — write the outbound message for an incident's suggested play.
 *
 * Never fails from the operator's point of view. If the model is unavailable, refuses, or
 * is simply not configured, the stock template comes back instead and the response says
 * which one the operator is looking at.
 */

const MODEL = "claude-opus-5-5";

function client(): Anthropic {
  // Identity-linked keys need the workspace header; plain keys ignore it.
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;

  return new Anthropic(
    workspaceId ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } } : {},
  );
}

async function draftWithModel(request: DraftRequest): Promise<DraftResult> {
  const response = await client().beta.messages.create({
    model: MODEL,
    max_tokens: 1024,
    // Writing three warm sentences does not need deep deliberation, and the operator is
    // waiting on it.
    output_config: { effort: "low" },
    // On a policy decline the API retries the same request on a fallback model inside the
    // same call, so one unlucky phrasing does not leave the operator with nothing.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildPrompt(request) }],
  });

  if (response.stop_reason === "refusal") {
    return {
      message: templateFor(request),
      source: "template",
      note: "The model declined to draft this one.",
    };
  }

  const message = response.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  if (message === "") {
    return {
      message: templateFor(request),
      source: "template",
      note: "The model returned nothing.",
    };
  }

  return { message: message.slice(0, LIMITS.outputChars), source: "model" };
}

export async function POST(request: Request): Promise<Response> {
  let parsed: DraftRequest | null = null;

  try {
    parsed = parseDraftRequest(await request.json());
  } catch {
    return Response.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  if (!parsed) {
    return Response.json({ error: "Incomplete draft request" }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    const result: DraftResult = {
      message: templateFor(parsed),
      source: "template",
      note: "No ANTHROPIC_API_KEY is set, so this is the stock wording.",
    };
    return Response.json(result);
  }

  try {
    return Response.json(await draftWithModel(parsed));
  } catch (error) {
    // Anything the model side can throw still has to leave the operator with a message.
    const note =
      error instanceof Anthropic.RateLimitError
        ? "The model is rate limited right now."
        : error instanceof Anthropic.AuthenticationError
          ? "The API key was rejected."
          : error instanceof Anthropic.APIError
            ? `The model call failed (${error.status}).`
            : "The model call failed.";

    console.error("draft: falling back to the template —", error);

    const result: DraftResult = { message: templateFor(parsed), source: "template", note };
    return Response.json(result);
  }
}
