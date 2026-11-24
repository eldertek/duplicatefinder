/**
 * Pure VM Disk, Database Dump & Heavy Container Image CoW Reflink Auditor.
 * Classifies hypervisor disk images (qcow2, vmdk, vdi, vhdx, ova, iso),
 * database files & cold dumps (sqlite, db, sql, dump, bak), and heavy container
 * rootfs/image archives (oci, sif, squashfs, tar.gz, tar.zst); separates live
 * hypervisor/WAL-locked databases from static cold snapshots; evaluates Btrfs/XFS
 * cp --reflink=always --sparse=always, Apple APFS cp -c, OpenZFS block-cloning,
 * immutable read-only hardlinks, and full cold purge savings; and generates
 * DRY_RUN=1 POSIX shell scripts, CWE-1236-safe CSV reports, and JSON manifests.
 * Zero DOM dependencies, zero XSS sinks, zero network side effects.
 */

import { normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { formatBytes } from './duplicateStats'

export const VM_COW_SCHEMA = 'duplicatefinder.vm-cow-reflink-audit.v1'

export const VM_COW_FAMILIES = Object.freeze([
	'all',
	'vm-disk',
	'database-file',
	'database-dump',
	'container-image',
])

export const VM_COW_STRATEGIES = Object.freeze([
	'cow-reflink',
	'full-dedup',
])

export const VM_COW_SURVIVOR_RULES = Object.freeze([
	'cold-golden-first',
	'active-primary-first',
	'oldest-mtime',
	'newest-mtime',
	'shortest-path',
])

export const VM_COW_SAFETY_FILTERS = Object.freeze([
	'all',
	'cow-eligible',
	'cold-reclaimable',
	'active-locked',
	'backing-chain-risk',
	'nocow-sparse-trap',
])

export const VM_COW_SORT_MODES = Object.freeze([
	'cow_savings_desc',
	'raw_waste_desc',
	'risk_desc',
	'name_asc',
])

export const VM_COW_BACKENDS = Object.freeze({
	'btrfs-xfs': {
		id: 'btrfs-xfs',
		label: 'Btrfs / XFS (cp --reflink=always --sparse=always)',
		shortLabel: 'Btrfs/XFS Reflink',
		command: 'cp --reflink=always --sparse=always',
		supportsCowReflink: true,
		supportsMutableClone: true,
		metadataOverheadRate: 0.0015,
		sparseSafe: true,
		notes: 'Creates independent CoW extent clones; preserves sparse holes and fails safely if NOCOW (chattr +C) or EXDEV boundary is hit.',
	},
	apfs: {
		id: 'apfs',
		label: 'Apple APFS (cp -c)',
		shortLabel: 'APFS Clone',
		command: 'cp -c',
		supportsCowReflink: true,
		supportsMutableClone: true,
		metadataOverheadRate: 0.001,
		sparseSafe: true,
		notes: 'Creates zero-block APFS CoW clones while preserving independent per-VM writes.',
	},
	'zfs-clone': {
		id: 'zfs-clone',
		label: 'OpenZFS Block-Clone (cp --reflink=auto / zfs clone)',
		shortLabel: 'ZFS Block-Clone',
		command: 'cp --reflink=auto --sparse=always',
		supportsCowReflink: true,
		supportsMutableClone: true,
		metadataOverheadRate: 0.0025,
		sparseSafe: true,
		notes: 'Uses OpenZFS 2.2+ BRT block cloning or dataset clone semantics without DDT RAM explosion.',
	},
	'hardlink-readonly': {
		id: 'hardlink-readonly',
		label: 'POSIX Read-Only Hardlink (ln -f, immutable ISOs/dumps only)',
		shortLabel: 'Read-Only Hardlink',
		command: 'ln -f',
		supportsCowReflink: false,
		supportsMutableClone: false,
		metadataOverheadRate: 0.0002,
		sparseSafe: true,
		notes: 'Blocks mutable VM disks and SQLite DBs from hardlinking to prevent cross-VM corruption; applies only to immutable ISOs and compressed dumps.',
	},
	'full-dedup-purge': {
		id: 'full-dedup-purge',
		label: 'Full Cold Snapshot Quarantine / Purge',
		shortLabel: 'Cold Purge',
		command: 'mv / rm',
		supportsCowReflink: false,
		supportsMutableClone: false,
		metadataOverheadRate: 0,
		sparseSafe: true,
		notes: 'Quarantines or deletes redundant cold snapshots and dumps while strictly blocking active/WAL-locked and backing-chain files.',
	},
})

export const VM_COW_PRESETS = Object.freeze([
	{
		id: 'cow-reflink-safe',
		name: 'CoW Reflink Preservation (Btrfs/XFS)',
		description: 'Keep all VM, DB dump, and container paths intact via cp --reflink=always --sparse=always while blocking active locks and backing-chain risks.',
		strategy: 'cow-reflink',
		backendId: 'btrfs-xfs',
		survivorRule: 'cold-golden-first',
		protectActiveLocks: true,
		protectBackingChains: true,
		minSizeBytes: 1024 * 1024,
	},
	{
		id: 'zfs-apfs-clone',
		name: 'OpenZFS / APFS Instant Clone',
		description: 'Model OpenZFS block-cloning and APFS CoW extent sharing across golden templates and container layers.',
		strategy: 'cow-reflink',
		backendId: 'zfs-clone',
		survivorRule: 'active-primary-first',
		protectActiveLocks: true,
		protectBackingChains: true,
		minSizeBytes: 1024 * 1024,
	},
	{
		id: 'cold-dump-purge',
		name: 'Cold Snapshot & Dump Reclaim',
		description: 'Stage redundant static ISOs, cold SQL dumps, and offline OVAs for quarantine/removal while shielding live hypervisors and WAL-locked DBs.',
		strategy: 'full-dedup',
		backendId: 'full-dedup-purge',
		survivorRule: 'oldest-mtime',
		protectActiveLocks: true,
		protectBackingChains: true,
		minSizeBytes: 1024 * 1024,
	},
])

const MULTI_PART_EXTENSIONS = Object.freeze([
	'.sql.gz',
	'.sql.zst',
	'.sql.bz2',
	'.sql.xz',
	'.tar.gz',
	'.tar.zst',
	'.tar.bz2',
	'.tar.xz',
	'.qcow2.gz',
	'.vmdk.gz',
])

const VM_DISK_EXTENSIONS = new Set([
	'qcow2',
	'qcow',
	'vmdk',
	'vdi',
	'vhd',
	'vhdx',
	'raw',
	'img',
	'ova',
	'ovf',
	'qed',
	'hdd',
	'iso',
])

const THIN_SPARSE_DISK_EXTENSIONS = new Set([
	'qcow2',
	'qcow',
	'vmdk',
	'vdi',
	'vhd',
	'vhdx',
	'raw',
	'img',
	'qed',
])

const MUTABLE_VM_EXTENSIONS = new Set([
	'qcow2',
	'qcow',
	'vmdk',
	'vdi',
	'vhd',
	'vhdx',
	'raw',
	'img',
	'qed',
	'hdd',
])

const DATABASE_FILE_EXTENSIONS = new Set([
	'sqlite',
	'sqlite3',
	'db',
	'db3',
	'mdb',
	'accdb',
	'ibd',
	'frm',
	'myd',
	'myi',
	'fdb',
	'gdb',
	'rdb',
])

const DATABASE_DUMP_EXTENSIONS = new Set([
	'sql',
	'dump',
	'dmp',
	'bak',
	'dacpac',
	'bacpac',
	'pgdump',
	'mysqldump',
	'sql.gz',
	'sql.zst',
	'sql.bz2',
	'sql.xz',
])

const CONTAINER_ONLY_EXTENSIONS = new Set([
	'oci',
	'sif',
	'squashfs',
	'sqsh',
	'wim',
	'esd',
])

const CONTAINER_TAR_EXTENSIONS = new Set([
	'tar',
	'tgz',
	'tar.gz',
	'tar.zst',
	'tar.bz2',
	'tar.xz',
])

const CONTAINER_PATH_SIGNATURES = [
	'/containers/',
	'/container-images/',
	'/docker/',
	'/podman/',
	'/oci/',
	'/registry/',
	'/rootfs/',
	'/images/',
	'/singularity/',
	'/apptainer/',
	'/vms/',
	'/libvirt/',
	'/templates/',
]

const CONTAINER_NAME_SIGNATURES = [
	'rootfs',
	'layer',
	'docker',
	'podman',
	'container',
	'oci',
	'alpine',
	'ubuntu',
	'debian',
	'postgres',
	'mariadb',
	'nextcloud',
	'redis',
	'nginx',
	'image',
]

const ACTIVE_PATH_SIGNATURES = [
	'/var/lib/libvirt/',
	'/var/lib/vz/',
	'/proxmox/',
	'/esxi/',
	'/vmware/',
	'/virtualbox/',
	'/vm-disks/',
	'/docker/overlay2/',
	'/var/lib/containers/',
	'/var/lib/postgresql/',
	'/var/lib/mysql/',
	'/appdata_',
	'/live-vms/',
	'/running/',
]

const COLD_PATH_SIGNATURES = [
	'/backups/',
	'/backup/',
	'/archive/',
	'/archives/',
	'/cold/',
	'/golden/',
	'/templates/',
	'/template/',
	'/dumps/',
	'/exports/',
	'/iso/',
	'/isos/',
	'/releases/',
	'/staging/',
	'/snapshots/',
]

const RISK_ORDER = Object.freeze({
	'active-locked': 0,
	'backing-chain-risk': 1,
	'nocow-sparse-trap': 2,
	'cow-eligible': 3,
	'cold-reclaimable': 4,
})

/**
 * Retrieve a VM/CoW preset by ID with fallback to the default safe preset.
 *
 * @param {string} presetId - Preset identifier.
 * @return {object} Matching preset definition.
 */
export function getVmCowPreset(presetId) {
	return VM_COW_PRESETS.find(item => item.id === presetId) || VM_COW_PRESETS[0]
}

/**
 * Retrieve a CoW backend profile by ID with fallback to Btrfs/XFS.
 *
 * @param {string} backendId - Backend identifier.
 * @return {object} Backend capability descriptor.
 */
export function getVmCowBackend(backendId) {
	return VM_COW_BACKENDS[backendId] || VM_COW_BACKENDS['btrfs-xfs']
}

/**
 * Escape an arbitrary value for single-quoted POSIX shell inclusion.
 *
 * @param {*} value - Raw value.
 * @return {string} POSIX single-quoted string.
 */
export function escapePosixSingleQuote(value) {
	const raw = value === null || value === undefined ? '' : String(value)
	return `'${raw.replace(/'/g, "'\\''")}'`
}

/**
 * Extract normalized extension (preserving multi-part dump/container suffixes).
 *
 * @param {string} filename - File basename.
 * @return {string} Lowercase extension without leading dot, or empty string.
 */
export function extractVmCowExtension(filename) {
	const name = typeof filename === 'string' ? filename.trim() : ''
	if (!name) {
		return ''
	}
	const lower = name.toLowerCase()
	for (const suffix of MULTI_PART_EXTENSIONS) {
		if (lower.endsWith(suffix) && lower.length > suffix.length) {
			return suffix.slice(1)
		}
	}
	const dotIdx = lower.lastIndexOf('.')
	if (dotIdx <= 0 || dotIdx === lower.length - 1) {
		return ''
	}
	return lower.slice(dotIdx + 1)
}

/**
 * Parse numeric file size safely.
 *
 * @param {*} value - Raw size value.
 * @return {number} Non-negative integer byte count.
 */
function toSafeBytes(value) {
	const num = Number(value)
	return Number.isFinite(num) && num >= 0 ? Math.floor(num) : 0
}

/**
 * Parse numeric timestamp safely.
 *
 * @param {object} file - File descriptor.
 * @return {number|null} Timestamp in milliseconds/seconds or null.
 */
function getFileTimestamp(file) {
	if (!file || typeof file !== 'object') {
		return null
	}
	for (const key of ['mtime', 'modified', 'updatedAt', 'lastModified']) {
		const raw = file[key]
		if (raw === null || raw === undefined || raw === '') {
			continue
		}
		if (typeof raw === 'number' && Number.isFinite(raw)) {
			return raw
		}
		if (typeof raw === 'string') {
			const trimmed = raw.trim()
			if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
				const parsedNum = Number(trimmed)
				if (Number.isFinite(parsedNum)) {
					return parsedNum
				}
			}
			const parsedDate = Date.parse(trimmed)
			if (Number.isFinite(parsedDate)) {
				return parsedDate
			}
		}
	}
	return null
}

