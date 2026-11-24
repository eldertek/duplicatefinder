/**
 * Pure Publishing, Prepress, Print-Ready PDF/X & Font Licensing Vault Auditor.
 * Classifies and audits duplicate clusters across 4 Editorial & Prepress Vault families:
 * - Layout Master Sources (.indd, .idml, .afpub, .qxp)
 * - Prepress PDF/X & Print Proofs (_print.pdf, _bleed.pdf, _web.pdf, _proof.pdf, signed PDF/X-4 BAT)
 * - Commercial Licensed Fonts (.otf, .ttf, .woff2 with font family & license duplicate detection)
 * - CMYK High-Res Press Links (.tif, .tiff, .eps, .psd)
 *
 * Enforces strict prepress & publishing governance defaults:
 * - Strictly conserves layout master sources (.indd, .afpub, .qxp, canonical .idml)
 * - Strictly conserves signed PDF/X-4 BAT (Bon a Tirer) press proofs
 * - Strictly conserves master licensed commercial fonts in canonical font vaults
 * - Detects commercial font license / family duplicates across campaign packages and formats
 * - Blocks deletion of _print/_bleed/_web/_proof PDFs lacking a verified layout source anchor
 * - Blocks hardlinks on mutable layout & layered files (.indd, .idml, .afpub, .qxp, .psd)
 *
 * Generates DRY_RUN=1 POSIX remediation scripts, CWE-1236-safe CSV reports, JSON audit
 * manifests, and .sync-exclude.lst rules. Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const PUBLISHING_PREPRESS_VAULT_SCHEMA = 'duplicatefinder.publishing-prepress-vault-auditor.v1'

export const PUBLISHING_PREPRESS_FAMILIES = Object.freeze([
	'all',
	'layout-sources',
	'prepress-pdfx-proofs',
	'licensed-commercial-fonts',
	'cmyk-hires-links',
])

export const PUBLISHING_PREPRESS_FAMILY_META = Object.freeze({
	'layout-sources': {
		id: 'layout-sources',
		label: 'Layout Master Sources',
		shortLabel: 'Layouts (.indd, .idml, .afpub, .qxp)',
	},
	'prepress-pdfx-proofs': {
		id: 'prepress-pdfx-proofs',
		label: 'Prepress PDF/X & Proofs',
		shortLabel: 'PDF/X & Proofs (_print, _bleed, _web, _proof, PDF/X-4 BAT)',
	},
	'licensed-commercial-fonts': {
		id: 'licensed-commercial-fonts',
		label: 'Commercial Licensed Fonts',
		shortLabel: 'Fonts & Licenses (.otf, .ttf, .woff2)',
	},
	'cmyk-hires-links': {
		id: 'cmyk-hires-links',
		label: 'CMYK High-Res Press Links',
		shortLabel: 'CMYK Links (.tif, .eps, .psd)',
	},
})

export const PUBLISHING_PREPRESS_STRATEGIES = Object.freeze([
	'prune-superseded-proofs-and-font-clones',
	'hardlink-fonts-and-cmyk-links',
	'quarantine-unlicensed-fonts-and-drafts',
])

export const PUBLISHING_PREPRESS_SURVIVOR_RULES = Object.freeze([
	'layout-bat-font-vault-first',
	'oldest-master-first',
	'newest-prepress-first',
	'shortest-path',
])

export const PUBLISHING_PREPRESS_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'layout-source-protected',
	'signed-pdfx4-bat-protected',
	'licensed-font-master-protected',
	'font-license-duplicate-risk',
	'superseded-prepress-proof',
	'cmyk-link-duplicate',
	'shielded',
])

export const PUBLISHING_PREPRESS_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const PUBLISHING_PREPRESS_PRESETS = Object.freeze([
	{
		id: 'all-publishing-prepress-audit',
		name: 'All Publishing, PDF/X & Font Vaults',
		description: 'Audit .indd/.idml/.afpub/.qxp layouts, PDF/X-4 BAT & print/bleed/web/proof PDFs, .otf/.ttf/.woff2 licensed fonts, and CMYK .tif/.eps/.psd press links while strictly conserving masters, signed BATs, and licensed font anchors.',
		familyFilter: 'all',
		strategy: 'prune-superseded-proofs-and-font-clones',
		survivorRule: 'layout-bat-font-vault-first',
		protectLayoutSources: true,
		protectSignedPdfx4Bat: true,
		protectLicensedFontMasters: true,
		requireLayoutSourceAnchor: true,
		keepRecentProofDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'font-licensing-family-dedup',
		name: 'Font Licensing & Family Duplicates',
		description: 'Detect duplicate commercial .otf/.ttf/.woff2 font licenses and family clones scattered across Document fonts/, campaign packages, and Downloads while conserving canonical licensed font vault masters.',
		familyFilter: 'licensed-commercial-fonts',
		strategy: 'quarantine-unlicensed-fonts-and-drafts',
		survivorRule: 'layout-bat-font-vault-first',
		protectLayoutSources: true,
		protectSignedPdfx4Bat: true,
		protectLicensedFontMasters: true,
		requireLayoutSourceAnchor: false,
		keepRecentProofDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'prepress-pdfx-and-proofs',
		name: 'Print-Ready PDF/X & Proof Cleanup',
		description: 'Reclaim redundant _print.pdf, _bleed.pdf, _web.pdf, and _proof.pdf exports verified against layout sources while strictly conserving signed PDF/X-4 BAT proofs.',
		familyFilter: 'prepress-pdfx-proofs',
		strategy: 'prune-superseded-proofs-and-font-clones',
		survivorRule: 'layout-bat-font-vault-first',
		protectLayoutSources: true,
		protectSignedPdfx4Bat: true,
		protectLicensedFontMasters: true,
		requireLayoutSourceAnchor: true,
		keepRecentProofDays: 7,
		minSizeKb: 0,
	},
	{
		id: 'cmyk-hires-links-consolidation',
		name: 'CMYK High-Res Links (.tif/.eps/.psd)',
		description: 'Hardlink-consolidate immutable CMYK .tif/.eps press links onto canonical prepress asset vaults while blocking hardlinks on mutable .psd/.indd/.afpub/.qxp files.',
		familyFilter: 'cmyk-hires-links',
		strategy: 'hardlink-fonts-and-cmyk-links',
		survivorRule: 'layout-bat-font-vault-first',
		protectLayoutSources: true,
		protectSignedPdfx4Bat: true,
		protectLicensedFontMasters: true,
		requireLayoutSourceAnchor: false,
		keepRecentProofDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'layout-sources-and-bat-shield',
		name: 'Layout Sources & Signed PDF/X-4 BAT Shield',
		description: 'Inspect conserved .indd/.idml/.afpub/.qxp layout sources and signed PDF/X-4 BAT archives under strict prepress governance protection.',
		familyFilter: 'layout-sources',
		strategy: 'prune-superseded-proofs-and-font-clones',
		survivorRule: 'layout-bat-font-vault-first',
		protectLayoutSources: true,
		protectSignedPdfx4Bat: true,
		protectLicensedFontMasters: true,
		requireLayoutSourceAnchor: true,
		keepRecentProofDays: 0,
		minSizeKb: 0,
	},
])

export const PUBLISHING_PREPRESS_DEFAULT_CONFIG = Object.freeze({
	presetId: 'all-publishing-prepress-audit',
	familyFilter: 'all',
	verdictFilter: 'all',
	strategy: 'prune-superseded-proofs-and-font-clones',
	survivorRule: 'layout-bat-font-vault-first',
	sortMode: 'reclaim_desc',
	searchQuery: '',
	protectLayoutSources: true,
	protectSignedPdfx4Bat: true,
	protectLicensedFontMasters: true,
	requireLayoutSourceAnchor: true,
	keepRecentProofDays: 0,
	minSizeKb: 0,
})

const STRICT_LAYOUT_SOURCE_EXT_RE = /\.(?:indd|afpub|qxp)$/i
const IDML_EXT_RE = /\.idml$/i
const FONT_EXT_RE = /\.(?:otf|ttf|woff2)$/i
const PDF_EXT_RE = /\.pdf$/i
const CMYK_RASTER_PSD_EXT_RE = /\.(?:tif|tiff|psd)$/i
const EPS_EXT_RE = /\.eps$/i

const SIGNED_PDFX4_BAT_RE = /(?:[-_.]pdfx-?4|[-_.]x-?4|[-_.]bat[-_.]?(?:signed|ok|approved|valid|final)|[-_.]signed[-_.]?bat|[-_.]bat[-_.]?signe|bon[-_.]?a[-_.]?tirer|[-_.]signed[-_.]proof)(?=\.pdf$|[-_.])/i
const SIGNED_BAT_PATH_RE = /(?:^|\/)(?:bat[_-]?signed|signed[_-]?bat|pdfx4[_-]?bat|pdfx-4[_-]?bat|bon[_-]?a[_-]?tirer|press[_-]?approved)(?:\/|$)/i

const PRINT_PDF_RE = /(?:_print|[-_.]press|[-_.]imposition|[-_.]pdfx-?1a|[-_.]x-?1a|[-_.]cmyk)(?:[-_.]v\d+(?:\.\d+)?)?\.pdf$/i
const BLEED_PDF_RE = /(?:_bleed|[-_.]trim[-_.]bleed|[-_.]cropmarks)(?:[-_.]v\d+(?:\.\d+)?)?\.pdf$/i
const WEB_PDF_RE = /(?:_web|[-_.]web[-_.]?preview|[-_.]screen|[-_.]rgb[-_.]?preview)(?:[-_.]v\d+(?:\.\d+)?)?\.pdf$/i
const PROOF_PDF_RE = /(?:_proof|[-_.]preflight|[-_.]rip|[-_.]draft|[-_.]review|[-_.]bat[-_.]v\d+)(?:[-_.]v\d+(?:\.\d+)?)?\.pdf$/i

const MUTABLE_LAYOUT_OR_LAYER_EXT_RE = /\.(?:indd|idml|afpub|qxp|psd|idlk|tmp)$/i

const CANONICAL_LAYOUT_VAULT_RE = /(?:^|\/)(?:0?1_masters?|0?0_masters?|layout[_-]?masters?|publishing[_-]?vault|prepress[_-]?vault|editorial[_-]?masters?|masters?|sources?|canonical|archive[_-]?final)(?:\/|$)/i
const CANONICAL_FONT_VAULT_RE = /(?:^|\/)(?:licensed[_-]?fonts?|font[_-]?vault|typeface[_-]?masters?|commercial[_-]?fonts?|foundry[_-]?masters?|eula[_-]?vault|master[_-]?fonts?|studio[_-]?fonts?)(?:\/|$)/i
const CANONICAL_LINK_VAULT_RE = /(?:^|\/)(?:links[_-]?master|cmyk[_-]?vault|prepress[_-]?assets?|print[_-]?links?|hires[_-]?cmyk|highres[_-]?cmyk|master[_-]?links?|press[_-]?vault)(?:\/|$)/i

const PACKAGE_FONT_CLONE_PATH_RE = /(?:^|\/)(?:document[\s_-]*fonts|packaged?[_-]?fonts?|campaign[_-]?fonts?|shared[_-]?fonts?|client[_-]?fonts?)(?:\/|$)/i
const SCRATCH_OR_UNCONTROLLED_PATH_RE = /(?:^|\/)(?:downloads?|telechargements?|tmp|temp|scratch|wetransfer|airdrop|incoming|staging|drop|desktop|export[_-]?tmp|mail[_-]?attachments?|old|obsolete|superseded|drafts?|review[_-]?copies?)(?:\/|$)/i
const PACKAGE_LINKS_PATH_RE = /(?:^|\/)(?:links|package|packaged[_-]?links)(?:\/|$)/i

const PREPRESS_CMYK_CONTEXT_RE = /(?:cmyk|fogra|isocoated|pso[_-]?coated|300dpi|prepress|press|print|bleed|plate|plates|pantone|spot|separations?|inks?|cover|editorial|magazine|brochure|catalog|catalogue|book|packaging|publishing|indd|afpub|qxp|links)/i
const NON_PREPRESS_PHOTO_HINT_RE = /(?:^|\/)(?:photos?|dcim|camera|vacation|holidays?|family|selfies?|iphone|android)(?:\/|$)/i

const FONT_TRAILING_WEIGHT_RE = /(?:[-_.\s]|(?<=[a-z]))(thin|extralight|ultralight|light|book|regular|roman|medium|semibold|demibold|bold|extrabold|ultrabold|black|heavy|italic|oblique|condensed|narrow|expanded|display|text|mono)$/i

const GENERIC_JOB_STEMS = new Set([
	'layout',
	'master',
	'document',
	'book',
	'magazine',
	'brochure',
	'catalog',
	'cover',
	'proof',
	'print',
	'bleed',
	'web',
	'fonts',
	'links',
	'final',
])

const NOISE_PARENT_DIRS = new Set([
	'document fonts',
	'document_fonts',
	'links',
	'exports',
	'proofs',
	'pdfx',
	'prepress',
	'print',
	'web',
	'tmp',
	'temp',
	'downloads',
	'old',
	'drafts',
	'bat',
	'package',
])

/**
 * Normalize a non-negative integer value safely within bounds.
 *
 * @param {*} value Candidate numeric input.
 * @param {number} fallback Default fallback.
 * @param {number} [max] Upper bound.
 * @return {number} Clamped non-negative integer.
 */
