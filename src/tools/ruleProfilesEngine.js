/**
 * Pure Cleanup Rule Profiles, Regex Exclusion Presets, Weighted Tie-Breaker Engine,
 * and Persistent Batch Audit / Trashbin Restore Log helpers.
 */

import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { formatBytes } from './duplicateStats'

export const RULE_PROFILES_STORAGE_KEY = 'duplicatefinder:rule-profiles'
export const RULE_AUDIT_LOG_STORAGE_KEY = 'duplicatefinder:rule-audit-log'

export const RULE_PROFILE_SCHEMA = 'duplicatefinder.rule-profile.v1'
export const AUDIT_LOG_SCHEMA = 'duplicatefinder.rule-audit-log.v1'

export const MAX_CUSTOM_PROFILES = 25
export const MAX_AUDIT_LOG_ENTRIES = 50
export const MAX_REGEX_PATTERN_LENGTH = 240

const ALLOWED_REGEX_FLAGS = new Set(['i', 'm', 'u'])
const ALLOWED_AUDIT_STATUSES = new Set(['completed', 'partial', 'dry-run', 'restored'])

export const TIE_BREAKER_CRITERIA = Object.freeze([
	{
		id: 'origin_protected',
		label: 'Protected Origin Folder first',
		description: 'Always keep copies located in configured Origin Folders.',
		weight: 10000,
	},
	{
		id: 'preferred_regex',
		label: 'Preferred Path Regex match',
		description: 'Prefer keeping copies matching the profile preferred path regex.',
		weight: 2500,
	},
	{
		id: 'demoted_regex',
		label: 'Avoid Target Cleanup Regex',
		description: 'Penalize copies matching the target cleanup path/name regex.',
		weight: 1800,
	},
	{
		id: 'filename_cleanest',
		label: 'Cleanest filename (no copy/(1)/conflict)',
		description: 'Prefer clean canonical filenames without copy or numbered suffixes.',
		weight: 600,
	},
	{
		id: 'path_depth_shortest',
		label: 'Shallowest folder path',
		description: 'Prefer files closer to the root folder hierarchy.',
		weight: 220,
	},
	{
		id: 'path_depth_deepest',
		label: 'Deepest organized folder path',
		description: 'Prefer files nested in more specific subfolders.',
		weight: 220,
	},
	{
		id: 'mtime_oldest',
		label: 'Oldest modification timestamp',
		description: 'Prefer the earliest recorded version of the file.',
		weight: 120,
	},
	{
		id: 'mtime_newest',
		label: 'Newest modification timestamp',
		description: 'Prefer the most recently modified version of the file.',
		weight: 120,
	},
	{
		id: 'size_largest',
		label: 'Largest file size',
		description: 'Prefer larger files when comparing near-duplicates.',
		weight: 90,
	},
	{
		id: 'lexical_asc',
		label: 'Alphabetical path tie-breaker',
		description: 'Deterministic lexical order fallback.',
		weight: 10,
	},
])

const VALID_CRITERION_IDS = new Set(TIE_BREAKER_CRITERIA.map(item => item.id))

export const REGEX_EXCLUSION_PRESETS = Object.freeze([
	{
		id: 'dev_artifacts',
		label: 'Dev & build caches (node_modules, .git, dist)',
		pattern: '(^|\\/)(node_modules|\\.git|\\.svn|dist|build|\\.cache|__pycache__|target)(\\/|$)',
		flags: 'i',
		category: 'development',
	},
	{
		id: 'os_junk',
		label: 'OS & Office temp metadata (.DS_Store, Thumbs.db, ~$*)',
		pattern: '(^|\\/)(\\.DS_Store|Thumbs\\.db|desktop\\.ini|\\._[^/]+|~\\$[^/]+)$',
		flags: 'i',
		category: 'system',
	},
	{
		id: 'raw_sidecars',
		label: 'Camera RAW & sidecars (CR2, NEF, ARW, DNG, XMP, AAE)',
		pattern: '\\.(cr2|cr3|nef|arw|dng|raf|rw2|orf|xmp|aae)$',
		flags: 'i',
		category: 'media',
	},
	{
		id: 'archive_backups',
		label: 'Backup & Vault folders (/Backup, /Archive, /Vault)',
		pattern: '(^|\\/)(Backups?|Archives?|Vault|ColdStorage)(\\/|$)',
		flags: 'i',
		category: 'safety',
	},
	{
		id: 'sync_conflicts',
		label: 'Sync conflict copies (keep for manual review)',
		pattern: '(\\(conflicted copy[^)]*\\)|_conflict\\b|\\.sync-conflict-)',
		flags: 'i',
		category: 'safety',
	},
])

