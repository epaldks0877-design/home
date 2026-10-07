-- Run once in the gts-catalog D1 database console before enabling the admin.
CREATE TABLE IF NOT EXISTS catalog_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('PROFILE', 'PLASTIC')),
  kind TEXT NOT NULL CHECK (kind IN ('product', 'case')),
  summary TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  material TEXT NOT NULL DEFAULT '',
  image_key TEXT,
  image_alt TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS catalog_public_order ON catalog_items(status, sort_order, created_at DESC, id);
