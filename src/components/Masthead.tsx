import type { ShiftStats } from "@/lib/domain";
import { duration, percent, sheetDate } from "@/lib/format";
import { precision } from "@/lib/stats";
import type { TierCounts } from "@/lib/stats";

/**
 * The document header.
 *
 * The operating figures sit in boxed fields inside the form grid rather than in a row of
 * cards, and they are derived from the board below rather than configured — the product's
 * claim is that it buys the operator time, so the claim has to be measurable from what is
 * on screen.
 */

function Figure({
  caption,
  value,
  unit,
  note,
  alarm = false,
}: {
  caption: string;
  value: string | number;
  unit?: string;
  note?: string;
  alarm?: boolean;
}) {
  return (
    <div className={`figure${alarm ? " figure--alarm" : ""}`}>
      <span className="cap">{caption}</span>
      <span className="figure__value">
        {value}
        {unit && <span className="figure__unit">{unit}</span>}
      </span>
      {note && <span className="figure__note">{note}</span>}
    </div>
  );
}

export function Masthead({
  now,
  counts,
  shift,
  queueLength,
}: {
  now: string;
  counts: TierCounts;
  shift: ShiftStats;
  queueLength: number;
}) {
  const share = queueLength === 0 ? null : shift.detectedProactively / queueLength;
  const modelPrecision = precision(shift);

  return (
    <header className="masthead">
      <div className="masthead__title">
        <span className="masthead__mark">Vamo</span>
        <span className="masthead__doc">Delivery exception manifest</span>
        <span className="masthead__doc mono">
          {sheetDate(now)} · Madrid · Shift 2
        </span>
        <span className="masthead__synthetic" title="This board is generated, not real operational data">
          Synthetic feed
        </span>
      </div>

      <div className="figures">
        <Figure
          caption="Critical"
          value={counts.critical}
          note="work these first"
          alarm={counts.critical > 0}
        />
        <Figure caption="High" value={counts.high} note="before the window shuts" />
        <Figure caption="Watch" value={counts.watch} note="no action yet" />
        <Figure
          caption="Median lead time"
          value={duration(shift.medianLeadTimeMin)}
          note="room left to act"
        />
        <Figure
          caption="Caught first"
          value={share === null ? "—" : percent(share)}
          note={`${shift.detectedProactively} of ${queueLength} before any call`}
        />
        <Figure
          caption="Precision"
          value={modelPrecision === null ? "—" : percent(modelPrecision)}
          note={`${shift.falsePositivesToday} false of ${shift.resolvedToday} closed`}
        />
      </div>
    </header>
  );
}
