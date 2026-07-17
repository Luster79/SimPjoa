# ADR 0002: Correct the ama drag form factor to the physical ITTC/Prohaska range

Date: 2026-07-18

## Context

`core/hydro.js`'s `amaDrag()` scales the ama's ITTC-57 skin friction by a
`(1+k)`-style form factor (`ama.formFactor`). The standard ITTC/Prohaska
range for a slender body is 1.1-1.4. Round 7 (R7-1) set this to **3.3** —
2-3x that range — explicitly and admittedly to keep one steering test
(`T1: crew toward the ama turns to windward`) correctly signed
(`ROUND7_DECISION.md` D-1: "the minimum ama-drag authority that keeps T1's
... steering leg correctly signed"). Round 7's own findings report
(`ROUND7_steering_regression_findings.md` §4-5) was explicit that this was
a stopgap: "every channel actually grounded in the boat's real geometry is
roughly an order of magnitude too weak to overcome the CE-lever term ...
Round 5's T3/T4 never really validated the CE-lever's own direction" — and
recommended a real steering-model rebuild once reference data (Irwin,
Flay et al. 2023's Csf/Crm coefficients) was available.

## Decision

Correct `ama.formFactor` to **1.2** (mid the physical 1.1-1.4 range). Real
proa steering is dominated by the sail CE/hull CLR balance and the
steering oar, not by outrigger drag (`ROUND9_physics_fidelity_work_order.md`
R9-3) — ama drag should not be inflated to serve as a steering-authority
crutch.

No reference data (Irwin/Flay et al. 2023) was available in this working
environment to complete the CE/CLR geometry rebuild the work order also
requested (removing `core/aero.js`'s `ceLeverSign` empirical flip by
deriving the correct sign from first-principles geometry). That flip is
left in place, explicitly documented in `core/aero.js` as an open TODO
rather than a resolved derivation — per the work order's own instruction:
"if a sign flip is still needed after a correct derivation, the geometry
is still wrong."

## Consequences

- The R7-4a drag-ratio hard-anchor bands (`harness/asserts.js`) are
  re-derived: the old `[0.10,0.30]` (static) / `[0.4,1.0]` (max immersion)
  bands are only reachable with `formFactor` at 3+ — they were an artifact
  of accommodating the unphysical value, not an independent physical
  constraint. New bands `[0.05,0.15]` / `[0.15,0.45]` bracket the physical
  1.1-1.4 range (measured static 0.086-0.109, max 0.267-0.340) with margin.
- **T1 (both legs) now fails outright** — not just weakens, but flips sign
  (verified: toAma drift -1.2deg, awayAma drift +1.1deg, both wrong).
  Retagged `xfail:STEERING` with a diagnosis: ama-drag was never a
  legitimate mechanism for this maneuver; if the Pjoa manual's claimed
  response is real, it comes from a different channel (crew weight
  shifting trim/heel and its coupling to the sail CE, not simple immersion
  drag) that this model doesn't yet capture. This is an honest regression
  from removing a crutch, not a new bug.
- **T5** ("windward brail lowers rudder workload downwind") also lost its
  signal — the yaw-hunting baseline it measured against has become
  noise-level now that the ama-drag/CE-lever terms it was compensating for
  are physically scaled. Retagged `xfail:STEERING` (see
  `ROUND9_physics_fidelity_findings.md` for the trim sweep that confirmed
  no meaningful baseline exists anywhere nearby).
- T2/T3/T4 (which don't depend on ama-drag authority) remain correctly
  signed and in-band.
- Determinism (R6-1) and all shunt/roll/capsize assertions unaffected.
- Open item, explicitly not resolved here: a first-principles derivation
  of `ceLeverSign` (and a real mechanism for T1/T5's claimed behavior)
  needs the reference data this ADR's Context section names. Tracked as a
  future-round item, not silently dropped.
