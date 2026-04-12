const { OlfactoryEngine } = require('../js/logic');

// Sample fragrance database for testing
const testDatabase = [
    {
        id: 'creed-aventus',
        name: 'Aventus',
        house: 'Creed',
        notes: { top: ['Bergamot', 'Pineapple'], heart: ['Jasmine', 'Birch'], base: ['Musk', 'Oakmoss', 'Vanilla'] },
        accordTags: ['woody', 'fruity', 'fresh'],
        noteFamilies: ['citrus', 'woody', 'floral'],
        seasonTags: ['Summer'],
        occasionTags: ['Casual'],
        priceTier: 4,
        longevityScore: 9,
        sillageScore: 7,
        blindBuyScore: 90,
    },
    {
        id: 'tom-ford-oud-wood',
        name: 'Oud Wood',
        house: 'Tom Ford',
        notes: { top: ['Oud', 'Rosewood'], heart: ['Sandalwood', 'Cardamom'], base: ['Tonka Bean', 'Amber'] },
        accordTags: ['woody', 'oriental', 'spicy'],
        noteFamilies: ['woody', 'spicy', 'sweet'],
        seasonTags: ['Winter'],
        occasionTags: ['Date Night'],
        priceTier: 4,
        longevityScore: 7,
        sillageScore: 5,
        blindBuyScore: 84,
    },
    {
        id: 'dior-sauvage',
        name: 'Sauvage',
        house: 'Dior',
        notes: { top: ['Bergamot', 'Pepper'], heart: ['Lavender', 'Geranium'], base: ['Ambroxan', 'Cedar'] },
        accordTags: ['fresh', 'aromatic', 'woody'],
        noteFamilies: ['citrus', 'floral', 'woody'],
        seasonTags: ['Spring', 'Fall', 'Winter', 'Summer'],
        occasionTags: ['Office'],
        priceTier: 3,
        longevityScore: 7,
        sillageScore: 7,
        blindBuyScore: 87,
    },
    // Edge case: fragrance with missing/null fields
    {
        id: 'test-null-frag',
        name: 'Null Fields',
        house: 'Test',
        notes: null,
        accordTags: null,
        noteFamilies: null,
        seasonTags: null,
        occasionTags: null,
        priceTier: 1,
        longevityScore: null,
        sillageScore: null,
        blindBuyScore: 50,
    },
    // Edge case: fragrance with empty arrays
    {
        id: 'test-empty-frag',
        name: 'Empty Arrays',
        house: 'Test',
        notes: { top: [], heart: [], base: [] },
        accordTags: [],
        noteFamilies: [],
        seasonTags: [],
        occasionTags: [],
        priceTier: 2,
        longevityScore: 5,
        sillageScore: 5,
        blindBuyScore: 60,
    },
];

