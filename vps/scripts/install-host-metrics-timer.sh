#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root."
  exit 1
fi

APP_DIR="${APP_DIR:-/opt/kitchen-os}"
COLLECTOR="${APP_DIR}/repo/vps/scripts/collect-host-metrics.sh"
test -x "${COLLECTOR}" || chmod 0755 "${COLLECTOR}"
mkdir -p "${APP_DIR}/runtime"
chmod 0755 "${APP_DIR}/runtime"

cat > /etc/systemd/system/kitchen-os-host-metrics.service <<EOF
[Unit]
Description=Kitchen OS safe host metrics snapshot
After=docker.service
Wants=docker.service

[Service]
Type=oneshot
Environment=APP_DIR=${APP_DIR}
ExecStart=/bin/bash ${COLLECTOR}
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=full
ReadWritePaths=${APP_DIR}/runtime
EOF

cat > /etc/systemd/system/kitchen-os-host-metrics.timer <<'EOF'
[Unit]
Description=Kitchen OS host metrics refresh timer

[Timer]
OnBootSec=30s
OnUnitActiveSec=60s
AccuracySec=15s
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now kitchen-os-host-metrics.timer
systemctl start kitchen-os-host-metrics.service
systemctl is-active kitchen-os-host-metrics.timer >/dev/null
