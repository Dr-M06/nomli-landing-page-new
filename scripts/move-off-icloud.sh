#!/usr/bin/env bash
# Move/copy this repo from iCloud-backed ~/Documents to local ~/Developer.
# Run ONLY after the project folder is fully downloaded (no cloud-only placeholders).
#
# 1) Finder → Documents → nomli → wait until cloud icons disappear (or right-click → Download Now).
# 2) Optional: brctl download "$HOME/Documents/nomli"
# 3) bash scripts/move-off-icloud.sh

set -euo pipefail

SRC="${1:-$HOME/Documents/nomli}"
DEST="${2:-$HOME/Developer/nomli}"

if [[ ! -d "$SRC" ]]; then
  echo "Source not found: $SRC" >&2
  exit 1
fi

if [[ -e "$DEST" ]]; then
  echo "Already exists: $DEST — remove or pick another path." >&2
  exit 1
fi

echo "Copying $SRC → $DEST (excluding node_modules, Pods, build caches)..."
mkdir -p "$(dirname "$DEST")"
rsync -a \
  --exclude node_modules \
  --exclude ios/Pods \
  --exclude ios/build \
  --exclude android/.gradle \
  --exclude android/app/build \
  --exclude android/build \
  --exclude .expo \
  "$SRC/" "$DEST/"

echo ""
echo "Done. Next:"
echo "  cd $DEST && npm install && cd ios && pod install"
echo "Open $DEST in Cursor, then remove or rename $SRC when you are satisfied."
