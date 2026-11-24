/**
 * Pure Email Archive, Mailbox Export & Attachment Vault Auditor.
 * Classifies and audits duplicate clusters across 4 Email & Archival Vault families:
 * - Mailbox Archives (*.mbox, *.pst, *.ost, *.mbx, *.olm)
 * - Individual Messages (*.eml, *.msg, *.emlx)
 * - IMAP / Thunderbird / Apple Mail Backup Snapshots (*.msf, *.wdseml, *.sbd, ImapMail/Maildir/AppleMail snapshot trees)
 * - Mirrored Email Attachment Dumps (duplicate attachment exports under /attachments/, /mail-attachments/, /saved-attachments/, etc.)
 *
 * Groups artifacts deterministically by mailbox/account + period + normalized subject/attachment signature,
 * protects legal-hold and latest primary mailbox archive anchors by default,
 * and computes safe reclaimable GB plus POSIX DRY_RUN=1 remediation scripts, CWE-1236 CSV exports,
 * JSON manifests, and .sync-exclude.lst rules.
 *
 * Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const EMAIL_ARCHIVE_VAULT_SCHEMA = 'duplicatefinder.email-archive-vault-auditor.v1'

export const EMAIL_ARCHIVE_FAMILIES = Object.freeze([
	'all',
	'mailbox-archives',
	'individual-messages',
	'mail-client-backup-snapshots',
	'mirrored-email-attachments',
])

export const EMAIL_ARCHIVE_FAMILY_META = Object.freeze({
	'mailbox-archives': {
		id: 'mailbox-archives',
		label: 'Mailbox Archives',
		shortLabel: 'Archives (.mbox/.pst/.ost/.mbx/.olm)',
	},
	'individual-messages': {
		id: 'individual-messages',
		label: 'Individual Messages',
		shortLabel: 'Messages (.eml/.msg/.emlx)',
	},
	'mail-client-backup-snapshots': {
		id: 'mail-client-backup-snapshots',
		label: 'IMAP / Mail Client Snapshots',
		shortLabel: 'Snapshots (.msf/.wdseml/.sbd & Thunderbird/Apple Mail)',
	},
	'mirrored-email-attachments': {
		id: 'mirrored-email-attachments',
		label: 'Mirrored Attachment Dumps',
		shortLabel: 'Attachments (mirrored mail attachment exports)',
	},
})

export const EMAIL_ARCHIVE_STRATEGIES = Object.freeze([
	'prune-stale-exports-and-mirror-attachments',
	'consolidate-mailbox-vault-hardlinks',
	'prune-mail-client-indexes-and-attachment-dumps',
])

export const EMAIL_ARCHIVE_SURVIVOR_RULES = Object.freeze([
	'legal-hold-and-primary-vault-first',
	'latest-period-first',
	'archive-container-first',
	'shortest-path',
])

export const EMAIL_ARCHIVE_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'legal-hold',
	'primary-anchor',
	'snapshot-index',
	'attachment-dump',
	'shielded',
])

export const EMAIL_ARCHIVE_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'period_desc',
	'copies_desc',
	'name_asc',
])

export const EMAIL_ARCHIVE_PRESETS = Object.freeze([
	{
		id: 'all-email-vault-audit',
		name: 'All Email Vault Audit',
		description: 'Audit mailbox containers, individual messages, IMAP/Thunderbird/Apple Mail snapshots, and mirrored attachment dumps while shielding legal-hold and latest primary anchors.',
		familyFilter: 'all',
		strategy: 'prune-stale-exports-and-mirror-attachments',
		survivorRule: 'legal-hold-and-primary-vault-first',
		protectLegalHold: true,
		protectLatestPrimaryArchive: true,
		keepPreviousArchivePeriods: 1,
		staleSnapshotDays: 30,
		minSizeMb: 0,
	},
	{
		id: 'prune-imap-and-thunderbird-snapshots',
		name: 'Prune IMAP & Mail Snapshots',
		description: 'Reclaim stale .msf, .wdseml, .sbd, and Thunderbird/Apple Mail cache snapshots older than the retention threshold.',
		familyFilter: 'mail-client-backup-snapshots',
		strategy: 'prune-mail-client-indexes-and-attachment-dumps',
		survivorRule: 'legal-hold-and-primary-vault-first',
		protectLegalHold: true,
		protectLatestPrimaryArchive: true,
		keepPreviousArchivePeriods: 1,
		staleSnapshotDays: 30,
		minSizeMb: 0,
	},
	{
		id: 'reclaim-mirrored-attachment-dumps',
		name: 'Reclaim Attachment Dumps',
		description: 'Target duplicated email attachment exports across download/inbox mirrors while preserving canonical legal-hold folders.',
		familyFilter: 'mirrored-email-attachments',
		strategy: 'prune-mail-client-indexes-and-attachment-dumps',
		survivorRule: 'legal-hold-and-primary-vault-first',
		protectLegalHold: true,
		protectLatestPrimaryArchive: true,
		keepPreviousArchivePeriods: 1,
		staleSnapshotDays: 30,
		minSizeMb: 0,
	},
	{
		id: 'consolidate-mailbox-hardlinks',
		name: 'Hardlink-Consolidate Mailboxes',
		description: 'Consolidate duplicate .mbox, .pst, .ost, and .eml exports onto canonical primary archive anchors via POSIX hardlinks.',
		familyFilter: 'mailbox-archives',
		strategy: 'consolidate-mailbox-vault-hardlinks',
		survivorRule: 'archive-container-first',
		protectLegalHold: true,
		protectLatestPrimaryArchive: true,
		keepPreviousArchivePeriods: 1,
		staleSnapshotDays: 30,
		minSizeMb: 0,
	},
	{
		id: 'audit-individual-messages',
		name: 'Individual Messages (.eml/.msg)',
		description: 'Audit duplicate .eml, .msg, and .emlx message exports grouped by mailbox account, period, and normalized subject.',
		familyFilter: 'individual-messages',
		strategy: 'prune-stale-exports-and-mirror-attachments',
		survivorRule: 'latest-period-first',
		protectLegalHold: true,
		protectLatestPrimaryArchive: true,
		keepPreviousArchivePeriods: 1,
		staleSnapshotDays: 30,
		minSizeMb: 0,
	},
])

const MAILBOX_ARCHIVE_EXT_SET = new Set([
	'mbox',
	'pst',
	'ost',
	'mbx',
	'olm',
])

const MESSAGE_EXT_SET = new Set([
	'eml',
	'msg',
	'emlx',
])

const SNAPSHOT_EXT_SET = new Set([
	'msf',
	'wdseml',
	'sbd',
])

const ATTACHMENT_PATH_RE = /(\/(?:email[_-]?attachments?|mail[_-]?attachments?|saved[_-]?attachments?|outlook[_-]?attachments?|thunderbird[_-]?attachments?|emlx[_-]?attachments?|attachments?[_-]?dump|attachments?[_-]?export|attachments?)(?:\/|$))/i
const ATTACHMENT_NAME_RE = /(?:^|[._-])(?:att\d{3,}|mail[_-]?attachment|email[_-]?attachment|attachment[_-]?dump)(?:[._-]|$)/i

const MAIL_CLIENT_SNAPSHOT_PATH_RE = /(\/(?:imapmail|thunderbird|apple[_-]?mail|mail\.app|maildir|local\s+folders|profiles?\/[^/]+\/(?:imapmail|mail)|v\d+\/[0-9a-f-]{8,})(?:\/|$)|\.sbd\/)/i
const MAIL_CLIENT_INDEX_NAME_RE = /^(?:envelope\s*index|msgfilterrules\.dat|popstate\.dat|folderTree\.json|panacea\.dat|global-messages-db\.sqlite)$/i

const LEGAL_HOLD_RE = /(\/(?:legal[_-]?hold|litigation[_-]?hold|litigation|e-?discovery|compliance[_-]?hold|audit[_-]?hold|regulatory[_-]?hold|gdpr[_-]?hold|hold[_-]?vault)(?:\/|$)|(?:^|[._-])(?:legal[_-]?hold|litigation[_-]?hold|ediscovery|audit[_-]?hold)(?:[._-]|$))/i
const PRIMARY_MAIL_VAULT_RE = /(\/(?:mail[_-]?archives?|mailbox[_-]?vault|email[_-]?vault|mailboxes?|archives?\/(?:mail|email)|__groupfolders\/\d+\/(?:mail|email|archives?)|legal[_-]?hold|compliance)(?:\/|$))/i
const EXPORT_STAGING_PATH_RE = /(\/(?:downloads?|telechargements?|tmp|temp|scratch|staging|mail[_-]?exports?|email[_-]?exports?|takeout|backups?[_-]?tmp|imap[_-]?cache|thunderbird[_-]?cache|saved[_-]?attachments?|attachments?[_-]?dump|desktop|dropzone|incoming)(?:\/|$))/i

const EMAIL_ADDRESS_RE = /([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i
const PERIOD_YYYY_MM_RE = /(?:^|[/._-])((?:19|20)\d{2})[-_](0[1-9]|1[0-2])(?:[/._-]|$)/
const PERIOD_YYYY_Q_RE = /(?:^|[/._-])((?:19|20)\d{2})[-_]?q([1-4])(?:[/._-]|$)/i
const PERIOD_YYYY_RE = /(?:^|[/._-])((?:19|20)\d{2})(?:[/._-]|$)/

const IGNORED_ACCOUNT_SEGMENTS = new Set([
	'files',
	'mail',
	'email',
	'emails',
	'mailbox',
	'mailboxes',
	'mail-archives',
	'mail_archives',
	'mailbox-vault',
	'email-vault',
	'archives',
	'archive',
	'exports',
	'export',
	'mail-exports',
	'email-exports',
	'attachments',
	'mail-attachments',
	'email-attachments',
	'saved-attachments',
	'attachments-dump',
	'downloads',
	'telechargements',
	'tmp',
	'temp',
	'staging',
	'backup',
	'backups',
	'snapshots',
	'imapmail',
	'thunderbird',
	'apple-mail',
	'maildir',
	'legal-hold',
	'litigation-hold',
	'ediscovery',
	'compliance',
	'__groupfolders',
	'users',
	'home',
	'var',
	'www',
	'nextcloud',
	'data',
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
 * Extract lowercase file extension without leading dot.
 *
 * @param {string} basename File basename.
 * @return {string} Lowercase extension.
 */
