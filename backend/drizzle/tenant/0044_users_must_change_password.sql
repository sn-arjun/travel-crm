-- R104: an admin created by the provisioner signs in with a temporary password and must change it (R113 builds the flow).
ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;
