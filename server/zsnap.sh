#!/usr/bin/env bash
# zsnap - ZFS snapshot manager for Proxmox / Ludus
# Usage:
#   zsnap list
#   zsnap save <name>
#   zsnap restore <name>
#   zsnap delete <name>

set -euo pipefail

# CONFIG
# Datasets to snapshot. Add or remove lines as needed.
DATASETS=(
  "rpool/ROOT/pve-1"
  "rpool/data"
)

RED='\033[0;31m'
GRN='\033[0;32m'
YLW='\033[1;33m'
BLU='\033[1;34m'
DIM='\033[2m'
RST='\033[0m'

usage() {
  echo -e "${BLU}zsnap${RST} - ZFS snapshot manager"
  echo ""
  echo "  ${YLW}zsnap list${RST}             List all managed snapshots"
  echo "  ${YLW}zsnap save <name>${RST}      Create snapshot (destroys existing with same name)"
  echo "  ${YLW}zsnap restore <name>${RST}   Roll back datasets to a named snapshot"
  echo "  ${YLW}zsnap delete <name>${RST}    Destroy a named snapshot from all datasets"
  echo ""
  echo -e "${DIM}Managed datasets: ${DATASETS[*]}${RST}"
}

cmd_list() {
  echo -e "${BLU}Snapshots across managed datasets:${RST}"
  echo ""
  local found=0
  for ds in "${DATASETS[@]}"; do
    local snaps
    snaps=$(zfs list -t snapshot -o name,creation,used -s creation 2>/dev/null \
      | grep "^${ds}@" || true)
    if [[ -n "$snaps" ]]; then
      echo -e "${YLW}${ds}${RST}"
      printf "  %-40s %-25s %s\n" "SNAPSHOT" "CREATED" "SIZE"
      while IFS= read -r line; do
        local name creation used
        name=$(echo "$line" | awk '{print $1}' | cut -d'@' -f2)
        creation=$(echo "$line" | awk '{$1=""; $NF=""; print}' | xargs)
        used=$(echo "$line" | awk '{print $NF}')
        printf "  %-40s %-25s %s\n" "$name" "$creation" "$used"
        found=1
      done <<< "$snaps"
      echo ""
    else
      echo -e "${YLW}${ds}${RST} ${DIM}(no snapshots)${RST}"
      echo ""
    fi
  done
  if [[ $found -eq 0 ]]; then
    echo -e "${DIM}No snapshots found. Run: zsnap save <name>${RST}"
  fi
}

cmd_save() {
  local name="${1:-}"
  if [[ -z "$name" ]]; then
    echo -e "${RED}Error:${RST} provide a snapshot name. Example: zsnap save pre-ludus-setup"
    exit 1
  fi

  if [[ "$name" =~ [[:space:]@] ]]; then
    echo -e "${RED}Error:${RST} snapshot name cannot contain spaces or '@'"
    exit 1
  fi

  for ds in "${DATASETS[@]}"; do
    local snap="${ds}@${name}"

    if zfs list -t snapshot "$snap" &>/dev/null; then
      echo -e "${YLW}Destroying existing snapshot:${RST} $snap"
      zfs destroy "$snap"
    fi

    echo -e "${GRN}Creating snapshot:${RST} $snap"
    zfs snapshot "$snap"
  done

  echo ""
  echo -e "${GRN}Done.${RST} Snapshot '${name}' saved for all managed datasets."
}

cmd_restore() {
  local name="${1:-}"
  if [[ -z "$name" ]]; then
    echo -e "${RED}Error:${RST} provide a snapshot name. Example: zsnap restore pre-ludus-setup"
    exit 1
  fi

  for ds in "${DATASETS[@]}"; do
    local snap="${ds}@${name}"
    if ! zfs list -t snapshot "$snap" &>/dev/null; then
      echo -e "${RED}Error:${RST} snapshot '${snap}' not found. Aborting."
      echo "Run 'zsnap list' to see available snapshots."
      exit 1
    fi
  done

  echo -e "${RED}WARNING:${RST} This will roll back the following datasets to '${name}':"
  for ds in "${DATASETS[@]}"; do
    echo "  ${ds}@${name}"
  done
  echo ""
  echo -e "${RED}Any snapshots newer than '${name}' will be destroyed.${RST}"
  echo ""
  read -r -p "Type 'yes' to confirm: " confirm
  if [[ "$confirm" != "yes" ]]; then
    echo "Aborted."
    exit 0
  fi

  for ds in "${DATASETS[@]}"; do
    local snap="${ds}@${name}"
    echo -e "${YLW}Rolling back:${RST} $snap"
    zfs rollback -r "$snap"
  done

  echo ""
  echo -e "${GRN}Done.${RST} All datasets restored to snapshot '${name}'."
}

cmd_delete() {
  local name="${1:-}"
  if [[ -z "$name" ]]; then
    echo -e "${RED}Error:${RST} provide a snapshot name. Example: zsnap delete old-snapshot"
    exit 1
  fi

  local any_found=0
  for ds in "${DATASETS[@]}"; do
    if zfs list -t snapshot "${ds}@${name}" &>/dev/null; then
      any_found=1
    fi
  done
  if [[ $any_found -eq 0 ]]; then
    echo -e "${RED}Error:${RST} no snapshot named '${name}' found in any managed dataset."
    exit 1
  fi

  echo -e "${RED}WARNING:${RST} About to permanently delete snapshot '${name}' from:"
  for ds in "${DATASETS[@]}"; do
    if zfs list -t snapshot "${ds}@${name}" &>/dev/null; then
      echo "  ${ds}@${name}"
    fi
  done
  echo ""
  read -r -p "Type 'yes' to confirm: " confirm
  if [[ "$confirm" != "yes" ]]; then
    echo "Aborted."
    exit 0
  fi

  for ds in "${DATASETS[@]}"; do
    local snap="${ds}@${name}"
    if zfs list -t snapshot "$snap" &>/dev/null; then
      echo -e "${YLW}Deleting:${RST} $snap"
      zfs destroy "$snap"
    fi
  done

  echo ""
  echo -e "${GRN}Done.${RST} Snapshot '${name}' deleted."
}

if [[ $EUID -ne 0 ]]; then
  echo -e "${RED}Error:${RST} zsnap must be run as root."
  exit 1
fi

case "${1:-}" in
  list)    cmd_list ;;
  save)    cmd_save "${2:-}" ;;
  restore) cmd_restore "${2:-}" ;;
  delete)  cmd_delete "${2:-}" ;;
  *)       usage ;;
esac