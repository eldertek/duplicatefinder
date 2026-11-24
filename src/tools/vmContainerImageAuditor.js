/**
 * Pure VM, ISO & Container Image Vault Auditor.
 * Classifies and audits duplicate clusters across 4 infrastructure and virtualization families:
 * - VM Disk Images (.qcow2, .vmdk, .vdi, .vhdx, .vhd, .img, .raw, .utm/)
 * - ISO, OVA/OVF Installers & Checksums (.iso, .ova, .ovf, .sha256, SHA256SUMS)
 * - OCI / Docker Container Image Exports (.oci.tar, image-layer.tar, docker-save-*.tar, .tar.zst)
 * - VM Snapshots, Deltas & Temp Caches (*.vmsn, *.vmsd, *.lck, .vagrant/, *.vhdx.tmp, *.part)
 *
 * Assigns 5 governance tiers:
 * - golden-iso-vault (Canonical golden-iso-vault / iso-vault / verified appliance anchor; strictly protected by default)
 * - active-vm-disk (Active VM disk datastore image or .utm bundle; strictly protected by default)
 * - checksum-sidecar (Verification sidecar .sha256 / SHA256SUMS; strictly protected by default)
 * - iso-container-export (ISO/OVA/OVF installer or OCI/Docker tarball; deletion blocked unless a verified SHA-256 twin or matching size+hash copy is conserved)
 * - vm-snapshot-delta (Reconstructible or temporary VM snapshot, delta, lock, .vagrant/ cache, .vhdx.tmp, or .part)
 *
 * Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const VM_CONTAINER_IMAGE_SCHEMA = 'duplicatefinder.vm-container-image-auditor.v1'

export const VM_CONTAINER_IMAGE_FAMILIES = Object.freeze([
	'all',
	'vm-disk-images',
	'iso-ova-installers',
	'container-image-exports',
	'vm-snapshot-caches',
])

export const VM_CONTAINER_IMAGE_FAMILY_META = Object.freeze({
	'vm-disk-images': {
		id: 'vm-disk-images',
		label: 'VM Disk Images',
		shortLabel: 'VM Disks (.qcow2/.vmdk/.vdi/.vhdx/.vhd/.img/.raw/.utm/)',
	},
	'iso-ova-installers': {
		id: 'iso-ova-installers',
		label: 'ISO, OVA/OVF & Checksums',
		shortLabel: 'Installers (.iso/.ova/.ovf/.sha256/SHA256SUMS)',
	},
	'container-image-exports': {
		id: 'container-image-exports',
		label: 'OCI / Docker Container Exports',
		shortLabel: 'Containers (.oci.tar/image-layer.tar/docker-save-*.tar/.tar.zst)',
	},
	'vm-snapshot-caches': {
		id: 'vm-snapshot-caches',
		label: 'VM Snapshots, Deltas & Temp Caches',
		shortLabel: 'Snapshots & Temp (*.vmsn/*.vmsd/*.lck/.vagrant/*.vhdx.tmp/*.part)',
	},
})

export const VM_CONTAINER_IMAGE_STRATEGIES = Object.freeze([
	'consolidate-golden-isos',
	'prune-vm-snapshot-deltas',
	'prune-duplicate-container-tarballs',
])

export const VM_CONTAINER_IMAGE_SURVIVOR_RULES = Object.freeze([
	'golden-vault-and-checksum-first',
	'active-vm-disk-first',
	'checksum-sidecar-first',
	'newest-build-first',
	'shortest-path',
])

export const VM_CONTAINER_IMAGE_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'golden-vault',
	'active-vm-disk',
	'checksum-sidecar',
	'iso-container-export',
	'vm-snapshot-delta',
	'shielded',
])

export const VM_CONTAINER_IMAGE_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const VM_CONTAINER_IMAGE_PRESETS = Object.freeze([
	{
		id: 'all-vm-container-image-audit',
		name: 'All VM, ISO & Container Vault Audit',
		description: 'Audit hypervisor disk images, golden ISOs/OVAs, OCI/Docker container tarballs, and VM snapshot/delta caches while shielding golden-iso-vault, active VM disks, and SHA256SUMS.',
		familyFilter: 'all',
		strategy: 'consolidate-golden-isos',
		survivorRule: 'golden-vault-and-checksum-first',
		protectGoldenIsoVault: true,
		protectActiveVmDisks: true,
		protectChecksumSidecars: true,
		keepRecentSnapshots: 2,
		staleCacheDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'consolidate-golden-iso-vault',
		name: 'Consolidate Golden ISO & Appliance Vault',
		description: 'Keep canonical images inside golden-iso-vault/ and consolidate verified stray ISO/OVA/OVF copies from user downloads or staging directories.',
		familyFilter: 'iso-ova-installers',
		strategy: 'consolidate-golden-isos',
		survivorRule: 'golden-vault-and-checksum-first',
		protectGoldenIsoVault: true,
		protectActiveVmDisks: true,
		protectChecksumSidecars: true,
		keepRecentSnapshots: 2,
		staleCacheDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'prune-vm-snapshot-deltas',
		name: 'Prune VM Snapshot Deltas & Locks',
		description: 'Reclaim stale *.vmsn, *.vmsd, *.lck, .vagrant/, *.vhdx.tmp, and *.part files older than threshold while keeping active VM disks and golden vaults untouched.',
		familyFilter: 'vm-snapshot-caches',
		strategy: 'prune-vm-snapshot-deltas',
		survivorRule: 'newest-build-first',
		protectGoldenIsoVault: true,
		protectActiveVmDisks: true,
		protectChecksumSidecars: true,
		keepRecentSnapshots: 2,
		staleCacheDays: 7,
		minSizeMb: 0,
	},
	{
		id: 'prune-duplicate-container-tarballs',
		name: 'Prune Verified Container Tarballs',
		description: 'Reclaim duplicate .oci.tar, image-layer.tar, docker-save-*.tar, and .tar.zst exports only when a verified SHA-256 twin or matching size+hash copy is conserved.',
		familyFilter: 'container-image-exports',
		strategy: 'prune-duplicate-container-tarballs',
		survivorRule: 'golden-vault-and-checksum-first',
		protectGoldenIsoVault: true,
		protectActiveVmDisks: true,
		protectChecksumSidecars: true,
		keepRecentSnapshots: 2,
		staleCacheDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'checksum-sidecar-integrity-shield',
		name: 'Active VM & SHA256SUMS Integrity Shield',
		description: 'Audit VM disk datastores (.qcow2/.vmdk/.vdi/.vhdx/.utm/) and verification sidecars (.sha256/SHA256SUMS) under strict non-destructive protection.',
		familyFilter: 'vm-disk-images',
		strategy: 'consolidate-golden-isos',
		survivorRule: 'active-vm-disk-first',
		protectGoldenIsoVault: true,
		protectActiveVmDisks: true,
		protectChecksumSidecars: true,
		keepRecentSnapshots: 2,
		staleCacheDays: 14,
		minSizeMb: 0,
	},
])

const VM_DISK_EXT_SET = new Set(['qcow2', 'vmdk', 'vdi', 'vhdx', 'vhd', 'img', 'raw'])
const ISO_OVA_EXT_SET = new Set(['iso', 'ova', 'ovf'])
const CHECKSUM_EXT_SET = new Set(['sha256'])
const CONTAINER_EXT_SET = new Set(['oci.tar', 'tar.zst'])
const SNAPSHOT_CACHE_EXT_SET = new Set(['vmsn', 'vmsd', 'lck', 'vhdx.tmp', 'part'])

const GOLDEN_ISO_VAULT_PATH_RE = /(\/(?:golden[-_ ]?iso[-_ ]?vault|golden[-_ ]?images?|iso[-_ ]?vault|master[-_ ]?isos?|appliance[-_ ]?vault|verified[-_ ]?images?)(?:\/|$)|\/__groupfolders\/\d+\/(?:golden[-_ ]?iso[-_ ]?vault|iso[-_ ]?vault|vm[-_ ]?vault))/i
const ACTIVE_VM_DATASTORE_PATH_RE = /(\/(?:vms?|virtual[-_ ]?machines?|libvirt|qemu|proxmox|datastore|vmware|virtualbox|hyper[-_ ]?v|kvm|utm[-_ ]?vms?)(?:\/|$)|\/[^/]+\.utm(?:\/|$))/i
const UTM_BUNDLE_PATH_RE = /\/[^/]+\.utm(?:\/|$)/i
const VAGRANT_CACHE_PATH_RE = /\/\.vagrant(?:\/|$)/i
const LCK_DIR_PATH_RE = /\/[^/]+\.lck(?:\/|$)/i
const STAGING_BLOAT_PATH_RE = /(\/downloads\/|\/telechargements\/|\/tmp\/|\/temp\/|\/scratch\/|\/incoming\/|\/staging\/|\/wetransfer\/|\/airdrop\/)/i

const COPY_SUFFIX_RE = /\s-\s?copy(?:\s*\(\d+\))?|\s*\(\d+\)|_copy\b|\[\d{4}-\d{2}-\d{2}[^\]]*\]/gi
const TRAILING_IMAGE_EXT_RE = /\.(qcow2|vmdk|vdi|vhdx|vhd|img|raw|iso|ova|ovf|oci\.tar|tar\.zst|tar\.gz|tar|vmsn|vmsd|lck|part|tmp)$/i
const LINEAGE_STRIP_TAG_RE = /(?:^|[_\-.\s])(copy|backup|mirror|staging|tmp|temp|part|export|golden|verified)(?=$|[_\-.\s])/gi
const STRICT_SHA256_HEX_RE = /^[a-f0-9]{64}$/i

const TIER_LABELS = Object.freeze({
	'golden-iso-vault': 'Golden ISO Vault',
	'active-vm-disk': 'Active VM Disk',
	'checksum-sidecar': 'SHA-256 Checksum Sidecar',
	'iso-container-export': 'ISO / Container Export',
	'vm-snapshot-delta': 'VM Snapshot / Delta Cache',
})

const TIER_AUTHORITY = Object.freeze({
	'golden-iso-vault': 99,
	'active-vm-disk': 96,
	'checksum-sidecar': 93,
	'iso-container-export': 42,
	'vm-snapshot-delta': 14,
})

const VERDICT_LABELS = Object.freeze({
	'keep-canonical-survivor': 'Keep Canonical Vault Anchor',
	'consolidate-to-golden-vault': 'Consolidate to Vault / Datastore Anchor',
	'reclaim-vm-snapshot-delta': 'Prune Stale VM Snapshot / Temp Cache',
	'reclaim-verified-container-tarball': 'Prune Verified Container Tarball',
	'blocked-golden-iso-vault': 'Blocked: Golden ISO Vault Guard',
	'blocked-active-vm-disk': 'Blocked: Active VM Disk Guard',
	'blocked-checksum-sidecar': 'Blocked: SHA256SUMS Sidecar Guard',
	'blocked-unverified-golden-image': 'Blocked: No Verified SHA-256 Twin Conserved',
	'blocked-not-vm-snapshot': 'Shielded: Non-Snapshot VM Asset',
	'blocked-not-container-tarball': 'Shielded: Non-Container Export Asset',
	'blocked-fresh-vm-snapshot': 'Shielded: Recent VM Snapshot / Delta',
	'blocked-manual-shield': 'Blocked: Operator Shield',
	excluded: 'Excluded by Operator',
})

const FAMILY_PRIORITY = Object.freeze({
	'vm-disk-images': 4,
	'iso-ova-installers': 3,
	'container-image-exports': 2,
	'vm-snapshot-caches': 1,
})

/**
 * Quote a POSIX shell argument safely using single quotes.
 *
 * @param {string} value Raw string value.
 * @return {string} Single-quoted POSIX literal.
 */
