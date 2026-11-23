/**
 * Pure, deterministic metadata badge helpers for duplicate file comparison.
 * Annotates each copy in a duplicate group with factual signals to help users
 * identify the master copy to keep before deletion.
 */

const EMPTY_BADGES = Object.freeze({
	isOldest: false,
	isNewest: false,
	isShortestPath: false,
	isProtectedOrigin: false,
	folderLabel: '',
})

/**
 * Parse a timestamp value (number, numeric string, Date, or ISO date string)
 * into a finite numeric value.
 *
 * @param {*} value - Candidate timestamp field.
 * @return {number|null} Numeric timestamp or null when missing/invalid.
 */
function parseTimestamp(value) {
	if (value === null || value === undefined || value === '') {
		return null
	}
	if (value instanceof Date) {
		const ms = value.getTime()
		return Number.isFinite(ms) ? ms : null
	}
	if (typeof value === 'number') {
		return Number.isFinite(value) ? value : null
	}
	if (typeof value === 'string') {
		const trimmed = value.trim()
		if (!trimmed) {
			return null
		}
		if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
			const numeric = Number(trimmed)
			return Number.isFinite(numeric) ? numeric : null
		}
		const parsed = Date.parse(trimmed)
		return Number.isFinite(parsed) ? parsed : null
	}
	return null
}

/**
 * Extract the best available modification timestamp from a duplicate file entry.
 *
 * @param {object|null|undefined} file - Duplicate file entry.
 * @return {number|null} Numeric timestamp or null when absent.
 */
function getFileTimestamp(file) {
	if (!file || typeof file !== 'object') {
		return null
	}
	for (const field of ['mtime', 'modified', 'updatedAt', 'lastModified']) {
		if (Object.prototype.hasOwnProperty.call(file, field)) {
			const ts = parseTimestamp(file[field])
			if (ts !== null) {
				return ts
			}
		}
	}
	return null
}

/**
 * Extract a normalized parent folder label for display (e.g. '/Photos/2024' or '/').
 *
 * @param {string|null|undefined} path - Full Nextcloud path or relative file path.
 * @return {string} Normalized folder label, or empty string when path is missing.
 */
export function getFolderLabel(path) {
	if (typeof path !== 'string' || path.trim() === '') {
		return ''
	}
	const relativePath = path.replace(/^\/[^/]+\/files(?=\/|$)/, '')
	const lastSlashIndex = relativePath.lastIndexOf('/')
	if (lastSlashIndex <= 0) {
		return '/'
	}
	return relativePath.substring(0, lastSlashIndex) || '/'
}

/**
 * Annotate every file entry in a duplicate group with factual metadata badges:
 * - isOldest: strictly oldest modification timestamp when >= 2 files differ in date
 * - isNewest: strictly newest modification timestamp when >= 2 files differ in date
 * - isShortestPath: shortest path length when >= 2 files differ in path length
 * - isProtectedOrigin: whether the file lives in a protected origin folder
 * - folderLabel: normalized parent folder label
 *
 * @param {Array<object>} files - Files belonging to one duplicate group.
 * @return {Array<object>} Badge objects aligned 1:1 with the input array.
 */
export function annotateDuplicateMetadataBadges(files) {
	if (!Array.isArray(files) || files.length === 0) {
		return []
	}

	let timestampedCount = 0
	let minTs = Number.POSITIVE_INFINITY
	let maxTs = Number.NEGATIVE_INFINITY

	let pathCount = 0
	let minPathLen = Number.POSITIVE_INFINITY
	let maxPathLen = Number.NEGATIVE_INFINITY

	const parsedEntries = files.map(file => {
		if (!file || typeof file !== 'object') {
			return null
		}
		const ts = getFileTimestamp(file)
		if (ts !== null) {
			timestampedCount++
			if (ts < minTs) {
				minTs = ts
			}
			if (ts > maxTs) {
				maxTs = ts
			}
		}
		const pathLen = typeof file.path === 'string' && file.path.length > 0
			? file.path.length
			: null
		if (pathLen !== null) {
			pathCount++
			if (pathLen < minPathLen) {
				minPathLen = pathLen
			}
			if (pathLen > maxPathLen) {
				maxPathLen = pathLen
			}
		}
		return { file, ts, pathLen }
	})

	const hasTimestampSpread = timestampedCount >= 2 && minTs !== maxTs
	const hasPathLengthSpread = pathCount >= 2 && minPathLen !== maxPathLen

	return parsedEntries.map(entry => {
		if (!entry) {
			return { ...EMPTY_BADGES }
		}
		const { file, ts, pathLen } = entry
		return {
			isOldest: hasTimestampSpread && ts !== null && ts === minTs,
			isNewest: hasTimestampSpread && ts !== null && ts === maxTs,
			isShortestPath: hasPathLengthSpread && pathLen !== null && pathLen === minPathLen,
			isProtectedOrigin: Boolean(file.isInOriginFolder),
			folderLabel: getFolderLabel(file.path),
		}
	})
}
