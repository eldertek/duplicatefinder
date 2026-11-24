/**
 * Pure Audio Production, DAW Project & Sample Library Vault Auditor.
 * Classifies and audits duplicate clusters across 4 Audio Production & DAW Vault families:
 * - DAW Project Files (*.als, *.flp, *.logicx, *.rpp, *.cpr, *.ptx)
 * - Rendered Stems & Bounces (*.wav, *.aiff, *.flac, *.mp3)
 * - Sample & Instrument Libraries (*.sf2, *.nki, *.exs, sample pack duplicates)
 * - DAW Autosave & Waveform Peak Caches (*.reapeaks, *.asd, *.pkf, Backup/)
 *
 * Groups artifacts deterministically by session/project + normalized stem/sample signature,
 * shields latest master DAW projects and 24-bit WAV master anchors by default,
 * and computes safe reclaimable GB plus POSIX DRY_RUN=1 remediation scripts, CWE-1236 CSV exports,
 * JSON manifests, and .sync-exclude.lst rules.
 *
 * Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const AUDIO_DAW_VAULT_SCHEMA = 'duplicatefinder.audio-daw-vault-auditor.v1'

export const AUDIO_DAW_FAMILIES = Object.freeze([
	'all',
	'daw-projects',
	'rendered-stems-bounces',
	'sample-instrument-libraries',
	'daw-autosave-peak-caches',
])

export const AUDIO_DAW_FAMILY_META = Object.freeze({
	'daw-projects': {
		id: 'daw-projects',
		label: 'DAW Projects',
		shortLabel: 'Projects (.als/.flp/.logicx/.rpp/.cpr/.ptx)',
	},
	'rendered-stems-bounces': {
		id: 'rendered-stems-bounces',
		label: 'Rendered Stems & Bounces',
		shortLabel: 'Stems/Bounces (.wav/.aiff/.flac/.mp3)',
	},
	'sample-instrument-libraries': {
		id: 'sample-instrument-libraries',
		label: 'Sample & Instrument Libraries',
		shortLabel: 'Samples (.sf2/.nki/.exs & sample packs)',
	},
	'daw-autosave-peak-caches': {
		id: 'daw-autosave-peak-caches',
		label: 'Autosave & Waveform Caches',
		shortLabel: 'Caches (.reapeaks/.asd/.pkf & Backup/)',
	},
})

export const AUDIO_DAW_STRATEGIES = Object.freeze([
	'prune-caches-and-redundant-bounces',
	'consolidate-sample-library-hardlinks',
	'prune-autosaves-and-peak-caches-only',
])

export const AUDIO_DAW_SURVIVOR_RULES = Object.freeze([
	'master-project-and-24bit-wav-first',
	'latest-revision-first',
	'lossless-master-first',
	'shortest-path',
])

export const AUDIO_DAW_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'master-project',
	'wav-master',
	'peak-cache',
	'sample-library',
	'shielded',
])

export const AUDIO_DAW_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'revision_desc',
	'copies_desc',
	'name_asc',
])

export const AUDIO_DAW_PRESETS = Object.freeze([
	{
		id: 'all-audio-daw-vault-audit',
		name: 'All DAW & Sample Vault Audit',
		description: 'Audit DAW projects, rendered stems/bounces, sample/instrument libraries, and autosave/peak caches while shielding latest master projects and 24-bit WAV master anchors.',
		familyFilter: 'all',
		strategy: 'prune-caches-and-redundant-bounces',
		survivorRule: 'master-project-and-24bit-wav-first',
		protectLatestMasterProject: true,
		protect24BitWavMasters: true,
		keepPreviousProjectVersions: 1,
		staleCacheDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'prune-peaks-and-autosave-caches',
		name: 'Prune Peaks & Autosaves',
		description: 'Reclaim duplicate .reapeaks, .asd, .pkf waveform caches and stale DAW Backup/ autosaves older than the retention window.',
		familyFilter: 'daw-autosave-peak-caches',
		strategy: 'prune-autosaves-and-peak-caches-only',
		survivorRule: 'master-project-and-24bit-wav-first',
		protectLatestMasterProject: true,
		protect24BitWavMasters: true,
		keepPreviousProjectVersions: 1,
		staleCacheDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'consolidate-sample-libraries',
		name: 'Hardlink-Consolidate Samples',
		description: 'Deduplicate mirrored .sf2, .nki, .exs instrument patches and sample pack WAV/AIFF loops onto canonical library anchors via POSIX hardlinks.',
		familyFilter: 'sample-instrument-libraries',
		strategy: 'consolidate-sample-library-hardlinks',
		survivorRule: 'lossless-master-first',
		protectLatestMasterProject: true,
		protect24BitWavMasters: true,
		keepPreviousProjectVersions: 1,
		staleCacheDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'audit-stems-and-bounces',
		name: 'Rendered Stems & Bounces',
		description: 'Audit duplicate .wav, .aiff, .flac, and .mp3 stems and mixdowns while shielding canonical 24-bit WAV master anchors.',
		familyFilter: 'rendered-stems-bounces',
		strategy: 'prune-caches-and-redundant-bounces',
		survivorRule: 'lossless-master-first',
		protectLatestMasterProject: true,
		protect24BitWavMasters: true,
		keepPreviousProjectVersions: 1,
		staleCacheDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'audit-daw-project-revisions',
		name: 'DAW Project Revisions',
		description: 'Audit duplicate .als, .flp, .logicx, .rpp, .cpr, and .ptx sessions grouped by project while protecting the latest master project revision.',
		familyFilter: 'daw-projects',
		strategy: 'prune-caches-and-redundant-bounces',
		survivorRule: 'latest-revision-first',
		protectLatestMasterProject: true,
		protect24BitWavMasters: true,
		keepPreviousProjectVersions: 1,
		staleCacheDays: 14,
		minSizeMb: 0,
	},
])

const DAW_PROJECT_EXT_SET = new Set([
	'als',
	'flp',
	'logicx',
	'rpp',
	'cpr',
	'ptx',
	'ptf',
	'npr',
	'song',
	'sesx',
	'aup3',
	'ardour',
])

const RENDERED_STEM_EXT_SET = new Set([
	'wav',
	'aiff',
	'aif',
	'flac',
	'mp3',
	'caf',
	'ogg',
	'm4a',
])

const SAMPLE_INSTRUMENT_EXT_SET = new Set([
	'sf2',
	'nki',
	'exs',
	'nkm',
	'nkx',
	'sfz',
	'gig',
	'adv',
	'adg',
	'fst',
	'rx2',
	'rex',
	'alc',
])

const PEAK_CACHE_EXT_SET = new Set([
	'reapeaks',
	'asd',
	'pkf',
	'pk',
	'ovw',
	'wfm',
	'rpp-bak',
	'als-bak',
	'cpr-bak',
	'bak',
	'autosave',
])

const AUTOSAVE_BACKUP_PATH_RE = /(\/(?:backup|backups|autosave|auto-save|session\s+file\s+backups?|peak\s*files?|reapeaks|wavecache|waveform[_-]?cache|ableton\s+project\s+info|undo[_-]?history|freeze[_-]?files?)(?:\/|$))/i
const AUTOSAVE_NAME_RE = /(?:[._-](?:autosave|auto-save|backup|bak|recover|recovery|undo)(?:[._-\d]|$)|\.(?:rpp-bak|reapeaks|asd|pkf)$)/i

const SAMPLE_LIBRARY_PATH_RE = /(\/(?:samples?|sample[_-]?packs?|sample[_-]?librar(?:y|ies)|splice|kontakt|instruments?|soundfonts?|drum[_-]?kits?|one[_-]?shots?|loops?|packs?|presets?|factory\s+library|user\s+library)(?:\/|$))/i

const MASTER_VAULT_PATH_RE = /(\/(?:masters?|master[_-]?vault|final[_-]?masters?|sessions?|projects?|studio[_-]?vault|daw[_-]?projects?|production[_-]?vault|__groupfolders\/\d+\/(?:studio|audio|masters?|sessions?))(?:\/|$))/i
const EXPORT_STAGING_PATH_RE = /(\/(?:downloads?|telechargements?|tmp|temp|scratch|staging|bounces?[_-]?tmp|rough[_-]?mix(?:es)?|demos?|preview[_-]?bounces?|wetransfer|dropzone|incoming|desktop|exports?[_-]?old)(?:\/|$))/i

const BIT24_WAV_MASTER_RE = /(?:24\s*[-_]?bit|32\s*[-_]?bit|master(?:ed|ing)?|final[_-]?master|print[_-]?master|24b(?:it)?|48k|96k)/i
const MASTER_FOLDER_RE = /(\/(?:masters?|final[_-]?masters?|master[_-]?vault|mastering|print[_-]?masters?)(?:\/|$))/i

const REVISION_RE = /(?:^|[._\s-])(?:v|ver|rev|mix|take|render|bounce)[._-]?(\d{1,3})(?:[._\s-]|$)/i

const IGNORED_SESSION_SEGMENTS = new Set([
	'files',
	'audio',
	'music',
	'studio',
	'studio-vault',
	'daw',
	'daw-projects',
	'projects',
	'sessions',
	'session',
	'stems',
	'bounces',
	'exports',
	'renders',
	'masters',
	'master',
	'final-masters',
	'master-vault',
	'samples',
	'sample-packs',
	'sample-library',
	'sample-libraries',
	'splice',
	'kontakt',
	'instruments',
	'soundfonts',
	'drum-kits',
	'loops',
	'one-shots',
	'backup',
	'backups',
	'autosave',
	'auto-save',
	'session file backups',
	'peak files',
	'reapeaks',
	'wavecache',
	'downloads',
	'telechargements',
	'tmp',
	'temp',
	'staging',
	'desktop',
	'__groupfolders',
	'users',
	'home',
	'var',
	'www',
	'nextcloud',
	'data',
])

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
	const lower = basename.toLowerCase()
	if (lower.endsWith('.rpp-bak')) {
		return 'rpp-bak'
	}
	if (lower.endsWith('.als-bak')) {
		return 'als-bak'
	}
	if (lower.endsWith('.cpr-bak')) {
		return 'cpr-bak'
	}
	const dotIdx = lower.lastIndexOf('.')
	if (dotIdx <= 0 || dotIdx === lower.length - 1) {
		return ''
	}
	return lower.slice(dotIdx + 1)
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
 * Extract DAW session/project or sample pack name from path or basename.
 *
 * @param {string} basename File basename.
 * @param {string} fullPath Full normalized path.
 * @return {string} Normalized session/project slug.
 */
