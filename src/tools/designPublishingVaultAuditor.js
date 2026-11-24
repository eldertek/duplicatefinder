/**
 * Pure Creative Design Package, Print Proof & Typography Font Archive Auditor.
 * Classifies and audits duplicate clusters across 4 Creative Studio & Print Preflight families:
 * - Master Layout Sources (*.psd, *.psb, *.ai, *.indd, *.idml, *.fig, *.sketch, *.afdesign, *.afphoto, *.afpub in master folders / 01_Master/)
 * - Print & Web Export Proofs (*_PRINT_CMYK.pdf, *_X1a.pdf, *_BLEED.pdf, *_BAT_v*.pdf, *_web_preview.pdf, *.eps sharing a conserved master lineage)
 * - Packaged Fonts & Linked Clones (Document fonts/*.otf|*.ttf|*.woff2, Links/* duplicated across campaigns outside _FontVault/ / _SharedAssets/)
 * - Creative Recovery & Preview Caches (*.idlk, InDesign Recovery/, Photoshop Temp*, *.tmp, .BridgeCache*, _thumb_cache.*)
 *
 * Enforces strict studio governance defaults:
 * - Protects master-layout-sources by default (blocked-master-layout-source)
 * - Protects canonical font & shared asset libraries (_FontVault/ / _SharedAssets/) as font-library-anchor
 * - Blocks pruning of print/export PDFs and EPS proofs lacking a verified editable master source (blocked-unverified-design-master)
 *
 * Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const DESIGN_PUBLISHING_VAULT_SCHEMA = 'duplicatefinder.design-publishing-vault-auditor.v1'

export const DESIGN_PUBLISHING_FAMILIES = Object.freeze([
	'all',
	'master-layout-sources',
	'print-and-web-export-proofs',
	'packaged-fonts-and-linked-clones',
	'creative-recovery-and-preview-caches',
])

export const DESIGN_PUBLISHING_FAMILY_META = Object.freeze({
	'master-layout-sources': {
		id: 'master-layout-sources',
		label: 'Master Layout Sources',
		shortLabel: 'Masters (*.psd/*.psb/*.ai/*.indd/*.fig/*.sketch/*.af*)',
	},
	'print-and-web-export-proofs': {
		id: 'print-and-web-export-proofs',
		label: 'Print & Web Export Proofs',
		shortLabel: 'Proofs (*_PRINT_CMYK/_X1a/_BLEED/_BAT_v*/_web_preview.pdf/*.eps)',
	},
	'packaged-fonts-and-linked-clones': {
		id: 'packaged-fonts-and-linked-clones',
		label: 'Packaged Fonts & Linked Clones',
		shortLabel: 'Fonts & Links (Document fonts/*, Links/*, _FontVault/, _SharedAssets/)',
	},
	'creative-recovery-and-preview-caches': {
		id: 'creative-recovery-and-preview-caches',
		label: 'Creative Recovery & Preview Caches',
		shortLabel: 'Locks & Caches (*.idlk, InDesign Recovery/, Photoshop Temp*, .BridgeCache*, _thumb_cache.*)',
	},
})

export const DESIGN_PUBLISHING_STRATEGIES = Object.freeze([
	'consolidate-packaged-fonts-and-links',
	'prune-superseded-proof-pdfs',
	'prune-stale-creative-locks-and-caches',
])

export const DESIGN_PUBLISHING_SURVIVOR_RULES = Object.freeze([
	'master-and-font-vault-first',
	'newest-proof-version-first',
	'print-cmyk-x1a-first',
	'shortest-path',
])

export const DESIGN_PUBLISHING_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'master-source',
	'font-library-anchor',
	'print-proof',
	'unverified-master',
	'recovery-cache',
	'shielded',
])

export const DESIGN_PUBLISHING_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const DESIGN_PUBLISHING_PRESETS = Object.freeze([
	{
		id: 'all-design-publishing-audit',
		name: 'All Design & Print Vault Audit',
		description: 'Audit master layouts, print/BAT PDFs, packaged fonts/Links, and creative locks while protecting masters, _FontVault/ anchors, and unverified PDFs.',
		familyFilter: 'all',
		strategy: 'consolidate-packaged-fonts-and-links',
		survivorRule: 'master-and-font-vault-first',
		protectMasterSources: true,
		protectFontLibraryAnchor: true,
		keepBatVersions: 1,
		staleRecoveryDays: 3,
		minSizeMb: 0,
	},
	{
		id: 'consolidate-packaged-fonts-and-links',
		name: 'Consolidate Packaged Fonts & Links',
		description: 'Hardlink-consolidate campaign Document fonts/* and Links/* duplicates onto canonical _FontVault/ and _SharedAssets/ anchors without breaking package paths.',
		familyFilter: 'packaged-fonts-and-linked-clones',
		strategy: 'consolidate-packaged-fonts-and-links',
		survivorRule: 'master-and-font-vault-first',
		protectMasterSources: true,
		protectFontLibraryAnchor: true,
		keepBatVersions: 1,
		staleRecoveryDays: 3,
		minSizeMb: 0,
	},
	{
		id: 'prune-superseded-proof-pdfs',
		name: 'Prune Superseded Print & BAT PDFs',
		description: 'Reclaim older *_BAT_v*.pdf, *_web_preview.pdf, and redundant print proofs only when an editable master layout source is verified.',
		familyFilter: 'print-and-web-export-proofs',
		strategy: 'prune-superseded-proof-pdfs',
		survivorRule: 'newest-proof-version-first',
		protectMasterSources: true,
		protectFontLibraryAnchor: true,
		keepBatVersions: 1,
		staleRecoveryDays: 3,
		minSizeMb: 0,
	},
	{
		id: 'prune-stale-creative-locks',
		name: 'Prune Stale Locks & Preview Caches',
		description: 'Reclaim stale *.idlk locks, InDesign Recovery/, Photoshop Temp*, *.tmp, .BridgeCache*, and _thumb_cache.* beyond active session threshold.',
		familyFilter: 'creative-recovery-and-preview-caches',
		strategy: 'prune-stale-creative-locks-and-caches',
		survivorRule: 'newest-proof-version-first',
		protectMasterSources: true,
		protectFontLibraryAnchor: true,
		keepBatVersions: 1,
		staleRecoveryDays: 3,
		minSizeMb: 0,
	},
	{
		id: 'master-and-font-vault-shield',
		name: 'Master Layout & Font Vault Shield',
		description: 'Inspect conserved *.psd/*.psb/*.ai/*.indd/*.fig/*.sketch/*.af* master sources inside 01_Master/ and studio vaults under strict protection.',
		familyFilter: 'master-layout-sources',
		strategy: 'consolidate-packaged-fonts-and-links',
		survivorRule: 'master-and-font-vault-first',
		protectMasterSources: true,
		protectFontLibraryAnchor: true,
		keepBatVersions: 1,
		staleRecoveryDays: 3,
		minSizeMb: 0,
	},
])

const MASTER_LAYOUT_EXT_SET = new Set([
	'psd',
	'psb',
	'ai',
	'indd',
	'idml',
	'fig',
	'sketch',
	'afdesign',
	'afphoto',
	'afpub',
])

const FONT_EXT_SET = new Set(['otf', 'ttf', 'woff2', 'ttc', 'otc', 'woff'])
const LINKED_MEDIA_EXT_SET = new Set([
	'tif',
	'tiff',
	'png',
	'jpg',
	'jpeg',
	'webp',
	'svg',
	'eps',
	'psd',
	'psb',
	'ai',
	'pdf',
	'bmp',
	'heic',
])

const INDESIGN_RECOVERY_DIR_RE = /\/indesign[\s_-]*recovery(?:\/|$)/i
const PHOTOSHOP_TEMP_RE = /^photoshop[\s_-]*temp/i
const BRIDGE_CACHE_RE = /^\.bridgecache/i
const THUMB_CACHE_RE = /^_thumb_cache\./i
const RECOVERY_LOCK_EXT_SET = new Set(['idlk', 'tmp'])

const DOCUMENT_FONTS_DIR_RE = /\/document[\s_-]*fonts(?:\/|$)/i
const LINKS_DIR_RE = /\/links(?:\/|$)/i
const CANONICAL_FONT_VAULT_RE = /(\/_fontvault(?:\/|$)|\/fontvault(?:\/|$)|\/canonical[_-]?fonts(?:\/|$)|\/brand[_-]?fonts(?:\/|$)|\/foundry(?:\/|$))/i
const CANONICAL_SHARED_ASSETS_RE = /(\/_sharedassets(?:\/|$)|\/shared[_-]?assets(?:\/|$))/i
const GENERIC_FONT_DIR_RE = /\/fonts(?:\/|$)/i

const MASTER_FOLDER_RE = /(\/0?1_masters?(?:\/|$)|\/0?0_masters?(?:\/|$)|\/masters?(?:\/|$)|\/sources?(?:\/|$)|\/layout[_-]?masters?(?:\/|$)|\/__groupfolders\/\d+\/(?:0?1_masters?|masters?|studio))/i
const PRINT_PROOF_FOLDER_RE = /(\/0?2_print[_-]?proofs?(?:\/|$)|\/print[_-]?proofs?(?:\/|$)|\/0?3_exports?(?:\/|$)|\/bat(?:\/|$)|\/proofs?(?:\/|$)|\/press[_-]?ready(?:\/|$)|\/preflight(?:\/|$))/i
const STAGING_BLOAT_PATH_RE = /(\/downloads\/|\/telechargements\/|\/tmp\/|\/temp\/|\/scratch\/|\/incoming\/|\/staging\/|\/wetransfer\/|\/airdrop\/|\/export_tmp\/|\/mail_attachments\/)/i

const PRINT_CMYK_PDF_RE = /_print[_-]?cmyk(?:_v\d+(?:\.\d+)?)?\.pdf$/i
const PDF_X1A_RE = /_(?:pdf)?x-?1a(?:_v\d+(?:\.\d+)?)?\.pdf$/i
const BLEED_PDF_RE = /_bleed(?:_v\d+(?:\.\d+)?)?\.pdf$/i
const BAT_PROOF_PDF_RE = /_bat(?:_v(\d+)(?:\.\d+)?)?\.pdf$/i
const WEB_PREVIEW_PDF_RE = /_(?:web_)?preview(?:_v\d+(?:\.\d+)?)?\.pdf$/i
const GENERIC_PRESS_PROOF_PDF_RE = /_(?:print|cmyk|press|proof|preflight|rip)(?:_v\d+(?:\.\d+)?)?\.pdf$/i

const COPY_SUFFIX_RE = /\s-\s?copy(?:\s*\(\d+\))?|\s*\(\d+\)|_copy\b|\[\d{4}-\d{2}-\d{2}[^\]]*\]/gi
const PROOF_SUFFIX_STRIP_RE = /(?:_print[_-]?cmyk|_(?:pdf)?x-?1a|_bleed|_bat(?:_v\d+(?:\.\d+)?)?|_web_preview|_preview|_press|_proof|_preflight|_rip|_cmyk|_rgb|_v\d+(?:\.\d+)?|_final|_ok|_def)+$/i
const STRICT_SHA256_HEX_RE = /^[a-f0-9]{64}$/i

const TIER_LABELS = Object.freeze({
	'master-layout-anchor': 'Master Layout Source Anchor',
	'font-library-anchor': 'Canonical Font / Shared Vault Anchor',
	'print-master-proof': 'Print-Ready Proof (CMYK / X-1a / Bleed / BAT)',
	'web-preview-proof': 'Web Preview / Superseded Proof',
	'packaged-font-or-link': 'Packaged Font / Campaign Link Clone',
	'creative-recovery-cache': 'Creative Lock / Recovery / Preview Cache',
})

const TIER_AUTHORITY = Object.freeze({
	'master-layout-anchor': 98,
	'font-library-anchor': 96,
	'print-master-proof': 74,
	'web-preview-proof': 44,
	'packaged-font-or-link': 52,
	'creative-recovery-cache': 16,
})

const VERDICT_LABELS = Object.freeze({
	'keep-canonical-survivor': 'Keep Canonical Studio Anchor',
	'consolidate-to-font-vault': 'Consolidate via Hardlink to Vault Anchor',
	'consolidate-to-studio-anchor': 'Consolidate Staging Twin to Master Anchor',
	'reclaim-superseded-proof-pdf': 'Prune Superseded Print / Web Proof',
	'reclaim-stale-creative-cache': 'Prune Stale Lock / Recovery / Cache',
	'blocked-master-layout-source': 'Protected: Master Layout Source',
	'blocked-font-library-anchor': 'Protected: Font / Shared Vault Anchor',
	'blocked-unverified-design-master': 'Blocked: No Verified Design Master',
	'blocked-active-creative-lock': 'Shielded: Active Lock / Fresh Cache',
	'blocked-recent-bat-proof': 'Shielded: Retained BAT / Print Anchor',
	'blocked-strategy-scope': 'Shielded: Outside Active Strategy',
	'blocked-manual-shield': 'Blocked: Operator Shield',
	excluded: 'Excluded by Operator',
})

const FAMILY_PRIORITY = Object.freeze({
	'master-layout-sources': 4,
	'packaged-fonts-and-linked-clones': 3,
	'print-and-web-export-proofs': 2,
	'creative-recovery-and-preview-caches': 1,
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
 * Extract canonical creative design lineage stem from a raw filename stem.
 *
 * @param {string} rawStem Basename without file extension.
 * @return {string} Canonical lineage stem.
 */
