/**
 * Pure DAW Session, Lossless Stem Master, Mixdown Revision & Peak Cache Auditor.
 * Classifies and audits duplicate clusters across 4 audio/DAW domain families:
 * - DAW Session & Project Roots (.als, .flp, .logicx, .ptx, .cpr, .rpp, .sesx, Audio Files/, Samples/)
 * - Lossless Studio Masters & Stems (.wav, .aiff, .aif, .flac, .alac, .bwf, .caf, .rf64 with _MASTER, _24bit, _STEM markers)
 * - Lossy Review Exports & Mixdowns (_rough, _mix_v2, _premaster, .mp3, .m4a, .aac, .ogg, .opus, .wma sharing a lossless master lineageStem)
 * - DAW Freeze & Peak Caches (.asd, .pkf, .reapeaks, .ovw, Freeze/, Bounce Cache/)
 *
 * Assigns 5 governance tiers:
 * - released-master-vault (Released Master / ISRC Vault; strictly protected by default)
 * - active-daw-session (Active DAW session or project audio root; strictly protected by default)
 * - review-mixdown-pool (Mixdown revision or working master outside vault)
 * - lossy-transcode-mirror (Lossy review/transcode mirror; deletion blocked if no verified lossless master is conserved)
 * - peak-freeze-cache (Reconstructible DAW peak, warp, and freeze/bounce cache)
 *
 * Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const DAW_AUDIO_STEM_SCHEMA = 'duplicatefinder.daw-audio-stem-auditor.v1'

export const DAW_AUDIO_FAMILIES = Object.freeze([
	'all',
	'daw-session-project-roots',
	'lossless-studio-masters',
	'lossy-review-exports',
	'daw-freeze-peak-caches',
])

export const DAW_AUDIO_FAMILY_META = Object.freeze({
	'daw-session-project-roots': {
		id: 'daw-session-project-roots',
		label: 'DAW Session & Project Roots',
		shortLabel: 'DAW Sessions (.als/.flp/.logicx/.ptx/.cpr/.rpp/.sesx)',
	},
	'lossless-studio-masters': {
		id: 'lossless-studio-masters',
		label: 'Lossless Studio Masters & Stems',
		shortLabel: 'Lossless Masters (.wav/.aiff/.flac/.bwf/.caf/.rf64)',
	},
	'lossy-review-exports': {
		id: 'lossy-review-exports',
		label: 'Lossy Review Exports & Mixdowns',
		shortLabel: 'Review Exports (.mp3/.m4a/.aac/.ogg/.opus/_rough)',
	},
	'daw-freeze-peak-caches': {
		id: 'daw-freeze-peak-caches',
		label: 'DAW Freeze & Peak Caches',
		shortLabel: 'Peak & Freeze Caches (.asd/.pkf/.reapeaks/.ovw)',
	},
})

export const DAW_AUDIO_STRATEGIES = Object.freeze([
	'consolidate-studio-masters',
	'prune-stale-peak-freeze-caches',
	'prune-lossy-twins-when-lossless-verified',
])

export const DAW_AUDIO_SURVIVOR_RULES = Object.freeze([
	'master-vault-and-daw-first',
	'lossless-master-first',
	'newest-session-first',
	'shortest-path',
])

export const DAW_AUDIO_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'master-vault',
	'active-daw',
	'lossy-twins',
	'peak-cache',
	'shielded',
])

export const DAW_AUDIO_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const DAW_AUDIO_PRESETS = Object.freeze([
	{
		id: 'all-daw-audio-audit',
		name: 'All DAW, Master & Stem Audit',
		description: 'Audit DAW session roots, lossless studio masters, lossy review mixdowns, and peak/freeze caches while shielding Master/ISRC Vaults and active sessions.',
		familyFilter: 'all',
		strategy: 'consolidate-studio-masters',
		survivorRule: 'master-vault-and-daw-first',
		protectReleasedMasterVault: true,
		protectActiveDawSession: true,
		protectVerifiedLosslessMaster: true,
		keepRecentRevisions: 2,
		staleCacheDays: 30,
		minSizeMb: 0,
	},
	{
		id: 'prune-peak-freeze-caches',
		name: 'Prune Stale Peak & Freeze Caches',
		description: 'Safely reclaim aged .asd, .pkf, .reapeaks, .ovw, Freeze/, and Bounce Cache/ files without touching DAW sessions or studio masters.',
		familyFilter: 'daw-freeze-peak-caches',
		strategy: 'prune-stale-peak-freeze-caches',
		survivorRule: 'master-vault-and-daw-first',
		protectReleasedMasterVault: true,
		protectActiveDawSession: true,
		protectVerifiedLosslessMaster: true,
		keepRecentRevisions: 2,
		staleCacheDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'prune-lossy-when-lossless-verified',
		name: 'Prune Lossy Twins When Lossless Verified',
		description: 'Reclaim redundant lossy review exports (.mp3/.m4a/.aac/.ogg/.opus/_rough) only when a verified lossless master sharing the lineage stem is conserved.',
		familyFilter: 'lossy-review-exports',
		strategy: 'prune-lossy-twins-when-lossless-verified',
		survivorRule: 'lossless-master-first',
		protectReleasedMasterVault: true,
		protectActiveDawSession: true,
		protectVerifiedLosslessMaster: true,
		keepRecentRevisions: 2,
		staleCacheDays: 30,
		minSizeMb: 0,
	},
	{
		id: 'consolidate-master-vault',
		name: 'Consolidate to Studio Master Vault',
		description: 'Keep canonical copies inside Master-Vault / ISRC-Archive / Released-Masters and consolidate stray copies from Downloads or staging trees.',
		familyFilter: 'all',
		strategy: 'consolidate-studio-masters',
		survivorRule: 'master-vault-and-daw-first',
		protectReleasedMasterVault: true,
		protectActiveDawSession: true,
		protectVerifiedLosslessMaster: true,
		keepRecentRevisions: 2,
		staleCacheDays: 30,
		minSizeMb: 0,
	},
	{
		id: 'active-daw-session-guard',
		name: 'Active DAW Session & Project Guard',
		description: 'Audit .als, .flp, .logicx, .ptx, .cpr, .rpp, .sesx projects and Audio Files/ or Samples/ trees while shielding active session roots.',
		familyFilter: 'daw-session-project-roots',
		strategy: 'consolidate-studio-masters',
		survivorRule: 'newest-session-first',
		protectReleasedMasterVault: true,
		protectActiveDawSession: true,
		protectVerifiedLosslessMaster: true,
		keepRecentRevisions: 2,
		staleCacheDays: 30,
		minSizeMb: 0,
	},
])

const DAW_SESSION_EXT_SET = new Set([
	'als', 'flp', 'logicx', 'ptx', 'cpr', 'rpp', 'sesx',
])

const LOSSLESS_EXT_SET = new Set([
	'wav', 'aiff', 'aif', 'flac', 'alac', 'bwf', 'caf', 'rf64',
])

const LOSSY_EXT_SET = new Set([
	'mp3', 'm4a', 'aac', 'ogg', 'opus', 'wma',
])

const PEAK_CACHE_EXT_SET = new Set([
	'asd', 'pkf', 'reapeaks', 'ovw',
])

const DAW_SESSION_PATH_RE = /(\/(?:audio files|samples|recorded|project files|ableton|logic|pro tools|cubase|reaper|fl studio)(?:\/|$)|\.logicx\/)/i
const PEAK_FREEZE_PATH_RE = /(\/(?:freeze|bounce cache|peak files?|peaks|wavecache|reapeaks|ableton project info)(?:\/|$))/i
const DAW_AUTO_BACKUP_PATH_RE = /(\/(?:backup|backups|autosave)(?:\/|$))/i

const RELEASED_MASTER_VAULT_PATH_RE = /(\/(?:master[-_ ]?vault|released[-_ ]?masters?|isrc[-_ ]?archive|studio[-_ ]?masters?|final[-_ ]?masters?|immutable|vault|cold[-_ ]?archive)(?:\/|$)|\/__groupfolders\/\d+\/(?:masters?|master[-_ ]?vault|isrc|studio[-_ ]?masters?|released[-_ ]?masters?))/i
const LOSSLESS_MASTERS_PATH_RE = /(\/(?:masters?|stems?|master[-_ ]?vault|released[-_ ]?masters?|studio[-_ ]?masters?|isrc[-_ ]?archive)(?:\/|$))/i
const ACTIVE_DAW_SESSION_PATH_RE = /(\/(?:active[-_ ]?sessions?|studio[-_ ]?sessions?|current[-_ ]?projects?|sessions?|projects?|ableton|logic|pro tools|cubase|reaper|fl studio|audio files|samples)(?:\/|$)|\.logicx\/)/i
const REVIEW_EXPORT_PATH_RE = /(\/(?:reviews?|mixdowns?|mix[-_ ]?revisions?|bounces?|rough[-_ ]?mixes?|client[-_ ]?reviews?|premasters?|exports?)(?:\/|$))/i
const STAGING_BLOAT_PATH_RE = /(\/downloads\/|\/telechargements\/|\/tmp\/|\/temp\/|\/scratch\/|\/incoming\/|\/staging\/|\/wetransfer\/)/i

const LOSSLESS_MASTER_MARKER_RE = /(?:^|[_\-.\s])(master|24bit|24-bit|32bit|32-bit|32f|96k|48k|stem|stems|isrc|final_master|album_master|ddp)(?=$|[_\-.\s])/i
const ISRC_MARKER_RE = /(?:^|[_\-.\s])(isrc(?:[-_][a-z0-9]+)?|[a-z]{2}[a-z0-9]{3}\d{7})(?=$|[_\-.\s])/i
const REVIEW_MIXDOWN_MARKER_RE = /(?:^|[_\-.\s])(rough|mix_v\d+|mix[-_ ]?v\d+|v\d+[_-]?mix|premaster|demo|wip|reference|ref|client[-_ ]?review)(?=$|[_\-.\s])/i

const REVISION_TAG_RE = /(?:^|[_\-.\s])(v\d+(?:\.\d+)?|rev\d+|r\d+|mix_v\d+|mix[-_ ]?v\d+|rough|premaster|master|24bit|24-bit|32bit|32f|96k|48k|stem|stems|isrc|[a-z]{2}[a-z0-9]{3}\d{7}|final|demo|wip|ref|freeze|bounce)(?=$|[_\-.\s])/gi
const COPY_SUFFIX_RE = /\s-\s?copy(?:\s*\(\d+\))?|\s*\(\d+\)|_copy\b|\[\d{4}-\d{2}-\d{2}[^\]]*\]/gi

const TIER_LABELS = Object.freeze({
	'released-master-vault': 'Released Studio Master / ISRC Vault',
	'active-daw-session': 'Active DAW Session / Project Root',
	'review-mixdown-pool': 'Review Mixdown / Revision Pool',
	'lossy-transcode-mirror': 'Lossy Transcode Mirror',
	'peak-freeze-cache': 'DAW Peak & Freeze Cache',
})

const TIER_AUTHORITY = Object.freeze({
	'released-master-vault': 99,
	'active-daw-session': 94,
	'review-mixdown-pool': 72,
	'lossy-transcode-mirror': 30,
	'peak-freeze-cache': 16,
})

const VERDICT_LABELS = Object.freeze({
	'keep-canonical-survivor': 'Keep Canonical Studio Anchor',
	'consolidate-to-master-vault': 'Consolidate to Master Vault',
	'reclaim-stale-peak-cache': 'Prune Stale Peak / Freeze Cache',
	'reclaim-lossy-twin': 'Prune Verified Lossy Mirror',
	'blocked-released-master-vault': 'Blocked: Released Master / ISRC Guard',
	'blocked-active-daw-session': 'Blocked: Active DAW Session Guard',
	'blocked-lossless-master-guard': 'Protected: Verified Lossless Master',
	'blocked-unverified-lossless-master': 'Blocked: No Verified Lossless Master Conserved',
	'blocked-not-peak-cache': 'Shielded: Non-Cache Session / Audio File',
	'blocked-fresh-peak-cache': 'Shielded: Recent Peak / Freeze Cache',
	'blocked-not-lossy-transcode': 'Shielded: Non-Lossy Studio Artifact',
	'blocked-manual-shield': 'Blocked: Operator Shield',
	excluded: 'Excluded by Operator',
})

const FAMILY_PRIORITY = Object.freeze({
	'lossless-studio-masters': 4,
	'daw-session-project-roots': 3,
	'lossy-review-exports': 2,
	'daw-freeze-peak-caches': 1,
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
 * Extract lowercase extension without leading dot.
 *
 * @param {string} lowerBase Lowercase basename.
 * @return {string} Extension string or empty string.
 */
