-- Dédicalivres: private snapshot archive of incomplete editorial drafts.
-- Applied to the linked Supabase project on 2026-11-03 (migration version 20261103065028).
-- This migration creates schema only; it never archives, restores or deletes events.

CREATE TABLE IF NOT EXISTS private.event_editorial_archive (
    event_id uuid PRIMARY KEY,
    event_snapshot jsonb NOT NULL,
    imported_source text,
    original_updated_at timestamptz,
    archived_at timestamptz NOT NULL DEFAULT now(),
    archive_reason text NOT NULL,
    archive_batch text NOT NULL,
    destination text NOT NULL DEFAULT 'Auto-Matte - restauration à programmer'
);

ALTER TABLE private.event_editorial_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.event_editorial_archive FROM PUBLIC, anon, authenticated;
