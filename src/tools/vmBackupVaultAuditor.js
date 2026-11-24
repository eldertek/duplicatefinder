/**
 * Pure Virtualization, VM Disk Images & Container Backup Vault Auditor.
 * Classifies and audits duplicate clusters across 4 virtualization and backup families:
 * - VM Base & Production Disk Images (.vmdk, .qcow2, .vhdx, .vdi, .ova, .ovf)
 * - VM Snapshots, Delta Chains & Linked Clones (-000001.vmdk, -delta.vmdk, .vmsn, .vmsd, .sav, .avhdx, overlay/linked-clone)
 * - Docker / OCI Container Backup Exports (docker-save*.tar, docker-save*.tar.gz, .oci.tar, .oci.tar.gz)
 * - Redundant Installation ISOs & Raw Disk Images (.iso, .img)
 *
 * Detects base images vs orphan child snapshots and linked clones across the vault,
 * strictly conserves production VM images and parent base images of active snapshots by default,
 * and generates POSIX DRY_RUN=1 remediation scripts, CWE-1236-safe CSV audits, JSON manifests,
 * and .sync-exclude.lst rules.
 *
 * Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const VM_BACKUP_VAULT_SCHEMA = 'duplicatefinder.vm-backup-vault-auditor.v1'

export const VM_BACKUP_FAMILIES = Object.freeze([
	'all',
	'vm-base-disk-images',
	'vm-snapshots-linked-clones',
	'container-backup-exports',
	'redundant-installer-isos',
])

export const VM_BACKUP_FAMILY_META = Object.freeze({
	'vm-base-disk-images': {
		id: 'vm-base-disk-images',
		label: 'VM Base & Prod Disks',
		shortLabel: 'Disks (.vmdk, .qcow2, .vhdx, .vdi, .ova, .ovf)',
	},
	'vm-snapshots-linked-clones': {
		id: 'vm-snapshots-linked-clones',
		label: 'Snapshots & Linked Clones',
		shortLabel: 'Snapshots (-000001.vmdk, .vmsn, .sav, .avhdx, linked-clone)',
	},
	'container-backup-exports': {
		id: 'container-backup-exports',
		label: 'Docker / OCI Backups',
		shortLabel: 'Exports (docker-save .tar/.tar.gz, .oci.tar)',
	},
	'redundant-installer-isos': {
		id: 'redundant-installer-isos',
		label: 'Installer ISOs & Images',
		shortLabel: 'Installers (.iso, .img)',
	},
})

export const VM_BACKUP_STRATEGIES = Object.freeze([
	'prune-orphan-snapshots-keep-prod-bases',
	'consolidate-backup-vault-hardlinks',
	'quarantine-orphan-snapshots-only',
])

export const VM_BACKUP_SURVIVOR_RULES = Object.freeze([
	'production-and-parent-base-first',
	'newest-backup-first',
	'shortest-path',
])

export const VM_BACKUP_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'production-vm-image',
	'parent-base-image',
	'active-vm-snapshot',
	'orphan-snapshot-delta',
	'redundant-backup-export',
	'shielded',
])

export const VM_BACKUP_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const VM_BACKUP_PRESETS = Object.freeze([
	{
		id: 'all-vm-backup-vault-audit',
		name: 'All VM Disks, Snapshots & Container Backups',
		description: 'Audit .vmdk/.qcow2/.vhdx/.vdi/.ova/.ovf disks, -000001.vmdk/.vmsn/.sav snapshots, docker-save .tar/.tar.gz exports, and .iso/.img installers while conserving production VMs and parent base images of active snapshots.',
		familyFilter: 'all',
		strategy: 'prune-orphan-snapshots-keep-prod-bases',
		survivorRule: 'production-and-parent-base-first',
		protectProductionVmImages: true,
		protectParentBaseImages: true,
		protectActiveSnapshots: true,
		protectLinkedCloneBases: true,
		keepRecentSnapshots: 1,
		staleSnapshotDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'prune-orphan-snapshots-and-vmsn',
		name: 'Orphan Snapshots (-000001.vmdk/.vmsn/.sav) & Linked Clones',
		description: 'Target orphan child snapshots, stale -000001.vmdk/.vmsn/.sav state files, and detached linked clones while strictly preserving production VM disks and active parent base images.',
		familyFilter: 'vm-snapshots-linked-clones',
		strategy: 'quarantine-orphan-snapshots-only',
		survivorRule: 'production-and-parent-base-first',
		protectProductionVmImages: true,
		protectParentBaseImages: true,
		protectActiveSnapshots: true,
		protectLinkedCloneBases: true,
		keepRecentSnapshots: 1,
		staleSnapshotDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'dedup-docker-save-tarballs',
		name: 'Docker/OCI Backup Exports (docker-save .tar/.tar.gz)',
		description: 'Deduplicate redundant docker-save .tar and .tar.gz container backup exports while retaining the canonical backup vault archive.',
		familyFilter: 'container-backup-exports',
		strategy: 'prune-orphan-snapshots-keep-prod-bases',
		survivorRule: 'newest-backup-first',
		protectProductionVmImages: true,
		protectParentBaseImages: true,
		protectActiveSnapshots: true,
		protectLinkedCloneBases: true,
		keepRecentSnapshots: 1,
		staleSnapshotDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'consolidate-redundant-isos',
		name: 'Redundant Installer ISOs & Raw Images (.iso/.img)',
		description: 'Keep one canonical installer ISO or raw .img in the ISO library and reclaim redundant copies from staging or user download directories.',
		familyFilter: 'redundant-installer-isos',
		strategy: 'prune-orphan-snapshots-keep-prod-bases',
		survivorRule: 'production-and-parent-base-first',
		protectProductionVmImages: true,
		protectParentBaseImages: true,
		protectActiveSnapshots: true,
		protectLinkedCloneBases: true,
		keepRecentSnapshots: 1,
		staleSnapshotDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'consolidate-immutable-vault-hardlinks',
		name: 'Hardlink-Consolidate Immutable ISOs & Container Backups',
		description: 'Use POSIX hardlinks (ln -f) to deduplicate immutable .iso/.img installers and docker-save .tar/.tar.gz backups while strictly blocking hardlinks on mutable VM disk files.',
		familyFilter: 'all',
		strategy: 'consolidate-backup-vault-hardlinks',
		survivorRule: 'production-and-parent-base-first',
		protectProductionVmImages: true,
		protectParentBaseImages: true,
		protectActiveSnapshots: true,
		protectLinkedCloneBases: true,
		keepRecentSnapshots: 1,
		staleSnapshotDays: 14,
		minSizeMb: 0,
	},
])

export const VM_BACKUP_DEFAULT_CONFIG = Object.freeze({
	presetId: 'all-vm-backup-vault-audit',
	familyFilter: 'all',
	verdictFilter: 'all',
	strategy: 'prune-orphan-snapshots-keep-prod-bases',
	survivorRule: 'production-and-parent-base-first',
	sortMode: 'reclaim_desc',
	searchQuery: '',
	protectProductionVmImages: true,
	protectParentBaseImages: true,
	protectActiveSnapshots: true,
	protectLinkedCloneBases: true,
	keepRecentSnapshots: 1,
	staleSnapshotDays: 14,
	minSizeMb: 0,
})

const SNAPSHOT_NUMBERED_VMDK_RE = /-\d{6}\.vmdk$/i
const SNAPSHOT_DELTA_VMDK_RE = /-(?:delta|sesparse)\.vmdk$/i
const SNAPSHOT_FLAT_VMDK_RE = /-flat\.vmdk$/i
const SNAPSHOT_STATE_EXT_RE = /\.(?:vmsn|vmsd|sav|avhdx)$/i
const VM_DISK_BASE_EXT_RE = /\.(?:vmdk|qcow2|vhdx|vdi|ova|ovf)$/i
const DOCKER_EXPORT_NAME_RE = /(?:^|\/)(?:docker[-_]?save|oci[-_]?(?:backup|export|image|save)|container[-_]?(?:backup|export)|registry[-_]?(?:backup|export))[^/]*\.(?:tar\.gz|tgz|tar\.zst|tar)$/i
const OCI_TAR_EXT_RE = /\.oci\.(?:tar|tar\.gz|tgz|tar\.zst)$/i
const CONTAINER_BACKUP_DIR_RE = /(?:^|\/)(?:docker[-_]?backups?|docker[-_]?exports?|container[-_]?backups?|oci[-_]?backups?|registry[-_]?backups?)(?:\/|$)/i
const GENERIC_TAR_EXT_RE = /\.(?:tar\.gz|tgz|tar\.zst|tar)$/i
const INSTALLER_ISO_RE = /\.(?:iso|img)$/i

const PRODUCTION_PATH_RE = /(?:^|\/)(?:prod|production|live|datastore|vm-prod|hypervisor-live|running|esxi-prod|proxmox-prod|cluster-prod)(?:\/|$)/i
const PRODUCTION_NAME_RE = /(?:^|[-_.])(prod|production|live)(?:[-_./]|$)/i
const ARCHIVE_OR_STALE_PATH_RE = /(?:^|\/)(?:old|archive|archives|staging|tmp|temp|trash|\.trash|downloads|orphan|orphans|detached|stale|unattached|bak|backup-old)(?:\/|$)/i
const GOLDEN_BASE_PATH_RE = /(?:^|\/)(?:golden[-_]?bases?|base[-_]?images?|templates?|master[-_]?images?|iso[-_]?vault|iso[-_]?library)(?:\/|$)/i
const SNAPSHOT_DIR_RE = /(?:^|\/)(?:snapshots?|linked[-_]?clones?|deltas?|checkpoints?|vm[-_]?states?)(?:\/|$)/i
const LINKED_CLONE_MARKER_RE = /(?:linked[-_]?clone|clone[-_]?\d+|overlay|differencing|delta[-_]?\d*|snap[-_]?\d+)/i
const ORPHAN_MARKER_RE = /(?:orphan|detached|dangling|stale|unreferenced|missing[-_]?parent)/i
const ACTIVE_VM_DIR_RE = /(?:^|\/)(?:prod|production|live|datastore|active[-_]?vms?|running[-_]?vms?|vms?|kvm|libvirt|vmware|hyperv|proxmox)(?:\/|$)/i

/**
 * Clamp and parse a non-negative integer config option.
 *
 * @param {*} value Candidate value.
 * @param {number} fallback Fallback integer.
 * @param {number} max Upper bound.
 * @return {number} Normalized integer.
 */
