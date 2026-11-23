/**
 * Pure Cross-Share Permission & Orphaned External-Mount Overlap Auditor.
 * Classifies duplicate copies across Nextcloud storage boundaries (user homes,
 * internal shares, group folders, federated shares, external mounts, and
 * orphaned/offline mounts), resolves Nextcloud CRUD+S permission masks,
 * detects cross-share shadows and permission mismatches, computes safe
 * survivor-preserving reclaim plans, and generates OCC/POSIX remediation
 * scripts plus CWE-1236-safe CSV and JSON audit exports.
 * Zero DOM dependencies, zero network side effects.
 */

import { normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const SHARE_MOUNT_SCHEMA = 'duplicatefinder.share-mount-overlap-auditor.v1'

export const BOUNDARY_TYPES = Object.freeze([
	'user_home',
	'internal_share',
	'group_folder',
	'external_mount',
	'federated_share',
	'orphaned_mount',
])

export const FINDING_TYPES = Object.freeze([
	'cross_share_shadow',
	'orphaned_external_mount',
	'permission_asymmetry',
	'external_mount_egress_dup',
	'federated_loop_risk',
	'groupfolder_permission_leak',
])

export const SHARE_MOUNT_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'boundaries_desc',
	'name_asc',
])

// Nextcloud OCP\Constants permission bitmask flags
export const NC_PERMISSION_READ = 1
export const NC_PERMISSION_UPDATE = 2
export const NC_PERMISSION_CREATE = 4
export const NC_PERMISSION_DELETE = 8
export const NC_PERMISSION_SHARE = 16
export const NC_PERMISSION_ALL = 31

const BOUNDARY_LABELS = Object.freeze({
	user_home: 'User Home',
	internal_share: 'Internal Share',
	group_folder: 'Group Folder',
	external_mount: 'External Mount',
	federated_share: 'Federated Share',
	orphaned_mount: 'Orphaned Mount',
})

const FINDING_LABELS = Object.freeze({
	cross_share_shadow: 'Cross-share shadow',
	orphaned_external_mount: 'Orphaned external mount',
	permission_asymmetry: 'Permission asymmetry',
	external_mount_egress_dup: 'Multi-backend external overlap',
	federated_loop_risk: 'Federated sync loop risk',
	groupfolder_permission_leak: 'Group folder permission leak',
})

const SEVERITY_WEIGHT = Object.freeze({
	critical: 4,
	high: 3,
	medium: 2,
	low: 1,
})

const ORPHANED_MOUNT_STATUSES = new Set([
	'orphaned',
	'offline',
	'unreachable',
	'unmounted',
	'stale',
	'disconnected',
	'missing_credentials',
	'error',
	'broken',
])

const EXTERNAL_BACKENDS = new Set([
	'smb',
	'cifs',
	's3',
	'amazons3',
	'webdav',
	'owncloud',
	'sftp',
	'ftp',
	'ftps',
	'nfs',
	'swift',
	'openstack',
	'gdrive',
	'dropbox',
	'local',
	'external',
])

const BACKEND_LABELS = Object.freeze({
	smb: 'SMB / CIFS',
	cifs: 'SMB / CIFS',
	s3: 'Amazon S3',
	amazons3: 'Amazon S3',
	webdav: 'WebDAV',
	owncloud: 'Remote Nextcloud',
	sftp: 'SFTP',
	ftp: 'FTP',
	ftps: 'FTPS',
	nfs: 'NFS',
	swift: 'OpenStack Swift',
	gdrive: 'Google Drive',
	dropbox: 'Dropbox',
	local: 'Local External',
	external: 'External Storage',
	nextcloud: 'Nextcloud Internal',
})

const TIMESTAMP_FIELDS = Object.freeze(['mtime', 'modified', 'updatedAt', 'lastModified'])

/**
 * Normalize raw path into forward-slash canonical string.
 *
 * @param {string|null|undefined} rawPath Raw path candidate.
 * @return {string} Normalized path or empty string.
 */
function sanitizePath(rawPath) {
	if (typeof rawPath !== 'string') {
		return ''
	}
	const cleaned = rawPath.replace(/\\/g, '/').replace(/\/+/g, '/').trim()
	if (!cleaned) {
		return ''
	}
	return cleaned.length > 1 ? cleaned.replace(/\/+$/, '') : cleaned
}

/**
 * Extract safe single-line basename from file entry or normalized path.
 *
 * @param {object|null|undefined} file File entry.
 * @param {string} normalizedPath Normalized path string.
 * @return {string} Basename string.
 */
function extractBasename(file, normalizedPath) {
	if (file && typeof file.name === 'string' && file.name.trim()) {
		return file.name.replace(/[\r\n\t\0]/g, ' ').trim()
	}
	if (!normalizedPath) {
		return 'unknown'
	}
	const slashIndex = normalizedPath.lastIndexOf('/')
	return slashIndex >= 0 ? normalizedPath.slice(slashIndex + 1) || 'unknown' : normalizedPath
}

/**
 * Parse a timestamp value (seconds, ms, Date, or ISO string) into ms.
 *
 * @param {*} value Raw timestamp value.
 * @return {number|null} Millisecond timestamp or null.
 */
function parseTimestampMs(value) {
	if (value === null || value === undefined || value === '') {
		return null
	}
	if (value instanceof Date) {
		const ms = value.getTime()
		return Number.isFinite(ms) ? ms : null
	}
	let numeric = null
	if (typeof value === 'number') {
		numeric = Number.isFinite(value) ? value : null
	} else if (typeof value === 'string') {
		const trimmed = value.trim()
		if (!trimmed) {
			return null
		}
		if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
			const parsedNum = Number(trimmed)
			numeric = Number.isFinite(parsedNum) ? parsedNum : null
		} else {
			const parsedIso = Date.parse(trimmed)
			return Number.isFinite(parsedIso) ? parsedIso : null
		}
	}
	if (numeric === null || numeric <= 0) {
		return null
	}
	return numeric < 1e11 ? Math.round(numeric * 1000) : Math.round(numeric)
}

/**
 * Resolve modification timestamp in ms from a file entry.
 *
 * @param {object|null|undefined} file File entry.
 * @return {number|null} Timestamp in ms or null.
 */
function getFileTimestampMs(file) {
	if (!file || typeof file !== 'object') {
		return null
	}
	for (const field of TIMESTAMP_FIELDS) {
		if (Object.prototype.hasOwnProperty.call(file, field)) {
			const parsed = parseTimestampMs(file[field])
			if (parsed !== null) {
				return parsed
			}
		}
	}
	return null
}

/**
 * Escape a string for safe inclusion inside POSIX single-quoted shell literals.
 *
 * @param {string} value Raw string.
 * @return {string} Single-quoted POSIX string.
 */
function shellQuote(value) {
	const safe = String(value ?? '').replace(/[\r\n\0]/g, '')
	return `'${safe.replace(/'/g, "'\\''")}'`
}

/**
 * Sanitize text for single-line display or shell comments.
 *
 * @param {*} value Raw value.
 * @return {string} Sanitized single-line string.
 */
