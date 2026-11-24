/**
 * Pure Zero-Byte, Truncated Partial (.part, .crdownload, .tmp) & macOS AppleDouble
 * (._*, .DS_Store, Thumbs.db) Junk Pair Inspector.
 * Inspired by Czkawka, dupeGuru, rmlint, and Nextcloud Files Admin tooling.
 * Separates intentional empty markers from accidental zero-byte truncations,
 * correlates aborted upload fragments against completed directory/group originals,
 * distinguishes paired vs orphaned macOS AppleDouble resource forks, enforces
 * quarantine guardrails, and builds DRY_RUN-first POSIX/occ purge scripts,
 * CWE-1236-safe CSV ledgers, and JSON audit certificates.
 * Zero DOM dependencies, zero network side effects.
 */

import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { formatBytes } from './duplicateStats'

export const JUNK_PAIR_SCHEMA = 'duplicatefinder.junk-pair-audit.v1'

export const JUNK_CATEGORIES = Object.freeze([
	'all',
	'partial-fragment',
	'appledouble-os',
	'zero-byte',
	'intentional-marker',
	'quarantine-guarded',
])

export const PAIRING_FILTERS = Object.freeze([
	'all',
	'safe-purge',
	'quarantine-only',
])

export const JUNK_SORT_MODES = Object.freeze([
	'severity_desc',
	'reclaim_desc',
	'size_desc',
	'path_asc',
])

export const PARTIAL_EXTENSIONS = Object.freeze([
	'part',
	'crdownload',
	'download',
	'partial',
	'unconfirmed',
	'opdownload',
	'filepart',
	'rsync-tmp',
	'tmp',
	'temp',
	'bc!',
])

export const OS_METADATA_BASENAMES = Object.freeze([
	'.ds_store',
	'thumbs.db',
	'ehthumbs.db',
	'ehthumbs_vista.db',
	'desktop.ini',
	'.localized',
	'.spotlight-v100',
	'.trashes',
	'.fseventsd',
	'.temporaryitems',
	'.apdisk',
])

export const INTENTIONAL_EMPTY_BASENAMES = Object.freeze([
	'.gitkeep',
	'.keep',
	'.nomedia',
	'.nojekyll',
	'.npmignore',
	'.placeholder',
	'.empty',
	'__init__.py',
	'.htaccess',
	'.stfolder',
	'.stignore',
	'000-empty',
	'readme.empty',
])

const PARTIAL_EXT_SET = new Set(PARTIAL_EXTENSIONS)
const OS_METADATA_SET = new Set(OS_METADATA_BASENAMES)
const INTENTIONAL_EMPTY_SET = new Set(INTENTIONAL_EMPTY_BASENAMES)

const SEVERITY_RANK = Object.freeze({
	critical: 4,
	high: 3,
	medium: 2,
	info: 1,
	ok: 0,
})

const VERDICT_RANK = Object.freeze({
	'safe-purge': 3,
	'quarantine-review': 2,
	'protected-hold': 1,
	healthy: 0,
})

/**
 * Strip control characters and normalize slashes in a file path.
 *
 * @param {string|null|undefined} rawPath Raw path string.
 * @return {string} Normalized path.
 */
export function sanitizeJunkPath(rawPath) {
	if (typeof rawPath !== 'string') {
		return ''
	}
	const withoutCtrl = rawPath.replace(/[\r\n\0\t]/g, ' ').trim()
	const normalized = withoutCtrl.replace(/\\/g, '/').replace(/\/+/g, '/')
	if (!normalized) {
		return ''
	}
	return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized
}

/**
 * Extract directory path and basename from a normalized path.
 *
 * @param {string} normalizedPath Normalized POSIX path.
 * @return {{ directory: string, basename: string }} Directory and basename.
 */
export function splitPathParts(normalizedPath) {
	if (!normalizedPath) {
		return { directory: '/', basename: 'unknown' }
	}
	const lastSlash = normalizedPath.lastIndexOf('/')
	if (lastSlash < 0) {
		return { directory: '/', basename: normalizedPath || 'unknown' }
	}
	const directory = normalizedPath.slice(0, lastSlash) || '/'
	const basename = normalizedPath.slice(lastSlash + 1) || 'unknown'
	return { directory, basename }
}

/**
 * Escape a string safely for POSIX single-quoted shell arguments.
 *
 * @param {string} value Raw shell value.
 * @return {string} Single-quoted POSIX-safe token.
 */
function shellQuote(value) {
	const safe = String(value || '').replace(/[\r\n\0]/g, '')
	return `'${safe.replace(/'/g, "'\\''")}'`
}

/**
 * Check whether an optional byte buffer starts with the AppleSingle/AppleDouble magic header.
 *
 * @param {Uint8Array|ArrayBuffer|number[]|null|undefined} buffer Optional header bytes.
 * @return {boolean} True when AppleDouble (0x00051607) or AppleSingle (0x00051600) magic matches.
 */
export function hasAppleDoubleMagic(buffer) {
	if (!buffer) {
		return false
	}
	let bytes = null
	if (buffer instanceof Uint8Array) {
		bytes = buffer
	} else if (typeof ArrayBuffer !== 'undefined' && buffer instanceof ArrayBuffer) {
		bytes = new Uint8Array(buffer)
	} else if (ArrayBuffer.isView(buffer)) {
		bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
	} else if (Array.isArray(buffer)) {
		bytes = buffer
	}
	if (!bytes || bytes.length < 4) {
		return false
	}
	return bytes[0] === 0x00
		&& bytes[1] === 0x05
		&& bytes[2] === 0x16
		&& (bytes[3] === 0x07 || bytes[3] === 0x00)
}

