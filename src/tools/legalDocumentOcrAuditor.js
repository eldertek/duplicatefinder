/**
 * Pure Legal Contract, E-Signature, OCR Dual-Scan & Office-PDF Derivative Auditor.
 * Classifies and audits duplicate clusters across 4 domain families:
 * - Signed & Executed Masters (_signed, _executed, CertificateOfCompletion, .p7m, .p7s, Executed/, Signed/, DocuSign/Yousign/AdobeSign)
 * - OCR & Dual-Scan Pairs (_ocr.pdf, searchable .pdf accompanying raw scans _scan.tiff/_raw.pdf/.djvu in Scans/)
 * - Draft & Markup Forks (_redline, _tracked, _markup, _clean, Compare_..., _v1/_v2 in Contracts/Negotiation/)
 * - Office-PDF Exports (Contract.docx/.odt/.rtf + twin export Contract.pdf)
 *
 * Extracts documentLineageStem and legal/OCR/signature tags, and assigns 5 governance tiers:
 * - executed-legal-vault (Executed / Signed Legal Vault; strictly protected by default)
 * - ocr-verified-archive (OCR-Verified Archive; searchable text-indexed archival copy)
 * - negotiation-redline-wip (Negotiation / Redline WIP; redlines, tracked changes, drafts)
 * - scanner-inbox-pool (Scanner Inbox / Raw Scan Pool; raw unindexed TIFF/PDF/DjVu scans)
 * - export-derivative-bloat (Office-PDF Export Derivative Bloat; redundant exported PDFs and copies)
 *
 * Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const LEGAL_DOC_OCR_SCHEMA = 'duplicatefinder.legal-document-ocr-auditor.v1'

export const LEGAL_DOC_FAMILIES = Object.freeze([
	'all',
	'signed-executed-masters',
	'ocr-text-dual-scans',
	'draft-markup-forks',
	'office-pdf-exports',
])

export const LEGAL_DOC_FAMILY_META = Object.freeze({
	'signed-executed-masters': {
		id: 'signed-executed-masters',
		label: 'Signed & Executed Masters',
		shortLabel: 'Signed (.p7m/.p7s/Executed)',
	},
	'ocr-text-dual-scans': {
		id: 'ocr-text-dual-scans',
		label: 'OCR & Dual-Scan Pairs',
		shortLabel: 'OCR & Scans (_ocr.pdf/.tiff/.djvu)',
	},
	'draft-markup-forks': {
		id: 'draft-markup-forks',
		label: 'Draft & Markup Forks',
		shortLabel: 'Redlines & Drafts (_redline/_v1)',
	},
	'office-pdf-exports': {
		id: 'office-pdf-exports',
		label: 'Office-PDF Export Twins',
		shortLabel: 'Office & PDF (.docx/.odt/.pdf)',
	},
})

export const LEGAL_DOC_STRATEGIES = Object.freeze([
	'consolidate-executed-vault',
	'prune-raw-scan-when-ocr-verified',
	'hardlink-office-pdf-derivatives',
])

export const LEGAL_DOC_SURVIVOR_RULES = Object.freeze([
	'executed-vault-first',
	'ocr-verified-first',
	'editable-office-first',
	'newest-version',
	'shortest-path',
])

export const LEGAL_DOC_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'executed-vault',
	'ocr-verified',
	'raw-scans',
	'shielded',
])

export const LEGAL_DOC_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const LEGAL_DOC_PRESETS = Object.freeze([
	{
		id: 'all-legal-ocr-audit',
		name: 'All Legal, E-Sign, OCR & Office Audit',
		description: 'Audit signed contracts, OCR dual-scan pairs, negotiation redlines, and Office-PDF exports while strictly shielding Executed / Signed Legal Vaults.',
		familyFilter: 'all',
		strategy: 'consolidate-executed-vault',
		survivorRule: 'executed-vault-first',
		protectExecutedVault: true,
		protectSignedMasters: true,
		protectOcrVerified: true,
		staleDraftDays: 30,
		minSizeKb: 0,
	},
	{
		id: 'executed-vault-shield',
		name: 'Executed & E-Signature Vault Guard',
		description: 'Strictly shield Executed/, Signed/, CertificateOfCompletion, .p7m/.p7s, and DocuSign/Yousign/AdobeSign proofs while consolidating stray copies.',
		familyFilter: 'signed-executed-masters',
		strategy: 'consolidate-executed-vault',
		survivorRule: 'executed-vault-first',
		protectExecutedVault: true,
		protectSignedMasters: true,
		protectOcrVerified: true,
		staleDraftDays: 30,
		minSizeKb: 0,
	},
	{
		id: 'ocr-dual-scan-prune',
		name: 'Prune Raw Scans When OCR Verified',
		description: 'Retain OCR-verified searchable PDFs and reclaim redundant _scan.tiff, _raw.pdf, and .djvu raw scans only when an OCR match is verified.',
		familyFilter: 'ocr-text-dual-scans',
		strategy: 'prune-raw-scan-when-ocr-verified',
		survivorRule: 'ocr-verified-first',
		protectExecutedVault: true,
		protectSignedMasters: true,
		protectOcrVerified: true,
		staleDraftDays: 14,
		minSizeKb: 0,
	},
	{
		id: 'office-pdf-hardlink',
		name: 'Office-PDF Derivatives Hardlink',
		description: 'Keep canonical editable Office sources (.docx/.odt/.rtf) or authoritative exports and hardlink duplicate Office/PDF copies with stat cross-device safety.',
		familyFilter: 'office-pdf-exports',
		strategy: 'hardlink-office-pdf-derivatives',
		survivorRule: 'editable-office-first',
		protectExecutedVault: true,
		protectSignedMasters: true,
		protectOcrVerified: true,
		staleDraftDays: 30,
		minSizeKb: 0,
	},
	{
		id: 'negotiation-redline-sweep',
		name: 'Negotiation Redline & Markup Sweep',
		description: 'Consolidate _redline, _tracked, _markup, _clean, Compare_..., and _v1/_v2 negotiation forks while shielding executed masters.',
		familyFilter: 'draft-markup-forks',
		strategy: 'consolidate-executed-vault',
		survivorRule: 'executed-vault-first',
		protectExecutedVault: true,
		protectSignedMasters: true,
		protectOcrVerified: true,
		staleDraftDays: 30,
		minSizeKb: 0,
	},
])

const OFFICE_SOURCE_EXT_SET = new Set(['docx', 'odt', 'rtf', 'doc', 'pages'])
const SIGNED_CRYPTO_EXT_SET = new Set(['p7m', 'p7s', 'p7c', 'sig'])
const RAW_SCAN_EXT_SET = new Set(['tif', 'tiff', 'djvu', 'djv'])
const DOC_RELEVANT_EXT_SET = new Set([
	'pdf', 'docx', 'odt', 'rtf', 'doc', 'pages',
	'p7m', 'p7s', 'p7c', 'sig', 'tif', 'tiff', 'djvu', 'djv',
	'txt', 'hocr', 'xml',
])

const EXECUTED_VAULT_PATH_RE = /(\/executed\/|\/executed[-_][^/]*\/|\/signed\/|\/signed[-_][^/]*\/|\/legal[-_ ]?vault\/|\/executed[-_ ]?contracts\/|\/e[-_ ]?signatures?\/|\/docusign\/|\/yousign\/|\/adobesign\/|\/final[-_ ]?executed\/|\/__groupfolders\/\d+\/(?:executed|signed|legal-vault|executed-contracts))/i
const SIGNED_NAME_TOKEN_RE = /(?:^|[_.\-\s])(signed|executed|countersigned|certificate[-_ ]?of[-_ ]?completion|docusign|yousign|adobesign|adobe[-_ ]?sign|hellosign|pandadoc)(?=$|[_.\-\s])/gi

const OCR_VERIFIED_NAME_RE = /(?:^|[_.\-\s])(ocr|searchable|ocr[-_ ]?verified|text[-_ ]?layer)(?=$|[_.\-\s])/gi
const OCR_VERIFIED_PATH_RE = /(\/ocr[-_ ]?verified\/|\/ocr[-_ ]?archive\/|\/searchable[-_ ]?archive\/|\/ocr\/)/i
const RAW_SCAN_NAME_RE = /(?:^|[_.\-\s])(scan|raw|unindexed|raw[-_ ]?scan|scanner)(?=$|[_.\-\s])/gi
const SCANNER_INBOX_PATH_RE = /(\/scans\/|\/scanner[-_ ]?inbox\/|\/raw[-_ ]?scans\/|\/scan[-_ ]?inbox\/|\/digitization\/)/i

const DRAFT_MARKUP_NAME_RE = /(?:^|[_.\-\s])(redline|tracked|markup|clean|comments|annotated|draft|negotiation)(?=$|[_.\-\s])/gi
const COMPARE_PREFIX_RE = /^(?:compare|redline)[_-]/i
const VERSION_SUFFIX_RE = /[_.-](?:v\d+(?:\.\d+)?|rev\d+|r\d+)(?=$|[_.\-\s])/gi
const NEGOTIATION_PATH_RE = /(\/contracts\/negotiation\/|\/negotiation\/|\/redlines\/|\/markup\/|\/drafts\/|\/legal\/drafts\/|\/wip\/)/i
const CONTRACTS_PATH_RE = /(\/contracts\/|\/legal\/|\/agreements\/|\/compliance\/|\/nda\/|\/msa\/)/i

const EXPORT_DERIVATIVE_PATH_RE = /(\/exports\/|\/pdf[-_ ]?exports\/|\/office[-_ ]?exports\/|\/downloads\/|\/telechargements\/|\/tmp\/|\/temp\/|\/scratch\/|\/print\/)/i
const EXPORT_NAME_TOKEN_RE = /(?:^|[_.\-\s])(export|exported|pdf[-_ ]?export|print|rendered)(?=$|[_.\-\s])/gi

const COPY_SUFFIX_RE = /\s-\s?copy(?:\s*\(\d+\))?|\s*\(\d+\)|_copy\b/gi

const TIER_LABELS = Object.freeze({
	'executed-legal-vault': 'Executed / Signed Legal Vault',
	'ocr-verified-archive': 'OCR-Verified Archive',
	'negotiation-redline-wip': 'Negotiation / Redline WIP',
	'scanner-inbox-pool': 'Scanner Inbox / Raw Scan Pool',
	'export-derivative-bloat': 'Office-PDF Export Derivative Bloat',
})

const TIER_AUTHORITY = Object.freeze({
	'executed-legal-vault': 98,
	'ocr-verified-archive': 84,
	'negotiation-redline-wip': 58,
	'scanner-inbox-pool': 32,
	'export-derivative-bloat': 18,
})

const VERDICT_LABELS = Object.freeze({
	'keep-canonical-survivor': 'Keep Canonical Document',
	'reclaim-redundant-copy': 'Reclaim Redundant Copy',
	'reclaim-raw-scan': 'Prune Verified Raw Scan',
	'hardlink-office-derivative': 'Hardlink Office / PDF Derivative',
	'blocked-executed-vault': 'Blocked: Executed Legal Vault',
	'blocked-signed-master': 'Blocked: Signed Master Proof',
	'blocked-ocr-verified': 'Blocked: OCR-Verified Archive',
	'blocked-no-ocr-verification': 'Blocked: Raw Scan Lacks Verified OCR',
	'blocked-not-raw-scan': 'Shielded: Non-Raw-Scan Document',
	'blocked-manual-shield': 'Blocked: Operator Shield',
	excluded: 'Excluded by Operator',
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
	const raw = String(normalizedPath || '')
	const idx = raw.lastIndexOf('/')
	return idx === -1 ? raw : raw.slice(idx + 1)
}

/**
 * Collect regex capture matches from a string cleanly.
 *
 * @param {string} input Source string.
 * @param {RegExp} pattern Global regex pattern.
 * @return {Array<string>} Matched tokens.
 */
