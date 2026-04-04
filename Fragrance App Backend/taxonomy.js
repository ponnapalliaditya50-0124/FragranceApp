const SCENT_FAMILIES = [
  {
    id: "woody",
    label: "Woody",
    notes: ["Cedar", "Sandalwood", "Oud", "Vetiver", "Birch", "Patchouli", "Oakmoss", "Rosewood"]
  },
  {
    id: "citrus",
    label: "Citrus",
    notes: ["Bergamot", "Lemon", "Grapefruit", "Lime", "Neroli", "Orange"]
  },
  {
    id: "floral",
    label: "Floral",
    notes: ["Rose", "Jasmine", "Iris", "Violet", "Peony", "Geranium", "Lavender"]
  },
  {
    id: "spicy",
    label: "Spicy",
    notes: ["Cardamom", "Cinnamon", "Pepper", "Nutmeg", "Saffron", "Clove", "Pink Pepper"]
  },
  {
    id: "sweet",
    label: "Sweet & Gourmand",
    notes: ["Vanilla", "Tonka Bean", "Caramel", "Rum", "Chocolate", "Honey"]
  },
  {
    id: "fresh",
    label: "Fresh & Aquatic",
    notes: ["Sea Notes", "Mint", "Green Leaves", "Apple", "Cucumber", "Juniper"]
  },
  {
    id: "leather",
    label: "Leather & Tobacco",
    notes: ["Leather", "Tobacco Leaf", "Smoke", "Suede", "Birch Tar"]
  },
  {
    id: "amber",
    label: "Amber & Resin",
    notes: ["Amber", "Incense", "Benzoin", "Myrrh", "Fir Resin", "Styrax"]
  },
  {
    id: "animalic",
    label: "Animalic & Musk",
    notes: ["Musk", "Civet", "Castoreum", "Ambrette", "Ambergris", "Ambroxan"]
  }
];

const ACCORD_PALETTE = [
  { label: "Oriental" },
  { label: "Chypre" },
  { label: "Fougère" },
  { label: "Aromatic" },
  { label: "Aquatic" },
  { label: "Gourmand" },
  { label: "Fresh Clean" },
  { label: "Dark & Smoky" },
  { label: "Powdery" },
  { label: "Earthy" }
];

const OCCASION_OPTIONS = [
  "Office",
  "Casual",
  "Date Night",
  "Clubbing",
  "Intimate",
  "Formal/Event",
  "Gym/Active",
  "Bedtime/Relaxing",
  "Vacation/Holiday",
  "Everyday/Signature"
];

const CLIMATE_OPTIONS = [
  "Hot & Humid",
  "Dry & Desert",
  "Temperate",
  "Cold & Crisp",
  "Tropical"
];

const CANDIDATE_CONFIDENCE_LEVELS = ["high", "medium", "low"];
const FAMILY_IDS = SCENT_FAMILIES.map((family) => family.id);
const NOTE_OPTIONS = [...new Set(SCENT_FAMILIES.flatMap((family) => family.notes))];
const ACCORD_OPTIONS = ACCORD_PALETTE.map((accord) => accord.label);

function normalizeTaxonomyText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const NOTE_TO_FAMILY_ID = new Map();
SCENT_FAMILIES.forEach((family) => {
  family.notes.forEach((note) => {
    NOTE_TO_FAMILY_ID.set(note, family.id);
  });
});

const NOTE_BY_NORMALIZED = new Map(
  NOTE_OPTIONS.map((note) => [normalizeTaxonomyText(note), note])
);
const FAMILY_BY_NORMALIZED = new Map(
  SCENT_FAMILIES.flatMap((family) => [
    [normalizeTaxonomyText(family.id), family.id],
    [normalizeTaxonomyText(family.label), family.id]
  ])
);
const ACCORD_BY_NORMALIZED = new Map(
  ACCORD_OPTIONS.map((accord) => [normalizeTaxonomyText(accord), accord])
);

const ALLOWED_VALUES = {
  scent: {
    families: FAMILY_IDS,
    notes: NOTE_OPTIONS,
    accords: ACCORD_OPTIONS
  },
  usage: {
    occasions: OCCASION_OPTIONS,
    climates: CLIMATE_OPTIONS
  }
};

const ALLOWED_VALUE_SETS = {
  scent: {
    families: new Set(ALLOWED_VALUES.scent.families),
    notes: new Set(ALLOWED_VALUES.scent.notes),
    accords: new Set(ALLOWED_VALUES.scent.accords)
  },
  usage: {
    occasions: new Set(ALLOWED_VALUES.usage.occasions),
    climates: new Set(ALLOWED_VALUES.usage.climates)
  }
};

function sanitizeSummary(value) {
  return String(value || "").trim().slice(0, 180);
}

function sanitizeAllowedList(values, allowedSet) {
  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(values.filter((value) => allowedSet.has(value)))];
}

function getConfidenceRank(value) {
  if (value === "high") return 3;
  if (value === "medium") return 2;
  return 1;
}

function sanitizeReasons(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(
    values
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .slice(0, 3)
  )];
}

