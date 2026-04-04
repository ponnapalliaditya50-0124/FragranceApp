# Maison d'Aura — Codex Prompts
### Backend Build + Frontend Connection

Use these two prompts **in order** inside Codex (or ChatGPT/Copilot).
After running Prompt 1, follow the setup steps before running Prompt 2.

---

---

# PROMPT 1 — Build the Backend

> Copy everything between the dashed lines and paste it into Codex.

---

Build a Node.js + Express REST API backend for a fragrance recommendation app called "Maison d'Aura". Use SQLite via the `better-sqlite3` library. Write raw SQL — no ORM. Use CommonJS (`require` / `module.exports`), not ESM. Keep the code simple with comments explaining each file, as this is for a developer who is new to Node.js.

Create the code inside the existing `Fragrance App Backend` folder in this repo. Do **not** create a separate top-level `backend/` directory.

**Create this folder and file structure:**

```
Fragrance App Backend/
  codex-prompts.md    ← keep this existing file
  server.js
  db.js
  routes/
    fragrances.js
    recommend.js
    metadata.js
  scripts/
    seed.js
    data.csv          ← added manually before seeding
  fragrance.db        ← created automatically on first run
  package.json
```

---

**`package.json`**

Include these dependencies: `express`, `better-sqlite3`, `cors`, `csv-parser`.
Scripts:
- `"start": "node server.js"`
- `"seed": "node scripts/seed.js"`

---

**`db.js`** — SQLite connection and schema setup

Open (or create) a file called `fragrance.db` in the `Fragrance App Backend` folder using `better-sqlite3`. Create these tables using `CREATE TABLE IF NOT EXISTS`:

```sql
fragrances (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  house TEXT,
  price_tier INTEGER DEFAULT 1,
  longevity_score REAL DEFAULT 5,
  sillage_score REAL DEFAULT 5,
  blind_buy_score REAL DEFAULT 50,
  archetype TEXT,
  dupe_of TEXT
);

fragrance_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fragrance_id TEXT,
  note TEXT,
  note_type TEXT
);

fragrance_accords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fragrance_id TEXT,
  accord TEXT,
  percentage REAL DEFAULT 0
);

fragrance_families (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fragrance_id TEXT,
  family TEXT
);

fragrance_seasons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fragrance_id TEXT,
  season TEXT
);

fragrance_occasions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fragrance_id TEXT,
  occasion TEXT
);
```

Export the database instance so other files can import it.

---

**`server.js`** — Express app entry point

- Import express, cors, and all route files
- Use `cors()` middleware for local development so the existing static frontend can connect from a local dev server
- Use `express.json()` for body parsing
- Mount routes: `/api/fragrances`, `/api/recommend`, `/api/metadata`
- Listen on port 3001
- Log: `"Maison d'Aura API running on http://localhost:3001"`

---

**`routes/fragrances.js`** — Fragrance data routes

Build a helper function called `getFullFragrance(id)` that queries a fragrance by ID and joins all its related data (notes grouped by type, accords, families, seasons, occasions) and returns one clean object shaped like:

```json
{
  "id": "creed-aventus",
  "name": "Aventus",
  "house": "Creed",
  "priceTier": 3,
  "longevityScore": 8,
  "sillageScore": 8,
  "blindBuyScore": 85,
  "archetype": "The Confident Leader",
  "dupeOf": null,
  "notes": {
    "top": ["Pineapple", "Bergamot"],
    "heart": ["Birch", "Patchouli"],
    "base": ["Musk", "Oakmoss"]
  },
  "accordTags": ["Aromatic", "Fresh Clean"],
  "noteFamilies": ["woody", "fresh"],
  "seasonTags": ["Spring", "Summer"],
  "occasionTags": ["Office", "Casual"]
}
```

Implement these routes:

- `GET /api/fragrances`
  - Returns all fragrances using `getFullFragrance` for each
  - Optional query params: `?limit=50&offset=0`, `?house=Creed`, `?price_tier=2`
  - Filter by house/price_tier if provided

- `GET /api/fragrances/search?q=`
  - Search fragrance name and house using SQL `LIKE '%query%'`
  - Return full fragrance objects for matches

- `GET /api/fragrances/:id`
  - Return a single fragrance by ID using `getFullFragrance`
  - Return 404 with `{ error: "Not found" }` if missing

---

**`routes/recommend.js`** — Recommendation engine

`POST /api/recommend`

Accept this JSON body:

