/**
 * Pure Database Dump, SQL Backup & Telemetry Log Vault Auditor.
 * Classifies and audits duplicate clusters across 4 database & telemetry families:
 * - SQL Dumps & Backup Archives (.sql, .sql.gz, .sql.zst, .dump, .bak, .pgdump)
 * - Active Embedded Databases & WAL/SHM (.sqlite, .sqlite3, .db, .db3, .wal, .shm, .sqlite-wal, .sqlite-shm, .db-wal, .db-shm, .db-journal)
 * - Service & Structured Telemetry Logs (.log, .log.gz, .log.zst, .log.1..N, .ndjson, .ndjson.gz, .ndjson.zst)
 * - Packet & Forensic Telemetry Captures (.pcap, .pcapng, .pcap.gz, .pcapng.gz)
 *
 * Implements GFS (Grandfather-Father-Son) retention detection (annual/monthly/daily),
 * detects redundant daily dumps vs monthly/annual retention snapshots, strictly protects
 * active .sqlite/.db databases with paired .wal/.shm journals, latest healthy backups,
 * and compliance/audit archives, and generates DRY_RUN=1 POSIX scripts, CWE-1236-safe
 * CSV reports, JSON manifests, and .sync-exclude.lst exclusion rules.
 *
 * Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const DB_SQL_LOG_VAULT_SCHEMA = 'duplicatefinder.db-sql-log-vault-auditor.v1'

export const DB_SQL_LOG_FAMILIES = Object.freeze([
	'all',
	'sql-backup-dumps',
	'active-sqlite-wal',
	'service-and-ndjson-logs',
	'packet-and-telemetry-captures',
])

export const DB_SQL_LOG_FAMILY_META = Object.freeze({
	'sql-backup-dumps': {
		id: 'sql-backup-dumps',
		label: 'SQL Dumps & Backups',
		shortLabel: 'Dumps (.sql, .sql.gz, .sql.zst, .dump, .bak)',
	},
	'active-sqlite-wal': {
		id: 'active-sqlite-wal',
		label: 'Active DBs & WAL/SHM',
		shortLabel: 'Databases (.sqlite, .db, .wal, .shm)',
	},
	'service-and-ndjson-logs': {
		id: 'service-and-ndjson-logs',
		label: 'Service & NDJSON Logs',
		shortLabel: 'Logs (.log, .log.gz, .ndjson)',
	},
	'packet-and-telemetry-captures': {
		id: 'packet-and-telemetry-captures',
		label: 'Packet Telemetry (PCAP)',
		shortLabel: 'Telemetry (.pcap, .pcapng)',
	},
})

export const DB_SQL_LOG_STRATEGIES = Object.freeze([
	'prune-redundant-daily-keep-gfs',
	'hardlink-immutable-archives',
	'quarantine-redundant-daily-only',
])

export const DB_SQL_LOG_SURVIVOR_RULES = Object.freeze([
	'gfs-and-active-vault-first',
	'newest-snapshot-first',
	'compressed-vault-first',
	'shortest-path',
])

export const DB_SQL_LOG_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'active-db-wal-protected',
	'latest-healthy-backup',
	'gfs-monthly-annual-snapshot',
	'compliance-vault-archive',
	'redundant-daily-dump',
	'redundant-telemetry-log',
	'shielded',
])

export const DB_SQL_LOG_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const DB_SQL_LOG_PRESETS = Object.freeze([
	{
		id: 'all-db-sql-log-vault-audit',
		name: 'All SQL Dumps, Active DBs & Telemetry Logs',
		description: 'Audit .sql/.sql.gz/.sql.zst/.dump/.bak backups, .sqlite/.db + .wal/.shm pairs, .log/.log.gz/.ndjson streams, and .pcap/.pcapng captures with GFS protection.',
		familyFilter: 'all',
		strategy: 'prune-redundant-daily-keep-gfs',
		survivorRule: 'gfs-and-active-vault-first',
		protectActiveDatabases: true,
		protectLatestHealthyBackup: true,
		protectGfsSnapshots: true,
		protectComplianceArchives: true,
		keepDaily: 7,
		keepMonthly: 12,
		keepAnnual: 3,
		minSizeMb: 0,
	},
	{
		id: 'gfs-sql-daily-pruner',
		name: 'GFS Daily SQL Dump Pruner',
		description: 'Reclaim redundant daily SQL dumps outside the Son daily window while strictly conserving Monthly (Father), Annual (Grandfather), and latest healthy backups.',
		familyFilter: 'sql-backup-dumps',
		strategy: 'prune-redundant-daily-keep-gfs',
		survivorRule: 'gfs-and-active-vault-first',
		protectActiveDatabases: true,
		protectLatestHealthyBackup: true,
		protectGfsSnapshots: true,
		protectComplianceArchives: true,
		keepDaily: 7,
		keepMonthly: 12,
		keepAnnual: 5,
		minSizeMb: 0,
	},
	{
		id: 'active-sqlite-wal-guard',
		name: 'Active SQLite/DB & WAL/SHM Guard',
		description: 'Strictly shield live .sqlite/.db stores and paired .wal/.shm journals while isolating detached or stale orphan WAL/SHM copies in staging or temp paths.',
		familyFilter: 'active-sqlite-wal',
		strategy: 'quarantine-redundant-daily-only',
		survivorRule: 'gfs-and-active-vault-first',
		protectActiveDatabases: true,
		protectLatestHealthyBackup: true,
		protectGfsSnapshots: true,
		protectComplianceArchives: true,
		keepDaily: 7,
		keepMonthly: 12,
		keepAnnual: 3,
		minSizeMb: 0,
	},
	{
		id: 'telemetry-ndjson-pcap-vault',
		name: 'NDJSON, Rotated Logs & PCAP Vault',
		description: 'Deduplicate duplicated .log/.log.gz, .ndjson, and .pcap/.pcapng telemetry captures while shielding compliance and audit vault archives.',
		familyFilter: 'service-and-ndjson-logs',
		strategy: 'hardlink-immutable-archives',
		survivorRule: 'compressed-vault-first',
		protectActiveDatabases: true,
		protectLatestHealthyBackup: true,
		protectGfsSnapshots: true,
		protectComplianceArchives: true,
		keepDaily: 7,
		keepMonthly: 12,
		keepAnnual: 3,
		minSizeMb: 0,
	},
	{
		id: 'hardlink-immutable-vault-archives',
		name: 'Hardlink Immutable Compressed Backups & Logs',
		description: 'Consolidate immutable .sql.gz/.sql.zst/.log.gz/.ndjson/.pcap/.pcapng copies using POSIX hardlinks while blocking hardlinks on mutable .sqlite/.db/.wal/.shm files.',
		familyFilter: 'all',
		strategy: 'hardlink-immutable-archives',
		survivorRule: 'compressed-vault-first',
		protectActiveDatabases: true,
		protectLatestHealthyBackup: true,
		protectGfsSnapshots: true,
		protectComplianceArchives: true,
		keepDaily: 7,
		keepMonthly: 12,
		keepAnnual: 3,
		minSizeMb: 0,
	},
])

export const DB_SQL_LOG_DEFAULT_CONFIG = Object.freeze({
	presetId: 'all-db-sql-log-vault-audit',
	familyFilter: 'all',
	verdictFilter: 'all',
	strategy: 'prune-redundant-daily-keep-gfs',
	survivorRule: 'gfs-and-active-vault-first',
	sortMode: 'reclaim_desc',
	searchQuery: '',
	protectActiveDatabases: true,
	protectLatestHealthyBackup: true,
	protectGfsSnapshots: true,
	protectComplianceArchives: true,
	keepDaily: 7,
	keepMonthly: 12,
	keepAnnual: 3,
	minSizeMb: 0,
})

const COMPRESSED_SQL_DUMP_RE = /\.(?:sql|dump|bak)\.(?:gz|zst|bz2|xz|lz4)$/i
const PLAIN_SQL_DUMP_RE = /\.(?:sql|dump|bak|pgdump)$/i
const ACTIVE_DB_EXT_RE = /\.(?:sqlite|sqlite3|db|db3)$/i
const WAL_SHM_EXT_RE = /(?:-(?:wal|shm|journal)|\.(?:wal|shm))$/i
const SERVICE_LOG_RE = /\.log(?:\.\d+|\.\d{4}-\d{2}-\d{2})?(?:\.(?:gz|zst|bz2|xz|lz4))?$/i
const NDJSON_LOG_RE = /\.ndjson(?:\.(?:gz|zst|bz2|xz))?$/i
const PCAP_CAPTURE_RE = /\.pcap(?:ng)?(?:\.(?:gz|zst|bz2|xz))?$/i

const ACTIVE_OR_PROD_DB_PATH_RE = /(?:^|\/)(?:prod|production|live|active|var\/lib|var\/db|data|appdata|sqlite|db[-_]?live|instance)(?:\/|$)/i
const VAULT_BACKUP_PATH_RE = /(?:^|\/)(?:backups?|vault|snapshots?|gfs|monthly|annual|yearly|grandfather|father|db[-_]?backups?|sql[-_]?backups?)(?:\/|$)/i
const COMPLIANCE_PATH_RE = /(?:^|\/)(?:compliance|audit|audits|soc2|iso27001|gdpr|rgpd|hipaa|legal[-_]?hold|worm|immutable|regulatory|sec[-_]?archive|retention[-_]?vault)(?:\/|$)/i
const COMPLIANCE_NAME_RE = /(?:compliance|audit|soc2|iso27001|gdpr|rgpd|hipaa|legal[-_]?hold|regulatory)/i
const STAGING_OR_STALE_PATH_RE = /(?:^|\/)(?:tmp|temp|staging|scratch|downloads?|old|stale|orphan|orphans|trash|\.trash|scratch[-_]?dumps?|daily[-_]?scratch)(?:\/|$)/i
const CORRUPT_OR_INCOMPLETE_RE = /(?:\.part$|\.tmp$|corrupt|incomplete|truncated|failed|broken|partial)/i

const GFS_ANNUAL_MARKER_RE = /(?:^|[-_./])(?:annual|yearly|grandfather|gfs[-_]?annual|year[-_]?end)(?:[-_./]|$)/i
const GFS_MONTHLY_MARKER_RE = /(?:^|[-_./])(?:monthly|father|gfs[-_]?monthly|month[-_]?end)(?:[-_./]|$)/i
const GFS_DAILY_MARKER_RE = /(?:^|[-_./])(?:daily|son|gfs[-_]?daily|hourly|nightly)(?:[-_./]|$)/i

const DATE_YMD_RE = /(\d{4})[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])/
const DATE_YM_RE = /(?:^|[-_./])(\d{4})[-_.](0[1-9]|1[0-2])(?:[-_./]|$)/
const DATE_Y_RE = /(?:^|[-_./])(19\d\d|20\d\d)(?:[-_./]|$)/

/**
 * Clamp and parse a non-negative integer config value safely.
 *
 * @param {*} value Candidate numeric input.
 * @param {number} fallback Default value.
 * @param {number} [max] Maximum bound.
 * @return {number} Clamped integer.
 */
