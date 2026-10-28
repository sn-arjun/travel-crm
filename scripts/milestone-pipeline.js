#!/usr/bin/env node
/**
 * TravelCRM Milestone Pipeline — Sequential Agent Orchestrator
 *
 * Runs 3 phases per milestone (audit → fix → validate) using fresh
 * `claude -p` invocations so each phase gets its own context window.
 *
 * RESILIENCE:
 * - Checkpoint file tracks progress (desktop/audit/.checkpoint.json)
 * - Auto-resume from last successful step on restart
 * - Large milestones (>2000 lines) split into ticket chunks
 * - Failed phases logged and skipped (continue to next)
 * - `--retry M8 fix` to retry a specific failed phase
 *
 * Usage:
 *   node scripts/milestone-pipeline.js                     # All milestones
 *   node scripts/milestone-pipeline.js 6                   # Single milestone
 *   node scripts/milestone-pipeline.js 6 10                # Range M6-M10
 *   node scripts/milestone-pipeline.js --phase audit       # Only audit phase
 *   node scripts/milestone-pipeline.js --phase fix         # Only fix phase
 *   node scripts/milestone-pipeline.js --phase validate    # Only validate phase
 *   node scripts/milestone-pipeline.js --resume            # Resume from checkpoint
 *   node scripts/milestone-pipeline.js --retry 8 fix       # Retry M8 fix phase
 *   node scripts/milestone-pipeline.js --status            # Show checkpoint status
 *   node scripts/milestone-pipeline.js --final-report      # Generate final report
 */

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ─── Configuration ───────────────────────────────────────────────
const ROOT = path.resolve(__dirname, '..');
const TICKET_DIR = path.join(ROOT, 'product-requirment');
const AUDIT_DIR = path.join(ROOT, 'desktop', 'audit');
const CHECKPOINT_FILE = path.join(AUDIT_DIR, '.checkpoint.json');

const AUDIT_MODEL = 'claude-opus-4-6';
const FIX_MODEL = 'claude-sonnet-4-6';
const VALIDATE_MODEL = 'claude-sonnet-4-6';

// 30 min audit, 1 hr fix, 1 hr validate (may run full e2e suite), 30 min final report
const TIMEOUT = {
  audit: 1800000,     // 30 minutes
  fix: 3600000,       // 1 hour
  validate: 3600000,  // 1 hour
  'final-report': 1800000, // 30 minutes
};

// Milestones >2000 lines get split into chunks for the fix phase
const LARGE_MILESTONE_THRESHOLD = 2000;

const ALL_MILESTONES = [1,2,3,4,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26];

// ─── Checkpoint System ───────────────────────────────────────────

function loadCheckpoint() {
  try {
    return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
  } catch {
    return { started: new Date().toISOString(), milestones: {} };
  }
}

function saveCheckpoint(cp) {
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(cp, null, 2));
}

function markPhase(cp, milestone, phase, status, error = null) {
  const key = String(milestone); // Always use string keys for JSON round-trip safety
  if (!cp.milestones[key]) cp.milestones[key] = {};
  cp.milestones[key][phase] = {
    status, // 'ok' | 'failed' | 'skipped' | 'timeout' | 'context-limit'
    timestamp: new Date().toISOString(),
    error: error ? String(error).slice(0, 200) : null,
  };
  cp.lastCompleted = { milestone, phase, timestamp: new Date().toISOString() };
  saveCheckpoint(cp);
}

function isPhaseComplete(cp, milestone, phase) {
  return cp.milestones[String(milestone)]?.[phase]?.status === 'ok';
}

