/**
 * Pure Broadcast Video, NLE Proxy & Camera Card Media Vault Auditor.
 * Classifies and audits duplicate clusters across 4 broadcast & post-production families:
 * - Camera Rushes & Card Offloads (.r3d, .braw, .mxf, ProRes .mov, XAVC/AVCHD .mp4/.mts/.m2ts, .crm, .arx, SD/CFexpress/CFast/XQD/P2 card trees)
 * - NLE Proxies & Render Caches (Proxy/, Optimized Media/, CacheClip/, Adobe Premiere Pro Video Previews/, Render Files/, .pek, .cfa, _Proxy.*)
 * - NLE Projects & Timelines (.drp, .drt, .prproj, .fcpxml, .fcpxmld, .aep, .aepx, NLE .xml, .otio, .edl, .aaf)
 * - Broadcast Masters & Exports (Master/, Masters/, Exports/, Deliverables/, TX/, Broadcast/, _MASTER, _FINAL, _TX)
 *
 * Detects repeated SD/CFexpress/XQD/AVCHD camera card offloads vs regenerable NLE proxies/caches,
 * strictly conserves canonical camera original rushes (OCF), NLE projects/timelines, and broadcast
 * master exports, and builds DRY_RUN=1 POSIX scripts, CWE-1236-safe CSV reports, JSON manifests,
 * and .sync-exclude.lst rules.
 *
 * Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const BROADCAST_NLE_VAULT_SCHEMA = 'duplicatefinder.broadcast-nle-vault-auditor.v1'

export const BROADCAST_NLE_FAMILIES = Object.freeze([
	'all',
	'camera-rushes-card-offloads',
	'nle-proxies-render-caches',
	'nle-projects-timelines',
	'broadcast-master-exports',
])

export const BROADCAST_NLE_FAMILY_META = Object.freeze({
	'camera-rushes-card-offloads': {
		id: 'camera-rushes-card-offloads',
		label: 'Camera Rushes & Card Offloads',
		shortLabel: 'Rushes & Cards (.r3d, .braw, .mxf, ProRes, XAVC/AVCHD)',
	},
	'nle-proxies-render-caches': {
		id: 'nle-proxies-render-caches',
		label: 'NLE Proxies & Render Caches',
		shortLabel: 'Proxies & Caches (Proxy/, Optimized Media/, CacheClip/, .pek, .cfa)',
	},
	'nle-projects-timelines': {
		id: 'nle-projects-timelines',
		label: 'NLE Projects & Timelines',
		shortLabel: 'Projects (.drp, .prproj, .fcpxml, .aep, .xml)',
	},
	'broadcast-master-exports': {
		id: 'broadcast-master-exports',
		label: 'Broadcast Masters & Exports',
		shortLabel: 'Masters (Master/, Deliverables/, TX/, _MASTER)',
	},
})

export const BROADCAST_NLE_STRATEGIES = Object.freeze([
	'prune-proxies-and-duplicate-offloads',
	'hardlink-camera-rushes-vault',
	'quarantine-proxies-and-offloads',
])

export const BROADCAST_NLE_SURVIVOR_RULES = Object.freeze([
	'camera-vault-and-master-first',
	'oldest-ingest-first',
	'newest-edit-first',
	'shortest-path',
])

export const BROADCAST_NLE_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'camera-original-protected',
	'nle-project-timeline-protected',
	'broadcast-master-protected',
	'card-offload-duplicate',
	'regenerable-proxy-cache',
	'shielded',
])

export const BROADCAST_NLE_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const BROADCAST_NLE_PRESETS = Object.freeze([
	{
		id: 'all-broadcast-nle-vault-audit',
		name: 'All Broadcast Rushes, NLE Proxies & Projects',
		description: 'Audit camera rushes (.r3d, .braw, .mxf, ProRes, XAVC/AVCHD), regenerable NLE proxies/caches, project timelines (.drp, .prproj, .fcpxml, .aep, .xml), and master exports.',
		familyFilter: 'all',
		strategy: 'prune-proxies-and-duplicate-offloads',
		survivorRule: 'camera-vault-and-master-first',
		protectCameraOriginals: true,
		protectProjectsTimelines: true,
		protectMasterExports: true,
		requireVerifiedOcfForOffloadPrune: true,
		keepRecentCacheDays: 0,
		minSizeMb: 0,
	},
	{
		id: 'camera-card-offload-dedup',
		name: 'Camera Card Multi-Offload Dedup',
		description: 'Detect SD/CFexpress/CFast/XQD/AVCHD camera cards offloaded multiple times and reclaim secondary offloads only when canonical OCF rushes are conserved.',
		familyFilter: 'camera-rushes-card-offloads',
		strategy: 'prune-proxies-and-duplicate-offloads',
		survivorRule: 'camera-vault-and-master-first',
		protectCameraOriginals: true,
		protectProjectsTimelines: true,
		protectMasterExports: true,
		requireVerifiedOcfForOffloadPrune: true,
		keepRecentCacheDays: 0,
		minSizeMb: 0,
	},
	{
		id: 'nle-proxy-cache-sweep',
		name: 'NLE Proxy & Render Cache Sweep',
		description: 'Target regenerable Proxy/, Optimized Media/, CacheClip/, Adobe Premiere Pro Video Previews/, .pek and .cfa peak/cache duplicates safely.',
		familyFilter: 'nle-proxies-render-caches',
		strategy: 'prune-proxies-and-duplicate-offloads',
		survivorRule: 'camera-vault-and-master-first',
		protectCameraOriginals: true,
		protectProjectsTimelines: true,
		protectMasterExports: true,
		requireVerifiedOcfForOffloadPrune: true,
		keepRecentCacheDays: 0,
		minSizeMb: 0,
	},
	{
		id: 'nle-project-master-shield',
		name: 'Projects, Timelines & Broadcast Masters',
		description: 'Strictly shield .drp, .prproj, .fcpxml, .aep, .xml timelines and TX/Master deliveries while isolating Premiere/Resolve autosave scratch copies.',
		familyFilter: 'nle-projects-timelines',
		strategy: 'quarantine-proxies-and-offloads',
		survivorRule: 'newest-edit-first',
		protectCameraOriginals: true,
		protectProjectsTimelines: true,
		protectMasterExports: true,
		requireVerifiedOcfForOffloadPrune: true,
		keepRecentCacheDays: 0,
		minSizeMb: 0,
	},
	{
		id: 'hardlink-ocf-rushes-vault',
		name: 'Hardlink OCF Rushes & Consolidate Vault',
		description: 'Consolidate immutable duplicate camera card offloads and master deliveries via POSIX hardlinks while blocking hardlinks on mutable .drp/.prproj/.aep projects.',
		familyFilter: 'all',
		strategy: 'hardlink-camera-rushes-vault',
		survivorRule: 'camera-vault-and-master-first',
		protectCameraOriginals: true,
		protectProjectsTimelines: true,
		protectMasterExports: true,
		requireVerifiedOcfForOffloadPrune: false,
		keepRecentCacheDays: 0,
		minSizeMb: 0,
	},
])

export const BROADCAST_NLE_DEFAULT_CONFIG = Object.freeze({
	presetId: 'all-broadcast-nle-vault-audit',
	familyFilter: 'all',
	verdictFilter: 'all',
	strategy: 'prune-proxies-and-duplicate-offloads',
	survivorRule: 'camera-vault-and-master-first',
	sortMode: 'reclaim_desc',
	searchQuery: '',
	protectCameraOriginals: true,
	protectProjectsTimelines: true,
	protectMasterExports: true,
	requireVerifiedOcfForOffloadPrune: true,
	keepRecentCacheDays: 0,
	minSizeMb: 0,
})

const RAW_CAMERA_EXT_RE = /\.(?:r3d|braw|crm|ari|arx)$/i
const BROADCAST_MXF_EXT_RE = /\.mxf$/i
const CAMERA_AVCHD_EXT_RE = /\.(?:mts|m2ts)$/i
const MOV_OR_MP4_EXT_RE = /\.(?:mov|mp4)$/i
const NLE_CACHE_EXT_RE = /\.(?:pek|cfa|ims|dvcc)$/i
const NLE_PROJECT_EXT_RE = /\.(?:drp|drt|prproj|fcpxml|fcpxmld|aep|aepx|otio|edl|aaf)$/i
const NLE_XML_EXT_RE = /\.xml$/i

const NLE_PROXY_CACHE_PATH_RE = /(?:^|\/)(?:prox(?:y|ies)|optimized\s+media|cacheclip|render\s+files|transcoded\s+media|adobe\s+premiere\s+pro\s+(?:video|audio)\s+previews|media\s+cache(?:\s+files)?|peak\s+files|resolve\s+cache|\.resolve_cache|motion\s+templates\.localized|proxy[-_]?media)(?:\/|$)/i
const NLE_PROXY_NAME_RE = /(?:^|[-_.])(?:proxy|proxies|optimized|cacheclip|preview|render[-_]?cache|transcode)(?:[-_.]|$)/i

const NLE_AUTOSAVE_PATH_RE = /(?:^|\/)(?:adobe\s+premiere\s+pro\s+auto-save|resolve\s+project\s+backups|auto-?save|project[-_]?backups?|nle[-_]?autosave)(?:\/|$)/i
const NLE_PROJECT_PATH_RE = /(?:^|\/)(?:projects?|timelines?|edits?|resolve|premiere|fcpx|final\s+cut|after\s+effects|nle|sequences?|cuts?|conform)(?:\/|$)/i
const NLE_XML_NAME_RE = /(?:timeline|sequence|fcpxml|edl|conform|resolve|premiere|cut|reel|nle|project)/i

const MASTER_EXPORT_PATH_RE = /(?:^|\/)(?:masters?|exports?|deliverables?|final(?:s)?|broadcast|tx|grading[-_]?master|online[-_]?master|qc[-_]?masters?)(?:\/|$)/i
const MASTER_EXPORT_NAME_RE = /(?:^|[-_.])(?:master|tx|broadcast|deliverable|final[-_]?cut|prores[-_]?master|graded[-_]?master|online)(?:[-_.]|$)/i

const CANONICAL_OCF_PATH_RE = /(?:^|\/)(?:vault|ocf|camera[-_]?originals?|rushes|original\s+media|shoot[-_]?day\d*|day[-_]?\d+|footage|camera[-_]?vault|ingest[-_]?vault|media[-_]?vault|reel[-_]?\d+)(?:\/|$)/i
const CAMERA_CARD_TREE_RE = /(?:^|\/)(?:private\/avchd(?:\/bdmv\/stream)?|xdroot\/clip|m4root\/clip|contents\/video|dcim\/\d{3}[a-z0-9_]*|sd[-_]?card[-_a-z0-9]*|cfexpress[-_a-z0-9]*|cfast[-_a-z0-9]*|xqd[-_a-z0-9]*|sxs[-_a-z0-9]*|p2[-_a-z0-9]*|card[-_]?[a-z0-9]+|reel[-_]?[a-z0-9]+|[a-d]\d{3}(?:r[a-z0-9]+)?)(?:\/|$)/i
const DUPLICATE_OFFLOAD_PATH_RE = /(?:^|\/)(?:offload[-_]?[2-9]\d*|ingest[-_]?(?:copy|scratch|[2-9]\d*)|card[-_]?(?:backup|copy|dup|mirror)[-_a-z0-9]*|sd[-_]?backup[-_a-z0-9]*|cfexpress[-_]?copy[-_a-z0-9]*|tmp|temp|staging|scratch|downloads?|desktop|copy[-_]?\d*|backup[-_]?offload)(?:\/|$)/i
const DUPLICATE_OFFLOAD_NAME_RE = /(?:[-_\s](?:copy|offload2|backup|dup)\d*| \(\d+\))(?=\.[^.]+$)/i

const CAMERA_MEDIA_NAME_RE = /(?:prores|422(?:hq|lt|proxy)?|4444(?:xq)?|xavc|avchd|dnxhd|dnxhr|braw|redcode|arriraw|^[a-d]\d{3}c\d{3}|^c\d{4}|^mvi_\d+|^dji_\d+|^gx\d+|^clip[-_]?\d+)/i
const BROADCAST_PATH_HINT_RE = /(?:^|\/)(?:rushes|ocf|camera|ingest|offload|card|cfexpress|cfast|xqd|sxs|sd[-_]?card|private\/avchd|xdroot|m4root|contents|dcim|nle|resolve|premiere|fcpx|final\s+cut|proxy|proxies|optimized\s+media|cacheclip|render\s+files|masters?|exports?|deliverables?|broadcast|tx|reel|shoot|footage)(?:\/|$)/i

const CARD_SIGNATURE_RE = /(private\/avchd|xdroot\/clip|m4root\/clip|contents\/video|dcim\/\d{3}[a-z0-9_]*|cfexpress[-_a-z0-9]*|cfast[-_a-z0-9]*|sd[-_]?card[-_a-z0-9]*|xqd[-_a-z0-9]*|sxs[-_a-z0-9]*|p2[-_a-z0-9]*|card[-_]?[a-z0-9]+|reel[-_]?[a-z0-9]+|offload[-_]?\d+)/i

/**
 * Normalize a non-negative integer value safely within bounds.
 *
 * @param {*} value Candidate numeric input.
 * @param {number} fallback Default fallback.
 * @param {number} [max] Upper bound.
 * @return {number} Clamped non-negative integer.
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
export function normalizeBroadcastNleConfig(raw = {}) {
	const input = raw && typeof raw === 'object' ? raw : {}
	const preset = BROADCAST_NLE_PRESETS.find(item => item.id === input.presetId) || null
	const base = preset ? { ...BROADCAST_NLE_DEFAULT_CONFIG, ...preset } : { ...BROADCAST_NLE_DEFAULT_CONFIG }

	const familyFilter = BROADCAST_NLE_FAMILIES.includes(input.familyFilter)
		? input.familyFilter
		: base.familyFilter
	const verdictFilter = BROADCAST_NLE_VERDICT_FILTERS.includes(input.verdictFilter)
		? input.verdictFilter
		: base.verdictFilter
	const strategy = BROADCAST_NLE_STRATEGIES.includes(input.strategy)
		? input.strategy
		: base.strategy
	const survivorRule = BROADCAST_NLE_SURVIVOR_RULES.includes(input.survivorRule)
		? input.survivorRule
		: base.survivorRule
	const sortMode = BROADCAST_NLE_SORT_MODES.includes(input.sortMode)
		? input.sortMode
		: base.sortMode

	const memberOverrides = input.memberOverrides && typeof input.memberOverrides === 'object'
		? { ...input.memberOverrides }
		: {}

	return {
		presetId: preset ? preset.id : base.presetId,
		familyFilter,
		verdictFilter,
		strategy,
		survivorRule,
		sortMode,
		searchQuery: typeof input.searchQuery === 'string' ? input.searchQuery.trim() : '',
		protectCameraOriginals: typeof input.protectCameraOriginals === 'boolean'
			? input.protectCameraOriginals
			: base.protectCameraOriginals,
		protectProjectsTimelines: typeof input.protectProjectsTimelines === 'boolean'
			? input.protectProjectsTimelines
			: base.protectProjectsTimelines,
		protectMasterExports: typeof input.protectMasterExports === 'boolean'
			? input.protectMasterExports
			: base.protectMasterExports,
		requireVerifiedOcfForOffloadPrune: typeof input.requireVerifiedOcfForOffloadPrune === 'boolean'
			? input.requireVerifiedOcfForOffloadPrune
			: base.requireVerifiedOcfForOffloadPrune,
		keepRecentCacheDays: normalizeNonNegativeInt(input.keepRecentCacheDays, base.keepRecentCacheDays, 3650),
		minSizeMb: normalizeNonNegativeInt(input.minSizeMb, base.minSizeMb, 1000000),
		memberOverrides,
	}
}

/**
 * Extract the basename from a normalized filesystem path.
 *
 * @param {string} normalizedPath Normalized path.
 * @return {string} File basename.
 */
