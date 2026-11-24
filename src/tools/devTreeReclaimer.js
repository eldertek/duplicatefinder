/**
 * Pure Dev Workspace & Dependency Bloat Whole-Tree Reclaimer.
 * Aggregates duplicated vendored dependency and build artifact trees
 * (node_modules, vendor, .venv, .git/objects, target, .gradle, __pycache__, dist)
 * by workspace root, shields source files and manifests, blocks unsafe
 * single-file cherry-picking inside packages, preserves the primary active
 * workspace, and emits DRY_RUN=1 whole-tree reclaim + occ files:scan scripts,
 * Nextcloud .sync-exclude.lst rules, and CWE-1236-safe CSV / JSON reports.
 * Zero DOM dependencies, zero network side effects.
 */

import { normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { formatBytes } from './duplicateStats'

export const DEV_TREE_SCHEMA = 'duplicatefinder.dev-tree-reclaimer.v1'

export const DEV_TREE_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'files_desc',
	'age_desc',
	'name_asc',
])

export const DEV_ECOSYSTEMS = Object.freeze({
	node: {
		id: 'node',
		label: 'Node.js (node_modules)',
		markers: ['node_modules', '.pnpm-store', '.yarn', '.npm'],
		manifests: ['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb'],
		rehydrateCommand: 'npm ci',
		isBuildOutput: false,
		isGitObjects: false,
	},
	php: {
		id: 'php',
		label: 'PHP Composer (vendor)',
		markers: ['vendor'],
		manifests: ['composer.json', 'composer.lock'],
		rehydrateCommand: 'composer install --no-interaction --prefer-dist',
		isBuildOutput: false,
		isGitObjects: false,
	},
	python: {
		id: 'python',
		label: 'Python (.venv / __pycache__)',
		markers: ['.venv', 'venv', '.tox', '.pytest_cache', '.mypy_cache', '.ruff_cache', '__pycache__'],
		manifests: ['pyproject.toml', 'requirements.txt', 'poetry.lock', 'uv.lock', 'Pipfile.lock'],
		rehydrateCommand: 'uv sync',
		isBuildOutput: false,
		isGitObjects: false,
	},
	rust: {
		id: 'rust',
		label: 'Rust (target / .cargo)',
		markers: ['target', '.cargo'],
		manifests: ['Cargo.toml', 'Cargo.lock'],
		rehydrateCommand: 'cargo check',
		isBuildOutput: true,
		isGitObjects: false,
	},
	git: {
		id: 'git',
		label: 'Git Objects (.git/objects)',
		markers: ['.git/objects', '.git/lfs'],
		manifests: ['.git/config', '.git/HEAD'],
		rehydrateCommand: 'git gc --aggressive --prune=now',
		isBuildOutput: false,
		isGitObjects: true,
	},
	jvm: {
		id: 'jvm',
		label: 'JVM (.gradle / .m2)',
		markers: ['.gradle', '.m2'],
		manifests: ['build.gradle', 'build.gradle.kts', 'pom.xml', 'gradlew'],
		rehydrateCommand: './gradlew --refresh-dependencies',
		isBuildOutput: false,
		isGitObjects: false,
	},
	build: {
		id: 'build',
		label: 'Build Outputs (dist / .next / build)',
		markers: ['.next', '.nuxt', '.turbo', '.parcel-cache', '.vite', 'dist', 'build', 'coverage'],
		manifests: ['package.json', 'tsconfig.json', 'vite.config.js', 'next.config.js', 'Makefile'],
		rehydrateCommand: 'npm run build',
		isBuildOutput: true,
		isGitObjects: false,
	},
	mobile: {
		id: 'mobile',
		label: 'Mobile / Dart (Pods / .dart_tool)',
		markers: ['Pods', '.dart_tool'],
		manifests: ['Podfile', 'Podfile.lock', 'pubspec.yaml', 'pubspec.lock'],
		rehydrateCommand: 'pod install',
		isBuildOutput: false,
		isGitObjects: false,
	},
})

export const DEV_TREE_PRESETS = Object.freeze([
	{
		id: 'safe-whole-tree',
		name: 'Safe Whole-Tree',
		description: 'Reclaim stale secondary dependency trees (node_modules, vendor, .venv); preserve newest primary workspace and shield .git/objects and sources.',
		minStaleDays: 14,
		includeBuildOutputs: false,
		keepPrimaryWorkspace: true,
	},
	{
		id: 'sync-shield-first',
		name: 'Sync-Shield First',
		description: 'Conservative threshold (30 days) focused on generating .sync-exclude.lst rules while purging only cold archived dependency trees.',
		minStaleDays: 30,
		includeBuildOutputs: false,
		keepPrimaryWorkspace: true,
	},
	{
		id: 'aggressive-ci-clean',
		name: 'Aggressive Build + Dep Clean',
		description: 'Include build artifacts (target, dist, .next, build) with 7-day staleness threshold for maximum workspace reclamation.',
		minStaleDays: 7,
		includeBuildOutputs: true,
		keepPrimaryWorkspace: true,
	},
])

