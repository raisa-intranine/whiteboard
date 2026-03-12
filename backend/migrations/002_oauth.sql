-- migrations/002_oauth.sql
-- Run this once against your Neon Postgres database to update the schema for OAuth.
-- You can run it via: psql $DATABASE_URL -f migrations/002_oauth.sql

ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