/**
 * Determine whether a file belongs to VM disks, databases, DB dumps, or heavy container images,
 * and classify its operational safety posture (active/locked, backing-chain, sparse/NOCOW, cold).
 *
 * @param {object} file - Duplicate file entry.
 * @param {Set<string>} [allNormalizedPaths] - Optional set of all paths in dataset for WAL/lock companion detection.
 * @return {object|null} Artifact descriptor or null when file is outside VM/DB/container scope.
 */
export function classifyVmCowArtifact(file, allNormalizedPaths = null) {
	if (!file || typeof file !== 'object') {
		return null
	}
	const rawPath = typeof file.path === 'string' ? file.path : ''
	const normalizedPath = normalizePathForDiff(rawPath)
	if (!normalizedPath) {
		return null
	}
	const slashIdx = normalizedPath.lastIndexOf('/')
	const dirPath = slashIdx > 0 ? normalizedPath.slice(0, slashIdx) : '/'
	const basename = slashIdx >= 0 ? normalizedPath.slice(slashIdx + 1) : normalizedPath
	const lowerPath = normalizedPath.toLowerCase()
	const lowerName = basename.toLowerCase()
	const ext = extractVmCowExtension(basename)
	const sizeBytes = toSafeBytes(file.size)

	let family = null
	if (VM_DISK_EXTENSIONS.has(ext)) {
		family = 'vm-disk'
	} else if (DATABASE_FILE_EXTENSIONS.has(ext)) {
		family = 'database-file'
	} else if (DATABASE_DUMP_EXTENSIONS.has(ext)) {
		family = 'database-dump'
	} else if (CONTAINER_ONLY_EXTENSIONS.has(ext)) {
		family = 'container-image'
	} else if (CONTAINER_TAR_EXTENSIONS.has(ext)) {
		const hasContainerPath = CONTAINER_PATH_SIGNATURES.some(sig => lowerPath.includes(sig))
		const hasContainerName = CONTAINER_NAME_SIGNATURES.some(sig => lowerName.includes(sig))
		if (hasContainerPath || hasContainerName || sizeBytes >= 50 * 1024 * 1024) {
			family = 'container-image'
		}
	} else if (
		lowerName.endsWith('-wal')
		|| lowerName.endsWith('-shm')
		|| lowerName.endsWith('-journal')
	) {
		family = 'database-file'
	}

	if (!family) {
		return null
	}

	const walOrLockCompanions = []
	if (allNormalizedPaths instanceof Set) {
		const candidates = [
			`${normalizedPath}-wal`,
			`${normalizedPath}-shm`,
			`${normalizedPath}-journal`,
			`${normalizedPath}.lck`,
			`${normalizedPath}.lock`,
			`${normalizedPath}.pid`,
		]
		for (const candidate of candidates) {
			if (allNormalizedPaths.has(candidate)) {
				walOrLockCompanions.push(candidate)
			}
		}
	}

	const isExplicitLocked = Boolean(
		file.locked === true
		|| file.isOpen === true
		|| file.activeVm === true
		|| file.inUse === true
		|| file.hasWalCompanion === true
	)
	const isWalFileItself = (
		lowerName.endsWith('-wal')
		|| lowerName.endsWith('-shm')
		|| lowerName.endsWith('-journal')
		|| lowerName.endsWith('.lck')
		|| lowerName.endsWith('.lock')
		|| lowerName.endsWith('.pid')
	)
	const hasActivePathCue = ACTIVE_PATH_SIGNATURES.some(sig => lowerPath.includes(sig))
	const hasActiveNameCue = (
		lowerName.includes('-flat.vmdk')
		|| lowerName.includes('-delta.vmdk')
		|| lowerName.includes('-sesparse.vmdk')
		|| lowerName.startsWith('live-')
		|| lowerName.startsWith('running-')
		|| lowerName.includes('.lck')
	)
	const isActiveLocked = isExplicitLocked || isWalFileItself || walOrLockCompanions.length > 0 || hasActivePathCue || hasActiveNameCue

	const hasBackingChainRisk = Boolean(
		file.hasBackingFile === true
		|| (
			family === 'vm-disk'
			&& (
				lowerName.includes('snapshot')
				|| lowerName.includes('-delta')
				|| lowerName.includes('-diff')
				|| lowerName.includes('backing')
				|| lowerName.includes('linked-')
				|| lowerName.includes('base-')
				|| lowerName.includes('overlay')
			)
		)
	)

	const virtualSizeBytes = toSafeBytes(file.virtualSize ?? file.apparentSize ?? sizeBytes)
	const allocatedSizeBytes = toSafeBytes(file.allocatedSize ?? file.diskUsage ?? sizeBytes)
	const isSparseImage = THIN_SPARSE_DISK_EXTENSIONS.has(ext)
		|| (virtualSizeBytes > allocatedSizeBytes && allocatedSizeBytes > 0)
	const hasNocowFlag = Boolean(
		file.nocow === true
		|| lowerPath.includes('nocow')
		|| lowerPath.includes('/chattr-c/')
	)
	const hasSparseNocowTrap = hasNocowFlag || (isSparseImage && virtualSizeBytes > sizeBytes * 1.1)

	const isColdCue = COLD_PATH_SIGNATURES.some(sig => lowerPath.includes(sig))
		|| lowerName.includes('golden')
		|| lowerName.includes('template')
		|| lowerName.includes('backup')
		|| lowerName.includes('dump')
		|| ext === 'iso'
		|| ext === 'ova'

	const isMutableArtifact = MUTABLE_VM_EXTENSIONS.has(ext) || family === 'database-file'

	let safetyState = 'cow-eligible'
	if (isActiveLocked) {
		safetyState = 'active-locked'
	} else if (hasBackingChainRisk) {
		safetyState = 'backing-chain-risk'
	} else if (hasSparseNocowTrap) {
		safetyState = 'nocow-sparse-trap'
	} else if (isColdCue) {
		safetyState = 'cold-reclaimable'
	}

	return {
		selectionKey: getFileSelectionKey(file) ?? normalizedPath,
		fileId: file.id ?? null,
		rawPath,
		normalizedPath,
		dirPath,
		basename,
		extension: ext,
		family,
		sizeBytes,
		virtualSizeBytes,
		allocatedSizeBytes,
		mtime: getFileTimestamp(file),
		origin: Boolean(file.origin || file.isInOriginFolder),
		isActiveLocked,
		hasBackingChainRisk,
		isSparseImage,
		hasNocowFlag,
		hasSparseNocowTrap,
		isColdCue,
		isMutableArtifact,
		walOrLockCompanions,
		safetyState,
	}
}