/**
 * Derive the expected completed companion filename for a partial, AppleDouble, or lockfile entry.
 *
 * @param {string} basename File basename.
 * @param {object} [options] Classification options (size, inlineBuffer, headerBytes).
 * @return {{ junkKind: string, category: string, expectedCompanion: string, label: string, detail: string }} Classification metadata.
 */
export function classifyJunkBasename(basename, options = {}) {
	const safeName = typeof basename === 'string' ? basename.trim() : ''
	const lower = safeName.toLowerCase()
	const size = Number.isFinite(Number(options.size)) && Number(options.size) >= 0
		? Math.floor(Number(options.size))
		: 0
	const buffer = options.inlineBuffer || options.headerBytes || null
	const appleMagic = hasAppleDoubleMagic(buffer)

	// 1. Intentional zero-byte markers (never auto-purge)
	if (size === 0 && INTENTIONAL_EMPTY_SET.has(lower)) {
		return {
			isJunkCandidate: true,
			junkKind: 'intentional-marker',
			category: 'intentional-marker',
			expectedCompanion: '',
			label: 'Intentional Empty Marker',
			detail: `${safeName} is a standard repository or media exclusion marker (0 B).`,
			appleMagic: false,
		}
	}

	// 2. macOS AppleDouble resource forks (._*)
	if ((safeName.startsWith('._') && safeName.length > 2) || appleMagic) {
		const companion = safeName.startsWith('._') ? safeName.slice(2) : ''
		return {
			isJunkCandidate: true,
			junkKind: 'appledouble-fork',
			category: 'appledouble-os',
			expectedCompanion: companion,
			label: appleMagic ? 'AppleDouble Resource Fork (Magic Verified)' : 'macOS AppleDouble Resource Fork',
			detail: companion
				? `macOS WebDAV/SMB metadata fork for companion "${companion}".`
				: 'macOS AppleDouble binary resource fork header detected.',
			appleMagic,
		}
	}

	// 3. OS directory metadata caches (.DS_Store, Thumbs.db, desktop.ini)
	if (OS_METADATA_SET.has(lower)) {
		return {
			isJunkCandidate: true,
			junkKind: 'os-metadata-cache',
			category: 'appledouble-os',
			expectedCompanion: '',
			label: 'OS Metadata Cache',
			detail: `${safeName} is a regenerable desktop explorer/Finder metadata database.`,
			appleMagic: false,
		}
	}

	// 4. Office / LibreOffice transient lockfiles (~$*, .~lock.*#)
	if (safeName.startsWith('~$') && safeName.length > 2) {
		return {
			isJunkCandidate: true,
			junkKind: 'office-lockfile',
			category: 'appledouble-os',
			expectedCompanion: safeName.slice(2),
			label: 'Office Lockfile',
			detail: `Transient Microsoft Office owner lockfile paired with "${safeName.slice(2)}".`,
			appleMagic: false,
		}
	}
	if (lower.startsWith('.~lock.') && lower.endsWith('#') && safeName.length > 8) {
		const companion = safeName.slice(7, -1)
		return {
			isJunkCandidate: true,
			junkKind: 'office-lockfile',
			category: 'appledouble-os',
			expectedCompanion: companion,
			label: 'LibreOffice Lockfile',
			detail: `Transient LibreOffice lockfile paired with "${companion}".`,
			appleMagic: false,
		}
	}

	// 5. Nextcloud chunked upload transfer fragments (*.ocTransferId*.part) or partial downloads
	const ocTransferMatch = safeName.match(/^(.+)\.ocTransferId[A-Za-z0-9_-]+\.(part|tmp|partial)$/i)
	if (ocTransferMatch) {
		return {
			isJunkCandidate: true,
			junkKind: 'nextcloud-chunk-partial',
			category: 'partial-fragment',
			expectedCompanion: ocTransferMatch[1],
			label: 'Nextcloud Chunked Transfer Fragment',
			detail: `Aborted Nextcloud WebDAV chunked upload fragment for "${ocTransferMatch[1]}".`,
			appleMagic: false,
		}
	}

	const lastDot = safeName.lastIndexOf('.')
	if (lastDot > 0) {
		const ext = safeName.slice(lastDot + 1).toLowerCase()
		if (PARTIAL_EXT_SET.has(ext)) {
			const stem = safeName.slice(0, lastDot)
			const hasRealStemExt = stem.includes('.') && !stem.startsWith('~')
			return {
				isJunkCandidate: true,
				junkKind: 'partial-upload-fragment',
				category: 'partial-fragment',
				expectedCompanion: hasRealStemExt ? stem : '',
				label: `Partial / Temp Fragment (.${ext})`,
				detail: hasRealStemExt
					? `Incomplete transfer fragment paired with expected original "${stem}".`
					: `Temporary transfer or staging file (.${ext}).`,
				appleMagic: false,
			}
		}
	}

	// 6. Editor tilde backup files (foo.txt~)
	if (safeName.endsWith('~') && safeName.length > 1 && !safeName.startsWith('.')) {
		const companion = safeName.slice(0, -1)
		return {
			isJunkCandidate: true,
			junkKind: 'editor-tilde-backup',
			category: 'appledouble-os',
			expectedCompanion: companion,
			label: 'Tilde Backup Artifact',
			detail: `Editor backup artifact paired with "${companion}".`,
			appleMagic: false,
		}
	}

	// 7. Accidental zero-byte file (non-marker)
	if (size === 0) {
		return {
			isJunkCandidate: true,
			junkKind: 'zero-byte-file',
			category: 'zero-byte',
			expectedCompanion: safeName,
			label: 'Zero-Byte File (0 B)',
			detail: 'Empty 0-byte payload indicating truncated write, failed sync, or empty duplicate.',
			appleMagic: false,
		}
	}

	return {
		isJunkCandidate: false,
		junkKind: 'healthy-payload',
		category: 'healthy',
		expectedCompanion: '',
		label: 'Healthy Payload',
		detail: 'Standard non-junk payload file.',
		appleMagic: false,
	}
}

