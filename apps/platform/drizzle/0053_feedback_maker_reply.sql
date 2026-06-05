-- Slice C: close the maker↔user feedback loop.
-- A short maker reply per feedback item (one editable note, not a thread) and
-- when it was last set. Both nullable; existing rows stay untouched.
ALTER TABLE feedback_items ADD COLUMN maker_reply TEXT;
ALTER TABLE feedback_items ADD COLUMN maker_reply_at TEXT;
