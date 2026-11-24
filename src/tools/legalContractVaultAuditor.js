/**
 * Pure Legal, Compliance & Signed Contract Vault Auditor.
 * Classifies and audits duplicate clusters across 4 Legal & Compliance Vault families:
 * - Executed & Signed Contracts (*.pdf signed/countersigned/docusign/yousign, *.p7s/*.p7m PAdES/CAdES detached signatures)
 * - Redline & Word/ODT Draft Revisions (*.docx, *.odt, _v1/_redline/_trackchanges/_clean)
 * - Compliance & Evidence Bundles (*.zip/*.tar audit packs, KYC/RIB/KBIS scans)
 * - Duplicate Scanned Attachments (scan_, IMG_, duplicate exhibit PDFs)
 *
 * Groups artifacts deterministically by counterparty/matter + contract ID + execution state,
 * shields countersigned, legal-hold, and PAdES/CAdES-verified originals by default,
 * and computes safe reclaimable GB plus POSIX DRY_RUN=1 remediation scripts, CWE-1236 CSV exports,
 * JSON manifests, and .sync-exclude.lst rules.
 *
 * Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const LEGAL_CONTRACT_VAULT_SCHEMA = 'duplicatefinder.legal-contract-vault-auditor.v1'

export const LEGAL_CONTRACT_FAMILIES = Object.freeze([
	'all',
	'executed-signed-contracts',
	'redline-draft-revisions',
	'compliance-evidence-bundles',
	'scanned-exhibit-attachments',
])

export const LEGAL_CONTRACT_FAMILY_META = Object.freeze({
	'executed-signed-contracts': {
		id: 'executed-signed-contracts',
		label: 'Executed & Signed Contracts',
		shortLabel: 'Signed (.pdf signed/countersigned/docusign/yousign, .p7s/.p7m)',
	},
	'redline-draft-revisions': {
		id: 'redline-draft-revisions',
		label: 'Redline & Draft Revisions',
		shortLabel: 'Drafts (.docx/.odt, _v1/_redline/_trackchanges/_clean)',
	},
	'compliance-evidence-bundles': {
		id: 'compliance-evidence-bundles',
		label: 'Compliance & Evidence Bundles',
		shortLabel: 'Compliance (.zip/.tar audit packs, KYC/RIB/KBIS scans)',
	},
	'scanned-exhibit-attachments': {
		id: 'scanned-exhibit-attachments',
		label: 'Scanned Exhibits & Attachments',
		shortLabel: 'Scans (scan_, IMG_, duplicate exhibit PDFs)',
	},
})

export const LEGAL_CONTRACT_STRATEGIES = Object.freeze([
	'prune-drafts-and-duplicate-scans',
	'consolidate-contract-vault-hardlinks',
	'prune-redlines-and-scans-only',
])

export const LEGAL_CONTRACT_SURVIVOR_RULES = Object.freeze([
	'countersigned-pades-first',
	'latest-revision-first',
	'shortest-path',
])

export const LEGAL_CONTRACT_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'countersigned',
	'legal-hold-pades',
	'redline-draft',
	'compliance-bundle',
	'scanned-exhibit',
	'shielded',
])

export const LEGAL_CONTRACT_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const LEGAL_CONTRACT_PRESETS = Object.freeze([
	{
		id: 'all-legal-contract-audit',
		name: 'All Legal & Contract Audit',
		description: 'Audit executed contracts, redline drafts, compliance/KYC bundles, and duplicate scanned exhibits while shielding countersigned, legal-hold, and PAdES-verified originals.',
		familyFilter: 'all',
		strategy: 'prune-drafts-and-duplicate-scans',
		survivorRule: 'countersigned-pades-first',
		protectCountersignedOriginals: true,
		protectLegalHoldPades: true,
		staleDraftDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'prune-redlines-and-scans',
		name: 'Prune Redlines & Scanned Exhibits',
		description: 'Reclaim duplicate _redline/_trackchanges/_clean drafts and redundant scan_/IMG_ exhibit copies older than the retention window while preserving executed originals.',
		familyFilter: 'redline-draft-revisions',
		strategy: 'prune-redlines-and-scans-only',
		survivorRule: 'countersigned-pades-first',
		protectCountersignedOriginals: true,
		protectLegalHoldPades: true,
		staleDraftDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'consolidate-contract-vault-hardlinks',
		name: 'Hardlink-Consolidate Vault Copies',
		description: 'Deduplicate identical contract copies, closing binders, and compliance bundles onto canonical anchors via POSIX hardlinks while keeping legal-hold items immutable.',
		familyFilter: 'all',
		strategy: 'consolidate-contract-vault-hardlinks',
		survivorRule: 'countersigned-pades-first',
		protectCountersignedOriginals: true,
		protectLegalHoldPades: true,
		staleDraftDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'audit-executed-signed-contracts',
		name: 'Executed & Signed Contracts',
		description: 'Audit duplicate signed/countersigned PDFs (DocuSign, Yousign, AdobeSign) and .p7s/.p7m PAdES/CAdES detached signatures grouped by counterparty, contract ID, and execution state.',
		familyFilter: 'executed-signed-contracts',
		strategy: 'prune-drafts-and-duplicate-scans',
		survivorRule: 'countersigned-pades-first',
		protectCountersignedOriginals: true,
		protectLegalHoldPades: true,
		staleDraftDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'audit-compliance-evidence-bundles',
		name: 'Compliance & KYC Bundles',
		description: 'Audit duplicate .zip/.tar audit packs, closing binders, and KYC/RIB/KBIS compliance scans across matter folders and staging exports.',
		familyFilter: 'compliance-evidence-bundles',
		strategy: 'prune-drafts-and-duplicate-scans',
		survivorRule: 'latest-revision-first',
		protectCountersignedOriginals: true,
		protectLegalHoldPades: true,
		staleDraftDays: 14,
		minSizeMb: 0,
	},
])

const DETACHED_SIGNATURE_EXT_SET = new Set([
	'p7s',
	'p7m',
	'p7c',
	'sig',
	'asc',
	'tsr',
	'tst',
])

const DRAFT_WORD_EXT_SET = new Set([
	'docx',
	'doc',
	'odt',
	'rtf',
])

const ARCHIVE_BUNDLE_EXT_SET = new Set([
	'zip',
	'tar',
	'tar.gz',
	'tgz',
	'7z',
])

const SCAN_IMAGE_EXT_SET = new Set([
	'jpg',
	'jpeg',
	'png',
	'tif',
	'tiff',
])

const SIGNED_CONTRACT_SIGNAL_RE = /(?:countersigned|fully[_-]?executed|executed|signed|docusign|yousign|adobesign|universign|certsign|eidas|pades|cades|fe[_-]?final|signe(?:e|s)?|paraphe)/i
const COUNTERSIGNED_SIGNAL_RE = /(?:countersigned|fully[_-]?executed|docusign|yousign|adobesign|universign|certsign|eidas|pades|cades|contresigne)/i
const LEGAL_HOLD_PATH_RE = /(?:legal[_-]?hold|litigation[_-]?hold|subpoena|e-?discovery|preservation[_-]?hold|regulatory[_-]?hold|hold[_-]?vault|contentieux|mise[_-]?en[_-]?demeure)/i
const PADES_VERIFIED_SIGNAL_RE = /(?:pades|cades|eidas|qualified[_-]?sig|verified[_-]?sig|ltv[_-]?signed|timestamped)/i

const REDLINE_DRAFT_SIGNAL_RE = /(?:[._\s-](?:v\d{1,3}|ver\d{1,3}|rev\d{1,3}|redline|redlined|trackchanges|track[_-]?changes|clean|markup|draft|brouillon|commented|comments|compare|comparison|blackline)(?:[._\s-]|$))/i
const LEGAL_DOC_CONTEXT_RE = /(?:legal|contract|contracts|contrat|contrats|agreement|msa|nda|sla|dpa|sow|poa|amendment|avenant|addendum|bail|lease|deed|charter|bylaws|statuts|counsel|matter|matters|dossier|litigation|compliance|corporate|procurement|vendor|client|counterparty|closing|binder|signature|signed|executed|redline)/i

const COMPLIANCE_BUNDLE_SIGNAL_RE = /(?:compliance|audit[_-]?pack|audit[_-]?bundle|evidence[_-]?pack|evidence[_-]?bundle|closing[_-]?binder|dataroom|data[_-]?room|due[_-]?diligence|kyc|kbis|k-bis|rib|iban|aml|ubo|beneficial[_-]?owner|attestation|vigilance|urssaf|soc2|iso27001|gdpr|rgpd|dpo|certificate|certificat|tax[_-]?clearance|insurance[_-]?cert|rc[_-]?pro)/i
const SCANNED_ATTACHMENT_NAME_RE = /^(?:scan[_-]?|img[_-]?|scanned[_-]?|doc[_-]?scan|photo[_-]?scan|exhibit[_-]?|annex(?:e)?[_-]?|schedule[_-]?|appendix[_-]?|pj[_-]?|piece[_-]?jointe)/i
const SCANNED_EXHIBIT_CONTEXT_RE = /(?:exhibit|exhibits|annex|annexe|annexes|schedule|appendix|attachment|attachments|pieces?[_-]?jointes?|scans?|scanned)/i

const CANONICAL_LEGAL_VAULT_PATH_RE = /(\/(?:legal[_-]?vault|contract[_-]?vault|contracts?|executed|signed|signed[_-]?contracts?|canonical|masters?|matters?|dossiers?|compliance[_-]?vault|legal[_-]?hold|litigation[_-]?hold|corporate[_-]?vault|closing[_-]?binders?|__groupfolders\/\d+\/(?:legal|contracts?|compliance|matters?))(?:\/|$))/i
const EXPORT_STAGING_PATH_RE = /(\/(?:downloads?|telechargements?|tmp|temp|scratch|staging|incoming|inbox|mail[_-]?attachments?|email[_-]?exports?|dropzone|wetransfer|desktop|review[_-]?exports?|shared[_-]?tmp)(?:\/|$))/i

const CONTRACT_ID_RE = /(?:^|[^a-z0-9])((?:MSA|NDA|SLA|DPA|SOW|CTR|CNT|AGR|PO|AMD|AVN|LGL|MAT|CASE|REF)[_-]?\d{2,4}(?:[_-]\d{2,6})?|\d{4}[_-](?:MSA|NDA|SLA|DPA|SOW|CTR|CNT|AGR|LGL)[_-]\d{2,6})(?=$|[^a-z0-9])/i
const REVISION_RE = /(?:^|[._\s-])(?:v|ver|rev|r|draft)[._-]?(\d{1,3})(?:[._\s-]|$)/i

const IGNORED_MATTER_SEGMENTS = new Set([
	'files',
	'legal',
	'legal-vault',
	'contracts',
	'contract',
	'contract-vault',
	'contrats',
	'contrat',
	'executed',
	'signed',
	'signed-contracts',
	'countersigned',
	'drafts',
	'redlines',
	'compliance',
	'compliance-vault',
	'evidence',
	'audit',
	'audits',
	'kyc',
	'kbis',
	'rib',
	'exhibits',
	'annexes',
	'attachments',
	'scans',
	'scanned',
	'matters',
	'matter',
	'dossiers',
	'dossier',
	'legal-hold',
	'litigation-hold',
	'corporate-vault',
	'closing-binders',
	'canonical',
	'masters',
	'master',
	'archive',
	'exports',
	'staging',
	'downloads',
	'telechargements',
	'inbox',
	'incoming',
	'tmp',
	'temp',
	'scratch',
	'desktop',
	'__groupfolders',
	'users',
	'home',
	'var',
	'www',
	'nextcloud',
])

/**
 * Safely normalize a path string for deterministic inspection.
 *
 * @param {string} rawPath File path.
 * @return {string} Normalized POSIX-like path.
 */
