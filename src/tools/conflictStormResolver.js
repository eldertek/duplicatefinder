/**
 * Pure Sync-Conflict Storm & Cloud Import Fork Resolver for Nextcloud DuplicateFinder.
 * Detects Nextcloud Desktop conflicted copies, Syncthing sync-conflict forks,
 * Dropbox/Seafile conflicts, OneDrive/SharePoint host suffixes, Google Drive/iCloud
 * numbered re-uploads, and Explorer/Finder Copy forks; clusters them into canonical
 * lineages; separates verified exact byte-clones from divergent edits requiring manual
 * merge; and generates DRY_RUN=1 POSIX quarantine/reclaim scripts, CWE-1236-safe CSV
 * reports, and structured JSON manifests.
 * Zero DOM dependencies, zero network side effects.
 */

import { normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { formatBytes } from './duplicateStats'

export const CONFLICT_STORM_SCHEMA = 'duplicatefinder.conflict-storm.v1'

export const CONFLICT_SURVIVOR_RULES = Object.freeze([
	'canonical-clean-name',
	'newest-mtime',
	'largest-payload',
	'origin-first',
])

export const CONFLICT_RECLAIM_MODES = Object.freeze([
	'quarantine',
	'delete-clones',
])

export const CONFLICT_CLUSTER_SCOPES = Object.freeze([
	'same-folder',
	'cross-folder',
])

export const CONFLICT_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'forks_desc',
	'severity_desc',
	'name_asc',
])

export const CONFLICT_CLASSIFICATION_FILTERS = Object.freeze([
	'all',
	'exact-clone',
	'divergent-active',
	'stale-fork',
	'orphan-storm',
])

export const CONFLICT_VENDORS = Object.freeze({
	'nextcloud-desktop': {
		id: 'nextcloud-desktop',
		label: 'Nextcloud / ownCloud Conflict',
		shortLabel: 'Nextcloud',
		order: 0,
	},
	syncthing: {
		id: 'syncthing',
		label: 'Syncthing Conflict',
		shortLabel: 'Syncthing',
		order: 1,
	},
	'dropbox-seafile': {
		id: 'dropbox-seafile',
		label: 'Dropbox / Seafile Conflict',
		shortLabel: 'Dropbox/Seafile',
		order: 2,
	},
	'onedrive-host': {
		id: 'onedrive-host',
		label: 'OneDrive / Host Fork',
		shortLabel: 'OneDrive/Host',
		order: 3,
	},
	'numbered-import': {
		id: 'numbered-import',
		label: 'Cloud Numbered Fork (1)/(2)',
		shortLabel: 'Numbered (N)',
		order: 4,
	},
	'copy-fork': {
		id: 'copy-fork',
		label: 'Explorer / Finder Copy Fork',
		shortLabel: 'Copy Fork',
		order: 5,
	},
})

export const CONFLICT_STORM_PRESETS = Object.freeze([
	{
		id: 'safe-exact-clones',
		name: 'Safe Quarantine (Exact Clones)',
		description: 'Stage verified identical byte-clone conflict forks into quarantine; block all divergent edits and protect canonical originals.',
		reclaimMode: 'quarantine',
		survivorRule: 'canonical-clean-name',
		includeStaleForks: false,
		clusterScope: 'same-folder',
		minForkCount: 1,
	},
	{
		id: 'cloud-import-sweep',
		name: 'Cloud Import Storm Sweep',
		description: 'Cluster cross-folder OneDrive, Dropbox, Syncthing, and Google Drive (1)/(2) forks and stage clones plus older stale forks.',
		reclaimMode: 'quarantine',
		survivorRule: 'canonical-clean-name',
		includeStaleForks: true,
		clusterScope: 'cross-folder',
		minForkCount: 1,
	},
	{
		id: 'strict-clone-purge',
		name: 'Strict Byte-Clone Purge',
		description: 'Only delete forks with identical size and verified group/hash match; never delete divergent, stale, or orphan conflicts.',
		reclaimMode: 'delete-clones',
		survivorRule: 'canonical-clean-name',
		includeStaleForks: false,
		clusterScope: 'same-folder',
		minForkCount: 1,
	},
])

const MULTI_PART_EXTENSIONS = Object.freeze([
	'.tar.gz',
	'.tar.bz2',
	'.tar.xz',
	'.tar.zst',
	'.user.js',
])

const SEVERITY_ORDER = Object.freeze({
	critical: 0,
	high: 1,
	moderate: 2,
	low: 3,
})

/**
 * Retrieve a conflict storm preset by ID with fallback to the default safe preset.
 *
 * @param {string} presetId - Preset identifier.
 * @return {object} Matching preset object.
 */
export function getConflictStormPreset(presetId) {
	return CONFLICT_STORM_PRESETS.find(item => item.id === presetId) || CONFLICT_STORM_PRESETS[0]
}

/**
 * Escape an arbitrary string for safe single-quoted POSIX shell usage.
 *
 * @param {*} value - Raw value.
 * @return {string} POSIX single-quoted literal.
 */
export function escapePosixSingleQuote(value) {
	const raw = value === null || value === undefined ? '' : String(value)
	return `'${raw.replace(/'/g, "'\\''")}'`
}

/**
 * Split a filename into stem and extension while preserving dotfiles and multi-part tar extensions.
 *
 * @param {string} rawFilename - Basename of file.
 * @return {{ stem: string, extension: string }} Split parts.
 */
export function splitFilenameAndExt(rawFilename) {
	const name = typeof rawFilename === 'string' ? rawFilename : ''
	if (!name) {
		return { stem: '', extension: '' }
	}
	const lower = name.toLowerCase()
	for (const multiExt of MULTI_PART_EXTENSIONS) {
		if (lower.endsWith(multiExt) && name.length > multiExt.length) {
			const cut = name.length - multiExt.length
			return {
				stem: name.slice(0, cut),
				extension: name.slice(cut),
			}
		}
	}
	const dotIndex = name.lastIndexOf('.')
	if (dotIndex <= 0) {
		return { stem: name, extension: '' }
	}
	return {
		stem: name.slice(0, dotIndex),
		extension: name.slice(dotIndex),
	}
}

