/**
 * Pure Ransomware Canary, Suspicious Extension Drift & Mass-Entropy Anomaly Guard.
 * Detects mutated .locked/.enc/double-extension counterparts next to clean originals,
 * replicated ransom-note clusters, honeypot canary tripwires, high-entropy anomalies,
 * and burst-wave encryption patterns, quarantining bulk deletion of clean survivors
 * until an administrator verifies and logs forensic clearance.
 */

import { formatBytes } from './duplicateStats'
import { formatFileModifiedTime } from './duplicatePathDiff'
import { getFileSelectionKey, escapeCsvCell } from './duplicateSelectionAndExport'

export const RANSOMWARE_CANARY_SCHEMA = 'duplicatefinder.ransomware-canary-guard.v1'

export const RANSOMWARE_CANARY_PRESETS = Object.freeze([
	{
		id: 'zero-trust-shield',
		name: 'Zero-Trust Canary & Drift Shield',
		description: 'Quarantines clean survivors whenever extension drift, canary tripwires, ransom notes, or entropy anomalies appear.',
		entropyThreshold: 7.85,
		burstWindowMinutes: 15,
		burstMinFiles: 3,
		quarantineBulkDelete: true,
	},
	{
		id: 'desktop-sync-burst',
		name: 'Sync Client Burst Wave',
		description: 'Detects rapid 30-minute Nextcloud Desktop or WebDAV encryption bursts and double-extension drift.',
		entropyThreshold: 7.75,
		burstWindowMinutes: 30,
		burstMinFiles: 2,
		quarantineBulkDelete: true,
	},
	{
		id: 'canary-honeypot-hunt',
		name: 'Canary & Ransom-Note IOC Hunt',
		description: 'Prioritizes tripwire canary bait paths and replicated ransom-note files across shared directories.',
		entropyThreshold: 7.9,
		burstWindowMinutes: 60,
		burstMinFiles: 2,
		quarantineBulkDelete: true,
	},
	{
		id: 'post-incident-recovery',
		name: 'Post-Incident Survivor Recovery',
		description: 'Highlights clean verified originals beside mutated copies for controlled admin clearance and rollback.',
		entropyThreshold: 7.8,
		burstWindowMinutes: 45,
		burstMinFiles: 3,
		quarantineBulkDelete: true,
	},
])

export const GUARD_FILTER_MODES = Object.freeze([
	{ id: 'all', label: 'All groups' },
	{ id: 'quarantined', label: 'Quarantined' },
	{ id: 'extension-drift', label: 'Extension drift' },
	{ id: 'ransom-note', label: 'Ransom notes' },
	{ id: 'canary-tripwire', label: 'Canary tripwire' },
	{ id: 'entropy-burst', label: 'Entropy / burst' },
	{ id: 'verified', label: 'Admin verified' },
	{ id: 'clean', label: 'Clean' },
])

export const GUARD_SEVERITY_FILTERS = Object.freeze([
	{ id: 'all', label: 'All severities' },
	{ id: 'critical', label: 'Critical' },
	{ id: 'high', label: 'High' },
	{ id: 'medium', label: 'Medium' },
	{ id: 'clean', label: 'Clean' },
])

export const GUARD_SORT_MODES = Object.freeze([
	{ id: 'risk-score', label: 'Risk score' },
	{ id: 'affected-bytes', label: 'Quarantined bytes' },
	{ id: 'burst-recency', label: 'Latest mutation' },
	{ id: 'copy-count', label: 'Copy count' },
])

export const RANSOMWARE_EXTENSIONS = new Set([
	'locked', 'enc', 'encrypted', 'crypt', 'crypted', 'crypto', 'lockbit',
	'akira', 'blackcat', 'alphv', 'conti', 'ryuk', 'cerber', 'wannacry',
	'wncry', 'wcry', 'locky', 'zepto', 'crinf', 'r5a', 'xrtn', 'xtbl',
	'eking', 'phobos', 'stop', 'djvu', 'makop', 'medusa', 'hive', 'play',
	'clop', 'rhysida', 'bianlian', '8lock', 'cryptolocker', 'thor', 'odin',
	'aes256', 'rsa4096', 'darkbit', 'royal', 'cactus', 'inc',
])

export const CLEAN_COMMON_EXTENSIONS = new Set([
	'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp',
	'txt', 'csv', 'tsv', 'json', 'xml', 'yaml', 'yml', 'md', 'sql', 'rtf',
	'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'tiff', 'tif',
	'raw', 'cr2', 'nef', 'arw', 'dng', 'bmp', 'svg', 'mp4', 'mov', 'mkv',
	'avi', 'mp3', 'flac', 'wav', 'aac', 'm4a', 'ogg', 'zip', 'tar', 'gz',
	'7z', 'rar', 'html', 'htm', 'psd', 'ai', 'indd', 'dwg', 'step', 'ini',
	'conf', 'cfg', 'log', 'php', 'js', 'ts', 'py', 'css', 'scss',
])

const NATURALLY_HIGH_ENTROPY_EXTENSIONS = new Set([
	'zip', 'gz', 'bz2', 'xz', 'zst', '7z', 'rar', 'jpg', 'jpeg', 'png',
	'webp', 'heic', 'heif', 'mp4', 'mov', 'mkv', 'mp3', 'aac', 'm4a',
	'ogg', 'flac', 'docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp', 'pdf',
	'woff2', 'apk', 'ipa', 'jar', 'whl', 'tgz',
])

const PLAIN_LOW_ENTROPY_EXTENSIONS = new Set([
	'txt', 'csv', 'tsv', 'log', 'json', 'xml', 'yaml', 'yml', 'md', 'sql',
	'html', 'htm', 'svg', 'bmp', 'wav', 'doc', 'xls', 'ppt', 'rtf', 'ini',
	'conf', 'cfg', 'php', 'js', 'ts', 'py', 'css', 'scss',
])

const BENIGN_COMPOUND_SUFFIXES = new Set([
	'tar.gz', 'tar.bz2', 'tar.xz', 'tar.zst', 'tar.lz4', 'min.js', 'min.css',
	'd.ts', 'blade.php', 'spec.js', 'test.js', 'test.cjs', 'test.mjs',
	'spec.ts', 'test.ts', 'map.json', 'user.ini', 'vc.xml',
])

