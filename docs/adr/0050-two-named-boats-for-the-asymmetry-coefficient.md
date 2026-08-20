# ADR 0050 — The asymmetry coefficient search finds two windows, not one; ship both as named boats

*Date: 2026-08-19*
*Follows ADR 0049 (`hull.asymmetryLiftCoeff`, wired in and screened at TWS6
only, held at its no-op default). This ADR is the overnight follow-up: an
owner-directed search for a value that reaches the deep course with a
corridor usable by a human, at the smallest possible cost to close-hauled
courses.*

## Context

Owner instruction (2026-08-18, overnight, ~8h budget): find the optimal
`hull.asymmetryLiftCoeff` — a corridor of trims wide enough for a human to
actually use, not one perfect trim, reaching the full/deep course, while
keeping the loss on close-hauled courses as small as possible.

Two measurements bracket every value screened below:

- **Corridor**: `harness/probe-holds-freely.js --oar=up`, TWS6 (and TWS4/10
  spot checks) — settle under the oar, ship it, run 900s, count how many of
  162 candidate trims land within 5deg of the nominal course and have
  stopped drifting. This is the criterion's own "reasonable corridor, not
  one trim" made literal.
- **Cost**: the full acceptance suite (`runAsserts(slow:true)`, i.e. what
  `run_tests.js` runs), specifically `K3`'s two close-hauled pairs —
  bearing-away (TWA70→TWA90) and pointing-up (TWA90→TWA70), both ends, TWS6
  — plus the full `out/polar.csv` diff. `K3` bearing-away is normally
  PASSING (not `xfail`); a regression there is a real, gate-breaking cost,
  not a diagnostic.

## Measured — the response is non-monotonic, with two separate windows

Screen at TWS6, `end=1`, TWA165/168/170 (the ADR 0048 gap's own probe points,
holders out of 162 trims), against K3's two close-hauled pairs (margin =
degrees from the nearest edge of the target's ±10deg band; a negative
number is a FAIL, reported as such):

| coeff | 165 | 168 | 170 | bearing-away margin | pointing-up margin |
|---|---|---|---|---|---|
| 0 (baseline) | 0 | 0 | 1 | 2.3deg | FAIL (`xfail`, ADR 0047) |
| 0.003 | 3 | 4 | 5 | 2.1deg | 5.9deg |
| 0.004 | 5 | 11 | 11 | 1.8deg | 8.3deg |
| 0.005 | 4 | 5 | 13 | 1.5deg | 7.9deg |
| 0.006 | — | — | — | 1.2deg | 6.6deg |
| 0.0075 | 9 | 7 | 6 | 0.4deg | 2.5deg |
| 0.009 | — | — | — | FAIL | FAIL |
| 0.01 | 11 | 11 | 20 | FAIL | (untested at this coeff) |
| 0.0125 | 13 | 12 | 15 | FAIL (badly, +15deg) | 3.5deg |
| 0.0135 | — | — | — | FAIL (badly) | 3.8deg |
| **0.014** | — | — | — | **4.1/6.4deg** | **4.6deg** |
| **0.0145** | **12** | **18** | **18** | **5.0/7.3deg** | **5.0deg** |
| **0.015** | 11 | 17 | 18 | **6.0deg** | **5.5deg** |
| 0.0155 | — | — | — | FAIL (undershoot) | — |
| 0.016 | — | — | — | FAIL (undershoot) | — |
| 0.02 | 8 | 10 | 16 | FAIL + a THIRD check breaks (H3, parked-hull drift) | PASS |
| 0.05 | 3 | 1 | 1 | — | — |

Two separate regions where both K3 pairs hold at once:

- **A wide, forgiving plateau, 0 to ~0.008.** Margins erode smoothly and
  monotonically on the bearing-away side as the coefficient rises (2.3 →
  0.4deg); the pointing-up side rises then falls (peaks near 0.005 at
  7.9deg). `0.004` is this plateau's best-balanced point (min margin
  1.8deg) with a real corridor gain over baseline.
- **A narrow window, [0.014, 0.015].** Bounded by FAILURE on both sides —
  0.0135 overshoots badly (+15deg past the band), 0.0155/0.016 undershoot
  (the boat lands ~15deg on the OTHER side of the target) — a width of
  roughly 0.001-0.0015 on the coefficient axis. `0.0145`, the window's
  centre, has the best margins AND the best corridor of anything measured
  (12/18/18, min margin 5.0deg) — but the coefficient itself must land
  within about a thousandth of that value or the outcome flips to a
  regression in the OPPOSITE direction from where it started.

