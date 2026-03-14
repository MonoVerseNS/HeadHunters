// ────────────────────────────────────────────────
// TON Address Validator
// ────────────────────────────────────────────────
// Validates TON wallet addresses (both raw and friendly formats).

// TON friendly address regex: starts with EQ/UQ/0:/kQ etc, base64url, 48 chars
const FRIENDLY_RE = /^[UEk0][Qq][A-Za-z0-9_-]{46}$/
// TON raw address: 0:hex (66 chars total)
const RAW_RE = /^-?[0-9]:[a-fA-F0-9]{64}$/

/**
 * Validates a TON address.
 * @param {string} address - Address to validate
 * @returns {{ valid: boolean, type: string|null, error: string|null }}
 */
export function validateTonAddress(address) {
    if (!address || typeof address !== 'string') {
        return { valid: false, type: null, error: 'Адрес не указан' }
    }

    const trimmed = address.trim()

    if (trimmed.length === 0) {
        return { valid: false, type: null, error: 'Адрес не указан' }
    }

    // Check friendly format (UQ..., EQ..., kQ...)
    if (FRIENDLY_RE.test(trimmed)) {
        return { valid: true, type: 'friendly', error: null }
    }

    // Check raw format (0:abcdef...)
    if (RAW_RE.test(trimmed)) {
        return { valid: true, type: 'raw', error: null }
    }

    // Common mistakes
    if (trimmed.startsWith('0x')) {
        return { valid: false, type: null, error: 'Это Ethereum-адрес, нужен TON-адрес' }
    }
    if (trimmed.length < 40) {
        return { valid: false, type: null, error: 'Адрес слишком короткий' }
    }
    if (trimmed.length > 70) {
        return { valid: false, type: null, error: 'Адрес слишком длинный' }
    }

    return { valid: false, type: null, error: 'Неверный формат TON-адреса' }
}

/**
 * Quick check if address looks valid (boolean only).
 */
export function isValidTonAddress(address) {
    return validateTonAddress(address).valid
}

/**
 * Format address for display: UQAB...xY3z
 */
export function shortenAddress(address, startLen = 4, endLen = 4) {
    if (!address || address.length < startLen + endLen + 3) return address || ''
    return `${address.slice(0, startLen)}...${address.slice(-endLen)}`
}