export function escapePosixSingleQuote(value) {
	return `'${String(value ?? '').replace(/'/g, "'\\''")}'`
}

/**
 * Parse a timestamp field into epoch seconds.
 *
 * @param {*} value Candidate timestamp value.
 * @return {number|null} Epoch seconds or null when missing or invalid.
 */
function parseTimestampSeconds(value) {
	if (value === null || value === undefined || value === '') {
		return null
	}
	if (value instanceof Date) {
		const ms = value.getTime()
		return Number.isFinite(ms) ? Math.floor(ms / 1000) : null
	}
	if (typeof value === 'number') {
		if (!Number.isFinite(value) || value < 0) {
			return null
		}
		return value > 1e12 ? Math.floor(value / 1000) : Math.floor(value)
	}
	if (typeof value === 'string') {
		const trimmed = value.trim()
		if (!trimmed) {
			return null
		}
		if (/^\d+(\.\d+)?$/.test(trimmed)) {
			const n = Number(trimmed)
			if (!Number.isFinite(n) || n < 0) {
				return null
			}
			return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n)
		}
		const parsed = Date.parse(trimmed)
		return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null
	}
	return null
}

/**
 * Extract the best available modification timestamp from a duplicate file record.
 *
 * @param {object} file Duplicate file entry.
 * @return {number|null} Epoch seconds or null.
 */
function getFileMtimeSeconds(file) {
	if (!file || typeof file !== 'object') {
		return null
	}
	for (const field of ['mtime', 'modified', 'updatedAt', 'lastModified']) {
		if (Object.prototype.hasOwnProperty.call(file, field)) {
			const ts = parseTimestampSeconds(file[field])
			if (ts !== null) {
				return ts
			}
		}
	}
	return null
}

/**
 * Extract basename from a normalized file path.
 *
 * @param {string} normalizedPath Normalized path.
 * @return {string} File basename.
 */
function extractBasename(normalizedPath) {
	const raw = String(normalizedPath || '').replace(/\/+$/, '')
	const idx = raw.lastIndexOf('/')
	return idx === -1 ? raw : raw.slice(idx + 1)
}

/**
 * Extract parent directory from a normalized file path.
 *
 * @param {string} normalizedPath Normalized path.
 * @return {string} Lowercase parent directory path or '/'.
 */
function extractParentDir(normalizedPath) {
	const raw = String(normalizedPath || '').replace(/\/+$/, '')
	const idx = raw.lastIndexOf('/')
	if (idx <= 0) {
		return '/'
	}
	return raw.slice(0, idx).toLowerCase()
}

/**
 * Extract compound or single lowercase extension without leading dot.
 *
 * @param {string} lowerBase Lowercase basename.
 * @return {string} Extension string or empty string.
 */
function extractCompoundExtension(lowerBase) {
	for (const compound of ['vhdx.tmp', 'oci.tar', 'tar.zst', 'tar.gz']) {
		if (lowerBase.endsWith(`.${compound}`)) {
			return compound
		}
	}
	const lastDot = lowerBase.lastIndexOf('.')
	if (lastDot <= 0 || lastDot >= lowerBase.length - 1) {
		return ''
	}
	return lowerBase.slice(lastDot + 1)
}

/**
 * Normalize an image or container stem into a canonical imageLineageStem.
 *
 * @param {string} rawStem Raw stem without outer extension.
 * @return {string} Clean canonical imageLineageStem.
 */
function normalizeImageLineageStem(rawStem) {
	let stem = String(rawStem || '')
		.replace(COPY_SUFFIX_RE, '')
		.trim()

	let prev
	do {
		prev = stem
		stem = stem.replace(TRAILING_IMAGE_EXT_RE, '')
	} while (stem !== prev)

	do {
		prev = stem
		stem = stem.replace(LINEAGE_STRIP_TAG_RE, '')
	} while (stem !== prev)

	stem = stem
		.replace(/[-_.\s]{2,}/g, '-')
		.replace(/^[\s_.-]+|[\s_.-]+$/g, '')

	return stem || String(rawStem || '').replace(COPY_SUFFIX_RE, '').trim()
}

/**
 * Check whether a basename matches a SHA256SUMS manifest file.
 *
 * @param {string} lowerBase Lowercase basename.
 * @return {boolean} True when file is a SHA256SUMS manifest.
 */
function isSha256SumsBasename(lowerBase) {
	return lowerBase === 'sha256sums' || lowerBase === 'sha256sums.txt' || lowerBase === 'sha256sums.asc'
}

/**
 * Check whether a basename matches an OCI/Docker container export pattern.
 *
 * @param {string} lowerBase Lowercase basename.
 * @param {string} ext Extracted extension.
 * @return {boolean} True when file matches container export rules.
 */
function matchesContainerExportPattern(lowerBase, ext) {
	if (CONTAINER_EXT_SET.has(ext)) {
		return true
	}
	if (lowerBase === 'image-layer.tar' || (/^image-layer[-_.]/.test(lowerBase) && lowerBase.endsWith('.tar'))) {
		return true
	}
	if (/^docker-save-.+\.tar(?:\.(?:gz|zst|xz))?$/.test(lowerBase)) {
		return true
	}
	return false
}

/**
 * Parse VM disk, ISO/OVA/OVF, checksum sidecar, container export, and VM snapshot metadata.
 *
 * @param {string} basename File basename.
 * @param {string} [normalizedPath=''] Normalized file path.
 * @return {object} Parsed imageLineageStem, tags, format flags, and governance cues.
 */
