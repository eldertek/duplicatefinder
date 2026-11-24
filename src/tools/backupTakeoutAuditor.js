/**
 * Pure Backup Archive, Cloud Takeout Bundle, Dated Snapshot & Extracted-Folder Twin Auditor.
 * Classifies and audits duplicate clusters across 4 domain families:
 * - Cloud Takeout & Export Archives (Takeout-*.zip, OneDrive_1_*.zip, Dropbox-*.zip, iCloud-*.zip, .tgz/.tar.gz/.tar.zst/.7z)
 * - Dated DB & System Snapshots (backup-2026*.sql.gz, pgdump-*.dump, mysql-*.sql.xz, wordpress-*-backup.wpress, config-snapshot-*.tar.enc)
 * - Archive & Extracted-Folder Twins (archive .zip/.tar.gz + extracted folder sharing lineageStem, e.g. Takeout/ + Takeout.zip)
 * - Incremental GFS Rotation Pools (daily-/weekly-/monthly-/snap- GFS generations exceeding retention policy)
 *
 * Assigns 5 governance tiers:
 * - immutable-offsite-vault (Immutable / Vault / Cold-Archive; strictly protected by default)
 * - gfs-latest-anchor (Most recent verified GFS / snapshot restore anchor; strictly protected by default)
 * - verified-unpacked-mirror (Verified extracted-folder twin matching an archive lineageStem)
 * - redundant-zip-payload (Redundant Takeout/export archive or duplicate compressed copy)
 * - stale-rotation-pool (Expired daily/weekly/monthly/snap rotation generations beyond keepRecentCount)
 *
 * Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const BACKUP_TAKEOUT_SCHEMA = 'duplicatefinder.backup-takeout-auditor.v1'

export const BACKUP_TAKEOUT_FAMILIES = Object.freeze([
	'all',
	'cloud-takeout-zips',
	'dated-db-sys-snapshots',
	'archive-unpacked-twins',
	'incremental-rotation-pools',
])

export const BACKUP_TAKEOUT_FAMILY_META = Object.freeze({
	'cloud-takeout-zips': {
		id: 'cloud-takeout-zips',
		label: 'Cloud Takeout & Export Archives',
		shortLabel: 'Takeout / OneDrive / Dropbox / iCloud',
	},
	'dated-db-sys-snapshots': {
		id: 'dated-db-sys-snapshots',
		label: 'Dated DB & System Snapshots',
		shortLabel: 'DB Dumps & Config (.sql.gz/.dump/.wpress/.tar.enc)',
	},
	'archive-unpacked-twins': {
		id: 'archive-unpacked-twins',
		label: 'Archive & Extracted-Folder Twins',
		shortLabel: 'Unpacked Twins (Folder + .zip/.tar.gz)',
	},
	'incremental-rotation-pools': {
		id: 'incremental-rotation-pools',
		label: 'Incremental GFS Rotation Pools',
		shortLabel: 'GFS Rotations (daily/weekly/monthly/snap)',
	},
})

export const BACKUP_TAKEOUT_STRATEGIES = Object.freeze([
	'retain-gfs-anchor-prune-expired',
	'prune-redundant-zips-when-unpacked-verified',
	'consolidate-cold-archive-vault',
])

export const BACKUP_TAKEOUT_SURVIVOR_RULES = Object.freeze([
	'vault-and-anchor-first',
	'gfs-newest-first',
	'unpacked-mirror-first',
	'shortest-path',
])

export const BACKUP_TAKEOUT_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'immutable-vault',
	'gfs-anchor',
	'unpacked-twins',
	'shielded',
])

export const BACKUP_TAKEOUT_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const BACKUP_TAKEOUT_PRESETS = Object.freeze([
	{
		id: 'all-backup-takeout-audit',
		name: 'All Backup, Takeout & GFS Audit',
		description: 'Audit Cloud Takeout bundles, dated DB/system snapshots, unpacked twins, and GFS rotation pools while shielding Immutable Vaults and latest GFS anchors.',
		familyFilter: 'all',
		strategy: 'retain-gfs-anchor-prune-expired',
		survivorRule: 'vault-and-anchor-first',
		protectImmutableVault: true,
		protectGfsLatestAnchor: true,
		protectVerifiedUnpacked: true,
		keepRecentCount: 3,
		staleBackupDays: 30,
		minSizeMb: 0,
	},
	{
		id: 'gfs-rotation-retention',
		name: 'GFS Anchor & Rotation Pruner',
		description: 'Strictly protect the newest GFS restore anchor and recent retention window, pruning only verified expired daily/weekly/monthly/snap generations.',
		familyFilter: 'incremental-rotation-pools',
		strategy: 'retain-gfs-anchor-prune-expired',
		survivorRule: 'gfs-newest-first',
		protectImmutableVault: true,
		protectGfsLatestAnchor: true,
		protectVerifiedUnpacked: true,
		keepRecentCount: 3,
		staleBackupDays: 30,
		minSizeMb: 0,
	},
	{
		id: 'takeout-unpacked-twin-prune',
		name: 'Prune Zips When Unpacked Verified',
		description: 'Retain verified extracted-folder twins and reclaim redundant .zip/.tar.gz/.7z payloads only when an extracted folder match is verified.',
		familyFilter: 'archive-unpacked-twins',
		strategy: 'prune-redundant-zips-when-unpacked-verified',
		survivorRule: 'unpacked-mirror-first',
		protectImmutableVault: true,
		protectGfsLatestAnchor: true,
		protectVerifiedUnpacked: true,
		keepRecentCount: 3,
		staleBackupDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'cold-archive-vault-consolidation',
		name: 'Consolidate to Cold-Archive Vault',
		description: 'Keep canonical copies inside Immutable / Vault / Cold-Archive storage and consolidate stray copies from Downloads or staging trees.',
		familyFilter: 'all',
		strategy: 'consolidate-cold-archive-vault',
		survivorRule: 'vault-and-anchor-first',
		protectImmutableVault: true,
		protectGfsLatestAnchor: true,
		protectVerifiedUnpacked: true,
		keepRecentCount: 3,
		staleBackupDays: 30,
		minSizeMb: 0,
	},
	{
		id: 'db-snapshot-guard',
		name: 'Dated DB & Sys Snapshot Guard',
		description: 'Audit .sql.gz, pgdump .dump, mysql .sql.xz, .wpress, and .tar.enc snapshots while shielding latest verified restore points.',
		familyFilter: 'dated-db-sys-snapshots',
		strategy: 'retain-gfs-anchor-prune-expired',
		survivorRule: 'gfs-newest-first',
		protectImmutableVault: true,
		protectGfsLatestAnchor: true,
		protectVerifiedUnpacked: true,
		keepRecentCount: 2,
		staleBackupDays: 30,
		minSizeMb: 0,
	},
])

const ARCHIVE_EXT_SET = new Set([
	'zip', 'tgz', 'tar.gz', 'tar.zst', 'tar.bz2', 'tar.xz', '7z', 'tbz2', 'txz', 'tzst',
])

const DB_SYS_EXT_SET = new Set([
	'sql.gz', 'sql.xz', 'sql.bz2', 'sql.zst', 'sql', 'dump', 'pgdump', 'wpress', 'tar.enc', 'enc.tar.gz', 'bak',
])

const COMPOUND_EXTENSIONS = [
	'enc.tar.gz',
	'tar.gz',
	'tar.zst',
	'tar.bz2',
	'tar.xz',
	'tar.enc',
	'sql.gz',
	'sql.xz',
	'sql.bz2',
	'sql.zst',
]

const IMMUTABLE_VAULT_PATH_RE = /(\/immutable(?:[-_][^/]*)?\/|\/vault(?:[-_][^/]*)?\/|\/cold[-_ ]?archive(?:s)?\/|\/offsite[-_ ]?vault\/|\/offsite[-_ ]?backup(?:s)?\/|\/worm[-_ ]?archive\/|\/airgap\/|\/glacier\/|\/__groupfolders\/\d+\/(?:immutable|vault|cold[-_ ]?archive|offsite))/i

const CLOUD_TAKEOUT_NAME_RE = /^(?:takeout(?:[-_.]|$)|onedrive(?:_\d+)?(?:[-_.]|$)|dropbox(?:[-_.]|$)|icloud(?:[-_.]|$)|google[-_ ]?takeout)/i
const CLOUD_TAKEOUT_PATH_RE = /(\/takeout\/|\/cloud[-_ ]?exports?\/|\/cloud[-_ ]?takeout\/|\/google[-_ ]?takeout\/)/i

const DB_SYS_NAME_RE = /(?:^|[_.\-\s])(pgdump|pg_dump|mysqldump|mysql|postgres|mariadb|sqlite|wordpress|wp[-_ ]?backup|config[-_ ]?snapshot|sys[-_ ]?snapshot|db[-_ ]?backup|database[-_ ]?dump)(?=$|[_.\-\s])/i
const DATED_BACKUP_NAME_RE = /(?:^|[_.\-\s])(backup|dump|snapshot|export)(?=[_.\-\s](?:19|20)\d{2})/i

const GFS_PREFIX_RE = /^(daily|weekly|monthly|yearly|hourly|snap|snapshot|gfs|incr|inc)(?:[-_.]|$)/i
const GFS_PATH_RE = /(\/(?:daily|weekly|monthly|yearly|hourly|gfs|rotation|incremental|snapshots?)\/)/i

const STAGING_BLOAT_PATH_RE = /(\/downloads\/|\/telechargements\/|\/tmp\/|\/temp\/|\/scratch\/|\/incoming\/|\/staging\/)/i
const UNPACKED_CUE_PATH_RE = /(\/(?:unpacked|extracted|uncompressed|Takeout)\/)/i

const ISO_DATE_TIME_RE = /(?:^|[_.\-\s])((?:19|20)\d{2})[-_]?(\d{2})[-_]?(\d{2})(?:t(\d{2})(\d{2})(\d{2})z?)?(?=$|[_.\-\s])/i
const PART_SUFFIX_RE = /[-_](?:part|vol|chunk)?\d{1,4}$/i
const COPY_SUFFIX_RE = /\s-\s?copy(?:\s*\(\d+\))?|\s*\(\d+\)|_copy\b/gi

const GENERIC_FOLDER_SEGMENTS = new Set([
	'',
	'files',
	'__groupfolders',
	'downloads',
	'telechargements',
	'backups',
	'backup',
	'archives',
	'archive',
	'vault',
	'immutable',
	'cold-archive',
	'cold_archive',
	'offsite',
	'offsite-vault',
	'db',
	'snapshots',
	'snapshot',
	'daily',
	'weekly',
	'monthly',
	'yearly',
	'gfs',
	'rotation',
	'incremental',
	'exports',
	'export',
	'tmp',
	'temp',
	'scratch',
	'staging',
	'incoming',
	'unpacked',
	'extracted',
	'cloud-exports',
	'cloud-takeout',
])

const TIER_LABELS = Object.freeze({
	'immutable-offsite-vault': 'Immutable / Offsite Cold-Archive Vault',
	'gfs-latest-anchor': 'GFS Latest Restore Anchor',
	'verified-unpacked-mirror': 'Verified Extracted-Folder Mirror',
	'redundant-zip-payload': 'Redundant Archive / Takeout Payload',
	'stale-rotation-pool': 'Expired GFS Rotation Pool',
})

const TIER_AUTHORITY = Object.freeze({
	'immutable-offsite-vault': 99,
	'gfs-latest-anchor': 94,
	'verified-unpacked-mirror': 78,
	'redundant-zip-payload': 28,
	'stale-rotation-pool': 18,
})

const VERDICT_LABELS = Object.freeze({
	'keep-canonical-survivor': 'Keep Canonical Restore Point',
	'reclaim-redundant-backup': 'Reclaim Redundant Backup Copy',
	'reclaim-expired-rotation': 'Prune Expired GFS Generation',
	'reclaim-redundant-zip': 'Prune Verified Redundant Archive',
	'consolidate-to-vault': 'Consolidate to Cold-Archive Vault',
	'blocked-immutable-vault': 'Blocked: Immutable / Vault Guard',
	'blocked-gfs-latest-anchor': 'Blocked: GFS Latest Anchor Guard',
	'blocked-gfs-retention-window': 'Blocked: Active GFS Retention Window',
	'blocked-unverified-gfs-anchor': 'Blocked: Unverified GFS Anchor Integrity',
	'blocked-verified-unpacked': 'Protected: Verified Extracted Mirror',
	'blocked-unverified-unpacked': 'Blocked: Extracted Folder Not Verified',
	'blocked-not-archive': 'Shielded: Non-Archive Twin Member',
	'blocked-manual-shield': 'Blocked: Operator Shield',
	excluded: 'Excluded by Operator',
})

const FAMILY_PRIORITY = Object.freeze({
	'archive-unpacked-twins': 4,
	'incremental-rotation-pools': 3,
	'dated-db-sys-snapshots': 2,
	'cloud-takeout-zips': 1,
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
 * Extract parent directory path from a normalized file path.
 *
 * @param {string} normalizedPath Normalized path.
 * @return {string} Parent directory path.
 */
