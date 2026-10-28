-- R155: accept and book on the shared quote page (design 5.5, 13.3).
--
-- itineraries.accepted_at          when the quote was accepted; NULL = not accepted. Set once: the first acceptance wins.
-- itineraries.accepted_via         share_link (the customer on the quote page), staff or message (staff recorded an acceptance that came by message).
-- itineraries.accepted_name        the name the customer typed on the page, or the staff member's note; NULL when none was asked.
-- itineraries.accepted_ip_hash     SHA-256 of the visitor's IP and the agency id. The raw IP is never stored.
-- itineraries.accepted_invoice_id  the invoice the acceptance created (quotes.accept.createInvoice), so a repeated accept answers with the same one.
ALTER TABLE itineraries ADD COLUMN accepted_at TEXT;
ALTER TABLE itineraries ADD COLUMN accepted_via TEXT;
ALTER TABLE itineraries ADD COLUMN accepted_name TEXT;
ALTER TABLE itineraries ADD COLUMN accepted_ip_hash TEXT;
ALTER TABLE itineraries ADD COLUMN accepted_invoice_id TEXT;
