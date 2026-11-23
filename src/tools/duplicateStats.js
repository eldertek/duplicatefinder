/**
 * Pure duplicate storage breakdown and largest-group insight helpers
 * for quick triage visibility in the navigation panel.
 */

/**
 * Format a byte count into a concise readable string using B, KB, MB, or GB.
 *
 * @param {number} bytes - Byte count to format.
 * @return {string} Formatted byte size (e.g. '0 B', '512 B', '1.5 MB', '2 GB').
 */
export function formatBytes(bytes) {
	const units = ['B', 'KB', 'MB', 'GB']
	const numericBytes = Number(bytes)
	if (!Number.isFinite(numericBytes) || numericBytes <= 0) {
		return '0 B'
	}
	if (numericBytes < 1024) {
		return `${Math.round(numericBytes)} B`
	}

	let unitIndex = Math.min(units.length - 1, Math.floor(Math.log(numericBytes) / Math.log(1024)))
	let scaled = Math.round((numericBytes / Math.pow(1024, unitIndex)) * 10) / 10
	if (scaled >= 1024 && unitIndex < units.length - 1) {
		unitIndex += 1
		scaled = Math.round((numericBytes / Math.pow(1024, unitIndex)) * 10) / 10
	}
	return `${scaled} ${units[unitIndex]}`
}

/**
 * Extract a normalized lowercase file extension with leading dot (e.g. '.jpg')
 * or 'other' when the filename has no extension.
 *
 * @param {string|null|undefined} filePath - File path or filename.
 * @return {string} Normalized extension such as '.jpg' or 'other'.
 */
