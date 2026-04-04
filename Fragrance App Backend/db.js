// This file opens the SQLite database and creates the schema used by the API.
const path = require("path");
const Database = require("better-sqlite3");

const dbPath = path.join(__dirname, "fragrance.db");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS fragrances (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    house TEXT,
    price_tier INTEGER,
    longevity_score REAL,
    sillage_score REAL,
    blind_buy_score REAL,
    archetype TEXT,
    dupe_of TEXT
  );

  CREATE TABLE IF NOT EXISTS fragrance_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fragrance_id TEXT,
    note TEXT,
    note_type TEXT
  );

  CREATE TABLE IF NOT EXISTS fragrance_accords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fragrance_id TEXT,
    accord TEXT,
    percentage REAL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS fragrance_families (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fragrance_id TEXT,
    family TEXT
  );

  CREATE TABLE IF NOT EXISTS fragrance_seasons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fragrance_id TEXT,
    season TEXT
  );

  CREATE TABLE IF NOT EXISTS fragrance_occasions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fragrance_id TEXT,
    occasion TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_fragrances_house ON fragrances(house);
  CREATE INDEX IF NOT EXISTS idx_fragrances_price_tier ON fragrances(price_tier);
  CREATE INDEX IF NOT EXISTS idx_notes_fragrance_id ON fragrance_notes(fragrance_id);
  CREATE INDEX IF NOT EXISTS idx_accords_fragrance_id ON fragrance_accords(fragrance_id);
  CREATE INDEX IF NOT EXISTS idx_families_fragrance_id ON fragrance_families(fragrance_id);
  CREATE INDEX IF NOT EXISTS idx_seasons_fragrance_id ON fragrance_seasons(fragrance_id);
  CREATE INDEX IF NOT EXISTS idx_occasions_fragrance_id ON fragrance_occasions(fragrance_id);
`);

function isDatabaseSeeded() {
  return Boolean(db.prepare("SELECT id FROM fragrances LIMIT 1").get());
}

function getDatabaseNotSeededPayload() {
  return {
    error: "Database not seeded",
    code: "DB_NOT_SEEDED"
  };
}

module.exports = {
  db,
  isDatabaseSeeded,
  getDatabaseNotSeededPayload
};