function normalizeNonNegativeInt(value, fallback, max = 10000) {
	const num = Number(value)
	if (!Number.isFinite(num) || num < 0) {
		return fallback
	}
	return Math.min(max, Math.floor(num))
}

/**
 * Normalize audit configuration against valid presets and bounds.
 *
 * @param {object} [raw] Raw configuration object.
 * @return {object} Normalized configuration.
 */
export function normalizeVmBackupConfig(raw = {}) {
	const input = raw && typeof raw === 'object' ? raw : {}
	const preset = VM_BACKUP_PRESETS.find(item => item.id === input.presetId) || null
	const base = preset ? { ...VM_BACKUP_DEFAULT_CONFIG, ...preset } : { ...VM_BACKUP_DEFAULT_CONFIG }

	const familyFilter = VM_BACKUP_FAMILIES.includes(input.familyFilter)
		? input.familyFilter
		: base.familyFilter
	const verdictFilter = VM_BACKUP_VERDICT_FILTERS.includes(input.verdictFilter)
		? input.verdictFilter
		: base.verdictFilter
	const strategy = VM_BACKUP_STRATEGIES.includes(input.strategy)
		? input.strategy
		: base.strategy
	const survivorRule = VM_BACKUP_SURVIVOR_RULES.includes(input.survivorRule)
		? input.survivorRule
		: base.survivorRule
	const sortMode = VM_BACKUP_SORT_MODES.includes(input.sortMode)
		? input.sortMode
		: base.sortMode

	return {
		presetId: preset ? preset.id : base.presetId,
		familyFilter,
		verdictFilter,
		strategy,
		survivorRule,
		sortMode,
		searchQuery: typeof input.searchQuery === 'string' ? input.searchQuery.trim() : '',
		protectProductionVmImages: input.protectProductionVmImages !== undefined
			? Boolean(input.protectProductionVmImages)
			: base.protectProductionVmImages,
		protectParentBaseImages: input.protectParentBaseImages !== undefined
			? Boolean(input.protectParentBaseImages)
			: base.protectParentBaseImages,
		protectActiveSnapshots: input.protectActiveSnapshots !== undefined
			? Boolean(input.protectActiveSnapshots)
			: base.protectActiveSnapshots,
		protectLinkedCloneBases: input.protectLinkedCloneBases !== undefined
			? Boolean(input.protectLinkedCloneBases)
			: base.protectLinkedCloneBases,
		keepRecentSnapshots: normalizeNonNegativeInt(
			input.keepRecentSnapshots,
			base.keepRecentSnapshots,
			500,
		),
		staleSnapshotDays: normalizeNonNegativeInt(
			input.staleSnapshotDays,
			base.staleSnapshotDays,
			3650,
		),
		minSizeMb: normalizeNonNegativeInt(
			input.minSizeMb,
			base.minSizeMb,
			1048576,
		),
		memberOverrides: input.memberOverrides && typeof input.memberOverrides === 'object'
			? input.memberOverrides
			: {},
	}
}

