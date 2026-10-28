-- R139: the six feature keys of the tour operator wave (docs/readiness/TOUR-OPERATOR-DESIGN.md section 2.1).
--
-- All six are placed here in one migration so later batches never touch the master database for keys. The keys are registered
-- in services/features/registry.ts; a key whose module is not built yet resolves but guards nothing until its batch lands.
-- The owner can move any of them between plans, or switch them off, in the super admin Feature switches console.
--
--   group_departures, public_booking:                          trial, pro, enterprise (a Pro differentiator)
--   coach_trips, age_band_pricing, margin_scheme, quote_acceptance: trial, basic, pro, enterprise (basics, not paywalled)
--
-- The plan catalogue is cached in KV for 300 seconds (plans:v<version>); a migration cannot bump that version, so a
-- running Worker picks the rows up when the cached copy expires.

INSERT OR IGNORE INTO plan_features (plan_key, feature_key) VALUES
  ('trial', 'group_departures'),
  ('pro', 'group_departures'),
  ('enterprise', 'group_departures'),
  ('trial', 'public_booking'),
  ('pro', 'public_booking'),
  ('enterprise', 'public_booking'),
  ('trial', 'coach_trips'),
  ('basic', 'coach_trips'),
  ('pro', 'coach_trips'),
  ('enterprise', 'coach_trips'),
  ('trial', 'age_band_pricing'),
  ('basic', 'age_band_pricing'),
  ('pro', 'age_band_pricing'),
  ('enterprise', 'age_band_pricing'),
  ('trial', 'margin_scheme'),
  ('basic', 'margin_scheme'),
  ('pro', 'margin_scheme'),
  ('enterprise', 'margin_scheme'),
  ('trial', 'quote_acceptance'),
  ('basic', 'quote_acceptance'),
  ('pro', 'quote_acceptance'),
  ('enterprise', 'quote_acceptance');
