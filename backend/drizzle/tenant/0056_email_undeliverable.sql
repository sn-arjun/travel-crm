-- R128: a hard bounce no longer blanks the contact's email. The address stays and is flagged undeliverable
-- (with the provider's reason and the date) so every later send to it is suppressed and the agency can see why.
-- Editing the contact's email clears the flag.
ALTER TABLE contacts ADD COLUMN email_undeliverable INTEGER NOT NULL DEFAULT 0;
ALTER TABLE contacts ADD COLUMN email_undeliverable_reason TEXT;
ALTER TABLE contacts ADD COLUMN email_undeliverable_at TEXT;

-- R128: marketing campaign emails keep the provider's message id so the delivery events (delivered, open, click,
-- bounce) find the recipient row; opened_at and clicked_at make the campaign counters count each recipient once.
ALTER TABLE campaign_recipients ADD COLUMN message_id TEXT;
ALTER TABLE campaign_recipients ADD COLUMN opened_at TEXT;
ALTER TABLE campaign_recipients ADD COLUMN clicked_at TEXT;
CREATE INDEX IF NOT EXISTS campaign_recipients_message_id_idx ON campaign_recipients(message_id);