function extractDesignLineageStem(rawStem) {
	let clean = String(rawStem || '').replace(COPY_SUFFIX_RE, '').trim()
	let prev = ''
	while (clean !== prev) {
		prev = clean
		clean = clean.replace(PROOF_SUFFIX_STRIP_RE, '')
	}
	clean = clean
		.replace(/[-_.\s]{2,}/g, '_')
		.replace(/^[\s_.-]+|[\s_.-]+$/g, '')
	return clean || String(rawStem || '').replace(/^[\s_.-]+|[\s_.-]+$/g, '')
}

/**
 * Extract campaign folder identifier when present in a package path.
 *
 * @param {string} normalizedPath Normalized path.
 * @return {string} Campaign folder name or empty string.
 */
function extractPackageCampaignLabel(normalizedPath) {
	const raw = String(normalizedPath || '')
	const match = raw.match(/\/([^/]+)\/(?:document[\s_-]*fonts|links|0?1_masters?|0?2_print[_-]?proofs?)(?:\/|$)/i)
	return match ? match[1] : ''
}

/**
 * Parse Creative Design Package, Print Proof & Font Archive metadata from basename and path.
 *
 * @param {string} basename File basename.
 * @param {string} [normalizedPath=''] Normalized file path.
 * @return {object} Parsed classification flags, lineage stem, proof flavor, and tags.
 */
