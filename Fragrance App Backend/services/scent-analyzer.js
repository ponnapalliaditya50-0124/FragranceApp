const {
  ACCORD_OPTIONS,
  CANDIDATE_CONFIDENCE_LEVELS,
  FAMILY_IDS,
  NOTE_OPTIONS,
  NOTE_TO_FAMILY_ID,
  SCENT_FAMILIES,
  getConfidenceRank,
  normalizeTaxonomyText,
  sanitizeScentCandidateResponse,
  sanitizeSummary
} = require("../taxonomy");
const { OpenAiServiceError, createScentDisambiguation } = require("./openai");

const FAMILY_LABELS = new Map(SCENT_FAMILIES.map((family) => [family.id, family.label]));
const DIRECT_FAMILY_RULES = {
  woody: [{ group: "families", value: "woody", weight: 14 }, { group: "accords", value: "Earthy", weight: 5 }],
  woods: [{ group: "families", value: "woody", weight: 12 }, { group: "accords", value: "Earthy", weight: 5 }],
  forest: [{ group: "families", value: "woody", weight: 12 }, { group: "accords", value: "Earthy", weight: 7 }],
  floral: [{ group: "families", value: "floral", weight: 14 }],
  citrus: [{ group: "families", value: "citrus", weight: 14 }],
  citrusy: [{ group: "families", value: "citrus", weight: 12 }],
  fresh: [{ group: "families", value: "fresh", weight: 14 }, { group: "accords", value: "Fresh Clean", weight: 6 }],
  clean: [{ group: "families", value: "fresh", weight: 12 }, { group: "accords", value: "Fresh Clean", weight: 10 }],
  aquatic: [{ group: "families", value: "fresh", weight: 12 }, { group: "accords", value: "Aquatic", weight: 12 }],
  watery: [{ group: "families", value: "fresh", weight: 8 }, { group: "accords", value: "Aquatic", weight: 10 }],
  sweet: [{ group: "families", value: "sweet", weight: 14 }, { group: "accords", value: "Gourmand", weight: 7 }],
  gourmand: [{ group: "families", value: "sweet", weight: 12 }, { group: "accords", value: "Gourmand", weight: 14 }],
  spicy: [{ group: "families", value: "spicy", weight: 14 }],
  smoky: [{ group: "families", value: "leather", weight: 10 }, { group: "families", value: "amber", weight: 10 }, { group: "accords", value: "Dark & Smoky", weight: 14 }],
  smokey: [{ group: "families", value: "leather", weight: 10 }, { group: "families", value: "amber", weight: 10 }, { group: "accords", value: "Dark & Smoky", weight: 14 }],
  smoke: [{ group: "notes", value: "Smoke", weight: 14 }, { group: "accords", value: "Dark & Smoky", weight: 10 }],
  leather: [{ group: "families", value: "leather", weight: 14 }, { group: "notes", value: "Leather", weight: 10 }],
  leathery: [{ group: "families", value: "leather", weight: 12 }, { group: "notes", value: "Leather", weight: 8 }],
  tobacco: [{ group: "families", value: "leather", weight: 9 }, { group: "notes", value: "Tobacco Leaf", weight: 14 }, { group: "accords", value: "Dark & Smoky", weight: 6 }],
  tobaccoy: [{ group: "notes", value: "Tobacco Leaf", weight: 12 }, { group: "families", value: "leather", weight: 8 }],
  amber: [{ group: "families", value: "amber", weight: 14 }, { group: "notes", value: "Amber", weight: 12 }, { group: "accords", value: "Oriental", weight: 7 }],
  ambery: [{ group: "families", value: "amber", weight: 12 }, { group: "notes", value: "Amber", weight: 10 }, { group: "accords", value: "Oriental", weight: 7 }],
  resinous: [{ group: "families", value: "amber", weight: 10 }, { group: "notes", value: "Incense", weight: 7 }],
  powdery: [{ group: "accords", value: "Powdery", weight: 14 }, { group: "families", value: "floral", weight: 6 }, { group: "families", value: "sweet", weight: 4 }],
  earthy: [{ group: "accords", value: "Earthy", weight: 14 }, { group: "families", value: "woody", weight: 9 }],
  mossy: [{ group: "notes", value: "Oakmoss", weight: 10 }, { group: "accords", value: "Earthy", weight: 9 }, { group: "accords", value: "Chypre", weight: 6 }],
  aromatic: [{ group: "accords", value: "Aromatic", weight: 14 }, { group: "accords", value: "Fougère", weight: 6 }],
  barbershop: [{ group: "accords", value: "Fougère", weight: 14 }, { group: "accords", value: "Aromatic", weight: 10 }, { group: "notes", value: "Lavender", weight: 9 }],
  musky: [{ group: "families", value: "animalic", weight: 10 }, { group: "notes", value: "Musk", weight: 12 }],
  vanillic: [{ group: "notes", value: "Vanilla", weight: 14 }, { group: "families", value: "sweet", weight: 10 }, { group: "accords", value: "Gourmand", weight: 7 }],
  beachy: [{ group: "notes", value: "Sea Notes", weight: 10 }, { group: "accords", value: "Aquatic", weight: 12 }, { group: "families", value: "fresh", weight: 8 }],
  marine: [{ group: "notes", value: "Sea Notes", weight: 10 }, { group: "accords", value: "Aquatic", weight: 12 }, { group: "families", value: "fresh", weight: 8 }],
  oceanic: [{ group: "notes", value: "Sea Notes", weight: 10 }, { group: "accords", value: "Aquatic", weight: 12 }, { group: "families", value: "fresh", weight: 8 }],
  salty: [{ group: "notes", value: "Sea Notes", weight: 7 }, { group: "accords", value: "Aquatic", weight: 10 }],
  rain: [{ group: "accords", value: "Earthy", weight: 7 }, { group: "families", value: "fresh", weight: 5 }],
  rainy: [{ group: "accords", value: "Earthy", weight: 9 }, { group: "families", value: "fresh", weight: 5 }],
  warm: [{ group: "families", value: "amber", weight: 10 }, { group: "families", value: "spicy", weight: 8 }],
  cozy: [{ group: "families", value: "amber", weight: 10 }, { group: "families", value: "sweet", weight: 7 }, { group: "accords", value: "Gourmand", weight: 4 }],
  dark: [{ group: "families", value: "amber", weight: 8 }, { group: "families", value: "leather", weight: 8 }, { group: "accords", value: "Dark & Smoky", weight: 9 }]
};