function extractBasename(normalizedPath) {
	const parts = String(normalizedPath || '').split('/')
	return parts[parts.length - 1] || ''
}

/**
 * Extract the directory portion from a normalized filesystem path.
 *
 * @param {string} normalizedPath Normalized path.
 * @return {string} Parent directory path.
 */
function extractDirname(normalizedPath) {
	const idx = String(normalizedPath || '').lastIndexOf('/')
	return idx > 0 ? String(normalizedPath).slice(0, idx) : ''
}

/**
 * Parse a file mtime value into epoch milliseconds when available.
 *
 * @param {object} file Duplicate file entry.
 * @return {number|null} Epoch ms or null.
 */
function extractMtimeMs(file) {
	const raw = file?.mtime ?? file?.modified ?? file?.lastModified ?? null
	if (raw === null || raw === undefined || raw === '') {
		return null
	}
	if (typeof raw === 'number' && Number.isFinite(raw)) {
		return raw > 1e12 ? raw : raw * 1000
	}
	const parsed = Date.parse(String(raw))
	return Number.isFinite(parsed) ? parsed : null
}

/**
 * Extract a normalized clip/project stem for cross-vault lineage matching.
 *
 * @param {string} basename File basename.
 * @return {string} Normalized clip stem.
 */
export function extractBroadcastClipStem(basename) {
	let stem = String(basename || '').trim().toLowerCase()
	stem = stem.replace(/\.(?:r3d|braw|crm|ari|arx|mxf|mov|mp4|mts|m2ts|pek|cfa|ims|dvcc|drp|drt|prproj|fcpxml|fcpxmld|aep|aepx|xml|otio|edl|aaf)$/i, '')
	stem = stem.replace(/(?:[-_.]?(?:proxy|proxies|optimized|master|final|tx|broadcast|copy\d*|offload\d*|dup\d*))+$/i, '')
	stem = stem.replace(/\s+\(\d+\)$/, '')
	return stem || 'unknown-clip'
}

