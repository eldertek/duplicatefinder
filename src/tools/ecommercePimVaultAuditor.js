/**
 * Pure E-Commerce, PIM Product Media & Brand Asset Vault Auditor.
 * Classifies and audits duplicate clusters across 4 E-Commerce & PIM media families:
 * - SKU Visual Masters & Brand Sources (.psd, .psb, .ai, .eps, .svg, .indd, .idml, .afdesign, .afphoto, .xcf)
 * - Derived Packshots & Multi-Size Renders (.png, .webp, .avif, .jpg, .jpeg with @2x/@3x/thumb/1200w/pdp/marketplace variants)
 * - Catalogs, Spec-Sheets & Product PDFs (.pdf datasheets, lookbooks, catalogs, manuals, compliance sheets)
 * - PIM Feeds, Channel Exports & Price Lists (.csv, .xlsx, .xls, .xml product feeds and marketplace exports)
 *
 * Detects resized/recompressed variants of the same SKU against conserved vector/PSD/InDesign masters,
 * strictly conserves source SKU masters, approved brand logos/guidelines, and published hero packshots,
 * and builds DRY_RUN=1 POSIX scripts, CWE-1236-safe CSV reports, JSON manifests, and .sync-exclude.lst rules.
 *
 * Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const ECOMMERCE_PIM_VAULT_SCHEMA = 'duplicatefinder.ecommerce-pim-vault-auditor.v1'

export const ECOMMERCE_PIM_FAMILIES = Object.freeze([
	'all',
	'sku-visual-masters',
	'derived-packshot-renders',
	'catalog-spec-sheets',
	'pim-feeds-exports',
])

export const ECOMMERCE_PIM_FAMILY_META = Object.freeze({
	'sku-visual-masters': {
		id: 'sku-visual-masters',
		label: 'SKU Visual Masters & Brand Sources',
		shortLabel: 'Masters (.psd, .psb, .ai, .eps, .svg, .indd)',
	},
	'derived-packshot-renders': {
		id: 'derived-packshot-renders',
		label: 'Derived Packshots & Multi-Size Renders',
		shortLabel: 'Packshots (.png, .webp, .avif, .jpg @2x/thumb/1200w)',
	},
	'catalog-spec-sheets': {
		id: 'catalog-spec-sheets',
		label: 'Catalogs, Spec-Sheets & Product PDFs',
		shortLabel: 'Catalog & Spec PDFs (.pdf datasheets/lookbooks)',
	},
	'pim-feeds-exports': {
		id: 'pim-feeds-exports',
		label: 'PIM Feeds, Channel Exports & Price Lists',
		shortLabel: 'PIM Feeds (.csv, .xlsx, .xls, .xml)',
	},
})

export const ECOMMERCE_PIM_STRATEGIES = Object.freeze([
	'prune-derived-packshots-and-stale-feeds',
	'hardlink-published-packshots-vault',
	'quarantine-variants-and-exports',
])

export const ECOMMERCE_PIM_SURVIVOR_RULES = Object.freeze([
	'master-brand-hero-first',
	'highest-resolution-and-master-first',
	'newest-pim-publish-first',
	'shortest-path',
])

export const ECOMMERCE_PIM_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'sku-master-protected',
	'brand-logo-protected',
	'hero-packshot-protected',
	'derived-packshot-variant',
	'stale-pim-feed-export',
	'shielded',
])

export const ECOMMERCE_PIM_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const ECOMMERCE_PIM_PRESETS = Object.freeze([
	{
		id: 'all-ecommerce-pim-vault-audit',
		name: 'All SKU Masters, Packshots & PIM Feeds',
		description: 'Audit SKU visual masters (.psd, .ai, .eps, .svg, .indd), derived packshots (.png, .webp, .avif, .jpg @2x/thumb/1200w), spec PDFs, and PIM feeds while guarding masters, brand logos, and hero packshots.',
		familyFilter: 'all',
		strategy: 'prune-derived-packshots-and-stale-feeds',
		survivorRule: 'master-brand-hero-first',
		protectSkuMasters: true,
		protectBrandLogos: true,
		protectHeroPackshots: true,
		requireVerifiedMasterForDerivativePrune: true,
		keepRecentFeedDays: 0,
		minSizeMb: 0,
	},
	{
		id: 'derived-packshot-pyramids',
		name: 'Derived Packshots (@2x / thumb / 1200w)',
		description: 'Detect resized and recompressed .png/.webp/.avif/.jpg SKU packshots and reclaim redundant derivatives only when a source master or hero packshot is verified.',
		familyFilter: 'derived-packshot-renders',
		strategy: 'prune-derived-packshots-and-stale-feeds',
		survivorRule: 'highest-resolution-and-master-first',
		protectSkuMasters: true,
		protectBrandLogos: true,
		protectHeroPackshots: true,
		requireVerifiedMasterForDerivativePrune: true,
		keepRecentFeedDays: 0,
		minSizeMb: 0,
	},
	{
		id: 'brand-logos-and-sku-masters',
		name: 'Brand Charts & SKU Masters',
		description: 'Strictly shield approved brand guidelines, logos, and editable .psd/.ai/.eps/.svg/.indd masters across product catalogs.',
		familyFilter: 'sku-visual-masters',
		strategy: 'quarantine-variants-and-exports',
		survivorRule: 'master-brand-hero-first',
		protectSkuMasters: true,
		protectBrandLogos: true,
		protectHeroPackshots: true,
		requireVerifiedMasterForDerivativePrune: true,
		keepRecentFeedDays: 0,
		minSizeMb: 0,
	},
	{
		id: 'catalog-pdfs-and-pim-feeds',
		name: 'PIM Feeds & Channel Exports',
		description: 'Target duplicated .csv, .xlsx, and .xml marketplace feed exports in staging/export_old folders while preserving canonical PIM master feeds.',
		familyFilter: 'pim-feeds-exports',
		strategy: 'prune-derived-packshots-and-stale-feeds',
		survivorRule: 'newest-pim-publish-first',
		protectSkuMasters: true,
		protectBrandLogos: true,
		protectHeroPackshots: true,
		requireVerifiedMasterForDerivativePrune: false,
		keepRecentFeedDays: 0,
		minSizeMb: 0,
	},
	{
		id: 'hardlink-published-packshots',
		name: 'Hardlink Published Packshots & PDFs',
		description: 'Deduplicate immutable published packshots and spec-sheet PDFs via POSIX hardlinks while blocking hardlinks on mutable .psd/.ai/.indd masters and PIM feeds.',
		familyFilter: 'all',
		strategy: 'hardlink-published-packshots-vault',
		survivorRule: 'master-brand-hero-first',
		protectSkuMasters: true,
		protectBrandLogos: true,
		protectHeroPackshots: true,
		requireVerifiedMasterForDerivativePrune: false,
		keepRecentFeedDays: 0,
		minSizeMb: 0,
	},
])

export const ECOMMERCE_PIM_DEFAULT_CONFIG = Object.freeze({
	presetId: 'all-ecommerce-pim-vault-audit',
	familyFilter: 'all',
	verdictFilter: 'all',
	strategy: 'prune-derived-packshots-and-stale-feeds',
	survivorRule: 'master-brand-hero-first',
	sortMode: 'reclaim_desc',
	searchQuery: '',
	protectSkuMasters: true,
	protectBrandLogos: true,
	protectHeroPackshots: true,
	requireVerifiedMasterForDerivativePrune: true,
	keepRecentFeedDays: 0,
	minSizeMb: 0,
})

const SKU_MASTER_EXT_RE = /\.(?:psd|psb|ai|eps|svg|indd|idml|afdesign|afphoto|xcf)$/i
const PACKSHOT_RASTER_EXT_RE = /\.(?:png|webp|avif|jpe?g)$/i
const CATALOG_PDF_EXT_RE = /\.pdf$/i
const PIM_FEED_EXT_RE = /\.(?:csv|xlsx|xls|xml)$/i

const MUTABLE_MASTER_OR_FEED_EXT_RE = /\.(?:psd|psb|ai|indd|idml|afdesign|afphoto|xcf|csv|xlsx|xls|xml)$/i

const ECOMMERCE_PATH_HINT_RE = /(?:^|\/)(?:e-?commerce|pim|dam|sku[-_a-z0-9]*|catalog(?:ue)?s?|packshots?|product[-_]?media|products?|merchandising|brand[-_]?(?:kit|assets?|guidelines?|logos?)|charte|spec[-_]?sheets?|datasheets?|lookbooks?|feeds?|akeneo|pimcore|shopify|magento|woocommerce|prestashop|mirakl|lengow|amazon|marketplace|pdp|plp|hero|published|cdn[-_]?cache|thumbnails?)(?:\/|$)/i

const SKU_CODE_RE = /((?:sku|prod|art|ref|item)[-_]?\d{3,10}|\b\d{12,13}\b)/i

const BRAND_LOGO_PATH_RE = /(?:^|\/)(?:brand[-_]?(?:guidelines?|assets?|vault|book|identity)|charte[-_a-z0-9]*|logos?|official[-_]?logos?|approved[-_]?brand)(?:\/|$)/i
const BRAND_LOGO_NAME_RE = /(?:^|[-_.])(?:brand[-_]?logo|logo[-_]?master|logo[-_]?official|charte|brand[-_]?guide|approved[-_]?logo|wordmark|logotype)(?:[-_.]|$)/i

const HERO_PACKSHOT_PATH_RE = /(?:^|\/)(?:hero|published|live|production|pim[-_]?approved|approved[-_]?packshots?|canonical[-_]?packshots?)(?:\/|$)/i
const HERO_PACKSHOT_NAME_RE = /(?:^|[-_.])(?:hero|main[-_]?packshot|pdp[-_]?hero|01[-_]?hero|primary[-_]?packshot|canonical)(?:[-_.]|$)/i

const CANONICAL_MASTER_PATH_RE = /(?:^|\/)(?:masters?|sources?|source[-_]?files?|raw[-_]?masters?|layered|vectors?|01[-_]?masters?|dam[-_]?masters?|pim[-_]?masters?)(?:\/|$)/i

const DERIVED_PACKSHOT_PATH_RE = /(?:^|\/)(?:thumbs?|thumbnails?|derivatives?|renditions?|resized|recompressed|compressed|web[-_]?exports?|cdn[-_]?cache|image[-_]?cache|media[-_]?cache|2x|3x|marketplace[-_]?exports?|channel[-_]?crops?|amazon|shopify|mirakl|lengow|pdp|plp|staging|tmp|temp)(?:\/|$)/i
const DERIVED_PACKSHOT_NAME_RE = /(?:@(?:2|3)x|[-_.]?(?:thumb|thumbnail|\d{2,4}w|\d{2,4}x\d{2,4}|small|medium|large|xl|xs|web|pdp|plp|cdn|compressed|recompressed|q\d{2}|amazon|shopify|mirakl|lengow|crop|variant|copy\d*)| \(\d+\))(?=\.[^.]+$)/i

const STALE_FEED_PATH_RE = /(?:^|\/)(?:staging|tmp|temp|old[-_]?exports?|archive[-_]?feeds?|export[-_]?history|sync[-_]?cache|channel[-_]?tmp|feeds?[-_]?backup|old)(?:\/|$)/i
const STALE_FEED_NAME_RE = /(?:[-_.](?:old|bak|backup|staging|tmp|copy\d*|export[-_]?\d{6,8}|v\d+)| \(\d+\))(?=\.[^.]+$)/i

const CATALOG_SPEC_NAME_RE = /(?:spec[-_]?sheet|datasheet|catalog(?:ue)?|lookbook|fiche[-_]?produit|brochure|manual|notice|msds|product[-_]?sheet)/i
const PIM_FEED_NAME_RE = /(?:pim|feed|catalog|product|sku|export|inventory|price[-_]?list|stock|akeneo|pimcore|shopify|magento|mirakl|lengow|amazon)/i

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
export function normalizeEcommercePimConfig(raw = {}) {
	const input = raw && typeof raw === 'object' ? raw : {}
	const preset = ECOMMERCE_PIM_PRESETS.find(item => item.id === input.presetId) || null
	const base = preset ? { ...ECOMMERCE_PIM_DEFAULT_CONFIG, ...preset } : { ...ECOMMERCE_PIM_DEFAULT_CONFIG }

	const familyFilter = ECOMMERCE_PIM_FAMILIES.includes(input.familyFilter)
		? input.familyFilter
		: base.familyFilter
	const verdictFilter = ECOMMERCE_PIM_VERDICT_FILTERS.includes(input.verdictFilter)
		? input.verdictFilter
		: base.verdictFilter
	const strategy = ECOMMERCE_PIM_STRATEGIES.includes(input.strategy)
		? input.strategy
		: base.strategy
	const survivorRule = ECOMMERCE_PIM_SURVIVOR_RULES.includes(input.survivorRule)
		? input.survivorRule
		: base.survivorRule
	const sortMode = ECOMMERCE_PIM_SORT_MODES.includes(input.sortMode)
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
		protectSkuMasters: typeof input.protectSkuMasters === 'boolean'
			? input.protectSkuMasters
			: base.protectSkuMasters,
		protectBrandLogos: typeof input.protectBrandLogos === 'boolean'
			? input.protectBrandLogos
			: base.protectBrandLogos,
		protectHeroPackshots: typeof input.protectHeroPackshots === 'boolean'
			? input.protectHeroPackshots
			: base.protectHeroPackshots,
		requireVerifiedMasterForDerivativePrune: typeof input.requireVerifiedMasterForDerivativePrune === 'boolean'
			? input.requireVerifiedMasterForDerivativePrune
			: base.requireVerifiedMasterForDerivativePrune,
		keepRecentFeedDays: normalizeNonNegativeInt(input.keepRecentFeedDays, base.keepRecentFeedDays, 3650),
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
 * Extract an explicit SKU / Product / EAN code from path or filename when present.
 *
 * @param {string} normalizedPath Normalized path.
 * @param {string} basename File basename.
 * @return {string} SKU code or empty string.
 */
