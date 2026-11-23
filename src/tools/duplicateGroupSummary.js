/**
 * Pure helper for computing a compact header summary of the active duplicate group.
 * Summarizes total copies, redundant copies, unit file size, reclaimable space,
 * and protected origin copy count for quick triage orientation.
 */

const BYTE_UNITS = Object.freeze(['B', 'KB', 'MB', 'GB', 'TB'])

/**
 * Format a byte count into a concise human-readable string using B, KB, MB, GB, or TB.
 *
 * @param {number} bytes - Byte count to format.
 * @return {string} Formatted byte size (e.g. '0 B', '512 B', '1.5 MB').
 */
function formatSummaryBytes(bytes) {
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
 * Compute a compact header summary for a duplicate group's file entries.
 *
 * @param {Array<object>|null|undefined} groupFiles - Files belonging to the active duplicate group.
 * @return {{
 *   totalCopies: number,
 *   redundantCopies: number,
 *   unitSizeBytes: number,
 *   reclaimableBytes: number,
 *   reclaimableFormatted: string,
 *   protectedCount: number
 * }} Group header summary metrics.
 */
export function computeGroupHeaderSummary(groupFiles) {
	const validFiles = Array.isArray(groupFiles)
		? groupFiles.filter(file => file && typeof file === 'object')
		: []

	if (validFiles.length === 0) {
		return {
			totalCopies: 0,
			redundantCopies: 0,
			unitSizeBytes: 0,
			reclaimableBytes: 0,
			reclaimableFormatted: '0 B',
			protectedCount: 0,
		}
	}

	const totalCopies = validFiles.length
	const redundantCopies = Math.max(0, totalCopies - 1)
	let unitSizeBytes = 0
	let protectedCount = 0

	for (const file of validFiles) {
		if (unitSizeBytes === 0) {
			const size = Number(file.size)
			if (Number.isFinite(size) && size > 0) {
				unitSizeBytes = Math.floor(size)
			}
		}
		if (file.isInOriginFolder) {
			protectedCount += 1
		}
	}

	const reclaimableBytes = redundantCopies * unitSizeBytes

	return {
		totalCopies,
		redundantCopies,
		unitSizeBytes,
		reclaimableBytes,
		reclaimableFormatted: formatSummaryBytes(reclaimableBytes),
		protectedCount,
	}
}