function normalizeNonNegativeInt(value, fallback, max = 1000000) {
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
export function normalizePublishingPrepressConfig(raw = {}) {
	const input = raw && typeof raw === 'object' ? raw : {}
	const preset = PUBLISHING_PREPRESS_PRESETS.find(item => item.id === input.presetId) || null
	const base = preset ? { ...PUBLISHING_PREPRESS_DEFAULT_CONFIG, ...preset } : { ...PUBLISHING_PREPRESS_DEFAULT_CONFIG }

	const familyFilter = PUBLISHING_PREPRESS_FAMILIES.includes(input.familyFilter)
		? input.familyFilter
		: base.familyFilter
	const verdictFilter = PUBLISHING_PREPRESS_VERDICT_FILTERS.includes(input.verdictFilter)
		? input.verdictFilter
		: base.verdictFilter
	const strategy = PUBLISHING_PREPRESS_STRATEGIES.includes(input.strategy)
		? input.strategy
		: base.strategy
	const survivorRule = PUBLISHING_PREPRESS_SURVIVOR_RULES.includes(input.survivorRule)
		? input.survivorRule
		: base.survivorRule
	const sortMode = PUBLISHING_PREPRESS_SORT_MODES.includes(input.sortMode)
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
		protectLayoutSources: typeof input.protectLayoutSources === 'boolean'
			? input.protectLayoutSources
			: base.protectLayoutSources,
		protectSignedPdfx4Bat: typeof input.protectSignedPdfx4Bat === 'boolean'
			? input.protectSignedPdfx4Bat
			: base.protectSignedPdfx4Bat,
		protectLicensedFontMasters: typeof input.protectLicensedFontMasters === 'boolean'
			? input.protectLicensedFontMasters
			: base.protectLicensedFontMasters,
		requireLayoutSourceAnchor: typeof input.requireLayoutSourceAnchor === 'boolean'
			? input.requireLayoutSourceAnchor
			: base.requireLayoutSourceAnchor,
		keepRecentProofDays: normalizeNonNegativeInt(input.keepRecentProofDays, base.keepRecentProofDays, 3650),
		minSizeKb: normalizeNonNegativeInt(input.minSizeKb, base.minSizeKb, 10000000),
		memberOverrides,
	}
}

/**
 * Extract basename from normalized filesystem path.
 *
 * @param {string} normalizedPath Normalized path.
 * @return {string} File basename.
 */
function extractBasename(normalizedPath) {
	const parts = String(normalizedPath || '').split('/')
	return parts[parts.length - 1] || ''
}

/**
 * Extract directory portion from normalized filesystem path.
 *
 * @param {string} normalizedPath Normalized path.
 * @return {string} Directory path.
 */
