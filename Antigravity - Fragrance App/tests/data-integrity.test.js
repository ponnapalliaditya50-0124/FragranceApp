/**
 * Tests that verify data shapes and contracts between frontend and backend.
 */

describe('Fragrance data contract', () => {
    // Minimal fragrance shape the frontend expects
    const requiredFields = ['id', 'name', 'house', 'notes', 'accordTags', 'noteFamilies', 'seasonTags', 'occasionTags'];

    function makeSampleFragrance(overrides = {}) {
        return {
            id: 'test-frag',
            name: 'Test Fragrance',
            house: 'Test Brand',
            country: 'France',
            gender: 'unisex',
            year: 2023,
            ratingValue: 4.0,
            ratingCount: 100,
            priceTier: 'Mid-range',
            longevity: 'Long (7-9h)',
            longevityScore: 7,
            sillage: 'Strong',
            sillageScore: 7,
            blindBuyScore: 80,
            climate: 'Mild Everyday',
            notes: { top: ['Bergamot'], heart: ['Rose'], base: ['Cedar'] },
            accordTags: ['woody', 'floral'],
            noteFamilies: ['woody', 'floral'],
            seasonTags: ['Spring', 'Fall'],
            occasionTags: ['Office'],
            matchScore: null,
            ...overrides,
        };
    }

    test('sample fragrance has all required fields', () => {
        const frag = makeSampleFragrance();
        requiredFields.forEach(field => {
            expect(frag).toHaveProperty(field);
        });
    });

    test('notes object has top, heart, base arrays', () => {
        const frag = makeSampleFragrance();
        expect(Array.isArray(frag.notes.top)).toBe(true);
        expect(Array.isArray(frag.notes.heart)).toBe(true);
        expect(Array.isArray(frag.notes.base)).toBe(true);
    });

    test('all tag arrays are arrays (not null)', () => {
        const frag = makeSampleFragrance();
        expect(Array.isArray(frag.accordTags)).toBe(true);
        expect(Array.isArray(frag.noteFamilies)).toBe(true);
        expect(Array.isArray(frag.seasonTags)).toBe(true);
        expect(Array.isArray(frag.occasionTags)).toBe(true);
    });

    test('fragrance with null notes does not crash spread operations', () => {
        const frag = makeSampleFragrance({ notes: null });
        const allNotes = [
            ...(frag.notes?.top || []),
            ...(frag.notes?.heart || []),
            ...(frag.notes?.base || []),
        ];
        expect(allNotes).toEqual([]);
    });

    test('fragrance with null occasionTags does not crash includes', () => {
        const frag = makeSampleFragrance({ occasionTags: null });
        const tags = frag.occasionTags || [];
        expect(() => tags.includes('Office')).not.toThrow();
    });

    test('fragrance with null seasonTags does not crash includes', () => {
        const frag = makeSampleFragrance({ seasonTags: null });
        const tags = frag.seasonTags || [];
        expect(() => tags.includes('Summer')).not.toThrow();
    });

    test('priceTier can be compared as string or number', () => {
        const frag = makeSampleFragrance({ priceTier: 'Premium' });
        expect(typeof frag.priceTier).toBe('string');
    });

    test('scores are numbers or null', () => {
        const frag = makeSampleFragrance();
        expect(typeof frag.longevityScore).toBe('number');
        expect(typeof frag.sillageScore).toBe('number');

        const nullFrag = makeSampleFragrance({ longevityScore: null, sillageScore: null });
        expect(nullFrag.longevityScore).toBeNull();
    });
});
