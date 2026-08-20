# ADR 0054 — Each named boat gets its own CSV and its own byte-gated polar

*Date: 2026-08-20*
*Owner instruction, after ADR 0053 quantified how differently `slim`/`fat`
behave from `default`: "civilize boat management — each boat should have its
own config file, and each should keep its own polar."*

## Context

`slim`/`fat` (ADR 0050) were built to reuse `default`'s own CSV
(`example_proa_parameters.csv`) plus a JS-level lookup table
(`ASYMMETRY_VARIANT_PATCH`) that patched in the one field they differ by
(`hull.asymmetryLiftCoeff`). That was a deliberate, reasoned choice at the
time — the two variants share every OTHER physical parameter, and
duplicating ten geometry rows across two more files to carry one differing
number looked like unwarranted repetition.

It also meant `slim`/`fat` were structurally unlike `default`/`old`: two of
the four named boats were fully described by a file the way source data is
supposed to be (ADR 0009's data contract — "every digitised data file
carries a self-describing header... the source's own definitions"), and two
were a file plus an invisible code-level override nothing about the file
itself disclosed. Reading `pjoa_slim_parameters.csv` (which did not exist)
would not have told you `slim` existed, let alone what made it different.

Separately, `out/polar.csv` was a single committed file, always computed
from whatever `createConfig()` resolves to with no `boat` argument —
`default` only. ADR 0053 measured that `slim` and `fat` fly a genuinely
different polar (worst deltas +1.0% and +3.2%) and complete a walk `default`
cannot at all; none of that was ever captured in a committed, byte-gated
reference the way `default`'s own behaviour is.

## Decision

**One CSV per boat, one polar per boat.**

### Config

`data/pjoa_slim_parameters.csv` and `data/pjoa_fat_parameters.csv` are full,
standalone files — the same ten geometry rows `example_proa_parameters.csv`
carries, verbatim, plus their own `asymmetry_lift_coeff` row (0.004 / 0.0145).
`example_proa_parameters.csv` and `proa_parameters_old.csv` each gain the
same row too (0, for both — neither has ever screened a nonzero value), so
all four files now share the identical row set; none is a partial spec the
others complete.

`BOAT_VARIANTS` (`core/config.js`) now points every key at its own file.
`ASYMMETRY_VARIANT_PATCH` is deleted; `hull.asymmetryLiftCoeff` reads
`p.asymmetry_lift_coeff ?? 0` from whichever CSV `loadBoatParamsCSV` loaded,
the same mechanism every other CLOSED/FREE parameter in that object already
uses — no special case left for this one field. `tools/bundle.js` and
`ui/shims/node-fs.js` both register the two new files, per the existing
convention for any new CSV (`docs/README.md`'s own "Conventions" note).

**The duplication is a deliberate, named tradeoff, not an oversight.** The
ten geometry rows now exist in four places. If the PJOA FOLK's own measured
geometry is ever revised (a new `pjoa.eu` figure, a corrected derivation),
all four files need the same edit by hand — there is no inheritance
mechanism, and nothing enforces the four staying in sync beyond a human
remembering to touch all of them. This is the cost ADR 0050 avoided by
patching instead of duplicating; it is accepted now because the owner asked
for uniformity over that efficiency, and because the four files are
identical except one row, making a divergence easy to spot in a diff.

### Polar

`run_tests.js` now computes and writes `out/polar_<boat>.csv` for every key
in `BOAT_VARIANTS` (`default`, `old`, `slim`, `fat`) on every full run —
`out/polar.csv` (the old, `default`-only name) is retired. `default`'s own
file reuses the exact `config` object `runAsserts` already ran against (no
redundant second `createConfig`); the other three each get a fresh
`createConfig({ boat })`. The CI byte-gate (`.github/workflows/ci.yml`)
now diffs `out/polar_*.csv` as a set instead of the single old filename —
a change to any one boat's model or search trips the gate on that boat's
file specifically, the others stay silent if they are genuinely unaffected.

**`runAsserts` itself — the pass/fail acceptance assertions (K3, S1a/b/c,
AC-1.1/1.2, capsize scenarios, all of it) — still runs ONLY against
`default`.** This ADR does not extend the CI gate's own pass/fail semantics
to `slim`/`fat`/`old`; that would be a materially larger change (deciding
what "pass" means for boats the assertion bands were never anchored
against) and was not asked for. `slim`/`fat` already have their own
one-off full-suite run recorded in ADR 0053 (`scratch/
boat_full_validation.js`) — this ADR gives them a permanent, regenerated-
every-run polar snapshot, not a permanent second acceptance gate.

## Consequences

- `out/polar.csv` no longer exists; anything that read it by that literal
  name (a handful of comments, this project's own root `README.md`, and two
  `scratch/` diff scripts) now reads `out/polar_default.csv`. Historical ADR
  citations of the old filename are left untouched — they are dated
  measurements under the naming that existed then, not descriptions of
  current structure.
- `run_tests.js`'s full run now computes four polar sweeps instead of one —
  slower than before by roughly 3x whatever one `computePolar(SWEEP_CI)`
  call costs. `--fast` is unaffected (it already skipped all polar work).
- `slim`'s own polar/full-suite runs are the expensive ones going forward
  (ADR 0053 measured its obtaining-walk cost at ~90min/end, an order of
  magnitude past `fat`'s ~7min — the polar sweep itself is far cheaper than
  that walk, but shares the same "thinner corridor, more search" character).
- Verified: all four boats resolve their own geometry and coefficient
  correctly post-refactor (`default`/`old` unchanged from before, `slim`
  0.004, `fat` 0.0145); `run_tests.js --fast` unaffected; full run produces
  four `out/polar_<boat>.csv` files, `default`'s byte-identical to the
  retired `out/polar.csv`'s own last committed content.
- Untouched: whether the CI gate's own acceptance assertions should ever run
  against more than `default` is still not decided by this or any prior ADR.
