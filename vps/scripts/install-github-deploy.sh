#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/kitchen-os}"
DEPLOY_USER="${DEPLOY_USER:-deploy}"
AUTHORIZED_DIR="/home/${DEPLOY_USER}/.ssh"
AUTHORIZED_KEYS="${AUTHORIZED_DIR}/authorized_keys"
WRAPPER="/usr/local/sbin/kitchen-os-deploy"
SUDOERS="/etc/sudoers.d/kitchen-os-deploy"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this installer as root."
  exit 1
fi

read -r PUBLIC_KEY || true
PUBLIC_KEY="$(printf '%s' "${PUBLIC_KEY}" | tr -d '\r')"

if [[ ! "${PUBLIC_KEY}" =~ ^ssh-ed25519[[:space:]]+[A-Za-z0-9+/=]+([[:space:]].*)?$ ]]; then
  echo "Expected one ssh-ed25519 public key on stdin."
  exit 2
fi

id "${DEPLOY_USER}" >/dev/null 2>&1 || {
  echo "Deploy user '${DEPLOY_USER}' does not exist."
  exit 2
}

install -d -m 700 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "${AUTHORIZED_DIR}"
touch "${AUTHORIZED_KEYS}"
chown "${DEPLOY_USER}:${DEPLOY_USER}" "${AUTHORIZED_KEYS}"
chmod 600 "${AUTHORIZED_KEYS}"

if ! grep -Fqx "${PUBLIC_KEY}" "${AUTHORIZED_KEYS}"; then
  printf '%s\n' "${PUBLIC_KEY}" >> "${AUTHORIZED_KEYS}"
fi

cat > "${WRAPPER}" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/kitchen-os}"
LOCK_FILE="/run/lock/kitchen-os-deploy.lock"

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "Another Kitchen OS deployment is already running."
  exit 75
fi

cd "${APP_DIR}"
exec /usr/bin/bash "${APP_DIR}/repo/vps/scripts/deploy-api.sh"
EOF

chown root:root "${WRAPPER}"
chmod 755 "${WRAPPER}"

cat > "${SUDOERS}" <<EOF
${DEPLOY_USER} ALL=(root) NOPASSWD: ${WRAPPER}
EOF
chmod 440 "${SUDOERS}"
visudo -cf "${SUDOERS}"

echo "GitHub deploy access installed."
echo "User: ${DEPLOY_USER}"
echo "Command: sudo -n ${WRAPPER}"