function safeNormalizePath(rawPath) {
	if (!rawPath || typeof rawPath !== 'string') {
		return ''
	}
	return normalizePathForDiff(rawPath).replace(/\\/g, '/')
}

/**
 * Extract the basename from a normalized path.
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
 * Extract the directory path from a normalized path.
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
 * Extract lowercase extension including chained archive and signature extensions (.tar.gz, .pdf.p7s).
 *
 * @param {string} basename File basename.
 * @return {string} Lowercase extension without leading dot.
 */
function getExtension(basename) {
	if (!basename || typeof basename !== 'string') {
		return ''
	}
	const lower = basename.toLowerCase()
	if (lower.endsWith('.tar.gz')) {
		return 'tar.gz'
	}
	const dotIdx = lower.lastIndexOf('.')
	if (dotIdx <= 0 || dotIdx === lower.length - 1) {
		return ''
	}
	return lower.slice(dotIdx + 1)
}

/**
 * Normalize epoch timestamp in seconds.
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
 * Extract counterparty or legal matter slug from path or basename.
 *
 * @param {string} basename File basename.
 * @param {string} fullPath Full normalized path.
 * @return {string} Normalized counterparty/matter slug.
 */
export function extractCounterpartyMatter(basename, fullPath = '') {
	const segments = safeNormalizePath(fullPath).split('/').filter(Boolean)
	const dirSegments = segments.slice(0, -1)

	for (let i = 0; i < dirSegments.length; i += 1) {
		const segLower = dirSegments[i].toLowerCase()
		if (
			/^(?:legal[_-]?vault|contract[_-]?vault|contracts?|contrats?|matters?|dossiers?|compliance[_-]?vault|legal[_-]?hold|litigation[_-]?hold|clients?|vendors?|counterpart(?:y|ies)|closing[_-]?binders?|executed|signed)$/.test(segLower)
			&& i + 1 < dirSegments.length
		) {
			const nextSeg = dirSegments[i + 1].toLowerCase()
			if (nextSeg && !IGNORED_MATTER_SEGMENTS.has(nextSeg) && !/^\d+$/.test(nextSeg)) {
				return nextSeg.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'legal-matter'
			}
		}
	}

	for (let i = dirSegments.length - 1; i >= 0; i -= 1) {
		const clean = dirSegments[i].toLowerCase()
		if (clean && !IGNORED_MATTER_SEGMENTS.has(clean) && !/^\d+$/.test(clean)) {
			return clean.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'legal-matter'
		}
	}

	return normalizeContractSignature(basename)
}

