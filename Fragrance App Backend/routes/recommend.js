// This file scores fragrances against user preferences and returns the strongest matches.
const express = require("express");
const { authOptional, sanitizeLatestProfile, upsertUserState } = require("../auth");
const { db, isDatabaseSeeded, getDatabaseNotSeededPayload } = require("../db");
const { getFullFragrancesByIds } = require("./fragrances");

const router = express.Router();

function ensureDatabaseSeeded(res) {
  if (isDatabaseSeeded()) {
    return true;
  }

  res.status(503).json(getDatabaseNotSeededPayload());
  return false;
}

const CLIMATE_TO_SEASONS = {
  "Hot & Humid": ["Summer"],
  "Dry & Desert": ["Summer", "Fall"],
  Temperate: ["Spring", "Fall"],
  "Cold & Crisp": ["Winter"],
  Tropical: ["Summer"]
};

const KEYWORD_FAMILY_MAP = {
  warm: ["amber", "spicy"],
  smoky: ["leather", "amber"],
  fresh: ["citrus", "fresh"],
  clean: ["citrus", "fresh"],
  woody: ["woody"],
  citrus: ["citrus"],
  floral: ["floral"],
  spicy: ["spicy"],
  sweet: ["sweet"],
  leather: ["leather"],
  dark: ["leather", "amber", "animalic"],
  light: ["citrus", "fresh", "floral"],
  aquatic: ["fresh"],
  gourmand: ["sweet"],
  oriental: ["amber", "spicy"],
  earthy: ["woody", "animalic"],
  powdery: ["floral", "sweet"],
  rich: ["leather", "amber", "animalic"],
  cozy: ["sweet", "amber"]
};

const USAGE_MATCHERS = [
  {
    keywords: ["office", "work", "professional"],
    targets: ["Office"]
  },
  {
    keywords: ["date", "night", "evening", "intimate"],
    targets: ["Date Night", "Intimate"]
  },
  {
    keywords: ["casual", "everyday", "daily"],
    targets: ["Casual"]
  },
  {
    keywords: ["club", "party", "loud"],
    targets: ["Clubbing"]
  }
];

const DERIVED_SIGNAL_WEIGHTS = {
  families: 12,
  notes: 6,
  accords: 8
};

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeList(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(values.map((value) => normalizeText(value)).filter(Boolean))];
}

function extractDescriptionKeywords(text) {
  const lowered = normalizeText(text);
  return Object.keys(KEYWORD_FAMILY_MAP).filter((keyword) => lowered.includes(keyword));
}

function normalizeDerivedScentProfile(derivedProfile) {
  const safeProfile = derivedProfile && typeof derivedProfile === "object" ? derivedProfile : {};

  return {
    families: normalizeList(safeProfile.families),
    notes: normalizeList(safeProfile.notes),
    accords: normalizeList(safeProfile.accords)
  };
}

