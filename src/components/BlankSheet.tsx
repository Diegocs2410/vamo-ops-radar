/**
 * The loading state: the stock before anything is struck into it.
 *
 * An unfilled form is exactly what this world looks like while it waits, so the frame,
 * the perforation and the pre-printed captions all paint immediately and only the data
 * arrives late. Nothing moves, because a pulsing skeleton on an ops screen is noise.
 */
const CAPTIONS = [
  "Critical",
  "High",
  "Watch",
  "Median lead time",
  "Caught first",
  "Precision",
];

export function BlankSheet() {
  return (
    <div className="sheet" aria-busy="true">
      <div className="perforation" aria-hidden="true" />

      <div className="column">
        <header className="masthead">
          <div className="masthead__title">
            <span className="masthead__mark">Vamo</span>
            <span className="masthead__doc">Delivery exception manifest</span>
          </div>
          <div className="figures">
            {CAPTIONS.map((caption) => (
              <div className="figure" key={caption}>
                <span className="cap">{caption}</span>
                <span className="figure__value" style={{ color: "var(--ink-ghost)" }}>
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
            <span className="command__input" style={{ color: "var(--ink-ghost)" }}>
              Reading the board…
            </span>
          </div>
        </section>

        <main className="manifest">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <div className="block" key={index} data-spent="true" aria-hidden="true">
              <div className="fields">
                <div className="field field--seq">
                  <span className="field__val">{String(index + 1).padStart(2, "0")}</span>
                </div>
                <div className="field field--risk">
                  <span className="cap">Risk</span>
                  <span className="field__val">—</span>
                </div>
                <div className="field field--consignment">
                  <span className="cap">Consignment</span>
                  <span className="field__val">—</span>
                </div>
                <div className="field field--consignee">
                  <span className="cap">Consignee</span>
                  <span className="field__val">—</span>
                </div>
                <div className="field field--shipper">
                  <span className="cap">Shipper</span>
                  <span className="field__val">—</span>
                </div>
                <div className="field field--window">
                  <span className="cap">Window</span>
                  <span className="field__val">—</span>
                </div>
                <div className="field field--projected">
                  <span className="cap">Projected</span>
                  <span className="field__val">—</span>
                </div>
                <div className="field field--driver">
                  <span className="cap">Driver</span>
                  <span className="field__val">—</span>
                </div>
              </div>
            </div>
          ))}
        </main>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        Loading the delivery exception manifest.
      </p>
    </div>
  );
}
