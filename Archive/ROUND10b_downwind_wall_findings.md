# Round 10b findings report — the downwind wall

Status: D1-D4 attempted and landed, each in its own commit as required.
Full test suite: 74/74 assertions pass (69 pre-round + 5 new D4 checks),
1 known limitation tracked as xfail (unchanged, pre-existing, unrelated to
this round). TWS=6 polar essentially unchanged before/after (see §5) —
these were targeted downwind-specific fixes, not a general retune. Bundle
fidelity spot-checked directly. No determinism regression.

## 0. Baseline: probes A-D could not be reproduced literally

The round doc's probe table (fixed/saturated rudder, no stated initial
condition) does not reproduce as literally described from any initial
condition tried: a cold start (freshState, full rudder+sheet applied at
t=0) produces an unrelated violent transient (NaN/capsize) rather than
the doc's "stuck at TWA 140, u=0.38"; settling first on a stable reach
and then applying a SUSTAINED saturated rudder also capsizes (the boat's
capsize dynamics accelerate unboundedly past the trigger — a separate,
pre-existing characteristic, out of this round's scope).

The recorded ground truth (`recordings/kurspelny.json`) is pure-trim
sailing (`rudder=0` throughout, sheet the only active control) — the
probe table was re-cast to match that shape directly: settle on a
tight-ish reach, ease sheet/brail with rudder pinned at 0, report the TWA
reached. This reproduces the qualitative symptom cleanly (easing rounds
the boat up; strapped trim holds deepest) even though the absolute
numbers don't match the doc's literal A-D figures. All three fix commits
(D1/D2/D3) re-ran this same probe table for a direct before/after
comparison; see each section below and the commit messages for the
numbers.

## 1. D1 — ceSwingFraction comment/value contradiction (docs/adr — none;
folded into the commit)

`git log -p -- core/config.js` shows `ceSwingFraction: 0.5` is the ONLY
value ever committed, from the very commit (round 7, `2491d72`) that
also introduced the comment claiming "0.2 is empirically landed against
the D-6 target". There is no commit history where 0.2 was ever the
active, tested value — the claim was wrong from the moment it was
written, not a later regression. The referenced tests (T1/T3/T4/T5) were
also since retired/redesigned by the R9 follow-up.

Verified directly: at 0.5, today's "Sail steers: trimming the sheet in
points up" probe drifts 2.3deg (clears `steeringOk`'s 2deg floor); at
0.2 it drifts only 0.17deg — would fail outright. **0.5 is what's
actually validated; the false "0.2" provenance claim was dropped, not
restored.** This is a documentation-only fix — the value did not move.
Added a startup range assertion (`validateConfig`) for
`sail.ceSwingFraction`, which previously had none.

Full suite: 68/68 (unchanged, as expected).

## 2. D2 — carrot (windward brail) mechanism audit (`core/aero.js`)

`ceBrailShift`'s xCE shift survives the round-10 CE rebuild correctly
(T4 / "Sail steers: windward brail bears away" both still pass with a
non-noise magnitude). But `yCE` was untouched by `brailWind` — only
xCE's swing term shrank. The existing comment justified this via a
round-5 bookkeeping argument ("shrinking both cancels through
ceLeverSign"), not a physical one.

Physically, spilling the sail's rear/upper area gathers its remaining
working area back toward the yard's pivot (the tack) — this shrinks the
CE's excursion along the yard in BOTH the fore-aft and lateral
directions, not just fore-aft. Unified `xCE`/`yCE` to derive from the
same effective half-chord (shrunk by `ceBrailShift*brailWind`), each
projected onto cos(delta)/sin(delta).

Measured effect (rudder=0 probe table, TWS=6, wind fixed at TWA160):

| probe | before D2 | after D2 |
|---|---|---|
| A (eased 70deg, no carrot) | rounds up to 121.4 | 121.4 (unchanged) |
| B (eased 70deg, carrot 0.6) | rounds up to 134.8 | **137.7** |
| D (strapped 8deg, no carrot) | rounds up to 142.9 | 142.9 (unchanged) |

Carrot's round-up-reducing margin over no-carrot grows from 13.4deg to
16.3deg. Downwind (TWA165) autopilot rudder workload, carrot 0 vs 0.5:
before 0.00456→0.00400 (12% reduction), after 0.00456→**0.00339** (26%
reduction). T5 ("windward brail lowers downwind rudder workload") was
fully retired by the R9 follow-up (ADR 0002) for lack of a measurable
baseline; revived as a direct assertion in `harness/asserts.js` now that
this fix gives it a real, measurable signal.

Full suite: 69/69 (68 previous + revived T5), no regressions.

## 3. D3 — rudder.coeff grounded (`docs/adr/0005`)

`rudder.js`'s `CL(deflection) = coeff*sin(deflection)` stays in the
small/moderate-angle range for the whole 35deg mechanical travel (no
stall branch), so `coeff` is properly matched against a low-AR lifting
surface's SLOPE (Helmbold's formula), not a stall CLmax. AR~1-2 spans
1.48-2.60/rad; the AR=1.5 midpoint gives 2.09 (rounded 2.1) —
independently cross-checked against Hoerner's measured CLmax~1.0-1.2 for
AR~1-2 flat plates at high AoA: `CL(35deg)=2.1*sin(35deg)=1.20`, inside
that range. Full derivation in `docs/adr/0005-rudder-coeff-low-ar-blade.md`.