function sanitizeLineText(value) {
	return String(value ?? '').replace(/[\r\n\t\0]/g, ' ').trim()
}

/**
 * Detect external storage backend identifier from metadata or path segments.
 *
 * @param {object} file File entry.
 * @param {string} normalizedPath Canonical path.
 * @return {string} Normalized backend key or empty string.
 */
function detectStorageBackend(file, normalizedPath) {
	const rawBackend = sanitizeLineText(
		file.storageBackend || file.backend || file.mountBackend || file.protocol || ''
	).toLowerCase()
	if (rawBackend && EXTERNAL_BACKENDS.has(rawBackend)) {
		return rawBackend === 'cifs' ? 'smb' : (rawBackend === 'amazons3' ? 's3' : rawBackend)
	}
	if (rawBackend) {
		return rawBackend
	}

	const lower = normalizedPath.toLowerCase()
	if (/^\/(?:__external\/|external\/|mounts\/|mnt\/|volumes\/)?(?:smb|cifs)(?:[/_-]|$)/i.test(lower)) {
		return 'smb'
	}
	if (/^\/(?:__external\/|external\/|mounts\/|mnt\/|volumes\/)?(?:s3|bucket|amazons3)(?:[/_-]|$)/i.test(lower)) {
		return 's3'
	}
	if (/^\/(?:__external\/|external\/|mounts\/|mnt\/|volumes\/)?webdav(?:[/_-]|$)/i.test(lower)) {
		return 'webdav'
	}
	if (/^\/(?:__external\/|external\/|mounts\/|mnt\/|volumes\/)?sftp(?:[/_-]|$)/i.test(lower)) {
		return 'sftp'
	}
	if (/^\/(?:__external\/|external\/|mounts\/|mnt\/|volumes\/)?nfs(?:[/_-]|$)/i.test(lower)) {
		return 'nfs'
	}
	if (/^\/(?:__external\/|external\/|mounts\/|mnt\/|volumes\/)?ftps?(?:[/_-]|$)/i.test(lower)) {
		return 'ftp'
	}
	if (/^\/(?:__external|external|mounts|mnt|volumes)\//i.test(lower)) {
		return 'external'
	}
	return ''
}

/**
 * Classify a file's Nextcloud storage boundary, share metadata, and mount health.
 *
 * @param {object|null|undefined} file Duplicate file entry.
 * @return {object} Normalized boundary descriptor.
 */
export function classifyStorageBoundary(file) {
	const safeFile = file && typeof file === 'object' ? file : {}
	const normalizedPath = sanitizePath(safeFile.path || '')
	const relativePath = normalizePathForDiff(normalizedPath) || normalizedPath
	const segments = normalizedPath.split('/').filter(Boolean)
	const lowerSegments = segments.map(s => s.toLowerCase())

	const rawMountStatus = sanitizeLineText(safeFile.mountStatus || safeFile.storageStatus || '').toLowerCase()
	const explicitMountType = sanitizeLineText(safeFile.mountType || safeFile.storageType || '').toLowerCase()
	const rawShareType = sanitizeLineText(safeFile.shareType || '').toLowerCase()
	const shareOwner = sanitizeLineText(safeFile.shareOwner || safeFile.sharedBy || safeFile.owner || '')
	const sharedWith = sanitizeLineText(safeFile.sharedWith || safeFile.shareTarget || '')
	const shareId = safeFile.shareId !== undefined && safeFile.shareId !== null && safeFile.shareId !== ''
		? String(safeFile.shareId)
		: ''
	const mountId = safeFile.mountId !== undefined && safeFile.mountId !== null && safeFile.mountId !== ''
		? String(safeFile.mountId)
		: (safeFile.storageId !== undefined && safeFile.storageId !== null && safeFile.storageId !== ''
			? String(safeFile.storageId)
			: '')
	const mountPoint = sanitizePath(safeFile.mountPoint || '')
	const detectedBackend = detectStorageBackend(safeFile, normalizedPath)

	const isOrphanedByStatus = Boolean(
		safeFile.orphanedMount === true
		|| safeFile.orphanedShare === true
		|| safeFile.ownerDeleted === true
		|| ORPHANED_MOUNT_STATUSES.has(rawMountStatus)
		|| explicitMountType === 'orphaned'
		|| /^\/(?:__external_orphaned|orphanedmounts|orphaned_mounts|stale_mounts)\//i.test(normalizedPath)
	)

	const isFederated = Boolean(
		safeFile.federated === true
		|| rawShareType === 'federated'
		|| rawShareType === 'remote'
		|| rawShareType === '6'
		|| explicitMountType === 'federated'
		|| /^\/(?:[^/]+\/files\/)?(?:shared\s*\(federated\)|federated(?:\s+shares)?)\//i.test(normalizedPath)
		|| (safeFile.remote && typeof safeFile.remote === 'string')
	)

	const groupFolderMatch = normalizedPath.match(/^\/(?:__groupfolders|groupfolders)\/([^/]+)(?:\/(.*))?$/i)
	const isGroupFolder = Boolean(
		groupFolderMatch
		|| explicitMountType === 'groupfolder'
		|| explicitMountType === 'group_folder'
		|| (safeFile.groupFolder !== undefined && safeFile.groupFolder !== null && safeFile.groupFolder !== '')
	)

	const externalPathMatch = normalizedPath.match(
		/^\/(?:(?:[^/]+\/files)\/)?(?:__external|__external_orphaned|external|mounts|mnt|volumes|orphanedmounts|orphaned_mounts|smb|s3|webdav|sftp|nfs)\/([^/]+)(?:\/(.*))?$/i
	)
	const isExternalMount = Boolean(
		isOrphanedByStatus
		|| explicitMountType === 'external'
		|| explicitMountType === 'external_mount'
		|| mountPoint
		|| mountId
		|| (detectedBackend && detectedBackend !== 'nextcloud')
		|| externalPathMatch
	)

	const sharePathMatch = normalizedPath.match(
		/^\/(?:([^/]+)\/files\/)?(?:shared|shares|shared with me|circles)\/([^/]+)(?:\/(.*))?$/i
	)
	const isInternalShare = Boolean(
		!isFederated
		&& !isGroupFolder
		&& (
			shareId
			|| rawShareType === 'user'
			|| rawShareType === 'group'
			|| rawShareType === 'circle'
			|| rawShareType === 'link'
			|| rawShareType === 'room'
			|| rawShareType === '0'
			|| rawShareType === '1'
			|| rawShareType === '3'
			|| rawShareType === '7'
			|| explicitMountType === 'share'
			|| sharePathMatch
			|| Boolean(safeFile.sharedBy || safeFile.shareOwner)
		)
	)

	let boundaryType = 'user_home'
	if (isOrphanedByStatus) {
		boundaryType = 'orphaned_mount'
	} else if (isFederated) {
		boundaryType = 'federated_share'
	} else if (isGroupFolder) {
		boundaryType = 'group_folder'
	} else if (isExternalMount && !isInternalShare) {
		boundaryType = 'external_mount'
	} else if (isInternalShare) {
		boundaryType = 'internal_share'
	}

	let ownerName = shareOwner
	let rootKey = 'root:default'
	let rootLabel = 'Default Storage'

	if (boundaryType === 'orphaned_mount') {
		const orphanName = mountId || (externalPathMatch && externalPathMatch[1]) || segments[1] || segments[0] || 'orphaned-mount'
		rootKey = `orphan:${orphanName.toLowerCase()}`
		rootLabel = `Orphaned Mount (${orphanName})`
	} else if (boundaryType === 'federated_share') {
		const fedTarget = sanitizeLineText(safeFile.remote || (sharePathMatch && sharePathMatch[2]) || segments[1] || 'remote-cloud')
		rootKey = `federated:${fedTarget.toLowerCase()}`
		rootLabel = `Federated (${fedTarget})`
	} else if (boundaryType === 'group_folder') {
		const gfName = sanitizeLineText(safeFile.groupFolder || (groupFolderMatch && groupFolderMatch[1]) || 'groupfolder')
		rootKey = `groupfolder:${gfName.toLowerCase()}`
		rootLabel = `GroupFolder (${gfName})`
	} else if (boundaryType === 'external_mount') {
		const extName = mountPoint
			? mountPoint.replace(/^\/+/, '')
			: (mountId || (externalPathMatch && externalPathMatch[1]) || detectedBackend || 'external')
		const backendTag = detectedBackend ? (BACKEND_LABELS[detectedBackend] || detectedBackend.toUpperCase()) : 'External'
		rootKey = `external:${extName.toLowerCase()}`
		rootLabel = `${backendTag}: ${extName}`
	} else if (boundaryType === 'internal_share') {
		const recipient = (sharePathMatch && sharePathMatch[1]) || sharedWith || ''
		const shareName = (sharePathMatch && sharePathMatch[2]) || shareId || shareOwner || 'shared'
		rootKey = `share:${shareName.toLowerCase()}`
		rootLabel = recipient ? `Share (${shareName} -> ${recipient})` : `Share (${shareName})`
	} else {
		const userHomeIdx = lowerSegments.indexOf('files')
		if (userHomeIdx > 0) {
			ownerName = ownerName || segments[userHomeIdx - 1]
		} else if (segments.length > 0 && !['appdata', 'tmp', 'cache'].includes(lowerSegments[0])) {
			ownerName = ownerName || segments[0]
		}
		const normalizedOwner = ownerName || 'local'
		rootKey = `user:${normalizedOwner.toLowerCase()}`
		rootLabel = `User Home (${normalizedOwner})`
	}

	const backend = detectedBackend || (boundaryType === 'external_mount' || boundaryType === 'orphaned_mount' ? 'external' : 'nextcloud')
	const backendLabel = BACKEND_LABELS[backend] || backend.toUpperCase()
	const mountStatus = isOrphanedByStatus
		? (rawMountStatus && ORPHANED_MOUNT_STATUSES.has(rawMountStatus) ? rawMountStatus : 'orphaned')
		: (rawMountStatus || 'online')

	return {
		boundaryType,
		boundaryLabel: BOUNDARY_LABELS[boundaryType] || 'User Home',
		backend,
		backendLabel,
		mountId: mountId || (externalPathMatch ? externalPathMatch[1] : ''),
		mountPoint,
		mountStatus,
		isExternalMount: boundaryType === 'external_mount' || boundaryType === 'orphaned_mount' || Boolean(mountId || mountPoint || detectedBackend),
		isShare: boundaryType === 'internal_share' || boundaryType === 'federated_share' || Boolean(shareId || shareOwner),
		isOrphanedMount: boundaryType === 'orphaned_mount',
		isFederated: boundaryType === 'federated_share',
		isGroupFolder: boundaryType === 'group_folder',
		isReadOnlyMount: Boolean(safeFile.mountReadOnly === true),
		shareId,
		shareType: rawShareType || (boundaryType === 'federated_share' ? 'federated' : (boundaryType === 'internal_share' ? 'user' : '')),
		shareOwner: ownerName,
		sharedWith,
		rootKey,
		rootLabel,
		normalizedPath,
		relativePath,
	}
}