function extractParentDir(normalizedPath) {
	const raw = String(normalizedPath || '').replace(/\/+$/, '')
	const idx = raw.lastIndexOf('/')
	return idx <= 0 ? '' : raw.slice(0, idx)
}

/**
 * Extract compound or simple extension in lowercase without leading dot.
 *
 * @param {string} lowerBase Lowercase basename.
 * @return {string} Extension string or empty string.
 */
function extractBackupExtension(lowerBase) {
	for (const compound of COMPOUND_EXTENSIONS) {
		if (lowerBase.endsWith(`.${compound}`)) {
			return compound
		}
	}
	const lastDot = lowerBase.lastIndexOf('.')
	if (lastDot <= 0 || lastDot >= lowerBase.length - 1) {
		return ''
	}
	return lowerBase.slice(lastDot + 1)
}

/**
 * Extract an embedded YYYY-MM-DD or YYYYMMDD timestamp from a filename stem.
 *
 * @param {string} stem File stem.
 * @return {number|null} Epoch seconds or null.
 */
function extractEmbeddedDateTimestamp(stem) {
	const match = ISO_DATE_TIME_RE.exec(String(stem || ''))
	if (!match) {
		return null
	}
	const year = Number(match[1])
	const month = Number(match[2])
	const day = Number(match[3])
	const hour = match[4] ? Number(match[4]) : 0
	const min = match[5] ? Number(match[5]) : 0
	const sec = match[6] ? Number(match[6]) : 0
	if (month < 1 || month > 12 || day < 1 || day > 31) {
		return null
	}
	const ms = Date.UTC(year, month - 1, day, hour, min, sec)
	return Number.isFinite(ms) ? Math.floor(ms / 1000) : null
}