/**
 * Match a single conflict suffix pattern on a file stem.
 *
 * @param {string} stem - File stem without extension.
 * @return {object|null} Match descriptor or null when stem looks clean.
 */
function matchSingleConflictSuffix(stem) {
	if (!stem || typeof stem !== 'string') {
		return null
	}

	// 1. Syncthing: <name>.sync-conflict-20261120-140312-ABCDEF1
	const syncthingMatch = /^(.+?)\.sync-conflict-(\d{8}-\d{6})(?:-([A-Za-z0-9]+))?$/i.exec(stem)
	if (syncthingMatch) {
		return {
			vendorId: 'syncthing',
			baseStem: syncthingMatch[1],
			conflictTag: stem.slice(syncthingMatch[1].length),
			conflictTimestamp: syncthingMatch[2] || '',
			conflictDeviceOrActor: syncthingMatch[3] || '',
		}
	}

	// 2. Dropbox / Seafile: <name> (Alice's conflicted copy 2026-11-20) or (SFConflict user@host 2026-11-20-14-03-12)
	const dropboxUserMatch = /^(.+?)\s+\(([^()]+?'s conflicted copy(?:\s+[^)]*)?)\)$/i.exec(stem)
	if (dropboxUserMatch) {
		const tagInner = dropboxUserMatch[2]
		const tsMatch = /(\d{4}-\d{2}-\d{2}(?:[T _-]\d{2}[:-]?\d{2}(?:[:-]?\d{2})?)?)/.exec(tagInner)
		const actorMatch = /^([^']+)'s conflicted copy/i.exec(tagInner)
		return {
			vendorId: 'dropbox-seafile',
			baseStem: dropboxUserMatch[1],
			conflictTag: stem.slice(dropboxUserMatch[1].length).trim(),
			conflictTimestamp: tsMatch ? tsMatch[1] : '',
			conflictDeviceOrActor: actorMatch ? actorMatch[1].trim() : '',
		}
	}

	const seafileMatch = /^(.+?)\s+\(SFConflict\s+([^)\s]+)(?:\s+([^)]+))?\)$/i.exec(stem)
	if (seafileMatch) {
		return {
			vendorId: 'dropbox-seafile',
			baseStem: seafileMatch[1],
			conflictTag: stem.slice(seafileMatch[1].length).trim(),
			conflictTimestamp: seafileMatch[3] ? seafileMatch[3].trim() : '',
			conflictDeviceOrActor: seafileMatch[2] ? seafileMatch[2].trim() : '',
		}
	}

	const bracketConflictMatch = /^(.+?)\s+\[(conflict[^\]]*)\]$/i.exec(stem)
	if (bracketConflictMatch) {
		return {
			vendorId: 'dropbox-seafile',
			baseStem: bracketConflictMatch[1],
			conflictTag: `[${bracketConflictMatch[2]}]`,
			conflictTimestamp: '',
			conflictDeviceOrActor: '',
		}
	}

	// 3. Nextcloud / ownCloud Desktop: <name> (conflicted copy 2026-11-20 140312) or (conflicted copy from laptop ...)
	const nextcloudMatch = /^(.+?)\s+\(conflicted copy([^)]*)\)$/i.exec(stem)
	if (nextcloudMatch) {
		const details = (nextcloudMatch[2] || '').trim()
		const tsMatch = /(\d{4}-\d{2}-\d{2}(?:[T _-]\d{2}[:-]?\d{2}(?:[:-]?\d{2})?)?|\d{8}[T_-]?\d{6})/.exec(details)
		const fromMatch = /\bfrom\s+([A-Za-z0-9._-]+)/i.exec(details)
		return {
			vendorId: 'nextcloud-desktop',
			baseStem: nextcloudMatch[1],
			conflictTag: stem.slice(nextcloudMatch[1].length).trim(),
			conflictTimestamp: tsMatch ? tsMatch[1] : '',
			conflictDeviceOrActor: fromMatch ? fromMatch[1] : '',
		}
	}

	// 4. OneDrive / SharePoint host suffixes: <name>-DESKTOP-A1B2C3, <name>-LAPTOP-XYZ, <name>-MacBook-Pro
	const onedriveMatch = /^(.+?)-((?:DESKTOP|LAPTOP|WORKSTATION|WIN|PC)-[A-Za-z0-9_-]{2,}|MacBook(?:-(?:Pro|Air))?(?:-\d+)?|iMac(?:-\d+)?)$/.exec(stem)
	if (onedriveMatch) {
		return {
			vendorId: 'onedrive-host',
			baseStem: onedriveMatch[1],
			conflictTag: `-${onedriveMatch[2]}`,
			conflictTimestamp: '',
			conflictDeviceOrActor: onedriveMatch[2],
		}
	}

	// 5. Explorer / Finder Copy forks: <name> - Copy (2), <name> - Copie, <name>_copy, <name> copy 2
	const copyDashMatch = /^(.+?)\s+-\s+(?:Copy|Copie)(?:\s+\((\d+)\))?$/i.exec(stem)
	if (copyDashMatch) {
		return {
			vendorId: 'copy-fork',
			baseStem: copyDashMatch[1],
			conflictTag: stem.slice(copyDashMatch[1].length).trim(),
			conflictTimestamp: '',
			conflictDeviceOrActor: '',
		}
	}

	const copyWordMatch = /^(.+?)(?:\s+|_)(?:copy|copie)(?:[\s_-]?(\d+))?$/i.exec(stem)
	if (copyWordMatch) {
		return {
			vendorId: 'copy-fork',
			baseStem: copyWordMatch[1],
			conflictTag: stem.slice(copyWordMatch[1].length).trim(),
			conflictTimestamp: '',
			conflictDeviceOrActor: '',
		}
	}

	// 6. Numbered cloud/browser import forks: <name> (1), <name> (2)
	const numberedMatch = /^(.+?)\s*\((\d{1,3})\)$/.exec(stem)
	if (numberedMatch) {
		const num = Number(numberedMatch[2])
		// Guard against legitimate years like "Budget (2025)" or "Report (2026)"
		if (num >= 1 && num <= 99) {
			return {
				vendorId: 'numbered-import',
				baseStem: numberedMatch[1].trimEnd(),
				conflictTag: `(${numberedMatch[2]})`,
				conflictTimestamp: '',
				conflictDeviceOrActor: '',
			}
		}
	}

	return null
}

