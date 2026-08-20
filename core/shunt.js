// shunt.js — the shunt state machine: ease -> transfer -> swap -> sheet -> none.
// Sail forces are faded via aero.js's internal shuntForceFade(state.shunt),
// which reads the same phase/progress this module writes, so this module
// only needs to own the phase timing and the one-shot bow/stern role swap.
//
// `controls.shuntRequest` must already be an edge-triggered pulse (true only
// on the single step that should start the sequence) — the facade
// (simulator.js) is responsible for turning a held button/key into that
// edge, keeping this state machine itself simple and pure.
//
// THE SWAP TRANSFORM. The ama is bolted to ONE physical side of the hull —
// it does not relocate at a shunt. The boat-frame y axis is defined via
// `heading` (always toward the ACTIVE bow), so when `heading` jumps by PI at
// the swap, the whole local frame rotates 180 deg in world terms, and the
// ama's LOCAL side (sign `end`) must rotate WITH it for its WORLD side to
// stay put — i.e. `end` flips. World-velocity continuity under this PI frame
// rotation requires u'=-u AND v'=-v: both components reverse, not just u.
//
// Yaw rate is frame-invariant (r'=r), and roll (phi, p) is a PHYSICAL-frame
// quantity — positive phi = the ama side rising, defined about the physical
// hull axis rather than the shunt-rotating active-bow frame — so neither
// changes at the swap. Both are left OUT of the patch below rather than
// written back: omitting a key leaves the freshly RK4-integrated value
// untouched, which is exactly "unchanged at swap".

function normalizeAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

export function shuntStep(state, controls, config, dt) {
  const { phase, progress } = state.shunt;
  const speed = Math.hypot(state.u, state.v);

  if (phase === 'none') {
    if (controls.shuntRequest && speed <= config.shunt.speedLockout) {
      return { shunt: { phase: 'ease', progress: 0 } };
    }
    return {};
  }

  if (phase === 'ease') {
    const p = progress + dt / config.shunt.easeDuration;
    return p >= 1 ? { shunt: { phase: 'transfer', progress: 0 } } : { shunt: { phase: 'ease', progress: p } };
  }

  if (phase === 'transfer') {
    const p = progress + dt / config.shunt.transferDuration;
    return p >= 1 ? { shunt: { phase: 'swap', progress: 0 } } : { shunt: { phase: 'transfer', progress: p } };
  }

  if (phase === 'swap') {
    const p = progress + dt / config.shunt.swapDuration;
    if (p >= 1) {
      return {
        shunt: { phase: 'sheet', progress: 0 },
        end: -state.end,
        heading: normalizeAngle(state.heading + Math.PI),
        u: -state.u,
        v: -state.v,
      };
    }
    return { shunt: { phase: 'swap', progress: p } };
  }

  // phase === 'sheet'
  const p = progress + dt / config.shunt.sheetDuration;
  return p >= 1 ? { shunt: { phase: 'none', progress: 0 } } : { shunt: { phase: 'sheet', progress: p } };
}
