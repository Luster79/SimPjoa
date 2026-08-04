# ADR 0018 — The Munk moment is not double-counted

*Date: 2026-08-04*

Supersedes the open question ADR 0017 left at its end. It does not change
0017's decision or any of its findings.

## Context

ADR 0017 closed by naming a suspicion rather than acting on it: the hull's side
force comes from Flay's **measured total** CS, while the Munk moment
`(m_x − m_y)·u·v` is added on top from ideal-flow added mass, so the two might
partly double-count. If true, that would explain why the boat still cannot hold
a course with the steering oar shipped at three of six grid points — the model
would be inventing destabilising moment it had already measured.

It matters because the Munk term is not a detail. At the reference state
(u = 3.87, v = −0.217) it is +382 N·m against the hull's own −46, and it is
what the steering oar's −315 exists to fight.

## What was measured

**The decomposition is the standard one and is not degenerate.** For a closed
slender body, potential flow produces the Munk moment with *zero net force*;
the viscous cross-flow produces force at the planform centroid. The model
assigns exactly one mechanism to each: Flay's CS is superlinear in leeway with
no saturation, which is a vortex-lift signature (viscous), and it enters as
force at the area centroid. The two are not the same quantity counted twice.

**The combined value is below an independent estimate, not above.** Compared
against the Clarke/Gedling/Hine linear yaw-moment derivative `N_v` for a bare
hull, the model's total destabilising moment (Munk plus the hull's own) sits at
a **constant 0.65** of it across every state tried:

| state | model (Munk + hull) | reference `N_v·u·v` | ratio |
|---|---|---|---|
| u 3.87, v −0.217 | +336 N·m | +512 | 0.66 |
| u 3.0, v −0.30 | +352 | +549 | 0.64 |
| u 5.0, v −0.30 | +601 | +915 | 0.66 |
| u 2.0, v −0.15 | +118 | +183 | 0.65 |

A double-count would show up as a ratio above 1. This is the opposite result.

**Provenance, stated plainly:** those regression coefficients are quoted from
memory, not from a file in `data/`, and they are a *ship-hull* fit
(B/T 2–4, C_B 0.55–0.85) extrapolated to this hull's B/T = 1.4 and C_B ≈ 0.45.
Under ADR 0009's data contract that disqualifies them as a calibration anchor —
they are used here as an order-of-magnitude cross-check and nothing else, which
is why **no assertion is anchored on them.**

## The by-product: the added mass is half the textbook value

The shortfall traces to one line. `addedSwayPerLength` is `ρ·π·T²/4`,
described in its own comment as a "2D cylinder analogy". The derivable value
for a plate-like surface-piercing section — the free surface acting as the
image plane, which is what this hull's B/T = 1.4 deep V is close to — is
`ρ·π·T²/2`, twice that; the same Clarke regression's `Y_v̇` implies about 1010 kg
of added sway mass where the model carries 455.

**It was tried, and it is not adopted.** Doubling it breaks four of the owner's
manual's own steering rules:

| check | before | with the doubled added mass |
|---|---|---|
| sheet trimmed in bears away | lee 10 / weather 0 | **lee 1 / weather 9** — reversed |
| windward brail bears away | −6.5° | +1.2° — reversed |
| crew forward luffs | +2.1° | +1.4° — fails |
| crew aft bears away | −2.2° | −1.5° — fails |
| parked hull drift (H3) | 0.43 m/s, TWA 89–116 | 0.19 m/s, TWA 112–113 — pinned |

The hull's own destabilising moment grows until it swamps every trim control
the manual describes, and the boat stops obeying the source it is calibrated
against. The manual outranks a ship-hull regression extrapolated far outside
its range (`docs/README`, "The primary source"), so the manual wins.

## Decision

**Nothing changes in the model.** The Munk term stays, the added mass stays,
and ADR 0017's open question is closed as *not* the explanation.
`core/config.js` records the audit at `addedSwayPerLength` so the next person
does not re-derive it.

## Consequences

**The remaining S1c failures need a different explanation.** They are not an
artefact of inflated destabilising moment — the model has *less* of it than the
literature would give, not more.

**The likeliest reading is that there is nothing to explain.** A bare slender
hull is directionally unstable; that is ordinary naval architecture, and it is
precisely why this boat carries a steering oar. The manual claims weight-shift
and sail-trim steering works, and the model agrees on three of six points; it
does not claim the boat holds any course indefinitely with the oar out of the
water.

**What would settle it is still a measurement, and still the same one.** Flay's
yaw moment — where the measured side force acts — was never digitised. It would
replace both the area-centroid assumption and the recalled regression above
with one anchored number. That remains the next acquisition.
