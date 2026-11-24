/**
 * Pure Mobile App Build, iOS/Android Artifacts & Crash Symbol Vault Auditor.
 * Classifies and audits duplicate clusters across 4 Mobile Build & Release Vault families:
 * - iOS & Android App Packages (.ipa, .apk, .aab, .apks, .xcarchive, .xcarchive.zip)
 * - Crash & Debug Symbols (.dSYM.zip, .dSYM/DWARF, mapping.txt, proguard/, native-debug-symbols.zip)
 * - Signing Keystores & Provisioning (.jks, .keystore, .p12, .mobileprovision, .provisionprofile, .p8)
 * - Regenerable Build Caches (DerivedData/, .gradle/, build/, Pods/, Carthage/Build/, .dart_tool/, .cxx/)
 *
 * Distinguishes intermediate beta/TestFlight/CI builds and regenerable caches from signed
 * App Store / Google Play production releases, strictly conserves signed store releases,
 * production dSYM/ProGuard symbol vaults, and signing keystores/provisioning profiles,
 * and generates DRY_RUN=1 POSIX remediation scripts, CWE-1236-safe CSV reports, JSON audit
 * manifests, and .sync-exclude.lst rules.
 *
 * Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const MOBILE_BUILD_VAULT_SCHEMA = 'duplicatefinder.mobile-build-vault-auditor.v1'

export const MOBILE_BUILD_FAMILIES = Object.freeze([
	'all',
	'mobile-app-packages',
	'crash-debug-symbols',
	'signing-keystores-certs',
	'regenerable-build-caches',
])

export const MOBILE_BUILD_FAMILY_META = Object.freeze({
	'mobile-app-packages': {
		id: 'mobile-app-packages',
		label: 'iOS & Android Packages',
		shortLabel: 'Packages (.ipa, .apk, .aab, .xcarchive)',
	},
	'crash-debug-symbols': {
		id: 'crash-debug-symbols',
		label: 'Crash & Debug Symbols',
		shortLabel: 'Symbols (.dSYM.zip, mapping.txt, proguard/)',
	},
	'signing-keystores-certs': {
		id: 'signing-keystores-certs',
		label: 'Keystores & Provisioning',
		shortLabel: 'Signing (.jks, .p12, .mobileprovision, .p8)',
	},
	'regenerable-build-caches': {
		id: 'regenerable-build-caches',
		label: 'Regenerable Build Caches',
		shortLabel: 'Caches (DerivedData/, .gradle/, build/, Pods/)',
	},
})

export const MOBILE_BUILD_STRATEGIES = Object.freeze([
	'prune-caches-and-beta',
	'hardlink-immutable-artifacts',
	'quarantine-beta-and-caches',
])

export const MOBILE_BUILD_SURVIVOR_RULES = Object.freeze([
	'prod-release-and-keystore-first',
	'oldest-vault-first',
	'newest-signed-release',
	'shortest-path',
])

export const MOBILE_BUILD_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'signed-store-release-protected',
	'prod-symbol-vault-protected',
	'signing-keystore-protected',
	'beta-ci-intermediate-build',
	'regenerable-build-cache',
	'shielded',
])

export const MOBILE_BUILD_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const MOBILE_BUILD_PRESETS = Object.freeze([
	{
		id: 'all-mobile-build-vault-audit',
		name: 'All Mobile Packages, Symbols & Caches',
		description: 'Audit .ipa/.apk/.aab/.xcarchive packages, .dSYM.zip and ProGuard mapping.txt crash symbols, .jks/.p12/.mobileprovision keystores, and DerivedData/.gradle/build/Pods caches while strictly conserving store releases, prod symbols, and signing vaults.',
		familyFilter: 'all',
		strategy: 'prune-caches-and-beta',
		survivorRule: 'prod-release-and-keystore-first',
		protectSignedStoreReleases: true,
		protectProdSymbols: true,
		protectSigningKeystores: true,
		requireVerifiedReleaseAnchor: true,
		keepRecentBuildDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'app-store-play-store-vault',
		name: 'Store Releases, Symbols & Keystores',
		description: 'Isolate signed App Store and Google Play production releases, production dSYM/ProGuard symbol vaults, and signing keystores with maximum conservation.',
		familyFilter: 'all',
		strategy: 'quarantine-beta-and-caches',
		survivorRule: 'prod-release-and-keystore-first',
		protectSignedStoreReleases: true,
		protectProdSymbols: true,
		protectSigningKeystores: true,
		requireVerifiedReleaseAnchor: true,
		keepRecentBuildDays: 14,
		minSizeKb: 0,
	},
	{
		id: 'crash-symbol-dsym-proguard',
		name: 'dSYM & ProGuard/R8 Symbol Vault',
		description: 'Audit .dSYM.zip, DWARF binaries, mapping.txt, and proguard/ outputs while strictly conserving production crash symbol archives linked to App Store and Play Store releases.',
		familyFilter: 'crash-debug-symbols',
		strategy: 'prune-caches-and-beta',
		survivorRule: 'prod-release-and-keystore-first',
		protectSignedStoreReleases: true,
		protectProdSymbols: true,
		protectSigningKeystores: true,
		requireVerifiedReleaseAnchor: true,
		keepRecentBuildDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'ci-beta-and-cache-reclaim',
		name: 'Beta/CI Builds & DerivedData/Gradle Reclaim',
		description: 'Reclaim duplicate TestFlight, Firebase App Distribution, CI intermediate builds, and regenerable DerivedData/, .gradle/, build/, and Pods/ caches.',
		familyFilter: 'all',
		strategy: 'prune-caches-and-beta',
		survivorRule: 'prod-release-and-keystore-first',
		protectSignedStoreReleases: true,
		protectProdSymbols: true,
		protectSigningKeystores: true,
		requireVerifiedReleaseAnchor: false,
		keepRecentBuildDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'hardlink-immutable-mobile-artifacts',
		name: 'Hardlink Immutable Packages & dSYMs',
		description: 'Deduplicate identical immutable .ipa/.apk/.aab and .dSYM.zip archives via POSIX hardlinks while strictly blocking hardlinks on mutable caches, text mappings, and signing keystores.',
		familyFilter: 'all',
		strategy: 'hardlink-immutable-artifacts',
		survivorRule: 'prod-release-and-keystore-first',
		protectSignedStoreReleases: true,
		protectProdSymbols: true,
		protectSigningKeystores: true,
		requireVerifiedReleaseAnchor: false,
		keepRecentBuildDays: 0,
		minSizeKb: 0,
	},
])

export const MOBILE_BUILD_DEFAULT_CONFIG = Object.freeze({
	presetId: 'all-mobile-build-vault-audit',
	familyFilter: 'all',
	verdictFilter: 'all',
	strategy: 'prune-caches-and-beta',
	survivorRule: 'prod-release-and-keystore-first',
	sortMode: 'reclaim_desc',
	searchQuery: '',
	protectSignedStoreReleases: true,
	protectProdSymbols: true,
	protectSigningKeystores: true,
	requireVerifiedReleaseAnchor: true,
	keepRecentBuildDays: 0,
	minSizeKb: 0,
})

const PACKAGE_DIRECT_EXT_RE = /\.(?:ipa|apk|aab|apks)$/i
const XCARCHIVE_EXT_RE = /\.xcarchive(?:\.zip)?$/i
const XCARCHIVE_PATH_RE = /\.xcarchive(?:\/|$)/i

const DSYM_ZIP_EXT_RE = /\.dsym\.zip$/i
const DSYM_PATH_RE = /\.dsym(?:\/|$)/i
const PROGUARD_PATH_RE = /(?:^|\/)(?:proguard|r8[-_]?mapping|obfuscation)(?:\/|$)/i
const MAPPING_TXT_NAME_RE = /^(?:mapping(?:[-_.][^/]*)?|seeds|usage|dump|configuration)\.txt$/i
const SYMBOL_ARCHIVE_NAME_RE = /(?:dsym|debug[-_]?symbols|native[-_]?debug[-_]?symbols|crash[-_]?symbols|symbols[-_]?v?\d|proguard[-_]?mapping)/i
const ZIP_EXT_RE = /\.zip$/i
const SYMBOL_DIRECT_EXT_RE = /\.(?:sym|breakpad|dwp|dwarf)$/i

const KEYSTORE_DIRECT_EXT_RE = /\.(?:jks|keystore|p12|mobileprovision|provisionprofile)$/i
const P8_KEY_EXT_RE = /\.p8$/i
const P8_MOBILE_HINT_RE = /(?:^|\/)(?:authkey[_-]|apns|app[-_]?store|apple|ios|signing|certs?|fastlane|match|keys?)(?:[^/]*\/|$)/i

const REGENERABLE_CACHE_PATH_RE = /(?:^|\/)(?:deriveddata|\.gradle|pods|carthage\/build|\.dart_tool|\.cxx|modulecache\.noindex|intermediates\.noindex|\.build|app\/build|android\/app\/build|ios\/build|build\/outputs|build\/intermediates|build\/generated)(?:\/|$)/i
const REGENERABLE_CACHE_EXT_RE = /\.(?:o|a|dex|class|swiftmodule|swiftdoc|swiftinterface|pcm|hmap|dia|d|gcno|gcda|aar|jar|lock|pbxproj|xcconfig|podspec|xcframework|framework|so|dylib|kts)$/i

const MUTABLE_OR_SENSITIVE_EXT_RE = /\.(?:jks|keystore|p12|mobileprovision|provisionprofile|p8|txt|xml|json|plist|gradle|kts|podspec|xcconfig|pbxproj|swift|kt|java|lock|hmap|pcm|swiftmodule|o|a|dex|class)$/i

const MOBILE_PATH_CONTEXT_RE = /(?:^|\/)(?:ios|android|mobile|xcode|gradle|fastlane|appstore|playstore|googleplay|testflight|crashlytics|sentry|bugsnag|proguard|dsym|xcarchive|signing|keystore|provisioning|flutter|react[-_]?native|deriveddata|pods)(?:\/|$)/i

const SIGNED_STORE_PATH_RE = /(?:^|\/)(?:app[-_]?store(?:[-_]?signed|[-_]?releases?)?|play[-_]?store(?:[-_]?signed|[-_]?releases?)?|google[-_]?play|signed[-_]?releases?|prod(?:uction)?[-_]?releases?|release[-_]?vault|store[-_]?submissions?|releases?\/prod|releases?\/signed|distribution\/signed|enterprise[-_]?signed)(?:\/|$)/i
const SIGNED_STORE_NAME_RE = /(?:^|[-_.])(?:appstore|playstore|googleplay|prod|production|store[-_]?signed|release[-_]?signed|signed[-_]?release|signed|distribution|universal[-_]?signed|release[-_]?prod)(?:[-_.]|$)/i

const PROD_SYMBOL_PATH_RE = /(?:^|\/)(?:symbol[-_]?vault|crash[-_]?symbols|prod[-_]?symbols|release[-_]?symbols|dsym[-_]?vault|mapping[-_]?archive|sentry[-_]?vault|crashlytics[-_]?vault|bugsnag|app[-_]?store|play[-_]?store|google[-_]?play|signed[-_]?releases?|prod(?:uction)?[-_]?releases?|release[-_]?vault)(?:\/|$)/i
const PROD_SYMBOL_NAME_RE = /(?:^|[-_.])(?:prod|production|appstore|playstore|googleplay|release|signed|golden|store)(?:[-_.]|$)/i

const BETA_CI_PATH_RE = /(?:^|\/)(?:testflight|firebase[-_]?app[-_]?distribution|appcenter|beta|internal[-_]?testing|ci[-_]?artifacts?|ci[-_]?builds?|fastlane[-_]?tmp|nightly|nightlies|staging|qa[-_]?builds?|debug[-_]?builds?|pr[-_]?builds?|snapshots?|outputs\/apk\/debug|outputs\/bundle\/debug|debug-iphoneos|debug-iphonesimulator)(?:\/|$)/i
const BETA_CI_NAME_RE = /(?:^|[-_.])(?:beta\d*|alpha\d*|rc\d*|nightly|staging|qa|debug|dbg|unsigned|unverified|testflight|internal|dogfood|ci[-_]?build|dev[-_]?build|snapshot|adhoc[-_]?tmp|draft|tmp|temp|copy\d*)(?:[-_.]|$)/i

const KEYSTORE_BACKUP_COPY_RE = /(?:[-_.](?:tmp|temp|bak|backup|old|copy\d*)| \(\d+\))(?=\.[^.]+$)/i

const MOBILE_VERSION_RE = /(?:^|[^a-z0-9])(v\d+\.\d+(?:\.\d+)?(?:[-_.](?:b|build)?\d+|[-_](?:rc\d+|alpha|beta))?|(?:build|vc)[-_]?\d{2,})(?:[^a-z0-9]|$)/i

/**
 * Normalize a non-negative integer value safely within bounds.
 *
 * @param {*} value Candidate numeric input.
 * @param {number} fallback Default fallback.
 * @param {number} [max] Upper bound.
 * @return {number} Clamped non-negative integer.
 */
