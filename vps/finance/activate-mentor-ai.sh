#!/usr/bin/env bash
# Sealed Finance-only OpenAI activation. Run as root via exact sudoers entry.
# Never log or display the API key, and never modify the Kitchen/Postgres ledger.
set -euo pipefail
set +x
umask 077
DIR=/opt/kitchen-os
ENV_FILE="$DIR/.env"
COMPOSE="$DIR/docker-compose.yml"
FINANCE_COMPOSE="$DIR/docker-compose.finance.yml"
MODE="${1:-}"
if [[ "$EUID" -ne 0 || $# -ne 1 ]]; then
  echo FINANCE_AI_PRIVILEGED_USAGE >&2; exit 77
fi
case "$MODE" in activate|disable|status) ;; *) echo FINANCE_AI_MODE_INVALID >&2; exit 64;; esac
if [[ ! -f "$ENV_FILE" || ! -f "$COMPOSE" || ! -f "$FINANCE_COMPOSE" ]]; then
  echo FINANCE_AI_PROVISIONING_INCOMPLETE >&2; exit 67
fi
# Match the exact served release; avoid silently resetting the backend release
# marker to the compose development fallback when recreating only the API.
[[ -f "$DIR/www/RELEASE" ]] || { echo FINANCE_AI_RELEASE_UNVERIFIED >&2; exit 75; }
APP_RELEASE="$(tr -d '[:space:]' < "$DIR/www/RELEASE")"
[[ "$APP_RELEASE" =~ ^[0-9a-f]{7,40}$ ]] || { echo FINANCE_AI_RELEASE_INVALID >&2; exit 75; }
export APP_RELEASE
if [[ "$MODE" == "status" ]]; then
  docker exec kitchen-os-api node -e '
    const active=process.env.FINANCE_AI_ENABLED==="true"&&!!process.env.OPENAI_API_KEY;
    console.log("FINANCE_MENTOR_AI_ACTIVE="+active);
    console.log("FINANCE_MENTOR_AI_MODE="+(process.env.FINANCE_AI_MODEL||"unspecified"));
  '
  exit 0
fi
if [[ "$(docker inspect -f '{{.State.Running}}' kitchen-finance-db 2>/dev/null || true)" != true ]]; then
  echo FINANCE_AI_DATABASE_NOT_READY >&2; exit 75
fi
key=""
if [[ "$MODE" == activate ]]; then
  # Secret arrives only through standard input from a manually dispatched
  # GitHub Actions run, never a CLI argument or an SSH command line.
  IFS= read -r key || { echo FINANCE_AI_KEY_MISSING >&2; exit 66; }
  if [[ ! "$key" =~ ^sk-[A-Za-z0-9._~-]{18,240}$ ]]; then
    echo FINANCE_AI_KEY_FORMAT_INVALID >&2; exit 66
  fi
fi
backup="$(mktemp "$DIR/.env.mentor-backup.XXXXXX")"
candidate="$(mktemp "$DIR/.env.mentor-candidate.XXXXXX")"
chmod 0600 "$backup" "$candidate"
cp -p "$ENV_FILE" "$backup"
updated=0
rollback_and_clean(){
  rc=$?
  trap - EXIT
  if (( rc != 0 )) && [[ "$updated" == 1 ]]; then
    cp -p "$backup" "$ENV_FILE"
    chmod 0600 "$ENV_FILE"
    (cd "$DIR" && docker compose --env-file "$ENV_FILE" -f "$COMPOSE" -f "$FINANCE_COMPOSE" up -d --no-deps --force-recreate app >/dev/null 2>&1) || true
    echo FINANCE_AI_ROLLBACK_COMPLETED >&2
  fi
  rm -f "$backup" "$candidate"
  exit "$rc"
}
trap rollback_and_clean EXIT
# Retain other Kitchen and Finance config exactly; only these opt-in keys change.
awk '!/^(OPENAI_API_KEY|FINANCE_AI_ENABLED|FINANCE_AI_MODEL)=/' "$ENV_FILE" > "$candidate"
if [[ "$MODE" == activate ]]; then
  printf 'OPENAI_API_KEY=%s\nFINANCE_AI_ENABLED=true\nFINANCE_AI_MODEL=gpt-5.6-terra\n' "$key" >> "$candidate"
else
  printf 'FINANCE_AI_ENABLED=false\nFINANCE_AI_MODEL=gpt-5.6-terra\n' >> "$candidate"
fi
chown --reference="$ENV_FILE" "$candidate"
chmod 0600 "$candidate"
mv -f "$candidate" "$ENV_FILE"
updated=1
(cd "$DIR" && docker compose --env-file "$ENV_FILE" -f "$COMPOSE" -f "$FINANCE_COMPOSE" config --quiet)
(cd "$DIR" && docker compose --env-file "$ENV_FILE" -f "$COMPOSE" -f "$FINANCE_COMPOSE" up -d --no-deps --force-recreate app >/dev/null)
for attempt in $(seq 1 35); do
  if curl --max-time 3 -fsS http://127.0.0.1:8080/api/health >/dev/null 2>&1; then break; fi
  if [[ "$attempt" -eq 35 ]]; then echo FINANCE_AI_APP_UNHEALTHY >&2; exit 75; fi
  sleep 2
done
if [[ "$MODE" == activate ]]; then
  # Probe from the actual backend container (using its private environment).
  # Deliberately never echo provider response bodies, headers or credentials.
  docker exec kitchen-os-api node -e '
    (async()=>{
      const key=process.env.OPENAI_API_KEY;
      if(process.env.FINANCE_AI_ENABLED!=="true"||!key) process.exit(72);
      const body={model:process.env.FINANCE_AI_MODEL||"gpt-5.6-terra",
        input:"Reply OK.",store:false,max_output_tokens:32};
      const r=await fetch("https://api.openai.com/v1/responses",{
        method:"POST",
        headers:{"Content-Type":"application/json",Authorization:"Bearer "+key},
        body:JSON.stringify(body),signal:AbortSignal.timeout(25000)
      });
      if(!r.ok){console.error("FINANCE_AI_PROVIDER_HTTP_"+r.status);process.exit(73);}
      console.log("FINANCE_AI_PROVIDER_PROBE_OK");
    })().catch(()=>{console.error("FINANCE_AI_PROVIDER_PROBE_ERROR");process.exit(74)});
  '
  echo FINANCE_AI_ENABLED_AND_VERIFIED
else
  docker exec kitchen-os-api node -e '
    if(process.env.FINANCE_AI_ENABLED==="true"||process.env.OPENAI_API_KEY)process.exit(74);
    console.log("FINANCE_AI_DISABLED");
  '
fi
updated=0