function extractExtension(lowerBase) {
	const lastDot = lowerBase.lastIndexOf('.')
	if (lastDot <= 0 || lastDot >= lowerBase.length - 1) {
		return ''
	}
	return lowerBase.slice(lastDot + 1)
}

/**
 * Normalize a DAW/audio stem candidate into a canonical lineageStem for cross-format matching.
 *
 * @param {string} rawStem Raw stem without primary extension.
 * @param {boolean} [isPeakCache=false] Whether this artifact is a peak cache wrapping an inner audio extension.
 * @return {string} Clean canonical lineage stem.
 */
function normalizeAudioLineageStem(rawStem, isPeakCache = false) {
	let stem = String(rawStem || '')
		.replace(COPY_SUFFIX_RE, '')
		.trim()

	if (isPeakCache) {
		const innerDot = stem.lastIndexOf('.')
		if (innerDot > 0) {
			const innerExt = stem.slice(innerDot + 1).toLowerCase()
			if (LOSSLESS_EXT_SET.has(innerExt) || LOSSY_EXT_SET.has(innerExt)) {
				stem = stem.slice(0, innerDot)
			}
		}
	}

	let prev
	do {
		prev = stem
		stem = stem.replace(REVISION_TAG_RE, '')
	} while (stem !== prev)

	stem = stem
		.replace(/[-_.\s]{2,}/g, '_')
		.replace(/^[\s_.-]+|[\s_.-]+$/g, '')

	return stem || String(rawStem || '').replace(COPY_SUFFIX_RE, '').trim()
}

