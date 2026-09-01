#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root."
  exit 1
fi

USER_NAME="deploy"

if ! id "${USER_NAME}" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "${USER_NAME}"
fi

usermod -aG sudo "${USER_NAME}"

install -d -m 700 -o "${USER_NAME}" -g "${USER_NAME}" "/home/${USER_NAME}/.ssh"

if [[ -f /root/.ssh/authorized_keys ]]; then
  cp /root/.ssh/authorized_keys "/home/${USER_NAME}/.ssh/authorized_keys"
  chown "${USER_NAME}:${USER_NAME}" "/home/${USER_NAME}/.ssh/authorized_keys"
  chmod 600 "/home/${USER_NAME}/.ssh/authorized_keys"
fi

echo "Deploy user ready. Test SSH before disabling root/password login."