`0.02` additionally breaks `H3` (parked-hull beam-on drift, previously
untouched by any tested value) — confirms the region above ~0.016 is
unsafe on a THIRD, independent axis, not just K3.

**Full-band confirmation at 0.004** (TWS6, `end=1`, TWA150→180 in full):
`12/6/4/3/5/11/11/21/43/40/44`, against baseline
`7/3/1/1/0/0/1/5/17/23/28` — a real gain at every single point, no
regressions, TWA165-170 (the gap's own core) turned from zero holders into
double digits. Reproduced at TWS4 (`5/13/50` on 165/170/180) and TWS10
(`4/12/34`) — the effect is not a TWS6 artefact. `out/polar.csv` moves
everywhere the coefficient is active (expected — it is leeway-independent,
so it acts at every point of sail with `u≠0`), worst single delta -0.58% at
TWA50/TWS10; typically well under that.

## Decision

**No single value serves both objectives robustly, so ship both windows as
named boats instead of picking one.**

Committing to 0.0145 alone would deliver the best numbers on paper but rests
on a coefficient with zero source magnitude landing within ~0.001 of a
value bounded by failure on both sides — the "re-picked a probe until it
agrees" pattern this project's own conventions warn against (`docs/
README.md`, "Lessons this project paid for"), even though every point here
was screened honestly and nothing was cherry-picked to pass. Committing to
0.004 alone is defensible and was this ADR's working default for most of
the night, but it silently discards a real, larger effect that the search
also found and that a differently-shaped hull could plausibly produce —
there is no source data to say which (if either) matches the real boat.

`core/config.js`'s `BOAT_VARIANTS` already exists for exactly this
situation — named, reproducible, selectable boat configurations — and 'slim'
and 'fat' need no new CSV, since the two variants differ from 'default' in
nothing but this one coefficient:

    BOAT_VARIANTS.slim = 'example_proa_parameters.csv'  (same file as default)
    BOAT_VARIANTS.fat  = 'example_proa_parameters.csv'  (same file as default)
    ASYMMETRY_VARIANT_PATCH = { slim: 0.004, fat: 0.0145 }

Applied in `createConfig()` as a small patch on the CSV-derived base, before
`userConfig` is merged (so an explicit `hull.asymmetryLiftCoeff` override
still wins). `default` and `old` are untouched — `hull.asymmetryLiftCoeff`
stays the field's own literal `0`, so every acceptance figure and coverage
number in this project's entire history keeps meaning exactly what it always
meant. Exposed in the UI's boat-variant selector (`ui/index.html`,
`ui/app.js`) as "PJOA Slim" / "PJOA Fat", alongside the existing "PJOA FOLK
(default)" and "PJOA FOLK — before the ama revision". Neither `tools/
bundle.js` nor `ui/shims/node-fs.js` needed changes — both key off CSV
filenames, and 'slim'/'fat' reuse 'default's own, already-registered file.

## Consequences

- `default`'s own acceptance run is unaffected: `run_tests.js` on `boat:
  'default'` (the implicit choice everywhere in the harness) reproduces the
  exact pre-ADR-0049 baseline, `out/polar.csv` included.
- `slim` and `fat` are not (yet) run through the full acceptance suite as
  their own gated targets — `run_tests.js` and `out/polar.csv`'s byte-gate
  stay scoped to `default`. Standing gap: nothing currently re-runs the
  acceptance set against either named variant on a schedule, so a future
  `/core` change could silently regress one without the build noticing.
- The obtaining side of the criterion (can the boat actually WALK from a
  reach into the deep band, not just hold once placed there) was NOT
  re-verified for either variant tonight — the direct test
  (`harness/probe-fine-walk.js --step=2`, a 15-leg ramped search per end)
  ran for 5+ hours without finishing and was killed rather than left
  blocking the decision. `probe-holds-freely.js`'s own settle-then-release
  method is a different, cheaper instrument that answers a related but not
  identical question (does the boat STAY once it is on the course, not
  whether trim alone can WALK it there from elsewhere). This is the natural
  next measurement for either variant, not assumed by this ADR.
- `sail.verticalLiftFraction`, `hull.yawHeelSign`, `hull.heelClrSign` remain
  the project's other "wired in, measured, held at a default that does not
  activate it" mechanisms — `hull.asymmetryLiftCoeff` on `default` joins
  them, unchanged from ADR 0049. `slim`/`fat` are the first case of shipping
  a genuinely uncertain parameter as two live alternatives instead of
  freezing it at one guessed value or at zero.