export const BUILTIN_RULE_PROFILES = Object.freeze([
	{
		id: 'safe-photos-originals',
		name: 'Safe Photos & Originals',
		description: 'Keep master photos in /Photos or /Originals, target /Downloads copies, and shield RAW/sidecar assets.',
		builtin: true,
		scope: 'filtered',
		preferredRegex: '(^|\\/)(Photos|Originals|Camera|Albums)(\\/|$)',
		preferredFlags: 'i',
		demotedRegex: '(^|\\/)(Downloads|Temp|Export|WhatsApp)(\\/|$)',
		demotedFlags: 'i',
		tieBreakers: [
			'origin_protected',
			'preferred_regex',
			'demoted_regex',
			'filename_cleanest',
			'size_largest',
			'mtime_oldest',
			'path_depth_shortest',
		],
		activeExclusionPresets: ['raw_sidecars', 'os_junk'],
		customExclusions: [],
		neverTouchOrigins: true,
		skipSharedRisk: true,
		maxFilesPerBatch: null,
	},
	{
		id: 'clean-downloads-copies',
		name: 'Clean Downloads & Browser Copies',
		description: 'Prioritize canonical copies outside /Downloads and clean numbered browser duplicates like file (1).pdf.',
		builtin: true,
		scope: 'filtered',
		preferredRegex: '',
		preferredFlags: 'i',
		demotedRegex: '(^|\\/)(Downloads|Inbox|Temp)(\\/|$)|\\s*\\(\\d+\\)\\.[^/.]+$',
		demotedFlags: 'i',
		tieBreakers: [
			'origin_protected',
			'demoted_regex',
			'filename_cleanest',
			'path_depth_shortest',
			'mtime_oldest',
		],
		activeExclusionPresets: ['os_junk'],
		customExclusions: [],
		neverTouchOrigins: true,
		skipSharedRisk: false,
		maxFilesPerBatch: null,
	},
	{
		id: 'project-workspace-hygiene',
		name: 'Project & Code Workspace',
		description: 'Shield node_modules/.git/build caches while consolidating duplicate docs and assets into /src or /docs.',
		builtin: true,
		scope: 'filtered',
		preferredRegex: '(^|\\/)(src|docs|packages|assets)(\\/|$)',
		preferredFlags: 'i',
		demotedRegex: '(^|\\/)(tmp|scratch|old|copy)(\\/|$)',
		demotedFlags: 'i',
		tieBreakers: [
			'origin_protected',
			'preferred_regex',
			'demoted_regex',
			'path_depth_shortest',
			'mtime_newest',
		],
		activeExclusionPresets: ['dev_artifacts', 'os_junk'],
		customExclusions: [],
		neverTouchOrigins: true,
		skipSharedRisk: false,
		maxFilesPerBatch: null,
	},
	{
		id: 'media-library-consolidator',
		name: 'Media Library Consolidator',
		description: 'Keep media inside /Music, /Videos, or /Media with largest bitrate/size and shield Vault backups.',
		builtin: true,
		scope: 'filtered',
		preferredRegex: '(^|\\/)(Music|Videos|Media|Library)(\\/|$)',
		preferredFlags: 'i',
		demotedRegex: '(^|\\/)(Downloads|Unsorted|Incoming)(\\/|$)',
		demotedFlags: 'i',
		tieBreakers: [
			'origin_protected',
			'preferred_regex',
			'demoted_regex',
			'size_largest',
			'filename_cleanest',
			'mtime_newest',
		],
		activeExclusionPresets: ['archive_backups', 'os_junk'],
		customExclusions: [],
		neverTouchOrigins: true,
		skipSharedRisk: true,
		maxFilesPerBatch: null,
	},
	{
		id: 'conservative-dry-run',
		name: 'Conservative Safe Audit',
		description: 'Maximum safety guardrails: shields all OS junk, RAWs, backups, sync conflicts, origins, and shared files.',
		builtin: true,
		scope: 'all',
		preferredRegex: '',
		preferredFlags: 'i',
		demotedRegex: '',
		demotedFlags: 'i',
		tieBreakers: [
			'origin_protected',
			'filename_cleanest',
			'mtime_oldest',
			'path_depth_shortest',
		],
		activeExclusionPresets: ['dev_artifacts', 'os_junk', 'raw_sidecars', 'archive_backups', 'sync_conflicts'],
		customExclusions: [],
		neverTouchOrigins: true,
		skipSharedRisk: true,
		maxFilesPerBatch: 50,
	},
])

const COPY_SUFFIX_REGEX = /(?:^|[\s_-])(?:copy|copie|backup|bak|old|temp|tmp)(?:[\s_.-]\d*)?(?:\.[^/.]+)?$|\s*\(\d+\)(?:\.[^/.]+)?$|conflicted copy/i

/**
 * Resolve a Storage-like object safely without throwing in restricted contexts.
 *
 * @param {Storage|object|null|undefined} storage Injected storage or undefined for window.localStorage.
 * @return {object|null} Storage instance or null when unavailable.
 */
function resolveStorage(storage) {
	if (storage === null) {
		return null
	}
	if (storage !== undefined) {
		return typeof storage === 'object' ? storage : null
	}
	try {
		if (typeof window !== 'undefined' && window.localStorage) {
			return window.localStorage
		}
	} catch (error) {
		return null
	}
	return null
}

/**
 * Build a user-scoped storage key when Nextcloud user context is present.
 *
 * @param {string} baseKey Base key prefix.
 * @param {object} [options] Optional override.
 * @return {string} Scoped storage key.
 */
export function getScopedStorageKey(baseKey, options = {}) {
	if (options && typeof options.storageKey === 'string' && options.storageKey.trim().length > 0) {
		return options.storageKey.trim()
	}
	let uid = ''
	try {
		if (typeof window !== 'undefined' && window.OC) {
			if (typeof window.OC.getCurrentUser === 'function') {
				const user = window.OC.getCurrentUser()
				if (user && user.uid) {
					uid = String(user.uid)
				}
			} else if (window.OC.currentUser) {
				uid = String(window.OC.currentUser)
			}
		}
	} catch (error) {
		uid = ''
	}
	return uid ? `${baseKey}:${uid}` : baseKey
}

/**
 * Strip ASCII control characters and collapse runs of whitespace into a safe plain label.
 *
 * @param {*} raw Raw string input.
 * @param {number} [maxLength=140] Maximum output length.
 * @return {string} Sanitized plain text.
 */
function sanitizePlainText(raw, maxLength = 140) {
	if (typeof raw !== 'string') {
		return ''
	}
	let out = ''
	for (let i = 0; i < raw.length; i++) {
		const code = raw.charCodeAt(i)
		out += (code < 32 || code === 127) ? ' ' : raw[i]
	}
	const trimmed = out.replace(/\s+/g, ' ').trim()
	if (trimmed.length <= maxLength) {
		return trimmed
	}
	return trimmed.slice(0, maxLength)
}

/**
 * Sanitize regex flags string keeping only safe non-stateful flags (i, m, u).
 *
 * @param {*} rawFlags Candidate flags.
 * @return {string} Deduplicated safe flags.
 */
export function sanitizeRegexFlags(rawFlags) {
	if (typeof rawFlags !== 'string') {
		return 'i'
	}
	const seen = []
	for (const ch of rawFlags) {
		if (ALLOWED_REGEX_FLAGS.has(ch) && !seen.includes(ch)) {
			seen.push(ch)
		}
	}
	return seen.join('')
}

/**
 * Detect common catastrophic backtracking / nested quantifier patterns (ReDoS guard).
 *
 * @param {string} pattern Regex source pattern.
 * @return {boolean} True when potentially unsafe nested quantifiers are detected.
 */
function hasNestedQuantifierRisk(pattern) {
	if (/\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)[+*?{]/.test(pattern)) {
		return true
	}
	if (/([+*]|\{\d+,\d*\})\s*\1/.test(pattern)) {
		return true
	}
	return false
}

/**
 * Safely compile a user-supplied or preset regex pattern without throwing.
 *
 * @param {string|null|undefined} pattern Regex source.
 * @param {string} [flags='i'] Allowed flags (i, m, u).
 * @return {{ regex: RegExp|null, error: string, pattern: string, flags: string }} Compilation result.
 */
