// Runtime API helpers plus static fragrance app configuration.
const API_BASE = 'http://localhost:3001/api';
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

async function requestApiJson(url, options = {}) {
    const response = await fetch(url, options);
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

// Load the live fragrance catalog so starter picks, profile saves, and dupe lookups still work.
async function loadFragranceCatalog() {
    const catalog = await requestApiJson(`${API_BASE}/fragrances?limit=5000`);

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
    if (isUsingFallbackCatalog()) {
        return [];
    }

    const trimmedQuery = String(query || '').trim();

    if (trimmedQuery.length < 2) {
        return [];
    }

    const matches = await requestApiJson(
        `${API_BASE}/fragrances/search?q=${encodeURIComponent(trimmedQuery)}`
    );

    if (!Array.isArray(matches)) {
        throw new Error('The fragrance search response was not an array.');
    }

    return matches.map(fragrance => `${fragrance.name} — ${fragrance.house}`);
}

// Send user preferences to the backend and get ranked recommendations.
async function fetchRecommendations(userState) {
    const recommendations = await requestApiJson(`${API_BASE}/recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            noteFamilies: userState.selectedFamilies || [],
            accordTags: userState.selectedAccords || [],
            occasions: userState.occasions || [],
            climates: userState.climates || [],
            budget: parseIntegerOrFallback(userState.budget, 2),
            performance: parseIntegerOrFallback(userState.performance, 50),
            selectedNotes: userState.selectedNotes || [],
            scentDescription: userState.scentDescription || '',
            usageDescription: userState.usageDescription || ''
        })
    });

    if (!Array.isArray(recommendations)) {
        throw new Error('The recommendation response was not an array.');
    }

    return recommendations;
}

// Hierarchical note families — each family has sub-notes the user can drill into
const SCENT_FAMILIES = [
    { id: "woody",    label: "Woody",              desc: "Cedar, Sandalwood, Oud, Vetiver",
      notes: ["Cedar", "Sandalwood", "Oud", "Vetiver", "Birch", "Patchouli", "Oakmoss", "Rosewood"] },
    { id: "citrus",   label: "Citrus",             desc: "Bergamot, Lemon, Grapefruit, Neroli",
      notes: ["Bergamot", "Lemon", "Grapefruit", "Lime", "Neroli", "Orange"] },
    { id: "floral",   label: "Floral",             desc: "Rose, Jasmine, Iris, Lavender",
      notes: ["Rose", "Jasmine", "Iris", "Violet", "Peony", "Geranium", "Lavender"] },
    { id: "spicy",    label: "Spicy",              desc: "Cardamom, Cinnamon, Pepper, Saffron",
      notes: ["Cardamom", "Cinnamon", "Pepper", "Nutmeg", "Saffron", "Clove", "Pink Pepper"] },
    { id: "sweet",    label: "Sweet & Gourmand",   desc: "Vanilla, Tonka, Caramel, Rum",
      notes: ["Vanilla", "Tonka Bean", "Caramel", "Rum", "Chocolate", "Honey"] },
    { id: "fresh",    label: "Fresh & Aquatic",    desc: "Sea Notes, Mint, Green Leaves",
      notes: ["Sea Notes", "Mint", "Green Leaves", "Apple", "Cucumber", "Juniper"] },
    { id: "leather",  label: "Leather & Tobacco",  desc: "Suede, Tobacco, Smoke, Birch Tar",
      notes: ["Leather", "Tobacco Leaf", "Smoke", "Suede", "Birch Tar"] },
    { id: "amber",    label: "Amber & Resin",      desc: "Amber, Incense, Benzoin, Myrrh",
      notes: ["Amber", "Incense", "Benzoin", "Myrrh", "Fir Resin", "Styrax"] },
    { id: "animalic", label: "Animalic & Musk",    desc: "Musk, Civet, Ambergris, Ambroxan",
      notes: ["Musk", "Civet", "Castoreum", "Ambrette", "Ambergris", "Ambroxan"] }
];

// Broader scent accords — overarching fragrance families
const ACCORD_PALETTE = [
    "Oriental", "Chypre", "Fougère", "Aromatic", "Aquatic",
    "Gourmand", "Fresh Clean", "Dark & Smoky", "Powdery", "Earthy"
];

const FALLBACK_FRAGRANCE_CATALOG = [
    {
        id: "creed-aventus",
        name: "Aventus",
        house: "Creed",
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
    "The Enigmatic Allure": "Sweet but transparent, loud but airy. You embody modern luxury that is impossible to pin down."
};

const OCCASION_OPTIONS = [
    "Office", "Casual", "Date Night", "Clubbing", "Intimate",
    "Formal/Event", "Gym/Active", "Bedtime/Relaxing",
    "Vacation/Holiday", "Everyday/Signature"
];

const CLIMATE_OPTIONS = [
    "Hot & Humid", "Dry & Desert", "Temperate", "Cold & Crisp", "Tropical"
];
