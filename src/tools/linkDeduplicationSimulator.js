/**
 * Pure hardlink, relative-symlink, and CoW-reflink deduplication simulator
 * and dry-run-first execution plan generator inspired by Czkawka, fclones,
 * rmlint, and dupeGuru reference-folder policies.
 * Zero DOM dependencies, zero network side effects, CWE-1236-safe CSV export.
 */

import { formatBytes } from './duplicateStats'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { normalizePathForDiff } from './duplicatePathDiff'

export const LINK_MODES = Object.freeze([
	'hardlink',
	'symlink',
	'reflink',
	'hybrid',
])

export const MASTER_STRATEGIES = Object.freeze([
	'origin_first',
	'oldest',
	'newest',
	'shortest_path',
	'deepest_path',
])

export const LINK_PLAN_SCHEMA = 'duplicatefinder.link-plan.v1'

/**
 * Resolve a stable group key for a duplicate group object.
 *
 * @param {object|null|undefined} group Duplicate group entry.
 * @param {number} [index=0] Fallback index.
 * @return {string} Stable group identifier.
 */
export function resolveLinkGroupKey(group, index = 0) {
	if (!group || typeof group !== 'object') {
		return `idx:${index}`
	}
	if (typeof group.hash === 'string' && group.hash.trim() !== '') {
		return `hash:${group.hash.trim()}`
	}
	if (group.id !== null && group.id !== undefined && group.id !== '') {
		return `id:${String(group.id)}`
	}
	return `idx:${index}`
}

/**
 * Parse a timestamp field into finite milliseconds, or null when missing.
 *
 * @param {*} value Raw timestamp value.
 * @return {number|null} Timestamp in ms or null.
 */
function parseTimestamp(value) {
	if (value === null || value === undefined || value === '') {
		return null
	}
	if (value instanceof Date) {
		const ms = value.getTime()
		return Number.isFinite(ms) ? ms : null
	}
	if (typeof value === 'number') {
		return Number.isFinite(value) ? value : null
	}
	if (typeof value === 'string') {
		const trimmed = value.trim()
		if (!trimmed) {
			return null
		}
		if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
			const num = Number(trimmed)
			return Number.isFinite(num) ? num : null
		}
		const parsed = Date.parse(trimmed)
		return Number.isFinite(parsed) ? parsed : null
	}
	return null
}

/**
 * Extract modification timestamp from a duplicate file entry.
 *
 * @param {object|null|undefined} file File object.
 * @return {number|null} Timestamp or null.
 */
function getFileTimestamp(file) {
	if (!file || typeof file !== 'object') {
		return null
	}
	for (const key of ['mtime', 'modified', 'updatedAt', 'lastModified']) {
		if (Object.prototype.hasOwnProperty.call(file, key)) {
			const parsed = parseTimestamp(file[key])
			if (parsed !== null) {
				return parsed
			}
		}
	}
	return null
}

/**
 * Normalize a raw path to forward-slash POSIX form without redundant slashes.
 *
 * @param {string|null|undefined} rawPath File path.
 * @return {string} Normalized POSIX path or empty string.
 */
export function normalizePosixPath(rawPath) {
	if (typeof rawPath !== 'string') {
		return ''
	}
	const trimmed = rawPath.trim()
	if (!trimmed) {
		return ''
	}
	const slashed = trimmed.replace(/\\/g, '/').replace(/\/+/g, '/')
	return slashed.startsWith('/') ? slashed : `/${slashed}`
}

/**
 * Extract a storage/mount scope identifier for cross-volume hardlink safety checks.
 * Uses explicit storageId/mountId/owner when provided, else top-level Nextcloud root.
 *
 * @param {object|null|undefined} file Duplicate file entry.
 * @return {string} Storage scope key.
 */
export function extractStorageScope(file) {
	if (!file || typeof file !== 'object') {
		return 'root:/'
	}
	if (file.storageId !== null && file.storageId !== undefined && String(file.storageId).trim() !== '') {
		return `storage:${String(file.storageId).trim()}`
	}
	if (file.mountId !== null && file.mountId !== undefined && String(file.mountId).trim() !== '') {
		return `mount:${String(file.mountId).trim()}`
	}
	if (typeof file.owner === 'string' && file.owner.trim() !== '') {
		return `owner:${file.owner.trim()}`
	}

	const posixPath = normalizePosixPath(file.path)
	if (!posixPath) {
		return 'root:/'
	}
	const userFilesMatch = posixPath.match(/^\/([^/]+)\/files(?:\/|$)/)
	if (userFilesMatch) {
		return `user:${userFilesMatch[1]}`
	}
	const segments = posixPath.split('/').filter(Boolean)
	if (segments.length <= 1) {
		return 'root:/'
	}
	return `top:${segments[0]}`
}

