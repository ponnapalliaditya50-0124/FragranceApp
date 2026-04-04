const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { db } = require("./db");

const SESSION_COOKIE_NAME = "maison_daura_session";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const AUTH_CODE_TTL_MS = 10 * 60 * 1000;
const AUTH_CODE_RESEND_MS = 60 * 1000;
const AUTH_CODE_MAX_ATTEMPTS = 5;

function nowIso(date = new Date()) {
  return date.toISOString();
}

function addMilliseconds(date, milliseconds) {
  return new Date(date.getTime() + milliseconds);
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
}

function hashOpaqueValue(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function generateOpaqueToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function generateOneTimeCode() {
  return crypto.randomInt(0, 1000000).toString().padStart(6, "0");
}

function parseJsonColumn(value, fallback) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function sanitizeStringArray(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(
    values
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  )];
}

function sanitizeLatestProfile(profile) {
  const safeProfile = profile && typeof profile === "object" ? profile : {};

  return {
    favorites: sanitizeStringArray(safeProfile.favorites),
    scentDescription: String(safeProfile.scentDescription || "").trim().slice(0, 1000),
    usageDescription: String(safeProfile.usageDescription || "").trim().slice(0, 1000),
    selectedFamilies: sanitizeStringArray(safeProfile.selectedFamilies),
    selectedNotes: sanitizeStringArray(safeProfile.selectedNotes),
    selectedAccords: sanitizeStringArray(safeProfile.selectedAccords),
    occasions: sanitizeStringArray(safeProfile.occasions),
    climates: sanitizeStringArray(safeProfile.climates),
    performance: sanitizeIntegerInRange(safeProfile.performance, 0, 100, 50),
    budget: sanitizeIntegerInRange(safeProfile.budget, 1, 3, 2)
  };
}

function sanitizeIntegerInRange(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, parsed));
}

function sanitizeAppearanceMode(value, fallback = "dark") {
  return value === "light" ? "light" : fallback;
}

function sanitizePersonalityTitle(value) {
  return String(value || "").trim().slice(0, 120);
}

function filterExistingFragranceIds(fragranceIds) {
  const ids = sanitizeStringArray(fragranceIds);

  if (ids.length === 0) {
    return [];
  }

  const placeholders = ids.map(() => "?").join(", ");
  const rows = db
    .prepare(`SELECT id FROM fragrances WHERE id IN (${placeholders})`)
    .all(...ids);

  const existingIds = new Set(rows.map((row) => row.id));
  return ids.filter((id) => existingIds.has(id));
}

function ensureUserStateRow(userId) {
  const timestamp = nowIso();

  db.prepare(`
    INSERT OR IGNORE INTO user_state (
      user_id,
      appearance_mode,
      personality_title,
      latest_profile_json,
      latest_recommendation_ids_json,
      created_at,
      updated_at
    ) VALUES (?, 'dark', '', NULL, '[]', ?, ?)
  `).run(userId, timestamp, timestamp);
}

function getSavedRecommendationIds(userId) {
  return db
    .prepare(`
      SELECT fragrance_id
      FROM user_saved_fragrances
      WHERE user_id = ?
      ORDER BY created_at ASC
    `)
    .all(userId)
    .map((row) => row.fragrance_id);
}

function getAccountPayload(userId) {
  const user = db
    .prepare(`
      SELECT id, email, email_verified_at, created_at, updated_at
      FROM users
      WHERE id = ?
    `)
    .get(userId);

  if (!user) {
    return getAnonymousPayload();
  }

  ensureUserStateRow(userId);

  const storedState = db
    .prepare(`
      SELECT appearance_mode, personality_title, latest_profile_json, latest_recommendation_ids_json
      FROM user_state
      WHERE user_id = ?
    `)
    .get(userId);

  return {
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      emailVerifiedAt: user.email_verified_at,
      createdAt: user.created_at,
      updatedAt: user.updated_at
    },
    appearanceMode: sanitizeAppearanceMode(
      storedState && storedState.appearance_mode,
      "dark"
    ),
    personalityTitle: sanitizePersonalityTitle(storedState && storedState.personality_title),
    latestProfile: parseJsonColumn(storedState && storedState.latest_profile_json, null),
    latestRecommendationIds: filterExistingFragranceIds(
      parseJsonColumn(storedState && storedState.latest_recommendation_ids_json, [])
    ),
    savedRecommendationIds: filterExistingFragranceIds(getSavedRecommendationIds(userId))
  };
}

