/**
 * Pure pre-deletion recovery safety audit, share-impact risk scoring,
 * JSON recovery manifest, CWE-1236 CSV audit, and POSIX-safe
 * `restore-from-trash.sh` script generator.
 */

import { formatBytes } from './duplicateStats'
import { normalizePathForDiff, formatFileModifiedTime } from './duplicatePathDiff'
import {
	KEEP_RULES,
	getFileSelectionKey,
	selectDuplicatesByKeepRule,
	escapeCsvCell,
} from './duplicateSelectionAndExport'

export const RECOVERY_MANIFEST_SCHEMA = 'duplicatefinder.recovery-manifest.v1'
export const DEFAULT_RECENT_WINDOW_DAYS = 7
export const RECENT_WINDOW_OPTIONS = Object.freeze([1, 3, 7, 14, 30])
export const RISK_TIERS = Object.freeze(['critical', 'high', 'medium', 'low'])

const SHARE_PATH_RULES = Object.freeze([
	{ pattern: /(?:^|\/)(?:shared|share)(?:\/|$)/i, label: 'Shared folder' },
	{ pattern: /(?:^|\/)(?:team[\s_-]?folders?|groupfolders?|collaborations?)(?:\/|$)/i, label: 'Team / Group folder' },
	{ pattern: /(?:^|\/)public(?:\/|$)/i, label: 'Public folder' },
])

const SENSITIVE_PATH_RULES = Object.freeze([
	{ pattern: /(?:^|\/)\.(?:ssh|gnupg|gpg|git|aws|kube|docker|env)(?:\/|$)/i, tag: 'System / Dotconfig' },
	{ pattern: /(?:^|\/)(?:system|appdata|library|programdata|etc|var)(?:\/|$)/i, tag: 'System directory' },
	{ pattern: /(?:^|\/)(?:finance|accounting|invoices?|tax(?:es)?|payroll|hr|legal|contracts?|compliance)(?:\/|$)/i, tag: 'Finance / Legal' },
	{ pattern: /(?:^|\/)(?:backups?|snapshots?|vaults?|secrets?|credentials?|keys?)(?:\/|$)/i, tag: 'Backup / Secrets' },
	{ pattern: /\.(?:kdbx|pem|key|crt|p12|pfx|jks|keystore|ovpn|sqlite3?|db|pst|ost|vmdk|vhd|vhdx)$/i, tag: 'Sensitive file type' },
	{ pattern: /(?:^|\/)(?:\.env(?:\.[^/]+)?|id_rsa(?:\.pub)?|id_ed25519(?:\.pub)?|config\.php|nextcloud\.log)$/i, tag: 'Config / Credential file' },
])

/**
 * Parse a timestamp field from a file entry into Unix epoch milliseconds.
 * Numeric values below 1e11 are treated as Unix seconds.
 *
 * @param {object|null|undefined} file - Duplicate file entry.
 * @return {number|null} Epoch milliseconds or null when unavailable.
 */
export function parseFileEpochMs(file) {
	if (!file || typeof file !== 'object') {
		return null
	}
	for (const field of ['mtime', 'modified', 'updatedAt', 'lastModified']) {
		const raw = file[field]
		if (raw === null || raw === undefined || raw === '' || typeof raw === 'boolean') {
			continue
		}
		const candidate = typeof raw === 'object' && !(raw instanceof Date) && typeof raw.date === 'string'
			? raw.date
			: raw
		if (candidate instanceof Date) {
			const ms = candidate.getTime()
			if (Number.isFinite(ms) && ms > 0) {
				return ms
			}
			continue
		}
		if (typeof candidate === 'number') {
			if (Number.isFinite(candidate) && candidate > 0) {
				return candidate < 1e11 ? Math.round(candidate * 1000) : Math.round(candidate)
			}
			continue
		}
		if (typeof candidate === 'string') {
			const trimmed = candidate.trim()
			if (!trimmed) {
				continue
			}
			if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
				const num = Number(trimmed)
				if (Number.isFinite(num) && num > 0) {
					return num < 1e11 ? Math.round(num * 1000) : Math.round(num)
				}
				continue
			}
			const parsed = Date.parse(trimmed)
			if (Number.isFinite(parsed) && parsed > 0) {
				return parsed
			}
		}
	}
	return null
}