/**
 * Extract the normalized file path, directory, basename, and VM stem from a duplicate file entry.
 *
 * @param {object} file Duplicate file entry.
 * @return {object} Normalized path metadata.
 */
function extractPathParts(file) {
	const rawPath = typeof file?.path === 'string' && file.path.length > 0
		? file.path
		: (typeof file?.name === 'string' ? file.name : '')
	const normalized = normalizePathForDiff(rawPath)
	const slashIndex = normalized.lastIndexOf('/')
	const directory = slashIndex >= 0 ? normalized.slice(0, slashIndex) : ''
	const basename = slashIndex >= 0 ? normalized.slice(slashIndex + 1) : normalized
	return {
		rawPath,
		normalized,
		lower: normalized.toLowerCase(),
		directory,
		lowerDir: directory.toLowerCase(),
		basename,
		lowerBase: basename.toLowerCase(),
	}
}

/**
 * Derive a normalized VM stem for correlating base images, snapshots (-000001.vmdk, .vmsn, .sav), and linked clones.
 *
 * @param {string} basename Lowercase filename.
 * @return {string} Normalized VM stem.
 */
export function extractVmStem(basename) {
	if (typeof basename !== 'string' || basename.length === 0) {
		return ''
	}
	let stem = basename.toLowerCase()
	stem = stem.replace(/-\d{6}\.vmdk$/i, '')
	stem = stem.replace(/-(?:delta|sesparse|flat)\.vmdk$/i, '')
	stem = stem.replace(/\.(?:vmdk|qcow2|vhdx|vdi|ova|ovf|vmsn|vmsd|sav|avhdx)$/i, '')
	stem = stem.replace(/[-_](?:linked[-_]?clone|clone[-_]?\d+|overlay|differencing|snap[-_]?\d+|snapshot[-_]?\d+)$/i, '')
	stem = stem.replace(/[-_]+$/, '')
	return stem
}

/**
 * Parse modified timestamp in milliseconds safely.
 *
 * @param {object} file Duplicate file entry.
 * @return {number} Epoch milliseconds or 0 when unavailable.
 */
function getModifiedMs(file) {
	if (typeof file?.mtime === 'number' && Number.isFinite(file.mtime)) {
		return file.mtime > 1e12 ? file.mtime : file.mtime * 1000
	}
	if (typeof file?.modified === 'number' && Number.isFinite(file.modified)) {
		return file.modified > 1e12 ? file.modified : file.modified * 1000
	}
	const candidate = file?.modifiedTime || file?.mtimeIso || file?.lastModified || file?.updatedAt
	if (typeof candidate === 'string' && candidate.length > 0) {
		const parsed = Date.parse(candidate)
		if (Number.isFinite(parsed)) {
			return parsed
		}
	}
	return 0
}

/**
 * Classify a single file entry into virtualization family, artifact kind, and structural markers.
 *
 * @param {object} file Duplicate file entry.
 * @param {number} [referenceNowMs] Reference epoch ms for age calculation.
 * @return {object} Member classification descriptors.
 */
export function classifyVmBackupFile(file, referenceNowMs = Date.now()) {
	const parts = extractPathParts(file)
	const { lower, lowerBase, lowerDir } = parts
	const size = Math.max(0, Number(file?.size) || 0)
	const mtimeMs = getModifiedMs(file)
	const ageDays = mtimeMs > 0
		? Math.max(0, Math.floor((referenceNowMs - mtimeMs) / (1000 * 60 * 60 * 24)))
		: 0

	const isNumberedVmdk = SNAPSHOT_NUMBERED_VMDK_RE.test(lowerBase)
	const isDeltaVmdk = SNAPSHOT_DELTA_VMDK_RE.test(lowerBase)
	const isFlatVmdk = SNAPSHOT_FLAT_VMDK_RE.test(lowerBase)
	const isSnapshotState = SNAPSHOT_STATE_EXT_RE.test(lowerBase)
	const isBaseDiskExt = VM_DISK_BASE_EXT_RE.test(lowerBase)
	const isLinkedCloneName = isBaseDiskExt && !isNumberedVmdk && !isDeltaVmdk && !isFlatVmdk && LINKED_CLONE_MARKER_RE.test(lowerBase)
	const isLinkedCloneDir = isBaseDiskExt && !isNumberedVmdk && !isDeltaVmdk && !isFlatVmdk && /(?:^|\/)linked[-_]?clones?(?:\/|$)/i.test(lowerDir)
	const isDockerExport = DOCKER_EXPORT_NAME_RE.test(lower)
		|| OCI_TAR_EXT_RE.test(lowerBase)
		|| (CONTAINER_BACKUP_DIR_RE.test(lower) && GENERIC_TAR_EXT_RE.test(lowerBase))
	const isInstallerIso = INSTALLER_ISO_RE.test(lowerBase)

	let family = null
	let artifactKind = 'unknown'
	let isMutableVmDisk = false
	let isSnapshotOrClone = false
	let isBaseImage = false
	let isImmutableArchiveOrIso = false

	if (isNumberedVmdk || isDeltaVmdk || isSnapshotState || isLinkedCloneName || isLinkedCloneDir) {
		family = 'vm-snapshots-linked-clones'
		isSnapshotOrClone = true
		isMutableVmDisk = true
		if (isNumberedVmdk) {
			artifactKind = 'numbered-vmdk-snapshot'
		} else if (isDeltaVmdk) {
			artifactKind = 'delta-vmdk-snapshot'
		} else if (isSnapshotState) {
			artifactKind = lowerBase.endsWith('.vmsn')
				? 'vmsn-state'
				: (lowerBase.endsWith('.sav') ? 'sav-state' : 'snapshot-state-file')
		} else {
			artifactKind = 'linked-clone-disk'
		}
	} else if (isBaseDiskExt) {
		family = 'vm-base-disk-images'
		artifactKind = isFlatVmdk ? 'flat-vmdk-disk' : 'vm-base-disk'
		isBaseImage = true
		isMutableVmDisk = true
	} else if (isDockerExport) {
		family = 'container-backup-exports'
		artifactKind = 'docker-save-export'
		isImmutableArchiveOrIso = true
	} else if (isInstallerIso) {
		family = 'redundant-installer-isos'
		artifactKind = lowerBase.endsWith('.iso') ? 'installer-iso' : 'raw-disk-img'
		isImmutableArchiveOrIso = true
	}

	const isExplicitArchiveOrStale = ARCHIVE_OR_STALE_PATH_RE.test(lowerDir)
	const isExplicitOrphan = ORPHAN_MARKER_RE.test(lower) || Boolean(file?.isOrphanSnapshot)
	const isProductionPath = (PRODUCTION_PATH_RE.test(lowerDir) || PRODUCTION_NAME_RE.test(lowerBase))
		&& !isExplicitArchiveOrStale
		&& !isExplicitOrphan
		&& !isSnapshotOrClone
	const isGoldenBasePath = GOLDEN_BASE_PATH_RE.test(lowerDir) && !isExplicitArchiveOrStale
	const isActiveVmDirectory = ACTIVE_VM_DIR_RE.test(lowerDir) && !isExplicitArchiveOrStale && !isExplicitOrphan
	const isSnapshotDirectory = SNAPSHOT_DIR_RE.test(lowerDir)
	const vmStem = extractVmStem(lowerBase)

	return {
		...parts,
		size,
		mtimeMs,
		formattedMtime: formatFileModifiedTime(file),
		ageDays,
		family,
		artifactKind,
		vmStem,
		isMutableVmDisk,
		isSnapshotOrClone,
		isBaseImage,
		isImmutableArchiveOrIso,
		isProductionPath,
		isGoldenBasePath,
		isActiveVmDirectory,
		isSnapshotDirectory,
		isExplicitArchiveOrStale,
		isExplicitOrphan,
		explicitParentMissing: file?.parentMissing === true || file?.orphan === true,
	}
}

