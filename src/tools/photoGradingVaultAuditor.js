/**
 * Pure Photography RAW, Lightroom/Capture One & Color Grading Vault Auditor.
 * Classifies and audits duplicate clusters across 4 photography and grading vault families:
 * - RAW Camera Originals (.cr3, .cr2, .nef, .arw, .raf, .dng, .orf, .rw2)
 * - Catalogs, Sidecars & Color Grading (.lrcat, .lrcat-data, .xmp, .cos, .eip, .cube, .3dl, .dcp, .icc)
 * - Regenerable Previews, Proxies & Caches (Previews.lrdata/, Smart Previews.lrdata/, Proxies/, Cache/, .lrcat-wal, .lrprev, .cot)
 * - Derived Exports & RAW+JPG Pairs (.jpg, .jpeg, .tif, .tiff, .psd, .psb vs RAW+XMP originals)
 *
 * Strictly protects RAW camera originals, active .xmp/.cos/.eip grading sidecars, and active .lrcat catalogs by default,
 * detects RAW+JPG shoot pairs across the vault, and generates POSIX DRY_RUN=1 cleanup scripts,
 * CWE-1236-safe CSV reports, JSON manifests, and .sync-exclude.lst rules.
 *
 * Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const PHOTO_GRADING_VAULT_SCHEMA = 'duplicatefinder.photo-grading-vault-auditor.v1'

export const PHOTO_GRADING_FAMILIES = Object.freeze([
	'all',
	'raw-camera-originals',
	'catalogs-grading-sidecars',
	'regenerable-previews-proxies',
	'derived-exports-raw-jpg-pairs',
])

export const PHOTO_GRADING_FAMILY_META = Object.freeze({
	'raw-camera-originals': {
		id: 'raw-camera-originals',
		label: 'RAW Camera Originals',
		shortLabel: 'RAW (.cr3, .cr2, .nef, .arw, .raf, .dng, .orf, .rw2)',
	},
	'catalogs-grading-sidecars': {
		id: 'catalogs-grading-sidecars',
		label: 'Catalogs, Sidecars & LUTs',
		shortLabel: 'Lightroom/Capture One (.lrcat, .xmp, .cos, .eip, .cube, .dcp)',
	},
	'regenerable-previews-proxies': {
		id: 'regenerable-previews-proxies',
		label: 'Previews, Proxies & Caches',
		shortLabel: 'Regenerable (Previews.lrdata/, Smart Previews.lrdata/, Proxies/, Cache/)',
	},
	'derived-exports-raw-jpg-pairs': {
		id: 'derived-exports-raw-jpg-pairs',
		label: 'Derived Exports & RAW+JPG Pairs',
		shortLabel: 'Exports & Pairs (.jpg, .tif, .psd vs RAW+XMP)',
	},
})

export const PHOTO_GRADING_STRATEGIES = Object.freeze([
	'prune-previews-proxies-keep-raw',
	'consolidate-raw-hardlinks',
	'prune-regenerable-caches-only',
])

export const PHOTO_GRADING_SURVIVOR_RULES = Object.freeze([
	'raw-xmp-lrcat-vault-first',
	'capture-date-shoot-first',
	'shortest-path',
])

export const PHOTO_GRADING_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'raw-originals',
	'catalogs-sidecars',
	'regenerable-caches',
	'derived-exports',
	'raw-jpg-pairs',
	'lightroom',
	'capture-one',
	'shielded',
])

export const PHOTO_GRADING_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'cache_priority_desc',
	'copies_desc',
	'name_asc',
])

export const PHOTO_GRADING_PRESETS = Object.freeze([
	{
		id: 'all-photo-grading-vault-audit',
		name: 'All RAW, Lightroom/C1 & Grading',
		description: 'Audit RAW camera originals (.cr3/.cr2/.nef/.arw/.raf/.dng/.orf/.rw2), .lrcat/.xmp/.cos/.eip catalogs & sidecars, Previews.lrdata/Smart Previews.lrdata/Proxies/Cache, and derived .jpg/.tif/.psd exports while shielding RAW, .xmp, and .lrcat.',
		familyFilter: 'all',
		strategy: 'prune-previews-proxies-keep-raw',
		survivorRule: 'raw-xmp-lrcat-vault-first',
		protectRawOriginals: true,
		protectSidecarsXmp: true,
		protectActiveCatalogs: true,
		requireRawXmpForExportPrune: false,
		staleCacheDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'prune-lr-c1-previews-proxies',
		name: 'Prune Previews.lrdata, Proxies & Cache',
		description: 'Reclaim regenerable Previews.lrdata, Smart Previews.lrdata, Proxies/, Cache/, and .lrcat-wal caches while strictly preserving RAW originals, .xmp/.cos/.eip sidecars, and active .lrcat catalogs.',
		familyFilter: 'regenerable-previews-proxies',
		strategy: 'prune-regenerable-caches-only',
		survivorRule: 'raw-xmp-lrcat-vault-first',
		protectRawOriginals: true,
		protectSidecarsXmp: true,
		protectActiveCatalogs: true,
		requireRawXmpForExportPrune: false,
		staleCacheDays: 7,
		minSizeMb: 0,
	},
	{
		id: 'prune-derived-exports-raw-xmp-verified',
		name: 'Derived .jpg/.tif/.psd & RAW+JPG Pairs',
		description: 'Audit derived .jpg, .tif, and .psd exports plus RAW+JPG camera pairs, allowing cleanup only when verified RAW and .xmp/.cos/.eip masters are conserved.',
		familyFilter: 'derived-exports-raw-jpg-pairs',
		strategy: 'prune-previews-proxies-keep-raw',
		survivorRule: 'raw-xmp-lrcat-vault-first',
		protectRawOriginals: true,
		protectSidecarsXmp: true,
		protectActiveCatalogs: true,
		requireRawXmpForExportPrune: true,
		staleCacheDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'consolidate-raw-lrcat-hardlinks',
		name: 'Hardlink-Consolidate Photo Vault',
		description: 'Deduplicate identical RAW, sidecar, and export copies onto canonical Vault/Catalog anchors via POSIX hardlinks without breaking Lightroom or Capture One folder references.',
		familyFilter: 'all',
		strategy: 'consolidate-raw-hardlinks',
		survivorRule: 'raw-xmp-lrcat-vault-first',
		protectRawOriginals: true,
		protectSidecarsXmp: true,
		protectActiveCatalogs: true,
		requireRawXmpForExportPrune: false,
		staleCacheDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'strict-raw-xmp-lrcat-guard',
		name: 'Strict RAW + .xmp + .lrcat Conservation',
		description: 'Inspect RAW originals, active .lrcat catalogs, and .xmp/.cos/.eip/LUT grading files with strict non-destructive conservation shields active.',
		familyFilter: 'catalogs-grading-sidecars',
		strategy: 'prune-previews-proxies-keep-raw',
		survivorRule: 'raw-xmp-lrcat-vault-first',
		protectRawOriginals: true,
		protectSidecarsXmp: true,
		protectActiveCatalogs: true,
		requireRawXmpForExportPrune: true,
		staleCacheDays: 30,
		minSizeMb: 0,
	},
])

const RAW_CAMERA_EXT_SET = new Set([
	'cr3',
	'cr2',
	'nef',
	'arw',
	'raf',
	'dng',
	'orf',
	'rw2',
])

const CATALOG_EXT_SET = new Set([
	'lrcat',
	'lrcat-data',
	'cocatalogdb',
	'cosessiondb',
	'colibrary',
])

const SIDECAR_GRADING_EXT_SET = new Set([
	'xmp',
	'cos',
	'eip',
	'cof',
	'cop',
	'cube',
	'3dl',
	'look',
	'dcp',
	'icc',
	'lrtemplate',
])

const REGENERABLE_CACHE_EXT_SET = new Set([
	'lrcat-wal',
	'lrcat-shm',
	'lrprev',
	'cot',
	'tmp',
	'thumb',
])

const DERIVED_EXPORT_EXT_SET = new Set([
	'jpg',
	'jpeg',
	'tif',
	'tiff',
	'psd',
	'psb',
])

const REGENERABLE_CACHE_PATH_RE = /(?:^|\/)(?:previews\.lrdata|smart[-_ ]?previews\.lrdata|helper\.lrdata|sync\.lrdata|[^/]+\.lrdata|proxies|cache|captureone\/cache(?:\/thumbnails|\/proxies)?|lightroom\/previews|thumbnails?)(?:\/|$)/i
const STAGING_PATH_RE = /(?:^|\/)(?:downloads?|telechargements?|scratch|staging|temp|tmp|wetransfer|airdrop)(?:\/|$)/i
const CANONICAL_VAULT_PATH_RE = /(?:^|\/)(?:raw[-_ ]?(?:vault|masters?|originals?)|originals?|selects|catalogs?|lightroom|captureone|sessions?|color[-_ ]?grading|grading|luts?|vault|__groupfolders\/\d+\/(?:photo|raw|studio|lightroom|captureone))(?:\/|$)/i
const BACKUP_SNAPSHOT_PATH_RE = /(?:^|\/)(?:catalog[-_ ]?backups?|lrcat[-_ ]?backups?|backups?\/lightroom|old[-_ ]?previews)(?:\/|$)/i
const EXPORT_MARKER_RE = /(?:^|[._\s-])(export|graded|grade|color|retouch|print|web|social|ig|instagram|client|delivery|proof|cmyk|srgb|2048px|4k|thumb)(?:$|[._\s-])/i
const PHOTO_GRADING_CONTEXT_RE = /(?:lightroom|lrcat|lrdata|capture\s?one|captureone|\.cos|\.eip|\.xmp|color[-_ ]?grading|grading|lut|raw|cr3|cr2|nef|arw|raf|dng|orf|rw2|shoot|session|retouch|export|print|proxies)/i
const SHOOT_DATE_RE = /(?:^|\/)(20\d{2}[-_]?(?:0[1-9]|1[0-2])(?:[-_]?(?:0[1-9]|[12]\d|3[01]))?)(?:\/|[_-]|$)/
const CAMERA_BODY_RE = /(canon|eos|r5|r6|5d|nikon|z8|z9|d850|sony|a7r|a7s|a1|fx3|fuji|fujifilm|gfx|xt5|leica|olympus|om1|lumix|gh6|hasselblad|phaseone)/i

const IGNORED_SHOOT_SEGMENTS = new Set([
	'files',
	'photos',
	'photo',
	'photography',
	'raw',
	'raws',
	'raw-originals',
	'raw-vault',
	'originals',
	'selects',
	'lightroom',
	'captureone',
	'capture-one',
	'catalogs',
	'sessions',
	'sidecars',
	'grading',
	'color-grading',
	'luts',
	'previews',
	'previews.lrdata',
	'smart previews.lrdata',
	'proxies',
	'cache',
	'exports',
	'export',
	'print',
	'web',
	'downloads',
	'telechargements',
	'staging',
	'scratch',
	'__groupfolders',
	'users',
	'home',
])

/**
 * Normalize path separators safely to POSIX style.
 *
 * @param {string} rawPath Raw file path.
 * @return {string} Normalized POSIX path.
 */