/**
 * Determine whether a file entry carries Origin, lock, or read-only protection metadata.
 *
 * @param {object} file Raw file object.
 * @return {{ protectedOrigin: boolean, locked: boolean, readOnly: boolean }} Protection flags.
 */
function readFileProtectionFlags(file) {
	if (!file || typeof file !== 'object') {
		return { protectedOrigin: false, locked: false, readOnly: false }
	}
	const protectedOrigin = Boolean(
		file.isOriginFolder
		|| file.originFolder
		|| file.protectedOrigin
		|| file.isOrigin
	)
	const locked = Boolean(file.isLocked || file.locked)
	const perm = typeof file.permissions === 'string' ? file.permissions.toLowerCase() : ''
	const readOnly = Boolean(
		file.writable === false
		|| file.readOnly === true
		|| file.canDelete === false
		|| perm === 'r'
		|| perm === 'ro'
		|| perm === 'read-only'
	)
	return { protectedOrigin, locked, readOnly }
}

/**
 * Resolve Nextcloud user from a canonical file path (/<user>/files/...).
 *
 * @param {object} file Raw file entry.
 * @param {string} normalizedPath Normalized file path.
 * @return {string} User ID or 'shared'.
 */
function extractOwnerUser(file, normalizedPath) {
	if (file && typeof file.owner === 'string' && file.owner.trim()) {
		return file.owner.replace(/[\r\n\t\0]/g, ' ').trim()
	}
	if (file && typeof file.user === 'string' && file.user.trim()) {
		return file.user.replace(/[\r\n\t\0]/g, ' ').trim()
	}
	const match = normalizedPath.match(/^\/([^/]+)\/files(?:\/|$)/i)
	if (match && match[1]) {
		return match[1]
	}
	return 'shared'
}

/**
 * Correlate a candidate junk file against all sibling entries in its directory and duplicate group.
 *
 * @param {object} entry Normalized candidate entry.
 * @param {Array<object>} dirSiblings Entries in the same normalized directory.
 * @param {Array<object>} groupEntries Entries in the same duplicate group.
 * @return {object} Pairing diagnosis object.
 */
function resolveCompanionPairing(entry, dirSiblings, groupEntries) {
	const cls = entry.classification
	if (!cls.isJunkCandidate) {
		return {
			pairingStatus: 'healthy-original',
			pairingLabel: 'Healthy Original',
			companionEntry: null,
			pairingDetail: 'Regular payload file.',
		}
	}

	if (cls.junkKind === 'intentional-marker') {
		return {
			pairingStatus: 'intentional-marker',
			pairingLabel: 'Intentional Marker',
			companionEntry: null,
			pairingDetail: cls.detail,
		}
	}

	const expectedLower = (cls.expectedCompanion || '').toLowerCase()
	const isHealthyCandidate = candidate => (
		candidate
		&& candidate.selectionKey !== entry.selectionKey
		&& !candidate.classification.isJunkCandidate
		&& candidate.sizeBytes > 0
	)

	// Search directory siblings first for exact expected companion name
	let companion = null
	if (expectedLower) {
		companion = dirSiblings.find(
			sib => isHealthyCandidate(sib) && sib.basename.toLowerCase() === expectedLower
		) || null
	}
	if (!companion && expectedLower && cls.junkKind === 'zero-byte-file') {
		// Also check duplicate group or directory for non-empty file sharing same basename or stem
		companion = groupEntries.find(
			sib => isHealthyCandidate(sib) && sib.basename.toLowerCase() === expectedLower
		) || dirSiblings.find(
			sib => isHealthyCandidate(sib) && sib.basename.toLowerCase().startsWith(`${expectedLower}.`)
		) || null
	}

	if (cls.junkKind === 'partial-upload-fragment' || cls.junkKind === 'nextcloud-chunk-partial') {
		if (companion && companion.sizeBytes >= entry.sizeBytes) {
			return {
				pairingStatus: 'paired-completed',
				pairingLabel: 'Paired with Completed Original',
				companionEntry: companion,
				pairingDetail: `Completed original "${companion.basename}" (${formatBytes(companion.sizeBytes)}) exists in ${entry.directory}.`,
			}
		}
		if (companion) {
			return {
				pairingStatus: 'paired-smaller-conflict',
				pairingLabel: 'Companion Smaller Than Partial',
				companionEntry: companion,
				pairingDetail: `Directory sibling "${companion.basename}" (${formatBytes(companion.sizeBytes)}) is smaller than fragment (${formatBytes(entry.sizeBytes)}); quarantine review required.`,
			}
		}
		return {
			pairingStatus: 'unpaired-partial',
			pairingLabel: 'Unpaired Partial (No Original)',
			companionEntry: null,
			pairingDetail: cls.expectedCompanion
				? `Expected original "${cls.expectedCompanion}" was not found in ${entry.directory}; quarantined to protect partial data.`
				: `Temporary fragment has no completed companion in ${entry.directory}; quarantined for manual verification.`,
		}
	}

	if (cls.junkKind === 'appledouble-fork') {
		if (companion) {
			return {
				pairingStatus: 'paired-companion',
				pairingLabel: 'Paired AppleDouble Fork',
				companionEntry: companion,
				pairingDetail: `Data fork "${companion.basename}" (${formatBytes(companion.sizeBytes)}) is intact in ${entry.directory}.`,
			}
		}
		return {
			pairingStatus: 'orphaned-fork',
			pairingLabel: 'Orphaned AppleDouble Fork',
			companionEntry: null,
			pairingDetail: `No companion data fork "${cls.expectedCompanion}" found in ${entry.directory}; quarantine before purge.`,
		}
	}

	if (cls.junkKind === 'os-metadata-cache') {
		return {
			pairingStatus: 'os-clutter-standalone',
			pairingLabel: 'Regenerable OS Metadata',
			companionEntry: null,
			pairingDetail: cls.detail,
		}
	}

	if (cls.junkKind === 'office-lockfile' || cls.junkKind === 'editor-tilde-backup') {
		if (companion) {
			return {
				pairingStatus: 'paired-lockfile',
				pairingLabel: 'Paired Transient Artifact',
				companionEntry: companion,
				pairingDetail: `Active document "${companion.basename}" (${formatBytes(companion.sizeBytes)}) exists in ${entry.directory}.`,
			}
		}
		return {
			pairingStatus: 'stale-lockfile',
			pairingLabel: 'Orphaned Transient Artifact',
			companionEntry: null,
			pairingDetail: `Original "${cls.expectedCompanion}" not found in ${entry.directory}; likely stale lock or orphaned backup.`,
		}
	}

	// Zero-byte file classification
	if (companion) {
		return {
			pairingStatus: 'zero-paired-shadow',
			pairingLabel: 'Zero-Byte Beside Live Original',
			companionEntry: companion,
			pairingDetail: `Non-empty "${companion.basename}" (${formatBytes(companion.sizeBytes)}) exists; 0 B shadow is safe to prune.`,
		}
	}

	const zeroSiblings = groupEntries.filter(
		sib => sib.selectionKey !== entry.selectionKey && sib.sizeBytes === 0
	)
	if (zeroSiblings.length > 0) {
		return {
			pairingStatus: 'zero-byte-duplicate',
			pairingLabel: 'Zero-Byte Duplicate Copy',
			companionEntry: zeroSiblings[0],
			pairingDetail: `Part of a ${zeroSiblings.length + 1}-copy zero-byte duplicate cluster.`,
		}
	}

	return {
		pairingStatus: 'zero-byte-standalone',
		pairingLabel: 'Standalone Zero-Byte File',
		companionEntry: null,
		pairingDetail: 'Isolated 0 B file with no healthy companion detected.',
	}
}

