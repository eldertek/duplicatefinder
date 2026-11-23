/**
 * Pure Nextcloud Backup Snapshot, Mirror-Tree Drift Synchronizer,
 * Canonical Golden-Copy Election, POSIX Sync+Prune Rollback Script,
 * OCC Maintenance Checklist, and CWE-1236-safe Audit Export helpers.
 * Zero DOM dependencies, zero network side effects, zero XSS sinks.
 */

import { formatBytes } from './duplicateStats'
import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'

export const BACKUP_DRIFT_SCHEMA = 'duplicatefinder.backup-drift.v1'

export const ROOT_KINDS = Object.freeze([
	'snapshot_dated',
	'mirror_replica',
	'client_export',
	'version_shadow',
	'canonical_live',
])

export const CANONICAL_STRATEGIES = Object.freeze([
	'live_then_newest',
	'origin_then_newest',
	'newest_snapshot',
	'shortest_live_path',
])

export const DRIFT_FINDING_FILTERS = Object.freeze([
	'all',
	'safe_mirror_prune',
	'newer_in_snapshot',
	'multi_gen_snapshots',
	'protected_overlap',
])

export const DRIFT_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'drift_risk_desc',
	'generations_desc',
	'name_asc',
])

const DRIFT_TIME_EPSILON_MS = 1000
const TIMESTAMP_FIELDS = Object.freeze(['mtime', 'modified', 'updatedAt', 'lastModified'])

const ROOT_KIND_LABELS = Object.freeze({
	snapshot_dated: 'Dated Snapshot',
	mirror_replica: 'Mirror / Replica',
	client_export: 'Client Export / Import',
	version_shadow: 'Version / Archive Shadow',
	canonical_live: 'Canonical Live Tree',
})

const SNAPSHOT_DATE_PATTERNS = Object.freeze([
	/(?:^|[/_.-])(20\d{2})[-._](\d{2})[-._](\d{2})(?:[T_-]?(\d{2})[:-]?(\d{2})(?:[:-]?(\d{2}))?)?(?=$|[/_.-])/i,
	/(?:^|[/_.-])(20\d{2})(\d{2})(\d{2})(?:[-_T]?(\d{2})(\d{2})(\d{2})?)?(?=$|[/_.-])/i,
	/@GMT-(20\d{2})\.(\d{2})\.(\d{2})(?:-(\d{2})\.(\d{2})\.(\d{2}))?/i,
])

const DATED_CONTAINER_RE = /(?:^|\/)(?:\.snapshots?|snapshots?|backups?|bkp|timemachine|restic|borg|rdiff-backup|rsync-backup|takeout|nextcloud-backup)(?:\/|$)/i
const MIRROR_CONTAINER_RE = /(?:^|\/)[^/]*(?:mirrors?|replicas?|clones?|offsite|nas-copy|sync-mirror|cold-copy|duplicate-tree)[^/]*(?:\/|$)/i
const EXPORT_CONTAINER_RE = /(?:^|\/)[^/]*(?:takeout|icloud-export|onedrive-import|dropbox-import|phone-backup|mobile-backup|desktop-sync-backup)[^/]*(?:\/|$)|(?:^|\/)(?:exports?|imports?)(?:\/|$)/i
const SHADOW_CONTAINER_RE = /(?:^|\/)(?:_versions|versions_backup|old|archive[sd]?|legacy|deprecated|staging-backup|temp-backup|bak)(?:\/|$)/i

const READONLY_PERMISSION_RE = /^(?:r|ro|read|read-only|readonly)$/i
const MAX_LINE_CHARS = 512

/**
 * Strip ASCII control characters from a string without triggering control-regex rules.
 *
 * @param {string} raw Input string.
 * @param {boolean} [replaceWithSpace=true] Replace control chars with spaces when true, else drop.
 * @return {string} Cleaned string.
 */
function stripControlChars(raw, replaceWithSpace = true) {
	let out = ''
	for (let i = 0; i < raw.length; i += 1) {
		const code = raw.charCodeAt(i)
		if (code < 0x20 || code === 0x7f) {
			if (replaceWithSpace) {
				out += ' '
			}
		} else {
			out += raw[i]
		}
	}
	return out
}

/**
 * Strip control characters and normalize whitespace for safe script/CLI output.
 *
 * @param {*} value Raw string value.
 * @return {string} Sanitized single-line text.
 */
function sanitizeInlineText(value) {
	if (value === null || value === undefined) {
		return ''
	}
	return stripControlChars(String(value), true)
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, MAX_LINE_CHARS)
}

/**
 * Quote a filesystem path safely for POSIX shell execution.
 *
 * @param {string} value Raw path.
 * @return {string} Single-quoted POSIX shell literal.
 */
export function quotePosixShellArg(value) {
	const cleaned = stripControlChars(String(value === null || value === undefined ? '' : value), false)
	return `'${cleaned.replace(/'/g, '\'\\\'\'')}'`
}

/**
 * Parse a timestamp field into epoch milliseconds or null.
 *
 * @param {*} value Raw timestamp value.
 * @return {number|null} Epoch ms or null.
 */
function parseEpochMs(value) {
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
		return value < 1e11 ? Math.round(value * 1000) : Math.round(value)
	}
	if (typeof value === 'string') {
		const trimmed = value.trim()
		if (!trimmed) {
			return null
		}
		if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
			const num = Number(trimmed)
			if (!Number.isFinite(num) || num <= 0) {
				return null
			}
			return num < 1e11 ? Math.round(num * 1000) : Math.round(num)
		}
		const parsed = Date.parse(trimmed)
		return Number.isFinite(parsed) && parsed > 0 ? parsed : null
	}
	return null
}

/**
 * Extract best available modification timestamp in ms from a file entry.
 *
 * @param {object|null|undefined} file Duplicate file entry.
 * @return {number|null} Epoch milliseconds or null.
 */
function getFileMtimeMs(file) {
	if (!file || typeof file !== 'object') {
		return null
	}
	for (const key of TIMESTAMP_FIELDS) {
		if (Object.prototype.hasOwnProperty.call(file, key)) {
			const ms = parseEpochMs(file[key])
			if (ms !== null) {
				return ms
			}
		}
	}
	return null
}

/**
 * Normalize a raw path to forward-slash form starting with '/'.
 *
 * @param {string|null|undefined} rawPath Raw path.
 * @return {string} Normalized path.
 */
function normalizePosix(rawPath) {
	if (typeof rawPath !== 'string') {
		return ''
	}
	const trimmed = rawPath.trim()
	if (!trimmed) {
		return ''
	}
	const slashed = trimmed.replace(/\\/g, '/').replace(/\/+/g, '/')
	return slashed.startsWith('/') ? slashed : `/${slashed}`
}