function safeNormalizePath(rawPath) {
	if (!rawPath || typeof rawPath !== 'string') {
		return ''
	}
	return normalizePathForDiff(rawPath).replace(/\\/g, '/')
}

/**
 * Extract basename from a normalized path.
 *
 * @param {string} filePath Normalized path.
 * @return {string} Basename.
 */
function getBasename(filePath) {
	const clean = safeNormalizePath(filePath).replace(/\/+$/, '')
	if (!clean) {
		return ''
	}
	const idx = clean.lastIndexOf('/')
	return idx >= 0 ? clean.slice(idx + 1) : clean
}

/**
 * Extract parent directory from a normalized path.
 *
 * @param {string} filePath Normalized path.
 * @return {string} Directory path.
 */
function getDirname(filePath) {
	const clean = safeNormalizePath(filePath).replace(/\/+$/, '')
	const idx = clean.lastIndexOf('/')
	return idx > 0 ? clean.slice(0, idx) : '/'
}

/**
 * Extract lowercase extension without leading dot.
 *
 * @param {string} basename File basename.
 * @return {string} Lowercase extension.
 */
function getExtension(basename) {
	if (!basename || typeof basename !== 'string') {
		return ''
	}
	const lower = basename.toLowerCase()
	for (const compound of ['lrcat-wal', 'lrcat-shm', 'lrcat-data']) {
		if (lower.endsWith(`.${compound}`)) {
			return compound
		}
	}
	const dotIdx = lower.lastIndexOf('.')
	if (dotIdx <= 0 || dotIdx === lower.length - 1) {
		return ''
	}
	return lower.slice(dotIdx + 1)
}

/**
 * Normalize mtime to epoch seconds.
 *
 * @param {number|string|null|undefined} rawMtime Timestamp in seconds or ms.
 * @return {number} Epoch seconds or 0.
 */
function normalizeMtimeSec(rawMtime) {
	const num = Number(rawMtime)
	if (!Number.isFinite(num) || num <= 0) {
		return 0
	}
	return num > 1e12 ? Math.floor(num / 1000) : Math.floor(num)
}

/**
 * Normalize a photography filename into a canonical shoot stem so RAW originals,
 * XMP/COS/EIP sidecars, and derived JPG/TIF/PSD exports correlate reliably.
 *
 * @param {string} basename File basename.
 * @return {string} Canonical shoot stem.
 */
export function normalizeShootStem(basename) {
	if (!basename || typeof basename !== 'string') {
		return 'untitled-frame'
	}
	let stem = basename.trim()
	for (const compound of ['.lrcat-wal', '.lrcat-shm', '.lrcat-data']) {
		if (stem.toLowerCase().endsWith(compound)) {
			stem = stem.slice(0, -compound.length)
			break
		}
	}
	const dotIdx = stem.lastIndexOf('.')
	if (dotIdx > 0) {
		stem = stem.slice(0, dotIdx)
	}
	// Handle sidecars named IMG_1024.CR3.xmp or IMG_1024.ARW.cos
	const nestedRawDot = stem.match(/^(.+)\.(?:cr3|cr2|nef|arw|raf|dng|orf|rw2)$/i)
	if (nestedRawDot) {
		stem = nestedRawDot[1]
	}

	let prev = ''
	while (prev !== stem) {
		prev = stem
		stem = stem.replace(
			/(?:\s*\(\d+\)|[._\s-]+(?:export|graded|grade|color|retouch|retouched|print|web|social|ig|instagram|client|delivery|proof|cmyk|srgb|2048px|4k|thumb|thumbnail|proxy|preview|select|picked|master|raw|orig|original|copy|backup|bak|dup|duplicate|old|tmp|final|v\d+|rev\d+|r\d+))+$/gi,
			''
		)
	}

	stem = stem
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')

	return stem || 'photo-frame'
}

/**
 * Extract shoot / catalog workspace slug from path segments.
 *
 * @param {string} basename File basename.
 * @param {string} fullPath Full normalized path.
 * @return {string} Shoot workspace slug.
 */
export function extractShootWorkspace(basename, fullPath = '') {
	const segments = safeNormalizePath(fullPath).split('/').filter(Boolean)
	const dirSegments = segments.slice(0, -1)

	for (let i = 0; i < dirSegments.length; i += 1) {
		const lower = dirSegments[i].toLowerCase()
		if ((lower === 'previews.lrdata' || lower === 'smart previews.lrdata' || lower === 'proxies' || lower === 'cache' || lower === 'exports' || lower === 'captureone') && i > 0) {
			const candidate = dirSegments[i - 1].toLowerCase()
			if (candidate && !IGNORED_SHOOT_SEGMENTS.has(candidate) && !/^\d+$/.test(candidate)) {
				return candidate.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'photo-shoot'
			}
		}
	}

	for (let i = dirSegments.length - 1; i >= 0; i -= 1) {
		const clean = dirSegments[i].toLowerCase()
		if (clean && !IGNORED_SHOOT_SEGMENTS.has(clean) && !/^\d+$/.test(clean)) {
			return clean.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'photo-shoot'
		}
	}

	return normalizeShootStem(basename)
}