/**
 * Check whether two duplicate file entries share the same hardlink-compatible storage scope.
 *
 * @param {object} masterFile Canonical master file.
 * @param {object} targetFile Candidate target file.
 * @return {{ compatible: boolean, masterScope: string, targetScope: string, reason: string }} Scope compatibility result.
 */
export function checkHardlinkCompatibility(masterFile, targetFile) {
	const masterScope = extractStorageScope(masterFile)
	const targetScope = extractStorageScope(targetFile)

	if (masterScope !== targetScope) {
		return {
			compatible: false,
			masterScope,
			targetScope,
			reason: 'cross-storage-scope',
		}
	}

	const masterDisplay = normalizePathForDiff(masterFile?.path || '')
	const targetDisplay = normalizePathForDiff(targetFile?.path || '')
	if (masterDisplay && targetDisplay && masterDisplay === targetDisplay) {
		return {
			compatible: false,
			masterScope,
			targetScope,
			reason: 'same-path',
		}
	}

	return {
		compatible: true,
		masterScope,
		targetScope,
		reason: 'same-scope',
	}
}

/**
 * Compute a pure POSIX relative symlink target from sourceLinkPath to masterTargetPath.
 *
 * @param {string} sourceLinkPath Path where the symlink will be created.
 * @param {string} masterTargetPath Path to the surviving master file.
 * @return {string} Relative POSIX path (e.g. '../../Origin/photo.jpg').
 */
export function computeRelativeSymlinkTarget(sourceLinkPath, masterTargetPath) {
	const sourceNorm = normalizePosixPath(sourceLinkPath)
	const masterNorm = normalizePosixPath(masterTargetPath)
	if (!sourceNorm || !masterNorm) {
		return masterNorm || ''
	}

	const sourceSegments = sourceNorm.split('/').filter(Boolean)
	const masterSegments = masterNorm.split('/').filter(Boolean)
	if (sourceSegments.length === 0 || masterSegments.length === 0) {
		return masterNorm
	}

	// Compare directories: remove filename from source path
	const sourceDir = sourceSegments.slice(0, -1)
	const masterDir = masterSegments.slice(0, -1)
	const masterName = masterSegments[masterSegments.length - 1]

	let common = 0
	const minLen = Math.min(sourceDir.length, masterDir.length)
	while (common < minLen && sourceDir[common] === masterDir[common]) {
		common += 1
	}

	const upCount = sourceDir.length - common
	const downParts = masterDir.slice(common)
	const relativeParts = []
	for (let i = 0; i < upCount; i += 1) {
		relativeParts.push('..')
	}
	relativeParts.push(...downParts, masterName)

	return relativeParts.length > 0 ? relativeParts.join('/') : masterName
}

/**
 * Quote an arbitrary string safely for POSIX single-quoted bash scripts.
 *
 * @param {string} value Raw string.
 * @return {string} POSIX single-quoted string.
 */
export function shellQuote(value) {
	const text = typeof value === 'string' ? value : String(value ?? '')
	return `'${text.replace(/'/g, '\'"\'"\'')}'`
}

/**
 * Deterministic comparator for picking a canonical master copy in a duplicate group.
 * Protected origin files always take priority to enforce zero-overwrite safety.
 *
 * @param {object} a First file.
 * @param {object} b Second file.
 * @param {string} strategy Strategy from MASTER_STRATEGIES.
 * @return {number} Comparator result.
 */