const RANSOM_NOTE_RE = /^(?:readme[_ -]?decrypt|how[_ -]?to[_ -]?decrypt|how[_ -]?to[_ -]?recover|decrypt[_ -]?instructions?|restore[_ -]?files?|recovery[_ -]?key|_readme|read[_ -]?me[_ -]?for[_ -]?decrypt|files[_ -]?encrypted|!readme!|@please[_ -]?read[_ -]?me@|ransom[_ -]?note|unlock[_ -]?files)(?:\.[a-z0-9]{1,8})?$/i

const CANARY_PATH_RE = /(?:^|\/)(?:\.?nc-canary|canary|honeypot|tripwire|_000_canary|~canary)(?:[._/-]|$)|(?:canary[_ -]?bait|honeypot[_ -]?bait|\.canary\.)/i

const SUSPICIOUS_RANDOM_SUFFIX_RE = /^[a-z0-9]{4,10}$/

const STATUS_LABELS = Object.freeze({
	quarantined: 'Quarantined (Survivor Protected)',
	'hold-all': 'Evidence Hold (No Clean Copy)',
	'verified-safe': 'Admin Verified Safe',
	clean: 'Clean',
})

const SEVERITY_LABELS = Object.freeze({
	critical: 'Critical',
	high: 'High',
	medium: 'Medium',
	clean: 'Clean',
})

/**
 * Sanitize an incident or ticket identifier into a deterministic safe token.
 *
 * @param {string|null|undefined} raw - Raw incident ID input.
 * @return {string} Safe incident ID (e.g. 'INC-2026-001').
 */
export function sanitizeIncidentId(raw) {
	if (typeof raw !== 'string') {
		return 'INC-2026-001'
	}
	const cleaned = raw
		.trim()
		.toUpperCase()
		.replace(/[^A-Z0-9._-]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 48)
	return cleaned || 'INC-2026-001'
}

/**
 * Sanitize an admin or analyst identifier into a safe Nextcloud-compatible token.
 *
 * @param {string|null|undefined} raw - Raw identifier.
 * @param {string} [fallback=''] - Fallback when empty.
 * @return {string} Sanitized identifier.
 */
export function sanitizeAdminId(raw, fallback = '') {
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
 * Sanitize single-line free text to keep outputs free of control characters.
 *
 * @param {string|null|undefined} raw - Raw text input.
 * @param {number} [maxLen=240] - Maximum length.
 * @return {string} Clean single-line text.
 */
export function sanitizeSingleLineText(raw, maxLen = 240) {
	if (typeof raw !== 'string') {
		return ''
	}
	const stripped = Array.from(raw.replace(/[\r\n\t]+/g, ' '))
		.filter(ch => {
			const code = ch.charCodeAt(0)
			return code >= 32 && code !== 127
		})
		.join('')
	return stripped
		.replace(/[\u2013\u2014]/g, '-')
		.trim()
		.slice(0, maxLen)
}

/**
 * Compile a custom canary or ransomware path matcher safely without catastrophic backtracking.
 *
 * @param {string|null|undefined} pattern - Raw user pattern.
 * @return {function(string): boolean} Predicate taking a normalized path.
 */
export function compileSafePattern(pattern) {
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
 * Parse a timestamp into epoch milliseconds (supporting seconds and milliseconds).
 *
 * @param {number|string|null|undefined} raw - Raw timestamp value.
 * @return {number} Epoch milliseconds or 0 if invalid.
 */
export function parseTimestampMs(raw) {
	if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
		return raw < 100000000000 ? Math.round(raw * 1000) : Math.round(raw)
	}
	if (typeof raw === 'string' && raw.trim() !== '') {
		const numeric = Number(raw.trim())
		if (Number.isFinite(numeric) && numeric > 0) {
			return numeric < 100000000000 ? Math.round(numeric * 1000) : Math.round(numeric)
		}
		const parsed = Date.parse(raw)
		if (Number.isFinite(parsed) && parsed > 0) {
			return parsed
		}
	}
	return 0
}

/**
 * Normalize Shannon entropy into bits/byte (0..8). Accepts 0..1 normalized or 0..8 raw values.
 *
 * @param {number|string|null|undefined} rawEntropy - Raw entropy score.
 * @return {number|null} Normalized entropy in bits/byte or null if absent.
 */
export function normalizeEntropyBits(rawEntropy) {
	if (rawEntropy === null || rawEntropy === undefined || rawEntropy === '') {
		return null
	}
	const numeric = Number(rawEntropy)
	if (!Number.isFinite(numeric) || numeric < 0) {
		return null
	}
	const bits = numeric <= 1 && numeric > 0 ? numeric * 8 : numeric
	return Math.round(Math.min(8, Math.max(0, bits)) * 100) / 100
}

/**
 * Normalize a Nextcloud file path into a clean POSIX path while preserving
 * leading `/<user>/files` and `/__groupfolders/<id>` custodian prefixes.
 *
 * @param {string|null|undefined} rawPath - Raw Nextcloud file path.
 * @return {string} Normalized POSIX path or empty string.
 */
export function normalizeForensicPath(rawPath) {
	if (typeof rawPath !== 'string') {
		return ''
	}
	const trimmed = rawPath.trim().replace(/\\/g, '/').replace(/\/+/g, '/')
	if (!trimmed) {
		return ''
	}
	return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

/**
 * Extract the Nextcloud custodian or storage root label from a normalized path.
 *
 * @param {string|null|undefined} rawPath - File path.
 * @return {string} Custodian or scope label.
 */
export function extractCustodianScope(rawPath) {
	const normalized = normalizeForensicPath(rawPath)
	if (!normalized) {
		return 'default-scope'
	}
	const groupMatch = normalized.match(/^\/(?:__groupfolders|groupfolders)\/([^/]+)(?:\/|$)/i)
	if (groupMatch) {
		return `groupfolder:${groupMatch[1]}`
	}
	const externalMatch = normalized.match(/^\/(?:__external|external|mounts)\/([^/]+)(?:\/|$)/i)
	if (externalMatch) {
		return `mount:${externalMatch[1]}`
	}
	const userMatch = normalized.match(/^\/([^/]+)\/files(?:\/|$)/i)
	if (userMatch) {
		return userMatch[1]
	}
	const rootSegment = normalized.replace(/^\/+/, '').split('/')[0]
	return rootSegment || 'default-scope'
}

/**
 * Extract filename, stem, outer extension, and double-extension drift signals from a path.
 *
 * @param {string} normalizedPath - Normalized POSIX path.
 * @param {string} [explicitName=''] - Optional file.name override.
 * @return {object} Parsed extension metadata.
 */
export function parseExtensionDriftSignals(normalizedPath, explicitName = '') {
	const leaf = explicitName
		? String(explicitName).split('/').pop().trim()
		: (normalizedPath.split('/').pop() || '')
	const lowerLeaf = leaf.toLowerCase()
	const parts = lowerLeaf.split('.').filter(Boolean)

	let outerExt = ''
	let innerExt = ''
	let compoundSuffix = ''
	let cleanStem = lowerLeaf

	if (parts.length >= 2 && !lowerLeaf.startsWith('.')) {
		outerExt = parts[parts.length - 1]
		if (parts.length >= 3) {
			innerExt = parts[parts.length - 2]
			compoundSuffix = `${innerExt}.${outerExt}`
		}
		cleanStem = parts.slice(0, -1).join('.')
	} else if (parts.length >= 3 && lowerLeaf.startsWith('.')) {
		outerExt = parts[parts.length - 1]
		innerExt = parts[parts.length - 2]
		compoundSuffix = `${innerExt}.${outerExt}`
		cleanStem = `.${parts.slice(0, -1).join('.')}`
	}

	const isRansomwareExt = Boolean(outerExt && RANSOMWARE_EXTENSIONS.has(outerExt))
	const isBenignCompound = Boolean(compoundSuffix && BENIGN_COMPOUND_SUFFIXES.has(compoundSuffix))
	const hasInnerCleanExt = Boolean(innerExt && CLEAN_COMMON_EXTENSIONS.has(innerExt))
	const isOpaqueOuterSuffix = Boolean(
		outerExt
		&& !CLEAN_COMMON_EXTENSIONS.has(outerExt)
		&& !NATURALLY_HIGH_ENTROPY_EXTENSIONS.has(outerExt)
		&& SUSPICIOUS_RANDOM_SUFFIX_RE.test(outerExt),
	)
	const hasDoubleExtensionDrift = Boolean(
		hasInnerCleanExt
		&& !isBenignCompound
		&& (isRansomwareExt || isOpaqueOuterSuffix),
	)

	const recoveredCleanStem = hasDoubleExtensionDrift
		? lowerLeaf.slice(0, lowerLeaf.length - outerExt.length - 1)
		: lowerLeaf

	return {
		fileName: leaf,
		lowerFileName: lowerLeaf,
		outerExt,
		innerExt,
		cleanStem,
		recoveredCleanStem,
		isRansomwareExt,
		hasDoubleExtensionDrift,
		isBenignCompound,
	}
}

/**
 * Normalize a persisted admin verification registry object.
 *
 * @param {object|null|undefined} raw - Raw registry map.
 * @return {object} Normalized verification registry keyed by groupKey.
 */
export function normalizeVerifiedRegistry(raw) {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return {}
	}
	const result = {}
	for (const [key, entry] of Object.entries(raw)) {
		if (!key || !entry || typeof entry !== 'object') {
			continue
		}
		result[String(key)] = {
			groupKey: String(entry.groupKey || key),
			incidentId: sanitizeIncidentId(entry.incidentId),
			verifiedBy: sanitizeAdminId(entry.verifiedBy, 'sysadmin'),
			reason: sanitizeSingleLineText(entry.reason || 'Verified safe by administrator', 200),
			verifiedAtIso: typeof entry.verifiedAtIso === 'string' ? entry.verifiedAtIso : '',
		}
	}
	return result
}

/**
 * Normalize a persisted manual quarantine lock registry object.
 *
 * @param {object|null|undefined} raw - Raw quarantine lock registry.
 * @return {object} Normalized quarantine registry keyed by groupKey.
 */
export function normalizeQuarantineRegistry(raw) {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return {}
	}
	const result = {}
	for (const [key, entry] of Object.entries(raw)) {
		if (!key || !entry || typeof entry !== 'object') {
			continue
		}
		result[String(key)] = {
			groupKey: String(entry.groupKey || key),
			incidentId: sanitizeIncidentId(entry.incidentId),
			lockedBy: sanitizeAdminId(entry.lockedBy, 'sysadmin'),
			reason: sanitizeSingleLineText(entry.reason || 'Manual incident quarantine lock', 200),
			lockedAtIso: typeof entry.lockedAtIso === 'string' ? entry.lockedAtIso : '',
		}
	}
	return result
}