/**
 * Extract a camera card / reel / offload signature from a path when present.
 *
 * @param {string} normalizedPath Normalized filesystem path.
 * @return {string} Card signature label or empty string.
 */
function extractCardSignature(normalizedPath) {
	const match = String(normalizedPath || '').match(CARD_SIGNATURE_RE)
	return match ? match[1] : ''
}

/**
 * Classify a single duplicate file into the Broadcast Video, NLE Proxy & Camera Card domain.
 *
 * @param {object} file Duplicate file entry.
 * @param {number} [referenceNowMs] Reference epoch ms.
 * @return {object} Classification metadata (family === null if outside domain).
 */
export function classifyBroadcastNleFile(file, referenceNowMs = Date.now()) {
	const rawPath = file?.path || file?.name || ''
	const normalized = normalizePathForDiff(rawPath) || String(rawPath || '').replace(/\\/g, '/')
	const lower = normalized.toLowerCase()
	const basename = extractBasename(normalized)
	const lowerBase = basename.toLowerCase()
	const dir = extractDirname(normalized)
	const lowerDir = dir.toLowerCase()

	const isRawCameraExt = RAW_CAMERA_EXT_RE.test(lowerBase)
	const isMxfExt = BROADCAST_MXF_EXT_RE.test(lowerBase)
	const isAvchdExt = CAMERA_AVCHD_EXT_RE.test(lowerBase)
	const isMovOrMp4Ext = MOV_OR_MP4_EXT_RE.test(lowerBase)
	const isNleCacheExt = NLE_CACHE_EXT_RE.test(lowerBase)
	const isNleProjectExt = NLE_PROJECT_EXT_RE.test(lowerBase)
	const isXmlExt = NLE_XML_EXT_RE.test(lowerBase)

	const isProxyCachePath = NLE_PROXY_CACHE_PATH_RE.test(lower)
	const isProxyName = NLE_PROXY_NAME_RE.test(lowerBase)
	const isAutosavePath = NLE_AUTOSAVE_PATH_RE.test(lower)
	const isProjectPath = NLE_PROJECT_PATH_RE.test(lower)
	const isMasterPath = MASTER_EXPORT_PATH_RE.test(lower)
	const isMasterName = MASTER_EXPORT_NAME_RE.test(lowerBase)
	const isCanonicalOcfPath = CANONICAL_OCF_PATH_RE.test(lower)
	const isCameraCardTree = CAMERA_CARD_TREE_RE.test(lower)
	const isDuplicateOffloadPath = DUPLICATE_OFFLOAD_PATH_RE.test(lower)
	const isDuplicateOffloadName = DUPLICATE_OFFLOAD_NAME_RE.test(lowerBase)
	const isCameraMediaName = CAMERA_MEDIA_NAME_RE.test(lowerBase)
	const hasBroadcastPathHint = BROADCAST_PATH_HINT_RE.test(lower)

	const isMovOrMp4Broadcast = isMovOrMp4Ext && (
		hasBroadcastPathHint
		|| isProxyName
		|| isMasterName
		|| isCameraMediaName
		|| isCameraCardTree
	)

	const isNleXml = isXmlExt && (isProjectPath || isAutosavePath || NLE_XML_NAME_RE.test(lowerBase))

	const inDomain = Boolean(
		isRawCameraExt
		|| isMxfExt
		|| isAvchdExt
		|| isNleCacheExt
		|| isNleProjectExt
		|| isNleXml
		|| isMovOrMp4Broadcast
	)

	let family = null
	let artifactKind = 'unknown'

	if (inDomain) {
		if (isNleCacheExt || isProxyCachePath || (isProxyName && !isNleProjectExt && !isNleXml)) {
			family = 'nle-proxies-render-caches'
			artifactKind = isNleCacheExt
				? 'nle-peak-or-cache'
				: (isProxyCachePath ? 'nle-proxy-or-render-cache' : 'nle-proxy-clip')
		} else if (isNleProjectExt || isNleXml) {
			family = 'nle-projects-timelines'
			artifactKind = isAutosavePath ? 'nle-project-autosave' : 'nle-project-timeline'
		} else if ((isMasterPath || isMasterName) && !isRawCameraExt && !isAvchdExt) {
			family = 'broadcast-master-exports'
			artifactKind = isDuplicateOffloadPath ? 'master-export-duplicate' : 'broadcast-master-export'
		} else {
			family = 'camera-rushes-card-offloads'
			if (isRawCameraExt) {
				artifactKind = 'camera-raw-ocf'
			} else if (isMxfExt) {
				artifactKind = 'broadcast-mxf-rush'
			} else if (isAvchdExt) {
				artifactKind = 'avchd-camera-stream'
			} else {
				artifactKind = 'prores-or-xavc-rush'
			}
		}
	}

	const mtimeMs = extractMtimeMs(file)
	const ageDays = mtimeMs !== null && Number.isFinite(referenceNowMs)
		? Math.max(0, Math.floor((referenceNowMs - mtimeMs) / 86400000))
		: null

	const isRegenerableProxyOrCache = family === 'nle-proxies-render-caches'
	const isProjectOrTimeline = family === 'nle-projects-timelines'
	const isMasterExport = family === 'broadcast-master-exports'
	const isCameraRush = family === 'camera-rushes-card-offloads'
	const isMutableNleProject = isProjectOrTimeline
	const cardSignature = extractCardSignature(normalized)
	const clipStem = extractBroadcastClipStem(basename)

	const offloadRole = isRegenerableProxyOrCache
		? 'regenerable-proxy-cache'
		: (isProjectOrTimeline
			? (isAutosavePath ? 'nle-autosave-scratch' : 'nle-project-timeline')
			: (isMasterExport
				? ((isDuplicateOffloadPath || isDuplicateOffloadName) && !isMasterPath ? 'duplicate-master-copy' : 'broadcast-master-export')
				: ((isDuplicateOffloadPath || isDuplicateOffloadName) && !isCanonicalOcfPath
					? 'duplicate-card-offload'
					: 'canonical-camera-rush')))

	return {
		family,
		artifactKind,
		normalized,
		lower,
		basename,
		lowerBase,
		dir,
		lowerDir,
		clipStem,
		cardSignature,
		offloadRole,
		isRawCameraExt,
		isMxfExt,
		isAvchdExt,
		isNleCacheExt,
		isNleProjectExt,
		isNleXml,
		isProxyCachePath,
		isProxyName,
		isAutosavePath,
		isMasterPath,
		isMasterName,
		isCanonicalOcfPath,
		isCameraCardTree,
		isDuplicateOffloadPath,
		isDuplicateOffloadName,
		isRegenerableProxyOrCache,
		isProjectOrTimeline,
		isMasterExport,
		isCameraRush,
		isMutableNleProject,
		size: Number(file?.size) || 0,
		mtimeMs,
		ageDays,
		formattedMtime: formatFileModifiedTime(file),
	}
}

