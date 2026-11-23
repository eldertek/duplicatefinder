/**
 * Pure triage preference persistence and folder-prefix filtering helpers.
 * Stores only strictly whitelisted non-sensitive UI preferences (active category
 * filter and sort key) with resilient try/catch storage handling.
 */

export const TRIAGE_PREFERENCES_STORAGE_KEY = 'duplicatefinder:triage-preferences'

export const DEFAULT_ALLOWED_CATEGORIES = Object.freeze([
	'all',
	'images',
	'videos',
	'audio',
	'documents',
	'archives',
	'large',
])

export const DEFAULT_ALLOWED_SORT_KEYS = Object.freeze([
	'none',
	'size-desc',
	'size-asc',
])

export const DEFAULT_TRIAGE_PREFERENCES = Object.freeze({
	category: 'all',
	sortKey: 'none',
})

/**
 * Resolve a Storage-like object safely without throwing in restricted contexts.
 *
 * @param {Storage|object|null|undefined} storage - Injected storage or undefined for window.localStorage.
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
 * Resolve a non-empty whitelist of allowed string values.
 *
 * @param {Array<string>|undefined} candidates - Custom whitelist.
 * @param {string[]} fallback - Default whitelist.
 * @return {Set<string>} Validated whitelist set.
 */
function resolveWhitelist(candidates, fallback) {
	if (!Array.isArray(candidates) || candidates.length === 0) {
		return new Set(fallback)
	}
	const filtered = candidates.filter(value => typeof value === 'string' && value.length > 0)
	return filtered.length > 0 ? new Set(filtered) : new Set(fallback)
}

/**
 * Compute the storage key for triage preferences, scoped per Nextcloud user when present.
 *
 * @param {object} [options] - Optional configuration.
 * @param {string} [options.storageKey] - Explicit storage key override.
 * @return {string} Storage key string.
 */
export function getTriagePreferencesStorageKey(options = {}) {
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
	return uid ? `${TRIAGE_PREFERENCES_STORAGE_KEY}:${uid}` : TRIAGE_PREFERENCES_STORAGE_KEY
}

/**
 * Validate and sanitize raw triage preferences against strict whitelists.
 * Strips all unknown or potentially sensitive keys.
 *
 * @param {object|null|undefined} raw - Raw preference object.
 * @param {object} [options] - Whitelist options.
 * @param {string[]} [options.allowedCategories] - Allowed category identifiers.
 * @param {string[]} [options.allowedSortKeys] - Allowed sort key identifiers.
 * @return {{ category: string, sortKey: string }} Sanitized preferences object.
 */
export function sanitizeTriagePreferences(raw, options = {}) {
	const allowedCategories = resolveWhitelist(options && options.allowedCategories, DEFAULT_ALLOWED_CATEGORIES)
	const allowedSortKeys = resolveWhitelist(options && options.allowedSortKeys, DEFAULT_ALLOWED_SORT_KEYS)

	const defaultCategory = allowedCategories.has(DEFAULT_TRIAGE_PREFERENCES.category)
		? DEFAULT_TRIAGE_PREFERENCES.category
		: Array.from(allowedCategories)[0]
	const defaultSortKey = allowedSortKeys.has(DEFAULT_TRIAGE_PREFERENCES.sortKey)
		? DEFAULT_TRIAGE_PREFERENCES.sortKey
		: Array.from(allowedSortKeys)[0]

	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return {
			category: defaultCategory,
			sortKey: defaultSortKey,
		}
	}

	const category = typeof raw.category === 'string' && allowedCategories.has(raw.category)
		? raw.category
		: defaultCategory
	const sortKey = typeof raw.sortKey === 'string' && allowedSortKeys.has(raw.sortKey)
		? raw.sortKey
		: defaultSortKey

	return {
		category,
		sortKey,
	}
}

/**
 * Safely load triage preferences (category and sortKey) from storage.
 * Falls back to defaults when storage is unavailable, throws, or contains corrupted JSON.
 *
 * @param {Storage|object|null|undefined} [storage] - Storage instance (defaults to window.localStorage).
 * @param {object} [options] - Whitelist and storageKey options.
 * @return {{ category: string, sortKey: string }} Validated triage preferences.
 */
export function loadTriagePreferences(storage, options = {}) {
	try {
		const target = resolveStorage(storage)
		if (!target || typeof target.getItem !== 'function') {
			return sanitizeTriagePreferences(null, options)
		}
		const key = getTriagePreferencesStorageKey(options)
		const raw = target.getItem(key)
		if (typeof raw !== 'string' || raw.trim() === '') {
			return sanitizeTriagePreferences(null, options)
		}
		const parsed = JSON.parse(raw)
		return sanitizeTriagePreferences(parsed, options)
	} catch (error) {
		return sanitizeTriagePreferences(null, options)
	}
}

