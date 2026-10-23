/**
 * Context assembly — the actual product.
 *
 * The ops team's own description of the problem: *"the context for any one problem is
 * spread across our phone system, Slack threads and the admin tool, so the team pieces it
 * together by hand."*
 *
 * So this module does the piecing. Given one issue, it works out every lookup a human
 * would otherwise have performed, in which system, and gathers the answers onto one sheet.
 *
 * `sourcesFor` is not a debug aid. It goes on screen, naming for the operator what
 * they did *not* have to open. The saving is the feature, so the feature says what it saved.
 */

import { KIND_LABELS } from "./classify";
import type { Issue } from "./domain";
import { duration, money, time, window as formatWindow } from "./format";
import type { TriagedIssue } from "./triage";

export type SourceSystem = "phone" | "slack" | "admin";

export const SYSTEM_LABELS: Record<SourceSystem, string> = {
  phone: "Phone system",
  slack: "Slack",
  admin: "Admin tool",
};

export interface AssembledSource {
  system: SourceSystem;
  /** The lookup this stands in for, in the words the operator would have used. */
  what: string;
}

export interface ContextFact {
  label: string;
  value: string;
  sub?: string;
}

/** Did this issue arrive as a human message, or from their ops board? */
export function isInbound(issue: Issue): boolean {
  return issue.source !== "detected";
}

/**
 * Every lookup this sheet stands in for. Order matters: phone first, because that is where
 * the operator's attention already is when the text lands.
 */
export function sourcesFor(triaged: TriagedIssue): AssembledSource[] {
  const { issue, route, driver, delivery } = triaged;
  const sources: AssembledSource[] = [];

  const threadLength = issue.messages.filter(
    (message) => message.channel === "sms" || message.channel === "call",
  ).length;

  if (threadLength > 0) {
    sources.push({
      system: "phone",
      what: `the ${threadLength}-message thread with ${issue.raisedBy.name}`,
    });
  }

  if (issue.slackThread) {
    sources.push({
      system: "slack",
      what: `${issue.slackThread.channel}, ${issue.slackThread.replies} replies`,
    });
  }

  if (route) {
    sources.push({ system: "admin", what: `route ${route.code} — driver, pickup, stop count` });
  }

  if (driver) {
    sources.push({ system: "admin", what: `driver record for ${driver.code} — last ping, phone` });
  }

  if (issue.kind === "pay_question" || issue.kind === "pay_dispute") {
    sources.push({
      system: "admin",
      what: route ? `pay record for ${route.code}` : "the pay record",
    });
  }

  if (delivery) {
    sources.push({
      system: "admin",
      what: `stop ${delivery.consignmentNo} — status, window, live ETA`,
    });
  }

  if (issue.kind === "pod_request" && delivery?.podPhotoId) {
    sources.push({
      system: "admin",
      what: `delivery photo and scan time for ${delivery.consignmentNo}`,
    });
  }

  if (triaged.affected.length > 0) {
    sources.push({
      system: "admin",
      what: `the other ${triaged.affected.length} stops on the route, to see what is at stake`,
    });
  }

  return sources;
}

/** How many distinct systems the operator would have opened. */
export function systemCount(sources: AssembledSource[]): number {
  return new Set(sources.map((source) => source.system)).size;
}

/**
 * The facts themselves, already looked up. Everything here came from one of the systems
 * named above; nothing is computed for display only.
 */
export function factsFor(triaged: TriagedIssue): ContextFact[] {
  const { issue, route, driver, shipper, delivery } = triaged;
  const facts: ContextFact[] = [];

  facts.push({
    label: "Kind",
    value: KIND_LABELS[issue.kind],
    sub: isInbound(issue) ? "raised by a person" : "flagged by the ops board",
  });

  if (route) {
    facts.push({
      label: "Route",
      value: route.code,
      sub: `${route.stopsCompleted} of ${route.stopCount} stops · ${route.status.replace(/_/g, " ")}`,
    });
    facts.push({
      label: "Pickup",
      value: `${time(route.pickupAt)} · ${route.pickupLocation}`,
      sub: shipper ? shipper.name : undefined,
    });
    facts.push({
      label: "Route pay",
      value: money(route.payCents),
      sub: route.payStatus,
    });
  }

  if (driver) {
    facts.push({
      label: "Driver",
      value: `${driver.code} · ${driver.name}`,
      sub: driver.phone,
    });
    facts.push({
      label: "Last ping",
      value: time(driver.lastPingAt),
      sub: `${duration(driver.minutesSinceMovement)} since it moved`,
    });
  }

  if (delivery) {
    facts.push({
      label: "Stop",
      value: delivery.consignmentNo,
      sub: `${delivery.consignee.name} · ${delivery.address.line}`,
    });
    facts.push({
      label: "Window",
      value: formatWindow(delivery.windowStart, delivery.windowEnd),
      sub: delivery.status.replace(/_/g, " "),
    });
    if (delivery.podPhotoId) {
      facts.push({
        label: "Proof of delivery",
        value: `photo ${delivery.podPhotoId}`,
        sub: `scanned ${time(delivery.lastScanAt)}`,
      });
    }
  }

  if (shipper && !route) {
    facts.push({
      label: "Shipper",
      value: shipper.name,
      sub: shipper.slaTier === "contract" ? "contract SLA" : "standard",
    });
  }

  return facts;
}
