/**
 * Pure File Retention Age, Cold-Storage & Stale Artifact Pruner helpers.
 * Inspired by TreeSize Pro File Age Distribution, WizTree, Czkawka Big/Old Files,
 * and Nextcloud Storage Retention policies.
 * Zero DOM dependencies, zero network side effects, CWE-1236-safe CSV export.
 */

import { extractFileExtension } from './duplicateFilters'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { formatBytes } from './duplicateStats'
import { normalizePathForDiff } from './duplicatePathDiff'

export const RETENTION_REPORT_SCHEMA = 'duplicatefinder.retention-audit.v1'
export const RETENTION_STORAGE_KEY = 'duplicatefinder_retention_policy_v1'
export const DEFAULT_RETENTION_DAYS = 180
export const MAX_RETENTION_DAYS = 36500
export const MS_PER_DAY = 86400000

export const RETENTION_PRESET_DAYS = Object.freeze([30, 90, 180, 365, 730, 1095])

export const RETENTION_POLICIES = Object.freeze([
	'stale-redundant',
	'stale-artifacts',
	'cold-archives',
])

export const RETENTION_FILTERS = Object.freeze([
	'all',
	'prune-recommended',
	'cold-plus',
	'stale-installers',
	'build-caches',
	'stale-backups',
	'protected',
	'unknown-age',
])

export const RETENTION_SORTS = Object.freeze([
	'roi_desc',
	'age_desc',
	'size_desc',
	'group_span_desc',
	'name_asc',
])

export const AGE_TIER_DEFINITIONS = Object.freeze([
	{ id: 'fresh', minDays: 0, maxDays: 7, order: 0, severity: 'ok' },
	{ id: 'recent', minDays: 7, maxDays: 30, order: 1, severity: 'ok' },
	{ id: 'quarter', minDays: 30, maxDays: 90, order: 2, severity: 'info' },
	{ id: 'aging', minDays: 90, maxDays: 365, order: 3, severity: 'medium' },
	{ id: 'cold', minDays: 365, maxDays: 1095, order: 4, severity: 'high' },
	{ id: 'ancient', minDays: 1095, maxDays: Number.POSITIVE_INFINITY, order: 5, severity: 'critical' },
	{ id: 'unknown', minDays: null, maxDays: null, order: 6, severity: 'info' },
])

const INSTALLER_IMAGE_EXTS = new Set([
	'dmg',
	'pkg',
	'exe',
	'msi',
	'msix',
	'cab',
	'iso',
	'img',
	'deb',
	'rpm',
	'appimage',
	'apk',
	'ipa',
	'snap',
	'flatpak',
	'vhd',
	'vhdx',
	'vmdk',
	'ova',
])

const BACKUP_SNAPSHOT_EXTS = new Set([
	'bak',
	'old',
	'orig',
	'sql',
	'dump',
	'dmp',
	'swp',
	'swo',
])

const BUILD_CACHE_SEGMENTS = new Set([
	'node_modules',
	'.cache',
	'__pycache__',
	'.venv',
	'venv',
	'target',
	'dist',
	'build',
	'.gradle',
	'.m2',
	'.cargo',
	'.terraform',
	'.pytest_cache',
	'.next',
	'.nuxt',
	'.parcel-cache',
	'.turbo',
	'obj',
	'bin',
	'vendor',
])

const BACKUP_NAME_HINT_RE = /(?:^|[\s._/-])(backup|snapshot|archive|export|dump|autosave)(?:[\s._/-]|\d|$)/i

/**
 * Clamp and normalize a retention threshold in days.
 *
 * @param {number|string|null|undefined} rawDays - Candidate retention days.
 * @return {number} Positive integer day threshold.
 */
export function normalizeRetentionDays(rawDays) {
	const numeric = Number(rawDays)
	if (!Number.isFinite(numeric) || numeric < 1) {
		return DEFAULT_RETENTION_DAYS
	}
	return Math.min(MAX_RETENTION_DAYS, Math.max(1, Math.round(numeric)))
}

/**
 * Normalize a timestamp input (Unix seconds, JS ms, Date, or ISO string) into milliseconds.
 *
 * @param {*} value - Candidate timestamp field.
 * @return {number|null} Timestamp in milliseconds or null when missing/invalid.
 */
