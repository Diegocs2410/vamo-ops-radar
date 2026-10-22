"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CarbonCopy, type DraftState } from "./CarbonCopy";
import { CommandRule } from "./CommandRule";
import { ManifestBlock } from "./ManifestBlock";
import { Masthead } from "./Masthead";
import { Key, ShortcutSheet } from "./bits";
import {
  type CommandContext,
  type Effect,
  type TierFilter,
  matchesSearch,
  parseCommand,
} from "@/lib/commands";
import type { OperationSnapshot } from "@/lib/domain";
import { duration, time, window as formatWindow } from "@/lib/format";
import {
  type Dispositions,
  type ResolveReason,
  RESOLVE_REASONS,
  buildQueue,
  isSpent,
} from "@/lib/operator";
import { playFor } from "@/lib/plays";
import { scoreBoard } from "@/lib/risk";
import { countTiers } from "@/lib/stats";

/**
 * The working surface.
 *
 * One screen, because the operator has one question: what is about to fail, and what do I
 * do about it. The board is re-scored locally against the wall clock every few seconds, so
 * windows really do close and slips really do grow while it sits open.
 *
 * Operator state (taken, snoozed, resolved) is held here and nowhere else — this is a
 * prototype with no persistence, which is a stated cut rather than an oversight. See README.
 */
/** How often the board is re-scored against the wall clock. */
const CLOCK_TICK_MS = 5_000;

