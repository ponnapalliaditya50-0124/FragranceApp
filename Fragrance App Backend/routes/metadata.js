// This file exposes small metadata endpoints for frontend dropdowns and filters.
const express = require("express");
const { db, isDatabaseSeeded, getDatabaseNotSeededPayload } = require("../db");

const router = express.Router();

function ensureDatabaseSeeded(res) {
  if (isDatabaseSeeded()) {
    return true;
  }

  res.status(503).json(getDatabaseNotSeededPayload());
  return false;
}

router.get("/notes", (req, res) => {
  try {
    if (!ensureDatabaseSeeded(res)) {
      return;
    }

    const notes = db
      .prepare(`
        SELECT DISTINCT note
        FROM fragrance_notes
        WHERE note IS NOT NULL AND TRIM(note) != ''
        ORDER BY note COLLATE NOCASE
      `)
      .all()
      .map((row) => row.note);

    res.json(notes);
  } catch (error) {
    console.error("Failed to fetch note metadata:", error);
    res.status(500).json({ error: "Failed to fetch notes" });
  }
});

router.get("/accords", (req, res) => {
  try {
    if (!ensureDatabaseSeeded(res)) {
      return;
    }

    const accords = db
      .prepare(`
        SELECT DISTINCT accord
        FROM fragrance_accords
        WHERE accord IS NOT NULL AND TRIM(accord) != ''
        ORDER BY accord COLLATE NOCASE
      `)
      .all()
      .map((row) => row.accord);

    res.json(accords);
  } catch (error) {
    console.error("Failed to fetch accord metadata:", error);
    res.status(500).json({ error: "Failed to fetch accords" });
  }
});

router.get("/brands", (req, res) => {
  try {
    if (!ensureDatabaseSeeded(res)) {
      return;
    }

    const brands = db
      .prepare(`
        SELECT DISTINCT house
        FROM fragrances
        WHERE house IS NOT NULL AND TRIM(house) != ''
        ORDER BY house COLLATE NOCASE
      `)
      .all()
      .map((row) => row.house);

    res.json(brands);
  } catch (error) {
    console.error("Failed to fetch brand metadata:", error);
    res.status(500).json({ error: "Failed to fetch brands" });
  }
});

module.exports = router;
