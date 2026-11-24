/**
 * Pure Email Archive, Mailbox Dump & Extracted Attachment Redundancy Auditor.
 * Detects and audits duplicate messaging containers, individual messages,
 * calendar/contact exports, and extracted email attachments across Nextcloud storage:
 * - Mailbox Containers (.pst, .ost, .mbox, .mbx, .olm, .nsf, .dbx, .tbb)
 * - Individual Messages (.eml, .emlx, .msg, .oft)
 * - Calendar & Contact Exports (.ics, .ifb, .vcs, .vcf, .vcard)
 * - Extracted Attachments (files in Attachments/, Pieces jointes/, Mail Downloads/,
 *   Takeout/Mail/, or Re:/Fwd:/Tr: subject-prefixed duplicate attachments like
 *   "invoice.pdf" vs "Re_ Fwd_ invoice.pdf")
 *
 * Identifies governance & authority tiers:
 * - legal-hold-vault / compliance-ediscovery (strictly shielded by default)
 * - active unconsolidated .ost/.pst mail stores (strictly shielded by default)
 * - shared-mailbox-archive
 * - takeout-export-dump
 * - user-scratch-mail
 *
 * Generates POSIX DRY_RUN=1 scripts with SHA-256 verification and stat cross-device
 * hardlink guards, Nextcloud occ files:scan hints, .sync-exclude.lst rules
 * (~$*.pst, *.pst.tmp, .lock), CWE-1236 formula-safe CSV, and v1 JSON manifests.
 * Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const MAILBOX_ARCHIVE_SCHEMA = 'duplicatefinder.mailbox-archive-auditor.v1'

export const MAILBOX_FAMILIES = Object.freeze([
	'all',
	'mailbox-containers',
	'individual-messages',
	'calendar-contacts',
	'extracted-attachments',
])

export const MAILBOX_FAMILY_META = Object.freeze({
	'mailbox-containers': {
		id: 'mailbox-containers',
		label: 'Mailbox Containers',
		shortLabel: 'Mailboxes (.pst/.mbox)',
	},
	'individual-messages': {
		id: 'individual-messages',
		label: 'Individual Messages',
		shortLabel: 'Messages (.eml/.msg)',
	},
	'calendar-contacts': {
		id: 'calendar-contacts',
		label: 'Calendar & Contacts',
		shortLabel: 'Calendar & VCF',
	},
	'extracted-attachments': {
		id: 'extracted-attachments',
		label: 'Extracted Attachments',
		shortLabel: 'Attachments',
	},
})

export const MAILBOX_STRATEGIES = Object.freeze([
	'consolidate-archive-vault',
	'hardlink-attachments-to-project',
	'prune-stale-mbox-exports',
])

export const MAILBOX_SURVIVOR_RULES = Object.freeze([
	'vault-authority-first',
	'project-path-first',
	'newest-archive',
	'oldest-canonical',
	'shortest-path',
])

export const MAILBOX_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'legal-hold',
	'active-mailstores',
	'takeout-exports',
	'shielded',
])

export const MAILBOX_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const MAILBOX_PRESETS = Object.freeze([
	{
		id: 'all-mail-compliance-audit',
		name: 'All Mail & Attachment Audit',
		description: 'Audit mailbox containers, .eml/.msg archives, .ics/.vcf files, and extracted attachments while strictly shielding Legal Hold/eDiscovery vaults and active .ost/.pst stores.',
		familyFilter: 'all',
		strategy: 'consolidate-archive-vault',
		survivorRule: 'vault-authority-first',
		protectLegalHoldVaults: true,
		protectActiveMailStores: true,
		protectSharedMailboxArchives: true,
		staleExportDays: 30,
		minSizeKb: 0,
	},
	{
		id: 'legal-hold-ediscovery-lock',
		name: 'Legal Hold & eDiscovery Guard',
		description: 'Isolate litigation, compliance, and eDiscovery mail vaults alongside unconsolidated .ost/.pst stores so nothing in preservation custody is modified.',
		familyFilter: 'mailbox-containers',
		strategy: 'consolidate-archive-vault',
		survivorRule: 'vault-authority-first',
		protectLegalHoldVaults: true,
		protectActiveMailStores: true,
		protectSharedMailboxArchives: true,
		staleExportDays: 60,
		minSizeKb: 0,
	},
	{
		id: 'takeout-mbox-prune',
		name: 'Takeout & MBOX Export Prune',
		description: 'Prune stale Takeout/Mail dumps, duplicate .mbox/.eml exports, and user scratch mail archives older than the configured retention threshold.',
		familyFilter: 'all',
		strategy: 'prune-stale-mbox-exports',
		survivorRule: 'vault-authority-first',
		protectLegalHoldVaults: true,
		protectActiveMailStores: true,
		protectSharedMailboxArchives: true,
		staleExportDays: 14,
		minSizeKb: 0,
	},
	{
		id: 'attachment-project-hardlink',
		name: 'Attachment-to-Project Hardlink',
		description: 'Keep canonical project copies (e.g. invoice.pdf) and hardlink extracted email attachment copies (Mail Downloads/, Attachments/, Re_ Fwd_*) at zero extra storage.',
		familyFilter: 'extracted-attachments',
		strategy: 'hardlink-attachments-to-project',
		survivorRule: 'project-path-first',
		protectLegalHoldVaults: true,
		protectActiveMailStores: true,
		protectSharedMailboxArchives: false,
		staleExportDays: 7,
		minSizeKb: 0,
	},
	{
		id: 'calendar-ics-vcf-cleanup',
		name: 'Calendar & Contact (.ics/.vcf)',
		description: 'Deduplicate exported .ics, .ifb, .vcs, .vcf, and .vcard calendar and address book snapshots outside compliance vaults.',
		familyFilter: 'calendar-contacts',
		strategy: 'consolidate-archive-vault',
		survivorRule: 'newest-archive',
		protectLegalHoldVaults: true,
		protectActiveMailStores: true,
		protectSharedMailboxArchives: true,
		staleExportDays: 30,
		minSizeKb: 0,
	},
])

const MAILBOX_CONTAINER_EXTENSIONS = new Set([
	'pst', 'ost', 'mbox', 'mbx', 'olm', 'nsf', 'dbx', 'tbb',
])
const INDIVIDUAL_MESSAGE_EXTENSIONS = new Set([
	'eml', 'emlx', 'msg', 'oft',
])
const CALENDAR_CONTACT_EXTENSIONS = new Set([
	'ics', 'ifb', 'vcs', 'vcf', 'vcard',
])

const LEGAL_HOLD_PATH_RE = /(\/legal-hold|\/legal_hold|\/legalhold|\/ediscovery|\/e-discovery|\/compliance|\/litigation|\/forensic|\/regulatory|\/gdpr-hold|\/audit-mail|\/journal-vault|\/preservation|\/__groupfolders\/\d+\/(?:legal|compliance|ediscovery|audit))/i
const SHARED_MAILBOX_PATH_RE = /(\/shared-mailbox|\/shared_mailbox|\/shared-mailboxes|\/boite-partagee|\/messagerie-partagee|\/archive-mail|\/mail-archive|\/email-archive|\/__groupfolders\/|\/shared\/mail|\/company-mail|\/dept-mail)/i
const TAKEOUT_EXPORT_PATH_RE = /(\/takeout\/mail|\/takeout\/|\/google-takeout|\/mbox-export|\/mail-export|\/pst-export|\/outlook-export|\/thunderbird-backup|\/imap-backup|\/mail-dump|\/export-mail)/i
const EXTRACTED_ATTACHMENT_PATH_RE = /(\/attachments\/|\/pieces jointes\/|\/pièces jointes\/|\/pieces_jointes\/|\/pieces-jointes\/|\/mail downloads\/|\/mail_downloads\/|\/mail-downloads\/|\/takeout\/mail\/|\/email attachments\/|\/email_attachments\/|\/email-attachments\/|\/outlook attachments\/|\/mail-attachments\/|\/eml-attachments\/)/i
const USER_SCRATCH_MAIL_RE = /(\/downloads\/|\/telechargements\/|\/desktop\/|\/bureau\/|\/tmp\/|\/temp\/|\/scratch\/|\/incoming\/)/i
const ACTIVE_MAILSTORE_PATH_RE = /(\/outlook files\/|\/outlook\/|\/appdata\/|\/thunderbird\/|\/profiles\/|\/local mail\/|\/active-mail\/|\/mailstore\/)/i

const MAIL_FORWARD_PREFIX_RE = /^(?:(?:re|fw|fwd|tr|aw|wg)[_:\s-]+)+/i
const COPY_FORK_NAME_RE = /^(?:copy of |copie de )|(?:\s-\s?copy|\s\(\d+\)|_copy\b|\bconflicted copy\b|\bbackup\b|\bbak\b|\bold\b)/i

const TIER_LABELS = Object.freeze({
	'legal-hold-vault': 'Legal Hold / eDiscovery Vault',
	'shared-mailbox-archive': 'Shared Mailbox Archive',
	'project-canonical-hub': 'Canonical Project / Workspace',
	'takeout-export-dump': 'Takeout / MBOX Export Dump',
	'user-scratch-mail': 'User Scratch / Mail Downloads',
})

const TIER_AUTHORITY = Object.freeze({
	'legal-hold-vault': 98,
	'shared-mailbox-archive': 82,
	'project-canonical-hub': 68,
	'takeout-export-dump': 28,
	'user-scratch-mail': 18,
})

const VERDICT_LABELS = Object.freeze({
	'keep-canonical-survivor': 'Keep Canonical Survivor',
	'reclaim-mailbox-copy': 'Reclaim Redundant Mail Copy',
	'reclaim-stale-export': 'Prune Stale Export / Attachment',
	'hardlink-attachment-to-project': 'Hardlink Attachment to Project',
	'blocked-legal-hold-vault': 'Blocked: Legal Hold / eDiscovery Guard',
	'blocked-active-mailstore': 'Blocked: Active .ost/.pst Store Guard',
	'blocked-shared-mailbox': 'Blocked: Shared Mailbox Guard',
	'blocked-not-stale-export': 'Shielded: Non-Stale Archive',
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
 * Strip Re:/Fwd:/Tr: mail prefix chains and copy markers from a filename to compute its attachment stem.
 *
 * @param {string} basename File basename.
 * @return {{ normalizedStem: string, hasMailForwardPrefix: boolean, isCopyFork: boolean }}
 */