/**
 * Evaluate quarantine and purge guardrails for a single classified entry.
 *
 * @param {object} entry Annotated entry.
 * @param {object} pairing Companion pairing result.
 * @param {object} options Guardrail options.
 * @param {object} groupPolicyContext Per-group tracking for zero-byte survivor preservation.
 * @return {{ actionVerdict: string, verdictLabel: string, severity: string, reason: string }} Decision.
 */
function evaluateEntryGuardrail(entry, pairing, options, groupPolicyContext) {
	const {
		protectUnpairedPartials = true,
		protectOrphanedAppleDouble = true,
		protectIntentionalMarkers = true,
	} = options

	if (!entry.classification.isJunkCandidate) {
		return {
			actionVerdict: 'healthy',
			verdictLabel: 'Healthy Survivor',
			severity: 'ok',
			reason: 'Non-junk payload file; always preserved.',
		}
	}

	if (entry.protection.protectedOrigin) {
		return {
			actionVerdict: 'protected-hold',
			verdictLabel: 'Origin Protected',
			severity: 'info',
			reason: 'Located inside an Origin Folder; protected from automated purge.',
		}
	}

	if (entry.protection.locked) {
		return {
			actionVerdict: 'protected-hold',
			verdictLabel: 'Locked File',
			severity: 'info',
			reason: 'File lock active; deletion blocked until lock clears.',
		}
	}

	if (entry.protection.readOnly) {
		return {
			actionVerdict: 'protected-hold',
			verdictLabel: 'Read-Only Guard',
			severity: 'info',
			reason: 'Read-only permissions or non-deletable share boundary.',
		}
	}

	if (pairing.pairingStatus === 'intentional-marker' && protectIntentionalMarkers) {
		return {
			actionVerdict: 'protected-hold',
			verdictLabel: 'Intentional Marker',
			severity: 'ok',
			reason: 'Intentional 0 B marker (.gitkeep / __init__.py / .nomedia) preserved.',
		}
	}

	if (pairing.pairingStatus === 'paired-smaller-conflict') {
		return {
			actionVerdict: 'quarantine-review',
			verdictLabel: 'Quarantine (Size Conflict)',
			severity: 'critical',
			reason: pairing.pairingDetail,
		}
	}

	if (pairing.pairingStatus === 'unpaired-partial' && protectUnpairedPartials) {
		return {
			actionVerdict: 'quarantine-review',
			verdictLabel: 'Quarantine (Unpaired Partial)',
			severity: 'critical',
			reason: pairing.pairingDetail,
		}
	}

	if (pairing.pairingStatus === 'orphaned-fork' && protectOrphanedAppleDouble) {
		return {
			actionVerdict: 'quarantine-review',
			verdictLabel: 'Quarantine (Orphaned Fork)',
			severity: 'medium',
			reason: pairing.pairingDetail,
		}
	}

	if (pairing.pairingStatus === 'zero-byte-standalone') {
		return {
			actionVerdict: 'quarantine-review',
			verdictLabel: 'Quarantine (Unpaired 0 B)',
			severity: 'medium',
			reason: pairing.pairingDetail,
		}
	}

	if (pairing.pairingStatus === 'zero-byte-duplicate') {
		// Preserve one anchor copy in an all-zero-byte duplicate group unless a non-empty survivor exists
		if (groupPolicyContext.healthyCount === 0 && !groupPolicyContext.zeroAnchorAssigned) {
			groupPolicyContext.zeroAnchorAssigned = true
			return {
				actionVerdict: 'protected-hold',
				verdictLabel: '0 B Group Anchor',
				severity: 'info',
				reason: 'Preserved as the single surviving anchor of an all-zero-byte duplicate group.',
			}
		}
		return {
			actionVerdict: 'safe-purge',
			verdictLabel: 'Safe Purge (0 B Dup)',
			severity: 'high',
			reason: 'Redundant 0 B copy; another anchor copy remains.',
		}
	}

	if (pairing.pairingStatus === 'paired-completed') {
		return {
			actionVerdict: 'safe-purge',
			verdictLabel: 'Safe Purge (Aborted Partial)',
			severity: 'high',
			reason: pairing.pairingDetail,
		}
	}

	if (pairing.pairingStatus === 'paired-companion') {
		return {
			actionVerdict: 'safe-purge',
			verdictLabel: 'Safe Purge (Paired ._*)',
			severity: 'high',
			reason: pairing.pairingDetail,
		}
	}

	if (pairing.pairingStatus === 'os-clutter-standalone') {
		return {
			actionVerdict: 'safe-purge',
			verdictLabel: 'Safe Purge (OS Metadata)',
			severity: 'medium',
			reason: pairing.pairingDetail,
		}
	}

	if (pairing.pairingStatus === 'paired-lockfile' || pairing.pairingStatus === 'stale-lockfile') {
		return {
			actionVerdict: 'safe-purge',
			verdictLabel: 'Safe Purge (Lock / Backup)',
			severity: 'medium',
			reason: pairing.pairingDetail,
		}
	}

	if (pairing.pairingStatus === 'zero-paired-shadow') {
		return {
			actionVerdict: 'safe-purge',
			verdictLabel: 'Safe Purge (0 B Shadow)',
			severity: 'high',
			reason: pairing.pairingDetail,
		}
	}

	return {
		actionVerdict: 'quarantine-review',
		verdictLabel: 'Quarantine Review',
		severity: 'medium',
		reason: pairing.pairingDetail || 'Manual verification recommended before purging.',
	}
}

