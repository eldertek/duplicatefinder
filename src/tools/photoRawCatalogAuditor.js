/**
 * Pure RAW Photography Catalog, Lightroom/Capture One Preview Pyramid, Sidecar & Export Derivative Auditor.
 * Classifies and audits duplicate clusters across 4 photography and catalog domain families:
 * - Camera RAW Masters (.cr3, .cr2, .nef, .arw, .raf, .orf, .rw2, .dng, .pef, .srw in RAW-Masters/ or Selects-Picked/)
 * - Catalog Preview Pyramids (Previews.lrdata/, Smart Previews.lrdata/, .lrcat-wal, .cos, .cot, *.thumbnail.jpg)
 * - Developed JPEG & Export Twins (_export, _web_2048px, _instagram, _print, or .jpg/.heic/.tif sharing shotLineageStem with a RAW master)
 * - Sidecar Metadata Files (.xmp, .dop, .pp3, .acr)
 *
 * Assigns 5 governance tiers:
 * - raw-selects-vault (RAW-Masters / Selects-Picked canonical vault copy; strictly protected by default)
 * - camera-raw-original (Camera RAW original master outside staging bloat; strictly protected by default)
 * - sidecar-edit-origin (Non-destructive edit sidecar .xmp/.dop/.pp3/.acr; strictly protected by default)
 * - export-social-derivative (Developed JPEG/HEIC/TIFF export twin; deletion blocked if no verified RAW master is conserved)
 * - preview-thumbnail-cache (Lightroom/Capture One preview pyramid, WAL journal, thumbnail cache)
 *
 * Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const PHOTO_RAW_CATALOG_SCHEMA = 'duplicatefinder.photo-raw-catalog-auditor.v1'

export const PHOTO_RAW_CATALOG_FAMILIES = Object.freeze([
	'all',
	'camera-raw-masters',
	'catalog-preview-pyramids',
	'developed-jpeg-export-twins',
	'sidecar-metadata-files',
])

export const PHOTO_RAW_CATALOG_FAMILY_META = Object.freeze({
	'camera-raw-masters': {
		id: 'camera-raw-masters',
		label: 'Camera RAW Masters',
		shortLabel: 'RAW (.cr3/.cr2/.nef/.arw/.raf/.orf/.rw2/.dng/.pef/.srw)',
	},
	'catalog-preview-pyramids': {
		id: 'catalog-preview-pyramids',
		label: 'Catalog Preview Pyramids',
		shortLabel: 'Previews (Previews.lrdata/Smart Previews.lrdata/.lrcat-wal/.cos/.cot/*.thumbnail.jpg)',
	},
	'developed-jpeg-export-twins': {
		id: 'developed-jpeg-export-twins',
		label: 'Developed JPEG & Export Twins',
		shortLabel: 'Exports (_export/_web_2048px/_instagram/_print/.jpg/.heic/.tif)',
	},
	'sidecar-metadata-files': {
		id: 'sidecar-metadata-files',
		label: 'Sidecar Edit Metadata',
		shortLabel: 'Sidecars (.xmp/.dop/.pp3/.acr)',
	},
})

export const PHOTO_RAW_CATALOG_STRATEGIES = Object.freeze([
	'consolidate-raw-selects',
	'prune-catalog-preview-pyramids',
	'prune-web-exports-when-raw-verified',
])

export const PHOTO_RAW_CATALOG_SURVIVOR_RULES = Object.freeze([
	'raw-vault-and-sidecar-first',
	'camera-raw-original-first',
	'sidecar-edit-first',
	'newest-shoot-first',
	'shortest-path',
])

export const PHOTO_RAW_CATALOG_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'raw-vault',
	'camera-raw',
	'sidecar-origin',
	'export-twin',
	'preview-cache',
	'shielded',
])

export const PHOTO_RAW_CATALOG_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const PHOTO_RAW_CATALOG_PRESETS = Object.freeze([
	{
		id: 'all-photo-raw-catalog-audit',
		name: 'All RAW, Previews, Sidecars & Exports Audit',
		description: 'Audit camera RAW masters, Lightroom/Capture One preview pyramids, developed JPEG/HEIC/TIFF exports, and XMP/DOP/PP3/ACR sidecars while shielding RAW selects, RAW originals, and sidecar edit origins.',
		familyFilter: 'all',
		strategy: 'consolidate-raw-selects',
		survivorRule: 'raw-vault-and-sidecar-first',
		protectRawSelectsVault: true,
		protectCameraRawOriginal: true,
		protectSidecarEditOrigin: true,
		keepRecentPreviews: 2,
		staleCacheDays: 30,
		minSizeMb: 0,
	},
	{
		id: 'consolidate-raw-selects-vault',
		name: 'Consolidate RAW-Masters & Selects-Picked',
		description: 'Keep canonical RAW masters in RAW-Masters/ or Selects-Picked/ and consolidate stray copies from Downloads or staging folders.',
		familyFilter: 'camera-raw-masters',
		strategy: 'consolidate-raw-selects',
		survivorRule: 'raw-vault-and-sidecar-first',
		protectRawSelectsVault: true,
		protectCameraRawOriginal: true,
		protectSidecarEditOrigin: true,
		keepRecentPreviews: 2,
		staleCacheDays: 30,
		minSizeMb: 0,
	},
	{
		id: 'prune-catalog-preview-pyramids',
		name: 'Prune Stale Preview Pyramids & Caches',
		description: 'Reclaim stale Previews.lrdata, Smart Previews.lrdata, .lrcat-wal, .cos, .cot, and *.thumbnail.jpg caches older than threshold while keeping RAW and sidecars untouched.',
		familyFilter: 'catalog-preview-pyramids',
		strategy: 'prune-catalog-preview-pyramids',
		survivorRule: 'newest-shoot-first',
		protectRawSelectsVault: true,
		protectCameraRawOriginal: true,
		protectSidecarEditOrigin: true,
		keepRecentPreviews: 2,
		staleCacheDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'prune-web-exports-raw-verified',
		name: 'Prune Web/Social Exports When RAW Verified',
		description: 'Reclaim _export, _web_2048px, _instagram, and _print JPEG/HEIC/TIFF twins only when a verified RAW master sharing shotLineageStem is conserved.',
		familyFilter: 'developed-jpeg-export-twins',
		strategy: 'prune-web-exports-when-raw-verified',
		survivorRule: 'camera-raw-original-first',
		protectRawSelectsVault: true,
		protectCameraRawOriginal: true,
		protectSidecarEditOrigin: true,
		keepRecentPreviews: 2,
		staleCacheDays: 30,
		minSizeMb: 0,
	},
	{
		id: 'sidecar-edit-origin-shield',
		name: 'Sidecar Edit Origin Integrity Shield',
		description: 'Audit .xmp, .dop, .pp3, and .acr edit metadata files while strictly protecting edit origins against accidental pruning.',
		familyFilter: 'sidecar-metadata-files',
		strategy: 'consolidate-raw-selects',
		survivorRule: 'sidecar-edit-first',
		protectRawSelectsVault: true,
		protectCameraRawOriginal: true,
		protectSidecarEditOrigin: true,
		keepRecentPreviews: 2,
		staleCacheDays: 30,
		minSizeMb: 0,
	},
])

const CAMERA_RAW_EXT_SET = new Set(['cr3', 'cr2', 'nef', 'arw', 'raf', 'orf', 'rw2', 'dng', 'pef', 'srw'])
const PREVIEW_CACHE_EXT_SET = new Set(['lrcat-wal', 'cos', 'cot', 'thumbnail.jpg', 'thumbnail.jpeg', 'lrprev'])
const SIDECAR_EXT_SET = new Set(['xmp', 'dop', 'pp3', 'acr'])
const DEVELOPED_IMAGE_EXT_SET = new Set(['jpg', 'jpeg', 'heic', 'tif', 'tiff'])

const RAW_SELECTS_VAULT_PATH_RE = /(\/(?:raw[-_ ]?masters?|selects[-_ ]?picked|picked[-_ ]?selects?|selects|master[-_ ]?raws?|camera[-_ ]?originals?)(?:\/|$)|\/__groupfolders\/\d+\/(?:raw[-_ ]?masters?|selects[-_ ]?picked|photo[-_ ]?vault))/i
const PREVIEW_PYRAMID_DIR_RE = /(\/(?:previews\.lrdata|smart[-_ ]?previews\.lrdata|[^/]+\.lrdata|captureone\/cache\/thumbnails|captureone\/settings\d*|thumbnails?)(?:\/|$))/i
const DEVELOPED_EXPORT_DIR_RE = /(\/(?:exports?|developed[-_ ]?exports?|web[-_ ]?exports?|instagram[-_ ]?exports?|print[-_ ]?exports?|social[-_ ]?exports?|deliverables?)(?:\/|$))/i
const STAGING_BLOAT_PATH_RE = /(\/downloads\/|\/telechargements\/|\/tmp\/|\/temp\/|\/scratch\/|\/incoming\/|\/staging\/|\/wetransfer\/|\/airdrop\/)/i

const EXPORT_MARKER_RE = /(?:^|[_\-.\s])(export|web(?:_\d+px)?|web_2048px|instagram|print|ig|social|delivery|resized|srgb)(?=$|[_\-.\s])/i
const LINEAGE_STRIP_TAG_RE = /(?:^|[_\-.\s])(export|web(?:_\d+px)?|web_2048px|instagram|print|ig|social|delivery|resized|srgb|select|picked|master|raw|orig|original|edit|graded|v\d+(?:\.\d+)?|rev\d+|r\d+|final|draft|tmp|thumbnail)(?=$|[_\-.\s])/gi
const TRAILING_RAW_EXT_RE = /\.(cr3|cr2|nef|arw|raf|orf|rw2|dng|pef|srw)$/i
const COPY_SUFFIX_RE = /\s-\s?copy(?:\s*\(\d+\))?|\s*\(\d+\)|_copy\b|\[\d{4}-\d{2}-\d{2}[^\]]*\]/gi

const TIER_LABELS = Object.freeze({
	'raw-selects-vault': 'RAW Selects Vault',
	'camera-raw-original': 'Camera RAW Original',
	'sidecar-edit-origin': 'Sidecar Edit Origin',
	'export-social-derivative': 'Developed Export Twin',
	'preview-thumbnail-cache': 'Catalog Preview Cache',
})

const TIER_AUTHORITY = Object.freeze({
	'raw-selects-vault': 99,
	'camera-raw-original': 96,
	'sidecar-edit-origin': 92,
	'export-social-derivative': 38,
	'preview-thumbnail-cache': 14,
})

const VERDICT_LABELS = Object.freeze({
	'keep-canonical-survivor': 'Keep Canonical Photo Anchor',
	'consolidate-to-raw-vault': 'Consolidate to RAW / Catalog Anchor',
	'reclaim-catalog-preview-pyramid': 'Prune Stale Preview Pyramid / Cache',
	'reclaim-verified-web-export': 'Prune Verified Export Twin',
	'blocked-raw-selects-vault': 'Blocked: RAW Selects Vault Guard',
	'blocked-camera-raw-original': 'Blocked: Camera RAW Original Guard',
	'blocked-sidecar-edit-origin': 'Blocked: Sidecar Edit Origin Guard',
	'blocked-unverified-raw-master': 'Blocked: No Verified RAW Master Conserved',
	'blocked-not-preview-pyramid': 'Shielded: Non-Preview Catalog Asset',
	'blocked-not-developed-export': 'Shielded: Non-Export Photo Asset',
	'blocked-fresh-preview-cache': 'Shielded: Recent Preview Cache',
	'blocked-manual-shield': 'Blocked: Operator Shield',
	excluded: 'Excluded by Operator',
})

const FAMILY_PRIORITY = Object.freeze({
	'camera-raw-masters': 4,
	'sidecar-metadata-files': 3,
	'developed-jpeg-export-twins': 2,
	'catalog-preview-pyramids': 1,
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
 * Extract compound or single lowercase extension without leading dot.
 *
 * @param {string} lowerBase Lowercase basename.
 * @return {string} Extension string or empty string.
 */