/**
 * Extract Nextcloud user id if path follows `/<user>/files/...` or explicit owner metadata.
 *
 * @param {string} rawPath Raw path.
 * @param {object|null|undefined} file File object.
 * @return {string} User id or empty string.
 */
function extractOwnerUser(rawPath, file) {
	if (file && typeof file === 'object') {
		for (const key of ['owner', 'userId', 'user']) {
			if (typeof file[key] === 'string' && file[key].trim() !== '') {
				return sanitizeInlineText(file[key])
			}
		}
	}
	const match = normalizePosix(rawPath).match(/^\/([^/]+)\/files(?:\/|$)/)
	return match ? sanitizeInlineText(match[1]) : ''
}

/**
 * Detect a dated snapshot token (YYYY-MM-DD etc.) in a path segment.
 *
 * @param {string} pathStr Normalized path.
 * @return {{ snapshotDate: string, snapshotEpochMs: number|null, matchedIndex: number }}
 */
export function extractSnapshotDateToken(pathStr) {
	if (typeof pathStr !== 'string' || !pathStr) {
		return { snapshotDate: '', snapshotEpochMs: null, matchedIndex: -1 }
	}
	for (const pattern of SNAPSHOT_DATE_PATTERNS) {
		const match = pathStr.match(pattern)
		if (match) {
			const year = Number(match[1])
			const month = Number(match[2])
			const day = Number(match[3])
			if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
				const hour = match[4] ? Math.min(23, Number(match[4])) : 0
				const minute = match[5] ? Math.min(59, Number(match[5])) : 0
				const second = match[6] ? Math.min(59, Number(match[6])) : 0
				const isoDate = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
				const ms = Date.UTC(year, month - 1, day, hour, minute, second)
				return {
					snapshotDate: isoDate,
					snapshotEpochMs: Number.isFinite(ms) ? ms : null,
					matchedIndex: typeof match.index === 'number' ? match.index : -1,
				}
			}
		}
	}
	return { snapshotDate: '', snapshotEpochMs: null, matchedIndex: -1 }
}

/**
 * Extract the top-level or snapshot-boundary root path and relative leaf subpath.
 *
 * @param {string} logicalPath Path normalized via normalizePathForDiff.
 * @param {string} rootKind Classified root kind.
 * @param {string} snapshotDate Detected snapshot date if any.
 * @return {{ rootPath: string, rootLabel: string, relativePath: string }}
 */
function extractRootContainer(logicalPath, rootKind, snapshotDate) {
	const clean = normalizePosix(logicalPath)
	const parts = clean.split('/').filter(Boolean)
	if (parts.length === 0) {
		return { rootPath: '/', rootLabel: '/', relativePath: '/' }
	}
	if (parts.length === 1) {
		return {
			rootPath: `/${parts[0]}`,
			rootLabel: `/${parts[0]}`,
			relativePath: parts[0],
		}
	}

	let rootDepth = 1
	if (rootKind === 'snapshot_dated' && snapshotDate) {
		const dateCompact = snapshotDate.replace(/-/g, '')
		const dateIdx = parts.findIndex(seg => seg.includes(snapshotDate) || seg.includes(dateCompact))
		if (dateIdx >= 0 && dateIdx < parts.length - 1) {
			rootDepth = dateIdx + 1
		} else if (parts.length > 2 && DATED_CONTAINER_RE.test(`/${parts[0]}/`)) {
			rootDepth = 2
		}
	} else if (rootKind !== 'canonical_live' && parts.length > 2) {
		const firstSeg = `/${parts[0]}/`
		const secondSeg = `/${parts[1]}/`
		if (
			DATED_CONTAINER_RE.test(firstSeg)
			|| MIRROR_CONTAINER_RE.test(firstSeg)
			|| EXPORT_CONTAINER_RE.test(firstSeg)
			|| SHADOW_CONTAINER_RE.test(firstSeg)
		) {
			if (
				DATED_CONTAINER_RE.test(secondSeg)
				|| MIRROR_CONTAINER_RE.test(secondSeg)
				|| EXPORT_CONTAINER_RE.test(secondSeg)
				|| SHADOW_CONTAINER_RE.test(secondSeg)
				|| /^v?\d+(?:\.\d+)?$/i.test(parts[1])
				|| /snap|bkp|copy|mirror|export|backup/i.test(parts[1])
			) {
				rootDepth = 2
			}
		}
	}

	const clampedDepth = Math.max(1, Math.min(parts.length - 1, rootDepth))
	const rootSegments = parts.slice(0, clampedDepth)
	const relSegments = parts.slice(clampedDepth)
	const rootPath = `/${rootSegments.join('/')}`

	return {
		rootPath,
		rootLabel: rootPath,
		relativePath: relSegments.join('/'),
	}
}

/**
 * Determine whether a file entry is protected or non-writable.
 *
 * @param {object|null|undefined} file File entry.
 * @return {{ isProtectedOrigin: boolean, isReadOnly: boolean, isLocked: boolean, isWritable: boolean, guardReason: string }}
 */
function inspectWriteGuards(file) {
	if (!file || typeof file !== 'object') {
		return {
			isProtectedOrigin: false,
			isReadOnly: false,
			isLocked: false,
			isWritable: true,
			guardReason: '',
		}
	}
	const isProtectedOrigin = Boolean(
		file.isOriginFolder
		|| file.origin
		|| file.protected
		|| file.isProtected
	)
	const isLocked = Boolean(file.locked || file.isLocked)
	const permRaw = typeof file.permissions === 'string' ? file.permissions.trim() : ''
	const isReadOnly = Boolean(
		file.readonly
		|| file.readOnly
		|| file.writable === false
		|| (permRaw && READONLY_PERMISSION_RE.test(permRaw))
	)
	const guards = []
	if (isProtectedOrigin) {
		guards.push('Protected Origin Folder')
	}
	if (isReadOnly) {
		guards.push('Read-only mount/share')
	}
	if (isLocked) {
		guards.push('Locked file')
	}
	return {
		isProtectedOrigin,
		isReadOnly,
		isLocked,
		isWritable: !isProtectedOrigin && !isReadOnly && !isLocked,
		guardReason: guards.join(', '),
	}
}

/**
 * Classify a file path + metadata into a Nextcloud backup/snapshot/mirror or canonical live tree.
 *
 * @param {string} rawPath Raw file path.
 * @param {object|null|undefined} file Optional duplicate file entry.
 * @return {object} Snapshot root classification metadata.
 */
