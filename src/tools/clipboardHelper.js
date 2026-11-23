/**
 * Safe, pure clipboard helper for copying file paths or text without throwing
 * uncaught exceptions or manipulating raw HTML.
 */

/**
 * Copy non-empty text using the provided clipboard implementation or navigator.clipboard.
 *
 * @param {string} text - Text to copy to the clipboard.
 * @param {object|null|undefined} [clipboardImpl] - Optional clipboard override for testing.
 * @return {Promise<boolean>} True when writeText succeeded, false otherwise.
 */
export async function copyTextSafely(text, clipboardImpl) {
	if (typeof text !== 'string' || text.trim().length === 0) {
		return false
	}

	const resolvedClipboard = clipboardImpl !== undefined
		? clipboardImpl
		: (typeof navigator !== 'undefined' && navigator ? navigator.clipboard : null)

	if (!resolvedClipboard || typeof resolvedClipboard.writeText !== 'function') {
		return false
	}

	try {
		await resolvedClipboard.writeText(text)
		return true
	} catch (_error) {
		return false
	}
}