/**
 * Parse Nextcloud numeric or symbolic permissions for a duplicate copy.
 *
 * @param {object|null|undefined} file Duplicate file entry.
 * @param {object|null|undefined} boundary Boundary descriptor from classifyStorageBoundary.
 * @return {object} Permission analysis result.
 */
export function analyzeFilePermissions(file, boundary = null) {
	const safeFile = file && typeof file === 'object' ? file : {}
	const resolvedBoundary = boundary || classifyStorageBoundary(safeFile)
	const isLocked = Boolean(safeFile.locked === true)
	const isOriginProtected = Boolean(safeFile.isInOriginFolder === true)
	const isOrphanedMount = Boolean(resolvedBoundary.isOrphanedMount)
	const isReadOnlyMount = Boolean(resolvedBoundary.isReadOnlyMount || safeFile.mountReadOnly === true)

	let permissionMask = NC_PERMISSION_ALL
	const rawPerm = safeFile.permissions

	if (typeof rawPerm === 'number' && Number.isFinite(rawPerm) && rawPerm >= 0) {
		permissionMask = Math.floor(rawPerm) & NC_PERMISSION_ALL
	} else if (typeof rawPerm === 'string' && rawPerm.trim()) {
		const trimmed = rawPerm.trim().toLowerCase()
		if (/^\d+$/.test(trimmed)) {
			permissionMask = Number(trimmed) & NC_PERMISSION_ALL
		} else if (trimmed === 'ro' || trimmed === 'read' || trimmed === 'read-only' || trimmed === 'readonly' || trimmed === 'r') {
			permissionMask = NC_PERMISSION_READ
		} else if (trimmed === 'read+share' || trimmed === 'rs') {
			permissionMask = NC_PERMISSION_READ | NC_PERMISSION_SHARE
		} else if (trimmed === 'rw' || trimmed === 'read-write' || trimmed === 'write') {
			permissionMask = NC_PERMISSION_READ | NC_PERMISSION_UPDATE | NC_PERMISSION_CREATE
		} else if (trimmed === 'crud' || trimmed === 'delete' || trimmed === 'rw+d') {
			permissionMask = NC_PERMISSION_READ | NC_PERMISSION_UPDATE | NC_PERMISSION_CREATE | NC_PERMISSION_DELETE
		} else if (trimmed === 'all' || trimmed === 'owner' || trimmed === 'admin') {
			permissionMask = NC_PERMISSION_ALL
		} else {
			let mask = NC_PERMISSION_READ
			if (trimmed.includes('update') || trimmed.includes('write') || trimmed.includes('w')) {
				mask |= NC_PERMISSION_UPDATE
			}
			if (trimmed.includes('create') || trimmed.includes('c')) {
				mask |= NC_PERMISSION_CREATE
			}
			if (trimmed.includes('delete') || trimmed.includes('d')) {
				mask |= NC_PERMISSION_DELETE
			}
			if (trimmed.includes('share') || trimmed.includes('s')) {
				mask |= NC_PERMISSION_SHARE
			}
			permissionMask = mask
		}
	} else if (safeFile.readOnly === true || safeFile.canDelete === false || isReadOnlyMount) {
		permissionMask = NC_PERMISSION_READ
	}

	const explicitReadOnly = safeFile.readOnly === true || isReadOnlyMount
	const explicitNoDelete = safeFile.canDelete === false
	const hasDeleteBit = (permissionMask & NC_PERMISSION_DELETE) === NC_PERMISSION_DELETE
	const isReadOnly = explicitReadOnly || !hasDeleteBit || explicitNoDelete
	const canDelete = !isLocked && !isOriginProtected && !isOrphanedMount && !isReadOnly

	let permissionLabel = 'Owner Full (CRUD+S)'
	if (isOrphanedMount) {
		permissionLabel = `Mount ${resolvedBoundary.mountStatus.toUpperCase()} (Unreachable)`
	} else if (isOriginProtected) {
		permissionLabel = 'Origin Protected'
	} else if (isLocked) {
		permissionLabel = 'Locked'
	} else if (isReadOnlyMount) {
		permissionLabel = 'Mount Read-Only'
	} else if (explicitReadOnly || (permissionMask & (NC_PERMISSION_UPDATE | NC_PERMISSION_CREATE | NC_PERMISSION_DELETE)) === 0) {
		permissionLabel = (permissionMask & NC_PERMISSION_SHARE) ? 'Read + Share (No Delete)' : 'Read-Only Share'
	} else if (!hasDeleteBit || explicitNoDelete) {
		permissionLabel = 'Read-Write (No Delete)'
	} else if ((permissionMask & NC_PERMISSION_ALL) === NC_PERMISSION_ALL) {
		permissionLabel = resolvedBoundary.isShare ? 'Share Full (CRUD+S)' : 'Owner Full (CRUD+S)'
	} else {
		permissionLabel = 'Deletable (Partial)'
	}

	let reason = 'Deletable copy within writable storage boundary.'
	if (isOrphanedMount) {
		reason = `External mount is ${resolvedBoundary.mountStatus}; WebDAV delete will fail until mount is verified or cleaned in OCC.`
	} else if (isOriginProtected) {
		reason = 'Inside protected origin folder; preserved automatically.'
	} else if (isLocked) {
		reason = 'File is locked and cannot be auto-deleted.'
	} else if (isReadOnlyMount) {
		reason = 'External mount is configured read-only at admin level.'
	} else if (isReadOnly) {
		reason = `Missing Nextcloud DELETE permission (mask ${permissionMask}).`
	}

	return {
		canDelete,
		isReadOnly,
		isLocked,
		isOriginProtected,
		isOrphanedMount,
		permissionMask,
		permissionLabel,
		reason,
	}
}