function getExtension(basename) {
	if (!basename || typeof basename !== 'string') {
		return ''
	}
	const dotIdx = basename.lastIndexOf('.')
	if (dotIdx <= 0 || dotIdx === basename.length - 1) {
		return ''
	}
	return basename.slice(dotIdx + 1).toLowerCase()
}

/**
 * Extract mailbox or account identifier from path or basename.
 *
 * @param {string} basename File basename.
 * @param {string} fullPath Full normalized path.
 * @return {string} Normalized mailbox/account identifier.
 */
export function extractMailboxAccount(basename, fullPath = '') {
	const pathEmail = EMAIL_ADDRESS_RE.exec(fullPath) || EMAIL_ADDRESS_RE.exec(basename)
	if (pathEmail) {
		return pathEmail[1].toLowerCase()
	}

	const segments = safeNormalizePath(fullPath).split('/').filter(Boolean)
	// Skip the filename itself
	const dirSegments = segments.slice(0, -1)

	// Prefer a folder right after mail/mailbox/archives/legal-hold/exports
	for (let i = 0; i < dirSegments.length; i += 1) {
		const segLower = dirSegments[i].toLowerCase()
		if (
			/^(?:mail|email|mailboxes?|mail[_-]?archives?|mailbox[_-]?vault|email[_-]?vault|legal[_-]?hold|ediscovery|mail[_-]?exports?|imapmail|thunderbird|apple[_-]?mail)$/.test(segLower)
			&& i + 1 < dirSegments.length
		) {
			const nextSeg = dirSegments[i + 1].replace(/\.sbd$/i, '')
			const nextLower = nextSeg.toLowerCase()
			if (
				nextLower
				&& !IGNORED_ACCOUNT_SEGMENTS.has(nextLower)
				&& !/^(?:19|20)\d{2}(?:[-_](?:0[1-9]|1[0-2]|q[1-4]))?$/i.test(nextLower)
			) {
				return nextLower.replace(/[^a-z0-9@._-]+/g, '-')
			}
		}
	}

	// Fallback: first non-ignored segment (e.g. Nextcloud user root or account folder)
	for (const seg of dirSegments) {
		const clean = seg.replace(/\.sbd$/i, '').toLowerCase()
		if (
			clean
			&& !IGNORED_ACCOUNT_SEGMENTS.has(clean)
			&& !/^\d+$/.test(clean)
			&& !/^(?:19|20)\d{2}(?:[-_](?:0[1-9]|1[0-2]|q[1-4]))?$/i.test(clean)
		) {
			return clean.replace(/[^a-z0-9@._-]+/g, '-')
		}
	}

	return 'shared-mailbox'
}