function showStatus(cp) {
  console.log('\n  PIPELINE CHECKPOINT STATUS\n');
  console.log(`  Started: ${cp.started}`);
  console.log(`  Last:    ${cp.lastCompleted?.milestone ? `M${cp.lastCompleted.milestone} ${cp.lastCompleted.phase}` : 'none'}\n`);

  console.log('  Milestone  Audit      Fix        Validate');
  console.log('  ' + '─'.repeat(50));

  for (const m of ALL_MILESTONES) {
    const data = cp.milestones[m] || {};
    const audit = (data.audit?.status || '---').padEnd(10);
    const fix = (data.fix?.status || '---').padEnd(10);
    const validate = (data.validate?.status || '---').padEnd(10);
    console.log(`  M${String(m).padEnd(9)} ${audit} ${fix} ${validate}`);
  }

  // Show failures
  const failures = [];
  for (const [m, phases] of Object.entries(cp.milestones)) {
    for (const [phase, info] of Object.entries(phases)) {
      if (info.status === 'failed' || info.status === 'timeout' || info.status === 'context-limit') {
        failures.push({ milestone: m, phase, status: info.status, error: info.error });
      }
    }
  }

  if (failures.length > 0) {
    console.log('\n  FAILURES:');
    for (const f of failures) {
      console.log(`  M${f.milestone} ${f.phase}: ${f.status}${f.error ? ' — ' + f.error : ''}`);
      console.log(`    Retry: node scripts/milestone-pipeline.js --retry ${f.milestone} ${f.phase}`);
    }
  }

  console.log('');
}

// ─── UX Contract ─────────────────────────────────────────────────
const UX_CONTRACT = `
## UX CONTRACT — MANDATORY FOR ALL PAGES

### List Pages MUST have:
1. FilterBar component (search input + status/type dropdown filters + tag filter)
2. useInfiniteScroll hook for pagination (NOT load-all or manual page buttons)
3. DataTable with hover action icons per row: view (Eye), edit (Pencil), call (Phone), email (Mail), delete (Trash2)
4. Click row → slide-over detail drawer with FULL action buttons (Edit, Call, WhatsApp, Email, Delete, Create Lead)
5. Empty state with icon + message + "Create first X" CTA button
6. Skeleton loading during initial fetch
7. Total count badge in page header (e.g., "Contacts (247)")
8. Bulk select with bulk actions (delete, export, tag)

### Form Pages MUST have:
1. Searchable Combobox/Select for ALL relation fields (contact, lead, supplier, etc.) — NEVER a raw text Input where user types an ID
2. Auto-populate fields from navigation context: if coming from Contact page → contactId, name, email, phone pre-filled via URL search params or Zustand store
3. PhoneInput component for all phone/mobile fields (with country code picker)
4. AddressAutocomplete component for address fields (with Google Places, fallback to manual input if NEXT_PUBLIC_GOOGLE_MAPS_API_KEY not set)
5. CurrencyInput for all money/amount fields
6. DatePicker for all date fields (never raw text input)
7. Inline validation with error messages below each field
8. Required field indicators (red asterisk)
9. Form sections with clear headings (Personal Info, Contact Details, Address, etc.)
10. Save + Cancel buttons in page header (sticky)

### Detail Pages MUST have:
1. PageHeader with: entity name as title, status Badge, actions dropdown (Edit, Delete, Convert, etc.)
2. Tabbed layout: Overview | Activity | Related | Documents
3. Communication actions via SendMessageDialog — NEVER mailto:, wa.me, or tel: links
4. Activity timeline showing recent interactions
5. Related entities section (e.g., Contact → their Leads, Invoices, Itineraries)

### Universal Rules:
- ALL communication through Communication Hub API using SendMessageDialog
- Phone fields use PhoneInput, Address use AddressAutocomplete (with env fallback), Money use CurrencyInput
- Consistent design tokens: Primary #6366F1, Success #10B981, Warning #F59E0B, Error #EF4444
- Loading: Skeleton components. Errors: Toast via sonner + inline for forms
- Every .env feature MUST gracefully degrade when env var missing
`;

const ENV_TRACKING = `
## ENV Variable Tracking
Track EVERY environment variable needed:
- Variable name, where used, what happens if missing, required or optional
Output an ENV section in the audit file.
`;

// ─── Ticket Splitting for Large Milestones ───────────────────────

function getTicketLineCount(milestone) {
  const ticketFile = path.join(TICKET_DIR, `jira-tickets-m${milestone}.md`);
  try {
    const content = fs.readFileSync(ticketFile, 'utf8');
    return content.split('\n').length;
  } catch {
    return 0;
  }
}