/**
 * Determine whether a duplicate group belongs to the Broadcast Video, NLE Proxy & Camera Card domain.
 *
 * @param {object} group Duplicate group.
 * @return {boolean} True when at least one file matches the domain.
 */
export function isBroadcastNleGroup(group) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return false
	}
	return group.files.some(file => classifyBroadcastNleFile(file).family !== null)
}

/**
 * Build dataset-wide correlation index across OCF camera vaults, card offloads, projects, and masters.
 *
 * @param {Array<object>} groups Domain duplicate groups.
 * @return {object} Correlation index with verified OCF stems and master stems.
 */
function buildBroadcastVaultCorrelationIndex(groups) {
	const verifiedOcfStems = new Set()
	const verifiedMasterStems = new Set()
	const cardSignaturesByStem = new Map()

	for (const group of groups) {
		for (const file of group.files || []) {
			const meta = classifyBroadcastNleFile(file)
			if (!meta.family) {
				continue
			}
			if (meta.isCameraRush && (meta.isCanonicalOcfPath || !meta.isDuplicateOffloadPath)) {
				verifiedOcfStems.add(meta.clipStem)
			}
			if (meta.isMasterExport && meta.isMasterPath) {
				verifiedMasterStems.add(meta.clipStem)
			}
			if (meta.cardSignature) {
				if (!cardSignaturesByStem.has(meta.clipStem)) {
					cardSignaturesByStem.set(meta.clipStem, new Set())
				}
				cardSignaturesByStem.get(meta.clipStem).add(meta.cardSignature)
			}
		}
	}

	return {
		verifiedOcfStems,
		verifiedMasterStems,
		cardSignaturesByStem,
	}
}