/**
 * Extract the Nextcloud user id from a raw `/<user>/files/...` path when present.
 *
 * @param {string|null|undefined} rawPath - Raw Nextcloud path.
 * @return {string} User id or empty string.
 */
export function extractNextcloudUserFromPath(rawPath) {
	if (typeof rawPath !== 'string') {
		return ''
	}
	const match = rawPath.trim().match(/^\/([^/]+)\/files(?:\/|$)/)
	return match ? match[1] : ''
}

/**
 * Detect active Nextcloud share, public-link, or collaborative mount risks on a file.
 *
 * @param {object} file - Duplicate file entry.
 * @param {string} [primaryOwner=''] - Reference owner for cross-owner share detection.
 * @return {{ hasShareRisk: boolean, isPublicLink: boolean, reasons: string[] }} Share risk summary.
 */
export function detectShareImpact(file, primaryOwner = '') {
	if (!file || typeof file !== 'object') {
		return { hasShareRisk: false, isPublicLink: false, reasons: [] }
	}

	const reasons = []
	let isPublicLink = false

	const sharesList = Array.isArray(file.shares) ? file.shares : []
	const explicitShareCount = Number(file.shareCount)
	const hasExplicitShares = Boolean(
		file.shared
		|| file.isShared
		|| file.mountType === 'shared'
		|| (Number.isFinite(explicitShareCount) && explicitShareCount > 0)
		|| sharesList.length > 0
	)
	const hasPublicShareFlag = Boolean(
		file.publicShare
		|| file.hasPublicLink
		|| file.shareType === 'link'
		|| file.shareType === 3
		|| sharesList.some(share => share && (share.shareType === 3 || share.shareType === 'link' || share.public === true))
	)

	if (hasPublicShareFlag) {
		isPublicLink = true
		reasons.push('Public link share active')
	} else if (hasExplicitShares) {
		reasons.push('Active Nextcloud share')
	}

	const rawOwner = typeof file.owner === 'string' && file.owner.trim()
		? file.owner.trim()
		: extractNextcloudUserFromPath(file.path)
	if (primaryOwner && rawOwner && rawOwner !== primaryOwner) {
		reasons.push(`Shared from owner ${rawOwner}`)
	}

	const normalizedPath = normalizePathForDiff(file.path || '')
	for (const rule of SHARE_PATH_RULES) {
		if (rule.pattern.test(normalizedPath)) {
			reasons.push(rule.label)
			break
		}
	}

	return {
		hasShareRisk: reasons.length > 0,
		isPublicLink,
		reasons,
	}
}

/**
 * Detect sensitive system, configuration, credential, or business folders/extensions.
 *
 * @param {string|null|undefined} rawPath - File path.
 * @return {{ hasSensitiveRisk: boolean, matchedTags: string[] }} Sensitive path matches.
 */
export function detectSensitivePath(rawPath) {
	const normalizedPath = normalizePathForDiff(rawPath || '') || String(rawPath || '')
	if (!normalizedPath) {
		return { hasSensitiveRisk: false, matchedTags: [] }
	}
	const matchedTags = []
	for (const rule of SENSITIVE_PATH_RULES) {
		if (rule.pattern.test(normalizedPath) && !matchedTags.includes(rule.tag)) {
			matchedTags.push(rule.tag)
		}
	}
	return {
		hasSensitiveRisk: matchedTags.length > 0,
		matchedTags,
	}
}

/**
 * Map a numeric score (0..100) to a deterministic risk tier.
 *
 * @param {number} score - Risk score from 0 to 100.
 * @return {'critical'|'high'|'medium'|'low'} Risk tier label.
 */
export function classifyRiskTier(score) {
	if (score >= 70) {
		return 'critical'
	}
	if (score >= 45) {
		return 'high'
	}
	if (score >= 20) {
		return 'medium'
	}
	return 'low'
}

/**
 * Resolve deletion candidate keys for a duplicate group according to the chosen keep rule,
 * strictly preserving protected origin-folder files and at least one surviving copy.
 *
 * @param {Array<object>} files - Duplicate group file entries.
 * @param {string} keepStrategy - Keep strategy ('oldest' | 'newest' | 'shortest_path' | 'protected_first').
 * @return {Array<string|number>} Keys queued for deletion.
 */
