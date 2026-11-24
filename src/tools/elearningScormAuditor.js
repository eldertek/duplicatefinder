/**
 * Pure E-Learning SCORM/H5P Package, Lecture Recording Transcode & Slide Deck Handout Auditor.
 * Classifies and audits duplicate clusters across 4 pedagogical/LMS domain families:
 * - LMS & SCORM Packages (.scorm.zip, imsmanifest.xml, .h5p, .mbz, .imscc in Accredited-LMS/ or Course-Releases/)
 * - Lecture Video Transcodes (_1080p/_720p/_480p/.m4a derivatives sharing lessonLineageStem with a master .mov/.mkv/.mp4 source)
 * - Slide Deck & Handout Exports (.pptx, .key, .odp editable sources vs _slides.pdf, _handout.pdf, _notes.pdf exports)
 * - Caption, Quiz & Course Staging (.vtt, .srt, .qti.xml, ~$*.pptx, .~lock.*.odp#, .tmp, .mbz.tmp)
 *
 * Assigns 5 governance tiers:
 * - published-lms-vault (Accredited-LMS / Course-Releases canonical package; strictly protected by default)
 * - master-recording-source (Master .mov/.mkv/.mp4 lecture recording source; strictly protected by default)
 * - editable-deck-origin (Editable .pptx/.key/.odp slide deck origin; strictly protected by default)
 * - transcode-handout-twin (Derived video transcode or PDF handout export; deletion/hardlink blocked if no verified source is conserved)
 * - stale-course-staging (Captions, QTI quiz XML, Office/LibreOffice lock files, or temp staging copies)
 *
 * Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const ELEARNING_SCORM_SCHEMA = 'duplicatefinder.elearning-scorm-auditor.v1'

export const ELEARNING_SCORM_FAMILIES = Object.freeze([
	'all',
	'lms-scorm-packages',
	'lecture-video-transcodes',
	'slide-deck-handout-exports',
	'caption-quiz-staging',
])

export const ELEARNING_SCORM_FAMILY_META = Object.freeze({
	'lms-scorm-packages': {
		id: 'lms-scorm-packages',
		label: 'LMS & SCORM Packages',
		shortLabel: 'LMS (.scorm.zip/imsmanifest.xml/.h5p/.mbz/.imscc)',
	},
	'lecture-video-transcodes': {
		id: 'lecture-video-transcodes',
		label: 'Lecture Recording Transcodes',
		shortLabel: 'Lectures (.mov/.mkv/.mp4 vs _1080p/_720p/_480p/.m4a)',
	},
	'slide-deck-handout-exports': {
		id: 'slide-deck-handout-exports',
		label: 'Slide Decks & Handout Exports',
		shortLabel: 'Decks (.pptx/.key/.odp vs _slides/_handout/_notes.pdf)',
	},
	'caption-quiz-staging': {
		id: 'caption-quiz-staging',
		label: 'Captions, QTI Quiz & Staging',
		shortLabel: 'Staging (.vtt/.srt/.qti.xml/~$*.pptx/.tmp)',
	},
})

export const ELEARNING_SCORM_STRATEGIES = Object.freeze([
	'consolidate-lms-masters',
	'prune-lecture-transcodes-when-source-verified',
	'hardlink-handout-exports',
])

export const ELEARNING_SCORM_SURVIVOR_RULES = Object.freeze([
	'lms-vault-and-source-first',
	'master-recording-first',
	'editable-deck-first',
	'newest-course-first',
	'shortest-path',
])

export const ELEARNING_SCORM_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'lms-vault',
	'master-recording',
	'editable-deck',
	'transcode-handout',
	'course-staging',
	'shielded',
])

export const ELEARNING_SCORM_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const ELEARNING_SCORM_PRESETS = Object.freeze([
	{
		id: 'all-elearning-scorm-audit',
		name: 'All E-Learning, SCORM, Lecture & Deck Audit',
		description: 'Audit LMS SCORM/H5P/Moodle packages, lecture recording transcodes, slide deck handouts, and caption/QTI staging while shielding published LMS vaults, master recordings, and editable decks.',
		familyFilter: 'all',
		strategy: 'consolidate-lms-masters',
		survivorRule: 'lms-vault-and-source-first',
		protectPublishedLmsVault: true,
		protectMasterRecordingSource: true,
		protectEditableDeckOrigin: true,
		keepRecentStaging: 2,
		staleCacheDays: 30,
		minSizeMb: 0,
	},
	{
		id: 'consolidate-lms-masters',
		name: 'Consolidate Accredited LMS & Course Releases',
		description: 'Keep canonical packages inside Accredited-LMS/ or Course-Releases/ and consolidate stray copies from Downloads or staging folders while reclaiming stale staging artifacts.',
		familyFilter: 'lms-scorm-packages',
		strategy: 'consolidate-lms-masters',
		survivorRule: 'lms-vault-and-source-first',
		protectPublishedLmsVault: true,
		protectMasterRecordingSource: true,
		protectEditableDeckOrigin: true,
		keepRecentStaging: 2,
		staleCacheDays: 30,
		minSizeMb: 0,
	},
	{
		id: 'prune-lecture-transcodes-verified',
		name: 'Prune Lecture Transcodes When Master Verified',
		description: 'Reclaim _1080p/_720p/_480p or .m4a lecture transcodes only when a verified master .mov/.mkv/.mp4 recording sharing lessonLineageStem is conserved.',
		familyFilter: 'lecture-video-transcodes',
		strategy: 'prune-lecture-transcodes-when-source-verified',
		survivorRule: 'master-recording-first',
		protectPublishedLmsVault: true,
		protectMasterRecordingSource: true,
		protectEditableDeckOrigin: true,
		keepRecentStaging: 2,
		staleCacheDays: 30,
		minSizeMb: 0,
	},
	{
		id: 'hardlink-handout-exports',
		name: 'Hardlink Duplicate Handout PDFs',
		description: 'Hardlink identical _slides.pdf, _handout.pdf, and _notes.pdf exports across cohorts only when a verified .pptx/.key/.odp editable deck origin is conserved.',
		familyFilter: 'slide-deck-handout-exports',
		strategy: 'hardlink-handout-exports',
		survivorRule: 'editable-deck-first',
		protectPublishedLmsVault: true,
		protectMasterRecordingSource: true,
		protectEditableDeckOrigin: true,
		keepRecentStaging: 2,
		staleCacheDays: 30,
		minSizeMb: 0,
	},
	{
		id: 'caption-quiz-staging-sweep',
		name: 'Caption, QTI & Course Staging Sweep',
		description: 'Audit stale .vtt, .srt, .qti.xml, ~$*.pptx, .~lock.*.odp#, and .mbz.tmp staging artifacts against course workspaces.',
		familyFilter: 'caption-quiz-staging',
		strategy: 'consolidate-lms-masters',
		survivorRule: 'newest-course-first',
		protectPublishedLmsVault: true,
		protectMasterRecordingSource: true,
		protectEditableDeckOrigin: true,
		keepRecentStaging: 2,
		staleCacheDays: 14,
		minSizeMb: 0,
	},
])

const LMS_PACKAGE_EXT_SET = new Set(['scorm.zip', 'h5p', 'mbz', 'imscc'])
const VIDEO_MASTER_EXT_SET = new Set(['mov', 'mkv', 'mp4'])
const AUDIO_TRANSCODE_EXT_SET = new Set(['m4a'])
const DECK_ORIGIN_EXT_SET = new Set(['pptx', 'key', 'odp'])
const CAPTION_QUIZ_EXT_SET = new Set(['vtt', 'srt', 'qti.xml'])
const TEMP_STAGING_EXT_SET = new Set(['tmp', 'mbz.tmp', 'h5p.tmp', 'scorm.zip.tmp'])

const PUBLISHED_LMS_PATH_RE = /(\/(?:accredited[-_ ]?lms|course[-_ ]?releases?|lms[-_ ]?releases?|published[-_ ]?courses?|lms[-_ ]?vault|accredited)(?:\/|$)|\/__groupfolders\/\d+\/(?:accredited[-_ ]?lms|course[-_ ]?releases?|lms|courses))/i
const MASTER_RECORDING_PATH_RE = /(\/(?:master[-_ ]?recordings?|lecture[-_ ]?masters?|raw[-_ ]?lectures?|raw[-_ ]?recordings?|source[-_ ]?videos?|studio[-_ ]?masters?)(?:\/|$))/i
const EDITABLE_DECK_PATH_RE = /(\/(?:editable[-_ ]?decks?|deck[-_ ]?sources?|slide[-_ ]?sources?|master[-_ ]?decks?|presentations?)(?:\/|$))/i
const TRANSCODE_PATH_RE = /(\/(?:transcodes?|renditions?|video[-_ ]?proxies?|stream[-_ ]?exports?|hls[-_ ]?exports?)(?:\/|$))/i
const HANDOUT_EXPORT_PATH_RE = /(\/(?:handouts?|slide[-_ ]?exports?|pdf[-_ ]?exports?|course[-_ ]?handouts?|printouts?)(?:\/|$))/i
const STAGING_BLOAT_PATH_RE = /(\/downloads\/|\/telechargements\/|\/tmp\/|\/temp\/|\/scratch\/|\/incoming\/|\/staging\/|\/drafts\/|\/wetransfer\/)/i

const TRANSCODE_MARKER_RE = /(?:^|[_\-.\s])(1080p|720p|480p|360p|240p|proxy|web|lowres)(?=$|[_\-.\s])/i
const MASTER_VIDEO_MARKER_RE = /(?:^|[_\-.\s])(master|raw|source|orig|original|4k|uhd|prores|capture)(?=$|[_\-.\s])/i
const HANDOUT_EXPORT_RE = /(?:_|-|\.)(slides|handout|handouts|notes)\.pdf$/i
const HANDOUT_MARKER_RE = /(?:^|[_\-.\s])(slides|handout|handouts|notes|printout)(?=$|[_\-.\s])/i

const LINEAGE_STRIP_TAG_RE = /(?:^|[_\-.\s])(1080p|720p|480p|360p|240p|4k|uhd|prores|master|raw|source|orig|original|capture|proxy|web|lowres|audio|slides|handout|handouts|notes|deck|printout|scorm|h5p|qti|v\d+(?:\.\d+)?|rev\d+|r\d+|final|published|draft|tmp)(?=$|[_\-.\s])/gi
const COPY_SUFFIX_RE = /\s-\s?copy(?:\s*\(\d+\))?|\s*\(\d+\)|_copy\b|\[\d{4}-\d{2}-\d{2}[^\]]*\]/gi

const TIER_LABELS = Object.freeze({
	'published-lms-vault': 'Published LMS Vault',
	'master-recording-source': 'Master Recording Source',
	'editable-deck-origin': 'Editable Slide Deck Origin',
	'transcode-handout-twin': 'Transcode / Handout Export Twin',
	'stale-course-staging': 'Course Staging / Caption / Lock Artifact',
})

const TIER_AUTHORITY = Object.freeze({
	'published-lms-vault': 99,
	'master-recording-source': 96,
	'editable-deck-origin': 93,
	'transcode-handout-twin': 36,
	'stale-course-staging': 16,
})

const VERDICT_LABELS = Object.freeze({
	'keep-canonical-survivor': 'Keep Canonical Course Anchor',
	'consolidate-to-lms-vault': 'Consolidate to LMS / Course Vault',
	'reclaim-verified-lecture-transcode': 'Prune Verified Lecture Transcode',
	'hardlink-verified-handout-export': 'Hardlink Verified Handout PDF',
	'reclaim-course-staging': 'Prune Stale Course Staging / Lock',
	'blocked-published-lms-vault': 'Blocked: Published LMS Vault Guard',
	'blocked-master-recording-source': 'Blocked: Master Recording Source Guard',
	'blocked-editable-deck-origin': 'Blocked: Editable Deck Origin Guard',
	'blocked-unverified-master-recording': 'Blocked: No Verified Master Recording Conserved',
	'blocked-unverified-editable-deck': 'Blocked: No Verified Editable Deck Conserved',
	'blocked-not-lecture-transcode': 'Shielded: Non-Transcode Course Asset',
	'blocked-not-handout-export': 'Shielded: Non-Handout Course Asset',
	'blocked-fresh-course-staging': 'Shielded: Recent Course Staging Artifact',
	'blocked-manual-shield': 'Blocked: Operator Shield',
	excluded: 'Excluded by Operator',
})

const FAMILY_PRIORITY = Object.freeze({
	'lms-scorm-packages': 4,
	'lecture-video-transcodes': 3,
	'slide-deck-handout-exports': 2,
	'caption-quiz-staging': 1,
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
 * Extract immediate parent folder name from a normalized file path.
 *
 * @param {string} normalizedPath Normalized path.
 * @return {string} Parent folder name or empty string.
 */