export function extractSkuCode(normalizedPath, basename = '') {
	const baseMatch = String(basename || '').match(SKU_CODE_RE)
	if (baseMatch) {
		return baseMatch[1].toUpperCase()
	}
	const pathMatch = String(normalizedPath || '').match(SKU_CODE_RE)
	return pathMatch ? pathMatch[1].toUpperCase() : ''
}

/**
 * Extract a normalized SKU visual stem for correlating resized/recompressed packshots
 * against canonical PSD/AI/EPS/SVG/INDD masters and published hero packshots.
 *
 * @param {string} basename File basename.
 * @return {string} Normalized SKU visual stem.
 */
export function extractEcommerceSkuStem(basename) {
	let stem = String(basename || '').trim().toLowerCase()
	stem = stem.replace(/\.(?:psd|psb|ai|eps|svg|indd|idml|afdesign|afphoto|xcf|png|webp|avif|jpe?g|pdf|csv|xlsx|xls|xml)$/i, '')
	stem = stem.replace(/\s+\(\d+\)$/, '')
	let prev = ''
	while (stem !== prev) {
		prev = stem
		stem = stem.replace(/(?:@(?:2|3)x|[-_.](?:thumb|thumbnail|\d{2,4}w|\d{2,4}x\d{2,4}|small|medium|large|xl|xs|web|pdp|plp|cdn|compressed|recompressed|q\d{2}|amazon|shopify|mirakl|lengow|hero|main|primary|master|approved|official|staging|old|bak|backup|tmp|copy\d*|v\d+))$/i, '')
	}
	return stem || 'unknown-sku-asset'
}