export function parseDesignPublishingAssetInfo(basename, normalizedPath = '') {
	const rawBase = String(basename || '')
	const lowerBase = rawBase.toLowerCase()
	const lowerPath = String(normalizedPath || '').toLowerCase()
	const singleExt = extractSingleExtension(lowerBase)

	const isInDesignRecovery = INDESIGN_RECOVERY_DIR_RE.test(lowerPath)
	const isPhotoshopTemp = PHOTOSHOP_TEMP_RE.test(lowerBase)
	const isBridgeCache = BRIDGE_CACHE_RE.test(lowerBase)
	const isThumbCache = THUMB_CACHE_RE.test(lowerBase)
	const isIdlkOrTmp = RECOVERY_LOCK_EXT_SET.has(singleExt)

	const isRecoveryOrPreviewCache = Boolean(
		isInDesignRecovery
		|| isPhotoshopTemp
		|| isBridgeCache
		|| isThumbCache
		|| isIdlkOrTmp
	)

	const isDocumentFontsPath = DOCUMENT_FONTS_DIR_RE.test(lowerPath)
	const isLinksPath = LINKS_DIR_RE.test(lowerPath)
	const isCanonicalFontVaultPath = CANONICAL_FONT_VAULT_RE.test(lowerPath)
	const isCanonicalSharedAssetsPath = CANONICAL_SHARED_ASSETS_RE.test(lowerPath)
	const isGenericFontDirPath = GENERIC_FONT_DIR_RE.test(lowerPath)
	const isMasterFolderPath = MASTER_FOLDER_RE.test(lowerPath)
	const isPrintProofFolderPath = PRINT_PROOF_FOLDER_RE.test(lowerPath)
	const isStagingBloatPath = STAGING_BLOAT_PATH_RE.test(lowerPath)

	const isFontFile = FONT_EXT_SET.has(singleExt)
	const isMasterExt = MASTER_LAYOUT_EXT_SET.has(singleExt)

	const isPackagedFontOrLinkedClone = Boolean(
		!isRecoveryOrPreviewCache
		&& (
			isFontFile
			|| isDocumentFontsPath
			|| (isLinksPath && (LINKED_MEDIA_EXT_SET.has(singleExt) || Boolean(singleExt)))
			|| (isCanonicalSharedAssetsPath && (LINKED_MEDIA_EXT_SET.has(singleExt) || isFontFile))
			|| (isCanonicalFontVaultPath && isFontFile)
			|| (isGenericFontDirPath && isFontFile)
		)
	)

	const isMasterLayoutSource = Boolean(
		!isRecoveryOrPreviewCache
		&& !isPackagedFontOrLinkedClone
		&& isMasterExt
	)

	let proofFlavor = 'none'
	let batVersion = null
	if (!isRecoveryOrPreviewCache && !isPackagedFontOrLinkedClone && !isMasterLayoutSource) {
		if (singleExt === 'eps') {
			proofFlavor = 'eps'
		} else if (singleExt === 'pdf') {
			const batMatch = lowerBase.match(BAT_PROOF_PDF_RE)
			if (PRINT_CMYK_PDF_RE.test(lowerBase)) {
				proofFlavor = 'print-cmyk'
			} else if (PDF_X1A_RE.test(lowerBase)) {
				proofFlavor = 'x1a'
			} else if (BLEED_PDF_RE.test(lowerBase)) {
				proofFlavor = 'bleed'
			} else if (batMatch) {
				proofFlavor = 'bat'
				batVersion = batMatch[1] ? Number.parseInt(batMatch[1], 10) : 1
			} else if (WEB_PREVIEW_PDF_RE.test(lowerBase)) {
				proofFlavor = 'web-preview'
			} else if (GENERIC_PRESS_PROOF_PDF_RE.test(lowerBase) || isPrintProofFolderPath) {
				proofFlavor = 'proof-pdf'
			}
		}
	}

	const isPrintAndWebExportProof = proofFlavor !== 'none'
	const isFontLibraryAnchor = Boolean(
		isPackagedFontOrLinkedClone
		&& (isCanonicalFontVaultPath || isCanonicalSharedAssetsPath)
		&& !isStagingBloatPath
	)

	const rawStem = singleExt && lowerBase.endsWith(`.${singleExt}`)
		? rawBase.slice(0, rawBase.length - singleExt.length - 1)
		: rawBase
	const designLineageStem = extractDesignLineageStem(rawStem)
	const campaignLabel = extractPackageCampaignLabel(normalizedPath)

	const artifactTags = []
	const pushTag = tag => {
		const norm = String(tag || '').trim()
		if (norm && !artifactTags.includes(norm)) {
			artifactTags.push(norm)
		}
	}

	if (isMasterLayoutSource) {
		pushTag(`master:${singleExt}`)
		if (isMasterFolderPath) {
			pushTag('01_Master')
		}
	}
	if (isPrintAndWebExportProof) {
		pushTag(`proof:${proofFlavor}`)
		if (batVersion !== null) {
			pushTag(`bat:v${batVersion}`)
		}
	}
	if (isPackagedFontOrLinkedClone) {
		if (isFontLibraryAnchor) {
			pushTag(isCanonicalFontVaultPath ? 'vault:_FontVault' : 'vault:_SharedAssets')
		} else if (isDocumentFontsPath) {
			pushTag('package:Document fonts')
		} else if (isLinksPath) {
			pushTag('package:Links')
		} else if (isFontFile) {
			pushTag(`font:${singleExt}`)
		}
	}
	if (isRecoveryOrPreviewCache) {
		if (singleExt === 'idlk') {
			pushTag('lock:idlk')
		} else if (isInDesignRecovery) {
			pushTag('recovery:InDesign')
		} else if (isPhotoshopTemp) {
			pushTag('temp:Photoshop')
		} else if (isBridgeCache) {
			pushTag('cache:Bridge')
		} else if (isThumbCache) {
			pushTag('cache:thumb')
		} else {
			pushTag('temp:tmp')
		}
	}
	if (campaignLabel) {
		pushTag(`pkg:${campaignLabel}`)
	}

	return {
		rawStem,
		designLineageStem: designLineageStem || rawStem || rawBase,
		extension: singleExt,
		proofFlavor,
		batVersion,
		campaignLabel,
		artifactTags,
		artifactTag: artifactTags.length > 0 ? artifactTags.join(', ') : 'none',
		isMasterLayoutSource,
		isPrintAndWebExportProof,
		isPackagedFontOrLinkedClone,
		isRecoveryOrPreviewCache,
		isFontFile,
		isDocumentFontsPath,
		isLinksPath,
		isCanonicalFontVaultPath,
		isCanonicalSharedAssetsPath,
		isFontLibraryAnchor,
		isMasterFolderPath,
		isPrintProofFolderPath,
		isStagingBloatPath,
	}
}