export function normalizeTimestampToMs(value) {
	if (value === null || value === undefined || value === '') {
		return null
	}
	if (value instanceof Date) {
		const ms = value.getTime()
		return Number.isFinite(ms) && ms > 0 ? ms : null
	}
	if (typeof value === 'number') {
		if (!Number.isFinite(value) || value <= 0) {
			return null
		}
		// Values below 1e11 represent Unix epoch seconds (valid until year 5138)
		return value < 100000000000 ? Math.round(value * 1000) : Math.round(value)
	}
	if (typeof value === 'string') {
		const trimmed = value.trim()
		if (!trimmed) {
			return null
		}
		if (/^\d+(\.\d+)?$/.test(trimmed)) {
			const numeric = Number(trimmed)
			if (!Number.isFinite(numeric) || numeric <= 0) {
				return null
			}
			return numeric < 100000000000 ? Math.round(numeric * 1000) : Math.round(numeric)
		}
		const parsed = Date.parse(trimmed)
		return Number.isFinite(parsed) && parsed > 0 ? parsed : null
	}
	return null
}

/**
 * Extract modification timestamp in milliseconds from a duplicate file entry.
 *
 * @param {object|null|undefined} file - Duplicate file entry.
 * @return {number|null} Timestamp in milliseconds or null when unavailable.
 */
export function extractFileMtimeMs(file) {
	if (!file || typeof file !== 'object') {
		return null
	}
	for (const field of ['mtime', 'modified', 'updatedAt', 'lastModified']) {
		if (Object.prototype.hasOwnProperty.call(file, field)) {
			const ms = normalizeTimestampToMs(file[field])
			if (ms !== null) {
				return ms
			}
		}
	}
	return null
}

/**
 * Resolve a stable unique file key within the retention catalog.
 *
 * @param {object|null|undefined} file - Duplicate file entry.
 * @return {string} Stable key or empty string.
 */
export function resolveRetentionFileKey(file) {
	const key = getFileSelectionKey(file)
	if (key === null || key === undefined || key === '') {
		return ''
	}
	return String(key)
}

/**
 * Extract normalized basename and parent folder from a file entry.
 *
 * @param {object|null|undefined} file - File object.
 * @return {{ name: string, folder: string, path: string, segments: string[] }} Path metadata.
 */
function extractPathDetails(file) {
	const rawPath = (file && typeof file.path === 'string' ? file.path : '')
		|| (file && typeof file.name === 'string' ? file.name : '')
	const normalized = normalizePathForDiff(rawPath) || rawPath.trim().replace(/\\/g, '/')
	const cleaned = normalized ? (normalized.startsWith('/') ? normalized : `/${normalized}`) : ''
	const lastSlash = cleaned.lastIndexOf('/')
	const nameFromPath = lastSlash >= 0 ? cleaned.slice(lastSlash + 1) : cleaned
	const name = (file && typeof file.name === 'string' && file.name.trim()) ? file.name.trim() : nameFromPath
	const folder = lastSlash > 0 ? cleaned.slice(0, lastSlash) : '/'
	const segments = cleaned
		? cleaned.split('/').filter(Boolean).slice(0, -1).map(seg => seg.toLowerCase())
		: []

	return {
		name: name || 'unknown',
		folder,
		path: cleaned || name || '',
		segments,
	}
}

/**
 * Classify a file's age in days into a TreeSize-style age tier.
 *
 * @param {number|null} ageDays - File age in days, or null when unknown.
 * @return {{ id: string, order: number, severity: string }} Age tier descriptor.
 */
export function classifyAgeTier(ageDays) {
	if (ageDays === null || ageDays === undefined || !Number.isFinite(Number(ageDays)) || Number(ageDays) < 0) {
		return AGE_TIER_DEFINITIONS[AGE_TIER_DEFINITIONS.length - 1]
	}
	const days = Number(ageDays)
	for (const tier of AGE_TIER_DEFINITIONS) {
		if (tier.minDays !== null && days >= tier.minDays && days < tier.maxDays) {
			return tier
		}
	}
	return AGE_TIER_DEFINITIONS[AGE_TIER_DEFINITIONS.length - 1]
}

/**
 * Format an age in days into a concise human-readable duration label.
 *
 * @param {number|null} ageDays - Age in days.
 * @return {string} Formatted duration label (e.g. '420d (1.2y)', '14d', 'Unknown').
 */
export function formatAgeDuration(ageDays) {
	if (ageDays === null || ageDays === undefined || !Number.isFinite(Number(ageDays)) || Number(ageDays) < 0) {
		return 'Unknown'
	}
	const days = Math.floor(Number(ageDays))
	if (days === 0) {
		return 'Today'
	}
	if (days < 30) {
		return `${days}d`
	}
	if (days < 365) {
		const months = Math.floor(days / 30)
		return `${days}d (${months}mo)`
	}
	const years = (days / 365).toFixed(1)
	return `${days}d (${years}y)`
}

/**
 * Classify whether a file represents a stale disposable artifact (installer/ISO, build cache, backup).
 *
 * @param {string|null|undefined} filePath - File path.
 * @param {string|null|undefined} fileName - File basename.
 * @return {{
 *   kind: 'installer-image'|'build-cache'|'backup-snapshot'|'standard',
 *   isDisposableArtifact: boolean,
 *   weight: number,
 *   matchedToken: string
 * }} Artifact classification.
 */