/**
 * Parse a filename into canonical stem + detected sync-conflict/import fork metadata.
 * Iteratively peels up to 3 stacked conflict suffixes (e.g. "report (1) (conflicted copy ...).pdf").
 *
 * @param {string} rawFilename - Basename of file.
 * @return {object} Parsed conflict fork metadata.
 */
export function parseConflictFork(rawFilename) {
	const originalFilename = typeof rawFilename === 'string' ? rawFilename : ''
	const { stem, extension } = splitFilenameAndExt(originalFilename)
	let workingStem = stem
	const tags = []
	let primaryVendorId = 'canonical'
	let conflictTimestamp = ''
	let conflictDeviceOrActor = ''

	for (let pass = 0; pass < 3; pass += 1) {
		const hit = matchSingleConflictSuffix(workingStem)
		if (!hit || !hit.baseStem || hit.baseStem.trim().length === 0) {
			break
		}
		if (primaryVendorId === 'canonical') {
			primaryVendorId = hit.vendorId
		}
		if (!conflictTimestamp && hit.conflictTimestamp) {
			conflictTimestamp = hit.conflictTimestamp
		}
		if (!conflictDeviceOrActor && hit.conflictDeviceOrActor) {
			conflictDeviceOrActor = hit.conflictDeviceOrActor
		}
		tags.unshift(hit.conflictTag)
		workingStem = hit.baseStem
	}

	const isConflictFork = primaryVendorId !== 'canonical'
	const canonicalStem = workingStem.trimEnd() || stem
	const canonicalFilename = `${canonicalStem}${extension}`
	const vendorMeta = CONFLICT_VENDORS[primaryVendorId] || null

	return {
		isConflictFork,
		vendorId: primaryVendorId,
		vendorLabel: vendorMeta ? vendorMeta.label : 'Canonical Original',
		vendorShortLabel: vendorMeta ? vendorMeta.shortLabel : 'Canonical',
		originalFilename,
		canonicalStem,
		extension,
		canonicalFilename,
		canonicalKeyFilename: `${canonicalStem.toLowerCase()}${extension.toLowerCase()}`,
		conflictTag: tags.join(' '),
		conflictTimestamp,
		conflictDeviceOrActor,
	}
}

/**
 * Parse a timestamp value into epoch milliseconds, handling Unix seconds vs milliseconds cleanly.
 *
 * @param {*} value - Candidate mtime/modified field.
 * @return {number|null} Timestamp in ms or null.
 */
export function parseFileTimestampMs(value) {
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
		return value < 1e11 ? value * 1000 : value
	}
	if (typeof value === 'string') {
		const trimmed = value.trim()
		if (!trimmed) {
			return null
		}
		if (/^\d+(\.\d+)?$/.test(trimmed)) {
			const num = Number(trimmed)
			if (!Number.isFinite(num) || num <= 0) {
				return null
			}
			return num < 1e11 ? num * 1000 : num
		}
		const parsed = Date.parse(trimmed)
		return Number.isFinite(parsed) ? parsed : null
	}
	return null
}

/**
 * Extract normalized full path, parent folder, basename, and user root from a Nextcloud file path.
 * Preserves `/<user>/files/...` prefix so cross-user files never collide and POSIX/occ paths stay exact.
 *
 * @param {string} rawPath - File path.
 * @return {{ normalizedPath: string, displayPath: string, dirPath: string, filename: string, userRoot: string }} Path segments.
 */
export function splitConflictFilePath(rawPath) {
	if (typeof rawPath !== 'string' || rawPath.trim() === '') {
		return {
			normalizedPath: '',
			displayPath: '',
			dirPath: '/',
			filename: '',
			userRoot: '/',
		}
	}
	const cleaned = rawPath.trim().replace(/\\/g, '/').replace(/\/{2,}/g, '/')
	const normalizedPath = cleaned.startsWith('/') ? cleaned : `/${cleaned}`
	const displayPath = normalizePathForDiff(normalizedPath) || normalizedPath
	const parts = normalizedPath.split('/').filter(Boolean)
	const filename = parts.length > 0 ? parts[parts.length - 1] : ''
	const dirParts = parts.slice(0, -1)
	const dirPath = dirParts.length > 0 ? `/${dirParts.join('/')}` : '/'
	const userMatch = /^\/([^/]+)\/files(?:\/|$)/.exec(normalizedPath)
	const userRoot = userMatch ? `/${userMatch[1]}` : (parts.length > 0 ? `/${parts[0]}` : '/')
	return {
		normalizedPath,
		displayPath,
		dirPath,
		filename,
		userRoot,
	}
}

/**
 * Extract the best available numeric mtime (ms) from a file entry.
 *
 * @param {object} file - File record.
 * @return {number|null} Timestamp in ms or null.
 */
function getBestFileMtimeMs(file) {
	if (!file || typeof file !== 'object') {
		return null
	}
	for (const key of ['mtime', 'modified', 'updatedAt', 'lastModified', 'mtimeMs']) {
		if (Object.prototype.hasOwnProperty.call(file, key)) {
			const ms = parseFileTimestampMs(file[key])
			if (ms !== null) {
				return ms
			}
		}
	}
	return null
}

/**
 * Format epoch milliseconds as an ISO date/time string (UTC YYYY-MM-DD HH:MM).
 *
 * @param {number|null} ms - Epoch milliseconds.
 * @return {string} Formatted UTC date or 'unknown'.
 */
export function formatConflictTimestamp(ms) {
	if (!Number.isFinite(ms) || ms <= 0) {
		return 'unknown'
	}
	return new Date(ms).toISOString().slice(0, 16).replace('T', ' ')
}

/**
 * Deterministic comparator for choosing the canonical survivor inside a conflict lineage.
 * Negative return means `a` is preferred over `b`.
 *
 * @param {object} a - First file member.
 * @param {object} b - Second file member.
 * @param {string} rule - Survivor rule ID.
 * @return {number} Sort delta.
 */