function extractCompoundExtension(lowerBase) {
	for (const compound of ['thumbnail.jpeg', 'thumbnail.jpg']) {
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
 * Normalize a shot or photo stem into a canonical shotLineageStem.
 *
 * @param {string} rawStem Raw stem without extension.
 * @return {string} Clean canonical shotLineageStem.
 */
function normalizeShotLineageStem(rawStem) {
	let stem = String(rawStem || '')
		.replace(COPY_SUFFIX_RE, '')
		.replace(TRAILING_RAW_EXT_RE, '')
		.trim()

	let prev
	do {
		prev = stem
		stem = stem.replace(LINEAGE_STRIP_TAG_RE, '')
	} while (stem !== prev)

	stem = stem
		.replace(/[-_.\s]{2,}/g, '_')
		.replace(/^[\s_.-]+|[\s_.-]+$/g, '')

	return stem || String(rawStem || '').replace(COPY_SUFFIX_RE, '').replace(TRAILING_RAW_EXT_RE, '').trim()
}

/**
 * Parse camera RAW, Lightroom/Capture One preview pyramid, sidecar, and developed export metadata.
 *
 * @param {string} basename File basename.
 * @param {string} [normalizedPath=''] Normalized file path.
 * @return {object} Parsed shotLineageStem, tags, format flags, and governance cues.
 */
export function parsePhotoRawArtifactInfo(basename, normalizedPath = '') {
	const rawBase = String(basename || '')
	const lowerBase = rawBase.toLowerCase()
	const lowerPath = String(normalizedPath || '').toLowerCase()

	const ext = extractCompoundExtension(lowerBase)
	let rawStem = rawBase
	if (ext && lowerBase.endsWith(`.${ext}`)) {
		rawStem = rawBase.slice(0, rawBase.length - ext.length - 1)
	}
	const cleanRawStem = rawStem.replace(COPY_SUFFIX_RE, '').trim() || rawStem

	const isRawSelectsPath = RAW_SELECTS_VAULT_PATH_RE.test(lowerPath)
	const isPreviewPyramidPath = PREVIEW_PYRAMID_DIR_RE.test(lowerPath)
	const isDevelopedExportPath = DEVELOPED_EXPORT_DIR_RE.test(lowerPath)
	const isStagingBloatPath = STAGING_BLOAT_PATH_RE.test(lowerPath)

	const isCameraRawExt = CAMERA_RAW_EXT_SET.has(ext)
	const isPreviewCacheExt = PREVIEW_CACHE_EXT_SET.has(ext)
	const isSidecarExt = SIDECAR_EXT_SET.has(ext)
	const isDevelopedImageExt = DEVELOPED_IMAGE_EXT_SET.has(ext)

	const hasExportMarker = EXPORT_MARKER_RE.test(cleanRawStem)

	const isCatalogPreviewPyramid = Boolean(
		isPreviewCacheExt
		|| isPreviewPyramidPath
	)
	const isCameraRawCandidate = !isCatalogPreviewPyramid && isCameraRawExt
	const isSidecarCandidate = !isCatalogPreviewPyramid && isSidecarExt
	const isDevelopedExportCandidate = Boolean(
		!isCatalogPreviewPyramid
		&& !isCameraRawCandidate
		&& !isSidecarCandidate
		&& isDevelopedImageExt
		&& (hasExportMarker || isDevelopedExportPath)
	)
	const isGenericDevelopedImage = Boolean(
		!isCatalogPreviewPyramid
		&& !isCameraRawCandidate
		&& !isSidecarCandidate
		&& !isDevelopedExportCandidate
		&& isDevelopedImageExt
	)

	const shotLineageStem = normalizeShotLineageStem(cleanRawStem) || cleanRawStem || rawBase

	const artifactTags = []
	const pushTag = tag => {
		const norm = String(tag || '').trim()
		if (norm && !artifactTags.includes(norm)) {
			artifactTags.push(norm)
		}
	}

	if (isCameraRawCandidate) {
		pushTag(`raw:${ext}`)
		if (isRawSelectsPath) {
			pushTag('raw-selects-vault')
		}
	}
	if (isSidecarCandidate) {
		pushTag(`sidecar:${ext}`)
	}
	if (isCatalogPreviewPyramid) {
		if (lowerPath.includes('smart previews.lrdata') || lowerPath.includes('smart_previews.lrdata') || lowerPath.includes('smart-previews.lrdata')) {
			pushTag('smart-previews.lrdata')
		} else if (lowerPath.includes('previews.lrdata')) {
			pushTag('previews.lrdata')
		} else if (ext) {
			pushTag(`preview:${ext}`)
		}
	}
	if (isDevelopedExportCandidate || isGenericDevelopedImage) {
		if (hasExportMarker) {
			const exportMatch = cleanRawStem.match(EXPORT_MARKER_RE)
			pushTag(exportMatch && exportMatch[1] ? `export:${exportMatch[1].toLowerCase()}` : `export:${ext}`)
		} else if (ext) {
			pushTag(`developed:${ext}`)
		}
	}

	return {
		rawStem: cleanRawStem,
		shotLineageStem,
		extension: ext,
		artifactTags,
		artifactTag: artifactTags.length > 0 ? artifactTags.join(', ') : 'none',
		isRawSelectsPath,
		isPreviewPyramidPath,
		isDevelopedExportPath,
		isStagingBloatPath,
		isCameraRawExt,
		isPreviewCacheExt,
		isSidecarExt,
		isDevelopedImageExt,
		hasExportMarker,
		isCatalogPreviewPyramid,
		isCameraRawCandidate,
		isSidecarCandidate,
		isDevelopedExportCandidate,
		isGenericDevelopedImage,
	}
}

/**
 * Build dataset-wide lineage hints for conserved camera RAW masters.
 * Respects operator exclude overrides so excluded RAW masters are not counted as conserved.
 *
 * @param {Array<object>} duplicates Loaded duplicate groups.
 * @param {object} [memberOverrides={}] Operator member overrides keyed by selectionKey.
 * @return {object} Dataset RAW master conservation hints.
 */
function buildDatasetPhotoRawHints(duplicates, memberOverrides = {}) {
	const rawMasterStems = new Set()

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
			const info = parsePhotoRawArtifactInfo(extractBasename(normalized), normalized)
			const stemLower = info.shotLineageStem.toLowerCase()
			if (!stemLower) {
				continue
			}

			if (
				!info.isCatalogPreviewPyramid
				&& !info.isStagingBloatPath
				&& (info.isCameraRawCandidate || file.rawMasterVerified === true)
			) {
				rawMasterStems.add(stemLower)
			}
		}
	}

	return {
		rawMasterStems,
	}
}