export function classifyStaleArtifact(filePath, fileName = '') {
	const targetName = String(fileName || filePath || '').trim()
	const normalizedPath = String(filePath || '').replace(/\\/g, '/')
	const ext = extractFileExtension(targetName || normalizedPath).replace(/^\./, '').toLowerCase()

	const segments = normalizedPath.split('/').filter(Boolean).slice(0, -1)
	for (const seg of segments) {
		const lowerSeg = seg.toLowerCase()
		if (BUILD_CACHE_SEGMENTS.has(lowerSeg)) {
			return {
				kind: 'build-cache',
				isDisposableArtifact: true,
				weight: 1.45,
				matchedToken: lowerSeg,
			}
		}
	}

	if (ext && INSTALLER_IMAGE_EXTS.has(ext)) {
		return {
			kind: 'installer-image',
			isDisposableArtifact: true,
			weight: 1.6,
			matchedToken: `.${ext}`,
		}
	}

	if ((ext && BACKUP_SNAPSHOT_EXTS.has(ext)) || BACKUP_NAME_HINT_RE.test(targetName)) {
		return {
			kind: 'backup-snapshot',
			isDisposableArtifact: true,
			weight: 1.3,
			matchedToken: ext ? `.${ext}` : 'backup-name',
		}
	}

	return {
		kind: 'standard',
		isDisposableArtifact: false,
		weight: 1.0,
		matchedToken: '',
	}
}

/**
 * Compute a deterministic Cold-Storage ROI score (0 to 100) prioritizing large, old, disposable copies.
 *
 * @param {object} params - Scoring inputs.
 * @param {number} params.sizeBytes - File size in bytes.
 * @param {number|null} params.ageDays - Age in days.
 * @param {number} params.retentionDays - Active retention threshold in days.
 * @param {number} params.artifactWeight - Disposable artifact weight multiplier.
 * @param {boolean} params.isPruneCandidate - Whether file qualifies as a safe prune candidate.
 * @return {number} Integer score from 0 to 100.
 */
export function computeColdRoiScore({
	sizeBytes = 0,
	ageDays = null,
	retentionDays = DEFAULT_RETENTION_DAYS,
	artifactWeight = 1.0,
	isPruneCandidate = false,
}) {
	if (ageDays === null || ageDays === undefined || !Number.isFinite(Number(ageDays))) {
		return Math.min(35, Math.round(Math.log10(Math.max(1, sizeBytes)) * 3 * artifactWeight))
	}
	const sizeFactor = Math.min(45, Math.log10(Math.max(1024, sizeBytes) / 1024 + 1) * 9)
	const ageFactor = Math.min(45, (Math.max(0, ageDays) / Math.max(30, retentionDays)) * 22)
	const candidateBonus = isPruneCandidate ? 12 : 0
	const raw = (sizeFactor + ageFactor + candidateBonus) * artifactWeight
	return Math.max(0, Math.min(100, Math.round(raw)))
}

/**
 * Evaluate retention policy verdicts for all files inside a single duplicate group.
 * Guarantees at least one survivor copy in every group unless allowLastCopyArtifact is enabled
 * for disposable artifacts.
 *
 * @param {object} group - Duplicate group object.
 * @param {object} [options] - Policy options.
 * @param {number} [options.referenceTimeMs=Date.now()] - Reference epoch time in ms.
 * @param {number} [options.retentionDays=DEFAULT_RETENTION_DAYS] - Retention cutoff in days.
 * @param {'stale-redundant'|'stale-artifacts'|'cold-archives'} [options.policyMode='stale-redundant'] - Policy mode.
 * @param {boolean} [options.allowLastCopyArtifact=false] - Allow pruning last copy when classified as disposable artifact.
 * @return {object} Group evaluation with annotated file entries and group lineage stats.
 */