function resolveDeletionKeysForStrategy(files, keepStrategy) {
	const normalizedRule = KEEP_RULES.includes(keepStrategy) ? keepStrategy : 'oldest'
	if (keepStrategy === 'protected_first') {
		const validFiles = Array.isArray(files) ? files.filter(file => file && typeof file === 'object') : []
		const hasProtected = validFiles.some(file => file.isInOriginFolder)
		if (hasProtected) {
			return validFiles
				.filter(file => !file.isInOriginFolder)
				.map(file => getFileSelectionKey(file))
				.filter(key => key !== null)
		}
	}
	return selectDuplicatesByKeepRule(files, normalizedRule)
}

/**
 * Evaluate risk signals for a single file entry.
 *
 * @param {object} file - Duplicate file entry.
 * @param {object} [options] - Audit parameters.
 * @param {number} [options.nowMs] - Reference epoch milliseconds.
 * @param {number} [options.recentWindowDays=7] - Recency threshold in days.
 * @param {string} [options.primaryOwner=''] - Primary Nextcloud user id.
 * @return {object} Enriched file audit descriptor.
 */
export function evaluateFileRisk(file, options = {}) {
	const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now()
	const recentWindowDays = Number(options.recentWindowDays) > 0
		? Number(options.recentWindowDays)
		: DEFAULT_RECENT_WINDOW_DAYS
	const primaryOwner = typeof options.primaryOwner === 'string' ? options.primaryOwner : ''

	const rawPath = typeof file.path === 'string' ? file.path : ''
	const normalizedPath = normalizePathForDiff(rawPath) || rawPath
	const rawSize = Number(file.size)
	const sizeBytes = Number.isFinite(rawSize) && rawSize > 0 ? Math.floor(rawSize) : 0
	const epochMs = parseFileEpochMs(file)
	const ageMs = epochMs !== null ? Math.max(0, nowMs - epochMs) : null
	const ageDays = ageMs !== null ? ageMs / 86400000 : null
	const isRecent = ageDays !== null && ageDays <= recentWindowDays
	const isUltraRecent = ageDays !== null && ageDays <= 1

	const shareInfo = detectShareImpact(file, primaryOwner)
	const sensitiveInfo = detectSensitivePath(rawPath)
	const isLivePhotoHazard = Boolean(file.isLivePhotoVideoMissing)

	let fileScore = 0
	if (shareInfo.isPublicLink) {
		fileScore += 45
	} else if (shareInfo.hasShareRisk) {
		fileScore += 32
	}
	if (isUltraRecent) {
		fileScore += 30
	} else if (isRecent) {
		fileScore += 20
	}
	if (sensitiveInfo.hasSensitiveRisk) {
		fileScore += 25
	}
	if (isLivePhotoHazard) {
		fileScore += 15
	}
	fileScore = Math.min(100, fileScore)

	return {
		key: getFileSelectionKey(file),
		id: file.id ?? null,
		nodeId: file.nodeId ?? null,
		rawFile: file,
		path: rawPath,
		normalizedPath,
		sizeBytes,
		formattedSize: formatBytes(sizeBytes),
		mimetype: typeof file.mimetype === 'string' ? file.mimetype : '',
		isProtected: Boolean(file.isInOriginFolder),
		epochMs,
		mtimeIso: epochMs !== null ? new Date(epochMs).toISOString() : '',
		formattedMtime: formatFileModifiedTime(file),
		ageDays: ageDays !== null ? Math.round(ageDays * 10) / 10 : null,
		isRecent,
		isUltraRecent,
		hasShareRisk: shareInfo.hasShareRisk,
		isPublicLink: shareInfo.isPublicLink,
		shareReasons: shareInfo.reasons,
		hasSensitiveRisk: sensitiveInfo.hasSensitiveRisk,
		sensitiveTags: sensitiveInfo.matchedTags,
		isLivePhotoHazard,
		fileScore,
	}
}

/**
 * Audit a single duplicate group for deletion risk, share impact, recency, and recovery readiness.
 *
 * @param {object} group - Duplicate group object.
 * @param {object} [options] - Audit parameters.
 * @return {object|null} Audited group record or null when group has fewer than 2 valid files.
 */
