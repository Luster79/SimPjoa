# ADR 0027 — The ama drags the bow up, and the dead run is unstable

*Date: 2026-08-04*
*Refines ADR 0026. Does not supersede it — 0026's finding about the fore-aft
arms stands; this corrects its attribution of the round-up and adds the
measurement that follows from it.*

## Context

ADR 0026 established that the fore-aft trim arms have no downwind authority,
and attributed the deep-course round-up to the hull's directional stability. It
reached that from the settled state, where the hull's moment reaches −116 N·m
and balances the Munk moment.

That is the right reading of where the boat *ends up*. It is the wrong reading
of what *starts* the turn, and the difference decides which control to reach
for. Sweeping the controls at the release instant, TWA 140 / TWS 6:

| crewPos | sail | hull | **ama** | drift |
|---|---|---|---|---|
| 0.00 | +6 | −18 | **+11** | 21.6 °/min |
| 0.20 | +6 | −12 | **+35** | 29.5 °/min |
| 0.35 | +6 | −8 | **+53** | 31.0 °/min |
| 0.60 | +7 | −6 | **+62** | 31.6 °/min |

## Decision

Record that **the dominant round-up moment at release is `amaDrag`'s yaw
moment** — the float's drag acting at its own lateral offset — not the hull's
and not the rig's. The hull's large moment is what *damps* the resulting turn;
it is not what causes it.

This matters because it identifies the control. Crew weight sets the float's
immersion, so moving the crew **inboard, off the ama** is what attacks the
cause. That is the manual's own deep-course prescription, and combined with
pulling the windward brail to full travel it works:

| TWA | brailWind, crewPos 0 | drift |
|---|---|---|
| 140 | 0.6 | 21.6 °/min |
| 140 | 0.8 | 17.2 °/min |
| 140 | **1.0** | **13.8 °/min** — holds |
| 160 | 0.6 | 35.2 °/min |
| 160 | 1.0 | 31.1 °/min |

Note what the plan's own recipe got wrong twice over: it kept the crew at
`crewPos 0.35`, which is the setting that *maximises* the round-up moment, and
spent its authority on fore-aft arms that have none downwind.

**The near-dead run is a different problem and is not a trim problem at all.**
At TWA 160 with the carrot at full travel and the crew inboard, every trim
moment at release is within a few N·m of zero — sail +3, hull −2, ama +4 — and
the boat still rounds up at 31 °/min. Nulling the static moments does not stop
it. What remains is a directional *stability* deficit: the hull supplies no
restoring yaw moment and the Munk moment is destabilising, so any perturbation
grows. It is the same deficit S1b/S1c carry for reaching courses, and it is why
the manual prescribes the paddle for downwind steering rather than claiming a
released rudder holds (C-A).

## Consequences

- New assertion **C-C** measures the manual's own recipe: 1/2 points hold
  (TWA 140 at 13.8 °/min; TWA 160 does not), tagged `xfail:STEERING`. C-B is
  kept beside it — it is what records why the plan's approach fails, and that
  is what stops the attempt being repeated.
- **No constant was changed for this.** Everything above is reachable with the
  controls the boat already has. `sail.yceBrailShift` was swept (0.0 → 0.9
  moves TWA 140 drift only 32.9 → 29.7 °/min at `crewPos 0.35`) and left at
  0.6: it is a real lever but a second-order one next to the crew.
- The polar is untouched — the sweep fixes `crewPosX` at 0 and this finding is
  about `crewPos`, which it already searches.
- **Where the remaining work is.** A broad reach is now holdable rudder-free
  with the manual's own technique. The near-dead run will not become holdable
  by trimming anything, so if it should hold, the model needs the missing
  restoring terms — the heel-dependent hull force and the ama's absent lateral
  plane — rather than another coefficient. Until then C-A/C-C record it as
  measured, and the manual's answer is the paddle.
