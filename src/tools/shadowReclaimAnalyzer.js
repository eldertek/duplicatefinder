/**
 * Pure Nextcloud Versions (files_versions), Trashbin (files_trashbin) & Appdata
 * Shadow-Duplicate Reclaimer.
 * Inspired by Nextcloud Files Admin / OCC tooling, rmlint, Czkawka, and dupeGuru.
 * Correlates duplicate hashes across live user files, files_versions (.v<epoch>),
 * files_trashbin (.d<epoch>), and appdata_<instanceId> trees; protects shadow-only
 * last copies and young retention-window shadows; detects cross-user shadow leaks;
 * and generates dry-run-first occ versions:cleanup / occ trashbin:cleanup / occ
 * files:scan scripts, read-only probes, JSON reports, and CWE-1236-safe CSVs.
 * Zero DOM dependencies, zero network side effects.
 */

import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { formatBytes } from './duplicateStats'

export const SHADOW_RECLAIM_SCHEMA = 'duplicatefinder.shadow-reclaim-audit.v1'

export const SHADOW_FILTER_CLASSES = Object.freeze([
	'all',
	'files_versions',
	'files_trashbin',
	'appdata',
	'shadow_only',
	'live_backed',
])

export const SHADOW_SURVIVOR_STRATEGIES = Object.freeze([
	'live_first',
	'oldest',
	'newest',
	'shortest_path',
])

export const SHADOW_SORT_MODES = Object.freeze([
	'shadow_reclaim_desc',
	'shadow_count_desc',
	'age_desc',
	'name_asc',
])

export const SHADOW_OCC_MODES = Object.freeze([
	'per_user_cleanup',
	'all_users_cleanup',
	'targeted_path_purge',
])

const MS_PER_DAY = 86400 * 1000
const TIMESTAMP_FIELDS = Object.freeze(['mtime', 'modified', 'updatedAt', 'lastModified'])

const REGENERABLE_APPDATA_SCOPES = new Set([
	'preview',
	'avatar',
	'avatars',
	'js',
	'css',
	'theming',
	'cache',
	'appstore',
])

/**
 * Strip control characters and normalize slashes in a path candidate.
 *
 * @param {string|null|undefined} rawPath Raw file path.
 * @return {string} Normalized path string.
 */
function sanitizePath(rawPath) {
	if (typeof rawPath !== 'string') {
		return ''
	}
	const withoutCtrl = rawPath.replace(/[\r\n\0\t]/g, ' ').trim()
	const normalized = withoutCtrl.replace(/\\/g, '/').replace(/\/+/g, '/')
	if (!normalized) {
		return ''
	}
	return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized
}

/**
 * Extract safe basename from a file entry or normalized path.
 *
 * @param {object|null|undefined} file File entry.
 * @param {string} normalizedPath Normalized path string.
 * @return {string} Safe basename.
 */
function extractBasename(file, normalizedPath) {
	if (file && typeof file.name === 'string' && file.name.trim()) {
		return file.name.replace(/[\r\n\t\0]/g, ' ').trim()
	}
	if (!normalizedPath) {
		return 'unknown'
	}
	const slashIdx = normalizedPath.lastIndexOf('/')
	return slashIdx >= 0 ? normalizedPath.slice(slashIdx + 1) || 'unknown' : normalizedPath
}

/**
 * Parse a timestamp candidate (Unix seconds, milliseconds, Date, or ISO string) to ms.
 *
 * @param {*} value Timestamp candidate.
 * @return {number|null} Timestamp in milliseconds or null.
 */
function parseTimestampMs(value) {
	if (value === null || value === undefined || value === '') {
		return null
	}
	if (value instanceof Date) {
		const ms = value.getTime()
		return Number.isFinite(ms) ? ms : null
	}
	let numeric = null
	if (typeof value === 'number') {
		numeric = Number.isFinite(value) ? value : null
	} else if (typeof value === 'string') {
		const trimmed = value.trim()
		if (!trimmed) {
			return null
		}
		if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
			const parsedNum = Number(trimmed)
			numeric = Number.isFinite(parsedNum) ? parsedNum : null
		} else {
			const parsedIso = Date.parse(trimmed)
			return Number.isFinite(parsedIso) ? parsedIso : null
		}
	}
	if (numeric === null || numeric <= 0) {
		return null
	}
	return numeric < 1e11 ? Math.round(numeric * 1000) : Math.round(numeric)
}

/**
 * Resolve modification timestamp in ms from a file entry.
 *
 * @param {object|null|undefined} file File entry.
 * @return {number|null} Modification timestamp in ms or null.
 */
function getFileTimestampMs(file) {
	if (!file || typeof file !== 'object') {
		return null
	}
	for (const field of TIMESTAMP_FIELDS) {
		if (Object.prototype.hasOwnProperty.call(file, field)) {
			const parsed = parseTimestampMs(file[field])
			if (parsed !== null) {
				return parsed
			}
		}
	}
	return null
}

/**
 * Resolve positive byte size of a file entry or fallback group size.
 *
 * @param {object|null|undefined} file File entry.
 * @param {number} [groupSize=0] Fallback group size.
 * @return {number} Non-negative byte size.
 */
function resolveFileSize(file, groupSize = 0) {
	const raw = file && typeof file === 'object' ? Number(file.size) : NaN
	if (Number.isFinite(raw) && raw >= 0) {
		return raw
	}
	const fallback = Number(groupSize)
	return Number.isFinite(fallback) && fallback >= 0 ? fallback : 0
}

/**
 * Check if a file is locked against automated deletion.
 *
 * @param {object|null|undefined} file File entry.
 * @return {boolean} True when locked.
 */
function isFileLocked(file) {
	if (!file || typeof file !== 'object') {
		return false
	}
	return Boolean(file.locked || file.isLocked)
}