export function compileSafeRegex(pattern, flags = 'i') {
	const rawPattern = typeof pattern === 'string' ? pattern.trim() : ''
	const safeFlags = sanitizeRegexFlags(flags)

	if (!rawPattern) {
		return { regex: null, error: '', pattern: '', flags: safeFlags }
	}

	if (rawPattern.length > MAX_REGEX_PATTERN_LENGTH) {
		return {
			regex: null,
			error: `Regex exceeds maximum length (${MAX_REGEX_PATTERN_LENGTH} characters).`,
			pattern: rawPattern,
			flags: safeFlags,
		}
	}

	if (hasNestedQuantifierRisk(rawPattern)) {
		return {
			regex: null,
			error: 'Regex contains nested quantifiers that may cause slow backtracking.',
			pattern: rawPattern,
			flags: safeFlags,
		}
	}

	try {
		const regex = new RegExp(rawPattern, safeFlags)
		return { regex, error: '', pattern: rawPattern, flags: safeFlags }
	} catch (error) {
		return {
			regex: null,
			error: error && error.message ? error.message : 'Invalid regular expression.',
			pattern: rawPattern,
			flags: safeFlags,
		}
	}
}

/**
 * Split text into safe highlighted segments for rendering with <mark> (plain text nodes only).
 *
 * @param {string|null|undefined} text Input path or filename.
 * @param {RegExp|null|undefined} regex Compiled regex (non-global or global).
 * @return {Array<{ text: string, matched: boolean }>} Plain-text segments.
 */
