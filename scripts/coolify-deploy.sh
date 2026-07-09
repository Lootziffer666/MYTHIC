#!/usr/bin/env bash
#
# coolify-deploy.sh — Deploy a Git repository to your Coolify instance via its API.
# No Coolify UI needed: this creates the app, configures nixpacks detection, and
# triggers the deploy in the background — exactly like MYTHIC.
#
# Usage:
#   ./coolify-deploy.sh https://github.com/user/my-app.git \
#       --name "My App" \
#       --branch main \
#       --domain my-app.example.com \
#       --env "API_KEY=secret" --env "NODE_ENV=production"
#
# Required environment variables:
#   COOLIFY_URL         e.g. https://coolify.your-domain.com
#   COOLIFY_API_TOKEN   Personal Access Token (Profile -> Tokens)
#   COOLIFY_DESTINATION_ID  Destination (server) UUID  ->  GET /api/v1/destinations
#   COOLIFY_SOURCE_ID       Git source UUID            ->  GET /api/v1/sources
#
# Optional:
#   COOLIFY_ENVIRONMENT_NAME  (default: production)

set -euo pipefail

# ---- required config ----
COOLIFY_URL="${COOLIFY_URL:?Set COOLIFY_URL (e.g. https://coolify.example.com)}"
COOLIFY_API_TOKEN="${COOLIFY_API_TOKEN:?Set COOLIFY_API_TOKEN}"
DESTINATION_ID="${COOLIFY_DESTINATION_ID:?Set COOLIFY_DESTINATION_ID (GET /api/v1/destinations)}"
SOURCE_ID="${COOLIFY_SOURCE_ID:?Set COOLIFY_SOURCE_ID (GET /api/v1/sources)}"
ENVIRONMENT_NAME="${COOLIFY_ENVIRONMENT_NAME:-production}"

# ---- argument parsing ----
REPO_URL=""
APP_NAME=""
BRANCH="main"
DOMAIN=""
ENV_VARS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name)   APP_NAME="$2"; shift 2 ;;
    --branch) BRANCH="$2"; shift 2 ;;
    --domain) DOMAIN="$2"; shift 2 ;;
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

# ---- build the environment JSON array ----
ENV_JSON="[]"
if [[ ${#ENV_VARS[@]} -gt 0 ]]; then
  ENV_JSON=$(printf '%s\n' "${ENV_VARS[@]}" | awk -v q='"' 'BEGIN{n=0;printf "["} {split($0,a,"="); if(n>0)printf ","; printf "{\"key\":%s,\"value\":%s}", q a[1] q, q a[2] q; n++} END{printf "]"}')
fi

# ---- create the application ----
echo "→ Creating application '$APP_NAME' in Coolify…"
RESPONSE=$(curl -fsS -X POST "$COOLIFY_URL/api/v1/applications" \
  -H "Authorization: Bearer $COOLIFY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(cat <<EOF
{
  "name": "$APP_NAME",
  "description": "Created via coolify-deploy.sh",
  "repository_url": "$REPO_URL",
  "git_raw_repository_url": "$REPO_URL",
  "git_branch": "$BRANCH",
  "build_pack": "nixpacks",
  "environment_name": "$ENVIRONMENT_NAME",
  "destination_id": "$DESTINATION_ID",
  "source_id": "$SOURCE_ID",
  "instant_deploy": true,
  "domains": $([ -n "$DOMAIN" ] && echo "[\"$DOMAIN\"]" || echo "[]"),
  "envs": $ENV_JSON
}
EOF
)")

UUID=$(printf '%s' "$RESPONSE" | grep -o '"uuid":"[^"]*"' | head -1 | sed 's/"uuid":"//;s/"//')
[[ -z "$UUID" ]] && { echo "Failed to parse UUID from response:"; echo "$RESPONSE"; exit 1; }

echo "✓ Application created: $UUID"
echo "  Dashboard: $COOLIFY_URL/project/[env]/application/$UUID"
echo "  API:       $COOLIFY_URL/api/v1/applications/$UUID"

# ---- trigger the deploy (instant_deploy usually covers this) ----
echo "→ Triggering deployment…"
curl -fsS -X POST "$COOLIFY_URL/api/v1/applications/$UUID/deploy" \
  -H "Authorization: Bearer $COOLIFY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"force": false, "pull_request_id": null}' >/dev/null || true

echo "✓ Deploy queued. Coolify will clone, detect (nixpacks), build and deploy automatically."
