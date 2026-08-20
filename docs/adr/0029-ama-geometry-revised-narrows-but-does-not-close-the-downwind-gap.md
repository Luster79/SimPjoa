# ADR 0029 — Ama geometry revised; narrows but does not close the downwind gap

*Date: 2026-08-05*
*Refines 0026-0028: those found the model's downwind steering mechanisms were
sound but data-starved. This ADR revises the data, not the model, and reports
how far that goes. Full methodology and search log:
`Archive/work-order-2026-08-05-boat-data.md`.*

## Context

`0026`-`0028` established that the model's downwind steering mechanisms
(carrot, rig trim, ama hydrodynamics) work as the manual describes, but that
TWA 155-175 fails to hold rudder-free. Before spending more of the physics
budget there, the owner asked whether the *boat's own data* — never measured,
several fields explicitly flagged as scaled guesses since ADR 0021 — might be
the actual gap, not the model.

`ama_length_m` and `ama_buoyancy_kg` carried this disclaimer from ADR 0021:
scaled from the *whole-boat* length ratio (5.0/5.5), the buoyancy by the CUBE
of that ratio (a volume-scaling rule meant for resizing one boat by one
ratio, not for independently re-deriving one float's own dimensions). Nothing
published constrains the ama's own length or displacement.

## Decision

Revise the ama's length, buoyancy, and wetted surface together, linearly (same
cross-section, longer float), by the smallest scale factor that closes the
practically-reachable downwind range: **×1.40**.

| Parameter | was | now |
|---|---|---|
| `ama_length_m` | 3.2 | **4.48** |
| `ama_buoyancy_kg` | 60.0 | **84.0** |
| `ama.wettedSurface` | 0.5 (literal) | `0.5 * (length/3.2)` |
| `ama.residuaryPeakCr` | 0.006 (equal to hull's) | **0.0024** (×0.4, a separately-estimated coefficient, not `formFactor`) |

`ama_mass_kg` (13 kg, the one measured ama figure) is untouched. The ama
remains shorter than the 5.0 m hull (4.48 m).

Bounds respected: `ama.formFactor` was **not** touched (stays at 1.2, inside
the ITTC-57/Prohaska 1.1-1.4 band for slender bodies) — raising it to buy
steering authority is exactly round 7's mistake, and the project's own lesson
against compensating in the wrong parameter. `hull.massSway` — measured as the
single most effective lever in this search — is **explicitly not touched**:
it collides with ADR 0018's finding that Clarke's own regression implies this
coefficient should be *higher*, not lower, and raising it would reverse four
of the manual's steering rules. Left alone by direct owner decision.

## Consequences

**TWA 150 and TWA 170-180 now hold rudder-free.** Verified both by the
zero-crossing scan and by direct 400 s release trials (not just the
short-window drift proxy).

**Three checks re-anchored, all the same "re-find the same physical state"
pattern ADR 0021 already used** for the aback scenario's own wind speed and
the T6 gust peak — the stiffer, harder-to-submerge float pushes an
already-marginal threshold just under its old line, without removing the
mechanism the check exercises:

- `AC-5.3` (aback detection): TWS 6 → 8. Measured directly: TWS 7 already
  detects, TWS 8 clears with margin.
- `R15` (ama drag force at max immersion, `harness/asserts.js`): absolute
  band `[4.6,5.0]` N → `[4.9,5.3]` N (same 0.4 N width). Measured 4.81 → 5.07
  N. The R7-1 ratio anchor this check is also justified by is untouched and
  still satisfied.
- `scenarioThroughGybeAback` (H2, `harness/scenarios.js`): TWS 10 → 14, the
  same value `scenarioAback` already uses for the identical reason. Measured
  threshold between 12 (survives) and 13 (capsizes).

**TWA 155-165 does not close.** A full (non-1D) grid search of all six trim
controls — 216 combinations × 2 wind speeds × 6 TWA points — found zero
combinations with a stable equilibrium in that range; the closest approach
was still outside it (TWA 150). Fine-grained `M(TWA)` sampling at 1° steps
shows why: the rudder-free yaw moment is monotonically positive from 145° to
167°, dipping negative only in a narrow 168-169° band whose basin of
attraction (verified by 400 s release trials, not just the zero-crossing that
first suggested otherwise) does not reach down to 155-165. This is a
structural feature of the moment curve, not a search that stopped early — see
the work order for the sampled curve and search log.

**`C-A`/`C-C` keep their `xfail:STEERING` tags**, now with TWA 150/170-180
closed and only the 155-165 remainder documented as a structural finding
rather than an open search.

## What this does not settle

`hull.massSway` remains the one measured lever that would close the gap, and
remains untouched. `hull.beam`/`hull.draft` remain unpublished (ADR 0021's own
open item). No new lateral-plane element (leeboard/fin) was added — withdrawn
by ADR 0013 as not this boat's fit.