/**
 * Escape a string for safe inclusion inside POSIX single-quoted shell literals.
 *
 * @param {string} value Raw value.
 * @return {string} POSIX single-quoted shell string.
 */
function shellQuote(value) {
	const safe = String(value ?? '').replace(/[\r\n\0]/g, '')
	return `'${safe.replace(/'/g, "'\\''")}'`
}

/**
 * Extract Nextcloud user ID preceding a known Nextcloud storage tree marker.
 *
 * @param {Array<string>} segments Path segments.
 * @param {number} markerIndex Index of marker segment (files, files_versions, files_trashbin).
 * @return {string} Sanitized user ID or empty string.
 */
function extractUserBeforeMarker(segments, markerIndex) {
	if (markerIndex <= 0 || !Array.isArray(segments)) {
		return ''
	}
	const candidate = String(segments[markerIndex - 1] || '').trim()
	if (!candidate || candidate === 'data' || candidate === 'nextcloud' || candidate.startsWith('appdata_')) {
		return ''
	}
	return candidate.replace(/[^a-zA-Z0-9._@-]/g, '')
}

/**
 * Parse Nextcloud shadow storage metadata from a file path and basename.
 *
 * @param {string|null|undefined} rawPath Raw file path.
 * @param {string} [fileName=''] Optional basename override.
 * @return {object} Parsed Nextcloud shadow descriptor.
 */
export function parseNextcloudShadowPath(rawPath, fileName = '') {
	const normalizedPath = sanitizePath(rawPath)
	const resolvedName = fileName ? String(fileName).replace(/[\r\n\t\0]/g, ' ').trim() : extractBasename(null, normalizedPath)
	const segments = normalizedPath.split('/').filter(Boolean)
	const lowerSegments = segments.map(seg => seg.toLowerCase())

	const versionsIdx = lowerSegments.indexOf('files_versions')
	const trashIdx = lowerSegments.indexOf('files_trashbin')
	const appdataIdx = lowerSegments.findIndex(seg => /^appdata_[a-z0-9_-]+$/i.test(seg))
	const filesIdx = lowerSegments.indexOf('files')

	if (versionsIdx >= 0) {
		const userId = extractUserBeforeMarker(segments, versionsIdx)
		const subSegments = segments.slice(versionsIdx + 1)
		const joinedSub = subSegments.join('/')
		const versionMatch = joinedSub.match(/^(.*)\.v(\d{6,13})$/i)
		const epochTimestampSec = versionMatch ? Number(versionMatch[2]) : null
		const logicalSub = versionMatch ? versionMatch[1] : joinedSub
		const logicalOriginalPath = userId
			? `/${userId}/files/${logicalSub}`
			: `/files/${logicalSub}`
		return {
			shadowType: 'files_versions',
			isShadow: true,
			userId,
			instanceId: '',
			appdataScope: '',
			trashbinBucket: '',
			epochTimestampSec: Number.isFinite(epochTimestampSec) ? epochTimestampSec : null,
			isRegenerableAppdata: false,
			logicalOriginalPath: logicalOriginalPath.replace(/\/+/g, '/'),
			normalizedPath,
			fileName: resolvedName,
		}
	}

	if (trashIdx >= 0) {
		const userId = extractUserBeforeMarker(segments, trashIdx)
		const bucketCandidate = lowerSegments[trashIdx + 1] || ''
		const trashbinBucket = ['files', 'versions', 'keys'].includes(bucketCandidate)
			? bucketCandidate
			: 'other'
		const offset = trashbinBucket === 'other' ? 1 : 2
		const subSegments = segments.slice(trashIdx + offset)
		const joinedSub = subSegments.join('/')
		const trashMatch = joinedSub.match(/^(.*)\.d(\d{6,13})$/i)
		const epochTimestampSec = trashMatch ? Number(trashMatch[2]) : null
		const logicalSub = trashMatch ? trashMatch[1] : joinedSub
		const logicalOriginalPath = userId
			? `/${userId}/files/${logicalSub}`
			: `/files/${logicalSub}`
		return {
			shadowType: 'files_trashbin',
			isShadow: true,
			userId,
			instanceId: '',
			appdataScope: '',
			trashbinBucket,
			epochTimestampSec: Number.isFinite(epochTimestampSec) ? epochTimestampSec : null,
			isRegenerableAppdata: false,
			logicalOriginalPath: logicalOriginalPath.replace(/\/+/g, '/'),
			normalizedPath,
			fileName: resolvedName,
		}
	}

	if (appdataIdx >= 0) {
		const appdataSeg = segments[appdataIdx]
		const instanceId = appdataSeg.slice('appdata_'.length).replace(/[^a-zA-Z0-9_-]/g, '')
		const appdataScope = (lowerSegments[appdataIdx + 1] || 'root').replace(/[^a-z0-9_-]/g, '')
		return {
			shadowType: 'appdata',
			isShadow: true,
			userId: '',
			instanceId,
			appdataScope,
			trashbinBucket: '',
			epochTimestampSec: null,
			isRegenerableAppdata: REGENERABLE_APPDATA_SCOPES.has(appdataScope),
			logicalOriginalPath: normalizedPath,
			normalizedPath,
			fileName: resolvedName,
		}
	}

	// Standalone .v<epoch> or .d<epoch> suffixes outside standard tree names
	const standaloneVersion = normalizedPath.match(/^(.*)\.v(\d{9,13})$/i)
	if (standaloneVersion) {
		return {
			shadowType: 'files_versions',
			isShadow: true,
			userId: filesIdx > 0 ? extractUserBeforeMarker(segments, filesIdx) : '',
			instanceId: '',
			appdataScope: '',
			trashbinBucket: '',
			epochTimestampSec: Number(standaloneVersion[2]),
			isRegenerableAppdata: false,
			logicalOriginalPath: standaloneVersion[1],
			normalizedPath,
			fileName: resolvedName,
		}
	}

	const userId = filesIdx > 0 ? extractUserBeforeMarker(segments, filesIdx) : ''
	return {
		shadowType: 'live_file',
		isShadow: false,
		userId,
		instanceId: '',
		appdataScope: '',
		trashbinBucket: '',
		epochTimestampSec: null,
		isRegenerableAppdata: false,
		logicalOriginalPath: normalizedPath,
		normalizedPath,
		fileName: resolvedName,
	}
}

