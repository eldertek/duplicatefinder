/**
 * Pure Financial, Accounting & Tax Compliance Vault Auditor.
 * Classifies and audits duplicate clusters across 4 Accounting & Tax Compliance families:
 * - FEC & Statutory Tax Exports (.txt, .tsv, .xml DGFiP FEC SIREN+FEC+YYYYMMDD, TVA CA3, DAS2, Liasse EDI)
 * - Bank Statements & ISO Feeds (.ofx, .qif, .mt940, .sta, .camt.xml, .csv bank statements)
 * - Invoices, Credit Notes & Tax Liasses (.pdf Factur-X, invoices/factures, credit notes/avoirs, liasses 2033/2050/2065, bilans)
 * - Closing & Accounting Workbooks (.xlsx, .xlsm, .ods general ledger, trial balance, bank reconciliation, closing workbooks)
 *
 * Detects duplicate scanned or re-exported invoices and bank statements against conserved signed originals
 * and 10-year statutory fiscal archives, strictly shields FEC archives, locked/signed justificatifs, and
 * closed balance sheets/bilans, and builds DRY_RUN=1 POSIX scripts, CWE-1236-safe CSV reports,
 * JSON manifests, and .sync-exclude.lst rules.
 *
 * Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const FINANCE_TAX_VAULT_SCHEMA = 'duplicatefinder.finance-tax-vault-auditor.v1'

export const FINANCE_TAX_FAMILIES = Object.freeze([
	'all',
	'fec-statutory-exports',
	'bank-statements-feeds',
	'invoices-liasses-pdf',
	'accounting-workbooks',
])

export const FINANCE_TAX_FAMILY_META = Object.freeze({
	'fec-statutory-exports': {
		id: 'fec-statutory-exports',
		label: 'FEC & Statutory Tax Exports',
		shortLabel: 'FEC (.txt, .tsv, .xml SIREN+FEC)',
	},
	'bank-statements-feeds': {
		id: 'bank-statements-feeds',
		label: 'Bank Statements & ISO Feeds',
		shortLabel: 'Bank (.ofx, .qif, .mt940, .camt.xml, .csv)',
	},
	'invoices-liasses-pdf': {
		id: 'invoices-liasses-pdf',
		label: 'Invoices, Credit Notes & Liasses',
		shortLabel: 'Invoices & Liasses (.pdf, Factur-X, bilan)',
	},
	'accounting-workbooks': {
		id: 'accounting-workbooks',
		label: 'Closing & Accounting Workbooks',
		shortLabel: 'Workbooks (.xlsx, .xlsm, .ods)',
	},
})

export const FINANCE_TAX_STRATEGIES = Object.freeze([
	'prune-scans-and-reexports',
	'hardlink-immutable-archives',
	'quarantine-scans-and-drafts',
])

export const FINANCE_TAX_SURVIVOR_RULES = Object.freeze([
	'archive-signed-fec-first',
	'oldest-fiscal-original-first',
	'newest-closed-first',
	'shortest-path',
])

export const FINANCE_TAX_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'fec-archive-protected',
	'signed-justificatif-protected',
	'closed-bilan-protected',
	'scanned-or-reexport-copy',
	'stale-accounting-export',
	'shielded',
])

export const FINANCE_TAX_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const FINANCE_TAX_PRESETS = Object.freeze([
	{
		id: 'all-finance-tax-compliance-audit',
		name: 'All FEC, Bank, Invoices & Bilans',
		description: 'Audit FEC exports, bank statements (.ofx/.qif/.mt940/.camt.xml/.csv), invoice/liasse PDFs, and closing workbooks while strictly guarding FEC archives, signed/locked justificatifs, and closed bilans.',
		familyFilter: 'all',
		strategy: 'prune-scans-and-reexports',
		survivorRule: 'archive-signed-fec-first',
		protectFecArchives: true,
		protectSignedJustificatifs: true,
		protectClosedBilans: true,
		requireVerifiedArchiveAnchor: true,
		keepRecentClosingDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'fec-and-closed-bilans-shield',
		name: 'FEC & 10-Year Fiscal Vault',
		description: 'Isolate DGFiP FEC exports (.txt/.tsv) and closed annual balance sheets/liasses fiscales with maximum 10-year compliance shielding.',
		familyFilter: 'fec-statutory-exports',
		strategy: 'quarantine-scans-and-drafts',
		survivorRule: 'archive-signed-fec-first',
		protectFecArchives: true,
		protectSignedJustificatifs: true,
		protectClosedBilans: true,
		requireVerifiedArchiveAnchor: true,
		keepRecentClosingDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'scanned-invoices-vs-signed-originals',
		name: 'Scanned Invoices vs Signed Originals',
		description: 'Detect scanned, OCR, and re-exported invoice or credit-note PDFs and reclaim only when a conserved signed Factur-X/PAdES original or 10-year archive is verified.',
		familyFilter: 'invoices-liasses-pdf',
		strategy: 'prune-scans-and-reexports',
		survivorRule: 'archive-signed-fec-first',
		protectFecArchives: true,
		protectSignedJustificatifs: true,
		protectClosedBilans: true,
		requireVerifiedArchiveAnchor: true,
		keepRecentClosingDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'bank-statements-reexports',
		name: 'Bank Statements (.ofx/.mt940/.camt)',
		description: 'Clean up re-exported or duplicated OFX, QIF, MT940, CAMT.053 XML, and treasury CSV bank statements outside canonical treasury archives.',
		familyFilter: 'bank-statements-feeds',
		strategy: 'prune-scans-and-reexports',
		survivorRule: 'oldest-fiscal-original-first',
		protectFecArchives: true,
		protectSignedJustificatifs: true,
		protectClosedBilans: true,
		requireVerifiedArchiveAnchor: true,
		keepRecentClosingDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'hardlink-immutable-fiscal-pdfs',
		name: 'Hardlink Immutable Fiscal PDFs',
		description: 'Deduplicate identical immutable PDFs and statutory exports via POSIX hardlinks while blocking hardlinks on mutable .xlsx/.xlsm/.ods/.csv workbooks.',
		familyFilter: 'all',
		strategy: 'hardlink-immutable-archives',
		survivorRule: 'archive-signed-fec-first',
		protectFecArchives: true,
		protectSignedJustificatifs: true,
		protectClosedBilans: true,
		requireVerifiedArchiveAnchor: false,
		keepRecentClosingDays: 0,
		minSizeKb: 0,
	},
])

export const FINANCE_TAX_DEFAULT_CONFIG = Object.freeze({
	presetId: 'all-finance-tax-compliance-audit',
	familyFilter: 'all',
	verdictFilter: 'all',
	strategy: 'prune-scans-and-reexports',
	survivorRule: 'archive-signed-fec-first',
	sortMode: 'reclaim_desc',
	searchQuery: '',
	protectFecArchives: true,
	protectSignedJustificatifs: true,
	protectClosedBilans: true,
	requireVerifiedArchiveAnchor: true,
	keepRecentClosingDays: 0,
	minSizeKb: 0,
})

const FEC_EXPORT_EXT_RE = /\.(?:txt|tsv)$/i
const XML_EXT_RE = /\.xml$/i
const CSV_EXT_RE = /\.csv$/i
const BANK_FEED_EXT_RE = /\.(?:ofx|qif|mt940|sta)$/i
const BANK_CAMT_XML_RE = /(?:\.camt\.(?:xml|05[234])|camt[-_.]?05[234].*\.xml)$/i
const INVOICE_LIASSE_PDF_EXT_RE = /\.pdf$/i
const ACCOUNTING_WORKBOOK_EXT_RE = /\.(?:xlsx|xlsm|ods)$/i

const MUTABLE_ACCOUNTING_EXT_RE = /\.(?:xlsx|xlsm|ods|csv)$/i

const FEC_SIREN_NAME_RE = /(?:^|[^0-9])(\d{9})fec(20\d{2})\d{4}(?:[^0-9]|$)/i
const FEC_NAME_RE = /(?:^|[^a-z0-9])(?:\d{9}fec\d{8}|fec[-_]?(?:20\d{2}|cloture|definitif|archive|export|validation|test|brouillon|reexport|copy|copie)|fichier[-_]?ecritures[-_]?comptables)(?:[^a-z0-9]|$)/i
const FEC_EDI_XML_NAME_RE = /(?:^|[^a-z0-9])(?:fec|liasse[-_]?edi|tdfc|ca3|ca12|das2|tva[-_]?edi|edi[-_]?fiscal)(?:[^a-z0-9]|$)/i

const FINANCE_TAX_PATH_HINT_RE = /(?:^|\/)(?:comptabilite|compta|accounting|finance|fiscal|tax|fec|dgfip|factures?|invoices?|avoirs?|credit[-_]?notes?|releves?[-_]?bancaires?|bank[-_]?statements?|bilans?|liasses?(?:[-_]?fiscales?)?|clotures?|archives?[-_]?fiscales?|archive[-_]?10[-_]?ans|10[-_]?ans|audit[-_]?fiscal|expert[-_]?comptable|tresorerie|treasury|ebics|sepa|grand[-_]?livre|balance[-_]?generale|justificatifs?|note[-_]?de[-_]?frais|paie|urssaf|tva|cof?fre[-_]?fort|vault[-_]?fiscal)(?:\/|$)/i

const BANK_CSV_NAME_RE = /(?:releve|bank[-_]?statement|extrait[-_]?compte|iban|sepa|mt940|camt|ofx|qif|ebics|tresorerie|treasury|virement|prelevement|rib[-_]?releve|qonto|shine|bnp|societe[-_]?generale|credit[-_]?agricole)/i
const INVOICE_LIASSE_NAME_RE = /(?:facture|invoice|avoir|credit[-_]?note|liasse|2033|2050|2065|bilan|compte[-_]?de[-_]?resultat|annexe[-_]?fiscale|tva|ca3|ca12|das2|factur[-_]?x|justificatif|note[-_]?de[-_]?frais|quittance|recu|receipt|releve[-_]?bancaire|attestation[-_]?fiscale|avis[-_]?imposition|urssaf|cfe|cvae|fec)/i
const ACCOUNTING_WORKBOOK_NAME_RE = /(?:grand[-_]?livre|balance[-_]?generale|balance[-_]?agee|rapprochement|journal[-_]?comptable|plan[-_]?comptable|amortissement|immobilisations|tva|cloture|bilan|tresorerie|compta|ecritures|cut[-_]?off|provision|liasse)/i

const ARCHIVE_10YR_PATH_RE = /(?:^|\/)(?:archives?[-_]?fiscales?|archive[-_]?10[-_]?ans|10[-_]?ans|10yr|coffre[-_]?fort|vault[-_]?fiscal|dgfip|originaux[-_]?signes?|signed[-_]?originals?|cloture[-_]?definitive?|statutory[-_]?archives?|immutable[-_]?vault)(?:\/|$)/i
const FEC_CANONICAL_PATH_RE = /(?:^|\/)(?:fec|dgfip|archives?[-_]?fiscales?|archive[-_]?10[-_]?ans|10[-_]?ans|clotures?|vault[-_]?fiscal|coffre[-_]?fort)(?:\/|$)/i

const SIGNED_LOCKED_NAME_RE = /(?:^|[-_.])(?:signe|signed|verrouille|locked|scelle|sealed|pades|factur[-_]?x|certifie|certified|horodate|timestamped|original[-_]?signe|definitif|10ans)(?:[-_.]|$)/i
const CLOSED_BILAN_NAME_RE = /(?:bilan|liasse|2033|2050|2065|compte[-_]?de[-_]?resultat|annexe[-_]?fiscale|cloture|grand[-_]?livre[-_]?cloture|balance[-_]?cloture)/i
const CLOSED_STATUS_HINT_RE = /(?:^|[-_./])(?:cloture|closed|definitif|final[-_]?signed|approuve|approved|valide|validated|certified|2033|2050|2065|liasse)(?:[-_./]|$)/i

const SCANNED_OR_REEXPORT_PATH_RE = /(?:^|\/)(?:scans?|numerisation|inbox[-_]?scan|ocr[-_]?tmp|reexports?|re[-_]?exports?|staging|tmp|temp|downloads?|telechargements?|brouillons?|drafts?|working|export[-_]?erp|exports?[-_]?tmp|cache)(?:\/|$)/i
const SCANNED_OR_REEXPORT_NAME_RE = /(?:^scan[-_.]|[-_.](?:scan|scanned|numerise|ocr|reexport|re[-_]?export|export|compressed|recompressed|draft|brouillon|tmp|temp|copy\d*|copie\d*|v\d+|bis)| \(\d+\))(?=\.[^.]+$)/i

const STALE_EXPORT_PATH_RE = /(?:^|\/)(?:staging|tmp|temp|old[-_]?exports?|export[-_]?history|exports?[-_]?old|reexports?|downloads?|brouillons?|drafts?|working|backup[-_]?tmp)(?:\/|$)/i
const STALE_EXPORT_NAME_RE = /(?:[-_.](?:old|bak|backup|staging|tmp|reexport|re[-_]?export|brouillon|draft|copy\d*|copie\d*|export[-_]?\d{6,8})| \(\d+\))(?=\.[^.]+$)/i

const FISCAL_YEAR_RE = /(?:^|[^0-9])(?:fy|ex|exercice|cloture|bilan|liasse|fec|tva)?[-_]?(20[0-3]\d)(?:[^0-9]|$)/i
const SIREN_PATH_RE = /(?:^|[^0-9])siren[-_]?(\d{9})(?:[^0-9]|$)/i

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
export function normalizeFinanceTaxConfig(raw = {}) {
	const input = raw && typeof raw === 'object' ? raw : {}
	const preset = FINANCE_TAX_PRESETS.find(item => item.id === input.presetId) || null
	const base = preset ? { ...FINANCE_TAX_DEFAULT_CONFIG, ...preset } : { ...FINANCE_TAX_DEFAULT_CONFIG }

	const familyFilter = FINANCE_TAX_FAMILIES.includes(input.familyFilter)
		? input.familyFilter
		: base.familyFilter
	const verdictFilter = FINANCE_TAX_VERDICT_FILTERS.includes(input.verdictFilter)
		? input.verdictFilter
		: base.verdictFilter
	const strategy = FINANCE_TAX_STRATEGIES.includes(input.strategy)
		? input.strategy
		: base.strategy
	const survivorRule = FINANCE_TAX_SURVIVOR_RULES.includes(input.survivorRule)
		? input.survivorRule
		: base.survivorRule
	const sortMode = FINANCE_TAX_SORT_MODES.includes(input.sortMode)
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
		protectFecArchives: typeof input.protectFecArchives === 'boolean'
			? input.protectFecArchives
			: base.protectFecArchives,
		protectSignedJustificatifs: typeof input.protectSignedJustificatifs === 'boolean'
			? input.protectSignedJustificatifs
			: base.protectSignedJustificatifs,
		protectClosedBilans: typeof input.protectClosedBilans === 'boolean'
			? input.protectClosedBilans
			: base.protectClosedBilans,
		requireVerifiedArchiveAnchor: typeof input.requireVerifiedArchiveAnchor === 'boolean'
			? input.requireVerifiedArchiveAnchor
			: base.requireVerifiedArchiveAnchor,
		keepRecentClosingDays: normalizeNonNegativeInt(input.keepRecentClosingDays, base.keepRecentClosingDays, 3650),
		minSizeKb: normalizeNonNegativeInt(input.minSizeKb, base.minSizeKb, 10000000),
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
 * Extract a 9-digit SIREN identifier from a FEC filename or path when present.
 *
 * @param {string} normalizedPath Normalized path.
 * @param {string} basename File basename.
 * @return {string} 9-digit SIREN or empty string.
 */
