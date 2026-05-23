#!/usr/bin/env bash
# zsnap - ZFS snapshot manager for Proxmox / Ludus
#
# Usage:
#   zsnap list
#   zsnap save <name>
#   zsnap restore <name>
#   zsnap delete <name>

set -euo pipefail

# =========================
# CONFIG
# =========================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../.env"
if [[ -f "$ENV_FILE" ]]; then
  source "$ENV_FILE"
fi

DATASETS=(
  "rpool/ROOT/pve-1"
  "rpool/data"
)

LUDUS_API_URL="${LUDUS_SERVER_URL:-https://localhost:8080}/api/v2"

RED='\033[0;31m'
GRN='\033[0;32m'
YLW='\033[1;33m'
BLU='\033[1;34m'
DIM='\033[2m'
RST='\033[0m'

# =========================
# HELPERS
# =========================

usage() {
  echo -e "${BLU}zsnap${RST} - ZFS snapshot manager"
  echo ""
  echo "  ${YLW}zsnap list${RST}             List all managed snapshots"
  echo "  ${YLW}zsnap save <name>${RST}      Create recursive snapshot"
  echo "  ${YLW}zsnap restore <name>${RST}   Restore datasets to snapshot"
  echo "  ${YLW}zsnap delete <name>${RST}    Delete snapshot recursively"
  echo ""
  echo -e "${DIM}Managed datasets:${RST}"
  for ds in "${DATASETS[@]}"; do
    echo "  - $ds"
  done
}

require_snapshot_exists() {
  local name="$1"
  local missing=0

  for ds in "${DATASETS[@]}"; do
    local snap="${ds}@${name}"
    if ! zfs list -t snapshot "$snap" &>/dev/null; then
      echo -e "${RED}Error:${RST} snapshot not found: $snap"
      missing=1
    fi
  done

  if [[ $missing -ne 0 ]]; then
    exit 1
  fi
}

sort_deepest_first() {
  awk -F/ '{ print NF "|" $0 }' |
    sort -rn |
    cut -d'|' -f2-
}

