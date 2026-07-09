#!/usr/bin/env bash
#
# coolify-deploy.sh — Deploy a PUBLIC Git repository to your Coolify instance via its API.
# No Coolify UI needed: this creates the app on the public-repo endpoint, configures
# nixpacks detection, adds env vars, and triggers the deploy — exactly like MYTHIC.
#
# Usage:
#   ./coolify-deploy.sh https://github.com/user/my-app.git \
#       --name "my-app" \
#       --branch main \
#       --domain my-app.example.com \
#       --port 3000 \
#       --env "API_KEY=secret" --env "NODE_ENV=production"
#
# Required environment variables:
#   COOLIFY_URL           e.g. https://coolify.your-domain.com  (your Coolify base URL)
#   COOLIFY_API_TOKEN     Personal API token (Coolify -> Keys & Tokens -> API tokens)
#   COOLIFY_PROJECT_UUID  Target project UUID   ->  GET /api/v1/projects
#   COOLIFY_SERVER_UUID   Target server UUID    ->  GET /api/v1/servers
#
# Optional:
#   COOLIFY_ENVIRONMENT_NAME  (default: production)
#   COOLIFY_BUILD_PACK        (default: nixpacks)

set -euo pipefail

# ---- required config ----
COOLIFY_URL="${COOLIFY_URL:?Set COOLIFY_URL (e.g. https://coolify.example.com)}"
COOLIFY_API_TOKEN="${COOLIFY_API_TOKEN:?Set COOLIFY_API_TOKEN (Keys & Tokens -> API tokens)}"
PROJECT_UUID="${COOLIFY_PROJECT_UUID:?Set COOLIFY_PROJECT_UUID (GET /api/v1/projects)}"
SERVER_UUID="${COOLIFY_SERVER_UUID:?Set COOLIFY_SERVER_UUID (GET /api/v1/servers)}"
ENVIRONMENT_NAME="${COOLIFY_ENVIRONMENT_NAME:-production}"
BUILD_PACK="${COOLIFY_BUILD_PACK:-nixpacks}"

# strip a trailing slash from the base URL, if any
COOLIFY_URL="${COOLIFY_URL%/}"

# ---- argument parsing ----
REPO_URL=""
APP_NAME=""
BRANCH="main"
DOMAIN=""
PORT="3000"
ENV_VARS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name)   APP_NAME="$2"; shift 2 ;;
    --branch) BRANCH="$2"; shift 2 ;;
    --domain) DOMAIN="$2"; shift 2 ;;
    --port)   PORT="$2"; shift 2 ;;
    --env)    ENV_VARS+=("$2"); shift 2 ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)
      if [[ -z "$REPO_URL" ]]; then REPO_URL="$1"; else
        echo "Unknown argument: $1" >&2; exit 1; fi
      shift ;;
  esac
done

[[ -z "$REPO_URL" ]] && { echo "Error: repository URL is required." >&2; exit 1; }
[[ -z "$APP_NAME" ]] && APP_NAME="$(basename "$REPO_URL" .git)"

AUTH=(-H "Authorization: Bearer $COOLIFY_API_TOKEN" -H "Content-Type: application/json" -H "Accept: application/json")

# Deploy immediately only when there are no env vars to add first.
INSTANT_DEPLOY=true
[[ ${#ENV_VARS[@]} -gt 0 ]] && INSTANT_DEPLOY=false

DOMAIN_JSON="null"
[[ -n "$DOMAIN" ]] && DOMAIN_JSON="\"https://$DOMAIN\""

# ---- 1) create the application from a public repo ----
echo "→ Creating application '$APP_NAME' from public repo in Coolify…"
RESPONSE=$(curl -fsS -X POST "$COOLIFY_URL/api/v1/applications/public" "${AUTH[@]}" \
  -d "$(cat <<EOF
{
  "project_uuid": "$PROJECT_UUID",
  "server_uuid": "$SERVER_UUID",
  "environment_name": "$ENVIRONMENT_NAME",
  "git_repository": "$REPO_URL",
  "git_branch": "$BRANCH",
  "build_pack": "$BUILD_PACK",
  "ports_exposes": "$PORT",
  "name": "$APP_NAME",
  "description": "Created via MYTHIC coolify-deploy.sh",
  "domains": $DOMAIN_JSON,
  "instant_deploy": $INSTANT_DEPLOY
}
EOF
)")

UUID=$(printf '%s' "$RESPONSE" | grep -o '"uuid":"[^"]*"' | head -1 | sed 's/"uuid":"//;s/"//')
[[ -z "$UUID" ]] && { echo "Failed to parse application UUID from response:"; echo "$RESPONSE"; exit 1; }

echo "✓ Application created: $UUID"

# ---- 2) add environment variables (if any) ----
if [[ ${#ENV_VARS[@]} -gt 0 ]]; then
  echo "→ Adding ${#ENV_VARS[@]} environment variable(s)…"
  for pair in "${ENV_VARS[@]}"; do
    KEY="${pair%%=*}"
    VALUE="${pair#*=}"
    curl -fsS -X POST "$COOLIFY_URL/api/v1/applications/$UUID/envs" "${AUTH[@]}" \
      -d "{\"key\":\"$KEY\",\"value\":\"$VALUE\",\"is_preview\":false}" >/dev/null
    echo "  • $KEY"
  done

  # ---- 3) trigger the deploy now that env vars are in place ----
  echo "→ Triggering deployment…"
  curl -fsS "$COOLIFY_URL/api/v1/deploy?uuid=$UUID" "${AUTH[@]}" >/dev/null
fi

echo "✓ Deploy queued. Coolify will clone, detect ($BUILD_PACK), build and deploy automatically."
[[ -n "$DOMAIN" ]] && echo "  URL: https://$DOMAIN"
echo "  Dashboard: $COOLIFY_URL  (application $UUID)"
