// Application State & UI Controller
const state = {
    favorites: [],
    scentDescription: "",      // Free-text voice/typed description
    usageDescription: "",      // Usage intent voice/typed description
    selectedFamilies: [],      // ["woody", "spicy", ...]
    selectedNotes: [],         // Specific notes from sub-grids
    selectedAccords: [],       // ["Oriental", "Gourmand", ...]
    occasions: [],
    climates: [],
    performance: 2, 
    budget: 2,
    latestRecommendations: [],
    latestArchetype: null
};

const STORAGE_KEY = 'maison-daura-profile';

const authState = {
    isLoggedIn: false,
    mode: 'signup',
    pendingRecommendationId: null,
    profileEmail: '',
    savedRecommendationIds: [],
    personalityTitle: ''
};

const VIEW_IDS = ['wizard-view', 'loading-view', 'results-view', 'profile-view'];

const viewState = {
    activeViewId: 'wizard-view',
    previousViewId: 'wizard-view'
};

const profileFilters = {
    search: '',
    house: 'all',
    tier: 'all',
    family: 'all'
};

// Wizard State
let currentStep = 1;
const totalSteps = 3;

const engine = new OlfactoryEngine(fragranceDB, ARCHETYPES);

document.addEventListener("DOMContentLoaded", () => {
    hydrateAuthState();
    syncActiveView();
    initAuth();
    initWizard();
    initProfileView();
    updateAuthUI();
    applyTheme();
});