/**
 * Choose the survivor anchor file for a duplicate group according to the configured rule.
 *
 * @param {Array<object>} artifacts - Classified file artifacts in the group.
 * @param {string} survivorRule - Survivor election rule.
 * @return {object} Selected survivor artifact.
 */
function electSurvivorArtifact(artifacts, survivorRule) {
	const sorted = [...artifacts].sort((a, b) => {
		if (survivorRule === 'active-primary-first') {
			if (a.isActiveLocked !== b.isActiveLocked) {
				return a.isActiveLocked ? -1 : 1
			}
			if (a.origin !== b.origin) {
				return a.origin ? -1 : 1
			}
		} else if (survivorRule === 'cold-golden-first') {
			const aGolden = (a.origin ? 4 : 0) + (a.isColdCue ? 2 : 0) + (!a.hasBackingChainRisk ? 1 : 0) + (!a.hasNocowFlag ? 1 : 0)
			const bGolden = (b.origin ? 4 : 0) + (b.isColdCue ? 2 : 0) + (!b.hasBackingChainRisk ? 1 : 0) + (!b.hasNocowFlag ? 1 : 0)
			if (aGolden !== bGolden) {
				return bGolden - aGolden
			}
		} else if (survivorRule === 'oldest-mtime') {
			const aTime = a.mtime ?? Number.POSITIVE_INFINITY
			const bTime = b.mtime ?? Number.POSITIVE_INFINITY
			if (aTime !== bTime) {
				return aTime - bTime
			}
		} else if (survivorRule === 'newest-mtime') {
			const aTime = a.mtime ?? Number.NEGATIVE_INFINITY
			const bTime = b.mtime ?? Number.NEGATIVE_INFINITY
			if (aTime !== bTime) {
				return bTime - aTime
			}
		}

		if (a.origin !== b.origin) {
			return a.origin ? -1 : 1
		}
		if (a.normalizedPath.length !== b.normalizedPath.length) {
			return a.normalizedPath.length - b.normalizedPath.length
		}
		return a.normalizedPath.localeCompare(b.normalizedPath)
	})
	return sorted[0]
}

