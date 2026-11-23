/**
 * Pure Zero-Touch Scheduled Retention Automation Rulebook,
 * 5-Field Cron Schedule Predictor, Multi-Cycle Policy Simulator,
 * Nextcloud OCC Runbook & Reversible Quarantine Rollback Script Generator.
 * Zero DOM dependencies, zero network side effects, zero XSS sinks.
 */

import { formatBytes } from './duplicateStats'
import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'

export const AUTOMATION_RULEBOOK_SCHEMA = 'duplicatefinder.automation-rulebook.v1'
export const AUTOMATION_RULEBOOK_STORAGE_KEY = 'duplicatefinder:automation-rulebook.v1'

export const MS_PER_DAY = 86400000
export const MAX_RULEBOOK_RULES = 20
export const MAX_PATTERN_LENGTH = 200
export const MAX_BLAST_RADIUS_CAP = 5000
export const MAX_GRACE_PERIOD_DAYS = 3650

export const HORIZON_CYCLE_OPTIONS = Object.freeze([1, 3, 6, 12])

export const ACTION_MODES = Object.freeze([
	'quarantine-stage',
	'trashbin-prune',
	'link-replace',
])

export const KEEP_STRATEGIES = Object.freeze([
	'origin-first',
	'oldest',
	'newest',
	'shortest-path',
])

export const CONFLICT_MODES = Object.freeze([
	'first-match-wins',
	'strictest-safeguard',
])

export const SIMULATION_FILTER_MODES = Object.freeze([
	'all',
	'cycle-1',
	'future-cycle',
	'blocked',
	'quarantine-stage',
	'trashbin-prune',
	'link-replace',
])

export const SIMULATION_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'cycle_asc',
	'age_desc',
	'priority_asc',
	'name_asc',
])

export const CRON_PRESETS = Object.freeze([
	{
		id: 'daily-02',
		label: 'Daily at 02:00 UTC',
		expression: '0 2 * * *',
		intervalDays: 1,
	},
	{
		id: 'weekly-sun',
		label: 'Weekly Sunday 03:00 UTC',
		expression: '0 3 * * 0',
		intervalDays: 7,
	},
	{
		id: 'biweekly',
		label: 'Biweekly (1st & 15th 03:30 UTC)',
		expression: '30 3 1,15 * *',
		intervalDays: 14,
	},
	{
		id: 'monthly-1st',
		label: 'Monthly 1st at 04:00 UTC',
		expression: '0 4 1 * *',
		intervalDays: 30,
	},
])

export const RULEBOOK_PRESETS = Object.freeze([
	{
		id: 'conservative-ops',
		name: 'Conservative Safe Ops',
		description: 'Protects Origin folders and active shares, enforces 14-day grace period, and caps each run at 50 files.',
		cronExpression: '0 3 * * 0',
		horizonCycles: 6,
		safeguards: {
			blastRadiusCap: 50,
			gracePeriodDays: 14,
			protectOriginFolders: true,
			protectSharedMounts: true,
			requireLastCopyGuard: true,
			conflictMode: 'strictest-safeguard',
		},
		rules: [
			{
				id: 'rule-temp-cache',
				name: 'Prune temp & build cache duplicates',
				enabled: true,
				actionMode: 'trashbin-prune',
				pathRegex: '(\\.tmp|\\.cache|/cache/|/tmp/|~\\$)',
				minAgeDays: 7,
				minSizeBytes: 0,
				keepStrategy: 'origin-first',
			},
			{
				id: 'rule-installers-iso',
				name: 'Quarantine cold installer & ISO copies',
				enabled: true,
				actionMode: 'quarantine-stage',
				pathRegex: '\\.(iso|dmg|pkg|exe|msi|deb|rpm)$',
				minAgeDays: 30,
				minSizeBytes: 10485760,
				keepStrategy: 'origin-first',
			},
			{
				id: 'rule-downloads-incoming',
				name: 'Prune stale Downloads & Incoming copies',
				enabled: true,
				actionMode: 'trashbin-prune',
				pathRegex: '/(downloads|incoming|inbox)/',
				minAgeDays: 30,
				minSizeBytes: 1048576,
				keepStrategy: 'origin-first',
			},
		],
	},
	{
		id: 'media-hygiene',
		name: 'Media & Downloads Auto-Hygiene',
		description: 'Deduplicates copy-suffixed files, proposes link-replace for large raw media, and cleans Downloads.',
		cronExpression: '0 2 * * *',
		horizonCycles: 6,
		safeguards: {
			blastRadiusCap: 100,
			gracePeriodDays: 7,
			protectOriginFolders: true,
			protectSharedMounts: true,
			requireLastCopyGuard: true,
			conflictMode: 'first-match-wins',
		},
		rules: [
			{
				id: 'rule-copy-suffixes',
				name: 'Prune numbered copy & conflict suffixes',
				enabled: true,
				actionMode: 'trashbin-prune',
				pathRegex: '(\\(\\d+\\)|[-_ ]copy|conflicted copy)',
				minAgeDays: 7,
				minSizeBytes: 0,
				keepStrategy: 'oldest',
			},
			{
				id: 'rule-media-link',
				name: 'Link-replace identical large media assets',
				enabled: true,
				actionMode: 'link-replace',
				pathRegex: '\\.(jpg|jpeg|png|heic|raw|cr2|nef|mp4|mov|flac)$',
				minAgeDays: 14,
				minSizeBytes: 5242880,
				keepStrategy: 'origin-first',
			},
			{
				id: 'rule-imports-prune',
				name: 'Prune duplicate Imports & Downloads',
				enabled: true,
				actionMode: 'trashbin-prune',
				pathRegex: '/(downloads|imports)/',
				minAgeDays: 14,
				minSizeBytes: 0,
				keepStrategy: 'origin-first',
			},
		],
	},
	{
		id: 'compliance-cold-tier',
		name: 'Compliance Cold-Storage Tiering',
		description: 'Quarantines cold archives, backups, and aged office records under strict 30-day grace safeguards.',
		cronExpression: '0 4 1 * *',
		horizonCycles: 12,
		safeguards: {
			blastRadiusCap: 75,
			gracePeriodDays: 30,
			protectOriginFolders: true,
			protectSharedMounts: true,
			requireLastCopyGuard: true,
			conflictMode: 'strictest-safeguard',
		},
		rules: [
			{
				id: 'rule-cold-archives',
				name: 'Quarantine cold archives & snapshots',
				enabled: true,
				actionMode: 'quarantine-stage',
				pathRegex: '(\\.(zip|tar|gz|7z|bak|old)$|/(backup|archive|snapshots)/)',
				minAgeDays: 180,
				minSizeBytes: 1048576,
				keepStrategy: 'oldest',
			},
			{
				id: 'rule-ancient-docs',
				name: 'Quarantine aged office documents',
				enabled: true,
				actionMode: 'quarantine-stage',
				pathRegex: '\\.(pdf|docx?|xlsx?|pptx?|odt)$',
				minAgeDays: 365,
				minSizeBytes: 102400,
				keepStrategy: 'origin-first',
			},
		],
	},
	{
		id: 'aggressive-reclaim',
		name: 'Aggressive Storage Reclaim',
		description: 'High-throughput space recovery targeting large duplicates >=10 MB after 3 days.',
		cronExpression: '0 2 * * *',
		horizonCycles: 3,
		safeguards: {
			blastRadiusCap: 250,
			gracePeriodDays: 3,
			protectOriginFolders: true,
			protectSharedMounts: false,
			requireLastCopyGuard: true,
			conflictMode: 'first-match-wins',
		},
		rules: [
			{
				id: 'rule-large-dups',
				name: 'Prune redundant large files (>=10 MB)',
				enabled: true,
				actionMode: 'trashbin-prune',
				pathRegex: '.*',
				minAgeDays: 3,
				minSizeBytes: 10485760,
				keepStrategy: 'origin-first',
			},
			{
				id: 'rule-remaining-dups',
				name: 'Prune remaining non-origin duplicates',
				enabled: true,
				actionMode: 'trashbin-prune',
				pathRegex: '.*',
				minAgeDays: 14,
				minSizeBytes: 0,
				keepStrategy: 'shortest-path',
			},
		],
	},
])