/**
 * Classify a file path into one of the 4 Creative Design Package, Print Proof & Font Archive families.
 *
 * @param {string} rawPath File path.
 * @return {object|null} Classification metadata or null for unrelated files.
 */
export function classifyDesignPublishingAsset(rawPath) {
	const normalized = normalizePathForDiff(rawPath) || String(rawPath || '')
	const basename = extractBasename(normalized)
	const lowerBase = basename.toLowerCase()

	if (!lowerBase) {
		return null
	}

	const info = parseDesignPublishingAssetInfo(basename, normalized)

	if (info.isRecoveryOrPreviewCache) {
		return {
			matched: true,
			family: 'creative-recovery-and-preview-caches',
			familyLabel: DESIGN_PUBLISHING_FAMILY_META['creative-recovery-and-preview-caches'].label,
			...info,
		}
	}

	if (info.isPackagedFontOrLinkedClone) {
		return {
			matched: true,
			family: 'packaged-fonts-and-linked-clones',
			familyLabel: DESIGN_PUBLISHING_FAMILY_META['packaged-fonts-and-linked-clones'].label,
			...info,
		}
	}

	if (info.isMasterLayoutSource) {
		return {
			matched: true,
			family: 'master-layout-sources',
			familyLabel: DESIGN_PUBLISHING_FAMILY_META['master-layout-sources'].label,
			...info,
		}
	}

	if (info.isPrintAndWebExportProof) {
		return {
			matched: true,
			family: 'print-and-web-export-proofs',
			familyLabel: DESIGN_PUBLISHING_FAMILY_META['print-and-web-export-proofs'].label,
			...info,
		}
	}

	return null
}

/**
 * Build dataset-wide verification hints for master layout lineage, canonical font anchors, and BAT proof versions.
 *
 * @param {Array<object>} duplicates Loaded duplicate groups.
 * @param {object} options Normalized options.
 * @return {object} Dataset-wide verification maps and sets.
 */
function buildDatasetDesignPublishingHints(duplicates, options) {
	const verifiedDesignMasterStems = new Set()
	const canonicalFontLibraryStems = new Set()
	const batVersionsByStem = new Map()
	const batRankByKey = new Map()

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
			const info = parseDesignPublishingAssetInfo(extractBasename(normalized), normalized)
			const stemLower = info.designLineageStem.toLowerCase()
			const mtimeSec = getFileMtimeSeconds(file) ?? 0

			if (info.isMasterLayoutSource && !info.isStagingBloatPath && stemLower) {
				verifiedDesignMasterStems.add(stemLower)
			}

			if (info.isFontLibraryAnchor && stemLower) {
				canonicalFontLibraryStems.add(stemLower)
			}

			if (info.isPrintAndWebExportProof && stemLower) {
				if (!batVersionsByStem.has(stemLower)) {
					batVersionsByStem.set(stemLower, [])
				}
				const proofPriorityMap = {
					x1a: 4,
					'print-cmyk': 4,
					bleed: 3,
					bat: 2,
					'proof-pdf': 1,
					eps: 1,
					'web-preview': 0,
				}
				batVersionsByStem.get(stemLower).push({
					selectionKey,
					proofFlavor: info.proofFlavor,
					proofPriority: proofPriorityMap[info.proofFlavor] ?? 1,
					batVersion: info.batVersion ?? 0,
					mtimeSec,
					isWebPreview: info.proofFlavor === 'web-preview',
				})
			}
		}
	}

	for (const entries of batVersionsByStem.values()) {
		const sorted = [...entries].sort((a, b) => {
			if (a.isWebPreview !== b.isWebPreview) {
				return a.isWebPreview ? 1 : -1
			}
			if (a.proofPriority !== b.proofPriority) {
				return b.proofPriority - a.proofPriority
			}
			if (a.batVersion !== b.batVersion) {
				return b.batVersion - a.batVersion
			}
			if (a.mtimeSec !== b.mtimeSec) {
				return b.mtimeSec - a.mtimeSec
			}
			return a.selectionKey.localeCompare(b.selectionKey)
		})
		sorted.forEach((entry, idx) => {
			batRankByKey.set(entry.selectionKey, idx)
		})
	}

	return {
		verifiedDesignMasterStems,
		canonicalFontLibraryStems,
		batRankByKey,
	}
}

/**
 * Inspect governance tier, verified design master status, and font library anchoring for a cluster member.
 *
 * @param {object} file Duplicate file entry.
 * @param {object} classification Classification metadata.
 * @param {string} selectionKey Unique member selection key.
 * @param {number} referenceTimeSec Reference epoch seconds.
 * @param {object} options Normalized analysis options.
 * @param {object} [datasetHints={}] Dataset-wide master and font vault hints.
 * @return {object} Member governance context.
 */
