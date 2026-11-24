/**
 * Pure Release Binary, Signed Installer & SBOM Artifact Vault Auditor.
 * Classifies and audits duplicate clusters across 4 Release Engineering & Supply-Chain families:
 * - Signed GA & LTS Installers (*.dmg, *.pkg, *.msi, *.exe, *.AppImage, *.deb, *.rpm, *.whl, *.nupkg in GA/LTS/release vaults)
 * - Pre-release & CI Builds (rc/beta/alpha/nightly/canary/dev installers and staging/download mirrors)
 * - Detached Signatures & Checksums (*.sig, *.asc, *.sha256, *.sha512, *.sha256sum, *.minisig, SHA256SUMS, CHECKSUMS.txt, *.sigstore.json)
 * - SBOM & Attestation Manifests (*.cdx.json, *.cdx.xml, *.spdx.json, *.spdx, *sbom*.json, *.intoto.jsonl)
 *
 * Groups artifacts deterministically by product + semver + target arch + channel,
 * protects latest GA and signed LTS releases by default, tracks detached signature & SBOM companions,
 * and computes safe reclaimable GB plus POSIX DRY_RUN=1 remediation scripts and CWE-1236 CSV exports.
 *
 * Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const RELEASE_BINARY_ARTIFACT_SCHEMA = 'duplicatefinder.release-binary-artifact-auditor.v1'

export const RELEASE_BINARY_FAMILIES = Object.freeze([
	'all',
	'signed-ga-and-lts-installers',
	'prerelease-and-ci-builds',
	'detached-signatures-and-checksums',
	'sbom-and-attestation-manifests',
])

export const RELEASE_BINARY_FAMILY_META = Object.freeze({
	'signed-ga-and-lts-installers': {
		id: 'signed-ga-and-lts-installers',
		label: 'Signed GA & LTS Installers',
		shortLabel: 'Installers (.dmg/.pkg/.msi/.exe/.AppImage/.deb/.rpm/.whl/.nupkg)',
	},
	'prerelease-and-ci-builds': {
		id: 'prerelease-and-ci-builds',
		label: 'Pre-release & CI Builds',
		shortLabel: 'Pre-releases (rc/beta/alpha/nightly/canary & staging mirrors)',
	},
	'detached-signatures-and-checksums': {
		id: 'detached-signatures-and-checksums',
		label: 'Detached Signatures & Checksums',
		shortLabel: 'Signatures (.sig/.asc/.sha256/.sha512/.minisig/SHA256SUMS)',
	},
	'sbom-and-attestation-manifests': {
		id: 'sbom-and-attestation-manifests',
		label: 'SBOM & Attestation Manifests',
		shortLabel: 'SBOMs (CycloneDX .cdx.json / SPDX .spdx.json / .intoto.jsonl)',
	},
})

export const RELEASE_BINARY_STRATEGIES = Object.freeze([
	'prune-superseded-prerelease-and-mirrors',
	'consolidate-release-vault-hardlinks',
	'prune-orphan-signatures-and-stale-sboms',
])

export const RELEASE_BINARY_SURVIVOR_RULES = Object.freeze([
	'signed-lts-and-ga-vault-first',
	'highest-semver-first',
	'sbom-attested-first',
	'shortest-path',
])

export const RELEASE_BINARY_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'latest-ga',
	'signed-lts',
	'signature-anchor',
	'sbom-manifest',
	'prerelease',
	'shielded',
])

export const RELEASE_BINARY_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'semver_desc',
	'copies_desc',
	'name_asc',
])

export const RELEASE_BINARY_PRESETS = Object.freeze([
	{
		id: 'all-release-vault-audit',
		name: 'All Release & SBOM Audit',
		description: 'Audit installers, pre-releases, detached signatures, and CycloneDX/SPDX SBOMs while shielding latest GA and signed LTS releases.',
		familyFilter: 'all',
		strategy: 'prune-superseded-prerelease-and-mirrors',
		survivorRule: 'signed-lts-and-ga-vault-first',
		protectLatestGa: true,
		protectSignedLts: true,
		keepPreviousGaVersions: 1,
		stalePrereleaseDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'prune-ci-prereleases-and-mirrors',
		name: 'Prune Stale RC & CI Mirrors',
		description: 'Reclaim stale nightly, canary, alpha, beta, and RC installers plus duplicate download mirrors older than the retention threshold.',
		familyFilter: 'prerelease-and-ci-builds',
		strategy: 'prune-superseded-prerelease-and-mirrors',
		survivorRule: 'highest-semver-first',
		protectLatestGa: true,
		protectSignedLts: true,
		keepPreviousGaVersions: 1,
		stalePrereleaseDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'consolidate-release-hardlinks',
		name: 'Hardlink-Consolidate Release Mirrors',
		description: 'Consolidate duplicate GA/LTS installers and SBOMs across mirror directories onto canonical signed vault anchors via hardlinks.',
		familyFilter: 'signed-ga-and-lts-installers',
		strategy: 'consolidate-release-vault-hardlinks',
		survivorRule: 'signed-lts-and-ga-vault-first',
		protectLatestGa: true,
		protectSignedLts: true,
		keepPreviousGaVersions: 1,
		stalePrereleaseDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'audit-signatures-and-checksums',
		name: 'Detached Signatures & Checksums',
		description: 'Inspect .sig, .asc, .sha256, .sha512, and SHA256SUMS duplicates while anchoring signatures bound to active GA/LTS installers.',
		familyFilter: 'detached-signatures-and-checksums',
		strategy: 'prune-orphan-signatures-and-stale-sboms',
		survivorRule: 'signed-lts-and-ga-vault-first',
		protectLatestGa: true,
		protectSignedLts: true,
		keepPreviousGaVersions: 1,
		stalePrereleaseDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'audit-sbom-compliance-vault',
		name: 'CycloneDX & SPDX SBOM Vault',
		description: 'Audit CycloneDX (.cdx.json/.cdx.xml), SPDX (.spdx.json/.spdx), and SLSA attestation manifests linked to production releases.',
		familyFilter: 'sbom-and-attestation-manifests',
		strategy: 'prune-orphan-signatures-and-stale-sboms',
		survivorRule: 'sbom-attested-first',
		protectLatestGa: true,
		protectSignedLts: true,
		keepPreviousGaVersions: 1,
		stalePrereleaseDays: 14,
		minSizeMb: 0,
	},
])

const INSTALLER_EXT_SET = new Set([
	'dmg',
	'pkg',
	'msi',
	'exe',
	'appimage',
	'deb',
	'rpm',
	'whl',
	'nupkg',
	'msix',
	'snap',
	'flatpak',
])

const SIGNATURE_EXT_SET = new Set([
	'sig',
	'asc',
	'sha256',
	'sha512',
	'sha256sum',
	'sha512sum',
	'minisig',
])

const CHECKSUM_BASENAME_RE = /^(?:sha256sums|sha512sums|checksums|digests)(?:\.[a-z0-9]+)?$/i
const SIGSTORE_BUNDLE_RE = /\.(?:sigstore\.json|sig\.json|bundle)$/i

const SBOM_FILENAME_RE = /(?:\.cdx\.(?:json|xml)|\.spdx(?:\.(?:json|xml|rdf|tag|yaml|yml))?|(?:^|[._-])(?:cyclonedx|spdx|sbom|bom)(?:[._-].*)?\.(?:json|xml|yaml|yml)|\.intoto\.jsonl|\.att\.json)$/i

const CANONICAL_RELEASE_VAULT_RE = /(\/releases?(?:\/|$)|\/release[_-]?vault(?:\/|$)|\/signed(?:\/|$)|\/ga(?:\/|$)|\/lts(?:\/|$)|\/official(?:\/|$)|\/dist[_-]?releases?(?:\/|$)|\/__groupfolders\/\d+\/(?:releases?|artifacts?|vault))/i
const LTS_PATH_OR_NAME_RE = /(?:^|[/._-])lts(?:[/._-]|$)/i
const SIGNED_HINT_RE = /(?:^|[/._-])(?:signed|notarized|codesigned|verified)(?:[/._-]|$)/i
const PRERELEASE_PATH_RE = /(\/nightly(?:\/|$)|\/canary(?:\/|$)|\/rc(?:\/|$)|\/beta(?:\/|$)|\/alpha(?:\/|$)|\/prerelease(?:\/|$)|\/pre-release(?:\/|$)|\/ci[_-]?artifacts?(?:\/|$)|\/build[_-]?artifacts?(?:\/|$)|\/snapshots?(?:\/|$))/i
const MIRROR_STAGING_PATH_RE = /(\/downloads?\/|\/telechargements?\/|\/tmp\/|\/temp\/|\/scratch\/|\/staging\/|\/mirrors?\/|\/incoming\/|\/dropzone\/|\/runner[_-]?cache\/|\/ci[_-]?cache\/)/i

const SEMVER_RE = /(?:^|[_/-]|v)(\d+)\.(\d+)\.(\d+)(?:-((?:rc|alpha|beta|nightly|canary|dev|pre|preview|snapshot|next)(?:[0-9a-zA-Z.]*)?))?(?:\+([0-9a-zA-Z.-]+))?(?=$|[_./-])/i
const TWO_PART_VER_RE = /(?:^|[_/-]|v)(\d+)\.(\d+)(?:-((?:rc|alpha|beta|nightly|canary|dev|pre|preview|snapshot|next)(?:[0-9a-zA-Z.]*)?))?(?=$|[_./-])/i

/**
 * Safely normalize a path string for deterministic inspection.
 *
 * @param {string} rawPath File path.
 * @return {string} Normalized POSIX-like path.
 */
