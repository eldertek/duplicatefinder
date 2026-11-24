/**
 * Pure Creative Brand Kit, Font Family & Vector/PSD Master Asset Auditor.
 * Detects and audits duplicate creative assets across Nextcloud storage:
 * - Typography & Font Foundries (.otf, .ttf, .ttc, .otc, .pfb, .pfm, .woff2, .woff, .eot)
 * - Vector & Brand Identity Masters (.svg, .ai, .eps, .afdesign, .cdr)
 * - Layered Design & UI Masters (.psd, .psb, .fig, .sketch, .xd, .afphoto, .indd, .idml, .afpub, .xcf, .ase, .aco, .tokens.json)
 * - Motion & Brand Templates (.aep, .aet, .mogrt, .prproj, .c4d, .lottie, .bodymovin.json, .cube, .3dl)
 *
 * Protects licensed foundry fonts, canonical Brand Kit / Design System paths, and
 * InDesign/Illustrator package folders (Document fonts / Links), tracks sibling
 * derived exports (.png/.jpg/.webp/.pdf/.woff2), and emits POSIX DRY_RUN=1
 * consolidation or hardlink scripts, CWE-1236-safe CSV reports, and JSON manifests.
 * Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const BRAND_KIT_SCHEMA = 'duplicatefinder.brand-kit-auditor.v1'

export const BRAND_ASSET_FAMILIES = Object.freeze([
	'all',
	'typography-fonts',
	'vector-identity',
	'layered-design',
	'motion-templates',
])

export const BRAND_FAMILY_META = Object.freeze({
	'typography-fonts': {
		id: 'typography-fonts',
		label: 'Typography & Fonts',
		shortLabel: 'Fonts',
	},
	'vector-identity': {
		id: 'vector-identity',
		label: 'Vector & Brand Identity',
		shortLabel: 'Vectors',
	},
	'layered-design': {
		id: 'layered-design',
		label: 'Layered PSD / UI Masters',
		shortLabel: 'Layered',
	},
	'motion-templates': {
		id: 'motion-templates',
		label: 'Motion & Brand Templates',
		shortLabel: 'Motion',
	},
})

export const BRAND_PRESETS = Object.freeze([
	{
		id: 'all-brand-kits',
		name: 'All Brand Assets',
		description: 'Audit fonts, vector logos, layered PSD/Figma/InDesign masters, and motion templates while guarding canonical Brand Kits.',
		familyFilter: 'all',
		strategy: 'consolidate-purge',
		survivorRule: 'brand-master-first',
		protectFoundryLicenses: true,
		protectBrandCanonical: true,
		protectDerivedLineage: true,
		minSizeMb: 0,
	},
	{
		id: 'foundry-fonts',
		name: 'Foundry & Webfonts',
		description: 'Guard licensed OTF/TTF foundry folders and EULA companions while consolidating project font copies via hardlinks.',
		familyFilter: 'typography-fonts',
		strategy: 'hardlink-preserve',
		survivorRule: 'licensed-foundry-first',
		protectFoundryLicenses: true,
		protectBrandCanonical: true,
		protectDerivedLineage: true,
		minSizeMb: 0,
	},
	{
		id: 'vector-identity',
		name: 'Logo & Vector Masters',
		description: 'Keep canonical .svg/.ai/.eps/.afdesign masters in Brand Guidelines and reclaim redundant campaign exports.',
		familyFilter: 'vector-identity',
		strategy: 'consolidate-purge',
		survivorRule: 'brand-master-first',
		protectFoundryLicenses: true,
		protectBrandCanonical: true,
		protectDerivedLineage: true,
		minSizeMb: 0,
	},
	{
		id: 'layered-masters',
		name: 'PSD / Figma / InDesign',
		description: 'Protect heavy layered design masters and package Links folders while hardlinking or purging duplicate project copies.',
		familyFilter: 'layered-design',
		strategy: 'hardlink-preserve',
		survivorRule: 'brand-master-first',
		protectFoundryLicenses: true,
		protectBrandCanonical: true,
		protectDerivedLineage: true,
		minSizeMb: 0,
	},
])

export const BRAND_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'license-guarded',
	'export-collateral-risk',
	'shielded',
])

export const BRAND_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'lineage_risk_desc',
	'copies_desc',
	'name_asc',
])

export const BRAND_STRATEGIES = Object.freeze([
	'consolidate-purge',
	'hardlink-preserve',
])

export const BRAND_SURVIVOR_RULES = Object.freeze([
	'brand-master-first',
	'licensed-foundry-first',
	'oldest-mtime',
	'newest-mtime',
	'shortest-path',
])

const COMPOUND_BRAND_EXTENSIONS = Object.freeze([
	'tokens.json',
	'bodymovin.json',
	'font.css',
	'specimen.pdf',
])

const BRAND_ASSET_SPECS = Object.freeze([
	{
		id: 'foundry-font-master',
		label: 'Foundry Font Master',
		family: 'typography-fonts',
		tier: 'master',
		tierLabel: 'Foundry Font Master',
		exts: ['otf', 'ttf', 'ttc', 'otc', 'pfb', 'pfm'],
		authorityBonus: 20,
	},
	{
		id: 'webfont-derivative',
		label: 'Webfont Package',
		family: 'typography-fonts',
		tier: 'derivative',
		tierLabel: 'Webfont Derivative',
		exts: ['woff2', 'woff', 'eot'],
		authorityBonus: 10,
	},
	{
		id: 'vector-identity-master',
		label: 'Vector Identity Master',
		family: 'vector-identity',
		tier: 'master',
		tierLabel: 'Vector Identity Master',
		exts: ['ai', 'eps', 'svg', 'afdesign', 'cdr'],
		authorityBonus: 22,
	},
	{
		id: 'layered-design-master',
		label: 'Layered Design Master',
		family: 'layered-design',
		tier: 'master',
		tierLabel: 'Layered Design Master',
		exts: ['psd', 'psb', 'fig', 'sketch', 'xd', 'afphoto', 'indd', 'idml', 'afpub', 'xcf'],
		authorityBonus: 24,
	},
	{
		id: 'brand-swatch-tokens',
		label: 'Brand Swatches & Design Tokens',
		family: 'layered-design',
		tier: 'companion-kit',
		tierLabel: 'Swatches & Tokens',
		exts: ['ase', 'aco', 'asl', 'swatch', 'tokens.json'],
		authorityBonus: 18,
	},
	{
		id: 'motion-brand-template',
		label: 'Motion & LUT Template',
		family: 'motion-templates',
		tier: 'master',
		tierLabel: 'Motion / LUT Template',
		exts: ['aep', 'aet', 'mogrt', 'prproj', 'c4d', 'lottie', 'bodymovin.json', 'cube', '3dl'],
		authorityBonus: 20,
	},
])

const DERIVED_RASTER_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'pdf', 'ico'])
const FONT_EXTS = new Set(['otf', 'ttf', 'ttc', 'otc', 'pfb', 'pfm', 'woff2', 'woff', 'eot'])
const LICENSE_FILE_RE = /^(?:ofl|license|licence|eula|foundry[-_]?license|commercial[-_]?license|readme[-_]?font)(?:\.[a-z0-9]+)?$/i

const CANONICAL_BRAND_PATH_RE = /(?:^|\/)(?:brand|brand[-_]?kit|brand[-_]?assets|guidelines|identity|design[-_]?system|ui[-_]?kit|masters?|canonical|00[-_]?brand|01[-_]?masters?|typography|brand[-_]?fonts)(?:\/|$)/i
const FOUNDRY_PATH_RE = /(?:^|\/)(?:foundry|foundries|monotype|linotype|myfonts|adobe[-_]?fonts|commercial[-_]?fonts|licensed[-_]?fonts|typefaces)(?:\/|$)/i
const PACKAGE_LINK_PATH_RE = /(?:^|\/)(?:document\s+fonts|links)(?:\/|$)/i
const EXPORT_CAMPAIGN_PATH_RE = /(?:^|\/)(?:exports?|renders?|deliverables?|client[-_]?review|campaign|campaigns|social|drafts?|wip|tmp|temp|staging|downloads?|backups?|bak|old|archive|copy|copies|final[-_]?\d*)(?:\/|$)/i
const LICENSED_TOKEN_RE = /(?:eula|licensed|commercial|proprietary|foundry|monotype|linotype|typekit)/i
const EXPORT_STEM_SUFFIX_RE = /(?:@\d+x|[-_](?:export|web|social|thumb|thumbnail|preview|compressed|final|v\d+))$/i

/**
 * Escape a string for safe POSIX single-quoted shell interpolation.
 *
 * @param {string} value Raw text value.
 * @return {string} Single-quoted POSIX shell literal.
 */