/**
 * Normalize and index every file across duplicate groups and optional companion sibling pool.
 *
 * @param {Array<object>} duplicates Duplicate groups list.
 * @param {Array<object>} companionPool Optional external directory sibling files.
 * @return {{ normalizedGroups: Array<object>, dirIndex: Map<string, Array<object>> }} Indexed structures.
 */
function buildDirectoryAndGroupIndex(duplicates, companionPool = []) {
	const dirIndex = new Map()
	const seenKeys = new Set()

	const registerInDir = entry => {
		const dirKey = entry.directory.toLowerCase()
		if (!dirIndex.has(dirKey)) {
			dirIndex.set(dirKey, [])
		}
		dirIndex.get(dirKey).push(entry)
	}

	const normalizeFileEntry = (file, fallbackSize, groupId) => {
		const rawPath = (file && (file.path || file.name)) || ''
		const normalizedPath = sanitizeJunkPath(rawPath) || `/unknown/${file && file.id ? file.id : 'file'}`
		const { directory, basename } = splitPathParts(normalizedPath)
		const rawSize = file && file.size !== undefined && file.size !== null
			? Number(file.size)
			: Number(fallbackSize)
		const sizeBytes = Number.isFinite(rawSize) && rawSize >= 0 ? Math.floor(rawSize) : 0
		const selectionKey = getFileSelectionKey(file) || `path:${normalizedPath}:${groupId}`
		const classification = classifyJunkBasename(basename, {
			size: sizeBytes,
			inlineBuffer: file && file.inlineBuffer,
			headerBytes: file && file.headerBytes,
		})
		return {
			raw: file,
			selectionKey,
			fileId: file && (file.id ?? file.fileId ?? null),
			normalizedPath,
			directory,
			basename,
			sizeBytes,
			sizeFormatted: formatBytes(sizeBytes),
			owner: extractOwnerUser(file, normalizedPath),
			protection: readFileProtectionFlags(file),
			classification,
		}
	}

	const normalizedGroups = []
	for (let gIdx = 0; gIdx < (Array.isArray(duplicates) ? duplicates.length : 0); gIdx++) {
		const group = duplicates[gIdx]
		if (!group || !Array.isArray(group.files) || group.files.length === 0) {
			continue
		}
		const groupId = group.id !== undefined && group.id !== null ? group.id : `idx-${gIdx}`
		const entries = []
		for (const rawFile of group.files) {
			if (!rawFile || typeof rawFile !== 'object') {
				continue
			}
			const entry = normalizeFileEntry(rawFile, group.size, groupId)
			entries.push(entry)
			const uniqueKey = `${entry.selectionKey}::${entry.normalizedPath}`
			if (!seenKeys.has(uniqueKey)) {
				seenKeys.add(uniqueKey)
				registerInDir(entry)
			}
		}
		if (entries.length > 0) {
			normalizedGroups.push({
				rawGroup: group,
				groupId,
				groupKey: `junk-group-${groupId}`,
				hash: typeof group.hash === 'string' ? group.hash : '',
				entries,
			})
		}
	}

	if (Array.isArray(companionPool)) {
		for (let idx = 0; idx < companionPool.length; idx++) {
			const rawFile = companionPool[idx]
			if (!rawFile || typeof rawFile !== 'object') {
				continue
			}
			const entry = normalizeFileEntry(rawFile, rawFile.size, `pool-${idx}`)
			const uniqueKey = `${entry.selectionKey}::${entry.normalizedPath}`
			if (!seenKeys.has(uniqueKey)) {
				seenKeys.add(uniqueKey)
				registerInDir(entry)
			}
		}
	}

	return { normalizedGroups, dirIndex }
}

