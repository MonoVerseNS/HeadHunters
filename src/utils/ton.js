import { Address } from '@ton/core';
import { CONFIG } from '../config.js';

/**
 * Converts a raw or friendly address to a user-friendly format.
 * Defaults to non-bounceable (UQ/0Q) for safety.
 * @param {string} addressStr 
 * @param {boolean} bounceable Default: false
 * @returns {string} User-friendly address
 */
export function toUserFriendlyAddress(addressStr, bounceable = false) {
    try {
        if (!addressStr) return '';
        const addr = Address.parse(addressStr);
        const isTestnet = CONFIG.ton?.network === 'testnet';
        return addr.toString({
            urlSafe: true,
            bounceable,
            testOnly: isTestnet
        });
    } catch (e) {
        console.error('Address conversion error:', e);
        return addressStr || '';
    }
}
