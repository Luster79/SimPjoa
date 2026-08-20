# Findings 2026-08-15 — the TWA160-175 gap is a discontinuity in the trim→equilibrium map

*Evidence document, not instructions. Measured at TWS6, end=+1 unless stated.*

## The question

TWA180 is holdable but cannot be reached oar-free from TWA150. Why, and what
would fix it?

## What it is NOT

Each of these was measured and refuted, in this order:

| candidate | measurement |
|---|---|
| ama too large (ADR 0029's ×1.40) | scaling 0.6–1.4× moves the reach ceiling 0.6° total (158.5→159.1) |
| sail area (source-named 12 m² variant) | +1.0° of ceiling at ~2× the close-hauled capsizes |
| crew to leeward | null; apparent gain was a state heeled 65°, past `phiCapsizeDeg` |
| heel→yaw pair (`heelClrSign`/`yawHeelSign`) | 0.2 N·m against 4.5, at every sign, at 10× the historical coefficient |
| carrot under-modelled | refuted — brail 0→1 bears away 20° and cuts the luffing moment 82.4→2.6 N·m |
| `CDbroadside` too low | raising it fixes CR@180 but **worsens** Di Piazza agreement overall (19/26→16/26): the deficit is in the CURVE SHAPE, not the scale |
| model disagrees with the manual | refuted — 12 manual-compatible trims hold TWA180 (`tackX=0`, carrot, `halyard=0`), best at 0.3° excursion / 97% speed |
| the transit path (step / ramp / staging) | ~20 variants: step; ramps 1–480 s; staged in several orders including the manual's own; via intermediate trims; without settling; closed-loop with lead 3–30°; from starts at TWA110–170. **All** land at 100–111° |

## What it is

**The equilibrium course is a discontinuous function of the trim.**

Two disjoint trim families exist in the deep band:

- **Family A** (`sheet=55, brail=0.6, crewPosX=−1, tackX=+1, stays=1, halyard=1`)
  — one equilibrium at **TWA159.6**, strongly restoring (`dM/dψ ≈ −12 N·m/deg`).
  Released from TWA155, 160, 163, 165, 167, 170, 173 or 175 it returns to
  159.6 every time, with `M(0)` growing monotonically −14.4 → +90.4 across that
  span. It never held TWA165-170; an earlier scan only scored it as doing so
  because 165 sits 5.4° from 159.6, inside that scan's 8° tolerance.
- **Family B** (`halyard=0, tackX≈0, stays=0, sheet 55–110`) — equilibrium
  ~175–180. Its basin starts above ~170: released at TWA165 it falls to 98.

**Between them, nothing.** Moving any single control from A toward B collapses
the equilibrium downward, never upward:

| axis (A→B) | settled TWA at 0 / 0.25 / 0.5 / 0.75 / 1 |
|---|---|
| `sheetDeg` 55→100 | 160 / 94 / 97 / 105 / 114 |
| `crewPosX` −1→0 | 160 / 159 / 158 / 78 / 74 |
| `tackX` 1→0 | 160 / 159 / 90 / 83 / 77 |
| `stays` 1→0 | 160 / 159 / 159 / 158 / 90 |
| `halyard` 1→0 | 160 / 159 / 91 / 84 / 79 |
| all together | 160 / 83 / 84 / 87 / 89 / 92 / 94 / 97 / 98 |

This is a saddle-node bifurcation: as the trim leaves family A the zero of
`M(ψ)` at 159.6 annihilates and the state drops to the next zero near 80–110.
No trim places an equilibrium in **TWA160–175**, so no manoeuvre — however
staged, ramped or closed-loop — can put the boat there. The reach ceiling
(159.6) and family B's basin floor (~170) do not overlap.

## Why the band is empty — the mechanism to attack

At the settled deep states the course-dependent inputs to the yaw balance have
almost vanished: leeway runs 0.75–1.3° and heel ~0.2° across TWA163–175. Every
term that varies with course — the hull's migrating CLR (ADR 0032), the ama's
(ADR 0036), the heel→yaw pair — is driven by leeway or heel and is therefore
near zero there. What remains is set by the trim constants alone, so the
equilibrium is pinned by which trim family is selected rather than moved
continuously by the course.

ADR 0032 is the specific prior art: it recorded that the migrating-CLR
mechanism gets **worse**, not better, at TWA162-174, understood the reason
(settled leeway shrinks as TWA grows there, so force and lever shrink
together), and accepted it as a real trade. That trade was accepted in
2026-08-05, when nothing in the project measured transit reachability. It is
the same band, and it is now known to cost the entire dead-run approach.

**Recommended next step:** re-open ADR 0032's TWA162-174 trade with
reachability as an acceptance criterion, i.e. ask for a course-dependent yaw
term that stays alive as leeway → 0. That is a physics addition with a named
prior decision behind it, not a coefficient to re-pick.

## Method warning for whoever continues this

Ten separate conclusions in this investigation were produced by scans whose
control grids were too narrow, and each read as a physical finding until the
missing axis was swept: `crewPos` capped at 0.3; sheet at 55 (deep holders sit
at ~100); brail at 0.5 (the manual's own deep-course setting is 1.0);
`shroud` never varied; `halyard` never varied; hold tolerance at 15° against a
±10° acceptance band; the starting course never varied. Two of those wrong
conclusions reached committed ADRs before being caught.

**Every scan in this area should state the swept range of every control axis
and justify each omission.** A result is otherwise a statement about the grid,
not about the boat.

> **ERRATUM 2026-08-15 — the gap survives a wide, ramped, state-aware
> re-search, and a ninth candidate cause is refuted.**
>
> `Archive/work-order-2026-08-15-pelny-wiatr.md` (W1) re-measured this gap with
> two independent instruments before adding any physics, per its own risk
> section: `findReachableTrim`'s ramped, full-grid walk (ADR 0046) stalls
> honestly at the TWA170 waypoint on both ends (151.3deg final), and a direct
> ramped re-check of the six ADR 0042 capsize transitions confirms
> TWA160->170/TWS10 still fails on both ends under the same widened search.
> The gap is not a grid artifact.
>
> A ninth candidate was checked and refuted: **windage's own yaw moment**
> (ADR 0047 gives `windageForce()` one, split between a crew-position lever
> and a CG-centred everything-else share — the one force in the budget driven
> by apparent wind angle rather than leeway, so it does not fade in this
> band). Measured at 0.4-2.6 N·m against a 16-90 N·m luffing budget across
> TWA160-175 — correctly signed (verified against the manual's own claim that
> crew aft "lets the canoe weathervane downwind"), two orders of magnitude too
> small. Kept in `/core` as a genuine physics completion; does not close this
> gap.
>
> The manual's own troubleshooting section for "Canoe cannot be made to sail
> downwind" (ch. V) ends its recipe with the paddle — noted as context for
> whether TWA160-175 belongs in the success criterion's scope (the owner's
> call, `docs/README.md`), not acted on here.
