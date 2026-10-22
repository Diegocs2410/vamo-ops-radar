"use client";

import { useEffect, useRef } from "react";

import { Key, Stamp, TierStamp } from "./bits";
import type { DraftSource } from "@/lib/draft";
import { duration, slip as formatSlip, time, window as formatWindow } from "@/lib/format";
import { RESOLVE_REASONS, type Disposition, type ResolveReason, isSpent } from "@/lib/operator";
import { playFor } from "@/lib/plays";
import type { ScoredDelivery } from "@/lib/risk";

export type DraftState =
  | { status: "loading" }
  | { status: "ready"; message: string; source: DraftSource; note?: string }
  | { status: "error"; note: string };

/**
 * The carbon copy: the second sheet, pulled for one consignment.
 *
 * Its job is to answer "why is this 72" with arithmetic the operator can check, line by
 * line, the way a form's total box does. A score the operator has to take on faith is a
 * score they will eventually ignore.
 */
export function CarbonCopy({
  row,
  disposition,
  draft,
  nowMs,
  onClose,
  onTake,
  onSnooze,
  onResolve,
  onDraft,
}: {
  row: ScoredDelivery;
  disposition: Disposition;
  draft: DraftState | undefined;
  nowMs: number;
  onClose: () => void;
  onTake: () => void;
  onSnooze: () => void;
  onResolve: (reason: ResolveReason) => void;
  onDraft: () => void;
}) {
  const { delivery, driver, shipper, signals, score, tier } = row;
  const play = playFor(row);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Move focus onto the sheet so Escape and Tab behave the way the operator expects.
  useEffect(() => {
    closeRef.current?.focus();
  }, [delivery.id]);

  return (
    <aside
      className="carbon"
      role="dialog"
      aria-modal="false"
      aria-label={`Carbon copy for ${delivery.consignmentNo}`}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div className="carbon__head">
        <div style={{ minWidth: 0 }}>
          <span className="cap">Consignment</span>
          <div className="mono" style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.01em" }}>
            {delivery.consignmentNo}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--ink-faded)" }}>
            {shipper.name}
            {shipper.slaTier === "contract" && " · contract SLA"}
            {shipper.podRequired && " · POD required"}
          </div>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          {isSpent(disposition) ? (
            <Stamp kind="spent">
              {disposition.kind === "resolved"
                ? RESOLVE_REASONS[disposition.reason]
                : `snoozed ${Math.max(1, Math.round((disposition.untilMs - nowMs) / 60_000))}m`}
            </Stamp>
          ) : disposition.kind === "taken" ? (
            <Stamp kind="routine">In hand</Stamp>
          ) : (
            <TierStamp tier={tier} />
          )}
        </div>
      </div>

      <div className="carbon__section">
        <span className="masthead__doc">Why this is {score}</span>
        <div className="tally">
          {signals.map((signal) => (
            <div className="tally__row" key={signal.code}>
              <span className="tally__label">
                {signal.label}
                <span className="tally__detail">{signal.detail}</span>
              </span>
              <span className="tally__pts">+{signal.points}</span>
            </div>
          ))}
          <div className="tally__row tally__row--total">
            <span className="tally__label">Risk score</span>
            <span className="tally__pts">{score}</span>
          </div>
        </div>
      </div>

      <div className="carbon__section">
        <span className="masthead__doc">Suggested play</span>
        <div style={{ fontSize: 13.5, marginTop: 4 }}>{play.title}</div>
        <div style={{ fontSize: 12, color: "var(--ink-faded)", marginTop: 3, maxWidth: "68ch" }}>
          {play.rationale}
        </div>

        <div className="keys">
          <Key
            glyph="d"
            onClick={onDraft}
            disabled={!play.drafts}
            title={play.drafts ? undefined : "This play is a phone call, not a message"}
          >
            Draft message
          </Key>
          <Key glyph="t" onClick={onTake} pressed={disposition.kind === "taken"}>
            Take
          </Key>
          <Key glyph="s" onClick={onSnooze}>
            Snooze 15m
          </Key>
        </div>

        {draft && (
          <>
            <div className={`draft${draft.status === "loading" ? " draft--waiting" : ""}`}>
              {draft.status === "loading"
                ? "Writing…"
                : draft.status === "ready"
                  ? draft.message
                  : draft.note}
            </div>
            {draft.status === "ready" && (
              <div className="draft__source">
                {draft.source === "model" ? "Written by Claude" : "Stock wording"}
                {draft.note ? ` · ${draft.note}` : ""}
              </div>
            )}
          </>
        )}
      </div>

      <div className="carbon__section">
        <span className="masthead__doc">The stop</span>
        <div className="carbon__grid">
          <div className="field">
            <span className="cap">Consignee</span>
            <span className="field__val">{delivery.consignee.name}</span>
            <span className="field__sub mono">{delivery.consignee.phone}</span>
          </div>
          <div className="field">
            <span className="cap">Driver</span>
            <span className="field__val">{driver ? `${driver.code} · ${driver.name}` : "Unassigned"}</span>
            <span className="field__sub mono">{driver ? driver.phone : "not dispatched"}</span>
          </div>
          <div className="field">
            <span className="cap">Address</span>
            <span className="field__val">{delivery.address.line}</span>
            <span className="field__sub">
              {delivery.address.postcode} {delivery.address.district}
            </span>
          </div>
          <div className="field">
            <span className="cap">Window</span>
            <span className="field__val mono">
              {formatWindow(delivery.windowStart, delivery.windowEnd)}
            </span>
            <span className="field__sub">
              {row.minutesToWindowEnd >= 0
                ? `closes in ${duration(row.minutesToWindowEnd)}`
                : `closed ${duration(row.minutesToWindowEnd)}`}
            </span>
          </div>
          <div className="field">
            <span className="cap">Projected arrival</span>
            <span className="field__val mono">
              {row.projectedArrival ? time(row.projectedArrival) : "—"}
            </span>
            <span className="field__sub">
              {row.slipMinutes === null
                ? "cannot project without a driver"
                : row.slipMinutes > 0
                  ? `${formatSlip(row.slipMinutes)} past the window`
                  : `${formatSlip(row.slipMinutes)} against the window`}
            </span>
          </div>
          <div className="field">
            <span className="cap">Stops ahead</span>
            <span className="field__val mono">{delivery.stopsAhead}</span>
            <span className="field__sub">last scan {time(delivery.lastScanAt)}</span>
          </div>
        </div>
      </div>

      <div className="carbon__section">
        <span className="masthead__doc">
          Contact log {delivery.contacts.length === 0 && "· nothing yet"}
        </span>
        {delivery.contacts.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--ink-faded)", marginTop: 4 }}>
            Nobody has chased us about this one. We got here first — that is the whole point.
          </div>
        ) : (
          <div className="timeline">
            {[...delivery.contacts]
              .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
              .map((contact) => (
                <div className="timeline__item" key={contact.at}>
                  <span className="timeline__at">{time(contact.at)}</span>
                  <span>
                    <strong style={{ fontWeight: 600 }}>{contact.channel}</strong> · {contact.note}
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>

      <div className="carbon__section" style={{ borderBottom: 0 }}>
        <span className="masthead__doc">Close it out</span>
        <div className="keys">
          {(Object.keys(RESOLVE_REASONS) as ResolveReason[]).map((reason) => (
            <Key
              key={reason}
              onClick={() => onResolve(reason)}
              pressed={disposition.kind === "resolved" && disposition.reason === reason}
              title={
                reason === "false_positive"
                  ? "Tells us the model was wrong. This is what precision is measured from."
                  : undefined
              }
            >
              {RESOLVE_REASONS[reason]}
            </Key>
          ))}
        </div>
        <div style={{ marginTop: 7, fontSize: 11.5, color: "var(--ink-faded)", maxWidth: "68ch" }}>
          Closing as a false positive is not a courtesy option — it is the only honest source
          of precision data, and precision decides whether this queue deserves your attention.
        </div>

        <div className="keys">
          <Key glyph="Esc" onClick={onClose} title="Put the copy back">
            Close
          </Key>
        </div>
      </div>

      <button
        ref={closeRef}
        type="button"
        className="sr-only"
        onClick={onClose}
        aria-label="Close the carbon copy"
      />
    </aside>
  );
}