function extractParentFolderName(normalizedPath) {
	const clean = String(normalizedPath || '').replace(/\/+$/, '')
	const parts = clean.split('/').filter(Boolean)
	if (parts.length < 2) {
		return ''
	}
	return parts[parts.length - 2] || ''
}

/**
 * Extract compound or single lowercase extension without leading dot.
 *
 * @param {string} lowerBase Lowercase basename.
 * @return {string} Extension string or empty string.
 */
function extractCompoundExtension(lowerBase) {
	const clean = lowerBase.endsWith('#') ? lowerBase.slice(0, -1) : lowerBase
	for (const compound of ['scorm.zip.tmp', 'scorm.zip', 'qti.xml', 'mbz.tmp', 'h5p.tmp']) {
		if (clean.endsWith(`.${compound}`)) {
			return compound
		}
	}
	const lastDot = clean.lastIndexOf('.')
	if (lastDot <= 0 || lastDot >= clean.length - 1) {
		return ''
	}
	return clean.slice(lastDot + 1)
}

/**
 * Normalize a lesson or course asset stem into a canonical lessonLineageStem.
 *
 * @param {string} rawStem Raw stem without extension.
 * @return {string} Clean canonical lessonLineageStem.
 */
function normalizeLessonLineageStem(rawStem) {
	let stem = String(rawStem || '')
		.replace(/^~\$/, '')
		.replace(/^\.~lock\./i, '')
		.replace(COPY_SUFFIX_RE, '')
		.trim()

	let prev
	do {
		prev = stem
		stem = stem.replace(LINEAGE_STRIP_TAG_RE, '')
	} while (stem !== prev)

	stem = stem
		.replace(/[-_.\s]{2,}/g, '_')
		.replace(/^[\s_.-]+|[\s_.-]+$/g, '')

	return stem || String(rawStem || '').replace(/^~\$/, '').replace(/^\.~lock\./i, '').replace(COPY_SUFFIX_RE, '').trim()
}

