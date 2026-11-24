/**
 * Pure compliance legal hold, immutable evidence freeze, custody chain
 * fingerprinting, exception override audit logging, and e-discovery
 * manifest (JSON, CWE-1236 CSV, and Nextcloud occ) generator.
 */

import { formatBytes } from './duplicateStats'
import { normalizePathForDiff, formatFileModifiedTime } from './duplicatePathDiff'
import {
	KEEP_RULES,
	getFileSelectionKey,
	selectDuplicatesByKeepRule,
	escapeCsvCell,
} from './duplicateSelectionAndExport'

export const LEGAL_HOLD_MANIFEST_SCHEMA = 'duplicatefinder.legal-hold-manifest.v1'

export const LEGAL_HOLD_DOMAINS = Object.freeze([
	{
		id: 'financial-fiscal',
		label: 'Financial & Fiscal',
		description: 'Invoices, tax filings, VAT ledgers, balance sheets, audit trails, OFX/XBRL exports',
	},
	{
		id: 'contracts-legal',
		label: 'Contracts & Signed Legal',
		description: 'Executed contracts, NDAs, MSAs, board resolutions, countersigned PDFs',
	},
	{
		id: 'gdpr-hr-payroll',
		label: 'GDPR, HR & Payroll',
		description: 'Payslips, personnel files, DSAR disclosures, employee medical/HR records',
	},
	{
		id: 'ip-regulatory',
		label: 'IP & Regulatory Vault',
		description: 'ISO/SOC2 audits, patents, cryptographic signatures (.p7s/.asc), forensic images',
	},
	{
		id: 'custom-matter',
		label: 'Custom Matter Matcher',
		description: 'Targeted folder prefix or case pattern defined by legal counsel',
	},
])

export const LEGAL_HOLD_PRESETS = Object.freeze([
	{
		id: 'litigation-hold',
		name: 'Active Litigation Hold',
		description: 'Protects all 4 compliance domains under active matter hold and blocks bulk auto-selection.',
		enabledDomains: ['financial-fiscal', 'contracts-legal', 'gdpr-hr-payroll', 'ip-regulatory'],
		keepRule: 'oldest',
		minRetentionDays: 3650,
		blockBulkAutoSelect: true,
	},
	{
		id: 'financial-audit-7y',
		name: '7-Year Statutory Fiscal Audit',
		description: 'Preserves financial ledgers, tax filings, and executed commercial contracts for 7 years.',
		enabledDomains: ['financial-fiscal', 'contracts-legal'],
		keepRule: 'oldest',
		minRetentionDays: 2555,
		blockBulkAutoSelect: true,
	},
	{
		id: 'gdpr-dsar-freeze',
		name: 'GDPR DSAR / HR Freeze',
		description: 'Isolates HR, payroll, and signed consent artifacts while retaining latest verified revision.',
		enabledDomains: ['gdpr-hr-payroll', 'contracts-legal'],
		keepRule: 'newest',
		minRetentionDays: 1825,
		blockBulkAutoSelect: true,
	},
	{
		id: 'strict-vault-lock',
		name: 'Zero-Deletion Evidence Freeze',
		description: 'Treats every matched compliance group as immutable evidence requiring formal unfreeze.',
		enabledDomains: ['financial-fiscal', 'contracts-legal', 'gdpr-hr-payroll', 'ip-regulatory', 'custom-matter'],
		keepRule: 'custodian-anchor',
		minRetentionDays: 3650,
		blockBulkAutoSelect: true,
	},
])

export const HOLD_KEEP_STRATEGIES = Object.freeze([
	{ id: 'oldest', label: 'Keep earliest original (chain-of-custody)' },
	{ id: 'newest', label: 'Keep latest executed revision' },
	{ id: 'shortest_path', label: 'Keep canonical shortest vault path' },
	{ id: 'custodian-anchor', label: 'Keep primary custodian / legal vault copy' },
])

export const HOLD_FILTER_MODES = Object.freeze([
	{ id: 'all', label: 'All groups' },
	{ id: 'protected', label: 'Protected' },
	{ id: 'frozen-immutable', label: 'Hard-frozen' },
	{ id: 'override-logged', label: 'Override logged' },
	{ id: 'releasable', label: 'Releasable' },
])

export const HOLD_SORT_MODES = Object.freeze([
	{ id: 'protected-bytes', label: 'Protected bytes' },
	{ id: 'severity', label: 'Hold severity' },
	{ id: 'copy-count', label: 'Copy count' },
	{ id: 'custodian', label: 'Custodian' },
])

const DOMAIN_LABEL_MAP = Object.freeze(
	LEGAL_HOLD_DOMAINS.reduce((acc, item) => {
		acc[item.id] = item.label
		return acc
	}, {}),
)

const STATUS_PRIORITY = Object.freeze({
	'frozen-immutable': 4,
	'policy-protected': 3,
	'override-logged': 2,
	releasable: 1,
})

const STATUS_LABELS = Object.freeze({
	'frozen-immutable': 'Hard-Frozen Immutable',
	'policy-protected': 'Policy Hold Protected',
	'override-logged': 'Exception Override Logged',
	releasable: 'Releasable (No Hold)',
})