export function auditDuplicateGroup(group, options = {}) {
	if (!group || typeof group !== 'object' || !Array.isArray(group.files)) {
		return null
	}
	const validFiles = group.files.filter(file => file && typeof file === 'object')
	if (validFiles.length <= 1) {
		return null
	}

	const keepStrategy = typeof options.keepStrategy === 'string' ? options.keepStrategy : 'oldest'
	const recentWindowDays = Number(options.recentWindowDays) > 0
		? Number(options.recentWindowDays)
		: DEFAULT_RECENT_WINDOW_DAYS

	const ownerCounts = new Map()
	for (const file of validFiles) {
		const owner = typeof file.owner === 'string' && file.owner.trim()
			? file.owner.trim()
			: extractNextcloudUserFromPath(file.path)
		if (owner) {
			ownerCounts.set(owner, (ownerCounts.get(owner) || 0) + 1)
		}
	}
	let primaryOwner = typeof options.primaryOwner === 'string' ? options.primaryOwner : ''
	if (!primaryOwner && ownerCounts.size > 0) {
		primaryOwner = Array.from(ownerCounts.entries()).sort((a, b) => b[1] - a[1])[0][0]
	}

	const deleteKeys = resolveDeletionKeysForStrategy(validFiles, keepStrategy)
	const deleteKeySet = new Set(deleteKeys.map(key => String(key)))

	const evaluatedFiles = validFiles.map(file => evaluateFileRisk(file, {
		...options,
		recentWindowDays,
		primaryOwner,
	}))

	const deletionCandidates = []
	const survivors = []
	for (const entry of evaluatedFiles) {
		const keyStr = entry.key !== null ? String(entry.key) : ''
		if (keyStr && deleteKeySet.has(keyStr) && !entry.isProtected) {
			deletionCandidates.push(entry)
		} else {
			survivors.push(entry)
		}
	}

	if (survivors.length === 0 && deletionCandidates.length > 0) {
		survivors.push(deletionCandidates.shift())
	}

	const reclaimableBytes = deletionCandidates.reduce((sum, item) => sum + item.sizeBytes, 0)
	const hasShareRisk = deletionCandidates.some(item => item.hasShareRisk)
	const hasPublicLinkRisk = deletionCandidates.some(item => item.isPublicLink)
	const survivorIsShared = survivors.some(item => item.hasShareRisk)
	const shareDisparityRisk = hasShareRisk && !survivorIsShared
	const hasRecentRisk = deletionCandidates.some(item => item.isRecent)
	const hasUltraRecentRisk = deletionCandidates.some(item => item.isUltraRecent)
	const hasSensitiveRisk = deletionCandidates.some(item => item.hasSensitiveRisk)
	const hasLivePhotoHazard = deletionCandidates.some(item => item.isLivePhotoHazard)
	const allProtected = deletionCandidates.length === 0 && validFiles.every(file => file.isInOriginFolder)

	const sharePoints = hasPublicLinkRisk ? 45 : (hasShareRisk ? 32 : 0)
	const recencyPoints = hasUltraRecentRisk ? 30 : (hasRecentRisk ? 20 : 0)
	const sensitivePoints = hasSensitiveRisk ? 25 : 0
	const extraPoints = (shareDisparityRisk ? 15 : 0) + (hasLivePhotoHazard ? 15 : 0)
	const riskScore = deletionCandidates.length === 0
		? 0
		: Math.min(100, sharePoints + recencyPoints + sensitivePoints + extraPoints)
	const riskTier = classifyRiskTier(riskScore)

	const riskReasons = []
	if (hasPublicLinkRisk) {
		riskReasons.push('Public link share on deletion candidate')
	} else if (hasShareRisk) {
		riskReasons.push('Shared / collaborative folder target')
	}
	if (shareDisparityRisk) {
		riskReasons.push('Surviving copy is not shared (link break risk)')
	}
	if (hasUltraRecentRisk) {
		riskReasons.push('Modified within 24 hours')
	} else if (hasRecentRisk) {
		riskReasons.push(`Modified within ${recentWindowDays} days`)
	}
	if (hasSensitiveRisk) {
		const tags = Array.from(new Set(deletionCandidates.flatMap(item => item.sensitiveTags)))
		riskReasons.push(`Sensitive path (${tags.join(', ')})`)
	}
	if (hasLivePhotoHazard) {
		riskReasons.push('Incomplete Live Photo pair detected')
	}
	if (allProtected) {
		riskReasons.push('All copies are in protected origin folders')
	} else if (riskReasons.length === 0 && deletionCandidates.length > 0) {
		riskReasons.push('Safe redundant copy with intact survivor')
	}

	const newestCandidateAgeDays = deletionCandidates.reduce((minAge, item) => {
		if (item.ageDays === null) {
			return minAge
		}
		return minAge === null ? item.ageDays : Math.min(minAge, item.ageDays)
	}, null)

	const firstNameSource = survivors[0] || evaluatedFiles[0]
	const displayName = firstNameSource
		? (firstNameSource.normalizedPath.split('/').filter(Boolean).pop() || firstNameSource.normalizedPath || `Group #${group.id ?? ''}`)
		: `Group #${group.id ?? ''}`

	return {
		groupId: group.id ?? null,
		hash: typeof group.hash === 'string' ? group.hash : String(group.hash ?? ''),
		acknowledged: Boolean(group.acknowledged),
		rawGroup: group,
		displayName,
		totalCopies: evaluatedFiles.length,
		survivors,
		deletionCandidates,
		hasDeletableTargets: deletionCandidates.length > 0,
		allProtected,
		reclaimableBytes,
		reclaimableFormatted: formatBytes(reclaimableBytes),
		riskScore,
		riskTier,
		scoreBreakdown: {
			sharePoints,
			recencyPoints,
			sensitivePoints,
			extraPoints,
		},
		hasShareRisk,
		hasPublicLinkRisk,
		shareDisparityRisk,
		hasRecentRisk,
		hasSensitiveRisk,
		hasLivePhotoHazard,
		newestCandidateAgeDays,
		riskReasons,
		primaryOwner,
	}
}