function normalizeNonNegativeInt(value, fallback, max = 1000000) {
	const num = Number(value)
	if (!Number.isFinite(num) || num < 0) {
		return fallback
	}
	return Math.min(max, Math.floor(num))
}

/**
 * Normalize audit configuration against presets and safe bounds.
 *
 * @param {object} [raw] Raw configuration object.
 * @return {object} Normalized configuration.
 */
export function normalizeMobileBuildConfig(raw = {}) {
	const input = raw && typeof raw === 'object' ? raw : {}
	const preset = MOBILE_BUILD_PRESETS.find(item => item.id === input.presetId) || null
	const base = preset ? { ...MOBILE_BUILD_DEFAULT_CONFIG, ...preset } : { ...MOBILE_BUILD_DEFAULT_CONFIG }

	const familyFilter = MOBILE_BUILD_FAMILIES.includes(input.familyFilter)
		? input.familyFilter
		: base.familyFilter
	const verdictFilter = MOBILE_BUILD_VERDICT_FILTERS.includes(input.verdictFilter)
		? input.verdictFilter
		: base.verdictFilter
	const strategy = MOBILE_BUILD_STRATEGIES.includes(input.strategy)
		? input.strategy
		: base.strategy
	const survivorRule = MOBILE_BUILD_SURVIVOR_RULES.includes(input.survivorRule)
		? input.survivorRule
		: base.survivorRule
	const sortMode = MOBILE_BUILD_SORT_MODES.includes(input.sortMode)
		? input.sortMode
		: base.sortMode

	const memberOverrides = input.memberOverrides && typeof input.memberOverrides === 'object'
		? { ...input.memberOverrides }
		: {}

	return {
		presetId: preset ? preset.id : base.presetId,
		familyFilter,
		verdictFilter,
		strategy,
		survivorRule,
		sortMode,
		searchQuery: typeof input.searchQuery === 'string' ? input.searchQuery.trim() : '',
		protectSignedStoreReleases: typeof input.protectSignedStoreReleases === 'boolean'
			? input.protectSignedStoreReleases
			: base.protectSignedStoreReleases,
		protectProdSymbols: typeof input.protectProdSymbols === 'boolean'
			? input.protectProdSymbols
			: base.protectProdSymbols,
		protectSigningKeystores: typeof input.protectSigningKeystores === 'boolean'
			? input.protectSigningKeystores
			: base.protectSigningKeystores,
		requireVerifiedReleaseAnchor: typeof input.requireVerifiedReleaseAnchor === 'boolean'
			? input.requireVerifiedReleaseAnchor
			: base.requireVerifiedReleaseAnchor,
		keepRecentBuildDays: normalizeNonNegativeInt(input.keepRecentBuildDays, base.keepRecentBuildDays, 3650),
		minSizeKb: normalizeNonNegativeInt(input.minSizeKb, base.minSizeKb, 10000000),
		memberOverrides,
	}
}

