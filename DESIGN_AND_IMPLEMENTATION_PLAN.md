# Maison d'Aura — Implementation & Design System Plan

## Context

Maison d'Aura is a fragrance recommendation platform with a vanilla JS frontend (SPA), Express/SQLite backend, and 24,063 classified fragrance records. The app currently uses a monolithic 3-step wizard (Favorites → Scent Profile → Usage Intent) with show/hide section navigation. This plan restructures it into distinct page-based workflows with hash routing, a full browse experience, and Amazon affiliate integration — executed by Claude Code agents in parallel.

**Data is clean**: `fra_cleaned_w_b_rules.csv` (27 columns, semicolon-delimited, latin-1) is the authoritative source.

---

## Design System — Visual Standards

All new pages, components, and CSS files **must** follow these specifications. The design system lives in `styles/style.css` `:root` and `body.appearance-light` blocks. Do not duplicate tokens — import or reference the existing file.

### Color Architecture

The palette uses **translucent glass minimalism** — no opaque surface colors. Every surface is a semi-transparent overlay on the gradient background.

| Token | Dark Mode | Light Mode | Usage |
|---|---|---|---|
| `--clr-bg` | `#0b0b10` | `#f6f1ea` | Page gradient start |
| `--clr-bg-secondary` | `#07080d` | `#e8dfd2` | Page gradient end |
| `--clr-surface` | `rgba(255,255,255,0.04)` | `rgba(255,255,255,0.58)` | Default panel/card fill |
| `--clr-surface-hover` | `rgba(255,255,255,0.07)` | `rgba(255,255,255,0.74)` | Hover state fill |
| `--clr-surface-soft` | `rgba(255,255,255,0.03)` | `rgba(255,255,255,0.5)` | Subtle card fill |
| `--clr-text-primary` | `rgba(255,255,255,0.92)` | `rgba(29,24,36,0.92)` | Headings, emphasis |
| `--clr-text-secondary` | `rgba(255,255,255,0.45)` | `rgba(51,43,58,0.68)` | Body text, labels |
| `--clr-text-tertiary` | `rgba(255,255,255,0.28)` | `rgba(79,69,87,0.44)` | Captions, hints |
| `--clr-gold` | `#e0b85d` | `#b8922e` | Medium confidence, accents |
| `--clr-success` | `#60c080` | — | Positive states |
| `--clr-danger` | `#e06060` | — | Destructive/negative states |

**Rule**: Never hardcode colors. Always reference `var(--clr-*)`. Both dark and light themes derive from the same token names.

### Typography

| Token | Value | Usage |
|---|---|---|
| `--font-heading` | `'Playfair Display', serif` | Section titles, archetype names, fragrance names |
| `--font-body` | `'Inter', sans-serif` | Everything else, weight 300 default |

**Hierarchy** (current canonical sizes — do not invent new ones):
- Hero: `2.6rem` heading font
- Section title: `1.4rem` heading font
- Card title: `1.05rem` body font, weight 400
- Body: `0.85rem` body font, weight 300
- Label/caption: `0.72-0.75rem`, uppercase, `letter-spacing: 1-2px`
- Micro: `0.65-0.68rem`, uppercase, `letter-spacing: 1.5-2px`

### Border Radius

| Token | Value | Usage |
|---|---|---|
| `--radius-sm` | `8px` | Input fields, small cards, note pills |
| `--radius-md` | `14px` | Medium cards, panels, dropdowns |
| `--radius-lg` | `22px` | Large cards, interpretation items |
| `--radius-pill` | `50px` | Pills, badges, toggles, buttons |

**Rule**: Never hardcode border-radius. Always use `var(--radius-*)`.

### Transitions

| Token | Value | Usage |
|---|---|---|
| `--transition-snappy` | `0.15s cubic-bezier(0.2, 0, 0, 1)` | Hover color/border flips, micro-interactions |
| `--transition-fast` | `0.2s ease` | Standard interactive elements (buttons, pills, cards, inputs) |
| `--transition-smooth` | `0.4s cubic-bezier(0.25, 1, 0.5, 1)` | Modals, view transitions, large surface animations |

**Rule**: Every interactive element must have a `transition` property using one of these tokens. Never use bare `0.3s` or `0.25s`.

**Exceptions**: Ambient orb transitions (`1.5s`) and body theme transition (`0.45s`) may use literal values.

### Blur (Glass-Morphism)

| Token | Value | Usage |
|---|---|---|
| `--blur-subtle` | `blur(10px)` | Buttons, small overlays |
| `--blur-standard` | `blur(20px)` | Cards, panels, dropdowns |
| `--blur-heavy` | `blur(40px)` | Header, modal scrim, primary surfaces |