/**
 * Safely persist whitelisted triage preferences (category and sortKey) to storage.
 * Ignores unknown/sensitive fields and catches any storage errors.
 *
 * @param {Storage|object|null|undefined} storage - Storage instance (defaults to window.localStorage).
 * @param {object|null|undefined} prefs - Preferences to persist.
 * @param {object} [options] - Whitelist and storageKey options.
 * @return {boolean} True when persisted, false when storage is unavailable or fails.
 */
export function saveTriagePreferences(storage, prefs, options = {}) {
	try {
		const target = resolveStorage(storage)
		if (!target || typeof target.setItem !== 'function') {
			return false
		}
		const sanitized = sanitizeTriagePreferences(prefs, options)
		const key = getTriagePreferencesStorageKey(options)
		target.setItem(key, JSON.stringify({
			category: sanitized.category,
			sortKey: sanitized.sortKey,
		}))
		return true
	} catch (error) {
		return false
	}
}

/**
 * Normalize a file or folder path into a canonical lowercase relative path starting with '/'.
 * Strips Nextcloud '/<user>/files' prefix when present.
 *
 * @param {string} rawPath - File or folder path.
 * @return {string} Normalized path (e.g. '/photos/2024/img.jpg') or empty string.
 */
function normalizeRelativePath(rawPath) {
	if (typeof rawPath !== 'string') {
		return ''
	}
	const slashed = rawPath.trim().replace(/\\/g, '/')
	if (!slashed) {
		return ''
	}
	const withoutNcPrefix = slashed.replace(/^\/[^/]+\/files(?=\/|$)/, '')
	const cleaned = withoutNcPrefix.replace(/^\/+|\/+$/g, '')
	return cleaned ? `/${cleaned.toLowerCase()}` : '/'
}

/**
 * Parse a folder prefix query supporting inclusive ('/Photos') and exclusive ('!/Backups') syntax.
 *
 * @param {string|null|undefined} folderQuery - User folder prefix query.
 * @return {{ active: boolean, exclude: boolean, prefix: string }} Parsed query state.
 */
export function parseFolderPrefixQuery(folderQuery) {
	if (typeof folderQuery !== 'string') {
		return { active: false, exclude: false, prefix: '' }
	}
	const trimmed = folderQuery.trim()
	if (!trimmed) {
		return { active: false, exclude: false, prefix: '' }
	}
	const exclude = trimmed.startsWith('!')
	const rawPrefix = (exclude ? trimmed.slice(1) : trimmed).trim()
	if (!rawPrefix) {
		return { active: false, exclude: false, prefix: '' }
	}
	const prefix = normalizeRelativePath(rawPrefix)
	if (!prefix) {
		return { active: false, exclude: false, prefix: '' }
	}
	return { active: true, exclude, prefix }
}

/**
 * Determine whether a single file entry falls under a normalized folder prefix.
 *
 * @param {object|null|undefined} file - File entry with path.
 * @param {string} normalizedPrefix - Normalized lowercase folder prefix starting with '/'.
 * @return {boolean} True when file path is inside or equals normalizedPrefix.
 */
function fileMatchesFolderPrefix(file, normalizedPrefix) {
	if (!file || typeof file !== 'object' || typeof file.path !== 'string') {
		return false
	}
	const filePath = normalizeRelativePath(file.path)
	if (!filePath) {
		return false
	}
	if (normalizedPrefix === '/') {
		return filePath.startsWith('/')
	}
	return filePath === normalizedPrefix || filePath.startsWith(`${normalizedPrefix}/`)
}

/**
 * Filter duplicate groups by a root folder prefix.
 * Supports inclusive ('/Photos') and exclusive ('!/Backups') queries.
 *
 * @param {Array} duplicates - Array of duplicate group objects.
 * @param {string} [folderQuery=''] - Folder prefix query.
 * @return {Array} Filtered duplicate groups.
 */
export function filterDuplicatesByFolderPrefix(duplicates, folderQuery = '') {
	if (!Array.isArray(duplicates)) {
		return []
	}
	const parsed = parseFolderPrefixQuery(folderQuery)
	if (!parsed.active) {
		return duplicates.filter(Boolean)
	}
	return duplicates.filter(duplicate => {
		if (!duplicate || typeof duplicate !== 'object') {
			return false
		}
		const files = Array.isArray(duplicate.files) ? duplicate.files : []
		if (files.length === 0) {
			return false
		}
		const hasMatch = files.some(file => fileMatchesFolderPrefix(file, parsed.prefix))
		return parsed.exclude ? !hasMatch : hasMatch
	})
}
