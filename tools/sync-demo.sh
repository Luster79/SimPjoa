#!/usr/bin/env bash
# tools/sync-demo.sh — rebuild the standalone bundle from current source and
# push it to the public demo repo (github.com/Luster79/simpjoa-demo, served
# via GitHub Pages at https://luster79.github.io/simpjoa-demo/).
#
# Usage: tools/sync-demo.sh   (run from anywhere; paths are resolved below)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DEMO_DIR="${SIMPJOA_DEMO_DIR:-$HOME/simpjoa-demo-repo}"

echo "Rebuilding standalone bundle..."
node "$PROJECT_DIR/tools/bundle.js"

BUNDLE="$PROJECT_DIR/dist/simulator_standalone.html"
TARGET="$DEMO_DIR/index.html"

if [ ! -d "$DEMO_DIR/.git" ]; then
  echo "error: demo repo not found at $DEMO_DIR (expected a git checkout of simpjoa-demo)" >&2
  exit 1
fi

if diff -q "$BUNDLE" "$TARGET" >/dev/null 2>&1; then
  echo "Demo is already up to date with the current bundle — nothing to push."
  exit 0
fi

cp "$BUNDLE" "$TARGET"
cd "$DEMO_DIR"
git add index.html
git commit -q -m "sync with main ($(git -C "$PROJECT_DIR" rev-parse --short HEAD))"
git push -q

echo "Demo updated: https://luster79.github.io/simpjoa-demo/"