/**
 * Evaluate each non-survivor member's CoW reflink and cold deduplication actionability.
 *
 * @param {object} member - Classified non-survivor artifact.
 * @param {object} context - Evaluation policy context.
 * @return {object} Annotated member record with action verdict and byte savings.
 */
function evaluateMemberAction(member, context) {
	const {
		backend,
		effectiveStrategy,
		protectActiveLocks,
		protectBackingChains,
		groupOverride,
	} = context

	if (groupOverride === 'protect') {
		return {
			...member,
			role: 'copy',
			verdict: 'protected-override',
			verdictReason: 'Group manually locked by administrator override.',
			cowSavingsBytes: 0,
			cowOverheadBytes: 0,
			fullDedupSavingsBytes: 0,
			activeSavingsBytes: 0,
			sparseInflationRiskBytes: 0,
		}
	}

	if (member.isActiveLocked && protectActiveLocks) {
		return {
			...member,
			role: 'copy',
			verdict: 'blocked-active-lock',
			verdictReason: member.walOrLockCompanions.length > 0
				? `Active DB/VM lock companion detected (${member.walOrLockCompanions[0]}).`
				: 'Active hypervisor runtime, live container overlay, or locked database path.',
			cowSavingsBytes: 0,
			cowOverheadBytes: 0,
			fullDedupSavingsBytes: 0,
			activeSavingsBytes: 0,
			sparseInflationRiskBytes: 0,
		}
	}

	if (member.hasBackingChainRisk && protectBackingChains) {
		return {
			...member,
			role: 'copy',
			verdict: 'blocked-backing-chain',
			verdictReason: 'QCOW2/VMDK snapshot or backing-chain delta risk; verify qemu-img info before altering.',
			cowSavingsBytes: 0,
			cowOverheadBytes: 0,
			fullDedupSavingsBytes: 0,
			activeSavingsBytes: 0,
			sparseInflationRiskBytes: 0,
		}
	}

	const sparseRiskBytes = member.isSparseImage
		? Math.max(0, member.virtualSizeBytes - member.sizeBytes) || Math.round(member.sizeBytes * 0.25)
		: 0

	if (member.hasNocowFlag && backend.supportsCowReflink) {
		const coldFull = effectiveStrategy === 'full-dedup' && !member.origin ? member.sizeBytes : 0
		return {
			...member,
			role: 'copy',
			verdict: coldFull > 0 ? 'cold-purge-only' : 'blocked-nocow',
			verdictReason: 'Btrfs NOCOW (chattr +C) disables cp --reflink=always (EINVAL); only cold removal or NOCOW strip is possible.',
			cowSavingsBytes: 0,
			cowOverheadBytes: 0,
			fullDedupSavingsBytes: coldFull,
			activeSavingsBytes: coldFull,
			sparseInflationRiskBytes: sparseRiskBytes,
		}
	}

	if (backend.id === 'hardlink-readonly' && member.isMutableArtifact) {
		return {
			...member,
			role: 'copy',
			verdict: 'blocked-mutable-hardlink',
			verdictReason: 'Hardlinking mutable VM disks or live SQLite DBs causes silent cross-copy corruption; use CoW reflink instead.',
			cowSavingsBytes: 0,
			cowOverheadBytes: 0,
			fullDedupSavingsBytes: 0,
			activeSavingsBytes: 0,
			sparseInflationRiskBytes: 0,
		}
	}

	const overheadBytes = backend.supportsCowReflink
		? Math.round(member.sizeBytes * backend.metadataOverheadRate)
		: 0
	const cowSavingsBytes = backend.supportsCowReflink || backend.id === 'hardlink-readonly'
		? Math.max(0, member.sizeBytes - overheadBytes)
		: 0
	const fullDedupSavingsBytes = member.origin ? 0 : member.sizeBytes

	let verdict = 'cow-reflink-ready'
	let verdictReason = `Eligible for ${backend.shortLabel} (${backend.command}) with independent CoW write divergence.`
	if (effectiveStrategy === 'full-dedup') {
		verdict = member.origin ? 'protected-origin' : 'cold-purge-ready'
		verdictReason = member.origin
			? 'Protected origin folder copy; excluded from cold deletion.'
			: 'Verified cold snapshot/dump copy eligible for quarantine or removal.'
	} else if (backend.id === 'hardlink-readonly') {
		verdict = 'hardlink-immutable-ready'
		verdictReason = 'Immutable cold ISO/archive eligible for read-only hardlink.'
	}

	const activeSavingsBytes = effectiveStrategy === 'full-dedup'
		? fullDedupSavingsBytes
		: cowSavingsBytes

	return {
		...member,
		role: 'copy',
		verdict,
		verdictReason,
		cowSavingsBytes,
		cowOverheadBytes: overheadBytes,
		fullDedupSavingsBytes,
		activeSavingsBytes,
		sparseInflationRiskBytes: sparseRiskBytes,
	}
}