export function parseVmContainerArtifactInfo(basename, normalizedPath = '') {
	const rawBase = String(basename || '')
	const lowerBase = rawBase.toLowerCase()
	const lowerPath = String(normalizedPath || '').toLowerCase()

	const ext = extractCompoundExtension(lowerBase)
	let rawStem = rawBase
	if (ext && lowerBase.endsWith(`.${ext}`)) {
		rawStem = rawBase.slice(0, rawBase.length - ext.length - 1)
	}
	const cleanRawStem = rawStem.replace(COPY_SUFFIX_RE, '').trim() || rawStem

	const isGoldenIsoVaultPath = GOLDEN_ISO_VAULT_PATH_RE.test(lowerPath)
	const isActiveVmDatastorePath = ACTIVE_VM_DATASTORE_PATH_RE.test(lowerPath)
	const isUtmBundlePath = UTM_BUNDLE_PATH_RE.test(lowerPath) || ext === 'utm'
	const isVagrantCachePath = VAGRANT_CACHE_PATH_RE.test(lowerPath)
	const isLockDirPath = LCK_DIR_PATH_RE.test(lowerPath)
	const isStagingBloatPath = STAGING_BLOAT_PATH_RE.test(lowerPath)

	const isSnapshotCacheExt = SNAPSHOT_CACHE_EXT_SET.has(ext)
	const isChecksumSidecar = CHECKSUM_EXT_SET.has(ext) || isSha256SumsBasename(lowerBase)
	const isContainerExportExt = matchesContainerExportPattern(lowerBase, ext)
	const isIsoOvaExt = ISO_OVA_EXT_SET.has(ext)
	const isVmDiskExt = VM_DISK_EXT_SET.has(ext)

	const isVmSnapshotDeltaCandidate = Boolean(
		isSnapshotCacheExt
		|| isVagrantCachePath
		|| isLockDirPath
	)
	const isContainerExportCandidate = Boolean(
		!isVmSnapshotDeltaCandidate
		&& !isChecksumSidecar
		&& isContainerExportExt
	)
	const isIsoInstallerCandidate = Boolean(
		!isVmSnapshotDeltaCandidate
		&& !isContainerExportCandidate
		&& (isIsoOvaExt || isChecksumSidecar)
	)
	const isVmDiskCandidate = Boolean(
		!isVmSnapshotDeltaCandidate
		&& !isContainerExportCandidate
		&& !isIsoInstallerCandidate
		&& (isVmDiskExt || isUtmBundlePath)
	)

	const imageLineageStem = isSha256SumsBasename(lowerBase)
		? 'SHA256SUMS'
		: (normalizeImageLineageStem(cleanRawStem) || cleanRawStem || rawBase)

	const artifactTags = []
	const pushTag = tag => {
		const norm = String(tag || '').trim()
		if (norm && !artifactTags.includes(norm)) {
			artifactTags.push(norm)
		}
	}

	if (isVmDiskCandidate) {
		pushTag(ext ? `vm-disk:${ext}` : 'vm-disk:utm')
		if (isUtmBundlePath) {
			pushTag('bundle:utm')
		}
	}
	if (isIsoOvaExt) {
		pushTag(`installer:${ext}`)
	}
	if (isChecksumSidecar) {
		pushTag(isSha256SumsBasename(lowerBase) ? 'checksum:SHA256SUMS' : 'checksum:sha256')
	}
	if (isContainerExportCandidate) {
		if (lowerBase.startsWith('docker-save-')) {
			pushTag('container:docker-save')
		} else if (lowerBase.includes('image-layer')) {
			pushTag('container:image-layer')
		} else if (ext) {
			pushTag(`container:${ext}`)
		}
	}
	if (isVmSnapshotDeltaCandidate) {
		if (isVagrantCachePath) {
			pushTag('cache:vagrant')
		} else if (isLockDirPath || ext === 'lck') {
			pushTag('lock:lck')
		} else if (ext) {
			pushTag(`snapshot:${ext}`)
		}
	}
	if (isGoldenIsoVaultPath) {
		pushTag('golden-iso-vault')
	}

	return {
		rawStem: cleanRawStem,
		imageLineageStem,
		extension: ext || (isUtmBundlePath ? 'utm' : ''),
		artifactTags,
		artifactTag: artifactTags.length > 0 ? artifactTags.join(', ') : 'none',
		isGoldenIsoVaultPath,
		isActiveVmDatastorePath,
		isUtmBundlePath,
		isVagrantCachePath,
		isLockDirPath,
		isStagingBloatPath,
		isSnapshotCacheExt,
		isChecksumSidecar,
		isContainerExportExt,
		isIsoOvaExt,
		isVmDiskExt,
		isVmSnapshotDeltaCandidate,
		isContainerExportCandidate,
		isIsoInstallerCandidate,
		isVmDiskCandidate,
	}
}

/**
 * Build dataset-wide verification hints for conserved SHA-256 checksums and golden-iso-vault twins.
 * Respects operator exclude overrides so excluded checksums or vault anchors are not counted as conserved.
 *
 * @param {Array<object>} duplicates Loaded duplicate groups.
 * @param {object} [memberOverrides={}] Operator member overrides keyed by selectionKey.
 * @return {object} Dataset verification hints.
 */
function buildDatasetVmContainerHints(duplicates, memberOverrides = {}) {
	const checksumStems = new Set()
	const checksumFolders = new Set()
	const goldenVaultStems = new Set()

	for (let groupIdx = 0; groupIdx < duplicates.length; groupIdx += 1) {
		const group = duplicates[groupIdx]
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (let fileIdx = 0; fileIdx < group.files.length; fileIdx += 1) {
			const file = group.files[fileIdx]
			if (!file || typeof file !== 'object' || !file.path) {
				continue
			}
			const selectionKey = String(getFileSelectionKey(file) ?? `${groupIdx}-${fileIdx}`)
			if (memberOverrides[selectionKey] === 'exclude') {
				continue
			}

			const normalized = normalizePathForDiff(file.path) || String(file.path)
			const info = parseVmContainerArtifactInfo(extractBasename(normalized), normalized)
			const stemLower = info.imageLineageStem.toLowerCase()
			const parentDir = extractParentDir(normalized)

			if (info.isChecksumSidecar && !info.isStagingBloatPath) {
				checksumFolders.add(parentDir)
				if (stemLower && stemLower !== 'sha256sums') {
					checksumStems.add(stemLower)
				}
			}

			if (
				!info.isVmSnapshotDeltaCandidate
				&& !info.isStagingBloatPath
				&& (info.isGoldenIsoVaultPath || file.isGoldenIsoVault === true)
				&& stemLower
			) {
				goldenVaultStems.add(stemLower)
			}
		}
	}

	return {
		checksumStems,
		checksumFolders,
		goldenVaultStems,
	}
}

/**
 * Classify a file path into one of the 4 VM, ISO & Container Image Vault families.
 *
 * @param {string} rawPath File path.
 * @return {object|null} Classification metadata or null for unrelated files.
 */
export function classifyVmContainerArtifact(rawPath) {
	const normalized = normalizePathForDiff(rawPath) || String(rawPath || '')
	const basename = extractBasename(normalized)
	const lowerBase = basename.toLowerCase()

	if (!lowerBase) {
		return null
	}

	const info = parseVmContainerArtifactInfo(basename, normalized)

	if (info.isVmSnapshotDeltaCandidate) {
		return {
			matched: true,
			family: 'vm-snapshot-caches',
			familyLabel: VM_CONTAINER_IMAGE_FAMILY_META['vm-snapshot-caches'].label,
			...info,
		}
	}

	if (info.isContainerExportCandidate) {
		return {
			matched: true,
			family: 'container-image-exports',
			familyLabel: VM_CONTAINER_IMAGE_FAMILY_META['container-image-exports'].label,
			...info,
		}
	}

	if (info.isIsoInstallerCandidate) {
		return {
			matched: true,
			family: 'iso-ova-installers',
			familyLabel: VM_CONTAINER_IMAGE_FAMILY_META['iso-ova-installers'].label,
			...info,
		}
	}

	if (info.isVmDiskCandidate) {
		return {
			matched: true,
			family: 'vm-disk-images',
			familyLabel: VM_CONTAINER_IMAGE_FAMILY_META['vm-disk-images'].label,
			...info,
		}
	}

	return null
}

/**
 * Inspect governance tier, SHA-256 verification status, and authority context for a cluster member.
 *
 * @param {object} file Duplicate file entry.
 * @param {object} classification Classification metadata.
 * @param {number} referenceTimeSec Reference epoch seconds.
 * @param {object} options Normalized options (keepRecentSnapshots, staleCacheDays).
 * @param {object} [clusterHints={}] Dataset and cluster SHA-256 verification hints.
 * @return {object} Member governance and verification context.
 */
