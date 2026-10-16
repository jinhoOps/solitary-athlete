-- Only private attachment metadata. No image bytes or signed URLs.
BEGIN;
SET LOCAL ROLE mukmuk_owner;
ALTER TABLE solitary_athlete.workout_events
  ADD COLUMN attachments jsonb NOT NULL DEFAULT '[]'::jsonb
  CHECK (jsonb_typeof(attachments) = 'array');
RESET ROLE;
COMMIT;