/**
 * Parse DAW session, studio master, review mixdown, and peak cache metadata from basename and path.
 *
 * @param {string} basename File basename.
 * @param {string} [normalizedPath=''] Normalized file path.
 * @return {object} Parsed lineageStem, tags, format flags, and governance cues.
 */
export function parseDawAudioArtifactInfo(basename, normalizedPath = '') {
	const rawBase = String(basename || '')
	const lowerBase = rawBase.toLowerCase()
	const lowerPath = String(normalizedPath || '').toLowerCase()
	const ext = extractExtension(lowerBase)

	let rawStem = rawBase
	if (ext && lowerBase.endsWith(`.${ext}`)) {
		rawStem = rawBase.slice(0, rawBase.length - ext.length - 1)
	}
	const cleanRawStem = rawStem.replace(COPY_SUFFIX_RE, '').trim() || rawStem

	const isDawSessionExt = DAW_SESSION_EXT_SET.has(ext)
	const isLosslessExt = LOSSLESS_EXT_SET.has(ext)
	const isLossyExt = LOSSY_EXT_SET.has(ext)
	const isPeakCacheExt = PEAK_CACHE_EXT_SET.has(ext)

	const isPeakFreezePath = PEAK_FREEZE_PATH_RE.test(lowerPath)
	const isDawSessionPath = DAW_SESSION_PATH_RE.test(lowerPath)
	const isDawAutoBackupPath = DAW_AUTO_BACKUP_PATH_RE.test(lowerPath)
	const isReleasedMasterVaultPath = RELEASED_MASTER_VAULT_PATH_RE.test(lowerPath)
	const isLosslessMastersPath = LOSSLESS_MASTERS_PATH_RE.test(lowerPath)
	const isActiveDawSessionPath = ACTIVE_DAW_SESSION_PATH_RE.test(lowerPath)
	const isReviewExportPath = REVIEW_EXPORT_PATH_RE.test(lowerPath)
	const isStagingBloatPath = STAGING_BLOAT_PATH_RE.test(lowerPath)

	const hasLosslessMasterMarker = LOSSLESS_MASTER_MARKER_RE.test(cleanRawStem)
	const hasIsrcMarker = ISRC_MARKER_RE.test(cleanRawStem) || ISRC_MARKER_RE.test(lowerPath)
	const hasReviewMarker = REVIEW_MIXDOWN_MARKER_RE.test(cleanRawStem)

	const isPeakFreezeCache = isPeakCacheExt || (isPeakFreezePath && !isDawSessionExt && !isReleasedMasterVaultPath)
	const lineageStem = normalizeAudioLineageStem(cleanRawStem, isPeakCacheExt) || cleanRawStem || rawBase

	const isLosslessMasterCandidate = isLosslessExt && !isPeakFreezeCache && (
		hasLosslessMasterMarker
		|| hasIsrcMarker
		|| isLosslessMastersPath
		|| isReleasedMasterVaultPath
		|| ext === 'bwf'
		|| ext === 'rf64'
	)

	const isDawSessionCandidate = isDawSessionExt
		|| (!isPeakFreezeCache && !isLosslessMasterCandidate && !isLossyExt && isDawSessionPath)

	const isReviewMixdownCandidate = (isLossyExt && (hasReviewMarker || isReviewExportPath || hasLosslessMasterMarker))
		|| (isLosslessExt && !isLosslessMasterCandidate && !isDawSessionCandidate && !isPeakFreezeCache && (hasReviewMarker || isReviewExportPath))

	const artifactTags = []
	const pushTag = tag => {
		const norm = String(tag || '').trim()
		if (norm && !artifactTags.includes(norm)) {
			artifactTags.push(norm)
		}
	}

	if (isDawSessionExt) {
		pushTag(`daw:${ext}`)
	}
	if (isDawSessionPath) {
		pushTag('daw-media')
	}
	if (isLosslessExt) {
		pushTag(`lossless:${ext}`)
	}
	if (hasLosslessMasterMarker) {
		if (/(?:^|[_\-.\s])stem/i.test(cleanRawStem)) {
			pushTag('stem')
		}
		if (/(?:^|[_\-.\s])24[-_]?bit/i.test(cleanRawStem)) {
			pushTag('24bit')
		}
		if (/(?:^|[_\-.\s])master/i.test(cleanRawStem)) {
			pushTag('master')
		}
	}
	if (hasIsrcMarker || isReleasedMasterVaultPath) {
		pushTag('master-vault')
	}
	if (isLossyExt) {
		pushTag(`lossy:${ext}`)
	}
	if (hasReviewMarker) {
		pushTag('review-mixdown')
	}
	if (isPeakFreezeCache) {
		pushTag(isPeakCacheExt ? `peak:${ext}` : 'freeze-cache')
	}

	return {
		rawStem: cleanRawStem,
		lineageStem,
		extension: ext,
		artifactTags,
		artifactTag: artifactTags.length > 0 ? artifactTags.join(', ') : 'none',
		isDawSessionExt,
		isLosslessExt,
		isLossyExt,
		isPeakCacheExt,
		isPeakFreezePath,
		isDawSessionPath,
		isDawAutoBackupPath,
		isReleasedMasterVaultPath,
		isLosslessMastersPath,
		isActiveDawSessionPath,
		isReviewExportPath,
		isStagingBloatPath,
		hasLosslessMasterMarker,
		hasIsrcMarker,
		hasReviewMarker,
		isPeakFreezeCache,
		isLosslessMasterCandidate,
		isDawSessionCandidate,
		isReviewMixdownCandidate,
	}
}