export function inspectVmContainerMemberContext(file, classification, referenceTimeSec, options, clusterHints = {}) {
	const normalizedPath = normalizePathForDiff(file && file.path) || String((file && file.path) || '')
	const basename = extractBasename(normalizedPath)
	const parsed = parseVmContainerArtifactInfo(basename, normalizedPath)
	const parentDir = extractParentDir(normalizedPath)
	const mtimeSec = getFileMtimeSeconds(file)
	const ageDays = mtimeSec !== null && Number.isFinite(referenceTimeSec)
		? Math.max(0, Math.floor((referenceTimeSec - mtimeSec) / 86400))
		: null

	const isVmSnapshotDelta = Boolean(
		parsed.isVmSnapshotDeltaCandidate
		|| classification.family === 'vm-snapshot-caches'
	)

	const isChecksumSidecar = Boolean(
		!isVmSnapshotDelta
		&& parsed.isChecksumSidecar
	)

	const isGoldenIsoVault = Boolean(
		!isVmSnapshotDelta
		&& !isChecksumSidecar
		&& !parsed.isStagingBloatPath
		&& (parsed.isGoldenIsoVaultPath || (file && file.isGoldenIsoVault === true))
	)

	const isActiveVmDisk = Boolean(
		!isVmSnapshotDelta
		&& !isChecksumSidecar
		&& !isGoldenIsoVault
		&& !parsed.isStagingBloatPath
		&& (
			parsed.isVmDiskCandidate
			|| (file && file.isActiveVmDisk === true)
		)
	)

	const isContainerExport = Boolean(
		!isVmSnapshotDelta
		&& !isChecksumSidecar
		&& (parsed.isContainerExportCandidate || classification.family === 'container-image-exports')
	)

	const isIsoOrContainerExport = Boolean(
		!isVmSnapshotDelta
		&& !isChecksumSidecar
		&& !isActiveVmDisk
		&& (
			parsed.isIsoOvaExt
			|| isContainerExport
			|| classification.family === 'iso-ova-installers'
			|| classification.family === 'container-image-exports'
		)
	)

	const stemLower = parsed.imageLineageStem.toLowerCase()
	const hasConservedChecksumSidecar = Boolean(
		isChecksumSidecar
		|| (stemLower && clusterHints.checksumStems && clusterHints.checksumStems.has(stemLower))
		|| (clusterHints.checksumFolders && clusterHints.checksumFolders.has(parentDir))
	)

	const hasConservedGoldenVaultTwin = Boolean(
		isGoldenIsoVault
		|| clusterHints.clusterHasConservedGoldenVault
		|| (stemLower && clusterHints.goldenVaultStems && clusterHints.goldenVaultStems.has(stemLower))
	)

	const hasConservedSizeAndHashTwin = Boolean(
		(file && (file.sha256Verified === true || file.sizeHashVerified === true))
		|| clusterHints.clusterHasVerifiedSizeAndHash
	)

	const hasVerifiedGoldenTwin = Boolean(
		hasConservedChecksumSidecar
		|| hasConservedGoldenVaultTwin
		|| hasConservedSizeAndHashTwin
	)

	const isStaleSnapshotCache = Boolean(
		isVmSnapshotDelta
		&& (ageDays === null || ageDays >= options.staleCacheDays)
	)

	let tier = 'vm-snapshot-delta'
	if (isGoldenIsoVault) {
		tier = 'golden-iso-vault'
	} else if (isActiveVmDisk) {
		tier = 'active-vm-disk'
	} else if (isChecksumSidecar) {
		tier = 'checksum-sidecar'
	} else if (isIsoOrContainerExport) {
		tier = 'iso-container-export'
	} else {
		tier = 'vm-snapshot-delta'
	}

	let authorityScore = TIER_AUTHORITY[tier] || 30
	if (isGoldenIsoVault) {
		authorityScore = 99
	} else if (isActiveVmDisk && parsed.isActiveVmDatastorePath) {
		authorityScore = 97
	}
	if (isChecksumSidecar && parsed.isGoldenIsoVaultPath) {
		authorityScore += 2
	}
	if (hasConservedChecksumSidecar && isIsoOrContainerExport) {
		authorityScore += 8
	}
	if (parsed.isStagingBloatPath) {
		authorityScore -= 18
	}
	if (isStaleSnapshotCache) {
		authorityScore -= 6
	}

	return {
		tier,
		tierLabel: TIER_LABELS[tier] || TIER_LABELS['vm-snapshot-delta'],
		authorityScore,
		extension: parsed.extension || classification.extension || '',
		rawStem: parsed.rawStem,
		imageLineageStem: parsed.imageLineageStem,
		artifactTags: parsed.artifactTags,
		artifactTag: parsed.artifactTag,
		isGoldenIsoVault,
		isActiveVmDisk,
		isChecksumSidecar,
		isContainerExport,
		isIsoOrContainerExport,
		isVmSnapshotDelta,
		hasConservedChecksumSidecar,
		hasConservedGoldenVaultTwin,
		hasConservedSizeAndHashTwin,
		hasVerifiedGoldenTwin,
		isStaleSnapshotCache,
		isStagingBloatPath: parsed.isStagingBloatPath,
		mtimeSec,
		ageDays,
	}
}

/**
 * Select the canonical surviving copy inside a VM, ISO & Container duplicate cluster.
 *
 * @param {Array<object>} members Enriched cluster members.
 * @param {string} survivorRule Survivor selection rule.
 * @param {Set<string>} excludeKeys Excluded member keys.
 * @return {object|null} Selected canonical survivor or null.
 */
function selectClusterSurvivor(members, survivorRule, excludeKeys) {
	if (!Array.isArray(members) || members.length === 0) {
		return null
	}
	const eligible = members.filter(m => !excludeKeys.has(m.selectionKey))
	const pool = eligible.length > 0 ? eligible : members

	const sorted = [...pool].sort((a, b) => {
		if (survivorRule === 'active-vm-disk-first') {
			if (a.context.isActiveVmDisk !== b.context.isActiveVmDisk) {
				return a.context.isActiveVmDisk ? -1 : 1
			}
			if (a.context.authorityScore !== b.context.authorityScore) {
				return b.context.authorityScore - a.context.authorityScore
			}
		} else if (survivorRule === 'checksum-sidecar-first') {
			if (a.context.isChecksumSidecar !== b.context.isChecksumSidecar) {
				return a.context.isChecksumSidecar ? -1 : 1
			}
			if (a.context.authorityScore !== b.context.authorityScore) {
				return b.context.authorityScore - a.context.authorityScore
			}
		} else if (survivorRule === 'newest-build-first') {
			const tsA = a.context.mtimeSec ?? -1
			const tsB = b.context.mtimeSec ?? -1
			if (tsA !== tsB) {
				return tsB - tsA
			}
			if (a.context.authorityScore !== b.context.authorityScore) {
				return b.context.authorityScore - a.context.authorityScore
			}
		} else if (survivorRule === 'shortest-path') {
			if (a.normalizedPath.length !== b.normalizedPath.length) {
				return a.normalizedPath.length - b.normalizedPath.length
			}
			if (a.context.authorityScore !== b.context.authorityScore) {
				return b.context.authorityScore - a.context.authorityScore
			}
		} else {
			if (a.context.authorityScore !== b.context.authorityScore) {
				return b.context.authorityScore - a.context.authorityScore
			}
		}

		const tsA = a.context.mtimeSec ?? 0
		const tsB = b.context.mtimeSec ?? 0
		if (tsA !== tsB) {
			return tsB - tsA
		}
		return a.normalizedPath.localeCompare(b.normalizedPath)
	})

	return sorted[0] || null
}

/**
 * Determine the deterministic audit verdict for a VM, ISO & Container cluster member.
 *
 * @param {object} member Enriched member object.
 * @param {object|null} survivor Selected canonical survivor.
 * @param {object} options Normalized analysis options.
 * @param {Set<string>} forceKeepKeys Operator force-keep keys.
 * @param {Set<string>} excludeKeys Operator exclude keys.
 * @return {{ verdict: string, verdictLabel: string, actionKind: string, note: string }}
 */
