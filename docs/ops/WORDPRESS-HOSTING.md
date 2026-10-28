# WordPress hosting for agency websites

Status: designed and unit-tested with a fake runner (batch R310). Nothing has run on a real Oracle VM yet; the numbers marked
"assumption" are estimates to confirm during the go-live load check.

Owner decision 2026-10-21: all agency websites run on **one shared WordPress installation** (WordPress Multisite, one site per
agency) on the free Oracle Cloud machine. One WordPress container per agency stays possible later if revenue allows.

## 1. Architecture

```
 CRM API Worker  --signed POST /sites-->  https://wp-api.<domain>  (Caddy)  -->  provisioner (node:http, port 9090)
                                                                                       | docker exec wp-shared wp ...
 visitor --> https://<slug>.sites.<domain> --> Caddy (on-demand TLS) --> wp-shared (WordPress Multisite, Apache/PHP 8.2)
                                                                                   |
                                                                              wp-shared-db (one MariaDB, one database)
```

One Oracle VM (VM.Standard.A1.Flex, Ubuntu ARM) runs four containers from `oci-provisioner/docker-compose.shared.yml`:

| Container | Image | Memory limit | Job |
|---|---|---|---|
| `wp-shared` | `wordpress:6-php8.2-apache` + WP-CLI (`Dockerfile.wordpress`) | 3 GB | the one Multisite network (subdomain install) |
| `wp-shared-db` | `mariadb:10.11` | 1.5 GB | the network's database (InnoDB buffer pool 768 MB) |
| `caddy-proxy` | `caddy:2` | 256 MB | TLS for every site, reverse proxy |
| `wp-provisioner` | `oci-provisioner/Dockerfile` (Node 22, no dependencies) | 256 MB | the API the CRM calls |

The provisioner (`PROVISIONER_MODE=shared`, now the default) answers the same signed API and state document as the container
shape (`POST /sites`, `GET /sites/:slug`, `POST /sites/:slug/stop|start`, `DELETE /sites/:slug`). Mapping:

