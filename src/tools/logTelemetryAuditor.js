/**
 * Pure Log Rotation, Telemetry Dump & Stale Cache Explosion Auditor.
 * Detects and audits duplicate operational, observability, and cache artifacts
 * across Nextcloud storage:
 * - Rotated & Active Service Logs (.log, .log.1..N, .log.YYYY-MM-DD, .log.gz/.zst/.bz2/.xz/.lz4, .out, .err, syslog, nextcloud.log*)
 * - Crash, Heap & Telemetry Dumps (.hprof, .phd, .heapsnapshot, .cpuprofile, .heapprofile, .dmp, .mdmp, .hdmp, .core, core.*, .pprof, .trace, .har, .etl, .evtx, .crash)
 * - Stale Browser, IDE, Compiler & App Cache Shards (.eslintcache, .tsbuildinfo, .stylelintcache, .pyc, .pyo, .cache, Cache_Data, Code Cache, GPUCache, CacheStorage, IndexedDB, opcache, twig, smarty, ccache, sess_*)
 * - Diagnostic & Packet Captures (.pcap, .pcapng, .pcap.gz, .ndjson, .jsonl, .jsonl.gz, .jsonl.zst, .sar, perf.data*)
 *
 * Guards active live/today logs and forensic crash/incident dumps before
 * emitting POSIX DRY_RUN=1 consolidation or hardlink plans, Nextcloud occ
 * rescan hints, CWE-1236-safe CSV reports, and structured JSON manifests.
 * Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const LOG_TELEMETRY_SCHEMA = 'duplicatefinder.log-telemetry-auditor.v1'

export const LOG_TELEMETRY_FAMILIES = Object.freeze([
	'all',
	'rotated-logs',
	'telemetry-dumps',
	'stale-cache-shards',
	'diagnostic-archives',
])

export const LOG_TELEMETRY_FAMILY_META = Object.freeze({
	'rotated-logs': {
		id: 'rotated-logs',
		label: 'Rotated & Service Logs',
		shortLabel: 'Logs',
	},
	'telemetry-dumps': {
		id: 'telemetry-dumps',
		label: 'Heap & Crash Dumps',
		shortLabel: 'Dumps',
	},
	'stale-cache-shards': {
		id: 'stale-cache-shards',
		label: 'Stale Cache Shards',
		shortLabel: 'Caches',
	},
	'diagnostic-archives': {
		id: 'diagnostic-archives',
		label: 'Telemetry & Packet Captures',
		shortLabel: 'Telemetry',
	},
})

export const LOG_TELEMETRY_PRESETS = Object.freeze([
	{
		id: 'all-telemetry-audit',
		name: 'All Logs, Dumps & Caches',
		description: 'Audit rotated logs, heap/core dumps, stale cache shards, and packet telemetry while guarding live today logs and forensic vaults.',
		familyFilter: 'all',
		strategy: 'consolidate-purge',
		survivorRule: 'active-or-newest-first',
		protectActiveLogs: true,
		protectForensicDumps: true,
		protectCompressedRotated: false,
		liveGuardHours: 24,
		staleAfterDays: 7,
		minSizeMb: 0,
	},
	{
		id: 'rotated-logs-surge',
		name: 'Rotated Log Surge',
		description: 'Protect live today service logs while consolidating duplicated rotated .log.N/.gz/.zst archives across nodes and backups.',
		familyFilter: 'rotated-logs',
		strategy: 'consolidate-purge',
		survivorRule: 'compressed-or-canonical-first',
		protectActiveLogs: true,
		protectForensicDumps: true,
		protectCompressedRotated: false,
		liveGuardHours: 24,
		staleAfterDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'crash-heap-forensics',
		name: 'Heap & Core Forensics',
		description: 'Shield incident/post-mortem .hprof, .dmp, and core dumps while hardlinking or reclaiming stray copies in /tmp or Downloads.',
		familyFilter: 'telemetry-dumps',
		strategy: 'hardlink-preserve',
		survivorRule: 'forensic-vault-first',
		protectActiveLogs: true,
		protectForensicDumps: true,
		protectCompressedRotated: false,
		liveGuardHours: 72,
		staleAfterDays: 30,
		minSizeMb: 0,
	},
	{
		id: 'stale-cache-purge',
		name: 'Stale Cache Explosion',
		description: 'Reclaim duplicated browser, IDE, compiler, and Nextcloud cache shards older than the stale age threshold.',
		familyFilter: 'stale-cache-shards',
		strategy: 'consolidate-purge',
		survivorRule: 'newest-mtime',
		protectActiveLogs: true,
		protectForensicDumps: true,
		protectCompressedRotated: false,
		liveGuardHours: 12,
		staleAfterDays: 7,
		minSizeMb: 0,
	},
])

export const LOG_TELEMETRY_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'live-guarded',
	'forensic-guarded',
	'shielded',
])

export const LOG_TELEMETRY_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const LOG_TELEMETRY_STRATEGIES = Object.freeze([
	'consolidate-purge',
	'hardlink-preserve',
])

export const LOG_TELEMETRY_SURVIVOR_RULES = Object.freeze([
	'active-or-newest-first',
	'compressed-or-canonical-first',
	'forensic-vault-first',
	'oldest-mtime',
	'newest-mtime',
	'shortest-path',
])

const LOG_COMPRESSION_EXTS = new Set(['gz', 'bz2', 'xz', 'zst', 'lz4', 'zip'])

const ROTATED_LOG_BASENAME_PATTERNS = Object.freeze([
	/^nextcloud\.log(?:\.\d+|\.\d{4}-\d{2}-\d{2})?(?:\.(?:gz|bz2|xz|zst|lz4))?$/i,
	/^audit\.log(?:\.\d+|\.\d{4}-\d{2}-\d{2})?(?:\.(?:gz|bz2|xz|zst|lz4))?$/i,
	/^syslog(?:\.\d+|\.\d{4}-\d{2}-\d{2})?(?:\.(?:gz|bz2|xz|zst|lz4))?$/i,
	/^messages(?:\.\d+|\.\d{4}-\d{2}-\d{2})?(?:\.(?:gz|bz2|xz|zst|lz4))?$/i,
	/^dmesg(?:\.\d+|\.\d{4}-\d{2}-\d{2})?(?:\.(?:gz|bz2|xz|zst|lz4))?$/i,
	/^journal(?:\.\d+|\.\d{4}-\d{2}-\d{2})?(?:\.(?:gz|bz2|xz|zst|lz4))?$/i,
	/^.+?\.log\.\d+(?:\.(?:gz|bz2|xz|zst|lz4))?$/i,
	/^.+?\.log\.\d{4}-\d{2}-\d{2}(?:\.(?:gz|bz2|xz|zst|lz4))?$/i,
	/^.+?\.log\.(?:gz|bz2|xz|zst|lz4)$/i,
	/^.+?-(?:access|error|cron|worker|php-fpm|nginx|apache|debug)\.log(?:\.\d+|\.\d{4}-\d{2}-\d{2})?(?:\.(?:gz|bz2|xz|zst|lz4))?$/i,
])

const DUMP_EXTENSIONS = new Set([
	'hprof',
	'phd',
	'heapsnapshot',
	'cpuprofile',
	'heapprofile',
	'dmp',
	'mdmp',
	'hdmp',
	'core',
	'pprof',
	'trace',
	'har',
	'etl',
	'evtx',
	'crash',
])

const DIAGNOSTIC_ARCHIVE_EXTENSIONS = new Set([
	'pcap',
	'pcapng',
	'ndjson',
	'jsonl',
	'sar',
])

const CACHE_SHARD_EXACT_NAMES = new Set([
	'.eslintcache',
	'.stylelintcache',
	'.tsbuildinfo',
	'.parcel-cache',
	'cache_data',
	'data_0',
	'data_1',
	'data_2',
	'data_3',
	'index',
])

const CACHE_SHARD_EXTENSIONS = new Set([
	'pyc',
	'pyo',
	'cache',
	'tsbuildinfo',
	'eslintcache',
	'stylelintcache',
])

const LIVE_LOG_SEGMENT_RE = /(?:^|\/)(?:var\/log|logs?|service-logs|journal|syslog|appdata_[^/]+\/logs?)(?:\/|$)/i
const FORENSIC_SEGMENT_RE = /(?:^|\/)(?:forensics?|incidents?|postmortem|post-mortem|crashes?|crash-dumps|triage|evidence|escalation|secops)(?:\/|$)/i
const CACHE_PATH_SEGMENT_RE = /(?:^|\/)(?:cache_data|code\s+cache|gpucache|cachestorage|indexeddb|__pycache__|\.pytest_cache|\.mypy_cache|\.ruff_cache|\.sass-cache|\.parcel-cache|\.turbo|\.next\/cache|\.nuxt|\.vite|\.webpack|ccache|opcache|twig|smarty|files_external\/cache|\.cache|_cacache|pip\/http)(?:\/|$)/i
const EPHEMERAL_COPY_SEGMENT_RE = /(?:^|\/)(?:tmp|temp|downloads?|inbox|scratch|staging|export|exports|copy|copies|backup|backups|old|archive|archives)(?:\/|$)/i
const CANONICAL_NODE_SEGMENT_RE = /(?:^|\/)(?:var\/log|logs?|observability|telemetry|archive-logs|central-logs|siem)(?:\/|$)/i

const SECONDS_PER_HOUR = 3600

/**
 * Escape a string for safe inclusion inside POSIX single quotes.
 *
 * @param {string} value Raw path or shell token.
 * @return {string} Single-quoted POSIX shell literal.
 */