export function extractDawSessionName(basename, fullPath = '') {
	const segments = safeNormalizePath(fullPath).split('/').filter(Boolean)
	const dirSegments = segments.slice(0, -1)

	// Prefer a folder right after sessions/projects/daw/sample-packs/splice/kontakt/masters
	for (let i = 0; i < dirSegments.length; i += 1) {
		const segLower = dirSegments[i].toLowerCase()
		if (
			/^(?:sessions?|projects?|daw[_-]?projects?|studio[_-]?vault|masters?|final[_-]?masters?|sample[_-]?packs?|sample[_-]?librar(?:y|ies)|splice|kontakt|soundfonts?|drum[_-]?kits?|stems|bounces)$/.test(segLower)
			&& i + 1 < dirSegments.length
		) {
			const nextSeg = dirSegments[i + 1].replace(/\.(?:logicx|project|als|flp|rpp|cpr|ptx)$/i, '')
			const nextLower = nextSeg.toLowerCase()
			if (nextLower && !IGNORED_SESSION_SEGMENTS.has(nextLower) && !/^\d+$/.test(nextLower)) {
				return nextLower.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'studio-session'
			}
		}
	}

	// Fallback: deepest non-ignored directory segment (skipping first user segment if others exist)
	for (let i = dirSegments.length - 1; i >= 0; i -= 1) {
		const clean = dirSegments[i].replace(/\.(?:logicx|project|als|flp|rpp|cpr|ptx)$/i, '').toLowerCase()
		if (clean && !IGNORED_SESSION_SEGMENTS.has(clean) && !/^\d+$/.test(clean)) {
			return clean.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'studio-session'
		}
	}

	return normalizeAudioSignature(basename)
}

