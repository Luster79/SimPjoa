# Round 7 findings report — steering-behavior regressions from the drag fix

Status: R7-1 (drag recalibration) is done and verified. This report covers
what it broke downstream, what I tried to fix it, and what's still open.
No further code changes past what's described here without a decision on
the options at the end.

## 1. What R7-1 fixed (confirmed working)

`core/hydro.js`'s `hullResistance()` and `amaDrag()` now derive skin
friction from the ITTC-57 model-ship line (Reynolds number on the hull's
own length, `core/hydro.js`'s `ittc57Cf()`) instead of the old flat,
unphysical constants (`hull.Cf=0.0015`, `ama.dragCoeff=0.4` — the latter
was a bluff-body estimate for a body that actually moves lengthwise through
the water, ~100x too high for that regime).

Verified against `recordings/simpjoa-recording-20260716-155817.json` (the
diagnostic evidence for this whole round):

| Metric | Before | After |
|---|---|---|
| ama/hull drag ratio, static immersion, u=1.6 | ~24-30x hull | 0.163 (formFactor=1.8) then 0.300 (formFactor=3.3, see below) |
| ama/hull drag ratio, max immersion | n/a (already >>1) | 0.508 / 0.932 |
| max \|r\| in the recording's t=108-121s window | 10.04 deg/s | 4.58 deg/s (drops to 3.86 with a modest, separately-justified yawDampingCoeff 900->1100 bump — not yet applied to config.js, see open item below) |
| max crab angle in that window | 86.8 deg | 8.8 deg |
| sustained (crab>60deg & speed>1m/s) duration | 3.84 s | 0.00 s |

Both drag-ratio hard-anchor bands from R7-4a ([0.10,0.30] static,
[0.4,1.0] max) are satisfiable; I ended up needing the *top* of the static
band (formFactor=3.3, ratio 0.300) rather than a middle value, for reasons
in section 2.

**Open item, not yet applied:** getting the recording's peak \|r\| under
the R7-4b 4 deg/s target cleanly (currently 4.58, a single-frame transient
during the sail's unstall, not a runaway) wants a modest `yawDampingCoeff`
bump (900 -> ~1100-1200), which is an independent, already-tunable
parameter unrelated to the drag-ratio anchor. Not yet written to
`core/config.js` pending sign-off on the rest of this report, since it's
a small change but I didn't want to bury it inside the more consequential
findings below.

## 2. The cascade this fix triggered

Rounds 4-5 built essentially the entire "Pjoa manual" steering-behavior
suite (T1, T3, T4, the broach-cliff probe) on top of the ama-drag yaw
moment — which this round's own diagnosis identifies as ~100x too large.
That oversized moment wasn't only causing the round-up bug; it was also
the dominant, and in several cases the *only meaningfully directional*,
yaw-steering channel in the whole force model. With it corrected to a
physically real magnitude, full test suite result:

```
55/61 assertions passed (was 61/61 before this round; two of the newly-
failing 6 are the same-effort tests).
```

Failing:
- `speed(TWA 40) < 0.35*globalMax` — now 0.574 (was passing before)
- `speed at TWS=6, TWA=90 within [2.0,3.6]` — now 3.70 (band ceiling 3.6)
- `sheeting in past the cliff broaches` — the "held" leg now capsizes
  instead of holding
- `T1: crew away from ama turns to leeward` — drift +0.5deg (need <=-3)
- `T3: trimming the sheet in turns to leeward` — now capsizes
- `T4: windward brail turns to leeward` — drift +22.6deg (need <=-3,
  wrong sign)

`T1: crew toward ama turns to windward`, `T2`, `T5`, `T9` and everything
else still pass.

## 3. T1 — partially fixed, remainder is structural

Re-examining R7-1's own hard-anchor band: I'd initially picked the middle
(formFactor=1.8, ratio 0.163/0.508). Moving to the *top* of that same
mandated band (formFactor=3.3, ratio 0.300/0.932 — both still fully
in-band, not a violation) restores the "toward ama" leg: drift +3.2deg,
passes.

The "away from ama" leg stays stuck at +0.5deg even at the band's ceiling.
Root cause, confirmed numerically: `amaDrag()`'s `restingImmersion` floor
(0.3 — a real feature, the ama is never fully dry) means moving crew
*toward* the ama gets two compounding effects (`heelImmersion` rises past
the floor AND `crewImmersion` rises), while moving crew *away* only loses
the small `crewImmersion` term — `heelImmersion` is already pinned at the
floor and can't drop further. This asymmetry predates round 7; it was
invisible before because the oversized ama drag cleared +/-3deg either
way regardless. Fixing it means touching the floor itself, which is also
the R7-4a hard-anchor's own "static immersion" reference point — not
attempted, see options below.

## 4. T3 (partial) / T4 / broach-cliff — CE-lever dominance, not ama-drag

These don't touch `crewPos` at all, so the ama-drag lever I'm allowed to
adjust doesn't reach them. They run through the round-5 CE-lever geometry
(`ceLeverSign * (xCE*Fy - yCE*Fx)` in `core/aero.js`) and the mast-rake
heel coupling (`yawMomentHeel`). Quantified at T4's settled trim (TWA=90,
TWS=6, sheet=35deg):

- CE-lever term: **-210 N*m**
- `yawMomentHeel`: **+33 N*m** (6-7x smaller)
- Applying brailWind=0.5: CE-lever shrinks to -110 N*m (a **+83 N*m**
  swing = windward), `yawMomentHeel` shrinks to +16 N*m (a correctly-signed
  but tiny **-17 N*m** swing = leeward)

The CE-lever swing wins by ~5x, so brailing turns the boat windward
instead of leeward. I tried three fixes, all within the existing
tunables/architecture:

1. Shrinking `yCE` proportionally with `ceBrailShift` (previously only
   `xCE` shrank) — made it worse (drift +25.2deg).
2. Raising `ceBrailShift` toward 1.0 (CE collapsing fully to the tack at
   full brail) — also worse (up to +36.7deg at ceBrailShift=1.0), because
   the dominant `yCE*Fx` term doesn't respond to `ceBrailShift` at all,
   and shrinking `xCE` toward/through zero doesn't flip the term's overall
   sign, it just changes which sub-term is doing the (still-windward)
   pulling.
3. Checked whether `yawMomentHeel` could plausibly be scaled up to
   dominate instead: it would need to be 6-8x its current value.
   `yawMomentHeel` is pure geometry (`CEheight * sin(phi) * Fx`, no free
   coefficient beyond the existing +-1 sign flip) — `CEheight` is a real,
   measured 2.0m mast height from the input data, not something to
   inflate to win a test.
4. Checked a plausible new channel: heel-induced CLR shift on the main
   hull (the textbook dinghy weather-helm mechanism — heeling shifts the
   underwater lateral-plane centroid). Even with a generously-sized
   coefficient, the lever arm (~0.02-0.05m at T4's ~3deg heel) is too
   short to produce the ~100 N*m needed to compete with the CE-lever term
   without an implausible coefficient.

Conclusion: every channel actually grounded in the boat's real geometry is
roughly an order of magnitude too weak to overcome the CE-lever term.
Round 5's T3/T4 never really validated the CE-lever geometry's own
direction — the oversized ama-drag term was steamrolling it regardless of
which way it pointed. Making T4 pass now requires either shrinking the
CE-lever's own dominance (risks breaking T3's currently-passing "ease ->
windward" leg and T9's backwind-slam yank, which both currently lean on
its present scale — a full re-tune, not a patch) or inventing a new
coefficient sized specifically to win the tug-of-war, which would be
reverse-engineered from the test threshold, not from geometry or data —
unlike R7-1, which had the recording telling me what number to land on.

## 5. Options

**A. Keep the T1-toward-ama win (legitimate, in-band), report the rest as
deferred regressions with this diagnosis attached**, and apply the small
independently-justified `yawDampingCoeff` bump from section 1. Revisit
T1-away/T3/T4/broach-cliff/polar-ceiling in a future round once there's
real reference data for the CE-lever's correct scale (a recording of
trim/brail behavior, or quantitative Pjoa-manual handling accounts) — the
same evidence standard R7-1 itself had.