const DOMAIN_SIGNAL_RULES = Object.freeze({
	'financial-fiscal': [
		{
			pattern: /(?:^|\/)(?:finance|accounting|comptabilite|invoices?|factures?|tax(?:es)?|fiscal|vat|tva|ledger|audit|treasury|budget|receipts?)(?:\/|$)/i,
			label: 'Financial / fiscal directory',
			weight: 38,
		},
		{
			pattern: /(?:invoice|facture|tax|vat|tva|bilan|ledger|audit|receipt|statement|balance[_ -]?sheet|general[_ -]?ledger).*\.(?:pdf|xlsx?|csv|ofx|qfx|xbrl|xml)$/i,
			label: 'Fiscal ledger or invoice artifact',
			weight: 30,
		},
	],
	'contracts-legal': [
		{
			pattern: /(?:^|\/)(?:legal|juridique|contracts?|contrats?|nda|msa|sla|agreements?|board|notary|litigation|counsel|signed)(?:\/|$)/i,
			label: 'Legal / contracts repository',
			weight: 40,
		},
		{
			pattern: /(?:signed|executed|countersigned|docusign|yousign|contract|contrat|nda|msa|agreement|amendment|avenant|deed)/i,
			label: 'Signed contract or legal instrument',
			weight: 34,
		},
	],
	'gdpr-hr-payroll': [
		{
			pattern: /(?:^|\/)(?:hr|rh|payroll|paie|employees?|personnel|gdpr|rgpd|dsar|salaries|bulletins?|medical)(?:\/|$)/i,
			label: 'HR / GDPR / payroll directory',
			weight: 40,
		},
		{
			pattern: /(?:payroll|payslip|bulletin[_ -]?de[_ -]?paie|dsar|gdpr|rgpd|employee|salary|severance|onboarding)/i,
			label: 'Payroll or GDPR personal record',
			weight: 32,
		},
	],
	'ip-regulatory': [
		{
			pattern: /(?:^|\/)(?:compliance|regulatory|evidence|vault|iso27001|soc2|hipaa|fda|patents?|certifications?|forensic|e-?discovery)(?:\/|$)/i,
			label: 'Compliance / regulatory vault',
			weight: 40,
		},
		{
			pattern: /\.(?:p7s|p7m|sig|asc|ots|ewf|e01|dd|ad1)$/i,
			label: 'Cryptographic signature or forensic container',
			weight: 36,
		},
	],
})

const SIGNED_ARTIFACT_PATTERN = /(?:signed|executed|countersigned|docusign|yousign|\.(?:p7s|p7m|sig|asc)$)/i
const VAULT_PATH_PATTERN = /(?:^|\/)(?:vault|evidence|legal|contracts?|compliance|audit|immutable|hold)(?:\/|$)/i

/**
 * Sanitize a legal matter identifier into a deterministic safe token.
 *
 * @param {string|null|undefined} raw - Raw matter identifier input.
 * @return {string} Safe matter ID (e.g. 'MATTER-2026-001').
 */
export function sanitizeMatterId(raw) {
	if (typeof raw !== 'string') {
		return 'MATTER-2026-001'
	}
	const cleaned = raw
		.trim()
		.toUpperCase()
		.replace(/[^A-Z0-9._-]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 48)
	return cleaned || 'MATTER-2026-001'
}

/**
 * Sanitize a custodian or approver identifier into a safe Nextcloud-compatible token.
 *
 * @param {string|null|undefined} raw - Raw custodian or approver identifier.
 * @param {string} [fallback=''] - Fallback when input is empty.
 * @return {string} Sanitized identifier.
 */
export function sanitizeCustodianId(raw, fallback = '') {
	if (typeof raw !== 'string') {
		return fallback
	}
	const cleaned = raw
		.trim()
		.replace(/[^a-zA-Z0-9._:@-]+/g, '')
		.slice(0, 64)
	return cleaned || fallback
}

/**
 * Compile a custom matter path matcher safely without catastrophic backtracking risk.
 * Falls back to case-insensitive literal substring matching if regex syntax is invalid.
 *
 * @param {string|null|undefined} pattern - Raw user pattern.
 * @return {function(string): boolean} Predicate taking a normalized path.
 */
export function compileCustomMatcher(pattern) {
	if (typeof pattern !== 'string') {
		return () => false
	}
	const trimmed = pattern.trim().slice(0, 120)
	if (!trimmed) {
		return () => false
	}
	if (/([+*?}\]])\1|[({].*[+*].*[)}].*[+*]/.test(trimmed)) {
		const lower = trimmed.toLowerCase()
		return path => path.toLowerCase().includes(lower)
	}
	try {
		const regex = new RegExp(trimmed, 'i')
		return path => regex.test(path)
	} catch (error) {
		const lower = trimmed.toLowerCase()
		return path => path.toLowerCase().includes(lower)
	}
}

/**
 * Extract the custodian / storage scope label from a Nextcloud path.
 *
 * @param {string|null|undefined} rawPath - Raw Nextcloud file path.
 * @return {string} Custodian or mount scope label.
 */