/**
 * Parse archival period (YYYY-MM, YYYY-Q#, or YYYY) from filename, path, or mtime.
 *
 * @param {string} basename File basename.
 * @param {string} fullPath Full normalized path.
 * @param {number} [mtimeSec=0] Optional fallback modified timestamp in epoch seconds.
 * @return {object} Parsed period metadata with comparable sortKey.
 */
export function parseArchivePeriod(basename, fullPath = '', mtimeSec = 0) {
	const sources = [basename, fullPath]
	for (const src of sources) {
		const ym = PERIOD_YYYY_MM_RE.exec(src)
		if (ym) {
			const year = Number.parseInt(ym[1], 10)
			const month = Number.parseInt(ym[2], 10)
			return {
				label: `${year}-${String(month).padStart(2, '0')}`,
				year,
				month,
				quarter: Math.ceil(month / 3),
				sortKey: year * 100 + month,
				explicit: true,
			}
		}
		const yq = PERIOD_YYYY_Q_RE.exec(src)
		if (yq) {
			const year = Number.parseInt(yq[1], 10)
			const quarter = Number.parseInt(yq[2], 10)
			return {
				label: `${year}-Q${quarter}`,
				year,
				month: quarter * 3,
				quarter,
				sortKey: year * 100 + quarter * 3,
				explicit: true,
			}
		}
	}

	for (const src of sources) {
		const y = PERIOD_YYYY_RE.exec(src)
		if (y) {
			const year = Number.parseInt(y[1], 10)
			return {
				label: String(year),
				year,
				month: 12,
				quarter: 4,
				sortKey: year * 100 + 12,
				explicit: true,
			}
		}
	}

	if (Number.isFinite(mtimeSec) && mtimeSec > 0) {
		const d = new Date(mtimeSec * 1000)
		const year = d.getUTCFullYear()
		const month = d.getUTCMonth() + 1
		return {
			label: `${year}-${String(month).padStart(2, '0')}`,
			year,
			month,
			quarter: Math.ceil(month / 3),
			sortKey: year * 100 + month,
			explicit: false,
		}
	}

	return {
		label: 'undated',
		year: 0,
		month: 0,
		quarter: 0,
		sortKey: 0,
		explicit: false,
	}
}

/**
 * Normalize an email subject or attachment filename into a deterministic grouping signature.
 *
 * @param {string} basename File basename.
 * @return {string} Normalized subject/attachment slug.
 */