function initWizard() {
    console.log("Wizard initialized.");
    
    // Step 1: Favorites with Autocomplete
    const favInput = document.getElementById('fav-input');
    const btnAddFav = document.getElementById('btn-add-fav');
    const favTags = document.getElementById('fav-tags');
    const acDropdown = document.getElementById('autocomplete-dropdown');
    let acIndex = -1; // keyboard navigation index

    const addFav = (val) => {
        const text = (val || favInput.value).trim();
        if (text && !state.favorites.includes(text)) {
            state.favorites.push(text);
            renderFavTags();
            favInput.value = '';
            hideDropdown();
        }
    };

    const renderFavTags = () => {
        renderPills(favTags, state.favorites, (item) => {
            state.favorites = state.favorites.filter(i => i !== item);
            renderFavTags();
        });
    };

    const showDropdown = (matches) => {
        acDropdown.innerHTML = '';
        acIndex = -1;

        if (matches.length === 0) {
            acDropdown.innerHTML = '<div class="ac-no-results">No matches — press Enter to add custom entry</div>';
            acDropdown.classList.add('visible');
            return;
        }

        matches.forEach((item, idx) => {
            const parts = item.split(' — ');
            const div = document.createElement('div');
            div.className = 'ac-item';
            div.setAttribute('data-index', idx);
            div.innerHTML = `<span class="ac-name">${parts[0]}</span><span class="ac-house">— ${parts[1] || ''}</span>`;
            div.addEventListener('click', () => addFav(item));
            div.addEventListener('mouseenter', () => {
                clearActiveAc();
                div.classList.add('ac-active');
                acIndex = idx;
            });
            acDropdown.appendChild(div);
        });

        acDropdown.classList.add('visible');
    };

    const hideDropdown = () => {
        acDropdown.classList.remove('visible');
        acIndex = -1;
    };

    const clearActiveAc = () => {
        acDropdown.querySelectorAll('.ac-item').forEach(el => el.classList.remove('ac-active'));
    };

    favInput.addEventListener('input', () => {
        const query = favInput.value.trim().toLowerCase();
        if (query.length < 1) { hideDropdown(); return; }

        const matches = FRAGRANCE_SUGGESTIONS.filter(s =>
            s.toLowerCase().includes(query) && !state.favorites.includes(s)
        ).slice(0, 8); // cap at 8 for UX

        showDropdown(matches);
    });

    favInput.addEventListener('keydown', (e) => {
        const items = acDropdown.querySelectorAll('.ac-item');
        if (!acDropdown.classList.contains('visible') || items.length === 0) {
            if (e.key === 'Enter') { e.preventDefault(); addFav(); }
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            acIndex = Math.min(acIndex + 1, items.length - 1);
            clearActiveAc();
            items[acIndex].classList.add('ac-active');
            items[acIndex].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            acIndex = Math.max(acIndex - 1, 0);
            clearActiveAc();
            items[acIndex].classList.add('ac-active');
            items[acIndex].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (acIndex >= 0 && items[acIndex]) {
                items[acIndex].click();
            } else {
                addFav();
            }
        } else if (e.key === 'Escape') {
            hideDropdown();
        }
    });

    btnAddFav.addEventListener('click', () => addFav());

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.autocomplete-wrapper')) hideDropdown();
    });

    // Start Here: Populate starter grid
    const starterGrid = document.getElementById('starter-grid');
    STARTER_PICKS.forEach(pick => {
        const card = document.createElement('div');
        card.className = 'starter-card';
        card.innerHTML = `
            <span class="starter-name">${pick.name}</span>
            <span class="starter-house">${pick.house}</span>
            <span class="starter-vibe">${pick.vibe}</span>
        `;
        card.addEventListener('click', () => {
            const fullName = `${pick.name} — ${pick.house}`;
            if (!state.favorites.includes(fullName)) {
                state.favorites.push(fullName);
                renderFavTags();
                card.classList.add('picked');
            }
        });
        starterGrid.appendChild(card);
    });

    // ─── Step 2: Scent Profile Builder ───

    // Setting up Scent and Usage Description (Text + Voice)
    function setupMicrophone(btnId, statusId, textareaId, stateKey) {
        const btnMic = document.getElementById(btnId);
        const micStatus = document.getElementById(statusId);
        const textarea = document.getElementById(textareaId);

        if (!btnMic || !micStatus || !textarea) return;

        textarea.addEventListener('input', () => {
            state[stateKey] = textarea.value;
        });

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            const recognition = new SpeechRecognition();
            recognition.continuous = false;
            recognition.interimResults = true;
            recognition.lang = 'en-US';
            let isRecording = false;

            btnMic.addEventListener('click', () => {
                if (isRecording) {
                    recognition.stop();
                    return;
                }
                isRecording = true;
                btnMic.classList.add('recording');
                micStatus.textContent = 'Listening…';
                micStatus.classList.add('active');
                recognition.start();
            });

            recognition.onresult = (event) => {
                let transcript = '';
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    transcript += event.results[i][0].transcript;
                }
                const existing = textarea.value.trim();
                textarea.value = existing ? existing + ' ' + transcript : transcript;
                state[stateKey] = textarea.value;
            };

            recognition.onend = () => {
                isRecording = false;
                btnMic.classList.remove('recording');
                micStatus.textContent = '';
                micStatus.classList.remove('active');
            };

            recognition.onerror = (event) => {
                isRecording = false;
                btnMic.classList.remove('recording');
                micStatus.textContent = event.error === 'not-allowed' ? 'Microphone access denied' : '';
                micStatus.classList.remove('active');
            };
        } else {
            btnMic.classList.add('hidden');
        }
    }

    setupMicrophone('btn-mic', 'mic-status', 'scent-description', 'scentDescription');
    setupMicrophone('btn-mic-usage', 'mic-status-usage', 'usage-description', 'usageDescription');

    // Zone B: Note Families Grid
    const familyGrid = document.getElementById('family-grid');

    SCENT_FAMILIES.forEach(family => {
        const card = document.createElement('div');
        card.className = 'family-card';
        card.setAttribute('data-family', family.id);
        
        // Build subnotes UI block
        const subnotesContainer = document.createElement('div');
        subnotesContainer.className = 'inner-subnotes';
        subnotesContainer.innerHTML = `<div class="subnotes-header">Fine-tune notes</div>`;
        
        const pillsContainer = document.createElement('div');
        pillsContainer.className = 'subnotes-pills';
        
        family.notes.forEach(note => {
            const pill = document.createElement('div');
            pill.className = 'subnote-pill';
            pill.innerText = note;
            
            pill.addEventListener('click', (e) => {
                e.stopPropagation(); // prevent card click
                pill.classList.toggle('selected');
                if (pill.classList.contains('selected')) {
                    if (!state.selectedNotes.includes(note)) {
                        state.selectedNotes.push(note);
                    }
                } else {
                    state.selectedNotes = state.selectedNotes.filter(n => n !== note);
                }
            });
            pillsContainer.appendChild(pill);
        });
        subnotesContainer.appendChild(pillsContainer);

        card.innerHTML = `
            <span class="family-label">${family.label}</span>
            <span class="family-desc">${family.desc}</span>
        `;
        card.appendChild(subnotesContainer);

        card.addEventListener('click', () => {
            // Toggle family selection
            const isSelected = card.classList.contains('selected');

            if (isSelected) {
                // Deselect family
                card.classList.remove('selected');
                subnotesContainer.classList.remove('expanded');
                
                state.selectedFamilies = state.selectedFamilies.filter(f => f !== family.id);
                // Also visually deselect pills and remove them from state
                pillsContainer.querySelectorAll('.subnote-pill.selected').forEach(p => p.classList.remove('selected'));
                state.selectedNotes = state.selectedNotes.filter(n => !family.notes.includes(n));
            } else {
                // Select family
                card.classList.add('selected');
                // Allow CSS transition to fire by using a tiny timeout/animation frame
                requestAnimationFrame(() => subnotesContainer.classList.add('expanded'));
                
                state.selectedFamilies.push(family.id);
            }
        });

        familyGrid.appendChild(card);
    });

    // Zone C: Accord Palette
    const accordGrid = document.getElementById('accord-grid');
    ACCORD_PALETTE.forEach(accord => {
        const pill = document.createElement('div');
        pill.className = 'select-pill';
        pill.innerText = accord;
        pill.addEventListener('click', () => {
            pill.classList.toggle('selected');
            if (pill.classList.contains('selected')) {
                state.selectedAccords.push(accord);
            } else {
                state.selectedAccords = state.selectedAccords.filter(a => a !== accord);
            }
        });
        accordGrid.appendChild(pill);
    });

    // Step 3: Selection grids and Reveal Logic
    const perfSection = document.getElementById('perf-section');
    const budgetSection = document.getElementById('budget-section');

    const revealPerf = () => {
        if (perfSection && !perfSection.classList.contains('revealed')) {
            perfSection.classList.add('revealed');
            // gently scroll down a bit
            setTimeout(() => {
                const step3 = document.getElementById('step-3');
                if(step3) step3.scrollBy({ top: 150, behavior: 'smooth' });
            }, 300);
        }
    };

    // Tie reveal to textarea
    const usageDesc = document.getElementById('usage-description');
    if (usageDesc) {
        usageDesc.addEventListener('input', revealPerf);
    }

    const bindSelectables = (containerId, stateArr) => {
        const grid = document.getElementById(containerId);
        if (!grid) return;
        grid.querySelectorAll('.select-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                pill.classList.toggle('selected');
                const val = pill.getAttribute('data-val');
                if (pill.classList.contains('selected')) {
                    stateArr.push(val);
                } else {
                    const idx = stateArr.indexOf(val);
                    if (idx > -1) stateArr.splice(idx, 1);
                }
                revealPerf();
            });
        });
    };
    bindSelectables('occasion-grid', state.occasions);
    bindSelectables('climate-grid', state.climates);

    // Step 3 (Now includes Performance)
    const perfSlider = document.getElementById('perf-slider');
    const perfLabel = document.getElementById('perf-label');
    const perfDesc = document.getElementById('perf-desc');

    const perfZones = [
        { name: "Skin Scent", desc: "Whispers close to the body, very intimate." },
        { name: "Subtle Aura", desc: "Polite, arm's-length presence." },
        { name: "Moderate Trail", desc: "Noticeable, balanced sillage that leaves a gentle trail." },
        { name: "Strong Presence", desc: "Leaves a definitive statement and lasts all day." },
        { name: "Beast Mode", desc: "Room-filling, maximum projection." }
    ];

    let sliderInteracted = false;
    perfSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        state.performance = val;
        
        let zoneIndex = Math.floor(val / 20);
        if (zoneIndex >= 5) zoneIndex = 4; // handle exactly 100
        
        perfLabel.innerText = perfZones[zoneIndex].name;
        perfDesc.innerText = perfZones[zoneIndex].desc;
        
        const progress = val + '%';
        perfSlider.style.background = `linear-gradient(to right, rgba(255,255,255,0.8) ${progress}, rgba(255,255,255,0.1) ${progress})`;

        // Reveal the budget section when slider is moved
        if (sliderInteracted && budgetSection && !budgetSection.classList.contains('revealed')) {
            budgetSection.classList.add('revealed');
            setTimeout(() => {
                const step3 = document.getElementById('step-3');
                if(step3) step3.scrollBy({ top: 200, behavior: 'smooth' });
            }, 300);
        }
    });

    // Mark slider as ready for interaction (prevents the initial dispatch from revealing budget)
    perfSlider.addEventListener('mousedown', () => sliderInteracted = true);
    perfSlider.addEventListener('touchstart', () => sliderInteracted = true);

    // Initialize the slider label immediately
    perfSlider.dispatchEvent(new Event('input'));

    // Step 3 (Continued): Budget
    const budgetGrid = document.getElementById('budget-grid');
    budgetGrid.querySelectorAll('.budget-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            // clear others
            budgetGrid.querySelectorAll('.budget-pill').forEach(p => p.classList.remove('selected'));
            pill.classList.add('selected');
            state.budget = parseInt(pill.getAttribute('data-val'));
        });
    });
    // Set default budget select
    budgetGrid.querySelector(`[data-val="${state.budget}"]`).classList.add('selected');

    // Controls
    document.getElementById('btn-next').addEventListener('click', nextStep);
    document.getElementById('btn-prev').addEventListener('click', prevStep);
    document.getElementById('btn-restart').addEventListener('click', () => window.location.reload());
}