export function extractCustodianFromPath(rawPath) {
	const normalized = normalizePathForDiff(rawPath)
	if (!normalized) {
		return 'unassigned'
	}
	const groupMatch = normalized.match(/^\/__groupfolders\/([^/]+)(?:\/|$)/i)
	if (groupMatch) {
		return `groupfolder:${groupMatch[1]}`
	}
	const externalMatch = normalized.match(/^\/External\/([^/]+)(?:\/|$)/i)
	if (externalMatch) {
		return `external:${externalMatch[1]}`
	}
	const userMatch = normalized.match(/^\/([^/]+)\/files(?:\/|$)/i)
	if (userMatch) {
		return userMatch[1]
	}
	const rootSegment = normalized.replace(/^\/+/, '').split('/')[0]
	return rootSegment || 'unassigned'
}

/**
 * Resolve a stable group key for a duplicate group.
 *
 * @param {object|null|undefined} group - Duplicate group object.
 * @param {number} [index=0] - Fallback index when id and hash are absent.
 * @return {string} Deterministic group key.
 */
export function getHoldGroupKey(group, index = 0) {
	if (!group || typeof group !== 'object') {
		return `group-${index}`
	}
	if (group.id !== null && group.id !== undefined && group.id !== '') {
		return `id:${group.id}`
	}
	if (typeof group.hash === 'string' && group.hash.trim()) {
		return `hash:${group.hash.trim()}`
	}
	return `group-${index}`
}

/**
 * Parse a timestamp field into Unix epoch milliseconds.
 *
 * @param {object|null|undefined} file - Duplicate file entry.
 * @return {number|null} Epoch milliseconds or null.
 */
function parseEpochMs(file) {
	if (!file || typeof file !== 'object') {
		return null
	}
	for (const field of ['mtime', 'modified', 'updatedAt', 'lastModified']) {
		const raw = file[field]
		if (raw === null || raw === undefined || raw === '' || typeof raw === 'boolean') {
			continue
		}
		if (raw instanceof Date) {
			const ms = raw.getTime()
			if (Number.isFinite(ms) && ms > 0) {
				return ms
			}
			continue
		}
		if (typeof raw === 'number') {
			if (Number.isFinite(raw) && raw > 0) {
				return raw < 1e11 ? Math.round(raw * 1000) : Math.round(raw)
			}
			continue
		}
		if (typeof raw === 'string') {
			const trimmed = raw.trim()
			if (!trimmed) {
				continue
			}
			if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
				const num = Number(trimmed)
				if (Number.isFinite(num) && num > 0) {
					return num < 1e11 ? Math.round(num * 1000) : Math.round(num)
				}
				continue
			}
			const parsed = Date.parse(trimmed)
			if (Number.isFinite(parsed) && parsed > 0) {
				return parsed
			}
		}
	}
	return null
}

/**
 * Compute a deterministic 64-bit FNV-1a chain-of-custody fingerprint
 * across group hash and sorted normalized copy descriptors.
 *
 * @param {object} group - Duplicate group object.
 * @param {Array<object>} files - Valid file entries in the group.
 * @return {string} Deterministic custody digest (e.g. 'custody-4f9a12bc8e01d3a7').
 */
export function computeCustodyFingerprint(group, files) {
	const hashPart = group && typeof group.hash === 'string' ? group.hash.trim() : ''
	const descriptors = (Array.isArray(files) ? files : [])
		.filter(Boolean)
		.map(file => {
			const normPath = normalizePathForDiff(file.path || '')
			const size = Number(file.size) || Number(group && group.size) || 0
			const epoch = parseEpochMs(file) || 0
			return `${normPath}|${size}|${epoch}`
		})
		.sort()
	const payload = `${hashPart}::${descriptors.join(';')}`

	let h1 = 0x811c9dc5
	let h2 = 0x811c9dc5 ^ 0x9e3779b9
	for (let i = 0; i < payload.length; i++) {
		const code = payload.charCodeAt(i)
		h1 ^= code
		h1 = Math.imul(h1, 0x01000193)
		h2 ^= (code + i) & 0xff
		h2 = Math.imul(h2, 0x01000193)
	}
	const hex1 = (h1 >>> 0).toString(16).padStart(8, '0')
	const hex2 = (h2 >>> 0).toString(16).padStart(8, '0')
	return `custody-${hex1}${hex2}`
}

/**
 * Classify a single file entry against active compliance hold domains and custom pattern.
 *
 * @param {object} file - File entry.
 * @param {object} policy - Normalized legal hold policy.
 * @return {object} Classification details.
 */
export function classifyFileCompliance(file, policy) {
	const normalizedPath = normalizePathForDiff(file && file.path ? file.path : '')
	const enabledDomains = new Set(Array.isArray(policy && policy.enabledDomains) ? policy.enabledDomains : [])
	const matchedDomains = []
	const matchedSignals = []
	let holdScore = 0

	for (const domainId of Object.keys(DOMAIN_SIGNAL_RULES)) {
		if (!enabledDomains.has(domainId)) {
			continue
		}
		const rules = DOMAIN_SIGNAL_RULES[domainId]
		let domainMatched = false
		for (const rule of rules) {
			if (rule.pattern.test(normalizedPath)) {
				domainMatched = true
				holdScore += rule.weight
				matchedSignals.push(rule.label)
			}
		}
		if (domainMatched) {
			matchedDomains.push(domainId)
		}
	}

	if (enabledDomains.has('custom-matter') && policy && typeof policy.customMatcher === 'function') {
		if (policy.customMatcher(normalizedPath)) {
			matchedDomains.push('custom-matter')
			holdScore += 45
			matchedSignals.push('Custom matter pattern match')
		}
	}

	const isSignedArtifact = SIGNED_ARTIFACT_PATTERN.test(normalizedPath)
	if (isSignedArtifact && matchedDomains.length > 0) {
		holdScore += 15
	}

	const isImmutablePath = VAULT_PATH_PATTERN.test(normalizedPath)
	if (file && file.isInOriginFolder) {
		holdScore += 12
		matchedSignals.push('Origin folder anchor')
	}

	return {
		matchedDomains,
		matchedSignals: Array.from(new Set(matchedSignals)),
		isSignedArtifact,
		isImmutablePath,
		holdScore: Math.min(100, holdScore),
		primaryDomain: matchedDomains[0] || '',
	}
}