function escapePosixSingleQuote(value) {
	return `'${String(value ?? '').replace(/'/g, '\'\\\'\'')}'`
}

/**
 * Extract positive byte size from a duplicate file entry.
 *
 * @param {object} file Duplicate file entry.
 * @return {number} File size in bytes.
 */
function getFileSize(file) {
	const raw = Number(file && (file.size ?? file.fileSize ?? 0))
	return Number.isFinite(raw) && raw > 0 ? raw : 0
}

/**
 * Extract normalized modification timestamp in Unix seconds.
 *
 * @param {object} file Duplicate file entry.
 * @return {number} Timestamp in Unix seconds or 0 when absent.
 */
function getFileMtimeSeconds(file) {
	const raw = Number(file && (file.mtime ?? file.modifiedTime ?? file.lastModified ?? 0))
	if (!Number.isFinite(raw) || raw <= 0) {
		return 0
	}
	return raw > 1e12 ? Math.floor(raw / 1000) : Math.floor(raw)
}

/**
 * Split a normalized path into parent directory path and basename.
 *
 * @param {string} normalizedPath Normalized file path.
 * @return {{ dirPath: string, fileName: string }} Directory and filename pair.
 */
function splitDirAndName(normalizedPath) {
	const clean = String(normalizedPath || '').replace(/\/+$/, '')
	const slashIdx = clean.lastIndexOf('/')
	if (slashIdx === -1) {
		return { dirPath: '/', fileName: clean }
	}
	return {
		dirPath: clean.slice(0, slashIdx) || '/',
		fileName: clean.slice(slashIdx + 1),
	}
}

/**
 * Extract compound or single lowercase extension for creative brand assets.
 *
 * @param {string} filePath Raw or normalized file path.
 * @return {string} Lowercase extension without leading dot.
 */