function syncActiveView() {
    const activeView = document.querySelector('.view.active');
    viewState.activeViewId = activeView ? activeView.id : 'wizard-view';
}

function setActiveView(viewId) {
    VIEW_IDS.forEach(id => {
        const view = document.getElementById(id);
        if (view) {
            view.classList.toggle('active', id === viewId);
        }
    });

    viewState.activeViewId = viewId;
}

function getThemeClass(archetypeTitle) {
    return archetypeTitle
        ? `theme-${archetypeTitle.toLowerCase().replace(/\s+/g, '-')}`
        : '';
}

function getEffectiveThemeTitle() {
    if (authState.isLoggedIn && authState.personalityTitle) {
        return authState.personalityTitle;
    }

    return state.latestArchetype && state.latestArchetype.title
        ? state.latestArchetype.title
        : '';
}

function applyTheme() {
    document.body.className = getThemeClass(getEffectiveThemeTitle());
}

function hydrateAuthState() {
    try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        authState.isLoggedIn = Boolean(stored.isLoggedIn);
        authState.profileEmail = stored.profileEmail || '';
        authState.personalityTitle = stored.personalityTitle || '';
        authState.savedRecommendationIds = Array.isArray(stored.savedRecommendationIds)
            ? stored.savedRecommendationIds
            : [];
    } catch (error) {
        console.warn('Unable to restore saved profile state.', error);
    }
}

function persistAuthState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            isLoggedIn: authState.isLoggedIn,
            profileEmail: authState.profileEmail,
            savedRecommendationIds: authState.savedRecommendationIds,
            personalityTitle: authState.personalityTitle
        }));
    } catch (error) {
        console.warn('Unable to persist profile state.', error);
    }
}

function syncStoredPersonality(archetype) {
    if (!authState.isLoggedIn || !archetype || !archetype.title) return;

    authState.personalityTitle = archetype.title;
    persistAuthState();
}

function findFragranceById(id) {
    return engine.database.find(fragrance => fragrance.id === id);
}

