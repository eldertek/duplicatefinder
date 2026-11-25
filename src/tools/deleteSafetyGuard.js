/**
 * Pure deletion-plan safety guard for duplicate file groups.
 * Computes exact deletion counts, surviving copy counts, reclaimable storage,
 * and anti-accidental-deletion flags before executing any delete request.
 */

const BYTE_UNITS = Object.freeze(['B', 'KB', 'MB', 'GB', 'TB'])

/**
 * Format a byte count into a concise human-readable size string.
 *
 * @param {number} bytes - Byte count to format.
 * @return {string} Formatted byte size (e.g. '0 B', '512 B', '1.5 MB').
 */
export function formatReclaimableBytes(bytes) {
	const numericBytes = Number(bytes)
	if (!Number.isFinite(numericBytes) || numericBytes <= 0) {
		return '0 B'
	}
	if (numericBytes < 1024) {
		return `${Math.round(numericBytes)} B`
	}

	let unitIndex = Math.min(BYTE_UNITS.length - 1, Math.floor(Math.log(numericBytes) / Math.log(1024)))
	let scaled = Math.round((numericBytes / Math.pow(1024, unitIndex)) * 10) / 10
	if (scaled >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
		unitIndex += 1
		scaled = Math.round((numericBytes / Math.pow(1024, unitIndex)) * 10) / 10
	}
	return `${scaled} ${BYTE_UNITS[unitIndex]}`
}

/**
 * Resolve a stable selection key for a duplicate file entry (id when present, else path).
 *
 * @param {object|null|undefined} file - Duplicate file entry.
 * @return {string|number|null} Selection key or null when unavailable.
 */
function resolveFileKey(file) {
	if (!file || typeof file !== 'object') {
		return null
	}
	if (file.id !== null && file.id !== undefined && file.id !== '') {
		return file.id
	}
	if (typeof file.path === 'string' && file.path.length > 0) {
		return file.path
	}
	return null
}

/**
 * Normalize selectedKeys (Array, Set, or iterable of keys/file objects) into a Set.
 *
 * @param {Array|Set|Iterable|null|undefined} selectedKeys - Selected identifiers.
 * @return {Set<string|number>} Normalized Set of keys.
 */
function normalizeSelectedKeySet(selectedKeys) {
	const keySet = new Set()
	if (!selectedKeys) {
		return keySet
	}
	const iterable = Array.isArray(selectedKeys) || selectedKeys instanceof Set
		? selectedKeys
		: (typeof selectedKeys[Symbol.iterator] === 'function' ? selectedKeys : [])

	for (const entry of iterable) {
		if (entry && typeof entry === 'object') {
			const extracted = resolveFileKey(entry)
			if (extracted !== null) {
				keySet.add(extracted)
			}
			if (typeof entry.path === 'string' && entry.path.length > 0) {
				keySet.add(entry.path)
			}
		} else if (entry !== null && entry !== undefined && entry !== '') {
			keySet.add(entry)
		}
	}
	return keySet
}

/**
 * Check whether a file entry matches the normalized selection key set.
 *
 * @param {object} file - Valid duplicate file entry.
 * @param {Set<string|number>} selectedKeySet - Normalized Set of selected keys.
 * @return {boolean} True when the file is targeted for deletion.
 */
function isFileTargeted(file, selectedKeySet) {
	const key = resolveFileKey(file)
	if (key !== null && selectedKeySet.has(key)) {
		return true
	}
	if (typeof file.path === 'string' && file.path.length > 0 && selectedKeySet.has(file.path)) {
		return true
	}
	return false
}

/**
 * Evaluate a proposed deletion plan against all files in a duplicate group.
 *
 * @param {Array<object>} groupFiles - All file entries belonging to the duplicate group.
 * @param {Array<string|number>|Set<string|number>} selectedKeys - Keys of files targeted for deletion.
 * @return {{
 *   selectedCount: number,
 *   survivingCount: number,
 *   reclaimableBytes: number,
 *   reclaimableFormatted: string,
 *   wouldDeleteAllCopies: boolean,
 *   includesProtectedOrigin: boolean,
 *   canProceedSafely: boolean,
 *   targetPaths: string[]
 * }} Evaluated safety plan.
 */
export function evaluateDeletionPlan(groupFiles, selectedKeys) {
	const validFiles = Array.isArray(groupFiles)
		? groupFiles.filter(file => file && typeof file === 'object')
		: []

	if (validFiles.length === 0) {
		return {
			selectedCount: 0,
			survivingCount: 0,
			reclaimableBytes: 0,
			reclaimableFormatted: '0 B',
			wouldDeleteAllCopies: false,
			includesProtectedOrigin: false,
			canProceedSafely: false,
			targetPaths: [],
		}
	}

	const selectedKeySet = normalizeSelectedKeySet(selectedKeys)
	let selectedCount = 0
	let reclaimableBytes = 0
	let includesProtectedOrigin = false
	const targetPaths = []

	for (const file of validFiles) {
		if (!isFileTargeted(file, selectedKeySet)) {
			continue
		}
		selectedCount += 1
		const size = Number(file.size)
		if (Number.isFinite(size) && size > 0) {
			reclaimableBytes += Math.floor(size)
		}
		if (file.isInOriginFolder) {
			includesProtectedOrigin = true
		}
		if (typeof file.path === 'string' && file.path.length > 0) {
			targetPaths.push(file.path)
		}
	}

	const survivingCount = validFiles.length - selectedCount
	const wouldDeleteAllCopies = selectedCount > 0 && survivingCount === 0
	const canProceedSafely = selectedCount > 0 && !wouldDeleteAllCopies && !includesProtectedOrigin

	return {
		selectedCount,
		survivingCount,
		reclaimableBytes,
		reclaimableFormatted: formatReclaimableBytes(reclaimableBytes),
		wouldDeleteAllCopies,
		includesProtectedOrigin,
		canProceedSafely,
		targetPaths,
	}
}