/**
 * Check whether a duplicate group belongs to the virtualization & backup vault domain.
 *
 * @param {object} group Duplicate group object.
 * @return {boolean} True when at least one member matches a supported virtualization/backup family.
 */
export function isVmBackupGroup(group) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return false
	}
	return group.files.some(file => classifyVmBackupFile(file).family !== null)
}

/**
 * Build a vault-wide dependency index correlating VM base images with active vs orphan snapshots and linked clones.
 *
 * @param {Array<object>} groups Duplicate groups in scope.
 * @param {object} config Normalized configuration.
 * @param {number} [referenceNowMs] Reference epoch ms.
 * @return {object} Dependency maps by VM stem and directory.
 */
export function buildVmDependencyIndex(groups, config, referenceNowMs = Date.now()) {
	const baseDirectoriesByStem = new Map()
	const globalBasesByStem = new Map()
	const activeSnapshotDirsByStem = new Map()
	const orphanSnapshotDirsByStem = new Map()
	const activeLinkedClonesByStem = new Map()
	const totalSnapshotsByStem = new Map()

	for (const group of Array.isArray(groups) ? groups : []) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (const file of group.files) {
			const meta = classifyVmBackupFile(file, referenceNowMs)
			if (!meta.family || !meta.vmStem) {
				continue
			}

			if (meta.isBaseImage) {
				if (!baseDirectoriesByStem.has(meta.vmStem)) {
					baseDirectoriesByStem.set(meta.vmStem, new Set())
				}
				baseDirectoriesByStem.get(meta.vmStem).add(meta.lowerDir)

				if (!globalBasesByStem.has(meta.vmStem)) {
					globalBasesByStem.set(meta.vmStem, [])
				}
				globalBasesByStem.get(meta.vmStem).push(meta.normalized)
			}

			if (meta.isSnapshotOrClone) {
				if (!totalSnapshotsByStem.has(meta.vmStem)) {
					totalSnapshotsByStem.set(meta.vmStem, { active: 0, orphan: 0, linkedClones: 0 })
				}
				const counts = totalSnapshotsByStem.get(meta.vmStem)
				const isStaleByAge = meta.mtimeMs > 0 && meta.ageDays > config.staleSnapshotDays
				const isLinkedClone = meta.artifactKind === 'linked-clone-disk'
				if (isLinkedClone) {
					counts.linkedClones += 1
				}

				const looksOrphan = meta.isExplicitOrphan
					|| meta.explicitParentMissing
					|| meta.isExplicitArchiveOrStale
					|| isStaleByAge

				if (looksOrphan) {
					counts.orphan += 1
					if (!orphanSnapshotDirsByStem.has(meta.vmStem)) {
						orphanSnapshotDirsByStem.set(meta.vmStem, new Set())
					}
					orphanSnapshotDirsByStem.get(meta.vmStem).add(meta.lowerDir)
				} else {
					counts.active += 1
					if (!activeSnapshotDirsByStem.has(meta.vmStem)) {
						activeSnapshotDirsByStem.set(meta.vmStem, new Set())
					}
					activeSnapshotDirsByStem.get(meta.vmStem).add(meta.lowerDir)
					if (isLinkedClone) {
						if (!activeLinkedClonesByStem.has(meta.vmStem)) {
							activeLinkedClonesByStem.set(meta.vmStem, [])
						}
						activeLinkedClonesByStem.get(meta.vmStem).push(meta.normalized)
					}
				}
			}
		}
	}

	return {
		baseDirectoriesByStem,
		globalBasesByStem,
		activeSnapshotDirsByStem,
		orphanSnapshotDirsByStem,
		activeLinkedClonesByStem,
		totalSnapshotsByStem,
	}
}

/**
 * Determine whether a snapshot/clone member is orphan (missing parent base, stale, or detached) vs active.
 *
 * @param {object} meta Member classification metadata.
 * @param {object} dependencyIndex Vault dependency index.
 * @param {object} config Normalized configuration.
 * @return {object} Orphan evaluation result.
 */
