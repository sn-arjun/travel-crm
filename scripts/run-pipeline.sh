#!/bin/bash
# TravelCRM Milestone Pipeline — Simple bash orchestrator
#
# Usage:
#   bash scripts/run-pipeline.sh                    # All milestones, all phases
#   bash scripts/run-pipeline.sh audit              # Audit only
#   bash scripts/run-pipeline.sh fix                # Fix only
#   bash scripts/run-pipeline.sh validate           # Validate only
#   bash scripts/run-pipeline.sh audit 6            # Audit M6 only
#   bash scripts/run-pipeline.sh audit 6 10         # Audit M6-M10
#   bash scripts/run-pipeline.sh final              # Final report only

set -uo pipefail

# ── Config ────────────────────────────────────────────────────────
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUDIT_DIR="$ROOT/desktop/audit"
CHECKPOINT="$AUDIT_DIR/.checkpoint.txt"
COMMANDS_DIR="$ROOT/.claude/commands"

AUDIT_MODEL="claude-opus-4-6"
FIX_MODEL="claude-sonnet-4-6"
VALIDATE_MODEL="claude-sonnet-4-6"

# All milestones (M5 has no ticket file)
ALL_MILESTONES=(1 2 3 4 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26)

# ── Setup ─────────────────────────────────────────────────────────
mkdir -p "$AUDIT_DIR"

# Unset CLAUDECODE to prevent "nested session" error
unset CLAUDECODE 2>/dev/null || true

# ── Helpers ───────────────────────────────────────────────────────
log() { echo ""; echo "$(date '+%H:%M:%S') [$1] $2"; }

mark_done() {
  echo "$1|$2|ok|$(date -Iseconds)" >> "$CHECKPOINT"
}

mark_fail() {
  echo "$1|$2|FAILED|$(date -Iseconds)|$3" >> "$CHECKPOINT"
}

is_done() {
  grep -q "^$1|$2|ok|" "$CHECKPOINT" 2>/dev/null
}

show_status() {
  echo ""
  echo "  PIPELINE STATUS"
  echo "  ════════════════════════════════════════════════"
  printf "  %-6s %-12s %-12s %-12s\n" "M" "Audit" "Fix" "Validate"
  echo "  ────────────────────────────────────────────────"
  for m in "${ALL_MILESTONES[@]}"; do
    a="---"; f="---"; v="---"
    is_done "$m" "audit" && a="ok"
    is_done "$m" "fix" && f="ok"
    is_done "$m" "validate" && v="ok"
    grep -q "^$m|audit|FAILED|" "$CHECKPOINT" 2>/dev/null && a="FAILED"
    grep -q "^$m|fix|FAILED|" "$CHECKPOINT" 2>/dev/null && f="FAILED"
    grep -q "^$m|validate|FAILED|" "$CHECKPOINT" 2>/dev/null && v="FAILED"
    printf "  M%-5s %-12s %-12s %-12s\n" "$m" "$a" "$f" "$v"
  done
  echo ""
}

# Load a command file and replace $ARGUMENTS with the given value
load_command() {
  local cmd_file="$1"
  local args="$2"
  sed "s/\\\$ARGUMENTS/$args/g" "$cmd_file"
}

run_phase() {
  local milestone=$1
  local phase=$2
  local cmd_file=$3
  local cmd_args=$4
  local model=$5

  # Skip if already done
  if is_done "$milestone" "$phase"; then
    log "$phase" "M${milestone} — already done, skipping"
    return 0
  fi

  log "$phase" "M${milestone} — starting (model: $model)"
  echo "════════════════════════════════════════════════════════════"

  # Load command file content with arguments substituted
  local prompt
  prompt="$(load_command "$cmd_file" "$cmd_args")"

  if claude -p "$prompt" \
    --model "$model" \
    --dangerously-skip-permissions; then

    # For audit: verify the file was actually created
    if [ "$phase" = "audit" ] && [ ! -f "$AUDIT_DIR/M${milestone}-audit.md" ]; then
      log "$phase" "M${milestone} — FAILED: audit file not created"
      mark_fail "$milestone" "$phase" "audit file not written"
      return 1
    fi

    log "$phase" "M${milestone} — DONE"
    mark_done "$milestone" "$phase"
    return 0
  else
    log "$phase" "M${milestone} — FAILED (exit code $?)"
    mark_fail "$milestone" "$phase" "exit code $?"
    return 1
  fi
}