function normalizeNonNegativeInt(value, fallback, max = 10000) {
	const num = Number(value)
	if (!Number.isFinite(num) || num < 0) {
		return fallback
	}
	return Math.min(max, Math.floor(num))
}

/**
 * Normalize audit configuration against presets and safe bounds.
 *
 * @param {object} [raw] Raw configuration object.
 * @return {object} Normalized configuration.
 */
export function normalizeDbSqlLogConfig(raw = {}) {
	const input = raw && typeof raw === 'object' ? raw : {}
	const preset = DB_SQL_LOG_PRESETS.find(item => item.id === input.presetId) || null
	const base = preset ? { ...DB_SQL_LOG_DEFAULT_CONFIG, ...preset } : { ...DB_SQL_LOG_DEFAULT_CONFIG }

	const familyFilter = DB_SQL_LOG_FAMILIES.includes(input.familyFilter)
		? input.familyFilter
		: base.familyFilter
	const verdictFilter = DB_SQL_LOG_VERDICT_FILTERS.includes(input.verdictFilter)
		? input.verdictFilter
		: base.verdictFilter
	const strategy = DB_SQL_LOG_STRATEGIES.includes(input.strategy)
		? input.strategy
		: base.strategy
	const survivorRule = DB_SQL_LOG_SURVIVOR_RULES.includes(input.survivorRule)
		? input.survivorRule
		: base.survivorRule
	const sortMode = DB_SQL_LOG_SORT_MODES.includes(input.sortMode)
		? input.sortMode
		: base.sortMode

	return {
		presetId: preset ? preset.id : base.presetId,
		familyFilter,
		verdictFilter,
		strategy,
		survivorRule,
		sortMode,
		searchQuery: typeof input.searchQuery === 'string' ? input.searchQuery.trim() : '',
		protectActiveDatabases: input.protectActiveDatabases !== undefined
			? Boolean(input.protectActiveDatabases)
			: base.protectActiveDatabases,
		protectLatestHealthyBackup: input.protectLatestHealthyBackup !== undefined
			? Boolean(input.protectLatestHealthyBackup)
			: base.protectLatestHealthyBackup,
		protectGfsSnapshots: input.protectGfsSnapshots !== undefined
			? Boolean(input.protectGfsSnapshots)
			: base.protectGfsSnapshots,
		protectComplianceArchives: input.protectComplianceArchives !== undefined
			? Boolean(input.protectComplianceArchives)
			: base.protectComplianceArchives,
		keepDaily: normalizeNonNegativeInt(input.keepDaily, base.keepDaily, 365),
		keepMonthly: normalizeNonNegativeInt(input.keepMonthly, base.keepMonthly, 120),
		keepAnnual: normalizeNonNegativeInt(input.keepAnnual, base.keepAnnual, 50),
		minSizeMb: normalizeNonNegativeInt(input.minSizeMb, base.minSizeMb, 1048576),
		memberOverrides: input.memberOverrides && typeof input.memberOverrides === 'object'
			? input.memberOverrides
			: {},
	}
}

