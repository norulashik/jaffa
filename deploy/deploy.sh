#!/usr/bin/env bash
# JAFFA deploy script — wraps the manual EC2 deploy flow:
#   git pull → backend build → frontend build → systemctl restart both
#
# Usage (from anywhere; the script cd's to its own repo root):
#   ./deploy/deploy.sh                   # default: pull + build + restart
#   ./deploy/deploy.sh --install         # also runs `npm ci` in both apps
#   ./deploy/deploy.sh --script foo      # runs `npx ts-node backend/src/scripts/foo.ts` after backend build
#   ./deploy/deploy.sh --no-pull         # skip git pull (useful if you've staged changes locally)
#   ./deploy/deploy.sh --no-restart      # build only, don't bounce services
#
# Recommended setup on the EC2 box:
#   1. Add a sudoers drop-in so `ubuntu` can restart the two services without a password prompt:
#         echo 'ubuntu ALL=(root) NOPASSWD: /bin/systemctl restart jaffa-backend, /bin/systemctl restart jaffa-frontend' \
#           | sudo tee /etc/sudoers.d/jaffa-deploy
#         sudo chmod 0440 /etc/sudoers.d/jaffa-deploy
#   2. Symlink for ergonomics:  sudo ln -s /home/ubuntu/jaffa/deploy/deploy.sh /usr/local/bin/jaffa-deploy
#   3. Run as the `ubuntu` user (NOT via `sudo su`) so the build artifacts stay owned by `ubuntu`.

set -euo pipefail

# --- arg parse ---------------------------------------------------------------
DO_PULL=1
DO_RESTART=1
DO_INSTALL=0
EXTRA_SCRIPT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-pull)    DO_PULL=0;    shift ;;
    --no-restart) DO_RESTART=0; shift ;;
    --install)    DO_INSTALL=1; shift ;;
    --script)     EXTRA_SCRIPT="${2:-}"; shift 2 ;;
    -h|--help)
      sed -n '2,18p' "$0"; exit 0 ;;
    *)
      echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done

# --- locate repo root --------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

log() { printf '\033[1;36m[deploy]\033[0m %s\n' "$*"; }
ok()  { printf '\033[1;32m[deploy]\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m[deploy]\033[0m %s\n' "$*" >&2; }

START_TIME=$(date +%s)

# --- 1. git pull -------------------------------------------------------------
if [[ "$DO_PULL" -eq 1 ]]; then
  log "git pull --ff-only"
  git pull --ff-only
else
  log "skipping git pull (--no-pull)"
fi

# --- 2. install (optional) ---------------------------------------------------
if [[ "$DO_INSTALL" -eq 1 ]]; then
  log "npm ci (backend + frontend)"
  ( cd backend && npm ci )
  ( cd frontend && npm ci )
fi

# --- 3. build backend --------------------------------------------------------
log "building backend"
( cd backend && npm run build )
ok "backend built"

# --- 4. optional one-off script ---------------------------------------------
if [[ -n "$EXTRA_SCRIPT" ]]; then
  log "running backend script: $EXTRA_SCRIPT"
  ( cd backend && npx ts-node "src/scripts/${EXTRA_SCRIPT}.ts" )
  ok "script complete"
fi

# --- 5. build frontend -------------------------------------------------------
log "building frontend"
( cd frontend && npm run build )
ok "frontend built"

# --- 6. restart services -----------------------------------------------------
if [[ "$DO_RESTART" -eq 1 ]]; then
  log "restarting jaffa-backend"
  sudo systemctl restart jaffa-backend
  log "restarting jaffa-frontend"
  sudo systemctl restart jaffa-frontend

  # Quick health check — backend exposes /api/health on :5000.
  sleep 2
  if curl -fsS --max-time 5 http://127.0.0.1:5000/api/health >/dev/null 2>&1; then
    ok "backend health check passed"
  else
    err "backend health check FAILED — check: sudo journalctl -u jaffa-backend -n 50"
    exit 1
  fi
else
  log "skipping restart (--no-restart)"
fi

ELAPSED=$(( $(date +%s) - START_TIME ))
ok "deploy complete in ${ELAPSED}s"