function compareSurvivorCandidates(a, b, rule) {
	const cleanScoreA = a.forkMeta.isConflictFork ? 1 : 0
	const cleanScoreB = b.forkMeta.isConflictFork ? 1 : 0
	const originScoreA = (a.origin || a.locked) ? 0 : 1
	const originScoreB = (b.origin || b.locked) ? 0 : 1
	const mtimeA = a.mtimeMs !== null ? a.mtimeMs : -1
	const mtimeB = b.mtimeMs !== null ? b.mtimeMs : -1

	if (rule === 'newest-mtime') {
		if (mtimeA !== mtimeB) {
			return mtimeB - mtimeA
		}
		if (cleanScoreA !== cleanScoreB) {
			return cleanScoreA - cleanScoreB
		}
		if (originScoreA !== originScoreB) {
			return originScoreA - originScoreB
		}
	} else if (rule === 'largest-payload') {
		if (a.size !== b.size) {
			return b.size - a.size
		}
		if (cleanScoreA !== cleanScoreB) {
			return cleanScoreA - cleanScoreB
		}
		if (mtimeA !== mtimeB) {
			return mtimeB - mtimeA
		}
	} else if (rule === 'origin-first') {
		if (originScoreA !== originScoreB) {
			return originScoreA - originScoreB
		}
		if (cleanScoreA !== cleanScoreB) {
			return cleanScoreA - cleanScoreB
		}
		if (mtimeA !== mtimeB) {
			return mtimeB - mtimeA
		}
	} else {
		// canonical-clean-name (default)
		if (cleanScoreA !== cleanScoreB) {
			return cleanScoreA - cleanScoreB
		}
		if (originScoreA !== originScoreB) {
			return originScoreA - originScoreB
		}
		if (mtimeA !== mtimeB) {
			return mtimeB - mtimeA
		}
		if (a.size !== b.size) {
			return b.size - a.size
		}
	}

	if (a.normalizedPath.length !== b.normalizedPath.length) {
		return a.normalizedPath.length - b.normalizedPath.length
	}
	if (a.normalizedPath < b.normalizedPath) {
		return -1
	}
	if (a.normalizedPath > b.normalizedPath) {
		return 1
	}
	return 0
}

/**
 * Determine whether two member records are verified byte-identical clones.
 *
 * @param {object} member - Candidate fork member.
 * @param {object} survivor - Canonical survivor member.
 * @return {boolean} True when both belong to the same hash/group and share exact byte size.
 */
function isVerifiedExactByteClone(member, survivor) {
	if (!member || !survivor || member.size !== survivor.size) {
		return false
	}
	const hasSameGroup = (
		member.groupId !== null
		&& member.groupId !== undefined
		&& survivor.groupId !== null
		&& survivor.groupId !== undefined
		&& String(member.groupId) === String(survivor.groupId)
	)
	const hasSameHash = (
		Boolean(member.groupHash)
		&& Boolean(survivor.groupHash)
		&& member.groupHash === survivor.groupHash
	)
	return hasSameGroup || hasSameHash
}

/**
 * Analyze duplicate groups to detect sync-conflict storms, cloud import forks,
 * byte-clone vs divergent-edit classifications, and folder hotspots.
 *
 * @param {Array<object>} duplicateGroups - Duplicate groups from Nextcloud DuplicateFinder.
 * @param {object} [options] - Analysis policy and view filters.
 * @return {object} Complete conflict storm analysis result.
 */