/**
 * Extract normalized path, directory, and basename parts from a duplicate file entry.
 *
 * @param {object} file Duplicate file entry.
 * @return {object} Path metadata.
 */
function extractPathParts(file) {
	const rawPath = typeof file?.path === 'string' && file.path.length > 0
		? file.path
		: (typeof file?.name === 'string' ? file.name : '')
	const normalized = normalizePathForDiff(rawPath)
	const slashIndex = normalized.lastIndexOf('/')
	const directory = slashIndex >= 0 ? normalized.slice(0, slashIndex) : ''
	const basename = slashIndex >= 0 ? normalized.slice(slashIndex + 1) : normalized
	return {
		rawPath,
		normalized,
		lower: normalized.toLowerCase(),
		directory,
		lowerDir: directory.toLowerCase(),
		basename,
		lowerBase: basename.toLowerCase(),
	}
}

/**
 * Derive a normalized database or service stem for correlating dumps, active DBs, WAL/SHM, and logs.
 *
 * @param {string} basename Filename.
 * @return {string} Normalized stem.
 */
export function extractDbLogStem(basename) {
	if (typeof basename !== 'string' || basename.length === 0) {
		return ''
	}
	let stem = basename.toLowerCase()
	stem = stem.replace(/\.(?:gz|zst|bz2|xz|lz4)$/i, '')
	stem = stem.replace(/-(?:wal|shm|journal)$/i, '')
	stem = stem.replace(/\.(?:sql|dump|bak|pgdump|sqlite3?|db3?|wal|shm|log(?:\.\d+)?|ndjson|pcapng|pcap)$/i, '')
	stem = stem.replace(/[-_.]?(?:\d{4}[-_.]?\d{2}[-_.]?\d{2}(?:[t_-]\d{4,6})?|\d{4}[-_.]?\d{2}|\d{4})$/i, '')
	stem = stem.replace(/[-_.](?:daily|weekly|monthly|annual|yearly|grandfather|father|son|hourly|nightly|backup|dump|snapshot)$/i, '')
	stem = stem.replace(/[-_.]+$/, '')
	return stem
}

/**
 * Parse modified timestamp in milliseconds safely.
 *
 * @param {object} file Duplicate file entry.
 * @return {number} Epoch milliseconds or 0 when unavailable.
 */
function getModifiedMs(file) {
	if (typeof file?.mtime === 'number' && Number.isFinite(file.mtime)) {
		return file.mtime > 1e12 ? file.mtime : file.mtime * 1000
	}
	if (typeof file?.modified === 'number' && Number.isFinite(file.modified)) {
		return file.modified > 1e12 ? file.modified : file.modified * 1000
	}
	const candidate = file?.modifiedTime || file?.mtimeIso || file?.lastModified || file?.updatedAt
	if (typeof candidate === 'string' && candidate.length > 0) {
		const parsed = Date.parse(candidate)
		if (Number.isFinite(parsed)) {
			return parsed
		}
	}
	return 0
}

/**
 * Detect GFS (Grandfather-Father-Son) retention tier and snapshot date from path and mtime.
 *
 * @param {string} lowerPath Lowercase full path.
 * @param {string} lowerBase Lowercase basename.
 * @param {number} mtimeMs Epoch milliseconds.
 * @return {object} GFS descriptor.
 */
export function detectGfsRetentionTier(lowerPath, lowerBase, mtimeMs) {
	const ymdMatch = lowerBase.match(DATE_YMD_RE) || lowerPath.match(DATE_YMD_RE)
	const ymMatch = !ymdMatch ? (lowerBase.match(DATE_YM_RE) || lowerPath.match(DATE_YM_RE)) : null
	const yMatch = !ymdMatch && !ymMatch ? (lowerBase.match(DATE_Y_RE) || lowerPath.match(DATE_Y_RE)) : null

	let snapshotDate = ''
	let gfsTier = 'none'

	if (ymdMatch) {
		const [, year, month, day] = ymdMatch
		snapshotDate = `${year}-${month}-${day}`
		if (GFS_ANNUAL_MARKER_RE.test(lowerPath) || (month === '01' && day === '01')) {
			gfsTier = 'grandfather-annual'
		} else if (GFS_MONTHLY_MARKER_RE.test(lowerPath) || day === '01') {
			gfsTier = 'father-monthly'
		} else {
			gfsTier = 'son-daily'
		}
	} else if (ymMatch) {
		const [, year, month] = ymMatch
		snapshotDate = `${year}-${month}`
		if (GFS_ANNUAL_MARKER_RE.test(lowerPath) || month === '01') {
			gfsTier = 'grandfather-annual'
		} else {
			gfsTier = 'father-monthly'
		}
	} else if (yMatch && GFS_ANNUAL_MARKER_RE.test(lowerPath)) {
		snapshotDate = yMatch[1]
		gfsTier = 'grandfather-annual'
	} else if (GFS_ANNUAL_MARKER_RE.test(lowerPath)) {
		gfsTier = 'grandfather-annual'
	} else if (GFS_MONTHLY_MARKER_RE.test(lowerPath)) {
		gfsTier = 'father-monthly'
	} else if (GFS_DAILY_MARKER_RE.test(lowerPath)) {
		gfsTier = 'son-daily'
	}

	if (!snapshotDate && mtimeMs > 0) {
		const d = new Date(mtimeMs)
		if (Number.isFinite(d.getTime())) {
			const y = String(d.getUTCFullYear())
			const m = String(d.getUTCMonth() + 1).padStart(2, '0')
			const day = String(d.getUTCDate()).padStart(2, '0')
			snapshotDate = `${y}-${m}-${day}`
		}
	}

	return {
		gfsTier,
		snapshotDate,
		isGfsProtectedTier: gfsTier === 'grandfather-annual' || gfsTier === 'father-monthly',
	}
}

/**
 * Classify a single file entry into Database Dump, SQL Backup & Telemetry Log Vault metadata.
 *
 * @param {object} file Duplicate file entry.
 * @param {number} [referenceNowMs] Reference epoch ms.
 * @return {object} Classification descriptor.
 */