function compareMasterCandidates(a, b, strategy) {
	const protA = Boolean(a && a.isInOriginFolder)
	const protB = Boolean(b && b.isInOriginFolder)
	if (protA !== protB) {
		return protA ? -1 : 1
	}

	const timeA = getFileTimestamp(a)
	const timeB = getFileTimestamp(b)
	const pathA = typeof a?.path === 'string' ? a.path : ''
	const pathB = typeof b?.path === 'string' ? b.path : ''

	if (strategy === 'oldest' || strategy === 'origin_first') {
		if (timeA !== null && timeB !== null && timeA !== timeB) {
			return timeA - timeB
		}
		if (timeA !== null && timeB === null) {
			return -1
		}
		if (timeA === null && timeB !== null) {
			return 1
		}
	} else if (strategy === 'newest') {
		if (timeA !== null && timeB !== null && timeA !== timeB) {
			return timeB - timeA
		}
		if (timeA !== null && timeB === null) {
			return -1
		}
		if (timeA === null && timeB !== null) {
			return 1
		}
	} else if (strategy === 'deepest_path') {
		const depthA = normalizePosixPath(pathA).split('/').filter(Boolean).length
		const depthB = normalizePosixPath(pathB).split('/').filter(Boolean).length
		if (depthA !== depthB) {
			return depthB - depthA
		}
		if (pathA.length !== pathB.length) {
			return pathB.length - pathA.length
		}
	}

	if (pathA.length !== pathB.length) {
		return pathA.length - pathB.length
	}
	if (pathA !== pathB) {
		return pathA < pathB ? -1 : 1
	}
	const keyA = String(getFileSelectionKey(a) ?? '')
	const keyB = String(getFileSelectionKey(b) ?? '')
	return keyA < keyB ? -1 : (keyA > keyB ? 1 : 0)
}

/**
 * Select the master target file for a group, respecting origin-folder protection
 * and optional manual master promotion.
 *
 * @param {Array<object>} files Duplicate files in group.
 * @param {string} [strategy='origin_first'] Master selection strategy.
 * @param {string|number|null} [manualMasterKey=null] Optional promoted master key.
 * @return {object|null} Chosen master file or null.
 */
export function pickMasterTarget(files, strategy = 'origin_first', manualMasterKey = null) {
	if (!Array.isArray(files) || files.length === 0) {
		return null
	}
	const valid = files.filter(file => file && typeof file === 'object')
	if (valid.length === 0) {
		return null
	}
	const safeStrategy = MASTER_STRATEGIES.includes(strategy) ? strategy : 'origin_first'

	if (manualMasterKey !== null && manualMasterKey !== undefined && manualMasterKey !== '') {
		const hasProtected = valid.some(file => Boolean(file.isInOriginFolder))
		const manualCandidate = valid.find(file => getFileSelectionKey(file) === manualMasterKey)
		if (manualCandidate && (!hasProtected || manualCandidate.isInOriginFolder)) {
			return manualCandidate
		}
	}

	const sorted = [...valid].sort((a, b) => compareMasterCandidates(a, b, safeStrategy))
	return sorted[0] || null
}

/**
 * Build a readable label for a duplicate group.
 *
 * @param {object} group Duplicate group.
 * @param {object|null} masterFile Master file.
 * @return {string} Display group label.
 */
function resolveGroupName(group, masterFile) {
	if (masterFile && typeof masterFile.path === 'string' && masterFile.path.trim() !== '') {
		const norm = normalizePosixPath(masterFile.path)
		const idx = norm.lastIndexOf('/')
		return idx >= 0 ? norm.slice(idx + 1) : norm
	}
	if (group && typeof group.hash === 'string' && group.hash.trim() !== '') {
		return group.hash.slice(0, 12)
	}
	return 'group'
}

/**
 * Build a command preview string for one target operation.
 *
 * @param {string} effectiveAction Action ('hardlink' | 'symlink' | 'reflink' | 'skip').
 * @param {string} masterPath Master file path.
 * @param {string} targetPath Duplicate target path.
 * @param {string} relativeTarget Relative target for symlinks.
 * @return {string} Single-line shell command preview or empty string.
 */
function buildCommandPreview(effectiveAction, masterPath, targetPath, relativeTarget) {
	if (effectiveAction === 'hardlink') {
		return `ln -f ${shellQuote(masterPath)} ${shellQuote(targetPath)}`
	}
	if (effectiveAction === 'symlink') {
		return `ln -sfn ${shellQuote(relativeTarget || masterPath)} ${shellQuote(targetPath)}`
	}
	if (effectiveAction === 'reflink') {
		return `cp --reflink=always -f ${shellQuote(masterPath)} ${shellQuote(targetPath)}`
	}
	return ''
}