const MULTI_WORD_MOTIFS = [
  {
    phrase: "clean laundry",
    rules: [
      { group: "families", value: "fresh", weight: 14 },
      { group: "accords", value: "Fresh Clean", weight: 16 }
    ]
  },
  {
    phrase: "out of the shower",
    rules: [
      { group: "families", value: "fresh", weight: 16 },
      { group: "accords", value: "Fresh Clean", weight: 18 }
    ]
  },
  {
    phrase: "just showered",
    rules: [
      { group: "families", value: "fresh", weight: 14 },
      { group: "accords", value: "Fresh Clean", weight: 16 }
    ]
  },
  {
    phrase: "after rain",
    rules: [
      { group: "accords", value: "Earthy", weight: 14 },
      { group: "families", value: "woody", weight: 8 },
      { group: "families", value: "fresh", weight: 7 }
    ]
  },
  {
    phrase: "rainy walk through the woods",
    rules: [
      { group: "accords", value: "Earthy", weight: 18 },
      { group: "families", value: "woody", weight: 16 },
      { group: "families", value: "fresh", weight: 6 }
    ]
  },
  {
    phrase: "walk through the woods",
    rules: [
      { group: "families", value: "woody", weight: 16 },
      { group: "accords", value: "Earthy", weight: 14 }
    ]
  },
  {
    phrase: "cedar forest",
    rules: [
      { group: "notes", value: "Cedar", weight: 18 },
      { group: "families", value: "woody", weight: 18 },
      { group: "accords", value: "Earthy", weight: 12 }
    ]
  },
  {
    phrase: "smoky fireplace",
    rules: [
      { group: "notes", value: "Smoke", weight: 18 },
      { group: "families", value: "amber", weight: 12 },
      { group: "families", value: "leather", weight: 10 },
      { group: "accords", value: "Dark & Smoky", weight: 18 }
    ]
  },
  {
    phrase: "by the fire",
    rules: [
      { group: "notes", value: "Smoke", weight: 10 },
      { group: "families", value: "amber", weight: 10 },
      { group: "accords", value: "Dark & Smoky", weight: 14 }
    ]
  },
  {
    phrase: "salty ocean air",
    rules: [
      { group: "notes", value: "Sea Notes", weight: 16 },
      { group: "families", value: "fresh", weight: 12 },
      { group: "accords", value: "Aquatic", weight: 18 }
    ]
  },
  {
    phrase: "ocean air",
    rules: [
      { group: "notes", value: "Sea Notes", weight: 14 },
      { group: "families", value: "fresh", weight: 10 },
      { group: "accords", value: "Aquatic", weight: 16 }
    ]
  },
  {
    phrase: "beach vacation",
    rules: [
      { group: "notes", value: "Sea Notes", weight: 10 },
      { group: "families", value: "fresh", weight: 10 },
      { group: "accords", value: "Aquatic", weight: 12 }
    ]
  },
  {
    phrase: "dessert like",
    rules: [
      { group: "families", value: "sweet", weight: 14 },
      { group: "accords", value: "Gourmand", weight: 16 },
      { group: "notes", value: "Vanilla", weight: 8 }
    ]
  },
  {
    phrase: "fresh out of the shower",
    rules: [
      { group: "families", value: "fresh", weight: 18 },
      { group: "accords", value: "Fresh Clean", weight: 20 }
    ]
  }
];

