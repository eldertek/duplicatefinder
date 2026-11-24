/**
 * Pure Database Dump, Backup Snapshot & Log Rotation Vault Auditor.
 * Classifies and audits duplicate clusters across 4 DBA & datastore families:
 * - Compressed DB Archives (*.sql.zst, *.sql.gz, *.dump.zst, *.pgdump, *.bak.gz, *.archive.gz + .sha256/.sig sidecars)
 * - Uncompressed Plain SQL Twins (*.sql, *.dump, *.bak, *.bson sharing basename/snapshot date with a conserved .zst/.gz archive)
 * - WAL, Journal & Lock Artifacts (*.sqlite-wal, *.sqlite-shm, *.db-journal, pg_wal/*.ready, ib_logfile*, *.dump.part, *.sql.tmp)
 * - Rotated Service Log Archives (access.log.*, error.log.*, nextcloud.log.*, worker-*.log.gz under configurable GFS keepDaily/keepWeekly window)
 *
 * Enforces strict governance defaults:
 * - Protects latest GFS snapshot anchors (gfs-retention-anchor)
 * - Protects .sha256 and .sig integrity sidecars
 * - Blocks pruning of active DBs or uncompressed plain dumps lacking a verified compressed twin (blocked-unverified-compressed-twin)
 *
 * Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const DATABASE_DUMP_LOG_SCHEMA = 'duplicatefinder.database-dump-log-auditor.v1'

export const DATABASE_DUMP_LOG_FAMILIES = Object.freeze([
	'all',
	'compressed-db-archives',
	'uncompressed-plain-sql-twins',
	'wal-journal-and-lock-artifacts',
	'rotated-service-log-archives',
])

export const DATABASE_DUMP_LOG_FAMILY_META = Object.freeze({
	'compressed-db-archives': {
		id: 'compressed-db-archives',
		label: 'Compressed DB Archives',
		shortLabel: 'Archives (*.sql.zst/.sql.gz/.dump.zst/.pgdump/.bak.gz/.archive.gz + .sha256/.sig)',
	},
	'uncompressed-plain-sql-twins': {
		id: 'uncompressed-plain-sql-twins',
		label: 'Uncompressed SQL Twins',
		shortLabel: 'Plain Dumps (*.sql/.dump/.bak/.bson)',
	},
	'wal-journal-and-lock-artifacts': {
		id: 'wal-journal-and-lock-artifacts',
		label: 'WAL, Journal & Lock Artifacts',
		shortLabel: 'WAL & Locks (*.sqlite-wal/*.sqlite-shm/*.db-journal/pg_wal/*.ready/ib_logfile*/.part/.tmp)',
	},
	'rotated-service-log-archives': {
		id: 'rotated-service-log-archives',
		label: 'Rotated Service Logs',
		shortLabel: 'Service Logs (access.log.*/error.log.*/nextcloud.log.*/worker-*.log.gz)',
	},
})

export const DATABASE_DUMP_LOG_STRATEGIES = Object.freeze([
	'prune-uncompressed-sql-when-zst-verified',
	'prune-stale-wal-and-tmp-artifacts',
	'apply-gfs-dump-and-log-retention',
])

export const DATABASE_DUMP_LOG_SURVIVOR_RULES = Object.freeze([
	'gfs-vault-and-compressed-first',
	'newest-snapshot-first',
	'sha256-and-sidecar-first',
	'shortest-path',
])

export const DATABASE_DUMP_LOG_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'gfs-anchor',
	'sidecar',
	'uncompressed-twin',
	'wal-artifact',
	'rotated-log',
	'shielded',
])

export const DATABASE_DUMP_LOG_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const DATABASE_DUMP_LOG_PRESETS = Object.freeze([
	{
		id: 'all-db-log-vault-audit',
		name: 'All DB Dumps & Log Vault Audit',
		description: 'Apply GFS retention (keepDaily/keepWeekly), verify compressed .zst/.gz twins, and guard latest GFS anchors and .sha256/.sig sidecars.',
		familyFilter: 'all',
		strategy: 'apply-gfs-dump-and-log-retention',
		survivorRule: 'gfs-vault-and-compressed-first',
		protectGfsAnchor: true,
		protectSidecars: true,
		keepDaily: 7,
		keepWeekly: 4,
		staleWalDays: 7,
		minSizeMb: 0,
	},
	{
		id: 'prune-uncompressed-sql-twins',
		name: 'Prune Uncompressed SQL Twins',
		description: 'Reclaim duplicate plain *.sql, *.dump, *.bak, and *.bson copies only when a conserved *.sql.zst or *.sql.gz twin exists.',
		familyFilter: 'uncompressed-plain-sql-twins',
		strategy: 'prune-uncompressed-sql-when-zst-verified',
		survivorRule: 'gfs-vault-and-compressed-first',
		protectGfsAnchor: true,
		protectSidecars: true,
		keepDaily: 7,
		keepWeekly: 4,
		staleWalDays: 7,
		minSizeMb: 0,
	},
	{
		id: 'prune-stale-wal-artifacts',
		name: 'Prune Stale WAL & Tmp Locks',
		description: 'Reclaim stale *.sqlite-wal, *.sqlite-shm, *.db-journal, pg_wal/*.ready, ib_logfile*, *.dump.part, and *.sql.tmp artifacts.',
		familyFilter: 'wal-journal-and-lock-artifacts',
		strategy: 'prune-stale-wal-and-tmp-artifacts',
		survivorRule: 'newest-snapshot-first',
		protectGfsAnchor: true,
		protectSidecars: true,
		keepDaily: 7,
		keepWeekly: 4,
		staleWalDays: 7,
		minSizeMb: 0,
	},
	{
		id: 'apply-gfs-log-rotation',
		name: 'GFS Log & Snapshot Retention',
		description: 'Enforce configurable daily and weekly GFS windows across rotated access.log.*, error.log.*, nextcloud.log.*, and worker-*.log.gz.',
		familyFilter: 'rotated-service-log-archives',
		strategy: 'apply-gfs-dump-and-log-retention',
		survivorRule: 'newest-snapshot-first',
		protectGfsAnchor: true,
		protectSidecars: true,
		keepDaily: 7,
		keepWeekly: 4,
		staleWalDays: 7,
		minSizeMb: 0,
	},
	{
		id: 'compressed-anchor-and-sidecar-shield',
		name: 'Compressed & Sidecar Shield',
		description: 'Inspect conserved *.sql.zst, *.sql.gz, *.dump.zst, *.pgdump, *.bak.gz, *.archive.gz archives and .sha256/.sig sidecars.',
		familyFilter: 'compressed-db-archives',
		strategy: 'apply-gfs-dump-and-log-retention',
		survivorRule: 'sha256-and-sidecar-first',
		protectGfsAnchor: true,
		protectSidecars: true,
		keepDaily: 7,
		keepWeekly: 4,
		staleWalDays: 7,
		minSizeMb: 0,
	},
])

const COMPRESSED_DB_COMPOUND_RE = /\.(sql\.zst|sql\.gz|sql\.bz2|sql\.xz|dump\.zst|dump\.gz|bak\.gz|archive\.gz|bson\.zst|bson\.gz|pgdump\.zst|pgdump\.gz)$/i
const COMPRESSED_DB_SINGLE_EXT_SET = new Set(['pgdump'])
const PLAIN_DB_EXT_SET = new Set(['sql', 'dump', 'bak', 'bson'])
const ACTIVE_DB_EXT_SET = new Set(['sqlite', 'sqlite3', 'db'])
const SIDECAR_EXT_SET = new Set(['sha256', 'sig'])

const WAL_ARTIFACT_EXT_RE = /\.(sqlite-wal|sqlite-shm|db-journal|sqlite-journal|db-wal|db-shm|dump\.part|sql\.tmp|sql\.part|dump\.tmp|pgdump\.part|bak\.tmp|bak\.part)$/i
const PG_WAL_READY_RE = /\/pg_wal\/[^/]+\.ready$/i
const PG_WAL_DIR_RE = /\/pg_wal\//i
const IB_LOGFILE_RE = /^ib_logfile\d*$/i

const ROTATED_LOG_RE = /^(?:access|error|nextcloud)\.log\..+$/i
const WORKER_LOG_GZ_RE = /^worker-[^/]*\.log\.(?:gz|zst|bz2|xz|\d+(?:\.(?:gz|zst|bz2|xz))?)$/i

const VAULT_PRODUCTION_PATH_RE = /(\/(?:backups?|db-backups?|db_backups?|dumps?|snapshots?|vault|archive|archives|pg_backups?|mariadb-backups?|logs?|log-archive)(?:\/|$)|\/__groupfolders\/\d+\/(?:backups?|db-backups?|dumps?|snapshots?|vault|archive|logs?))/i
const STAGING_BLOAT_PATH_RE = /(\/downloads\/|\/telechargements\/|\/tmp\/|\/temp\/|\/scratch\/|\/incoming\/|\/staging\/|\/wetransfer\/|\/airdrop\/|\/export_tmp\/)/i
const DB_OR_LOG_CONTEXT_PATH_RE = /\/(?:backups?|db|databases?|dumps?|snapshots?|pg_wal|mysql|mariadb|postgres|postgresql|logs?|var\/log)(?:\/|$)/i
const COPY_SUFFIX_RE = /\s-\s?copy(?:\s*\(\d+\))?|\s*\(\d+\)|_copy\b|\[\d{4}-\d{2}-\d{2}[^\]]*\]/gi
const SNAPSHOT_DATE_RE = /(?:^|[^0-9])(19\d{2}|20\d{2})[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])(?:$|[^0-9])/
const ROTATION_INDEX_RE = /\.(\d+)(?:\.(?:gz|zst|bz2|xz))?$/i
const STRICT_SHA256_HEX_RE = /^[a-f0-9]{64}$/i

