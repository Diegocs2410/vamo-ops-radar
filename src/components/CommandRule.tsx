"use client";

import { type RefObject } from "react";

import type { CommandPlan } from "@/lib/commands";

/**
 * The command rule, and the delta strip under it.
 *
 * The strip is the whole idea: before Enter is pressed the manifest already shows what
 * would happen and this line counts it. Confirming only keeps what the operator can
 * already see is true.
 */
export function CommandRule({
  value,
  onChange,
  onSubmit,
  onCancel,
  plan,
  inputRef,
  status,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  plan: CommandPlan | null;
  inputRef: RefObject<HTMLInputElement | null>;
  /** The last thing that happened, shown when no command is being typed. */
  status: string | null;
}) {
  return (
    <section className="command">
      <div className="command__line">
        <span className="command__caret" aria-hidden="true">
          &gt;
        </span>
        <input
          ref={inputRef}
          className="command__input"
          value={value}
          spellCheck={false}
          autoComplete="off"
          aria-label="Command"
          placeholder="take · resolve fp · snooze 20 · draft · show critical · /search"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onSubmit();
            } else if (event.key === "Escape") {
              event.preventDefault();
              onCancel();
            }
          }}
        />
        <span className="command__hint">? for keys</span>
      </div>

      {plan ? (
        <div className={`delta${plan.ok ? "" : " delta--error"}`} role="status">
          <span className="delta__verb">{plan.verb}</span>
          <span>{plan.summary}</span>
          {plan.ok && <span className="delta__press">Enter to press · Esc to lift</span>}
        </div>
      ) : (
        status && (
          <div className="delta" role="status">
            <span className="delta__verb">Done</span>
            <span>{status}</span>
          </div>
        )
      )}
    </section>
  );
}
