# ROUND 10c — the carrot is a trim tool, not a parking brake

User recording recordings/kurspelny2.json (add to repo; codeVersion
dee918e — NOTE: push the 10b commits to origin first, review currently
runs against 809e8c5 and cross-version replay is not exact) shows the
user sailing deep courses with the windward brail at mean 0.93 —
exactly the Pjoa manual's prescribed downwind technique — and the model
punishing it: round-5's linear multipliers give CL x0.26 and heel/CE
moment x0.16 at that pull, gutting drive to ~58 N. Result: deep courses
far slower than a beam reach, and the carrot's bear-away effect starved
of the very drive force it needs to act through.

Root cause: round 5 (reviewer-authored coefficients) conflated the
windward brail's two real roles into one linear scale:
- TRIM role (partial pull): deepens the belly, moves CE toward the
  tack, sail KEEPS DRAWING — the manual's downwind chapter is explicit
  that this is how you run deep;
- SURVIVAL role (full pull): spills power, and with both brails =
  furl/stop.

## C1: Two-regime brailWind characteristic (core/aero.js + CONFIG)

Replace the linear (1-0.8b) CL and (1-0.9b) moment multipliers with a
two-regime curve, smoothstep-blended around b ~= 0.6 (CONFIG:
brailTrimRange, default 0.6):

TRIM regime (b in [0, brailTrimRange]):
- CL: mild reduction only, x(1 - 0.15*b_norm) — the sail stays powered;
- camber: INCREASES with pull (the deep belly), reusing the existing
  camber->CL machinery; net effect at high alpha (deep courses) should
  be near-neutral-to-positive drive, consistent with the manual;
- CE shift toward the tack (ceBrailShift): full strength in this
  regime — this is the bear-away lever;
- lateral CE arm yCE: scale DOWN with pull (gathering sail toward the
  yard pulls the pressure centroid inboard/up) — this attacks the
  deep-course luffing moment directly; new CONFIG coefficient with the
  physical reasoning documented;
- heel moment: moderate reduction (vertical redirection of the deep
  belly), e.g. x(1 - 0.3*b_norm).

SURVIVAL regime (b in (brailTrimRange, 1]): ramp to the CURRENT strong
cuts (CL -> x0.2, moment -> x0.1 at b=1), preserving T6/panic, the
stop scenario, and the squall controller semantics.

Both brails at 100% = furl: unchanged.

## C2: Acceptance tests

- Deep-course speed sanity, data-anchored: steady speed ratio
  speed(TWA 160)/speed(TWA 105) at TWS 6 with optimal trim (optimizer
  may now choose partial brailWind — add it to the polar search
  dimensions for TWA >= 135 only, coarse grid) must land in [0.55,
  0.85] — bracketing the Di Piazza CR ratio (1.05/1.52 = 0.69) with
  slack for apparent-wind and hull effects. This kills the "much
  slower downwind" defect measurably.
- Bear-away authority: from TWA 140, applying carrot 0.5 with rudder
  <= 0.3 reaches and holds TWA 165 (re-statement of 10b/D4 with the
  fixed carrot; direction strict, magnitudes loose per standing
  policy).
- Dead-run release: trimmed to TWA 178 with the carrot, releasing the
  rudder must not luff past TWA 160 within 30 s (quantifies the
  user's "set to 180, luffs on release" complaint; if it still fails
  after C1, produce the yaw-moment budget at TWA 175 and report — do
  not tune blindly).
- T5 xfail re-run (promotion trap applies): the carrot should now
  measurably reduce downwind rudder workload.
- Survival regime regression: T6, stop scenario, squall scenario pass
  unchanged.
- kurspelny2.json as a replay fixture: with the fixed model, the
  recorded control sequence must yield a faster deep leg than the
  recording's (report the speed delta), and no capsize.

## C3: Process

Push dee918e..HEAD to origin BEFORE implementing C1 (separate review
of 10b is pending and cross-version replays are approximate). Then C1
as its own commit with before/after probe tables at b = 0, 0.3, 0.5,
0.8, 1.0 (CL, CD, camber, CE position, yCE, heel multiplier) so the
two-regime curve is inspectable at a glance.

Ground rules unchanged. The round-5 coefficient conflation is a
reviewer-owned spec error, corrected here with the manual's own
description as the anchor; note it in the assertion comments.