const DESCRIPTOR_TARGETS = {
  sweet: [{ group: "families", value: "sweet" }, { group: "accords", value: "Gourmand" }],
  floral: [{ group: "families", value: "floral" }],
  citrus: [{ group: "families", value: "citrus" }],
  citrusy: [{ group: "families", value: "citrus" }],
  woody: [{ group: "families", value: "woody" }, { group: "accords", value: "Earthy" }],
  woods: [{ group: "families", value: "woody" }, { group: "accords", value: "Earthy" }],
  fresh: [{ group: "families", value: "fresh" }, { group: "accords", value: "Fresh Clean" }],
  clean: [{ group: "families", value: "fresh" }, { group: "accords", value: "Fresh Clean" }],
  smoky: [{ group: "families", value: "leather" }, { group: "families", value: "amber" }, { group: "accords", value: "Dark & Smoky" }],
  smoke: [{ group: "notes", value: "Smoke" }, { group: "accords", value: "Dark & Smoky" }],
  tobacco: [{ group: "notes", value: "Tobacco Leaf" }, { group: "families", value: "leather" }],
  vanilla: [{ group: "notes", value: "Vanilla" }, { group: "families", value: "sweet" }, { group: "accords", value: "Gourmand" }],
  floraly: [{ group: "families", value: "floral" }],
  aquatic: [{ group: "accords", value: "Aquatic" }, { group: "families", value: "fresh" }],
  earthy: [{ group: "accords", value: "Earthy" }, { group: "families", value: "woody" }],
  powdery: [{ group: "accords", value: "Powdery" }],
  leather: [{ group: "families", value: "leather" }, { group: "notes", value: "Leather" }],
  amber: [{ group: "families", value: "amber" }, { group: "notes", value: "Amber" }]
};

function createEmptyCandidateGroups() {
  return {
    families: [],
    notes: [],
    accords: []
  };
}

function createAccumulator() {
  return {
    families: new Map(),
    notes: new Map(),
    accords: new Map()
  };
}

function addCandidate(accumulator, group, value, weight, reason) {
  if (!value || !weight) {
    return;
  }

  const bucket = accumulator[group];
  const existing = bucket.get(value) || { score: 0, reasons: new Set() };

  existing.score += weight;

  if (reason) {
    existing.reasons.add(reason);
  }

  bucket.set(value, existing);
}

function applyRules(accumulator, rules, reason) {
  rules.forEach((rule) => {
    addCandidate(accumulator, rule.group, rule.value, rule.weight, reason);

    if (rule.group === "notes") {
      const familyId = NOTE_TO_FAMILY_ID.get(rule.value);

      if (familyId) {
        addCandidate(accumulator, "families", familyId, Math.max(3, Math.round(rule.weight * 0.45)), reason);
      }
    }
  });
}

