// Runtime API helpers plus static fragrance app configuration.
const API_BASE = CONFIG.API_BASE;
const CATALOG_SOURCE_BACKEND = 'backend';
const CATALOG_SOURCE_FALLBACK = 'fallback';
let fragranceDB = [];
let fragranceCatalogSource = CATALOG_SOURCE_BACKEND;

function cloneFragranceRecord(fragrance) {
    return {
        ...fragrance,
        notes: {
            top: [...((fragrance && fragrance.notes && fragrance.notes.top) || [])],
            heart: [...((fragrance && fragrance.notes && fragrance.notes.heart) || [])],
            base: [...((fragrance && fragrance.notes && fragrance.notes.base) || [])]
        },
        accordTags: [...((fragrance && fragrance.accordTags) || [])],
        noteFamilies: [...((fragrance && fragrance.noteFamilies) || [])],
        seasonTags: [...((fragrance && fragrance.seasonTags) || [])],
        occasionTags: [...((fragrance && fragrance.occasionTags) || [])]
    };
}

function setFragranceCatalog(catalog, source) {
    fragranceCatalogSource = source === CATALOG_SOURCE_FALLBACK
        ? CATALOG_SOURCE_FALLBACK
        : CATALOG_SOURCE_BACKEND;
    fragranceDB = Array.isArray(catalog) ? catalog.map(cloneFragranceRecord) : [];
    return fragranceDB;
}

function getCatalogSource() {
    return fragranceCatalogSource;
}

function isUsingFallbackCatalog() {
    return getCatalogSource() === CATALOG_SOURCE_FALLBACK;
}

function normalizeFragranceSearchValue(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

async function requestApiJson(url, options = {}) {
    const response = await fetch(url, {
        credentials: 'include',
        ...options
    });
    const rawBody = await response.text();
    let payload = null;

    if (rawBody) {
        try {
            payload = JSON.parse(rawBody);
        } catch (error) {
            throw new Error('API returned an invalid JSON response.');
        }
    }

    if (!response.ok) {
        const apiError = new Error(
            payload && payload.error
                ? payload.error
                : `API request failed with status ${response.status}`
        );

        apiError.status = response.status;
        apiError.code = payload && payload.code ? payload.code : 'API_ERROR';
        apiError.payload = payload;
        throw apiError;
    }

    return payload;
}

function parseIntegerOrFallback(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
}

function createJsonRequestOptions(method, payload) {
    return {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {})
    };
}

// Load the live fragrance catalog so starter picks, profile saves, and dupe lookups still work.
async function loadFragranceCatalog() {
    const catalog = await requestApiJson(`${API_BASE}/fragrances?limit=25000`);

    if (!Array.isArray(catalog)) {
        throw new Error('The fragrance catalog response was not an array.');
    }

    return setFragranceCatalog(catalog, CATALOG_SOURCE_BACKEND);
}

function loadFallbackFragranceCatalog() {
    return setFragranceCatalog(FALLBACK_FRAGRANCE_CATALOG, CATALOG_SOURCE_FALLBACK);
}