/**
 * Validate administrator verification clearance form inputs.
 *
 * @param {object} input - Verification fields.
 * @param {string} input.verifierId - Admin identifier.
 * @param {string} input.reason - Forensic clearance justification.
 * @return {{ valid: boolean, verifierId: string, reason: string, errors: string[] }} Validation outcome.
 */
export function validateVerificationInput(input = {}) {
	const errors = []
	const verifierId = sanitizeAdminId(input.verifierId, '')
	const reason = sanitizeSingleLineText(input.reason, 200)

	if (!verifierId) {
		errors.push('Admin verifier ID is required before releasing quarantine.')
	}
	if (reason.length < 8) {
		errors.push('Verification note must be at least 8 characters describing why the group is safe.')
	}

	return {
		valid: errors.length === 0,
		verifierId,
		reason,
		errors,
	}
}

/**
 * Build a stable group identifier key from a duplicate group payload.
 *
 * @param {object} group - Duplicate group.
 * @param {number} index - Fallback index.
 * @return {string} Deterministic group key.
 */
export function buildGuardGroupKey(group, index = 0) {
	if (group && group.id !== undefined && group.id !== null && String(group.id).trim() !== '') {
		return `id:${String(group.id).trim()}`
	}
	if (group && typeof group.hash === 'string' && group.hash.trim() !== '') {
		return `hash:${group.hash.trim()}`
	}
	return `idx:${index}`
}

/**
 * Inspect an individual duplicate file entry for ransomware, canary, drift, and entropy anomalies.
 *
 * @param {object} file - File record from duplicate group.
 * @param {number} groupUnitSize - Fallback group byte size.
 * @param {object} context - Evaluation options and compiled matchers.
 * @return {object} Annotated file inspection record.
 */
