#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/kitchen-os"
REPO_URL="https://github.com/vial1307/restaurant-management-system-demo.git"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root."
  exit 1
fi

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl gnupg git ufw openssl

install -m 0755 -d /etc/apt/keyrings
if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
fi

. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker

# Allow the dedicated deploy account to manage application containers.
if id deploy >/dev/null 2>&1; then
  usermod -aG docker deploy
fi

ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

mkdir -p "${APP_DIR}" "${APP_DIR}/backups"
if [[ ! -d "${APP_DIR}/repo/.git" ]]; then
  git clone "${REPO_URL}" "${APP_DIR}/repo"
else
  if id deploy >/dev/null 2>&1; then
    sudo -u deploy git -C "${APP_DIR}/repo" fetch origin
    sudo -u deploy git -C "${APP_DIR}/repo" reset --hard origin/main
  else
    git -C "${APP_DIR}/repo" fetch origin
    git -C "${APP_DIR}/repo" reset --hard origin/main
  fi
fi

if [[ ! -f "${APP_DIR}/.env" ]]; then
  DB_PASSWORD="$(openssl rand -hex 32)"
  cat > "${APP_DIR}/.env" <<EOF
POSTGRES_DB=kitchen_os
POSTGRES_USER=kitchen_app
POSTGRES_PASSWORD=${DB_PASSWORD}
BACKUP_KEEP_DAYS=7
EOF
  chmod 600 "${APP_DIR}/.env"
fi

# deploy may run docker compose later, but secrets stay unreadable to other users.
if id deploy >/dev/null 2>&1; then
  chown -R deploy:deploy "${APP_DIR}/repo"
  chown deploy:deploy "${APP_DIR}/backups"
  chown root:deploy "${APP_DIR}/.env"
  chmod 640 "${APP_DIR}/.env"
fi

cp "${APP_DIR}/repo/vps/docker-compose.yml" "${APP_DIR}/docker-compose.yml"
if id deploy >/dev/null 2>&1; then
  chown deploy:deploy "${APP_DIR}/docker-compose.yml"
fi

cd "${APP_DIR}"
docker compose --env-file .env up -d db
docker compose --env-file .env ps

echo
echo "=== Firewall ==="
ufw status
echo
echo "=== Docker ==="
docker --version
docker compose version
echo
echo "Bootstrap complete."
echo "PostgreSQL port 5432 is private to Docker; SSH password login is unchanged."