// Fetch fragrance suggestions for the autocomplete search field.
async function fetchFragranceSuggestions(query) {
    const trimmedQuery = normalizeFragranceSearchValue(query);

    if (trimmedQuery.length < 1) {
        return [];
    }

    return fragranceDB
        .map((fragrance) => {
            const nameNeedle = normalizeFragranceSearchValue(fragrance && fragrance.name);
            const houseNeedle = normalizeFragranceSearchValue(fragrance && fragrance.house);
            const combinedNeedle = `${nameNeedle} ${houseNeedle}`.trim();
            let rank = -1;
            let matchIndex = Number.MAX_SAFE_INTEGER;

            if (nameNeedle.startsWith(trimmedQuery)) {
                rank = 0;
                matchIndex = 0;
            } else if (houseNeedle === trimmedQuery) {
                rank = 1;
                matchIndex = 0;
            } else if (houseNeedle.startsWith(trimmedQuery)) {
                rank = 2;
                matchIndex = 0;
            } else if (nameNeedle.includes(trimmedQuery)) {
                rank = 3;
                matchIndex = nameNeedle.indexOf(trimmedQuery);
            } else if (houseNeedle.includes(trimmedQuery)) {
                rank = 4;
                matchIndex = houseNeedle.indexOf(trimmedQuery);
            } else if (combinedNeedle.includes(trimmedQuery)) {
                rank = 5;
                matchIndex = combinedNeedle.indexOf(trimmedQuery);
            }

            if (rank === -1) {
                return null;
            }

            return {
                fragrance,
                rank,
                matchIndex
            };
        })
        .filter(Boolean)
        .sort((left, right) => (
            left.rank - right.rank
            || left.matchIndex - right.matchIndex
            || left.fragrance.name.localeCompare(right.fragrance.name)
            || String(left.fragrance.house || '').localeCompare(String(right.fragrance.house || ''))
        ))
        .map(({ fragrance }) => `${fragrance.name} — ${fragrance.house}`)
        .slice(0, 25);
}