export function analyzeConflictStorms(duplicateGroups, options = {}) {
	const preset = getConflictStormPreset(options.presetId)
	const reclaimMode = CONFLICT_RECLAIM_MODES.includes(options.reclaimMode)
		? options.reclaimMode
		: preset.reclaimMode
	const survivorRule = CONFLICT_SURVIVOR_RULES.includes(options.survivorRule)
		? options.survivorRule
		: preset.survivorRule
	const includeStaleForks = typeof options.includeStaleForks === 'boolean'
		? options.includeStaleForks
		: preset.includeStaleForks
	const clusterScope = CONFLICT_CLUSTER_SCOPES.includes(options.clusterScope)
		? options.clusterScope
		: preset.clusterScope
	const parsedMinForks = Number(options.minForkCount)
	const minForkCount = Number.isFinite(parsedMinForks)
		? Math.min(100, Math.max(1, Math.floor(parsedMinForks)))
		: preset.minForkCount
	const vendorFilter = typeof options.vendorFilter === 'string' && options.vendorFilter
		? options.vendorFilter
		: 'all'
	const classificationFilter = CONFLICT_CLASSIFICATION_FILTERS.includes(options.classificationFilter)
		? options.classificationFilter
		: 'all'
	const searchQuery = typeof options.searchQuery === 'string'
		? options.searchQuery.trim().toLowerCase()
		: ''
	const sortMode = CONFLICT_SORT_MODES.includes(options.sortMode)
		? options.sortMode
		: 'reclaim_desc'
	const survivorOverrides = (options.survivorOverrides && typeof options.survivorOverrides === 'object')
		? options.survivorOverrides
		: {}
	const lineageOverrides = (options.lineageOverrides && typeof options.lineageOverrides === 'object')
		? options.lineageOverrides
		: {}

	const groups = Array.isArray(duplicateGroups) ? duplicateGroups : []
	const seenFileKeys = new Set()
	const clusterMap = new Map()

	for (const group of groups) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		const groupId = group.id !== undefined && group.id !== null ? group.id : null
		const groupHash = typeof group.hash === 'string' ? group.hash.trim() : ''
		const groupSize = Number.isFinite(Number(group.size)) ? Math.max(0, Number(group.size)) : 0

		for (const file of group.files) {
			if (!file || typeof file !== 'object') {
				continue
			}
			const { normalizedPath, dirPath, filename, userRoot } = splitConflictFilePath(file.path)
			if (!normalizedPath || !filename) {
				continue
			}
			const fileKey = getFileSelectionKey(file)
			const dedupKey = `${normalizedPath}::${String(fileKey ?? '')}`
			if (seenFileKeys.has(dedupKey)) {
				continue
			}
			seenFileKeys.add(dedupKey)

			const forkMeta = parseConflictFork(filename)
			const fileSize = Number.isFinite(Number(file.size)) ? Math.max(0, Number(file.size)) : groupSize
			const mtimeMs = getBestFileMtimeMs(file)
			const record = {
				fileKey: fileKey !== null && fileKey !== undefined ? String(fileKey) : normalizedPath,
				id: file.id ?? null,
				nodeId: file.nodeId ?? null,
				groupId,
				groupHash: (typeof file.hash === 'string' && file.hash.trim()) ? file.hash.trim() : groupHash,
				size: fileSize,
				formattedSize: formatBytes(fileSize),
				mtimeMs,
				formattedMtime: formatConflictTimestamp(mtimeMs),
				origin: Boolean(file.origin),
				locked: Boolean(file.locked),
				normalizedPath,
				dirPath,
				filename,
				userRoot,
				forkMeta,
			}

			const scopePrefix = clusterScope === 'cross-folder'
				? userRoot.toLowerCase()
				: dirPath.toLowerCase()
			const lineageId = `${scopePrefix}::${forkMeta.canonicalKeyFilename}`

			if (!clusterMap.has(lineageId)) {
				clusterMap.set(lineageId, {
					lineageId,
					canonicalFilename: forkMeta.canonicalFilename,
					canonicalDir: dirPath,
					userRoot,
					members: [],
				})
			}
			clusterMap.get(lineageId).members.push(record)
		}
	}

	const allLineages = []
	const hotspotMap = new Map()
	const vendorCounts = {}
	for (const key of Object.keys(CONFLICT_VENDORS)) {
		vendorCounts[key] = 0
	}

	let totalForksCount = 0
	let exactCloneForksCount = 0
	let staleForksCount = 0
	let divergentForksCount = 0
	let protectedForksCount = 0
	let orphanStormsCount = 0
	let totalReclaimableBytes = 0
	let totalDivergentBytes = 0

	for (const cluster of clusterMap.values()) {
		const conflictMembers = cluster.members.filter(m => m.forkMeta.isConflictFork)
		if (conflictMembers.length === 0 || conflictMembers.length < minForkCount) {
			continue
		}

		const sortedCandidates = [...cluster.members].sort((a, b) => compareSurvivorCandidates(a, b, survivorRule))
		const overrideKey = survivorOverrides[cluster.lineageId]
		let survivor = sortedCandidates[0]
		let survivorSource = 'auto-rule'
		if (overrideKey) {
			const matchedOverride = sortedCandidates.find(m => m.fileKey === String(overrideKey))
			if (matchedOverride) {
				survivor = matchedOverride
				survivorSource = 'operator-override'
			}
		}

		const hasCleanCanonical = cluster.members.some(m => !m.forkMeta.isConflictFork)
		const isOrphanStorm = !hasCleanCanonical
		const lineageOverride = lineageOverrides[cluster.lineageId] || ''
		const effectiveLineageMode = (lineageOverride === 'keep-all' || lineageOverride === 'quarantine' || lineageOverride === 'delete-clones')
			? lineageOverride
			: reclaimMode

		let lineageReclaimableBytes = 0
		let lineageDivergentBytes = 0
		let lineageExactClones = 0
		let lineageStaleForks = 0
		let lineageDivergentForks = 0
		let lineageProtectedForks = 0
		const lineageVendors = new Set()

		const classifiedMembers = sortedCandidates.map((member) => {
			if (member.forkMeta.isConflictFork) {
				lineageVendors.add(member.forkMeta.vendorId)
				vendorCounts[member.forkMeta.vendorId] = (vendorCounts[member.forkMeta.vendorId] || 0) + 1
			}

			if (member.fileKey === survivor.fileKey) {
				return {
					...member,
					role: 'canonical-survivor',
					classification: 'canonical-survivor',
					action: 'keep',
					canAutoReclaim: false,
					safetyNote: isOrphanStorm
						? 'Provisional survivor (no clean base filename found; consider renaming to canonical name).'
						: 'Canonical survivor preserved as master copy.',
				}
			}

			if (member.origin || member.locked) {
				lineageProtectedForks += 1
				return {
					...member,
					role: member.forkMeta.isConflictFork ? 'fork' : 'sibling',
					classification: 'protected-fork',
					action: 'keep',
					canAutoReclaim: false,
					safetyNote: member.origin
						? 'Protected by Nextcloud Origin Folder setting.'
						: 'Protected by file lock.',
				}
			}

			const exactClone = isVerifiedExactByteClone(member, survivor)
			if (exactClone) {
				lineageExactClones += 1
				if (effectiveLineageMode === 'keep-all') {
					return {
						...member,
						role: member.forkMeta.isConflictFork ? 'fork' : 'sibling',
						classification: 'exact-clone',
						action: 'keep',
						canAutoReclaim: false,
						safetyNote: 'Verified identical byte-clone held by operator keep-all override.',
					}
				}
				lineageReclaimableBytes += member.size
				const action = effectiveLineageMode === 'delete-clones' ? 'delete' : 'quarantine'
				return {
					...member,
					role: member.forkMeta.isConflictFork ? 'fork' : 'sibling',
					classification: 'exact-clone',
					action,
					canAutoReclaim: true,
					safetyNote: action === 'delete'
						? 'Verified identical hash & byte size; safe for clone removal.'
						: 'Verified identical hash & byte size; safe to stage in conflict archive.',
				}
			}

			const isNewer = (
				member.mtimeMs !== null
				&& survivor.mtimeMs !== null
				&& member.mtimeMs > survivor.mtimeMs
			)
			const isLarger = member.size > survivor.size
			const indeterminateDiff = (member.mtimeMs === null && survivor.mtimeMs === null && member.size !== survivor.size)

			if (isNewer || isLarger || indeterminateDiff) {
				lineageDivergentForks += 1
				lineageDivergentBytes += member.size
				return {
					...member,
					role: member.forkMeta.isConflictFork ? 'fork' : 'sibling',
					classification: 'divergent-active',
					action: 'review-merge',
					canAutoReclaim: false,
					safetyNote: isNewer
						? 'Divergent edit: newer mtime and different payload than canonical survivor; manual merge required.'
						: 'Divergent edit: payload size/hash differs from canonical survivor; blocked from auto-cleanup.',
				}
			}

			lineageStaleForks += 1
			const canStageStale = (
				effectiveLineageMode === 'quarantine'
				&& includeStaleForks
			)
			if (canStageStale) {
				lineageReclaimableBytes += member.size
			}
			return {
				...member,
				role: member.forkMeta.isConflictFork ? 'fork' : 'sibling',
				classification: 'stale-fork',
				action: canStageStale ? 'quarantine' : 'review-stale',
				canAutoReclaim: canStageStale,
				safetyNote: canStageStale
					? 'Older/smaller non-identical fork staged to quarantine archive (never hard-deleted).'
					: 'Older/smaller non-identical fork retained for review (enable stale quarantine to archive).',
			}
		})

		const vendorList = Array.from(lineageVendors).sort((a, b) => {
			const orderA = CONFLICT_VENDORS[a] ? CONFLICT_VENDORS[a].order : 99
			const orderB = CONFLICT_VENDORS[b] ? CONFLICT_VENDORS[b].order : 99
			return orderA - orderB
		})

		let severity = 'moderate'
		if (lineageDivergentForks >= 2 || conflictMembers.length >= 5 || (isOrphanStorm && lineageDivergentForks >= 1)) {
			severity = 'critical'
		} else if (lineageDivergentForks >= 1 || conflictMembers.length >= 3 || vendorList.length >= 2) {
			severity = 'high'
		} else if (lineageExactClones >= 1 && lineageDivergentForks === 0 && !isOrphanStorm) {
			severity = 'low'
		}

		const occScanPath = survivor.userRoot && survivor.userRoot !== '/'
			? `${survivor.userRoot.replace(/^\/+/, '')}/files`
			: '/files'

		const lineage = {
			lineageId: cluster.lineageId,
			canonicalFilename: survivor.forkMeta.canonicalFilename,
			canonicalDir: survivor.dirPath,
			userRoot: survivor.userRoot,
			occScanPath,
			memberCount: classifiedMembers.length,
			forkCount: conflictMembers.length,
			hasCleanCanonical,
			isOrphanStorm,
			severity,
			vendors: vendorList,
			vendorLabels: vendorList.map(v => (CONFLICT_VENDORS[v] ? CONFLICT_VENDORS[v].shortLabel : v)),
			survivor,
			survivorSource,
			lineageOverride: lineageOverride || '',
			effectiveLineageMode,
			exactCloneCount: lineageExactClones,
			staleForkCount: lineageStaleForks,
			divergentCount: lineageDivergentForks,
			protectedCount: lineageProtectedForks,
			reclaimableBytes: lineageReclaimableBytes,
			formattedReclaimableBytes: formatBytes(lineageReclaimableBytes),
			divergentBytes: lineageDivergentBytes,
			formattedDivergentBytes: formatBytes(lineageDivergentBytes),
			members: classifiedMembers,
			primaryGroupId: survivor.groupId,
		}

		allLineages.push(lineage)

		totalForksCount += conflictMembers.length
		exactCloneForksCount += lineageExactClones
		staleForksCount += lineageStaleForks
		divergentForksCount += lineageDivergentForks
		protectedForksCount += lineageProtectedForks
		if (isOrphanStorm) {
			orphanStormsCount += 1
		}
		totalReclaimableBytes += lineageReclaimableBytes
		totalDivergentBytes += lineageDivergentBytes

		const hotspotKey = survivor.dirPath
		if (!hotspotMap.has(hotspotKey)) {
			hotspotMap.set(hotspotKey, {
				dirPath: hotspotKey,
				lineageCount: 0,
				forkCount: 0,
				exactCloneCount: 0,
				divergentCount: 0,
				orphanCount: 0,
				reclaimableBytes: 0,
				vendors: new Set(),
			})
		}
		const hs = hotspotMap.get(hotspotKey)
		hs.lineageCount += 1
		hs.forkCount += conflictMembers.length
		hs.exactCloneCount += lineageExactClones
		hs.divergentCount += lineageDivergentForks
		if (isOrphanStorm) {
			hs.orphanCount += 1
		}
		hs.reclaimableBytes += lineageReclaimableBytes
		for (const v of vendorList) {
			hs.vendors.add(v)
		}
	}

	const filteredLineages = allLineages.filter((lineage) => {
		if (vendorFilter !== 'all' && !lineage.vendors.includes(vendorFilter)) {
			return false
		}
		if (classificationFilter === 'exact-clone' && lineage.exactCloneCount === 0) {
			return false
		}
		if (classificationFilter === 'divergent-active' && lineage.divergentCount === 0) {
			return false
		}
		if (classificationFilter === 'stale-fork' && lineage.staleForkCount === 0) {
			return false
		}
		if (classificationFilter === 'orphan-storm' && !lineage.isOrphanStorm) {
			return false
		}
		if (searchQuery) {
			const matchesLineage = (
				lineage.canonicalFilename.toLowerCase().includes(searchQuery)
				|| lineage.canonicalDir.toLowerCase().includes(searchQuery)
				|| lineage.members.some(m => m.normalizedPath.toLowerCase().includes(searchQuery))
			)
			if (!matchesLineage) {
				return false
			}
		}
		return true
	})

	filteredLineages.sort((a, b) => {
		if (sortMode === 'forks_desc') {
			if (b.forkCount !== a.forkCount) {
				return b.forkCount - a.forkCount
			}
			return b.reclaimableBytes - a.reclaimableBytes
		}
		if (sortMode === 'severity_desc') {
			const sevA = SEVERITY_ORDER[a.severity] ?? 9
			const sevB = SEVERITY_ORDER[b.severity] ?? 9
			if (sevA !== sevB) {
				return sevA - sevB
			}
			return b.divergentCount - a.divergentCount || b.forkCount - a.forkCount
		}
		if (sortMode === 'name_asc') {
			return a.canonicalFilename.localeCompare(b.canonicalFilename)
		}
		// reclaim_desc
		if (b.reclaimableBytes !== a.reclaimableBytes) {
			return b.reclaimableBytes - a.reclaimableBytes
		}
		return b.forkCount - a.forkCount
	})

	const hotspots = Array.from(hotspotMap.values())
		.map((hs) => {
			let severity = 'moderate'
			if (hs.forkCount >= 5 || hs.divergentCount >= 2) {
				severity = 'critical'
			} else if (hs.forkCount >= 3 || hs.vendors.size >= 2 || hs.divergentCount >= 1) {
				severity = 'high'
			}
			return {
				dirPath: hs.dirPath,
				lineageCount: hs.lineageCount,
				forkCount: hs.forkCount,
				exactCloneCount: hs.exactCloneCount,
				divergentCount: hs.divergentCount,
				orphanCount: hs.orphanCount,
				reclaimableBytes: hs.reclaimableBytes,
				formattedReclaimableBytes: formatBytes(hs.reclaimableBytes),
				vendors: Array.from(hs.vendors),
				severity,
			}
		})
		.sort((a, b) => b.forkCount - a.forkCount || b.reclaimableBytes - a.reclaimableBytes)

	return {
		policy: {
			presetId: preset.id,
			reclaimMode,
			survivorRule,
			includeStaleForks,
			clusterScope,
			minForkCount,
			vendorFilter,
			classificationFilter,
			searchQuery,
			sortMode,
		},
		summary: {
			totalLineagesCount: allLineages.length,
			filteredLineagesCount: filteredLineages.length,
			totalForksCount,
			exactCloneForksCount,
			staleForksCount,
			divergentForksCount,
			protectedForksCount,
			orphanStormsCount,
			hotspotsCount: hotspots.length,
			reclaimableBytes: totalReclaimableBytes,
			formattedReclaimableBytes: formatBytes(totalReclaimableBytes),
			divergentBytes: totalDivergentBytes,
			formattedDivergentBytes: formatBytes(totalDivergentBytes),
			vendorCounts,
		},
		allLineages,
		lineages: filteredLineages,
		hotspots,
	}
}