/**
 * Score a duplicate copy as canonical master candidate (higher = stronger master).
 *
 * @param {object} entry Classified copy entry.
 * @return {number} Deterministic priority score.
 */
function scoreCanonicalMaster(entry) {
	let score = 0
	if (entry.permissions.isOriginProtected) {
		score += 1000
	}
	if (entry.permissions.isLocked) {
		score += 700
	}
	if (entry.boundary.boundaryType === 'user_home') {
		score += 500
	} else if (entry.boundary.boundaryType === 'group_folder') {
		score += 400
	} else if (entry.boundary.boundaryType === 'external_mount') {
		score += 250
	} else if (entry.boundary.boundaryType === 'internal_share') {
		score += 150
	} else if (entry.boundary.boundaryType === 'federated_share') {
		score += 100
	} else if (entry.boundary.boundaryType === 'orphaned_mount') {
		score += 10
	}

	if (entry.permissions.canDelete && !entry.boundary.isShare) {
		score += 80
	}
	if (!entry.permissions.isReadOnly) {
		score += 40
	}
	return score
}

/**
 * Determine whether a duplicate group crosses Nextcloud share/mount boundaries or exhibits permission hazards.
 *
 * @param {Array<object>} entries Classified entries for a duplicate group.
 * @return {object} Findings, severity, and boundary inclusion status.
 */
function analyzeGroupOverlap(entries) {
	const findings = []
	const boundaryTypes = new Set(entries.map(e => e.boundary.boundaryType))
	const rootKeys = new Set(entries.map(e => e.boundary.rootKey))
	const backends = new Set(entries.filter(e => e.boundary.isExternalMount).map(e => e.boundary.backend))
	const hasOrphanedMount = entries.some(e => e.boundary.isOrphanedMount)
	const hasInternalShare = entries.some(e => e.boundary.boundaryType === 'internal_share')
	const hasFederated = entries.some(e => e.boundary.boundaryType === 'federated_share')
	const hasGroupFolder = entries.some(e => e.boundary.boundaryType === 'group_folder')
	const hasExternalMount = entries.some(e => e.boundary.boundaryType === 'external_mount')
	const hasUserHome = entries.some(e => e.boundary.boundaryType === 'user_home')
	const hasShare = hasInternalShare || hasFederated
	const deletableCount = entries.filter(e => e.permissions.canDelete).length
	const blockedCount = entries.length - deletableCount

	const hasRelevantBoundary = hasOrphanedMount
		|| hasShare
		|| hasGroupFolder
		|| hasExternalMount
		|| rootKeys.size > 1
		|| blockedCount > 0

	if (!hasRelevantBoundary) {
		return {
			isRelevant: false,
			findings: [],
			severity: 'low',
			riskScore: 0,
			diagnoses: [],
		}
	}

	const diagnoses = []

	if (hasOrphanedMount) {
		findings.push('orphaned_external_mount')
		const orphanRoots = Array.from(new Set(entries.filter(e => e.boundary.isOrphanedMount).map(e => e.boundary.rootLabel)))
		diagnoses.push(`Orphaned/offline external mount detected (${orphanRoots.join(', ')}). Verify mount health in OCC before purging linked copies.`)
	}

	if (hasInternalShare && (hasUserHome || hasGroupFolder || hasExternalMount || rootKeys.size > 1)) {
		findings.push('cross_share_shadow')
		diagnoses.push('Cross-share shadow: duplicate exists both inside an owner/group root and a shared mount point.')
	}

	if (deletableCount > 0 && blockedCount > 0) {
		findings.push('permission_asymmetry')
		diagnoses.push(`Permission asymmetry: ${blockedCount} copy/copies are read-only, locked, or unreachable while ${deletableCount} can be deleted.`)
	} else if (blockedCount === entries.length && entries.length > 1) {
		findings.push('permission_asymmetry')
		diagnoses.push('All copies are read-only, locked, or on unreachable mounts; manual admin or OCC cleanup required.')
	}

	if (hasExternalMount && (backends.size > 1 || (hasExternalMount && (hasUserHome || hasGroupFolder || hasInternalShare)))) {
		findings.push('external_mount_egress_dup')
		const backendList = Array.from(new Set(entries.filter(e => e.boundary.isExternalMount).map(e => e.boundary.backendLabel)))
		diagnoses.push(`External storage overlap (${backendList.join(' + ')}): duplicate payload crosses external storage boundaries.`)
	}

	if (hasFederated && (hasUserHome || hasGroupFolder || hasInternalShare || hasExternalMount)) {
		findings.push('federated_loop_risk')
		diagnoses.push('Federated share overlap: duplicate spans a remote federated cloud share and local storage.')
	}

	if (hasGroupFolder && hasUserHome) {
		findings.push('groupfolder_permission_leak')
		diagnoses.push('GroupFolder overlap: file resides in both a personal user home and a shared GroupFolder.')
	}

	if (findings.length === 0 && rootKeys.size > 1) {
		findings.push('cross_share_shadow')
		diagnoses.push(`Cross-user / cross-root overlap across ${rootKeys.size} distinct storage roots.`)
	}

	let severity = 'low'
	if (hasOrphanedMount || (hasFederated && blockedCount > 0)) {
		severity = 'critical'
	} else if (
		(findings.includes('cross_share_shadow') && findings.includes('permission_asymmetry'))
		|| findings.includes('external_mount_egress_dup')
		|| findings.includes('federated_loop_risk')
	) {
		severity = 'high'
	} else if (findings.length >= 1) {
		severity = 'medium'
	}

	const riskScore = (SEVERITY_WEIGHT[severity] || 1) * 100
		+ findings.length * 25
		+ boundaryTypes.size * 15
		+ rootKeys.size * 10

	return {
		isRelevant: true,
		findings,
		severity,
		riskScore,
		diagnoses,
	}
}