/**
 * Analyze duplicate groups for VM disks, database files/dumps, and heavy container images,
 * computing CoW reflink vs full deduplication economics and active-lock protections.
 *
 * @param {Array<object>} duplicates - Duplicate groups from Nextcloud DuplicateFinder.
 * @param {object} [options] - Analyzer configuration.
 * @return {object} Deterministic audit structure.
 */
export function analyzeVmCowReflink(duplicates, options = {}) {
	const list = Array.isArray(duplicates) ? duplicates : []
	const backend = getVmCowBackend(options.backendId)
	const strategy = VM_COW_STRATEGIES.includes(options.strategy)
		? options.strategy
		: (backend.id === 'full-dedup-purge' ? 'full-dedup' : 'cow-reflink')
	const survivorRule = VM_COW_SURVIVOR_RULES.includes(options.survivorRule)
		? options.survivorRule
		: 'cold-golden-first'
	const familyFilter = VM_COW_FAMILIES.includes(options.familyFilter)
		? options.familyFilter
		: 'all'
	const safetyFilter = VM_COW_SAFETY_FILTERS.includes(options.safetyFilter)
		? options.safetyFilter
		: 'all'
	const sortMode = VM_COW_SORT_MODES.includes(options.sortMode)
		? options.sortMode
		: 'cow_savings_desc'
	const protectActiveLocks = options.protectActiveLocks !== false
	const protectBackingChains = options.protectBackingChains !== false
	const minSizeBytes = Number.isFinite(Number(options.minSizeBytes)) && Number(options.minSizeBytes) >= 0
		? Math.floor(Number(options.minSizeBytes))
		: 0
	const searchQuery = typeof options.searchQuery === 'string'
		? options.searchQuery.trim().toLowerCase()
		: ''
	const groupOverrides = options.groupOverrides && typeof options.groupOverrides === 'object'
		? options.groupOverrides
		: {}

	const allNormalizedPaths = new Set()
	for (const group of list) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (const file of group.files) {
			if (file && typeof file.path === 'string') {
				const norm = normalizePathForDiff(file.path)
				if (norm) {
					allNormalizedPaths.add(norm)
				}
			}
		}
	}

	const familyStats = {
		'vm-disk': { count: 0, rawDuplicateBytes: 0, cowSavingsBytes: 0 },
		'database-file': { count: 0, rawDuplicateBytes: 0, cowSavingsBytes: 0 },
		'database-dump': { count: 0, rawDuplicateBytes: 0, cowSavingsBytes: 0 },
		'container-image': { count: 0, rawDuplicateBytes: 0, cowSavingsBytes: 0 },
	}

	const allAuditedGroups = []
	let totalRawDuplicateBytes = 0
	let totalCowSavingsBytes = 0
	let totalCowOverheadBytes = 0
	let totalFullDedupSavingsBytes = 0
	let totalActiveStrategySavingsBytes = 0
	let totalProtectedActiveBytes = 0
	let totalSparseInflationRiskBytes = 0
	let totalActiveLockedFiles = 0
	let totalBackingChainFiles = 0
	let totalSparseNocowFiles = 0
	let totalCowEligibleCopies = 0

	for (let idx = 0; idx < list.length; idx++) {
		const group = list[idx]
		if (!group || !Array.isArray(group.files) || group.files.length < 2) {
			continue
		}

		const classified = []
		for (const file of group.files) {
			const artifact = classifyVmCowArtifact(file, allNormalizedPaths)
			if (artifact) {
				classified.push(artifact)
			}
		}

		if (classified.length < 2) {
			continue
		}

		const maxFileSize = classified.reduce((max, item) => Math.max(max, item.sizeBytes), 0)
		if (maxFileSize < minSizeBytes) {
			continue
		}

		const groupKey = String(group.id ?? group.hash ?? `vm-group-${idx}`)
		const groupOverride = typeof groupOverrides[groupKey] === 'string'
			? groupOverrides[groupKey]
			: ''
		const effectiveStrategy = (groupOverride === 'cow-reflink' || groupOverride === 'full-dedup')
			? groupOverride
			: strategy
		const effectiveBackend = effectiveStrategy === 'full-dedup' && !backend.supportsCowReflink
			? backend
			: (effectiveStrategy === 'full-dedup' ? VM_COW_BACKENDS['full-dedup-purge'] : backend)

		const survivor = electSurvivorArtifact(classified, survivorRule)
		const copies = classified.filter(item => item !== survivor)

		const evaluatedCopies = copies.map(copy => evaluateMemberAction(copy, {
			backend: effectiveBackend,
			effectiveStrategy,
			protectActiveLocks,
			protectBackingChains,
			groupOverride,
		}))

		const rawDuplicateBytes = evaluatedCopies.reduce((sum, item) => sum + item.sizeBytes, 0)
		const cowSavingsBytes = evaluatedCopies.reduce((sum, item) => sum + item.cowSavingsBytes, 0)
		const cowOverheadBytes = evaluatedCopies.reduce((sum, item) => sum + item.cowOverheadBytes, 0)
		const fullDedupSavingsBytes = evaluatedCopies.reduce((sum, item) => sum + item.fullDedupSavingsBytes, 0)
		const activeStrategySavingsBytes = evaluatedCopies.reduce((sum, item) => sum + item.activeSavingsBytes, 0)
		const sparseInflationRiskBytes = evaluatedCopies.reduce((sum, item) => sum + item.sparseInflationRiskBytes, 0)

		const allMembers = [{
			...survivor,
			role: 'survivor',
			verdict: 'golden-survivor',
			verdictReason: 'Elected golden anchor / primary copy; preserved untouched.',
			cowSavingsBytes: 0,
			cowOverheadBytes: 0,
			fullDedupSavingsBytes: 0,
			activeSavingsBytes: 0,
			sparseInflationRiskBytes: 0,
		}, ...evaluatedCopies]

		const activeLockedCount = allMembers.filter(m => m.isActiveLocked).length
		const backingChainCount = allMembers.filter(m => m.hasBackingChainRisk).length
		const sparseNocowCount = allMembers.filter(m => m.hasSparseNocowTrap).length
		const cowReadyCount = evaluatedCopies.filter(m => m.cowSavingsBytes > 0).length
		const coldPurgeReadyCount = evaluatedCopies.filter(m => m.fullDedupSavingsBytes > 0).length
		const protectedBytes = evaluatedCopies
			.filter(m => m.verdict === 'blocked-active-lock' || m.verdict === 'blocked-backing-chain' || m.verdict === 'protected-override')
			.reduce((sum, m) => sum + m.sizeBytes, 0)

		let groupRiskState = 'cow-eligible'
		if (activeLockedCount > 0) {
			groupRiskState = 'active-locked'
		} else if (backingChainCount > 0) {
			groupRiskState = 'backing-chain-risk'
		} else if (sparseNocowCount > 0) {
			groupRiskState = 'nocow-sparse-trap'
		} else if (coldPurgeReadyCount > 0 && effectiveStrategy === 'full-dedup') {
			groupRiskState = 'cold-reclaimable'
		}

		const primaryFamily = survivor.family
		if (familyStats[primaryFamily]) {
			familyStats[primaryFamily].count += 1
			familyStats[primaryFamily].rawDuplicateBytes += rawDuplicateBytes
			familyStats[primaryFamily].cowSavingsBytes += cowSavingsBytes
		}

		totalRawDuplicateBytes += rawDuplicateBytes
		totalCowSavingsBytes += cowSavingsBytes
		totalCowOverheadBytes += cowOverheadBytes
		totalFullDedupSavingsBytes += fullDedupSavingsBytes
		totalActiveStrategySavingsBytes += activeStrategySavingsBytes
		totalProtectedActiveBytes += protectedBytes
		totalSparseInflationRiskBytes += sparseInflationRiskBytes
		totalActiveLockedFiles += activeLockedCount
		totalBackingChainFiles += backingChainCount
		totalSparseNocowFiles += sparseNocowCount
		totalCowEligibleCopies += cowReadyCount

		allAuditedGroups.push({
			groupKey,
			primaryGroupId: group.id ?? null,
			hash: group.hash || '',
			acknowledged: Boolean(group.acknowledged),
			family: primaryFamily,
			extension: survivor.extension,
			displayName: survivor.basename,
			survivor,
			copies: evaluatedCopies,
			members: allMembers,
			copyCount: evaluatedCopies.length,
			totalCount: allMembers.length,
			rawDuplicateBytes,
			formattedRawDuplicateBytes: formatBytes(rawDuplicateBytes),
			cowSavingsBytes,
			formattedCowSavingsBytes: formatBytes(cowSavingsBytes),
			cowOverheadBytes,
			formattedCowOverheadBytes: formatBytes(cowOverheadBytes),
			fullDedupSavingsBytes,
			formattedFullDedupSavingsBytes: formatBytes(fullDedupSavingsBytes),
			activeStrategySavingsBytes,
			formattedActiveStrategySavingsBytes: formatBytes(activeStrategySavingsBytes),
			sparseInflationRiskBytes,
			formattedSparseInflationRiskBytes: formatBytes(sparseInflationRiskBytes),
			protectedBytes,
			formattedProtectedBytes: formatBytes(protectedBytes),
			activeLockedCount,
			backingChainCount,
			sparseNocowCount,
			cowReadyCount,
			coldPurgeReadyCount,
			groupRiskState,
			groupOverride,
			effectiveStrategy,
			effectiveBackendId: effectiveBackend.id,
		})
	}

	const filteredGroups = allAuditedGroups.filter(item => {
		if (familyFilter !== 'all' && item.family !== familyFilter) {
			return false
		}
		if (safetyFilter !== 'all') {
			if (safetyFilter === 'cow-eligible' && item.cowReadyCount === 0) {
				return false
			}
			if (safetyFilter === 'cold-reclaimable' && item.coldPurgeReadyCount === 0) {
				return false
			}
			if (safetyFilter === 'active-locked' && item.activeLockedCount === 0) {
				return false
			}
			if (safetyFilter === 'backing-chain-risk' && item.backingChainCount === 0) {
				return false
			}
			if (safetyFilter === 'nocow-sparse-trap' && item.sparseNocowCount === 0) {
				return false
			}
		}
		if (searchQuery) {
			const hay = [
				item.displayName,
				item.family,
				item.extension,
				item.hash,
				...item.members.map(m => m.normalizedPath),
			].join(' ').toLowerCase()
			if (!hay.includes(searchQuery)) {
				return false
			}
		}
		return true
	})

	filteredGroups.sort((a, b) => {
		if (sortMode === 'raw_waste_desc') {
			if (a.rawDuplicateBytes !== b.rawDuplicateBytes) {
				return b.rawDuplicateBytes - a.rawDuplicateBytes
			}
		} else if (sortMode === 'risk_desc') {
			const ra = RISK_ORDER[a.groupRiskState] ?? 9
			const rb = RISK_ORDER[b.groupRiskState] ?? 9
			if (ra !== rb) {
				return ra - rb
			}
		} else if (sortMode === 'name_asc') {
			const cmp = a.displayName.localeCompare(b.displayName)
			if (cmp !== 0) {
				return cmp
			}
		} else if (a.activeStrategySavingsBytes !== b.activeStrategySavingsBytes) {
			return b.activeStrategySavingsBytes - a.activeStrategySavingsBytes
		}
		return a.displayName.localeCompare(b.displayName)
	})

	const efficiencyPct = totalRawDuplicateBytes > 0
		? Math.round((totalActiveStrategySavingsBytes / totalRawDuplicateBytes) * 1000) / 10
		: 0

	return {
		schema: VM_COW_SCHEMA,
		backend,
		strategy,
		survivorRule,
		protectActiveLocks,
		protectBackingChains,
		minSizeBytes,
		groups: filteredGroups,
		allGroupsCount: allAuditedGroups.length,
		summary: {
			totalGroupsCount: allAuditedGroups.length,
			filteredGroupsCount: filteredGroups.length,
			cowEligibleCopiesCount: totalCowEligibleCopies,
			activeLockedFilesCount: totalActiveLockedFiles,
			backingChainFilesCount: totalBackingChainFiles,
			sparseNocowFilesCount: totalSparseNocowFiles,
			rawDuplicateBytes: totalRawDuplicateBytes,
			formattedRawDuplicateBytes: formatBytes(totalRawDuplicateBytes),
			cowReflinkNetSavingsBytes: totalCowSavingsBytes,
			formattedCowReflinkNetSavingsBytes: formatBytes(totalCowSavingsBytes),
			cowOverheadBytes: totalCowOverheadBytes,
			formattedCowOverheadBytes: formatBytes(totalCowOverheadBytes),
			fullDedupNetSavingsBytes: totalFullDedupSavingsBytes,
			formattedFullDedupNetSavingsBytes: formatBytes(totalFullDedupSavingsBytes),
			activeStrategySavingsBytes: totalActiveStrategySavingsBytes,
			formattedActiveStrategySavingsBytes: formatBytes(totalActiveStrategySavingsBytes),
			protectedActiveBytes: totalProtectedActiveBytes,
			formattedProtectedActiveBytes: formatBytes(totalProtectedActiveBytes),
			sparseInflationRiskBytes: totalSparseInflationRiskBytes,
			formattedSparseInflationRiskBytes: formatBytes(totalSparseInflationRiskBytes),
			efficiencyPct,
			familyStats,
		},
	}
}