function evaluateSnapshotLineage(meta, dependencyIndex, config) {
	if (!meta.isSnapshotOrClone) {
		return {
			isOrphan: false,
			hasParentBaseInDir: false,
			hasParentBaseGlobally: false,
			reasons: [],
		}
	}

	const baseDirs = dependencyIndex.baseDirectoriesByStem.get(meta.vmStem)
	const globalBases = dependencyIndex.globalBasesByStem.get(meta.vmStem) || []
	const hasParentBaseInDir = Boolean(baseDirs && baseDirs.has(meta.lowerDir))
	const hasParentBaseGlobally = globalBases.length > 0
	const isStaleByAge = meta.mtimeMs > 0 && meta.ageDays > config.staleSnapshotDays

	const reasons = []
	if (meta.explicitParentMissing) {
		reasons.push('Parent base disk flagged missing')
	} else if (!hasParentBaseInDir && !hasParentBaseGlobally && meta.isSnapshotOrClone) {
		reasons.push('No matching parent base disk found in vault')
	}
	if (meta.isExplicitOrphan) {
		reasons.push('Marked orphan/detached snapshot')
	}
	if (meta.isExplicitArchiveOrStale) {
		reasons.push('Located in stale/archive/staging path')
	}
	if (isStaleByAge) {
		reasons.push(`Snapshot age (${meta.ageDays}d) exceeds ${config.staleSnapshotDays}d retention`)
	}

	const isOrphan = reasons.length > 0
	return {
		isOrphan,
		hasParentBaseInDir,
		hasParentBaseGlobally,
		reasons,
	}
}

/**
 * Score a candidate member for survivor selection according to the active survivor rule.
 *
 * @param {object} member Classified member descriptor.
 * @param {string} survivorRule Survivor rule identifier.
 * @return {number} Deterministic score (higher wins).
 */
function scoreMemberForSurvivor(member, survivorRule) {
	let score = 0

	if (member.isProductionVmImage) {
		score += 100000
	}
	if (member.isParentOfActiveSnapshots) {
		score += 80000
	}
	if (member.isGoldenBasePath) {
		score += 40000
	}
	if (member.isActiveVmDirectory) {
		score += 15000
	}
	if (member.isExplicitArchiveOrStale || member.isExplicitOrphan) {
		score -= 25000
	}

	if (survivorRule === 'newest-backup-first') {
		score += Math.floor(member.mtimeMs / 1000)
	} else if (survivorRule === 'shortest-path') {
		score -= member.normalized.length * 10
	} else {
		// production-and-parent-base-first
		score -= member.normalized.length
	}

	return score
}

/**
 * Determine the dominant family for a duplicate cluster.
 *
 * @param {Array<object>} members Classified members.
 * @return {string} Dominant family ID.
 */
function resolveClusterFamily(members) {
	const counts = new Map()
	for (const member of members) {
		if (!member.family) {
			continue
		}
		counts.set(member.family, (counts.get(member.family) || 0) + 1)
	}
	let bestFamily = 'vm-base-disk-images'
	let bestCount = -1
	for (const [family, count] of counts.entries()) {
		if (count > bestCount) {
			bestCount = count
			bestFamily = family
		}
	}
	return bestFamily
}

/**
 * Audit a single virtualization/backup duplicate cluster.
 *
 * @param {object} group Duplicate group.
 * @param {object} dependencyIndex Vault dependency index.
 * @param {object} config Normalized configuration.
 * @param {number} referenceNowMs Reference epoch ms.
 * @return {object|null} Audited cluster entry or null if outside domain.
 */
