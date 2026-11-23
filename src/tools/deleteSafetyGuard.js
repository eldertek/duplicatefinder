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

export const DELETION_PLAN_SCHEMA = 'duplicatefinder.deletion-plan.v1'

/**
 * Normalize a Nextcloud file path by stripping `/<user>/files` when present.
 *
 * @param {string|null|undefined} rawPath - Raw path string.
 * @return {string} Normalized relative path or empty string.
 */
function normalizePlanPath(rawPath) {
	if (typeof rawPath !== 'string' || !rawPath.trim()) {
		return ''
	}
	const trimmed = rawPath.trim()
	const stripped = trimmed.replace(/^\/[^/]+\/files(?=\/|$)/, '')
	if (stripped === '' && /^\/[^/]+\/files$/.test(trimmed)) {
		return '/'
	}
	return stripped
}

/**
 * Split a normalized path into parent folder and filename.
 *
 * @param {string} normalizedPath - Normalized path string.
 * @return {{ folder: string, fileName: string }} Split path components.
 */
function splitPlanPath(normalizedPath) {
	if (!normalizedPath) {
		return { folder: '', fileName: '' }
	}
	const lastSlash = normalizedPath.lastIndexOf('/')
	if (lastSlash === -1) {
		return { folder: '/', fileName: normalizedPath }
	}
	if (lastSlash === 0) {
		return { folder: '/', fileName: normalizedPath.slice(1) }
	}
	return {
		folder: normalizedPath.slice(0, lastSlash),
		fileName: normalizedPath.slice(lastSlash + 1),
	}
}

/**
 * Convert a duplicate file entry into an audit plan row.
 *
 * @param {object} file - Duplicate file entry.
 * @return {{
 *   key: string|number|null,
 *   path: string,
 *   normalizedPath: string,
 *   folder: string,
 *   fileName: string,
 *   sizeBytes: number,
 *   formattedSize: string,
 *   isProtected: boolean
 * }} Normalized audit entry.
 */
function toAuditEntry(file) {
	const rawPath = typeof file.path === 'string' ? file.path : ''
	const normalizedPath = normalizePlanPath(rawPath) || rawPath
	const { folder, fileName } = splitPlanPath(normalizedPath)
	const rawSize = Number(file.size)
	const sizeBytes = Number.isFinite(rawSize) && rawSize > 0 ? Math.floor(rawSize) : 0

	return {
		key: resolveFileKey(file),
		path: rawPath,
		normalizedPath,
		folder,
		fileName,
		sizeBytes,
		formattedSize: formatReclaimableBytes(sizeBytes),
		isProtected: Boolean(file.isInOriginFolder),
	}
}

/**
 * Build a complete dry-run deletion audit plan splitting a duplicate group into
 * files queued for deletion (`targetEntries`) and surviving copies (`survivingEntries`).
 *
 * @param {Array<object>} groupFiles - All file entries belonging to the duplicate group.
 * @param {Array<string|number>|Set<string|number>} selectedKeys - Keys of files targeted for deletion.
 * @return {{
 *   selectedCount: number,
 *   survivingCount: number,
 *   protectedSurvivingCount: number,
 *   reclaimableBytes: number,
 *   reclaimableFormatted: string,
 *   survivingBytes: number,
 *   survivingFormatted: string,
 *   wouldDeleteAllCopies: boolean,
 *   includesProtectedOrigin: boolean,
 *   canProceedSafely: boolean,
 *   targetEntries: Array<object>,
 *   survivingEntries: Array<object>
 * }} Dry-run audit plan.
 */
export function buildDeletionAuditPlan(groupFiles, selectedKeys) {
	const validFiles = Array.isArray(groupFiles)
		? groupFiles.filter(file => file && typeof file === 'object')
		: []

	if (validFiles.length === 0) {
		return {
			selectedCount: 0,
			survivingCount: 0,
			protectedSurvivingCount: 0,
			reclaimableBytes: 0,
			reclaimableFormatted: '0 B',
			survivingBytes: 0,
			survivingFormatted: '0 B',
			wouldDeleteAllCopies: false,
			includesProtectedOrigin: false,
			canProceedSafely: false,
			targetEntries: [],
			survivingEntries: [],
		}
	}

	const selectedKeySet = normalizeSelectedKeySet(selectedKeys)
	const targetEntries = []
	const survivingEntries = []
	let reclaimableBytes = 0
	let survivingBytes = 0
	let protectedSurvivingCount = 0
	let includesProtectedOrigin = false

	for (const file of validFiles) {
		const entry = toAuditEntry(file)
		if (isFileTargeted(file, selectedKeySet)) {
			targetEntries.push(entry)
			reclaimableBytes += entry.sizeBytes
			if (entry.isProtected) {
				includesProtectedOrigin = true
			}
		} else {
			survivingEntries.push(entry)
			survivingBytes += entry.sizeBytes
			if (entry.isProtected) {
				protectedSurvivingCount += 1
			}
		}
	}

	const selectedCount = targetEntries.length
	const survivingCount = survivingEntries.length
	const wouldDeleteAllCopies = selectedCount > 0 && survivingCount === 0
	const canProceedSafely = selectedCount > 0 && !wouldDeleteAllCopies && !includesProtectedOrigin

	return {
		selectedCount,
		survivingCount,
		protectedSurvivingCount,
		reclaimableBytes,
		reclaimableFormatted: formatReclaimableBytes(reclaimableBytes),
		survivingBytes,
		survivingFormatted: formatReclaimableBytes(survivingBytes),
		wouldDeleteAllCopies,
		includesProtectedOrigin,
		canProceedSafely,
		targetEntries,
		survivingEntries,
	}
}