Apply as `backdrop-filter: var(--blur-*); -webkit-backdrop-filter: var(--blur-*);`.

### Shadows

| Token | Value | Usage |
|---|---|---|
| `--shadow-card` | `0 8px 24px var(--clr-shadow-soft)` | Default card elevation |
| `--shadow-card-hover` | `0 14px 32px var(--clr-shadow-medium)` | Card hover lift |
| `--shadow-elevated` | `0 18px 48px var(--clr-shadow-strong)` | Modals, popovers |
| `--shadow-focus-ring` | `0 0 0 2px var(--clr-border-focus), 0 0 12px var(--clr-highlight-glow)` | Focus-visible states |

### Interaction States — Required for All Interactive Elements

Every clickable/tappable element must implement:

1. **`:hover`** — visual response (border brighten, background shift, or `translateY(-1px)` lift)
2. **`:focus-visible`** — `outline: none; box-shadow: var(--shadow-focus-ring);`
3. **`:active`** — `transform: scale(0.97)` for buttons, or subtle press feedback

**Standard card hover pattern**:
```css
.my-card {
    transition: transform var(--transition-fast), border-color var(--transition-fast), box-shadow var(--transition-fast);
    cursor: pointer;
}
.my-card:hover {
    transform: translateY(-2px);
    border-color: var(--clr-border-focus);
    box-shadow: var(--shadow-card-hover);
}
.my-card:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus-ring);
}
```

**Standard pill hover pattern**:
```css
.my-pill {
    transition: background var(--transition-snappy), border-color var(--transition-snappy), color var(--transition-snappy);
}
.my-pill:hover {
    background: var(--clr-surface-hover);
    border-color: var(--clr-border-strong);
}
```

### Animations & Delight

**Staggered card entrance** (for any card grid):
```css
animation: dossierFadeIn 0.5s ease both;
/* JS: style="animation-delay: ${idx * 0.08}s" */
```

**Selection pop** (for toggleable pills):
```css
animation: pillSelect 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
```

**Feedback pop** (for state-change buttons like love/pass):
```css
animation: feedbackPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
```

**Modal entrance**: Content starts at `transform: translateY(20px) scale(0.97); opacity: 0` and transitions to `transform: translateY(0) scale(1); opacity: 1` using `--transition-smooth`.

**Progress bar**: Has a glowing `::after` dot at the leading edge.

**Results grid crossfade**: When re-rendering cards, add `.crossfading` class (opacity: 0), update DOM, then `requestAnimationFrame(() => grid.classList.remove('crossfading'))`.

### Glass Panel Pattern

The `.glass-panel` class is the primary surface component:
```css
.glass-panel {
    background: var(--clr-surface);
    border: 1px solid var(--clr-surface-border);
    border-radius: var(--radius-md);
    backdrop-filter: var(--blur-standard);
    -webkit-backdrop-filter: var(--blur-standard);
}
```
Use for all cards, panels, and content containers. Do not create new surface patterns.

### Inline Style Prohibition

**Never** use inline `style=` attributes in HTML or `element.style.*` in JS for:
- Font sizes → use CSS classes
- Visibility → use `.hidden` attribute or CSS class toggle
- Display → use `.hidden` attribute
- Opacity → use CSS class with `transition`

**Allowed inline styles**: Genuinely dynamic values only (slider fill gradients, tooltip positioning, progress bar width, animation-delay per item index).

### CSS File Convention for New Pages

When creating new page CSS files (e.g., `styles/search.css`, `styles/detail.css`):
- Import no tokens — reference `var(--*)` from the shared `:root`
- Prefix classes with the page name (e.g., `.search-input`, `.browse-filter-pill`)
- Follow the same interaction state patterns documented above
- Ensure both dark and light themes work (test with `body.appearance-light`)
- Match spacing to the existing rhythm: `0.5rem`, `0.75rem`, `1rem`, `1.5rem`, `2rem`, `2.5rem`

---

## Target Architecture

### MVP Workflows
1. **Recommendations**: `#/notes` → `#/usage` → `#/results` (3-step wizard, each step = own route)
2. **Search/Browse**: `#/search` → `#/browse` → `#/fragrance/:id` (full browse with filters + detail pages)

### Stretch Workflows
3. **Account**: `#/signup` / `#/login` (iterate existing auth)
4. **Profile**: `#/profile` (favorites management, saved frags, personality)
5. **Discover**: `#/home` (featured + trending landing page)