# ── Parse Args ────────────────────────────────────────────────────
PHASE="${1:-all}"      # audit | fix | validate | final | status | reset | all
START="${2:-0}"        # Start milestone (0 = all)
END="${3:-$START}"     # End milestone (default = same as start)

cd "$ROOT"

case "$PHASE" in
  status)
    show_status
    exit 0
    ;;
  reset)
    rm -f "$CHECKPOINT"
    echo "  Checkpoint reset."
    exit 0
    ;;
  final)
    log "final" "Generating final consolidated report..."
    local_prompt="$(load_command "$COMMANDS_DIR/final-report.md" "")"
    claude -p "$local_prompt" --model "$AUDIT_MODEL" --dangerously-skip-permissions || true
    exit 0
    ;;
esac

# Build milestone list
if [ "$START" -gt 0 ]; then
  MILESTONES=()
  for m in "${ALL_MILESTONES[@]}"; do
    if [ "$m" -ge "$START" ] && [ "$m" -le "$END" ]; then
      MILESTONES+=("$m")
    fi
  done
else
  MILESTONES=("${ALL_MILESTONES[@]}")
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  TravelCRM Milestone Pipeline                               ║"
echo "║  Phase:      $PHASE                                         "
echo "║  Milestones: M${MILESTONES[0]} — M${MILESTONES[-1]} (${#MILESTONES[@]} total)  "
echo "║  Started:    $(date -Iseconds)                              "
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ── Run ───────────────────────────────────────────────────────────
for m in "${MILESTONES[@]}"; do
  # Check ticket file exists
  if [ ! -f "$ROOT/product-requirment/jira-tickets-m${m}.md" ]; then
    log "skip" "M${m} — no ticket file"
    continue
  fi

  # Phase 1: Audit
  if [ "$PHASE" = "all" ] || [ "$PHASE" = "audit" ]; then
    run_phase "$m" "audit" "$COMMANDS_DIR/audit-milestone.md" "M${m}" "$AUDIT_MODEL" || true
  fi

  # Phase 2: Fix (only if audit file exists)
  if [ "$PHASE" = "all" ] || [ "$PHASE" = "fix" ]; then
    if [ -f "$AUDIT_DIR/M${m}-audit.md" ]; then
      run_phase "$m" "fix" "$COMMANDS_DIR/fix-milestone.md" "M${m}" "$FIX_MODEL" || true
    else
      log "fix" "M${m} — skipping, no audit file"
    fi
  fi

  # Phase 3: Validate (only if audit file exists)
  if [ "$PHASE" = "all" ] || [ "$PHASE" = "validate" ]; then
    if [ -f "$AUDIT_DIR/M${m}-audit.md" ]; then
      run_phase "$m" "validate" "$COMMANDS_DIR/validate-milestone.md" "M${m}" "$VALIDATE_MODEL" || true
    else
      log "validate" "M${m} — skipping, no audit file"
    fi
  fi
done

# ── Final Report ──────────────────────────────────────────────────
if [ "$PHASE" = "all" ] && [ "${#MILESTONES[@]}" -gt 3 ]; then
  log "final" "Generating final report..."
  local_prompt="$(load_command "$COMMANDS_DIR/final-report.md" "")"
  claude -p "$local_prompt" --model "$AUDIT_MODEL" --dangerously-skip-permissions || true
fi

# ── Summary ───────────────────────────────────────────────────────
show_status

echo "COMMANDS:"
echo "  Status:    bash scripts/run-pipeline.sh status"
echo "  Resume:    bash scripts/run-pipeline.sh          (auto-skips completed)"
echo "  Retry:     bash scripts/run-pipeline.sh audit 6  (retry M6 audit)"
echo "  Reset:     bash scripts/run-pipeline.sh reset"
echo "  Final:     bash scripts/run-pipeline.sh final"
echo ""
