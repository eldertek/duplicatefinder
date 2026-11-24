/**
 * Pure OS Installer, Firmware, Package Cache & ISO Distribution Repository Auditor.
 * Detects and audits duplicate software distribution artifacts across Nextcloud storage:
 * - OS ISOs & Raw Disk Images (.iso, .img, .img.xz, .img.gz, .raw.xz, .esd, .wim, .swm, .ipsw, .vtoy)
 * - Desktop & Enterprise Installers (.msi, .exe, .msix, .appx, .dmg, .pkg, .mpkg, .appimage, .flatpak, .snap)
 * - Firmware, BIOS & Hotfix Blobs (.rom, .fw, .cap, .fd, .efi, .uf2, .hex, .dfu, .cab, .msu, .spkg, plus firmware .bin/.img)
 * - OS Package Repo Caches (.deb, .udeb, .rpm, .srpm, .apk, .whl, .nupkg, .snupkg, .gem, .crate, .conda, .pkg.tar.zst)
 *
 * Extracts target CPU architecture, version/build tokens, and release channel (LTS/stable/RC/beta),
 * shields golden PXE/MDT/APT repositories, cryptographically signed builds, and firmware vaults,
 * and emits POSIX DRY_RUN=1 scripts with SHA-256 verification and same-filesystem hardlinks,
 * Nextcloud occ files:scan hints, .sync-exclude.lst snippets, CWE-1236 CSV, and JSON manifests.
 * Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const INSTALLER_REPO_SCHEMA = 'duplicatefinder.installer-repo-auditor.v1'

export const INSTALLER_FAMILIES = Object.freeze([
	'all',
	'os-iso-images',
	'desktop-installers',
	'firmware-bios-blobs',
	'package-repo-caches',
])

export const INSTALLER_FAMILY_META = Object.freeze({
	'os-iso-images': {
		id: 'os-iso-images',
		label: 'OS ISOs & Raw Images',
		shortLabel: 'OS ISOs',
	},
	'desktop-installers': {
		id: 'desktop-installers',
		label: 'Desktop & App Installers',
		shortLabel: 'Installers',
	},
	'firmware-bios-blobs': {
		id: 'firmware-bios-blobs',
		label: 'Firmware & BIOS Blobs',
		shortLabel: 'Firmware',
	},
	'package-repo-caches': {
		id: 'package-repo-caches',
		label: 'OS Package Repo Caches',
		shortLabel: 'Pkg Caches',
	},
})

export const INSTALLER_STRATEGIES = Object.freeze([
	'consolidate-repo',
	'hardlink-mirror',
	'keep-latest-lts',
])

export const INSTALLER_SURVIVOR_RULES = Object.freeze([
	'golden-repo-first',
	'signed-or-newest',
	'oldest-golden',
	'newest-release',
	'shortest-path',
])

export const INSTALLER_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'golden-guarded',
	'firmware-guarded',
	'shielded',
])

export const INSTALLER_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const INSTALLER_PRESETS = Object.freeze([
	{
		id: 'all-installer-audit',
		name: 'All Installers, Firmware & ISOs',
		description: 'Audit OS ISOs, desktop installers, firmware capsules, and package caches while guarding golden repositories and signed releases.',
		familyFilter: 'all',
		strategy: 'consolidate-repo',
		survivorRule: 'golden-repo-first',
		protectGoldenRepos: true,
		protectSignedArtifacts: true,
		protectFirmwareBlobs: true,
		staleDownloadDays: 30,
		minSizeMb: 0,
	},
	{
		id: 'iso-pxe-hardlink',
		name: 'ISO & PXE Mirror Hardlink',
		description: 'Deduplicate duplicated OS ISO and boot images across PXE/MDT/team mirrors using safe same-filesystem POSIX hardlinks.',
		familyFilter: 'os-iso-images',
		strategy: 'hardlink-mirror',
		survivorRule: 'golden-repo-first',
		protectGoldenRepos: true,
		protectSignedArtifacts: true,
		protectFirmwareBlobs: true,
		staleDownloadDays: 14,
		minSizeMb: 100,
	},
	{
		id: 'package-cache-reclaim',
		name: 'Package Repo Cache Reclaim',
		description: 'Consolidate duplicated .deb, .rpm, .whl, .nupkg, and .conda package mirror pools and stale developer cache downloads.',
		familyFilter: 'package-repo-caches',
		strategy: 'consolidate-repo',
		survivorRule: 'golden-repo-first',
		protectGoldenRepos: true,
		protectSignedArtifacts: false,
		protectFirmwareBlobs: true,
		staleDownloadDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'firmware-vault-guard',
		name: 'Firmware & BIOS Vault Guard',
		description: 'Shield UEFI/BIOS capsules, BMC/router firmware, and Windows MSU/CAB hotfix vaults while flagging user-download duplicates.',
		familyFilter: 'firmware-bios-blobs',
		strategy: 'hardlink-mirror',
		survivorRule: 'oldest-golden',
		protectGoldenRepos: true,
		protectSignedArtifacts: true,
		protectFirmwareBlobs: true,
		staleDownloadDays: 90,
		minSizeMb: 0,
	},
	{
		id: 'rc-beta-downloads',
		name: 'Superseded RC/Beta & Downloads',
		description: 'Identify duplicate desktop installers (.msi, .exe, .dmg, .pkg, .AppImage) and prioritize RC/beta or download sprawl cleanup.',
		familyFilter: 'desktop-installers',
		strategy: 'keep-latest-lts',
		survivorRule: 'signed-or-newest',
		protectGoldenRepos: true,
		protectSignedArtifacts: true,
		protectFirmwareBlobs: true,
		staleDownloadDays: 7,
		minSizeMb: 0,
	},
])

const COMPOUND_INSTALLER_EXTENSIONS = Object.freeze([
	{ suffix: '.pkg.tar.zst', ext: 'pkg.tar.zst', family: 'package-repo-caches' },
	{ suffix: '.pkg.tar.xz', ext: 'pkg.tar.xz', family: 'package-repo-caches' },
	{ suffix: '.tar.pkg.zst', ext: 'tar.pkg.zst', family: 'package-repo-caches' },
	{ suffix: '.img.xz', ext: 'img.xz', family: 'os-iso-images' },
	{ suffix: '.img.gz', ext: 'img.gz', family: 'os-iso-images' },
	{ suffix: '.img.zst', ext: 'img.zst', family: 'os-iso-images' },
	{ suffix: '.raw.xz', ext: 'raw.xz', family: 'os-iso-images' },
	{ suffix: '.raw.gz', ext: 'raw.gz', family: 'os-iso-images' },
	{ suffix: '.iso.gz', ext: 'iso.gz', family: 'os-iso-images' },
])

const ISO_EXTENSIONS = new Set(['iso', 'img', 'esd', 'wim', 'swm', 'ipsw', 'vtoy', 'nrg'])
const DESKTOP_INSTALLER_EXTENSIONS = new Set([
	'msi', 'exe', 'msix', 'appx', 'msixbundle', 'appxbundle', 'dmg', 'pkg', 'mpkg', 'appimage', 'flatpak', 'snap',
])
const FIRMWARE_EXTENSIONS = new Set([
	'rom', 'fw', 'cap', 'fd', 'efi', 'uf2', 'hex', 'dfu', 'cab', 'msu', 'spkg',
])
const PACKAGE_CACHE_EXTENSIONS = new Set([
	'deb', 'udeb', 'rpm', 'srpm', 'apk', 'whl', 'nupkg', 'snupkg', 'gem', 'crate', 'conda', 'ebuild', 'xbps',
])

const FIRMWARE_PATH_RE = /(?:^|[/_.-])(firmware|bios|uefi|bmc|ipmi|idrac|ilo|openwrt|ddwrt|dd-wrt|router|switch|eeprom|flash|microcode|bootloader|mcu|esp32|stm32|spkg|hotfix|kb\d{6,7})(?:$|[/_.-])/i
const INSTALLER_BIN_RE = /(?:^|[/_.-])(install|installer|setup|deploy|driver|cuda|qt|studio|jdk|jre|bundle|bootstrap)(?:$|[/_.-])/i
const PACKAGE_CACHE_PATH_RE = /(\/var\/cache\/apt|\/apt\/archives|\/var\/cache\/dnf|\/var\/cache\/yum|\/pacman\/pkg|\/pip\/cache|\/cache\/pip|\/nuget|\/\.nuget|\/conda\/pkgs|\/cargo\/registry|\/pkg-cache|\/repo-pool|\/mirror\/pool)/i

const GOLDEN_REPO_PATH_RE = /(\/golden|\/iso-repo|\/software-repo|\/software-depot|\/pxe|\/tftpboot|\/mdt|\/sccm|\/intune|\/jamf|\/deploy|\/firmware-vault|\/verified-releases|\/signed-builds|\/repo\/|\/mirror\/|\/releases\/)/i
const TEAM_DEPOT_PATH_RE = /(\/__groupfolders\/|\/shared\/|\/team\/|\/it-ops\/|\/sysadmin\/|\/devops\/|\/infra\/)/i
const USER_DOWNLOAD_PATH_RE = /(\/downloads\/|\/desktop\/|\/tmp\/|\/temp\/|\/incoming\/|\/staging\/|\/browser-downloads\/|\/mail-attachments\/)/i
const ARCHIVE_COPY_PATH_RE = /(\/backup\/|\/backups\/|\/old\/|\/archive\/|\/archived\/|\/copy\/|conflicted copy)/i

const SIGNED_HINT_RE = /(?:^|[/_.-])(signed|verified|whql|notarized|codesigned|checksum|sha256|sha512|release\.gpg|\.sig|\.asc)(?:$|[/_.-])/i

const TIER_LABELS = Object.freeze({
	'golden-repo': 'Golden / PXE / MDM Repo',
	'team-depot': 'Team / GroupFolder Depot',
	'package-cache': 'OS Package Cache Pool',
	'user-download': 'User Download / Staging',
	'archive-copy': 'Backup / Conflict Copy',
	'standard-folder': 'Standard Folder',
})

const TIER_AUTHORITY = Object.freeze({
	'golden-repo': 95,
	'team-depot': 78,
	'package-cache': 56,
	'standard-folder': 48,
	'user-download': 25,
	'archive-copy': 15,
})

const VERDICT_LABELS = Object.freeze({
	'keep-golden-survivor': 'Keep Golden Survivor',
	'reclaim-duplicate-copy': 'Safe Reclaim Copy',
	'reclaim-superseded-rc': 'Purge Superseded RC/Download',
	'hardlink-repo-mirror': 'Hardlink Repo Mirror',
	'blocked-golden-repo': 'Blocked: Golden Repo Guard',
	'blocked-signed-artifact': 'Blocked: Signed Artifact Guard',
	'blocked-firmware-vault': 'Blocked: Firmware Vault Guard',
	'blocked-manual-shield': 'Blocked: Operator Shield',
	excluded: 'Excluded by Operator',
})

/**
 * Normalize and quote a POSIX shell token using single quotes.
 *
 * @param {string} value Raw string value.
 * @return {string} Single-quoted POSIX string.
 */
