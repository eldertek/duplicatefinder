/**
 * Pure batch scan history and space reclamation timeline analytics helpers.
 * Tracks scan snapshots and deletion batches per user in localStorage with
 * strict schema sanitization, bounded history size, and zero chart-library bloat.
 */

import { matchesDuplicateCategory } from './duplicateFilters'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const RECLAMATION_HISTORY_STORAGE_KEY = 'duplicatefinder:reclamation-history'
export const MAX_HISTORY_ENTRIES = 60

export const HISTORY_ENTRY_KINDS = Object.freeze(['scan', 'cleanup'])
export const CLEANUP_SOURCES = Object.freeze(['single', 'group', 'bulk', 'folder'])
export const SCAN_TRIGGERS = Object.freeze(['manual', 'sync', 'baseline'])
export const HISTORY_FILTER_KINDS = Object.freeze(['all', 'cleanup', 'scan'])

const TRACKED_CATEGORIES = Object.freeze([
	'images',
	'videos',
	'audio',
	'documents',
	'archives',
])

const BASELINE_DEDUP_WINDOW_MS = 15 * 60 * 1000
const MAX_SAMPLE_LABEL_LENGTH = 80

/**
 * Resolve a Storage-like object safely without throwing in restricted contexts.
 *
 * @param {Storage|object|null|undefined} storage Injected storage or undefined for window.localStorage.
 * @return {object|null} Storage instance or null when unavailable.
 */
function resolveStorage(storage) {
	if (storage === null) {
		return null
	}
	if (storage !== undefined) {
		return typeof storage === 'object' ? storage : null
	}
	try {
		if (typeof window !== 'undefined' && window.localStorage) {
			return window.localStorage
		}
	} catch (error) {
		return null
	}
	return null
}

/**
 * Clamp and floor a finite non-negative integer value.
 *
 * @param {*} value Candidate numeric value.
 * @return {number} Non-negative integer.
 */
function toSafeNonNegativeInt(value) {
	const numeric = Number(value)
	if (!Number.isFinite(numeric) || numeric <= 0) {
		return 0
	}
	return Math.floor(numeric)
}

/**
 * Normalize a signed integer delta (may be negative, zero, or positive).
 *
 * @param {*} value Candidate delta value.
 * @return {number|null} Rounded integer or null when unavailable.
 */
function toNullableSignedInt(value) {
	if (value === null || value === undefined || value === '') {
		return null
	}
	const numeric = Number(value)
	if (!Number.isFinite(numeric)) {
		return null
	}
	return Math.round(numeric)
}

/**
 * Normalize a timestamp in milliseconds.
 *
 * @param {*} value Candidate timestamp.
 * @param {number} [fallback] Fallback timestamp.
 * @return {number} Valid epoch milliseconds.
 */
function toSafeTimestamp(value, fallback = Date.now()) {
	const numeric = Number(value)
	if (Number.isFinite(numeric) && numeric > 0) {
		return Math.floor(numeric)
	}
	return Math.floor(fallback)
}

/**
 * Sanitize a short plain-text label (filename or folder path) for safe text display.
 *
 * @param {*} raw Raw label string.
 * @return {string} Trimmed plain-text label capped to MAX_SAMPLE_LABEL_LENGTH.
 */
function sanitizeSampleLabel(raw) {
	if (typeof raw !== 'string') {
		return ''
	}
	let stripped = ''
	for (let i = 0; i < raw.length; i++) {
		const code = raw.charCodeAt(i)
		stripped += (code < 32 || code === 127) ? ' ' : raw[i]
	}
	const cleaned = stripped.replace(/\s+/g, ' ').trim()
	if (!cleaned) {
		return ''
	}
	if (cleaned.length <= MAX_SAMPLE_LABEL_LENGTH) {
		return cleaned
	}
	return `${cleaned.slice(0, MAX_SAMPLE_LABEL_LENGTH - 3)}...`
}

/**
 * Generate a deterministic-safe unique identifier for a timeline entry.
 *
 * @param {string} kind Entry kind ('scan' or 'cleanup').
 * @param {number} timestamp Epoch milliseconds.
 * @param {number} sequence Hint index.
 * @return {string} Entry identifier.
 */
function createEntryId(kind, timestamp, sequence = 0) {
	return `${kind}-${timestamp}-${sequence}-${Math.random().toString(36).slice(2, 7)}`
}