function inspectFileEntry(file, groupUnitSize, context) {
	const safeFile = file && typeof file === 'object' ? file : {}
	const normalizedPath = normalizeForensicPath(safeFile.path || safeFile.name || '')
	const extMeta = parseExtensionDriftSignals(normalizedPath, safeFile.name || '')
	const custodian = extractCustodianScope(normalizedPath)
	const mtimeMs = parseTimestampMs(safeFile.mtime || safeFile.modifiedAt || safeFile.timestamp)
	const rawSize = Number(safeFile.size)
	const sizeBytes = Number.isFinite(rawSize) && rawSize >= 0 ? rawSize : groupUnitSize
	const mime = typeof safeFile.mime === 'string' ? safeFile.mime.trim().toLowerCase() : ''

	const isRansomNote = RANSOM_NOTE_RE.test(extMeta.lowerFileName)
	const isCanaryTripwire = CANARY_PATH_RE.test(normalizedPath)
		|| context.customMatcher(normalizedPath)
	const entropyBits = normalizeEntropyBits(
		safeFile.entropy !== undefined ? safeFile.entropy : safeFile.shannonEntropy,
	)

	const isNaturallyHighEntropy = NATURALLY_HIGH_ENTROPY_EXTENSIONS.has(extMeta.outerExt)
	const isPlainLowEntropyExt = PLAIN_LOW_ENTROPY_EXTENSIONS.has(extMeta.outerExt)
	const isHighEntropyAnomaly = Boolean(
		entropyBits !== null
		&& entropyBits >= context.entropyThreshold
		&& (
			extMeta.isRansomwareExt
			|| extMeta.hasDoubleExtensionDrift
			|| isPlainLowEntropyExt
			|| !isNaturallyHighEntropy
		),
	)

	const isMimeMismatch = Boolean(
		mime
		&& (
			(mime === 'application/octet-stream' && isPlainLowEntropyExt)
			|| (mime.startsWith('text/') && extMeta.isRansomwareExt)
		),
	)

	const isOrigin = Boolean(safeFile.isOrigin || safeFile.is_origin || safeFile.isInOriginFolder)
	const isLocked = Boolean(safeFile.locked || safeFile.isLocked)
	const versionCount = Number.isFinite(Number(safeFile.versionCount))
		? Number(safeFile.versionCount)
		: (Array.isArray(safeFile.versions) ? safeFile.versions.length : 0)

	let fileRole = 'clean_candidate'
	if (isCanaryTripwire) {
		fileRole = 'canary_tripwire'
	} else if (isRansomNote) {
		fileRole = 'ransom_note'
	} else if (extMeta.isRansomwareExt || extMeta.hasDoubleExtensionDrift || isHighEntropyAnomaly || isMimeMismatch) {
		fileRole = 'suspicious_encrypted'
	}

	const signals = []
	if (isCanaryTripwire) {
		signals.push('canary_tripwire')
	}
	if (isRansomNote) {
		signals.push('ransom_note')
	}
	if (extMeta.isRansomwareExt) {
		signals.push('ransomware_extension')
	}
	if (extMeta.hasDoubleExtensionDrift) {
		signals.push('double_extension_drift')
	}
	if (isHighEntropyAnomaly) {
		signals.push('high_entropy_anomaly')
	}
	if (isMimeMismatch) {
		signals.push('mime_extension_mismatch')
	}

	let cleanSurvivorScore = fileRole === 'clean_candidate' ? 100 : -1000
	if (fileRole === 'clean_candidate') {
		if (isOrigin) {
			cleanSurvivorScore += 30
		}
		if (versionCount > 0) {
			cleanSurvivorScore += 15
		}
		if (isLocked) {
			cleanSurvivorScore += 10
		}
		if (CLEAN_COMMON_EXTENSIONS.has(extMeta.outerExt)) {
			cleanSurvivorScore += 10
		}
	}

	return {
		raw: safeFile,
		selectionKey: getFileSelectionKey(safeFile) || normalizedPath,
		normalizedPath,
		fileName: extMeta.fileName,
		outerExt: extMeta.outerExt,
		innerExt: extMeta.innerExt,
		cleanStem: extMeta.cleanStem,
		recoveredCleanStem: extMeta.recoveredCleanStem,
		custodian,
		sizeBytes,
		sizeFormatted: formatBytes(sizeBytes),
		mtimeMs,
		mtimeFormatted: formatFileModifiedTime(safeFile),
		mtimeIso: mtimeMs > 0 ? new Date(mtimeMs).toISOString() : '',
		mime,
		entropyBits,
		isRansomNote,
		isCanaryTripwire,
		isRansomwareExt: extMeta.isRansomwareExt,
		hasDoubleExtensionDrift: extMeta.hasDoubleExtensionDrift,
		isHighEntropyAnomaly,
		isMimeMismatch,
		isOrigin,
		isLocked,
		versionCount,
		fileRole,
		signals,
		cleanSurvivorScore,
		isProtectedSurvivor: false,
		isBurstWaveMember: false,
	}
}

/**
 * Detect rapid modification burst windows across suspicious or anomalous files.
 *
 * @param {Array<object>} inspectedGroups - Pre-inspected groups.
 * @param {number} burstWindowMinutes - Window width in minutes.
 * @param {number} burstMinFiles - Minimum suspicious files in window to trigger burst wave.
 * @return {Array<object>} Detected burst wave windows.
 */
export function detectBurstWaveWindows(inspectedGroups, burstWindowMinutes, burstMinFiles) {
	const windowMs = Math.max(1, burstWindowMinutes) * 60 * 1000
	const minFiles = Math.max(2, burstMinFiles)
	const candidates = []

	for (const group of inspectedGroups) {
		for (const file of group.files) {
			if (file.mtimeMs > 0 && file.fileRole !== 'clean_candidate') {
				candidates.push({
					groupKey: group.groupKey,
					selectionKey: file.selectionKey,
					mtimeMs: file.mtimeMs,
					custodian: file.custodian,
					path: file.normalizedPath,
				})
			}
		}
	}

	if (candidates.length < minFiles) {
		return []
	}

	candidates.sort((a, b) => a.mtimeMs - b.mtimeMs)
	const windows = []
	let startIdx = 0

	for (let endIdx = 0; endIdx < candidates.length; endIdx++) {
		while (candidates[endIdx].mtimeMs - candidates[startIdx].mtimeMs > windowMs) {
			startIdx += 1
		}
		const spanCount = endIdx - startIdx + 1
		if (spanCount >= minFiles) {
			const slice = candidates.slice(startIdx, endIdx + 1)
			const startMs = slice[0].mtimeMs
			const endMs = slice[slice.length - 1].mtimeMs
			const existing = windows[windows.length - 1]
			if (existing && startMs <= existing.endMs) {
				existing.endMs = Math.max(existing.endMs, endMs)
				existing.endIso = new Date(existing.endMs).toISOString()
				for (const item of slice) {
					existing.memberKeys.add(item.selectionKey)
					existing.groupKeys.add(item.groupKey)
					existing.custodians.add(item.custodian)
				}
			} else {
				windows.push({
					id: `burst-${windows.length + 1}`,
					startMs,
					endMs,
					startIso: new Date(startMs).toISOString(),
					endIso: new Date(endMs).toISOString(),
					memberKeys: new Set(slice.map(item => item.selectionKey)),
					groupKeys: new Set(slice.map(item => item.groupKey)),
					custodians: new Set(slice.map(item => item.custodian)),
				})
			}
		}
	}

	return windows.map(win => ({
		id: win.id,
		startMs: win.startMs,
		endMs: win.endMs,
		startIso: win.startIso,
		endIso: win.endIso,
		fileCount: win.memberKeys.size,
		groupCount: win.groupKeys.size,
		custodians: Array.from(win.custodians),
		memberKeys: win.memberKeys,
		groupKeys: win.groupKeys,
	}))
}