export function buildRegexMatchSegments(text, regex) {
	const source = typeof text === 'string' ? text : ''
	if (!source) {
		return []
	}
	if (!(regex instanceof RegExp)) {
		return [{ text: source, matched: false }]
	}

	const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`
	let scanner
	try {
		scanner = new RegExp(regex.source, flags)
	} catch (error) {
		return [{ text: source, matched: false }]
	}

	const segments = []
	let cursor = 0
	let iterations = 0
	const maxIterations = 64

	while (iterations < maxIterations) {
		iterations += 1
		const match = scanner.exec(source)
		if (!match) {
			break
		}
		const matchText = match[0]
		const start = match.index
		if (matchText.length === 0) {
			if (scanner.lastIndex >= source.length) {
				break
			}
			scanner.lastIndex += 1
			continue
		}
		if (start > cursor) {
			segments.push({ text: source.slice(cursor, start), matched: false })
		}
		segments.push({ text: matchText, matched: true })
		cursor = start + matchText.length
	}

	if (cursor < source.length) {
		segments.push({ text: source.slice(cursor), matched: false })
	}

	return segments.length > 0 ? segments : [{ text: source, matched: false }]
}

/**
 * Parse positive integer batch limit from string or number without clamping mid-keystroke.
 *
 * @param {*} rawInput Input value.
 * @return {{ valid: boolean, limit: number|null, error: string }} Validation result.
 */
export function parseBatchCapInput(rawInput) {
	if (rawInput === null || rawInput === undefined || rawInput === '') {
		return { valid: true, limit: null, error: '' }
	}
	if (typeof rawInput === 'number') {
		if (!Number.isFinite(rawInput) || !Number.isInteger(rawInput) || rawInput < 1 || rawInput > 10000) {
			return { valid: false, limit: null, error: 'Batch limit must be a whole number between 1 and 10000.' }
		}
		return { valid: true, limit: rawInput, error: '' }
	}
	if (typeof rawInput === 'string') {
		const trimmed = rawInput.trim()
		if (!trimmed) {
			return { valid: true, limit: null, error: '' }
		}
		if (!/^\d+$/.test(trimmed)) {
			return { valid: false, limit: null, error: 'Batch limit must be a whole number between 1 and 10000.' }
		}
		const parsed = Number(trimmed)
		if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 10000) {
			return { valid: false, limit: null, error: 'Batch limit must be a whole number between 1 and 10000.' }
		}
		return { valid: true, limit: parsed, error: '' }
	}
	return { valid: false, limit: null, error: 'Batch limit must be a whole number between 1 and 10000.' }
}

/**
 * Sanitize and normalize a single custom regex exclusion rule.
 *
 * @param {object} raw Raw rule candidate.
 * @param {number} [index=0] Fallback index.
 * @return {object|null} Sanitized rule or null when invalid.
 */
export function sanitizeCustomExclusionRule(raw, index = 0) {
	if (!raw || typeof raw !== 'object') {
		return null
	}
	const pattern = typeof raw.pattern === 'string' ? raw.pattern.trim().slice(0, MAX_REGEX_PATTERN_LENGTH) : ''
	if (!pattern) {
		return null
	}
	const id = sanitizePlainText(typeof raw.id === 'string' ? raw.id : `custom-${index + 1}`, 60) || `custom-${index + 1}`
	const label = sanitizePlainText(typeof raw.label === 'string' ? raw.label : pattern, 80) || pattern
	const flags = sanitizeRegexFlags(raw.flags)
	return {
		id,
		label,
		pattern,
		flags,
		enabled: raw.enabled !== false,
	}
}

/**
 * Sanitize and normalize a cleanup rule profile object.
 *
 * @param {object} raw Raw profile candidate.
 * @return {object} Sanitized rule profile.
 */
export function sanitizeRuleProfile(raw) {
	const fallback = BUILTIN_RULE_PROFILES[0]
	const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}

	const rawId = sanitizePlainText(typeof source.id === 'string' ? source.id : '', 80)
	const id = rawId || `profile-${Date.now()}`
	const name = sanitizePlainText(typeof source.name === 'string' ? source.name : '', 80) || 'Custom Cleanup Profile'
	const description = sanitizePlainText(typeof source.description === 'string' ? source.description : '', 220)
	const scope = source.scope === 'all' ? 'all' : 'filtered'

	const tieBreakers = Array.isArray(source.tieBreakers)
		? Array.from(new Set(source.tieBreakers.filter(item => VALID_CRITERION_IDS.has(item))))
		: [...fallback.tieBreakers]
	if (tieBreakers.length === 0) {
		tieBreakers.push('origin_protected', 'filename_cleanest', 'mtime_oldest', 'path_depth_shortest')
	}

	const validPresetIds = new Set(REGEX_EXCLUSION_PRESETS.map(p => p.id))
	const activeExclusionPresets = Array.isArray(source.activeExclusionPresets)
		? Array.from(new Set(source.activeExclusionPresets.filter(presetId => validPresetIds.has(presetId))))
		: []

	const customExclusions = Array.isArray(source.customExclusions)
		? source.customExclusions
			.map((rule, idx) => sanitizeCustomExclusionRule(rule, idx))
			.filter(Boolean)
			.slice(0, 20)
		: []

	const batchParsed = parseBatchCapInput(source.maxFilesPerBatch)

	return {
		id,
		name,
		description,
		builtin: Boolean(source.builtin),
		scope,
		preferredRegex: typeof source.preferredRegex === 'string'
			? source.preferredRegex.slice(0, MAX_REGEX_PATTERN_LENGTH)
			: '',
		preferredFlags: sanitizeRegexFlags(source.preferredFlags),
		demotedRegex: typeof source.demotedRegex === 'string'
			? source.demotedRegex.slice(0, MAX_REGEX_PATTERN_LENGTH)
			: '',
		demotedFlags: sanitizeRegexFlags(source.demotedFlags),
		tieBreakers,
		activeExclusionPresets,
		customExclusions,
		neverTouchOrigins: source.neverTouchOrigins !== false,
		skipSharedRisk: Boolean(source.skipSharedRisk),
		maxFilesPerBatch: batchParsed.valid ? batchParsed.limit : null,
	}
}

/**
 * Load saved custom rule profiles from storage safely.
 *
 * @param {Storage|object|null|undefined} [storage] Storage override.
 * @return {Array<object>} Array of sanitized custom profiles.
 */
export function loadCustomRuleProfiles(storage) {
	try {
		const target = resolveStorage(storage)
		if (!target || typeof target.getItem !== 'function') {
			return []
		}
		const raw = target.getItem(getScopedStorageKey(RULE_PROFILES_STORAGE_KEY))
		if (!raw) {
			return []
		}
		const parsed = JSON.parse(raw)
		if (!Array.isArray(parsed)) {
			return []
		}
		return parsed
			.map(item => sanitizeRuleProfile({ ...item, builtin: false }))
			.slice(0, MAX_CUSTOM_PROFILES)
	} catch (error) {
		return []
	}
}

/**
 * Persist custom rule profiles to storage safely.
 *
 * @param {Array<object>} profiles Custom profiles to store.
 * @param {Storage|object|null|undefined} [storage] Storage override.
 * @return {Array<object>} Stored sanitized profiles.
 */
export function saveCustomRuleProfiles(profiles, storage) {
	const sanitized = (Array.isArray(profiles) ? profiles : [])
		.filter(item => item && !item.builtin)
		.map(item => sanitizeRuleProfile({ ...item, builtin: false }))
		.slice(0, MAX_CUSTOM_PROFILES)
	try {
		const target = resolveStorage(storage)
		if (target && typeof target.setItem === 'function') {
			target.setItem(getScopedStorageKey(RULE_PROFILES_STORAGE_KEY), JSON.stringify(sanitized))
		}
	} catch (error) {
		// Ignore quota or restricted storage errors
	}
	return sanitized
}

/**
 * Export a rule profile as a versioned JSON payload string.
 *
 * @param {object} profile Rule profile.
 * @return {string} Formatted JSON string.
 */
export function exportRuleProfileJson(profile) {
	const sanitized = sanitizeRuleProfile(profile)
	return JSON.stringify({
		schema: RULE_PROFILE_SCHEMA,
		exportedAt: new Date().toISOString(),
		profile: {
			...sanitized,
			builtin: false,
		},
	}, null, 2)
}

/**
 * Parse and validate an imported JSON rule profile payload.
 *
 * @param {string} jsonText Raw JSON string.
 * @return {{ ok: boolean, profile: object|null, error: string }} Import result.
 */
export function parseImportedRuleProfile(jsonText) {
	if (typeof jsonText !== 'string' || !jsonText.trim()) {
		return { ok: false, profile: null, error: 'Profile JSON payload is empty.' }
	}
	try {
		const parsed = JSON.parse(jsonText)
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			return { ok: false, profile: null, error: 'Invalid profile JSON structure.' }
		}
		const candidate = parsed.profile && typeof parsed.profile === 'object' ? parsed.profile : parsed
		if (typeof candidate.name !== 'string' || !candidate.name.trim()) {
			return { ok: false, profile: null, error: 'Imported profile must include a non-empty name.' }
		}
		const profile = sanitizeRuleProfile({
			...candidate,
			id: `imported-${Date.now()}`,
			builtin: false,
		})
		return { ok: true, profile, error: '' }
	} catch (error) {
		return { ok: false, profile: null, error: 'Could not parse profile JSON.' }
	}
}

/**
 * Collect and compile all active regex exclusion rules (presets + custom) for a profile.
 *
 * @param {object} profile Rule profile.
 * @return {{ compiledRules: Array<object>, invalidRules: Array<object> }} Compiled and invalid exclusion rules.
 */
export function compileProfileExclusions(profile) {
	const activePresetSet = new Set(Array.isArray(profile && profile.activeExclusionPresets) ? profile.activeExclusionPresets : [])
	const compiledRules = []
	const invalidRules = []

	for (const preset of REGEX_EXCLUSION_PRESETS) {
		if (!activePresetSet.has(preset.id)) {
			continue
		}
		const compiled = compileSafeRegex(preset.pattern, preset.flags)
		if (compiled.regex) {
			compiledRules.push({
				id: preset.id,
				label: preset.label,
				pattern: preset.pattern,
				flags: preset.flags,
				source: 'preset',
				regex: compiled.regex,
			})
		}
	}

	const customRules = Array.isArray(profile && profile.customExclusions) ? profile.customExclusions : []
	for (const rule of customRules) {
		if (!rule || rule.enabled === false) {
			continue
		}
		const compiled = compileSafeRegex(rule.pattern, rule.flags)
		if (compiled.regex) {
			compiledRules.push({
				id: rule.id,
				label: rule.label || rule.pattern,
				pattern: rule.pattern,
				flags: compiled.flags,
				source: 'custom',
				regex: compiled.regex,
			})
		} else if (compiled.error) {
			invalidRules.push({
				id: rule.id,
				label: rule.label || rule.pattern,
				pattern: rule.pattern,
				error: compiled.error,
			})
		}
	}

	return { compiledRules, invalidRules }
}

/**
 * Evaluate all compiled regex exclusions across duplicate groups for live preview.
 *
 * @param {Array<object>} duplicates Duplicate groups.
 * @param {object} profile Active rule profile.
 * @return {object} Live exclusion match summary and matched file items.
 */
export function evaluateRegexExclusions(duplicates, profile) {
	const { compiledRules, invalidRules } = compileProfileExclusions(profile)
	const perRuleCounts = {}
	for (const rule of compiledRules) {
		perRuleCounts[rule.id] = 0
	}

	const matchedFiles = []
	let shieldedBytes = 0
	const seenKeys = new Set()

	for (const group of Array.isArray(duplicates) ? duplicates : []) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (const file of group.files) {
			if (!file || typeof file.path !== 'string') {
				continue
			}
			const displayPath = normalizePathForDiff(file.path)
			const matchedRule = compiledRules.find(rule => rule.regex.test(displayPath) || rule.regex.test(file.path))
			if (!matchedRule) {
				continue
			}
			perRuleCounts[matchedRule.id] = (perRuleCounts[matchedRule.id] || 0) + 1
			const key = getFileSelectionKey(file)
			if (!seenKeys.has(key)) {
				seenKeys.add(key)
				const size = Number(file.size) > 0 ? Number(file.size) : 0
				shieldedBytes += size
				matchedFiles.push({
					key,
					groupId: group.id,
					path: file.path,
					displayPath,
					size,
					sizeFormatted: formatBytes(size),
					ruleId: matchedRule.id,
					ruleLabel: matchedRule.label,
					segments: buildRegexMatchSegments(displayPath, matchedRule.regex),
				})
			}
		}
	}

	return {
		compiledRules,
		invalidRules,
		perRuleCounts,
		matchedFiles,
		matchedCount: matchedFiles.length,
		shieldedBytes,
		shieldedFormatted: formatBytes(shieldedBytes),
	}
}

/**
 * Extract normalized timestamp in milliseconds from a file entry.
 *
 * @param {object} file Duplicate file entry.
 * @return {number|null} Epoch ms or null.
 */
function extractFileTimestamp(file) {
	if (!file || typeof file !== 'object') {
		return null
	}
	for (const field of ['mtime', 'modified', 'updatedAt', 'lastModified']) {
		const raw = file[field]
		if (raw === null || raw === undefined || raw === '') {
			continue
		}
		if (typeof raw === 'number' && Number.isFinite(raw)) {
			return raw < 1e12 ? raw * 1000 : raw
		}
		if (typeof raw === 'string') {
			const trimmed = raw.trim()
			if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
				const num = Number(trimmed)
				if (Number.isFinite(num)) {
					return num < 1e12 ? num * 1000 : num
				}
			}
			const parsed = Date.parse(trimmed)
			if (Number.isFinite(parsed)) {
				return parsed
			}
		}
	}
	return null
}

/**
 * Determine if a file is shared externally or via Nextcloud shares.
 *
 * @param {object} file File object.
 * @return {boolean} True if shared flag or share metadata is present.
 */
function isSharedFile(file) {
	if (!file || typeof file !== 'object') {
		return false
	}
	return Boolean(
		file.isShared
		|| file.shared
		|| (Array.isArray(file.shares) && file.shares.length > 0)
		|| Number(file.shareCount) > 0
	)
}

/**
 * Compute path segment depth for a display path.
 *
 * @param {string} displayPath Normalized display path.
 * @return {number} Segment count.
 */
function getPathDepth(displayPath) {
	return displayPath.split('/').filter(Boolean).length
}

/**
 * Extract file basename without directories.
 *
 * @param {string} path File path.
 * @return {string} Basename.
 */
function getBasename(path) {
	if (typeof path !== 'string') {
		return ''
	}
	const normalized = path.replace(/\\/g, '/')
	const idx = normalized.lastIndexOf('/')
	return idx >= 0 ? normalized.slice(idx + 1) : normalized
}

/**
 * Compute a deterministic survivor ranking score and human-readable reason tags for a file.
 *
 * @param {object} file Duplicate file object.
 * @param {Array<object>} groupFiles All files in the duplicate group.
 * @param {object} context Evaluation context (profile, compiled regexes).
 * @return {{ score: number, reasons: string[], displayPath: string, depth: number, mtimeMs: number|null, size: number }} Score breakdown.
 */
export function scoreFileForSurvivor(file, groupFiles, context) {
	const displayPath = normalizePathForDiff(file && file.path ? file.path : '')
	const basename = getBasename(displayPath)
	const depth = getPathDepth(displayPath)
	const mtimeMs = extractFileTimestamp(file)
	const size = Number(file && file.size) > 0 ? Number(file.size) : 0

	const depths = groupFiles.map(item => getPathDepth(normalizePathForDiff(item && item.path ? item.path : '')))
	const minDepth = depths.length > 0 ? Math.min(...depths) : depth
	const maxDepth = depths.length > 0 ? Math.max(...depths) : depth

	const timestamps = groupFiles.map(extractFileTimestamp).filter(val => val !== null)
	const minMtime = timestamps.length > 0 ? Math.min(...timestamps) : null
	const maxMtime = timestamps.length > 0 ? Math.max(...timestamps) : null

	const sizes = groupFiles.map(item => (Number(item && item.size) > 0 ? Number(item.size) : 0))
	const maxSize = sizes.length > 0 ? Math.max(...sizes) : size

	let score = 0
	const reasons = []
	const tieBreakers = Array.isArray(context.profile.tieBreakers) ? context.profile.tieBreakers : []
	const totalCriteria = tieBreakers.length

	tieBreakers.forEach((criterionId, index) => {
		const orderMultiplier = Math.max(1, totalCriteria - index)
		if (criterionId === 'origin_protected' && file && file.isInOriginFolder) {
			score += 10000 * orderMultiplier
			reasons.push('Origin protected')
		} else if (criterionId === 'preferred_regex' && context.preferredRegex) {
			if (context.preferredRegex.test(displayPath) || context.preferredRegex.test(file.path || '')) {
				score += 2000 * orderMultiplier
				reasons.push('Matches preferred path')
			}
		} else if (criterionId === 'demoted_regex' && context.demotedRegex) {
			if (context.demotedRegex.test(displayPath) || context.demotedRegex.test(file.path || '')) {
				score -= 1800 * orderMultiplier
				reasons.push('Targets cleanup path')
			}
		} else if (criterionId === 'filename_cleanest') {
			if (COPY_SUFFIX_REGEX.test(basename)) {
				score -= 400 * orderMultiplier
				reasons.push('Copy/numbered filename')
			} else {
				score += 250 * orderMultiplier
				reasons.push('Clean filename')
			}
		} else if (criterionId === 'path_depth_shortest' && maxDepth > minDepth) {
			const bonus = Math.round(((maxDepth - depth) / (maxDepth - minDepth)) * 180 * orderMultiplier)
			score += bonus
			if (depth === minDepth) {
				reasons.push('Shallowest path')
			}
		} else if (criterionId === 'path_depth_deepest' && maxDepth > minDepth) {
			const bonus = Math.round(((depth - minDepth) / (maxDepth - minDepth)) * 180 * orderMultiplier)
			score += bonus
			if (depth === maxDepth) {
				reasons.push('Deepest path')
			}
		} else if (criterionId === 'mtime_oldest' && mtimeMs !== null && minMtime !== null && maxMtime !== null && maxMtime > minMtime) {
			const bonus = Math.round(((maxMtime - mtimeMs) / (maxMtime - minMtime)) * 150 * orderMultiplier)
			score += bonus
			if (mtimeMs === minMtime) {
				reasons.push('Oldest timestamp')
			}
		} else if (criterionId === 'mtime_newest' && mtimeMs !== null && minMtime !== null && maxMtime !== null && maxMtime > minMtime) {
			const bonus = Math.round(((mtimeMs - minMtime) / (maxMtime - minMtime)) * 150 * orderMultiplier)
			score += bonus
			if (mtimeMs === maxMtime) {
				reasons.push('Newest timestamp')
			}
		} else if (criterionId === 'size_largest' && maxSize > 0) {
			const ratio = size / maxSize
			score += Math.round(ratio * 120 * orderMultiplier)
			if (size === maxSize) {
				reasons.push('Largest size')
			}
		}
	})

	return {
		score,
		reasons,
		displayPath,
		depth,
		mtimeMs,
		size,
	}
}

/**
 * Evaluate a cleanup rule profile deterministically across duplicate groups (dry-run simulation).
 *
 * @param {Array<object>} duplicates Duplicate groups to evaluate.
 * @param {object} profile Active rule profile.
 * @param {object} [options] Overrides & limits.
 * @param {object} [options.promotedByGroup] Map of groupId -> fileSelectionKey manually promoted as survivor.
 * @param {Array<string>|Set<string>} [options.excludedFileKeys] File keys manually shielded in this batch.
 * @param {number|string|null} [options.maxBatchOverride] Optional live maxFilesPerBatch input value.
 * @return {object} Complete deterministic plan with summary, group decisions, and markedFiles.
 */
export function evaluateRuleProfilePlan(duplicates, profile, options = {}) {
	const safeProfile = sanitizeRuleProfile(profile)
	const promotedByGroup = options.promotedByGroup && typeof options.promotedByGroup === 'object'
		? options.promotedByGroup
		: {}
	const manualExcluded = options.excludedFileKeys instanceof Set
		? options.excludedFileKeys
		: new Set(Array.isArray(options.excludedFileKeys) ? options.excludedFileKeys : [])

	const preferredCompiled = compileSafeRegex(safeProfile.preferredRegex, safeProfile.preferredFlags)
	const demotedCompiled = compileSafeRegex(safeProfile.demotedRegex, safeProfile.demotedFlags)
	const { compiledRules: exclusionRules, invalidRules: exclusionInvalid } = compileProfileExclusions(safeProfile)

	const invalidRules = [...exclusionInvalid]
	if (preferredCompiled.error) {
		invalidRules.push({
			id: 'preferred-regex',
			label: 'Preferred path regex',
			pattern: safeProfile.preferredRegex,
			error: preferredCompiled.error,
		})
	}
	if (demotedCompiled.error) {
		invalidRules.push({
			id: 'demoted-regex',
			label: 'Target cleanup regex',
			pattern: safeProfile.demotedRegex,
			error: demotedCompiled.error,
		})
	}

	const capCheck = options.maxBatchOverride !== undefined
		? parseBatchCapInput(options.maxBatchOverride)
		: { valid: true, limit: safeProfile.maxFilesPerBatch, error: '' }
	const batchCap = capCheck.valid ? capCheck.limit : null

	const context = {
		profile: safeProfile,
		preferredRegex: preferredCompiled.regex,
		demotedRegex: demotedCompiled.regex,
	}

	const groupDecisions = []
	const allCandidates = []
	let shieldedCount = 0
	let shieldedBytes = 0
	let skippedGroups = 0

	for (const group of Array.isArray(duplicates) ? duplicates : []) {
		if (!group || !Array.isArray(group.files) || group.files.length <= 1) {
			continue
		}

		const files = group.files.filter(Boolean)
		if (files.length <= 1) {
			continue
		}

		const scoredEntries = files.map(file => {
			const key = getFileSelectionKey(file)
			const displayPath = normalizePathForDiff(file.path || '')
			const scoreInfo = scoreFileForSurvivor(file, files, context)

			let shieldReason = ''
			if (manualExcluded.has(key)) {
				shieldReason = 'Manually shielded'
			} else if (safeProfile.neverTouchOrigins && file.isInOriginFolder) {
				shieldReason = 'Protected origin folder'
			} else if (safeProfile.skipSharedRisk && isSharedFile(file)) {
				shieldReason = 'Active Nextcloud share'
			} else {
				const matchedExclusion = exclusionRules.find(
					rule => rule.regex.test(displayPath) || rule.regex.test(file.path || '')
				)
				if (matchedExclusion) {
					shieldReason = `Excluded by regex: ${matchedExclusion.label}`
				}
			}

			return {
				file,
				key,
				displayPath,
				size: scoreInfo.size,
				sizeFormatted: formatBytes(scoreInfo.size),
				mtimeFormatted: formatFileModifiedTime(file),
				score: scoreInfo.score,
				reasons: scoreInfo.reasons,
				shieldReason,
				isOrigin: Boolean(file.isInOriginFolder),
				isShared: isSharedFile(file),
			}
		})

		const promotedKey = promotedByGroup[group.id]
		let survivor = promotedKey
			? scoredEntries.find(entry => entry.key === promotedKey) || null
			: null

		if (!survivor) {
			const sorted = [...scoredEntries].sort((a, b) => {
				if (b.score !== a.score) {
					return b.score - a.score
				}
				return a.displayPath.localeCompare(b.displayPath)
			})
			survivor = sorted[0]
		}

		const markedEntries = []
		const shieldedEntries = []

		for (const entry of scoredEntries) {
			if (entry.key === survivor.key) {
				continue
			}
			if (entry.shieldReason) {
				shieldedCount += 1
				shieldedBytes += entry.size
				shieldedEntries.push(entry)
			} else {
				markedEntries.push(entry)
			}
		}

		if (markedEntries.length === 0) {
			skippedGroups += 1
		}

		const decision = {
			groupId: group.id,
			hash: group.hash || '',
			acknowledged: Boolean(group.acknowledged),
			fileCount: files.length,
			survivor,
			markedEntries,
			shieldedEntries,
			deferredEntries: [],
			entries: scoredEntries.map(entry => ({
				...entry,
				role: entry.key === survivor.key
					? 'survivor'
					: (entry.shieldReason ? 'shielded' : 'marked'),
			})),
			reclaimableBytes: markedEntries.reduce((sum, item) => sum + item.size, 0),
			reclaimableFormatted: formatBytes(markedEntries.reduce((sum, item) => sum + item.size, 0)),
		}

		groupDecisions.push(decision)
		for (const item of markedEntries) {
			allCandidates.push({ decision, item })
		}
	}

	let deferredCount = 0
	const markedFiles = []

	allCandidates.forEach(({ decision, item }, index) => {
		if (batchCap !== null && index >= batchCap) {
			deferredCount += 1
			decision.deferredEntries.push(item)
			const targetEntry = decision.entries.find(entry => entry.key === item.key)
			if (targetEntry) {
				targetEntry.role = 'deferred'
			}
			return
		}
		markedFiles.push({
			...item.file,
			_groupId: decision.groupId,
			_groupHash: decision.hash,
			_survivorPath: decision.survivor.displayPath,
			_reasons: item.reasons,
		})
	})

	// Recompute per-decision active reclaimable totals when batch cap deferred items
	if (deferredCount > 0) {
		for (const decision of groupDecisions) {
			const deferredKeys = new Set(decision.deferredEntries.map(entry => entry.key))
			const activeMarked = decision.markedEntries.filter(entry => !deferredKeys.has(entry.key))
			decision.markedEntries = activeMarked
			decision.reclaimableBytes = activeMarked.reduce((sum, entry) => sum + entry.size, 0)
			decision.reclaimableFormatted = formatBytes(decision.reclaimableBytes)
		}
	}

	const markedBytes = markedFiles.reduce((sum, file) => sum + (Number(file.size) > 0 ? Number(file.size) : 0), 0)
	const groupsWithCleanup = groupDecisions.filter(group => group.markedEntries.length > 0).length

	return {
		profile: safeProfile,
		summary: {
			totalGroups: groupDecisions.length,
			groupsWithCleanup,
			skippedGroups,
			markedCount: markedFiles.length,
			markedBytes,
			markedFormatted: formatBytes(markedBytes),
			shieldedCount,
			shieldedBytes,
			shieldedFormatted: formatBytes(shieldedBytes),
			deferredCount,
			batchCapError: capCheck.error,
			invalidRuleCount: invalidRules.length,
		},
		invalidRules,
		exclusionCount: exclusionRules.length,
		groups: groupDecisions,
		markedFiles,
	}
}

/**
 * Sanitize an audit log batch entry for safe persistence and rendering.
 *
 * @param {object} raw Raw audit entry.
 * @return {object|null} Sanitized audit entry or null if malformed.
 */
export function sanitizeAuditEntry(raw) {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return null
	}
	const timestamp = Number(raw.timestamp)
	const safeTimestamp = Number.isFinite(timestamp) && timestamp > 0 ? Math.floor(timestamp) : Date.now()
	const id = sanitizePlainText(typeof raw.id === 'string' ? raw.id : '', 80) || `audit-${safeTimestamp}`
	const status = ALLOWED_AUDIT_STATUSES.has(raw.status) ? raw.status : 'completed'
	const profileName = sanitizePlainText(typeof raw.profileName === 'string' ? raw.profileName : '', 80) || 'Unnamed Profile'
	const profileId = sanitizePlainText(typeof raw.profileId === 'string' ? raw.profileId : '', 80) || 'custom'

	const items = Array.isArray(raw.items)
		? raw.items
			.filter(item => item && typeof item.path === 'string' && item.path.trim().length > 0)
			.slice(0, 250)
			.map(item => ({
				path: sanitizePlainText(item.path, 320),
				survivorPath: sanitizePlainText(item.survivorPath || '', 320),
				size: Number(item.size) > 0 ? Math.floor(Number(item.size)) : 0,
				nodeId: Number.isFinite(Number(item.nodeId)) ? Number(item.nodeId) : null,
				outcome: item.outcome === 'failed' ? 'failed' : (item.outcome === 'planned' ? 'planned' : 'deleted'),
			}))
		: []

	const deletedCount = Number.isFinite(Number(raw.deletedCount)) ? Math.max(0, Math.floor(Number(raw.deletedCount))) : 0
	const failedCount = Number.isFinite(Number(raw.failedCount)) ? Math.max(0, Math.floor(Number(raw.failedCount))) : 0
	const shieldedCount = Number.isFinite(Number(raw.shieldedCount)) ? Math.max(0, Math.floor(Number(raw.shieldedCount))) : 0
	const bytesReclaimed = Number.isFinite(Number(raw.bytesReclaimed)) ? Math.max(0, Math.floor(Number(raw.bytesReclaimed))) : 0

	return {
		id,
		timestamp: safeTimestamp,
		status,
		profileId,
		profileName,
		deletedCount,
		failedCount,
		shieldedCount,
		bytesReclaimed,
		bytesReclaimedFormatted: formatBytes(bytesReclaimed),
		items,
	}
}

/**
 * Load persistent rule audit log entries from storage.
 *
 * @param {Storage|object|null|undefined} [storage] Storage override.
 * @return {Array<object>} Sanitized audit entries sorted newest first.
 */
export function loadRuleAuditLog(storage) {
	try {
		const target = resolveStorage(storage)
		if (!target || typeof target.getItem !== 'function') {
			return []
		}
		const raw = target.getItem(getScopedStorageKey(RULE_AUDIT_LOG_STORAGE_KEY))
		if (!raw) {
			return []
		}
		const parsed = JSON.parse(raw)
		if (!Array.isArray(parsed)) {
			return []
		}
		return parsed
			.map(sanitizeAuditEntry)
			.filter(Boolean)
			.sort((a, b) => b.timestamp - a.timestamp)
			.slice(0, MAX_AUDIT_LOG_ENTRIES)
	} catch (error) {
		return []
	}
}

/**
 * Persist rule audit log entries safely to storage.
 *
 * @param {Array<object>} entries Audit entries.
 * @param {Storage|object|null|undefined} [storage] Storage override.
 * @return {Array<object>} Stored sanitized entries.
 */
export function saveRuleAuditLog(entries, storage) {
	const sanitized = (Array.isArray(entries) ? entries : [])
		.map(sanitizeAuditEntry)
		.filter(Boolean)
		.sort((a, b) => b.timestamp - a.timestamp)
		.slice(0, MAX_AUDIT_LOG_ENTRIES)
	try {
		const target = resolveStorage(storage)
		if (target && typeof target.setItem === 'function') {
			target.setItem(getScopedStorageKey(RULE_AUDIT_LOG_STORAGE_KEY), JSON.stringify(sanitized))
		}
	} catch (error) {
		// Ignore quota or restricted storage errors
	}
	return sanitized
}

/**
 * Append a new batch execution or dry-run snapshot to the persistent audit log.
 *
 * @param {object} entry Candidate audit entry.
 * @param {Storage|object|null|undefined} [storage] Storage override.
 * @return {Array<object>} Updated audit log.
 */
export function appendRuleAuditEntry(entry, storage) {
	const sanitized = sanitizeAuditEntry(entry)
	if (!sanitized) {
		return loadRuleAuditLog(storage)
	}
	const existing = loadRuleAuditLog(storage).filter(item => item.id !== sanitized.id)
	return saveRuleAuditLog([sanitized, ...existing], storage)
}

/**
 * Update the status of an audit entry (e.g. mark as 'restored').
 *
 * @param {string} entryId Entry identifier.
 * @param {'completed'|'partial'|'dry-run'|'restored'} nextStatus Target status.
 * @param {Storage|object|null|undefined} [storage] Storage override.
 * @return {Array<object>} Updated audit log.
 */
export function updateAuditEntryStatus(entryId, nextStatus, storage) {
	const existing = loadRuleAuditLog(storage)
	const safeStatus = ALLOWED_AUDIT_STATUSES.has(nextStatus) ? nextStatus : 'completed'
	const updated = existing.map(entry => (entry.id === entryId ? { ...entry, status: safeStatus } : entry))
	return saveRuleAuditLog(updated, storage)
}

/**
 * Clear all audit log entries from storage.
 *
 * @param {Storage|object|null|undefined} [storage] Storage override.
 * @return {Array<object>} Empty array.
 */
export function clearRuleAuditLog(storage) {
	return saveRuleAuditLog([], storage)
}

/**
 * Quote a POSIX shell single-quoted argument safely (prevents injection).
 *
 * @param {string} value Raw argument string.
 * @return {string} Single-quoted POSIX literal.
 */
function shellQuote(value) {
	return `'${String(value || '').replace(/'/g, '\'"\'"\'')}'`
}

