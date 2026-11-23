/**
 * Pure helper engine for the Ignore & Whitelist Pattern Rule Builder.
 * Mirrors backend FilterService::matchesCustomFilters glob semantics
 * so users can validate, build, and test rules safely before saving.
 */

export const IGNORE_PATTERN_PRESETS = Object.freeze([
	{ id: 'tmp', type: 'name', value: '*.tmp', label: 'Temporary (*.tmp)' },
	{ id: 'bak', type: 'name', value: '*.bak', label: 'Backups (*.bak)' },
	{ id: 'swp', type: 'name', value: '*.swp', label: 'Editor swap (*.swp)' },
	{ id: 'office-lock', type: 'name', value: '~$*', label: 'Office lock (~$*)' },
	{ id: 'ds-store', type: 'name', value: '.DS_Store', label: 'macOS (.DS_Store)' },
	{ id: 'thumbs-db', type: 'name', value: 'Thumbs.db', label: 'Windows (Thumbs.db)' },
	{ id: 'log', type: 'name', value: '*.log', label: 'Logs (*.log)' },
	{ id: 'part', type: 'name', value: '*.part', label: 'Partial (*.part)' },
])

export const PATTERN_BUILDER_MODES = Object.freeze([
	'exact',
	'extension',
	'prefix',
	'contains',
])

export const DEFAULT_PATTERN_TEST_SAMPLES = Object.freeze([
	'report.tmp',
	'backup_2026.bak',
	'draft.swp',
	'~$budget.xlsx',
	'.DS_Store',
	'Thumbs.db',
	'server.log',
	'photo_001.jpg',
])

const VALID_HEX_HASH_REGEX = /^[0-9a-f]{8,128}$/i
const MAX_RULE_LENGTH = 255

/**
 * Extract the basename (file name without directory path) from a path or filename.
 *
 * @param {string|null|undefined} filePath - File path or filename.
 * @return {string} Extracted basename, or empty string when invalid.
 */
export function extractFileBasename(filePath) {
	if (typeof filePath !== 'string') {
		return ''
	}
	const trimmed = filePath.trim()
	if (!trimmed) {
		return ''
	}
	const slashIndex = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
	return slashIndex >= 0 ? trimmed.slice(slashIndex + 1) : trimmed
}

/**
 * Build a glob filename pattern from a structured builder mode and user input.
 *
 * @param {'exact'|'extension'|'prefix'|'contains'} mode - Builder mode.
 * @param {string|null|undefined} rawInput - Raw user input value.
 * @return {string} Constructed glob pattern or empty string when input is empty.
 */
export function buildPatternFromBuilder(mode, rawInput) {
	if (typeof rawInput !== 'string') {
		return ''
	}
	const trimmed = rawInput.trim()
	if (!trimmed) {
		return ''
	}

	if (mode === 'extension') {
		const cleanedExt = trimmed.replace(/^\*+/, '').replace(/^\.+/, '').trim()
		if (!cleanedExt) {
			return ''
		}
		return `*.${cleanedExt}`
	}

	if (mode === 'prefix') {
		const cleanedPrefix = trimmed.replace(/\*+$/, '').trim()
		if (!cleanedPrefix) {
			return ''
		}
		return `${cleanedPrefix}*`
	}

	if (mode === 'contains') {
		const cleanedPart = trimmed.replace(/^\*+/, '').replace(/\*+$/, '').trim()
		if (!cleanedPart) {
			return ''
		}
		return `*${cleanedPart}*`
	}

	return trimmed
}

/**
 * Convert a glob pattern (with * wildcards) to an anchored RegExp matching PHP preg_quote + *.
 *
 * @param {string|null|undefined} pattern - Glob pattern string.
 * @return {RegExp|null} Compiled anchored RegExp, or null when pattern is empty/invalid.
 */
export function globPatternToRegex(pattern) {
	if (typeof pattern !== 'string') {
		return null
	}
	const trimmed = pattern.trim()
	if (!trimmed || /[/\\]/.test(trimmed)) {
		return null
	}

	const escaped = trimmed.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
	const regexBody = escaped.replace(/\*/g, '.*')
	try {
		return new RegExp(`^${regexBody}$`)
	} catch (error) {
		return null
	}
}

/**
 * Evaluate whether a filename or path matches a glob filename pattern.
 *
 * @param {string|null|undefined} pattern - Glob filename pattern (e.g. '*.tmp').
 * @param {string|null|undefined} filePathOrName - File path or filename to check.
 * @return {boolean} True when the basename matches the pattern.
 */
export function matchesFilenamePattern(pattern, filePathOrName) {
	const regex = globPatternToRegex(pattern)
	if (!regex) {
		return false
	}
	const basename = extractFileBasename(filePathOrName)
	if (!basename) {
		return false
	}
	return regex.test(basename)
}

/**
 * Validate a candidate ignore rule (filename pattern or hash) against backend constraints
 * and existing configured rules.
 *
 * @param {'name'|'hash'} type - Rule type.
 * @param {string|null|undefined} rawValue - Candidate rule value.
 * @param {Array<object>} [existingRules=[]] - Existing rules.
 * @return {{
 *   valid: boolean,
 *   normalizedValue: string,
 *   errorCode: 'INVALID_TYPE'|'EMPTY'|'TOO_LONG'|'CONTAINS_PATH_SEPARATOR'|'INVALID_HASH'|'DUPLICATE'|null,
 *   errorMessage: string
 * }} Validation outcome.
 */