function resolveMemberVerdict(member, survivor, options, forceKeepKeys, excludeKeys) {
	if (excludeKeys.has(member.selectionKey)) {
		return {
			verdict: 'excluded',
			verdictLabel: VERDICT_LABELS.excluded,
			actionKind: 'exclude',
			note: 'Excluded from VM, ISO and container vault audit actions by manual operator override.',
		}
	}

	if (survivor && member.selectionKey === survivor.selectionKey) {
		return {
			verdict: 'keep-canonical-survivor',
			verdictLabel: VERDICT_LABELS['keep-canonical-survivor'],
			actionKind: 'keep',
			note: `Canonical ${member.context.tierLabel} copy retained as the authoritative infrastructure anchor.`,
		}
	}

	if (forceKeepKeys.has(member.selectionKey)) {
		return {
			verdict: 'blocked-manual-shield',
			verdictLabel: VERDICT_LABELS['blocked-manual-shield'],
			actionKind: 'shield',
			note: 'Protected by manual Shield Copy override.',
		}
	}

	if (options.protectGoldenIsoVault && member.context.isGoldenIsoVault) {
		return {
			verdict: 'blocked-golden-iso-vault',
			verdictLabel: VERDICT_LABELS['blocked-golden-iso-vault'],
			actionKind: 'shield',
			note: 'Strictly protected by Golden ISO Vault Guard; golden-iso-vault images are never pruned automatically.',
		}
	}

	if (options.protectActiveVmDisks && member.context.isActiveVmDisk) {
		return {
			verdict: 'blocked-active-vm-disk',
			verdictLabel: VERDICT_LABELS['blocked-active-vm-disk'],
			actionKind: 'shield',
			note: 'Strictly protected by Active VM Disk Guard; datastore disks and .utm bundles are conserved.',
		}
	}

	if (options.protectChecksumSidecars && member.context.isChecksumSidecar) {
		return {
			verdict: 'blocked-checksum-sidecar',
			verdictLabel: VERDICT_LABELS['blocked-checksum-sidecar'],
			actionKind: 'shield',
			note: 'Strictly protected by SHA256SUMS Sidecar Guard; cryptographic checksum manifests are conserved.',
		}
	}

	if (options.strategy === 'prune-vm-snapshot-deltas') {
		if (!member.context.isVmSnapshotDelta) {
			return {
				verdict: 'blocked-not-vm-snapshot',
				verdictLabel: VERDICT_LABELS['blocked-not-vm-snapshot'],
				actionKind: 'shield',
				note: 'Shielded by VM Snapshot & Delta Pruner because member is not a reconstructible snapshot, lock, .vagrant cache, or temp file.',
			}
		}
		if (!member.context.isStaleSnapshotCache) {
			return {
				verdict: 'blocked-fresh-vm-snapshot',
				verdictLabel: VERDICT_LABELS['blocked-fresh-vm-snapshot'],
				actionKind: 'shield',
				note: `Shielded because snapshot or temp cache age is below stale threshold (${options.staleCacheDays}d).`,
			}
		}
		return {
			verdict: 'reclaim-vm-snapshot-delta',
			verdictLabel: VERDICT_LABELS['reclaim-vm-snapshot-delta'],
			actionKind: 'reclaim',
			note: 'Stale VM snapshot delta, lock file, .vagrant cache, .vhdx.tmp, or .part file safe to prune after SHA-256 verification.',
		}
	}

	if (options.strategy === 'prune-duplicate-container-tarballs') {
		if (!member.context.isContainerExport) {
			return {
				verdict: 'blocked-not-container-tarball',
				verdictLabel: VERDICT_LABELS['blocked-not-container-tarball'],
				actionKind: 'shield',
				note: 'Shielded by Container Tarball Pruner because member is not an OCI/Docker container export (.oci.tar, image-layer.tar, docker-save-*.tar, .tar.zst).',
			}
		}
		if (!member.context.hasVerifiedGoldenTwin) {
			return {
				verdict: 'blocked-unverified-golden-image',
				verdictLabel: VERDICT_LABELS['blocked-unverified-golden-image'],
				actionKind: 'shield',
				note: 'Blocked because no verified SHA-256 sidecar, golden-iso-vault anchor, or matching size+hash copy is conserved.',
			}
		}
		return {
			verdict: 'reclaim-verified-container-tarball',
			verdictLabel: VERDICT_LABELS['reclaim-verified-container-tarball'],
			actionKind: 'reclaim',
			note: 'Duplicate OCI/Docker container export with a conserved verified SHA-256 twin; safe to prune after digest check.',
		}
	}

	if (member.context.isIsoOrContainerExport && !member.context.hasVerifiedGoldenTwin) {
		return {
			verdict: 'blocked-unverified-golden-image',
			verdictLabel: VERDICT_LABELS['blocked-unverified-golden-image'],
			actionKind: 'shield',
			note: 'Blocked because no verified SHA-256 sidecar, golden-iso-vault anchor, or matching size+hash copy is conserved.',
		}
	}

	if (member.context.isVmSnapshotDelta) {
		if (!member.context.isStaleSnapshotCache) {
			return {
				verdict: 'blocked-fresh-vm-snapshot',
				verdictLabel: VERDICT_LABELS['blocked-fresh-vm-snapshot'],
				actionKind: 'shield',
				note: `Shielded because snapshot or temp cache age is below stale threshold (${options.staleCacheDays}d).`,
			}
		}
		return {
			verdict: 'reclaim-vm-snapshot-delta',
			verdictLabel: VERDICT_LABELS['reclaim-vm-snapshot-delta'],
			actionKind: 'reclaim',
			note: 'Stale VM snapshot delta, lock file, .vagrant cache, .vhdx.tmp, or .part file safe to prune after SHA-256 verification.',
		}
	}

	return {
		verdict: 'consolidate-to-golden-vault',
		verdictLabel: VERDICT_LABELS['consolidate-to-golden-vault'],
		actionKind: 'consolidate',
		note: 'Consolidate verified identical-hash copy against canonical Golden ISO Vault or Active Datastore anchor using SHA-256 and stat device checks.',
	}
}

/**
 * Normalize VM, ISO & Container Image Vault auditor options into deterministic bounds.
 *
 * @param {object} [rawOptions] Caller options.
 * @return {object} Normalized options.
 */
function normalizeOptions(rawOptions = {}) {
	const familyFilter = VM_CONTAINER_IMAGE_FAMILIES.includes(rawOptions.familyFilter)
		? rawOptions.familyFilter
		: 'all'
	const verdictFilter = VM_CONTAINER_IMAGE_VERDICT_FILTERS.includes(rawOptions.verdictFilter)
		? rawOptions.verdictFilter
		: 'all'
	const sortMode = VM_CONTAINER_IMAGE_SORT_MODES.includes(rawOptions.sortMode)
		? rawOptions.sortMode
		: 'reclaim_desc'
	const strategy = VM_CONTAINER_IMAGE_STRATEGIES.includes(rawOptions.strategy)
		? rawOptions.strategy
		: 'consolidate-golden-isos'
	const survivorRule = VM_CONTAINER_IMAGE_SURVIVOR_RULES.includes(rawOptions.survivorRule)
		? rawOptions.survivorRule
		: 'golden-vault-and-checksum-first'

	const parsedKeep = Number.parseInt(rawOptions.keepRecentSnapshots, 10)
	const keepRecentSnapshots = Number.isFinite(parsedKeep) && parsedKeep >= 1
		? Math.min(parsedKeep, 100)
		: 2

	const parsedDays = Number.parseInt(rawOptions.staleCacheDays, 10)
	const staleCacheDays = Number.isFinite(parsedDays) && parsedDays >= 0
		? Math.min(parsedDays, 3650)
		: 14

	const parsedMinMb = Number.parseFloat(rawOptions.minSizeMb)
	const minSizeMb = Number.isFinite(parsedMinMb) && parsedMinMb >= 0
		? parsedMinMb
		: 0

	const refTime = Number(rawOptions.referenceTimeSec)
	const referenceTimeSec = Number.isFinite(refTime) && refTime > 0
		? Math.floor(refTime)
		: Math.floor(Date.now() / 1000)

	return {
		familyFilter,
		verdictFilter,
		sortMode,
		strategy,
		survivorRule,
		protectGoldenIsoVault: rawOptions.protectGoldenIsoVault !== false,
		protectActiveVmDisks: rawOptions.protectActiveVmDisks !== false,
		protectChecksumSidecars: rawOptions.protectChecksumSidecars !== false,
		keepRecentSnapshots,
		staleCacheDays,
		minSizeMb,
		searchQuery: String(rawOptions.searchQuery || '').trim().toLowerCase(),
		referenceTimeSec,
		memberOverrides: rawOptions.memberOverrides && typeof rawOptions.memberOverrides === 'object'
			? rawOptions.memberOverrides
			: {},
	}
}

/**
 * Audit duplicate groups for VM Disks, ISO/OVA Installers, Checksum Sidecars, OCI/Docker Containers & VM Snapshots.
 *
 * @param {Array<object>} duplicates Loaded duplicate groups.
 * @param {object} [rawOptions] Auditor configuration options.
 * @return {object} Deterministic audit analysis with summary, counts, and clusters.
 */
