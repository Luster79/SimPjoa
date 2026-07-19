# ROUND 10b — the downwind wall (user recording + probe diagnosis)

User recording recordings/kurspelny.json (add it to the repo) documents
the symptom: 167 s of pure trim sailing (rudder 0.00 throughout), max
TWA 137.3, stable deep course achievable ONLY by strapping the sheet to
~6 deg (drive from drag, sail amidships); any easing rounds the boat
up. Reviewer probes (TWS 6, target TWA 160) confirm a MODEL defect:

    A: sheet 70deg, rudder SATURATED (1.00)      -> stuck at TWA 140, u=0.38
    B: sheet 70deg + carrot 0.6, rudder saturated -> rounds to TWA 79
    C: carrot, rudder 0                           -> weathervanes, sternway
    D: strapped 8deg, rudder 0                    -> TWA 104, u=3.63 (fastest!)

A real proa runs deep on an EASED sail (Pjoa manual, downwind chapter);
maximum rudder plus the manual's own tool (carrot) must not lose to the
sail's luffing moment. Fix items, in suspicion order:

## D1: Resolve the ceSwingFraction comment/value contradiction (audit item)

config.js: comment says "0.2 empirically landed against the D-6 target";
the value reads 0.5. The lateral CE arm yCE = ceSwingFraction*(chord/2)*
sin(delta) peaks exactly on deep courses, so an unintended 0.2 -> 0.5
revert yields 2.5x the intended luffing moment where it hurts most.
- Establish from git history which value the D-6 calibration actually
  validated; set it, fix the comment, and add a startup assertion tying
  the comment's claimed provenance to the value (or drop the claim).
- Re-run the D-6 turn-rate band tests (T3/T4, 2-20 deg/10 s) at the
  reconciled value and report.

## D2: Verify the carrot mechanism end-to-end

Probe B shows brailWind makes deep sailing WORSE. Audit the chain:
- ceBrailShift moves xCE toward the tack (bear-away lever) — confirm the
  shift survives the round-10 CE rebuild and acts on the lead-referenced
  moment with the intended sign and a non-noise magnitude;
- the dominant deep-course term is yCE*Fx — evaluate whether the real
  carrot's physics also REDUCES the effective lateral arm (gathering
  the sail toward the yard pulls the pressure centroid inboard/up):
  if so, brailWind should scale yCE down as well (literature-consistent
  with the round-5 spilling-line description; document the reasoning).
- Target: T5's intent (carrot lowers downwind rudder workload) becomes
  measurable; re-run the T5 xfail and report (promotion trap applies).

## D3: Ground the rudder instead of feel-halving

rudder.coeff was halved by feel (3.5 -> 1.75) with no anchor. Derive it
as a low-AR oar blade: area 0.4 m^2, CL(deflection) for AR~1-2 plate,
lever from CONFIG geometry; pick the value from the derivation, not
from either 3.5 or 1.75. Document in an ADR. The ergonomic sharpness
complaint should then be addressed via input shaping in the UI (slew/
expo on the slider), not by weakening the physical blade.

## D4: Downwind acceptance tests (new; direction strict, magnitude loose)

- With sheet eased to the polar-optimal deep trim and carrot 0.5, a
  moderate rudder (|rud| <= 0.5 mean) holds TWA 165 +- 10 for 60 s at
  TWS 6, boat speed above half of the TWA-120 polar speed.
- Dead-run check: TWA 175 holdable without sternway (u > 0 throughout).
- The strapped-amidships mode must NOT be the fastest deep mode: polar-
  style comparison at TWA 150 between eased-optimal and strapped trims;
  eased wins. (This kills the unrealistic drag-run exploit as the
  dominant strategy while leaving it available as a technique.)
- kurspelny.json becomes a replay fixture: on fixed wind, the recorded
  strapped equilibrium must remain reachable (no regression of the
  user's discovered balance), and the new eased+carrot recipe must
  reach deeper TWA than the recording's 137.3 max.

## Ground rules

Unchanged; D1-D3 are provenance restorations, not tuning. Evidence
pack: probe table A-D re-run after each of D1/D2/D3 separately staged
(three commits) so the contribution of each fix to the downwind wall is
attributable; fresh suite + ledger; TWS-6 polar before/after; bundle
fidelity spot-check.