function collectTagMatches(input, pattern) {
	const out = []
	const re = new RegExp(pattern.source, pattern.flags)
	let match = re.exec(input)
	while (match !== null) {
		const token = (match[1] || match[0] || '').trim()
		if (token) {
			out.push(token)
		}
		if (match.index === re.lastIndex) {
			re.lastIndex += 1
		}
		match = re.exec(input)
	}
	return out
}

/**
 * Extract normalized extension, handling compound cryptographic/OCR extensions (.pdf.p7m, .alto.xml).
 *
 * @param {string} lowerBase Lowercase basename.
 * @return {string} Normalized extension without leading dot.
 */
function extractLegalDocExtension(lowerBase) {
	if (/\.pdf\.p7m$/i.test(lowerBase)) {
		return 'pdf.p7m'
	}
	if (/\.pdf\.p7s$/i.test(lowerBase)) {
		return 'pdf.p7s'
	}
	if (/\.alto\.xml$/i.test(lowerBase)) {
		return 'alto.xml'
	}
	const lastDot = lowerBase.lastIndexOf('.')
	if (lastDot <= 0 || lastDot >= lowerBase.length - 1) {
		return ''
	}
	return lowerBase.slice(lastDot + 1)
}

/**
 * Extract simple base extension after the final dot.
 *
 * @param {string} lowerBase Lowercase basename.
 * @return {string} Final extension.
 */