/**
 * Simulate hardlink / symlink / reflink / hybrid deduplication across duplicate groups.
 *
 * @param {Array<object>} groups Duplicate group objects.
 * @param {object} [options] Simulation configuration.
 * @param {string} [options.mode='hardlink'] Deduplication link mode.
 * @param {string} [options.strategy='origin_first'] Master selection strategy.
 * @param {object} [options.manualMasters={}] Map of groupKey -> promoted fileKey.
 * @param {Array<string>|Set<string>} [options.excludedTokens=[]] Tokens excluded by user.
 * @return {{
 *   mode: string,
 *   strategy: string,
 *   groupPlans: Array<object>,
 *   operations: Array<object>,
 *   summary: object
 * }} Deterministic simulation state.
 */
export function simulateLinkDeduplication(groups, options = {}) {
	const mode = LINK_MODES.includes(options.mode) ? options.mode : 'hardlink'
	const strategy = MASTER_STRATEGIES.includes(options.strategy) ? options.strategy : 'origin_first'
	const manualMasters = options.manualMasters && typeof options.manualMasters === 'object'
		? options.manualMasters
		: {}
	const excludedSet = options.excludedTokens instanceof Set
		? options.excludedTokens
		: new Set(Array.isArray(options.excludedTokens) ? options.excludedTokens : [])

	const safeGroups = Array.isArray(groups) ? groups.filter(group => group && typeof group === 'object') : []
	const groupPlans = []
	const operations = []

	let readyGroups = 0
	let partialGroups = 0
	let blockedGroups = 0
	let totalTargets = 0
	let readyOperations = 0
	let blockedOperations = 0
	let protectedSkipped = 0
	let zeroByteSkipped = 0
	let excludedByUser = 0
	let reclaimableBytes = 0
	let theoreticalMaxBytes = 0

	safeGroups.forEach((group, groupIndex) => {
		const files = Array.isArray(group.files)
			? group.files.filter(file => file && typeof file === 'object')
			: []
		if (files.length < 2) {
			return
		}

		const groupKey = resolveLinkGroupKey(group, groupIndex)
		const manualKey = Object.prototype.hasOwnProperty.call(manualMasters, groupKey)
			? manualMasters[groupKey]
			: null
		const master = pickMasterTarget(files, strategy, manualKey)
		if (!master) {
			return
		}

		const masterKey = getFileSelectionKey(master)
		const masterPath = normalizePosixPath(master.path || '')
		const masterSize = Math.max(0, Number(master.size) || 0)
		const masterScope = extractStorageScope(master)
		const groupName = resolveGroupName(group, master)

		const targets = []
		let groupReadyCount = 0
		let groupBlockedCount = 0
		let groupProtectedCount = 0
		let groupReclaimableBytes = 0

		files.forEach((file) => {
			const fileKey = getFileSelectionKey(file)
			if (fileKey === masterKey) {
				return
			}

			totalTargets += 1
			const token = `${groupKey}::${String(fileKey ?? file.path ?? targets.length)}`
			const targetPath = normalizePosixPath(file.path || '')
			const targetSize = Math.max(0, Number(file.size) || 0)
			const isProtected = Boolean(file.isInOriginFolder)
			const isLocked = Boolean(file.isLocked)
			const isLivePhoto = Boolean(file.isLivePhoto || file.livePhotoPairId)
			const scopeCheck = checkHardlinkCompatibility(master, file)
			const relativeTarget = computeRelativeSymlinkTarget(targetPath, masterPath)
			const isExcluded = excludedSet.has(token)

			if (targetSize > 0 && !isProtected) {
				theoreticalMaxBytes += targetSize
			}

			const warnings = []
			let status = 'ready'
			let effectiveAction = mode === 'hybrid'
				? (scopeCheck.compatible ? 'hardlink' : 'symlink')
				: mode
			let canLink = true

			if (isProtected) {
				status = 'protected-origin'
				effectiveAction = 'skip'
				canLink = false
				protectedSkipped += 1
				groupProtectedCount += 1
				warnings.push('protected-origin')
			} else if (isLocked) {
				status = 'locked-file'
				effectiveAction = 'skip'
				canLink = false
				blockedOperations += 1
				groupBlockedCount += 1
				warnings.push('file-locked')
			} else if (targetSize <= 0 || masterSize <= 0) {
				status = 'zero-byte-skipped'
				effectiveAction = 'skip'
				canLink = false
				zeroByteSkipped += 1
				warnings.push('zero-byte-no-savings')
			} else if (mode === 'hardlink' && !scopeCheck.compatible) {
				status = 'cross-scope-blocked'
				effectiveAction = 'skip'
				canLink = false
				blockedOperations += 1
				groupBlockedCount += 1
				warnings.push(scopeCheck.reason)
			} else if (mode === 'reflink' && !scopeCheck.compatible) {
				status = 'cross-scope-blocked'
				effectiveAction = 'skip'
				canLink = false
				blockedOperations += 1
				groupBlockedCount += 1
				warnings.push(scopeCheck.reason)
			} else if (isExcluded) {
				status = 'excluded'
				effectiveAction = 'skip'
				excludedByUser += 1
			}

			if (canLink && !scopeCheck.compatible && (mode === 'symlink' || mode === 'hybrid')) {
				warnings.push('cross-scope-symlink-fallback')
			}
			if (isLivePhoto) {
				warnings.push('live-photo-pair')
			}

			const commandPreview = status === 'ready'
				? buildCommandPreview(effectiveAction, masterPath, targetPath, relativeTarget)
				: ''

			if (status === 'ready') {
				readyOperations += 1
				groupReadyCount += 1
				reclaimableBytes += targetSize
				groupReclaimableBytes += targetSize
			}

			const op = {
				token,
				groupKey,
				groupId: group.id ?? null,
				groupHash: group.hash || '',
				groupName,
				fileKey,
				file,
				path: targetPath,
				rawPath: file.path || '',
				sizeBytes: targetSize,
				sizeFormatted: formatBytes(targetSize),
				storageScope: scopeCheck.targetScope,
				isProtected,
				isLocked,
				isLivePhoto,
				isExcluded,
				canLink,
				status,
				effectiveAction,
				relativeTarget,
				commandPreview,
				warnings,
			}

			targets.push(op)
			operations.push(op)
		})

		let groupStatus = 'blocked'
		if (groupReadyCount > 0 && groupBlockedCount === 0 && groupProtectedCount === 0) {
			groupStatus = 'ready'
			readyGroups += 1
		} else if (groupReadyCount > 0) {
			groupStatus = 'partial'
			partialGroups += 1
		} else {
			groupStatus = 'blocked'
			blockedGroups += 1
		}

		groupPlans.push({
			groupKey,
			groupId: group.id ?? null,
			groupHash: group.hash || '',
			groupName,
			rawGroup: group,
			status: groupStatus,
			master: {
				key: masterKey,
				file: master,
				path: masterPath,
				rawPath: master.path || '',
				sizeBytes: masterSize,
				sizeFormatted: formatBytes(masterSize),
				isProtected: Boolean(master.isInOriginFolder),
				storageScope: masterScope,
			},
			filesCount: files.length,
			targets,
			readyCount: groupReadyCount,
			blockedCount: groupBlockedCount,
			protectedCount: groupProtectedCount,
			reclaimableBytes: groupReclaimableBytes,
			reclaimableFormatted: formatBytes(groupReclaimableBytes),
		})
	})

	const efficiencyPercent = theoreticalMaxBytes > 0
		? Math.min(100, Math.round((reclaimableBytes / theoreticalMaxBytes) * 100))
		: 0

	return {
		mode,
		strategy,
		groupPlans,
		operations,
		summary: {
			totalGroups: groupPlans.length,
			readyGroups,
			partialGroups,
			blockedGroups,
			totalTargets,
			readyOperations,
			blockedOperations,
			protectedSkipped,
			zeroByteSkipped,
			excludedByUser,
			inodesConsolidated: readyOperations,
			reclaimableBytes,
			reclaimableFormatted: formatBytes(reclaimableBytes),
			theoreticalMaxBytes,
			theoreticalMaxFormatted: formatBytes(theoreticalMaxBytes),
			efficiencyPercent,
		},
	}
}