/**
 * Build dataset-wide lineage hints for lossless masters and active DAW sessions.
 * Respects operator exclude overrides so excluded masters are not counted as conserved.
 *
 * @param {Array<object>} duplicates Loaded duplicate groups.
 * @param {object} [memberOverrides={}] Operator member overrides keyed by selectionKey.
 * @return {object} Dataset lineage hints.
 */
function buildDatasetDawHints(duplicates, memberOverrides = {}) {
	const losslessMasterStems = new Set()
	const losslessMasterPathsByStem = new Map()

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
			if (memberOverrides[selectionKey] === 'exclude') {
				continue
			}

			const normalized = normalizePathForDiff(file.path) || String(file.path)
			const info = parseDawAudioArtifactInfo(extractBasename(normalized), normalized)
			if (info.isLosslessMasterCandidate || (info.isLosslessExt && !info.isPeakFreezeCache && (file.losslessMasterVerified === true || info.isReleasedMasterVaultPath))) {
				const stemLower = info.lineageStem.toLowerCase()
				if (stemLower) {
					losslessMasterStems.add(stemLower)
					if (!losslessMasterPathsByStem.has(stemLower)) {
						losslessMasterPathsByStem.set(stemLower, [])
					}
					losslessMasterPathsByStem.get(stemLower).push(normalized)
				}
			}
		}
	}

	return {
		losslessMasterStems,
		losslessMasterPathsByStem,
	}
}

/**
 * Check whether a verified lossless master sharing the same lineageStem exists and is conserved.
 *
 * @param {object} info Parsed artifact metadata.
 * @param {object|null} hints Dataset or cluster hints.
 * @return {boolean} True when a verified lossless master exists for this lineageStem.
 */
function hasMatchingLosslessMaster(info, hints) {
	if (!hints || !hints.losslessMasterStems) {
		return false
	}
	const stemLower = String(info.lineageStem || '').toLowerCase()
	return Boolean(stemLower && hints.losslessMasterStems.has(stemLower))
}

/**
 * Classify a file path into one of the 4 DAW Session, Lossless Master, Lossy Review, and Peak Cache families.
 *
 * @param {string} rawPath File path.
 * @param {object} [hints=null] Optional dataset hints (losslessMasterStems).
 * @return {object|null} Classification metadata or null for unrelated files.
 */
export function classifyDawAudioArtifact(rawPath, hints = null) {
	const normalized = normalizePathForDiff(rawPath) || String(rawPath || '')
	const basename = extractBasename(normalized)
	const lowerBase = basename.toLowerCase()

	if (!lowerBase) {
		return null
	}

	const info = parseDawAudioArtifactInfo(basename, normalized)

	if (info.isPeakFreezeCache) {
		return {
			matched: true,
			family: 'daw-freeze-peak-caches',
			familyLabel: DAW_AUDIO_FAMILY_META['daw-freeze-peak-caches'].label,
			sharesLosslessLineage: hasMatchingLosslessMaster(info, hints),
			...info,
		}
	}

	if (info.isLosslessMasterCandidate) {
		return {
			matched: true,
			family: 'lossless-studio-masters',
			familyLabel: DAW_AUDIO_FAMILY_META['lossless-studio-masters'].label,
			sharesLosslessLineage: true,
			...info,
		}
	}

	const sharesLosslessLineage = hasMatchingLosslessMaster(info, hints)
	if (info.isLossyExt && (info.hasReviewMarker || info.isReviewExportPath || sharesLosslessLineage)) {
		return {
			matched: true,
			family: 'lossy-review-exports',
			familyLabel: DAW_AUDIO_FAMILY_META['lossy-review-exports'].label,
			sharesLosslessLineage,
			...info,
		}
	}

	if (info.isDawSessionCandidate) {
		return {
			matched: true,
			family: 'daw-session-project-roots',
			familyLabel: DAW_AUDIO_FAMILY_META['daw-session-project-roots'].label,
			sharesLosslessLineage,
			...info,
		}
	}

	if (info.isReviewMixdownCandidate) {
		return {
			matched: true,
			family: 'lossy-review-exports',
			familyLabel: DAW_AUDIO_FAMILY_META['lossy-review-exports'].label,
			sharesLosslessLineage,
			...info,
		}
	}

	return null
}