/**
 * Extract Lightroom / Capture One / Color Grading workflow metadata from extension and path.
 *
 * @param {string} ext File extension.
 * @param {string} combinedContext Path + basename context.
 * @param {string} family Assigned vault family.
 * @return {object} Workflow suite, grading stage, and camera/shoot spec.
 */
export function extractPhotoGradingMetadata(ext, combinedContext, family) {
	let workflowSuite = 'Photography RAW Vault'
	if (
		ext === 'lrcat'
		|| ext === 'lrcat-data'
		|| ext === 'lrcat-wal'
		|| ext === 'lrcat-shm'
		|| ext === 'lrprev'
		|| ext === 'lrtemplate'
		|| /lightroom|previews\.lrdata|smart[-_ ]?previews\.lrdata|helper\.lrdata|sync\.lrdata/i.test(combinedContext)
	) {
		workflowSuite = 'Adobe Lightroom'
	} else if (
		ext === 'cos'
		|| ext === 'eip'
		|| ext === 'cof'
		|| ext === 'cop'
		|| ext === 'cot'
		|| ext === 'cocatalogdb'
		|| ext === 'cosessiondb'
		|| ext === 'colibrary'
		|| /captureone|capture[-_ ]?one/i.test(combinedContext)
	) {
		workflowSuite = 'Capture One'
	} else if (ext === 'cube' || ext === '3dl' || ext === 'look' || ext === 'dcp' || ext === 'icc' || /grading|lut/i.test(combinedContext)) {
		workflowSuite = 'Color Grading / LUT'
	} else if (ext === 'psd' || ext === 'psb') {
		workflowSuite = 'Photoshop Retouch'
	}

	let workflowStage = 'Vault Asset'
	if (family === 'regenerable-previews-proxies') {
		if (/smart[-_ ]?previews\.lrdata/i.test(combinedContext)) {
			workflowStage = 'Smart Previews Cache'
		} else if (/previews\.lrdata|\.lrprev/i.test(combinedContext)) {
			workflowStage = 'Previews.lrdata Pyramid'
		} else if (/\/proxies(?:\/|$)/i.test(combinedContext)) {
			workflowStage = 'Editing Proxies Cache'
		} else if (/lrcat-wal|lrcat-shm/i.test(combinedContext)) {
			workflowStage = 'Catalog WAL Journal'
		} else {
			workflowStage = 'Render / Thumb Cache'
		}
	} else if (family === 'catalogs-grading-sidecars') {
		if (ext === 'lrcat' || ext === 'lrcat-data' || ext === 'cocatalogdb' || ext === 'cosessiondb') {
			workflowStage = 'Active Catalog Database'
		} else if (ext === 'eip') {
			workflowStage = 'Capture One EIP Package'
		} else if (ext === 'cos' || ext === 'cof' || ext === 'cop') {
			workflowStage = 'Capture One Settings'
		} else if (ext === 'xmp') {
			workflowStage = 'XMP Develop Sidecar'
		} else {
			workflowStage = 'Color LUT / Camera Profile'
		}
	} else if (family === 'derived-exports-raw-jpg-pairs') {
		if (ext === 'psd' || ext === 'psb') {
			workflowStage = 'Layered Retouch Master'
		} else if (ext === 'tif' || ext === 'tiff') {
			workflowStage = '16-bit Print / Grading TIFF'
		} else if (EXPORT_MARKER_RE.test(combinedContext)) {
			workflowStage = 'Derived Export JPEG'
		} else {
			workflowStage = 'Camera / Paired JPEG'
		}
	} else {
		workflowStage = 'Camera RAW Negative'
	}

	const dateMatch = SHOOT_DATE_RE.exec(combinedContext)
	const cameraMatch = CAMERA_BODY_RE.exec(combinedContext)
	const specParts = []
	if (cameraMatch) {
		specParts.push(cameraMatch[1].toUpperCase())
	}
	if (dateMatch) {
		specParts.push(dateMatch[1])
	}
	const shootSpec = specParts.length > 0
		? specParts.join(' / ')
		: (family === 'regenerable-previews-proxies' ? 'Regenerable' : 'Master')

	return {
		workflowSuite,
		workflowStage,
		shootSpec,
	}
}

/**
 * Format bytes as GB string with 2 decimals (e.g. "1.50 GB").
 *
 * @param {number} bytes Byte count.
 * @return {string} Formatted GB string.
 */
export function formatGigabytes(bytes) {
	const safe = Number.isFinite(bytes) && bytes > 0 ? bytes : 0
	const gb = safe / (1024 * 1024 * 1024)
	return `${gb.toFixed(2)} GB`
}

/**
 * Classify a single file into one of the 4 Photography RAW, Lightroom/Capture One & Color Grading Vault families.
 *
 * @param {object} file Duplicate file entry.
 * @return {object|null} Classification metadata or null if unrelated.
 */