function auditSingleCluster(group, dependencyIndex, config, referenceNowMs) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return null
	}

	const rawMembers = group.files.map((file, index) => {
		const meta = classifyVmBackupFile(file, referenceNowMs)
		if (!meta.family) {
			return null
		}
		const activeSnapDirs = dependencyIndex.activeSnapshotDirsByStem.get(meta.vmStem)
		const activeLinkedClones = dependencyIndex.activeLinkedClonesByStem.get(meta.vmStem) || []
		const hasActiveSnapshotInDir = Boolean(activeSnapDirs && activeSnapDirs.has(meta.lowerDir))
		const hasActiveLinkedClones = activeLinkedClones.length > 0 && meta.isGoldenBasePath
		const isParentOfActiveSnapshots = meta.isBaseImage && (hasActiveSnapshotInDir || hasActiveLinkedClones)
		const lineage = evaluateSnapshotLineage(meta, dependencyIndex, config)

		return {
			...meta,
			key: getFileSelectionKey(file, index),
			file,
			index,
			isProductionVmImage: meta.isProductionPath,
			isParentOfActiveSnapshots,
			hasActiveSnapshotInDir,
			hasActiveLinkedClones,
			isOrphanSnapshot: lineage.isOrphan,
			orphanReasons: lineage.reasons,
			hasParentBaseInDir: lineage.hasParentBaseInDir,
			hasParentBaseGlobally: lineage.hasParentBaseGlobally,
		}
	}).filter(Boolean)

	if (rawMembers.length === 0) {
		return null
	}

	const family = resolveClusterFamily(rawMembers)
	const primaryName = rawMembers[0].basename || group.hash || `cluster-${group.id}`
	const primaryStem = rawMembers[0].vmStem || extractVmStem(primaryName)
	const info = computeGroupReclaimableInfo(group)
	const totalBytes = Number(info.totalBytes) || rawMembers.reduce((sum, item) => sum + item.size, 0)
	const unitBytes = Number(info.unitBytes) || (rawMembers[0]?.size || 0)

	// Sort active snapshots by newest mtime first to apply keepRecentSnapshots shield
	const activeSnapshotKeys = new Set()
	if (config.protectActiveSnapshots && config.keepRecentSnapshots > 0) {
		const snapshotCandidates = rawMembers
			.filter(m => m.isSnapshotOrClone && !m.isOrphanSnapshot)
			.sort((a, b) => (b.mtimeMs - a.mtimeMs) || a.normalized.localeCompare(b.normalized))
		for (const item of snapshotCandidates.slice(0, config.keepRecentSnapshots)) {
			activeSnapshotKeys.add(item.key)
		}
	}

	// Pick canonical survivor deterministically
	const sortedForSurvivor = [...rawMembers].sort((a, b) => {
		const scoreDiff = scoreMemberForSurvivor(b, config.survivorRule) - scoreMemberForSurvivor(a, config.survivorRule)
		if (scoreDiff !== 0) {
			return scoreDiff
		}
		return a.normalized.localeCompare(b.normalized)
	})
	const survivorKey = sortedForSurvivor[0].key

	// Assign governance verdicts and actions per member
	let reclaimableBytes = 0
	let hardlinkSavingsBytes = 0
	let deleteTargetsCount = 0
	let hardlinkTargetsCount = 0
	let shieldedCount = 0

	const members = rawMembers.map((member) => {
		const isSurvivor = member.key === survivorKey
		const override = config.memberOverrides?.[member.key] || 'auto'
		let governanceTier = 'redundant-backup-export'
		let shielded = false
		let protectedReason = ''
		let action = 'keep'

		if (override === 'keep' && !isSurvivor) {
			governanceTier = member.isProductionVmImage
				? 'production-vm-image'
				: (member.isParentOfActiveSnapshots ? 'parent-base-image' : 'active-vm-snapshot')
			shielded = true
			protectedReason = 'Manually shielded via per-copy override'
		} else if (member.isProductionVmImage && config.protectProductionVmImages) {
			governanceTier = 'production-vm-image'
			shielded = true
			protectedReason = 'Production VM image strictly conserved'
		} else if (member.isParentOfActiveSnapshots && (config.protectParentBaseImages || (member.hasActiveLinkedClones && config.protectLinkedCloneBases))) {
			governanceTier = 'parent-base-image'
			shielded = true
			protectedReason = member.hasActiveLinkedClones
				? 'Parent base image of active linked clones strictly conserved'
				: 'Parent base image of active VM snapshots strictly conserved'
		} else if (member.isSnapshotOrClone && !member.isOrphanSnapshot && (activeSnapshotKeys.has(member.key) || config.protectActiveSnapshots) && override !== 'prune') {
			governanceTier = 'active-vm-snapshot'
			shielded = true
			protectedReason = 'Active VM snapshot conserved by snapshot retention policy'
		} else if (isSurvivor) {
			governanceTier = member.isBaseImage ? 'parent-base-image' : (member.isSnapshotOrClone ? 'active-vm-snapshot' : 'redundant-backup-export')
			shielded = true
			protectedReason = 'Canonical cluster survivor retained'
		} else if (override === 'prune') {
			governanceTier = member.isSnapshotOrClone ? 'orphan-snapshot-delta' : 'redundant-backup-export'
			action = config.strategy === 'consolidate-backup-vault-hardlinks' && !member.isMutableVmDisk
				? 'hardlink'
				: 'delete'
			if (action === 'hardlink') {
				hardlinkSavingsBytes += member.size
				hardlinkTargetsCount += 1
			} else {
				deleteTargetsCount += 1
			}
			reclaimableBytes += member.size
			protectedReason = 'Marked for remediation via per-copy override'
		} else if (member.isSnapshotOrClone) {
			governanceTier = 'orphan-snapshot-delta'
			if (config.strategy === 'consolidate-backup-vault-hardlinks') {
				action = 'keep'
				shielded = true
				protectedReason = 'Hardlinking mutable VM snapshots/disks is blocked to prevent cross-VM corruption'
			} else {
				action = 'delete'
				reclaimableBytes += member.size
				deleteTargetsCount += 1
			}
		} else {
			governanceTier = 'redundant-backup-export'
			if (config.strategy === 'quarantine-orphan-snapshots-only') {
				action = 'keep'
				shielded = true
				protectedReason = 'Conserved under orphan-snapshot-only remediation strategy'
			} else if (config.strategy === 'consolidate-backup-vault-hardlinks') {
				if (member.isMutableVmDisk) {
					action = 'keep'
					shielded = true
					protectedReason = 'Mutable VM disk cannot be hardlinked (CoW/extent risk)'
				} else {
					action = 'hardlink'
					hardlinkSavingsBytes += member.size
					reclaimableBytes += member.size
					hardlinkTargetsCount += 1
				}
			} else {
				action = 'delete'
				reclaimableBytes += member.size
				deleteTargetsCount += 1
			}
		}

		if (shielded) {
			shieldedCount += 1
		}

		return {
			...member,
			isSurvivor,
			governanceTier,
			shielded,
			protectedReason,
			action,
		}
	})

	// Determine cluster-level summary verdict
	let clusterVerdict = 'redundant-backup-export'
	if (members.some(m => m.governanceTier === 'production-vm-image')) {
		clusterVerdict = 'production-vm-image'
	} else if (members.some(m => m.governanceTier === 'parent-base-image' && m.isParentOfActiveSnapshots)) {
		clusterVerdict = 'parent-base-image'
	} else if (members.some(m => m.governanceTier === 'orphan-snapshot-delta')) {
		clusterVerdict = 'orphan-snapshot-delta'
	} else if (members.some(m => m.governanceTier === 'active-vm-snapshot')) {
		clusterVerdict = 'active-vm-snapshot'
	}

	const stemStats = dependencyIndex.totalSnapshotsByStem.get(primaryStem) || { active: 0, orphan: 0, linkedClones: 0 }
	const hasReclaimable = (deleteTargetsCount + hardlinkTargetsCount) > 0
	const riskScore = (clusterVerdict === 'production-vm-image' ? 100 : 0)
		+ (clusterVerdict === 'parent-base-image' ? 85 : 0)
		+ (clusterVerdict === 'orphan-snapshot-delta' ? 60 : 0)
		+ (stemStats.linkedClones > 0 ? 15 : 0)

	return {
		id: group.id ?? primaryName,
		hash: group.hash || '',
		name: primaryName,
		vmStem: primaryStem,
		family,
		familyLabel: VM_BACKUP_FAMILY_META[family]?.label || family,
		clusterVerdict,
		riskScore,
		unitBytes,
		formattedUnitBytes: formatBytes(unitBytes),
		totalBytes,
		formattedTotalBytes: formatBytes(totalBytes),
		reclaimableBytes,
		formattedReclaimableBytes: formatBytes(reclaimableBytes),
		hardlinkSavingsBytes,
		copyCount: members.length,
		reclaimableTargetsCount: deleteTargetsCount + hardlinkTargetsCount,
		deleteTargetsCount,
		hardlinkTargetsCount,
		shieldedCount,
		hasReclaimable,
		survivorPath: sortedForSurvivor[0].normalized,
		hasProductionCopy: members.some(m => m.isProductionVmImage),
		hasParentBaseProtection: members.some(m => m.isParentOfActiveSnapshots),
		activeSnapshotDependentsCount: stemStats.active,
		orphanSnapshotDependentsCount: stemStats.orphan,
		linkedCloneCount: stemStats.linkedClones,
		members,
		group,
	}
}