/**
 * Determine if one copy is strictly preferred as survivor under the chosen strategy.
 *
 * @param {object} a Candidate copy descriptor.
 * @param {object} b Candidate copy descriptor.
 * @param {string} strategy Survivor strategy ID.
 * @return {number} Negative if a is preferred over b.
 */
function compareSurvivorPriority(a, b, strategy) {
	// Origin-protected files always win anchor status first
	if (a.isOrigin !== b.isOrigin) {
		return a.isOrigin ? -1 : 1
	}

	// Under live_first (default), active user files always outrank shadow copies
	if (strategy === 'live_first' && a.isShadow !== b.isShadow) {
		return a.isShadow ? 1 : -1
	}

	if (strategy === 'oldest') {
		const ma = a.effectiveTimestampMs ?? Number.MAX_SAFE_INTEGER
		const mb = b.effectiveTimestampMs ?? Number.MAX_SAFE_INTEGER
		if (ma !== mb) {
			return ma - mb
		}
	} else if (strategy === 'newest') {
		const ma = a.effectiveTimestampMs ?? 0
		const mb = b.effectiveTimestampMs ?? 0
		if (ma !== mb) {
			return mb - ma
		}
	} else if (strategy === 'shortest_path') {
		if (a.displayPath.length !== b.displayPath.length) {
			return a.displayPath.length - b.displayPath.length
		}
	}

	// Secondary tie-breaker: prefer live files over shadow copies, then shorter paths, then lexical order
	if (a.isShadow !== b.isShadow) {
		return a.isShadow ? 1 : -1
	}
	if (a.displayPath.length !== b.displayPath.length) {
		return a.displayPath.length - b.displayPath.length
	}
	return a.displayPath.localeCompare(b.displayPath)
}

/**
 * Classify shadow duplicate groups across files_versions, files_trashbin, appdata, and live files.
 *
 * @param {Array<object>} duplicates Duplicate groups list.
 * @param {object} [options] Analysis configuration.
 * @param {string} [options.strategy='live_first'] Survivor rule.
 * @param {number} [options.minShadowAgeDays=0] Minimum age in days before a shadow copy is reclaimable.
 * @param {boolean} [options.includeAppdata=true] Whether appdata_* copies are marked reclaimable.
 * @param {boolean} [options.protectLastShadowAnchor=true] Keep 1 survivor in shadow-only groups.
 * @param {object} [options.manualSurvivors={}] Map of groupKey -> selectionKey overrides.
 * @param {number} [options.referenceNowMs] Deterministic reference clock in ms.
 * @return {object} Complete shadow-duplicate audit report.
 */