function collectNgrams(tokens) {
  const ngrams = new Set();

  for (let startIndex = 0; startIndex < tokens.length; startIndex += 1) {
    for (let width = 1; width <= 4; width += 1) {
      const slice = tokens.slice(startIndex, startIndex + width);

      if (slice.length !== width) {
        continue;
      }

      ngrams.add(slice.join(" "));
    }
  }

  return ngrams;
}

function detectNegations(accumulator, normalizedText) {
  const strongNegationPattern = /\b(?:not|no|without)\s+([a-z]+(?:\s+[a-z]+){0,1})\b/g;
  const softNegationPattern = /\b(?:less)\s+([a-z]+(?:\s+[a-z]+){0,1})\b/g;
  const moreThanPattern = /\bmore\s+([a-z]+)\s+than\s+([a-z]+)\b/g;
  let match = null;

  while ((match = strongNegationPattern.exec(normalizedText))) {
    const descriptor = normalizeTaxonomyText(match[1]);
    const targets = DESCRIPTOR_TARGETS[descriptor] || [];

    targets.forEach((target) => {
      addCandidate(accumulator, target.group, target.value, -18, `not ${descriptor}`);
    });
  }

  while ((match = softNegationPattern.exec(normalizedText))) {
    const descriptor = normalizeTaxonomyText(match[1]);
    const targets = DESCRIPTOR_TARGETS[descriptor] || [];

    targets.forEach((target) => {
      addCandidate(accumulator, target.group, target.value, -10, `less ${descriptor}`);
    });
  }

  while ((match = moreThanPattern.exec(normalizedText))) {
    const strongerDescriptor = normalizeTaxonomyText(match[1]);
    const weakerDescriptor = normalizeTaxonomyText(match[2]);
    const strongerTargets = DESCRIPTOR_TARGETS[strongerDescriptor] || [];
    const weakerTargets = DESCRIPTOR_TARGETS[weakerDescriptor] || [];

    strongerTargets.forEach((target) => {
      addCandidate(accumulator, target.group, target.value, 8, `more ${strongerDescriptor} than ${weakerDescriptor}`);
    });
    weakerTargets.forEach((target) => {
      addCandidate(accumulator, target.group, target.value, -12, `more ${strongerDescriptor} than ${weakerDescriptor}`);
    });
  }
}

function deriveAccords(accumulator) {
  const familyScores = Object.fromEntries(
    FAMILY_IDS.map((familyId) => [familyId, accumulator.families.get(familyId)?.score || 0])
  );
  const noteScores = Object.fromEntries(
    NOTE_OPTIONS.map((note) => [note, accumulator.notes.get(note)?.score || 0])
  );

  if (familyScores.sweet >= 10 || noteScores.Vanilla >= 10 || noteScores.Caramel >= 9 || noteScores.Honey >= 9) {
    addCandidate(accumulator, "accords", "Gourmand", 8, "sweet edible cues");
  }

  if (familyScores.fresh >= 12 && (noteScores["Sea Notes"] >= 8 || accumulator.accords.get("Aquatic")?.score >= 8)) {
    addCandidate(accumulator, "accords", "Aquatic", 6, "marine fresh cues");
  }

  if (familyScores.fresh >= 12 && familyScores.citrus <= 8) {
    addCandidate(accumulator, "accords", "Fresh Clean", 6, "clean fresh profile");
  }

  if ((noteScores.Smoke >= 10 || familyScores.leather >= 10) && familyScores.amber >= 8) {
    addCandidate(accumulator, "accords", "Dark & Smoky", 8, "smoke + warm depth");
  }

  if (familyScores.woody >= 12 && (noteScores.Oakmoss >= 6 || accumulator.accords.get("Earthy")?.score >= 8)) {
    addCandidate(accumulator, "accords", "Earthy", 6, "woody earth cues");
  }

  if ((noteScores.Lavender >= 8 || noteScores.Mint >= 8) && familyScores.fresh >= 8) {
    addCandidate(accumulator, "accords", "Aromatic", 6, "aromatic herbal cues");
    addCandidate(accumulator, "accords", "Fougère", 4, "barbershop aromatic cues");
  }

  if (familyScores.amber >= 10 && (familyScores.spicy >= 8 || noteScores.Vanilla >= 8)) {
    addCandidate(accumulator, "accords", "Oriental", 7, "warm resinous spice");
  }

  if (familyScores.citrus >= 8 && noteScores.Oakmoss >= 6) {
    addCandidate(accumulator, "accords", "Chypre", 5, "citrus moss structure");
  }
}