function escapePosixSingleQuote(value) {
	return `'${String(value || '').replace(/'/g, '\'"\'"\'')}'`
}

/**
 * Extract normalized path and lowercase basename from a file object.
 *
 * @param {object} file Duplicate file entry.
 * @return {{ normalizedPath: string, dirPath: string, basename: string, lowerBase: string }} Path breakdown.
 */
function parseFilePathParts(file) {
	const rawPath = (file && (file.path || file.name)) || ''
	const normalizedPath = normalizePathForDiff(rawPath) || String(rawPath || '')
	const slashIndex = normalizedPath.lastIndexOf('/')
	const dirPath = slashIndex > 0 ? normalizedPath.slice(0, slashIndex) : '/'
	const basename = slashIndex >= 0 ? normalizedPath.slice(slashIndex + 1) : normalizedPath
	return {
		normalizedPath,
		dirPath,
		basename,
		lowerBase: basename.toLowerCase(),
	}
}

/**
 * Normalize file modification time to integer epoch seconds when present.
 *
 * @param {object} file Duplicate file entry.
 * @return {number|null} Epoch seconds or null when missing.
 */
function getFileMtimeSec(file) {
	if (!file || typeof file !== 'object') {
		return null
	}
	const candidates = [file.mtime, file.modified, file.updatedAt, file.lastModified]
	for (const raw of candidates) {
		if (raw === null || raw === undefined || raw === '') {
			continue
		}
		if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
			return raw > 1e12 ? Math.round(raw / 1000) : Math.round(raw)
		}
		if (typeof raw === 'string') {
			const parsed = Date.parse(raw)
			if (Number.isFinite(parsed) && parsed > 0) {
				return Math.round(parsed / 1000)
			}
		}
	}
	return null
}

/**
 * Detect compression layer and rotation generation index from a filename.
 *
 * @param {string} lowerBase Lowercase filename.
 * @return {{ compression: string, rotationIndex: number|null, dateStamp: string|null, isRotatedVariant: boolean }} Rotation details.
 */
function parseRotationMetadata(lowerBase) {
	let working = lowerBase
	let compression = 'uncompressed'

	const extMatch = working.match(/\.([a-z0-9]+)$/)
	if (extMatch && LOG_COMPRESSION_EXTS.has(extMatch[1])) {
		compression = extMatch[1]
		working = working.slice(0, -extMatch[0].length)
	}

	let rotationIndex = null
	let dateStamp = null

	const numRotMatch = working.match(/\.(\d{1,4})$/)
	if (numRotMatch) {
		rotationIndex = Number(numRotMatch[1])
		working = working.slice(0, -numRotMatch[0].length)
	}

	const dateMatch = working.match(/[._-](\d{4}-\d{2}-\d{2})(?:$|[._-])/)
	if (dateMatch) {
		dateStamp = dateMatch[1]
	}

	const isRotatedVariant = rotationIndex !== null
		|| dateStamp !== null
		|| (compression !== 'uncompressed' && /\.log(?:\.|$)/i.test(lowerBase))

	return {
		compression,
		rotationIndex,
		dateStamp,
		isRotatedVariant,
	}
}

/**
 * Derive a logical log/dump/cache stem for matching rotation siblings in the same directory.
 *
 * @param {string} lowerBase Lowercase filename.
 * @return {string} Stem string.
 */
function extractArtifactStem(lowerBase) {
	let stem = lowerBase
	const compMatch = stem.match(/\.(gz|bz2|xz|zst|lz4|zip)$/)
	if (compMatch) {
		stem = stem.slice(0, -compMatch[0].length)
	}
	stem = stem.replace(/\.\d{1,4}$/, '')
	stem = stem.replace(/[._-]\d{4}-\d{2}-\d{2}$/, '')
	stem = stem.replace(/\.log$/i, '')
	return stem
}

/**
 * Classify a single file entry into log, telemetry dump, stale cache shard, or diagnostic archive.
 *
 * @param {object} file Duplicate file entry.
 * @return {object|null} Classification descriptor or null if outside domain scope.
 */
