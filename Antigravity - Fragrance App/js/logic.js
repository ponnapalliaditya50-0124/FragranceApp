// Game Logic for Olfactory Engine

class OlfactoryEngine {
    constructor(database, archetypes) {
        this.database = database;
        this.archetypes = archetypes;
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

    calculateRecommendations(userState) {
        console.log("Analyzing user state:", userState);
        
        let scoredList = this.database.map(fragrance => {
            let score = 100;
            let matchLog = [];

            // 1. Budget Filter
            const targetBudget = parseInt(userState.budget);
            if (fragrance.priceTier > targetBudget) {
                score -= 30; 
                matchLog.push("-30: Over budget");
            } else if (fragrance.priceTier === targetBudget) {
                score += 15;
                matchLog.push("+15: Exact budget match");
            } else {
                score += 5;
                matchLog.push("+5: Under budget");
            }

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
                    ...fragrance.notes.top,
                    ...fragrance.notes.heart,
                    ...fragrance.notes.base
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
                        ...fragrance.notes.top,
                        ...fragrance.notes.heart,
                        ...fragrance.notes.base
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

            // 2e. Mild anti-note penalty (background signal, not dominant)
            if (fragrance.antiNotes) {
                // Check if user's selected families conflict with anti-notes
                // This is kept as a subtle guard rail
                const allUserNotes = [...(userState.selectedNotes || [])];
                // We don't penalize anti-notes against user selections anymore
                // but we can use them for secondary differentiation
            }

            // 3. Occasion Match (Bonus)
            userState.occasions.forEach(occ => {
                if (fragrance.occasionTags.includes(occ)) {
                    score += 25;
                    matchLog.push(`+25: Occasion match (${occ})`);
                }
            });

            // 4. Climate Match (Bonus) - Map climates back to seasonTags
            const climateMappings = {
                "Hot & Humid": ["Summer"],
                "Dry & Desert": ["Summer", "Fall"],
                "Temperate": ["Spring", "Fall"],
                "Cold & Crisp": ["Winter"],
                "Tropical": ["Summer"]
            };

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

        console.log("Scored results:", scoredList.map(s => `${s.name}: ${s.matchScore} [${s.matchLog.join(', ')}]`));

        return scoredList.slice(0, 3); // Return top 3
    }

    determineArchetype(topFragrances) {
        if (!topFragrances || topFragrances.length === 0) return { title: "The Enigmatic Allure", description: this.archetypes["The Enigmatic Allure"] };
        
        const mainArchetype = topFragrances[0].archetype;
        return {
            title: mainArchetype,
            description: this.archetypes[mainArchetype]
        };
    }
}