/**
 * Classify a file path into one of the 4 Photo RAW, Preview Pyramid, Developed Export, and Sidecar families.
 *
 * @param {string} rawPath File path.
 * @param {object} [hints={}] Optional dataset hints (rawMasterStems).
 * @return {object|null} Classification metadata or null for unrelated files.
 */
export function classifyPhotoRawArtifact(rawPath, hints = {}) {
	const normalized = normalizePathForDiff(rawPath) || String(rawPath || '')
	const basename = extractBasename(normalized)
	const lowerBase = basename.toLowerCase()

	if (!lowerBase) {
		return null
	}

	const info = parsePhotoRawArtifactInfo(basename, normalized)

	if (info.isCatalogPreviewPyramid) {
		return {
			matched: true,
			family: 'catalog-preview-pyramids',
			familyLabel: PHOTO_RAW_CATALOG_FAMILY_META['catalog-preview-pyramids'].label,
			...info,
		}
	}

	if (info.isCameraRawCandidate) {
		return {
			matched: true,
			family: 'camera-raw-masters',
			familyLabel: PHOTO_RAW_CATALOG_FAMILY_META['camera-raw-masters'].label,
			...info,
		}
	}

	if (info.isSidecarCandidate) {
		return {
			matched: true,
			family: 'sidecar-metadata-files',
			familyLabel: PHOTO_RAW_CATALOG_FAMILY_META['sidecar-metadata-files'].label,
			...info,
		}
	}

	const stemLower = info.shotLineageStem.toLowerCase()
	const matchesDatasetRawStem = Boolean(
		info.isGenericDevelopedImage
		&& stemLower
		&& hints.rawMasterStems
		&& hints.rawMasterStems.has(stemLower)
	)

	if (info.isDevelopedExportCandidate || matchesDatasetRawStem) {
		return {
			matched: true,
			family: 'developed-jpeg-export-twins',
			familyLabel: PHOTO_RAW_CATALOG_FAMILY_META['developed-jpeg-export-twins'].label,
			...info,
			isDevelopedExportCandidate: true,
		}
	}

	return null
}

