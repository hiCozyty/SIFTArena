#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

EVIDENCE_DIR="../../evidence"
OVERRIDE_FILE="docker-compose.override.yml"

cat > "$OVERRIDE_FILE" <<'HEADER'
services:
  sift:
    volumes:
HEADER

echo "      - ../../workflows:/home/sift/workflows" >> "$OVERRIDE_FILE"
echo "      - ../../results:/home/sift/results" >> "$OVERRIDE_FILE"

if [ -d "$EVIDENCE_DIR" ]; then
  for playbook_dir in "$EVIDENCE_DIR"/*/; do
    [ -d "$playbook_dir" ] || continue
    playbook=$(basename "$playbook_dir")

    for entry in "$playbook_dir"*; do
      [ -e "$entry" ] || continue
      name=$(basename "$entry")

      [ "$name" = "groundTruth.json" ] && continue

      host_rel="../../evidence/${playbook}/${name}"
      cont_path="/home/sift/evidence/${playbook}/${name}"

      if [ -d "$entry" ]; then
        echo "      - ${host_rel}:${cont_path}" >> "$OVERRIDE_FILE"
        echo "  -> Mounting evidence/${playbook}/${name} (rw)"
      else
        echo "      - ${host_rel}:${cont_path}:ro" >> "$OVERRIDE_FILE"
        echo "  -> Mounting evidence/${playbook}/${name} (ro)"
      fi
    done
  done
fi

echo "Generated $OVERRIDE_FILE"