export function escapePosixSingleQuote(value) {
	return `'${String(value ?? '').replace(/'/g, "'\\''")}'`
}

/**
 * Parse a timestamp field into epoch seconds.
 *
 * @param {*} value Candidate timestamp value.
 * @return {number|null} Epoch seconds or null when missing/invalid.
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
	const raw = String(normalizedPath || '')
	const idx = raw.lastIndexOf('/')
	return idx === -1 ? raw : raw.slice(idx + 1)
}

/**
 * Classify a file into one of the four installer/firmware/package/ISO families.
 *
 * @param {string} rawPath File path.
 * @param {string} [mimetype=''] Optional MIME type.
 * @return {{ matched: boolean, family: string, familyLabel: string, extension: string }|null}
 */
export function classifyInstallerArtifact(rawPath, mimetype = '') {
	const normalized = normalizePathForDiff(rawPath) || String(rawPath || '')
	const basename = extractBasename(normalized)
	const lowerBase = basename.toLowerCase()
	const lowerPath = normalized.toLowerCase()
	const lowerMime = String(mimetype || '').toLowerCase()

	if (!lowerBase) {
		return null
	}

	for (const compound of COMPOUND_INSTALLER_EXTENSIONS) {
		if (lowerBase.endsWith(compound.suffix)) {
			return {
				matched: true,
				family: compound.family,
				familyLabel: INSTALLER_FAMILY_META[compound.family].label,
				extension: compound.ext,
			}
		}
	}

	const lastDot = lowerBase.lastIndexOf('.')
	const ext = lastDot > 0 && lastDot < lowerBase.length - 1 ? lowerBase.slice(lastDot + 1) : ''

	if (FIRMWARE_EXTENSIONS.has(ext)) {
		return {
			matched: true,
			family: 'firmware-bios-blobs',
			familyLabel: INSTALLER_FAMILY_META['firmware-bios-blobs'].label,
			extension: ext,
		}
	}

	if (ext === 'bin') {
		if (FIRMWARE_PATH_RE.test(lowerPath)) {
			return {
				matched: true,
				family: 'firmware-bios-blobs',
				familyLabel: INSTALLER_FAMILY_META['firmware-bios-blobs'].label,
				extension: ext,
			}
		}
		if (INSTALLER_BIN_RE.test(lowerPath)) {
			return {
				matched: true,
				family: 'desktop-installers',
				familyLabel: INSTALLER_FAMILY_META['desktop-installers'].label,
				extension: ext,
			}
		}
		return null
	}

	if (ext === 'img') {
		const family = FIRMWARE_PATH_RE.test(lowerPath) ? 'firmware-bios-blobs' : 'os-iso-images'
		return {
			matched: true,
			family,
			familyLabel: INSTALLER_FAMILY_META[family].label,
			extension: ext,
		}
	}

	if (ISO_EXTENSIONS.has(ext) || lowerMime.includes('x-iso9660-image')) {
		return {
			matched: true,
			family: 'os-iso-images',
			familyLabel: INSTALLER_FAMILY_META['os-iso-images'].label,
			extension: ext || 'iso',
		}
	}

	if (DESKTOP_INSTALLER_EXTENSIONS.has(ext) || lowerMime.includes('x-msi') || lowerMime.includes('x-apple-diskimage')) {
		return {
			matched: true,
			family: 'desktop-installers',
			familyLabel: INSTALLER_FAMILY_META['desktop-installers'].label,
			extension: ext || 'installer',
		}
	}

	if (ext === 'run' && INSTALLER_BIN_RE.test(lowerPath)) {
		return {
			matched: true,
			family: 'desktop-installers',
			familyLabel: INSTALLER_FAMILY_META['desktop-installers'].label,
			extension: ext,
		}
	}

	if (PACKAGE_CACHE_EXTENSIONS.has(ext) || lowerMime.includes('vnd.debian.binary-package') || lowerMime.includes('x-rpm')) {
		return {
			matched: true,
			family: 'package-repo-caches',
			familyLabel: INSTALLER_FAMILY_META['package-repo-caches'].label,
			extension: ext || 'pkg',
		}
	}

	if (ext === 'txz' && PACKAGE_CACHE_PATH_RE.test(lowerPath)) {
		return {
			matched: true,
			family: 'package-repo-caches',
			familyLabel: INSTALLER_FAMILY_META['package-repo-caches'].label,
			extension: ext,
		}
	}

	return null
}