export function normalizeSubjectOrAttachmentSignature(basename) {
	if (!basename || typeof basename !== 'string') {
		return 'untitled'
	}
	let stem = basename.trim()
	// Strip known email/snapshot extensions or final extension
	const dotIdx = stem.lastIndexOf('.')
	if (dotIdx > 0) {
		stem = stem.slice(0, dotIdx)
	}
	// Strip secondary .mbox / .sbd / .emlx if chained (e.g. INBOX.mbox.msf)
	stem = stem.replace(/\.(?:mbox|pst|ost|eml|msg|emlx|sbd)$/i, '')

	// Strip reply/forward prefixes repeatedly
	let prev = ''
	while (prev !== stem) {
		prev = stem
		stem = stem.replace(/^(?:(?:re|fwd?|tr|aw|sv|vs)\s*[:_-]\s*)+/i, '')
	}

	// Strip leading date prefixes like 2025-11-04_ or 20251104-
	stem = stem.replace(/^(?:19|20)\d{2}[-_]?(?:0[1-9]|1[0-2])[-_]?(?:0[1-9]|[12]\d|3[01])[-_\s]+/, '')
	// Strip copy/export suffixes like (1), _copy, -backup, -export
	stem = stem.replace(/(?:\s*\(\d+\)|[._-]+(?:copy|backup|export|dup|duplicate|old|bak|final|v\d+))+$/gi, '')
	// Normalize whitespace & punctuation to slug
	stem = stem
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')

	return stem || 'mailbox-item'
}

/**
 * Detect email client / format badge for display.
 *
 * @param {string} ext File extension.
 * @param {string} basename File basename.
 * @param {string} fullPath Full normalized path.
 * @param {string} family Assigned family ID.
 * @return {object} Format badge & mail client label.
 */
function detectMailFormatAndClient(ext, basename, fullPath, family) {
	const lowerPath = fullPath.toLowerCase()
	let client = 'Generic Mail'
	if (ext === 'pst' || ext === 'ost' || ext === 'msg' || lowerPath.includes('outlook')) {
		client = 'Outlook'
	} else if (ext === 'msf' || ext === 'wdseml' || ext === 'sbd' || lowerPath.includes('thunderbird') || lowerPath.includes('imapmail')) {
		client = 'Thunderbird / IMAP'
	} else if (ext === 'emlx' || ext === 'olm' || lowerPath.includes('apple-mail') || lowerPath.includes('applemail') || lowerPath.includes('mail.app')) {
		client = 'Apple Mail'
	} else if (ext === 'mbox' || ext === 'mbx' || lowerPath.includes('maildir')) {
		client = 'MBOX / IMAP'
	}

	let formatBadge = ext ? `.${ext}` : 'mail'
	if (family === 'mirrored-email-attachments') {
		formatBadge = ext ? `ATT .${ext}` : 'Attachment'
	} else if (MAIL_CLIENT_INDEX_NAME_RE.test(basename)) {
		formatBadge = 'Mail Index'
	}

	return { client, formatBadge }
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
 * Classify a single file into one of the 4 Email Archive & Attachment Vault families.
 *
 * @param {object} file Duplicate file entry.
 * @return {object|null} Classification metadata or null if unrelated.
 */
export function classifyEmailArchiveFile(file) {
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

	const isMailboxArchive = MAILBOX_ARCHIVE_EXT_SET.has(ext)
	const isIndividualMessage = !isMailboxArchive && MESSAGE_EXT_SET.has(ext)
	const isClientSnapshot = !isMailboxArchive && !isIndividualMessage && (
		SNAPSHOT_EXT_SET.has(ext)
		|| MAIL_CLIENT_INDEX_NAME_RE.test(basename)
		|| (MAIL_CLIENT_SNAPSHOT_PATH_RE.test(path) && !ATTACHMENT_PATH_RE.test(path))
	)
	const isMirroredAttachment = !isMailboxArchive && !isIndividualMessage && !isClientSnapshot && (
		ATTACHMENT_PATH_RE.test(path) || ATTACHMENT_NAME_RE.test(basename)
	)

	if (!isMailboxArchive && !isIndividualMessage && !isClientSnapshot && !isMirroredAttachment) {
		return null
	}

	let family = 'mailbox-archives'
	let artifactKind = 'mailbox-archive'
	if (isIndividualMessage) {
		family = 'individual-messages'
		artifactKind = 'message'
	} else if (isClientSnapshot) {
		family = 'mail-client-backup-snapshots'
		artifactKind = 'snapshot-index'
	} else if (isMirroredAttachment) {
		family = 'mirrored-email-attachments'
		artifactKind = 'attachment-dump'
	}

	const account = extractMailboxAccount(basename, path)
	const period = parseArchivePeriod(basename, path, mtimeSec)
	const subjectSignature = normalizeSubjectOrAttachmentSignature(basename)
	const { client, formatBadge } = detectMailFormatAndClient(ext, basename, path, family)

	const isLegalHold = LEGAL_HOLD_RE.test(path) || LEGAL_HOLD_RE.test(basename)
	const inExportStaging = EXPORT_STAGING_PATH_RE.test(path) && !isLegalHold
	const inPrimaryVault = (PRIMARY_MAIL_VAULT_RE.test(path) || isLegalHold) && !inExportStaging

	const vaultKey = `${account}@${period.label}/${subjectSignature}`
	const accountLineKey = `${account}/${family}`

	return {
		path,
		dirname: getDirname(path),
		basename,
		ext,
		family,
		artifactKind,
		client,
		formatBadge,
		account,
		period,
		subjectSignature,
		isLegalHold,
		inPrimaryVault,
		inExportStaging,
		vaultKey,
		accountLineKey,
	}
}

/**
 * Format bytes as GB string with 2 decimals (e.g. "1.42 GB").
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
 * Build cross-dataset period & legal-hold index so primary mailbox archives know
 * which period is the latest canonical archive per account.
 *
 * @param {Array<object>} duplicateGroups Raw duplicate groups.
 * @return {object} Cross-group archival index.
 */
function buildMailboxVaultIndex(duplicateGroups) {
	const periodsByAccount = new Map()
	const legalHoldAccounts = new Set()
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
			const meta = classifyEmailArchiveFile(file)
			if (!meta) {
				continue
			}
			if (meta.isLegalHold) {
				legalHoldAccounts.add(meta.account)
			}
			if (meta.family === 'mailbox-archives' && meta.period.sortKey > 0) {
				if (!periodsByAccount.has(meta.account)) {
					periodsByAccount.set(meta.account, new Map())
				}
				periodsByAccount.get(meta.account).set(meta.period.label, meta.period.sortKey)
			}
		}
	}

	const periodRankByAccountAndLabel = new Map()
	for (const [account, periodMap] of periodsByAccount.entries()) {
		const sorted = Array.from(periodMap.entries()).sort((a, b) => b[1] - a[1])
		sorted.forEach(([label], idx) => {
			periodRankByAccountAndLabel.set(`${account}@${label}`, idx)
		})
	}

	return {
		legalHoldAccounts,
		periodRankByAccountAndLabel,
		referenceNowSec: maxMtimeSec > 0 ? maxMtimeSec : Math.floor(Date.now() / 1000),
	}
}