/**
 * Inspect governance tier, verified lossless master presence, and authority context for a cluster member.
 *
 * @param {object} file Duplicate file entry.
 * @param {object} classification Classification metadata.
 * @param {number} referenceTimeSec Reference epoch seconds.
 * @param {object} options Normalized options (keepRecentRevisions, staleCacheDays).
 * @param {object} [clusterHints={}] Dataset and cluster verification hints.
 * @return {object} Member governance and verification context.
 */
export function inspectDawAudioMemberContext(file, classification, referenceTimeSec, options, clusterHints = {}) {
	const normalizedPath = normalizePathForDiff(file && file.path) || String((file && file.path) || '')
	const basename = extractBasename(normalizedPath)
	const parsed = parseDawAudioArtifactInfo(basename, normalizedPath)
	const mtimeSec = getFileMtimeSeconds(file)
	const ageDays = mtimeSec !== null && Number.isFinite(referenceTimeSec)
		? Math.max(0, Math.floor((referenceTimeSec - mtimeSec) / 86400))
		: null

	const isIsrcMaster = Boolean((file && file.isrcVerified === true) || parsed.hasIsrcMarker)
	const isReleasedMasterVault = Boolean(
		!parsed.isPeakFreezeCache
		&& !parsed.isLossyExt
		&& (parsed.isReleasedMasterVaultPath || (isIsrcMaster && parsed.isLosslessExt))
	)
	const isActiveDawSession = Boolean(
		!parsed.isPeakFreezeCache
		&& !parsed.isStagingBloatPath
		&& !parsed.isDawAutoBackupPath
		&& (
			(file && file.isActiveDawSession === true)
			|| (parsed.isDawSessionExt && !parsed.isReviewExportPath)
			|| (parsed.isDawSessionPath && parsed.isActiveDawSessionPath)
		)
	)
	const isLosslessMaster = Boolean(
		!parsed.isPeakFreezeCache
		&& (
			parsed.isLosslessMasterCandidate
			|| (parsed.isLosslessExt && file && file.losslessMasterVerified === true)
			|| (parsed.isLosslessExt && isReleasedMasterVault)
		)
	)
	const isLossyTranscode = Boolean(
		parsed.isLossyExt
		|| (!isLosslessMaster && !isActiveDawSession && !parsed.isPeakFreezeCache && classification.family === 'lossy-review-exports')
	)
	const isPeakFreezeCache = Boolean(
		parsed.isPeakFreezeCache || classification.family === 'daw-freeze-peak-caches'
	)

	const hasVerifiedLosslessMaster = Boolean(
		isLosslessMaster
		|| (file && file.losslessMasterVerified === true)
		|| clusterHints.clusterHasConservedLosslessMaster
		|| hasMatchingLosslessMaster(parsed, clusterHints)
	)

	const isStalePeakCache = Boolean(
		isPeakFreezeCache
		&& (ageDays === null || ageDays >= options.staleCacheDays)
	)

	let tier = 'review-mixdown-pool'
	if (isReleasedMasterVault) {
		tier = 'released-master-vault'
	} else if (isActiveDawSession) {
		tier = 'active-daw-session'
	} else if (isPeakFreezeCache) {
		tier = 'peak-freeze-cache'
	} else if (isLossyTranscode) {
		tier = 'lossy-transcode-mirror'
	} else if (isLosslessMaster) {
		tier = 'review-mixdown-pool'
	}

	let authorityScore = TIER_AUTHORITY[tier] || 72
	if (isIsrcMaster) {
		authorityScore += 4
	}
	if (isLosslessMaster && !isReleasedMasterVault) {
		authorityScore += 12
	}
	if (parsed.isDawSessionExt && isActiveDawSession) {
		authorityScore += 3
	}
	if (parsed.isStagingBloatPath || parsed.isDawAutoBackupPath) {
		authorityScore -= 14
	}
	if (isStalePeakCache) {
		authorityScore -= 6
	}

	return {
		tier,
		tierLabel: TIER_LABELS[tier] || TIER_LABELS['review-mixdown-pool'],
		authorityScore,
		extension: parsed.extension || classification.extension || '',
		rawStem: parsed.rawStem,
		lineageStem: parsed.lineageStem,
		artifactTags: parsed.artifactTags,
		artifactTag: parsed.artifactTag,
		isReleasedMasterVault,
		isIsrcMaster,
		isActiveDawSession,
		isLosslessMaster,
		isLossyTranscode,
		isPeakFreezeCache,
		hasVerifiedLosslessMaster,
		isStalePeakCache,
		isStagingBloatPath: parsed.isStagingBloatPath,
		isDawAutoBackupPath: parsed.isDawAutoBackupPath,
		mtimeSec,
		ageDays,
	}
}