function getSavedFragrances() {
    return authState.savedRecommendationIds
        .map(findFragranceById)
        .filter(Boolean)
        .sort((a, b) => a.house.localeCompare(b.house) || a.name.localeCompare(b.name));
}

function isRecommendationSaved(id) {
    return authState.isLoggedIn && authState.savedRecommendationIds.includes(id);
}

function getFamilyLabel(familyId) {
    const family = SCENT_FAMILIES.find(item => item.id === familyId);
    return family ? family.label : familyId;
}

function resetProfileFilters() {
    profileFilters.search = '';
    profileFilters.house = 'all';
    profileFilters.tier = 'all';
    profileFilters.family = 'all';
}

function renderProfilePanel() {
    const panel = document.getElementById('profile-panel');
    const meta = document.getElementById('profile-panel-meta');
    const empty = document.getElementById('profile-panel-empty');
    const grid = document.getElementById('profile-panel-grid');

    if (!panel || !meta || !empty || !grid) return;

    if (!authState.isLoggedIn) {
        panel.hidden = true;
        meta.innerText = '';
        empty.innerText = '';
        grid.innerHTML = '';
        return;
    }

    const savedFragrances = getSavedFragrances();
    const savedCount = savedFragrances.length;
    const personalityLabel = authState.personalityTitle || 'Awaiting personality';

    meta.innerText = `${savedCount} saved / ${personalityLabel}`;
    empty.innerText = savedCount === 0
        ? 'Add any recommendation below and it will appear here in your saved profile.'
        : '';
    empty.hidden = savedCount !== 0;

    grid.innerHTML = savedFragrances.map(frag => `
        <div class="saved-fragrance-card">
            <span class="saved-fragrance-house">${frag.house}</span>
            <span class="saved-fragrance-name">${frag.name}</span>
        </div>
    `).join('');

    panel.hidden = false;
}

function populateProfileFilterControls(savedFragrances) {
    const searchInput = document.getElementById('profile-search');
    const houseSelect = document.getElementById('profile-house-filter');
    const tierSelect = document.getElementById('profile-tier-filter');
    const familyContainer = document.getElementById('profile-family-filter');

    if (!searchInput || !houseSelect || !tierSelect || !familyContainer) return;

    const houses = [...new Set(savedFragrances.map(frag => frag.house))].sort((a, b) => a.localeCompare(b));
    const families = [...new Set(savedFragrances.flatMap(frag => frag.noteFamilies || []))]
        .sort((a, b) => getFamilyLabel(a).localeCompare(getFamilyLabel(b)));

    if (profileFilters.house !== 'all' && !houses.includes(profileFilters.house)) {
        profileFilters.house = 'all';
    }

    if (profileFilters.family !== 'all' && !families.includes(profileFilters.family)) {
        profileFilters.family = 'all';
    }

    searchInput.value = profileFilters.search;
    houseSelect.innerHTML = `
        <option value="all">All houses</option>
        ${houses.map(house => `<option value="${house}">${house}</option>`).join('')}
    `;
    houseSelect.value = profileFilters.house;
    tierSelect.value = profileFilters.tier;

    familyContainer.innerHTML = `
        <button type="button" class="select-pill profile-filter-pill${profileFilters.family === 'all' ? ' selected' : ''}" data-family="all">All</button>
        ${families.map(familyId => `
            <button
                type="button"
                class="select-pill profile-filter-pill${profileFilters.family === familyId ? ' selected' : ''}"
                data-family="${familyId}"
            >
                ${getFamilyLabel(familyId)}
            </button>
        `).join('')}
    `;
}

function getFilteredSavedFragrances(savedFragrances) {
    const searchNeedle = profileFilters.search.trim().toLowerCase();

    return savedFragrances.filter(frag => {
        const matchesSearch = !searchNeedle
            || frag.name.toLowerCase().includes(searchNeedle)
            || frag.house.toLowerCase().includes(searchNeedle);
        const matchesHouse = profileFilters.house === 'all' || frag.house === profileFilters.house;
        const matchesTier = profileFilters.tier === 'all' || String(frag.priceTier) === profileFilters.tier;
        const matchesFamily = profileFilters.family === 'all'
            || (frag.noteFamilies || []).includes(profileFilters.family);

        return matchesSearch && matchesHouse && matchesTier && matchesFamily;
    });
}

function buildProfileFragranceCard(frag) {
    const tierStr = Array(frag.priceTier).fill('$').join('');
    const familyTags = (frag.noteFamilies || [])
        .map(familyId => `<span class="profile-fragrance-chip">${getFamilyLabel(familyId)}</span>`)
        .join('');
    const accordTags = (frag.accordTags || [])
        .slice(0, 2)
        .map(accord => `<span class="profile-fragrance-chip subtle">${accord}</span>`)
        .join('');
    const topNotes = (frag.notes.top || []).slice(0, 3).join(' • ');

    return `
        <article class="glass-panel profile-fragrance-card">
            <div class="profile-fragrance-header">
                <div>
                    <p class="profile-fragrance-house">${frag.house}</p>
                    <h3 class="profile-fragrance-name">${frag.name}</h3>
                </div>
                <div class="profile-fragrance-tier">${tierStr}</div>
            </div>

            <div class="profile-fragrance-chip-row">
                ${familyTags}
                ${accordTags}
            </div>

            <p class="profile-fragrance-copy">Top notes: ${topNotes || 'Unavailable'}.</p>

            <div class="profile-fragrance-metrics">
                <span>Blind Buy ${frag.blindBuyScore}%</span>
                <span>Longevity ${frag.longevityScore}/10</span>
                <span>Sillage ${frag.sillageScore}/10</span>
            </div>
        </article>
    `;
}