export function evaluateGroupRetention(group, options = {}) {
	const files = Array.isArray(group && group.files)
		? group.files.filter(f => f && typeof f === 'object')
		: []
	const referenceTimeMs = Number.isFinite(Number(options.referenceTimeMs))
		? Number(options.referenceTimeMs)
		: Date.now()
	const retentionDays = normalizeRetentionDays(options.retentionDays)
	const policyMode = RETENTION_POLICIES.includes(options.policyMode)
		? options.policyMode
		: 'stale-redundant'
	const allowLastCopyArtifact = Boolean(options.allowLastCopyArtifact)

	let newestMtimeMs = Number.NEGATIVE_INFINITY
	let oldestMtimeMs = Number.POSITIVE_INFINITY
	let newestKey = ''
	let timestampedCount = 0

	const prelim = files.map((file, index) => {
		const key = resolveRetentionFileKey(file) || `group-${group?.id ?? 'x'}-file-${index}`
		const pathInfo = extractPathDetails(file)
		const mtimeMs = extractFileMtimeMs(file)
		const size = Math.max(0, Number(file.size) || 0)
		const isProtectedOrigin = Boolean(file.isInOriginFolder)
		const isLocked = Boolean(file.locked || file.isLocked)

		if (mtimeMs !== null) {
			timestampedCount += 1
			if (mtimeMs > newestMtimeMs) {
				newestMtimeMs = mtimeMs
				newestKey = key
			}
			if (mtimeMs < oldestMtimeMs) {
				oldestMtimeMs = mtimeMs
			}
		}

		const rawAgeDays = mtimeMs !== null ? Math.max(0, (referenceTimeMs - mtimeMs) / MS_PER_DAY) : null
		const ageDays = rawAgeDays !== null ? Math.floor(rawAgeDays) : null
		const ageTier = classifyAgeTier(ageDays)
		const artifact = classifyStaleArtifact(pathInfo.path, pathInfo.name)

		return {
			key,
			file,
			index,
			name: pathInfo.name,
			folder: pathInfo.folder,
			path: pathInfo.path,
			size,
			sizeFormatted: formatBytes(size),
			mtimeMs,
			mtimeIso: mtimeMs !== null ? new Date(mtimeMs).toISOString() : '',
			ageDays,
			ageFormatted: formatAgeDuration(ageDays),
			ageTier,
			artifact,
			isProtectedOrigin,
			isLocked,
		}
	})

	const hasSpan = timestampedCount >= 2 && newestMtimeMs > oldestMtimeMs
	const spanDays = hasSpan ? Math.floor((newestMtimeMs - oldestMtimeMs) / MS_PER_DAY) : 0
	const protectedSurvivors = prelim.filter(entry => entry.isProtectedOrigin || entry.isLocked)

	// Ensure a designated survivor when no origin/locked copy exists: keep newest, or first file if no mtime
	const fallbackSurvivorKey = protectedSurvivors.length > 0
		? ''
		: (newestKey || (prelim[0] ? prelim[0].key : ''))

	let pruneCandidateCount = 0

	const evaluatedFiles = prelim.map(entry => {
		const isNewestInGroup = Boolean(newestKey && entry.key === newestKey && timestampedCount >= 2)
		const isDesignatedSurvivor = entry.key === fallbackSurvivorKey
		const effectiveCutoffDays = policyMode === 'cold-archives'
			? Math.max(retentionDays, 365)
			: retentionDays
		const meetsAgeCutoff = entry.ageDays !== null && entry.ageDays >= effectiveCutoffDays

		let verdict = 'below-threshold'
		let pruneRecommended = false
		let deletable = true
		let verdictReason = 'Within active retention window'

		if (entry.isProtectedOrigin) {
			verdict = 'protected-origin'
			deletable = false
			verdictReason = 'Protected origin folder copy'
		} else if (entry.isLocked) {
			verdict = 'protected-locked'
			deletable = false
			verdictReason = 'File is locked against deletion'
		} else if (isDesignatedSurvivor) {
			verdict = isNewestInGroup ? 'keep-newest' : 'keep-survivor'
			deletable = allowLastCopyArtifact && entry.artifact.isDisposableArtifact && meetsAgeCutoff
			verdictReason = isNewestInGroup
				? 'Newest copy in duplicate group (golden survivor)'
				: 'Designated survivor copy in group'
			if (deletable && policyMode === 'stale-artifacts') {
				verdict = 'prune-recommended'
				pruneRecommended = true
				verdictReason = `Disposable ${entry.artifact.kind} past ${effectiveCutoffDays}d cutoff`
			}
		} else if (entry.ageDays === null) {
			if (policyMode === 'stale-artifacts' && entry.artifact.isDisposableArtifact) {
				verdict = 'prune-recommended'
				pruneRecommended = true
				verdictReason = `Disposable ${entry.artifact.kind} with redundant survivor`
			} else {
				verdict = 'unknown-age'
				verdictReason = 'Missing modification timestamp'
			}
		} else if (policyMode === 'stale-artifacts') {
			if (entry.artifact.isDisposableArtifact && meetsAgeCutoff) {
				verdict = 'prune-recommended'
				pruneRecommended = true
				verdictReason = `Stale ${entry.artifact.kind} (${entry.ageDays}d >= ${effectiveCutoffDays}d)`
			} else if (meetsAgeCutoff && files.length > 1) {
				verdict = 'prune-recommended'
				pruneRecommended = true
				verdictReason = `Redundant copy older than ${effectiveCutoffDays}d`
			} else {
				verdict = 'below-threshold'
				verdictReason = `Age ${entry.ageDays}d below ${effectiveCutoffDays}d cutoff`
			}
		} else if (policyMode === 'cold-archives') {
			if (meetsAgeCutoff && files.length > 1) {
				verdict = 'prune-recommended'
				pruneRecommended = true
				verdictReason = `Cold copy (${entry.ageDays}d >= ${effectiveCutoffDays}d)`
			} else {
				verdict = 'below-threshold'
				verdictReason = `Age ${entry.ageDays}d below ${effectiveCutoffDays}d cold threshold`
			}
		} else if (meetsAgeCutoff && files.length > 1) {
			verdict = 'prune-recommended'
			pruneRecommended = true
			verdictReason = `Redundant copy aged ${entry.ageDays}d (>= ${effectiveCutoffDays}d)`
		} else {
			verdict = 'below-threshold'
			verdictReason = `Age ${entry.ageDays}d below ${effectiveCutoffDays}d cutoff`
		}

		// Prevent pruning every copy in a group unless allowLastCopyArtifact is enabled
		if (pruneRecommended && pruneCandidateCount >= files.length - 1 && !allowLastCopyArtifact) {
			pruneRecommended = false
			verdict = 'keep-survivor'
			verdictReason = 'Preserved to prevent deleting last copy'
		}

		if (pruneRecommended) {
			pruneCandidateCount += 1
		}

		const coldRoiScore = computeColdRoiScore({
			sizeBytes: entry.size,
			ageDays: entry.ageDays,
			retentionDays: effectiveCutoffDays,
			artifactWeight: entry.artifact.weight,
			isPruneCandidate: pruneRecommended,
		})

		return {
			...entry,
			groupId: group?.id ?? null,
			groupHash: typeof group?.hash === 'string' ? group.hash : '',
			groupFileCount: files.length,
			groupSpanDays: spanDays,
			isNewestInGroup,
			hasNewerSibling: Boolean(newestKey && entry.key !== newestKey && timestampedCount >= 2),
			hasProtectedSurvivor: protectedSurvivors.length > 0 || Boolean(fallbackSurvivorKey && entry.key !== fallbackSurvivorKey),
			verdict,
			verdictReason,
			pruneRecommended,
			deletable,
			coldRoiScore,
		}
	})

	return {
		groupId: group?.id ?? null,
		groupHash: typeof group?.hash === 'string' ? group.hash : '',
		spanDays,
		newestMtimeMs: Number.isFinite(newestMtimeMs) ? newestMtimeMs : null,
		oldestMtimeMs: Number.isFinite(oldestMtimeMs) ? oldestMtimeMs : null,
		files: evaluatedFiles,
	}
}

