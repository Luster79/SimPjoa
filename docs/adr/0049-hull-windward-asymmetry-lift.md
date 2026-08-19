# ADR 0049 — Hull windward-side asymmetry lift: a credible third mechanism for the deep-course gap, screened but not adopted

*Date: 2026-08-18*
*Follows `docs/adr/0048`'s open question: why strong static restoring stiffness
(dM/dψ down to −44 N·m/deg) coexists with dynamic escape in TWA162-174.*

## Context

The owner reports, from direct testimony by the PJOA FOLK's own builder (the
same authority level as the owner's manual, `docs/README.md`'s "primary
source" — **not** a citation with a magnitude): the vaka's windward side —
the ama's own side, since the ama is kept to windward in every normal sailing
configuration and never relocates (`state.js` Conventions) — is built
slightly more convex than the leeward side. Flow along the asymmetric section
then behaves like a cambered foil, generating a lift-like force toward the
convex (windward/ama) side that is present even at zero leeway.

No hull-scale equivalent existed before this. `hydro.js`'s `hullSideForceCoeff`
(Flay's measured CS(leeway), ADR 0004) is exactly 0 at zero leeway by
construction — the source data itself never measured a zero-leeway point.

## Implementation

`hull.asymmetryLiftCoeff` (`core/config.js`), default **0**. In
`hullSideForce()` (`core/hydro.js`), added as a single lumped term after the
per-station loop:

    Fy += asymmetryLiftCoeff * 0.5 * rho_w * u * |u| * effectiveLateralArea * end

A single closed-form term, not per-station: the source gives no fore-aft
distribution, and `HULL_STATIONS`' own positions are symmetric about x=0 by
construction, so spreading it uniformly across stations would net to this
same total Fy and exactly zero yaw moment anyway. `u*|u|`, not `u²`: fades
going into reverse rather than assuming the mechanism reverses the same way
at sternway. No induced-drag Fx contribution — no measured L/D relationship
exists for this term to derive one from. `end` threaded as a new trailing
optional parameter (default 1, matching `heaveZ`'s own pattern) — only
`core/integrator.js`'s live path passes the real `state.end`; the isolated
probes in `harness/asserts-hull-ama.js` and `scratch/` are unaffected as long
as the coefficient stays 0.

Verified at coefficient 0: byte-identical to pre-change baseline on
`probe-holds-freely.js --twa=165,168` (TWA165/168, the two zero-holder gap
points) — confirms the addition is a true no-op at its default.

## Measured

**Screen** (`harness/probe-holds-freely.js --oar=up`, TWS6, `end=1`, deep-band
gap points, holders out of 162 trims):

| coeff | TWA165 | TWA168 | TWA170 |
|---|---|---|---|
| 0 (baseline) | 0 | 0 | 1 (ADR 0048's sub-degree saddle) |
| 0.005 | 4 | 5 | 13 |
| 0.0075 | 9 | 7 | 6 |
| **0.01** | **11** | **11** | **20** |
| **0.015** | **11** | **17** | **18** |
| 0.02 | 8 | 10 | 16 |
| 0.05 | 3 | 1 | 1 |

A broad plateau of strong improvement across roughly 0.005-0.02 (a full order
of magnitude), peaking around 0.01-0.015, falling back toward baseline by
0.05 (a magnitude comparable to CS at ~8° of measured leeway — no longer a
subtle camber, a real foil). The shape — wide, smooth, with a genuine
interior optimum rather than a single sharp point — is what a real physical
mechanism looks like, not a curve-fit to one target.

**Symmetry** (`--end=-1`, coeff=0.01): TWA165/168/170 give 11/11/20,
matching `end=1` **digit-for-digit** on every reported field (landing TWA,
error, trim). No `end`-flip defect — the class of bug that has previously
shipped for four rounds at a time (ADR 0016, 0023).

**Full acceptance suite + polar** (`runAsserts(slow:true)` + `computePolar`,
coeff=0.01, via `scratch/asym_full_validation.js` — does not touch the
committed `out/` files):

- 96/98 non-xfail assertions pass (baseline 98/98). **Two new failures**, both
  `K3` bearing away (TWA70→TWA90, TWS6, both ends): previously held at
  TWA97.7/97.9 (inside the ±10deg band around 90), now overshoots to
  TWA101.6/101.8 — 1.6-1.8deg past the band. A real cost, the same shape of
  trade ADR 0047's windage term found on the neighbouring pointing-up pair:
  the deep band and the close pointing/bearing-away pairs pull in opposite
  directions on this boat.
- **Three xfail promotions** (would-be build failures under this project's
  own rule that a promotion needs a human decision, not a silent pass):
  - `C-C` (the manual's own downwind recipe: carrot + crew off the ama + mast
    toward vertical) goes from 1/2 (TWA160 leg failing at 16.2deg/min against
    a 15 ceiling) to **full PASS**. This is a check measured directly against
    the project's highest-authority source.
  - `K3` shunt-then-hold, both ends: clears the 50%-of-polar speed floor that
    ADR 0043 left it short of (33-34% then).
- `out/polar.csv`: **42/42 rows differ** from the committed baseline — the
  term is active at every point of sail with u≠0, not just the deep band, so
  this is a global model change, not a localised patch. Worst single-row
  delta: TWA90/TWS10, 7.1465 → 7.3041 m/s (+2.2%, faster).

## Decision

**Coefficient stays at its verified-no-op default of 0.** The mechanism is
wired in, screened, symmetry-checked, and full-suite-checked — but adopting a
specific nonzero value as the shipped default is a decision this project's
own conventions reserve for the owner, for two independent reasons:

1. **No quantitative source.** Existence and direction are builder testimony
   at the owner's own authority level; the magnitude (0.01-0.015 screening
   best) is this project's own order-of-magnitude estimate, not a number
   anyone measured on this boat. `docs/parameter-register.md` classifies it
   FREE — the register's own rule is that a FREE value may move without an
   ADR for the move itself, but "a change large enough to shift model
   behaviour materially should still get one, same as any physics change,"
   and 42/42 polar rows changing plus three promotions clears that bar by a
   wide margin — hence this ADR, ahead of any adoption decision.
2. **A genuine trade, not a free lunch.** The K3 bearing-away regression is
   real and measured, not a search artifact — same as ADR 0047's own trade on
   the neighbouring pointing-up pair. Whether closing the deep band is worth
   1.6-1.8deg of overshoot on TWA70→90 is a judgement about which failure
   mode matters more, which is exactly the kind of call this project's
   conventions keep with the owner (see the K3-vs-matrix tension the
   `work-order-2026-08-16-osiagalnosc.md` R5 position already raised for a
   different reason).

If adopted, three things follow directly and are NOT done by this ADR:
regenerate and commit `out/polar.csv` (the byte-gate will trip on the very
next CI run otherwise); explicitly promote the three xfails identified above
(or re-anchor `K3`'s bearing-away band, matching how ADR 0047 handled its own
regression); rebuild `dist/simulator_standalone.html`.

## Consequences

- **Directly answers ADR 0048's open question**, at least as a candidate: a
  leeway-independent lateral force is exactly the missing "third hypothesis"
  — a real mechanism can turn the static-restoring/dynamic-escape
  contradiction into an ordinary held equilibrium, because it changes the
  boat's natural leeway at a given trim, which feeds back into every other
  leeway-dependent yaw term (hull CLR migration, ama CLR migration, sail
  alpha via apparent wind) even though the term itself carries zero direct
  yaw moment.
- Does **not** close ADR 0048's mechanism question on its own terms — this
  ADR did not re-run the basin-of-attraction probe (`probe-basin.js`) or
  re-derive the static-stiffness-vs-dynamic-escape link at the new
  coefficient; it measured the downstream symptom (holders count), not the
  upstream mechanism ADR 0048 left open.
- `hull.asymmetryLiftCoeff` joins `sail.verticalLiftFraction`,
  `hull.yawHeelSign`, `hull.heelClrSign` as a mechanism that is **wired in,
  measured, and held at a default that does not activate it** pending a
  decision that is not a physics measurement.
- Untouched by this ADR: capsize margins at other operating points beyond
  what the full suite's own capsize checks already exercise, TWS4/TWS10
  screening of the same deep-band gap (only TWS6 was screened), and whether a
  finer coefficient grid between 0.01 and 0.015 finds a materially better
  point than either.
