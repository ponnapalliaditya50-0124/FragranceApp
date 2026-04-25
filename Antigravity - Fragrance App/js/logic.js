// Game Logic for Olfactory Engine

class OlfactoryEngine {
    constructor(database, archetypes) {
        this.database = database;
        this.archetypes = archetypes;
    }

    normalizeLookup(value) {
        return String(value || '')
            .toLowerCase()
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    }

    getClimateSeasonMappings() {
        return {
            "Hot & Humid": ["Summer"],
            "Dry Heat": ["Summer", "Fall"],
            "Breezy Coastal": ["Spring", "Summer"],
            "Tropical": ["Summer"],
            "Mild Everyday": ["Spring", "Fall"],
            "Rainy & Overcast": ["Spring", "Fall"],
            "Cool Air": ["Fall", "Winter"],
            "Cold & Snowy": ["Winter"]
        };
    }

    getGenderPreferenceAdjustment(preference, fragranceGender) {
        const normalizedPreference = String(preference || '').trim().toLowerCase();
        const normalizedGender = String(fragranceGender || '').trim().toLowerCase();

        const preferenceWeights = {
            'feminine': { women: 18, unisex: 10, men: -10 },
            'soft feminine': { women: 11, unisex: 6, men: -4 },
            'balanced': { women: 4, unisex: 7, men: 4 },
            'soft masculine': { men: 11, unisex: 6, women: -4 },
            'masculine': { men: 18, unisex: 10, women: -10 }
        };

        const weights = preferenceWeights[normalizedPreference];
        if (!weights) {
            return 0;
        }

        return weights[normalizedGender] || 0;
    }

    // Extract scent-related keywords from free-text descriptions
    extractKeywords(text) {
        const scentKeywords = [
            'warm', 'smoky', 'fresh', 'clean', 'woody', 'citrus', 'floral',
            'spicy', 'sweet', 'vanilla', 'leather', 'tobacco', 'amber', 'musk',
            'dark', 'light', 'aquatic', 'ocean', 'sea', 'forest', 'cedar',
            'sandalwood', 'oud', 'rose', 'jasmine', 'lavender', 'patchouli',
            'incense', 'smoke', 'gourmand', 'oriental', 'earthy', 'powdery',
            'creamy', 'rich', 'subtle', 'bold', 'intense', 'soft', 'cozy',
            'cold', 'winter', 'summer', 'rain', 'night', 'evening',
            'masculine', 'feminine', 'unisex', 'exotic', 'mysterious',
            'pepper', 'cinnamon', 'cardamom', 'saffron', 'vetiver', 'mint',
            'bergamot', 'lemon', 'grapefruit', 'rum', 'honey', 'caramel',
            'resin', 'benzoin', 'myrrh', 'birch', 'suede'
        ];
        const words = text.toLowerCase().split(/[\s,\.\-]+/);
        return words.filter(w => scentKeywords.includes(w));
    }

    // Map descriptive words to note families
    keywordToFamilyMap = {
        'warm': ['amber', 'sweet', 'spicy'],
        'smoky': ['leather', 'amber'],
        'fresh': ['citrus', 'fresh'],
        'clean': ['fresh', 'citrus'],
        'woody': ['woody'],
        'citrus': ['citrus'],
        'floral': ['floral'],
        'spicy': ['spicy'],
        'sweet': ['sweet'],
        'leather': ['leather'],
        'dark': ['leather', 'animalic', 'amber'],
        'light': ['citrus', 'fresh', 'floral'],
        'aquatic': ['fresh'],
        'ocean': ['fresh'],
        'sea': ['fresh'],
        'forest': ['woody', 'amber'],
        'earthy': ['woody', 'animalic'],
        'powdery': ['floral', 'sweet'],
        'cozy': ['sweet', 'amber', 'leather'],
        'bold': ['spicy', 'animalic', 'leather'],
        'intense': ['spicy', 'animalic', 'amber'],
        'soft': ['floral', 'sweet', 'fresh'],
        'exotic': ['spicy', 'amber', 'animalic'],
        'mysterious': ['amber', 'animalic', 'leather'],
        'rich': ['amber', 'sweet', 'leather'],
        'subtle': ['fresh', 'floral', 'citrus'],
        'gourmand': ['sweet'],
        'oriental': ['amber', 'spicy', 'sweet'],
        'creamy': ['sweet', 'amber']
    };

    async getRecommendations(userState) {
        if (typeof isUsingFallbackCatalog === 'function' && isUsingFallbackCatalog()) {
            return this.calculateRecommendations(userState);
        }

        try {
            return await fetchRecommendations(userState);
        } catch (error) {
            if (Array.isArray(this.database) && this.database.length > 0) {
                return this.calculateRecommendations(userState);
            }

            throw error;
        }
    }