/**
 * Filter a retention item against the active category/verdict filter and search query.
 *
 * @param {object} item - Evaluated retention item.
 * @param {string} filter - Active filter ID.
 * @param {string} searchLower - Lowercase search string.
 * @return {boolean} True when item matches.
 */
function matchesRetentionFilter(item, filter, searchLower) {
	if (searchLower) {
		const haystack = `${item.name} ${item.path} ${item.folder} ${item.artifact.matchedToken} ${item.verdictReason}`.toLowerCase()
		if (!haystack.includes(searchLower)) {
			return false
		}
	}

	switch (filter) {
	case 'prune-recommended':
		return item.pruneRecommended
	case 'cold-plus':
		return item.ageTier.id === 'cold' || item.ageTier.id === 'ancient'
	case 'stale-installers':
		return item.artifact.kind === 'installer-image'
	case 'build-caches':
		return item.artifact.kind === 'build-cache'
	case 'stale-backups':
		return item.artifact.kind === 'backup-snapshot'
	case 'protected':
		return item.isProtectedOrigin || item.isLocked || item.verdict === 'keep-newest' || item.verdict === 'keep-survivor'
	case 'unknown-age':
		return item.ageDays === null
	case 'all':
	default:
		return true
	}
}

/**
 * Compare two retention items deterministically by the selected sort mode.
 *
 * @param {object} a - First item.
 * @param {object} b - Second item.
 * @param {string} sortBy - Sort mode identifier.
 * @return {number} Comparator sign.
 */