function renderProfileCollection(savedFragrances) {
    const grid = document.getElementById('profile-fragrance-grid');
    const emptyState = document.getElementById('profile-fragrance-empty');
    const resultsTitle = document.getElementById('profile-results-title');

    if (!grid || !emptyState || !resultsTitle) return;

    const filteredFragrances = getFilteredSavedFragrances(savedFragrances);

    if (savedFragrances.length === 0) {
        resultsTitle.innerText = 'No saved fragrances yet';
        emptyState.innerHTML = `
            <h3 class="profile-empty-title">Your profile is ready for discoveries</h3>
            <p class="profile-empty-copy">Save recommendations from the results page and your collection will appear here.</p>
        `;
        emptyState.hidden = false;
        grid.innerHTML = '';
        return;
    }

    if (filteredFragrances.length === 0) {
        resultsTitle.innerText = 'No matches for the current filters';
        emptyState.innerHTML = `
            <h3 class="profile-empty-title">Nothing matches those filters</h3>
            <p class="profile-empty-copy">Clear or adjust the side filters to bring your saved fragrances back into view.</p>
        `;
        emptyState.hidden = false;
        grid.innerHTML = '';
        return;
    }

    resultsTitle.innerText = filteredFragrances.length === savedFragrances.length
        ? `${savedFragrances.length} fragrances in your profile`
        : `${filteredFragrances.length} of ${savedFragrances.length} fragrances shown`;

    emptyState.hidden = true;
    grid.innerHTML = filteredFragrances.map(buildProfileFragranceCard).join('');
}

function renderProfileView() {
    const personalityTitle = authState.personalityTitle || '';
    const savedFragrances = getSavedFragrances();
    const housesCount = new Set(savedFragrances.map(frag => frag.house)).size;
    const familyCount = new Set(savedFragrances.flatMap(frag => frag.noteFamilies || [])).size;
    const profileTitle = document.getElementById('profile-personality-title');
    const profileDesc = document.getElementById('profile-personality-desc');
    const profileMeta = document.getElementById('profile-personality-meta');
    const profileEmailHeading = document.getElementById('profile-email-heading');
    const profileHeroCopy = document.getElementById('profile-hero-copy');
    const profileThemeChip = document.getElementById('profile-theme-chip');
    const profileStatCount = document.getElementById('profile-stat-count');
    const profileStatHouses = document.getElementById('profile-stat-houses');
    const profileStatFamilies = document.getElementById('profile-stat-families');
    const resetButton = document.getElementById('btn-reset-personality');

    if (!profileTitle || !profileDesc || !profileMeta || !profileEmailHeading || !profileHeroCopy
        || !profileThemeChip || !profileStatCount || !profileStatHouses || !profileStatFamilies || !resetButton) {
        return;
    }

    profileTitle.innerText = personalityTitle || 'Personality Not Set Yet';
    profileDesc.innerText = personalityTitle
        ? ARCHETYPES[personalityTitle]
        : 'Run the profiling experience again to assign a fragrance personality and personalize the full site theme.';
    profileMeta.innerText = personalityTitle
        ? 'Your saved account theme and profile page are tuned to this personality.'
        : 'You are signed in, but your profile is currently using the default palette.';
    profileEmailHeading.innerText = authState.profileEmail || 'Signed in profile';
    profileHeroCopy.innerText = personalityTitle
        ? `Your collection and interface are currently keyed to ${personalityTitle}.`
        : 'Build your saved collection now, then reset and re-run profiling whenever you want a new personality read.';
    profileThemeChip.innerText = personalityTitle || 'Default Palette';
    profileStatCount.innerText = String(savedFragrances.length);
    profileStatHouses.innerText = String(housesCount);
    profileStatFamilies.innerText = String(familyCount);
    resetButton.innerText = personalityTitle ? 'Reset Personality' : 'Discover Personality';

    populateProfileFilterControls(savedFragrances);
    renderProfileCollection(savedFragrances);
}

function updateAuthUI() {
    const btnTopLogin = document.getElementById('btn-top-login');

    if (btnTopLogin) {
        if (authState.isLoggedIn) {
            const savedCount = authState.savedRecommendationIds.length;
            btnTopLogin.innerText = savedCount > 0 ? `Profile (${savedCount})` : 'Profile';
        } else {
            btnTopLogin.innerText = 'Sign In';
        }
    }

    renderProfilePanel();

    if (authState.isLoggedIn) {
        renderProfileView();
    }

    const resultsView = document.getElementById('results-view');
    if (resultsView && resultsView.classList.contains('active') && state.latestRecommendations.length > 0) {
        renderResultsCards(state.latestRecommendations);
    }

    applyTheme();
}

function openProfileView() {
    if (!authState.isLoggedIn) {
        showAuthModal({ mode: 'login' });
        return;
    }

    if (viewState.activeViewId === 'loading-view') return;

    if (viewState.activeViewId !== 'profile-view') {
        viewState.previousViewId = viewState.activeViewId;
    }

    resetProfileFilters();
    renderProfileView();
    setActiveView('profile-view');
    applyTheme();
}

function closeProfileView() {
    const targetView = viewState.previousViewId || 'results-view';
    setActiveView(targetView);
    applyTheme();
}

