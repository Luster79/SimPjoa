# ADR 0023 — The tack control reversed at every shunt

*Date: 2026-08-04*

Third instance of the same defect. See ADR 0016 for the first.

## Context

`aero.js` composed the sail's fore-aft CE position as

```
xCE = clrXNeutral + lead + tackOffset + swing + ceBrailXShift + xHalyard + xRake
```

Every term is in the **active-bow frame** — `+x` points at whichever end is
currently the bow — and every term carried no `end` factor. Except one:

```js
const tackOffset = state.end * (controls.tackX ?? 0) * tackTravel;
```

The comment defended it: *"referenced to the ACTIVE bow, so it flips with
`end`. At a shunt the tack walks to the new bow and the rake reverses with
it."* That is the same argument, in almost the same words, that ADR 0016 had to
remove from the steering oar's lever arm. It confuses the tack moving to the
other end of the **hull** with the coordinate needing a sign change in a frame
**that has already flipped**.

The consequence: `controls.tackX` — the rig's fore-aft position, which ADR 0011
introduced as *the proa's primary steering control* — meant "toward the bow" on
one shunt and "toward the stern" on the other. It is also the strongest trim
control the boat has, worth −136 N·m of bear-away against the stays' −111 and
the crew's −82.

## Why the suite did not catch it

The two end-symmetry checks added in ADR 0016 run **every trim control at
neutral**. With `tackX = 0` the spurious factor multiplies zero, and the
asymmetry is invisible. The checks were written to catch the oar, and they did;
they were not written to exercise the controls.

Measured on the same free run those checks use:

| | end +1 | end −1 |
|---|---|---|
| neutral | dTWA 65.9, v 1.18 | dTWA 65.9, v 1.18 |
| **tackX = +1** | **dTWA 36.7, v 2.57** | **dTWA 75.0, v 0.47** |
| **tackX = −1** | **dTWA 75.0, v 0.47** | **dTWA 36.7, v 2.57** |
| stays = +1 | dTWA 44.2 | dTWA 44.2 |
| crew aft | dTWA 42.6 | dTWA 42.6 |
| halyard eased | dTWA 75.9 | dTWA 75.9 |
| shroud slack | dTWA 69.5 | dTWA 69.5 |

An exact mirror: `+1` on one end does what `−1` does on the other. Every other
control — including `stays`, added the same day without an `end` factor — is
symmetric.

## Decision

Drop the `state.end`. `tackOffset = tackX * tackTravel`.

**Add a third end-symmetry check that exercises the controls**, one at a time
off neutral: tack both ways, stays, crew fore-aft, halyard, shroud, windward
brail. Seven cases, all symmetric now.

## Consequences

**The start-up defaults are unchanged**, and that is the point: they run at
`end = +1`, where the spurious factor is `+1` and the bug is invisible. Nothing
in the polar moves either — the sweep is an `end = +1` search. The defect lived
entirely on the other shunt, which is exactly the half of the boat that no
default, no polar and no calibration ever visited.

**8 of 108 settings still hold** the start-up course rudder-free, and the best
is unchanged at 2.3°. A new option appears at 3.5° with the crew **fully
amidships** fore-aft.

**For the sailor**: the boat's strongest steering control worked backwards on
half of all courses. Anyone who shunted and then tried to bear away with the
tack was luffing instead.

## The pattern, stated for the fourth time

Three defects, one shape: a quantity referenced to the active bow, given an
`end` factor it does not need, in a frame that already flips.

1. **ADR 0016** — the steering oar's lever arm. Shipped for four rounds.
2. **ADR 0019/0020** — the mast rake. Avoided *by construction*, because 0016
   had just been written and its lesson was fresh.
3. **This one** — the tack. Survived 0016 because the symmetry checks 0016
   introduced only tested the oar.

The lesson is not "check both ends" — that was already learned. It is that a
regression check written against one defect tests **that** defect, and a
symmetry invariant is only worth what its inputs exercise.
