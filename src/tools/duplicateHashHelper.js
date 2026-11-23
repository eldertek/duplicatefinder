/**
 * Pure helper for formatting duplicate file hashes into readable prefixes.
 */

const HEX_HASH_PATTERN = /^[0-9a-f]+$/

/**
 * Format a hexadecimal hash string into a lowercase short prefix.
 * Returns an empty string when the hash or length is invalid.
 *
 * @param {string|null|undefined} hash - Full duplicate hash string.
 * @param {number} [length=12] - Maximum prefix length to keep.
 * @return {string} Lowercase hexadecimal prefix, or '' if invalid.
 */
export function formatShortHash(hash, length = 12) {
	if (typeof hash !== 'string') {
		return ''
	}

	const normalizedHash = hash.trim().toLowerCase()
	if (normalizedHash.length === 0 || !HEX_HASH_PATTERN.test(normalizedHash)) {
		return ''
	}

	if (typeof length !== 'number' || !Number.isFinite(length)) {
		return ''
	}

	const safeLength = Math.floor(length)
	if (safeLength <= 0) {
		return ''
	}

	return normalizedHash.slice(0, safeLength)
}