`rudder.coeff`: 1.75 → 2.1 (+20%). The felt-halving's original ergonomic
motivation ("reacted too sharply") is a UI input-shaping concern, left
as an unimplemented follow-up (no UI complaint was raised this round to
act on) rather than re-litigated by weakening the coefficient again.

Full suite: 69/69, no regressions from the increased rudder authority.
Probe table (rudder=0 scenarios) is unaffected by D3, as expected (D3
only changes rudder force, and the probes hold rudder at 0).

## 4. D4 — downwind acceptance tests (`harness/asserts.js`)

Five new direction-strict, magnitude-loose checks:

- **D4-1**: sheet eased to the polar-optimal deep trim at TWA165
  (`computePolar`'s own search: sheet=88deg) + carrot 0.5 holds TWA
  165±10 for 60s under the autopilot, mean|rudder|=0.0044 (well under
  the 0.5 ceiling), speed=2.91 m/s (above half the TWA120 polar speed,
  2.17 m/s).
- **D4-2**: dead run (TWA175, own polar-optimal sheet=60deg) holdable
  without sternway — minU=1.005 m/s throughout.
- **D4-3**: at TWA150, polar-optimal eased trim (sheet=68deg, 3.317 m/s)
  beats a strapped-amidships trim (sheet=8deg, matching the recording's
  own recipe, 3.265 m/s) — the drag-run exploit is no longer the fastest
  deep mode.
- **D4-4a/b**: `recordings/kurspelny.json` as a genuine replay fixture
  (same pattern as R7-4b — replayed under its own frozen
  `configSnapshot`, so this stays a stable regression check independent
  of future physics retuning). 4a confirms the recorded strapped
  equilibrium (max TWA 137.33) remains reachable, unregressed. 4b runs a
  new eased(35deg)+carrot(0.5) pure-trim recipe from the same starting
  state/wind under today's live config, reaching TWA 149.75 — deeper
  than the recording's own 137.3 max.

Full suite: 74/74 pass.

## 5. TWS=6 polar, before vs after (D1+D2+D3+D4 combined)

| TWA | before bestSpeed/sheet | after bestSpeed/sheet |
|---|---|---|
| 40 | 2.76/4 | 2.76/4 |
| 50 | 3.18/4 | 3.19/4 |
| 60 | 3.57/4 | 3.57/4 |
| 70 | 4.02/8 | 4.02/8 |
| 80 | 4.23/20 | 4.23/20 |
| 90 | 4.22/28 | 4.22/28 |
| 100 | 4.35/32 | 4.35/32 |
| 110 | 4.43/36 | 4.43/36 |
| 120 | 4.35/36 | 4.35/36 |
| 130 | 3.88/40 | 3.87/40 |
| 140 | 3.57/52 | 3.57/52 |
| 150 | 3.32/68 | 3.32/68 |
| 160 | 3.12/20 | 3.12/20 |
| 170 | 2.94/48 | 2.94/48 |

Essentially unchanged (two rows differ by <=0.01 m/s, floating-point-
level noise from the small rudder-authority change during the search's
settling phase). This is expected and reassuring: `computePolar`'s own
search (`bestForHeading`) never varies `brailWind`, so D2's carrot fix
cannot show up here; D1 didn't change any value; D3 only affects rudder
force, not the zero-net-rudder steady state the polar reports. The
actual improvement this round targets is downwind-carrot-specific and is
demonstrated in §2 and D4 above, not in the general polar diagram — this
round was surgical, not a retune.

## 6. Bundle fidelity spot-check

Rebuilt `dist/simulator_standalone.html` (`node tools/bundle.js`) after
the `core/config.js`/`core/aero.js` changes. Scenario: windDir=250,
windSpeed=6, sheet=70, brailWind=60 (probe B's TWA160/carrot0.6 setup),
10 single-steps (1/60s each) from Reset. Direct-core reference
(`createSimulator`+`step`): TWA=160.008deg, speed=0.238kn, yard=15.0deg.
Bundled page HUD after the same sequence (pause before touching sliders,
set controls, Reset, single-step with double-rAF yields between clicks —
established methodology): TWA=160, speed=0.2kn, yard=15 — exact match at
displayed precision, no console/page errors.

## 7. Scope notes / not done this round

- The capsize-dynamics blowup found while trying to reproduce the round
  doc's literal saturated-rudder probes (§0) is a genuine, separate
  characteristic (unbounded growth past the capsize trigger rather than
  the documented freeze-and-bleed behavior) — out of this round's scope
  (downwind trim, not capsize dynamics), not investigated further here.
- D3's ADR flags UI input shaping (rudder slider slew/expo) as the right
  channel for any future "too sharp" ergonomic complaint; not implemented
  since no such complaint was raised this round.
