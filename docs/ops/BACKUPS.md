# Backups and restores

Every agency has its own D1 database, plus one master database (agency registry, subscriptions, super admin).
Two layers protect them.

## 1. Primary restore path: D1 Time Travel

D1 keeps a point-in-time history of every database (30 days on Workers Paid). It needs no scheduling and
restores one database in place, so it is the right tool for "an agency deleted data an hour ago".

```
cd backend
npx wrangler d1 time-travel info <database name> -c .wrangler.production.toml --env production
npx wrangler d1 time-travel restore <database name> --timestamp=<unix seconds or RFC3339> -c .wrangler.production.toml --env production
```

`-c .wrangler.production.toml` is required: wrangler finds the database by looking its name up in that generated config
(`node scripts/gen-wrangler.mjs --env production --from-d1-remote` writes it). Without it wrangler reads the placeholder
`wrangler.toml` and does not know the database.

**Database names differ between the dashboard and the generated config.** The provisioner creates each agency database
as `travelcrm-t-<agency slug>` (what the Cloudflare dashboard shows), while the generated config names it
`travelcrm-tenant-<binding>` (for example `travelcrm-tenant-3f2a9c...`, from the registry's `db_binding`). Wrangler commands that use
`-c` take the name from the generated config; the dashboard name will not match. The master database is `travelcrm-master` in
both. Look the agency's binding up in the registry, or open `.wrangler.production.toml`, to get the name to pass.

`restore` prints the bookmark of the state it replaced, so a restore can itself be undone. Rehearse it on
staging before go-live (see "Go-live checklist").

## 2. Weekly logical export (off-platform copy, per-agency restore elsewhere)

`backend/scripts/backup-tenants.mjs` writes a gzipped, data-only dump of the master database and every
agency database, plus `manifest.json` (sizes and sha256).

```
# what would be backed up
node backend/scripts/backup-tenants.mjs --local --dry-run
node backend/scripts/backup-tenants.mjs --remote --env production --dry-run

# local stack (fix-stack state) -> files, and prove the restore into a fresh database
node backend/scripts/backup-tenants.mjs --local --out backend/.dryrun/tcrm-backup --verify

# production: export every database listed in .wrangler.production.toml and upload to R2
node backend/scripts/gen-wrangler.mjs --env production --from-d1-remote
node backend/scripts/backup-tenants.mjs --remote --env production --bucket travelcrm-backups
```

Why not `wrangler d1 export`: D1 export refuses any database that contains FTS5 virtual tables, and every
agency database has them (leads and contacts search). The script therefore pages through each ordinary table
and writes `INSERT OR REPLACE` statements (values rendered with SQLite `quote()`, so text, numbers, NULL and
blobs round-trip exactly). FTS shadow tables, `d1_migrations*` and SQLite internals are skipped; the full-text
indexes are rebuilt by their triggers when rows are replayed.

Remote runs upload `<bucket>/<UTC date>/<database name>.sql.gz` and `manifest.json` with
`wrangler r2 object put`. Create the bucket once: `npx wrangler r2 bucket create travelcrm-backups`, and add a
lifecycle rule (for example delete objects older than 90 days) in the Cloudflare dashboard.

### Restoring one agency from a dump

The dump holds data only, so restore into a database that already has the current schema:

```
# 1. fresh database with the schema (a new D1 database in production, a pool database locally)
npx wrangler d1 create travelcrm-tenant-restore-<name>
node backend/scripts/migrate-tenants.mjs ...            # or: wrangler d1 migrations apply <db> --remote
# 2. replay the dump (gunzip first for --remote; --restore handles .gz for local databases)
node backend/scripts/backup-tenants.mjs --restore travelcrm-tenant-xyz.sql.gz --db <db name> [--persist-to <dir>]
npx wrangler d1 execute <db name> --remote --file travelcrm-tenant-xyz.sql
# 3. point the agency at it: update tenants.db_binding / d1_database_id in the master database,
#    regenerate the config (gen-wrangler --from-d1-remote) and deploy.
```

`--verify` (local) does steps 1-2 for the first agency into a throwaway state directory and compares the table
list and every row count with the source; it fails the command when they differ.

## Schedule and ownership

* Weekly (Sunday 02:00 UTC) by the GitHub Action `.github/workflows/backup.yml` (also runnable by hand from the Actions tab;
  it needs the repository secrets `CLOUDFLARE_API_TOKEN` with D1 read and R2 write, `CLOUDFLARE_ACCOUNT_ID` and `CF_D1_MASTER_ID`,
  and the repository variable `TRAVELCRM_DOMAIN`), or from the operator's cron host with `CLOUDFLARE_API_TOKEN`
  and `CLOUDFLARE_ACCOUNT_ID` set. The dump runs through the Cloudflare API, so it does not
  load the Worker.
* Keep Time Travel as the first response; use the R2 copy for account-level disasters, for migrating an agency
  to another account, and for the 30+ day window.
* Dumps contain personal data. The R2 bucket stays private; apply the same access rules as the databases.

## Go-live checklist

- [ ] Time Travel restore rehearsal on staging (restore, check the data, undo with the printed bookmark).
- [ ] `travelcrm-backups` bucket exists, lifecycle rule set, backup job scheduled, first run checked with `--verify` on a staging copy.
- [ ] `/api/v1/health/deep` wired to an uptime monitor (X-Health-Token header, secret `HEALTH_TOKEN`).
