// Fragrance Database (Mock Data)
const fragranceDB = [
    {
        id: "tf-oud-wood",
        name: "Oud Wood",
        house: "Tom Ford",
        priceTier: 3,
        notes: {
            top: ["Rosewood", "Cardamom", "Chinese Pepper"],
            heart: ["Oud", "Sandalwood", "Vetiver"],
            base: ["Tonka Bean", "Vanilla", "Amber"]
        },
        antiNotes: ["Sweet", "Floral", "Citrus", "Aquatic"],
        noteFamilies: ["woody", "spicy", "amber"],
        accordTags: ["Oriental", "Dark & Smoky"],
        longevityScore: 7,
        sillageScore: 6,
        blindBuyScore: 65,
        seasonTags: ["Fall", "Winter"],
        occasionTags: ["Date Night", "Office"],
        archetype: "The Dark Romantic"
    },
    {
        id: "creed-aventus",
        name: "Aventus",
        house: "Creed",
        priceTier: 3,
        notes: {
            top: ["Pineapple", "Bergamot", "Black Currant", "Apple"],
            heart: ["Birch", "Patchouli", "Moroccan Jasmine", "Rose"],
            base: ["Musk", "Oak moss", "Ambergris", "Vanilla"]
        },
        antiNotes: ["Heavy Amber", "Oud", "Gourmand"],
        noteFamilies: ["woody", "fresh", "floral"],
        accordTags: ["Aromatic", "Fresh Clean"],
        longevityScore: 8,
        sillageScore: 8,
        blindBuyScore: 85,
        seasonTags: ["Spring", "Summer", "All-year Signature"],
        occasionTags: ["Office", "Casual", "Clubbing"],
        archetype: "The Confident Leader"
    },
    {
        id: "mkk",
        name: "Muscs Koublai Khan",
        house: "Serge Lutens",
        priceTier: 3,
        notes: {
            top: ["Civet", "Castoreum"],
            heart: ["Ambrette", "Cumin", "Costus Root"],
            base: ["Musk", "Patchouli", "Vanilla"]
        },
        antiNotes: ["Clean", "Fresh", "Citrus", "Fruity", "Aquatic"],
        noteFamilies: ["animalic", "spicy", "sweet"],
        accordTags: ["Oriental", "Dark & Smoky"],
        longevityScore: 9,
        sillageScore: 7,
        blindBuyScore: 10,
        seasonTags: ["Fall", "Winter"],
        occasionTags: ["Date Night", "Intimate"],
        archetype: "The Provocateur"
    },
    {
        id: "by-gipsy-water",
        name: "Gypsy Water",
        house: "Byredo",
        priceTier: 3,
        notes: {
            top: ["Bergamot", "Lemon", "Pepper", "Juniper"],
            heart: ["Incense", "Pine Needles", "Orris"],
            base: ["Amber", "Vanilla", "Sandalwood"]
        },
        antiNotes: ["Oud", "Heavy Leather", "Animalic", "Loud"],
        noteFamilies: ["citrus", "woody", "amber"],
        accordTags: ["Aromatic", "Earthy"],
        longevityScore: 5,
        sillageScore: 4,
        blindBuyScore: 90,
        seasonTags: ["Spring", "Summer", "Fall"],
        occasionTags: ["Casual", "Office", "Intimate"],
        archetype: "The Free Spirit"
    },
    {
        id: "ysl-la-nuit",
        name: "La Nuit de l'Homme",
        house: "Yves Saint Laurent",
        priceTier: 2,
        notes: {
            top: ["Cardamom"],
            heart: ["Lavender", "Virginia Cedar", "Bergamot"],
            base: ["Vetiver", "Caraway"]
        },
        antiNotes: ["Oud", "Animalic", "Aquatic"],
        noteFamilies: ["spicy", "floral", "woody"],
        accordTags: ["Aromatic", "Dark & Smoky"],
        longevityScore: 6,
        sillageScore: 6,
        blindBuyScore: 80,
        seasonTags: ["Fall", "Winter", "Spring"],
        occasionTags: ["Date Night"],
        archetype: "The Dark Romantic"
    },
    {
        id: "adg-profumo",
        name: "Acqua di Giò Profumo",
        house: "Giorgio Armani",
        priceTier: 2,
        notes: {
            top: ["Sea Notes", "Bergamot"],
            heart: ["Rosemary", "Sage", "Geranium"],
            base: ["Incense", "Patchouli"]
        },
        antiNotes: ["Gourmand", "Sweet", "Heavy Vanilla", "Oud"],
        noteFamilies: ["fresh", "citrus", "amber"],
        accordTags: ["Aquatic", "Aromatic", "Fresh Clean"],
        longevityScore: 8,
        sillageScore: 8,
        blindBuyScore: 95,
        seasonTags: ["Summer", "Spring", "All-year Signature"],
        occasionTags: ["Office", "Casual", "Clubbing"],
        archetype: "The Confident Leader"
    },
    {
        id: "dior-sauvage-elixir",
        name: "Sauvage Elixir",
        house: "Dior",
        priceTier: 3,
        notes: {
            top: ["Nutmeg", "Cinnamon", "Cardamom", "Grapefruit"],
            heart: ["Lavender"],
            base: ["Licorice", "Sandalwood", "Amber", "Patchouli", "Vetiver"]
        },
        antiNotes: ["Subtle", "Skin Scent", "Aquatic", "Floral"],
        noteFamilies: ["spicy", "woody", "amber"],
        accordTags: ["Aromatic", "Dark & Smoky"],
        longevityScore: 10,
        sillageScore: 10,
        blindBuyScore: 60,
        seasonTags: ["Fall", "Winter"],
        occasionTags: ["Clubbing", "Date Night"],
        archetype: "The Bold Extrovert"
    },
    {
        id: "replica-jazz-club",
        name: "Jazz Club",
        house: "Maison Margiela",
        priceTier: 2,
        notes: {
            top: ["Pink Pepper", "Neroli", "Lemon"],
            heart: ["Rum", "Vetiver", "Clary Sage"],
            base: ["Tobacco Leaf", "Vanilla Bean", "Styrax"]
        },
        antiNotes: ["Aquatic", "Fresh", "Green"],
        noteFamilies: ["leather", "spicy", "sweet"],
        accordTags: ["Oriental", "Dark & Smoky"],
        longevityScore: 8,
        sillageScore: 7,
        blindBuyScore: 70,
        seasonTags: ["Fall", "Winter"],
        occasionTags: ["Date Night", "Casual"],
        archetype: "The Dark Romantic"
    },
    {
        id: "le-labo-santal-33",
        name: "Santal 33",
        house: "Le Labo",
        priceTier: 3,
        notes: {
            top: ["Violet Accord", "Cardamom"],
            heart: ["Iris", "Papyrus", "Ambrox"],
            base: ["Cedarwood", "Leather", "Sandalwood"]
        },
        antiNotes: ["Sweet", "Fruity", "Aquatic"],
        noteFamilies: ["woody", "leather", "floral"],
        accordTags: ["Aromatic", "Earthy"],
        longevityScore: 9,
        sillageScore: 9,
        blindBuyScore: 50,
        seasonTags: ["Fall", "Spring", "All-year Signature"],
        occasionTags: ["Casual", "Office"],
        archetype: "The Modern Aesthete"
    },
    {
        id: "versace-eros",
        name: "Eros",
        house: "Versace",
        priceTier: 1,
        notes: {
            top: ["Mint", "Green Apple", "Lemon"],
            heart: ["Tonka Bean", "Ambroxan", "Geranium"],
            base: ["Vanilla", "Cedar", "Vetiver", "Oakmoss"]
        },
        antiNotes: ["Subtle", "Earthy", "Oud", "Animalic"],
        noteFamilies: ["fresh", "sweet", "woody"],
        accordTags: ["Aromatic", "Fresh Clean"],
        longevityScore: 9,
        sillageScore: 9,
        blindBuyScore: 80,
        seasonTags: ["Fall", "Winter", "Spring"],
        occasionTags: ["Clubbing"],
        archetype: "The Bold Extrovert"
    },
    {
        id: "nautica-voyage",
        name: "Voyage",
        house: "Nautica",
        priceTier: 1,
        notes: {
            top: ["Green Leaves", "Apple"],
            heart: ["Lotus", "Water Mimosa"],
            base: ["Cedar", "Musk", "Amber", "Oakmoss"]
        },
        antiNotes: ["Oud", "Heavy Vanilla", "Tobacco", "Leather"],
        noteFamilies: ["fresh", "woody", "animalic"],
        accordTags: ["Aquatic", "Fresh Clean"],
        longevityScore: 6,
        sillageScore: 6,
        blindBuyScore: 95,
        seasonTags: ["Summer", "Spring"],
        occasionTags: ["Casual", "Office"],
        archetype: "The Easygoing Optimist"
    },
    {
        id: "cdnim",
        name: "Club de Nuit Intense Man",
        house: "Armaf",
        priceTier: 1,
        dupeOf: "creed-aventus",
        notes: {
            top: ["Lemon", "Pineapple", "Black Currant", "Bergamot", "Apple"],
            heart: ["Birch", "Jasmine", "Rose"],
            base: ["Musk", "Ambergris", "Patchouli", "Vanilla"]
        },
        antiNotes: ["Heavy Amber", "Oud", "Gourmand"],
        noteFamilies: ["woody", "fresh", "floral"],
        accordTags: ["Aromatic", "Fresh Clean"],
        longevityScore: 9,
        sillageScore: 9,
        blindBuyScore: 85,
        seasonTags: ["Spring", "Summer", "All-year Signature"],
        occasionTags: ["Office", "Casual", "Clubbing"],
        archetype: "The Confident Leader"
    },
    {
        id: "zara-rich-warm-addictive",
        name: "Tobacco Collection Rich Warm Addictive",
        house: "Zara",
        priceTier: 1,
        notes: {
            top: ["Rum"],
            heart: ["Peony"],
            base: ["Vanilla Bourbon", "Tobacco"]
        },
        antiNotes: ["Fresh", "Citrus", "Aquatic", "Green"],
        noteFamilies: ["leather", "sweet", "amber"],
        accordTags: ["Oriental", "Gourmand"],
        longevityScore: 6,
        sillageScore: 5,
        blindBuyScore: 80,
        seasonTags: ["Fall", "Winter"],
        occasionTags: ["Date Night", "Casual"],
        archetype: "The Dark Romantic"
    },
    {
        id: "k-wood-mystique",
        name: "Woody Oud",
        house: "Maison Alhambra",
        priceTier: 1,
        dupeOf: "tf-oud-wood",
        notes: {
            top: ["Rosewood", "Cardamom", "Chinese Pepper"],
            heart: ["Oud", "Sandalwood", "Vetiver"],
            base: ["Tonka Bean", "Vanilla", "Amber"]
        },
        antiNotes: ["Sweet", "Floral", "Citrus", "Aquatic"],
        noteFamilies: ["woody", "spicy", "amber"],
        accordTags: ["Oriental", "Dark & Smoky"],
        longevityScore: 6,
        sillageScore: 5,
        blindBuyScore: 70,
        seasonTags: ["Fall", "Winter"],
        occasionTags: ["Date Night", "Office"],
        archetype: "The Dark Romantic"
    },
    {
        id: "br540",
        name: "Baccarat Rouge 540",
        house: "Maison Francis Kurkdjian",
        priceTier: 3,
        notes: {
            top: ["Saffron", "Jasmine"],
            heart: ["Amberwood", "Ambergris"],
            base: ["Fir Resin", "Cedar"]
        },
        antiNotes: ["Fresh", "Citrus", "Leather", "Oud", "Barbershop"],
        noteFamilies: ["sweet", "amber", "floral"],
        accordTags: ["Oriental", "Gourmand", "Powdery"],
        longevityScore: 10,
        sillageScore: 9,
        blindBuyScore: 75,
        seasonTags: ["Fall", "Winter", "Spring", "All-year Signature"],
        occasionTags: ["Date Night", "Clubbing", "Casual"],
        archetype: "The Enigmatic Allure"
    }
];

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

