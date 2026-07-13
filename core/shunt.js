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
// Per the architecture doc, the swap step flips end, heading (+PI), u and r.
// v is intentionally left unchanged (the boat-frame y axis stays pinned to
// the physical, unmoving ama side) — this causes a small, deliberate
// discontinuity in the reconstructed world-frame velocity at the swap
// instant, acceptable since aero forces are already faded to zero through
// the transfer/swap phases and the sub-phase lasts a fraction of a second.

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
        r: -state.r,
      };
    }
    return { shunt: { phase: 'swap', progress: p } };
  }

  // phase === 'sheet'
  const p = progress + dt / config.shunt.sheetDuration;
  return p >= 1 ? { shunt: { phase: 'none', progress: 0 } } : { shunt: { phase: 'sheet', progress: p } };
}