function extractDirname(normalizedPath) {
	const idx = String(normalizedPath || '').lastIndexOf('/')
	return idx > 0 ? String(normalizedPath).slice(0, idx) : ''
}

/**
 * Parse file mtime into epoch milliseconds when available.
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
 * Extract meaningful publication or job folder from a path, skipping generic prepress subdirs.
 *
 * @param {string} normalizedPath Normalized path.
 * @return {string} Meaningful job folder slug or empty string.
 */
function extractMeaningfulJobFolder(normalizedPath) {
	const parts = String(normalizedPath || '').split('/').filter(Boolean)
	if (parts.length <= 1) {
		return ''
	}
	for (let i = parts.length - 2; i >= 0; i -= 1) {
		const segment = parts[i].toLowerCase()
		if (!NOISE_PARENT_DIRS.has(segment)) {
			return segment.replace(/[^a-z0-9_-]/g, '-')
		}
	}
	return ''
}

/**
 * Detect DTP layout application and prepress workflow stage from path and basename.
 *
 * @param {string} normalizedPath Normalized path.
 * @param {string} [basename] File basename.
 * @return {{ publishingTool: string, prepressStage: string }} Detected tool and stage.
 */
export function extractPublishingToolAndStage(normalizedPath, basename = '') {
	const lowerPath = String(normalizedPath || '').toLowerCase()
	const lowerBase = String(basename || '').toLowerCase()
	const combined = `${lowerPath} ${lowerBase}`

	let publishingTool = ''
	if (/\.indd$/i.test(lowerBase) || /\.idml$/i.test(lowerBase)) {
		publishingTool = 'InDesign'
	} else if (/\.afpub$/i.test(lowerBase)) {
		publishingTool = 'Affinity Publisher'
	} else if (/\.qxp$/i.test(lowerBase)) {
		publishingTool = 'QuarkXPress'
	} else if (FONT_EXT_RE.test(lowerBase)) {
		publishingTool = 'OpenType / Typeface'
	} else if (PDF_EXT_RE.test(lowerBase)) {
		publishingTool = 'PDF/X Prepress'
	} else if (CMYK_RASTER_PSD_EXT_RE.test(lowerBase) || EPS_EXT_RE.test(lowerBase)) {
		publishingTool = 'CMYK Press Link'
	}

	let prepressStage = ''
	if (SIGNED_PDFX4_BAT_RE.test(lowerBase) || SIGNED_BAT_PATH_RE.test(lowerPath)) {
		prepressStage = 'PDF/X-4 BAT Signed'
	} else if (STRICT_LAYOUT_SOURCE_EXT_RE.test(lowerBase) || IDML_EXT_RE.test(lowerBase)) {
		prepressStage = 'Layout Master'
	} else if (BLEED_PDF_RE.test(lowerBase)) {
		prepressStage = 'Bleed Press Export'
	} else if (PRINT_PDF_RE.test(lowerBase)) {
		prepressStage = 'Print Ready Export'
	} else if (WEB_PDF_RE.test(lowerBase)) {
		prepressStage = 'Web Review Export'
	} else if (PROOF_PDF_RE.test(lowerBase)) {
		prepressStage = 'Prepress Proof'
	} else if (FONT_EXT_RE.test(lowerBase)) {
		prepressStage = CANONICAL_FONT_VAULT_RE.test(lowerPath) ? 'Licensed Vault Master' : 'Packaged / Duplicate Font'
	} else if (/cmyk|fogra|isocoated|300dpi|plate|pantone/.test(combined)) {
		prepressStage = 'CMYK 300dpi Separation'
	}

	return { publishingTool, prepressStage }
}

/**
 * Extract normalized font family, weight/style, format, and license scope from a font file.
 *
 * @param {string} basename Font file basename.
 * @param {string} [normalizedPath] Full normalized path.
 * @return {{ fontFamily: string, fontWeightStyle: string, fontFormat: string, fontFamilyKey: string }} Font metadata.
 */
export function extractFontFamilyInfo(basename, normalizedPath = '') {
	const rawBase = String(basename || '').trim()
	const extMatch = rawBase.match(/\.(otf|ttf|woff2)$/i)
	const fontFormat = extMatch ? extMatch[1].toUpperCase() : ''
	let stem = rawBase.replace(/\.(?:otf|ttf|woff2)$/i, '')
	stem = stem.replace(/\s+\(\d+\)$/, '')
	stem = stem.replace(/[-_.](?:copy\d*|dup\d*|licensed|trial|webfont|desktop)$/ig, '')

	const matchedWeights = []
	let familyPart = stem
	let prev = ''
	while (familyPart !== prev) {
		prev = familyPart
		const match = familyPart.match(FONT_TRAILING_WEIGHT_RE)
		if (match) {
			matchedWeights.unshift(match[1])
			familyPart = familyPart.slice(0, match.index)
		}
	}
	familyPart = familyPart
		.replace(/[-_.\s]+$/g, '')
		.replace(/^[-_.\s]+/g, '')

	if (!familyPart) {
		const folder = extractMeaningfulJobFolder(normalizedPath)
		familyPart = folder || stem || 'unknown-typeface'
	}

	const fontFamily = familyPart.replace(/[-_]+/g, ' ').trim() || 'Unknown Typeface'
	const fontFamilyKey = familyPart.toLowerCase().replace(/[^a-z0-9]/g, '') || 'unknowntypeface'
	const fontWeightStyle = matchedWeights.length > 0
		? matchedWeights.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
		: 'Regular'

	return {
		fontFamily,
		fontWeightStyle,
		fontFormat,
		fontFamilyKey,
	}
}

/**
 * Extract normalized editorial/prepress lineage stem to correlate _print/_bleed/_web/_proof
 * PDFs and CMYK links against .indd/.idml/.afpub/.qxp layout master sources.
 *
 * @param {string} basename File basename.
 * @param {string} [normalizedPath] Full normalized path for job folder context.
 * @return {string} Normalized editorial lineage stem.
 */
export function extractPublishingLineageStem(basename, normalizedPath = '') {
	let stem = String(basename || '').trim().toLowerCase()
	stem = stem.replace(/\.(?:indd|idml|afpub|qxp|pdf|otf|ttf|woff2|tif|tiff|eps|psd)$/i, '')
	stem = stem.replace(/\s+\(\d+\)$/, '')
	stem = stem.replace(/\s*-\s*copy(?:\s*\(\d+\))?$/i, '')

	let prev = ''
	while (stem !== prev) {
		prev = stem
		stem = stem.replace(
			/(?:[-_.](?:pdfx-?4|x-?4|pdfx-?1a|x-?1a|bat[-_.]?(?:signed|ok|approved|valid|final|signe)?|signed[-_.]?bat|bon[-_.]?a[-_.]?tirer|print|bleed|web|proof|press|preflight|rip|imposition|cmyk|rgb|preview|draft|review|final|ok|def|copy\d*|v\d+(?:\.\d+)?|300dpi|fogra\d*))$/i,
			''
		)
	}

	if (!stem || GENERIC_JOB_STEMS.has(stem)) {
		const jobFolder = extractMeaningfulJobFolder(normalizedPath)
		if (jobFolder) {
			return `${jobFolder}_${stem || 'publication'}`
		}
	}

	return stem || 'unknown-publication'
}

/**
 * Extract concise prepress artifact tag for badges and CSV exports.
 *
 * @param {string} lowerBase Lowercase basename.
 * @param {string} lowerPath Lowercase path.
 * @return {string} Prepress artifact tag.
 */
