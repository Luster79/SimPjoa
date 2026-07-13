# PROMPT: 2D simulator of a Polynesian proa with a crab claw sail

## Role and goal

You are an experienced programmer with knowledge of sailing mechanics.
Build an interactive 2D simulator (top-down view) of a Polynesian proa
with an oceanic lateen ("crab claw") rig. The simulator must show the
boat's behaviour as a function of: wind direction and strength, rudder
deflection, sheeting (yard angle relative to the hull axis), sail shape
controlled by spilling lines (brails), and crew ballast position.

Key difference from classic sailing simulators: a proa does NOT tack or
gybe. It performs a SHUNT — it swaps bow and stern, and the outrigger
float (ama) always stays on the windward side.

## Project materials (companion files — READ FIRST)

This prompt is part of a package. Before writing any code, read:

- **ARCHITECTURE_physics_core_EN.md** — BINDING specification of the
  module structure, coordinate conventions, function signatures, and the
  test harness for Step 1. Where this prompt and the architecture
  document overlap, the architecture document governs code structure and
  this prompt governs physics and behaviour.
- **data/README_input_data_EN.md** — provenance and limitations of the
  input data; read it to understand which coefficients are calibrated
  anchors and which are tunable estimates.
- **data/crab_claw_CL_CD_polhamus.csv** — CL/CD vs angle of attack for
  apex angles 45 and 60 deg. This is the primary aerodynamic input.
- **data/driving_force_vs_AWA.csv** — reference driving-force curve for
  validating the polar (comparison, not a direct model input).
- **data/example_proa_parameters.csv** — default values for CONFIG.

## Work plan

Deliver the project in two steps, as separate deliverables:

- **Step 1 (first):** headless physics core + test harness, exactly per
  ARCHITECTURE_physics_core_EN.md. No UI. Done when `node run_tests.js`
  passes.
- **Step 2 (only after Step 1 is accepted):** the browser UI described
  in the "Interface" section below, in a single HTML file that IMPORTS
  the unmodified Step 1 core. The physics requirements in this prompt
  apply to Step 1; the interface and interaction requirements apply to
  Step 2.

## Technology

- Step 1: pure ESM JavaScript modules, Node >= 18, no external
  dependencies (see the architecture document).
- Step 2: a single HTML file (2D canvas), no build step, runnable by
  opening in a browser; it imports the Step 1 core. External libraries
  from CDN only if necessary.
- Readable, commented code; all physical constants and tuning
  multipliers gathered in CONFIG (config.js), initialised from
  data/example_proa_parameters.csv.
- Aerodynamic coefficients: load from data/crab_claw_CL_CD_polhamus.csv
  (interpolate between the 45 and 60 deg apex tables for intermediate
  apex angles). config.js must also be able to REGENERATE the tables
  from the Polhamus formulas below — assert at startup that the loaded
  and generated tables agree within 2% (guards against silent data-file
  edits). In Step 2, embed the CSV content as a JS constant so the HTML
  file works offline, keeping the same table structure.

## Physics model

### Degrees of freedom
Planar simulation, 3 DOF: surge (longitudinal velocity u), sway (lateral
velocity v), yaw (angular rate r). Integrate with RK4 or semi-implicit
Euler, timestep 1/60 s. Model roll in a simplified way as an ama-load
indicator (see Stability), without full roll dynamics.

### Wind
- True wind: direction and speed set by sliders (2-12 m/s).
- Apparent wind: computed vectorially from true wind and boat velocity.
  Compute ALL aerodynamic forces from the APPARENT wind.

### Sail aerodynamics (crab claw)
Angle of attack alpha = angle between apparent wind and the sail chord
(yard line). Coefficients from the Polhamus suction analogy for delta
wings (calibration: Marchaj, Sail Performance 1996 — driving force
coefficient ~1.7 at AWA 90 deg):

    CL = Kp*sin(a)*cos^2(a) + Kv*cos(a)*sin^2(a)
    CD = CD0 + s*CL*tan(a)

    Sail apex angle: 50 deg (CONFIG parameter, range 45-60)
    AR = 4*tan(apex/2);  Kp = 2*pi*AR/(2+sqrt(AR^2+4));  Kv = pi
    CD0 = 0.06;  s = 0.85 (partial leading-edge-suction loss factor, tunable)

Important properties to reproduce:
- The sail works efficiently at large angles of attack (25-45 deg),
  CL maximum ~1.8-1.9 at alpha ~40 deg; no abrupt stall typical of
  classic profiles — past the maximum, CL falls off gently.
