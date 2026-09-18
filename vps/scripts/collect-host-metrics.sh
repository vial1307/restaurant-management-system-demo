#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/kitchen-os}"
RUNTIME_DIR="${APP_DIR}/runtime"
OUT="${RUNTIME_DIR}/host-metrics.env"
STATE="${RUNTIME_DIR}/host-metrics.state"
TMP="${OUT}.tmp"
STATE_TMP="${STATE}.tmp"

mkdir -p "${RUNTIME_DIR}"
chmod 0755 "${RUNTIME_DIR}"

safe_text() {
  printf '%s' "${1:-}" | tr '\r\n=' '   ' | tr -cd '[:print:]'
}

number_or_zero() {
  local value="${1:-0}"
  if [[ "${value}" =~ ^-?[0-9]+([.][0-9]+)?$ ]]; then printf '%s' "${value}"; else printf '0'; fi
}

kb_to_bytes() {
  local value="${1:-0}"
  printf '%s\n' "$(( value * 1024 ))"
}

prev_cpu_total="$(awk '$1=="CPU"{print $2;exit}' "${STATE}" 2>/dev/null || true)"
prev_cpu_idle="$(awk '$1=="CPU"{print $3;exit}' "${STATE}" 2>/dev/null || true)"
read -r _ cpu_user cpu_nice cpu_system cpu_idle cpu_iowait cpu_irq cpu_softirq cpu_steal _ < /proc/stat
cpu_total=$((cpu_user + cpu_nice + cpu_system + cpu_idle + cpu_iowait + cpu_irq + cpu_softirq + cpu_steal))
cpu_idle_all=$((cpu_idle + cpu_iowait))
cpu_usage="0"
if [[ "${prev_cpu_total:-}" =~ ^[0-9]+$ && "${prev_cpu_idle:-}" =~ ^[0-9]+$ && "${cpu_total}" -gt "${prev_cpu_total}" ]]; then
  cpu_delta=$((cpu_total - prev_cpu_total))
  idle_delta=$((cpu_idle_all - prev_cpu_idle))
  cpu_usage="$(awk -v total="${cpu_delta}" -v idle="${idle_delta}" 'BEGIN { if (total <= 0) print "0"; else printf "%.2f", (total-idle)*100/total }')"
fi

now_epoch="$(date +%s)"
generated_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
uptime_seconds="$(awk '{printf "%.0f",$1}' /proc/uptime)"
read -r load1 load5 load15 _ < /proc/loadavg

mem_total_kb="$(awk '/^MemTotal:/{print $2}' /proc/meminfo)"
mem_available_kb="$(awk '/^MemAvailable:/{print $2}' /proc/meminfo)"
swap_total_kb="$(awk '/^SwapTotal:/{print $2}' /proc/meminfo)"
swap_free_kb="$(awk '/^SwapFree:/{print $2}' /proc/meminfo)"
mem_total_bytes="$(kb_to_bytes "${mem_total_kb:-0}")"
mem_available_bytes="$(kb_to_bytes "${mem_available_kb:-0}")"
mem_used_bytes=$((mem_total_bytes - mem_available_bytes))
swap_total_bytes="$(kb_to_bytes "${swap_total_kb:-0}")"
swap_free_bytes="$(kb_to_bytes "${swap_free_kb:-0}")"
swap_used_bytes=$((swap_total_bytes - swap_free_bytes))

read -r disk_total disk_used disk_available disk_percent < <(df -B1 --output=size,used,avail,pcent / | tail -n 1)
disk_percent="${disk_percent%%%}"
read -r inode_total inode_used inode_available inode_percent < <(df -Pi --output=itotal,iused,iavail,ipcent / | tail -n 1)
inode_percent="${inode_percent%%%}"

app_dir_bytes="$(du -sb "${APP_DIR}" 2>/dev/null | awk '{print $1}' || true)"
backup_dir="${APP_DIR}/backups"
backup_dir_bytes="$(du -sb "${backup_dir}" 2>/dev/null | awk '{print $1}' || true)"
backup_count="$(find "${backup_dir}" -maxdepth 1 -type f -name 'kitchen_os_*.dump' 2>/dev/null | wc -l | tr -d ' ')"
latest_backup="$(find "${backup_dir}" -maxdepth 1 -type f -name 'kitchen_os_*.dump' -printf '%T@ %s %f\n' 2>/dev/null | sort -nr | head -n 1 || true)"
latest_backup_epoch="$(awk '{printf "%.0f",$1}' <<<"${latest_backup:-}" 2>/dev/null || true)"
latest_backup_bytes="$(awk '{print $2}' <<<"${latest_backup:-}" 2>/dev/null || true)"
latest_backup_name="$(awk '{print $3}' <<<"${latest_backup:-}" 2>/dev/null || true)"