/**
 * Choose a deterministic surviving master copy key for a group, supporting
 * standard keep rules plus custodian-anchor strategy.
 *
 * @param {Array<object>} files - Group file entries.
 * @param {string} keepRule - One of HOLD_KEEP_STRATEGIES.
 * @param {string} [preferredCustodian=''] - Preferred custodian identifier.
 * @return {{ survivorKey: string|number|null, survivorFile: object|null }} Chosen survivor.
 */
export function chooseCustodianSurvivor(files, keepRule, preferredCustodian = '') {
	const validFiles = Array.isArray(files) ? files.filter(file => file && typeof file === 'object') : []
	if (validFiles.length === 0) {
		return { survivorKey: null, survivorFile: null }
	}

	if (keepRule === 'custodian-anchor') {
		const targetCustodian = sanitizeCustodianId(preferredCustodian, '').toLowerCase()
		let bestFile = validFiles[0]
		let bestScore = -1
		for (const file of validFiles) {
			const normPath = normalizePathForDiff(file.path || '')
			const custodian = extractCustodianFromPath(normPath).toLowerCase()
			let score = 0
			if (file.isInOriginFolder) {
				score += 50
			}
			if (targetCustodian && custodian === targetCustodian) {
				score += 40
			}
			if (VAULT_PATH_PATTERN.test(normPath)) {
				score += 25
			}
			if (SIGNED_ARTIFACT_PATTERN.test(normPath)) {
				score += 15
			}
			if (score > bestScore || (score === bestScore && normPath < normalizePathForDiff(bestFile.path || ''))) {
				bestScore = score
				bestFile = file
			}
		}
		return {
			survivorKey: getFileSelectionKey(bestFile),
			survivorFile: bestFile,
		}
	}

	const normalizedRule = KEEP_RULES.includes(keepRule) ? keepRule : 'oldest'
	const deleteKeys = new Set(selectDuplicatesByKeepRule(validFiles, normalizedRule))
	const survivor = validFiles.find(file => !deleteKeys.has(getFileSelectionKey(file))) || validFiles[0]
	return {
		survivorKey: getFileSelectionKey(survivor),
		survivorFile: survivor,
	}
}

/**
 * Normalize a freeze registry map keyed by groupKey.
 *
 * @param {object|null|undefined} rawRegistry - Raw freeze registry object.
 * @return {object} Normalized freeze registry map.
 */
export function normalizeFreezeRegistry(rawRegistry) {
	if (!rawRegistry || typeof rawRegistry !== 'object' || Array.isArray(rawRegistry)) {
		return {}
	}
	const normalized = {}
	for (const [groupKey, entry] of Object.entries(rawRegistry)) {
		if (!groupKey || !entry || typeof entry !== 'object') {
			continue
		}
		normalized[groupKey] = {
			groupKey,
			matterId: sanitizeMatterId(entry.matterId),
			custodian: sanitizeCustodianId(entry.custodian, 'unassigned'),
			holdReason: typeof entry.holdReason === 'string' && entry.holdReason.trim()
				? entry.holdReason.trim().slice(0, 240)
				: 'Immutable legal evidence freeze',
			frozenBy: sanitizeCustodianId(entry.frozenBy, 'compliance-officer'),
			frozenAtIso: typeof entry.frozenAtIso === 'string' && entry.frozenAtIso.trim()
				? entry.frozenAtIso.trim()
				: '2026-01-01T00:00:00.000Z',
			immutable: entry.immutable !== false,
		}
	}
	return normalized
}

/**
 * Normalize an exception override audit log array.
 *
 * @param {Array<object>|null|undefined} rawLog - Raw override log entries.
 * @return {Array<object>} Normalized override entries.
 */
export function normalizeOverrideLog(rawLog) {
	if (!Array.isArray(rawLog)) {
		return []
	}
	return rawLog
		.filter(entry => entry && typeof entry === 'object' && typeof entry.groupKey === 'string')
		.map(entry => ({
			id: typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : `ovr-${entry.groupKey}`,
			groupKey: entry.groupKey,
			groupId: entry.groupId ?? null,
			hash: typeof entry.hash === 'string' ? entry.hash : '',
			matterId: sanitizeMatterId(entry.matterId),
			approverId: sanitizeCustodianId(entry.approverId, 'counsel'),
			reason: typeof entry.reason === 'string' ? entry.reason.trim().slice(0, 240) : '',
			timestampIso: typeof entry.timestampIso === 'string' && entry.timestampIso.trim()
				? entry.timestampIso.trim()
				: '2026-01-01T00:00:00.000Z',
			affectedPaths: Array.isArray(entry.affectedPaths)
				? entry.affectedPaths.filter(path => typeof path === 'string').slice(0, 32)
				: [],
		}))
}