/**
 * Audit a collection of duplicate groups across Virtualization, VM Disk Images & Container Backups.
 *
 * @param {Array<object>} groups Duplicate groups.
 * @param {object} [rawConfig] Configuration overrides.
 * @param {number} [referenceNowMs] Reference epoch ms for deterministic tests.
 * @return {object} Complete audit result with summary, family counts, filtered clusters, and script/exclude previews.
 */
export function auditVmBackupVault(groups, rawConfig = {}, referenceNowMs = Date.now()) {
	const config = normalizeVmBackupConfig(rawConfig)
	const sourceGroups = Array.isArray(groups) ? groups : []
	const domainGroups = sourceGroups.filter(isVmBackupGroup)
	const dependencyIndex = buildVmDependencyIndex(domainGroups, config, referenceNowMs)

	const allClusters = domainGroups
		.map(group => auditSingleCluster(group, dependencyIndex, config, referenceNowMs))
		.filter(Boolean)

	const minSizeBytes = config.minSizeMb * 1024 * 1024
	const sizeFiltered = allClusters.filter(cluster => cluster.unitBytes >= minSizeBytes)

	const familyCounts = {
		all: sizeFiltered.length,
		'vm-base-disk-images': 0,
		'vm-snapshots-linked-clones': 0,
		'container-backup-exports': 0,
		'redundant-installer-isos': 0,
	}
	for (const cluster of sizeFiltered) {
		if (Object.prototype.hasOwnProperty.call(familyCounts, cluster.family)) {
			familyCounts[cluster.family] += 1
		}
	}

	const query = config.searchQuery.toLowerCase()
	const filteredClusters = sizeFiltered.filter((cluster) => {
		if (config.familyFilter !== 'all' && cluster.family !== config.familyFilter) {
			return false
		}
		if (config.verdictFilter === 'reclaimable' && !cluster.hasReclaimable) {
			return false
		}
		if (config.verdictFilter === 'shielded' && cluster.hasReclaimable) {
			return false
		}
		if (
			config.verdictFilter !== 'all'
			&& config.verdictFilter !== 'reclaimable'
			&& config.verdictFilter !== 'shielded'
			&& cluster.clusterVerdict !== config.verdictFilter
		) {
			return false
		}
		if (query.length > 0) {
			const matchesName = cluster.name.toLowerCase().includes(query)
			const matchesStem = cluster.vmStem.toLowerCase().includes(query)
			const matchesMember = cluster.members.some(m => m.lower.includes(query))
			if (!matchesName && !matchesStem && !matchesMember) {
				return false
			}
		}
		return true
	})

	filteredClusters.sort((a, b) => {
		if (config.sortMode === 'risk_desc') {
			return (b.riskScore - a.riskScore) || (b.reclaimableBytes - a.reclaimableBytes) || a.name.localeCompare(b.name)
		}
		if (config.sortMode === 'copies_desc') {
			return (b.copyCount - a.copyCount) || (b.reclaimableBytes - a.reclaimableBytes) || a.name.localeCompare(b.name)
		}
		if (config.sortMode === 'name_asc') {
			return a.name.localeCompare(b.name)
		}
		return (b.reclaimableBytes - a.reclaimableBytes) || (b.totalBytes - a.totalBytes) || a.name.localeCompare(b.name)
	})

	let rawDuplicateBytes = 0
	let reclaimableBytes = 0
	let totalReclaimableCopiesCount = 0
	let totalShieldedCopiesCount = 0
	let totalProductionVmClusters = 0
	let totalParentBaseClusters = 0
	let totalActiveSnapshotClusters = 0
	let totalOrphanSnapshotClusters = 0
	let totalDockerExportClusters = 0
	let totalRedundantIsoClusters = 0

	for (const cluster of filteredClusters) {
		rawDuplicateBytes += Math.max(0, cluster.totalBytes - cluster.unitBytes)
		reclaimableBytes += cluster.reclaimableBytes
		totalReclaimableCopiesCount += cluster.reclaimableTargetsCount
		totalShieldedCopiesCount += cluster.shieldedCount

		if (cluster.hasProductionCopy) {
			totalProductionVmClusters += 1
		}
		if (cluster.hasParentBaseProtection) {
			totalParentBaseClusters += 1
		}
		if (cluster.clusterVerdict === 'active-vm-snapshot') {
			totalActiveSnapshotClusters += 1
		}
		if (cluster.clusterVerdict === 'orphan-snapshot-delta') {
			totalOrphanSnapshotClusters += 1
		}
		if (cluster.family === 'container-backup-exports') {
			totalDockerExportClusters += 1
		}
		if (cluster.family === 'redundant-installer-isos') {
			totalRedundantIsoClusters += 1
		}
	}

	const efficiencyPct = rawDuplicateBytes > 0
		? Math.min(100, Math.round((reclaimableBytes / rawDuplicateBytes) * 100))
		: 0

	const reclaimableGb = `${(reclaimableBytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`

	const familyBreakdown = VM_BACKUP_FAMILIES
		.filter(id => id !== 'all')
		.map(id => ({
			id,
			label: VM_BACKUP_FAMILY_META[id].label,
			shortLabel: VM_BACKUP_FAMILY_META[id].shortLabel,
			clustersCount: familyCounts[id] || 0,
		}))

	return {
		schema: VM_BACKUP_VAULT_SCHEMA,
		config,
		familyCounts,
		familyBreakdown,
		clusters: filteredClusters,
		summary: {
			totalDomainGroupsCount: allClusters.length,
			totalUnfilteredClustersCount: sizeFiltered.length,
			totalClustersCount: filteredClusters.length,
			rawDuplicateBytes,
			formattedRawDuplicateBytes: formatBytes(rawDuplicateBytes),
			reclaimableBytes,
			formattedReclaimableBytes: formatBytes(reclaimableBytes),
			reclaimableGb,
			efficiencyPct,
			totalReclaimableCopiesCount,
			totalShieldedCopiesCount,
			totalProductionVmClusters,
			totalParentBaseClusters,
			totalActiveSnapshotClusters,
			totalOrphanSnapshotClusters,
			totalDockerExportClusters,
			totalRedundantIsoClusters,
		},
	}
}

/**
 * Quote a filesystem path safely for POSIX shell scripts using single-quote escaping.
 *
 * @param {string} rawPath Filesystem path.
 * @return {string} POSIX-quoted string.
 */