/**
 * Extract CPU architecture, version string, release channel, and OS platform from filename/path.
 *
 * @param {string} basename File basename.
 * @param {string} normalizedPath Normalized file path.
 * @param {string} family Classified family id.
 * @return {{ arch: string, version: string, channel: string, platform: string, isRcOrBeta: boolean }}
 */
export function extractArtifactMetadata(basename, normalizedPath, family) {
	const haystack = `${normalizedPath || ''}/${basename || ''}`.toLowerCase()

	let arch = 'unspecified'
	if (/(?:^|[/_.-])(x86_64|amd64|x64|win64)(?:$|[/_.-])/.test(haystack)) {
		arch = 'x86_64'
	} else if (/(?:^|[/_.-])(arm64|aarch64)(?:$|[/_.-])/.test(haystack)) {
		arch = 'arm64'
	} else if (/(?:^|[/_.-])(armv7|armhf|armel)(?:$|[/_.-])/.test(haystack)) {
		arch = 'armhf'
	} else if (/(?:^|[/_.-])(i386|i686|x86|win32)(?:$|[/_.-])/.test(haystack)) {
		arch = 'x86'
	} else if (/(?:^|[/_.-])(universal|fat)(?:$|[/_.-])/.test(haystack)) {
		arch = 'universal'
	} else if (/(?:^|[/_.-])(noarch|all|any|py3-none-any)(?:$|[/_.-])/.test(haystack)) {
		arch = 'noarch'
	}

	const versionMatch = String(basename || '').match(/(?:^|[._-]|v)(\d{1,4}\.\d{1,4}(?:\.\d{1,4})?(?:\.\d{1,4})?)(?=$|[._+-])/i)
	const version = versionMatch ? versionMatch[1] : 'unversioned'

	let channel = 'standard'
	let isRcOrBeta = false
	if (/(?:^|[/_.-])(lts|ltsc|esr|enterprise)(?:$|[/_.-])/.test(haystack)) {
		channel = 'lts'
	} else if (/(?:^|[/_.-])(rc\d*|beta\d*|alpha\d*|nightly|canary|dev|preview|insider|snapshot)(?:$|[/_.-])/.test(haystack)) {
		channel = 'rc-beta'
		isRcOrBeta = true
	} else if (/(?:^|[/_.-])(stable|release|final|rtm|ga)(?:$|[/_.-])/.test(haystack)) {
		channel = 'stable'
	}

	let platform = 'cross-platform'
	if (family === 'firmware-bios-blobs' || FIRMWARE_PATH_RE.test(haystack)) {
		platform = 'embedded-firmware'
	} else if (/(ubuntu|debian|fedora|rhel|rocky|alma|centos|arch|alpine|opensuse|linux)|\.(deb|rpm|appimage|flatpak|snap)$/i.test(haystack)) {
		platform = 'linux'
	} else if (/(windows|win10|win11|win32|win64|server2022)|\.(msi|exe|msix|appx|esd|wim|msu|cab)$/i.test(haystack)) {
		platform = 'windows'
	} else if (/(macos|darwin|osx)|\.(dmg|pkg|mpkg)$/i.test(haystack)) {
		platform = 'macos'
	} else if (/\.ipsw$/i.test(haystack)) {
		platform = 'ios'
	} else if (/\.apk$/i.test(haystack)) {
		platform = 'android'
	}

	return {
		arch,
		version,
		channel,
		platform,
		isRcOrBeta,
	}
}