export function classifySnapshotRoot(rawPath, file = null) {
	const fullPath = normalizePosix(rawPath)
	const stripped = normalizePathForDiff(fullPath) || fullPath || '/'
	const logicalPath = normalizePosix(stripped) || '/'
	const guards = inspectWriteGuards(file)
	const ownerUser = extractOwnerUser(fullPath, file)

	const dirOnly = logicalPath.includes('/')
		? logicalPath.slice(0, logicalPath.lastIndexOf('/') + 1)
		: '/'
	const { snapshotDate, snapshotEpochMs } = extractSnapshotDateToken(dirOnly)

	let rootKind = 'canonical_live'
	if (file && typeof file.snapshotKind === 'string' && ROOT_KINDS.includes(file.snapshotKind)) {
		rootKind = file.snapshotKind
	} else if (!guards.isProtectedOrigin) {
		if (snapshotDate && (DATED_CONTAINER_RE.test(dirOnly) || MIRROR_CONTAINER_RE.test(dirOnly) || EXPORT_CONTAINER_RE.test(dirOnly) || /\/@GMT-/i.test(dirOnly))) {
			rootKind = 'snapshot_dated'
		} else if (DATED_CONTAINER_RE.test(dirOnly)) {
			rootKind = 'snapshot_dated'
		} else if (EXPORT_CONTAINER_RE.test(dirOnly)) {
			rootKind = 'client_export'
		} else if (MIRROR_CONTAINER_RE.test(dirOnly)) {
			rootKind = 'mirror_replica'
		} else if (SHADOW_CONTAINER_RE.test(dirOnly)) {
			rootKind = 'version_shadow'
		} else if (snapshotDate) {
			rootKind = 'snapshot_dated'
		}
	}

	const { rootPath, rootLabel, relativePath } = extractRootContainer(logicalPath, rootKind, snapshotDate)
	const rootKey = ownerUser ? `${ownerUser}:${rootPath}` : rootPath
	const isBackupTree = rootKind !== 'canonical_live'

	return {
		fullPath,
		logicalPath,
		relativePath,
		ownerUser,
		rootKey,
		rootPath,
		rootLabel,
		rootKind,
		rootKindLabel: ROOT_KIND_LABELS[rootKind] || ROOT_KIND_LABELS.canonical_live,
		isBackupTree,
		snapshotDate,
		snapshotEpochMs,
		...guards,
	}
}

/**
 * Extract filename from path.
 *
 * @param {string} pathStr Path string.
 * @return {string} Filename.
 */
function extractFileName(pathStr) {
	if (typeof pathStr !== 'string' || !pathStr) {
		return 'Unnamed file'
	}
	const normalized = pathStr.replace(/\\/g, '/')
	const idx = normalized.lastIndexOf('/')
	return idx === -1 ? normalized : (normalized.slice(idx + 1) || normalized)
}

/**
 * Compare two candidate entries according to the elected canonical strategy.
 * Returns negative when `a` is preferred over `b`.
 *
 * @param {object} a First annotated entry.
 * @param {object} b Second annotated entry.
 * @param {string} strategy Canonical election strategy.
 * @return {number} Comparator sign.
 */
function compareCanonicalCandidates(a, b, strategy) {
	// Protected origins always win first
	if (a.rootInfo.isProtectedOrigin !== b.rootInfo.isProtectedOrigin) {
		return a.rootInfo.isProtectedOrigin ? -1 : 1
	}

	if (strategy === 'origin_then_newest') {
		if (a.rootInfo.isReadOnly !== b.rootInfo.isReadOnly) {
			return a.rootInfo.isReadOnly ? -1 : 1
		}
	}

	if (strategy === 'live_then_newest' || strategy === 'origin_then_newest' || strategy === 'shortest_live_path') {
		if (a.rootInfo.isBackupTree !== b.rootInfo.isBackupTree) {
			return a.rootInfo.isBackupTree ? 1 : -1
		}
	}

	if (strategy === 'shortest_live_path') {
		if (a.rootInfo.logicalPath.length !== b.rootInfo.logicalPath.length) {
			return a.rootInfo.logicalPath.length - b.rootInfo.logicalPath.length
		}
	}

	// Compare mtime newest first
	const aTime = a.mtimeMs !== null ? a.mtimeMs : (a.rootInfo.snapshotEpochMs || 0)
	const bTime = b.mtimeMs !== null ? b.mtimeMs : (b.rootInfo.snapshotEpochMs || 0)
	if (aTime !== bTime) {
		return bTime - aTime
	}

	// Fallback: live root before backup tree
	if (a.rootInfo.isBackupTree !== b.rootInfo.isBackupTree) {
		return a.rootInfo.isBackupTree ? 1 : -1
	}

	// Shorter logical path, then deterministic path order
	if (a.rootInfo.logicalPath.length !== b.rootInfo.logicalPath.length) {
		return a.rootInfo.logicalPath.length - b.rootInfo.logicalPath.length
	}
	return a.path.localeCompare(b.path)
}

/**
 * Format a compact drift delta label relative to canonical master.
 *
 * @param {number|null} entryMtimeMs Entry mtime ms.
 * @param {number|null} canonicalMtimeMs Canonical mtime ms.
 * @return {{ deltaMs: number, label: string, isNewerThanCanonical: boolean }}
 */
function computeDriftDelta(entryMtimeMs, canonicalMtimeMs) {
	if (entryMtimeMs === null || canonicalMtimeMs === null) {
		return { deltaMs: 0, label: 'Timestamp unavailable', isNewerThanCanonical: false }
	}
	const deltaMs = entryMtimeMs - canonicalMtimeMs
	if (Math.abs(deltaMs) <= DRIFT_TIME_EPSILON_MS) {
		return { deltaMs: 0, label: 'In sync with canonical timestamp', isNewerThanCanonical: false }
	}
	const absHours = Math.round(Math.abs(deltaMs) / 3600000)
	const absDays = Math.round(Math.abs(deltaMs) / 86400000)
	const unitLabel = absDays >= 1
		? `${absDays}d`
		: (absHours >= 1 ? `${absHours}h` : `${Math.max(1, Math.round(Math.abs(deltaMs) / 60000))}m`)
	if (deltaMs > DRIFT_TIME_EPSILON_MS) {
		return {
			deltaMs,
			label: `+${unitLabel} newer than canonical`,
			isNewerThanCanonical: true,
		}
	}
	return {
		deltaMs,
		label: `${unitLabel} older than canonical`,
		isNewerThanCanonical: false,
	}
}

/**
 * Compute severity score & tier for a drift group.
 *
 * @param {object} params Group metrics.
 * @param {number} params.newerInSnapshotCount Count of newer-in-snapshot drift files.
 * @param {number} params.multiGenerationCount Number of snapshot generations.
 * @param {number} params.safePruneBytes Safe reclaimable bytes.
 * @param {number} params.protectedCount Count of protected/read-only files.
 * @return {{ riskScore: number, severity: 'critical'|'high'|'medium'|'low' }}
 */