/**
 * Evaluate duplicate groups for ransomware canary tripwires, extension drift,
 * mass-entropy anomalies, and burst-wave attacks, enforcing clean survivor quarantine.
 *
 * @param {Array<object>} duplicates - Duplicate groups from store/scan.
 * @param {object} [options] - Guard policy and UI filters.
 * @return {object} Complete deterministic guard analysis report.
 */
export function evaluateRansomwareCanaryGuard(duplicates = [], options = {}) {
	const safeDuplicates = Array.isArray(duplicates) ? duplicates : []
	const presetId = typeof options.presetId === 'string' && options.presetId.trim()
		? options.presetId.trim()
		: RANSOMWARE_CANARY_PRESETS[0].id
	const incidentId = sanitizeIncidentId(options.incidentId)
	const entropyThresholdRaw = Number(options.entropyThreshold)
	const entropyThreshold = Number.isFinite(entropyThresholdRaw)
		? Math.min(8, Math.max(6.5, entropyThresholdRaw))
		: 7.85
	const burstWindowRaw = Number(options.burstWindowMinutes)
	const burstWindowMinutes = Number.isFinite(burstWindowRaw) && burstWindowRaw >= 1
		? Math.min(1440, Math.round(burstWindowRaw))
		: 15
	const burstMinFilesRaw = Number(options.burstMinFiles)
	const burstMinFiles = Number.isFinite(burstMinFilesRaw) && burstMinFilesRaw >= 2
		? Math.min(100, Math.round(burstMinFilesRaw))
		: 3
	const quarantineBulkDelete = options.quarantineBulkDelete !== false
	const customPattern = typeof options.customPattern === 'string' ? options.customPattern.trim() : ''
	const customMatcher = compileSafePattern(customPattern)

	const filterMode = GUARD_FILTER_MODES.some(item => item.id === options.filterMode)
		? options.filterMode
		: 'all'
	const severityFilter = GUARD_SEVERITY_FILTERS.some(item => item.id === options.severityFilter)
		? options.severityFilter
		: 'all'
	const sortMode = GUARD_SORT_MODES.some(item => item.id === options.sortMode)
		? options.sortMode
		: 'risk-score'
	const searchQuery = typeof options.searchQuery === 'string' ? options.searchQuery.trim().toLowerCase() : ''

	const verifiedRegistry = normalizeVerifiedRegistry(options.verifiedRegistry)
	const quarantineRegistry = normalizeQuarantineRegistry(options.quarantineRegistry)

	const context = {
		entropyThreshold,
		customMatcher,
	}

	const preInspected = safeDuplicates.map((group, idx) => {
		const safeGroup = group && typeof group === 'object' ? group : {}
		const groupKey = buildGuardGroupKey(safeGroup, idx)
		const rawFiles = Array.isArray(safeGroup.files) ? safeGroup.files : []
		const unitSize = Number.isFinite(Number(safeGroup.size)) && Number(safeGroup.size) >= 0
			? Number(safeGroup.size)
			: (rawFiles[0] && Number.isFinite(Number(rawFiles[0].size)) ? Number(rawFiles[0].size) : 0)

		const files = rawFiles.map(file => inspectFileEntry(file, unitSize, context))
		return {
			rawGroup: safeGroup,
			groupKey,
			groupId: safeGroup.id !== undefined && safeGroup.id !== null ? safeGroup.id : groupKey,
			hash: typeof safeGroup.hash === 'string' ? safeGroup.hash : '',
			unitSize,
			files,
		}
	})

	const burstWindows = detectBurstWaveWindows(preInspected, burstWindowMinutes, burstMinFiles)
	const burstGroupKeys = new Set()
	const burstMemberKeys = new Set()
	for (const win of burstWindows) {
		for (const gk of win.groupKeys) {
			burstGroupKeys.add(gk)
		}
		for (const mk of win.memberKeys) {
			burstMemberKeys.add(mk)
		}
	}

	const groups = preInspected.map(entry => {
		const files = entry.files
		const cleanFiles = files.filter(f => f.fileRole === 'clean_candidate')
		const suspiciousFiles = files.filter(f => f.fileRole !== 'clean_candidate')
		const distinctExts = new Set(files.map(f => f.outerExt).filter(Boolean))

		const hasCanaryTripwire = files.some(f => f.isCanaryTripwire)
		const hasRansomNote = files.some(f => f.isRansomNote)
		const hasRansomwareExt = files.some(f => f.isRansomwareExt)
		const hasDoubleExtDrift = files.some(f => f.hasDoubleExtensionDrift)
		const hasHighEntropy = files.some(f => f.isHighEntropyAnomaly)
		const hasMimeMismatch = files.some(f => f.isMimeMismatch)
		const hasMixedCleanVsMutated = cleanFiles.length > 0 && suspiciousFiles.length > 0

		const cleanStems = new Set(cleanFiles.map(f => f.lowerFileName))
		const hasStemPairDrift = files.some(
			f => f.hasDoubleExtensionDrift && cleanStems.has(f.recoveredCleanStem),
		)
		const hasCrossExtensionDrift = hasDoubleExtDrift
			|| hasRansomwareExt
			|| hasStemPairDrift
			|| (distinctExts.size > 1 && hasMixedCleanVsMutated)
			|| (distinctExts.size > 1 && files.some(f => !CLEAN_COMMON_EXTENSIONS.has(f.outerExt)))

		const hasBurstWave = burstGroupKeys.has(entry.groupKey)
		for (const file of files) {
			file.isBurstWaveMember = burstMemberKeys.has(file.selectionKey)
		}

		const manualLock = quarantineRegistry[entry.groupKey] || null
		const verifiedEntry = verifiedRegistry[entry.groupKey] || null

		let riskScore = 0
		const findings = []
		const diagnoses = []

		if (hasCanaryTripwire) {
			riskScore += 55
			findings.push('canary_tripwire')
			diagnoses.push('Canary bait / tripwire file impacted; halt bulk deletions and inspect custodian client.')
		}
		if (hasRansomNote) {
			riskScore += 50
			findings.push('ransom_note')
			diagnoses.push('Replicated ransom-note filename detected across duplicate copies.')
		}
		if (hasDoubleExtDrift || hasStemPairDrift) {
			riskScore += 45
			findings.push('extension_drift')
			diagnoses.push('Double-extension drift detected (clean document paired with appended encrypted suffix).')
		} else if (hasRansomwareExt || hasCrossExtensionDrift) {
			riskScore += 40
			findings.push('extension_drift')
			diagnoses.push('Suspicious ransomware extension mutation detected inside duplicate group.')
		}
		if (hasHighEntropy) {
			riskScore += 30
			findings.push('high_entropy_anomaly')
			diagnoses.push(`Mass-entropy spike >= ${entropyThreshold.toFixed(2)} bits/byte on non-compressed format.`)
		}
		if (hasMimeMismatch) {
			riskScore += 20
			findings.push('mime_mismatch')
			diagnoses.push('MIME payload signature conflicts with file extension.')
		}
		if (hasBurstWave) {
			riskScore += 20
			findings.push('burst_wave')
			diagnoses.push(`Modification timestamp falls inside active ${burstWindowMinutes}-minute encryption burst wave.`)
		}
		if (manualLock && findings.length === 0) {
			riskScore = Math.max(riskScore, 50)
			findings.push('manual_quarantine')
			diagnoses.push(`Manually quarantined by ${manualLock.lockedBy}: ${manualLock.reason}`)
		}

		riskScore = Math.min(100, riskScore)

		let severity = 'clean'
		if (riskScore >= 75) {
			severity = 'critical'
		} else if (riskScore >= 50) {
			severity = 'high'
		} else if (riskScore >= 25) {
			severity = 'medium'
		}

		const isAnomalous = findings.length > 0
		let quarantineStatus = 'clean'
		if (manualLock) {
			quarantineStatus = 'quarantined'
		} else if (isAnomalous) {
			if (verifiedEntry) {
				quarantineStatus = 'verified-safe'
			} else if (cleanFiles.length === 0) {
				quarantineStatus = 'hold-all'
			} else {
				quarantineStatus = 'quarantined'
			}
		}

		const quarantinedForDelete = quarantineStatus === 'quarantined' || quarantineStatus === 'hold-all'
		const bulkDeleteBlocked = quarantineBulkDelete && quarantinedForDelete

		// Select the safest clean survivor (strictly avoiding mutated/encrypted files if a clean file exists)
		const rankedFiles = [...files].sort((a, b) => {
			if (b.cleanSurvivorScore !== a.cleanSurvivorScore) {
				return b.cleanSurvivorScore - a.cleanSurvivorScore
			}
			const timeA = a.mtimeMs || Number.MAX_SAFE_INTEGER
			const timeB = b.mtimeMs || Number.MAX_SAFE_INTEGER
			if (timeA !== timeB) {
				return timeA - timeB
			}
			return a.normalizedPath.localeCompare(b.normalizedPath)
		})
		const survivorFile = rankedFiles[0] || null
		if (survivorFile) {
			survivorFile.isProtectedSurvivor = true
		}

		const totalBytes = files.reduce((sum, f) => sum + f.sizeBytes, 0)
		const reclaimableBytes = Math.max(0, totalBytes - (survivorFile ? survivorFile.sizeBytes : entry.unitSize))
		const latestMtimeMs = files.reduce((max, f) => Math.max(max, f.mtimeMs), 0)
		const maxEntropyBits = files.reduce(
			(max, f) => (f.entropyBits !== null && f.entropyBits > max ? f.entropyBits : max),
			0,
		)
		const custodians = Array.from(new Set(files.map(f => f.custodian)))
		const title = (survivorFile && survivorFile.fileName)
			|| (files[0] && files[0].fileName)
			|| `Group ${entry.groupId}`

		return {
			rawGroup: entry.rawGroup,
			groupKey: entry.groupKey,
			groupId: entry.groupId,
			hash: entry.hash,
			title,
			unitSize: entry.unitSize,
			unitSizeFormatted: formatBytes(entry.unitSize),
			totalBytes,
			totalBytesFormatted: formatBytes(totalBytes),
			reclaimableBytes,
			reclaimableBytesFormatted: formatBytes(reclaimableBytes),
			copyCount: files.length,
			cleanCount: cleanFiles.length,
			suspiciousCount: suspiciousFiles.length,
			custodians,
			primaryCustodian: custodians[0] || 'default-scope',
			riskScore,
			severity,
			severityLabel: SEVERITY_LABELS[severity] || 'Clean',
			quarantineStatus,
			quarantineStatusLabel: STATUS_LABELS[quarantineStatus] || 'Clean',
			quarantinedForDelete,
			bulkDeleteBlocked,
			cleanSurvivorProtected: Boolean(survivorFile && cleanFiles.length > 0 && quarantinedForDelete),
			survivorPath: survivorFile ? survivorFile.normalizedPath : '',
			survivorRole: survivorFile ? survivorFile.fileRole : 'clean_candidate',
			findings,
			diagnoses,
			hasCanaryTripwire,
			hasRansomNote,
			hasExtensionDrift: hasCrossExtensionDrift,
			hasHighEntropy,
			hasBurstWave,
			maxEntropyBits: maxEntropyBits > 0 ? maxEntropyBits : null,
			latestMtimeMs,
			latestMtimeIso: latestMtimeMs > 0 ? new Date(latestMtimeMs).toISOString() : '',
			verifiedEntry,
			manualLock,
			files,
		}
	})

	const summary = {
		totalGroups: groups.length,
		anomalousGroupsCount: 0,
		quarantinedGroupsCount: 0,
		holdAllGroupsCount: 0,
		verifiedSafeCount: 0,
		cleanGroupsCount: 0,
		criticalCount: 0,
		highCount: 0,
		mediumCount: 0,
		extensionDriftCount: 0,
		ransomNoteCount: 0,
		canaryTripwireCount: 0,
		entropyAnomalyCount: 0,
		burstWaveCount: 0,
		protectedCleanSurvivorsCount: 0,
		quarantinedBytes: 0,
		quarantinedBytesFormatted: formatBytes(0),
		safeReclaimableBytes: 0,
		safeReclaimableBytesFormatted: formatBytes(0),
		burstWindowCount: burstWindows.length,
		bulkDeletionQuarantineActive: false,
	}

	for (const group of groups) {
		if (group.findings.length > 0) {
			summary.anomalousGroupsCount += 1
		}
		if (group.quarantineStatus === 'quarantined') {
			summary.quarantinedGroupsCount += 1
			summary.quarantinedBytes += group.totalBytes
		} else if (group.quarantineStatus === 'hold-all') {
			summary.holdAllGroupsCount += 1
			summary.quarantinedBytes += group.totalBytes
		} else if (group.quarantineStatus === 'verified-safe') {
			summary.verifiedSafeCount += 1
			summary.safeReclaimableBytes += group.reclaimableBytes
		} else {
			summary.cleanGroupsCount += 1
			summary.safeReclaimableBytes += group.reclaimableBytes
		}

		if (group.severity === 'critical') {
			summary.criticalCount += 1
		} else if (group.severity === 'high') {
			summary.highCount += 1
		} else if (group.severity === 'medium') {
			summary.mediumCount += 1
		}

		if (group.hasExtensionDrift) {
			summary.extensionDriftCount += 1
		}
		if (group.hasRansomNote) {
			summary.ransomNoteCount += 1
		}
		if (group.hasCanaryTripwire) {
			summary.canaryTripwireCount += 1
		}
		if (group.hasHighEntropy) {
			summary.entropyAnomalyCount += 1
		}
		if (group.hasBurstWave) {
			summary.burstWaveCount += 1
		}
		if (group.cleanSurvivorProtected) {
			summary.protectedCleanSurvivorsCount += 1
		}
	}

	summary.quarantinedBytesFormatted = formatBytes(summary.quarantinedBytes)
	summary.safeReclaimableBytesFormatted = formatBytes(summary.safeReclaimableBytes)
	summary.bulkDeletionQuarantineActive = quarantineBulkDelete
		&& (summary.quarantinedGroupsCount > 0 || summary.holdAllGroupsCount > 0)

	const filteredGroups = groups.filter(group => {
		if (filterMode === 'quarantined' && !group.quarantinedForDelete) {
			return false
		}
		if (filterMode === 'extension-drift' && !group.hasExtensionDrift) {
			return false
		}
		if (filterMode === 'ransom-note' && !group.hasRansomNote) {
			return false
		}
		if (filterMode === 'canary-tripwire' && !group.hasCanaryTripwire) {
			return false
		}
		if (filterMode === 'entropy-burst' && !group.hasHighEntropy && !group.hasBurstWave) {
			return false
		}
		if (filterMode === 'verified' && group.quarantineStatus !== 'verified-safe') {
			return false
		}
		if (filterMode === 'clean' && group.quarantineStatus !== 'clean') {
			return false
		}
		if (severityFilter !== 'all' && group.severity !== severityFilter) {
			return false
		}
		if (searchQuery) {
			const haystack = [
				group.title,
				group.hash,
				group.primaryCustodian,
				group.findings.join(' '),
				group.diagnoses.join(' '),
				...group.files.map(f => f.normalizedPath),
			].join(' ').toLowerCase()
			if (!haystack.includes(searchQuery)) {
				return false
			}
		}
		return true
	})

	filteredGroups.sort((a, b) => {
		if (sortMode === 'affected-bytes') {
			if (b.totalBytes !== a.totalBytes) {
				return b.totalBytes - a.totalBytes
			}
			return b.riskScore - a.riskScore
		}
		if (sortMode === 'burst-recency') {
			if (b.latestMtimeMs !== a.latestMtimeMs) {
				return b.latestMtimeMs - a.latestMtimeMs
			}
			return b.riskScore - a.riskScore
		}
		if (sortMode === 'copy-count') {
			if (b.copyCount !== a.copyCount) {
				return b.copyCount - a.copyCount
			}
			return b.riskScore - a.riskScore
		}
		if (b.riskScore !== a.riskScore) {
			return b.riskScore - a.riskScore
		}
		return b.totalBytes - a.totalBytes
	})

	return {
		schema: RANSOMWARE_CANARY_SCHEMA,
		policy: {
			presetId,
			incidentId,
			entropyThreshold,
			burstWindowMinutes,
			burstMinFiles,
			quarantineBulkDelete,
			customPattern,
		},
		summary,
		burstWindows: burstWindows.map(win => ({
			id: win.id,
			startIso: win.startIso,
			endIso: win.endIso,
			fileCount: win.fileCount,
			groupCount: win.groupCount,
			custodians: win.custodians,
		})),
		groups,
		filteredGroups,
		verificationLog: Object.values(verifiedRegistry),
	}
}

