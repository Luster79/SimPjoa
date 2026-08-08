# Findings — work-order-2026-08-05-statecznosc-kierunkowa (D2-D4)

*Last reviewed: 2026-08-08*

Evidence for D2, D3, D4 of `work-order-2026-08-05-statecznosc-kierunkowa.md`,
run in the order Part IV prescribes (cheap items first). D1 is not in this
document — see its own section at the end for why.

## D4 — fore-aft symmetry is genuinely zero, not accidentally zero

**Claim to check:** the hull is bow-stern symmetric by construction (it must
shunt), so nothing in the model should smuggle in a rocker/deadrise moment
that isn't one of the three deliberate, documented CLR shifts
(`hull.clrXFraction`, `hull.crewForeAftTrimCoeff`, `hull.heelClrShiftCoeff`).

**Measured.** With all three shifts zeroed (`clrXFraction = 0`,
`crewForeAftTrimCoeff = 0`, `heelClrShiftCoeff = 0`), `hullSideForce`'s yaw
moment is zero to floating-point noise (~1e-13 N·m) for leeway swept
-2..2 m/s and for heel swept ±0.3 rad, including with heel alone and no
`heelClrShiftCoeff`:

```
clrXFraction=0, crewForeAftTrimCoeff=0, heelClrShiftCoeff=0, crewPosX=0, phi=0:
  v=-2:   yawMoment=-9.095e-13
  v=-0.5: yawMoment=-1.279e-13
  v=0.5:  yawMoment=1.279e-13
  v=2:    yawMoment=9.095e-13
phi=-0.3: yawMoment=1.279e-13
phi=0.3:  yawMoment=1.279e-13
```

**Why this is the right check.** `config.js` has no field describing hull
shape as a function of station beyond the linear taper `stationWeights`
already builds from `clrXFraction`/crew trim/heel — there is no separate
rocker or deadrise parameter anywhere in `/core` (confirmed by grep: the only
`prismatic` hit is a resistance-hump comment, unrelated to lateral shape).
So there is nothing *left* that could carry a hidden asymmetry once the three
named shifts are zeroed; the residual being exactly zero (to machine
precision) is the whole proof, not a sample of it.

**Conclusion: confirmed, not an oversight.** The non-zero fore-aft moments
the model does produce all trace to one of the three named, ADR-justified
shifts (`clrXFraction`: ADR 0016/0017; crew trim: intentional steering
control; heel: T3, `docs/work-order-2026-08-05-sterownosc.md`). Record this
as settled — no code change.

## D3 — the ama's own lateral-plane term is bounded by drag×spacing

**Claim to check:** T4's addition to `amaDrag` (the ama's own strip-integrated
side force, `yawMomentSide` in `core/hydro.js:404-415`) should not produce a
yaw moment larger than the independent upper bound `|Fx_drag| * ama.spacing`
— the same lever the boat's *established*, manual-supported "ama drag turns
the bow" mechanism (`yawMomentDrag`) already uses.

**Measured** (`u=3.5, phi=-0.15, crewPos=0.35`, representative pressed-ama
trim):

At `r=0` (steady state, no yaw rate) `yawMomentSide` is exactly zero for
every leeway `v` tried (-0.5..0.5 m/s) — same mechanism as D4: the ama's own
station distribution is uniform and symmetric about its centre with no
`clrX`-equivalent offset, so equal leeway at every station cancels under the
moment integral.

At small residual yaw rate (the regime an equilibrium/near-equilibrium sail
actually sits in):

| r (rad/s) | yawMomentSide (N·m) | bound = \|Fx\|·spacing (N·m) | ratio |
|---|---|---|---|
| ±0.02 | ∓7.5 | 102.7 | 0.07 |
| 0.05 | -18.5 | 102.7 | 0.18 |
| 0.10 | -36.0 | 102.7 | 0.35 |
| 0.20 | -74.4 | 102.7 | 0.72 |
| 0.30 | -119.3 | 102.7 | 1.16 |
| 0.50 | -155.1 | 102.7 | 1.51 |