function extractSimpleExtension(lowerBase) {
	const lastDot = lowerBase.lastIndexOf('.')
	if (lastDot <= 0 || lastDot >= lowerBase.length - 1) {
		return ''
	}
	return lowerBase.slice(lastDot + 1)
}

/**
 * Parse legal contract, e-signature, OCR, markup, and export tags and canonical documentLineageStem.
 *
 * @param {string} basename File basename.
 * @param {string} [normalizedPath=''] Normalized file path.
 * @return {object} Lineage stem and extracted document artifact metadata.
 */
export function parseLegalDocumentArtifactInfo(basename, normalizedPath = '') {
	const rawBase = String(basename || '')
	const lowerBase = rawBase.toLowerCase()
	const lowerPath = String(normalizedPath || '').toLowerCase()
	const ext = extractLegalDocExtension(lowerBase)
	const simpleExt = extractSimpleExtension(lowerBase)

	let stem = rawBase
	if (ext && lowerBase.endsWith(`.${ext}`)) {
		stem = rawBase.slice(0, rawBase.length - ext.length - 1)
	}

	const signedTags = collectTagMatches(stem, SIGNED_NAME_TOKEN_RE)
	const ocrTags = collectTagMatches(stem, OCR_VERIFIED_NAME_RE)
	const rawScanTags = collectTagMatches(stem, RAW_SCAN_NAME_RE)
	const draftTags = collectTagMatches(stem, DRAFT_MARKUP_NAME_RE)
	const versionTags = collectTagMatches(stem, VERSION_SUFFIX_RE)
	const exportTags = collectTagMatches(stem, EXPORT_NAME_TOKEN_RE)
	const hasComparePrefix = COMPARE_PREFIX_RE.test(stem)

	const artifactTags = []
	const pushTag = tag => {
		const norm = String(tag || '').trim()
		if (norm && !artifactTags.includes(norm)) {
			artifactTags.push(norm)
		}
	}

	for (const t of signedTags) {
		pushTag(t.toLowerCase())
	}
	if (SIGNED_CRYPTO_EXT_SET.has(simpleExt)) {
		pushTag(simpleExt)
	}
	if (EXECUTED_VAULT_PATH_RE.test(lowerPath)) {
		pushTag('executed-vault')
	}
	for (const t of ocrTags) {
		pushTag(t.toLowerCase())
	}
	for (const t of rawScanTags) {
		pushTag(t.toLowerCase())
	}
	if (RAW_SCAN_EXT_SET.has(simpleExt)) {
		pushTag(simpleExt)
	}
	if (hasComparePrefix) {
		pushTag('compare')
	}
	for (const t of draftTags) {
		pushTag(t.toLowerCase())
	}
	for (const t of versionTags) {
		pushTag(t.toLowerCase())
	}
	for (const t of exportTags) {
		pushTag(t.toLowerCase())
	}
	if (OFFICE_SOURCE_EXT_SET.has(simpleExt)) {
		pushTag(`office:${simpleExt}`)
	}

	let cleanStem = stem
		.replace(COMPARE_PREFIX_RE, '')
		.replace(SIGNED_NAME_TOKEN_RE, '')
		.replace(OCR_VERIFIED_NAME_RE, '')
		.replace(RAW_SCAN_NAME_RE, '')
		.replace(DRAFT_MARKUP_NAME_RE, '')
		.replace(VERSION_SUFFIX_RE, '')
		.replace(EXPORT_NAME_TOKEN_RE, '')
		.replace(COPY_SUFFIX_RE, '')
		.replace(/[\s_.-]+$/g, '')
		.replace(/^[\s_.-]+/g, '')

	if (!cleanStem) {
		cleanStem = stem || rawBase
	}

	const isSignedProofArtifact = Boolean(
		SIGNED_CRYPTO_EXT_SET.has(simpleExt)
		|| signedTags.length > 0
		|| EXECUTED_VAULT_PATH_RE.test(lowerPath)
	)

	const isOcrVerifiedArtifact = Boolean(
		!isSignedProofArtifact
		&& (
			ocrTags.length > 0
			|| (simpleExt === 'pdf' && OCR_VERIFIED_PATH_RE.test(lowerPath) && rawScanTags.length === 0)
			|| ext === 'alto.xml'
			|| simpleExt === 'hocr'
		)
	)

	const isRawScanArtifact = Boolean(
		!isSignedProofArtifact
		&& !isOcrVerifiedArtifact
		&& (
			rawScanTags.length > 0
			|| RAW_SCAN_EXT_SET.has(simpleExt)
			|| (simpleExt === 'pdf' && SCANNER_INBOX_PATH_RE.test(lowerPath))
		)
	)

	const isDraftMarkupArtifact = Boolean(
		!isSignedProofArtifact
		&& !isOcrVerifiedArtifact
		&& !isRawScanArtifact
		&& (
			draftTags.length > 0
			|| hasComparePrefix
			|| ((DOC_RELEVANT_EXT_SET.has(simpleExt) || OFFICE_SOURCE_EXT_SET.has(simpleExt))
				&& (NEGOTIATION_PATH_RE.test(lowerPath) || (versionTags.length > 0 && CONTRACTS_PATH_RE.test(lowerPath))))
		)
	)

	const isOfficeSource = OFFICE_SOURCE_EXT_SET.has(simpleExt)
	const isPdfExport = simpleExt === 'pdf' && !isSignedProofArtifact && !isOcrVerifiedArtifact && !isRawScanArtifact

	return {
		documentLineageStem: cleanStem,
		artifactTags,
		artifactTag: artifactTags.length > 0 ? artifactTags.join(', ') : 'none',
		isSignedProofArtifact,
		isOcrVerifiedArtifact,
		isRawScanArtifact,
		isDraftMarkupArtifact,
		isOfficeSource,
		isPdfExport,
		hasExplicitExportCue: exportTags.length > 0 || EXPORT_DERIVATIVE_PATH_RE.test(lowerPath),
		simpleExt,
	}
}