export function classifyLogTelemetryFile(file) {
	const { normalizedPath, dirPath, basename, lowerBase } = parseFilePathParts(file)
	if (!basename) {
		return null
	}

	const lowerPath = normalizedPath.toLowerCase()
	const rotation = parseRotationMetadata(lowerBase)
	const parts = lowerBase.split('.').filter(Boolean)
	const lastExt = parts.length > 1 ? parts[parts.length - 1] : ''
	const penultimateExt = parts.length > 2 ? parts[parts.length - 2] : ''

	// 1. Crash, Heap & Telemetry Dumps
	if (
		DUMP_EXTENSIONS.has(lastExt)
		|| (LOG_COMPRESSION_EXTS.has(lastExt) && DUMP_EXTENSIONS.has(penultimateExt))
		|| /^core\.\d+$/.test(lowerBase)
		|| /^java_pid\d+\.hprof$/i.test(lowerBase)
		|| /^javacore\.\d+/i.test(lowerBase)
		|| /^heapdump\.\d+/i.test(lowerBase)
		|| /^(?:sysdiagnose|support-bundle|crashreport)[._-]?/i.test(lowerBase)
	) {
		const isCoreOrHeap = /^(?:core(?:\.\d+)?|java_pid\d+\.hprof|heapdump|javacore)/i.test(lowerBase)
			|| ['hprof', 'phd', 'heapsnapshot', 'core', 'dmp', 'mdmp', 'hdmp'].includes(lastExt)
			|| ['hprof', 'phd', 'heapsnapshot', 'core', 'dmp', 'mdmp', 'hdmp'].includes(penultimateExt)
		return {
			family: 'telemetry-dumps',
			familyLabel: LOG_TELEMETRY_FAMILY_META['telemetry-dumps'].label,
			tier: isCoreOrHeap ? 'heap-core-dump' : 'diagnostic-profile',
			tierLabel: isCoreOrHeap ? 'Heap / Core Dump' : 'Telemetry / Crash Trace',
			extension: LOG_COMPRESSION_EXTS.has(lastExt) && penultimateExt ? `${penultimateExt}.${lastExt}` : (lastExt || 'core'),
			stem: extractArtifactStem(lowerBase),
			compression: rotation.compression,
			rotationIndex: rotation.rotationIndex,
			dateStamp: rotation.dateStamp,
			isRotatedVariant: rotation.isRotatedVariant,
			authorityBonus: isCoreOrHeap ? 18 : 12,
		}
	}

	// 2. Diagnostic & Packet Captures (.pcap, .ndjson, .jsonl, .sar, perf.data*)
	if (
		DIAGNOSTIC_ARCHIVE_EXTENSIONS.has(lastExt)
		|| (LOG_COMPRESSION_EXTS.has(lastExt) && DIAGNOSTIC_ARCHIVE_EXTENSIONS.has(penultimateExt))
		|| /^perf\.data(?:\.old)?$/i.test(lowerBase)
	) {
		return {
			family: 'diagnostic-archives',
			familyLabel: LOG_TELEMETRY_FAMILY_META['diagnostic-archives'].label,
			tier: 'telemetry-capture',
			tierLabel: 'Telemetry / Packet Archive',
			extension: LOG_COMPRESSION_EXTS.has(lastExt) && penultimateExt ? `${penultimateExt}.${lastExt}` : (lastExt || 'perf'),
			stem: extractArtifactStem(lowerBase),
			compression: rotation.compression,
			rotationIndex: rotation.rotationIndex,
			dateStamp: rotation.dateStamp,
			isRotatedVariant: rotation.isRotatedVariant,
			authorityBonus: 10,
		}
	}

	// 3. Rotated & Service Logs
	const matchesRotatedLogPattern = ROTATED_LOG_BASENAME_PATTERNS.some(re => re.test(lowerBase))
	const isPlainLogExt = lastExt === 'log' || ((lastExt === 'out' || lastExt === 'err') && /(?:^|\/)(?:logs?|var\/log|stdout|stderr|service)(?:\/|$)/i.test(lowerPath))
	if (matchesRotatedLogPattern || isPlainLogExt) {
		const isCompressed = rotation.compression !== 'uncompressed'
		const isRotated = rotation.isRotatedVariant
		return {
			family: 'rotated-logs',
			familyLabel: LOG_TELEMETRY_FAMILY_META['rotated-logs'].label,
			tier: isRotated ? (isCompressed ? 'rotated-compressed-log' : 'rotated-plain-log') : 'service-log',
			tierLabel: isRotated
				? (isCompressed ? 'Rotated Compressed Log' : 'Rotated Plain Log')
				: 'Service Log',
			extension: isCompressed && penultimateExt ? `${penultimateExt}.${lastExt}` : (lastExt || 'log'),
			stem: extractArtifactStem(lowerBase),
			compression: rotation.compression,
			rotationIndex: rotation.rotationIndex,
			dateStamp: rotation.dateStamp,
			isRotatedVariant: isRotated,
			authorityBonus: isCompressed ? 14 : 10,
		}
	}

	// 4. Stale Browser, IDE, Compiler & App Cache Shards
	const inCacheDirectory = CACHE_PATH_SEGMENT_RE.test(lowerPath)
	const isCacheName = CACHE_SHARD_EXACT_NAMES.has(lowerBase)
		|| CACHE_SHARD_EXTENSIONS.has(lastExt)
		|| /^sess_[a-z0-9]{10,}$/i.test(lowerBase)
		|| /^f_[0-9a-f]{6,}$/i.test(lowerBase)
	if (isCacheName || (inCacheDirectory && dirPath !== '/')) {
		return {
			family: 'stale-cache-shards',
			familyLabel: LOG_TELEMETRY_FAMILY_META['stale-cache-shards'].label,
			tier: inCacheDirectory ? 'cache-shard-tree' : 'incremental-cache-file',
			tierLabel: inCacheDirectory ? 'Browser / App Cache Shard' : 'Incremental Build Cache',
			extension: lastExt || 'cache',
			stem: extractArtifactStem(lowerBase),
			compression: rotation.compression,
			rotationIndex: null,
			dateStamp: rotation.dateStamp,
			isRotatedVariant: false,
			authorityBonus: 4,
		}
	}

	return null
}

/**
 * Determine the reference epoch seconds used to compute live-log and stale-cache age.
 *
 * @param {Array<object>} groups Raw duplicate groups.
 * @param {number|null|undefined} explicitReferenceSec Optional explicit reference timestamp.
 * @return {number} Reference timestamp in epoch seconds.
 */
