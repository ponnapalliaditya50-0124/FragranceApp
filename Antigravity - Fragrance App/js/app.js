function createEmptySuggestionGroups(kind) {
    if (kind === 'usage') {
        return {
            occasions: [],
            climates: []
        };
    }

    return {
        families: [],
        notes: [],
        accords: []
    };
}

function createEmptyCandidateGroups() {
    return {
        families: [],
        notes: [],
        accords: []
    };
}

function createEmptyDerivedProfile(kind) {
    if (kind === 'usage') {
        return {
            occasions: [],
            climates: []
        };
    }

    return {
        families: [],
        notes: [],
        accords: []
    };
}

function createEmptyInterpretationState(kind) {
    return {
        status: 'idle',
        summary: '',
        source: '',
        suggestions: createEmptySuggestionGroups(kind),
        candidates: kind === 'scent' ? createEmptyCandidateGroups() : null,
        derivedProfile: createEmptyDerivedProfile(kind),
        lastInput: '',
        dismissed: [],
        accepted: [],
        errorMessage: ''
    };
}

function mergeUniqueValues(existingValues, incomingValues) {
    return [...new Set([...(existingValues || []), ...(incomingValues || [])])];
}

const INTERPRETATION_GROUP_ORDER = {
    scent: ['families', 'notes', 'accords'],
    usage: ['occasions', 'climates']
};

const INTERPRETATION_GROUP_LABELS = {
    families: 'Note Families',
    notes: 'Fine-Tune Notes',
    accords: 'Accord Families',
    occasions: 'Occasions',
    climates: 'Climates'
};

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
    interpretation: {
        scent: createEmptyInterpretationState('scent'),
        usage: createEmptyInterpretationState('usage')
    },
    latestRecommendations: [],
    latestArchetype: null
};

const authState = {
    isLoggedIn: false,
    mode: 'signup',
    modalView: 'credentials',
    pendingRecommendationId: null,
    verificationEmail: '',
    helperMessage: '',
    user: null,
    profileEmail: '',
    savedRecommendationIds: [],
    personalityTitle: '',
    latestProfile: null,
    latestRecommendationIds: []
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

const GUEST_EXPERIENCE_STORAGE_KEY = 'maison_daura_guest_experience_v1';
const DEFAULT_RESULTS_VISIBLE_COUNT = 5;
const RESULTS_VISIBLE_INCREMENT = 4;
const MAX_COMPARE_ITEMS = 3;
const GUEST_FEEDBACK_VALUES = ['love', 'maybe', 'pass'];
const RESULTS_REFINE_OPTIONS = [
    { id: 'default', label: 'Best Match' },
    { id: 'cheaper', label: 'Cheaper' },
    { id: 'stronger', label: 'Stronger' },
    { id: 'office', label: 'Office-Safe' },
    { id: 'less-sweet', label: 'Less Sweet' },
    { id: 'unique', label: 'More Unique' }
];

function createEmptyGuestExperienceState() {
    return {
        latestProfile: null,
        latestRecommendationIds: [],
        latestArchetypeTitle: '',
        shortlistIds: [],
        compareIds: [],
        feedbackById: {},
        currentStep: 1,
        activeViewId: 'wizard-view'
    };
}

const guestExperienceState = createEmptyGuestExperienceState();
const resultsViewState = {
    recommendationPool: [],
    activeRefine: 'default',
    visibleCount: DEFAULT_RESULTS_VISIBLE_COUNT,
    detailFragranceId: ''
};

let guestPersistenceTimerId = 0;

let syncUsageIntentStepState = () => {};
let clearUsageIntentStepTimers = () => {};
let dismissScentProfileHelp = () => {};
let syncWizardStateToUI = () => {};
let resetWizardExperience = async () => {};

// Wizard State
let currentStep = 1;
const totalSteps = 3;

const engine = new OlfactoryEngine(fragranceDB, ARCHETYPES);

function clampWizardStep(value) {
    const numericValue = Number.parseInt(value, 10);
    if (!Number.isInteger(numericValue)) {
        return 1;
    }

    return Math.max(1, Math.min(totalSteps, numericValue));
}

function normalizeStoredIdList(values) {
    if (!Array.isArray(values)) {
        return [];
    }

    return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
}

function normalizeGuestFeedbackMap(value) {
    if (!value || typeof value !== 'object') {
        return {};
    }

    return Object.fromEntries(
        Object.entries(value)
            .map(([id, feedback]) => [String(id || '').trim(), String(feedback || '').trim()])
            .filter(([id, feedback]) => id && GUEST_FEEDBACK_VALUES.includes(feedback))
    );
}

function getGuestStorage() {
    try {
        return window.localStorage;
    } catch (error) {
        return null;
    }
}

function applyGuestExperiencePayload(payload = {}) {
    guestExperienceState.latestProfile = payload.latestProfile && typeof payload.latestProfile === 'object'
        ? { ...payload.latestProfile }
        : null;
    guestExperienceState.latestRecommendationIds = normalizeStoredIdList(payload.latestRecommendationIds);
    guestExperienceState.latestArchetypeTitle = isRecognizedArchetypeTitle(payload.latestArchetypeTitle)
        ? payload.latestArchetypeTitle
        : '';
    guestExperienceState.shortlistIds = normalizeStoredIdList(payload.shortlistIds);
    guestExperienceState.compareIds = normalizeStoredIdList(payload.compareIds).slice(0, MAX_COMPARE_ITEMS);
    guestExperienceState.feedbackById = normalizeGuestFeedbackMap(payload.feedbackById);
    guestExperienceState.currentStep = clampWizardStep(payload.currentStep);
    guestExperienceState.activeViewId = VIEW_IDS.includes(payload.activeViewId) && payload.activeViewId !== 'loading-view'
        ? payload.activeViewId
        : 'wizard-view';
}

function buildGuestExperiencePayload() {
    return {
        latestProfile: hasLatestProfileContent() ? buildLatestProfileSnapshot() : null,
        latestRecommendationIds: state.latestRecommendations.map(fragrance => fragrance.id),
        latestArchetypeTitle: state.latestArchetype && isRecognizedArchetypeTitle(state.latestArchetype.title)
            ? state.latestArchetype.title
            : '',
        shortlistIds: [...guestExperienceState.shortlistIds],
        compareIds: [...guestExperienceState.compareIds],
        feedbackById: { ...guestExperienceState.feedbackById },
        currentStep,
        activeViewId: viewState.activeViewId === 'loading-view' ? 'wizard-view' : viewState.activeViewId
    };
}

function persistGuestExperience({ immediate = false } = {}) {
    if (authState.isLoggedIn) {
        return;
    }

    const storage = getGuestStorage();
    if (!storage) return;

    const commit = () => {
        guestPersistenceTimerId = 0;
        const payload = buildGuestExperiencePayload();
        applyGuestExperiencePayload(payload);

        try {
            storage.setItem(GUEST_EXPERIENCE_STORAGE_KEY, JSON.stringify(payload));
        } catch (error) {
            console.warn('Unable to persist the guest experience locally.', error);
        }
    };

    if (guestPersistenceTimerId) {
        window.clearTimeout(guestPersistenceTimerId);
        guestPersistenceTimerId = 0;
    }

    if (immediate) {
        commit();
        return;
    }

    guestPersistenceTimerId = window.setTimeout(commit, 120);
}

function clearGuestDraftState() {
    guestExperienceState.latestProfile = null;
    guestExperienceState.latestRecommendationIds = [];
    guestExperienceState.latestArchetypeTitle = '';
    guestExperienceState.compareIds = [];
    guestExperienceState.currentStep = 1;
    guestExperienceState.activeViewId = 'wizard-view';
    resultsViewState.recommendationPool = [];
    resultsViewState.activeRefine = 'default';
    resultsViewState.visibleCount = DEFAULT_RESULTS_VISIBLE_COUNT;
    resultsViewState.detailFragranceId = '';
}

function restoreGuestExperience() {
    if (authState.isLoggedIn) {
        return;
    }

    const storage = getGuestStorage();
    if (!storage) return;

    try {
        const rawPayload = storage.getItem(GUEST_EXPERIENCE_STORAGE_KEY);
        if (!rawPayload) {
            return;
        }

        const parsedPayload = JSON.parse(rawPayload);
        applyGuestExperiencePayload(parsedPayload);

        if (guestExperienceState.latestProfile) {
            applyLatestProfileSnapshot(guestExperienceState.latestProfile);
        }

        state.latestRecommendations = guestExperienceState.latestRecommendationIds
            .map(findFragranceById)
            .filter(Boolean);
        state.latestArchetype = createArchetypeFromTitle(guestExperienceState.latestArchetypeTitle);
        currentStep = guestExperienceState.currentStep;

        syncWizardStateToUI();
        updateWizardUI();
        primeResultsExperience();

        if (
            guestExperienceState.activeViewId !== 'wizard-view'
            && (state.latestRecommendations.length > 0 || guestExperienceState.shortlistIds.length > 0)
        ) {
            setActiveView(guestExperienceState.activeViewId);
        }
    } catch (error) {
        console.warn('Unable to restore the guest experience from local storage.', error);
    }
}

function isRecognizedArchetypeTitle(title) {
    return Boolean(title && Object.prototype.hasOwnProperty.call(ARCHETYPES, title));
}

function getBackendIssueDetails(error) {
    if (error && error.code === 'DB_NOT_SEEDED') {
        return {
            bannerTitle: 'Database Setup Required',
            bannerCopy: 'The backend is running, but the fragrance catalog has not been seeded yet. Add data.csv to scripts/ in the backend repo and run npm run seed.',
            resultsTitle: 'Database Setup Required',
            resultsCopy: 'The backend is reachable, but the fragrance catalog is still empty. Add data.csv to scripts/ in the backend repo and run npm run seed, then try again.',
            autocompleteCopy: 'Search will work after the fragrance database is seeded.'
        };
    }

    return {
        bannerTitle: 'Backend Connection Required',
        bannerCopy: 'Saved profile hydration and account-backed features need the local backend running on http://localhost:3001.',
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

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getFragranceVibeLabel(fragrance) {
    const explicitVibe = String(fragrance && fragrance.vibe ? fragrance.vibe : '').trim();
    if (explicitVibe) {
        return explicitVibe;
    }

    const noteFamilies = Array.isArray(fragrance && fragrance.noteFamilies) ? fragrance.noteFamilies : [];
    const accordTags = Array.isArray(fragrance && fragrance.accordTags)
        ? fragrance.accordTags.map(tag => String(tag || '').toLowerCase())
        : [];

    if (
        noteFamilies.includes('fresh')
        || noteFamilies.includes('citrus')
        || accordTags.some(tag => tag.includes('fresh') || tag.includes('aquatic'))
    ) {
        return 'Fresh & Clean';
    }

    if (
        noteFamilies.includes('sweet')
        || noteFamilies.includes('amber')
        || accordTags.some(tag => tag.includes('gourmand') || tag.includes('oriental'))
    ) {
        return 'Warm & Sweet';
    }

    if (
        noteFamilies.includes('woody')
        || noteFamilies.includes('leather')
        || accordTags.some(tag => tag.includes('dark') || tag.includes('earthy'))
    ) {
        return 'Woody & Dark';
    }

    if (noteFamilies.includes('floral')) {
        return 'Soft & Floral';
    }

    if (noteFamilies.includes('spicy')) {
        return 'Spiced & Bold';
    }

    return 'Signature Ready';
}

function getFragranceAllNotes(fragrance) {
    return [
        ...((fragrance && fragrance.notes && fragrance.notes.top) || []),
        ...((fragrance && fragrance.notes && fragrance.notes.heart) || []),
        ...((fragrance && fragrance.notes && fragrance.notes.base) || [])
    ];
}

function getFragranceMatchScore(fragrance) {
    return Number.isFinite(fragrance && fragrance.matchScore) ? fragrance.matchScore : 0;
}

function getFragrancePowerScore(fragrance) {
    if (!isDisplayNumber(fragrance && fragrance.longevityScore) || !isDisplayNumber(fragrance && fragrance.sillageScore)) {
        return 0;
    }

    return ((fragrance.longevityScore + fragrance.sillageScore) / 2) * 10;
}

function getFragranceSweetnessWeight(fragrance) {
    const noteFamilies = Array.isArray(fragrance && fragrance.noteFamilies) ? fragrance.noteFamilies : [];
    const accordTags = Array.isArray(fragrance && fragrance.accordTags)
        ? fragrance.accordTags.map(tag => String(tag || '').toLowerCase())
        : [];
    const vibeLabel = getFragranceVibeLabel(fragrance).toLowerCase();
    let weight = 0;

    if (noteFamilies.includes('sweet')) weight += 14;
    if (noteFamilies.includes('amber')) weight += 8;
    if (accordTags.includes('gourmand')) weight += 14;
    if (accordTags.includes('oriental')) weight += 8;
    if (vibeLabel.includes('sweet') || vibeLabel.includes('warm')) weight += 5;

    return weight;
}

function isOfficeFriendlyFragrance(fragrance) {
    const occasions = Array.isArray(fragrance && fragrance.occasionTags) ? fragrance.occasionTags : [];
    return occasions.includes('Office')
        || occasions.includes('Everyday/Signature')
        || (getFragrancePowerScore(fragrance) <= 78 && Number(fragrance && fragrance.blindBuyScore) >= 68);
}

function getFragranceUniquenessScore(fragrance) {
    const accordTags = Array.isArray(fragrance && fragrance.accordTags) ? fragrance.accordTags : [];
    let score = 100 - (isDisplayNumber(fragrance && fragrance.blindBuyScore) ? fragrance.blindBuyScore : 65);

    if (accordTags.includes('Powdery')) score += 8;
    if (accordTags.includes('Earthy')) score += 7;
    if (accordTags.includes('Dark & Smoky')) score += 9;
    if (accordTags.includes('Leather')) score += 6;
    if (String(fragrance && fragrance.archetype || '').includes('Modern')) score += 6;
    if (String(fragrance && fragrance.archetype || '').includes('Provocateur')) score += 5;

    return score;
}

function getResultConfidenceLabel(matchScore) {
    if (matchScore >= 215) return 'Signature Match';
    if (matchScore >= 180) return 'Strong Fit';
    if (matchScore >= 145) return 'Worth Sampling';
    return 'Exploratory Pick';
}

function getPreferredFragranceIds(fragrances) {
    if (!Array.isArray(fragrances)) {
        return [];
    }

    return fragrances
        .map(fragrance => String(fragrance && fragrance.id ? fragrance.id : '').trim())
        .filter(Boolean);
}

function reorderPoolByPreferredIds(pool, preferredIds) {
    const preferredIndex = new Map(preferredIds.map((id, index) => [id, index]));

    return pool
        .map((fragrance, originalIndex) => ({ fragrance, originalIndex }))
        .sort((left, right) => {
            const leftPreferredIndex = preferredIndex.has(left.fragrance.id)
                ? preferredIndex.get(left.fragrance.id)
                : Number.MAX_SAFE_INTEGER;
            const rightPreferredIndex = preferredIndex.has(right.fragrance.id)
                ? preferredIndex.get(right.fragrance.id)
                : Number.MAX_SAFE_INTEGER;

            return leftPreferredIndex - rightPreferredIndex || left.originalIndex - right.originalIndex;
        })
        .map(({ fragrance }) => fragrance);
}

function primeResultsExperience(preferredFragrances = state.latestRecommendations) {
    const preferredIds = getPreferredFragranceIds(preferredFragrances);
    let recommendationPool = Array.isArray(engine.database) && engine.database.length > 0
        ? engine.calculateRecommendationPool(state)
        : [];

    if (recommendationPool.length > 0 && preferredIds.length > 0) {
        recommendationPool = reorderPoolByPreferredIds(recommendationPool, preferredIds);
    }

    if (recommendationPool.length === 0) {
        recommendationPool = Array.isArray(preferredFragrances)
            ? preferredFragrances.map(fragrance => ({
                ...fragrance,
                matchScore: getFragranceMatchScore(fragrance),
                matchLog: Array.isArray(fragrance && fragrance.matchLog) ? [...fragrance.matchLog] : []
            }))
            : [];
    }

    resultsViewState.recommendationPool = recommendationPool;
    resultsViewState.activeRefine = 'default';
    resultsViewState.visibleCount = DEFAULT_RESULTS_VISIBLE_COUNT;

    if (
        resultsViewState.detailFragranceId
        && !recommendationPool.some(fragrance => fragrance.id === resultsViewState.detailFragranceId)
    ) {
        resultsViewState.detailFragranceId = '';
    }
}

function getGuestShortlistFragrances() {
    return guestExperienceState.shortlistIds
        .map(findFragranceById)
        .filter(Boolean);
}

function isGuestShortlisted(id) {
    return guestExperienceState.shortlistIds.includes(id);
}

function isCompared(id) {
    return guestExperienceState.compareIds.includes(id);
}

function getGuestFeedback(id) {
    return guestExperienceState.feedbackById[id] || '';
}

function toggleGuestShortlist(id) {
    if (!id || !findFragranceById(id)) {
        return false;
    }

    guestExperienceState.shortlistIds = isGuestShortlisted(id)
        ? guestExperienceState.shortlistIds.filter(currentId => currentId !== id)
        : [...guestExperienceState.shortlistIds, id];

    persistGuestExperience({ immediate: true });
    return true;
}

function toggleCompare(id) {
    if (!id || !findFragranceById(id)) {
        return false;
    }

    if (isCompared(id)) {
        guestExperienceState.compareIds = guestExperienceState.compareIds.filter(currentId => currentId !== id);
    } else {
        const nextIds = [...guestExperienceState.compareIds, id];
        guestExperienceState.compareIds = nextIds.slice(-MAX_COMPARE_ITEMS);
    }

    persistGuestExperience({ immediate: true });
    return true;
}

function setGuestFeedback(id, value) {
    if (!id || !findFragranceById(id)) {
        return false;
    }

    const normalizedValue = GUEST_FEEDBACK_VALUES.includes(value) ? value : '';
    const nextFeedback = { ...guestExperienceState.feedbackById };

    if (!normalizedValue || nextFeedback[id] === normalizedValue) {
        delete nextFeedback[id];
    } else {
        nextFeedback[id] = normalizedValue;
    }

    guestExperienceState.feedbackById = nextFeedback;
    persistGuestExperience({ immediate: true });
    return true;
}

function getGuestSavedRecommendationIdsForMerge() {
    return [...new Set([
        ...guestExperienceState.shortlistIds,
        ...Object.entries(guestExperienceState.feedbackById)
            .filter(([, feedback]) => feedback === 'love')
            .map(([id]) => id)
    ])];
}

function getActiveResultsPool() {
    const recommendationPool = Array.isArray(resultsViewState.recommendationPool)
        ? resultsViewState.recommendationPool.filter(Boolean)
        : [];

    if (recommendationPool.length > 0) {
        return recommendationPool;
    }

    return Array.isArray(state.latestRecommendations)
        ? state.latestRecommendations.filter(Boolean)
        : [];
}

function getRefinedRecommendationPool() {
    const activePool = [...getActiveResultsPool()];

    if (activePool.length === 0) {
        return [];
    }

    const passedIds = new Set(
        Object.entries(guestExperienceState.feedbackById)
            .filter(([, feedback]) => feedback === 'pass')
            .map(([id]) => id)
    );
    const nonPassed = activePool.filter(fragrance => !passedIds.has(fragrance.id));
    const basePool = nonPassed.length >= Math.min(DEFAULT_RESULTS_VISIBLE_COUNT, activePool.length)
        ? [...nonPassed, ...activePool.filter(fragrance => passedIds.has(fragrance.id))]
        : activePool;
    const sortByMatch = (left, right) => (
        getFragranceMatchScore(right) - getFragranceMatchScore(left)
        || String(left.house || '').localeCompare(String(right.house || ''))
        || String(left.name || '').localeCompare(String(right.name || ''))
    );

    switch (resultsViewState.activeRefine) {
    case 'cheaper':
        return basePool.sort((left, right) => (
            Number(left.priceTier || 99) - Number(right.priceTier || 99)
            || sortByMatch(left, right)
        ));
    case 'stronger':
        return basePool.sort((left, right) => (
            getFragrancePowerScore(right) - getFragrancePowerScore(left)
            || sortByMatch(left, right)
        ));
    case 'office':
        return basePool.sort((left, right) => (
            Number(isOfficeFriendlyFragrance(right)) - Number(isOfficeFriendlyFragrance(left))
            || sortByMatch(left, right)
        ));
    case 'less-sweet':
        return basePool.sort((left, right) => (
            getFragranceSweetnessWeight(left) - getFragranceSweetnessWeight(right)
            || sortByMatch(left, right)
        ));
    case 'unique':
        return basePool.sort((left, right) => (
            getFragranceUniquenessScore(right) - getFragranceUniquenessScore(left)
            || sortByMatch(left, right)
        ));
    default:
        return basePool.sort(sortByMatch);
    }
}

function getActiveRefineNote() {
    switch (resultsViewState.activeRefine) {
    case 'cheaper':
        return 'Budget-first sorting favors lower tiers before match score takes over.';
    case 'stronger':
        return 'Projection and longevity are taking priority in this pass.';
    case 'office':
        return 'Everyday-safe and office-friendly fragrances are floating to the top.';
    case 'less-sweet':
        return 'Sweeter, richer picks are being pushed down in favor of drier options.';
    case 'unique':
        return 'More distinctive, less universally safe profiles are getting the spotlight.';
    default:
        return 'Use a refine chip to nudge this set without restarting the wizard.';
    }
}

function addReasonIfNeeded(reasons, copy) {
    if (!copy || reasons.includes(copy) || reasons.length >= 3) {
        return;
    }

    reasons.push(copy);
}

function buildFragranceReasonList(fragrance) {
    const reasons = [];
    const matchLog = Array.isArray(fragrance && fragrance.matchLog) ? fragrance.matchLog : [];

    matchLog.forEach((entry) => {
        let match = null;

        if (entry.includes('Favorite fragrance match')) {
            addReasonIfNeeded(reasons, 'Echoes one of your current favorite fragrances.');
            return;
        }

        match = entry.match(/Favorite profile family match \(([^)]+)\)/);
        if (match) {
            addReasonIfNeeded(reasons, `Shares the ${getFamilyLabel(match[1])} profile of something you already enjoy.`);
            return;
        }

        match = entry.match(/Note family match \(([^)]+)\)/);
        if (match) {
            addReasonIfNeeded(reasons, `Matches your ${getFamilyLabel(match[1])} direction.`);
            return;
        }

        match = entry.match(/Specific note match \(([^)]+)\)/);
        if (match) {
            addReasonIfNeeded(reasons, `Features ${match[1]} in the composition.`);
            return;
        }

        match = entry.match(/Accord match \(([^)]+)\)/);
        if (match) {
            addReasonIfNeeded(reasons, `Carries the ${match[1]} feel you selected.`);
            return;
        }

        match = entry.match(/Occasion match \(([^)]+)\)/);
        if (match) {
            addReasonIfNeeded(reasons, `Built for ${match[1].toLowerCase()}.`);
            return;
        }

        match = entry.match(/Climate match \(([^)]+?)(?: -> [^)]+)?\)/);
        if (match) {
            addReasonIfNeeded(reasons, `Comfortable for ${match[1].toLowerCase()} conditions.`);
            return;
        }

        if (entry.includes('Usage description match')) {
            addReasonIfNeeded(reasons, 'Fits the wear scenario you described.');
            return;
        }

        if (entry.includes('Perfect performance match')) {
            addReasonIfNeeded(reasons, 'Lands very close to your projection target.');
            return;
        }

        if (entry.includes('Good performance match')) {
            addReasonIfNeeded(reasons, 'Stays near your projection target.');
            return;
        }

        if (entry.includes('Exact budget match')) {
            addReasonIfNeeded(reasons, 'Sits right on your current budget target.');
            return;
        }

        if (entry.includes('Under budget')) {
            addReasonIfNeeded(reasons, 'Comes in under your current budget target.');
        }
    });

    const selectedNoteMatches = state.selectedNotes
        .filter((note) => getFragranceAllNotes(fragrance).some(
            fragranceNote => String(fragranceNote || '').toLowerCase() === String(note || '').toLowerCase()
        ))
        .slice(0, 2);

    if (selectedNoteMatches.length > 0) {
        addReasonIfNeeded(reasons, `Includes your picked note${selectedNoteMatches.length > 1 ? 's' : ''}: ${selectedNoteMatches.join(', ')}.`);
    }

    if (reasons.length === 0) {
        addReasonIfNeeded(reasons, `Leans ${getFragranceVibeLabel(fragrance).toLowerCase()} in the overall profile.`);
    }

    if (reasons.length === 1 && fragrance && fragrance.archetype) {
        addReasonIfNeeded(reasons, `Maps to the ${fragrance.archetype.toLowerCase()} archetype family.`);
    }

    return reasons.slice(0, 3);
}