function computeGroupDriftSeverity(params) {
	const {
		newerInSnapshotCount,
		multiGenerationCount,
		safePruneBytes,
		protectedCount,
	} = params
	let riskScore = 15
	if (newerInSnapshotCount > 0) {
		riskScore += 55 + Math.min(20, newerInSnapshotCount * 10)
	}
	if (multiGenerationCount >= 2) {
		riskScore += 15 + Math.min(15, (multiGenerationCount - 1) * 5)
	}
	if (protectedCount > 0) {
		riskScore += 10
	}
	if (safePruneBytes >= 100 * 1024 * 1024) {
		riskScore += 12
	} else if (safePruneBytes >= 10 * 1024 * 1024) {
		riskScore += 6
	}
	riskScore = Math.min(100, riskScore)

	let severity = 'low'
	if (riskScore >= 75) {
		severity = 'critical'
	} else if (riskScore >= 50) {
		severity = 'high'
	} else if (riskScore >= 30) {
		severity = 'medium'
	}
	return { riskScore, severity }
}

/**
 * Build full Backup Snapshot & Mirror-Tree Drift report from loaded duplicate groups.
 *
 * @param {Array<object>|null|undefined} duplicates Loaded duplicate groups.
 * @param {object} [options] Analysis options.
 * @param {string} [options.canonicalStrategy='live_then_newest'] Canonical master strategy.
 * @return {object} Structured backup drift report.
 */