/**
 * Build a POSIX DRY_RUN=1 CoW reflink / sparse-safe clone or cold purge script
 * with runtime lock checks, backing-chain warnings, and strict single-quote escaping.
 *
 * @param {object} analysis - Result of analyzeVmCowReflink.
 * @param {object} [options] - Script path options.
 * @return {string} POSIX bash script text.
 */
export function buildVmCowReflinkScript(analysis, options = {}) {
	const dataRoot = typeof options.dataRoot === 'string' && options.dataRoot.trim()
		? options.dataRoot.trim().replace(/\/+$/, '')
		: '/var/www/nextcloud/data'
	const quarantineDir = typeof options.quarantineDir === 'string' && options.quarantineDir.trim()
		? options.quarantineDir.trim().replace(/\/+$/, '')
		: '/var/backups/duplicatefinder-vm-quarantine'

	const backend = analysis && analysis.backend ? analysis.backend : VM_COW_BACKENDS['btrfs-xfs']
	const groups = analysis && Array.isArray(analysis.groups) ? analysis.groups : []
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'IFS=$\'\\n\\t\'',
		'',
		'# Nextcloud DuplicateFinder: VM Disk, DB Dump & Container Image CoW Reflink Plan',
		`# Backend: ${backend.label}`,
		`# Active Savings Estimate: ${analysis?.summary?.formattedActiveStrategySavingsBytes || '0 B'}`,
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'ALLOW_DELETE="$' + '{ALLOW_DELETE:-0}"',
		`DATA_ROOT=${escapePosixSingleQuote(dataRoot)}`,
		`QUARANTINE_DIR=${escapePosixSingleQuote(quarantineDir)}`,
		'',
		'resolve_path() {',
		'  local rel="$1"',
		'  rel="$' + '{rel#/}"',
		'  printf \'%s/%s\' "$DATA_ROOT" "$rel"',
		'}',
		'',
		'assert_unlocked() {',
		'  local target="$1"',
		'  if command -v lsof >/dev/null 2>&1 && lsof -- "$target" >/dev/null 2>&1; then',
		'    printf \'SKIP (open file handle): %s\\n\' "$target" >&2',
		'    return 1',
		'  fi',
		'  if command -v fuser >/dev/null 2>&1 && fuser -s -- "$target" >/dev/null 2>&1; then',
		'    printf \'SKIP (active process lock): %s\\n\' "$target" >&2',
		'    return 1',
		'  fi',
		'  return 0',
		'}',
		'',
	]

	let actionCount = 0
	for (const group of groups) {
		lines.push(`# === [${group.family.toUpperCase()}] ${group.displayName} (Raw waste: ${group.formattedRawDuplicateBytes}) ===`)
		lines.push(`SURVIVOR=$(resolve_path ${escapePosixSingleQuote(group.survivor.normalizedPath)})`)
		if (group.family === 'vm-disk' && (group.extension === 'qcow2' || group.extension === 'vmdk')) {
			lines.push('# Optional pre-flight: command -v qemu-img >/dev/null 2>&1 && qemu-img info -- "$SURVIVOR"')
		}

		for (const copy of group.copies) {
			const quotedRel = escapePosixSingleQuote(copy.normalizedPath)
			if (copy.verdict === 'blocked-active-lock') {
				lines.push(`# BLOCKED (ACTIVE_LOCK): ${quotedRel} -- ${copy.verdictReason}`)
				continue
			}
			if (copy.verdict === 'blocked-backing-chain') {
				lines.push(`# GUARDED (BACKING_CHAIN): ${quotedRel} -- ${copy.verdictReason}`)
				continue
			}
			if (copy.verdict === 'blocked-nocow' || copy.verdict === 'blocked-mutable-hardlink' || copy.verdict === 'protected-override' || copy.verdict === 'protected-origin') {
				lines.push(`# PROTECTED (${copy.verdict.toUpperCase()}): ${quotedRel} -- ${copy.verdictReason}`)
				continue
			}

			actionCount += 1
			lines.push(`TARGET=$(resolve_path ${quotedRel})`)
			lines.push('if [ -f "$SURVIVOR" ] && [ -f "$TARGET" ] && assert_unlocked "$TARGET"; then')
			if (copy.verdict === 'cold-purge-ready' || copy.verdict === 'cold-purge-only') {
				lines.push('  if [ "$DRY_RUN" = "1" ]; then')
				lines.push('    printf \'[DRY_RUN] quarantine/purge cold copy: %s\\n\' "$TARGET"')
				lines.push('  elif [ "$ALLOW_DELETE" = "1" ]; then')
				lines.push('    rm -f -- "$TARGET"')
				lines.push('  else')
				lines.push('    mkdir -p -- "$QUARANTINE_DIR"')
				lines.push('    mv -n -- "$TARGET" "$QUARANTINE_DIR/"')
				lines.push('  fi')
			} else if (copy.verdict === 'hardlink-immutable-ready') {
				lines.push('  if [ "$DRY_RUN" = "1" ]; then')
				lines.push('    printf \'[DRY_RUN] ln -f -- %s %s\\n\' "$SURVIVOR" "$TARGET"')
				lines.push('  else')
				lines.push('    ln -f -- "$SURVIVOR" "$TARGET"')
				lines.push('  fi')
			} else if (group.effectiveBackendId === 'apfs') {
				lines.push('  if [ "$DRY_RUN" = "1" ]; then')
				lines.push('    printf \'[DRY_RUN] cp -c -- %s %s\\n\' "$SURVIVOR" "$TARGET"')
				lines.push('  else')
				lines.push('    TMP_CLONE="$TARGET.apfs.clone.tmp"')
				lines.push('    cp -c -- "$SURVIVOR" "$TMP_CLONE" && mv -f -- "$TMP_CLONE" "$TARGET"')
				lines.push('  fi')
			} else if (group.effectiveBackendId === 'zfs-clone') {
				lines.push('  if [ "$DRY_RUN" = "1" ]; then')
				lines.push('    printf \'[DRY_RUN] cp --reflink=auto --sparse=always -- %s %s\\n\' "$SURVIVOR" "$TARGET"')
				lines.push('  else')
				lines.push('    TMP_CLONE="$TARGET.zfs.clone.tmp"')
				lines.push('    cp --reflink=auto --sparse=always -- "$SURVIVOR" "$TMP_CLONE" && mv -f -- "$TMP_CLONE" "$TARGET"')
				lines.push('  fi')
			} else {
				lines.push('  if [ "$DRY_RUN" = "1" ]; then')
				lines.push('    printf \'[DRY_RUN] cp --reflink=always --sparse=always -- %s %s\\n\' "$SURVIVOR" "$TARGET"')
				lines.push('  else')
				lines.push('    TMP_CLONE="$TARGET.reflink.tmp"')
				lines.push('    cp --reflink=always --sparse=always -- "$SURVIVOR" "$TMP_CLONE" && mv -f -- "$TMP_CLONE" "$TARGET"')
				lines.push('  fi')
			}
			lines.push('fi')
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('# No actionable CoW reflink or cold purge targets matched current policy/safety filters.')
	}

	return lines.join('\n')
}

