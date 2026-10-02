#!/usr/bin/env bash
set -euo pipefail

QUEUE_ROOT="/opt/kitchen-os/admin-actions"
REQUEST_DIR="${QUEUE_ROOT}/requests"
RESULT_DIR="${QUEUE_ROOT}/results"
MARKETING_DIR="/opt/marketing-seo-platform"
MARKETING_REPO="git@github.com:vial1307/marketing-seo-platform.git"
MARKETING_URL="https://marketing.82.47.180.185.nip.io"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root."
  exit 1
fi

install -d -m 0755 "${REQUEST_DIR}" "${RESULT_DIR}"
exec 9>/run/lock/kitchen-admin-actions.lock
if ! flock -n 9; then
  exit 0
fi

git_as_deploy() {
  runuser -u deploy -- env     GIT_SSH_COMMAND="ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15"     git "$@"
}

ensure_marketing_source() {
  if [[ -d "${MARKETING_DIR}/.git" ]]; then
    return 0
  fi

  if [[ -d "${MARKETING_DIR}" ]] && find "${MARKETING_DIR}" -mindepth 1 -maxdepth 1 -print -quit | grep -q .; then
    echo "MARKETING_DIRECTORY_NOT_EMPTY: ${MARKETING_DIR}"
    return 40
  fi

  install -d -m 0755 -o deploy -g deploy "${MARKETING_DIR}"
  echo "Cloning Marketing repository..."
  if ! timeout 90 runuser -u deploy -- env     GIT_SSH_COMMAND="ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15"     git clone "${MARKETING_REPO}" "${MARKETING_DIR}"; then
    echo "MARKETING_REPO_ACCESS_REQUIRED: deploy user cannot clone the private repository."
    return 41
  fi
}

ensure_marketing_env() {
  if [[ -f "${MARKETING_DIR}/.env" ]]; then
    return 0
  fi
  cat > "${MARKETING_DIR}/.env" <<'ENVFILE'
NEXT_PUBLIC_SITE_URL=https://marketing.82.47.180.185.nip.io
NEXT_PUBLIC_SITE_NAME=Marketing SEO Platform
NEXT_PUBLIC_GA_ID=
SITE_PUBLIC=false
LEAD_WEBHOOK_URL=
LEAD_WEBHOOK_SECRET=
ENVFILE
  chown root:deploy "${MARKETING_DIR}/.env"
  chmod 0640 "${MARKETING_DIR}/.env"
}

ensure_marketing_network() {
  docker network inspect marketing_edge >/dev/null 2>&1 || docker network create marketing_edge >/dev/null
}

wait_marketing_health() {
  for attempt in $(seq 1 60); do
    if curl -fsS http://127.0.0.1:3100/ >/dev/null; then
      return 0
    fi
    sleep 2
  done
  return 1
}

marketing_status() {
  echo "URL=${MARKETING_URL}"
  if [[ ! -d "${MARKETING_DIR}/.git" ]]; then
    echo "SOURCE=not-installed"
  else
    echo "SOURCE_COMMIT=$(git_as_deploy -C "${MARKETING_DIR}" rev-parse --short HEAD 2>/dev/null || echo unknown)"
  fi
  if docker inspect marketing-seo-platform >/dev/null 2>&1; then
    echo "CONTAINER=$(docker inspect -f '{{.State.Status}}' marketing-seo-platform)"
    echo "HEALTH_HTTP=$(curl -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1:3100/ 2>/dev/null || echo unavailable)"
    docker ps --filter name='^/marketing-seo-platform$' --format 'IMAGE={{.Image}} STATUS={{.Status}} PORTS={{.Ports}}'
  else
    echo "CONTAINER=not-created"
  fi
}

marketing_deploy() {
  ensure_marketing_source
  ensure_marketing_env
  ensure_marketing_network

  local previous target
  previous="$(git_as_deploy -C "${MARKETING_DIR}" rev-parse HEAD)"
  echo "Current commit: ${previous}"

  git_as_deploy -C "${MARKETING_DIR}" fetch --prune origin main
  target="$(git_as_deploy -C "${MARKETING_DIR}" rev-parse origin/main)"
  if [[ ! "${target}" =~ ^[0-9a-f]{40}$ ]]; then
    echo "MARKETING_TARGET_INVALID"
    return 42
  fi

  printf '%s\n' "${previous}" > "${MARKETING_DIR}/.previous-release"
  chown root:deploy "${MARKETING_DIR}/.previous-release"
  chmod 0640 "${MARKETING_DIR}/.previous-release"

  git_as_deploy -C "${MARKETING_DIR}" reset --hard "${target}"
  echo "Deploying commit: ${target}"
  (
    cd "${MARKETING_DIR}"
    docker compose --env-file .env up -d --build
  )

  if wait_marketing_health; then
    echo "Marketing healthy at ${MARKETING_URL}"
    marketing_status
    return 0
  fi

  echo "Marketing health check failed; restoring previous source ${previous}."
  git_as_deploy -C "${MARKETING_DIR}" reset --hard "${previous}"
  (
    cd "${MARKETING_DIR}"
    docker compose --env-file .env up -d --build
  ) || true
  wait_marketing_health || true
  return 43
}