export function buildBackupDriftReport(duplicates, options = {}) {
	const strategy = CANONICAL_STRATEGIES.includes(options.canonicalStrategy)
		? options.canonicalStrategy
		: 'live_then_newest'
	const sourceList = Array.isArray(duplicates) ? duplicates.filter(Boolean) : []

	const groups = []
	const rootRegistryMap = new Map()
	const rootKindAgg = new Map(
		ROOT_KINDS.map(kind => [
			kind,
			{
				rootKind: kind,
				label: ROOT_KIND_LABELS[kind],
				copyCount: 0,
				totalBytes: 0,
				safePruneCount: 0,
				safePruneBytes: 0,
				newerDriftCount: 0,
			},
		])
	)

	let totalSafePruneCount = 0
	let totalSafePruneBytes = 0
	let totalNewerInSnapshotCount = 0
	let totalNewerInSnapshotBytes = 0
	let totalProtectedCount = 0
	let totalMultiGenGroups = 0

	sourceList.forEach((group, groupIdx) => {
		const files = Array.isArray(group.files) ? group.files.filter(f => f && typeof f.path === 'string' && f.path.trim() !== '') : []
		if (files.length < 2) {
			return
		}

		const groupKey = group.hash
			? `hash:${group.hash}`
			: (group.id !== undefined && group.id !== null ? `id:${group.id}` : `idx:${groupIdx}`)

		const annotated = files.map((file, fileIdx) => {
			const size = Number.isFinite(Number(file.size)) && Number(file.size) > 0
				? Number(file.size)
				: (Number.isFinite(Number(group.size)) && Number(group.size) > 0 ? Number(group.size) : 0)
			const mtimeMs = getFileMtimeMs(file)
			const mtimeFormatted = formatFileModifiedTime(file)
			const rootInfo = classifySnapshotRoot(file.path, file)
			const selectionKey = getFileSelectionKey(file) ?? `${groupKey}:file:${fileIdx}`
			return {
				file,
				selectionKey,
				path: file.path,
				name: extractFileName(file.path),
				size,
				sizeFormatted: formatBytes(size),
				mtimeMs,
				mtimeFormatted,
				rootInfo,
			}
		})

		const backupEntries = annotated.filter(item => item.rootInfo.isBackupTree)
		const distinctSnapshotRoots = new Set(backupEntries.map(item => item.rootInfo.rootKey))
		const distinctSnapshotDates = new Set(
			backupEntries.map(item => item.rootInfo.snapshotDate).filter(Boolean)
		)

		// Only audit groups that actually touch at least one backup/snapshot/mirror/export/shadow root
		if (backupEntries.length === 0) {
			return
		}

		const sortedCandidates = [...annotated].sort((a, b) => compareCanonicalCandidates(a, b, strategy))
		const canonicalMaster = sortedCandidates[0]
		const canonicalMtimeMs = canonicalMaster.mtimeMs

		let groupSafePruneCount = 0
		let groupSafePruneBytes = 0
		let groupNewerCount = 0
		let groupNewerBytes = 0
		let groupProtectedCount = 0

		const entries = annotated.map((item) => {
			const isCanonical = item.selectionKey === canonicalMaster.selectionKey
			const drift = computeDriftDelta(item.mtimeMs, canonicalMtimeMs)
			let disposition = 'prune_safe_mirror'
			let dispositionLabel = 'Safe Mirror Prune'

			if (isCanonical) {
				disposition = 'keep_canonical'
				dispositionLabel = 'Canonical Master'
			} else if (!item.rootInfo.isWritable) {
				disposition = 'keep_protected'
				dispositionLabel = item.rootInfo.isProtectedOrigin ? 'Protected Origin' : 'Read-only / Locked'
				groupProtectedCount += 1
			} else if (item.rootInfo.isBackupTree && drift.isNewerThanCanonical) {
				disposition = 'keep_drift_newer'
				dispositionLabel = 'Sync Back First (Newer)'
				groupNewerCount += 1
				groupNewerBytes += item.size
			} else if (!item.rootInfo.isBackupTree) {
				// Another live tree copy outside backup root: keep live copies safe unless user triages manually
				disposition = 'keep_live_secondary'
				dispositionLabel = 'Live Secondary Copy'
			} else {
				groupSafePruneCount += 1
				groupSafePruneBytes += item.size
			}

			// Aggregate root kind stats
			const kindStats = rootKindAgg.get(item.rootInfo.rootKind)
			if (kindStats) {
				kindStats.copyCount += 1
				kindStats.totalBytes += item.size
				if (disposition === 'prune_safe_mirror') {
					kindStats.safePruneCount += 1
					kindStats.safePruneBytes += item.size
				}
				if (disposition === 'keep_drift_newer') {
					kindStats.newerDriftCount += 1
				}
			}

			// Aggregate per-root registry
			if (!rootRegistryMap.has(item.rootInfo.rootKey)) {
				rootRegistryMap.set(item.rootInfo.rootKey, {
					rootKey: item.rootInfo.rootKey,
					rootLabel: item.rootInfo.rootLabel,
					rootKind: item.rootInfo.rootKind,
					rootKindLabel: item.rootInfo.rootKindLabel,
					isBackupTree: item.rootInfo.isBackupTree,
					snapshotDate: item.rootInfo.snapshotDate,
					ownerUser: item.rootInfo.ownerUser,
					totalFiles: 0,
					totalBytes: 0,
					safePruneFiles: 0,
					safePruneBytes: 0,
					newerInSnapshotFiles: 0,
					newerInSnapshotBytes: 0,
					protectedFiles: 0,
					pairedCanonicalSet: new Set(),
				})
			}
			const rootEntry = rootRegistryMap.get(item.rootInfo.rootKey)
			rootEntry.totalFiles += 1
			rootEntry.totalBytes += item.size
			if (disposition === 'prune_safe_mirror') {
				rootEntry.safePruneFiles += 1
				rootEntry.safePruneBytes += item.size
			} else if (disposition === 'keep_drift_newer') {
				rootEntry.newerInSnapshotFiles += 1
				rootEntry.newerInSnapshotBytes += item.size
			} else if (disposition === 'keep_protected') {
				rootEntry.protectedFiles += 1
			}
			if (item.rootInfo.rootKey !== canonicalMaster.rootInfo.rootKey) {
				rootEntry.pairedCanonicalSet.add(canonicalMaster.rootInfo.rootLabel)
			}

			return {
				...item,
				isCanonical,
				driftDeltaMs: drift.deltaMs,
				driftLabel: drift.label,
				isNewerThanCanonical: drift.isNewerThanCanonical,
				disposition,
				dispositionLabel,
			}
		})

		const generationCount = Math.max(distinctSnapshotRoots.size, distinctSnapshotDates.size)
		const isMultiGeneration = generationCount >= 2
		if (isMultiGeneration) {
			totalMultiGenGroups += 1
		}

		let driftType = 'exact_backup_shadow'
		const findingTags = []
		if (groupNewerCount > 0) {
			driftType = 'newer_in_snapshot'
			findingTags.push('Newer-in-Snapshot Drift')
		}
		if (isMultiGeneration) {
			if (driftType === 'exact_backup_shadow') {
				driftType = 'multi_generation_mirror'
			}
			findingTags.push(`${generationCount} Snapshot Generations`)
		}
		if (groupSafePruneCount > 0) {
			findingTags.push('Safe Mirror Prune')
		}
		if (groupProtectedCount > 0) {
			if (groupSafePruneCount === 0 && groupNewerCount === 0) {
				driftType = 'protected_overlap'
			}
			findingTags.push('Protected / Read-only')
		}

		const diagnoses = []
		diagnoses.push(
			`Canonical master elected in ${canonicalMaster.rootInfo.rootKindLabel} (${canonicalMaster.rootInfo.rootLabel}): ${canonicalMaster.path}`
		)
		if (groupNewerCount > 0) {
			diagnoses.push(
				`Drift alert: ${groupNewerCount} snapshot copy/copies have a newer modification timestamp than the canonical master. Reconcile back to canonical before pruning.`
			)
		}
		if (groupSafePruneCount > 0) {
			diagnoses.push(
				`Safe mirror reclaim: ${groupSafePruneCount} redundant writable snapshot copy/copies (${formatBytes(groupSafePruneBytes)}) can be pruned while keeping the canonical master intact.`
			)
		}
		if (groupProtectedCount > 0) {
			diagnoses.push(
				`${groupProtectedCount} copy/copies are protected by Origin Folder, read-only permissions, or file locks and will never be auto-pruned.`
			)
		}

		const { riskScore, severity } = computeGroupDriftSeverity({
			newerInSnapshotCount: groupNewerCount,
			multiGenerationCount: generationCount,
			safePruneBytes: groupSafePruneBytes,
			protectedCount: groupProtectedCount,
		})

		totalSafePruneCount += groupSafePruneCount
		totalSafePruneBytes += groupSafePruneBytes
		totalNewerInSnapshotCount += groupNewerCount
		totalNewerInSnapshotBytes += groupNewerBytes
		totalProtectedCount += groupProtectedCount

		groups.push({
			id: group.id ?? null,
			hash: group.hash || '',
			groupKey,
			primaryName: canonicalMaster.name,
			canonicalMasterPath: canonicalMaster.path,
			canonicalMasterRoot: canonicalMaster.rootInfo.rootLabel,
			canonicalMasterKind: canonicalMaster.rootInfo.rootKindLabel,
			canonicalMasterMtime: canonicalMaster.mtimeFormatted || 'Unknown',
			copyCount: entries.length,
			backupCopyCount: backupEntries.length,
			generationCount,
			isMultiGeneration,
			driftType,
			findingTags,
			riskScore,
			severity,
			safePruneCount: groupSafePruneCount,
			safePruneBytes: groupSafePruneBytes,
			safePruneBytesFormatted: formatBytes(groupSafePruneBytes),
			newerDriftCount: groupNewerCount,
			newerDriftBytes: groupNewerBytes,
			newerDriftBytesFormatted: formatBytes(groupNewerBytes),
			protectedCount: groupProtectedCount,
			diagnoses,
			entries,
		})
	})

	const snapshotRoots = Array.from(rootRegistryMap.values())
		.map((root) => {
			const redundancyPercent = root.totalFiles > 0
				? Math.round((root.safePruneFiles / root.totalFiles) * 100)
				: 0
			let driftStatus = 'canonical_baseline'
			let driftStatusLabel = 'Canonical Baseline'
			if (root.isBackupTree) {
				if (root.newerInSnapshotFiles > 0) {
					driftStatus = 'stale_snapshot_drift'
					driftStatusLabel = 'Drift Alert (Newer Files)'
				} else if (root.safePruneFiles > 0 && root.protectedFiles === 0) {
					driftStatus = 'exact_redundant_mirror'
					driftStatusLabel = '100% Redundant Mirror'
				} else if (root.protectedFiles > 0 && root.safePruneFiles === 0) {
					driftStatus = 'readonly_archive'
					driftStatusLabel = 'Protected / Read-only'
				} else if (root.safePruneFiles > 0) {
					driftStatus = 'partial_redundant_mirror'
					driftStatusLabel = 'Partial Redundant Mirror'
				} else {
					driftStatus = 'canonical_baseline'
					driftStatusLabel = 'Preserved Snapshot'
				}
			}
			return {
				rootKey: root.rootKey,
				rootLabel: root.rootLabel,
				rootKind: root.rootKind,
				rootKindLabel: root.rootKindLabel,
				isBackupTree: root.isBackupTree,
				snapshotDate: root.snapshotDate,
				ownerUser: root.ownerUser,
				totalFiles: root.totalFiles,
				totalBytes: root.totalBytes,
				totalBytesFormatted: formatBytes(root.totalBytes),
				safePruneFiles: root.safePruneFiles,
				safePruneBytes: root.safePruneBytes,
				safePruneBytesFormatted: formatBytes(root.safePruneBytes),
				newerInSnapshotFiles: root.newerInSnapshotFiles,
				newerInSnapshotBytes: root.newerInSnapshotBytes,
				newerInSnapshotBytesFormatted: formatBytes(root.newerInSnapshotBytes),
				protectedFiles: root.protectedFiles,
				redundancyPercent,
				driftStatus,
				driftStatusLabel,
				pairedCanonicalRoots: Array.from(root.pairedCanonicalSet),
			}
		})
		.sort((a, b) => {
			if (a.isBackupTree !== b.isBackupTree) {
				return a.isBackupTree ? -1 : 1
			}
			if (b.newerInSnapshotFiles !== a.newerInSnapshotFiles) {
				return b.newerInSnapshotFiles - a.newerInSnapshotFiles
			}
			return b.safePruneBytes - a.safePruneBytes || a.rootLabel.localeCompare(b.rootLabel)
		})

	const totalKindCopies = Array.from(rootKindAgg.values()).reduce((sum, item) => sum + item.copyCount, 0)
	const rootKindDistribution = Array.from(rootKindAgg.values())
		.map(item => ({
			...item,
			totalBytesFormatted: formatBytes(item.totalBytes),
			safePruneBytesFormatted: formatBytes(item.safePruneBytes),
			sharePercent: totalKindCopies > 0 ? Math.round((item.copyCount / totalKindCopies) * 100) : 0,
		}))

	const backupRootsCount = snapshotRoots.filter(r => r.isBackupTree).length
	const exactMirrorRootsCount = snapshotRoots.filter(r => r.driftStatus === 'exact_redundant_mirror').length

	return {
		schema: BACKUP_DRIFT_SCHEMA,
		strategy,
		summary: {
			totalScannedGroupsCount: sourceList.length,
			auditedGroupsCount: groups.length,
			backupRootsCount,
			exactMirrorRootsCount,
			multiGenGroupsCount: totalMultiGenGroups,
			newerInSnapshotCount: totalNewerInSnapshotCount,
			newerInSnapshotBytes: totalNewerInSnapshotBytes,
			newerInSnapshotBytesFormatted: formatBytes(totalNewerInSnapshotBytes),
			safePruneCount: totalSafePruneCount,
			safePruneBytes: totalSafePruneBytes,
			safePruneBytesFormatted: formatBytes(totalSafePruneBytes),
			protectedCount: totalProtectedCount,
		},
		snapshotRoots,
		rootKindDistribution,
		groups,
	}
}