function quotePosixPath(rawPath) {
	const safe = String(rawPath || '').replace(/[\r\n\0]/g, '')
	return `'${safe.replace(/'/g, '\'"\'"\'')}'`
}

/**
 * Build a DRY_RUN=1 POSIX shell remediation script for audited VM & Container Backup clusters.
 * Strictly blocks deletion of production VM images and parent base images of active snapshots.
 *
 * @param {object} auditResult Result from auditVmBackupVault.
 * @return {string} POSIX shell script.
 */
export function buildVmBackupRemediationScript(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# Virtualization, VM Disk Images & Container Backup Vault Auditor',
		'# Safe POSIX Remediation Script (default DRY_RUN=1)',
		'# Run with DRY_RUN=0 ./vm-backup-vault-reclaim.sh only after verifying snapshot chains.',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'QUARANTINE_DIR="$' + '{QUARANTINE_DIR:-./.vm-backup-quarantine}"',
		'',
		'run_cmd() {',
		'  if [ "$DRY_RUN" = "1" ]; then',
		'    printf "[DRY_RUN=1] %s\\n" "$*"',
		'  else',
		'    "$@"',
		'  fi',
		'}',
		'',
	]

	let actionCount = 0
	for (const cluster of clusters) {
		const actions = (cluster.members || []).filter(m => m.action === 'delete' || m.action === 'hardlink')
		if (actions.length === 0) {
			continue
		}
		lines.push(`# Cluster: ${cluster.name} | Family: ${cluster.familyLabel} | Survivor: ${cluster.survivorPath}`)
		for (const target of actions) {
			actionCount += 1
			if (target.action === 'hardlink') {
				lines.push(`run_cmd ln -f ${quotePosixPath(cluster.survivorPath)} ${quotePosixPath(target.normalized)}`)
			} else if (target.governanceTier === 'orphan-snapshot-delta') {
				lines.push('run_cmd mkdir -p "$QUARANTINE_DIR"')
				lines.push(`run_cmd mv -n ${quotePosixPath(target.normalized)} "$QUARANTINE_DIR/"`)
			} else {
				lines.push(`run_cmd rm -f ${quotePosixPath(target.normalized)}`)
			}
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('printf "No reclaimable targets under current shield and strategy settings.\\n"')
	} else {
		lines.push(`printf "Completed audit remediation plan (%d target actions, DRY_RUN=%s).\\n" "${actionCount}" "$DRY_RUN"`)
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe CSV audit report for virtualization & backup clusters.
 *
 * @param {object} auditResult Result from auditVmBackupVault.
 * @return {string} RFC-4180 CSV content.
 */
export function buildVmBackupCsvReport(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const headers = [
		'cluster_id',
		'cluster_name',
		'vm_stem',
		'family',
		'cluster_verdict',
		'member_path',
		'artifact_kind',
		'governance_tier',
		'action',
		'shielded',
		'protected_reason',
		'is_survivor',
		'is_orphan_snapshot',
		'size_bytes',
		'formatted_size',
		'mtime',
		'survivor_path',
	]
	const rows = [headers.map(escapeCsvCell).join(',')]

	for (const cluster of clusters) {
		for (const member of cluster.members || []) {
			const row = [
				cluster.id,
				cluster.name,
				cluster.vmStem,
				cluster.family,
				cluster.clusterVerdict,
				member.normalized,
				member.artifactKind,
				member.governanceTier,
				member.action,
				member.shielded ? 'true' : 'false',
				member.protectedReason || '',
				member.isSurvivor ? 'true' : 'false',
				member.isOrphanSnapshot ? 'true' : 'false',
				member.size,
				formatBytes(member.size),
				member.formattedMtime || '',
				cluster.survivorPath,
			]
			rows.push(row.map(escapeCsvCell).join(','))
		}
	}

	return rows.join('\r\n')
}

/**
 * Build a deterministic JSON audit manifest.
 *
 * @param {object} auditResult Result from auditVmBackupVault.
 * @return {string} Pretty-printed JSON manifest.
 */
export function buildVmBackupJsonManifest(auditResult) {
	const payload = {
		schema: VM_BACKUP_VAULT_SCHEMA,
		generatedAt: new Date().toISOString(),
		config: auditResult?.config || VM_BACKUP_DEFAULT_CONFIG,
		summary: auditResult?.summary || {},
		clusters: (auditResult?.clusters || []).map(cluster => ({
			id: cluster.id,
			name: cluster.name,
			vmStem: cluster.vmStem,
			family: cluster.family,
			clusterVerdict: cluster.clusterVerdict,
			unitBytes: cluster.unitBytes,
			totalBytes: cluster.totalBytes,
			reclaimableBytes: cluster.reclaimableBytes,
			survivorPath: cluster.survivorPath,
			hasProductionCopy: cluster.hasProductionCopy,
			hasParentBaseProtection: cluster.hasParentBaseProtection,
			activeSnapshotDependentsCount: cluster.activeSnapshotDependentsCount,
			orphanSnapshotDependentsCount: cluster.orphanSnapshotDependentsCount,
			linkedCloneCount: cluster.linkedCloneCount,
			members: (cluster.members || []).map(member => ({
				path: member.normalized,
				artifactKind: member.artifactKind,
				governanceTier: member.governanceTier,
				action: member.action,
				shielded: member.shielded,
				protectedReason: member.protectedReason,
				isSurvivor: member.isSurvivor,
				isOrphanSnapshot: member.isOrphanSnapshot,
				orphanReasons: member.orphanReasons,
				size: member.size,
			})),
		})),
	}
	return JSON.stringify(payload, null, 2)
}

/**
 * Generate a Nextcloud/rsync .sync-exclude.lst exclusion rule set for VM disks, snapshots, and heavy exports.
 *
 * @return {string} Line-delimited .sync-exclude.lst rules.
 */
export function buildVmBackupSyncExcludeList() {
	return [
		'# Nextcloud / rsync exclusion rules for Virtualization, VM Snapshots & Container Backups',
		'*-00000*.vmdk',
		'*-delta.vmdk',
		'*-sesparse.vmdk',
		'*.vmsn',
		'*.vmsd',
		'*.sav',
		'*.avhdx',
		'*.lck',
		'*.vmdk.lck',
		'docker-save-*.tar',
		'docker-save-*.tar.gz',
		'*.oci.tar',
		'*.oci.tar.gz',
		'*.qcow2.tmp',
		'*.vhdx.tmp',
		'.vagrant/',
	].join('\n')
}