function safeNormalizePath(rawPath) {
	if (!rawPath || typeof rawPath !== 'string') {
		return ''
	}
	return normalizePathForDiff(rawPath).replace(/\\/g, '/')
}

/**
 * Extract the basename from a normalized path.
 *
 * @param {string} filePath Normalized path.
 * @return {string} Basename.
 */
function getBasename(filePath) {
	const clean = safeNormalizePath(filePath).replace(/\/+$/, '')
	if (!clean) {
		return ''
	}
	const idx = clean.lastIndexOf('/')
	return idx >= 0 ? clean.slice(idx + 1) : clean
}

/**
 * Extract the directory path from a normalized path.
 *
 * @param {string} filePath Normalized path.
 * @return {string} Directory path.
 */
function getDirname(filePath) {
	const clean = safeNormalizePath(filePath).replace(/\/+$/, '')
	const idx = clean.lastIndexOf('/')
	return idx > 0 ? clean.slice(0, idx) : '/'
}

/**
 * Extract lowercase file extension without leading dot.
 *
 * @param {string} basename File basename.
 * @return {string} Lowercase extension.
 */
function getExtension(basename) {
	if (!basename || typeof basename !== 'string') {
		return ''
	}
	const dotIdx = basename.lastIndexOf('.')
	if (dotIdx <= 0 || dotIdx === basename.length - 1) {
		return ''
	}
	return basename.slice(dotIdx + 1).toLowerCase()
}

/**
 * Strip detached signature / checksum suffixes to recover the target installer basename.
 *
 * @param {string} basename Signature or checksum basename.
 * @return {string} Underlying artifact basename or empty string.
 */
function stripSignatureSuffix(basename) {
	if (!basename || typeof basename !== 'string') {
		return ''
	}
	let stripped = basename
	stripped = stripped.replace(/\.(?:sigstore\.json|sig\.json|bundle)$/i, '')
	stripped = stripped.replace(/\.(?:sig|asc|sha256|sha512|sha256sum|sha512sum|minisig)$/i, '')
	return stripped === basename ? '' : stripped
}

/**
 * Strip SBOM suffixes to recover the base release stem.
 *
 * @param {string} basename SBOM basename.
 * @return {string} Normalized base stem.
 */
function stripSbomSuffix(basename) {
	if (!basename || typeof basename !== 'string') {
		return ''
	}
	return basename
		.replace(/\.(?:cdx\.(?:json|xml)|spdx(?:\.(?:json|xml|rdf|tag|yaml|yml))?|intoto\.jsonl|att\.json)$/i, '')
		.replace(/[._-]?(?:cyclonedx|spdx|sbom|bom)(?:[._-].*)?\.(?:json|xml|yaml|yml)$/i, '')
}

/**
 * Detect SBOM format tag from basename.
 *
 * @param {string} basename File basename.
 * @return {string} SBOM format label or empty string.
 */
function detectSbomFormat(basename) {
	const lower = basename.toLowerCase()
	if (lower.includes('.cdx.') || lower.includes('cyclonedx')) {
		return 'CycloneDX'
	}
	if (lower.includes('.spdx') || lower.includes('spdx')) {
		return 'SPDX'
	}
	if (lower.endsWith('.intoto.jsonl') || lower.endsWith('.att.json')) {
		return 'SLSA/in-toto'
	}
	if (SBOM_FILENAME_RE.test(basename)) {
		return 'SBOM'
	}
	return ''
}

/**
 * Detect signature/checksum type label from basename.
 *
 * @param {string} basename File basename.
 * @return {string} Signature format label or empty string.
 */
function detectSignatureFormat(basename) {
	const lower = basename.toLowerCase()
	if (lower.endsWith('.sigstore.json') || lower.endsWith('.bundle')) {
		return 'Sigstore'
	}
	if (lower.endsWith('.minisig')) {
		return 'Minisign'
	}
	if (lower.endsWith('.asc')) {
		return 'GPG/PGP (.asc)'
	}
	if (lower.endsWith('.sig')) {
		return 'Detached (.sig)'
	}
	if (lower.endsWith('.sha512') || lower.endsWith('.sha512sum') || lower.startsWith('sha512sums')) {
		return 'SHA-512'
	}
	if (lower.endsWith('.sha256') || lower.endsWith('.sha256sum') || lower.startsWith('sha256sums') || CHECKSUM_BASENAME_RE.test(basename)) {
		return 'SHA-256'
	}
	return ''
}

/**
 * Parse semantic version from filename or path.
 *
 * @param {string} basename File basename.
 * @param {string} fullPath Full normalized path.
 * @return {object} Parsed semver metadata.
 */
export function parseArtifactSemver(basename, fullPath = '') {
	const source = `${basename} ${fullPath}`
	const match = SEMVER_RE.exec(basename) || SEMVER_RE.exec(source)
	if (match) {
		const major = Number.parseInt(match[1], 10)
		const minor = Number.parseInt(match[2], 10)
		const patch = Number.parseInt(match[3], 10)
		const prerelease = (match[4] || '').trim()
		const build = (match[5] || '').trim()
		const raw = `${major}.${minor}.${patch}${prerelease ? `-${prerelease}` : ''}`
		return {
			valid: true,
			major,
			minor,
			patch,
			prerelease,
			build,
			raw,
		}
	}

	const shortMatch = TWO_PART_VER_RE.exec(basename)
	if (shortMatch) {
		const major = Number.parseInt(shortMatch[1], 10)
		const minor = Number.parseInt(shortMatch[2], 10)
		const prerelease = (shortMatch[3] || '').trim()
		return {
			valid: true,
			major,
			minor,
			patch: 0,
			prerelease,
			build: '',
			raw: `${major}.${minor}.0${prerelease ? `-${prerelease}` : ''}`,
		}
	}

	return {
		valid: false,
		major: 0,
		minor: 0,
		patch: 0,
		prerelease: '',
		build: '',
		raw: '0.0.0',
	}
}