/**
 * Extract deterministic contract or matter ID from basename or path (e.g. MSA-2026-042).
 *
 * @param {string} basename File basename.
 * @param {string} fullPath Full normalized path.
 * @return {string} Normalized contract ID or 'UNASSIGNED-ID'.
 */
export function extractContractId(basename, fullPath = '') {
	const match = CONTRACT_ID_RE.exec(basename) || CONTRACT_ID_RE.exec(fullPath)
	if (!match) {
		return 'UNASSIGNED-ID'
	}
	return match[1].toUpperCase().replace(/_/g, '-')
}

/**
 * Parse draft revision number from filename or path.
 *
 * @param {string} basename File basename.
 * @param {string} fullPath Full normalized path.
 * @return {number} Parsed revision number or 0.
 */
export function parseContractRevision(basename, fullPath = '') {
	const match = REVISION_RE.exec(basename) || REVISION_RE.exec(fullPath)
	if (!match) {
		return 0
	}
	const num = Number.parseInt(match[1], 10)
	return Number.isFinite(num) && num > 0 ? num : 0
}

/**
 * Normalize a legal contract, redline draft, compliance bundle, or scanned exhibit filename into a signature slug.
 *
 * @param {string} basename File basename.
 * @return {string} Normalized signature slug.
 */
export function normalizeContractSignature(basename) {
	if (!basename || typeof basename !== 'string') {
		return 'untitled-contract'
	}
	let stem = basename.trim()
	stem = stem.replace(/\.(?:tar\.gz|pdf\.p7s|pdf\.p7m|p7s|p7m)$/i, '')
	const dotIdx = stem.lastIndexOf('.')
	if (dotIdx > 0) {
		stem = stem.slice(0, dotIdx)
	}

	let prev = ''
	while (prev !== stem) {
		prev = stem
		stem = stem.replace(/(?:\s*\(\d+\)|[._\s-]+(?:signed|countersigned|executed|fully[_-]?executed|docusign|yousign|adobesign|redline|redlined|trackchanges|track[_-]?changes|clean|markup|draft|copy|backup|bak|dup|duplicate|old|export|tmp|final|v\d+|rev\d+|\d{4}[-_]\d{2}[-_]\d{2}))+$/gi, '')
	}
	stem = stem
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')

	return stem || 'legal-artifact'
}

/**
 * Detect execution state label for grouping and governance display.
 *
 * @param {object} flags Classification flags.
 * @return {string} Deterministic execution state slug.
 */
function detectExecutionState(flags) {
	if (flags.isLegalHold) {
		return 'legal-hold'
	}
	if (flags.isPadesVerified) {
		return 'countersigned-pades'
	}
	if (flags.isCountersigned) {
		return 'countersigned'
	}
	if (flags.family === 'executed-signed-contracts') {
		return 'signed'
	}
	if (flags.family === 'redline-draft-revisions') {
		return flags.isCleanDraft ? 'clean-draft' : 'redline-draft'
	}
	if (flags.family === 'compliance-evidence-bundles') {
		return 'evidence-pack'
	}
	return 'scanned-exhibit'
}