export function classifyDbSqlLogFile(file, referenceNowMs = Date.now()) {
	const parts = extractPathParts(file)
	const { lower, lowerBase, lowerDir } = parts
	const size = Math.max(0, Number(file?.size) || 0)
	const mtimeMs = getModifiedMs(file)
	const ageDays = mtimeMs > 0
		? Math.max(0, Math.floor((referenceNowMs - mtimeMs) / (1000 * 60 * 60 * 24)))
		: 0

	const isCompressedSqlDump = COMPRESSED_SQL_DUMP_RE.test(lowerBase)
	const isPlainSqlDump = !isCompressedSqlDump && PLAIN_SQL_DUMP_RE.test(lowerBase)
	const isWalOrShm = WAL_SHM_EXT_RE.test(lowerBase)
	const isEmbeddedDb = !isWalOrShm && ACTIVE_DB_EXT_RE.test(lowerBase)
	const isNdjsonLog = NDJSON_LOG_RE.test(lowerBase)
	const isServiceLog = !isNdjsonLog && SERVICE_LOG_RE.test(lowerBase)
	const isPcapCapture = PCAP_CAPTURE_RE.test(lowerBase)

	let family = null
	let artifactKind = 'unknown'
	let isMutableDatabaseFile = false
	let isCompressedArchive = false
	let isTelemetryLog = false

	if (isEmbeddedDb || isWalOrShm) {
		family = 'active-sqlite-wal'
		isMutableDatabaseFile = true
		artifactKind = isWalOrShm ? 'wal-shm-journal' : 'embedded-sqlite-db'
	} else if (isCompressedSqlDump || isPlainSqlDump) {
		family = 'sql-backup-dumps'
		isCompressedArchive = isCompressedSqlDump
		artifactKind = isCompressedSqlDump ? 'compressed-sql-dump' : 'plain-sql-dump'
	} else if (isPcapCapture) {
		family = 'packet-and-telemetry-captures'
		isTelemetryLog = true
		isCompressedArchive = /\.(?:gz|zst|bz2|xz)$/i.test(lowerBase)
		artifactKind = lowerBase.includes('.pcapng') ? 'pcapng-capture' : 'pcap-capture'
	} else if (isNdjsonLog || isServiceLog) {
		family = 'service-and-ndjson-logs'
		isTelemetryLog = true
		isCompressedArchive = /\.(?:gz|zst|bz2|xz|lz4)$/i.test(lowerBase)
		artifactKind = isNdjsonLog ? 'ndjson-telemetry-log' : 'service-log'
	}

	const isStagingOrStale = STAGING_OR_STALE_PATH_RE.test(lowerDir)
	const isCompliancePath = (COMPLIANCE_PATH_RE.test(lowerDir) || COMPLIANCE_NAME_RE.test(lowerBase)) && !isStagingOrStale
	const isActiveDbPath = ACTIVE_OR_PROD_DB_PATH_RE.test(lowerDir) && !isStagingOrStale
	const isVaultBackupPath = VAULT_BACKUP_PATH_RE.test(lowerDir) && !isStagingOrStale
	const isCorruptOrIncomplete = CORRUPT_OR_INCOMPLETE_RE.test(lowerBase) || file?.isCorrupt === true || size === 0
	const gfs = detectGfsRetentionTier(lower, lowerBase, mtimeMs)
	const dbStem = extractDbLogStem(lowerBase)

	return {
		...parts,
		size,
		mtimeMs,
		formattedMtime: formatFileModifiedTime(file),
		ageDays,
		family,
		artifactKind,
		dbStem,
		gfsTier: gfs.gfsTier,
		snapshotDate: gfs.snapshotDate,
		isGfsProtectedTier: gfs.isGfsProtectedTier,
		isCompressedSqlDump,
		isPlainSqlDump,
		isEmbeddedDb,
		isWalOrShm,
		isMutableDatabaseFile,
		isCompressedArchive,
		isTelemetryLog,
		isCompliancePath,
		isActiveDbPath,
		isVaultBackupPath,
		isStagingOrStale,
		isCorruptOrIncomplete,
	}
}

/**
 * Determine whether a duplicate group belongs to the SQL Dump, DB & Telemetry Log Vault domain.
 *
 * @param {object} group Duplicate group.
 * @return {boolean} True when at least one member matches a supported family.
 */
export function isDbSqlLogGroup(group) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return false
	}
	return group.files.some(file => classifyDbSqlLogFile(file).family !== null)
}

/**
 * Build a vault-wide index tracking active DB+WAL/SHM pairs, latest healthy backups per stem,
 * compressed twins for plain SQL dumps, and GFS retention anchors.
 *
 * @param {Array<object>} groups Domain duplicate groups.
 * @param {object} config Normalized configuration.
 * @param {number} [referenceNowMs] Reference epoch ms.
 * @return {object} Vault correlation index.
 */
export function buildDbVaultCorrelationIndex(groups, config, referenceNowMs = Date.now()) {
	const activeDbDirsByStem = new Map()
	const activeWalDirsByStem = new Map()
	const latestHealthyByStem = new Map()
	const compressedTwinKeys = new Set()
	const gfsDailyRecordsByStem = new Map()
	const gfsCountsByStem = new Map()

	for (const group of Array.isArray(groups) ? groups : []) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (const file of group.files) {
			const meta = classifyDbSqlLogFile(file, referenceNowMs)
			if (!meta.family) {
				continue
			}

			if (meta.isEmbeddedDb && !meta.isStagingOrStale) {
				if (!activeDbDirsByStem.has(meta.dbStem)) {
					activeDbDirsByStem.set(meta.dbStem, new Set())
				}
				activeDbDirsByStem.get(meta.dbStem).add(meta.lowerDir)
			}

			if (meta.isWalOrShm && !meta.isStagingOrStale) {
				if (!activeWalDirsByStem.has(meta.dbStem)) {
					activeWalDirsByStem.set(meta.dbStem, new Set())
				}
				activeWalDirsByStem.get(meta.dbStem).add(meta.lowerDir)
			}

			if (meta.isCompressedSqlDump && meta.dbStem) {
				const twinKey = meta.snapshotDate
					? `${meta.dbStem}::${meta.snapshotDate}`
					: meta.dbStem
				compressedTwinKeys.add(twinKey)
				compressedTwinKeys.add(meta.dbStem)
			}

			if (meta.family === 'sql-backup-dumps' && !meta.isCorruptOrIncomplete && !meta.isStagingOrStale && meta.dbStem) {
				const currentLatest = latestHealthyByStem.get(meta.dbStem)
				const candidateScore = (meta.mtimeMs || 0) + (meta.isCompressedSqlDump ? 500 : 0) + (meta.isVaultBackupPath ? 250 : 0)
				if (!currentLatest || candidateScore > currentLatest.score || (candidateScore === currentLatest.score && meta.normalized < currentLatest.path)) {
					latestHealthyByStem.set(meta.dbStem, {
						path: meta.normalized,
						mtimeMs: meta.mtimeMs,
						score: candidateScore,
					})
				}

				if (!gfsCountsByStem.has(meta.dbStem)) {
					gfsCountsByStem.set(meta.dbStem, { annual: 0, monthly: 0, daily: 0 })
				}
				const counts = gfsCountsByStem.get(meta.dbStem)
				if (meta.gfsTier === 'grandfather-annual') {
					counts.annual += 1
				} else if (meta.gfsTier === 'father-monthly') {
					counts.monthly += 1
				} else if (meta.gfsTier === 'son-daily') {
					counts.daily += 1
					if (!gfsDailyRecordsByStem.has(meta.dbStem)) {
						gfsDailyRecordsByStem.set(meta.dbStem, [])
					}
					gfsDailyRecordsByStem.get(meta.dbStem).push({
						path: meta.normalized,
						mtimeMs: meta.mtimeMs,
						snapshotDate: meta.snapshotDate,
					})
				}
			}
		}
	}

	// Compute retained daily (Son) paths within keepDaily window per stem
	const retainedDailyPaths = new Set()
	for (const [, records] of gfsDailyRecordsByStem.entries()) {
		const sorted = [...records].sort((a, b) => (b.mtimeMs - a.mtimeMs) || a.path.localeCompare(b.path))
		const uniqueDates = new Set()
		for (const rec of sorted) {
			const dateKey = rec.snapshotDate || rec.path
			if (!uniqueDates.has(dateKey) && uniqueDates.size < config.keepDaily) {
				uniqueDates.add(dateKey)
				retainedDailyPaths.add(rec.path)
			}
		}
	}

	return {
		activeDbDirsByStem,
		activeWalDirsByStem,
		latestHealthyByStem,
		compressedTwinKeys,
		retainedDailyPaths,
		gfsCountsByStem,
	}
}