/**
 * Filter, sort, and summarize audited duplicate groups into a complete safety report.
 *
 * @param {Array<object>} duplicates - Duplicate group objects.
 * @param {object} [options] - Audit, filter, and sort options.
 * @return {object} Complete recovery safety report.
 */
export function buildRecoverySafetyReport(duplicates, options = {}) {
	const recentWindowDays = Number(options.recentWindowDays) > 0
		? Number(options.recentWindowDays)
		: DEFAULT_RECENT_WINDOW_DAYS
	const keepStrategy = typeof options.keepStrategy === 'string' ? options.keepStrategy : 'oldest'
	const riskFilter = typeof options.riskFilter === 'string' ? options.riskFilter : 'all'
	const sortBy = typeof options.sortBy === 'string' ? options.sortBy : 'risk-desc'
	const searchQuery = typeof options.searchQuery === 'string' ? options.searchQuery.trim().toLowerCase() : ''

	const auditedAll = []
	for (const group of Array.isArray(duplicates) ? duplicates : []) {
		const audited = auditDuplicateGroup(group, {
			...options,
			recentWindowDays,
			keepStrategy,
		})
		if (audited) {
			auditedAll.push(audited)
		}
	}

	const tierCounts = { critical: 0, high: 0, medium: 0, low: 0 }
	let shareImpactFilesCount = 0
	let publicLinkRiskCount = 0
	let recentFilesCount = 0
	let sensitiveFilesCount = 0
	let totalReclaimableBytes = 0
	let safeReclaimableBytes = 0
	let highRiskHeldBytes = 0
	let weightedScoreSum = 0

	const ownerVotes = new Map()
	for (const group of auditedAll) {
		tierCounts[group.riskTier] += 1
		totalReclaimableBytes += group.reclaimableBytes
		weightedScoreSum += group.riskScore
		if (group.riskTier === 'low' && group.hasDeletableTargets) {
			safeReclaimableBytes += group.reclaimableBytes
		} else if (group.riskTier === 'critical' || group.riskTier === 'high') {
			highRiskHeldBytes += group.reclaimableBytes
		}
		if (group.primaryOwner) {
			ownerVotes.set(group.primaryOwner, (ownerVotes.get(group.primaryOwner) || 0) + 1)
		}
		for (const candidate of group.deletionCandidates) {
			if (candidate.hasShareRisk) {
				shareImpactFilesCount += 1
			}
			if (candidate.isPublicLink) {
				publicLinkRiskCount += 1
			}
			if (candidate.isRecent) {
				recentFilesCount += 1
			}
			if (candidate.hasSensitiveRisk) {
				sensitiveFilesCount += 1
			}
		}
	}

	const filtered = auditedAll.filter(group => {
		if (riskFilter === 'critical-high' && group.riskTier !== 'critical' && group.riskTier !== 'high') {
			return false
		}
		if (riskFilter === 'share-impact' && !group.hasShareRisk) {
			return false
		}
		if (riskFilter === 'recent' && !group.hasRecentRisk) {
			return false
		}
		if (riskFilter === 'sensitive' && !group.hasSensitiveRisk) {
			return false
		}
		if (riskFilter === 'safe-low' && (group.riskTier !== 'low' || !group.hasDeletableTargets)) {
			return false
		}
		if (searchQuery) {
			const haystacks = [
				group.displayName,
				group.hash,
				...group.survivors.map(item => item.normalizedPath),
				...group.deletionCandidates.map(item => item.normalizedPath),
				...group.riskReasons,
			]
			const matched = haystacks.some(value => typeof value === 'string' && value.toLowerCase().includes(searchQuery))
			if (!matched) {
				return false
			}
		}
		return true
	})

	filtered.sort((a, b) => {
		if (sortBy === 'reclaimable-desc') {
			if (b.reclaimableBytes !== a.reclaimableBytes) {
				return b.reclaimableBytes - a.reclaimableBytes
			}
			return b.riskScore - a.riskScore
		}
		if (sortBy === 'recent-first') {
			const ageA = a.newestCandidateAgeDays ?? Number.POSITIVE_INFINITY
			const ageB = b.newestCandidateAgeDays ?? Number.POSITIVE_INFINITY
			if (ageA !== ageB) {
				return ageA - ageB
			}
			return b.riskScore - a.riskScore
		}
		if (sortBy === 'copies-desc') {
			if (b.totalCopies !== a.totalCopies) {
				return b.totalCopies - a.totalCopies
			}
			return b.reclaimableBytes - a.reclaimableBytes
		}
		if (b.riskScore !== a.riskScore) {
			return b.riskScore - a.riskScore
		}
		return b.reclaimableBytes - a.reclaimableBytes
	})

	const overallRiskScore = auditedAll.length > 0
		? Math.round(weightedScoreSum / auditedAll.length)
		: 0
	const inferredUser = typeof options.nextcloudUser === 'string' && options.nextcloudUser.trim()
		? options.nextcloudUser.trim()
		: (ownerVotes.size > 0
			? Array.from(ownerVotes.entries()).sort((a, b) => b[1] - a[1])[0][0]
			: 'admin')

	return {
		keepStrategy,
		recentWindowDays,
		riskFilter,
		sortBy,
		searchQuery,
		groups: filtered,
		allGroups: auditedAll,
		summary: {
			totalGroups: auditedAll.length,
			filteredGroups: filtered.length,
			tierCounts,
			highAndCriticalCount: tierCounts.critical + tierCounts.high,
			shareImpactFilesCount,
			publicLinkRiskCount,
			recentFilesCount,
			sensitiveFilesCount,
			totalReclaimableBytes,
			totalReclaimableFormatted: formatBytes(totalReclaimableBytes),
			safeReclaimableBytes,
			safeReclaimableFormatted: formatBytes(safeReclaimableBytes),
			highRiskHeldBytes,
			highRiskHeldFormatted: formatBytes(highRiskHeldBytes),
			overallRiskScore,
			overallRiskTier: classifyRiskTier(overallRiskScore),
			inferredUser,
		},
	}
}