/**
 * Validate an exception override request before recording it in the audit trail.
 *
 * @param {object} params - Override parameters.
 * @param {string} params.approverId - Compliance officer or legal counsel ID.
 * @param {string} params.reason - Explicit justification (>= 8 chars).
 * @param {boolean} params.isHardImmutable - True when hard-immutable freeze lock is active.
 * @return {{ valid: boolean, errors: Array<string>, approverId: string, reason: string }} Validation result.
 */
export function validateExceptionOverrideInput({ approverId, reason, isHardImmutable } = {}) {
	const errors = []
	const cleanApprover = sanitizeCustodianId(approverId, '')
	const cleanReason = typeof reason === 'string' ? reason.trim() : ''

	if (isHardImmutable) {
		errors.push('Hard-immutable evidence freeze is active; unfreeze the evidence lock before logging an override.')
	}
	if (cleanApprover.length < 2) {
		errors.push('Approver ID must be at least 2 characters (e.g. counsel-01).')
	}
	if (cleanReason.length < 8) {
		errors.push('Override justification must be at least 8 characters for e-discovery audit traceability.')
	}

	return {
		valid: errors.length === 0,
		errors,
		approverId: cleanApprover,
		reason: cleanReason.slice(0, 240),
	}
}

/**
 * Normalize policy configuration options with preset defaults.
 *
 * @param {object} [options={}] - Policy options.
 * @return {object} Normalized policy object.
 */
export function normalizeLegalHoldPolicy(options = {}) {
	const presetId = LEGAL_HOLD_PRESETS.some(preset => preset.id === options.presetId)
		? options.presetId
		: 'litigation-hold'
	const preset = LEGAL_HOLD_PRESETS.find(item => item.id === presetId) || LEGAL_HOLD_PRESETS[0]

	const enabledDomains = Array.isArray(options.enabledDomains)
		? options.enabledDomains.filter(domain => Boolean(DOMAIN_LABEL_MAP[domain]))
		: [...preset.enabledDomains]

	const keepRule = HOLD_KEEP_STRATEGIES.some(item => item.id === options.keepRule)
		? options.keepRule
		: preset.keepRule

	const customPattern = typeof options.customPattern === 'string' ? options.customPattern.trim() : ''
	const minRetentionDays = Number.isFinite(Number(options.minRetentionDays)) && Number(options.minRetentionDays) > 0
		? Math.min(36500, Math.round(Number(options.minRetentionDays)))
		: preset.minRetentionDays

	return {
		presetId,
		matterId: sanitizeMatterId(options.matterId),
		enabledDomains,
		keepRule,
		preferredCustodian: sanitizeCustodianId(options.preferredCustodian, ''),
		customPattern,
		customMatcher: compileCustomMatcher(customPattern),
		minRetentionDays,
		blockBulkAutoSelect: options.blockBulkAutoSelect !== false,
	}
}

/**
 * Evaluate duplicate groups for compliance legal holds, immutable freeze locks,
 * custody chain metadata, and protected vs releasable storage impact.
 *
 * @param {Array<object>} duplicates - Duplicate group objects.
 * @param {object} [options={}] - Policy, registry, override log, and filter/sort options.
 * @return {object} Complete deterministic legal hold analysis.
 */
