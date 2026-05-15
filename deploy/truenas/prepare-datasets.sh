#!/usr/bin/env sh
set -eu

POOL="${1:-}"

if [ -z "$POOL" ]; then
  echo "Usage: sh prepare-datasets.sh POOL_NAME"
  echo "Example: sh prepare-datasets.sh tank"
  exit 1
fi

DATA_DIR="/mnt/$POOL/apps/trackvault/data"
MUSIC_DIR="/mnt/$POOL/media/music"

mkdir -p "$DATA_DIR" "$MUSIC_DIR"
chmod 775 "$DATA_DIR" "$MUSIC_DIR"

echo "Created:"
echo "  $DATA_DIR"
echo "  $MUSIC_DIR"
echo
echo "Put music files in $MUSIC_DIR, then use these paths in the TrueNAS YAML:"
echo "  $DATA_DIR:/data"
echo "  $MUSIC_DIR:/music:ro"