/**
 * Extract a derivative variant tag (e.g. @2x, 1200w, thumb, webp-recompressed) from path/basename.
 *
 * @param {string} lowerBase Lowercase basename.
 * @param {string} lowerPath Lowercase path.
 * @return {string} Variant tag or empty string.
 */
function extractVariantTag(lowerBase, lowerPath) {
	const resMatch = lowerBase.match(/(@(?:2|3)x|\d{2,4}w|\d{2,4}x\d{2,4}|thumb(?:nail)?|compressed|recompressed|q\d{2}|pdp|plp|amazon|shopify|mirakl)/i)
	if (resMatch) {
		return resMatch[1].toLowerCase()
	}
	if (/\.webp$/i.test(lowerBase)) {
		return 'webp-derived'
	}
	if (/\.avif$/i.test(lowerBase)) {
		return 'avif-derived'
	}
	if (DERIVED_PACKSHOT_PATH_RE.test(lowerPath)) {
		return 'resized-cache'
	}
	return ''
}

/**
 * Classify a single duplicate file into the E-Commerce, PIM Product Media & Brand Asset domain.
 *
 * @param {object} file Duplicate file entry.
 * @param {number} [referenceNowMs] Reference epoch ms.
 * @return {object} Classification metadata (family === null if outside domain).
 */