export function classifyPhotoGradingFile(file) {
	if (!file || typeof file !== 'object') {
		return null
	}
	const path = safeNormalizePath(file.path || file.filePath || '')
	const basename = getBasename(path)
	if (!basename) {
		return null
	}
	const ext = getExtension(basename)
	const mtimeSec = normalizeMtimeSec(file.mtime)
	const combinedContext = `${path} ${basename}`

	const inRegenerableCachePath = REGENERABLE_CACHE_PATH_RE.test(path)
	const inStagingPath = STAGING_PATH_RE.test(path)
	const inBackupSnapshotPath = BACKUP_SNAPSHOT_PATH_RE.test(path)
	const isRawOriginal = RAW_CAMERA_EXT_SET.has(ext) && !(ext === 'dng' && inRegenerableCachePath)
	const isActiveCatalog = CATALOG_EXT_SET.has(ext) && !inBackupSnapshotPath
	const isCatalogBackup = CATALOG_EXT_SET.has(ext) && inBackupSnapshotPath
	const isSidecarGrading = SIDECAR_GRADING_EXT_SET.has(ext)
	const isCacheExt = REGENERABLE_CACHE_EXT_SET.has(ext)
	const isDerivedExport = DERIVED_EXPORT_EXT_SET.has(ext)
	const isRegenerableCache = (inRegenerableCachePath && !isRawOriginal && !isActiveCatalog && !isSidecarGrading) || isCacheExt

	const hasPhotoContext = isRawOriginal
		|| isActiveCatalog
		|| isCatalogBackup
		|| isSidecarGrading
		|| isRegenerableCache
		|| (isDerivedExport && (PHOTO_GRADING_CONTEXT_RE.test(combinedContext) || EXPORT_MARKER_RE.test(basename)))

	if (!hasPhotoContext) {
		return null
	}

	let family = 'raw-camera-originals'
	let artifactKind = 'raw-camera-original'
	let artifactKindBadge = 'RAW Original'
	let formatBadge = ext ? `.${ext.toUpperCase()}` : 'CACHE'

	if (isRegenerableCache) {
		family = 'regenerable-previews-proxies'
		artifactKind = 'regenerable-preview-cache'
		if (/smart[-_ ]?previews\.lrdata/i.test(combinedContext)) {
			artifactKindBadge = 'Smart Previews'
		} else if (/previews\.lrdata|\.lrprev/i.test(combinedContext)) {
			artifactKindBadge = 'Previews.lrdata'
		} else if (/\/proxies(?:\/|$)/i.test(combinedContext)) {
			artifactKindBadge = 'Proxies Cache'
		} else if (ext === 'lrcat-wal' || ext === 'lrcat-shm') {
			artifactKindBadge = 'Lightroom WAL'
		} else {
			artifactKindBadge = 'Preview / Cache'
		}
		formatBadge = ext ? `Cache .${ext.toUpperCase()}` : 'Cache Blob'
	} else if (isActiveCatalog || isCatalogBackup || isSidecarGrading) {
		family = 'catalogs-grading-sidecars'
		if (isActiveCatalog) {
			artifactKind = 'active-catalog'
			artifactKindBadge = ext === 'lrcat' ? 'Active .lrcat' : 'Active Catalog'
			formatBadge = `Cat .${ext.toUpperCase()}`
		} else if (isCatalogBackup) {
			artifactKind = 'catalog-backup'
			artifactKindBadge = 'Catalog Backup'
			formatBadge = `Backup .${ext.toUpperCase()}`
		} else if (ext === 'xmp') {
			artifactKind = 'xmp-sidecar'
			artifactKindBadge = '.XMP Sidecar'
			formatBadge = 'Sidecar .XMP'
		} else if (ext === 'eip' || ext === 'cos' || ext === 'cof' || ext === 'cop') {
			artifactKind = 'capture-one-sidecar'
			artifactKindBadge = ext === 'eip' ? 'C1 .EIP Package' : 'C1 .COS Sidecar'
			formatBadge = `C1 .${ext.toUpperCase()}`
		} else {
			artifactKind = 'grading-lut-profile'
			artifactKindBadge = 'Color LUT / Profile'
			formatBadge = `LUT .${ext.toUpperCase()}`
		}
	} else if (isDerivedExport) {
		family = 'derived-exports-raw-jpg-pairs'
		artifactKind = (ext === 'psd' || ext === 'psb') ? 'layered-retouch-psd' : 'derived-photo-export'
		if (ext === 'psd' || ext === 'psb') {
			artifactKindBadge = 'Retouch .PSD'
			formatBadge = `PSD .${ext.toUpperCase()}`
		} else if (ext === 'tif' || ext === 'tiff') {
			artifactKindBadge = 'Graded .TIF'
			formatBadge = `TIFF .${ext.toUpperCase()}`
		} else {
			artifactKindBadge = EXPORT_MARKER_RE.test(combinedContext) ? 'Derived .JPG' : 'Shoot .JPG'
			formatBadge = `JPEG .${ext.toUpperCase()}`
		}
	} else {
		family = 'raw-camera-originals'
		artifactKind = 'raw-camera-original'
		artifactKindBadge = `RAW .${ext.toUpperCase()}`
		formatBadge = `RAW .${ext.toUpperCase()}`
	}

	const shootStem = normalizeShootStem(basename)
	const shootWorkspace = extractShootWorkspace(basename, path)
	const workflowMeta = extractPhotoGradingMetadata(ext, combinedContext, family)
	const inCanonicalVault = CANONICAL_VAULT_PATH_RE.test(path) && !inRegenerableCachePath && !inStagingPath && !inBackupSnapshotPath

	return {
		path,
		dirname: getDirname(path),
		basename,
		ext,
		family,
		artifactKind,
		artifactKindBadge,
		formatBadge,
		shootStem,
		shootWorkspace,
		workflowSuite: workflowMeta.workflowSuite,
		workflowStage: workflowMeta.workflowStage,
		shootSpec: workflowMeta.shootSpec,
		mtimeSec,
		isRawOriginal: !isRegenerableCache && isRawOriginal,
		isActiveCatalog: !isRegenerableCache && isActiveCatalog,
		isCatalogBackup: !isRegenerableCache && isCatalogBackup,
		isSidecarGrading: !isRegenerableCache && isSidecarGrading,
		isXmpOrC1Sidecar: !isRegenerableCache && (ext === 'xmp' || ext === 'cos' || ext === 'eip'),
		isRegenerableCache,
		isDerivedExport: !isRegenerableCache && isDerivedExport,
		isJpegImage: !isRegenerableCache && (ext === 'jpg' || ext === 'jpeg'),
		isLightroomWorkflow: workflowMeta.workflowSuite === 'Adobe Lightroom',
		isCaptureOneWorkflow: workflowMeta.workflowSuite === 'Capture One',
		inCanonicalVault,
		inRegenerableCachePath,
		inStagingPath,
		inBackupSnapshotPath,
		vaultKey: `${shootWorkspace}/${shootStem}`,
	}
}

/**
 * Compute deterministic reference timestamp from duplicate groups.
 *
 * @param {Array<object>} duplicateGroups Raw duplicate groups.
 * @return {number} Epoch seconds.
 */
function resolveReferenceNowSec(duplicateGroups) {
	let maxMtimeSec = 0
	for (const group of duplicateGroups) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (const file of group.files) {
			const mtime = normalizeMtimeSec(file && file.mtime)
			if (mtime > maxMtimeSec) {
				maxMtimeSec = mtime
			}
		}
	}
	return maxMtimeSec > 0 ? maxMtimeSec : Math.floor(Date.now() / 1000)
}

/**
 * Score a file copy's authority as canonical photography/grading survivor (0-100).
 *
 * @param {object} member Classified file member.
 * @param {string} survivorRule Selected survivor rule.
 * @return {number} Authority score 0-100.
 */
function computeMemberAuthorityScore(member, survivorRule) {
	let score = 40

	if (member.meta.isRawOriginal) {
		score += 34
	}
	if (member.meta.isActiveCatalog) {
		score += 32
	}
	if (member.meta.isSidecarGrading) {
		score += 26
	}
	if (member.meta.inCanonicalVault) {
		score += 22
	}
	if (member.meta.inRegenerableCachePath || member.meta.isRegenerableCache) {
		score -= 34
	} else if (member.meta.inStagingPath) {
		score -= 22
	} else if (member.meta.inBackupSnapshotPath) {
		score -= 12
	}
	if (member.isInOriginFolder) {
		score += 18
	}

	if (survivorRule === 'capture-date-shoot-first') {
		if (SHOOT_DATE_RE.test(member.meta.path)) {
			score += 16
		}
	} else if (survivorRule === 'shortest-path') {
		const depth = member.meta.path.split('/').filter(Boolean).length
		score += Math.max(-15, 18 - depth * 3)
	}

	return Math.max(5, Math.min(100, Math.round(score)))
}

/**
 * Compare two members to pick the canonical survivor.
 *
 * @param {object} a First member.
 * @param {object} b Second member.
 * @param {string} survivorRule Survivor rule.
 * @return {number} Sort comparator result.
 */
function compareSurvivorCandidates(a, b, survivorRule) {
	if (a.isInOriginFolder !== b.isInOriginFolder) {
		return a.isInOriginFolder ? -1 : 1
	}
	if (a.meta.inRegenerableCachePath !== b.meta.inRegenerableCachePath) {
		return a.meta.inRegenerableCachePath ? 1 : -1
	}
	if (a.meta.isRawOriginal !== b.meta.isRawOriginal) {
		return a.meta.isRawOriginal ? -1 : 1
	}
	if (a.meta.isActiveCatalog !== b.meta.isActiveCatalog) {
		return a.meta.isActiveCatalog ? -1 : 1
	}
	if (a.meta.isSidecarGrading !== b.meta.isSidecarGrading) {
		return a.meta.isSidecarGrading ? -1 : 1
	}
	if (a.meta.inCanonicalVault !== b.meta.inCanonicalVault) {
		return a.meta.inCanonicalVault ? -1 : 1
	}
	if (a.meta.inStagingPath !== b.meta.inStagingPath) {
		return a.meta.inStagingPath ? 1 : -1
	}
	if (survivorRule === 'shortest-path' && a.meta.path.length !== b.meta.path.length) {
		return a.meta.path.length - b.meta.path.length
	}
	if (a.authorityScore !== b.authorityScore) {
		return b.authorityScore - a.authorityScore
	}
	if (survivorRule === 'capture-date-shoot-first' && a.mtimeSec !== b.mtimeSec) {
		return a.mtimeSec - b.mtimeSec
	}
	if (a.mtimeSec !== b.mtimeSec) {
		return b.mtimeSec - a.mtimeSec
	}
	return a.meta.path.localeCompare(b.meta.path)
}

/**
 * Analyze duplicate groups for Photography RAW, Lightroom/Capture One & Color Grading Vault governance.
 *
 * @param {Array<object>} duplicateGroups Array of duplicate group objects.
 * @param {object} [options] Analysis configuration options.
 * @return {object} Deterministic audit report.
 */