```json
{
  "noteFamilies": ["woody", "amber"],
  "accordTags": ["Oriental"],
  "occasions": ["Date Night", "Office"],
  "climates": ["Cold & Crisp"],
  "budget": 2,
  "performance": 70,
  "selectedNotes": ["oud", "sandalwood"],
  "scentDescription": "warm and smoky with a hint of vanilla",
  "usageDescription": "something for date nights and evenings out"
}
```

Score every fragrance in the database using this system:

```
Budget:
  +15 if fragrance price_tier === budget
  +5  if fragrance price_tier < budget
  -30 if fragrance price_tier > budget

Note families (noteFamilies array):
  +30 for each matching family

Specific notes (selectedNotes array):
  +15 for each note found in the fragrance's top/heart/base notes (case-insensitive)

Accords (accordTags array):
  +20 for each matching accord

Occasions:
  +25 for each matching occasion

Climate → Season mapping:
  "Hot & Humid"   → Summer
  "Dry & Desert"  → Summer, Fall
  "Temperate"     → Spring, Fall
  "Cold & Crisp"  → Winter
  "Tropical"      → Summer
  +20 for each mapped season match
  +10 if fragrance has "All-year Signature" season

Performance (0–100 scale):
  Convert fragrance power: (longevity_score + sillage_score) / 2 * 10
  diff = abs(performance - fragrance_power_scaled)
  +20 if diff <= 15
  +10 if diff <= 30
  -30 if diff > 50

Free-text scentDescription keyword matching:
  Extract these keywords if present in the description:
  warm, smoky, fresh, clean, woody, citrus, floral, spicy, sweet, leather,
  dark, light, aquatic, gourmand, oriental, earthy, powdery, rich, cozy

  Keyword → family map:
    warm → amber, spicy
    smoky → leather, amber
    fresh/clean → citrus, fresh
    dark/rich → leather, amber, animalic
    aquatic → fresh
    earthy → woody, animalic
    powdery → floral, sweet
    cozy → sweet, amber
    oriental → amber, spicy
    gourmand → sweet

  +8 for each keyword-mapped family that matches the fragrance's families
  +10 for each keyword that directly matches a note name in the fragrance

Usage description keyword matching:
  If usageDescription contains office/work/professional:
    +15 if fragrance has "Office" occasion
  If usageDescription contains date/night/evening/intimate:
    +15 if fragrance has "Date Night" or "Intimate" occasion
  If usageDescription contains casual/everyday/daily:
    +15 if fragrance has "Casual" occasion
  If usageDescription contains club/party/loud:
    +15 if fragrance has "Clubbing" occasion
```

Return the top 5 scoring fragrances sorted descending by score. Use `getFullFragrance` to return full objects. Include a `matchScore` field on each result.

---

**`routes/metadata.js`** — Supporting data routes

- `GET /api/metadata/notes` — return array of distinct note strings from all fragrances
- `GET /api/metadata/accords` — return array of distinct accord strings
- `GET /api/metadata/brands` — return array of distinct house/brand names, sorted A-Z

---

**`scripts/seed.js`** — CSV importer

Write a one-time script that:

1. Reads a CSV file at `scripts/data.csv`
2. Expects these columns (from the Fragrantica Kaggle dataset):
   `Name, Brand, top notes, middle notes, base notes, mainaccord, ratingValue, longevity, sillage`