/**
 * Extract the basename from a normalized filesystem path.
 *
 * @param {string} normalizedPath Normalized path.
 * @return {string} File basename.
 */
function extractBasename(normalizedPath) {
	const parts = String(normalizedPath || '').split('/')
	return parts[parts.length - 1] || ''
}

/**
 * Extract the directory portion from a normalized filesystem path.
 *
 * @param {string} normalizedPath Normalized path.
 * @return {string} Parent directory path.
 */
function extractDirname(normalizedPath) {
	const idx = String(normalizedPath || '').lastIndexOf('/')
	return idx > 0 ? String(normalizedPath).slice(0, idx) : ''
}

/**
 * Parse a file mtime value into epoch milliseconds when available.
 *
 * @param {object} file Duplicate file entry.
 * @return {number|null} Epoch ms or null.
 */
function extractMtimeMs(file) {
	const raw = file?.mtime ?? file?.modified ?? file?.lastModified ?? null
	if (raw === null || raw === undefined || raw === '') {
		return null
	}
	if (typeof raw === 'number' && Number.isFinite(raw)) {
		return raw > 1e12 ? raw : raw * 1000
	}
	const parsed = Date.parse(String(raw))
	return Number.isFinite(parsed) ? parsed : null
}

/**
 * Detect mobile platform (iOS, Android, or Cross-Platform) from path and basename.
 *
 * @param {string} normalizedPath Normalized path.
 * @param {string} basename File basename.
 * @return {string} Platform label or empty string.
 */
export function extractMobilePlatform(normalizedPath, basename = '') {
	const text = `${normalizedPath} ${basename}`.toLowerCase()
	const hasIos = /\.(?:ipa|xcarchive|dsym|mobileprovision|provisionprofile|p8)(?:\.zip)?\b|\b(?:deriveddata|pods|carthage|testflight|appstore|ios|iphoneos|iphonesimulator|xcode)\b/.test(text)
	const hasAndroid = /\.(?:apk|aab|apks|jks|keystore)\b|\b(?:proguard|mapping\.txt|\.gradle|playstore|googleplay|android|apk|aab)\b/.test(text)

	if (hasIos && hasAndroid) {
		return 'Cross-Platform'
	}
	if (hasIos) {
		return 'iOS'
	}
	if (hasAndroid) {
		return 'Android'
	}
	if (/\.(?:p12)\b|\b(?:flutter|\.dart_tool|react[-_]?native)\b/.test(text)) {
		return 'Cross-Platform'
	}
	return ''
}

/**
 * Extract mobile app version or build number tag (e.g. v2.4.0, build-1042).
 *
 * @param {string} normalizedPath Normalized path.
 * @param {string} basename File basename.
 * @return {string} Version token or empty string.
 */
export function extractMobileBuildVersion(normalizedPath, basename = '') {
	const baseMatch = String(basename || '').match(MOBILE_VERSION_RE)
	if (baseMatch) {
		return baseMatch[1].toLowerCase().replace(/_/g, '-')
	}
	const pathMatch = String(normalizedPath || '').match(MOBILE_VERSION_RE)
	return pathMatch ? pathMatch[1].toLowerCase().replace(/_/g, '-') : ''
}

/**
 * Extract a normalized mobile build lineage stem to correlate beta/CI builds,
 * crash symbols, and regenerable caches against signed store releases.
 *
 * @param {string} basename File basename.
 * @param {string} [normalizedPath] Full normalized path for context fallback.
 * @return {string} Normalized lineage stem.
 */
export function extractMobileLineageStem(basename, normalizedPath = '') {
	let stem = String(basename || '').trim().toLowerCase()
	stem = stem.replace(/\.(?:dsym\.zip|xcarchive\.zip|ipa|apk|aab|apks|xcarchive|jks|keystore|p12|mobileprovision|provisionprofile|p8|sym|breakpad|dwp|dwarf|txt|zip|o|a|dex|class|swiftmodule|aar|jar|lock|so|dylib)$/i, '')
	stem = stem.replace(/\s+\(\d+\)$/, '')
	if ((stem === 'mapping' || stem === 'seeds' || stem === 'usage') && normalizedPath) {
		const pathVer = extractMobileBuildVersion(normalizedPath, '')
		if (pathVer) {
			return `mapping_${pathVer}`
		}
	}
	let prev = ''
	while (stem !== prev) {
		prev = stem
		stem = stem.replace(/[-_.](?:appstore|playstore|googleplay|prod|production|store[-_]?signed|release[-_]?signed|signed[-_]?release|signed|distribution|universal[-_]?signed|beta\d*|alpha\d*|rc\d*|nightly|staging|qa|debug|dbg|unsigned|unverified|testflight|internal|dogfood|ci[-_]?build|dev[-_]?build|snapshot|adhoc[-_]?tmp|draft|mapping|dsym|symbols?|proguard|bak|backup|old|tmp|temp|copy\d*)$/i, '')
	}
	return stem || 'unknown-mobile-artifact'
}

/**
 * Extract a concise provenance tag for a mobile build artifact.
 *
 * @param {string} lowerBase Lowercase basename.
 * @param {string} lowerPath Lowercase path.
 * @return {string} Provenance tag or empty string.
 */