/**
 * Parse e-learning SCORM/H5P, lecture recording/transcode, slide deck/handout, and staging metadata.
 *
 * @param {string} basename File basename.
 * @param {string} [normalizedPath=''] Normalized file path.
 * @return {object} Parsed lessonLineageStem, tags, format flags, and governance cues.
 */
export function parseElearningArtifactInfo(basename, normalizedPath = '') {
	const rawBase = String(basename || '')
	const lowerBase = rawBase.toLowerCase()
	const lowerPath = String(normalizedPath || '').toLowerCase()

	const isOfficeLock = /^~\$.+/.test(lowerBase)
	const isLibreOfficeLock = /^\.~lock\..+#$/.test(lowerBase)
	const ext = extractCompoundExtension(lowerBase)
	const isTempStagingExt = TEMP_STAGING_EXT_SET.has(ext)
	const isLockOrTempArtifact = isOfficeLock || isLibreOfficeLock || isTempStagingExt

	let strippedBase = rawBase
	if (isOfficeLock) {
		strippedBase = rawBase.slice(2)
	} else if (isLibreOfficeLock) {
		strippedBase = rawBase.slice(7, -1)
	}

	const lowerStripped = strippedBase.toLowerCase()
	let rawStem = strippedBase
	if (ext && lowerStripped.endsWith(`.${ext}`)) {
		rawStem = strippedBase.slice(0, strippedBase.length - ext.length - 1)
	}
	const cleanRawStem = rawStem.replace(COPY_SUFFIX_RE, '').trim() || rawStem

	const isImsManifest = lowerBase === 'imsmanifest.xml'
	const isLmsPackageExt = LMS_PACKAGE_EXT_SET.has(ext) || isImsManifest
	const isVideoMasterExt = VIDEO_MASTER_EXT_SET.has(ext)
	const isAudioTranscodeExt = AUDIO_TRANSCODE_EXT_SET.has(ext)
	const isDeckOriginExt = DECK_ORIGIN_EXT_SET.has(ext)
	const isCaptionQuizExt = CAPTION_QUIZ_EXT_SET.has(ext)

	const isPublishedLmsPath = PUBLISHED_LMS_PATH_RE.test(lowerPath)
	const isMasterRecordingPath = MASTER_RECORDING_PATH_RE.test(lowerPath)
	const isEditableDeckPath = EDITABLE_DECK_PATH_RE.test(lowerPath)
	const isTranscodePath = TRANSCODE_PATH_RE.test(lowerPath)
	const isHandoutExportPath = HANDOUT_EXPORT_PATH_RE.test(lowerPath)
	const isStagingBloatPath = STAGING_BLOAT_PATH_RE.test(lowerPath)

	const hasTranscodeMarker = TRANSCODE_MARKER_RE.test(cleanRawStem)
	const hasMasterVideoMarker = MASTER_VIDEO_MARKER_RE.test(cleanRawStem)
	const isHandoutPdf = ext === 'pdf' && (
		HANDOUT_EXPORT_RE.test(lowerBase)
		|| HANDOUT_MARKER_RE.test(cleanRawStem)
		|| isHandoutExportPath
	)

	const isCaptionQuizStaging = isLockOrTempArtifact || isCaptionQuizExt
	const isLmsPackageCandidate = !isCaptionQuizStaging && isLmsPackageExt
	const isLectureTranscodeTwin = !isCaptionQuizStaging && (
		isAudioTranscodeExt
		|| (isVideoMasterExt && (hasTranscodeMarker || isTranscodePath))
	)
	const isMasterRecordingCandidate = !isCaptionQuizStaging && !isLectureTranscodeTwin && isVideoMasterExt
	const isEditableDeckCandidate = !isCaptionQuizStaging && isDeckOriginExt
	const isHandoutExportTwin = !isCaptionQuizStaging && isHandoutPdf

	let stemSeed = cleanRawStem
	if (isImsManifest) {
		const parentDir = extractParentFolderName(normalizedPath)
		if (parentDir) {
			stemSeed = parentDir
		}
	}
	const lessonLineageStem = normalizeLessonLineageStem(stemSeed) || cleanRawStem || rawBase

	const artifactTags = []
	const pushTag = tag => {
		const norm = String(tag || '').trim()
		if (norm && !artifactTags.includes(norm)) {
			artifactTags.push(norm)
		}
	}

	if (isImsManifest) {
		pushTag('imsmanifest')
	} else if (isLmsPackageExt && ext) {
		pushTag(`lms:${ext}`)
	}
	if (isPublishedLmsPath) {
		pushTag('accredited-lms')
	}
	if (isMasterRecordingCandidate) {
		pushTag(`master:${ext}`)
		if (hasMasterVideoMarker) {
			pushTag('master-source')
		}
	}
	if (isLectureTranscodeTwin) {
		if (hasTranscodeMarker) {
			const resMatch = cleanRawStem.match(TRANSCODE_MARKER_RE)
			pushTag(resMatch && resMatch[1] ? resMatch[1].toLowerCase() : 'transcode')
		} else {
			pushTag(`transcode:${ext}`)
		}
	}
	if (isEditableDeckCandidate) {
		pushTag(`deck:${ext}`)
	}
	if (isHandoutExportTwin) {
		const handoutMatch = cleanRawStem.match(HANDOUT_MARKER_RE)
		pushTag(handoutMatch && handoutMatch[1] ? `export:${handoutMatch[1].toLowerCase()}` : 'export:pdf')
	}
	if (isCaptionQuizStaging) {
		if (isOfficeLock) {
			pushTag('office-lock')
		} else if (isLibreOfficeLock) {
			pushTag('lo-lock')
		} else if (isTempStagingExt) {
			pushTag(`temp:${ext}`)
		} else if (ext) {
			pushTag(`staging:${ext}`)
		}
	}

	return {
		rawStem: cleanRawStem,
		lessonLineageStem,
		extension: ext,
		artifactTags,
		artifactTag: artifactTags.length > 0 ? artifactTags.join(', ') : 'none',
		isOfficeLock,
		isLibreOfficeLock,
		isTempStagingExt,
		isLockOrTempArtifact,
		isImsManifest,
		isLmsPackageExt,
		isVideoMasterExt,
		isAudioTranscodeExt,
		isDeckOriginExt,
		isCaptionQuizExt,
		isPublishedLmsPath,
		isMasterRecordingPath,
		isEditableDeckPath,
		isTranscodePath,
		isHandoutExportPath,
		isStagingBloatPath,
		hasTranscodeMarker,
		hasMasterVideoMarker,
		isHandoutPdf,
		isCaptionQuizStaging,
		isLmsPackageCandidate,
		isLectureTranscodeTwin,
		isMasterRecordingCandidate,
		isEditableDeckCandidate,
		isHandoutExportTwin,
	}
}