function logoutAccount() {
    authState.isLoggedIn = false;
    authState.pendingRecommendationId = null;
    authState.mode = 'login';
    persistAuthState();

    if (viewState.activeViewId === 'profile-view') {
        closeProfileView();
    }

    updateAuthUI();
}

function resetPersonality() {
    if (!window.confirm('Reset your fragrance personality and restart the profiling experience?')) {
        return;
    }

    authState.personalityTitle = '';
    persistAuthState();
    window.location.reload();
}

function setAuthMode(mode) {
    authState.mode = mode === 'login' ? 'login' : 'signup';
    updateAuthModalContent();
}

function updateAuthModalContent() {
    const authTitle = document.getElementById('auth-title');
    const authSubtitle = document.getElementById('auth-subtitle');
    const btnSubmit = document.getElementById('btn-auth-submit');
    const btnGuest = document.getElementById('btn-auth-guest');
    const authTabs = document.querySelectorAll('.auth-tab');
    const pendingRecommendation = findFragranceById(authState.pendingRecommendationId);

    authTabs.forEach(tab => {
        const isActive = tab.getAttribute('data-tab') === authState.mode;
        tab.classList.toggle('active', isActive);
    });

    if (!authTitle || !authSubtitle || !btnSubmit || !btnGuest) return;

    if (pendingRecommendation) {
        const fragranceLabel = `${pendingRecommendation.name} by ${pendingRecommendation.house}`;

        if (authState.mode === 'login') {
            authTitle.innerText = 'Log In to Save';
            authSubtitle.innerText = `Log in to add ${fragranceLabel} to your fragrance profile.`;
            btnSubmit.innerText = 'Log In & Save';
        } else {
            authTitle.innerText = 'Create Your Profile';
            authSubtitle.innerText = `Create a profile to save ${fragranceLabel} and revisit it later.`;
            btnSubmit.innerText = 'Create Account & Save';
        }
    } else if (authState.mode === 'login') {
        authTitle.innerText = 'Welcome Back';
        authSubtitle.innerText = 'Log in to open your saved profile, collection, and personality theme.';
        btnSubmit.innerText = 'Log In';
    } else {
        authTitle.innerText = 'Create Your Profile';
        authSubtitle.innerText = 'Save your preferences, recommendations, and fragrance personality.';
        btnSubmit.innerText = 'Create Account';
    }

    btnGuest.innerText = 'Continue as Guest';
}

function showAuthModal(options = {}) {
    const { mode = authState.mode, recommendationId = null } = options;
    const modal = document.getElementById('auth-modal');
    const authEmail = document.getElementById('auth-email');
    const authForm = document.getElementById('auth-form');

    authState.pendingRecommendationId = recommendationId;
    setAuthMode(mode);

    if (authForm) {
        authForm.reset();
    }

    if (authEmail && authState.profileEmail) {
        authEmail.value = authState.profileEmail;
    }

    if (modal) {
        modal.classList.add('active');
    }
}

function hideAuthModal() {
    const modal = document.getElementById('auth-modal');
    const authForm = document.getElementById('auth-form');

    authState.pendingRecommendationId = null;

    if (authForm) {
        authForm.reset();
    }

    if (modal) {
        modal.classList.remove('active');
    }
}

function promptAuthForRecommendation(recommendationId) {
    showAuthModal({
        mode: 'signup',
        recommendationId
    });
}

function saveRecommendationToProfile(recommendationId) {
    if (!authState.isLoggedIn) {
        promptAuthForRecommendation(recommendationId);
        return false;
    }

    if (!recommendationId || !findFragranceById(recommendationId)) {
        return false;
    }

    if (state.latestArchetype && state.latestArchetype.title) {
        authState.personalityTitle = state.latestArchetype.title;
    }

    if (!isRecommendationSaved(recommendationId)) {
        authState.savedRecommendationIds.push(recommendationId);
    }

    persistAuthState();
    updateAuthUI();
    return true;
}

function initAuth() {
    const btnTopLogin = document.getElementById('btn-top-login');
    const authModal = document.getElementById('auth-modal');
    const authTabs = document.querySelectorAll('.auth-tab');
    const authForm = document.getElementById('auth-form');
    const btnGuest = document.getElementById('btn-auth-guest');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const authEmail = document.getElementById('auth-email');

    if (btnTopLogin) {
        btnTopLogin.addEventListener('click', () => {
            if (authState.isLoggedIn) {
                openProfileView();
                return;
            }

            showAuthModal({ mode: 'login' });
        });
    }

    if (btnCloseModal) {
        btnCloseModal.addEventListener('click', hideAuthModal);
    }

    if (authModal) {
        authModal.addEventListener('click', (event) => {
            if (event.target === authModal) {
                hideAuthModal();
            }
        });
    }

    authTabs.forEach(tab => {
        tab.addEventListener('click', (event) => {
            setAuthMode(event.currentTarget.getAttribute('data-tab'));
        });
    });

    if (btnGuest) {
        btnGuest.addEventListener('click', hideAuthModal);
    }

    if (authForm) {
        authForm.addEventListener('submit', (event) => {
            event.preventDefault();

            const pendingRecommendationId = authState.pendingRecommendationId;
            authState.isLoggedIn = true;
            authState.profileEmail = authEmail && authEmail.value.trim()
                ? authEmail.value.trim()
                : authState.profileEmail;

            if (state.latestArchetype && state.latestArchetype.title) {
                authState.personalityTitle = state.latestArchetype.title;
            }

            persistAuthState();
            hideAuthModal();

            if (pendingRecommendationId) {
                saveRecommendationToProfile(pendingRecommendationId);
            } else {
                updateAuthUI();
            }
        });
    }

    setAuthMode(authState.isLoggedIn ? 'login' : 'signup');
}