postgres_data_bytes="0"
if docker inspect kitchen-os-db >/dev/null 2>&1; then
  postgres_data_bytes="$(docker exec kitchen-os-db sh -lc 'du -sb /var/lib/postgresql/data 2>/dev/null | cut -f1' 2>/dev/null || true)"
fi

primary_iface="$(ip route show default 2>/dev/null | awk 'NR==1{print $5}' || true)"
net_state_lines=()
net_count=0
net_total_rx=0
net_total_tx=0
net_total_rx_bps=0
net_total_tx_bps=0

prev_net_value() {
  local iface="$1" field="$2"
  awk -v iface="${iface}" -v field="${field}" '$1=="NET" && $2==iface { if(field=="rx") print $3; else if(field=="tx") print $4; else if(field=="epoch") print $5; exit }' "${STATE}" 2>/dev/null || true
}

while IFS= read -r iface; do
  [[ "${iface}" == "lo" ]] && continue
  rx="$(cat "/sys/class/net/${iface}/statistics/rx_bytes" 2>/dev/null || echo 0)"
  tx="$(cat "/sys/class/net/${iface}/statistics/tx_bytes" 2>/dev/null || echo 0)"
  speed="$(cat "/sys/class/net/${iface}/speed" 2>/dev/null || echo 0)"
  [[ "${speed}" =~ ^[0-9]+$ ]] || speed=0
  prev_rx="$(prev_net_value "${iface}" rx)"
  prev_tx="$(prev_net_value "${iface}" tx)"
  prev_epoch="$(prev_net_value "${iface}" epoch)"
  rx_bps=0
  tx_bps=0
  if [[ "${prev_epoch:-}" =~ ^[0-9]+$ && "${now_epoch}" -gt "${prev_epoch}" && "${prev_rx:-}" =~ ^[0-9]+$ && "${prev_tx:-}" =~ ^[0-9]+$ ]]; then
    elapsed=$((now_epoch - prev_epoch))
    if [[ "${rx}" -ge "${prev_rx}" ]]; then rx_bps=$(((rx - prev_rx) / elapsed)); fi
    if [[ "${tx}" -ge "${prev_tx}" ]]; then tx_bps=$(((tx - prev_tx) / elapsed)); fi
  fi
  {
    printf 'NET_%d_NAME=%s\n' "${net_count}" "$(safe_text "${iface}")"
    printf 'NET_%d_PRIMARY=%s\n' "${net_count}" "$([[ "${iface}" == "${primary_iface}" ]] && echo true || echo false)"
    printf 'NET_%d_RX_BYTES=%s\n' "${net_count}" "$(number_or_zero "${rx}")"
    printf 'NET_%d_TX_BYTES=%s\n' "${net_count}" "$(number_or_zero "${tx}")"
    printf 'NET_%d_RX_BPS=%s\n' "${net_count}" "$(number_or_zero "${rx_bps}")"
    printf 'NET_%d_TX_BPS=%s\n' "${net_count}" "$(number_or_zero "${tx_bps}")"
    printf 'NET_%d_SPEED_MBPS=%s\n' "${net_count}" "$(number_or_zero "${speed}")"
  } >> "${TMP}.network"
  net_total_rx=$((net_total_rx + rx))
  net_total_tx=$((net_total_tx + tx))
  net_total_rx_bps=$((net_total_rx_bps + rx_bps))
  net_total_tx_bps=$((net_total_tx_bps + tx_bps))
  net_state_lines+=("NET ${iface} ${rx} ${tx} ${now_epoch}")
  net_count=$((net_count + 1))
done < <(find /sys/class/net -mindepth 1 -maxdepth 1 -printf '%f\n' 2>/dev/null | sort)

service_names=(kitchen-os-api kitchen-os-db kitchen-os-web)
service_count=0
: > "${TMP}.services"
for service in "${service_names[@]}"; do
  status="missing"
  health="unavailable"
  if docker inspect "${service}" >/dev/null 2>&1; then
    status="$(docker inspect -f '{{.State.Status}}' "${service}" 2>/dev/null || echo unknown)"
    health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${service}" 2>/dev/null || echo unavailable)"
  fi
  printf 'SERVICE_%d_NAME=%s\nSERVICE_%d_STATUS=%s\nSERVICE_%d_HEALTH=%s\n' \
    "${service_count}" "$(safe_text "${service}")" \
    "${service_count}" "$(safe_text "${status}")" \
    "${service_count}" "$(safe_text "${health}")" >> "${TMP}.services"
  service_count=$((service_count + 1))
