/**
 * Formatting.
 *
 * Everything is formatted in the operation's own timezone rather than the viewer's.
 * Two reasons: an operator reading a Madrid manifest wants Madrid times whatever laptop
 * they are on, and pinning the zone keeps the server render and the client render
 * identical, which is what stops the clocks flickering on hydration.
 */

const OPERATION_TIMEZONE = "Europe/Madrid";

const clock = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: OPERATION_TIMEZONE,
});

const longDate = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  timeZone: OPERATION_TIMEZONE,
});

export function time(iso: string): string {
  return clock.format(Date.parse(iso));
}

export function window(startIso: string, endIso: string): string {
  return `${time(startIso)}–${time(endIso)}`;
}

export function sheetDate(iso: string): string {
  return longDate.format(Date.parse(iso)).toUpperCase();
}

/** Minutes as an operator says them: "18m", "1h 20m", "40m ago". */
export function duration(minutes: number): string {
  const rounded = Math.round(Math.abs(minutes));
  const body =
    rounded >= 60
      ? `${Math.floor(rounded / 60)}h ${String(rounded % 60).padStart(2, "0")}m`
      : `${rounded}m`;
  return minutes < 0 ? `${body} ago` : body;
}

/** Signed slip, for the projected-arrival field: "+64m" late, "−12m" early. */
export function slip(minutes: number): string {
  const rounded = Math.round(minutes);
  if (rounded === 0) return "on time";
  return rounded > 0 ? `+${rounded}m` : `−${Math.abs(rounded)}m`;
}

/** Route pay, in the currency the operation runs in. */
export function money(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}

export function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function titleCase(value: string): string {
  return value.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}