/**
 * Inspect governance tier, verified RAW master conservation, and authority context for a cluster member.
 *
 * @param {object} file Duplicate file entry.
 * @param {object} classification Classification metadata.
 * @param {number} referenceTimeSec Reference epoch seconds.
 * @param {object} options Normalized options (keepRecentPreviews, staleCacheDays).
 * @param {object} [clusterHints={}] Dataset and cluster RAW verification hints.
 * @return {object} Member governance and verification context.
 */
export function inspectPhotoRawMemberContext(file, classification, referenceTimeSec, options, clusterHints = {}) {
	const normalizedPath = normalizePathForDiff(file && file.path) || String((file && file.path) || '')
	const basename = extractBasename(normalizedPath)
	const parsed = parsePhotoRawArtifactInfo(basename, normalizedPath)
	const mtimeSec = getFileMtimeSeconds(file)
	const ageDays = mtimeSec !== null && Number.isFinite(referenceTimeSec)
		? Math.max(0, Math.floor((referenceTimeSec - mtimeSec) / 86400))
		: null

	const isPreviewThumbnailCache = Boolean(
		parsed.isCatalogPreviewPyramid
		|| classification.family === 'catalog-preview-pyramids'
	)

	const isRawSelectsVault = Boolean(
		!isPreviewThumbnailCache
		&& !parsed.isStagingBloatPath
		&& parsed.isCameraRawCandidate
		&& (parsed.isRawSelectsPath || (file && file.isRawSelectsVault === true))
	)

	const isCameraRawOriginal = Boolean(
		!isPreviewThumbnailCache
		&& !parsed.isStagingBloatPath
		&& (parsed.isCameraRawCandidate || (file && file.rawMasterVerified === true))
	)

	const isSidecarEditOrigin = Boolean(
		!isPreviewThumbnailCache
		&& !parsed.isStagingBloatPath
		&& parsed.isSidecarCandidate
	)

	const stemLower = parsed.shotLineageStem.toLowerCase()
	const hasVerifiedRawMaster = Boolean(
		isCameraRawOriginal
		|| isRawSelectsVault
		|| (file && file.rawMasterVerified === true)
		|| clusterHints.clusterHasConservedRawMaster
		|| (stemLower && clusterHints.rawMasterStems && clusterHints.rawMasterStems.has(stemLower))
	)

	const isDevelopedExportTwin = Boolean(
		!isPreviewThumbnailCache
		&& !isCameraRawOriginal
		&& !isSidecarEditOrigin
		&& (
			parsed.isDevelopedExportCandidate
			|| (parsed.isGenericDevelopedImage && (hasVerifiedRawMaster || classification.family === 'developed-jpeg-export-twins'))
		)
	)

	const isStalePreviewCache = Boolean(
		isPreviewThumbnailCache
		&& (ageDays === null || ageDays >= options.staleCacheDays)
	)

	let tier = 'preview-thumbnail-cache'
	if (isRawSelectsVault) {
		tier = 'raw-selects-vault'
	} else if (isCameraRawOriginal) {
		tier = 'camera-raw-original'
	} else if (isSidecarEditOrigin) {
		tier = 'sidecar-edit-origin'
	} else if (isDevelopedExportTwin) {
		tier = 'export-social-derivative'
	} else {
		tier = 'preview-thumbnail-cache'
	}

	let authorityScore = TIER_AUTHORITY[tier] || 30
	if (parsed.isCameraRawCandidate && parsed.isRawSelectsPath) {
		authorityScore = 99
	}
	if (parsed.isSidecarCandidate && parsed.isRawSelectsPath) {
		authorityScore += 2
	}
	if (parsed.isStagingBloatPath) {
		authorityScore -= 18
	}
	if (isStalePreviewCache) {
		authorityScore -= 6
	}

	return {
		tier,
		tierLabel: TIER_LABELS[tier] || TIER_LABELS['preview-thumbnail-cache'],
		authorityScore,
		extension: parsed.extension || classification.extension || '',
		rawStem: parsed.rawStem,
		shotLineageStem: parsed.shotLineageStem,
		artifactTags: parsed.artifactTags,
		artifactTag: parsed.artifactTag,
		isRawSelectsVault,
		isCameraRawOriginal,
		isSidecarEditOrigin,
		isDevelopedExportTwin,
		isPreviewThumbnailCache,
		hasVerifiedRawMaster,
		isStalePreviewCache,
		isStagingBloatPath: parsed.isStagingBloatPath,
		mtimeSec,
		ageDays,
	}
}