/**
 * Analyze duplicate groups for zero-byte files, aborted partial fragments,
 * and macOS AppleDouble / OS metadata junk pairs with quarantine guardrails.
 *
 * @param {Array<object>} duplicates Duplicate groups list.
 * @param {object} [options] Filtering, sorting, and guardrail options.
 * @return {object} Structured audit report.
 */
export function analyzeJunkPairs(duplicates, options = {}) {
	const list = Array.isArray(duplicates) ? duplicates.filter(Boolean) : []
	const categoryFilter = JUNK_CATEGORIES.includes(options.categoryFilter)
		? options.categoryFilter
		: 'all'
	const pairingFilter = PAIRING_FILTERS.includes(options.pairingFilter)
		? options.pairingFilter
		: 'all'
	const sortMode = JUNK_SORT_MODES.includes(options.sortMode)
		? options.sortMode
		: 'severity_desc'
	const searchQuery = typeof options.searchQuery === 'string'
		? options.searchQuery.trim().toLowerCase()
		: ''
	const minSizeRaw = Number(options.minSizeBytes)
	const minSizeBytes = Number.isFinite(minSizeRaw) && minSizeRaw > 0 ? minSizeRaw : 0

	const guardrailOptions = {
		protectUnpairedPartials: options.protectUnpairedPartials !== false,
		protectOrphanedAppleDouble: options.protectOrphanedAppleDouble !== false,
		protectIntentionalMarkers: options.protectIntentionalMarkers !== false,
	}

	const { normalizedGroups, dirIndex } = buildDirectoryAndGroupIndex(
		list,
		options.companionPool
	)

	const categoryCounts = {
		all: 0,
		'partial-fragment': 0,
		'appledouble-os': 0,
		'zero-byte': 0,
		'intentional-marker': 0,
		'quarantine-guarded': 0,
	}

	let safePurgeCount = 0
	let safePurgeBytes = 0
	let quarantineCount = 0
	let quarantineBytes = 0
	let intentionalMarkerCount = 0
	let partialFragmentCount = 0
	let appleDoubleOsCount = 0
	let zeroByteCount = 0
	let protectedHoldCount = 0

	const allItems = []

	for (const group of normalizedGroups) {
		const healthyCount = group.entries.filter(
			e => !e.classification.isJunkCandidate && e.sizeBytes > 0
		).length
		const groupPolicyContext = {
			healthyCount,
			zeroAnchorAssigned: false,
		}

		// Sort entries deterministically so anchor assignment prefers shortest path then non-protected
		const orderedEntries = [...group.entries].sort((a, b) => {
			if (a.protection.protectedOrigin !== b.protection.protectedOrigin) {
				return a.protection.protectedOrigin ? -1 : 1
			}
			if (a.normalizedPath.length !== b.normalizedPath.length) {
				return a.normalizedPath.length - b.normalizedPath.length
			}
			return a.normalizedPath.localeCompare(b.normalizedPath)
		})

		const evaluatedEntries = orderedEntries.map(entry => {
			const dirSiblings = dirIndex.get(entry.directory.toLowerCase()) || []
			const pairing = resolveCompanionPairing(entry, dirSiblings, group.entries)
			const decision = evaluateEntryGuardrail(
				entry,
				pairing,
				guardrailOptions,
				groupPolicyContext
			)
			return {
				...entry,
				pairing,
				decision,
			}
		})

		const junkEntries = evaluatedEntries.filter(e => e.classification.isJunkCandidate)
		if (junkEntries.length === 0) {
			continue
		}

		const groupSafePurgeEntries = junkEntries.filter(e => e.decision.actionVerdict === 'safe-purge')
		const groupQuarantineEntries = junkEntries.filter(e => e.decision.actionVerdict === 'quarantine-review')
		const groupProtectedEntries = junkEntries.filter(e => e.decision.actionVerdict === 'protected-hold')

		const groupSafePurgeBytes = groupSafePurgeEntries.reduce((sum, e) => sum + e.sizeBytes, 0)
		const groupQuarantineBytes = groupQuarantineEntries.reduce((sum, e) => sum + e.sizeBytes, 0)

		safePurgeCount += groupSafePurgeEntries.length
		safePurgeBytes += groupSafePurgeBytes
		quarantineCount += groupQuarantineEntries.length
		quarantineBytes += groupQuarantineBytes
		protectedHoldCount += groupProtectedEntries.length

		const categoriesPresent = new Set()
		for (const je of junkEntries) {
			if (je.classification.category === 'partial-fragment') {
				partialFragmentCount += 1
				categoriesPresent.add('partial-fragment')
			} else if (je.classification.category === 'appledouble-os') {
				appleDoubleOsCount += 1
				categoriesPresent.add('appledouble-os')
			} else if (je.classification.category === 'zero-byte') {
				zeroByteCount += 1
				categoriesPresent.add('zero-byte')
			} else if (je.classification.category === 'intentional-marker') {
				intentionalMarkerCount += 1
				categoriesPresent.add('intentional-marker')
			}
			if (je.decision.actionVerdict === 'quarantine-review') {
				categoriesPresent.add('quarantine-guarded')
			}
		}

		categoryCounts.all += 1
		for (const cat of categoriesPresent) {
			if (cat in categoryCounts) {
				categoryCounts[cat] += 1
			}
		}

		let topSeverity = 'ok'
		let topVerdict = 'healthy'
		for (const je of junkEntries) {
			if (SEVERITY_RANK[je.decision.severity] > SEVERITY_RANK[topSeverity]) {
				topSeverity = je.decision.severity
			}
			if (VERDICT_RANK[je.decision.actionVerdict] > VERDICT_RANK[topVerdict]) {
				topVerdict = je.decision.actionVerdict
			}
		}

		const maxFileSize = Math.max(...evaluatedEntries.map(e => e.sizeBytes), 0)
		const primaryEntry = junkEntries[0]

		allItems.push({
			groupId: group.groupId,
			groupKey: group.groupKey,
			hash: group.hash,
			rawGroup: group.rawGroup,
			primaryName: primaryEntry.basename,
			primaryPath: primaryEntry.normalizedPath,
			entries: evaluatedEntries,
			junkEntries,
			healthyEntries: evaluatedEntries.filter(e => !e.classification.isJunkCandidate),
			safePurgeEntries: groupSafePurgeEntries,
			quarantineEntries: groupQuarantineEntries,
			protectedEntries: groupProtectedEntries,
			safePurgeBytes: groupSafePurgeBytes,
			safePurgeFormatted: formatBytes(groupSafePurgeBytes),
			quarantineBytes: groupQuarantineBytes,
			quarantineFormatted: formatBytes(groupQuarantineBytes),
			maxFileSize,
			maxFileSizeFormatted: formatBytes(maxFileSize),
			categoriesPresent: Array.from(categoriesPresent),
			topSeverity,
			topVerdict,
		})
	}

	const filteredItems = allItems.filter(item => {
		if (categoryFilter !== 'all' && !item.categoriesPresent.includes(categoryFilter)) {
			return false
		}
		if (pairingFilter === 'safe-purge' && item.safePurgeEntries.length === 0) {
			return false
		}
		if (pairingFilter === 'quarantine-only' && item.quarantineEntries.length === 0 && item.protectedEntries.length === 0) {
			return false
		}
		if (minSizeBytes > 0 && item.maxFileSize < minSizeBytes) {
			return false
		}
		if (searchQuery) {
			const hay = item.entries.map(e => (
				`${e.normalizedPath} ${e.basename} ${e.classification.label} ${e.pairing.pairingLabel} ${e.decision.reason}`
			)).join(' ').toLowerCase()
			if (!hay.includes(searchQuery)) {
				return false
			}
		}
		return true
	})

	filteredItems.sort((a, b) => {
		if (sortMode === 'reclaim_desc') {
			if (b.safePurgeBytes !== a.safePurgeBytes) {
				return b.safePurgeBytes - a.safePurgeBytes
			}
		} else if (sortMode === 'size_desc') {
			if (b.maxFileSize !== a.maxFileSize) {
				return b.maxFileSize - a.maxFileSize
			}
		} else if (sortMode === 'path_asc') {
			return a.primaryPath.localeCompare(b.primaryPath)
		} else {
			const sevDiff = SEVERITY_RANK[b.topSeverity] - SEVERITY_RANK[a.topSeverity]
			if (sevDiff !== 0) {
				return sevDiff
			}
			if (b.safePurgeBytes !== a.safePurgeBytes) {
				return b.safePurgeBytes - a.safePurgeBytes
			}
		}
		return a.primaryPath.localeCompare(b.primaryPath)
	})

	return {
		schema: JUNK_PAIR_SCHEMA,
		items: filteredItems,
		allItems,
		summary: {
			totalGroups: normalizedGroups.length,
			flaggedGroupCount: allItems.length,
			visibleGroupCount: filteredItems.length,
			safePurgeCount,
			safePurgeBytes,
			safePurgeFormatted: formatBytes(safePurgeBytes),
			quarantineCount,
			quarantineBytes,
			quarantineFormatted: formatBytes(quarantineBytes),
			intentionalMarkerCount,
			partialFragmentCount,
			appleDoubleOsCount,
			zeroByteCount,
			protectedHoldCount,
			categoryCounts,
		},
	}
}