export function analyzeShadowDuplicates(duplicates, options = {}) {
	const groups = Array.isArray(duplicates) ? duplicates : []
	const strategy = SHADOW_SURVIVOR_STRATEGIES.includes(options.strategy)
		? options.strategy
		: 'live_first'
	const minShadowAgeDays = Number.isFinite(Number(options.minShadowAgeDays)) && Number(options.minShadowAgeDays) > 0
		? Math.floor(Number(options.minShadowAgeDays))
		: 0
	const includeAppdata = options.includeAppdata !== false
	const protectLastShadowAnchor = options.protectLastShadowAnchor !== false
	const manualSurvivors = options.manualSurvivors && typeof options.manualSurvivors === 'object'
		? options.manualSurvivors
		: {}
	const referenceNowMs = Number.isFinite(Number(options.referenceNowMs)) && Number(options.referenceNowMs) > 0
		? Number(options.referenceNowMs)
		: Date.now()

	const items = []
	const userMap = new Map()
	const categoryCounts = {
		all: 0,
		files_versions: 0,
		files_trashbin: 0,
		appdata: 0,
		shadow_only: 0,
		live_backed: 0,
	}

	let shadowBackedGroups = 0
	let shadowOnlyGroups = 0
	let crossUserShadowGroups = 0
	let totalShadowFiles = 0
	let safeReclaimShadowCount = 0
	let retentionHeldCount = 0
	let totalShadowReclaimableBytes = 0
	let versionsReclaimableBytes = 0
	let trashbinReclaimableBytes = 0
	let appdataReclaimableBytes = 0

	const ensureUserBucket = (userId) => {
		const key = userId || '(system / appdata)'
		if (!userMap.has(key)) {
			userMap.set(key, {
				userId: key,
				isSystemBucket: !userId,
				versionsCount: 0,
				trashbinCount: 0,
				appdataCount: 0,
				versionsBytes: 0,
				trashbinBytes: 0,
				appdataBytes: 0,
				totalReclaimBytes: 0,
				totalReclaimFormatted: formatBytes(0),
			})
		}
		return userMap.get(key)
	}

	for (let gIdx = 0; gIdx < groups.length; gIdx++) {
		const rawGroup = groups[gIdx]
		if (!rawGroup || typeof rawGroup !== 'object') {
			continue
		}
		const files = Array.isArray(rawGroup.files) ? rawGroup.files.filter(Boolean) : []
		if (files.length === 0) {
			continue
		}

		const groupId = rawGroup.id !== undefined && rawGroup.id !== null ? rawGroup.id : `idx-${gIdx}`
		const groupKey = String(groupId)
		const groupSize = Number(rawGroup.size) > 0 ? Number(rawGroup.size) : 0

		const analyzedCopies = files.map((rawFile, fIdx) => {
			const displayPath = sanitizePath(rawFile.path || rawFile.name || '') || `file-${fIdx}`
			const fileName = extractBasename(rawFile, displayPath)
			const parsed = parseNextcloudShadowPath(displayPath, fileName)
			const sizeBytes = resolveFileSize(rawFile, groupSize)
			const mtimeMs = getFileTimestampMs(rawFile)
			const epochMs = parsed.epochTimestampSec !== null
				? (parsed.epochTimestampSec < 1e11 ? parsed.epochTimestampSec * 1000 : parsed.epochTimestampSec)
				: null
			const effectiveTimestampMs = epochMs !== null ? epochMs : mtimeMs
			const ageDays = effectiveTimestampMs !== null
				? Math.max(0, Math.floor((referenceNowMs - effectiveTimestampMs) / MS_PER_DAY))
				: null

			return {
				rawFile,
				selectionKey: getFileSelectionKey(rawFile, fIdx),
				displayPath,
				fileName,
				sizeBytes,
				sizeFormatted: formatBytes(sizeBytes),
				shadowType: parsed.shadowType,
				isShadow: parsed.isShadow,
				userId: parsed.userId,
				instanceId: parsed.instanceId,
				appdataScope: parsed.appdataScope,
				trashbinBucket: parsed.trashbinBucket,
				epochTimestampSec: parsed.epochTimestampSec,
				isRegenerableAppdata: parsed.isRegenerableAppdata,
				logicalOriginalPath: parsed.logicalOriginalPath,
				effectiveTimestampMs,
				ageDays,
				isOrigin: Boolean(rawFile.isInOriginFolder),
				isLocked: isFileLocked(rawFile),
				isSurvivor: false,
				copyStatus: 'shadow-reclaimable',
				copyReason: '',
			}
		})

		const shadowCopies = analyzedCopies.filter(c => c.isShadow)
		// Focus groups that have at least one Nextcloud shadow copy (versions/trashbin/appdata)
		if (shadowCopies.length === 0) {
			continue
		}

		const liveCopies = analyzedCopies.filter(c => !c.isShadow)
		const hasLiveAnchor = liveCopies.length > 0
		const isShadowOnlyGroup = !hasLiveAnchor

		// Pick survivor anchor
		const manualKey = manualSurvivors[groupKey]
		let survivor = manualKey
			? analyzedCopies.find(c => c.selectionKey === manualKey)
			: null

		if (!survivor && (hasLiveAnchor || protectLastShadowAnchor)) {
			const sortedCandidates = [...analyzedCopies].sort((a, b) => compareSurvivorPriority(a, b, strategy))
			survivor = sortedCandidates[0] || null
		}

		let versionsCount = 0
		let trashbinCount = 0
		let appdataCount = 0
		let versionsBytes = 0
		let trashbinBytes = 0
		let appdataBytes = 0
		let groupSafeReclaimBytes = 0
		let groupHeldCount = 0
		let oldestShadowAgeDays = 0
		const safeShadowFiles = []
		const affectedUsersSet = new Set()

		const survivorUser = survivor ? survivor.userId : ''
		let isCrossUserShadow = false

		for (const copy of analyzedCopies) {
			if (copy.userId) {
				affectedUsersSet.add(copy.userId)
			}
			if (copy.isShadow && copy.ageDays !== null && copy.ageDays > oldestShadowAgeDays) {
				oldestShadowAgeDays = copy.ageDays
			}
			if (copy.isShadow && survivorUser && copy.userId && copy.userId !== survivorUser) {
				isCrossUserShadow = true
			}

			if (survivor && copy.selectionKey === survivor.selectionKey) {
				copy.isSurvivor = true
				copy.copyStatus = 'survivor'
				copy.copyReason = copy.isShadow
					? 'Protected last shadow anchor (no active live copy in group)'
					: 'Active live survivor retained'
				continue
			}

			if (!copy.isShadow) {
				if (copy.isOrigin) {
					copy.copyStatus = 'protected-origin'
					copy.copyReason = 'Protected by Origin folder rule'
				} else if (copy.isLocked) {
					copy.copyStatus = 'locked-file'
					copy.copyReason = 'Locked file cannot be purged automatically'
				} else {
					copy.copyStatus = 'live-redundant'
					copy.copyReason = 'Additional live user copy (handled by main duplicate triage)'
				}
				continue
			}

			// Shadow copy evaluation
			totalShadowFiles += 1
			if (copy.shadowType === 'files_versions') {
				versionsCount += 1
			} else if (copy.shadowType === 'files_trashbin') {
				trashbinCount += 1
			} else if (copy.shadowType === 'appdata') {
				appdataCount += 1
			}

			if (copy.isOrigin) {
				copy.copyStatus = 'protected-origin'
				copy.copyReason = 'Protected by Origin folder rule'
				continue
			}

			if (copy.isLocked) {
				copy.copyStatus = 'locked-file'
				copy.copyReason = 'Locked shadow artifact'
				continue
			}

			if (copy.shadowType === 'appdata' && !includeAppdata) {
				copy.copyStatus = 'retention-hold'
				copy.copyReason = 'Appdata cleanup disabled in current workbench settings'
				groupHeldCount += 1
				retentionHeldCount += 1
				continue
			}

			if (minShadowAgeDays > 0 && (copy.ageDays === null || copy.ageDays < minShadowAgeDays)) {
				copy.copyStatus = 'retention-hold'
				copy.copyReason = copy.ageDays === null
					? `Age unknown; held under ${minShadowAgeDays}d retention window`
					: `Age ${copy.ageDays}d is below ${minShadowAgeDays}d retention grace threshold`
				groupHeldCount += 1
				retentionHeldCount += 1
				continue
			}

			copy.copyStatus = 'shadow-reclaimable'
			if (copy.shadowType === 'files_versions') {
				copy.copyReason = hasLiveAnchor
					? 'Historical version byte-identical to live survivor'
					: 'Redundant historical version (anchor shadow retained)'
				versionsBytes += copy.sizeBytes
				versionsReclaimableBytes += copy.sizeBytes
			} else if (copy.shadowType === 'files_trashbin') {
				copy.copyReason = hasLiveAnchor
					? `Trashed copy (${copy.trashbinBucket || 'files'}) identical to live survivor`
					: 'Redundant trashed copy (anchor shadow retained)'
				trashbinBytes += copy.sizeBytes
				trashbinReclaimableBytes += copy.sizeBytes
			} else {
				copy.copyReason = copy.isRegenerableAppdata
					? `Regenerable appdata_${copy.instanceId || 'default'}/${copy.appdataScope} shadow`
					: `Appdata_${copy.instanceId || 'default'}/${copy.appdataScope} duplicate shadow`
				appdataBytes += copy.sizeBytes
				appdataReclaimableBytes += copy.sizeBytes
			}

			groupSafeReclaimBytes += copy.sizeBytes
			totalShadowReclaimableBytes += copy.sizeBytes
			safeReclaimShadowCount += 1
			safeShadowFiles.push(copy.rawFile)

			const bucket = ensureUserBucket(copy.userId)
			if (copy.shadowType === 'files_versions') {
				bucket.versionsCount += 1
				bucket.versionsBytes += copy.sizeBytes
			} else if (copy.shadowType === 'files_trashbin') {
				bucket.trashbinCount += 1
				bucket.trashbinBytes += copy.sizeBytes
			} else {
				bucket.appdataCount += 1
				bucket.appdataBytes += copy.sizeBytes
			}
			bucket.totalReclaimBytes += copy.sizeBytes
			bucket.totalReclaimFormatted = formatBytes(bucket.totalReclaimBytes)
		}

		let primaryCategory = 'mixed_shadow'
		const hasVersions = shadowCopies.some(c => c.shadowType === 'files_versions')
		const hasTrash = shadowCopies.some(c => c.shadowType === 'files_trashbin')
		const hasAppdata = shadowCopies.some(c => c.shadowType === 'appdata')
		if (hasVersions && !hasTrash && !hasAppdata) {
			primaryCategory = 'files_versions'
		} else if (hasTrash && !hasVersions && !hasAppdata) {
			primaryCategory = 'files_trashbin'
		} else if (hasAppdata && !hasVersions && !hasTrash) {
			primaryCategory = 'appdata'
		}

		categoryCounts.all += 1
		if (hasVersions) {
			categoryCounts.files_versions += 1
		}
		if (hasTrash) {
			categoryCounts.files_trashbin += 1
		}
		if (hasAppdata) {
			categoryCounts.appdata += 1
		}
		if (isShadowOnlyGroup) {
			categoryCounts.shadow_only += 1
			shadowOnlyGroups += 1
		} else {
			categoryCounts.live_backed += 1
			shadowBackedGroups += 1
		}
		if (isCrossUserShadow) {
			crossUserShadowGroups += 1
		}

		const titleSource = survivor || analyzedCopies[0]
		const title = titleSource ? titleSource.fileName : `Group ${groupKey}`
		const affectedUsers = [...affectedUsersSet].sort()

		items.push({
			rawGroup,
			groupId,
			groupKey,
			title,
			hash: typeof rawGroup.hash === 'string' ? rawGroup.hash : '',
			primaryCategory,
			hasLiveAnchor,
			isShadowOnlyGroup,
			isCrossUserShadow,
			hasVersions,
			hasTrash,
			hasAppdata,
			affectedUsers,
			logicalOriginalPath: titleSource ? titleSource.logicalOriginalPath : '',
			copyCount: analyzedCopies.length,
			liveCount: liveCopies.length,
			shadowFileCount: shadowCopies.length,
			versionsCount,
			trashbinCount,
			appdataCount,
			safeReclaimCount: safeShadowFiles.length,
			heldCount: groupHeldCount,
			oldestShadowAgeDays,
			shadowReclaimableBytes: groupSafeReclaimBytes,
			shadowReclaimableFormatted: formatBytes(groupSafeReclaimBytes),
			versionsBytes,
			trashbinBytes,
			appdataBytes,
			survivor,
			copies: analyzedCopies,
			safeShadowFiles,
		})
	}

	const userBreakdown = [...userMap.values()].sort((a, b) => {
		if (b.totalReclaimBytes !== a.totalReclaimBytes) {
			return b.totalReclaimBytes - a.totalReclaimBytes
		}
		return a.userId.localeCompare(b.userId)
	})

	const allDetectedUsers = [...new Set(
		items.flatMap(item => item.affectedUsers),
	)].sort()

	return {
		schema: SHADOW_RECLAIM_SCHEMA,
		generatedAtIso: new Date(referenceNowMs).toISOString(),
		options: {
			strategy,
			minShadowAgeDays,
			includeAppdata,
			protectLastShadowAnchor,
		},
		summary: {
			totalGroups: items.length,
			shadowBackedGroups,
			shadowOnlyGroups,
			crossUserShadowGroups,
			totalShadowFiles,
			safeReclaimShadowCount,
			retentionHeldCount,
			totalShadowReclaimableBytes,
			totalShadowReclaimableFormatted: formatBytes(totalShadowReclaimableBytes),
			versionsReclaimableBytes,
			versionsReclaimableFormatted: formatBytes(versionsReclaimableBytes),
			trashbinReclaimableBytes,
			trashbinReclaimableFormatted: formatBytes(trashbinReclaimableBytes),
			appdataReclaimableBytes,
			appdataReclaimableFormatted: formatBytes(appdataReclaimableBytes),
			categoryCounts,
			allDetectedUsers,
		},
		userBreakdown,
		items,
	}
}