export function normalizeMailAttachmentStem(basename) {
	const name = String(basename || '')
	const hasMailForwardPrefix = MAIL_FORWARD_PREFIX_RE.test(name)
	const isCopyFork = COPY_FORK_NAME_RE.test(name)

	let stem = name.replace(/^(?:copy of |copie de )/i, '')
	let prev = ''
	while (stem !== prev) {
		prev = stem
		stem = stem.replace(MAIL_FORWARD_PREFIX_RE, '')
	}
	stem = stem
		.replace(/\s-\s?copy(?:\s*\(\d+\))?(?=\.[^.]+$|$)/i, '')
		.replace(/\s*\(\d+\)(?=\.[^.]+$|$)/g, '')
		.trim()

	return {
		normalizedStem: stem || name,
		hasMailForwardPrefix,
		isCopyFork,
	}
}

/**
 * Classify a file path and optional MIME type into a mailbox/email archive family.
 *
 * @param {string} rawPath File path.
 * @param {string} [mimetype=''] Optional MIME type.
 * @return {{ matched: boolean, family: string, familyLabel: string, extension: string, isExtractedAttachmentLocation: boolean, hasMailForwardPrefix: boolean, normalizedStem: string }|null}
 */
export function classifyMailboxArtifact(rawPath, mimetype = '') {
	const normalized = normalizePathForDiff(rawPath) || String(rawPath || '')
	const basename = extractBasename(normalized)
	const lowerBase = basename.toLowerCase()
	const lowerPath = normalized.toLowerCase()
	const lowerMime = String(mimetype || '').toLowerCase()

	if (!lowerBase) {
		return null
	}

	const lastDot = lowerBase.lastIndexOf('.')
	const ext = lastDot > 0 && lastDot < lowerBase.length - 1 ? lowerBase.slice(lastDot + 1) : ''
	const stemInfo = normalizeMailAttachmentStem(basename)
	const isExtractedLocation = EXTRACTED_ATTACHMENT_PATH_RE.test(lowerPath)

	if (MAILBOX_CONTAINER_EXTENSIONS.has(ext)) {
		return {
			matched: true,
			family: 'mailbox-containers',
			familyLabel: MAILBOX_FAMILY_META['mailbox-containers'].label,
			extension: ext,
			isExtractedAttachmentLocation: false,
			hasMailForwardPrefix: stemInfo.hasMailForwardPrefix,
			normalizedStem: stemInfo.normalizedStem,
		}
	}

	if (INDIVIDUAL_MESSAGE_EXTENSIONS.has(ext)) {
		return {
			matched: true,
			family: 'individual-messages',
			familyLabel: MAILBOX_FAMILY_META['individual-messages'].label,
			extension: ext,
			isExtractedAttachmentLocation: false,
			hasMailForwardPrefix: stemInfo.hasMailForwardPrefix,
			normalizedStem: stemInfo.normalizedStem,
		}
	}

	if (CALENDAR_CONTACT_EXTENSIONS.has(ext)) {
		return {
			matched: true,
			family: 'calendar-contacts',
			familyLabel: MAILBOX_FAMILY_META['calendar-contacts'].label,
			extension: ext,
			isExtractedAttachmentLocation: false,
			hasMailForwardPrefix: stemInfo.hasMailForwardPrefix,
			normalizedStem: stemInfo.normalizedStem,
		}
	}

	if (lowerMime === 'message/rfc822') {
		return {
			matched: true,
			family: 'individual-messages',
			familyLabel: MAILBOX_FAMILY_META['individual-messages'].label,
			extension: ext || 'eml',
			isExtractedAttachmentLocation: false,
			hasMailForwardPrefix: stemInfo.hasMailForwardPrefix,
			normalizedStem: stemInfo.normalizedStem,
		}
	}

	if (lowerMime === 'application/mbox') {
		return {
			matched: true,
			family: 'mailbox-containers',
			familyLabel: MAILBOX_FAMILY_META['mailbox-containers'].label,
			extension: ext || 'mbox',
			isExtractedAttachmentLocation: false,
			hasMailForwardPrefix: stemInfo.hasMailForwardPrefix,
			normalizedStem: stemInfo.normalizedStem,
		}
	}

	if (lowerMime === 'text/calendar' || lowerMime === 'text/vcard' || lowerMime === 'text/x-vcard') {
		return {
			matched: true,
			family: 'calendar-contacts',
			familyLabel: MAILBOX_FAMILY_META['calendar-contacts'].label,
			extension: ext || (lowerMime === 'text/calendar' ? 'ics' : 'vcf'),
			isExtractedAttachmentLocation: false,
			hasMailForwardPrefix: stemInfo.hasMailForwardPrefix,
			normalizedStem: stemInfo.normalizedStem,
		}
	}

	if (isExtractedLocation || stemInfo.hasMailForwardPrefix) {
		return {
			matched: true,
			family: 'extracted-attachments',
			familyLabel: MAILBOX_FAMILY_META['extracted-attachments'].label,
			extension: ext || 'bin',
			isExtractedAttachmentLocation: isExtractedLocation,
			hasMailForwardPrefix: stemInfo.hasMailForwardPrefix,
			normalizedStem: stemInfo.normalizedStem,
		}
	}

	return null
}

