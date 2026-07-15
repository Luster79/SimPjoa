#!/usr/bin/env node
// tools/bundle.js — inlines /core, harness/polar.js, and ui/app.js, plus
// the two CSV data files, into a single, offline, double-clickable
// dist/simulator_standalone.html. Deliberately NOT a build framework: no
// bundler dependency, no module resolution beyond the fixed file list
// below, just source-text stripping + concatenation (see B1 in
// STEP1_SIGNOFF_and_STEP2_instructions.md).
//
// The only semantic change from the real source is confined to
// core/config.js's data-loading path: its `import`/`export` lines are
// stripped like everywhere else, and a small hand-written shim (readFileSync
// / fileURLToPath / path — NOT derived from config.js) is prepended so its
// UNMODIFIED loadAeroTable()/loadBoatParamsCSV() bodies resolve against
// embedded CSV string constants instead of disk. No physics line is
// touched, edited, or reordered — this keeps the bundle byte-for-byte
// faithful to core logic per B1's requirement.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const CORE_FILES = [
  'core/state.js',
  'core/config.js',
  'core/aero.js',
  'core/hydro.js',
  'core/rudder.js',
  'core/stability.js',
  'core/shunt.js',
  'core/integrator.js',
  'core/simulator.js',
];
const HARNESS_FILES = ['harness/polar.js'];
const UI_FILES = ['ui/app.js'];
const ALL_FILES = [...CORE_FILES, ...HARNESS_FILES, ...UI_FILES];

const DATA_FILES = {
  'crab_claw_CL_CD_polhamus.csv': 'data/crab_claw_CL_CD_polhamus.csv',
  'example_proa_parameters.csv': 'data/example_proa_parameters.csv',
};

// ---------------------------------------------------------------------
// 1. Strip import/export syntax (mechanical only — no logic changes)
// ---------------------------------------------------------------------
function stripModuleSyntax(src) {
  let out = src;
  out = out.replace(/^import\s*\{[^}]*\}\s*from\s*'[^']*';?\s*$/gm, '');
  out = out.replace(/^import\s+\w+\s+from\s*'[^']*';?\s*$/gm, '');
  out = out.replace(/^export\s+function\s+/gm, 'function ');
  out = out.replace(/^export\s+const\s+/gm, 'const ');
  out = out.replace(/^export\s*\{[^}]*\};?\s*$/gm, '');
  return out;
}

// ---------------------------------------------------------------------
// 2. Detect + rename PRIVATE (non-exported) top-level identifiers that
//    collide across files once everything shares one scope. Only names
//    that were never `export`ed are candidates — exported names are the
//    module's real public surface and are verified unique separately.
// ---------------------------------------------------------------------
function findPrivateTopLevelNames(rawSrc) {
  const names = [];
  const re = /^(?:const|function)\s+(\w+)/gm;
  const exportedRe = /^export\s+(?:const|function)\s+(\w+)/gm;
  const exported = new Set([...rawSrc.matchAll(exportedRe)].map((m) => m[1]));
  for (const m of rawSrc.matchAll(re)) {
    if (!exported.has(m[1])) names.push(m[1]);
  }
  return names;
}

function renameIdentifier(src, oldName, newName) {
  const re = new RegExp(`\\b${oldName}\\b`, 'g');
  return src.replace(re, newName);
}

// ---------------------------------------------------------------------
// 3. Embed CSV data
// ---------------------------------------------------------------------
function buildEmbeddedDataBlock() {
  const entries = Object.entries(DATA_FILES).map(([basename, relPath]) => {
    const text = readFileSync(path.join(ROOT, relPath), 'utf8');
    return `  ${JSON.stringify(basename)}: ${JSON.stringify(text)},`;
  });
  return `const EMBEDDED_DATA = {\n${entries.join('\n')}\n};`;
}