/**
 * Classify a file path into one of the 4 Legal Contract, E-Signature, OCR Dual-Scan & Office-PDF families.
 *
 * @param {string} rawPath File path.
 * @param {object} [stemHints] Optional dataset stem hints (officeSourceStems, verifiedOcrStems).
 * @return {object|null} Classification metadata or null for unrelated files.
 */
export function classifyLegalDocumentArtifact(rawPath, stemHints = null) {
	const normalized = normalizePathForDiff(rawPath) || String(rawPath || '')
	const basename = extractBasename(normalized)
	const lowerBase = basename.toLowerCase()
	const lowerPath = normalized.toLowerCase()

	if (!lowerBase) {
		return null
	}

	const ext = extractLegalDocExtension(lowerBase)
	const info = parseLegalDocumentArtifactInfo(basename, normalized)

	if (!DOC_RELEVANT_EXT_SET.has(info.simpleExt) && !SIGNED_CRYPTO_EXT_SET.has(info.simpleExt) && !info.isSignedProofArtifact) {
		return null
	}

	if (info.isSignedProofArtifact) {
		return {
			matched: true,
			family: 'signed-executed-masters',
			familyLabel: LEGAL_DOC_FAMILY_META['signed-executed-masters'].label,
			extension: ext,
			...info,
		}
	}

	if (info.isOcrVerifiedArtifact || info.isRawScanArtifact) {
		return {
			matched: true,
			family: 'ocr-text-dual-scans',
			familyLabel: LEGAL_DOC_FAMILY_META['ocr-text-dual-scans'].label,
			extension: ext,
			...info,
		}
	}

	if (info.isDraftMarkupArtifact) {
		return {
			matched: true,
			family: 'draft-markup-forks',
			familyLabel: LEGAL_DOC_FAMILY_META['draft-markup-forks'].label,
			extension: ext,
			...info,
		}
	}

	const lowerStem = info.documentLineageStem.toLowerCase()
	const hasTwinOfficeStem = Boolean(stemHints && stemHints.officeSourceStems && stemHints.officeSourceStems.has(lowerStem))
	const hasTwinOcrStem = Boolean(stemHints && stemHints.verifiedOcrStems && stemHints.verifiedOcrStems.has(lowerStem))

	if (hasTwinOcrStem && info.simpleExt === 'pdf') {
		return {
			matched: true,
			family: 'ocr-text-dual-scans',
			familyLabel: LEGAL_DOC_FAMILY_META['ocr-text-dual-scans'].label,
			extension: ext,
			...info,
		}
	}

	if (info.isOfficeSource || (info.isPdfExport && (info.hasExplicitExportCue || CONTRACTS_PATH_RE.test(lowerPath) || hasTwinOfficeStem))) {
		return {
			matched: true,
			family: 'office-pdf-exports',
			familyLabel: LEGAL_DOC_FAMILY_META['office-pdf-exports'].label,
			extension: ext,
			...info,
		}
	}

	return null
}

/**
 * Inspect governance tier, protection flags, and legal/OCR context for a cluster member.
 *
 * @param {object} file Duplicate file entry.
 * @param {object} classification Classification metadata.
 * @param {number} referenceTimeSec Reference epoch seconds.
 * @param {number} staleDraftDays Stale draft/WIP threshold in days.
 * @param {object} [clusterHints] Cluster/dataset verification hints.
 * @return {object} Governance and lineage context.
 */
