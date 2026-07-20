# ROUND 8 — physical capsize criterion (retire the v0.1 overload timer)

Round 7 is ACCEPTED in full. Its D-4 diagnosis plus the replay-fixture
evidence converge on one conclusion this round enacts: the
amaLoad>1-for-2s overload timer — a v0.1 proxy from before roll
dynamics existed (original prompt spec, reviewer-owned) — is now both
redundant and wrong. Real proas fly the ama routinely as a controlled
technique; capsize is decided by heel passing the point of no return,
which the model has computed physically since round 5 (capsizing-arm
reversal at phiCapsizeDeg). Both diagnosed capsizes (T3 at phi~14 deg,
the replay fixture at phi~18 deg) were stopwatch verdicts far below the
physical limit. This is user report P-A's root cause.

## R8-1: Capsize becomes a purely physical outcome (core)

- REMOVE the overload timer as a capsize trigger. Capsize triggers:
  (a) phi crossing the unstable equilibrium of the restoring curve
  (past the capsizing-arm reversal, where restoring is negative and
  the dynamics accelerate over — trigger the `capsized` state + freeze
  once phi passes a CONFIG angle safely beyond the reversal, e.g.
  phiCapsizeDeg + 15 deg, so the boat visibly goes over first);
  (b) the aback/pressed side unchanged: the round-5 mechanism (timer
  counting past ama buoyancy saturation) is already physical — keep.
- amaLoad > 1 becomes a WARNING state, not a countdown: rename the
  internal semantics (e.g. `amaFlying`), keep amaLoad/amaLoadDisplay
  readouts as-is for compatibility.
- Verify the freeze-on-capsize (round-5 P3.2) now composes with (a):
  the boat should visibly roll past the reversal and THEN freeze —
  this also resolves the round-4 review nit about freezing at the
  trigger instead of lying down.

## R8-2: Ripple through tests and scenarios (documented adaptations)

These are consequences of R8-1, adapted openly — not threshold edits:
- Round-3 timer assertions ("pinned amaLoad>1.2 capsizes in ~2s",
  "1s spike does not capsize") tested the timer mechanism; replace
  with physical equivalents: a heel moment pinned beyond the maximum
  restoring capacity drives phi past the reversal and capsizes
  (assert it happens, and that it takes a physically-plausible time,
  order seconds given I_roll); a transient gust excursion to
  amaLoad ~1.3 that subsides recovers without capsize.
- T6 (panic rule) gains meaning: releasing the sheet during an
  escalating overload must arrest phi growth BEFORE the reversal
  angle — assert phi_max stays below phiCapsizeDeg with the release
  applied at amaLoad crossing 1.2.
- T3 and the R7-4b replay fixture: re-run under R8-1. Expected: the
  boat flies the ama and either finds a flying equilibrium or slowly
  escalates toward the reversal — report which, with the phi trace.
  If they now pass, the xfail promotion trap fires by design: remove
  the STABILITY xfail tags with reference to this document. If T3
  still capsizes (physically, past the reversal), it stays xfail with
  the updated diagnosis.
- Squall scenario controller: retune thresholds on the harness side if
  the warning semantics change its triggers; report.
- HUD: "AMA FLYING" amber tag replaces the overload countdown; the
  aback countdown stays (it is still a timer, and physically so).

## R8-3: Broach-cliff assertion re-derived (reviewer decision)

The current assertion expects a broach that only the bug-era force
balance produced; the boat now cleanly holds the over-trimmed close-
hauled trim, which matches the owner's field description of Pjoa
character (stable, slow-mannered) better than the broach did. Replace
it with the honest round-1-style criterion, now measurable with real
dynamics: at matched course/wind, the over-trimmed leg sails SLOWER
and with HIGHER mean heel (phi) than the well-trimmed leg, with no
loss of course. Remove its STEERING xfail tag once replaced (cite this
document). This closes the last piece of round-5's assertion
replacement debt.

## R8-4: Polar bands become xfail-CALIBRATION (third tag)

The D-5 process was followed to exhaustion and documented: sail
parameters at their plausible limits, the residual gap structural
(TWA-90 hull-wave-limited; TWA-40 at 0.458 vs 0.35). Tag both polar
assertions xfail-CALIBRATION with a pointer to D-5 sec 8. Bands remain
untouched; the promotion trap applies (if a future physical change —
e.g. grounding the ad-hoc u^4 wave penalty in slender-body theory,
a natural future round — brings them in-band, we want the flag).
Suite exit code returns to 0 with all knowledge preserved and visible.

## Ground rules

Unchanged. Evidence pack for this round: phi traces for every replaced
capsize test (before/after), the re-run T3 + replay fixture traces,
full suite output showing the final xfail ledger (expected end state:
1-2 STEERING xfails at most, 2 CALIBRATION xfails, 0 hard fails),
/out + bundle regenerated with the fidelity spot-check.
