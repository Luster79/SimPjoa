# ADR 0032 — The hull's centre of lateral resistance migrates with drift angle

*Date: 2026-08-08*
*D1 of `Archive/work-order-2026-08-05-statecznosc-kierunkowa.md`. Builds on D2-D4
(`Archive/findings-2026-08-08-directional-stability.md`), which cleared the
Munk moment, the ama's own term, and fore-aft symmetry as the source of the
measured zero hull yaw stiffness, leaving the hull's fixed CLR as the one
place left to look.*

## Context

Measured directly: at neutral trim, `dM_hull/dTWA` is 0.00-0.20 N·m/deg across
TWA70-160 — no real directional stiffness. The cause is structural:
`stationWeights`' taper is fixed once crew trim and heel are set, so at r=0
every station sees identical leeway, the strip sum factors, and the hull's
whole yaw moment reduces exactly to `clrX·Fy` with a **fixed** `clrX`. A real
slender body's lateral centre of pressure is not fixed.

**Source route (a) closed.** The owner supplied the full Flay, Irwin & Viola
2025 paper (`data/sname-jst-2025-15.pdf`); read in full (23 pages, to the
bibliography), it carries no yaw-moment or CLR data at any angle — the Gifford
dynamometer used (its Fig 4) has two channels, X (drag) and Y (side force)
only, the towing plate rigidly fixed at one point. This is not a digitization
gap; the study never measured it.