function extractPrepressTag(lowerBase, lowerPath) {
	if (/\.indd$/i.test(lowerBase)) {
		return 'indd-layout'
	}
	if (/\.afpub$/i.test(lowerBase)) {
		return 'afpub-layout'
	}
	if (/\.qxp$/i.test(lowerBase)) {
		return 'qxp-layout'
	}
	if (/\.idml$/i.test(lowerBase)) {
		return 'idml-interchange'
	}
	if (PDF_EXT_RE.test(lowerBase)) {
		if (SIGNED_PDFX4_BAT_RE.test(lowerBase) || SIGNED_BAT_PATH_RE.test(lowerPath)) {
			return 'pdfx4-bat-signed'
		}
		if (BLEED_PDF_RE.test(lowerBase)) {
			return 'bleed-pdf'
		}
		if (PRINT_PDF_RE.test(lowerBase)) {
			return 'print-pdf'
		}
		if (WEB_PDF_RE.test(lowerBase)) {
			return 'web-pdf'
		}
		if (PROOF_PDF_RE.test(lowerBase)) {
			return 'proof-pdf'
		}
		return 'prepress-pdf'
	}
	if (FONT_EXT_RE.test(lowerBase)) {
		if (/\.otf$/i.test(lowerBase)) {
			return 'otf-font'
		}
		if (/\.ttf$/i.test(lowerBase)) {
			return 'ttf-font'
		}
		return 'woff2-font'
	}
	if (/\.eps$/i.test(lowerBase)) {
		return 'eps-press-link'
	}
	if (/\.psd$/i.test(lowerBase)) {
		return 'psd-cmyk-link'
	}
	if (/\.tiff?$/i.test(lowerBase)) {
		return 'tif-cmyk-link'
	}
	return ''
}

/**
 * Classify a single duplicate file into the Publishing, Prepress, Print-Ready PDF/X & Font Licensing domain.
 *
 * @param {object} file Duplicate file entry.
 * @param {number} [referenceNowMs] Reference epoch ms.
 * @return {object} Classification metadata (family === null if outside domain).
 */
export function classifyPublishingPrepressFile(file, referenceNowMs = Date.now()) {
	const rawPath = file?.path || file?.name || ''
	const normalized = normalizePathForDiff(rawPath)
	const lower = normalized.toLowerCase()
	const basename = extractBasename(normalized)
	const lowerBase = basename.toLowerCase()
	const dirname = extractDirname(normalized)
	const size = Math.max(0, Number(file?.size) || 0)
	const mtimeMs = extractMtimeMs(file)
	const formattedMtime = mtimeMs !== null ? formatFileModifiedTime(mtimeMs / 1000) : ''
	const ageDays = mtimeMs !== null ? Math.max(0, (referenceNowMs - mtimeMs) / (24 * 60 * 60 * 1000)) : null

	const isStrictLayoutExt = STRICT_LAYOUT_SOURCE_EXT_RE.test(lowerBase)
	const isIdmlExt = IDML_EXT_RE.test(lowerBase)
	const isFontExt = FONT_EXT_RE.test(lowerBase)
	const isPdfExt = PDF_EXT_RE.test(lowerBase)
	const isSignedBatPdf = isPdfExt && (SIGNED_PDFX4_BAT_RE.test(lowerBase) || SIGNED_BAT_PATH_RE.test(lower))
	const isBleedPdf = isPdfExt && !isSignedBatPdf && BLEED_PDF_RE.test(lowerBase)
	const isPrintPdf = isPdfExt && !isSignedBatPdf && PRINT_PDF_RE.test(lowerBase)
	const isWebPdf = isPdfExt && !isSignedBatPdf && WEB_PDF_RE.test(lowerBase)
	const isProofPdf = isPdfExt && !isSignedBatPdf && PROOF_PDF_RE.test(lowerBase)
	const isPrepressPdf = isSignedBatPdf || isBleedPdf || isPrintPdf || isWebPdf || isProofPdf

	const isCmykRasterOrPsd = CMYK_RASTER_PSD_EXT_RE.test(lowerBase)
	const isEps = EPS_EXT_RE.test(lowerBase)
	const hasPrepressLinkContext = PREPRESS_CMYK_CONTEXT_RE.test(lower)
		|| CANONICAL_LINK_VAULT_RE.test(lower)
		|| PACKAGE_LINKS_PATH_RE.test(lower)
	const isExcludedPhoto = NON_PREPRESS_PHOTO_HINT_RE.test(lower) && !PREPRESS_CMYK_CONTEXT_RE.test(lower)
	const isCmykHiresLink = !isExcludedPhoto && (isEps || (isCmykRasterOrPsd && hasPrepressLinkContext))

	let family = null
	let artifactKind = ''
	let vaultRole = ''
	let isLayoutSource = false
	let isSignedPdfx4Bat = false
	let isSupersededProofPdf = false
	let isLicensedFontMaster = false
	let isFontPackageOrScratchClone = false
	let isCmykMasterLink = false
	let isCmykPackageClone = false
	let isMutableFile = MUTABLE_LAYOUT_OR_LAYER_EXT_RE.test(lowerBase)

	const isCanonicalLayoutPath = CANONICAL_LAYOUT_VAULT_RE.test(lower)
	const isCanonicalFontVaultPath = CANONICAL_FONT_VAULT_RE.test(lower)
	const isCanonicalLinkVaultPath = CANONICAL_LINK_VAULT_RE.test(lower)
	const isPackageFontClonePath = PACKAGE_FONT_CLONE_PATH_RE.test(lower)
	const isPackageLinksPath = PACKAGE_LINKS_PATH_RE.test(lower)
	const isScratchPath = SCRATCH_OR_UNCONTROLLED_PATH_RE.test(lower)

	if (isStrictLayoutExt || isIdmlExt) {
		family = 'layout-sources'
		isLayoutSource = isStrictLayoutExt || !isScratchPath
		artifactKind = isStrictLayoutExt
			? (lowerBase.endsWith('.indd')
				? 'InDesign Master (.indd)'
				: (lowerBase.endsWith('.afpub') ? 'Affinity Publisher (.afpub)' : 'QuarkXPress (.qxp)'))
			: 'IDML Interchange (.idml)'
		vaultRole = isLayoutSource
			? (isCanonicalLayoutPath ? 'Canonical Layout Master Vault' : 'Active Layout Source')
			: 'Scratch / Exported IDML Copy'
	} else if (isPrepressPdf) {
		family = 'prepress-pdfx-proofs'
		if (isSignedBatPdf) {
			isSignedPdfx4Bat = true
			artifactKind = 'Signed PDF/X-4 BAT'
			vaultRole = 'Signed Press BAT Anchor'
		} else if (isBleedPdf) {
			isSupersededProofPdf = true
			artifactKind = 'Bleed Print PDF (_bleed.pdf)'
			vaultRole = isScratchPath ? 'Staging Bleed Export' : 'Print-Ready Bleed Export'
		} else if (isPrintPdf) {
			isSupersededProofPdf = true
			artifactKind = 'Print-Ready PDF (_print.pdf)'
			vaultRole = isScratchPath ? 'Staging Print Export' : 'Print Export PDF'
		} else if (isWebPdf) {
			isSupersededProofPdf = true
			artifactKind = 'Web Review PDF (_web.pdf)'
			vaultRole = 'Low-Res Web Proof Copy'
		} else {
			isSupersededProofPdf = true
			artifactKind = 'Prepress Proof PDF (_proof.pdf)'
			vaultRole = 'Prepress Proof / Preflight Copy'
		}
	} else if (isFontExt) {
		family = 'licensed-commercial-fonts'
		if (isCanonicalFontVaultPath && !isScratchPath) {
			isLicensedFontMaster = true
			artifactKind = `Licensed Font Master (.${lowerBase.split('.').pop()})`
			vaultRole = 'Canonical Licensed Font Vault'
		} else {
			isFontPackageOrScratchClone = true
			artifactKind = `Packaged / Duplicate Font (.${lowerBase.split('.').pop()})`
			vaultRole = isPackageFontClonePath
				? 'Campaign Document Fonts Package'
				: (isScratchPath ? 'Uncontrolled / Scratch Font Copy' : 'Duplicate Project Font Copy')
		}
	} else if (isCmykHiresLink) {
		family = 'cmyk-hires-links'
		const extLabel = lowerBase.split('.').pop().toUpperCase()
		if (isCanonicalLinkVaultPath && !isScratchPath) {
			isCmykMasterLink = true
			artifactKind = `CMYK Master Link (.${extLabel.toLowerCase()})`
			vaultRole = 'Canonical Prepress Link Vault'
		} else if (isPackageLinksPath || isScratchPath) {
			isCmykPackageClone = true
			artifactKind = `Packaged CMYK Link (.${extLabel.toLowerCase()})`
			vaultRole = isScratchPath ? 'Staging CMYK Link Copy' : 'Packaged Job Links/ Clone'
		} else {
			artifactKind = `CMYK Press Link (.${extLabel.toLowerCase()})`
			vaultRole = 'Editorial CMYK Press Link'
		}
	}

	const { publishingTool, prepressStage } = extractPublishingToolAndStage(normalized, basename)
	const lineageStem = extractPublishingLineageStem(basename, normalized)
	const jobFolder = extractMeaningfulJobFolder(normalized)
	const fontInfo = isFontExt
		? extractFontFamilyInfo(basename, normalized)
		: { fontFamily: '', fontWeightStyle: '', fontFormat: '', fontFamilyKey: '' }
	const prepressTag = extractPrepressTag(lowerBase, lower)

	let hasFontLicenseRisk = false
	let fontRiskLevel = 'none'
	let fontLicenseReason = ''
	if (isFontExt && isFontPackageOrScratchClone) {
		hasFontLicenseRisk = true
		fontRiskLevel = isScratchPath ? 'critical' : 'elevated'
		fontLicenseReason = isScratchPath
			? 'Commercial font duplicate outside licensed vault in scratch/downloads path'
			: 'Packaged campaign font clone duplicating licensed typeface family'
	}

	return {
		normalized,
		lower,
		basename,
		dirname,
		size,
		mtimeMs,
		formattedMtime,
		ageDays,
		family,
		artifactKind,
		vaultRole,
		publishingTool,
		prepressStage,
		lineageStem,
		jobFolder,
		prepressTag,
		isLayoutSource,
		isStrictLayoutExt,
		isIdmlExt,
		isSignedPdfx4Bat,
		isSupersededProofPdf,
		isBleedPdf,
		isPrintPdf,
		isWebPdf,
		isProofPdf,
		isFontExt,
		isLicensedFontMaster,
		isFontPackageOrScratchClone,
		isCmykHiresLink,
		isCmykMasterLink,
		isCmykPackageClone,
		isMutableFile,
		isCanonicalLayoutPath,
		isCanonicalFontVaultPath,
		isCanonicalLinkVaultPath,
		isPackageFontClonePath,
		isScratchPath,
		fontFamily: fontInfo.fontFamily,
		fontWeightStyle: fontInfo.fontWeightStyle,
		fontFormat: fontInfo.fontFormat,
		fontFamilyKey: fontInfo.fontFamilyKey,
		hasFontLicenseRisk,
		fontRiskLevel,
		fontLicenseReason,
	}
}

