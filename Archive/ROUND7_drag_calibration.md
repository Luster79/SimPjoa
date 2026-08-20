# ROUND 7 — drag calibration fix (diagnosed from user recording)

A user recording (simpjoa-recording-20260716-155817.json, replayed and
analyzed offline) fully explains pending report P-B and most likely
P-A/P-C. This round fixes the diagnosed calibration disease and adds
the regression guards that recording made possible. The recording file
is included in the repo under recordings/ — treat it as evidence and as
a test fixture.

## Diagnosis (from the replay CSV, t = 108-121 s)

1. At u = 1.6 m/s: amaDragFx = 156-183 N vs hullResistFx = 6 N. The
   ama out-drags the main hull 26-30x. Physically the ama of a proa
   contributes roughly 10-25% of total resistance at static immersion —
   the current ratio is off by two orders of magnitude. Origin: the
   round-4 immersion-drag tuning inflated ama.dragCoeff/wettedSurface,
   then round-5's P2-1 bolted a 2.5 m lever onto it, turning the
   oversized drag into a ~400-480 N*m luffing moment that dominates
   all steering.
2. Consequence chain recorded: with the rudder centered, the boat
   rounds up UNCOMMANDED at up to 6.8 deg/s; with the sheet pinned at
   25 deg on a broad reach the sail sat fully stalled (alphaSailor
   71-85 deg) so the round-up bled speed to u~0.1; with u^2 terms dead
   the boat wallowed and translated sideways at 1.9 m/s for ~5 s
   (report P-B), oscillating heading 78->49 deg. The same uncommanded
   round-up mechanism plausibly drives P-A (gust -> pinch -> broach)
   and the wallow phases explain P-C's "belly flips" perception.

## R7-1: Ground the drag magnitudes physically (core calibration)

Recalibrate BOTH hulls from geometry, not from the polar:
- Main hull: friction resistance from wetted surface and an ITTC-style
  Cf at model scale (plus the existing wave penalty). At u = 1.6 m/s a
  250 kg, 5.5 m hull should see roughly 10-20 N friction — the current
  6 N is low but the right order.
- Ama: slender-float friction from ITS wetted surface at static
  immersion, scaled by the existing immersion/crew factors. HARD
  ANCHOR: at matched speed and static immersion, ama drag must land at
  10-25% of main-hull drag; with the ama pressed hard (crew standing on
  it, immersion at cap) it may rise to ~50-80%, never above parity.
  Add exactly this as an assertion (see R7-4).
- The Pjoa steering mechanism (P2-1) keeps its lever and sign; only the
  force magnitude becomes sane. The luffing authority of "crew sinks
  the ama" must survive at a realistic scale.

## R7-2: Re-verify the steering and polar contracts

- T1 (crew-lateral steering, >= 3 deg differential) must still pass
  with the recalibrated drag. If it fails, do NOT re-inflate the drag:
  report the achievable differential with physical values and we will
  revisit the threshold as an explicit decision.
- Polar bands per the standing calibration allowance (bands untouched,
  parameters physically grounded, full TWS-6 before/after in the
  summary). Expect the TWA-40 margin to move — report it.
- The uncommanded round-up must be tamed: new assertion (R7-4c).

## R7-3: HUD "STALLED" cue (UI)

Symmetric to LUFFING: show a STALLED tag (amber) when the sail is
driving with alphaSailor above ~50 deg for more than ~1 s. The recorded
session shows the user sailing fully stalled for ~100 s with no cue —
LUFFING alone covers only half of the trim-error space. PL label:
"PRZECIĄGNIĘTY".

## R7-4: Regression guards from the recording

a) Drag-ratio assertion: at reference conditions (u = 1.6 m/s, static
   immersion, crewPos 0.35) amaDrag/hullResist must be within
   [0.10, 0.30]; at maximum immersion within [0.4, 1.0].
b) Replay fixture: commit the recording (trimmed to t = 100-122 s if
   size matters) under recordings/, and add a harness test that replays
   it against current code WITHOUT checksum verification (cross-engine
   ULP makes bit-verify browser->Node invalid — the replay tool's own
   diagnostic explains this) and asserts the FIXED behavior: during
   the previously-pathological window, |r| stays below 4 deg/s with
   the rudder centered, and no sustained (>2 s) |crab angle| > 60 deg
   at speed > 1 m/s occurs.
c) General uncommanded-round-up bound: steady reach, sane trim, rudder
   locked at settled value: |r| stays < 2 deg/s over 30 s (the helm
   balance may drift slowly; it must not pirouette).

## Ground rules

Unchanged: physics over test-tweaks; no band edits (calibration
allowance applies as specified); before/after evidence; /out and
bundle regenerated with the fidelity spot-check; architecture doc's
calibration section updated with the new physically-anchored values
and their justification.

## Note on replay verification across engines

The recording's --verify failed at the first checksum due to
browser-vs-Node V8 trig ULP differences (the tool's built-in
diagnostic is correct). Document in the README that cross-engine
verify failures with matching code/config versions are expected and
benign; same-engine verify (Node recording -> Node replay) remains a
hard determinism contract.