/**
 * Select the canonical surviving copy inside a photo/catalog duplicate cluster.
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
		if (survivorRule === 'camera-raw-original-first') {
			if (a.context.isCameraRawOriginal !== b.context.isCameraRawOriginal) {
				return a.context.isCameraRawOriginal ? -1 : 1
			}
			if (a.context.authorityScore !== b.context.authorityScore) {
				return b.context.authorityScore - a.context.authorityScore
			}
		} else if (survivorRule === 'sidecar-edit-first') {
			if (a.context.isSidecarEditOrigin !== b.context.isSidecarEditOrigin) {
				return a.context.isSidecarEditOrigin ? -1 : 1
			}
			if (a.context.authorityScore !== b.context.authorityScore) {
				return b.context.authorityScore - a.context.authorityScore
			}
		} else if (survivorRule === 'newest-shoot-first') {
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
 * Determine the deterministic audit verdict for a photo/catalog cluster member.
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
			note: 'Excluded from RAW photography and catalog audit actions by manual operator override.',
		}
	}

	if (survivor && member.selectionKey === survivor.selectionKey) {
		return {
			verdict: 'keep-canonical-survivor',
			verdictLabel: VERDICT_LABELS['keep-canonical-survivor'],
			actionKind: 'keep',
			note: `Canonical ${member.context.tierLabel} copy retained as the authoritative photography anchor.`,
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

	if (options.protectRawSelectsVault && member.context.isRawSelectsVault) {
		return {
			verdict: 'blocked-raw-selects-vault',
			verdictLabel: VERDICT_LABELS['blocked-raw-selects-vault'],
			actionKind: 'shield',
			note: 'Strictly protected by RAW Selects Vault Guard; RAW-Masters and Selects-Picked originals are never pruned automatically.',
		}
	}

	if (options.protectCameraRawOriginal && member.context.isCameraRawOriginal) {
		return {
			verdict: 'blocked-camera-raw-original',
			verdictLabel: VERDICT_LABELS['blocked-camera-raw-original'],
			actionKind: 'shield',
			note: 'Strictly protected by Camera RAW Original Guard; camera RAW masters are conserved.',
		}
	}

	if (options.protectSidecarEditOrigin && member.context.isSidecarEditOrigin) {
		return {
			verdict: 'blocked-sidecar-edit-origin',
			verdictLabel: VERDICT_LABELS['blocked-sidecar-edit-origin'],
			actionKind: 'shield',
			note: 'Strictly protected by Sidecar Edit Origin Guard; .xmp, .dop, .pp3, and .acr edit instructions are conserved.',
		}
	}

	if (options.strategy === 'prune-catalog-preview-pyramids') {
		if (!member.context.isPreviewThumbnailCache) {
			return {
				verdict: 'blocked-not-preview-pyramid',
				verdictLabel: VERDICT_LABELS['blocked-not-preview-pyramid'],
				actionKind: 'shield',
				note: 'Shielded by Catalog Preview Pyramid Pruner because member is not a Lightroom/Capture One preview pyramid, WAL, or thumbnail cache.',
			}
		}
		if (!member.context.isStalePreviewCache) {
			return {
				verdict: 'blocked-fresh-preview-cache',
				verdictLabel: VERDICT_LABELS['blocked-fresh-preview-cache'],
				actionKind: 'shield',
				note: `Shielded because preview cache age is below stale threshold (${options.staleCacheDays}d).`,
			}
		}
		return {
			verdict: 'reclaim-catalog-preview-pyramid',
			verdictLabel: VERDICT_LABELS['reclaim-catalog-preview-pyramid'],
			actionKind: 'reclaim',
			note: 'Stale Lightroom/Capture One preview pyramid, .lrcat-wal, .cos/.cot, or *.thumbnail.jpg cache safe to prune after SHA-256 verification.',
		}
	}

	if (options.strategy === 'prune-web-exports-when-raw-verified') {
		if (!member.context.isDevelopedExportTwin) {
			return {
				verdict: 'blocked-not-developed-export',
				verdictLabel: VERDICT_LABELS['blocked-not-developed-export'],
				actionKind: 'shield',
				note: 'Shielded by Web Export Pruner because member is not a developed JPEG/HEIC/TIFF export twin.',
			}
		}
		if (!member.context.hasVerifiedRawMaster) {
			return {
				verdict: 'blocked-unverified-raw-master',
				verdictLabel: VERDICT_LABELS['blocked-unverified-raw-master'],
				actionKind: 'shield',
				note: 'Blocked because no verified camera RAW master sharing this shotLineageStem is conserved.',
			}
		}
		return {
			verdict: 'reclaim-verified-web-export',
			verdictLabel: VERDICT_LABELS['reclaim-verified-web-export'],
			actionKind: 'reclaim',
			note: 'Developed JPEG/HEIC/TIFF export twin whose camera RAW master is verified and conserved; safe to prune after SHA-256 verification.',
		}
	}

	if (member.context.isDevelopedExportTwin && !member.context.hasVerifiedRawMaster) {
		return {
			verdict: 'blocked-unverified-raw-master',
			verdictLabel: VERDICT_LABELS['blocked-unverified-raw-master'],
			actionKind: 'shield',
			note: 'Blocked because no verified camera RAW master sharing this shotLineageStem is conserved.',
		}
	}

	if (member.context.isPreviewThumbnailCache) {
		if (!member.context.isStalePreviewCache) {
			return {
				verdict: 'blocked-fresh-preview-cache',
				verdictLabel: VERDICT_LABELS['blocked-fresh-preview-cache'],
				actionKind: 'shield',
				note: `Shielded because preview cache age is below stale threshold (${options.staleCacheDays}d).`,
			}
		}
		return {
			verdict: 'reclaim-catalog-preview-pyramid',
			verdictLabel: VERDICT_LABELS['reclaim-catalog-preview-pyramid'],
			actionKind: 'reclaim',
			note: 'Stale Lightroom/Capture One preview pyramid, .lrcat-wal, .cos/.cot, or *.thumbnail.jpg cache safe to prune after SHA-256 verification.',
		}
	}

	return {
		verdict: 'consolidate-to-raw-vault',
		verdictLabel: VERDICT_LABELS['consolidate-to-raw-vault'],
		actionKind: 'consolidate',
		note: 'Consolidate identical-hash copy against canonical RAW Selects Vault, Camera RAW Original, or Sidecar Edit anchor using SHA-256 and stat device checks.',
	}
}

/**
 * Normalize Photo RAW Catalog auditor options into deterministic bounds.
 *
 * @param {object} [rawOptions] Caller options.
 * @return {object} Normalized options.
 */
