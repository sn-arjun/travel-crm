-- R151: the website chat can ask the visitor for name, email and phone.
--
-- chatbot_config.contact_capture is the agency's setting (JSON, design 4.8); NULL means "never ask" (today's behaviour).
-- The conversation keeps the consent the visitor gave: when, the exact text shown, and whether the marketing box was ticked.
-- Consent rows (contact_consents) are written as soon as the conversation belongs to a contact.
ALTER TABLE chatbot_config ADD COLUMN contact_capture TEXT;
ALTER TABLE chatbot_conversations ADD COLUMN contact_consent_at TEXT;
ALTER TABLE chatbot_conversations ADD COLUMN contact_consent_text TEXT;
ALTER TABLE chatbot_conversations ADD COLUMN contact_marketing_opt_in INTEGER DEFAULT 0;