function getAnonymousPayload() {
  return {
    authenticated: false,
    user: null,
    appearanceMode: "dark",
    personalityTitle: "",
    latestProfile: null,
    latestRecommendationIds: [],
    savedRecommendationIds: []
  };
}

function setSessionCookie(res, token, expiresAt) {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt
  });
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });
}

function createSession(res, userId) {
  const timestamp = new Date();
  const expiresAt = addMilliseconds(timestamp, SESSION_DURATION_MS);
  const rawToken = generateOpaqueToken();
  const tokenHash = hashOpaqueValue(rawToken);

  db.prepare(`
    INSERT INTO user_sessions (
      user_id,
      session_token_hash,
      expires_at,
      created_at,
      last_used_at
    ) VALUES (?, ?, ?, ?, ?)
  `).run(
    userId,
    tokenHash,
    nowIso(expiresAt),
    nowIso(timestamp),
    nowIso(timestamp)
  );

  setSessionCookie(res, rawToken, expiresAt);
}

function deleteSessionByTokenHash(tokenHash) {
  if (!tokenHash) {
    return;
  }

  db.prepare("DELETE FROM user_sessions WHERE session_token_hash = ?").run(tokenHash);
}

function deleteAllUserSessions(userId) {
  db.prepare("DELETE FROM user_sessions WHERE user_id = ?").run(userId);
}

function getAuthenticatedUserFromRequest(req) {
  const sessionToken = req.cookies && req.cookies[SESSION_COOKIE_NAME];

  if (!sessionToken) {
    return null;
  }

  const tokenHash = hashOpaqueValue(sessionToken);
  const row = db
    .prepare(`
      SELECT
        user_sessions.id AS session_id,
        user_sessions.expires_at,
        users.id,
        users.email,
        users.email_verified_at
      FROM user_sessions
      INNER JOIN users ON users.id = user_sessions.user_id
      WHERE user_sessions.session_token_hash = ?
      LIMIT 1
    `)
    .get(tokenHash);

  if (!row) {
    return null;
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    deleteSessionByTokenHash(tokenHash);
    return null;
  }

  db.prepare(`
    UPDATE user_sessions
    SET last_used_at = ?
    WHERE id = ?
  `).run(nowIso(), row.session_id);

  return {
    id: row.id,
    email: row.email,
    emailVerifiedAt: row.email_verified_at,
    sessionId: row.session_id,
    sessionTokenHash: tokenHash
  };
}

function authOptional(req, res, next) {
  try {
    req.authenticatedUser = getAuthenticatedUserFromRequest(req);
    next();
  } catch (error) {
    next(error);
  }
}

function authRequired(req, res, next) {
  authOptional(req, res, () => {
    if (!req.authenticatedUser) {
      res.status(401).json({ error: "Authentication required.", code: "AUTH_REQUIRED" });
      return;
    }

    next();
  });
}

async function hashPassword(password) {
  return bcrypt.hash(String(password || ""), 12);
}

async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(String(password || ""), String(passwordHash || ""));
}

function getUserByEmail(email) {
  return db
    .prepare(`
      SELECT *
      FROM users
      WHERE email = ?
      COLLATE NOCASE
      LIMIT 1
    `)
    .get(normalizeEmail(email));
}

