# ADR 0043 — Crew-position search obeys its own advisory limit, and the shunt's repower target is searched, not assumed

*Date: 2026-08-11*
*O6 and O7 of `docs/work-order-2026-08-10-ostrzenie.md`.*

## Context

O1 (same work order) split two trims that a hand-maintained table used to
conflate: TWA90/TWS6's holding trim (`crewPos=0.3`) and its speed-optimal
trim (`crewPos=1`). K3's shunt-with-the-oar-shipped check depowers from the
former and re-powers to the latter — a distinction the table had erased. That
exposed a capsize: repowering to `crewPos=1` on a nearly-stopped boat sinks
the ama outright (M2's mechanism — the crew's weight, with no sail-heeling
moment left to counter it). O6 measured four fixed repower targets, all
short: the speed optimum capsizes, the holding trim survives at only 19% of
speed, two others drift off course.

The root cause: `core/config.js` derives `crew.posMax = ama_buoyancy_kg /
crew_mass_kg = 0.933` and says outright that `crewPos` above it sinks the ama
rather than merely loading it hard — but the limit is advisory, enforced only
by the interactive UI (`ui/app.js` clamps drag and keyboard input to it).
Three harness searches bypass the UI and construct `controls` directly:
`harness/polar.js`'s `CREW_POS_SEARCH`, `harness/asserts-helpers.js`'s
`findHoldingTrim`, and `harness/asserts-polar-helm.js`'s `S3`, all searching
up to a bare `1.0`. TWA90/TWS6 — exactly K3's shunt point — is one of the
points whose reported speed optimum sits past the limit.

## Decision

Two owner decisions (2026-08-11), independent but resolved together because
the second built on the first:

**O7.** Clip all three searches to `crew.posMax` instead of `1.0`. Keep the
limit's *value* unchanged (0.933) and keep it *soft* — enforced by the UI
only, not hardened in `/core`. `core/stability.js` and `core/hydro.js` still
compute whatever `crewPos` they are given; nothing there changed.

**O6.** Rather than pick a fifth fixed repower target, search `crewPos`
itself for the fastest one that does not capsize the boat (during the ramp or
the 120s hold that follows), among `{posMax, 0.7, 0.5, 0.3, 0.1, 0}`. Every
candidate is evaluated — no first-hit early exit — because this asks for a
maximum, not an existence answer, and O6's own two prior data points did not
rule out a non-monotonic capsize boundary. Sheet and brail stay at the
polar's speed optimum throughout: O6's diagnosis is that `crewPos`, not sail
trim, is the axis responsible.

## Measured

**O7's clip alone**, before O6's search ran at all, already removes the
capsize: `crewPos=0.933` survives where `1.0` did not. `out/polar.csv`
changes in 11 of 84 rows (TWA50-130/TWS6, TWA40-50/TWS10) — a slightly wider
footprint than the 8/42 points work order Part II had estimated (an estimate,
not a measurement), all small speed decreases (roughly 0.5-2%), consistent
with losing the top slice of crew hiking.

**O6's search**, evaluating all six candidates, confirms `crewPos≈0.933` (not
some lower, more conservative point) is the fastest surviving choice — a
measured maximum, not an assumption. The shunt check still does not pass:
`capsizedDuringRepower=false`, `capsized=false`, converged and restoring on
both ends, but `speedRatio=33-34%` against the check's 50% floor. It remains
`xfail`, for a narrower reason than before — a speed shortfall on a boat
building from near-zero, not a capsize.

## Consequences

- `harness/polar.js`'s `CREW_POS_SEARCH` constant becomes `crewPosSearch(config)`,
  a function — `posMax` depends on the boat variant (`ama_buoyancy_kg` /
  `crew_mass_kg`), so a module-level constant could not express it. Same
  pattern in `findHoldingTrim` and `S3`.
- `out/polar.csv`'s byte gate absorbs the 11-row change deliberately, per
  `docs/README.md`'s own convention (review the diff, commit if intended).
- The shunt check's open question changes shape: not "which trim to return
  to" (O6's original framing) but "why does even the fastest safe trim only
  recover a third of the boat's speed, and is more recoverable by another
  axis or a longer ramp" — not measured here, and not blocking anything else
  in the work order.
- `crew.posMax` remains advisory in `/core`. Any future caller that builds
  `controls` directly (a new harness script, a replay path) can still exceed
  it; only the UI and these three searches respect it. That gap was
  explicitly left open by the owner's decision, not overlooked.