const SOURCE_MANIFEST_FILENAMES = new Set([
	'package.json',
	'package-lock.json',
	'pnpm-lock.yaml',
	'yarn.lock',
	'bun.lockb',
	'composer.json',
	'composer.lock',
	'cargo.toml',
	'cargo.lock',
	'pyproject.toml',
	'requirements.txt',
	'poetry.lock',
	'uv.lock',
	'pipfile',
	'pipfile.lock',
	'build.gradle',
	'build.gradle.kts',
	'pom.xml',
	'podfile',
	'podfile.lock',
	'pubspec.yaml',
	'pubspec.lock',
	'tsconfig.json',
	'makefile',
	'dockerfile',
	'config',
	'head',
])

const SOURCE_CODE_SEGMENTS = new Set([
	'src',
	'lib',
	'app',
	'tests',
	'test',
	'spec',
	'docs',
])

const SOURCE_CODE_EXTENSIONS = new Set([
	'.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte',
	'.php', '.py', '.rs', '.go', '.java', '.kt', '.swift', '.dart',
	'.c', '.cc', '.cpp', '.h', '.hpp', '.cs', '.rb', '.sql', '.md',
])

const TIMESTAMP_FIELDS = Object.freeze(['mtime', 'modified', 'updatedAt', 'lastModified'])

const ACTION_LABELS = Object.freeze({
	'purge-tree': 'Whole-tree purge + rehydrate',
	'git-gc-only': 'Git GC repack only (no delete)',
	'keep-primary': 'Keep primary active workspace',
	'protected-shield': 'Shielded (origin / operator / hold)',
})

const ECOSYSTEM_ORDER = Object.freeze([
	'git',
	'node',
	'php',
	'python',
	'rust',
	'jvm',
	'mobile',
	'build',
])

/**
 * Resolve a preset definition by id, falling back to safe-whole-tree.
 *
 * @param {string} presetId - Preset identifier.
 * @return {object} Preset definition.
 */
export function getDevTreePreset(presetId) {
	return DEV_TREE_PRESETS.find(item => item.id === presetId) || DEV_TREE_PRESETS[0]
}

/**
 * Parse a timestamp (seconds or milliseconds, Date, or ISO string) to epoch ms.
 *
 * @param {*} value - Candidate timestamp.
 * @return {number|null} Epoch ms or null.
 */
