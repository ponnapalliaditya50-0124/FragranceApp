const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildTranscriptionResult,
  cleanTranscriptText,
  evaluateTranscriptQuality
} = require("../services/transcription");

test("cleanTranscriptText collapses repeated consecutive words and short ngrams", () => {
  assert.equal(
    cleanTranscriptText("woody woody woody vanilla"),
    "woody vanilla"
  );
  assert.equal(
    cleanTranscriptText("clean out of the shower clean out of the shower"),
    "clean out of the shower"
  );
});

test("evaluateTranscriptQuality flags long recordings with only a few surviving words", () => {
  const result = evaluateTranscriptQuality({
    rawText: "cedar",
    cleanedText: "cedar",
    durationMs: 8500
  });

  assert.equal(result.quality, "retry");
  assert.equal(result.retryReason, "partial_capture");
});

test("buildTranscriptionResult flags repetition-dominated transcripts for retry", () => {
  const result = buildTranscriptionResult("woody woody woody woody vanilla", {
    durationMs: 4200
  });

  assert.equal(result.quality, "retry");
  assert.equal(result.retryReason, "repetition");
  assert.equal(result.text, "woody vanilla");
});

test("buildTranscriptionResult accepts clean fragrance phrases", () => {
  const result = buildTranscriptionResult("clean out of the shower", {
    durationMs: 2100
  });

  assert.equal(result.quality, "ok");
  assert.equal(result.retryReason, null);
  assert.equal(result.text, "clean out of the shower");
});