/**
 * Filter and sort shadow duplicate groups deterministically.
 *
 * @param {Array<object>} items Report items from analyzeShadowDuplicates.
 * @param {object} [options] Filter and sort options.
 * @param {string} [options.shadowFilter='all'] Shadow category filter.
 * @param {string} [options.userFilter='all'] Nextcloud user filter.
 * @param {string} [options.searchQuery=''] Search string.
 * @param {number} [options.minShadowReclaimBytes=0] Minimum safe reclaimable shadow bytes.
 * @param {string} [options.sortMode='shadow_reclaim_desc'] Sort key.
 * @return {Array<object>} Filtered and sorted items.
 */
export function filterAndSortShadowItems(items, options = {}) {
	const list = Array.isArray(items) ? items : []
	const shadowFilter = SHADOW_FILTER_CLASSES.includes(options.shadowFilter)
		? options.shadowFilter
		: 'all'
	const userFilter = typeof options.userFilter === 'string' && options.userFilter.trim()
		? options.userFilter.trim()
		: 'all'
	const query = typeof options.searchQuery === 'string'
		? options.searchQuery.trim().toLowerCase()
		: ''
	const minBytes = Number.isFinite(Number(options.minShadowReclaimBytes)) && Number(options.minShadowReclaimBytes) > 0
		? Number(options.minShadowReclaimBytes)
		: 0
	const sortMode = SHADOW_SORT_MODES.includes(options.sortMode)
		? options.sortMode
		: 'shadow_reclaim_desc'

	const filtered = list.filter((item) => {
		if (!item) {
			return false
		}
		if (shadowFilter === 'files_versions' && !item.hasVersions) {
			return false
		}
		if (shadowFilter === 'files_trashbin' && !item.hasTrash) {
			return false
		}
		if (shadowFilter === 'appdata' && !item.hasAppdata) {
			return false
		}
		if (shadowFilter === 'shadow_only' && !item.isShadowOnlyGroup) {
			return false
		}
		if (shadowFilter === 'live_backed' && item.isShadowOnlyGroup) {
			return false
		}

		if (userFilter !== 'all' && !item.affectedUsers.includes(userFilter)) {
			return false
		}

		if (minBytes > 0 && item.shadowReclaimableBytes < minBytes) {
			return false
		}

		if (query) {
			const haystacks = [
				item.title,
				item.hash,
				item.logicalOriginalPath,
				...item.affectedUsers,
				...item.copies.map(c => `${c.displayPath} ${c.instanceId} ${c.appdataScope}`),
			]
			const matched = haystacks.some(h => typeof h === 'string' && h.toLowerCase().includes(query))
			if (!matched) {
				return false
			}
		}

		return true
	})

	return [...filtered].sort((a, b) => {
		if (sortMode === 'shadow_count_desc') {
			if (b.shadowFileCount !== a.shadowFileCount) {
				return b.shadowFileCount - a.shadowFileCount
			}
			return b.shadowReclaimableBytes - a.shadowReclaimableBytes
		}
		if (sortMode === 'age_desc') {
			if (b.oldestShadowAgeDays !== a.oldestShadowAgeDays) {
				return b.oldestShadowAgeDays - a.oldestShadowAgeDays
			}
			return b.shadowReclaimableBytes - a.shadowReclaimableBytes
		}
		if (sortMode === 'name_asc') {
			return a.title.localeCompare(b.title)
		}
		// default: shadow_reclaim_desc
		if (b.shadowReclaimableBytes !== a.shadowReclaimableBytes) {
			return b.shadowReclaimableBytes - a.shadowReclaimableBytes
		}
		return b.shadowFileCount - a.shadowFileCount
	})
}