function parseTimestampMs(value) {
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
		if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
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
 * Extract best modification timestamp in ms from a duplicate file entry.
 *
 * @param {object} file - File entry.
 * @return {number|null} Epoch ms or null.
 */
function getFileTimestampMs(file) {
	if (!file || typeof file !== 'object') {
		return null
	}
	for (const field of TIMESTAMP_FIELDS) {
		if (Object.prototype.hasOwnProperty.call(file, field)) {
			const ts = parseTimestampMs(file[field])
			if (ts !== null) {
				return ts
			}
		}
	}
	return null
}

/**
 * Parse a non-negative number safely with fallback.
 *
 * @param {*} value - Input value.
 * @param {number} fallback - Default value.
 * @param {number} min - Minimum bound.
 * @param {number} max - Maximum bound.
 * @return {number} Clamped number.
 */
function parseBoundedNumber(value, fallback, min, max) {
	if (value === '' || value === null || value === undefined) {
		return fallback
	}
	const num = Number(value)
	if (!Number.isFinite(num)) {
		return fallback
	}
	return Math.min(max, Math.max(min, num))
}

/**
 * Extract Nextcloud user prefix (e.g. '/alice/files' -> 'alice') and scan path.
 *
 * @param {string} rawPath - Full Nextcloud path.
 * @return {{ user: string, scanPath: string }} User and occ files:scan path.
 */
export function extractNextcloudOccTarget(rawPath) {
	const clean = typeof rawPath === 'string' ? rawPath.replace(/\\/g, '/').trim() : ''
	const match = /^\/([^/]+)\/files(\/.*)?$/.exec(clean)
	if (match) {
		const user = match[1]
		const subPath = match[2] || '/'
		return {
			user,
			scanPath: `/${user}/files${subPath === '/' ? '' : subPath}`,
		}
	}
	return {
		user: 'admin',
		scanPath: clean || '/',
	}
}

/**
 * Extract package name inside a dependency tree (e.g. '@scope/pkg', 'lodash', 'symfony/console').
 *
 * @param {string} markerSegment - Matched marker segment.
 * @param {string[]} innerSegments - Path segments inside the tree root.
 * @return {string} Package name or fallback segment.
 */
function extractPackageName(markerSegment, innerSegments) {
	if (!Array.isArray(innerSegments) || innerSegments.length === 0) {
		return markerSegment
	}
	const first = innerSegments[0]
	if (markerSegment === 'node_modules') {
		if (first === '.pnpm' && innerSegments.length > 1) {
			return innerSegments[1]
		}
		if (first.startsWith('@') && innerSegments.length > 1) {
			return `${first}/${innerSegments[1]}`
		}
		return first
	}
	if (markerSegment === 'vendor') {
		if (innerSegments.length >= 2 && !innerSegments[1].includes('.')) {
			return `${first}/${innerSegments[1]}`
		}
		return first
	}
	if (markerSegment === '.venv' || markerSegment === 'venv') {
		const siteIdx = innerSegments.findIndex(seg => seg === 'site-packages' || seg === 'dist-packages')
		if (siteIdx !== -1 && innerSegments[siteIdx + 1]) {
			return innerSegments[siteIdx + 1]
		}
	}
	if (markerSegment === '.git/objects') {
		return first === 'pack' ? 'git-packfile' : 'loose-object'
	}
	return first
}

/**
 * Inspect a file path to classify whether it belongs to a dev dependency/build
 * artifact tree or a protected source/manifest location.
 *
 * @param {string|null|undefined} rawPath - File path.
 * @param {object} [fileMeta] - Optional file metadata object.
 * @return {object} Structured dev tree classification.
 */
export function detectDevTreePathInfo(rawPath, fileMeta = {}) {
	const normalizedInput = typeof rawPath === 'string'
		? rawPath.replace(/\\/g, '/').replace(/\/+/g, '/').trim()
		: ''
	const segments = normalizedInput.split('/').filter(Boolean)
	const fileName = segments.length > 0 ? segments[segments.length - 1] : ''
	const lowerFileName = fileName.toLowerCase()
	const dotIndex = lowerFileName.lastIndexOf('.')
	const ext = dotIndex > 0 ? lowerFileName.slice(dotIndex) : ''

	let matched = null

	// Check two-segment markers first (e.g. .git/objects, .git/lfs)
	for (let i = 0; i < segments.length - 1; i += 1) {
		if (segments[i] === '.git' && (segments[i + 1] === 'objects' || segments[i + 1] === 'lfs')) {
			matched = {
				ecosystemId: 'git',
				markerIndex: i,
				markerLength: 2,
				markerSegment: `.git/${segments[i + 1]}`,
			}
			break
		}
	}

	// Check single-segment dependency/build markers (outermost dependency root first)
	if (!matched) {
		for (let i = 0; i < segments.length - 1; i += 1) {
			const seg = segments[i]
			for (const ecoId of ECOSYSTEM_ORDER) {
				const eco = DEV_ECOSYSTEMS[ecoId]
				if (eco.isGitObjects) {
					continue
				}
				if (eco.markers.includes(seg)) {
					matched = {
						ecosystemId: ecoId,
						markerIndex: i,
						markerLength: 1,
						markerSegment: seg,
					}
					break
				}
			}
			if (matched) {
				break
			}
		}
	}

	const isOriginFolder = Boolean(fileMeta && (fileMeta.isInOriginFolder || fileMeta.isOrigin || fileMeta.protected))

	if (!matched) {
		const isManifest = SOURCE_MANIFEST_FILENAMES.has(lowerFileName)
		const inSourceDir = segments.some(seg => SOURCE_CODE_SEGMENTS.has(seg.toLowerCase()))
		const isSourceExt = SOURCE_CODE_EXTENSIONS.has(ext)
		const isSourceOrManifest = Boolean(isManifest || inSourceDir || isSourceExt)

		return {
			rawPath: normalizedInput,
			isDevTreeFile: false,
			ecosystemId: null,
			ecosystemLabel: '',
			markerSegment: '',
			workspaceRoot: '',
			workspaceName: '',
			treeRootPath: '',
			relativeInsideTree: '',
			packageName: '',
			isSourceOrManifest,
			isImmutableGitObject: false,
			isBuildOutput: false,
			isOriginFolder,
			rehydrateCommand: '',
		}
	}

	const eco = DEV_ECOSYSTEMS[matched.ecosystemId]
	const prefix = normalizedInput.startsWith('/') ? '/' : ''
	const workspaceSegments = segments.slice(0, matched.markerIndex)
	const workspaceRoot = workspaceSegments.length > 0
		? `${prefix}${workspaceSegments.join('/')}`
		: (prefix || '/')
	const workspaceName = workspaceSegments.length > 0
		? workspaceSegments[workspaceSegments.length - 1]
		: 'workspace-root'
	const treeEndIndex = matched.markerIndex + matched.markerLength
	const treeRootSegments = segments.slice(0, treeEndIndex)
	const treeRootPath = `${prefix}${treeRootSegments.join('/')}`
	const innerSegments = segments.slice(treeEndIndex)
	const relativeInsideTree = innerSegments.join('/')
	const packageName = extractPackageName(matched.markerSegment, innerSegments)

	return {
		rawPath: normalizedInput,
		isDevTreeFile: true,
		ecosystemId: eco.id,
		ecosystemLabel: eco.label,
		markerSegment: matched.markerSegment,
		workspaceRoot,
		workspaceName,
		treeRootPath,
		relativeInsideTree,
		packageName,
		isSourceOrManifest: false,
		isImmutableGitObject: Boolean(eco.isGitObjects),
		isBuildOutput: Boolean(eco.isBuildOutput),
		isOriginFolder,
		rehydrateCommand: eco.rehydrateCommand,
	}
}

/**
 * Determine whether a duplicate group matches the requested acknowledged filter.
 *
 * @param {object} duplicate - Duplicate group.
 * @param {'unacknowledged'|'all'|'acknowledged'} mode - Filter mode.
 * @return {boolean} True when included.
 */
function matchesAcknowledgedFilter(duplicate, mode) {
	if (mode === 'all') {
		return true
	}
	const isAck = Boolean(duplicate && duplicate.acknowledged)
	return mode === 'acknowledged' ? isAck : !isAck
}

/**
 * Analyze duplicate groups to roll up duplicated dependency & build trees by
 * workspace root, guard source files/manifests, prevent single-file cherry-picks,
 * and determine safe whole-tree reclamation plans.
 *
 * @param {Array<object>} duplicates - Duplicate groups from API.
 * @param {object} [options] - Analysis options.
 * @return {object} Structured analysis payload.
 */
export function analyzeDevTreeDuplicates(duplicates, options = {}) {
	const preset = getDevTreePreset(options.presetId)
	const nowMs = parseTimestampMs(options.nowMs) || Date.now()
	const minStaleDays = parseBoundedNumber(
		options.minStaleDays,
		preset.minStaleDays,
		0,
		3650,
	)
	const includeBuildOutputs = typeof options.includeBuildOutputs === 'boolean'
		? options.includeBuildOutputs
		: preset.includeBuildOutputs
	const keepPrimaryWorkspace = typeof options.keepPrimaryWorkspace === 'boolean'
		? options.keepPrimaryWorkspace
		: preset.keepPrimaryWorkspace
	const workspaceFilter = typeof options.workspaceFilter === 'string'
		? options.workspaceFilter.trim().toLowerCase()
		: ''
	const ecosystemFilter = typeof options.ecosystemFilter === 'string' && options.ecosystemFilter !== ''
		? options.ecosystemFilter
		: 'all'
	const actionFilter = typeof options.actionFilter === 'string' && options.actionFilter !== ''
		? options.actionFilter
		: 'all'
	const sortMode = DEV_TREE_SORT_MODES.includes(options.sortMode)
		? options.sortMode
		: 'reclaim_desc'
	const acknowledgedState = options.acknowledgedState || 'all'
	const approvedTreeOverrides = options.approvedTreeOverrides && typeof options.approvedTreeOverrides === 'object'
		? options.approvedTreeOverrides
		: {}

	const sourceGroups = Array.isArray(duplicates) ? duplicates : []
	const treeMap = new Map()
	const affectedGroupIds = new Set()
	const groupSummaries = []
	let cherryPickBlockedFilesCount = 0

	for (const group of sourceGroups) {
		if (!group || typeof group !== 'object' || !Array.isArray(group.files) || group.files.length < 2) {
			continue
		}
		if (!matchesAcknowledgedFilter(group, acknowledgedState)) {
			continue
		}

		const inspectedFiles = group.files
			.filter(file => file && typeof file === 'object' && typeof file.path === 'string' && file.path.trim() !== '')
			.map(file => {
				const size = Number.isFinite(Number(file.size)) && Number(file.size) > 0 ? Number(file.size) : 0
				const mtimeMs = getFileTimestampMs(file)
				const treeInfo = detectDevTreePathInfo(file.path, file)
				return {
					file,
					key: getFileSelectionKey(file),
					path: file.path,
					displayPath: normalizePathForDiff(file.path) || file.path,
					size,
					mtimeMs,
					treeInfo,
				}
			})

		const devCopies = inspectedFiles.filter(entry => entry.treeInfo.isDevTreeFile)
		if (devCopies.length === 0) {
			continue
		}

		const sourceCopies = inspectedFiles.filter(entry => !entry.treeInfo.isDevTreeFile && entry.treeInfo.isSourceOrManifest)
		const hasSourceOrManifestCopy = sourceCopies.length > 0
		const groupId = group.id !== undefined && group.id !== null ? group.id : group.hash || String(groupSummaries.length + 1)
		affectedGroupIds.add(groupId)
		cherryPickBlockedFilesCount += devCopies.length

		groupSummaries.push({
			id: groupId,
			hash: group.hash || '',
			totalCopies: inspectedFiles.length,
			devCopiesCount: devCopies.length,
			hasSourceOrManifestCopy,
			samplePath: devCopies[0].displayPath,
			unitSize: devCopies[0].size,
		})

		for (const entry of devCopies) {
			const info = entry.treeInfo
			let bucket = treeMap.get(info.treeRootPath)
			if (!bucket) {
				const occTarget = extractNextcloudOccTarget(info.workspaceRoot)
				bucket = {
					treeRootPath: info.treeRootPath,
					displayTreePath: normalizePathForDiff(info.treeRootPath) || info.treeRootPath,
					workspaceRoot: info.workspaceRoot,
					displayWorkspacePath: normalizePathForDiff(info.workspaceRoot) || info.workspaceRoot,
					workspaceName: info.workspaceName,
					ecosystemId: info.ecosystemId,
					ecosystemLabel: info.ecosystemLabel,
					markerSegment: info.markerSegment,
					isImmutableGitObject: info.isImmutableGitObject,
					isBuildOutput: info.isBuildOutput,
					rehydrateCommand: info.rehydrateCommand,
					occUser: occTarget.user,
					occScanPath: occTarget.scanPath,
					duplicateFileCount: 0,
					observedDuplicateBytes: 0,
					latestMtimeMs: null,
					oldestMtimeMs: null,
					hasOriginProtectedCopy: false,
					hasSourceOverlapInGroups: false,
					groupIds: new Set(),
					packages: new Map(),
					sampleFiles: [],
					primaryDuplicate: group,
				}
				treeMap.set(info.treeRootPath, bucket)
			}

			bucket.duplicateFileCount += 1
			bucket.observedDuplicateBytes += entry.size
			bucket.groupIds.add(groupId)
			if (info.isOriginFolder) {
				bucket.hasOriginProtectedCopy = true
			}
			if (hasSourceOrManifestCopy) {
				bucket.hasSourceOverlapInGroups = true
			}
			if (entry.mtimeMs !== null) {
				if (bucket.latestMtimeMs === null || entry.mtimeMs > bucket.latestMtimeMs) {
					bucket.latestMtimeMs = entry.mtimeMs
				}
				if (bucket.oldestMtimeMs === null || entry.mtimeMs < bucket.oldestMtimeMs) {
					bucket.oldestMtimeMs = entry.mtimeMs
				}
			}
			if (info.packageName) {
				const prevPkg = bucket.packages.get(info.packageName) || { name: info.packageName, files: 0, bytes: 0 }
				prevPkg.files += 1
				prevPkg.bytes += entry.size
				bucket.packages.set(info.packageName, prevPkg)
			}
			if (bucket.sampleFiles.length < 8) {
				bucket.sampleFiles.push({
					key: entry.key,
					path: entry.path,
					displayPath: entry.displayPath,
					relativeInsideTree: info.relativeInsideTree,
					packageName: info.packageName,
					size: entry.size,
					mtimeMs: entry.mtimeMs,
					isOrigin: info.isOriginFolder,
					groupId,
				})
			}
		}
	}

	// Identify the newest active workspace per ecosystem+marker to preserve as primary reference
	const primaryTreeByMarker = new Map()
	if (keepPrimaryWorkspace) {
		for (const bucket of treeMap.values()) {
			if (bucket.isImmutableGitObject) {
				continue
			}
			const markerKey = `${bucket.ecosystemId}:${bucket.markerSegment}`
			const currentBest = primaryTreeByMarker.get(markerKey)
			if (!currentBest) {
				primaryTreeByMarker.set(markerKey, bucket)
				continue
			}
			const bucketTs = bucket.latestMtimeMs || 0
			const bestTs = currentBest.latestMtimeMs || 0
			if (bucket.hasOriginProtectedCopy && !currentBest.hasOriginProtectedCopy) {
				primaryTreeByMarker.set(markerKey, bucket)
			} else if (bucket.hasOriginProtectedCopy === currentBest.hasOriginProtectedCopy && bucketTs > bestTs) {
				primaryTreeByMarker.set(markerKey, bucket)
			}
		}
	}

	const primaryTreePaths = new Set()
	for (const best of primaryTreeByMarker.values()) {
		// Only designate a primary workspace if more than 1 workspace shares that marker
		const sameMarkerCount = Array.from(treeMap.values()).filter(
			item => item.ecosystemId === best.ecosystemId && item.markerSegment === best.markerSegment,
		).length
		if (sameMarkerCount > 1) {
			primaryTreePaths.add(best.treeRootPath)
		}
	}

	const allTrees = []
	for (const bucket of treeMap.values()) {
		const ageDays = bucket.latestMtimeMs !== null
			? Math.max(0, Math.floor((nowMs - bucket.latestMtimeMs) / 86400000))
			: null
		const isStale = ageDays === null ? true : ageDays >= minStaleDays
		const isPrimaryWorkspace = primaryTreePaths.has(bucket.treeRootPath)
		const override = approvedTreeOverrides[bucket.treeRootPath] || null

		let recommendedAction = 'purge-tree'
		let safetyReason = 'Secondary reproducible dependency tree eligible for whole-tree purge and lockfile rehydration.'

		if (bucket.isImmutableGitObject) {
			recommendedAction = 'git-gc-only'
			safetyReason = 'Never delete .git/objects directly; run git gc --aggressive --prune=now to repack objects safely.'
		} else if (override === 'shielded') {
			recommendedAction = 'protected-shield'
			safetyReason = 'Explicitly shielded by operator override.'
		} else if (bucket.hasOriginProtectedCopy) {
			recommendedAction = 'protected-shield'
			safetyReason = 'Contains origin-folder protected files; tree is shielded from automated purge.'
		} else if (override === 'approved-purge') {
			recommendedAction = 'purge-tree'
			safetyReason = 'Operator-approved for whole-tree purge and lockfile rehydration.'
		} else if (bucket.isBuildOutput && !includeBuildOutputs) {
			recommendedAction = 'keep-primary'
			safetyReason = 'Build output cleanup disabled in current preset; enable build outputs or override to purge.'
		} else if (isPrimaryWorkspace) {
			recommendedAction = 'keep-primary'
			safetyReason = 'Newest active workspace for this ecosystem; retained as primary reference copy.'
		} else if (!isStale) {
			recommendedAction = 'keep-primary'
			safetyReason = `Modified within ${minStaleDays} days (${ageDays}d ago); below staleness floor.`
		}

		const topPackages = Array.from(bucket.packages.values())
			.sort((a, b) => b.bytes - a.bytes || b.files - a.files || a.name.localeCompare(b.name))
			.slice(0, 6)

		allTrees.push({
			treeRootPath: bucket.treeRootPath,
			displayTreePath: bucket.displayTreePath,
			workspaceRoot: bucket.workspaceRoot,
			displayWorkspacePath: bucket.displayWorkspacePath,
			workspaceName: bucket.workspaceName,
			ecosystemId: bucket.ecosystemId,
			ecosystemLabel: bucket.ecosystemLabel,
			markerSegment: bucket.markerSegment,
			isImmutableGitObject: bucket.isImmutableGitObject,
			isBuildOutput: bucket.isBuildOutput,
			rehydrateCommand: bucket.rehydrateCommand,
			occUser: bucket.occUser,
			occScanPath: bucket.occScanPath,
			duplicateFileCount: bucket.duplicateFileCount,
			duplicateGroupIds: Array.from(bucket.groupIds),
			observedDuplicateBytes: bucket.observedDuplicateBytes,
			formattedBytes: formatBytes(bucket.observedDuplicateBytes),
			latestMtimeMs: bucket.latestMtimeMs,
			ageDays,
			isStale,
			isPrimaryWorkspace,
			hasOriginProtectedCopy: bucket.hasOriginProtectedCopy,
			hasSourceOverlapInGroups: bucket.hasSourceOverlapInGroups,
			override,
			recommendedAction,
			actionLabel: ACTION_LABELS[recommendedAction] || recommendedAction,
			safetyReason,
			uniquePackageCount: bucket.packages.size,
			topPackages,
			sampleFiles: bucket.sampleFiles,
			primaryDuplicate: bucket.primaryDuplicate,
		})
	}

	// Build summary across all detected dev trees (pre-UI filter)
	const ecosystemStatsMap = new Map()
	let purgeableTreesCount = 0
	let protectedTreesCount = 0
	let gitGcTreesCount = 0
	let keepPrimaryTreesCount = 0
	let totalReclaimableBytes = 0
	let totalObservedDevBytes = 0

	for (const tree of allTrees) {
		totalObservedDevBytes += tree.observedDuplicateBytes
		if (tree.recommendedAction === 'purge-tree') {
			purgeableTreesCount += 1
			totalReclaimableBytes += tree.observedDuplicateBytes
		} else if (tree.recommendedAction === 'git-gc-only') {
			gitGcTreesCount += 1
		} else if (tree.recommendedAction === 'protected-shield') {
			protectedTreesCount += 1
		} else {
			keepPrimaryTreesCount += 1
		}

		const ecoStat = ecosystemStatsMap.get(tree.ecosystemId) || {
			ecosystemId: tree.ecosystemId,
			ecosystemLabel: tree.ecosystemLabel,
			treeCount: 0,
			purgeableCount: 0,
			duplicateFileCount: 0,
			observedBytes: 0,
			reclaimableBytes: 0,
		}
		ecoStat.treeCount += 1
		ecoStat.duplicateFileCount += tree.duplicateFileCount
		ecoStat.observedBytes += tree.observedDuplicateBytes
		if (tree.recommendedAction === 'purge-tree') {
			ecoStat.purgeableCount += 1
			ecoStat.reclaimableBytes += tree.observedDuplicateBytes
		}
		ecosystemStatsMap.set(tree.ecosystemId, ecoStat)
	}

	const ecosystemBreakdown = Array.from(ecosystemStatsMap.values())
		.sort((a, b) => b.observedBytes - a.observedBytes || a.ecosystemId.localeCompare(b.ecosystemId))

	// Apply filters & sort for UI table
	const filteredTrees = allTrees.filter(tree => {
		if (ecosystemFilter !== 'all' && tree.ecosystemId !== ecosystemFilter) {
			return false
		}
		if (actionFilter !== 'all' && tree.recommendedAction !== actionFilter) {
			return false
		}
		if (workspaceFilter) {
			const haystack = [
				tree.treeRootPath,
				tree.workspaceName,
				tree.ecosystemLabel,
				tree.markerSegment,
				...tree.topPackages.map(pkg => pkg.name),
			].join(' ').toLowerCase()
			if (!haystack.includes(workspaceFilter)) {
				return false
			}
		}
		return true
	})

	filteredTrees.sort((a, b) => {
		if (sortMode === 'files_desc') {
			return b.duplicateFileCount - a.duplicateFileCount
				|| b.observedDuplicateBytes - a.observedDuplicateBytes
				|| a.treeRootPath.localeCompare(b.treeRootPath)
		}
		if (sortMode === 'age_desc') {
			const ageA = a.ageDays === null ? 999999 : a.ageDays
			const ageB = b.ageDays === null ? 999999 : b.ageDays
			return ageB - ageA || b.observedDuplicateBytes - a.observedDuplicateBytes
		}
		if (sortMode === 'name_asc') {
			return a.treeRootPath.localeCompare(b.treeRootPath)
		}
		// reclaim_desc
		const purgeWeightA = a.recommendedAction === 'purge-tree' ? 1 : 0
		const purgeWeightB = b.recommendedAction === 'purge-tree' ? 1 : 0
		return purgeWeightB - purgeWeightA
			|| b.observedDuplicateBytes - a.observedDuplicateBytes
			|| b.duplicateFileCount - a.duplicateFileCount
			|| a.treeRootPath.localeCompare(b.treeRootPath)
	})

	return {
		schema: DEV_TREE_SCHEMA,
		policy: {
			presetId: preset.id,
			presetName: preset.name,
			minStaleDays,
			includeBuildOutputs,
			keepPrimaryWorkspace,
		},
		summary: {
			totalTreesCount: allTrees.length,
			filteredTreesCount: filteredTrees.length,
			purgeableTreesCount,
			protectedTreesCount,
			gitGcTreesCount,
			keepPrimaryTreesCount,
			totalReclaimableBytes,
			formattedReclaimableBytes: formatBytes(totalReclaimableBytes),
			totalObservedDevBytes,
			formattedObservedDevBytes: formatBytes(totalObservedDevBytes),
			affectedDuplicateGroupsCount: affectedGroupIds.size,
			cherryPickBlockedFilesCount,
			ecosystemBreakdown,
		},
		allTrees,
		trees: filteredTrees,
	}
}

/**
 * Safely escape a string for single-quoted POSIX shell usage.
 *
 * @param {string} value - Raw string.
 * @return {string} Single-quoted POSIX shell literal.
 */
export function escapePosixSingleQuote(value) {
	const text = String(value === undefined || value === null ? '' : value)
	return `'${text.replace(/'/g, '\'"\'"\'')}'`
}

/**
 * Generate a safe DRY_RUN=1 POSIX bash whole-tree reclaim + occ files:scan script.
 * Never deletes single files inside packages and never runs rm -rf on .git/objects.
 *
 * @param {object} analysis - Result of analyzeDevTreeDuplicates.
 * @param {object} [options] - Script options.
 * @param {string} [options.dataRoot='/var/www/nextcloud/data'] - Nextcloud data directory root.
 * @param {string} [options.occBinary='sudo -u www-data php /var/www/nextcloud/occ'] - OCC command prefix.
 * @return {string} POSIX bash script text.
 */
export function buildDevTreeReclaimScript(analysis, options = {}) {
	const dataRoot = typeof options.dataRoot === 'string' && options.dataRoot.trim()
		? options.dataRoot.trim().replace(/\/+$/, '')
		: '/var/www/nextcloud/data'
	const occBinary = typeof options.occBinary === 'string' && options.occBinary.trim()
		? options.occBinary.trim()
		: 'sudo -u www-data php /var/www/nextcloud/occ'

	const allTrees = analysis && Array.isArray(analysis.allTrees) ? analysis.allTrees : []
	const purgeTrees = allTrees.filter(tree => tree.recommendedAction === 'purge-tree')
	const gitTrees = allTrees.filter(tree => tree.recommendedAction === 'git-gc-only')

	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# DuplicateFinder Whole-Tree Dev Dependency & Build Artifact Reclaim Script',
		'# Safety: DRY_RUN=1 by default. Run with DRY_RUN=0 bash script.sh to apply.',
		'# Guard: Never cherry-picks single files inside packages; never runs rm -rf on .git/objects.',
		'DRY_RUN="${DRY_RUN:-1}"', // eslint-disable-line no-template-curly-in-string
		`DATA_ROOT=${escapePosixSingleQuote(dataRoot)}`,
		'',
		'reclaim_tree() {',
		'  local rel_tree="$1"',
		'  local target="${DATA_ROOT}/${rel_tree#/}"', // eslint-disable-line no-template-curly-in-string
		'  if [[ ! -d "$target" ]]; then',
		'    echo "[SKIP] Missing directory: $target"',
		'    return 0',
		'  fi',
		'  if [[ "$DRY_RUN" != "0" ]]; then',
		'    echo "[DRY_RUN=1] Would remove whole dependency tree: $target"',
		'  else',
		'    echo "[PURGE] Removing whole dependency tree: $target"',
		'    rm -rf -- "$target"',
		'  fi',
		'}',
		'',
	]

	if (purgeTrees.length === 0) {
		lines.push('echo "No secondary dependency trees marked for whole-tree purge."')
	} else {
		const occPaths = new Set()
		for (const tree of purgeTrees) {
			lines.push(`# ${tree.ecosystemLabel} | ${tree.duplicateFileCount} dup files | ${tree.formattedBytes} | Rehydrate: ${tree.rehydrateCommand}`)
			lines.push(`reclaim_tree ${escapePosixSingleQuote(tree.treeRootPath)}`)
			occPaths.add(tree.occScanPath)
		}
		lines.push('')
		lines.push('# Refresh Nextcloud filecache after whole-tree removal')
		for (const scanPath of occPaths) {
			lines.push('if [[ "$DRY_RUN" != "0" ]]; then')
			lines.push(`  echo "[DRY_RUN=1] Would run: ${occBinary} files:scan --path=${escapePosixSingleQuote(scanPath)}"`)
			lines.push('else')
			lines.push(`  ${occBinary} files:scan --path=${escapePosixSingleQuote(scanPath)}`)
			lines.push('fi')
		}
	}

	if (gitTrees.length > 0) {
		lines.push('')
		lines.push('# Git object stores (NEVER rm -rf; compact packs safely with git gc)')
		for (const gitTree of gitTrees) {
			const repoPath = `${dataRoot}/${gitTree.workspaceRoot.replace(/^\/+/, '')}`
			lines.push(`# Advisory: git -C ${escapePosixSingleQuote(repoPath)} gc --aggressive --prune=now`)
		}
	}

	lines.push('')
	return lines.join('\n')
}

