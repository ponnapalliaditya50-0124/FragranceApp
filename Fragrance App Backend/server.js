// This file starts the Express API and connects the route modules.
const path = require("path");
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

try {
  process.loadEnvFile(path.join(__dirname, ".env"));
} catch (error) {
  if (error && error.code !== "ENOENT") {
    console.warn("Unable to load .env file for the backend.", error);
  }
}

require("./db");

const { router: fragranceRoutes } = require("./routes/fragrances");
const recommendRoutes = require("./routes/recommend");
const metadataRoutes = require("./routes/metadata");
const interpretRoutes = require("./routes/interpret");
const transcribeRoutes = require("./routes/transcribe");
const authRoutes = require("./routes/auth");
const accountRoutes = require("./routes/account");

const app = express();
const PORT = Number.parseInt(process.env.PORT || "3001", 10);

function getAllowedOrigins() {
  const configuredOrigins = String(
    process.env.FRONTEND_ORIGINS || process.env.FRONTEND_ORIGIN || ""
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (configuredOrigins.length > 0) {
    return new Set(configuredOrigins);
  }

  return new Set([
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "http://127.0.0.1:4173",
    "http://localhost:4173",
    "http://127.0.0.1:3000",
    "http://localhost:3000"
  ]);
}

const allowedOrigins = getAllowedOrigins();

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error("Origin is not allowed by CORS."));
  },
  credentials: true
}));
app.use(cookieParser());
app.use(express.json());

app.use("/api/fragrances", fragranceRoutes);
app.use("/api/recommend", recommendRoutes);
app.use("/api/metadata", metadataRoutes);
app.use("/api/interpret", interpretRoutes);
app.use("/api/transcribe", transcribeRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/account", accountRoutes);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Maison d'Aura API running on http://localhost:${PORT}`);
  });
}

module.exports = app;