/**
 * Score a candidate member for deterministic canonical survivor selection.
 *
 * @param {object} member Classified member descriptor.
 * @param {string} survivorRule Survivor rule identifier.
 * @return {number} Deterministic priority score (higher wins).
 */
function scoreMemberForSurvivor(member, survivorRule) {
	let score = 0

	if (member.isActiveDatabasePair) {
		score += 120000
	}
	if (member.isCompliancePath) {
		score += 100000
	}
	if (member.isLatestHealthyBackup) {
		score += 85000
	}
	if (member.gfsTier === 'grandfather-annual') {
		score += 75000
	} else if (member.gfsTier === 'father-monthly') {
		score += 65000
	}
	if (member.isVaultBackupPath) {
		score += 20000
	}
	if (member.isCompressedArchive) {
		score += 10000
	}
	if (member.isStagingOrStale) {
		score -= 30000
	}
	if (member.isCorruptOrIncomplete) {
		score -= 50000
	}

	if (survivorRule === 'newest-snapshot-first') {
		score += Math.floor(member.mtimeMs / 1000)
	} else if (survivorRule === 'compressed-vault-first') {
		score += member.isCompressedArchive ? 25000 : 0
		score -= member.normalized.length
	} else if (survivorRule === 'shortest-path') {
		score -= member.normalized.length * 15
	} else {
		// gfs-and-active-vault-first
		score += Math.floor(member.mtimeMs / 100000)
		score -= member.normalized.length
	}

	return score
}

/**
 * Resolve the dominant family for a duplicate cluster.
 *
 * @param {Array<object>} members Classified members.
 * @return {string} Family ID.
 */
function resolveClusterFamily(members) {
	const counts = new Map()
	for (const member of members) {
		if (!member.family) {
			continue
		}
		counts.set(member.family, (counts.get(member.family) || 0) + 1)
	}
	let bestFamily = 'sql-backup-dumps'
	let bestCount = -1
	for (const [family, count] of counts.entries()) {
		if (count > bestCount) {
			bestCount = count
			bestFamily = family
		}
	}
	return bestFamily
}

/**
 * Audit a single duplicate cluster against GFS retention, active DB/WAL safety, and compliance rules.
 *
 * @param {object} group Duplicate group.
 * @param {object} correlationIndex Vault correlation index.
 * @param {object} config Normalized configuration.
 * @param {number} referenceNowMs Reference epoch ms.
 * @return {object|null} Audited cluster entry or null if outside domain.
 */
