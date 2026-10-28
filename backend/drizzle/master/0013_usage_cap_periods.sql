-- R105: usage caps reset once per period. period_key is the UTC day (yyyy-mm-dd) for daily caps or
-- the UTC month (yyyy-mm) for monthly caps that the counter was last reset for.
ALTER TABLE tenant_usage_caps ADD COLUMN period_key TEXT;