/**
 * Normalize a stem candidate into a clean canonical lineageStem.
 *
 * @param {string} rawStem Raw stem without extension.
 * @return {string} Clean lineage stem.
 */
function normalizeLineageStem(rawStem) {
	let stem = String(rawStem || '')
		.replace(COPY_SUFFIX_RE, '')
		.trim()

	if (!stem) {
		return ''
	}

	const gfsMatch = GFS_PREFIX_RE.exec(stem)
	if (gfsMatch) {
		stem = stem.slice(gfsMatch[0].length)
	}

	stem = stem
		.replace(ISO_DATE_TIME_RE, '')
		.replace(PART_SUFFIX_RE, '')
		.replace(/[-_.](?:backup|snapshot|dump|export)$/i, '')
		.replace(/^[\s_.-]+|[\s_.-]+$/g, '')

	return stem || String(rawStem || '').replace(COPY_SUFFIX_RE, '').trim()
}

/**
 * Collect candidate extracted-folder stems from a file path's directory segments.
 *
 * @param {string} normalizedPath Normalized file path.
 * @param {boolean} isExplicitDir Whether the entry represents a directory itself.
 * @return {Array<string>} Lowercase candidate folder stems.
 */
function collectFolderStemCandidates(normalizedPath, isExplicitDir = false) {
	const clean = String(normalizedPath || '').replace(/\/+$/, '')
	if (!clean) {
		return []
	}
	const parts = clean.split('/').filter(Boolean)
	const dirParts = isExplicitDir ? parts : parts.slice(0, -1)
	const candidates = []
	for (let i = 0; i < dirParts.length; i += 1) {
		const segment = dirParts[i]
		const lowerSeg = segment.toLowerCase()
		if (GENERIC_FOLDER_SEGMENTS.has(lowerSeg)) {
			continue
		}
		if (i === 0 && parts[0] !== '__groupfolders') {
			continue
		}
		if (i === 1 && parts[0] === '__groupfolders' && /^\d+$/.test(lowerSeg)) {
			continue
		}
		if (/^(?:19|20)\d{2}(?:-\d{2}(?:-\d{2})?)?$/.test(lowerSeg)) {
			continue
		}
		candidates.push(lowerSeg)
		const normalizedSeg = normalizeLineageStem(segment).toLowerCase()
		if (normalizedSeg && normalizedSeg !== lowerSeg && !GENERIC_FOLDER_SEGMENTS.has(normalizedSeg)) {
			candidates.push(normalizedSeg)
		}
	}
	return Array.from(new Set(candidates))
}

/**
 * Parse Backup Archive, Cloud Takeout, Snapshot, and GFS Rotation metadata from basename and path.
 *
 * @param {string} basename File basename.
 * @param {string} [normalizedPath=''] Normalized file path.
 * @return {object} Parsed lineage stem, GFS cadence, archive/snapshot flags, and tags.
 */
export function parseBackupTakeoutArtifactInfo(basename, normalizedPath = '') {
	const rawBase = String(basename || '')
	const lowerBase = rawBase.toLowerCase()
	const lowerPath = String(normalizedPath || '').toLowerCase()
	const ext = extractBackupExtension(lowerBase)

	let rawStem = rawBase
	if (ext && lowerBase.endsWith(`.${ext}`)) {
		rawStem = rawBase.slice(0, rawBase.length - ext.length - 1)
	}
	const cleanRawStem = rawStem.replace(COPY_SUFFIX_RE, '').trim() || rawStem
	const lineageStem = normalizeLineageStem(cleanRawStem) || cleanRawStem || rawBase

	const isArchiveExt = ARCHIVE_EXT_SET.has(ext)
	const isDbSysExt = DB_SYS_EXT_SET.has(ext)
	const embeddedTimestampSec = extractEmbeddedDateTimestamp(cleanRawStem)

	const gfsMatch = GFS_PREFIX_RE.exec(cleanRawStem)
	const gfsCadence = gfsMatch ? gfsMatch[1].toLowerCase() : ''
	const isGfsRotation = Boolean(gfsCadence) || (isArchiveExt && GFS_PATH_RE.test(lowerPath))

	const isCloudTakeout = CLOUD_TAKEOUT_NAME_RE.test(cleanRawStem)
		|| (isArchiveExt && CLOUD_TAKEOUT_PATH_RE.test(lowerPath))
		|| (isArchiveExt && /(?:takeout|onedrive|dropbox|icloud)/i.test(cleanRawStem))

	const isDatedDbSysSnapshot = isDbSysExt
		|| DB_SYS_NAME_RE.test(cleanRawStem)
		|| (DATED_BACKUP_NAME_RE.test(cleanRawStem) && (isDbSysExt || isArchiveExt))

	const isImmutableVaultPath = IMMUTABLE_VAULT_PATH_RE.test(lowerPath)
	const isStagingBloatPath = STAGING_BLOAT_PATH_RE.test(lowerPath)

	const artifactTags = []
	const pushTag = tag => {
		const norm = String(tag || '').trim()
		if (norm && !artifactTags.includes(norm)) {
			artifactTags.push(norm)
		}
	}

	if (isCloudTakeout) {
		if (/takeout/i.test(cleanRawStem) || /takeout/i.test(lowerPath)) {
			pushTag('takeout')
		} else if (/onedrive/i.test(cleanRawStem)) {
			pushTag('onedrive')
		} else if (/dropbox/i.test(cleanRawStem)) {
			pushTag('dropbox')
		} else if (/icloud/i.test(cleanRawStem)) {
			pushTag('icloud')
		} else {
			pushTag('cloud-export')
		}
	}
	if (isDatedDbSysSnapshot) {
		if (ext) {
			pushTag(ext)
		}
		if (/pgdump|pg_dump/i.test(cleanRawStem)) {
			pushTag('pgdump')
		}
		if (/mysql/i.test(cleanRawStem)) {
			pushTag('mysql')
		}
		if (/wordpress|wpress/i.test(lowerBase)) {
			pushTag('wordpress')
		}
		if (/config[-_ ]?snapshot|\.tar\.enc$/i.test(lowerBase)) {
			pushTag('encrypted-config')
		}
	}
	if (isGfsRotation) {
		pushTag(gfsCadence ? `gfs:${gfsCadence}` : 'gfs-pool')
	}
	if (isArchiveExt) {
		pushTag(`archive:${ext}`)
	}
	if (isImmutableVaultPath) {
		pushTag('immutable-vault')
	}

	return {
		rawStem: cleanRawStem,
		lineageStem,
		extension: ext,
		artifactTags,
		artifactTag: artifactTags.length > 0 ? artifactTags.join(', ') : 'none',
		isArchiveExt,
		isDbSysExt,
		isCloudTakeout,
		isDatedDbSysSnapshot,
		isGfsRotation,
		gfsCadence,
		embeddedTimestampSec,
		isImmutableVaultPath,
		isStagingBloatPath,
	}
}