/**
 * Build an RFC 4180 CRLF CSV report with CWE-1236 formula injection neutralization.
 *
 * @param {object} analysis - Result of analyzeVmCowReflink.
 * @return {string} Safe CSV payload.
 */
export function buildVmCowCsvReport(analysis) {
	const header = [
		'group_key',
		'family',
		'extension',
		'role',
		'verdict',
		'safety_state',
		'path',
		'size_bytes',
		'cow_savings_bytes',
		'full_dedup_savings_bytes',
		'sparse_inflation_risk_bytes',
		'verdict_reason',
	]
	const rows = [header.map(escapeCsvCell).join(',')]
	const groups = analysis && Array.isArray(analysis.groups) ? analysis.groups : []

	for (const group of groups) {
		for (const member of group.members) {
			const row = [
				group.groupKey,
				group.family,
				group.extension,
				member.role,
				member.verdict,
				member.safetyState,
				member.normalizedPath,
				member.sizeBytes,
				member.cowSavingsBytes,
				member.fullDedupSavingsBytes,
				member.sparseInflationRiskBytes,
				member.verdictReason,
			]
			rows.push(row.map(escapeCsvCell).join(','))
		}
	}

	return rows.join('\r\n')
}

/**
 * Build a structured JSON audit manifest for automation or compliance archiving.
 *
 * @param {object} analysis - Result of analyzeVmCowReflink.
 * @return {string} Pretty-printed JSON report.
 */
