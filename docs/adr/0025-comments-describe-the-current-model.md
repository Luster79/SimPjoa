# ADR 0025 — Comments describe the current model; history lives in the ADRs

*Date: 2026-08-04*

## Context

Comments in `/core` and the context map `ARCHITECTURE_physics_core_EN.md` had
grown into a round-by-round development narrative. A typical parameter carried
its whole history: the value it used to have, the round that changed it, the
work order that asked for it, the measurement that justified the change, and
often the argument that was later withdrawn.

That narrative was written for good reasons and it caught real defects — the
project's own lessons ("measure it, do not read it"; "do not compensate in the
wrong parameter") were learned by keeping receipts. But it had passed the point
of paying for itself:

- `ARCHITECTURE_physics_core_EN.md` reached 1022 lines against the project's own
  ~500-line anti-bloat guideline, and had been flagged as over it since round 6
  without being split.
- The document described superseded models beside current ones without
  distinguishing them, so it could no longer be read to find out how the code
  works today.
- Comments described the *history of the code* rather than the code. A reader
  looking for what a term does had to reconstruct it from what it used to be.
- The same history was already recorded twice elsewhere: in `docs/adr/` for the
  decisions and in `Archive/` for the round documents the comments cited.

## Decision

Comments in `/core` and the root context map describe and justify **the current
model only**.

What stays in a comment:

- what a term does, and the physical argument for its form;
- provenance of a number — the source, measurement or derivation behind it;
- constraints and traps that still bind, stated as rules rather than as the
  story of the bug that revealed them (e.g. "no `end` factor: +x already points
  at the active bow");
- warnings that still apply ("do not tune this", "restore only together with
  the hull's own term", "these bounds must never become knobs");
- known limitations of the current model, stated rather than hidden.

What moves out:

- round numbers, work-order item numbers and their document names;
- previous values and the before/after measurements that motivated changes;
- arguments that were considered and rejected;
- notes about parameters that no longer exist.

`ARCHITECTURE_physics_core_EN.md` is rewritten to match, and its previous
edition is preserved verbatim as
`Archive/ARCHITECTURE_physics_core_EN_2026-08-04_historical.md`, headed as
history and marked not to be used as a guide to the current code.

This ADR does not extend to `/harness` or `/ui`. `harness/asserts.js` in
particular carries its history in assertion **detail strings**, which are
printed test output and part of the `xfail` contract ("measured and reported,
not forgotten") — not comments, and not covered here.

## Consequences

- `/core` drops from 3150 to 2690 lines; the context map from 1022 to 555. No
  executable line changed: the cleanup was verified by stripping comments from
  both revisions and diffing, and by the full suite (95/95, 7 `xfail`
  unchanged) plus the `out/polar.csv` byte gate.
- The ADRs and `Archive/` become load-bearing rather than supplementary. A
  reader who wants to know *why* a value is what it is now has exactly one
  place to look, and following the ADR pointer is no longer optional.
- The risk this accepts: a future change can no longer see, from the comment
  alone, which values were tried and rejected. That risk is why provenance and
  the "do not tune this" warnings were kept explicitly — those are the parts
  that were doing the protective work, and they survive in full.
- The context map is 555 lines, still above the project's ~500 guideline.
  Splitting per-module sections into `docs/<module>.md` remains the standing
  proposal; it is not done here because this change was scoped to removing
  narrative, not to restructuring.
