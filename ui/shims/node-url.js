// ui/shims/node-url.js — browser stand-in for the 'node:fs'/'node:url'/
// 'node:path' trio that core/config.js imports to load its two CSV data
// files from disk. Node built-in specifiers don't resolve in a browser at
// all (even served over HTTP), so index.html remaps them via an import
// map to this shim set instead of modifying core/config.js (frozen for
// Step 2 — see STEP1_SIGNOFF_and_STEP2_instructions.md Part A).
//
// fileURLToPath here doesn't need real file:// semantics — config.js only
// uses its result as an opaque string that node-path.js's dirname/join
// manipulate, ultimately producing a URL string that node-fs.js's
// readFileSync resolves via fetch(). Browser import.meta.url is already an
// http(s) URL, so passing it through unchanged keeps that string valid.
export function fileURLToPath(url) {
  return String(url);
}