function resolveReferenceTimeSec(groups, explicitReferenceSec) {
	if (typeof explicitReferenceSec === 'number' && Number.isFinite(explicitReferenceSec) && explicitReferenceSec > 0) {
		return Math.round(explicitReferenceSec)
	}
	let maxMtime = 0
	for (const group of groups || []) {
		for (const file of (group && group.files) || []) {
			const mtime = getFileMtimeSec(file)
			if (mtime && mtime > maxMtime) {
				maxMtime = mtime
			}
		}
	}
	return maxMtime > 0 ? maxMtime : Math.round(Date.now() / 1000)
}

/**
 * Format UTC YYYY-MM-DD date string from epoch seconds.
 *
 * @param {number} epochSec Epoch seconds.
 * @return {string} Date string YYYY-MM-DD.
 */
function toUtcDateStamp(epochSec) {
	const d = new Date(epochSec * 1000)
	if (Number.isNaN(d.getTime())) {
		return ''
	}
	return d.toISOString().slice(0, 10)
}

/**
 * Build a directory sibling index across all loaded files to detect rotation peers
 * and uncompressed rotated siblings.
 *
 * @param {Array<object>} groups Duplicate groups.
 * @return {Map<string, Array<object>>} Map keyed by directory path + stem.
 */
function buildRotationSiblingIndex(groups) {
	const index = new Map()
	for (const group of groups || []) {
		for (const file of (group && group.files) || []) {
			const cls = classifyLogTelemetryFile(file)
			if (!cls) {
				continue
			}
			const { normalizedPath, dirPath, basename } = parseFilePathParts(file)
			const key = `${dirPath.toLowerCase()}::${cls.stem}`
			if (!index.has(key)) {
				index.set(key, [])
			}
			index.get(key).push({
				normalizedPath,
				basename,
				size: Number(file && file.size) || 0,
				family: cls.family,
				compression: cls.compression,
				rotationIndex: cls.rotationIndex,
			})
		}
	}
	return index
}

/**
 * Evaluate per-file operational safety context (live log guard, forensic guard, staleness, authority).
 *
 * @param {object} file Duplicate file entry.
 * @param {object} cls Classification descriptor.
 * @param {object} options Normalized analysis options.
 * @param {Map<string, Array<object>>} siblingIndex Directory rotation sibling index.
 * @return {object} Safety and operational context.
 */
function buildMemberOperationalContext(file, cls, options, siblingIndex) {
	const { normalizedPath, dirPath, lowerBase } = parseFilePathParts(file)
	const lowerPath = normalizedPath.toLowerCase()
	const mtimeSec = getFileMtimeSec(file)
	const ageHours = mtimeSec !== null ? Math.max(0, (options.referenceTimeSec - mtimeSec) / SECONDS_PER_HOUR) : null
	const ageDays = ageHours !== null ? ageHours / 24 : null

	const isLivePath = LIVE_LOG_SEGMENT_RE.test(lowerPath)
	const isForensicPath = FORENSIC_SEGMENT_RE.test(lowerPath)
	const isEphemeralPath = EPHEMERAL_COPY_SEGMENT_RE.test(lowerPath)
	const isCanonicalNodePath = CANONICAL_NODE_SEGMENT_RE.test(lowerPath)

	const matchesTodayDate = Boolean(cls.dateStamp && options.todayDateStamp && cls.dateStamp === options.todayDateStamp)
	const isWithinLiveWindow = ageHours !== null && ageHours <= options.liveGuardHours

	const isActiveLiveLog = (
		cls.family === 'rotated-logs'
		&& !cls.isRotatedVariant
		&& (isLivePath || matchesTodayDate || isWithinLiveWindow)
	) || (
		cls.family === 'rotated-logs'
		&& matchesTodayDate
		&& cls.compression === 'uncompressed'
		&& isLivePath
	)

	const isForensicProtected = cls.family === 'telemetry-dumps' && (
		isForensicPath
		|| (ageHours !== null && ageHours <= options.liveGuardHours * 3 && !isEphemeralPath)
	)

	const isStaleCache = cls.family === 'stale-cache-shards'
		&& (ageDays === null ? true : ageDays >= options.staleAfterDays)

	const isRecentHotCache = cls.family === 'stale-cache-shards'
		&& ageHours !== null
		&& ageHours <= Math.min(options.liveGuardHours, 12)
		&& !isEphemeralPath

	const siblingKey = `${dirPath.toLowerCase()}::${cls.stem}`
	const siblings = (siblingIndex.get(siblingKey) || []).filter(item => item.normalizedPath !== normalizedPath)
	const compressedSiblingsCount = siblings.filter(item => item.compression !== 'uncompressed').length
	const uncompressedRotatedRisk = cls.family === 'rotated-logs'
		&& cls.isRotatedVariant
		&& cls.compression === 'uncompressed'
		&& !isActiveLiveLog

	let authorityScore = cls.authorityBonus
	if (isActiveLiveLog) {
		authorityScore += 100
	}
	if (isForensicProtected) {
		authorityScore += 85
	}
	if (isCanonicalNodePath) {
		authorityScore += 30
	}
	if (cls.compression !== 'uncompressed') {
		authorityScore += 12
	}
	if (isEphemeralPath) {
		authorityScore -= 25
	}

	return {
		normalizedPath,
		dirPath,
		lowerBase,
		mtimeSec,
		ageHours: ageHours !== null ? Math.round(ageHours * 10) / 10 : null,
		ageDays: ageDays !== null ? Math.round(ageDays * 10) / 10 : null,
		isLivePath,
		isForensicPath,
		isEphemeralPath,
		isCanonicalNodePath,
		matchesTodayDate,
		isActiveLiveLog,
		isForensicProtected,
		isStaleCache,
		isRecentHotCache,
		uncompressedRotatedRisk,
		rotationSiblingsCount: siblings.length,
		compressedSiblingsCount,
		authorityScore,
		siblings,
	}
}

/**
 * Score a candidate survivor member under the selected survivor ordering rule.
 *
 * @param {object} member Enriched member entry.
 * @param {string} survivorRule Survivor ordering strategy.
 * @return {number} Numeric rank score (higher wins).
 */