const TIER_LABELS = Object.freeze({
	'gfs-retention-anchor': 'GFS Retention Anchor',
	'integrity-sidecar-anchor': 'SHA-256 / Sig Sidecar Anchor',
	'compressed-db-archive': 'Compressed DB Archive',
	'uncompressed-plain-sql-twin': 'Uncompressed SQL / Dump Twin',
	'wal-journal-lock-artifact': 'WAL / Journal / Lock Artifact',
	'rotated-service-log': 'Rotated Service Log Archive',
})

const TIER_AUTHORITY = Object.freeze({
	'gfs-retention-anchor': 99,
	'integrity-sidecar-anchor': 97,
	'compressed-db-archive': 88,
	'uncompressed-plain-sql-twin': 54,
	'rotated-service-log': 42,
	'wal-journal-lock-artifact': 18,
})

const VERDICT_LABELS = Object.freeze({
	'keep-canonical-survivor': 'Keep Canonical Vault Anchor',
	'consolidate-to-vault-anchor': 'Consolidate Staging Twin to Vault Anchor',
	'reclaim-uncompressed-sql-twin': 'Prune Verified Uncompressed SQL Twin',
	'reclaim-stale-wal-artifact': 'Prune Stale WAL / Lock / Tmp Artifact',
	'reclaim-expired-gfs-log': 'Prune Expired GFS Log / Snapshot',
	'blocked-gfs-retention-anchor': 'Blocked: GFS Retention Anchor',
	'blocked-sidecar-integrity': 'Blocked: SHA-256 / Sig Sidecar Guard',
	'blocked-unverified-compressed-twin': 'Blocked: Unverified Compressed Twin',
	'blocked-active-wal-or-lock': 'Shielded: Fresh / Active WAL or Lock',
	'blocked-strategy-scope': 'Shielded: Outside Active Strategy',
	'blocked-manual-shield': 'Blocked: Operator Shield',
	excluded: 'Excluded by Operator',
})

const FAMILY_PRIORITY = Object.freeze({
	'compressed-db-archives': 4,
	'uncompressed-plain-sql-twins': 3,
	'rotated-service-log-archives': 2,
	'wal-journal-and-lock-artifacts': 1,
})

/**
 * Quote a POSIX shell argument safely using single quotes.
 *
 * @param {string} value Raw string value.
 * @return {string} Single-quoted POSIX literal.
 */
export function escapePosixSingleQuote(value) {
	return `'${String(value ?? '').replace(/'/g, "'\\''")}'`
}

/**
 * Parse a timestamp field into epoch seconds.
 *
 * @param {*} value Candidate timestamp value.
 * @return {number|null} Epoch seconds or null when missing or invalid.
 */
function parseTimestampSeconds(value) {
	if (value === null || value === undefined || value === '') {
		return null
	}
	if (value instanceof Date) {
		const ms = value.getTime()
		return Number.isFinite(ms) ? Math.floor(ms / 1000) : null
	}
	if (typeof value === 'number') {
		if (!Number.isFinite(value) || value < 0) {
			return null
		}
		return value > 1e12 ? Math.floor(value / 1000) : Math.floor(value)
	}
	if (typeof value === 'string') {
		const trimmed = value.trim()
		if (!trimmed) {
			return null
		}
		if (/^\d+(\.\d+)?$/.test(trimmed)) {
			const n = Number(trimmed)
			if (!Number.isFinite(n) || n < 0) {
				return null
			}
			return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n)
		}
		const parsed = Date.parse(trimmed)
		return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null
	}
	return null
}

/**
 * Extract the best available modification timestamp from a duplicate file record.
 *
 * @param {object} file Duplicate file entry.
 * @return {number|null} Epoch seconds or null.
 */
function getFileMtimeSeconds(file) {
	if (!file || typeof file !== 'object') {
		return null
	}
	for (const field of ['mtime', 'modified', 'updatedAt', 'lastModified']) {
		if (Object.prototype.hasOwnProperty.call(file, field)) {
			const ts = parseTimestampSeconds(file[field])
			if (ts !== null) {
				return ts
			}
		}
	}
	return null
}

/**
 * Extract basename from a normalized file path.
 *
 * @param {string} normalizedPath Normalized path.
 * @return {string} File basename.
 */
function extractBasename(normalizedPath) {
	const raw = String(normalizedPath || '').replace(/\/+$/, '')
	const idx = raw.lastIndexOf('/')
	return idx === -1 ? raw : raw.slice(idx + 1)
}

/**
 * Extract lowercase single extension without leading dot.
 *
 * @param {string} lowerBase Lowercase basename.
 * @return {string} Extension or empty string.
 */
function extractSingleExtension(lowerBase) {
	const lastDot = lowerBase.lastIndexOf('.')
	if (lastDot <= 0 || lastDot >= lowerBase.length - 1) {
		return ''
	}
	return lowerBase.slice(lastDot + 1)
}

/**
 * Compute ISO calendar week identifier (YYYY-Www) from a YYYY-MM-DD string.
 *
 * @param {string} dayKey UTC date formatted as YYYY-MM-DD.
 * @return {string} ISO week bucket or empty string.
 */
function computeIsoWeekKey(dayKey) {
	const match = String(dayKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
	if (!match) {
		return ''
	}
	const year = Number.parseInt(match[1], 10)
	const month = Number.parseInt(match[2], 10) - 1
	const day = Number.parseInt(match[3], 10)
	const date = new Date(Date.UTC(year, month, day))
	if (!Number.isFinite(date.getTime())) {
		return ''
	}
	const dayNum = date.getUTCDay() || 7
	date.setUTCDate(date.getUTCDate() + 4 - dayNum)
	const isoYear = date.getUTCFullYear()
	const yearStart = new Date(Date.UTC(isoYear, 0, 1))
	const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7)
	return `${isoYear}-W${String(weekNo).padStart(2, '0')}`
}

/**
 * Format epoch seconds as UTC YYYY-MM-DD.
 *
 * @param {number|null} epochSec Epoch seconds.
 * @return {string} Formatted date string or empty string.
 */
function formatEpochDayKey(epochSec) {
	if (!Number.isFinite(epochSec) || epochSec <= 0) {
		return ''
	}
	const d = new Date(epochSec * 1000)
	if (!Number.isFinite(d.getTime())) {
		return ''
	}
	const y = String(d.getUTCFullYear()).padStart(4, '0')
	const m = String(d.getUTCMonth() + 1).padStart(2, '0')
	const day = String(d.getUTCDate()).padStart(2, '0')
	return `${y}-${m}-${day}`
}

/**
 * Extract canonical DB/log lineage stem and snapshot date from a raw stem.
 *
 * @param {string} rawName Basename or stem without compound archive/sidecar extension.
 * @return {{ dbLineageStem: string, snapshotDate: string }} Clean stem and normalized date.
 */
function extractStemAndSnapshotDate(rawName) {
	let clean = String(rawName || '').replace(COPY_SUFFIX_RE, '').trim()
	const dateMatch = clean.match(SNAPSHOT_DATE_RE)
	let snapshotDate = ''
	if (dateMatch) {
		snapshotDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
		clean = clean.replace(dateMatch[0], m => {
			const lead = /^[^0-9]/.test(m) ? m[0] : ''
			const tail = /[^0-9]$/.test(m) ? m[m.length - 1] : ''
			return lead && tail ? lead : ''
		})
	}
	clean = clean
		.replace(/(?:^|[_.-])(?:T?\d{4,6}|[0-2]\d[0-5]\d(?:[0-5]\d)?)(?=$|[_.-])/g, '')
		.replace(/[-_.\s]{2,}/g, '_')
		.replace(/^[\s_.-]+|[\s_.-]+$/g, '')
	return {
		dbLineageStem: clean || String(rawName || '').replace(/^[\s_.-]+|[\s_.-]+$/g, ''),
		snapshotDate,
	}
}

/**
 * Parse Database Dump, Backup Snapshot & Log Rotation metadata from basename and path.
 *
 * @param {string} basename File basename.
 * @param {string} [normalizedPath=''] Normalized file path.
 * @return {object} Parsed DB/log classification flags, lineage stem, snapshot date, and tags.
 */