/**
 * Determine whether a duplicate group belongs to the Publishing, Prepress, PDF/X & Font Licensing domain.
 *
 * @param {object} group Duplicate group.
 * @return {boolean} True when at least one file belongs to this domain.
 */
export function isPublishingPrepressGroup(group) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return false
	}
	return group.files.some(file => classifyPublishingPrepressFile(file).family !== null)
}

/**
 * Build cross-group correlation index linking:
 * - Verified layout source anchors (.indd, .afpub, .qxp, canonical .idml) to prepress PDFs
 * - Font family duplicate occurrences across multiple clusters and formats (.otf/.ttf/.woff2)
 * - Signed PDF/X-4 BAT anchors
 *
 * @param {Array<object>} groups Domain duplicate groups.
 * @return {object} Correlation index.
 */
export function buildPublishingPrepressCorrelationIndex(groups) {
	const layoutAnchorStems = new Set()
	const layoutAnchorFolders = new Set()
	const signedBatStems = new Set()
	const fontFamilyClusterIds = new Map()
	const fontFamilyFormats = new Map()
	const fontFamilyHasMaster = new Set()

	for (const group of Array.isArray(groups) ? groups : []) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		const groupId = group.id ?? group.hash ?? ''
		for (const file of group.files) {
			const meta = classifyPublishingPrepressFile(file)
			if (!meta.family) {
				continue
			}
			if (meta.isLayoutSource) {
				layoutAnchorStems.add(meta.lineageStem)
				if (meta.jobFolder) {
					layoutAnchorFolders.add(meta.jobFolder)
				}
			}
			if (meta.isSignedPdfx4Bat) {
				signedBatStems.add(meta.lineageStem)
			}
			if (meta.isFontExt && meta.fontFamilyKey) {
				if (!fontFamilyClusterIds.has(meta.fontFamilyKey)) {
					fontFamilyClusterIds.set(meta.fontFamilyKey, new Set())
				}
				fontFamilyClusterIds.get(meta.fontFamilyKey).add(groupId)

				if (!fontFamilyFormats.has(meta.fontFamilyKey)) {
					fontFamilyFormats.set(meta.fontFamilyKey, new Set())
				}
				if (meta.fontFormat) {
					fontFamilyFormats.get(meta.fontFamilyKey).add(meta.fontFormat)
				}
				if (meta.isLicensedFontMaster) {
					fontFamilyHasMaster.add(meta.fontFamilyKey)
				}
			}
		}
	}

	return {
		layoutAnchorStems,
		layoutAnchorFolders,
		signedBatStems,
		fontFamilyClusterIds,
		fontFamilyFormats,
		fontFamilyHasMaster,
	}
}

/**
 * Determine primary family for a heterogeneous prepress cluster.
 *
 * @param {Array<object>} members Classified members.
 * @return {string} Family ID.
 */
function resolveClusterFamily(members) {
	if (members.some(m => m.family === 'layout-sources')) {
		return 'layout-sources'
	}
	if (members.some(m => m.family === 'prepress-pdfx-proofs')) {
		return 'prepress-pdfx-proofs'
	}
	if (members.some(m => m.family === 'licensed-commercial-fonts')) {
		return 'licensed-commercial-fonts'
	}
	return 'cmyk-hires-links'
}

/**
 * Compute deterministic survivor priority score for a prepress vault member.
 *
 * @param {object} member Classified member.
 * @param {string} survivorRule Survivor rule.
 * @return {number} Priority score (higher wins).
 */
function scoreMemberForSurvivor(member, survivorRule) {
	const mtimeScore = member.mtimeMs !== null ? member.mtimeMs / 1e10 : 0
	const shortPathScore = 1000 - Math.min(999, member.normalized.length)

	if (survivorRule === 'oldest-master-first') {
		const oldestScore = member.mtimeMs !== null ? -mtimeScore : 0
		return (member.isLayoutSource ? 95000 : 0)
			+ (member.isSignedPdfx4Bat ? 90000 : 0)
			+ (member.isLicensedFontMaster ? 85000 : 0)
			+ (member.isCmykMasterLink ? 75000 : 0)
			+ (member.isCanonicalLayoutPath || member.isCanonicalFontVaultPath || member.isCanonicalLinkVaultPath ? 20000 : 0)
			+ (member.isScratchPath || member.isWebPdf || member.isProofPdf ? -40000 : 0)
			+ oldestScore
			+ shortPathScore
	}

	if (survivorRule === 'newest-prepress-first') {
		return (member.isLayoutSource ? 95000 : 0)
			+ (member.isSignedPdfx4Bat ? 90000 : 0)
			+ (member.isLicensedFontMaster ? 85000 : 0)
			+ (member.isCmykMasterLink ? 75000 : 0)
			+ (member.isScratchPath || member.isWebPdf ? -35000 : 0)
			+ mtimeScore
	}

	if (survivorRule === 'shortest-path') {
		return (member.isLayoutSource ? 50000 : 0)
			+ (member.isSignedPdfx4Bat ? 45000 : 0)
			+ (member.isScratchPath ? -10000 : 0)
			+ shortPathScore
	}

	return (member.isLayoutSource ? 98000 : 0)
		+ (member.isSignedPdfx4Bat ? 92000 : 0)
		+ (member.isLicensedFontMaster ? 88000 : 0)
		+ (member.isCmykMasterLink ? 76000 : 0)
		+ (member.isPrintPdf || member.isBleedPdf ? 30000 : 0)
		+ (member.isCanonicalLayoutPath || member.isCanonicalFontVaultPath || member.isCanonicalLinkVaultPath ? 20000 : 0)
		+ (member.isWebPdf || member.isProofPdf ? -30000 : 0)
		+ (member.isFontPackageOrScratchClone ? -35000 : 0)
		+ (member.isScratchPath ? -45000 : 0)
		+ shortPathScore
}