/**
 * Compare two parsed semver objects (descending when used as b - a).
 * Follows SemVer 2.0 precedence: GA (empty prerelease) > prerelease for same major.minor.patch.
 *
 * @param {object} a First semver.
 * @param {object} b Second semver.
 * @return {number} Negative if a < b, positive if a > b, 0 if equal.
 */
export function compareSemver(a, b) {
	const va = a || { valid: false, major: 0, minor: 0, patch: 0, prerelease: '' }
	const vb = b || { valid: false, major: 0, minor: 0, patch: 0, prerelease: '' }
	if (va.valid !== vb.valid) {
		return va.valid ? 1 : -1
	}
	if (va.major !== vb.major) {
		return va.major - vb.major
	}
	if (va.minor !== vb.minor) {
		return va.minor - vb.minor
	}
	if (va.patch !== vb.patch) {
		return va.patch - vb.patch
	}
	const preA = va.prerelease || ''
	const preB = vb.prerelease || ''
	if (!preA && preB) {
		return 1
	}
	if (preA && !preB) {
		return -1
	}
	if (preA === preB) {
		return 0
	}
	return preA.localeCompare(preB, undefined, { numeric: true, sensitivity: 'base' })
}

/**
 * Detect target CPU architecture from filename and path.
 *
 * @param {string} basename File basename.
 * @param {string} fullPath Full normalized path.
 * @return {string} Normalized target architecture.
 */
export function detectTargetArch(basename, fullPath = '') {
	const text = `${basename} ${fullPath}`.toLowerCase()
	if (/(?:^|[/._-])(?:universal2?|fat)(?:[/._-]|$)/.test(text)) {
		return 'universal'
	}
	if (/(?:^|[/._-])(?:arm64|aarch64|apple-silicon|m[1-4])(?:[/._-]|$)/.test(text)) {
		return 'arm64'
	}
	if (/(?:^|[/._-])(?:x86_64|amd64|x64|win64|intel64)(?:[/._-]|$)/.test(text)) {
		return 'x86_64'
	}
	if (/(?:^|[/._-])(?:armv7l?|armhf)(?:[/._-]|$)/.test(text)) {
		return 'armv7'
	}
	if (/(?:^|[/._-])(?:i386|i686|x86|win32|ia32)(?:[/._-]|$)/.test(text)) {
		return 'x86'
	}
	if (/(?:^|[/._-])(?:py3-none-any|noarch|any)(?:[/._-]|$)/.test(text)) {
		return 'noarch'
	}
	return 'noarch'
}

/**
 * Detect target OS / packaging ecosystem from extension and path.
 *
 * @param {string} ext File extension.
 * @param {string} basename File basename.
 * @param {string} fullPath Full normalized path.
 * @return {string} Platform label.
 */
function detectTargetPlatform(ext, basename, fullPath = '') {
	if (ext === 'dmg' || ext === 'pkg') {
		return 'macOS'
	}
	if (ext === 'msi' || ext === 'exe' || ext === 'msix') {
		return 'Windows'
	}
	if (ext === 'appimage' || ext === 'deb' || ext === 'rpm' || ext === 'snap' || ext === 'flatpak') {
		return 'Linux'
	}
	if (ext === 'whl') {
		return 'Python'
	}
	if (ext === 'nupkg') {
		return '.NET'
	}
	const lower = `${basename} ${fullPath}`.toLowerCase()
	if (/(?:macos|darwin|osx)/.test(lower)) {
		return 'macOS'
	}
	if (/(?:windows|win64|win32)/.test(lower)) {
		return 'Windows'
	}
	if (/(?:linux|ubuntu|debian|fedora|rhel)/.test(lower)) {
		return 'Linux'
	}
	return 'Cross-platform'
}

/**
 * Detect release channel (lts, ga, rc, beta, alpha, nightly, dev).
 *
 * @param {string} basename File basename.
 * @param {string} fullPath Full normalized path.
 * @param {object} semver Parsed semver object.
 * @return {string} Channel identifier.
 */
export function detectReleaseChannel(basename, fullPath = '', semver = null) {
	const pre = (semver && semver.prerelease ? semver.prerelease : '').toLowerCase()
	const text = `${basename} ${fullPath}`.toLowerCase()

	if (pre.includes('nightly') || pre.includes('canary') || /(?:^|[/._-])(?:nightly|canary)(?:[/._-]|$)/.test(text)) {
		return 'nightly'
	}
	if (pre.includes('alpha') || /(?:^|[/._-])alpha(?:\d+)?(?:[/._-]|$)/.test(text)) {
		return 'alpha'
	}
	if (pre.includes('beta') || /(?:^|[/._-])beta(?:\d+)?(?:[/._-]|$)/.test(text)) {
		return 'beta'
	}
	if (/(?:^|[._-])rc\d*(?:[._-]|$)/.test(pre) || /(?:^|[/._-])rc\d*(?:[/._-]|$)/.test(text)) {
		return 'rc'
	}
	if (pre.includes('dev') || pre.includes('snapshot') || /(?:^|[/._-])(?:snapshot|devbuild|ci-build)(?:[/._-]|$)/.test(text)) {
		return 'dev'
	}
	if (LTS_PATH_OR_NAME_RE.test(text)) {
		return 'lts'
	}
	if (pre.length > 0) {
		return 'rc'
	}
	return 'ga'
}

/**
 * Extract canonical product identifier from artifact filename or parent directory.
 *
 * @param {string} basename File basename.
 * @param {string} fullPath Full normalized path.
 * @return {string} Normalized product name.
 */
export function extractProductName(basename, fullPath = '') {
	let stem = stripSignatureSuffix(basename) || basename
	if (SBOM_FILENAME_RE.test(stem)) {
		stem = stripSbomSuffix(stem)
	}
	// Remove known installer extension
	stem = stem.replace(/\.(?:dmg|pkg|msi|exe|appimage|deb|rpm|whl|nupkg|msix|snap|flatpak|json|xml|txt)$/i, '')

	// If checksum file like SHA256SUMS, infer product from parent folder
	if (!stem || CHECKSUM_BASENAME_RE.test(basename)) {
		const segments = safeNormalizePath(fullPath).split('/').filter(Boolean)
		const candidate = segments.length >= 2 ? segments[segments.length - 2] : 'release-bundle'
		return candidate.toLowerCase().replace(/[^a-z0-9._-]+/g, '-')
	}

	// Cut at semver boundary
	const verMatch = SEMVER_RE.exec(stem) || TWO_PART_VER_RE.exec(stem)
	if (verMatch && verMatch.index > 0) {
		stem = stem.slice(0, verMatch.index)
	}

	// Trim trailing separators, arch/channel/os tokens
	stem = stem
		.replace(/[._-]+(?:v|ver|version|release|lts|ga|signed|notarized|rc\d*|beta\d*|alpha\d*|nightly|canary|arm64|aarch64|x86_64|amd64|x64|win64|win32|universal2?|macos|darwin|linux|windows|py3|none|any)+$/gi, '')
		.replace(/^[._-]+|[._-]+$/g, '')

	if (!stem) {
		return 'unknown-product'
	}
	return stem.toLowerCase().replace(/[^a-z0-9._-]+/g, '-')
}

/**
 * Classify a single file into one of the 4 Release Binary & SBOM Vault families.
 *
 * @param {object} file Duplicate file entry.
 * @return {object|null} Classification metadata or null if unrelated.
 */