/**
 * Serialize a dry-run deletion audit plan into a structured JSON manifest.
 *
 * @param {object|null|undefined} group - Duplicate group metadata.
 * @param {object|null|undefined} auditPlan - Audit plan produced by buildDeletionAuditPlan.
 * @param {string} [exportedAt] - Optional ISO-8601 export timestamp override.
 * @return {string} Pretty-printed JSON deletion plan manifest.
 */
export function buildDeletionPlanJson(group, auditPlan, exportedAt) {
	const timestamp = typeof exportedAt === 'string' && exportedAt.trim()
		? exportedAt.trim()
		: new Date().toISOString()

	const safeGroup = group && typeof group === 'object' ? group : {}
	const safePlan = auditPlan && typeof auditPlan === 'object' ? auditPlan : buildDeletionAuditPlan([], [])
	const targetEntries = Array.isArray(safePlan.targetEntries) ? safePlan.targetEntries : []
	const survivingEntries = Array.isArray(safePlan.survivingEntries) ? safePlan.survivingEntries : []

	const actions = [
		...targetEntries.map(entry => ({
			action: 'delete',
			path: entry.normalizedPath || entry.path || '',
			sizeBytes: Number(entry.sizeBytes) || 0,
			protected: Boolean(entry.isProtected),
		})),
		...survivingEntries.map(entry => ({
			action: 'keep',
			path: entry.normalizedPath || entry.path || '',
			sizeBytes: Number(entry.sizeBytes) || 0,
			protected: Boolean(entry.isProtected),
		})),
	]

	return JSON.stringify({
		schema: DELETION_PLAN_SCHEMA,
		exportedAt: timestamp,
		group: {
			id: safeGroup.id ?? null,
			hash: typeof safeGroup.hash === 'string' ? safeGroup.hash : String(safeGroup.hash ?? ''),
			acknowledged: Boolean(safeGroup.acknowledged),
		},
		summary: {
			deleteCount: Number(safePlan.selectedCount) || 0,
			keepCount: Number(safePlan.survivingCount) || 0,
			protectedKeepCount: Number(safePlan.protectedSurvivingCount) || 0,
			reclaimableBytes: Number(safePlan.reclaimableBytes) || 0,
			survivingBytes: Number(safePlan.survivingBytes) || 0,
			wouldDeleteAllCopies: Boolean(safePlan.wouldDeleteAllCopies),
			includesProtectedOrigin: Boolean(safePlan.includesProtectedOrigin),
			canProceedSafely: Boolean(safePlan.canProceedSafely),
		},
		actions,
	}, null, 2)
}

/**
 * Trigger a client-side JSON download of a dry-run deletion plan manifest.
 *
 * @param {object|null|undefined} group - Duplicate group metadata.
 * @param {object|null|undefined} auditPlan - Audit plan produced by buildDeletionAuditPlan.
 * @param {string} [filename='deletion-plan.json'] - Suggested download filename.
 * @return {boolean} True when download was triggered, false otherwise.
 */
export function downloadDeletionPlanJson(group, auditPlan, filename = 'deletion-plan.json') {
	if (!auditPlan || Number(auditPlan.selectedCount) <= 0) {
		return false
	}
	if (
		typeof document === 'undefined'
		|| typeof Blob === 'undefined'
		|| typeof URL === 'undefined'
		|| typeof URL.createObjectURL !== 'function'
	) {
		return false
	}

	const content = buildDeletionPlanJson(group, auditPlan)
	const blob = new Blob([content], { type: 'application/json' })
	const url = URL.createObjectURL(blob)
	const link = document.createElement('a')
	link.href = url
	link.setAttribute('download', filename)
	link.style.display = 'none'
	document.body.appendChild(link)
	try {
		link.click()
	} finally {
		document.body.removeChild(link)
		if (typeof URL.revokeObjectURL === 'function') {
			URL.revokeObjectURL(url)
		}
	}
	return true
}