/**
 * Select the canonical surviving copy inside a DAW/audio duplicate cluster.
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
		if (survivorRule === 'lossless-master-first') {
			if (a.context.isLosslessMaster !== b.context.isLosslessMaster) {
				return a.context.isLosslessMaster ? -1 : 1
			}
			if (a.context.authorityScore !== b.context.authorityScore) {
				return b.context.authorityScore - a.context.authorityScore
			}
		} else if (survivorRule === 'newest-session-first') {
			const tsA = a.context.mtimeSec ?? -1
			const tsB = b.context.mtimeSec ?? -1
			if (tsA !== tsB) {
				return tsB - tsA
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
 * Determine the deterministic audit verdict for a DAW/audio cluster member.
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
			note: 'Excluded from Audio & DAW audit actions by manual operator override.',
		}
	}

	if (survivor && member.selectionKey === survivor.selectionKey) {
		return {
			verdict: 'keep-canonical-survivor',
			verdictLabel: VERDICT_LABELS['keep-canonical-survivor'],
			actionKind: 'keep',
			note: `Canonical ${member.context.tierLabel} copy retained as the authoritative studio anchor.`,
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

	if (options.protectReleasedMasterVault && (member.context.isReleasedMasterVault || member.context.isIsrcMaster)) {
		return {
			verdict: 'blocked-released-master-vault',
			verdictLabel: VERDICT_LABELS['blocked-released-master-vault'],
			actionKind: 'shield',
			note: 'Strictly protected by Released Studio Master / ISRC Vault Guard; archival masters are never pruned automatically.',
		}
	}

	if (options.protectActiveDawSession && member.context.isActiveDawSession) {
		return {
			verdict: 'blocked-active-daw-session',
			verdictLabel: VERDICT_LABELS['blocked-active-daw-session'],
			actionKind: 'shield',
			note: 'Strictly protected by Active DAW Session Guard; live session project files and Audio Files/ or Samples/ assets are never pruned.',
		}
	}

	if (options.strategy === 'prune-stale-peak-freeze-caches') {
		if (!member.context.isPeakFreezeCache) {
			return {
				verdict: 'blocked-not-peak-cache',
				verdictLabel: VERDICT_LABELS['blocked-not-peak-cache'],
				actionKind: 'shield',
				note: 'Shielded by Peak & Freeze Cache strategy because member is not a reconstructible .asd/.pkf/.reapeaks/.ovw or Freeze/Bounce cache.',
			}
		}
		if (!member.context.isStalePeakCache) {
			return {
				verdict: 'blocked-fresh-peak-cache',
				verdictLabel: VERDICT_LABELS['blocked-fresh-peak-cache'],
				actionKind: 'shield',
				note: `Shielded because peak/freeze cache age is below stale threshold (${options.staleCacheDays}d).`,
			}
		}
		return {
			verdict: 'reclaim-stale-peak-cache',
			verdictLabel: VERDICT_LABELS['reclaim-stale-peak-cache'],
			actionKind: 'reclaim',
			note: 'Stale reconstructible DAW peak/warp/freeze cache safe to prune after SHA-256 verification.',
		}
	}

	if (options.strategy === 'prune-lossy-twins-when-lossless-verified') {
		if (options.protectVerifiedLosslessMaster && member.context.isLosslessMaster) {
			return {
				verdict: 'blocked-lossless-master-guard',
				verdictLabel: VERDICT_LABELS['blocked-lossless-master-guard'],
				actionKind: 'shield',
				note: 'Protected lossless studio master (.wav/.aiff/.flac/.bwf/.caf/.rf64); never pruned during lossy twin sweep.',
			}
		}
		if (!member.context.isLossyTranscode) {
			return {
				verdict: 'blocked-not-lossy-transcode',
				verdictLabel: VERDICT_LABELS['blocked-not-lossy-transcode'],
				actionKind: 'shield',
				note: 'Shielded by Lossy Twin Pruner because member is not a lossy review export (.mp3/.m4a/.aac/.ogg/.opus/.wma).',
			}
		}
		if (!member.context.hasVerifiedLosslessMaster) {
			return {
				verdict: 'blocked-unverified-lossless-master',
				verdictLabel: VERDICT_LABELS['blocked-unverified-lossless-master'],
				actionKind: 'shield',
				note: 'Blocked because no verified lossless master sharing this lineageStem is conserved; lossy transcode cannot be deleted safely.',
			}
		}
		return {
			verdict: 'reclaim-lossy-twin',
			verdictLabel: VERDICT_LABELS['reclaim-lossy-twin'],
			actionKind: 'reclaim',
			note: 'Redundant lossy review export whose lossless studio master is verified and conserved; safe to prune.',
		}
	}

	if (member.context.isLossyTranscode && !member.context.hasVerifiedLosslessMaster) {
		return {
			verdict: 'blocked-unverified-lossless-master',
			verdictLabel: VERDICT_LABELS['blocked-unverified-lossless-master'],
			actionKind: 'shield',
			note: 'Blocked because no verified lossless master sharing this lineageStem is conserved; lossy copy is shielded.',
		}
	}

	return {
		verdict: 'consolidate-to-master-vault',
		verdictLabel: VERDICT_LABELS['consolidate-to-master-vault'],
		actionKind: 'consolidate',
		note: 'Consolidate identical-hash studio copy against canonical Master Vault or session anchor using SHA-256 and stat device checks.',
	}
}

/**
 * Normalize DAW Audio & Stem auditor options into deterministic bounds.
 *
 * @param {object} [rawOptions] Caller options.
 * @return {object} Normalized options.
 */