/**
 * Classify a copy's repository storage tier and authority score.
 *
 * @param {string} rawPath Raw file path.
 * @param {string} normalizedPath Normalized file path.
 * @return {{ tier: string, tierLabel: string, authorityScore: number, isGoldenRepo: boolean, isUserDownload: boolean, isPackageCachePool: boolean }}
 */
export function classifyRepoTier(rawPath, normalizedPath) {
	const fullLower = `${String(rawPath || '')} ${String(normalizedPath || '')}`.toLowerCase()
	let tier = 'standard-folder'

	if (GOLDEN_REPO_PATH_RE.test(fullLower)) {
		tier = 'golden-repo'
	} else if (PACKAGE_CACHE_PATH_RE.test(fullLower)) {
		tier = 'package-cache'
	} else if (TEAM_DEPOT_PATH_RE.test(fullLower)) {
		tier = 'team-depot'
	} else if (ARCHIVE_COPY_PATH_RE.test(fullLower)) {
		tier = 'archive-copy'
	} else if (USER_DOWNLOAD_PATH_RE.test(fullLower)) {
		tier = 'user-download'
	}

	return {
		tier,
		tierLabel: TIER_LABELS[tier],
		authorityScore: TIER_AUTHORITY[tier],
		isGoldenRepo: tier === 'golden-repo',
		isUserDownload: tier === 'user-download',
		isPackageCachePool: tier === 'package-cache',
	}
}

/**
 * Build member-level context for a single installer/firmware/ISO duplicate copy.
 *
 * @param {object} file Duplicate file entry.
 * @param {object} artifactInfo Family classification metadata.
 * @param {object} options Normalized audit options.
 * @return {object} Member context metadata.
 */
function evaluateMemberContext(file, artifactInfo, options) {
	const rawPath = String(file.path || '')
	const normalizedPath = normalizePathForDiff(rawPath) || rawPath
	const basename = extractBasename(normalizedPath)
	const tierInfo = classifyRepoTier(rawPath, normalizedPath)
	const meta = extractArtifactMetadata(basename, normalizedPath, artifactInfo.family)
	const mtimeSec = getFileMtimeSeconds(file)
	const ageDays = mtimeSec !== null
		? Math.max(0, Math.round(((options.referenceTimeSec - mtimeSec) / 86400) * 10) / 10)
		: null

	const isSignedOrVerified = SIGNED_HINT_RE.test(`${normalizedPath}/${basename}`)
	const isGoldenProtected = tierInfo.isGoldenRepo || (tierInfo.tier === 'team-depot' && isSignedOrVerified)
	const isFirmwareVault = artifactInfo.family === 'firmware-bios-blobs'
		&& (tierInfo.isGoldenRepo || tierInfo.tier === 'team-depot' || FIRMWARE_PATH_RE.test(normalizedPath))
	const isStaleDownload = tierInfo.isUserDownload && ageDays !== null && ageDays >= options.staleDownloadDays

	return {
		rawPath,
		normalizedPath,
		basename,
		mtimeSec,
		ageDays,
		tier: tierInfo.tier,
		tierLabel: tierInfo.tierLabel,
		authorityScore: tierInfo.authorityScore + (isSignedOrVerified ? 10 : 0) + (meta.channel === 'lts' ? 5 : 0),
		isGoldenRepo: tierInfo.isGoldenRepo,
		isGoldenProtected,
		isSignedOrVerified,
		isFirmwareVault,
		isUserDownload: tierInfo.isUserDownload,
		isPackageCachePool: tierInfo.isPackageCachePool,
		isStaleDownload,
		arch: meta.arch,
		version: meta.version,
		channel: meta.channel,
		platform: meta.platform,
		isRcOrBeta: meta.isRcOrBeta,
	}
}

/**
 * Select the canonical survivor member inside an installer/firmware/ISO cluster.
 *
 * @param {Array<object>} members Evaluated cluster members.
 * @param {string} survivorRule Survivor rule identifier.
 * @param {Set<string>} excludeKeys Set of operator-excluded selection keys.
 * @return {object|null} Selected survivor member.
 */