const BLOCKED_REASON_LABELS = Object.freeze({
	last_copy_guard: 'Last surviving copy protection',
	origin_protected: 'Protected Origin Folder',
	share_mount_protected: 'Active Share / External Mount',
	grace_period: 'Within grace period',
	unknown_age_grace: 'Unknown timestamp under grace period',
	blast_radius_cap: 'Deferred past horizon by blast-radius cap',
	no_rule_match: 'No enabled rule matched',
})

const ACTION_MODE_LABELS = Object.freeze({
	'quarantine-stage': 'Quarantine Stage',
	'trashbin-prune': 'Trashbin Prune',
	'link-replace': 'Link Replace',
})

const TIMESTAMP_FIELDS = Object.freeze(['mtime', 'modified', 'updatedAt', 'lastModified'])
const SHARED_MOUNT_PATH_RE = /(?:^|\/)(?:shared|external|mount|team-folders|groupfolders)(?:\/|$)/i
const NESTED_QUANTIFIER_RE = /\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)[+*{]/

/**
 * Strip ASCII control characters from a string cleanly.
 *
 * @param {string} raw Input string.
 * @param {boolean} [replaceWithSpace=true] Replace control chars with space when true.
 * @return {string} Cleaned string.
 */
function stripControlChars(raw, replaceWithSpace = true) {
	let out = ''
	for (let i = 0; i < raw.length; i += 1) {
		const code = raw.charCodeAt(i)
		if (code < 0x20 || code === 0x7f) {
			if (replaceWithSpace) {
				out += ' '
			}
		} else {
			out += raw[i]
		}
	}
	return out
}

/**
 * Quote an argument safely for POSIX sh / bash single-quoted literals.
 *
 * @param {string} raw Raw path or literal.
 * @return {string} POSIX-safe single-quoted string.
 */
export function quotePosixShellArg(raw) {
	const cleaned = stripControlChars(String(raw ?? ''), false)
	return `'${cleaned.replace(/'/g, '\'"\'"\'')}'`
}

/**
 * Parse a timestamp value into epoch milliseconds.
 *
 * @param {*} value Candidate timestamp value.
 * @return {number|null} Epoch ms or null.
 */
function parseTimestampMs(value) {
	if (value === null || value === undefined || value === '') {
		return null
	}
	if (value instanceof Date) {
		const ms = value.getTime()
		return Number.isFinite(ms) ? ms : null
	}
	if (typeof value === 'number') {
		if (!Number.isFinite(value) || value <= 0) {
			return null
		}
		return value < 1e12 ? Math.round(value * 1000) : Math.round(value)
	}
	if (typeof value === 'string') {
		const trimmed = value.trim()
		if (!trimmed) {
			return null
		}
		if (/^\d+(\.\d+)?$/.test(trimmed)) {
			const numeric = Number(trimmed)
			if (!Number.isFinite(numeric) || numeric <= 0) {
				return null
			}
			return numeric < 1e12 ? Math.round(numeric * 1000) : Math.round(numeric)
		}
		const parsed = Date.parse(trimmed)
		return Number.isFinite(parsed) ? parsed : null
	}
	return null
}

/**
 * Resolve modification epoch ms for a duplicate file object.
 *
 * @param {object|null|undefined} file File entry.
 * @return {number|null} Modification timestamp in ms or null.
 */
function resolveFileTimestampMs(file) {
	if (!file || typeof file !== 'object') {
		return null
	}
	for (const field of TIMESTAMP_FIELDS) {
		if (field in file) {
			const parsed = parseTimestampMs(file[field])
			if (parsed !== null) {
				return parsed
			}
		}
	}
	return null
}

/**
 * Extract folder path and filename from a full path string.
 *
 * @param {string} rawPath File path.
 * @return {{ folderPath: string, fileName: string, normalizedPath: string }} Parsed parts.
 */
function splitPath(rawPath) {
	const normalizedPath = normalizePathForDiff(rawPath) || '/'
	const lastSlash = normalizedPath.lastIndexOf('/')
	if (lastSlash <= 0) {
		return {
			folderPath: '/',
			fileName: normalizedPath.replace(/^\/+/, '') || 'unknown',
			normalizedPath,
		}
	}
	return {
		folderPath: normalizedPath.slice(0, lastSlash) || '/',
		fileName: normalizedPath.slice(lastSlash + 1) || 'unknown',
		normalizedPath,
	}
}

/**
 * Clamp an integer cleanly within [min, max].
 *
 * @param {*} value Raw input.
 * @param {number} fallback Default value.
 * @param {number} min Minimum allowed.
 * @param {number} max Maximum allowed.
 * @return {number} Clamped integer.
 */
function clampInt(value, fallback, min, max) {
	const num = Number(value)
	if (!Number.isFinite(num)) {
		return fallback
	}
	const rounded = Math.round(num)
	return Math.max(min, Math.min(max, rounded))
}

/**
 * Compile a rule path regex safely with length and ReDoS guards.
 *
 * @param {string} pattern Regex pattern string.
 * @return {{ ok: boolean, regex: RegExp|null, error: string }} Compilation result.
 */
export function compileSafeRuleRegex(pattern) {
	const raw = typeof pattern === 'string' ? pattern.trim() : ''
	if (!raw) {
		return { ok: false, regex: null, error: 'Pattern must not be empty.' }
	}
	if (raw.length > MAX_PATTERN_LENGTH) {
		return { ok: false, regex: null, error: `Pattern exceeds ${MAX_PATTERN_LENGTH} characters.` }
	}
	if (NESTED_QUANTIFIER_RE.test(raw)) {
		return { ok: false, regex: null, error: 'Nested quantifiers are blocked for safety.' }
	}
	try {
		const regex = new RegExp(raw, 'i')
		return { ok: true, regex, error: '' }
	} catch (error) {
		return {
			ok: false,
			regex: null,
			error: error && error.message ? error.message : 'Invalid regular expression.',
		}
	}
}

/**
 * Parse a single 5-field cron token into a sorted set of matching integers.
 *
 * @param {string} token Cron field token.
 * @param {number} min Minimum value.
 * @param {number} max Maximum value.
 * @param {boolean} [isDayOfWeek=false] Map 7 -> 0 when true.
 * @return {{ ok: boolean, values: Set<number>, error: string }} Parsed set.
 */
function parseCronField(token, min, max, isDayOfWeek = false) {
	const raw = typeof token === 'string' ? token.trim() : ''
	if (!raw) {
		return { ok: false, values: new Set(), error: 'Empty cron field.' }
	}

	const values = new Set()
	const parts = raw.split(',')
	for (const part of parts) {
		const segment = part.trim()
		if (!segment) {
			return { ok: false, values: new Set(), error: `Invalid cron segment "${raw}".` }
		}

		const slashParts = segment.split('/')
		if (slashParts.length > 2) {
			return { ok: false, values: new Set(), error: `Invalid step syntax "${segment}".` }
		}

		const rangeExpr = slashParts[0]
		const step = slashParts.length === 2 ? Number(slashParts[1]) : 1
		if (!Number.isInteger(step) || step < 1 || step > max - min + 1) {
			return { ok: false, values: new Set(), error: `Invalid step value in "${segment}".` }
		}

		let start = min
		let end = max
		if (rangeExpr !== '*') {
			const dashParts = rangeExpr.split('-')
			if (dashParts.length === 1) {
				const num = Number(dashParts[0])
				if (!Number.isInteger(num) || num < min || num > (isDayOfWeek ? 7 : max)) {
					return { ok: false, values: new Set(), error: `Value out of range in "${segment}".` }
				}
				start = num
				end = slashParts.length === 2 ? max : num
			} else if (dashParts.length === 2) {
				start = Number(dashParts[0])
				end = Number(dashParts[1])
				const upperBound = isDayOfWeek ? 7 : max
				if (
					!Number.isInteger(start)
					|| !Number.isInteger(end)
					|| start < min
					|| end > upperBound
					|| start > end
				) {
					return { ok: false, values: new Set(), error: `Invalid range in "${segment}".` }
				}
			} else {
				return { ok: false, values: new Set(), error: `Invalid range syntax "${segment}".` }
			}
		}

		for (let v = start; v <= end; v += step) {
			values.add(isDayOfWeek && v === 7 ? 0 : v)
		}
	}

	if (values.size === 0) {
		return { ok: false, values: new Set(), error: `No values matched in "${raw}".` }
	}
	return { ok: true, values, error: '' }
}

/**
 * Parse and validate a standard 5-field cron expression (minute hour dom month dow).
 *
 * @param {string} expression Cron expression string.
 * @return {object} Parsed cron descriptor with validation status.
 */
export function parseCronExpression(expression) {
	const raw = typeof expression === 'string' ? expression.trim().replace(/\s+/g, ' ') : ''
	if (!raw) {
		return { valid: false, expression: '', error: 'Cron expression cannot be empty.', fields: null }
	}
	const parts = raw.split(' ')
	if (parts.length !== 5) {
		return {
			valid: false,
			expression: raw,
			error: 'Cron expression must have exactly 5 fields: minute hour day-of-month month day-of-week.',
			fields: null,
		}
	}

	const minute = parseCronField(parts[0], 0, 59, false)
	if (!minute.ok) {
		return { valid: false, expression: raw, error: `Minute field: ${minute.error}`, fields: null }
	}
	const hour = parseCronField(parts[1], 0, 23, false)
	if (!hour.ok) {
		return { valid: false, expression: raw, error: `Hour field: ${hour.error}`, fields: null }
	}
	const dom = parseCronField(parts[2], 1, 31, false)
	if (!dom.ok) {
		return { valid: false, expression: raw, error: `Day-of-month field: ${dom.error}`, fields: null }
	}
	const month = parseCronField(parts[3], 1, 12, false)
	if (!month.ok) {
		return { valid: false, expression: raw, error: `Month field: ${month.error}`, fields: null }
	}
	const dow = parseCronField(parts[4], 0, 6, true)
	if (!dow.ok) {
		return { valid: false, expression: raw, error: `Day-of-week field: ${dow.error}`, fields: null }
	}

	return {
		valid: true,
		expression: raw,
		error: '',
		fields: {
			minute: minute.values,
			hour: hour.values,
			dom: dom.values,
			month: month.values,
			dow: dow.values,
			domIsWildcard: parts[2].trim() === '*',
			dowIsWildcard: parts[4].trim() === '*',
		},
	}
}

/**
 * Check whether a UTC date matches the day-of-month / day-of-week cron semantics.
 *
 * @param {object} fields Parsed cron fields.
 * @param {number} dom Day of month (1..31).
 * @param {number} dow Day of week (0..6).
 * @return {boolean} True when day matches.
 */
function matchesCronDay(fields, dom, dow) {
	const domMatch = fields.dom.has(dom)
	const dowMatch = fields.dow.has(dow)
	if (!fields.domIsWildcard && !fields.dowIsWildcard) {
		return domMatch || dowMatch
	}
	return domMatch && dowMatch
}

/**
 * Predict the next N UTC execution timestamps for a 5-field cron expression.
 * Uses calendar-aware stepping (day -> hour -> minute) to stay fast for sparse schedules.
 *
 * @param {string} expression 5-field cron expression.
 * @param {number} [count=5] Number of future timestamps to compute.
 * @param {number} [referenceNowMs=Date.now()] Baseline timestamp in ms.
 * @return {{ valid: boolean, error: string, runs: Array<{ index: number, timestampMs: number, iso: string }> }} Prediction result.
 */
export function computeNextCronRuns(expression, count = 5, referenceNowMs = Date.now()) {
	const parsed = parseCronExpression(expression)
	if (!parsed.valid || !parsed.fields) {
		return {
			valid: false,
			error: parsed.error,
			runs: [],
		}
	}

	const targetCount = clampInt(count, 5, 1, 24)
	const baseMs = Number.isFinite(Number(referenceNowMs)) ? Number(referenceNowMs) : Date.now()
	// Start at the next whole UTC minute.
	const startDate = new Date(Math.floor(baseMs / 60000) * 60000 + 60000)
	const fields = parsed.fields
	const sortedMinutes = Array.from(fields.minute).sort((a, b) => a - b)
	const sortedHours = Array.from(fields.hour).sort((a, b) => a - b)

	const runs = []
	const cursor = new Date(Date.UTC(
		startDate.getUTCFullYear(),
		startDate.getUTCMonth(),
		startDate.getUTCDate(),
		0,
		0,
		0,
		0
	))

	const minThresholdMs = startDate.getTime()
	const maxDaysSearch = 400

	for (let dayOffset = 0; dayOffset < maxDaysSearch && runs.length < targetCount; dayOffset += 1) {
		const year = cursor.getUTCFullYear()
		const month = cursor.getUTCMonth() + 1
		const dom = cursor.getUTCDate()
		const dow = cursor.getUTCDay()

		if (fields.month.has(month) && matchesCronDay(fields, dom, dow)) {
			for (const hour of sortedHours) {
				for (const minute of sortedMinutes) {
					const ts = Date.UTC(year, month - 1, dom, hour, minute, 0, 0)
					if (ts >= minThresholdMs) {
						runs.push({
							index: runs.length + 1,
							timestampMs: ts,
							iso: new Date(ts).toISOString(),
						})
						if (runs.length >= targetCount) {
							break
						}
					}
				}
				if (runs.length >= targetCount) {
					break
				}
			}
		}

		cursor.setUTCDate(cursor.getUTCDate() + 1)
	}

	return {
		valid: true,
		error: '',
		runs,
	}
}

/**
 * Estimate average interval in days between scheduled runs for horizon aging projection.
 *
 * @param {string} expression Cron expression.
 * @param {number} [referenceNowMs=Date.now()] Baseline timestamp.
 * @return {number} Estimated interval in days (>= 0.25).
 */
export function estimateCronIntervalDays(expression, referenceNowMs = Date.now()) {
	const prediction = computeNextCronRuns(expression, 4, referenceNowMs)
	if (!prediction.valid || prediction.runs.length < 2) {
		return 7
	}
	const first = prediction.runs[0].timestampMs
	const last = prediction.runs[prediction.runs.length - 1].timestampMs
	const avgMs = (last - first) / (prediction.runs.length - 1)
	const days = avgMs / MS_PER_DAY
	return Math.max(0.25, Math.round(days * 100) / 100)
}

/**
 * Build a deep-cloned rulebook object from a preset id.
 *
 * @param {string} [presetId='conservative-ops'] Preset identifier.
 * @return {object} Normalized rulebook configuration.
 */
export function createRulebookFromPreset(presetId = 'conservative-ops') {
	const preset = RULEBOOK_PRESETS.find(item => item.id === presetId) || RULEBOOK_PRESETS[0]
	return normalizeRulebookConfig({
		presetId: preset.id,
		cronExpression: preset.cronExpression,
		horizonCycles: preset.horizonCycles,
		safeguards: { ...preset.safeguards },
		rules: preset.rules.map(rule => ({ ...rule })),
	})
}

/**
 * Normalize and sanitize a rule entry.
 *
 * @param {object} rawRule Raw rule object.
 * @param {number} index Rule index.
 * @return {object} Sanitized rule object.
 */
export function normalizeRuleEntry(rawRule, index = 0) {
	const source = rawRule && typeof rawRule === 'object' ? rawRule : {}
	const idRaw = typeof source.id === 'string' && source.id.trim()
		? source.id.trim()
		: `custom-rule-${index + 1}`
	const nameRaw = typeof source.name === 'string' && source.name.trim()
		? stripControlChars(source.name.trim())
		: `Rule ${index + 1}`
	const actionMode = ACTION_MODES.includes(source.actionMode) ? source.actionMode : 'quarantine-stage'
	const keepStrategy = KEEP_STRATEGIES.includes(source.keepStrategy) ? source.keepStrategy : 'origin-first'
	const pathRegex = typeof source.pathRegex === 'string' && source.pathRegex.trim()
		? source.pathRegex.trim().slice(0, MAX_PATTERN_LENGTH)
		: '.*'
	const minAgeDays = clampInt(source.minAgeDays, 14, 0, MAX_GRACE_PERIOD_DAYS)
	const minSizeBytes = clampInt(source.minSizeBytes, 0, 0, 1024 * 1024 * 1024 * 10)

	return {
		id: idRaw,
		name: nameRaw,
		enabled: source.enabled !== false,
		actionMode,
		pathRegex,
		minAgeDays,
		minSizeBytes,
		keepStrategy,
	}
}

/**
 * Normalize a full automation rulebook configuration with safe bounds.
 *
 * @param {object|null|undefined} rawConfig Raw rulebook config.
 * @return {object} Normalized rulebook configuration.
 */
export function normalizeRulebookConfig(rawConfig) {
	const fallback = RULEBOOK_PRESETS[0]
	const cfg = rawConfig && typeof rawConfig === 'object' ? rawConfig : {}
	const rawSafeguards = cfg.safeguards && typeof cfg.safeguards === 'object' ? cfg.safeguards : {}
	const rawRules = Array.isArray(cfg.rules) ? cfg.rules : fallback.rules

	const rules = rawRules
		.slice(0, MAX_RULEBOOK_RULES)
		.map((rule, idx) => normalizeRuleEntry(rule, idx))

	const horizonRaw = Number(cfg.horizonCycles)
	const horizonCycles = HORIZON_CYCLE_OPTIONS.includes(horizonRaw) ? horizonRaw : 6

	return {
		schema: AUTOMATION_RULEBOOK_SCHEMA,
		presetId: typeof cfg.presetId === 'string' && cfg.presetId.trim() ? cfg.presetId.trim() : fallback.id,
		cronExpression: typeof cfg.cronExpression === 'string' && cfg.cronExpression.trim()
			? cfg.cronExpression.trim().replace(/\s+/g, ' ')
			: fallback.cronExpression,
		horizonCycles,
		safeguards: {
			blastRadiusCap: clampInt(rawSafeguards.blastRadiusCap, 50, 1, MAX_BLAST_RADIUS_CAP),
			gracePeriodDays: clampInt(rawSafeguards.gracePeriodDays, 14, 0, MAX_GRACE_PERIOD_DAYS),
			protectOriginFolders: rawSafeguards.protectOriginFolders !== false,
			protectSharedMounts: rawSafeguards.protectSharedMounts !== false,
			requireLastCopyGuard: rawSafeguards.requireLastCopyGuard !== false,
			conflictMode: CONFLICT_MODES.includes(rawSafeguards.conflictMode)
				? rawSafeguards.conflictMode
				: 'strictest-safeguard',
		},
		rules,
	}
}

/**
 * Load persisted automation rulebook from localStorage safely.
 *
 * @param {Storage|null} [storageOverride=null] Optional Storage implementation.
 * @return {object} Normalized rulebook.
 */
export function loadAutomationRulebook(storageOverride = null) {
	const storage = storageOverride || (typeof window !== 'undefined' && window.localStorage ? window.localStorage : null)
	if (!storage || typeof storage.getItem !== 'function') {
		return createRulebookFromPreset('conservative-ops')
	}
	try {
		const raw = storage.getItem(AUTOMATION_RULEBOOK_STORAGE_KEY)
		if (!raw) {
			return createRulebookFromPreset('conservative-ops')
		}
		const parsed = JSON.parse(raw)
		return normalizeRulebookConfig(parsed)
	} catch {
		return createRulebookFromPreset('conservative-ops')
	}
}

/**
 * Save automation rulebook to localStorage safely.
 *
 * @param {object} rulebook Rulebook config.
 * @param {Storage|null} [storageOverride=null] Optional Storage implementation.
 * @return {boolean} True when persisted.
 */
export function saveAutomationRulebook(rulebook, storageOverride = null) {
	const storage = storageOverride || (typeof window !== 'undefined' && window.localStorage ? window.localStorage : null)
	if (!storage || typeof storage.setItem !== 'function') {
		return false
	}
	try {
		const normalized = normalizeRulebookConfig(rulebook)
		storage.setItem(AUTOMATION_RULEBOOK_STORAGE_KEY, JSON.stringify(normalized))
		return true
	} catch {
		return false
	}
}

/**
 * Parse and validate an imported JSON rulebook string.
 *
 * @param {string} jsonText Raw JSON string.
 * @return {{ ok: boolean, rulebook: object|null, error: string }} Parse result.
 */
export function parseRulebookConfigJson(jsonText) {
	if (typeof jsonText !== 'string' || !jsonText.trim()) {
		return { ok: false, rulebook: null, error: 'Rulebook JSON input is empty.' }
	}
	try {
		const parsed = JSON.parse(jsonText)
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			return { ok: false, rulebook: null, error: 'Rulebook JSON must be an object.' }
		}
		const candidate = parsed.rulebook && typeof parsed.rulebook === 'object' ? parsed.rulebook : parsed
		if (!Array.isArray(candidate.rules) || candidate.rules.length === 0) {
			return { ok: false, rulebook: null, error: 'Rulebook JSON must define at least one rule in rules[].' }
		}
		return {
			ok: true,
			rulebook: normalizeRulebookConfig(candidate),
			error: '',
		}
	} catch (error) {
		return {
			ok: false,
			rulebook: null,
			error: error && error.message ? error.message : 'Invalid JSON syntax.',
		}
	}
}