// Send user preferences to the backend and get ranked recommendations.
async function fetchRecommendations(userState) {
    const derivedScentProfile = (
        userState
        && userState.interpretation
        && userState.interpretation.scent
        && userState.interpretation.scent.derivedProfile
        && typeof userState.interpretation.scent.derivedProfile === 'object'
    )
        ? userState.interpretation.scent.derivedProfile
        : { families: [], notes: [], accords: [] };

    const recommendations = await requestApiJson(`${API_BASE}/recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            favorites: userState.favorites || [],
            excludeIds: userState.favorites || [],
            gender: userState.gender || '',
            noteFamilies: userState.selectedFamilies || [],
            accordTags: userState.selectedAccords || [],
            occasions: userState.occasions || [],
            climates: userState.climates || [],
            budget: parseIntegerOrFallback(userState.budget, 2),
            performance: parseIntegerOrFallback(userState.performance, 50),
            selectedNotes: userState.selectedNotes || [],
            scentDescription: userState.scentDescription || '',
            usageDescription: '',
            derivedProfile: {
                scent: {
                    families: derivedScentProfile.families || [],
                    notes: derivedScentProfile.notes || [],
                    accords: derivedScentProfile.accords || []
                }
            }
        })
    });

    if (!Array.isArray(recommendations)) {
        throw new Error('The recommendation response was not an array.');
    }

    return recommendations;
}

async function fetchAuthSession() {
    return requestApiJson(`${API_BASE}/auth/session`);
}

async function signupAccount({ email, password }) {
    return requestApiJson(
        `${API_BASE}/auth/signup`,
        createJsonRequestOptions('POST', { email, password })
    );
}

async function verifyEmailCode({ email, code }) {
    return requestApiJson(
        `${API_BASE}/auth/verify-email`,
        createJsonRequestOptions('POST', { email, code })
    );
}

async function resendVerificationCode({ email }) {
    return requestApiJson(
        `${API_BASE}/auth/resend-verification`,
        createJsonRequestOptions('POST', { email })
    );
}

async function loginAccount({ email, password }) {
    return requestApiJson(
        `${API_BASE}/auth/login`,
        createJsonRequestOptions('POST', { email, password })
    );
}

async function logoutAccountRequest() {
    return requestApiJson(
        `${API_BASE}/auth/logout`,
        createJsonRequestOptions('POST', {})
    );
}

async function requestPasswordReset({ email }) {
    return requestApiJson(
        `${API_BASE}/auth/forgot-password`,
        createJsonRequestOptions('POST', { email })
    );
}

async function resetPasswordWithCode({ email, code, password }) {
    return requestApiJson(
        `${API_BASE}/auth/reset-password`,
        createJsonRequestOptions('POST', { email, code, password })
    );
}

async function saveAccountState(payload) {
    return requestApiJson(
        `${API_BASE}/account/state`,
        createJsonRequestOptions('PUT', payload)
    );
}

async function saveRecommendationForAccount(fragranceId) {
    return requestApiJson(
        `${API_BASE}/account/saved-fragrances`,
        createJsonRequestOptions('POST', { fragranceId })
    );
}

async function mergeGuestAccountState(payload) {
    return requestApiJson(
        `${API_BASE}/account/merge-guest-state`,
        createJsonRequestOptions('POST', payload)
    );
}

async function interpretPreferenceText({ kind, text }) {
    return requestApiJson(`${API_BASE}/interpret`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            kind: String(kind || '').trim(),
            text: String(text || '')
        })
    });
}

async function transcribePreferenceAudio(formData) {
    return requestApiJson(`${API_BASE}/transcribe`, {
        method: 'POST',
        body: formData
    });
}

// Hierarchical note families — each family has sub-notes the user can drill into
const SCENT_FAMILIES = [
    { id: "woody",    label: "Woody",              desc: "Cedar, Sandalwood, Oud, Vetiver",
      notes: ["Cedar", "Sandalwood", "Oud", "Vetiver", "Birch", "Patchouli", "Oakmoss", "Rosewood"],
      helpText: "Grounded and dry, woody notes feel smooth, forest-like, and comforting. They usually read warm, polished, and quietly confident." },
    { id: "citrus",   label: "Citrus",             desc: "Bergamot, Lemon, Grapefruit, Neroli",
      notes: ["Bergamot", "Lemon", "Grapefruit", "Lime", "Neroli", "Orange"],
      helpText: "Bright and sparkling, citrus notes feel crisp, airy, and energizing. They are ideal if you like scents that open clean and refreshing." },
    { id: "floral",   label: "Floral",             desc: "Rose, Jasmine, Iris, Lavender",
      notes: ["Rose", "Jasmine", "Iris", "Violet", "Peony", "Geranium", "Lavender"],
      helpText: "Floral notes bring softness, elegance, and lift. Depending on the flowers, they can feel romantic, airy, fresh, or gently aromatic." },
    { id: "spicy",    label: "Spicy",              desc: "Cardamom, Cinnamon, Pepper, Saffron",
      notes: ["Cardamom", "Cinnamon", "Pepper", "Nutmeg", "Saffron", "Clove", "Pink Pepper"],
      helpText: "Spicy notes add warmth, texture, and movement. They often make a fragrance feel lively, sensual, and a little more daring." },
    { id: "sweet",    label: "Sweet & Gourmand",   desc: "Vanilla, Tonka, Caramel, Rum",
      notes: ["Vanilla", "Tonka Bean", "Caramel", "Rum", "Chocolate", "Honey"],
      helpText: "Sweet and gourmand notes smell edible, creamy, or dessert-like. Think cozy warmth, addictive sweetness, and a more indulgent mood." },
    { id: "fresh",    label: "Fresh & Aquatic",    desc: "Sea Notes, Mint, Green Leaves",
      notes: ["Sea Notes", "Mint", "Green Leaves", "Apple", "Cucumber", "Juniper"],
      helpText: "Fresh and aquatic notes feel cool, breezy, and clean. They suit people who like scents that smell airy, easygoing, and just-showered." },
    { id: "leather",  label: "Leather & Tobacco",  desc: "Suede, Tobacco, Smoke, Birch Tar",
      notes: ["Leather", "Tobacco Leaf", "Smoke", "Suede", "Birch Tar"],
      helpText: "Leather and tobacco notes feel rich, smoky, and textured. They often give a fragrance a darker, moodier, more dressed-up edge." },
    { id: "amber",    label: "Amber & Resin",      desc: "Amber, Incense, Benzoin, Myrrh",
      notes: ["Amber", "Incense", "Benzoin", "Myrrh", "Fir Resin", "Styrax"],
      helpText: "Amber and resin notes feel glowing, smooth, and enveloping. They add depth and warmth with a slightly balsamic or incense-like feel." },
    { id: "animalic", label: "Animalic & Musk",    desc: "Musk, Civet, Ambergris, Ambroxan",
      notes: ["Musk", "Civet", "Castoreum", "Ambrette", "Ambergris", "Ambroxan"],
      helpText: "Animalic and musk notes feel skin-like, intimate, and sensual. They can make a fragrance feel warmer, deeper, and more magnetic." }
];

// Broader scent accords — overarching fragrance families
const ACCORD_PALETTE = [
    {
        label: "Oriental",
        helpText: "Oriental accords are warm, plush, and opulent, often built around amber, spice, vanilla, or resins. They usually feel rich, sensual, and evening-leaning."
    },
    {
        label: "Chypre",
        helpText: "Chypre accords balance brightness with earthiness, often pairing citrus up top with mossy, woody depth. They feel polished, structured, and quietly elegant."
    },
    {
        label: "Fougère",
        helpText: "Fougere accords combine freshness with herbs, lavender, woods, and coumarin. They often smell clean, classic, and barbershop-inspired."
    },
    {
        label: "Aromatic",
        helpText: "Aromatic accords center on herbs and green freshness like lavender, rosemary, sage, or basil. They feel crisp, breezy, and effortlessly wearable."
    },
    {
        label: "Aquatic",
        helpText: "Aquatic accords evoke sea air, watery freshness, and cool movement. They usually smell airy, modern, and very clean."
    },
    {
        label: "Gourmand",
        helpText: "Gourmand accords lean edible, with tones like vanilla, caramel, cocoa, or coffee. They feel cozy, playful, and deliciously sweet."
    },
    {
        label: "Fresh Clean",
        helpText: "Fresh Clean accords focus on a crisp, just-showered effect. They usually feel light, uplifting, and easy to reach for every day."
    },
    {
        label: "Dark & Smoky",
        helpText: "Dark and smoky accords bring charred woods, incense, leather, or ember-like warmth. They feel bold, mysterious, and more dramatic."
    },
    {
        label: "Powdery",
        helpText: "Powdery accords feel soft, smooth, and cloud-like. They often create a refined, comforting finish with a clean skin or makeup-powder feel."
    },
    {
        label: "Earthy",
        helpText: "Earthy accords highlight soil, moss, roots, patchouli, or damp woods. They feel grounded, natural, and quietly rugged."
    }
];

// blindBuyScore values are approximate placeholders; the backend derives scores
// from community rating count, rating value, and moderate sillage weighting.
const FALLBACK_FRAGRANCE_CATALOG = [
    {
        id: "creed-aventus",
        name: "Aventus",
        house: "Creed",
        gender: "men",
        vibe: "Fresh & Powerful",
        priceTier: 3,
        longevityScore: 8.5,
        sillageScore: 8.2,
        blindBuyScore: 78,
        archetype: "The Confident Leader",
        dupeOf: null,
        notes: {
            top: ["Pineapple", "Blackcurrant", "Bergamot"],
            heart: ["Birch", "Patchouli", "Jasmine"],
            base: ["Oakmoss", "Ambergris", "Vanilla"]
        },
        accordTags: ["Fresh Clean", "Aromatic", "Earthy"],
        noteFamilies: ["citrus", "fresh", "woody"],
        seasonTags: ["Spring", "Summer", "Fall", "All-year Signature"],
        occasionTags: ["Office", "Casual", "Formal/Event", "Everyday/Signature"]
    },
    {
        id: "mfk-baccarat-rouge-540",
        name: "Baccarat Rouge 540",
        house: "MFK",
        gender: "unisex",
        vibe: "Sweet & Magnetic",
        priceTier: 3,
        longevityScore: 9.2,
        sillageScore: 9.0,
        blindBuyScore: 74,
        archetype: "The Enigmatic Allure",
        dupeOf: null,
        notes: {
            top: ["Saffron", "Jasmine"],
            heart: ["Amberwood", "Ambergris"],
            base: ["Fir Resin", "Cedar"]
        },
        accordTags: ["Oriental", "Gourmand"],
        noteFamilies: ["sweet", "amber", "woody"],
        seasonTags: ["Fall", "Winter"],
        occasionTags: ["Date Night", "Formal/Event", "Clubbing"]
    },
    {
        id: "chanel-bleu-de-chanel",
        name: "Bleu de Chanel",
        house: "Chanel",
        gender: "men",
        vibe: "Clean & Versatile",
        priceTier: 3,
        longevityScore: 8.0,
        sillageScore: 7.5,
        blindBuyScore: 82,
        archetype: "The Easygoing Optimist",
        dupeOf: null,
        notes: {
            top: ["Grapefruit", "Lemon", "Mint"],
            heart: ["Ginger", "Nutmeg", "Jasmine"],
            base: ["Incense", "Cedar", "Sandalwood"]
        },
        accordTags: ["Fresh Clean", "Aromatic"],
        noteFamilies: ["citrus", "fresh", "woody", "spicy"],
        seasonTags: ["Spring", "Summer", "Fall", "All-year Signature"],
        occasionTags: ["Office", "Casual", "Formal/Event", "Everyday/Signature"]
    },
    {
        id: "ysl-la-nuit-de-l-homme",
        name: "La Nuit de l'Homme",
        house: "YSL",
        gender: "men",
        vibe: "Dark & Seductive",
        priceTier: 2,
        longevityScore: 7.4,
        sillageScore: 6.8,
        blindBuyScore: 68,
        archetype: "The Dark Romantic",
        dupeOf: null,
        notes: {
            top: ["Cardamom"],
            heart: ["Lavender", "Cedar", "Bergamot"],
            base: ["Vetiver", "Caraway"]
        },
        accordTags: ["Aromatic", "Dark & Smoky"],
        noteFamilies: ["spicy", "woody", "fresh"],
        seasonTags: ["Fall", "Winter"],
        occasionTags: ["Date Night", "Intimate", "Formal/Event"]
    },
    {
        id: "tom-ford-oud-wood",
        name: "Oud Wood",
        house: "Tom Ford",
        gender: "unisex",
        vibe: "Woody & Refined",
        priceTier: 3,
        longevityScore: 8.1,
        sillageScore: 7.1,
        blindBuyScore: 61,
        archetype: "The Provocateur",
        dupeOf: null,
        notes: {
            top: ["Cardamom", "Pink Pepper"],
            heart: ["Oud", "Sandalwood", "Vetiver"],
            base: ["Tonka Bean", "Amber", "Vanilla"]
        },
        accordTags: ["Oriental", "Earthy", "Dark & Smoky"],
        noteFamilies: ["woody", "spicy", "amber"],
        seasonTags: ["Fall", "Winter"],
        occasionTags: ["Date Night", "Formal/Event", "Intimate"]
    },
    {
        id: "armani-acqua-di-gio-profumo",
        name: "Acqua di Giò Profumo",
        house: "Armani",
        gender: "men",
        vibe: "Aquatic & Fresh",
        priceTier: 2,
        longevityScore: 8.1,
        sillageScore: 7.3,
        blindBuyScore: 80,
        archetype: "The Free Spirit",
        dupeOf: null,
        notes: {
            top: ["Sea Notes", "Bergamot"],
            heart: ["Rosemary", "Sage", "Geranium"],
            base: ["Incense", "Patchouli"]
        },
        accordTags: ["Aquatic", "Fresh Clean", "Aromatic"],
        noteFamilies: ["fresh", "citrus", "woody"],
        seasonTags: ["Spring", "Summer"],
        occasionTags: ["Casual", "Office", "Vacation/Holiday", "Everyday/Signature"]
    },
    {
        id: "tom-ford-tobacco-vanille",
        name: "Tobacco Vanille",
        house: "Tom Ford",
        gender: "unisex",
        vibe: "Warm & Cozy",
        priceTier: 3,
        longevityScore: 9.1,
        sillageScore: 8.7,
        blindBuyScore: 58,
        archetype: "The Bold Extrovert",
        dupeOf: null,
        notes: {
            top: ["Tobacco Leaf", "Spices"],
            heart: ["Vanilla", "Tonka Bean", "Cacao"],
            base: ["Dried Fruits", "Woody Notes"]
        },
        accordTags: ["Gourmand", "Oriental", "Dark & Smoky"],
        noteFamilies: ["sweet", "spicy", "leather", "amber"],
        seasonTags: ["Fall", "Winter"],
        occasionTags: ["Date Night", "Clubbing", "Formal/Event"]
    },
    {
        id: "le-labo-santal-33",
        name: "Santal 33",
        house: "Le Labo",
        gender: "unisex",
        vibe: "Artsy & Unique",
        priceTier: 3,
        longevityScore: 7.8,
        sillageScore: 7.0,
        blindBuyScore: 63,
        archetype: "The Modern Aesthete",
        dupeOf: null,
        notes: {
            top: ["Cardamom", "Violet"],
            heart: ["Iris", "Papyrus"],
            base: ["Sandalwood", "Cedar", "Leather"]
        },
        accordTags: ["Earthy", "Powdery", "Aromatic"],
        noteFamilies: ["woody", "leather", "floral"],
        seasonTags: ["Spring", "Fall", "All-year Signature"],
        occasionTags: ["Casual", "Office", "Everyday/Signature", "Vacation/Holiday"]
    }
];

// "Start Here" curated picks for users without a fragrance in mind
const STARTER_PICKS = FALLBACK_FRAGRANCE_CATALOG.map(({ name, house, vibe }) => ({
    name,
    house,
    vibe
}));

// Archetypes description
const ARCHETYPES = {
    "The Dark Romantic": "You gravitate towards mystery and depth. Woods, spices, and intoxicating resins are your weapon of choice. Perfect for close encounters.",
    "The Confident Leader": "Assertive, fresh, and universally respected. You command attention perfectly balanced with approachability.",
    "The Provocateur": "You are unafraid of polarising opinions. Animalic and deeply sensual notes draw you in, leaving an unforgettable trail.",
    "The Free Spirit": "Airy, natural, and grounded. You prefer scents that feel like an extension of the earth and a crisp breeze.",
    "The Bold Extrovert": "You want to be noticed before you even enter the room. High sillage and undeniable presence are your hallmarks.",
    "The Modern Aesthete": "Avant-garde and artistic. You appreciate clean lines, minimalism, and abstract perfumery that makes people ask 'what is that?'.",
    "The Easygoing Optimist": "Fresh, uplifting, and totally uncomplicated. Your scent is a breath of fresh air that offends no one.",
    "The Enigmatic Allure": "Sweet but transparent, loud but airy. You embody modern luxury that is impossible to pin down.",
    "The Coastal Minimalist": "Crisp, airy, polished, and quietly luxe. A sea-glass profile built for mineral freshness, clean lines, and understated confidence.",
    "The Refined Wanderer": "Grounded but polished. A tailored outdoors profile built on green, citrus, aromatic, and woody structure.",
    "The Solar Muse": "Radiant, warm, playful, and vacation-coded. A luminous profile for tropical, lactonic, citrus-fruity, sunlit scents.",
    "The Velvet Connoisseur": "Rich, indulgent, and sophisticated. A cocktail-lounge profile for boozy, tobacco, coffee, cacao, honey, amber, and warm gourmand depth."
};

const OCCASION_OPTIONS = [
    "Office", "Casual", "Date Night", "Clubbing", "Intimate",
    "Formal/Event", "Gym/Active", "Bedtime/Relaxing",
    "Vacation/Holiday", "Everyday/Signature"
];

const CLIMATE_OPTIONS = [
    "Hot & Humid",
    "Dry Heat",
    "Breezy Coastal",
    "Tropical",
    "Mild Everyday",
    "Rainy & Overcast",
    "Cool Air",
    "Cold & Snowy"
];
