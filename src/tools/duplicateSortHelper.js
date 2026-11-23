/**
 * Pure deterministic duplicate sorting helper for triage lists.
 * Supports sorting by reclaimable space ((count - 1) * size), unit size,
 * copy count, and name/path without mutating input arrays.
 */

export const DUPLICATE_SORT_FIELDS = Object.freeze([
	'reclaimable',
	'size',
	'count',
	'name',
])

export const DUPLICATE_SORT_DIRECTIONS = Object.freeze([
	'desc',
	'asc',
])

/**
 * Convert a candidate numeric value into a finite non-negative number.
 *
 * @param {*} value - Candidate numeric input.
 * @return {number} Finite non-negative number, or 0 when invalid.
 */
function toPositiveNumber(value) {
	const num = Number(value)
	return Number.isFinite(num) && num > 0 ? num : 0
}

/**
 * Extract the filename (basename) from a file or folder path.
 *
 * @param {string|null|undefined} rawPath - File or folder path.
 * @return {string} Extracted filename or empty string.
 */
function extractBasename(rawPath) {
	if (typeof rawPath !== 'string') {
		return ''
	}
	const trimmed = rawPath.trim()
	if (!trimmed) {
		return ''
	}
	const normalized = trimmed.replace(/\\/g, '/')
	const lastSlash = normalized.lastIndexOf('/')
	return lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized
}

/**
 * Perform a locale-independent deterministic lexicographical string comparison.
 * Compares case-insensitively first, then falls back to raw code-unit order.
 *
 * @param {string} a - First string.
 * @param {string} b - Second string.
 * @return {number} Negative if a < b, positive if a > b, 0 if equal.
 */
function compareStringsLexicographically(a, b) {
	const strA = typeof a === 'string' ? a : ''
	const strB = typeof b === 'string' ? b : ''
	const lowerA = strA.toLowerCase()
	const lowerB = strB.toLowerCase()
	if (lowerA < lowerB) {
		return -1
	}
	if (lowerA > lowerB) {
		return 1
	}
	if (strA < strB) {
		return -1
	}
	if (strA > strB) {
		return 1
	}
	return 0
}

/**
 * Compute sortable metrics and deterministic tie-breaker keys for a duplicate group.
 *
 * @param {object|null|undefined} duplicate - Duplicate group object.
 * @return {{
 *   reclaimable: number,
 *   size: number,
 *   count: number,
 *   name: string,
 *   path: string,
 *   allPathsKey: string,
 *   hash: string,
 *   idKey: string
 * }} Extracted sort metrics and deterministic keys.
 */
export function getDuplicateSortMetrics(duplicate) {
	if (!duplicate || typeof duplicate !== 'object') {
		return {
			reclaimable: 0,
			size: 0,
			count: 0,
			name: '',
			path: '',
			allPathsKey: '',
			hash: '',
			idKey: '',
		}
	}

	let count = 0
	let unitSize = 0
	const candidatePaths = []

	if (Array.isArray(duplicate.files)) {
		count = duplicate.files.length
		for (const file of duplicate.files) {
			if (!file || typeof file !== 'object') {
				continue
			}
			if (unitSize === 0) {
				unitSize = toPositiveNumber(file.size)
			}
			const rawFilePath = typeof file.path === 'string' && file.path.trim()
				? file.path.trim()
				: (typeof file.name === 'string' && file.name.trim() ? file.name.trim() : '')
			if (rawFilePath) {
				candidatePaths.push(rawFilePath)
			}
		}
		if (unitSize === 0) {
			unitSize = toPositiveNumber(duplicate.size)
		}
	} else {
		const rawCount = Number(duplicate.count)
		count = Number.isFinite(rawCount) && rawCount > 0 ? Math.floor(rawCount) : 0
		unitSize = toPositiveNumber(duplicate.size)
	}

	if (candidatePaths.length === 0 && typeof duplicate.path === 'string' && duplicate.path.trim()) {
		candidatePaths.push(duplicate.path.trim())
	}

	const sortedPaths = [...candidatePaths].sort(compareStringsLexicographically)
	const primaryPath = sortedPaths.length > 0 ? sortedPaths[0] : ''
	const allPathsKey = sortedPaths.join('\0')

	let name = ''
	if (typeof duplicate.name === 'string' && duplicate.name.trim()) {
		name = duplicate.name.trim()
	} else if (primaryPath) {
		name = extractBasename(primaryPath)
	}

	let reclaimable = Math.max(0, count - 1) * unitSize
	if (count === 0 && unitSize === 0 && duplicate.reclaimableBytes !== undefined) {
		reclaimable = toPositiveNumber(duplicate.reclaimableBytes)
	}

	const hash = typeof duplicate.hash === 'string' ? duplicate.hash : ''
	const idKey = duplicate.id !== null && duplicate.id !== undefined ? String(duplicate.id) : ''

	return {
		reclaimable,
		size: unitSize,
		count,
		name,
		path: primaryPath,
		allPathsKey,
		hash,
		idKey,
	}
}