/**
 * Detect e-signature platform or legal tool and format badge for display.
 *
 * @param {string} ext File extension.
 * @param {string} combinedContext Path and basename string.
 * @param {string} family Assigned family ID.
 * @param {boolean} isLegalHold Whether file is under legal hold.
 * @param {boolean} isPadesVerified Whether file is PAdES/CAdES verified.
 * @param {boolean} isCountersigned Whether file is countersigned.
 * @return {object} Signing/legal tool label and format badge.
 */
function detectLegalToolAndFormat(ext, combinedContext, family, isLegalHold, isPadesVerified, isCountersigned) {
	const lower = combinedContext.toLowerCase()
	let legalTool = 'Legal Vault'

	if (ext === 'p7s' || ext === 'p7m' || ext === 'p7c' || ext === 'tsr' || ext === 'tst') {
		legalTool = 'PAdES / CAdES PKI'
	} else if (lower.includes('docusign')) {
		legalTool = 'DocuSign eSignature'
	} else if (lower.includes('yousign')) {
		legalTool = 'Yousign eIDAS'
	} else if (lower.includes('adobesign')) {
		legalTool = 'Adobe Acrobat Sign'
	} else if (lower.includes('universign') || lower.includes('certsign')) {
		legalTool = 'eIDAS Qualified Sign'
	} else if (family === 'redline-draft-revisions') {
		legalTool = ext === 'odt' ? 'LibreOffice Redline' : 'Word Track Changes'
	} else if (family === 'compliance-evidence-bundles') {
		legalTool = ARCHIVE_BUNDLE_EXT_SET.has(ext) ? 'Audit / Closing Pack' : 'KYC / Compliance Scan'
	} else if (family === 'scanned-exhibit-attachments') {
		legalTool = 'Scanned Exhibit'
	} else if (family === 'executed-signed-contracts') {
		legalTool = 'Executed PDF Contract'
	}

	let formatBadge = ext ? `.${ext}` : 'legal'
	if (isLegalHold) {
		formatBadge = 'LEGAL HOLD'
	} else if (isPadesVerified) {
		formatBadge = ext === 'p7s' || ext === 'p7m' ? `PAdES .${ext}` : 'PAdES Verified'
	} else if (isCountersigned) {
		formatBadge = 'Countersigned PDF'
	} else if (family === 'redline-draft-revisions') {
		formatBadge = `Draft .${ext}`
	} else if (family === 'compliance-evidence-bundles') {
		formatBadge = ARCHIVE_BUNDLE_EXT_SET.has(ext) ? `Pack .${ext}` : `KYC .${ext}`
	} else if (family === 'scanned-exhibit-attachments') {
		formatBadge = `Scan .${ext}`
	}

	return { legalTool, formatBadge }
}

/**
 * Classify a single file into one of the 4 Legal, Compliance & Signed Contract Vault families.
 *
 * @param {object} file Duplicate file entry.
 * @return {object|null} Classification metadata or null if unrelated.
 */
export function classifyLegalContractFile(file) {
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

	const isDetachedSignature = DETACHED_SIGNATURE_EXT_SET.has(ext)
	const isLegalHold = LEGAL_HOLD_PATH_RE.test(combinedContext)
	const hasPadesSignal = isDetachedSignature || PADES_VERIFIED_SIGNAL_RE.test(combinedContext)
	const hasSignedSignal = SIGNED_CONTRACT_SIGNAL_RE.test(combinedContext)
	const hasCountersignedSignal = COUNTERSIGNED_SIGNAL_RE.test(combinedContext)
	const hasComplianceSignal = COMPLIANCE_BUNDLE_SIGNAL_RE.test(combinedContext)
	const hasRedlineSignal = REDLINE_DRAFT_SIGNAL_RE.test(basename)
	const hasLegalContext = LEGAL_DOC_CONTEXT_RE.test(combinedContext)
	const hasScanName = SCANNED_ATTACHMENT_NAME_RE.test(basename)
	const hasExhibitContext = SCANNED_EXHIBIT_CONTEXT_RE.test(combinedContext)

	const isExecutedSigned = isDetachedSignature
		|| (ext === 'pdf' && (hasSignedSignal || hasPadesSignal) && !hasRedlineSignal)

	const isComplianceBundle = !isExecutedSigned && (
		(ARCHIVE_BUNDLE_EXT_SET.has(ext) && (hasComplianceSignal || hasLegalContext))
		|| ((ext === 'pdf' || SCAN_IMAGE_EXT_SET.has(ext)) && hasComplianceSignal)
	)

	const isRedlineDraft = !isExecutedSigned && !isComplianceBundle && (
		(DRAFT_WORD_EXT_SET.has(ext) && (hasRedlineSignal || hasLegalContext))
		|| (ext === 'pdf' && hasRedlineSignal && hasLegalContext)
	)

	const isScannedExhibit = !isExecutedSigned && !isComplianceBundle && !isRedlineDraft && (
		((ext === 'pdf' || SCAN_IMAGE_EXT_SET.has(ext)) && hasScanName && (hasLegalContext || hasExhibitContext))
		|| (ext === 'pdf' && hasExhibitContext && hasLegalContext)
	)

	if (!isExecutedSigned && !isComplianceBundle && !isRedlineDraft && !isScannedExhibit) {
		return null
	}

	let family = 'executed-signed-contracts'
	let artifactKind = 'executed-contract'
	if (isRedlineDraft) {
		family = 'redline-draft-revisions'
		artifactKind = 'redline-draft'
	} else if (isComplianceBundle) {
		family = 'compliance-evidence-bundles'
		artifactKind = ARCHIVE_BUNDLE_EXT_SET.has(ext) ? 'audit-pack' : 'kyc-document'
	} else if (isScannedExhibit) {
		family = 'scanned-exhibit-attachments'
		artifactKind = 'scanned-exhibit'
	} else if (isDetachedSignature) {
		artifactKind = 'detached-signature'
	}

	const counterpartyMatter = extractCounterpartyMatter(basename, path)
	const contractId = extractContractId(basename, path)
	const revisionNumber = parseContractRevision(basename, path)
	const contractSignature = normalizeContractSignature(basename)

	const inExportStaging = EXPORT_STAGING_PATH_RE.test(path)
	const inCanonicalVault = CANONICAL_LEGAL_VAULT_PATH_RE.test(path) && !inExportStaging

	const isPadesVerified = isExecutedSigned && hasPadesSignal && !inExportStaging
	const isCountersigned = isExecutedSigned && (hasCountersignedSignal || isDetachedSignature)
	const isCountersignedOriginal = isExecutedSigned && (isCountersigned || inCanonicalVault) && !inExportStaging
	const isLegalHoldOrPades = isLegalHold || isPadesVerified
	const isCleanDraft = isRedlineDraft && /(?:[._\s-]clean(?:[._\s-]|$))/i.test(basename)

	const executionState = detectExecutionState({
		family,
		isLegalHold,
		isPadesVerified,
		isCountersigned,
		isCleanDraft,
	})

	const { legalTool, formatBadge } = detectLegalToolAndFormat(
		ext,
		combinedContext,
		family,
		isLegalHold,
		isPadesVerified,
		isCountersigned
	)

	const dirname = getDirname(path)
	const vaultKey = `${counterpartyMatter}/${contractId}/${executionState}`

	return {
		path,
		dirname,
		basename,
		ext,
		family,
		artifactKind,
		legalTool,
		formatBadge,
		counterpartyMatter,
		contractId,
		executionState,
		revisionNumber,
		contractSignature,
		mtimeSec,
		isDetachedSignature,
		isLegalHold,
		isPadesVerified,
		isCountersigned,
		isCountersignedOriginal,
		isLegalHoldOrPades,
		inCanonicalVault,
		inExportStaging,
		vaultKey,
	}
}