- Aerodynamic force: F = 0.5 * rho_air * S * V_aw^2 * [CL, CD]; resolve
  into a driving component (along the boat axis) and a side component.
- Point of application (centre of effort) at mid-chord — vortex lift
  shifts CP towards the centre; the CE position relative to the hull
  centre changes during the shunt (see below) and generates yaw moment.

### Sail shape — brails / spilling lines
Traditional oceanic proas do not reef. Instead they use two lines
(spilling lines) tied about 3/4 of the way along the boom, running on
both sides of the sail through blocks at the mast top down to deck.
Implement two independent sliders 0-100%: LEEWARD brail and WINDWARD
brail.

Coefficient model (per Schacht's description on Proafile and
practitioners' reports from real proas):

1. **Leeward brail (b_lee)** — when tightened it produces a "crease" in
   the belly of the sail and flattens it, sharply reducing lift
   (analogous to flattening a western sail):
       CL_eff = CL * (1 - 0.7*b_lee)
       CD_eff = CD * (1 - 0.3*b_lee)
   Effect: fast depowering without changing yard angle — useful in a gust.

2. **Windward brail (b_wind)** — when tightened it forces a deep curve
   into the sail: it cuts driving force hard and redirects part of the
   remaining force UPWARD (as vertical lift), so the heeling moment drops
   more steeply than the driving force:
       CL_eff = CL * (1 - 0.8*b_wind)
       heeling moment *= (1 - 0.9*b_wind)
   Effect: survival mode — the boat sails slowly but the ama is unloaded.

3. **Both brails at 100%** — sail furled up to the yard: aerodynamic
   forces near zero (keep spar drag ~CD0). Useful as a "stop" and during
   a shunt in strong wind.

4. **Base sail camber** — CONFIG parameter 0-0.20 (depth/chord).
   Practical tests indicate camber of about 1:5 raises CL by ~35% on
   close courses relative to a flat sail, while a flat sail has less
   drag. Implement a multiplier:
       CL *= (1 + 1.75*camber)   for alpha < 30 deg (scaled linearly to 0
                                  above 45 deg)
       CD *= (1 + 1.0*camber)
   The leeward brail effectively reduces camber to zero (flattening);
   the windward brail pushes it beyond the optimum (over-cambering).

### Hull hydrodynamics
- Longitudinal resistance: R = 0.5 * rho_w * S_wet * Cf * u^2 plus wave
  resistance rising steeply above Froude number 0.4 (slender displacement
  hull — use a simple penalty function, e.g. a ~u^4 term above threshold).
- Side force from leeway: a hull without a centreboard acts as a very
  low-aspect-ratio foil — side force proportional to leeway angle
  (compute from v/u), with saturation above ~15 deg (per Flay et al.:
  V-shaped hulls generate more side force than U-shaped — expose a
  coefficient in CONFIG).
- Ama drag: an additional drag term depending on its immersion.
- Yaw damping proportional to r.

### Rudder
Steering oar at the active leeward "stern" end: lateral force
proportional to deflection (range +/- 35 deg) and velocity squared,
applied at the hull end — generates yaw moment. After a shunt the rudder
at the opposite end becomes active.

### Stability (simplified but essential for a proa)
- Heeling moment: sail side force * CE height (CONFIG: 2.0 m), modified
  by the windward brail (see above).
- Righting moment: ama weight (when the windward ama lifts) or its
  buoyancy (if it were leeward — an emergency state) + crew ballast
  moment.

### Crew ballast
On traditional proas the crew actively ballasts by moving along the
platform between the hull and the ama (accounts from Satawal: sailing
controlled almost entirely by sheet and crew position). Implement:
- "Crew position" slider x_crew from -0.3 (outboard of the leeward hull
  side, on an extending platform) to +1.0 (on the ama), where 0 = hull
  centreline.
- Crew righting moment: M_crew = m_crew * g * x_crew * B/2, where B =
  hull-ama spacing, m_crew from CONFIG (default 90 kg — a significant
  fraction of the 250 kg displacement, so the effect must be pronounced).
- Crew position feeds the ama-load indicator: crew on the ama presses it
  down (prevents lifting in strong wind); crew at the hull / outboard
  leeward unloads the ama in light wind (reduced ama wetted surface =
  less drag — add this effect to resistance).
- Deliberate simplification: ignore the crew's effect on fore-aft trim.

### Shunting (the heart of the simulator)
The SHUNT button triggers a sequence (~4-6 s, animated):
1. Sail eased, boat loses drive (sail forces faded out gradually).
2. The sail tack (yard heel) is hauled from one end of the hull to the
   other — animate the tack point sliding along the leeward side.
3. Bow/stern role swap: reverse the "forward" axis direction, activate
   the opposite rudder.
4. Sheet in on the new tack.
During the shunt the boat drifts with inertia. The ama stays on the same
geographic side — after the shunt the boat sails "the other way" with
the same hull. Lock out the shunt when speed > threshold (CONFIG, e.g.
4 m/s) — force easing the sail first.

## Interface (canvas + panel)

- Top-down view: boat (hull + ama + sail yard as an arc), water with a
  grid, true wind arrow (screen corner) and apparent wind arrow (at the
  boat).
- Force vectors drawn at the boat: sail lift, drag, resultant, hull side
  force, rudder force ("show forces" toggle).
- Sliders: wind direction, wind strength, sheeting (yard angle), rudder
  (or keys A/D and arrow keys for the sail).
- Brail sliders: leeward (keys Q/Z) and windward (W/X), 0-100%;
  visualisation: the sail chord line changes curvature/colour with brail
  state; at 100%/100% draw the sail furled against the yard.
- Crew position slider (keys J/L); visualisation: a crew dot/figure
  moving along the crossbeams between hull and ama.
- SHUNT button (spacebar).
- Numeric readouts: speed [knots], apparent wind angle, sail angle of
  attack, VMG upwind, ama load [%], leeway angle.
- "Polar" mode: a button that runs an automatic measurement — the
  simulator sets the boat on headings 40-170 deg in 10-deg steps, waits
  for speed to settle with automatic optimal sail-angle selection, and
  draws a polar speed diagram.

## Reference data

Primary input: data/crab_claw_CL_CD_polhamus.csv (see Technology for the
load-and-verify requirement). Verify at startup with assertions:
- CL at alpha=35 deg within 1.6-1.8 (apex 45-50 deg)
- CL_max within 1.75-2.0 at alpha 38-46 deg
Use data/driving_force_vs_AWA.csv only in the test harness, as a
reference curve for the polar-shape assertions (not as a model input —
the model must produce its polar from CL/CD and the hull model).

## Acceptance criteria (test before delivering)

1. The boat head-to-wind with the sail sheeted does not move; on a
   90-deg course to the wind at 6 m/s it reaches a sensible speed (order
   of 4-7 knots for default parameters) — check numerical stability
   (no NaN, no oscillations at dt=1/60).
2. The shunt sequence works both ways repeatedly; after a shunt the boat
   sails correctly on the opposite tack with the ama to windward.
3. Crossing the wind line (ama to leeward) triggers the aback alarm and,
   if sustained, a capsize and reset.
4. Over-sheeting on a close course increases heel (ama load) and leeway
   instead of speed.
5. The polar has a realistic shape: no progress below ~50-55 deg off the
   wind (a crab-claw proa points worse than a sloop), maximum speed on a
   beam reach / broad reach.
6. Tightening the leeward brail in a gust (sudden wind increase via
   slider) reduces ama load and speed WITHOUT changing yard angle; the
   windward brail reduces ama load more than speed (moment-drop to
   drive-drop ratio clearly > 1).
7. Both brails at 100% stop the boat (residual drift) — the "stop" test.
8. Moving the crew onto the ama in strong wind lowers the ama-load
   indicator by the amount corresponding to M_crew; in light wind moving
   the crew leeward reduces drag (a few percent speed gain).
9. Combined scenario: close course, wind rising 4->10 m/s — the boat can
   be kept upright using ONLY brails and ballast, without easing the
   sheet (this is the essence of the traditional oceanic technique).
10. Everything works by opening the HTML file locally, 60 fps at default
    window size.

## Default boat parameters (CONFIG)

- hull length 5.5 m; beam 0.55 m; displacement 250 kg (incl. crew)
- ama: length 3.5 m, max buoyancy 80 kg, hull-ama spacing 2.5 m
- sail: 12 m2, apex angle 50 deg, CE height 2.0 m, base camber 0.10
  (depth/chord)
- crew: 90 kg, position range -0.3..+1.0 of half-spacing
- rho_air = 1.225, rho_w = 1025

## Response format

Step 1: a short architecture recap (max 10 sentences, noting any
deviations from ARCHITECTURE_physics_core_EN.md and why), then the
repository files, then the output of `node run_tests.js`.
Step 2: the single HTML file, usage instructions (keys), and a list of
known model simplifications.
