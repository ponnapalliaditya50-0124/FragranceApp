const express = require("express");
const {
  authOptional,
  clearSessionCookie,
  createAuthCodeRecord,
  createSession,
  deleteAllUserSessions,
  deleteSessionByTokenHash,
  ensureResendAllowed,
  getAccountPayload,
  getAnonymousPayload,
  getUserByEmail,
  hashPassword,
  isValidEmail,
  normalizeEmail,
  nowIso,
  verifyAuthCode,
  verifyPassword
} = require("../auth");
const { db } = require("../db");
const { sendAuthCodeEmail } = require("../services/email");

const router = express.Router();
const MIN_PASSWORD_LENGTH = 10;

function getSafeDeliveryPayload(delivery) {
  if (!delivery || typeof delivery !== "object") {
    return null;
  }

  if (delivery.debugCode) {
    return {
      deliveryMode: delivery.deliveryMode,
      debugCode: delivery.debugCode
    };
  }

  return {
    deliveryMode: delivery.deliveryMode
  };
}

function validatePassword(password) {
  return String(password || "").length >= MIN_PASSWORD_LENGTH;
}

router.get("/session", authOptional, (req, res) => {
  if (!req.authenticatedUser) {
    res.json(getAnonymousPayload());
    return;
  }

  res.json(getAccountPayload(req.authenticatedUser.id));
});

router.post("/signup", async (req, res) => {
  try {
    const email = normalizeEmail(req.body && req.body.email);
    const password = String(req.body && req.body.password ? req.body.password : "");

    if (!isValidEmail(email)) {
      res.status(400).json({ error: "Enter a valid email address.", code: "INVALID_EMAIL" });
      return;
    }

    if (!validatePassword(password)) {
      res.status(400).json({
        error: `Passwords must be at least ${MIN_PASSWORD_LENGTH} characters.`,
        code: "WEAK_PASSWORD"
      });
      return;
    }

    let user = getUserByEmail(email);

    if (user && user.email_verified_at) {
      res.status(409).json({ error: "That email is already in use.", code: "EMAIL_IN_USE" });
      return;
    }

    if (user) {
      ensureResendAllowed({ email, purpose: "verify_email", userId: user.id });

      const passwordHash = await hashPassword(password);
      db.prepare(`
        UPDATE users
        SET password_hash = ?, updated_at = ?
        WHERE id = ?
      `).run(passwordHash, nowIso(), user.id);
    } else {
      const passwordHash = await hashPassword(password);
      const insertResult = db.prepare(`
        INSERT INTO users (email, password_hash, email_verified_at, created_at, updated_at)
        VALUES (?, ?, NULL, ?, ?)
      `).run(email, passwordHash, nowIso(), nowIso());
      user = { id: insertResult.lastInsertRowid, email };
    }

    const verificationCode = createAuthCodeRecord({
      userId: user.id,
      email,
      purpose: "verify_email"
    });
    const delivery = await sendAuthCodeEmail({
      email,
      code: verificationCode,
      purpose: "verify_email"
    });

    res.status(201).json({
      requiresVerification: true,
      email,
      delivery: getSafeDeliveryPayload(delivery)
    });
  } catch (error) {
    if (error && error.code === "AUTH_CODE_COOLDOWN") {
      res.status(error.status || 429).json({
        error: error.message,
        code: error.code,
        retryAfterSeconds: error.retryAfterSeconds
      });
      return;
    }

    console.error("Failed to sign up user:", error);
    res.status(500).json({ error: "Failed to create account.", code: "SIGNUP_FAILED" });
  }
});

router.post("/verify-email", (req, res) => {
  try {
    const email = normalizeEmail(req.body && req.body.email);
    const code = String(req.body && req.body.code ? req.body.code : "").trim();
    const user = getUserByEmail(email);

    if (!user) {
      res.status(404).json({ error: "No account found for that email.", code: "USER_NOT_FOUND" });
      return;
    }

    verifyAuthCode({
      userId: user.id,
      email,
      purpose: "verify_email",
      code
    });

    db.prepare(`
      UPDATE users
      SET email_verified_at = ?, updated_at = ?
      WHERE id = ?
    `).run(nowIso(), nowIso(), user.id);

    createSession(res, user.id);
    res.json(getAccountPayload(user.id));
  } catch (error) {
    if (error && error.code) {
      res.status(error.status || 400).json({
        error: error.message,
        code: error.code,
        attemptsRemaining: error.attemptsRemaining
      });
      return;
    }

    console.error("Failed to verify email:", error);
    res.status(500).json({ error: "Failed to verify email.", code: "VERIFY_EMAIL_FAILED" });
  }
});