/**
 * Format bytes as GB string with 2 decimals (e.g. "1.45 GB").
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
 * Compute reference timestamp from duplicate groups for deterministic age calculations.
 *
 * @param {Array<object>} duplicateGroups Raw duplicate groups.
 * @return {number} Reference timestamp in epoch seconds.
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
 * Score a file copy's authority as canonical legal survivor anchor (0-100).
 *
 * @param {object} member Classified file member.
 * @param {string} survivorRule Selected survivor rule.
 * @return {number} Authority score 0-100.
 */
function computeMemberAuthorityScore(member, survivorRule) {
	let score = 40

	if (member.meta.isLegalHold) {
		score += 36
	}
	if (member.meta.isPadesVerified) {
		score += 30
	} else if (member.meta.isCountersignedOriginal) {
		score += 24
	}
	if (member.meta.inCanonicalVault) {
		score += 18
	}
	if (member.meta.inExportStaging) {
		score -= 28
	}
	if (member.meta.family === 'scanned-exhibit-attachments') {
		score -= 10
	}
	if (member.isInOriginFolder) {
		score += 18
	}

	if (survivorRule === 'latest-revision-first') {
		if (member.meta.revisionNumber > 0) {
			score += Math.min(16, member.meta.revisionNumber * 3)
		}
	} else if (survivorRule === 'shortest-path') {
		const depth = member.meta.path.split('/').filter(Boolean).length
		score += Math.max(-15, 18 - depth * 3)
	}

	return Math.max(5, Math.min(100, Math.round(score)))
}

/**
 * Compare two members to pick the canonical legal survivor.
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
	if (a.meta.isLegalHold !== b.meta.isLegalHold) {
		return a.meta.isLegalHold ? -1 : 1
	}
	if (a.meta.isPadesVerified !== b.meta.isPadesVerified) {
		return a.meta.isPadesVerified ? -1 : 1
	}
	if (a.meta.isCountersignedOriginal !== b.meta.isCountersignedOriginal) {
		return a.meta.isCountersignedOriginal ? -1 : 1
	}

	if (survivorRule === 'latest-revision-first') {
		if (a.meta.revisionNumber !== b.meta.revisionNumber) {
			return b.meta.revisionNumber - a.meta.revisionNumber
		}
		if (a.mtimeSec !== b.mtimeSec) {
			return b.mtimeSec - a.mtimeSec
		}
	} else if (survivorRule === 'shortest-path') {
		if (a.meta.path.length !== b.meta.path.length) {
			return a.meta.path.length - b.meta.path.length
		}
	}

	if (a.authorityScore !== b.authorityScore) {
		return b.authorityScore - a.authorityScore
	}
	if (a.meta.inCanonicalVault !== b.meta.inCanonicalVault) {
		return a.meta.inCanonicalVault ? -1 : 1
	}
	if (a.mtimeSec !== b.mtimeSec) {
		return b.mtimeSec - a.mtimeSec
	}
	return a.meta.path.localeCompare(b.meta.path)
}

/**
 * Analyze duplicate groups for Legal, Compliance & Signed Contract Vault governance.
 *
 * @param {Array<object>} duplicateGroups Array of duplicate group objects.
 * @param {object} [options] Analysis configuration options.
 * @return {object} Deterministic audit report.
 */