export function inspectDesignPublishingMemberContext(file, classification, selectionKey, referenceTimeSec, options, datasetHints = {}) {
	const normalizedPath = normalizePathForDiff(file && file.path) || String((file && file.path) || '')
	const basename = extractBasename(normalizedPath)
	const parsed = parseDesignPublishingAssetInfo(basename, normalizedPath)
	const mtimeSec = getFileMtimeSeconds(file)
	const ageDays = mtimeSec !== null && Number.isFinite(referenceTimeSec)
		? Math.max(0, Math.floor((referenceTimeSec - mtimeSec) / 86400))
		: null

	const isRecoveryOrPreviewCache = Boolean(parsed.isRecoveryOrPreviewCache || classification.family === 'creative-recovery-and-preview-caches')
	const isPackagedFontOrLinkedClone = Boolean(!isRecoveryOrPreviewCache && (parsed.isPackagedFontOrLinkedClone || classification.family === 'packaged-fonts-and-linked-clones'))
	const isMasterLayoutSource = Boolean(!isRecoveryOrPreviewCache && !isPackagedFontOrLinkedClone && (parsed.isMasterLayoutSource || classification.family === 'master-layout-sources'))
	const isPrintAndWebExportProof = Boolean(!isRecoveryOrPreviewCache && !isPackagedFontOrLinkedClone && !isMasterLayoutSource && (parsed.isPrintAndWebExportProof || classification.family === 'print-and-web-export-proofs'))

	const stemLower = parsed.designLineageStem.toLowerCase()
	const hasVerifiedDesignMaster = Boolean(
		isMasterLayoutSource
		|| (stemLower && datasetHints.verifiedDesignMasterStems && datasetHints.verifiedDesignMasterStems.has(stemLower))
	)
	const hasCanonicalFontVaultAnchor = Boolean(
		parsed.isFontLibraryAnchor
		|| (stemLower && datasetHints.canonicalFontLibraryStems && datasetHints.canonicalFontLibraryStems.has(stemLower))
	)

	const proofRank = datasetHints.batRankByKey && datasetHints.batRankByKey.has(selectionKey)
		? datasetHints.batRankByKey.get(selectionKey)
		: 999
	const isWebPreviewProof = parsed.proofFlavor === 'web-preview'
	const isPrintReadyProof = isPrintAndWebExportProof && !isWebPreviewProof
	const isRetainedLatestProof = Boolean(
		isPrintAndWebExportProof
		&& !isWebPreviewProof
		&& !parsed.isStagingBloatPath
		&& proofRank < options.keepBatVersions
	)

	const isStaleRecoveryCache = ageDays === null || ageDays >= options.staleRecoveryDays
	const isFreshRecoveryCache = ageDays !== null && ageDays < options.staleRecoveryDays

	let tier = 'creative-recovery-cache'
	if (isMasterLayoutSource) {
		tier = 'master-layout-anchor'
	} else if (parsed.isFontLibraryAnchor) {
		tier = 'font-library-anchor'
	} else if (isPackagedFontOrLinkedClone) {
		tier = 'packaged-font-or-link'
	} else if (isPrintAndWebExportProof) {
		tier = isWebPreviewProof ? 'web-preview-proof' : 'print-master-proof'
	}

	let authorityScore = TIER_AUTHORITY[tier] || 20
	if (isMasterLayoutSource && parsed.isMasterFolderPath && !parsed.isStagingBloatPath) {
		authorityScore = 100
	}
	if (parsed.isFontLibraryAnchor) {
		authorityScore = 98
	}
	if (isPrintAndWebExportProof) {
		if (parsed.proofFlavor === 'x1a' || parsed.proofFlavor === 'print-cmyk') {
			authorityScore += 10
		} else if (parsed.proofFlavor === 'bleed') {
			authorityScore += 6
		} else if (parsed.proofFlavor === 'bat' && parsed.batVersion !== null) {
			authorityScore += Math.min(12, parsed.batVersion)
		}
		if (!hasVerifiedDesignMaster) {
			authorityScore += 14
		}
		if (parsed.isPrintProofFolderPath) {
			authorityScore += 4
		}
	}
	if (parsed.isStagingBloatPath) {
		authorityScore -= 24
	}
	if (isRecoveryOrPreviewCache && isStaleRecoveryCache) {
		authorityScore -= 6
	}

	return {
		tier,
		tierLabel: TIER_LABELS[tier] || TIER_LABELS['creative-recovery-cache'],
		authorityScore,
		extension: parsed.extension || classification.extension || '',
		rawStem: parsed.rawStem,
		designLineageStem: parsed.designLineageStem,
		proofFlavor: parsed.proofFlavor,
		batVersion: parsed.batVersion,
		campaignLabel: parsed.campaignLabel,
		artifactTags: parsed.artifactTags,
		artifactTag: parsed.artifactTag,
		isMasterLayoutSource,
		isPrintAndWebExportProof,
		isPackagedFontOrLinkedClone,
		isRecoveryOrPreviewCache,
		isFontLibraryAnchor: parsed.isFontLibraryAnchor,
		isDocumentFontsPath: parsed.isDocumentFontsPath,
		isLinksPath: parsed.isLinksPath,
		isMasterFolderPath: parsed.isMasterFolderPath,
		isPrintProofFolderPath: parsed.isPrintProofFolderPath,
		isStagingBloatPath: parsed.isStagingBloatPath,
		hasVerifiedDesignMaster,
		hasCanonicalFontVaultAnchor,
		isWebPreviewProof,
		isPrintReadyProof,
		isRetainedLatestProof,
		proofRank,
		isStaleRecoveryCache,
		isFreshRecoveryCache,
		mtimeSec,
		ageDays,
	}
}

