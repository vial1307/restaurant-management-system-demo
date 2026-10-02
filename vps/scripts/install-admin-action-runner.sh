#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/kitchen-os}"
REPO_DIR="${APP_DIR}/repo"
ACTION_DIR="${APP_DIR}/admin-actions"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root."
  exit 1
fi

install -d -m 0755 "${ACTION_DIR}" "${ACTION_DIR}/requests" "${ACTION_DIR}/results"
printf '%s\n' "KITCHEN_ADMIN_ACTIONS_V1" > "${ACTION_DIR}/READY"
chmod 0644 "${ACTION_DIR}/READY"

install -m 0755 "${REPO_DIR}/vps/scripts/admin-action-runner.sh" /usr/local/sbin/kitchen-admin-actions-runner

cat > /etc/systemd/system/kitchen-admin-actions.service <<'UNIT'
[Unit]
Description=Kitchen OS allowlisted host action runner
Requires=docker.service
After=docker.service network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/kitchen-admin-actions-runner
User=root
Group=root
Nice=10
UNIT

cat > /etc/systemd/system/kitchen-admin-actions.path <<'UNIT'
[Unit]
Description=Watch Kitchen OS Super Admin host-action queue

[Path]
PathExistsGlob=/opt/kitchen-os/admin-actions/requests/*.request
Unit=kitchen-admin-actions.service

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now kitchen-admin-actions.path
systemctl start kitchen-admin-actions.service || true

echo "Super Admin host-action bridge installed."