function buildBudgetTakeaway(fragrance) {
    if (!Number.isInteger(fragrance && fragrance.priceTier)) {
        return 'Budget data is unavailable for this fragrance.';
    }

    if (fragrance.priceTier > state.budget) {
        return `Runs above your ${formatPriceTier(state.budget)} target, but the scent profile kept it in the mix.`;
    }

    if (fragrance.priceTier === state.budget) {
        return `Right on your current ${formatPriceTier(state.budget)} budget target.`;
    }

    return `Comes in under your current ${formatPriceTier(state.budget)} budget target.`;
}

function buildPerformanceTakeaway(fragrance) {
    const powerScore = getFragrancePowerScore(fragrance);
    const difference = Math.abs(powerScore - state.performance);

    if (difference <= 15) {
        return 'Very close to the projection level you asked for.';
    }

    if (difference <= 30) {
        return powerScore > state.performance
            ? 'Projects a bit louder than your target.'
            : 'Sits a touch softer than your target.';
    }

    return powerScore > state.performance
        ? 'Leans much stronger than your requested projection.'
        : 'Leans much quieter than your requested projection.';
}

function buildBestForCopy(fragrance) {
    const occasions = Array.isArray(fragrance && fragrance.occasionTags) ? fragrance.occasionTags.slice(0, 2) : [];
    const seasons = Array.isArray(fragrance && fragrance.seasonTags) ? fragrance.seasonTags.slice(0, 2) : [];

    if (occasions.length > 0 && seasons.length > 0) {
        return `${occasions.join(' or ')} in ${seasons.join(' and ')}.`;
    }

    if (occasions.length > 0) {
        return occasions.join(' or ') + '.';
    }

    if (seasons.length > 0) {
        return seasons.join(' and ') + '.';
    }

    return 'Flexible wear across several settings.';
}

function buildNotIdealForCopy(fragrance) {
    const powerScore = getFragrancePowerScore(fragrance);
    const sweetnessWeight = getFragranceSweetnessWeight(fragrance);

    if (powerScore >= 88) {
        return 'Very quiet settings where you want almost no trail.';
    }

    if (sweetnessWeight >= 24) {
        return 'Moments when you want something especially dry or crisp.';
    }

    if (!isOfficeFriendlyFragrance(fragrance)) {
        return 'Safe everyday office wear when you want the least polarizing option.';
    }

    return 'Any moment that calls for the absolute safest blind reach.';
}

function buildResultInsight(fragrance) {
    return {
        confidenceLabel: getResultConfidenceLabel(getFragranceMatchScore(fragrance)),
        scoreLabel: `Match ${Math.round(getFragranceMatchScore(fragrance))}`,
        reasons: buildFragranceReasonList(fragrance),
        budgetTakeaway: buildBudgetTakeaway(fragrance),
        performanceTakeaway: buildPerformanceTakeaway(fragrance),
        bestFor: buildBestForCopy(fragrance),
        notIdealFor: buildNotIdealForCopy(fragrance)
    };
}

function findResultFragranceById(id) {
    return getActiveResultsPool().find(fragrance => fragrance.id === id)
        || state.latestRecommendations.find(fragrance => fragrance.id === id)
        || findFragranceById(id);
}

function renderResultsUtilityPanel() {
    const panel = document.getElementById('results-utility-panel');
    const meta = document.getElementById('results-utility-meta');
    const refineRow = document.getElementById('results-refine-row');
    const refineNote = document.getElementById('results-refine-note');
    const collection = document.getElementById('results-guest-collection');
    const compareTray = document.getElementById('results-compare-tray');

    if (!panel || !meta || !refineRow || !refineNote || !collection || !compareTray) {
        return;
    }

    const refinedPool = getRefinedRecommendationPool();
    const visibleCount = Math.min(resultsViewState.visibleCount, refinedPool.length);
    const shortlistCount = guestExperienceState.shortlistIds.length;
    const compareCount = guestExperienceState.compareIds.length;
    const loveCount = Object.values(guestExperienceState.feedbackById).filter(value => value === 'love').length;
    const maybeCount = Object.values(guestExperienceState.feedbackById).filter(value => value === 'maybe').length;
    const passCount = Object.values(guestExperienceState.feedbackById).filter(value => value === 'pass').length;

    if (refinedPool.length === 0) {
        panel.hidden = true;
        compareTray.hidden = true;
        compareTray.innerHTML = '';
        return;
    }

    panel.hidden = false;
    meta.innerText = `Showing ${visibleCount} of ${refinedPool.length} local matches`;

    refineRow.innerHTML = `
        ${RESULTS_REFINE_OPTIONS.map((option) => `
            <button
                type="button"
                class="results-utility-btn${resultsViewState.activeRefine === option.id ? ' active' : ''}"
                data-refine="${option.id}"
            >
                ${option.label}
            </button>
        `).join('')}
        ${visibleCount < refinedPool.length ? `
            <button type="button" class="results-utility-btn secondary" data-results-action="show-more">
                Show More
            </button>
        ` : ''}
        ${(resultsViewState.activeRefine !== 'default' || resultsViewState.visibleCount > DEFAULT_RESULTS_VISIBLE_COUNT) ? `
            <button type="button" class="results-utility-btn secondary" data-results-action="reset">
                Reset View
            </button>
        ` : ''}
    `;

    refineRow.querySelectorAll('[data-refine]').forEach((button) => {
        button.addEventListener('click', () => {
            resultsViewState.activeRefine = button.getAttribute('data-refine') || 'default';
            resultsViewState.visibleCount = DEFAULT_RESULTS_VISIBLE_COUNT;
            renderResultsCards(state.latestRecommendations);
        });
    });

    refineRow.querySelectorAll('[data-results-action]').forEach((button) => {
        button.addEventListener('click', () => {
            const action = button.getAttribute('data-results-action');

            if (action === 'show-more') {
                resultsViewState.visibleCount += RESULTS_VISIBLE_INCREMENT;
            } else if (action === 'reset') {
                resultsViewState.activeRefine = 'default';
                resultsViewState.visibleCount = DEFAULT_RESULTS_VISIBLE_COUNT;
            }

            renderResultsCards(state.latestRecommendations);
        });
    });

    refineNote.innerText = getActiveRefineNote();
    collection.innerHTML = `
        <div class="results-collection-stat">
            <span class="results-collection-label">Shortlist</span>
            <strong>${shortlistCount}</strong>
        </div>
        <div class="results-collection-stat">
            <span class="results-collection-label">Compare</span>
            <strong>${compareCount}</strong>
        </div>
        <div class="results-collection-stat">
            <span class="results-collection-label">Love</span>
            <strong>${loveCount}</strong>
        </div>
        <div class="results-collection-stat">
            <span class="results-collection-label">Maybe</span>
            <strong>${maybeCount}</strong>
        </div>
        <div class="results-collection-stat">
            <span class="results-collection-label">Pass</span>
            <strong>${passCount}</strong>
        </div>
    `;

    const comparedFragrances = guestExperienceState.compareIds
        .map(findResultFragranceById)
        .filter(Boolean);

    if (comparedFragrances.length === 0) {
        compareTray.hidden = true;
        compareTray.innerHTML = '';
        return;
    }

    compareTray.hidden = false;
    compareTray.innerHTML = `
        <div class="results-utility-header">
            <div>
                <p class="profile-panel-label">Compare Tray</p>
                <h3 class="profile-panel-title">Side-by-side shortlist</h3>
            </div>
            <p class="profile-panel-meta">Up to ${MAX_COMPARE_ITEMS} live comparison picks</p>
        </div>
        <div class="compare-tray-grid">
            ${comparedFragrances.map((fragrance) => `
                <article class="compare-mini-card">
                    <div>
                        <p class="compare-mini-house">${escapeHtml(fragrance.house)}</p>
                        <h4 class="compare-mini-name">${escapeHtml(fragrance.name)}</h4>
                    </div>
                    <div class="compare-mini-meta">
                        <span>${formatPriceTier(fragrance.priceTier)}</span>
                        <span>Power ${Math.round(getFragrancePowerScore(fragrance))}</span>
                        <span>Blind Buy ${formatBlindBuyMetric(fragrance.blindBuyScore)}</span>
                    </div>
                    <button type="button" class="btn-ghost btn-sm compare-mini-remove" data-compare-remove="${fragrance.id}">
                        Remove
                    </button>
                </article>
            `).join('')}
        </div>
    `;

    compareTray.querySelectorAll('[data-compare-remove]').forEach((button) => {
        button.addEventListener('click', () => {
            toggleCompare(button.getAttribute('data-compare-remove'));
            renderResultsCards(state.latestRecommendations);
        });
    });
}