/**
 * Quote a POSIX shell argument safely using single quotes.
 *
 * @param {string} value - Raw string.
 * @return {string} Shell-safe single-quoted token.
 */
function quoteShellArg(value) {
	return `'${String(value || '').replace(/'/g, '\'"\'"\'')}'`
}

/**
 * Generate a non-destructive Nextcloud occ forensic containment and clean-survivor preservation script.
 *
 * @param {object} report - Output from evaluateRansomwareCanaryGuard.
 * @param {object} [options] - Script options.
 * @param {string} [options.occPrefix='sudo -u www-data php /var/www/nextcloud/occ'] - Nextcloud occ command prefix.
 * @param {string} [options.dataRoot='/var/www/nextcloud/data'] - Nextcloud data directory root.
 * @return {string} Shell script text.
 */
export function buildRansomwareContainmentScript(report, options = {}) {
	const incidentId = report && report.policy ? report.policy.incidentId : 'INC-2026-001'
	const occPrefix = sanitizeSingleLineText(
		options.occPrefix || 'sudo -u www-data php /var/www/nextcloud/occ',
		160,
	) || 'sudo -u www-data php /var/www/nextcloud/occ'
	const dataRoot = sanitizeSingleLineText(
		options.dataRoot || '/var/www/nextcloud/data',
		160,
	) || '/var/www/nextcloud/data'

	const quarantined = report && Array.isArray(report.groups)
		? report.groups.filter(g => g.quarantinedForDelete)
		: []

	const affectedUsers = Array.from(new Set(
		quarantined
			.flatMap(g => g.custodians)
			.filter(c => c && !c.startsWith('groupfolder:') && !c.startsWith('mount:') && c !== 'default-scope'),
	))
	const affectedGroupFolders = Array.from(new Set(
		quarantined
			.flatMap(g => g.custodians)
			.filter(c => c && c.startsWith('groupfolder:'))
			.map(c => c.replace(/^groupfolder:/, '')),
	))

	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		`# DuplicateFinder Ransomware Canary & Extension Drift Containment Script (${incidentId})`,
		`# Quarantined groups: ${quarantined.length} | Protected clean survivors: ${report && report.summary ? report.summary.protectedCleanSurvivorsCount : 0}`,
		'# Non-destructive forensic mode: preserves clean originals, snapshots checksums, and disables zero files automatically.',
		'',
		`INCIDENT_ID=${quoteShellArg(incidentId)}`,
		`QUARANTINE_DIR=${quoteShellArg(`/var/nc-forensic-quarantine/${incidentId}`)}`,
		'mkdir -p "$QUARANTINE_DIR"',
		'',
		'# 1. Optional containment pause during active encryption burst (uncomment to enforce):',
		`# ${occPrefix} maintenance:mode --on`,
	]

	if (affectedUsers.length > 0) {
		lines.push('', '# 2. Temporarily disable impacted sync accounts (review before uncommenting):')
		for (const user of affectedUsers) {
			lines.push(`# ${occPrefix} user:disable ${quoteShellArg(user)}`)
		}
	}

	if (affectedGroupFolders.length > 0) {
		lines.push('', '# 3. Audit impacted Nextcloud GroupFolders:')
		for (const gfId of affectedGroupFolders) {
			lines.push(`${occPrefix} groupfolders:list | grep -F ${quoteShellArg(gfId)} || true`)
		}
	}

	lines.push('', '# 4. Preserve protected clean survivors & record SHA-256 forensic custody manifest:')
	if (quarantined.length === 0) {
		lines.push('echo "No quarantined anomaly groups matched the current filter."')
	} else {
		for (const group of quarantined.slice(0, 40)) {
			lines.push(`# Group ${group.groupId} [${group.severity.toUpperCase()} risk=${group.riskScore}] findings=${group.findings.join(',')}`)
			if (group.survivorPath) {
				const srcPath = `${dataRoot.replace(/\/+$/, '')}${group.survivorPath}`
				lines.push(`if [ -f ${quoteShellArg(srcPath)} ]; then`)
				lines.push(`  sha256sum ${quoteShellArg(srcPath)} >> "$QUARANTINE_DIR/survivor-checksums.sha256"`)
				lines.push(`  cp -a --parents ${quoteShellArg(srcPath)} "$QUARANTINE_DIR/"`)
				lines.push('fi')
			}
			for (const file of group.files.filter(f => f.fileRole !== 'clean_candidate')) {
				lines.push(`#   Suspect copy (${file.fileRole}): ${file.normalizedPath}`)
			}
		}
	}

	lines.push('', '# 5. Re-index Nextcloud filecache after verifying clean survivors and versions:')
	if (affectedUsers.length > 0) {
		for (const user of affectedUsers) {
			lines.push(`${occPrefix} files:scan ${quoteShellArg(user)}`)
		}
	} else {
		lines.push(`${occPrefix} files:scan --all`)
	}
	lines.push(`# To inspect Nextcloud file versions for recovery: ${occPrefix} versions:cleanup --help`)
	lines.push('')

	return lines.join('\n')
}