/**
 * Score a file copy's authority as canonical survivor anchor (0-100).
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
	if (member.meta.inPrimaryVault) {
		score += 24
	}
	if (member.meta.inExportStaging) {
		score -= 26
	}
	if (member.meta.family === 'mailbox-archives') {
		score += 10
	} else if (member.meta.family === 'mail-client-backup-snapshots') {
		score -= 12
	} else if (member.meta.family === 'mirrored-email-attachments') {
		score -= 8
	}
	if (member.isInOriginFolder) {
		score += 18
	}

	if (survivorRule === 'latest-period-first') {
		if (member.periodRank === 0) {
			score += 16
		} else if (member.meta.period.year >= 2024) {
			score += 8
		}
	} else if (survivorRule === 'archive-container-first') {
		if (member.meta.family === 'mailbox-archives') {
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
	if (a.meta.isLegalHold !== b.meta.isLegalHold) {
		return a.meta.isLegalHold ? -1 : 1
	}
	if (a.isInOriginFolder !== b.isInOriginFolder) {
		return a.isInOriginFolder ? -1 : 1
	}

	if (survivorRule === 'latest-period-first') {
		if (a.meta.period.sortKey !== b.meta.period.sortKey) {
			return b.meta.period.sortKey - a.meta.period.sortKey
		}
	} else if (survivorRule === 'archive-container-first') {
		const aIsContainer = a.meta.family === 'mailbox-archives'
		const bIsContainer = b.meta.family === 'mailbox-archives'
		if (aIsContainer !== bIsContainer) {
			return aIsContainer ? -1 : 1
		}
	} else if (survivorRule === 'shortest-path') {
		if (a.meta.path.length !== b.meta.path.length) {
			return a.meta.path.length - b.meta.path.length
		}
	}

	if (a.authorityScore !== b.authorityScore) {
		return b.authorityScore - a.authorityScore
	}
	if (a.meta.inPrimaryVault !== b.meta.inPrimaryVault) {
		return a.meta.inPrimaryVault ? -1 : 1
	}
	if (a.mtimeSec !== b.mtimeSec) {
		return b.mtimeSec - a.mtimeSec
	}
	return a.meta.path.localeCompare(b.meta.path)
}

/**
 * Analyze duplicate groups for Email Archive, Mailbox Export & Attachment Vault governance.
 *
 * @param {Array<object>} duplicateGroups Array of duplicate group objects.
 * @param {object} [options] Analysis configuration options.
 * @return {object} Deterministic audit report.
 */