/**
 * Filter simulated group plans by status bucket and search query.
 *
 * @param {Array<object>} groupPlans Simulated group plans.
 * @param {object} [filters] Filter options.
 * @param {string} [filters.statusFilter='all'] 'all' | 'ready' | 'warnings' | 'protected'.
 * @param {string} [filters.query=''] Path/hash/group query.
 * @return {Array<object>} Matching group plans.
 */
export function filterSimulatedGroups(groupPlans, filters = {}) {
	if (!Array.isArray(groupPlans)) {
		return []
	}
	const statusFilter = typeof filters.statusFilter === 'string' ? filters.statusFilter : 'all'
	const query = typeof filters.query === 'string' ? filters.query.trim().toLowerCase() : ''

	return groupPlans.filter((plan) => {
		if (!plan) {
			return false
		}
		if (statusFilter === 'ready' && plan.readyCount === 0) {
			return false
		}
		if (statusFilter === 'warnings' && plan.blockedCount === 0 && !plan.targets.some(t => t.warnings.length > 0)) {
			return false
		}
		if (statusFilter === 'protected' && !plan.master.isProtected && plan.protectedCount === 0) {
			return false
		}
		if (!query) {
			return true
		}
		const haystack = [
			plan.groupName,
			plan.groupHash,
			plan.master?.path || '',
			...plan.targets.map(t => `${t.path} ${t.storageScope}`),
		].join(' ').toLowerCase()
		return haystack.includes(query)
	})
}