export function classifyReleaseArtifactFile(file) {
	if (!file || typeof file !== 'object') {
		return null
	}
	const path = safeNormalizePath(file.path || file.filePath || '')
	const basename = getBasename(path)
	if (!basename) {
		return null
	}
	const ext = getExtension(basename)

	const isSbom = SBOM_FILENAME_RE.test(basename)
	const isSignature = !isSbom && (
		SIGNATURE_EXT_SET.has(ext)
		|| CHECKSUM_BASENAME_RE.test(basename)
		|| SIGSTORE_BUNDLE_RE.test(basename)
	)
	const isInstaller = !isSbom && !isSignature && INSTALLER_EXT_SET.has(ext)

	if (!isSbom && !isSignature && !isInstaller) {
		return null
	}

	const semver = parseArtifactSemver(basename, path)
	const targetArch = detectTargetArch(basename, path)
	const channel = detectReleaseChannel(basename, path, semver)
	const product = extractProductName(basename, path)
	const platform = detectTargetPlatform(ext, basename, path)
	const isPrereleaseChannel = channel === 'rc' || channel === 'beta' || channel === 'alpha' || channel === 'nightly' || channel === 'dev'
	const inCanonicalVault = CANONICAL_RELEASE_VAULT_RE.test(path) && !MIRROR_STAGING_PATH_RE.test(path)
	const inStagingMirror = MIRROR_STAGING_PATH_RE.test(path)
	const hasSignedHint = SIGNED_HINT_RE.test(path) || SIGNED_HINT_RE.test(basename)

	let family = 'signed-ga-and-lts-installers'
	let artifactKind = 'installer'
	let formatBadge = ext ? `.${ext}` : 'binary'

	if (isSbom) {
		family = 'sbom-and-attestation-manifests'
		artifactKind = 'sbom'
		formatBadge = detectSbomFormat(basename) || 'SBOM'
	} else if (isSignature) {
		family = 'detached-signatures-and-checksums'
		artifactKind = 'signature'
		formatBadge = detectSignatureFormat(basename) || 'Signature'
	} else if (isPrereleaseChannel || PRERELEASE_PATH_RE.test(path)) {
		family = 'prerelease-and-ci-builds'
		artifactKind = 'prerelease-installer'
	}

	const releaseKey = `${product}@${semver.raw}/${targetArch}/${channel}`
	const lineKey = `${product}/${targetArch}`
	const targetInstallerBasename = isSignature ? stripSignatureSuffix(basename) : ''

	return {
		path,
		dirname: getDirname(path),
		basename,
		ext,
		family,
		artifactKind,
		formatBadge,
		product,
		semver,
		targetArch,
		platform,
		channel,
		isPrereleaseChannel,
		isLts: channel === 'lts',
		isGa: channel === 'ga',
		inCanonicalVault,
		inStagingMirror,
		hasSignedHint,
		releaseKey,
		lineKey,
		targetInstallerBasename,
	}
}

/**
 * Normalize epoch timestamp in seconds.
 *
 * @param {number|string|null|undefined} rawMtime Timestamp in seconds or ms.
 * @return {number} Epoch seconds or 0.
 */
function normalizeMtimeSec(rawMtime) {
	const num = Number(rawMtime)
	if (!Number.isFinite(num) || num <= 0) {
		return 0
	}
	return num > 1e12 ? Math.floor(num / 1000) : Math.floor(num)
}

/**
 * Format bytes as GB string with 2 decimals (e.g. "1.42 GB").
 *
 * @param {number} bytes Byte count.
 * @return {string} Formatted GB string.
 */
export function formatGigabytes(bytes) {
	const safe = Number.isFinite(bytes) && bytes > 0 ? bytes : 0
	const gb = safe / (1024 * 1024 * 1024)
	return `${gb.toFixed(2)} GB`
}

/**
 * Build cross-dataset attestation & semver index so installers know whether
 * detached signatures, SBOMs, or newer GA/LTS versions exist in the vault.
 *
 * @param {Array<object>} duplicateGroups Raw duplicate groups.
 * @return {object} Cross-group index.
 */
function buildVaultAttestationIndex(duplicateGroups) {
	const signedTargetsByBasename = new Set()
	const signedReleaseKeys = new Set()
	const signedDirKeys = new Set()
	const sbomReleaseKeys = new Set()
	const sbomProductVersions = new Set()
	const gaVersionsByLine = new Map()
	const ltsVersionsByLine = new Map()
	let maxMtimeSec = 0

	for (const group of duplicateGroups) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (const file of group.files) {
			const mtime = normalizeMtimeSec(file && file.mtime)
			if (mtime > maxMtimeSec) {
				maxMtimeSec = mtime
			}
			const meta = classifyReleaseArtifactFile(file)
			if (!meta) {
				continue
			}

			if (meta.artifactKind === 'signature') {
				if (meta.targetInstallerBasename) {
					signedTargetsByBasename.add(meta.targetInstallerBasename.toLowerCase())
				}
				signedReleaseKeys.add(`${meta.product}@${meta.semver.raw}`)
				if (CHECKSUM_BASENAME_RE.test(meta.basename)) {
					signedDirKeys.add(meta.dirname.toLowerCase())
				}
			} else if (meta.artifactKind === 'sbom') {
				sbomReleaseKeys.add(meta.releaseKey)
				sbomProductVersions.add(`${meta.product}@${meta.semver.raw}`)
			} else if (meta.artifactKind === 'installer') {
				if (meta.isGa && meta.semver.valid) {
					if (!gaVersionsByLine.has(meta.lineKey)) {
						gaVersionsByLine.set(meta.lineKey, new Map())
					}
					gaVersionsByLine.get(meta.lineKey).set(meta.semver.raw, meta.semver)
				}
				if (meta.isLts && meta.semver.valid) {
					if (!ltsVersionsByLine.has(meta.lineKey)) {
						ltsVersionsByLine.set(meta.lineKey, new Map())
					}
					ltsVersionsByLine.get(meta.lineKey).set(meta.semver.raw, meta.semver)
				}
			}
		}
	}

	// Sort GA versions per (product, arch) descending to identify latest GA and retention window
	const gaRankByLineAndSemver = new Map()
	for (const [lineKey, semverMap] of gaVersionsByLine.entries()) {
		const sorted = Array.from(semverMap.values()).sort((a, b) => compareSemver(b, a))
		sorted.forEach((sv, idx) => {
			gaRankByLineAndSemver.set(`${lineKey}@${sv.raw}`, idx)
		})
	}

	const ltsRankByLineAndSemver = new Map()
	for (const [lineKey, semverMap] of ltsVersionsByLine.entries()) {
		const sorted = Array.from(semverMap.values()).sort((a, b) => compareSemver(b, a))
		sorted.forEach((sv, idx) => {
			ltsRankByLineAndSemver.set(`${lineKey}@${sv.raw}`, idx)
		})
	}

	return {
		signedTargetsByBasename,
		signedReleaseKeys,
		signedDirKeys,
		sbomReleaseKeys,
		sbomProductVersions,
		gaRankByLineAndSemver,
		ltsRankByLineAndSemver,
		referenceNowSec: maxMtimeSec > 0 ? maxMtimeSec : Math.floor(Date.now() / 1000),
	}
}

/**
 * Score a file copy's authority as canonical survivor anchor (0-100).
 *
 * @param {object} member Classified file member.
 * @param {string} survivorRule Selected survivor rule.
 * @return {number} Authority score 0-100.
 */
function computeMemberAuthorityScore(member, survivorRule) {
	let score = 40

	if (member.meta.inCanonicalVault) {
		score += 32
	}
	if (member.meta.inStagingMirror) {
		score -= 28
	}
	if (member.meta.isLts) {
		score += 12
	} else if (member.meta.isGa) {
		score += 8
	} else if (member.meta.isPrereleaseChannel) {
		score -= 10
	}
	if (member.hasDetachedSignature || member.meta.hasSignedHint) {
		score += 12
	}
	if (member.hasSbomCompanion) {
		score += 10
	}
	if (member.isInOriginFolder) {
		score += 18
	}

	if (survivorRule === 'highest-semver-first') {
		score += Math.min(15, member.meta.semver.major * 3 + Math.min(5, member.meta.semver.minor))
	} else if (survivorRule === 'sbom-attested-first') {
		if (member.hasSbomCompanion) {
			score += 18
		}
		if (member.hasDetachedSignature) {
			score += 10
		}
	} else if (survivorRule === 'shortest-path') {
		const depth = member.meta.path.split('/').filter(Boolean).length
		score += Math.max(-15, 18 - depth * 3)
	}

	return Math.max(5, Math.min(100, Math.round(score)))
}

