# ADR 0036 — The ama's centre of lateral resistance migrates too

*Date: 2026-08-09*
*K5 of `Archive/work-order-2026-08-09-kryterium-bez-wiosla.md` (= S11 of
`Archive/work-order-2026-08-02-steering-and-sources.md`). Rusza polarę.*

## Context

S11's original premise — carried from the 08-02 work order into K5 — was
that `amaDrag` (`core/hydro.js`) gave the ama a single-strip side force,
unlike `hullSideForce`'s multi-station integration. Re-reading the current
code before touching it found that premise stale: T4
(`Archive/work-order-2026-08-05-sterownosc.md`) already gave the ama an
11-station strip integration (`AMA_STATIONS`), with its own side force and
yaw moment. `ARCHITECTURE_physics_core_EN.md`'s own "Known simplifications"
section said so in its body while its own heading still read "a single
strip, not a fore-aft distribution" — a stale, self-contradicting line, fixed
alongside this change.

The real remaining gap, once T4's actual state was established: the ama's
strip integration used a *flat* `CS(leeway)` at every station, so its own
centre of lateral resistance stayed fixed at the geometric centroid — the
same limitation D1 (ADR 0032) found and fixed for the hull, one round
earlier.

## Decision

Reuse D1's mechanism verbatim, at the ama's own length and its own flow
direction. `amaDrag`'s per-station loop now splits `CS` into a linear
reference share (`csLin = min(CS, csV2A*lambda)`, carried by the existing
flat station weight) and a vortex remainder (`csVtx = CS - csLin`, carried by
a station weight ramped from 0 at the leading end to 2x flat at the trailing
end, using the ama's own `uDirection` since a shunt or near-zero surge can
have the ama's flow direction disagree with the hull's). No new tunable
constant — the same `hull.csV2A` the hull's own split already reads.

## Measured effect

**Polar:** sub-0.1% speed change at every point (e.g. TWA90/TWS6:
3.4790->3.4792 m/s) — expected, since the term acts on side force and yaw
moment, not longitudinal drag.

**Fast suite:** 88/88 unchanged, no regressions (T4's own checks, the
ama/hull drag-ratio anchors R7-4a/R15, F1, all pass with slightly shifted
numbers).

**K2 coverage** (`Archive/coverage-no-oar-2026-08-09.txt`): **20/45 before,
20/45 after — same total, different 20.** `TWA80/TWS6` gained (NONE ->
HOLDS, 0.8deg excursion); `TWA170/TWS10` lost (HOLDS -> NONE). A real trade,
the same shape D1 itself produced on the hull (ADR 0032: "roughly doubles
yaw stiffness TWA94-158, costs TWA162-174 — a real trade, understood not
fixed"), not a null result and not evidence the mechanism does nothing.

**K3** (`harness/asserts-course-change.js`): unaffected in outcome — the same
one of six checks holds (bearing away, `end=1`) before and after.

## Consequences

- `out/polar.csv` regenerated and committed alongside this change, per the
  repo's own byte-gate convention.
- `ARCHITECTURE_physics_core_EN.md`'s ama bullet under "Known simplifications"
  rewritten to state the current mechanism accurately (multi-station,
  migrating CLR, two deliberately-omitted terms) rather than the stale
  "single strip" framing.
- The net-neutral coverage number is a caution for `docs/parameter-register.md`-
  style future work: a mechanism can be a genuine, correctly-reasoned
  physical addition (verified against D1's own precedent, no new tunable)
  and still not move the top-line criterion number, because it trades one
  operating point for another rather than adding coverage outright. Whether
  that trade is the "right" one is not resolved here — it would need the
  same kind of judgement call D1's own ADR left open for TWA162-174.
