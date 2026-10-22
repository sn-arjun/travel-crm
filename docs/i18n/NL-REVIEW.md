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

Current lists: `docs/i18n/nl-review/foundation.md` (batch R136), `docs/i18n/nl-review/R138.md` (batch R138), `docs/i18n/nl-review/R140.md` (batch R140), `docs/i18n/nl-review/R144.md` (batch R144), `docs/i18n/nl-review/R142.md` (batch R142), `docs/i18n/nl-review/R145.md` (batch R145), `docs/i18n/nl-review/R141.md` (batch R141), `docs/i18n/nl-review/R147.md` (batch R147), `docs/i18n/nl-review/R146.md` (batch R146), `docs/i18n/nl-review/R151.md` (batch R151), `docs/i18n/nl-review/R149.md` (batch R149), `docs/i18n/nl-review/R148.md` (batch R148), `docs/i18n/nl-review/R153.md` (batch R153), `docs/i18n/nl-review/R150.md` (batch R150), `docs/i18n/nl-review/R152.md` (batch R152), `docs/i18n/nl-review/R154.md` (batch R154).

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
