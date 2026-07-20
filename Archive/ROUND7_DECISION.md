# ROUND 7 DECISION — response to ROUND7_steering_regression_findings.md

The findings report is accepted as the definitive diagnosis of this
round. The quality bar it sets — quantified force budgets, honest
negative results on four attempted fixes, and refusing to pick an
ungrounded coefficient — is the standard for the project from here on.
Decision: **modified option A ("A+")**, itemized below. Options B is
rejected on principle (every reverse-engineered coefficient in this
project's history has resurfaced as a bug — the oversized ama drag
being the definitive example); option C is deferred until reference
data exists (see D-6).

## D-1: Accept and commit the R7-1 state

ITTC-based drag for both hulls, formFactor = 3.3 (top of the mandated
static band, ratio 0.300/0.932 — in-band and transparently chosen;
acceptable, with a comment noting it was selected at the band edge to
preserve T1-toward and must be revisited when real ama-resistance data
appears). Commit and push everything the report describes, including
the recording fixture and R7-4 guards.

## D-2: R7-4b metric refinement (reviewer-owned spec change)

The 4 deg/s bound's documented intent is "no uncommanded round-up". A
single-frame 4.58 deg/s transient during sail unstall is not a
round-up. Amend the assertion to SUSTAINED |r| > 4 deg/s for > 0.5 s
continuous, cite this document in the assertion comment, and DO NOT
apply the yawDampingCoeff bump — yaw damping stays 900 pending its own
grounding. (This is a specification correction to match documented
intent, decided by the reviewer, not a threshold negotiation.)

## D-3: T1-away and T4 become explicit expected-fails (xfail)

Add an `expectedFail: true` mechanism to the harness: xfail assertions
still RUN and are listed in every test report under a loud "KNOWN MODEL
LIMITATIONS" section with a one-line diagnosis + pointer to the
findings report; the suite exits 0 if and only if all non-xfail
assertions pass AND every xfail is still failing (an xfail that starts
PASSING must be flagged for promotion — that means something changed
and we want to know). Mark: T1-away (restingImmersion floor asymmetry),
T4 (CE-lever dominance, no grounded competitor). Do NOT mark T3 or the
broach-cliff — see D-4.

## D-4: T3-capsize and broach-cliff-capsize escalate to a stability
## investigation (this is user report P-A surfacing, not a steering bug)

A boat that capsizes at a trim that previously held a close-hauled
course is a STABILITY finding. Hypothesis: the oversized ama drag was
damping/starving the roll-yaw dynamics and masking a stability
miscalibration, exactly as it masked steering directions. Scope for
this round (diagnosis only, no fixes):
- Produce the heel-moment budget at both failing trims (sail heel
  moment vs restoring curve vs I_roll response) over the capsize
  timeline, replay-CSV style.
- Cross-check the hand-tuned stability parameters (I_roll = 1500,
  restoring-curve shape/knees, roll damping) against first-principles
  estimates for the documented boat geometry, the same way ITTC just
  grounded the drag. Report which parameter is furthest from its
  physical estimate.
- Deliverable: a findings section appended to the report; the fix
  itself is the next round, ideally corroborated by a user recording
  of a real P-A "too tippy" episode.
Until then, T3 and broach-cliff are marked xfail-STABILITY (separate
tag from D-3's steering xfails) so the categories stay distinct.

## D-5: Polar bands go through the standard calibration allowance

TWA-40 (0.574 vs 0.35) and TWA-90 (3.70 vs 3.6 ceiling) are calibration
casualties of removing the ama-drag's illegitimate braking role. Run
the standing process: retune SAIL-side physical parameters (CD0,
suction factor s, camber coefficients) and, if needed, hull side-force
within literature-plausible, documented ranges. Bands untouched. If
TWA-40 cannot be reached with plausible values, report the best
achievable number with the parameter set — same rules as always.
Note: do this AFTER D-4's diagnosis, since stability parameters may
move and interact with the polar.

## D-6: RESOLVED — owner's field datum authorizes option C with anchors

The project owner (with first-hand Pjoa community knowledge) reports:
sail-trim steering response on real Pjoa boats is SLOW — it varies
strongly with wind and the individual boat, but fast sail-based
maneuverability is explicitly NOT a Pjoa trait. This is the reference
datum the CE-lever question was waiting for. Consequences:

1. **Option C is authorized and directed.** The CE-lever's absolute
   scale is the miscalibrated quantity: current trim-induced moment
   swings (+-83..210 N*m -> ~2-5 deg/s turn rates) are too fast.
   Target: steady sail-trim-induced turn rates of order 0.3-1.5 deg/s
   at TWS 6 (5-15 deg over a 10 s window).
2. **Grounded implementation path (not an invented coefficient):**
   reference the sail yaw moment against a calibrated CLR with a
   classical "lead" parameter — the CE-CLR longitudinal separation,
   a standard, literature-documented yacht-design quantity (order
   5-25% of waterline length depending on type; see Larsson &
   Eliasson, Principles of Yacht Design). The net helm becomes the
   small difference of two large levers, which is precisely why real
   response is slow. `lead` goes into CONFIG as a per-boat parameter
   with the literature range documented. Optional second step, only
   if needed after the lead calibration: mild CLR mobility with
   leeway/speed (a real effect for canoe hulls), also
   literature-anchored.
3. **Assertion philosophy per the owner's caveat** ("depends strongly
   on wind and the boat"): steering tests assert DIRECTION strictly
   and MAGNITUDE loosely — accept 2-20 deg per 10 s window; scale
   parameters live in CONFIG per boat.
4. **Re-tune order:** apply after D-4's stability diagnosis (roll
   parameters may interact), then re-run the full steering suite. The
   D-3 xfails (T1-away, T4) get re-evaluated under the new balance —
   the xfail promotion trap will flag any that start passing.
5. The datum also retro-validates two things: the manual's emphasis on
   paddle steering (the only fast helm on a slow-responding boat), and
   D-2's rejection of the damping bump (slow response comes from
   balance, not from cranking damping).

## Deliverables for closing round 7

Pushed commits covering D-1..D-5, fresh full-suite output showing:
all non-xfail assertions passing, the xfail section listing exactly
four entries (two steering, two stability) with diagnoses, the D-4
stability findings appendix, the D-5 polar report, /out + bundle
regenerated with the fidelity spot-check.