function compareRetentionItems(a, b, sortBy) {
	if (sortBy === 'age_desc') {
		const ageA = a.ageDays === null ? -1 : a.ageDays
		const ageB = b.ageDays === null ? -1 : b.ageDays
		if (ageB !== ageA) {
			return ageB - ageA
		}
	} else if (sortBy === 'size_desc') {
		if (b.size !== a.size) {
			return b.size - a.size
		}
	} else if (sortBy === 'group_span_desc') {
		if (b.groupSpanDays !== a.groupSpanDays) {
			return b.groupSpanDays - a.groupSpanDays
		}
	} else if (sortBy === 'name_asc') {
		const cmp = a.name.localeCompare(b.name)
		if (cmp !== 0) {
			return cmp
		}
	}

	// Default and tie-breaker: Cold-Storage ROI descending, then size, then path
	if (b.coldRoiScore !== a.coldRoiScore) {
		return b.coldRoiScore - a.coldRoiScore
	}
	if (b.size !== a.size) {
		return b.size - a.size
	}
	return a.path.localeCompare(b.path)
}

/**
 * Build the complete Retention Age, Cold-Storage & Stale Artifact catalog from duplicate groups.
 *
 * @param {Array<object>} duplicates - Duplicate group array.
 * @param {object} [options] - Catalog configuration.
 * @param {number} [options.referenceTimeMs=Date.now()] - Reference timestamp in ms.
 * @param {number} [options.retentionDays=DEFAULT_RETENTION_DAYS] - Retention cutoff in days.
 * @param {string} [options.policyMode='stale-redundant'] - Policy mode.
 * @param {boolean} [options.allowLastCopyArtifact=false] - Allow pruning last copy for disposable artifacts.
 * @param {string} [options.filter='all'] - Active filter ID.
 * @param {string} [options.ageTierFilter='all'] - Optional age tier ID filter from chart click.
 * @param {string} [options.folderFilter=''] - Optional parent folder filter from leaderboard click.
 * @param {string} [options.sortBy='roi_desc'] - Active sort mode.
 * @param {string} [options.searchQuery=''] - Search query string.
 * @return {object} Retention catalog with items, ageDistribution, folderLeaderboard, and summary.
 */