function scoreToConfidence(score) {
  if (score >= 18) return "high";
  if (score >= 10) return "medium";
  return "low";
}

function mapAccumulatorToCandidates(accumulator) {
  return ["families", "notes", "accords"].reduce((result, group) => {
    result[group] = [...accumulator[group].entries()]
      .filter(([, candidate]) => candidate.score > 0)
      .sort((left, right) => right[1].score - left[1].score)
      .slice(0, group === "notes" ? 6 : 4)
      .map(([value, candidate]) => ({
        value,
        confidence: scoreToConfidence(candidate.score),
        reasons: [...candidate.reasons].slice(0, 3)
      }));
    return result;
  }, createEmptyCandidateGroups());
}

function countStrongCandidates(candidates) {
  return Object.values(candidates).reduce((count, groupCandidates) => (
    count + groupCandidates.filter((candidate) => candidate.confidence !== "low").length
  ), 0);
}

function combineConfidence(left, right) {
  const combinedRank = getConfidenceRank(left) + getConfidenceRank(right);

  if (combinedRank >= 5) return "high";
  if (combinedRank >= 3) return "medium";
  return "low";
}

function mergeCandidateGroups(primaryCandidates, secondaryCandidates) {
  const merged = createEmptyCandidateGroups();

  ["families", "notes", "accords"].forEach((group) => {
    const byValue = new Map();

    [...(primaryCandidates[group] || []), ...(secondaryCandidates[group] || [])].forEach((candidate) => {
      const existing = byValue.get(candidate.value);

      if (!existing) {
        byValue.set(candidate.value, {
          value: candidate.value,
          confidence: candidate.confidence,
          reasons: [...new Set(candidate.reasons || [])]
        });
        return;
      }

      byValue.set(candidate.value, {
        value: candidate.value,
        confidence: combineConfidence(existing.confidence, candidate.confidence),
        reasons: [...new Set([...(existing.reasons || []), ...(candidate.reasons || [])])].slice(0, 3)
      });
    });

    merged[group] = [...byValue.values()]
      .sort((left, right) => {
        const confidenceDifference = getConfidenceRank(right.confidence) - getConfidenceRank(left.confidence);

        if (confidenceDifference !== 0) {
          return confidenceDifference;
        }

        return left.value.localeCompare(right.value);
      })
      .slice(0, group === "notes" ? 6 : 4);
  });

  return merged;
}

function buildDerivedProfile(candidates) {
  return {
    families: (candidates.families || [])
      .filter((candidate) => candidate.confidence !== "low")
      .map((candidate) => candidate.value),
    notes: (candidates.notes || [])
      .filter((candidate) => candidate.confidence !== "low")
      .map((candidate) => candidate.value),
    accords: (candidates.accords || [])
      .filter((candidate) => candidate.confidence !== "low")
      .map((candidate) => candidate.value)
  };
}

function buildSummary(candidates) {
  const topFamily = candidates.families[0];
  const secondFamily = candidates.families[1];
  const topNote = candidates.notes[0];
  const topAccord = candidates.accords[0];

  if (!topFamily && !topNote && !topAccord) {
    return "";
  }

  const familyLabel = topFamily ? FAMILY_LABELS.get(topFamily.value) || topFamily.value : "";
  const secondFamilyLabel = secondFamily ? FAMILY_LABELS.get(secondFamily.value) || secondFamily.value : "";
  const accordLabel = topAccord ? topAccord.value : "";
  const noteLabel = topNote ? topNote.value : "";

  const summaryParts = [];

  if (familyLabel && secondFamilyLabel) {
    summaryParts.push(`${familyLabel.toLowerCase()} and ${secondFamilyLabel.toLowerCase()} leaning`);
  } else if (familyLabel) {
    summaryParts.push(`${familyLabel.toLowerCase()} leaning`);
  }

  if (noteLabel) {
    summaryParts.push(`anchored by ${noteLabel}`);
  }

  if (accordLabel) {
    summaryParts.push(`with ${accordLabel} facets`);
  }

  return sanitizeSummary(summaryParts.join(" "));
}