marketing_restart() {
  if ! docker inspect marketing-seo-platform >/dev/null 2>&1; then
    echo "MARKETING_CONTAINER_NOT_FOUND"
    return 44
  fi
  docker restart marketing-seo-platform
  if ! wait_marketing_health; then
    echo "MARKETING_RESTART_HEALTH_FAILED"
    return 45
  fi
  marketing_status
}

marketing_logs() {
  if ! docker inspect marketing-seo-platform >/dev/null 2>&1; then
    echo "MARKETING_CONTAINER_NOT_FOUND"
    return 44
  fi
  docker logs --tail 120 --timestamps marketing-seo-platform 2>&1
}

marketing_rollback() {
  if [[ ! -d "${MARKETING_DIR}/.git" || ! -f "${MARKETING_DIR}/.previous-release" ]]; then
    echo "MARKETING_PREVIOUS_RELEASE_NOT_FOUND"
    return 46
  fi
  ensure_marketing_env
  ensure_marketing_network

  local previous current
  previous="$(tr -d '[:space:]' < "${MARKETING_DIR}/.previous-release")"
  current="$(git_as_deploy -C "${MARKETING_DIR}" rev-parse HEAD)"
  if [[ ! "${previous}" =~ ^[0-9a-f]{40}$ ]]; then
    echo "MARKETING_PREVIOUS_RELEASE_INVALID"
    return 47
  fi
  if ! git_as_deploy -C "${MARKETING_DIR}" cat-file -e "${previous}^{commit}" 2>/dev/null; then
    echo "MARKETING_PREVIOUS_RELEASE_MISSING"
    return 48
  fi

  echo "Rolling back ${current} -> ${previous}"
  git_as_deploy -C "${MARKETING_DIR}" reset --hard "${previous}"
  (
    cd "${MARKETING_DIR}"
    docker compose --env-file .env up -d --build
  )
  if ! wait_marketing_health; then
    echo "Rollback health failed; restoring ${current}."
    git_as_deploy -C "${MARKETING_DIR}" reset --hard "${current}"
    (
      cd "${MARKETING_DIR}"
      docker compose --env-file .env up -d --build
    ) || true
    return 49
  fi

  printf '%s\n' "${current}" > "${MARKETING_DIR}/.previous-release"
  chown root:deploy "${MARKETING_DIR}/.previous-release"
  chmod 0640 "${MARKETING_DIR}/.previous-release"
  marketing_status
}

run_action() {
  case "$1" in
    marketing_status) marketing_status ;;
    marketing_deploy) marketing_deploy ;;
    marketing_restart) marketing_restart ;;
    marketing_logs) marketing_logs ;;
    marketing_rollback) marketing_rollback ;;
    *)
      echo "SERVER_ACTION_NOT_ALLOWED"
      return 64
      ;;
  esac
}

write_result() {
  local request_id="$1" action="$2" status="$3" exit_code="$4" started_at="$5" finished_at="$6" output_file="$7"
  local result_tmp="${RESULT_DIR}/.${request_id}.result.tmp"
  local result_file="${RESULT_DIR}/${request_id}.result"
  local capped_file
  capped_file="$(mktemp)"
  tail -c 60000 "${output_file}" > "${capped_file}" 2>/dev/null || cp "${output_file}" "${capped_file}"
  local output_b64
  output_b64="$(base64 < "${capped_file}" | tr -d '\n')"
  rm -f "${capped_file}"
  {
    echo "VERSION=1"
    echo "REQUEST_ID=${request_id}"
    echo "ACTION=${action}"
    echo "STATUS=${status}"
    echo "EXIT_CODE=${exit_code}"
    echo "STARTED_AT=${started_at}"
    echo "FINISHED_AT=${finished_at}"
    echo "OUTPUT_B64=${output_b64}"
  } > "${result_tmp}"
  chmod 0644 "${result_tmp}"
  mv -f "${result_tmp}" "${result_file}"
}

shopt -s nullglob
for request in "${REQUEST_DIR}"/*.request; do
  base="$(basename "${request}" .request)"
  processing="${REQUEST_DIR}/${base}.processing"
  if ! mv "${request}" "${processing}" 2>/dev/null; then
    continue
  fi

  request_id="$(sed -n 's/^REQUEST_ID=//p' "${processing}" | head -n1)"
  action="$(sed -n 's/^ACTION=//p' "${processing}" | head -n1)"
  started_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  output_file="$(mktemp)"
  exit_code=0

  if [[ ! "${base}" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]]     || [[ "${request_id}" != "${base}" ]]; then
    echo "INVALID_SERVER_ACTION_REQUEST" > "${output_file}"
    exit_code=65
  else
    set +e
    run_action "${action}" > "${output_file}" 2>&1
    exit_code=$?
    set -e
  fi

  finished_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  status="success"
  if [[ "${exit_code}" -ne 0 ]]; then
    status="failed"
  fi
  write_result "${base}" "${action}" "${status}" "${exit_code}" "${started_at}" "${finished_at}" "${output_file}"
  rm -f "${output_file}" "${processing}"
done

find "${RESULT_DIR}" -type f -name '*.result' -mtime +7 -delete 2>/dev/null || true