export function buildRetentionCatalog(duplicates, options = {}) {
	const groups = Array.isArray(duplicates) ? duplicates.filter(g => g && typeof g === 'object') : []
	const filter = RETENTION_FILTERS.includes(options.filter) ? options.filter : 'all'
	const ageTierFilter = typeof options.ageTierFilter === 'string' && options.ageTierFilter.trim()
		? options.ageTierFilter.trim()
		: 'all'
	const folderFilter = typeof options.folderFilter === 'string' ? options.folderFilter.trim() : ''
	const sortBy = RETENTION_SORTS.includes(options.sortBy) ? options.sortBy : 'roi_desc'
	const searchLower = typeof options.searchQuery === 'string' ? options.searchQuery.trim().toLowerCase() : ''

	const allItems = []
	const tierMap = new Map()
	for (const def of AGE_TIER_DEFINITIONS) {
		tierMap.set(def.id, {
			id: def.id,
			order: def.order,
			severity: def.severity,
			count: 0,
			bytes: 0,
			pruneCandidateCount: 0,
			pruneCandidateBytes: 0,
		})
	}

	const folderMap = new Map()
	let totalBytes = 0
	let staleCandidateCount = 0
	let staleCandidateBytes = 0
	let coldFileCount = 0
	let coldBytes = 0
	let installerCount = 0
	let installerBytes = 0
	let cacheCount = 0
	let cacheBytes = 0
	let backupCount = 0
	let backupBytes = 0
	let unknownAgeCount = 0
	let ageSum = 0
	let ageCount = 0
	let oldestAgeDays = null

	for (const group of groups) {
		const evaluatedGroup = evaluateGroupRetention(group, options)
		const siblingsSummary = evaluatedGroup.files.map(entry => ({
			key: entry.key,
			name: entry.name,
			path: entry.path,
			sizeFormatted: entry.sizeFormatted,
			ageDays: entry.ageDays,
			ageFormatted: entry.ageFormatted,
			mtimeIso: entry.mtimeIso,
			verdict: entry.verdict,
			isProtected: entry.isProtectedOrigin || entry.isLocked,
			isNewestInGroup: entry.isNewestInGroup,
			pruneRecommended: entry.pruneRecommended,
		}))

		for (const entry of evaluatedGroup.files) {
			const item = {
				...entry,
				siblings: siblingsSummary.map(sib => ({
					...sib,
					isCurrent: sib.key === entry.key,
				})),
			}
			allItems.push(item)
			totalBytes += item.size

			const tierBucket = tierMap.get(item.ageTier.id)
			if (tierBucket) {
				tierBucket.count += 1
				tierBucket.bytes += item.size
				if (item.pruneRecommended) {
					tierBucket.pruneCandidateCount += 1
					tierBucket.pruneCandidateBytes += item.size
				}
			}

			if (item.pruneRecommended) {
				staleCandidateCount += 1
				staleCandidateBytes += item.size
			}
			if (item.ageTier.id === 'cold' || item.ageTier.id === 'ancient') {
				coldFileCount += 1
				coldBytes += item.size
			}
			if (item.artifact.kind === 'installer-image') {
				installerCount += 1
				installerBytes += item.size
			} else if (item.artifact.kind === 'build-cache') {
				cacheCount += 1
				cacheBytes += item.size
			} else if (item.artifact.kind === 'backup-snapshot') {
				backupCount += 1
				backupBytes += item.size
			}

			if (item.ageDays === null) {
				unknownAgeCount += 1
			} else {
				ageSum += item.ageDays
				ageCount += 1
				if (oldestAgeDays === null || item.ageDays > oldestAgeDays) {
					oldestAgeDays = item.ageDays
				}
			}

			const folderKey = item.folder || '/'
			if (!folderMap.has(folderKey)) {
				folderMap.set(folderKey, {
					folder: folderKey,
					fileCount: 0,
					totalBytes: 0,
					staleBytes: 0,
					pruneCount: 0,
					oldestAgeDays: null,
				})
			}
			const fStats = folderMap.get(folderKey)
			fStats.fileCount += 1
			fStats.totalBytes += item.size
			if (item.pruneRecommended) {
				fStats.staleBytes += item.size
				fStats.pruneCount += 1
			}
			if (item.ageDays !== null && (fStats.oldestAgeDays === null || item.ageDays > fStats.oldestAgeDays)) {
				fStats.oldestAgeDays = item.ageDays
			}
		}
	}

	const ageDistribution = Array.from(tierMap.values())
		.sort((a, b) => a.order - b.order)
		.map(bucket => ({
			...bucket,
			bytesFormatted: formatBytes(bucket.bytes),
			pruneCandidateBytesFormatted: formatBytes(bucket.pruneCandidateBytes),
			sharePct: totalBytes > 0 ? Math.round((bucket.bytes / totalBytes) * 100) : 0,
		}))

	const folderLeaderboard = Array.from(folderMap.values())
		.sort((a, b) => {
			if (b.staleBytes !== a.staleBytes) {
				return b.staleBytes - a.staleBytes
			}
			if (b.totalBytes !== a.totalBytes) {
				return b.totalBytes - a.totalBytes
			}
			return a.folder.localeCompare(b.folder)
		})
		.slice(0, 8)
		.map(entry => ({
			...entry,
			totalBytesFormatted: formatBytes(entry.totalBytes),
			staleBytesFormatted: formatBytes(entry.staleBytes),
			oldestAgeFormatted: formatAgeDuration(entry.oldestAgeDays),
		}))

	const filteredItems = allItems
		.filter(item => {
			if (!matchesRetentionFilter(item, filter, searchLower)) {
				return false
			}
			if (ageTierFilter !== 'all' && item.ageTier.id !== ageTierFilter) {
				return false
			}
			if (folderFilter && item.folder !== folderFilter) {
				return false
			}
			return true
		})
		.sort((a, b) => compareRetentionItems(a, b, sortBy))

	const retentionDays = normalizeRetentionDays(options.retentionDays)

	return {
		items: filteredItems,
		allItems,
		ageDistribution,
		folderLeaderboard,
		summary: {
			retentionDays,
			totalFiles: allItems.length,
			filteredFiles: filteredItems.length,
			totalBytes,
			totalBytesFormatted: formatBytes(totalBytes),
			staleCandidateCount,
			staleCandidateBytes,
			staleCandidateBytesFormatted: formatBytes(staleCandidateBytes),
			coldFileCount,
			coldBytes,
			coldBytesFormatted: formatBytes(coldBytes),
			installerCount,
			installerBytes,
			installerBytesFormatted: formatBytes(installerBytes),
			cacheCount,
			cacheBytes,
			cacheBytesFormatted: formatBytes(cacheBytes),
			backupCount,
			backupBytes,
			backupBytesFormatted: formatBytes(backupBytes),
			unknownAgeCount,
			averageAgeDays: ageCount > 0 ? Math.round(ageSum / ageCount) : null,
			oldestAgeDays,
			oldestAgeFormatted: formatAgeDuration(oldestAgeDays),
		},
	}
}

/**
 * Select safe prune-recommended keys from a built retention catalog.
 *
 * @param {object} catalog - Output from buildRetentionCatalog.
 * @param {object} [options] - Selection options.
 * @param {boolean} [options.visibleOnly=false] - Only select from currently filtered items.
 * @return {string[]} Array of stable file keys safe to stage for deletion.
 */
export function selectPolicyPruneKeys(catalog, options = {}) {
	if (!catalog || typeof catalog !== 'object') {
		return []
	}
	const pool = options.visibleOnly
		? (Array.isArray(catalog.items) ? catalog.items : [])
		: (Array.isArray(catalog.allItems) ? catalog.allItems : [])
	return pool
		.filter(item => item && item.pruneRecommended && item.deletable)
		.map(item => item.key)
}

