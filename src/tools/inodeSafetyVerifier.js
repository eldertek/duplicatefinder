/**
 * Pure Cross-Volume Inode, Hardlink-Alias & Storage-Backend Safety Verifier.
 * Inspired by rmlint, fclones, Czkawka, and Nextcloud Files / OCC storage admin.
 * Audits POSIX device/inode/nlink topology, detects already-hardlinked aliases
 * (0-byte phantom savings), external nlink reference traps, cross-device EXDEV
 * boundaries, CoW reflink filesystem eligibility, S3/Swift object-store and
 * encryption constraints, and generates read-only stat probes, occ files:scan
 * companion commands, rollback scripts, JSON reports, and CWE-1236-safe CSVs.
 * Zero DOM dependencies, zero network side effects.
 */

import { formatBytes } from './duplicateStats'
import { normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'

export const INODE_AUDIT_SCHEMA = 'duplicatefinder.inode-safety-audit.v1'

export const INODE_OPERATION_INTENTS = Object.freeze([
	'delete_copies',
	'hardlink',
	'reflink',
])

export const INODE_SURVIVOR_STRATEGIES = Object.freeze([
	'telemetry_anchor',
	'oldest',
	'newest',
	'shortest_path',
])

export const INODE_VERDICT_FILTERS = Object.freeze([
	'all',
	'already-hardlinked',
	'external-nlink-trap',
	'cross-device-exdev',
	'backend-blocked',
	'sparse-anomaly',
	'verified-safe',
])

export const INODE_SORT_MODES = Object.freeze([
	'true_reclaim_desc',
	'phantom_delta_desc',
	'risk_desc',
	'name_asc',
])

export const FILESYSTEM_PROFILE_IDS = Object.freeze([
	'auto',
	'ext4',
	'xfs',
	'btrfs',
	'zfs',
	'apfs',
	'ntfs',
	'nfs',
	'smb',
	'objectstore',
	'fuse',
])

const FILESYSTEM_CAPABILITIES = Object.freeze({
	ext4: {
		id: 'ext4',
		label: 'ext4 (POSIX)',
		supportsHardlink: true,
		supportsReflink: false,
		supportsSymlink: true,
		isObjectStore: false,
		requiresOccScan: true,
		note: 'Supports same-device hardlinks; lacks CoW reflink support.',
	},
	xfs: {
		id: 'xfs',
		label: 'XFS (CoW / Reflink)',
		supportsHardlink: true,
		supportsReflink: true,
		supportsSymlink: true,
		isObjectStore: false,
		requiresOccScan: true,
		note: 'Supports same-device hardlinks and CoW reflinks (when reflink=1).',
	},
	btrfs: {
		id: 'btrfs',
		label: 'Btrfs (CoW)',
		supportsHardlink: true,
		supportsReflink: true,
		supportsSymlink: true,
		isObjectStore: false,
		requiresOccScan: true,
		note: 'Supports same-subvolume hardlinks and CoW reflinks.',
	},
	zfs: {
		id: 'zfs',
		label: 'ZFS (Dataset)',
		supportsHardlink: true,
		supportsReflink: true,
		supportsSymlink: true,
		isObjectStore: false,
		requiresOccScan: true,
		note: 'Hardlinks/block-cloning apply within a single dataset only.',
	},
	apfs: {
		id: 'apfs',
		label: 'APFS (CoW)',
		supportsHardlink: true,
		supportsReflink: true,
		supportsSymlink: true,
		isObjectStore: false,
		requiresOccScan: true,
		note: 'Supports same-volume hardlinks and CoW clones.',
	},
	ntfs: {
		id: 'ntfs',
		label: 'NTFS',
		supportsHardlink: true,
		supportsReflink: false,
		supportsSymlink: true,
		isObjectStore: false,
		requiresOccScan: true,
		note: 'Supports same-volume hardlinks; no Linux cp --reflink=always.',
	},
	nfs: {
		id: 'nfs',
		label: 'NFS Share',
		supportsHardlink: true,
		supportsReflink: false,
		supportsSymlink: true,
		isObjectStore: false,
		requiresOccScan: true,
		note: 'Hardlinks allowed only within a single NFS export; reflinks unsupported.',
	},
	smb: {
		id: 'smb',
		label: 'SMB / CIFS Mount',
		supportsHardlink: false,
		supportsReflink: false,
		supportsSymlink: false,
		isObjectStore: false,
		requiresOccScan: true,
		note: 'External SMB/CIFS mount blocks POSIX hardlinks and CoW reflinks.',
	},
	objectstore: {
		id: 'objectstore',
		label: 'Object Store (S3 / Swift)',
		supportsHardlink: false,
		supportsReflink: false,
		supportsSymlink: false,
		isObjectStore: true,
		requiresOccScan: false,
		note: 'Primary/external S3 or Swift storage uses opaque object keys; POSIX links unsupported.',
	},
	fuse: {
		id: 'fuse',
		label: 'FUSE / WebDAV / rclone',
		supportsHardlink: false,
		supportsReflink: false,
		supportsSymlink: false,
		isObjectStore: false,
		requiresOccScan: true,
		note: 'Virtual FUSE/WebDAV mount generally prohibits POSIX hardlinks and reflinks.',
	},
})

const FS_ALIASES = Object.freeze({
	ext4: 'ext4',
	ext3: 'ext4',
	ext2: 'ext4',
	xfs: 'xfs',
	btrfs: 'btrfs',
	zfs: 'zfs',
	apfs: 'apfs',
	ntfs: 'ntfs',
	nfs: 'nfs',
	nfs4: 'nfs',
	smb: 'smb',
	smb2: 'smb',
	smb3: 'smb',
	cifs: 'smb',
	s3: 'objectstore',
	amazons3: 'objectstore',
	swift: 'objectstore',
	openstack: 'objectstore',
	objectstore: 'objectstore',
	minio: 'objectstore',
	ceph: 'objectstore',
	fuse: 'fuse',
	rclone: 'fuse',
	webdav: 'fuse',
	dav: 'fuse',
	sftp: 'fuse',
	ftp: 'fuse',
})

const RISK_WEIGHT = Object.freeze({
	'external-nlink-trap': 5,
	'already-hardlinked': 4,
	'cross-device-exdev': 3,
	'backend-blocked': 2,
	'sparse-anomaly': 1,
	'verified-safe': 0,
})

/**
 * Quote an arbitrary string safely for POSIX single-quoted shell scripts.
 *
 * @param {*} value Raw value to quote.
 * @return {string} POSIX single-quoted string.
 */
export function shellQuote(value) {
	const text = typeof value === 'string' ? value : String(value ?? '')
	return `'${text.replace(/'/g, '\'"\'"\'')}'`
}

/**
 * Normalize a raw filesystem path to forward-slash POSIX form.
 *
 * @param {string|null|undefined} rawPath Raw path string.
 * @return {string} Normalized POSIX path or empty string.
 */
function normalizePosixPath(rawPath) {
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
 * Parse a finite non-negative integer field from candidate object keys.
 *
 * @param {object|null|undefined} obj Candidate object.
 * @param {Array<string>} keys Field names to inspect.
 * @return {number|null} Parsed integer or null.
 */
function readPositiveInt(obj, keys) {
	if (!obj || typeof obj !== 'object') {
		return null
	}
	for (const key of keys) {
		if (!Object.prototype.hasOwnProperty.call(obj, key)) {
			continue
		}
		const raw = obj[key]
		if (raw === null || raw === undefined || raw === '' || typeof raw === 'boolean') {
			continue
		}
		const num = Number(raw)
		if (Number.isFinite(num) && num >= 0) {
			return Math.floor(num)
		}
	}
	return null
}

/**
 * Parse a timestamp field into finite milliseconds.
 *
 * @param {object|null|undefined} file File entry.
 * @return {number|null} Timestamp in ms or null.
 */
function getFileTimestamp(file) {
	if (!file || typeof file !== 'object') {
		return null
	}
	for (const key of ['mtime', 'modified', 'updatedAt', 'lastModified']) {
		const raw = file[key]
		if (raw === null || raw === undefined || raw === '' || typeof raw === 'boolean') {
			continue
		}
		if (raw instanceof Date) {
			const ms = raw.getTime()
			if (Number.isFinite(ms)) {
				return ms
			}
			continue
		}
		if (typeof raw === 'number' && Number.isFinite(raw)) {
			return raw < 1e11 ? Math.round(raw * 1000) : Math.round(raw)
		}
		if (typeof raw === 'string') {
			const trimmed = raw.trim()
			if (!trimmed) {
				continue
			}
			if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
				const num = Number(trimmed)
				if (Number.isFinite(num)) {
					return num < 1e11 ? Math.round(num * 1000) : Math.round(num)
				}
			}
			const parsed = Date.parse(trimmed)
			if (Number.isFinite(parsed)) {
				return parsed
			}
		}
	}
	return null
}

/**
 * Classify a filesystem or backend identifier into capability metadata.
 *
 * @param {string|null|undefined} rawFsType Raw filesystem or backend string.
 * @return {object} Filesystem capability descriptor.
 */
export function classifyFilesystemCapability(rawFsType) {
	const key = typeof rawFsType === 'string' ? rawFsType.trim().toLowerCase() : ''
	const canonical = FS_ALIASES[key] || 'ext4'
	return FILESYSTEM_CAPABILITIES[canonical] || FILESYSTEM_CAPABILITIES.ext4
}

/**
 * Resolve a stable group key for a duplicate group object.
 *
 * @param {object|null|undefined} group Duplicate group object.
 * @param {number} [index=0] Fallback index.
 * @return {string} Group identifier.
 */
export function resolveInodeGroupKey(group, index = 0) {
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
 * Infer Nextcloud user id from a `/<user>/files/...` path.
 *
 * @param {string} posixPath Normalized POSIX path.
 * @return {string} Nextcloud username or empty string.
 */
function extractNextcloudUser(posixPath) {
	const match = posixPath.match(/^\/([^/]+)\/files(?:\/|$)/)
	return match ? match[1] : ''
}

/**
 * Extract POSIX device, inode, nlink, block allocation, and storage backend topology.
 *
 * @param {object|null|undefined} file Duplicate file entry.
 * @param {number} [index=0] Fallback index inside group.
 * @param {string} [filesystemOverride='auto'] Optional filesystem simulation override.
 * @return {object} Normalized inode and backend telemetry record.
 */
export function extractFileInodeTelemetry(file, index = 0, filesystemOverride = 'auto') {
	const safeFile = file && typeof file === 'object' ? file : {}
	const posixPath = normalizePosixPath(safeFile.path || '')
	const displayPath = normalizePathForDiff(safeFile.path || '') || posixPath || `copy-${index + 1}`
	const pathParts = posixPath.split('/').filter(Boolean)
	const fileName = pathParts.length > 0 ? pathParts[pathParts.length - 1] : `copy-${index + 1}`

	const explicitDevice = safeFile.dev ?? safeFile.deviceId ?? safeFile.fsId ?? safeFile.storageId ?? safeFile.mountId
	const hasExplicitDevice = explicitDevice !== null && explicitDevice !== undefined && String(explicitDevice).trim() !== ''

	let deviceKey = ''
	let deviceSource = 'path-inferred'
	if (hasExplicitDevice) {
		deviceKey = `dev:${String(explicitDevice).trim()}`
		deviceSource = 'telemetry'
	} else if (typeof safeFile.mountPoint === 'string' && safeFile.mountPoint.trim() !== '') {
		deviceKey = `mount:${normalizePosixPath(safeFile.mountPoint)}`
		deviceSource = 'mount-point'
	} else if (/^\/__groupfolders\//i.test(posixPath)) {
		const gfMatch = posixPath.match(/^\/__groupfolders\/([^/]+)/i)
		deviceKey = gfMatch ? `groupfolder:${gfMatch[1]}` : 'groupfolder:root'
	} else if (/\/files_external\//i.test(posixPath) || /^\/external\//i.test(posixPath)) {
		const extSeg = pathParts.slice(0, 3).join('/')
		deviceKey = `external:${extSeg || 'mount'}`
	} else {
		const ncUser = typeof safeFile.owner === 'string' && safeFile.owner.trim() !== ''
			? safeFile.owner.trim()
			: extractNextcloudUser(posixPath)
		if (ncUser) {
			deviceKey = `nc-home:${ncUser}`
		} else if (pathParts.length > 1) {
			deviceKey = `root:${pathParts[0]}`
		} else {
			deviceKey = 'root:default'
		}
	}

	const rawInode = readPositiveInt(safeFile, ['inode', 'ino', 'inodeNumber'])
	const inodeKnown = rawInode !== null && rawInode > 0
	const inodeKey = inodeKnown ? `${deviceKey}#ino:${rawInode}` : `${deviceKey}#path:${posixPath || index}`

	const rawNlink = readPositiveInt(safeFile, ['nlink', 'linkCount', 'hardlinkCount'])
	const nlink = rawNlink !== null && rawNlink >= 1 ? rawNlink : 1
	const nlinkKnown = rawNlink !== null && rawNlink >= 1

	const logicalBytes = Math.max(0, Number(safeFile.size) || 0)
	const blockSize = readPositiveInt(safeFile, ['blockSize', 'blksize']) || 4096
	const rawBlocks = readPositiveInt(safeFile, ['blocks', 'stBlocks'])
	const rawAllocated = readPositiveInt(safeFile, ['allocatedBytes', 'physicalBytes', 'diskBytes'])

	let allocatedBytes = logicalBytes
	let blockTelemetryKnown = false
	if (rawAllocated !== null) {
		allocatedBytes = rawAllocated
		blockTelemetryKnown = true
	} else if (rawBlocks !== null) {
		// POSIX st_blocks counts 512-byte sectors unless blockSize is explicitly marked
		const sectorUnit = safeFile.blockUnitBytes ? Number(safeFile.blockUnitBytes) : 512
		allocatedBytes = rawBlocks * (Number.isFinite(sectorUnit) && sectorUnit > 0 ? sectorUnit : 512)
		blockTelemetryKnown = true
	}

	const isSparse = blockTelemetryKnown && logicalBytes >= 4096 && allocatedBytes < Math.floor(logicalBytes * 0.85)

	let inferredFs = typeof safeFile.fsType === 'string' && safeFile.fsType.trim() !== ''
		? safeFile.fsType.trim().toLowerCase()
		: (typeof safeFile.filesystem === 'string' && safeFile.filesystem.trim() !== ''
			? safeFile.filesystem.trim().toLowerCase()
			: (typeof safeFile.backend === 'string' && safeFile.backend.trim() !== ''
				? safeFile.backend.trim().toLowerCase()
				: ''))

	if (!inferredFs) {
		if (/^s3:\/\//i.test(String(safeFile.path || '')) || /\/objectstore\//i.test(posixPath)) {
			inferredFs = 'objectstore'
		} else if (/^smb:\/\//i.test(String(safeFile.path || '')) || /\/files_external\/smb/i.test(posixPath)) {
			inferredFs = 'smb'
		} else if (/\/files_external\/nfs/i.test(posixPath)) {
			inferredFs = 'nfs'
		} else if (/\/files_external\/(webdav|sftp|ftp)/i.test(posixPath)) {
			inferredFs = 'fuse'
		} else {
			inferredFs = 'ext4'
		}
	}

	const effectiveFs = filesystemOverride && filesystemOverride !== 'auto'
		? filesystemOverride
		: inferredFs
	const backendProfile = classifyFilesystemCapability(effectiveFs)

	const encryptionMode = typeof safeFile.encryptionMode === 'string'
		? safeFile.encryptionMode.trim().toLowerCase()
		: (safeFile.encrypted ? 'oc_encryption' : '')
	const isEncrypted = Boolean(safeFile.encrypted || encryptionMode === 'oc_encryption' || encryptionMode === 'e2ee')

	const topologyProvenance = (hasExplicitDevice && inodeKnown)
		? 'telemetry-verified'
		: (hasExplicitDevice || inodeKnown || nlinkKnown || blockTelemetryKnown)
			? 'partial-telemetry'
			: 'path-inferred'

	return {
		selectionKey: getFileSelectionKey(safeFile),
		rawFile: safeFile,
		fileName,
		posixPath,
		displayPath,
		nextcloudUser: extractNextcloudUser(posixPath),
		deviceKey,
		deviceSource,
		inodeNumber: rawInode,
		inodeKnown,
		inodeKey,
		nlink,
		nlinkKnown,
		logicalBytes,
		allocatedBytes,
		blockSize,
		blockTelemetryKnown,
		isSparse,
		fsType: effectiveFs,
		backendProfile,
		isEncrypted,
		encryptionMode,
		topologyProvenance,
		isProtected: Boolean(safeFile.isInOriginFolder),
		isLocked: Boolean(safeFile.isLocked),
		mtimeMs: getFileTimestamp(safeFile),
	}
}

/**
 * Deterministic comparator for picking the surviving copy inside a duplicate group.
 * Protected origin copies always win.
 *
 * @param {object} a First telemetry record.
 * @param {object} b Second telemetry record.
 * @param {string} strategy Survivor selection strategy.
 * @return {number} Sort comparator result.
 */
function compareSurvivorCandidates(a, b, strategy) {
	if (a.isProtected !== b.isProtected) {
		return a.isProtected ? -1 : 1
	}

	if (strategy === 'telemetry_anchor') {
		// Prefer files already referenced externally (nlink > 1) so external backups stay intact
		if ((a.nlink > 1) !== (b.nlink > 1)) {
			return a.nlink > 1 ? -1 : 1
		}
		if (a.topologyProvenance !== b.topologyProvenance) {
			if (a.topologyProvenance === 'telemetry-verified') {
				return -1
			}
			if (b.topologyProvenance === 'telemetry-verified') {
				return 1
			}
		}
	}

	if (strategy === 'oldest' || strategy === 'telemetry_anchor') {
		if (a.mtimeMs !== null && b.mtimeMs !== null && a.mtimeMs !== b.mtimeMs) {
			return a.mtimeMs - b.mtimeMs
		}
		if (a.mtimeMs !== null && b.mtimeMs === null) {
			return -1
		}
		if (a.mtimeMs === null && b.mtimeMs !== null) {
			return 1
		}
	} else if (strategy === 'newest') {
		if (a.mtimeMs !== null && b.mtimeMs !== null && a.mtimeMs !== b.mtimeMs) {
			return b.mtimeMs - a.mtimeMs
		}
		if (a.mtimeMs !== null && b.mtimeMs === null) {
			return -1
		}
		if (a.mtimeMs === null && b.mtimeMs !== null) {
			return 1
		}
	}

	if (a.posixPath.length !== b.posixPath.length) {
		return a.posixPath.length - b.posixPath.length
	}
	return a.posixPath.localeCompare(b.posixPath)
}

/**
 * Select the canonical surviving copy for a duplicate group.
 *
 * @param {Array<object>} records Telemetry records in group.
 * @param {string} strategy Survivor strategy.
 * @param {string|number|null} manualKey Manual promoted selectionKey.
 * @return {object|null} Selected survivor record.
 */
export function pickInodeSurvivor(records, strategy = 'telemetry_anchor', manualKey = null) {
	if (!Array.isArray(records) || records.length === 0) {
		return null
	}
	if (manualKey !== null && manualKey !== undefined) {
		const promoted = records.find(rec => rec.selectionKey === manualKey)
		if (promoted) {
			return promoted
		}
	}
	const sorted = [...records].sort((a, b) => compareSurvivorCandidates(a, b, strategy))
	return sorted[0] || null
}

/**
 * Audit all duplicate groups for cross-volume EXDEV risks, hardlink aliases,
 * external nlink reference traps, backend/encryption constraints, and true
 * physical disk block savings.
 *
 * @param {Array<object>} groups Duplicate groups array.
 * @param {object} [options] Audit options.
 * @param {string} [options.intent='delete_copies'] Operation intent: delete_copies | hardlink | reflink.
 * @param {string} [options.filesystemOverride='auto'] Target filesystem simulation override.
 * @param {string} [options.strategy='telemetry_anchor'] Survivor strategy.
 * @param {object} [options.manualSurvivors={}] Map of groupKey -> selectionKey.
 * @return {object} Complete deterministic inode safety audit report.
 */
export function analyzeInodeSafety(groups, options = {}) {
	const intent = INODE_OPERATION_INTENTS.includes(options.intent) ? options.intent : 'delete_copies'
	const filesystemOverride = FILESYSTEM_PROFILE_IDS.includes(options.filesystemOverride)
		? options.filesystemOverride
		: 'auto'
	const strategy = INODE_SURVIVOR_STRATEGIES.includes(options.strategy)
		? options.strategy
		: 'telemetry_anchor'
	const manualSurvivors = options.manualSurvivors && typeof options.manualSurvivors === 'object'
		? options.manualSurvivors
		: {}

	const safeGroups = Array.isArray(groups)
		? groups.filter(group => group && typeof group === 'object')
		: []

	const items = []
	let totalApparentReclaimableBytes = 0
	let totalTruePhysicalReclaimableBytes = 0
	let totalPhantomSavingsBytes = 0
	let totalSafeReclaimCopyCount = 0
	let totalSafeReclaimBytes = 0

	const categoryCounts = {
		all: 0,
		'already-hardlinked': 0,
		'external-nlink-trap': 0,
		'cross-device-exdev': 0,
		'backend-blocked': 0,
		'sparse-anomaly': 0,
		'verified-safe': 0,
	}

	safeGroups.forEach((group, groupIndex) => {
		const rawFiles = Array.isArray(group.files)
			? group.files.filter(file => file && typeof file === 'object')
			: []
		if (rawFiles.length < 2) {
			return
		}

		const groupKey = resolveInodeGroupKey(group, groupIndex)
		const records = rawFiles.map((file, idx) => extractFileInodeTelemetry(file, idx, filesystemOverride))
		const manualKey = Object.prototype.hasOwnProperty.call(manualSurvivors, groupKey)
			? manualSurvivors[groupKey]
			: null
		const survivor = pickInodeSurvivor(records, strategy, manualKey)
		if (!survivor) {
			return
		}

		// Group records by physical (device, inode) cluster
		const clusterMap = new Map()
		const deviceSet = new Set()
		records.forEach((rec) => {
			deviceSet.add(rec.deviceKey)
			if (!clusterMap.has(rec.inodeKey)) {
				clusterMap.set(rec.inodeKey, [])
			}
			clusterMap.get(rec.inodeKey).push(rec)
		})

		const clusterCount = clusterMap.size
		const deviceCount = deviceSet.size
		const hasCrossDevice = deviceCount > 1

		let hasAlreadyHardlinked = false
		let hasExternalNlinkTrap = false
		let hasBackendBlocked = false
		let hasSparseAnomaly = false
		let hasExdevForIntent = false

		let groupApparentBytes = 0
		let groupTruePhysicalBytes = 0
		let groupSafeReclaimCount = 0
		let groupSafeReclaimBytes = 0

		// Track which inode clusters remain pinned after survivor + external nlinks
		const pinnedClusters = new Set([survivor.inodeKey])
		const externalTrapClusters = new Set()
		clusterMap.forEach((clusterMembers, inodeKey) => {
			if (clusterMembers.length > 1) {
				hasAlreadyHardlinked = true
			}
			const maxNlink = Math.max(...clusterMembers.map(member => member.nlink))
			if (maxNlink > clusterMembers.length) {
				hasExternalNlinkTrap = true
				externalTrapClusters.add(inodeKey)
				pinnedClusters.add(inodeKey)
			}
		})

		// First-pass cluster accounting for true physical disk blocks
		const freedClusterBytes = new Set()

		const copies = records.map((rec) => {
			const isSurvivor = rec.selectionKey === survivor.selectionKey
			const clusterMembers = clusterMap.get(rec.inodeKey) || [rec]
			const isSameInodeAsSurvivor = !isSurvivor && rec.inodeKey === survivor.inodeKey
			const isSameInodeAlias = clusterMembers.length > 1 && !isSurvivor
			const hasExternalNlink = externalTrapClusters.has(rec.inodeKey)
			const isCrossDeviceFromSurvivor = rec.deviceKey !== survivor.deviceKey
			const physicalUnitBytes = rec.isSparse ? rec.allocatedBytes : rec.logicalBytes

			if (rec.isSparse) {
				hasSparseAnomaly = true
			}

			if (!isSurvivor && !rec.isProtected) {
				groupApparentBytes += rec.logicalBytes
			}

			let copyVerdict = 'verified-safe'
			let copyReason = 'Independent inode eligible for safe reclaim.'
			let canSafeReclaim = false

			// Check backend compatibility for link-based intents or encryption
			const backendNeedsBlock = (intent === 'hardlink' && (!rec.backendProfile.supportsHardlink || !survivor.backendProfile.supportsHardlink || rec.isEncrypted))
				|| (intent === 'reflink' && (!rec.backendProfile.supportsReflink || !survivor.backendProfile.supportsReflink || rec.isEncrypted))

			if (isSurvivor) {
				copyVerdict = 'survivor'
				copyReason = rec.isProtected
					? 'Protected Origin anchor retained as survivor.'
					: 'Canonical survivor copy.'
			} else if (rec.isProtected) {
				copyVerdict = 'protected-origin'
				copyReason = 'Inside protected Origin folder; excluded from modification.'
			} else if (rec.isLocked) {
				copyVerdict = 'locked-file'
				copyReason = 'File is currently locked by Nextcloud.'
			} else if (isSameInodeAsSurvivor || isSameInodeAlias) {
				copyVerdict = 'already-hardlinked'
				copyReason = `Shares inode #${rec.inodeNumber ?? 'alias'} with another copy in group (0 B true disk savings).`
			} else if (hasExternalNlink) {
				copyVerdict = 'external-nlink-trap'
				copyReason = `nlink=${rec.nlink} exceeds ${clusterMembers.length} group copies; external snapshot/hardlink retains disk blocks.`
			} else if (backendNeedsBlock) {
				hasBackendBlocked = true
				copyVerdict = 'backend-blocked'
				copyReason = rec.isEncrypted
					? `Encrypted (${rec.encryptionMode || 'oc_encryption'}) copy cannot use ${intent}.`
					: `${rec.backendProfile.label} does not support ${intent}: ${rec.backendProfile.note}`
			} else if (isCrossDeviceFromSurvivor && (intent === 'hardlink' || intent === 'reflink')) {
				hasExdevForIntent = true
				copyVerdict = 'cross-device-exdev'
				copyReason = `Cross-volume EXDEV boundary (${rec.deviceKey} vs ${survivor.deviceKey}); ${intent} requires same filesystem.`
			} else if (rec.isSparse) {
				copyVerdict = 'sparse-anomaly'
				copyReason = `Sparse file: ${formatBytes(rec.allocatedBytes)} physical blocks vs ${formatBytes(rec.logicalBytes)} logical.`
				canSafeReclaim = true
			} else {
				copyVerdict = 'verified-safe'
				copyReason = isCrossDeviceFromSurvivor
					? `Cross-volume copy (${rec.deviceKey}); safe to delete redundant copy to reclaim ${formatBytes(physicalUnitBytes)}.`
					: `Verified independent inode (nlink=${rec.nlink}) on ${rec.backendProfile.label}.`
				canSafeReclaim = true
			}

			// Calculate true physical block savings once per non-pinned inode cluster
			if (!isSurvivor && !rec.isProtected && !pinnedClusters.has(rec.inodeKey) && !freedClusterBytes.has(rec.inodeKey)) {
				freedClusterBytes.add(rec.inodeKey)
				groupTruePhysicalBytes += physicalUnitBytes
			}

			if (canSafeReclaim) {
				groupSafeReclaimCount += 1
				groupSafeReclaimBytes += physicalUnitBytes
			}

			return {
				...rec,
				isSurvivor,
				isSameInodeAsSurvivor,
				isSameInodeAlias,
				hasExternalNlink,
				isCrossDeviceFromSurvivor,
				physicalUnitBytes,
				physicalUnitFormatted: formatBytes(physicalUnitBytes),
				logicalFormatted: formatBytes(rec.logicalBytes),
				allocatedFormatted: formatBytes(rec.allocatedBytes),
				copyVerdict,
				copyReason,
				canSafeReclaim,
			}
		})

		const findingTags = []
		if (hasAlreadyHardlinked) {
			findingTags.push('already-hardlinked')
		}
		if (hasExternalNlinkTrap) {
			findingTags.push('external-nlink-trap')
		}
		if (hasCrossDevice) {
			findingTags.push('cross-device-exdev')
		}
		if (hasBackendBlocked) {
			findingTags.push('backend-blocked')
		}
		if (hasSparseAnomaly) {
			findingTags.push('sparse-anomaly')
		}

		// Primary verdict prioritizes critical sysadmin traps
		let primaryVerdict = 'verified-safe'
		if (hasExternalNlinkTrap) {
			primaryVerdict = 'external-nlink-trap'
		} else if (hasAlreadyHardlinked) {
			primaryVerdict = 'already-hardlinked'
		} else if (hasExdevForIntent || (hasCrossDevice && intent !== 'delete_copies')) {
			primaryVerdict = 'cross-device-exdev'
		} else if (hasBackendBlocked) {
			primaryVerdict = 'backend-blocked'
		} else if (hasCrossDevice) {
			primaryVerdict = 'cross-device-exdev'
		} else if (hasSparseAnomaly) {
			primaryVerdict = 'sparse-anomaly'
		}

		const phantomDeltaBytes = Math.max(0, groupApparentBytes - groupTruePhysicalBytes)

		categoryCounts.all += 1
		if (hasAlreadyHardlinked) {
			categoryCounts['already-hardlinked'] += 1
		}
		if (hasExternalNlinkTrap) {
			categoryCounts['external-nlink-trap'] += 1
		}
		if (hasCrossDevice) {
			categoryCounts['cross-device-exdev'] += 1
		}
		if (hasBackendBlocked) {
			categoryCounts['backend-blocked'] += 1
		}
		if (hasSparseAnomaly) {
			categoryCounts['sparse-anomaly'] += 1
		}
		if (primaryVerdict === 'verified-safe') {
			categoryCounts['verified-safe'] += 1
		}

		totalApparentReclaimableBytes += groupApparentBytes
		totalTruePhysicalReclaimableBytes += groupTruePhysicalBytes
		totalPhantomSavingsBytes += phantomDeltaBytes
		totalSafeReclaimCopyCount += groupSafeReclaimCount
		totalSafeReclaimBytes += groupSafeReclaimBytes

		items.push({
			groupKey,
			groupId: group.id ?? null,
			hash: typeof group.hash === 'string' ? group.hash : '',
			rawGroup: group,
			title: survivor.fileName,
			copyCount: copies.length,
			clusterCount,
			deviceCount,
			devices: Array.from(deviceSet),
			survivor,
			copies,
			findingTags,
			primaryVerdict,
			riskScore: RISK_WEIGHT[primaryVerdict] ?? 0,
			apparentReclaimableBytes: groupApparentBytes,
			apparentReclaimableFormatted: formatBytes(groupApparentBytes),
			truePhysicalReclaimableBytes: groupTruePhysicalBytes,
			truePhysicalReclaimableFormatted: formatBytes(groupTruePhysicalBytes),
			phantomDeltaBytes,
			phantomDeltaFormatted: formatBytes(phantomDeltaBytes),
			safeReclaimCount: groupSafeReclaimCount,
			safeReclaimBytes: groupSafeReclaimBytes,
			safeReclaimFormatted: formatBytes(groupSafeReclaimBytes),
			hasCrossDevice,
			hasAlreadyHardlinked,
			hasExternalNlinkTrap,
			hasBackendBlocked,
			hasSparseAnomaly,
		})
	})

	return {
		schema: INODE_AUDIT_SCHEMA,
		generatedAt: new Date().toISOString(),
		intent,
		filesystemOverride,
		strategy,
		summary: {
			totalGroups: items.length,
			apparentReclaimableBytes: totalApparentReclaimableBytes,
			apparentReclaimableFormatted: formatBytes(totalApparentReclaimableBytes),
			truePhysicalReclaimableBytes: totalTruePhysicalReclaimableBytes,
			truePhysicalReclaimableFormatted: formatBytes(totalTruePhysicalReclaimableBytes),
			phantomSavingsBytes: totalPhantomSavingsBytes,
			phantomSavingsFormatted: formatBytes(totalPhantomSavingsBytes),
			safeReclaimCopyCount: totalSafeReclaimCopyCount,
			safeReclaimBytes: totalSafeReclaimBytes,
			safeReclaimFormatted: formatBytes(totalSafeReclaimBytes),
			categoryCounts,
		},
		items,
	}
}

/**
 * Filter and sort audited inode items without mutating the source report.
 *
 * @param {Array<object>} items Audited items from analyzeInodeSafety.
 * @param {object} [options] Filter and sort options.
 * @param {string} [options.verdictFilter='all'] Verdict filter.
 * @param {string} [options.searchQuery=''] Path/hash/device substring query.
 * @param {number} [options.minTrueReclaimBytes=0] Minimum true physical savings threshold.
 * @param {string} [options.sortMode='true_reclaim_desc'] Sort mode.
 * @return {Array<object>} Filtered and sorted items.
 */
export function filterAndSortInodeItems(items, options = {}) {
	if (!Array.isArray(items) || items.length === 0) {
		return []
	}

	const verdictFilter = INODE_VERDICT_FILTERS.includes(options.verdictFilter)
		? options.verdictFilter
		: 'all'
	const query = typeof options.searchQuery === 'string'
		? options.searchQuery.trim().toLowerCase()
		: ''
	const minBytes = Number.isFinite(Number(options.minTrueReclaimBytes)) && Number(options.minTrueReclaimBytes) > 0
		? Number(options.minTrueReclaimBytes)
		: 0
	const sortMode = INODE_SORT_MODES.includes(options.sortMode)
		? options.sortMode
		: 'true_reclaim_desc'

	const filtered = items.filter((item) => {
		if (verdictFilter !== 'all') {
			if (verdictFilter === 'verified-safe') {
				if (item.primaryVerdict !== 'verified-safe') {
					return false
				}
			} else if (!item.findingTags.includes(verdictFilter)) {
				return false
			}
		}

		if (minBytes > 0 && item.truePhysicalReclaimableBytes < minBytes) {
			return false
		}

		if (query) {
			const haystacks = [
				item.title,
				item.hash,
				...item.devices,
				...item.copies.map(copy => `${copy.displayPath} ${copy.fsType} ${copy.inodeNumber ?? ''}`),
			]
			const matched = haystacks.some(value => String(value || '').toLowerCase().includes(query))
			if (!matched) {
				return false
			}
		}

		return true
	})

	const sorted = [...filtered]
	sorted.sort((a, b) => {
		if (sortMode === 'phantom_delta_desc') {
			if (b.phantomDeltaBytes !== a.phantomDeltaBytes) {
				return b.phantomDeltaBytes - a.phantomDeltaBytes
			}
		} else if (sortMode === 'risk_desc') {
			if (b.riskScore !== a.riskScore) {
				return b.riskScore - a.riskScore
			}
		} else if (sortMode === 'name_asc') {
			const cmp = a.title.localeCompare(b.title)
			if (cmp !== 0) {
				return cmp
			}
		}

		if (b.truePhysicalReclaimableBytes !== a.truePhysicalReclaimableBytes) {
			return b.truePhysicalReclaimableBytes - a.truePhysicalReclaimableBytes
		}
		return a.title.localeCompare(b.title)
	})

	return sorted
}

/**
 * Collect safe-to-reclaim copy objects for deletion from a report or specific group.
 * Strictly excludes survivors, Origin-protected copies, locked files, same-inode aliases,
 * external nlink traps, and backend/EXDEV blocked copies.
 *
 * @param {object} report Output of analyzeInodeSafety.
 * @param {string|null} [targetGroupKey=null] Optional single groupKey.
 * @return {{ files: Array<object>, groupCount: number, totalBytes: number, totalFormatted: string }} Safe selection payload.
 */
export function buildInodeSafeSelection(report, targetGroupKey = null) {
	const items = Array.isArray(report?.items) ? report.items : []
	const files = []
	let groupCount = 0
	let totalBytes = 0

	items.forEach((item) => {
		if (targetGroupKey && item.groupKey !== targetGroupKey) {
			return
		}
		const groupFiles = []
		const seenCluster = new Set()
		item.copies.forEach((copy) => {
			if (!copy.canSafeReclaim) {
				return
			}
			// Never queue two copies from the same inode cluster in delete_copies
			if (seenCluster.has(copy.inodeKey)) {
				return
			}
			seenCluster.add(copy.inodeKey)
			groupFiles.push(copy.rawFile)
			totalBytes += copy.physicalUnitBytes
		})
		if (groupFiles.length > 0) {
			groupCount += 1
			files.push(...groupFiles)
		}
	})

	return {
		files,
		groupCount,
		totalBytes,
		totalFormatted: formatBytes(totalBytes),
	}
}

/**
 * Resolve a physical path under an optional Nextcloud data root prefix.
 *
 * @param {string} dataRoot Nextcloud data directory prefix.
 * @param {string} posixPath Relative/virtual Nextcloud path.
 * @return {string} Combined POSIX path.
 */
function joinDataRootPath(dataRoot, posixPath) {
	const cleanRoot = typeof dataRoot === 'string' && dataRoot.trim() !== ''
		? dataRoot.trim().replace(/\\/g, '/').replace(/\/+$/, '')
		: '/var/www/nextcloud/data'
	const cleanPath = normalizePosixPath(posixPath)
	return `${cleanRoot}${cleanPath}`
}

/**
 * Generate a read-only POSIX stat and samefile inode probe script.
 *
 * @param {object} report Output of analyzeInodeSafety.
 * @param {object} [options] Probe options.
 * @param {string} [options.dataRoot='/var/www/nextcloud/data'] Nextcloud data root.
 * @param {string|null} [options.targetGroupKey=null] Optional single groupKey.
 * @return {string} Read-only bash verification script.
 */
export function buildInodeStatProbeScript(report, options = {}) {
	const dataRoot = typeof options.dataRoot === 'string' && options.dataRoot.trim() !== ''
		? options.dataRoot.trim()
		: '/var/www/nextcloud/data'
	const targetGroupKey = options.targetGroupKey || null
	const items = Array.isArray(report?.items)
		? report.items.filter(item => !targetGroupKey || item.groupKey === targetGroupKey)
		: []

	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'# Read-only POSIX inode, device-id, nlink, and physical block probe',
		`# Schema: ${INODE_AUDIT_SCHEMA}`,
		`DATA_ROOT=${shellQuote(dataRoot)}`,
		'',
		'probe_file() {',
		'  local rel="$1"',
		'  local full="$DATA_ROOT$rel"',
		'  if [ ! -e "$full" ]; then',
		'    printf "MISSING\\t%s\\n" "$full"',
		'    return 0',
		'  fi',
		'  stat -c "%d\\t%i\\t%h\\t%b\\t%B\\t%s\\t%n" "$full"',
		'}',
		'',
		'printf "DEV\\tINODE\\tNLINK\\tBLOCKS\\tBLKSIZE\\tBYTES\\tPATH\\n"',
	]

	if (items.length === 0) {
		lines.push('echo "# No duplicate groups available for inode probing."')
		return `${lines.join('\n')}\n`
	}

	items.forEach((item) => {
		lines.push(`# Group: ${item.title.replace(/[\r\n]+/g, ' ')} (${item.primaryVerdict}, true savings ${item.truePhysicalReclaimableFormatted})`)
		item.copies.forEach((copy) => {
			lines.push(`probe_file ${shellQuote(copy.posixPath)}`)
		})
		if (item.survivor) {
			lines.push('# Check external hardlink siblings on same filesystem for survivor:')
			lines.push(`# find "$DATA_ROOT" -xdev -samefile ${shellQuote(joinDataRootPath(dataRoot, item.survivor.posixPath))} -print`)
		}
		lines.push('')
	})

	return `${lines.join('\n')}\n`
}

/**
 * Generate a companion Nextcloud OCC scan and dry-run-first execution + rollback script.
 *
 * @param {object} report Output of analyzeInodeSafety.
 * @param {object} [options] Script generation options.
 * @param {string} [options.dataRoot='/var/www/nextcloud/data'] Nextcloud data directory.
 * @param {string} [options.occBinary='sudo -u www-data php /var/www/nextcloud/occ'] OCC invocation prefix.
 * @param {string|null} [options.targetGroupKey=null] Optional single groupKey.
 * @return {string} Guarded bash script with DRY_RUN=1 default and rollback manifest.
 */
export function buildInodeOccPlanScript(report, options = {}) {
	const dataRoot = typeof options.dataRoot === 'string' && options.dataRoot.trim() !== ''
		? options.dataRoot.trim()
		: '/var/www/nextcloud/data'
	const occBinary = typeof options.occBinary === 'string' && options.occBinary.trim() !== ''
		? options.occBinary.trim()
		: 'sudo -u www-data php /var/www/nextcloud/occ'
	const intent = report?.intent || 'delete_copies'
	const targetGroupKey = options.targetGroupKey || null
	const items = Array.isArray(report?.items)
		? report.items.filter(item => !targetGroupKey || item.groupKey === targetGroupKey)
		: []

	const affectedUsers = new Set()
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'# Nextcloud Inode-Verified Remediation & OCC Companion Script',
		`# Intent: ${intent} | True physical savings: ${report?.summary?.truePhysicalReclaimableFormatted || '0 B'}`,
		'# Safety default: DRY_RUN=1. Re-run with DRY_RUN=0 to apply changes.',
		'DRY_RUN="' + '$' + '{DRY_RUN:-1}"',
		`DATA_ROOT=${shellQuote(dataRoot)}`,
		'ROLLBACK_DIR="' + '$' + '{ROLLBACK_DIR:-/tmp/nc-inode-rollback-$(date +%Y%m%d-%H%M%S)}"',
		'mkdir -p "$ROLLBACK_DIR"',
		'',
	]

	let actionCount = 0
	items.forEach((item) => {
		const survivorPath = joinDataRootPath(dataRoot, item.survivor.posixPath)
		const safeCopies = item.copies.filter(copy => copy.canSafeReclaim)
		if (safeCopies.length === 0) {
			return
		}
		lines.push(`# Group: ${item.title.replace(/[\r\n]+/g, ' ')} [${item.primaryVerdict}]`)
		if (item.survivor.nextcloudUser) {
			affectedUsers.add(item.survivor.nextcloudUser)
		}
		safeCopies.forEach((copy) => {
			actionCount += 1
			if (copy.nextcloudUser) {
				affectedUsers.add(copy.nextcloudUser)
			}
			const targetPath = joinDataRootPath(dataRoot, copy.posixPath)
			const qTarget = shellQuote(targetPath)
			const qSurvivor = shellQuote(survivorPath)
			const qTargetDisp = shellQuote(copy.displayPath)
			const qSurvivorDisp = shellQuote(item.survivor.displayPath)

			lines.push('if [ "$DRY_RUN" = "1" ]; then')
			lines.push(`  printf '[DRY-RUN] %s: %s -> survivor %s\\n' ${shellQuote(intent)} ${qTargetDisp} ${qSurvivorDisp}`)
			lines.push('else')
			lines.push('  # Verify same device before link operations')
			if (intent === 'hardlink') {
				lines.push(`  [ "$(stat -c '%d' ${qSurvivor})" = "$(stat -c '%d' ${qTarget})" ] || { printf 'EXDEV abort: %s\\n' ${qTargetDisp}; exit 1; }`)
				lines.push(`  cp -a ${qTarget} "$ROLLBACK_DIR/backup-${actionCount}"`)
				lines.push(`  ln -f ${qSurvivor} ${qTarget}`)
			} else if (intent === 'reflink') {
				lines.push(`  [ "$(stat -c '%d' ${qSurvivor})" = "$(stat -c '%d' ${qTarget})" ] || { printf 'EXDEV abort: %s\\n' ${qTargetDisp}; exit 1; }`)
				lines.push(`  cp -a ${qTarget} "$ROLLBACK_DIR/backup-${actionCount}"`)
				lines.push(`  cp --reflink=always -f ${qSurvivor} ${qTarget}`)
			} else {
				lines.push(`  mv ${qTarget} "$ROLLBACK_DIR/deleted-${actionCount}"`)
			}
			lines.push('fi')
		})
		lines.push('')
	})

	if (actionCount === 0) {
		lines.push('echo "No safe inode operations eligible under current guards."')
	}

	lines.push('# Nextcloud filecache synchronization commands:')
	if (affectedUsers.size > 0) {
		affectedUsers.forEach((user) => {
			lines.push(`# ${occBinary} files:scan ${shellQuote(user)}`)
		})
	} else {
		lines.push(`# ${occBinary} files:scan --all`)
	}
	lines.push(`# ${occBinary} files:cleanup`)

	return `${lines.join('\n')}\n`
}