/**
 * Inspect folder governance tier and email archive signals for a member file.
 *
 * @param {object} file Duplicate file entry.
 * @param {object} classification Primary or member classification.
 * @param {number} referenceTimeSec Reference timestamp in epoch seconds.
 * @param {number} staleExportDays Age threshold in days for stale mail export flagging.
 * @return {object} Member governance and risk context.
 */
export function inspectMailboxMemberContext(file, classification, referenceTimeSec, staleExportDays) {
	const normalizedPath = normalizePathForDiff(file && file.path) || String((file && file.path) || '')
	const basename = extractBasename(normalizedPath)
	const lowerPath = normalizedPath.toLowerCase()
	const mtimeSec = getFileMtimeSeconds(file)
	const ageDays = mtimeSec !== null && Number.isFinite(referenceTimeSec)
		? Math.max(0, Math.floor((referenceTimeSec - mtimeSec) / 86400))
		: null

	const stemInfo = normalizeMailAttachmentStem(basename)
	const lastDot = basename.lastIndexOf('.')
	const ext = lastDot > 0 && lastDot < basename.length - 1
		? basename.slice(lastDot + 1).toLowerCase()
		: (classification.extension || '')

	const isLegalHold = LEGAL_HOLD_PATH_RE.test(lowerPath)
	const isComplianceEdiscovery = /ediscovery|e-discovery|compliance|litigation|forensic|legal-hold|legal_hold/i.test(lowerPath)
	const isTakeoutExport = TAKEOUT_EXPORT_PATH_RE.test(lowerPath)
	const isExtractedLocation = EXTRACTED_ATTACHMENT_PATH_RE.test(lowerPath)
	const isUserScratchPath = USER_SCRATCH_MAIL_RE.test(lowerPath)
	const isSharedArchivePath = SHARED_MAILBOX_PATH_RE.test(lowerPath)

	let tier = 'project-canonical-hub'
	if (isLegalHold) {
		tier = 'legal-hold-vault'
	} else if (isTakeoutExport) {
		tier = 'takeout-export-dump'
	} else if (isExtractedLocation || isUserScratchPath) {
		tier = 'user-scratch-mail'
	} else if (isSharedArchivePath) {
		tier = 'shared-mailbox-archive'
	}

	const isSharedMailboxArchive = tier === 'shared-mailbox-archive'
	const isTakeoutExportDump = tier === 'takeout-export-dump'
	const isUserScratchMail = tier === 'user-scratch-mail'

	// Active unconsolidated .ost offline caches or .pst stores not sitting inside consolidated
	// shared archives or Takeout export dumps are treated as active local mail stores.
	const isOstCache = ext === 'ost'
	const isUnconsolidatedPst = ext === 'pst'
		&& !isLegalHold
		&& !isTakeoutExportDump
		&& (ACTIVE_MAILSTORE_PATH_RE.test(lowerPath) || (!isSharedMailboxArchive && !stemInfo.isCopyFork))
	const isActiveMailStore = isOstCache || isUnconsolidatedPst

	const isMailForwardFork = stemInfo.hasMailForwardPrefix || stemInfo.isCopyFork
	const isStaleExport = ageDays !== null
		&& ageDays >= staleExportDays
		&& (isTakeoutExportDump || isUserScratchMail || isExtractedLocation || isMailForwardFork)

	let authorityScore = TIER_AUTHORITY[tier] || 50
	if (!isExtractedLocation && !stemInfo.hasMailForwardPrefix && !stemInfo.isCopyFork) {
		authorityScore += 6
	}
	if (isComplianceEdiscovery) {
		authorityScore += 2
	}
	if (isActiveMailStore && !isSharedMailboxArchive) {
		authorityScore -= 4
	}

	return {
		tier,
		tierLabel: TIER_LABELS[tier] || TIER_LABELS['project-canonical-hub'],
		authorityScore,
		extension: ext,
		normalizedStem: stemInfo.normalizedStem,
		hasMailForwardPrefix: stemInfo.hasMailForwardPrefix,
		isCopyFork: stemInfo.isCopyFork,
		isMailForwardFork,
		isLegalHoldVault: isLegalHold,
		isComplianceEdiscovery,
		isSharedMailboxArchive,
		isTakeoutExportDump,
		isUserScratchMail,
		isExtractedAttachmentLocation: isExtractedLocation,
		isActiveMailStore,
		isStaleExport,
		mtimeSec,
		ageDays,
	}
}