/**
 * Determine whether a file looks shared or resides on an external mount.
 *
 * @param {object} file Duplicate file entry.
 * @return {boolean} True when shared or external mount protected.
 */
function isSharedOrExternalMount(file) {
	if (!file || typeof file !== 'object') {
		return false
	}
	if (file.isShared === true || file.shared === true || file.hasShare === true || file.isExternalMount === true) {
		return true
	}
	if (Array.isArray(file.shares) && file.shares.length > 0) {
		return true
	}
	const path = normalizePathForDiff(file.path || '')
	return SHARED_MOUNT_PATH_RE.test(path)
}

/**
 * Elect the canonical survivor copy within a duplicate group for a given keep strategy.
 *
 * @param {Array<object>} files Duplicate files in group.
 * @param {string} keepStrategy Strategy identifier.
 * @return {object|null} Survivor file entry.
 */
export function chooseSurvivorForRule(files, keepStrategy = 'origin-first') {
	if (!Array.isArray(files) || files.length === 0) {
		return null
	}
	const valid = files.filter(Boolean)
	if (valid.length === 0) {
		return null
	}

	const sorted = [...valid].sort((a, b) => {
		if (keepStrategy === 'origin-first') {
			const aOrigin = a.isInOriginFolder ? 1 : 0
			const bOrigin = b.isInOriginFolder ? 1 : 0
			if (aOrigin !== bOrigin) {
				return bOrigin - aOrigin
			}
		}

		const aTime = resolveFileTimestampMs(a)
		const bTime = resolveFileTimestampMs(b)
		if (keepStrategy === 'oldest') {
			if (aTime !== null && bTime !== null && aTime !== bTime) {
				return aTime - bTime
			}
		} else if (keepStrategy === 'newest') {
			if (aTime !== null && bTime !== null && aTime !== bTime) {
				return bTime - aTime
			}
		} else if (keepStrategy === 'shortest-path') {
			const aPath = normalizePathForDiff(a.path || '')
			const bPath = normalizePathForDiff(b.path || '')
			if (aPath.length !== bPath.length) {
				return aPath.length - bPath.length
			}
		}

		if (aTime !== null && bTime !== null && aTime !== bTime) {
			return aTime - bTime
		}
		return normalizePathForDiff(a.path || '').localeCompare(normalizePathForDiff(b.path || ''))
	})

	return sorted[0] || null
}

