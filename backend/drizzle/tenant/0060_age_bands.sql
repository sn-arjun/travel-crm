-- R149: age-band pricing on templates and quotes (design 4.2 and 14).
--
-- itinerary_templates.age_bands  the template's own band list (JSON); NULL = use the agency's bands (setting pricing.age_bands).
-- itineraries.age_bands          snapshot of the band list the quantities were filled with (JSON); NULL = the agency's bands.
-- itineraries.pax_ages           what the last fill used: {"adults":2,"ages":[8,5],"source":"ages"} (JSON).
ALTER TABLE itinerary_templates ADD COLUMN age_bands TEXT;
ALTER TABLE itineraries ADD COLUMN age_bands TEXT;
ALTER TABLE itineraries ADD COLUMN pax_ages TEXT;