| API call | What runs in `wp-shared` |
|---|---|
| `POST /sites` | once per VM: `core install` + `core multisite-convert --subdomains`, then network-wide theme and plugins; per agency: `site create --slug --title --email`, `user set-role ... administrator`, theme activation, default pages, settings, then WordPress's own "set your password" e-mail. Idempotent per slug: a repeat returns the stored state; a failed build is resumed without a second site or duplicate pages |
| `GET /sites/:slug` | the stored state document (`status`, `siteUrl`, `adminUrl`, `resetEmailSent`, `error`, plus the additive `mode: "shared"` and `blogId`) |
| stop / start | `site archive` / `site unarchive` (visitors see WordPress's "archived" page; nothing is deleted) |
| `DELETE /sites/:slug` | `site delete --yes` (that site's tables and uploads are removed; the slug becomes free) |

No password is ever returned, stored in the state document or put on a command line for an agency: the agency admin gets the
WordPress reset e-mail and chooses their own. The only generated password is the one-time install value of the network
owner `network_admin`, which is not logged; reset it with the e-mail WordPress sends to `WP_NETWORK_ADMIN_EMAIL` (or `wp user update`).
Every command is an argument list to `docker exec` (no shell); the agency's name is one argument; slugs, domains and e-mails are
validated before anything runs. The `domain` in a request must be `<slug>.<WP_SITES_DOMAIN>` (the backend already sends that).

Builds run one at a time (a queue inside the provisioner); the first site also bootstraps the network and takes a few minutes, later
ones about a minute (assumption).

## 2. TLS and DNS

**Decision: Caddy on-demand TLS** (one Let's Encrypt certificate per site, issued the first time its address is opened), not a
wildcard certificate. Reason: a wildcard needs the DNS challenge, which needs a Caddy build with the Cloudflare DNS plugin (custom
image, an API token with DNS edit rights kept on the VM). On-demand needs nothing extra. Before issuing, Caddy asks the provisioner
(`/tls-check`, internal only) whether the host is the network host or an existing site, so strangers cannot make the server request
certificates for arbitrary names. Limits: Let's Encrypt allows about 50 new certificates per registered domain per week, so create
no more than about 40 agency sites a week or switch to the wildcard (DNS-01) later; the first request to a new site takes a second
or two longer.

DNS records (terraform creates both when `oci_instance_ip` is set in `terraform/terraform.tfvars`; otherwise add them by hand in
Cloudflare). Both must be **DNS only (grey cloud)**, not proxied:

| Name | Type | Value | Used for |
|---|---|---|---|
| `*.sites` (= `*.sites.<domain>`) | A | VM public IP | every agency site and `network.sites.<domain>` |
| `wp-api` (= `wp-api.<domain>`) | A | VM public IP | the provisioner API (`OCI_PROVISIONER_URL=https://wp-api.<domain>` on the API Worker) |

API Worker values: `WP_SITES_DOMAIN=sites.<domain>`, `OCI_PROVISIONER_URL`, `PROVISIONER_SECRET` (same secret as on the VM).
This replaces the old proxied `*` record. Proxying is avoided because Cloudflare's free certificate does not cover two-level names
and because on-demand issuance needs to reach Caddy directly. Agencies' own domains (custom domain mapping) are not part of this build.

## 3. Capacity

Oracle's Always Free A1 allowance, read from docs.oracle.com (Always Free Resources) on 2026-10-20: **1,500 OCPU-hours and 9,000
GB-hours a month, equivalent to 2 OCPUs and 12 GB of memory**, and **200 GB of boot plus block volume combined**. (The old
terraform asked for 4 OCPUs / 24 GB, which the page no longer supports; the difference would have been billed.) Terraform defaults:
`instance_ocpus = 2`, `instance_memory_gb = 12`, `boot_volume_gb = 100`; variables in `terraform/oracle/variables.tf`.

Memory plan on 12 GB: containers above 5 GB in limits, 2 GB reserved for the host and Docker, the rest is page cache and headroom
for spikes (plus 4 GB swap as a safety net).

`MAX_SITES` (when not set) is derived as `(RAM - 2048 MB reserve - 4608 MB shared base) / 64 MB per site`:
**88 sites on 12 GB, 280 on 24 GB**. Assumptions (unverified until the go-live load check): agency sites are small brochure
sites with a page cache, 64 MB of extra database buffer, PHP workers and cache per site is enough on average, and traffic is a few
thousand page views a month per site. The compose file starts with a conservative `MAX_SITES=60`; raise it after watching memory
for two weeks. Per-container mode, by contrast, is 768 MB a site: 13 sites on the same machine. Disk is not the limit: about 75 GB
is free for sites after the system, images and swap, which is about 500 MB per site at 150 sites.

What happens at the limit: `POST /sites` answers 503 "Site limit reached" and the CRM shows the site as failed with that message.
Then, in order: raise the limit if memory is idle; move to a paid shape (section 6); or run a second VM with its own network
(a different `WP_SITES_DOMAIN` label would be needed, not built).

Free-tier risks: capacity for A1 in ap-mumbai-1 is often "out of capacity" (retry `terraform apply` later); Oracle may reclaim an idle
free instance (CPU, network and memory all under 20% for 7 days; COST-MODEL 1.10), which a quiet network can trigger. Upgrading the
tenancy to pay-as-you-go keeps the free allowance and is the usual protection; confirm the current policy in the console.

## 4. Backups

The network is one database plus one uploads folder, so one pair of files covers every agency. Nightly on the VM (cron, user `ubuntu`;
`/opt/wp-shared/stack` holds the compose files and `.env`):

```
docker exec wp-shared-db sh -c 'mariadb-dump -uroot -p"$MARIADB_ROOT_PASSWORD" --single-transaction --all-databases' | gzip > /opt/wp-shared/backups/db-$(date +%F).sql.gz
tar czf /opt/wp-shared/backups/html-$(date +%F).tgz -C /opt/wp-shared html/wp-content html/wp-config.php
find /opt/wp-shared/backups -type f -mtime +14 -delete
```

Copy the files off the machine daily (a VM can be reclaimed or lost): `rclone` to an R2 bucket (for example under
`travelcrm-backups/wordpress/`) with an R2 access key created by the owner. Also keep `/opt/wp-shared/stack/.env`, which holds the
database passwords, in the password manager. Restore: start the stack, `gunzip -c db-<date>.sql.gz | docker exec -i wp-shared-db sh -c 'mariadb -uroot -p"$MARIADB_ROOT_PASSWORD"'`,
unpack the tarball into `/opt/wp-shared`, restart `wp-shared`. A single agency can be restored from the same dump by loading it into a
scratch database and exporting that site's tables (`wp_<blogId>_*`) and `wp-content/uploads/sites/<blogId>`. Rehearse one restore before
go-live. Updates: WordPress core, theme and plugins are updated by the platform only, on a schedule (monthly, and at once for security
releases): `docker exec wp-shared wp core update`, `plugin update --all`, `theme update --all`, run per network with `--url=network.sites.<domain>`,
after a fresh backup.

## 5. What an agency can and cannot do on a shared network

| Can | Cannot |
|---|---|
| Edit pages, posts, menus, images, SEO fields, forms (the network-activated plugins: Elementor, Contact Form 7, Yoast SEO, WP Fastest Cache) | Install, upload or delete plugins and themes; edit theme or plugin files (`DISALLOW_FILE_EDIT`; only the network super admin has the install rights) |
| Choose among the themes the platform network-enables; change colours, logo and content | Run custom PHP, change `wp-config`, use a plugin that is not on the network list |
| Add editors and authors to their own site | See or touch other agencies' sites, users or data (each site has its own tables; users are network-wide but only members of their site) |
| Use their own contact form (it can also post enquiries to the CRM) | Use their own domain (not built), unlimited uploads (network upload limit applies), heavy plugins such as shops |

One bad plugin or a traffic spike on one site affects the whole network; this is the price of the free machine. An agency that
needs its own plugins, its own domain or isolation is the case for the next section.

## 6. Path to container per agency (later)

The provisioner keeps both shapes: `PROVISIONER_MODE=container` builds one WordPress and one MariaDB container per agency
(768 MB each, `SITE_MEMORY_MB`) behind per-site Caddy files, with the same API and state document (`mode` tells them apart in the state).
Moving one agency out of the network: `wp --url=<slug>.sites.<domain> db export` of that site's tables (`wp db tables --url=... --format=csv`)
and its `uploads/sites/<blogId>` folder; start a container-mode site for the slug (`mode` switch per request is not built: it needs a small
follow-up so the backend can ask for a dedicated site), import the SQL, then `wp search-replace` the table prefix and the URL, point
the agency's hostname at the new container, and delete the site from the network. Cost drivers: section 7. For a mixed estate both
drivers can run side by side (two provisioners on two VMs, the backend picks the URL per agency); not built.

## 7. Cost note

Free allowance: the first VM costs nothing (compute, 100 GB boot of the free 200 GB, 10 TB of monthly traffic is far above need),
plus the domain and the outbound e-mail service the platform already pays for. Beyond the allowance (prices from a third-party
tracker, Oracle's own page refused the request: confirm in the console; COST-MODEL 1.10): $0.013106 per OCPU-hour and $0.0019659 per GB-hour.
A second identical machine (2 OCPUs, 12 GB) would be about 2 x 0.013106 x 730 + 12 x 0.0019659 x 730 = **about $36 a month** plus
disk, serving up to roughly another 88 sites, so about $0.41 (about 35 rupees) a site. Per-container hosting costs about $2.06 (about 199 rupees)
a site beyond the free machine (COST-MODEL), which is why it is reserved for agencies that pay for it.

## 8. Go-live on the real Oracle VM (owner)

1. Terraform: `cd terraform/oracle`, fill `terraform.tfvars` (OCI keys, region ap-mumbai-1, Ubuntu ARM image OCID, SSH key); keep the sizing
   defaults; `terraform init && terraform apply` (retry if "out of capacity"). Copy `instance_public_ip`.
2. DNS: put the IP in `oci_instance_ip` in `terraform/terraform.tfvars` and apply the main root, or add the two DNS-only records of section 2.
3. SSH in, wait for cloud-init (`cloud-init status --wait`), copy `oci-provisioner/` to `/opt/wp-shared/stack`
   (`scp -r`), `cp shared.env.example .env`, fill in every value (passwords with `openssl rand -hex 24`, the same `PROVISIONER_SECRET` as the
   API Worker), `docker compose -f docker-compose.shared.yml --env-file .env up -d --build`. Test certificates first by adding
   a staging `acme_ca https://acme-staging-v02.api.letsencrypt.org/directory` line to the global block of `caddy/Caddyfile.shared`, then remove it.
4. Mail: the container has no mail server, so the "set your password" e-mail is not sent until SMTP is configured. Add a mu-plugin
   (`/opt/wp-shared/html/wp-content/mu-plugins/smtp.php`) that sets `$phpmailer->isSMTP()` with the platform's SendGrid SMTP credentials in the
   `phpmailer_init` hook. Until then `resetEmailSent` is false in the state document.
5. API Worker: set `OCI_PROVISIONER_URL=https://wp-api.<domain>`, `PROVISIONER_SECRET`, `WP_SITES_DOMAIN=sites.<domain>` (secrets: see GO-LIVE; do
   not paste them anywhere else).
6. Check: `curl https://wp-api.<domain>/health` (mode `shared`); create one test agency site from the CRM; open its address (certificate
   appears), log in through the reset e-mail, then stop (archive), start, and delete it.
7. Load check: create 10 sites, run a simple load test against three of them, watch `docker stats` and `free -m` for two weeks, then set `MAX_SITES`.
8. Install the nightly backup job of section 4 and do one restore rehearsal.