/**
 * Compare two members to pick the canonical survivor.
 *
 * @param {object} a First member.
 * @param {object} b Second member.
 * @param {string} survivorRule Survivor rule.
 * @return {number} Sort comparator result.
 */
function compareSurvivorCandidates(a, b, survivorRule) {
	if (a.isInOriginFolder !== b.isInOriginFolder) {
		return a.isInOriginFolder ? -1 : 1
	}

	if (survivorRule === 'highest-semver-first') {
		const semverCmp = compareSemver(b.meta.semver, a.meta.semver)
		if (semverCmp !== 0) {
			return semverCmp
		}
	} else if (survivorRule === 'sbom-attested-first') {
		if (a.hasSbomCompanion !== b.hasSbomCompanion) {
			return a.hasSbomCompanion ? -1 : 1
		}
		if (a.hasDetachedSignature !== b.hasDetachedSignature) {
			return a.hasDetachedSignature ? -1 : 1
		}
	} else if (survivorRule === 'shortest-path') {
		if (a.meta.path.length !== b.meta.path.length) {
			return a.meta.path.length - b.meta.path.length
		}
	}

	if (a.authorityScore !== b.authorityScore) {
		return b.authorityScore - a.authorityScore
	}
	if (a.meta.inCanonicalVault !== b.meta.inCanonicalVault) {
		return a.meta.inCanonicalVault ? -1 : 1
	}
	if (a.mtimeSec !== b.mtimeSec) {
		return b.mtimeSec - a.mtimeSec
	}
	return a.meta.path.localeCompare(b.meta.path)
}

/**
 * Analyze duplicate groups for Release Binary, Signed Installer & SBOM Artifact Vault governance.
 *
 * @param {Array<object>} duplicateGroups Array of duplicate group objects.
 * @param {object} [options] Analysis configuration options.
 * @return {object} Deterministic audit report.
 */