/**
 * Parse project or bounce revision number from basename or path.
 *
 * @param {string} basename File basename.
 * @param {string} fullPath Full normalized path.
 * @return {number} Parsed revision number or 0.
 */
export function parseProjectRevision(basename, fullPath = '') {
	const match = REVISION_RE.exec(basename) || REVISION_RE.exec(fullPath)
	if (!match) {
		return 0
	}
	const num = Number.parseInt(match[1], 10)
	return Number.isFinite(num) && num > 0 ? num : 0
}

/**
 * Normalize a DAW project, stem, bounce, or sample filename into a deterministic signature.
 *
 * @param {string} basename File basename.
 * @return {string} Normalized audio signature slug.
 */
export function normalizeAudioSignature(basename) {
	if (!basename || typeof basename !== 'string') {
		return 'untitled-track'
	}
	let stem = basename.trim()
	// Strip chained peak/backup extensions first (e.g. Kick.wav.reapeaks, Vocal.wav.asd, Song.rpp-bak)
	stem = stem.replace(/\.(?:reapeaks|asd|pkf|pk|ovw|wfm|rpp-bak|als-bak|cpr-bak|bak|autosave)$/i, '')
	const dotIdx = stem.lastIndexOf('.')
	if (dotIdx > 0) {
		stem = stem.slice(0, dotIdx)
	}
	// Strip secondary audio extension if still chained
	stem = stem.replace(/\.(?:wav|aiff|aif|flac|mp3|als|flp|logicx|rpp|cpr|ptx|sf2|nki|exs)$/i, '')
	// Strip copy/revision/autosave suffixes repeatedly
	let prev = ''
	while (prev !== stem) {
		prev = stem
		stem = stem.replace(/(?:\s*\(\d+\)|[._\s-]+(?:copy|backup|bak|autosave|auto-save|dup|duplicate|old|rough|tmp|v\d+|rev\d+|mix\d+|take\d+|\d{4}[-_]\d{2}[-_]\d{2}))+$/gi, '')
	}
	stem = stem
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')

	return stem || 'audio-asset'
}

/**
 * Detect DAW host application and format badge for display.
 *
 * @param {string} ext File extension.
 * @param {string} basename File basename.
 * @param {string} fullPath Full normalized path.
 * @param {string} family Assigned family ID.
 * @return {object} DAW host label and format badge.
 */
function detectDawAndAudioFormat(ext, basename, fullPath, family) {
	const lowerPath = fullPath.toLowerCase()
	let dawHost = 'Multi-DAW Audio'
	if (ext === 'als' || ext === 'als-bak' || ext === 'asd' || ext === 'alc' || ext === 'adv' || ext === 'adg' || lowerPath.includes('ableton')) {
		dawHost = 'Ableton Live'
	} else if (ext === 'flp' || ext === 'fst' || lowerPath.includes('fl studio') || lowerPath.includes('fl-studio')) {
		dawHost = 'FL Studio'
	} else if (ext === 'logicx' || ext === 'exs' || ext === 'caf' || lowerPath.includes('logic')) {
		dawHost = 'Logic Pro'
	} else if (ext === 'rpp' || ext === 'rpp-bak' || ext === 'reapeaks' || lowerPath.includes('reaper')) {
		dawHost = 'REAPER'
	} else if (ext === 'cpr' || ext === 'cpr-bak' || ext === 'npr' || lowerPath.includes('cubase') || lowerPath.includes('nuendo')) {
		dawHost = 'Cubase / Nuendo'
	} else if (ext === 'ptx' || ext === 'ptf' || lowerPath.includes('pro tools') || lowerPath.includes('pro-tools')) {
		dawHost = 'Pro Tools'
	} else if (ext === 'nki' || ext === 'nkm' || ext === 'nkx' || lowerPath.includes('kontakt')) {
		dawHost = 'Kontakt'
	} else if (ext === 'sf2' || ext === 'sfz' || ext === 'gig') {
		dawHost = 'SoundFont / Sampler'
	} else if (lowerPath.includes('splice')) {
		dawHost = 'Splice Sample Pack'
	}

	let formatBadge = ext ? `.${ext}` : 'audio'
	if (family === 'daw-autosave-peak-caches') {
		formatBadge = ext ? `CACHE .${ext}` : 'Autosave/Peak'
	} else if (family === 'sample-instrument-libraries') {
		formatBadge = ext ? `LIB .${ext}` : 'Sample Pack'
	} else if (family === 'rendered-stems-bounces' && (ext === 'wav' || ext === 'aiff' || ext === 'aif') && (BIT24_WAV_MASTER_RE.test(basename) || MASTER_FOLDER_RE.test(fullPath))) {
		formatBadge = `24-bit .${ext}`
	}

	return { dawHost, formatBadge }
}