**Source route (b) closed.** The Clarke/Gedling/Hine manoeuvring regression
ADR 0018 already cites is unavailable to the owner, and even found would be
disqualified by ADR 0009's data contract as currently used (quoted from memory,
no file in `data/`) and would sit outside its own fitted range (B/T 2-4
against this hull's B/T≈1.4) regardless.

Route (c) — geometric derivation from slender-body theory — is what follows.

## Decision

Split each station's `CS(leeway)` into two parts and give them different
spatial weightings:

- **`CS_lin = min(CS, csV2A·λ)`** — the small-angle reference slope ADR 0004's
  own digitized fit already carries. Weighted by the EXISTING taper
  (`stationWeights`, unchanged): this is what the model already does at small
  angles, where it was not the diagnosed problem.
- **`CS_vtx = CS - CS_lin`** — the remainder, i.e. the part responsible for
  CS's superlinear growth, which ADR 0004 attributes to a strengthening
  vortex-lift mechanism (not a stalling foil). Zero at leeway=0 by
  construction, growing to dominate CS as leeway grows.

A vortex that strengthens with angle also strengthens as it convects along the
hull: weak where it forms (the leading end, in the direction of travel —
`uDirection`, not a fixed hull end, since this is a flow-development effect
and has to reverse with sternway the same way `FxStrip`'s own direction term
already does), strongest at the trailing end, which has had the whole hull
length to develop it. `CS_vtx` is weighted by a **linear ramp**, 0 at the
leading end to 2× the flat per-station share at the trailing end — the
simplest non-degenerate, parameter-free shape (no new tunable magnitude, only
the existing measured CS curve reused; total area budget preserved, same
discipline as the existing taper). Its centroid is `L/6` aft of the geometric
midpoint — materially further aft than the existing `clrX` (`L·0.05/2 = L/40`).

As leeway grows, more of the force routes through the aft-ramped term, so the
blended centroid migrates aft — the missing mechanism.

## Measured consequence: a real trade, not a clean win

Swept `dM_hull/dTWA` across TWA50-178 (trim neutral, TWS6), before/after:

- **TWA94-158°: stiffness roughly doubles, consistently, at every one of 16
  sampled points.** This is the mechanism working as intended.
- **TWA162-174°: stiffness gets WORSE**, not better (TWA170: −0.299 →
  −0.431 N·m/deg).

**Why the sign flips there, understood, not guessed.** Near TWA162-174 the
settled leeway itself *shrinks* as TWA grows (approaching the dead run, where
a fore-aft-symmetric hull's natural equilibrium leeway is zero). `CS_vtx`'s
share of CS shrinks with leeway too, so both the force and the (now
leeway-dependent) lever arm shrink together as TWA increases through this
band — compounding the moment's own decline rather than opposing it. At
TWA94-158 leeway grows with TWA, so the same mechanism compounds favourably
instead.

**Practical consequence, verified directly**: release trials at the exact
trims `docs/adr/0030` found holding TWA165-180 rudder-free (300 s window)
— most of them now fail (TWA165/170/175/180 at TWS6, TWA170/175 at TWS10 all
drift back 80-100°). This is not the mechanism failing outright: a fresh
parallel search (10800 candidates, two-stage 60s-filter/300s-verify) under the
new physics finds holding trims at **every** TWA/TWS point tested, most
strongly clustered around a `sheet=90, tack=−1, brailWind=0, stays=−1,
crewPosX=+1` family:

| | TWS6 holders | TWS10 holders |
|---|---|---|
| TWA165 | 7 | 10 |
| TWA170 | 13 | 24 |
| TWA175 | 128 | 119 |
| TWA180 | 215 | 198 |

TWA165-170 genuinely narrows (single-digit to teens, down from the dozens
`docs/adr/0030` found); TWA175-180 has *more* options than before. The old
trim card's deep rows need republishing against these new values — the
capability ADR 0030 established is not lost, the specific settings that
deliver it changed.

## Capsize-margin re-validation (Part IV's own precondition)

Measured the three capsize-threshold scenarios directly, before/after:

| scenario | threshold before | threshold after | asserted probe |
|---|---|---|---|
| T6 gust peak | 11.90/11.95 survive/capsize | 11.85/11.90 | 11.85 — still survives both sides (25.8°→33.0°) |
| `scenarioAback` | 13.4/13.6 | 13.8/14.0 | 14 — still capsizes both sides |
| `scenarioThroughGybeAback` | 12.0/12.5 | 12.0/12.5 | **unchanged** |

All three checks pass unmodified; no probe point crossed its own threshold.
T6's own margin narrowed slightly (0.05 m/s); the aback scenario's raw
threshold rose but its margin from the asserted probe narrowed (0.6→0.2 m/s
buffer) — noted, not acted on, since the check itself still passes with room.

## H3 re-anchored — a qualitative change, not just a number

`H3` (parked hull, beam-on, sail furled) genuinely changed character, not just
value. Before D1 this state is a sustained limit-cycle yaw oscillation
(period ~90 s, matching the check's own prior description) that never damps
out inside the 180 s window. After D1 the same oscillation **damps out**,
converging to a steady beam-on drift by ~t=140 s — real evidence the added
stiffness does something, verified by tracing `u,v,r,TWA` through the full
180 s both ways, not inferred from the mean alone. The sampled window now
catches a decaying transient plus a longer steady tail at a higher settled
speed (mean 0.535 → 0.801 m/s). Band widened `[0.2,0.8] → [0.2,0.9]`, with
margin around the new mean rather than narrowed to it — a genuinely decaying
state is less repeatable near its own tail than a sustained cycle was. The
TWA window (it lies beam-ish, does not sail off) is unchanged.

## Consequences

- `core/hydro.js`: `stationWeights` gains a `dAFlat` field (untapered
  per-station share); `hullSideForce` gains the migrating-CLR term. No new
  config knob — the mechanism is geometrically fixed, not tunable.
- `out/polar.csv`: 78 of ~84 rows shift, but only marginally (≲0.2%) — D1 is a
  moment-redistribution mechanism, not a force-magnitude one, and the
  straight-line polar search sits at r≈0 where that distinction matters least.
  All `out/*.csv` scenario exports regenerated to match.
- `H3` re-anchored (above); no other assertion needed a band change.
- The deep-course trim card (published separately) needs its TWA165-180 rows
  replaced with the values this ADR's search found — the old rows no longer
  hold under the new physics.

## What this does not settle

The ramp's shape (linear, 0-to-2×) is an explicit assumption, not a fit or a
measurement — Flay's source has no growth-rate data for this mechanism at any
angle, confirmed above. A different, still-defensible shape (e.g. one that
does not shrink to zero contribution as leeway shrinks toward the dead run)
might avoid the TWA162-174 trade entirely; this was not attempted; the linear
ramp was accepted as the simplest non-degenerate choice, not the only
possible one, and the trade it produces was measured and reported rather than
designed around.