export function parseDatabaseDumpLogInfo(basename, normalizedPath = '') {
	const rawBase = String(basename || '')
	const lowerBase = rawBase.toLowerCase()
	const lowerPath = String(normalizedPath || '').toLowerCase()

	const singleExt = extractSingleExtension(lowerBase)
	const isSidecarExt = SIDECAR_EXT_SET.has(singleExt)
	const innerBase = isSidecarExt
		? rawBase.slice(0, rawBase.length - singleExt.length - 1)
		: rawBase
	const lowerInner = innerBase.toLowerCase()
	const innerSingleExt = extractSingleExtension(lowerInner)

	const isWalArtifact = Boolean(
		WAL_ARTIFACT_EXT_RE.test(lowerBase)
		|| PG_WAL_READY_RE.test(lowerPath)
		|| (PG_WAL_DIR_RE.test(lowerPath) && !isSidecarExt)
		|| IB_LOGFILE_RE.test(lowerBase)
	)

	const isRotatedServiceLog = Boolean(
		!isWalArtifact
		&& !isSidecarExt
		&& (ROTATED_LOG_RE.test(lowerBase) || WORKER_LOG_GZ_RE.test(lowerBase))
	)

	const compoundMatch = lowerInner.match(COMPRESSED_DB_COMPOUND_RE)
	const innerHasCompressedExt = Boolean(compoundMatch || COMPRESSED_DB_SINGLE_EXT_SET.has(innerSingleExt))
	const innerHasPlainDbExt = PLAIN_DB_EXT_SET.has(innerSingleExt)
	const innerHasLogExt = ROTATED_LOG_RE.test(lowerInner) || WORKER_LOG_GZ_RE.test(lowerInner)
	const isDbOrLogContextPath = DB_OR_LOG_CONTEXT_PATH_RE.test(lowerPath) || VAULT_PRODUCTION_PATH_RE.test(lowerPath)

	const isIntegritySidecar = Boolean(
		isSidecarExt
		&& (innerHasCompressedExt || innerHasPlainDbExt || innerHasLogExt || isDbOrLogContextPath)
	)

	const isCompressedDbArchive = Boolean(
		!isWalArtifact
		&& !isRotatedServiceLog
		&& (isIntegritySidecar || (!isSidecarExt && innerHasCompressedExt))
	)

	const isActiveDatabase = Boolean(
		!isWalArtifact
		&& !isRotatedServiceLog
		&& !isCompressedDbArchive
		&& !isSidecarExt
		&& ACTIVE_DB_EXT_SET.has(singleExt)
		&& lowerBase !== 'thumbs.db'
	)

	const isUncompressedPlainSqlTwin = Boolean(
		!isWalArtifact
		&& !isRotatedServiceLog
		&& !isCompressedDbArchive
		&& !isSidecarExt
		&& (PLAIN_DB_EXT_SET.has(singleExt) || isActiveDatabase)
	)

	let effectiveExtension = singleExt
	let stemSource = rawBase
	if (isIntegritySidecar) {
		const innerCompound = lowerInner.match(COMPRESSED_DB_COMPOUND_RE)
		effectiveExtension = innerCompound
			? `${innerCompound[1]}.${singleExt}`
			: (innerSingleExt ? `${innerSingleExt}.${singleExt}` : singleExt)
		stemSource = innerCompound
			? innerBase.slice(0, innerBase.length - innerCompound[1].length - 1)
			: (innerSingleExt ? innerBase.slice(0, innerBase.length - innerSingleExt.length - 1) : innerBase)
	} else if (compoundMatch) {
		effectiveExtension = compoundMatch[1]
		stemSource = rawBase.slice(0, rawBase.length - compoundMatch[1].length - 1)
	} else if (isRotatedServiceLog) {
		const logIdx = lowerBase.indexOf('.log.')
		if (logIdx > 0) {
			effectiveExtension = lowerBase.slice(logIdx + 1)
			stemSource = rawBase.slice(0, logIdx)
		}
	} else if (isWalArtifact) {
		const walMatch = lowerBase.match(WAL_ARTIFACT_EXT_RE)
		if (walMatch) {
			effectiveExtension = walMatch[1]
			stemSource = rawBase.slice(0, rawBase.length - walMatch[1].length - 1)
		} else if (PG_WAL_READY_RE.test(lowerPath)) {
			effectiveExtension = 'ready'
			stemSource = rawBase.replace(/\.ready$/i, '')
		} else {
			stemSource = rawBase
		}
	} else if (singleExt && lowerBase.endsWith(`.${singleExt}`)) {
		stemSource = rawBase.slice(0, rawBase.length - singleExt.length - 1)
	}

	const { dbLineageStem, snapshotDate } = extractStemAndSnapshotDate(stemSource)
	const rotationMatch = isRotatedServiceLog ? lowerBase.match(ROTATION_INDEX_RE) : null
	const rotationIndex = rotationMatch ? Number.parseInt(rotationMatch[1], 10) : null

	const isVaultProductionPath = VAULT_PRODUCTION_PATH_RE.test(lowerPath)
	const isStagingBloatPath = STAGING_BLOAT_PATH_RE.test(lowerPath)

	const artifactTags = []
	const pushTag = tag => {
		const norm = String(tag || '').trim()
		if (norm && !artifactTags.includes(norm)) {
			artifactTags.push(norm)
		}
	}

	if (isCompressedDbArchive) {
		if (isIntegritySidecar) {
			pushTag(`sidecar:${singleExt}`)
		} else {
			pushTag(`archive:${effectiveExtension}`)
		}
		if (isVaultProductionPath) {
			pushTag('vault-anchor')
		}
	}
	if (isUncompressedPlainSqlTwin) {
		pushTag(isActiveDatabase ? `active-db:${singleExt}` : `plain:${singleExt}`)
	}
	if (isWalArtifact) {
		if (PG_WAL_READY_RE.test(lowerPath) || PG_WAL_DIR_RE.test(lowerPath)) {
			pushTag('wal:pg_wal')
		} else if (IB_LOGFILE_RE.test(lowerBase)) {
			pushTag('wal:innodb-ib_logfile')
		} else if (/\.(?:part|tmp)$/i.test(lowerBase)) {
			pushTag(`tmp:${effectiveExtension}`)
		} else {
			pushTag(`wal:${effectiveExtension}`)
		}
	}
	if (isRotatedServiceLog) {
		pushTag(`log:${stemSource.toLowerCase()}`)
		if (rotationIndex !== null) {
			pushTag(`rot:${rotationIndex}`)
		}
	}
	if (snapshotDate) {
		pushTag(`snap:${snapshotDate}`)
	}

	const twinMatchKey = dbLineageStem
		? (snapshotDate ? `${dbLineageStem.toLowerCase()}::${snapshotDate}` : dbLineageStem.toLowerCase())
		: ''

	return {
		rawStem: stemSource,
		dbLineageStem: dbLineageStem || stemSource || rawBase,
		snapshotDate,
		twinMatchKey,
		rotationIndex,
		extension: effectiveExtension,
		singleExt,
		artifactTags,
		artifactTag: artifactTags.length > 0 ? artifactTags.join(', ') : 'none',
		isCompressedDbArchive,
		isIntegritySidecar,
		isUncompressedPlainSqlTwin,
		isActiveDatabase,
		isWalArtifact,
		isRotatedServiceLog,
		isVaultProductionPath,
		isStagingBloatPath,
	}
}

/**
 * Classify a file path into one of the 4 Database Dump, Snapshot & Log Vault families.
 *
 * @param {string} rawPath File path.
 * @return {object|null} Classification metadata or null for unrelated files.
 */
export function classifyDatabaseDumpLog(rawPath) {
	const normalized = normalizePathForDiff(rawPath) || String(rawPath || '')
	const basename = extractBasename(normalized)
	const lowerBase = basename.toLowerCase()

	if (!lowerBase) {
		return null
	}

	const info = parseDatabaseDumpLogInfo(basename, normalized)

	if (info.isWalArtifact) {
		return {
			matched: true,
			family: 'wal-journal-and-lock-artifacts',
			familyLabel: DATABASE_DUMP_LOG_FAMILY_META['wal-journal-and-lock-artifacts'].label,
			...info,
		}
	}

	if (info.isRotatedServiceLog) {
		return {
			matched: true,
			family: 'rotated-service-log-archives',
			familyLabel: DATABASE_DUMP_LOG_FAMILY_META['rotated-service-log-archives'].label,
			...info,
		}
	}

	if (info.isCompressedDbArchive) {
		return {
			matched: true,
			family: 'compressed-db-archives',
			familyLabel: DATABASE_DUMP_LOG_FAMILY_META['compressed-db-archives'].label,
			...info,
		}
	}

	if (info.isUncompressedPlainSqlTwin) {
		return {
			matched: true,
			family: 'uncompressed-plain-sql-twins',
			familyLabel: DATABASE_DUMP_LOG_FAMILY_META['uncompressed-plain-sql-twins'].label,
			...info,
		}
	}

	return null
}

/**
 * Build dataset-wide verification hints for conserved compressed twins and GFS retention windows.
 *
 * @param {Array<object>} duplicates Loaded duplicate groups.
 * @param {object} [options] Normalized options (keepDaily, keepWeekly, memberOverrides).
 * @return {object} Dataset verification and GFS retention maps.
 */