export function analyzePhotoGradingVault(duplicateGroups, options = {}) {
	const groups = Array.isArray(duplicateGroups) ? duplicateGroups.filter(Boolean) : []
	const familyFilter = PHOTO_GRADING_FAMILIES.includes(options.familyFilter) ? options.familyFilter : 'all'
	const verdictFilter = PHOTO_GRADING_VERDICT_FILTERS.includes(options.verdictFilter) ? options.verdictFilter : 'all'
	const sortMode = PHOTO_GRADING_SORT_MODES.includes(options.sortMode) ? options.sortMode : 'reclaim_desc'
	const strategy = PHOTO_GRADING_STRATEGIES.includes(options.strategy)
		? options.strategy
		: 'prune-previews-proxies-keep-raw'
	const survivorRule = PHOTO_GRADING_SURVIVOR_RULES.includes(options.survivorRule)
		? options.survivorRule
		: 'raw-xmp-lrcat-vault-first'

	const protectRawOriginals = options.protectRawOriginals !== false
	const protectSidecarsXmp = options.protectSidecarsXmp !== false
	const protectActiveCatalogs = options.protectActiveCatalogs !== false
	const requireRawXmpForExportPrune = options.requireRawXmpForExportPrune === true
	const staleCacheDays = Number.isFinite(Number(options.staleCacheDays)) && Number(options.staleCacheDays) >= 0
		? Number(options.staleCacheDays)
		: 14
	const minSizeMb = Number.isFinite(Number(options.minSizeMb)) && Number(options.minSizeMb) > 0
		? Number(options.minSizeMb)
		: 0
	const minSizeBytes = minSizeMb * 1024 * 1024
	const searchQuery = typeof options.searchQuery === 'string' ? options.searchQuery.trim().toLowerCase() : ''
	const memberOverrides = options.memberOverrides && typeof options.memberOverrides === 'object'
		? options.memberOverrides
		: {}

	const referenceNowSec = Number.isFinite(Number(options.referenceNowSec)) && Number(options.referenceNowSec) > 0
		? Number(options.referenceNowSec)
		: resolveReferenceNowSec(groups)

	const preClassifiedGroups = []
	const rawOriginalStems = new Set()
	const xmpSidecarStems = new Set()
	const jpgPairStems = new Set()
	let vaultActiveCatalogCount = 0

	for (const group of groups) {
		const files = Array.isArray(group.files) ? group.files.filter(Boolean) : []
		if (files.length < 2) {
			continue
		}

		const classifiedMembers = []
		for (const file of files) {
			const meta = classifyPhotoGradingFile(file)
			if (!meta) {
				continue
			}
			if (meta.isRawOriginal) {
				rawOriginalStems.add(meta.shootStem)
			}
			if (meta.isXmpOrC1Sidecar) {
				xmpSidecarStems.add(meta.shootStem)
			}
			if (meta.isJpegImage) {
				jpgPairStems.add(meta.shootStem)
			}
			if (meta.isActiveCatalog) {
				vaultActiveCatalogCount += 1
			}
			const size = Number.isFinite(Number(file.size)) && Number(file.size) > 0
				? Number(file.size)
				: (Number.isFinite(Number(group.size)) ? Number(group.size) : 0)
			const mtimeSec = normalizeMtimeSec(file.mtime)
			const ageDays = mtimeSec > 0 ? Math.max(0, Math.round(((referenceNowSec - mtimeSec) / 86400) * 10) / 10) : 0
			const selectionKey = getFileSelectionKey(file)

			const member = {
				file,
				id: file.id ?? file.nodeId ?? selectionKey,
				selectionKey,
				path: meta.path,
				basename: meta.basename,
				size,
				formattedSize: formatBytes(size),
				mtimeSec,
				formattedMtime: formatFileModifiedTime(mtimeSec),
				ageDays,
				isInOriginFolder: Boolean(file.isInOriginFolder),
				meta,
				authorityScore: 0,
				verdict: 'keep-canonical-survivor',
				verdictReason: '',
				actionType: 'keep',
			}
			member.authorityScore = computeMemberAuthorityScore(member, survivorRule)
			classifiedMembers.push(member)
		}

		if (classifiedMembers.length >= 2) {
			preClassifiedGroups.push({ group, files, classifiedMembers })
		}
	}

	const allClusters = []

	for (const entry of preClassifiedGroups) {
		const { group, files, classifiedMembers } = entry
		classifiedMembers.sort((a, b) => compareSurvivorCandidates(a, b, survivorRule))
		const survivor = classifiedMembers[0]
		const primaryMeta = survivor.meta
		const family = primaryMeta.family
		const familyMeta = PHOTO_GRADING_FAMILY_META[family] || PHOTO_GRADING_FAMILY_META['raw-camera-originals']

		const hasRawInCluster = classifiedMembers.some(m => m.meta.isRawOriginal)
		const hasRawOriginalInVault = hasRawInCluster || rawOriginalStems.has(primaryMeta.shootStem)
		const hasXmpSidecarInVault = classifiedMembers.some(m => m.meta.isXmpOrC1Sidecar) || xmpSidecarStems.has(primaryMeta.shootStem)
		const hasJpgInCluster = classifiedMembers.some(m => m.meta.isJpegImage)
		const hasJpgInVault = hasJpgInCluster || jpgPairStems.has(primaryMeta.shootStem)
		const hasActiveCatalogInCluster = classifiedMembers.some(m => m.meta.isActiveCatalog)
		const hasSidecarInCluster = classifiedMembers.some(m => m.meta.isSidecarGrading)
		const hasLightroomWorkflow = classifiedMembers.some(m => m.meta.isLightroomWorkflow)
		const hasCaptureOneWorkflow = classifiedMembers.some(m => m.meta.isCaptureOneWorkflow)

		// RAW+JPG Pair detected when a shoot stem has both a RAW original and a JPEG companion
		const isRawJpgPair = (hasRawOriginalInVault && hasJpgInVault)
			&& (family === 'raw-camera-originals' || family === 'derived-exports-raw-jpg-pairs')

		let duplicationClass = 'raw-original'
		let duplicationBadge = primaryMeta.artifactKindBadge
		let lineageBadge = 'RAW Negative Master'

		if (family === 'regenerable-previews-proxies') {
			duplicationClass = 'regenerable-cache'
			duplicationBadge = primaryMeta.workflowStage
			lineageBadge = (hasRawOriginalInVault || vaultActiveCatalogCount > 0)
				? 'Regenerable from Active Catalog/RAW'
				: 'Regenerable Preview / Proxy Cache'
		} else if (family === 'catalogs-grading-sidecars') {
			duplicationClass = 'catalog-sidecar'
			duplicationBadge = primaryMeta.artifactKindBadge
			lineageBadge = hasRawOriginalInVault
				? 'Linked to RAW Negative Master'
				: 'Catalog / Color Grading Anchor'
		} else if (family === 'derived-exports-raw-jpg-pairs') {
			duplicationClass = isRawJpgPair ? 'raw-jpg-pair' : 'derived-export'
			duplicationBadge = isRawJpgPair ? 'RAW+JPG Shoot Pair' : primaryMeta.artifactKindBadge
			if (hasRawOriginalInVault && hasXmpSidecarInVault) {
				lineageBadge = 'RAW+XMP Original Verified'
			} else if (hasRawOriginalInVault) {
				lineageBadge = 'Paired RAW Original Verified'
			} else {
				lineageBadge = 'Unverified RAW+XMP (Orphan Export)'
			}
		} else {
			duplicationClass = 'raw-original'
			duplicationBadge = isRawJpgPair ? 'RAW Original (+JPG Pair)' : primaryMeta.artifactKindBadge
			lineageBadge = hasXmpSidecarInVault
				? 'RAW+XMP Grading Pair Intact'
				: 'Camera RAW Negative Vault'
		}

		let reclaimableBytes = 0
		let reclaimableCopiesCount = 0
		let consolidatableCopiesCount = 0
		let shieldedCopiesCount = 0

		classifiedMembers.forEach((member, idx) => {
			const override = memberOverrides[member.selectionKey] || 'auto'

			if (idx === 0) {
				member.verdict = 'keep-canonical-survivor'
				member.actionType = 'keep'
				if (member.meta.isRawOriginal) {
					member.verdictReason = `Canonical RAW negative (${member.meta.formatBadge})`
				} else if (member.meta.isActiveCatalog) {
					member.verdictReason = `Active ${member.meta.workflowSuite} catalog anchor`
				} else if (member.meta.isSidecarGrading) {
					member.verdictReason = `Canonical grading sidecar/LUT (${member.meta.formatBadge})`
				} else if (isRawJpgPair) {
					member.verdictReason = 'Primary shoot JPEG survivor (RAW+JPG pair)'
				} else {
					member.verdictReason = 'Highest-authority photo vault survivor'
				}
				shieldedCopiesCount += 1
				return
			}

			if (override === 'keep') {
				member.verdict = 'blocked-manual-shield'
				member.actionType = 'keep'
				member.verdictReason = 'Manually shielded by photographer / colorist'
				shieldedCopiesCount += 1
				return
			}

			if (override === 'prune') {
				member.verdict = strategy === 'consolidate-raw-hardlinks'
					? 'consolidate-hardlink-photo-asset'
					: 'reclaim-duplicate-photo-asset'
				member.actionType = strategy === 'consolidate-raw-hardlinks' ? 'hardlink' : 'prune'
				member.verdictReason = 'Operator override: marked for controlled remediation'
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				if (member.actionType === 'hardlink') {
					consolidatableCopiesCount += 1
				}
				return
			}

			if (member.isInOriginFolder) {
				member.verdict = 'blocked-origin-folder'
				member.actionType = 'keep'
				member.verdictReason = 'Protected Nextcloud origin folder'
				shieldedCopiesCount += 1
				return
			}

			if (protectActiveCatalogs && member.meta.isActiveCatalog && strategy !== 'consolidate-raw-hardlinks') {
				member.verdict = 'blocked-active-lrcat'
				member.actionType = 'keep'
				member.verdictReason = `Active ${member.meta.workflowSuite} catalog conservation shield`
				shieldedCopiesCount += 1
				return
			}

			if (protectRawOriginals && member.meta.isRawOriginal && strategy !== 'consolidate-raw-hardlinks') {
				member.verdict = 'blocked-raw-original'
				member.actionType = 'keep'
				member.verdictReason = `Strict RAW original conservation active (${member.meta.formatBadge})`
				shieldedCopiesCount += 1
				return
			}

			if (protectSidecarsXmp && member.meta.isSidecarGrading && strategy !== 'consolidate-raw-hardlinks') {
				member.verdict = 'blocked-active-sidecar-xmp'
				member.actionType = 'keep'
				member.verdictReason = `Sidecar & color grading conservation active (${member.meta.formatBadge})`
				shieldedCopiesCount += 1
				return
			}

			if (
				member.meta.isRegenerableCache
				&& member.ageDays < staleCacheDays
				&& strategy === 'prune-regenerable-caches-only'
			) {
				member.verdict = 'blocked-recent-preview-cache'
				member.actionType = 'keep'
				member.verdictReason = `Recent preview/proxy cache (${member.ageDays}d < ${staleCacheDays}d window)`
				shieldedCopiesCount += 1
				return
			}

			if (strategy === 'consolidate-raw-hardlinks') {
				member.verdict = 'consolidate-hardlink-photo-asset'
				member.actionType = 'hardlink'
				member.verdictReason = `Hardlink-consolidate onto ${survivor.basename} canonical anchor`
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				consolidatableCopiesCount += 1
				return
			}

			if (strategy === 'prune-regenerable-caches-only') {
				if (member.meta.isRegenerableCache) {
					member.verdict = 'reclaim-regenerable-preview-cache'
					member.actionType = 'prune'
					member.verdictReason = `Stale regenerable ${member.meta.workflowStage}`
					reclaimableBytes += member.size
					reclaimableCopiesCount += 1
					return
				}
				member.verdict = 'blocked-strategy-scope'
				member.actionType = 'keep'
				member.verdictReason = 'Outside regenerable preview/proxy cache sweep scope'
				shieldedCopiesCount += 1
				return
			}

			if (member.meta.isRegenerableCache) {
				member.verdict = 'reclaim-regenerable-preview-cache'
				member.actionType = 'prune'
				member.verdictReason = `Regenerable ${member.meta.workflowStage} (RAW + .xmp + .lrcat intact)`
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				return
			}

			if (member.meta.isDerivedExport) {
				if (requireRawXmpForExportPrune && (!hasRawOriginalInVault || !hasXmpSidecarInVault)) {
					member.verdict = 'blocked-unverified-raw-xmp'
					member.actionType = 'keep'
					member.verdictReason = 'Blocked: no verified RAW+XMP original conserved for this shoot'
					shieldedCopiesCount += 1
					return
				}
				if (isRawJpgPair) {
					member.verdict = 'reclaim-raw-jpg-pair-copy'
					member.actionType = 'prune'
					member.verdictReason = hasXmpSidecarInVault
						? 'Redundant RAW+JPG pair copy (RAW+XMP original verified)'
						: 'Redundant RAW+JPG pair copy (RAW original verified)'
				} else {
					member.verdict = 'reclaim-derived-export-copy'
					member.actionType = 'prune'
					member.verdictReason = hasRawOriginalInVault
						? `Derived ${member.meta.formatBadge} twin (RAW master conserved)`
						: `Duplicate ${member.meta.formatBadge} export outside canonical vault`
				}
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				return
			}

			member.verdict = 'reclaim-duplicate-photo-asset'
			member.actionType = 'prune'
			member.verdictReason = 'Duplicate catalog/sidecar copy outside conservation guard'
			reclaimableBytes += member.size
			reclaimableCopiesCount += 1
		})

		const rawInfo = computeGroupReclaimableInfo({ ...group, files })
		const rawDuplicateBytes = rawInfo.reclaimableBytes || Math.max(0, (classifiedMembers.length - 1) * survivor.size)

		let riskState = 'reclaimable'
		let riskPriority = 2
		if (reclaimableCopiesCount === 0) {
			if (hasActiveCatalogInCluster) {
				riskState = 'active-catalog-protected'
				riskPriority = 6
			} else if (hasRawInCluster) {
				riskState = 'raw-original-protected'
				riskPriority = 5
			} else if (hasSidecarInCluster) {
				riskState = 'sidecar-xmp-protected'
				riskPriority = 4
			} else {
				riskState = 'shielded'
				riskPriority = 3
			}
		} else if (consolidatableCopiesCount > 0) {
			riskState = 'consolidatable'
			riskPriority = 3
		} else if (duplicationClass === 'regenerable-cache') {
			riskState = 'preview-cache-reclaimable'
			riskPriority = 5
		} else if (duplicationClass === 'raw-jpg-pair') {
			riskState = 'raw-jpg-pair-reclaimable'
			riskPriority = 4
		}

		allClusters.push({
			groupKey: `${group.id ?? group.hash ?? primaryMeta.vaultKey}::${primaryMeta.vaultKey}`,
			primaryGroupId: group.id ?? null,
			hash: group.hash || '',
			family,
			familyLabel: familyMeta.label,
			familyShortLabel: familyMeta.shortLabel,
			shootWorkspace: primaryMeta.shootWorkspace,
			shootStem: primaryMeta.shootStem,
			workflowSuite: primaryMeta.workflowSuite,
			workflowStage: primaryMeta.workflowStage,
			shootSpec: primaryMeta.shootSpec,
			formatBadge: primaryMeta.formatBadge,
			duplicationClass,
			duplicationBadge,
			lineageBadge,
			isRawJpgPair,
			hasRawOriginalInVault,
			hasXmpSidecarInVault,
			hasRawInCluster,
			hasActiveCatalogInCluster,
			hasSidecarInCluster,
			hasLightroomWorkflow,
			hasCaptureOneWorkflow,
			vaultKey: primaryMeta.vaultKey,
			displayName: survivor.basename,
			riskState,
			riskPriority,
			copiesCount: classifiedMembers.length,
			reclaimableBytes,
			formattedReclaimableBytes: formatBytes(reclaimableBytes),
			reclaimableGb: formatGigabytes(reclaimableBytes),
			rawDuplicateBytes,
			formattedRawDuplicateBytes: formatBytes(rawDuplicateBytes),
			reclaimableCopiesCount,
			consolidatableCopiesCount,
			shieldedCopiesCount,
			survivor,
			members: classifiedMembers,
		})
	}

	const familyBreakdown = Object.keys(PHOTO_GRADING_FAMILY_META).map(famId => {
		const famClusters = allClusters.filter(c => c.family === famId)
		const famReclaim = famClusters.reduce((acc, c) => acc + c.reclaimableBytes, 0)
		return {
			id: famId,
			label: PHOTO_GRADING_FAMILY_META[famId].label,
			shortLabel: PHOTO_GRADING_FAMILY_META[famId].shortLabel,
			clustersCount: famClusters.length,
			reclaimableBytes: famReclaim,
			formattedReclaimableBytes: formatBytes(famReclaim),
		}
	})

	const filteredClusters = allClusters.filter(cluster => {
		if (familyFilter !== 'all' && cluster.family !== familyFilter) {
			return false
		}
		if (minSizeBytes > 0 && cluster.survivor.size < minSizeBytes) {
			return false
		}
		if (verdictFilter !== 'all') {
			if (verdictFilter === 'reclaimable' && cluster.reclaimableCopiesCount === 0) {
				return false
			}
			if (verdictFilter === 'raw-originals' && cluster.family !== 'raw-camera-originals') {
				return false
			}
			if (verdictFilter === 'catalogs-sidecars' && cluster.family !== 'catalogs-grading-sidecars') {
				return false
			}
			if (verdictFilter === 'regenerable-caches' && cluster.duplicationClass !== 'regenerable-cache') {
				return false
			}
			if (verdictFilter === 'derived-exports' && cluster.family !== 'derived-exports-raw-jpg-pairs') {
				return false
			}
			if (verdictFilter === 'raw-jpg-pairs' && !cluster.isRawJpgPair) {
				return false
			}
			if (verdictFilter === 'lightroom' && !cluster.hasLightroomWorkflow) {
				return false
			}
			if (verdictFilter === 'capture-one' && !cluster.hasCaptureOneWorkflow) {
				return false
			}
			if (verdictFilter === 'shielded' && cluster.reclaimableCopiesCount > 0) {
				return false
			}
		}
		if (searchQuery) {
			const haystack = [
				cluster.shootWorkspace,
				cluster.shootStem,
				cluster.workflowSuite,
				cluster.workflowStage,
				cluster.shootSpec,
				cluster.duplicationBadge,
				cluster.lineageBadge,
				cluster.formatBadge,
				cluster.vaultKey,
				cluster.displayName,
				...cluster.members.map(m => m.path),
			].join(' ').toLowerCase()
			if (!haystack.includes(searchQuery)) {
				return false
			}
		}
		return true
	})

	filteredClusters.sort((a, b) => {
		if (sortMode === 'cache_priority_desc') {
			const classWeight = {
				'regenerable-cache': 4,
				'raw-jpg-pair': 3,
				'derived-export': 2,
				'catalog-sidecar': 1,
				'raw-original': 0,
			}
			const diff = (classWeight[b.duplicationClass] || 0) - (classWeight[a.duplicationClass] || 0)
			if (diff !== 0) {
				return diff
			}
			if (a.riskPriority !== b.riskPriority) {
				return b.riskPriority - a.riskPriority
			}
			return b.reclaimableBytes - a.reclaimableBytes
		}
		if (sortMode === 'copies_desc') {
			if (a.copiesCount !== b.copiesCount) {
				return b.copiesCount - a.copiesCount
			}
			return b.reclaimableBytes - a.reclaimableBytes
		}
		if (sortMode === 'name_asc') {
			return a.displayName.localeCompare(b.displayName)
		}
		if (a.reclaimableBytes !== b.reclaimableBytes) {
			return b.reclaimableBytes - a.reclaimableBytes
		}
		if (a.rawDuplicateBytes !== b.rawDuplicateBytes) {
			return b.rawDuplicateBytes - a.rawDuplicateBytes
		}
		return a.displayName.localeCompare(b.displayName)
	})

	const totalRawDuplicateBytes = filteredClusters.reduce((acc, c) => acc + c.rawDuplicateBytes, 0)
	const totalReclaimableBytes = filteredClusters.reduce((acc, c) => acc + c.reclaimableBytes, 0)
	const totalFilesCount = filteredClusters.reduce((acc, c) => acc + c.copiesCount, 0)
	const totalReclaimableCopiesCount = filteredClusters.reduce((acc, c) => acc + c.reclaimableCopiesCount, 0)
	const totalConsolidatableCopiesCount = filteredClusters.reduce((acc, c) => acc + c.consolidatableCopiesCount, 0)
	const totalShieldedCopiesCount = filteredClusters.reduce((acc, c) => acc + c.shieldedCopiesCount, 0)
	const totalRawClusters = filteredClusters.filter(c => c.family === 'raw-camera-originals').length
	const totalCatalogSidecarClusters = filteredClusters.filter(c => c.family === 'catalogs-grading-sidecars').length
	const totalRegenerableCacheClusters = filteredClusters.filter(c => c.duplicationClass === 'regenerable-cache').length
	const totalDerivedExportClusters = filteredClusters.filter(c => c.family === 'derived-exports-raw-jpg-pairs').length
	const totalRawJpgPairClusters = filteredClusters.filter(c => c.isRawJpgPair).length
	const totalLightroomClusters = filteredClusters.filter(c => c.hasLightroomWorkflow).length
	const totalCaptureOneClusters = filteredClusters.filter(c => c.hasCaptureOneWorkflow).length
	const distinctShootStemsCount = new Set(filteredClusters.map(c => c.shootStem)).size
	const efficiencyPct = totalRawDuplicateBytes > 0
		? Math.min(100, Math.round((totalReclaimableBytes / totalRawDuplicateBytes) * 100))
		: 0

	return {
		schema: PHOTO_GRADING_VAULT_SCHEMA,
		generatedAt: new Date(referenceNowSec * 1000).toISOString(),
		options: {
			familyFilter,
			verdictFilter,
			sortMode,
			strategy,
			survivorRule,
			protectRawOriginals,
			protectSidecarsXmp,
			protectActiveCatalogs,
			requireRawXmpForExportPrune,
			staleCacheDays,
			minSizeMb,
			searchQuery,
		},
		summary: {
			totalClustersCount: filteredClusters.length,
			totalUnfilteredClustersCount: allClusters.length,
			totalFilesCount,
			totalRawDuplicateBytes,
			formattedRawDuplicateBytes: formatBytes(totalRawDuplicateBytes),
			totalReclaimableBytes,
			formattedReclaimableBytes: formatBytes(totalReclaimableBytes),
			reclaimableGb: formatGigabytes(totalReclaimableBytes),
			totalReclaimableCopiesCount,
			totalConsolidatableCopiesCount,
			totalShieldedCopiesCount,
			totalRawClusters,
			totalCatalogSidecarClusters,
			totalRegenerableCacheClusters,
			totalDerivedExportClusters,
			totalRawJpgPairClusters,
			totalLightroomClusters,
			totalCaptureOneClusters,
			distinctShootStemsCount,
			efficiencyPct,
		},
		familyBreakdown,
		clusters: filteredClusters,
	}
}

