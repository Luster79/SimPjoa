# ADR 0034 — The success criterion becomes a measured property

*Date: 2026-08-09*
*K1-K3 of `Archive/work-order-2026-08-09-kryterium-bez-wiosla.md`.*

## Context

The project's success criterion (`docs/README.md`, "The success criterion"):
any course obtainable and permanently holdable without the oar. Before this
round nothing in the package measured that claim directly. Six scattered
checks (`S1a/S1b/S1c/S2` in `harness/asserts-polar-helm.js`, `C-B/C-C` in
`harness/asserts-deep-course.js`) each tested a heading-excursion band over a
fixed 60-120s window, always starting the boat already parked on the target
course under the autopilot. Two gaps followed directly from that shape:

1. **"Holds within N deg over M seconds" is not the same claim as "holds
   permanently."** A trim that drifts 9.7deg in 60s (inside a 15deg band)
   can still be diverging — measured directly (work order Part I.2): one
   trim passed the existing 60s/15deg test and kept drifting to 15.6deg by
   600s, with a genuinely destabilising yaw moment (`dM/dpsi > 0`) at the
   point it had been judged to "hold."
2. **Nothing measured *obtaining* a course at all**, only holding one already
   reached. The criterion's first half — steering the boat from one heading
   to another using trim alone, oar shipped throughout — had no check.

## Decision

**K1 — `holdsCourse()` (`harness/asserts-helpers.js`).** A course "holds" only
if, in addition to the existing excursion/speed/capsize band:
- `converged`: the heading drift accumulated in the window's last third is at
  most a third of the drift accumulated in its first third (decaying, not
  constant or growing, per-segment drift);
- `restoring`: the total yaw moment at the settled state, read directly from
  `computeForces()` with no further integration, has a **negative** slope
  with respect to heading (`dN/dpsi < 0` — a nudge is pushed back, not
  amplified).

Wired into `S1a/S1b/S1c/S2` and `C-B/C-C` in place of the excursion-only
band, narrowing each rather than replacing it (S1b uses `converged` only —
it holds no fixed target heading, so a restoring-moment reading at an
arbitrary drifted-to heading is not the same claim as the others'). Effect,
measured on `538eb07` before vs. after (all still `xfail:STEERING`):

| check | before | after |
|---|---|---|
| S1a | 2/6 | 1/6 |
| S1b | 0/6 | 0/6 |
| S1c | 4/6 | 4/6 (different points — TWS6/TWA70's old winning trim failed the narrower test; a different trim from the same 15-trial grid took over) |
| S2 | 5/6 | 3/6 |
| C-B | 0/2 | 0/2 |
| C-C | 1/2 | 0/2 (TWA140's -7.9deg/min average was masking a non-converging oscillation) |

No threshold was loosened to compensate — per the work order's own rule,
coverage was expected and allowed to fall.

**K2 — `harness/coverage-no-oar.js`.** A single coverage number over the
whole polar (TWA 40-180 step 10, TWS 4/6/10; existence search over
`tackX x crewPosX x stays`), oar shipped, scored by K1's predicate. A
**report**, same status as `harness/acceptance-manual.js` and for the same
reason — nobody has decided what a coverage regression should do to the
build. Two-stage (cheap 60s screen, full 300s `holdsCourse` only for
survivors) to keep the cost in the tens of minutes instead of hours. Not
wired into `run_tests.js`.

**K3 — `harness/asserts-course-change.js`.** The first checks of the
criterion's *obtaining* half: from an already-confirmed hold at one TWA,
switch directly to another TWA's holding trim with the oar shipped and the
rudder never touched again, and ask whether the boat both reaches the target
and then holds it (K1's predicate, one continuous window). TWA70<->TWA90 at
TWS6 is the pair used — the only one the package can independently show
holds at all (S1c); there is no known trim holding TWA140, so a transit test
aimed at it would measure against a target the boat cannot even sit on. Run
on both `end` values per docs/adr/0016 and 0023's own lesson (a defect
visible only on the un-exercised end survived two earlier rounds because
symmetry checks ran their trim controls at neutral).

Measured result (after fixing a bug in the check itself — see below),
`end=1`: bearing away (TWA70->90) **holds**, reaching 90.1deg and converging
with a restoring moment; pointing up (TWA90->70) reaches 83.3deg, a 3.3deg
overshoot past the +-10deg band, so it **does not**. `end=-1`: bearing away's
own *starting* hold (TWA70) does not itself clear K1's predicate, so the
check reports unconfirmed; pointing up's starting hold (TWA90) does confirm,
but the transit still overshoots to 85.4deg (5.4deg past target). A third
check (shunt with the oar shipped — brail eased to slow below the shunt
lockout, no rudder at any point) **capsizes on both ends** during the
deceleration or shunt phase, before the sequence can complete.

**A bug in the check, caught before it produced a wrong finding.** The first
draft of `heldState()` started every run at a fixed `heading = HEADING0`
regardless of `end`, instead of `HEADING0` on `end=1` and `HEADING0+PI` on
`end=-1` — the convention `asserts-aero-steering.js`'s own end-symmetry check
already uses, since `heading` is defined relative to the *active* bow. That
first draft reported both `end=-1` transit checks capsizing within ~2s of
the initial autopilot settle phase, before the oar was even shipped — a
result that looked like a serious asymmetry bug in the boat. A targeted
diagnostic (settle only, both ends, otherwise identical) reproduced it, and
repeating the same diagnostic with the heading fix made it disappear (`end=1`
phi settles to -5.5deg, `end=-1` to -6.9deg, neither capsizing) — confirming
the fault was two runs never representing the same physical situation to
begin with, not a physics defect. Recorded here because it is exactly the
"check both ends" lesson ADR 0016/0023 already paid for, encountered a third
time while building the check meant to prevent it recurring.

## Consequences

- The genuine (bug-free) findings above are reported, not diagnosed further,
  here — K3's job was to measure. The shunt-while-decelerating capsize and
  the two overshoot-by-a-few-degrees misses are candidates for dedicated
  follow-up (loosening the trim search K3 uses only two fixed trims per TWA,
  found by S1c — a search across the transit, not just the two endpoints,
  is the natural next step).
- `Archive/coverage-no-oar-2026-08-09.txt` is the first committed coverage
  snapshot; future physics changes should cite its delta the way polar
  changes are already cited.
- K1's predicate is now the standing bar for every future course-hold
  check in this package — a new check using the old excursion-only band
  would be a regression in rigor, not a simplification.
