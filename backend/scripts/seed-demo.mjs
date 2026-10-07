#!/usr/bin/env node
/**
 * Demo seed wrapper (STORYBOARD 0.2 / A.9):
 *   1. POST /test/reset + API seed        (desktop/e2e/showcase/demo-seed.ts -> .work/seed.json)
 *   2. SQL fixups against the local D1    (A.9: identities, backdating, invoice states, trip timeline, content tables)
 *   3. verification                       (entity counts through the API + banned-string scan)
 *
 *   E2E_API_URL=http://localhost:8807/api/v1 node backend/scripts/seed-demo.mjs [--live-trip] [--no-verify]
 *
 * Env:
 *   E2E_API_URL   API under seed (default http://localhost:8787/api/v1)
 *   D1_FILE       explicit path to the local sqlite file (default: the single .sqlite under backend/.wrangler/state)
 *   DEMO_D0       override "today" (YYYY-MM-DD, IST)
 *
 * Deviation from the storyboard: fixups run through node:sqlite directly on the local D1 file instead of
 * `wrangler d1 execute` - one process, no ~10 s start-up per statement batch, and it can test for table existence.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(here, '..');
const repoRoot = path.resolve(backendDir, '..');
const seedTs = path.join(repoRoot, 'desktop/e2e/showcase/demo-seed.ts');
const workDir = path.join(repoRoot, 'desktop/showcase/.work');
const args = new Set(process.argv.slice(2));
const log = (m) => console.log(`[seed-demo] ${m}`);

// UUIDv7 (project rule: time-ordered ids everywhere)
let lastMs = 0, seq = 0;
function uuid7() {
  let ms = Date.now();
  if (ms === lastMs) seq = (seq + 1) & 0xfff; else { lastMs = ms; seq = Math.floor(Math.random() * 0x400); }
  const b = new Uint8Array(16); crypto.getRandomValues(b);
  b[0] = (ms / 2 ** 40) & 255; b[1] = (ms / 2 ** 32) & 255; b[2] = (ms / 2 ** 24) & 255; b[3] = (ms / 2 ** 16) & 255; b[4] = (ms / 2 ** 8) & 255; b[5] = ms & 255;
  b[6] = 0x70 | (seq >> 8); b[7] = seq & 255; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function runSeed(extra = []) {
  const r = spawnSync(process.execPath, ['--no-warnings', seedTs, ...extra], { stdio: 'inherit', env: process.env });
  return r.status ?? 1;
}

// ── 0. small standalone modes ────────────────────────────────
if (args.has('--live-trip') && args.size === 1) {
  // Retake support: soft-delete earlier "today" airport trips (the driver's Today tab must show exactly one),
  // free Ravi and his car, clear the OTP rate-limit log, then create a fresh one.
  const { DatabaseSync: Db } = await import('node:sqlite');
  const dir = path.join(backendDir, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
  const file = process.env.D1_FILE ?? path.join(dir, fs.readdirSync(dir).find((f) => f.endsWith('.sqlite')));
  const d = new Db(file);
  d.exec('PRAGMA busy_timeout = 15000');
  d.exec("UPDATE trip_assignments SET is_deleted=1 WHERE pickup_location LIKE '%Arrival Gate 2%'");
  d.exec("UPDATE vehicles SET status='available' WHERE registration_number='KA 05 MN 4521'");
  d.exec("UPDATE drivers SET status='active' WHERE phone LIKE '%9876543210'");
  d.exec('DELETE FROM driver_otp_log');
  d.close();
  process.exit(runSeed(['--live-trip']));
}
if (args.has('--pre-roll') || args.has('--between-takes')) {
  // A.9 #10 (before Story Part A) and #11 (between takes): small SQL touch-ups on the already-seeded DB.
  const D0 = await import(pathToFileURL(path.join(repoRoot, 'desktop/e2e/showcase/demo-data.ts')).href);
  const seed0 = JSON.parse(fs.readFileSync(path.join(workDir, 'seed.json'), 'utf8'));
  const { DatabaseSync: Db } = await import('node:sqlite');
  const dir = path.join(backendDir, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
  const file = process.env.D1_FILE ?? path.join(dir, fs.readdirSync(dir).find((f) => f.endsWith('.sqlite')));
  const d = new Db(file);
  d.exec('PRAGMA busy_timeout = 15000');
  const ago = (m) => new Date(Date.now() - m * 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const id = () => uuid7();
  if (args.has('--pre-roll')) {
    const start = new Date(D0.day(D0.TRAVEL_START_OFFSET) + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    d.prepare("INSERT INTO message_log (id,contact_id,channel,content,direction,status,sent_at,delivered_at,created_at) VALUES (?,?,'whatsapp',?,'incoming','delivered',?,?,?)")
      .run(id(), seed0.contacts.C01, D0.PRIYA.whatsapp(start), ago(2), ago(2), ago(2));
    d.prepare("INSERT INTO notifications (id,user_id,title,message,type,reference_type,reference_id,is_read,created_at) VALUES (?,?,?,?,?,?,?,0,?)")
      .run(id(), D0.ADMIN_ID, 'New WhatsApp enquiry', 'Priya Nair: family of 4, Kerala, 5 nights', 'system', 'contact', seed0.contacts.C01, ago(2));
    d.exec('DELETE FROM driver_otp_log');
    console.log('[seed-demo] pre-roll done');
  } else {
    d.exec("UPDATE message_log SET status='delivered', sent_at=COALESCE(sent_at,created_at) WHERE status IN ('queued','failed')");
    d.exec('DELETE FROM driver_otp_log');
    console.log('[seed-demo] between-takes done');
  }
  d.close();
  process.exit(0);
}

// ── 1. API phase ─────────────────────────────────────────────
log('API phase (reset + seed)');
if (runSeed() !== 0) { console.error('[seed-demo] API phase reported rejections - aborting'); process.exit(1); }

// ── 2. SQL fixups ────────────────────────────────────────────
const D = await import(pathToFileURL(path.join(repoRoot, 'desktop/e2e/showcase/demo-data.ts')).href);
const seed = JSON.parse(fs.readFileSync(path.join(workDir, 'seed.json'), 'utf8'));
const { DatabaseSync } = await import('node:sqlite');

function findDb() {
  if (process.env.D1_FILE) return process.env.D1_FILE;
  const dir = path.join(backendDir, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sqlite'));
  if (files.length !== 1) throw new Error(`expected one sqlite file in ${dir}, found ${files.length}; set D1_FILE`);
  return path.join(dir, files[0]);
}
const db = new DatabaseSync(findDb());
db.exec('PRAGMA busy_timeout = 15000');
const hasTable = (t) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
const run = (sql, ...p) => db.prepare(sql).run(...p);
const all = (sql, ...p) => db.prepare(sql).all(...p);
const get = (sql, ...p) => db.prepare(sql).get(...p);
const skipped = [];
function step(name, fn) {
  try { fn(); } catch (e) { skipped.push(`${name}: ${e.message}`); log(`  ! ${name} skipped: ${e.message}`); }
}

const iso = (d) => new Date(d).toISOString().replace(/\.\d{3}Z$/, 'Z');
const nowMs = Date.now();
const minsAgo = (m) => iso(nowMs - m * 60_000);
const bcrypt = createRequire(path.join(backendDir, 'package.json'))('bcryptjs');

log('SQL fixups');

// 1. test-looking identities created by /test/reset
step('A.9#1 identities', () => {
  run("DELETE FROM tenant_users WHERE email IN ('admin@e2e.test','sales@e2e.test','viewer@e2e.test')");
  // Remove the e2e users for real (a deactivated 'Former staff' row would show on the Team page): clear every FK reference first.
  const ids = all("SELECT id FROM users WHERE email LIKE '%@e2e.test'").map((r) => r.id);
  for (const t of all("SELECT name FROM sqlite_master WHERE type='table'").map((r) => r.name)) {
    for (const fk of all(`SELECT * FROM pragma_foreign_key_list('${t}')`)) {
      if (fk.table !== 'users') continue;
      const col = all(`SELECT "notnull" nn FROM pragma_table_info('${t}') WHERE name=?`, fk.from)[0];
      for (const id of ids) {
        if (col?.nn) run(`DELETE FROM "${t}" WHERE "${fk.from}"=?`, id);
        else run(`UPDATE "${t}" SET "${fk.from}"=NULL WHERE "${fk.from}"=?`, id);
      }
    }
  }
  run("DELETE FROM users WHERE email LIKE '%@e2e.test'");
  run("UPDATE tenants SET company_name='Malabar Coast Travels', subdomain='malabarcoast' WHERE id='00000000-0000-0000-0000-000000000000'");
  run(`UPDATE tenants SET company_name='Sahyadri Holidays' WHERE id='${D.TENANT_ID}'`);
});

// 2. the signed-in user must not show admin@demo.com anywhere (sidebar footer, profile, team page)
step('A.9#2 login email', () => {
  run('UPDATE users SET email=? WHERE id=?', D.DEMO_EMAIL, D.ADMIN_ID);
  run('UPDATE tenant_users SET email=? WHERE user_id=?', D.DEMO_EMAIL, D.ADMIN_ID);
});

// 3. staff look real
step('A.9#3 staff', () => {
  const hash = bcrypt.hashSync(crypto.randomUUID(), 8);
  D.STAFF.slice(1).forEach((s, i) => {
    run("UPDATE users SET invite_status='active', is_active=1, last_login_at=?, password_hash=? WHERE email=?", minsAgo(60 * (3 + i * 9)), hash, s.email);
  });
  run("UPDATE users SET last_login_at=? WHERE id=?", minsAgo(5), D.ADMIN_ID);
});

// 4. super admin (password Admin@123 so the walkthrough's Super Admin chapter can sign in)
step('A.9#4 super admin', () => {
  if (!hasTable('super_admins')) throw new Error('no super_admins table');
  run('DELETE FROM super_admins');
  run("INSERT INTO super_admins (id,email,name,password_hash,role,is_active) VALUES (?,?,?,?,?,1)", uuid7(), D.DEMO_EMAIL, 'Ananya Menon', bcrypt.hashSync(D.DEMO_PASSWORD, 10), 'super_admin');
});

// 5. platform tenants
step('A.9#5 platform tenants', () => {
  [['Coastal Escapes Goa', 'coastalescapes', 'pro', 120, 15], ['Himalayan Trails Manali', 'himalayantrails', 'basic', 75, 5], ['Royal Rajputana Tours', 'royalrajputana', 'pro', 48, 15], ['Gulf Gateway Travels Dubai', 'gulfgateway', 'enterprise', 20, 25]]
    .forEach(([name, sub, plan, ageDays, maxUsers]) => {
      run("INSERT OR REPLACE INTO tenants (id,company_name,subdomain,plan,status,max_users,created_at,updated_at) VALUES (?,?,?,?, 'active', ?,?,?)", uuid7(), name, sub, plan, maxUsers, iso(nowMs - ageDays * 86400_000), iso(nowMs - ageDays * 86400_000));
    });
  run("UPDATE tenants SET created_at=?, updated_at=? WHERE id=?", iso(nowMs - 200 * 86400_000), iso(nowMs - 200 * 86400_000), D.TENANT_ID);
});

// 6. backdate history
step('A.9#6 backdate', () => {
  D.CONTACTS.forEach((c, i) => {
    const t = D.at(-c.age, '10:30'); const t2 = iso(new Date(t).getTime() + i * 60_000);
    run('UPDATE contacts SET created_at=?, updated_at=? WHERE id=?', t2, t2, seed.contacts[c.key]);
  });
  D.LEADS.forEach((l, i) => {
    const created = new Date(D.at(-l.age, '11:00')).getTime() + i * 60_000;
    const upd = Math.min(nowMs - 3600_000, new Date(D.at(-Math.max(0, l.age - 6), '15:00')).getTime());
    run('UPDATE leads SET created_at=?, updated_at=? WHERE id=?', iso(created), iso(Math.max(created, upd)), seed.leads[l.key]);
    const acts = all('SELECT id FROM lead_activities WHERE lead_id=? ORDER BY created_at, rowid', seed.leads[l.key]);
    acts.forEach((a, k) => run('UPDATE lead_activities SET created_at=? WHERE id=?', iso(Math.min(nowMs - 1800_000, created + (k + 1) * 4 * 3600_000)), a.id));
  });
  D.INVOICES.forEach((inv, i) => {
    const t = iso(new Date(D.at(-inv.age, '12:00')).getTime() + i * 60_000);
    run('UPDATE invoices SET created_at=?, updated_at=? WHERE id=?', t, t, seed.invoices[inv.key]);
  });
  all('SELECT id, date FROM payments').forEach((p) => run('UPDATE payments SET created_at=? WHERE id=?', `${p.date}T09:30:00Z`, p.id));
});

// 7. invoice states
step('A.9#7 invoice states', () => {
  run("UPDATE invoices SET status='sent', paid_amount=0, balance_due=total WHERE id=?", seed.invoices['I-06']);
  run("UPDATE invoices SET status='overdue', paid_amount=0, balance_due=total WHERE id=?", seed.invoices['I-07']);
});

// 8. trip realism
step('A.9#8 trip timeline', () => {
  const H = 3600_000;
  for (const t of D.TRIPS) {
    const id = seed.trips[t.key]; if (!id) continue;
    const row = get('SELECT pickup_datetime p, drop_datetime d FROM trip_assignments WHERE id=?', id);
    const start = new Date(row.p).getTime(), end = new Date(row.d).getTime();
    const when = t.final === 'cancelled' ? { assigned: start - 4 * 24 * H, cancelled: start - 3 * 24 * H }
      : { assigned: Math.min(nowMs - 6 * H, start - 30 * H), accepted: Math.min(nowMs - 5 * H, start - 26 * H), en_route: start - 0.5 * H, started: start + 0.1 * H, completed: end };
    for (const [status, ms] of Object.entries(when)) run('UPDATE trip_timeline SET created_at=? WHERE trip_id=? AND status=?', iso(ms), id, status);
    run('UPDATE trip_assignments SET created_at=?, updated_at=?, accepted_at=CASE WHEN accepted_at IS NOT NULL THEN ? END, en_route_at=CASE WHEN en_route_at IS NOT NULL THEN ? END, started_at=CASE WHEN started_at IS NOT NULL THEN ? END, completed_at=CASE WHEN completed_at IS NOT NULL THEN ? END, cancelled_at=CASE WHEN cancelled_at IS NOT NULL THEN ? END, contact_id=? WHERE id=?',
      iso(when.assigned), iso(when.completed ?? when.started ?? when.accepted ?? when.cancelled ?? when.assigned),
      iso(when.accepted ?? 0), iso(when.en_route ?? 0), iso(when.started ?? 0), iso(when.completed ?? 0), iso(when.cancelled ?? 0), seed.contacts[t.passenger], id);
  }
});

// trip invoices (hire billing) are dated on the day the trip finished
step('A.9#6 trip invoices', () => {
  for (const t of D.TRIPS) {
    const tid = seed.trips[t.key]; if (!tid) continue;
    const row = get('SELECT invoice_id i, completed_at c, pickup_datetime p FROM trip_assignments WHERE id=?', tid);
    if (!row?.i) continue;
    const when = row.c ?? row.p;
    run('UPDATE invoices SET created_at=?, updated_at=? WHERE id=?', when, when, row.i);
  }
  // issue dates follow created_at (the API stamps them with the seeding day)
  run("UPDATE invoices SET issue_date=substr(created_at,1,10) WHERE issue_date IS NOT NULL");
});

// 9. content tables with no non-AI creation path
step('A.9#9 notifications', () => {
  run('DELETE FROM notifications');
  const taskId = seed.tasks['Send revised Maldives quote to Neha Kapoor'];
  const refId = { 'I-03': seed.invoices['I-03'], 'I-07': seed.invoices['I-07'], L02: seed.leads.L02, L24: seed.leads.L24, x: taskId };
  D.NOTIFICATIONS.forEach((n, i) => {
    run('INSERT INTO notifications (id,user_id,title,message,type,reference_type,reference_id,is_read,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      uuid7(), D.ADMIN_ID, n.title, n.message, n.type, n.ref ? n.ref[0] : null, n.ref ? refId[n.ref[1]] : null, n.read ? 1 : 0, minsAgo(25 + i * 70));
  });
});
step('A.9#9 message_log', () => {
  run('DELETE FROM message_log');
  D.MESSAGE_LOG.forEach((m) => {
    const t = minsAgo(m.ago);
    run('INSERT INTO message_log (id,contact_id,channel,subject,content,direction,status,sent_by,sent_at,delivered_at,read_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      uuid7(), seed.contacts[m.contact], m.channel, m.channel === 'email' ? m.content : null, m.content, m.dir, m.status, m.dir === 'outgoing' ? D.ADMIN_ID : null, t, t, m.status === 'read' ? t : null, t);
  });
});
step('A.9#9 ai_lead_scores', () => {
  const scores = [['L02', 86, 'hot'], ['L03', 81, 'hot'], ['L13', 78, 'hot'], ['L07', 74, 'warm'], ['L12', 72, 'warm'], ['L08', 69, 'warm'], ['L04', 63, 'warm'], ['L05', 48, 'warm'], ['L25', 31, 'cold'], ['L21', 22, 'cold']];
  const signals = [{ name: 'Budget fits destination', value: 0.9, weight: 0.25, contribution: 22 }, { name: 'Replied within 1 hour', value: 1, weight: 0.2, contribution: 20 }, { name: 'Travel date within 60 days', value: 0.8, weight: 0.2, contribution: 16 }];
  run('DELETE FROM ai_lead_scores');
  scores.forEach(([lk, score, cat], i) => run('INSERT INTO ai_lead_scores (id,lead_id,score,category,signals,breakdown,model_used,calculated_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    uuid7(), seed.leads[lk], score, cat, JSON.stringify(signals), JSON.stringify({ engagement: 30, budget: 22, timing: 16, fit: score - 68 > 0 ? score - 68 : 5 }), 'claude-sonnet', minsAgo(90 + i * 11), minsAgo(90 + i * 11)));
});
step('A.9#9 ai_recommendations', () => {
  run('DELETE FROM ai_recommendations');
  [['follow_up', 'lead', 'L02', 'Neha Kapoor viewed the Maldives quote 3 times — call today', 'High intent signal: three quote views in 48 hours.'],
   ['upsell', 'lead', 'L04', 'Offer a 2-night Munnar add-on to the Desai family', 'Past guests of Goa trips convert well on short add-ons.'],
   ['deal_risk', 'lead', 'L12', 'Hold Coorg group rate for Northstar before 15 Oct', 'Rate card validity ends soon; PO expected Friday.'],
   ['collections', 'invoice', 'I-07', 'Send reminders on 1 overdue deposit (₹48,000)', 'Dubai deposit is 6 days overdue.']].forEach(([type, et, ek, title, desc], i) => {
    const eid = et === 'lead' ? seed.leads[ek] : seed.invoices[ek];
    run("INSERT INTO ai_recommendations (id,user_id,recommendation_type,entity_type,entity_id,title,description,impact_score,confidence_score,status,model_used,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'new','claude-sonnet',?,?)",
      uuid7(), D.ADMIN_ID, type, et, eid, title, desc, 80 - i * 7, 0.86 - i * 0.04, minsAgo(40 + i * 15), minsAgo(40 + i * 15));
  });
});
step('A.9#9 ai_document_scans', () => {
  run('DELETE FROM ai_document_scans');
  run("INSERT INTO ai_document_scans (id,user_id,document_type,extracted_data,confidence,entity_type,entity_id,status,model_used,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'pending','claude-sonnet',?,?)",
    uuid7(), D.ADMIN_ID, 'passport', JSON.stringify({ fullName: 'Karan Malhotra', passportNumber: 'Z1234567', nationality: 'Indian', dateOfBirth: '1986-04-12', expiryDate: '2033-08-19' }), 0.93, 'contact', seed.contacts.C13, minsAgo(200), minsAgo(200));
});
step('A.9#9 ai_followup_suggestions', () => {
  run('DELETE FROM ai_followup_suggestions');
  [['L07', 'C23', 'Hi Tanvi, sharing a few Ubud pool-villa photos for your anniversary trip. Shall I hold one for your dates?'], ['L16', 'C33', 'Hi Sophie, the Golden Triangle plan is ready. Would you like a quick call to walk through the Agra day?']].forEach(([lk, ck, msg], i) => {
    run("INSERT INTO ai_followup_suggestions (id,user_id,lead_id,contact_id,suggested_channel,suggested_timing,message_content,escalation_level,confidence_score,status,model_used,created_at) VALUES (?,?,?,?,'whatsapp',?,?,1,0.81,'pending','claude-sonnet',?)",
      uuid7(), D.ADMIN_ID, seed.leads[lk], seed.contacts[ck], D.at(0, i ? '16:00' : '15:00'), msg, minsAgo(120));
  });
});
step('A.9#9 chatbot', () => {
  run('DELETE FROM chatbot_conversations'); run('DELETE FROM chatbot_config');
  run("INSERT INTO chatbot_config (id,channel,enabled,greeting,created_at,updated_at) VALUES (?, 'web', 1, ?, ?, ?)", uuid7(), "Hi! I'm Sahyadri's travel assistant. Where would you like to go?", minsAgo(9000), minsAgo(9000));
  [['Meera', 'active', 'meera.sethi@example.com|+919845100234', ['Hi! I am looking at an Andaman honeymoon in January.', 'Lovely choice! How many nights and what is your budget?', '6 nights, around 1.5 lakh for two.']],
   ['Rahul S', 'handed_off', 'rahul.shetty@example.com|+919810233456', ['What are your Goa packages for New Year week?', 'Prices vary by property. May I connect you with a consultant?', 'Yes please.']],
   ['Visitor 2041', 'closed', '|', ['Do you handle Dubai visas?', 'Yes, our visa desk handles Dubai e-visas in 3 working days.']]].forEach(([name, status, vis, msgs], i) => {
    const [vEmail, vPhone] = vis.split('|');
    const messages = msgs.map((content, k) => ({ role: k % 2 === 0 ? 'user' : 'assistant', content, timestamp: minsAgo(300 - i * 40 - k * 2) }));
    run("INSERT INTO chatbot_conversations (id,channel,visitor_id,visitor_name,visitor_email,visitor_phone,language,messages,status,message_count,bot_message_count,last_message_at,created_at,updated_at) VALUES (?, 'web', ?, ?, ?, ?, 'en', ?, ?, ?, ?, ?, ?, ?)",
      uuid7(), `v-${2041 + i}`, name, vEmail || null, vPhone || null, JSON.stringify(messages), status, messages.length, Math.floor(messages.length / 2), minsAgo(300 - i * 40), minsAgo(310 - i * 40), minsAgo(300 - i * 40));
  });
});
step('A.9#9 call_logs', () => {
  run('DELETE FROM call_logs');
  [['outbound', 'C05', 372, 'completed', 'answered', 3 * 1440 + 90], ['inbound', 'C13', 0, 'no-answer', 'missed', 2 * 1440 + 40], ['outbound', 'C30', 700, 'completed', 'answered', 1440 + 400],
   ['outbound', 'C08', 215, 'completed', 'answered', 1440 + 100], ['inbound', 'C12', 148, 'completed', 'answered', 600], ['outbound', 'C23', 0, 'no-answer', 'no_answer', 300]].forEach(([dir, ck, dur, status, outcome, ago]) => {
    const c = D.CONTACTS.find((x) => x.key === ck);
    run('INSERT INTO call_logs (id,contact_id,direction,from_number,to_number,duration_seconds,status,outcome,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      uuid7(), seed.contacts[ck], dir, dir === 'outbound' ? '+918047182290' : c.phone, dir === 'outbound' ? c.phone : '+918047182290', dur, status, outcome, D.ADMIN_ID, minsAgo(ago), minsAgo(ago));
  });
});
step('A.11 campaigns', () => {
  for (const cp of D.CAMPAIGNS) {
    const id = seed.campaigns?.[cp.name]; if (!id) continue;
    if (cp.final === 'sent') {
      const [sent, opened, clicked, failed] = cp.stats;
      const t = minsAgo(cp.agoDays * 1440);
      run("UPDATE marketing_campaigns SET status='sent', scheduled_at=?, total_recipients=?, sent_count=?, delivered_count=?, failed_count=?, opened_count=?, clicked_count=?, created_at=?, updated_at=? WHERE id=?",
        t, sent + failed, sent, sent - failed, failed, opened, clicked, minsAgo((cp.agoDays + 3) * 1440), t, id);
    } else if (cp.final === 'scheduled') {
      run("UPDATE marketing_campaigns SET status='scheduled' WHERE id=?", id);
    }
  }
});
step('A.12 usage caps', () => {
  run('DELETE FROM tenant_usage_caps');
  run("INSERT INTO tenant_usage_caps (id,tenant_id,cap_key,cap_value,current_usage,reset_period,created_at,updated_at) VALUES (?,?, 'ai_actions_per_day', 500, 37, 'daily', ?, ?)", uuid7(), D.TENANT_ID, minsAgo(1000), minsAgo(5));
});
step('A.12 feature flags', () => {
  if (hasTable('tenant_feature_flags')) run('DELETE FROM tenant_feature_flags');
});
step('A.9#10 otp log', () => { run('DELETE FROM driver_otp_log'); });

db.close();
if (skipped.length) log(`skipped (non-fatal):\n  ${skipped.join('\n  ')}`);

// ── 3. optional live trip + verify ───────────────────────────
if (args.has('--live-trip')) { if (runSeed(['--live-trip']) !== 0) process.exit(1); }
if (!args.has('--no-verify')) {
  log('verify');
  if (runSeed(['--verify']) !== 0) { console.error('[seed-demo] verification FAILED'); process.exit(1); }
}
log('done');
