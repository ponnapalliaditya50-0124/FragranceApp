const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.NODE_ENV = "test";
process.env.AUTH_DEBUG_CODES = "true";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "maison-daura-auth-"));
process.env.DB_PATH = path.join(tempDir, "test-auth.db");

const authRouter = require("../routes/auth");
const accountRouter = require("../routes/account");
const { db } = require("../db");

function resetTables() {
  db.exec(`
    DELETE FROM user_saved_fragrances;
    DELETE FROM auth_codes;
    DELETE FROM user_sessions;
    DELETE FROM user_state;
    DELETE FROM users;
    DELETE FROM fragrance_accords;
    DELETE FROM fragrance_notes;
    DELETE FROM fragrance_families;
    DELETE FROM fragrance_seasons;
    DELETE FROM fragrance_occasions;
    DELETE FROM fragrances;
  `);

  const insertFragrance = db.prepare(`
    INSERT INTO fragrances (
      id,
      name,
      house,
      price_tier,
      longevity_score,
      sillage_score,
      blind_buy_score,
      archetype,
      dupe_of
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertFragrance.run("test-fragrance-1", "Atlas Cedar", "Maison d'Aura", 2, 8.1, 7.8, 82, null, null);
  insertFragrance.run("test-fragrance-2", "Solar Bloom", "Maison d'Aura", 1, 6.4, 5.9, 75, null, null);
}

function createMockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    finished: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    getHeader(name) {
      return this.headers[String(name).toLowerCase()];
    },
    cookie(name, value) {
      const existing = this.getHeader("set-cookie");
      const nextValue = `${name}=${value}; Path=/`;

      if (!existing) {
        this.setHeader("set-cookie", [nextValue]);
      } else {
        this.setHeader("set-cookie", [...existing, nextValue]);
      }

      return this;
    },
    clearCookie(name) {
      const existing = this.getHeader("set-cookie");
      const nextValue = `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;

      if (!existing) {
        this.setHeader("set-cookie", [nextValue]);
      } else {
        this.setHeader("set-cookie", [...existing, nextValue]);
      }

      return this;
    },
    json(payload) {
      this.body = payload;
      this.finished = true;
      return this;
    }
  };
}

function parseCookieHeader(cookieHeader = "") {
  if (!cookieHeader) {
    return {};
  }

  return Object.fromEntries(
    cookieHeader
      .split(/;\s*/)
      .filter(Boolean)
      .map((entry) => {
        const separatorIndex = entry.indexOf("=");
        return separatorIndex === -1
          ? [entry, ""]
          : [entry.slice(0, separatorIndex), entry.slice(separatorIndex + 1)];
      })
  );
}

function findRouteLayer(router, method, routePath) {
  return router.stack.find((layer) => (
    layer.route
    && layer.route.path === routePath
    && layer.route.methods[method.toLowerCase()]
  ));
}

async function runRoute(router, method, routePath, { body = null, cookie = "" } = {}) {
  const routeLayer = findRouteLayer(router, method, routePath);

  if (!routeLayer) {
    throw new Error(`Unable to find ${method} ${routePath}`);
  }

  const req = {
    method,
    url: routePath,
    body: body || {},
    cookies: parseCookieHeader(cookie),
    headers: cookie ? { cookie } : {},
    authenticatedUser: null
  };
  const res = createMockResponse();
  const handlers = routeLayer.route.stack.map((layer) => layer.handle);

  await new Promise((resolve, reject) => {
    let index = 0;

    const next = (error) => {
      if (error) {
        reject(error);
        return;
      }

      executeNext();
    };

    const executeNext = () => {
      if (res.finished || index >= handlers.length) {
        resolve();
        return;
      }

      const handler = handlers[index];
      index += 1;

      try {
        const maybePromise = handler(req, res, next);

        if (maybePromise && typeof maybePromise.then === "function") {
          maybePromise
            .then(() => {
              if (!res.finished) {
                executeNext();
              } else {
                resolve();
              }
            })
            .catch(reject);
        } else if (res.finished || handler.length < 3) {
          resolve();
        }
      } catch (error) {
        reject(error);
      }
    };

    executeNext();
  });

  return { status: res.statusCode, payload: res.body, headers: res.headers };
}

function getCookie(response) {
  const setCookies = response.headers["set-cookie"] || [];
  return setCookies.length > 0 ? setCookies[0].split(";", 1)[0] : "";
}

async function signupAndVerify(email, password = "supersecure1") {
  const signup = await runRoute(authRouter, "POST", "/signup", {
    body: { email, password }
  });
  const verify = await runRoute(authRouter, "POST", "/verify-email", {
    body: {
      email,
      code: signup.payload.delivery.debugCode
    }
  });

  return {
    signup,
    verify,
    cookie: getCookie(verify)
  };
}