/**
 * Build dataset-wide stem hints for extracted-folder twins and GFS rotation pools.
 *
 * @param {Array<object>} duplicates Loaded duplicate groups.
 * @return {object} Dataset stem hints and GFS pool timelines.
 */
function buildDatasetBackupHints(duplicates) {
	const archiveStems = new Set()
	const extractedFolderStems = new Map()
	const gfsPoolEntries = new Map()

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
			const normalized = normalizePathForDiff(file.path) || String(file.path)
			const isExplicitDir = normalized.endsWith('/') || file.isDirectory === true || file.type === 'directory'
			const basename = extractBasename(normalized)
			const info = parseBackupTakeoutArtifactInfo(basename, normalized)

			if (info.isArchiveExt && !isExplicitDir) {
				archiveStems.add(info.rawStem.toLowerCase())
				archiveStems.add(info.lineageStem.toLowerCase())
			}

			const folderCandidates = collectFolderStemCandidates(normalized, isExplicitDir)
			for (const stem of folderCandidates) {
				if (!extractedFolderStems.has(stem)) {
					extractedFolderStems.set(stem, [])
				}
				extractedFolderStems.get(stem).push(normalized)
			}

			if (info.isGfsRotation || info.isDatedDbSysSnapshot) {
				const poolKey = buildGfsPoolKey(info, normalized)
				const restoreTs = getFileMtimeSeconds(file) ?? info.embeddedTimestampSec
				if (!gfsPoolEntries.has(poolKey)) {
					gfsPoolEntries.set(poolKey, [])
				}
				const selectionKey = String(getFileSelectionKey(file) ?? `${groupIdx}-${fileIdx}`)
				gfsPoolEntries.get(poolKey).push({
					selectionKey,
					normalizedPath: normalized,
					restoreTs,
				})
			}
		}
	}

	const gfsPoolMeta = new Map()
	for (const [poolKey, entries] of gfsPoolEntries.entries()) {
		const verifiedEntries = entries.filter(e => e.restoreTs !== null)
		const uniqueTimestamps = Array.from(new Set(verifiedEntries.map(e => e.restoreTs))).sort((a, b) => b - a)
		const latestTs = uniqueTimestamps.length > 0 ? uniqueTimestamps[0] : null
		gfsPoolMeta.set(poolKey, {
			poolKey,
			hasVerifiedAnchor: latestTs !== null,
			latestTs,
			uniqueTimestamps,
			totalEntries: entries.length,
		})
	}

	return {
		archiveStems,
		extractedFolderStems,
		gfsPoolMeta,
	}
}

/**
 * Derive a deterministic GFS rotation pool key for a backup/snapshot file.
 *
 * @param {object} info Parsed artifact metadata.
 * @param {string} normalizedPath Normalized file path.
 * @return {string} Deterministic GFS pool identifier.
 */
function buildGfsPoolKey(info, normalizedPath) {
	const cadence = info.gfsCadence || (info.isDatedDbSysSnapshot ? 'snapshot' : 'pool')
	const stem = (info.lineageStem || 'backup').toLowerCase()
	if (stem && stem !== cadence) {
		return `${cadence}:${stem}`
	}
	const parent = extractParentDir(normalizedPath).toLowerCase()
	return `${cadence}:${parent || 'root'}`
}

/**
 * Check whether an archive or member has a verified extracted-folder twin in dataset or cluster hints.
 *
 * @param {object} info Parsed artifact metadata.
 * @param {string} normalizedPath Normalized file path.
 * @param {object|null} hints Dataset/cluster hints.
 * @return {boolean} True when a matching extracted folder is present.
 */
function hasMatchingExtractedTwin(info, normalizedPath, hints) {
	if (!hints || !hints.extractedFolderStems) {
		return false
	}
	const rawLower = info.rawStem.toLowerCase()
	const lineageLower = info.lineageStem.toLowerCase()
	const ownFolderCandidates = new Set(collectFolderStemCandidates(normalizedPath, false))

	for (const key of [rawLower, lineageLower]) {
		if (!key) {
			continue
		}
		const matches = hints.extractedFolderStems.get(key)
		if (Array.isArray(matches) && matches.length > 0) {
			// Ensure we do not merely match a file inside its own identically named parent folder if no other proof exists,
			// unless that folder actually holds extracted content or a sibling copy exists.
			if (matches.some(p => p !== normalizedPath)) {
				return true
			}
			if (ownFolderCandidates.has(key) && UNPACKED_CUE_PATH_RE.test(normalizedPath.toLowerCase())) {
				return true
			}
		}
	}
	return false
}

/**
 * Check whether a file resides inside an extracted directory matching a known archive stem.
 *
 * @param {string} normalizedPath Normalized file path.
 * @param {object|null} hints Dataset hints.
 * @return {boolean} True when path is inside an extracted-folder mirror of a known archive.
 */
function isInsideVerifiedUnpackedFolder(normalizedPath, hints) {
	if (!hints || !hints.archiveStems || hints.archiveStems.size === 0) {
		return false
	}
	const folderCandidates = collectFolderStemCandidates(normalizedPath, false)
	return folderCandidates.some(stem => hints.archiveStems.has(stem))
}

/**
 * Classify a file path into one of the 4 Backup Archive, Cloud Takeout, Snapshot, and Twin families.
 *
 * @param {string} rawPath File path.
 * @param {object} [hints=null] Optional dataset hints (archiveStems, extractedFolderStems).
 * @return {object|null} Classification metadata or null for unrelated files.
 */
