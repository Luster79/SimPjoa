# Round 8 findings — physical capsize criterion, evidence pack

Response to `ROUND8_physical_capsize.md`. Covers what changed, the phi
traces for every replaced test, and the final xfail ledger.

## R8-1: the mechanism

`core/stability.js`'s `updateAback()` no longer has an overload timer.
The flying side (phi>=0) capsizes purely when `state.phi` crosses
`phiCapsizeDeg + capsizeTriggerMarginDeg` (50 + 15 = 65deg) — safely past
the capsizing-arm reversal (`rollRestoreMoment`'s own ramp-through-zero,
unchanged since round 5) so `integrate()`'s existing freeze-on-capsize
(R5-2.2) catches the boat visibly rolling past the point of no return,
not the instant it goes unstable. The aback side (phi<0) is byte-for-byte
unchanged — still a 6s timer past buoyancy saturation, per R8-1(b) ("this
mechanism is already physical").

`overloadTimer` is retired from state entirely (not renamed-in-place):
nothing needed the accumulated duration anymore once the trigger became a
per-step phi check, so `state.js`, `integrator.js`, every harness fixture
initial-state literal, and `replay.js`'s CSV schema all drop the field.
The UI's "AMA FLYING" tag (amber, mirroring LUFFING/STALLED) is derived
live from `state.phi>=0 && forces.amaLoad>1.0` — no stored state, no
countdown, matching "amaLoad>1 is a WARNING, not a countdown."

## R8-2: re-run evidence

### The two physical-equivalent unit tests (replacing the old timer tests)

- **Heel moment pinned beyond max restoring capacity** (1.5x
  `Mmax`=613N*m, the ama-weight liftoff plateau): no equilibrium short of
  the reversal exists, so phi runs away on its own and crosses the
  trigger at **t=3.5s** — "physically plausible, order seconds" as R8-2
  asked, not a specific number to hit.
- **Transient gust to amaLoad~1.3** (1.3x Mmax applied for 1.2s, then
  removed): peaks at amaLoad=1.31, phi returns to 0.23deg — recovers
  cleanly, no capsize. Flying the ama transiently is confirmed to be a
  normal, non-catastrophic event now, matching the round's own framing
  ("real proas fly the ama routinely as a controlled technique").
- Aback mirror check: unchanged, still capsizes in the 5.5-7.5s window.

### T3 ("trimming the sheet in"), traced over 90s locked

This is the exact trim that capsized at ~36s under round 7's overload
timer (`ROUND7_steering_regression_findings.md` sec 6). Re-run under the
physical trigger:

```
t=20.0  heading_drift=  0.0  phi= -0.6
t=25.0  heading_drift= -6.4  phi=  3.5
t=30.0  heading_drift=-14.2  phi=  6.7
t=35.0  heading_drift=-20.4  phi= 11.7
t=40.0  heading_drift=-20.9  phi= 21.3
t=45.0  heading_drift=-17.6  phi= 18.8
t=50.0  heading_drift=-20.4  phi=  9.2
t=55.0  heading_drift=-21.8  phi= 23.3
t=60.0  heading_drift=-17.0  phi= 21.1
t=65.0  heading_drift=-20.0  phi=  8.3
t=70.0  heading_drift=-21.3  phi= 23.0
...     (repeats, bounded)
t=105.0 heading_drift=-16.8  phi= 18.6
```

amaLoad cycles up to ~2.0 (genuinely flying) but phi is **bounded**,
oscillating roughly 8-24deg — nowhere near phiCapsizeDeg=50, let alone
the 65deg trigger — and heading drift is correspondingly bounded around
-17 to -22deg, not a runaway spin. This is the "finds a flying
equilibrium" outcome R8-2 anticipated, not "slowly escalates toward the
reversal." **No capsize over 90s. `xfail:STABILITY` removed** — the
promotion trap fired by design; this document is the reference for
lifting it (see `harness/asserts.js`'s T3 section).

### R7-4b replay fixture, re-run

`recordings/simpjoa-recording-20260716-155817.json` replayed against the
current core:

```
t=111.0  phi= 4.24   r=0.06 rad/s
t=113.5  phi= 8.03   r=0.08
t=116.0  phi=11.54   r=0.10
t=117.8  phi=16.64   r=0.12
t=119.1  phi=21.24   r=0.12
t=119.7  phi=22.74   r=0.12   <- peak
t=120.9  phi=20.92   r=0.10
t=122.1  phi= 9.74   r=0.07
```

`capsized=false` for the whole 122s recording (round 7: capsized at
t~118.3s). maxPhi=23.0deg — the same bounded-flying-equilibrium pattern
as T3, same session, independently confirming the mechanism.

**But** the R7-4b sub-check "no sustained (>0.5s) |r|>4deg/s with rudder
centered" still fails: `worstSustainedBadRun=10.96s` (peak |r|=7.12deg/s
at t=118.8s). This is now a **different finding** than round 7's — it's
the yaw-rate symptom of the same bounded phi oscillation (heading swings
through a large arc as phi climbs and falls back), not an overload/
capsize escalation. Retagged `xfail:STEERING` (not STABILITY) with an
updated diagnosis: whether the 4deg/s-over-0.5s bound is the right shape
of assertion for a boat that legitimately "hunts" a bit while flying the
ama is a genuinely open question, not resolved here — round 8 was scoped
to the capsize criterion, not this bound. The other R7-4b sub-check
(sustained crab angle) and R7-4c (general round-up bound) are unaffected
and still pass.

### T6 (panic rule), strengthened

Previously released the sheet at amaLoad~0.9 ("before the overload timer
could fire" — meaningless now that there's no timer). Re-tuned to release
at amaLoad~1.2, a genuinely later/more marginal panic, and added a direct
phi_max check:

- Held sheet (no release): capsizes at t=8.2s, maxPhi=65.0deg (hits the
  trigger exactly, as expected for a boat driven hard with no
  intervention).
- Release at amaLoad~1.2: does not capsize, **maxPhi=15.95deg** — the
  panic rule arrests phi growth at less than a third of phiCapsizeDeg
  (50deg), comfortably before the reversal, even releasing this much
  later than round 7's 0.9 threshold. The panic rule has real teeth now
  that capsize isn't an arbitrary 2s away regardless of how the trim
  responds.

### Squall scenario controller

Its threshold controller (`harness/scenarios.js`) was already written
against `state.amaLoad`/`state.phi` directly (0.75/0.6/1.0 thresholds),
never against the retired timer — so it needed no retuning. Re-run:
`capsized=false`, `maxPhi=26.5deg`, `maxAmaLoad=3.23` (the controller
lets the ama fly hard momentarily under the gust ramp but corrects well
short of the reversal). No changes made; reporting per R8-2's ask.

## R8-3: broach-cliff re-derivation

The old test's TWA=50/crewPos=0.5 probe point turned out to be a "boom as
a lever" power regime (tighter sheet is BOTH faster and MORE heeled there
— the opposite of a pinching/stall story — right up to its own genuine
cliff between sheet=15-19deg, where course is lost outright). A beam
reach (TWA=90, TWS=6, crewPos=0.3) shows the classic pinching/stall
tradeoff cleanly instead, with its own cliff at sheet=26deg for scale:

| sheet (deg) | mean speed (m/s) | mean phi (deg) | course held |
|---|---|---|---|
| 27 (over-trimmed) | 3.606 | 10.30 | yes |
| 32 (well-trimmed) | 3.625 | 4.21 | yes |
| 26 | capsizes | — | — |

Over-trimmed sails measurably slower and heels more than well-trimmed,
both hold course — the honest round-1-style criterion, now passing
outright. `xfail:STEERING` removed.

## R8-4: polar bands

Tagged `xfail:CALIBRATION` (new tag). Values unchanged from round 7
(`ROUND7_steering_regression_findings.md` sec 8): TWA-40 ratio 0.458 vs
the 0.35 band; TWS6/TWA90 speed 3.63 vs the 3.6 m/s ceiling, both
reported there as the best achievable with physically-plausible sail
parameters that don't break other established behavior (head-to-wind,
T3-eased). No new work this round — just correctly categorized as a
tracked, promotion-guarded known limitation instead of a bare reported
FAIL.

## Final xfail ledger

```
node run_tests.js
...
66/66 assertions passed.

KNOWN MODEL LIMITATIONS (expected-fail, tracked):
  [xfail:CALIBRATION] no meaningful progress below ~50deg TWA
  [xfail:CALIBRATION] speed at TWS=6, TWA=90 within [2.0, 3.6] m/s
  [xfail:STEERING] T1: crew away from the ama turns to leeward
  [xfail:STEERING] R7-4b: replay fixture — no sustained (>0.5s) |r|>4deg/s
ALL TESTS PASSED. (4 known limitation(s) tracked as xfail, all still
failing as expected.)
```

Two `xfail:STEERING`, two `xfail:CALIBRATION`, **zero `xfail:STABILITY`**
— better than the round doc's own anticipated end state ("1-2 STEERING
xfails at most, 2 CALIBRATION xfails"), since both prior STABILITY
findings resolved to passing rather than staying open. Suite exit code
0.