function selectClusterSurvivor(members, survivorRule, excludeKeys) {
	if (!Array.isArray(members) || members.length === 0) {
		return null
	}
	const eligible = members.filter(m => !excludeKeys.has(String(m.selectionKey)))
	const pool = eligible.length > 0 ? eligible : members

	const sorted = [...pool].sort((a, b) => {
		if (survivorRule === 'golden-repo-first') {
			if (a.context.authorityScore !== b.context.authorityScore) {
				return b.context.authorityScore - a.context.authorityScore
			}
			const mtimeA = a.mtimeSec ?? -1
			const mtimeB = b.mtimeSec ?? -1
			if (mtimeA !== mtimeB) {
				return mtimeB - mtimeA
			}
		} else if (survivorRule === 'signed-or-newest') {
			const signedDiff = Number(b.context.isSignedOrVerified) - Number(a.context.isSignedOrVerified)
			if (signedDiff !== 0) {
				return signedDiff
			}
			const rcDiff = Number(a.context.isRcOrBeta) - Number(b.context.isRcOrBeta)
			if (rcDiff !== 0) {
				return rcDiff
			}
			const mtimeA = a.mtimeSec ?? -1
			const mtimeB = b.mtimeSec ?? -1
			if (mtimeA !== mtimeB) {
				return mtimeB - mtimeA
			}
		} else if (survivorRule === 'oldest-golden') {
			const goldenDiff = Number(b.context.isGoldenProtected) - Number(a.context.isGoldenProtected)
			if (goldenDiff !== 0) {
				return goldenDiff
			}
			const mtimeA = a.mtimeSec ?? Number.MAX_SAFE_INTEGER
			const mtimeB = b.mtimeSec ?? Number.MAX_SAFE_INTEGER
			if (mtimeA !== mtimeB) {
				return mtimeA - mtimeB
			}
		} else if (survivorRule === 'newest-release') {
			const mtimeA = a.mtimeSec ?? -1
			const mtimeB = b.mtimeSec ?? -1
			if (mtimeA !== mtimeB) {
				return mtimeB - mtimeA
			}
		}

		if (a.normalizedPath.length !== b.normalizedPath.length) {
			return a.normalizedPath.length - b.normalizedPath.length
		}
		return a.normalizedPath.localeCompare(b.normalizedPath)
	})

	return sorted[0] || null
}

/**
 * Resolve per-member verdict and action for a cluster.
 *
 * @param {object} member Member record.
 * @param {object} survivor Selected survivor member.
 * @param {object} options Normalized options.
 * @param {Set<string>} forceKeepKeys Operator-shielded selection keys.
 * @param {Set<string>} excludeKeys Operator-excluded selection keys.
 * @return {{ verdict: string, verdictLabel: string, actionKind: string, note: string }}
 */
function resolveMemberVerdict(member, survivor, options, forceKeepKeys, excludeKeys) {
	const keyStr = String(member.selectionKey)

	if (excludeKeys.has(keyStr)) {
		return {
			verdict: 'excluded',
			verdictLabel: VERDICT_LABELS.excluded,
			actionKind: 'exclude',
			note: 'Excluded by operator override; left untouched.',
		}
	}

	if (survivor && member.selectionKey === survivor.selectionKey) {
		return {
			verdict: 'keep-golden-survivor',
			verdictLabel: VERDICT_LABELS['keep-golden-survivor'],
			actionKind: 'keep',
			note: member.context.isGoldenRepo
				? 'Canonical golden repository survivor; all remediation targets anchor to this copy.'
				: 'Selected canonical survivor for this installer cluster.',
		}
	}

	if (forceKeepKeys.has(keyStr)) {
		return {
			verdict: 'blocked-manual-shield',
			verdictLabel: VERDICT_LABELS['blocked-manual-shield'],
			actionKind: 'shield',
			note: 'Manually shielded by operator; protected from reclaim or hardlinking.',
		}
	}

	if (options.strategy === 'hardlink-mirror') {
		return {
			verdict: 'hardlink-repo-mirror',
			verdictLabel: VERDICT_LABELS['hardlink-repo-mirror'],
			actionKind: 'hardlink',
			note: 'Replace redundant copy with a same-filesystem POSIX hardlink to the canonical survivor after SHA-256 verification.',
		}
	}

	if (options.protectGoldenRepos && member.context.isGoldenProtected) {
		return {
			verdict: 'blocked-golden-repo',
			verdictLabel: VERDICT_LABELS['blocked-golden-repo'],
			actionKind: 'shield',
			note: 'Copy resides inside a golden PXE/MDT/software repository path; switch to Hardlink Mirror strategy or disable Golden Repo Guard to modify.',
		}
	}

	if (options.protectSignedArtifacts && member.context.isSignedOrVerified) {
		return {
			verdict: 'blocked-signed-artifact',
			verdictLabel: VERDICT_LABELS['blocked-signed-artifact'],
			actionKind: 'shield',
			note: 'Artifact carries signed/verified/checksum provenance cues; shielded under Signed Artifact Guard.',
		}
	}

	if (options.protectFirmwareBlobs && member.context.isFirmwareVault) {
		return {
			verdict: 'blocked-firmware-vault',
			verdictLabel: VERDICT_LABELS['blocked-firmware-vault'],
			actionKind: 'shield',
			note: 'Firmware/BIOS/hotfix capsule inside a protected depot path; shielded under Firmware Vault Guard.',
		}
	}

	if (options.strategy === 'keep-latest-lts' && (member.context.isRcOrBeta || member.context.isStaleDownload)) {
		return {
			verdict: 'reclaim-superseded-rc',
			verdictLabel: VERDICT_LABELS['reclaim-superseded-rc'],
			actionKind: 'reclaim',
			note: 'Superseded RC/beta or stale download duplicate; safe to reclaim while keeping the canonical survivor.',
		}
	}

	return {
		verdict: 'reclaim-duplicate-copy',
		verdictLabel: VERDICT_LABELS['reclaim-duplicate-copy'],
		actionKind: 'reclaim',
		note: member.context.isUserDownload
			? 'Redundant user download or staging copy; safe to reclaim once survivor SHA-256 is verified.'
			: 'Redundant duplicate copy outside guarded golden depots; safe to reclaim.',
	}
}

/**
 * Normalize audit options into deterministic defaults.
 *
 * @param {object} [rawOptions] Raw options.
 * @return {object} Normalized options.
 */