export function classifyBackupTakeoutArtifact(rawPath, hints = null) {
	const normalized = normalizePathForDiff(rawPath) || String(rawPath || '')
	const basename = extractBasename(normalized)
	const lowerBase = basename.toLowerCase()

	if (!lowerBase) {
		return null
	}

	const info = parseBackupTakeoutArtifactInfo(basename, normalized)
	const hasUnpackedTwin = info.isArchiveExt && hasMatchingExtractedTwin(info, normalized, hints)
	const insideUnpackedMirror = !info.isArchiveExt && isInsideVerifiedUnpackedFolder(normalized, hints)

	if (hasUnpackedTwin || insideUnpackedMirror) {
		return {
			matched: true,
			family: 'archive-unpacked-twins',
			familyLabel: BACKUP_TAKEOUT_FAMILY_META['archive-unpacked-twins'].label,
			hasUnpackedTwin,
			insideUnpackedMirror,
			...info,
		}
	}

	if (info.isGfsRotation) {
		return {
			matched: true,
			family: 'incremental-rotation-pools',
			familyLabel: BACKUP_TAKEOUT_FAMILY_META['incremental-rotation-pools'].label,
			hasUnpackedTwin: false,
			insideUnpackedMirror: false,
			...info,
		}
	}

	if (info.isDatedDbSysSnapshot) {
		return {
			matched: true,
			family: 'dated-db-sys-snapshots',
			familyLabel: BACKUP_TAKEOUT_FAMILY_META['dated-db-sys-snapshots'].label,
			hasUnpackedTwin: false,
			insideUnpackedMirror: false,
			...info,
		}
	}

	if (info.isCloudTakeout || (info.isArchiveExt && (/(?:export|backup|archive|bundle)/i.test(info.rawStem) || info.isImmutableVaultPath))) {
		return {
			matched: true,
			family: 'cloud-takeout-zips',
			familyLabel: BACKUP_TAKEOUT_FAMILY_META['cloud-takeout-zips'].label,
			hasUnpackedTwin: false,
			insideUnpackedMirror: false,
			...info,
		}
	}

	return null
}

/**
 * Inspect governance tier, GFS anchor rank, unpacked verification, and authority context for a cluster member.
 *
 * @param {object} file Duplicate file entry.
 * @param {object} classification Classification metadata.
 * @param {number} referenceTimeSec Reference epoch seconds.
 * @param {object} options Normalized options (keepRecentCount, staleBackupDays).
 * @param {object} [clusterHints={}] Dataset and cluster verification hints.
 * @return {object} Member governance and verification context.
 */
export function inspectBackupTakeoutMemberContext(file, classification, referenceTimeSec, options, clusterHints = {}) {
	const normalizedPath = normalizePathForDiff(file && file.path) || String((file && file.path) || '')
	const basename = extractBasename(normalizedPath)
	const parsed = parseBackupTakeoutArtifactInfo(basename, normalizedPath)
	const mtimeSec = getFileMtimeSeconds(file)
	const restoreTimestampSec = mtimeSec ?? parsed.embeddedTimestampSec
	const ageDays = restoreTimestampSec !== null && Number.isFinite(referenceTimeSec)
		? Math.max(0, Math.floor((referenceTimeSec - restoreTimestampSec) / 86400))
		: null

	const poolKey = buildGfsPoolKey(parsed, normalizedPath)
	const poolMeta = clusterHints.gfsPoolMeta ? clusterHints.gfsPoolMeta.get(poolKey) : null

	let gfsGenerationRank = null
	let isGfsLatestAnchor = false
	let isWithinGfsRetention = false
	let hasVerifiedGfsAnchor = false

	if (poolMeta && poolMeta.hasVerifiedAnchor && restoreTimestampSec !== null) {
		hasVerifiedGfsAnchor = true
		const rankIdx = poolMeta.uniqueTimestamps.indexOf(restoreTimestampSec)
		gfsGenerationRank = rankIdx >= 0 ? rankIdx : null
		if (gfsGenerationRank === 0) {
			isGfsLatestAnchor = true
			isWithinGfsRetention = true
		} else if (gfsGenerationRank !== null && gfsGenerationRank < options.keepRecentCount) {
			isWithinGfsRetention = true
		}
	} else if (clusterHints.clusterLatestTimestamp !== null && restoreTimestampSec !== null) {
		hasVerifiedGfsAnchor = Boolean(parsed.isGfsRotation || parsed.isDatedDbSysSnapshot)
		if (hasVerifiedGfsAnchor && restoreTimestampSec === clusterHints.clusterLatestTimestamp) {
			isGfsLatestAnchor = true
			isWithinGfsRetention = true
			gfsGenerationRank = 0
		}
	}

	const hasVerifiedUnpackedFolder = Boolean(
		(file && file.unpackedFolderVerified === true)
		|| clusterHints.clusterHasUnpackedMirror
		|| hasMatchingExtractedTwin(parsed, normalizedPath, clusterHints)
	)
	const isVerifiedUnpackedMirror = Boolean(
		(file && file.isUnpackedMirror === true)
		|| (!parsed.isArchiveExt && isInsideVerifiedUnpackedFolder(normalizedPath, clusterHints))
		|| (!parsed.isArchiveExt && classification.insideUnpackedMirror)
	)

	const isImmutableVault = parsed.isImmutableVaultPath
	const isStaleRotationGeneration = Boolean(
		(parsed.isGfsRotation || parsed.isDatedDbSysSnapshot)
		&& hasVerifiedGfsAnchor
		&& !isGfsLatestAnchor
		&& !isWithinGfsRetention
		&& (ageDays === null || ageDays >= options.staleBackupDays || (gfsGenerationRank !== null && gfsGenerationRank >= options.keepRecentCount))
	)

	let tier = 'redundant-zip-payload'
	if (isImmutableVault) {
		tier = 'immutable-offsite-vault'
	} else if (isGfsLatestAnchor || isWithinGfsRetention) {
		tier = 'gfs-latest-anchor'
	} else if (isVerifiedUnpackedMirror) {
		tier = 'verified-unpacked-mirror'
	} else if (isStaleRotationGeneration || parsed.isGfsRotation) {
		tier = 'stale-rotation-pool'
	}

	let authorityScore = TIER_AUTHORITY[tier] || 28
	if (isImmutableVault) {
		authorityScore += 5
	}
	if (isGfsLatestAnchor) {
		authorityScore += 4
	}
	if (parsed.isDatedDbSysSnapshot) {
		authorityScore += 3
	}
	if (parsed.isStagingBloatPath) {
		authorityScore -= 10
	}
	if (isStaleRotationGeneration) {
		authorityScore -= 8
	}

	return {
		tier,
		tierLabel: TIER_LABELS[tier] || TIER_LABELS['redundant-zip-payload'],
		authorityScore,
		extension: parsed.extension || classification.extension || '',
		rawStem: parsed.rawStem,
		lineageStem: parsed.lineageStem,
		artifactTags: parsed.artifactTags,
		artifactTag: parsed.artifactTag,
		gfsPoolKey: poolKey,
		gfsCadence: parsed.gfsCadence,
		gfsGenerationRank,
		isImmutableVault,
		isGfsLatestAnchor,
		isWithinGfsRetention,
		hasVerifiedGfsAnchor,
		isVerifiedUnpackedMirror,
		hasVerifiedUnpackedFolder,
		isArchivePayload: parsed.isArchiveExt,
		isGfsRotation: parsed.isGfsRotation,
		isDatedDbSysSnapshot: parsed.isDatedDbSysSnapshot,
		isCloudTakeout: parsed.isCloudTakeout,
		isStagingBloatPath: parsed.isStagingBloatPath,
		isStaleRotationGeneration,
		mtimeSec,
		restoreTimestampSec,
		ageDays,
	}
}

