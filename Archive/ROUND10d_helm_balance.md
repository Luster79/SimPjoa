# ROUND 10d — absolute helm balance, through-gybe aback, parked-state audit
# (+ three carried items from the 10c review)

User field test (carrot 60%, ride ending in a spontaneous bear-away
"to TWA 113") exposed a trajectory the reviewer reproduced headlessly:
rudder-free at a trimmed beam reach, the boat bears away at ~7 deg/s
(strong LEE helm), sails uncontrolled THROUGH dead-downwind onto the
ama-leeward side, the yard slams to delta=0, the aback detector stays
silent, the boat parks at u=0.00 exactly and weathervanes back over
minutes. The user's 113 was a snapshot of that arc, not a carrot
equilibrium. Three defects plus three carried items:

## H1: Absolute helm balance (test gap + lead calibration)

- NEW criterion (the missing one): at TWS 6, polar-optimal beam-reach
  trim, crew 0.35/0, releasing the rudder must give initial course rate
  |dTWA/dt| < 0.5 deg/s and excursion < 15 deg over 60 s. Slight
  WEATHER-side drift preferred (classic safe-helm convention; matches
  the manual's advice that a hands-off canoe settles toward the wind).
- Achieve it by calibrating `lead` at the design trim — this is the
  parameter's actual naval-architecture job — strictly within the
  documented 5-25% LWL literature range. If neutrality is unreachable
  in-range, publish the residual rate and the moment budget; do not
  touch anything else to force it.
- Re-run the D-6 rate bands and T3/T4 differentials after (they were
  calibrated on top of the old baseline drift; expect shifts — report).
- Note the test-design lesson in the assertion comment: differential
  tests cannot bound absolute balance.

## H2: Through-gybe must engage the aback mechanism

- Audit stability.js aback detection for the through-gybe corner: wind
  crossing to the ama-leeward side via a bear-away leaves the sail
  pressed at delta~0 with phi<0, yet abackTimer stays 0 in the
  reproduced trajectory. Find why (suspect: the detector's wind-side
  condition vs the pressed-sail regime disagree in this quadrant) and
  make the pressed-through-gybe state count as aback: warning, timer,
  and the pressing moment on the ama.
- New assertion: an uncommanded bear-away through TWA 180 (scenario:
  the H1 pre-fix trajectory, driven open-loop) raises the aback
  warning within 3 s of the wind crossing and, if unrelieved,
  capsizes via the existing pressed-side path.
- UI: this is exactly what the round-11 safety sector (R11-5) will
  visualize; note the dependency.

## H3: Parked-state audit (u pinned at exactly 0.00)

A hull with a pressed sail and quarter wind does not sit at exactly
zero for 120 s. Find the pin: flogging-drag path returning zero net
force at delta=0, a numeric floor, or missing windage. Add minimal
above-water windage (hull + furled/pressed sail silhouette, one CONFIG
coefficient with an order-of-magnitude provenance note) OR document
why the exact zero is a genuine balance. Assertion: parked hull, beam
true wind 6 m/s, sail furled -> downwind drift speed in [0.05, 0.4]
m/s within 60 s.

## Carried from the 10c review (agreed, previously deferred)

- C-A: dead-run release test upgraded from a 30 s min-TWA snapshot to
  a rate metric: drift toward the wind < 20 deg/min sustained over
  120 s (the 30 s window green-lit a slow divergence).
- C-B: UI brail zone marking: the brailWind slider/keys show the
  TRIM zone (0..brailTrimRange) and SURVIVAL zone visually (two-tone
  track + tick at the boundary, PL/EN tooltips "trym (marchewka) /
  zrzut mocy"); read the boundary from CONFIG. This closes the
  discoverability gap that made the user sail at 0.93 in the survival
  regime.
- C-C: camber-model unification (scoped physics item): the v2 aero
  table was digitized from ALREADY-CAMBERED rigid sails, while the
  legacy camber machinery still multiplies on top (double-ish counting
  below 45 deg, hard zero above — exactly where deep courses live).
  Redefine camber/brailCamberGain as a DELTA relative to the table's
  built-in 1:10 camber, with a window extending into high alpha, and
  document the mapping. Re-anchor the C2 speed-ratio test afterwards.

## Ground rules

Unchanged. Evidence pack: H1 before/after moment budgets at the beam-
reach trim; the reproduced through-gybe trajectory before/after H2;
windage provenance note; fresh suite + ledger; TWS-6 polar before/
after (C-C may move it); bundle fidelity spot-check. Ask the user to
RECORD the next field ride (the 113 ride was unrecorded — F9 costs
nothing and turns anecdotes into fixtures).
