// harness/checksum.js — deterministic, non-cryptographic hash over a
// JSON-serializable value (round 6, R6-1/R6-2). Shared by the determinism
// self-test (harness/asserts.js), the UI recorder (ui/app.js), and the
// replay tool (harness/replay.js) so all three compute checksums the same
// way — a mismatch between recorder-time and replay-time hashing would
// look exactly like a real determinism bug, so this MUST be one shared
// function, not three copies.
//
// FNV-1a, 32-bit: fast, good avalanche for this size of input, no need for
// cryptographic strength — this only has to catch accidental divergence
// between two runs of the same deterministic simulation, not resist a
// motivated adversary.
export function hashState(value) {
  const s = JSON.stringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