/**
 * Compute the storage key for reclamation history, scoped per Nextcloud user when present.
 *
 * @param {object} [options] Optional configuration.
 * @param {string} [options.storageKey] Explicit storage key override.
 * @return {string} Storage key string.
 */
export function getReclamationHistoryStorageKey(options = {}) {
	if (options && typeof options.storageKey === 'string' && options.storageKey.trim().length > 0) {
		return options.storageKey.trim()
	}
	let uid = ''
	try {
		if (typeof window !== 'undefined' && window.OC) {
			if (typeof window.OC.getCurrentUser === 'function') {
				const user = window.OC.getCurrentUser()
				if (user && user.uid) {
					uid = String(user.uid)
				}
			} else if (window.OC.currentUser) {
				uid = String(window.OC.currentUser)
			}
		}
	} catch (error) {
		uid = ''
	}
	return uid ? `${RECLAMATION_HISTORY_STORAGE_KEY}:${uid}` : RECLAMATION_HISTORY_STORAGE_KEY
}

/**
 * Create a clean empty reclamation history state.
 *
 * @return {{ version: number, totalBytesReclaimed: number, totalFilesDeleted: number, totalGroupsResolved: number, entries: Array<object> }} Empty state.
 */
export function createEmptyHistoryState() {
	return {
		version: 1,
		totalBytesReclaimed: 0,
		totalFilesDeleted: 0,
		totalGroupsResolved: 0,
		entries: [],
	}
}

/**
 * Validate and sanitize a single timeline entry against strict whitelists.
 *
 * @param {*} raw Raw candidate entry.
 * @return {object|null} Sanitized entry or null when invalid.
 */
export function sanitizeHistoryEntry(raw) {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return null
	}
	const kind = typeof raw.kind === 'string' && HISTORY_ENTRY_KINDS.includes(raw.kind)
		? raw.kind
		: null
	if (!kind) {
		return null
	}

	const timestamp = toSafeTimestamp(raw.timestamp, 0)
	if (timestamp <= 0) {
		return null
	}

	const id = typeof raw.id === 'string' && raw.id.trim().length > 0
		? raw.id.trim().slice(0, 64)
		: `${kind}-${timestamp}`

	if (kind === 'cleanup') {
		const filesDeleted = toSafeNonNegativeInt(raw.filesDeleted)
		const bytesReclaimed = toSafeNonNegativeInt(raw.bytesReclaimed)
		if (filesDeleted === 0 && bytesReclaimed === 0) {
			return null
		}
		const source = typeof raw.source === 'string' && CLEANUP_SOURCES.includes(raw.source)
			? raw.source
			: 'single'
		return {
			id,
			kind: 'cleanup',
			timestamp,
			bytesReclaimed,
			filesDeleted,
			groupsResolved: toSafeNonNegativeInt(raw.groupsResolved),
			source,
			sampleLabel: sanitizeSampleLabel(raw.sampleLabel),
		}
	}

	const trigger = typeof raw.trigger === 'string' && SCAN_TRIGGERS.includes(raw.trigger)
		? raw.trigger
		: 'sync'

	return {
		id,
		kind: 'scan',
		timestamp,
		groupCount: toSafeNonNegativeInt(raw.groupCount),
		unacknowledgedCount: toSafeNonNegativeInt(raw.unacknowledgedCount),
		acknowledgedCount: toSafeNonNegativeInt(raw.acknowledgedCount),
		reclaimableBytes: toSafeNonNegativeInt(raw.reclaimableBytes),
		redundantCopies: toSafeNonNegativeInt(raw.redundantCopies),
		scannedFiles: toSafeNonNegativeInt(raw.scannedFiles),
		deltaBytes: toNullableSignedInt(raw.deltaBytes),
		deltaGroups: toNullableSignedInt(raw.deltaGroups),
		trigger,
	}
}

/**
 * Validate and sanitize a full reclamation history state object.
 *
 * @param {*} raw Raw persisted state.
 * @return {{ version: number, totalBytesReclaimed: number, totalFilesDeleted: number, totalGroupsResolved: number, entries: Array<object> }} Sanitized state.
 */