export function classifyEcommercePimFile(file, referenceNowMs = Date.now()) {
	const rawPath = file?.path || file?.name || ''
	const normalized = normalizePathForDiff(rawPath) || String(rawPath || '').replace(/\\/g, '/')
	const lower = normalized.toLowerCase()
	const basename = extractBasename(normalized)
	const lowerBase = basename.toLowerCase()
	const dir = extractDirname(normalized)
	const lowerDir = dir.toLowerCase()

	const isSkuMasterExt = SKU_MASTER_EXT_RE.test(lowerBase)
	const isPackshotRasterExt = PACKSHOT_RASTER_EXT_RE.test(lowerBase)
	const isCatalogPdfExt = CATALOG_PDF_EXT_RE.test(lowerBase)
	const isPimFeedExt = PIM_FEED_EXT_RE.test(lowerBase)
	const isMutableFile = MUTABLE_MASTER_OR_FEED_EXT_RE.test(lowerBase)

	const skuCode = extractSkuCode(normalized, basename)
	const skuStem = extractEcommerceSkuStem(basename)

	const hasEcommercePathHint = ECOMMERCE_PATH_HINT_RE.test(lower) || Boolean(skuCode)
	const isBrandLogoPath = BRAND_LOGO_PATH_RE.test(lower)
	const isBrandLogoName = BRAND_LOGO_NAME_RE.test(lowerBase)
	const isHeroPackshotPath = HERO_PACKSHOT_PATH_RE.test(lower)
	const isHeroPackshotName = HERO_PACKSHOT_NAME_RE.test(lowerBase)
	const isCanonicalMasterPath = CANONICAL_MASTER_PATH_RE.test(lower)
	const isDerivedPackshotPath = DERIVED_PACKSHOT_PATH_RE.test(lower)
	const isDerivedPackshotName = DERIVED_PACKSHOT_NAME_RE.test(lowerBase)
	const isStaleFeedPath = STALE_FEED_PATH_RE.test(lower)
	const isStaleFeedName = STALE_FEED_NAME_RE.test(lowerBase)
	const isCatalogSpecName = CATALOG_SPEC_NAME_RE.test(lowerBase)
	const isPimFeedName = PIM_FEED_NAME_RE.test(lowerBase)

	const isEcommerceMaster = isSkuMasterExt && (hasEcommercePathHint || isBrandLogoPath || isBrandLogoName || isCanonicalMasterPath)
	const isEcommercePackshot = isPackshotRasterExt && (
		hasEcommercePathHint
		|| isHeroPackshotPath
		|| isHeroPackshotName
		|| isDerivedPackshotPath
		|| isDerivedPackshotName
		|| isBrandLogoPath
		|| isBrandLogoName
	)
	const isEcommercePdf = isCatalogPdfExt && (hasEcommercePathHint || isCatalogSpecName || isBrandLogoPath || isBrandLogoName)
	const isEcommerceFeed = isPimFeedExt && (hasEcommercePathHint || isPimFeedName)

	const inDomain = Boolean(isEcommerceMaster || isEcommercePackshot || isEcommercePdf || isEcommerceFeed)

	let family = null
	let artifactKind = 'unknown'

	if (inDomain) {
		if (isEcommerceMaster) {
			family = 'sku-visual-masters'
			if (isBrandLogoPath || isBrandLogoName) {
				artifactKind = 'brand-logo-master'
			} else if (/\.(?:svg|ai|eps)$/i.test(lowerBase)) {
				artifactKind = 'sku-vector-master'
			} else {
				artifactKind = 'sku-layered-master'
			}
		} else if (isEcommerceFeed) {
			family = 'pim-feeds-exports'
			artifactKind = (isStaleFeedPath || isStaleFeedName) ? 'pim-feed-stale-export' : 'pim-feed-canonical'
		} else if (isEcommercePdf) {
			family = 'catalog-spec-sheets'
			if (isBrandLogoPath || isBrandLogoName) {
				artifactKind = 'brand-guideline-pdf'
			} else if (isDerivedPackshotPath || isStaleFeedPath) {
				artifactKind = 'catalog-pdf-copy'
			} else {
				artifactKind = 'product-spec-sheet-pdf'
			}
		} else {
			family = 'derived-packshot-renders'
			if (isBrandLogoPath || isBrandLogoName) {
				artifactKind = 'approved-brand-logo-png'
			} else if (isHeroPackshotPath || isHeroPackshotName) {
				artifactKind = 'published-hero-packshot'
			} else if (/\.(?:webp|avif)$/i.test(lowerBase)) {
				artifactKind = 'recompressed-web-packshot'
			} else if (isDerivedPackshotPath || isDerivedPackshotName) {
				artifactKind = 'resized-packshot-derivative'
			} else {
				artifactKind = 'product-packshot-render'
			}
		}
	}

	const mtimeMs = extractMtimeMs(file)
	const ageDays = mtimeMs !== null && Number.isFinite(referenceNowMs)
		? Math.max(0, Math.floor((referenceNowMs - mtimeMs) / 86400000))
		: null

	const isSkuMaster = family === 'sku-visual-masters'
	const isBrandLogoAsset = isBrandLogoPath || isBrandLogoName
	const isHeroPackshot = family === 'derived-packshot-renders' && (isHeroPackshotPath || isHeroPackshotName) && !isDerivedPackshotPath
	const isDerivedPackshotVariant = family === 'derived-packshot-renders'
		&& !isBrandLogoAsset
		&& !isHeroPackshot
		&& (isDerivedPackshotPath || isDerivedPackshotName || /\.(?:webp|avif)$/i.test(lowerBase))
	const isCatalogSpecPdf = family === 'catalog-spec-sheets'
	const isPimFeedExport = family === 'pim-feeds-exports'
	const isStalePimFeed = isPimFeedExport && (isStaleFeedPath || isStaleFeedName)
	const variantTag = extractVariantTag(lowerBase, lower)

	const assetRole = isBrandLogoAsset
		? 'approved-brand-asset'
		: (isSkuMaster
			? 'sku-source-master'
			: (isHeroPackshot
				? 'published-hero-packshot'
				: (isCatalogSpecPdf
					? 'catalog-spec-sheet'
					: (isPimFeedExport
						? (isStalePimFeed ? 'stale-channel-feed' : 'canonical-pim-feed')
						: (isDerivedPackshotVariant ? 'derived-packshot-variant' : 'product-packshot-copy')))))

	return {
		family,
		artifactKind,
		assetRole,
		normalized,
		lower,
		basename,
		lowerBase,
		dir,
		lowerDir,
		skuCode,
		skuStem,
		variantTag,
		isSkuMaster,
		isBrandLogoAsset,
		isHeroPackshot,
		isDerivedPackshotVariant,
		isCatalogSpecPdf,
		isPimFeedExport,
		isStalePimFeed,
		isMutableFile,
		isCanonicalMasterPath,
		isDerivedPackshotPath,
		isDerivedPackshotName,
		isStaleFeedPath,
		isStaleFeedName,
		size: Number(file?.size) || 0,
		mtimeMs,
		ageDays,
		formattedMtime: formatFileModifiedTime(file),
	}
}