/**
 * Generate a dry-run-first POSIX shell script with atomic backup staging and rollback helper.
 *
 * @param {object} simulation Result from simulateLinkDeduplication.
 * @param {object} [options] Generation options.
 * @param {string} [options.generatedAt] Optional ISO timestamp.
 * @param {string} [options.dataRoot=''] Optional filesystem root prefix for server-side execution.
 * @return {string} POSIX bash script text.
 */
export function buildExecutionShellScript(simulation, options = {}) {
	const generatedAt = typeof options.generatedAt === 'string' && options.generatedAt
		? options.generatedAt
		: new Date().toISOString()
	const dataRoot = typeof options.dataRoot === 'string' ? options.dataRoot.trim().replace(/\/+$/, '') : ''
	const ops = Array.isArray(simulation?.operations)
		? simulation.operations.filter(op => op && op.status === 'ready')
		: []

	const prefixPath = (path) => {
		const clean = normalizePosixPath(path)
		return dataRoot ? `${dataRoot}${clean}` : clean
	}

	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		`# Nextcloud DuplicateFinder Link Deduplication Plan (${simulation?.mode || 'hardlink'})`,
		`# Generated: ${generatedAt}`,
		`# Planned operations: ${ops.length} (${simulation?.summary?.reclaimableFormatted || '0 B'} saved)`,
		'# Safety: runs in DRY_RUN=1 by default. Set DRY_RUN=0 to execute.',
		'',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'BACKUP_SUFFIX=".dedupe-bak.$$"',
		'LINKED=0',
		'SKIPPED=0',
		'',
		'apply_link() {',
		'  local action="$1"',
		'  local master="$2"',
		'  local target="$3"',
		'  local rel_target="$4"',
		'  local expected_size="$5"',
		'  if [[ ! -f "$master" || ! -f "$target" ]]; then',
		'    echo "[SKIP] Missing file: $master -> $target"',
		'    SKIPPED=$((SKIPPED + 1))',
		'    return 0',
		'  fi',
		'  local actual_size',
		'  actual_size=$(wc -c < "$target" | tr -d " ")',
		'  if [[ "$actual_size" != "$expected_size" ]]; then',
		'    echo "[SKIP] Size mismatch on $target (expected $expected_size, got $actual_size)"',
		'    SKIPPED=$((SKIPPED + 1))',
		'    return 0',
		'  fi',
		'  if [[ "$DRY_RUN" != "0" ]]; then',
		'    echo "[DRY-RUN][$action] $target -> $master"',
		'    LINKED=$((LINKED + 1))',
		'    return 0',
		'  fi',
		'  local backup="$target$BACKUP_SUFFIX"',
		'  mv -f "$target" "$backup"',
		'  if [[ "$action" == "hardlink" ]]; then',
		'    ln "$master" "$target" || { mv -f "$backup" "$target"; return 1; }',
		'  elif [[ "$action" == "symlink" ]]; then',
		'    ln -s "$rel_target" "$target" || { mv -f "$backup" "$target"; return 1; }',
		'  elif [[ "$action" == "reflink" ]]; then',
		'    cp --reflink=always "$master" "$target" || { mv -f "$backup" "$target"; return 1; }',
		'  fi',
		'  rm -f "$backup"',
		'  echo "[LINKED][$action] $target"',
		'  LINKED=$((LINKED + 1))',
		'}',
		'',
	]

	if (ops.length === 0) {
		lines.push('echo "No ready link operations in current plan."')
	} else {
		const groupMap = new Map((simulation?.groupPlans || []).map(g => [g.groupKey, g]))
		for (const op of ops) {
			const groupPlan = groupMap.get(op.groupKey)
			const masterPath = prefixPath(groupPlan?.master?.path || '')
			const targetPath = prefixPath(op.path)
			lines.push(
				`apply_link ${shellQuote(op.effectiveAction)} ${shellQuote(masterPath)} ${shellQuote(targetPath)} ${shellQuote(op.relativeTarget || masterPath)} ${shellQuote(String(op.sizeBytes))}`
			)
		}
	}

	lines.push(
		'',
		'echo "Summary: linked=$LINKED skipped=$SKIPPED (DRY_RUN=$DRY_RUN)"',
		'# Optional Nextcloud metadata refresh after DRY_RUN=0:',
		'# sudo -u www-data php occ files:scan --all',
		''
	)

	return lines.join('\n')
}

