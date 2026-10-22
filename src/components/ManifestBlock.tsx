"use client";

import { Field, Stamp, TierStamp } from "./bits";
import { duration, slip as formatSlip, time, window as formatWindow } from "@/lib/format";
import { dispositionLabel, isSpent, type Disposition } from "@/lib/operator";
import { dominantSignal, playFor } from "@/lib/plays";
import type { ScoredDelivery } from "@/lib/risk";

/**
 * One block of the manifest: a consignment, its risk, its reason, and its next move.
 *
 * The block has to justify itself without a click, which is why the signals carry their
 * point values on the face of the row. An operator who cannot see why a row scores 72
 * works the queue out of order, and then the ranking — the actual product — is worthless.
 */
export function ManifestBlock({
  row,
  seq,
  disposition,
  nowMs,
  selected,
  rehearsing,
  ghost,
  pressed,
  onSelect,
  onOpen,
}: {
  row: ScoredDelivery;
  seq: number;
  disposition: Disposition;
  nowMs: number;
  selected: boolean;
  /** The pending command would change this block. */
  rehearsing: boolean;
  /** Text for the stamp hovering over it while the command is rehearsed. */
  ghost: string | null;
  pressed: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const { delivery, driver, shipper, signals, score, tier, slipMinutes, projectedArrival } = row;
  const play = playFor(row);
  const dominant = dominantSignal(row);
  const spent = isSpent(disposition);
  const state = dispositionLabel(disposition, nowMs);

  return (
    <article
      className="block"
      data-tier={tier}
      data-selected={selected}
      data-spent={spent}
      data-rehearsing={rehearsing}
      tabIndex={0}
      role="button"
      aria-label={`${delivery.consignmentNo}, risk ${score}, ${tier}`}
      onClick={() => {
        onSelect();
        onOpen();
      }}
      onFocus={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
          onOpen();
        }
      }}
    >
      <div className="fields">
        <Field caption="" value={String(seq).padStart(2, "0")} className="field--seq" />

        <Field caption="Risk" value={score} className="field--risk" />

        <Field
          caption="Consignment"
          value={delivery.consignmentNo}
          sub={shipper.slaTier === "contract" ? "Contract SLA" : "Standard"}
          className="field--consignment"
          mono
        />

        <Field
          caption="Consignee"
          value={delivery.consignee.name}
          sub={`${delivery.address.line} · ${delivery.address.district}`}
          className="field--consignee"
        />

        <Field
          caption="Shipper"
          value={shipper.name}
          sub={delivery.status.replace(/_/g, " ")}
          className="field--shipper"
        />

        <Field
          caption="Window"
          value={formatWindow(delivery.windowStart, delivery.windowEnd)}
          sub={
            row.minutesToWindowEnd >= 0
              ? `closes in ${duration(row.minutesToWindowEnd)}`
              : `closed ${duration(row.minutesToWindowEnd)}`
          }
          className="field--window"
          mono
        />

        <Field
          caption="Projected"
          value={projectedArrival ? time(projectedArrival) : "—"}
          sub={
            slipMinutes === null ? (
              "no driver"
            ) : slipMinutes > 0 ? (
              <span className="slip">{formatSlip(slipMinutes)}</span>
            ) : (
              formatSlip(slipMinutes)
            )
          }
          className="field--projected"
          mono
        />

        <Field
          caption="Driver"
          value={driver ? driver.code : "unassigned"}
          sub={driver ? driver.name : "not dispatched"}
          className="field--driver"
        />

      <div className="block__stamp">
        {rehearsing && ghost ? (
          <Stamp kind={ghost === "False positive" ? "routine" : "spent"} ghost>
            {ghost}
          </Stamp>
        ) : spent || disposition.kind === "taken" ? (
          <Stamp kind={spent ? "spent" : "routine"} pressed={pressed}>
            {state}
          </Stamp>
        ) : (
          <TierStamp tier={tier} pressed={pressed} />
        )}
      </div>
      </div>

      <div className="signals">
        {signals.map((signal) => (
          <span
            key={signal.code}
            className={`signal${signal.code === dominant ? " signal--dominant" : ""}`}
            title={signal.detail}
          >
            {signal.label}
            <span className="signal__pts">+{signal.points}</span>
          </span>
        ))}
      </div>

      <div className="remarks">
        <span className="cap remarks__cap">Remarks</span>
        <span className="remarks__text">{play.title}</span>
        {selected && (
          <span className="remarks__keys">
            {play.drafts ? "d draft · t take · r resolve" : "t take · r resolve"}
          </span>
        )}
      </div>
    </article>
  );
}