function normalizeOptions(rawOptions = {}) {
	const familyFilter = DAW_AUDIO_FAMILIES.includes(rawOptions.familyFilter)
		? rawOptions.familyFilter
		: 'all'
	const verdictFilter = DAW_AUDIO_VERDICT_FILTERS.includes(rawOptions.verdictFilter)
		? rawOptions.verdictFilter
		: 'all'
	const sortMode = DAW_AUDIO_SORT_MODES.includes(rawOptions.sortMode)
		? rawOptions.sortMode
		: 'reclaim_desc'
	const strategy = DAW_AUDIO_STRATEGIES.includes(rawOptions.strategy)
		? rawOptions.strategy
		: 'consolidate-studio-masters'
	const survivorRule = DAW_AUDIO_SURVIVOR_RULES.includes(rawOptions.survivorRule)
		? rawOptions.survivorRule
		: 'master-vault-and-daw-first'

	const parsedKeep = Number.parseInt(rawOptions.keepRecentRevisions, 10)
	const keepRecentRevisions = Number.isFinite(parsedKeep) && parsedKeep >= 1
		? Math.min(parsedKeep, 100)
		: 2

	const parsedDays = Number.parseInt(rawOptions.staleCacheDays, 10)
	const staleCacheDays = Number.isFinite(parsedDays) && parsedDays >= 0
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
		protectReleasedMasterVault: rawOptions.protectReleasedMasterVault !== false,
		protectActiveDawSession: rawOptions.protectActiveDawSession !== false,
		protectVerifiedLosslessMaster: rawOptions.protectVerifiedLosslessMaster !== false,
		keepRecentRevisions,
		staleCacheDays,
		minSizeMb,
		searchQuery: String(rawOptions.searchQuery || '').trim().toLowerCase(),
		referenceTimeSec,
		memberOverrides: rawOptions.memberOverrides && typeof rawOptions.memberOverrides === 'object'
			? rawOptions.memberOverrides
			: {},
	}
}

/**
 * Audit duplicate groups for DAW Sessions, Lossless Stem Masters, Mixdown Revisions & Peak Caches.
 *
 * @param {Array<object>} duplicates Loaded duplicate groups.
 * @param {object} [rawOptions] Auditor configuration options.
 * @return {object} Deterministic audit analysis with summary, counts, and clusters.
 */