/**
 * Quote an arbitrary string safely for POSIX / Bash single-quoted shell arguments.
 * Neutralizes spaces, quotes, `$()`, backticks, globs, and newlines.
 *
 * @param {*} value - Raw value to quote.
 * @return {string} POSIX-safe single-quoted literal.
 */
export function shellQuote(value) {
	const text = value === null || value === undefined ? '' : String(value)
	const sanitized = text.replace(/[\r\n\0]/g, ' ')
	return `'${sanitized.replace(/'/g, "'\\''")}'`
}

/**
 * Generate an executable `restore-from-trash.sh` recovery script for audited deletion targets.
 * Defaults to `--dry-run` unless `--apply` is explicitly passed.
 *
 * @param {object} report - Report returned by buildRecoverySafetyReport.
 * @param {object} [options] - Script options.
 * @param {string} [options.exportedAt] - Optional ISO-8601 timestamp.
 * @param {string} [options.nextcloudUser] - Optional Nextcloud user override.
 * @return {string} POSIX/Bash script content.
 */
export function buildRestoreFromTrashScript(report, options = {}) {
	const safeReport = report && typeof report === 'object' ? report : buildRecoverySafetyReport([])
	const groups = Array.isArray(safeReport.groups) ? safeReport.groups : []
	const timestamp = typeof options.exportedAt === 'string' && options.exportedAt.trim()
		? options.exportedAt.trim()
		: new Date().toISOString()
	const ncUser = typeof options.nextcloudUser === 'string' && options.nextcloudUser.trim()
		? options.nextcloudUser.trim()
		: (safeReport.summary && safeReport.summary.inferredUser ? safeReport.summary.inferredUser : 'admin')

	/* eslint-disable no-template-curly-in-string */
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# DuplicateFinder Recovery Safety Script (restore-from-trash.sh)',
		`# Generated: ${timestamp.replace(/[\r\n]/g, ' ')}`,
		`# Strategy: ${safeReport.keepStrategy || 'oldest'} | Recent threshold: ${safeReport.recentWindowDays || 7}d`,
		'# Usage: bash restore-from-trash.sh [--dry-run | --apply]',
		'',
		'MODE="dry-run"',
		'if [[ "${1:-}" == "--apply" ]]; then',
		'  MODE="apply"',
		'fi',
		'',
		'NEXTCLOUD_ROOT="${NEXTCLOUD_ROOT:-/var/www/nextcloud}"',
		'OCC_BIN="${OCC_BIN:-$NEXTCLOUD_ROOT/occ}"',
		`NC_USER=${shellQuote(ncUser)}`,
		'',
		'echo "[DuplicateFinder] Recovery mode: $MODE (user: $NC_USER)"',
		'',
		'restore_trash_entry() {',
		'  local target_rel="$1"',
		'  local file_name="$2"',
		'  local node_id="$3"',
		'  local size_bytes="$4"',
		'  local survivor_rel="$5"',
		'  local group_hash="$6"',
		'  local risk_tier="$7"',
		'',
		'  echo "[ENTRY] tier=$risk_tier hash=$group_hash node=$node_id size=${size_bytes}B target=$target_rel"',
		'  if [[ "$MODE" == "dry-run" ]]; then',
		'    echo "  DRY-RUN: would search Nextcloud trashbin for \'$file_name\' (survivor: $survivor_rel)"',
		'    return 0',
		'  fi',
		'',
		'  if [[ ! -f "$OCC_BIN" ]]; then',
		'    echo "  WARN: occ not found at $OCC_BIN; restore manually from Nextcloud Trashbin UI: $target_rel" >&2',
		'    return 0',
		'  fi',
		'',
		'  local user_data_dir="${NEXTCLOUD_DATA_DIR:-$NEXTCLOUD_ROOT/data}/$NC_USER"',
		'  local trash_dir="$user_data_dir/files_trashbin/files"',
		'  local restore_dest="$user_data_dir/files$target_rel"',
		'  local match=""',
		'  if [[ -d "$trash_dir" ]]; then',
		'    match=$(find "$trash_dir" -maxdepth 2 -name "${file_name}.d*" 2>/dev/null | head -n 1 || true)',
		'  fi',
		'  if [[ -n "$match" ]]; then',
		'    mkdir -p "$(dirname "$restore_dest")"',
		'    mv -n "$match" "$restore_dest"',
		'    php "$OCC_BIN" files:scan --path="/$NC_USER/files$(dirname "$target_rel")" >/dev/null || true',
		'    echo "  RESTORED: $restore_dest"',
		'  else',
		'    echo "  INFO: trash match not found locally; run: php $OCC_BIN trashbin:restore --help" >&2',
		'  fi',
		'}',
		'',
	]
	/* eslint-enable no-template-curly-in-string */

	let entryCount = 0
	for (const group of groups) {
		if (!group || !Array.isArray(group.deletionCandidates) || group.deletionCandidates.length === 0) {
			continue
		}
		const survivorPath = group.survivors && group.survivors[0]
			? group.survivors[0].normalizedPath
			: ''
		for (const candidate of group.deletionCandidates) {
			entryCount += 1
			const fileName = candidate.normalizedPath.split('/').filter(Boolean).pop() || candidate.normalizedPath
			lines.push(
				`restore_trash_entry ${shellQuote(candidate.normalizedPath)} ${shellQuote(fileName)} ${shellQuote(candidate.nodeId ?? '')} ${shellQuote(candidate.sizeBytes)} ${shellQuote(survivorPath)} ${shellQuote(group.hash)} ${shellQuote(group.riskTier)}`
			)
		}
	}

	if (entryCount === 0) {
		lines.push('echo "[DuplicateFinder] No deletion candidates queued in current audit scope."')
	} else {
		lines.push('')
		lines.push(`echo "[DuplicateFinder] Processed ${entryCount} recovery entries in $MODE mode."`)
	}

	return lines.join('\n') + '\n'
}