export function inspectLegalDocMemberContext(file, classification, referenceTimeSec, staleDraftDays, clusterHints = {}) {
	const normalizedPath = normalizePathForDiff(file && file.path) || String((file && file.path) || '')
	const basename = extractBasename(normalizedPath)
	const lowerPath = normalizedPath.toLowerCase()
	const mtimeSec = getFileMtimeSeconds(file)
	const ageDays = mtimeSec !== null && Number.isFinite(referenceTimeSec)
		? Math.max(0, Math.floor((referenceTimeSec - mtimeSec) / 86400))
		: null

	const parsed = parseLegalDocumentArtifactInfo(basename, normalizedPath)
	const ext = extractLegalDocExtension(basename.toLowerCase()) || classification.extension || ''
	const lowerStem = parsed.documentLineageStem.toLowerCase()

	const isExecutedLegalVault = EXECUTED_VAULT_PATH_RE.test(lowerPath)
	const isSignedMaster = parsed.isSignedProofArtifact
	const isOcrVerified = parsed.isOcrVerifiedArtifact
	const isRawScan = parsed.isRawScanArtifact
	const isDraftMarkup = parsed.isDraftMarkupArtifact || NEGOTIATION_PATH_RE.test(lowerPath)
	const isExportPath = EXPORT_DERIVATIVE_PATH_RE.test(lowerPath) || parsed.hasExplicitExportCue

	let tier = 'export-derivative-bloat'
	if (isExecutedLegalVault || isSignedMaster) {
		tier = 'executed-legal-vault'
	} else if (isOcrVerified) {
		tier = 'ocr-verified-archive'
	} else if (isRawScan) {
		tier = 'scanner-inbox-pool'
	} else if (isDraftMarkup || (parsed.isOfficeSource && !isExportPath)) {
		tier = 'negotiation-redline-wip'
	}

	const hasVerifiedOcrMatch = Boolean(
		clusterHints.clusterHasVerifiedOcr
		|| (clusterHints.verifiedOcrStems && clusterHints.verifiedOcrStems.has(lowerStem))
	)
	const hasOfficeSourceTwin = Boolean(
		clusterHints.officeSourceStems && clusterHints.officeSourceStems.has(lowerStem)
	)
	const isStaleDraftOrInbox = ageDays !== null
		&& ageDays >= staleDraftDays
		&& (tier === 'negotiation-redline-wip' || tier === 'scanner-inbox-pool' || tier === 'export-derivative-bloat')

	let authorityScore = TIER_AUTHORITY[tier] || 40
	if (isExecutedLegalVault) {
		authorityScore += 4
	}
	if (SIGNED_CRYPTO_EXT_SET.has(parsed.simpleExt)) {
		authorityScore += 3
	}
	if (parsed.isOfficeSource) {
		authorityScore += 5
	}
	if (isExportPath) {
		authorityScore -= 6
	}
	if (isRawScan) {
		authorityScore -= 4
	}

	return {
		tier,
		tierLabel: TIER_LABELS[tier] || TIER_LABELS['export-derivative-bloat'],
		authorityScore,
		extension: ext,
		documentLineageStem: parsed.documentLineageStem,
		artifactTags: parsed.artifactTags,
		artifactTag: parsed.artifactTag,
		isExecutedLegalVault,
		isSignedMaster,
		isOcrVerified,
		isRawScan,
		isDraftMarkup,
		isOfficeSource: parsed.isOfficeSource,
		isPdfExport: parsed.isPdfExport,
		hasVerifiedOcrMatch,
		hasOfficeSourceTwin,
		isStaleDraftOrInbox,
		mtimeSec,
		ageDays,
	}
}

/**
 * Select the canonical surviving copy inside a Legal Contract / OCR / Office cluster.
 *
 * @param {Array<object>} members Enriched cluster members.
 * @param {string} survivorRule Survivor selection rule.
 * @param {Set<string>} excludeKeys Excluded member keys.
 * @return {object|null} Selected survivor or null.
 */