function extractBuildTag(lowerBase, lowerPath) {
	if (KEYSTORE_DIRECT_EXT_RE.test(lowerBase) || (P8_KEY_EXT_RE.test(lowerBase) && P8_MOBILE_HINT_RE.test(lowerPath))) {
		if (/\.mobileprovision$|\.provisionprofile$/i.test(lowerBase)) {
			return 'provisioning-profile'
		}
		if (/\.p12$/i.test(lowerBase)) {
			return 'apple-p12-cert'
		}
		if (/\.p8$/i.test(lowerBase)) {
			return 'appstore-p8-key'
		}
		return 'android-keystore'
	}
	if (/app[-_]?store|play[-_]?store|google[-_]?play/i.test(lowerPath) || /appstore|playstore|googleplay/i.test(lowerBase)) {
		return 'store-release'
	}
	if ((SIGNED_STORE_NAME_RE.test(lowerBase) || SIGNED_STORE_PATH_RE.test(lowerPath)) && !BETA_CI_NAME_RE.test(lowerBase) && !BETA_CI_PATH_RE.test(lowerPath)) {
		return 'signed-prod'
	}
	if (DSYM_ZIP_EXT_RE.test(lowerBase) || DSYM_PATH_RE.test(lowerPath)) {
		return 'ios-dsym'
	}
	if (MAPPING_TXT_NAME_RE.test(lowerBase) || PROGUARD_PATH_RE.test(lowerPath)) {
		return 'proguard-r8'
	}
	if (/deriveddata/i.test(lowerPath)) {
		return 'xcode-deriveddata'
	}
	if (/\.gradle/i.test(lowerPath)) {
		return 'gradle-cache'
	}
	if (/\/pods\//i.test(lowerPath)) {
		return 'cocoapods-cache'
	}
	if (REGENERABLE_CACHE_PATH_RE.test(lowerPath)) {
		return 'build-cache'
	}
	if (/testflight/i.test(lowerPath) || /testflight/i.test(lowerBase)) {
		return 'testflight-beta'
	}
	if (BETA_CI_NAME_RE.test(lowerBase) || BETA_CI_PATH_RE.test(lowerPath)) {
		return 'ci-beta-build'
	}
	if (/\.xcarchive/i.test(lowerBase) || XCARCHIVE_PATH_RE.test(lowerPath)) {
		return 'xcarchive'
	}
	if (/\.aab$/i.test(lowerBase)) {
		return 'android-aab'
	}
	if (/\.ipa$/i.test(lowerBase)) {
		return 'ios-ipa'
	}
	if (/\.apk$/i.test(lowerBase)) {
		return 'android-apk'
	}
	return ''
}

/**
 * Classify a single duplicate file into the Mobile App Build, iOS/Android Artifacts & Crash Symbol Vault domain.
 *
 * @param {object} file Duplicate file entry.
 * @param {number} [referenceNowMs] Reference epoch ms.
 * @return {object} Classification metadata (family === null if outside domain).
 */
export function classifyMobileBuildFile(file, referenceNowMs = Date.now()) {
	const rawPath = file?.path || file?.name || ''
	const normalized = normalizePathForDiff(rawPath) || String(rawPath || '').replace(/\\/g, '/')
	const lower = normalized.toLowerCase()
	const basename = extractBasename(normalized)
	const lowerBase = basename.toLowerCase()
	const dir = extractDirname(normalized)
	const lowerDir = dir.toLowerCase()

	const mobilePlatform = extractMobilePlatform(normalized, basename)
	const buildVersion = extractMobileBuildVersion(normalized, basename)
	const mobileLineageStem = extractMobileLineageStem(basename, normalized)
	const hasMobilePathContext = MOBILE_PATH_CONTEXT_RE.test(lower)

	const isKeystoreMatch = KEYSTORE_DIRECT_EXT_RE.test(lowerBase)
		|| (P8_KEY_EXT_RE.test(lowerBase) && (P8_MOBILE_HINT_RE.test(lower) || /authkey_/i.test(lowerBase)))

	const isCrashSymbolMatch = DSYM_ZIP_EXT_RE.test(lowerBase)
		|| DSYM_PATH_RE.test(lower)
		|| SYMBOL_DIRECT_EXT_RE.test(lowerBase)
		|| (PROGUARD_PATH_RE.test(lower) && /\.(?:txt|map|zip)$/i.test(lowerBase))
		|| MAPPING_TXT_NAME_RE.test(lowerBase)
		|| (ZIP_EXT_RE.test(lowerBase) && SYMBOL_ARCHIVE_NAME_RE.test(lowerBase))

	const isPackageMatch = PACKAGE_DIRECT_EXT_RE.test(lowerBase)
		|| XCARCHIVE_EXT_RE.test(lowerBase)
		|| (XCARCHIVE_PATH_RE.test(lower) && !DSYM_PATH_RE.test(lower))

	const isInRegenerableCache = REGENERABLE_CACHE_PATH_RE.test(lower)
	const isCacheMatch = isInRegenerableCache && (
		hasMobilePathContext
		|| REGENERABLE_CACHE_EXT_RE.test(lowerBase)
		|| isPackageMatch
		|| isCrashSymbolMatch
	)

	const inDomain = Boolean(isKeystoreMatch || isCrashSymbolMatch || isPackageMatch || isCacheMatch)

	const isSignedStorePath = SIGNED_STORE_PATH_RE.test(lower)
	const isSignedStoreName = SIGNED_STORE_NAME_RE.test(lowerBase)
	const isProdSymbolPath = PROD_SYMBOL_PATH_RE.test(lower)
	const isProdSymbolName = PROD_SYMBOL_NAME_RE.test(lowerBase)
	const isBetaCiPath = BETA_CI_PATH_RE.test(lower)
	const isBetaCiName = BETA_CI_NAME_RE.test(lowerBase)

	const isUnsignedMarker = /(?:^|[-_.])(?:unsigned|unverified|debug|dbg)(?:[-_.]|$)/i.test(lowerBase)
	const isKeystoreBackupName = KEYSTORE_BACKUP_COPY_RE.test(lowerBase)

	const isMutableFile = MUTABLE_OR_SENSITIVE_EXT_RE.test(lowerBase)
		|| isKeystoreMatch
		|| isInRegenerableCache

	let family = null
	let artifactKind = 'unknown'

	if (inDomain) {
		if (isKeystoreMatch) {
			family = 'signing-keystores-certs'
			if (/\.mobileprovision$|\.provisionprofile$/i.test(lowerBase)) {
				artifactKind = 'ios-provisioning-profile'
			} else if (/\.p12$/i.test(lowerBase)) {
				artifactKind = 'signing-certificate-p12'
			} else if (/\.p8$/i.test(lowerBase)) {
				artifactKind = 'appstore-api-p8-key'
			} else {
				artifactKind = 'android-signing-keystore'
			}
		} else if (isCrashSymbolMatch && !isInRegenerableCache) {
			family = 'crash-debug-symbols'
			if (DSYM_ZIP_EXT_RE.test(lowerBase) || DSYM_PATH_RE.test(lower)) {
				artifactKind = 'ios-dsym-bundle'
			} else if (MAPPING_TXT_NAME_RE.test(lowerBase) || PROGUARD_PATH_RE.test(lower)) {
				artifactKind = 'proguard-r8-mapping'
			} else {
				artifactKind = 'native-crash-symbols'
			}
		} else if (isPackageMatch) {
			family = 'mobile-app-packages'
			if (XCARCHIVE_EXT_RE.test(lowerBase) || XCARCHIVE_PATH_RE.test(lower)) {
				artifactKind = 'xcode-xcarchive'
			} else if (/\.aab$/i.test(lowerBase)) {
				artifactKind = 'android-app-bundle'
			} else if (/\.ipa$/i.test(lowerBase)) {
				artifactKind = 'ios-ipa-package'
			} else {
				artifactKind = 'android-apk-package'
			}
		} else {
			family = 'regenerable-build-caches'
			if (/deriveddata/i.test(lower)) {
				artifactKind = 'xcode-deriveddata-cache'
			} else if (/\.gradle/i.test(lower)) {
				artifactKind = 'gradle-build-cache'
			} else if (/\/pods\//i.test(lower)) {
				artifactKind = 'cocoapods-vendor-cache'
			} else {
				artifactKind = 'mobile-build-output-cache'
			}
		}
	}

	const mtimeMs = extractMtimeMs(file)
	const ageDays = mtimeMs !== null && Number.isFinite(referenceNowMs)
		? Math.max(0, Math.floor((referenceNowMs - mtimeMs) / 86400000))
		: null

	const isSignedStoreRelease = family === 'mobile-app-packages'
		&& !isInRegenerableCache
		&& !isBetaCiPath
		&& !isBetaCiName
		&& !isUnsignedMarker
		&& (isSignedStorePath || isSignedStoreName)

	const isProdSymbolVault = family === 'crash-debug-symbols'
		&& !isInRegenerableCache
		&& !isBetaCiPath
		&& !isBetaCiName
		&& !isUnsignedMarker
		&& (isProdSymbolPath || isProdSymbolName)

	const isSigningKeystore = family === 'signing-keystores-certs'

	const isRegenerableBuildCache = inDomain && (
		family === 'regenerable-build-caches'
		|| isInRegenerableCache
	)

	const isBetaCiIntermediate = inDomain
		&& !isSignedStoreRelease
		&& !isProdSymbolVault
		&& !isSigningKeystore
		&& !isRegenerableBuildCache
		&& (isBetaCiPath || isBetaCiName || isUnsignedMarker)

	const isScratchOrCacheMarker = isInRegenerableCache || isBetaCiPath || isBetaCiName || isUnsignedMarker || isKeystoreBackupName

	const buildTag = extractBuildTag(lowerBase, lower)

	const vaultRole = isSigningKeystore
		? 'signing-keystore-vault'
		: (isSignedStoreRelease
			? 'signed-store-release'
			: (isProdSymbolVault
				? 'prod-crash-symbol-vault'
				: (isRegenerableBuildCache
					? 'regenerable-build-cache'
					: (isBetaCiIntermediate ? 'beta-ci-intermediate' : 'mobile-vault-copy'))))

	return {
		family,
		artifactKind,
		vaultRole,
		normalized,
		lower,
		basename,
		lowerBase,
		dir,
		lowerDir,
		mobilePlatform,
		buildVersion,
		mobileLineageStem,
		buildTag,
		isSignedStoreRelease,
		isProdSymbolVault,
		isSigningKeystore,
		isRegenerableBuildCache,
		isBetaCiIntermediate,
		isInRegenerableCache,
		isMutableFile,
		isScratchOrCacheMarker,
		size: Number(file?.size) || 0,
		mtimeMs,
		ageDays,
		formattedMtime: formatFileModifiedTime(file),
	}
}