/**
 * Compare two classified entries for canonical master ranking.
 *
 * @param {object} a First classified entry.
 * @param {object} b Second classified entry.
 * @return {number} Comparator result.
 */
function compareMasterPriority(a, b) {
	const scoreDiff = scoreCanonicalMaster(b) - scoreCanonicalMaster(a)
	if (scoreDiff !== 0) {
		return scoreDiff
	}
	const tsA = a.mtimeMs ?? Number.MAX_SAFE_INTEGER
	const tsB = b.mtimeMs ?? Number.MAX_SAFE_INTEGER
	if (tsA !== tsB) {
		return tsA - tsB
	}
	if (a.path.length !== b.path.length) {
		return a.path.length - b.path.length
	}
	if (a.path < b.path) {
		return -1
	}
	if (a.path > b.path) {
		return 1
	}
	return String(a.selectionKey).localeCompare(String(b.selectionKey))
}

/**
 * Build full Cross-Share Permission & Orphaned External-Mount Audit Report.
 *
 * @param {Array<object>} duplicates Duplicate group list.
 * @param {object} [options] Optional config.
 * @return {object} Deterministic audit report.
 */
export function buildShareMountAuditReport(duplicates, options = {}) {
	const list = Array.isArray(duplicates) ? duplicates : []
	const groups = []
	const boundaryMap = new Map()
	const mountRegistryMap = new Map()
	const findingCounts = new Map(FINDING_TYPES.map(f => [f, 0]))

	for (const boundaryType of BOUNDARY_TYPES) {
		boundaryMap.set(boundaryType, {
			boundaryType,
			label: BOUNDARY_LABELS[boundaryType],
			copyCount: 0,
			totalBytes: 0,
			reclaimableBytes: 0,
			blockedCount: 0,
			groupIds: new Set(),
		})
	}

	let nonBoundaryGroupsCount = 0
	let totalShadowCopiesCount = 0
	let totalAuditedCopiesCount = 0
	let totalSafeReclaimableBytes = 0
	let totalSafeReclaimableCount = 0
	let totalBlockedBytes = 0
	let totalBlockedCount = 0
	let orphanedMountCopyCount = 0
	let orphanedMountBytes = 0
	let crossShareRiskGroupsCount = 0
	let crossShareRiskBytes = 0

	for (let index = 0; index < list.length; index++) {
		const group = list[index]
		if (!group || !Array.isArray(group.files) || group.files.length <= 1) {
			continue
		}

		const reclaimInfo = computeGroupReclaimableInfo(group)
		const groupHash = typeof group.hash === 'string' ? group.hash : ''
		const rawEntries = group.files.map((file, fileIdx) => {
			const boundary = classifyStorageBoundary(file)
			const permissions = analyzeFilePermissions(file, boundary)
			const size = Math.max(0, Number(file && file.size) || 0)
			const mtimeMs = getFileTimestampMs(file)
			const selectionKey = getFileSelectionKey(file) ?? `${index}:${fileIdx}`
			return {
				id: file ? file.id : undefined,
				nodeId: file ? (file.nodeId || file.id) : undefined,
				fileId: file ? (file.fileId || file.nodeId || file.id) : undefined,
				selectionKey,
				path: boundary.normalizedPath || (file && typeof file.path === 'string' ? file.path : ''),
				name: extractBasename(file, boundary.normalizedPath),
				size,
				sizeFormatted: formatBytes(size),
				mtimeMs,
				fileHash: groupHash || (file && file.fileHash) || '',
				boundary,
				permissions,
				isCanonicalMaster: false,
				disposition: 'blocked',
				dispositionLabel: 'Blocked',
			}
		})

		const analysis = analyzeGroupOverlap(rawEntries)
		if (!analysis.isRelevant) {
			nonBoundaryGroupsCount++
			continue
		}

		const ranked = [...rawEntries].sort(compareMasterPriority)
		const masterKey = ranked[0].selectionKey
		let groupSafeReclaimCount = 0
		let groupSafeReclaimBytes = 0
		let groupBlockedCount = 0
		let groupBlockedBytes = 0

		for (const entry of rawEntries) {
			const isMaster = entry.selectionKey === masterKey
			entry.isCanonicalMaster = isMaster
			if (isMaster) {
				entry.disposition = 'canonical_master'
				entry.dispositionLabel = 'Canonical Master'
			} else if (entry.permissions.canDelete) {
				entry.disposition = 'safe_reclaim'
				entry.dispositionLabel = 'Safe Shadow Reclaim'
				groupSafeReclaimCount++
				groupSafeReclaimBytes += entry.size
			} else {
				entry.disposition = entry.boundary.isOrphanedMount ? 'orphaned_blocked' : 'permission_blocked'
				entry.dispositionLabel = entry.boundary.isOrphanedMount ? 'Orphaned Mount (OCC)' : 'Blocked (Read-Only/Locked)'
				groupBlockedCount++
				groupBlockedBytes += entry.size
			}

			const bStat = boundaryMap.get(entry.boundary.boundaryType)
			if (bStat) {
				bStat.copyCount++
				bStat.totalBytes += entry.size
				bStat.groupIds.add(group.id ?? index)
				if (entry.disposition === 'safe_reclaim') {
					bStat.reclaimableBytes += entry.size
				} else if (!isMaster) {
					bStat.blockedCount++
				}
			}

			if (!mountRegistryMap.has(entry.boundary.rootKey)) {
				mountRegistryMap.set(entry.boundary.rootKey, {
					rootKey: entry.boundary.rootKey,
					rootLabel: entry.boundary.rootLabel,
					boundaryType: entry.boundary.boundaryType,
					boundaryLabel: entry.boundary.boundaryLabel,
					backend: entry.boundary.backend,
					backendLabel: entry.boundary.backendLabel,
					mountId: entry.boundary.mountId,
					mountStatus: entry.boundary.mountStatus,
					isOrphaned: entry.boundary.isOrphanedMount,
					isReadOnlyMount: entry.boundary.isReadOnlyMount,
					copyCount: 0,
					totalBytes: 0,
					reclaimableBytes: 0,
					blockedCount: 0,
					groupIds: new Set(),
				})
			}
			const reg = mountRegistryMap.get(entry.boundary.rootKey)
			reg.copyCount++
			reg.totalBytes += entry.size
			reg.groupIds.add(group.id ?? index)
			if (entry.disposition === 'safe_reclaim') {
				reg.reclaimableBytes += entry.size
			} else if (!isMaster) {
				reg.blockedCount++
			}

			if (entry.boundary.isOrphanedMount) {
				orphanedMountCopyCount++
				orphanedMountBytes += entry.size
			}
		}

		for (const finding of analysis.findings) {
			findingCounts.set(finding, (findingCounts.get(finding) || 0) + 1)
		}

		totalAuditedCopiesCount += rawEntries.length
		totalShadowCopiesCount += Math.max(0, rawEntries.length - 1)
		totalSafeReclaimableCount += groupSafeReclaimCount
		totalSafeReclaimableBytes += groupSafeReclaimBytes
		totalBlockedCount += groupBlockedCount
		totalBlockedBytes += groupBlockedBytes

		if (analysis.findings.includes('cross_share_shadow') || analysis.findings.includes('permission_asymmetry')) {
			crossShareRiskGroupsCount++
			crossShareRiskBytes += reclaimInfo.reclaimableBytes
		}

		const groupKey = `${group.id ?? index}:${groupHash || ranked[0].name}`
		const distinctBoundaries = Array.from(new Set(rawEntries.map(e => e.boundary.boundaryType)))
		const distinctRoots = Array.from(new Set(rawEntries.map(e => e.boundary.rootKey)))

		groups.push({
			id: group.id ?? index,
			groupKey,
			hash: groupHash,
			primaryName: ranked[0].name,
			canonicalMasterPath: ranked[0].path,
			canonicalMasterBoundary: ranked[0].boundary.boundaryLabel,
			copyCount: rawEntries.length,
			boundaryCount: distinctBoundaries.length,
			rootCount: distinctRoots.length,
			boundaryTypes: distinctBoundaries,
			rootKeys: distinctRoots,
			findings: analysis.findings,
			findingLabels: analysis.findings.map(f => FINDING_LABELS[f] || f),
			diagnoses: analysis.diagnoses,
			severity: analysis.severity,
			riskScore: analysis.riskScore,
			totalGroupBytes: reclaimInfo.totalBytes,
			totalGroupBytesFormatted: formatBytes(reclaimInfo.totalBytes),
			reclaimableBytes: groupSafeReclaimBytes,
			reclaimableBytesFormatted: formatBytes(groupSafeReclaimBytes),
			blockedBytes: groupBlockedBytes,
			blockedBytesFormatted: formatBytes(groupBlockedBytes),
			safeReclaimCount: groupSafeReclaimCount,
			blockedCount: groupBlockedCount,
			hasOrphanedMount: rawEntries.some(e => e.boundary.isOrphanedMount),
			entries: rawEntries,
		})
	}

	const totalBoundaryCopies = Math.max(1, totalAuditedCopiesCount)
	const boundaries = Array.from(boundaryMap.values())
		.map(b => ({
			boundaryType: b.boundaryType,
			label: b.label,
			copyCount: b.copyCount,
			groupCount: b.groupIds.size,
			totalBytes: b.totalBytes,
			totalBytesFormatted: formatBytes(b.totalBytes),
			reclaimableBytes: b.reclaimableBytes,
			reclaimableBytesFormatted: formatBytes(b.reclaimableBytes),
			blockedCount: b.blockedCount,
			sharePercent: b.copyCount > 0 ? Math.round((b.copyCount / totalBoundaryCopies) * 100) : 0,
		}))
		.sort((a, b) => b.totalBytes - a.totalBytes || b.copyCount - a.copyCount)

	const mountRegistry = Array.from(mountRegistryMap.values())
		.map(m => ({
			rootKey: m.rootKey,
			rootLabel: m.rootLabel,
			boundaryType: m.boundaryType,
			boundaryLabel: m.boundaryLabel,
			backend: m.backend,
			backendLabel: m.backendLabel,
			mountId: m.mountId,
			mountStatus: m.mountStatus,
			isOrphaned: m.isOrphaned,
			isReadOnlyMount: m.isReadOnlyMount,
			copyCount: m.copyCount,
			groupCount: m.groupIds.size,
			totalBytes: m.totalBytes,
			totalBytesFormatted: formatBytes(m.totalBytes),
			reclaimableBytes: m.reclaimableBytes,
			reclaimableBytesFormatted: formatBytes(m.reclaimableBytes),
			blockedCount: m.blockedCount,
		}))
		.sort((a, b) => Number(b.isOrphaned) - Number(a.isOrphaned) || b.totalBytes - a.totalBytes || a.rootLabel.localeCompare(b.rootLabel))

	const findingBreakdown = FINDING_TYPES.map(findingType => ({
		findingType,
		label: FINDING_LABELS[findingType],
		groupCount: findingCounts.get(findingType) || 0,
	}))

	const maxSeverityGroup = groups.reduce((acc, g) => {
		return (SEVERITY_WEIGHT[g.severity] || 0) > (SEVERITY_WEIGHT[acc] || 0) ? g.severity : acc
	}, 'low')

	return {
		schema: SHARE_MOUNT_SCHEMA,
		generatedAt: options.generatedAt || null,
		summary: {
			totalScannedGroupsCount: list.length,
			auditedGroupsCount: groups.length,
			nonBoundaryGroupsCount,
			totalAuditedCopiesCount,
			totalShadowCopiesCount,
			safeReclaimableCount: totalSafeReclaimableCount,
			safeReclaimableBytes: totalSafeReclaimableBytes,
			safeReclaimableBytesFormatted: formatBytes(totalSafeReclaimableBytes),
			blockedCount: totalBlockedCount,
			blockedBytes: totalBlockedBytes,
			blockedBytesFormatted: formatBytes(totalBlockedBytes),
			orphanedMountCopyCount,
			orphanedMountBytes,
			orphanedMountBytesFormatted: formatBytes(orphanedMountBytes),
			crossShareRiskGroupsCount,
			crossShareRiskBytes,
			crossShareRiskBytesFormatted: formatBytes(crossShareRiskBytes),
			mountRootsCount: mountRegistry.length,
			orphanedRootsCount: mountRegistry.filter(m => m.isOrphaned).length,
			highestSeverity: groups.length > 0 ? maxSeverityGroup : 'none',
		},
		boundaries,
		mountRegistry,
		findingBreakdown,
		groups,
	}
}