export function buildVmCowJsonReport(analysis) {
	const payload = {
		schema: VM_COW_SCHEMA,
		backend: analysis?.backend || null,
		strategy: analysis?.strategy || 'cow-reflink',
		survivorRule: analysis?.survivorRule || 'cold-golden-first',
		summary: analysis?.summary || {},
		groups: (analysis?.groups || []).map(group => ({
			groupKey: group.groupKey,
			primaryGroupId: group.primaryGroupId,
			hash: group.hash,
			family: group.family,
			extension: group.extension,
			displayName: group.displayName,
			groupRiskState: group.groupRiskState,
			effectiveStrategy: group.effectiveStrategy,
			rawDuplicateBytes: group.rawDuplicateBytes,
			cowSavingsBytes: group.cowSavingsBytes,
			fullDedupSavingsBytes: group.fullDedupSavingsBytes,
			survivorPath: group.survivor.normalizedPath,
			members: group.members.map(m => ({
				path: m.normalizedPath,
				role: m.role,
				verdict: m.verdict,
				safetyState: m.safetyState,
				sizeBytes: m.sizeBytes,
				cowSavingsBytes: m.cowSavingsBytes,
				fullDedupSavingsBytes: m.fullDedupSavingsBytes,
				isActiveLocked: m.isActiveLocked,
				hasBackingChainRisk: m.hasBackingChainRisk,
				hasSparseNocowTrap: m.hasSparseNocowTrap,
				verdictReason: m.verdictReason,
			})),
		})),
	}
	return JSON.stringify(payload, null, 2)
}