function scoreSurvivor(member, survivorRule) {
	const ctx = member.context
	const mtime = ctx.mtimeSec || 0
	const pathPenalty = -member.normalizedPath.length

	if (survivorRule === 'compressed-or-canonical-first') {
		return (
			(ctx.isActiveLiveLog ? 100000 : 0)
			+ (member.compression !== 'uncompressed' ? 40000 : 0)
			+ (ctx.isCanonicalNodePath ? 20000 : 0)
			+ (ctx.isEphemeralPath ? -15000 : 0)
			+ pathPenalty
		)
	}

	if (survivorRule === 'forensic-vault-first') {
		return (
			(ctx.isForensicPath ? 100000 : 0)
			+ (ctx.isForensicProtected ? 50000 : 0)
			+ (ctx.isCanonicalNodePath ? 20000 : 0)
			+ (ctx.isEphemeralPath ? -20000 : 0)
			+ pathPenalty
		)
	}

	if (survivorRule === 'oldest-mtime') {
		return (mtime > 0 ? -mtime : -1e12) + pathPenalty
	}

	if (survivorRule === 'newest-mtime') {
		return mtime + pathPenalty
	}

	if (survivorRule === 'shortest-path') {
		return pathPenalty * 100 + ctx.authorityScore
	}

	// Default: active-or-newest-first
	const isVarLog = /(?:^|\/)var\/log(?:\/|$)/i.test(member.normalizedPath)
	const isDedicatedForensicVault = /(?:^|\/)(?:forensics?|incidents?|postmortem|post-mortem|evidence)(?:\/|$)/i.test(member.normalizedPath)
	return (
		(ctx.isActiveLiveLog ? 120000 : 0)
		+ (isVarLog ? 15000 : 0)
		+ (ctx.isForensicProtected ? 80000 : 0)
		+ (isDedicatedForensicVault ? 20000 : 0)
		+ (ctx.isCanonicalNodePath ? 30000 : 0)
		+ (ctx.isEphemeralPath ? -20000 : 0)
		+ (mtime / 60)
		+ pathPenalty
	)
}

/**
 * Normalize analysis options with safe defaults.
 *
 * @param {object} [rawOptions] Caller options.
 * @param {Array<object>} [groups] Raw duplicate groups.
 * @return {object} Normalized options.
 */
function normalizeAuditOptions(rawOptions = {}, groups = []) {
	const familyFilter = LOG_TELEMETRY_FAMILIES.includes(rawOptions.familyFilter)
		? rawOptions.familyFilter
		: 'all'
	const verdictFilter = LOG_TELEMETRY_VERDICT_FILTERS.includes(rawOptions.verdictFilter)
		? rawOptions.verdictFilter
		: 'all'
	const sortMode = LOG_TELEMETRY_SORT_MODES.includes(rawOptions.sortMode)
		? rawOptions.sortMode
		: 'reclaim_desc'
	const strategy = LOG_TELEMETRY_STRATEGIES.includes(rawOptions.strategy)
		? rawOptions.strategy
		: 'consolidate-purge'
	const survivorRule = LOG_TELEMETRY_SURVIVOR_RULES.includes(rawOptions.survivorRule)
		? rawOptions.survivorRule
		: 'active-or-newest-first'

	const liveGuardHours = Number.isFinite(Number(rawOptions.liveGuardHours)) && Number(rawOptions.liveGuardHours) >= 0
		? Number(rawOptions.liveGuardHours)
		: 24
	const staleAfterDays = Number.isFinite(Number(rawOptions.staleAfterDays)) && Number(rawOptions.staleAfterDays) >= 0
		? Number(rawOptions.staleAfterDays)
		: 7
	const minSizeMb = Number.isFinite(Number(rawOptions.minSizeMb)) && Number(rawOptions.minSizeMb) >= 0
		? Number(rawOptions.minSizeMb)
		: 0

	const referenceTimeSec = resolveReferenceTimeSec(groups, rawOptions.referenceTimeSec)

	return {
		familyFilter,
		verdictFilter,
		sortMode,
		strategy,
		survivorRule,
		protectActiveLogs: rawOptions.protectActiveLogs !== false,
		protectForensicDumps: rawOptions.protectForensicDumps !== false,
		protectCompressedRotated: Boolean(rawOptions.protectCompressedRotated),
		liveGuardHours,
		staleAfterDays,
		minSizeMb,
		searchQuery: String(rawOptions.searchQuery || '').trim().toLowerCase(),
		forceKeepKeys: new Set(Array.isArray(rawOptions.forceKeepKeys) ? rawOptions.forceKeepKeys : []),
		excludeKeys: new Set(Array.isArray(rawOptions.excludeKeys) ? rawOptions.excludeKeys : []),
		referenceTimeSec,
		todayDateStamp: toUtcDateStamp(referenceTimeSec),
	}
}

/**
 * Analyze Nextcloud duplicate groups for log rotation, telemetry dumps, and stale cache explosions.
 *
 * @param {Array<object>} duplicates Duplicate groups from Nextcloud DuplicateFinder API.
 * @param {object} [rawOptions] Audit configuration options.
 * @return {object} Complete deterministic audit analysis with summary, counts, and clusters.
 */