export function evaluateLegalHoldGuard(duplicates, options = {}) {
	const policy = normalizeLegalHoldPolicy(options)
	const freezeRegistry = normalizeFreezeRegistry(options.freezeRegistry)
	const overrideAuditLog = normalizeOverrideLog(options.overrideLog)
	const latestOverrideByGroup = new Map()
	for (const entry of overrideAuditLog) {
		latestOverrideByGroup.set(entry.groupKey, entry)
	}

	const filterMode = HOLD_FILTER_MODES.some(item => item.id === options.filterMode)
		? options.filterMode
		: 'all'
	const sortMode = HOLD_SORT_MODES.some(item => item.id === options.sortMode)
		? options.sortMode
		: 'protected-bytes'
	const domainFilter = typeof options.domainFilter === 'string' ? options.domainFilter : 'all'
	const custodianFilter = typeof options.custodianFilter === 'string' ? options.custodianFilter : 'all'
	const searchQuery = typeof options.searchQuery === 'string' ? options.searchQuery.trim().toLowerCase() : ''

	const groups = []
	const domainCounts = {
		'financial-fiscal': 0,
		'contracts-legal': 0,
		'gdpr-hr-payroll': 0,
		'ip-regulatory': 0,
		'custom-matter': 0,
	}
	const custodianSet = new Set()

	let protectedGroupsCount = 0
	let hardFrozenCount = 0
	let policyProtectedCount = 0
	let overrideLoggedCount = 0
	let releasableGroupsCount = 0
	let blockedCopiesCount = 0
	let releasableCopiesCount = 0
	let protectedBytes = 0
	let safeReclaimableBytes = 0

	const list = Array.isArray(duplicates) ? duplicates : []
	for (let i = 0; i < list.length; i++) {
		const group = list[i]
		if (!group || typeof group !== 'object') {
			continue
		}
		const rawFiles = Array.isArray(group.files) ? group.files.filter(Boolean) : []
		if (rawFiles.length === 0) {
			continue
		}

		const groupKey = getHoldGroupKey(group, i)
		const freezeEntry = freezeRegistry[groupKey] || null
		const overrideEntry = latestOverrideByGroup.get(groupKey) || null
		const { survivorKey, survivorFile } = chooseCustodianSurvivor(
			rawFiles,
			policy.keepRule,
			policy.preferredCustodian,
		)

		const domainSet = new Set()
		const signalSet = new Set()
		const groupCustodians = new Set()
		let maxScore = 0
		let hasSignedArtifact = false

		const evaluatedFiles = rawFiles.map(file => {
			const normPath = normalizePathForDiff(file.path || '')
			const custodian = extractCustodianFromPath(normPath)
			groupCustodians.add(custodian)
			custodianSet.add(custodian)

			const cls = classifyFileCompliance(file, policy)
			for (const d of cls.matchedDomains) {
				domainSet.add(d)
			}
			for (const s of cls.matchedSignals) {
				signalSet.add(s)
			}
			if (cls.holdScore > maxScore) {
				maxScore = cls.holdScore
			}
			if (cls.isSignedArtifact) {
				hasSignedArtifact = true
			}

			const key = getFileSelectionKey(file)
			const fileBytes = Number(file.size) || Number(group.size) || 0
			return {
				...file,
				selectionKey: key,
				normalizedPath: normPath,
				custodian,
				modifiedFormatted: formatFileModifiedTime(file),
				sizeBytes: fileBytes,
				sizeFormatted: formatBytes(fileBytes),
				matchedDomains: cls.matchedDomains,
				matchedSignals: cls.matchedSignals,
				isSignedArtifact: cls.isSignedArtifact,
				holdScore: cls.holdScore,
				isSurvivor: key !== null && key === survivorKey,
			}
		})

		const matchedDomains = Array.from(domainSet)
		for (const domainId of matchedDomains) {
			if (Object.prototype.hasOwnProperty.call(domainCounts, domainId)) {
				domainCounts[domainId] += 1
			}
		}

		const isPolicyMatch = matchedDomains.length > 0
		const isHardImmutable = Boolean(freezeEntry && freezeEntry.immutable)
		let status = 'releasable'
		if (isHardImmutable) {
			status = 'frozen-immutable'
			hardFrozenCount += 1
		} else if (isPolicyMatch && overrideEntry) {
			status = 'override-logged'
			overrideLoggedCount += 1
		} else if (isPolicyMatch || freezeEntry) {
			status = 'policy-protected'
			policyProtectedCount += 1
		} else {
			releasableGroupsCount += 1
		}

		const isProtected = status === 'frozen-immutable' || status === 'policy-protected'
		if (isProtected) {
			protectedGroupsCount += 1
		}

		const unitSize = Number(group.size) || (evaluatedFiles[0] ? evaluatedFiles[0].sizeBytes : 0)
		const totalBytes = evaluatedFiles.reduce((sum, f) => sum + f.sizeBytes, 0)
		const wasteBytes = Math.max(0, totalBytes - (survivorFile ? (Number(survivorFile.size) || unitSize) : unitSize))

		const nonSurvivorCount = Math.max(0, evaluatedFiles.length - 1)
		const groupProtectedCopies = isProtected ? evaluatedFiles.length : 1
		const groupReleasableCopies = isProtected ? 0 : nonSurvivorCount
		const groupProtectedBytes = isProtected ? wasteBytes : 0
		const groupSafeReclaimableBytes = isProtected ? 0 : wasteBytes

		blockedCopiesCount += isProtected ? nonSurvivorCount : 0
		releasableCopiesCount += groupReleasableCopies
		protectedBytes += groupProtectedBytes
		safeReclaimableBytes += groupSafeReclaimableBytes

		const custodiansList = Array.from(groupCustodians)
		const primaryCustodian = custodiansList[0] || 'unassigned'
		const firstPath = evaluatedFiles[0].normalizedPath || ''
		const title = firstPath ? firstPath.split('/').filter(Boolean).slice(-1)[0] || firstPath : `Group ${group.id || i}`

		groups.push({
			groupKey,
			groupId: group.id ?? null,
			hash: typeof group.hash === 'string' ? group.hash : '',
			title,
			copyCount: evaluatedFiles.length,
			unitSizeBytes: unitSize,
			totalBytes,
			totalBytesFormatted: formatBytes(totalBytes),
			wasteBytes,
			wasteBytesFormatted: formatBytes(wasteBytes),
			status,
			statusLabel: STATUS_LABELS[status],
			isProtected,
			isHardImmutable,
			isPolicyMatch,
			hasSignedArtifact,
			holdScore: isHardImmutable ? 100 : maxScore,
			matchedDomains,
			matchedDomainLabels: matchedDomains.map(id => DOMAIN_LABEL_MAP[id] || id),
			primaryDomain: matchedDomains[0] || '',
			primaryDomainLabel: matchedDomains[0] ? (DOMAIN_LABEL_MAP[matchedDomains[0]] || matchedDomains[0]) : 'General',
			matchedSignals: Array.from(signalSet),
			custodians: custodiansList,
			primaryCustodian,
			custodyFingerprint: computeCustodyFingerprint(group, evaluatedFiles),
			freezeEntry,
			overrideEntry,
			survivorKey,
			survivorPath: survivorFile ? normalizePathForDiff(survivorFile.path || '') : firstPath,
			protectedCopies: groupProtectedCopies,
			releasableCopies: groupReleasableCopies,
			protectedBytes: groupProtectedBytes,
			protectedBytesFormatted: formatBytes(groupProtectedBytes),
			safeReclaimableBytes: groupSafeReclaimableBytes,
			safeReclaimableBytesFormatted: formatBytes(groupSafeReclaimableBytes),
			matterId: freezeEntry ? freezeEntry.matterId : policy.matterId,
			files: evaluatedFiles,
			rawGroup: group,
		})
	}

	const filteredGroups = groups.filter(item => {
		if (filterMode === 'protected' && !item.isProtected) {
			return false
		}
		if (filterMode === 'frozen-immutable' && item.status !== 'frozen-immutable') {
			return false
		}
		if (filterMode === 'override-logged' && item.status !== 'override-logged') {
			return false
		}
		if (filterMode === 'releasable' && item.status !== 'releasable') {
			return false
		}
		if (domainFilter !== 'all' && !item.matchedDomains.includes(domainFilter)) {
			return false
		}
		if (custodianFilter !== 'all' && !item.custodians.includes(custodianFilter)) {
			return false
		}
		if (searchQuery) {
			const haystack = [
				item.title,
				item.hash,
				item.matterId,
				item.custodyFingerprint,
				item.primaryCustodian,
				...item.matchedDomainLabels,
				...item.files.map(f => f.normalizedPath),
			].join(' ').toLowerCase()
			if (!haystack.includes(searchQuery)) {
				return false
			}
		}
		return true
	})

	filteredGroups.sort((a, b) => {
		if (sortMode === 'severity') {
			const diff = (STATUS_PRIORITY[b.status] || 0) - (STATUS_PRIORITY[a.status] || 0)
			if (diff !== 0) {
				return diff
			}
			const scoreDiff = b.holdScore - a.holdScore
			if (scoreDiff !== 0) {
				return scoreDiff
			}
		} else if (sortMode === 'copy-count') {
			const diff = b.copyCount - a.copyCount
			if (diff !== 0) {
				return diff
			}
		} else if (sortMode === 'custodian') {
			if (a.primaryCustodian < b.primaryCustodian) {
				return -1
			}
			if (a.primaryCustodian > b.primaryCustodian) {
				return 1
			}
		}
		const bytesDiff = b.protectedBytes - a.protectedBytes || b.wasteBytes - a.wasteBytes
		if (bytesDiff !== 0) {
			return bytesDiff
		}
		return a.groupKey < b.groupKey ? -1 : (a.groupKey > b.groupKey ? 1 : 0)
	})

	return {
		policy,
		summary: {
			totalGroups: groups.length,
			protectedGroupsCount,
			hardFrozenCount,
			policyProtectedCount,
			overrideLoggedCount,
			releasableGroupsCount,
			blockedCopiesCount,
			releasableCopiesCount,
			protectedBytes,
			protectedBytesFormatted: formatBytes(protectedBytes),
			safeReclaimableBytes,
			safeReclaimableBytesFormatted: formatBytes(safeReclaimableBytes),
			domainCounts,
			custodians: Array.from(custodianSet).sort(),
		},
		groups,
		filteredGroups,
		overrideAuditLog,
	}
}