// Hand-written, NOT derived from config.js — the disk-I/O replacement B1
// calls for. path.join()/dirname() only need to preserve the FILENAME as
// the last '/'-segment; readFileSync only ever looks up by that filename
// against EMBEDDED_DATA, so exact path-string fidelity to Node's real
// semantics doesn't matter here (see STEP1_SIGNOFF_and_STEP2_instructions
// B1 and ui/shims/ for the equivalent, fetch-based approach used by the
// dev entry point instead).
const RUNTIME_SHIM = `
// --- runtime shim for core/config.js's disk I/O (tools/bundle.js) ---
function fileURLToPath(u) { return String(u); }
const path = {
  dirname(p) { return String(p).replace(/\\/[^/]*$/, ''); },
  join(...parts) { return parts.join('/').replace(/\\/+/g, '/'); },
};
function readFileSync(p) {
  const filename = String(p).split('/').pop();
  if (Object.prototype.hasOwnProperty.call(EMBEDDED_DATA, filename)) return EMBEDDED_DATA[filename];
  throw new Error('bundled readFileSync: no embedded data for "' + filename + '"');
}
// import.meta.url shim: config.js reads it once at module scope via
// \`import.meta.url\`, which stays valid in a <script type="module"> even
// after import/export stripping (import.meta is available in any module
// script, inline or external) — no replacement needed for that part.
`.trim();

// ---------------------------------------------------------------------
// 4. Build the bundle
// ---------------------------------------------------------------------
function buildBundleScript() {
  const rawSources = ALL_FILES.map((f) => readFileSync(path.join(ROOT, f), 'utf8'));

  // Collision detection across the whole file set.
  const nameOwners = new Map(); // name -> [fileIndex, ...]
  rawSources.forEach((src, i) => {
    for (const name of findPrivateTopLevelNames(src)) {
      if (!nameOwners.has(name)) nameOwners.set(name, []);
      nameOwners.get(name).push(i);
    }
  });

  const stripped = rawSources.map(stripModuleSyntax);
  for (const [name, owners] of nameOwners) {
    if (owners.length <= 1) continue;
    // Keep the first owner's name as-is; rename the rest to name__<n>.
    owners.slice(1).forEach((fileIndex, k) => {
      const unique = `${name}__b${fileIndex}`;
      stripped[fileIndex] = renameIdentifier(stripped[fileIndex], name, unique);
    });
  }

  const header = `// GENERATED FILE — produced by tools/bundle.js from /core, /harness/polar.js,\n// /ui/app.js and /data/*.csv. Do not edit by hand; edit the sources and re-run\n// \`node tools/bundle.js\`.`;

  const parts = [
    header,
    buildEmbeddedDataBlock(),
    RUNTIME_SHIM,
    ...ALL_FILES.map((f, i) => `\n// ==== ${f} ====\n${stripped[i].trim()}`),
  ];
  return parts.join('\n\n');
}

// ---------------------------------------------------------------------
// 5. Assemble the standalone HTML from ui/index.html's skeleton
// ---------------------------------------------------------------------
function buildHtml(bundleScript) {
  let html = readFileSync(path.join(ROOT, 'ui/index.html'), 'utf8');
  // Drop the import map (nothing left to remap — the bundle has no
  // node:/relative imports at all) and the external app.js script tag.
  html = html.replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, '');
  html = html.replace(/<script type="module" src="\.\/app\.js"><\/script>/, `<script type="module">\n${bundleScript}\n</script>`);
  html = html.replace('<title>Proa Simulator — Step 2</title>', '<title>Proa Simulator — standalone</title>');
  return html;
}

function main() {
  const bundleScript = buildBundleScript();
  const html = buildHtml(bundleScript);
  const outDir = path.join(ROOT, 'dist');
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'simulator_standalone.html');
  writeFileSync(outPath, html);
  console.log(`Wrote ${path.relative(ROOT, outPath)} (${(html.length / 1024).toFixed(0)} KB)`);
}

main();
