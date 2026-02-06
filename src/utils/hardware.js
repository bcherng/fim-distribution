/**
 * Parses and validates hardware information.
 * @param {string|object} info - Hardware info to parse
 * @returns {object} Parsed hardware info
 */
export function parseHardwareInfo(info) {
    if (typeof info === 'string') {
        try {
            return JSON.parse(info);
        } catch (e) {
            return {};
        }
    }
    return info || {};
}
