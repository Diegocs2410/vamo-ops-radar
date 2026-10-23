import type { ShiftStats } from "@/lib/domain";
import { duration, percent, sheetDate } from "@/lib/format";
import { oneScreenRate } from "@/lib/stats";
import type { TierCounts } from "@/lib/stats";

/**
 * The header.
 *
 * The operating numbers are derived from the board below rather than configured. The
 * product claims it collapses three systems into one screen, so the claim is measured
 * from what the screen is currently holding — not asserted next to it.
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
  openCount,
  inbound,
  lookups,
  systems,
}: {
  now: string;
  counts: TierCounts;
  shift: ShiftStats;
  openCount: number;
  inbound: number | null;
  lookups: number;
  systems: number;
}) {
  const oneScreen = oneScreenRate(shift);

  return (
    <header className="masthead">
      <div className="masthead__title">
        <span className="masthead__mark">Vamo</span>
        <span className="masthead__doc">Ops desk</span>
        <span className="masthead__doc mono">{sheetDate(now)} · Madrid</span>
        <span className="masthead__synthetic" title="This board is generated, not real operational data">
          Synthetic feed
        </span>
      </div>

      <div className="figures">
        <Figure
          caption="Critical"
          value={counts.critical}
          note="answer these first"
          alarm={counts.critical > 0}
        />
        <Figure caption="High" value={counts.high} note="before they escalate" />
        <Figure caption="Watch" value={counts.watch} note="no rush yet" />
        <Figure
          caption="Longest wait"
          value={duration(shift.medianFirstReplyMin)}
          note="median, of what is open"
          alarm={shift.medianFirstReplyMin >= 30}
        />
        <Figure
          caption="Lookups saved"
          value={lookups}
          note={`across ${systems} systems, already on this screen`}
        />
        <Figure
          caption="Raised by people"
          value={inbound === null ? "—" : percent(inbound)}
          note={`${openCount} open · the rest from the ops board`}
        />
        <Figure
          caption="Answered from here"
          value={oneScreen === null ? "—" : percent(oneScreen)}
          note={`${shift.answeredFromOneScreen} of ${shift.resolvedToday} closed today`}
        />
      </div>
    </header>
  );
}