/**
 * Determine whether a duplicate group belongs to the Mobile App Build, iOS/Android Artifacts
 * & Crash Symbol Vault domain.
 *
 * @param {object} group Duplicate group.
 * @return {boolean} True when at least one file matches the domain.
 */
export function isMobileBuildGroup(group) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return false
	}
	return group.files.some(file => classifyMobileBuildFile(file).family !== null)
}

/**
 * Build a cross-vault correlation index linking beta/CI builds, crash symbols, and build caches
 * to conserved signed store releases, production symbol vaults, and signing keystores.
 *
 * @param {Array<object>} groups Domain duplicate groups.
 * @return {object} Correlation index.
 */
function buildMobileBuildCorrelationIndex(groups) {
	const verifiedReleaseStems = new Set()
	const verifiedProdVersions = new Set()
	const betaVariantsByStem = new Map()

	for (const group of groups) {
		for (const file of group.files || []) {
			const meta = classifyMobileBuildFile(file)
			if (!meta.family) {
				continue
			}
			if (meta.isSignedStoreRelease || meta.isProdSymbolVault || meta.isSigningKeystore) {
				verifiedReleaseStems.add(meta.mobileLineageStem)
				if (meta.buildVersion) {
					verifiedProdVersions.add(meta.buildVersion)
				}
			}
			if (meta.isBetaCiIntermediate || meta.isRegenerableBuildCache) {
				betaVariantsByStem.set(
					meta.mobileLineageStem,
					(betaVariantsByStem.get(meta.mobileLineageStem) || 0) + 1
				)
			}
		}
	}

	return {
		verifiedReleaseStems,
		verifiedProdVersions,
		betaVariantsByStem,
	}
}

/**
 * Resolve the primary governance family of a cluster across its classified members.
 *
 * @param {Array<object>} members Classified members.
 * @return {string} Family ID.
 */
function resolveClusterFamily(members) {
	if (members.some(m => m.family === 'signing-keystores-certs')) {
		return 'signing-keystores-certs'
	}
	if (members.some(m => m.family === 'mobile-app-packages')) {
		return 'mobile-app-packages'
	}
	if (members.some(m => m.family === 'crash-debug-symbols')) {
		return 'crash-debug-symbols'
	}
	return 'regenerable-build-caches'
}

/**
 * Compute deterministic survivor priority score for a cluster member.
 *
 * @param {object} member Classified member.
 * @param {string} survivorRule Survivor rule.
 * @return {number} Priority score (higher wins).
 */