function buildDatasetDatabaseDumpHints(duplicates, options) {
	const verifiedCompressedTwinKeys = new Set()
	const verifiedCompressedStems = new Set()
	const timelineByStream = new Map()

	for (let groupIdx = 0; groupIdx < duplicates.length; groupIdx += 1) {
		const group = duplicates[groupIdx]
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (let fileIdx = 0; fileIdx < group.files.length; fileIdx += 1) {
			const file = group.files[fileIdx]
			if (!file || typeof file !== 'object' || !file.path) {
				continue
			}
			const selectionKey = String(getFileSelectionKey(file) ?? `${groupIdx}-${fileIdx}`)
			if (options.memberOverrides[selectionKey] === 'exclude') {
				continue
			}

			const normalized = normalizePathForDiff(file.path) || String(file.path)
			const info = parseDatabaseDumpLogInfo(extractBasename(normalized), normalized)
			const mtimeSec = getFileMtimeSeconds(file)
			const dayKey = info.snapshotDate || formatEpochDayKey(mtimeSec)

			if (info.isCompressedDbArchive && !info.isIntegritySidecar && !info.isStagingBloatPath) {
				const stemLower = info.dbLineageStem.toLowerCase()
				if (stemLower) {
					verifiedCompressedStems.add(stemLower)
				}
				if (info.twinMatchKey) {
					verifiedCompressedTwinKeys.add(info.twinMatchKey)
				}
			}

			if ((info.isCompressedDbArchive && !info.isIntegritySidecar) || info.isRotatedServiceLog) {
				const streamKey = info.isRotatedServiceLog
					? `log::${info.dbLineageStem.toLowerCase()}`
					: `db::${info.dbLineageStem.toLowerCase()}`
				if (!timelineByStream.has(streamKey)) {
					timelineByStream.set(streamKey, [])
				}
				const dateTs = info.snapshotDate ? parseTimestampSeconds(`${info.snapshotDate}T00:00:00Z`) : null
				timelineByStream.get(streamKey).push({
					selectionKey,
					dayKey,
					weekKey: computeIsoWeekKey(dayKey),
					sortTs: dateTs !== null ? dateTs : (mtimeSec ?? 0),
					rotationIndex: info.rotationIndex,
				})
			}
		}
	}

	const gfsLatestKeys = new Set()
	const gfsDailyKeys = new Set()
	const gfsWeeklyKeys = new Set()
	const gfsExpiredKeys = new Set()

	for (const entries of timelineByStream.values()) {
		const sorted = [...entries].sort((a, b) => {
			if (a.sortTs !== b.sortTs) {
				return b.sortTs - a.sortTs
			}
			const rotA = a.rotationIndex ?? 999999
			const rotB = b.rotationIndex ?? 999999
			if (rotA !== rotB) {
				return rotA - rotB
			}
			return a.selectionKey.localeCompare(b.selectionKey)
		})

		const distinctDated = new Set(sorted.map(e => e.dayKey).filter(Boolean))
		const keptDailySet = new Set()
		const keptWeeklySet = new Set()
		const latestSortTs = sorted.length > 0 ? sorted[0].sortTs : 0
		const latestDayKey = sorted.length > 0 ? sorted[0].dayKey : ''

		if (distinctDated.size > 0) {
			for (const entry of sorted) {
				const dk = entry.dayKey || 'undated'
				if (dk === latestDayKey && entry.sortTs === latestSortTs) {
					gfsLatestKeys.add(entry.selectionKey)
				}
				if (keptDailySet.has(dk)) {
					gfsDailyKeys.add(entry.selectionKey)
					continue
				}
				if (keptDailySet.size < options.keepDaily) {
					keptDailySet.add(dk)
					gfsDailyKeys.add(entry.selectionKey)
					continue
				}
				const wk = entry.weekKey || dk
				if (keptWeeklySet.has(wk)) {
					gfsWeeklyKeys.add(entry.selectionKey)
					continue
				}
				if (keptWeeklySet.size < options.keepWeekly) {
					keptWeeklySet.add(wk)
					gfsWeeklyKeys.add(entry.selectionKey)
					continue
				}
				gfsExpiredKeys.add(entry.selectionKey)
			}
		} else {
			sorted.forEach((entry, idx) => {
				const rotRank = entry.rotationIndex !== null ? entry.rotationIndex - 1 : idx
				if (idx === 0) {
					gfsLatestKeys.add(entry.selectionKey)
				}
				if (rotRank < options.keepDaily) {
					gfsDailyKeys.add(entry.selectionKey)
				} else if (rotRank < options.keepDaily + options.keepWeekly) {
					gfsWeeklyKeys.add(entry.selectionKey)
				} else {
					gfsExpiredKeys.add(entry.selectionKey)
				}
			})
		}
	}

	return {
		verifiedCompressedTwinKeys,
		verifiedCompressedStems,
		gfsLatestKeys,
		gfsDailyKeys,
		gfsWeeklyKeys,
		gfsExpiredKeys,
	}
}

/**
 * Inspect governance tier, GFS retention status, and twin verification for a cluster member.
 *
 * @param {object} file Duplicate file entry.
 * @param {object} classification Classification metadata.
 * @param {string} selectionKey Unique member selection key.
 * @param {number} referenceTimeSec Reference epoch seconds.
 * @param {object} options Normalized analysis options.
 * @param {object} [datasetHints={}] Dataset-wide GFS and twin verification hints.
 * @return {object} Member governance context.
 */
export function inspectDatabaseDumpMemberContext(file, classification, selectionKey, referenceTimeSec, options, datasetHints = {}) {
	const normalizedPath = normalizePathForDiff(file && file.path) || String((file && file.path) || '')
	const basename = extractBasename(normalizedPath)
	const parsed = parseDatabaseDumpLogInfo(basename, normalizedPath)
	const mtimeSec = getFileMtimeSeconds(file)
	const ageDays = mtimeSec !== null && Number.isFinite(referenceTimeSec)
		? Math.max(0, Math.floor((referenceTimeSec - mtimeSec) / 86400))
		: null

	const isWalArtifact = Boolean(parsed.isWalArtifact || classification.family === 'wal-journal-and-lock-artifacts')
	const isRotatedServiceLog = Boolean(!isWalArtifact && (parsed.isRotatedServiceLog || classification.family === 'rotated-service-log-archives'))
	const isIntegritySidecar = Boolean(!isWalArtifact && !isRotatedServiceLog && parsed.isIntegritySidecar)
	const isCompressedDbArchive = Boolean(!isWalArtifact && !isRotatedServiceLog && !isIntegritySidecar && (parsed.isCompressedDbArchive || classification.family === 'compressed-db-archives'))
	const isUncompressedPlainSqlTwin = Boolean(
		!isWalArtifact
		&& !isRotatedServiceLog
		&& !isIntegritySidecar
		&& !isCompressedDbArchive
		&& (parsed.isUncompressedPlainSqlTwin || classification.family === 'uncompressed-plain-sql-twins')
	)

	const stemLower = parsed.dbLineageStem.toLowerCase()
	const hasVerifiedCompressedTwin = Boolean(
		isCompressedDbArchive
		|| (parsed.twinMatchKey && datasetHints.verifiedCompressedTwinKeys && datasetHints.verifiedCompressedTwinKeys.has(parsed.twinMatchKey))
		|| (!parsed.snapshotDate && stemLower && datasetHints.verifiedCompressedStems && datasetHints.verifiedCompressedStems.has(stemLower))
	)

	const isLatestGfsAnchor = Boolean(
		(isCompressedDbArchive || isRotatedServiceLog)
		&& datasetHints.gfsLatestKeys
		&& datasetHints.gfsLatestKeys.has(selectionKey)
	)
	const isWithinGfsDaily = Boolean(datasetHints.gfsDailyKeys && datasetHints.gfsDailyKeys.has(selectionKey))
	const isWithinGfsWeekly = Boolean(datasetHints.gfsWeeklyKeys && datasetHints.gfsWeeklyKeys.has(selectionKey))
	const isGfsExpired = Boolean(datasetHints.gfsExpiredKeys && datasetHints.gfsExpiredKeys.has(selectionKey))

	let gfsSlot = 'none'
	if (isLatestGfsAnchor) {
		gfsSlot = 'latest-anchor'
	} else if (isWithinGfsDaily) {
		gfsSlot = 'daily-window'
	} else if (isWithinGfsWeekly) {
		gfsSlot = 'weekly-window'
	} else if (isGfsExpired) {
		gfsSlot = 'expired'
	}

	const isStaleWalArtifact = ageDays === null || ageDays >= options.staleWalDays
	const isFreshWalArtifact = ageDays !== null && ageDays < options.staleWalDays

	let tier = 'wal-journal-lock-artifact'
	if (isIntegritySidecar) {
		tier = 'integrity-sidecar-anchor'
	} else if (isLatestGfsAnchor && isCompressedDbArchive) {
		tier = 'gfs-retention-anchor'
	} else if (isCompressedDbArchive) {
		tier = 'compressed-db-archive'
	} else if (isUncompressedPlainSqlTwin) {
		tier = 'uncompressed-plain-sql-twin'
	} else if (isRotatedServiceLog) {
		tier = isLatestGfsAnchor ? 'gfs-retention-anchor' : 'rotated-service-log'
	} else {
		tier = 'wal-journal-lock-artifact'
	}

	let authorityScore = TIER_AUTHORITY[tier] || 20
	if ((isCompressedDbArchive || isIntegritySidecar) && parsed.isVaultProductionPath && !parsed.isStagingBloatPath) {
		authorityScore = Math.min(100, authorityScore + 2)
	}
	if (isUncompressedPlainSqlTwin && !hasVerifiedCompressedTwin) {
		authorityScore += 18
	}
	if (parsed.isStagingBloatPath) {
		authorityScore -= 24
	}
	if (isWalArtifact && isStaleWalArtifact) {
		authorityScore -= 6
	}
	if (isGfsExpired) {
		authorityScore -= 14
	}

	return {
		tier,
		tierLabel: TIER_LABELS[tier] || TIER_LABELS['wal-journal-lock-artifact'],
		authorityScore,
		extension: parsed.extension || classification.extension || '',
		rawStem: parsed.rawStem,
		dbLineageStem: parsed.dbLineageStem,
		snapshotDate: parsed.snapshotDate,
		twinMatchKey: parsed.twinMatchKey,
		rotationIndex: parsed.rotationIndex,
		artifactTags: parsed.artifactTags,
		artifactTag: parsed.artifactTag,
		isCompressedDbArchive,
		isIntegritySidecar,
		isUncompressedPlainSqlTwin,
		isActiveDatabase: parsed.isActiveDatabase,
		isWalArtifact,
		isRotatedServiceLog,
		isVaultProductionPath: parsed.isVaultProductionPath,
		isStagingBloatPath: parsed.isStagingBloatPath,
		hasVerifiedCompressedTwin,
		isLatestGfsAnchor,
		isWithinGfsDaily,
		isWithinGfsWeekly,
		isGfsExpired,
		gfsSlot,
		isStaleWalArtifact,
		isFreshWalArtifact,
		mtimeSec,
		ageDays,
	}
}

