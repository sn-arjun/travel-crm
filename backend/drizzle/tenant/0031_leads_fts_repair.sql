-- Repair: the leads_fts triggers from 0002_leads_fts5.sql never took effect
-- (leads_fts_idx/leads_fts_docsize were empty despite leads having rows and
-- d1_migrations showing 0002 as applied). Recreate the triggers defensively
-- and rebuild the index from the current leads table so search works for
-- both existing and future rows.

CREATE TRIGGER IF NOT EXISTS leads_fts_insert AFTER INSERT ON leads BEGIN
  INSERT INTO leads_fts(rowid, title, destination)
  VALUES (NEW.rowid, NEW.title, NEW.destination);
END;

CREATE TRIGGER IF NOT EXISTS leads_fts_update AFTER UPDATE ON leads BEGIN
  INSERT INTO leads_fts(leads_fts, rowid, title, destination)
  VALUES ('delete', OLD.rowid, OLD.title, OLD.destination);
  INSERT INTO leads_fts(rowid, title, destination)
  VALUES (NEW.rowid, NEW.title, NEW.destination);
END;

CREATE TRIGGER IF NOT EXISTS leads_fts_delete AFTER DELETE ON leads BEGIN
  INSERT INTO leads_fts(leads_fts, rowid, title, destination)
  VALUES ('delete', OLD.rowid, OLD.title, OLD.destination);
END;

INSERT INTO leads_fts(leads_fts) VALUES ('rebuild');