    getMatchedFavoriteFragrances(userState) {
        const favorites = Array.isArray(userState && userState.favorites)
            ? userState.favorites
            : [];

        if (favorites.length === 0 || !Array.isArray(this.database) || this.database.length === 0) {
            return [];
        }

        const favoriteKeys = new Set(
            favorites
                .map(favorite => this.normalizeLookup(favorite))
                .filter(Boolean)
        );

        return this.database.filter(fragrance => {
            const fullLabel = this.normalizeLookup(`${fragrance.name} ${fragrance.house}`);
            const nameOnly = this.normalizeLookup(fragrance.name);
            return favoriteKeys.has(fullLabel) || favoriteKeys.has(nameOnly);
        });
    }

    calculateRecommendationPool(userState) {
        const favoriteFragrances = this.getMatchedFavoriteFragrances(userState);
        const favoriteIds = new Set(favoriteFragrances.map(fragrance => fragrance.id));
        const favoriteFamilies = new Set(
            favoriteFragrances.flatMap(fragrance => fragrance.noteFamilies || [])
        );
        const favoriteAccords = new Set(
            favoriteFragrances.flatMap(fragrance => fragrance.accordTags || [])
        );

        // Hard pre-filters (applied before scoring)
        const targetBudget = parseInt(userState.budget);
        const hasBudgetFilter = Number.isFinite(targetBudget);
        const genderPref = userState.gender || '';
        const climateMappings = this.getClimateSeasonMappings();

        const candidates = this.database.filter(fragrance => {
            // Exclude exact favorites — don't recommend what the user already owns
            if (favoriteIds.has(fragrance.id)) {
                return false;
            }
            // Budget hard filter: exclude fragrances above the budget tier
            if (hasBudgetFilter && Number.isInteger(fragrance.priceTier) && fragrance.priceTier > targetBudget) {
                return false;
            }
            return true;
        });

        let scoredList = candidates.map(fragrance => {
            let score = 100;
            let matchLog = [];

            favoriteFamilies.forEach(familyId => {
                if (fragrance.noteFamilies && fragrance.noteFamilies.includes(familyId)) {
                    score += 12;
                    matchLog.push(`+12: Favorite profile family match (${familyId})`);
                }
            });

            favoriteAccords.forEach(accord => {
                if (fragrance.accordTags && fragrance.accordTags.includes(accord)) {
                    score += 8;
                    matchLog.push(`+8: Favorite profile accord match (${accord})`);
                }
            });

            // 2a. Note Family Affinity (major signal)
            if (userState.selectedFamilies && userState.selectedFamilies.length > 0) {
                userState.selectedFamilies.forEach(familyId => {
                    if (fragrance.noteFamilies && fragrance.noteFamilies.includes(familyId)) {
                        score += 30;
                        matchLog.push(`+30: Note family match (${familyId})`);
                    }
                });
            }

            // 2b. Specific Note Match (precision bonus)
            if (userState.selectedNotes && userState.selectedNotes.length > 0) {
                const allFragNotes = [
                    ...(fragrance.notes?.top || []),
                    ...(fragrance.notes?.heart || []),
                    ...(fragrance.notes?.base || [])
                ];
                userState.selectedNotes.forEach(note => {
                    if (allFragNotes.some(fn => fn.toLowerCase() === note.toLowerCase())) {
                        score += 15;
                        matchLog.push(`+15: Specific note match (${note})`);
                    }
                });
            }

            // 2c. Accord Match
            if (userState.selectedAccords && userState.selectedAccords.length > 0) {
                userState.selectedAccords.forEach(accord => {
                    if (fragrance.accordTags && fragrance.accordTags.includes(accord)) {
                        score += 20;
                        matchLog.push(`+20: Accord match (${accord})`);
                    }
                });
            }

            // 2d. Text Description Keyword Matching
            if (userState.scentDescription && userState.scentDescription.trim().length > 0) {
                const keywords = this.extractKeywords(userState.scentDescription);
                const matchedFamilies = new Set();
                
                keywords.forEach(keyword => {
                    // Direct note name matching
                    const allFragNotes = [
                        ...(fragrance.notes?.top || []),
                        ...(fragrance.notes?.heart || []),
                        ...(fragrance.notes?.base || [])
                    ];
                    if (allFragNotes.some(fn => fn.toLowerCase().includes(keyword))) {
                        score += 10;
                        matchLog.push(`+10: Keyword note match (${keyword})`);
                    }
                    
                    // Keyword → family mapping
                    const families = this.keywordToFamilyMap[keyword];
                    if (families && fragrance.noteFamilies) {
                        families.forEach(fam => {
                            if (fragrance.noteFamilies.includes(fam) && !matchedFamilies.has(fam)) {
                                matchedFamilies.add(fam);
                                score += 8;
                                matchLog.push(`+8: Keyword family match (${keyword}→${fam})`);
                            }
                        });
                    }
                });
            }

            // 3. Occasion Match (Bonus)
            (userState.occasions || []).forEach(occ => {
                if (fragrance.occasionTags && fragrance.occasionTags.includes(occ)) {
                    score += 25;
                    matchLog.push(`+25: Occasion match (${occ})`);
                }
            });

            // 4. Climate Match (Bonus) - Map climates back to seasonTags
            if (userState.climates) {
                userState.climates.forEach(cli => {
                    const mappedSeasons = climateMappings[cli] || [];
                    mappedSeasons.forEach(mappedSea => {
                        if (fragrance.seasonTags && fragrance.seasonTags.includes(mappedSea)) {
                            score += 20;
                            matchLog.push(`+20: Climate match (${cli} -> ${mappedSea})`);
                        }
                    });
                    if (fragrance.seasonTags && fragrance.seasonTags.includes("All-year Signature")) {
                        score += 10;
                        matchLog.push(`+10: Climate match (All Year for ${cli})`);
                    }
                });
            }

            const genderAdjustment = this.getGenderPreferenceAdjustment(genderPref, fragrance.gender);
            if (genderAdjustment !== 0) {
                score += genderAdjustment;
                matchLog.push(`${genderAdjustment > 0 ? '+' : ''}${genderAdjustment}: Gender preference (${genderPref} -> ${fragrance.gender || 'unknown'})`);
            }

            // Usage Description (Keywords matching occasions or seasons)
            if (userState.usageDescription && userState.usageDescription.trim().length > 0) {
                const descLower = userState.usageDescription.toLowerCase();
                
                // Occasion keywords
                if (descLower.includes("office") || descLower.includes("work") || descLower.includes("professional")) {
                    if (fragrance.occasionTags && fragrance.occasionTags.includes("Office")) {
                        score += 15;
                        matchLog.push(`+15: Usage description match (Office)`);
                    }
                }
                if (descLower.includes("date") || descLower.includes("night") || descLower.includes("evening") || descLower.includes("intimate")) {
                    if (fragrance.occasionTags && (fragrance.occasionTags.includes("Date Night") || fragrance.occasionTags.includes("Intimate"))) {
                        score += 15;
                        matchLog.push(`+15: Usage description match (Evening/Intimate)`);
                    }
                }
                if (descLower.includes("casual") || descLower.includes("everyday") || descLower.includes("daily")) {
                    if (fragrance.occasionTags && fragrance.occasionTags.includes("Casual")) {
                        score += 15;
                        matchLog.push(`+15: Usage description match (Casual)`);
                    }
                }
                if (descLower.includes("club") || descLower.includes("party") || descLower.includes("loud")) {
                    if (fragrance.occasionTags && fragrance.occasionTags.includes("Clubbing")) {
                        score += 15;
                        matchLog.push(`+15: Usage description match (Clubbing)`);
                    }
                }
            }

            // 5. Performance Match
            const userPerf = parseInt(userState.performance);
            const fragPower = (fragrance.longevityScore + fragrance.sillageScore) / 2;
            const fragPerfScaled = fragPower * 10; // Convert 1-10 to 0-100
            
            const diff = Math.abs(userPerf - fragPerfScaled);
            
            if (diff <= 15) {
                score += 20;
                matchLog.push(`+20: Perfect performance match (diff ${diff})`);
            } else if (diff <= 30) {
                score += 10;
                matchLog.push(`+10: Good performance match (diff ${diff})`);
            } else if (diff > 50) {
                score -= 30;
                matchLog.push(`-30: Performance mismatch (diff ${diff})`);
            }

            return { ...fragrance, matchScore: score, matchLog };
        });

        // Sort descending by score
        scoredList.sort((a, b) => b.matchScore - a.matchScore);

        return scoredList;
    }

    // Legacy local scoring — replaced by backend API
    calculateRecommendations(userState) {
        return this.calculateRecommendationPool(userState).slice(0, 5);
    }

    getFragrancePowerScore(fragrance) {
        const lon = fragrance.longevityScore || 0;
        const sil = fragrance.sillageScore || 0;
        return ((lon + sil) / 2) * 10;
    }

    determineArchetype(topFragrances) {
        if (!topFragrances || topFragrances.length === 0) {
            return {
                title: "Profile Ready",
                description: "Recommendations are available, but this dataset does not include a source-backed archetype label yet."
            };
        }

        const mainArchetype = topFragrances.find(fragrance => fragrance && fragrance.archetype)?.archetype;
        if (!mainArchetype || !this.archetypes[mainArchetype]) {
            return {
                title: "Profile Ready",
                description: "Recommendations are available, but this dataset does not include a source-backed archetype label yet."
            };
        }

        return {
            title: mainArchetype,
            description: this.archetypes[mainArchetype]
        };
    }
}

// Export for testing (Node.js/Jest). In browser, OlfactoryEngine is a global.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OlfactoryEngine };
}