function auditSingleCluster(group, correlationIndex, config, referenceNowMs) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return null
	}

	const rawMembers = group.files.map((file, index) => {
		const meta = classifyDbSqlLogFile(file, referenceNowMs)
		if (!meta.family) {
			return null
		}

		const dbDirs = correlationIndex.activeDbDirsByStem.get(meta.dbStem)
		const walDirs = correlationIndex.activeWalDirsByStem.get(meta.dbStem)
		const hasPairedDbInDir = Boolean(dbDirs && dbDirs.has(meta.lowerDir))
		const hasPairedWalInDir = Boolean(walDirs && walDirs.has(meta.lowerDir))
		const isActiveDatabasePair = (meta.isEmbeddedDb && !meta.isStagingOrStale && (meta.isActiveDbPath || hasPairedWalInDir))
			|| (meta.isWalOrShm && !meta.isStagingOrStale && (meta.isActiveDbPath || hasPairedDbInDir))

		const latestInfo = correlationIndex.latestHealthyByStem.get(meta.dbStem)
		const isLatestHealthyBackup = Boolean(latestInfo && latestInfo.path === meta.normalized)

		const twinKey = meta.snapshotDate ? `${meta.dbStem}::${meta.snapshotDate}` : meta.dbStem
		const hasCompressedTwin = meta.isPlainSqlDump
			&& (correlationIndex.compressedTwinKeys.has(twinKey) || correlationIndex.compressedTwinKeys.has(meta.dbStem))

		const isRetainedDailySon = meta.gfsTier === 'son-daily' && correlationIndex.retainedDailyPaths.has(meta.normalized)

		return {
			...meta,
			id: file?.id ?? null,
			key: getFileSelectionKey(file) ?? `member-${index}`,
			file,
			index,
			isActiveDatabasePair,
			hasPairedDbInDir,
			hasPairedWalInDir,
			isLatestHealthyBackup,
			hasCompressedTwin,
			isRetainedDailySon,
		}
	}).filter(Boolean)

	if (rawMembers.length === 0) {
		return null
	}

	const family = resolveClusterFamily(rawMembers)
	const primaryName = rawMembers[0].basename || group.hash || `cluster-${group.id}`
	const primaryStem = rawMembers[0].dbStem || extractDbLogStem(primaryName)
	const info = computeGroupReclaimableInfo(group)
	const totalBytes = Number(info.totalBytes) || rawMembers.reduce((sum, item) => sum + item.size, 0)
	const unitBytes = Number(info.unitBytes) || (rawMembers[0]?.size || 0)

	const sortedForSurvivor = [...rawMembers].sort((a, b) => {
		const diff = scoreMemberForSurvivor(b, config.survivorRule) - scoreMemberForSurvivor(a, config.survivorRule)
		if (diff !== 0) {
			return diff
		}
		return a.normalized.localeCompare(b.normalized)
	})
	const survivorKey = sortedForSurvivor[0].key

	let reclaimableBytes = 0
	let hardlinkSavingsBytes = 0
	let deleteTargetsCount = 0
	let hardlinkTargetsCount = 0
	let shieldedCount = 0

	const members = rawMembers.map((member) => {
		const isSurvivor = member.key === survivorKey
		const override = config.memberOverrides?.[member.key] || 'auto'
		let governanceTier = member.isTelemetryLog ? 'redundant-telemetry-log' : 'redundant-daily-dump'
		let shielded = false
		let protectedReason = ''
		let action = 'keep'

		if (override === 'keep' && !isSurvivor) {
			governanceTier = member.isActiveDatabasePair
				? 'active-db-wal-protected'
				: (member.isCompliancePath
					? 'compliance-vault-archive'
					: (member.isGfsProtectedTier ? 'gfs-monthly-annual-snapshot' : 'latest-healthy-backup'))
			shielded = true
			protectedReason = 'Manually shielded via per-copy override'
		} else if (member.isActiveDatabasePair && config.protectActiveDatabases) {
			governanceTier = 'active-db-wal-protected'
			shielded = true
			protectedReason = member.isWalOrShm
				? 'Active WAL/SHM journal paired with live database strictly conserved'
				: 'Active embedded .sqlite/.db database strictly conserved'
		} else if (member.isCompliancePath && config.protectComplianceArchives) {
			governanceTier = 'compliance-vault-archive'
			shielded = true
			protectedReason = 'Compliance / audit retention archive strictly conserved'
		} else if (member.isLatestHealthyBackup && config.protectLatestHealthyBackup) {
			governanceTier = 'latest-healthy-backup'
			shielded = true
			protectedReason = 'Latest verified healthy backup anchor strictly conserved'
		} else if (member.isGfsProtectedTier && config.protectGfsSnapshots) {
			governanceTier = 'gfs-monthly-annual-snapshot'
			shielded = true
			protectedReason = member.gfsTier === 'grandfather-annual'
				? 'GFS Grandfather (Annual) retention snapshot conserved'
				: 'GFS Father (Monthly) retention snapshot conserved'
		} else if (isSurvivor) {
			governanceTier = member.isMutableDatabaseFile
				? 'active-db-wal-protected'
				: (member.isGfsProtectedTier ? 'gfs-monthly-annual-snapshot' : 'latest-healthy-backup')
			shielded = true
			protectedReason = 'Canonical cluster survivor retained'
		} else if (override === 'prune') {
			governanceTier = member.isTelemetryLog ? 'redundant-telemetry-log' : 'redundant-daily-dump'
			action = config.strategy === 'hardlink-immutable-archives' && !member.isMutableDatabaseFile
				? 'hardlink'
				: 'delete'
			if (action === 'hardlink') {
				hardlinkSavingsBytes += member.size
				hardlinkTargetsCount += 1
			} else {
				deleteTargetsCount += 1
			}
			reclaimableBytes += member.size
			protectedReason = 'Marked for remediation via per-copy override'
		} else if (member.isEmbeddedDb && config.protectActiveDatabases && !member.isStagingOrStale) {
			governanceTier = 'active-db-wal-protected'
			shielded = true
			protectedReason = 'Embedded .sqlite/.db copy shielded outside explicit staging/orphan paths'
		} else {
			governanceTier = member.isTelemetryLog ? 'redundant-telemetry-log' : 'redundant-daily-dump'
			if (config.strategy === 'hardlink-immutable-archives') {
				if (member.isMutableDatabaseFile) {
					action = 'keep'
					shielded = true
					protectedReason = 'Mutable .sqlite/.db/.wal/.shm file cannot be hardlinked safely'
				} else {
					action = 'hardlink'
					hardlinkSavingsBytes += member.size
					reclaimableBytes += member.size
					hardlinkTargetsCount += 1
				}
			} else {
				action = 'delete'
				reclaimableBytes += member.size
				deleteTargetsCount += 1
			}
		}

		if (shielded) {
			shieldedCount += 1
		}

		return {
			...member,
			isSurvivor,
			governanceTier,
			shielded,
			protectedReason,
			action,
		}
	})

	let clusterVerdict = family === 'service-and-ndjson-logs' || family === 'packet-and-telemetry-captures'
		? 'redundant-telemetry-log'
		: 'redundant-daily-dump'

	if (members.some(m => m.governanceTier === 'active-db-wal-protected')) {
		clusterVerdict = 'active-db-wal-protected'
	} else if (members.some(m => m.governanceTier === 'compliance-vault-archive')) {
		clusterVerdict = 'compliance-vault-archive'
	} else if (members.some(m => m.governanceTier === 'gfs-monthly-annual-snapshot')) {
		clusterVerdict = 'gfs-monthly-annual-snapshot'
	} else if (members.some(m => m.governanceTier === 'latest-healthy-backup' && m.isLatestHealthyBackup)) {
		clusterVerdict = 'latest-healthy-backup'
	} else if (members.some(m => m.governanceTier === 'redundant-daily-dump' && (m.action === 'delete' || m.action === 'hardlink'))) {
		clusterVerdict = 'redundant-daily-dump'
	}

	const hasReclaimable = (deleteTargetsCount + hardlinkTargetsCount) > 0
	const gfsStemStats = correlationIndex.gfsCountsByStem.get(primaryStem) || { annual: 0, monthly: 0, daily: 0 }
	const riskScore = (clusterVerdict === 'active-db-wal-protected' ? 100 : 0)
		+ (clusterVerdict === 'compliance-vault-archive' ? 90 : 0)
		+ (clusterVerdict === 'latest-healthy-backup' ? 80 : 0)
		+ (clusterVerdict === 'gfs-monthly-annual-snapshot' ? 70 : 0)
		+ (hasReclaimable ? 20 : 0)

	return {
		id: group.id ?? primaryName,
		hash: group.hash || '',
		name: primaryName,
		dbStem: primaryStem,
		family,
		familyLabel: DB_SQL_LOG_FAMILY_META[family]?.label || family,
		clusterVerdict,
		riskScore,
		unitBytes,
		formattedUnitBytes: formatBytes(unitBytes),
		totalBytes,
		formattedTotalBytes: formatBytes(totalBytes),
		reclaimableBytes,
		formattedReclaimableBytes: formatBytes(reclaimableBytes),
		hardlinkSavingsBytes,
		copyCount: members.length,
		reclaimableTargetsCount: deleteTargetsCount + hardlinkTargetsCount,
		deleteTargetsCount,
		hardlinkTargetsCount,
		shieldedCount,
		hasReclaimable,
		survivorPath: sortedForSurvivor[0].normalized,
		hasActiveDbWal: members.some(m => m.isActiveDatabasePair),
		hasLatestHealthyBackup: members.some(m => m.isLatestHealthyBackup),
		hasGfsMonthlyOrAnnual: members.some(m => m.isGfsProtectedTier),
		hasComplianceArchive: members.some(m => m.isCompliancePath),
		gfsAnnualCount: gfsStemStats.annual,
		gfsMonthlyCount: gfsStemStats.monthly,
		gfsDailyCount: gfsStemStats.daily,
		members,
		group,
	}
}