/**
 * Filter and sort audited cross-share / external-mount groups.
 *
 * @param {Array<object>} groups Audited groups from buildShareMountAuditReport.
 * @param {object} [filters] Filter & sort options.
 * @return {Array<object>} Filtered and sorted groups.
 */
export function filterShareMountGroups(groups, filters = {}) {
	const list = Array.isArray(groups) ? groups : []
	const findingFilter = typeof filters.findingFilter === 'string' ? filters.findingFilter : 'all'
	const boundaryFilter = typeof filters.boundaryFilter === 'string' ? filters.boundaryFilter : 'all'
	const severityFilter = typeof filters.severityFilter === 'string' ? filters.severityFilter : 'all'
	const mountFilter = typeof filters.mountFilter === 'string' ? filters.mountFilter : ''
	const searchQuery = typeof filters.searchQuery === 'string' ? filters.searchQuery.trim().toLowerCase() : ''
	const sortMode = SHARE_MOUNT_SORT_MODES.includes(filters.sortMode) ? filters.sortMode : 'reclaim_desc'

	const filtered = list.filter(group => {
		if (!group) {
			return false
		}
		if (findingFilter === 'safe_reclaim') {
			if (group.safeReclaimCount === 0) {
				return false
			}
		} else if (findingFilter !== 'all' && !group.findings.includes(findingFilter)) {
			return false
		}

		if (boundaryFilter !== 'all' && !group.boundaryTypes.includes(boundaryFilter)) {
			return false
		}

		if (severityFilter === 'critical' && group.severity !== 'critical') {
			return false
		}
		if (severityFilter === 'high_plus' && group.severity !== 'critical' && group.severity !== 'high') {
			return false
		}

		if (mountFilter && !group.rootKeys.includes(mountFilter)) {
			return false
		}

		if (searchQuery) {
			const haystacks = [
				group.primaryName,
				group.hash,
				group.severity,
				...group.findingLabels,
				...group.entries.flatMap(e => [
					e.path,
					e.name,
					e.boundary.rootLabel,
					e.boundary.boundaryLabel,
					e.boundary.backendLabel,
					e.boundary.mountId,
					e.boundary.shareOwner,
					e.boundary.sharedWith,
					e.permissions.permissionLabel,
				]),
			]
			const matched = haystacks.some(val => typeof val === 'string' && val.toLowerCase().includes(searchQuery))
			if (!matched) {
				return false
			}
		}

		return true
	})

	return [...filtered].sort((a, b) => {
		if (sortMode === 'risk_desc') {
			if (b.riskScore !== a.riskScore) {
				return b.riskScore - a.riskScore
			}
			return b.reclaimableBytes - a.reclaimableBytes
		}
		if (sortMode === 'boundaries_desc') {
			if (b.boundaryCount !== a.boundaryCount) {
				return b.boundaryCount - a.boundaryCount
			}
			if (b.rootCount !== a.rootCount) {
				return b.rootCount - a.rootCount
			}
			return b.reclaimableBytes - a.reclaimableBytes
		}
		if (sortMode === 'name_asc') {
			return a.primaryName.localeCompare(b.primaryName)
		}
		if (b.reclaimableBytes !== a.reclaimableBytes) {
			return b.reclaimableBytes - a.reclaimableBytes
		}
		return b.riskScore - a.riskScore
	})
}