/**
 * Export structured JSON audit report.
 *
 * @param {object} report Output of analyzeInodeSafety.
 * @return {string} Pretty-printed JSON string.
 */
export function buildInodeSafetyJson(report) {
	const payload = {
		schema: INODE_AUDIT_SCHEMA,
		generatedAt: report?.generatedAt || new Date().toISOString(),
		intent: report?.intent || 'delete_copies',
		filesystemOverride: report?.filesystemOverride || 'auto',
		strategy: report?.strategy || 'telemetry_anchor',
		summary: report?.summary || {},
		groups: Array.isArray(report?.items)
			? report.items.map(item => ({
				groupKey: item.groupKey,
				groupId: item.groupId,
				hash: item.hash,
				title: item.title,
				primaryVerdict: item.primaryVerdict,
				findingTags: item.findingTags,
				deviceCount: item.deviceCount,
				clusterCount: item.clusterCount,
				apparentReclaimableBytes: item.apparentReclaimableBytes,
				truePhysicalReclaimableBytes: item.truePhysicalReclaimableBytes,
				phantomDeltaBytes: item.phantomDeltaBytes,
				safeReclaimCount: item.safeReclaimCount,
				survivorPath: item.survivor?.displayPath || '',
				copies: item.copies.map(copy => ({
					path: copy.displayPath,
					deviceKey: copy.deviceKey,
					inodeNumber: copy.inodeNumber,
					nlink: copy.nlink,
					fsType: copy.fsType,
					isEncrypted: copy.isEncrypted,
					isSparse: copy.isSparse,
					logicalBytes: copy.logicalBytes,
					allocatedBytes: copy.allocatedBytes,
					copyVerdict: copy.copyVerdict,
					canSafeReclaim: copy.canSafeReclaim,
					copyReason: copy.copyReason,
				})),
			}))
			: [],
	}
	return JSON.stringify(payload, null, 2)
}