/**
 * Build dataset-wide lineage hints for conserved master lecture recordings and editable slide decks.
 * Respects operator exclude overrides so excluded sources are not counted as conserved.
 *
 * @param {Array<object>} duplicates Loaded duplicate groups.
 * @param {object} [memberOverrides={}] Operator member overrides keyed by selectionKey.
 * @return {object} Dataset source conservation hints.
 */
function buildDatasetElearningHints(duplicates, memberOverrides = {}) {
	const masterRecordingStems = new Set()
	const editableDeckStems = new Set()

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
			const info = parseElearningArtifactInfo(extractBasename(normalized), normalized)
			const stemLower = info.lessonLineageStem.toLowerCase()
			if (!stemLower) {
				continue
			}

			if (
				!info.isCaptionQuizStaging
				&& !info.isStagingBloatPath
				&& (info.isMasterRecordingCandidate || file.masterRecordingVerified === true)
			) {
				masterRecordingStems.add(stemLower)
			}

			if (
				!info.isCaptionQuizStaging
				&& !info.isStagingBloatPath
				&& (info.isEditableDeckCandidate || file.editableDeckVerified === true)
			) {
				editableDeckStems.add(stemLower)
			}
		}
	}

	return {
		masterRecordingStems,
		editableDeckStems,
	}
}

/**
 * Classify a file path into one of the 4 E-Learning SCORM/H5P, Lecture Transcode, Slide Deck, and Staging families.
 *
 * @param {string} rawPath File path.
 * @return {object|null} Classification metadata or null for unrelated files.
 */
export function classifyElearningArtifact(rawPath) {
	const normalized = normalizePathForDiff(rawPath) || String(rawPath || '')
	const basename = extractBasename(normalized)
	const lowerBase = basename.toLowerCase()

	if (!lowerBase) {
		return null
	}

	const info = parseElearningArtifactInfo(basename, normalized)

	if (info.isCaptionQuizStaging) {
		return {
			matched: true,
			family: 'caption-quiz-staging',
			familyLabel: ELEARNING_SCORM_FAMILY_META['caption-quiz-staging'].label,
			...info,
		}
	}

	if (info.isLmsPackageCandidate) {
		return {
			matched: true,
			family: 'lms-scorm-packages',
			familyLabel: ELEARNING_SCORM_FAMILY_META['lms-scorm-packages'].label,
			...info,
		}
	}

	if (info.isMasterRecordingCandidate || info.isLectureTranscodeTwin) {
		return {
			matched: true,
			family: 'lecture-video-transcodes',
			familyLabel: ELEARNING_SCORM_FAMILY_META['lecture-video-transcodes'].label,
			...info,
		}
	}

	if (info.isEditableDeckCandidate || info.isHandoutExportTwin) {
		return {
			matched: true,
			family: 'slide-deck-handout-exports',
			familyLabel: ELEARNING_SCORM_FAMILY_META['slide-deck-handout-exports'].label,
			...info,
		}
	}

	return null
}

/**
 * Inspect governance tier, verified source conservation, and authority context for a cluster member.
 *
 * @param {object} file Duplicate file entry.
 * @param {object} classification Classification metadata.
 * @param {number} referenceTimeSec Reference epoch seconds.
 * @param {object} options Normalized options (keepRecentStaging, staleCacheDays).
 * @param {object} [clusterHints={}] Dataset and cluster source verification hints.
 * @return {object} Member governance and verification context.
 */