export function analyzeDawAudioDuplicates(duplicates, rawOptions = {}) {
	const options = normalizeOptions(rawOptions)
	const safeDuplicates = Array.isArray(duplicates) ? duplicates : []
	const minSizeBytes = options.minSizeMb * 1024 * 1024

	const datasetHints = buildDatasetDawHints(safeDuplicates, options.memberOverrides)

	const familyCounts = {
		all: 0,
		'daw-session-project-roots': 0,
		'lossless-studio-masters': 0,
		'lossy-review-exports': 0,
		'daw-freeze-peak-caches': 0,
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
			const info = classifyDawAudioArtifact(file.path, datasetHints)
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

		const clusterHasConservedLosslessMaster = validFiles.some((file, fileIdx) => {
			const selectionKey = String(getFileSelectionKey(file) ?? `${groupIdx}-${fileIdx}`)
			if (options.memberOverrides[selectionKey] === 'exclude') {
				return false
			}
			const normalized = normalizePathForDiff(file.path) || String(file.path || '')
			const parsed = parseDawAudioArtifactInfo(extractBasename(normalized), normalized)
			return Boolean(
				parsed.isLosslessMasterCandidate
				|| (parsed.isLosslessExt && file.losslessMasterVerified === true)
				|| (parsed.isLosslessExt && parsed.isReleasedMasterVaultPath)
			)
		})

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

			const directInfo = classifyDawAudioArtifact(file.path, datasetHints)
			const memberInfo = directInfo && directInfo.matched ? directInfo : primaryInfo
			const context = inspectDawAudioMemberContext(
				file,
				memberInfo,
				options.referenceTimeSec,
				options,
				{
					...datasetHints,
					clusterHasConservedLosslessMaster,
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
		const masterVaultCopiesCount = members.filter(m => m.context.isReleasedMasterVault || m.context.isIsrcMaster).length
		const activeDawCopiesCount = members.filter(m => m.context.isActiveDawSession).length
		const lossyTwinCopiesCount = members.filter(m => m.context.isLossyTranscode).length
		const peakCacheCopiesCount = members.filter(m => m.context.isPeakFreezeCache).length

		const hasMasterVault = masterVaultCopiesCount > 0
		const hasActiveDaw = activeDawCopiesCount > 0
		const hasLossyTwins = lossyTwinCopiesCount > 0
		const hasPeakCaches = peakCacheCopiesCount > 0

		let clusterRiskState = 'reclaimable'
		if (members.some(m => m.verdict === 'blocked-unverified-lossless-master')) {
			clusterRiskState = 'unverified-master'
		} else if (members.some(m => m.verdict === 'blocked-released-master-vault')) {
			clusterRiskState = 'master-vault'
		} else if (members.some(m => m.verdict === 'blocked-active-daw-session')) {
			clusterRiskState = 'active-daw'
		} else if (hasPeakCaches && reclaimableCopiesCount > 0) {
			clusterRiskState = 'reclaimable'
		} else if (hasLossyTwins && reclaimableCopiesCount > 0) {
			clusterRiskState = 'lossy-verified'
		} else if (reclaimableCopiesCount === 0) {
			clusterRiskState = 'shielded'
		}

		const primaryGroupId = group.id ?? null
		const groupKey = String(group.hash || primaryGroupId || `daw-audio-${groupIdx}`)
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
			masterVaultCopiesCount,
			activeDawCopiesCount,
			lossyTwinCopiesCount,
			peakCacheCopiesCount,
			hasMasterVault,
			hasActiveDaw,
			hasLossyTwins,
			hasPeakCaches,
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
		if (options.verdictFilter === 'master-vault' && !cluster.hasMasterVault) {
			return false
		}
		if (options.verdictFilter === 'active-daw' && !cluster.hasActiveDaw) {
			return false
		}
		if (options.verdictFilter === 'lossy-twins' && !cluster.hasLossyTwins) {
			return false
		}
		if (options.verdictFilter === 'peak-cache' && !cluster.hasPeakCaches) {
			return false
		}
		if (options.verdictFilter === 'shielded' && cluster.shieldedCopiesCount === 0 && cluster.clusterRiskState !== 'shielded') {
			return false
		}
		return true
	})

	clusters.sort((a, b) => {
		if (options.sortMode === 'risk_desc') {
			const riskA = a.masterVaultCopiesCount * 5 + a.activeDawCopiesCount * 4 + a.lossyTwinCopiesCount * 2 + a.shieldedCopiesCount
			const riskB = b.masterVaultCopiesCount * 5 + b.activeDawCopiesCount * 4 + b.lossyTwinCopiesCount * 2 + b.shieldedCopiesCount
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
	const totalMasterVaultClusters = clusters.filter(c => c.hasMasterVault).length
	const totalActiveDawClusters = clusters.filter(c => c.hasActiveDaw).length
	const totalLossyTwinClusters = clusters.filter(c => c.hasLossyTwins).length
	const totalPeakCacheClusters = clusters.filter(c => c.hasPeakCaches).length
	const efficiencyPct = totalRawDuplicateBytes > 0
		? Math.round((totalReclaimableBytes / totalRawDuplicateBytes) * 100)
		: 0

	return {
		schema: DAW_AUDIO_STEM_SCHEMA,
		options: {
			familyFilter: options.familyFilter,
			verdictFilter: options.verdictFilter,
			sortMode: options.sortMode,
			strategy: options.strategy,
			survivorRule: options.survivorRule,
			protectReleasedMasterVault: options.protectReleasedMasterVault,
			protectActiveDawSession: options.protectActiveDawSession,
			protectVerifiedLosslessMaster: options.protectVerifiedLosslessMaster,
			keepRecentRevisions: options.keepRecentRevisions,
			staleCacheDays: options.staleCacheDays,
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
			totalMasterVaultClusters,
			totalActiveDawClusters,
			totalLossyTwinClusters,
			totalPeakCacheClusters,
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
 * Build a POSIX DRY_RUN=1 remediation script for DAW Sessions, Lossless Stem Masters & Peak Caches.
 *
 * @param {object} analysis Output from analyzeDawAudioDuplicates.
 * @param {object} [options] Script options.
 * @param {string} [options.dataRoot='/var/www/nextcloud/data'] Nextcloud data root directory.
 * @return {string} POSIX bash script with single-quoted paths, sha256sum -- verification, stat cross-device guard, and DRY_RUN=1 default.
 */
export function buildDawAudioScript(analysis, options = {}) {
	const dataRoot = String(options.dataRoot || '/var/www/nextcloud/data').replace(/\/+$/, '') || '/var/www/nextcloud/data'
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const strategy = (analysis && analysis.options && analysis.options.strategy) || 'consolidate-studio-masters'

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
		'# DAW Session, Lossless Stem Master, Mixdown Revision & Peak Cache Auditor',
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
		lines.push('echo "No reclaimable or consolidatable DAW session, master, lossy mirror, or peak cache targets under current guards."')
		return lines.join('\n')
	}

	lines.push('prune_verified_audio_artifact() {')
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
	lines.push('consolidate_master_vault_copy() {')
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
			lines.push(`consolidate_master_vault_copy ${escapePosixSingleQuote(op.survivorPath)} ${escapePosixSingleQuote(op.targetPath)}`)
		} else {
			lines.push(`prune_verified_audio_artifact ${escapePosixSingleQuote(op.survivorPath)} ${escapePosixSingleQuote(op.targetPath)}`)
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
 * Build a Nextcloud Desktop .sync-exclude.lst snippet for DAW peak caches and session auto-backups.
 *
 * @param {object} analysis Output from analyzeDawAudioDuplicates.
 * @return {string} Newline-delimited Nextcloud sync-exclude patterns.
 */
export function buildDawAudioSyncExcludeSnippet(analysis) {
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const lines = [
		'# Nextcloud Desktop .sync-exclude.lst rules for DAW peak caches and auto-backups',
		'*.asd',
		'*.pkf',
		'*.reapeaks',
		'*.ovw',
		'Backup/',
		'Freeze/',
		'Bounce Cache/',
	]
	const seen = new Set(lines)
	for (const cluster of clusters) {
		if (cluster && cluster.extension === 'logicx' && !seen.has('*.logicx/Alternatives/*/DisplayState.plist')) {
			lines.push('*.logicx/Alternatives/*/DisplayState.plist')
			seen.add('*.logicx/Alternatives/*/DisplayState.plist')
		}
	}
	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe CSV audit report for DAW Sessions, Studio Masters & Peak Caches.
 *
 * @param {object} analysis Output from analyzeDawAudioDuplicates.
 * @return {string} RFC-4180 CSV string with CWE-1236 formula escaping.
 */
export function buildDawAudioCsvReport(analysis) {
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const headers = [
		'Cluster Key',
		'Audio or Session Name',
		'Lineage Stem',
		'Artifact Tags',
		'Extension',
		'Family',
		'Governance Tier',
		'Released Master Vault',
		'Active DAW Session',
		'Verified Lossless Master',
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
				member.context.isReleasedMasterVault ? 'yes' : 'no',
				member.context.isActiveDawSession ? 'yes' : 'no',
				member.context.hasVerifiedLosslessMaster ? 'yes' : 'no',
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
 * Build a structured JSON audit manifest for DAW Sessions, Studio Masters & Peak Caches.
 *
 * @param {object} analysis Output from analyzeDawAudioDuplicates.
 * @param {string} [generatedAt] Optional ISO timestamp override.
 * @return {string} Pretty-printed JSON manifest.
 */
export function buildDawAudioJsonReport(analysis, generatedAt = new Date().toISOString()) {
	const safeAnalysis = analysis && typeof analysis === 'object' ? analysis : { summary: {}, clusters: [], options: {} }
	return JSON.stringify({
		schema: DAW_AUDIO_STEM_SCHEMA,
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
				isReleasedMasterVault: member.context.isReleasedMasterVault,
				isIsrcMaster: member.context.isIsrcMaster,
				isActiveDawSession: member.context.isActiveDawSession,
				isLosslessMaster: member.context.isLosslessMaster,
				isLossyTranscode: member.context.isLossyTranscode,
				isPeakFreezeCache: member.context.isPeakFreezeCache,
				hasVerifiedLosslessMaster: member.context.hasVerifiedLosslessMaster,
				authorityScore: member.context.authorityScore,
			})),
		})),
	}, null, 2)
}
