# Dutch (nl) native review

Every Dutch string in the product is **machine-made** (written by an AI model, not by a native speaker). Dutch is
complete (the i18n check requires every English key to have a Dutch text), but nothing here has been read by a
native speaker yet. A Dutch agency must not go live before the files below are reviewed.

## Where the Dutch text lives

| Surface | Location |
| --- | --- |
| Desktop interface | `desktop/src/messages/nl/<namespace>.json` (one file per first key segment) |
| Backend texts (system emails, voucher PDF labels, public pages, seeded templates) | `backend/src/i18n/nl.ts` and the `nl` versions in `backend/src/services/tenancy/seed-tenant.ts` |
| Driver app | `packages/driver_app/lib/l10n/intl_nl.arb` |

## Review lists, one file per batch

Each batch that adds Dutch text adds its own list in `docs/i18n/nl-review/<batch>.md` and never edits another
batch's list, so parallel batches do not collide. Every list names the files it covers and marks each one:

- `needs native review` (the default for anything machine-made)
- `reviewed` (a native speaker has read the whole file; add the reviewer's initials and the date)

Current lists: `docs/i18n/nl-review/foundation.md` (batch R136), `docs/i18n/nl-review/R138.md` (batch R138), `docs/i18n/nl-review/R140.md` (batch R140).

## How to review a file

1. Open the Dutch file next to the English one (`desktop/src/messages/en/<same name>.json`).
2. Read every value in context (run the app with the language set to Nederlands). Check tone (the product addresses the
   user formally, with "u"), travel-industry terms, and length (buttons and table headers must still fit).
3. Keep placeholders such as `{name}` and `{count}` exactly as they are, and do not translate the brand name, keys or
   product names. `node desktop/scripts/i18n-check.mjs` fails when a placeholder differs or a key is missing.
4. Edit the Dutch values only. Do not rename keys.
5. Change the file's line in its batch list from `needs native review` to `reviewed` with initials and date.

## Terms used so far

Itinerary = reisschema, supplier = leverancier, fleet = wagenpark, voucher = voucher, visa = visum, traveller =
reiziger, invoice = factuur, credit note = creditnota, debit note = debetnota, rate card = tarievenkaart, lead = lead,
campaign = campagne, tax = btw (VAT). Confirm or replace these during the review so later batches follow one list.