/**
 * Resolve the primary governance family of a cluster across its classified members.
 *
 * @param {Array<object>} members Classified members.
 * @return {string} Family ID.
 */
function resolveClusterFamily(members) {
	if (members.some(m => m.family === 'nle-projects-timelines')) {
		return 'nle-projects-timelines'
	}
	if (members.some(m => m.family === 'broadcast-master-exports')) {
		return 'broadcast-master-exports'
	}
	if (members.some(m => m.family === 'camera-rushes-card-offloads')) {
		return 'camera-rushes-card-offloads'
	}
	return 'nle-proxies-render-caches'
}

/**
 * Compute deterministic survivor priority score for a cluster member.
 *
 * @param {object} member Classified member.
 * @param {string} survivorRule Survivor rule.
 * @return {number} Priority score (higher wins).
 */
function scoreMemberForSurvivor(member, survivorRule) {
	const mtimeScore = member.mtimeMs !== null ? member.mtimeMs / 1e10 : 0
	const shortPathScore = 1000 - Math.min(999, member.normalized.length)

	if (survivorRule === 'oldest-ingest-first') {
		const oldestScore = member.mtimeMs !== null ? (1e6 - member.mtimeMs / 1e10) : 0
		return (member.isCanonicalOcfPath ? 10000 : 0)
			+ (member.isDuplicateOffloadPath || member.isRegenerableProxyOrCache ? -5000 : 0)
			+ oldestScore
	}

	if (survivorRule === 'newest-edit-first') {
		return (member.isProjectOrTimeline && !member.isAutosavePath ? 10000 : 0)
			+ (member.isMasterPath ? 9000 : 0)
			+ (member.isAutosavePath ? -5000 : 0)
			+ mtimeScore
	}

	if (survivorRule === 'shortest-path') {
		return (member.isRegenerableProxyOrCache ? -2000 : 0)
			+ (member.isDuplicateOffloadPath ? -1500 : 0)
			+ shortPathScore
	}

	return (member.isProjectOrTimeline && !member.isAutosavePath ? 50000 : 0)
		+ (member.isMasterPath ? 45000 : 0)
		+ (member.isCanonicalOcfPath ? 40000 : 0)
		+ (member.isCameraRush && !member.isDuplicateOffloadPath && !member.isDuplicateOffloadName ? 25000 : 0)
		+ (member.isCameraCardTree && !member.isDuplicateOffloadPath ? 15000 : 0)
		+ (member.isAutosavePath ? -12000 : 0)
		+ (member.isDuplicateOffloadPath || member.isDuplicateOffloadName ? -18000 : 0)
		+ (member.isRegenerableProxyOrCache ? -25000 : 0)
		+ shortPathScore
}