/**
 * Generate Nextcloud Desktop .sync-exclude.lst / .ncignore patterns tailored
 * to the detected ecosystems (plus standard dev bloat defaults).
 *
 * @param {object} analysis - Result of analyzeDevTreeDuplicates.
 * @return {string} Sync exclude pattern block.
 */
export function buildNextcloudSyncExcludeRules(analysis) {
	const allTrees = analysis && Array.isArray(analysis.allTrees) ? analysis.allTrees : []
	const detectedMarkers = new Set(allTrees.map(tree => tree.markerSegment).filter(Boolean))
	const defaults = [
		'node_modules/',
		'vendor/',
		'.venv/',
		'venv/',
		'__pycache__/',
		'target/',
		'.git/',
		'.gradle/',
		'.next/',
		'dist/',
		'build/',
	]
	const patterns = new Set(defaults)
	for (const marker of detectedMarkers) {
		const clean = marker.endsWith('/') ? marker : `${marker}/`
		patterns.add(clean)
	}

	return [
		'# Nextcloud Desktop .sync-exclude.lst / .ncignore dev-bloat rules',
		'# Add via Nextcloud Desktop -> Settings -> Edit Ignored Files',
		...Array.from(patterns),
		'',
	].join('\n')
}

/**
 * Build a CWE-1236-safe RFC 4180 CSV audit report of rolled-up dev trees.
 *
 * @param {object} analysis - Result of analyzeDevTreeDuplicates.
 * @return {string} CSV payload.
 */