export function extractBrandAssetExtension(filePath) {
	const normalized = normalizePathForDiff(filePath)
	const { fileName } = splitDirAndName(normalized)
	const lower = fileName.toLowerCase()
	if (!lower) {
		return ''
	}

	for (const compound of COMPOUND_BRAND_EXTENSIONS) {
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
 * Normalize an asset stem by stripping common export/density suffixes.
 *
 * @param {string} filePath Raw or normalized file path.
 * @return {object} Parsed asset descriptor.
 */
export function parseBrandAssetDescriptor(filePath) {
	const normalizedPath = normalizePathForDiff(filePath)
	const { dirPath, fileName } = splitDirAndName(normalizedPath)
	const ext = extractBrandAssetExtension(normalizedPath)
	const lowerName = fileName.toLowerCase()
	let stem = fileName
	if (ext && lowerName.endsWith(`.${ext}`)) {
		stem = fileName.slice(0, fileName.length - ext.length - 1)
	}
	const lowerStem = stem.toLowerCase()
	const normalizedStem = lowerStem.replace(EXPORT_STEM_SUFFIX_RE, '') || lowerStem

	return {
		normalizedPath,
		dirPath,
		fileName,
		lowerFileName: lowerName,
		ext,
		stem,
		lowerStem,
		normalizedStem,
	}
}

/**
 * Resolve matching creative brand asset specification for an extension.
 *
 * @param {string} ext Lowercase extension.
 * @param {string} lowerFileName Lowercase filename.
 * @return {object|null} Matching asset specification or null.
 */
export function findBrandAssetSpec(ext, lowerFileName = '') {
	if (!ext) {
		return null
	}
	if (lowerFileName === 'design-tokens.json' || ext === 'tokens.json') {
		return BRAND_ASSET_SPECS.find(spec => spec.id === 'brand-swatch-tokens') || null
	}
	for (const spec of BRAND_ASSET_SPECS) {
		if (spec.exts.includes(ext)) {
			return spec
		}
	}
	return null
}

/**
 * Build a directory-level index of sibling derived exports, font format variants, and license files.
 *
 * @param {Array<object>} duplicates Duplicate group entities.
 * @param {Array<object|string>} [companionInventory] Supplementary sibling inventory entries.
 * @return {Map<string, object>} Map of directory path to sibling metadata.
 */
function buildDirectoryContextIndex(duplicates, companionInventory = []) {
	const dirs = new Map()

	/**
	 * Ensure directory context entry exists.
	 *
	 * @param {string} dirPath Directory path.
	 * @return {object} Directory context state.
	 */
	function ensureDir(dirPath) {
		let state = dirs.get(dirPath)
		if (!state) {
			state = {
				dirPath,
				licenseFiles: [],
				byStem: new Map(),
				seenPaths: new Set(),
			}
			dirs.set(dirPath, state)
		}
		return state
	}

	/**
	 * Record a file path entry into the directory context index.
	 *
	 * @param {object|string} entry File object or path string.
	 * @return {void}
	 */
	function recordEntry(entry) {
		const rawPath = typeof entry === 'string'
			? entry
			: (entry && (entry.path || entry.filePath))
		if (!rawPath || typeof rawPath !== 'string') {
			return
		}
		const desc = parseBrandAssetDescriptor(rawPath)
		if (!desc.normalizedPath || !desc.fileName) {
			return
		}
		const state = ensureDir(desc.dirPath)
		if (state.seenPaths.has(desc.normalizedPath)) {
			return
		}
		state.seenPaths.add(desc.normalizedPath)

		const size = typeof entry === 'object' ? getFileSize(entry) : 0

		if (LICENSE_FILE_RE.test(desc.fileName)) {
			state.licenseFiles.push({
				fileName: desc.fileName,
				normalizedPath: desc.normalizedPath,
				size,
			})
		}

		if (!desc.ext) {
			return
		}

		let stemEntry = state.byStem.get(desc.normalizedStem)
		if (!stemEntry) {
			stemEntry = {
				derivedExports: [],
				fontSiblings: [],
			}
			state.byStem.set(desc.normalizedStem, stemEntry)
		}

		if (DERIVED_RASTER_EXTS.has(desc.ext)) {
			stemEntry.derivedExports.push({
				fileName: desc.fileName,
				normalizedPath: desc.normalizedPath,
				ext: desc.ext,
				size,
			})
		} else if (FONT_EXTS.has(desc.ext)) {
			stemEntry.fontSiblings.push({
				fileName: desc.fileName,
				normalizedPath: desc.normalizedPath,
				ext: desc.ext,
				size,
			})
		}
	}

	if (Array.isArray(duplicates)) {
		for (const group of duplicates) {
			const files = Array.isArray(group && group.files) ? group.files : []
			for (const file of files) {
				recordEntry(file)
			}
		}
	}

	if (Array.isArray(companionInventory)) {
		for (const item of companionInventory) {
			recordEntry(item)
		}
	}

	return dirs
}

/**
 * Evaluate creative lineage, foundry license indicators, and sibling exports for a member file.
 *
 * @param {object} file Duplicate file entry.
 * @param {object} descriptor Parsed descriptor.
 * @param {object} spec Matched brand asset spec.
 * @param {Map<string, object>} dirIndex Directory context index.
 * @return {object} Evaluated member context.
 */
function evaluateMemberContext(file, descriptor, spec, dirIndex) {
	const dirState = dirIndex.get(descriptor.dirPath)
	const parentDirPath = splitDirAndName(descriptor.dirPath).dirPath
	const parentState = parentDirPath && parentDirPath !== descriptor.dirPath
		? dirIndex.get(parentDirPath)
		: null

	const licenseFiles = [
		...(dirState ? dirState.licenseFiles : []),
		...(parentState ? parentState.licenseFiles : []),
	]
	const hasFoundryLicenseFile = licenseFiles.length > 0

	const stemEntry = dirState && dirState.byStem.get(descriptor.normalizedStem)
	const derivedExports = stemEntry
		? stemEntry.derivedExports.filter(item => item.normalizedPath !== descriptor.normalizedPath)
		: []
	const fontSiblings = stemEntry
		? stemEntry.fontSiblings.filter(item => item.normalizedPath !== descriptor.normalizedPath)
		: []

	const isCanonicalBrandPath = CANONICAL_BRAND_PATH_RE.test(descriptor.normalizedPath)
	const isFoundryPath = FOUNDRY_PATH_RE.test(descriptor.normalizedPath)
	const isPackageFolder = PACKAGE_LINK_PATH_RE.test(descriptor.normalizedPath)
	const isExportOrCampaignPath = EXPORT_CAMPAIGN_PATH_RE.test(descriptor.normalizedPath)
	const hasLicensePathHint = LICENSED_TOKEN_RE.test(descriptor.normalizedPath)
	const isLicensedFont = spec.family === 'typography-fonts'
		&& (hasFoundryLicenseFile || isFoundryPath || hasLicensePathHint)

	const derivedExportBytes = derivedExports.reduce((sum, item) => sum + item.size, 0)

	let authorityScore = 40 + (spec.authorityBonus || 0)
	if (isCanonicalBrandPath) {
		authorityScore += 30
	}
	if (isFoundryPath || hasFoundryLicenseFile) {
		authorityScore += 18
	}
	if (isPackageFolder) {
		authorityScore -= 12
	}
	if (isExportOrCampaignPath) {
		authorityScore -= 28
	}
	authorityScore = Math.max(0, Math.min(100, authorityScore))

	const pathDepth = descriptor.normalizedPath.split('/').filter(Boolean).length

	return {
		isCanonicalBrandPath,
		isFoundryPath,
		isPackageFolder,
		isExportOrCampaignPath,
		hasFoundryLicenseFile,
		isLicensedFont,
		licenseFiles,
		derivedExports,
		derivedExportCount: derivedExports.length,
		derivedExportBytes,
		formattedDerivedExportBytes: formatBytes(derivedExportBytes),
		fontSiblings,
		fontSiblingCount: fontSiblings.length,
		authorityScore,
		pathDepth,
		hasCompanionEvidence: derivedExports.length > 0 || fontSiblings.length > 0 || licenseFiles.length > 0,
	}
}

/**
 * Compare two asset members according to the active survivor anchor rule.
 *
 * @param {object} a First candidate member.
 * @param {object} b Second candidate member.
 * @param {string} survivorRule Active survivor rule identifier.
 * @return {number} Negative if a should survive over b.
 */
function compareSurvivorCandidates(a, b, survivorRule) {
	if (a.pinnedKeeper !== b.pinnedKeeper) {
		return a.pinnedKeeper ? -1 : 1
	}

	if (survivorRule === 'licensed-foundry-first') {
		if (a.context.isLicensedFont !== b.context.isLicensedFont) {
			return a.context.isLicensedFont ? -1 : 1
		}
		if (a.context.hasFoundryLicenseFile !== b.context.hasFoundryLicenseFile) {
			return a.context.hasFoundryLicenseFile ? -1 : 1
		}
	}

	if (survivorRule === 'brand-master-first' || survivorRule === 'licensed-foundry-first') {
		if (a.context.isCanonicalBrandPath !== b.context.isCanonicalBrandPath) {
			return a.context.isCanonicalBrandPath ? -1 : 1
		}
		if (a.context.isExportOrCampaignPath !== b.context.isExportOrCampaignPath) {
			return a.context.isExportOrCampaignPath ? 1 : -1
		}
		if (a.context.authorityScore !== b.context.authorityScore) {
			return b.context.authorityScore - a.context.authorityScore
		}
	}

	if (survivorRule === 'oldest-mtime') {
		if (a.mtimeSec !== b.mtimeSec) {
			if (a.mtimeSec === 0) {
				return 1
			}
			if (b.mtimeSec === 0) {
				return -1
			}
			return a.mtimeSec - b.mtimeSec
		}
	} else if (survivorRule === 'newest-mtime') {
		if (a.mtimeSec !== b.mtimeSec) {
			return b.mtimeSec - a.mtimeSec
		}
	}

	if (a.normalizedPath.length !== b.normalizedPath.length) {
		return a.normalizedPath.length - b.normalizedPath.length
	}
	if (a.context.pathDepth !== b.context.pathDepth) {
		return a.context.pathDepth - b.context.pathDepth
	}
	return a.normalizedPath.localeCompare(b.normalizedPath)
}

/**
 * Determine member verdict and human-readable rationale.
 *
 * @param {object} member Member candidate.
 * @param {boolean} isSurvivor Whether this member is the canonical survivor.
 * @param {string} groupOverride Group-level override ('auto'|'shield'|'exclude').
 * @param {object} options Audit safety flags and strategy.
 * @return {{ verdict: string, verdictLabel: string, verdictReason: string, actionKind: string }} Verdict metadata.
 */
function resolveMemberVerdict(member, isSurvivor, groupOverride, options) {
	if (groupOverride === 'exclude') {
		return {
			verdict: 'excluded',
			verdictLabel: 'Excluded',
			verdictReason: 'Asset kit manually excluded from this brand audit run.',
			actionKind: 'none',
		}
	}

	if (groupOverride === 'shield') {
		return {
			verdict: 'blocked-manual-shield',
			verdictLabel: 'Kit Shielded',
			verdictReason: 'Entire brand asset kit is manually shielded against consolidation.',
			actionKind: 'none',
		}
	}

	if (isSurvivor) {
		return {
			verdict: 'keep-canonical-master',
			verdictLabel: 'Canonical Master',
			verdictReason: member.context.isCanonicalBrandPath
				? 'Preserved as canonical Brand Kit / Design System survivor anchor.'
				: (member.context.isLicensedFont
					? 'Preserved as authoritative licensed foundry font survivor.'
					: 'Selected as authoritative creative master survivor.'),
			actionKind: 'keep',
		}
	}

	if (member.copyOverride === 'shield') {
		return {
			verdict: 'blocked-manual-shield',
			verdictLabel: 'Copy Shielded',
			verdictReason: 'Copy manually shielded by operator override.',
			actionKind: 'none',
		}
	}

	if (member.copyOverride === 'force-reclaim') {
		if (options.strategy === 'hardlink-preserve') {
			return {
				verdict: 'hardlink-master-candidate',
				verdictLabel: 'Hardlink Copy',
				verdictReason: 'Operator forced hardlink consolidation onto the canonical master.',
				actionKind: 'hardlink',
			}
		}
		return {
			verdict: 'reclaim-duplicate-copy',
			verdictLabel: 'Reclaim Copy',
			verdictReason: 'Operator forced reclaim of this redundant project copy.',
			actionKind: 'reclaim',
		}
	}

	if (options.protectFoundryLicenses && member.context.isLicensedFont && options.strategy !== 'hardlink-preserve') {
		return {
			verdict: 'blocked-foundry-license',
			verdictLabel: 'Foundry License Guard',
			verdictReason: 'Commercial/foundry font copy guarded from deletion; switch to Hardlink/Reflink to deduplicate without removing local font files.',
			actionKind: 'none',
		}
	}

	if (options.protectBrandCanonical && member.context.isCanonicalBrandPath && options.strategy !== 'hardlink-preserve') {
		return {
			verdict: 'blocked-brand-canonical',
			verdictLabel: 'Canonical Brand Guard',
			verdictReason: 'Copy resides inside a canonical Brand/Design-System folder; guarded against purge.',
			actionKind: 'none',
		}
	}

	if (options.protectDerivedLineage && (member.context.isPackageFolder || member.context.derivedExportCount > 0) && options.strategy !== 'hardlink-preserve') {
		return {
			verdict: 'blocked-lineage-anchor',
			verdictLabel: 'Lineage / Package Guard',
			verdictReason: member.context.isPackageFolder
				? 'Copy lives inside an InDesign/Illustrator Document fonts or Links package folder; use Hardlink mode to save space safely.'
				: 'Copy sits beside derived exports (.png/.jpg/.pdf); guarded from deletion unless consolidated via Hardlink.',
			actionKind: 'none',
		}
	}

	if (options.strategy === 'hardlink-preserve') {
		return {
			verdict: 'hardlink-master-candidate',
			verdictLabel: 'Hardlink Copy',
			verdictReason: 'Replace redundant copy with a POSIX hardlink to the canonical master so project links and fonts stay intact.',
			actionKind: 'hardlink',
		}
	}

	return {
		verdict: 'reclaim-duplicate-copy',
		verdictLabel: 'Reclaim Copy',
		verdictReason: member.context.isExportOrCampaignPath
			? 'Redundant campaign/export copy safe to reclaim while keeping canonical Brand Kit master.'
			: 'Redundant duplicate project copy safe to consolidate into canonical master.',
		actionKind: 'reclaim',
	}
}

/**
 * Resolve normalized audit options from caller configuration.
 *
 * @param {object} [rawOptions] Caller options.
 * @return {object} Normalized audit options.
 */
function normalizeAuditOptions(rawOptions = {}) {
	const familyFilter = BRAND_ASSET_FAMILIES.includes(rawOptions.familyFilter)
		? rawOptions.familyFilter
		: 'all'
	const verdictFilter = BRAND_VERDICT_FILTERS.includes(rawOptions.verdictFilter)
		? rawOptions.verdictFilter
		: 'all'
	const sortMode = BRAND_SORT_MODES.includes(rawOptions.sortMode)
		? rawOptions.sortMode
		: 'reclaim_desc'
	const strategy = BRAND_STRATEGIES.includes(rawOptions.strategy)
		? rawOptions.strategy
		: 'consolidate-purge'
	const survivorRule = BRAND_SURVIVOR_RULES.includes(rawOptions.survivorRule)
		? rawOptions.survivorRule
		: 'brand-master-first'
	const parsedMinMb = Number(rawOptions.minSizeMb)
	const minSizeBytes = Number.isFinite(parsedMinMb) && parsedMinMb > 0
		? parsedMinMb * 1024 * 1024
		: 0

	return {
		familyFilter,
		verdictFilter,
		sortMode,
		strategy,
		survivorRule,
		protectFoundryLicenses: rawOptions.protectFoundryLicenses !== false,
		protectBrandCanonical: rawOptions.protectBrandCanonical !== false,
		protectDerivedLineage: rawOptions.protectDerivedLineage !== false,
		minSizeBytes,
		searchQuery: String(rawOptions.searchQuery || '').trim().toLowerCase(),
		groupOverrides: rawOptions.groupOverrides && typeof rawOptions.groupOverrides === 'object'
			? rawOptions.groupOverrides
			: {},
		copyOverrides: rawOptions.copyOverrides && typeof rawOptions.copyOverrides === 'object'
			? rawOptions.copyOverrides
			: {},
		companionInventory: Array.isArray(rawOptions.companionInventory)
			? rawOptions.companionInventory
			: [],
	}
}

/**
 * Audit creative brand kits, font families, and vector/PSD master duplicate groups.
 *
 * @param {Array<object>} duplicates Duplicate group entities from DuplicateFinder store/API.
 * @param {object} [rawOptions] Filtering, safety guard, and sorting options.
 * @return {object} Structured audit result with kits, summary, and options.
 */
export function analyzeBrandKitAssets(duplicates, rawOptions = {}) {
	const options = normalizeAuditOptions(rawOptions)
	const sourceGroups = Array.isArray(duplicates) ? duplicates : []
	const dirIndex = buildDirectoryContextIndex(sourceGroups, options.companionInventory)

	const preFilterKits = []
	const familyCounts = {
		'typography-fonts': 0,
		'vector-identity': 0,
		'layered-design': 0,
		'motion-templates': 0,
	}

	for (const group of sourceGroups) {
		if (!group || !Array.isArray(group.files) || group.files.length < 2) {
			continue
		}

		const firstValidFile = group.files.find(f => f && typeof f.path === 'string' && f.path.trim() !== '')
		if (!firstValidFile) {
			continue
		}

		const primaryDesc = parseBrandAssetDescriptor(firstValidFile.path)
		const spec = findBrandAssetSpec(primaryDesc.ext, primaryDesc.lowerFileName)
		if (!spec) {
			continue
		}

		const groupInfo = computeGroupReclaimableInfo(group)
		const unitSize = groupInfo.unitSize || getFileSize(firstValidFile)
		const totalBytes = unitSize * group.files.length
		const rawReclaimableBytes = groupInfo.reclaimableBytes || Math.max(0, totalBytes - unitSize)
		if (totalBytes < options.minSizeBytes) {
			continue
		}

		const groupKey = group.id !== undefined && group.id !== null
			? `kit:${group.id}`
			: `kit:${group.hash || primaryDesc.normalizedPath}`
		const groupOverride = options.groupOverrides[groupKey] || 'auto'

		const candidates = group.files
			.filter(f => f && typeof f.path === 'string' && f.path.trim() !== '')
			.map((file, idx) => {
				const descriptor = parseBrandAssetDescriptor(file.path)
				const selectionKey = getFileSelectionKey(file) || `${groupKey}#${idx}`
				const copyOverride = options.copyOverrides[selectionKey] || 'auto'
				const size = getFileSize(file) || unitSize
				const mtimeSec = getFileMtimeSeconds(file)
				const context = evaluateMemberContext(file, descriptor, spec, dirIndex)

				return {
					id: file.id ?? null,
					nodeId: file.nodeId ?? file.id ?? null,
					selectionKey,
					rawPath: file.path,
					normalizedPath: descriptor.normalizedPath,
					dirPath: descriptor.dirPath,
					fileName: descriptor.fileName,
					stem: descriptor.stem,
					ext: descriptor.ext,
					size,
					formattedSize: formatBytes(size),
					mtimeSec,
					formattedMtime: formatFileModifiedTime(file),
					copyOverride,
					pinnedKeeper: copyOverride === 'pin-keeper',
					context,
				}
			})

		if (candidates.length < 2) {
			continue
		}

		candidates.sort((a, b) => compareSurvivorCandidates(a, b, options.survivorRule))

		let reclaimableBytes = 0
		let reclaimableCopiesCount = 0
		let shieldedCopiesCount = 0
		let guardedLicenseCopiesCount = 0
		let lineageRiskCopiesCount = 0
		let derivedExportBytesTotal = 0
		let derivedExportCountTotal = 0

		const members = candidates.map((candidate, index) => {
			const isSurvivor = index === 0
			const verdictMeta = resolveMemberVerdict(candidate, isSurvivor, groupOverride, options)
			derivedExportBytesTotal += candidate.context.derivedExportBytes
			derivedExportCountTotal += candidate.context.derivedExportCount

			if (!isSurvivor) {
				if (verdictMeta.actionKind === 'reclaim' || verdictMeta.actionKind === 'hardlink') {
					reclaimableBytes += candidate.size
					reclaimableCopiesCount += 1
				} else {
					shieldedCopiesCount += 1
				}
				if (verdictMeta.verdict === 'blocked-foundry-license') {
					guardedLicenseCopiesCount += 1
				}
				if (verdictMeta.verdict === 'blocked-lineage-anchor') {
					lineageRiskCopiesCount += 1
				}
			}

			return {
				...candidate,
				role: isSurvivor ? 'survivor' : 'copy',
				verdict: verdictMeta.verdict,
				verdictLabel: verdictMeta.verdictLabel,
				verdictReason: verdictMeta.verdictReason,
				actionKind: verdictMeta.actionKind,
			}
		})

		let kitRiskState = 'reclaimable'
		if (groupOverride === 'exclude' || groupOverride === 'shield' || (reclaimableCopiesCount === 0 && shieldedCopiesCount > 0 && guardedLicenseCopiesCount === 0 && lineageRiskCopiesCount === 0)) {
			kitRiskState = 'shielded'
		} else if (guardedLicenseCopiesCount > 0) {
			kitRiskState = 'license-guarded'
		} else if (lineageRiskCopiesCount > 0 || derivedExportCountTotal > 0) {
			kitRiskState = 'export-collateral-risk'
		}

		const familyMeta = BRAND_FAMILY_META[spec.family]
		const kit = {
			groupKey,
			primaryGroupId: group.id ?? null,
			hash: group.hash || '',
			displayName: primaryDesc.stem || primaryDesc.fileName,
			fileName: primaryDesc.fileName,
			extension: primaryDesc.ext,
			specId: spec.id,
			specLabel: spec.label,
			tier: spec.tier,
			tierLabel: spec.tierLabel,
			family: spec.family,
			familyLabel: familyMeta ? familyMeta.label : spec.family,
			familyShortLabel: familyMeta ? familyMeta.shortLabel : spec.family,
			copyCount: members.length,
			totalBytes,
			formattedTotalBytes: formatBytes(totalBytes),
			rawReclaimableBytes,
			formattedRawReclaimableBytes: formatBytes(rawReclaimableBytes),
			reclaimableBytes,
			formattedReclaimableBytes: formatBytes(reclaimableBytes),
			reclaimableCopiesCount,
			shieldedCopiesCount,
			guardedLicenseCopiesCount,
			lineageRiskCopiesCount,
			derivedExportCountTotal,
			derivedExportBytesTotal,
			formattedDerivedExportBytesTotal: formatBytes(derivedExportBytesTotal),
			hasFoundryLicense: members.some(m => m.context.isLicensedFont || m.context.hasFoundryLicenseFile),
			hasCanonicalBrandAnchor: members.some(m => m.context.isCanonicalBrandPath),
			kitRiskState,
			groupOverride,
			survivor: members[0],
			members,
		}

		if (options.searchQuery) {
			const haystack = [
				kit.displayName,
				kit.extension,
				kit.specLabel,
				kit.familyLabel,
				...kit.members.map(m => m.normalizedPath),
				...kit.members.flatMap(m => m.context.derivedExports.map(e => e.fileName)),
				...kit.members.flatMap(m => m.context.licenseFiles.map(l => l.fileName)),
			].join(' ').toLowerCase()
			if (!haystack.includes(options.searchQuery)) {
				continue
			}
		}

		familyCounts[spec.family] = (familyCounts[spec.family] || 0) + 1
		preFilterKits.push(kit)
	}

	const kits = preFilterKits.filter((kit) => {
		if (options.familyFilter !== 'all' && kit.family !== options.familyFilter) {
			return false
		}
		if (options.verdictFilter !== 'all') {
			if (options.verdictFilter === 'reclaimable' && kit.reclaimableCopiesCount === 0) {
				return false
			}
			if (options.verdictFilter === 'license-guarded' && kit.guardedLicenseCopiesCount === 0 && !kit.hasFoundryLicense) {
				return false
			}
			if (options.verdictFilter === 'export-collateral-risk' && kit.lineageRiskCopiesCount === 0 && kit.derivedExportCountTotal === 0) {
				return false
			}
			if (options.verdictFilter === 'shielded' && kit.shieldedCopiesCount === 0 && kit.kitRiskState !== 'shielded') {
				return false
			}
		}
		return true
	})

	kits.sort((a, b) => {
		if (options.sortMode === 'lineage_risk_desc') {
			const riskA = a.guardedLicenseCopiesCount * 3 + a.lineageRiskCopiesCount * 2 + a.derivedExportCountTotal
			const riskB = b.guardedLicenseCopiesCount * 3 + b.lineageRiskCopiesCount * 2 + b.derivedExportCountTotal
			if (riskA !== riskB) {
				return riskB - riskA
			}
		} else if (options.sortMode === 'copies_desc') {
			if (a.copyCount !== b.copyCount) {
				return b.copyCount - a.copyCount
			}
		} else if (options.sortMode === 'name_asc') {
			return a.displayName.localeCompare(b.displayName)
		}

		if (a.reclaimableBytes !== b.reclaimableBytes) {
			return b.reclaimableBytes - a.reclaimableBytes
		}
		return a.displayName.localeCompare(b.displayName)
	})

	const totalRawDuplicateBytes = kits.reduce((sum, kit) => sum + kit.rawReclaimableBytes, 0)
	const totalReclaimableBytes = kits.reduce((sum, kit) => sum + kit.reclaimableBytes, 0)
	const totalReclaimableCopiesCount = kits.reduce((sum, kit) => sum + kit.reclaimableCopiesCount, 0)
	const totalShieldedCopiesCount = kits.reduce((sum, kit) => sum + kit.shieldedCopiesCount, 0)
	const totalLicensedFontKitsCount = kits.filter(kit => kit.hasFoundryLicense).length
	const totalDerivedExportsTracked = kits.reduce((sum, kit) => sum + kit.derivedExportCountTotal, 0)
	const totalDerivedExportBytes = kits.reduce((sum, kit) => sum + kit.derivedExportBytesTotal, 0)
	const efficiencyPct = totalRawDuplicateBytes > 0
		? Math.round((totalReclaimableBytes / totalRawDuplicateBytes) * 100)
		: 0

	return {
		schema: BRAND_KIT_SCHEMA,
		options: {
			familyFilter: options.familyFilter,
			verdictFilter: options.verdictFilter,
			sortMode: options.sortMode,
			strategy: options.strategy,
			survivorRule: options.survivorRule,
			protectFoundryLicenses: options.protectFoundryLicenses,
			protectBrandCanonical: options.protectBrandCanonical,
			protectDerivedLineage: options.protectDerivedLineage,
		},
		summary: {
			totalKitsCount: kits.length,
			totalRawDuplicateBytes,
			formattedRawDuplicateBytes: formatBytes(totalRawDuplicateBytes),
			totalReclaimableBytes,
			formattedReclaimableBytes: formatBytes(totalReclaimableBytes),
			totalReclaimableCopiesCount,
			totalShieldedCopiesCount,
			totalLicensedFontKitsCount,
			totalDerivedExportsTracked,
			totalDerivedExportBytes,
			formattedDerivedExportBytes: formatBytes(totalDerivedExportBytes),
			efficiencyPct,
			familyCounts,
		},
		kits,
	}
}

/**
 * Extract Nextcloud user root hints from normalized paths for occ files:scan suggestions.
 *
 * @param {Array<string>} paths Normalized file paths.
 * @return {Array<string>} Unique relative scan paths.
 */
function extractOccScanPaths(paths) {
	const roots = new Set()
	for (const p of paths) {
		const clean = String(p || '').replace(/^\/+/, '')
		if (!clean) {
			continue
		}
		const parts = clean.split('/')
		if (parts.length >= 2 && parts[1] === 'files') {
			roots.add(`/${parts[0]}/files/${parts[2] || ''}`.replace(/\/+$/, ''))
		} else {
			roots.add(`/${parts[0]}`)
		}
	}
	return Array.from(roots).sort()
}

/**
 * Build a POSIX DRY_RUN=1 remediation script for brand kit consolidation or hardlinking.
 *
 * @param {object} analysis Output from analyzeBrandKitAssets.
 * @param {object} [options] Script generation options.
 * @param {string} [options.dataRoot='/var/www/nextcloud/data'] Nextcloud data root directory.
 * @return {string} POSIX bash script with single-quoted paths and DRY_RUN=1 safety.
 */
export function buildBrandKitScript(analysis, options = {}) {
	const dataRoot = String(options.dataRoot || '/var/www/nextcloud/data').replace(/\/+$/, '') || '/var/www/nextcloud/data'
	const kits = analysis && Array.isArray(analysis.kits) ? analysis.kits : []
	const strategy = (analysis && analysis.options && analysis.options.strategy) || 'consolidate-purge'

	const operations = []
	const affectedPaths = []

	for (const kit of kits) {
		const survivorPath = kit && kit.survivor ? kit.survivor.normalizedPath : ''
		if (!survivorPath) {
			continue
		}
		for (const member of kit.members || []) {
			if (member.actionKind !== 'reclaim' && member.actionKind !== 'hardlink') {
				continue
			}
			operations.push({
				kitName: `${kit.displayName}.${kit.extension}`,
				actionKind: member.actionKind,
				survivorPath,
				targetPath: member.normalizedPath,
				size: member.size,
			})
			affectedPaths.push(member.normalizedPath)
		}
	}

	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# Creative Brand Kit, Font Family & Vector/PSD Master Asset Auditor',
		`# Strategy: ${strategy} | Safe default: DRY_RUN=1 (preview only)`,
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		`DATA_ROOT=${escapePosixSingleQuote(dataRoot)}`,
		'',
		'resolve_path() {',
		'  local rel="$1"',
		'  printf \'%s/%s\' "$DATA_ROOT" "$' + '{rel#/}"',
		'}',
		'',
	]

	if (operations.length === 0) {
		lines.push('echo "No reclaimable or hardlinkable brand kit targets under current filters/shields."')
		return lines.join('\n')
	}

	lines.push('reclaim_copy() {')
	lines.push('  local rel="$1"')
	lines.push('  local full')
	lines.push('  full="$(resolve_path "$rel")"')
	lines.push('  if [ "$DRY_RUN" = "1" ]; then')
	lines.push('    printf \'[DRY_RUN] rm -f -- %s\\n\' "$full"')
	lines.push('  else')
	lines.push('    rm -f -- "$full"')
	lines.push('  fi')
	lines.push('}')
	lines.push('')
	lines.push('hardlink_copy() {')
	lines.push('  local survivor_rel="$1"')
	lines.push('  local target_rel="$2"')
	lines.push('  local survivor_full target_full')
	lines.push('  survivor_full="$(resolve_path "$survivor_rel")"')
	lines.push('  target_full="$(resolve_path "$target_rel")"')
	lines.push('  if [ "$DRY_RUN" = "1" ]; then')
	lines.push('    printf \'[DRY_RUN] ln -f -- %s %s\\n\' "$survivor_full" "$target_full"')
	lines.push('  else')
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
		lines.push(`# Kit: ${op.kitName} (${formatBytes(op.size)})`)
		if (op.actionKind === 'hardlink') {
			lines.push(`hardlink_copy ${escapePosixSingleQuote(op.survivorPath)} ${escapePosixSingleQuote(op.targetPath)}`)
		} else {
			lines.push(`reclaim_copy ${escapePosixSingleQuote(op.targetPath)}`)
		}
	}

	const scanPaths = extractOccScanPaths(affectedPaths)
	if (scanPaths.length > 0) {
		lines.push('')
		lines.push('# Nextcloud metadata rescan commands after live execution (DRY_RUN=0):')
		for (const scanPath of scanPaths) {
			lines.push(`# sudo -u www-data php occ files:scan --path=${escapePosixSingleQuote(scanPath)}`)
		}
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe CSV audit report for brand kit assets.
 *
 * @param {object} analysis Output from analyzeBrandKitAssets.
 * @return {string} RFC-4180 CSV string with CWE-1236 escaping.
 */
export function buildBrandKitCsvReport(analysis) {
	const kits = analysis && Array.isArray(analysis.kits) ? analysis.kits : []
	const headers = [
		'Kit Key',
		'Asset Name',
		'Extension',
		'Asset Family',
		'Asset Tier',
		'Kit Risk State',
		'Member Role',
		'Verdict',
		'Action',
		'Path',
		'Size Bytes',
		'Authority Score',
		'Canonical Brand Path',
		'Foundry License Guard',
		'Derived Exports Count',
		'Derived Export Bytes',
		'Modified',
	]

	const rows = [headers.map(h => escapeCsvCell(h)).join(',')]
	for (const kit of kits) {
		for (const member of kit.members || []) {
			const row = [
				kit.groupKey,
				`${kit.displayName}.${kit.extension}`,
				kit.extension,
				kit.familyLabel,
				kit.tierLabel,
				kit.kitRiskState,
				member.role,
				member.verdictLabel,
				member.actionKind,
				member.normalizedPath,
				member.size,
				member.context.authorityScore,
				member.context.isCanonicalBrandPath ? 'yes' : 'no',
				member.context.isLicensedFont ? 'yes' : 'no',
				member.context.derivedExportCount,
				member.context.derivedExportBytes,
				member.formattedMtime || '',
			]
			rows.push(row.map(cell => escapeCsvCell(cell)).join(','))
		}
	}

	return rows.join('\r\n')
}

/**
 * Build a structured JSON audit manifest for brand kit assets.
 *
 * @param {object} analysis Output from analyzeBrandKitAssets.
 * @param {string} [generatedAt] Optional ISO timestamp override.
 * @return {string} Pretty-printed JSON manifest.
 */
export function buildBrandKitJsonReport(analysis, generatedAt = new Date().toISOString()) {
	const safeAnalysis = analysis && typeof analysis === 'object' ? analysis : { summary: {}, kits: [], options: {} }
	return JSON.stringify({
		schema: BRAND_KIT_SCHEMA,
		generatedAt,
		options: safeAnalysis.options || {},
		summary: safeAnalysis.summary || {},
		kits: (safeAnalysis.kits || []).map(kit => ({
			groupKey: kit.groupKey,
			primaryGroupId: kit.primaryGroupId,
			hash: kit.hash,
			displayName: kit.displayName,
			extension: kit.extension,
			family: kit.family,
			tier: kit.tier,
			kitRiskState: kit.kitRiskState,
			copyCount: kit.copyCount,
			reclaimableBytes: kit.reclaimableBytes,
			derivedExportCountTotal: kit.derivedExportCountTotal,
			derivedExportBytesTotal: kit.derivedExportBytesTotal,
			survivorPath: kit.survivor ? kit.survivor.normalizedPath : '',
			members: (kit.members || []).map(member => ({
				selectionKey: member.selectionKey,
				path: member.normalizedPath,
				role: member.role,
				verdict: member.verdict,
				actionKind: member.actionKind,
				size: member.size,
				authorityScore: member.context.authorityScore,
				isCanonicalBrandPath: member.context.isCanonicalBrandPath,
				isLicensedFont: member.context.isLicensedFont,
				derivedExports: member.context.derivedExports.map(e => e.normalizedPath),
				licenseFiles: member.context.licenseFiles.map(l => l.normalizedPath),
			})),
		})),
	}, null, 2)
}