function splitTicketFile(milestone) {
  const ticketFile = path.join(TICKET_DIR, `jira-tickets-m${milestone}.md`);
  const content = fs.readFileSync(ticketFile, 'utf8');
  const lines = content.split('\n');

  // Split by ticket boundaries (## TICKET- or ## T- or ### TICKET-)
  const chunks = [];
  let currentChunk = [];
  let header = [];
  let headerDone = false;

  for (const line of lines) {
    if (!headerDone && !line.match(/^#{1,3}\s*(TICKET|T)-/i)) {
      header.push(line);
      currentChunk.push(line);
      continue;
    }
    if (!headerDone) headerDone = true;

    if (line.match(/^#{1,3}\s*(TICKET|T)-/i) && currentChunk.length > 200) {
      chunks.push(currentChunk.join('\n'));
      currentChunk = [...header, '', line];
    } else {
      currentChunk.push(line);
    }
  }
  if (currentChunk.length > 0) chunks.push(currentChunk.join('\n'));

  return chunks.length > 1 ? chunks : [content];
}

// ─── Prompts (kept for chunked fix fallback only) ────────────────

function auditPrompt(milestone) {
  const ticketFile = `product-requirment/jira-tickets-m${milestone}.md`;
  return `# Phase 1: AUDIT Milestone ${milestone} (READ-ONLY)

You are auditing TravelCRM Pro desktop app against ticket specifications.
DO NOT modify any source code files. Only read, analyze, and write the audit report.

## CRITICAL: You MUST use the Write tool to create the file desktop/audit/M${milestone}-audit.md
Do NOT just print the report — you MUST write it to disk using the Write tool.
The file MUST exist at desktop/audit/M${milestone}-audit.md when you are done.

## Project Structure
- Backend routes: backend/src/routes/*.ts
- Database schema: backend/src/db/tenant-schema.ts
- Desktop pages: desktop/src/app/(app)/**/*.tsx
- API clients: desktop/src/lib/api/*.ts
- Components: desktop/src/components/**/*.tsx
- Hooks: desktop/src/hooks/*.ts (useInfiniteScroll, etc.)
- Stores: desktop/src/stores/*.ts

## Instructions

1. Read the ticket file: ${ticketFile} — read it FULLY, do not skip any tickets
2. For EACH ticket, use Grep/Glob/Read to check:
   - Backend route exists? (backend/src/routes/)
   - Schema has required fields? (backend/src/db/tenant-schema.ts)
   - Desktop page exists? (desktop/src/app/(app)/)
   - API client has methods? (desktop/src/lib/api/)
   - Components used correctly? (desktop/src/components/)

3. Check for UX anti-patterns on EVERY related page (read the actual page source code):
   - Raw ID text inputs (ALWAYS a bug — need searchable Combobox)
   - Direct mailto:/wa.me/tel: links instead of SendMessageDialog
   - No useInfiniteScroll (from desktop/src/hooks/use-infinite-scroll.ts)
   - No FilterBar (from desktop/src/components/domain/filter-bar.tsx)
   - No hover action icons on table rows
   - No detail drawer on list pages
   - Placeholder toast-only functions without real API calls
   - No loading skeletons / no empty states
   - Missing form validation / no auto-populate from navigation context
   - Inconsistent design tokens

4. Check env variable usage — any env-dependent feature must have a graceful fallback

5. Classify each ticket: DONE | PARTIAL | MISSING | BUG

6. Generate UX improvement suggestions

${ENV_TRACKING}

## Output — MUST write using Write tool

Use the Write tool to create file: desktop/audit/M${milestone}-audit.md

Content format:

# Milestone ${milestone} Audit Report
Generated: [date]
Ticket File: ${ticketFile}

## Summary
| Status | Count |
|--------|-------|
| DONE | X |
| PARTIAL | X |
| MISSING | X |
| BUG | X |

## Environment Variables Required
| Variable | Used In | Required | Fallback Behavior |
|----------|---------|----------|-------------------|

## UX Anti-Patterns Found
- [ ] page: issue → fix needed

## UX Improvement Suggestions
| Page | Current | Suggested | Priority |
|------|---------|-----------|----------|

## Ticket Details

### TICKET-XXX: Title — STATUS
**Backend:** status — details
**Frontend:** status — details
**API Client:** status — details
**UX Issues:** list with file paths
**Fix Required:**
1. specific file:line — change needed
---

(repeat for EVERY ticket)

Be EXHAUSTIVE. Check every ticket. Be specific about file paths and line numbers.
REMINDER: You MUST use the Write tool to save the report to desktop/audit/M${milestone}-audit.md
`;
}

function fixPrompt(milestone, chunkIndex = null, totalChunks = null) {
  const chunkNote = chunkIndex !== null
    ? `\n\nNOTE: This is chunk ${chunkIndex + 1}/${totalChunks} of a large milestone. Fix only the tickets listed in this chunk's section of the audit file. The audit file has all tickets — focus on the ones relevant to this chunk.`
    : '';

  return `# Phase 2: FIX Milestone ${milestone}${chunkIndex !== null ? ` (Part ${chunkIndex + 1}/${totalChunks})` : ''}

## CRITICAL: Use Read tool to read desktop/audit/M${milestone}-audit.md FIRST, then use Edit/Write tools to fix code.
${chunkNote}

Fix ALL items marked PARTIAL, MISSING, or BUG. Follow these rules strictly:

${UX_CONTRACT}

## Implementation Order
1. Backend routes & schema first (if missing)
2. API client methods (desktop/src/lib/api/)
3. Desktop pages — fix UX anti-patterns
4. Ensure env variable fallbacks work

## Key Rules
- Use existing components: FilterBar, useInfiniteScroll, PhoneInput, AddressAutocomplete, SendMessageDialog, CurrencyInput, DatePicker, EmptyState
- Relation fields: searchable Combobox calling list API — NEVER raw Input
- Cross-entity navigation: pass data via URL search params
- AddressAutocomplete: check env key, fallback to plain Input if missing
- Every env-dependent feature: graceful degradation
- Follow design system: Primary #6366F1, consistent spacing
- Do NOT create new components if existing one works
- Do NOT add features not in the ticket

## After Fixing
- Run: cd desktop && npx next build (verify no build errors)
- List all changes in a summary
`;
}

function fixChunkPrompt(milestone, chunkIndex, totalChunks, ticketContent) {
  return `# Phase 2: FIX Milestone ${milestone} — Chunk ${chunkIndex + 1}/${totalChunks}

## Context
Read the full audit at desktop/audit/M${milestone}-audit.md for status of ALL tickets.
But ONLY fix the tickets in THIS chunk (below). Previous chunks have already been fixed.

## Tickets in This Chunk:
${ticketContent}

## Rules
${UX_CONTRACT}

Fix ONLY the tickets above that are PARTIAL/MISSING/BUG in the audit.
Use existing components. Run build check at end.
`;
}

function validatePrompt(milestone) {
  return `# Phase 3: VALIDATE Milestone ${milestone}

## CRITICAL: Use Read tool to read desktop/audit/M${milestone}-audit.md FIRST, then use Write/Edit tools to create test files.

## Write REAL E2E tests that validate actual functionality.

### Every test MUST:
1. Create entity via form (fill ALL fields)
2. Verify ALL filled values visible in list
3. Verify ALL values in detail view
4. Verify ALL values prefilled in edit form
5. Edit → verify changes persisted
6. Delete → verify removed
7. Test search/filter works
8. Test relation fields are Combobox (not raw ID input)
9. Test communication uses SendMessageDialog (not mailto:)
10. Test export downloads file with all data
11. Test import creates correct records

### FAKE E2E (NEVER do this):
- page.goto() + expect title — proves nothing
- Only check page loads without form interaction
- Hardcode IDs in URLs

### Test Infrastructure
- Auth: desktop/e2e/helpers/auth.ts (loginViaUI, waitForLoad, navigateTo, getAuthToken)
- Seed: desktop/e2e/helpers/api-seed.ts (seedContact, seedLead, seedInvoice, etc.)
- Config: desktop/playwright.config.ts
- Naming: desktop/e2e/XX-feature-name.spec.ts
- Login creds: admin@demo.com / Admin@123 (already in auth.ts)
- API URL: http://localhost:8787/api/v1
- Tenant ID: 01960000-0000-7000-8000-000000000001
- navigateTo() takes a href path like "/contacts", NOT a display name

### Run & fix:
cd desktop && npx playwright test --reporter=list
Fix failures: ticket is source of truth. Fix CODE not tests (unless test is wrong).
`;
}

function finalReportPrompt() {
  return `# Final Consolidated Report

Read ALL audit files in desktop/audit/ (M*-audit.md).

Produce these deliverables:

## 1. desktop/audit/FINAL-REPORT.md
- Executive summary with completion %
- Milestone status matrix
- All env vars consolidated
- All UX anti-patterns (deduplicated)
- All UX improvements (ranked P0/P1/P2)
- Missing features list
- Architecture recommendations
- E2E coverage summary

## 2. desktop/.env.example
All env vars with descriptions and fallback notes.

## 3. desktop/audit/IMPROVEMENTS.md
Ranked improvements: P0 (broken) → P1 (poor UX) → P2 (polish)

## 4. desktop/audit/IMPLEMENTATION-PLAN.md
Phased plan: P0 fixes → P1 fixes → P2 polish → E2E coverage
`;
}

// ─── Runner ──────────────────────────────────────────────────────

function runClaude(slashCommand, model, label, phase = 'audit') {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`  Command: ${slashCommand}`);
  console.log(`  Model: ${model} | Timeout: ${Math.round(TIMEOUT[phase] / 60000)}min`);
  console.log(`  Time: ${new Date().toISOString()}`);
  console.log(`${'='.repeat(60)}\n`);

  const startTime = Date.now();

  // Strip CLAUDECODE env var to prevent "nested session" error
  const cleanEnv = { ...process.env };
  delete cleanEnv.CLAUDECODE;

  const result = spawnSync('claude', [
    '-p', slashCommand,
    '--model', model,
    '--dangerously-skip-permissions',
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: TIMEOUT[phase] || 900000,
    env: cleanEnv,
    shell: process.platform === 'win32', // Windows needs shell for .cmd shims
  });

  const elapsed = Math.round((Date.now() - startTime) / 1000);

  if (result.error) {
    if (result.error.message.includes('TIMEOUT') || result.error.code === 'ETIMEDOUT') {
      console.error(`  TIMEOUT after ${elapsed}s`);
      return { ok: false, reason: 'timeout', error: result.error.message };
    }
    console.error(`  ERROR: ${result.error.message}`);
    return { ok: false, reason: 'error', error: result.error.message };
  }

  if (result.status !== 0) {
    const stderr = (result.stderr || '').slice(0, 500);
    // Detect context limit from stderr
    if (stderr.includes('context') || stderr.includes('token') || stderr.includes('limit')) {
      console.error(`  CONTEXT LIMIT HIT after ${elapsed}s`);
      return { ok: false, reason: 'context-limit', error: stderr };
    }
    console.error(`  EXIT CODE: ${result.status} after ${elapsed}s`);
    if (stderr) console.error(`  STDERR: ${stderr}`);
    return { ok: false, reason: 'failed', error: stderr };
  }

  if (result.stdout) {
    const lines = result.stdout.trim().split('\n');
    const summary = lines.slice(-15).join('\n');
    console.log(`  ...last 15 lines:\n${summary}`);
  }

  console.log(`\n  COMPLETED: ${label} (${elapsed}s)\n`);
  return { ok: true };
}

// ─── Process Single Milestone ────────────────────────────────────

function processMilestone(m, phases, cp) {
  const ticketFile = path.join(TICKET_DIR, `jira-tickets-m${m}.md`);
  if (!fs.existsSync(ticketFile)) {
    console.log(`  SKIP: M${m} — no ticket file`);
    markPhase(cp, m, 'audit', 'skipped', 'no ticket file');
    return;
  }

  const auditFile = path.join(AUDIT_DIR, `M${m}-audit.md`);

  // ── Phase 1: Audit ──
  if (phases.includes('audit') && !isPhaseComplete(cp, m, 'audit')) {
    const res = runClaude(`/audit-milestone M${m}`, AUDIT_MODEL, `AUDIT M${m}`, 'audit');
    if (res.ok) {
      // Verify the audit file was actually created
      if (!fs.existsSync(auditFile)) {
        console.log(`  WARNING: Audit returned ok but M${m}-audit.md was NOT created.`);
        console.log(`  The agent likely printed output instead of writing the file.`);
        console.log(`  Marking as failed. Retry with: --retry ${m} audit`);
        markPhase(cp, m, 'audit', 'failed', 'audit file not created — agent did not use Write tool');
        return;
      }
      markPhase(cp, m, 'audit', 'ok');
    } else {
      markPhase(cp, m, 'audit', res.reason, res.error);
      console.log(`  Audit failed for M${m} (${res.reason}). Continuing to next milestone.`);
      return;
    }
  }

  // ── Phase 2: Fix ──
  if (phases.includes('fix') && !isPhaseComplete(cp, m, 'fix')) {
    if (!fs.existsSync(auditFile)) {
      console.log(`  SKIP FIX M${m} — no audit file`);
      markPhase(cp, m, 'fix', 'skipped', 'no audit file');
    } else {
      const lineCount = getTicketLineCount(m);

      if (lineCount > LARGE_MILESTONE_THRESHOLD) {
        // Split into chunks for large milestones — write chunk to temp file,
        // use fix-milestone command but tell it to focus on chunk
        console.log(`  M${m} is large (${lineCount} lines) — splitting into chunks`);
        const chunks = splitTicketFile(m);
        let allOk = true;

        for (let i = 0; i < chunks.length; i++) {
          // Write chunk tickets to temp file so the agent can reference them
          const chunkFile = path.join(AUDIT_DIR, `.chunk-m${m}-${i + 1}.md`);
          fs.writeFileSync(chunkFile, chunks[i], 'utf8');
          const chunkLabel = `FIX M${m} [${i + 1}/${chunks.length}]`;
          const chunkCmd = `/fix-milestone M${m} — ONLY fix tickets from chunk file desktop/audit/.chunk-m${m}-${i + 1}.md (chunk ${i + 1}/${chunks.length}). Read that file to see which tickets are in this chunk. Previous chunks already fixed.`;
          const res = runClaude(chunkCmd, FIX_MODEL, chunkLabel, 'fix');
          try { fs.unlinkSync(chunkFile); } catch {}
          if (!res.ok) {
            console.log(`  Chunk ${i + 1} failed (${res.reason}). Saving partial progress.`);
            allOk = false;
          }
        }

        markPhase(cp, m, 'fix', allOk ? 'ok' : 'partial', allOk ? null : 'some chunks failed');
      } else {
        const res = runClaude(`/fix-milestone M${m}`, FIX_MODEL, `FIX M${m}`, 'fix');
        markPhase(cp, m, 'fix', res.ok ? 'ok' : res.reason, res.error);
      }
    }
  }

  // ── Phase 3: Validate ──
  if (phases.includes('validate') && !isPhaseComplete(cp, m, 'validate')) {
    if (!fs.existsSync(auditFile)) {
      console.log(`  SKIP VALIDATE M${m} — no audit file`);
      markPhase(cp, m, 'validate', 'skipped', 'no audit file');
    } else {
      const res = runClaude(`/validate-milestone M${m}`, VALIDATE_MODEL, `VALIDATE M${m}`, 'validate');
      markPhase(cp, m, 'validate', res.ok ? 'ok' : res.reason, res.error);
    }
  }
}

// ─── CLI ─────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  let milestones = [...ALL_MILESTONES];
  let phases = ['audit', 'fix', 'validate'];

  fs.mkdirSync(AUDIT_DIR, { recursive: true });
  let cp = loadCheckpoint();

  // Parse args
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--phase') {
      phases = [args[++i]];
    } else if (args[i] === '--resume') {
      // Resume skips already-completed phases via isPhaseComplete() guards.
      // Additionally, jump to the first milestone that has incomplete work.
      const firstIncomplete = ALL_MILESTONES.find(m => {
        const data = cp.milestones[String(m)];
        if (!data) return true;
        return !data.audit?.status || data.audit.status !== 'ok'
          || !data.fix?.status || data.fix.status !== 'ok'
          || !data.validate?.status || data.validate.status !== 'ok';
      });
      if (firstIncomplete) {
        milestones = ALL_MILESTONES.filter(m => m >= firstIncomplete);
        console.log(`  Resuming from M${firstIncomplete} (${milestones.length} milestones remaining)...`);
      } else {
        console.log('  All milestones complete. Nothing to resume.');
        showStatus(cp);
        return;
      }
    } else if (args[i] === '--retry') {
      // Retry specific milestone+phase
      const m = parseInt(args[++i], 10);
      const phase = args[++i];
      if (isNaN(m) || !phase || !['audit', 'fix', 'validate'].includes(phase)) {
        console.error('Usage: --retry <milestone> <phase>');
        console.error('  phase must be: audit, fix, or validate');
        process.exit(1);
      }
      if (!ALL_MILESTONES.includes(m)) {
        console.error(`M${m} is not a valid milestone. Valid: ${ALL_MILESTONES.join(', ')}`);
        process.exit(1);
      }
      // Clear the failed status so it re-runs
      const key = String(m);
      if (cp.milestones[key]?.[phase]) {
        delete cp.milestones[key][phase];
        saveCheckpoint(cp);
      }
      milestones = [m];
      phases = [phase];
    } else if (args[i] === '--status') {
      showStatus(cp);
      return;
    } else if (args[i] === '--reset') {
      cp = { started: new Date().toISOString(), milestones: {} };
      saveCheckpoint(cp);
      console.log('  Checkpoint reset.');
      return;
    } else if (args[i] === '--final-report') {
      runClaude('/final-report', AUDIT_MODEL, 'FINAL REPORT', 'final-report');
      return;
    } else if (!isNaN(parseInt(args[i], 10))) {
      const start = parseInt(args[i], 10);
      const end = args[i + 1] && !isNaN(parseInt(args[i + 1], 10))
        ? parseInt(args[++i], 10)
        : start;
      milestones = ALL_MILESTONES.filter(m => m >= start && m <= end);
    }
  }

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║         TravelCRM Milestone Pipeline                         ║
║  Milestones: ${milestones.map(m => 'M' + m).join(', ').slice(0, 44).padEnd(45)}║
║  Phases:     ${phases.join(', ').padEnd(45)}║
║  Started:    ${new Date().toISOString().padEnd(45)}║
║  Checkpoint: desktop/audit/.checkpoint.json                  ║
╚══════════════════════════════════════════════════════════════╝
  `);

  for (const m of milestones) {
    processMilestone(m, phases, cp);
  }

  // Auto final report only when all 3 phases were requested on multiple milestones
  if (phases.length === 3 && phases.includes('validate') && milestones.length > 3) {
    console.log('\nGenerating final consolidated report...');
    runClaude('/final-report', AUDIT_MODEL, 'FINAL REPORT', 'final-report');
  }

  // Show final status
  showStatus(loadCheckpoint());

  console.log('COMMANDS:');
  console.log('  Status:      node scripts/milestone-pipeline.js --status');
  console.log('  Resume:      node scripts/milestone-pipeline.js --resume');
  console.log('  Retry:       node scripts/milestone-pipeline.js --retry <M> <phase>');
  console.log('  Reset:       node scripts/milestone-pipeline.js --reset');
  console.log('  Final:       node scripts/milestone-pipeline.js --final-report');
}

main();
