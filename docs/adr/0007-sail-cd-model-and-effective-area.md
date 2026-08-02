# ADR 0007: Composite sail CD model and brail-effective area

Date: 2026-07-30

Supersedes the CD *form* of ADR 0003 (the measured-anchored aero table);
ADR 0003's CL table, its Di Piazza rescaling and its provenance are
unchanged and still authoritative.

## Context

Three findings from `work-order-2026-07-30-physics-audit.md` turned out to be
one problem seen from three sides.

**F7 — induced drag was computed from the wrong CL.** The drag reconstruction
was `CD = CD0 + s * CL_table * tan(alpha)`, using the *table* CL — the value
before camber and before either brail. The working CL was then cut
independently (`* brailWindCLFactor`, `* (1 - 0.7*brailLee)`) and CD by
different multipliers (`* (1 - 0.3*brailLee)`). The induced term therefore
never depended on the lift the sail was actually producing, so the polar
stopped being a polar: two axes moved under independent knobs.

**F3(a) — the same expression collapsed at broadside.** `tan` has a pole at
90 deg, and the table forces `CL(90) = 0` *exactly*, so the product vanished
and CD fell to CD0 = 0.04 in the maximum-drag attitude. (An interim fix
evaluated the term at `min(alpha, 89)`; this ADR removes the need for it.)

**F4 — reefing added power.** `q = 0.5 * rho * sail.area * V^2` used the full
sail area regardless of brail, so a brail could only ever change force
through coefficients. Combined with a camber bonus that peaked exactly at
`brailTrimRange`, measured total aerodynamic force *rose 41 %* going from
`brailWind` 0 to 0.6. Every deep-course row of `out/polar.csv` sat on that
peak (`bestBrailWind = 0.6`), so the downwind calibration rested on it.

**F6 — the camber bonus was far outside its fit range.** `brailCamberGain =
0.45` is a *delta* on top of the table's own 0.10, so `camberCLFactor` was
evaluated at c = 0.55 — a 55 %-of-chord draft, a half-circle, about 4x
outside the c ~ 0.05-0.15 band the linear `1 + 1.75c` fit is valid over.
Only `sail.camber` was range-checked; the gain was unchecked.

## Decision

### 1. CD becomes a standard three-term decomposition

    CD = CD0
       + inducedK * CL_working^2
       + CDbroadside * sin^4(alpha)
       + brailParasiticCD * max(brailLee, brailWind)
       + flogging (unchanged, luffing-window only)

- induced drag is driven by the **working** CL (after camber and brails), so
  the polar is internally consistent — F7's requirement;
- `sin^4` is negligible at the low-alpha calibration point but makes
  broadside genuinely draggy, so there is no pole and no collapse — F3(a)
  permanently;
- the brails' drag effect is an explicit parasitic **addition**. They
  previously *multiplied CD down*, which is why L/D used to rise under heavy
  brail;
- camber's drag cost now arrives automatically through its own CL rise. The
  separate `camberCDf` multiplier (added by F5 earlier in this same audit) is
  subsumed and removed.

**Fit.** `CD0 = 0.0375`, `inducedK = 0.215`, `CDbroadside = 1.06`, least
squares against Di Piazza's four measured Santa Cruz `(CL, CD)` pairs **plus
their reported `L/D_max ~ 5.4` as a fifth constraint**. The fifth constraint
is not decoration: the four pairs alone leave `alpha < 20 deg` unconstrained
(the lowest measured point is at alpha ~ 20.5), and an unconstrained fit
drives peak L/D to **7.6** while still fitting all four pairs well. Residuals
against the pairs are +0.029 / +0.036 / -0.021 / +0.010, inside the +-0.05
digitisation uncertainty the source CSV states.

`sail.s` is deleted — it had no remaining runtime reader.

### 2. Brail acts through effective area

    areaEff = sail.area
            * blend(brailWind: 1 -> areaAtTrimBrail -> areaAtFullBrail)
            * (1 - (1 - areaAtFullLeeBrail) * brailLee)

A brail gathers cloth; the honest model of that is a smaller reference area,
not an opaque CL multiplier. The windward CL multiplier and the leeward CL
cut are removed — they were standing in for this.

**Aggressive variant chosen (maintainer's call):** `areaAtTrimBrail = 0.55`.
A full TRIM-regime carrot keeps 55 % of the working area, so reefing
genuinely depowers. `areaAtFullBrail = 0.20` is picked to land near the old
`CL x 0.2` cut at `brailWind = 1`, so the survival-regime behaviour that T6,
the stop scenario and the squall controller were calibrated against is
preserved at full pull. `areaAtFullLeeBrail = 0.35` likewise tracks the old
leeward endpoint.

### 3. Camber is bounded

`brailCamberGain` 0.45 -> 0.10, and `validateConfig` now rejects
`sail.camber + sail.brailCamberGain + built-in table camber > 0.20`. The
bonus survives as what it was always described as — the TRIM-regime *bagging*
effect, CL x1.15 at low alpha — while the force change from brailing is
carried by area.

## Consequences

- **Reefing now reduces power monotonically.** Verified: total aerodynamic
  force is non-increasing in both brails across [0, 1], and L/D is
  non-increasing in both. Both were *violated* before (force +41 %, L/D
  rising in the TRIM regime and again past 0.8).
- **The no-brail calibration anchor holds.** Peak L/D 5.401 @ alpha 12 vs
  5.298 @ 13 — +1.94 %, inside the +-2 % the work order allows, and closer to
  Di Piazza's own reported 5.4.
- **CD is monotonic in alpha** for alpha >= 8 deg and `CD(90) = 1.098 >= 1.0`.
  The only non-monotonic stretch is alpha in [0, 2], the deliberate
  luffing-flogging ramp, which predates this change.
- **The polar moves, substantially and by design.** Deep courses lose the
  free power the fixed-area model was giving them. Speed bands and
  deep-course acceptance criteria are re-anchored in the same commit; the
  numbers are in `docs/findings-2026-07-30-physics-audit.md`.
- **`out/polar.csv` regenerated**, and the CI byte-gate fails once by design.
- **F3(b) is settled by consequence:** the CD column of both aero CSVs is now
  definitively not read by any runtime path. It is kept, and its cross-check
  kept, as an *integrity/provenance* check on the shipped file — verifying it
  has not been silently edited — not as a claim that runtime consumes it.
  This is stated at the cross-check so the test no longer reads as coverage
  of a live code path.

## Alternatives rejected

- **`CD0 + s*CL^2/k` alone** (the work order's own suggestion). With `k`
  derived analytically it does preserve the anchor exactly — but it
  re-introduces the F3(a) collapse from the other side: at alpha = 90,
  CL = 0, so induced drag vanishes and CD returns to CD0. A separation term
  is required, not optional.
- **Fitting only the four measured pairs.** Under-constrains alpha < 20 deg;
  peak L/D runs to 7.6 (see above).
- **Capping `brailCamberGain` without an area model.** Removes the spurious
  power gain but leaves the brail with no physical mechanism at all, and
  still leaves induced drag driven by the table CL.