/**
 * Select the canonical surviving copy inside a backup/takeout/snapshot cluster.
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
		if (survivorRule === 'gfs-newest-first') {
			const tsA = a.context.restoreTimestampSec ?? -1
			const tsB = b.context.restoreTimestampSec ?? -1
			if (tsA !== tsB) {
				return tsB - tsA
			}
			if (a.context.authorityScore !== b.context.authorityScore) {
				return b.context.authorityScore - a.context.authorityScore
			}
		} else if (survivorRule === 'unpacked-mirror-first') {
			if (a.context.isVerifiedUnpackedMirror !== b.context.isVerifiedUnpackedMirror) {
				return a.context.isVerifiedUnpackedMirror ? -1 : 1
			}
			if (a.context.authorityScore !== b.context.authorityScore) {
				return b.context.authorityScore - a.context.authorityScore
			}
		} else if (survivorRule === 'shortest-path') {
			if (a.normalizedPath.length !== b.normalizedPath.length) {
				return a.normalizedPath.length - b.normalizedPath.length
			}
			if (a.context.authorityScore !== b.context.authorityScore) {
				return b.context.authorityScore - a.context.authorityScore
			}
		} else {
			if (a.context.authorityScore !== b.context.authorityScore) {
				return b.context.authorityScore - a.context.authorityScore
			}
		}

		const tsA = a.context.restoreTimestampSec ?? 0
		const tsB = b.context.restoreTimestampSec ?? 0
		if (tsA !== tsB) {
			return tsB - tsA
		}
		return a.normalizedPath.localeCompare(b.normalizedPath)
	})

	return sorted[0] || null
}

/**
 * Determine the deterministic audit verdict for a backup/takeout/snapshot cluster member.
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
			note: 'Excluded from Backup & Takeout audit actions by manual operator override.',
		}
	}

	if (survivor && member.selectionKey === survivor.selectionKey) {
		return {
			verdict: 'keep-canonical-survivor',
			verdictLabel: VERDICT_LABELS['keep-canonical-survivor'],
			actionKind: 'keep',
			note: `Canonical ${member.context.tierLabel} copy retained as the authoritative restore point.`,
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

	if (options.protectImmutableVault && member.context.isImmutableVault) {
		return {
			verdict: 'blocked-immutable-vault',
			verdictLabel: VERDICT_LABELS['blocked-immutable-vault'],
			actionKind: 'shield',
			note: 'Strictly protected by Immutable / Vault / Cold-Archive Guard; offsite and cold-storage backups are never pruned automatically.',
		}
	}

	if (options.protectGfsLatestAnchor && member.context.isGfsLatestAnchor) {
		return {
			verdict: 'blocked-gfs-latest-anchor',
			verdictLabel: VERDICT_LABELS['blocked-gfs-latest-anchor'],
			actionKind: 'shield',
			note: 'Strictly protected by GFS Latest Anchor Guard; the newest verified restore point in a rotation pool is never pruned.',
		}
	}

	if (options.strategy === 'prune-redundant-zips-when-unpacked-verified') {
		if (options.protectVerifiedUnpacked && member.context.isVerifiedUnpackedMirror) {
			return {
				verdict: 'blocked-verified-unpacked',
				verdictLabel: VERDICT_LABELS['blocked-verified-unpacked'],
				actionKind: 'shield',
				note: 'Retained as the verified extracted-folder mirror matching the archive lineage stem.',
			}
		}
		if (!member.context.isArchivePayload) {
			return {
				verdict: 'blocked-not-archive',
				verdictLabel: VERDICT_LABELS['blocked-not-archive'],
				actionKind: 'shield',
				note: 'Shielded by Prune Redundant Zips strategy because member is not a compressed archive payload.',
			}
		}
		if (!member.context.hasVerifiedUnpackedFolder) {
			return {
				verdict: 'blocked-unverified-unpacked',
				verdictLabel: VERDICT_LABELS['blocked-unverified-unpacked'],
				actionKind: 'shield',
				note: 'Blocked because no verified extracted folder matches this archive lineage stem; archive cannot be deleted safely.',
			}
		}
		return {
			verdict: 'reclaim-redundant-zip',
			verdictLabel: VERDICT_LABELS['reclaim-redundant-zip'],
			actionKind: 'reclaim',
			note: 'Redundant .zip/.tar.gz/.7z archive whose extracted-folder twin is verified; safe to prune after SHA-256 check.',
		}
	}

	if (options.strategy === 'retain-gfs-anchor-prune-expired') {
		if (member.context.isGfsRotation || member.context.isDatedDbSysSnapshot) {
			if (!member.context.hasVerifiedGfsAnchor) {
				return {
					verdict: 'blocked-unverified-gfs-anchor',
					verdictLabel: VERDICT_LABELS['blocked-unverified-gfs-anchor'],
					actionKind: 'shield',
					note: 'Blocked because GFS anchor presence or timestamp integrity is unverified; snapshot cannot be pruned safely.',
				}
			}
			if (options.protectGfsLatestAnchor && member.context.isWithinGfsRetention) {
				return {
					verdict: 'blocked-gfs-retention-window',
					verdictLabel: VERDICT_LABELS['blocked-gfs-retention-window'],
					actionKind: 'shield',
					note: `Shielded inside active GFS retention window (keep latest ${options.keepRecentCount} generations).`,
				}
			}
			if (member.context.isStaleRotationGeneration) {
				return {
					verdict: 'reclaim-expired-rotation',
					verdictLabel: VERDICT_LABELS['reclaim-expired-rotation'],
					actionKind: 'reclaim',
					note: 'Expired GFS rotation or aged DB snapshot superseded by verified GFS restore anchors.',
				}
			}
		}
		return {
			verdict: 'reclaim-redundant-backup',
			verdictLabel: VERDICT_LABELS['reclaim-redundant-backup'],
			actionKind: 'reclaim',
			note: 'Identical-hash backup archive or Takeout bundle superseded by the canonical restore anchor.',
		}
	}

	if (options.strategy === 'consolidate-cold-archive-vault') {
		if (options.protectVerifiedUnpacked && member.context.isVerifiedUnpackedMirror) {
			return {
				verdict: 'blocked-verified-unpacked',
				verdictLabel: VERDICT_LABELS['blocked-verified-unpacked'],
				actionKind: 'shield',
				note: 'Verified extracted-folder mirror shielded during Cold-Archive Vault consolidation.',
			}
		}
		return {
			verdict: 'consolidate-to-vault',
			verdictLabel: VERDICT_LABELS['consolidate-to-vault'],
			actionKind: 'consolidate',
			note: 'Consolidate or deduplicate redundant backup copy against the canonical Vault / Cold-Archive survivor with SHA-256 and stat device checks.',
		}
	}

	return {
		verdict: 'reclaim-redundant-backup',
		verdictLabel: VERDICT_LABELS['reclaim-redundant-backup'],
		actionKind: 'reclaim',
		note: 'Identical-hash backup archive superseded by canonical survivor.',
	}
}

/**
 * Normalize Backup & Takeout auditor options into deterministic bounds.
 *
 * @param {object} [rawOptions] Caller options.
 * @return {object} Normalized options.
 */