function scoreFragrance(fragrance, preferences) {
  let score = 100;

  const fragranceFamilies = new Set(normalizeList(fragrance.noteFamilies));
  const fragranceAccords = new Set(normalizeList(fragrance.accordTags));
  const fragranceOccasions = new Set(normalizeList(fragrance.occasionTags));
  const fragranceSeasons = new Set(normalizeList(fragrance.seasonTags));
  const fragranceNotes = [
    ...(fragrance.notes.top || []),
    ...(fragrance.notes.heart || []),
    ...(fragrance.notes.base || [])
  ];
  const normalizedNotes = fragranceNotes.map((note) => normalizeText(note));
  const explicitFamilies = new Set(preferences.noteFamilies);
  const explicitNotes = new Set(preferences.selectedNotes);
  const explicitAccords = new Set(preferences.accordTags);

  if (Number.isFinite(preferences.budget) && Number.isFinite(fragrance.priceTier)) {
    if (fragrance.priceTier === preferences.budget) {
      score += 15;
    } else if (fragrance.priceTier < preferences.budget) {
      score += 5;
    } else {
      score -= 30;
    }
  }

  preferences.noteFamilies.forEach((family) => {
    if (fragranceFamilies.has(family)) {
      score += 30;
    }
  });

  preferences.selectedNotes.forEach((selectedNote) => {
    if (normalizedNotes.includes(selectedNote)) {
      score += 15;
    }
  });

  preferences.accordTags.forEach((accord) => {
    if (fragranceAccords.has(accord)) {
      score += 20;
    }
  });

  preferences.derivedProfile.scent.families.forEach((family) => {
    if (!explicitFamilies.has(family) && fragranceFamilies.has(family)) {
      score += DERIVED_SIGNAL_WEIGHTS.families;
    }
  });

  preferences.derivedProfile.scent.notes.forEach((note) => {
    if (!explicitNotes.has(note) && normalizedNotes.includes(note)) {
      score += DERIVED_SIGNAL_WEIGHTS.notes;
    }
  });

  preferences.derivedProfile.scent.accords.forEach((accord) => {
    if (!explicitAccords.has(accord) && fragranceAccords.has(accord)) {
      score += DERIVED_SIGNAL_WEIGHTS.accords;
    }
  });

  preferences.occasions.forEach((occasion) => {
    if (fragranceOccasions.has(occasion)) {
      score += 25;
    }
  });

  preferences.climates.forEach((climate) => {
    const mappedSeasons = CLIMATE_TO_SEASONS[climate] || [];
    mappedSeasons.forEach((season) => {
      if (fragranceSeasons.has(normalizeText(season))) {
        score += 20;
      }
    });

    if (fragranceSeasons.has(normalizeText("All-year Signature"))) {
      score += 10;
    }
  });

  if (
    Number.isFinite(preferences.performance)
    && Number.isFinite(fragrance.longevityScore)
    && Number.isFinite(fragrance.sillageScore)
  ) {
    const fragrancePower = ((fragrance.longevityScore + fragrance.sillageScore) / 2) * 10;
    const difference = Math.abs(preferences.performance - fragrancePower);

    if (difference <= 15) {
      score += 20;
    } else if (difference <= 30) {
      score += 10;
    } else if (difference > 50) {
      score -= 30;
    }
  }

  const scentKeywords = extractDescriptionKeywords(preferences.scentDescription);
  scentKeywords.forEach((keyword) => {
    if (normalizedNotes.some((note) => note.includes(keyword))) {
      score += 10;
    }

    const mappedFamilies = KEYWORD_FAMILY_MAP[keyword] || [];
    mappedFamilies.forEach((family) => {
      if (fragranceFamilies.has(family)) {
        score += 8;
      }
    });
  });

  const usageDescription = normalizeText(preferences.usageDescription);
  if (usageDescription) {
    USAGE_MATCHERS.forEach((matcher) => {
      const hasKeyword = matcher.keywords.some((keyword) => usageDescription.includes(keyword));
      const hasOccasionMatch = matcher.targets.some((target) => fragranceOccasions.has(normalizeText(target)));

      if (hasKeyword && hasOccasionMatch) {
        score += 15;
      }
    });
  }

  return {
    ...fragrance,
    matchScore: Math.round(score)
  };
}

router.post("/", authOptional, (req, res) => {
  try {
    if (!ensureDatabaseSeeded(res)) {
      return;
    }

    const preferences = {
      favorites: Array.isArray(req.body.favorites) ? req.body.favorites.filter(Boolean) : [],
      noteFamilies: normalizeList(req.body.noteFamilies),
      accordTags: normalizeList(req.body.accordTags),
      occasions: normalizeList(req.body.occasions),
      climates: Array.isArray(req.body.climates) ? req.body.climates.filter(Boolean) : [],
      budget: Number.isFinite(Number(req.body.budget)) ? Number.parseInt(req.body.budget, 10) : null,
      performance: Number.isFinite(Number(req.body.performance)) ? Number.parseInt(req.body.performance, 10) : null,
      selectedNotes: normalizeList(req.body.selectedNotes),
      scentDescription: req.body.scentDescription || "",
      usageDescription: req.body.usageDescription || "",
      derivedProfile: {
        scent: normalizeDerivedScentProfile(
          req.body && req.body.derivedProfile && req.body.derivedProfile.scent
        )
      }
    };

    const fragranceIds = db.prepare("SELECT id FROM fragrances").all().map((row) => row.id);
    const fragrances = getFullFragrancesByIds(fragranceIds);
    const rankedFragrances = fragrances
      .map((fragrance) => scoreFragrance(fragrance, preferences))
      .sort((left, right) => right.matchScore - left.matchScore)
      .slice(0, 5);

    if (req.authenticatedUser) {
      upsertUserState(req.authenticatedUser.id, {
        latestProfile: sanitizeLatestProfile({
          favorites: preferences.favorites,
          scentDescription: preferences.scentDescription,
          usageDescription: preferences.usageDescription,
          selectedFamilies: preferences.noteFamilies,
          selectedNotes: preferences.selectedNotes,
          selectedAccords: preferences.accordTags,
          occasions: preferences.occasions,
          climates: preferences.climates,
          performance: preferences.performance,
          budget: preferences.budget
        }),
        latestRecommendationIds: rankedFragrances.map((fragrance) => fragrance.id)
      });
    }

    res.json(rankedFragrances);
  } catch (error) {
    console.error("Failed to recommend fragrances:", error);
    res.status(500).json({ error: "Failed to recommend fragrances" });
  }
});

module.exports = router;