test.after(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test.beforeEach(() => {
  resetTables();
});

test("signup requires verification before login and session hydration succeeds after verification", async () => {
  const email = "first-user@example.com";
  const password = "supersecure1";

  const signup = await runRoute(authRouter, "POST", "/signup", {
    body: { email, password }
  });

  assert.equal(signup.status, 201);
  assert.equal(signup.payload.requiresVerification, true);
  assert.match(signup.payload.delivery.debugCode, /^\d{6}$/);

  const blockedLogin = await runRoute(authRouter, "POST", "/login", {
    body: { email, password }
  });

  assert.equal(blockedLogin.status, 403);
  assert.equal(blockedLogin.payload.code, "EMAIL_NOT_VERIFIED");

  const verify = await runRoute(authRouter, "POST", "/verify-email", {
    body: { email, code: signup.payload.delivery.debugCode }
  });

  assert.equal(verify.status, 200);
  assert.equal(verify.payload.authenticated, true);
  assert.equal(verify.payload.user.email, email);
  assert.deepEqual(verify.payload.savedRecommendationIds, []);

  const cookie = getCookie(verify);
  assert.ok(cookie);

  const session = await runRoute(authRouter, "GET", "/session", { cookie });
  assert.equal(session.status, 200);
  assert.equal(session.payload.authenticated, true);
  assert.equal(session.payload.user.email, email);
});

test("duplicate verified emails are blocked case-insensitively", async () => {
  await signupAndVerify("MixedCase@Example.com");

  const duplicateSignup = await runRoute(authRouter, "POST", "/signup", {
    body: {
      email: "mixedcase@example.com",
      password: "supersecure1"
    }
  });

  assert.equal(duplicateSignup.status, 409);
  assert.equal(duplicateSignup.payload.code, "EMAIL_IN_USE");
});

test("password reset rotates credentials and invalidates existing sessions", async () => {
  const email = "reset-user@example.com";
  const originalPassword = "supersecure1";
  const newPassword = "newpassword2";
  const { cookie } = await signupAndVerify(email, originalPassword);

  const forgotPassword = await runRoute(authRouter, "POST", "/forgot-password", {
    body: { email }
  });

  assert.equal(forgotPassword.status, 200);
  assert.match(forgotPassword.payload.delivery.debugCode, /^\d{6}$/);

  const resetPassword = await runRoute(authRouter, "POST", "/reset-password", {
    body: {
      email,
      code: forgotPassword.payload.delivery.debugCode,
      password: newPassword
    }
  });

  assert.equal(resetPassword.status, 200);
  assert.equal(resetPassword.payload.success, true);

  const oldSession = await runRoute(authRouter, "GET", "/session", { cookie });
  assert.equal(oldSession.payload.authenticated, false);

  const oldPasswordLogin = await runRoute(authRouter, "POST", "/login", {
    body: { email, password: originalPassword }
  });
  assert.equal(oldPasswordLogin.status, 401);

  const newPasswordLogin = await runRoute(authRouter, "POST", "/login", {
    body: { email, password: newPassword }
  });
  assert.equal(newPasswordLogin.status, 200);
  assert.equal(newPasswordLogin.payload.authenticated, true);
});

test("account endpoints reject unauthenticated requests", async () => {
  const updateState = await runRoute(accountRouter, "PUT", "/state", {
    body: { personalityTitle: "The Provocateur" }
  });
  const saveFragrance = await runRoute(accountRouter, "POST", "/saved-fragrances", {
    body: { fragranceId: "test-fragrance-1" }
  });
  const mergeState = await runRoute(accountRouter, "POST", "/merge-guest-state", {
    body: { replaceProfileContext: true }
  });

  assert.equal(updateState.status, 401);
  assert.equal(saveFragrance.status, 401);
  assert.equal(mergeState.status, 401);
});

test("two users do not leak saved fragrances or account state into each other", async () => {
  const first = await signupAndVerify("first@example.com");
  const second = await signupAndVerify("second@example.com");

  const firstSave = await runRoute(accountRouter, "POST", "/saved-fragrances", {
    cookie: first.cookie,
    body: { fragranceId: "test-fragrance-1" }
  });

  assert.deepEqual(firstSave.payload.savedRecommendationIds, ["test-fragrance-1"]);

  const firstState = await runRoute(accountRouter, "PUT", "/state", {
    cookie: first.cookie,
    body: {
      appearanceMode: "light",
      personalityTitle: "The Provocateur",
      latestProfile: {
        favorites: ["Atlas Cedar"],
        scentDescription: "smoky and woody",
        usageDescription: "formal evenings",
        selectedFamilies: ["woody"],
        selectedNotes: ["Cedar"],
        selectedAccords: ["Dark & Smoky"],
        occasions: ["Formal/Event"],
        climates: ["Cold & Crisp"],
        performance: 70,
        budget: 2
      },
      latestRecommendationIds: ["test-fragrance-1"]
    }
  });

  assert.equal(firstState.payload.appearanceMode, "light");
  assert.equal(firstState.payload.personalityTitle, "The Provocateur");

  const secondSession = await runRoute(authRouter, "GET", "/session", { cookie: second.cookie });
  assert.equal(secondSession.payload.authenticated, true);
  assert.equal(secondSession.payload.appearanceMode, "dark");
  assert.equal(secondSession.payload.personalityTitle, "");
  assert.deepEqual(secondSession.payload.savedRecommendationIds, []);
  assert.deepEqual(secondSession.payload.latestRecommendationIds, []);

  const secondSave = await runRoute(accountRouter, "POST", "/saved-fragrances", {
    cookie: second.cookie,
    body: { fragranceId: "test-fragrance-2" }
  });

  assert.deepEqual(secondSave.payload.savedRecommendationIds, ["test-fragrance-2"]);

  const firstSession = await runRoute(authRouter, "GET", "/session", { cookie: first.cookie });
  assert.deepEqual(firstSession.payload.savedRecommendationIds, ["test-fragrance-1"]);
  assert.equal(firstSession.payload.personalityTitle, "The Provocateur");
  assert.deepEqual(firstSession.payload.latestRecommendationIds, ["test-fragrance-1"]);
});

test("guest merge unions saved fragrances and only replaces profile context when requested", async () => {
  const { cookie } = await signupAndVerify("merge-user@example.com");

  await runRoute(accountRouter, "POST", "/saved-fragrances", {
    cookie,
    body: { fragranceId: "test-fragrance-1" }
  });

  await runRoute(accountRouter, "PUT", "/state", {
    cookie,
    body: {
      appearanceMode: "dark",
      personalityTitle: "The Modern Aesthete",
      latestProfile: {
        favorites: ["Atlas Cedar"],
        scentDescription: "clean woods",
        usageDescription: "daily wear",
        selectedFamilies: ["woody"],
        selectedNotes: ["Cedar"],
        selectedAccords: ["Fresh Clean"],
        occasions: ["Everyday/Signature"],
        climates: ["Temperate"],
        performance: 50,
        budget: 2
      },
      latestRecommendationIds: ["test-fragrance-1"]
    }
  });

  const mergeWithoutReplacement = await runRoute(accountRouter, "POST", "/merge-guest-state", {
    cookie,
    body: {
      savedRecommendationIds: ["test-fragrance-2"],
      appearanceMode: "light",
      personalityTitle: "The Provocateur",
      latestProfile: {
        favorites: ["Solar Bloom"],
        scentDescription: "bright florals",
        usageDescription: "vacation",
        selectedFamilies: ["floral"],
        selectedNotes: ["Jasmine"],
        selectedAccords: ["Gourmand"],
        occasions: ["Vacation/Holiday"],
        climates: ["Tropical"],
        performance: 40,
        budget: 1
      },
      latestRecommendationIds: ["test-fragrance-2"],
      replaceProfileContext: false
    }
  });

  assert.deepEqual(
    mergeWithoutReplacement.payload.savedRecommendationIds.sort(),
    ["test-fragrance-1", "test-fragrance-2"]
  );
  assert.equal(mergeWithoutReplacement.payload.personalityTitle, "The Modern Aesthete");
  assert.deepEqual(mergeWithoutReplacement.payload.latestRecommendationIds, ["test-fragrance-1"]);

  const mergeWithReplacement = await runRoute(accountRouter, "POST", "/merge-guest-state", {
    cookie,
    body: {
      savedRecommendationIds: ["test-fragrance-2"],
      appearanceMode: "light",
      personalityTitle: "The Provocateur",
      latestProfile: {
        favorites: ["Solar Bloom"],
        scentDescription: "bright florals",
        usageDescription: "vacation",
        selectedFamilies: ["floral"],
        selectedNotes: ["Jasmine"],
        selectedAccords: ["Gourmand"],
        occasions: ["Vacation/Holiday"],
        climates: ["Tropical"],
        performance: 40,
        budget: 1
      },
      latestRecommendationIds: ["test-fragrance-2"],
      replaceProfileContext: true
    }
  });

  assert.equal(mergeWithReplacement.payload.appearanceMode, "light");
  assert.equal(mergeWithReplacement.payload.personalityTitle, "The Provocateur");
  assert.deepEqual(mergeWithReplacement.payload.latestRecommendationIds, ["test-fragrance-2"]);
  assert.equal(mergeWithReplacement.payload.latestProfile.scentDescription, "bright florals");
});