/**
 * Export CWE-1236-safe CSV ledger of inode topology and true physical savings.
 *
 * @param {object} report Output of analyzeInodeSafety.
 * @return {string} RFC-4180 CSV content with formula-injection neutralization.
 */
export function buildInodeSafetyCsv(report) {
	const headers = [
		'Group Key',
		'Title',
		'Group Verdict',
		'Copy Path',
		'Device Key',
		'Inode',
		'nlink',
		'Filesystem',
		'Topology Provenance',
		'Encrypted',
		'Sparse',
		'Logical Bytes',
		'Allocated Bytes',
		'Copy Verdict',
		'Safe To Reclaim',
		'Group True Physical Reclaim Bytes',
		'Group Phantom Delta Bytes',
		'Reason',
	]

	const rows = [headers.map(escapeCsvCell).join(',')]
	const items = Array.isArray(report?.items) ? report.items : []

	items.forEach((item) => {
		item.copies.forEach((copy) => {
			rows.push([
				item.groupKey,
				item.title,
				item.primaryVerdict,
				copy.displayPath,
				copy.deviceKey,
				copy.inodeNumber ?? 'unknown',
				copy.nlink,
				copy.fsType,
				copy.topologyProvenance,
				copy.isEncrypted ? 'yes' : 'no',
				copy.isSparse ? 'yes' : 'no',
				copy.logicalBytes,
				copy.allocatedBytes,
				copy.copyVerdict,
				copy.canSafeReclaim ? 'yes' : 'no',
				item.truePhysicalReclaimableBytes,
				item.phantomDeltaBytes,
				copy.copyReason,
			].map(escapeCsvCell).join(','))
		})
	})

	return `${rows.join('\n')}\n`
}