/**
 * Filter and sort audited backup drift groups.
 *
 * @param {Array<object>} groups Audited drift groups.
 * @param {object} [filters] Filter criteria.
 * @return {Array<object>} Filtered and sorted groups.
 */
export function filterBackupDriftGroups(groups, filters = {}) {
	if (!Array.isArray(groups)) {
		return []
	}
	const findingFilter = DRIFT_FINDING_FILTERS.includes(filters.findingFilter)
		? filters.findingFilter
		: 'all'
	const rootKindFilter = typeof filters.rootKindFilter === 'string' ? filters.rootKindFilter : 'all'
	const rootKeyFilter = typeof filters.rootKeyFilter === 'string' ? filters.rootKeyFilter : ''
	const search = typeof filters.searchQuery === 'string' ? filters.searchQuery.trim().toLowerCase() : ''
	const sortMode = DRIFT_SORT_MODES.includes(filters.sortMode) ? filters.sortMode : 'reclaim_desc'

	const filtered = groups.filter((group) => {
		if (!group) {
			return false
		}
		if (findingFilter === 'safe_mirror_prune' && group.safePruneCount === 0) {
			return false
		}
		if (findingFilter === 'newer_in_snapshot' && group.newerDriftCount === 0) {
			return false
		}
		if (findingFilter === 'multi_gen_snapshots' && !group.isMultiGeneration) {
			return false
		}
		if (findingFilter === 'protected_overlap' && group.protectedCount === 0) {
			return false
		}
		if (rootKindFilter !== 'all' && !group.entries.some(e => e.rootInfo.rootKind === rootKindFilter)) {
			return false
		}
		if (rootKeyFilter && !group.entries.some(e => e.rootInfo.rootKey === rootKeyFilter)) {
			return false
		}
		if (search) {
			const haystack = [
				group.primaryName,
				group.canonicalMasterPath,
				group.canonicalMasterRoot,
				...group.entries.map(e => `${e.path} ${e.rootInfo.rootLabel} ${e.rootInfo.snapshotDate}`),
			].join(' ').toLowerCase()
			if (!haystack.includes(search)) {
				return false
			}
		}
		return true
	})

	return filtered.sort((a, b) => {
		if (sortMode === 'drift_risk_desc') {
			return b.riskScore - a.riskScore || b.newerDriftCount - a.newerDriftCount || b.safePruneBytes - a.safePruneBytes
		}
		if (sortMode === 'generations_desc') {
			return b.generationCount - a.generationCount || b.safePruneBytes - a.safePruneBytes
		}
		if (sortMode === 'name_asc') {
			return a.primaryName.localeCompare(b.primaryName)
		}
		return b.safePruneBytes - a.safePruneBytes || b.riskScore - a.riskScore || a.primaryName.localeCompare(b.primaryName)
	})
}

/**
 * Build an execution-safe Consolidate & Prune plan from filtered drift groups.
 * Enforces the surviving-copy invariant: at least 1 copy per group is always retained,
 * and newer-in-snapshot drift copies are queued for sync-back rather than deletion.
 *
 * @param {Array<object>} groups Audited drift groups.
 * @return {object} Safe prune and sync-back plan.
 */
export function buildBackupPrunePlan(groups) {
	const list = Array.isArray(groups) ? groups : []
	const pruneItems = []
	const reconcileItems = []
	const impactedRoots = new Set()
	const impactedUsers = new Set()
	const seenKeys = new Set()
	let pruneBytes = 0
	let reconcileBytes = 0
	let protectedSkippedCount = 0
	let groupsImpacted = 0

	for (const group of list) {
		if (!group || !Array.isArray(group.entries) || group.entries.length < 2) {
			continue
		}

		const candidatePrunes = group.entries.filter(entry => entry.disposition === 'prune_safe_mirror')
		const candidateReconcile = group.entries.filter(entry => entry.disposition === 'keep_drift_newer')
		const skipped = group.entries.filter(entry => entry.disposition === 'keep_protected')
		protectedSkippedCount += skipped.length

		for (const item of candidateReconcile) {
			reconcileBytes += item.size
			impactedRoots.add(item.rootInfo.rootLabel)
			if (item.rootInfo.ownerUser) {
				impactedUsers.add(item.rootInfo.ownerUser)
			}
			reconcileItems.push({
				groupKey: group.groupKey,
				selectionKey: item.selectionKey,
				sourcePath: item.path,
				canonicalPath: group.canonicalMasterPath,
				rootLabel: item.rootInfo.rootLabel,
				snapshotDate: item.rootInfo.snapshotDate,
				driftLabel: item.driftLabel,
				size: item.size,
				sizeFormatted: item.sizeFormatted,
			})
		}

		// Surviving copy invariant: never allow deleting every copy in a group
		const maxDeletable = Math.max(0, group.entries.length - 1)
		const allowedPrunes = candidatePrunes.slice(0, maxDeletable)
		if (allowedPrunes.length > 0) {
			groupsImpacted += 1
		}

		for (const entry of allowedPrunes) {
			if (seenKeys.has(entry.selectionKey)) {
				continue
			}
			seenKeys.add(entry.selectionKey)
			pruneBytes += entry.size
			impactedRoots.add(entry.rootInfo.rootLabel)
			if (entry.rootInfo.ownerUser) {
				impactedUsers.add(entry.rootInfo.ownerUser)
			}
			pruneItems.push({
				groupKey: group.groupKey,
				selectionKey: entry.selectionKey,
				file: entry.file,
				path: entry.path,
				canonicalPath: group.canonicalMasterPath,
				rootLabel: entry.rootInfo.rootLabel,
				rootKindLabel: entry.rootInfo.rootKindLabel,
				snapshotDate: entry.rootInfo.snapshotDate,
				size: entry.size,
				sizeFormatted: entry.sizeFormatted,
			})
		}
	}

	return {
		safeCount: pruneItems.length,
		safeBytes: pruneBytes,
		safeBytesFormatted: formatBytes(pruneBytes),
		reconcileCount: reconcileItems.length,
		reconcileBytes,
		reconcileBytesFormatted: formatBytes(reconcileBytes),
		protectedSkippedCount,
		groupsImpacted,
		impactedRoots: Array.from(impactedRoots),
		impactedUsers: Array.from(impactedUsers),
		pruneSelectionKeys: pruneItems.map(item => item.selectionKey),
		pruneItems,
		reconcileItems,
	}
}