/**
 * Export the full Ransomware Canary Guard report as formatted JSON.
 *
 * @param {object} report - Output from evaluateRansomwareCanaryGuard.
 * @param {string} [exportedAt] - Optional ISO timestamp override.
 * @return {string} Pretty JSON string.
 */
export function exportRansomwareGuardJson(report, exportedAt = new Date().toISOString()) {
	const safeReport = report && typeof report === 'object' ? report : {}
	const payload = {
		schema: RANSOMWARE_CANARY_SCHEMA,
		exportedAt,
		policy: safeReport.policy || {},
		summary: safeReport.summary || {},
		burstWindows: Array.isArray(safeReport.burstWindows) ? safeReport.burstWindows : [],
		verificationLog: Array.isArray(safeReport.verificationLog) ? safeReport.verificationLog : [],
		groups: Array.isArray(safeReport.groups)
			? safeReport.groups.map(group => ({
				groupKey: group.groupKey,
				groupId: group.groupId,
				hash: group.hash,
				title: group.title,
				riskScore: group.riskScore,
				severity: group.severity,
				quarantineStatus: group.quarantineStatus,
				bulkDeleteBlocked: group.bulkDeleteBlocked,
				cleanSurvivorProtected: group.cleanSurvivorProtected,
				survivorPath: group.survivorPath,
				findings: group.findings,
				diagnoses: group.diagnoses,
				totalBytes: group.totalBytes,
				files: group.files.map(f => ({
					path: f.normalizedPath,
					custodian: f.custodian,
					fileRole: f.fileRole,
					isProtectedSurvivor: f.isProtectedSurvivor,
					signals: f.signals,
					entropyBits: f.entropyBits,
					sizeBytes: f.sizeBytes,
					mtimeIso: f.mtimeIso,
				})),
			}))
			: [],
	}
	return JSON.stringify(payload, null, 2)
}

