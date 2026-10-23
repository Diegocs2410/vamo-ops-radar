"use client";

import { Field, Stamp, TierStamp } from "./bits";
import { KIND_LABELS } from "@/lib/classify";
import { isInbound } from "@/lib/context";
import type { IssueSource } from "@/lib/domain";
import { duration, time } from "@/lib/format";
import { dispositionLabel, isSpent, type Disposition } from "@/lib/operator";
import { resolutionFor } from "@/lib/resolution";
import type { TriagedIssue } from "@/lib/triage";

const SOURCE_LABELS: Record<IssueSource, string> = {
  detected: "Ops board",
  driver_sms: "SMS",
  driver_call: "Call",
  customer_sms: "SMS",
  customer_call: "Call",
  business_email: "Email",
  slack: "Slack",
};

/**
 * One issue on the manifest.
 *
 * The row has to answer four things without a click: how urgent, who is waiting and how
 * long, what they actually said, and what to do about it. The message itself is on the
 * row rather than behind a click, because an operator who has to open each one to find
 * out what it is has not been saved any work at all.
 */
export function IssueBlock({
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
  row: TriagedIssue;
  seq: number;
  disposition: Disposition;
  nowMs: number;
  selected: boolean;
  rehearsing: boolean;
  ghost: string | null;
  pressed: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const { issue, route, delivery, signals, priority, tier, waitingMinutes } = row;
  const resolution = resolutionFor(row);
  const spent = isSpent(disposition);
  const state = dispositionLabel(disposition, nowMs);
  const latest = issue.messages[issue.messages.length - 1];
  const dominant = signals[0]?.code;

  return (
    <article
      className="block"
      data-tier={tier}
      data-selected={selected}
      data-spent={spent}
      data-rehearsing={rehearsing}
      tabIndex={0}
      role="button"
      aria-label={`${issue.ref}, ${KIND_LABELS[issue.kind]}, priority ${priority}`}
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

        <Field caption="Pri" value={priority} className="field--risk" />

        <Field
          caption="Issue"
          value={issue.ref}
          sub={
            <span className={`source${issue.source === "detected" ? " source--detected" : ""}`}>
              {SOURCE_LABELS[issue.source]}
            </span>
          }
          className="field--ref"
          mono
        />

        <Field
          caption="Raised by"
          value={issue.raisedBy.name}
          sub={KIND_LABELS[issue.kind]}
          className="field--raised"
        />

        <Field
          caption="Route"
          value={route ? route.code : "—"}
          sub={route ? `${route.stopsCompleted}/${route.stopCount} stops` : "not linked"}
          className="field--route"
          mono
        />

        <Field
          caption="Waiting"
          value={
            issue.answeredAt ? (
              "answered"
            ) : (
              <span className={waitingMinutes >= 20 ? "slip" : undefined}>
                {duration(waitingMinutes)}
              </span>
            )
          }
          sub={`since ${time(issue.openedAt)}`}
          className="field--waiting"
          mono
        />

        <Field
          caption="Stop"
          value={delivery ? delivery.consignmentNo : "—"}
          sub={delivery ? delivery.consignee.name : "no stop linked"}
          className="field--stop"
          mono
        />

        <div className="block__stamp">
          {rehearsing && ghost ? (
            <Stamp kind={ghost === "Needed more" ? "critical" : "spent"} ghost>
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

      {isInbound(issue) && latest && (
        <p className="quote">
          <span className="quote__who">{latest.channel}</span>
          {latest.body}
        </p>
      )}

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
        <span className="remarks__text">{resolution.title}</span>
        {selected && (
          <span className="remarks__keys">
            {resolution.drafts ? "d draft · t take · r resolve" : "t take · r resolve"}
          </span>
        )}
      </div>
    </article>
  );
}