/**
 * Generate a POSIX-safe dry-run-first shell script that reconciles newer-in-snapshot
 * drift copies back to canonical paths, quarantines redundant snapshot mirrors with a
 * rollback manifest, and supports `--apply` and `--rollback <manifest>`.
 *
 * @param {object} report Backup drift report.
 * @param {object} plan Safe prune plan.
 * @return {string} POSIX bash script contents.
 */
export function generateBackupConsolidateScript(report, plan) {
	const summary = (report && report.summary) || {}
	const pruneItems = (plan && Array.isArray(plan.pruneItems)) ? plan.pruneItems : []
	const reconcileItems = (plan && Array.isArray(plan.reconcileItems)) ? plan.reconcileItems : []
	const impactedUsers = (plan && Array.isArray(plan.impactedUsers)) ? plan.impactedUsers : []

	const bv = expr => '$' + '{' + expr + '}'
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# Nextcloud DuplicateFinder: Backup Snapshot Consolidate & Prune Script',
		`# Schema: ${BACKUP_DRIFT_SCHEMA}`,
		`# Safe mirror prune candidates: ${pruneItems.length} (${plan ? plan.safeBytesFormatted : '0 B'})`,
		`# Newer-in-snapshot drift alerts: ${reconcileItems.length} (${summary.newerInSnapshotBytesFormatted || '0 B'})`,
		'# Mode: DRY-RUN by default. Pass --apply to execute, or --rollback <manifest.tsv> to restore.',
		'',
		'MODE="dry-run"',
		'ROLLBACK_FILE=""',
		`QUARANTINE_DIR="${bv('DUPLICATEFINDER_QUARANTINE_DIR:-/tmp/nextcloud-snapshot-quarantine-$(date +%Y%m%d-%H%M%S)')}"`,
		`DATA_ROOT="${bv('NEXTCLOUD_DATA_ROOT:-/var/www/nextcloud/data')}"`,
		'',
		'while [[ $# -gt 0 ]]; do',
		'  case "$1" in',
		'    --apply)',
		'      MODE="apply"',
		'      shift',
		'      ;;',
		'    --rollback)',
		'      MODE="rollback"',
		`      ROLLBACK_FILE="${bv('2:-')}"`,
		'      shift 2',
		'      ;;',
		'    *)',
		'      echo "Unknown option: $1" >&2',
		'      exit 2',
		'      ;;',
		'  esac',
		'done',
		'',
		'if [[ "$MODE" == "rollback" ]]; then',
		'  if [[ -z "$ROLLBACK_FILE" || ! -f "$ROLLBACK_FILE" ]]; then',
		'    echo "Rollback manifest not found: $ROLLBACK_FILE" >&2',
		'    exit 1',
		'  fi',
		'  while IFS=$\'\\t\' read -r quarantined original; do',
		'    [[ -z "$quarantined" || -z "$original" ]] && continue',
		'    if [[ -e "$quarantined" ]]; then',
		'      mkdir -p "$(dirname "$original")"',
		'      mv -n -- "$quarantined" "$original"',
		'      echo "[ROLLBACK] Restored: $original"',
		'    fi',
		'  done < "$ROLLBACK_FILE"',
		'  exit 0',
		'fi',
		'',
		'MANIFEST_FILE="$QUARANTINE_DIR/rollback-manifest.tsv"',
		'if [[ "$MODE" == "apply" ]]; then',
		'  mkdir -p "$QUARANTINE_DIR"',
		'  : > "$MANIFEST_FILE"',
		'fi',
		'',
		'reconcile_newer_copy() {',
		'  local src="$1"',
		'  local dst="$2"',
		`  local full_src="${bv('DATA_ROOT%/')}/${bv('src#/')}"`,
		`  local full_dst="${bv('DATA_ROOT%/')}/${bv('dst#/')}"`,
		'  if [[ "$MODE" == "dry-run" ]]; then',
		`    echo "[DRY-RUN SYNC] Would preserve newer snapshot copy: $full_src -> ${bv('full_dst')}.snapshot-sync"`,
		'    return 0',
		'  fi',
		'  if [[ -f "$full_src" ]]; then',
		'    mkdir -p "$(dirname "$full_dst")"',
		`    cp -pn -- "$full_src" "${bv('full_dst')}.snapshot-sync"`,
		`    echo "[SYNCED] $full_src -> ${bv('full_dst')}.snapshot-sync"`,
		'  fi',
		'}',
		'',
		'quarantine_redundant_copy() {',
		'  local rel="$1"',
		`  local full_src="${bv('DATA_ROOT%/')}/${bv('rel#/')}"`,
		`  local target="${bv('QUARANTINE_DIR%/')}/${bv('rel#/')}"`,
		'  if [[ "$MODE" == "dry-run" ]]; then',
		'    echo "[DRY-RUN PRUNE] Would quarantine redundant snapshot copy: $full_src"',
		'    return 0',
		'  fi',
		'  if [[ -f "$full_src" ]]; then',
		'    mkdir -p "$(dirname "$target")"',
		'    mv -n -- "$full_src" "$target"',
		'    printf "%s\\t%s\\n" "$target" "$full_src" >> "$MANIFEST_FILE"',
		'    echo "[QUARANTINED] $full_src"',
		'  fi',
		'}',
		'',
		'echo "=== Step 1: Sync Back Newer-in-Snapshot Drift Files ==="',
	]

	if (reconcileItems.length === 0) {
		lines.push('echo "No newer-in-snapshot drift files detected."')
	} else {
		for (const item of reconcileItems) {
			lines.push(`reconcile_newer_copy ${quotePosixShellArg(item.sourcePath)} ${quotePosixShellArg(item.canonicalPath)}`)
		}
	}

	lines.push('')
	lines.push('echo "=== Step 2: Quarantine Verified Redundant Snapshot Copies ==="')
	if (pruneItems.length === 0) {
		lines.push('echo "No redundant snapshot copies queued for pruning."')
	} else {
		for (const item of pruneItems) {
			lines.push(`quarantine_redundant_copy ${quotePosixShellArg(item.path)}`)
		}
	}

	lines.push('')
	lines.push('echo "=== Step 3: Nextcloud OCC Post-Prune Rescan ==="')
	if (impactedUsers.length === 0) {
		lines.push('echo "Run: sudo -u www-data php /var/www/nextcloud/occ files:scan --all"')
	} else {
		for (const user of impactedUsers) {
			lines.push(`echo "Run: sudo -u www-data php /var/www/nextcloud/occ files:scan ${quotePosixShellArg(user)}"`)
		}
	}
	lines.push('echo "Done. Rollback manifest (when applied): $MANIFEST_FILE"')

	return lines.join('\n')
}