/**
 * Determine whether a duplicate group belongs to the E-Commerce, PIM Product Media & Brand Asset domain.
 *
 * @param {object} group Duplicate group.
 * @return {boolean} True when at least one file matches the domain.
 */
export function isEcommercePimGroup(group) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return false
	}
	return group.files.some(file => classifyEcommercePimFile(file).family !== null)
}

/**
 * Build a cross-vault SKU correlation index linking derived packshots/renders
 * to conserved PSD/AI/EPS/SVG/INDD masters, approved brand logos, and published hero packshots.
 *
 * @param {Array<object>} groups Domain duplicate groups.
 * @return {object} Correlation index.
 */
function buildEcommerceVaultCorrelationIndex(groups) {
	const verifiedMasterStems = new Set()
	const verifiedMasterCodes = new Set()
	const brandLogoStems = new Set()
	const variantCountByStem = new Map()

	for (const group of groups) {
		for (const file of group.files || []) {
			const meta = classifyEcommercePimFile(file)
			if (!meta.family) {
				continue
			}
			if (meta.isSkuMaster || meta.isHeroPackshot || meta.isBrandLogoAsset) {
				verifiedMasterStems.add(meta.skuStem)
				if (meta.skuCode) {
					verifiedMasterCodes.add(meta.skuCode)
				}
			}
			if (meta.isBrandLogoAsset) {
				brandLogoStems.add(meta.skuStem)
			}
			if (meta.isDerivedPackshotVariant) {
				variantCountByStem.set(meta.skuStem, (variantCountByStem.get(meta.skuStem) || 0) + 1)
			}
		}
	}

	return {
		verifiedMasterStems,
		verifiedMasterCodes,
		brandLogoStems,
		variantCountByStem,
	}
}

/**
 * Resolve the primary governance family of a cluster across its classified members.
 *
 * @param {Array<object>} members Classified members.
 * @return {string} Family ID.
 */
function resolveClusterFamily(members) {
	if (members.some(m => m.family === 'sku-visual-masters')) {
		return 'sku-visual-masters'
	}
	if (members.some(m => m.family === 'catalog-spec-sheets')) {
		return 'catalog-spec-sheets'
	}
	if (members.some(m => m.family === 'pim-feeds-exports')) {
		return 'pim-feeds-exports'
	}
	return 'derived-packshot-renders'
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
	const sizeScore = Math.min(50000, Math.round(member.size / 1024))

	if (survivorRule === 'highest-resolution-and-master-first') {
		return (member.isSkuMaster ? 60000 : 0)
			+ (member.isBrandLogoAsset ? 55000 : 0)
			+ (member.isHeroPackshot ? 45000 : 0)
			+ (member.isDerivedPackshotVariant ? -20000 : 0)
			+ sizeScore
			+ shortPathScore
	}

	if (survivorRule === 'newest-pim-publish-first') {
		return (member.isHeroPackshot ? 20000 : 0)
			+ (member.isBrandLogoAsset ? 20000 : 0)
			+ (member.isStalePimFeed || member.isDerivedPackshotPath ? -15000 : 0)
			+ mtimeScore
	}

	if (survivorRule === 'shortest-path') {
		return (member.isDerivedPackshotVariant || member.isStalePimFeed ? -2000 : 0)
			+ shortPathScore
	}

	return (member.isBrandLogoAsset ? 65000 : 0)
		+ (member.isSkuMaster && member.isCanonicalMasterPath ? 60000 : 0)
		+ (member.isSkuMaster ? 50000 : 0)
		+ (member.isHeroPackshot ? 45000 : 0)
		+ (member.isCatalogSpecPdf && !member.isStaleFeedPath ? 30000 : 0)
		+ (member.isPimFeedExport && !member.isStalePimFeed ? 25000 : 0)
		+ (member.isDerivedPackshotVariant ? -25000 : 0)
		+ (member.isStalePimFeed ? -20000 : 0)
		+ shortPathScore
}

