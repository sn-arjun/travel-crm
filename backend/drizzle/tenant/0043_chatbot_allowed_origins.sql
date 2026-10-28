-- R107: websites allowed to embed the chat widget (JSON array of origins, e.g. ["https://www.example.com"]).
-- Empty means no website may use the widget until the agency lists it.
ALTER TABLE chatbot_config ADD COLUMN allowed_origins TEXT;