/**
 * Select the canonical surviving copy inside a Database Dump & Log cluster.
 *
 * @param {Array<object>} members Enriched cluster members.
 * @param {string} survivorRule Survivor selection rule.
 * @param {Set<string>} excludeKeys Excluded member keys.
 * @return {object|null} Selected canonical survivor or null.
 */
function selectClusterSurvivor(members, survivorRule, excludeKeys) {
	if (!Array.isArray(members) || members.length === 0) {
		return null
	}
	const eligible = members.filter(m => !excludeKeys.has(m.selectionKey))
	const pool = eligible.length > 0 ? eligible : members

	const sorted = [...pool].sort((a, b) => {
		if (survivorRule === 'newest-snapshot-first') {
			const tsA = a.context.mtimeSec ?? -1
			const tsB = b.context.mtimeSec ?? -1
			if (tsA !== tsB) {
				return tsB - tsA
			}
		} else if (survivorRule === 'sha256-and-sidecar-first') {
			const sigA = a.context.isIntegritySidecar || a.context.isCompressedDbArchive
			const sigB = b.context.isIntegritySidecar || b.context.isCompressedDbArchive
			if (sigA !== sigB) {
				return sigA ? -1 : 1
			}
		} else if (survivorRule === 'shortest-path') {
			if (a.normalizedPath.length !== b.normalizedPath.length) {
				return a.normalizedPath.length - b.normalizedPath.length
			}
		} else {
			if (a.context.isVaultProductionPath !== b.context.isVaultProductionPath) {
				return a.context.isVaultProductionPath ? -1 : 1
			}
		}

		if (a.context.authorityScore !== b.context.authorityScore) {
			return b.context.authorityScore - a.context.authorityScore
		}

		const tsA = a.context.mtimeSec ?? 0
		const tsB = b.context.mtimeSec ?? 0
		if (tsA !== tsB) {
			return tsB - tsA
		}
		return a.normalizedPath.localeCompare(b.normalizedPath)
	})

	return sorted[0] || null
}

/**
 * Determine the deterministic audit verdict for a Database Dump & Log cluster member.
 *
 * @param {object} member Enriched member object.
 * @param {object|null} survivor Selected canonical survivor.
 * @param {object} options Normalized analysis options.
 * @param {Set<string>} forceKeepKeys Operator force-keep keys.
 * @param {Set<string>} excludeKeys Operator exclude keys.
 * @return {{ verdict: string, verdictLabel: string, actionKind: string, note: string }}
 */
function resolveMemberVerdict(member, survivor, options, forceKeepKeys, excludeKeys) {
	if (excludeKeys.has(member.selectionKey)) {
		return {
			verdict: 'excluded',
			verdictLabel: VERDICT_LABELS.excluded,
			actionKind: 'exclude',
			note: 'Excluded from Database Dump & Log Vault actions by manual operator override.',
		}
	}

	if (survivor && member.selectionKey === survivor.selectionKey) {
		return {
			verdict: 'keep-canonical-survivor',
			verdictLabel: VERDICT_LABELS['keep-canonical-survivor'],
			actionKind: 'keep',
			note: `Canonical ${member.context.tierLabel} retained as the authoritative datastore vault anchor.`,
		}
	}

	if (forceKeepKeys.has(member.selectionKey)) {
		return {
			verdict: 'blocked-manual-shield',
			verdictLabel: VERDICT_LABELS['blocked-manual-shield'],
			actionKind: 'shield',
			note: 'Protected by manual Shield Copy override.',
		}
	}

	if (options.protectSidecars && member.context.isIntegritySidecar) {
		return {
			verdict: 'blocked-sidecar-integrity',
			verdictLabel: VERDICT_LABELS['blocked-sidecar-integrity'],
			actionKind: 'shield',
			note: 'Strictly protected by SHA-256 / Sig Sidecar Guard; cryptographic integrity sidecars are never pruned automatically.',
		}
	}

	if (
		options.protectGfsAnchor
		&& !member.context.isStagingBloatPath
		&& (member.context.isLatestGfsAnchor || member.context.isWithinGfsDaily || member.context.isWithinGfsWeekly)
	) {
		return {
			verdict: 'blocked-gfs-retention-anchor',
			verdictLabel: VERDICT_LABELS['blocked-gfs-retention-anchor'],
			actionKind: 'shield',
			note: `Protected by GFS Retention Anchor Guard (slot: ${member.context.gfsSlot}; keepDaily=${options.keepDaily}, keepWeekly=${options.keepWeekly}).`,
		}
	}

	if (options.strategy === 'prune-uncompressed-sql-when-zst-verified') {
		if (!member.context.isUncompressedPlainSqlTwin) {
			return {
				verdict: 'blocked-strategy-scope',
				verdictLabel: VERDICT_LABELS['blocked-strategy-scope'],
				actionKind: 'shield',
				note: 'Shielded because active strategy only prunes uncompressed *.sql/*.dump/*.bak/*.bson twins.',
			}
		}
		if (!member.context.hasVerifiedCompressedTwin) {
			return {
				verdict: 'blocked-unverified-compressed-twin',
				verdictLabel: VERDICT_LABELS['blocked-unverified-compressed-twin'],
				actionKind: 'shield',
				note: 'Blocked because no verified compressed *.sql.zst, *.sql.gz, or *.pgdump twin matching this database stem and snapshot date is conserved.',
			}
		}
		return {
			verdict: 'reclaim-uncompressed-sql-twin',
			verdictLabel: VERDICT_LABELS['reclaim-uncompressed-sql-twin'],
			actionKind: 'reclaim',
			note: 'Conserved compressed .zst/.gz twin verified; duplicate uncompressed plain dump is safe to prune.',
		}
	}

	if (options.strategy === 'prune-stale-wal-and-tmp-artifacts') {
		if (!member.context.isWalArtifact) {
			return {
				verdict: 'blocked-strategy-scope',
				verdictLabel: VERDICT_LABELS['blocked-strategy-scope'],
				actionKind: 'shield',
				note: 'Shielded because active strategy only prunes stale WAL, journal, lock, and partial dump artifacts.',
			}
		}
		if (member.context.isFreshWalArtifact) {
			return {
				verdict: 'blocked-active-wal-or-lock',
				verdictLabel: VERDICT_LABELS['blocked-active-wal-or-lock'],
				actionKind: 'shield',
				note: `Shielded because WAL/lock artifact age is below stale threshold (${options.staleWalDays}d).`,
			}
		}
		return {
			verdict: 'reclaim-stale-wal-artifact',
			verdictLabel: VERDICT_LABELS['reclaim-stale-wal-artifact'],
			actionKind: 'reclaim',
			note: 'Stale WAL, journal, ib_logfile, or partial dump artifact safe to prune after SHA-256 verification.',
		}
	}

	if (member.context.isWalArtifact) {
		if (member.context.isFreshWalArtifact) {
			return {
				verdict: 'blocked-active-wal-or-lock',
				verdictLabel: VERDICT_LABELS['blocked-active-wal-or-lock'],
				actionKind: 'shield',
				note: `Shielded because WAL/lock artifact age is below stale threshold (${options.staleWalDays}d).`,
			}
		}
		return {
			verdict: 'reclaim-stale-wal-artifact',
			verdictLabel: VERDICT_LABELS['reclaim-stale-wal-artifact'],
			actionKind: 'reclaim',
			note: 'Stale WAL, journal, ib_logfile, or partial dump artifact safe to prune after SHA-256 verification.',
		}
	}

	if (member.context.isUncompressedPlainSqlTwin) {
		if (!member.context.hasVerifiedCompressedTwin) {
			return {
				verdict: 'blocked-unverified-compressed-twin',
				verdictLabel: VERDICT_LABELS['blocked-unverified-compressed-twin'],
				actionKind: 'shield',
				note: 'Blocked because no verified compressed *.sql.zst, *.sql.gz, or *.pgdump twin matching this database stem and snapshot date is conserved.',
			}
		}
		return {
			verdict: 'reclaim-uncompressed-sql-twin',
			verdictLabel: VERDICT_LABELS['reclaim-uncompressed-sql-twin'],
			actionKind: 'reclaim',
			note: 'Conserved compressed .zst/.gz twin verified; duplicate uncompressed plain dump is safe to prune.',
		}
	}

	if (member.context.isRotatedServiceLog) {
		if (member.context.isGfsExpired || member.context.isStagingBloatPath) {
			return {
				verdict: 'reclaim-expired-gfs-log',
				verdictLabel: VERDICT_LABELS['reclaim-expired-gfs-log'],
				actionKind: 'reclaim',
				note: `Rotated service log outside GFS retention window (keepDaily=${options.keepDaily}, keepWeekly=${options.keepWeekly}).`,
			}
		}
		return {
			verdict: 'blocked-gfs-retention-anchor',
			verdictLabel: VERDICT_LABELS['blocked-gfs-retention-anchor'],
			actionKind: 'shield',
			note: `Protected within GFS log rotation window (keepDaily=${options.keepDaily}, keepWeekly=${options.keepWeekly}).`,
		}
	}

	if (member.context.isGfsExpired && !member.context.isLatestGfsAnchor) {
		return {
			verdict: 'reclaim-expired-gfs-log',
			verdictLabel: VERDICT_LABELS['reclaim-expired-gfs-log'],
			actionKind: 'reclaim',
			note: `Compressed snapshot outside GFS retention window (keepDaily=${options.keepDaily}, keepWeekly=${options.keepWeekly}).`,
		}
	}

	return {
		verdict: 'consolidate-to-vault-anchor',
		verdictLabel: VERDICT_LABELS['consolidate-to-vault-anchor'],
		actionKind: 'consolidate',
		note: 'Staging or redundant copy of a conserved compressed database archive; safe to consolidate against canonical vault anchor.',
	}
}