export function inspectElearningMemberContext(file, classification, referenceTimeSec, options, clusterHints = {}) {
	const normalizedPath = normalizePathForDiff(file && file.path) || String((file && file.path) || '')
	const basename = extractBasename(normalizedPath)
	const parsed = parseElearningArtifactInfo(basename, normalizedPath)
	const mtimeSec = getFileMtimeSeconds(file)
	const ageDays = mtimeSec !== null && Number.isFinite(referenceTimeSec)
		? Math.max(0, Math.floor((referenceTimeSec - mtimeSec) / 86400))
		: null

	const isCourseStaging = Boolean(
		parsed.isCaptionQuizStaging
		|| classification.family === 'caption-quiz-staging'
	)

	const isPublishedLmsVault = Boolean(
		!isCourseStaging
		&& !parsed.isStagingBloatPath
		&& parsed.isLmsPackageCandidate
		&& (parsed.isPublishedLmsPath || (file && file.isPublishedLmsVault === true))
	)

	const isMasterRecordingSource = Boolean(
		!isCourseStaging
		&& !parsed.isStagingBloatPath
		&& (parsed.isMasterRecordingCandidate || (file && file.masterRecordingVerified === true))
	)

	const isEditableDeckOrigin = Boolean(
		!isCourseStaging
		&& !parsed.isStagingBloatPath
		&& (parsed.isEditableDeckCandidate || (file && file.editableDeckVerified === true))
	)

	const isLectureTranscodeTwin = Boolean(
		!isCourseStaging
		&& !isMasterRecordingSource
		&& parsed.isLectureTranscodeTwin
	)

	const isHandoutExportTwin = Boolean(
		!isCourseStaging
		&& !isEditableDeckOrigin
		&& parsed.isHandoutExportTwin
	)

	const stemLower = parsed.lessonLineageStem.toLowerCase()
	const hasVerifiedMasterRecording = Boolean(
		isMasterRecordingSource
		|| (file && file.masterRecordingVerified === true)
		|| clusterHints.clusterHasConservedMasterRecording
		|| (stemLower && clusterHints.masterRecordingStems && clusterHints.masterRecordingStems.has(stemLower))
	)

	const hasVerifiedEditableDeck = Boolean(
		isEditableDeckOrigin
		|| (file && file.editableDeckVerified === true)
		|| clusterHints.clusterHasConservedEditableDeck
		|| (stemLower && clusterHints.editableDeckStems && clusterHints.editableDeckStems.has(stemLower))
	)

	const isStaleStaging = Boolean(
		isCourseStaging
		&& (ageDays === null || ageDays >= options.staleCacheDays)
	)

	let tier = 'stale-course-staging'
	if (isPublishedLmsVault) {
		tier = 'published-lms-vault'
	} else if (isMasterRecordingSource) {
		tier = 'master-recording-source'
	} else if (isEditableDeckOrigin) {
		tier = 'editable-deck-origin'
	} else if (isLectureTranscodeTwin || isHandoutExportTwin) {
		tier = 'transcode-handout-twin'
	} else {
		tier = 'stale-course-staging'
	}

	let authorityScore = TIER_AUTHORITY[tier] || 40
	if (parsed.isLmsPackageCandidate && !isPublishedLmsVault && !parsed.isStagingBloatPath) {
		authorityScore = 76
	}
	if (parsed.isMasterRecordingCandidate && parsed.isMasterRecordingPath) {
		authorityScore += 2
	}
	if (parsed.isEditableDeckCandidate && parsed.isEditableDeckPath) {
		authorityScore += 2
	}
	if (parsed.isStagingBloatPath) {
		authorityScore -= 18
	}
	if (isStaleStaging) {
		authorityScore -= 6
	}

	return {
		tier,
		tierLabel: TIER_LABELS[tier] || TIER_LABELS['stale-course-staging'],
		authorityScore,
		extension: parsed.extension || classification.extension || '',
		rawStem: parsed.rawStem,
		lessonLineageStem: parsed.lessonLineageStem,
		artifactTags: parsed.artifactTags,
		artifactTag: parsed.artifactTag,
		isPublishedLmsVault,
		isMasterRecordingSource,
		isEditableDeckOrigin,
		isLectureTranscodeTwin,
		isHandoutExportTwin,
		isCourseStaging,
		isLockOrTempArtifact: parsed.isLockOrTempArtifact,
		hasVerifiedMasterRecording,
		hasVerifiedEditableDeck,
		isStaleStaging,
		isStagingBloatPath: parsed.isStagingBloatPath,
		mtimeSec,
		ageDays,
	}
}