function selectClusterSurvivor(members, survivorRule, excludeKeys) {
	if (!Array.isArray(members) || members.length === 0) {
		return null
	}
	const eligible = members.filter(m => !excludeKeys.has(m.selectionKey))
	const pool = eligible.length > 0 ? eligible : members

	const sorted = [...pool].sort((a, b) => {
		if (survivorRule === 'ocr-verified-first') {
			if (a.context.isOcrVerified !== b.context.isOcrVerified) {
				return a.context.isOcrVerified ? -1 : 1
			}
			if (a.context.isRawScan !== b.context.isRawScan) {
				return a.context.isRawScan ? 1 : -1
			}
			if (a.context.authorityScore !== b.context.authorityScore) {
				return b.context.authorityScore - a.context.authorityScore
			}
		} else if (survivorRule === 'editable-office-first') {
			if (a.context.isOfficeSource !== b.context.isOfficeSource) {
				return a.context.isOfficeSource ? -1 : 1
			}
			if (a.context.authorityScore !== b.context.authorityScore) {
				return b.context.authorityScore - a.context.authorityScore
			}
		} else if (survivorRule === 'newest-version') {
			const mtimeA = a.context.mtimeSec ?? -1
			const mtimeB = b.context.mtimeSec ?? -1
			if (mtimeA !== mtimeB) {
				return mtimeB - mtimeA
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

		const mtimeA = a.context.mtimeSec ?? 0
		const mtimeB = b.context.mtimeSec ?? 0
		if (mtimeA !== mtimeB) {
			return mtimeB - mtimeA
		}
		return a.normalizedPath.localeCompare(b.normalizedPath)
	})

	return sorted[0] || null
}

/**
 * Determine the deterministic remediation verdict for a Legal Contract / OCR / Office cluster member.
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
			note: 'Excluded from Legal & OCR audit actions by manual operator override.',
		}
	}

	if (survivor && member.selectionKey === survivor.selectionKey) {
		return {
			verdict: 'keep-canonical-survivor',
			verdictLabel: VERDICT_LABELS['keep-canonical-survivor'],
			actionKind: 'keep',
			note: `Canonical ${member.context.tierLabel} copy retained as the authoritative document.`,
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

	if (options.protectExecutedVault && member.context.isExecutedLegalVault) {
		return {
			verdict: 'blocked-executed-vault',
			verdictLabel: VERDICT_LABELS['blocked-executed-vault'],
			actionKind: 'shield',
			note: 'Strictly protected by Executed / Signed Legal Vault Guard; finalized contracts inside Executed/ or Signed/ vaults are never deleted automatically.',
		}
	}

	if (options.protectSignedMasters && member.context.isSignedMaster) {
		return {
			verdict: 'blocked-signed-master',
			verdictLabel: VERDICT_LABELS['blocked-signed-master'],
			actionKind: 'shield',
			note: 'Strictly protected by Signed Master Guard; e-signature proofs (_signed, _executed, CertificateOfCompletion, .p7m/.p7s) require compliance sign-off.',
		}
	}

	if (options.protectOcrVerified && member.context.isOcrVerified) {
		return {
			verdict: 'blocked-ocr-verified',
			verdictLabel: VERDICT_LABELS['blocked-ocr-verified'],
			actionKind: 'shield',
			note: 'Protected by OCR-Verified Archive Guard; searchable text-indexed archival copies are shielded from automatic pruning.',
		}
	}

	if (options.strategy === 'prune-raw-scan-when-ocr-verified') {
		if (!member.context.isRawScan) {
			return {
				verdict: 'blocked-not-raw-scan',
				verdictLabel: VERDICT_LABELS['blocked-not-raw-scan'],
				actionKind: 'shield',
				note: 'Retained by Prune Raw Scans strategy because copy is not a raw scanner inbox artifact.',
			}
		}
		if (!member.context.hasVerifiedOcrMatch) {
			return {
				verdict: 'blocked-no-ocr-verification',
				verdictLabel: VERDICT_LABELS['blocked-no-ocr-verification'],
				actionKind: 'shield',
				note: 'Shielded because no verified OCR searchable copy (_ocr.pdf or OCR-Archive/) matches this document lineage stem.',
			}
		}
		return {
			verdict: 'reclaim-raw-scan',
			verdictLabel: VERDICT_LABELS['reclaim-raw-scan'],
			actionKind: 'reclaim',
			note: 'Raw _scan.tiff, _raw.pdf, or .djvu duplicate verified against an OCR-indexed copy; safe to prune.',
		}
	}

	if (options.strategy === 'hardlink-office-pdf-derivatives') {
		return {
			verdict: 'hardlink-office-derivative',
			verdictLabel: VERDICT_LABELS['hardlink-office-derivative'],
			actionKind: 'hardlink',
			note: 'Replace redundant Office source or exported PDF copy with a same-filesystem POSIX hardlink.',
		}
	}

	return {
		verdict: 'reclaim-redundant-copy',
		verdictLabel: VERDICT_LABELS['reclaim-redundant-copy'],
		actionKind: 'reclaim',
		note: 'Identical-hash negotiation draft, raw scan, or Office-PDF export copy superseded by canonical survivor.',
	}
}

/**
 * Normalize Legal Contract & OCR auditor options into deterministic bounds.
 *
 * @param {object} [rawOptions] Caller options.
 * @return {object} Normalized options.
 */
function normalizeOptions(rawOptions = {}) {
	const familyFilter = LEGAL_DOC_FAMILIES.includes(rawOptions.familyFilter)
		? rawOptions.familyFilter
		: 'all'
	const verdictFilter = LEGAL_DOC_VERDICT_FILTERS.includes(rawOptions.verdictFilter)
		? rawOptions.verdictFilter
		: 'all'
	const sortMode = LEGAL_DOC_SORT_MODES.includes(rawOptions.sortMode)
		? rawOptions.sortMode
		: 'reclaim_desc'
	const strategy = LEGAL_DOC_STRATEGIES.includes(rawOptions.strategy)
		? rawOptions.strategy
		: 'consolidate-executed-vault'
	const survivorRule = LEGAL_DOC_SURVIVOR_RULES.includes(rawOptions.survivorRule)
		? rawOptions.survivorRule
		: 'executed-vault-first'

	const parsedDays = Number.parseInt(rawOptions.staleDraftDays, 10)
	const staleDraftDays = Number.isFinite(parsedDays) && parsedDays >= 0
		? Math.min(parsedDays, 3650)
		: 30

	const parsedMinKb = Number.parseFloat(rawOptions.minSizeKb)
	const minSizeKb = Number.isFinite(parsedMinKb) && parsedMinKb >= 0
		? parsedMinKb
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
		protectExecutedVault: rawOptions.protectExecutedVault !== false,
		protectSignedMasters: rawOptions.protectSignedMasters !== false,
		protectOcrVerified: rawOptions.protectOcrVerified !== false,
		staleDraftDays,
		minSizeKb,
		searchQuery: String(rawOptions.searchQuery || '').trim().toLowerCase(),
		referenceTimeSec,
		memberOverrides: rawOptions.memberOverrides && typeof rawOptions.memberOverrides === 'object'
			? rawOptions.memberOverrides
			: {},
	}
}

const FAMILY_PRIORITY = Object.freeze({
	'signed-executed-masters': 4,
	'ocr-text-dual-scans': 3,
	'draft-markup-forks': 2,
	'office-pdf-exports': 1,
})

/**
 * Audit duplicate groups for Legal Contracts, E-Signatures, OCR Dual-Scans, and Office-PDF Derivatives.
 *
 * @param {Array<object>} duplicates Loaded duplicate groups.
 * @param {object} [rawOptions] Auditor configuration options.
 * @return {object} Deterministic audit analysis with summary, counts, and clusters.
 */
export function analyzeLegalDocumentOcrDuplicates(duplicates, rawOptions = {}) {
	const options = normalizeOptions(rawOptions)
	const safeDuplicates = Array.isArray(duplicates) ? duplicates : []
	const minSizeBytes = options.minSizeKb * 1024

	const officeSourceStems = new Set()
	const verifiedOcrStems = new Set()
	for (const group of safeDuplicates) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (const file of group.files) {
			if (!file || typeof file !== 'object' || !file.path) {
				continue
			}
			const normalized = normalizePathForDiff(file.path) || String(file.path)
			const base = extractBasename(normalized)
			const parsed = parseLegalDocumentArtifactInfo(base, normalized)
			const lowerStem = parsed.documentLineageStem.toLowerCase()
			if (parsed.isOfficeSource) {
				officeSourceStems.add(lowerStem)
			}
			if (parsed.isOcrVerifiedArtifact) {
				verifiedOcrStems.add(lowerStem)
			}
		}
	}

	const stemHints = { officeSourceStems, verifiedOcrStems }

	const familyCounts = {
		all: 0,
		'signed-executed-masters': 0,
		'ocr-text-dual-scans': 0,
		'draft-markup-forks': 0,
		'office-pdf-exports': 0,
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
			const info = classifyLegalDocumentArtifact(file.path, stemHints)
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

		const clusterHasVerifiedOcr = matchedEntries.some(e => e.info.isOcrVerifiedArtifact)
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

			const directInfo = classifyLegalDocumentArtifact(file.path, stemHints)
			const memberInfo = directInfo && directInfo.matched ? directInfo : primaryInfo
			const context = inspectLegalDocMemberContext(
				file,
				memberInfo,
				options.referenceTimeSec,
				options.staleDraftDays,
				{
					clusterHasVerifiedOcr,
					verifiedOcrStems,
					officeSourceStems,
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

		const reclaimableMembers = members.filter(m => m.actionKind === 'reclaim' || m.actionKind === 'hardlink')
		const reclaimableBytes = reclaimableMembers.reduce((sum, m) => sum + m.size, 0)
		const reclaimableCopiesCount = reclaimableMembers.length
		const shieldedCopiesCount = members.filter(m => m.actionKind === 'shield').length
		const executedVaultCopiesCount = members.filter(m => m.verdict === 'blocked-executed-vault' || m.context.isExecutedLegalVault).length
		const signedMasterCopiesCount = members.filter(m => m.verdict === 'blocked-signed-master' || m.context.isSignedMaster).length
		const ocrVerifiedCopiesCount = members.filter(m => m.context.isOcrVerified).length
		const rawScanCopiesCount = members.filter(m => m.context.isRawScan).length

		const hasExecutedVault = members.some(m => m.context.isExecutedLegalVault || m.context.isSignedMaster)
		const hasOcrVerified = members.some(m => m.context.isOcrVerified || m.context.hasVerifiedOcrMatch)
		const hasRawScans = members.some(m => m.context.isRawScan)
		const hasOfficeSourceTwin = members.some(m => m.context.hasOfficeSourceTwin || m.context.isOfficeSource)

		let clusterRiskState = 'reclaimable'
		if (members.some(m => m.verdict === 'blocked-executed-vault' || m.verdict === 'blocked-signed-master')) {
			clusterRiskState = 'executed-vault'
		} else if (members.some(m => m.verdict === 'blocked-no-ocr-verification')) {
			clusterRiskState = 'unverified-scan'
		} else if (hasOcrVerified && hasRawScans) {
			clusterRiskState = 'ocr-paired'
		} else if (reclaimableCopiesCount === 0) {
			clusterRiskState = 'shielded'
		}

		const primaryGroupId = group.id ?? null
		const groupKey = String(group.hash || primaryGroupId || `legal-doc-${groupIdx}`)
		const displayName = survivor ? survivor.basename : members[0].basename
		const governanceSignals = Array.from(new Set(members.map(m => m.tier)))
		const allArtifactTags = Array.from(new Set(members.flatMap(m => m.context.artifactTags)))

		rawClusters.push({
			groupKey,
			primaryGroupId,
			hash: group.hash || '',
			displayName,
			basename: displayName,
			documentLineageStem: survivor ? survivor.context.documentLineageStem : primaryInfo.documentLineageStem,
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
			executedVaultCopiesCount,
			signedMasterCopiesCount,
			ocrVerifiedCopiesCount,
			rawScanCopiesCount,
			hasExecutedVault,
			hasOcrVerified,
			hasRawScans,
			hasOfficeSourceTwin,
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
			|| cluster.documentLineageStem.toLowerCase().includes(q)
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
		if (options.verdictFilter === 'executed-vault' && !cluster.hasExecutedVault) {
			return false
		}
		if (options.verdictFilter === 'ocr-verified' && !cluster.hasOcrVerified) {
			return false
		}
		if (options.verdictFilter === 'raw-scans' && !cluster.hasRawScans) {
			return false
		}
		if (options.verdictFilter === 'shielded' && cluster.shieldedCopiesCount === 0 && cluster.clusterRiskState !== 'shielded') {
			return false
		}
		return true
	})

	clusters.sort((a, b) => {
		if (options.sortMode === 'risk_desc') {
			const riskA = a.executedVaultCopiesCount * 5 + a.signedMasterCopiesCount * 4 + a.rawScanCopiesCount * 2 + a.shieldedCopiesCount
			const riskB = b.executedVaultCopiesCount * 5 + b.signedMasterCopiesCount * 4 + b.rawScanCopiesCount * 2 + b.shieldedCopiesCount
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
	const totalExecutedVaultClusters = clusters.filter(c => c.hasExecutedVault).length
	const totalOcrPairedClusters = clusters.filter(c => c.hasOcrVerified && c.hasRawScans).length
	const totalRawScanCopiesCount = clusters.reduce((sum, c) => sum + c.rawScanCopiesCount, 0)
	const efficiencyPct = totalRawDuplicateBytes > 0
		? Math.round((totalReclaimableBytes / totalRawDuplicateBytes) * 100)
		: 0

	return {
		schema: LEGAL_DOC_OCR_SCHEMA,
		options: {
			familyFilter: options.familyFilter,
			verdictFilter: options.verdictFilter,
			sortMode: options.sortMode,
			strategy: options.strategy,
			survivorRule: options.survivorRule,
			protectExecutedVault: options.protectExecutedVault,
			protectSignedMasters: options.protectSignedMasters,
			protectOcrVerified: options.protectOcrVerified,
			staleDraftDays: options.staleDraftDays,
			minSizeKb: options.minSizeKb,
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
			totalExecutedVaultClusters,
			totalOcrPairedClusters,
			totalRawScanCopiesCount,
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
 * Build a POSIX DRY_RUN=1 remediation script for Legal Contracts, E-Signatures, OCR Dual-Scans & Office-PDF Derivatives.
 *
 * @param {object} analysis Output from analyzeLegalDocumentOcrDuplicates.
 * @param {object} [options] Script options.
 * @param {string} [options.dataRoot='/var/www/nextcloud/data'] Nextcloud data root directory.
 * @return {string} POSIX bash script with single-quoted paths, SHA-256 verification, cross-device stat guard, and DRY_RUN=1 default.
 */
export function buildLegalDocumentOcrScript(analysis, options = {}) {
	const dataRoot = String(options.dataRoot || '/var/www/nextcloud/data').replace(/\/+$/, '') || '/var/www/nextcloud/data'
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const strategy = (analysis && analysis.options && analysis.options.strategy) || 'consolidate-executed-vault'

	const operations = []
	const affectedPaths = []

	for (const cluster of clusters) {
		const survivorPath = cluster && cluster.survivor ? cluster.survivor.normalizedPath : ''
		if (!survivorPath) {
			continue
		}
		for (const member of cluster.members || []) {
			if (member.actionKind !== 'reclaim' && member.actionKind !== 'hardlink') {
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
		'# Legal Contract, E-Signature, OCR Dual-Scan & Office-PDF Derivative Auditor',
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
		lines.push('echo "No reclaimable or hardlinkable legal, OCR, or Office-PDF targets under current guards."')
		return lines.join('\n')
	}

	lines.push('reclaim_legal_doc_copy() {')
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
	lines.push('hardlink_legal_doc_copy() {')
	lines.push('  local survivor_rel="$1"')
	lines.push('  local target_rel="$2"')
	lines.push('  local survivor_full target_full')
	lines.push('  survivor_full="$(resolve_path "$survivor_rel")"')
	lines.push('  target_full="$(resolve_path "$target_rel")"')
	lines.push('  if [ "$DRY_RUN" = "1" ]; then')
	lines.push('    printf \'[DRY_RUN] ln -f -- %s %s\\n\' "$survivor_full" "$target_full"')
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
		if (op.actionKind === 'hardlink') {
			lines.push(`hardlink_legal_doc_copy ${escapePosixSingleQuote(op.survivorPath)} ${escapePosixSingleQuote(op.targetPath)}`)
		} else {
			lines.push(`reclaim_legal_doc_copy ${escapePosixSingleQuote(op.survivorPath)} ${escapePosixSingleQuote(op.targetPath)}`)
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
 * Build a Nextcloud Desktop .sync-exclude.lst snippet for Office lock files and temporary scan artifacts.
 *
 * @param {object} analysis Output from analyzeLegalDocumentOcrDuplicates.
 * @return {string} Newline-delimited Nextcloud sync-exclude patterns.
 */
export function buildLegalDocumentSyncExcludeSnippet(analysis) {
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const lines = [
		'# Nextcloud Desktop .sync-exclude.lst rules for Office lock files and temporary OCR/scan artifacts',
		'~$*.docx',
		'~$*.doc',
		'~$*.xlsx',
		'~$*.pptx',
		'.~lock.*',
		'*.tmp',
		'*.part',
		'*.crdownload',
	]
	const seen = new Set(lines)
	for (const cluster of clusters) {
		if (cluster && cluster.extension === 'djvu' && !seen.has('*.djvu.tmp')) {
			lines.push('*.djvu.tmp')
			seen.add('*.djvu.tmp')
		}
	}
	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe CSV audit report for Legal Contracts, OCR Dual-Scans & Office-PDF Derivatives.
 *
 * @param {object} analysis Output from analyzeLegalDocumentOcrDuplicates.
 * @return {string} RFC-4180 CSV string with CWE-1236 formula escaping.
 */
export function buildLegalDocumentOcrCsvReport(analysis) {
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const headers = [
		'Cluster Key',
		'Document Name',
		'Document Lineage Stem',
		'Artifact Tags',
		'Extension',
		'Family',
		'Governance Tier',
		'Executed Legal Vault',
		'Signed Master',
		'OCR Verified',
		'Raw Scan',
		'Office Source',
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
				member.context.documentLineageStem,
				member.context.artifactTag,
				member.extension,
				cluster.familyLabel,
				member.tierLabel,
				member.context.isExecutedLegalVault ? 'yes' : 'no',
				member.context.isSignedMaster ? 'yes' : 'no',
				member.context.isOcrVerified ? 'yes' : 'no',
				member.context.isRawScan ? 'yes' : 'no',
				member.context.isOfficeSource ? 'yes' : 'no',
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
 * Build a structured JSON audit manifest for Legal Contracts, E-Signatures, OCR Dual-Scans & Office-PDF Derivatives.
 *
 * @param {object} analysis Output from analyzeLegalDocumentOcrDuplicates.
 * @param {string} [generatedAt] Optional ISO timestamp override.
 * @return {string} Pretty-printed JSON manifest.
 */
export function buildLegalDocumentOcrJsonReport(analysis, generatedAt = new Date().toISOString()) {
	const safeAnalysis = analysis && typeof analysis === 'object' ? analysis : { summary: {}, clusters: [], options: {} }
	return JSON.stringify({
		schema: LEGAL_DOC_OCR_SCHEMA,
		generatedAt,
		options: safeAnalysis.options || {},
		summary: safeAnalysis.summary || {},
		clusters: (safeAnalysis.clusters || []).map(cluster => ({
			groupKey: cluster.groupKey,
			primaryGroupId: cluster.primaryGroupId,
			hash: cluster.hash,
			basename: cluster.basename,
			documentLineageStem: cluster.documentLineageStem,
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
				documentLineageStem: member.context.documentLineageStem,
				artifactTags: member.context.artifactTags,
				isExecutedLegalVault: member.context.isExecutedLegalVault,
				isSignedMaster: member.context.isSignedMaster,
				isOcrVerified: member.context.isOcrVerified,
				isRawScan: member.context.isRawScan,
				isDraftMarkup: member.context.isDraftMarkup,
				isOfficeSource: member.context.isOfficeSource,
				isPdfExport: member.context.isPdfExport,
				hasVerifiedOcrMatch: member.context.hasVerifiedOcrMatch,
				authorityScore: member.context.authorityScore,
			})),
		})),
	}, null, 2)
}