export function analyzeLogTelemetryDuplicates(duplicates, rawOptions = {}) {
	const groups = Array.isArray(duplicates) ? duplicates.filter(Boolean) : []
	const options = normalizeAuditOptions(rawOptions, groups)
	const siblingIndex = buildRotationSiblingIndex(groups)

	const familyCounts = {
		all: 0,
		'rotated-logs': 0,
		'telemetry-dumps': 0,
		'stale-cache-shards': 0,
		'diagnostic-archives': 0,
	}

	const rawClusters = []

	for (const group of groups) {
		const files = Array.isArray(group.files) ? group.files : []
		if (files.length < 2) {
			continue
		}

		const classifiedEntries = []
		for (const file of files) {
			const cls = classifyLogTelemetryFile(file)
			if (!cls) {
				continue
			}
			classifiedEntries.push({ file, cls })
		}

		if (classifiedEntries.length < 2) {
			continue
		}

		const primary = classifiedEntries[0]
		const rawInfo = computeGroupReclaimableInfo(group)
		const totalBytes = classifiedEntries.reduce((sum, entry) => sum + (Number(entry.file.size) || Number(group.size) || 0), 0)
		const singleSize = Number(primary.file.size) || Number(group.size) || 0

		if (options.minSizeMb > 0 && rawInfo.reclaimableBytes < options.minSizeMb * 1024 * 1024) {
			continue
		}

		const members = classifiedEntries.map(({ file, cls }) => {
			const { normalizedPath, basename } = parseFilePathParts(file)
			const rawKey = getFileSelectionKey(file)
			const selectionKey = rawKey !== null && rawKey !== undefined
				? `${group.id || 'g'}:${rawKey}`
				: `${group.id || 'g'}:${normalizedPath}`
			const context = buildMemberOperationalContext(file, cls, options, siblingIndex)
			return {
				selectionKey,
				fileId: file.id || null,
				basename,
				normalizedPath,
				size: Number(file.size) || singleSize,
				formattedSize: formatBytes(Number(file.size) || singleSize),
				formattedMtime: context.mtimeSec ? formatFileModifiedTime(context.mtimeSec) : '',
				family: cls.family,
				familyLabel: cls.familyLabel,
				tier: cls.tier,
				tierLabel: cls.tierLabel,
				extension: cls.extension,
				compression: cls.compression,
				rotationIndex: cls.rotationIndex,
				dateStamp: cls.dateStamp,
				isRotatedVariant: cls.isRotatedVariant,
				context,
				role: 'duplicate',
				verdict: 'reclaim-stale-duplicate',
				verdictLabel: 'Reclaim Stale Copy',
				verdictReason: '',
				actionKind: 'reclaim',
			}
		})

		const ranked = [...members].sort((a, b) => {
			const diff = scoreSurvivor(b, options.survivorRule) - scoreSurvivor(a, options.survivorRule)
			if (diff !== 0) {
				return diff
			}
			return a.normalizedPath.localeCompare(b.normalizedPath)
		})

		const nonExcluded = ranked.filter(m => !options.excludeKeys.has(m.selectionKey))
		const survivor = nonExcluded[0] || ranked[0]

		let reclaimableBytes = 0
		let reclaimableCopiesCount = 0
		let shieldedCopiesCount = 0
		let liveGuardedCopiesCount = 0
		let forensicGuardedCopiesCount = 0
		let uncompressedRotatedCount = 0
		let staleCacheCopiesCount = 0

		for (const member of members) {
			if (member.context.uncompressedRotatedRisk) {
				uncompressedRotatedCount += 1
			}
			if (member.context.isStaleCache) {
				staleCacheCopiesCount += 1
			}

			if (options.excludeKeys.has(member.selectionKey)) {
				member.role = 'excluded'
				member.verdict = 'excluded'
				member.verdictLabel = 'Excluded from Plan'
				member.verdictReason = 'Manually excluded from remediation plan.'
				member.actionKind = 'skip'
				continue
			}

			if (member.selectionKey === survivor.selectionKey) {
				member.role = 'survivor'
				member.verdict = 'keep-canonical-anchor'
				member.verdictLabel = member.context.isActiveLiveLog
					? 'Keep Live Active Log'
					: (member.context.isForensicProtected ? 'Keep Forensic Anchor' : 'Keep Canonical Copy')
				member.verdictReason = member.context.isActiveLiveLog
					? 'Active service log within live guard window; retained as primary anchor.'
					: (member.context.isForensicProtected
						? 'Protected incident/crash dump retained as primary forensic anchor.'
						: 'Selected canonical survivor under active ordering policy.')
				member.actionKind = 'keep'
				continue
			}

			if (options.forceKeepKeys.has(member.selectionKey)) {
				member.role = 'shielded'
				member.verdict = 'blocked-manual-shield'
				member.verdictLabel = 'Manual Shield'
				member.verdictReason = 'Manually pinned/shielded by operator.'
				member.actionKind = 'blocked'
				shieldedCopiesCount += 1
				continue
			}

			if (options.protectActiveLogs && (member.context.isActiveLiveLog || member.context.isRecentHotCache)) {
				member.role = 'shielded'
				member.verdict = 'blocked-active-live-log'
				member.verdictLabel = member.family === 'stale-cache-shards' ? 'Blocked: Hot Active Cache' : 'Blocked: Live Today Log'
				member.verdictReason = member.family === 'stale-cache-shards'
					? `Active cache shard modified ${member.context.ageHours ?? 0}h ago; shielded by live guard.`
					: `Active live log (${member.context.ageHours ?? 0}h old / today date match); protected against log truncation or inode loss.`
				member.actionKind = 'blocked'
				shieldedCopiesCount += 1
				liveGuardedCopiesCount += 1
				continue
			}

			if (options.protectForensicDumps && member.context.isForensicProtected) {
				member.role = 'shielded'
				member.verdict = 'blocked-forensic-dump'
				member.verdictLabel = 'Blocked: Forensic Dump'
				member.verdictReason = 'Crash/heap dump located in forensic vault or recent post-mortem window; shielded from deletion.'
				member.actionKind = 'blocked'
				shieldedCopiesCount += 1
				forensicGuardedCopiesCount += 1
				continue
			}

			if (options.protectCompressedRotated && member.family === 'rotated-logs' && member.isRotatedVariant && member.compression !== 'uncompressed') {
				member.role = 'shielded'
				member.verdict = 'blocked-manual-shield'
				member.verdictLabel = 'Blocked: Compressed Archive'
				member.verdictReason = 'Compressed rotated archive shield is enabled.'
				member.actionKind = 'blocked'
				shieldedCopiesCount += 1
				continue
			}

			if (options.strategy === 'hardlink-preserve') {
				member.role = 'hardlink'
				member.verdict = 'hardlink-telemetry-copy'
				member.verdictLabel = 'Hardlink Copy'
				member.verdictReason = 'Safe to replace with POSIX hardlink to canonical survivor (same filesystem device verified).'
				member.actionKind = 'hardlink'
			} else {
				member.role = 'reclaim'
				member.verdict = 'reclaim-stale-duplicate'
				member.verdictLabel = 'Reclaim Stale Copy'
				member.verdictReason = member.context.isEphemeralPath
					? 'Redundant copy in temporary/backup/download path; safe to reclaim.'
					: 'Redundant duplicate telemetry/log/cache copy; safe to reclaim.'
				member.actionKind = 'reclaim'
			}

			reclaimableBytes += member.size
			reclaimableCopiesCount += 1
		}

		let clusterRiskState = 'reclaimable'
		if (liveGuardedCopiesCount > 0) {
			clusterRiskState = 'live-guarded'
		} else if (forensicGuardedCopiesCount > 0) {
			clusterRiskState = 'forensic-guarded'
		} else if (reclaimableCopiesCount === 0 && shieldedCopiesCount > 0) {
			clusterRiskState = 'shielded'
		}

		const cluster = {
			groupKey: `lt-${group.id || rawClusters.length + 1}`,
			primaryGroupId: group.id || null,
			hash: group.hash || '',
			displayName: primary.cls.stem || primary.file.name || `artifact-${group.id}`,
			basename: parseFilePathParts(primary.file).basename,
			extension: primary.cls.extension,
			family: primary.cls.family,
			familyLabel: primary.cls.familyLabel,
			tier: primary.cls.tier,
			tierLabel: primary.cls.tierLabel,
			compression: primary.cls.compression,
			copyCount: members.length,
			singleSize,
			formattedSingleSize: formatBytes(singleSize),
			totalBytes,
			rawReclaimableBytes: rawInfo.reclaimableBytes,
			reclaimableBytes,
			formattedReclaimableBytes: formatBytes(reclaimableBytes),
			reclaimableCopiesCount,
			shieldedCopiesCount,
			liveGuardedCopiesCount,
			forensicGuardedCopiesCount,
			uncompressedRotatedCount,
			staleCacheCopiesCount,
			hasActiveLiveMember: members.some(m => m.context.isActiveLiveLog),
			hasForensicMember: members.some(m => m.context.isForensicProtected),
			clusterRiskState,
			survivor,
			members,
		}

		rawClusters.push(cluster)
	}

	const searchFiltered = rawClusters.filter(cluster => {
		if (!options.searchQuery) {
			return true
		}
		const q = options.searchQuery
		if (
			cluster.displayName.toLowerCase().includes(q)
			|| cluster.basename.toLowerCase().includes(q)
			|| cluster.extension.toLowerCase().includes(q)
			|| cluster.familyLabel.toLowerCase().includes(q)
			|| cluster.tierLabel.toLowerCase().includes(q)
		) {
			return true
		}
		return cluster.members.some(m => m.normalizedPath.toLowerCase().includes(q))
	})

	for (const cluster of searchFiltered) {
		familyCounts.all += 1
		if (Object.prototype.hasOwnProperty.call(familyCounts, cluster.family)) {
			familyCounts[cluster.family] += 1
		}
	}

	const clusters = searchFiltered.filter(cluster => {
		if (options.familyFilter !== 'all' && cluster.family !== options.familyFilter) {
			return false
		}
		if (options.verdictFilter === 'reclaimable' && cluster.reclaimableCopiesCount === 0) {
			return false
		}
		if (options.verdictFilter === 'live-guarded' && cluster.liveGuardedCopiesCount === 0 && !cluster.hasActiveLiveMember) {
			return false
		}
		if (options.verdictFilter === 'forensic-guarded' && cluster.forensicGuardedCopiesCount === 0 && !cluster.hasForensicMember) {
			return false
		}
		if (options.verdictFilter === 'shielded' && cluster.shieldedCopiesCount === 0 && cluster.clusterRiskState !== 'shielded') {
			return false
		}
		return true
	})

	clusters.sort((a, b) => {
		if (options.sortMode === 'risk_desc') {
			const riskA = a.liveGuardedCopiesCount * 4 + a.forensicGuardedCopiesCount * 3 + a.uncompressedRotatedCount * 2 + a.shieldedCopiesCount
			const riskB = b.liveGuardedCopiesCount * 4 + b.forensicGuardedCopiesCount * 3 + b.uncompressedRotatedCount * 2 + b.shieldedCopiesCount
			if (riskA !== riskB) {
				return riskB - riskA
			}
		} else if (options.sortMode === 'copies_desc') {
			if (a.copyCount !== b.copyCount) {
				return b.copyCount - a.copyCount
			}
		} else if (options.sortMode === 'name_asc') {
			return a.basename.localeCompare(b.basename)
		}

		if (a.reclaimableBytes !== b.reclaimableBytes) {
			return b.reclaimableBytes - a.reclaimableBytes
		}
		return a.basename.localeCompare(b.basename)
	})

	const totalRawDuplicateBytes = clusters.reduce((sum, c) => sum + c.rawReclaimableBytes, 0)
	const totalReclaimableBytes = clusters.reduce((sum, c) => sum + c.reclaimableBytes, 0)
	const totalReclaimableCopiesCount = clusters.reduce((sum, c) => sum + c.reclaimableCopiesCount, 0)
	const totalShieldedCopiesCount = clusters.reduce((sum, c) => sum + c.shieldedCopiesCount, 0)
	const totalLiveGuardedClusters = clusters.filter(c => c.hasActiveLiveMember).length
	const totalForensicClusters = clusters.filter(c => c.hasForensicMember).length
	const totalUncompressedRotatedCount = clusters.reduce((sum, c) => sum + c.uncompressedRotatedCount, 0)
	const efficiencyPct = totalRawDuplicateBytes > 0
		? Math.round((totalReclaimableBytes / totalRawDuplicateBytes) * 100)
		: 0

	return {
		schema: LOG_TELEMETRY_SCHEMA,
		options: {
			familyFilter: options.familyFilter,
			verdictFilter: options.verdictFilter,
			sortMode: options.sortMode,
			strategy: options.strategy,
			survivorRule: options.survivorRule,
			protectActiveLogs: options.protectActiveLogs,
			protectForensicDumps: options.protectForensicDumps,
			protectCompressedRotated: options.protectCompressedRotated,
			liveGuardHours: options.liveGuardHours,
			staleAfterDays: options.staleAfterDays,
			minSizeMb: options.minSizeMb,
			referenceTimeSec: options.referenceTimeSec,
			todayDateStamp: options.todayDateStamp,
		},
		summary: {
			totalClustersCount: clusters.length,
			totalRawDuplicateBytes,
			formattedRawDuplicateBytes: formatBytes(totalRawDuplicateBytes),
			totalReclaimableBytes,
			formattedReclaimableBytes: formatBytes(totalReclaimableBytes),
			totalReclaimableCopiesCount,
			totalShieldedCopiesCount,
			totalLiveGuardedClusters,
			totalForensicClusters,
			totalUncompressedRotatedCount,
			efficiencyPct,
			familyCounts,
		},
		clusters,
	}
}