describe('OlfactoryEngine', () => {
    let engine;

    beforeEach(() => {
        engine = new OlfactoryEngine(testDatabase, {});
    });

    describe('normalizeLookup', () => {
        test('lowercases and strips accents', () => {
            expect(engine.normalizeLookup('Café Noir')).toBe('cafe noir');
        });

        test('handles null/undefined', () => {
            expect(engine.normalizeLookup(null)).toBe('');
            expect(engine.normalizeLookup(undefined)).toBe('');
        });

        test('replaces special characters with spaces', () => {
            expect(engine.normalizeLookup('Tom-Ford & Co.')).toBe('tom ford co');
        });
    });

    describe('extractKeywords', () => {
        test('extracts known scent keywords', () => {
            const result = engine.extractKeywords('warm smoky cedar with vanilla');
            expect(result).toContain('warm');
            expect(result).toContain('smoky');
            expect(result).toContain('cedar');
            expect(result).toContain('vanilla');
        });

        test('ignores non-scent words', () => {
            const result = engine.extractKeywords('I want something nice and pretty');
            expect(result).toEqual([]);
        });

        test('handles empty string', () => {
            expect(engine.extractKeywords('')).toEqual([]);
        });
    });

    describe('calculateRecommendations', () => {
        test('returns at most 5 results', () => {
            const state = { budget: 3, performance: 50, occasions: [], climates: [] };
            const results = engine.calculateRecommendations(state);
            expect(results.length).toBeLessThanOrEqual(5);
        });

        test('scores woody family matches higher', () => {
            const state = {
                selectedFamilies: ['woody'],
                budget: 3,
                performance: 60,
                occasions: [],
                climates: [],
            };
            const results = engine.calculateRecommendationPool(state);
            const woodyScores = results.filter(r => r.noteFamilies && r.noteFamilies.includes('woody'));
            const nonWoodyScores = results.filter(r => !r.noteFamilies || !r.noteFamilies.includes('woody'));

            if (woodyScores.length > 0 && nonWoodyScores.length > 0) {
                expect(woodyScores[0].matchScore).toBeGreaterThan(nonWoodyScores[0].matchScore);
            }
        });

        test('does not crash on fragrances with null notes', () => {
            const state = {
                selectedNotes: ['Cedar'],
                budget: 2,
                performance: 50,
                occasions: [],
                climates: [],
            };
            expect(() => engine.calculateRecommendationPool(state)).not.toThrow();
        });

        test('does not crash on fragrances with null occasionTags', () => {
            const state = {
                budget: 2,
                performance: 50,
                occasions: ['Office'],
                climates: [],
            };
            expect(() => engine.calculateRecommendationPool(state)).not.toThrow();
        });

        test('occasion match adds score', () => {
            const state = {
                budget: 3,
                performance: 70,
                occasions: ['Office'],
                climates: [],
            };
            const results = engine.calculateRecommendationPool(state);
            const sauvage = results.find(r => r.id === 'dior-sauvage');
            expect(sauvage.matchLog.some(l => l.includes('Occasion match'))).toBe(true);
        });

        test('specific note match adds score', () => {
            const state = {
                selectedNotes: ['Bergamot'],
                budget: 3,
                performance: 70,
                occasions: [],
                climates: [],
            };
            const results = engine.calculateRecommendationPool(state);
            const aventus = results.find(r => r.id === 'creed-aventus');
            expect(aventus.matchLog.some(l => l.includes('Specific note match'))).toBe(true);
        });

        test('climate match via season mapping', () => {
            const state = {
                budget: 3,
                performance: 70,
                occasions: [],
                climates: ['Cold & Crisp'],
            };
            const results = engine.calculateRecommendationPool(state);
            const oud = results.find(r => r.id === 'tom-ford-oud-wood');
            expect(oud.matchLog.some(l => l.includes('Climate match'))).toBe(true);
        });

        test('results are sorted by matchScore descending', () => {
            const state = { budget: 3, performance: 50, occasions: [], climates: [] };
            const results = engine.calculateRecommendationPool(state);
            for (let i = 1; i < results.length; i++) {
                expect(results[i - 1].matchScore).toBeGreaterThanOrEqual(results[i].matchScore);
            }
        });
    });

    describe('accord matching', () => {
        test('selected accords add score', () => {
            const state = {
                selectedAccords: ['woody'],
                budget: 3,
                performance: 70,
                occasions: [],
                climates: [],
            };
            const results = engine.calculateRecommendationPool(state);
            const aventus = results.find(r => r.id === 'creed-aventus');
            expect(aventus.matchLog.some(l => l.includes('Accord match'))).toBe(true);
        });
    });

    describe('scent description keyword matching', () => {
        test('scent description adds family and note matches', () => {
            const state = {
                scentDescription: 'warm smoky cedar with vanilla',
                budget: 3,
                performance: 70,
                occasions: [],
                climates: [],
            };
            const results = engine.calculateRecommendationPool(state);
            const aventus = results.find(r => r.id === 'creed-aventus');
            // "cedar" should match as a keyword note and/or family
            expect(aventus.matchLog.some(l => l.includes('Keyword'))).toBe(true);
        });

        test('empty scent description does not add score', () => {
            const state = {
                scentDescription: '',
                budget: 3,
                performance: 70,
                occasions: [],
                climates: [],
            };
            const results = engine.calculateRecommendationPool(state);
            const aventus = results.find(r => r.id === 'creed-aventus');
            expect(aventus.matchLog.every(l => !l.includes('Keyword'))).toBe(true);
        });
    });

    describe('usage description keyword matching', () => {
        test('office keyword matches Office occasion', () => {
            const state = {
                usageDescription: 'for the office',
                budget: 3,
                performance: 70,
                occasions: [],
                climates: [],
            };
            const results = engine.calculateRecommendationPool(state);
            const sauvage = results.find(r => r.id === 'dior-sauvage');
            expect(sauvage.matchLog.some(l => l.includes('Usage description match (Office)'))).toBe(true);
        });

        test('date night keyword matches evening occasion', () => {
            const state = {
                usageDescription: 'for a date night',
                budget: 3,
                performance: 70,
                occasions: [],
                climates: [],
            };
            const results = engine.calculateRecommendationPool(state);
            const oud = results.find(r => r.id === 'tom-ford-oud-wood');
            expect(oud.matchLog.some(l => l.includes('Usage description match (Evening/Intimate)'))).toBe(true);
        });

        test('casual keyword matches Casual occasion', () => {
            const state = {
                usageDescription: 'casual everyday wear',
                budget: 3,
                performance: 70,
                occasions: [],
                climates: [],
            };
            const results = engine.calculateRecommendationPool(state);
            const aventus = results.find(r => r.id === 'creed-aventus');
            expect(aventus.matchLog.some(l => l.includes('Usage description match (Casual)'))).toBe(true);
        });

        test('club keyword matches Clubbing occasion', () => {
            // Need a fragrance with Clubbing tag — add inline
            const dbWithClubbing = [
                ...testDatabase,
                {
                    id: 'club-frag',
                    name: 'Club Frag',
                    house: 'Test',
                    notes: { top: [], heart: [], base: [] },
                    accordTags: [],
                    noteFamilies: [],
                    seasonTags: [],
                    occasionTags: ['Clubbing'],
                    priceTier: 2,
                    longevityScore: 7,
                    sillageScore: 7,
                    blindBuyScore: 70,
                },
            ];
            const eng = new OlfactoryEngine(dbWithClubbing, {});
            const state = {
                usageDescription: 'going to a club party',
                budget: 2,
                performance: 70,
                occasions: [],
                climates: [],
            };
            const results = eng.calculateRecommendationPool(state);
            const club = results.find(r => r.id === 'club-frag');
            expect(club.matchLog.some(l => l.includes('Usage description match (Clubbing)'))).toBe(true);
        });
    });

    describe('favorites profile matching', () => {
        test('favorite fragrance families boost score', () => {
            const state = {
                favorites: ['Aventus Creed'],
                budget: 3,
                performance: 70,
                occasions: [],
                climates: [],
            };
            const results = engine.calculateRecommendationPool(state);
            // Aventus is woody/citrus/floral — Oud Wood shares woody
            const oud = results.find(r => r.id === 'tom-ford-oud-wood');
            expect(oud.matchLog.some(l => l.includes('Favorite profile family match'))).toBe(true);
        });

        test('favorite fragrance accords boost score', () => {
            const state = {
                favorites: ['Aventus Creed'],
                budget: 3,
                performance: 70,
                occasions: [],
                climates: [],
            };
            const results = engine.calculateRecommendationPool(state);
            // Aventus has "woody" accord — Oud Wood also has "woody"
            const oud = results.find(r => r.id === 'tom-ford-oud-wood');
            expect(oud.matchLog.some(l => l.includes('Favorite profile accord match'))).toBe(true);
        });

        test('exact favorite fragrance gets highest bonus', () => {
            const state = {
                favorites: ['Aventus Creed'],
                budget: 3,
                performance: 70,
                occasions: [],
                climates: [],
            };
            const results = engine.calculateRecommendationPool(state);
            const aventus = results.find(r => r.id === 'creed-aventus');
            expect(aventus.matchLog.some(l => l.includes('+45: Favorite fragrance match'))).toBe(true);
        });
    });

    describe('all-year signature climate', () => {
        test('all-year signature season adds bonus', () => {
            const dbWithAllYear = [
                ...testDatabase,
                {
                    id: 'allyear-frag',
                    name: 'All Year',
                    house: 'Test',
                    notes: { top: [], heart: [], base: [] },
                    accordTags: [],
                    noteFamilies: [],
                    seasonTags: ['All-year Signature'],
                    occasionTags: [],
                    priceTier: 2,
                    longevityScore: 5,
                    sillageScore: 5,
                    blindBuyScore: 60,
                },
            ];
            const eng = new OlfactoryEngine(dbWithAllYear, {});
            const state = {
                budget: 2,
                performance: 50,
                occasions: [],
                climates: ['Cold & Crisp'],
            };
            const results = eng.calculateRecommendationPool(state);
            const allYear = results.find(r => r.id === 'allyear-frag');
            expect(allYear.matchLog.some(l => l.includes('All Year'))).toBe(true);
        });
    });

    describe('getRecommendations (async)', () => {
        test('uses fallback catalog path when isUsingFallbackCatalog is true', async () => {
            global.isUsingFallbackCatalog = () => true;
            const state = { budget: 3, performance: 50, occasions: [], climates: [] };
            const results = await engine.getRecommendations(state);
            expect(results.length).toBeLessThanOrEqual(5);
            delete global.isUsingFallbackCatalog;
        });

        test('calls fetchRecommendations when not fallback', async () => {
            const mockResults = [{ id: 'mock', matchScore: 100 }];
            global.isUsingFallbackCatalog = () => false;
            global.fetchRecommendations = jest.fn().mockResolvedValue(mockResults);
            const results = await engine.getRecommendations({});
            expect(global.fetchRecommendations).toHaveBeenCalled();
            expect(results).toEqual(mockResults);
            delete global.isUsingFallbackCatalog;
            delete global.fetchRecommendations;
        });

        test('falls back to local scoring when fetchRecommendations throws', async () => {
            global.isUsingFallbackCatalog = () => false;
            global.fetchRecommendations = jest.fn().mockRejectedValue(new Error('network'));
            const state = { budget: 3, performance: 50, occasions: [], climates: [] };
            const results = await engine.getRecommendations(state);
            expect(results.length).toBeLessThanOrEqual(5);
            delete global.isUsingFallbackCatalog;
            delete global.fetchRecommendations;
        });

        test('rethrows when fetchRecommendations throws and no database', async () => {
            const emptyEngine = new OlfactoryEngine([], {});
            global.isUsingFallbackCatalog = () => false;
            global.fetchRecommendations = jest.fn().mockRejectedValue(new Error('network'));
            await expect(emptyEngine.getRecommendations({})).rejects.toThrow('network');
            delete global.isUsingFallbackCatalog;
            delete global.fetchRecommendations;
        });
    });

    describe('getMatchedFavoriteFragrances', () => {
        test('matches by name + house', () => {
            const state = { favorites: ['Aventus Creed'] };
            const matched = engine.getMatchedFavoriteFragrances(state);
            expect(matched.length).toBe(1);
            expect(matched[0].id).toBe('creed-aventus');
        });

        test('returns empty for no matches', () => {
            const state = { favorites: ['Nonexistent Fragrance'] };
            expect(engine.getMatchedFavoriteFragrances(state).length).toBe(0);
        });

        test('handles null favorites', () => {
            const state = { favorites: null };
            expect(engine.getMatchedFavoriteFragrances(state)).toEqual([]);
        });
    });

    describe('getFragrancePowerScore', () => {
        test('calculates average of longevity and sillage scaled to 100', () => {
            expect(engine.getFragrancePowerScore({ longevityScore: 9, sillageScore: 7 })).toBe(80);
        });

        test('handles null scores', () => {
            expect(engine.getFragrancePowerScore({ longevityScore: null, sillageScore: null })).toBe(0);
        });
    });

    describe('determineArchetype', () => {
        test('returns default when no fragrances', () => {
            const result = engine.determineArchetype([]);
            expect(result.title).toBe('Profile Ready');
        });

        test('returns default when no archetype field', () => {
            const result = engine.determineArchetype([{ name: 'Test' }]);
            expect(result.title).toBe('Profile Ready');
        });

        test('returns matching archetype when present', () => {
            const archetypes = { 'The Explorer': 'You seek adventure and discovery.' };
            const eng = new OlfactoryEngine(testDatabase, archetypes);
            const result = eng.determineArchetype([{ archetype: 'The Explorer' }]);
            expect(result.title).toBe('The Explorer');
            expect(result.description).toBe('You seek adventure and discovery.');
        });
    });
});