export function buildDevTreeCsvReport(analysis) {
	const trees = analysis && Array.isArray(analysis.trees) ? analysis.trees : []
	const header = [
		'Tree Root Path',
		'Workspace Root',
		'Ecosystem',
		'Marker Segment',
		'Recommended Action',
		'Duplicate Files',
		'Observed Duplicate Bytes',
		'Observed Size',
		'Unique Packages',
		'Age Days',
		'Primary Workspace',
		'Origin Protected',
		'Rehydrate Command',
		'OCC Scan Path',
		'Safety Reason',
	]
	const rows = [header.map(escapeCsvCell).join(',')]

	for (const tree of trees) {
		rows.push([
			tree.treeRootPath,
			tree.workspaceRoot,
			tree.ecosystemLabel,
			tree.markerSegment,
			tree.recommendedAction,
			String(tree.duplicateFileCount),
			String(tree.observedDuplicateBytes),
			tree.formattedBytes,
			String(tree.uniquePackageCount),
			tree.ageDays === null ? 'unknown' : String(tree.ageDays),
			tree.isPrimaryWorkspace ? 'yes' : 'no',
			tree.hasOriginProtectedCopy ? 'yes' : 'no',
			tree.rehydrateCommand,
			tree.occScanPath,
			tree.safetyReason,
		].map(escapeCsvCell).join(','))
	}

	return `${rows.join('\n')}\n`
}