export function sanitizeHistoryState(raw) {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return createEmptyHistoryState()
	}

	const rawEntries = Array.isArray(raw.entries) ? raw.entries : []
	const sanitizedEntries = rawEntries
		.map(entry => sanitizeHistoryEntry(entry))
		.filter(Boolean)
		.sort((a, b) => b.timestamp - a.timestamp)
		.slice(0, MAX_HISTORY_ENTRIES)

	const derivedBytes = sanitizedEntries
		.filter(entry => entry.kind === 'cleanup')
		.reduce((sum, entry) => sum + entry.bytesReclaimed, 0)
	const derivedFiles = sanitizedEntries
		.filter(entry => entry.kind === 'cleanup')
		.reduce((sum, entry) => sum + entry.filesDeleted, 0)
	const derivedGroups = sanitizedEntries
		.filter(entry => entry.kind === 'cleanup')
		.reduce((sum, entry) => sum + entry.groupsResolved, 0)

	return {
		version: 1,
		totalBytesReclaimed: Math.max(toSafeNonNegativeInt(raw.totalBytesReclaimed), derivedBytes),
		totalFilesDeleted: Math.max(toSafeNonNegativeInt(raw.totalFilesDeleted), derivedFiles),
		totalGroupsResolved: Math.max(toSafeNonNegativeInt(raw.totalGroupsResolved), derivedGroups),
		entries: sanitizedEntries,
	}
}

/**
 * Safely load reclamation history from storage.
 *
 * @param {Storage|object|null|undefined} [storage] Storage instance (defaults to window.localStorage).
 * @param {object} [options] Storage key options.
 * @return {object} Sanitized history state.
 */
export function loadReclamationHistory(storage, options = {}) {
	try {
		const target = resolveStorage(storage)
		if (!target || typeof target.getItem !== 'function') {
			return createEmptyHistoryState()
		}
		const key = getReclamationHistoryStorageKey(options)
		const raw = target.getItem(key)
		if (typeof raw !== 'string' || raw.trim() === '') {
			return createEmptyHistoryState()
		}
		return sanitizeHistoryState(JSON.parse(raw))
	} catch (error) {
		return createEmptyHistoryState()
	}
}

/**
 * Safely persist reclamation history to storage.
 *
 * @param {Storage|object|null|undefined} storage Storage instance.
 * @param {object|null|undefined} state History state to save.
 * @param {object} [options] Storage key options.
 * @return {boolean} True when persisted successfully.
 */
export function saveReclamationHistory(storage, state, options = {}) {
	try {
		const target = resolveStorage(storage)
		if (!target || typeof target.setItem !== 'function') {
			return false
		}
		const sanitized = sanitizeHistoryState(state)
		const key = getReclamationHistoryStorageKey(options)
		target.setItem(key, JSON.stringify(sanitized))
		return true
	} catch (error) {
		return false
	}
}

/**
 * Clear persisted reclamation history and return a fresh empty state.
 *
 * @param {Storage|object|null|undefined} storage Storage instance.
 * @param {object} [options] Storage key options.
 * @return {object} Fresh empty state.
 */
export function clearReclamationHistory(storage, options = {}) {
	const empty = createEmptyHistoryState()
	saveReclamationHistory(storage, empty, options)
	return empty
}

/**
 * Classify a duplicate group into one of the tracked storage categories or 'other'.
 *
 * @param {object} duplicate Duplicate group object.
 * @return {string} Category identifier.
 */
function classifyDuplicateCategory(duplicate) {
	for (const category of TRACKED_CATEGORIES) {
		if (matchesDuplicateCategory(duplicate, category)) {
			return category
		}
	}
	return 'other'
}

/**
 * Compute a factual snapshot of the current duplicate backlog and category waste breakdown.
 *
 * @param {Array<object>|null|undefined} duplicates Loaded duplicate groups.
 * @param {object} [totals] Optional pagination totals.
 * @param {number} [totals.unacknowledgedCount] Total unacknowledged groups.
 * @param {number} [totals.acknowledgedCount] Total acknowledged groups.
 * @param {object|null} [scanStatus] Optional scan status object.
 * @return {object} Snapshot metrics and category breakdown.
 */