done

os_pretty="$(. /etc/os-release 2>/dev/null; printf '%s' "${PRETTY_NAME:-unknown}")"
os_version="$(. /etc/os-release 2>/dev/null; printf '%s' "${VERSION_ID:-unknown}")"

{
  printf 'FORMAT_VERSION=1\n'
  printf 'GENERATED_AT=%s\n' "$(safe_text "${generated_at}")"
  printf 'GENERATED_EPOCH=%s\n' "${now_epoch}"
  printf 'HOSTNAME=%s\n' "$(safe_text "$(hostname)")"
  printf 'OS_PRETTY=%s\n' "$(safe_text "${os_pretty}")"
  printf 'OS_VERSION=%s\n' "$(safe_text "${os_version}")"
  printf 'KERNEL=%s\n' "$(safe_text "$(uname -r)")"
  printf 'ARCH=%s\n' "$(safe_text "$(uname -m)")"
  printf 'CPU_LOGICAL=%s\n' "$(nproc)"
  printf 'CPU_USAGE_PERCENT=%s\n' "$(number_or_zero "${cpu_usage}")"
  printf 'LOAD_1=%s\nLOAD_5=%s\nLOAD_15=%s\n' "$(number_or_zero "${load1}")" "$(number_or_zero "${load5}")" "$(number_or_zero "${load15}")"
  printf 'UPTIME_SECONDS=%s\n' "$(number_or_zero "${uptime_seconds}")"
  printf 'MEM_TOTAL_BYTES=%s\nMEM_USED_BYTES=%s\nMEM_AVAILABLE_BYTES=%s\n' "${mem_total_bytes}" "${mem_used_bytes}" "${mem_available_bytes}"
  printf 'SWAP_TOTAL_BYTES=%s\nSWAP_USED_BYTES=%s\n' "${swap_total_bytes}" "${swap_used_bytes}"
  printf 'DISK_ROOT_TOTAL_BYTES=%s\nDISK_ROOT_USED_BYTES=%s\nDISK_ROOT_AVAILABLE_BYTES=%s\nDISK_ROOT_USED_PERCENT=%s\n' \
    "$(number_or_zero "${disk_total}")" "$(number_or_zero "${disk_used}")" "$(number_or_zero "${disk_available}")" "$(number_or_zero "${disk_percent}")"
  printf 'INODE_TOTAL=%s\nINODE_USED=%s\nINODE_AVAILABLE=%s\nINODE_USED_PERCENT=%s\n' \
    "$(number_or_zero "${inode_total}")" "$(number_or_zero "${inode_used}")" "$(number_or_zero "${inode_available}")" "$(number_or_zero "${inode_percent}")"
  printf 'APP_DIR_BYTES=%s\nBACKUP_DIR_BYTES=%s\nBACKUP_COUNT=%s\n' "$(number_or_zero "${app_dir_bytes}")" "$(number_or_zero "${backup_dir_bytes}")" "$(number_or_zero "${backup_count}")"
  printf 'BACKUP_LATEST_NAME=%s\nBACKUP_LATEST_EPOCH=%s\nBACKUP_LATEST_BYTES=%s\n' "$(safe_text "${latest_backup_name}")" "$(number_or_zero "${latest_backup_epoch}")" "$(number_or_zero "${latest_backup_bytes}")"
  printf 'POSTGRES_DATA_BYTES=%s\n' "$(number_or_zero "${postgres_data_bytes}")"
  printf 'SERVICE_COUNT=%s\n' "${service_count}"
  cat "${TMP}.services"
  printf 'NET_COUNT=%s\n' "${net_count}"
  cat "${TMP}.network" 2>/dev/null || true
  printf 'NET_TOTAL_RX_BYTES=%s\nNET_TOTAL_TX_BYTES=%s\nNET_TOTAL_RX_BPS=%s\nNET_TOTAL_TX_BPS=%s\n' \
    "${net_total_rx}" "${net_total_tx}" "${net_total_rx_bps}" "${net_total_tx_bps}"
} > "${TMP}"

{
  printf 'CPU %s %s %s\n' "${cpu_total}" "${cpu_idle_all}" "${now_epoch}"
  for line in "${net_state_lines[@]}"; do printf '%s\n' "${line}"; done
} > "${STATE_TMP}"

chmod 0644 "${TMP}"
chmod 0600 "${STATE_TMP}"
mv "${TMP}" "${OUT}"
mv "${STATE_TMP}" "${STATE}"
rm -f "${TMP}.network" "${TMP}.services"

echo "Host metrics updated: ${OUT}"