/**
 * Collect safely selectable duplicate file entries across conflict lineages for
 * direct Nextcloud triage, strictly excluding survivors, divergent edits,
 * orphan storms without a clean canonical copy, and protected files.
 *
 * @param {object} analysis - Result of analyzeConflictStorms.
 * @param {object} [options] - Selection options.
 * @param {boolean} [options.includeStale=false] - Whether to include stale-fork copies.
 * @return {Array<{ groupId: *, file: object }>} Safe selection targets.
 */
export function collectSafeConflictReclaimTargets(analysis, options = {}) {
	const lineages = analysis && Array.isArray(analysis.lineages) ? analysis.lineages : []
	const includeStale = Boolean(options.includeStale)
	const targets = []

	for (const lineage of lineages) {
		if (!lineage || !Array.isArray(lineage.members) || lineage.effectiveLineageMode === 'keep-all') {
			continue
		}
		for (const member of lineage.members) {
			if (!member || member.classification === 'canonical-survivor' || member.classification === 'protected-fork') {
				continue
			}
			if (member.classification === 'divergent-active') {
				continue
			}
			if (member.classification === 'exact-clone') {
				targets.push({ groupId: member.groupId, file: member })
			} else if (includeStale && member.classification === 'stale-fork') {
				targets.push({ groupId: member.groupId, file: member })
			}
		}
	}

	return targets
}