export function analyzeVmContainerImageDuplicates(duplicates, rawOptions = {}) {
	const options = normalizeOptions(rawOptions)
	const safeDuplicates = Array.isArray(duplicates) ? duplicates : []
	const minSizeBytes = options.minSizeMb * 1024 * 1024

	const datasetHints = buildDatasetVmContainerHints(safeDuplicates, options.memberOverrides)

	const familyCounts = {
		all: 0,
		'vm-disk-images': 0,
		'iso-ova-installers': 0,
		'container-image-exports': 0,
		'vm-snapshot-caches': 0,
	}

	const rawClusters = []

	for (let groupIdx = 0; groupIdx < safeDuplicates.length; groupIdx += 1) {
		const group = safeDuplicates[groupIdx]
		if (!group || !Array.isArray(group.files) || group.files.length < 2) {
			continue
		}

		const validFiles = group.files.filter(f => f && typeof f === 'object')
		if (validFiles.length < 2) {
			continue
		}

		const matchedEntries = []
		for (let fileIdx = 0; fileIdx < validFiles.length; fileIdx += 1) {
			const file = validFiles[fileIdx]
			const info = classifyVmContainerArtifact(file.path)
			if (info && info.matched) {
				matchedEntries.push({ file, fileIdx, info })
			}
		}

		if (matchedEntries.length === 0) {
			continue
		}

		const primaryEntry = [...matchedEntries].sort((a, b) => {
			return (FAMILY_PRIORITY[b.info.family] || 0) - (FAMILY_PRIORITY[a.info.family] || 0)
		})[0]
		const primaryInfo = primaryEntry.info

		const rawInfo = computeGroupReclaimableInfo(group)
		const groupSizeBytes = Number(group.size) || validFiles.reduce((max, f) => Math.max(max, Number(f.size) || 0), 0)
		if (minSizeBytes > 0 && groupSizeBytes < minSizeBytes) {
			continue
		}

		const nonExcludedFiles = validFiles.filter((file, fileIdx) => {
			const selectionKey = String(getFileSelectionKey(file) ?? `${groupIdx}-${fileIdx}`)
			return options.memberOverrides[selectionKey] !== 'exclude'
		})

		const clusterHasConservedGoldenVault = nonExcludedFiles.some(file => {
			const normalized = normalizePathForDiff(file.path) || String(file.path || '')
			const parsed = parseVmContainerArtifactInfo(extractBasename(normalized), normalized)
			return Boolean(
				!parsed.isVmSnapshotDeltaCandidate
				&& !parsed.isStagingBloatPath
				&& (parsed.isGoldenIsoVaultPath || file.isGoldenIsoVault === true)
			)
		})

		const groupHashStr = String(group.hash || '').trim()
		const hasStrictGroupSha256 = STRICT_SHA256_HEX_RE.test(groupHashStr) || group.sha256Verified === true
		const nonStagingConservedWithSize = nonExcludedFiles.filter(file => {
			const normalized = normalizePathForDiff(file.path) || String(file.path || '')
			const parsed = parseVmContainerArtifactInfo(extractBasename(normalized), normalized)
			const fileSize = Number.isFinite(Number(file.size)) ? Number(file.size) : groupSizeBytes
			return Boolean(!parsed.isStagingBloatPath && fileSize > 0 && (groupSizeBytes <= 0 || fileSize === groupSizeBytes))
		})
		const clusterHasVerifiedSizeAndHash = Boolean(
			(hasStrictGroupSha256 && nonStagingConservedWithSize.length >= 1)
			|| nonStagingConservedWithSize.some(file => file.sha256Verified === true || file.sizeHashVerified === true)
		)

		const forceKeepKeys = new Set()
		const excludeKeys = new Set()

		const members = validFiles.map((file, fileIdx) => {
			const normalizedPath = normalizePathForDiff(file.path) || String(file.path || '')
			const basename = extractBasename(normalizedPath)
			const selectionKey = String(getFileSelectionKey(file) ?? `${groupIdx}-${fileIdx}`)
			const override = options.memberOverrides[selectionKey] || 'auto'
			if (override === 'force-keep') {
				forceKeepKeys.add(selectionKey)
			} else if (override === 'exclude') {
				excludeKeys.add(selectionKey)
			}

			const directInfo = classifyVmContainerArtifact(file.path)
			const memberInfo = directInfo && directInfo.matched ? directInfo : primaryInfo
			const context = inspectVmContainerMemberContext(
				file,
				memberInfo,
				options.referenceTimeSec,
				options,
				{
					...datasetHints,
					clusterHasConservedGoldenVault,
					clusterHasVerifiedSizeAndHash,
				}
			)
			const size = Number.isFinite(Number(file.size)) ? Number(file.size) : groupSizeBytes
			const formattedMtime = formatFileModifiedTime(context.mtimeSec !== null ? context.mtimeSec : file.mtime)

			return {
				selectionKey,
				fileId: file.id ?? null,
				rawPath: String(file.path || ''),
				normalizedPath,
				basename,
				extension: context.extension || memberInfo.extension,
				family: memberInfo.family,
				familyLabel: memberInfo.familyLabel,
				size,
				formattedSize: formatBytes(size),
				formattedMtime,
				override,
				tier: context.tier,
				tierLabel: context.tierLabel,
				context,
			}
		})

		const survivor = selectClusterSurvivor(members, options.survivorRule, excludeKeys)
		for (const member of members) {
			const verdictInfo = resolveMemberVerdict(member, survivor, options, forceKeepKeys, excludeKeys)
			member.role = survivor && member.selectionKey === survivor.selectionKey ? 'survivor' : 'duplicate'
			member.verdict = verdictInfo.verdict
			member.verdictLabel = verdictInfo.verdictLabel
			member.actionKind = verdictInfo.actionKind
			member.note = verdictInfo.note
		}

		const reclaimableMembers = members.filter(m => m.actionKind === 'reclaim' || m.actionKind === 'consolidate')
		const reclaimableBytes = reclaimableMembers.reduce((sum, m) => sum + m.size, 0)
		const reclaimableCopiesCount = reclaimableMembers.length
		const shieldedCopiesCount = members.filter(m => m.actionKind === 'shield').length
		const goldenVaultCopiesCount = members.filter(m => m.context.isGoldenIsoVault).length
		const activeVmDiskCopiesCount = members.filter(m => m.context.isActiveVmDisk).length
		const checksumSidecarCopiesCount = members.filter(m => m.context.isChecksumSidecar).length
		const isoContainerExportCopiesCount = members.filter(m => m.context.isIsoOrContainerExport).length
		const vmSnapshotDeltaCopiesCount = members.filter(m => m.context.isVmSnapshotDelta).length

		const hasGoldenIsoVault = goldenVaultCopiesCount > 0
		const hasActiveVmDisk = activeVmDiskCopiesCount > 0
		const hasChecksumSidecar = checksumSidecarCopiesCount > 0
		const hasIsoContainerExport = isoContainerExportCopiesCount > 0
		const hasVmSnapshotDelta = vmSnapshotDeltaCopiesCount > 0

		let clusterRiskState = 'reclaimable'
		if (members.some(m => m.verdict === 'blocked-unverified-golden-image')) {
			clusterRiskState = 'unverified-image'
		} else if (members.some(m => m.verdict === 'blocked-golden-iso-vault')) {
			clusterRiskState = 'golden-vault'
		} else if (members.some(m => m.verdict === 'blocked-active-vm-disk')) {
			clusterRiskState = 'active-vm-disk'
		} else if (members.some(m => m.verdict === 'blocked-checksum-sidecar')) {
			clusterRiskState = 'checksum-sidecar'
		} else if (hasIsoContainerExport && reclaimableCopiesCount > 0) {
			clusterRiskState = 'sha256-verified'
		} else if (hasVmSnapshotDelta && reclaimableCopiesCount > 0) {
			clusterRiskState = 'reclaimable'
		} else if (reclaimableCopiesCount === 0) {
			clusterRiskState = 'shielded'
		}

		const primaryGroupId = group.id ?? null
		const groupKey = String(group.hash || primaryGroupId || `vm-container-image-${groupIdx}`)
		const displayName = survivor ? survivor.basename : members[0].basename
		const governanceSignals = Array.from(new Set(members.map(m => m.tier)))
		const allArtifactTags = Array.from(new Set(members.flatMap(m => m.context.artifactTags)))

		rawClusters.push({
			groupKey,
			primaryGroupId,
			hash: group.hash || '',
			displayName,
			basename: displayName,
			imageLineageStem: survivor ? survivor.context.imageLineageStem : primaryInfo.imageLineageStem,
			artifactTags: allArtifactTags,
			artifactSummary: allArtifactTags.length > 0 ? allArtifactTags.join(', ') : 'none',
			extension: survivor ? survivor.extension : primaryInfo.extension,
			family: primaryInfo.family,
			familyLabel: primaryInfo.familyLabel,
			tierLabel: survivor ? survivor.tierLabel : members[0].tierLabel,
			governanceSummary: governanceSignals.join(', '),
			copyCount: members.length,
			rawReclaimableBytes: rawInfo.reclaimableBytes,
			formattedRawReclaimableBytes: formatBytes(rawInfo.reclaimableBytes),
			reclaimableBytes,
			formattedReclaimableBytes: formatBytes(reclaimableBytes),
			reclaimableCopiesCount,
			shieldedCopiesCount,
			goldenVaultCopiesCount,
			activeVmDiskCopiesCount,
			checksumSidecarCopiesCount,
			isoContainerExportCopiesCount,
			vmSnapshotDeltaCopiesCount,
			hasGoldenIsoVault,
			hasActiveVmDisk,
			hasChecksumSidecar,
			hasIsoContainerExport,
			hasVmSnapshotDelta,
			clusterRiskState,
			survivor,
			members,
		})
	}

	const searchFiltered = rawClusters.filter(cluster => {
		if (!options.searchQuery) {
			return true
		}
		const q = options.searchQuery
		if (
			cluster.displayName.toLowerCase().includes(q)
			|| cluster.imageLineageStem.toLowerCase().includes(q)
			|| cluster.artifactSummary.toLowerCase().includes(q)
			|| cluster.extension.toLowerCase().includes(q)
			|| cluster.familyLabel.toLowerCase().includes(q)
			|| cluster.governanceSummary.toLowerCase().includes(q)
		) {
			return true
		}
		return cluster.members.some(m => (
			m.normalizedPath.toLowerCase().includes(q)
			|| m.basename.toLowerCase().includes(q)
			|| m.context.artifactTag.toLowerCase().includes(q)
		))
	})

	for (const cluster of searchFiltered) {
		familyCounts.all += 1
		if (Object.prototype.hasOwnProperty.call(familyCounts, cluster.family)) {
			familyCounts[cluster.family] += 1
		}
	}

	const clusters = searchFiltered.filter(cluster => {
		if (options.familyFilter !== 'all' && cluster.family !== options.familyFilter) {
			return false
		}
		if (options.verdictFilter === 'reclaimable' && cluster.reclaimableCopiesCount === 0) {
			return false
		}
		if (options.verdictFilter === 'golden-vault' && !cluster.hasGoldenIsoVault) {
			return false
		}
		if (options.verdictFilter === 'active-vm-disk' && !cluster.hasActiveVmDisk) {
			return false
		}
		if (options.verdictFilter === 'checksum-sidecar' && !cluster.hasChecksumSidecar) {
			return false
		}
		if (options.verdictFilter === 'iso-container-export' && !cluster.hasIsoContainerExport) {
			return false
		}
		if (options.verdictFilter === 'vm-snapshot-delta' && !cluster.hasVmSnapshotDelta) {
			return false
		}
		if (options.verdictFilter === 'shielded' && cluster.shieldedCopiesCount === 0 && cluster.clusterRiskState !== 'shielded') {
			return false
		}
		return true
	})

	clusters.sort((a, b) => {
		if (options.sortMode === 'risk_desc') {
			const riskA = a.goldenVaultCopiesCount * 5 + a.activeVmDiskCopiesCount * 4 + a.checksumSidecarCopiesCount * 3 + a.isoContainerExportCopiesCount * 2 + a.shieldedCopiesCount
			const riskB = b.goldenVaultCopiesCount * 5 + b.activeVmDiskCopiesCount * 4 + b.checksumSidecarCopiesCount * 3 + b.isoContainerExportCopiesCount * 2 + b.shieldedCopiesCount
			if (riskA !== riskB) {
				return riskB - riskA
			}
		} else if (options.sortMode === 'copies_desc') {
			if (a.copyCount !== b.copyCount) {
				return b.copyCount - a.copyCount
			}
		} else if (options.sortMode === 'name_asc') {
			return a.basename.localeCompare(b.basename)
		}

		if (a.reclaimableBytes !== b.reclaimableBytes) {
			return b.reclaimableBytes - a.reclaimableBytes
		}
		return a.basename.localeCompare(b.basename)
	})

	const totalRawDuplicateBytes = clusters.reduce((sum, c) => sum + c.rawReclaimableBytes, 0)
	const totalReclaimableBytes = clusters.reduce((sum, c) => sum + c.reclaimableBytes, 0)
	const totalReclaimableCopiesCount = clusters.reduce((sum, c) => sum + c.reclaimableCopiesCount, 0)
	const totalShieldedCopiesCount = clusters.reduce((sum, c) => sum + c.shieldedCopiesCount, 0)
	const totalGoldenVaultClusters = clusters.filter(c => c.hasGoldenIsoVault).length
	const totalProtectedVmAndChecksumClusters = clusters.filter(c => c.hasActiveVmDisk || c.hasChecksumSidecar).length
	const totalIsoContainerExportClusters = clusters.filter(c => c.hasIsoContainerExport).length
	const totalVmSnapshotDeltaClusters = clusters.filter(c => c.hasVmSnapshotDelta).length
	const efficiencyPct = totalRawDuplicateBytes > 0
		? Math.round((totalReclaimableBytes / totalRawDuplicateBytes) * 100)
		: 0

	return {
		schema: VM_CONTAINER_IMAGE_SCHEMA,
		options: {
			familyFilter: options.familyFilter,
			verdictFilter: options.verdictFilter,
			sortMode: options.sortMode,
			strategy: options.strategy,
			survivorRule: options.survivorRule,
			protectGoldenIsoVault: options.protectGoldenIsoVault,
			protectActiveVmDisks: options.protectActiveVmDisks,
			protectChecksumSidecars: options.protectChecksumSidecars,
			keepRecentSnapshots: options.keepRecentSnapshots,
			staleCacheDays: options.staleCacheDays,
			minSizeMb: options.minSizeMb,
			referenceTimeSec: options.referenceTimeSec,
		},
		summary: {
			totalClustersCount: clusters.length,
			totalRawDuplicateBytes,
			formattedRawDuplicateBytes: formatBytes(totalRawDuplicateBytes),
			totalReclaimableBytes,
			formattedReclaimableBytes: formatBytes(totalReclaimableBytes),
			totalReclaimableCopiesCount,
			totalShieldedCopiesCount,
			totalGoldenVaultClusters,
			totalProtectedVmAndChecksumClusters,
			totalIsoContainerExportClusters,
			totalVmSnapshotDeltaClusters,
			efficiencyPct,
			familyCounts,
		},
		clusters,
	}
}

