# ADR 0037 — Mast shadow completes the sheeting floor

*Date: 2026-08-09*
*L4 of `docs/work-order-2026-08-09-domkniecie-kryterium.md`. Rusza polarę.*

## Context

`sail.deltaMinDeg` (ADR 0010) is a rope-reach floor only: whether the sheet
can physically pull the yard's clew in far enough. On the PJOA FOLK (8 m²
sail, 5.0 m hull, ADR 0021) that floor evaluates to exactly 0 — the spar no
longer overhangs the hull — so nothing stops the yard from sitting flush
against the centreline. ADR 0010 itself named two other rig constraints its
formula does not model (the windward shroud, the tack's position) and
explicitly considered a third mechanism, mast shadow, deciding against it:
*"a trimmed yard never sits in the narrow small-delta band such a term would
act on... it would have no consumer."* That was true on the 12 m²/5.5 m boat
`deltaMinDeg` was 10.7° on. It is not true here.

A geometric derivation of the shroud constraint was attempted first and
abandoned: `example_proa_parameters.csv` has no mast height or shroud
attachment point, only `CE_height_m` (the sail's own centroid height, not the
mast's) and `beam_overall_m` (the ama's spacing). Deriving a collision
geometry from data this thin would be exactly the "ILL-CONDITIONED... weak
claim about a particular boat" `deltaMinDeg`'s own comment warns against.

## Decision

Add the mast-shadow term ADR 0010 declined to add, now that it has a
consumer. `sail.mastShadowWidthDeg` (8°) and `sail.mastShadowCLFactor` (0.15)
in `config.js`; mechanism in `aero.js`'s `sailCoefficients()` — CL fades
linearly from `(1 - mastShadowCLFactor)` at `delta=0` to `1.0` at
`delta=mastShadowWidthDeg`, zero effect beyond that band.

**Explicit estimate, not a measurement** — no wind-tunnel or field data on
this rig's own mast-blanketing loss exists. Same status as `deltaMinDeg`'s
own value: the *constraint* (a mast ahead of the sail blocks flow near
head-to-wind trim) is a solid claim about any masted rig; the *magnitude* is
a weak claim about this one. Not tuned to hit a coverage target.

## Measured

Fast suite: 88/88, no regressions. Dead angle (TWS6): ~17° before and after
(no qualitative change — the model's dead angle was never *at* delta=0, it is
set by drive/drag balance well before the sheet reaches its floor). Speed
cost at the tightest sheeting: TWA40/TWS6 2.326 → 2.283 m/s (-1.8%), with
`bestSheetAngle` moving 4° → 8° at the affected close-hauled rows — the
optimizer visibly avoiding the shadow band rather than sitting in it.
`out/polar.csv`: only TWA 40-50 rows changed at any wind speed; TWA ≥ 60
untouched.

Combined with L5 (pitch), K2's official (narrow-search) coverage snapshot
moved 20/42 → 21/42 — one point (TWA170/TWS10). L4 alone was not isolated
against K2; its effect there is folded into that combined delta.

## Consequences

- `docs/parameter-register.md`: `sail.mastShadowWidthDeg`/`mastShadowCLFactor`
  are FREE (band) — explicit estimates, same class as `deltaMinDeg`'s own
  value.
- If a future boat variant's `deltaMinDeg` becomes nonzero again (a longer
  spar or shorter hull), this term's practical effect shrinks toward zero on
  its own, the same way ADR 0010's own mechanism did — no interaction code
  needed between the two.