/**
 * Build a permission-safe reclaim plan for deletable shadow copies only.
 * Never includes canonical masters, read-only shares, locked files,
 * protected origin copies, or orphaned/offline external mounts.
 *
 * @param {Array<object>} groups Filtered audited groups.
 * @param {object} [options] Optional filters.
 * @return {object} Safe reclaim plan summary and file list.
 */
export function buildShareMountReclaimPlan(groups, options = {}) {
	const list = Array.isArray(groups) ? groups : []
	const boundaryFilter = typeof options.boundaryFilter === 'string' ? options.boundaryFilter : 'all'
	const mountFilter = typeof options.mountFilter === 'string' ? options.mountFilter : ''

	const safeFiles = []
	let safeBytes = 0
	let blockedCount = 0
	let blockedBytes = 0
	let orphanedCount = 0
	let orphanedBytes = 0
	let readonlyCount = 0
	let readonlyBytes = 0
	let groupsImpacted = 0

	for (const group of list) {
		if (!group || !Array.isArray(group.entries)) {
			continue
		}
		let groupHasSafe = false
		for (const entry of group.entries) {
			if (entry.isCanonicalMaster) {
				continue
			}
			if (boundaryFilter !== 'all' && entry.boundary.boundaryType !== boundaryFilter) {
				continue
			}
			if (mountFilter && entry.boundary.rootKey !== mountFilter) {
				continue
			}

			if (entry.disposition === 'safe_reclaim' && entry.permissions.canDelete) {
				safeFiles.push({
					id: entry.id,
					nodeId: entry.nodeId,
					fileId: entry.fileId,
					path: entry.path,
					name: entry.name,
					size: entry.size,
					fileHash: entry.fileHash,
					boundaryType: entry.boundary.boundaryType,
					rootLabel: entry.boundary.rootLabel,
					permissionLabel: entry.permissions.permissionLabel,
				})
				safeBytes += entry.size
				groupHasSafe = true
			} else {
				blockedCount++
				blockedBytes += entry.size
				if (entry.boundary.isOrphanedMount) {
					orphanedCount++
					orphanedBytes += entry.size
				} else {
					readonlyCount++
					readonlyBytes += entry.size
				}
			}
		}
		if (groupHasSafe) {
			groupsImpacted++
		}
	}

	return {
		safeFiles,
		safeCount: safeFiles.length,
		safeBytes,
		safeBytesFormatted: formatBytes(safeBytes),
		blockedCount,
		blockedBytes,
		blockedBytesFormatted: formatBytes(blockedBytes),
		orphanedCount,
		orphanedBytes,
		orphanedBytesFormatted: formatBytes(orphanedBytes),
		readonlyCount,
		readonlyBytes,
		readonlyBytesFormatted: formatBytes(readonlyBytes),
		groupsImpacted,
	}
}

/**
 * Generate a dry-run-first POSIX & Nextcloud OCC remediation script for
 * verifying external mounts, cleaning orphaned shares, and removing safe shadow copies.
 *
 * @param {object} reclaimPlan Reclaim plan from buildShareMountReclaimPlan.
 * @param {object} report Audit report from buildShareMountAuditReport.
 * @return {string} POSIX shell script content.
 */
