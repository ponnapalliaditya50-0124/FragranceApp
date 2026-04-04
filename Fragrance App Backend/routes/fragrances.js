// This file provides fragrance lookup routes and helpers for building full fragrance objects.
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

function getRelatedTemplate() {
  return {
    notes: {
      top: [],
      heart: [],
      base: []
    },
    accordTags: [],
    noteFamilies: [],
    seasonTags: [],
    occasionTags: []
  };
}

function parsePositiveInteger(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) || parsed < 0 ? null : parsed;
}

function loadRelatedData(fragranceIds) {
  const ids = [...new Set(fragranceIds.filter(Boolean))];
  const relatedMap = new Map();

  ids.forEach((id) => {
    relatedMap.set(id, getRelatedTemplate());
  });

  if (ids.length === 0) {
    return relatedMap;
  }

  const placeholders = ids.map(() => "?").join(", ");

  const noteRows = db
    .prepare(`
      SELECT fragrance_id, note, note_type
      FROM fragrance_notes
      WHERE fragrance_id IN (${placeholders})
      ORDER BY id
    `)
    .all(...ids);

  noteRows.forEach((row) => {
    const fragrance = relatedMap.get(row.fragrance_id);
    if (!fragrance) {
      return;
    }

    if (row.note_type === "top") {
      fragrance.notes.top.push(row.note);
    } else if (row.note_type === "heart") {
      fragrance.notes.heart.push(row.note);
    } else if (row.note_type === "base") {
      fragrance.notes.base.push(row.note);
    }
  });

  const accordRows = db
    .prepare(`
      SELECT fragrance_id, accord
      FROM fragrance_accords
      WHERE fragrance_id IN (${placeholders})
      ORDER BY id
    `)
    .all(...ids);

  accordRows.forEach((row) => {
    const fragrance = relatedMap.get(row.fragrance_id);
    if (fragrance && row.accord && !fragrance.accordTags.includes(row.accord)) {
      fragrance.accordTags.push(row.accord);
    }
  });

  const familyRows = db
    .prepare(`
      SELECT fragrance_id, family
      FROM fragrance_families
      WHERE fragrance_id IN (${placeholders})
      ORDER BY id
    `)
    .all(...ids);

  familyRows.forEach((row) => {
    const fragrance = relatedMap.get(row.fragrance_id);
    if (fragrance && row.family && !fragrance.noteFamilies.includes(row.family)) {
      fragrance.noteFamilies.push(row.family);
    }
  });

  const seasonRows = db
    .prepare(`
      SELECT fragrance_id, season
      FROM fragrance_seasons
      WHERE fragrance_id IN (${placeholders})
      ORDER BY id
    `)
    .all(...ids);

  seasonRows.forEach((row) => {
    const fragrance = relatedMap.get(row.fragrance_id);
    if (fragrance && row.season && !fragrance.seasonTags.includes(row.season)) {
      fragrance.seasonTags.push(row.season);
    }
  });

  const occasionRows = db
    .prepare(`
      SELECT fragrance_id, occasion
      FROM fragrance_occasions
      WHERE fragrance_id IN (${placeholders})
      ORDER BY id
    `)
    .all(...ids);

  occasionRows.forEach((row) => {
    const fragrance = relatedMap.get(row.fragrance_id);
    if (fragrance && row.occasion && !fragrance.occasionTags.includes(row.occasion)) {
      fragrance.occasionTags.push(row.occasion);
    }
  });

  return relatedMap;
}

function formatFragrance(row, related) {
  const details = related || getRelatedTemplate();

  return {
    id: row.id,
    name: row.name,
    house: row.house,
    priceTier: row.price_tier,
    longevityScore: row.longevity_score,
    sillageScore: row.sillage_score,
    blindBuyScore: row.blind_buy_score,
    archetype: row.archetype,
    dupeOf: row.dupe_of,
    notes: details.notes,
    accordTags: details.accordTags,
    noteFamilies: details.noteFamilies,
    seasonTags: details.seasonTags,
    occasionTags: details.occasionTags
  };
}

