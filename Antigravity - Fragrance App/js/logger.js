/**
 * Lightweight structured logger for Maison d'Aura.
 * Can be silenced in production by setting LOG_LEVEL to 'error' or 'off'.
 */
const Logger = (() => {
    const LEVELS = { debug: 0, info: 1, warn: 2, error: 3, off: 4 };
    let currentLevel = LEVELS.warn; // Default: warn and above

    function setLevel(level) {
        if (LEVELS[level] !== undefined) currentLevel = LEVELS[level];
    }

    function format(component, message, data) {
        const prefix = `[${component}]`;
        if (data !== undefined) return [prefix, message, data];
        return [prefix, message];
    }

    function debug(component, message, data) {
        if (currentLevel <= LEVELS.debug) console.debug(...format(component, message, data));
    }

    function info(component, message, data) {
        if (currentLevel <= LEVELS.info) console.info(...format(component, message, data));
    }

    function warn(component, message, data) {
        if (currentLevel <= LEVELS.warn) console.warn(...format(component, message, data));
    }

    function error(component, message, data) {
        if (currentLevel <= LEVELS.error) console.error(...format(component, message, data));
    }

    return { debug, info, warn, error, setLevel, LEVELS };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Logger };
}