/**
 * Build a safe Nextcloud Trashbin restore guide & verification script for an audit entry.
 *
 * @param {object} auditEntry Audit log entry.
 * @return {string} Plain-text shell script with restoration guidance.
 */
export function buildTrashbinRestorePlan(auditEntry) {
	const safeEntry = sanitizeAuditEntry(auditEntry)
	if (!safeEntry) {
		return '#!/usr/bin/env bash\n# No valid audit entry provided.\n'
	}
	const lines = [
		'#!/usr/bin/env bash',
		`# DuplicateFinder Batch Audit Restore Plan (${safeEntry.id})`,
		`# Profile: ${safeEntry.profileName}`,
		`# Recorded: ${new Date(safeEntry.timestamp).toISOString()}`,
		`# Status: ${safeEntry.status} | Deleted: ${safeEntry.deletedCount} | Reclaimed: ${safeEntry.bytesReclaimedFormatted}`,
		'# Nextcloud moves deleted files into the user Trashbin (files_trashbin).',
		'# Review surviving copies below before restoring from Trashbin in Nextcloud UI or OCC.',
		'set -euo pipefail',
		'',
	]

	for (const item of safeEntry.items) {
		const quotedDeleted = shellQuote(item.path)
		const quotedSurvivor = shellQuote(item.survivorPath || '')
		lines.push(`# Deleted (${formatBytes(item.size)}): ${quotedDeleted}`)
		if (item.survivorPath) {
			lines.push(`# Surviving reference copy: ${quotedSurvivor}`)
		}
		lines.push(`echo "Inspect Trashbin entry for: "${quotedDeleted}`)
	}

	if (safeEntry.items.length === 0) {
		lines.push('echo "No file items recorded in this audit entry."')
	}

	return `${lines.join('\n')}\n`
}