/**
 * Select the winning rule among multiple matching rules according to conflict resolution mode.
 *
 * @param {Array<object>} matchingRules Rules that matched the file in the current cycle.
 * @param {string} conflictMode Conflict resolution mode.
 * @return {object|null} Winning rule.
 */
function pickWinningRule(matchingRules, conflictMode) {
	if (!Array.isArray(matchingRules) || matchingRules.length === 0) {
		return null
	}
	if (conflictMode !== 'strictest-safeguard' || matchingRules.length === 1) {
		return matchingRules[0]
	}
	const modeConservatism = {
		'quarantine-stage': 3,
		'link-replace': 2,
		'trashbin-prune': 1,
	}
	const sorted = [...matchingRules].sort((a, b) => {
		const modeDiff = (modeConservatism[b.actionMode] || 0) - (modeConservatism[a.actionMode] || 0)
		if (modeDiff !== 0) {
			return modeDiff
		}
		if (b.minAgeDays !== a.minAgeDays) {
			return b.minAgeDays - a.minAgeDays
		}
		return a.priorityIndex - b.priorityIndex
	})
	return sorted[0]
}

/**
 * Run a deterministic multi-cycle policy simulation across duplicate groups.
 *
 * @param {Array<object>} duplicates Duplicate groups to evaluate.
 * @param {object} rawRulebook Automation rulebook config.
 * @param {object} [options={}] Simulation options.
 * @param {number} [options.nowMs=Date.now()] Reference timestamp in ms.
 * @param {string} [options.searchQuery=''] Filter query on path/rule/group hash.
 * @param {string} [options.filterMode='all'] Filter mode.
 * @param {string} [options.sortBy='reclaim_desc'] Sort mode.
 * @return {object} Complete deterministic simulation report.
 */
