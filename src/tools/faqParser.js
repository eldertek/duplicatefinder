/**
 * Safely validates an HTTPS URL for static FAQ links.
 *
 * @param {string} rawUrl Candidate URL string.
 * @return {string|null} Normalized HTTPS URL string or null if unsafe.
 */
function sanitizeHttpsUrl(rawUrl) {
	if (typeof rawUrl !== 'string') {
		return null
	}
	const trimmed = rawUrl.trim()
	if (!trimmed) {
		return null
	}
	try {
		const parsed = new URL(trimmed)
		if (parsed.protocol === 'https:') {
			return parsed.href
		}
	} catch (_) {
		return null
	}
	return null
}

/**
 * Parses a translated FAQ answer string into safe declarative render tokens
 * without touching innerHTML or v-html.
 *
 * @param {string} rawAnswer Raw FAQ answer string (may contain <br>, <strong>, <a href="https://...">, or \n).
 * @return {Array<object>} Safe token list.
 */
export function parseFaqAnswer(rawAnswer) {
	if (typeof rawAnswer !== 'string' || rawAnswer.length === 0) {
		return []
	}

	const tokens = []
	const pattern = /(<br\s*\/?>|\r?\n|<strong>([\s\S]*?)<\/strong>|<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>)/gi
	let lastIndex = 0
	let match

	while ((match = pattern.exec(rawAnswer)) !== null) {
		if (match.index > lastIndex) {
			tokens.push({
				type: 'text',
				text: rawAnswer.slice(lastIndex, match.index),
			})
		}

		const fullMatch = match[0]
		if (fullMatch === '\n' || fullMatch === '\r\n' || /^<br\s*\/?>$/i.test(fullMatch)) {
			tokens.push({ type: 'br' })
		} else if (match[2] !== undefined) {
			tokens.push({
				type: 'strong',
				text: match[2],
			})
		} else {
			const href = sanitizeHttpsUrl(match[3] !== undefined ? match[3] : match[4])
			const linkText = match[5] !== undefined ? match[5] : ''
			if (href) {
				tokens.push({
					type: 'link',
					href,
					text: linkText,
				})
			} else {
				tokens.push({
					type: 'text',
					text: linkText,
				})
			}
		}

		lastIndex = pattern.lastIndex
	}

	if (lastIndex < rawAnswer.length) {
		tokens.push({
			type: 'text',
			text: rawAnswer.slice(lastIndex),
		})
	}

	return tokens
}

/**
 * Extracts searchable plain text from a FAQ answer string without DOM HTML parsing.
 *
 * @param {string} rawAnswer Raw FAQ answer string.
 * @return {string} Plain text representation for search indexing.
 */
export function extractFaqPlainText(rawAnswer) {
	return parseFaqAnswer(rawAnswer)
		.map(token => (token.type === 'br' ? ' ' : (token.text || '')))
		.join('')
}