/**
 * Select the canonical surviving copy inside a Creative Design & Publishing cluster.
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
		if (survivorRule === 'newest-proof-version-first') {
			const verA = a.context.batVersion ?? -1
			const verB = b.context.batVersion ?? -1
			if (verA !== verB) {
				return verB - verA
			}
			const tsA = a.context.mtimeSec ?? -1
			const tsB = b.context.mtimeSec ?? -1
			if (tsA !== tsB) {
				return tsB - tsA
			}
		} else if (survivorRule === 'print-cmyk-x1a-first') {
			const printA = a.context.proofFlavor === 'x1a' || a.context.proofFlavor === 'print-cmyk'
			const printB = b.context.proofFlavor === 'x1a' || b.context.proofFlavor === 'print-cmyk'
			if (printA !== printB) {
				return printA ? -1 : 1
			}
		} else if (survivorRule === 'shortest-path') {
			if (a.normalizedPath.length !== b.normalizedPath.length) {
				return a.normalizedPath.length - b.normalizedPath.length
			}
		} else {
			const anchorA = a.context.isMasterFolderPath || a.context.isFontLibraryAnchor
			const anchorB = b.context.isMasterFolderPath || b.context.isFontLibraryAnchor
			if (anchorA !== anchorB) {
				return anchorA ? -1 : 1
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
 * Determine the deterministic audit verdict for a Creative Design & Publishing cluster member.
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
			note: 'Excluded from Design & Publishing Vault actions by manual operator override.',
		}
	}

	if (survivor && member.selectionKey === survivor.selectionKey) {
		return {
			verdict: 'keep-canonical-survivor',
			verdictLabel: VERDICT_LABELS['keep-canonical-survivor'],
			actionKind: 'keep',
			note: `Canonical ${member.context.tierLabel} retained as the authoritative studio vault anchor.`,
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

	if (options.protectMasterSources && member.context.isMasterLayoutSource && !member.context.isStagingBloatPath) {
		return {
			verdict: 'blocked-master-layout-source',
			verdictLabel: VERDICT_LABELS['blocked-master-layout-source'],
			actionKind: 'shield',
			note: 'Strictly protected by Master Layout Source Guard; editable *.psd/*.psb/*.ai/*.indd/*.fig/*.sketch/*.af* studio sources are never pruned automatically.',
		}
	}

	if (options.protectFontLibraryAnchor && member.context.isFontLibraryAnchor) {
		return {
			verdict: 'blocked-font-library-anchor',
			verdictLabel: VERDICT_LABELS['blocked-font-library-anchor'],
			actionKind: 'shield',
			note: 'Protected as a canonical _FontVault/ or _SharedAssets/ typography and linked asset library anchor.',
		}
	}

	if (options.strategy === 'prune-stale-creative-locks-and-caches') {
		if (!member.context.isRecoveryOrPreviewCache) {
			return {
				verdict: 'blocked-strategy-scope',
				verdictLabel: VERDICT_LABELS['blocked-strategy-scope'],
				actionKind: 'shield',
				note: 'Shielded because active strategy only prunes *.idlk, InDesign Recovery/, Photoshop Temp*, *.tmp, .BridgeCache*, and _thumb_cache.* artifacts.',
			}
		}
		if (member.context.isFreshRecoveryCache) {
			return {
				verdict: 'blocked-active-creative-lock',
				verdictLabel: VERDICT_LABELS['blocked-active-creative-lock'],
				actionKind: 'shield',
				note: `Shielded because creative lock or cache age is below stale threshold (${options.staleRecoveryDays}d).`,
			}
		}
		return {
			verdict: 'reclaim-stale-creative-cache',
			verdictLabel: VERDICT_LABELS['reclaim-stale-creative-cache'],
			actionKind: 'reclaim',
			note: 'Stale InDesign lock, recovery snapshot, Photoshop temp file, or Bridge/thumb cache safe to prune after SHA-256 verification.',
		}
	}

	if (options.strategy === 'prune-superseded-proof-pdfs') {
		if (!member.context.isPrintAndWebExportProof) {
			return {
				verdict: 'blocked-strategy-scope',
				verdictLabel: VERDICT_LABELS['blocked-strategy-scope'],
				actionKind: 'shield',
				note: 'Shielded because active strategy only prunes superseded *_PRINT_CMYK.pdf, *_X1a.pdf, *_BLEED.pdf, *_BAT_v*.pdf, *_web_preview.pdf, and *.eps proofs.',
			}
		}
		if (!member.context.hasVerifiedDesignMaster) {
			return {
				verdict: 'blocked-unverified-design-master',
				verdictLabel: VERDICT_LABELS['blocked-unverified-design-master'],
				actionKind: 'shield',
				note: 'Blocked because no conserved editable master layout source (*.psd/*.ai/*.indd/*.fig/*.af*) matches this proof lineage.',
			}
		}
		if (member.context.isRetainedLatestProof) {
			return {
				verdict: 'blocked-recent-bat-proof',
				verdictLabel: VERDICT_LABELS['blocked-recent-bat-proof'],
				actionKind: 'shield',
				note: `Shielded within retained BAT / Print Proof window (keepBatVersions=${options.keepBatVersions}).`,
			}
		}
		return {
			verdict: 'reclaim-superseded-proof-pdf',
			verdictLabel: VERDICT_LABELS['reclaim-superseded-proof-pdf'],
			actionKind: 'reclaim',
			note: 'Editable design master verified; superseded BAT version, web preview PDF, or redundant print export is safe to prune.',
		}
	}

	if (member.context.isRecoveryOrPreviewCache) {
		if (member.context.isFreshRecoveryCache) {
			return {
				verdict: 'blocked-active-creative-lock',
				verdictLabel: VERDICT_LABELS['blocked-active-creative-lock'],
				actionKind: 'shield',
				note: `Shielded because creative lock or cache age is below stale threshold (${options.staleRecoveryDays}d).`,
			}
		}
		return {
			verdict: 'reclaim-stale-creative-cache',
			verdictLabel: VERDICT_LABELS['reclaim-stale-creative-cache'],
			actionKind: 'reclaim',
			note: 'Stale InDesign lock, recovery snapshot, Photoshop temp file, or Bridge/thumb cache safe to prune after SHA-256 verification.',
		}
	}

	if (member.context.isPrintAndWebExportProof) {
		if (!member.context.hasVerifiedDesignMaster) {
			return {
				verdict: 'blocked-unverified-design-master',
				verdictLabel: VERDICT_LABELS['blocked-unverified-design-master'],
				actionKind: 'shield',
				note: 'Blocked because no conserved editable master layout source (*.psd/*.ai/*.indd/*.fig/*.af*) matches this proof lineage.',
			}
		}
		if (member.context.isRetainedLatestProof) {
			return {
				verdict: 'blocked-recent-bat-proof',
				verdictLabel: VERDICT_LABELS['blocked-recent-bat-proof'],
				actionKind: 'shield',
				note: `Shielded within retained BAT / Print Proof window (keepBatVersions=${options.keepBatVersions}).`,
			}
		}
		return {
			verdict: 'reclaim-superseded-proof-pdf',
			verdictLabel: VERDICT_LABELS['reclaim-superseded-proof-pdf'],
			actionKind: 'reclaim',
			note: 'Editable design master verified; superseded BAT version, web preview PDF, or redundant print export is safe to prune.',
		}
	}

	if (member.context.isPackagedFontOrLinkedClone) {
		return {
			verdict: 'consolidate-to-font-vault',
			verdictLabel: VERDICT_LABELS['consolidate-to-font-vault'],
			actionKind: 'consolidate',
			note: member.context.hasCanonicalFontVaultAnchor
				? 'Non-canonical campaign copy outside _FontVault/ or _SharedAssets/; safe to hardlink-consolidate while preserving Document fonts/ and Links/ paths.'
				: 'Duplicated packaged font or linked campaign asset; safe to hardlink-consolidate onto canonical studio survivor.',
		}
	}

	return {
		verdict: 'consolidate-to-studio-anchor',
		verdictLabel: VERDICT_LABELS['consolidate-to-studio-anchor'],
		actionKind: 'consolidate',
		note: 'Staging or redundant copy of a conserved master layout; safe to hardlink-consolidate onto canonical 01_Master/ anchor.',
	}
}

/**
 * Normalize Design & Publishing Vault auditor options into deterministic bounds.
 *
 * @param {object} [rawOptions] Caller options.
 * @return {object} Normalized options.
 */