### Key Decisions
- Iterate & refactor (not rewrite)
- Hash router on vanilla JS (no framework change)
- Amazon: search URLs with affiliate tag for MVP; Product API later
- Favorites removed from recommendation wizard, moved to Profile (stretch)

---

## Phase 1 — Foundation (3 agents in parallel, no cross-dependencies)

### Task 1.1: Hash Router + Page Skeleton

**Goal**: Add client-side hash routing and restructure index.html from wizard sections to routable pages.

**Files to modify**:
- CREATE `Antigravity - Fragrance App/js/router.js`
- MODIFY `Antigravity - Fragrance App/index.html`
- MODIFY `Antigravity - Fragrance App/js/app.js` (only: `setActiveView()` at line 3323, initialization at bottom)

**Implementation**:
1. Create `router.js` — a lightweight hash router:
   - `registerRoute(pattern, handler)` — supports `:param` placeholders (e.g., `#/fragrance/:id`)
   - `navigate(hash)` — programmatic navigation
   - Listens to `hashchange` event
   - Default route: `#/notes` (MVP entry point)
   - Routes: `#/notes`, `#/usage`, `#/results`, `#/search`, `#/browse`, `#/fragrance/:id`
   - Stretch routes: `#/home`, `#/profile`, `#/signup`, `#/login`

2. Add empty `<section>` shells to `index.html` for each route:
   - `id="view-notes"`, `id="view-usage"`, `id="view-results"`
   - `id="view-search"`, `id="view-browse"`, `id="view-fragrance-detail"`
   - Keep existing sections (`wizard-view`, `results-view`, `profile-view`) temporarily — they'll be migrated in Phase 3

3. Refactor `setActiveView()` (app.js:3323) to delegate to router:
   - Old: directly toggles `display` on sections
   - New: calls `router.navigate(hash)` which handles section visibility
   - Preserve backward compat: old view IDs still work during migration

4. Add `<script src="js/router.js">` to index.html before app.js

**Acceptance criteria**:
- `#/notes` shows notes page shell, `#/search` shows search shell, etc.
- Direct URL navigation works (paste `#/fragrance/123` → shows detail shell)
- Back/forward browser buttons work
- Existing wizard still functions during migration (no breakage)

---

### Task 1.2: Seed Script Rewrite

**Goal**: Rewrite `seed.js` to consume `fra_cleaned_w_b_rules.csv` with its 27 columns, storing classified fields directly instead of deriving them heuristically.

**Files to modify**:
- MODIFY `Fragrance App Backend/scripts/seed.js` (215 lines — near-total rewrite)
- MODIFY `Fragrance App Backend/db.js` (add columns to schema)
- COPY `fra_cleaned_w_b_rules.csv` → `Fragrance App Backend/scripts/data.csv`

**DB Schema changes** (db.js, add to `fragrances` table):
```sql
gender TEXT,           -- men/women/unisex
country TEXT,          -- brand origin country
year INTEGER,          -- release year
url TEXT,              -- fragrantica URL
occasion TEXT,         -- "Office / everyday", "Casual / daytime; Evening / date night", etc.
climate TEXT,          -- "Hot weather / summer", etc.
climate_idx INTEGER,   -- 0-7 (cold→hot)
sillage TEXT,          -- Soft/Moderate/Strong/Heavy
longevity TEXT,        -- "Short (3-5h)"/"Moderate (5-7h)"/"Long (7-9h)"/"Very long (9h+)"
-- price_tier already exists (change from INTEGER to TEXT: "Budget"/"Affordable"/"Mid-range"/"Premium"/"Luxury")
-- longevity_score/sillage_score: KEEP as numeric (derive from text: Soft=2, Moderate=5, Strong=7, Heavy=9; Short=3, Moderate=5, Long=7, VeryLong=9)
```

Add new indexes:
```sql
CREATE INDEX IF NOT EXISTS idx_fragrances_gender ON fragrances(gender);
CREATE INDEX IF NOT EXISTS idx_fragrances_occasion ON fragrances(occasion);
CREATE INDEX IF NOT EXISTS idx_fragrances_climate_idx ON fragrances(climate_idx);
CREATE INDEX IF NOT EXISTS idx_fragrances_sillage ON fragrances(sillage);
```