function normalizeOptions(rawOptions = {}) {
	const familyFilter = INSTALLER_FAMILIES.includes(rawOptions.familyFilter)
		? rawOptions.familyFilter
		: 'all'
	const verdictFilter = INSTALLER_VERDICT_FILTERS.includes(rawOptions.verdictFilter)
		? rawOptions.verdictFilter
		: 'all'
	const sortMode = INSTALLER_SORT_MODES.includes(rawOptions.sortMode)
		? rawOptions.sortMode
		: 'reclaim_desc'
	const strategy = INSTALLER_STRATEGIES.includes(rawOptions.strategy)
		? rawOptions.strategy
		: 'consolidate-repo'
	const survivorRule = INSTALLER_SURVIVOR_RULES.includes(rawOptions.survivorRule)
		? rawOptions.survivorRule
		: 'golden-repo-first'

	const staleDownloadDaysRaw = Number(rawOptions.staleDownloadDays)
	const staleDownloadDays = Number.isFinite(staleDownloadDaysRaw) && staleDownloadDaysRaw >= 0
		? staleDownloadDaysRaw
		: 30

	const minSizeMbRaw = Number(rawOptions.minSizeMb)
	const minSizeMb = Number.isFinite(minSizeMbRaw) && minSizeMbRaw >= 0
		? minSizeMbRaw
		: 0

	const refRaw = Number(rawOptions.referenceTimeSec)
	const referenceTimeSec = Number.isFinite(refRaw) && refRaw > 0
		? Math.floor(refRaw)
		: Math.floor(Date.now() / 1000)

	return {
		familyFilter,
		verdictFilter,
		sortMode,
		strategy,
		survivorRule,
		protectGoldenRepos: rawOptions.protectGoldenRepos !== false,
		protectSignedArtifacts: rawOptions.protectSignedArtifacts !== false,
		protectFirmwareBlobs: rawOptions.protectFirmwareBlobs !== false,
		staleDownloadDays,
		minSizeMb,
		minSizeBytes: Math.round(minSizeMb * 1024 * 1024),
		searchQuery: String(rawOptions.searchQuery || '').trim().toLowerCase(),
		referenceTimeSec,
		forceKeepKeys: Array.isArray(rawOptions.forceKeepKeys) ? rawOptions.forceKeepKeys.map(String) : [],
		excludeKeys: Array.isArray(rawOptions.excludeKeys) ? rawOptions.excludeKeys.map(String) : [],
	}
}

/**
 * Analyze Nextcloud duplicate groups for OS installers, firmware blobs, package caches, and OS ISOs.
 *
 * @param {Array<object>} duplicates Duplicate group entries.
 * @param {object} [rawOptions] Audit configuration options.
 * @return {object} Structured analysis payload with summary and sorted clusters.
 */