/**
 * Normalize Database Dump, Snapshot & Log Vault auditor options into deterministic bounds.
 *
 * @param {object} [rawOptions] Caller options.
 * @return {object} Normalized options.
 */
function normalizeOptions(rawOptions = {}) {
	const familyFilter = DATABASE_DUMP_LOG_FAMILIES.includes(rawOptions.familyFilter)
		? rawOptions.familyFilter
		: 'all'
	const verdictFilter = DATABASE_DUMP_LOG_VERDICT_FILTERS.includes(rawOptions.verdictFilter)
		? rawOptions.verdictFilter
		: 'all'
	const sortMode = DATABASE_DUMP_LOG_SORT_MODES.includes(rawOptions.sortMode)
		? rawOptions.sortMode
		: 'reclaim_desc'
	const strategy = DATABASE_DUMP_LOG_STRATEGIES.includes(rawOptions.strategy)
		? rawOptions.strategy
		: 'apply-gfs-dump-and-log-retention'
	const survivorRule = DATABASE_DUMP_LOG_SURVIVOR_RULES.includes(rawOptions.survivorRule)
		? rawOptions.survivorRule
		: 'gfs-vault-and-compressed-first'

	const parsedKeepDaily = Number.parseInt(rawOptions.keepDaily, 10)
	const keepDaily = Number.isFinite(parsedKeepDaily) && parsedKeepDaily >= 1
		? Math.min(parsedKeepDaily, 365)
		: 7

	const parsedKeepWeekly = Number.parseInt(rawOptions.keepWeekly, 10)
	const keepWeekly = Number.isFinite(parsedKeepWeekly) && parsedKeepWeekly >= 0
		? Math.min(parsedKeepWeekly, 104)
		: 4

	const parsedWalDays = Number.parseInt(rawOptions.staleWalDays, 10)
	const staleWalDays = Number.isFinite(parsedWalDays) && parsedWalDays >= 0
		? Math.min(parsedWalDays, 3650)
		: 7

	const parsedMinMb = Number.parseFloat(rawOptions.minSizeMb)
	const minSizeMb = Number.isFinite(parsedMinMb) && parsedMinMb >= 0
		? parsedMinMb
		: 0

	const refTime = Number(rawOptions.referenceTimeSec)
	const referenceTimeSec = Number.isFinite(refTime) && refTime > 0
		? Math.floor(refTime)
		: Math.floor(Date.now() / 1000)

	return {
		familyFilter,
		verdictFilter,
		sortMode,
		strategy,
		survivorRule,
		protectGfsAnchor: rawOptions.protectGfsAnchor !== false,
		protectSidecars: rawOptions.protectSidecars !== false,
		keepDaily,
		keepWeekly,
		staleWalDays,
		minSizeMb,
		searchQuery: String(rawOptions.searchQuery || '').trim().toLowerCase(),
		referenceTimeSec,
		memberOverrides: rawOptions.memberOverrides && typeof rawOptions.memberOverrides === 'object'
			? rawOptions.memberOverrides
			: {},
	}
}

/**
 * Audit duplicate groups across database dumps, GFS snapshots, WAL artifacts, and rotated service logs.
 *
 * @param {Array<object>} duplicates Loaded duplicate groups.
 * @param {object} [rawOptions] Auditor configuration options.
 * @return {object} Deterministic audit analysis with summary, counts, and clusters.
 */