/**
 * Audit a collection of duplicate groups across SQL Dumps, Active DBs & Telemetry Logs.
 *
 * @param {Array<object>} groups Duplicate groups.
 * @param {object} [rawConfig] Configuration overrides.
 * @param {number} [referenceNowMs] Reference epoch ms for deterministic tests.
 * @return {object} Complete audit report with summary, family counts, and filtered clusters.
 */
export function auditDbSqlLogVault(groups, rawConfig = {}, referenceNowMs = Date.now()) {
	const config = normalizeDbSqlLogConfig(rawConfig)
	const sourceGroups = Array.isArray(groups) ? groups : []
	const domainGroups = sourceGroups.filter(isDbSqlLogGroup)
	const correlationIndex = buildDbVaultCorrelationIndex(domainGroups, config, referenceNowMs)

	const allClusters = domainGroups
		.map(group => auditSingleCluster(group, correlationIndex, config, referenceNowMs))
		.filter(Boolean)

	const minSizeBytes = config.minSizeMb * 1024 * 1024
	const sizeFiltered = allClusters.filter(cluster => cluster.unitBytes >= minSizeBytes)

	const familyCounts = {
		all: sizeFiltered.length,
		'sql-backup-dumps': 0,
		'active-sqlite-wal': 0,
		'service-and-ndjson-logs': 0,
		'packet-and-telemetry-captures': 0,
	}
	for (const cluster of sizeFiltered) {
		if (Object.prototype.hasOwnProperty.call(familyCounts, cluster.family)) {
			familyCounts[cluster.family] += 1
		}
	}

	const query = config.searchQuery.toLowerCase()
	const filteredClusters = sizeFiltered.filter((cluster) => {
		if (config.familyFilter !== 'all' && cluster.family !== config.familyFilter) {
			return false
		}
		if (config.verdictFilter === 'reclaimable' && !cluster.hasReclaimable) {
			return false
		}
		if (config.verdictFilter === 'shielded' && cluster.hasReclaimable) {
			return false
		}
		if (
			config.verdictFilter !== 'all'
			&& config.verdictFilter !== 'reclaimable'
			&& config.verdictFilter !== 'shielded'
			&& cluster.clusterVerdict !== config.verdictFilter
		) {
			return false
		}
		if (query.length > 0) {
			const matchesName = cluster.name.toLowerCase().includes(query)
			const matchesStem = cluster.dbStem.toLowerCase().includes(query)
			const matchesMember = cluster.members.some(m => m.lower.includes(query))
			if (!matchesName && !matchesStem && !matchesMember) {
				return false
			}
		}
		return true
	})

	filteredClusters.sort((a, b) => {
		if (config.sortMode === 'risk_desc') {
			return (b.riskScore - a.riskScore) || (b.reclaimableBytes - a.reclaimableBytes) || a.name.localeCompare(b.name)
		}
		if (config.sortMode === 'copies_desc') {
			return (b.copyCount - a.copyCount) || (b.reclaimableBytes - a.reclaimableBytes) || a.name.localeCompare(b.name)
		}
		if (config.sortMode === 'name_asc') {
			return a.name.localeCompare(b.name)
		}
		return (b.reclaimableBytes - a.reclaimableBytes) || (b.totalBytes - a.totalBytes) || a.name.localeCompare(b.name)
	})

	let rawDuplicateBytes = 0
	let reclaimableBytes = 0
	let totalReclaimableCopiesCount = 0
	let totalShieldedCopiesCount = 0
	let totalActiveDbClusters = 0
	let totalGfsAnchorClusters = 0
	let totalComplianceClusters = 0
	let totalRedundantDailyClusters = 0
	let totalTelemetryClusters = 0

	for (const cluster of filteredClusters) {
		rawDuplicateBytes += Math.max(0, cluster.totalBytes - cluster.unitBytes)
		reclaimableBytes += cluster.reclaimableBytes
		totalReclaimableCopiesCount += cluster.reclaimableTargetsCount
		totalShieldedCopiesCount += cluster.shieldedCount

		if (cluster.hasActiveDbWal) {
			totalActiveDbClusters += 1
		}
		if (cluster.hasGfsMonthlyOrAnnual || cluster.hasLatestHealthyBackup) {
			totalGfsAnchorClusters += 1
		}
		if (cluster.hasComplianceArchive) {
			totalComplianceClusters += 1
		}
		if (cluster.clusterVerdict === 'redundant-daily-dump') {
			totalRedundantDailyClusters += 1
		}
		if (cluster.family === 'service-and-ndjson-logs' || cluster.family === 'packet-and-telemetry-captures') {
			totalTelemetryClusters += 1
		}
	}

	const efficiencyPct = rawDuplicateBytes > 0
		? Math.min(100, Math.round((reclaimableBytes / rawDuplicateBytes) * 100))
		: 0

	const reclaimableGb = `${(reclaimableBytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`

	const familyBreakdown = DB_SQL_LOG_FAMILIES
		.filter(id => id !== 'all')
		.map(id => ({
			id,
			label: DB_SQL_LOG_FAMILY_META[id].label,
			shortLabel: DB_SQL_LOG_FAMILY_META[id].shortLabel,
			clustersCount: familyCounts[id] || 0,
		}))

	return {
		schema: DB_SQL_LOG_VAULT_SCHEMA,
		config,
		familyCounts,
		familyBreakdown,
		clusters: filteredClusters,
		summary: {
			totalDomainGroupsCount: allClusters.length,
			totalUnfilteredClustersCount: sizeFiltered.length,
			totalClustersCount: filteredClusters.length,
			rawDuplicateBytes,
			formattedRawDuplicateBytes: formatBytes(rawDuplicateBytes),
			reclaimableBytes,
			formattedReclaimableBytes: formatBytes(reclaimableBytes),
			reclaimableGb,
			efficiencyPct,
			totalReclaimableCopiesCount,
			totalShieldedCopiesCount,
			totalActiveDbClusters,
			totalGfsAnchorClusters,
			totalComplianceClusters,
			totalRedundantDailyClusters,
			totalTelemetryClusters,
		},
	}
}

