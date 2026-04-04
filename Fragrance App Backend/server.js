// This file starts the Express API and connects the route modules.
const express = require("express");
const cors = require("cors");
require("./db");

const { router: fragranceRoutes } = require("./routes/fragrances");
const recommendRoutes = require("./routes/recommend");
const metadataRoutes = require("./routes/metadata");

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

app.use("/api/fragrances", fragranceRoutes);
app.use("/api/recommend", recommendRoutes);
app.use("/api/metadata", metadataRoutes);

app.listen(PORT, () => {
  console.log(`Maison d'Aura API running on http://localhost:${PORT}`);
});