function normalizeOptions(rawOptions = {}) {
	const familyFilter = PHOTO_RAW_CATALOG_FAMILIES.includes(rawOptions.familyFilter)
		? rawOptions.familyFilter
		: 'all'
	const verdictFilter = PHOTO_RAW_CATALOG_VERDICT_FILTERS.includes(rawOptions.verdictFilter)
		? rawOptions.verdictFilter
		: 'all'
	const sortMode = PHOTO_RAW_CATALOG_SORT_MODES.includes(rawOptions.sortMode)
		? rawOptions.sortMode
		: 'reclaim_desc'
	const strategy = PHOTO_RAW_CATALOG_STRATEGIES.includes(rawOptions.strategy)
		? rawOptions.strategy
		: 'consolidate-raw-selects'
	const survivorRule = PHOTO_RAW_CATALOG_SURVIVOR_RULES.includes(rawOptions.survivorRule)
		? rawOptions.survivorRule
		: 'raw-vault-and-sidecar-first'

	const parsedKeep = Number.parseInt(rawOptions.keepRecentPreviews, 10)
	const keepRecentPreviews = Number.isFinite(parsedKeep) && parsedKeep >= 1
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
		protectRawSelectsVault: rawOptions.protectRawSelectsVault !== false,
		protectCameraRawOriginal: rawOptions.protectCameraRawOriginal !== false,
		protectSidecarEditOrigin: rawOptions.protectSidecarEditOrigin !== false,
		keepRecentPreviews,
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
 * Audit duplicate groups for RAW Photography Catalogs, Preview Pyramids, Sidecars & Developed Exports.
 *
 * @param {Array<object>} duplicates Loaded duplicate groups.
 * @param {object} [rawOptions] Auditor configuration options.
 * @return {object} Deterministic audit analysis with summary, counts, and clusters.
 */
export function analyzePhotoRawCatalogDuplicates(duplicates, rawOptions = {}) {
	const options = normalizeOptions(rawOptions)
	const safeDuplicates = Array.isArray(duplicates) ? duplicates : []
	const minSizeBytes = options.minSizeMb * 1024 * 1024

	const datasetHints = buildDatasetPhotoRawHints(safeDuplicates, options.memberOverrides)

	const familyCounts = {
		all: 0,
		'camera-raw-masters': 0,
		'catalog-preview-pyramids': 0,
		'developed-jpeg-export-twins': 0,
		'sidecar-metadata-files': 0,
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
			const info = classifyPhotoRawArtifact(file.path, datasetHints)
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

		const clusterHasConservedRawMaster = validFiles.some((file, fileIdx) => {
			const selectionKey = String(getFileSelectionKey(file) ?? `${groupIdx}-${fileIdx}`)
			if (options.memberOverrides[selectionKey] === 'exclude') {
				return false
			}
			const normalized = normalizePathForDiff(file.path) || String(file.path || '')
			const parsed = parsePhotoRawArtifactInfo(extractBasename(normalized), normalized)
			return Boolean(
				!parsed.isCatalogPreviewPyramid
				&& !parsed.isStagingBloatPath
				&& (parsed.isCameraRawCandidate || file.rawMasterVerified === true)
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

			const directInfo = classifyPhotoRawArtifact(file.path, datasetHints)
			const memberInfo = directInfo && directInfo.matched ? directInfo : primaryInfo
			const context = inspectPhotoRawMemberContext(
				file,
				memberInfo,
				options.referenceTimeSec,
				options,
				{
					...datasetHints,
					clusterHasConservedRawMaster,
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
		const rawVaultCopiesCount = members.filter(m => m.context.isRawSelectsVault).length
		const cameraRawCopiesCount = members.filter(m => m.context.isCameraRawOriginal).length
		const sidecarCopiesCount = members.filter(m => m.context.isSidecarEditOrigin).length
		const exportTwinCopiesCount = members.filter(m => m.context.isDevelopedExportTwin).length
		const previewCacheCopiesCount = members.filter(m => m.context.isPreviewThumbnailCache).length

		const hasRawSelectsVault = rawVaultCopiesCount > 0
		const hasCameraRawOriginal = cameraRawCopiesCount > 0
		const hasSidecarEditOrigin = sidecarCopiesCount > 0
		const hasDevelopedExportTwin = exportTwinCopiesCount > 0
		const hasPreviewThumbnailCache = previewCacheCopiesCount > 0

		let clusterRiskState = 'reclaimable'
		if (members.some(m => m.verdict === 'blocked-unverified-raw-master')) {
			clusterRiskState = 'unverified-raw'
		} else if (members.some(m => m.verdict === 'blocked-raw-selects-vault')) {
			clusterRiskState = 'raw-vault'
		} else if (members.some(m => m.verdict === 'blocked-camera-raw-original')) {
			clusterRiskState = 'camera-raw'
		} else if (members.some(m => m.verdict === 'blocked-sidecar-edit-origin')) {
			clusterRiskState = 'sidecar-origin'
		} else if (hasDevelopedExportTwin && reclaimableCopiesCount > 0) {
			clusterRiskState = 'raw-verified'
		} else if (hasPreviewThumbnailCache && reclaimableCopiesCount > 0) {
			clusterRiskState = 'reclaimable'
		} else if (reclaimableCopiesCount === 0) {
			clusterRiskState = 'shielded'
		}

		const primaryGroupId = group.id ?? null
		const groupKey = String(group.hash || primaryGroupId || `photo-raw-catalog-${groupIdx}`)
		const displayName = survivor ? survivor.basename : members[0].basename
		const governanceSignals = Array.from(new Set(members.map(m => m.tier)))
		const allArtifactTags = Array.from(new Set(members.flatMap(m => m.context.artifactTags)))

		rawClusters.push({
			groupKey,
			primaryGroupId,
			hash: group.hash || '',
			displayName,
			basename: displayName,
			shotLineageStem: survivor ? survivor.context.shotLineageStem : primaryInfo.shotLineageStem,
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
			rawVaultCopiesCount,
			cameraRawCopiesCount,
			sidecarCopiesCount,
			exportTwinCopiesCount,
			previewCacheCopiesCount,
			hasRawSelectsVault,
			hasCameraRawOriginal,
			hasSidecarEditOrigin,
			hasDevelopedExportTwin,
			hasPreviewThumbnailCache,
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
			|| cluster.shotLineageStem.toLowerCase().includes(q)
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
		if (options.verdictFilter === 'raw-vault' && !cluster.hasRawSelectsVault) {
			return false
		}
		if (options.verdictFilter === 'camera-raw' && !cluster.hasCameraRawOriginal) {
			return false
		}
		if (options.verdictFilter === 'sidecar-origin' && !cluster.hasSidecarEditOrigin) {
			return false
		}
		if (options.verdictFilter === 'export-twin' && !cluster.hasDevelopedExportTwin) {
			return false
		}
		if (options.verdictFilter === 'preview-cache' && !cluster.hasPreviewThumbnailCache) {
			return false
		}
		if (options.verdictFilter === 'shielded' && cluster.shieldedCopiesCount === 0 && cluster.clusterRiskState !== 'shielded') {
			return false
		}
		return true
	})

	clusters.sort((a, b) => {
		if (options.sortMode === 'risk_desc') {
			const riskA = a.rawVaultCopiesCount * 5 + a.cameraRawCopiesCount * 4 + a.sidecarCopiesCount * 3 + a.exportTwinCopiesCount * 2 + a.shieldedCopiesCount
			const riskB = b.rawVaultCopiesCount * 5 + b.cameraRawCopiesCount * 4 + b.sidecarCopiesCount * 3 + b.exportTwinCopiesCount * 2 + b.shieldedCopiesCount
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
	const totalRawVaultClusters = clusters.filter(c => c.hasRawSelectsVault).length
	const totalProtectedRawAndSidecarClusters = clusters.filter(c => c.hasCameraRawOriginal || c.hasSidecarEditOrigin).length
	const totalExportTwinClusters = clusters.filter(c => c.hasDevelopedExportTwin).length
	const totalPreviewCacheClusters = clusters.filter(c => c.hasPreviewThumbnailCache).length
	const efficiencyPct = totalRawDuplicateBytes > 0
		? Math.round((totalReclaimableBytes / totalRawDuplicateBytes) * 100)
		: 0

	return {
		schema: PHOTO_RAW_CATALOG_SCHEMA,
		options: {
			familyFilter: options.familyFilter,
			verdictFilter: options.verdictFilter,
			sortMode: options.sortMode,
			strategy: options.strategy,
			survivorRule: options.survivorRule,
			protectRawSelectsVault: options.protectRawSelectsVault,
			protectCameraRawOriginal: options.protectCameraRawOriginal,
			protectSidecarEditOrigin: options.protectSidecarEditOrigin,
			keepRecentPreviews: options.keepRecentPreviews,
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
			totalRawVaultClusters,
			totalProtectedRawAndSidecarClusters,
			totalExportTwinClusters,
			totalPreviewCacheClusters,
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
 * Build a POSIX DRY_RUN=1 remediation script for RAW Photography Catalogs, Preview Pyramids & Exports.
 *
 * @param {object} analysis Output from analyzePhotoRawCatalogDuplicates.
 * @param {object} [options] Script options.
 * @param {string} [options.dataRoot='/var/www/nextcloud/data'] Nextcloud data root directory.
 * @return {string} POSIX bash script with single-quoted paths, sha256sum -- verification, stat cross-device guard, and DRY_RUN=1 default.
 */
export function buildPhotoRawCatalogScript(analysis, options = {}) {
	const dataRoot = String(options.dataRoot || '/var/www/nextcloud/data').replace(/\/+$/, '') || '/var/www/nextcloud/data'
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const strategy = (analysis && analysis.options && analysis.options.strategy) || 'consolidate-raw-selects'

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
		'# RAW Photography Catalog, Lightroom/Capture One Preview Pyramid, Sidecar & Export Derivative Auditor',
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
		lines.push('echo "No reclaimable or consolidatable preview pyramids, verified web exports, or stray photo copies under current guards."')
		return lines.join('\n')
	}

	lines.push('prune_verified_photo_artifact() {')
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
	lines.push('consolidate_raw_catalog_copy() {')
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
			lines.push(`consolidate_raw_catalog_copy ${escapePosixSingleQuote(op.survivorPath)} ${escapePosixSingleQuote(op.targetPath)}`)
		} else {
			lines.push(`prune_verified_photo_artifact ${escapePosixSingleQuote(op.survivorPath)} ${escapePosixSingleQuote(op.targetPath)}`)
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
 * Build a Nextcloud Desktop .sync-exclude.lst snippet for Lightroom/Capture One preview pyramids and OS temp caches.
 *
 * @param {object} analysis Output from analyzePhotoRawCatalogDuplicates.
 * @return {string} Newline-delimited Nextcloud sync-exclude patterns.
 */
export function buildPhotoRawCatalogSyncExcludeSnippet(analysis) {
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const lines = [
		'# Nextcloud Desktop .sync-exclude.lst rules for Lightroom/Capture One preview pyramids & temp caches',
		'*.lrdata/',
		'*.lrcat-wal',
		'*.tmp',
		'Thumbs.db',
		'*.lrcat-shm',
		'*.lrprev',
		'*.thumbnail.jpg',
	]
	const seen = new Set(lines)
	for (const cluster of clusters) {
		if (cluster && (cluster.extension === 'cos' || cluster.extension === 'cot') && !seen.has('*.cot')) {
			lines.push('*.cot')
			seen.add('*.cot')
		}
	}
	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe CSV audit report for RAW Photography Catalogs & Previews.
 *
 * @param {object} analysis Output from analyzePhotoRawCatalogDuplicates.
 * @return {string} RFC-4180 CSV string with CWE-1236 formula escaping.
 */
export function buildPhotoRawCatalogCsvReport(analysis) {
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const headers = [
		'Cluster Key',
		'Photo Asset Name',
		'Shot Lineage Stem',
		'Artifact Tags',
		'Extension',
		'Family',
		'Governance Tier',
		'RAW Selects Vault',
		'Camera RAW Original',
		'Sidecar Edit Origin',
		'Verified RAW Master Conserved',
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
			const hasVerifiedRaw = member.context.isDevelopedExportTwin
				? member.context.hasVerifiedRawMaster
				: (member.context.isRawSelectsVault || member.context.isCameraRawOriginal || member.context.isSidecarEditOrigin)
			const row = [
				cluster.groupKey,
				cluster.basename,
				member.context.shotLineageStem,
				member.context.artifactTag,
				member.extension,
				cluster.familyLabel,
				member.tierLabel,
				member.context.isRawSelectsVault ? 'yes' : 'no',
				member.context.isCameraRawOriginal ? 'yes' : 'no',
				member.context.isSidecarEditOrigin ? 'yes' : 'no',
				hasVerifiedRaw ? 'yes' : 'no',
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
 * Build a structured JSON audit manifest for RAW Photography Catalogs, Preview Pyramids, Sidecars & Exports.
 *
 * @param {object} analysis Output from analyzePhotoRawCatalogDuplicates.
 * @param {string} [generatedAt] Optional ISO timestamp override.
 * @return {string} Pretty-printed JSON manifest.
 */
export function buildPhotoRawCatalogJsonReport(analysis, generatedAt = new Date().toISOString()) {
	const safeAnalysis = analysis && typeof analysis === 'object' ? analysis : { summary: {}, clusters: [], options: {} }
	return JSON.stringify({
		schema: PHOTO_RAW_CATALOG_SCHEMA,
		generatedAt,
		options: safeAnalysis.options || {},
		summary: safeAnalysis.summary || {},
		clusters: (safeAnalysis.clusters || []).map(cluster => ({
			groupKey: cluster.groupKey,
			primaryGroupId: cluster.primaryGroupId,
			hash: cluster.hash,
			basename: cluster.basename,
			shotLineageStem: cluster.shotLineageStem,
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
				shotLineageStem: member.context.shotLineageStem,
				authorityScore: member.context.authorityScore,
				hasVerifiedRawMaster: member.context.hasVerifiedRawMaster,
				override: member.override,
			})),
		})),
	}, null, 2)
}