export function computeDuplicateBacklogSnapshot(duplicates, totals = {}, scanStatus = null) {
	const list = Array.isArray(duplicates) ? duplicates : []
	let loadedGroupCount = 0
	let reclaimableBytes = 0
	let redundantCopies = 0
	let loadedUnacknowledged = 0
	let loadedAcknowledged = 0
	const categoryMap = new Map()

	for (const duplicate of list) {
		const info = computeGroupReclaimableInfo(duplicate)
		if (!info.valid) {
			continue
		}
		loadedGroupCount += 1
		reclaimableBytes += info.reclaimableBytes
		redundantCopies += info.extraCopies
		if (duplicate.acknowledged) {
			loadedAcknowledged += 1
		} else {
			loadedUnacknowledged += 1
		}

		const category = classifyDuplicateCategory(duplicate)
		const current = categoryMap.get(category)
		if (current) {
			current.reclaimableBytes += info.reclaimableBytes
			current.groupCount += 1
		} else {
			categoryMap.set(category, {
				category,
				reclaimableBytes: info.reclaimableBytes,
				groupCount: 1,
			})
		}
	}

	const hasExplicitUnack = totals && Number.isFinite(Number(totals.unacknowledgedCount))
	const hasExplicitAck = totals && Number.isFinite(Number(totals.acknowledgedCount))
	const unacknowledgedCount = hasExplicitUnack
		? toSafeNonNegativeInt(totals.unacknowledgedCount)
		: loadedUnacknowledged
	const acknowledgedCount = hasExplicitAck
		? toSafeNonNegativeInt(totals.acknowledgedCount)
		: loadedAcknowledged
	const groupCount = (hasExplicitUnack || hasExplicitAck)
		? (unacknowledgedCount + acknowledgedCount)
		: loadedGroupCount

	const scannedFiles = scanStatus && typeof scanStatus === 'object'
		? toSafeNonNegativeInt(scanStatus.scannedFiles)
		: 0

	const categoryBreakdown = Array.from(categoryMap.values())
		.filter(item => item.reclaimableBytes > 0)
		.sort((a, b) => {
			if (b.reclaimableBytes !== a.reclaimableBytes) {
				return b.reclaimableBytes - a.reclaimableBytes
			}
			return b.groupCount - a.groupCount
		})
		.map(item => ({
			category: item.category,
			reclaimableBytes: item.reclaimableBytes,
			reclaimableFormatted: formatBytes(item.reclaimableBytes),
			groupCount: item.groupCount,
			sharePct: reclaimableBytes > 0
				? Math.max(1, Math.round((item.reclaimableBytes / reclaimableBytes) * 100))
				: 0,
		}))

	return {
		groupCount,
		loadedGroupCount,
		unacknowledgedCount,
		acknowledgedCount,
		reclaimableBytes,
		reclaimableFormatted: formatBytes(reclaimableBytes),
		redundantCopies,
		scannedFiles,
		categoryBreakdown,
	}
}

/**
 * Append a new scan snapshot entry to the history state, computing delta vs the prior scan.
 * Coalesces identical consecutive baseline/sync snapshots within a 15-minute window to avoid noise.
 *
 * @param {object} state Current history state.
 * @param {object} snapshot Backlog snapshot from computeDuplicateBacklogSnapshot.
 * @param {object} [options] Recording options.
 * @param {'manual'|'sync'|'baseline'} [options.trigger='manual'] What triggered this scan snapshot.
 * @param {number} [options.timestamp] Optional explicit epoch ms for deterministic tests.
 * @return {object} Updated sanitized history state.
 */
export function recordScanSnapshot(state, snapshot, options = {}) {
	const cleanState = sanitizeHistoryState(state)
	const safeSnapshot = snapshot && typeof snapshot === 'object' ? snapshot : {}
	const trigger = options && typeof options.trigger === 'string' && SCAN_TRIGGERS.includes(options.trigger)
		? options.trigger
		: 'manual'
	const timestamp = toSafeTimestamp(options && options.timestamp, Date.now())

	const groupCount = toSafeNonNegativeInt(safeSnapshot.groupCount)
	const unacknowledgedCount = toSafeNonNegativeInt(safeSnapshot.unacknowledgedCount)
	const acknowledgedCount = toSafeNonNegativeInt(safeSnapshot.acknowledgedCount)
	const reclaimableBytes = toSafeNonNegativeInt(safeSnapshot.reclaimableBytes)
	const redundantCopies = toSafeNonNegativeInt(safeSnapshot.redundantCopies)
	const scannedFiles = toSafeNonNegativeInt(safeSnapshot.scannedFiles)

	const previousScan = cleanState.entries.find(entry => entry.kind === 'scan') || null
	if (
		previousScan
		&& (trigger === 'baseline' || trigger === 'sync')
		&& previousScan.groupCount === groupCount
		&& previousScan.reclaimableBytes === reclaimableBytes
		&& previousScan.scannedFiles === scannedFiles
		&& Math.abs(timestamp - previousScan.timestamp) < BASELINE_DEDUP_WINDOW_MS
	) {
		return cleanState
	}

	// Avoid recording an empty baseline before any duplicates or scans exist unless explicit manual scan
	if (trigger === 'baseline' && !previousScan && groupCount === 0 && reclaimableBytes === 0 && scannedFiles === 0) {
		return cleanState
	}

	const deltaBytes = previousScan ? (reclaimableBytes - previousScan.reclaimableBytes) : null
	const deltaGroups = previousScan ? (groupCount - previousScan.groupCount) : null

	const entry = {
		id: createEntryId('scan', timestamp, cleanState.entries.length),
		kind: 'scan',
		timestamp,
		groupCount,
		unacknowledgedCount,
		acknowledgedCount,
		reclaimableBytes,
		redundantCopies,
		scannedFiles,
		deltaBytes,
		deltaGroups,
		trigger,
	}

	return sanitizeHistoryState({
		...cleanState,
		entries: [entry, ...cleanState.entries],
	})
}

