const express = require("express");
const {
  authRequired,
  getAccountPayload,
  mergeGuestStateIntoAccount,
  saveRecommendationForUser,
  upsertUserState
} = require("../auth");

const router = express.Router();

router.put("/state", authRequired, (req, res) => {
  try {
    const payload = upsertUserState(req.authenticatedUser.id, req.body || {});
    res.json(payload);
  } catch (error) {
    console.error("Failed to update account state:", error);
    res.status(500).json({ error: "Failed to update account state.", code: "ACCOUNT_STATE_UPDATE_FAILED" });
  }
});

router.post("/saved-fragrances", authRequired, (req, res) => {
  try {
    const payload = saveRecommendationForUser(
      req.authenticatedUser.id,
      req.body && req.body.fragranceId
    );
    res.json(payload);
  } catch (error) {
    if (error && error.code) {
      res.status(error.status || 400).json({ error: error.message, code: error.code });
      return;
    }

    console.error("Failed to save fragrance for account:", error);
    res.status(500).json({ error: "Failed to save fragrance.", code: "SAVE_FRAGRANCE_FAILED" });
  }
});

router.post("/merge-guest-state", authRequired, (req, res) => {
  try {
    const payload = mergeGuestStateIntoAccount(req.authenticatedUser.id, req.body || {});
    res.json(payload);
  } catch (error) {
    console.error("Failed to merge guest state:", error);
    res.status(500).json({ error: "Failed to merge guest state.", code: "MERGE_GUEST_STATE_FAILED" });
  }
});

router.get("/state", authRequired, (req, res) => {
  res.json(getAccountPayload(req.authenticatedUser.id));
});

module.exports = router;