/**
 * Build flat safe deletion selection from verified shadow copies only.
 *
 * @param {object|null|undefined} report Report from analyzeShadowDuplicates.
 * @param {string|null} [targetGroupKey=null] Optional single group filter.
 * @return {object} Safe deletion selection descriptor.
 */
export function buildShadowSafeSelection(report, targetGroupKey = null) {
	if (!report || !Array.isArray(report.items)) {
		return { files: [], groupCount: 0, totalBytes: 0, totalFormatted: formatBytes(0) }
	}
	const files = []
	let groupCount = 0
	let totalBytes = 0

	for (const item of report.items) {
		if (!item) {
			continue
		}
		if (targetGroupKey && item.groupKey !== targetGroupKey) {
			continue
		}
		if (!Array.isArray(item.safeShadowFiles) || item.safeShadowFiles.length === 0) {
			continue
		}
		groupCount += 1
		totalBytes += item.shadowReclaimableBytes
		for (const f of item.safeShadowFiles) {
			files.push(f)
		}
	}

	return {
		files,
		groupCount,
		totalBytes,
		totalFormatted: formatBytes(totalBytes),
	}
}

/**
 * Generate a dry-run-first Nextcloud OCC shadow cleanup bash script.
 * Uses strict POSIX single-quoting and DRY_RUN=1 default guard.
 *
 * @param {object|null|undefined} report Shadow reclaim report.
 * @param {object} [options] Script generation options.
 * @param {string} [options.occCommand='php /var/www/nextcloud/occ'] OCC executable prefix.
 * @param {string} [options.dataRoot='/var/www/nextcloud/data'] Nextcloud data directory.
 * @param {string} [options.occMode='per_user_cleanup'] OCC remediation mode.
 * @param {string|null} [options.targetGroupKey=null] Optional single-group filter.
 * @return {string} POSIX bash script.
 */