/**
 * Classify a single file into one of the 4 Audio Production, DAW Project & Sample Library families.
 *
 * @param {object} file Duplicate file entry.
 * @return {object|null} Classification metadata or null if unrelated.
 */
export function classifyAudioDawFile(file) {
	if (!file || typeof file !== 'object') {
		return null
	}
	const path = safeNormalizePath(file.path || file.filePath || '')
	const basename = getBasename(path)
	if (!basename) {
		return null
	}
	const ext = getExtension(basename)
	const mtimeSec = normalizeMtimeSec(file.mtime)

	const isKnownAudioExt = DAW_PROJECT_EXT_SET.has(ext)
		|| RENDERED_STEM_EXT_SET.has(ext)
		|| SAMPLE_INSTRUMENT_EXT_SET.has(ext)
		|| PEAK_CACHE_EXT_SET.has(ext)

	const inAutosaveOrPeakDir = AUTOSAVE_BACKUP_PATH_RE.test(path)
	const hasAutosaveName = AUTOSAVE_NAME_RE.test(basename)

	const isAutosavePeakCache = PEAK_CACHE_EXT_SET.has(ext)
		|| (isKnownAudioExt && (inAutosaveOrPeakDir || hasAutosaveName))

	const isDawProject = !isAutosavePeakCache && DAW_PROJECT_EXT_SET.has(ext)

	const isSampleLibrary = !isAutosavePeakCache && !isDawProject && (
		SAMPLE_INSTRUMENT_EXT_SET.has(ext)
		|| (RENDERED_STEM_EXT_SET.has(ext) && SAMPLE_LIBRARY_PATH_RE.test(path))
	)

	const isRenderedStemBounce = !isAutosavePeakCache && !isDawProject && !isSampleLibrary && RENDERED_STEM_EXT_SET.has(ext)

	if (!isAutosavePeakCache && !isDawProject && !isSampleLibrary && !isRenderedStemBounce) {
		return null
	}

	let family = 'daw-projects'
	let artifactKind = 'daw-project'
	if (isRenderedStemBounce) {
		family = 'rendered-stems-bounces'
		artifactKind = 'stem-bounce'
	} else if (isSampleLibrary) {
		family = 'sample-instrument-libraries'
		artifactKind = 'sample-library'
	} else if (isAutosavePeakCache) {
		family = 'daw-autosave-peak-caches'
		artifactKind = 'autosave-peak-cache'
	}

	const sessionName = extractDawSessionName(basename, path)
	const revisionNumber = parseProjectRevision(basename, path)
	const audioSignature = normalizeAudioSignature(basename)
	const { dawHost, formatBadge } = detectDawAndAudioFormat(ext, basename, path, family)

	const inExportStaging = EXPORT_STAGING_PATH_RE.test(path)
	const inMasterVault = MASTER_VAULT_PATH_RE.test(path) && !inExportStaging
	const isLossless = ext === 'wav' || ext === 'aiff' || ext === 'aif' || ext === 'flac' || ext === 'caf'
	const is24BitWavMaster = family === 'rendered-stems-bounces'
		&& (ext === 'wav' || ext === 'aiff' || ext === 'aif')
		&& !inExportStaging
		&& (BIT24_WAV_MASTER_RE.test(basename) || MASTER_FOLDER_RE.test(path))

	const vaultKey = `${sessionName}/${audioSignature}`

	return {
		path,
		dirname: getDirname(path),
		basename,
		ext,
		family,
		artifactKind,
		dawHost,
		formatBadge,
		sessionName,
		revisionNumber,
		audioSignature,
		mtimeSec,
		isLossless,
		is24BitWavMaster,
		inMasterVault,
		inExportStaging,
		vaultKey,
	}
}

/**
 * Format bytes as GB string with 2 decimals (e.g. "2.15 GB").
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
 * Build cross-dataset session revision index so latest master DAW projects per session
 * are deterministically identified and shielded.
 *
 * @param {Array<object>} duplicateGroups Raw duplicate groups.
 * @return {object} Cross-group session index.
 */
