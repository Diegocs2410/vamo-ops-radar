import { Suspense } from "react";
import { connection } from "next/server";

import { BlankSheet } from "@/components/BlankSheet";
import { Radar } from "@/components/Radar";
import { buildSnapshot } from "@/lib/seed";

/**
 * The board is built from the wall clock, so it cannot be prerendered. `connection()`
 * holds it until a real request arrives, and the Suspense boundary lets the stock, the
 * perforation and the pre-printed captions paint straight away while the data lands.
 *
 * The snapshot's own timestamp is then handed to the client as its starting clock, which
 * keeps the server markup and the first client render identical through hydration.
 */
export default function Page() {
  return (
    <Suspense fallback={<BlankSheet />}>
      <Board />
    </Suspense>
  );
}

async function Board() {
  await connection();
  return <Radar initialSnapshot={buildSnapshot()} />;
}
