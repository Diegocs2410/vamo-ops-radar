"use client";

import { useEffect, useRef } from "react";

import { Key, Stamp, TierStamp } from "./bits";
import { KIND_LABELS } from "@/lib/classify";
import { SYSTEM_LABELS, factsFor, isInbound, sourcesFor, systemCount } from "@/lib/context";
import type { DraftSource } from "@/lib/draft";
import { duration, time } from "@/lib/format";
import { RESOLVE_REASONS, type Disposition, type ResolveReason, isSpent } from "@/lib/operator";
import { resolutionFor } from "@/lib/resolution";
import type { TriagedIssue } from "@/lib/triage";

export type DraftState =
  | { status: "loading" }
  | { status: "ready"; message: string; source: DraftSource; note?: string }
  | { status: "error"; note: string };

/**
 * The detail panel: everything about one issue, already gathered.
 *
 * Two things earn their place here above all. The tally answers "why is this 73" with
 * arithmetic the operator can check — a score taken on faith is a score eventually
 * ignored. And the assembled-sources list names, in the operator's own words, each lookup
 * they did not have to perform. The saving is the product, so the product says what it saved.
 */
export function ContextSheet({
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
  row: TriagedIssue;
  disposition: Disposition;
  draft: DraftState | undefined;
  nowMs: number;
  onClose: () => void;
  onTake: () => void;
  onSnooze: () => void;
  onResolve: (reason: ResolveReason) => void;
  onDraft: () => void;
}) {
  const { issue, signals, priority, tier, affected, waitingMinutes } = row;
  const resolution = resolutionFor(row);
  const sources = sourcesFor(row);
  const facts = factsFor(row);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Move focus onto the panel so Escape and Tab behave the way the operator expects.
  useEffect(() => {
    closeRef.current?.focus();
  }, [issue.id]);

  const atRisk = affected.filter((stop) => stop.tier === "critical" || stop.tier === "high");

  return (
    <aside
      className="carbon"
      role="dialog"
      aria-modal="false"
      aria-label={`Context for ${issue.ref}`}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div className="carbon__head">
        <div style={{ minWidth: 0 }}>
          <span className="cap">{KIND_LABELS[issue.kind]}</span>
          <div
            className="mono"
            style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.02em", marginTop: 2 }}
          >
            {issue.ref}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 2 }}>
            {issue.raisedBy.name} ·{" "}
            {issue.answeredAt
              ? `answered ${time(issue.answeredAt)}`
              : `waiting ${duration(waitingMinutes)}`}
          </div>
        </div>
        <div style={{ marginLeft: "auto" }}>
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

      {/* The move comes first: it is what the operator opened this for. */}
      <div className="carbon__section">
        <span className="cap">Suggested move</span>
        <div style={{ fontSize: 14, fontWeight: 500, marginTop: 5 }}>{resolution.title}</div>
        <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 4, maxWidth: "68ch" }}>
          {resolution.rationale}
        </div>

        <div className="keys">
          <Key
            glyph="d"
            onClick={onDraft}
            disabled={!resolution.drafts}
            title={resolution.drafts ? undefined : "This one's a phone call, not a message"}
          >
            {resolution.drafts
              ? `Draft reply${resolution.language === "es" ? " (ES)" : ""}`
              : "No message to send"}
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

      {/* The product, stated plainly. */}
      <div className="carbon__section">
        <span className="cap">
          Assembled for you · {sources.length} lookups across {systemCount(sources)} systems
        </span>
        <div className="saved">
          {sources.map((source, index) => (
            <div className="saved__row" key={`${source.system}-${index}`}>
              <span className="saved__system">{SYSTEM_LABELS[source.system]}</span>
              <span>{source.what}</span>
            </div>
          ))}
        </div>

        <div className="carbon__grid">
          {facts.map((fact) => (
            <div className="field" key={fact.label}>
              <span className="cap">{fact.label}</span>
              <span className="field__val">{fact.value}</span>
              {fact.sub && <span className="field__sub">{fact.sub}</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="carbon__section">
        <span className="cap">Why this is {priority}</span>
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
            <span className="tally__label">Priority</span>
            <span className="tally__pts">{priority}</span>
          </div>
        </div>
      </div>

      {issue.messages.length > 0 && (
        <div className="carbon__section">
          <span className="cap">
            The thread {issue.slackThread && `· also in ${issue.slackThread.channel}`}
          </span>
          <div className="timeline">
            {issue.messages.map((message, index) => (
              <div className="timeline__item" key={`${message.at}-${index}`}>
                <span className="timeline__at">{time(message.at)}</span>
                <span>
                  <span className="quote__who">{message.from}</span>
                  {message.body}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {atRisk.length > 0 && (
        <div className="carbon__section">
          <span className="cap">What it is costing · {atRisk.length} stops already at risk</span>
          <div className="timeline">
            {atRisk.slice(0, 6).map((stop) => (
              <div className="timeline__item" key={stop.delivery.id}>
                <span className="timeline__at">{stop.score}</span>
                <span>
                  {stop.delivery.consignmentNo} · {stop.delivery.consignee.name}
                  <span style={{ color: "var(--ink-3)" }}>
                    {" — "}
                    {stop.signals[0]?.detail ?? "at risk"}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="carbon__section" style={{ borderBottom: 0 }}>
        <span className="cap">Close it out</span>
        <div className="keys">
          {(Object.keys(RESOLVE_REASONS) as ResolveReason[]).map((reason) => (
            <Key
              key={reason}
              onClick={() => onResolve(reason)}
              pressed={disposition.kind === "resolved" && disposition.reason === reason}
              title={
                reason === "needed_more"
                  ? "Tells us the panel wasn't enough. Nothing else measures that."
                  : undefined
              }
            >
              {RESOLVE_REASONS[reason]}
            </Key>
          ))}
        </div>
        <div style={{ marginTop: 9, fontSize: 12, color: "var(--ink-3)", maxWidth: "68ch" }}>
          {isInbound(issue)
            ? "Mark “needed another system” when it happens. It's how we find out whether this panel really replaced the phone, Slack and the admin tool."
            : "This came from the ops board, not a person, so nobody's waiting on a reply — but it still needs closing out."}
        </div>

        <div className="keys">
          <Key glyph="Esc" onClick={onClose}>
            Close
          </Key>
        </div>
      </div>

      <button
        ref={closeRef}
        type="button"
        className="sr-only"
        onClick={onClose}
        aria-label={`Close the context panel for ${issue.ref}`}
      />
    </aside>
  );
}