function normalizeOptions(rawOptions = {}) {
	const familyFilter = BACKUP_TAKEOUT_FAMILIES.includes(rawOptions.familyFilter)
		? rawOptions.familyFilter
		: 'all'
	const verdictFilter = BACKUP_TAKEOUT_VERDICT_FILTERS.includes(rawOptions.verdictFilter)
		? rawOptions.verdictFilter
		: 'all'
	const sortMode = BACKUP_TAKEOUT_SORT_MODES.includes(rawOptions.sortMode)
		? rawOptions.sortMode
		: 'reclaim_desc'
	const strategy = BACKUP_TAKEOUT_STRATEGIES.includes(rawOptions.strategy)
		? rawOptions.strategy
		: 'retain-gfs-anchor-prune-expired'
	const survivorRule = BACKUP_TAKEOUT_SURVIVOR_RULES.includes(rawOptions.survivorRule)
		? rawOptions.survivorRule
		: 'vault-and-anchor-first'

	const parsedKeep = Number.parseInt(rawOptions.keepRecentCount, 10)
	const keepRecentCount = Number.isFinite(parsedKeep) && parsedKeep >= 1
		? Math.min(parsedKeep, 365)
		: 3

	const parsedDays = Number.parseInt(rawOptions.staleBackupDays, 10)
	const staleBackupDays = Number.isFinite(parsedDays) && parsedDays >= 0
		? Math.min(parsedDays, 3650)
		: 30

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
		protectImmutableVault: rawOptions.protectImmutableVault !== false,
		protectGfsLatestAnchor: rawOptions.protectGfsLatestAnchor !== false,
		protectVerifiedUnpacked: rawOptions.protectVerifiedUnpacked !== false,
		keepRecentCount,
		staleBackupDays,
		minSizeMb,
		searchQuery: String(rawOptions.searchQuery || '').trim().toLowerCase(),
		referenceTimeSec,
		memberOverrides: rawOptions.memberOverrides && typeof rawOptions.memberOverrides === 'object'
			? rawOptions.memberOverrides
			: {},
	}
}

/**
 * Audit duplicate groups for Backup Archives, Cloud Takeout Bundles, Dated Snapshots & Extracted-Folder Twins.
 *
 * @param {Array<object>} duplicates Loaded duplicate groups.
 * @param {object} [rawOptions] Auditor configuration options.
 * @return {object} Deterministic audit analysis with summary, counts, and clusters.
 */
