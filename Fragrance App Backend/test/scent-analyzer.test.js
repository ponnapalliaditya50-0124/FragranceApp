const test = require("node:test");
const assert = require("node:assert/strict");

delete process.env.OPENAI_API_KEY;

const { analyzeScentText } = require("../services/scent-analyzer");

function findCandidate(group, value) {
  return (group || []).find((candidate) => candidate.value === value) || null;
}

function assertCandidateAtLeast(group, value, allowedConfidenceLevels) {
  const candidate = findCandidate(group, value);

  assert.ok(candidate, `Expected candidate "${value}" to be present.`);
  assert.ok(
    allowedConfidenceLevels.includes(candidate.confidence),
    `Expected "${value}" confidence to be one of ${allowedConfidenceLevels.join(", ")} but received ${candidate.confidence}.`
  );

  return candidate;
}

function assertAbsentOrLow(group, value) {
  const candidate = findCandidate(group, value);

  if (!candidate) {
    return;
  }

  assert.equal(candidate.confidence, "low", `Expected "${value}" to be absent or low confidence.`);
}

test("analyzeScentText maps smoky cedar language into woody and smoky cues", async () => {
  const result = await analyzeScentText("warm smoky cedar forest");

  assertCandidateAtLeast(result.candidates.families, "woody", ["high"]);
  assertCandidateAtLeast(result.candidates.notes, "Cedar", ["high", "medium"]);
  assert.ok(
    findCandidate(result.candidates.accords, "Dark & Smoky") || findCandidate(result.candidates.accords, "Earthy"),
    "Expected a smoky or earthy accord candidate."
  );
  assert.ok(result.summary.length > 0);
});

test("analyzeScentText boosts fresh clean and suppresses citrus when negated", async () => {
  const result = await analyzeScentText("clean out of the shower but not citrusy");

  assertCandidateAtLeast(result.candidates.families, "fresh", ["high"]);
  assertCandidateAtLeast(result.candidates.accords, "Fresh Clean", ["high", "medium"]);
  assertAbsentOrLow(result.candidates.families, "citrus");
});

test("analyzeScentText keeps vanilla and tobacco while suppressing floral", async () => {
  const result = await analyzeScentText("sweet vanilla tobacco but not floral");

  assertCandidateAtLeast(result.candidates.notes, "Vanilla", ["high", "medium"]);
  assertCandidateAtLeast(result.candidates.notes, "Tobacco Leaf", ["high", "medium"]);
  assert.ok(
    findCandidate(result.candidates.families, "sweet") || findCandidate(result.candidates.families, "leather"),
    "Expected sweet or leather family support."
  );
  assertAbsentOrLow(result.candidates.families, "floral");
});

test("analyzeScentText handles metaphor-heavy rainy woods language without OpenAI", async () => {
  const result = await analyzeScentText("like a rainy walk through the woods");

  assertCandidateAtLeast(result.candidates.families, "woody", ["high", "medium"]);
  assertCandidateAtLeast(result.candidates.accords, "Earthy", ["high", "medium"]);
  assert.ok(result.summary.length > 0);
});