/**
 * Quote a filesystem path safely for POSIX shell scripts using single-quote escaping.
 *
 * @param {string} rawPath Filesystem path.
 * @return {string} POSIX-quoted string.
 */
function quotePosixPath(rawPath) {
	const safe = String(rawPath || '').replace(/[\r\n\0]/g, '')
	return `'${safe.replace(/'/g, '\'"\'"\'')}'`
}

/**
 * Build a safe POSIX DRY_RUN=1 remediation script for audited SQL dumps and telemetry logs.
 * Strictly blocks deletion or hardlinking of active .sqlite/.db/.wal/.shm files, latest healthy backups,
 * GFS monthly/annual snapshots, and compliance archives.
 *
 * @param {object} auditResult Result from auditDbSqlLogVault.
 * @return {string} POSIX shell script.
 */
export function buildDbSqlLogRemediationScript(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# Database Dump, SQL Backup & Telemetry Log Vault Auditor',
		'# Safe POSIX Remediation Script (default DRY_RUN=1)',
		'# Run with DRY_RUN=0 ./db-sql-log-vault-reclaim.sh only after verifying GFS and WAL locks.',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'QUARANTINE_DIR="$' + '{QUARANTINE_DIR:-./.db-sql-log-quarantine}"',
		'',
		'run_cmd() {',
		'  if [ "$DRY_RUN" = "1" ]; then',
		'    printf "[DRY_RUN=1] %s\\n" "$*"',
		'  else',
		'    "$@"',
		'  fi',
		'}',
		'',
	]

	let actionCount = 0
	const strategy = auditResult?.config?.strategy || 'prune-redundant-daily-keep-gfs'
	for (const cluster of clusters) {
		const actions = (cluster.members || []).filter(m => m.action === 'delete' || m.action === 'hardlink')
		if (actions.length === 0) {
			continue
		}
		lines.push(`# Cluster: ${cluster.name} | Family: ${cluster.familyLabel} | Survivor: ${cluster.survivorPath}`)
		for (const target of actions) {
			actionCount += 1
			if (target.action === 'hardlink') {
				lines.push(`run_cmd ln -f ${quotePosixPath(cluster.survivorPath)} ${quotePosixPath(target.normalized)}`)
			} else if (strategy === 'quarantine-redundant-daily-only') {
				lines.push('run_cmd mkdir -p "$QUARANTINE_DIR"')
				lines.push(`run_cmd mv -n ${quotePosixPath(target.normalized)} "$QUARANTINE_DIR/"`)
			} else {
				lines.push(`run_cmd rm -f ${quotePosixPath(target.normalized)}`)
			}
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('printf "No reclaimable SQL dumps or telemetry logs under current protection settings.\\n"')
	} else {
		lines.push(`printf "Completed SQL & Log Vault remediation plan (%d target actions, DRY_RUN=%s).\\n" "${actionCount}" "$DRY_RUN"`)
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe RFC-4180 CSV audit report.
 *
 * @param {object} auditResult Result from auditDbSqlLogVault.
 * @return {string} RFC-4180 CSV text.
 */
export function buildDbSqlLogCsvReport(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const headers = [
		'cluster_id',
		'cluster_name',
		'db_stem',
		'family',
		'cluster_verdict',
		'member_path',
		'artifact_kind',
		'gfs_tier',
		'snapshot_date',
		'governance_tier',
		'action',
		'shielded',
		'protected_reason',
		'is_survivor',
		'size_bytes',
		'formatted_size',
		'mtime',
		'survivor_path',
	]
	const rows = [headers.map(escapeCsvCell).join(',')]

	for (const cluster of clusters) {
		for (const member of cluster.members || []) {
			const row = [
				cluster.id,
				cluster.name,
				cluster.dbStem,
				cluster.family,
				cluster.clusterVerdict,
				member.normalized,
				member.artifactKind,
				member.gfsTier || 'none',
				member.snapshotDate || '',
				member.governanceTier,
				member.action,
				member.shielded ? 'true' : 'false',
				member.protectedReason || '',
				member.isSurvivor ? 'true' : 'false',
				member.size,
				formatBytes(member.size),
				member.formattedMtime || '',
				cluster.survivorPath,
			]
			rows.push(row.map(escapeCsvCell).join(','))
		}
	}

	return rows.join('\r\n')
}

/**
 * Build a deterministic JSON audit manifest.
 *
 * @param {object} auditResult Result from auditDbSqlLogVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildDbSqlLogJsonManifest(auditResult) {
	const payload = {
		schema: DB_SQL_LOG_VAULT_SCHEMA,
		generatedAt: new Date().toISOString(),
		config: auditResult?.config || DB_SQL_LOG_DEFAULT_CONFIG,
		summary: auditResult?.summary || {},
		clusters: (auditResult?.clusters || []).map(cluster => ({
			id: cluster.id,
			name: cluster.name,
			dbStem: cluster.dbStem,
			family: cluster.family,
			clusterVerdict: cluster.clusterVerdict,
			unitBytes: cluster.unitBytes,
			totalBytes: cluster.totalBytes,
			reclaimableBytes: cluster.reclaimableBytes,
			survivorPath: cluster.survivorPath,
			hasActiveDbWal: cluster.hasActiveDbWal,
			hasLatestHealthyBackup: cluster.hasLatestHealthyBackup,
			hasGfsMonthlyOrAnnual: cluster.hasGfsMonthlyOrAnnual,
			hasComplianceArchive: cluster.hasComplianceArchive,
			members: (cluster.members || []).map(member => ({
				path: member.normalized,
				artifactKind: member.artifactKind,
				gfsTier: member.gfsTier,
				snapshotDate: member.snapshotDate,
				governanceTier: member.governanceTier,
				action: member.action,
				shielded: member.shielded,
				protectedReason: member.protectedReason,
				isSurvivor: member.isSurvivor,
				size: member.size,
			})),
		})),
	}
	return JSON.stringify(payload, null, 2)
}

/**
 * Generate a Nextcloud/rsync .sync-exclude.lst rule set for active WAL/SHM journals,
 * temp SQL dumps, and noisy telemetry log/pcap streams.
 *
 * @return {string} Line-delimited .sync-exclude.lst rules.
 */
export function buildDbSqlLogSyncExcludeList() {
	return [
		'# Nextcloud / rsync exclusion rules for SQL Dumps, Active WAL/SHM & Telemetry Logs',
		'*.sqlite-wal',
		'*.sqlite-shm',
		'*.db-wal',
		'*.db-shm',
		'*.db-journal',
		'*.wal',
		'*.shm',
		'*.sql.tmp',
		'*.dump.part',
		'*.bak.tmp',
		'*.log',
		'*.log.[0-9]*',
		'*.ndjson',
		'*.pcap',
		'*.pcapng',
	].join('\n')
}
