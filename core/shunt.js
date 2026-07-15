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
// SPEC ERRATUM applied (FIX_REQUEST_round3_worldframe.md R3-1): the ama is
// bolted to ONE physical side of the hull — it does not relocate at a
// shunt. The boat-frame y axis is defined via `heading` (always toward the
// ACTIVE bow), so when `heading` jumps by PI at the swap, the whole local
// frame rotates 180 deg in world terms, and the ama's LOCAL side (sign
// `end`) must rotate WITH it for its WORLD side to stay put — i.e. `end`
// flips, not "ama always at +y". World-velocity continuity under this PI
// frame rotation requires u'=-u AND v'=-v (both components reverse, not
// just u); yaw rate is frame-invariant, r'=r (left out of the patch below
// on purpose — omitting it leaves the freshly-integrated r untouched rather
// than overriding it). The previous swap (end*=-1, heading+=PI, u=-u, r=-r,
// v preserved) matched the architecture doc as originally written, but that
// doc was wrong: it injected a spurious sway reversal and yaw-rate reversal,
// and forced the "ama always at +y" convention that flips the ama's WORLD
// side at every shunt — see ARCHITECTURE_physics_core_EN.md's Conventions
// section (rewritten) for the corrected frame definition.

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
