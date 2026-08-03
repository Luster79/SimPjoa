# docs/ — index

*Last reviewed: 2026-08-02*

`ARCHITECTURE_physics_core_EN.md` in the repo root is the context map for the
code. This file is the map for everything in `docs/`, which is now large enough
to need one.

Read order for someone new: the ADRs, then the current work order's open items.
The findings documents are evidence, not instructions — consult them when you
want to know *why* a number is what it is.

## Decision records — `adr/`

Append-only. Never edit an old ADR; supersede it with a new one.

| ADR | Subject |
|---|---|
| 0001 | Slender-hull residuary model (replaced the wave-resistance wall) |
| 0002 | Physical ama form factor |
| 0003 | Measured-anchored aero table (Di Piazza v2) |
| 0004 | Measured hull side force (Flay) |
| 0005 | `rudder.coeff` from low-AR blade lift theory |
| 0006 | Residuary tail plateau — supersedes 0001's *tail calibration* only |
| 0007 | Composite sail CD + brail-effective area — supersedes 0003's CD *form* only |
| 0008 | Windage |
| 0009 | Data contract for digitised sources — every file in `data/` has a reader, its own method, and the source's own definitions |
| 0010 | Geometric sheeting floor (`sail.deltaMinDeg`) — the rig will not strap flat |
| 0011 | Tack position as a steering control — the helm lever can finally reach zero |
| 0012 | Leeboard as the movable lateral plane — pairs with 0011 to make a real CE/CLR balance |

## Work orders — what to do

| File | Status |
|---|---|
| `work-order-2026-07-22.md` | Nearly complete. Open: **R13** (monoliths), **R10** (lint/types). |
| `work-order-2026-07-30-physics-audit.md` | **Complete** — F1-F16 all executed. |
| `work-order-2026-08-02-steering-and-sources.md` | In progress. Stages 0-3 done (S5, S1, S4a, S6, S2, S3). Open: **S4b**, **S7**, **S8**. Note: S2 and S3 got ADRs 0011 and 0012 separately rather than one shared 0011, so S8's ADR will be 0013. |

## Findings — evidence for what was done

| File | Covers |
|---|---|
| `findings-2026-07-22-work-order.md` | Execution of the 07-22 order |
| `findings-2026-07-30-physics-audit.md` | Execution of the physics audit, with the measured numbers behind every change |
| `findings-2026-08-02-steering-and-sources.md` | Execution of the 08-02 order, stage by stage |
| `capsize-margins-2026-07-30.md` | Margin sweep run as a precondition for the audit's block D |
| `diagnostic-2026-07-22-residuary-hump.md` | The investigation that produced the 07-22 physics items |

## Review cycle

| File | Covers |
|---|---|
| `review-2026-07-22-maturity.md` | External maturity review of the whole project |
| `review-2026-07-22-response.md` | Point-by-point response, including where it disagrees |

## Conventions worth knowing before changing physics

- **`out/polar.csv` is byte-gated in CI.** Any change to the model or the
  search will fail that gate once, by design. Review the diff; if it is
  intended, commit the regenerated file with the change. Do not work around the
  gate.
- **`dist/simulator_standalone.html` is a committed build artifact.** Commit
  sources first, then rebuild and commit `dist/` separately — that way the
  version stamp is a clean commit hash rather than `<hash>+dirty`.
- **`xfail` means measured and reported, not forgotten.** An `xfail` that
  starts passing fails the build: it means the model moved and somebody has to
  decide whether to promote it.
- **Re-anchoring an assertion band is normal after an intended physics change;
  re-picking a probe until it agrees is not.** If a claim only holds at a
  hand-chosen operating point, measure it across a grid and report the tally.
