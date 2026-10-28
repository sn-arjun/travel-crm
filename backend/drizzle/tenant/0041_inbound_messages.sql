-- Inbound gateway: a received message may come from a sender who is not a contact yet,
-- so the raw sender and receiving addresses are kept on the message itself.
ALTER TABLE message_log ADD COLUMN from_address TEXT;
ALTER TABLE message_log ADD COLUMN to_address TEXT;

-- Providers redeliver webhooks; the provider message id is the duplicate check.
CREATE INDEX IF NOT EXISTS msg_log_external_id_idx ON message_log(external_id);