/**
 * Serialize the recovery safety audit into a structured JSON manifest.
 *
 * @param {object} report - Report returned by buildRecoverySafetyReport.
 * @param {object} [options] - Export options.
 * @param {string} [options.exportedAt] - Optional ISO-8601 timestamp.
 * @return {string} Pretty-printed JSON recovery manifest.
 */
export function buildRecoveryManifestJson(report, options = {}) {
	const safeReport = report && typeof report === 'object' ? report : buildRecoverySafetyReport([])
	const timestamp = typeof options.exportedAt === 'string' && options.exportedAt.trim()
		? options.exportedAt.trim()
		: new Date().toISOString()

	const payload = {
		schema: RECOVERY_MANIFEST_SCHEMA,
		exportedAt: timestamp,
		keepStrategy: safeReport.keepStrategy || 'oldest',
		recentWindowDays: safeReport.recentWindowDays || DEFAULT_RECENT_WINDOW_DAYS,
		summary: safeReport.summary || {},
		groups: (Array.isArray(safeReport.groups) ? safeReport.groups : []).map(group => ({
			groupId: group.groupId,
			hash: group.hash,
			displayName: group.displayName,
			acknowledged: group.acknowledged,
			riskScore: group.riskScore,
			riskTier: group.riskTier,
			scoreBreakdown: group.scoreBreakdown,
			riskReasons: group.riskReasons,
			reclaimableBytes: group.reclaimableBytes,
			keep: (group.survivors || []).map(entry => ({
				id: entry.id,
				nodeId: entry.nodeId,
				path: entry.normalizedPath,
				sizeBytes: entry.sizeBytes,
				mtimeIso: entry.mtimeIso,
				protected: entry.isProtected,
				shared: entry.hasShareRisk,
			})),
			delete: (group.deletionCandidates || []).map(entry => ({
				id: entry.id,
				nodeId: entry.nodeId,
				path: entry.normalizedPath,
				sizeBytes: entry.sizeBytes,
				mtimeIso: entry.mtimeIso,
				ageDays: entry.ageDays,
				shared: entry.hasShareRisk,
				publicLink: entry.isPublicLink,
				sensitiveTags: entry.sensitiveTags,
			})),
		})),
	}

	return JSON.stringify(payload, null, 2)
}