/**
 * Audit a single Broadcast / NLE duplicate cluster.
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
		const meta = classifyBroadcastNleFile(file, referenceNowMs)
		if (!meta.family) {
			return null
		}
		return {
			...meta,
			id: file?.id ?? null,
			key: getFileSelectionKey(file) ?? `member-${index}`,
			file,
			index,
		}
	}).filter(Boolean)

	if (rawMembers.length === 0) {
		return null
	}

	const family = resolveClusterFamily(rawMembers)
	const primaryName = rawMembers[0].basename || group.hash || `cluster-${group.id}`
	const primaryStem = rawMembers[0].clipStem || extractBroadcastClipStem(primaryName)
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
	const survivor = sortedForSurvivor[0]
	const survivorKey = survivor.key

	const hasVerifiedCanonicalOcfSurvivor = Boolean(
		survivor.isCameraRush
		&& (survivor.isCanonicalOcfPath || (!survivor.isDuplicateOffloadPath && !survivor.isDuplicateOffloadName))
	) || correlationIndex.verifiedOcfStems.has(primaryStem)

	const hasMultipleCardOffloads = rawMembers.filter(m => m.isCameraRush).length > 1
		&& rawMembers.some(m => m.isCameraCardTree || m.isDuplicateOffloadPath || m.isDuplicateOffloadName)

	let reclaimableBytes = 0
	let hardlinkSavingsBytes = 0
	let deleteTargetsCount = 0
	let hardlinkTargetsCount = 0
	let shieldedCount = 0

	const members = rawMembers.map((member) => {
		const isSurvivor = member.key === survivorKey
		const override = config.memberOverrides?.[member.key] || 'auto'
		let governanceTier = 'regenerable-proxy-cache'
		let shielded = false
		let protectedReason = ''
		let action = 'keep'

		if (override === 'keep' && !isSurvivor) {
			governanceTier = member.isProjectOrTimeline
				? 'nle-project-timeline-protected'
				: (member.isMasterExport
					? 'broadcast-master-protected'
					: (member.isCameraRush ? 'camera-original-protected' : 'regenerable-proxy-cache'))
			shielded = true
			protectedReason = 'Manually shielded via per-copy override'
		} else if (member.isProjectOrTimeline && !member.isAutosavePath && config.protectProjectsTimelines) {
			governanceTier = 'nle-project-timeline-protected'
			shielded = true
			protectedReason = 'Active NLE project or timeline (.drp/.prproj/.fcpxml/.aep/.xml) strictly conserved'
		} else if (member.isMasterExport && (member.isMasterPath || isSurvivor) && config.protectMasterExports) {
			governanceTier = 'broadcast-master-protected'
			shielded = true
			protectedReason = 'Broadcast master / deliverable export strictly conserved'
		} else if (isSurvivor && !member.isRegenerableProxyOrCache) {
			governanceTier = member.isProjectOrTimeline
				? 'nle-project-timeline-protected'
				: (member.isMasterExport ? 'broadcast-master-protected' : 'camera-original-protected')
			shielded = true
			protectedReason = member.isCameraRush
				? 'Canonical camera original rush (OCF) survivor retained'
				: 'Canonical cluster survivor retained'
		} else if (override === 'prune' && !isSurvivor) {
			governanceTier = member.isCameraRush ? 'card-offload-duplicate' : 'regenerable-proxy-cache'
			action = config.strategy === 'hardlink-camera-rushes-vault' && !member.isMutableNleProject && !member.isRegenerableProxyOrCache
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
		} else if (member.isRegenerableProxyOrCache) {
			governanceTier = 'regenerable-proxy-cache'
			if (
				config.keepRecentCacheDays > 0
				&& member.ageDays !== null
				&& member.ageDays < config.keepRecentCacheDays
			) {
				shielded = true
				protectedReason = `Within ${config.keepRecentCacheDays}-day render cache grace window`
			} else if (isSurvivor && !member.isNleCacheExt && !member.isProxyCachePath) {
				shielded = true
				protectedReason = 'Primary proxy survivor retained'
			} else if (isSurvivor && !member.isNleCacheExt && rawMembers.every(m => m.isRegenerableProxyOrCache) && !hasVerifiedCanonicalOcfSurvivor) {
				shielded = true
				protectedReason = 'One proxy anchor retained because no verified OCF rush was matched in vault'
			} else {
				action = 'delete'
				reclaimableBytes += member.size
				deleteTargetsCount += 1
			}
		} else if (member.isAutosavePath) {
			governanceTier = 'regenerable-proxy-cache'
			if (config.protectProjectsTimelines && isSurvivor) {
				shielded = true
				protectedReason = 'Latest project autosave retained (no main project copy in cluster)'
			} else {
				action = 'delete'
				reclaimableBytes += member.size
				deleteTargetsCount += 1
			}
		} else if (member.isCameraRush) {
			const isExplicitDupOffload = member.isDuplicateOffloadPath || member.isDuplicateOffloadName
			if (config.strategy === 'hardlink-camera-rushes-vault') {
				governanceTier = isExplicitDupOffload ? 'card-offload-duplicate' : 'camera-original-protected'
				action = 'hardlink'
				hardlinkSavingsBytes += member.size
				reclaimableBytes += member.size
				hardlinkTargetsCount += 1
			} else if (config.protectCameraOriginals && !isExplicitDupOffload) {
				governanceTier = 'camera-original-protected'
				shielded = true
				protectedReason = 'Camera original rush outside secondary offload paths strictly conserved'
			} else if (config.requireVerifiedOcfForOffloadPrune && !hasVerifiedCanonicalOcfSurvivor) {
				governanceTier = 'camera-original-protected'
				shielded = true
				protectedReason = 'Blocked until a canonical OCF camera rush copy is verified in vault'
			} else {
				governanceTier = 'card-offload-duplicate'
				action = 'delete'
				reclaimableBytes += member.size
				deleteTargetsCount += 1
			}
		} else if (member.isMasterExport) {
			if (config.strategy === 'hardlink-camera-rushes-vault') {
				governanceTier = 'broadcast-master-protected'
				action = 'hardlink'
				hardlinkSavingsBytes += member.size
				reclaimableBytes += member.size
				hardlinkTargetsCount += 1
			} else if (config.protectMasterExports && !member.isDuplicateOffloadPath && !member.isDuplicateOffloadName) {
				governanceTier = 'broadcast-master-protected'
				shielded = true
				protectedReason = 'Master export copy conserved by Master Export shield'
			} else {
				governanceTier = 'card-offload-duplicate'
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

	let clusterVerdict = 'regenerable-proxy-cache'
	if (members.some(m => m.governanceTier === 'nle-project-timeline-protected')) {
		clusterVerdict = 'nle-project-timeline-protected'
	} else if (members.some(m => m.governanceTier === 'broadcast-master-protected')) {
		clusterVerdict = 'broadcast-master-protected'
	} else if (members.some(m => m.governanceTier === 'card-offload-duplicate' && (m.action === 'delete' || m.action === 'hardlink'))) {
		clusterVerdict = 'card-offload-duplicate'
	} else if (members.some(m => m.governanceTier === 'camera-original-protected')) {
		clusterVerdict = 'camera-original-protected'
	}

	const hasReclaimable = (deleteTargetsCount + hardlinkTargetsCount) > 0
	const cardSignatures = Array.from(new Set(members.map(m => m.cardSignature).filter(Boolean)))
	const riskScore = (clusterVerdict === 'camera-original-protected' ? 100 : 0)
		+ (clusterVerdict === 'nle-project-timeline-protected' ? 95 : 0)
		+ (clusterVerdict === 'broadcast-master-protected' ? 90 : 0)
		+ (clusterVerdict === 'card-offload-duplicate' ? 70 : 0)
		+ (hasReclaimable ? 20 : 0)

	return {
		id: group.id ?? primaryName,
		hash: group.hash || '',
		name: primaryName,
		clipStem: primaryStem,
		family,
		familyLabel: BROADCAST_NLE_FAMILY_META[family]?.label || family,
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
		survivorPath: survivor.normalized,
		hasCameraOriginal: members.some(m => m.governanceTier === 'camera-original-protected'),
		hasProjectTimeline: members.some(m => m.governanceTier === 'nle-project-timeline-protected'),
		hasMasterExport: members.some(m => m.governanceTier === 'broadcast-master-protected'),
		hasDuplicateCardOffload: hasMultipleCardOffloads || members.some(m => m.governanceTier === 'card-offload-duplicate'),
		hasRegenerableProxy: members.some(m => m.governanceTier === 'regenerable-proxy-cache'),
		hasVerifiedOcfAnchor: hasVerifiedCanonicalOcfSurvivor,
		cardSignatures,
		members,
		group,
	}
}

/**
 * Audit duplicate groups across Broadcast Video, NLE Proxies & Camera Card Media Vaults.
 *
 * @param {Array<object>} groups Duplicate groups.
 * @param {object} [rawConfig] Audit configuration overrides.
 * @param {number} [referenceNowMs] Reference epoch ms for deterministic tests.
 * @return {object} Complete audit report with summary, family counts, and filtered clusters.
 */