**Conclusion: within bound at realistic operating points, exceeds it only
under aggressive turning.** `r` at steady sailing (or the small residual under
an autopilot/rudder-free settle) is on the order of hundredths of a rad/s, not
tenths — the term stays at 7-35% of the bound there. It only crosses the
bound past `r ≈ 0.28 rad/s` (~16°/s), a rate that belongs to a turn or a
shunt transient, not to the steady TWA160 figure (+2.8 N·m) the work order's
Part I.3 quotes — that figure is two orders of magnitude below where the bound
would even be tested. No code change; the term is doing what T4 intended and
is not overstated.

*(The repo already had an ad hoc probe at `scratch/evaluate_d3.js`, at
`r=0.3` — right at the point this sweep shows the bound starts to be
exceeded. That is not a bug in the term; `r=0.3 rad/s` sustained is not a
steady-sailing state, so that single point does not generalise the way the
sweep above does.)*

## D2 — Munk moment magnitude: already audited, still defended

**Scope, per the work order: audit only, no code.** The owner's earlier
decision to leave `hull.massSway` (and its `addedSwayPerLength = ρ·π·T²/4`
divisor) untouched stands; this section only checks whether that decision is
still defended against the current numbers, not whether to change it.

**It already has a full audit: ADR 0018.** That ADR is the D2 item this work
order asks for, written 2026-08-04, and its numbers still apply unchanged
(nothing has touched `addedSwayPerLength` since):

- The `/4` divisor (2D cylinder analogy) is half the derivable plate value
  (`/2`) for this hull's B/T ≈ 1.4 deep-V section — the free surface acts as
  an image plane, which the `/2` form assumes and the `/4` form does not.
- Clarke's `Y_v̇` regression implies ≈1010 kg of added sway mass; the model
  carries 455 kg — **less than half**, i.e. the model's Munk term is
  *smaller* than the ship-hull regression suggests, not inflated.
- Doubling it (to match the regression) was tried and reverts four of the
  owner's manual's steering rules (sheet-trim-in bears away reverses,
  windward brail reverses, crew-forward/aft luff-bearaway both fail, the
  parked-hull drift test pins at a fixed crab angle) — see ADR 0018's table.
  The manual outranks a ship-hull regression extrapolated to a B/T (1.4) far
  outside its fitted range (2-4).

**Consistency check against this work order's own number.** Part I.3 puts
Munk at +3.9 N·m of the 6.6 N·m TWA160 residual — the single largest
contributor. ADR 0018's own reference-state table (`u=3.87, v=-0.217`) shows
the combined Munk+hull moment sitting at a constant **0.65 of the Clarke
`N_v` estimate** across four widely-spaced states, i.e. the model is
*consistently* below the regression, not below at the reference state and
above at TWA160's state. There is no sign in the current numbers that the
audit's conclusion has become stale.

**Conclusion: obronione (defended), unchanged.** No code touched. If the
owner ever revisits `massSway`, ADR 0018's steering-rule table is the cost
that decision has to clear, and it has not become cheaper since 2026-08-04.

## What D2-D4 together mean for D1

None of D2, D3, D4 turned up a bug feeding the 6.6 N·m TWA160 residual —
each of the non-D1 contributors is either confirmed correct by construction
(D4), bounded and behaving as intended (D3), or already audited and defended
against a stricter standard than this work order applies (D2). The residual
is not hiding in the parts this document covers. That leaves D1 — the
hull's own zero yaw stiffness — as the only place left to look, exactly as
Part V of the work order anticipated it might.

D1 is deliberately not attempted in this document or this commit (Part III:
*"Nie łączyć D1 z niczym innym w jednym commicie"*). See the work order's own
Part II.D1 and the decision recorded in the session that produced this
document.