function createAuthCodeRecord({ userId = null, email, purpose }) {
  const normalizedEmail = normalizeEmail(email);
  const code = generateOneTimeCode();
  const timestamp = new Date();
  const expiresAt = addMilliseconds(timestamp, AUTH_CODE_TTL_MS);
  const resendAvailableAt = addMilliseconds(timestamp, AUTH_CODE_RESEND_MS);

  db.prepare(`
    DELETE FROM auth_codes
    WHERE purpose = ?
      AND email = ?
      AND consumed_at IS NULL
  `).run(purpose, normalizedEmail);

  db.prepare(`
    INSERT INTO auth_codes (
      user_id,
      email,
      purpose,
      code_hash,
      expires_at,
      resend_available_at,
      attempts_remaining,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    normalizedEmail,
    purpose,
    hashOpaqueValue(code),
    nowIso(expiresAt),
    nowIso(resendAvailableAt),
    AUTH_CODE_MAX_ATTEMPTS,
    nowIso(timestamp)
  );

  return code;
}

function getActiveCodeRecord({ email, purpose, userId = null }) {
  const normalizedEmail = normalizeEmail(email);

  return db
    .prepare(`
      SELECT *
      FROM auth_codes
      WHERE email = ?
        AND purpose = ?
        AND consumed_at IS NULL
        ${userId === null ? "" : "AND user_id = ?"}
      ORDER BY created_at DESC
      LIMIT 1
    `)
    .get(...(userId === null
      ? [normalizedEmail, purpose]
      : [normalizedEmail, purpose, userId]));
}

function ensureResendAllowed({ email, purpose, userId = null }) {
  const existingRecord = getActiveCodeRecord({ email, purpose, userId });

  if (!existingRecord) {
    return;
  }

  const now = Date.now();
  const resendAt = new Date(existingRecord.resend_available_at).getTime();

  if (resendAt > now) {
    const retryAfterSeconds = Math.ceil((resendAt - now) / 1000);
    const error = new Error("Please wait before requesting another code.");
    error.status = 429;
    error.code = "AUTH_CODE_COOLDOWN";
    error.retryAfterSeconds = retryAfterSeconds;
    throw error;
  }
}

function verifyAuthCode({ email, purpose, code, userId = null }) {
  const normalizedEmail = normalizeEmail(email);
  const record = getActiveCodeRecord({ email: normalizedEmail, purpose, userId });

  if (!record) {
    const error = new Error("No active code was found.");
    error.status = 400;
    error.code = "AUTH_CODE_NOT_FOUND";
    throw error;
  }

  if (new Date(record.expires_at).getTime() <= Date.now()) {
    db.prepare("DELETE FROM auth_codes WHERE id = ?").run(record.id);
    const error = new Error("That code has expired.");
    error.status = 400;
    error.code = "AUTH_CODE_EXPIRED";
    throw error;
  }

  const suppliedHash = hashOpaqueValue(code);

  if (suppliedHash !== record.code_hash) {
    const attemptsRemaining = Math.max(0, Number(record.attempts_remaining || 0) - 1);

    if (attemptsRemaining === 0) {
      db.prepare("DELETE FROM auth_codes WHERE id = ?").run(record.id);
    } else {
      db.prepare(`
        UPDATE auth_codes
        SET attempts_remaining = ?
        WHERE id = ?
      `).run(attemptsRemaining, record.id);
    }

    const error = new Error("That code is incorrect.");
    error.status = 400;
    error.code = "AUTH_CODE_INVALID";
    error.attemptsRemaining = attemptsRemaining;
    throw error;
  }

  db.prepare(`
    UPDATE auth_codes
    SET consumed_at = ?
    WHERE id = ?
  `).run(nowIso(), record.id);

  return record;
}

function upsertUserState(userId, payload = {}) {
  ensureUserStateRow(userId);

  const currentState = db
    .prepare(`
      SELECT appearance_mode, personality_title, latest_profile_json, latest_recommendation_ids_json
      FROM user_state
      WHERE user_id = ?
    `)
    .get(userId);

  const nextAppearanceMode = payload.appearanceMode === undefined
    ? sanitizeAppearanceMode(currentState && currentState.appearance_mode, "dark")
    : sanitizeAppearanceMode(payload.appearanceMode, sanitizeAppearanceMode(currentState && currentState.appearance_mode, "dark"));
  const nextPersonalityTitle = payload.personalityTitle === undefined
    ? sanitizePersonalityTitle(currentState && currentState.personality_title)
    : sanitizePersonalityTitle(payload.personalityTitle);
  const shouldClearProfileContext = Boolean(payload.clearProfileContext);
  const nextLatestProfile = shouldClearProfileContext
    ? null
    : (payload.latestProfile === undefined
      ? parseJsonColumn(currentState && currentState.latest_profile_json, null)
      : sanitizeLatestProfile(payload.latestProfile));
  const nextLatestRecommendationIds = shouldClearProfileContext
    ? []
    : (payload.latestRecommendationIds === undefined
      ? filterExistingFragranceIds(parseJsonColumn(currentState && currentState.latest_recommendation_ids_json, []))
      : filterExistingFragranceIds(payload.latestRecommendationIds));

  db.prepare(`
    UPDATE user_state
    SET appearance_mode = ?,
        personality_title = ?,
        latest_profile_json = ?,
        latest_recommendation_ids_json = ?,
        updated_at = ?
    WHERE user_id = ?
  `).run(
    nextAppearanceMode,
    nextPersonalityTitle,
    nextLatestProfile ? JSON.stringify(nextLatestProfile) : null,
    JSON.stringify(nextLatestRecommendationIds),
    nowIso(),
    userId
  );

  return getAccountPayload(userId);
}

function saveRecommendationForUser(userId, fragranceId) {
  const safeFragranceIds = filterExistingFragranceIds([fragranceId]);

  if (safeFragranceIds.length === 0) {
    const error = new Error("Fragrance not found.");
    error.status = 404;
    error.code = "FRAGRANCE_NOT_FOUND";
    throw error;
  }

  db.prepare(`
    INSERT OR IGNORE INTO user_saved_fragrances (user_id, fragrance_id, created_at)
    VALUES (?, ?, ?)
  `).run(userId, safeFragranceIds[0], nowIso());

  return getAccountPayload(userId);
}

function mergeGuestStateIntoAccount(userId, guestState = {}) {
  const payload = guestState && typeof guestState === "object" ? guestState : {};
  const incomingSavedIds = filterExistingFragranceIds(payload.savedRecommendationIds);
  const currentSavedIds = new Set(getSavedRecommendationIds(userId));
  const insertSaved = db.prepare(`
    INSERT OR IGNORE INTO user_saved_fragrances (user_id, fragrance_id, created_at)
    VALUES (?, ?, ?)
  `);
  const timestamp = nowIso();

  incomingSavedIds.forEach((fragranceId) => {
    if (!currentSavedIds.has(fragranceId)) {
      insertSaved.run(userId, fragranceId, timestamp);
    }
  });

  if (payload.replaceProfileContext) {
    upsertUserState(userId, {
      appearanceMode: payload.appearanceMode,
      personalityTitle: payload.personalityTitle,
      latestProfile: payload.latestProfile,
      latestRecommendationIds: payload.latestRecommendationIds
    });
  }

  return getAccountPayload(userId);
}

module.exports = {
  AUTH_CODE_MAX_ATTEMPTS,
  AUTH_CODE_RESEND_MS,
  AUTH_CODE_TTL_MS,
  SESSION_COOKIE_NAME,
  authOptional,
  authRequired,
  clearSessionCookie,
  createAuthCodeRecord,
  createSession,
  deleteAllUserSessions,
  deleteSessionByTokenHash,
  filterExistingFragranceIds,
  getAccountPayload,
  getAnonymousPayload,
  getAuthenticatedUserFromRequest,
  getUserByEmail,
  hashPassword,
  isValidEmail,
  mergeGuestStateIntoAccount,
  normalizeEmail,
  nowIso,
  sanitizeLatestProfile,
  saveRecommendationForUser,
  upsertUserState,
  verifyAuthCode,
  verifyPassword,
  ensureResendAllowed
};