export function buildShadowOccCleanupScript(report, options = {}) {
	const occRaw = typeof options.occCommand === 'string' && options.occCommand.trim()
		? options.occCommand.replace(/[\r\n\0]/g, '').trim()
		: 'php /var/www/nextcloud/occ'
	const dataRoot = typeof options.dataRoot === 'string' && options.dataRoot.trim()
		? options.dataRoot.replace(/[\r\n\0]/g, '').trim()
		: '/var/www/nextcloud/data'
	const occMode = SHADOW_OCC_MODES.includes(options.occMode)
		? options.occMode
		: 'per_user_cleanup'
	const targetGroupKey = options.targetGroupKey || null

	const items = report && Array.isArray(report.items)
		? report.items.filter(item => !targetGroupKey || item.groupKey === targetGroupKey)
		: []

	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# DuplicateFinder Nextcloud Versions / Trashbin / Appdata Shadow Reclaimer',
		`# Schema: ${SHADOW_RECLAIM_SCHEMA}`,
		`# Mode: ${occMode}`,
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		`DATA_ROOT=${shellQuote(dataRoot)}`,
		`OCC_CMD=${shellQuote(occRaw)}`,
		'',
		'run_cmd() {',
		'  if [ "$DRY_RUN" = "1" ]; then',
		'    printf "[DRY_RUN] %s\\n" "$*"',
		'  else',
		'    "$@"',
		'  fi',
		'}',
		'',
	]

	const versionUsers = new Set()
	const trashUsers = new Set()
	const targetedShadows = []

	for (const item of items) {
		for (const copy of item.copies) {
			if (copy.copyStatus !== 'shadow-reclaimable') {
				continue
			}
			targetedShadows.push(copy)
			if (copy.shadowType === 'files_versions' && copy.userId) {
				versionUsers.add(copy.userId)
			} else if (copy.shadowType === 'files_trashbin' && copy.userId) {
				trashUsers.add(copy.userId)
			}
		}
	}

	if (occMode === 'all_users_cleanup') {
		lines.push('# Global Nextcloud retention cleanup across all users')
		lines.push('if [ "$DRY_RUN" = "1" ]; then')
		lines.push('  printf "[DRY_RUN] %s versions:cleanup --all-users\\n" "$OCC_CMD"')
		lines.push('  printf "[DRY_RUN] %s trashbin:cleanup --all-users\\n" "$OCC_CMD"')
		lines.push('else')
		lines.push('  # shellcheck disable=SC2086')
		lines.push('  $OCC_CMD versions:cleanup --all-users')
		lines.push('  # shellcheck disable=SC2086')
		lines.push('  $OCC_CMD trashbin:cleanup --all-users')
		lines.push('fi')
		lines.push('')
	} else if (occMode === 'per_user_cleanup') {
		const allUsers = [...new Set([...versionUsers, ...trashUsers])].sort()
		if (allUsers.length === 0) {
			lines.push('# No user-scoped files_versions or files_trashbin reclaim targets in current scope.')
		} else {
			lines.push('# Per-user OCC cleanup (respects Nextcloud oc_filecache consistency)')
			for (const uid of allUsers) {
				const qUid = shellQuote(uid)
				if (versionUsers.has(uid)) {
					lines.push(`if [ "$DRY_RUN" = "1" ]; then printf "[DRY_RUN] %s versions:cleanup %s\\n" "$OCC_CMD" ${qUid}; else $OCC_CMD versions:cleanup ${qUid}; fi`)
				}
				if (trashUsers.has(uid)) {
					lines.push(`if [ "$DRY_RUN" = "1" ]; then printf "[DRY_RUN] %s trashbin:cleanup %s\\n" "$OCC_CMD" ${qUid}; else $OCC_CMD trashbin:cleanup ${qUid}; fi`)
				}
			}
		}
		lines.push('')
	}

	if (targetedShadows.length > 0) {
		lines.push('# Targeted duplicate shadow artifact paths (dry-run guarded)')
		for (const copy of targetedShadows) {
			const rel = copy.displayPath.replace(/^\/+/, '')
			const quotedRel = shellQuote(rel)
			const quotedType = shellQuote(copy.shadowType)
			lines.push(`# [${copy.shadowType}] ${copy.sizeFormatted} | user=${copy.userId || 'system'}`)
			lines.push(`TARGET_PATH="$DATA_ROOT/"${quotedRel}`)
			lines.push(`if [ "$DRY_RUN" = "1" ]; then printf "[DRY_RUN] rm -f %s (%s)\\n" "$TARGET_PATH" ${quotedType}; else rm -f -- "$TARGET_PATH"; fi`)
		}
		lines.push('')
	}

	const scanUsers = [...new Set([...versionUsers, ...trashUsers])].sort()
	lines.push('# Post-reclaim Nextcloud filecache & preview consistency repair')
	if (scanUsers.length > 0) {
		for (const uid of scanUsers) {
			const qUid = shellQuote(uid)
			lines.push(`if [ "$DRY_RUN" = "1" ]; then printf "[DRY_RUN] %s files:scan %s\\n" "$OCC_CMD" ${qUid}; else $OCC_CMD files:scan ${qUid}; fi`)
		}
	}
	lines.push('if [ "$DRY_RUN" = "1" ]; then printf "[DRY_RUN] %s files:cleanup\\n" "$OCC_CMD"; else $OCC_CMD files:cleanup; fi')

	return lines.join('\n')
}