/**
 * Extract Nextcloud user root hints from normalized paths for occ files:scan suggestions.
 *
 * @param {Array<string>} paths Normalized file paths.
 * @return {Array<string>} Unique relative scan paths.
 */
function extractOccScanPaths(paths) {
	const roots = new Set()
	for (const p of paths) {
		const clean = String(p || '').replace(/^\/+/, '')
		if (!clean) {
			continue
		}
		const parts = clean.split('/')
		if (parts.length >= 2 && parts[1] === 'files') {
			roots.add(`/${parts[0]}/files/${parts[2] || ''}`.replace(/\/+$/, ''))
		} else {
			roots.add(`/${parts[0]}`)
		}
	}
	return Array.from(roots).sort()
}

/**
 * Build a POSIX DRY_RUN=1 remediation script for log, telemetry dump, and stale cache consolidation.
 *
 * @param {object} analysis Output from analyzeLogTelemetryDuplicates.
 * @param {object} [options] Script options.
 * @param {string} [options.dataRoot='/var/www/nextcloud/data'] Nextcloud data root directory.
 * @return {string} POSIX bash script with single-quoted paths and DRY_RUN=1 safety.
 */
export function buildLogTelemetryScript(analysis, options = {}) {
	const dataRoot = String(options.dataRoot || '/var/www/nextcloud/data').replace(/\/+$/, '') || '/var/www/nextcloud/data'
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const strategy = (analysis && analysis.options && analysis.options.strategy) || 'consolidate-purge'

	const operations = []
	const affectedPaths = []

	for (const cluster of clusters) {
		const survivorPath = cluster && cluster.survivor ? cluster.survivor.normalizedPath : ''
		if (!survivorPath) {
			continue
		}
		for (const member of cluster.members || []) {
			if (member.actionKind !== 'reclaim' && member.actionKind !== 'hardlink') {
				continue
			}
			operations.push({
				clusterName: cluster.basename,
				family: cluster.familyLabel,
				actionKind: member.actionKind,
				survivorPath,
				targetPath: member.normalizedPath,
				size: member.size,
			})
			affectedPaths.push(member.normalizedPath)
		}
	}

	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# Log Rotation, Telemetry Dump & Stale Cache Explosion Auditor',
		`# Strategy: ${strategy} | Safe default: DRY_RUN=1 (preview only)`,
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		`DATA_ROOT=${escapePosixSingleQuote(dataRoot)}`,
		'',
		'resolve_path() {',
		'  local rel="$1"',
		'  printf \'%s/%s\' "$DATA_ROOT" "$' + '{rel#/}"',
		'}',
		'',
	]

	if (operations.length === 0) {
		lines.push('echo "No reclaimable or hardlinkable log, telemetry, or cache targets under current guards."')
		return lines.join('\n')
	}

	lines.push('reclaim_copy() {')
	lines.push('  local rel="$1"')
	lines.push('  local full')
	lines.push('  full="$(resolve_path "$rel")"')
	lines.push('  if [ "$DRY_RUN" = "1" ]; then')
	lines.push('    printf \'[DRY_RUN] rm -f -- %s\\n\' "$full"')
	lines.push('  else')
	lines.push('    rm -f -- "$full"')
	lines.push('  fi')
	lines.push('}')
	lines.push('')
	lines.push('hardlink_copy() {')
	lines.push('  local survivor_rel="$1"')
	lines.push('  local target_rel="$2"')
	lines.push('  local survivor_full target_full')
	lines.push('  survivor_full="$(resolve_path "$survivor_rel")"')
	lines.push('  target_full="$(resolve_path "$target_rel")"')
	lines.push('  if [ "$DRY_RUN" = "1" ]; then')
	lines.push('    printf \'[DRY_RUN] ln -f -- %s %s\\n\' "$survivor_full" "$target_full"')
	lines.push('  else')
	lines.push('    local s_dev t_dev')
	lines.push('    s_dev="$(stat -c %d "$survivor_full" 2>/dev/null || stat -f %d "$survivor_full")"')
	lines.push('    t_dev="$(stat -c %d "$target_full" 2>/dev/null || stat -f %d "$target_full")"')
	lines.push('    if [ "$s_dev" != "$t_dev" ]; then')
	lines.push('      printf \'[SKIP cross-device] %s\\n\' "$target_full" >&2')
	lines.push('      return 0')
	lines.push('    fi')
	lines.push('    ln -f -- "$survivor_full" "$target_full"')
	lines.push('  fi')
	lines.push('}')
	lines.push('')

	for (const op of operations) {
		lines.push(`# ${op.family}: ${op.clusterName} (${formatBytes(op.size)})`)
		if (op.actionKind === 'hardlink') {
			lines.push(`hardlink_copy ${escapePosixSingleQuote(op.survivorPath)} ${escapePosixSingleQuote(op.targetPath)}`)
		} else {
			lines.push(`reclaim_copy ${escapePosixSingleQuote(op.targetPath)}`)
		}
	}

	const scanPaths = extractOccScanPaths(affectedPaths)
	if (scanPaths.length > 0) {
		lines.push('')
		lines.push('# Nextcloud metadata rescan & log hygiene verification after DRY_RUN=0:')
		for (const scanPath of scanPaths) {
			lines.push(`# sudo -u www-data php occ files:scan --path=${escapePosixSingleQuote(scanPath)}`)
		}
		lines.push('# sudo -u www-data php occ log:file --enable')
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe CSV audit report for log/telemetry/cache clusters.
 *
 * @param {object} analysis Output from analyzeLogTelemetryDuplicates.
 * @return {string} RFC-4180 CSV string with CWE-1236 formula escaping.
 */
export function buildLogTelemetryCsvReport(analysis) {
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const headers = [
		'Cluster Key',
		'Artifact Name',
		'Extension',
		'Family',
		'Tier',
		'Compression',
		'Risk State',
		'Member Role',
		'Verdict',
		'Action',
		'Path',
		'Size Bytes',
		'Age Hours',
		'Live Log Guard',
		'Forensic Guard',
		'Stale Cache',
		'Authority Score',
		'Modified',
	]

	const rows = [headers.map(h => escapeCsvCell(h)).join(',')]
	for (const cluster of clusters) {
		for (const member of cluster.members || []) {
			const row = [
				cluster.groupKey,
				cluster.basename,
				member.extension,
				cluster.familyLabel,
				member.tierLabel,
				member.compression,
				cluster.clusterRiskState,
				member.role,
				member.verdictLabel,
				member.actionKind,
				member.normalizedPath,
				member.size,
				member.context.ageHours !== null ? member.context.ageHours : '',
				member.context.isActiveLiveLog ? 'yes' : 'no',
				member.context.isForensicProtected ? 'yes' : 'no',
				member.context.isStaleCache ? 'yes' : 'no',
				member.context.authorityScore,
				member.formattedMtime || '',
			]
			rows.push(row.map(cell => escapeCsvCell(cell)).join(','))
		}
	}

	return rows.join('\r\n')
}

/**
 * Build a structured JSON audit manifest for log, telemetry dump, and stale cache clusters.
 *
 * @param {object} analysis Output from analyzeLogTelemetryDuplicates.
 * @param {string} [generatedAt] Optional ISO timestamp override.
 * @return {string} Pretty-printed JSON manifest.
 */
export function buildLogTelemetryJsonReport(analysis, generatedAt = new Date().toISOString()) {
	const safeAnalysis = analysis && typeof analysis === 'object' ? analysis : { summary: {}, clusters: [], options: {} }
	return JSON.stringify({
		schema: LOG_TELEMETRY_SCHEMA,
		generatedAt,
		options: safeAnalysis.options || {},
		summary: safeAnalysis.summary || {},
		clusters: (safeAnalysis.clusters || []).map(cluster => ({
			groupKey: cluster.groupKey,
			primaryGroupId: cluster.primaryGroupId,
			hash: cluster.hash,
			basename: cluster.basename,
			extension: cluster.extension,
			family: cluster.family,
			tier: cluster.tier,
			compression: cluster.compression,
			clusterRiskState: cluster.clusterRiskState,
			copyCount: cluster.copyCount,
			reclaimableBytes: cluster.reclaimableBytes,
			survivorPath: cluster.survivor ? cluster.survivor.normalizedPath : '',
			members: (cluster.members || []).map(member => ({
				selectionKey: member.selectionKey,
				path: member.normalizedPath,
				role: member.role,
				verdict: member.verdict,
				actionKind: member.actionKind,
				size: member.size,
				ageHours: member.context.ageHours,
				isActiveLiveLog: member.context.isActiveLiveLog,
				isForensicProtected: member.context.isForensicProtected,
				isStaleCache: member.context.isStaleCache,
				uncompressedRotatedRisk: member.context.uncompressedRotatedRisk,
				authorityScore: member.context.authorityScore,
			})),
		})),
	}, null, 2)
}