/**
 * Build a deterministic JSON audit report of rolled-up dev trees.
 *
 * @param {object} analysis - Result of analyzeDevTreeDuplicates.
 * @return {string} Pretty JSON string.
 */
export function buildDevTreeJsonReport(analysis) {
	const safeAnalysis = analysis || analyzeDevTreeDuplicates([])
	return JSON.stringify({
		schema: DEV_TREE_SCHEMA,
		policy: safeAnalysis.policy,
		summary: safeAnalysis.summary,
		trees: (safeAnalysis.trees || []).map(tree => ({
			treeRootPath: tree.treeRootPath,
			workspaceRoot: tree.workspaceRoot,
			ecosystemId: tree.ecosystemId,
			ecosystemLabel: tree.ecosystemLabel,
			markerSegment: tree.markerSegment,
			recommendedAction: tree.recommendedAction,
			duplicateFileCount: tree.duplicateFileCount,
			observedDuplicateBytes: tree.observedDuplicateBytes,
			formattedBytes: tree.formattedBytes,
			uniquePackageCount: tree.uniquePackageCount,
			ageDays: tree.ageDays,
			isPrimaryWorkspace: tree.isPrimaryWorkspace,
			hasOriginProtectedCopy: tree.hasOriginProtectedCopy,
			hasSourceOverlapInGroups: tree.hasSourceOverlapInGroups,
			rehydrateCommand: tree.rehydrateCommand,
			occScanPath: tree.occScanPath,
			safetyReason: tree.safetyReason,
			topPackages: tree.topPackages,
		})),
	}, null, 2)
}
