# ADR 0035 — Parameter register: closed by source vs. free in band

*Date: 2026-08-09*
*K6 of `Archive/work-order-2026-08-09-kryterium-bez-wiosla.md`.*

## Context

The project's success criterion (`docs/README.md`) grants a licence:
physical characteristics may be manipulated "within a limited range — in
particular where a characteristic is unknown or known only approximately."
The project's existing conventions (`docs/README.md`, "Conventions worth
knowing") cover *how* to re-anchor an assertion once a value changes
(measure the whole grid, report the tally, never re-pick a probe until it
agrees) but say nothing about *which* constants are allowed to change at
all. Without that boundary, a change like K4 (re-testing `heelClrSign` at a
new sign) is indistinguishable from tuning `hull.lateralArea` until a test
passes — both are "changing a number in `config.js`" — even though one is
licensed by the criterion and the other would mean quietly drifting the boat
away from the real PJOA FOLK.

## Decision

`docs/parameter-register.md`: every tunable constant in `core/config.js`
classified as **CLOSED** (fixed by a source — the manual, Di Piazza, Flay,
the PJOA FOLK CSVs, or a rigorous physical derivation; changing it needs an
ADR and a citation) or **FREE (band)** (the underlying physical quantity is
unknown or known only approximately; changing it inside the stated band
needs only reporting the effect on the polar and, once `harness/coverage-
no-oar.js` exists, on its coverage number).

A constant's class does not depend on whether its current value came from a
fit or a hand-set estimate — `sail.deltaMinDeg` is CLOSED despite being a
derived expression, because its *inputs* are sourced; `hull.lateralArea` is
FREE despite having a documented derivation, because the derivation leans on
a V-section angle borrowed from a different hull. Classification judges
licence to move a value, not correctness of its current one.

Three constants are flagged as the highest-value FREE candidates for the
work order's own Block B (K4/K5): `hull.heelClrShiftCoeff`,
`hull.heelClrSign`, `sail.yawHeelSign` — all currently 0, all tested at
exactly one nonzero magnitude (T3), pre-dating both D1 (ADR 0032) and heave
(ADR 0033).

## Consequences

- Future physics work should consult the register before treating a
  `config.js` value as available to move. A constant not yet listed should
  be added, not silently treated as free.
- The register itself needs re-review whenever a new data source is added
  (a new CSV, a newly digitised curve) — a constant currently FREE for lack
  of a source becomes CLOSED once one exists, the same direction ADR 0009
  already established for `data/`.
- This is documentation, not a code or behaviour change; no test coverage is
  affected.
