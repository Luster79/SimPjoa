# ADR 0015 — The ama's missing wave drag, and the brail's missing CE shift

*Date: 2026-08-03*

## Context

The owner's manual (`docs/sources/`, ch. III) names a specific mechanism for
each of its steering rules. Two of those mechanisms were absent from the model,
and their absence had been papered over twice.

**The ama had no wave-making resistance.** `amaDrag` computed ITTC-57 skin
friction and nothing else, while the main hull has had friction *plus* a
bounded residuary hump since R9-1 (ADR 0001, 0006). That asymmetry is not
defensible: the ama is a slender displacement body dragged through the surface
exactly like the hull, and being *shorter* it sits at a **higher** Froude
number at any given boat speed — 0.68 against the hull's 0.54 at 4 m/s. A float
that makes no waves at 8 knots is not a physical float.

This had been compensated for in the wrong place, twice. Round 7 raised
`ama.formFactor` to 3.3 — two to three times any physical (1+k) — explicitly
because it "was the minimum ama-drag authority that kept T1's crew-toward-ama
steering leg correctly signed". Round 9 correctly refused that and cut it to a
physical 1.2, and in doing so dropped the steering criterion as unphysical. The
manual says the criterion is real and names this exact mechanism: *"the ama
sinks (creates drag) and rotates the canoe around"*. Both rounds were right
about their own point. The missing piece was never the form factor; it was that
half the float's resistance did not exist.

**The windward brail had no CE shift of its own.** The manual: *"Pull this
brailing line, which hides behind the sail … More you let the wind to spill
over rear part of sail, more the bow shall turn off the wind."* Spilling the
leech removes area from the *back* of the sail, so the CE moves forward and the
boat bears away. The model's only path from `brailWind` to `xCE` was shrinking
the trim swing's amplitude — and ADR 0014's reformulation then multiplied that
by `(1 − cos δ)`, collapsing it to 1.8 cm at δ = 40°, which is exactly where
the brail criteria are measured. Zeroing the heel→yaw coupling was the
decisive test: it left AC-4.2a just as wrong, which is only possible if the
brail's own mechanism was effectively absent and its bear-away was riding the
heel term.

## Decision

**Give the ama the same residuary model the hull has** — same functional form,
same Froude hump shape parameters, scaled on the ama's own immersion-dependent
wetted area, with `ama.residuaryPeakCr` set *equal* to the hull's 0.006. Equal
is the conservative choice, not a flattering one: the ama is the stubbier body
of the two.

**Give the brail its own forward CE shift**, `sail.ceBrailXShift = 0.167 m` at
full brail, independent of trim — the manual states no trim dependence. Sized
as `chord/6`, the centroid shift from spilling the rear third of the chord.

## Consequences

**The ama is still under-dragged against this project's own anchor.** R7-1
requires ama drag to be 10–25 % of hull drag at static immersion and 50–80 % at
maximum. Measured at u = 1.6 m/s it was 9 % / 29 % before this change and is
9 % / 38 % after — still short of the target at both ends. The change moves
*toward* the documented anchor, not past it, and parity is not approached at
any speed from 1.6 to 6 m/s. That is the strongest evidence that this is a
correction rather than an authority grab.

**AC-4 goes green.** The breaking brail bears the bow away at 6/6 operating
points (was 4/6) and grows monotonically with the pull at 5/6 (was 3/6), while
the main brail alone still changes nothing at 6/6.

**The polar slows by about 1 %** — median −0.93 %, worst −4.7 % at
TWA 50 / TWS 10 — because the float now makes waves. A straightforward drag
addition with no shape change.

**Two assertions moved.** The ama-drag band is re-anchored on the R7-1 ratio
evidence above rather than on the new number. `C-A` (dead-run release, rudder
free, < 20°/min) is demoted to `xfail`: the drift went 18.6 → 35.5°/min, and
the manual prescribes the *paddle* for exactly this case — *"for downwind
steering courses, when the sail creates too much weather helm for weight-shift
steering to be effective"*. A released rudder on a dead run is not a
configuration the source claims is holdable, so that ceiling asserts something
the manual does not. Left failing with its number rather than relaxed to fit.

**AC-1 is still not satisfied, and this ADR does not claim it is.** With both
mechanisms now present and correctly scaled, the crew-lateral group still needs
`yawHeelSign = -1` and the brail group still needs `+1`. Strengthening each
group's own mechanism was necessary and was not sufficient: the heel→yaw
coupling still dominates both. The remaining suspect is that term itself —
`yawHeelSign · end · CEheight · sin(φ) · Fx` puts the entire heel-to-yaw
response in the *rig*, while the dominant real mechanism is the asymmetry of a
heeled *hull*, which the model does not represent at all. That is the next
thing to look at, and it is a new term rather than a re-scaling of this one.