export function extractFinanceSiren(normalizedPath, basename = '') {
	const fecMatch = String(basename || '').match(FEC_SIREN_NAME_RE)
	if (fecMatch) {
		return fecMatch[1]
	}
	const pathMatch = String(normalizedPath || '').match(SIREN_PATH_RE)
	return pathMatch ? pathMatch[1] : ''
}

/**
 * Extract the fiscal year stamp (e.g. FY2024) from filename or path.
 *
 * @param {string} normalizedPath Normalized path.
 * @param {string} basename File basename.
 * @return {string} Fiscal year tag or empty string.
 */
export function extractFiscalYear(normalizedPath, basename = '') {
	const fecMatch = String(basename || '').match(FEC_SIREN_NAME_RE)
	if (fecMatch) {
		return `FY${fecMatch[2]}`
	}
	const baseMatch = String(basename || '').match(FISCAL_YEAR_RE)
	if (baseMatch) {
		return `FY${baseMatch[1]}`
	}
	const pathMatch = String(normalizedPath || '').match(FISCAL_YEAR_RE)
	return pathMatch ? `FY${pathMatch[1]}` : ''
}

/**
 * Extract a normalized accounting document stem for correlating scanned or re-exported
 * duplicates against signed originals and 10-year fiscal archives.
 *
 * @param {string} basename File basename.
 * @return {string} Normalized document stem.
 */