/**
 * Extract Nextcloud relative scan roots for occ files:scan suggestions.
 *
 * @param {Array<string>} paths Normalized file paths.
 * @return {Array<string>} Unique sorted Nextcloud relative roots.
 */
function extractOccScanPaths(paths) {
	const roots = new Set()
	for (const p of paths) {
		const clean = String(p || '').replace(/^\/+/, '')
		if (!clean) {
			continue
		}
		const parts = clean.split('/')
		if (parts[0] === '__groupfolders') {
			roots.add(`/__groupfolders/${parts[1] || ''}`.replace(/\/+$/, ''))
		} else if (parts.length >= 2 && parts[1] === 'files') {
			roots.add(`/${parts[0]}/files/${parts[2] || ''}`.replace(/\/+$/, ''))
		} else {
			roots.add(`/${parts[0]}`)
		}
	}
	return Array.from(roots).sort()
}

/**
 * Build a POSIX DRY_RUN=1 remediation script for VM, ISO & Container Image Vaults.
 *
 * @param {object} analysis Output from analyzeVmContainerImageDuplicates.
 * @param {object} [options] Script options.
 * @param {string} [options.dataRoot='/var/www/nextcloud/data'] Nextcloud data root directory.
 * @return {string} POSIX bash script with single-quoted paths, sha256sum -- verification, stat cross-device guard, and DRY_RUN=1 default.
 */
