# ADR 0014 — Sheet steering follows the manual, not the rigid-triangle geometry

*Date: 2026-08-03*

## Context

`Kryteria_Akceptacji_Symulator_Pjoa.md`, drawn from the owner's own primary
source (*„Elementarz żeglowania po Mikronezyjsku"*, pjoa.eu, ch. III), states:

> **AC-3.1** … szot jest mocniej przyciągnięty … dziób łodzi delikatnie
> odchyla się **OD** kierunku wiatru.
> **AC-3.2** … szot jest poluzowany … dziób łodzi zbliża się **DO** kierunku
> wiatru.

Sheeting in bears away; easing points up. The model asserted the opposite, and
had done since round 9.

This is an old question resolved the wrong way, not a new one. Round 4 encoded
exactly the manual's rule (`ceLeverSign = -1`, commented "sheet in bears
away"). Round 9 removed it on the reasoning that a structural lee-helm bias at
`lead = 0.15·L` had been masking the boat's real behaviour. Fixing the bias was
right; the rule went out with it.

The two positions rest on different kinds of evidence, and I could not resolve
them from first principles:

- **Rigid-triangle geometry.** A flat sail pivoting about a tack at the bow has
  its centroid move *forward*, toward the pivot, as it is eased. That gives
  easing → bears away, and it is sound for a flat plate on a pivot.
- **The manual.** A practitioner's description of *this* boat. A crab claw is
  not a flat plate on a pivot: its centre of pressure migrates along the yard
  as the leading-edge vortex develops and the sail powers up, an effect the
  rigid geometry ignores entirely.

The evidence is one-sided in **provenance**, not in physics. The owner has
ruled the manual correct.

## Decision

Reverse the direction the CE travels with trim. In `core/aero.js`:

    swing = -halfChordEff · (1 - cos δ)        // was  -halfChordEff · cos δ

Written as `(1 − cos δ)` rather than by flipping a sign, deliberately: this
leaves the lever's **range** untouched at `lead − halfChordEff … lead` and only
reverses the mapping from δ. A plain sign flip would have moved the neutral by
2·halfChordEff = 0.5 m, and ADR 0011's whole result is that the helm lever
crosses zero inside the tack range — re-centring by hand would have put that at
risk. **`hull.lead` is not retuned.**

Kept switchable as `sail.ceSwingMode` (`'manual'` default, `'geometric'` the
prior behaviour) rather than deleted, because the losing side is a real
argument, not an error.

## Consequences

**The assertion it contradicted is now a real PASS, not an `xfail`.** Across the
same 16-point grid it has always used, the tally went from weather 7 / lee 4 /
capsized 5 to **weather 0 / lee 10 / capsized 6** — a clean sweep, the manual's
direction at every single non-capsized operating point. It had never held
generally in either direction before.

**AC-4.1 was fixed as a side effect.** The main brail alone is supposed to be
purely preparatory and change nothing; it went from 3/6 to **6/6** within ±3°.
Nothing was done to it — it fell out of the CE geometry being right.

**AC-1.2 now matches the manual's second mechanism.** Crew moving away from the
ama turns the bow toward the wind at **6/6** points by direction (five of them
capsize inside the measurement window, which is the same mechanism taken to its
extreme — the ama emerges and loses its righting moment, exactly as the manual
describes).

**AC-1.1 still disagrees, cleanly.** Crew moving *toward* the ama should also
point up; the model bears away at 5 of 6. That is now an isolated, well-posed
disagreement rather than one blurred by a broken sheet response.

**The polar moves everywhere, by very little.** All 41 rows change, since helm
balance changes at every heading and the autopilot's rudder drag with it.
Median 0.00 %, mean +0.23 %, range −0.6 % to +2.8 %. Close-hauled gains most
(TWA 40 / TWS 10: +2.8 %) because the boat needs less rudder there; the fast
reaching rows lose a little (TWA 100 / TWS 10: −0.6 %).

**It cost one operating point of rudder-free course holding.** ADR 0011's payoff
assertion held at 6/6 and now holds at 5/6, losing TWA 110 / TWS 6. Demoted to
`xfail` with its numbers rather than softened to "≥5 of 6": the claim is that a
proa can be sailed on trim alone, and 5 of 6 is not that. Worth noting that
TWA 110 is the same broad-course corner where the withdrawn leeboard also ran
out of authority — twice now, which is a lead rather than a coincidence.

**R15 was retired into an invariant.** The change moved it to 8.4656 against a
[8.47, 8.55] band — a 0.004 m/s miss, and the **eighth** re-anchoring of that
tripwire. Per S7 it is replaced by what it was actually meant to guard: the
reach is the fastest point of sail and beats close-hauled by ≥1.8× (measured
2.38×), at a boat/wind ratio inside the physically derived 0.6–1.0 band
(measured 0.847). Neither needs re-anchoring when the model moves a percent.
