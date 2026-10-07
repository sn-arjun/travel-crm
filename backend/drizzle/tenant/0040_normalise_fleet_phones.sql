-- B39: normalise fleet phones that were stored as bare national digits to E.164 (default country +91).
-- Data-only and idempotent: rows already in E.164 ('+...') or with unrecognised shapes are left untouched.
-- Handled shapes (after stripping spaces, dashes, dots and parentheses, digits only):
--   10 digits            -> +91XXXXXXXXXX
--   0 + 10 digits        -> +91XXXXXXXXXX
--   91 + 10 digits       -> +91XXXXXXXXXX

UPDATE trip_assignments
SET passenger_phone = CASE
  WHEN length(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(passenger_phone, ' ', ''), '-', ''), '.', ''), '(', ''), ')', '')) = 10
    THEN '+91' || REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(passenger_phone, ' ', ''), '-', ''), '.', ''), '(', ''), ')', '')
  WHEN length(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(passenger_phone, ' ', ''), '-', ''), '.', ''), '(', ''), ')', '')) = 11
    THEN '+91' || substr(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(passenger_phone, ' ', ''), '-', ''), '.', ''), '(', ''), ')', ''), 2)
  ELSE '+' || REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(passenger_phone, ' ', ''), '-', ''), '.', ''), '(', ''), ')', '')
END
WHERE passenger_phone IS NOT NULL
  AND passenger_phone NOT LIKE '+%'
  AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(passenger_phone, ' ', ''), '-', ''), '.', ''), '(', ''), ')', '') NOT GLOB '*[^0-9]*'
  AND (
    length(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(passenger_phone, ' ', ''), '-', ''), '.', ''), '(', ''), ')', '')) = 10
    OR (length(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(passenger_phone, ' ', ''), '-', ''), '.', ''), '(', ''), ')', '')) = 11
        AND substr(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(passenger_phone, ' ', ''), '-', ''), '.', ''), '(', ''), ')', ''), 1, 1) = '0')
    OR (length(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(passenger_phone, ' ', ''), '-', ''), '.', ''), '(', ''), ')', '')) = 12
        AND substr(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(passenger_phone, ' ', ''), '-', ''), '.', ''), '(', ''), ')', ''), 1, 2) = '91')
  );

UPDATE drivers
SET emergency_contact_phone = CASE
  WHEN length(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(emergency_contact_phone, ' ', ''), '-', ''), '.', ''), '(', ''), ')', '')) = 10
    THEN '+91' || REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(emergency_contact_phone, ' ', ''), '-', ''), '.', ''), '(', ''), ')', '')
  WHEN length(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(emergency_contact_phone, ' ', ''), '-', ''), '.', ''), '(', ''), ')', '')) = 11
    THEN '+91' || substr(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(emergency_contact_phone, ' ', ''), '-', ''), '.', ''), '(', ''), ')', ''), 2)
  ELSE '+' || REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(emergency_contact_phone, ' ', ''), '-', ''), '.', ''), '(', ''), ')', '')
END
WHERE emergency_contact_phone IS NOT NULL
  AND emergency_contact_phone NOT LIKE '+%'
  AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(emergency_contact_phone, ' ', ''), '-', ''), '.', ''), '(', ''), ')', '') NOT GLOB '*[^0-9]*'
  AND (
    length(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(emergency_contact_phone, ' ', ''), '-', ''), '.', ''), '(', ''), ')', '')) = 10
    OR (length(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(emergency_contact_phone, ' ', ''), '-', ''), '.', ''), '(', ''), ')', '')) = 11
        AND substr(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(emergency_contact_phone, ' ', ''), '-', ''), '.', ''), '(', ''), ')', ''), 1, 1) = '0')
    OR (length(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(emergency_contact_phone, ' ', ''), '-', ''), '.', ''), '(', ''), ')', ''))= 12
        AND substr(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(emergency_contact_phone, ' ', ''), '-', ''), '.', ''), '(', ''), ')', ''), 1, 2) = '91')
  );