/**
 * Build deterministic JSON payload for the simulated link deduplication plan.
 *
 * @param {object} simulation Simulation object.
 * @param {string} [generatedAt] ISO timestamp.
 * @return {string} Formatted JSON string.
 */
export function buildLinkPlanJson(simulation, generatedAt) {
	const timestamp = typeof generatedAt === 'string' && generatedAt
		? generatedAt
		: new Date().toISOString()
	const payload = {
		schema: LINK_PLAN_SCHEMA,
		generatedAt: timestamp,
		mode: simulation?.mode || 'hardlink',
		strategy: simulation?.strategy || 'origin_first',
		summary: simulation?.summary || {},
		groups: (simulation?.groupPlans || []).map(plan => ({
			groupKey: plan.groupKey,
			groupId: plan.groupId,
			groupHash: plan.groupHash,
			status: plan.status,
			master: {
				path: plan.master.path,
				sizeBytes: plan.master.sizeBytes,
				isProtected: plan.master.isProtected,
				storageScope: plan.master.storageScope,
			},
			reclaimableBytes: plan.reclaimableBytes,
			targets: plan.targets.map(target => ({
				path: target.path,
				sizeBytes: target.sizeBytes,
				status: target.status,
				effectiveAction: target.effectiveAction,
				relativeTarget: target.relativeTarget,
				isProtected: target.isProtected,
				warnings: target.warnings,
				commandPreview: target.commandPreview,
			})),
		})),
	}
	return JSON.stringify(payload, null, 2)
}

/**
 * Build CWE-1236-safe RFC 4180 CSV export for the simulated link plan.
 *
 * @param {object} simulation Simulation object.
 * @return {string} CRLF CSV string.
 */
export function buildLinkPlanCsv(simulation) {
	const headers = [
		'GroupHash',
		'MasterPath',
		'MasterProtected',
		'TargetPath',
		'TargetProtected',
		'SizeBytes',
		'Mode',
		'EffectiveAction',
		'Status',
		'RelativeTarget',
		'Warnings',
		'CommandPreview',
	]
	const rows = [headers.map(escapeCsvCell).join(',')]
	const groupMap = new Map((simulation?.groupPlans || []).map(g => [g.groupKey, g]))

	for (const op of (simulation?.operations || [])) {
		const plan = groupMap.get(op.groupKey)
		rows.push([
			op.groupHash || '',
			plan?.master?.rawPath || plan?.master?.path || '',
			plan?.master?.isProtected ? 'true' : 'false',
			op.rawPath || op.path || '',
			op.isProtected ? 'true' : 'false',
			String(op.sizeBytes ?? 0),
			simulation?.mode || 'hardlink',
			op.effectiveAction || 'skip',
			op.status || '',
			op.relativeTarget || '',
			(op.warnings || []).join(';'),
			op.commandPreview || '',
		].map(escapeCsvCell).join(','))
	}

	return rows.join('\r\n')
}