/**
 * Collect strictly verified safe-purge candidate files from a report or specific group.
 * Never includes Origin, locked, read-only, intentional markers, or quarantine-held files.
 *
 * @param {object} report Output from analyzeJunkPairs.
 * @param {object} [options] Optional targetGroupKey filter.
 * @return {{ files: Array<object>, entries: Array<object>, totalBytes: number, totalFormatted: string, skippedProtectedCount: number }} Selection bundle.
 */
export function collectSafeJunkPurgeSelection(report, options = {}) {
	const items = report && Array.isArray(report.items) ? report.items : []
	const targetGroupKey = options.targetGroupKey || null
	const seenKeys = new Set()
	const files = []
	const entries = []
	let totalBytes = 0
	let skippedProtectedCount = 0

	for (const item of items) {
		if (targetGroupKey && item.groupKey !== targetGroupKey) {
			continue
		}
		skippedProtectedCount += item.quarantineEntries.length + item.protectedEntries.length
		for (const entry of item.safePurgeEntries) {
			if (!entry.raw || seenKeys.has(entry.selectionKey)) {
				continue
			}
			seenKeys.add(entry.selectionKey)
			files.push(entry.raw)
			entries.push(entry)
			totalBytes += entry.sizeBytes
		}
	}

	return {
		files,
		entries,
		totalBytes,
		totalFormatted: formatBytes(totalBytes),
		skippedProtectedCount,
	}
}

/**
 * Generate a DRY_RUN-first POSIX quarantine-or-purge + Nextcloud OCC rescan script.
 *
 * @param {object} report Output from analyzeJunkPairs.
 * @param {object} [options] Script options (dataRoot, quarantineDir, targetGroupKey).
 * @return {string} POSIX shell script.
 */