/**
 * Load persisted retention policy preferences safely from localStorage.
 *
 * @return {{ retentionDays: number, policyMode: string }} Stored policy settings.
 */
export function loadRetentionPreferences() {
	const defaults = {
		retentionDays: DEFAULT_RETENTION_DAYS,
		policyMode: 'stale-redundant',
	}
	if (typeof localStorage === 'undefined') {
		return defaults
	}
	try {
		const raw = localStorage.getItem(RETENTION_STORAGE_KEY)
		if (!raw) {
			return defaults
		}
		const parsed = JSON.parse(raw)
		if (!parsed || typeof parsed !== 'object') {
			return defaults
		}
		return {
			retentionDays: normalizeRetentionDays(parsed.retentionDays),
			policyMode: RETENTION_POLICIES.includes(parsed.policyMode) ? parsed.policyMode : 'stale-redundant',
		}
	} catch (error) {
		return defaults
	}
}

/**
 * Persist retention policy preferences safely to localStorage.
 *
 * @param {{ retentionDays: number, policyMode: string }} prefs - Preferences to persist.
 */
export function saveRetentionPreferences(prefs) {
	if (typeof localStorage === 'undefined' || !prefs || typeof prefs !== 'object') {
		return
	}
	try {
		const payload = {
			retentionDays: normalizeRetentionDays(prefs.retentionDays),
			policyMode: RETENTION_POLICIES.includes(prefs.policyMode) ? prefs.policyMode : 'stale-redundant',
		}
		localStorage.setItem(RETENTION_STORAGE_KEY, JSON.stringify(payload))
	} catch (error) {
		// Ignore quota or disabled storage errors
	}
}

/**
 * Export retention catalog findings as CWE-1236-safe RFC 4180 CSV.
 *
 * @param {object} catalog - Retention catalog from buildRetentionCatalog.
 * @return {string} Safe CSV payload.
 */
export function exportRetentionCsv(catalog) {
	const headers = [
		'group_id',
		'group_hash',
		'file_name',
		'file_path',
		'folder',
		'size_bytes',
		'size_formatted',
		'mtime_iso',
		'age_days',
		'age_tier',
		'artifact_kind',
		'cold_roi_score',
		'retention_verdict',
		'prune_recommended',
		'protected',
		'verdict_reason',
	]
	const items = Array.isArray(catalog && catalog.items) ? catalog.items : []
	const lines = [headers.map(escapeCsvCell).join(',')]

	for (const item of items) {
		const row = [
			item.groupId ?? '',
			item.groupHash || '',
			item.name || '',
			item.path || '',
			item.folder || '',
			item.size ?? 0,
			item.sizeFormatted || '',
			item.mtimeIso || '',
			item.ageDays === null ? '' : item.ageDays,
			item.ageTier?.id || '',
			item.artifact?.kind || 'standard',
			item.coldRoiScore ?? 0,
			item.verdict || '',
			item.pruneRecommended ? 'yes' : 'no',
			(item.isProtectedOrigin || item.isLocked) ? 'yes' : 'no',
			item.verdictReason || '',
		]
		lines.push(row.map(escapeCsvCell).join(','))
	}
	return lines.join('\r\n')
}

/**
 * Export retention catalog summary, age distribution, and items as deterministic JSON.
 *
 * @param {object} catalog - Retention catalog from buildRetentionCatalog.
 * @return {string} Pretty-printed JSON manifest.
 */
export function exportRetentionManifestJson(catalog) {
	const items = Array.isArray(catalog && catalog.items) ? catalog.items : []
	const payload = {
		schema: RETENTION_REPORT_SCHEMA,
		exportedAt: new Date().toISOString(),
		summary: catalog?.summary || {},
		ageDistribution: catalog?.ageDistribution || [],
		folderLeaderboard: catalog?.folderLeaderboard || [],
		items: items.map(item => ({
			key: item.key,
			groupId: item.groupId,
			groupHash: item.groupHash,
			name: item.name,
			path: item.path,
			folder: item.folder,
			size: item.size,
			sizeFormatted: item.sizeFormatted,
			mtimeIso: item.mtimeIso,
			ageDays: item.ageDays,
			ageTier: item.ageTier?.id || 'unknown',
			artifactKind: item.artifact?.kind || 'standard',
			coldRoiScore: item.coldRoiScore,
			verdict: item.verdict,
			pruneRecommended: Boolean(item.pruneRecommended),
			protected: Boolean(item.isProtectedOrigin || item.isLocked),
			verdictReason: item.verdictReason,
		})),
	}
	return JSON.stringify(payload, null, 2)
}