export function extractFinanceDocumentStem(basename) {
	let stem = String(basename || '').trim().toLowerCase()
	stem = stem.replace(/\.camt\.xml$/i, '')
	stem = stem.replace(/\.(?:txt|tsv|xml|csv|ofx|qif|mt940|sta|pdf|xlsx|xlsm|ods)$/i, '')
	stem = stem.replace(/\s+\(\d+\)$/, '')
	let prev = ''
	while (stem !== prev) {
		prev = stem
		stem = stem.replace(/^scan[-_.]/i, '')
		stem = stem.replace(/[-_.](?:scan|scanned|numerise|ocr|reexport|re[-_]?export|export|compressed|recompressed|signed|signe|verrouille|locked|scelle|sealed|pades|factur[-_]?x|certifie|certified|horodate|original|definitif|cloture|closed|archive|10ans|draft|brouillon|old|bak|backup|staging|tmp|temp|copy\d*|copie\d*|v\d+|bis)$/i, '')
	}
	return stem || 'unknown-fiscal-document'
}

/**
 * Extract a concise compliance variant tag (e.g. fec-siren-archive, pades-signed, scanned-ocr-copy).
 *
 * @param {string} lowerBase Lowercase basename.
 * @param {string} lowerPath Lowercase path.
 * @return {string} Compliance tag or empty string.
 */