function normalizeOptions(rawOptions = {}) {
	const familyFilter = DESIGN_PUBLISHING_FAMILIES.includes(rawOptions.familyFilter)
		? rawOptions.familyFilter
		: 'all'
	const verdictFilter = DESIGN_PUBLISHING_VERDICT_FILTERS.includes(rawOptions.verdictFilter)
		? rawOptions.verdictFilter
		: 'all'
	const sortMode = DESIGN_PUBLISHING_SORT_MODES.includes(rawOptions.sortMode)
		? rawOptions.sortMode
		: 'reclaim_desc'
	const strategy = DESIGN_PUBLISHING_STRATEGIES.includes(rawOptions.strategy)
		? rawOptions.strategy
		: 'consolidate-packaged-fonts-and-links'
	const survivorRule = DESIGN_PUBLISHING_SURVIVOR_RULES.includes(rawOptions.survivorRule)
		? rawOptions.survivorRule
		: 'master-and-font-vault-first'

	const parsedKeepBat = Number.parseInt(rawOptions.keepBatVersions, 10)
	const keepBatVersions = Number.isFinite(parsedKeepBat) && parsedKeepBat >= 0
		? Math.min(parsedKeepBat, 50)
		: 1

	const parsedRecoveryDays = Number.parseInt(rawOptions.staleRecoveryDays, 10)
	const staleRecoveryDays = Number.isFinite(parsedRecoveryDays) && parsedRecoveryDays >= 0
		? Math.min(parsedRecoveryDays, 3650)
		: 3

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
		protectMasterSources: rawOptions.protectMasterSources !== false,
		protectFontLibraryAnchor: rawOptions.protectFontLibraryAnchor !== false,
		keepBatVersions,
		staleRecoveryDays,
		minSizeMb,
		searchQuery: String(rawOptions.searchQuery || '').trim().toLowerCase(),
		referenceTimeSec,
		memberOverrides: rawOptions.memberOverrides && typeof rawOptions.memberOverrides === 'object'
			? rawOptions.memberOverrides
			: {},
	}
}

/**
 * Audit duplicate groups across creative master layouts, print/web proofs, packaged fonts/links, and recovery caches.
 *
 * @param {Array<object>} duplicates Loaded duplicate groups.
 * @param {object} [rawOptions] Auditor configuration options.
 * @return {object} Deterministic audit analysis with summary, counts, and clusters.
 */