router.post("/resend-verification", async (req, res) => {
  try {
    const email = normalizeEmail(req.body && req.body.email);
    const user = getUserByEmail(email);

    if (!user || user.email_verified_at) {
      res.status(404).json({ error: "No pending account found for that email.", code: "PENDING_USER_NOT_FOUND" });
      return;
    }

    ensureResendAllowed({ email, purpose: "verify_email", userId: user.id });

    const verificationCode = createAuthCodeRecord({
      userId: user.id,
      email,
      purpose: "verify_email"
    });
    const delivery = await sendAuthCodeEmail({
      email,
      code: verificationCode,
      purpose: "verify_email"
    });

    res.json({
      requiresVerification: true,
      email,
      delivery: getSafeDeliveryPayload(delivery)
    });
  } catch (error) {
    if (error && error.code === "AUTH_CODE_COOLDOWN") {
      res.status(error.status || 429).json({
        error: error.message,
        code: error.code,
        retryAfterSeconds: error.retryAfterSeconds
      });
      return;
    }

    console.error("Failed to resend verification code:", error);
    res.status(500).json({ error: "Failed to resend verification code.", code: "RESEND_FAILED" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const email = normalizeEmail(req.body && req.body.email);
    const password = String(req.body && req.body.password ? req.body.password : "");
    const user = getUserByEmail(email);

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      res.status(401).json({ error: "Invalid email or password.", code: "INVALID_LOGIN" });
      return;
    }

    if (!user.email_verified_at) {
      res.status(403).json({
        error: "Verify your email before logging in.",
        code: "EMAIL_NOT_VERIFIED"
      });
      return;
    }

    createSession(res, user.id);
    res.json(getAccountPayload(user.id));
  } catch (error) {
    console.error("Failed to log in user:", error);
    res.status(500).json({ error: "Failed to log in.", code: "LOGIN_FAILED" });
  }
});

router.post("/logout", authOptional, (req, res) => {
  if (req.authenticatedUser) {
    deleteSessionByTokenHash(req.authenticatedUser.sessionTokenHash);
  }

  clearSessionCookie(res);
  res.json({ success: true });
});

router.post("/forgot-password", async (req, res) => {
  try {
    const email = normalizeEmail(req.body && req.body.email);
    const user = getUserByEmail(email);

    if (user && user.email_verified_at) {
      ensureResendAllowed({ email, purpose: "reset_password", userId: user.id });
      const resetCode = createAuthCodeRecord({
        userId: user.id,
        email,
        purpose: "reset_password"
      });
      const delivery = await sendAuthCodeEmail({
        email,
        code: resetCode,
        purpose: "reset_password"
      });

      res.json({
        success: true,
        email,
        delivery: getSafeDeliveryPayload(delivery)
      });
      return;
    }

    res.json({ success: true, email });
  } catch (error) {
    if (error && error.code === "AUTH_CODE_COOLDOWN") {
      res.status(error.status || 429).json({
        error: error.message,
        code: error.code,
        retryAfterSeconds: error.retryAfterSeconds
      });
      return;
    }

    console.error("Failed to start password reset:", error);
    res.status(500).json({ error: "Failed to start password reset.", code: "FORGOT_PASSWORD_FAILED" });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const email = normalizeEmail(req.body && req.body.email);
    const code = String(req.body && req.body.code ? req.body.code : "").trim();
    const password = String(req.body && req.body.password ? req.body.password : "");
    const user = getUserByEmail(email);

    if (!user || !user.email_verified_at) {
      res.status(404).json({ error: "No verified account found for that email.", code: "USER_NOT_FOUND" });
      return;
    }

    if (!validatePassword(password)) {
      res.status(400).json({
        error: `Passwords must be at least ${MIN_PASSWORD_LENGTH} characters.`,
        code: "WEAK_PASSWORD"
      });
      return;
    }

    verifyAuthCode({
      userId: user.id,
      email,
      purpose: "reset_password",
      code
    });

    const passwordHash = await hashPassword(password);
    db.prepare(`
      UPDATE users
      SET password_hash = ?, updated_at = ?
      WHERE id = ?
    `).run(passwordHash, nowIso(), user.id);
    deleteAllUserSessions(user.id);
    clearSessionCookie(res);

    res.json({ success: true });
  } catch (error) {
    if (error && error.code) {
      res.status(error.status || 400).json({
        error: error.message,
        code: error.code,
        attemptsRemaining: error.attemptsRemaining
      });
      return;
    }

    console.error("Failed to reset password:", error);
    res.status(500).json({ error: "Failed to reset password.", code: "RESET_PASSWORD_FAILED" });
  }
});

module.exports = router;