function extractComplianceTag(lowerBase, lowerPath) {
	if (FEC_SIREN_NAME_RE.test(lowerBase)) {
		return 'fec-dgfip'
	}
	if (/factur[-_]?x/i.test(lowerBase)) {
		return 'factur-x'
	}
	if (/pades|scelle|sealed|certifie/i.test(lowerBase)) {
		return 'pades-sealed'
	}
	if (/signe|signed|verrouille|locked/i.test(lowerBase)) {
		return 'signed-locked'
	}
	if (ARCHIVE_10YR_PATH_RE.test(lowerPath)) {
		return 'archive-10ans'
	}
	if (/reexport|re[-_]?export/i.test(lowerBase)) {
		return 're-exported'
	}
	if (/(?:^scan[-_.]|[-_.](?:scan|scanned|numerise|ocr)(?:[-_.]|$))/i.test(lowerBase) || /\/(?:scans?|numerisation|ocr[-_]?tmp)\//i.test(lowerPath)) {
		return 'scanned-ocr'
	}
	if (BANK_CAMT_XML_RE.test(lowerBase)) {
		return 'camt-iso20022'
	}
	if (/\.mt940$|\.sta$/i.test(lowerBase)) {
		return 'mt940-swift'
	}
	if (/\.ofx$/i.test(lowerBase)) {
		return 'ofx-feed'
	}
	if (/\.qif$/i.test(lowerBase)) {
		return 'qif-feed'
	}
	if (STALE_EXPORT_NAME_RE.test(lowerBase) || STALE_EXPORT_PATH_RE.test(lowerPath)) {
		return 'staging-export'
	}
	return ''
}

/**
 * Classify a single duplicate file into the Financial, Accounting & Tax Compliance domain.
 *
 * @param {object} file Duplicate file entry.
 * @param {number} [referenceNowMs] Reference epoch ms.
 * @return {object} Classification metadata (family === null if outside domain).
 */