/**
 * Record a completed file deletion batch into the reclamation timeline and cumulative totals.
 *
 * @param {object} state Current history state.
 * @param {object} batch Cleanup batch payload.
 * @param {number} [batch.bytesReclaimed] Freed bytes.
 * @param {number} [batch.filesDeleted] Deleted file count.
 * @param {number} [batch.groupsResolved] Number of duplicate groups resolved down to <=1 copy.
 * @param {'single'|'group'|'bulk'|'folder'} [batch.source='single'] Origin action.
 * @param {string} [batch.sampleLabel] Plain-text sample file or folder label.
 * @param {number} [batch.timestamp] Optional explicit epoch ms.
 * @return {object} Updated sanitized history state.
 */
export function recordCleanupBatch(state, batch) {
	const cleanState = sanitizeHistoryState(state)
	if (!batch || typeof batch !== 'object') {
		return cleanState
	}

	const filesDeleted = toSafeNonNegativeInt(batch.filesDeleted)
	const bytesReclaimed = toSafeNonNegativeInt(batch.bytesReclaimed)
	const groupsResolved = toSafeNonNegativeInt(batch.groupsResolved)
	if (filesDeleted === 0 && bytesReclaimed === 0) {
		return cleanState
	}

	const timestamp = toSafeTimestamp(batch.timestamp, Date.now())
	const source = typeof batch.source === 'string' && CLEANUP_SOURCES.includes(batch.source)
		? batch.source
		: 'single'

	const entry = {
		id: createEntryId('cleanup', timestamp, cleanState.entries.length),
		kind: 'cleanup',
		timestamp,
		bytesReclaimed,
		filesDeleted,
		groupsResolved,
		source,
		sampleLabel: sanitizeSampleLabel(batch.sampleLabel),
	}

	return sanitizeHistoryState({
		...cleanState,
		totalBytesReclaimed: cleanState.totalBytesReclaimed + bytesReclaimed,
		totalFilesDeleted: cleanState.totalFilesDeleted + filesDeleted,
		totalGroupsResolved: cleanState.totalGroupsResolved + groupsResolved,
		entries: [entry, ...cleanState.entries],
	})
}

/**
 * Filter timeline entries by kind ('all', 'cleanup', or 'scan') sorted newest first.
 *
 * @param {Array<object>|null|undefined} entries Timeline entries.
 * @param {'all'|'cleanup'|'scan'} [filterKind='all'] Active filter.
 * @return {Array<object>} Filtered entries sorted newest-first.
 */
export function filterHistoryEntries(entries, filterKind = 'all') {
	if (!Array.isArray(entries) || entries.length === 0) {
		return []
	}
	const validFilter = HISTORY_FILTER_KINDS.includes(filterKind) ? filterKind : 'all'
	return entries
		.filter(entry => entry && (validFilter === 'all' || entry.kind === validFilter))
		.slice()
		.sort((a, b) => b.timestamp - a.timestamp)
}

/**
 * Format a signed byte delta cleanly using ASCII +/- prefix and formatBytes.
 *
 * @param {number|null|undefined} deltaBytes Signed byte delta.
 * @return {string} Formatted delta (e.g. '-12.5 MB', '+4.0 MB', '0 B', or '').
 */