/**
 * Audit a single E-Commerce, PIM Product Media & Brand Asset duplicate cluster.
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
		const meta = classifyEcommercePimFile(file, referenceNowMs)
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
	const primarySkuCode = rawMembers.find(m => m.skuCode)?.skuCode || ''
	const primaryStem = rawMembers[0].skuStem || extractEcommerceSkuStem(primaryName)
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

	const hasVerifiedMasterAnchor = Boolean(
		survivor.isSkuMaster
		|| survivor.isHeroPackshot
		|| survivor.isBrandLogoAsset
		|| correlationIndex.verifiedMasterStems.has(primaryStem)
		|| (primarySkuCode && correlationIndex.verifiedMasterCodes.has(primarySkuCode))
	)

	let reclaimableBytes = 0
	let hardlinkSavingsBytes = 0
	let deleteTargetsCount = 0
	let hardlinkTargetsCount = 0
	let shieldedCount = 0

	const members = rawMembers.map((member) => {
		const isSurvivor = member.key === survivorKey
		const override = config.memberOverrides?.[member.key] || 'auto'
		let governanceTier = 'derived-packshot-variant'
		let shielded = false
		let protectedReason = ''
		let action = 'keep'

		if (override === 'keep' && !isSurvivor) {
			governanceTier = member.isBrandLogoAsset
				? 'brand-logo-protected'
				: (member.isSkuMaster
					? 'sku-master-protected'
					: (member.isHeroPackshot ? 'hero-packshot-protected' : 'derived-packshot-variant'))
			shielded = true
			protectedReason = 'Manually shielded via per-copy override'
		} else if (member.isBrandLogoAsset && config.protectBrandLogos) {
			governanceTier = 'brand-logo-protected'
			shielded = true
			protectedReason = 'Approved brand chart / logo strictly conserved'
		} else if (member.isSkuMaster && config.protectSkuMasters) {
			governanceTier = 'sku-master-protected'
			shielded = true
			protectedReason = 'Source SKU visual master (.psd/.ai/.eps/.svg/.indd) strictly conserved'
		} else if (member.isHeroPackshot && config.protectHeroPackshots) {
			governanceTier = 'hero-packshot-protected'
			shielded = true
			protectedReason = 'Published hero packshot strictly conserved'
		} else if (isSurvivor) {
			governanceTier = member.isBrandLogoAsset
				? 'brand-logo-protected'
				: (member.isSkuMaster
					? 'sku-master-protected'
					: (member.isHeroPackshot
						? 'hero-packshot-protected'
						: (member.isPimFeedExport ? 'stale-pim-feed-export' : 'derived-packshot-variant')))
			shielded = true
			protectedReason = member.isPimFeedExport
				? 'Canonical PIM feed / export survivor retained'
				: 'Canonical SKU / catalog survivor retained'
		} else if (override === 'prune') {
			governanceTier = member.isPimFeedExport ? 'stale-pim-feed-export' : 'derived-packshot-variant'
			action = config.strategy === 'hardlink-published-packshots-vault' && !member.isMutableFile
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
		} else if (member.isPimFeedExport) {
			governanceTier = 'stale-pim-feed-export'
			if (
				config.keepRecentFeedDays > 0
				&& member.ageDays !== null
				&& member.ageDays < config.keepRecentFeedDays
			) {
				shielded = true
				protectedReason = `Within ${config.keepRecentFeedDays}-day PIM feed grace window`
			} else if (!member.isStalePimFeed && !survivor.isPimFeedExport) {
				shielded = true
				protectedReason = 'Active PIM feed export conserved'
			} else {
				action = 'delete'
				reclaimableBytes += member.size
				deleteTargetsCount += 1
			}
		} else if (member.isCatalogSpecPdf) {
			governanceTier = 'derived-packshot-variant'
			if (config.strategy === 'hardlink-published-packshots-vault') {
				action = 'hardlink'
				hardlinkSavingsBytes += member.size
				reclaimableBytes += member.size
				hardlinkTargetsCount += 1
			} else {
				action = 'delete'
				reclaimableBytes += member.size
				deleteTargetsCount += 1
			}
		} else if (member.isSkuMaster) {
			governanceTier = 'sku-master-protected'
			action = 'delete'
			reclaimableBytes += member.size
			deleteTargetsCount += 1
		} else {
			governanceTier = 'derived-packshot-variant'
			if (
				config.keepRecentFeedDays > 0
				&& member.ageDays !== null
				&& member.ageDays < config.keepRecentFeedDays
			) {
				shielded = true
				protectedReason = `Within ${config.keepRecentFeedDays}-day packshot grace window`
			} else if (config.strategy === 'hardlink-published-packshots-vault' && !member.isMutableFile) {
				action = 'hardlink'
				hardlinkSavingsBytes += member.size
				reclaimableBytes += member.size
				hardlinkTargetsCount += 1
			} else if (config.requireVerifiedMasterForDerivativePrune && !hasVerifiedMasterAnchor) {
				shielded = true
				governanceTier = 'hero-packshot-protected'
				protectedReason = 'Blocked until a conserved SKU master (.psd/.ai/.svg/.indd) or published hero packshot is verified'
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

	let clusterVerdict = 'derived-packshot-variant'
	if (members.some(m => m.governanceTier === 'brand-logo-protected')) {
		clusterVerdict = 'brand-logo-protected'
	} else if (members.some(m => m.governanceTier === 'sku-master-protected')) {
		clusterVerdict = 'sku-master-protected'
	} else if (members.some(m => m.governanceTier === 'hero-packshot-protected')) {
		clusterVerdict = 'hero-packshot-protected'
	} else if (members.some(m => m.governanceTier === 'stale-pim-feed-export')) {
		clusterVerdict = 'stale-pim-feed-export'
	}

	const hasReclaimable = (deleteTargetsCount + hardlinkTargetsCount) > 0
	const variantTags = Array.from(new Set(members.map(m => m.variantTag).filter(Boolean)))
	const crossGroupVariantsCount = correlationIndex.variantCountByStem.get(primaryStem) || 0

	const riskScore = (clusterVerdict === 'brand-logo-protected' ? 100 : 0)
		+ (clusterVerdict === 'sku-master-protected' ? 95 : 0)
		+ (clusterVerdict === 'hero-packshot-protected' ? 90 : 0)
		+ (clusterVerdict === 'stale-pim-feed-export' ? 75 : 0)
		+ (hasReclaimable ? 20 : 0)

	return {
		id: group.id ?? primaryName,
		hash: group.hash || '',
		name: primaryName,
		skuCode: primarySkuCode,
		skuStem: primaryStem,
		family,
		familyLabel: ECOMMERCE_PIM_FAMILY_META[family]?.label || family,
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
		hasSkuMaster: members.some(m => m.governanceTier === 'sku-master-protected'),
		hasBrandLogo: members.some(m => m.governanceTier === 'brand-logo-protected'),
		hasHeroPackshot: members.some(m => m.governanceTier === 'hero-packshot-protected'),
		hasDerivedVariant: members.some(m => m.isDerivedPackshotVariant) || crossGroupVariantsCount > 0,
		hasStaleFeed: members.some(m => m.governanceTier === 'stale-pim-feed-export'),
		hasVerifiedMasterAnchor,
		crossGroupVariantsCount,
		variantTags,
		members,
		group,
	}
}

/**
 * Audit duplicate groups across E-Commerce, PIM Product Media & Brand Asset Vaults.
 *
 * @param {Array<object>} groups Duplicate groups.
 * @param {object} [rawConfig] Audit configuration overrides.
 * @param {number} [referenceNowMs] Reference epoch ms for deterministic tests.
 * @return {object} Complete audit report with summary, family counts, and filtered clusters.
 */