export function simulateRulebookPolicy(duplicates, rawRulebook, options = {}) {
	const rulebook = normalizeRulebookConfig(rawRulebook)
	const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now()
	const searchQuery = typeof options.searchQuery === 'string' ? options.searchQuery.trim().toLowerCase() : ''
	const filterMode = SIMULATION_FILTER_MODES.includes(options.filterMode) ? options.filterMode : 'all'
	const sortBy = SIMULATION_SORT_MODES.includes(options.sortBy) ? options.sortBy : 'reclaim_desc'

	const cronPrediction = computeNextCronRuns(rulebook.cronExpression, rulebook.horizonCycles, nowMs)
	const intervalDays = estimateCronIntervalDays(rulebook.cronExpression, nowMs)

	const compiledRules = rulebook.rules.map((rule, idx) => {
		const compiled = compileSafeRuleRegex(rule.pathRegex)
		return {
			...rule,
			priorityIndex: idx,
			regex: compiled.regex,
			regexValid: compiled.ok,
			regexError: compiled.error,
		}
	})
	const enabledRules = compiledRules.filter(rule => rule.enabled && rule.regexValid)

	const sourceGroups = Array.isArray(duplicates) ? duplicates.filter(Boolean) : []
	const candidates = []
	const groupRemainingCounts = new Map()
	const eligibleGroupsSet = new Set()

	for (let gIdx = 0; gIdx < sourceGroups.length; gIdx += 1) {
		const group = sourceGroups[gIdx]
		const files = Array.isArray(group.files) ? group.files.filter(Boolean) : []
		if (files.length < 2) {
			continue
		}
		const groupKey = group.id !== undefined && group.id !== null ? String(group.id) : `group-${gIdx}`
		groupRemainingCounts.set(groupKey, files.length)

		const defaultSurvivor = chooseSurvivorForRule(files, 'origin-first')
		const defaultSurvivorKey = getFileSelectionKey(defaultSurvivor)

		for (let fIdx = 0; fIdx < files.length; fIdx += 1) {
			const file = files[fIdx]
			const selectionKey = getFileSelectionKey(file) || `${groupKey}:${fIdx}`
			const { folderPath, fileName, normalizedPath } = splitPath(file.path || '')
			const size = Math.max(0, Number(file.size) || 0)
			const mtimeMs = resolveFileTimestampMs(file)
			const baseAgeDays = mtimeMs !== null ? Math.max(0, (nowMs - mtimeMs) / MS_PER_DAY) : null

			candidates.push({
				group,
				groupKey,
				groupId: group.id ?? null,
				groupHash: typeof group.hash === 'string' ? group.hash : '',
				filesInGroup: files,
				defaultSurvivorPath: defaultSurvivor ? normalizePathForDiff(defaultSurvivor.path || '') : '',
				isDefaultSurvivor: selectionKey === defaultSurvivorKey,
				file,
				selectionKey,
				path: normalizedPath,
				folderPath,
				fileName,
				size,
				mtimeMs,
				modifiedFormatted: formatFileModifiedTime(file),
				baseAgeDays,
				isOrigin: Boolean(file.isInOriginFolder),
				isSharedMount: isSharedOrExternalMount(file),
			})
		}
	}

	const actedKeys = new Set()
	const simulatedRecords = new Map()
	const cycles = []
	let cumulativeBytes = 0
	let blastRadiusCapsTriggered = 0

	const ruleStats = new Map(compiledRules.map(rule => [
		rule.id,
		{
			ruleId: rule.id,
			ruleName: rule.name,
			actionMode: rule.actionMode,
			enabled: rule.enabled,
			regexValid: rule.regexValid,
			regexError: rule.regexError,
			cycle1Matches: 0,
			horizonMatches: 0,
			horizonBytes: 0,
		},
	]))

	for (let cycle = 1; cycle <= rulebook.horizonCycles; cycle += 1) {
		const ageBoostDays = (cycle - 1) * intervalDays
		const scheduledRun = cronPrediction.runs[cycle - 1]
		const scheduledAtIso = scheduledRun
			? scheduledRun.iso
			: new Date(nowMs + Math.round(cycle * intervalDays * MS_PER_DAY)).toISOString()

		// Collect eligible candidates for this cycle, sorted by size desc then age desc for deterministic cap prioritization.
		const cycleEligible = []

		for (const candidate of candidates) {
			if (actedKeys.has(candidate.selectionKey)) {
				continue
			}

			if (rulebook.safeguards.requireLastCopyGuard) {
				const remaining = groupRemainingCounts.get(candidate.groupKey) || 0
				if (remaining <= 1) {
					continue
				}
			}

			if (rulebook.safeguards.protectOriginFolders && candidate.isOrigin) {
				continue
			}

			if (rulebook.safeguards.protectSharedMounts && candidate.isSharedMount) {
				continue
			}

			const effectiveAge = candidate.baseAgeDays !== null ? candidate.baseAgeDays + ageBoostDays : null
			if (rulebook.safeguards.gracePeriodDays > 0) {
				if (effectiveAge === null || effectiveAge < rulebook.safeguards.gracePeriodDays) {
					continue
				}
			}

			const matchingRules = []
			for (const rule of enabledRules) {
				const survivorForRule = chooseSurvivorForRule(candidate.filesInGroup, rule.keepStrategy)
				const survivorKey = getFileSelectionKey(survivorForRule)
				if (survivorKey === candidate.selectionKey) {
					continue
				}
				if (candidate.size < rule.minSizeBytes) {
					continue
				}
				if (rule.minAgeDays > 0 && (effectiveAge === null || effectiveAge < rule.minAgeDays)) {
					continue
				}
				if (rule.regex && rule.regex.test(candidate.path)) {
					matchingRules.push({
						...rule,
						survivorPath: survivorForRule ? normalizePathForDiff(survivorForRule.path || '') : candidate.defaultSurvivorPath,
					})
				}
			}

			if (matchingRules.length === 0) {
				continue
			}

			const winner = pickWinningRule(matchingRules, rulebook.safeguards.conflictMode)
			cycleEligible.push({
				candidate,
				winner,
				effectiveAge,
			})
		}

		cycleEligible.sort((a, b) => {
			if (b.candidate.size !== a.candidate.size) {
				return b.candidate.size - a.candidate.size
			}
			if (a.winner.priorityIndex !== b.winner.priorityIndex) {
				return a.winner.priorityIndex - b.winner.priorityIndex
			}
			return a.candidate.path.localeCompare(b.candidate.path)
		})

		let cycleActedCount = 0
		let cycleReclaimBytes = 0
		let capReached = false

		for (const entry of cycleEligible) {
			const { candidate, winner } = entry
			if (cycleActedCount >= rulebook.safeguards.blastRadiusCap) {
				capReached = true
				break
			}

			if (rulebook.safeguards.requireLastCopyGuard) {
				const remaining = groupRemainingCounts.get(candidate.groupKey) || 0
				if (remaining <= 1) {
					continue
				}
				groupRemainingCounts.set(candidate.groupKey, remaining - 1)
			}

			actedKeys.add(candidate.selectionKey)
			eligibleGroupsSet.add(candidate.groupKey)
			cycleActedCount += 1
			cycleReclaimBytes += candidate.size

			const rStat = ruleStats.get(winner.id)
			if (rStat) {
				if (cycle === 1) {
					rStat.cycle1Matches += 1
				}
				rStat.horizonMatches += 1
				rStat.horizonBytes += candidate.size
			}

			simulatedRecords.set(candidate.selectionKey, {
				selectionKey: candidate.selectionKey,
				groupId: candidate.groupId,
				groupHash: candidate.groupHash,
				duplicate: candidate.group,
				file: candidate.file,
				fileName: candidate.fileName,
				path: candidate.path,
				folderPath: candidate.folderPath,
				size: candidate.size,
				sizeFormatted: formatBytes(candidate.size),
				baseAgeDays: candidate.baseAgeDays !== null ? Math.round(candidate.baseAgeDays) : null,
				modifiedFormatted: candidate.modifiedFormatted,
				status: cycle === 1 ? 'cycle-1' : 'future-cycle',
				scheduledCycle: cycle,
				scheduledAtIso,
				matchedRuleId: winner.id,
				matchedRuleName: winner.name,
				priorityIndex: winner.priorityIndex,
				actionMode: winner.actionMode,
				actionModeLabel: ACTION_MODE_LABELS[winner.actionMode] || winner.actionMode,
				blockedReason: '',
				blockedReasonLabel: '',
				survivorPath: winner.survivorPath || candidate.defaultSurvivorPath,
			})
		}

		if (capReached) {
			blastRadiusCapsTriggered += 1
		}
		cumulativeBytes += cycleReclaimBytes
		cycles.push({
			cycle,
			label: `Cycle ${cycle}`,
			scheduledAtIso,
			actedCount: cycleActedCount,
			reclaimBytes: cycleReclaimBytes,
			reclaimBytesFormatted: formatBytes(cycleReclaimBytes),
			cumulativeBytes,
			cumulativeBytesFormatted: formatBytes(cumulativeBytes),
			capReached,
		})
	}

	// Classify unacted candidates (either blocked by safeguards, deferred past horizon by cap, or unmatched).
	const guardrailCounts = new Map()
	const recordGuardrail = (reason, size) => {
		const current = guardrailCounts.get(reason) || {
			reason,
			label: BLOCKED_REASON_LABELS[reason] || reason,
			count: 0,
			bytes: 0,
		}
		current.count += 1
		current.bytes += size
		guardrailCounts.set(reason, current)
	}

	for (const candidate of candidates) {
		if (simulatedRecords.has(candidate.selectionKey)) {
			continue
		}

		let blockedReason = ''
		if (rulebook.safeguards.protectOriginFolders && candidate.isOrigin) {
			blockedReason = 'origin_protected'
		} else if (rulebook.safeguards.protectSharedMounts && candidate.isSharedMount) {
			blockedReason = 'share_mount_protected'
		} else if (candidate.isDefaultSurvivor && rulebook.safeguards.requireLastCopyGuard) {
			blockedReason = 'last_copy_guard'
		} else if (rulebook.safeguards.gracePeriodDays > 0 && candidate.baseAgeDays === null) {
			blockedReason = 'unknown_age_grace'
		} else if (
			rulebook.safeguards.gracePeriodDays > 0
			&& candidate.baseAgeDays !== null
			&& candidate.baseAgeDays + (rulebook.horizonCycles - 1) * intervalDays < rulebook.safeguards.gracePeriodDays
		) {
			blockedReason = 'grace_period'
		} else {
			const maxAge = candidate.baseAgeDays !== null
				? candidate.baseAgeDays + (rulebook.horizonCycles - 1) * intervalDays
				: null
			const wouldMatchAnyRule = enabledRules.some(rule => {
				const survivorForRule = chooseSurvivorForRule(candidate.filesInGroup, rule.keepStrategy)
				if (getFileSelectionKey(survivorForRule) === candidate.selectionKey) {
					return false
				}
				if (candidate.size < rule.minSizeBytes) {
					return false
				}
				if (rule.minAgeDays > 0 && (maxAge === null || maxAge < rule.minAgeDays)) {
					return false
				}
				return Boolean(rule.regex && rule.regex.test(candidate.path))
			})

			if (wouldMatchAnyRule) {
				blockedReason = (groupRemainingCounts.get(candidate.groupKey) || 0) <= 1
					? 'last_copy_guard'
					: 'blast_radius_cap'
			}
		}

		if (blockedReason) {
			recordGuardrail(blockedReason, candidate.size)
			simulatedRecords.set(candidate.selectionKey, {
				selectionKey: candidate.selectionKey,
				groupId: candidate.groupId,
				groupHash: candidate.groupHash,
				duplicate: candidate.group,
				file: candidate.file,
				fileName: candidate.fileName,
				path: candidate.path,
				folderPath: candidate.folderPath,
				size: candidate.size,
				sizeFormatted: formatBytes(candidate.size),
				baseAgeDays: candidate.baseAgeDays !== null ? Math.round(candidate.baseAgeDays) : null,
				modifiedFormatted: candidate.modifiedFormatted,
				status: 'blocked',
				scheduledCycle: null,
				scheduledAtIso: '',
				matchedRuleId: '',
				matchedRuleName: '',
				priorityIndex: 999,
				actionMode: '',
				actionModeLabel: 'Blocked',
				blockedReason,
				blockedReasonLabel: BLOCKED_REASON_LABELS[blockedReason] || blockedReason,
				survivorPath: candidate.defaultSurvivorPath,
			})
		}
	}

	const allItems = Array.from(simulatedRecords.values())
	const actedItems = allItems.filter(item => item.status !== 'blocked')
	const cycle1Items = allItems.filter(item => item.status === 'cycle-1')
	const blockedItems = allItems.filter(item => item.status === 'blocked')

	const cycle1ReclaimBytes = cycle1Items.reduce((sum, item) => sum + item.size, 0)
	const horizonReclaimBytes = actedItems.reduce((sum, item) => sum + item.size, 0)
	const blockedBytes = blockedItems.reduce((sum, item) => sum + item.size, 0)

	const filteredItems = allItems.filter(item => {
		if (filterMode === 'cycle-1' && item.status !== 'cycle-1') {
			return false
		}
		if (filterMode === 'future-cycle' && item.status !== 'future-cycle') {
			return false
		}
		if (filterMode === 'blocked' && item.status !== 'blocked') {
			return false
		}
		if (ACTION_MODES.includes(filterMode) && item.actionMode !== filterMode) {
			return false
		}
		if (searchQuery) {
			const haystack = [
				item.path,
				item.fileName,
				item.matchedRuleName,
				item.blockedReasonLabel,
				item.groupHash,
			].join(' ').toLowerCase()
			if (!haystack.includes(searchQuery)) {
				return false
			}
		}
		return true
	})

	filteredItems.sort((a, b) => {
		if (sortBy === 'cycle_asc') {
			const aCycle = a.scheduledCycle ?? 999
			const bCycle = b.scheduledCycle ?? 999
			if (aCycle !== bCycle) {
				return aCycle - bCycle
			}
			return b.size - a.size
		}
		if (sortBy === 'age_desc') {
			const aAge = a.baseAgeDays ?? -1
			const bAge = b.baseAgeDays ?? -1
			if (aAge !== bAge) {
				return bAge - aAge
			}
			return b.size - a.size
		}
		if (sortBy === 'priority_asc') {
			if (a.priorityIndex !== b.priorityIndex) {
				return a.priorityIndex - b.priorityIndex
			}
			return b.size - a.size
		}
		if (sortBy === 'name_asc') {
			return a.fileName.localeCompare(b.fileName)
		}
		// Default reclaim_desc: actionable items first, then largest size.
		const aBlocked = a.status === 'blocked' ? 1 : 0
		const bBlocked = b.status === 'blocked' ? 1 : 0
		if (aBlocked !== bBlocked) {
			return aBlocked - bBlocked
		}
		if (b.size !== a.size) {
			return b.size - a.size
		}
		return a.path.localeCompare(b.path)
	})

	const guardrailBreakdown = Array.from(guardrailCounts.values())
		.map(entry => ({
			...entry,
			bytesFormatted: formatBytes(entry.bytes),
		}))
		.sort((a, b) => b.count - a.count)

	const ruleBreakdown = Array.from(ruleStats.values()).map(entry => ({
		...entry,
		actionModeLabel: ACTION_MODE_LABELS[entry.actionMode] || entry.actionMode,
		horizonBytesFormatted: formatBytes(entry.horizonBytes),
	}))

	return {
		schema: AUTOMATION_RULEBOOK_SCHEMA,
		generatedAt: new Date(nowMs).toISOString(),
		cronValidation: {
			valid: cronPrediction.valid,
			error: cronPrediction.error,
			expression: rulebook.cronExpression,
			intervalDays,
			nextRuns: cronPrediction.runs,
		},
		summary: {
			totalGroupsEvaluated: sourceGroups.length,
			eligibleGroupsCount: eligibleGroupsSet.size,
			cycle1ActedCount: cycle1Items.length,
			cycle1ReclaimBytes,
			cycle1ReclaimFormatted: formatBytes(cycle1ReclaimBytes),
			horizonCycles: rulebook.horizonCycles,
			horizonActedCount: actedItems.length,
			horizonReclaimBytes,
			horizonReclaimFormatted: formatBytes(horizonReclaimBytes),
			blockedCount: blockedItems.length,
			blockedBytes,
			blockedBytesFormatted: formatBytes(blockedBytes),
			blastRadiusCapsTriggered,
			quarantineCount: actedItems.filter(item => item.actionMode === 'quarantine-stage').length,
			trashbinCount: actedItems.filter(item => item.actionMode === 'trashbin-prune').length,
			linkReplaceCount: actedItems.filter(item => item.actionMode === 'link-replace').length,
		},
		cycles,
		ruleBreakdown,
		guardrailBreakdown,
		items: filteredItems,
		cycle1Items,
	}
}