export function validateIgnoreRule(type, rawValue, existingRules = []) {
	if (type !== 'name' && type !== 'hash') {
		return {
			valid: false,
			normalizedValue: '',
			errorCode: 'INVALID_TYPE',
			errorMessage: 'Unsupported rule type.',
		}
	}

	const trimmed = typeof rawValue === 'string' ? rawValue.trim() : ''
	if (!trimmed) {
		return {
			valid: false,
			normalizedValue: '',
			errorCode: 'EMPTY',
			errorMessage: 'Please enter a rule value.',
		}
	}

	if (trimmed.length > MAX_RULE_LENGTH) {
		return {
			valid: false,
			normalizedValue: trimmed,
			errorCode: 'TOO_LONG',
			errorMessage: 'Rule value exceeds maximum length of 255 characters.',
		}
	}

	if (type === 'name' && /[/\\]/.test(trimmed)) {
		return {
			valid: false,
			normalizedValue: trimmed,
			errorCode: 'CONTAINS_PATH_SEPARATOR',
			errorMessage: 'Filename patterns match file names only, not folder paths. Use Excluded Folders for paths.',
		}
	}

	if (type === 'hash' && !VALID_HEX_HASH_REGEX.test(trimmed)) {
		return {
			valid: false,
			normalizedValue: trimmed,
			errorCode: 'INVALID_HASH',
			errorMessage: 'Hash must be an 8 to 128 character hexadecimal digest.',
		}
	}

	const normalizedValue = type === 'hash' ? trimmed.toLowerCase() : trimmed
	const existingList = Array.isArray(existingRules) ? existingRules : []
	const isDuplicate = existingList.some(rule => {
		if (!rule || rule.type !== type || typeof rule.value !== 'string') {
			return false
		}
		const existingVal = type === 'hash' ? rule.value.trim().toLowerCase() : rule.value.trim()
		return existingVal === normalizedValue
	})

	if (isDuplicate) {
		return {
			valid: false,
			normalizedValue,
			errorCode: 'DUPLICATE',
			errorMessage: 'This ignore rule already exists.',
		}
	}

	return {
		valid: true,
		normalizedValue,
		errorCode: null,
		errorMessage: '',
	}
}

/**
 * Evaluate a draft glob pattern against a list of sample filenames or paths.
 *
 * @param {string|null|undefined} pattern - Draft filename pattern.
 * @param {Array<string>} [samples=DEFAULT_PATTERN_TEST_SAMPLES] - Sample filenames or paths.
 * @return {{
 *   valid: boolean,
 *   errorCode: string|null,
 *   matchCount: number,
 *   results: Array<{ sample: string, basename: string, matched: boolean }>
 * }} Tester evaluation result.
 */
export function evaluatePatternTester(pattern, samples = DEFAULT_PATTERN_TEST_SAMPLES) {
	const validation = validateIgnoreRule('name', pattern, [])
	const sampleList = Array.isArray(samples) ? samples : []
	const seen = new Set()
	const normalizedSamples = []

	for (const rawSample of sampleList) {
		const basename = extractFileBasename(rawSample)
		if (!basename || seen.has(basename)) {
			continue
		}
		seen.add(basename)
		normalizedSamples.push({
			sample: String(rawSample).trim(),
			basename,
		})
	}

	if (!validation.valid) {
		return {
			valid: false,
			errorCode: validation.errorCode,
			matchCount: 0,
			results: normalizedSamples.map(item => ({
				sample: item.sample,
				basename: item.basename,
				matched: false,
			})),
		}
	}

	let matchCount = 0
	const results = normalizedSamples.map(item => {
		const matched = matchesFilenamePattern(validation.normalizedValue, item.basename)
		if (matched) {
			matchCount += 1
		}
		return {
			sample: item.sample,
			basename: item.basename,
			matched,
		}
	})

	return {
		valid: true,
		errorCode: null,
		matchCount,
		results,
	}
}

/**
 * Count how many active duplicate groups and files match a given ignore rule.
 *
 * @param {object|null|undefined} rule - Ignore rule object.
 * @param {Array<object>} [duplicates=[]] - Active duplicate groups.
 * @return {{ groupCount: number, fileCount: number }} Match counts.
 */
export function countMatchingDuplicatesForRule(rule, duplicates = []) {
	if (!rule || typeof rule !== 'object' || !Array.isArray(duplicates) || duplicates.length === 0) {
		return { groupCount: 0, fileCount: 0 }
	}

	const ruleType = rule.type
	const ruleValue = typeof rule.value === 'string' ? rule.value.trim() : ''
	if (!ruleValue || (ruleType !== 'name' && ruleType !== 'hash')) {
		return { groupCount: 0, fileCount: 0 }
	}

	let groupCount = 0
	let fileCount = 0

	if (ruleType === 'hash') {
		const normalizedHash = ruleValue.toLowerCase()
		for (const group of duplicates) {
			if (!group || typeof group.hash !== 'string') {
				continue
			}
			if (group.hash.trim().toLowerCase() === normalizedHash) {
				groupCount += 1
				fileCount += Array.isArray(group.files) ? group.files.length : 0
			}
		}
		return { groupCount, fileCount }
	}

	const regex = globPatternToRegex(ruleValue)
	if (!regex) {
		return { groupCount: 0, fileCount: 0 }
	}

	for (const group of duplicates) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		let groupMatches = 0
		for (const file of group.files) {
			const candidate = file && (file.path || file.name) ? (file.path || file.name) : ''
			const basename = extractFileBasename(candidate)
			if (basename && regex.test(basename)) {
				groupMatches += 1
			}
		}
		if (groupMatches > 0) {
			groupCount += 1
			fileCount += groupMatches
		}
	}

	return { groupCount, fileCount }
}