3. For each row:
   - Generate an ID: lowercase `brand-name` with spaces replaced by hyphens, special chars removed
   - Check if fragrance already exists (skip if so)
   - Parse `ratingValue` into `blind_buy_score` on a 0–100 scale
   - Parse `longevity` and `sillage` into 1–10 scores. If the CSV value is already numeric, clamp it to 1–10. If it is text, map common labels like weak/moderate/long/strong into sensible 1–10 values. Use 5 as a fallback.
   - Insert into `fragrances` table with `price_tier = 1` as default
   - Split `top notes`, `middle notes`, `base notes` by comma and insert each into `fragrance_notes` with note_type "top"/"heart"/"base"
   - Split `mainaccord` by comma if needed and insert each raw accord into `fragrance_accords`
   - Also normalize raw accords into the frontend's existing accord palette where possible and insert those too (skip duplicates). Use mappings like:
     ```
     aromatic → Aromatic
     aquatic/marine/watery → Aquatic
     oriental/amber/warm spicy → Oriental
     gourmand/sweet → Gourmand
     fresh/citrus/clean/soapy → Fresh Clean
     smoky/incense/leather/tobacco → Dark & Smoky
     powdery → Powdery
     earthy/mossy/woody → Earthy
     chypre → Chypre
     fougere/fougère → Fougère
     ```
   - Map notes and accords into the frontend's existing `SCENT_FAMILIES` ids and insert into `fragrance_families` using this guide:
     ```
     woody/wood/oud/cedar/sandalwood → woody
     citrus/bergamot/lemon/orange/grapefruit/neroli → citrus
     fresh/clean/aquatic/marine/green/aromatic → fresh
     floral/rose/jasmine/iris/lavender/violet → floral
     spicy/pepper/cinnamon/cardamom/saffron → spicy
     sweet/vanilla/gourmand/caramel/tonka → sweet
     leather/tobacco/suede/smoky → leather
     amber/oriental/warm/incense/resin → amber
     musk/animalic/civet/castoreum/ambergris → animalic
     ```
   - Derive `fragrance_seasons` heuristically so recommendation scoring has real data. For example:
     ```
     fresh/citrus/aquatic/Fresh Clean → Spring, Summer
     woody/spicy/amber/leather/animalic/Dark & Smoky → Fall, Winter
     floral → Spring
     versatile aromatic/fresh+woody profiles → All-year Signature
     ```
   - Derive `fragrance_occasions` heuristically so recommendation scoring has real data. For example:
     ```
     Fresh Clean/Aromatic/Aquatic → Office, Casual
     Oriental/amber/spicy/leather/Dark & Smoky → Date Night
     high performance fragrances → Clubbing
     softer floral/fresh profiles → Intimate
     ```
4. Log progress every 500 rows: `"Imported 500 fragrances..."`
5. Log total at end: `"Seeding complete. X fragrances imported."`

Run with: `node scripts/seed.js`

---

Write complete, working code for every file. Add a one-line comment at the top of each file saying what it does.

---

---

## After Running Prompt 1 — Setup Steps

Do these steps before running Prompt 2:

**Step 1 — Install dependencies**
```
cd "Fragrance App Backend"
npm install
```

**Step 2 — Get the free fragrance data**
1. Go to: https://www.kaggle.com/datasets/olgagmiufana1/fragrantica-com-fragrance-dataset
2. Sign in to Kaggle (free account)
3. Download the CSV file
4. Rename it to `data.csv`
5. Place it at: `Fragrance App Backend/scripts/data.csv`

**Step 3 — Seed the database**
```
npm run seed
```
This imports all the fragrances into your SQLite database. Only needs to be run once.

**Step 4 — Start the backend**
```
npm start
```
The server will run at `http://localhost:3001`

**Step 5 — Test it's working**
Open your browser and go to: `http://localhost:3001/api/fragrances?limit=5`
You should see fragrance data returned as JSON.

---

---

# PROMPT 2 — Connect the Frontend

> Copy everything between the dashed lines and paste into Codex.
> Run this AFTER the backend is built and running.

---

I have a frontend fragrance recommendation app called "Maison d'Aura" in the `Antigravity - Fragrance App` folder. It currently uses hardcoded data in a file called `data.js`. I need you to update the JavaScript files to fetch live fragrance data and recommendations from a backend API instead. The backend runs at `http://localhost:3001`.

Important context about this codebase:
- `index.html` loads `js/data.js`, then `js/logic.js`, then `js/app.js` using plain `<script>` tags, so do **not** convert the app to ES modules
- The app already has a dedicated `loading-view` screen and animated `loader-text`
- `fragranceDB` is still referenced outside `data.js` for starter-pick matching and dupe lookup, so do not remove the variable name unless you replace every dependency
- `usageDescription` is part of the current local scoring flow and still needs to be sent to the backend

**Here is the current structure of the app:**

- `index.html` — the main page
- `js/data.js` — contains hardcoded fragrance data (`fragranceDB` array) plus config objects: `SCENT_FAMILIES`, `ACCORD_PALETTE`, `STARTER_PICKS`, `FRAGRANCE_SUGGESTIONS`, `ARCHETYPES`
- `js/logic.js` — contains the `OlfactoryEngine` class which scores and ranks fragrances
- `js/app.js` — manages the UI, wizard steps, and calls `OlfactoryEngine.calculateRecommendations(userState)`

**What to keep unchanged:**
- All of `SCENT_FAMILIES`, `ACCORD_PALETTE`, `STARTER_PICKS`, and `ARCHETYPES` in `data.js` — these are static config and do not need to come from the API
- The `OlfactoryEngine` class structure in `logic.js`
- All visual/UI code in `app.js`
- The existing plain-script loading order in `index.html`

