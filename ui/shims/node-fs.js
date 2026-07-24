// ui/shims/node-fs.js — synchronous-looking readFileSync backed by an
// eagerly fetched cache. core/config.js calls readFileSync(...) at
// createConfig() time expecting it to return text immediately; real
// browser I/O is async, so this module's top-level await (which the ESM
// spec guarantees is fully resolved before any importer's own module body
// runs — see core/config.js's `import { readFileSync } from 'node:fs'`)
// pre-fetches both CSV data files before config.js ever executes.
//
// Only the two files config.js actually reads are known here; this is not
// a general filesystem shim.
// crab_claw_CL_CD_v2.csv added here round 10d (ROUND10d_helm_balance.md,
// encountered while UI-testing C-B): round 10 (R10-1) added this THIRD
// data file to core/config.js's buildDefaultConfig() (loaded
// unconditionally, both tables live side by side — see that function's own
// comment), but never updated this shim's fetch list, which silently broke
// the dev-server entry point (`python3 -m http.server` + ui/index.html)
// for every round since — readFileSync() throws the instant createConfig()
// tries to load the v2 table. The bundled dist/simulator_standalone.html
// was unaffected (tools/bundle.js embeds all three CSVs directly, not via
// this shim), which is why this went unnoticed.
const DATA_FILES = [
  new URL('../../data/crab_claw_CL_CD_polhamus.csv', import.meta.url).href,
  new URL('../../data/crab_claw_CL_CD_v2.csv', import.meta.url).href,
  new URL('../../data/example_proa_parameters.csv', import.meta.url).href,
];

const cache = new Map();
await Promise.all(DATA_FILES.map(async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ui/shims/node-fs: failed to fetch ${url} (HTTP ${res.status})`);
  cache.set(url, await res.text());
}));

export function readFileSync(path) {
  const key = new URL(path).href;
  const text = cache.get(key);
  if (text === undefined) throw new Error(`ui/shims/node-fs: no pre-fetched content for ${key}`);
  return text;
}