export function analyzeReleaseBinaryArtifacts(duplicateGroups, options = {}) {
	const groups = Array.isArray(duplicateGroups) ? duplicateGroups.filter(Boolean) : []
	const familyFilter = RELEASE_BINARY_FAMILIES.includes(options.familyFilter) ? options.familyFilter : 'all'
	const verdictFilter = RELEASE_BINARY_VERDICT_FILTERS.includes(options.verdictFilter) ? options.verdictFilter : 'all'
	const sortMode = RELEASE_BINARY_SORT_MODES.includes(options.sortMode) ? options.sortMode : 'reclaim_desc'
	const strategy = RELEASE_BINARY_STRATEGIES.includes(options.strategy)
		? options.strategy
		: 'prune-superseded-prerelease-and-mirrors'
	const survivorRule = RELEASE_BINARY_SURVIVOR_RULES.includes(options.survivorRule)
		? options.survivorRule
		: 'signed-lts-and-ga-vault-first'

	const protectLatestGa = options.protectLatestGa !== false
	const protectSignedLts = options.protectSignedLts !== false
	const keepPreviousGaVersions = Number.isFinite(Number(options.keepPreviousGaVersions)) && Number(options.keepPreviousGaVersions) >= 0
		? Math.floor(Number(options.keepPreviousGaVersions))
		: 1
	const stalePrereleaseDays = Number.isFinite(Number(options.stalePrereleaseDays)) && Number(options.stalePrereleaseDays) >= 0
		? Number(options.stalePrereleaseDays)
		: 14
	const minSizeMb = Number.isFinite(Number(options.minSizeMb)) && Number(options.minSizeMb) > 0
		? Number(options.minSizeMb)
		: 0
	const minSizeBytes = minSizeMb * 1024 * 1024
	const searchQuery = typeof options.searchQuery === 'string' ? options.searchQuery.trim().toLowerCase() : ''
	const memberOverrides = options.memberOverrides && typeof options.memberOverrides === 'object'
		? options.memberOverrides
		: {}

	const index = buildVaultAttestationIndex(groups)
	const referenceNowSec = Number.isFinite(Number(options.referenceNowSec)) && Number(options.referenceNowSec) > 0
		? Number(options.referenceNowSec)
		: index.referenceNowSec

	const allClusters = []

	for (const group of groups) {
		const files = Array.isArray(group.files) ? group.files.filter(Boolean) : []
		if (files.length < 2) {
			continue
		}

		const classifiedMembers = []
		for (const file of files) {
			const meta = classifyReleaseArtifactFile(file)
			if (!meta) {
				continue
			}
			const size = Number.isFinite(Number(file.size)) && Number(file.size) > 0
				? Number(file.size)
				: (Number.isFinite(Number(group.size)) ? Number(group.size) : 0)
			const mtimeSec = normalizeMtimeSec(file.mtime)
			const ageDays = mtimeSec > 0 ? Math.max(0, Math.round(((referenceNowSec - mtimeSec) / 86400) * 10) / 10) : 0
			const hasDetachedSignature = meta.artifactKind === 'signature'
				|| meta.hasSignedHint
				|| index.signedTargetsByBasename.has(meta.basename.toLowerCase())
				|| index.signedReleaseKeys.has(`${meta.product}@${meta.semver.raw}`)
				|| index.signedDirKeys.has(meta.dirname.toLowerCase())
			const hasSbomCompanion = meta.artifactKind === 'sbom'
				|| index.sbomReleaseKeys.has(meta.releaseKey)
				|| index.sbomProductVersions.has(`${meta.product}@${meta.semver.raw}`)
			const gaRank = index.gaRankByLineAndSemver.has(`${meta.lineKey}@${meta.semver.raw}`)
				? index.gaRankByLineAndSemver.get(`${meta.lineKey}@${meta.semver.raw}`)
				: null
			const ltsRank = index.ltsRankByLineAndSemver.has(`${meta.lineKey}@${meta.semver.raw}`)
				? index.ltsRankByLineAndSemver.get(`${meta.lineKey}@${meta.semver.raw}`)
				: null

			const selectionKey = getFileSelectionKey(file)
			const member = {
				file,
				id: file.id ?? file.nodeId ?? selectionKey,
				selectionKey,
				path: meta.path,
				basename: meta.basename,
				size,
				formattedSize: formatBytes(size),
				mtimeSec,
				formattedMtime: formatFileModifiedTime(mtimeSec),
				ageDays,
				isInOriginFolder: Boolean(file.isInOriginFolder),
				hasDetachedSignature,
				hasSbomCompanion,
				gaRank,
				ltsRank,
				meta,
				authorityScore: 0,
				verdict: 'keep-canonical-survivor',
				verdictReason: '',
				actionType: 'keep',
			}
			member.authorityScore = computeMemberAuthorityScore(member, survivorRule)
			classifiedMembers.push(member)
		}

		if (classifiedMembers.length < 2) {
			continue
		}

		// Pick canonical survivor deterministically
		classifiedMembers.sort((a, b) => compareSurvivorCandidates(a, b, survivorRule))
		const survivor = classifiedMembers[0]
		const primaryMeta = survivor.meta
		const family = primaryMeta.family
		const familyMeta = RELEASE_BINARY_FAMILY_META[family] || RELEASE_BINARY_FAMILY_META['signed-ga-and-lts-installers']
		const isLatestGaCluster = primaryMeta.isGa && survivor.gaRank === 0
		const isRetainedGaCluster = primaryMeta.isGa && survivor.gaRank !== null && survivor.gaRank > 0 && survivor.gaRank <= keepPreviousGaVersions
		const isSignedLtsCluster = primaryMeta.isLts && (survivor.hasDetachedSignature || primaryMeta.hasSignedHint)
		const clusterHasSignature = classifiedMembers.some(m => m.hasDetachedSignature)
		const clusterHasSbom = classifiedMembers.some(m => m.hasSbomCompanion)

		let reclaimableBytes = 0
		let reclaimableCopiesCount = 0
		let consolidatableCopiesCount = 0
		let shieldedCopiesCount = 0

		classifiedMembers.forEach((member, idx) => {
			const override = memberOverrides[member.selectionKey] || 'auto'

			if (idx === 0) {
				member.verdict = 'keep-canonical-survivor'
				member.actionType = 'keep'
				member.verdictReason = member.meta.inCanonicalVault
					? 'Canonical release vault anchor'
					: 'Highest-authority release survivor'
				shieldedCopiesCount += 1
				return
			}

			if (override === 'keep') {
				member.verdict = 'blocked-manual-shield'
				member.actionType = 'keep'
				member.verdictReason = 'Manually shielded by operator'
				shieldedCopiesCount += 1
				return
			}

			if (override === 'prune') {
				member.verdict = strategy === 'consolidate-release-vault-hardlinks'
					? 'consolidate-hardlink-mirror'
					: 'reclaim-duplicate-artifact'
				member.actionType = strategy === 'consolidate-release-vault-hardlinks' ? 'hardlink' : 'prune'
				member.verdictReason = 'Operator override: marked for safe remediation'
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				if (member.actionType === 'hardlink') {
					consolidatableCopiesCount += 1
				}
				return
			}

			if (member.isInOriginFolder) {
				member.verdict = 'blocked-origin-folder'
				member.actionType = 'keep'
				member.verdictReason = 'Protected Nextcloud origin folder'
				shieldedCopiesCount += 1
				return
			}

			// Protect canonical vault copies of latest GA releases
			if (protectLatestGa && isLatestGaCluster && member.meta.inCanonicalVault && strategy !== 'consolidate-release-vault-hardlinks') {
				member.verdict = 'blocked-latest-ga-release'
				member.actionType = 'keep'
				member.verdictReason = `Latest GA v${member.meta.semver.raw} (${member.meta.targetArch}) protected in canonical vault`
				shieldedCopiesCount += 1
				return
			}

			// Protect signed LTS copies in canonical vault
			if (protectSignedLts && isSignedLtsCluster && member.meta.inCanonicalVault && strategy !== 'consolidate-release-vault-hardlinks') {
				member.verdict = 'blocked-signed-lts-release'
				member.actionType = 'keep'
				member.verdictReason = `Signed LTS v${member.meta.semver.raw} protected for long-term support compliance`
				shieldedCopiesCount += 1
				return
			}

			// Protect retained GA window copies inside canonical vault
			if (protectLatestGa && isRetainedGaCluster && member.meta.inCanonicalVault && strategy !== 'consolidate-release-vault-hardlinks') {
				member.verdict = 'blocked-retained-ga-window'
				member.actionType = 'keep'
				member.verdictReason = `Within GA retention window (keep ${keepPreviousGaVersions} previous GA)`
				shieldedCopiesCount += 1
				return
			}

			// Protect recent pre-release / CI artifacts inside canonical vault
			if (
				family === 'prerelease-and-ci-builds'
				&& !member.meta.inStagingMirror
				&& member.ageDays < stalePrereleaseDays
			) {
				member.verdict = 'blocked-recent-prerelease'
				member.actionType = 'keep'
				member.verdictReason = `Recent ${member.meta.channel} build (${member.ageDays}d < ${stalePrereleaseDays}d threshold)`
				shieldedCopiesCount += 1
				return
			}

			// Protect canonical vault detached signatures & SBOMs tied to live releases unless in staging/mirror
			if (
				family === 'detached-signatures-and-checksums'
				&& protectSignedLts
				&& member.meta.inCanonicalVault
				&& strategy !== 'consolidate-release-vault-hardlinks'
			) {
				member.verdict = 'blocked-signature-anchor'
				member.actionType = 'keep'
				member.verdictReason = 'Detached signature/checksum anchor inside canonical release vault'
				shieldedCopiesCount += 1
				return
			}

			if (
				family === 'sbom-and-attestation-manifests'
				&& protectSignedLts
				&& member.meta.inCanonicalVault
				&& strategy !== 'consolidate-release-vault-hardlinks'
			) {
				member.verdict = 'blocked-sbom-compliance-anchor'
				member.actionType = 'keep'
				member.verdictReason = `${member.meta.formatBadge} compliance manifest anchored in release vault`
				shieldedCopiesCount += 1
				return
			}

			// Apply strategy-specific remediation verdict
			if (strategy === 'consolidate-release-vault-hardlinks') {
				member.verdict = 'consolidate-hardlink-mirror'
				member.actionType = 'hardlink'
				member.verdictReason = `Hardlink-consolidate onto ${survivor.basename} anchor`
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				consolidatableCopiesCount += 1
				return
			}

			if (strategy === 'prune-orphan-signatures-and-stale-sboms') {
				if (family === 'detached-signatures-and-checksums' || family === 'sbom-and-attestation-manifests' || member.meta.inStagingMirror) {
					member.verdict = member.meta.inStagingMirror ? 'reclaim-mirror-copy' : 'reclaim-duplicate-metadata'
					member.actionType = 'prune'
					member.verdictReason = member.meta.inStagingMirror
						? 'Redundant staging/mirror copy of attested release artifact'
						: 'Duplicate signature or SBOM copy outside canonical anchor'
					reclaimableBytes += member.size
					reclaimableCopiesCount += 1
					return
				}
				member.verdict = 'blocked-strategy-scope'
				member.actionType = 'keep'
				member.verdictReason = 'Outside signature/SBOM cleanup strategy scope'
				shieldedCopiesCount += 1
				return
			}

			// Default strategy: prune-superseded-prerelease-and-mirrors
			if (member.meta.inStagingMirror) {
				member.verdict = 'reclaim-mirror-copy'
				member.actionType = 'prune'
				member.verdictReason = 'Redundant download/staging mirror duplicate'
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				return
			}

			if (family === 'prerelease-and-ci-builds') {
				member.verdict = 'reclaim-stale-prerelease'
				member.actionType = 'prune'
				member.verdictReason = `Stale ${member.meta.channel} build copy (${member.ageDays}d old)`
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				return
			}

			member.verdict = 'reclaim-superseded-release'
			member.actionType = 'prune'
			member.verdictReason = 'Superseded duplicate release copy outside protected GA/LTS anchor'
			reclaimableBytes += member.size
			reclaimableCopiesCount += 1
		})

		const rawInfo = computeGroupReclaimableInfo({ ...group, files })
		const rawDuplicateBytes = rawInfo.reclaimableBytes || Math.max(0, (classifiedMembers.length - 1) * survivor.size)

		let riskState = 'reclaimable'
		let riskPriority = 2
		if (reclaimableCopiesCount === 0) {
			if (isSignedLtsCluster) {
				riskState = 'signed-lts-protected'
				riskPriority = 5
			} else if (isLatestGaCluster) {
				riskState = 'latest-ga-protected'
				riskPriority = 4
			} else if (family === 'sbom-and-attestation-manifests') {
				riskState = 'sbom-compliance-anchored'
				riskPriority = 4
			} else if (family === 'detached-signatures-and-checksums') {
				riskState = 'signature-anchored'
				riskPriority = 4
			} else {
				riskState = 'shielded'
				riskPriority = 3
			}
		} else if (consolidatableCopiesCount > 0) {
			riskState = 'consolidatable'
			riskPriority = 3
		} else if (family === 'prerelease-and-ci-builds') {
			riskState = 'prerelease-reclaimable'
			riskPriority = 2
		}

		allClusters.push({
			groupKey: `${group.id ?? group.hash ?? primaryMeta.releaseKey}::${primaryMeta.releaseKey}`,
			primaryGroupId: group.id ?? null,
			hash: group.hash || '',
			family,
			familyLabel: familyMeta.label,
			familyShortLabel: familyMeta.shortLabel,
			product: primaryMeta.product,
			semver: primaryMeta.semver,
			semverRaw: primaryMeta.semver.raw,
			targetArch: primaryMeta.targetArch,
			platform: primaryMeta.platform,
			channel: primaryMeta.channel,
			formatBadge: primaryMeta.formatBadge,
			releaseKey: primaryMeta.releaseKey,
			displayName: survivor.basename,
			isLatestGa: isLatestGaCluster,
			isSignedLts: isSignedLtsCluster,
			hasDetachedSignature: clusterHasSignature,
			hasSbomCompanion: clusterHasSbom,
			riskState,
			riskPriority,
			copiesCount: classifiedMembers.length,
			reclaimableBytes,
			formattedReclaimableBytes: formatBytes(reclaimableBytes),
			reclaimableGb: formatGigabytes(reclaimableBytes),
			rawDuplicateBytes,
			formattedRawDuplicateBytes: formatBytes(rawDuplicateBytes),
			reclaimableCopiesCount,
			consolidatableCopiesCount,
			shieldedCopiesCount,
			survivor,
			members: classifiedMembers,
		})
	}

	// Build family breakdown before applying family/verdict/search filters
	const familyBreakdown = Object.keys(RELEASE_BINARY_FAMILY_META).map(famId => {
		const famClusters = allClusters.filter(c => c.family === famId)
		const famReclaim = famClusters.reduce((acc, c) => acc + c.reclaimableBytes, 0)
		return {
			id: famId,
			label: RELEASE_BINARY_FAMILY_META[famId].label,
			shortLabel: RELEASE_BINARY_FAMILY_META[famId].shortLabel,
			clustersCount: famClusters.length,
			reclaimableBytes: famReclaim,
			formattedReclaimableBytes: formatBytes(famReclaim),
		}
	})

	// Apply filters
	const filteredClusters = allClusters.filter(cluster => {
		if (familyFilter !== 'all' && cluster.family !== familyFilter) {
			return false
		}
		if (minSizeBytes > 0 && cluster.survivor.size < minSizeBytes) {
			return false
		}
		if (verdictFilter !== 'all') {
			if (verdictFilter === 'reclaimable' && cluster.reclaimableCopiesCount === 0) {
				return false
			}
			if (verdictFilter === 'latest-ga' && !cluster.isLatestGa) {
				return false
			}
			if (verdictFilter === 'signed-lts' && !cluster.isSignedLts) {
				return false
			}
			if (verdictFilter === 'signature-anchor' && cluster.family !== 'detached-signatures-and-checksums' && !cluster.hasDetachedSignature) {
				return false
			}
			if (verdictFilter === 'sbom-manifest' && cluster.family !== 'sbom-and-attestation-manifests' && !cluster.hasSbomCompanion) {
				return false
			}
			if (verdictFilter === 'prerelease' && cluster.family !== 'prerelease-and-ci-builds') {
				return false
			}
			if (verdictFilter === 'shielded' && cluster.reclaimableCopiesCount > 0) {
				return false
			}
		}
		if (searchQuery) {
			const haystack = [
				cluster.product,
				cluster.semverRaw,
				cluster.targetArch,
				cluster.platform,
				cluster.channel,
				cluster.formatBadge,
				cluster.releaseKey,
				cluster.displayName,
				...cluster.members.map(m => m.path),
			].join(' ').toLowerCase()
			if (!haystack.includes(searchQuery)) {
				return false
			}
		}
		return true
	})

	// Sort deterministically
	filteredClusters.sort((a, b) => {
		if (sortMode === 'risk_desc') {
			if (a.riskPriority !== b.riskPriority) {
				return b.riskPriority - a.riskPriority
			}
			return b.reclaimableBytes - a.reclaimableBytes
		}
		if (sortMode === 'semver_desc') {
			const svCmp = compareSemver(b.semver, a.semver)
			if (svCmp !== 0) {
				return svCmp
			}
			return b.reclaimableBytes - a.reclaimableBytes
		}
		if (sortMode === 'copies_desc') {
			if (a.copiesCount !== b.copiesCount) {
				return b.copiesCount - a.copiesCount
			}
			return b.reclaimableBytes - a.reclaimableBytes
		}
		if (sortMode === 'name_asc') {
			return a.displayName.localeCompare(b.displayName)
		}
		// Default: reclaim_desc
		if (a.reclaimableBytes !== b.reclaimableBytes) {
			return b.reclaimableBytes - a.reclaimableBytes
		}
		if (a.rawDuplicateBytes !== b.rawDuplicateBytes) {
			return b.rawDuplicateBytes - a.rawDuplicateBytes
		}
		return a.displayName.localeCompare(b.displayName)
	})

	const totalRawDuplicateBytes = filteredClusters.reduce((acc, c) => acc + c.rawDuplicateBytes, 0)
	const totalReclaimableBytes = filteredClusters.reduce((acc, c) => acc + c.reclaimableBytes, 0)
	const totalFilesCount = filteredClusters.reduce((acc, c) => acc + c.copiesCount, 0)
	const totalReclaimableCopiesCount = filteredClusters.reduce((acc, c) => acc + c.reclaimableCopiesCount, 0)
	const totalConsolidatableCopiesCount = filteredClusters.reduce((acc, c) => acc + c.consolidatableCopiesCount, 0)
	const totalShieldedCopiesCount = filteredClusters.reduce((acc, c) => acc + c.shieldedCopiesCount, 0)
	const totalProtectedGaLtsClusters = filteredClusters.filter(c => c.isLatestGa || c.isSignedLts).length
	const totalSignedClusters = filteredClusters.filter(c => c.hasDetachedSignature).length
	const totalSbomLinkedClusters = filteredClusters.filter(c => c.hasSbomCompanion).length
	const totalPrereleaseClusters = filteredClusters.filter(c => c.family === 'prerelease-and-ci-builds').length
	const efficiencyPct = totalRawDuplicateBytes > 0
		? Math.min(100, Math.round((totalReclaimableBytes / totalRawDuplicateBytes) * 100))
		: 0

	return {
		schema: RELEASE_BINARY_ARTIFACT_SCHEMA,
		generatedAt: new Date(referenceNowSec * 1000).toISOString(),
		options: {
			familyFilter,
			verdictFilter,
			sortMode,
			strategy,
			survivorRule,
			protectLatestGa,
			protectSignedLts,
			keepPreviousGaVersions,
			stalePrereleaseDays,
			minSizeMb,
			searchQuery,
		},
		summary: {
			totalClustersCount: filteredClusters.length,
			totalUnfilteredClustersCount: allClusters.length,
			totalFilesCount,
			totalRawDuplicateBytes,
			formattedRawDuplicateBytes: formatBytes(totalRawDuplicateBytes),
			totalReclaimableBytes,
			formattedReclaimableBytes: formatBytes(totalReclaimableBytes),
			reclaimableGb: formatGigabytes(totalReclaimableBytes),
			totalReclaimableCopiesCount,
			totalConsolidatableCopiesCount,
			totalShieldedCopiesCount,
			totalProtectedGaLtsClusters,
			totalSignedClusters,
			totalSbomLinkedClusters,
			totalPrereleaseClusters,
			efficiencyPct,
		},
		familyBreakdown,
		clusters: filteredClusters,
	}
}