export function analyzeDesignPublishingDuplicates(duplicates, rawOptions = {}) {
	const options = normalizeOptions(rawOptions)
	const safeDuplicates = Array.isArray(duplicates) ? duplicates : []
	const minSizeBytes = options.minSizeMb * 1024 * 1024

	const datasetHints = buildDatasetDesignPublishingHints(safeDuplicates, options)

	const familyCounts = {
		all: 0,
		'master-layout-sources': 0,
		'print-and-web-export-proofs': 0,
		'packaged-fonts-and-linked-clones': 0,
		'creative-recovery-and-preview-caches': 0,
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
			const info = classifyDesignPublishingAsset(file.path)
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

			const directInfo = classifyDesignPublishingAsset(file.path)
			const memberInfo = directInfo && directInfo.matched ? directInfo : primaryInfo
			const context = inspectDesignPublishingMemberContext(
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
		const masterCopiesCount = members.filter(m => m.context.isMasterLayoutSource).length
		const fontLibraryAnchorCopiesCount = members.filter(m => m.context.isFontLibraryAnchor).length
		const packagedCloneCopiesCount = members.filter(m => m.context.isPackagedFontOrLinkedClone && !m.context.isFontLibraryAnchor).length
		const printProofCopiesCount = members.filter(m => m.context.isPrintAndWebExportProof).length
		const recoveryCacheCopiesCount = members.filter(m => m.context.isRecoveryOrPreviewCache).length

		const hasMasterSource = masterCopiesCount > 0
		const hasFontLibraryAnchor = fontLibraryAnchorCopiesCount > 0
		const hasPackagedClones = packagedCloneCopiesCount > 0
		const hasPrintProof = printProofCopiesCount > 0
		const hasRecoveryCache = recoveryCacheCopiesCount > 0
		const hasUnverifiedDesignMaster = members.some(m => m.verdict === 'blocked-unverified-design-master')

		let clusterRiskState = 'reclaimable'
		if (hasUnverifiedDesignMaster) {
			clusterRiskState = 'unverified-design-master'
		} else if (members.some(m => m.verdict === 'blocked-master-layout-source')) {
			clusterRiskState = 'master-protected'
		} else if (members.some(m => m.verdict === 'blocked-font-library-anchor') || (hasFontLibraryAnchor && reclaimableCopiesCount === 0)) {
			clusterRiskState = 'font-vault-anchor'
		} else if (hasPrintProof && reclaimableCopiesCount > 0) {
			clusterRiskState = 'design-master-verified'
		} else if (hasPackagedClones && reclaimableCopiesCount > 0) {
			clusterRiskState = 'consolidatable'
		} else if (hasRecoveryCache && reclaimableCopiesCount > 0) {
			clusterRiskState = 'reclaimable'
		} else if (reclaimableCopiesCount === 0) {
			clusterRiskState = 'shielded'
		}

		const primaryGroupId = group.id ?? null
		const groupKey = String(group.hash || primaryGroupId || `design-publishing-${groupIdx}`)
		const displayName = survivor ? survivor.basename : members[0].basename
		const governanceSignals = Array.from(new Set(members.map(m => m.tier)))
		const allArtifactTags = Array.from(new Set(members.flatMap(m => m.context.artifactTags)))

		rawClusters.push({
			groupKey,
			primaryGroupId,
			hash: group.hash || '',
			displayName,
			basename: displayName,
			designLineageStem: survivor ? survivor.context.designLineageStem : primaryInfo.designLineageStem,
			proofFlavor: survivor ? survivor.context.proofFlavor : primaryInfo.proofFlavor,
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
			masterCopiesCount,
			fontLibraryAnchorCopiesCount,
			packagedCloneCopiesCount,
			printProofCopiesCount,
			recoveryCacheCopiesCount,
			hasMasterSource,
			hasFontLibraryAnchor,
			hasPackagedClones,
			hasPrintProof,
			hasRecoveryCache,
			hasUnverifiedDesignMaster,
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
			|| cluster.designLineageStem.toLowerCase().includes(q)
			|| cluster.proofFlavor.toLowerCase().includes(q)
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
		if (options.verdictFilter === 'master-source' && !cluster.hasMasterSource) {
			return false
		}
		if (options.verdictFilter === 'font-library-anchor' && !cluster.hasFontLibraryAnchor) {
			return false
		}
		if (options.verdictFilter === 'print-proof' && !cluster.hasPrintProof) {
			return false
		}
		if (options.verdictFilter === 'unverified-master' && !cluster.hasUnverifiedDesignMaster) {
			return false
		}
		if (options.verdictFilter === 'recovery-cache' && !cluster.hasRecoveryCache) {
			return false
		}
		if (options.verdictFilter === 'shielded' && cluster.shieldedCopiesCount === 0 && cluster.clusterRiskState !== 'shielded') {
			return false
		}
		return true
	})

	clusters.sort((a, b) => {
		if (options.sortMode === 'risk_desc') {
			const riskA = a.masterCopiesCount * 5 + a.fontLibraryAnchorCopiesCount * 4 + (a.hasUnverifiedDesignMaster ? 6 : 0) + a.printProofCopiesCount * 2 + a.shieldedCopiesCount
			const riskB = b.masterCopiesCount * 5 + b.fontLibraryAnchorCopiesCount * 4 + (b.hasUnverifiedDesignMaster ? 6 : 0) + b.printProofCopiesCount * 2 + b.shieldedCopiesCount
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
	const totalMasterAnchorClusters = clusters.filter(c => c.hasMasterSource || c.hasFontLibraryAnchor).length
	const totalPrintProofClusters = clusters.filter(c => c.hasPrintProof).length
	const totalPackagedCloneClusters = clusters.filter(c => c.hasPackagedClones).length
	const totalRecoveryCacheClusters = clusters.filter(c => c.hasRecoveryCache).length
	const efficiencyPct = totalRawDuplicateBytes > 0
		? Math.round((totalReclaimableBytes / totalRawDuplicateBytes) * 100)
		: 0

	return {
		schema: DESIGN_PUBLISHING_VAULT_SCHEMA,
		options: {
			familyFilter: options.familyFilter,
			verdictFilter: options.verdictFilter,
			sortMode: options.sortMode,
			strategy: options.strategy,
			survivorRule: options.survivorRule,
			protectMasterSources: options.protectMasterSources,
			protectFontLibraryAnchor: options.protectFontLibraryAnchor,
			keepBatVersions: options.keepBatVersions,
			staleRecoveryDays: options.staleRecoveryDays,
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
			totalMasterAnchorClusters,
			totalPrintProofClusters,
			totalPackagedCloneClusters,
			totalRecoveryCacheClusters,
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
 * Build a POSIX DRY_RUN=1 remediation script for Creative Design Packages, Print Proofs & Fonts.
 *
 * @param {object} analysis Output from analyzeDesignPublishingDuplicates.
 * @param {object} [options] Script options.
 * @param {string} [options.dataRoot='/var/www/nextcloud/data'] Nextcloud data root directory.
 * @return {string} POSIX bash script with single-quoted paths, sha256sum -- verification, stat cross-device guard, and DRY_RUN=1 default.
 */
export function buildDesignPublishingScript(analysis, options = {}) {
	const dataRoot = String(options.dataRoot || '/var/www/nextcloud/data').replace(/\/+$/, '') || '/var/www/nextcloud/data'
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const strategy = (analysis && analysis.options && analysis.options.strategy) || 'consolidate-packaged-fonts-and-links'

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
		'# Creative Design Package, Print Proof & Typography Font Archive Auditor',
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
		lines.push('echo "No reclaimable creative caches, superseded proofs, or packaged font/link clones under current guards."')
		return lines.join('\n')
	}

	lines.push('prune_verified_creative_artifact() {')
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
	lines.push('consolidate_design_vault_link() {')
	lines.push('  local survivor_rel="$1"')
	lines.push('  local target_rel="$2"')
	lines.push('  local survivor_full target_full')
	lines.push('  survivor_full="$(resolve_path "$survivor_rel")"')
	lines.push('  target_full="$(resolve_path "$target_rel")"')
	lines.push('  if [ "$DRY_RUN" = "1" ]; then')
	lines.push('    printf \'[DRY_RUN] hardlink %s -> %s\\n\' "$target_full" "$survivor_full"')
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
			lines.push(`consolidate_design_vault_link ${escapePosixSingleQuote(op.survivorPath)} ${escapePosixSingleQuote(op.targetPath)}`)
		} else {
			lines.push(`prune_verified_creative_artifact ${escapePosixSingleQuote(op.survivorPath)} ${escapePosixSingleQuote(op.targetPath)}`)
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
 * Build a Nextcloud Desktop .sync-exclude.lst snippet for creative recovery locks and preview caches.
 *
 * @param {object} analysis Output from analyzeDesignPublishingDuplicates.
 * @return {string} Newline-delimited Nextcloud sync-exclude patterns.
 */
export function buildDesignPublishingSyncExcludeSnippet(analysis) {
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const lines = [
		'# Nextcloud Desktop .sync-exclude.lst rules for InDesign locks, Photoshop temps & Bridge caches',
		'*.idlk',
		'InDesign Recovery/',
		'Photoshop Temp*',
		'.BridgeCache*',
		'_thumb_cache.*',
		'*.tmp',
	]
	const seen = new Set(lines)
	for (const cluster of clusters) {
		if (cluster && cluster.proofFlavor === 'web-preview' && !seen.has('*_web_preview.pdf')) {
			lines.push('*_web_preview.pdf')
			seen.add('*_web_preview.pdf')
		}
	}
	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe CSV audit report for Design Packages, Print Proofs & Fonts.
 *
 * @param {object} analysis Output from analyzeDesignPublishingDuplicates.
 * @return {string} RFC-4180 CSV string with CWE-1236 formula escaping.
 */
export function buildDesignPublishingCsvReport(analysis) {
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const headers = [
		'Cluster Key',
		'Asset Name',
		'Design Lineage Stem',
		'Proof Flavor',
		'BAT Version',
		'Artifact Tags',
		'Extension',
		'Family',
		'Governance Tier',
		'Master Source',
		'Font / Shared Anchor',
		'Verified Design Master',
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
				member.context.designLineageStem,
				member.context.proofFlavor,
				member.context.batVersion !== null ? `v${member.context.batVersion}` : '',
				member.context.artifactTag,
				member.extension,
				cluster.familyLabel,
				member.tierLabel,
				member.context.isMasterLayoutSource ? 'yes' : 'no',
				member.context.isFontLibraryAnchor ? 'yes' : 'no',
				member.context.hasVerifiedDesignMaster ? 'yes' : 'no',
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
 * Build a structured JSON audit manifest for Design Packages, Print Proofs & Typography Fonts.
 *
 * @param {object} analysis Output from analyzeDesignPublishingDuplicates.
 * @param {string} [generatedAt] Optional ISO timestamp override.
 * @return {string} Pretty-printed JSON manifest.
 */
export function buildDesignPublishingJsonReport(analysis, generatedAt = new Date().toISOString()) {
	const safeAnalysis = analysis && typeof analysis === 'object' ? analysis : { summary: {}, clusters: [], options: {} }
	return JSON.stringify({
		schema: DESIGN_PUBLISHING_VAULT_SCHEMA,
		generatedAt,
		options: safeAnalysis.options || {},
		summary: safeAnalysis.summary || {},
		clusters: (safeAnalysis.clusters || []).map(cluster => ({
			groupKey: cluster.groupKey,
			primaryGroupId: cluster.primaryGroupId,
			hash: cluster.hash,
			basename: cluster.basename,
			designLineageStem: cluster.designLineageStem,
			proofFlavor: cluster.proofFlavor,
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
				designLineageStem: member.context.designLineageStem,
				proofFlavor: member.context.proofFlavor,
				batVersion: member.context.batVersion,
				authorityScore: member.context.authorityScore,
				hasVerifiedDesignMaster: member.context.hasVerifiedDesignMaster,
				isMasterLayoutSource: member.context.isMasterLayoutSource,
				isFontLibraryAnchor: member.context.isFontLibraryAnchor,
				override: member.override,
			})),
		})),
	}, null, 2)
}
