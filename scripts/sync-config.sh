#!/usr/bin/env bash
# TravelCRM Pro - print the Terraform resource ids that the deploy needs.
#
#   bash scripts/sync-config.sh [--env production|staging|dev]
#
# Reads `terraform output` (terraform must have been applied) and prints the CF_* variables that
# backend/scripts/gen-wrangler.mjs reads. It writes NOTHING:
#   * it does not touch backend/.dev.vars (local development keeps its own file),
#   * it does not edit backend/wrangler.toml (the generated backend/.wrangler.<env>.toml is the only deploy config).
#
# Typical use (Git Bash):
#   eval "$(bash scripts/sync-config.sh)"          # exports CF_D1_MASTER_ID, CF_KV_* into this shell
#   cd backend && node scripts/gen-wrangler.mjs --env production --from-d1-remote

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TF_DIR="${TF_DIR:-$PROJECT_ROOT/terraform}"

while [ $# -gt 0 ]; do
  case "$1" in
    --env) shift 2 ;; # accepted for symmetry with push-secrets.sh; the ids do not depend on it
    *) echo "ERROR: unknown argument: $1" >&2; exit 2 ;;
  esac
done

if ! command -v terraform >/dev/null 2>&1; then
  echo "ERROR: terraform is not installed or not on PATH." >&2
  exit 1
fi
if [ ! -d "$TF_DIR/.terraform" ]; then
  echo "ERROR: $TF_DIR is not initialised. Run: cd terraform && terraform init" >&2
  exit 1
fi

out() {
  local v
  v="$(cd "$TF_DIR" && terraform output -raw "$2" 2>/dev/null || true)"
  if [ -z "$v" ]; then
    echo "# $1: terraform output $2 is empty (apply terraform first)" >&2
  else
    echo "export $1=$v"
  fi
}

out CF_D1_MASTER_ID d1_master_database_id
out CF_KV_CACHE_ID kv_cache_id
out CF_KV_SESSIONS_ID kv_sessions_id
out CF_KV_REPORT_CACHE_ID kv_report_cache_id