/**
 * Quote a string safely for POSIX single-quoted shell arguments.
 *
 * @param {string} value - Raw string.
 * @return {string} POSIX-safe single-quoted literal.
 */
function quotePosixShell(value) {
	return `'${String(value || '').replace(/'/g, '\'"\'"\'')}'`
}

/**
 * Build a Nextcloud occ & immutable vault enforcement script for held groups.
 *
 * @param {object} analysis - Result of evaluateLegalHoldGuard.
 * @return {string} POSIX shell script content.
 */
export function buildLegalHoldOccScript(analysis) {
	const policy = analysis && analysis.policy ? analysis.policy : normalizeLegalHoldPolicy()
	const groups = analysis && Array.isArray(analysis.groups) ? analysis.groups : []
	const heldGroups = groups.filter(item => item.isProtected)

	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# DuplicateFinder E-Discovery Legal Hold Guard Script',
		`# Matter ID: ${policy.matterId}`,
		`# Policy Preset: ${policy.presetId} | Retention Floor: ${policy.minRetentionDays} days`,
		`# Protected Groups: ${heldGroups.length}`,
		'',
		'OCC_BIN="${OCC_BIN:-sudo -u www-data php /var/www/nextcloud/occ}"', // eslint-disable-line no-template-curly-in-string
		'NC_DATA_ROOT="${NC_DATA_ROOT:-/var/ncdata}"', // eslint-disable-line no-template-curly-in-string
		'',
		'echo "[legal-hold] Verifying Nextcloud system tag and file index for matter ' + policy.matterId + '"',
		'$OCC_BIN tag:add ' + quotePosixShell(`legal-hold:${policy.matterId}`) + ' || true',
		'',
	]

	if (heldGroups.length === 0) {
		lines.push('echo "[legal-hold] No protected duplicate groups matched current policy."')
		return lines.join('\n')
	}

	const custodians = new Set()
	for (const group of heldGroups.slice(0, 25)) {
		lines.push(`# Group ${group.groupKey} | ${group.statusLabel} | ${group.custodyFingerprint}`)
		for (const file of group.files) {
			if (file.custodian && !file.custodian.includes(':')) {
				custodians.add(file.custodian)
			}
			const safePath = quotePosixShell(file.normalizedPath)
			lines.push(`# Verify custody artifact: ${safePath} (${file.sizeFormatted})`)
			if (group.isHardImmutable) {
				lines.push(`# Immutable advisory lock: chattr +i "\${NC_DATA_ROOT}"/${safePath}`)
			}
		}
		lines.push('')
	}

	if (custodians.size > 0) {
		lines.push('# Rescan custodian namespaces before e-discovery export:')
		for (const custodian of Array.from(custodians).sort()) {
			lines.push(`$OCC_BIN files:scan ${quotePosixShell(custodian)}`)
		}
	}

	return lines.join('\n')
}