/**
 * Generate a read-only diagnostic probe script for files_versions, files_trashbin, and appdata_*.
 *
 * @param {object|null|undefined} report Shadow reclaim report.
 * @param {object} [options] Probe options.
 * @param {string} [options.dataRoot='/var/www/nextcloud/data'] Nextcloud data root.
 * @param {string|null} [options.targetGroupKey=null] Optional single group key.
 * @return {string} Read-only bash diagnostic script.
 */
export function buildShadowProbeScript(report, options = {}) {
	const dataRoot = typeof options.dataRoot === 'string' && options.dataRoot.trim()
		? options.dataRoot.replace(/[\r\n\0]/g, '').trim()
		: '/var/www/nextcloud/data'
	const targetGroupKey = options.targetGroupKey || null
	const items = report && Array.isArray(report.items)
		? report.items.filter(item => !targetGroupKey || item.groupKey === targetGroupKey)
		: []

	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# Read-only Nextcloud Shadow Footprint & Stat Audit Probe',
		`DATA_ROOT=${shellQuote(dataRoot)}`,
		'',
		'echo "=== Nextcloud Shadow Tree Disk Usage ==="',
		'find "$DATA_ROOT" -maxdepth 2 \\( -name "files_versions" -o -name "files_trashbin" -o -name "appdata_*" \\) -exec du -sh {} + 2>/dev/null || true',
		'',
		'echo "=== Targeted Duplicate Shadow Entries ==="',
	]

	for (const item of items) {
		for (const copy of item.copies) {
			if (!copy.isShadow) {
				continue
			}
			const rel = copy.displayPath.replace(/^\/+/, '')
			const qRel = shellQuote(rel)
			lines.push(`stat -c '%n | size=%s | mtime=%y' "$DATA_ROOT/"${qRel} 2>/dev/null || echo ${shellQuote(`MISSING: ${rel}`)}`)
		}
	}

	return lines.join('\n')
}

/**
 * Serialize shadow duplicate audit report into deterministic JSON.
 *
 * @param {object|null|undefined} report Shadow reclaim report.
 * @return {string} Formatted JSON string.
 */
export function buildShadowReclaimJson(report) {
	if (!report || !Array.isArray(report.items)) {
		return JSON.stringify({
			schema: SHADOW_RECLAIM_SCHEMA,
			summary: {},
			userBreakdown: [],
			groups: [],
		}, null, 2)
	}

	const payload = {
		schema: report.schema || SHADOW_RECLAIM_SCHEMA,
		generatedAtIso: report.generatedAtIso,
		options: report.options,
		summary: report.summary,
		userBreakdown: report.userBreakdown,
		groups: report.items.map(item => ({
			groupId: item.groupId,
			title: item.title,
			hash: item.hash,
			primaryCategory: item.primaryCategory,
			hasLiveAnchor: item.hasLiveAnchor,
			isShadowOnlyGroup: item.isShadowOnlyGroup,
			isCrossUserShadow: item.isCrossUserShadow,
			logicalOriginalPath: item.logicalOriginalPath,
			affectedUsers: item.affectedUsers,
			shadowReclaimableBytes: item.shadowReclaimableBytes,
			versionsCount: item.versionsCount,
			trashbinCount: item.trashbinCount,
			appdataCount: item.appdataCount,
			copies: item.copies.map(copy => ({
				path: copy.displayPath,
				logicalOriginalPath: copy.logicalOriginalPath,
				shadowType: copy.shadowType,
				userId: copy.userId,
				instanceId: copy.instanceId,
				appdataScope: copy.appdataScope,
				trashbinBucket: copy.trashbinBucket,
				ageDays: copy.ageDays,
				sizeBytes: copy.sizeBytes,
				copyStatus: copy.copyStatus,
				copyReason: copy.copyReason,
			})),
		})),
	}

	return JSON.stringify(payload, null, 2)
}

/**
 * Serialize shadow duplicate audit report into a CWE-1236-safe CSV ledger.
 *
 * @param {object|null|undefined} report Shadow reclaim report.
 * @return {string} CSV document.
 */
export function buildShadowReclaimCsv(report) {
	const headers = [
		'Group ID',
		'Group Title',
		'Primary Category',
		'Has Live Anchor',
		'Shadow Only',
		'Cross-User Shadow',
		'Group Safe Shadow Reclaim Bytes',
		'Copy Path',
		'Logical Original Path',
		'Shadow Type',
		'User ID',
		'Appdata Instance',
		'Appdata Scope',
		'Age Days',
		'Size Bytes',
		'Copy Status',
		'Copy Reason',
	]

	const rows = [headers.map(h => escapeCsvCell(h)).join(',')]
	const items = report && Array.isArray(report.items) ? report.items : []

	for (const item of items) {
		for (const copy of item.copies) {
			rows.push([
				escapeCsvCell(item.groupId),
				escapeCsvCell(item.title),
				escapeCsvCell(item.primaryCategory),
				escapeCsvCell(item.hasLiveAnchor ? 'yes' : 'no'),
				escapeCsvCell(item.isShadowOnlyGroup ? 'yes' : 'no'),
				escapeCsvCell(item.isCrossUserShadow ? 'yes' : 'no'),
				escapeCsvCell(item.shadowReclaimableBytes),
				escapeCsvCell(copy.displayPath),
				escapeCsvCell(copy.logicalOriginalPath),
				escapeCsvCell(copy.shadowType),
				escapeCsvCell(copy.userId),
				escapeCsvCell(copy.instanceId),
				escapeCsvCell(copy.appdataScope),
				escapeCsvCell(copy.ageDays !== null ? copy.ageDays : ''),
				escapeCsvCell(copy.sizeBytes),
				escapeCsvCell(copy.copyStatus),
				escapeCsvCell(copy.copyReason),
			].join(','))
		}
	}

	return rows.join('\n')
}