**What to change:**

---

**Change 1 — `js/data.js`**

Replace the hardcoded `fragranceDB` array with an empty runtime-loaded catalog, but keep the `fragranceDB` variable name because the current app still relies on it in multiple places.

Add this API config at the top of the file:
```javascript
const API_BASE = 'http://localhost:3001/api';
let fragranceDB = [];
let FRAGRANCE_SUGGESTIONS = [];
```

Add these async functions at the bottom of the file:

```javascript
// Load the fragrance catalog once so existing starter-pick and dupe UI can keep working
async function loadFragranceCatalog() {
  const res = await fetch(`${API_BASE}/fragrances?limit=5000`);
  if (!res.ok) {
    throw new Error('Failed to load fragrance catalog');
  }
  fragranceDB = await res.json();
  return fragranceDB;
}

// Fetch fragrance suggestions for the autocomplete search field
async function fetchFragranceSuggestions(query) {
  if (!query || query.length < 2) return [];
  const res = await fetch(`${API_BASE}/fragrances/search?q=${encodeURIComponent(query)}`);
  const data = await res.json();
  return data.map(f => `${f.name} — ${f.house}`);
}

// Send user preferences to the backend and get top recommendations
async function fetchRecommendations(userState) {
  const res = await fetch(`${API_BASE}/recommend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      noteFamilies: userState.selectedFamilies || [],
      accordTags: userState.selectedAccords || [],
      occasions: userState.occasions || [],
      climates: userState.climates || [],
      budget: parseInt(userState.budget) || 2,
      performance: parseInt(userState.performance) || 50,
      selectedNotes: userState.selectedNotes || [],
      scentDescription: userState.scentDescription || '',
      usageDescription: userState.usageDescription || ''
    })
  });
  return await res.json();
}
```

Keep `FRAGRANCE_SUGGESTIONS` as an empty array `[]`. Suggestions should now come from the API dynamically, but keep the variable so the rest of the file structure stays familiar.

---

**Change 2 — `js/logic.js`**

In the `OlfactoryEngine` class, add a new async method called `getRecommendations(userState)`:

```javascript
async getRecommendations(userState) {
  // Uses the backend API to score and rank fragrances
  const results = await fetchRecommendations(userState);
  return results;
}
```

Keep the existing `calculateRecommendations` method in place (do not delete it) but add a comment above it saying `// Legacy local scoring — replaced by backend API`.

Keep `determineArchetype` exactly as it is.

---

**Change 3 — `js/app.js`**

Find the place in the code where `calculateRecommendations` is called on the `OlfactoryEngine` instance. This is in the function that handles the final step of the wizard.

Make the following changes to that function:

1. Make it `async`
2. Keep using the existing `loading-view` and animated `loader-text` flow that is already in the app
3. Replace the call to `engine.calculateRecommendations(state)` with `await engine.getRecommendations(state)`
4. Remove the artificial scoring delay, but keep the loading screen experience intact
5. Wrap the API call in a try/catch. If it fails, switch to the results view and show this message inside the results container: "Unable to connect to the fragrance database. Please make sure the backend server is running."

Find the autocomplete input in Step 1 of the wizard (where users type in favorite fragrances). It currently searches through the static `FRAGRANCE_SUGGESTIONS` array. Update it to:
1. Call `fetchFragranceSuggestions(inputValue)` on each keystroke (debounce by 300ms)
2. Populate the suggestion dropdown with the returned results
3. Handle the async nature with `async/await`
4. Keep the existing keyboard navigation and dropdown rendering behavior
5. Prevent stale async responses from overwriting newer input results

Also update the app startup flow:
1. Keep `const engine = new OlfactoryEngine(fragranceDB, ARCHETYPES)`
2. In the existing `DOMContentLoaded` handler, call `await loadFragranceCatalog()` before `initWizard()`
3. After the catalog loads, assign `engine.database = fragranceDB`
4. Wrap the catalog load in try/catch so the UI can still initialize even if the backend is temporarily unavailable
5. Do not remove the existing dupe lookup that uses `engine.database.find(...)`

---

**Change 4 — `index.html`**

No structural HTML changes are required. Reuse the existing `loading-view`, `loader-text`, and current pulse animation already in the project. Only touch HTML or CSS if you need a very small change to render the backend-connection error cleanly without altering the current design.

---

Make only the changes described above. Do not rewrite or restructure code that isn't mentioned. Preserve all existing CSS classes, IDs, and variable names. Show the complete updated version of each changed file.

---