export function extractNormalizedExtension(filePath) {
	if (typeof filePath !== 'string' || !filePath.trim()) {
		return 'other'
	}
	const cleanPath = filePath.split(/[?#]/)[0].trim()
	const slashIndex = Math.max(cleanPath.lastIndexOf('/'), cleanPath.lastIndexOf('\\'))
	const fileName = slashIndex >= 0 ? cleanPath.slice(slashIndex + 1) : cleanPath
	const dotIndex = fileName.lastIndexOf('.')
	if (dotIndex <= 0 || dotIndex === fileName.length - 1) {
		return 'other'
	}
	const ext = fileName.slice(dotIndex + 1).trim().toLowerCase()
	return ext ? `.${ext}` : 'other'
}

/**
 * Determine the normalized extension for a duplicate group.
 *
 * @param {object|null|undefined} duplicate - Duplicate group object.
 * @return {string} Normalized extension such as '.jpg' or 'other'.
 */
export function getDuplicateExtension(duplicate) {
	if (!duplicate || typeof duplicate !== 'object') {
		return 'other'
	}
	if (Array.isArray(duplicate.files) && duplicate.files.length > 0) {
		for (const file of duplicate.files) {
			if (!file || typeof file !== 'object') {
				continue
			}
			const ext = extractNormalizedExtension(file.path || file.name || '')
			if (ext !== 'other') {
				return ext
			}
		}
		return 'other'
	}
	return extractNormalizedExtension(duplicate.path || duplicate.name || '')
}

/**
 * Compute reclaimable storage metrics for a single duplicate group.
 *
 * @param {object|null|undefined} duplicate - Duplicate group object.
 * @return {{ valid: boolean, count: number, extraCopies: number, unitSize: number, reclaimableBytes: number }}
 */
export function computeGroupReclaimableInfo(duplicate) {
	const empty = {
		valid: false,
		count: 0,
		extraCopies: 0,
		unitSize: 0,
		reclaimableBytes: 0,
	}
	if (!duplicate || typeof duplicate !== 'object') {
		return empty
	}

	let count = 0
	let unitSize = 0

	if (Array.isArray(duplicate.files)) {
		count = duplicate.files.length
		if (count <= 1) {
			return empty
		}
		for (const file of duplicate.files) {
			const size = Number(file && file.size)
			if (Number.isFinite(size) && size > 0) {
				unitSize = size
				break
			}
		}
	} else if (duplicate.count !== undefined) {
		const rawCount = Number(duplicate.count)
		if (!Number.isFinite(rawCount) || rawCount <= 1) {
			return empty
		}
		count = Math.floor(rawCount)
		const rawSize = Number(duplicate.size)
		unitSize = Number.isFinite(rawSize) && rawSize > 0 ? rawSize : 0
	} else {
		return empty
	}

	const extraCopies = count - 1
	return {
		valid: true,
		count,
		extraCopies,
		unitSize,
		reclaimableBytes: extraCopies * unitSize,
	}
}

/**
 * Compute reclaimable bytes for a single duplicate group.
 *
 * @param {object|null|undefined} duplicate - Duplicate group object.
 * @return {number} Reclaimable bytes ((count - 1) * size), or 0 if invalid.
 */
export function computeGroupReclaimableBytes(duplicate) {
	return computeGroupReclaimableInfo(duplicate).reclaimableBytes
}

/**
 * Check whether a duplicate group matches a selected normalized extension filter.
 *
 * @param {object|null|undefined} duplicate - Duplicate group object.
 * @param {string|null|undefined} targetExt - Target extension (e.g. '.jpg', 'jpg', 'other').
 * @return {boolean} True when the group matches the extension filter.
 */
export function matchesDuplicateExtension(duplicate, targetExt) {
	if (!duplicate || typeof duplicate !== 'object') {
		return false
	}
	if (typeof targetExt !== 'string' || !targetExt.trim()) {
		return true
	}
	const raw = targetExt.trim().toLowerCase()
	const normalizedTarget = raw === 'other'
		? 'other'
		: (raw.startsWith('.') ? raw : `.${raw}`)
	return getDuplicateExtension(duplicate) === normalizedTarget
}

/**
 * Aggregate reclaimable space ((count - 1) * size) by normalized file extension
 * and return the top N entries sorted by descending reclaimable bytes.
 *
 * @param {Array} duplicates - Array of duplicate group objects.
 * @param {number} [limit=3] - Maximum number of top extensions to return.
 * @return {Array<{ ext: string, reclaimableBytes: number, reclaimableFormatted: string, groupCount: number, sharePct: number }>}
 */
export function computeExtensionBreakdown(duplicates, limit = 3) {
	if (!Array.isArray(duplicates) || duplicates.length === 0) {
		return []
	}

	let normalizedLimit = 3
	if (limit !== undefined && limit !== null) {
		const numericLimit = Number(limit)
		if (Number.isFinite(numericLimit)) {
			if (numericLimit <= 0) {
				return []
			}
			normalizedLimit = Math.floor(numericLimit)
		}
	}

	const byExtension = new Map()
	let totalReclaimableBytes = 0

	for (const duplicate of duplicates) {
		const info = computeGroupReclaimableInfo(duplicate)
		if (!info.valid) {
			continue
		}
		const ext = getDuplicateExtension(duplicate)
		const existing = byExtension.get(ext)
		if (existing) {
			existing.reclaimableBytes += info.reclaimableBytes
			existing.groupCount += 1
		} else {
			byExtension.set(ext, {
				ext,
				reclaimableBytes: info.reclaimableBytes,
				groupCount: 1,
			})
		}
		totalReclaimableBytes += info.reclaimableBytes
	}

	if (byExtension.size === 0) {
		return []
	}

	const sorted = Array.from(byExtension.values()).sort((a, b) => {
		if (b.reclaimableBytes !== a.reclaimableBytes) {
			return b.reclaimableBytes - a.reclaimableBytes
		}
		if (b.groupCount !== a.groupCount) {
			return b.groupCount - a.groupCount
		}
		if (a.ext < b.ext) {
			return -1
		}
		if (a.ext > b.ext) {
			return 1
		}
		return 0
	})

	return sorted.slice(0, normalizedLimit).map(item => ({
		ext: item.ext,
		reclaimableBytes: item.reclaimableBytes,
		reclaimableFormatted: formatBytes(item.reclaimableBytes),
		groupCount: item.groupCount,
		sharePct: totalReclaimableBytes > 0
			? Math.round((item.reclaimableBytes / totalReclaimableBytes) * 100)
			: 0,
	}))
}

/**
 * Find the duplicate group with the highest reclaimable byte savings.
 *
 * @param {Array} duplicates - Array of duplicate group objects.
 * @return {object|null} Duplicate group with the largest reclaimable space, or null if none.
 */
export function findLargestDuplicateGroup(duplicates) {
	if (!Array.isArray(duplicates) || duplicates.length === 0) {
		return null
	}

	let bestGroup = null
	let bestBytes = -1

	for (const duplicate of duplicates) {
		const info = computeGroupReclaimableInfo(duplicate)
		if (!info.valid) {
			continue
		}
		if (info.reclaimableBytes > bestBytes) {
			bestBytes = info.reclaimableBytes
			bestGroup = duplicate
		}
	}

	return bestGroup
}