function shouldUseLlm(text, deterministicCandidates) {
  const normalizedText = normalizeTaxonomyText(text);
  const strongCandidateCount = countStrongCandidates(deterministicCandidates);
  const ambiguityDelta = deterministicCandidates.families.length >= 2
    ? Math.abs(
      getConfidenceRank(deterministicCandidates.families[0].confidence)
      - getConfidenceRank(deterministicCandidates.families[1].confidence)
    )
    : 3;
  const metaphorHint = /\b(?:like|reminds|feels|walk|memory|mood|vibe|through the woods|after rain|by the fire)\b/.test(normalizedText);

  return strongCandidateCount < 2 || ambiguityDelta === 0 || metaphorHint;
}

function summarizeDeterministicContext(text, deterministicCandidates) {
  return {
    text,
    deterministicCandidates,
    derivedProfile: buildDerivedProfile(deterministicCandidates)
  };
}

async function analyzeScentText(text) {
  const trimmedText = String(text || "").trim();
  const normalizedText = normalizeTaxonomyText(trimmedText);

  if (!normalizedText) {
    return {
      summary: "",
      source: "rules",
      candidates: createEmptyCandidateGroups(),
      derivedProfile: buildDerivedProfile(createEmptyCandidateGroups())
    };
  }

  const accumulator = createAccumulator();
  const tokens = normalizedText.split(" ").filter(Boolean);
  const ngrams = collectNgrams(tokens);

  NOTE_OPTIONS.forEach((note) => {
    const normalizedNote = normalizeTaxonomyText(note);

    if (!ngrams.has(normalizedNote)) {
      return;
    }

    applyRules(accumulator, [{ group: "notes", value: note, weight: 14 }], note.toLowerCase());
  });

  Object.entries(DIRECT_FAMILY_RULES).forEach(([term, rules]) => {
    if (!ngrams.has(term)) {
      return;
    }

    applyRules(accumulator, rules, term);
  });

  MULTI_WORD_MOTIFS.forEach((motif) => {
    if (!normalizedText.includes(motif.phrase)) {
      return;
    }

    applyRules(accumulator, motif.rules, motif.phrase);
  });

  detectNegations(accumulator, normalizedText);
  deriveAccords(accumulator);

  const deterministicCandidates = mapAccumulatorToCandidates(accumulator);
  const deterministicSummary = buildSummary(deterministicCandidates);
  let finalCandidates = deterministicCandidates;
  let finalSummary = deterministicSummary;
  let source = "rules";

  if (shouldUseLlm(trimmedText, deterministicCandidates)) {
    try {
      const llmResponse = await createScentDisambiguation(
        summarizeDeterministicContext(trimmedText, deterministicCandidates)
      );
      const llmCandidates = sanitizeScentCandidateResponse(llmResponse).candidates;
      const hasDeterministicCandidates = countStrongCandidates(deterministicCandidates) > 0;
      const hasLlmCandidates = countStrongCandidates(llmCandidates) > 0;

      if (hasLlmCandidates) {
        finalCandidates = hasDeterministicCandidates
          ? mergeCandidateGroups(deterministicCandidates, llmCandidates)
          : llmCandidates;
        finalSummary = sanitizeSummary(llmResponse.summary) || deterministicSummary || buildSummary(finalCandidates);
        source = hasDeterministicCandidates ? "mixed" : "llm";
      }
    } catch (error) {
      if (error instanceof OpenAiServiceError) {
        console.info(`[scent-analyzer] LLM fallback unavailable (${error.code}); using rules only.`);
      } else {
        console.warn("[scent-analyzer] Unexpected LLM error; using rules only.", error);
      }
    }
  }

  if (!finalSummary) {
    finalSummary = buildSummary(finalCandidates);
  }

  const result = {
    summary: finalSummary,
    source,
    candidates: finalCandidates,
    derivedProfile: buildDerivedProfile(finalCandidates)
  };

  console.info(
    `[scent-analyzer] source=${result.source} strong_candidates=${countStrongCandidates(result.candidates)} summary="${result.summary || "none"}"`
  );

  return result;
}

module.exports = {
  analyzeScentText,
  buildDerivedProfile,
  createEmptyCandidateGroups,
  mergeCandidateGroups
};