/**
 * Export a CWE-1236 formula-injection-safe CSV ledger of all inspected duplicate copies.
 *
 * @param {object} report - Output from evaluateRansomwareCanaryGuard.
 * @return {string} CSV document string.
 */
export function exportRansomwareGuardCsv(report) {
	const headers = [
		'incident_id',
		'group_id',
		'group_hash',
		'quarantine_status',
		'severity',
		'risk_score',
		'findings',
		'file_role',
		'clean_survivor',
		'bulk_delete_blocked',
		'extension_drift',
		'entropy_bits',
		'mtime_iso',
		'custodian',
		'path',
		'size_bytes',
	]
	const rows = [headers.map(escapeCsvCell).join(',')]
	const incidentId = report && report.policy ? report.policy.incidentId : 'INC-2026-001'
	const groups = report && Array.isArray(report.groups) ? report.groups : []

	for (const group of groups) {
		for (const file of group.files) {
			rows.push([
				incidentId,
				group.groupId,
				group.hash,
				group.quarantineStatus,
				group.severity,
				group.riskScore,
				group.findings.join('|'),
				file.fileRole,
				file.isProtectedSurvivor ? 'YES' : 'NO',
				group.bulkDeleteBlocked ? 'BLOCKED' : 'ALLOWED',
				file.hasDoubleExtensionDrift || file.isRansomwareExt ? 'YES' : 'NO',
				file.entropyBits !== null ? file.entropyBits.toFixed(2) : '',
				file.mtimeIso,
				file.custodian,
				file.normalizedPath,
				file.sizeBytes,
			].map(escapeCsvCell).join(','))
		}
	}

	return rows.join('\n')
}