/**
 * Select the canonical surviving copy inside an e-learning duplicate cluster.
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
		if (survivorRule === 'master-recording-first') {
			if (a.context.isMasterRecordingSource !== b.context.isMasterRecordingSource) {
				return a.context.isMasterRecordingSource ? -1 : 1
			}
			if (a.context.authorityScore !== b.context.authorityScore) {
				return b.context.authorityScore - a.context.authorityScore
			}
		} else if (survivorRule === 'editable-deck-first') {
			if (a.context.isEditableDeckOrigin !== b.context.isEditableDeckOrigin) {
				return a.context.isEditableDeckOrigin ? -1 : 1
			}
			if (a.context.authorityScore !== b.context.authorityScore) {
				return b.context.authorityScore - a.context.authorityScore
			}
		} else if (survivorRule === 'newest-course-first') {
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
 * Determine the deterministic audit verdict for an e-learning cluster member.
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
			note: 'Excluded from e-learning audit actions by manual operator override.',
		}
	}

	if (survivor && member.selectionKey === survivor.selectionKey) {
		return {
			verdict: 'keep-canonical-survivor',
			verdictLabel: VERDICT_LABELS['keep-canonical-survivor'],
			actionKind: 'keep',
			note: `Canonical ${member.context.tierLabel} copy retained as the authoritative course anchor.`,
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

	if (options.protectPublishedLmsVault && member.context.isPublishedLmsVault) {
		return {
			verdict: 'blocked-published-lms-vault',
			verdictLabel: VERDICT_LABELS['blocked-published-lms-vault'],
			actionKind: 'shield',
			note: 'Strictly protected by Published LMS Vault Guard; Accredited-LMS and Course-Releases packages are never pruned automatically.',
		}
	}

	if (options.protectMasterRecordingSource && member.context.isMasterRecordingSource) {
		return {
			verdict: 'blocked-master-recording-source',
			verdictLabel: VERDICT_LABELS['blocked-master-recording-source'],
			actionKind: 'shield',
			note: 'Strictly protected by Master Recording Source Guard; master .mov/.mkv/.mp4 recordings are conserved.',
		}
	}

	if (options.protectEditableDeckOrigin && member.context.isEditableDeckOrigin) {
		return {
			verdict: 'blocked-editable-deck-origin',
			verdictLabel: VERDICT_LABELS['blocked-editable-deck-origin'],
			actionKind: 'shield',
			note: 'Strictly protected by Editable Deck Origin Guard; .pptx/.key/.odp source decks are conserved.',
		}
	}

	if (options.strategy === 'prune-lecture-transcodes-when-source-verified') {
		if (!member.context.isLectureTranscodeTwin) {
			return {
				verdict: 'blocked-not-lecture-transcode',
				verdictLabel: VERDICT_LABELS['blocked-not-lecture-transcode'],
				actionKind: 'shield',
				note: 'Shielded by Lecture Transcode Pruner because member is not a _1080p/_720p/_480p or .m4a lecture derivative.',
			}
		}
		if (!member.context.hasVerifiedMasterRecording) {
			return {
				verdict: 'blocked-unverified-master-recording',
				verdictLabel: VERDICT_LABELS['blocked-unverified-master-recording'],
				actionKind: 'shield',
				note: 'Blocked because no verified master .mov/.mkv/.mp4 recording sharing this lessonLineageStem is conserved.',
			}
		}
		return {
			verdict: 'reclaim-verified-lecture-transcode',
			verdictLabel: VERDICT_LABELS['reclaim-verified-lecture-transcode'],
			actionKind: 'reclaim',
			note: 'Derived lecture transcode whose master .mov/.mkv/.mp4 recording is verified and conserved; safe to prune after SHA-256 verification.',
		}
	}

	if (options.strategy === 'hardlink-handout-exports') {
		if (!member.context.isHandoutExportTwin) {
			return {
				verdict: 'blocked-not-handout-export',
				verdictLabel: VERDICT_LABELS['blocked-not-handout-export'],
				actionKind: 'shield',
				note: 'Shielded by Handout Hardlink strategy because member is not a _slides.pdf, _handout.pdf, or _notes.pdf export.',
			}
		}
		if (!member.context.hasVerifiedEditableDeck) {
			return {
				verdict: 'blocked-unverified-editable-deck',
				verdictLabel: VERDICT_LABELS['blocked-unverified-editable-deck'],
				actionKind: 'shield',
				note: 'Blocked because no verified .pptx/.key/.odp editable deck origin sharing this lessonLineageStem is conserved.',
			}
		}
		return {
			verdict: 'hardlink-verified-handout-export',
			verdictLabel: VERDICT_LABELS['hardlink-verified-handout-export'],
			actionKind: 'consolidate',
			note: 'Identical handout PDF export whose editable deck origin is verified; safe to hardlink with SHA-256 and stat cross-device checks.',
		}
	}

	if (member.context.isLectureTranscodeTwin && !member.context.hasVerifiedMasterRecording) {
		return {
			verdict: 'blocked-unverified-master-recording',
			verdictLabel: VERDICT_LABELS['blocked-unverified-master-recording'],
			actionKind: 'shield',
			note: 'Blocked because no verified master .mov/.mkv/.mp4 recording sharing this lessonLineageStem is conserved.',
		}
	}

	if (member.context.isHandoutExportTwin && !member.context.hasVerifiedEditableDeck) {
		return {
			verdict: 'blocked-unverified-editable-deck',
			verdictLabel: VERDICT_LABELS['blocked-unverified-editable-deck'],
			actionKind: 'shield',
			note: 'Blocked because no verified .pptx/.key/.odp editable deck origin sharing this lessonLineageStem is conserved.',
		}
	}

	if (member.context.isCourseStaging) {
		if (!member.context.isStaleStaging) {
			return {
				verdict: 'blocked-fresh-course-staging',
				verdictLabel: VERDICT_LABELS['blocked-fresh-course-staging'],
				actionKind: 'shield',
				note: `Shielded because course staging artifact age is below stale threshold (${options.staleCacheDays}d).`,
			}
		}
		return {
			verdict: 'reclaim-course-staging',
			verdictLabel: VERDICT_LABELS['reclaim-course-staging'],
			actionKind: 'reclaim',
			note: 'Stale caption, QTI quiz XML, Office/LibreOffice lock, or .mbz.tmp staging artifact safe to prune after SHA-256 verification.',
		}
	}

	return {
		verdict: 'consolidate-to-lms-vault',
		verdictLabel: VERDICT_LABELS['consolidate-to-lms-vault'],
		actionKind: 'consolidate',
		note: 'Consolidate identical-hash course copy against canonical LMS Vault, Master Recording, or Editable Deck anchor using SHA-256 and stat device checks.',
	}
}

/**
 * Normalize E-Learning SCORM auditor options into deterministic bounds.
 *
 * @param {object} [rawOptions] Caller options.
 * @return {object} Normalized options.
 */