/**
 * Generate a safe POSIX bash script (DRY_RUN=1 by default) to quarantine or purge
 * verified conflict forks while explicitly skipping divergent edits and running
 * occ files:scan afterwards.
 *
 * @param {object} analysis - Result of analyzeConflictStorms.
 * @param {object} [options] - Script options.
 * @param {string} [options.dataRoot='/var/www/nextcloud/data'] - Nextcloud data root.
 * @param {string} [options.archiveDirName='_conflict_archive'] - Quarantine folder under data root.
 * @param {string} [options.occBinary='sudo -u www-data php /var/www/nextcloud/occ'] - OCC command.
 * @return {string} POSIX bash script.
 */
export function buildConflictStormScript(analysis, options = {}) {
	const dataRoot = (typeof options.dataRoot === 'string' && options.dataRoot.trim())
		? options.dataRoot.trim().replace(/\/+$/, '')
		: '/var/www/nextcloud/data'
	const archiveDirName = (typeof options.archiveDirName === 'string' && options.archiveDirName.trim())
		? options.archiveDirName.trim().replace(/^\/+|\/+$/g, '')
		: '_conflict_archive'
	const occBinary = (typeof options.occBinary === 'string' && options.occBinary.trim())
		? options.occBinary.trim()
		: 'sudo -u www-data php /var/www/nextcloud/occ'

	const lineages = analysis && Array.isArray(analysis.allLineages) ? analysis.allLineages : []
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# DuplicateFinder Sync-Conflict Storm & Cloud Import Fork Resolver Script',
		'# Safety: DRY_RUN=1 by default. Run with DRY_RUN=0 bash script.sh to apply.',
		'# Guard: Divergent edits are NEVER deleted; canonical survivors are NEVER touched.',
		'DRY_RUN="${DRY_RUN:-1}"', // eslint-disable-line no-template-curly-in-string
		`DATA_ROOT=${escapePosixSingleQuote(dataRoot)}`,
		`ARCHIVE_ROOT=${escapePosixSingleQuote(`${dataRoot}/${archiveDirName}`)}`,
		'STAMP="$(date -u +%Y%m%dT%H%M%SZ)"',
		'',
		'quarantine_fork() {',
		'  local rel_path="$1"',
		'  local src="${DATA_ROOT}/${rel_path#/}"', // eslint-disable-line no-template-curly-in-string
		'  local dest="${ARCHIVE_ROOT}/${STAMP}/${rel_path#/}"', // eslint-disable-line no-template-curly-in-string
		'  if [[ ! -f "$src" ]]; then',
		'    echo "[SKIP] Missing source: $src"',
		'    return 0',
		'  fi',
		'  if [[ "$DRY_RUN" != "0" ]]; then',
		'    echo "[DRY_RUN=1] Would quarantine: $src -> $dest"',
		'  else',
		'    mkdir -p -- "$(dirname "$dest")"',
		'    mv -n -- "$src" "$dest"',
		'    echo "[QUARANTINED] $src -> $dest"',
		'  fi',
		'}',
		'',
		'remove_exact_clone() {',
		'  local rel_path="$1"',
		'  local src="${DATA_ROOT}/${rel_path#/}"', // eslint-disable-line no-template-curly-in-string
		'  if [[ ! -f "$src" ]]; then',
		'    echo "[SKIP] Missing source: $src"',
		'    return 0',
		'  fi',
		'  if [[ "$DRY_RUN" != "0" ]]; then',
		'    echo "[DRY_RUN=1] Would delete verified exact byte-clone: $src"',
		'  else',
		'    rm -f -- "$src"',
		'    echo "[DELETED CLONE] $src"',
		'  fi',
		'}',
		'',
	]

	let actionCount = 0
	const occPaths = new Set()

	for (const lineage of lineages) {
		const actionable = lineage.members.filter(m => m.action === 'quarantine' || m.action === 'delete')
		const divergent = lineage.members.filter(m => m.classification === 'divergent-active')

		if (actionable.length === 0 && divergent.length === 0) {
			continue
		}

		lines.push(`# Lineage: ${lineage.canonicalFilename} (${lineage.canonicalDir}) | Survivor: ${lineage.survivor.normalizedPath}`)
		if (lineage.isOrphanStorm) {
			lines.push(`# [ORPHAN STORM] Clean base filename missing; consider renaming survivor -> ${lineage.canonicalFilename}`)
		}

		for (const member of actionable) {
			actionCount += 1
			if (member.action === 'delete') {
				lines.push(`remove_exact_clone ${escapePosixSingleQuote(member.normalizedPath)}`)
			} else {
				lines.push(`quarantine_fork ${escapePosixSingleQuote(member.normalizedPath)}`)
			}
			if (lineage.occScanPath) {
				occPaths.add(lineage.occScanPath)
			}
		}

		for (const divMember of divergent) {
			lines.push(`# [SKIP DIVERGENT - MERGE REQUIRED] ${escapePosixSingleQuote(divMember.normalizedPath)} (${divMember.formattedSize}, mtime ${divMember.formattedMtime})`)
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('echo "No conflict forks staged for quarantine or exact-clone removal."')
	} else {
		lines.push('# Refresh Nextcloud filecache after resolving conflict forks')
		for (const scanPath of occPaths) {
			lines.push('if [[ "$DRY_RUN" != "0" ]]; then')
			lines.push(`  echo "[DRY_RUN=1] Would run: ${occBinary} files:scan --path=${escapePosixSingleQuote(scanPath)}"`)
			lines.push('else')
			lines.push(`  ${occBinary} files:scan --path=${escapePosixSingleQuote(scanPath)}`)
			lines.push('fi')
		}
	}

	lines.push('')
	return lines.join('\n')
}