export function auditEcommercePimVault(groups, rawConfig = {}, referenceNowMs = Date.now()) {
	const config = normalizeEcommercePimConfig(rawConfig)
	const sourceGroups = Array.isArray(groups) ? groups : []
	const domainGroups = sourceGroups.filter(isEcommercePimGroup)
	const correlationIndex = buildEcommerceVaultCorrelationIndex(domainGroups)

	const allClusters = domainGroups
		.map(group => auditSingleCluster(group, correlationIndex, config, referenceNowMs))
		.filter(Boolean)

	const minSizeBytes = config.minSizeMb * 1024 * 1024
	const sizeFiltered = allClusters.filter(cluster => cluster.unitBytes >= minSizeBytes)

	const familyCounts = {
		all: sizeFiltered.length,
		'sku-visual-masters': 0,
		'derived-packshot-renders': 0,
		'catalog-spec-sheets': 0,
		'pim-feeds-exports': 0,
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
			const matchesStem = cluster.skuStem.toLowerCase().includes(query)
			const matchesSku = cluster.skuCode.toLowerCase().includes(query)
			const matchesTag = cluster.variantTags.some(tag => tag.toLowerCase().includes(query))
			const matchesMember = cluster.members.some(m => m.lower.includes(query))
			if (!matchesName && !matchesStem && !matchesSku && !matchesTag && !matchesMember) {
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
	let totalSkuMasterClusters = 0
	let totalBrandLogoClusters = 0
	let totalHeroPackshotClusters = 0
	let totalDerivedVariantClusters = 0
	let totalStaleFeedClusters = 0

	for (const cluster of filteredClusters) {
		rawDuplicateBytes += Math.max(0, cluster.totalBytes - cluster.unitBytes)
		reclaimableBytes += cluster.reclaimableBytes
		totalReclaimableCopiesCount += cluster.reclaimableTargetsCount
		totalShieldedCopiesCount += cluster.shieldedCount

		if (cluster.hasSkuMaster) {
			totalSkuMasterClusters += 1
		}
		if (cluster.hasBrandLogo) {
			totalBrandLogoClusters += 1
		}
		if (cluster.hasHeroPackshot) {
			totalHeroPackshotClusters += 1
		}
		if (cluster.hasDerivedVariant) {
			totalDerivedVariantClusters += 1
		}
		if (cluster.hasStaleFeed) {
			totalStaleFeedClusters += 1
		}
	}

	const efficiencyPct = rawDuplicateBytes > 0
		? Math.min(100, Math.round((reclaimableBytes / rawDuplicateBytes) * 100))
		: 0

	const reclaimableGb = `${(reclaimableBytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`

	const familyBreakdown = ECOMMERCE_PIM_FAMILIES
		.filter(id => id !== 'all')
		.map(id => ({
			id,
			label: ECOMMERCE_PIM_FAMILY_META[id].label,
			shortLabel: ECOMMERCE_PIM_FAMILY_META[id].shortLabel,
			clustersCount: familyCounts[id] || 0,
		}))

	return {
		schema: ECOMMERCE_PIM_VAULT_SCHEMA,
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
			totalSkuMasterClusters,
			totalBrandLogoClusters,
			totalHeroPackshotClusters,
			totalDerivedVariantClusters,
			totalStaleFeedClusters,
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
 * Build a safe POSIX DRY_RUN=1 remediation script for E-Commerce, PIM Product Media & Brand Asset vaults.
 * Strictly blocks deletion or hardlinking of shielded SKU masters, approved brand logos, and hero packshots,
 * and never hardlinks mutable PSD/AI/INDD masters or CSV/XLSX/XML feeds.
 *
 * @param {object} auditResult Result from auditEcommercePimVault.
 * @return {string} POSIX bash script.
 */
export function buildEcommercePimRemediationScript(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# E-Commerce, PIM Product Media & Brand Asset Vault Auditor',
		'# Safe POSIX Remediation Script (default DRY_RUN=1)',
		'# Run with DRY_RUN=0 ./ecommerce-pim-vault-reclaim.sh only after verifying SKU masters, logos, and hero packshots.',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'QUARANTINE_DIR="$' + '{QUARANTINE_DIR:-./.ecommerce-pim-quarantine}"',
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
	const strategy = auditResult?.config?.strategy || 'prune-derived-packshots-and-stale-feeds'
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
			} else if (strategy === 'quarantine-variants-and-exports') {
				lines.push('run_cmd mkdir -p "$QUARANTINE_DIR"')
				lines.push(`run_cmd mv -n ${quotePosixPath(target.normalized)} "$QUARANTINE_DIR/"`)
			} else {
				lines.push(`run_cmd rm -f ${quotePosixPath(target.normalized)}`)
			}
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('printf "No reclaimable derived packshots or stale PIM feed exports under current protection settings.\\n"')
	} else {
		lines.push(`printf "Completed E-Commerce & PIM Vault remediation plan (%d target actions, DRY_RUN=%s).\\n" "${actionCount}" "$DRY_RUN"`)
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe RFC-4180 CSV audit report.
 *
 * @param {object} auditResult Result from auditEcommercePimVault.
 * @return {string} RFC-4180 CSV string.
 */
export function buildEcommercePimCsvReport(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const headers = [
		'cluster_id',
		'cluster_name',
		'sku_code',
		'sku_stem',
		'family',
		'cluster_verdict',
		'member_path',
		'artifact_kind',
		'asset_role',
		'variant_tag',
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
				cluster.skuCode || '',
				cluster.skuStem,
				cluster.family,
				cluster.clusterVerdict,
				member.normalized,
				member.artifactKind,
				member.assetRole,
				member.variantTag || '',
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
 * @param {object} auditResult Result from auditEcommercePimVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildEcommercePimJsonManifest(auditResult) {
	const payload = {
		schema: ECOMMERCE_PIM_VAULT_SCHEMA,
		generatedAt: new Date().toISOString(),
		config: auditResult?.config || ECOMMERCE_PIM_DEFAULT_CONFIG,
		summary: auditResult?.summary || {},
		clusters: (auditResult?.clusters || []).map(cluster => ({
			id: cluster.id,
			name: cluster.name,
			skuCode: cluster.skuCode,
			skuStem: cluster.skuStem,
			family: cluster.family,
			clusterVerdict: cluster.clusterVerdict,
			unitBytes: cluster.unitBytes,
			totalBytes: cluster.totalBytes,
			reclaimableBytes: cluster.reclaimableBytes,
			survivorPath: cluster.survivorPath,
			hasSkuMaster: cluster.hasSkuMaster,
			hasBrandLogo: cluster.hasBrandLogo,
			hasHeroPackshot: cluster.hasHeroPackshot,
			hasDerivedVariant: cluster.hasDerivedVariant,
			hasStaleFeed: cluster.hasStaleFeed,
			hasVerifiedMasterAnchor: cluster.hasVerifiedMasterAnchor,
			crossGroupVariantsCount: cluster.crossGroupVariantsCount,
			variantTags: cluster.variantTags,
			members: (cluster.members || []).map(member => ({
				path: member.normalized,
				artifactKind: member.artifactKind,
				assetRole: member.assetRole,
				variantTag: member.variantTag || '',
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
 * Generate a Nextcloud/rsync .sync-exclude.lst rule set for regenerable E-Commerce/PIM
 * thumbnail pyramids, multi-size @2x/1200w derivatives, CDN caches, and staging feed exports.
 *
 * @return {string} Line-delimited .sync-exclude.lst rules.
 */
export function buildEcommercePimSyncExcludeList() {
	return [
		'# Nextcloud / rsync exclusion rules for E-Commerce & PIM Derived Packshots & Staging Feeds',
		'cdn_cache/',
		'image_cache/',
		'media_cache/',
		'thumbnails/',
		'thumbs/',
		'derivatives/',
		'renditions/',
		'feeds/staging/',
		'exports/tmp/',
		'exports/old/',
		'*@2x.png',
		'*@2x.webp',
		'*@3x.png',
		'*_thumb.jpg',
		'*_thumb.webp',
		'*_1200w.webp',
		'*_recompressed.jpg',
		'*.tmp',
	].join('\n')
}
