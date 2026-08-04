# ADR 0021 — Re-parameterised onto the real PJOA FOLK

*Date: 2026-08-04*

## Context

`data/example_proa_parameters.csv` has always carried a disclaimer: the
dimensions were "order of magnitude per Gary Dierking's designs: T2 / Wa'apa …
not a specific boat's measured plans". Meanwhile the project's highest
authority — the owner's manual — is written for **this** boat, and every
acceptance criterion is checked against it. The simulator was being judged
against one boat's handbook while carrying another boat's dimensions.

The owner supplied the PJOA FOLK plans brochure; its dimensioned sheets are
reproduced at ~93 ppi and are not measurable. The designer's own page publishes
the principal dimensions, and they differ substantially.

## Decision

Adopt the published figures, and derive the rest by stated rule rather than by
taste.

**Measured** (pjoa.eu):

| | was | now |
|---|---|---|
| hull length | 5.5 m | **5.0 m** |
| overall beam (ama spacing) | 2.5 m | **3.1 m** |
| sail area | 12 m² | **8 m²** |
| ama mass | 25 kg | **13 kg** |
| displacement | 190 kg | **165 kg** (rigged 85–90 less the 13 kg ama, plus one 90 kg crew) |

**Not published — scaled from the length ratio 5.0/5.5**, and labelled as such
in the CSV: hull beam (0.41 m), ama length (3.2 m), ama buoyancy (60 kg, cubed
— it is a volume), hull lateral area (1.5 m²), wetted surfaces, windage areas,
CLR depth.

**Corroborated and kept:** `CE_height_m` = 2.0 m. The source gives a rig height
of 5.4/5.9 m, and a crab claw peaked near the masthead has its centroid near
2 m. What was a free estimate now has a source behind it.

**`sail_apex_angle_deg` = 50°** is unchanged and still unsourced.

## Consequences

**The real boat is markedly stiffer**: 24 % more righting arm and a third less
sail. Three capsize-provocation checks stopped provoking and were re-anchored
by **re-finding the same physical state**, not by relaxing the claim:

- **T6** gust peak 11.5 → 11.75 m/s. The old boat reached maxPhi 25.1° at 11.5;
  the new one reaches 24.4° at 11.75. The survive/capsize knife edge that the
  check deliberately does not assert moved with it, and now sits between 11.75
  and 12.0.
- **T10** and the **aback scenario**: TWS 10 → 14. Both exist to observe a
  capsize (the freeze branch, the accelerating-heel branch, the aback timer);
  the measured threshold moved to between 12 and 13, so 14 keeps margin.

**`steeringOk`'s floor 2.0° → 1.5°.** The band was set against a 12 m² rig;
every steering response scaled with the rig, and T2's crew-trim legs landed at
1.9–2.0°. The other eight users of the helper clear 1.5° by 3.6–12°, so the
discrimination against noise is preserved in proportion.

**R15's absolute band** [5.3, 5.7] N → [4.6, 5.0] N — a smaller float has less
drag. The R7-1 *ratio* anchor that justifies this check is untouched and still
satisfied.

**`sail.deltaMinDeg` falls to 0.** The geometric sheeting floor (ADR 0010) is
derived from the spar length against the hull length; an 8 m² sail at a 50°
apex gives a 4.57 m spar on a 5.0 m hull, so the spar no longer overhangs and
the floor genuinely does not bind on this boat. The mechanism is unchanged and
still correct — it simply has nothing to clamp here.

**The boat is slower**, as it must be with a third less sail: TWA 90 / TWS 6
goes 3.87 → 3.37 m/s. `out/polar.csv` is regenerated wholesale; this is the one
change in the project's history where a large polar diff is the expected
outcome rather than a warning.

**S2 broadened, with the regression reported.** Rudder-free course holding was
searched over the tack alone; on the real boat the tack alone stops holding
TWS 10 / TWA 70. The search now covers the tack *and* the stays — both are rig
trim and both are on the manual's control list, and the stays only became a
control in ADR 0020 — but the tack-alone tally is printed beside the combined
one so the regression stays visible.

## What this does not settle

Hull beam and draft are still not published, and they are exactly the numbers
the weather-helm question turns on. The brochure's storage dimension
("500 × 90 × 140 cm") hints at a 0.90 m vaka beam, which would be **twice** the
scaled 0.41 m and would change the hull from a 12:1 slender foil to a 5.5:1
one — a different hydrodynamic animal, and one Flay's V2 data would no longer
describe. That is an inference from a packing crate, not a measurement, so it
is recorded here and not acted on.

`hull.lead` and `hull.clrXFraction` remain estimates.