// "Start Here" curated picks for users without a fragrance in mind
const STARTER_PICKS = [
    { name: "Aventus", house: "Creed", vibe: "Fresh & Powerful", icon: "🍍" },
    { name: "Baccarat Rouge 540", house: "MFK", vibe: "Sweet & Magnetic", icon: "✨" },
    { name: "Bleu de Chanel", house: "Chanel", vibe: "Clean & Versatile", icon: "💎" },
    { name: "La Nuit de l'Homme", house: "YSL", vibe: "Dark & Seductive", icon: "🌙" },
    { name: "Oud Wood", house: "Tom Ford", vibe: "Woody & Refined", icon: "🪵" },
    { name: "Acqua di Giò Profumo", house: "Armani", vibe: "Aquatic & Fresh", icon: "🌊" },
    { name: "Tobacco Vanille", house: "Tom Ford", vibe: "Warm & Cozy", icon: "🔥" },
    { name: "Santal 33", house: "Le Labo", vibe: "Artsy & Unique", icon: "🎨" }
];

// Curated autocomplete suggestions for the Favorites input (Step 1)
const FRAGRANCE_SUGGESTIONS = [
    "Aventus — Creed",
    "Oud Wood — Tom Ford",
    "Baccarat Rouge 540 — Maison Francis Kurkdjian",
    "Santal 33 — Le Labo",
    "Gypsy Water — Byredo",
    "La Nuit de l'Homme — Yves Saint Laurent",
    "Sauvage Elixir — Dior",
    "Bleu de Chanel — Chanel",
    "Acqua di Giò Profumo — Giorgio Armani",
    "Jazz Club — Maison Margiela",
    "Tobacco Vanille — Tom Ford",
    "Green Irish Tweed — Creed",
    "Eros — Versace",
    "The One EDP — Dolce & Gabbana",
    "Spicebomb Extreme — Viktor & Rolf",
    "Voyage — Nautica",
    "Club de Nuit Intense Man — Armaf",
    "Interlude Man — Amouage",
    "Noir de Noir — Tom Ford",
    "Light Blue — Dolce & Gabbana",
    "Y EDP — Yves Saint Laurent",
    "Tuscan Leather — Tom Ford",
    "Reflection Man — Amouage",
    "Pegasus — Parfums de Marly",
    "Layton — Parfums de Marly",
    "Stronger With You Intensely — Emporio Armani",
    "Muscs Koublai Khan — Serge Lutens",
    "Terre d'Hermès — Hermès",
    "Habit Rouge — Guerlain",
    "Tobacco Collection Rich Warm Addictive — Zara",
    "Invictus — Paco Rabanne",
    "1 Million — Paco Rabanne",
    "Dylan Blue — Versace"
];

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