**seed.js rewrite details**:
- Input file: semicolon-delimited (not comma), latin-1 encoding
- Column mapping from CSV → DB:
  - `Perfume` → `name`
  - `Brand` → `house` (with hyphen→space normalization)
  - `Gender` → `gender`
  - `Country` → `country`
  - `Year` → `year`
  - `url` → `url`
  - `Rating Value` → `blind_buy_score` (parse comma-decimal like "4,25" → 4.25, scale to 0-100)
  - `Top` → fragrance_notes (type=top, split on ", ")
  - `Middle` → fragrance_notes (type=heart, split on ", ")
  - `Base` → fragrance_notes (type=base, split on ", ")
  - `mainaccord1-5` → fragrance_accords (with percentage: 1st=100, 2nd=80, 3rd=60, 4th=40, 5th=20)
  - `occasion` → `occasion` (store as-is) + fragrance_occasions (split on "; ")
  - `climate` → `climate`, `climate_idx` → `climate_idx`
  - `sillage` → `sillage` + `sillage_score` (Soft=2, Moderate=5, Strong=7, Heavy=9)
  - `longevity` → `longevity` + `longevity_score` (Short=3, Moderate=5, Long=7, Very long=9)
  - `price_tier` → `price_tier` (store text directly)
- Derive `fragrance_families` from accords using existing `FRONTEND_ACCORD_RULES`
- Derive `fragrance_seasons` from `climate_idx`: 0-2→Winter,Fall; 3-4→Spring,Fall; 5-7→Spring,Summer; 3→All-year
- Derive `fragrance_occasions` from the `occasion` CSV column directly (split on "; ")
- Generate `id` as `{brand}-{name}` normalized (existing logic)

**Acceptance criteria**:
- `node scripts/seed.js` imports all 24,063 records without errors
- `SELECT COUNT(*) FROM fragrances` = 24,063 (or close, accounting for duplicate IDs)
- `SELECT DISTINCT occasion FROM fragrances` returns valid values
- `SELECT DISTINCT sillage FROM fragrances` returns Soft/Moderate/Strong/Heavy
- `SELECT DISTINCT price_tier FROM fragrances` returns Budget/Affordable/Mid-range/Premium/Luxury

---

### Task 1.3: Amazon Affiliate Utility

**Goal**: Create a reusable module for generating Amazon affiliate links.

**Files to create**:
- CREATE `Antigravity - Fragrance App/js/amazon.js`
- CREATE `Fragrance App Backend/services/amazon.js`

**Frontend (`js/amazon.js`)**:
```javascript
const AMAZON_AFFILIATE_TAG = ''; // Set via config or env

function buildAmazonSearchUrl(fragranceName, brand) {
  const query = encodeURIComponent(`${fragranceName} ${brand} perfume`);
  const tag = AMAZON_AFFILIATE_TAG ? `&tag=${AMAZON_AFFILIATE_TAG}` : '';
  return `https://www.amazon.com/s?k=${query}${tag}`;
}