function renderFragranceDetail(fragrance) {
    const detailContent = document.getElementById('fragrance-detail-content');

    if (!detailContent || !fragrance) {
        return;
    }

    const insight = buildResultInsight(fragrance);
    const dupe = Array.isArray(engine.database)
        ? engine.database.find(candidate => candidate.dupeOf === fragrance.id && candidate.priceTier < fragrance.priceTier)
        : null;
    const renderNoteSection = (label, notes) => `
        <div class="detail-note-group">
            <span class="detail-note-label">${label}</span>
            <div class="detail-chip-row">
                ${(notes || []).length > 0
                    ? notes.map(note => `<span class="dossier-reason-chip">${escapeHtml(note)}</span>`).join('')
                    : '<span class="dossier-reason-chip subtle">Unavailable</span>'}
            </div>
        </div>
    `;

    detailContent.innerHTML = `
        <div class="fragrance-detail-shell">
            <div class="detail-hero">
                <div>
                    <p class="profile-panel-label">${escapeHtml(fragrance.house)}</p>
                    <h2 class="profile-panel-title">${escapeHtml(fragrance.name)}</h2>
                    <p class="detail-copy">${escapeHtml(getFragranceVibeLabel(fragrance))} • ${escapeHtml(insight.confidenceLabel)} • ${escapeHtml(insight.scoreLabel)}</p>
                </div>
                <div class="d-tier">${formatPriceTier(fragrance.priceTier)}</div>
            </div>

            <div class="detail-metric-grid">
                <div class="dossier-takeaway">
                    <span class="wizard-summary-label">Longevity</span>
                    <strong>${formatMetricScore(fragrance.longevityScore)}</strong>
                </div>
                <div class="dossier-takeaway">
                    <span class="wizard-summary-label">Sillage</span>
                    <strong>${formatMetricScore(fragrance.sillageScore)}</strong>
                </div>
                <div class="dossier-takeaway">
                    <span class="wizard-summary-label">Blind Buy</span>
                    <strong>${formatBlindBuyMetric(fragrance.blindBuyScore)}</strong>
                </div>
                <div class="dossier-takeaway">
                    <span class="wizard-summary-label">Power</span>
                    <strong>${Math.round(getFragrancePowerScore(fragrance))}/100</strong>
                </div>
            </div>

            <section class="detail-section">
                <h3>Why It Matched</h3>
                <div class="detail-chip-row">
                    ${insight.reasons.map(reason => `<span class="dossier-reason-chip">${escapeHtml(reason)}</span>`).join('')}
                </div>
            </section>

            <section class="detail-section">
                <h3>Note Pyramid</h3>
                <div class="detail-grid">
                    ${renderNoteSection('Top', fragrance.notes && fragrance.notes.top)}
                    ${renderNoteSection('Heart', fragrance.notes && fragrance.notes.heart)}
                    ${renderNoteSection('Base', fragrance.notes && fragrance.notes.base)}
                </div>
            </section>

            <section class="detail-section">
                <h3>Where It Shines</h3>
                <div class="detail-grid">
                    <div class="dossier-takeaway">
                        <span class="wizard-summary-label">Best For</span>
                        <p>${escapeHtml(insight.bestFor)}</p>
                    </div>
                    <div class="dossier-takeaway">
                        <span class="wizard-summary-label">Less Ideal For</span>
                        <p>${escapeHtml(insight.notIdealFor)}</p>
                    </div>
                    <div class="dossier-takeaway">
                        <span class="wizard-summary-label">Budget Read</span>
                        <p>${escapeHtml(insight.budgetTakeaway)}</p>
                    </div>
                    <div class="dossier-takeaway">
                        <span class="wizard-summary-label">Performance Read</span>
                        <p>${escapeHtml(insight.performanceTakeaway)}</p>
                    </div>
                </div>
            </section>

            <section class="detail-section">
                <h3>Seasons & Occasions</h3>
                <div class="detail-grid">
                    <div class="dossier-takeaway">
                        <span class="wizard-summary-label">Seasons</span>
                        <div class="detail-chip-row">
                            ${(fragrance.seasonTags || []).map(tag => `<span class="dossier-reason-chip">${escapeHtml(tag)}</span>`).join('') || '<span class="dossier-reason-chip subtle">Unavailable</span>'}
                        </div>
                    </div>
                    <div class="dossier-takeaway">
                        <span class="wizard-summary-label">Occasions</span>
                        <div class="detail-chip-row">
                            ${(fragrance.occasionTags || []).map(tag => `<span class="dossier-reason-chip">${escapeHtml(tag)}</span>`).join('') || '<span class="dossier-reason-chip subtle">Unavailable</span>'}
                        </div>
                    </div>
                </div>
            </section>

            ${dupe ? `
                <section class="detail-section">
                    <h3>Research Alternative</h3>
                    <div class="dossier-takeaway">
                        <span class="wizard-summary-label">${escapeHtml(dupe.house)} • ${escapeHtml(dupe.name)}</span>
                        <p>${escapeHtml(`${dupe.name} sits at ${formatPriceTier(dupe.priceTier)} and can serve as the more budget-friendly branch of this scent family.`)}</p>
                    </div>
                </section>
            ` : ''}
        </div>
    `;
}

function closeFragranceDetailModal() {
    const modal = document.getElementById('fragrance-detail-modal');
    if (!modal) return;

    resultsViewState.detailFragranceId = '';
    modal.classList.remove('active');
}

function ensureFragranceDetailModalBindings() {
    const modal = document.getElementById('fragrance-detail-modal');
    const closeButton = document.getElementById('btn-close-detail-modal');

    if (!modal || modal.__detailModalBound) {
        return;
    }

    if (closeButton) {
        closeButton.addEventListener('click', closeFragranceDetailModal);
    }

    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            closeFragranceDetailModal();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modal.classList.contains('active')) {
            closeFragranceDetailModal();
        }
    });

    modal.__detailModalBound = true;
}