/**
 * Audit a single Publishing, Prepress, PDF/X & Font Licensing duplicate cluster.
 *
 * @param {object} group Duplicate group.
 * @param {object} correlationIndex Cross-group correlation index.
 * @param {object} config Normalized configuration.
 * @param {number} referenceNowMs Reference epoch ms.
 * @return {object|null} Audited cluster entry or null if outside domain.
 */
function auditSingleCluster(group, correlationIndex, config, referenceNowMs) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return null
	}

	const rawMembers = group.files.map((file, index) => {
		const meta = classifyPublishingPrepressFile(file, referenceNowMs)
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
	const primaryTool = rawMembers.find(m => m.publishingTool)?.publishingTool || ''
	const primaryStage = rawMembers.find(m => m.prepressStage)?.prepressStage || ''
	const primaryStem = rawMembers[0].lineageStem || extractPublishingLineageStem(primaryName, rawMembers[0].normalized)
	const fontMember = rawMembers.find(m => m.isFontExt && m.fontFamilyKey)
	const primaryFontFamily = fontMember ? fontMember.fontFamily : ''
	const primaryFontFamilyKey = fontMember ? fontMember.fontFamilyKey : ''

	const fontFamilyClusterCount = primaryFontFamilyKey
		? (correlationIndex.fontFamilyClusterIds.get(primaryFontFamilyKey)?.size || 1)
		: 0
	const fontFamilyFormats = primaryFontFamilyKey
		? Array.from(correlationIndex.fontFamilyFormats.get(primaryFontFamilyKey) || [])
		: []
	const fontFamilyHasMasterAnchor = primaryFontFamilyKey
		? correlationIndex.fontFamilyHasMaster.has(primaryFontFamilyKey)
		: false
	const isCrossClusterFontFamilyDuplicate = Boolean(
		primaryFontFamilyKey && (fontFamilyClusterCount > 1 || fontFamilyFormats.length > 1)
	)

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

	const hasLayoutSourceAnchor = Boolean(
		rawMembers.some(m => m.isLayoutSource)
		|| correlationIndex.layoutAnchorStems.has(primaryStem)
		|| rawMembers.some(m => m.jobFolder && correlationIndex.layoutAnchorFolders.has(m.jobFolder))
	)

	let reclaimableBytes = 0
	let hardlinkSavingsBytes = 0
	let deleteTargetsCount = 0
	let hardlinkTargetsCount = 0
	let shieldedCount = 0

	const members = rawMembers.map((member) => {
		const isSurvivor = member.key === survivorKey
		const override = config.memberOverrides?.[member.key] || 'auto'

		const memberHasFontLicenseRisk = Boolean(
			member.hasFontLicenseRisk
			|| (member.isFontExt && isCrossClusterFontFamilyDuplicate && !member.isLicensedFontMaster)
		)
		const memberFontRiskLevel = member.isScratchPath
			? 'critical'
			: ((memberHasFontLicenseRisk || isCrossClusterFontFamilyDuplicate) && member.isFontExt ? 'elevated' : member.fontRiskLevel)
		const memberFontLicenseReason = member.fontLicenseReason
			|| (member.isFontExt && isCrossClusterFontFamilyDuplicate
				? `Duplicate font family (${member.fontFamily}) detected across ${fontFamilyClusterCount} clusters / ${fontFamilyFormats.join(', ') || member.fontFormat}`
				: '')

		let governanceTier = 'cmyk-link-duplicate'
		let shielded = false
		let protectedReason = ''
		let action = 'keep'

		if (override === 'keep' && !isSurvivor) {
			governanceTier = member.isLayoutSource
				? 'layout-source-protected'
				: (member.isSignedPdfx4Bat
					? 'signed-pdfx4-bat-protected'
					: (member.isLicensedFontMaster
						? 'licensed-font-master-protected'
						: (memberHasFontLicenseRisk
							? 'font-license-duplicate-risk'
							: (member.isSupersededProofPdf ? 'superseded-prepress-proof' : 'cmyk-link-duplicate'))))
			shielded = true
			protectedReason = 'Manually shielded via per-copy override'
		} else if (member.isLayoutSource && config.protectLayoutSources) {
			governanceTier = 'layout-source-protected'
			shielded = true
			protectedReason = 'Editorial layout source (.indd/.afpub/.qxp/.idml) strictly conserved'
		} else if (member.isSignedPdfx4Bat && config.protectSignedPdfx4Bat) {
			governanceTier = 'signed-pdfx4-bat-protected'
			shielded = true
			protectedReason = 'Signed PDF/X-4 BAT press proof strictly conserved'
		} else if (member.isLicensedFontMaster && config.protectLicensedFontMasters) {
			governanceTier = 'licensed-font-master-protected'
			shielded = true
			protectedReason = 'Licensed commercial font master strictly conserved in canonical font vault'
		} else if (isSurvivor) {
			governanceTier = member.isLayoutSource
				? 'layout-source-protected'
				: (member.isSignedPdfx4Bat
					? 'signed-pdfx4-bat-protected'
					: (member.isLicensedFontMaster
						? 'licensed-font-master-protected'
						: (member.isFontExt
							? 'licensed-font-master-protected'
							: (member.isSupersededProofPdf ? 'superseded-prepress-proof' : 'cmyk-link-duplicate'))))
			shielded = true
			protectedReason = member.isFontExt
				? 'Canonical commercial font survivor retained for family compliance'
				: 'Canonical publishing & prepress vault survivor retained'
		} else if (override === 'prune') {
			governanceTier = memberHasFontLicenseRisk
				? 'font-license-duplicate-risk'
				: (member.isSupersededProofPdf ? 'superseded-prepress-proof' : 'cmyk-link-duplicate')
			action = config.strategy === 'hardlink-fonts-and-cmyk-links' && !member.isMutableFile
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
		} else if (member.isLayoutSource) {
			governanceTier = 'layout-source-protected'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
		} else if (member.isSignedPdfx4Bat) {
			governanceTier = 'signed-pdfx4-bat-protected'
			action = config.strategy === 'hardlink-fonts-and-cmyk-links' && !member.isMutableFile ? 'hardlink' : 'delete'
			if (action === 'hardlink') {
				hardlinkSavingsBytes += member.size
				hardlinkTargetsCount += 1
			} else {
				deleteTargetsCount += 1
			}
			reclaimableBytes += member.size
		} else if (member.isLicensedFontMaster) {
			governanceTier = 'licensed-font-master-protected'
			action = config.strategy === 'hardlink-fonts-and-cmyk-links' && !member.isMutableFile ? 'hardlink' : 'delete'
			if (action === 'hardlink') {
				hardlinkSavingsBytes += member.size
				hardlinkTargetsCount += 1
			} else {
				deleteTargetsCount += 1
			}
			reclaimableBytes += member.size
		} else if (
			config.keepRecentProofDays > 0
			&& member.ageDays !== null
			&& member.ageDays < config.keepRecentProofDays
			&& member.isSupersededProofPdf
		) {
			governanceTier = 'superseded-prepress-proof'
			shielded = true
			protectedReason = `Within ${config.keepRecentProofDays}-day prepress proof retention window`
		} else if (member.isSupersededProofPdf) {
			governanceTier = 'superseded-prepress-proof'
			if (config.requireLayoutSourceAnchor && !hasLayoutSourceAnchor) {
				shielded = true
				protectedReason = 'Blocked until a verified .indd/.afpub/.qxp layout source anchor exists'
			} else if (config.strategy === 'hardlink-fonts-and-cmyk-links' && !member.isMutableFile) {
				action = 'hardlink'
				hardlinkSavingsBytes += member.size
				hardlinkTargetsCount += 1
				reclaimableBytes += member.size
			} else {
				action = 'delete'
				deleteTargetsCount += 1
				reclaimableBytes += member.size
			}
		} else if (member.isFontExt) {
			governanceTier = 'font-license-duplicate-risk'
			if (config.strategy === 'hardlink-fonts-and-cmyk-links' && !member.isMutableFile && !member.isScratchPath) {
				action = 'hardlink'
				hardlinkSavingsBytes += member.size
				hardlinkTargetsCount += 1
				reclaimableBytes += member.size
				protectedReason = 'Packaged font clone consolidated via hardlink to licensed vault anchor'
			} else {
				action = 'delete'
				deleteTargetsCount += 1
				reclaimableBytes += member.size
				protectedReason = memberFontLicenseReason || 'Duplicate commercial font copy outside licensed vault'
			}
		} else if (config.strategy === 'hardlink-fonts-and-cmyk-links' && !member.isMutableFile) {
			governanceTier = 'cmyk-link-duplicate'
			action = 'hardlink'
			hardlinkSavingsBytes += member.size
			hardlinkTargetsCount += 1
			reclaimableBytes += member.size
		} else {
			governanceTier = 'cmyk-link-duplicate'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
		}

		if (shielded) {
			shieldedCount += 1
		}

		return {
			...member,
			hasFontLicenseRisk: memberHasFontLicenseRisk,
			fontRiskLevel: memberFontRiskLevel,
			fontLicenseReason: memberFontLicenseReason,
			isSurvivor,
			governanceTier,
			shielded,
			protectedReason,
			action,
		}
	})

	const hasFontLicenseDuplicateRisk = members.some(m => m.hasFontLicenseRisk) || isCrossClusterFontFamilyDuplicate
	const hasCriticalFontRisk = members.some(m => m.fontRiskLevel === 'critical')
	const maxFontRiskLevel = hasCriticalFontRisk ? 'critical' : (hasFontLicenseDuplicateRisk ? 'elevated' : 'none')

	let clusterVerdict = 'cmyk-link-duplicate'
	if (members.some(m => m.governanceTier === 'layout-source-protected')) {
		clusterVerdict = 'layout-source-protected'
	} else if (members.some(m => m.governanceTier === 'signed-pdfx4-bat-protected')) {
		clusterVerdict = 'signed-pdfx4-bat-protected'
	} else if (members.some(m => m.governanceTier === 'licensed-font-master-protected') && !hasFontLicenseDuplicateRisk) {
		clusterVerdict = 'licensed-font-master-protected'
	} else if (hasFontLicenseDuplicateRisk) {
		clusterVerdict = 'font-license-duplicate-risk'
	} else if (members.some(m => m.governanceTier === 'superseded-prepress-proof')) {
		clusterVerdict = 'superseded-prepress-proof'
	} else if (members.some(m => m.governanceTier === 'licensed-font-master-protected')) {
		clusterVerdict = 'licensed-font-master-protected'
	}

	const hasReclaimable = (deleteTargetsCount + hardlinkTargetsCount) > 0
	const prepressTags = Array.from(new Set(members.map(m => m.prepressTag).filter(Boolean)))

	const riskScore = (hasCriticalFontRisk ? 125 : (hasFontLicenseDuplicateRisk ? 110 : 0))
		+ (clusterVerdict === 'layout-source-protected' ? 100 : 0)
		+ (clusterVerdict === 'signed-pdfx4-bat-protected' ? 95 : 0)
		+ (clusterVerdict === 'licensed-font-master-protected' ? 90 : 0)
		+ (clusterVerdict === 'superseded-prepress-proof' ? 80 : 0)
		+ (clusterVerdict === 'cmyk-link-duplicate' ? 70 : 0)
		+ (hasReclaimable ? 20 : 0)

	return {
		id: group.id ?? primaryName,
		hash: group.hash || '',
		name: primaryName,
		publishingTool: primaryTool,
		prepressStage: primaryStage,
		lineageStem: primaryStem,
		family,
		familyLabel: PUBLISHING_PREPRESS_FAMILY_META[family]?.label || family,
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
		hasLayoutSource: members.some(m => m.governanceTier === 'layout-source-protected'),
		hasSignedPdfx4Bat: members.some(m => m.governanceTier === 'signed-pdfx4-bat-protected'),
		hasLicensedFontMaster: members.some(m => m.governanceTier === 'licensed-font-master-protected') || fontFamilyHasMasterAnchor,
		hasSupersededProofPdf: members.some(m => m.isSupersededProofPdf),
		hasCmykHiresLinks: members.some(m => m.isCmykHiresLink),
		hasFontLicenseDuplicateRisk,
		maxFontRiskLevel,
		primaryFontFamily,
		fontFamilyClusterCount,
		fontFamilyFormats,
		hasLayoutSourceAnchor,
		prepressTags,
		members,
		group,
	}
}

/**
 * Audit duplicate groups across Publishing, Prepress, Print-Ready PDF/X & Font Licensing Vaults.
 *
 * @param {Array<object>} groups Duplicate groups.
 * @param {object} [rawConfig] Audit configuration overrides.
 * @param {number} [referenceNowMs] Reference epoch ms for deterministic tests.
 * @return {object} Complete audit report with summary, family counts, and filtered clusters.
 */
export function auditPublishingPrepressVault(groups, rawConfig = {}, referenceNowMs = Date.now()) {
	const config = normalizePublishingPrepressConfig(rawConfig)
	const sourceGroups = Array.isArray(groups) ? groups : []
	const domainGroups = sourceGroups.filter(isPublishingPrepressGroup)
	const correlationIndex = buildPublishingPrepressCorrelationIndex(domainGroups)

	const allClusters = domainGroups
		.map(group => auditSingleCluster(group, correlationIndex, config, referenceNowMs))
		.filter(Boolean)

	const minSizeBytes = config.minSizeKb * 1024
	const sizeFiltered = allClusters.filter(cluster => cluster.unitBytes >= minSizeBytes)

	const familyCounts = {
		all: sizeFiltered.length,
		'layout-sources': 0,
		'prepress-pdfx-proofs': 0,
		'licensed-commercial-fonts': 0,
		'cmyk-hires-links': 0,
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
		if (config.verdictFilter === 'font-license-duplicate-risk' && !cluster.hasFontLicenseDuplicateRisk) {
			return false
		}
		if (
			config.verdictFilter !== 'all'
			&& config.verdictFilter !== 'reclaimable'
			&& config.verdictFilter !== 'shielded'
			&& config.verdictFilter !== 'font-license-duplicate-risk'
			&& cluster.clusterVerdict !== config.verdictFilter
		) {
			return false
		}
		if (query.length > 0) {
			const matchesName = cluster.name.toLowerCase().includes(query)
			const matchesStem = cluster.lineageStem.toLowerCase().includes(query)
			const matchesTool = cluster.publishingTool.toLowerCase().includes(query)
			const matchesStage = cluster.prepressStage.toLowerCase().includes(query)
			const matchesFont = cluster.primaryFontFamily.toLowerCase().includes(query)
			const matchesTag = cluster.prepressTags.some(tag => tag.toLowerCase().includes(query))
			const matchesMember = cluster.members.some(m => m.lower.includes(query))
			if (!matchesName && !matchesStem && !matchesTool && !matchesStage && !matchesFont && !matchesTag && !matchesMember) {
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
	let totalLayoutSourceClusters = 0
	let totalSignedBatClusters = 0
	let totalLicensedFontMasterClusters = 0
	let totalFontLicenseDuplicateClusters = 0
	let totalSupersededProofClusters = 0
	let totalCmykLinkClusters = 0

	for (const cluster of filteredClusters) {
		rawDuplicateBytes += Math.max(0, cluster.totalBytes - cluster.unitBytes)
		reclaimableBytes += cluster.reclaimableBytes
		totalReclaimableCopiesCount += cluster.reclaimableTargetsCount
		totalShieldedCopiesCount += cluster.shieldedCount

		if (cluster.hasLayoutSource) {
			totalLayoutSourceClusters += 1
		}
		if (cluster.hasSignedPdfx4Bat) {
			totalSignedBatClusters += 1
		}
		if (cluster.hasLicensedFontMaster) {
			totalLicensedFontMasterClusters += 1
		}
		if (cluster.hasFontLicenseDuplicateRisk) {
			totalFontLicenseDuplicateClusters += 1
		}
		if (cluster.hasSupersededProofPdf) {
			totalSupersededProofClusters += 1
		}
		if (cluster.hasCmykHiresLinks) {
			totalCmykLinkClusters += 1
		}
	}

	const efficiencyPct = rawDuplicateBytes > 0
		? Math.min(100, Math.round((reclaimableBytes / rawDuplicateBytes) * 100))
		: 0

	const reclaimableGb = `${(reclaimableBytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`

	const familyBreakdown = PUBLISHING_PREPRESS_FAMILIES
		.filter(id => id !== 'all')
		.map(id => ({
			id,
			label: PUBLISHING_PREPRESS_FAMILY_META[id].label,
			shortLabel: PUBLISHING_PREPRESS_FAMILY_META[id].shortLabel,
			clustersCount: familyCounts[id] || 0,
		}))

	return {
		schema: PUBLISHING_PREPRESS_VAULT_SCHEMA,
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
			totalLayoutSourceClusters,
			totalSignedBatClusters,
			totalLicensedFontMasterClusters,
			totalFontLicenseDuplicateClusters,
			totalSupersededProofClusters,
			totalCmykLinkClusters,
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
 * Build a safe POSIX DRY_RUN=1 remediation script for Publishing & Prepress vaults.
 * Strictly blocks deletion or hardlinking of shielded .indd/.afpub/.qxp layout sources,
 * signed PDF/X-4 BAT proofs, and master licensed fonts, and never hardlinks mutable
 * layout/layered files (.indd, .idml, .afpub, .qxp, .psd).
 *
 * @param {object} auditResult Result from auditPublishingPrepressVault.
 * @return {string} POSIX bash script.
 */
export function buildPublishingPrepressRemediationScript(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# Publishing, Prepress, Print-Ready PDF/X & Font Licensing Vault Auditor',
		'# Safe POSIX Remediation Script (default DRY_RUN=1)',
		'# Run with DRY_RUN=0 ./publishing-prepress-vault-reclaim.sh only after verifying layout masters, PDF/X-4 BATs, and font EULAs.',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'QUARANTINE_DIR="$' + '{QUARANTINE_DIR:-./.prepress-font-quarantine}"',
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
	const strategy = auditResult?.config?.strategy || 'prune-superseded-proofs-and-font-clones'
	for (const cluster of clusters) {
		const actions = (cluster.members || []).filter(m => !m.shielded && (m.action === 'delete' || m.action === 'hardlink'))
		if (actions.length === 0) {
			continue
		}
		lines.push(`# Cluster: ${cluster.name} | Family: ${cluster.familyLabel} | Survivor: ${cluster.survivorPath}`)
		for (const target of actions) {
			actionCount += 1
			if (target.action === 'hardlink' && !target.isMutableFile) {
				lines.push(`run_cmd ln -f ${quotePosixPath(cluster.survivorPath)} ${quotePosixPath(target.normalized)}`)
			} else if (strategy === 'quarantine-unlicensed-fonts-and-drafts' || target.hasFontLicenseRisk) {
				lines.push('run_cmd mkdir -p "$QUARANTINE_DIR"')
				lines.push(`run_cmd mv -n ${quotePosixPath(target.normalized)} "$QUARANTINE_DIR/"`)
			} else {
				lines.push(`run_cmd rm -f ${quotePosixPath(target.normalized)}`)
			}
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('printf "No reclaimable superseded proofs, font license duplicates, or CMYK link clones under active prepress shields.\\n"')
	} else {
		lines.push(`printf "Completed Publishing & Prepress Vault remediation plan (%d target actions, DRY_RUN=%s).\\n" "${actionCount}" "$DRY_RUN"`)
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe RFC-4180 CSV audit report.
 *
 * @param {object} auditResult Result from auditPublishingPrepressVault.
 * @return {string} RFC-4180 CSV string.
 */
export function buildPublishingPrepressCsvReport(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const headers = [
		'cluster_id',
		'cluster_name',
		'publishing_tool',
		'prepress_stage',
		'lineage_stem',
		'family',
		'cluster_verdict',
		'font_family',
		'font_weight_style',
		'font_format',
		'font_license_duplicate_risk',
		'font_risk_level',
		'member_path',
		'artifact_kind',
		'vault_role',
		'prepress_tag',
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
				cluster.publishingTool || '',
				cluster.prepressStage || '',
				cluster.lineageStem,
				cluster.family,
				cluster.clusterVerdict,
				member.fontFamily || '',
				member.fontWeightStyle || '',
				member.fontFormat || '',
				member.hasFontLicenseRisk ? 'true' : 'false',
				member.fontRiskLevel || 'none',
				member.normalized,
				member.artifactKind,
				member.vaultRole,
				member.prepressTag || '',
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
 * @param {object} auditResult Result from auditPublishingPrepressVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildPublishingPrepressJsonManifest(auditResult) {
	const payload = {
		schema: PUBLISHING_PREPRESS_VAULT_SCHEMA,
		generatedAt: new Date().toISOString(),
		config: auditResult?.config || PUBLISHING_PREPRESS_DEFAULT_CONFIG,
		summary: auditResult?.summary || {},
		clusters: (auditResult?.clusters || []).map(cluster => ({
			id: cluster.id,
			name: cluster.name,
			publishingTool: cluster.publishingTool,
			prepressStage: cluster.prepressStage,
			lineageStem: cluster.lineageStem,
			family: cluster.family,
			clusterVerdict: cluster.clusterVerdict,
			unitBytes: cluster.unitBytes,
			totalBytes: cluster.totalBytes,
			reclaimableBytes: cluster.reclaimableBytes,
			survivorPath: cluster.survivorPath,
			hasLayoutSource: cluster.hasLayoutSource,
			hasSignedPdfx4Bat: cluster.hasSignedPdfx4Bat,
			hasLicensedFontMaster: cluster.hasLicensedFontMaster,
			hasSupersededProofPdf: cluster.hasSupersededProofPdf,
			hasCmykHiresLinks: cluster.hasCmykHiresLinks,
			hasFontLicenseDuplicateRisk: cluster.hasFontLicenseDuplicateRisk,
			maxFontRiskLevel: cluster.maxFontRiskLevel,
			primaryFontFamily: cluster.primaryFontFamily,
			fontFamilyClusterCount: cluster.fontFamilyClusterCount,
			fontFamilyFormats: cluster.fontFamilyFormats,
			hasLayoutSourceAnchor: cluster.hasLayoutSourceAnchor,
			prepressTags: cluster.prepressTags,
			members: (cluster.members || []).map(member => ({
				path: member.normalized,
				artifactKind: member.artifactKind,
				vaultRole: member.vaultRole,
				prepressTag: member.prepressTag || '',
				governanceTier: member.governanceTier,
				action: member.action,
				shielded: member.shielded,
				protectedReason: member.protectedReason,
				fontFamily: member.fontFamily || '',
				fontWeightStyle: member.fontWeightStyle || '',
				fontFormat: member.fontFormat || '',
				hasFontLicenseRisk: member.hasFontLicenseRisk,
				fontRiskLevel: member.fontRiskLevel,
				fontLicenseReason: member.fontLicenseReason || '',
				isSurvivor: member.isSurvivor,
				size: member.size,
			})),
		})),
	}
	return JSON.stringify(payload, null, 2)
}

/**
 * Generate a Nextcloud/rsync .sync-exclude.lst rule set to prevent accidental
 * cloud sync of InDesign/Quark/Affinity lock files, prepress RIP caches, and temp exports.
 *
 * @return {string} Line-delimited .sync-exclude.lst rules.
 */
export function buildPublishingPrepressSyncExcludeList() {
	return [
		'# Nextcloud / rsync exclusion rules for Publishing, Prepress PDF/X & Font Vaults',
		'*.idlk',
		'InDesign Recovery/',
		'*.indd.tmp',
		'*.afpub~lock~',
		'*.qxp.lck',
		'Preflight_Temp/',
		'RIP_Cache/',
		'AdobeFnt*.lst',
		'Document fonts/*.tmp',
		'*_web_preview.tmp.pdf',
		'*.tmp',
	].join('\n')
}