export function analyzeEmailArchiveVault(duplicateGroups, options = {}) {
	const groups = Array.isArray(duplicateGroups) ? duplicateGroups.filter(Boolean) : []
	const familyFilter = EMAIL_ARCHIVE_FAMILIES.includes(options.familyFilter) ? options.familyFilter : 'all'
	const verdictFilter = EMAIL_ARCHIVE_VERDICT_FILTERS.includes(options.verdictFilter) ? options.verdictFilter : 'all'
	const sortMode = EMAIL_ARCHIVE_SORT_MODES.includes(options.sortMode) ? options.sortMode : 'reclaim_desc'
	const strategy = EMAIL_ARCHIVE_STRATEGIES.includes(options.strategy)
		? options.strategy
		: 'prune-stale-exports-and-mirror-attachments'
	const survivorRule = EMAIL_ARCHIVE_SURVIVOR_RULES.includes(options.survivorRule)
		? options.survivorRule
		: 'legal-hold-and-primary-vault-first'

	const protectLegalHold = options.protectLegalHold !== false
	const protectLatestPrimaryArchive = options.protectLatestPrimaryArchive !== false
	const keepPreviousArchivePeriods = Number.isFinite(Number(options.keepPreviousArchivePeriods)) && Number(options.keepPreviousArchivePeriods) >= 0
		? Math.floor(Number(options.keepPreviousArchivePeriods))
		: 1
	const staleSnapshotDays = Number.isFinite(Number(options.staleSnapshotDays)) && Number(options.staleSnapshotDays) >= 0
		? Number(options.staleSnapshotDays)
		: 30
	const minSizeMb = Number.isFinite(Number(options.minSizeMb)) && Number(options.minSizeMb) > 0
		? Number(options.minSizeMb)
		: 0
	const minSizeBytes = minSizeMb * 1024 * 1024
	const searchQuery = typeof options.searchQuery === 'string' ? options.searchQuery.trim().toLowerCase() : ''
	const memberOverrides = options.memberOverrides && typeof options.memberOverrides === 'object'
		? options.memberOverrides
		: {}

	const index = buildMailboxVaultIndex(groups)
	const referenceNowSec = Number.isFinite(Number(options.referenceNowSec)) && Number(options.referenceNowSec) > 0
		? Number(options.referenceNowSec)
		: index.referenceNowSec

	const allClusters = []

	for (const group of groups) {
		const files = Array.isArray(group.files) ? group.files.filter(Boolean) : []
		if (files.length < 2) {
			continue
		}

		const classifiedMembers = []
		for (const file of files) {
			const meta = classifyEmailArchiveFile(file)
			if (!meta) {
				continue
			}
			const size = Number.isFinite(Number(file.size)) && Number(file.size) > 0
				? Number(file.size)
				: (Number.isFinite(Number(group.size)) ? Number(group.size) : 0)
			const mtimeSec = normalizeMtimeSec(file.mtime)
			const ageDays = mtimeSec > 0 ? Math.max(0, Math.round(((referenceNowSec - mtimeSec) / 86400) * 10) / 10) : 0
			const periodRank = index.periodRankByAccountAndLabel.has(`${meta.account}@${meta.period.label}`)
				? index.periodRankByAccountAndLabel.get(`${meta.account}@${meta.period.label}`)
				: null

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
				periodRank,
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
		const familyMeta = EMAIL_ARCHIVE_FAMILY_META[family] || EMAIL_ARCHIVE_FAMILY_META['mailbox-archives']

		const hasLegalHoldMember = classifiedMembers.some(m => m.meta.isLegalHold)
		const isLatestPrimaryArchive = family === 'mailbox-archives' && (survivor.periodRank === 0 || (survivor.periodRank === null && survivor.meta.inPrimaryVault))
		const isRetainedArchivePeriod = family === 'mailbox-archives'
			&& survivor.periodRank !== null
			&& survivor.periodRank > 0
			&& survivor.periodRank <= keepPreviousArchivePeriods

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
					member.verdictReason = 'Canonical legal-hold archival anchor'
				} else if (member.meta.inPrimaryVault) {
					member.verdictReason = 'Primary mailbox vault anchor'
				} else {
					member.verdictReason = 'Highest-authority mailbox survivor'
				}
				shieldedCopiesCount += 1
				return
			}

			if (override === 'keep') {
				member.verdict = 'blocked-manual-shield'
				member.actionType = 'keep'
				member.verdictReason = 'Manually shielded by operator'
				shieldedCopiesCount += 1
				return
			}

			if (override === 'prune') {
				member.verdict = strategy === 'consolidate-mailbox-vault-hardlinks'
					? 'consolidate-hardlink-mirror'
					: 'reclaim-duplicate-mail-artifact'
				member.actionType = strategy === 'consolidate-mailbox-vault-hardlinks' ? 'hardlink' : 'prune'
				member.verdictReason = 'Operator override: marked for safe remediation'
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

			// Protect legal-hold copies regardless of strategy
			if (protectLegalHold && member.meta.isLegalHold) {
				member.verdict = 'blocked-legal-hold'
				member.actionType = 'keep'
				member.verdictReason = `Legal-hold / e-discovery retention anchor for ${member.meta.account}`
				shieldedCopiesCount += 1
				return
			}

			// Protect latest primary mailbox archive copies inside primary vault
			if (
				protectLatestPrimaryArchive
				&& isLatestPrimaryArchive
				&& member.meta.inPrimaryVault
				&& strategy !== 'consolidate-mailbox-vault-hardlinks'
			) {
				member.verdict = 'blocked-latest-primary-archive'
				member.actionType = 'keep'
				member.verdictReason = `Latest primary mailbox archive (${member.meta.period.label}) shielded in vault`
				shieldedCopiesCount += 1
				return
			}

			// Protect retained previous archive periods inside primary vault
			if (
				protectLatestPrimaryArchive
				&& isRetainedArchivePeriod
				&& member.meta.inPrimaryVault
				&& strategy !== 'consolidate-mailbox-vault-hardlinks'
			) {
				member.verdict = 'blocked-retained-archive-period'
				member.actionType = 'keep'
				member.verdictReason = `Within archive retention window (keep ${keepPreviousArchivePeriods} previous periods)`
				shieldedCopiesCount += 1
				return
			}

			// Protect recent IMAP/Thunderbird/Apple Mail snapshots inside primary vault
			if (
				family === 'mail-client-backup-snapshots'
				&& !member.meta.inExportStaging
				&& member.ageDays < staleSnapshotDays
			) {
				member.verdict = 'blocked-recent-mail-snapshot'
				member.actionType = 'keep'
				member.verdictReason = `Recent mail client snapshot (${member.ageDays}d < ${staleSnapshotDays}d threshold)`
				shieldedCopiesCount += 1
				return
			}

			// Apply strategy-specific remediation verdict
			if (strategy === 'consolidate-mailbox-vault-hardlinks') {
				member.verdict = 'consolidate-hardlink-mirror'
				member.actionType = 'hardlink'
				member.verdictReason = `Hardlink-consolidate onto ${survivor.basename} anchor`
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				consolidatableCopiesCount += 1
				return
			}

			if (strategy === 'prune-mail-client-indexes-and-attachment-dumps') {
				if (
					family === 'mail-client-backup-snapshots'
					|| family === 'mirrored-email-attachments'
					|| member.meta.inExportStaging
				) {
					member.verdict = family === 'mirrored-email-attachments'
						? 'reclaim-mirrored-attachment'
						: 'reclaim-stale-mail-snapshot'
					member.actionType = 'prune'
					member.verdictReason = family === 'mirrored-email-attachments'
						? 'Duplicated email attachment dump outside canonical archive'
						: 'Redundant IMAP/Thunderbird/Apple Mail snapshot or staging export'
					reclaimableBytes += member.size
					reclaimableCopiesCount += 1
					return
				}
				member.verdict = 'blocked-strategy-scope'
				member.actionType = 'keep'
				member.verdictReason = 'Outside index/attachment cleanup strategy scope'
				shieldedCopiesCount += 1
				return
			}

			// Default strategy: prune-stale-exports-and-mirror-attachments
			if (member.meta.inExportStaging) {
				member.verdict = 'reclaim-staging-export'
				member.actionType = 'prune'
				member.verdictReason = 'Redundant mailbox export or download staging copy'
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				return
			}

			if (family === 'mirrored-email-attachments') {
				member.verdict = 'reclaim-mirrored-attachment'
				member.actionType = 'prune'
				member.verdictReason = 'Mirrored email attachment copy superseded by canonical anchor'
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				return
			}

			if (family === 'mail-client-backup-snapshots') {
				member.verdict = 'reclaim-stale-mail-snapshot'
				member.actionType = 'prune'
				member.verdictReason = `Stale ${member.meta.client} snapshot (${member.ageDays}d old)`
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				return
			}

			member.verdict = 'reclaim-duplicate-mail-archive'
			member.actionType = 'prune'
			member.verdictReason = 'Duplicate mailbox or message copy outside protected legal-hold/primary anchor'
			reclaimableBytes += member.size
			reclaimableCopiesCount += 1
		})

		const rawInfo = computeGroupReclaimableInfo({ ...group, files })
		const rawDuplicateBytes = rawInfo.reclaimableBytes || Math.max(0, (classifiedMembers.length - 1) * survivor.size)

		let riskState = 'reclaimable'
		let riskPriority = 2
		if (reclaimableCopiesCount === 0) {
			if (hasLegalHoldMember) {
				riskState = 'legal-hold-protected'
				riskPriority = 5
			} else if (isLatestPrimaryArchive) {
				riskState = 'primary-archive-protected'
				riskPriority = 4
			} else {
				riskState = 'shielded'
				riskPriority = 3
			}
		} else if (consolidatableCopiesCount > 0) {
			riskState = 'consolidatable'
			riskPriority = 3
		} else if (family === 'mirrored-email-attachments') {
			riskState = 'attachment-reclaimable'
			riskPriority = 2
		} else if (family === 'mail-client-backup-snapshots') {
			riskState = 'snapshot-reclaimable'
			riskPriority = 2
		}

		allClusters.push({
			groupKey: `${group.id ?? group.hash ?? primaryMeta.vaultKey}::${primaryMeta.vaultKey}`,
			primaryGroupId: group.id ?? null,
			hash: group.hash || '',
			family,
			familyLabel: familyMeta.label,
			familyShortLabel: familyMeta.shortLabel,
			account: primaryMeta.account,
			period: primaryMeta.period,
			periodLabel: primaryMeta.period.label,
			subjectSignature: primaryMeta.subjectSignature,
			client: primaryMeta.client,
			formatBadge: primaryMeta.formatBadge,
			vaultKey: primaryMeta.vaultKey,
			displayName: survivor.basename,
			isLegalHold: hasLegalHoldMember,
			isLatestPrimaryArchive,
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

	const familyBreakdown = Object.keys(EMAIL_ARCHIVE_FAMILY_META).map(famId => {
		const famClusters = allClusters.filter(c => c.family === famId)
		const famReclaim = famClusters.reduce((acc, c) => acc + c.reclaimableBytes, 0)
		return {
			id: famId,
			label: EMAIL_ARCHIVE_FAMILY_META[famId].label,
			shortLabel: EMAIL_ARCHIVE_FAMILY_META[famId].shortLabel,
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
			if (verdictFilter === 'legal-hold' && !cluster.isLegalHold) {
				return false
			}
			if (verdictFilter === 'primary-anchor' && !cluster.isLatestPrimaryArchive) {
				return false
			}
			if (verdictFilter === 'snapshot-index' && cluster.family !== 'mail-client-backup-snapshots') {
				return false
			}
			if (verdictFilter === 'attachment-dump' && cluster.family !== 'mirrored-email-attachments') {
				return false
			}
			if (verdictFilter === 'shielded' && cluster.reclaimableCopiesCount > 0) {
				return false
			}
		}
		if (searchQuery) {
			const haystack = [
				cluster.account,
				cluster.periodLabel,
				cluster.subjectSignature,
				cluster.client,
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
		if (sortMode === 'period_desc') {
			if (a.period.sortKey !== b.period.sortKey) {
				return b.period.sortKey - a.period.sortKey
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
	const totalLegalHoldClusters = filteredClusters.filter(c => c.isLegalHold).length
	const totalPrimaryArchiveAnchors = filteredClusters.filter(c => c.isLatestPrimaryArchive).length
	const totalSnapshotClusters = filteredClusters.filter(c => c.family === 'mail-client-backup-snapshots').length
	const totalAttachmentClusters = filteredClusters.filter(c => c.family === 'mirrored-email-attachments').length
	const distinctAccountsCount = new Set(filteredClusters.map(c => c.account)).size
	const efficiencyPct = totalRawDuplicateBytes > 0
		? Math.min(100, Math.round((totalReclaimableBytes / totalRawDuplicateBytes) * 100))
		: 0

	return {
		schema: EMAIL_ARCHIVE_VAULT_SCHEMA,
		generatedAt: new Date(referenceNowSec * 1000).toISOString(),
		options: {
			familyFilter,
			verdictFilter,
			sortMode,
			strategy,
			survivorRule,
			protectLegalHold,
			protectLatestPrimaryArchive,
			keepPreviousArchivePeriods,
			staleSnapshotDays,
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
			totalLegalHoldClusters,
			totalPrimaryArchiveAnchors,
			totalSnapshotClusters,
			totalAttachmentClusters,
			distinctAccountsCount,
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
 * Build a safe POSIX DRY_RUN=1 remediation script for Email Archive & Attachment Vault cleanup.
 *
 * @param {object} analysis Output of analyzeEmailArchiveVault.
 * @param {object} [options] Script generation options.
 * @return {string} POSIX shell script.
 */
export function buildEmailArchiveRemediationScript(analysis, options = {}) {
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
		'# DuplicateFinder Email Archive, Mailbox Export & Attachment Vault Remediation Script',
		`# Schema: ${EMAIL_ARCHIVE_VAULT_SCHEMA}`,
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
		lines.push(`# Mailbox Vault: ${cluster.vaultKey} [${cluster.client} / ${cluster.formatBadge}] (${cluster.formattedReclaimableBytes})`)
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
		lines.push('# No actionable email archive or attachment duplicates under current legal-hold guards.')
	} else {
		lines.push('# After applying with DRY_RUN=0, refresh Nextcloud filecache:')
		lines.push('# sudo -u www-data php /var/www/nextcloud/occ files:scan --all')
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe CSV audit report.
 *
 * @param {object} analysis Output of analyzeEmailArchiveVault.
 * @return {string} CSV content.
 */
export function buildEmailArchiveCsvReport(analysis) {
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const headers = [
		'Account',
		'Period',
		'SubjectSignature',
		'Client',
		'Family',
		'Format',
		'LegalHold',
		'LatestPrimaryArchive',
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
				cluster.account,
				cluster.periodLabel,
				cluster.subjectSignature,
				cluster.client,
				cluster.family,
				cluster.formatBadge,
				member.meta.isLegalHold ? 'yes' : 'no',
				cluster.isLatestPrimaryArchive ? 'yes' : 'no',
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
 * @param {object} analysis Output of analyzeEmailArchiveVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildEmailArchiveJsonReport(analysis) {
	const payload = {
		schema: EMAIL_ARCHIVE_VAULT_SCHEMA,
		generatedAt: analysis && analysis.generatedAt ? analysis.generatedAt : new Date().toISOString(),
		options: analysis ? analysis.options : {},
		summary: analysis ? analysis.summary : {},
		familyBreakdown: analysis ? analysis.familyBreakdown : [],
		clusters: (analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []).map(cluster => ({
			groupKey: cluster.groupKey,
			primaryGroupId: cluster.primaryGroupId,
			hash: cluster.hash,
			account: cluster.account,
			period: cluster.periodLabel,
			subjectSignature: cluster.subjectSignature,
			client: cluster.client,
			family: cluster.family,
			formatBadge: cluster.formatBadge,
			isLegalHold: cluster.isLegalHold,
			isLatestPrimaryArchive: cluster.isLatestPrimaryArchive,
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
 * Build a Nextcloud desktop client .sync-exclude.lst snippet for transient IMAP/Mail client caches.
 *
 * @param {object} analysis Output of analyzeEmailArchiveVault.
 * @return {string} Sync exclude rules.
 */
export function buildEmailArchiveSyncExcludeSnippet(analysis) {
	const snapshotCount = analysis && analysis.summary ? analysis.summary.totalSnapshotClusters : 0
	const attachmentCount = analysis && analysis.summary ? analysis.summary.totalAttachmentClusters : 0
	return [
		'# DuplicateFinder Email Archive & Mail Client Cache Sync Exclusions',
		`# Detected mail client snapshot clusters: ${snapshotCount} | Mirrored attachment clusters: ${attachmentCount}`,
		'*.msf',
		'*.wdseml',
		'*.sbd/',
		'*.ost.tmp',
		'ImapMail/',
		'imap-cache/',
		'thunderbird-cache/',
		'Envelope Index*',
		'global-messages-db.sqlite*',
		'saved-attachments/',
	].join('\n')
}