/**
 * Quote a POSIX shell argument safely using single quotes.
 *
 * @param {string} value Raw string.
 * @return {string} POSIX single-quoted string.
 */
function shellQuote(value) {
	const str = String(value ?? '')
	return `'${str.replace(/'/g, '\'\\\'\'')}'`
}

/**
 * Join Nextcloud data root and normalized artifact path cleanly.
 *
 * @param {string} dataRoot Nextcloud data root directory.
 * @param {string} relPath Artifact path.
 * @return {string} Combined POSIX path.
 */
function joinDataRoot(dataRoot, relPath) {
	const root = String(dataRoot || '/var/www/nextcloud/data').replace(/\/+$/, '')
	const cleanRel = safeNormalizePath(relPath).replace(/^\/+/, '')
	return `${root}/${cleanRel}`
}

/**
 * Build a safe POSIX DRY_RUN=1 remediation script for Photography RAW, Lightroom/Capture One & Color Grading cleanup.
 *
 * @param {object} analysis Output of analyzePhotoGradingVault.
 * @param {object} [options] Script generation options.
 * @return {string} POSIX shell script.
 */
export function buildPhotoGradingVaultRemediationScript(analysis, options = {}) {
	const dataRoot = String(options.dataRoot || '/var/www/nextcloud/data').trim() || '/var/www/nextcloud/data'
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const summary = (analysis && analysis.summary) || {
		totalClustersCount: 0,
		formattedReclaimableBytes: '0 B',
		reclaimableGb: '0.00 GB',
		totalReclaimableCopiesCount: 0,
	}

	const lines = [
		'#!/usr/bin/env sh',
		'set -eu',
		'# DuplicateFinder Photography RAW, Lightroom/Capture One & Color Grading Vault Remediation Script',
		`# Schema: ${PHOTO_GRADING_VAULT_SCHEMA}`,
		`# Clusters: ${summary.totalClustersCount} | Reclaimable: ${summary.formattedReclaimableBytes} (${summary.reclaimableGb}) | Targets: ${summary.totalReclaimableCopiesCount}`,
		'# Strict conservation: active RAW originals, .xmp/.cos/.eip sidecars, and .lrcat catalogs are never removed by default.',
		'# Default is safe dry-run mode. Run with DRY_RUN=0 sh script.sh to apply.',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'',
		'run_cmd() {',
		'  if [ "$DRY_RUN" = "0" ]; then',
		'    "$@"',
		'  else',
		'    printf "[DRY_RUN=1] %s\\n" "$*"',
		'  fi',
		'}',
		'',
	]

	let actionCount = 0

	for (const cluster of clusters) {
		const targets = (cluster.members || []).filter(m => m.actionType === 'prune' || m.actionType === 'hardlink')
		if (!targets.length) {
			continue
		}
		const anchorPath = joinDataRoot(dataRoot, cluster.survivor.path)
		lines.push(`# Photo Grading Vault: ${cluster.vaultKey} [${cluster.duplicationBadge} / ${cluster.workflowSuite}] (${cluster.formattedReclaimableBytes})`)
		lines.push(`# Anchor: ${anchorPath}`)

		for (const target of targets) {
			const targetPath = joinDataRoot(dataRoot, target.path)
			actionCount += 1
			if (target.actionType === 'hardlink') {
				lines.push(`if [ -f ${shellQuote(anchorPath)} ] && [ -f ${shellQuote(targetPath)} ]; then`)
				lines.push(`  run_cmd ln -f ${shellQuote(anchorPath)} ${shellQuote(targetPath)}`)
				lines.push('fi')
			} else {
				lines.push(`if [ -f ${shellQuote(anchorPath)} ] && [ -f ${shellQuote(targetPath)} ]; then`)
				lines.push(`  run_cmd rm -f ${shellQuote(targetPath)}`)
				lines.push('fi')
			}
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('# No actionable previews/proxies or derived export duplicates under active RAW, .xmp, and .lrcat conservation shields.')
	} else {
		lines.push('# After applying with DRY_RUN=0, refresh Nextcloud filecache:')
		lines.push('# sudo -u www-data php /var/www/nextcloud/occ files:scan --all')
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe CSV audit report.
 *
 * @param {object} analysis Output of analyzePhotoGradingVault.
 * @return {string} CSV content.
 */
export function buildPhotoGradingVaultCsvReport(analysis) {
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const headers = [
		'ShootWorkspace',
		'ShootStem',
		'DuplicationClass',
		'RawJpgPair',
		'LineageStatus',
		'WorkflowSuite',
		'WorkflowStage',
		'ShootSpec',
		'Family',
		'Format',
		'RawOriginalVerified',
		'XmpSidecarVerified',
		'Verdict',
		'Action',
		'AuthorityScore',
		'SizeBytes',
		'Path',
		'Reason',
	]

	const rows = [headers.map(escapeCsvCell).join(',')]

	for (const cluster of clusters) {
		for (const member of cluster.members || []) {
			rows.push([
				cluster.shootWorkspace,
				cluster.shootStem,
				cluster.duplicationClass,
				cluster.isRawJpgPair ? 'yes' : 'no',
				cluster.lineageBadge,
				cluster.workflowSuite,
				cluster.workflowStage,
				cluster.shootSpec,
				cluster.family,
				member.meta.formatBadge,
				cluster.hasRawOriginalInVault ? 'yes' : 'no',
				cluster.hasXmpSidecarInVault ? 'yes' : 'no',
				member.verdict,
				member.actionType,
				String(member.authorityScore),
				String(member.size),
				member.path,
				member.verdictReason,
			].map(escapeCsvCell).join(','))
		}
	}

	return rows.join('\n')
}

/**
 * Build a structured JSON audit manifest.
 *
 * @param {object} analysis Output of analyzePhotoGradingVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildPhotoGradingVaultJsonReport(analysis) {
	const payload = {
		schema: PHOTO_GRADING_VAULT_SCHEMA,
		generatedAt: analysis && analysis.generatedAt ? analysis.generatedAt : new Date().toISOString(),
		options: analysis ? analysis.options : {},
		summary: analysis ? analysis.summary : {},
		familyBreakdown: analysis ? analysis.familyBreakdown : [],
		clusters: (analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []).map(cluster => ({
			groupKey: cluster.groupKey,
			primaryGroupId: cluster.primaryGroupId,
			hash: cluster.hash,
			shootWorkspace: cluster.shootWorkspace,
			shootStem: cluster.shootStem,
			workflowSuite: cluster.workflowSuite,
			workflowStage: cluster.workflowStage,
			shootSpec: cluster.shootSpec,
			family: cluster.family,
			formatBadge: cluster.formatBadge,
			duplicationClass: cluster.duplicationClass,
			duplicationBadge: cluster.duplicationBadge,
			lineageBadge: cluster.lineageBadge,
			isRawJpgPair: cluster.isRawJpgPair,
			hasRawOriginalInVault: cluster.hasRawOriginalInVault,
			hasXmpSidecarInVault: cluster.hasXmpSidecarInVault,
			hasActiveCatalogInCluster: cluster.hasActiveCatalogInCluster,
			riskState: cluster.riskState,
			reclaimableBytes: cluster.reclaimableBytes,
			reclaimableGb: cluster.reclaimableGb,
			rawDuplicateBytes: cluster.rawDuplicateBytes,
			members: (cluster.members || []).map(m => ({
				path: m.path,
				size: m.size,
				artifactKind: m.meta.artifactKind,
				authorityScore: m.authorityScore,
				verdict: m.verdict,
				actionType: m.actionType,
				verdictReason: m.verdictReason,
			})),
		})),
	}
	return JSON.stringify(payload, null, 2)
}

/**
 * Build a Nextcloud desktop client .sync-exclude.lst snippet for Lightroom/Capture One preview pyramids,
 * proxy folders, and regenerable color grading caches.
 *
 * @param {object} analysis Output of analyzePhotoGradingVault.
 * @return {string} Sync exclude rules.
 */
export function buildPhotoGradingVaultSyncExcludeSnippet(analysis) {
	const cacheCount = analysis && analysis.summary ? analysis.summary.totalRegenerableCacheClusters : 0
	const pairCount = analysis && analysis.summary ? analysis.summary.totalRawJpgPairClusters : 0
	return [
		'# DuplicateFinder Photography RAW, Lightroom/Capture One & Color Grading Sync Exclusions',
		`# Detected regenerable cache clusters: ${cacheCount} | RAW+JPG pair clusters: ${pairCount}`,
		'Previews.lrdata/',
		'Smart Previews.lrdata/',
		'Helper.lrdata/',
		'Sync.lrdata/',
		'*.lrdata/',
		'*.lrprev',
		'*.lrcat-wal',
		'*.lrcat-shm',
		'*.lrcat.lock',
		'Proxies/',
		'Cache/',
		'CaptureOne/Cache/',
		'CaptureOne/Cache/Proxies/',
		'CaptureOne/Cache/Thumbnails/',
		'*.cot',
		'Thumbs.db',
		'.DS_Store',
	].join('\n')
}