function sanitizeCandidateItems(values, allowedSet) {
  if (!Array.isArray(values)) {
    return [];
  }

  const mergedByValue = new Map();

  values.forEach((candidate) => {
    const safeCandidate = candidate && typeof candidate === "object" ? candidate : {};
    const value = safeCandidate.value;

    if (!allowedSet.has(value)) {
      return;
    }

    const confidence = CANDIDATE_CONFIDENCE_LEVELS.includes(safeCandidate.confidence)
      ? safeCandidate.confidence
      : "low";
    const reasons = sanitizeReasons(safeCandidate.reasons);
    const existing = mergedByValue.get(value);

    if (!existing) {
      mergedByValue.set(value, { value, confidence, reasons });
      return;
    }

    const nextConfidence = getConfidenceRank(confidence) > getConfidenceRank(existing.confidence)
      ? confidence
      : existing.confidence;
    const nextReasons = sanitizeReasons([...existing.reasons, ...reasons]);

    mergedByValue.set(value, {
      value,
      confidence: nextConfidence,
      reasons: nextReasons
    });
  });

  return [...mergedByValue.values()];
}

function sanitizeUsageInterpretation(payload) {
  const safePayload = payload && typeof payload === "object" ? payload : {};

  return {
    summary: sanitizeSummary(safePayload.summary),
    source: String(safePayload.source || "llm").trim() || "llm",
    occasions: sanitizeAllowedList(safePayload.occasions, ALLOWED_VALUE_SETS.usage.occasions),
    climates: sanitizeAllowedList(safePayload.climates, ALLOWED_VALUE_SETS.usage.climates)
  };
}

function sanitizeScentCandidateResponse(payload) {
  const safePayload = payload && typeof payload === "object" ? payload : {};
  const safeCandidates = safePayload.candidates && typeof safePayload.candidates === "object"
    ? safePayload.candidates
    : {};

  return {
    summary: sanitizeSummary(safePayload.summary),
    candidates: {
      families: sanitizeCandidateItems(safeCandidates.families, ALLOWED_VALUE_SETS.scent.families),
      notes: sanitizeCandidateItems(safeCandidates.notes, ALLOWED_VALUE_SETS.scent.notes),
      accords: sanitizeCandidateItems(safeCandidates.accords, ALLOWED_VALUE_SETS.scent.accords)
    }
  };
}

function getUsageInterpretationResponseFormat() {
  return {
    type: "json_schema",
    name: "usage_intent_interpretation",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: {
          type: "string",
          description: "A short summary of the user's intended usage context."
        },
        occasions: {
          type: "array",
          items: {
            type: "string",
            enum: ALLOWED_VALUES.usage.occasions
          }
        },
        climates: {
          type: "array",
          items: {
            type: "string",
            enum: ALLOWED_VALUES.usage.climates
          }
        }
      },
      required: ["summary", "occasions", "climates"]
    }
  };
}

function getScentDisambiguationResponseFormat() {
  return {
    type: "json_schema",
    name: "scent_profile_disambiguation",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: {
          type: "string",
          description: "A short summary of the user's scent profile."
        },
        candidates: {
          type: "object",
          additionalProperties: false,
          properties: {
            families: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  value: {
                    type: "string",
                    enum: ALLOWED_VALUES.scent.families
                  },
                  confidence: {
                    type: "string",
                    enum: CANDIDATE_CONFIDENCE_LEVELS
                  },
                  reasons: {
                    type: "array",
                    items: {
                      type: "string"
                    }
                  }
                },
                required: ["value", "confidence", "reasons"]
              }
            },
            notes: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  value: {
                    type: "string",
                    enum: ALLOWED_VALUES.scent.notes
                  },
                  confidence: {
                    type: "string",
                    enum: CANDIDATE_CONFIDENCE_LEVELS
                  },
                  reasons: {
                    type: "array",
                    items: {
                      type: "string"
                    }
                  }
                },
                required: ["value", "confidence", "reasons"]
              }
            },
            accords: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  value: {
                    type: "string",
                    enum: ALLOWED_VALUES.scent.accords
                  },
                  confidence: {
                    type: "string",
                    enum: CANDIDATE_CONFIDENCE_LEVELS
                  },
                  reasons: {
                    type: "array",
                    items: {
                      type: "string"
                    }
                  }
                },
                required: ["value", "confidence", "reasons"]
              }
            }
          },
          required: ["families", "notes", "accords"]
        }
      },
      required: ["summary", "candidates"]
    }
  };
}

module.exports = {
  ACCORD_BY_NORMALIZED,
  ACCORD_OPTIONS,
  ACCORD_PALETTE,
  ALLOWED_VALUES,
  CLIMATE_OPTIONS,
  CANDIDATE_CONFIDENCE_LEVELS,
  FAMILY_BY_NORMALIZED,
  FAMILY_IDS,
  NOTE_BY_NORMALIZED,
  NOTE_OPTIONS,
  NOTE_TO_FAMILY_ID,
  OCCASION_OPTIONS,
  SCENT_FAMILIES,
  getConfidenceRank,
  getScentDisambiguationResponseFormat,
  getUsageInterpretationResponseFormat,
  normalizeTaxonomyText,
  sanitizeScentCandidateResponse,
  sanitizeSummary,
  sanitizeUsageInterpretation
};