function getFullFragrance(id) {
  const row = db.prepare("SELECT * FROM fragrances WHERE id = ?").get(id);

  if (!row) {
    return null;
  }

  const relatedMap = loadRelatedData([id]);
  return formatFragrance(row, relatedMap.get(id));
}

function getFullFragrancesByIds(fragranceIds) {
  const ids = [...new Set(fragranceIds.filter(Boolean))];

  if (ids.length === 0) {
    return [];
  }

  const placeholders = ids.map(() => "?").join(", ");
  const rows = db
    .prepare(`SELECT * FROM fragrances WHERE id IN (${placeholders})`)
    .all(...ids);
  const rowMap = new Map(rows.map((row) => [row.id, row]));
  const relatedMap = loadRelatedData(ids);

  return ids
    .map((id) => {
      const row = rowMap.get(id);
      return row ? formatFragrance(row, relatedMap.get(id)) : null;
    })
    .filter(Boolean);
}

router.get("/", (req, res) => {
  try {
    if (!ensureDatabaseSeeded(res)) {
      return;
    }

    const limit = parsePositiveInteger(req.query.limit, undefined);
    const offset = parsePositiveInteger(req.query.offset, 0);
    const filters = [];
    const params = [];

    if (limit === null || offset === null) {
      return res.status(400).json({ error: "limit and offset must be positive integers" });
    }

    if (req.query.house) {
      filters.push("LOWER(house) = LOWER(?)");
      params.push(req.query.house.trim());
    }

    if (req.query.price_tier !== undefined) {
      const priceTier = Number.parseInt(req.query.price_tier, 10);
      if (Number.isNaN(priceTier)) {
        return res.status(400).json({ error: "price_tier must be a number" });
      }
      filters.push("price_tier = ?");
      params.push(priceTier);
    }

    let query = "SELECT id FROM fragrances";
    if (filters.length > 0) {
      query += ` WHERE ${filters.join(" AND ")}`;
    }
    query += " ORDER BY name COLLATE NOCASE";

    if (limit !== undefined) {
      query += " LIMIT ?";
      params.push(limit);
      if (offset > 0) {
        query += " OFFSET ?";
        params.push(offset);
      }
    } else if (offset > 0) {
      query += " LIMIT -1 OFFSET ?";
      params.push(offset);
    }

    const fragranceIds = db.prepare(query).all(...params).map((row) => row.id);
    res.json(getFullFragrancesByIds(fragranceIds));
  } catch (error) {
    console.error("Failed to fetch fragrances:", error);
    res.status(500).json({ error: "Failed to fetch fragrances" });
  }
});

router.get("/search", (req, res) => {
  try {
    if (!ensureDatabaseSeeded(res)) {
      return;
    }

    const query = String(req.query.q || "").trim();

    if (!query) {
      return res.json([]);
    }

    const searchValue = `%${query}%`;
    const fragranceIds = db
      .prepare(`
        SELECT id
        FROM fragrances
        WHERE name LIKE ? OR house LIKE ?
        ORDER BY
          CASE WHEN name LIKE ? THEN 0 ELSE 1 END,
          name COLLATE NOCASE
        LIMIT 25
      `)
      .all(searchValue, searchValue, searchValue)
      .map((row) => row.id);

    res.json(getFullFragrancesByIds(fragranceIds));
  } catch (error) {
    console.error("Failed to search fragrances:", error);
    res.status(500).json({ error: "Failed to search fragrances" });
  }
});

router.get("/:id", (req, res) => {
  try {
    if (!ensureDatabaseSeeded(res)) {
      return;
    }

    const fragrance = getFullFragrance(req.params.id);

    if (!fragrance) {
      return res.status(404).json({ error: "Not found" });
    }

    res.json(fragrance);
  } catch (error) {
    console.error("Failed to fetch fragrance:", error);
    res.status(500).json({ error: "Failed to fetch fragrance" });
  }
});

module.exports = {
  router,
  getFullFragrance,
  getFullFragrancesByIds
};
