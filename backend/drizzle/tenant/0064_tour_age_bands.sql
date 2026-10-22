-- R164: a tour can carry its own age bands (same shape as itinerary_templates.age_bands).
--
-- tours.age_bands  the tour's own band list (JSON); NULL = use the agency's bands (setting pricing.age_bands).
-- Resolution for a departure: the tour's bands, then the agency's.
ALTER TABLE tours ADD COLUMN age_bands TEXT;
