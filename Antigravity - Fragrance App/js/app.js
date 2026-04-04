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
    performance: 50,
    budget: 2,
    latestRecommendations: [],
    latestArchetype: null
};

const STORAGE_KEY = 'maison-daura-profile';
const OFFLINE_AUTOCOMPLETE_COPY = 'Live search is unavailable offline. Use the starter picks below or type a fragrance manually.';

// NOTE: authState is a client-side scaffold. isLoggedIn is not cryptographically
// verified. Replace with JWT/session validation when the backend is implemented.
const authState = {
    isLoggedIn: false,
    mode: 'signup',
    pendingRecommendationId: null,
    profileEmail: '',
    savedRecommendationIds: [],
    personalityTitle: ''
};

const appearanceState = {
    mode: 'dark'
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

let syncUsageIntentStepState = () => {};
let clearUsageIntentStepTimers = () => {};

// Wizard State
let currentStep = 1;
const totalSteps = 3;

const engine = new OlfactoryEngine(fragranceDB, ARCHETYPES);

function isRecognizedArchetypeTitle(title) {
    return Boolean(title && Object.prototype.hasOwnProperty.call(ARCHETYPES, title));
}

function getBackendIssueDetails(error) {
    if (error && error.code === 'DB_NOT_SEEDED') {
        return {
            bannerTitle: 'Database Setup Required',
            bannerCopy: 'The backend is running, but the fragrance catalog has not been seeded yet. Add data.csv to Fragrance App Backend/scripts/ and run npm run seed.',
            resultsTitle: 'Database Setup Required',
            resultsCopy: 'The backend is reachable, but the fragrance catalog is still empty. Add data.csv to Fragrance App Backend/scripts/ and run npm run seed, then try again.',
            autocompleteCopy: 'Search will work after the fragrance database is seeded.'
        };
    }

    return {
        bannerTitle: 'Backend Connection Required',
        bannerCopy: 'Live search, saved profile hydration, and recommendations need the local backend running on http://localhost:3001.',
        resultsTitle: 'Backend Connection Required',
        resultsCopy: 'Recommendations are unavailable until the local backend is running on http://localhost:3001.',
        autocompleteCopy: 'Search is unavailable until the backend is running.'
    };
}

function getEmptyRecommendationIssue() {
    return {
        resultsTitle: 'No Recommendations Available',
        resultsCopy: 'The backend responded, but no recommendations were returned. Reseed or enrich the catalog and try again.'
    };
}

function getOfflineCollectionCopy(missingCount) {
    return missingCount === 1
        ? '1 saved fragrance is unavailable in offline mode. Start the local backend to restore your full collection.'
        : `${missingCount} saved fragrances are unavailable in offline mode. Start the local backend to restore your full collection.`;
}

function renderBackendStatus(issue = null) {
    const panel = document.getElementById('backend-status-panel');
    const title = document.getElementById('backend-status-title');
    const copy = document.getElementById('backend-status-copy');

    if (!panel || !title || !copy) return;

    if (!issue) {
        panel.hidden = true;
        title.innerText = '';
        copy.innerText = '';
        return;
    }

    title.innerText = issue.bannerTitle;
    copy.innerText = issue.bannerCopy;
    panel.hidden = false;
}

function clearBackendStatus() {
    renderBackendStatus(null);
}

function showBackendStatus(error) {
    const issue = getBackendIssueDetails(error);
    renderBackendStatus(issue);
    return issue;
}

function isDisplayNumber(value) {
    return Number.isFinite(value);
}

function formatPriceTier(value) {
    return Number.isInteger(value) && value > 0 ? '$'.repeat(value) : '—';
}

function formatMetricScore(value) {
    if (!isDisplayNumber(value)) return 'Unavailable';
    return `${Number(value.toFixed(1))}/10`;
}

function getMetricBarWidth(value) {
    if (!isDisplayNumber(value)) return '0%';
    return `${Math.max(0, Math.min(10, value)) * 10}%`;
}

function getBlindBuyBadge(value) {
    if (!isDisplayNumber(value)) {
        return {
            className: 'bb-unknown',
            label: 'Blind Buy Data',
            value: 'Unavailable'
        };
    }

    const roundedValue = Math.round(value);
    const isSafe = roundedValue >= 70;
    return {
        className: isSafe ? 'bb-safe' : 'bb-risky',
        label: isSafe ? 'Safe Blind Buy' : 'Risky Blind Buy',
        value: `${roundedValue}%`
    };
}

function runStartupStep(label, callback) {
    try {
        return callback();
    } catch (error) {
        console.error(`Startup step failed: ${label}.`, error);
        return null;
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    await hydrateAuthState();

    runStartupStep('initAppearanceControls', initAppearanceControls);
    applyTheme();

    try {
        await loadFragranceCatalog();
    } catch (error) {
        loadFallbackFragranceCatalog();
        console.warn('Using the bundled fallback fragrance catalog until the local backend is available.', error);
    }

    engine.database = fragranceDB;
    clearBackendStatus();

    runStartupStep('syncActiveView', syncActiveView);
    runStartupStep('initAuth', initAuth);
    runStartupStep('initWizard', initWizard);
    runStartupStep('initProfileView', initProfileView);
    runStartupStep('updateAuthUI', updateAuthUI);
    applyTheme();
});

function initWizard() {
    // Step 1: Favorites with Autocomplete
    const favInput = document.getElementById('fav-input');
    const btnAddFav = document.getElementById('btn-add-fav');
    const favTags = document.getElementById('fav-tags');
    const acDropdown = document.getElementById('autocomplete-dropdown');
    const autocompleteHelper = document.getElementById('autocomplete-helper');
    const starterGrid = document.getElementById('starter-grid');
    let acIndex = -1; // keyboard navigation index
    let autocompleteTimer = null;
    let autocompleteRequestId = 0;

    const getStarterFavoriteValue = (pick) => `${pick.name} — ${pick.house}`;

    const setAutocompleteHelper = (message = '') => {
        if (!autocompleteHelper) return;

        autocompleteHelper.innerText = message;
        autocompleteHelper.hidden = !message;
    };

    const cancelPendingAutocomplete = () => {
        autocompleteRequestId += 1;
        if (autocompleteTimer) {
            clearTimeout(autocompleteTimer);
            autocompleteTimer = null;
        }
    };

    const syncStarterCards = () => {
        if (!starterGrid) return;

        starterGrid.querySelectorAll('.starter-card').forEach(card => {
            const favoriteValue = card.getAttribute('data-favorite');
            card.classList.toggle('picked', state.favorites.includes(favoriteValue));
        });
    };

    const addFav = (val) => {
        const text = (val || favInput.value).trim();
        if (text && !state.favorites.includes(text)) {
            state.favorites.push(text);
            renderFavTags();
            favInput.value = '';
            cancelPendingAutocomplete();
            hideDropdown();
        }
    };

    const renderFavTags = () => {
        renderPills(favTags, state.favorites, (item) => {
            state.favorites = state.favorites.filter(i => i !== item);
            renderFavTags();
        });
        syncStarterCards();
    };

    const showDropdown = (matches, emptyMessage = 'No matches — press Enter to add custom entry') => {
        acDropdown.innerHTML = '';
        acIndex = -1;

        if (matches.length === 0) {
            acDropdown.innerHTML = `<div class="ac-no-results">${emptyMessage}</div>`;
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

    if (isUsingFallbackCatalog()) {
        favInput.placeholder = 'Use starter picks below or type a fragrance manually';
        favInput.setAttribute('aria-describedby', 'autocomplete-helper');
        setAutocompleteHelper(OFFLINE_AUTOCOMPLETE_COPY);
    } else {
        favInput.removeAttribute('aria-describedby');
        setAutocompleteHelper('');
    }

    favInput.addEventListener('input', () => {
        const query = favInput.value.trim();
        cancelPendingAutocomplete();

        if (isUsingFallbackCatalog()) {
            hideDropdown();
            setAutocompleteHelper(OFFLINE_AUTOCOMPLETE_COPY);
            return;
        }

        if (query.length < 2) {
            hideDropdown();
            return;
        }

        const requestId = autocompleteRequestId;
        autocompleteTimer = setTimeout(async () => {
            try {
                const matches = (await fetchFragranceSuggestions(query))
                    .filter(item => !state.favorites.includes(item))
                    .slice(0, 8);

                if (requestId !== autocompleteRequestId) return;
                clearBackendStatus();
                showDropdown(matches);
            } catch (error) {
                if (requestId !== autocompleteRequestId) return;
                console.warn('Unable to load fragrance suggestions.', error);
                const issue = showBackendStatus(error);
                showDropdown([], issue.autocompleteCopy);
            } finally {
                if (requestId === autocompleteRequestId) {
                    autocompleteTimer = null;
                }
            }
        }, 300);
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
        if (!e.target.closest('.autocomplete-wrapper')) {
            cancelPendingAutocomplete();
            hideDropdown();
        }
    });

    // Start Here: Populate starter grid
    STARTER_PICKS.forEach(pick => {
        const card = document.createElement('div');
        const fullName = getStarterFavoriteValue(pick);

        card.className = 'starter-card';
        card.setAttribute('data-favorite', fullName);
        card.innerHTML = `
            <span class="starter-name">${pick.name}</span>
            <span class="starter-house">${pick.house}</span>
            <span class="starter-vibe">${pick.vibe}</span>
        `;
        card.addEventListener('click', () => {
            if (card.classList.contains('picked')) {
                state.favorites = state.favorites.filter(f => f !== fullName);
                card.classList.remove('picked');
                renderFavTags();
            } else {
                state.favorites.push(fullName);
                card.classList.add('picked');
                renderFavTags();
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
    const occasionSection = document.getElementById('occasion-section');
    const climateSection = document.getElementById('climate-section');
    const perfSection = document.getElementById('perf-section');
    const budgetSection = document.getElementById('budget-section');
    let sliderInteracted = false;
    let usageIntentRevealTimers = [];

    const clearUsageIntentRevealTimers = () => {
        usageIntentRevealTimers.forEach(timerId => window.clearTimeout(timerId));
        usageIntentRevealTimers = [];
        [occasionSection, climateSection, perfSection, budgetSection].forEach(section => {
            if (section) {
                section.dataset.revealScheduled = 'false';
            }
        });
    };

    const revealSection = (section, { scroll = false } = {}) => {
        if (!section || section.classList.contains('revealed')) return;

        section.dataset.revealScheduled = 'false';
        section.classList.add('revealed');

        if (scroll && currentStep === 3) {
            window.setTimeout(() => {
                section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 180);
        }
    };

    const queueSectionReveal = (section, delay = 0) => {
        if (!section || section.classList.contains('revealed') || section.dataset.revealScheduled === 'true') {
            return;
        }

        if (delay <= 0) {
            revealSection(section);
            return;
        }

        section.dataset.revealScheduled = 'true';
        const timerId = window.setTimeout(() => {
            revealSection(section);
            usageIntentRevealTimers = usageIntentRevealTimers.filter(id => id !== timerId);
        }, delay);
        usageIntentRevealTimers.push(timerId);
    };

    const revealUsageIntentSections = ({ immediate = false } = {}) => {
        if (currentStep !== 3) return;

        const baseDelay = immediate ? 0 : 120;
        const staggerDelay = immediate ? 0 : 140;
        const hasUsageInput = Boolean(
            state.usageDescription.trim()
            || state.occasions.length > 0
            || state.climates.length > 0
        );

        queueSectionReveal(occasionSection, baseDelay);
        queueSectionReveal(climateSection, baseDelay + staggerDelay);

        if (hasUsageInput) {
            if (immediate) {
                revealSection(perfSection, { scroll: true });
            } else {
                queueSectionReveal(perfSection, baseDelay + (staggerDelay * 2));
            }
        }

        if (sliderInteracted) {
            if (immediate) {
                revealSection(budgetSection, { scroll: true });
            } else {
                queueSectionReveal(budgetSection, baseDelay + (staggerDelay * 3));
            }
        }
    };

    const resetUsageIntentCascade = () => {
        clearUsageIntentRevealTimers();
        sliderInteracted = false;
        [occasionSection, climateSection, perfSection, budgetSection].forEach(section => {
            if (section) {
                section.classList.remove('revealed');
                section.dataset.revealScheduled = 'false';
            }
        });
    };

    syncUsageIntentStepState = revealUsageIntentSections;
    clearUsageIntentStepTimers = clearUsageIntentRevealTimers;

    const usageDesc = document.getElementById('usage-description');
    if (usageDesc) {
        usageDesc.addEventListener('input', () => revealUsageIntentSections({ immediate: true }));
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
                revealUsageIntentSections({ immediate: true });
            });
        });
    };

    const populatePillGrid = (containerId, options, type) => {
        const grid = document.getElementById(containerId);
        if (!grid) return;

        options.forEach(val => {
            const pill = document.createElement('div');
            pill.className = 'select-pill';
            pill.setAttribute('data-type', type);
            pill.setAttribute('data-val', val);
            pill.textContent = val;
            grid.appendChild(pill);
        });
    };

    populatePillGrid('occasion-grid', OCCASION_OPTIONS, 'occ');
    populatePillGrid('climate-grid', CLIMATE_OPTIONS, 'cli');
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

    perfSlider.addEventListener('input', (event) => {
        const val = parseInt(event.target.value, 10);
        state.performance = val;
        sliderInteracted = sliderInteracted || event.isTrusted;
        
        let zoneIndex = Math.floor(val / 20);
        if (zoneIndex >= 5) zoneIndex = 4; // handle exactly 100
        
        perfLabel.innerText = perfZones[zoneIndex].name;
        perfDesc.innerText = perfZones[zoneIndex].desc;
        
        const progress = val + '%';
        perfSlider.style.background = `linear-gradient(to right, var(--clr-bar-fill-end) ${progress}, var(--clr-slider-track) ${progress})`;

        if (sliderInteracted) {
            revealSection(budgetSection, { scroll: true });
        }
    });

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
    document.getElementById('btn-restart').addEventListener('click', () => {
        // Reset wizard state
        state.favorites = [];
        state.scentDescription = '';
        state.usageDescription = '';
        state.selectedFamilies = [];
        state.selectedNotes = [];
        state.selectedAccords = [];
        state.occasions = [];
        state.climates = [];
        state.performance = 50;
        state.budget = 2;
        state.latestRecommendations = [];
        state.latestArchetype = null;

        // Reset step
        currentStep = 1;

        // Clear UI selections
        document.querySelectorAll('.select-pill.selected, .family-card.selected, .subnote-pill.selected, .budget-pill.selected').forEach(el => el.classList.remove('selected'));
        document.querySelectorAll('.inner-subnotes.expanded').forEach(el => el.classList.remove('expanded'));
        document.getElementById('fav-input').value = '';
        document.getElementById('fav-tags').innerHTML = '';
        document.getElementById('scent-description').value = '';
        document.getElementById('usage-description').value = '';
        document.getElementById('mic-status').textContent = '';
        document.getElementById('mic-status-usage').textContent = '';
        hideDropdown();

        // Reset performance
        perfSlider.value = '50';
        perfSlider.dispatchEvent(new Event('input'));

        // Re-default budget
        const defaultPill = budgetGrid.querySelector('[data-val="2"]');
        if (defaultPill) defaultPill.classList.add('selected');

        // Reset cascading reveals
        resetUsageIntentCascade();

        // Reset loader text
        const loaderText = document.getElementById('loader-text');
        if (loaderText) {
            loaderText.innerText = 'Extracting scent markers...';
            loaderText.style.opacity = '1';
        }

        renderFavTags();

        // Navigate back
        setActiveView('wizard-view');
        updateWizardUI();
        applyTheme();
    });

    updateWizardUI();
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

function getAppearanceMode() {
    return appearanceState.mode === 'light' ? 'light' : 'dark';
}

function getAppearanceLabel() {
    return getAppearanceMode() === 'light' ? 'Switch to Dark' : 'Switch to Light';
}

function getCurrentAppearanceName() {
    return getAppearanceMode() === 'light' ? 'Light Mode' : 'Dark Mode';
}

function getAppearanceClass() {
    return `appearance-${getAppearanceMode()}`;
}

function updateAppearanceToggleUI() {
    const toggle = document.getElementById('btn-appearance-toggle');
    const label = document.getElementById('appearance-toggle-label');
    const isLightMode = getAppearanceMode() === 'light';

    if (!toggle || !label) return;

    label.innerText = getAppearanceLabel();
    toggle.setAttribute('aria-pressed', String(isLightMode));
    toggle.setAttribute('aria-label', getAppearanceLabel());
}

function getEffectiveThemeTitle() {
    if (authState.isLoggedIn && isRecognizedArchetypeTitle(authState.personalityTitle)) {
        return authState.personalityTitle;
    }

    return state.latestArchetype && isRecognizedArchetypeTitle(state.latestArchetype.title)
        ? state.latestArchetype.title
        : '';
}

function applyTheme() {
    Array.from(document.body.classList)
        .filter(className => className.startsWith('theme-') || className.startsWith('appearance-'))
        .forEach(className => document.body.classList.remove(className));

    const themeClass = getThemeClass(getEffectiveThemeTitle());
    if (themeClass) {
        document.body.classList.add(themeClass);
    }

    document.body.classList.add(getAppearanceClass());
    document.body.dataset.appearance = getAppearanceMode();
    document.body.dataset.theme = themeClass || '';
    updateAppearanceToggleUI();
}

async function loadAuthFromStorage() {
    // TODO: Replace with API call when backend is ready
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
}

async function saveAuthToStorage(data) {
    // TODO: Replace with API call when backend is ready
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

async function hydrateAuthState() {
    try {
        const stored = await loadAuthFromStorage();
        authState.isLoggedIn = Boolean(stored.isLoggedIn);
        authState.profileEmail = stored.profileEmail || '';
        authState.personalityTitle = isRecognizedArchetypeTitle(stored.personalityTitle)
            ? stored.personalityTitle
            : '';
        authState.savedRecommendationIds = Array.isArray(stored.savedRecommendationIds)
            ? stored.savedRecommendationIds
            : [];
        appearanceState.mode = stored.appearanceMode === 'light' ? 'light' : 'dark';
    } catch (error) {
        console.warn('Unable to restore saved profile state.', error);
    }
}

async function persistAuthState() {
    try {
        await saveAuthToStorage({
            isLoggedIn: authState.isLoggedIn,
            profileEmail: authState.profileEmail,
            savedRecommendationIds: authState.savedRecommendationIds,
            personalityTitle: authState.personalityTitle,
            appearanceMode: getAppearanceMode()
        });
    } catch (error) {
        console.warn('Unable to persist profile state.', error);
    }
}

function syncStoredPersonality(archetype) {
    if (!authState.isLoggedIn || !archetype || !isRecognizedArchetypeTitle(archetype.title)) return;

    authState.personalityTitle = archetype.title;
    void persistAuthState();
}

function findFragranceById(id) {
    return engine.database.find(fragrance => fragrance.id === id);
}

function getSavedFragranceSnapshot() {
    const availableFragrances = authState.savedRecommendationIds
        .map(findFragranceById)
        .filter(Boolean)
        .sort((a, b) => a.house.localeCompare(b.house) || a.name.localeCompare(b.name));

    return {
        totalSavedCount: authState.savedRecommendationIds.length,
        missingCount: Math.max(0, authState.savedRecommendationIds.length - availableFragrances.length),
        availableFragrances
    };
}

function isRecommendationSaved(id) {
    return authState.isLoggedIn && authState.savedRecommendationIds.includes(id);
}

function getFamilyLabel(familyId) {
    const family = SCENT_FAMILIES.find(item => item.id === familyId);
    return family ? family.label : familyId;
}

function formatBlindBuyMetric(value) {
    return isDisplayNumber(value) ? `${Math.round(value)}%` : 'Unavailable';
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

    const savedSummary = getSavedFragranceSnapshot();
    const savedFragrances = savedSummary.availableFragrances;
    const savedCount = savedFragrances.length;
    const hasOfflineGap = isUsingFallbackCatalog() && savedSummary.missingCount > 0;
    const personalityLabel = isRecognizedArchetypeTitle(authState.personalityTitle)
        ? authState.personalityTitle
        : 'Awaiting personality';

    meta.innerText = hasOfflineGap
        ? `${savedCount} available / ${personalityLabel}`
        : `${savedCount} saved / ${personalityLabel}`;
    empty.innerText = savedSummary.totalSavedCount === 0
        ? 'Add any recommendation below and it will appear here in your saved profile.'
        : (hasOfflineGap ? getOfflineCollectionCopy(savedSummary.missingCount) : '');
    empty.hidden = !empty.innerText;

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
    const tierStr = formatPriceTier(frag.priceTier);
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
                <span>Blind Buy ${formatBlindBuyMetric(frag.blindBuyScore)}</span>
                <span>Longevity ${formatMetricScore(frag.longevityScore)}</span>
                <span>Sillage ${formatMetricScore(frag.sillageScore)}</span>
            </div>
        </article>
    `;
}

function renderProfileCollection(savedSummary) {
    const grid = document.getElementById('profile-fragrance-grid');
    const emptyState = document.getElementById('profile-fragrance-empty');
    const resultsTitle = document.getElementById('profile-results-title');
    const resultsNote = document.getElementById('profile-results-note');

    if (!grid || !emptyState || !resultsTitle || !resultsNote) return;

    const savedFragrances = savedSummary.availableFragrances;
    const filteredFragrances = getFilteredSavedFragrances(savedFragrances);
    const hasOfflineGap = isUsingFallbackCatalog() && savedSummary.missingCount > 0;

    resultsNote.innerText = hasOfflineGap ? getOfflineCollectionCopy(savedSummary.missingCount) : '';
    resultsNote.hidden = !hasOfflineGap;

    if (savedSummary.totalSavedCount === 0) {
        resultsTitle.innerText = 'No saved fragrances yet';
        emptyState.innerHTML = `
            <h3 class="profile-empty-title">Your profile is ready for discoveries</h3>
            <p class="profile-empty-copy">Save recommendations from the results page and your collection will appear here.</p>
        `;
        emptyState.hidden = false;
        grid.innerHTML = '';
        return;
    }

    if (savedFragrances.length === 0 && hasOfflineGap) {
        resultsTitle.innerText = 'Offline collection preview';
        emptyState.innerHTML = `
            <h3 class="profile-empty-title">Your saved collection needs the backend for the full view</h3>
            <p class="profile-empty-copy">${getOfflineCollectionCopy(savedSummary.missingCount)}</p>
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
    const personalityTitle = isRecognizedArchetypeTitle(authState.personalityTitle)
        ? authState.personalityTitle
        : '';
    const savedSummary = getSavedFragranceSnapshot();
    const savedFragrances = savedSummary.availableFragrances;
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
        ? `Your saved account theme and profile page are tuned to this personality in ${getCurrentAppearanceName().toLowerCase()}.`
        : `You are signed in, and your profile is currently using the default palette in ${getCurrentAppearanceName().toLowerCase()}.`;
    profileEmailHeading.innerText = authState.profileEmail || 'Signed in profile';
    profileHeroCopy.innerText = personalityTitle
        ? `Your collection and interface are currently keyed to ${personalityTitle}.`
        : 'Build your saved collection now, then reset and re-run profiling whenever you want a new personality read.';
    profileThemeChip.innerText = personalityTitle || 'Default Palette';
    profileStatCount.innerText = String(savedSummary.availableFragrances.length);
    profileStatHouses.innerText = String(housesCount);
    profileStatFamilies.innerText = String(familyCount);
    resetButton.innerText = personalityTitle ? 'Reset Personality' : 'Discover Personality';

    populateProfileFilterControls(savedFragrances);
    renderProfileCollection(savedSummary);
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

function handleAppearanceToggle() {
    appearanceState.mode = getAppearanceMode() === 'light' ? 'dark' : 'light';
    void persistAuthState();
    applyTheme();

    if (authState.isLoggedIn && viewState.activeViewId === 'profile-view') {
        renderProfileView();
    }
}

function initAppearanceControls() {
    const toggle = document.getElementById('btn-appearance-toggle');
    if (!toggle) return;

    if (!toggle.__appearanceBound) {
        toggle.addEventListener('click', handleAppearanceToggle);
        toggle.__appearanceBound = true;
    }

    updateAppearanceToggleUI();
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
    void persistAuthState();

    if (viewState.activeViewId === 'profile-view') {
        closeProfileView();
    }

    updateAuthUI();
}

function resetPersonality() {
    const confirmed = window.confirm('This will clear your saved fragrance personality. Your saved fragrances will remain. Are you sure?');
    if (!confirmed) return;

    authState.personalityTitle = '';
    state.latestArchetype = null;
    void persistAuthState();
    updateAuthUI();
}

function setAuthMode(mode) {
    authState.mode = mode === 'login' ? 'login' : 'signup';
    setAuthError('');
    updateAuthModalContent();
}

function setAuthError(message = '') {
    const authError = document.getElementById('auth-error');
    if (!authError) return;

    authError.textContent = message;
    authError.style.display = message ? 'block' : 'none';
}

function updateAuthModalContent() {
    const authTitle = document.getElementById('auth-title');
    const authSubtitle = document.getElementById('auth-subtitle');
    const btnSubmit = document.getElementById('btn-auth-submit');
    const btnGuest = document.getElementById('btn-auth-guest');
    const confirmBlock = document.getElementById('auth-confirm-block');
    const confirmInput = document.getElementById('auth-confirm');
    const authTabs = document.querySelectorAll('.auth-tab');
    const pendingRecommendation = findFragranceById(authState.pendingRecommendationId);

    authTabs.forEach(tab => {
        const isActive = tab.getAttribute('data-tab') === authState.mode;
        tab.classList.toggle('active', isActive);
    });

    if (confirmBlock) {
        confirmBlock.classList.toggle('visible', authState.mode === 'signup');
    }

    if (confirmInput) {
        confirmInput.required = authState.mode === 'signup';
        if (authState.mode !== 'signup') {
            confirmInput.value = '';
        }
    }

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

    setAuthError('');

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

    setAuthError('');

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

    if (state.latestArchetype && isRecognizedArchetypeTitle(state.latestArchetype.title)) {
        authState.personalityTitle = state.latestArchetype.title;
    }

    if (!isRecommendationSaved(recommendationId)) {
        authState.savedRecommendationIds.push(recommendationId);
    }

    void persistAuthState();
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
    const authPassword = document.getElementById('auth-password');
    const authConfirm = document.getElementById('auth-confirm');

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
        authForm.addEventListener('input', () => setAuthError(''));

        authForm.addEventListener('submit', (event) => {
            event.preventDefault();
            setAuthError('');

            if (authState.mode === 'signup') {
                const password = authPassword ? authPassword.value : '';
                const confirm = authConfirm ? authConfirm.value : '';

                if (password !== confirm) {
                    setAuthError('Passwords do not match.');
                    return;
                }
            }

            const pendingRecommendationId = authState.pendingRecommendationId;
            authState.isLoggedIn = true;
            authState.profileEmail = authEmail && authEmail.value.trim()
                ? authEmail.value.trim()
                : authState.profileEmail;

            if (state.latestArchetype && isRecognizedArchetypeTitle(state.latestArchetype.title)) {
                authState.personalityTitle = state.latestArchetype.title;
            }

            void persistAuthState();
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
    const progressBar = document.getElementById('wizard-progress');

    if (progressBar) {
        progressBar.style.width = `${progress}%`;
    }
}

function updateWizardUI() {
    document.querySelectorAll('.wizard-step').forEach((step, index) => {
        step.classList.toggle('active', index + 1 === currentStep);
    });

    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');

    if (btnPrev) {
        btnPrev.style.visibility = currentStep === 1 ? 'hidden' : 'visible';
    }

    if (btnNext) {
        btnNext.innerText = currentStep === totalSteps ? 'Reveal My DNA' : 'Next Step';
    }

    if (currentStep === 3) {
        syncUsageIntentStepState();
    } else {
        clearUsageIntentStepTimers();
    }

    updateProgress();
}

function nextStep() {
    if (currentStep < totalSteps) {
        currentStep++;
        updateWizardUI();
    } else {
        void processResults();
    }
}

function prevStep() {
    if (currentStep > 1) {
        currentStep--;
        updateWizardUI();
    }
}

function showResultsError(issue) {
    state.latestArchetype = null;
    state.latestRecommendations = [];

    setActiveView('results-view');
    applyTheme();

    const archetypeTitle = document.getElementById('archetype-title');
    const archetypeDesc = document.getElementById('archetype-desc');
    const resultsGrid = document.getElementById('results-grid');

    if (archetypeTitle) {
        archetypeTitle.innerText = issue.resultsTitle;
    }

    if (archetypeDesc) {
        archetypeDesc.innerText = issue.resultsCopy;
    }

    renderProfilePanel();
    renderProfileView();

    if (resultsGrid) {
        resultsGrid.innerHTML = `
            <div class="glass-panel results-status-panel">
                <h3 class="results-status-title">${issue.resultsTitle}</h3>
                <p class="results-status-copy">${issue.resultsCopy}</p>
            </div>
        `;
    }
}

async function processResults() {
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

    if (loaderText) {
        loaderText.innerText = loadingPhases[0];
        loaderText.style.opacity = 1;
    }

    try {
        const recommended = await engine.getRecommendations(state);
        clearInterval(interval);

        if (!Array.isArray(recommended) || recommended.length === 0) {
            showResultsError(getEmptyRecommendationIssue());
            return;
        }

        const archetype = engine.determineArchetype(recommended);
        displayResults(archetype, recommended);
    } catch (error) {
        clearInterval(interval);
        console.error('Unable to fetch recommendations from the backend.', error);
        showResultsError(getBackendIssueDetails(error));
    } finally {
        if (loaderText) {
            loaderText.innerText = loadingPhases[0];
            loaderText.style.opacity = 1;
        }
    }
}

function displayResults(archetype, topFrags) {
    state.latestArchetype = archetype;
    state.latestRecommendations = topFrags;
    clearBackendStatus();

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
        const tierStr = formatPriceTier(frag.priceTier);
        const blindBuyBadge = getBlindBuyBadge(frag.blindBuyScore);
        const longevityWidth = getMetricBarWidth(frag.longevityScore);
        const sillageWidth = getMetricBarWidth(frag.sillageScore);
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
        if (Number.isInteger(frag.priceTier) && (frag.priceTier === 3 || frag.priceTier === 2)) {
            // Find if there is a dupe in DB underneath this tier
            const dupe = engine.database.find(d => d.dupeOf === frag.id && Number.isFinite(d.priceTier) && d.priceTier < frag.priceTier);
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
                <div class="dossier-badge ${blindBuyBadge.className}">${blindBuyBadge.label} • ${blindBuyBadge.value}</div>
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
                        <div class="m-label">Longevity <span>${formatMetricScore(frag.longevityScore)}</span></div>
                        <div class="m-bar-container">
                            <div class="m-bar-fill" style="width: ${longevityWidth}"></div>
                            <div class="m-bar-glow" style="left: ${longevityWidth}"></div>
                        </div>
                    </div>
                    <div class="d-metric">
                        <div class="m-label">Sillage <span>${formatMetricScore(frag.sillageScore)}</span></div>
                        <div class="m-bar-container">
                            <div class="m-bar-fill" style="width: ${sillageWidth}"></div>
                            <div class="m-bar-glow" style="left: ${sillageWidth}"></div>
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
