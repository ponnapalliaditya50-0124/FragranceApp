// This file imports fragrance data from CSV and fills the SQLite database with searchable records.
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const { db } = require("../db");

const dataPath = path.join(__dirname, "data.csv");

const FRONTEND_ACCORD_RULES = [
  { label: "Aromatic", keywords: ["aromatic", "herbal", "lavender", "sage", "fougere", "fougère"] },
  { label: "Aquatic", keywords: ["aquatic", "marine", "watery", "oceanic", "sea"] },
  { label: "Oriental", keywords: ["oriental", "amber", "warm spicy", "resinous"] },
  { label: "Gourmand", keywords: ["gourmand", "sweet", "dessert", "vanilla", "caramel"] },
  { label: "Fresh Clean", keywords: ["fresh", "citrus", "clean", "soapy", "green"] },
  { label: "Dark & Smoky", keywords: ["smoky", "incense", "leather", "tobacco", "dark"] },
  { label: "Powdery", keywords: ["powdery", "cosmetic", "iris"] },
  { label: "Earthy", keywords: ["earthy", "mossy", "woody", "soil", "forest"] },
  { label: "Chypre", keywords: ["chypre"] },
  { label: "Fougère", keywords: ["fougere", "fougère"] }
];

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toDisplayText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function splitList(value) {
  return uniqueValues(
    String(value || "")
      .split(/[,;]+/)
      .map((entry) => toDisplayText(entry))
      .filter(Boolean)
  );
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function generateId(brand, name) {
  const base = `${brand || "unknown"}-${name || "fragrance"}`;
  return normalizeText(base).replace(/\s+/g, "-");
}

function parseBlindBuyScore(value) {
  const numeric = Number.parseFloat(String(value || "").trim());

  if (Number.isNaN(numeric)) {
    return null;
  }

  if (numeric <= 5) {
    return Math.round(clamp((numeric / 5) * 100, 0, 100));
  }

  if (numeric <= 10) {
    return Math.round(clamp((numeric / 10) * 100, 0, 100));
  }

  return Math.round(clamp(numeric, 0, 100));
}

function parsePerformanceScore(value) {
  const raw = String(value || "").trim();
  const numeric = Number.parseFloat(raw);

  if (Number.isNaN(numeric)) {
    return null;
  }

  if (numeric <= 10) {
    return clamp(numeric, 1, 10);
  }

  if (numeric <= 100) {
    return clamp(numeric / 10, 1, 10);
  }

  return null;
}

function matchesKeyword(items, keyword) {
  return items.some((item) => item.includes(keyword));
}

function normalizeAccords(rawAccords) {
  const normalized = new Set();
  const accordTokens = rawAccords.map((accord) => normalizeText(accord));

  FRONTEND_ACCORD_RULES.forEach((rule) => {
    if (rule.keywords.some((keyword) => matchesKeyword(accordTokens, keyword))) {
      normalized.add(rule.label);
    }
  });

  return [...normalized];
}

function loadCsvRows() {
  return new Promise((resolve, reject) => {
    const rows = [];

    fs.createReadStream(dataPath)
      .pipe(
        csv({
          mapHeaders: ({ header }) => (header ? header.replace(/^\ufeff/, "") : header)
        })
      )
      .on("data", (row) => rows.push(row))
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
}

const selectExistingFragrance = db.prepare("SELECT id FROM fragrances WHERE id = ?");
const insertFragrance = db.prepare(`
  INSERT INTO fragrances (
    id, name, house, price_tier, longevity_score, sillage_score, blind_buy_score, archetype, dupe_of
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertNote = db.prepare("INSERT INTO fragrance_notes (fragrance_id, note, note_type) VALUES (?, ?, ?)");
const insertAccord = db.prepare("INSERT INTO fragrance_accords (fragrance_id, accord, percentage) VALUES (?, ?, ?)");

const importRows = db.transaction((rows) => {
  db.exec(`
    DELETE FROM fragrance_notes;
    DELETE FROM fragrance_accords;
    DELETE FROM fragrance_families;
    DELETE FROM fragrance_seasons;
    DELETE FROM fragrance_occasions;
    DELETE FROM fragrances;
  `);

  let importedCount = 0;

  rows.forEach((row) => {
    const name = toDisplayText(row.Name);
    const brand = toDisplayText(row.Brand);

    if (!name || !brand) {
      return;
    }

    const fragranceId = generateId(brand, name);
    if (selectExistingFragrance.get(fragranceId)) {
      return;
    }

    const topNotes = splitList(row["top notes"]);
    const heartNotes = splitList(row["middle notes"]);
    const baseNotes = splitList(row["base notes"]);
    const rawAccords = splitList(row.mainaccord || row.mainaccords || row["main accord"] || row["main accords"]);
    const normalizedAccords = normalizeAccords(rawAccords);
    const allAccords = uniqueValues([...rawAccords, ...normalizedAccords]);
    const blindBuyScore = parseBlindBuyScore(row.ratingValue);
    const longevityScore = parsePerformanceScore(row.longevity);
    const sillageScore = parsePerformanceScore(row.sillage);

    insertFragrance.run(
      fragranceId,
      name,
      brand,
      null,
      longevityScore === null ? null : Number(longevityScore.toFixed(1)),
      sillageScore === null ? null : Number(sillageScore.toFixed(1)),
      blindBuyScore,
      null,
      null
    );

    topNotes.forEach((note) => insertNote.run(fragranceId, note, "top"));
    heartNotes.forEach((note) => insertNote.run(fragranceId, note, "heart"));
    baseNotes.forEach((note) => insertNote.run(fragranceId, note, "base"));

    allAccords.forEach((accord) => insertAccord.run(fragranceId, accord, 0));

    importedCount += 1;
    if (importedCount % 500 === 0) {
      console.log(`Imported ${importedCount} fragrances...`);
    }
  });

  return importedCount;
});

async function seedDatabase() {
  if (!fs.existsSync(dataPath)) {
    console.error(`CSV file not found at ${dataPath}`);
    console.error("Download the Kaggle CSV, rename it to data.csv, and place it in Fragrance App Backend/scripts/.");
    process.exit(1);
  }

  const rows = await loadCsvRows();
  const importedCount = importRows(rows);
  console.log(`Seeding complete. ${importedCount} fragrances imported.`);
}

seedDatabase().catch((error) => {
  console.error("Seeding failed:", error);
  process.exit(1);
});