/**
 * Generate a POSIX-safe Nextcloud OCC & Cron/Systemd Automation Runbook.
 *
 * @param {object} report Simulation report from simulateRulebookPolicy.
 * @param {object} rulebook Normalized rulebook config.
 * @return {string} Shell runbook text.
 */
export function generateNextcloudOccRunbook(report, rulebook) {
	const cfg = normalizeRulebookConfig(rulebook)
	const summary = report && report.summary ? report.summary : {}
	const cycle1Items = report && Array.isArray(report.cycle1Items) ? report.cycle1Items : []
	const cronExpr = cfg.cronExpression

	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# Nextcloud DuplicateFinder Zero-Touch Automation Runbook',
		`# Schema: ${AUTOMATION_RULEBOOK_SCHEMA}`,
		`# Preset: ${stripControlChars(cfg.presetId)}`,
		`# Schedule (UTC): ${stripControlChars(cronExpr)}`,
		`# Cycle 1 Projected Actions: ${summary.cycle1ActedCount || 0} files (${summary.cycle1ReclaimFormatted || '0 B'})`,
		`# Safeguards: blastRadiusCap=${cfg.safeguards.blastRadiusCap}, gracePeriodDays=${cfg.safeguards.gracePeriodDays}, protectOrigin=${cfg.safeguards.protectOriginFolders}`,
		'',
		'NEXTCLOUD_ROOT="$' + '{NEXTCLOUD_ROOT:-/var/www/nextcloud}"',
		'PHP_BIN="$' + '{PHP_BIN:-php}"',
		'OCC_USER="$' + '{OCC_USER:-www-data}"',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'',
		'# 1) Crontab entry for Nextcloud scheduled scan & trashbin retention:',
		`# ${stripControlChars(cronExpr)} su -s /bin/bash "$OCC_USER" -c "cd $NEXTCLOUD_ROOT && $PHP_BIN occ duplicatefinder:find && $PHP_BIN occ trashbin:cleanup --all-users"`,
		'',
		'run_occ() {',
		'  if [[ "$DRY_RUN" == "1" ]]; then',
		'    printf "[DRY-RUN] %s\\n" "$*"',
		'  else',
		'    su -s /bin/bash "$OCC_USER" -c "cd $(printf %q "$NEXTCLOUD_ROOT") && $PHP_BIN occ $*"',
		'  fi',
		'}',
		'',
		'run_occ "duplicatefinder:find"',
		'run_occ "files:scan --all"',
		'',
		'# 2) Cycle 1 policy-matched targets (canonical survivor preserved for every group):',
	]

	if (cycle1Items.length === 0) {
		lines.push('# (No Cycle 1 targets matched current rulebook and safeguards)')
	} else {
		for (const item of cycle1Items) {
			lines.push(
				`# [${stripControlChars(item.actionMode)}] rule=${quotePosixShellArg(item.matchedRuleName)} size=${quotePosixShellArg(item.sizeFormatted)} target=${quotePosixShellArg(item.path)} keep=${quotePosixShellArg(item.survivorPath)}`
			)
		}
	}

	lines.push('')
	lines.push('if [[ "$DRY_RUN" == "1" ]]; then')
	lines.push('  echo "Dry-run complete. Re-run with DRY_RUN=0 to execute OCC maintenance commands."')
	lines.push('fi')
	lines.push('')

	return lines.join('\n')
}