/**
 * Export an E-Discovery Legal Hold Manifest JSON document.
 *
 * @param {object} analysis - Result of evaluateLegalHoldGuard.
 * @param {string} [generatedAtIso] - Optional deterministic ISO timestamp.
 * @return {string} Pretty-printed JSON manifest.
 */
export function exportLegalHoldManifestJson(analysis, generatedAtIso = new Date().toISOString()) {
	const safeAnalysis = analysis || evaluateLegalHoldGuard([])
	const payload = {
		schema: LEGAL_HOLD_MANIFEST_SCHEMA,
		generatedAt: generatedAtIso,
		matter: {
			matterId: safeAnalysis.policy.matterId,
			presetId: safeAnalysis.policy.presetId,
			enabledDomains: safeAnalysis.policy.enabledDomains,
			keepRule: safeAnalysis.policy.keepRule,
			preferredCustodian: safeAnalysis.policy.preferredCustodian,
			minRetentionDays: safeAnalysis.policy.minRetentionDays,
			blockBulkAutoSelect: safeAnalysis.policy.blockBulkAutoSelect,
		},
		summary: safeAnalysis.summary,
		heldGroups: safeAnalysis.groups.map(group => ({
			groupKey: group.groupKey,
			groupId: group.groupId,
			hash: group.hash,
			matterId: group.matterId,
			status: group.status,
			isProtected: group.isProtected,
			isHardImmutable: group.isHardImmutable,
			custodyFingerprint: group.custodyFingerprint,
			matchedDomains: group.matchedDomains,
			matchedSignals: group.matchedSignals,
			primaryCustodian: group.primaryCustodian,
			survivorPath: group.survivorPath,
			protectedBytes: group.protectedBytes,
			safeReclaimableBytes: group.safeReclaimableBytes,
			freezeEntry: group.freezeEntry,
			overrideEntry: group.overrideEntry,
			files: group.files.map(file => ({
				id: file.id ?? null,
				path: file.normalizedPath,
				custodian: file.custodian,
				sizeBytes: file.sizeBytes,
				modified: file.modifiedFormatted,
				isSurvivor: file.isSurvivor,
				isSignedArtifact: file.isSignedArtifact,
				matchedDomains: file.matchedDomains,
			})),
		})),
		overrideAuditLog: safeAnalysis.overrideAuditLog,
	}
	return JSON.stringify(payload, null, 2)
}

const HOLD_CSV_HEADERS = Object.freeze([
	'Group ID',
	'Hash',
	'Matter ID',
	'Custodian',
	'Compliance Domain',
	'Evidence Status',
	'Immutable Freeze',
	'Keep Candidate Path',
	'Protected Copies',
	'Releasable Copies',
	'Protected Bytes',
	'Custody Fingerprint',
	'Override Approver',
	'Override Reason',
])

/**
 * Export a CWE-1236-safe RFC 4180 CSV custody ledger for e-discovery compliance review.
 *
 * @param {object} analysis - Result of evaluateLegalHoldGuard.
 * @return {string} CSV document string.
 */
export function exportLegalHoldCustodyCsv(analysis) {
	const groups = analysis && Array.isArray(analysis.groups) ? analysis.groups : []
	const lines = [HOLD_CSV_HEADERS.map(escapeCsvCell).join(',')]
	for (const group of groups) {
		const row = [
			group.groupId !== null ? group.groupId : group.groupKey,
			group.hash,
			group.matterId,
			group.primaryCustodian,
			group.primaryDomainLabel,
			group.statusLabel,
			group.isHardImmutable ? 'YES' : 'NO',
			group.survivorPath,
			group.protectedCopies,
			group.releasableCopies,
			group.protectedBytes,
			group.custodyFingerprint,
			group.overrideEntry ? group.overrideEntry.approverId : '',
			group.overrideEntry ? group.overrideEntry.reason : '',
		]
		lines.push(row.map(escapeCsvCell).join(','))
	}
	return lines.join('\r\n')
}
