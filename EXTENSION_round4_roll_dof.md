# EXTENSION REQUEST — round 4: roll as a 4th DOF + fore-aft crew + graphics fixes

Round-3 core fixes are verified and ACCEPTED (world-frame probe: physical
hull axis continuous through shunts, no aback with fixed wind; the
TWA -> 180-TWA shunt insight in scenarios.js is correct and appreciated).
This round has two parts: a MODEL EXTENSION (Part 1) answering a real
limitation user testing exposed — the planar 3-DOF model has no physical
pathway for ballast to influence course — and UI fixes (Part 2), two of
which are confirmed rendering bugs.

Ground rules unchanged: physics over test-tweaks, before/after evidence,
no threshold edits (see the explicit calibration allowance in 1.7),
regenerate /out and the bundle, update the architecture doc as part of
the change (rewrite sections, don't append).

---

## PART 1 — Roll as a dynamic state (4 DOF)

### 1.1 New state and conventions (architecture erratum)

Add to state: `phi` (roll angle, rad) and `p` (roll rate, rad/s).

**Convention (critical, to avoid a repeat of the chirality bug):** roll
is defined about the PHYSICAL hull longitudinal axis, with positive phi
= the ama side rising. Because it is a physical-frame quantity, **phi
and p are UNCHANGED at a shunt swap** — add this to the swap spec and to
the world-frame assertions (phi continuous at swap).

### 1.2 Roll dynamics

    I_roll * dp/dt = M_sail_heel + M_restore(phi) + M_crew + M_damp

- `I_roll` new CONFIG field; default estimate: displacement *
  (0.4 * ama.spacing)^2, tunable.
- `M_sail_heel`: the existing sail heel moment (incl. the windward-brail
  (1 - 0.9*b_wind) reduction), sign mapped so that leeward force lifts
  the ama (positive phi contribution).
- `M_restore(phi)`: piecewise, from the ama:
  - phi > 0 (ama lifting/flying): restoring = ama weight moment,
    saturating once the ama is fully airborne; implement a smooth curve,
    parameters in CONFIG.
  - phi < 0 (ama pressed): restoring = buoyancy reaction growing with
    immersion, saturating at ama.maxBuoyancy * g * ama.spacing; beyond
    saturation the ama submerges — this now gives the aback capsize a
    physical mechanism instead of a bare timer (keep the timer as the
    trigger; it now counts time past buoyancy saturation).
- `M_crew`: crew.mass * g * crewPos * ama.spacing * cos(phi) — the crew
  now acts inside the dynamics, so moving crew changes the equilibrium
  heel, which via 1.4 changes the course. This is the user-visible win.
- `M_damp`: -c_roll * p * |p| or linear -c_roll * p (choose, CONFIG);
  target behavior: a step gust produces a damped overshoot settling in
  2-4 oscillation periods, roll period order 1.5-4 s.

### 1.3 amaLoad becomes DERIVED (compatibility layer)

Redefine amaLoad from the restoring curve so existing semantics carry
over continuously: amaLoad = 1.0 exactly when the ama just leaves the
water (restoring fully mobilised); >1 while flying (grows with phi);
the overload-capsize timer keeps its meaning ("ama flying for 2 s").
amaLoadDisplay and both capsize timers keep their current contracts.
Existing overload/spike assertions must pass against the new derivation
(they feed synthetic loads — if their harness plumbing needs adapting to
the new signature, adapt the plumbing, not the thresholds).

### 1.4 Heel-course coupling (the physical one)

With heel phi, the sail's drive force acts offset laterally from the
hull centerline by CE_height * sin(phi). Add the resulting yaw moment:

    M_yaw_heel = Fx_sail * CE_height * sin(phi) * (sign mapping such
    that heel toward leeward produces a luffing tendency)

This is pure geometry — no free coefficient. Also scale sail force
magnitude by cos(phi) (projected area). Optional additional hull-shape
coupling coefficient may be added in CONFIG defaulting to 0.

### 1.5 Fore-aft crew position (phenomenological, no pitch DOF)

New control `crewPosX` in [-1, 1] (fraction of half hull length; 0 =
midships). Model as a CLR shift: the hull side-force application point
moves by k_trim * crewPosX * (hull.length/2), k_trim in CONFIG
(default 0.15). Sign target: weight FORWARD -> CLR forward -> CE
effectively aft of CLR -> the boat LUFFS; weight AFT -> bears away.
Flag this sign mapping in the summary as needing validation against
practice (Dierking); make it trivially flippable via the CONFIG sign.
UI: second slider/keys (I/K), crew marker moves fore-aft too.

### 1.6 New assertions

- Zero wind: phi converges to a static equilibrium |phi0| < 5 deg; roll
  energy decays (extend the damping test to the roll DOF).
- Step gust on a reach: phi overshoots and settles (damped, bounded).
- phi and p continuous at every shunt swap (world-frame suite).
- Coupling sign tests, rudder locked at 0 on a steady reach:
  (a) moving crew toward the ama (more windward moment -> less leeward
  heel) changes the steady heading in the bear-away direction relative
  to crew inboard; (b) crewPosX forward vs aft produce opposite heading
  drifts with the specified signs.
- All existing assertions pass unchanged.

### 1.7 Calibration allowance (read carefully)

cos(phi) scaling will shave sail force; speed(TWS 6, TWA 90) currently
sits at 2.03 m/s, the very bottom of its [2.0, 3.6] band, and may dip
under. If any existing band is violated: DO NOT touch the band. Retune
PHYSICAL parameters instead (documented, e.g. CD0, suction factor s, or
hull friction within literature-plausible ranges) and report the full
before/after TWS-6 polar. The same applies to the squall controller.

---

## PART 2 — Graphics fixes (ui/app.js only)

### 2.1 Sail belly chirality bug (confirmed)

sailPath()'s camber control point uses the chord normal n = (-dy, dx) —
a fixed +90-deg rotation. Correct for end=+1, INVERTED for end=-1: the
belly bulges toward the ama/windward after a shunt (user-observed
"sail curves into the wind"). Fix: choose the normal that points away
from the ama side explicitly (multiply by -end or select by dot test),
for both the bulge and the furled-bundle offset. Verify on both ends
with the pause/single-step controls.

### 2.2 Symmetric double-ended hull (confirmed)

The hull path is asymmetric (sharp tip at physical +x, fuller quarter
at -x), visually implying a fixed bow/stern — wrong for a proa. Redraw
as a symmetric double-ender (both tips identical); direction is
communicated ONLY by the active-bow marker and the active steering oar.
Bonus: draw both steering oars, the idle one raised/greyed, swapping at
the shunt.

### 2.3 Heel visualisation (new, follows Part 1)

- HUD: heel angle readout [deg] and a small artificial-horizon-style
  heel bar; color shifts amber/red in sync with the existing ama-load
  bar states.
- Scene: ama rendering reflects immersion — full-opacity ellipse at
  static load, thinning/ghosting as it flies (phi > 0), visibly pressed
  (wider wake ring or darker fill) when phi < 0. Cheap cues, no 3D.
- Optional: foreshorten the drawn sail chord by cos(phi) — subtle but
  ties the picture to the new physics.

---

## Deliverables

Updated ARCHITECTURE_physics_core_EN.md (state, conventions, roll
section — rewritten in place), core + harness changes, fresh
`node run_tests.js` (exit 0), regenerated /out with a roll trace column
in the scenario CSVs (add phi, p to export.js), before/after TWS-6
polar, regenerated dist bundle + three-row polar fidelity spot-check,
and a manual UI checklist: sail belly leeward on BOTH ends, symmetric
hull with marker/oar swap at shunt, heel gauge live, crew marker moving
in both axes.