function normalizeOptions(rawOptions = {}) {
	const familyFilter = ELEARNING_SCORM_FAMILIES.includes(rawOptions.familyFilter)
		? rawOptions.familyFilter
		: 'all'
	const verdictFilter = ELEARNING_SCORM_VERDICT_FILTERS.includes(rawOptions.verdictFilter)
		? rawOptions.verdictFilter
		: 'all'
	const sortMode = ELEARNING_SCORM_SORT_MODES.includes(rawOptions.sortMode)
		? rawOptions.sortMode
		: 'reclaim_desc'
	const strategy = ELEARNING_SCORM_STRATEGIES.includes(rawOptions.strategy)
		? rawOptions.strategy
		: 'consolidate-lms-masters'
	const survivorRule = ELEARNING_SCORM_SURVIVOR_RULES.includes(rawOptions.survivorRule)
		? rawOptions.survivorRule
		: 'lms-vault-and-source-first'

	const parsedKeep = Number.parseInt(rawOptions.keepRecentStaging, 10)
	const keepRecentStaging = Number.isFinite(parsedKeep) && parsedKeep >= 1
		? Math.min(parsedKeep, 100)
		: 2

	const parsedDays = Number.parseInt(rawOptions.staleCacheDays, 10)
	const staleCacheDays = Number.isFinite(parsedDays) && parsedDays >= 0
		? Math.min(parsedDays, 3650)
		: 30

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
		protectPublishedLmsVault: rawOptions.protectPublishedLmsVault !== false,
		protectMasterRecordingSource: rawOptions.protectMasterRecordingSource !== false,
		protectEditableDeckOrigin: rawOptions.protectEditableDeckOrigin !== false,
		keepRecentStaging,
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
 * Audit duplicate groups for E-Learning SCORM/H5P Packages, Lecture Recordings, Slide Decks & Staging.
 *
 * @param {Array<object>} duplicates Loaded duplicate groups.
 * @param {object} [rawOptions] Auditor configuration options.
 * @return {object} Deterministic audit analysis with summary, counts, and clusters.
 */
export function analyzeElearningScormDuplicates(duplicates, rawOptions = {}) {
	const options = normalizeOptions(rawOptions)
	const safeDuplicates = Array.isArray(duplicates) ? duplicates : []
	const minSizeBytes = options.minSizeMb * 1024 * 1024

	const datasetHints = buildDatasetElearningHints(safeDuplicates, options.memberOverrides)

	const familyCounts = {
		all: 0,
		'lms-scorm-packages': 0,
		'lecture-video-transcodes': 0,
		'slide-deck-handout-exports': 0,
		'caption-quiz-staging': 0,
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
			const info = classifyElearningArtifact(file.path)
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

		const clusterHasConservedMasterRecording = validFiles.some((file, fileIdx) => {
			const selectionKey = String(getFileSelectionKey(file) ?? `${groupIdx}-${fileIdx}`)
			if (options.memberOverrides[selectionKey] === 'exclude') {
				return false
			}
			const normalized = normalizePathForDiff(file.path) || String(file.path || '')
			const parsed = parseElearningArtifactInfo(extractBasename(normalized), normalized)
			return Boolean(
				!parsed.isCaptionQuizStaging
				&& !parsed.isStagingBloatPath
				&& (parsed.isMasterRecordingCandidate || file.masterRecordingVerified === true)
			)
		})

		const clusterHasConservedEditableDeck = validFiles.some((file, fileIdx) => {
			const selectionKey = String(getFileSelectionKey(file) ?? `${groupIdx}-${fileIdx}`)
			if (options.memberOverrides[selectionKey] === 'exclude') {
				return false
			}
			const normalized = normalizePathForDiff(file.path) || String(file.path || '')
			const parsed = parseElearningArtifactInfo(extractBasename(normalized), normalized)
			return Boolean(
				!parsed.isCaptionQuizStaging
				&& !parsed.isStagingBloatPath
				&& (parsed.isEditableDeckCandidate || file.editableDeckVerified === true)
			)
		})

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

			const directInfo = classifyElearningArtifact(file.path)
			const memberInfo = directInfo && directInfo.matched ? directInfo : primaryInfo
			const context = inspectElearningMemberContext(
				file,
				memberInfo,
				options.referenceTimeSec,
				options,
				{
					...datasetHints,
					clusterHasConservedMasterRecording,
					clusterHasConservedEditableDeck,
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
		const lmsVaultCopiesCount = members.filter(m => m.context.isPublishedLmsVault).length
		const masterRecordingCopiesCount = members.filter(m => m.context.isMasterRecordingSource).length
		const editableDeckCopiesCount = members.filter(m => m.context.isEditableDeckOrigin).length
		const transcodeHandoutCopiesCount = members.filter(m => m.context.isLectureTranscodeTwin || m.context.isHandoutExportTwin).length
		const courseStagingCopiesCount = members.filter(m => m.context.isCourseStaging).length

		const hasPublishedLmsVault = lmsVaultCopiesCount > 0
		const hasMasterRecording = masterRecordingCopiesCount > 0
		const hasEditableDeck = editableDeckCopiesCount > 0
		const hasTranscodeOrHandout = transcodeHandoutCopiesCount > 0
		const hasCourseStaging = courseStagingCopiesCount > 0

		let clusterRiskState = 'reclaimable'
		if (members.some(m => m.verdict === 'blocked-unverified-master-recording' || m.verdict === 'blocked-unverified-editable-deck')) {
			clusterRiskState = 'unverified-source'
		} else if (members.some(m => m.verdict === 'blocked-published-lms-vault')) {
			clusterRiskState = 'lms-vault'
		} else if (members.some(m => m.verdict === 'blocked-master-recording-source')) {
			clusterRiskState = 'master-recording'
		} else if (members.some(m => m.verdict === 'blocked-editable-deck-origin')) {
			clusterRiskState = 'editable-deck'
		} else if (hasTranscodeOrHandout && reclaimableCopiesCount > 0) {
			clusterRiskState = 'source-verified'
		} else if (hasCourseStaging && reclaimableCopiesCount > 0) {
			clusterRiskState = 'reclaimable'
		} else if (reclaimableCopiesCount === 0) {
			clusterRiskState = 'shielded'
		}

		const primaryGroupId = group.id ?? null
		const groupKey = String(group.hash || primaryGroupId || `elearning-scorm-${groupIdx}`)
		const displayName = survivor ? survivor.basename : members[0].basename
		const governanceSignals = Array.from(new Set(members.map(m => m.tier)))
		const allArtifactTags = Array.from(new Set(members.flatMap(m => m.context.artifactTags)))

		rawClusters.push({
			groupKey,
			primaryGroupId,
			hash: group.hash || '',
			displayName,
			basename: displayName,
			lessonLineageStem: survivor ? survivor.context.lessonLineageStem : primaryInfo.lessonLineageStem,
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
			lmsVaultCopiesCount,
			masterRecordingCopiesCount,
			editableDeckCopiesCount,
			transcodeHandoutCopiesCount,
			courseStagingCopiesCount,
			hasPublishedLmsVault,
			hasMasterRecording,
			hasEditableDeck,
			hasTranscodeOrHandout,
			hasCourseStaging,
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
			|| cluster.lessonLineageStem.toLowerCase().includes(q)
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
		if (options.verdictFilter === 'lms-vault' && !cluster.hasPublishedLmsVault) {
			return false
		}
		if (options.verdictFilter === 'master-recording' && !cluster.hasMasterRecording) {
			return false
		}
		if (options.verdictFilter === 'editable-deck' && !cluster.hasEditableDeck) {
			return false
		}
		if (options.verdictFilter === 'transcode-handout' && !cluster.hasTranscodeOrHandout) {
			return false
		}
		if (options.verdictFilter === 'course-staging' && !cluster.hasCourseStaging) {
			return false
		}
		if (options.verdictFilter === 'shielded' && cluster.shieldedCopiesCount === 0 && cluster.clusterRiskState !== 'shielded') {
			return false
		}
		return true
	})

	clusters.sort((a, b) => {
		if (options.sortMode === 'risk_desc') {
			const riskA = a.lmsVaultCopiesCount * 5 + a.masterRecordingCopiesCount * 4 + a.editableDeckCopiesCount * 3 + a.transcodeHandoutCopiesCount * 2 + a.shieldedCopiesCount
			const riskB = b.lmsVaultCopiesCount * 5 + b.masterRecordingCopiesCount * 4 + b.editableDeckCopiesCount * 3 + b.transcodeHandoutCopiesCount * 2 + b.shieldedCopiesCount
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
	const totalLmsVaultClusters = clusters.filter(c => c.hasPublishedLmsVault).length
	const totalProtectedSourceClusters = clusters.filter(c => c.hasMasterRecording || c.hasEditableDeck).length
	const totalTranscodeHandoutClusters = clusters.filter(c => c.hasTranscodeOrHandout).length
	const totalCourseStagingClusters = clusters.filter(c => c.hasCourseStaging).length
	const efficiencyPct = totalRawDuplicateBytes > 0
		? Math.round((totalReclaimableBytes / totalRawDuplicateBytes) * 100)
		: 0

	return {
		schema: ELEARNING_SCORM_SCHEMA,
		options: {
			familyFilter: options.familyFilter,
			verdictFilter: options.verdictFilter,
			sortMode: options.sortMode,
			strategy: options.strategy,
			survivorRule: options.survivorRule,
			protectPublishedLmsVault: options.protectPublishedLmsVault,
			protectMasterRecordingSource: options.protectMasterRecordingSource,
			protectEditableDeckOrigin: options.protectEditableDeckOrigin,
			keepRecentStaging: options.keepRecentStaging,
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
			totalLmsVaultClusters,
			totalProtectedSourceClusters,
			totalTranscodeHandoutClusters,
			totalCourseStagingClusters,
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
 * Build a POSIX DRY_RUN=1 remediation script for E-Learning SCORM packages, Lecture Transcodes, Handout Exports & Staging.
 *
 * @param {object} analysis Output from analyzeElearningScormDuplicates.
 * @param {object} [options] Script options.
 * @param {string} [options.dataRoot='/var/www/nextcloud/data'] Nextcloud data root directory.
 * @return {string} POSIX bash script with single-quoted paths, sha256sum -- verification, stat cross-device guard, and DRY_RUN=1 default.
 */
export function buildElearningScormScript(analysis, options = {}) {
	const dataRoot = String(options.dataRoot || '/var/www/nextcloud/data').replace(/\/+$/, '') || '/var/www/nextcloud/data'
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const strategy = (analysis && analysis.options && analysis.options.strategy) || 'consolidate-lms-masters'

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
		'# E-Learning SCORM/H5P Package, Lecture Recording Transcode & Slide Deck Handout Auditor',
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
		lines.push('echo "No reclaimable or consolidatable LMS packages, lecture transcodes, handout exports, or course staging targets under current guards."')
		return lines.join('\n')
	}

	lines.push('prune_verified_course_artifact() {')
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
	lines.push('consolidate_lms_master_copy() {')
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
			lines.push(`consolidate_lms_master_copy ${escapePosixSingleQuote(op.survivorPath)} ${escapePosixSingleQuote(op.targetPath)}`)
		} else {
			lines.push(`prune_verified_course_artifact ${escapePosixSingleQuote(op.survivorPath)} ${escapePosixSingleQuote(op.targetPath)}`)
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
 * Build a Nextcloud Desktop .sync-exclude.lst snippet for e-learning temp and lock artifacts.
 *
 * @param {object} analysis Output from analyzeElearningScormDuplicates.
 * @return {string} Newline-delimited Nextcloud sync-exclude patterns.
 */
export function buildElearningScormSyncExcludeSnippet(analysis) {
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const lines = [
		'# Nextcloud Desktop .sync-exclude.lst rules for E-Learning LMS & deck lock/temp staging',
		'*.mbz.tmp',
		'~$*.pptx',
		'.~lock.*.odp#',
		'*.h5p.tmp',
		'*.scorm.zip.tmp',
		'.~lock.*.pptx#',
		'~$*.docx',
		'*.tmp',
	]
	const seen = new Set(lines)
	for (const cluster of clusters) {
		if (cluster && cluster.extension === 'key' && !seen.has('*.key-tef')) {
			lines.push('*.key-tef')
			seen.add('*.key-tef')
		}
	}
	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe CSV audit report for E-Learning SCORM, Lectures & Decks.
 *
 * @param {object} analysis Output from analyzeElearningScormDuplicates.
 * @return {string} RFC-4180 CSV string with CWE-1236 formula escaping.
 */
export function buildElearningScormCsvReport(analysis) {
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const headers = [
		'Cluster Key',
		'Course Asset Name',
		'Lesson Lineage Stem',
		'Artifact Tags',
		'Extension',
		'Family',
		'Governance Tier',
		'Published LMS Vault',
		'Master Recording Source',
		'Editable Deck Origin',
		'Verified Source Conserved',
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
			const hasVerifiedSource = member.context.isLectureTranscodeTwin
				? member.context.hasVerifiedMasterRecording
				: (member.context.isHandoutExportTwin ? member.context.hasVerifiedEditableDeck : (member.context.isPublishedLmsVault || member.context.isMasterRecordingSource || member.context.isEditableDeckOrigin))
			const row = [
				cluster.groupKey,
				cluster.basename,
				member.context.lessonLineageStem,
				member.context.artifactTag,
				member.extension,
				cluster.familyLabel,
				member.tierLabel,
				member.context.isPublishedLmsVault ? 'yes' : 'no',
				member.context.isMasterRecordingSource ? 'yes' : 'no',
				member.context.isEditableDeckOrigin ? 'yes' : 'no',
				hasVerifiedSource ? 'yes' : 'no',
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
 * Build a structured JSON audit manifest for E-Learning SCORM, Lectures & Decks.
 *
 * @param {object} analysis Output from analyzeElearningScormDuplicates.
 * @param {string} [generatedAt] Optional ISO timestamp override.
 * @return {string} Pretty-printed JSON manifest.
 */
export function buildElearningScormJsonReport(analysis, generatedAt = new Date().toISOString()) {
	const safeAnalysis = analysis && typeof analysis === 'object' ? analysis : { summary: {}, clusters: [], options: {} }
	return JSON.stringify({
		schema: ELEARNING_SCORM_SCHEMA,
		generatedAt,
		options: safeAnalysis.options || {},
		summary: safeAnalysis.summary || {},
		clusters: (safeAnalysis.clusters || []).map(cluster => ({
			groupKey: cluster.groupKey,
			primaryGroupId: cluster.primaryGroupId,
			hash: cluster.hash,
			basename: cluster.basename,
			lessonLineageStem: cluster.lessonLineageStem,
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
				lessonLineageStem: member.context.lessonLineageStem,
				authorityScore: member.context.authorityScore,
				hasVerifiedMasterRecording: member.context.hasVerifiedMasterRecording,
				hasVerifiedEditableDeck: member.context.hasVerifiedEditableDeck,
				override: member.override,
			})),
		})),
	}, null, 2)
}
