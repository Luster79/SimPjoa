# ADR 0045 — The yard could not swing past the beam

*Date: 2026-08-14*
*Owner-driven: "in the real world deep courses are perfectly possible, I have
seen it with my own eyes." They were right, and the model was wrong.*

## Context

The deep-course ceiling had been recorded as a property of the boat: from a
TWA150 hold, nothing reached past ~159°, and ADR 0044 explained it structurally
— every downwind yaw moment (the sail's leeward CE acting on drive force, the
ama's drag on its `spacing` lever) is **luffing**, each can be driven toward
zero but not reversed, so the boat has no positive bear-away moment at all.

That explanation was correct about the mechanism and wrong about the cause.

Five candidate fixes were proposed and measured, all refuted:

| hypothesis | result |
|---|---|
| ama too large (×1.40 by ADR 0029) | scaling it 0.6–1.4× moves the ceiling 0.6° total (158.5→159.1) |
| bigger sail (source-named 12 m² variant) | +1.0° of ceiling, at ~2× the close-hauled capsizes; benefit did not materialise |
| crew to leeward (`crewPos` < 0) | null; the apparent gain at `crewPos ≤ −0.2` was a state heeled 65°, past `phiCapsizeDeg` |
| heel→yaw pair (`heelClrSign`/`yawHeelSign`) | 0.2 N·m against 4.5, at every sign and at 10× the historical coefficient — it acts through leeway-driven `Fy`, and TWA170's settled leeway is 1.34° |
| carrot under-modelled | refuted, and an erratum was issued on ADR 0044 for claiming it: brail 0→1 bears away 20° and cuts the luffing moment 82.4→2.6 N·m |

## The cause

`core/sheet.js` clamped the commanded sheet to `[0, Math.PI/2]`:

```js
const commanded = clamp(Math.abs(controls.sheet ?? 0), 0, Math.PI / 2);
```

A hardcoded 90° stop, carrying no justification in its comment. And 90° is
precisely where `sin(delta)` — and with it the leeward lateral CE arm that
generates the entire deep-course luffing moment — is at its **maximum**. The
model was pinning the yard at the worst possible angle for bearing away and
reporting the consequence as a limit of the boat.

A crab claw's yard swings forward of the beam on a deep run. Nothing in the rig
stops it square. Past 90°, `cos(delta)` changes sign so the CE swings **forward**
(lee helm) while `sin(delta)` shrinks the luffing arm — both acting to bear away.
This is not new physics; it is the removal of an artificial stop from physics
already present.

## Decision

`sail.sheetMaxDeg`, default **120**, replaces the hardcoded `Math.PI/2` in
`core/sheet.js`. `ui/app.js` reads it for the sheet slider's maximum and for the
keyboard clamp, which carried their own independent hardcoded 90 — without that
the capability would exist in the physics and not on screen.

**120 is not tuned.** Bear-away ceiling from a TWA150 hold, TWS6, both ends:

| `sheetMaxDeg` | 90 | 110 | 120 | 130 | 150 |
|---|---|---|---|---|---|
| ceiling | 159.1° | 178.7° | 179.7° | 179.7° | 179.5° |

A plateau from 110 to 150, not a knife edge; no conclusion rests on the figure.
The true stop is a rigging question — where the yard fouls the shroud or the
mast — that no source in this project answers. If one ever does, this is the
constant to set from it.

## Measured

- **Bear-away ceiling from TWA150: 159.1° → 179.7°**, identical on both ends.
- **Holders within 10°: TWA170 1 → 6, TWA180 18 → 42.** TWA160 unchanged at 10.
- **`out/polar.csv` is byte-identical.** `harness/polar.js` sweeps the sheet
  4–88°, so it never commands past the old ceiling; the change adds capability
  without moving any previously reported speed. No re-anchoring was needed
  anywhere — 102/102 assertions pass unchanged.
- The trims that hold TWA170 sit at `sheet≈100` with `tackX=−1, stays=−1` —
  reversed from TWA150's family, and previously nonexistent because the sheet
  could not get there.

## Consequences

- `findHoldingTrim` (`harness/asserts-helpers.js`) had to be widened twice to
  see the new region, and both gaps were the same error: its sheet list stopped
  at 55 (the deep holders are at ~100) and its brail list at 0.5, seeded from a
  polar optimum that is 0 on deep rows — so **the search never tried the
  carrot setting the manual prescribes for exactly these courses**. Sheets are
  now `…70, 85, 100, 115`, brails `…0.5, 0.75, 1`.
- **`coverage-no-oar.js` still carries the old ceiling** (`SHEET_TRIALS`
  `[35,55,75]`, `--dense-sheet` 15–85). Its 42/42 and the 82/156 transit matrix
  (ADR 0042) were both measured without the sheets past 90° and are therefore
  **lower bounds under the old rig limit**, not current figures. Re-running them
  is open work.
- O9 (`TWA90 → TWA180` walked) improved from stalling at TWA170 to passing
  through it, and now fails on the last leg only: TWA180's independently-chosen
  trim, applied from the TWA160 state, rounds the boat up to 64°. That is a
  formulation limit of the walk — it picks each waypoint's trim without asking
  whether it is reachable from where the boat actually is — not a physics limit;
  the direct measurement reaches 179.7° from TWA150.
- **Lesson, the fifth instance this session.** Four separate search axes were
  found too narrow while chasing this (`crewPos` capped at 0.3, sheet at 55,
  brail at 0.5, the hold tolerance at 15° against a ±10° band). Every one of
  them hid capability the boat already had. `findHoldingTrim`'s trial lists were
  built for close and reaching courses, where the polar optimum is a good seed;
  on deep courses the holding trim is nowhere near the fast one (ADR 0030 said
  so in 2026-08-05) and nobody had revisited the grid. The grids should be
  derived from the control ranges, not extended point by point whenever a course
  fails to solve.
