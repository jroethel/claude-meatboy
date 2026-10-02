-- Runs carry an X handle, up to 15 characters, in place of 3 initials.
ALTER TABLE runs RENAME COLUMN initials TO handle;