/**
 * Build a CWE-1236 formula-injection-safe CSV export for audit log entries.
 *
 * @param {Array<object>} entries Audit entries.
 * @return {string} CSV document string.
 */
export function exportAuditLogCsv(entries) {
	const header = [
		'Audit ID',
		'Timestamp',
		'Status',
		'Profile',
		'Deleted Files',
		'Failed Files',
		'Shielded Files',
		'Bytes Reclaimed',
		'Sample Deleted Path',
		'Sample Survivor Path',
	].map(escapeCsvCell).join(',')

	const rows = (Array.isArray(entries) ? entries : [])
		.map(sanitizeAuditEntry)
		.filter(Boolean)
		.map(entry => {
			const sample = entry.items[0] || {}
			return [
				entry.id,
				new Date(entry.timestamp).toISOString(),
				entry.status,
				entry.profileName,
				entry.deletedCount,
				entry.failedCount,
				entry.shieldedCount,
				entry.bytesReclaimed,
				sample.path || '',
				sample.survivorPath || '',
			].map(escapeCsvCell).join(',')
		})

	return [header, ...rows].join('\n')
}

/**
 * Build a versioned JSON export for audit log entries.
 *
 * @param {Array<object>} entries Audit entries.
 * @return {string} JSON string.
 */
export function exportAuditLogJson(entries) {
	const sanitized = (Array.isArray(entries) ? entries : [])
		.map(sanitizeAuditEntry)
		.filter(Boolean)
	return JSON.stringify({
		schema: AUDIT_LOG_SCHEMA,
		exportedAt: new Date().toISOString(),
		entryCount: sanitized.length,
		entries: sanitized,
	}, null, 2)
}