function scoreMemberForSurvivor(member, survivorRule) {
	const mtimeScore = member.mtimeMs !== null ? member.mtimeMs / 1e10 : 0
	const shortPathScore = 1000 - Math.min(999, member.normalized.length)

	if (survivorRule === 'oldest-vault-first') {
		const oldestScore = member.mtimeMs !== null ? -mtimeScore : 0
		return (member.isSigningKeystore ? 70000 : 0)
			+ (member.isSignedStoreRelease ? 65000 : 0)
			+ (member.isProdSymbolVault ? 60000 : 0)
			+ (member.isScratchOrCacheMarker ? -35000 : 0)
			+ oldestScore
			+ shortPathScore
	}

	if (survivorRule === 'newest-signed-release') {
		return (member.isSigningKeystore ? 55000 : 0)
			+ (member.isSignedStoreRelease ? 50000 : 0)
			+ (member.isProdSymbolVault ? 45000 : 0)
			+ (member.isScratchOrCacheMarker ? -30000 : 0)
			+ mtimeScore
	}

	if (survivorRule === 'shortest-path') {
		return (member.isBetaCiIntermediate || member.isRegenerableBuildCache ? -3000 : 0)
			+ shortPathScore
	}

	return (member.isSigningKeystore ? 80000 : 0)
		+ (member.isSignedStoreRelease ? 75000 : 0)
		+ (member.isProdSymbolVault ? 70000 : 0)
		+ (member.isBetaCiIntermediate ? -30000 : 0)
		+ (member.isRegenerableBuildCache ? -40000 : 0)
		+ shortPathScore
}

/**
 * Audit a single Mobile App Build, iOS/Android Artifacts & Crash Symbol Vault cluster.
 *
 * @param {object} group Duplicate group.
 * @param {object} correlationIndex Mobile vault correlation index.
 * @param {object} config Normalized configuration.
 * @param {number} referenceNowMs Reference epoch ms.
 * @return {object|null} Audited cluster entry or null if outside domain.
 */
