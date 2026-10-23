/**
 * The loading state: the frame, before the data lands.
 *
 * The chrome and the pre-printed labels paint immediately and only the values arrive late.
 * Nothing pulses, because a shimmering skeleton on a screen somebody stares at all day is
 * noise rather than feedback.
 */
const CAPTIONS = [
  "Critical",
  "High",
  "Watch",
  "Longest wait",
  "Lookups saved",
  "Raised by people",
  "Answered from here",
];

const ROW_FIELDS = ["Issue", "Raised by", "Route", "Waiting", "Stop"];

export function BlankSheet() {
  return (
    <div className="sheet" aria-busy="true">
      <div className="column">
        <header className="masthead">
          <div className="masthead__title">
            <span className="masthead__mark">Vamo</span>
            <span className="masthead__doc">Ops desk</span>
          </div>
          <div className="figures">
            {CAPTIONS.map((caption) => (
              <div className="figure" key={caption}>
                <span className="cap">{caption}</span>
                <span className="figure__value" style={{ color: "var(--ink-3)" }}>
                  —
                </span>
              </div>
            ))}
          </div>
        </header>

        <section className="command">
          <div className="command__line">
            <span className="command__caret" aria-hidden="true">
              &gt;
            </span>
            <span className="command__input" style={{ color: "var(--ink-3)" }}>
              Reading the queue…
            </span>
          </div>
        </section>

        <main className="manifest">
          {[0, 1, 2, 3, 4].map((index) => (
            <div className="block" key={index} data-spent="true" aria-hidden="true">
              <div className="fields">
                <div className="field field--seq">
                  <span className="field__val">{String(index + 1).padStart(2, "0")}</span>
                </div>
                <div className="field field--risk">
                  <span className="cap">Pri</span>
                  <span className="field__val">—</span>
                </div>
                {ROW_FIELDS.map((caption) => (
                  <div
                    className={`field field--${caption.split(" ")[0].toLowerCase()}`}
                    key={caption}
                  >
                    <span className="cap">{caption}</span>
                    <span className="field__val">—</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </main>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        Loading the issue queue.
      </p>
    </div>
  );
}