export function Radar({ initialSnapshot }: { initialSnapshot: OperationSnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  // Starts at the server's clock so the first client paint matches the server's.
  const [nowMs, setNowMs] = useState(() => Date.parse(initialSnapshot.now));
  const [dispositions, setDispositions] = useState<Dispositions>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [command, setCommand] = useState("");
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [search, setSearch] = useState("");
  const [showKeys, setShowKeys] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [pressedIds, setPressedIds] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const commandRef = useRef<HTMLInputElement>(null);

  // The wall clock is an external system: subscribe to it and let the callbacks set state.
  // Resyncing on visibilitychange matters because browsers throttle timers in background
  // tabs, and an ops board lives in a background tab half the day.
  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    const id = setInterval(tick, CLOCK_TICK_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  const board = useMemo(
    () => scoreBoard({ ...snapshot, now: new Date(nowMs).toISOString() }),
    [snapshot, nowMs],
  );

  const counts = useMemo(() => countTiers(board), [board]);
  const fullQueue = useMemo(() => buildQueue(board, dispositions, nowMs), [board, dispositions, nowMs]);

  const queue = useMemo(
    () =>
      fullQueue.filter(({ scored }) => {
        if (tierFilter !== "all" && scored.tier !== tierFilter) return false;
        return matchesSearch(search, {
          consignmentNo: scored.delivery.consignmentNo,
          consignee: scored.delivery.consignee.name,
          address: `${scored.delivery.address.line} ${scored.delivery.address.district} ${scored.delivery.address.postcode}`,
          driver: scored.driver ? `${scored.driver.code} ${scored.driver.name}` : "unassigned",
          shipper: scored.shipper.name,
        });
      }),
    [fullQueue, tierFilter, search],
  );

  // A filter can take the operator's pick off the sheet, so the live selection is derived
  // rather than synchronised: whatever they chose if it survived the filter, else the top
  // of the queue, which is where someone working top-down wants to be anyway.
  const selected = useMemo(() => {
    if (queue.length === 0) return null;
    return queue.some(({ scored }) => scored.delivery.id === selectedId)
      ? selectedId
      : queue[0].scored.delivery.id;
  }, [queue, selectedId]);

  const commandContext: CommandContext = useMemo(
    () => ({
      rows: queue.map(({ scored }) => ({
        id: scored.delivery.id,
        consignmentNo: scored.delivery.consignmentNo,
        tier: scored.tier,
      })),
      selectedId: selected,
    }),
    [queue, selected],
  );

  const plan = useMemo(() => parseCommand(command, commandContext), [command, commandContext]);
  const rehearsing = useMemo(
    () => new Set(plan?.ok ? plan.affected : []),
    [plan],
  );

  const rowById = useCallback(
    (id: string) => board.find((scored) => scored.delivery.id === id) ?? null,
    [board],
  );

  const flashPressed = useCallback((ids: string[]) => {
    setPressedIds(ids);
    setTimeout(() => setPressedIds([]), 500);
  }, []);

  const requestDraft = useCallback(
    async (id: string) => {
      const scored = rowById(id);
      if (!scored) return;

      const play = playFor(scored);
      if (!play.drafts) {
        setStatus(`${scored.delivery.consignmentNo} needs a phone call, not a message`);
        return;
      }

      setOpenId(id);
      setDrafts((current) => ({ ...current, [id]: { status: "loading" } }));

      try {
        const response = await fetch("/api/draft", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            consignmentNo: scored.delivery.consignmentNo,
            consignee: scored.delivery.consignee.name,
            shipper: scored.shipper.name,
            action: play.action,
            audience: play.audience,
            windowLabel: formatWindow(scored.delivery.windowStart, scored.delivery.windowEnd),
            projectedLabel: scored.projectedArrival ? time(scored.projectedArrival) : null,
            slipMinutes: scored.slipMinutes,
            signals: scored.signals.map(({ label, detail }) => ({ label, detail })),
          }),
        });

        if (!response.ok) throw new Error(`draft responded ${response.status}`);
        const result = await response.json();
        setDrafts((current) => ({
          ...current,
          [id]: {
            status: "ready",
            message: result.message,
            source: result.source,
            note: result.note,
          },
        }));
      } catch {
        setDrafts((current) => ({
          ...current,
          [id]: { status: "error", note: "Could not reach the drafting service." },
        }));
      }
    },
    [rowById],
  );

  const commit = useCallback(
    (effect: Effect) => {
      switch (effect.kind) {
        case "take": {
          const at = Date.now();
          setDispositions((current) => {
            const next = { ...current };
            for (const id of effect.ids) next[id] = { kind: "taken", at };
            return next;
          });
          flashPressed(effect.ids);
          setStatus(`${effect.ids.length} block(s) in your hands`);
          break;
        }

        case "snooze": {
          const untilMs = Date.now() + effect.minutes * 60_000;
          setDispositions((current) => {
            const next = { ...current };
            for (const id of effect.ids) next[id] = { kind: "snoozed", untilMs };
            return next;
          });
          flashPressed(effect.ids);
          setStatus(`${effect.ids.length} block(s) set aside for ${effect.minutes} min`);
          break;
        }

        case "resolve": {
          const at = Date.now();
          setDispositions((current) => {
            const next = { ...current };
            for (const id of effect.ids) next[id] = { kind: "resolved", reason: effect.reason, at };
            return next;
          });
          flashPressed(effect.ids);
          setStatus(
            `${effect.ids.length} block(s) closed — ${RESOLVE_REASONS[effect.reason].toLowerCase()}`,
          );
          if (effect.ids.includes(openId ?? "")) setOpenId(null);
          break;
        }

        case "draft":
          void requestDraft(effect.id);
          break;

        case "filter":
          setTierFilter(effect.tier);
          setStatus(effect.tier === "all" ? "Showing the whole sheet" : `Showing ${effect.tier} only`);
          break;

        case "find":
          setSearch(effect.text);
          setStatus(`Filtered to "${effect.text}"`);
          break;

        case "help":
          setShowKeys(true);
          break;
      }
    },
    [flashPressed, openId, requestDraft],
  );

  const submitCommand = useCallback(() => {
    if (!plan || !plan.ok || !plan.effect) return;
    commit(plan.effect);
    setCommand("");
  }, [commit, plan]);

  const move = useCallback(
    (delta: number) => {
      if (queue.length === 0) return;
      const index = queue.findIndex(({ scored }) => scored.delivery.id === selected);
      const next = Math.min(queue.length - 1, Math.max(0, (index === -1 ? 0 : index) + delta));
      const id = queue[next].scored.delivery.id;
      setSelectedId(id);
      document
        .querySelector<HTMLElement>(`[data-block-id="${id}"]`)
        ?.scrollIntoView({ block: "nearest" });
    },
    [queue, selected],
  );

  const focusCommand = useCallback((prefill: string) => {
    setCommand(prefill);
    // Let the controlled value land before the caret is placed at the end.
    requestAnimationFrame(() => {
      commandRef.current?.focus();
      const length = commandRef.current?.value.length ?? 0;
      commandRef.current?.setSelectionRange(length, length);
    });
  }, []);

  const refetch = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/feed", { cache: "no-store" });
      setSnapshot(await response.json());
      setNowMs(Date.now());
      setStatus("Feed refetched");
    } catch {
      setStatus("Could not reach the feed");
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Keyboard first. The mouse is for the phone.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable === true;

      if (event.key === "?") {
        event.preventDefault();
        setShowKeys((open) => !open);
        return;
      }

      if (showKeys) {
        if (event.key === "Escape") {
          event.preventDefault();
          setShowKeys(false);
        }
        return;
      }

      if (typing) return;

      switch (event.key) {
        case "j":
        case "ArrowDown":
          event.preventDefault();
          move(1);
          break;
        case "k":
        case "ArrowUp":
          event.preventDefault();
          move(-1);
          break;
        case "Enter":
          if (selected) {
            event.preventDefault();
            setOpenId(selected);
          }
          break;
        case "Escape":
          event.preventDefault();
          if (openId) setOpenId(null);
          else if (tierFilter !== "all" || search !== "") {
            setTierFilter("all");
            setSearch("");
            setStatus("Filter cleared");
          }
          break;
        case "t":
          if (selected) {
            event.preventDefault();
            commit({ kind: "take", ids: [selected] });
          }
          break;
        case "s":
          if (selected) {
            event.preventDefault();
            commit({ kind: "snooze", ids: [selected], minutes: 15 });
          }
          break;
        case "d":
          if (selected) {
            event.preventDefault();
            void requestDraft(selected);
          }
          break;
        case "r":
          // Resolving needs a reason, so the key opens the command rather than guessing one.
          event.preventDefault();
          focusCommand("resolve ");
          break;
        case "/":
          event.preventDefault();
          focusCommand("/");
          break;
        case "c":
          event.preventDefault();
          focusCommand("");
          break;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [commit, focusCommand, move, openId, requestDraft, search, selected, showKeys, tierFilter]);

  const openRow = openId ? rowById(openId) : null;
  const spentCount = fullQueue.filter(({ disposition }) => isSpent(disposition)).length;

  return (
    <div className="sheet">
      <div className="perforation" aria-hidden="true" />

      <div className="column">
        <Masthead
          now={new Date(nowMs).toISOString()}
          counts={counts}
          shift={snapshot.shift}
          queueLength={fullQueue.length}
        />

        <CommandRule
          value={command}
          onChange={setCommand}
          onSubmit={submitCommand}
          onCancel={() => {
            setCommand("");
            commandRef.current?.blur();
          }}
          plan={plan}
          inputRef={commandRef}
          status={status}
        />

        <div className="heads">
          <div className="keys" style={{ marginTop: 0 }}>
            <Key onClick={() => setTierFilter("all")} pressed={tierFilter === "all"}>
              All {fullQueue.length}
            </Key>
            <Key onClick={() => setTierFilter("critical")} pressed={tierFilter === "critical"}>
              Critical {counts.critical}
            </Key>
            <Key onClick={() => setTierFilter("high")} pressed={tierFilter === "high"}>
              High {counts.high}
            </Key>
            <Key onClick={() => setTierFilter("watch")} pressed={tierFilter === "watch"}>
              Watch {counts.watch}
            </Key>
            {search !== "" && (
              <Key glyph="Esc" onClick={() => setSearch("")}>
                “{search}”
              </Key>
            )}
            <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
              {spentCount > 0 && (
                <span className="cap" style={{ display: "inline" }}>
                  {spentCount} closed this session
                </span>
              )}
              <Key onClick={refetch} disabled={refreshing}>
                {refreshing ? "Refetching…" : "Refetch feed"}
              </Key>
            </span>
          </div>
        </div>

        <main className="manifest">
          {queue.length === 0 ? (
            <div className="empty">
              <span className="empty__stamp">Nothing at risk</span>
              <p className="empty__text">
                {fullQueue.length === 0
                  ? "Every delivery on the board is projecting inside its window, with no stalled vehicles and nobody chasing us. The queue fills itself when that stops being true."
                  : "Nothing matches the current filter. Press Esc to put the whole sheet back."}
              </p>
            </div>
          ) : (
            queue.map(({ scored, disposition }, index) => (
              <div key={scored.delivery.id} data-block-id={scored.delivery.id}>
                <ManifestBlock
                  row={scored}
                  seq={index + 1}
                  disposition={disposition}
                  nowMs={nowMs}
                  selected={scored.delivery.id === selected}
                  rehearsing={rehearsing.has(scored.delivery.id)}
                  ghost={plan?.ghost ?? null}
                  pressed={pressedIds.includes(scored.delivery.id)}
                  onSelect={() => setSelectedId(scored.delivery.id)}
                  onOpen={() => setOpenId(scored.delivery.id)}
                />
              </div>
            ))
          )}
        </main>
      </div>

      {openRow && (
        <CarbonCopy
          row={openRow}
          disposition={
            fullQueue.find(({ scored }) => scored.delivery.id === openRow.delivery.id)
              ?.disposition ?? { kind: "open" }
          }
          draft={drafts[openRow.delivery.id]}
          nowMs={nowMs}
          onClose={() => setOpenId(null)}
          onTake={() => commit({ kind: "take", ids: [openRow.delivery.id] })}
          onSnooze={() => commit({ kind: "snooze", ids: [openRow.delivery.id], minutes: 15 })}
          onResolve={(reason: ResolveReason) =>
            commit({ kind: "resolve", ids: [openRow.delivery.id], reason })
          }
          onDraft={() => void requestDraft(openRow.delivery.id)}
        />
      )}

      {showKeys && <ShortcutSheet onClose={() => setShowKeys(false)} />}

      <p className="sr-only" role="status" aria-live="polite">
        {status ?? ""}
        {queue.length > 0 && ` ${queue.length} blocks on the sheet.`}
        {snapshot.shift.medianLeadTimeMin > 0 &&
          ` Median lead time ${duration(snapshot.shift.medianLeadTimeMin)}.`}
      </p>
    </div>
  );
}