const RISK_CSV_HEADERS = Object.freeze([
	'group_id',
	'hash',
	'risk_tier',
	'risk_score',
	'action',
	'path',
	'size_bytes',
	'mtime_iso',
	'age_days',
	'share_risk',
	'public_link',
	'sensitive_tags',
	'protected',
	'risk_reasons',
])

/**
 * Build a CWE-1236-safe RFC 4180 CSV risk audit table.
 *
 * @param {object} report - Report returned by buildRecoverySafetyReport.
 * @return {string} CSV document content.
 */
export function buildRiskAuditCsv(report) {
	const safeReport = report && typeof report === 'object' ? report : buildRecoverySafetyReport([])
	const lines = [RISK_CSV_HEADERS.map(escapeCsvCell).join(',')]
	for (const group of Array.isArray(safeReport.groups) ? safeReport.groups : []) {
		const reasonsText = Array.isArray(group.riskReasons) ? group.riskReasons.join('; ') : ''
		const rows = [
			...(group.survivors || []).map(entry => ({ action: 'keep', entry })),
			...(group.deletionCandidates || []).map(entry => ({ action: 'delete', entry })),
		]
		for (const { action, entry } of rows) {
			lines.push([
				group.groupId ?? '',
				group.hash || '',
				group.riskTier,
				group.riskScore,
				action,
				entry.normalizedPath || '',
				entry.sizeBytes,
				entry.mtimeIso || '',
				entry.ageDays ?? '',
				entry.hasShareRisk ? 'true' : 'false',
				entry.isPublicLink ? 'true' : 'false',
				(entry.sensitiveTags || []).join('; '),
				entry.isProtected ? 'true' : 'false',
				reasonsText,
			].map(escapeCsvCell).join(','))
		}
	}
	return lines.join('\r\n')
}
