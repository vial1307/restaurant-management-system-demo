#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root."
  exit 1
fi

cat > /etc/systemd/system/kitchen-os-backup.service <<'EOF'
[Unit]
Description=Kitchen OS PostgreSQL backup
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/bin/bash /opt/kitchen-os/repo/vps/scripts/backup.sh
EOF

cat > /etc/systemd/system/kitchen-os-backup.timer <<'EOF'
[Unit]
Description=Kitchen OS PostgreSQL backup timer

[Timer]
OnCalendar=*-*-* 00,06,12,18:00:00
Persistent=true
RandomizedDelaySec=120

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now kitchen-os-backup.timer
systemctl list-timers kitchen-os-backup.timer --no-pager