export function generateShareMountRemediationScript(reclaimPlan, report) {
	const plan = reclaimPlan && typeof reclaimPlan === 'object' ? reclaimPlan : { safeFiles: [], safeCount: 0, safeBytesFormatted: '0 B', blockedCount: 0, orphanedCount: 0 }
	const safeFiles = Array.isArray(plan.safeFiles) ? plan.safeFiles : []
	const registries = report && Array.isArray(report.mountRegistry) ? report.mountRegistry : []
	const orphanedMounts = registries.filter(m => m.isOrphaned)
	const externalMounts = registries.filter(m => m.boundaryType === 'external_mount')

	const envDefault = (name, fallback) => '$' + '{' + name + ':-' + fallback + '}'
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# DuplicateFinder: Cross-Share Permission & External-Mount Remediation Script',
		`# Safe shadow copies: ${plan.safeCount || 0} (${plan.safeBytesFormatted || '0 B'})`,
		`# Blocked copies (read-only/locked/orphaned): ${plan.blockedCount || 0}`,
		'# DRY_RUN=1 by default. Run with DRY_RUN=0 ./duplicatefinder-share-mount-audit.sh to apply.',
		`DRY_RUN="${envDefault('DRY_RUN', '1')}"`,
		`OCC_BIN="${envDefault('OCC_BIN', 'php /var/www/html/occ')}"`,
		`NC_DATA_DIR="${envDefault('NC_DATA_DIR', '/var/www/html/data')}"`,
		'',
		'echo "[audit] Listing configured Nextcloud external mounts..."',
		'$OCC_BIN files_external:list || true',
		'',
	]

	if (externalMounts.length > 0 || orphanedMounts.length > 0) {
		lines.push('echo "[audit] Verifying external storage mount connectivity..."')
		for (const mount of [...orphanedMounts, ...externalMounts]) {
			const label = sanitizeLineText(mount.rootLabel)
			const status = sanitizeLineText(mount.mountStatus)
			lines.push(`# ${label} [backend=${sanitizeLineText(mount.backendLabel)}, status=${status}, copies=${mount.copyCount}]`)
			if (mount.mountId && /^[a-zA-Z0-9._-]+$/.test(mount.mountId)) {
				lines.push(`$OCC_BIN files_external:verify ${shellQuote(mount.mountId)} || echo "WARN: mount verification failed for ${sanitizeLineText(mount.mountId)}"`)
			}
		}
		lines.push('')
	}

	if (orphanedMounts.length > 0) {
		lines.push('echo "[audit] Orphaned mounts detected: run OCC cleanup if stale mount entries persist"')
		lines.push('if [ "$DRY_RUN" = "1" ]; then')
		lines.push('  echo "DRY-RUN: $OCC_BIN sharing:cleanup-remote-storages"')
		lines.push('  echo "DRY-RUN: $OCC_BIN files:cleanup"')
		lines.push('else')
		lines.push('  $OCC_BIN sharing:cleanup-remote-storages || true')
		lines.push('  $OCC_BIN files:cleanup || true')
		lines.push('fi')
		lines.push('')
	}

	if (safeFiles.length > 0) {
		lines.push(`echo "[reclaim] Processing ${safeFiles.length} verified writable shadow copies..."`)
		for (const file of safeFiles) {
			const relPath = sanitizePath(file.path || '')
			const quotedRel = shellQuote(relPath.replace(/^\/+/, ''))
			lines.push(`# [${sanitizeLineText(file.boundaryType)}] ${sanitizeLineText(file.rootLabel)} | ${sanitizeLineText(file.permissionLabel)}`)
			lines.push(`TARGET="$NC_DATA_DIR/"${quotedRel}`)
			lines.push('if [ "$DRY_RUN" = "1" ]; then')
			lines.push('  echo "DRY-RUN remove: $TARGET"')
			lines.push('else')
			lines.push('  rm -f -- "$TARGET"')
			lines.push('fi')
		}
		lines.push('')
		lines.push('if [ "$DRY_RUN" != "1" ]; then')
		lines.push('  $OCC_BIN files:scan --unscanned || true')
		lines.push('fi')
	} else {
		lines.push('echo "[reclaim] No writable shadow copies eligible for automatic file deletion."')
	}

	return lines.join('\n') + '\n'
}

/**
 * Export audited cross-share & external-mount report as JSON string.
 *
 * @param {object} report Audit report.
 * @param {Array<object>} [groups] Filtered groups subset.
 * @return {string} Pretty-printed JSON string.
 */
export function exportShareMountJson(report, groups = null) {
	const safeReport = report && typeof report === 'object' ? report : {}
	const exportedGroups = Array.isArray(groups)
		? groups
		: (Array.isArray(safeReport.groups) ? safeReport.groups : [])

	return JSON.stringify({
		schema: SHARE_MOUNT_SCHEMA,
		summary: safeReport.summary || {},
		boundaries: safeReport.boundaries || [],
		mountRegistry: safeReport.mountRegistry || [],
		findingBreakdown: safeReport.findingBreakdown || [],
		groups: exportedGroups.map(g => ({
			id: g.id,
			hash: g.hash,
			primaryName: g.primaryName,
			severity: g.severity,
			findings: g.findings,
			diagnoses: g.diagnoses,
			canonicalMasterPath: g.canonicalMasterPath,
			reclaimableBytes: g.reclaimableBytes,
			blockedBytes: g.blockedBytes,
			entries: g.entries.map(e => ({
				path: e.path,
				size: e.size,
				boundaryType: e.boundary.boundaryType,
				rootLabel: e.boundary.rootLabel,
				backend: e.boundary.backend,
				mountId: e.boundary.mountId,
				mountStatus: e.boundary.mountStatus,
				shareOwner: e.boundary.shareOwner,
				sharedWith: e.boundary.sharedWith,
				permissionMask: e.permissions.permissionMask,
				permissionLabel: e.permissions.permissionLabel,
				canDelete: e.permissions.canDelete,
				disposition: e.disposition,
			})),
		})),
	}, null, 2)
}

/**
 * Export audited cross-share & external-mount report as CWE-1236-safe RFC 4180 CSV.
 *
 * @param {object} report Audit report.
 * @param {Array<object>} [groups] Filtered groups subset.
 * @return {string} Safe CSV content.
 */
export function exportShareMountCsv(report, groups = null) {
	const safeReport = report && typeof report === 'object' ? report : {}
	const exportedGroups = Array.isArray(groups)
		? groups
		: (Array.isArray(safeReport.groups) ? safeReport.groups : [])

	const header = [
		'group_id',
		'file_hash',
		'severity',
		'findings',
		'file_name',
		'file_path',
		'size_bytes',
		'boundary_type',
		'storage_root',
		'backend',
		'mount_id',
		'mount_status',
		'share_owner',
		'shared_with',
		'permission_mask',
		'permission_label',
		'can_delete',
		'disposition',
	].map(escapeCsvCell).join(',')

	const rows = [header]
	for (const group of exportedGroups) {
		const findingText = Array.isArray(group.findings) ? group.findings.join(';') : ''
		for (const entry of group.entries || []) {
			rows.push([
				group.id,
				group.hash,
				group.severity,
				findingText,
				entry.name,
				entry.path,
				entry.size,
				entry.boundary.boundaryType,
				entry.boundary.rootLabel,
				entry.boundary.backend,
				entry.boundary.mountId,
				entry.boundary.mountStatus,
				entry.boundary.shareOwner,
				entry.boundary.sharedWith,
				entry.permissions.permissionMask,
				entry.permissions.permissionLabel,
				entry.permissions.canDelete ? 'true' : 'false',
				entry.disposition,
			].map(escapeCsvCell).join(','))
		}
	}

	return rows.join('\n')
}
