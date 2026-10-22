import type { ReactNode } from "react";

import { COMMAND_HELP } from "@/lib/commands";
import type { RiskTier } from "@/lib/risk";

/** A pre-printed caption with data struck in under it. */
export function Field({
  caption,
  value,
  sub,
  className = "",
  mono = false,
}: {
  caption: string;
  value: ReactNode;
  sub?: ReactNode;
  className?: string;
  mono?: boolean;
}) {
  return (
    <div className={`field ${className}`}>
      <span className="cap">{caption}</span>
      <span className={`field__val${mono ? " mono" : ""}`}>{value}</span>
      {sub !== undefined && sub !== null && <span className="field__sub">{sub}</span>}
    </div>
  );
}

export type StampKind = "critical" | "high" | "routine" | "spent";

export function Stamp({
  children,
  kind,
  ghost = false,
  pressed = false,
}: {
  children: ReactNode;
  kind: StampKind;
  /** Hovering over the paper, not yet pressed: the rehearsal state. */
  ghost?: boolean;
  pressed?: boolean;
}) {
  const classes = [
    "stamp",
    `stamp--${kind}`,
    ghost ? "stamp--ghost" : "",
    pressed ? "stamp--pressed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return <span className={classes}>{children}</span>;
}

const TIER_STAMP: Record<Exclude<RiskTier, "cleared">, { label: string; kind: StampKind }> = {
  critical: { label: "Critical", kind: "critical" },
  high: { label: "High", kind: "high" },
  watch: { label: "Watch", kind: "routine" },
};

export function TierStamp({ tier, pressed }: { tier: RiskTier; pressed?: boolean }) {
  if (tier === "cleared") return null;
  const { label, kind } = TIER_STAMP[tier];
  return (
    <Stamp kind={kind} pressed={pressed}>
      {label}
    </Stamp>
  );
}

/** A labelled control. The glyph is the key that does the same thing. */
export function Key({
  glyph,
  children,
  onClick,
  disabled = false,
  pressed,
  title,
}: {
  glyph?: string;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      className="key"
      onClick={onClick}
      disabled={disabled}
      title={title}
      {...(pressed === undefined ? {} : { "aria-pressed": pressed })}
    >
      {glyph && <span className="key__glyph">{glyph}</span>}
      {children}
    </button>
  );
}

const KEYBOARD_HELP: { keys: string; what: string }[] = [
  { keys: "j / k", what: "Move down and up the manifest" },
  { keys: "Enter", what: "Pull the carbon copy for the selected block" },
  { keys: "t", what: "Take it — put it in your hands" },
  { keys: "d", what: "Draft the suggested message" },
  { keys: "r", what: "Start a resolve, then pick the reason" },
  { keys: "s", what: "Snooze it for 15 minutes" },
  { keys: "/", what: "Search the sheet" },
  { keys: "c", what: "Jump to the command rule" },
  { keys: "Esc", what: "Put the copy back, or clear the filter" },
  { keys: "?", what: "This sheet" },
];

export function ShortcutSheet({ onClose }: { onClose: () => void }) {
  return (
    <>
      <button type="button" className="scrim" aria-label="Close the command sheet" onClick={onClose} />
      <div className="shortcuts" role="dialog" aria-modal="true" aria-label="Keys and commands">
        <span className="masthead__doc">Keys</span>
        <div className="shortcuts__list">
          {KEYBOARD_HELP.map((row) => (
            <div key={row.keys} style={{ display: "contents" }}>
              <span className="shortcuts__key">{row.keys}</span>
              <span>{row.what}</span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 14 }}>
          <span className="masthead__doc">Commands</span>
          <div className="shortcuts__list">
            {COMMAND_HELP.map((row) => (
              <div key={row.keys} style={{ display: "contents" }}>
                <span className="shortcuts__key">{row.keys}</span>
                <span>{row.what}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="keys">
          <Key glyph="Esc" onClick={onClose}>
            Close
          </Key>
        </div>
      </div>
    </>
  );
}
