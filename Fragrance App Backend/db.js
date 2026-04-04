// This file opens the SQLite database and creates the schema used by the API.
const path = require("path");
const Database = require("better-sqlite3");

const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, "fragrance.db");
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

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    email_verified_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    session_token_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_used_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS auth_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    email TEXT NOT NULL,
    purpose TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    resend_available_at TEXT NOT NULL,
    attempts_remaining INTEGER NOT NULL DEFAULT 5,
    created_at TEXT NOT NULL,
    consumed_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_state (
    user_id INTEGER PRIMARY KEY,
    appearance_mode TEXT NOT NULL DEFAULT 'dark',
    personality_title TEXT NOT NULL DEFAULT '',
    latest_profile_json TEXT,
    latest_recommendation_ids_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_saved_fragrances (
    user_id INTEGER NOT NULL,
    fragrance_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, fragrance_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_fragrances_house ON fragrances(house);
  CREATE INDEX IF NOT EXISTS idx_fragrances_price_tier ON fragrances(price_tier);
  CREATE INDEX IF NOT EXISTS idx_notes_fragrance_id ON fragrance_notes(fragrance_id);
  CREATE INDEX IF NOT EXISTS idx_accords_fragrance_id ON fragrance_accords(fragrance_id);
  CREATE INDEX IF NOT EXISTS idx_families_fragrance_id ON fragrance_families(fragrance_id);
  CREATE INDEX IF NOT EXISTS idx_seasons_fragrance_id ON fragrance_seasons(fragrance_id);
  CREATE INDEX IF NOT EXISTS idx_occasions_fragrance_id ON fragrance_occasions(fragrance_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_normalized ON users(email COLLATE NOCASE);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token_hash ON user_sessions(session_token_hash);
  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON user_sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON user_sessions(expires_at);
  CREATE INDEX IF NOT EXISTS idx_auth_codes_lookup ON auth_codes(email, purpose, consumed_at);
  CREATE INDEX IF NOT EXISTS idx_auth_codes_user_id ON auth_codes(user_id);
  CREATE INDEX IF NOT EXISTS idx_saved_fragrances_user_id ON user_saved_fragrances(user_id);
  CREATE INDEX IF NOT EXISTS idx_saved_fragrances_fragrance_id ON user_saved_fragrances(fragrance_id);
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