**B. Add a new, explicitly-estimated coefficient** sized to overcome the
CE-lever term for T4 (and separately investigate T3's capsize). Restores
the tests; the magnitude has no grounding beyond "large enough to win."

**C. Shrink the CE-lever's own scale** instead of strengthening a
competitor. Directionally cleaner (fixes the actual dominant term rather
than out-muscling it) but is a full empirical re-tune across T3-eased,
T9's yank, and everything else that currently depends on the CE-lever's
present magnitude — comparable scope to redoing round 5's P1.2 tuning
pass from scratch.

I don't have a basis to pick B's coefficient or C's target scale without
either new reference data or a much larger, open-ended tuning effort — my
recommendation remains A, but this is now written up for you to decide
with the full picture in front of you rather than my summary of it.

## 6. D-4 addendum — stability diagnosis (per ROUND7_DECISION.md D-4)

**Correction to section 4 above:** I described both T3 and the broach-cliff
probe as "now capsizes." That's only true for T3. Re-running the
broach-cliff "broached" leg (sheet=19deg, TWA=50, TWS=6, crewPos=0.5) with
a full force-budget trace shows `capsized=false` for the entire 20s window
— `phi` settles into a small, stable oscillation around -0.6 to -0.7deg
and heading barely moves off 90deg (89.7 vs the required >30deg deviation
to "pass" as a broach). The test isn't failing because the boat capsizes;
it's failing because the boat now holds this trim cleanly, where under the
old (bugged) physics it lost control. That's a steering/yaw-authority
question (the same CE-lever/ama-drag-authority story as section 4), not a
roll/capsize one — I'm leaving it out of the stability finding below and
flagging it back to you, since D-3/D-4's category split assumed it
capsized.

**T3's capsize, traced:** locking the rudder and trimming the sheet from
28deg to 22deg (TWA=55, TWS=6, crewPos=0.3) does genuinely capsize, at
t=37.6s. Full force-budget trace (`roll` breakdown: Msail, Mrestore,
Mcrew, Mdamp) shows this is **not** a runaway heel past the
capsizing-arm-reversal angle (`phiCapsizeDeg`=50deg) — phi only reaches
~14deg at the moment of capsize. It's the **overload timer**
(`stability.overloadCapsizeTime`=2.0s, in `updateAback()`): `amaLoad`
climbs past 1.0 at t=35.57s and stays above 1.0 continuously until the
timer fires at t=37.58s — a 2.005s span, matching the 2.0s threshold
almost exactly. This is the same, already-validated mechanism that governs
T6's gust-capsize test and the aback scenario; it isn't behaving
anomalously, it's firing correctly on a genuine, sustained overload.

**Why the overload happens now and didn't before:** with the ama-drag bug
fixed, the boat reaches meaningfully higher boat speed at this trim than
it used to (same story as the polar-ceiling finding in section 5/D-5) —
more boat speed means more apparent wind loading on the sail, means more
heel moment (`Msail` climbs from ~840 to ~1278 N*m over the trace) at a
trim that previously never generated that much power because the
oversized drag was bleeding off speed first. The capsize is a genuine
consequence of the boat now being more powerful at this trim, not a new
bug in the roll dynamics — the same oversized-ama-drag bug that broke
steering directions was *also* quietly acting as a power-limiting safety
net here.

**First-principles cross-check of the hand-tuned stability parameters**
(same method as R7-1's ITTC grounding, applied to `stability.js`
`I_roll`=1500 kg*m^2, `rollDampingCoeff`=900, and the restoring-curve knees
`phiLiftoffDeg`=12deg/`phiSubmergeDeg`=10deg):

- **I_roll**: a naive dry-mass parallel-axis estimate (ama mass 25kg at
  the 2.5m spacing lever + crew at a nominal crewPos=0.3 + the main hull's
  own small contribution about its narrow 0.55m beam + a rough 15kg rig/
  mast estimate, since the config has no separate rig-mass parameter)
  gives **~272 kg*m^2** — round 4's own originally-suggested formula
  (`displacement*(0.4*spacing)^2`=250) lands in the same range. The
  configured 1500 is ~5.5x that. BUT: adding 2D-cylinder added mass for
  the ama sweeping through water during roll (entrained water mass ~
  rho_w*pi*r^2*length, r estimated at 0.15m for a slender outrigger)
  contributes **~1585 kg*m^2** on its own — dry-plus-added comes to
  **~1857 kg*m^2**, the same order of magnitude as the configured 1500.
  Unlike the ama-drag bug (wrong model entirely — bluff-body drag on a
  body that moves lengthwise), 1500 looks like a physically plausible
  added-mass-inclusive estimate, even though it was originally derived by
  targeting an oscillation-period band rather than computed this way.
  **Not the outlier I expected going in.**
- **rollDampingCoeff=900**: cross-checked via the roll system's own
  implied stiffness (the restoring curve's slope at phi=0, `k`=2*Mmax/
  phiLiftoffRad = 5855 N*m/rad) and the configured I_roll: implied natural
  period 3.18s (close to the documented empirical ~2.6s — the gap is
  expected, since the real curve isn't linear at an 8deg step) and damping
  ratio **zeta=0.152**. That's a plausible underdamped value for a
  sailing hull, though on the lower side of what a beamy, high-wetted-area
  multihull with an ama sweeping through water might realistically show
  (often cited zeta~0.2-0.4 for such forms) — a mild, not dramatic, gap.
- **Restoring-curve knees** (phiLiftoffDeg=12deg, phiSubmergeDeg=10deg):
  back-solving for the ama's implied rest freeboard (spacing*tan(angle))
  gives ~0.53m (liftoff) / ~0.44m (submerge) above/below the waterline at
  rest — plausible for a 3.5m slender outrigger, maybe slightly generous,
  not implausible.

**Conclusion, which revises the D-4 hypothesis:** none of the three
stability parameters comes out an order of magnitude wrong the way the
ama-drag coefficient did. The capsize isn't best explained as "a masked
stability miscalibration" — it's better explained as a genuine,
now-unmasked overload: the corrected drag lets the boat sail measurably
faster/more powerfully at trims that used to be safe only because the bug
throttled it first. This is the same underlying story as the T1/T3/T4
steering regressions and the polar-ceiling finding (section 5/D-5) —
removing one bug removed a hidden limiter in several places at once — but
it means a stability-parameter retune (I_roll, damping, knees) is
unlikely to be the right fix for T3 specifically. Recommend revisiting
T3's own trim parameters (not just its pass/fail threshold) in the
dedicated stability round, alongside any real recording evidence of a P-A
"too tippy" episode.

**Correction (section 7 below found the opposite of what I speculated
here):** I guessed above that D-6's weaker/slower CE-lever would reduce
heel at trims like T3's, since less sail-trim authority sounds like less
power. The actual D-6 implementation showed the reverse: replaying the
diagnostic recording under the corrected CE-lever now capsizes it too
(it didn't under R7-1 alone) — weaker trim-authority means the boat
self-corrects its heading LESS in response to a developing overload, so
it holds a loaded course longer and heels further before anything
intervenes. Same overload-timer mechanism, a second confirming data
point, and a reminder that this class of guess needs checking rather than
asserting — see section 7.

## 7. D-6 implementation + confirming stability evidence

**CE-lever rebuilt around a "lead" parameter (D-6):** `core/aero.js`'s
sail yaw-moment geometry (`xCE`/`yCE`) now anchors to `hydro.js`'s
`clrXPosition()` (the hull's own CLR, shared via a new exported function)
plus `config.hull.lead` (0.15 * hull.length = 0.825m, mid the 5-25%
waterline-length literature range — Larsson & Eliasson) instead of round
5's standalone tack-position geometry. The yard's own swing still moves
the CE (that's the whole mechanism by which trimming steers), but its
excursion is scaled by the new `config.sail.ceSwingFraction` (0.5,
empirically landed): a real flow-attached aerodynamic center tracks
closer to the leading edge than the raw geometric half-chord swing round
5 assumed. `config.hull.ceLeverSign` flipped from -1 to +1 to match — the
lead-dominated `xCE` is typically positive now, where round 5's
swing-dominated version was typically negative; same empirical
"match the Pjoa manual's field-validated direction" flip, re-verified
against the new geometry.

**Result — direction restored, magnitude in the D-6-targeted band**
(all measured as heading drift over a 10s locked-rudder window, the new
D-6 "direction-strict, magnitude-loose, 2-20deg" assertion philosophy —
`harness/asserts.js`'s `steeringOk()`):

| Test | Before D-6 | After D-6 |
|---|---|---|
| T1 toward-ama | -0.8deg (wrong sign) | +1.1deg (correct; weak — ama-drag-lever-limited, see sec 3) |
| T1 away-ama | +1.7deg (wrong sign) | -0.0 to +0.3deg (still wrong sign — xfail, sec 3, unrelated to D-6) |
| T3 eased | -3.5deg (wrong sign) | +5.5deg (correct, in-band) |
| T3 trimmed | +6.9deg (wrong sign) | -13.3deg (correct, in-band) |
| T4 (brail) | +22.6deg (wrong sign) | -5.0deg (correct, in-band) |
| T5 (downwind rudder workload) | backwards (brailed > unbrailed) | correct (brailed < unbrailed) |
| Broach-cliff "broached" leg | holds course (doesn't broach or capsize) | unchanged — not a D-6-fixable case, see sec 6 correction above |

T2 was never affected (it runs through `hullSideForce`'s own `clrX`
shift, not the sail's CE geometry) and stayed correctly signed throughout.

**Confirming stability evidence, found by the R7-4b replay-fixture test
(ROUND7_DECISION.md's own deliverable) under the D-6-corrected model:**
replaying `recordings/simpjoa-recording-20260716-155817.json` — the exact
session that originally diagnosed the ama-drag bug — now capsizes at
t~118.3s, which it did NOT do under R7-1's drag fix alone. Traced: `phi`
climbs continuously and smoothly from ~4deg to past 18deg over the whole
window (no oscillation, no bounding) while `u` holds near 3.6 m/s and
`rudder` stays at exactly 0.000 throughout (this recording never
corrects with the helm) — `amaLoad` crosses 1.0 at t=116.2s and stays
above it until the overload timer (2.0s) fires. This is the identical
mechanism diagnosed for T3 in section 6, now independently confirmed in
the actual recorded scenario: with BOTH the ama-drag lever (R7-1) and the
CE-lever/trim authority (D-6) corrected to realistic scale, a boat
sailing with the helm centered no longer self-corrects its heading enough
to cap sail loading the way the old, doubly-oversized yaw-moment
mechanisms incidentally did — it holds course, keeps loading up, and
eventually overloads. R7-4b's "sustained \|r\|>4deg/s" sub-check is marked
xfail-STABILITY (not an independent round-up finding; the sustained yaw
growth is a symptom of the same escalating heel, confirmed by the phi
trace) rather than left as an unexplained new regression.

This raises the stability round's priority: it's now evidenced by BOTH a
synthetic probe (T3) and the real diagnostic recording, not just one
test's specific trim parameters.

## 8. D-5 polar retune report

Sail-side parameters retuned within literature-plausible ranges
(`core/config.js`'s `sail.camber/CD0/s`): camber 0.10->0 (its floor),
`s` 0.85->1.0 (its physical ceiling — full leading-edge suction loss),
`CD0` 0.06->0.09. Before/after (TWS=6):

| Metric | Band | Before D-5 | After D-5 |
|---|---|---|---|
| TWA-40 ratio to global max | <0.35 | 0.588 | 0.458 |
| TWS6/TWA90 speed | <=3.6 m/s | 3.70 | 3.63 |

Neither band is fully reached. `CD0` is the parameter with the most
leverage on both metrics, but it's deliberately capped at 0.09 rather
than pushed to 0.15-0.18 (which gets much closer, even fully in-band for
TWA-40): `CD0` also scales the flogging-drag term
(`floggingCDFactor*CD0`), and near head-to-wind the sail's parasitic drag
partially resolves as forward thrust (apparent wind is nearly
boat-aligned there) — probed empirically, `CD0` past ~0.10 breaks the
"head-to-wind stays essentially still" test (speed 0.30->0.52+ m/s,
over its 0.5 ceiling) and collapses T3-eased's margin toward zero. 0.09
keeps both comfortably passing (0.40 m/s, 3.3deg) while still narrowing
the polar gap as far as it safely can.

The remaining gap looks structural, not a matter of pushing sail
parameters harder: TWS6/TWA90's speed barely moves even at extreme,
implausible `CD0` values (3.61 m/s at `CD0`=0.20) — the boat is
hull-WAVE-RESISTANCE-limited at this near-hull-speed condition (the
`u^4` Froude penalty term, which R7-1 explicitly keeps unchanged), not
sail-power-limited. Closing this gap fully would mean revisiting that
wave-resistance calibration, outside this round's authorized scope.
Reported as the best achievable with physically-plausible sail parameters
that don't break other established behaviors, per the standing
calibration allowance — not a band edit.