/**
 * Select the canonical surviving copy inside a mailbox/attachment cluster.
 *
 * @param {Array<object>} members Enriched cluster members.
 * @param {string} survivorRule Survivor selection rule.
 * @param {Set<string>} excludeKeys Keys excluded by operator.
 * @return {object|null} Selected survivor member or null.
 */
function selectClusterSurvivor(members, survivorRule, excludeKeys) {
	if (!Array.isArray(members) || members.length === 0) {
		return null
	}
	const eligible = members.filter(m => !excludeKeys.has(m.selectionKey))
	const pool = eligible.length > 0 ? eligible : members

	const sorted = [...pool].sort((a, b) => {
		if (survivorRule === 'project-path-first') {
			const aScratch = a.context.isExtractedAttachmentLocation || a.context.isUserScratchMail || a.context.isTakeoutExportDump || a.context.hasMailForwardPrefix
			const bScratch = b.context.isExtractedAttachmentLocation || b.context.isUserScratchMail || b.context.isTakeoutExportDump || b.context.hasMailForwardPrefix
			if (aScratch !== bScratch) {
				return aScratch ? 1 : -1
			}
			if (a.context.authorityScore !== b.context.authorityScore) {
				return b.context.authorityScore - a.context.authorityScore
			}
		} else if (survivorRule === 'newest-archive') {
			const mtimeA = a.context.mtimeSec ?? -1
			const mtimeB = b.context.mtimeSec ?? -1
			if (mtimeA !== mtimeB) {
				return mtimeB - mtimeA
			}
			if (a.context.authorityScore !== b.context.authorityScore) {
				return b.context.authorityScore - a.context.authorityScore
			}
		} else if (survivorRule === 'oldest-canonical') {
			if (a.context.isMailForwardFork !== b.context.isMailForwardFork) {
				return a.context.isMailForwardFork ? 1 : -1
			}
			const mtimeA = a.context.mtimeSec ?? Number.MAX_SAFE_INTEGER
			const mtimeB = b.context.mtimeSec ?? Number.MAX_SAFE_INTEGER
			if (mtimeA !== mtimeB) {
				return mtimeA - mtimeB
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
 * Determine the deterministic remediation verdict for a mailbox/attachment member.
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
			note: 'Excluded from mailbox archive audit actions by manual operator override.',
		}
	}

	if (survivor && member.selectionKey === survivor.selectionKey) {
		return {
			verdict: 'keep-canonical-survivor',
			verdictLabel: VERDICT_LABELS['keep-canonical-survivor'],
			actionKind: 'keep',
			note: `Canonical ${member.context.tierLabel} copy retained as the authoritative target.`,
		}
	}

	if (forceKeepKeys.has(member.selectionKey)) {
		return {
			verdict: 'blocked-manual-shield',
			verdictLabel: VERDICT_LABELS['blocked-manual-shield'],
			actionKind: 'shield',
			note: 'Protected by manual Keep override.',
		}
	}

	if (options.protectLegalHoldVaults && member.context.isLegalHoldVault) {
		return {
			verdict: 'blocked-legal-hold-vault',
			verdictLabel: VERDICT_LABELS['blocked-legal-hold-vault'],
			actionKind: 'shield',
			note: 'Strictly protected by Legal Hold & Compliance eDiscovery Guard; litigation and preservation vaults are never modified automatically.',
		}
	}

	if (options.protectActiveMailStores && member.context.isActiveMailStore) {
		return {
			verdict: 'blocked-active-mailstore',
			verdictLabel: VERDICT_LABELS['blocked-active-mailstore'],
			actionKind: 'shield',
			note: 'Protected by Active Mail Store Guard; unconsolidated .ost caches and live .pst databases require mail client export consolidation before removal.',
		}
	}

	if (options.protectSharedMailboxArchives && member.context.isSharedMailboxArchive) {
		return {
			verdict: 'blocked-shared-mailbox',
			verdictLabel: VERDICT_LABELS['blocked-shared-mailbox'],
			actionKind: 'shield',
			note: 'Protected by Shared Mailbox Archive Guard; secondary team mail vaults require owner review or hardlink consolidation.',
		}
	}

	if (options.strategy === 'hardlink-attachments-to-project') {
		return {
			verdict: 'hardlink-attachment-to-project',
			verdictLabel: VERDICT_LABELS['hardlink-attachment-to-project'],
			actionKind: 'hardlink',
			note: 'Replace redundant extracted attachment or archive mirror with a same-filesystem POSIX hardlink to the canonical project/vault survivor.',
		}
	}

	if (options.strategy === 'prune-stale-mbox-exports') {
		const isPruneEligible = member.context.isStaleExport
			|| member.context.isTakeoutExportDump
			|| member.context.isUserScratchMail
			|| member.context.isMailForwardFork
		if (!isPruneEligible) {
			return {
				verdict: 'blocked-not-stale-export',
				verdictLabel: VERDICT_LABELS['blocked-not-stale-export'],
				actionKind: 'shield',
				note: 'Retained by Prune Stale MBOX Exports strategy because copy is outside Takeout/scratch dumps and below stale age threshold.',
			}
		}
		return {
			verdict: 'reclaim-stale-export',
			verdictLabel: VERDICT_LABELS['reclaim-stale-export'],
			actionKind: 'reclaim',
			note: 'Stale Takeout dump, extracted attachment, or Re:/Fwd: mail copy superseded by canonical survivor.',
		}
	}

	if (member.context.isTakeoutExportDump || member.context.isUserScratchMail || member.context.isStaleExport) {
		return {
			verdict: 'reclaim-stale-export',
			verdictLabel: VERDICT_LABELS['reclaim-stale-export'],
			actionKind: 'reclaim',
			note: 'Redundant Takeout export, Mail Downloads copy, or extracted attachment superseded by canonical vault.',
		}
	}

	return {
		verdict: 'reclaim-mailbox-copy',
		verdictLabel: VERDICT_LABELS['reclaim-mailbox-copy'],
		actionKind: 'reclaim',
		note: 'Identical-hash mail archive or message copy outside protected vaults; safe to consolidate.',
	}
}

/**
 * Normalize analysis options into deterministic bounds.
 *
 * @param {object} [rawOptions] Caller options.
 * @return {object} Normalized options.
 */
function normalizeOptions(rawOptions = {}) {
	const familyFilter = MAILBOX_FAMILIES.includes(rawOptions.familyFilter)
		? rawOptions.familyFilter
		: 'all'
	const verdictFilter = MAILBOX_VERDICT_FILTERS.includes(rawOptions.verdictFilter)
		? rawOptions.verdictFilter
		: 'all'
	const sortMode = MAILBOX_SORT_MODES.includes(rawOptions.sortMode)
		? rawOptions.sortMode
		: 'reclaim_desc'
	const strategy = MAILBOX_STRATEGIES.includes(rawOptions.strategy)
		? rawOptions.strategy
		: 'consolidate-archive-vault'
	const survivorRule = MAILBOX_SURVIVOR_RULES.includes(rawOptions.survivorRule)
		? rawOptions.survivorRule
		: 'vault-authority-first'

	const parsedDays = Number.parseInt(rawOptions.staleExportDays, 10)
	const staleExportDays = Number.isFinite(parsedDays) && parsedDays >= 0
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
		protectLegalHoldVaults: rawOptions.protectLegalHoldVaults !== false,
		protectActiveMailStores: rawOptions.protectActiveMailStores !== false,
		protectSharedMailboxArchives: rawOptions.protectSharedMailboxArchives !== false,
		staleExportDays,
		minSizeKb,
		searchQuery: String(rawOptions.searchQuery || '').trim().toLowerCase(),
		referenceTimeSec,
		memberOverrides: rawOptions.memberOverrides && typeof rawOptions.memberOverrides === 'object'
			? rawOptions.memberOverrides
			: {},
	}
}

const FAMILY_PRIORITY = Object.freeze({
	'mailbox-containers': 4,
	'individual-messages': 3,
	'calendar-contacts': 2,
	'extracted-attachments': 1,
})

/**
 * Audit duplicate groups for mailbox containers, messages, calendars/contacts, and extracted attachments.
 *
 * @param {Array<object>} duplicates Loaded duplicate groups.
 * @param {object} [rawOptions] Auditor configuration options.
 * @return {object} Deterministic audit analysis with summary, counts, and clusters.
 */
export function analyzeMailboxArchiveDuplicates(duplicates, rawOptions = {}) {
	const options = normalizeOptions(rawOptions)
	const safeDuplicates = Array.isArray(duplicates) ? duplicates : []
	const minSizeBytes = options.minSizeKb * 1024

	const familyCounts = {
		all: 0,
		'mailbox-containers': 0,
		'individual-messages': 0,
		'calendar-contacts': 0,
		'extracted-attachments': 0,
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
			const info = classifyMailboxArtifact(file.path, file.mimetype)
			if (info && info.matched) {
				matchedEntries.push({ file, fileIdx, info })
			}
		}

		if (matchedEntries.length === 0) {
			continue
		}

		// Pick the strongest mail family signal in this identical-hash group.
		// For example, "invoice.pdf" in /Projects/ paired with "Re_ Fwd_ invoice.pdf" in /Mail Downloads/
		// yields an extracted-attachments cluster where /Projects/invoice.pdf is the project survivor.
		const primaryEntry = [...matchedEntries].sort((a, b) => {
			return (FAMILY_PRIORITY[b.info.family] || 0) - (FAMILY_PRIORITY[a.info.family] || 0)
		})[0]
		const primaryInfo = primaryEntry.info

		const rawInfo = computeGroupReclaimableInfo(group)
		const groupSizeBytes = Number(group.size) || validFiles.reduce((max, f) => Math.max(max, Number(f.size) || 0), 0)
		if (minSizeBytes > 0 && groupSizeBytes < minSizeBytes) {
			continue
		}

		const forceKeepKeys = new Set()
		const excludeKeys = new Set()

		const members = validFiles.map((file, fileIdx) => {
			const normalizedPath = normalizePathForDiff(file.path) || String(file.path || '')
			const basename = extractBasename(normalizedPath)
			const selectionKey = String(getFileSelectionKey(file, `${groupIdx}-${fileIdx}`))
			const override = options.memberOverrides[selectionKey] || 'auto'
			if (override === 'force-keep') {
				forceKeepKeys.add(selectionKey)
			} else if (override === 'exclude') {
				excludeKeys.add(selectionKey)
			}

			const directInfo = classifyMailboxArtifact(file.path, file.mimetype)
			const memberInfo = directInfo && directInfo.matched ? directInfo : primaryInfo
			const context = inspectMailboxMemberContext(file, memberInfo, options.referenceTimeSec, options.staleExportDays)
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
		const legalHoldCopiesCount = members.filter(m => m.verdict === 'blocked-legal-hold-vault' || m.context.isLegalHoldVault).length
		const activeMailStoreCopiesCount = members.filter(m => m.verdict === 'blocked-active-mailstore' || m.context.isActiveMailStore).length
		const takeoutCopiesCount = members.filter(m => m.context.isTakeoutExportDump).length
		const extractedAttachmentCopiesCount = members.filter(m => m.context.isExtractedAttachmentLocation || m.context.hasMailForwardPrefix).length

		const hasLegalHoldVault = members.some(m => m.context.isLegalHoldVault)
		const hasActiveMailStore = members.some(m => m.context.isActiveMailStore)
		const hasTakeoutExport = members.some(m => m.context.isTakeoutExportDump)
		const hasExtractedAttachment = members.some(m => m.context.isExtractedAttachmentLocation || m.context.hasMailForwardPrefix)

		let clusterRiskState = 'reclaimable'
		if (legalHoldCopiesCount > 0 && members.some(m => m.verdict === 'blocked-legal-hold-vault')) {
			clusterRiskState = 'legal-hold'
		} else if (members.some(m => m.verdict === 'blocked-active-mailstore')) {
			clusterRiskState = 'active-mailstore'
		} else if (reclaimableCopiesCount === 0) {
			clusterRiskState = 'shielded'
		}

		const primaryGroupId = group.id ?? null
		const groupKey = String(group.hash || primaryGroupId || `mailbox-${groupIdx}`)
		const displayName = survivor ? survivor.basename : members[0].basename
		const governanceSignals = Array.from(new Set(members.map(m => m.tier)))

		rawClusters.push({
			groupKey,
			primaryGroupId,
			hash: group.hash || '',
			displayName,
			basename: displayName,
			normalizedStem: primaryInfo.normalizedStem,
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
			legalHoldCopiesCount,
			activeMailStoreCopiesCount,
			takeoutCopiesCount,
			extractedAttachmentCopiesCount,
			hasLegalHoldVault,
			hasActiveMailStore,
			hasTakeoutExport,
			hasExtractedAttachment,
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
			|| cluster.normalizedStem.toLowerCase().includes(q)
			|| cluster.extension.toLowerCase().includes(q)
			|| cluster.familyLabel.toLowerCase().includes(q)
			|| cluster.governanceSummary.toLowerCase().includes(q)
		) {
			return true
		}
		return cluster.members.some(m => m.normalizedPath.toLowerCase().includes(q) || m.basename.toLowerCase().includes(q))
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
		if (options.verdictFilter === 'legal-hold' && !cluster.hasLegalHoldVault) {
			return false
		}
		if (options.verdictFilter === 'active-mailstores' && !cluster.hasActiveMailStore) {
			return false
		}
		if (options.verdictFilter === 'takeout-exports' && !cluster.hasTakeoutExport && cluster.extractedAttachmentCopiesCount === 0) {
			return false
		}
		if (options.verdictFilter === 'shielded' && cluster.shieldedCopiesCount === 0 && cluster.clusterRiskState !== 'shielded') {
			return false
		}
		return true
	})

	clusters.sort((a, b) => {
		if (options.sortMode === 'risk_desc') {
			const riskA = a.legalHoldCopiesCount * 5 + a.activeMailStoreCopiesCount * 3 + a.takeoutCopiesCount * 2 + a.shieldedCopiesCount
			const riskB = b.legalHoldCopiesCount * 5 + b.activeMailStoreCopiesCount * 3 + b.takeoutCopiesCount * 2 + b.shieldedCopiesCount
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
	const totalLegalHoldClusters = clusters.filter(c => c.hasLegalHoldVault).length
	const totalActiveMailStoreClusters = clusters.filter(c => c.hasActiveMailStore).length
	const totalExtractedAttachmentsCount = clusters.reduce((sum, c) => sum + c.extractedAttachmentCopiesCount, 0)
	const efficiencyPct = totalRawDuplicateBytes > 0
		? Math.round((totalReclaimableBytes / totalRawDuplicateBytes) * 100)
		: 0

	return {
		schema: MAILBOX_ARCHIVE_SCHEMA,
		options: {
			familyFilter: options.familyFilter,
			verdictFilter: options.verdictFilter,
			sortMode: options.sortMode,
			strategy: options.strategy,
			survivorRule: options.survivorRule,
			protectLegalHoldVaults: options.protectLegalHoldVaults,
			protectActiveMailStores: options.protectActiveMailStores,
			protectSharedMailboxArchives: options.protectSharedMailboxArchives,
			staleExportDays: options.staleExportDays,
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
			totalLegalHoldClusters,
			totalActiveMailStoreClusters,
			totalExtractedAttachmentsCount,
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
 * Build a POSIX DRY_RUN=1 remediation script for mailbox, message, calendar, and extracted attachment consolidation.
 *
 * @param {object} analysis Output from analyzeMailboxArchiveDuplicates.
 * @param {object} [options] Script options.
 * @param {string} [options.dataRoot='/var/www/nextcloud/data'] Nextcloud data root directory.
 * @return {string} POSIX bash script with single-quoted paths, SHA-256 verification, cross-device stat guard, and DRY_RUN=1 default.
 */
export function buildMailboxArchiveScript(analysis, options = {}) {
	const dataRoot = String(options.dataRoot || '/var/www/nextcloud/data').replace(/\/+$/, '') || '/var/www/nextcloud/data'
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const strategy = (analysis && analysis.options && analysis.options.strategy) || 'consolidate-archive-vault'

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
		'# Email Archive, Mailbox Dump & Extracted Attachment Redundancy Auditor',
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
		lines.push('echo "No reclaimable or hardlinkable mailbox, message, or extracted attachment targets under current guards."')
		return lines.join('\n')
	}

	lines.push('reclaim_mailbox_copy() {')
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
	lines.push('hardlink_attachment_to_project() {')
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
			lines.push(`hardlink_attachment_to_project ${escapePosixSingleQuote(op.survivorPath)} ${escapePosixSingleQuote(op.targetPath)}`)
		} else {
			lines.push(`reclaim_mailbox_copy ${escapePosixSingleQuote(op.survivorPath)} ${escapePosixSingleQuote(op.targetPath)}`)
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
 * Build a Nextcloud Desktop .sync-exclude.lst snippet for mailbox lockfiles and temporary dumps.
 *
 * @param {object} analysis Output from analyzeMailboxArchiveDuplicates.
 * @return {string} Newline-delimited Nextcloud sync-exclude patterns.
 */
export function buildMailboxSyncExcludeSnippet(analysis) {
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const lines = [
		'# Nextcloud Desktop .sync-exclude.lst rules for Outlook/Thunderbird mailbox lockfiles and temp dumps',
		'~$*.pst',
		'*.pst.tmp',
		'*.ost.tmp',
		'*.mbox.tmp',
		'*.msf',
		'.lock',
		'*.lock',
	]
	const seen = new Set(lines)
	for (const cluster of clusters) {
		if (cluster && cluster.extension) {
			const ext = cluster.extension.toLowerCase()
			if (['pst', 'ost', 'mbox', 'mbx', 'olm', 'nsf'].includes(ext)) {
				const tmpPattern = `*.${ext}.tmp`
				if (!seen.has(tmpPattern)) {
					lines.push(tmpPattern)
					seen.add(tmpPattern)
				}
			}
		}
	}
	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe CSV audit report for mailbox and attachment clusters.
 *
 * @param {object} analysis Output from analyzeMailboxArchiveDuplicates.
 * @return {string} RFC-4180 CSV string with CWE-1236 formula escaping.
 */
export function buildMailboxArchiveCsvReport(analysis) {
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const headers = [
		'Cluster Key',
		'Archive / File Name',
		'Attachment Stem',
		'Extension',
		'Family',
		'Governance Tier',
		'Legal Hold / eDiscovery',
		'Active Mail Store',
		'Takeout Export',
		'Extracted Attachment',
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
				member.context.normalizedStem,
				member.extension,
				cluster.familyLabel,
				member.tierLabel,
				member.context.isLegalHoldVault ? 'yes' : 'no',
				member.context.isActiveMailStore ? 'yes' : 'no',
				member.context.isTakeoutExportDump ? 'yes' : 'no',
				member.context.isExtractedAttachmentLocation || member.context.hasMailForwardPrefix ? 'yes' : 'no',
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
 * Build a structured JSON audit manifest for email archive, mailbox dump, and attachment clusters.
 *
 * @param {object} analysis Output from analyzeMailboxArchiveDuplicates.
 * @param {string} [generatedAt] Optional ISO timestamp override.
 * @return {string} Pretty-printed JSON manifest.
 */
export function buildMailboxArchiveJsonReport(analysis, generatedAt = new Date().toISOString()) {
	const safeAnalysis = analysis && typeof analysis === 'object' ? analysis : { summary: {}, clusters: [], options: {} }
	return JSON.stringify({
		schema: MAILBOX_ARCHIVE_SCHEMA,
		generatedAt,
		options: safeAnalysis.options || {},
		summary: safeAnalysis.summary || {},
		clusters: (safeAnalysis.clusters || []).map(cluster => ({
			groupKey: cluster.groupKey,
			primaryGroupId: cluster.primaryGroupId,
			hash: cluster.hash,
			basename: cluster.basename,
			normalizedStem: cluster.normalizedStem,
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
				isLegalHoldVault: member.context.isLegalHoldVault,
				isComplianceEdiscovery: member.context.isComplianceEdiscovery,
				isActiveMailStore: member.context.isActiveMailStore,
				isSharedMailboxArchive: member.context.isSharedMailboxArchive,
				isTakeoutExportDump: member.context.isTakeoutExportDump,
				isExtractedAttachmentLocation: member.context.isExtractedAttachmentLocation,
				hasMailForwardPrefix: member.context.hasMailForwardPrefix,
				authorityScore: member.context.authorityScore,
			})),
		})),
	}, null, 2)
}