function initProfileView() {
    const btnCloseProfile = document.getElementById('btn-profile-close');
    const btnLogout = document.getElementById('btn-profile-logout');
    const btnResetPersonality = document.getElementById('btn-reset-personality');
    const btnClearFilters = document.getElementById('btn-profile-clear-filters');
    const searchInput = document.getElementById('profile-search');
    const houseSelect = document.getElementById('profile-house-filter');
    const tierSelect = document.getElementById('profile-tier-filter');
    const familyContainer = document.getElementById('profile-family-filter');

    if (btnCloseProfile) {
        btnCloseProfile.addEventListener('click', closeProfileView);
    }

    if (btnLogout) {
        btnLogout.addEventListener('click', logoutAccount);
    }

    if (btnResetPersonality) {
        btnResetPersonality.addEventListener('click', resetPersonality);
    }

    if (btnClearFilters) {
        btnClearFilters.addEventListener('click', () => {
            resetProfileFilters();
            renderProfileView();
        });
    }

    if (searchInput) {
        searchInput.addEventListener('input', (event) => {
            profileFilters.search = event.target.value;
            renderProfileView();
        });
    }

    if (houseSelect) {
        houseSelect.addEventListener('change', (event) => {
            profileFilters.house = event.target.value;
            renderProfileView();
        });
    }

    if (tierSelect) {
        tierSelect.addEventListener('change', (event) => {
            profileFilters.tier = event.target.value;
            renderProfileView();
        });
    }

    if (familyContainer) {
        familyContainer.addEventListener('click', (event) => {
            const button = event.target.closest('[data-family]');
            if (!button) return;

            profileFilters.family = button.getAttribute('data-family') || 'all';
            renderProfileView();
        });
    }
}

function renderPills(container, items, onRemove) {
    container.innerHTML = '';
    items.forEach(item => {
        const pill = document.createElement('div');
        pill.className = 'select-pill selected';
        pill.innerText = item + "  ✕";
        pill.style.fontSize = '0.8rem';
        pill.addEventListener('click', () => onRemove(item));
        container.appendChild(pill);
    });
}

function updateProgress() {
    const progress = (currentStep / totalSteps) * 100;
    document.getElementById('wizard-progress').style.width = `${progress}%`;
}

function nextStep() {
    if (currentStep < totalSteps) {
        document.getElementById(`step-${currentStep}`).classList.remove('active');
        currentStep++;
        document.getElementById(`step-${currentStep}`).classList.add('active');
        
        document.getElementById('btn-prev').style.visibility = 'visible';
        if (currentStep === totalSteps) {
            document.getElementById('btn-next').innerText = "Reveal My DNA";
        }
        updateProgress();
    } else {
        processResults();
    }
}

function prevStep() {
    if (currentStep > 1) {
        document.getElementById(`step-${currentStep}`).classList.remove('active');
        currentStep--;
        document.getElementById(`step-${currentStep}`).classList.add('active');
        
        document.getElementById('btn-next').innerText = "Next Step";
        if (currentStep === 1) {
            document.getElementById('btn-prev').style.visibility = 'hidden';
        }
        updateProgress();
    }
}

function processResults() {
    // Hide wizard, show loading
    setActiveView('loading-view');

    // Dynamic Loading Text
    const loaderText = document.getElementById('loader-text');
    const loadingPhases = [
        "Extracting scent markers...",
        "Synthesizing usage context...",
        "Identifying Olfactory Archetype...",
        "Profile complete."
    ];
    let phaseIdx = 0;
    const interval = setInterval(() => {
        phaseIdx++;
        if (phaseIdx < loadingPhases.length) {
            loaderText.style.opacity = 0;
            setTimeout(() => {
                if (loaderText) loaderText.innerText = loadingPhases[phaseIdx];
                if (loaderText) loaderText.style.opacity = 1; 
            }, 300);
        } else {
            clearInterval(interval);
        }
    }, 850);

    // Artificial delay for dramatic effect
    setTimeout(() => {
        clearInterval(interval);
        const recommended = engine.calculateRecommendations(state);
        const archetype = engine.determineArchetype(recommended);
        
        displayResults(archetype, recommended);
    }, 3500);
}

function displayResults(archetype, topFrags) {
    state.latestArchetype = archetype;
    state.latestRecommendations = topFrags;

    if (authState.isLoggedIn) {
        syncStoredPersonality(archetype);
    }

    setActiveView('results-view');
    applyTheme();

    // Set Archetype
    document.getElementById('archetype-title').innerText = archetype.title;
    document.getElementById('archetype-desc').innerText = archetype.description;

    renderProfilePanel();
    renderProfileView();
    renderResultsCards(topFrags);
}