export function analyzeInstallerRepoDuplicates(duplicates, rawOptions = {}) {
	const options = normalizeOptions(rawOptions)
	const forceKeepKeys = new Set(options.forceKeepKeys)
	const excludeKeys = new Set(options.excludeKeys)

	const familyCounts = {
		all: 0,
		'os-iso-images': 0,
		'desktop-installers': 0,
		'firmware-bios-blobs': 0,
		'package-repo-caches': 0,
	}

	const rawClusters = []
	const groups = Array.isArray(duplicates) ? duplicates : []

	for (let groupIdx = 0; groupIdx < groups.length; groupIdx += 1) {
		const group = groups[groupIdx]
		if (!group || !Array.isArray(group.files) || group.files.length < 2) {
			continue
		}

		const matchedFiles = []
		for (let fileIdx = 0; fileIdx < group.files.length; fileIdx += 1) {
			const file = group.files[fileIdx]
			if (!file || typeof file.path !== 'string') {
				continue
			}
			const info = classifyInstallerArtifact(file.path, file.mimetype || '')
			if (info && info.matched) {
				matchedFiles.push({ file, info, fileIdx })
			}
		}

		if (matchedFiles.length < 2) {
			continue
		}

		const primaryInfo = matchedFiles[0].info
		const rawInfo = computeGroupReclaimableInfo(group)
		const maxFileSize = matchedFiles.reduce((max, entry) => Math.max(max, Number(entry.file.size) || 0), 0)
		if (options.minSizeBytes > 0 && maxFileSize < options.minSizeBytes) {
			continue
		}

		const members = matchedFiles.map(({ file, info, fileIdx }) => {
			const context = evaluateMemberContext(file, info, options)
			const selectionKey = getFileSelectionKey(file) || `${group.id || group.hash || groupIdx}:${fileIdx}`
			const size = Number(file.size) || 0
			return {
				selectionKey,
				id: file.id ?? null,
				nodeId: file.nodeId ?? null,
				size,
				formattedSize: formatBytes(size),
				mtimeSec: context.mtimeSec,
				formattedMtime: formatFileModifiedTime(file),
				rawPath: context.rawPath,
				normalizedPath: context.normalizedPath,
				basename: context.basename,
				extension: info.extension,
				family: info.family,
				familyLabel: info.familyLabel,
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

		const reclaimableMembers = members.filter(m => m.actionKind === 'reclaim' || m.actionKind === 'hardlink')
		const reclaimableBytes = reclaimableMembers.reduce((sum, m) => sum + m.size, 0)
		const reclaimableCopiesCount = reclaimableMembers.length
		const shieldedCopiesCount = members.filter(m => m.actionKind === 'shield').length
		const goldenGuardedCopiesCount = members.filter(m => m.verdict === 'blocked-golden-repo' || m.verdict === 'blocked-signed-artifact').length
		const firmwareGuardedCopiesCount = members.filter(m => m.verdict === 'blocked-firmware-vault').length
		const userDownloadCopiesCount = members.filter(m => m.context.isUserDownload).length
		const signedCopiesCount = members.filter(m => m.context.isSignedOrVerified).length

		const archSet = Array.from(new Set(members.map(m => m.context.arch).filter(a => a !== 'unspecified')))
		const versionSet = Array.from(new Set(members.map(m => m.context.version).filter(v => v !== 'unversioned')))
		const channelSet = Array.from(new Set(members.map(m => m.context.channel)))
		const platformSet = Array.from(new Set(members.map(m => m.context.platform)))

		let clusterRiskState = 'reclaimable'
		if (firmwareGuardedCopiesCount > 0) {
			clusterRiskState = 'firmware-guarded'
		} else if (goldenGuardedCopiesCount > 0) {
			clusterRiskState = 'golden-guarded'
		} else if (reclaimableCopiesCount === 0 && shieldedCopiesCount > 0) {
			clusterRiskState = 'shielded'
		} else if (reclaimableCopiesCount === 0) {
			clusterRiskState = 'shielded'
		}

		const primaryGroupId = group.id ?? null
		const groupKey = String(group.hash || primaryGroupId || `installer-${groupIdx}`)
		const displayName = survivor ? survivor.basename : members[0].basename

		rawClusters.push({
			groupKey,
			primaryGroupId,
			hash: group.hash || '',
			displayName,
			basename: displayName,
			extension: primaryInfo.extension,
			family: primaryInfo.family,
			familyLabel: primaryInfo.familyLabel,
			tierLabel: survivor ? survivor.tierLabel : members[0].tierLabel,
			copyCount: members.length,
			rawReclaimableBytes: rawInfo.reclaimableBytes,
			formattedRawReclaimableBytes: formatBytes(rawInfo.reclaimableBytes),
			reclaimableBytes,
			formattedReclaimableBytes: formatBytes(reclaimableBytes),
			reclaimableCopiesCount,
			shieldedCopiesCount,
			goldenGuardedCopiesCount,
			firmwareGuardedCopiesCount,
			userDownloadCopiesCount,
			signedCopiesCount,
			hasGoldenRepoCopy: members.some(m => m.context.isGoldenProtected),
			hasFirmwareVaultCopy: members.some(m => m.context.isFirmwareVault),
			hasSignedCopy: signedCopiesCount > 0,
			hasRcBetaCopy: members.some(m => m.context.isRcOrBeta),
			archSummary: archSet.length > 0 ? archSet.join(', ') : 'unspecified',
			versionSummary: versionSet.length > 0 ? versionSet.join(', ') : 'unversioned',
			channelSummary: channelSet.join(', '),
			platformSummary: platformSet.join(', '),
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
			|| cluster.extension.toLowerCase().includes(q)
			|| cluster.familyLabel.toLowerCase().includes(q)
			|| cluster.archSummary.toLowerCase().includes(q)
			|| cluster.versionSummary.toLowerCase().includes(q)
			|| cluster.platformSummary.toLowerCase().includes(q)
		) {
			return true
		}
		return cluster.members.some(m => m.normalizedPath.toLowerCase().includes(q))
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
		if (options.verdictFilter === 'golden-guarded' && cluster.goldenGuardedCopiesCount === 0 && !cluster.hasGoldenRepoCopy) {
			return false
		}
		if (options.verdictFilter === 'firmware-guarded' && cluster.firmwareGuardedCopiesCount === 0 && !cluster.hasFirmwareVaultCopy) {
			return false
		}
		if (options.verdictFilter === 'shielded' && cluster.shieldedCopiesCount === 0 && cluster.clusterRiskState !== 'shielded') {
			return false
		}
		return true
	})

	clusters.sort((a, b) => {
		if (options.sortMode === 'risk_desc') {
			const riskA = a.firmwareGuardedCopiesCount * 4 + a.goldenGuardedCopiesCount * 3 + a.userDownloadCopiesCount * 2 + a.shieldedCopiesCount
			const riskB = b.firmwareGuardedCopiesCount * 4 + b.goldenGuardedCopiesCount * 3 + b.userDownloadCopiesCount * 2 + b.shieldedCopiesCount
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
	const totalGoldenGuardedClusters = clusters.filter(c => c.hasGoldenRepoCopy).length
	const totalFirmwareClusters = clusters.filter(c => c.family === 'firmware-bios-blobs' || c.hasFirmwareVaultCopy).length
	const totalUserDownloadCopiesCount = clusters.reduce((sum, c) => sum + c.userDownloadCopiesCount, 0)
	const efficiencyPct = totalRawDuplicateBytes > 0
		? Math.round((totalReclaimableBytes / totalRawDuplicateBytes) * 100)
		: 0

	return {
		schema: INSTALLER_REPO_SCHEMA,
		options: {
			familyFilter: options.familyFilter,
			verdictFilter: options.verdictFilter,
			sortMode: options.sortMode,
			strategy: options.strategy,
			survivorRule: options.survivorRule,
			protectGoldenRepos: options.protectGoldenRepos,
			protectSignedArtifacts: options.protectSignedArtifacts,
			protectFirmwareBlobs: options.protectFirmwareBlobs,
			staleDownloadDays: options.staleDownloadDays,
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
			totalGoldenGuardedClusters,
			totalFirmwareClusters,
			totalUserDownloadCopiesCount,
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
 * @return {Array<string>} Unique sorted relative paths.
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
 * Build a POSIX DRY_RUN=1 remediation script for OS installer, firmware, package cache, and ISO deduplication.
 *
 * @param {object} analysis Output from analyzeInstallerRepoDuplicates.
 * @param {object} [options] Script options.
 * @param {string} [options.dataRoot='/var/www/nextcloud/data'] Nextcloud data root directory.
 * @return {string} POSIX bash script with single-quoted paths, SHA-256 verification, and DRY_RUN=1 default.
 */
export function buildInstallerRepoScript(analysis, options = {}) {
	const dataRoot = String(options.dataRoot || '/var/www/nextcloud/data').replace(/\/+$/, '') || '/var/www/nextcloud/data'
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const strategy = (analysis && analysis.options && analysis.options.strategy) || 'consolidate-repo'

	const operations = []
	const affectedPaths = []

	for (const cluster of clusters) {
		const survivorPath = cluster && cluster.survivor ? cluster.survivor.normalizedPath : ''
		if (!survivorPath) {
			continue
		}
		for (const member of cluster.members || []) {
			if (member.actionKind !== 'reclaim' && member.actionKind !== 'hardlink') {
				continue
			}
			operations.push({
				clusterName: cluster.basename,
				family: cluster.familyLabel,
				actionKind: member.actionKind,
				survivorPath,
				targetPath: member.normalizedPath,
				size: member.size,
			})
			affectedPaths.push(member.normalizedPath)
		}
	}

	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# OS Installer, Firmware, Package Cache & ISO Distribution Repository Auditor',
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
		lines.push('echo "No reclaimable or hardlinkable installer, firmware, package, or ISO targets under current guards."')
		return lines.join('\n')
	}

	lines.push('reclaim_installer_copy() {')
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
	lines.push('hardlink_repo_mirror() {')
	lines.push('  local survivor_rel="$1"')
	lines.push('  local target_rel="$2"')
	lines.push('  local survivor_full target_full')
	lines.push('  survivor_full="$(resolve_path "$survivor_rel")"')
	lines.push('  target_full="$(resolve_path "$target_rel")"')
	lines.push('  if [ "$DRY_RUN" = "1" ]; then')
	lines.push('    printf \'[DRY_RUN] ln -f -- %s %s\\n\' "$survivor_full" "$target_full"')
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
		lines.push(`# ${op.family}: ${op.clusterName} (${formatBytes(op.size)})`)
		if (op.actionKind === 'hardlink') {
			lines.push(`hardlink_repo_mirror ${escapePosixSingleQuote(op.survivorPath)} ${escapePosixSingleQuote(op.targetPath)}`)
		} else {
			lines.push(`reclaim_installer_copy ${escapePosixSingleQuote(op.survivorPath)} ${escapePosixSingleQuote(op.targetPath)}`)
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
 * Build a Nextcloud Desktop .sync-exclude.lst snippet for bulky installer and package cache blobs.
 *
 * @param {object} analysis Output from analyzeInstallerRepoDuplicates.
 * @return {string} Newline-delimited Nextcloud sync-exclude patterns.
 */
export function buildInstallerSyncExcludeSnippet(analysis) {
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const extensions = new Set()
	for (const cluster of clusters) {
		if (cluster && cluster.extension) {
			extensions.add(cluster.extension)
		}
	}
	const lines = [
		'# Nextcloud Desktop .sync-exclude.lst rules for OS installers and package caches',
		'*.iso',
		'*.img.xz',
		'*.ipsw',
		'*.whl',
		'*.nupkg',
		'/var/cache/apt/archives/',
	]
	for (const ext of Array.from(extensions).sort()) {
		const pattern = `*.${ext}`
		if (!lines.includes(pattern)) {
			lines.push(pattern)
		}
	}
	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe CSV audit report for installer/firmware/ISO clusters.
 *
 * @param {object} analysis Output from analyzeInstallerRepoDuplicates.
 * @return {string} RFC-4180 CSV string with CWE-1236 formula escaping.
 */
export function buildInstallerRepoCsvReport(analysis) {
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const headers = [
		'Cluster Key',
		'Artifact Name',
		'Extension',
		'Family',
		'Tier',
		'Architecture',
		'Version',
		'Channel',
		'Platform',
		'Risk State',
		'Member Role',
		'Verdict',
		'Action',
		'Path',
		'Size Bytes',
		'Age Days',
		'Golden Repo',
		'Signed Hint',
		'Firmware Vault',
		'Authority Score',
		'Modified',
	]

	const rows = [headers.map(h => escapeCsvCell(h)).join(',')]
	for (const cluster of clusters) {
		for (const member of cluster.members || []) {
			const row = [
				cluster.groupKey,
				cluster.basename,
				member.extension,
				cluster.familyLabel,
				member.tierLabel,
				member.context.arch,
				member.context.version,
				member.context.channel,
				member.context.platform,
				cluster.clusterRiskState,
				member.role,
				member.verdictLabel,
				member.actionKind,
				member.normalizedPath,
				member.size,
				member.context.ageDays !== null ? member.context.ageDays : '',
				member.context.isGoldenProtected ? 'yes' : 'no',
				member.context.isSignedOrVerified ? 'yes' : 'no',
				member.context.isFirmwareVault ? 'yes' : 'no',
				member.context.authorityScore,
				member.formattedMtime || '',
			]
			rows.push(row.map(cell => escapeCsvCell(cell)).join(','))
		}
	}

	return rows.join('\r\n')
}

/**
 * Build a structured JSON audit manifest for installer, firmware, package cache, and ISO clusters.
 *
 * @param {object} analysis Output from analyzeInstallerRepoDuplicates.
 * @param {string} [generatedAt] Optional ISO timestamp override.
 * @return {string} Pretty-printed JSON manifest.
 */
export function buildInstallerRepoJsonReport(analysis, generatedAt = new Date().toISOString()) {
	const safeAnalysis = analysis && typeof analysis === 'object' ? analysis : { summary: {}, clusters: [], options: {} }
	return JSON.stringify({
		schema: INSTALLER_REPO_SCHEMA,
		generatedAt,
		options: safeAnalysis.options || {},
		summary: safeAnalysis.summary || {},
		clusters: (safeAnalysis.clusters || []).map(cluster => ({
			groupKey: cluster.groupKey,
			primaryGroupId: cluster.primaryGroupId,
			hash: cluster.hash,
			basename: cluster.basename,
			extension: cluster.extension,
			family: cluster.family,
			tierLabel: cluster.tierLabel,
			archSummary: cluster.archSummary,
			versionSummary: cluster.versionSummary,
			channelSummary: cluster.channelSummary,
			platformSummary: cluster.platformSummary,
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
				ageDays: member.context.ageDays,
				arch: member.context.arch,
				version: member.context.version,
				channel: member.context.channel,
				platform: member.context.platform,
				isGoldenProtected: member.context.isGoldenProtected,
				isSignedOrVerified: member.context.isSignedOrVerified,
				isFirmwareVault: member.context.isFirmwareVault,
				authorityScore: member.context.authorityScore,
			})),
		})),
	}, null, 2)
}
