const express = require("express");
const { OpenAiServiceError, createUsageInterpretation } = require("../services/openai");
const { analyzeScentText, createEmptyCandidateGroups, buildDerivedProfile } = require("../services/scent-analyzer");

const router = express.Router();
const ALLOWED_KINDS = new Set(["scent", "usage"]);

function createEmptyInterpretationPayload(kind) {
  if (kind === "usage") {
    return {
      summary: "",
      source: "rules",
      occasions: [],
      climates: []
    };
  }

  const emptyCandidates = createEmptyCandidateGroups();

  return {
    summary: "",
    source: "rules",
    candidates: emptyCandidates,
    derivedProfile: buildDerivedProfile(emptyCandidates)
  };
}

router.post("/", async (req, res) => {
  try {
    const kind = String(req.body && req.body.kind ? req.body.kind : "").trim();
    const text = String(req.body && req.body.text ? req.body.text : "");

    if (!ALLOWED_KINDS.has(kind)) {
      res.status(400).json({ error: "Invalid interpretation kind.", code: "INVALID_KIND" });
      return;
    }

    if (!text.trim()) {
      res.json(createEmptyInterpretationPayload(kind));
      return;
    }

    const interpretation = kind === "usage"
      ? await createUsageInterpretation(text)
      : await analyzeScentText(text);

    res.json(interpretation);
  } catch (error) {
    if (error instanceof OpenAiServiceError) {
      res.status(error.status).json({
        error: error.message,
        code: error.code
      });
      return;
    }

    console.error("Failed to interpret preference text:", error);
    res.status(500).json({ error: "Failed to interpret preference text", code: "INTERPRET_FAILED" });
  }
});

module.exports = router;