export function classifyFinanceTaxFile(file, referenceNowMs = Date.now()) {
	const rawPath = file?.path || file?.name || ''
	const normalized = normalizePathForDiff(rawPath) || String(rawPath || '').replace(/\\/g, '/')
	const lower = normalized.toLowerCase()
	const basename = extractBasename(normalized)
	const lowerBase = basename.toLowerCase()
	const dir = extractDirname(normalized)
	const lowerDir = dir.toLowerCase()

	const isFecExt = FEC_EXPORT_EXT_RE.test(lowerBase)
	const isXmlExt = XML_EXT_RE.test(lowerBase)
	const isCsvExt = CSV_EXT_RE.test(lowerBase)
	const isBankFeedExt = BANK_FEED_EXT_RE.test(lowerBase) || BANK_CAMT_XML_RE.test(lowerBase)
	const isPdfExt = INVOICE_LIASSE_PDF_EXT_RE.test(lowerBase)
	const isWorkbookExt = ACCOUNTING_WORKBOOK_EXT_RE.test(lowerBase)
	const isMutableWorkbook = MUTABLE_ACCOUNTING_EXT_RE.test(lowerBase)

	const siren = extractFinanceSiren(normalized, basename)
	const fiscalYear = extractFiscalYear(normalized, basename)
	const documentStem = extractFinanceDocumentStem(basename)

	const hasFinancePathHint = FINANCE_TAX_PATH_HINT_RE.test(lower) || Boolean(siren)
	const isFecName = FEC_NAME_RE.test(lowerBase) || FEC_EDI_XML_NAME_RE.test(lowerBase)
	const isBankCsvName = BANK_CSV_NAME_RE.test(lowerBase)
	const isInvoiceLiasseName = INVOICE_LIASSE_NAME_RE.test(lowerBase)
	const isAccountingWorkbookName = ACCOUNTING_WORKBOOK_NAME_RE.test(lowerBase)

	const isArchive10YrPath = ARCHIVE_10YR_PATH_RE.test(lower)
	const isFecCanonicalPath = FEC_CANONICAL_PATH_RE.test(lower)
	const isSignedLockedName = SIGNED_LOCKED_NAME_RE.test(lowerBase)
	const isClosedBilanName = CLOSED_BILAN_NAME_RE.test(lowerBase)
	const hasClosedStatus = CLOSED_STATUS_HINT_RE.test(lower)
	const isScannedOrReexportPath = SCANNED_OR_REEXPORT_PATH_RE.test(lower)
	const isScannedOrReexportName = SCANNED_OR_REEXPORT_NAME_RE.test(lowerBase)
	const isStaleExportPath = STALE_EXPORT_PATH_RE.test(lower)
	const isStaleExportName = STALE_EXPORT_NAME_RE.test(lowerBase)

	const isFecMatch = (isFecExt && (isFecName || (hasFinancePathHint && /fec|ecritures|dgfip|ca3|das2/i.test(lower))))
		|| (isXmlExt && !BANK_CAMT_XML_RE.test(lowerBase) && (isFecName || FEC_EDI_XML_NAME_RE.test(lowerBase)))
	const isBankMatch = isBankFeedExt
		|| (isCsvExt && (isBankCsvName || /\/(?:releves?[-_]?bancaires?|bank[-_]?statements?|ebics|tresorerie|treasury)\//i.test(lower)))
	const isInvoicePdfMatch = isPdfExt && (hasFinancePathHint || isInvoiceLiasseName || isSignedLockedName || isClosedBilanName)
	const isAccountingWorkbookMatch = isWorkbookExt && (hasFinancePathHint || isAccountingWorkbookName || isClosedBilanName)

	const inDomain = Boolean(isFecMatch || isBankMatch || isInvoicePdfMatch || isAccountingWorkbookMatch)

	let family = null
	let artifactKind = 'unknown'

	if (inDomain) {
		if (isFecMatch) {
			family = 'fec-statutory-exports'
			if (isScannedOrReexportPath || isScannedOrReexportName || isStaleExportPath || isStaleExportName) {
				artifactKind = 'fec-staging-reexport'
			} else if (FEC_SIREN_NAME_RE.test(lowerBase) || isArchive10YrPath || isFecCanonicalPath) {
				artifactKind = 'fec-statutory-archive'
			} else {
				artifactKind = 'fec-export-file'
			}
		} else if (isBankMatch) {
			family = 'bank-statements-feeds'
			if (isSignedLockedName || isArchive10YrPath) {
				artifactKind = 'bank-statement-archived-original'
			} else if (isScannedOrReexportPath || isScannedOrReexportName || isStaleExportPath || isStaleExportName) {
				artifactKind = 'bank-statement-reexport'
			} else if (BANK_CAMT_XML_RE.test(lowerBase)) {
				artifactKind = 'camt-iso-statement'
			} else if (/\.mt940$|\.sta$/i.test(lowerBase)) {
				artifactKind = 'mt940-bank-statement'
			} else if (/\.(?:ofx|qif)$/i.test(lowerBase)) {
				artifactKind = 'ofx-qif-statement'
			} else {
				artifactKind = 'bank-csv-extract'
			}
		} else if (isInvoicePdfMatch) {
			family = 'invoices-liasses-pdf'
			if (isClosedBilanName && (hasClosedStatus || isArchive10YrPath) && !isScannedOrReexportPath && !isScannedOrReexportName) {
				artifactKind = 'closed-bilan-liasse-pdf'
			} else if ((isSignedLockedName || isArchive10YrPath) && !isScannedOrReexportPath && !isScannedOrReexportName) {
				artifactKind = 'signed-invoice-justificatif'
			} else if (isScannedOrReexportPath || isScannedOrReexportName) {
				artifactKind = 'scanned-or-reexported-pdf'
			} else {
				artifactKind = 'invoice-or-voucher-pdf'
			}
		} else {
			family = 'accounting-workbooks'
			if ((isClosedBilanName || /grand[-_]?livre|balance[-_]?generale/i.test(lowerBase)) && (hasClosedStatus || isArchive10YrPath) && !isStaleExportPath && !isStaleExportName) {
				artifactKind = 'closed-accounting-bilan'
			} else if (isStaleExportPath || isStaleExportName || isScannedOrReexportName) {
				artifactKind = 'stale-workbook-export'
			} else {
				artifactKind = 'accounting-closing-workbook'
			}
		}
	}

	const mtimeMs = extractMtimeMs(file)
	const ageDays = mtimeMs !== null && Number.isFinite(referenceNowMs)
		? Math.max(0, Math.floor((referenceNowMs - mtimeMs) / 86400000))
		: null

	const isStagingOrReexport = isScannedOrReexportPath || isScannedOrReexportName || isStaleExportPath || isStaleExportName

	const isFecArchive = family === 'fec-statutory-exports' && !isStagingOrReexport
	const isSignedJustificatif = (
		(family === 'invoices-liasses-pdf' || family === 'bank-statements-feeds')
		&& (isSignedLockedName || isArchive10YrPath)
		&& !isStagingOrReexport
	)
	const isClosedBilan = (
		(family === 'invoices-liasses-pdf' || family === 'accounting-workbooks')
		&& (isClosedBilanName || /grand[-_]?livre|balance[-_]?generale/i.test(lowerBase))
		&& (hasClosedStatus || isArchive10YrPath)
		&& !isStagingOrReexport
	)
	const isScannedOrReexportCopy = inDomain && !isFecArchive && !isSignedJustificatif && !isClosedBilan && (
		isScannedOrReexportPath || isScannedOrReexportName
	)
	const isStaleAccountingExport = inDomain && !isFecArchive && !isSignedJustificatif && !isClosedBilan && !isScannedOrReexportCopy && (
		isStaleExportPath || isStaleExportName
	)

	const complianceTag = extractComplianceTag(lowerBase, lower)

	const complianceRole = isFecArchive
		? 'fec-statutory-archive'
		: (isClosedBilan
			? 'closed-bilan-archive'
			: (isSignedJustificatif
				? 'signed-10yr-justificatif'
				: (isScannedOrReexportCopy
					? 'scanned-or-reexport-copy'
					: (isStaleAccountingExport ? 'stale-accounting-export' : 'accounting-copy'))))

	return {
		family,
		artifactKind,
		complianceRole,
		normalized,
		lower,
		basename,
		lowerBase,
		dir,
		lowerDir,
		siren,
		fiscalYear,
		documentStem,
		complianceTag,
		isFecArchive,
		isSignedJustificatif,
		isClosedBilan,
		isScannedOrReexportCopy,
		isStaleAccountingExport,
		isArchive10YrPath,
		isSignedLockedName,
		isMutableWorkbook,
		isStagingOrReexport,
		size: Number(file?.size) || 0,
		mtimeMs,
		ageDays,
		formattedMtime: formatFileModifiedTime(file),
	}
}

/**
 * Determine whether a duplicate group belongs to the Financial, Accounting & Tax Compliance domain.
 *
 * @param {object} group Duplicate group.
 * @return {boolean} True when at least one file matches the domain.
 */
export function isFinanceTaxGroup(group) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return false
	}
	return group.files.some(file => classifyFinanceTaxFile(file).family !== null)
}

/**
 * Build a cross-vault fiscal correlation index linking scanned/re-exported copies
 * to conserved FEC archives, signed/locked justificatifs, 10-year fiscal originals, and closed bilans.
 *
 * @param {Array<object>} groups Domain duplicate groups.
 * @return {object} Correlation index.
 */