export function analyzeLegalContractVault(duplicateGroups, options = {}) {
	const groups = Array.isArray(duplicateGroups) ? duplicateGroups.filter(Boolean) : []
	const familyFilter = LEGAL_CONTRACT_FAMILIES.includes(options.familyFilter) ? options.familyFilter : 'all'
	const verdictFilter = LEGAL_CONTRACT_VERDICT_FILTERS.includes(options.verdictFilter) ? options.verdictFilter : 'all'
	const sortMode = LEGAL_CONTRACT_SORT_MODES.includes(options.sortMode) ? options.sortMode : 'reclaim_desc'
	const strategy = LEGAL_CONTRACT_STRATEGIES.includes(options.strategy)
		? options.strategy
		: 'prune-drafts-and-duplicate-scans'
	const survivorRule = LEGAL_CONTRACT_SURVIVOR_RULES.includes(options.survivorRule)
		? options.survivorRule
		: 'countersigned-pades-first'

	const protectCountersignedOriginals = options.protectCountersignedOriginals !== false
	const protectLegalHoldPades = options.protectLegalHoldPades !== false
	const staleDraftDays = Number.isFinite(Number(options.staleDraftDays)) && Number(options.staleDraftDays) >= 0
		? Number(options.staleDraftDays)
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

	const allClusters = []

	for (const group of groups) {
		const files = Array.isArray(group.files) ? group.files.filter(Boolean) : []
		if (files.length < 2) {
			continue
		}

		const classifiedMembers = []
		for (const file of files) {
			const meta = classifyLegalContractFile(file)
			if (!meta) {
				continue
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

		if (classifiedMembers.length < 2) {
			continue
		}

		classifiedMembers.sort((a, b) => compareSurvivorCandidates(a, b, survivorRule))
		const survivor = classifiedMembers[0]
		const primaryMeta = survivor.meta
		const family = primaryMeta.family
		const familyMeta = LEGAL_CONTRACT_FAMILY_META[family] || LEGAL_CONTRACT_FAMILY_META['executed-signed-contracts']

		const hasCountersignedOriginal = classifiedMembers.some(m => m.meta.isCountersignedOriginal)
		const hasLegalHoldOrPades = classifiedMembers.some(m => m.meta.isLegalHoldOrPades)
		const hasLegalHold = classifiedMembers.some(m => m.meta.isLegalHold)
		const hasPadesSignature = classifiedMembers.some(m => m.meta.isPadesVerified)

		let reclaimableBytes = 0
		let reclaimableCopiesCount = 0
		let consolidatableCopiesCount = 0
		let shieldedCopiesCount = 0

		classifiedMembers.forEach((member, idx) => {
			const override = memberOverrides[member.selectionKey] || 'auto'

			if (idx === 0) {
				member.verdict = 'keep-canonical-survivor'
				member.actionType = 'keep'
				if (member.meta.isLegalHold) {
					member.verdictReason = 'Immutable Legal Hold preservation anchor'
				} else if (member.meta.isPadesVerified) {
					member.verdictReason = `Canonical ${member.meta.formatBadge} cryptographic anchor`
				} else if (member.meta.isCountersignedOriginal) {
					member.verdictReason = 'Primary countersigned contract vault anchor'
				} else if (member.meta.inCanonicalVault) {
					member.verdictReason = 'Primary legal matter vault anchor'
				} else {
					member.verdictReason = 'Highest-authority legal artifact survivor'
				}
				shieldedCopiesCount += 1
				return
			}

			if (override === 'keep') {
				member.verdict = 'blocked-manual-shield'
				member.actionType = 'keep'
				member.verdictReason = 'Manually shielded by legal counsel'
				shieldedCopiesCount += 1
				return
			}

			if (override === 'prune') {
				member.verdict = strategy === 'consolidate-contract-vault-hardlinks'
					? 'consolidate-hardlink-legal-asset'
					: 'reclaim-duplicate-legal-asset'
				member.actionType = strategy === 'consolidate-contract-vault-hardlinks' ? 'hardlink' : 'prune'
				member.verdictReason = 'Counsel override: marked for controlled remediation'
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

			// Legal hold copies are always shielded by default, even under hardlink consolidation
			if (protectLegalHoldPades && member.meta.isLegalHold) {
				member.verdict = 'blocked-legal-hold'
				member.actionType = 'keep'
				member.verdictReason = `Legal Hold preservation guard active for ${member.meta.counterpartyMatter}`
				shieldedCopiesCount += 1
				return
			}

			// Shield PAdES/CAdES verified detached/enveloped originals in prune modes
			if (protectLegalHoldPades && member.meta.isPadesVerified && strategy !== 'consolidate-contract-vault-hardlinks') {
				member.verdict = 'blocked-pades-verified'
				member.actionType = 'keep'
				member.verdictReason = `PAdES/CAdES cryptographic signature shielded (${member.meta.contractId})`
				shieldedCopiesCount += 1
				return
			}

			// Shield countersigned canonical originals inside canonical legal vault in prune modes
			if (protectCountersignedOriginals && member.meta.isCountersignedOriginal && strategy !== 'consolidate-contract-vault-hardlinks') {
				member.verdict = 'blocked-countersigned-original'
				member.actionType = 'keep'
				member.verdictReason = `Countersigned original shielded in vault for ${member.meta.counterpartyMatter}`
				shieldedCopiesCount += 1
				return
			}

			// Protect very recent redline drafts inside active matter directories
			if (
				family === 'redline-draft-revisions'
				&& !member.meta.inExportStaging
				&& member.ageDays < staleDraftDays
			) {
				member.verdict = 'blocked-recent-redline-draft'
				member.actionType = 'keep'
				member.verdictReason = `Active negotiation draft (${member.ageDays}d < ${staleDraftDays}d window)`
				shieldedCopiesCount += 1
				return
			}

			// Strategy: hardlink-consolidate contract vault copies
			if (strategy === 'consolidate-contract-vault-hardlinks') {
				member.verdict = 'consolidate-hardlink-legal-asset'
				member.actionType = 'hardlink'
				member.verdictReason = `Hardlink-consolidate onto ${survivor.basename} anchor`
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				consolidatableCopiesCount += 1
				return
			}

			// Strategy: prune redlines and scanned attachments only
			if (strategy === 'prune-redlines-and-scans-only') {
				if (family === 'redline-draft-revisions' || family === 'scanned-exhibit-attachments' || member.meta.inExportStaging) {
					member.verdict = family === 'scanned-exhibit-attachments'
						? 'reclaim-duplicate-scanned-exhibit'
						: 'reclaim-stale-redline-draft'
					member.actionType = 'prune'
					member.verdictReason = family === 'scanned-exhibit-attachments'
						? 'Redundant scanned exhibit or attachment copy'
						: `Stale redline/draft revision (${member.ageDays}d old)`
					reclaimableBytes += member.size
					reclaimableCopiesCount += 1
					return
				}
				member.verdict = 'blocked-strategy-scope'
				member.actionType = 'keep'
				member.verdictReason = 'Outside redline & scanned attachment cleanup scope'
				shieldedCopiesCount += 1
				return
			}

			// Default strategy: prune-drafts-and-duplicate-scans
			if (member.meta.inExportStaging) {
				member.verdict = 'reclaim-staging-export'
				member.actionType = 'prune'
				member.verdictReason = 'Redundant download, inbox, or email export copy'
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				return
			}

			if (family === 'redline-draft-revisions') {
				member.verdict = 'reclaim-stale-redline-draft'
				member.actionType = 'prune'
				member.verdictReason = `Stale ${member.meta.legalTool} revision (${member.ageDays}d old)`
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				return
			}

			if (family === 'scanned-exhibit-attachments') {
				member.verdict = 'reclaim-duplicate-scanned-exhibit'
				member.actionType = 'prune'
				member.verdictReason = 'Redundant scanned attachment or duplicate exhibit copy'
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				return
			}

			if (family === 'compliance-evidence-bundles') {
				member.verdict = 'reclaim-redundant-compliance-pack'
				member.actionType = 'prune'
				member.verdictReason = 'Redundant compliance bundle or duplicate KYC/RIB/KBIS copy'
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				return
			}

			member.verdict = 'reclaim-redundant-contract-copy'
			member.actionType = 'prune'
			member.verdictReason = 'Redundant contract copy outside shielded vault anchors'
			reclaimableBytes += member.size
			reclaimableCopiesCount += 1
		})

		const rawInfo = computeGroupReclaimableInfo({ ...group, files })
		const rawDuplicateBytes = rawInfo.reclaimableBytes || Math.max(0, (classifiedMembers.length - 1) * survivor.size)

		let riskState = 'reclaimable'
		let riskPriority = 2
		if (reclaimableCopiesCount === 0) {
			if (hasLegalHold) {
				riskState = 'legal-hold-locked'
				riskPriority = 6
			} else if (hasPadesSignature) {
				riskState = 'pades-protected'
				riskPriority = 5
			} else if (hasCountersignedOriginal) {
				riskState = 'countersigned-protected'
				riskPriority = 4
			} else {
				riskState = 'shielded'
				riskPriority = 3
			}
		} else if (consolidatableCopiesCount > 0) {
			riskState = 'consolidatable'
			riskPriority = 3
		} else if (family === 'redline-draft-revisions') {
			riskState = 'draft-reclaimable'
			riskPriority = 2
		}

		allClusters.push({
			groupKey: `${group.id ?? group.hash ?? primaryMeta.vaultKey}::${primaryMeta.vaultKey}`,
			primaryGroupId: group.id ?? null,
			hash: group.hash || '',
			family,
			familyLabel: familyMeta.label,
			familyShortLabel: familyMeta.shortLabel,
			counterpartyMatter: primaryMeta.counterpartyMatter,
			contractId: primaryMeta.contractId,
			executionState: primaryMeta.executionState,
			revisionNumber: primaryMeta.revisionNumber,
			revisionLabel: primaryMeta.revisionNumber > 0 ? `v${primaryMeta.revisionNumber}` : 'unversioned',
			contractSignature: primaryMeta.contractSignature,
			legalTool: primaryMeta.legalTool,
			formatBadge: primaryMeta.formatBadge,
			vaultKey: primaryMeta.vaultKey,
			displayName: survivor.basename,
			hasCountersignedOriginal,
			hasLegalHoldOrPades,
			hasLegalHold,
			hasPadesSignature,
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

	const familyBreakdown = Object.keys(LEGAL_CONTRACT_FAMILY_META).map(famId => {
		const famClusters = allClusters.filter(c => c.family === famId)
		const famReclaim = famClusters.reduce((acc, c) => acc + c.reclaimableBytes, 0)
		return {
			id: famId,
			label: LEGAL_CONTRACT_FAMILY_META[famId].label,
			shortLabel: LEGAL_CONTRACT_FAMILY_META[famId].shortLabel,
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
			if (verdictFilter === 'countersigned' && !cluster.hasCountersignedOriginal) {
				return false
			}
			if (verdictFilter === 'legal-hold-pades' && !cluster.hasLegalHoldOrPades) {
				return false
			}
			if (verdictFilter === 'redline-draft' && cluster.family !== 'redline-draft-revisions') {
				return false
			}
			if (verdictFilter === 'compliance-bundle' && cluster.family !== 'compliance-evidence-bundles') {
				return false
			}
			if (verdictFilter === 'scanned-exhibit' && cluster.family !== 'scanned-exhibit-attachments') {
				return false
			}
			if (verdictFilter === 'shielded' && cluster.reclaimableCopiesCount > 0) {
				return false
			}
		}
		if (searchQuery) {
			const haystack = [
				cluster.counterpartyMatter,
				cluster.contractId,
				cluster.executionState,
				cluster.contractSignature,
				cluster.legalTool,
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
		if (sortMode === 'risk_desc') {
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
	const totalCountersignedClusters = filteredClusters.filter(c => c.hasCountersignedOriginal).length
	const totalLegalHoldPadesClusters = filteredClusters.filter(c => c.hasLegalHoldOrPades).length
	const totalRedlineDraftClusters = filteredClusters.filter(c => c.family === 'redline-draft-revisions').length
	const totalComplianceBundleClusters = filteredClusters.filter(c => c.family === 'compliance-evidence-bundles').length
	const totalScannedExhibitClusters = filteredClusters.filter(c => c.family === 'scanned-exhibit-attachments').length
	const distinctMattersCount = new Set(filteredClusters.map(c => c.counterpartyMatter)).size
	const efficiencyPct = totalRawDuplicateBytes > 0
		? Math.min(100, Math.round((totalReclaimableBytes / totalRawDuplicateBytes) * 100))
		: 0

	return {
		schema: LEGAL_CONTRACT_VAULT_SCHEMA,
		generatedAt: new Date(referenceNowSec * 1000).toISOString(),
		options: {
			familyFilter,
			verdictFilter,
			sortMode,
			strategy,
			survivorRule,
			protectCountersignedOriginals,
			protectLegalHoldPades,
			staleDraftDays,
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
			totalCountersignedClusters,
			totalLegalHoldPadesClusters,
			totalRedlineDraftClusters,
			totalComplianceBundleClusters,
			totalScannedExhibitClusters,
			distinctMattersCount,
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
 * Build a safe POSIX DRY_RUN=1 remediation script for Legal, Compliance & Signed Contract Vault cleanup.
 *
 * @param {object} analysis Output of analyzeLegalContractVault.
 * @param {object} [options] Script generation options.
 * @return {string} POSIX shell script.
 */
export function buildLegalContractRemediationScript(analysis, options = {}) {
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
		'# DuplicateFinder Legal, Compliance & Signed Contract Vault Remediation Script',
		`# Schema: ${LEGAL_CONTRACT_VAULT_SCHEMA}`,
		`# Clusters: ${summary.totalClustersCount} | Reclaimable: ${summary.formattedReclaimableBytes} (${summary.reclaimableGb}) | Targets: ${summary.totalReclaimableCopiesCount}`,
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
		lines.push(`# Legal Vault: ${cluster.vaultKey} [${cluster.legalTool} / ${cluster.formatBadge}] (${cluster.formattedReclaimableBytes})`)
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
		lines.push('# No actionable legal drafts, scanned exhibits or redundant copies under current countersigned/legal-hold guards.')
	} else {
		lines.push('# After applying with DRY_RUN=0, refresh Nextcloud filecache:')
		lines.push('# sudo -u www-data php /var/www/nextcloud/occ files:scan --all')
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe CSV audit report.
 *
 * @param {object} analysis Output of analyzeLegalContractVault.
 * @return {string} CSV content.
 */
export function buildLegalContractCsvReport(analysis) {
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const headers = [
		'CounterpartyMatter',
		'ContractId',
		'ExecutionState',
		'LegalTool',
		'Family',
		'Format',
		'CountersignedGuard',
		'LegalHoldPadesGuard',
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
				cluster.counterpartyMatter,
				cluster.contractId,
				cluster.executionState,
				cluster.legalTool,
				cluster.family,
				cluster.formatBadge,
				member.meta.isCountersignedOriginal ? 'yes' : 'no',
				member.meta.isLegalHoldOrPades ? 'yes' : 'no',
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
 * @param {object} analysis Output of analyzeLegalContractVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildLegalContractJsonReport(analysis) {
	const payload = {
		schema: LEGAL_CONTRACT_VAULT_SCHEMA,
		generatedAt: analysis && analysis.generatedAt ? analysis.generatedAt : new Date().toISOString(),
		options: analysis ? analysis.options : {},
		summary: analysis ? analysis.summary : {},
		familyBreakdown: analysis ? analysis.familyBreakdown : [],
		clusters: (analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []).map(cluster => ({
			groupKey: cluster.groupKey,
			primaryGroupId: cluster.primaryGroupId,
			hash: cluster.hash,
			counterpartyMatter: cluster.counterpartyMatter,
			contractId: cluster.contractId,
			executionState: cluster.executionState,
			legalTool: cluster.legalTool,
			family: cluster.family,
			formatBadge: cluster.formatBadge,
			hasCountersignedOriginal: cluster.hasCountersignedOriginal,
			hasLegalHoldOrPades: cluster.hasLegalHoldOrPades,
			riskState: cluster.riskState,
			reclaimableBytes: cluster.reclaimableBytes,
			reclaimableGb: cluster.reclaimableGb,
			rawDuplicateBytes: cluster.rawDuplicateBytes,
			members: (cluster.members || []).map(m => ({
				path: m.path,
				size: m.size,
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
 * Build a Nextcloud desktop client .sync-exclude.lst snippet for transient Word/ODT draft locks and scanner temp files.
 *
 * @param {object} analysis Output of analyzeLegalContractVault.
 * @return {string} Sync exclude rules.
 */
export function buildLegalContractSyncExcludeSnippet(analysis) {
	const draftCount = analysis && analysis.summary ? analysis.summary.totalRedlineDraftClusters : 0
	const scanCount = analysis && analysis.summary ? analysis.summary.totalScannedExhibitClusters : 0
	return [
		'# DuplicateFinder Legal, Compliance & Signed Contract Vault Sync Exclusions',
		`# Detected redline/draft clusters: ${draftCount} | Scanned exhibit clusters: ${scanCount}`,
		'~$*.docx',
		'~$*.doc',
		'.~lock.*.odt#',
		'.~lock.*.docx#',
		'~WRL*.tmp',
		'*.wbk',
		'*_trackchanges_tmp.*',
		'*_redline_tmp.*',
		'scan_tmp_*',
		'Thumbs.db',
		'.DS_Store',
	].join('\n')
}