function renderResultsCards(topFrags) {
    const grid = document.getElementById('results-grid');
    if (!grid) return;

    grid.innerHTML = '';

    topFrags.forEach((frag, idx) => {
        const tierStr = Array(frag.priceTier).fill('$').join('');
        const bbClass = frag.blindBuyScore >= 70 ? 'bb-safe' : 'bb-risky';
        const bbText = frag.blindBuyScore >= 70 ? 'Safe Blind Buy' : 'Risky Blind Buy';
        const isSaved = isRecommendationSaved(frag.id);
        const guestClass = authState.isLoggedIn ? '' : ' recommendation-locked';
        const interactiveAttrs = authState.isLoggedIn
            ? ''
            : `tabindex="0" role="button" aria-label="Create a profile to save ${frag.name} by ${frag.house}"`;
        const actionCopy = authState.isLoggedIn
            ? (isSaved
                ? 'Already saved in your fragrance profile.'
                : 'Add this recommendation to your profile to keep it handy.')
            : 'Click this recommendation to create your profile and save it.';
        const actionLabel = authState.isLoggedIn
            ? (isSaved ? 'Saved to Profile' : 'Add to Profile')
            : 'Create Profile to Save';

        // Extract Notes (structured)
        const renderNoteGroup = (label, notes) => {
            if (!notes || notes.length === 0) return '';
            return `
                <div class="note-group">
                    <span class="note-label">${label}</span>
                    <div class="note-pills">
                        ${notes.slice(0, 3).map(n => `<span class="note-pill">${n}</span>`).join('')}
                    </div>
                </div>
            `;
        };
        const noteHtml = `
            ${renderNoteGroup('Top', frag.notes.top)}
            ${renderNoteGroup('Heart', frag.notes.heart)}
            ${renderNoteGroup('Base', frag.notes.base)}
        `;
        
        let dupeHtml = '';
        if (frag.priceTier === 3 || frag.priceTier === 2) {
            // Find if there is a dupe in DB underneath this tier
            const dupe = engine.database.find(d => d.dupeOf === frag.id && d.priceTier < frag.priceTier);
            if (dupe) {
                const similarityScore = 85 + ((frag.id.length + dupe.id.length + idx) % 10);
                dupeHtml = `
                    <div class="dupe-drawer">
                        <button type="button" class="dupe-toggle">
                            <span>Research alternative formulation</span>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="dupe-chevron"><polyline points="6 9 12 15 18 9"></polyline></svg>
                        </button>
                        <div class="dupe-content">
                            <div class="dupe-card">
                                <span class="d-house">${dupe.house}</span>
                                <span class="d-name">${dupe.name}</span>
                                <span class="d-desc">Matches key olfactory markers at ~${similarityScore}% similarity.</span>
                            </div>
                        </div>
                    </div>
                `;
            }
        }

        const html = `
            <div class="glass-panel dossier-card${guestClass}" data-fragrance-id="${frag.id}" style="animation-delay: ${idx * 0.25}s" ${interactiveAttrs}>
                <div class="dossier-badge ${bbClass}">${bbText} • ${frag.blindBuyScore}%</div>
                <div class="dossier-header">
                    <div class="d-info">
                        <div class="d-house">${frag.house}</div>
                        <div class="d-name">${frag.name}</div>
                    </div>
                    <div class="d-tier">${tierStr}</div>
                </div>
                
                <div class="dossier-notes-grid">
                    ${noteHtml}
                </div>

                <div class="dossier-metrics">
                    <div class="d-metric">
                        <div class="m-label">Longevity <span>${frag.longevityScore}/10</span></div>
                        <div class="m-bar-container">
                            <div class="m-bar-fill" style="width: ${frag.longevityScore*10}%"></div>
                            <div class="m-bar-glow" style="left: ${frag.longevityScore*10}%"></div>
                        </div>
                    </div>
                    <div class="d-metric">
                        <div class="m-label">Sillage <span>${frag.sillageScore}/10</span></div>
                        <div class="m-bar-container">
                            <div class="m-bar-fill" style="width: ${frag.sillageScore*10}%"></div>
                            <div class="m-bar-glow" style="left: ${frag.sillageScore*10}%"></div>
                        </div>
                    </div>
                </div>

                <div class="dossier-actions">
                    <p class="dossier-action-copy">${actionCopy}</p>
                    <button
                        type="button"
                        class="btn-primary dossier-save-btn${isSaved ? ' is-saved' : ''}"
                        data-fragrance-id="${frag.id}"
                        ${authState.isLoggedIn && isSaved ? 'disabled' : ''}
                    >
                        ${actionLabel}
                    </button>
                </div>

                ${dupeHtml}
            </div>
        `;
        grid.insertAdjacentHTML('beforeend', html);
    });

    grid.querySelectorAll('.dossier-save-btn').forEach(button => {
        button.addEventListener('click', (event) => {
            event.stopPropagation();

            const recommendationId = event.currentTarget.getAttribute('data-fragrance-id');
            if (authState.isLoggedIn) {
                saveRecommendationToProfile(recommendationId);
            } else {
                promptAuthForRecommendation(recommendationId);
            }
        });
    });

    grid.querySelectorAll('.dupe-toggle').forEach(toggle => {
        toggle.addEventListener('click', (event) => {
            event.stopPropagation();
            toggle.parentElement.classList.toggle('opened');
        });
    });

    if (!authState.isLoggedIn) {
        grid.querySelectorAll('.recommendation-locked').forEach(card => {
            const recommendationId = card.getAttribute('data-fragrance-id');

            card.addEventListener('click', () => {
                promptAuthForRecommendation(recommendationId);
            });

            card.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    promptAuthForRecommendation(recommendationId);
                }
            });
        });
    }
}