function renderAmazonBuyButton(container, fragranceName, brand) {
  const url = buildAmazonSearchUrl(fragranceName, brand);
  const btn = document.createElement('a');
  btn.href = url;
  btn.target = '_blank';
  btn.rel = 'noopener noreferrer sponsored';
  btn.className = 'amazon-buy-btn';
  btn.textContent = 'Buy on Amazon';
  container.appendChild(btn);
}
```

**Backend (`services/amazon.js`)**:
```javascript
function buildAmazonUrl(name, house) {
  const query = encodeURIComponent(`${name} ${house} perfume`);
  const tag = process.env.AMAZON_AFFILIATE_TAG || '';
  const tagParam = tag ? `&tag=${tag}` : '';
  return `https://www.amazon.com/s?k=${query}${tagParam}`;
}
```
- Backend returns `amazonUrl` field in fragrance API responses

**CSS** (add to `styles/style.css`):
```css
.amazon-buy-btn {
  display: inline-flex; align-items: center; gap: 0.5rem;
  padding: 0.6rem 1.2rem; border-radius: var(--radius-sm);
  background: #FF9900; color: #111; font-weight: 600;
  text-decoration: none; transition: background var(--transition-fast), transform var(--transition-fast);
}
.amazon-buy-btn:hover { background: #e68a00; transform: translateY(-1px); }
.amazon-buy-btn:active { transform: scale(0.97); }
.amazon-buy-btn:focus-visible { outline: none; box-shadow: var(--shadow-focus-ring); }
```

**Acceptance criteria**:
- `buildAmazonSearchUrl("Sauvage", "Dior")` returns valid Amazon URL
- Button renders with correct styling
- Links open in new tab with `rel="noopener noreferrer sponsored"`

---

## Phase 2 — Backend API Enhancements (3 agents, depends on Phase 1.2)

### Task 2.1: Search & Browse API

**Goal**: Enhance `GET /api/fragrances` for full browse with faceted filtering, pagination, and sorting.

**Files to modify**:
- MODIFY `Fragrance App Backend/routes/fragrances.js` (309 lines)

**New query parameters for `GET /api/fragrances`**:
- `q` — text search (name or house, LIKE match)
- `accord` — filter by mainaccord (comma-separated, any match)
- `occasion` — filter by occasion (comma-separated, LIKE match for multi-label support)
- `climate_idx` — filter by climate index (comma-separated, exact match)
- `gender` — filter by gender (men/women/unisex)
- `price_tier` — filter by price tier text (comma-separated)
- `sillage` — filter by sillage (comma-separated)
- `sort` — `name`, `rating`, `year`, `price` (default: name)
- `order` — `asc`/`desc` (default: asc)
- `limit` — page size (default: 24)
- `offset` — pagination offset

**Response envelope**:
```json
{
  "data": [...],
  "total": 24063,
  "limit": 24,
  "offset": 0,
  "filters": { "accord": ["woody"], "occasion": ["Office / everyday"] }
}
```

**New endpoint: `GET /api/fragrances/filters`**:
Returns available filter values with counts:
```json
{
  "accords": [{"value": "woody", "count": 12531}, ...],
  "occasions": [{"value": "Office / everyday", "count": 12621}, ...],
  "climates": [{"value": "Hot weather / summer", "count": 3200}, ...],
  "genders": [{"value": "men", "count": 8000}, ...],
  "price_tiers": [{"value": "Mid-range", "count": 15000}, ...],
  "sillage": [{"value": "Moderate", "count": 18000}, ...]
}
```

**Update `formatFragrance()`** (line 144):
Add new fields to response: `gender`, `country`, `year`, `url`, `occasion`, `climate`, `climate_idx`, `sillage`, `longevity`, `price_tier`, `amazonUrl`

**Acceptance criteria**:
- `GET /api/fragrances?q=sauvage&price_tier=Mid-range` returns filtered results
- `GET /api/fragrances?occasion=Evening&sort=rating&order=desc` works
- `GET /api/fragrances/filters` returns all filter facets with counts
- Pagination works: `offset=24&limit=24` returns page 2

---

### Task 2.2: Recommendations API Update

**Goal**: Update `POST /api/recommend` to use classified CSV columns directly and remove favorites dependency.

**Files to modify**:
- MODIFY `Fragrance App Backend/routes/recommend.js` (292 lines)

**Changes**:
1. Remove favorites-based scoring (was +45 per match) — favorites move to Profile stretch
2. Use `occasion` column directly instead of deriving from fragrance_occasions join:
   - Input `occasions: ["Office / everyday"]` → match against `fragrances.occasion` (LIKE for multi-label)
3. Use `climate`/`climate_idx` directly:
   - Input `climates: ["Hot & Humid"]` → map to climate_idx range (6-7) → match `fragrances.climate_idx`
   - Mapping: Hot & Humid→6-7, Dry & Desert→6-7, Temperate→3-5, Cold & Crisp→0-2, Tropical→6-7
4. Use `sillage` text directly:
   - Input `performance: 75` → map to sillage: 0-25=Soft, 26-50=Moderate, 51-75=Strong, 76-100=Heavy
   - Match against `fragrances.sillage`
5. Use `price_tier` text:
   - Input `budget: 2` → map: 0=Budget, 1=Affordable, 2=Mid-range, 3=Premium, 4=Luxury
   - Match against `fragrances.price_tier`
6. Include `amazonUrl` in response fragrances

**Acceptance criteria**:
- `POST /api/recommend` with notes/accords/occasions/climates returns scored results
- No favorites field required
- Results include `amazonUrl`
- Climate matching uses numeric index ranges (not heuristic season derivation)

---

### Task 2.3: Frontend Data Layer Update

**Goal**: Update `data.js` to support new API shapes, add search/browse/detail functions.

**Files to modify**:
- MODIFY `Antigravity - Fragrance App/js/data.js` (570 lines)
- MODIFY `Antigravity - Fragrance App/js/logic.js` (337 lines)

**New functions in data.js**:
```javascript
async function searchFragrances({ q, accord, occasion, climate_idx, gender, price_tier, sillage, sort, order, limit, offset })
async function fetchFragranceById(id)
async function fetchFragranceFilters()
```

**Update existing functions**:
- `fetchRecommendations()` — remove favorites from payload, add new fields
- `loadFragranceCatalog()` — handle new response envelope shape

**logic.js changes**:
- Remove favorites-related scoring from `calculateRecommendationPool()`
- Update `getRecommendations()` to pass new payload shape

**Acceptance criteria**:
- `searchFragrances({q: "sauvage"})` returns filtered results
- `fetchFragranceById("dior-sauvage")` returns full detail with amazonUrl
- `fetchFragranceFilters()` returns facet counts
- Recommendation flow works without favorites

---

## Phase 3 — Frontend Pages (5 agents, depends on Phases 1 + 2)

### CONFLICT AVOIDANCE RULES
Agents in Phase 3 all touch `index.html` and `app.js`. To prevent conflicts:
- **Each agent owns specific `<section>` blocks** in index.html — only modify your assigned section
- **In app.js**: each agent adds a new initialization function (e.g., `initNotesPage()`, `initSearchPage()`) at the END of the file. Do NOT modify other agents' functions.
- **In router.js**: each agent registers their own route handler. Route registrations are additive (no conflicts).
- **CSS**: each agent creates a SEPARATE CSS file (e.g., `styles/notes.css`, `styles/search.css`)

### DESIGN SYSTEM COMPLIANCE
All Phase 3+ work **must** follow the Design System section above. Specifically:
- Use only `var(--*)` tokens for colors, radii, transitions, blur, and shadows — never hardcode
- Every interactive element must have `:hover`, `:focus-visible`, and `:active` states
- Follow the documented card hover pattern, pill hover pattern, and animation conventions
- No inline `style=` attributes except for genuinely dynamic values
- Use `.glass-panel` for all surface containers
- Apply staggered `dossierFadeIn` animation to card grids with `idx * 0.08s` delay
- Apply `pillSelect` animation to toggleable pills on selection
- Test both dark mode (`body.appearance-dark` / default `:root`) and light mode (`body.appearance-light`)

---

### Task 3.1: Notes Page (`#/notes`)

**Goal**: Build the scent profile page — refactored from current wizard Step 2.

**Files to modify**:
- MODIFY `Antigravity - Fragrance App/index.html` (add `<section id="view-notes">`)
- MODIFY `Antigravity - Fragrance App/js/app.js` (add `initNotesPage()` at end)
- CREATE `Antigravity - Fragrance App/styles/notes.css`

**Reuse from existing code** (app.js):
- Scent description textarea + mic button (lines ~1400-1500 in current wizard step 2)
- SCENT_FAMILIES grid rendering (data.js has the 9 families with notes)
- ACCORD_PALETTE selector (data.js has 10 accords)
- Interpretation panel (`renderInterpretationPanel('scent')` at line 1828)
- `renderPills()` function (line 4765) for selected items

**Page layout**:
1. Header: "What scents do you love?" + progress indicator (Step 1 of 3)
2. Text area + mic button for free-text scent description
3. Scent families grid (9 tiles, expandable to show individual notes)
4. Accord palette (10 pills, toggleable)
5. Interpretation panel (shows after text input, Apply/Clear)
6. Navigation: "Next →" button (navigates to `#/usage`)

**State management**: Store selections in `state.selectedFamilies`, `state.selectedNotes`, `state.selectedAccords`, `state.scentDescription` (existing state shape)

**Acceptance criteria**:
- `#/notes` renders the scent profile page
- Can type description, record voice, select families/notes/accords
- Interpretation fires on text blur
- "Next" navigates to `#/usage`
- State persists across navigation

---

### Task 3.2: Usage Page (`#/usage`)

**Goal**: Build the usage context page — refactored from current wizard Step 3.

**Files to modify**:
- MODIFY `Antigravity - Fragrance App/index.html` (add `<section id="view-usage">`)
- MODIFY `Antigravity - Fragrance App/js/app.js` (add `initUsagePage()` at end)
- CREATE `Antigravity - Fragrance App/styles/usage.css`

**Reuse from existing code**:
- Usage description textarea + mic (current wizard step 3)
- OCCASION_OPTIONS pills (data.js: Office, Casual, Date Night, Clubbing, Intimate, Formal, Gym, Bedtime, Vacation, Everyday)
- CLIMATE_OPTIONS pills (data.js: Hot & Humid, Dry & Desert, Temperate, Cold & Crisp, Tropical)
- Performance slider (0-100)
- Budget tier pills (Budget → Luxury)
- Usage interpretation panel

**Page layout**:
1. Header: "When & where will you wear it?" + progress (Step 2 of 3)
2. Text area + mic for usage description
3. Occasions grid (10 options, multi-select)
4. Climate pills (5 options, multi-select)
5. Performance slider with labels (Intimate → Beast Mode)
6. Budget tier selector (5 pills)
7. Navigation: "← Back" to `#/notes`, "Get Recommendations →" triggers API call then navigates to `#/results`

**Acceptance criteria**:
- `#/usage` renders usage context page
- Occasions, climates, performance, budget all selectable
- "Get Recommendations" calls the API and navigates to `#/results`
- "Back" returns to `#/notes` with state preserved

---

### Task 3.3: Results Page (`#/results`)

**Goal**: Build the recommendations results page with Amazon buy links.

**Files to modify**:
- MODIFY `Antigravity - Fragrance App/index.html` (add `<section id="view-results">`)
- MODIFY `Antigravity - Fragrance App/js/app.js` (add `initResultsPage()` at end)
- CREATE `Antigravity - Fragrance App/styles/results.css`

**Reuse from existing code**:
- `renderResultsCards()` (app.js:4935) — fragrance card rendering
- `renderResultsHeader()` (app.js:3636) — archetype/personality header
- `renderFragranceDetail()` (app.js:1110) — expand card for details
- Card design: name, house, price tier, scores, match percentage

**New additions**:
- Amazon buy button on each card (using `js/amazon.js` from Task 1.3)
- `renderAmazonBuyButton(cardElement, frag.name, frag.house)` per card
- Click card → navigate to `#/fragrance/:id` for full details

**Page layout**:
1. Archetype header ("You are: The Dark Romantic")
2. Grid of recommendation cards (top 5-10)
3. Each card: name, house, price tier, match score, top 3 notes, Amazon button
4. "Refine" options: Best Match, Cheaper, Stronger, Office-Safe, Less Sweet, More Unique
5. Navigation: "← Refine Preferences" back to `#/usage`

**Acceptance criteria**:
- `#/results` displays recommended fragrances
- Amazon buttons render and link correctly
- Cards are clickable → `#/fragrance/:id`
- Refine options re-sort results

---

### Task 3.4: Search & Browse Pages (`#/search`, `#/browse`)

**Goal**: Build the search entry point and filtered browse list.

**Files to modify**:
- MODIFY `Antigravity - Fragrance App/index.html` (add `<section id="view-search">` and `<section id="view-browse">`)
- MODIFY `Antigravity - Fragrance App/js/app.js` (add `initSearchPage()`, `initBrowsePage()`)
- CREATE `Antigravity - Fragrance App/styles/search.css`

**Search page (`#/search`)**:
1. Large search input (autofocus)
2. Category tiles: "By Occasion", "By Climate", "By Brand", "By Price Tier"
3. Each tile navigates to `#/browse?filter=X`
4. Search input → debounced → navigates to `#/browse?q=X`

**Browse page (`#/browse`)**:
1. Search bar at top (pre-filled from query)
2. Filter sidebar:
   - Accord multi-select checkboxes (from `fetchFragranceFilters()`)
   - Occasion pills
   - Climate pills
   - Gender radio (All/Men/Women/Unisex)
   - Price tier checkboxes
   - Sillage pills
3. Results grid: paginated cards (24 per page)
4. Sort dropdown: Name, Rating, Year, Price
5. Pagination: Previous / Page N / Next
6. Each card links to `#/fragrance/:id`

**Uses**: `searchFragrances()` from Task 2.3, `fetchFragranceFilters()` for sidebar counts

**Acceptance criteria**:
- `#/search` shows search input + category tiles
- Typing → navigates to `#/browse?q=X` with results
- Filters update results dynamically
- Pagination works
- Cards link to detail page

---

### Task 3.5: Fragrance Detail Page (`#/fragrance/:id`)

**Goal**: Build full fragrance detail view with all classified fields and Amazon link.

**Files to modify**:
- MODIFY `Antigravity - Fragrance App/index.html` (add `<section id="view-fragrance-detail">`)
- MODIFY `Antigravity - Fragrance App/js/app.js` (add `initFragranceDetailPage()`)
- CREATE `Antigravity - Fragrance App/styles/detail.css`

**Uses**: `fetchFragranceById(id)` from Task 2.3, `renderAmazonBuyButton()` from Task 1.3

**Page layout**:
1. Header: fragrance name + brand
2. Key stats row: gender badge, year, country of origin, price tier badge
3. Classification section:
   - Occasion(s) with icons
   - Climate with thermometer visual (idx 0-7)
   - Sillage meter (Soft → Heavy)
   - Longevity meter (Short → Very Long)
4. Notes section: Top / Middle / Base (three columns with note pills)
5. Accords section: ranked list with visual bars (accord1=100%, accord2=80%, etc.)
6. Amazon buy button (prominent)
7. Fragrantica link ("View on Fragrantica →")
8. Back button → previous page (browser history)

**Acceptance criteria**:
- `#/fragrance/dior-sauvage` loads and displays full details
- All classified fields shown (occasion, climate, sillage, longevity, price_tier)
- Amazon button works
- Fragrantica URL links correctly
- Back navigation works

---

## Phase 4 — Stretch (3 agents, depends on Phases 1-3)

### Task 4.1: Account Workflow (`#/signup`, `#/login`)

Iterate existing auth modal into routable pages. Extract from `showAuthModal()` (app.js:4333) and `initAuth()` (app.js:4484). Register `#/signup` and `#/login` routes. Keep existing backend auth.js unchanged.

### Task 4.2: Profile Page (`#/profile`)

Refactor from `renderProfileView()` (app.js:3889). Add favorites management (moved from wizard Step 1). Uses existing `user_saved_fragrances` API. Show saved fragrances with filters, personality title, stats.

### Task 4.3: Discover Home Page (`#/home`)

New landing page with curated sections:
- "Trending" (top-rated fragrances, sorted by Rating Count desc)
- "Seasonal Picks" (filter by current season's climate_idx range)
- "New Releases" (sorted by Year desc)
- "By Occasion" tiles linking to `#/browse?occasion=X`
- Prominent search bar + "Get Recommendations" CTA

Backend: add `GET /api/fragrances/featured` returning curated lists.

---

## Phase 5 — Verification (sequential, after all phases)

1. **Seed & boot**: `node scripts/seed.js` → `npm start` → verify all endpoints
2. **Route navigation**: Test every hash route, back/forward, direct URL entry
3. **Recommendations flow**: `#/notes` → select families/accords → `#/usage` → select occasions/budget → `#/results` → verify results + Amazon links
4. **Search flow**: `#/search` → type query → `#/browse` → apply filters → `#/fragrance/:id` → verify all fields + Amazon link
5. **Data integrity**: Spot-check 10 fragrances: verify occasion/climate/sillage/longevity match CSV
6. **Responsive**: Test on mobile viewport (375px) and desktop (1440px)

---

## Agent Execution Summary

| Phase | Tasks | Agents | Dependencies | Est. Complexity |
|---|---|---|---|---|
| 1 | 1.1, 1.2, 1.3 | 3 parallel | None | Medium, High, Low |
| 2 | 2.1, 2.2, 2.3 | 3 parallel | Phase 1.2 (seed must complete) | High, Medium, Medium |
| 3 | 3.1–3.5 | 5 parallel | Phase 1.1 (router) + Phase 2 (APIs) | Medium each |
| 4 | 4.1–4.3 | 3 parallel | Phase 1-3 complete | Low-Medium each |
| 5 | Verification | 1 sequential | All phases | Low |
| **Total** | **16 tasks** | **Max 5 concurrent** | | |

---

## Critical File Inventory

| File | Lines | Modified By | Purpose |
|---|---|---|---|
| `Antigravity - Fragrance App/index.html` | 449 | Tasks 1.1, 3.1-3.5, 4.1-4.3 | Page section shells |
| `Antigravity - Fragrance App/js/app.js` | 5,216 | Tasks 1.1, 3.1-3.5, 4.1-4.3 | View controllers (additive only) |
| `Antigravity - Fragrance App/js/data.js` | 570 | Task 2.3 | API call layer |
| `Antigravity - Fragrance App/js/logic.js` | 337 | Task 2.3 | Scoring engine |
| `Antigravity - Fragrance App/js/router.js` | NEW | Task 1.1 | Hash router |
| `Antigravity - Fragrance App/js/amazon.js` | NEW | Task 1.3 | Affiliate URL builder |
| `Fragrance App Backend/db.js` | 142 | Task 1.2 | Schema (add columns) |
| `Fragrance App Backend/scripts/seed.js` | 215 | Task 1.2 | CSV→SQLite (rewrite) |
| `Fragrance App Backend/routes/fragrances.js` | 309 | Task 2.1 | Browse API + filters |
| `Fragrance App Backend/routes/recommend.js` | 292 | Task 2.2 | Rec engine update |
| `Fragrance App Backend/services/amazon.js` | NEW | Task 1.3 | Backend URL builder |
| `fra_cleaned_w_b_rules.csv` | 24,064 | READ ONLY | Authoritative data source |