export function analyzeDatabaseDumpLogDuplicates(duplicates, rawOptions = {}) {
	const options = normalizeOptions(rawOptions)
	const safeDuplicates = Array.isArray(duplicates) ? duplicates : []
	const minSizeBytes = options.minSizeMb * 1024 * 1024

	const datasetHints = buildDatasetDatabaseDumpHints(safeDuplicates, options)

	const familyCounts = {
		all: 0,
		'compressed-db-archives': 0,
		'uncompressed-plain-sql-twins': 0,
		'wal-journal-and-lock-artifacts': 0,
		'rotated-service-log-archives': 0,
	}

	const rawClusters = []

	for (let groupIdx = 0; groupIdx < safeDuplicates.length; groupIdx += 1) {
		const group = safeDuplicates[groupIdx]
		if (!group || !Array.isArray(group.files) || group.files.length < 2) {
			continue
		}

		const validFiles = group.files.filter(f => f && typeof f === 'object')
		if (validFiles.length < 2) {
			continue
		}

		const matchedEntries = []
		for (let fileIdx = 0; fileIdx < validFiles.length; fileIdx += 1) {
			const file = validFiles[fileIdx]
			const info = classifyDatabaseDumpLog(file.path)
			if (info && info.matched) {
				matchedEntries.push({ file, fileIdx, info })
			}
		}

		if (matchedEntries.length === 0) {
			continue
		}

		const primaryEntry = [...matchedEntries].sort((a, b) => {
			return (FAMILY_PRIORITY[b.info.family] || 0) - (FAMILY_PRIORITY[a.info.family] || 0)
		})[0]
		const primaryInfo = primaryEntry.info

		const rawInfo = computeGroupReclaimableInfo(group)
		const groupSizeBytes = Number(group.size) || validFiles.reduce((max, f) => Math.max(max, Number(f.size) || 0), 0)
		if (minSizeBytes > 0 && groupSizeBytes < minSizeBytes) {
			continue
		}

		const groupHashStr = String(group.hash || '').trim()
		const hasStrictGroupSha256 = STRICT_SHA256_HEX_RE.test(groupHashStr) || group.sha256Verified === true

		const forceKeepKeys = new Set()
		const excludeKeys = new Set()

		const members = validFiles.map((file, fileIdx) => {
			const normalizedPath = normalizePathForDiff(file.path) || String(file.path || '')
			const basename = extractBasename(normalizedPath)
			const selectionKey = String(getFileSelectionKey(file) ?? `${groupIdx}-${fileIdx}`)
			const override = options.memberOverrides[selectionKey] || 'auto'
			if (override === 'force-keep') {
				forceKeepKeys.add(selectionKey)
			} else if (override === 'exclude') {
				excludeKeys.add(selectionKey)
			}

			const directInfo = classifyDatabaseDumpLog(file.path)
			const memberInfo = directInfo && directInfo.matched ? directInfo : primaryInfo
			const context = inspectDatabaseDumpMemberContext(
				file,
				memberInfo,
				selectionKey,
				options.referenceTimeSec,
				options,
				{
					...datasetHints,
					hasStrictGroupSha256,
				}
			)
			const size = Number.isFinite(Number(file.size)) ? Number(file.size) : groupSizeBytes
			const formattedMtime = formatFileModifiedTime(context.mtimeSec !== null ? context.mtimeSec : file.mtime)

			return {
				selectionKey,
				fileId: file.id ?? null,
				rawPath: String(file.path || ''),
				normalizedPath,
				basename,
				extension: context.extension || memberInfo.extension,
				family: memberInfo.family,
				familyLabel: memberInfo.familyLabel,
				size,
				formattedSize: formatBytes(size),
				formattedMtime,
				override,
				tier: context.tier,
				tierLabel: context.tierLabel,
				context,
			}
		})

		const survivor = selectClusterSurvivor(members, options.survivorRule, excludeKeys)

		for (const member of members) {
			const verdictInfo = resolveMemberVerdict(member, survivor, options, forceKeepKeys, excludeKeys)
			member.role = survivor && member.selectionKey === survivor.selectionKey ? 'survivor' : 'duplicate'
			member.verdict = verdictInfo.verdict
			member.verdictLabel = verdictInfo.verdictLabel
			member.actionKind = verdictInfo.actionKind
			member.note = verdictInfo.note
		}

		const reclaimableMembers = members.filter(m => m.actionKind === 'reclaim' || m.actionKind === 'consolidate')
		const reclaimableBytes = reclaimableMembers.reduce((sum, m) => sum + m.size, 0)
		const reclaimableCopiesCount = reclaimableMembers.length
		const shieldedCopiesCount = members.filter(m => m.actionKind === 'shield').length
		const gfsAnchorCopiesCount = members.filter(m => m.context.isLatestGfsAnchor).length
		const sidecarCopiesCount = members.filter(m => m.context.isIntegritySidecar).length
		const compressedCopiesCount = members.filter(m => m.context.isCompressedDbArchive).length
		const uncompressedTwinCopiesCount = members.filter(m => m.context.isUncompressedPlainSqlTwin).length
		const walArtifactCopiesCount = members.filter(m => m.context.isWalArtifact).length
		const rotatedLogCopiesCount = members.filter(m => m.context.isRotatedServiceLog).length

		const hasGfsAnchor = gfsAnchorCopiesCount > 0
		const hasSidecar = sidecarCopiesCount > 0
		const hasCompressedArchive = compressedCopiesCount > 0
		const hasUncompressedTwin = uncompressedTwinCopiesCount > 0
		const hasWalArtifact = walArtifactCopiesCount > 0
		const hasRotatedLog = rotatedLogCopiesCount > 0

		let clusterRiskState = 'reclaimable'
		if (members.some(m => m.verdict === 'blocked-unverified-compressed-twin')) {
			clusterRiskState = 'unverified-compressed-twin'
		} else if (members.some(m => m.verdict === 'blocked-sidecar-integrity')) {
			clusterRiskState = 'sidecar-guarded'
		} else if (members.some(m => m.verdict === 'blocked-gfs-retention-anchor')) {
			clusterRiskState = 'gfs-anchor'
		} else if (hasUncompressedTwin && reclaimableCopiesCount > 0) {
			clusterRiskState = 'compressed-twin-verified'
		} else if ((hasWalArtifact || hasRotatedLog) && reclaimableCopiesCount > 0) {
			clusterRiskState = 'reclaimable'
		} else if (reclaimableCopiesCount === 0) {
			clusterRiskState = 'shielded'
		}

		const primaryGroupId = group.id ?? null
		const groupKey = String(group.hash || primaryGroupId || `db-dump-log-${groupIdx}`)
		const displayName = survivor ? survivor.basename : members[0].basename
		const governanceSignals = Array.from(new Set(members.map(m => m.tier)))
		const allArtifactTags = Array.from(new Set(members.flatMap(m => m.context.artifactTags)))

		rawClusters.push({
			groupKey,
			primaryGroupId,
			hash: group.hash || '',
			displayName,
			basename: displayName,
			dbLineageStem: survivor ? survivor.context.dbLineageStem : primaryInfo.dbLineageStem,
			snapshotDate: survivor ? survivor.context.snapshotDate : primaryInfo.snapshotDate,
			artifactTags: allArtifactTags,
			artifactSummary: allArtifactTags.length > 0 ? allArtifactTags.join(', ') : 'none',
			extension: survivor ? survivor.extension : primaryInfo.extension,
			family: primaryInfo.family,
			familyLabel: primaryInfo.familyLabel,
			tierLabel: survivor ? survivor.tierLabel : members[0].tierLabel,
			governanceSummary: governanceSignals.join(', '),
			copyCount: members.length,
			rawReclaimableBytes: rawInfo.reclaimableBytes,
			formattedRawReclaimableBytes: formatBytes(rawInfo.reclaimableBytes),
			reclaimableBytes,
			formattedReclaimableBytes: formatBytes(reclaimableBytes),
			reclaimableCopiesCount,
			shieldedCopiesCount,
			gfsAnchorCopiesCount,
			sidecarCopiesCount,
			compressedCopiesCount,
			uncompressedTwinCopiesCount,
			walArtifactCopiesCount,
			rotatedLogCopiesCount,
			hasGfsAnchor,
			hasSidecar,
			hasCompressedArchive,
			hasUncompressedTwin,
			hasWalArtifact,
			hasRotatedLog,
			clusterRiskState,
			survivor,
			members,
		})
	}

	const searchFiltered = rawClusters.filter(cluster => {
		if (!options.searchQuery) {
			return true
		}
		const q = options.searchQuery
		if (
			cluster.displayName.toLowerCase().includes(q)
			|| cluster.dbLineageStem.toLowerCase().includes(q)
			|| cluster.snapshotDate.toLowerCase().includes(q)
			|| cluster.artifactSummary.toLowerCase().includes(q)
			|| cluster.extension.toLowerCase().includes(q)
			|| cluster.familyLabel.toLowerCase().includes(q)
			|| cluster.governanceSummary.toLowerCase().includes(q)
		) {
			return true
		}
		return cluster.members.some(m => (
			m.normalizedPath.toLowerCase().includes(q)
			|| m.basename.toLowerCase().includes(q)
			|| m.context.artifactTag.toLowerCase().includes(q)
		))
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
		if (options.verdictFilter === 'gfs-anchor' && !cluster.hasGfsAnchor) {
			return false
		}
		if (options.verdictFilter === 'sidecar' && !cluster.hasSidecar) {
			return false
		}
		if (options.verdictFilter === 'uncompressed-twin' && !cluster.hasUncompressedTwin) {
			return false
		}
		if (options.verdictFilter === 'wal-artifact' && !cluster.hasWalArtifact) {
			return false
		}
		if (options.verdictFilter === 'rotated-log' && !cluster.hasRotatedLog) {
			return false
		}
		if (options.verdictFilter === 'shielded' && cluster.shieldedCopiesCount === 0 && cluster.clusterRiskState !== 'shielded') {
			return false
		}
		return true
	})

	clusters.sort((a, b) => {
		if (options.sortMode === 'risk_desc') {
			const riskA = a.gfsAnchorCopiesCount * 5 + a.sidecarCopiesCount * 4 + a.uncompressedTwinCopiesCount * 3 + a.walArtifactCopiesCount * 2 + a.shieldedCopiesCount
			const riskB = b.gfsAnchorCopiesCount * 5 + b.sidecarCopiesCount * 4 + b.uncompressedTwinCopiesCount * 3 + b.walArtifactCopiesCount * 2 + b.shieldedCopiesCount
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
	const totalGfsAnchorClusters = clusters.filter(c => c.hasGfsAnchor || c.hasSidecar).length
	const totalUncompressedTwinClusters = clusters.filter(c => c.hasUncompressedTwin).length
	const totalWalArtifactClusters = clusters.filter(c => c.hasWalArtifact).length
	const totalRotatedLogClusters = clusters.filter(c => c.hasRotatedLog).length
	const efficiencyPct = totalRawDuplicateBytes > 0
		? Math.round((totalReclaimableBytes / totalRawDuplicateBytes) * 100)
		: 0

	return {
		schema: DATABASE_DUMP_LOG_SCHEMA,
		options: {
			familyFilter: options.familyFilter,
			verdictFilter: options.verdictFilter,
			sortMode: options.sortMode,
			strategy: options.strategy,
			survivorRule: options.survivorRule,
			protectGfsAnchor: options.protectGfsAnchor,
			protectSidecars: options.protectSidecars,
			keepDaily: options.keepDaily,
			keepWeekly: options.keepWeekly,
			staleWalDays: options.staleWalDays,
			minSizeMb: options.minSizeMb,
			referenceTimeSec: options.referenceTimeSec,
		},
		summary: {
			totalClustersCount: clusters.length,
			totalRawDuplicateBytes,
			formattedRawDuplicateBytes: formatBytes(totalRawDuplicateBytes),
			totalReclaimableBytes,
			formattedReclaimableBytes: formatBytes(totalReclaimableBytes),
			totalReclaimableCopiesCount,
			totalShieldedCopiesCount,
			totalGfsAnchorClusters,
			totalUncompressedTwinClusters,
			totalWalArtifactClusters,
			totalRotatedLogClusters,
			efficiencyPct,
			familyCounts,
		},
		clusters,
	}
}

/**
 * Extract Nextcloud relative scan roots for occ files:scan suggestions.
 *
 * @param {Array<string>} paths Normalized file paths.
 * @return {Array<string>} Unique sorted Nextcloud relative roots.
 */
function extractOccScanPaths(paths) {
	const roots = new Set()
	for (const p of paths) {
		const clean = String(p || '').replace(/^\/+/, '')
		if (!clean) {
			continue
		}
		const parts = clean.split('/')
		if (parts[0] === '__groupfolders') {
			roots.add(`/__groupfolders/${parts[1] || ''}`.replace(/\/+$/, ''))
		} else if (parts.length >= 2 && parts[1] === 'files') {
			roots.add(`/${parts[0]}/files/${parts[2] || ''}`.replace(/\/+$/, ''))
		} else {
			roots.add(`/${parts[0]}`)
		}
	}
	return Array.from(roots).sort()
}

/**
 * Build a POSIX DRY_RUN=1 remediation script for Database Dumps, Snapshots & Rotated Logs.
 *
 * @param {object} analysis Output from analyzeDatabaseDumpLogDuplicates.
 * @param {object} [options] Script options.
 * @param {string} [options.dataRoot='/var/www/nextcloud/data'] Nextcloud data root directory.
 * @return {string} POSIX bash script with single-quoted paths, sha256sum -- verification, stat cross-device guard, and DRY_RUN=1 default.
 */
export function buildDatabaseDumpLogScript(analysis, options = {}) {
	const dataRoot = String(options.dataRoot || '/var/www/nextcloud/data').replace(/\/+$/, '') || '/var/www/nextcloud/data'
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const strategy = (analysis && analysis.options && analysis.options.strategy) || 'apply-gfs-dump-and-log-retention'

	const operations = []
	const affectedPaths = []

	for (const cluster of clusters) {
		const survivorPath = cluster && cluster.survivor ? cluster.survivor.normalizedPath : ''
		if (!survivorPath) {
			continue
		}
		for (const member of cluster.members || []) {
			if (member.actionKind !== 'reclaim' && member.actionKind !== 'consolidate') {
				continue
			}
			operations.push({
				clusterName: cluster.basename,
				family: cluster.familyLabel,
				tier: member.tierLabel,
				actionKind: member.actionKind,
				survivorPath,
				targetPath: member.normalizedPath,
				size: member.size,
			})
			affectedPaths.push(member.rawPath || member.normalizedPath)
		}
	}

	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# Database Dump, Backup Snapshot & Log Rotation Vault Auditor',
		`# Strategy: ${strategy} | Safe defaults: DRY_RUN=1, VERIFY_SHA256=1`,
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'VERIFY_SHA256="$' + '{VERIFY_SHA256:-1}"',
		`DATA_ROOT=${escapePosixSingleQuote(dataRoot)}`,
		'',
		'resolve_path() {',
		'  local rel="$1"',
		'  printf \'%s/%s\' "$DATA_ROOT" "$' + '{rel#/}"',
		'}',
		'',
		'verify_matching_digest() {',
		'  local survivor_full="$1"',
		'  local target_full="$2"',
		'  if [ "$VERIFY_SHA256" != "1" ]; then',
		'    return 0',
		'  fi',
		'  if command -v sha256sum >/dev/null 2>&1; then',
		'    local s_sum t_sum',
		'    s_sum="$(sha256sum -- "$survivor_full" | awk \'{print $1}\')"',
		'    t_sum="$(sha256sum -- "$target_full" | awk \'{print $1}\')"',
		'    [ "$s_sum" = "$t_sum" ]',
		'    return $?',
		'  fi',
		'  return 0',
		'}',
		'',
	]

	if (operations.length === 0) {
		lines.push('echo "No reclaimable uncompressed SQL twins, stale WAL artifacts, or expired GFS logs under current guards."')
		return lines.join('\n')
	}

	lines.push('prune_verified_db_artifact() {')
	lines.push('  local survivor_rel="$1"')
	lines.push('  local target_rel="$2"')
	lines.push('  local survivor_full target_full')
	lines.push('  survivor_full="$(resolve_path "$survivor_rel")"')
	lines.push('  target_full="$(resolve_path "$target_rel")"')
	lines.push('  if [ "$DRY_RUN" = "1" ]; then')
	lines.push('    printf \'[DRY_RUN] verify %s && rm -f -- %s\\n\' "$survivor_full" "$target_full"')
	lines.push('  else')
	lines.push('    if ! verify_matching_digest "$survivor_full" "$target_full"; then')
	lines.push('      printf \'[ABORT sha256 mismatch] %s\\n\' "$target_full" >&2')
	lines.push('      return 1')
	lines.push('    fi')
	lines.push('    rm -f -- "$target_full"')
	lines.push('  fi')
	lines.push('}')
	lines.push('')
	lines.push('consolidate_db_archive() {')
	lines.push('  local survivor_rel="$1"')
	lines.push('  local target_rel="$2"')
	lines.push('  local survivor_full target_full')
	lines.push('  survivor_full="$(resolve_path "$survivor_rel")"')
	lines.push('  target_full="$(resolve_path "$target_rel")"')
	lines.push('  if [ "$DRY_RUN" = "1" ]; then')
	lines.push('    printf \'[DRY_RUN] consolidate %s -> %s\\n\' "$target_full" "$survivor_full"')
	lines.push('  else')
	lines.push('    if ! verify_matching_digest "$survivor_full" "$target_full"; then')
	lines.push('      printf \'[ABORT sha256 mismatch] %s\\n\' "$target_full" >&2')
	lines.push('      return 1')
	lines.push('    fi')
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
		lines.push(`# ${op.family} [${op.tier}]: ${op.clusterName} (${formatBytes(op.size)})`)
		if (op.actionKind === 'consolidate') {
			lines.push(`consolidate_db_archive ${escapePosixSingleQuote(op.survivorPath)} ${escapePosixSingleQuote(op.targetPath)}`)
		} else {
			lines.push(`prune_verified_db_artifact ${escapePosixSingleQuote(op.survivorPath)} ${escapePosixSingleQuote(op.targetPath)}`)
		}
	}

	const scanPaths = extractOccScanPaths(affectedPaths)
	if (scanPaths.length > 0) {
		lines.push('')
		lines.push('# Nextcloud metadata rescan after DRY_RUN=0:')
		for (const scanPath of scanPaths) {
			lines.push(`# sudo -u www-data php occ files:scan --path=${escapePosixSingleQuote(scanPath)}`)
		}
	}

	return lines.join('\n')
}

/**
 * Build a Nextcloud Desktop .sync-exclude.lst snippet for WAL artifacts, temporary dumps, and rotated logs.
 *
 * @param {object} analysis Output from analyzeDatabaseDumpLogDuplicates.
 * @return {string} Newline-delimited Nextcloud sync-exclude patterns.
 */
export function buildDatabaseDumpLogSyncExcludeSnippet(analysis) {
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const lines = [
		'# Nextcloud Desktop .sync-exclude.lst rules for DB WAL journals, partial dumps & rotated logs',
		'*.sqlite-wal',
		'*.sqlite-shm',
		'*.db-journal',
		'pg_wal/',
		'ib_logfile*',
		'*.dump.part',
		'*.sql.tmp',
		'access.log.*',
		'error.log.*',
		'nextcloud.log.*',
		'worker-*.log.gz',
	]
	const seen = new Set(lines)
	for (const cluster of clusters) {
		if (cluster && cluster.hasUncompressedTwin && !seen.has('*.sql.part')) {
			lines.push('*.sql.part')
			seen.add('*.sql.part')
		}
	}
	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe CSV audit report for Database Dumps, Snapshots & Logs.
 *
 * @param {object} analysis Output from analyzeDatabaseDumpLogDuplicates.
 * @return {string} RFC-4180 CSV string with CWE-1236 formula escaping.
 */
export function buildDatabaseDumpLogCsvReport(analysis) {
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const headers = [
		'Cluster Key',
		'Artifact Name',
		'DB / Log Lineage Stem',
		'Snapshot Date',
		'GFS Slot',
		'Artifact Tags',
		'Extension',
		'Family',
		'Governance Tier',
		'GFS Anchor',
		'Integrity Sidecar',
		'Verified Compressed Twin',
		'Risk State',
		'Member Role',
		'Verdict',
		'Action',
		'Path',
		'Size Bytes',
		'Age Days',
		'Authority Score',
		'Modified',
	]

	const rows = [headers.map(h => escapeCsvCell(h)).join(',')]
	for (const cluster of clusters) {
		for (const member of cluster.members || []) {
			const row = [
				cluster.groupKey,
				cluster.basename,
				member.context.dbLineageStem,
				member.context.snapshotDate || '',
				member.context.gfsSlot,
				member.context.artifactTag,
				member.extension,
				cluster.familyLabel,
				member.tierLabel,
				member.context.isLatestGfsAnchor ? 'yes' : 'no',
				member.context.isIntegritySidecar ? 'yes' : 'no',
				member.context.hasVerifiedCompressedTwin ? 'yes' : 'no',
				cluster.clusterRiskState,
				member.role,
				member.verdictLabel,
				member.actionKind,
				member.normalizedPath,
				member.size,
				member.context.ageDays !== null ? member.context.ageDays : '',
				member.context.authorityScore,
				member.formattedMtime || '',
			]
			rows.push(row.map(cell => escapeCsvCell(cell)).join(','))
		}
	}

	return rows.join('\r\n')
}

/**
 * Build a structured JSON audit manifest for Database Dumps, Backup Snapshots & Rotated Logs.
 *
 * @param {object} analysis Output from analyzeDatabaseDumpLogDuplicates.
 * @param {string} [generatedAt] Optional ISO timestamp override.
 * @return {string} Pretty-printed JSON manifest.
 */
export function buildDatabaseDumpLogJsonReport(analysis, generatedAt = new Date().toISOString()) {
	const safeAnalysis = analysis && typeof analysis === 'object' ? analysis : { summary: {}, clusters: [], options: {} }
	return JSON.stringify({
		schema: DATABASE_DUMP_LOG_SCHEMA,
		generatedAt,
		options: safeAnalysis.options || {},
		summary: safeAnalysis.summary || {},
		clusters: (safeAnalysis.clusters || []).map(cluster => ({
			groupKey: cluster.groupKey,
			primaryGroupId: cluster.primaryGroupId,
			hash: cluster.hash,
			basename: cluster.basename,
			dbLineageStem: cluster.dbLineageStem,
			snapshotDate: cluster.snapshotDate,
			artifactTags: cluster.artifactTags,
			extension: cluster.extension,
			family: cluster.family,
			tierLabel: cluster.tierLabel,
			governanceSummary: cluster.governanceSummary,
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
				tier: member.tier,
				dbLineageStem: member.context.dbLineageStem,
				snapshotDate: member.context.snapshotDate,
				gfsSlot: member.context.gfsSlot,
				authorityScore: member.context.authorityScore,
				hasVerifiedCompressedTwin: member.context.hasVerifiedCompressedTwin,
				isLatestGfsAnchor: member.context.isLatestGfsAnchor,
				isIntegritySidecar: member.context.isIntegritySidecar,
				override: member.override,
			})),
		})),
	}, null, 2)
}