function buildFinanceTaxCorrelationIndex(groups) {
	const verifiedArchiveStems = new Set()
	const verifiedFecSirens = new Set()
	const variantCountByStem = new Map()

	for (const group of groups) {
		for (const file of group.files || []) {
			const meta = classifyFinanceTaxFile(file)
			if (!meta.family) {
				continue
			}
			if (meta.isFecArchive || meta.isSignedJustificatif || meta.isClosedBilan) {
				verifiedArchiveStems.add(meta.documentStem)
				if (meta.siren) {
					verifiedFecSirens.add(meta.siren)
				}
			}
			if (meta.isScannedOrReexportCopy || meta.isStaleAccountingExport) {
				variantCountByStem.set(meta.documentStem, (variantCountByStem.get(meta.documentStem) || 0) + 1)
			}
		}
	}

	return {
		verifiedArchiveStems,
		verifiedFecSirens,
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
	if (members.some(m => m.family === 'fec-statutory-exports')) {
		return 'fec-statutory-exports'
	}
	if (members.some(m => m.family === 'invoices-liasses-pdf')) {
		return 'invoices-liasses-pdf'
	}
	if (members.some(m => m.family === 'bank-statements-feeds')) {
		return 'bank-statements-feeds'
	}
	return 'accounting-workbooks'
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

	if (survivorRule === 'oldest-fiscal-original-first') {
		const oldestScore = member.mtimeMs !== null ? -mtimeScore : 0
		return (member.isFecArchive ? 65000 : 0)
			+ (member.isSignedJustificatif ? 60000 : 0)
			+ (member.isClosedBilan ? 55000 : 0)
			+ (member.isArchive10YrPath ? 35000 : 0)
			+ (member.isStagingOrReexport ? -30000 : 0)
			+ oldestScore
			+ shortPathScore
	}

	if (survivorRule === 'newest-closed-first') {
		return (member.isClosedBilan ? 45000 : 0)
			+ (member.isFecArchive ? 40000 : 0)
			+ (member.isSignedJustificatif ? 35000 : 0)
			+ (member.isStagingOrReexport ? -25000 : 0)
			+ mtimeScore
	}

	if (survivorRule === 'shortest-path') {
		return (member.isScannedOrReexportCopy || member.isStaleAccountingExport ? -3000 : 0)
			+ shortPathScore
	}

	return (member.isFecArchive ? 75000 : 0)
		+ (member.isSignedJustificatif ? 70000 : 0)
		+ (member.isClosedBilan ? 65000 : 0)
		+ (member.isArchive10YrPath ? 40000 : 0)
		+ (member.isSignedLockedName ? 30000 : 0)
		+ (member.isScannedOrReexportCopy ? -35000 : 0)
		+ (member.isStaleAccountingExport ? -25000 : 0)
		+ shortPathScore
}

/**
 * Audit a single Financial, Accounting & Tax Compliance duplicate cluster.
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
		const meta = classifyFinanceTaxFile(file, referenceNowMs)
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
	const primarySiren = rawMembers.find(m => m.siren)?.siren || ''
	const primaryFiscalYear = rawMembers.find(m => m.fiscalYear)?.fiscalYear || ''
	const primaryStem = rawMembers[0].documentStem || extractFinanceDocumentStem(primaryName)
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

	const hasVerifiedArchiveAnchor = Boolean(
		survivor.isFecArchive
		|| survivor.isSignedJustificatif
		|| survivor.isClosedBilan
		|| survivor.isArchive10YrPath
		|| correlationIndex.verifiedArchiveStems.has(primaryStem)
		|| (primarySiren && correlationIndex.verifiedFecSirens.has(primarySiren))
	)

	let reclaimableBytes = 0
	let hardlinkSavingsBytes = 0
	let deleteTargetsCount = 0
	let hardlinkTargetsCount = 0
	let shieldedCount = 0

	const members = rawMembers.map((member) => {
		const isSurvivor = member.key === survivorKey
		const override = config.memberOverrides?.[member.key] || 'auto'
		let governanceTier = 'scanned-or-reexport-copy'
		let shielded = false
		let protectedReason = ''
		let action = 'keep'

		if (override === 'keep' && !isSurvivor) {
			governanceTier = member.isFecArchive
				? 'fec-archive-protected'
				: (member.isSignedJustificatif
					? 'signed-justificatif-protected'
					: (member.isClosedBilan ? 'closed-bilan-protected' : 'scanned-or-reexport-copy'))
			shielded = true
			protectedReason = 'Manually shielded via per-copy override'
		} else if (member.isFecArchive && config.protectFecArchives) {
			governanceTier = 'fec-archive-protected'
			shielded = true
			protectedReason = 'FEC statutory archive (DGFiP / 10-year retention) strictly conserved'
		} else if (member.isClosedBilan && config.protectClosedBilans) {
			governanceTier = 'closed-bilan-protected'
			shielded = true
			protectedReason = 'Closed annual balance sheet / liasse fiscale strictly conserved'
		} else if (member.isSignedJustificatif && config.protectSignedJustificatifs) {
			governanceTier = 'signed-justificatif-protected'
			shielded = true
			protectedReason = 'Signed / locked justificatif or 10-year fiscal original strictly conserved'
		} else if (isSurvivor) {
			governanceTier = member.isFecArchive
				? 'fec-archive-protected'
				: (member.isClosedBilan
					? 'closed-bilan-protected'
					: (member.isSignedJustificatif
						? 'signed-justificatif-protected'
						: (member.isStaleAccountingExport ? 'stale-accounting-export' : 'scanned-or-reexport-copy')))
			shielded = true
			protectedReason = 'Canonical accounting & compliance survivor retained'
		} else if (override === 'prune') {
			governanceTier = member.isStaleAccountingExport ? 'stale-accounting-export' : 'scanned-or-reexport-copy'
			action = config.strategy === 'hardlink-immutable-archives' && !member.isMutableWorkbook && !survivor.isFecArchive && member.family !== 'fec-statutory-exports'
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
		} else if (member.isFecArchive) {
			governanceTier = 'fec-archive-protected'
			action = 'delete'
			reclaimableBytes += member.size
			deleteTargetsCount += 1
		} else if (member.isClosedBilan) {
			governanceTier = 'closed-bilan-protected'
			action = 'delete'
			reclaimableBytes += member.size
			deleteTargetsCount += 1
		} else if (member.isSignedJustificatif) {
			governanceTier = 'signed-justificatif-protected'
			action = 'delete'
			reclaimableBytes += member.size
			deleteTargetsCount += 1
		} else if (
			config.keepRecentClosingDays > 0
			&& member.ageDays !== null
			&& member.ageDays < config.keepRecentClosingDays
		) {
			governanceTier = member.isStaleAccountingExport ? 'stale-accounting-export' : 'scanned-or-reexport-copy'
			shielded = true
			protectedReason = `Within ${config.keepRecentClosingDays}-day fiscal closing grace window`
		} else if (member.isStaleAccountingExport) {
			governanceTier = 'stale-accounting-export'
			if (config.strategy === 'hardlink-immutable-archives' && !member.isMutableWorkbook && !survivor.isFecArchive && member.family !== 'fec-statutory-exports') {
				action = 'hardlink'
				hardlinkSavingsBytes += member.size
				hardlinkTargetsCount += 1
			} else {
				action = 'delete'
				deleteTargetsCount += 1
			}
			reclaimableBytes += member.size
		} else if (config.strategy === 'hardlink-immutable-archives' && !member.isMutableWorkbook && !survivor.isFecArchive && member.family !== 'fec-statutory-exports') {
			governanceTier = 'scanned-or-reexport-copy'
			action = 'hardlink'
			hardlinkSavingsBytes += member.size
			reclaimableBytes += member.size
			hardlinkTargetsCount += 1
		} else if (config.requireVerifiedArchiveAnchor && !hasVerifiedArchiveAnchor) {
			governanceTier = 'scanned-or-reexport-copy'
			shielded = true
			protectedReason = 'Blocked until a conserved FEC archive, signed original, or 10-year fiscal archive is verified'
		} else {
			governanceTier = member.isScannedOrReexportCopy ? 'scanned-or-reexport-copy' : 'stale-accounting-export'
			action = 'delete'
			reclaimableBytes += member.size
			deleteTargetsCount += 1
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

	let clusterVerdict = 'scanned-or-reexport-copy'
	if (members.some(m => m.governanceTier === 'fec-archive-protected')) {
		clusterVerdict = 'fec-archive-protected'
	} else if (members.some(m => m.governanceTier === 'signed-justificatif-protected')) {
		clusterVerdict = 'signed-justificatif-protected'
	} else if (members.some(m => m.governanceTier === 'closed-bilan-protected')) {
		clusterVerdict = 'closed-bilan-protected'
	} else if (members.some(m => m.governanceTier === 'stale-accounting-export')) {
		clusterVerdict = 'stale-accounting-export'
	}

	const hasReclaimable = (deleteTargetsCount + hardlinkTargetsCount) > 0
	const complianceTags = Array.from(new Set(members.map(m => m.complianceTag).filter(Boolean)))
	const crossGroupVariantsCount = correlationIndex.variantCountByStem.get(primaryStem) || 0

	const riskScore = (clusterVerdict === 'fec-archive-protected' ? 100 : 0)
		+ (clusterVerdict === 'signed-justificatif-protected' ? 96 : 0)
		+ (clusterVerdict === 'closed-bilan-protected' ? 92 : 0)
		+ (clusterVerdict === 'stale-accounting-export' ? 74 : 0)
		+ (hasReclaimable ? 20 : 0)

	return {
		id: group.id ?? primaryName,
		hash: group.hash || '',
		name: primaryName,
		siren: primarySiren,
		fiscalYear: primaryFiscalYear,
		documentStem: primaryStem,
		family,
		familyLabel: FINANCE_TAX_FAMILY_META[family]?.label || family,
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
		hasFecArchive: members.some(m => m.governanceTier === 'fec-archive-protected'),
		hasSignedJustificatif: members.some(m => m.governanceTier === 'signed-justificatif-protected'),
		hasClosedBilan: members.some(m => m.governanceTier === 'closed-bilan-protected'),
		hasScannedOrReexport: members.some(m => m.isScannedOrReexportCopy) || crossGroupVariantsCount > 0,
		hasStaleExport: members.some(m => m.governanceTier === 'stale-accounting-export'),
		hasVerifiedArchiveAnchor,
		crossGroupVariantsCount,
		complianceTags,
		members,
		group,
	}
}

/**
 * Audit duplicate groups across Financial, Accounting & Tax Compliance vaults.
 *
 * @param {Array<object>} groups Duplicate groups.
 * @param {object} [rawConfig] Audit configuration overrides.
 * @param {number} [referenceNowMs] Reference epoch ms for deterministic tests.
 * @return {object} Complete audit report with summary, family counts, and filtered clusters.
 */
export function auditFinanceTaxVault(groups, rawConfig = {}, referenceNowMs = Date.now()) {
	const config = normalizeFinanceTaxConfig(rawConfig)
	const sourceGroups = Array.isArray(groups) ? groups : []
	const domainGroups = sourceGroups.filter(isFinanceTaxGroup)
	const correlationIndex = buildFinanceTaxCorrelationIndex(domainGroups)

	const allClusters = domainGroups
		.map(group => auditSingleCluster(group, correlationIndex, config, referenceNowMs))
		.filter(Boolean)

	const minSizeBytes = config.minSizeKb * 1024
	const sizeFiltered = allClusters.filter(cluster => cluster.unitBytes >= minSizeBytes)

	const familyCounts = {
		all: sizeFiltered.length,
		'fec-statutory-exports': 0,
		'bank-statements-feeds': 0,
		'invoices-liasses-pdf': 0,
		'accounting-workbooks': 0,
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
			const matchesStem = cluster.documentStem.toLowerCase().includes(query)
			const matchesSiren = cluster.siren.toLowerCase().includes(query)
			const matchesFy = cluster.fiscalYear.toLowerCase().includes(query)
			const matchesTag = cluster.complianceTags.some(tag => tag.toLowerCase().includes(query))
			const matchesMember = cluster.members.some(m => m.lower.includes(query))
			if (!matchesName && !matchesStem && !matchesSiren && !matchesFy && !matchesTag && !matchesMember) {
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
	let totalFecArchiveClusters = 0
	let totalSignedJustificatifClusters = 0
	let totalClosedBilanClusters = 0
	let totalScannedReexportClusters = 0
	let totalStaleExportClusters = 0

	for (const cluster of filteredClusters) {
		rawDuplicateBytes += Math.max(0, cluster.totalBytes - cluster.unitBytes)
		reclaimableBytes += cluster.reclaimableBytes
		totalReclaimableCopiesCount += cluster.reclaimableTargetsCount
		totalShieldedCopiesCount += cluster.shieldedCount

		if (cluster.hasFecArchive) {
			totalFecArchiveClusters += 1
		}
		if (cluster.hasSignedJustificatif) {
			totalSignedJustificatifClusters += 1
		}
		if (cluster.hasClosedBilan) {
			totalClosedBilanClusters += 1
		}
		if (cluster.hasScannedOrReexport) {
			totalScannedReexportClusters += 1
		}
		if (cluster.hasStaleExport) {
			totalStaleExportClusters += 1
		}
	}

	const efficiencyPct = rawDuplicateBytes > 0
		? Math.min(100, Math.round((reclaimableBytes / rawDuplicateBytes) * 100))
		: 0

	const reclaimableGb = `${(reclaimableBytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`

	const familyBreakdown = FINANCE_TAX_FAMILIES
		.filter(id => id !== 'all')
		.map(id => ({
			id,
			label: FINANCE_TAX_FAMILY_META[id].label,
			shortLabel: FINANCE_TAX_FAMILY_META[id].shortLabel,
			clustersCount: familyCounts[id] || 0,
		}))

	return {
		schema: FINANCE_TAX_VAULT_SCHEMA,
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
			totalFecArchiveClusters,
			totalSignedJustificatifClusters,
			totalClosedBilanClusters,
			totalScannedReexportClusters,
			totalStaleExportClusters,
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
 * Build a safe POSIX DRY_RUN=1 remediation script for Financial, Accounting & Tax Compliance vaults.
 * Strictly blocks deletion or hardlinking of shielded FEC archives, signed/locked justificatifs,
 * and closed balance sheets/bilans, and never hardlinks mutable .xlsx/.xlsm/.ods/.csv workbooks.
 *
 * @param {object} auditResult Result from auditFinanceTaxVault.
 * @return {string} POSIX bash script.
 */
export function buildFinanceTaxRemediationScript(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# Financial, Accounting & Tax Compliance Vault Auditor',
		'# Safe POSIX Remediation Script (default DRY_RUN=1)',
		'# Run with DRY_RUN=0 ./finance-tax-vault-reclaim.sh only after verifying FEC archives, signed justificatifs, and closed bilans.',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'QUARANTINE_DIR="$' + '{QUARANTINE_DIR:-./.finance-tax-quarantine}"',
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
	const strategy = auditResult?.config?.strategy || 'prune-scans-and-reexports'
	for (const cluster of clusters) {
		const actions = (cluster.members || []).filter(m => !m.shielded && (m.action === 'delete' || m.action === 'hardlink'))
		if (actions.length === 0) {
			continue
		}
		lines.push(`# Cluster: ${cluster.name} | Family: ${cluster.familyLabel} | Survivor: ${cluster.survivorPath}`)
		for (const target of actions) {
			actionCount += 1
			if (target.action === 'hardlink' && !target.isMutableWorkbook) {
				lines.push(`run_cmd ln -f ${quotePosixPath(cluster.survivorPath)} ${quotePosixPath(target.normalized)}`)
			} else if (strategy === 'quarantine-scans-and-drafts') {
				lines.push('run_cmd mkdir -p "$QUARANTINE_DIR"')
				lines.push(`run_cmd mv -n ${quotePosixPath(target.normalized)} "$QUARANTINE_DIR/"`)
			} else {
				lines.push(`run_cmd rm -f ${quotePosixPath(target.normalized)}`)
			}
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('printf "No reclaimable scanned copies or stale accounting exports under current compliance protections.\\n"')
	} else {
		lines.push(`printf "Completed Financial & Tax Vault remediation plan (%d target actions, DRY_RUN=%s).\\n" "${actionCount}" "$DRY_RUN"`)
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe RFC-4180 CSV audit report.
 *
 * @param {object} auditResult Result from auditFinanceTaxVault.
 * @return {string} RFC-4180 CSV string.
 */
export function buildFinanceTaxCsvReport(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const headers = [
		'cluster_id',
		'cluster_name',
		'siren',
		'fiscal_year',
		'document_stem',
		'family',
		'cluster_verdict',
		'member_path',
		'artifact_kind',
		'compliance_role',
		'compliance_tag',
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
				cluster.siren || '',
				cluster.fiscalYear || '',
				cluster.documentStem,
				cluster.family,
				cluster.clusterVerdict,
				member.normalized,
				member.artifactKind,
				member.complianceRole,
				member.complianceTag || '',
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
 * @param {object} auditResult Result from auditFinanceTaxVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildFinanceTaxJsonManifest(auditResult) {
	const payload = {
		schema: FINANCE_TAX_VAULT_SCHEMA,
		generatedAt: new Date().toISOString(),
		config: auditResult?.config || FINANCE_TAX_DEFAULT_CONFIG,
		summary: auditResult?.summary || {},
		clusters: (auditResult?.clusters || []).map(cluster => ({
			id: cluster.id,
			name: cluster.name,
			siren: cluster.siren,
			fiscalYear: cluster.fiscalYear,
			documentStem: cluster.documentStem,
			family: cluster.family,
			clusterVerdict: cluster.clusterVerdict,
			unitBytes: cluster.unitBytes,
			totalBytes: cluster.totalBytes,
			reclaimableBytes: cluster.reclaimableBytes,
			survivorPath: cluster.survivorPath,
			hasFecArchive: cluster.hasFecArchive,
			hasSignedJustificatif: cluster.hasSignedJustificatif,
			hasClosedBilan: cluster.hasClosedBilan,
			hasScannedOrReexport: cluster.hasScannedOrReexport,
			hasStaleExport: cluster.hasStaleExport,
			hasVerifiedArchiveAnchor: cluster.hasVerifiedArchiveAnchor,
			crossGroupVariantsCount: cluster.crossGroupVariantsCount,
			complianceTags: cluster.complianceTags,
			members: (cluster.members || []).map(member => ({
				path: member.normalized,
				artifactKind: member.artifactKind,
				complianceRole: member.complianceRole,
				complianceTag: member.complianceTag || '',
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
 * Generate a Nextcloud/rsync .sync-exclude.lst rule set for temporary accounting exports,
 * Office workbook lockfiles, OCR scratch scans, and staging FEC/bank re-exports.
 *
 * @return {string} Line-delimited .sync-exclude.lst rules.
 */
export function buildFinanceTaxSyncExcludeList() {
	return [
		'# Nextcloud / rsync exclusion rules for Financial, Accounting & Tax Staging Scratch & Lockfiles',
		'~$*.xlsx',
		'~$*.xlsm',
		'.~lock.*.ods#',
		'ocr_tmp/',
		'inbox_scan/',
		'reexports/',
		'exports_tmp/',
		'staging/',
		'brouillons/',
		'*_reexport.txt',
		'*_reexport.csv',
		'*_reexport.pdf',
		'*_scan.pdf',
		'*_ocr.pdf',
		'*_brouillon.xlsx',
		'*.tmp',
	].join('\n')
}