/**
 * Generate a scoped Nextcloud OCC maintenance checklist for admins.
 *
 * @param {object} report Backup drift report.
 * @param {object} plan Safe prune plan.
 * @return {string} Text checklist of OCC commands.
 */
export function generateOccMaintenanceChecklist(report, plan) {
	const impactedUsers = (plan && Array.isArray(plan.impactedUsers)) ? plan.impactedUsers : []
	const impactedRoots = (plan && Array.isArray(plan.impactedRoots)) ? plan.impactedRoots : []
	const summary = (report && report.summary) || {}

	const lines = [
		'Nextcloud DuplicateFinder - Backup Snapshot Drift OCC Checklist',
		`Audited Drift Groups: ${summary.auditedGroupsCount || 0}`,
		`Safe Snapshot Reclaim: ${summary.safePruneBytesFormatted || '0 B'} (${summary.safePruneCount || 0} files)`,
		`Newer-in-Snapshot Alerts: ${summary.newerInSnapshotCount || 0} files`,
		'',
		'1. Preview impacted roots before pruning:',
	]

	for (const root of impactedRoots) {
		lines.push(`   - ${sanitizeInlineText(root)}`)
	}

	lines.push('')
	lines.push('2. Rescan impacted Nextcloud user files after snapshot cleanup:')
	if (impactedUsers.length === 0) {
		lines.push('   sudo -u www-data php /var/www/nextcloud/occ files:scan --all')
	} else {
		for (const user of impactedUsers) {
			lines.push(`   sudo -u www-data php /var/www/nextcloud/occ files:scan ${quotePosixShellArg(user)}`)
		}
	}

	lines.push('')
	lines.push('3. Optional trashbin & file-versions cleanup once verified:')
	if (impactedUsers.length === 0) {
		lines.push('   sudo -u www-data php /var/www/nextcloud/occ trashbin:cleanup --all-users')
		lines.push('   sudo -u www-data php /var/www/nextcloud/occ versions:cleanup')
	} else {
		for (const user of impactedUsers) {
			lines.push(`   sudo -u www-data php /var/www/nextcloud/occ trashbin:cleanup ${quotePosixShellArg(user)}`)
			lines.push(`   sudo -u www-data php /var/www/nextcloud/occ versions:cleanup ${quotePosixShellArg(user)}`)
		}
	}

	return lines.join('\n')
}

/**
 * Export CWE-1236 formula-injection-safe RFC 4180 CSV report of backup drift groups.
 *
 * @param {object} report Backup drift report.
 * @return {string} CSV document.
 */
export function exportBackupDriftCsv(report) {
	const groups = (report && Array.isArray(report.groups)) ? report.groups : []
	const headers = [
		'Group Key',
		'Filename',
		'Severity',
		'Risk Score',
		'Drift Type',
		'Snapshot Generations',
		'File Path',
		'Root Label',
		'Root Kind',
		'Snapshot Date',
		'Size Bytes',
		'Modified Time',
		'Drift vs Canonical',
		'Disposition',
		'Canonical Master Path',
	]
	const rows = [headers.map(escapeCsvCell).join(',')]

	for (const group of groups) {
		for (const entry of group.entries) {
			rows.push([
				group.groupKey,
				group.primaryName,
				group.severity,
				group.riskScore,
				group.driftType,
				group.generationCount,
				entry.path,
				entry.rootInfo.rootLabel,
				entry.rootInfo.rootKindLabel,
				entry.rootInfo.snapshotDate,
				entry.size,
				entry.mtimeFormatted,
				entry.driftLabel,
				entry.dispositionLabel,
				group.canonicalMasterPath,
			].map(escapeCsvCell).join(','))
		}
	}

	return rows.join('\r\n')
}

/**
 * Export structured JSON manifest for backup snapshot drift and safe prune plan.
 *
 * @param {object} report Backup drift report.
 * @param {object} plan Safe prune plan.
 * @return {string} Formatted JSON string.
 */
export function exportBackupDriftJson(report, plan) {
	const payload = {
		schema: BACKUP_DRIFT_SCHEMA,
		generatedAt: new Date().toISOString(),
		strategy: report ? report.strategy : 'live_then_newest',
		summary: report ? report.summary : {},
		snapshotRoots: report ? report.snapshotRoots : [],
		reconcileQueue: plan ? plan.reconcileItems : [],
		pruneManifest: plan
			? plan.pruneItems.map(item => ({
				groupKey: item.groupKey,
				path: item.path,
				canonicalPath: item.canonicalPath,
				rootLabel: item.rootLabel,
				snapshotDate: item.snapshotDate,
				size: item.size,
			}))
			: [],
		groups: report
			? report.groups.map(group => ({
				groupKey: group.groupKey,
				primaryName: group.primaryName,
				severity: group.severity,
				riskScore: group.riskScore,
				driftType: group.driftType,
				generationCount: group.generationCount,
				canonicalMasterPath: group.canonicalMasterPath,
				safePruneCount: group.safePruneCount,
				safePruneBytes: group.safePruneBytes,
				newerDriftCount: group.newerDriftCount,
				entries: group.entries.map(entry => ({
					path: entry.path,
					rootLabel: entry.rootInfo.rootLabel,
					rootKind: entry.rootInfo.rootKind,
					snapshotDate: entry.rootInfo.snapshotDate,
					size: entry.size,
					mtimeFormatted: entry.mtimeFormatted,
					driftLabel: entry.driftLabel,
					disposition: entry.disposition,
				})),
			}))
			: [],
	}
	return JSON.stringify(payload, null, 2)
}