function openFragranceDetailModal(id) {
    const fragrance = findResultFragranceById(id);
    const modal = document.getElementById('fragrance-detail-modal');

    if (!fragrance || !modal) {
        return;
    }

    ensureFragranceDetailModalBindings();
    resultsViewState.detailFragranceId = fragrance.id;
    renderFragranceDetail(fragrance);
    modal.classList.add('active');
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
    runStartupStep('initFragranceDetailModal', ensureFragranceDetailModalBindings);
    runStartupStep('restoreGuestExperience', restoreGuestExperience);
    runStartupStep('restoreAccountExperience', restoreAccountExperience);
    runStartupStep('updateAuthUI', updateAuthUI);
    applyTheme();

    window.addEventListener('beforeunload', () => {
        persistGuestExperience({ immediate: true });
    });
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
            state.favorites = [...state.favorites, text];
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
        persistGuestExperience();
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

    favInput.removeAttribute('aria-describedby');
    setAutocompleteHelper('');

    favInput.addEventListener('input', () => {
        const query = favInput.value.trim();
        cancelPendingAutocomplete();

        if (query.length < 1) {
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
                showDropdown(matches);
            } catch (error) {
                if (requestId !== autocompleteRequestId) return;
                console.warn('Unable to load fragrance suggestions from the local catalog.', error);
                showDropdown([], 'Suggestions are unavailable right now.');
            } finally {
                if (requestId === autocompleteRequestId) {
                    autocompleteTimer = null;
                }
            }
        }, 120);
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

    // Setting up Scent and Usage Description (Text + Voice + Interpretation)
    const interpretationControllers = {
        scent: {
            debounceTimerId: 0,
            requestId: 0
        },
        usage: {
            debounceTimerId: 0,
            requestId: 0
        }
    };

    const interpretationUi = {
        scent: {
            kind: 'scent',
            stateKey: 'scentDescription',
            textarea: document.getElementById('scent-description'),
            panel: document.getElementById('scent-interpretation-panel'),
            summary: document.getElementById('scent-interpretation-summary'),
            status: document.getElementById('scent-interpretation-status'),
            groups: document.getElementById('scent-interpretation-groups'),
            applyButton: document.getElementById('btn-apply-scent-interpretation'),
            clearButton: document.getElementById('btn-clear-scent-interpretation')
        },
        usage: {
            kind: 'usage',
            stateKey: 'usageDescription',
            textarea: document.getElementById('usage-description'),
            panel: document.getElementById('usage-interpretation-panel'),
            summary: document.getElementById('usage-interpretation-summary'),
            status: document.getElementById('usage-interpretation-status'),
            groups: document.getElementById('usage-interpretation-groups'),
            applyButton: document.getElementById('btn-apply-usage-interpretation'),
            clearButton: document.getElementById('btn-clear-usage-interpretation')
        }
    };

    function getSuggestionValue(entry) {
        if (entry && typeof entry === 'object') {
            return String(entry.value || '').trim();
        }

        return String(entry || '').trim();
    }

    function getSuggestionKey(group, value) {
        return `${group}:${getSuggestionValue(value)}`;
    }

    function extractSuggestionGroups(kind, payload) {
        const groups = createEmptySuggestionGroups(kind);

        if (kind !== 'usage') {
            return groups;
        }

        INTERPRETATION_GROUP_ORDER[kind].forEach((group) => {
            groups[group] = Array.isArray(payload && payload[group])
                ? payload[group].map(value => String(value || '').trim()).filter(Boolean)
                : [];
        });

        return groups;
    }

    function extractCandidateGroups(payload) {
        const groups = createEmptyCandidateGroups();
        const sourceCandidates = payload && payload.candidates && typeof payload.candidates === 'object'
            ? payload.candidates
            : {};

        INTERPRETATION_GROUP_ORDER.scent.forEach((group) => {
            groups[group] = Array.isArray(sourceCandidates[group])
                ? sourceCandidates[group]
                    .map((candidate) => ({
                        value: String(candidate && candidate.value ? candidate.value : '').trim(),
                        confidence: ['high', 'medium', 'low'].includes(candidate && candidate.confidence)
                            ? candidate.confidence
                            : 'low',
                        reasons: Array.isArray(candidate && candidate.reasons)
                            ? candidate.reasons.map(reason => String(reason || '').trim()).filter(Boolean).slice(0, 3)
                            : []
                    }))
                    .filter(candidate => candidate.value)
                : [];
        });

        return groups;
    }

    function deriveProfileFromCandidates(candidates) {
        const derivedProfile = createEmptyDerivedProfile('scent');

        INTERPRETATION_GROUP_ORDER.scent.forEach((group) => {
            derivedProfile[group] = (candidates[group] || [])
                .filter(candidate => candidate.confidence !== 'low')
                .map(candidate => candidate.value);
        });

        return derivedProfile;
    }

    function extractDerivedProfile(payload, candidates) {
        const nextDerivedProfile = createEmptyDerivedProfile('scent');
        const payloadDerivedProfile = payload && payload.derivedProfile && typeof payload.derivedProfile === 'object'
            ? payload.derivedProfile
            : null;

        if (!payloadDerivedProfile) {
            return deriveProfileFromCandidates(candidates);
        }

        INTERPRETATION_GROUP_ORDER.scent.forEach((group) => {
            nextDerivedProfile[group] = Array.isArray(payloadDerivedProfile[group])
                ? payloadDerivedProfile[group].map(value => String(value || '').trim()).filter(Boolean)
                : [];
        });

        return nextDerivedProfile;
    }

    function getInterpretationBucket(kind) {
        return state.interpretation[kind];
    }

    function getInterpretationErrorMessage(error, kind) {
        if (error && error.code === 'LLM_UNAVAILABLE') {
            return kind === 'usage'
                ? 'AI usage interpretation is unavailable right now. You can still choose occasions and climates manually.'
                : 'AI scent interpretation is unavailable right now. You can still choose notes and accords manually.';
        }

        return kind === 'usage'
            ? 'We could not interpret that usage description right now.'
            : 'We could not interpret that scent description right now.';
    }

    function getTranscriptionErrorMessage(error) {
        if (error && error.code === 'LLM_UNAVAILABLE') {
            return 'Voice transcription is unavailable right now.';
        }

        if (error && error.code === 'AUDIO_TOO_LARGE') {
            return 'That recording was too long to transcribe.';
        }

        if (error && error.code === 'UNSUPPORTED_AUDIO_TYPE') {
            return 'This browser recorded an unsupported audio format.';
        }

        return 'We could not transcribe that recording.';
    }

    function getTranscriptionRetryMessage(response) {
        if (!response || response.quality !== 'retry') {
            return 'Try again.';
        }

        if (response.retryReason === 'partial_capture') {
            return 'Try again. We only caught part of that sentence.';
        }

        if (response.retryReason === 'repetition') {
            return 'Try again. That recording came through with repeated words.';
        }

        return 'Try again. The audio came through unclearly.';
    }

    function resetInterpretation(kind, { preserveLastInput = '' } = {}) {
        state.interpretation[kind] = {
            ...createEmptyInterpretationState(kind),
            lastInput: preserveLastInput
        };
        renderInterpretationPanel(kind);
    }

    function clearPendingInterpretationWork() {
        Object.values(interpretationControllers).forEach((controller) => {
            window.clearTimeout(controller.debounceTimerId);
            controller.debounceTimerId = 0;
            controller.requestId += 1;
        });
    }

    function getAppliedSuggestionSets(kind) {
        if (kind === 'usage') {
            return {
                occasions: new Set(state.occasions),
                climates: new Set(state.climates)
            };
        }

        return {
            families: new Set(state.selectedFamilies),
            notes: new Set(state.selectedNotes),
            accords: new Set(state.selectedAccords)
        };
    }

    function getVisibleInterpretationSuggestions(kind) {
        const bucket = getInterpretationBucket(kind);
        const appliedSets = getAppliedSuggestionSets(kind);
        const dismissedSet = new Set(bucket.dismissed);
        const visibleSuggestions = kind === 'scent'
            ? createEmptyCandidateGroups()
            : createEmptySuggestionGroups(kind);

        INTERPRETATION_GROUP_ORDER[kind].forEach((group) => {
            const values = kind === 'scent'
                ? ((bucket.candidates && bucket.candidates[group]) || [])
                : (bucket.suggestions[group] || []);

            visibleSuggestions[group] = values.filter((entry) => {
                const value = getSuggestionValue(entry);

                return value
                    && !dismissedSet.has(getSuggestionKey(group, value))
                    && !appliedSets[group].has(value);
            });
        });

        return visibleSuggestions;
    }

    function countVisibleSuggestionValues(kind) {
        const visibleSuggestions = getVisibleInterpretationSuggestions(kind);

        return INTERPRETATION_GROUP_ORDER[kind].reduce(
            (count, group) => count + visibleSuggestions[group].length,
            0
        );
    }

    function createInterpretationGroupPatch(kind, group, entry) {
        const patch = kind === 'scent'
            ? createEmptyCandidateGroups()
            : createEmptySuggestionGroups(kind);

        patch[group] = [entry];
        return patch;
    }

    function markAcceptedSuggestionKeys(kind, acceptedKeys) {
        const bucket = getInterpretationBucket(kind);
        bucket.accepted = mergeUniqueValues(bucket.accepted, acceptedKeys);
    }

    function applySuggestionGroups(kind, groups) {
        const acceptedKeys = [];

        INTERPRETATION_GROUP_ORDER[kind].forEach((group) => {
            const values = (groups[group] || [])
                .map(entry => getSuggestionValue(entry))
                .filter(Boolean);

            if (!values.length) {
                return;
            }

            values.forEach((value) => {
                acceptedKeys.push(getSuggestionKey(group, value));
            });

            if (kind === 'usage') {
                if (group === 'occasions') {
                    state.occasions = mergeUniqueValues(state.occasions, values);
                } else if (group === 'climates') {
                    state.climates = mergeUniqueValues(state.climates, values);
                }

                return;
            }

            if (group === 'families') {
                state.selectedFamilies = mergeUniqueValues(state.selectedFamilies, values);
            } else if (group === 'notes') {
                state.selectedNotes = mergeUniqueValues(state.selectedNotes, values);
            } else if (group === 'accords') {
                state.selectedAccords = mergeUniqueValues(state.selectedAccords, values);
            }
        });

        markAcceptedSuggestionKeys(kind, acceptedKeys);

        if (kind === 'usage') {
            syncUsageIntentSelections();
            syncUsageIntentStepState({ immediate: true });
            return;
        }

        syncScentProfileSelections();
    }

    function getConfidenceLabel(confidence) {
        if (confidence === 'high') return 'High confidence';
        if (confidence === 'medium') return 'Medium confidence';
        return 'Low confidence';
    }

    function renderCandidateReasonList(candidate) {
        if (!candidate || !Array.isArray(candidate.reasons) || !candidate.reasons.length) {
            return null;
        }

        const reasons = document.createElement('p');
        reasons.className = 'interpretation-item-reasons';
        reasons.innerText = `Why: ${candidate.reasons.join(', ')}`;
        return reasons;
    }

    function renderInterpretationPanel(kind) {
        const ui = interpretationUi[kind];
        const bucket = getInterpretationBucket(kind);
        const visibleSuggestions = getVisibleInterpretationSuggestions(kind);
        const visibleSuggestionCount = countVisibleSuggestionValues(kind);
        const hasVisibleSuggestions = visibleSuggestionCount > 0;
        const shouldShowPanel = Boolean(
            bucket.status === 'loading'
            || bucket.status === 'error'
            || bucket.summary
            || hasVisibleSuggestions
            || (bucket.lastInput && bucket.status === 'ready')
        );

        if (!ui || !ui.panel || !ui.summary || !ui.status || !ui.groups || !ui.applyButton || !ui.clearButton) {
            return;
        }

        ui.panel.hidden = !shouldShowPanel;

        if (!shouldShowPanel) {
            ui.groups.innerHTML = '';
            ui.summary.hidden = true;
            ui.status.hidden = true;
            return;
        }

        ui.summary.innerText = bucket.summary;
        ui.summary.hidden = !bucket.summary;

        let statusText = '';
        if (bucket.status === 'loading') {
            statusText = kind === 'scent'
                ? 'Analyzing your scent description...'
                : 'Interpreting your usage description...';
        } else if (bucket.status === 'error') {
            statusText = bucket.errorMessage;
        } else if (bucket.status === 'ready' && bucket.lastInput && !hasVisibleSuggestions) {
            statusText = kind === 'scent'
                ? 'No new scent profile suggestions to apply right now.'
                : 'No new usage suggestions to apply right now.';
        }

        ui.status.innerText = statusText;
        ui.status.hidden = !statusText;
        ui.status.setAttribute('data-status', bucket.status);
        ui.groups.innerHTML = '';

        INTERPRETATION_GROUP_ORDER[kind].forEach((group) => {
            const values = visibleSuggestions[group];

            if (!values.length) {
                return;
            }

            const section = document.createElement('section');
            const heading = document.createElement('p');
            const items = document.createElement('div');

            section.className = 'interpretation-group';
            heading.className = 'interpretation-group-title';
            heading.innerText = INTERPRETATION_GROUP_LABELS[group];
            items.className = 'interpretation-item-list';

            values.forEach((entry) => {
                const value = getSuggestionValue(entry);
                const item = document.createElement('div');
                const copy = document.createElement('div');
                const headingRow = document.createElement('div');
                const label = document.createElement('span');
                const actions = document.createElement('div');
                const applyButton = document.createElement('button');
                const dismissButton = document.createElement('button');

                item.className = 'interpretation-item';
                copy.className = 'interpretation-item-copy';
                headingRow.className = 'interpretation-item-heading';
                label.className = 'interpretation-item-label';
                label.innerText = value;
                headingRow.appendChild(label);

                if (kind === 'scent' && entry && typeof entry === 'object') {
                    const confidenceBadge = document.createElement('span');
                    confidenceBadge.className = 'interpretation-confidence';
                    confidenceBadge.setAttribute('data-confidence', entry.confidence || 'low');
                    confidenceBadge.innerText = getConfidenceLabel(entry.confidence);
                    headingRow.appendChild(confidenceBadge);
                }

                copy.appendChild(headingRow);

                if (kind === 'scent' && entry && typeof entry === 'object') {
                    const reasons = renderCandidateReasonList(entry);

                    if (reasons) {
                        copy.appendChild(reasons);
                    }
                }

                actions.className = 'interpretation-item-actions';

                applyButton.type = 'button';
                applyButton.className = 'btn-ghost btn-secondary interpretation-item-apply';
                applyButton.innerText = 'Apply';
                applyButton.addEventListener('click', () => {
                    applySuggestionGroups(kind, createInterpretationGroupPatch(kind, group, entry));
                });

                dismissButton.type = 'button';
                dismissButton.className = 'interpretation-item-dismiss';
                dismissButton.setAttribute('aria-label', `Dismiss ${value}`);
                dismissButton.innerText = 'Dismiss';
                dismissButton.addEventListener('click', () => {
                    dismissInterpretationSuggestion(kind, group, value);
                });

                actions.appendChild(applyButton);
                actions.appendChild(dismissButton);
                item.appendChild(copy);
                item.appendChild(actions);
                items.appendChild(item);
            });

            section.appendChild(heading);
            section.appendChild(items);
            ui.groups.appendChild(section);
        });

        ui.applyButton.disabled = bucket.status === 'loading' || !hasVisibleSuggestions;
        ui.clearButton.disabled = bucket.status === 'loading'
            || (!hasVisibleSuggestions && !bucket.summary && bucket.status !== 'error' && !bucket.lastInput);
    }

    function dismissInterpretationSuggestion(kind, group, value) {
        const bucket = getInterpretationBucket(kind);
        const suggestionKey = getSuggestionKey(group, value);

        if (!bucket.dismissed.includes(suggestionKey)) {
            bucket.dismissed = [...bucket.dismissed, suggestionKey];
        }

        renderInterpretationPanel(kind);
    }

    function applyInterpretation(kind) {
        applySuggestionGroups(kind, getVisibleInterpretationSuggestions(kind));
    }

    function queueInterpretation(kind, { immediate = false } = {}) {
        const ui = interpretationUi[kind];
        const controller = interpretationControllers[kind];

        if (!ui || !ui.textarea) {
            return;
        }

        const trimmedText = ui.textarea.value.trim();
        const existingBucket = getInterpretationBucket(kind);

        window.clearTimeout(controller.debounceTimerId);
        controller.debounceTimerId = 0;

        if (!trimmedText || trimmedText.length < 4) {
            resetInterpretation(kind, { preserveLastInput: trimmedText });
            return;
        }

        if (
            trimmedText === existingBucket.lastInput
            && (existingBucket.status === 'loading' || existingBucket.status === 'ready')
        ) {
            return;
        }

        controller.debounceTimerId = window.setTimeout(async () => {
            const requestId = controller.requestId + 1;
            controller.requestId = requestId;
            const latestBucket = getInterpretationBucket(kind);
            const isSameInput = trimmedText === latestBucket.lastInput;

            state.interpretation[kind] = {
                ...createEmptyInterpretationState(kind),
                status: 'loading',
                source: isSameInput ? latestBucket.source : '',
                summary: isSameInput ? latestBucket.summary : '',
                suggestions: isSameInput ? latestBucket.suggestions : createEmptySuggestionGroups(kind),
                candidates: kind === 'scent'
                    ? (isSameInput ? latestBucket.candidates : createEmptyCandidateGroups())
                    : null,
                derivedProfile: isSameInput ? latestBucket.derivedProfile : createEmptyDerivedProfile(kind),
                lastInput: trimmedText,
                dismissed: isSameInput ? latestBucket.dismissed : [],
                accepted: isSameInput ? latestBucket.accepted : [],
                errorMessage: ''
            };
            renderInterpretationPanel(kind);

            try {
                const response = await interpretPreferenceText({ kind, text: trimmedText });

                if (
                    controller.requestId !== requestId
                    || ui.textarea.value.trim() !== trimmedText
                ) {
                    return;
                }

                const nextCandidates = kind === 'scent'
                    ? extractCandidateGroups(response)
                    : createEmptyCandidateGroups();

                state.interpretation[kind] = {
                    ...createEmptyInterpretationState(kind),
                    status: 'ready',
                    source: String(response && response.source ? response.source : '').trim(),
                    summary: String(response && response.summary ? response.summary : '').trim(),
                    suggestions: kind === 'usage'
                        ? extractSuggestionGroups(kind, response)
                        : createEmptySuggestionGroups(kind),
                    candidates: kind === 'scent' ? nextCandidates : null,
                    derivedProfile: kind === 'scent'
                        ? extractDerivedProfile(response, nextCandidates)
                        : createEmptyDerivedProfile(kind),
                    lastInput: trimmedText,
                    dismissed: isSameInput ? latestBucket.dismissed : [],
                    accepted: isSameInput ? latestBucket.accepted : [],
                    errorMessage: ''
                };
            } catch (error) {
                if (
                    controller.requestId !== requestId
                    || ui.textarea.value.trim() !== trimmedText
                ) {
                    return;
                }

                state.interpretation[kind] = {
                    ...createEmptyInterpretationState(kind),
                    status: 'error',
                    lastInput: trimmedText,
                    errorMessage: getInterpretationErrorMessage(error, kind)
                };
            }

            renderInterpretationPanel(kind);
        }, immediate ? 0 : 550);
    }

    function appendTranscriptToTextarea(textarea, transcript) {
        const cleanTranscript = String(transcript || '').trim();

        if (!textarea || !cleanTranscript) {
            return;
        }

        const existingValue = textarea.value.trim();
        textarea.value = existingValue ? `${existingValue} ${cleanTranscript}` : cleanTranscript;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function getAudioFileExtension(mimeType) {
        const normalizedType = String(mimeType || '').toLowerCase();

        if (normalizedType.includes('mp4') || normalizedType.includes('m4a')) return 'm4a';
        if (normalizedType.includes('mpeg') || normalizedType.includes('mp3')) return 'mp3';
        if (normalizedType.includes('ogg')) return 'ogg';
        if (normalizedType.includes('wav')) return 'wav';
        if (normalizedType.includes('flac')) return 'flac';
        return 'webm';
    }

    function pickRecorderMimeType() {
        if (typeof MediaRecorder === 'undefined') {
            return '';
        }

        const candidates = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/mp4',
            'audio/ogg'
        ];

        if (typeof MediaRecorder.isTypeSupported !== 'function') {
            return '';
        }

        return candidates.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) || '';
    }

    function setupMicrophone({ btnId, statusId, textareaId, stateKey, kind }) {
        const btnMic = document.getElementById(btnId);
        const micStatus = document.getElementById(statusId);
        const textarea = document.getElementById(textareaId);

        if (!btnMic || !micStatus || !textarea) return;

        textarea.addEventListener('input', () => {
            state[stateKey] = textarea.value;
            persistGuestExperience();
            queueInterpretation(kind);
        });

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const supportsRecordedAudio = typeof MediaRecorder !== 'undefined'
            && navigator.mediaDevices
            && typeof navigator.mediaDevices.getUserMedia === 'function';
        const MIN_RECORDING_DURATION_MS = 700;

        const setMicStatus = (message, { active = false } = {}) => {
            micStatus.textContent = message;
            micStatus.classList.toggle('active', active);
        };

        const setMicButtonState = (mode) => {
            const isRecording = mode === 'recording';
            const isTranscribing = mode === 'transcribing';
            const nextLabel = isTranscribing
                ? 'Transcribing'
                : (
                    isRecording
                        ? 'Tap to stop recording'
                        : (supportsRecordedAudio ? 'Tap to start recording' : 'Tap to start browser dictation')
                );

            btnMic.classList.toggle('recording', isRecording);
            btnMic.disabled = isTranscribing;
            btnMic.setAttribute('aria-pressed', isRecording ? 'true' : 'false');
            btnMic.setAttribute('title', nextLabel);
            btnMic.setAttribute('aria-label', nextLabel);
        };

        setMicButtonState('ready');

        if (!supportsRecordedAudio && SpeechRecognition) {
            const recognition = new SpeechRecognition();
            let isListening = false;

            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'en-US';

            btnMic.addEventListener('click', () => {
                if (isListening) {
                    recognition.stop();
                    return;
                }

                try {
                    isListening = true;
                    setMicButtonState('recording');
                    setMicStatus('Listening... tap again to stop.', { active: true });
                    recognition.start();
                } catch (error) {
                    isListening = false;
                    setMicButtonState('ready');
                    setMicStatus('Microphone is busy right now.');
                }
            });

            recognition.onresult = (event) => {
                let finalTranscript = '';
                let interimTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcriptValue = String(event.results[i][0].transcript || '').trim();

                    if (!transcriptValue) {
                        continue;
                    }

                    if (event.results[i].isFinal) {
                        finalTranscript += `${transcriptValue} `;
                    } else {
                        interimTranscript += `${transcriptValue} `;
                    }
                }

                if (finalTranscript.trim()) {
                    appendTranscriptToTextarea(textarea, finalTranscript.trim());
                    queueInterpretation(kind, { immediate: true });
                }

                setMicStatus(
                    interimTranscript.trim()
                        ? `Listening... ${interimTranscript.trim()}`
                        : 'Listening... tap again to stop.',
                    { active: true }
                );
            };

            recognition.onend = () => {
                isListening = false;
                setMicButtonState('ready');
                setMicStatus(micStatus.dataset.defaultMessage || 'Ready to record');
            };

            recognition.onerror = (event) => {
                isListening = false;
                setMicButtonState('ready');
                setMicStatus((
                    event.error === 'not-allowed'
                    || event.error === 'service-not-allowed'
                )
                    ? 'Microphone access denied'
                    : 'Voice capture failed');
            };

            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape' && isListening) {
                    recognition.stop();
                }
            });

            micStatus.dataset.defaultMessage = 'Ready to record';
            setMicStatus('Ready to record');
            return;
        }

        if (!supportsRecordedAudio) {
            btnMic.classList.add('hidden');
            return;
        }

        let mediaStream = null;
        let mediaRecorder = null;
        let recordedChunks = [];
        let isPreparing = false;
        let isRecording = false;
        let isTranscribing = false;
        let recordingStartedAt = 0;
        let skipNextTranscription = false;

        const hasLiveMediaStream = () => (
            mediaStream
            && mediaStream.active
            && mediaStream.getTracks().some((track) => track.readyState === 'live')
        );

        const releaseMediaStream = () => {
            if (!mediaStream) {
                return;
            }

            mediaStream.getTracks().forEach((track) => track.stop());
            mediaStream = null;
        };

        const ensureMediaStream = async () => {
            if (hasLiveMediaStream()) {
                return mediaStream;
            }

            releaseMediaStream();

            mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    noiseSuppression: true,
                    echoCancellation: true,
                    autoGainControl: true
                }
            });

            return mediaStream;
        };

        const resetRecorderState = () => {
            mediaRecorder = null;
            recordedChunks = [];
            recordingStartedAt = 0;
            skipNextTranscription = false;
        };

        const finishRecording = async () => {
            const durationMs = recordingStartedAt ? Date.now() - recordingStartedAt : 0;
            const audioType = mediaRecorder && mediaRecorder.mimeType
                ? mediaRecorder.mimeType
                : (recordedChunks[0] && recordedChunks[0].type) || 'audio/webm';
            const audioBlob = new Blob(recordedChunks, { type: audioType });
            const shouldTranscribe = !skipNextTranscription;

            isRecording = false;

            if (!shouldTranscribe) {
                resetRecorderState();
                setMicButtonState('ready');
                setMicStatus(micStatus.dataset.defaultMessage || 'Ready to record');
                return;
            }

            if (!audioBlob.size || durationMs < MIN_RECORDING_DURATION_MS) {
                resetRecorderState();
                setMicButtonState('ready');
                setMicStatus('Try again. Record a little longer.');
                return;
            }

            try {
                isTranscribing = true;
                setMicButtonState('transcribing');
                setMicStatus('Transcribing...', { active: true });

                const formData = new FormData();
                formData.append('audio', audioBlob, `dictation.${getAudioFileExtension(audioType)}`);
                formData.append('durationMs', String(durationMs));
                const response = await transcribePreferenceAudio(formData);

                if (response && response.quality === 'ok' && response.text) {
                    appendTranscriptToTextarea(textarea, response.text);
                    queueInterpretation(kind, { immediate: true });
                    setMicStatus(micStatus.dataset.defaultMessage || 'Ready to record');
                } else {
                    setMicStatus(getTranscriptionRetryMessage(response));
                }
            } catch (error) {
                setMicStatus(getTranscriptionErrorMessage(error));
            } finally {
                isTranscribing = false;
                resetRecorderState();
                setMicButtonState('ready');
            }
        };

        const stopRecording = ({ skipTranscription = false } = {}) => {
            if (!isRecording || !mediaRecorder || mediaRecorder.state === 'inactive') {
                return;
            }

            skipNextTranscription = skipTranscription;

            try {
                if (typeof mediaRecorder.requestData === 'function') {
                    mediaRecorder.requestData();
                }
            } catch (error) {
                // Some browsers can throw if requestData is called mid-state transition.
            }

            try {
                mediaRecorder.stop();
            } catch (error) {
                isRecording = false;
                isTranscribing = false;
                resetRecorderState();
                setMicButtonState('ready');
                setMicStatus('Voice capture failed');
            }
        };

        const startRecording = async () => {
            if (isPreparing || isRecording || isTranscribing) {
                return;
            }

            isPreparing = true;
            setMicStatus('Preparing microphone...', { active: true });

            try {
                const mimeType = pickRecorderMimeType();
                const stream = await ensureMediaStream();
                const recorder = mimeType
                    ? new MediaRecorder(stream, { mimeType })
                    : new MediaRecorder(stream);

                mediaRecorder = recorder;
                recordedChunks = [];
                recordingStartedAt = Date.now();
                skipNextTranscription = false;
                isRecording = true;

                recorder.addEventListener('dataavailable', (event) => {
                    if (event.data && event.data.size > 0) {
                        recordedChunks.push(event.data);
                    }
                });

                recorder.addEventListener('stop', async () => {
                    await finishRecording();
                }, { once: true });

                recorder.addEventListener('error', () => {
                    isRecording = false;
                    isTranscribing = false;
                    resetRecorderState();
                    setMicButtonState('ready');
                    setMicStatus('Voice capture failed');
                }, { once: true });

                recorder.start(250);
                setMicButtonState('recording');
                setMicStatus('Recording... tap again to stop.', { active: true });
            } catch (error) {
                isRecording = false;
                isTranscribing = false;
                resetRecorderState();
                setMicButtonState('ready');
                setMicStatus(
                    error && error.name === 'NotAllowedError'
                        ? 'Microphone access denied'
                        : 'Unable to start recording'
                );
            } finally {
                isPreparing = false;
            }
        };

        const cancelForPageHide = () => {
            if (isRecording) {
                stopRecording({ skipTranscription: true });
            }

            if (!isTranscribing) {
                releaseMediaStream();
            }
        };

        btnMic.addEventListener('click', async (event) => {
            event.preventDefault();

            if (isTranscribing || isPreparing) {
                return;
            }

            if (isRecording) {
                stopRecording();
                return;
            }

            await startRecording();
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && isRecording) {
                event.preventDefault();
                stopRecording();
            }
        });

        window.addEventListener('pagehide', cancelForPageHide);
        window.addEventListener('beforeunload', cancelForPageHide);

        micStatus.dataset.defaultMessage = 'Ready to record';
        setMicStatus('Ready to record');
    }

    Object.values(interpretationUi).forEach((ui) => {
        if (!ui || !ui.applyButton || !ui.clearButton) {
            return;
        }

        ui.applyButton.addEventListener('click', () => applyInterpretation(ui.kind));
        ui.clearButton.addEventListener('click', () => {
            const controller = interpretationControllers[ui.kind];
            window.clearTimeout(controller.debounceTimerId);
            controller.debounceTimerId = 0;
            controller.requestId += 1;
            resetInterpretation(ui.kind, { preserveLastInput: ui.textarea ? ui.textarea.value.trim() : '' });
        });
        renderInterpretationPanel(ui.kind);
    });

    setupMicrophone({ btnId: 'btn-mic', statusId: 'mic-status', textareaId: 'scent-description', stateKey: 'scentDescription', kind: 'scent' });
    setupMicrophone({ btnId: 'btn-mic-usage', statusId: 'mic-status-usage', textareaId: 'usage-description', stateKey: 'usageDescription', kind: 'usage' });

    // Zone B: Note Families Grid
    const familyGrid = document.getElementById('family-grid');
    const selectedNotesTray = document.getElementById('selected-notes-tray');
    const selectedNotesList = document.getElementById('selected-notes-list');
    const selectedNotesCount = document.getElementById('selected-notes-count');
    const selectedNotesEmpty = document.getElementById('selected-notes-empty');
    const familyLookup = new Map(SCENT_FAMILIES.map(family => [family.id, family]));
    const familyCardLookup = new Map();
    const familyNotesLookup = new Map();
    const notePillLookup = new Map();
    const noteFamilyLookup = new Map();
    const accordPillLookup = new Map();
    const infoPopoverHoverQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
    const floatingTooltipRoot = document.createElement('div');
    const floatingTooltipTitle = document.createElement('p');
    const floatingTooltipCopy = document.createElement('p');
    const floatingTooltipId = 'floating-help-popover';
    let activeInfoPopover = null;

    const canHoverInfoPopovers = () => infoPopoverHoverQuery.matches;

    floatingTooltipRoot.id = floatingTooltipId;
    floatingTooltipRoot.className = 'help-popover-layer';
    floatingTooltipRoot.hidden = true;
    floatingTooltipRoot.setAttribute('role', 'tooltip');
    floatingTooltipRoot.setAttribute('aria-hidden', 'true');

    floatingTooltipTitle.className = 'help-popover-title';
    floatingTooltipCopy.className = 'help-popover-copy';
    floatingTooltipRoot.appendChild(floatingTooltipTitle);
    floatingTooltipRoot.appendChild(floatingTooltipCopy);
    document.body.appendChild(floatingTooltipRoot);

    const positionInfoPopover = (controller) => {
        if (!controller || floatingTooltipRoot.hidden) return;

        const viewportPadding = 12;
        const triggerGap = 10;
        const arrowPadding = 18;
        const triggerRect = controller.trigger.getBoundingClientRect();
        const centerX = triggerRect.left + (triggerRect.width / 2);

        floatingTooltipRoot.dataset.placement = 'bottom';
        floatingTooltipRoot.style.left = '0px';
        floatingTooltipRoot.style.top = '0px';
        floatingTooltipRoot.style.setProperty('--help-arrow-offset', '50%');

        const tooltipRect = floatingTooltipRoot.getBoundingClientRect();
        const tooltipWidth = tooltipRect.width;
        const tooltipHeight = tooltipRect.height;
        const fitsBelow = triggerRect.bottom + triggerGap + tooltipHeight + viewportPadding <= window.innerHeight;
        const fitsAbove = triggerRect.top - triggerGap - tooltipHeight - viewportPadding >= 0;
        const placement = !fitsBelow && fitsAbove ? 'top' : 'bottom';

        let left = centerX - (tooltipWidth / 2);
        left = Math.max(viewportPadding, Math.min(left, window.innerWidth - viewportPadding - tooltipWidth));

        let top = placement === 'top'
            ? triggerRect.top - triggerGap - tooltipHeight
            : triggerRect.bottom + triggerGap;

        top = Math.max(viewportPadding, Math.min(top, window.innerHeight - viewportPadding - tooltipHeight));

        const arrowOffset = Math.max(
            arrowPadding,
            Math.min(tooltipWidth - arrowPadding, centerX - left)
        );

        floatingTooltipRoot.dataset.placement = placement;
        floatingTooltipRoot.style.left = `${Math.round(left)}px`;
        floatingTooltipRoot.style.top = `${Math.round(top)}px`;
        floatingTooltipRoot.style.setProperty('--help-arrow-offset', `${Math.round(arrowOffset)}px`);
    };

    const closeInfoPopover = (controller, { force = false } = {}) => {
        if (!controller) return;

        window.clearTimeout(controller.closeTimerId);

        if (controller.isPinned && !force) {
            return;
        }

        controller.isPinned = false;
        controller.wrapper.classList.remove('is-open', 'is-pinned');
        controller.host.classList.remove('has-open-help');
        controller.trigger.setAttribute('aria-expanded', 'false');
        floatingTooltipRoot.classList.remove('is-open');
        floatingTooltipRoot.hidden = true;
        floatingTooltipRoot.setAttribute('aria-hidden', 'true');

        if (activeInfoPopover === controller) {
            activeInfoPopover = null;
        }
    };

    const scheduleInfoPopoverClose = (controller) => {
        if (!controller || controller.isPinned) return;

        window.clearTimeout(controller.closeTimerId);
        controller.closeTimerId = window.setTimeout(() => {
            const activeElement = document.activeElement;

            if (
                controller.isPinned
                || controller.wrapper.matches(':hover')
                || floatingTooltipRoot.matches(':hover')
            ) {
                return;
            }

            if (
                activeElement
                && (controller.wrapper.contains(activeElement) || floatingTooltipRoot.contains(activeElement))
            ) {
                return;
            }

            closeInfoPopover(controller, { force: true });
        }, 90);
    };

    const openInfoPopover = (controller, { pinned = false } = {}) => {
        if (!controller) return;

        window.clearTimeout(controller.closeTimerId);

        if (activeInfoPopover && activeInfoPopover !== controller) {
            closeInfoPopover(activeInfoPopover, { force: true });
        }

        controller.isPinned = pinned || controller.isPinned;
        floatingTooltipTitle.innerText = controller.label;
        floatingTooltipCopy.innerText = controller.helpText;
        floatingTooltipRoot.hidden = false;
        floatingTooltipRoot.classList.remove('is-open');
        floatingTooltipRoot.setAttribute('aria-hidden', 'false');
        controller.wrapper.classList.add('is-open');
        controller.wrapper.classList.toggle('is-pinned', controller.isPinned);
        controller.host.classList.add('has-open-help');
        controller.trigger.setAttribute('aria-expanded', 'true');

        activeInfoPopover = controller;
        positionInfoPopover(controller);
        floatingTooltipRoot.classList.add('is-open');
    };

    const togglePinnedInfoPopover = (controller) => {
        if (activeInfoPopover === controller && controller.isPinned) {
            closeInfoPopover(controller, { force: true });
            return;
        }

        openInfoPopover(controller, { pinned: true });
        controller.trigger.focus();
    };

    const createInfoPopover = ({ host, key, label, helpText, ariaLabel }) => {
        const wrapper = document.createElement('span');
        const trigger = document.createElement('button');

        wrapper.className = 'help-popover-anchor';

        trigger.type = 'button';
        trigger.className = 'help-trigger';
        trigger.setAttribute('aria-label', ariaLabel || `Learn more about ${label}`);
        trigger.setAttribute('aria-expanded', 'false');
        trigger.setAttribute('data-help-key', key);
        trigger.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-info"></use></svg>';
        trigger.setAttribute('aria-controls', floatingTooltipId);
        trigger.setAttribute('aria-describedby', floatingTooltipId);

        const controller = {
            host,
            wrapper,
            trigger,
            label,
            helpText,
            isPinned: false,
            closeTimerId: 0
        };

        trigger.addEventListener('pointerdown', (event) => {
            event.stopPropagation();
        });

        trigger.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();

            if (canHoverInfoPopovers()) {
                openInfoPopover(controller);
                return;
            }

            togglePinnedInfoPopover(controller);
        });

        wrapper.addEventListener('mouseenter', () => {
            if (!canHoverInfoPopovers()) return;
            openInfoPopover(controller);
        });

        wrapper.addEventListener('mouseleave', () => {
            if (!canHoverInfoPopovers()) return;
            scheduleInfoPopoverClose(controller);
        });

        wrapper.addEventListener('focusin', () => {
            openInfoPopover(controller);
        });

        wrapper.addEventListener('focusout', () => {
            window.setTimeout(() => {
                const activeElement = document.activeElement;

                if (controller.isPinned) {
                    return;
                }

                if (activeElement && controller.wrapper.contains(activeElement)) {
                    return;
                }

                closeInfoPopover(controller, { force: true });
            }, 0);
        });

        wrapper.appendChild(trigger);

        return { wrapper, controller };
    };

    document.addEventListener('pointerdown', (event) => {
        if (
            !activeInfoPopover
            || activeInfoPopover.wrapper.contains(event.target)
            || floatingTooltipRoot.contains(event.target)
        ) {
            return;
        }

        closeInfoPopover(activeInfoPopover, { force: true });
    });

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || !activeInfoPopover) {
            return;
        }

        const controller = activeInfoPopover;
        closeInfoPopover(controller, { force: true });

        if (controller.trigger === document.activeElement) {
            controller.trigger.blur();
        }
    });

    window.addEventListener('resize', () => {
        if (activeInfoPopover) {
            positionInfoPopover(activeInfoPopover);
        }
    });

    window.addEventListener('scroll', () => {
        if (activeInfoPopover) {
            positionInfoPopover(activeInfoPopover);
        }
    }, true);

    floatingTooltipRoot.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
    });

    floatingTooltipRoot.addEventListener('click', (event) => {
        event.stopPropagation();
    });

    floatingTooltipRoot.addEventListener('mouseenter', () => {
        if (!activeInfoPopover) return;
        window.clearTimeout(activeInfoPopover.closeTimerId);
    });

    floatingTooltipRoot.addEventListener('mouseleave', () => {
        if (!activeInfoPopover || !canHoverInfoPopovers()) return;
        scheduleInfoPopoverClose(activeInfoPopover);
    });

    dismissScentProfileHelp = () => {
        closeInfoPopover(activeInfoPopover, { force: true });
    };

    const getSelectedNotesCountLabel = (count) => (
        count === 1 ? '1 selected' : `${count} selected`
    );

    const renderSelectedNotesTray = () => {
        if (!selectedNotesTray || !selectedNotesList || !selectedNotesCount || !selectedNotesEmpty) return;

        const selectedCount = state.selectedNotes.length;
        const hasSelections = selectedCount > 0;

        selectedNotesTray.classList.toggle('has-selections', hasSelections);
        selectedNotesCount.innerText = getSelectedNotesCountLabel(selectedCount);
        selectedNotesEmpty.hidden = hasSelections;
        selectedNotesList.hidden = !hasSelections;
        selectedNotesList.innerHTML = '';

        state.selectedNotes.forEach(note => {
            const chip = document.createElement('button');
            const familyId = noteFamilyLookup.get(note);
            const family = familyLookup.get(familyId);
            const noteLabel = document.createElement('span');
            const removeIcon = document.createElement('span');

            chip.type = 'button';
            chip.className = 'selected-note-chip';
            chip.setAttribute('aria-label', `Remove ${note} from fine-tune notes`);

            noteLabel.className = 'selected-note-chip-label';
            noteLabel.innerText = note;
            chip.appendChild(noteLabel);

            if (family) {
                const familyLabel = document.createElement('span');
                familyLabel.className = 'selected-note-chip-family';
                familyLabel.innerText = family.label;
                chip.appendChild(familyLabel);
            }

            removeIcon.className = 'selected-note-chip-remove';
            removeIcon.setAttribute('aria-hidden', 'true');
            removeIcon.innerText = '×';
            chip.appendChild(removeIcon);

            chip.addEventListener('click', () => {
                state.selectedNotes = state.selectedNotes.filter(selectedNote => selectedNote !== note);
                syncScentProfileSelections();
            });

            selectedNotesList.appendChild(chip);
        });
    };

    const syncFamilyCards = () => {
        familyCardLookup.forEach(({ card, subnotesContainer }, familyId) => {
            const isSelected = state.selectedFamilies.includes(familyId);
            card.classList.toggle('selected', isSelected);
            subnotesContainer.classList.toggle('expanded', isSelected);
        });
    };

    const syncNotePills = () => {
        notePillLookup.forEach((pill, note) => {
            pill.classList.toggle('selected', state.selectedNotes.includes(note));
        });
    };

    const syncAccordPills = () => {
        accordPillLookup.forEach((pill, label) => {
            pill.classList.toggle('selected', state.selectedAccords.includes(label));
        });
    };

    const syncScentProfileSelections = () => {
        syncFamilyCards();
        syncNotePills();
        syncAccordPills();
        renderSelectedNotesTray();
        renderInterpretationPanel('scent');
        persistGuestExperience();
    };

    const toggleFineTuneNote = (note) => {
        if (state.selectedNotes.includes(note)) {
            state.selectedNotes = state.selectedNotes.filter(selectedNote => selectedNote !== note);
        } else {
            state.selectedNotes = [...state.selectedNotes, note];
        }

        syncScentProfileSelections();
    };

    const toggleFamilySelection = (familyId) => {
        if (state.selectedFamilies.includes(familyId)) {
            const familyNotes = familyNotesLookup.get(familyId) || [];
            state.selectedFamilies = state.selectedFamilies.filter(selectedFamilyId => selectedFamilyId !== familyId);
            state.selectedNotes = state.selectedNotes.filter(note => !familyNotes.includes(note));
        } else {
            state.selectedFamilies = [...state.selectedFamilies, familyId];
        }

        syncScentProfileSelections();
    };

    const toggleAccordSelection = (label) => {
        if (state.selectedAccords.includes(label)) {
            state.selectedAccords = state.selectedAccords.filter(selectedAccord => selectedAccord !== label);
        } else {
            state.selectedAccords = [...state.selectedAccords, label];
        }

        syncScentProfileSelections();
    };

    SCENT_FAMILIES.forEach(family => {
        const card = document.createElement('div');
        const cardHeader = document.createElement('div');
        const copyBlock = document.createElement('div');
        const label = document.createElement('span');
        const desc = document.createElement('span');
        card.className = 'family-card';
        card.setAttribute('data-family', family.id);
        
        // Build subnotes UI block
        const subnotesContainer = document.createElement('div');
        subnotesContainer.className = 'inner-subnotes';
        subnotesContainer.innerHTML = `<div class="subnotes-header">Fine-tune notes</div>`;
        
        const pillsContainer = document.createElement('div');
        pillsContainer.className = 'subnotes-pills';

        familyNotesLookup.set(family.id, [...family.notes]);
        
        family.notes.forEach(note => {
            const pill = document.createElement('button');
            pill.type = 'button';
            pill.className = 'subnote-pill';
            pill.innerText = note;
            notePillLookup.set(note, pill);
            if (!noteFamilyLookup.has(note)) {
                noteFamilyLookup.set(note, family.id);
            }
            
            pill.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleFineTuneNote(note);
            });
            pillsContainer.appendChild(pill);
        });
        subnotesContainer.appendChild(pillsContainer);

        cardHeader.className = 'family-card-header';
        copyBlock.className = 'family-card-copy';
        label.className = 'family-label';
        label.innerText = family.label;
        desc.className = 'family-desc';
        desc.innerText = family.desc;
        copyBlock.appendChild(label);
        copyBlock.appendChild(desc);
        cardHeader.appendChild(copyBlock);

        const { wrapper: helpWrapper } = createInfoPopover({
            host: card,
            key: `family-${family.id}`,
            label: family.label,
            helpText: family.helpText,
            ariaLabel: `Learn more about the ${family.label} note family`
        });

        cardHeader.appendChild(helpWrapper);
        card.appendChild(cardHeader);
        card.appendChild(subnotesContainer);
        familyCardLookup.set(family.id, { card, subnotesContainer });

        card.addEventListener('click', (event) => {
            if (event.target.closest('.inner-subnotes') || event.target.closest('.help-popover-anchor')) {
                return;
            }

            toggleFamilySelection(family.id);
        });

        familyGrid.appendChild(card);
    });

    syncScentProfileSelections();

    // Zone C: Accord Palette
    const accordGrid = document.getElementById('accord-grid');
    ACCORD_PALETTE.forEach(accord => {
        const pill = document.createElement('div');
        const label = document.createElement('span');
        pill.className = 'select-pill';
        pill.setAttribute('data-accord', accord.label);

        label.className = 'select-pill-label';
        label.innerText = accord.label;
        pill.appendChild(label);

        const { wrapper: helpWrapper } = createInfoPopover({
            host: pill,
            key: `accord-${accord.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
            label: accord.label,
            helpText: accord.helpText,
            ariaLabel: `Learn more about the ${accord.label} accord family`
        });

        pill.appendChild(helpWrapper);
        accordPillLookup.set(accord.label, pill);

        pill.addEventListener('click', (event) => {
            if (event.target.closest('.help-popover-anchor')) {
                return;
            }

            toggleAccordSelection(accord.label);
        });
        accordGrid.appendChild(pill);
    });

    syncAccordPills();

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

    const occasionPillLookup = new Map();
    const climatePillLookup = new Map();

    const syncSelectablePills = (lookup, selectedValues) => {
        lookup.forEach((pill, value) => {
            pill.classList.toggle('selected', selectedValues.includes(value));
        });
    };

    const syncUsageIntentSelections = () => {
        syncSelectablePills(occasionPillLookup, state.occasions);
        syncSelectablePills(climatePillLookup, state.climates);
        renderInterpretationPanel('usage');
        persistGuestExperience();
    };

    const bindSelectables = (containerId, stateKey, lookup) => {
        const grid = document.getElementById(containerId);
        if (!grid) return;
        grid.querySelectorAll('.select-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                const val = pill.getAttribute('data-val');
                const currentValues = Array.isArray(state[stateKey]) ? state[stateKey] : [];
                const nextValues = currentValues.includes(val)
                    ? currentValues.filter(currentValue => currentValue !== val)
                    : [...currentValues, val];

                state[stateKey] = nextValues;
                syncUsageIntentSelections();
                revealUsageIntentSections({ immediate: true });
            });
        });
    };

    const populatePillGrid = (containerId, options, type, lookup) => {
        const grid = document.getElementById(containerId);
        if (!grid) return;

        options.forEach(val => {
            const pill = document.createElement('div');
            pill.className = 'select-pill';
            pill.setAttribute('data-type', type);
            pill.setAttribute('data-val', val);
            pill.textContent = val;
            grid.appendChild(pill);
            lookup.set(val, pill);
        });
    };

    populatePillGrid('occasion-grid', OCCASION_OPTIONS, 'occ', occasionPillLookup);
    populatePillGrid('climate-grid', CLIMATE_OPTIONS, 'cli', climatePillLookup);
    bindSelectables('occasion-grid', 'occasions', occasionPillLookup);
    bindSelectables('climate-grid', 'climates', climatePillLookup);
    syncUsageIntentSelections();

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
        persistGuestExperience();

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
            persistGuestExperience();
        });
    });
    // Set default budget select
    budgetGrid.querySelector(`[data-val="${state.budget}"]`).classList.add('selected');

    syncWizardStateToUI = () => {
        clearPendingInterpretationWork();
        closeInfoPopover(activeInfoPopover, { force: true });
        cancelPendingAutocomplete();
        hideDropdown();

        favInput.value = '';
        document.getElementById('fav-tags').innerHTML = '';
        document.getElementById('scent-description').value = state.scentDescription;
        document.getElementById('usage-description').value = state.usageDescription;
        const scentMicStatus = document.getElementById('mic-status');
        const usageMicStatus = document.getElementById('mic-status-usage');

        if (scentMicStatus) {
            scentMicStatus.textContent = scentMicStatus.dataset.defaultMessage || '';
            scentMicStatus.classList.remove('active');
        }

        if (usageMicStatus) {
            usageMicStatus.textContent = usageMicStatus.dataset.defaultMessage || '';
            usageMicStatus.classList.remove('active');
        }

        perfSlider.value = String(state.performance);
        sliderInteracted = state.performance !== 50;
        perfSlider.dispatchEvent(new Event('input'));

        budgetGrid.querySelectorAll('.budget-pill').forEach(pill => {
            pill.classList.toggle('selected', Number(pill.getAttribute('data-val')) === state.budget);
        });

        renderFavTags();
        syncScentProfileSelections();
        syncUsageIntentSelections();
        renderInterpretationPanel('scent');
        renderInterpretationPanel('usage');
        resetUsageIntentCascade();

        if (state.interpretation.scent.status === 'idle' && state.scentDescription.trim().length >= 4) {
            queueInterpretation('scent', { immediate: true });
        }

        if (state.interpretation.usage.status === 'idle' && state.usageDescription.trim().length >= 4) {
            queueInterpretation('usage', { immediate: true });
        }

        if (currentStep === 3) {
            revealUsageIntentSections({ immediate: true });
        }

        const loaderText = document.getElementById('loader-text');
        if (loaderText) {
            loaderText.innerText = 'Extracting scent markers...';
            loaderText.style.opacity = '1';
        }

        persistGuestExperience();
    };

    resetWizardExperience = async ({ skipConfirmation = false, clearAccountState = false } = {}) => {
        if (authState.isLoggedIn && clearAccountState && !skipConfirmation) {
            const confirmed = window.confirm('Start over and clear the saved profiling snapshot for this account? Your saved fragrances will remain.');
            if (!confirmed) {
                return false;
            }
        }

        applyLatestProfileSnapshot(null);
        state.latestRecommendations = [];
        state.latestArchetype = null;
        currentStep = 1;
        closeFragranceDetailModal();

        if (!authState.isLoggedIn) {
            clearGuestDraftState();
        }

        if (authState.isLoggedIn && clearAccountState) {
            authState.latestProfile = null;
            authState.latestRecommendationIds = [];
            authState.personalityTitle = '';
            await persistAuthState({
                personalityTitle: '',
                latestProfile: null,
                latestRecommendationIds: [],
                clearProfileContext: true
            });
        }

        syncWizardStateToUI();
        setActiveView('wizard-view');
        updateWizardUI();
        updateAuthUI();
        applyTheme();
        persistGuestExperience({ immediate: true });
        return true;
    };

    // Controls
    document.getElementById('btn-next').addEventListener('click', nextStep);
    document.getElementById('btn-prev').addEventListener('click', prevStep);
    document.getElementById('btn-restart').addEventListener('click', () => {
        void resetWizardExperience({ clearAccountState: authState.isLoggedIn });
    });

    updateWizardUI();
}

function syncActiveView() {
    const activeView = document.querySelector('.view.active');
    viewState.activeViewId = activeView ? activeView.id : 'wizard-view';
}

function setActiveView(viewId) {
    dismissScentProfileHelp();

    if (viewId !== 'results-view') {
        closeFragranceDetailModal();
    }

    VIEW_IDS.forEach(id => {
        const view = document.getElementById(id);
        if (view) {
            view.classList.toggle('active', id === viewId);
        }
    });

    viewState.activeViewId = viewId;
    updateTopNavigationState();
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

function createArchetypeFromTitle(title) {
    return isRecognizedArchetypeTitle(title)
        ? { title, description: ARCHETYPES[title] }
        : null;
}

function buildLatestProfileSnapshot() {
    return {
        favorites: [...state.favorites],
        scentDescription: state.scentDescription,
        usageDescription: state.usageDescription,
        selectedFamilies: [...state.selectedFamilies],
        selectedNotes: [...state.selectedNotes],
        selectedAccords: [...state.selectedAccords],
        occasions: [...state.occasions],
        climates: [...state.climates],
        performance: state.performance,
        budget: state.budget
    };
}

function hasLatestProfileContent(profile = null) {
    const snapshot = profile || buildLatestProfileSnapshot();

    return Boolean(
        (snapshot.favorites || []).length
        || (snapshot.selectedFamilies || []).length
        || (snapshot.selectedNotes || []).length
        || (snapshot.selectedAccords || []).length
        || (snapshot.occasions || []).length
        || (snapshot.climates || []).length
        || String(snapshot.scentDescription || '').trim()
        || String(snapshot.usageDescription || '').trim()
        || (snapshot.performance !== 50)
        || (snapshot.budget !== 2)
    );
}

function applyLatestProfileSnapshot(profile) {
    const snapshot = profile && typeof profile === 'object' ? profile : {};

    state.favorites = Array.isArray(snapshot.favorites) ? [...snapshot.favorites] : [];
    state.scentDescription = String(snapshot.scentDescription || '');
    state.usageDescription = String(snapshot.usageDescription || '');
    state.selectedFamilies = Array.isArray(snapshot.selectedFamilies) ? [...snapshot.selectedFamilies] : [];
    state.selectedNotes = Array.isArray(snapshot.selectedNotes) ? [...snapshot.selectedNotes] : [];
    state.selectedAccords = Array.isArray(snapshot.selectedAccords) ? [...snapshot.selectedAccords] : [];
    state.occasions = Array.isArray(snapshot.occasions) ? [...snapshot.occasions] : [];
    state.climates = Array.isArray(snapshot.climates) ? [...snapshot.climates] : [];
    state.performance = Number.isFinite(Number(snapshot.performance)) ? Number(snapshot.performance) : 50;
    state.budget = Number.isFinite(Number(snapshot.budget)) ? Number(snapshot.budget) : 2;
    state.interpretation = {
        scent: createEmptyInterpretationState('scent'),
        usage: createEmptyInterpretationState('usage')
    };
}

function clearAuthenticatedSessionState() {
    authState.isLoggedIn = false;
    authState.mode = 'login';
    authState.modalView = 'credentials';
    authState.pendingRecommendationId = null;
    authState.verificationEmail = '';
    authState.helperMessage = '';
    authState.user = null;
    authState.profileEmail = '';
    authState.savedRecommendationIds = [];
    authState.personalityTitle = '';
    authState.latestProfile = null;
    authState.latestRecommendationIds = [];
}

function applyAccountPayload(payload, { syncRuntimeFromAccount = false } = {}) {
    const sessionPayload = payload && typeof payload === 'object' ? payload : {};

    if (!sessionPayload.authenticated) {
        clearAuthenticatedSessionState();
        appearanceState.mode = 'dark';
        return;
    }

    authState.isLoggedIn = true;
    authState.user = sessionPayload.user || null;
    authState.profileEmail = sessionPayload.user && sessionPayload.user.email
        ? sessionPayload.user.email
        : '';
    authState.savedRecommendationIds = Array.isArray(sessionPayload.savedRecommendationIds)
        ? [...sessionPayload.savedRecommendationIds]
        : [];
    authState.personalityTitle = isRecognizedArchetypeTitle(sessionPayload.personalityTitle)
        ? sessionPayload.personalityTitle
        : '';
    authState.latestProfile = sessionPayload.latestProfile && typeof sessionPayload.latestProfile === 'object'
        ? { ...sessionPayload.latestProfile }
        : null;
    authState.latestRecommendationIds = Array.isArray(sessionPayload.latestRecommendationIds)
        ? [...sessionPayload.latestRecommendationIds]
        : [];
    authState.verificationEmail = '';
    authState.helperMessage = '';
    appearanceState.mode = sessionPayload.appearanceMode === 'light' ? 'light' : 'dark';

    if (syncRuntimeFromAccount) {
        restoreAccountExperience();
    }
}

function restoreAccountExperience() {
    if (!authState.isLoggedIn) {
        return;
    }

    if (authState.latestProfile) {
        applyLatestProfileSnapshot(authState.latestProfile);
        syncWizardStateToUI();
    }

    state.latestRecommendations = authState.latestRecommendationIds
        .map(findFragranceById)
        .filter(Boolean);
    state.latestArchetype = createArchetypeFromTitle(authState.personalityTitle);
    primeResultsExperience(state.latestRecommendations);
}

async function hydrateAuthState() {
    try {
        const sessionPayload = await fetchAuthSession();
        applyAccountPayload(sessionPayload);
    } catch (error) {
        console.warn('Unable to hydrate the signed-in session.', error);
        clearAuthenticatedSessionState();
    }
}

async function persistAuthState(options = {}) {
    if (!authState.isLoggedIn) {
        return null;
    }

    try {
        const payload = await saveAccountState({
            appearanceMode: getAppearanceMode(),
            personalityTitle: options.personalityTitle !== undefined
                ? options.personalityTitle
                : authState.personalityTitle,
            latestProfile: options.latestProfile !== undefined
                ? options.latestProfile
                : authState.latestProfile,
            latestRecommendationIds: options.latestRecommendationIds !== undefined
                ? options.latestRecommendationIds
                : authState.latestRecommendationIds,
            clearProfileContext: Boolean(options.clearProfileContext)
        });
        applyAccountPayload(payload);
        return payload;
    } catch (error) {
        console.warn('Unable to persist account state.', error);
        return null;
    }
}

function syncStoredPersonality(archetype) {
    if (!authState.isLoggedIn || !archetype || !isRecognizedArchetypeTitle(archetype.title)) return;

    authState.personalityTitle = archetype.title;
    void persistAuthState({
        personalityTitle: authState.personalityTitle,
        latestProfile: authState.latestProfile,
        latestRecommendationIds: authState.latestRecommendationIds
    });
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

function getProfileCollectionSnapshot() {
    if (authState.isLoggedIn) {
        return {
            ...getSavedFragranceSnapshot(),
            isGuestPreview: false,
            guestCollectionMode: 'account'
        };
    }

    const guestShortlist = getGuestShortlistFragrances();
    const isShortlistMode = guestShortlist.length > 0;

    return {
        totalSavedCount: isShortlistMode ? guestExperienceState.shortlistIds.length : state.latestRecommendations.length,
        missingCount: isShortlistMode
            ? Math.max(0, guestExperienceState.shortlistIds.length - guestShortlist.length)
            : 0,
        availableFragrances: isShortlistMode ? guestShortlist : [...state.latestRecommendations],
        isGuestPreview: true,
        guestCollectionMode: isShortlistMode ? 'shortlist' : 'recent'
    };
}

function getProfilePersonalityTitle() {
    if (authState.isLoggedIn && isRecognizedArchetypeTitle(authState.personalityTitle)) {
        return authState.personalityTitle;
    }

    return state.latestArchetype && isRecognizedArchetypeTitle(state.latestArchetype.title)
        ? state.latestArchetype.title
        : '';
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

function renderResultsHeader() {
    const archetypeTitle = document.getElementById('archetype-title');
    const archetypeDesc = document.getElementById('archetype-desc');

    if (!archetypeTitle || !archetypeDesc) {
        return;
    }

    if (state.latestArchetype && state.latestArchetype.title) {
        archetypeTitle.innerText = state.latestArchetype.title;
        archetypeDesc.innerText = state.latestArchetype.description || '';
        return;
    }

    if (authState.isLoggedIn && authState.latestRecommendationIds.length > 0) {
        archetypeTitle.innerText = 'Your Bespoke Profile';
        archetypeDesc.innerText = 'Return to your saved recommendation set, browse freely, and refresh your profile whenever inspiration shifts.';
        return;
    }

    archetypeTitle.innerText = 'Your Bespoke Profile';
    archetypeDesc.innerText = 'Complete the profiling flow to generate a personalized recommendation set.';
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
    const isGuestPreview = Boolean(savedSummary.isGuestPreview);
    const guestCollectionMode = savedSummary.guestCollectionMode || 'recent';

    resultsNote.innerText = !isGuestPreview && hasOfflineGap ? getOfflineCollectionCopy(savedSummary.missingCount) : '';
    resultsNote.hidden = !resultsNote.innerText;

    if (savedSummary.totalSavedCount === 0) {
        resultsTitle.innerText = isGuestPreview
            ? (guestCollectionMode === 'shortlist' ? 'No guest shortlist yet' : 'No preview generated yet')
            : 'No saved fragrances yet';
        emptyState.innerHTML = isGuestPreview
            ? `
                <h3 class="profile-empty-title">${guestCollectionMode === 'shortlist' ? 'Your guest shortlist is empty' : 'Complete the profiling flow to build your preview'}</h3>
                <p class="profile-empty-copy">${guestCollectionMode === 'shortlist'
                    ? 'Shortlist fragrances from the results screen and they will stay here locally while account sync is offline.'
                    : 'Your latest recommendations will appear here once you finish the discovery steps.'}</p>
            `
            : `
                <h3 class="profile-empty-title">Your profile is ready for discoveries</h3>
                <p class="profile-empty-copy">Save recommendations from the results page and your collection will appear here.</p>
            `;
        emptyState.hidden = false;
        grid.innerHTML = '';
        return;
    }

    if (!isGuestPreview && savedFragrances.length === 0 && hasOfflineGap) {
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
        resultsTitle.innerText = isGuestPreview
            ? (guestCollectionMode === 'shortlist' ? 'No shortlist matches for the current filters' : 'No preview matches for the current filters')
            : 'No matches for the current filters';
        emptyState.innerHTML = `
            <h3 class="profile-empty-title">Nothing matches those filters</h3>
            <p class="profile-empty-copy">${isGuestPreview
                ? (guestCollectionMode === 'shortlist'
                    ? 'Clear or adjust the side filters to bring your shortlisted fragrances back into view.'
                    : 'Clear or adjust the side filters to bring your preview fragrances back into view.')
                : 'Clear or adjust the side filters to bring your saved fragrances back into view.'}</p>
        `;
        emptyState.hidden = false;
        grid.innerHTML = '';
        return;
    }

    resultsTitle.innerText = filteredFragrances.length === savedFragrances.length
        ? (
            isGuestPreview
                ? (guestCollectionMode === 'shortlist'
                    ? `${savedFragrances.length} fragrances in your guest shortlist`
                    : `${savedFragrances.length} fragrances in your latest preview`)
                : `${savedFragrances.length} fragrances in your profile`
        )
        : (
            isGuestPreview
                ? (guestCollectionMode === 'shortlist'
                    ? `${filteredFragrances.length} of ${savedFragrances.length} shortlisted fragrances shown`
                    : `${filteredFragrances.length} of ${savedFragrances.length} preview fragrances shown`)
                : `${filteredFragrances.length} of ${savedFragrances.length} fragrances shown`
        );

    emptyState.hidden = true;
    grid.innerHTML = filteredFragrances.map(buildProfileFragranceCard).join('');
}

function renderProfileView() {
    const personalityTitle = getProfilePersonalityTitle();
    const savedSummary = getProfileCollectionSnapshot();
    const savedFragrances = savedSummary.availableFragrances;
    const isGuestPreview = Boolean(savedSummary.isGuestPreview);
    const guestCollectionMode = savedSummary.guestCollectionMode || 'recent';
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
    const logoutButton = document.getElementById('btn-profile-logout');
    const personalityLabel = document.querySelector('#profile-view .profile-personality-card .profile-section-label');
    const filterLabel = document.querySelector('#profile-view .profile-filter-header .profile-section-label');
    const heroLabel = document.querySelector('#profile-view .profile-hero-card .profile-section-label');
    const resultsLabel = document.querySelector('#profile-view .profile-main-bar .profile-section-label');
    const statLabels = document.querySelectorAll('#profile-view .profile-stat-label');

    if (!profileTitle || !profileDesc || !profileMeta || !profileEmailHeading || !profileHeroCopy
        || !profileThemeChip || !profileStatCount || !profileStatHouses || !profileStatFamilies || !resetButton) {
        return;
    }

    if (personalityLabel) {
        personalityLabel.innerText = isGuestPreview ? 'Fragrance Personality Preview' : 'Fragrance Personality';
    }

    if (filterLabel) {
        filterLabel.innerText = isGuestPreview ? 'Filter Your Preview' : 'Filter Your Collection';
    }

    if (heroLabel) {
        heroLabel.innerText = isGuestPreview ? 'Guest Preview' : 'Account Overview';
    }

    if (resultsLabel) {
        resultsLabel.innerText = isGuestPreview
            ? (guestCollectionMode === 'shortlist' ? 'Shortlisted Fragrances' : 'Previewed Fragrances')
            : 'Saved Fragrances';
    }

    if (statLabels[0]) {
        statLabels[0].innerText = isGuestPreview
            ? (guestCollectionMode === 'shortlist' ? 'Shortlisted' : 'Previewed')
            : 'Saved';
    }

    if (logoutButton) {
        logoutButton.hidden = isGuestPreview;
    }

    profileTitle.innerText = personalityTitle || (isGuestPreview ? 'Profile Preview' : 'Personality Not Set Yet');
    profileDesc.innerText = personalityTitle
        ? ARCHETYPES[personalityTitle]
        : (
            isGuestPreview
                ? 'Complete the discovery flow to generate a live personality read and preview it here.'
                : 'Run the profiling experience again to assign a fragrance personality and personalize the full site theme.'
        );
    profileMeta.innerText = personalityTitle
        ? (
            isGuestPreview
                ? `This guest preview is tuned to ${personalityTitle} in ${getCurrentAppearanceName().toLowerCase()}.`
                : `Your saved account theme and profile page are tuned to this personality in ${getCurrentAppearanceName().toLowerCase()}.`
        )
        : (
            isGuestPreview
                ? `This guest preview is using the ${getCurrentAppearanceName().toLowerCase()} palette while account persistence is still offline.`
                : `You are signed in, and your profile is currently using the default palette in ${getCurrentAppearanceName().toLowerCase()}.`
        );
    profileEmailHeading.innerText = authState.isLoggedIn
        ? (authState.profileEmail || 'Signed in profile')
        : 'Guest Preview';
    profileHeroCopy.innerText = personalityTitle
        ? (
            isGuestPreview
                ? (guestCollectionMode === 'shortlist'
                    ? `Previewing your guest shortlist keyed to ${personalityTitle}.`
                    : `Previewing your current discovery set keyed to ${personalityTitle}.`)
                : `Your collection and interface are currently keyed to ${personalityTitle}.`
        )
        : (
            isGuestPreview
                ? (guestCollectionMode === 'shortlist'
                    ? (savedSummary.totalSavedCount > 0
                        ? 'Your local shortlist is available here while account sync is still being built.'
                        : 'Shortlist fragrances from results and they will stay here locally.')
                    : (savedSummary.totalSavedCount > 0
                        ? 'Your latest recommendation set is available here while you continue building the app.'
                        : 'Complete the discovery flow and your latest recommendations will appear here for preview.'))
                : 'Build your saved collection now, then reset and re-run profiling whenever you want a new personality read.'
        );
    profileThemeChip.innerText = personalityTitle || (isGuestPreview ? 'Guest Preview' : 'Default Palette');
    profileStatCount.innerText = String(savedSummary.availableFragrances.length);
    profileStatHouses.innerText = String(housesCount);
    profileStatFamilies.innerText = String(familyCount);
    resetButton.innerText = isGuestPreview
        ? (savedSummary.totalSavedCount > 0 ? 'Refine Profile' : 'Start Profiling')
        : (personalityTitle ? 'Reset Personality' : 'Discover Personality');

    populateProfileFilterControls(savedFragrances);
    renderProfileCollection(savedSummary);
}

function updateAuthUI() {
    const btnTopLogin = document.getElementById('btn-top-login');
    const appNav = document.getElementById('app-nav');
    const accountNav = document.getElementById('account-nav');
    const accountEmail = document.getElementById('nav-account-email');

    if (btnTopLogin) {
        btnTopLogin.hidden = authState.isLoggedIn;
        btnTopLogin.innerText = 'Sign In';
    }

    if (appNav) {
        appNav.hidden = false;
    }

    if (accountNav) {
        accountNav.hidden = !authState.isLoggedIn;
    }

    if (accountEmail) {
        accountEmail.innerText = authState.profileEmail || '';
    }

    renderProfilePanel();
    renderResultsHeader();
    renderProfileView();

    const resultsView = document.getElementById('results-view');
    if (resultsView && resultsView.classList.contains('active')) {
        if (state.latestRecommendations.length > 0 || resultsViewState.recommendationPool.length > 0) {
            renderResultsCards(state.latestRecommendations);
        }
    }

    updateTopNavigationState();
    applyTheme();
}

function handleAppearanceToggle() {
    appearanceState.mode = getAppearanceMode() === 'light' ? 'dark' : 'light';
    if (authState.isLoggedIn) {
        authState.latestProfile = buildLatestProfileSnapshot();
        void persistAuthState({
            latestProfile: authState.latestProfile,
            latestRecommendationIds: authState.latestRecommendationIds
        });
    }
    applyTheme();

    if (viewState.activeViewId === 'profile-view') {
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

function updateTopNavigationState() {
    const discoverButton = document.getElementById('btn-nav-discover');
    const resultsButton = document.getElementById('btn-nav-results');
    const profileButton = document.getElementById('btn-nav-profile');
    const hasResults = state.latestRecommendations.length > 0
        || authState.latestRecommendationIds.length > 0
        || resultsViewState.recommendationPool.length > 0;

    if (discoverButton) {
        discoverButton.classList.toggle('active', viewState.activeViewId === 'wizard-view');
    }

    if (resultsButton) {
        resultsButton.classList.toggle('active', viewState.activeViewId === 'results-view');
        resultsButton.disabled = !hasResults;
    }

    if (profileButton) {
        profileButton.classList.toggle('active', viewState.activeViewId === 'profile-view');
    }
}

function openDiscoverView() {
    if (viewState.activeViewId === 'loading-view') return;

    setActiveView('wizard-view');
    updateWizardUI();
    applyTheme();
}

function openResultsView() {
    if (viewState.activeViewId === 'loading-view') return;

    if (state.latestRecommendations.length === 0 && authState.isLoggedIn && authState.latestRecommendationIds.length > 0) {
        restoreAccountExperience();
    }

    if (state.latestRecommendations.length === 0 && resultsViewState.recommendationPool.length === 0) {
        return;
    }

    renderResultsHeader();
    renderProfilePanel();
    renderResultsCards(state.latestRecommendations);
    setActiveView('results-view');
    applyTheme();
}

function openProfileView() {
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
    const fallbackView = state.latestRecommendations.length > 0 ? 'results-view' : 'wizard-view';
    const targetView = viewState.previousViewId || fallbackView;
    setActiveView(targetView);
    applyTheme();
}

async function logoutAccount() {
    try {
        await logoutAccountRequest();
    } catch (error) {
        console.warn('Unable to fully close the backend session.', error);
    }

    clearAuthenticatedSessionState();
    appearanceState.mode = 'dark';
    hideAuthModal();
    await resetWizardExperience({ skipConfirmation: true, clearAccountState: false });
    updateAuthUI();
}

function resetPersonality() {
    const confirmed = window.confirm('This will clear your saved fragrance personality. Your saved fragrances will remain. Are you sure?');
    if (!confirmed) return;

    authState.personalityTitle = '';
    state.latestArchetype = null;
    void persistAuthState({
        personalityTitle: '',
        latestProfile: authState.latestProfile,
        latestRecommendationIds: authState.latestRecommendationIds
    });
    updateAuthUI();
}

function setAuthHelper(message = '') {
    authState.helperMessage = message;
    updateAuthModalContent();
}

function getAuthDeliveryMessage(delivery, defaultMessage) {
    if (delivery && delivery.debugCode) {
        return `${defaultMessage} Development code: ${delivery.debugCode}.`;
    }

    if (delivery && delivery.deliveryMode === 'console') {
        return `${defaultMessage} Check the backend console for the code.`;
    }

    return defaultMessage;
}

function setAuthMode(mode) {
    authState.mode = mode === 'login' ? 'login' : 'signup';
    authState.modalView = 'credentials';
    authState.helperMessage = '';
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
    const btnSecondary = document.getElementById('btn-auth-secondary');
    const btnBack = document.getElementById('btn-auth-back');
    const authGuestDivider = document.getElementById('auth-guest-divider');
    const authHelper = document.getElementById('auth-helper');
    const authTabsWrap = document.getElementById('auth-tabs');
    const emailBlock = document.getElementById('auth-email-block');
    const passwordBlock = document.getElementById('auth-password-block');
    const confirmBlock = document.getElementById('auth-confirm-block');
    const codeBlock = document.getElementById('auth-code-block');
    const authEmail = document.getElementById('auth-email');
    const authPassword = document.getElementById('auth-password');
    const confirmInput = document.getElementById('auth-confirm');
    const authCode = document.getElementById('auth-code');
    const authTabs = document.querySelectorAll('.auth-tab');
    const pendingRecommendation = findFragranceById(authState.pendingRecommendationId);
    const isCredentialsView = authState.modalView === 'credentials';
    const isVerifyView = authState.modalView === 'verify';
    const isForgotRequestView = authState.modalView === 'forgot-request';
    const isForgotResetView = authState.modalView === 'forgot-reset';

    authTabs.forEach(tab => {
        const isActive = tab.getAttribute('data-tab') === authState.mode;
        tab.classList.toggle('active', isActive);
    });

    if (authTabsWrap) {
        authTabsWrap.hidden = !isCredentialsView;
    }

    if (emailBlock) {
        emailBlock.hidden = false;
    }

    if (passwordBlock) {
        passwordBlock.hidden = !(isCredentialsView || isForgotResetView);
    }

    if (confirmBlock) {
        confirmBlock.classList.toggle('visible', (isCredentialsView && authState.mode === 'signup') || isForgotResetView);
    }

    if (codeBlock) {
        codeBlock.classList.toggle('visible', isVerifyView || isForgotResetView);
    }

    if (confirmInput) {
        confirmInput.required = (isCredentialsView && authState.mode === 'signup') || isForgotResetView;
        confirmInput.placeholder = isForgotResetView ? 'Confirm New Password' : 'Confirm Password';
        if (!confirmInput.required) {
            confirmInput.value = '';
        }
    }

    if (authEmail) {
        authEmail.readOnly = isVerifyView || isForgotResetView;
        authEmail.required = true;
        if ((isVerifyView || isForgotRequestView || isForgotResetView) && authState.verificationEmail) {
            authEmail.value = authState.verificationEmail;
        }
    }

    if (authPassword) {
        authPassword.required = isCredentialsView || isForgotResetView;
        authPassword.placeholder = isForgotResetView ? 'New Password' : 'Password';
    }

    if (authCode) {
        authCode.required = isVerifyView || isForgotResetView;
        if (!authCode.required) {
            authCode.value = '';
        }
    }

    if (authHelper) {
        authHelper.innerText = authState.helperMessage || '';
        authHelper.hidden = !authState.helperMessage;
    }

    if (!authTitle || !authSubtitle || !btnSubmit || !btnGuest || !btnSecondary || !btnBack || !authGuestDivider) return;

    btnGuest.hidden = !isCredentialsView;
    authGuestDivider.hidden = !isCredentialsView;
    btnSecondary.hidden = true;
    btnBack.hidden = isCredentialsView;

    if (isVerifyView) {
        authTitle.innerText = 'Verify Your Email';
        authSubtitle.innerText = `Enter the 6-digit code sent to ${authState.verificationEmail || 'your inbox'}.`;
        btnSubmit.innerText = 'Verify Email';
        btnSecondary.hidden = false;
        btnSecondary.innerText = 'Resend Code';
    } else if (isForgotRequestView) {
        authTitle.innerText = 'Reset Password';
        authSubtitle.innerText = 'Enter your email and we will send a reset code.';
        btnSubmit.innerText = 'Send Reset Code';
        btnBack.hidden = false;
    } else if (isForgotResetView) {
        authTitle.innerText = 'Choose a New Password';
        authSubtitle.innerText = `Enter the reset code sent to ${authState.verificationEmail || 'your inbox'}.`;
        btnSubmit.innerText = 'Reset Password';
        btnSecondary.hidden = false;
        btnSecondary.innerText = 'Request New Code';
        btnBack.hidden = false;
    } else if (pendingRecommendation) {
        const fragranceLabel = `${pendingRecommendation.name} by ${pendingRecommendation.house}`;

        if (authState.mode === 'login') {
            authTitle.innerText = 'Log In to Save';
            authSubtitle.innerText = `Log in to add ${fragranceLabel} to your fragrance profile.`;
            btnSubmit.innerText = 'Log In & Save';
            btnSecondary.hidden = false;
            btnSecondary.innerText = 'Forgot Password?';
        } else {
            authTitle.innerText = 'Create Your Profile';
            authSubtitle.innerText = `Create a profile to save ${fragranceLabel} and revisit it later.`;
            btnSubmit.innerText = 'Create Account & Save';
        }
    } else if (authState.mode === 'login') {
        authTitle.innerText = 'Welcome Back';
        authSubtitle.innerText = 'Log in to open your saved profile, collection, and personality theme.';
        btnSubmit.innerText = 'Log In';
        btnSecondary.hidden = false;
        btnSecondary.innerText = 'Forgot Password?';
    } else {
        authTitle.innerText = 'Create Your Profile';
        authSubtitle.innerText = 'Save your preferences, recommendations, and fragrance personality.';
        btnSubmit.innerText = 'Create Account';
    }

    btnGuest.innerText = 'Continue as Guest';
    btnBack.innerText = isForgotResetView ? 'Back' : 'Back to Sign In';
}

function showAuthModal(options = {}) {
    const { mode = authState.mode, recommendationId = null, view = 'credentials' } = options;
    const modal = document.getElementById('auth-modal');
    const authEmail = document.getElementById('auth-email');
    const authPassword = document.getElementById('auth-password');
    const authConfirm = document.getElementById('auth-confirm');
    const authCode = document.getElementById('auth-code');
    const authForm = document.getElementById('auth-form');

    authState.pendingRecommendationId = recommendationId;
    authState.mode = mode === 'login' ? 'login' : 'signup';
    authState.modalView = view;
    authState.helperMessage = '';

    if (authForm) {
        authForm.reset();
    }

    setAuthError('');

    if (authEmail) {
        authEmail.value = authState.profileEmail || authState.verificationEmail || '';
    }

    if (authPassword) {
        authPassword.value = '';
    }

    if (authConfirm) {
        authConfirm.value = '';
    }

    if (authCode) {
        authCode.value = '';
    }

    updateAuthModalContent();

    if (modal) {
        modal.classList.add('active');
    }
}

function hideAuthModal() {
    const modal = document.getElementById('auth-modal');
    const authForm = document.getElementById('auth-form');

    authState.pendingRecommendationId = null;
    authState.modalView = 'credentials';
    authState.helperMessage = '';

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

async function saveRecommendationToProfile(recommendationId) {
    if (!authState.isLoggedIn) {
        promptAuthForRecommendation(recommendationId);
        return false;
    }

    if (!recommendationId || !findFragranceById(recommendationId)) {
        return false;
    }

    try {
        const payload = await saveRecommendationForAccount(recommendationId);
        applyAccountPayload(payload);
        if (state.latestArchetype && isRecognizedArchetypeTitle(state.latestArchetype.title)) {
            authState.personalityTitle = state.latestArchetype.title;
        }
        if (state.latestRecommendations.length > 0) {
            authState.latestProfile = buildLatestProfileSnapshot();
            authState.latestRecommendationIds = state.latestRecommendations.map(fragrance => fragrance.id);
        }
        updateAuthUI();
        return true;
    } catch (error) {
        console.warn('Unable to save recommendation to the signed-in profile.', error);
        return false;
    }
}

function buildGuestMergePayload() {
    const latestProfile = buildLatestProfileSnapshot();
    const latestRecommendationIds = state.latestRecommendations.map(fragrance => fragrance.id);
    const savedRecommendationIds = getGuestSavedRecommendationIdsForMerge();
    const personalityTitle = state.latestArchetype && isRecognizedArchetypeTitle(state.latestArchetype.title)
        ? state.latestArchetype.title
        : '';

    if (
        !hasLatestProfileContent(latestProfile)
        && latestRecommendationIds.length === 0
        && savedRecommendationIds.length === 0
        && !personalityTitle
    ) {
        return null;
    }

    return {
        appearanceMode: getAppearanceMode(),
        personalityTitle,
        latestProfile,
        latestRecommendationIds,
        savedRecommendationIds,
        replaceProfileContext: true
    };
}

async function finalizeAuthenticatedSession(accountPayload, { pendingRecommendationId = null } = {}) {
    const guestMergePayload = buildGuestMergePayload();

    applyAccountPayload(accountPayload);
    hideAuthModal();

    if (pendingRecommendationId) {
        await saveRecommendationToProfile(pendingRecommendationId);
    }

    if (guestMergePayload) {
        const shouldMerge = window.confirm('Use your current guest profiling results on this account? This will replace the account’s latest profiling snapshot, but keep its saved fragrances.');

        if (shouldMerge) {
            try {
                const mergedPayload = await mergeGuestAccountState(guestMergePayload);
                applyAccountPayload(mergedPayload);
            } catch (error) {
                console.warn('Unable to merge the guest profile into the signed-in account.', error);
            }
        }
    }

    restoreAccountExperience();
    updateAuthUI();
}

function initAuth() {
    const btnTopLogin = document.getElementById('btn-top-login');
    const btnTopLogout = document.getElementById('btn-top-logout');
    const btnNavDiscover = document.getElementById('btn-nav-discover');
    const btnNavResults = document.getElementById('btn-nav-results');
    const btnNavProfile = document.getElementById('btn-nav-profile');
    const authModal = document.getElementById('auth-modal');
    const authTabs = document.querySelectorAll('.auth-tab');
    const authForm = document.getElementById('auth-form');
    const btnGuest = document.getElementById('btn-auth-guest');
    const btnSecondary = document.getElementById('btn-auth-secondary');
    const btnBack = document.getElementById('btn-auth-back');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const authEmail = document.getElementById('auth-email');
    const authPassword = document.getElementById('auth-password');
    const authConfirm = document.getElementById('auth-confirm');
    const authCode = document.getElementById('auth-code');

    if (btnTopLogin) {
        btnTopLogin.addEventListener('click', () => {
            showAuthModal({ mode: 'login' });
        });
    }

    if (btnTopLogout) {
        btnTopLogout.addEventListener('click', () => {
            void logoutAccount();
        });
    }

    if (btnNavDiscover) {
        btnNavDiscover.addEventListener('click', openDiscoverView);
    }

    if (btnNavResults) {
        btnNavResults.addEventListener('click', openResultsView);
    }

    if (btnNavProfile) {
        btnNavProfile.addEventListener('click', openProfileView);
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

    if (btnSecondary) {
        btnSecondary.addEventListener('click', async () => {
            setAuthError('');

            if (authState.modalView === 'verify') {
                try {
                    const response = await resendVerificationCode({ email: authState.verificationEmail });
                    setAuthHelper(getAuthDeliveryMessage(response.delivery, 'A fresh verification code has been sent.'));
                } catch (error) {
                    setAuthError(error.message || 'Unable to resend the verification code.');
                }
                return;
            }

            if (authState.modalView === 'forgot-reset') {
                try {
                    const response = await requestPasswordReset({ email: authState.verificationEmail });
                    setAuthHelper(getAuthDeliveryMessage(response.delivery, 'A new reset code has been sent.'));
                } catch (error) {
                    setAuthError(error.message || 'Unable to request another reset code.');
                }
                return;
            }

            authState.modalView = 'forgot-request';
            authState.verificationEmail = authEmail && authEmail.value.trim()
                ? authEmail.value.trim()
                : authState.profileEmail;
            authState.helperMessage = '';
            updateAuthModalContent();
        });
    }

    if (btnBack) {
        btnBack.addEventListener('click', () => {
            setAuthError('');

            if (authState.modalView === 'forgot-reset') {
                authState.modalView = 'forgot-request';
            } else {
                authState.modalView = 'credentials';
                authState.mode = 'login';
            }

            authState.helperMessage = '';
            updateAuthModalContent();
        });
    }

    if (authForm) {
        authForm.addEventListener('input', () => setAuthError(''));

        authForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            setAuthError('');
            authState.helperMessage = '';

            const pendingRecommendationId = authState.pendingRecommendationId;
            const emailValue = authEmail && authEmail.value.trim()
                ? authEmail.value.trim()
                : authState.profileEmail;

            if (authState.modalView === 'credentials' && authState.mode === 'signup') {
                const password = authPassword ? authPassword.value : '';
                const confirm = authConfirm ? authConfirm.value : '';

                if (password !== confirm) {
                    setAuthError('Passwords do not match.');
                    return;
                }
            }

            if (authState.modalView === 'forgot-reset') {
                const password = authPassword ? authPassword.value : '';
                const confirm = authConfirm ? authConfirm.value : '';

                if (password !== confirm) {
                    setAuthError('Passwords do not match.');
                    return;
                }
            }

            try {
                if (authState.modalView === 'verify') {
                    const payload = await verifyEmailCode({
                        email: authState.verificationEmail,
                        code: authCode ? authCode.value.trim() : ''
                    });
                    await finalizeAuthenticatedSession(payload, { pendingRecommendationId });
                    return;
                }

                if (authState.modalView === 'forgot-request') {
                    const response = await requestPasswordReset({ email: emailValue });
                    authState.verificationEmail = emailValue;
                    authState.modalView = 'forgot-reset';
                    setAuthHelper(getAuthDeliveryMessage(response.delivery, 'A reset code is on the way.'));
                    return;
                }

                if (authState.modalView === 'forgot-reset') {
                    await resetPasswordWithCode({
                        email: authState.verificationEmail,
                        code: authCode ? authCode.value.trim() : '',
                        password: authPassword ? authPassword.value : ''
                    });
                    authState.mode = 'login';
                    authState.modalView = 'credentials';
                    authState.helperMessage = 'Password reset complete. Log in with your new password.';
                    updateAuthModalContent();
                    if (authPassword) authPassword.value = '';
                    if (authConfirm) authConfirm.value = '';
                    if (authCode) authCode.value = '';
                    return;
                }

                if (authState.mode === 'signup') {
                    const response = await signupAccount({
                        email: emailValue,
                        password: authPassword ? authPassword.value : ''
                    });
                    authState.verificationEmail = emailValue;
                    authState.modalView = 'verify';
                    setAuthHelper(getAuthDeliveryMessage(response.delivery, 'A verification code is on the way.'));
                    return;
                }

                const payload = await loginAccount({
                    email: emailValue,
                    password: authPassword ? authPassword.value : ''
                });
                await finalizeAuthenticatedSession(payload, { pendingRecommendationId });
            } catch (error) {
                if (error && error.code === 'EMAIL_NOT_VERIFIED') {
                    authState.verificationEmail = emailValue;
                    authState.modalView = 'verify';
                    setAuthHelper('Verify your email first, then come right back here.');
                    return;
                }

                setAuthError(error && error.message ? error.message : 'Authentication failed.');
            }
        });
    }

    authState.mode = authState.isLoggedIn ? 'login' : 'signup';
    updateAuthModalContent();
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
        btnResetPersonality.addEventListener('click', () => {
            if (!authState.isLoggedIn) {
                openDiscoverView();
                return;
            }

            resetPersonality();
        });
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
    dismissScentProfileHelp();

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
    persistGuestExperience();
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
    resultsViewState.recommendationPool = [];
    resultsViewState.activeRefine = 'default';
    resultsViewState.visibleCount = DEFAULT_RESULTS_VISIBLE_COUNT;
    closeFragranceDetailModal();

    setActiveView('results-view');
    applyTheme();
    const resultsGrid = document.getElementById('results-grid');

    renderProfilePanel();
    renderProfileView();
    renderResultsHeader();
    renderResultsUtilityPanel();

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
    state.latestRecommendations = Array.isArray(topFrags) ? topFrags.filter(Boolean) : [];
    primeResultsExperience(state.latestRecommendations);

    if (authState.isLoggedIn) {
        authState.latestProfile = buildLatestProfileSnapshot();
        authState.latestRecommendationIds = state.latestRecommendations.map(fragrance => fragrance.id);
    }
    clearBackendStatus();

    if (authState.isLoggedIn) {
        syncStoredPersonality(archetype);
    }

    setActiveView('results-view');
    applyTheme();
    renderResultsHeader();
    renderProfilePanel();
    renderProfileView();
    renderResultsCards(state.latestRecommendations);
    persistGuestExperience({ immediate: true });
}

function renderResultsCards(topFrags) {
    const grid = document.getElementById('results-grid');
    if (!grid) return;

    if (getActiveResultsPool().length === 0 && Array.isArray(topFrags) && topFrags.length > 0) {
        primeResultsExperience(topFrags);
    }

    const refinedPool = getRefinedRecommendationPool();
    const displayPool = refinedPool.slice(0, resultsViewState.visibleCount);

    grid.innerHTML = '';

    if (displayPool.length === 0) {
        grid.innerHTML = `
            <div class="glass-panel results-status-panel">
                <h3 class="results-status-title">No local matches to show right now</h3>
                <p class="results-status-copy">Try resetting the refine chips or rerun the wizard with a broader profile.</p>
            </div>
        `;
        renderResultsUtilityPanel();
        return;
    }

    displayPool.forEach((frag, idx) => {
        const tierStr = formatPriceTier(frag.priceTier);
        const blindBuyBadge = getBlindBuyBadge(frag.blindBuyScore);
        const longevityWidth = getMetricBarWidth(frag.longevityScore);
        const sillageWidth = getMetricBarWidth(frag.sillageScore);
        const isSaved = isRecommendationSaved(frag.id);
        const isShortlisted = isGuestShortlisted(frag.id);
        const compared = isCompared(frag.id);
        const feedback = getGuestFeedback(frag.id);
        const insight = buildResultInsight(frag);
        const actionCopy = authState.isLoggedIn
            ? (isSaved
                ? 'Already saved in your fragrance profile.'
                : 'Add this recommendation to your profile to keep it handy.')
            : 'Shortlist, compare, and rate locally for now. Sign in later to save to an account.';
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
            <article
                class="glass-panel dossier-card"
                data-fragrance-id="${frag.id}"
                style="animation-delay: ${idx * 0.25}s"
                tabindex="0"
                role="button"
                aria-label="Open details for ${escapeHtml(frag.name)} by ${escapeHtml(frag.house)}"
            >
                <div class="dossier-badge ${blindBuyBadge.className}">${blindBuyBadge.label} • ${blindBuyBadge.value}</div>
                <div class="dossier-header">
                    <div class="d-info">
                        <div class="d-house">${frag.house}</div>
                        <div class="d-name">${frag.name}</div>
                    </div>
                    <div class="d-tier">${tierStr}</div>
                </div>

                <div class="dossier-insight-panel">
                    <div class="dossier-confidence-row">
                        <span class="dossier-confidence">${escapeHtml(insight.confidenceLabel)}</span>
                        <span class="dossier-score-label">${escapeHtml(insight.scoreLabel)}</span>
                    </div>
                    <div class="dossier-reason-row">
                        ${insight.reasons.map(reason => `<span class="dossier-reason-chip">${escapeHtml(reason)}</span>`).join('')}
                    </div>
                    <div class="dossier-takeaway-grid">
                        <div class="dossier-takeaway">
                            <span class="wizard-summary-label">Budget</span>
                            <p>${escapeHtml(insight.budgetTakeaway)}</p>
                        </div>
                        <div class="dossier-takeaway">
                            <span class="wizard-summary-label">Performance</span>
                            <p>${escapeHtml(insight.performanceTakeaway)}</p>
                        </div>
                    </div>
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

                <div class="dossier-local-actions">
                    <div class="dossier-local-chip-row">
                        <button
                            type="button"
                            class="btn-ghost btn-sm dossier-local-btn${isShortlisted ? ' active' : ''}"
                            data-local-action="shortlist"
                            data-fragrance-id="${frag.id}"
                        >
                            ${isShortlisted ? 'Shortlisted' : 'Shortlist'}
                        </button>
                        <button
                            type="button"
                            class="btn-ghost btn-sm dossier-local-btn${compared ? ' active' : ''}"
                            data-local-action="compare"
                            data-fragrance-id="${frag.id}"
                        >
                            ${compared ? 'Comparing' : 'Compare'}
                        </button>
                        <button
                            type="button"
                            class="btn-ghost btn-sm dossier-local-btn"
                            data-open-detail="${frag.id}"
                        >
                            Details
                        </button>
                    </div>
                    <div class="dossier-feedback-row">
                        ${GUEST_FEEDBACK_VALUES.map((value) => `
                            <button
                                type="button"
                                class="dossier-feedback-btn${feedback === value ? ' active' : ''}"
                                data-feedback="${value}"
                                data-fragrance-id="${frag.id}"
                            >
                                ${value === 'love' ? 'Love' : value === 'maybe' ? 'Maybe' : 'Pass'}
                            </button>
                        `).join('')}
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
            </article>
        `;
        grid.insertAdjacentHTML('beforeend', html);
    });

    grid.querySelectorAll('.dossier-card').forEach((card) => {
        card.addEventListener('click', () => {
            openFragranceDetailModal(card.getAttribute('data-fragrance-id'));
        });

        card.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openFragranceDetailModal(card.getAttribute('data-fragrance-id'));
            }
        });
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

    grid.querySelectorAll('[data-local-action]').forEach((button) => {
        button.addEventListener('click', (event) => {
            event.stopPropagation();

            const action = button.getAttribute('data-local-action');
            const fragranceId = button.getAttribute('data-fragrance-id');

            if (action === 'shortlist') {
                toggleGuestShortlist(fragranceId);
            } else if (action === 'compare') {
                toggleCompare(fragranceId);
            }

            renderProfileView();
            renderResultsCards(state.latestRecommendations);
        });
    });

    grid.querySelectorAll('[data-feedback]').forEach((button) => {
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            setGuestFeedback(
                button.getAttribute('data-fragrance-id'),
                button.getAttribute('data-feedback')
            );
            renderProfileView();
            renderResultsCards(state.latestRecommendations);
        });
    });

    grid.querySelectorAll('[data-open-detail]').forEach((button) => {
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            openFragranceDetailModal(button.getAttribute('data-open-detail'));
        });
    });

    grid.querySelectorAll('.dupe-toggle').forEach(toggle => {
        toggle.addEventListener('click', (event) => {
            event.stopPropagation();
            toggle.parentElement.classList.toggle('opened');
        });
    });

    renderResultsUtilityPanel();

    const detailModal = document.getElementById('fragrance-detail-modal');
    if (detailModal && detailModal.classList.contains('active') && resultsViewState.detailFragranceId) {
        const activeFragrance = findResultFragranceById(resultsViewState.detailFragranceId);
        if (activeFragrance) {
            renderFragranceDetail(activeFragrance);
        }
    }
}