poweron_range_vms() {
  if ! command -v jq &>/dev/null; then
    echo -e "${YLW}[!] Warning: jq not installed, skipping VM power-on${RST}"
    return 0
  fi
  if ! command -v curl &>/dev/null; then
    echo -e "${YLW}[!] Warning: curl not installed, skipping VM power-on${RST}"
    return 0
  fi
  if [[ -z "${LUDUS_API_KEY:-}" ]]; then
    echo -e "${YLW}[!] Warning: LUDUS_API_KEY not set, skipping VM power-on${RST}"
    return 0
  fi

  echo -e "${YLW}[*] Waiting for Ludus API to be ready...${RST}"
  sleep 5

  local api_url="${LUDUS_SERVER_URL:-https://localhost:8080}/api/v2"
  local max_wait=10
  local powered_on_attempted=false

  for i in $(seq 0 "$max_wait"); do
    local range
    range=$(curl -sk -H "X-API-KEY: ${LUDUS_API_KEY}" "${api_url}/range" 2>/dev/null || true)
    if [[ -z "$range" ]]; then
      if [[ $i -ge "$max_wait" ]]; then
        echo -e "${YLW}[*] API unreachable after ${max_wait}s, skipping${RST}"
        return 0
      fi
      sleep 1
      continue
    fi

    local router_name kali_name windows_name
    router_name=$(echo "$range" | jq -r '.VMs[]? | select(.isRouter == true) | .name // empty' 2>/dev/null || true)
    kali_name=$(echo "$range" | jq -r '.VMs[]? | select(.name | test("attacker-kali")) | .name // empty' 2>/dev/null || true)
    windows_name=$(echo "$range" | jq -r '.VMs[]? | select(.name | test("win"; "i")) | .name // empty' 2>/dev/null || true)

    if [[ -z "$router_name" && -z "$kali_name" && -z "$windows_name" ]]; then
      if [[ $i -ge "$max_wait" ]]; then
        echo -e "${DIM}[*] No target VMs found after ${max_wait}s, range is empty${RST}"
        return 0
      fi
      sleep 1
      continue
    fi

    local offline_ids=()
    for name in "$router_name" "$kali_name" "$windows_name"; do
      if [[ -n "$name" ]]; then
        local powered vm_id
        powered=$(echo "$range" | jq -r --arg name "$name" '.VMs[]? | select(.name == $name) | .poweredOn // false' 2>/dev/null || true)
        if [[ "$powered" != "true" ]]; then
          vm_id=$(echo "$range" | jq -r --arg name "$name" '.VMs[]? | select(.name == $name) | .proxmoxID // empty' 2>/dev/null || true)
          offline_ids+=("$vm_id")
        fi
      fi
    done

    if [[ ${#offline_ids[@]} -eq 0 ]]; then
      echo -e "${GRN}[*] Target VMs all powered on${RST}"
      return 0
    fi

    if [[ "$powered_on_attempted" == false ]]; then
      echo -e "${YLW}[*] VMs powered off: ${offline_ids[*]}${RST}"
      echo -e "${YLW}[*] Powering on...${RST}"
      local json_array
      json_array=$(printf '%s\n' "${offline_ids[@]}" | jq -R . | jq -s .)
      curl -sk -X PUT \
        -H "X-API-KEY: ${LUDUS_API_KEY}" \
        -H "Content-Type: application/json" \
        -d "{\"machines\": ${json_array}}" \
        "${api_url}/range/poweron" 2>/dev/null || true
      powered_on_attempted=true
    fi

    sleep 1
  done

  echo -e "${RED}[!] Warning: Timed out waiting for VMs to power on${RST}"
}

# =========================
# SERVICE CONTROL
# =========================

stop_services() {
  echo -e "${YLW}[*] Stopping services...${RST}"

  # Layer 1: Ludus (top of stack)
  systemctl stop ludus.service            2>/dev/null || true
  systemctl stop ludus-admin.service      2>/dev/null || true

  # Layer 2: HA managers
  systemctl stop pve-ha-crm.service       2>/dev/null || true
  systemctl stop pve-ha-lrm.service       2>/dev/null || true

  # Layer 3: Schedulers and event daemons
  systemctl stop pvescheduler.service     2>/dev/null || true
  systemctl stop qmeventd.service         2>/dev/null || true

  # Layer 4: API and proxy layer
  systemctl stop pveproxy.service         2>/dev/null || true
  systemctl stop spiceproxy.service       2>/dev/null || true
  systemctl stop pvedaemon.service        2>/dev/null || true
  systemctl stop pvestatd.service         2>/dev/null || true

  # Layer 5: Firewall
  systemctl stop pve-firewall.service     2>/dev/null || true
  systemctl stop proxmox-firewall.service 2>/dev/null || true
  systemctl stop pvefw-logger.service     2>/dev/null || true

  # Layer 6: Stats cache (flush RRD data cleanly)
  systemctl stop rrdcached.service        2>/dev/null || true

  # Layer 7: LXC subsystem
  systemctl stop lxc-monitord.service     2>/dev/null || true
  systemctl stop pve-lxc-syscalld.service 2>/dev/null || true
  systemctl stop lxcfs.service            2>/dev/null || true

  # Layer 8: Watchdog and DNS
  systemctl stop watchdog-mux.service     2>/dev/null || true
  systemctl stop dnsmasq.service          2>/dev/null || true

  # Layer 9: Cluster FS last
  systemctl stop pve-cluster.service      2>/dev/null || true

  sleep 2
  echo -e "${GRN}[*] Services stopped.${RST}"
}

start_services() {
  echo -e "${YLW}[*] Starting services...${RST}"

  # Layer 1: Cluster FS first
  systemctl start pve-cluster.service
  sleep 3

  # Layer 2: DNS and watchdog
  systemctl start dnsmasq.service          2>/dev/null || true
  systemctl start watchdog-mux.service     2>/dev/null || true

  # Layer 3: LXC subsystem
  systemctl start lxcfs.service            2>/dev/null || true
  systemctl start pve-lxc-syscalld.service 2>/dev/null || true
  systemctl start lxc-monitord.service     2>/dev/null || true

  # Layer 4: Stats cache
  systemctl start rrdcached.service        2>/dev/null || true

  # Layer 5: Firewall
  systemctl start pvefw-logger.service     2>/dev/null || true
  systemctl start proxmox-firewall.service 2>/dev/null || true
  systemctl start pve-firewall.service     2>/dev/null || true

  # Layer 6: API and proxy layer
  systemctl start pvestatd.service         2>/dev/null || true
  systemctl start pvedaemon.service        2>/dev/null || true
  systemctl start pveproxy.service         2>/dev/null || true
  systemctl start spiceproxy.service       2>/dev/null || true

  # Layer 7: Schedulers and event daemons
  systemctl start qmeventd.service         2>/dev/null || true
  systemctl start pvescheduler.service     2>/dev/null || true

  # Layer 8: HA managers
  systemctl start pve-ha-lrm.service       2>/dev/null || true
  systemctl start pve-ha-crm.service       2>/dev/null || true

  # Layer 9: Ludus last
  systemctl start ludus-admin.service      2>/dev/null || true
  systemctl start ludus.service            2>/dev/null || true

  echo -e "${GRN}[*] Services started.${RST}"
}

# =========================
# LIST
# =========================

cmd_list() {
  echo -e "${BLU}Snapshots across managed datasets:${RST}"
  echo ""

  local found=0

  for ds in "${DATASETS[@]}"; do
    local snaps
    snaps=$(zfs list \
      -H \
      -t snapshot \
      -r "$ds" \
      -o name,creation,used \
      -s creation 2>/dev/null || true)

    if [[ -n "$snaps" ]]; then
      echo -e "${YLW}${ds}${RST} (includes children)"
      printf "  %-55s %-25s %s\n" "SNAPSHOT" "CREATED" "USED"

      while IFS=$'\t' read -r full_name creation used; do
        printf "  %-55s %-25s %s\n" "$full_name" "$creation" "$used"
        found=1
      done <<< "$snaps"

      echo ""
    else
      echo -e "${YLW}${ds}${RST} ${DIM}(no snapshots)${RST}"
      echo ""
    fi
  done

  if [[ $found -eq 0 ]]; then
    echo -e "${DIM}No snapshots found.${RST}"
  fi
}

# =========================
# SAVE
# =========================

cmd_save() {
  local name="${1:-}"

  if [[ -z "$name" ]]; then
    echo -e "${RED}Error:${RST} missing snapshot name"
    exit 1
  fi

  if [[ "$name" =~ [[:space:]@] ]]; then
    echo -e "${RED}Error:${RST} snapshot name cannot contain spaces or '@'"
    exit 1
  fi

  stop_services

  for ds in "${DATASETS[@]}"; do
    local snap="${ds}@${name}"

    if zfs list -t snapshot "$snap" &>/dev/null; then
      echo -e "${YLW}Destroying existing snapshot:${RST} $snap"
      zfs destroy -r "$snap"
    fi

    echo -e "${GRN}Creating snapshot:${RST} $snap (recursive)"
    zfs snapshot -r "$snap"
  done

  start_services

  echo ""
  echo -e "${GRN}Done.${RST} Snapshot '${name}' created."
}

# =========================
# RESTORE
# =========================

cmd_restore() {
  local name="${1:-}"

  if [[ -z "$name" ]]; then
    echo -e "${RED}Error:${RST} missing snapshot name"
    exit 1
  fi

  require_snapshot_exists "$name"

  declare -a snap_list=()
  declare -a destroy_list=()

  for ds in "${DATASETS[@]}"; do
    while IFS= read -r child; do
      if zfs list -t snapshot "${child}@${name}" &>/dev/null; then
        snap_list+=("${child}@${name}")
      else
        if [[ "$child" != "$ds" ]]; then
          destroy_list+=("$child")
        fi
      fi
    done < <(zfs list -H -r -t filesystem,volume -o name "$ds")
  done

  if [[ ${#destroy_list[@]} -gt 0 ]]; then
    mapfile -t destroy_list < <(
      printf '%s\n' "${destroy_list[@]}" | sort_deepest_first
    )
  fi

  if [[ ${#snap_list[@]} -eq 0 ]]; then
    echo -e "${RED}Error:${RST} no matching snapshots found to roll back"
    exit 1
  fi

  mapfile -t snap_list < <(
    printf '%s\n' "${snap_list[@]}" | sort_deepest_first
  )

  echo -e "${RED}WARNING:${RST} This will restore snapshot '${name}'"
  echo ""

  if [[ ${#destroy_list[@]} -gt 0 ]]; then
    echo -e "${RED}The following datasets/ZVOLs will be DESTROYED:${RST}"
    for d in "${destroy_list[@]}"; do
      echo "  $d"
    done
    echo ""
  fi

  echo -e "${YLW}The following datasets will be rolled back:${RST}"
  for s in "${snap_list[@]}"; do
    echo "  $s"
  done

  echo ""
  echo -e "${RED}Any newer snapshots will also be destroyed.${RST}"
  echo ""
  read -r -p "Type 'yes' to confirm: " confirm
  if [[ "$confirm" != "yes" ]]; then
    echo "Aborted."
    exit 0
  fi

  stop_services

  if [[ ${#destroy_list[@]} -gt 0 ]]; then
    echo ""
    for d in "${destroy_list[@]}"; do
      echo -e "${RED}Destroying:${RST} $d"
      zfs destroy -r "$d"
    done
  fi

  echo ""
  for s in "${snap_list[@]}"; do
    echo -e "${YLW}Rolling back:${RST} $s"
    zfs rollback -r "$s"
  done

  echo ""
  echo -e "${GRN}[*] ZFS rollback complete.${RST}"

  start_services

  poweron_range_vms

  echo ""
  echo -e "${GRN}Done.${RST} Restore complete."
}

# =========================
# DELETE
# =========================

cmd_delete() {
  local name="${1:-}"

  if [[ -z "$name" ]]; then
    echo -e "${RED}Error:${RST} missing snapshot name"
    exit 1
  fi

  local found=0
  for ds in "${DATASETS[@]}"; do
    if zfs list -t snapshot "${ds}@${name}" &>/dev/null; then
      found=1
      break
    fi
  done

  if [[ $found -eq 0 ]]; then
    echo -e "${RED}Error:${RST} snapshot '${name}' not found"
    exit 1
  fi

  echo -e "${RED}WARNING:${RST} This will permanently delete snapshot '${name}'"
  echo ""

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

  echo ""
  for ds in "${DATASETS[@]}"; do
    local snap="${ds}@${name}"
    if zfs list -t snapshot "$snap" &>/dev/null; then
      echo -e "${YLW}Deleting:${RST} $snap"
      zfs destroy -r "$snap"
    fi
  done

  echo ""
  echo -e "${GRN}Done.${RST} Snapshot deleted."
}

# =========================
# MAIN
# =========================

if [[ $EUID -ne 0 ]]; then
  echo -e "${RED}Error:${RST} must run as root"
  exit 1
fi

case "${1:-}" in
  list)    cmd_list ;;
  save)    cmd_save    "${2:-}" ;;
  restore) cmd_restore "${2:-}" ;;
  delete)  cmd_delete  "${2:-}" ;;
  *)       usage ;;
esac