function buildAudioDawVaultIndex(duplicateGroups) {
	const projectRevisionsBySession = new Map()
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
			const meta = classifyAudioDawFile(file)
			if (!meta || meta.family !== 'daw-projects') {
				continue
			}
			if (!projectRevisionsBySession.has(meta.sessionName)) {
				projectRevisionsBySession.set(meta.sessionName, new Map())
			}
			const revKey = `${meta.revisionNumber}:${meta.audioSignature}`
			const sortScore = meta.revisionNumber * 1e12 + mtime
			const sessionMap = projectRevisionsBySession.get(meta.sessionName)
			const prev = sessionMap.get(revKey) || 0
			if (sortScore >= prev) {
				sessionMap.set(revKey, sortScore)
			}
		}
	}

	const revisionRankBySessionKey = new Map()
	for (const [sessionName, revMap] of projectRevisionsBySession.entries()) {
		const sorted = Array.from(revMap.entries()).sort((a, b) => b[1] - a[1])
		sorted.forEach(([revKey], idx) => {
			revisionRankBySessionKey.set(`${sessionName}::${revKey}`, idx)
		})
	}

	return {
		revisionRankBySessionKey,
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

	if (member.meta.is24BitWavMaster) {
		score += 34
	}
	if (member.meta.inMasterVault) {
		score += 24
	}
	if (member.meta.inExportStaging) {
		score -= 26
	}
	if (member.meta.family === 'daw-projects') {
		score += 14
	} else if (member.meta.family === 'daw-autosave-peak-caches') {
		score -= 16
	} else if (member.meta.family === 'sample-instrument-libraries') {
		score += 4
	}
	if (member.isInOriginFolder) {
		score += 18
	}

	if (survivorRule === 'latest-revision-first') {
		if (member.revisionRank === 0) {
			score += 16
		} else if (member.meta.revisionNumber > 0) {
			score += Math.min(12, member.meta.revisionNumber * 2)
		}
	} else if (survivorRule === 'lossless-master-first') {
		if (member.meta.isLossless) {
			score += 16
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
	if (a.meta.is24BitWavMaster !== b.meta.is24BitWavMaster) {
		return a.meta.is24BitWavMaster ? -1 : 1
	}

	if (survivorRule === 'latest-revision-first') {
		if (a.meta.revisionNumber !== b.meta.revisionNumber) {
			return b.meta.revisionNumber - a.meta.revisionNumber
		}
		if (a.mtimeSec !== b.mtimeSec) {
			return b.mtimeSec - a.mtimeSec
		}
	} else if (survivorRule === 'lossless-master-first') {
		if (a.meta.isLossless !== b.meta.isLossless) {
			return a.meta.isLossless ? -1 : 1
		}
	} else if (survivorRule === 'shortest-path') {
		if (a.meta.path.length !== b.meta.path.length) {
			return a.meta.path.length - b.meta.path.length
		}
	}

	if (a.authorityScore !== b.authorityScore) {
		return b.authorityScore - a.authorityScore
	}
	if (a.meta.inMasterVault !== b.meta.inMasterVault) {
		return a.meta.inMasterVault ? -1 : 1
	}
	if (a.mtimeSec !== b.mtimeSec) {
		return b.mtimeSec - a.mtimeSec
	}
	return a.meta.path.localeCompare(b.meta.path)
}

/**
 * Analyze duplicate groups for Audio Production, DAW Project & Sample Library Vault governance.
 *
 * @param {Array<object>} duplicateGroups Array of duplicate group objects.
 * @param {object} [options] Analysis configuration options.
 * @return {object} Deterministic audit report.
 */
export function analyzeAudioDawVault(duplicateGroups, options = {}) {
	const groups = Array.isArray(duplicateGroups) ? duplicateGroups.filter(Boolean) : []
	const familyFilter = AUDIO_DAW_FAMILIES.includes(options.familyFilter) ? options.familyFilter : 'all'
	const verdictFilter = AUDIO_DAW_VERDICT_FILTERS.includes(options.verdictFilter) ? options.verdictFilter : 'all'
	const sortMode = AUDIO_DAW_SORT_MODES.includes(options.sortMode) ? options.sortMode : 'reclaim_desc'
	const strategy = AUDIO_DAW_STRATEGIES.includes(options.strategy)
		? options.strategy
		: 'prune-caches-and-redundant-bounces'
	const survivorRule = AUDIO_DAW_SURVIVOR_RULES.includes(options.survivorRule)
		? options.survivorRule
		: 'master-project-and-24bit-wav-first'

	const protectLatestMasterProject = options.protectLatestMasterProject !== false
	const protect24BitWavMasters = options.protect24BitWavMasters !== false
	const keepPreviousProjectVersions = Number.isFinite(Number(options.keepPreviousProjectVersions)) && Number(options.keepPreviousProjectVersions) >= 0
		? Math.floor(Number(options.keepPreviousProjectVersions))
		: 1
	const staleCacheDays = Number.isFinite(Number(options.staleCacheDays)) && Number(options.staleCacheDays) >= 0
		? Number(options.staleCacheDays)
		: 14
	const minSizeMb = Number.isFinite(Number(options.minSizeMb)) && Number(options.minSizeMb) > 0
		? Number(options.minSizeMb)
		: 0
	const minSizeBytes = minSizeMb * 1024 * 1024
	const searchQuery = typeof options.searchQuery === 'string' ? options.searchQuery.trim().toLowerCase() : ''
	const memberOverrides = options.memberOverrides && typeof options.memberOverrides === 'object'
		? options.memberOverrides
		: {}

	const index = buildAudioDawVaultIndex(groups)
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
			const meta = classifyAudioDawFile(file)
			if (!meta) {
				continue
			}
			const size = Number.isFinite(Number(file.size)) && Number(file.size) > 0
				? Number(file.size)
				: (Number.isFinite(Number(group.size)) ? Number(group.size) : 0)
			const mtimeSec = normalizeMtimeSec(file.mtime)
			const ageDays = mtimeSec > 0 ? Math.max(0, Math.round(((referenceNowSec - mtimeSec) / 86400) * 10) / 10) : 0
			const revKey = `${meta.sessionName}::${meta.revisionNumber}:${meta.audioSignature}`
			const revisionRank = index.revisionRankBySessionKey.has(revKey)
				? index.revisionRankBySessionKey.get(revKey)
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
				revisionRank,
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

		classifiedMembers.sort((a, b) => compareSurvivorCandidates(a, b, survivorRule))
		const survivor = classifiedMembers[0]
		const primaryMeta = survivor.meta
		const family = primaryMeta.family
		const familyMeta = AUDIO_DAW_FAMILY_META[family] || AUDIO_DAW_FAMILY_META['daw-projects']

		const isLatestMasterProject = family === 'daw-projects'
			&& (survivor.revisionRank === 0 || (survivor.revisionRank === null && survivor.meta.inMasterVault))
		const isRetainedProjectVersion = family === 'daw-projects'
			&& survivor.revisionRank !== null
			&& survivor.revisionRank > 0
			&& survivor.revisionRank <= keepPreviousProjectVersions
		const has24BitWavMaster = classifiedMembers.some(m => m.meta.is24BitWavMaster)

		let reclaimableBytes = 0
		let reclaimableCopiesCount = 0
		let consolidatableCopiesCount = 0
		let shieldedCopiesCount = 0

		classifiedMembers.forEach((member, idx) => {
			const override = memberOverrides[member.selectionKey] || 'auto'

			if (idx === 0) {
				member.verdict = 'keep-canonical-survivor'
				member.actionType = 'keep'
				if (member.meta.is24BitWavMaster) {
					member.verdictReason = 'Canonical 24-bit WAV master anchor'
				} else if (isLatestMasterProject) {
					member.verdictReason = 'Latest master DAW project anchor'
				} else if (member.meta.inMasterVault) {
					member.verdictReason = 'Primary studio vault anchor'
				} else {
					member.verdictReason = 'Highest-authority audio asset survivor'
				}
				shieldedCopiesCount += 1
				return
			}

			if (override === 'keep') {
				member.verdict = 'blocked-manual-shield'
				member.actionType = 'keep'
				member.verdictReason = 'Manually shielded by studio engineer'
				shieldedCopiesCount += 1
				return
			}

			if (override === 'prune') {
				member.verdict = strategy === 'consolidate-sample-library-hardlinks'
					? 'consolidate-hardlink-sample'
					: 'reclaim-duplicate-audio-asset'
				member.actionType = strategy === 'consolidate-sample-library-hardlinks' ? 'hardlink' : 'prune'
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

			// Shield 24-bit WAV master copies inside master vault
			if (protect24BitWavMasters && member.meta.is24BitWavMaster) {
				member.verdict = 'blocked-24bit-wav-master'
				member.actionType = 'keep'
				member.verdictReason = `24-bit WAV master anchor shielded for ${member.meta.sessionName}`
				shieldedCopiesCount += 1
				return
			}

			// Shield latest master DAW project copies inside studio/master vault
			if (
				protectLatestMasterProject
				&& isLatestMasterProject
				&& member.meta.inMasterVault
				&& strategy !== 'consolidate-sample-library-hardlinks'
			) {
				member.verdict = 'blocked-latest-master-project'
				member.actionType = 'keep'
				member.verdictReason = `Latest master DAW project shielded for ${member.meta.sessionName}`
				shieldedCopiesCount += 1
				return
			}

			// Shield retained previous project versions inside studio vault
			if (
				protectLatestMasterProject
				&& isRetainedProjectVersion
				&& member.meta.inMasterVault
				&& strategy !== 'consolidate-sample-library-hardlinks'
			) {
				member.verdict = 'blocked-retained-project-version'
				member.actionType = 'keep'
				member.verdictReason = `Within project version retention window (keep ${keepPreviousProjectVersions} previous versions)`
				shieldedCopiesCount += 1
				return
			}

			// Protect very recent autosave/peak caches inside active project tree
			if (
				family === 'daw-autosave-peak-caches'
				&& !member.meta.inExportStaging
				&& member.ageDays < staleCacheDays
			) {
				member.verdict = 'blocked-recent-peak-cache'
				member.actionType = 'keep'
				member.verdictReason = `Recent DAW autosave/peak cache (${member.ageDays}d < ${staleCacheDays}d threshold)`
				shieldedCopiesCount += 1
				return
			}

			// Strategy: hardlink-consolidate sample libraries & stems
			if (strategy === 'consolidate-sample-library-hardlinks') {
				member.verdict = 'consolidate-hardlink-sample'
				member.actionType = 'hardlink'
				member.verdictReason = `Hardlink-consolidate onto ${survivor.basename} anchor`
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				consolidatableCopiesCount += 1
				return
			}

			// Strategy: prune autosaves and peak caches only
			if (strategy === 'prune-autosaves-and-peak-caches-only') {
				if (family === 'daw-autosave-peak-caches' || member.meta.inExportStaging) {
					member.verdict = 'reclaim-stale-peak-cache'
					member.actionType = 'prune'
					member.verdictReason = `Stale ${member.meta.dawHost} autosave or waveform peak cache (${member.ageDays}d old)`
					reclaimableBytes += member.size
					reclaimableCopiesCount += 1
					return
				}
				member.verdict = 'blocked-strategy-scope'
				member.actionType = 'keep'
				member.verdictReason = 'Outside autosave/peak cache cleanup strategy scope'
				shieldedCopiesCount += 1
				return
			}

			// Default strategy: prune-caches-and-redundant-bounces
			if (member.meta.inExportStaging) {
				member.verdict = 'reclaim-staging-bounce'
				member.actionType = 'prune'
				member.verdictReason = 'Redundant rough bounce or download staging copy'
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				return
			}

			if (family === 'daw-autosave-peak-caches') {
				member.verdict = 'reclaim-stale-peak-cache'
				member.actionType = 'prune'
				member.verdictReason = `Stale ${member.meta.dawHost} autosave/peak cache (${member.ageDays}d old)`
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				return
			}

			if (family === 'sample-instrument-libraries') {
				member.verdict = 'reclaim-duplicate-sample-pack'
				member.actionType = 'prune'
				member.verdictReason = 'Duplicate sample/instrument library copy superseded by canonical anchor'
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				return
			}

			member.verdict = 'reclaim-redundant-stem-or-project'
			member.actionType = 'prune'
			member.verdictReason = 'Redundant stem bounce or superseded DAW project copy outside master anchors'
			reclaimableBytes += member.size
			reclaimableCopiesCount += 1
		})

		const rawInfo = computeGroupReclaimableInfo({ ...group, files })
		const rawDuplicateBytes = rawInfo.reclaimableBytes || Math.max(0, (classifiedMembers.length - 1) * survivor.size)

		let riskState = 'reclaimable'
		let riskPriority = 2
		if (reclaimableCopiesCount === 0) {
			if (has24BitWavMaster) {
				riskState = 'wav-master-protected'
				riskPriority = 5
			} else if (isLatestMasterProject) {
				riskState = 'master-project-protected'
				riskPriority = 4
			} else {
				riskState = 'shielded'
				riskPriority = 3
			}
		} else if (consolidatableCopiesCount > 0) {
			riskState = 'consolidatable'
			riskPriority = 3
		} else if (family === 'daw-autosave-peak-caches') {
			riskState = 'cache-reclaimable'
			riskPriority = 2
		} else if (family === 'sample-instrument-libraries') {
			riskState = 'sample-reclaimable'
			riskPriority = 2
		}

		allClusters.push({
			groupKey: `${group.id ?? group.hash ?? primaryMeta.vaultKey}::${primaryMeta.vaultKey}`,
			primaryGroupId: group.id ?? null,
			hash: group.hash || '',
			family,
			familyLabel: familyMeta.label,
			familyShortLabel: familyMeta.shortLabel,
			sessionName: primaryMeta.sessionName,
			revisionNumber: primaryMeta.revisionNumber,
			revisionLabel: primaryMeta.revisionNumber > 0 ? `v${primaryMeta.revisionNumber}` : 'unversioned',
			audioSignature: primaryMeta.audioSignature,
			dawHost: primaryMeta.dawHost,
			formatBadge: primaryMeta.formatBadge,
			vaultKey: primaryMeta.vaultKey,
			displayName: survivor.basename,
			isLatestMasterProject,
			has24BitWavMaster,
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

	const familyBreakdown = Object.keys(AUDIO_DAW_FAMILY_META).map(famId => {
		const famClusters = allClusters.filter(c => c.family === famId)
		const famReclaim = famClusters.reduce((acc, c) => acc + c.reclaimableBytes, 0)
		return {
			id: famId,
			label: AUDIO_DAW_FAMILY_META[famId].label,
			shortLabel: AUDIO_DAW_FAMILY_META[famId].shortLabel,
			clustersCount: famClusters.length,
			reclaimableBytes: famReclaim,
			formattedReclaimableBytes: formatBytes(famReclaim),
		}
	})

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
			if (verdictFilter === 'master-project' && !cluster.isLatestMasterProject) {
				return false
			}
			if (verdictFilter === 'wav-master' && !cluster.has24BitWavMaster) {
				return false
			}
			if (verdictFilter === 'peak-cache' && cluster.family !== 'daw-autosave-peak-caches') {
				return false
			}
			if (verdictFilter === 'sample-library' && cluster.family !== 'sample-instrument-libraries') {
				return false
			}
			if (verdictFilter === 'shielded' && cluster.reclaimableCopiesCount > 0) {
				return false
			}
		}
		if (searchQuery) {
			const haystack = [
				cluster.sessionName,
				cluster.revisionLabel,
				cluster.audioSignature,
				cluster.dawHost,
				cluster.formatBadge,
				cluster.vaultKey,
				cluster.displayName,
				...cluster.members.map(m => m.path),
			].join(' ').toLowerCase()
			if (!haystack.includes(searchQuery)) {
				return false
			}
		}
		return true
	})

	filteredClusters.sort((a, b) => {
		if (sortMode === 'risk_desc') {
			if (a.riskPriority !== b.riskPriority) {
				return b.riskPriority - a.riskPriority
			}
			return b.reclaimableBytes - a.reclaimableBytes
		}
		if (sortMode === 'revision_desc') {
			if (a.revisionNumber !== b.revisionNumber) {
				return b.revisionNumber - a.revisionNumber
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
	const totalMasterProjectClusters = filteredClusters.filter(c => c.isLatestMasterProject).length
	const total24BitWavMasterClusters = filteredClusters.filter(c => c.has24BitWavMaster).length
	const totalPeakCacheClusters = filteredClusters.filter(c => c.family === 'daw-autosave-peak-caches').length
	const totalSampleLibraryClusters = filteredClusters.filter(c => c.family === 'sample-instrument-libraries').length
	const distinctSessionsCount = new Set(filteredClusters.map(c => c.sessionName)).size
	const efficiencyPct = totalRawDuplicateBytes > 0
		? Math.min(100, Math.round((totalReclaimableBytes / totalRawDuplicateBytes) * 100))
		: 0

	return {
		schema: AUDIO_DAW_VAULT_SCHEMA,
		generatedAt: new Date(referenceNowSec * 1000).toISOString(),
		options: {
			familyFilter,
			verdictFilter,
			sortMode,
			strategy,
			survivorRule,
			protectLatestMasterProject,
			protect24BitWavMasters,
			keepPreviousProjectVersions,
			staleCacheDays,
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
			totalMasterProjectClusters,
			total24BitWavMasterClusters,
			totalPeakCacheClusters,
			totalSampleLibraryClusters,
			distinctSessionsCount,
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
 * Build a safe POSIX DRY_RUN=1 remediation script for Audio DAW & Sample Library Vault cleanup.
 *
 * @param {object} analysis Output of analyzeAudioDawVault.
 * @param {object} [options] Script generation options.
 * @return {string} POSIX shell script.
 */
export function buildAudioDawRemediationScript(analysis, options = {}) {
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
		'# DuplicateFinder Audio Production, DAW Project & Sample Library Vault Remediation Script',
		`# Schema: ${AUDIO_DAW_VAULT_SCHEMA}`,
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
		lines.push(`# Audio Vault: ${cluster.vaultKey} [${cluster.dawHost} / ${cluster.formatBadge}] (${cluster.formattedReclaimableBytes})`)
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
		lines.push('# No actionable DAW project, stem, sample library or peak cache duplicates under current master guards.')
	} else {
		lines.push('# After applying with DRY_RUN=0, refresh Nextcloud filecache:')
		lines.push('# sudo -u www-data php /var/www/nextcloud/occ files:scan --all')
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe CSV audit report.
 *
 * @param {object} analysis Output of analyzeAudioDawVault.
 * @return {string} CSV content.
 */
export function buildAudioDawCsvReport(analysis) {
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const headers = [
		'Session',
		'Revision',
		'AudioSignature',
		'DawHost',
		'Family',
		'Format',
		'LatestMasterProject',
		'Wav24BitMaster',
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
				cluster.sessionName,
				cluster.revisionLabel,
				cluster.audioSignature,
				cluster.dawHost,
				cluster.family,
				cluster.formatBadge,
				cluster.isLatestMasterProject ? 'yes' : 'no',
				member.meta.is24BitWavMaster ? 'yes' : 'no',
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
 * @param {object} analysis Output of analyzeAudioDawVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildAudioDawJsonReport(analysis) {
	const payload = {
		schema: AUDIO_DAW_VAULT_SCHEMA,
		generatedAt: analysis && analysis.generatedAt ? analysis.generatedAt : new Date().toISOString(),
		options: analysis ? analysis.options : {},
		summary: analysis ? analysis.summary : {},
		familyBreakdown: analysis ? analysis.familyBreakdown : [],
		clusters: (analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []).map(cluster => ({
			groupKey: cluster.groupKey,
			primaryGroupId: cluster.primaryGroupId,
			hash: cluster.hash,
			sessionName: cluster.sessionName,
			revisionLabel: cluster.revisionLabel,
			audioSignature: cluster.audioSignature,
			dawHost: cluster.dawHost,
			family: cluster.family,
			formatBadge: cluster.formatBadge,
			isLatestMasterProject: cluster.isLatestMasterProject,
			has24BitWavMaster: cluster.has24BitWavMaster,
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
 * Build a Nextcloud desktop client .sync-exclude.lst snippet for transient DAW autosaves and peak caches.
 *
 * @param {object} analysis Output of analyzeAudioDawVault.
 * @return {string} Sync exclude rules.
 */
export function buildAudioDawSyncExcludeSnippet(analysis) {
	const peakCacheCount = analysis && analysis.summary ? analysis.summary.totalPeakCacheClusters : 0
	const sampleLibCount = analysis && analysis.summary ? analysis.summary.totalSampleLibraryClusters : 0
	return [
		'# DuplicateFinder Audio Production & DAW Waveform/Autosave Sync Exclusions',
		`# Detected peak/autosave cache clusters: ${peakCacheCount} | Sample library clusters: ${sampleLibCount}`,
		'*.reapeaks',
		'*.asd',
		'*.pkf',
		'*.rpp-bak',
		'*.als-bak',
		'*.cpr-bak',
		'Backup/',
		'Session File Backups/',
		'Peak Files/',
		'WaveCache/',
		'Ableton Project Info/',
	].join('\n')
}