function auditSingleCluster(group, correlationIndex, config, referenceNowMs) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return null
	}

	const rawMembers = group.files.map((file, index) => {
		const meta = classifyMobileBuildFile(file, referenceNowMs)
		if (!meta.family) {
			return null
		}
		return {
			...meta,
			id: file?.id ?? null,
			key: getFileSelectionKey(file) ?? `member-${index}`,
			file,
			index,
		}
	}).filter(Boolean)

	if (rawMembers.length === 0) {
		return null
	}

	const family = resolveClusterFamily(rawMembers)
	const primaryName = rawMembers[0].basename || group.hash || `cluster-${group.id}`
	const primaryPlatform = rawMembers.find(m => m.mobilePlatform)?.mobilePlatform || ''
	const primaryVersion = rawMembers.find(m => m.buildVersion)?.buildVersion || ''
	const primaryStem = rawMembers[0].mobileLineageStem || extractMobileLineageStem(primaryName, rawMembers[0].normalized)
	const info = computeGroupReclaimableInfo(group)
	const totalBytes = Number(info.totalBytes) || rawMembers.reduce((sum, item) => sum + item.size, 0)
	const unitBytes = Number(info.unitBytes) || (rawMembers[0]?.size || 0)

	const sortedForSurvivor = [...rawMembers].sort((a, b) => {
		const diff = scoreMemberForSurvivor(b, config.survivorRule) - scoreMemberForSurvivor(a, config.survivorRule)
		if (diff !== 0) {
			return diff
		}
		return a.normalized.localeCompare(b.normalized)
	})
	const survivor = sortedForSurvivor[0]
	const survivorKey = survivor.key

	const hasVerifiedReleaseAnchor = Boolean(
		survivor.isSignedStoreRelease
		|| survivor.isProdSymbolVault
		|| survivor.isSigningKeystore
		|| correlationIndex.verifiedReleaseStems.has(primaryStem)
		|| (primaryVersion && correlationIndex.verifiedProdVersions.has(primaryVersion))
	)

	let reclaimableBytes = 0
	let hardlinkSavingsBytes = 0
	let deleteTargetsCount = 0
	let hardlinkTargetsCount = 0
	let shieldedCount = 0

	const members = rawMembers.map((member) => {
		const isSurvivor = member.key === survivorKey
		const override = config.memberOverrides?.[member.key] || 'auto'
		let governanceTier = 'beta-ci-intermediate-build'
		let shielded = false
		let protectedReason = ''
		let action = 'keep'

		if (override === 'keep' && !isSurvivor) {
			governanceTier = member.isSigningKeystore
				? 'signing-keystore-protected'
				: (member.isSignedStoreRelease
					? 'signed-store-release-protected'
					: (member.isProdSymbolVault
						? 'prod-symbol-vault-protected'
						: (member.isRegenerableBuildCache ? 'regenerable-build-cache' : 'beta-ci-intermediate-build')))
			shielded = true
			protectedReason = 'Manually shielded via per-copy override'
		} else if (member.isSigningKeystore && config.protectSigningKeystores) {
			governanceTier = 'signing-keystore-protected'
			shielded = true
			protectedReason = 'Signing keystore, certificate, or provisioning profile strictly conserved'
		} else if (member.isSignedStoreRelease && config.protectSignedStoreReleases) {
			governanceTier = 'signed-store-release-protected'
			shielded = true
			protectedReason = 'Signed App Store / Play Store production release strictly conserved'
		} else if (member.isProdSymbolVault && config.protectProdSymbols) {
			governanceTier = 'prod-symbol-vault-protected'
			shielded = true
			protectedReason = 'Production dSYM / ProGuard crash symbol archive strictly conserved'
		} else if (isSurvivor && !member.isRegenerableBuildCache) {
			governanceTier = member.isSigningKeystore
				? 'signing-keystore-protected'
				: (member.isSignedStoreRelease
					? 'signed-store-release-protected'
					: (member.isProdSymbolVault ? 'prod-symbol-vault-protected' : 'beta-ci-intermediate-build'))
			shielded = true
			protectedReason = 'Canonical mobile build or symbol survivor retained'
		} else if (isSurvivor && member.isRegenerableBuildCache) {
			governanceTier = 'regenerable-build-cache'
			shielded = true
			protectedReason = 'Canonical build cache survivor retained unless purged by Gradle/Xcode clean'
		} else if (override === 'prune') {
			governanceTier = member.isRegenerableBuildCache ? 'regenerable-build-cache' : 'beta-ci-intermediate-build'
			action = config.strategy === 'hardlink-immutable-artifacts' && !member.isMutableFile && !survivor.isSigningKeystore
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
		} else if (member.isSigningKeystore) {
			governanceTier = 'signing-keystore-protected'
			action = 'delete'
			reclaimableBytes += member.size
			deleteTargetsCount += 1
		} else if (member.isSignedStoreRelease) {
			governanceTier = 'signed-store-release-protected'
			action = 'delete'
			reclaimableBytes += member.size
			deleteTargetsCount += 1
		} else if (member.isProdSymbolVault) {
			governanceTier = 'prod-symbol-vault-protected'
			action = 'delete'
			reclaimableBytes += member.size
			deleteTargetsCount += 1
		} else if (
			config.keepRecentBuildDays > 0
			&& member.ageDays !== null
			&& member.ageDays < config.keepRecentBuildDays
		) {
			governanceTier = member.isRegenerableBuildCache ? 'regenerable-build-cache' : 'beta-ci-intermediate-build'
			shielded = true
			protectedReason = `Within ${config.keepRecentBuildDays}-day mobile build grace window`
		} else if (member.isRegenerableBuildCache) {
			governanceTier = 'regenerable-build-cache'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
		} else if (member.isBetaCiIntermediate) {
			governanceTier = 'beta-ci-intermediate-build'
			if (config.requireVerifiedReleaseAnchor && !hasVerifiedReleaseAnchor) {
				shielded = true
				protectedReason = 'Blocked until a signed App Store / Play Store release or symbol anchor is verified'
			} else if (config.strategy === 'hardlink-immutable-artifacts' && !member.isMutableFile && !survivor.isSigningKeystore) {
				action = 'hardlink'
				hardlinkSavingsBytes += member.size
				hardlinkTargetsCount += 1
				reclaimableBytes += member.size
			} else {
				action = 'delete'
				deleteTargetsCount += 1
				reclaimableBytes += member.size
			}
		} else if (config.strategy === 'hardlink-immutable-artifacts' && !member.isMutableFile && !survivor.isSigningKeystore) {
			governanceTier = 'beta-ci-intermediate-build'
			action = 'hardlink'
			hardlinkSavingsBytes += member.size
			reclaimableBytes += member.size
			hardlinkTargetsCount += 1
		} else if (config.requireVerifiedReleaseAnchor && !hasVerifiedReleaseAnchor) {
			governanceTier = 'beta-ci-intermediate-build'
			shielded = true
			protectedReason = 'Blocked until a signed store release, prod symbol vault, or keystore anchor is verified'
		} else {
			governanceTier = 'beta-ci-intermediate-build'
			action = 'delete'
			reclaimableBytes += member.size
			deleteTargetsCount += 1
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

	let clusterVerdict = 'beta-ci-intermediate-build'
	if (members.some(m => m.governanceTier === 'signing-keystore-protected')) {
		clusterVerdict = 'signing-keystore-protected'
	} else if (members.some(m => m.governanceTier === 'signed-store-release-protected')) {
		clusterVerdict = 'signed-store-release-protected'
	} else if (members.some(m => m.governanceTier === 'prod-symbol-vault-protected')) {
		clusterVerdict = 'prod-symbol-vault-protected'
	} else if (members.some(m => m.governanceTier === 'regenerable-build-cache')) {
		clusterVerdict = 'regenerable-build-cache'
	}

	const hasReclaimable = (deleteTargetsCount + hardlinkTargetsCount) > 0
	const buildTags = Array.from(new Set(members.map(m => m.buildTag).filter(Boolean)))
	const crossGroupBetaVariantsCount = correlationIndex.betaVariantsByStem.get(primaryStem) || 0

	const riskScore = (clusterVerdict === 'signing-keystore-protected' ? 105 : 0)
		+ (clusterVerdict === 'signed-store-release-protected' ? 100 : 0)
		+ (clusterVerdict === 'prod-symbol-vault-protected' ? 95 : 0)
		+ (clusterVerdict === 'beta-ci-intermediate-build' ? 76 : 0)
		+ (clusterVerdict === 'regenerable-build-cache' ? 68 : 0)
		+ (hasReclaimable ? 20 : 0)

	return {
		id: group.id ?? primaryName,
		hash: group.hash || '',
		name: primaryName,
		mobilePlatform: primaryPlatform,
		buildVersion: primaryVersion,
		mobileLineageStem: primaryStem,
		family,
		familyLabel: MOBILE_BUILD_FAMILY_META[family]?.label || family,
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
		survivorPath: survivor.normalized,
		hasSigningKeystore: members.some(m => m.governanceTier === 'signing-keystore-protected'),
		hasSignedStoreRelease: members.some(m => m.governanceTier === 'signed-store-release-protected'),
		hasProdSymbolVault: members.some(m => m.governanceTier === 'prod-symbol-vault-protected'),
		hasBetaCiIntermediate: members.some(m => m.isBetaCiIntermediate) || crossGroupBetaVariantsCount > 0,
		hasRegenerableBuildCache: members.some(m => m.isRegenerableBuildCache),
		hasVerifiedReleaseAnchor,
		crossGroupBetaVariantsCount,
		buildTags,
		members,
		group,
	}
}

/**
 * Audit duplicate groups across Mobile App Build, iOS/Android Artifacts & Crash Symbol Vaults.
 *
 * @param {Array<object>} groups Duplicate groups.
 * @param {object} [rawConfig] Audit configuration overrides.
 * @param {number} [referenceNowMs] Reference epoch ms for deterministic tests.
 * @return {object} Complete audit report with summary, family counts, and filtered clusters.
 */
export function auditMobileBuildVault(groups, rawConfig = {}, referenceNowMs = Date.now()) {
	const config = normalizeMobileBuildConfig(rawConfig)
	const sourceGroups = Array.isArray(groups) ? groups : []
	const domainGroups = sourceGroups.filter(isMobileBuildGroup)
	const correlationIndex = buildMobileBuildCorrelationIndex(domainGroups)

	const allClusters = domainGroups
		.map(group => auditSingleCluster(group, correlationIndex, config, referenceNowMs))
		.filter(Boolean)

	const minSizeBytes = config.minSizeKb * 1024
	const sizeFiltered = allClusters.filter(cluster => cluster.unitBytes >= minSizeBytes)

	const familyCounts = {
		all: sizeFiltered.length,
		'mobile-app-packages': 0,
		'crash-debug-symbols': 0,
		'signing-keystores-certs': 0,
		'regenerable-build-caches': 0,
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
			const matchesStem = cluster.mobileLineageStem.toLowerCase().includes(query)
			const matchesPlatform = cluster.mobilePlatform.toLowerCase().includes(query)
			const matchesVer = cluster.buildVersion.toLowerCase().includes(query)
			const matchesTag = cluster.buildTags.some(tag => tag.toLowerCase().includes(query))
			const matchesMember = cluster.members.some(m => m.lower.includes(query))
			if (!matchesName && !matchesStem && !matchesPlatform && !matchesVer && !matchesTag && !matchesMember) {
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
	let totalSignedStoreClusters = 0
	let totalProdSymbolClusters = 0
	let totalKeystoreClusters = 0
	let totalBetaCiClusters = 0
	let totalCacheClusters = 0

	for (const cluster of filteredClusters) {
		rawDuplicateBytes += Math.max(0, cluster.totalBytes - cluster.unitBytes)
		reclaimableBytes += cluster.reclaimableBytes
		totalReclaimableCopiesCount += cluster.reclaimableTargetsCount
		totalShieldedCopiesCount += cluster.shieldedCount

		if (cluster.hasSignedStoreRelease) {
			totalSignedStoreClusters += 1
		}
		if (cluster.hasProdSymbolVault) {
			totalProdSymbolClusters += 1
		}
		if (cluster.hasSigningKeystore) {
			totalKeystoreClusters += 1
		}
		if (cluster.hasBetaCiIntermediate) {
			totalBetaCiClusters += 1
		}
		if (cluster.hasRegenerableBuildCache) {
			totalCacheClusters += 1
		}
	}

	const efficiencyPct = rawDuplicateBytes > 0
		? Math.min(100, Math.round((reclaimableBytes / rawDuplicateBytes) * 100))
		: 0

	const reclaimableGb = `${(reclaimableBytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`

	const familyBreakdown = MOBILE_BUILD_FAMILIES
		.filter(id => id !== 'all')
		.map(id => ({
			id,
			label: MOBILE_BUILD_FAMILY_META[id].label,
			shortLabel: MOBILE_BUILD_FAMILY_META[id].shortLabel,
			clustersCount: familyCounts[id] || 0,
		}))

	return {
		schema: MOBILE_BUILD_VAULT_SCHEMA,
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
			totalSignedStoreClusters,
			totalProdSymbolClusters,
			totalKeystoreClusters,
			totalBetaCiClusters,
			totalCacheClusters,
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
 * Build a safe POSIX DRY_RUN=1 remediation script for Mobile Build & Crash Symbol vaults.
 * Strictly blocks deletion or hardlinking of shielded App Store / Play Store releases,
 * production dSYM/ProGuard symbol archives, and signing keystores (.jks/.p12/.mobileprovision/.p8).
 *
 * @param {object} auditResult Result from auditMobileBuildVault.
 * @return {string} POSIX bash script.
 */
export function buildMobileBuildRemediationScript(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# Mobile App Build, iOS/Android Artifacts & Crash Symbol Vault Auditor',
		'# Safe POSIX Remediation Script (default DRY_RUN=1)',
		'# Run with DRY_RUN=0 ./mobile-build-vault-reclaim.sh only after verifying App Store/Play Store releases, prod dSYM/mapping.txt, and keystores.',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'QUARANTINE_DIR="$' + '{QUARANTINE_DIR:-./.mobile-build-quarantine}"',
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
	const strategy = auditResult?.config?.strategy || 'prune-caches-and-beta'
	for (const cluster of clusters) {
		const actions = (cluster.members || []).filter(m => !m.shielded && (m.action === 'delete' || m.action === 'hardlink'))
		if (actions.length === 0) {
			continue
		}
		lines.push(`# Cluster: ${cluster.name} | Family: ${cluster.familyLabel} | Survivor: ${cluster.survivorPath}`)
		for (const target of actions) {
			actionCount += 1
			if (target.action === 'hardlink' && !target.isMutableFile && !target.isSigningKeystore) {
				lines.push(`run_cmd ln -f ${quotePosixPath(cluster.survivorPath)} ${quotePosixPath(target.normalized)}`)
			} else if (strategy === 'quarantine-beta-and-caches') {
				lines.push('run_cmd mkdir -p "$QUARANTINE_DIR"')
				lines.push(`run_cmd mv -n ${quotePosixPath(target.normalized)} "$QUARANTINE_DIR/"`)
			} else {
				lines.push(`run_cmd rm -f ${quotePosixPath(target.normalized)}`)
			}
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('printf "No reclaimable beta builds or regenerable build caches under current mobile vault protections.\\n"')
	} else {
		lines.push(`printf "Completed Mobile App Build & Crash Symbol Vault remediation plan (%d target actions, DRY_RUN=%s).\\n" "${actionCount}" "$DRY_RUN"`)
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe RFC-4180 CSV audit report.
 *
 * @param {object} auditResult Result from auditMobileBuildVault.
 * @return {string} RFC-4180 CSV string.
 */
export function buildMobileBuildCsvReport(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const headers = [
		'cluster_id',
		'cluster_name',
		'mobile_platform',
		'app_build_version',
		'mobile_lineage_stem',
		'family',
		'cluster_verdict',
		'member_path',
		'artifact_kind',
		'vault_role',
		'build_tag',
		'governance_tier',
		'action',
		'shielded',
		'protected_reason',
		'is_survivor',
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
				cluster.mobilePlatform || '',
				cluster.buildVersion || '',
				cluster.mobileLineageStem,
				cluster.family,
				cluster.clusterVerdict,
				member.normalized,
				member.artifactKind,
				member.vaultRole,
				member.buildTag || '',
				member.governanceTier,
				member.action,
				member.shielded ? 'true' : 'false',
				member.protectedReason || '',
				member.isSurvivor ? 'true' : 'false',
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
 * @param {object} auditResult Result from auditMobileBuildVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildMobileBuildJsonManifest(auditResult) {
	const payload = {
		schema: MOBILE_BUILD_VAULT_SCHEMA,
		generatedAt: new Date().toISOString(),
		config: auditResult?.config || MOBILE_BUILD_DEFAULT_CONFIG,
		summary: auditResult?.summary || {},
		clusters: (auditResult?.clusters || []).map(cluster => ({
			id: cluster.id,
			name: cluster.name,
			mobilePlatform: cluster.mobilePlatform,
			buildVersion: cluster.buildVersion,
			mobileLineageStem: cluster.mobileLineageStem,
			family: cluster.family,
			clusterVerdict: cluster.clusterVerdict,
			unitBytes: cluster.unitBytes,
			totalBytes: cluster.totalBytes,
			reclaimableBytes: cluster.reclaimableBytes,
			survivorPath: cluster.survivorPath,
			hasSigningKeystore: cluster.hasSigningKeystore,
			hasSignedStoreRelease: cluster.hasSignedStoreRelease,
			hasProdSymbolVault: cluster.hasProdSymbolVault,
			hasBetaCiIntermediate: cluster.hasBetaCiIntermediate,
			hasRegenerableBuildCache: cluster.hasRegenerableBuildCache,
			hasVerifiedReleaseAnchor: cluster.hasVerifiedReleaseAnchor,
			crossGroupBetaVariantsCount: cluster.crossGroupBetaVariantsCount,
			buildTags: cluster.buildTags,
			members: (cluster.members || []).map(member => ({
				path: member.normalized,
				artifactKind: member.artifactKind,
				vaultRole: member.vaultRole,
				buildTag: member.buildTag || '',
				governanceTier: member.governanceTier,
				action: member.action,
				shielded: member.shielded,
				protectedReason: member.protectedReason,
				isSurvivor: member.isSurvivor,
				size: member.size,
			})),
		})),
	}
	return JSON.stringify(payload, null, 2)
}

/**
 * Generate a Nextcloud/rsync .sync-exclude.lst rule set for regenerable iOS/Android
 * build caches (DerivedData/, .gradle/, build/, Pods/) and intermediate beta/debug artifacts.
 *
 * @return {string} Line-delimited .sync-exclude.lst rules.
 */
export function buildMobileBuildSyncExcludeList() {
	return [
		'# Nextcloud / rsync exclusion rules for Mobile Build Caches, Xcode DerivedData, Gradle & CocoaPods',
		'DerivedData/',
		'.gradle/',
		'Pods/',
		'Carthage/Build/',
		'.dart_tool/',
		'.cxx/',
		'ModuleCache.noindex/',
		'Intermediates.noindex/',
		'android/app/build/',
		'ios/build/',
		'build/intermediates/',
		'build/generated/',
		'build/outputs/apk/debug/',
		'*.apk.idsig',
		'*_debug.apk',
		'*_debug.ipa',
		'*_beta.ipa',
		'*_nightly.aab',
		'*.tmp',
	].join('\n')
}