export function auditBroadcastNleVault(groups, rawConfig = {}, referenceNowMs = Date.now()) {
	const config = normalizeBroadcastNleConfig(rawConfig)
	const sourceGroups = Array.isArray(groups) ? groups : []
	const domainGroups = sourceGroups.filter(isBroadcastNleGroup)
	const correlationIndex = buildBroadcastVaultCorrelationIndex(domainGroups)

	const allClusters = domainGroups
		.map(group => auditSingleCluster(group, correlationIndex, config, referenceNowMs))
		.filter(Boolean)

	const minSizeBytes = config.minSizeMb * 1024 * 1024
	const sizeFiltered = allClusters.filter(cluster => cluster.unitBytes >= minSizeBytes)

	const familyCounts = {
		all: sizeFiltered.length,
		'camera-rushes-card-offloads': 0,
		'nle-proxies-render-caches': 0,
		'nle-projects-timelines': 0,
		'broadcast-master-exports': 0,
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
			const matchesStem = cluster.clipStem.toLowerCase().includes(query)
			const matchesCard = cluster.cardSignatures.some(sig => sig.toLowerCase().includes(query))
			const matchesMember = cluster.members.some(m => m.lower.includes(query))
			if (!matchesName && !matchesStem && !matchesCard && !matchesMember) {
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
	let totalCameraOriginalClusters = 0
	let totalProjectTimelineClusters = 0
	let totalMasterExportClusters = 0
	let totalDuplicateOffloadClusters = 0
	let totalRegenerableProxyClusters = 0

	for (const cluster of filteredClusters) {
		rawDuplicateBytes += Math.max(0, cluster.totalBytes - cluster.unitBytes)
		reclaimableBytes += cluster.reclaimableBytes
		totalReclaimableCopiesCount += cluster.reclaimableTargetsCount
		totalShieldedCopiesCount += cluster.shieldedCount

		if (cluster.hasCameraOriginal) {
			totalCameraOriginalClusters += 1
		}
		if (cluster.hasProjectTimeline) {
			totalProjectTimelineClusters += 1
		}
		if (cluster.hasMasterExport) {
			totalMasterExportClusters += 1
		}
		if (cluster.hasDuplicateCardOffload) {
			totalDuplicateOffloadClusters += 1
		}
		if (cluster.hasRegenerableProxy) {
			totalRegenerableProxyClusters += 1
		}
	}

	const efficiencyPct = rawDuplicateBytes > 0
		? Math.min(100, Math.round((reclaimableBytes / rawDuplicateBytes) * 100))
		: 0

	const reclaimableGb = `${(reclaimableBytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`

	const familyBreakdown = BROADCAST_NLE_FAMILIES
		.filter(id => id !== 'all')
		.map(id => ({
			id,
			label: BROADCAST_NLE_FAMILY_META[id].label,
			shortLabel: BROADCAST_NLE_FAMILY_META[id].shortLabel,
			clustersCount: familyCounts[id] || 0,
		}))

	return {
		schema: BROADCAST_NLE_VAULT_SCHEMA,
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
			totalCameraOriginalClusters,
			totalProjectTimelineClusters,
			totalMasterExportClusters,
			totalDuplicateOffloadClusters,
			totalRegenerableProxyClusters,
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
 * Build a safe POSIX DRY_RUN=1 remediation script for Broadcast Video, NLE Proxy & Camera Card vaults.
 * Strictly blocks deletion or hardlinking of shielded OCF camera rushes, mutable NLE projects/timelines,
 * and broadcast master exports.
 *
 * @param {object} auditResult Result from auditBroadcastNleVault.
 * @return {string} POSIX bash script.
 */
export function buildBroadcastNleRemediationScript(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# Broadcast Video, NLE Proxy & Camera Card Media Vault Auditor',
		'# Safe POSIX Remediation Script (default DRY_RUN=1)',
		'# Run with DRY_RUN=0 ./broadcast-nle-vault-reclaim.sh only after verifying OCF rushes and NLE timelines.',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'QUARANTINE_DIR="$' + '{QUARANTINE_DIR:-./.broadcast-nle-quarantine}"',
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
	const strategy = auditResult?.config?.strategy || 'prune-proxies-and-duplicate-offloads'
	for (const cluster of clusters) {
		const actions = (cluster.members || []).filter(m => !m.shielded && (m.action === 'delete' || m.action === 'hardlink'))
		if (actions.length === 0) {
			continue
		}
		lines.push(`# Cluster: ${cluster.name} | Family: ${cluster.familyLabel} | Survivor: ${cluster.survivorPath}`)
		for (const target of actions) {
			actionCount += 1
			if (target.action === 'hardlink' && !target.isMutableNleProject) {
				lines.push(`run_cmd ln -f ${quotePosixPath(cluster.survivorPath)} ${quotePosixPath(target.normalized)}`)
			} else if (strategy === 'quarantine-proxies-and-offloads') {
				lines.push('run_cmd mkdir -p "$QUARANTINE_DIR"')
				lines.push(`run_cmd mv -n ${quotePosixPath(target.normalized)} "$QUARANTINE_DIR/"`)
			} else {
				lines.push(`run_cmd rm -f ${quotePosixPath(target.normalized)}`)
			}
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('printf "No reclaimable NLE proxies, caches, or duplicate card offloads under current protection settings.\\n"')
	} else {
		lines.push(`printf "Completed Broadcast & NLE Vault remediation plan (%d target actions, DRY_RUN=%s).\\n" "${actionCount}" "$DRY_RUN"`)
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe RFC-4180 CSV audit report.
 *
 * @param {object} auditResult Result from auditBroadcastNleVault.
 * @return {string} RFC-4180 CSV string.
 */
export function buildBroadcastNleCsvReport(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const headers = [
		'cluster_id',
		'cluster_name',
		'clip_stem',
		'family',
		'cluster_verdict',
		'member_path',
		'artifact_kind',
		'offload_role',
		'card_signature',
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
				cluster.clipStem,
				cluster.family,
				cluster.clusterVerdict,
				member.normalized,
				member.artifactKind,
				member.offloadRole,
				member.cardSignature || '',
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
 * @param {object} auditResult Result from auditBroadcastNleVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildBroadcastNleJsonManifest(auditResult) {
	const payload = {
		schema: BROADCAST_NLE_VAULT_SCHEMA,
		generatedAt: new Date().toISOString(),
		config: auditResult?.config || BROADCAST_NLE_DEFAULT_CONFIG,
		summary: auditResult?.summary || {},
		clusters: (auditResult?.clusters || []).map(cluster => ({
			id: cluster.id,
			name: cluster.name,
			clipStem: cluster.clipStem,
			family: cluster.family,
			clusterVerdict: cluster.clusterVerdict,
			unitBytes: cluster.unitBytes,
			totalBytes: cluster.totalBytes,
			reclaimableBytes: cluster.reclaimableBytes,
			survivorPath: cluster.survivorPath,
			hasCameraOriginal: cluster.hasCameraOriginal,
			hasProjectTimeline: cluster.hasProjectTimeline,
			hasMasterExport: cluster.hasMasterExport,
			hasDuplicateCardOffload: cluster.hasDuplicateCardOffload,
			hasRegenerableProxy: cluster.hasRegenerableProxy,
			hasVerifiedOcfAnchor: cluster.hasVerifiedOcfAnchor,
			cardSignatures: cluster.cardSignatures,
			members: (cluster.members || []).map(member => ({
				path: member.normalized,
				artifactKind: member.artifactKind,
				offloadRole: member.offloadRole,
				cardSignature: member.cardSignature || '',
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
 * Generate a Nextcloud/rsync .sync-exclude.lst rule set for regenerable NLE proxies,
 * DaVinci Resolve / Premiere / FCPX render caches, peak files, and autosaves.
 *
 * @return {string} Line-delimited .sync-exclude.lst rules.
 */
export function buildBroadcastNleSyncExcludeList() {
	return [
		'# Nextcloud / rsync exclusion rules for NLE Proxies, Render Caches & Peak Files',
		'Proxy/',
		'Proxies/',
		'Optimized Media/',
		'CacheClip/',
		'Render Files/',
		'Transcoded Media/',
		'Adobe Premiere Pro Video Previews/',
		'Adobe Premiere Pro Audio Previews/',
		'Adobe Premiere Pro Auto-Save/',
		'Resolve Project Backups/',
		'Media Cache/',
		'Media Cache Files/',
		'Peak Files/',
		'.resolve_cache/',
		'*.pek',
		'*.cfa',
		'*.ims',
		'*.dvcc',
	].join('\n')
}