export function formatSignedBytesDelta(deltaBytes) {
	if (deltaBytes === null || deltaBytes === undefined) {
		return ''
	}
	const numeric = Number(deltaBytes)
	if (!Number.isFinite(numeric)) {
		return ''
	}
	if (numeric === 0) {
		return '0 B'
	}
	const prefix = numeric > 0 ? '+' : '-'
	return `${prefix}${formatBytes(Math.abs(numeric))}`
}

/**
 * Compute executive KPI summary metrics combining historical reclamation totals
 * with the live remaining duplicate backlog.
 *
 * @param {object|null|undefined} state History state.
 * @param {object|null|undefined} currentBacklog Current backlog snapshot.
 * @return {object} Aggregated KPI summary.
 */
export function computeReclamationSummary(state, currentBacklog = null) {
	const cleanState = sanitizeHistoryState(state)
	const remainingReclaimableBytes = currentBacklog && typeof currentBacklog === 'object'
		? toSafeNonNegativeInt(currentBacklog.reclaimableBytes)
		: 0
	const totalReclaimedBytes = cleanState.totalBytesReclaimed
	const totalTrackedBytes = totalReclaimedBytes + remainingReclaimableBytes
	const reclaimedPercent = totalTrackedBytes > 0
		? Math.min(100, Math.round((totalReclaimedBytes / totalTrackedBytes) * 100))
		: 0

	const scanEntries = cleanState.entries.filter(entry => entry.kind === 'scan')
	const cleanupEntries = cleanState.entries.filter(entry => entry.kind === 'cleanup')
	const latestScan = scanEntries[0] || null
	const lastScanDeltaBytes = latestScan && latestScan.deltaBytes !== null
		? latestScan.deltaBytes
		: null

	let lastScanDeltaDirection = 'none'
	if (lastScanDeltaBytes !== null) {
		if (lastScanDeltaBytes < 0) {
			lastScanDeltaDirection = 'improved'
		} else if (lastScanDeltaBytes > 0) {
			lastScanDeltaDirection = 'increased'
		} else {
			lastScanDeltaDirection = 'unchanged'
		}
	}

	return {
		totalReclaimedBytes,
		totalReclaimedFormatted: formatBytes(totalReclaimedBytes),
		totalFilesDeleted: cleanState.totalFilesDeleted,
		totalGroupsResolved: cleanState.totalGroupsResolved,
		remainingReclaimableBytes,
		remainingReclaimableFormatted: formatBytes(remainingReclaimableBytes),
		totalTrackedBytes,
		totalTrackedFormatted: formatBytes(totalTrackedBytes),
		reclaimedPercent,
		scanCount: scanEntries.length,
		cleanupCount: cleanupEntries.length,
		lastScanDeltaBytes,
		lastScanDeltaFormatted: formatSignedBytesDelta(lastScanDeltaBytes),
		lastScanDeltaDirection,
		latestScanTimestamp: latestScan ? latestScan.timestamp : null,
	}
}

/**
 * Build a structured JSON export payload for scan history and reclamation metrics.
 *
 * @param {object|null|undefined} state History state.
 * @param {object|null|undefined} currentBacklog Current backlog snapshot.
 * @return {object} Structured export payload.
 */
export function buildReclamationExportPayload(state, currentBacklog = null) {
	const cleanState = sanitizeHistoryState(state)
	const summary = computeReclamationSummary(cleanState, currentBacklog)
	return {
		schemaVersion: 1,
		exportedAt: new Date().toISOString(),
		summary,
		currentBacklog: currentBacklog || null,
		entries: cleanState.entries,
	}
}

/**
 * Trigger a browser JSON file download of the reclamation history report.
 *
 * @param {object|null|undefined} state History state.
 * @param {object|null|undefined} currentBacklog Current backlog snapshot.
 * @param {string} [filename='duplicatefinder-reclamation-history.json'] Target filename.
 * @return {boolean} True when download was triggered safely.
 */
export function downloadReclamationHistoryJson(
	state,
	currentBacklog = null,
	filename = 'duplicatefinder-reclamation-history.json'
) {
	try {
		if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
			return false
		}
		const payload = buildReclamationExportPayload(state, currentBacklog)
		const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
		const objectUrl = URL.createObjectURL(blob)
		const link = document.createElement('a')
		link.href = objectUrl
		link.setAttribute('download', filename)
		link.style.display = 'none'
		document.body.appendChild(link)
		link.click()
		document.body.removeChild(link)
		if (typeof URL.revokeObjectURL === 'function') {
			URL.revokeObjectURL(objectUrl)
		}
		return true
	} catch (error) {
		return false
	}
}