export function buildJunkSafePurgeScript(report, options = {}) {
	const dataRoot = sanitizeJunkPath(options.dataRoot || '/var/www/nextcloud/data') || '/var/www/nextcloud/data'
	const quarantineDir = sanitizeJunkPath(options.quarantineDir || '/var/tmp/nextcloud-junk-quarantine') || '/var/tmp/nextcloud-junk-quarantine'
	const selection = collectSafeJunkPurgeSelection(report, {
		targetGroupKey: options.targetGroupKey || null,
	})

	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'# DuplicateFinder Junk Pair Safe-Purge & Quarantine Script (DRY_RUN=1 by default)',
		`# Verified safe-purge targets: ${selection.entries.length} (${selection.totalFormatted})`,
		`# Quarantine-guarded / protected skipped: ${selection.skippedProtectedCount}`,
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		`DATA_ROOT=${shellQuote(dataRoot)}`,
		`QUARANTINE_DIR=${shellQuote(quarantineDir)}`,
		'',
	]

	if (selection.entries.length === 0) {
		lines.push('echo "[junk-pair-audit] No safe-purge junk files eligible under active guardrails."')
		return `${lines.join('\n')}\n`
	}

	const affectedUsers = new Set()
	lines.push('if [ "$DRY_RUN" = "1" ]; then')
	lines.push('  echo "[DRY_RUN=1] Previewing quarantine move only. Re-run with DRY_RUN=0 to stage into $QUARANTINE_DIR."')
	lines.push('else')
	lines.push('  mkdir -p "$QUARANTINE_DIR"')
	lines.push('fi')
	lines.push('')

	for (const entry of selection.entries) {
		if (entry.owner && entry.owner !== 'shared') {
			affectedUsers.add(entry.owner)
		}
		const rel = entry.normalizedPath.replace(/^\/+/, '')
		const srcExpr = `"$DATA_ROOT"/${shellQuote(rel)}`
		const destDirExpr = `"$QUARANTINE_DIR"/${shellQuote(entry.directory.replace(/^\/+/, ''))}`
		lines.push(`# [${entry.decision.verdictLabel}] ${entry.pairing.pairingDetail}`)
		lines.push(`if [ -e ${srcExpr} ]; then`)
		lines.push('  if [ "$DRY_RUN" = "1" ]; then')
		lines.push(`    echo "[DRY_RUN] mv ${srcExpr} -> ${destDirExpr}/"`)
		lines.push('  else')
		lines.push(`    mkdir -p ${destDirExpr} && mv -n -- ${srcExpr} ${destDirExpr}/`)
		lines.push('  fi')
		lines.push('fi')
	}

	lines.push('')
	if (affectedUsers.size > 0) {
		for (const uid of affectedUsers) {
			lines.push('if [ "$DRY_RUN" != "1" ]; then')
			lines.push(`  sudo -u www-data php occ files:scan ${shellQuote(uid)}`)
			lines.push('fi')
		}
	} else {
		lines.push('if [ "$DRY_RUN" != "1" ]; then')
		lines.push('  sudo -u www-data php occ files:scan --all')
		lines.push('fi')
	}

	return `${lines.join('\n')}\n`
}

/**
 * Build a CWE-1236-safe CSV ledger for all inspected junk pair entries.
 *
 * @param {object} report Output from analyzeJunkPairs.
 * @return {string} RFC 4180 CSV content.
 */
export function buildJunkQuarantineCsv(report) {
	const items = report && Array.isArray(report.items) ? report.items : []
	const headers = [
		'Group ID',
		'Verdict',
		'Severity',
		'Junk Kind',
		'Pairing State',
		'File Size (Bytes)',
		'File Path',
		'Companion Path',
		'Owner',
		'Guardrail Reason',
	]
	const rows = [headers.map(escapeCsvCell).join(',')]

	for (const item of items) {
		for (const entry of item.junkEntries) {
			const companionPath = entry.pairing.companionEntry ? entry.pairing.companionEntry.normalizedPath : ''
			rows.push([
				String(item.groupId),
				entry.decision.actionVerdict,
				entry.decision.severity,
				entry.classification.label,
				entry.pairing.pairingLabel,
				String(entry.sizeBytes),
				entry.normalizedPath,
				companionPath,
				entry.owner,
				entry.decision.reason,
			].map(escapeCsvCell).join(','))
		}
	}

	return rows.join('\n')
}

/**
 * Build a structured JSON audit certificate for junk pair analysis.
 *
 * @param {object} report Output from analyzeJunkPairs.
 * @param {string} [exportedAt] Optional ISO timestamp override.
 * @return {string} Formatted JSON string.
 */
export function buildJunkPairJsonReport(report, exportedAt = new Date().toISOString()) {
	const items = report && Array.isArray(report.items) ? report.items : []
	const summary = report && report.summary ? report.summary : {}

	const payload = {
		schema: JUNK_PAIR_SCHEMA,
		exportedAt,
		summary,
		groups: items.map(item => ({
			groupId: item.groupId,
			hash: item.hash,
			topVerdict: item.topVerdict,
			topSeverity: item.topSeverity,
			safePurgeBytes: item.safePurgeBytes,
			quarantineBytes: item.quarantineBytes,
			findings: item.junkEntries.map(entry => ({
				fileId: entry.fileId,
				path: entry.normalizedPath,
				basename: entry.basename,
				sizeBytes: entry.sizeBytes,
				owner: entry.owner,
				junkKind: entry.classification.junkKind,
				category: entry.classification.category,
				pairingStatus: entry.pairing.pairingStatus,
				companionPath: entry.pairing.companionEntry ? entry.pairing.companionEntry.normalizedPath : null,
				actionVerdict: entry.decision.actionVerdict,
				severity: entry.decision.severity,
				reason: entry.decision.reason,
			})),
		})),
	}

	return JSON.stringify(payload, null, 2)
}