/**
 * Deterministic lexicographical tie-breaker comparing name, path, full path set, hash, and id.
 *
 * @param {object} metaA - Metrics for first duplicate group.
 * @param {object} metaB - Metrics for second duplicate group.
 * @return {number} Comparator result (-1, 0, or 1).
 */
function compareTieBreaker(metaA, metaB) {
	const byName = compareStringsLexicographically(metaA.name, metaB.name)
	if (byName !== 0) {
		return byName
	}
	const byPath = compareStringsLexicographically(metaA.path, metaB.path)
	if (byPath !== 0) {
		return byPath
	}
	const byAllPaths = compareStringsLexicographically(metaA.allPathsKey, metaB.allPathsKey)
	if (byAllPaths !== 0) {
		return byAllPaths
	}
	const byHash = compareStringsLexicographically(metaA.hash, metaB.hash)
	if (byHash !== 0) {
		return byHash
	}
	return compareStringsLexicographically(metaA.idKey, metaB.idKey)
}

/**
 * Sort duplicate groups deterministically without mutating the input array.
 *
 * @param {Array<object>|null|undefined} duplicates - Array of duplicate group objects.
 * @param {object} [options] - Sorting options.
 * @param {'reclaimable'|'size'|'count'|'name'} [options.sortBy='reclaimable'] - Primary sort criterion.
 * @param {'desc'|'asc'} [options.direction] - Sort direction ('desc' default for numeric, 'asc' for name).
 * @return {Array<object>} New deterministically sorted array of duplicate groups.
 */
export function sortDuplicatesDeterministically(duplicates, options = {}) {
	if (!Array.isArray(duplicates) || duplicates.length === 0) {
		return []
	}

	const safeOptions = options && typeof options === 'object' ? options : {}
	const sortBy = DUPLICATE_SORT_FIELDS.includes(safeOptions.sortBy)
		? safeOptions.sortBy
		: 'reclaimable'
	const defaultDirection = sortBy === 'name' ? 'asc' : 'desc'
	const direction = DUPLICATE_SORT_DIRECTIONS.includes(safeOptions.direction)
		? safeOptions.direction
		: defaultDirection

	const decorated = duplicates
		.filter(item => item && typeof item === 'object')
		.map(item => ({
			item,
			meta: getDuplicateSortMetrics(item),
		}))

	decorated.sort((a, b) => {
		if (sortBy === 'name') {
			const cmp = compareTieBreaker(a.meta, b.meta)
			return direction === 'desc' ? -cmp : cmp
		}

		const diff = a.meta[sortBy] - b.meta[sortBy]
		if (diff !== 0) {
			return direction === 'desc' ? -diff : diff
		}
		return compareTieBreaker(a.meta, b.meta)
	})

	return decorated.map(entry => entry.item)
}