/**
 * Generate a reversible Quarantine & Rollback bash script for Cycle 1 targets.
 * Defaults to DRY_RUN=1 and emits a restore-rollback.sh manifest alongside quarantined files.
 *
 * @param {object} report Simulation report from simulateRulebookPolicy.
 * @param {object} rulebook Normalized rulebook config.
 * @return {string} POSIX bash script with reversible rollback generation.
 */
export function generateRollbackQuarantineScript(report, rulebook) {
	const cfg = normalizeRulebookConfig(rulebook)
	const cycle1Items = report && Array.isArray(report.cycle1Items) ? report.cycle1Items : []

	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# Nextcloud DuplicateFinder Reversible Quarantine & Rollback Script',
		`# Schema: ${AUTOMATION_RULEBOOK_SCHEMA}`,
		`# Blast-Radius Cap: ${cfg.safeguards.blastRadiusCap} files`,
		'# Defaults to DRY_RUN=1. Run with DRY_RUN=0 DATA_ROOT=/var/ncdata bash script.sh',
		'',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'DATA_ROOT="$' + '{DATA_ROOT:-/var/www/nextcloud/data}"',
		'STAMP="$(date -u +%Y%m%dT%H%M%SZ)"',
		'QUARANTINE_DIR="$' + '{QUARANTINE_DIR:-$' + '{DATA_ROOT}/.duplicatefinder-quarantine/$' + '{STAMP}}"',
		'ROLLBACK_SCRIPT="$' + '{QUARANTINE_DIR}/restore-rollback.sh"',
		'',
		'if [[ "$DRY_RUN" != "1" ]]; then',
		'  mkdir -p "$QUARANTINE_DIR"',
		'  cat > "$ROLLBACK_SCRIPT" <<\'EOF_HEADER\'',
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'EOF_HEADER',
		'  chmod 0700 "$ROLLBACK_SCRIPT"',
		'fi',
		'',
		'stage_file() {',
		'  local rel_path="$1"',
		'  local mode="$2"',
		'  local src="$' + '{DATA_ROOT%/}/$' + '{rel_path#/}"',
		'  local dst="$' + '{QUARANTINE_DIR}/$' + '{rel_path#/}"',
		'  if [[ "$DRY_RUN" == "1" ]]; then',
		'    printf "[DRY-RUN][%s] %s -> %s\\n" "$mode" "$src" "$dst"',
		'    return 0',
		'  fi',
		'  if [[ ! -e "$src" ]]; then',
		'    printf "[SKIP-MISSING] %s\\n" "$src" >&2',
		'    return 0',
		'  fi',
		'  mkdir -p "$(dirname "$dst")"',
		'  mv -n -- "$src" "$dst"',
		'  printf "mkdir -p %q && mv -n -- %q %q\\n" "$(dirname "$src")" "$dst" "$src" >> "$ROLLBACK_SCRIPT"',
		'}',
		'',
	]

	if (cycle1Items.length === 0) {
		lines.push('echo "No Cycle 1 targets to quarantine."')
	} else {
		for (const item of cycle1Items) {
			lines.push(`# Keep survivor: ${quotePosixShellArg(item.survivorPath)}`)
			lines.push(`stage_file ${quotePosixShellArg(item.path)} ${quotePosixShellArg(item.actionMode)}`)
		}
	}

	lines.push('')
	lines.push('if [[ "$DRY_RUN" == "1" ]]; then')
	lines.push('  echo "Dry-run complete. Re-run with DRY_RUN=0 DATA_ROOT=/path/to/data to stage files and generate restore-rollback.sh."')
	lines.push('else')
	lines.push('  echo "Quarantine complete. Rollback script written to: $ROLLBACK_SCRIPT"')
	lines.push('fi')
	lines.push('')

	return lines.join('\n')
}

