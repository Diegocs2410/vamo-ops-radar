import { connection } from "next/server";

import { buildSnapshot } from "@/lib/seed";

/**
 * GET /api/feed — the operation as of right now.
 *
 * This is the seam. Against a real deployment this handler is where the dispatch
 * database, the telemetry stream and the contact log get joined into one
 * `OperationSnapshot`; everything downstream of it is unchanged. Today it is generated.
 *
 * `connection()` keeps it out of the prerender: the whole point is that it is current.
 */
export async function GET(): Promise<Response> {
  await connection();

  return Response.json(buildSnapshot(), {
    headers: { "cache-control": "no-store" },
  });
}