/**
 * Quote a POSIX shell argument safely using single quotes.
 *
 * @param {string} value Raw string.
 * @return {string} POSIX single-quoted string.
 */
function shellQuote(value) {
	const str = String(value ?? '')
	return `'${str.replace(/'/g, '\'\\\'\'')}'`
}

/**
 * Join Nextcloud data root and normalized artifact path cleanly.
 *
 * @param {string} dataRoot Nextcloud data root directory.
 * @param {string} relPath Artifact path.
 * @return {string} Combined POSIX path.
 */
function joinDataRoot(dataRoot, relPath) {
	const root = String(dataRoot || '/var/www/nextcloud/data').replace(/\/+$/, '')
	const cleanRel = safeNormalizePath(relPath).replace(/^\/+/, '')
	return `${root}/${cleanRel}`
}

/**
 * Build a safe POSIX DRY_RUN=1 remediation script for release binary & SBOM vault cleanup.
 *
 * @param {object} analysis Output of analyzeReleaseBinaryArtifacts.
 * @param {object} [options] Script generation options.
 * @return {string} POSIX shell script.
 */
export function buildReleaseBinaryRemediationScript(analysis, options = {}) {
	const dataRoot = String(options.dataRoot || '/var/www/nextcloud/data').trim() || '/var/www/nextcloud/data'
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const summary = (analysis && analysis.summary) || {
		totalClustersCount: 0,
		formattedReclaimableBytes: '0 B',
		reclaimableGb: '0.00 GB',
		totalReclaimableCopiesCount: 0,
	}

	const lines = [
		'#!/usr/bin/env sh',
		'set -eu',
		'# DuplicateFinder Release Binary, Signed Installer & SBOM Vault Remediation Script',
		`# Schema: ${RELEASE_BINARY_ARTIFACT_SCHEMA}`,
		`# Clusters: ${summary.totalClustersCount} | Reclaimable: ${summary.formattedReclaimableBytes} (${summary.reclaimableGb}) | Targets: ${summary.totalReclaimableCopiesCount}`,
		'# Default is safe dry-run mode. Run with DRY_RUN=0 sh script.sh to apply.',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'',
		'run_cmd() {',
		'  if [ "$DRY_RUN" = "0" ]; then',
		'    "$@"',
		'  else',
		'    printf "[DRY_RUN=1] %s\\n" "$*"',
		'  fi',
		'}',
		'',
	]

	let actionCount = 0

	for (const cluster of clusters) {
		const targets = (cluster.members || []).filter(m => m.actionType === 'prune' || m.actionType === 'hardlink')
		if (!targets.length) {
			continue
		}
		const anchorPath = joinDataRoot(dataRoot, cluster.survivor.path)
		lines.push(`# Release: ${cluster.releaseKey} [${cluster.platform} / ${cluster.formatBadge}] (${cluster.formattedReclaimableBytes})`)
		lines.push(`# Anchor: ${anchorPath}`)

		for (const target of targets) {
			const targetPath = joinDataRoot(dataRoot, target.path)
			actionCount += 1
			if (target.actionType === 'hardlink') {
				lines.push(`if [ -f ${shellQuote(anchorPath)} ] && [ -f ${shellQuote(targetPath)} ]; then`)
				lines.push(`  run_cmd ln -f ${shellQuote(anchorPath)} ${shellQuote(targetPath)}`)
				lines.push('fi')
			} else {
				lines.push(`if [ -f ${shellQuote(anchorPath)} ] && [ -f ${shellQuote(targetPath)} ]; then`)
				lines.push(`  run_cmd rm -f ${shellQuote(targetPath)}`)
				lines.push('fi')
			}
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('# No actionable release binary or SBOM duplicates under current governance guards.')
	} else {
		lines.push('# After applying with DRY_RUN=0, refresh Nextcloud filecache:')
		lines.push('# sudo -u www-data php /var/www/nextcloud/occ files:scan --all')
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe CSV audit report.
 *
 * @param {object} analysis Output of analyzeReleaseBinaryArtifacts.
 * @return {string} CSV content.
 */
export function buildReleaseBinaryCsvReport(analysis) {
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const headers = [
		'Product',
		'Semver',
		'TargetArch',
		'Platform',
		'Channel',
		'Family',
		'Format',
		'LatestGA',
		'SignedLTS',
		'HasSignature',
		'HasSBOM',
		'Verdict',
		'Action',
		'AuthorityScore',
		'SizeBytes',
		'Path',
		'Reason',
	]

	const rows = [headers.map(escapeCsvCell).join(',')]

	for (const cluster of clusters) {
		for (const member of cluster.members || []) {
			rows.push([
				cluster.product,
				cluster.semverRaw,
				cluster.targetArch,
				cluster.platform,
				cluster.channel,
				cluster.family,
				cluster.formatBadge,
				cluster.isLatestGa ? 'yes' : 'no',
				cluster.isSignedLts ? 'yes' : 'no',
				member.hasDetachedSignature ? 'yes' : 'no',
				member.hasSbomCompanion ? 'yes' : 'no',
				member.verdict,
				member.actionType,
				String(member.authorityScore),
				String(member.size),
				member.path,
				member.verdictReason,
			].map(escapeCsvCell).join(','))
		}
	}

	return rows.join('\n')
}

/**
 * Build a structured JSON audit manifest.
 *
 * @param {object} analysis Output of analyzeReleaseBinaryArtifacts.
 * @return {string} Pretty-printed JSON string.
 */
export function buildReleaseBinaryJsonReport(analysis) {
	const payload = {
		schema: RELEASE_BINARY_ARTIFACT_SCHEMA,
		generatedAt: analysis && analysis.generatedAt ? analysis.generatedAt : new Date().toISOString(),
		options: analysis ? analysis.options : {},
		summary: analysis ? analysis.summary : {},
		familyBreakdown: analysis ? analysis.familyBreakdown : [],
		clusters: (analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []).map(cluster => ({
			groupKey: cluster.groupKey,
			primaryGroupId: cluster.primaryGroupId,
			hash: cluster.hash,
			product: cluster.product,
			semver: cluster.semverRaw,
			targetArch: cluster.targetArch,
			platform: cluster.platform,
			channel: cluster.channel,
			family: cluster.family,
			formatBadge: cluster.formatBadge,
			isLatestGa: cluster.isLatestGa,
			isSignedLts: cluster.isSignedLts,
			hasDetachedSignature: cluster.hasDetachedSignature,
			hasSbomCompanion: cluster.hasSbomCompanion,
			riskState: cluster.riskState,
			reclaimableBytes: cluster.reclaimableBytes,
			reclaimableGb: cluster.reclaimableGb,
			rawDuplicateBytes: cluster.rawDuplicateBytes,
			members: (cluster.members || []).map(m => ({
				path: m.path,
				size: m.size,
				authorityScore: m.authorityScore,
				verdict: m.verdict,
				actionType: m.actionType,
				verdictReason: m.verdictReason,
			})),
		})),
	}
	return JSON.stringify(payload, null, 2)
}

/**
 * Build a Nextcloud desktop client .sync-exclude.lst snippet for transient CI & pre-release installers.
 *
 * @param {object} analysis Output of analyzeReleaseBinaryArtifacts.
 * @return {string} Sync exclude rules.
 */
export function buildReleaseBinarySyncExcludeSnippet(analysis) {
	const prereleaseCount = analysis && analysis.summary ? analysis.summary.totalPrereleaseClusters : 0
	return [
		'# DuplicateFinder Release Binary & CI Artifact Sync Exclusions',
		`# Detected pre-release / CI clusters: ${prereleaseCount}`,
		'ci-artifacts/',
		'build-artifacts/',
		'runner-cache/',
		'*-nightly-*.dmg',
		'*-nightly-*.AppImage',
		'*-canary-*.msi',
		'*-canary-*.exe',
		'*.nupkg.tmp',
		'*.whl.tmp',
	].join('\n')
}
