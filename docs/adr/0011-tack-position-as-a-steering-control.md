# ADR 0011 — Tack position as a steering control

*Date: 2026-08-02*

## Context

The model had no way to steer with the rig. Its whole helm balance rested on
one constant, `hull.lead`, and the lever that constant sets could not reach
zero at any trim:

    lever(delta) = lead - halfChordEff·cos(delta) = 0.33 - 0.25·cos(delta)

Since `lead` (0.33 m) exceeds the entire trim-driven excursion
(`halfChordEff`, 0.25 m), the lever is **positive by construction** — it runs
0.080 m at delta=0 to 0.330 m at delta=90 and never crosses. The sail could
modulate the *size* of a yaw moment but never its *direction*. That, rather
than "the claim is fragile at some operating points", is the structural reason
`xfail:STEERING` could not hold: which way the boat turned was decided by
whichever competing term (crew, heel coupling, Munk, ama drag) happened to
win.

Worse, `lead` was calibrated on a knife edge — round 10d found the drift's own
sign flips between `0.065·L` and `0.070·L`, a 2.7 cm window, while the
modulation it was supposed to serve spans 25 cm.

The literature describes the missing mechanism plainly. Dierking has the
yard's heel on an endless tack line, sliding under the gunwale and dragged
from one bow to the other at a shunt, with adjustable fore-and-aft mast rake.
Proafile notes that a fixed-halyard bridle "removes some of the flexibility of
moving the centre of effort, both fore and aft and vertically" — designers
treat the movable CE as a feature they can choose to give up. On a 5.5 m hull
that is CE travel of order half a metre, several times the model's entire
trim-driven excursion, and through zero.

## Decision

Add `controls.tackX`, −1…+1, the rig's fore-aft position, and put it into
`xCE`:

    xCE = clrXNeutral + lead + end·tackX·tackTravel - halfChordEff·cos(delta)

with `sail.tackTravel = 0.5 m` (9 % of LWL) as the half-range.

**It is referenced to the active bow**, hence the `end` factor: at a shunt the
tack walks to the new bow and the rake reverses with it. Without that factor
the boat would come out of every shunt with its helm balance mirrored.

**`tackX = 0` is bit-identical to the pre-S2 model**, verified directly — an
absent `tackX` and `tackX = 0` produce the same forces. The control adds
authority; it does not restate the neutral.

**The authority was measured before the control was written.** A tack offset
is mathematically the same displacement of `xCE` as perturbing `hull.lead`, so
sweeping `lead` over ±0.6 m priced the mechanism exactly, with no new code.
That measurement predicted the sign, the magnitude, and the location of the
zero crossing, and the implementation reproduced all three.

**`tackTravel` is an estimate, and unlike `lead` an untroubling one.** The
helm's zero crossing sits within 0.3 m of neutral at every one of
TWA 70/90/110 × TWS 6/10, so 0.5 m of travel covers it about twice over
everywhere. The value decides how much authority is left *beyond* neutral, not
whether neutral is reachable — and the response to it is monotone and smooth,
not a sign flip inside a 2.7 cm window.

**The polar searches it** on TWA ≤ 70, rather than freezing it at 0. Freezing
would have reported a boat sailing with its helm permanently out of balance,
and the measured cost of that is real: the best `tackX` is worth +3.45 % of
speed at TWA 45 and +0.92 % at TWA 70, against +0.00 % at TWA 90 and +0.11 %
at TWA 110. The 70° cutoff and the exclusion of negative settings are both
measured, not assumed — tack-aft *loses* close-hauled (−5.4 % at TWA 45) and
its best showing anywhere is inside the search's own noise. Negative remains
fully available as a control; it just never wins a steady-state speed contest,
which is the only question the sweep asks.

## Consequences

Twelve rows of `out/polar.csv` change — exactly the TWA ≤ 70 rows the search
covers — and all get faster: +4.5 % at TWA 40 / TWS 6, +8.1 % at TWA 50 /
TWS 10. Nothing at TWA ≥ 80 moves.

Three new assertions. The mechanism steers: tack aft points up relative to
forward by 24–50° over 10 s at all six grid points, against an acceptance bar
of 2°. The lever changes sign inside the tack range at all seven trims tested.
And — the payoff — **at every one of the six operating points there is now a
tack setting that holds the course with the rudder released**, 0.8–10.8 ° over
60 s against round 10d's original 15 ° ceiling, at 97–105 % of speed.

That last one is what "`hull.lead` stops being a knob" actually amounts to.
The value is untouched. It simply no longer has to be right, because the boat
can trim out whatever bias it leaves.

`xfail:CALIBRATION` moves 0.558 → 0.583 as the boat stops dragging its oar
sideways close-hauled. Still failing, still reported.

**S1a is left failing rather than redefined.** It measures the boat at the
speed-optimal trim with the tack at neutral, and there it still wanders
19–52°. Feeding it the balancing tack setting would turn it into a different
and weaker question. It stays as the honest record of what the boat does with
the new control left alone, and now points at the check that shows what the
control buys.

**What this does not fix.** S1b — oar shipped — still fails at every point,
still capsizes at all three TWS 10 points, and **no tack setting rescues it**
(best case 13.4° but at 26 % of speed). Balancing the helm removes a steady
bias; it does not create directional *stability*, which is what the
shipped-oar case is missing. The boat still gets its course-keeping from a
0.15 m² blade on the stern. That is S3's job, and this ADR does not claim
otherwise.