export function buildVmContainerImageScript(analysis, options = {}) {
	const dataRoot = String(options.dataRoot || '/var/www/nextcloud/data').replace(/\/+$/, '') || '/var/www/nextcloud/data'
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const strategy = (analysis && analysis.options && analysis.options.strategy) || 'consolidate-golden-isos'

	const operations = []
	const affectedPaths = []

	for (const cluster of clusters) {
		const survivorPath = cluster && cluster.survivor ? cluster.survivor.normalizedPath : ''
		if (!survivorPath) {
			continue
		}
		for (const member of cluster.members || []) {
			if (member.actionKind !== 'reclaim' && member.actionKind !== 'consolidate') {
				continue
			}
			operations.push({
				clusterName: cluster.basename,
				family: cluster.familyLabel,
				tier: member.tierLabel,
				actionKind: member.actionKind,
				survivorPath,
				targetPath: member.normalizedPath,
				size: member.size,
			})
			affectedPaths.push(member.rawPath || member.normalizedPath)
		}
	}

	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# VM, ISO & Container Image Vault Auditor',
		`# Strategy: ${strategy} | Safe defaults: DRY_RUN=1, VERIFY_SHA256=1`,
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'VERIFY_SHA256="$' + '{VERIFY_SHA256:-1}"',
		`DATA_ROOT=${escapePosixSingleQuote(dataRoot)}`,
		'',
		'resolve_path() {',
		'  local rel="$1"',
		'  printf \'%s/%s\' "$DATA_ROOT" "$' + '{rel#/}"',
		'}',
		'',
		'verify_matching_digest() {',
		'  local survivor_full="$1"',
		'  local target_full="$2"',
		'  if [ "$VERIFY_SHA256" != "1" ]; then',
		'    return 0',
		'  fi',
		'  if command -v sha256sum >/dev/null 2>&1; then',
		'    local s_sum t_sum',
		'    s_sum="$(sha256sum -- "$survivor_full" | awk \'{print $1}\')"',
		'    t_sum="$(sha256sum -- "$target_full" | awk \'{print $1}\')"',
		'    [ "$s_sum" = "$t_sum" ]',
		'    return $?',
		'  fi',
		'  return 0',
		'}',
		'',
	]

	if (operations.length === 0) {
		lines.push('echo "No reclaimable or consolidatable VM snapshots, verified container tarballs, or stray ISO copies under current guards."')
		return lines.join('\n')
	}

	lines.push('prune_verified_vm_artifact() {')
	lines.push('  local survivor_rel="$1"')
	lines.push('  local target_rel="$2"')
	lines.push('  local survivor_full target_full')
	lines.push('  survivor_full="$(resolve_path "$survivor_rel")"')
	lines.push('  target_full="$(resolve_path "$target_rel")"')
	lines.push('  if [ "$DRY_RUN" = "1" ]; then')
	lines.push('    printf \'[DRY_RUN] verify %s && rm -f -- %s\\n\' "$survivor_full" "$target_full"')
	lines.push('  else')
	lines.push('    if ! verify_matching_digest "$survivor_full" "$target_full"; then')
	lines.push('      printf \'[ABORT sha256 mismatch] %s\\n\' "$target_full" >&2')
	lines.push('      return 1')
	lines.push('    fi')
	lines.push('    rm -f -- "$target_full"')
	lines.push('  fi')
	lines.push('}')
	lines.push('')
	lines.push('consolidate_vault_artifact() {')
	lines.push('  local survivor_rel="$1"')
	lines.push('  local target_rel="$2"')
	lines.push('  local survivor_full target_full')
	lines.push('  survivor_full="$(resolve_path "$survivor_rel")"')
	lines.push('  target_full="$(resolve_path "$target_rel")"')
	lines.push('  if [ "$DRY_RUN" = "1" ]; then')
	lines.push('    printf \'[DRY_RUN] consolidate %s -> %s\\n\' "$target_full" "$survivor_full"')
	lines.push('  else')
	lines.push('    if ! verify_matching_digest "$survivor_full" "$target_full"; then')
	lines.push('      printf \'[ABORT sha256 mismatch] %s\\n\' "$target_full" >&2')
	lines.push('      return 1')
	lines.push('    fi')
	lines.push('    local s_dev t_dev')
	lines.push('    s_dev="$(stat -c %d "$survivor_full" 2>/dev/null || stat -f %d "$survivor_full")"')
	lines.push('    t_dev="$(stat -c %d "$target_full" 2>/dev/null || stat -f %d "$target_full")"')
	lines.push('    if [ "$s_dev" != "$t_dev" ]; then')
	lines.push('      printf \'[SKIP cross-device] %s\\n\' "$target_full" >&2')
	lines.push('      return 0')
	lines.push('    fi')
	lines.push('    ln -f -- "$survivor_full" "$target_full"')
	lines.push('  fi')
	lines.push('}')
	lines.push('')

	for (const op of operations) {
		lines.push(`# ${op.family} [${op.tier}]: ${op.clusterName} (${formatBytes(op.size)})`)
		if (op.actionKind === 'consolidate') {
			lines.push(`consolidate_vault_artifact ${escapePosixSingleQuote(op.survivorPath)} ${escapePosixSingleQuote(op.targetPath)}`)
		} else {
			lines.push(`prune_verified_vm_artifact ${escapePosixSingleQuote(op.survivorPath)} ${escapePosixSingleQuote(op.targetPath)}`)
		}
	}

	const scanPaths = extractOccScanPaths(affectedPaths)
	if (scanPaths.length > 0) {
		lines.push('')
		lines.push('# Nextcloud metadata rescan after DRY_RUN=0:')
		for (const scanPath of scanPaths) {
			lines.push(`# sudo -u www-data php occ files:scan --path=${escapePosixSingleQuote(scanPath)}`)
		}
	}

	return lines.join('\n')
}

/**
 * Build a Nextcloud Desktop .sync-exclude.lst snippet for VM snapshot deltas, lock files, and temp disk caches.
 *
 * @param {object} analysis Output from analyzeVmContainerImageDuplicates.
 * @return {string} Newline-delimited Nextcloud sync-exclude patterns.
 */
export function buildVmContainerImageSyncExcludeSnippet(analysis) {
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const lines = [
		'# Nextcloud Desktop .sync-exclude.lst rules for VM snapshots, lock files & temp disk images',
		'*.vmsn',
		'*.vmsd',
		'*.lck',
		'.vagrant/',
		'*.vhdx.tmp',
		'*.part',
		'*.qcow2.tmp',
	]
	const seen = new Set(lines)
	for (const cluster of clusters) {
		if (cluster && cluster.extension === 'vmdk' && !seen.has('*.vmdk.lck/')) {
			lines.push('*.vmdk.lck/')
			seen.add('*.vmdk.lck/')
		}
	}
	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe CSV audit report for VM, ISO & Container Image Vaults.
 *
 * @param {object} analysis Output from analyzeVmContainerImageDuplicates.
 * @return {string} RFC-4180 CSV string with CWE-1236 formula escaping.
 */
export function buildVmContainerImageCsvReport(analysis) {
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const headers = [
		'Cluster Key',
		'Vault Asset Name',
		'Image Lineage Stem',
		'Artifact Tags',
		'Extension',
		'Family',
		'Governance Tier',
		'Golden ISO Vault',
		'Active VM Disk',
		'Checksum Sidecar',
		'Verified SHA-256 Twin Conserved',
		'Risk State',
		'Member Role',
		'Verdict',
		'Action',
		'Path',
		'Size Bytes',
		'Age Days',
		'Authority Score',
		'Modified',
	]

	const rows = [headers.map(h => escapeCsvCell(h)).join(',')]
	for (const cluster of clusters) {
		for (const member of cluster.members || []) {
			const hasVerifiedTwin = member.context.isIsoOrContainerExport
				? member.context.hasVerifiedGoldenTwin
				: (member.context.isGoldenIsoVault || member.context.isActiveVmDisk || member.context.isChecksumSidecar)
			const row = [
				cluster.groupKey,
				cluster.basename,
				member.context.imageLineageStem,
				member.context.artifactTag,
				member.extension,
				cluster.familyLabel,
				member.tierLabel,
				member.context.isGoldenIsoVault ? 'yes' : 'no',
				member.context.isActiveVmDisk ? 'yes' : 'no',
				member.context.isChecksumSidecar ? 'yes' : 'no',
				hasVerifiedTwin ? 'yes' : 'no',
				cluster.clusterRiskState,
				member.role,
				member.verdictLabel,
				member.actionKind,
				member.normalizedPath,
				member.size,
				member.context.ageDays !== null ? member.context.ageDays : '',
				member.context.authorityScore,
				member.formattedMtime || '',
			]
			rows.push(row.map(cell => escapeCsvCell(cell)).join(','))
		}
	}

	return rows.join('\r\n')
}

/**
 * Build a structured JSON audit manifest for VM, ISO & Container Image Vaults.
 *
 * @param {object} analysis Output from analyzeVmContainerImageDuplicates.
 * @param {string} [generatedAt] Optional ISO timestamp override.
 * @return {string} Pretty-printed JSON manifest.
 */
export function buildVmContainerImageJsonReport(analysis, generatedAt = new Date().toISOString()) {
	const safeAnalysis = analysis && typeof analysis === 'object' ? analysis : { summary: {}, clusters: [], options: {} }
	return JSON.stringify({
		schema: VM_CONTAINER_IMAGE_SCHEMA,
		generatedAt,
		options: safeAnalysis.options || {},
		summary: safeAnalysis.summary || {},
		clusters: (safeAnalysis.clusters || []).map(cluster => ({
			groupKey: cluster.groupKey,
			primaryGroupId: cluster.primaryGroupId,
			hash: cluster.hash,
			basename: cluster.basename,
			imageLineageStem: cluster.imageLineageStem,
			artifactTags: cluster.artifactTags,
			extension: cluster.extension,
			family: cluster.family,
			tierLabel: cluster.tierLabel,
			governanceSummary: cluster.governanceSummary,
			clusterRiskState: cluster.clusterRiskState,
			copyCount: cluster.copyCount,
			reclaimableBytes: cluster.reclaimableBytes,
			survivorPath: cluster.survivor ? cluster.survivor.normalizedPath : '',
			members: (cluster.members || []).map(member => ({
				selectionKey: member.selectionKey,
				path: member.normalizedPath,
				role: member.role,
				verdict: member.verdict,
				actionKind: member.actionKind,
				size: member.size,
				tier: member.tier,
				imageLineageStem: member.context.imageLineageStem,
				authorityScore: member.context.authorityScore,
				hasVerifiedGoldenTwin: member.context.hasVerifiedGoldenTwin,
				override: member.override,
			})),
		})),
	}, null, 2)
}
