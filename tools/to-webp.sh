#!/usr/bin/env bash
# Usage: tools/to-webp.sh <src.png> <dest.webp> <target-width-px>
set -euo pipefail

SRC="$1"; DEST="$2"; WIDTH="$3"

if [ ! -f "$SRC" ]; then echo "source not found: $SRC" >&2; exit 1; fi
mkdir -p "$(dirname "$DEST")"

TMPDIR_WORK="$(mktemp -d -t towebp)"
trap 'rm -rf "$TMPDIR_WORK"' EXIT
TMP="$TMPDIR_WORK/resized.png"
sips --resampleWidth "$WIDTH" "$SRC" --out "$TMP" >/dev/null

if command -v cwebp >/dev/null 2>&1; then
  cwebp -quiet -q 82 "$TMP" -o "$DEST"
else
  # macOS 13+ ships WebP support in sips
  sips -s format webp "$TMP" --out "$DEST" >/dev/null
fi

OUT_W=$(sips -g pixelWidth "$DEST" | awk '/pixelWidth/{print $2}')
BYTES=$(stat -f%z "$DEST")
echo "$DEST  ${OUT_W}px  $((BYTES / 1024))KB"
