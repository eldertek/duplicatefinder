/**
 * Pure helper for formatting duplicate file hashes into readable prefixes.
 */

const HEX_HASH_PATTERN = /^[0-9a-f]+$/

/**
 * Format a hexadecimal hash string into a lowercase short prefix.
 * Returns an empty string when the hash or length is invalid.
 *
 * @param {string|null|undefined} hash - Full duplicate hash string.
 * @param {number} [length=12] - Maximum prefix length to keep.
 * @return {string} Lowercase hexadecimal prefix, or '' if invalid.
 */
export function formatShortHash(hash, length = 12) {
	if (typeof hash !== 'string') {
		return ''
	}

	const normalizedHash = hash.trim().toLowerCase()
	if (normalizedHash.length === 0 || !HEX_HASH_PATTERN.test(normalizedHash)) {
		return ''
	}

	if (typeof length !== 'number' || !Number.isFinite(length)) {
		return ''
	}

	const safeLength = Math.floor(length)
	if (safeLength <= 0) {
		return ''
	}

	return normalizedHash.slice(0, safeLength)
}

/**
 * Derive quick ignore/exclude suggestions (hash, filename patterns, folder paths)
 * from a duplicate group for fast triage actions.
 *
 * @param {object|null|undefined} duplicate - Duplicate group object.
 * @return {{
 *   hash: string,
 *   shortHash: string,
 *   extensionPatterns: string[],
 *   exactFileNames: string[],
 *   folderPaths: string[]
 * }} Derived ignore suggestions.
 */
export function deriveGroupIgnoreOptions(duplicate) {
	if (!duplicate || typeof duplicate !== 'object') {
		return {
			hash: '',
			shortHash: '',
			extensionPatterns: [],
			exactFileNames: [],
			folderPaths: [],
		}
	}

	const hash = typeof duplicate.hash === 'string' ? duplicate.hash.trim() : ''
	const shortHash = formatShortHash(hash)
	const files = Array.isArray(duplicate.files) ? duplicate.files : []

	const extensionPatterns = []
	const seenExtensions = new Set()
	const exactFileNames = []
	const seenNames = new Set()
	const folderPaths = []
	const seenFolders = new Set()

	for (const file of files) {
		if (!file || typeof file !== 'object') {
			continue
		}
		const rawPath = typeof file.path === 'string' ? file.path.trim() : ''
		if (!rawPath) {
			continue
		}

		const relativePath = rawPath.replace(/^\/[^/]+\/files(?=\/|$)/, '')
		const slashIdx = Math.max(relativePath.lastIndexOf('/'), relativePath.lastIndexOf('\\'))
		const basename = slashIdx >= 0 ? relativePath.slice(slashIdx + 1) : relativePath

		if (basename && !/[/\\]/.test(basename)) {
			if (!seenNames.has(basename) && exactFileNames.length < 2) {
				seenNames.add(basename)
				exactFileNames.push(basename)
			}

			const dotIdx = basename.lastIndexOf('.')
			if (dotIdx > 0 && dotIdx < basename.length - 1) {
				const ext = basename.slice(dotIdx + 1).toLowerCase()
				if (/^[a-z0-9]{1,12}$/.test(ext)) {
					const pattern = `*.${ext}`
					if (!seenExtensions.has(pattern) && extensionPatterns.length < 2) {
						seenExtensions.add(pattern)
						extensionPatterns.push(pattern)
					}
				}
			}
		}

		if (!file.isInOriginFolder && slashIdx > 0) {
			const folder = relativePath.slice(0, slashIdx)
			if (folder && folder !== '/' && !seenFolders.has(folder) && folderPaths.length < 3) {
				seenFolders.add(folder)
				folderPaths.push(folder)
			}
		}
	}

	return {
		hash,
		shortHash,
		extensionPatterns,
		exactFileNames,
		folderPaths,
	}
}