/**
 * Build a CWE-1236-safe RFC 4180 CSV audit report of all conflict storm lineages and members.
 *
 * @param {object} analysis - Result of analyzeConflictStorms.
 * @return {string} CSV string.
 */
export function buildConflictStormCsvReport(analysis) {
	const lineages = analysis && Array.isArray(analysis.lineages) ? analysis.lineages : []
	const header = [
		'Lineage Canonical Filename',
		'Lineage Folder',
		'Lineage Severity',
		'Orphan Storm',
		'Member Path',
		'Member Role',
		'Vendor',
		'Classification',
		'Recommended Action',
		'Size Bytes',
		'Formatted Size',
		'Modified UTC',
		'Group Hash',
		'Origin Protected',
		'Locked',
		'Safety Note',
	]
	const rows = [header.map(escapeCsvCell).join(',')]

	for (const lineage of lineages) {
		for (const member of lineage.members) {
			rows.push([
				lineage.canonicalFilename,
				lineage.canonicalDir,
				lineage.severity,
				lineage.isOrphanStorm ? 'yes' : 'no',
				member.normalizedPath,
				member.role,
				member.forkMeta.vendorLabel,
				member.classification,
				member.action,
				String(member.size),
				member.formattedSize,
				member.formattedMtime,
				member.groupHash || '',
				member.origin ? 'yes' : 'no',
				member.locked ? 'yes' : 'no',
				member.safetyNote,
			].map(escapeCsvCell).join(','))
		}
	}

	return `${rows.join('\n')}\n`
}

/**
 * Build a deterministic structured JSON audit report of conflict storm lineages and hotspots.
 *
 * @param {object} analysis - Result of analyzeConflictStorms.
 * @return {string} Pretty JSON string.
 */
export function buildConflictStormJsonReport(analysis) {
	const safeAnalysis = analysis || analyzeConflictStorms([])
	return JSON.stringify({
		schema: CONFLICT_STORM_SCHEMA,
		policy: safeAnalysis.policy,
		summary: safeAnalysis.summary,
		hotspots: safeAnalysis.hotspots,
		lineages: (safeAnalysis.lineages || []).map(lineage => ({
			lineageId: lineage.lineageId,
			canonicalFilename: lineage.canonicalFilename,
			canonicalDir: lineage.canonicalDir,
			severity: lineage.severity,
			isOrphanStorm: lineage.isOrphanStorm,
			vendors: lineage.vendors,
			survivorPath: lineage.survivor.normalizedPath,
			survivorSource: lineage.survivorSource,
			effectiveLineageMode: lineage.effectiveLineageMode,
			forkCount: lineage.forkCount,
			exactCloneCount: lineage.exactCloneCount,
			staleForkCount: lineage.staleForkCount,
			divergentCount: lineage.divergentCount,
			protectedCount: lineage.protectedCount,
			reclaimableBytes: lineage.reclaimableBytes,
			formattedReclaimableBytes: lineage.formattedReclaimableBytes,
			members: lineage.members.map(m => ({
				path: m.normalizedPath,
				vendorId: m.forkMeta.vendorId,
				conflictTag: m.forkMeta.conflictTag,
				classification: m.classification,
				action: m.action,
				size: m.size,
				formattedSize: m.formattedSize,
				mtime: m.formattedMtime,
				groupId: m.groupId,
				groupHash: m.groupHash,
				origin: m.origin,
				locked: m.locked,
				safetyNote: m.safetyNote,
			})),
		})),
	}, null, 2)
}