export function analyzeBackupTakeoutDuplicates(duplicates, rawOptions = {}) {
	const options = normalizeOptions(rawOptions)
	const safeDuplicates = Array.isArray(duplicates) ? duplicates : []
	const minSizeBytes = options.minSizeMb * 1024 * 1024

	const datasetHints = buildDatasetBackupHints(safeDuplicates)

	const familyCounts = {
		all: 0,
		'cloud-takeout-zips': 0,
		'dated-db-sys-snapshots': 0,
		'archive-unpacked-twins': 0,
		'incremental-rotation-pools': 0,
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
			const info = classifyBackupTakeoutArtifact(file.path, datasetHints)
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

		const clusterHasUnpackedMirror = matchedEntries.some(e => e.info.insideUnpackedMirror || e.info.hasUnpackedTwin)
			|| validFiles.some(f => f.isUnpackedMirror === true || f.unpackedFolderVerified === true)
		let clusterLatestTimestamp = null
		for (const file of validFiles) {
			const normalized = normalizePathForDiff(file.path) || String(file.path || '')
			const parsed = parseBackupTakeoutArtifactInfo(extractBasename(normalized), normalized)
			const ts = getFileMtimeSeconds(file) ?? parsed.embeddedTimestampSec
			if (ts !== null && (clusterLatestTimestamp === null || ts > clusterLatestTimestamp)) {
				clusterLatestTimestamp = ts
			}
		}

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

			const directInfo = classifyBackupTakeoutArtifact(file.path, datasetHints)
			const memberInfo = directInfo && directInfo.matched ? directInfo : primaryInfo
			const context = inspectBackupTakeoutMemberContext(
				file,
				memberInfo,
				options.referenceTimeSec,
				options,
				{
					...datasetHints,
					clusterHasUnpackedMirror,
					clusterLatestTimestamp,
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
		const immutableVaultCopiesCount = members.filter(m => m.context.isImmutableVault).length
		const gfsAnchorCopiesCount = members.filter(m => m.context.isGfsLatestAnchor || m.context.isWithinGfsRetention).length
		const unpackedTwinCopiesCount = members.filter(m => m.context.isVerifiedUnpackedMirror || m.context.hasVerifiedUnpackedFolder).length

		const hasImmutableVault = members.some(m => m.context.isImmutableVault)
		const hasGfsAnchor = members.some(m => m.context.isGfsLatestAnchor || m.context.isWithinGfsRetention)
		const hasUnpackedTwins = members.some(m => m.context.isVerifiedUnpackedMirror || m.context.hasVerifiedUnpackedFolder)

		let clusterRiskState = 'reclaimable'
		if (members.some(m => m.verdict === 'blocked-immutable-vault')) {
			clusterRiskState = 'immutable-vault'
		} else if (members.some(m => m.verdict === 'blocked-unverified-gfs-anchor' || m.verdict === 'blocked-unverified-unpacked')) {
			clusterRiskState = 'unverified-anchor'
		} else if (hasGfsAnchor) {
			clusterRiskState = 'gfs-anchored'
		} else if (hasUnpackedTwins) {
			clusterRiskState = 'unpacked-paired'
		} else if (reclaimableCopiesCount === 0) {
			clusterRiskState = 'shielded'
		}

		const primaryGroupId = group.id ?? null
		const groupKey = String(group.hash || primaryGroupId || `backup-takeout-${groupIdx}`)
		const displayName = survivor ? survivor.basename : members[0].basename
		const governanceSignals = Array.from(new Set(members.map(m => m.tier)))
		const allArtifactTags = Array.from(new Set(members.flatMap(m => m.context.artifactTags)))

		rawClusters.push({
			groupKey,
			primaryGroupId,
			hash: group.hash || '',
			displayName,
			basename: displayName,
			lineageStem: survivor ? survivor.context.lineageStem : primaryInfo.lineageStem,
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
			immutableVaultCopiesCount,
			gfsAnchorCopiesCount,
			unpackedTwinCopiesCount,
			hasImmutableVault,
			hasGfsAnchor,
			hasUnpackedTwins,
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
			|| cluster.lineageStem.toLowerCase().includes(q)
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
		if (options.verdictFilter === 'immutable-vault' && !cluster.hasImmutableVault) {
			return false
		}
		if (options.verdictFilter === 'gfs-anchor' && !cluster.hasGfsAnchor) {
			return false
		}
		if (options.verdictFilter === 'unpacked-twins' && !cluster.hasUnpackedTwins) {
			return false
		}
		if (options.verdictFilter === 'shielded' && cluster.shieldedCopiesCount === 0 && cluster.clusterRiskState !== 'shielded') {
			return false
		}
		return true
	})

	clusters.sort((a, b) => {
		if (options.sortMode === 'risk_desc') {
			const riskA = a.immutableVaultCopiesCount * 5 + a.gfsAnchorCopiesCount * 4 + a.unpackedTwinCopiesCount * 2 + a.shieldedCopiesCount
			const riskB = b.immutableVaultCopiesCount * 5 + b.gfsAnchorCopiesCount * 4 + b.unpackedTwinCopiesCount * 2 + b.shieldedCopiesCount
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
	const totalImmutableVaultClusters = clusters.filter(c => c.hasImmutableVault).length
	const totalGfsAnchorClusters = clusters.filter(c => c.hasGfsAnchor).length
	const totalUnpackedTwinClusters = clusters.filter(c => c.hasUnpackedTwins).length
	const efficiencyPct = totalRawDuplicateBytes > 0
		? Math.round((totalReclaimableBytes / totalRawDuplicateBytes) * 100)
		: 0

	return {
		schema: BACKUP_TAKEOUT_SCHEMA,
		options: {
			familyFilter: options.familyFilter,
			verdictFilter: options.verdictFilter,
			sortMode: options.sortMode,
			strategy: options.strategy,
			survivorRule: options.survivorRule,
			protectImmutableVault: options.protectImmutableVault,
			protectGfsLatestAnchor: options.protectGfsLatestAnchor,
			protectVerifiedUnpacked: options.protectVerifiedUnpacked,
			keepRecentCount: options.keepRecentCount,
			staleBackupDays: options.staleBackupDays,
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
			totalImmutableVaultClusters,
			totalGfsAnchorClusters,
			totalUnpackedTwinClusters,
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
 * Build a POSIX DRY_RUN=1 remediation script for Backup Archives, Cloud Takeout Bundles, Dated Snapshots & Twins.
 *
 * @param {object} analysis Output from analyzeBackupTakeoutDuplicates.
 * @param {object} [options] Script options.
 * @param {string} [options.dataRoot='/var/www/nextcloud/data'] Nextcloud data root directory.
 * @return {string} POSIX bash script with single-quoted paths, sha256sum -- verification, stat cross-device guard, and DRY_RUN=1 default.
 */
export function buildBackupTakeoutScript(analysis, options = {}) {
	const dataRoot = String(options.dataRoot || '/var/www/nextcloud/data').replace(/\/+$/, '') || '/var/www/nextcloud/data'
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const strategy = (analysis && analysis.options && analysis.options.strategy) || 'retain-gfs-anchor-prune-expired'

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
		'# Backup Archive, Cloud Takeout Bundle, Dated Snapshot & Extracted-Folder Twin Auditor',
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
		lines.push('echo "No reclaimable or consolidatable backup, takeout, or GFS snapshot targets under current guards."')
		return lines.join('\n')
	}

	lines.push('prune_verified_backup_copy() {')
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
	lines.push('consolidate_vault_backup_copy() {')
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
			lines.push(`consolidate_vault_backup_copy ${escapePosixSingleQuote(op.survivorPath)} ${escapePosixSingleQuote(op.targetPath)}`)
		} else {
			lines.push(`prune_verified_backup_copy ${escapePosixSingleQuote(op.survivorPath)} ${escapePosixSingleQuote(op.targetPath)}`)
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
 * Build a Nextcloud Desktop .sync-exclude.lst snippet for partial cloud takeout zips and staging database dumps.
 *
 * @param {object} analysis Output from analyzeBackupTakeoutDuplicates.
 * @return {string} Newline-delimited Nextcloud sync-exclude patterns.
 */
export function buildBackupTakeoutSyncExcludeSnippet(analysis) {
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const lines = [
		'# Nextcloud Desktop .sync-exclude.lst rules for cloud takeout archives and staging DB dumps',
		'*.zip.part',
		'*.crdownload',
		'Takeout-*.zip',
		'*.sql.gz.tmp',
		'*.tar.gz.tmp',
		'*.wpress.tmp',
	]
	const seen = new Set(lines)
	for (const cluster of clusters) {
		if (cluster && cluster.extension === 'tar.zst' && !seen.has('*.tar.zst.tmp')) {
			lines.push('*.tar.zst.tmp')
			seen.add('*.tar.zst.tmp')
		}
	}
	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe CSV audit report for Backup Archives, Cloud Takeout Bundles & GFS Snapshots.
 *
 * @param {object} analysis Output from analyzeBackupTakeoutDuplicates.
 * @return {string} RFC-4180 CSV string with CWE-1236 formula escaping.
 */
export function buildBackupTakeoutCsvReport(analysis) {
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const headers = [
		'Cluster Key',
		'Archive or Snapshot Name',
		'Lineage Stem',
		'Artifact Tags',
		'Extension',
		'Family',
		'Governance Tier',
		'Immutable Vault',
		'GFS Latest Anchor',
		'Verified Unpacked Mirror',
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
				member.context.lineageStem,
				member.context.artifactTag,
				member.extension,
				cluster.familyLabel,
				member.tierLabel,
				member.context.isImmutableVault ? 'yes' : 'no',
				member.context.isGfsLatestAnchor ? 'yes' : 'no',
				member.context.isVerifiedUnpackedMirror ? 'yes' : 'no',
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
 * Build a structured JSON audit manifest for Backup Archives, Cloud Takeout Bundles & GFS Snapshots.
 *
 * @param {object} analysis Output from analyzeBackupTakeoutDuplicates.
 * @param {string} [generatedAt] Optional ISO timestamp override.
 * @return {string} Pretty-printed JSON manifest.
 */
export function buildBackupTakeoutJsonReport(analysis, generatedAt = new Date().toISOString()) {
	const safeAnalysis = analysis && typeof analysis === 'object' ? analysis : { summary: {}, clusters: [], options: {} }
	return JSON.stringify({
		schema: BACKUP_TAKEOUT_SCHEMA,
		generatedAt,
		options: safeAnalysis.options || {},
		summary: safeAnalysis.summary || {},
		clusters: (safeAnalysis.clusters || []).map(cluster => ({
			groupKey: cluster.groupKey,
			primaryGroupId: cluster.primaryGroupId,
			hash: cluster.hash,
			basename: cluster.basename,
			lineageStem: cluster.lineageStem,
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
				ageDays: member.context.ageDays,
				tier: member.tier,
				lineageStem: member.context.lineageStem,
				artifactTags: member.context.artifactTags,
				gfsPoolKey: member.context.gfsPoolKey,
				gfsGenerationRank: member.context.gfsGenerationRank,
				isImmutableVault: member.context.isImmutableVault,
				isGfsLatestAnchor: member.context.isGfsLatestAnchor,
				isWithinGfsRetention: member.context.isWithinGfsRetention,
				hasVerifiedGfsAnchor: member.context.hasVerifiedGfsAnchor,
				isVerifiedUnpackedMirror: member.context.isVerifiedUnpackedMirror,
				hasVerifiedUnpackedFolder: member.context.hasVerifiedUnpackedFolder,
				authorityScore: member.context.authorityScore,
			})),
		})),
	}, null, 2)
}