/**
 * Export simulation results as a CWE-1236-safe RFC 4180 CSV string.
 *
 * @param {object} report Simulation report.
 * @return {string} CSV document.
 */
export function exportSimulationCsv(report) {
	const items = report && Array.isArray(report.items) ? report.items : []
	const headers = [
		'Status',
		'Scheduled Cycle',
		'Action Mode',
		'Rule Name',
		'Blocked Reason',
		'File Name',
		'Path',
		'Size Bytes',
		'Size Formatted',
		'Age Days',
		'Survivor Path',
		'Group Hash',
	]

	const rows = [headers.map(escapeCsvCell).join(',')]
	for (const item of items) {
		rows.push([
			item.status,
			item.scheduledCycle ?? '',
			item.actionModeLabel || '',
			item.matchedRuleName || '',
			item.blockedReasonLabel || '',
			item.fileName,
			item.path,
			item.size,
			item.sizeFormatted,
			item.baseAgeDays ?? '',
			item.survivorPath || '',
			item.groupHash || '',
		].map(escapeCsvCell).join(','))
	}
	return rows.join('\r\n')
}

/**
 * Export full rulebook configuration and simulation report as JSON.
 *
 * @param {object} report Simulation report.
 * @param {object} rulebook Normalized rulebook config.
 * @return {string} Formatted JSON payload.
 */
export function exportRulebookJson(report, rulebook) {
	const payload = {
		schema: AUTOMATION_RULEBOOK_SCHEMA,
		exportedAt: new Date().toISOString(),
		rulebook: normalizeRulebookConfig(rulebook),
		summary: report && report.summary ? report.summary : {},
		cycles: report && Array.isArray(report.cycles) ? report.cycles : [],
		ruleBreakdown: report && Array.isArray(report.ruleBreakdown) ? report.ruleBreakdown : [],
		guardrailBreakdown: report && Array.isArray(report.guardrailBreakdown) ? report.guardrailBreakdown : [],
	}
	return JSON.stringify(payload, null, 2)
}
