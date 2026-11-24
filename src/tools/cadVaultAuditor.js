/**
 * Pure CAD, 3D Print, KiCad EDA & Manufacturing Release Vault Auditor.
 * Classifies and audits engineering duplicate clusters across 4 domain families:
 * - Native CAD & PDM (.sldprt, .sldasm, .slddrw, .step, .stp, .iges, .igs, .f3d,
 *   .fcstd, .catpart, .catproduct, .prt, .ipt, .iam, .dwg, .dxf)
 * - 3D Print Meshes & Slicer G-code (.stl, .3mf, .obj, .ply, .amf, .gcode, .bgcode, .ctb)
 * - KiCad & EDA PCB / Schematics (.kicad_pcb, .kicad_sch, .kicad_pro, .kicad_mod,
 *   .brd, .sch, .pcbdoc, .schdoc, .step_eda, .3dshapes)
 * - CAM, Gerber & Fabrication Exports (.gbr, .gtl, .gbl, .drl, .nc, .tap,
 *   gerbers.zip, fab-release.zip, bom_export.csv)
 *
 * Extracts revision tags (REV_A, Rev02, v3, _FIXED, -bak, ~1, _autosave,
 * KiCad -backups/ timestamps), computes partLineageStem, and assigns 5 governance tiers:
 * - released-pdm-vault (Released PDM / ECO Approved / Mfg Freeze; strictly protected)
 * - mfg-cam-release (CAM & Fabrication Release; strictly protected)
 * - engineering-wip (Active CAD / EDA workspace; native masters shielded by default)
 * - slicer-spool-downloads (Slicer output, print spool, Downloads, export scratch)
 * - backup-autosave-pool (KiCad -backups/, _autosave, -bak, ~1, .fcstd1 backups)
 *
 * Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const CAD_VAULT_SCHEMA = 'duplicatefinder.cad-vault-auditor.v1'

export const CAD_FAMILIES = Object.freeze([
	'all',
	'native-cad-pdm',
	'mesh-slicer-prints',
	'eda-pcb-schematics',
	'cam-gerber-exports',
])

export const CAD_FAMILY_META = Object.freeze({
	'native-cad-pdm': {
		id: 'native-cad-pdm',
		label: 'Native CAD & PDM',
		shortLabel: 'Native CAD (.sldprt/.step)',
	},
	'mesh-slicer-prints': {
		id: 'mesh-slicer-prints',
		label: '3D Print Meshes & Slicers',
		shortLabel: 'Meshes & G-code (.stl/.3mf)',
	},
	'eda-pcb-schematics': {
		id: 'eda-pcb-schematics',
		label: 'KiCad & EDA PCB / Schematics',
		shortLabel: 'KiCad & EDA (.kicad_pcb)',
	},
	'cam-gerber-exports': {
		id: 'cam-gerber-exports',
		label: 'CAM, Gerber & Fab Exports',
		shortLabel: 'CAM & Gerbers (.gbr/.drl)',
	},
})

export const CAD_STRATEGIES = Object.freeze([
	'consolidate-released-pdm',
	'hardlink-mesh-exports',
	'prune-cad-autosaves',
])

export const CAD_SURVIVOR_RULES = Object.freeze([
	'pdm-authority-first',
	'native-master-first',
	'newest-revision',
	'oldest-canonical',
	'shortest-path',
])

export const CAD_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'released-pdm',
	'mfg-release',
	'autosaves-backups',
	'shielded',
])

export const CAD_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const CAD_PRESETS = Object.freeze([
	{
		id: 'all-cad-pdm-audit',
		name: 'All CAD, Mesh, KiCad & CAM Audit',
		description: 'Audit parametric CAD, 3D print meshes/G-code, KiCad EDA boards, and Gerber CAM exports while strictly shielding Released PDM, ECO Freeze, Mfg Release, and native masters.',
		familyFilter: 'all',
		strategy: 'consolidate-released-pdm',
		survivorRule: 'pdm-authority-first',
		protectReleasedPdm: true,
		protectMfgCamRelease: true,
		protectNativeParametric: true,
		staleExportDays: 14,
		minSizeKb: 0,
	},
	{
		id: 'released-pdm-freeze-guard',
		name: 'Released PDM & ECO Freeze Guard',
		description: 'Isolate Released PDM, ECO Approved, and Mfg Freeze vaults alongside Manufacturing CAM releases so frozen engineering artifacts are never modified.',
		familyFilter: 'native-cad-pdm',
		strategy: 'consolidate-released-pdm',
		survivorRule: 'pdm-authority-first',
		protectReleasedPdm: true,
		protectMfgCamRelease: true,
		protectNativeParametric: true,
		staleExportDays: 30,
		minSizeKb: 0,
	},
	{
		id: 'mesh-slicer-export-hardlink',
		name: '3D Print Mesh & G-code Hardlink',
		description: 'Keep canonical .stl, .3mf, and .gcode copies and hardlink duplicate slicer/spool exports at zero extra disk space with stat cross-device safety.',
		familyFilter: 'mesh-slicer-prints',
		strategy: 'hardlink-mesh-exports',
		survivorRule: 'pdm-authority-first',
		protectReleasedPdm: true,
		protectMfgCamRelease: true,
		protectNativeParametric: true,
		staleExportDays: 7,
		minSizeKb: 0,
	},
	{
		id: 'kicad-eda-backups-prune',
		name: 'KiCad -backups/ & CAD Autosave Prune',
		description: 'Prune KiCad -backups/ snapshots, _autosave, -bak, ~1, and .fcstd1 backup artifacts while protecting engineering WIP and Released PDM masters.',
		familyFilter: 'all',
		strategy: 'prune-cad-autosaves',
		survivorRule: 'native-master-first',
		protectReleasedPdm: true,
		protectMfgCamRelease: true,
		protectNativeParametric: true,
		staleExportDays: 7,
		minSizeKb: 0,
	},
	{
		id: 'cam-gerber-release-audit',
		name: 'CAM, Gerber & Fab Release Audit',
		description: 'Audit .gbr, .gtl, .gbl, .drl, .nc, .tap, gerbers.zip, fab-release.zip, and bom_export.csv duplicates across fabrication releases and scratch exports.',
		familyFilter: 'cam-gerber-exports',
		strategy: 'consolidate-released-pdm',
		survivorRule: 'pdm-authority-first',
		protectReleasedPdm: true,
		protectMfgCamRelease: true,
		protectNativeParametric: true,
		staleExportDays: 14,
		minSizeKb: 0,
	},
])

const NATIVE_CAD_EXTENSIONS = new Set([
	'sldprt', 'sldasm', 'slddrw', 'step', 'stp', 'iges', 'igs',
	'f3d', 'fcstd', 'catpart', 'catproduct', 'prt', 'ipt', 'iam',
	'dwg', 'dxf',
])

const MESH_SLICER_EXTENSIONS = new Set([
	'stl', '3mf', 'obj', 'ply', 'amf', 'gcode', 'bgcode', 'ctb',
])

const EDA_PCB_EXTENSIONS = new Set([
	'kicad_pcb', 'kicad_sch', 'kicad_pro', 'kicad_mod',
	'brd', 'sch', 'pcbdoc', 'schdoc', 'step_eda', '3dshapes',
])

const CAM_GERBER_EXTENSIONS = new Set([
	'gbr', 'gtl', 'gbl', 'drl', 'nc', 'tap',
])

const CAM_NAMED_EXACT_RE = /^(?:gerbers\.zip|fab-release\.zip|bom_export\.csv)$/i
const CAM_NAMED_VARIANT_RE = /(?:^|[_-])(?:gerbers|fab-release)(?:[_-].*)?\.zip$|(?:^|[_-])bom_export(?:[_-].*)?\.csv$/i
const EDA_3DSHAPES_PATH_RE = /\.3dshapes(?:\/|$)/i
const FREECAD_BACKUP_EXT_RE = /^fcstd\d+$/i
const LOCK_PREFIX_RE = /^~\$/
const LOCK_EXT_RE = /\.lck$/i

const RELEASED_PDM_PATH_RE = /(\/released-pdm|\/released_pdm|\/pdm-vault|\/pdm_vault|\/pdm\/released|\/eco-approved|\/eco_approved|\/ecn-released|\/mfg-freeze|\/mfg_freeze|\/released\/|\/vault\/released|\/__groupfolders\/\d+\/(?:released|pdm|eco|mfg-freeze))/i
const MFG_CAM_RELEASE_PATH_RE = /(\/mfg-release|\/mfg_release|\/cam-release|\/cam_release|\/manufacturing\/|\/fabrication\/|\/gerber-release|\/production-release|\/pcb-release|\/__groupfolders\/\d+\/(?:mfg|cam|fabrication|production))/i
const SLICER_SPOOL_PATH_RE = /(\/slicer|\/cura|\/prusaslicer|\/bambu|\/orcaslicer|\/octoprint|\/spool|\/3d-prints|\/3d_prints|\/prints\/|\/gcode\/|\/downloads\/|\/telechargements\/|\/desktop\/|\/bureau\/|\/tmp\/|\/temp\/|\/scratch\/|\/exports\/)/i
const BACKUP_AUTOSAVE_PATH_RE = /(\/[^/]*-backups\/|\/backups\/|\/autosave\/|\/swx_backup\/|\/cad-backups\/|\/old_revs\/|\/archive-bak\/)/i

const REV_TAG_RE = /[_-]?(rev[_-]?(?:[a-z]\d*|\d+[a-z]?))(?=[_.\-~]|$)/gi
const VERSION_TAG_RE = /(?:^|[_-])(v\d+(?:\.\d+)?)(?=[_.\-~]|$)/gi
const FIXED_TAG_RE = /[_-]?(fixed)(?=[_.\-~]|$)/gi
const BAK_TAG_RE = /(?:[_-](bak)|(\.bak\d*))(?=[_.\-~]|$)/gi
const TILDE_TAG_RE = /(~\d+)(?=\.[^.]+$|$)/g
const AUTOSAVE_TAG_RE = /(?:^|[_-])(autosave)(?=[_.\-~]|$)/gi
const TIMESTAMP_TAG_RE = /[_-]?(\d{4}-\d{2}-\d{2}(?:[_T-]\d{6})?|\d{8}[_-]\d{6})(?=[_.\-~]|$)/g
const COPY_SUFFIX_RE = /\s-\s?copy(?:\s*\(\d+\))?|\s*\(\d+\)|_copy\b/gi

const TIER_LABELS = Object.freeze({
	'released-pdm-vault': 'Released PDM / ECO Freeze Vault',
	'mfg-cam-release': 'Mfg / CAM Release',
	'engineering-wip': 'Engineering WIP',
	'slicer-spool-downloads': 'Slicer / Spool / Downloads',
	'backup-autosave-pool': 'Backup / Autosave Pool',
})

const TIER_AUTHORITY = Object.freeze({
	'released-pdm-vault': 98,
	'mfg-cam-release': 84,
	'engineering-wip': 66,
	'slicer-spool-downloads': 30,
	'backup-autosave-pool': 16,
})

const VERDICT_LABELS = Object.freeze({
	'keep-canonical-survivor': 'Keep Canonical Master',
	'reclaim-cad-copy': 'Reclaim Redundant Copy',
	'reclaim-autosave-backup': 'Prune Autosave / Backup',
	'hardlink-mesh-export': 'Hardlink Mesh / CAM Export',
	'blocked-released-pdm': 'Blocked: Released PDM / ECO Freeze',
	'blocked-mfg-cam-release': 'Blocked: Mfg / CAM Release Guard',
	'blocked-native-parametric': 'Blocked: Native Parametric Master',
	'blocked-not-autosave': 'Shielded: Non-Autosave Artifact',
	'blocked-manual-shield': 'Blocked: Operator Shield',
	excluded: 'Excluded by Operator',
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
	const raw = String(normalizedPath || '')
	const idx = raw.lastIndexOf('/')
	return idx === -1 ? raw : raw.slice(idx + 1)
}

/**
 * Collect regex matches from a string cleanly.
 *
 * @param {string} input Source string.
 * @param {RegExp} pattern Global regex pattern.
 * @return {Array<string>} Matched tag tokens.
 */
function collectTagMatches(input, pattern) {
	const out = []
	const re = new RegExp(pattern.source, pattern.flags)
	let match = re.exec(input)
	while (match !== null) {
		const token = (match[1] || match[2] || match[0] || '').trim()
		if (token) {
			out.push(token)
		}
		if (match.index === re.lastIndex) {
			re.lastIndex += 1
		}
		match = re.exec(input)
	}
	return out
}

/**
 * Extract CAD/EDA revision tags, backup/autosave markers, and canonical partLineageStem.
 *
 * @param {string} basename File basename.
 * @param {string} [normalizedPath=''] Normalized file path.
 * @return {{ partLineageStem: string, revisionTags: Array<string>, revisionTag: string, isAutosaveOrBackup: boolean, isLockfile: boolean }}
 */
export function parseCadRevisionInfo(basename, normalizedPath = '') {
	const rawBase = String(basename || '')
	const lowerPath = String(normalizedPath || '').toLowerCase()
	const isLockfile = LOCK_PREFIX_RE.test(rawBase) || LOCK_EXT_RE.test(rawBase)

	const working = rawBase
		.replace(LOCK_PREFIX_RE, '')
		.replace(/^(?:copy of |copie de )/i, '')

	const lastDot = working.lastIndexOf('.')
	const ext = lastDot > 0 && lastDot < working.length - 1 ? working.slice(lastDot + 1) : ''
	let stem = lastDot > 0 ? working.slice(0, lastDot) : working

	// Strip trailing tilde revision before extension or on stem (e.g. part~1.sldprt or part.sldprt~1)
	const tildeInRaw = collectTagMatches(rawBase, TILDE_TAG_RE)
	stem = stem.replace(/~\d+$/g, '')

	const revMatches = collectTagMatches(stem, REV_TAG_RE)
	const versionMatches = collectTagMatches(stem, VERSION_TAG_RE)
	const fixedMatches = collectTagMatches(stem, FIXED_TAG_RE)
	const bakMatches = collectTagMatches(stem, BAK_TAG_RE)
	const autosaveMatches = collectTagMatches(stem, AUTOSAVE_TAG_RE)
	const timestampMatches = collectTagMatches(stem, TIMESTAMP_TAG_RE)

	const isFreeCadBackup = FREECAD_BACKUP_EXT_RE.test(ext)
	const isPathBackup = BACKUP_AUTOSAVE_PATH_RE.test(lowerPath)

	const revisionTags = []
	for (const token of [
		...revMatches,
		...versionMatches,
		...fixedMatches,
		...autosaveMatches,
		...bakMatches,
		...tildeInRaw,
		...timestampMatches,
	]) {
		if (!revisionTags.includes(token)) {
			revisionTags.push(token)
		}
	}
	if (isFreeCadBackup) {
		revisionTags.push(ext.toLowerCase())
	}
	if (isPathBackup && !revisionTags.includes('-backups')) {
		revisionTags.push('-backups')
	}
	if (isLockfile && !revisionTags.includes('lockfile')) {
		revisionTags.push('lockfile')
	}

	const isAutosaveOrBackup = Boolean(
		isFreeCadBackup
		|| isPathBackup
		|| isLockfile
		|| bakMatches.length > 0
		|| tildeInRaw.length > 0
		|| autosaveMatches.length > 0
		|| timestampMatches.length > 0
	)

	let cleanStem = stem
		.replace(TIMESTAMP_TAG_RE, '')
		.replace(AUTOSAVE_TAG_RE, '')
		.replace(BAK_TAG_RE, '')
		.replace(FIXED_TAG_RE, '')
		.replace(REV_TAG_RE, '')
		.replace(VERSION_TAG_RE, '')
		.replace(COPY_SUFFIX_RE, '')
		.replace(/~\d+/g, '')
		.replace(/[\s_.-]+$/g, '')
		.replace(/^[\s_.-]+/g, '')

	if (!cleanStem) {
		cleanStem = stem || rawBase
	}

	return {
		partLineageStem: cleanStem,
		revisionTags,
		revisionTag: revisionTags.length > 0 ? revisionTags.join(', ') : 'none',
		isAutosaveOrBackup,
		isLockfile,
	}
}

/**
 * Resolve extension from a CAD/EDA filename, handling FreeCAD backups (.fcstd1) and tilde suffixes (~1).
 *
 * @param {string} lowerBase Lowercase basename.
 * @return {string} Normalized lowercase extension without dot.
 */
function extractCadExtension(lowerBase) {
	const withoutLock = lowerBase.replace(LOCK_PREFIX_RE, '')
	const withoutTilde = withoutLock.replace(/~\d+$/, '')
	const lastDot = withoutTilde.lastIndexOf('.')
	if (lastDot <= 0 || lastDot >= withoutTilde.length - 1) {
		return ''
	}
	return withoutTilde.slice(lastDot + 1)
}

/**
 * Classify a file path into one of the 4 CAD, 3D Print, KiCad EDA, and CAM engineering families.
 *
 * @param {string} rawPath File path.
 * @return {{ matched: boolean, family: string, familyLabel: string, extension: string, partLineageStem: string, revisionTags: Array<string>, revisionTag: string, isAutosaveOrBackup: boolean, isLockfile: boolean }|null}
 */
export function classifyCadArtifact(rawPath) {
	const normalized = normalizePathForDiff(rawPath) || String(rawPath || '')
	const basename = extractBasename(normalized)
	const lowerBase = basename.toLowerCase()
	const lowerPath = normalized.toLowerCase()

	if (!lowerBase) {
		return null
	}

	const ext = extractCadExtension(lowerBase)
	const revInfo = parseCadRevisionInfo(basename, normalized)

	if (EDA_PCB_EXTENSIONS.has(ext) || (EDA_3DSHAPES_PATH_RE.test(lowerPath) && (ext === 'step' || ext === 'stp' || ext === 'wrl' || ext === '3dshapes'))) {
		return {
			matched: true,
			family: 'eda-pcb-schematics',
			familyLabel: CAD_FAMILY_META['eda-pcb-schematics'].label,
			extension: ext || '3dshapes',
			...revInfo,
		}
	}

	if (CAM_GERBER_EXTENSIONS.has(ext) || CAM_NAMED_EXACT_RE.test(lowerBase) || CAM_NAMED_VARIANT_RE.test(lowerBase)) {
		return {
			matched: true,
			family: 'cam-gerber-exports',
			familyLabel: CAD_FAMILY_META['cam-gerber-exports'].label,
			extension: ext || 'zip',
			...revInfo,
		}
	}

	if (MESH_SLICER_EXTENSIONS.has(ext)) {
		return {
			matched: true,
			family: 'mesh-slicer-prints',
			familyLabel: CAD_FAMILY_META['mesh-slicer-prints'].label,
			extension: ext,
			...revInfo,
		}
	}

	if (NATIVE_CAD_EXTENSIONS.has(ext) || FREECAD_BACKUP_EXT_RE.test(ext)) {
		return {
			matched: true,
			family: 'native-cad-pdm',
			familyLabel: CAD_FAMILY_META['native-cad-pdm'].label,
			extension: ext,
			...revInfo,
		}
	}

	return null
}

/**
 * Inspect governance tier, vault protection flags, and revision lineage context for a CAD/EDA member.
 *
 * @param {object} file Duplicate file entry.
 * @param {object} classification Classification metadata.
 * @param {number} referenceTimeSec Reference epoch seconds.
 * @param {number} staleExportDays Stale export threshold in days.
 * @return {object} Governance and lineage context.
 */
export function inspectCadMemberContext(file, classification, referenceTimeSec, staleExportDays) {
	const normalizedPath = normalizePathForDiff(file && file.path) || String((file && file.path) || '')
	const basename = extractBasename(normalizedPath)
	const lowerPath = normalizedPath.toLowerCase()
	const mtimeSec = getFileMtimeSeconds(file)
	const ageDays = mtimeSec !== null && Number.isFinite(referenceTimeSec)
		? Math.max(0, Math.floor((referenceTimeSec - mtimeSec) / 86400))
		: null

	const revInfo = parseCadRevisionInfo(basename, normalizedPath)
	const ext = extractCadExtension(basename.toLowerCase()) || classification.extension || ''

	const isReleasedPdmVault = RELEASED_PDM_PATH_RE.test(lowerPath)
	const isMfgCamRelease = !isReleasedPdmVault && MFG_CAM_RELEASE_PATH_RE.test(lowerPath)
	const isBackupAutosavePath = BACKUP_AUTOSAVE_PATH_RE.test(lowerPath)
	const isSlicerSpoolPath = SLICER_SPOOL_PATH_RE.test(lowerPath)
	const isBackupAutosave = Boolean(revInfo.isAutosaveOrBackup || isBackupAutosavePath)

	let tier = 'engineering-wip'
	if (isReleasedPdmVault) {
		tier = 'released-pdm-vault'
	} else if (isMfgCamRelease) {
		tier = 'mfg-cam-release'
	} else if (isBackupAutosave) {
		tier = 'backup-autosave-pool'
	} else if (isSlicerSpoolPath) {
		tier = 'slicer-spool-downloads'
	}

	const isSlicerSpoolDownloads = tier === 'slicer-spool-downloads'
	const isNativeParametricMaster = (classification.family === 'native-cad-pdm' || classification.family === 'eda-pcb-schematics')
		&& !isBackupAutosave
		&& !isSlicerSpoolDownloads

	const isStaleExport = ageDays !== null
		&& ageDays >= staleExportDays
		&& (isBackupAutosave || isSlicerSpoolDownloads)

	let authorityScore = TIER_AUTHORITY[tier] || 50
	if (isNativeParametricMaster) {
		authorityScore += 6
	}
	if (/eco[_-]?approved|mfg[_-]?freeze/i.test(lowerPath)) {
		authorityScore += 2
	}
	if (revInfo.revisionTags.length > 0 && !isBackupAutosave) {
		authorityScore += 2
	}

	return {
		tier,
		tierLabel: TIER_LABELS[tier] || TIER_LABELS['engineering-wip'],
		authorityScore,
		extension: ext,
		partLineageStem: revInfo.partLineageStem,
		revisionTags: revInfo.revisionTags,
		revisionTag: revInfo.revisionTag,
		isReleasedPdmVault,
		isMfgCamRelease,
		isBackupAutosave,
		isSlicerSpoolDownloads,
		isNativeParametricMaster,
		isLockfile: revInfo.isLockfile,
		isStaleExport,
		mtimeSec,
		ageDays,
	}
}

/**
 * Select the canonical surviving copy inside a CAD/EDA duplicate cluster.
 *
 * @param {Array<object>} members Enriched cluster members.
 * @param {string} survivorRule Survivor selection rule.
 * @param {Set<string>} excludeKeys Excluded member keys.
 * @return {object|null} Selected survivor or null.
 */
function selectClusterSurvivor(members, survivorRule, excludeKeys) {
	if (!Array.isArray(members) || members.length === 0) {
		return null
	}
	const eligible = members.filter(m => !excludeKeys.has(m.selectionKey))
	const pool = eligible.length > 0 ? eligible : members

	const sorted = [...pool].sort((a, b) => {
		if (survivorRule === 'native-master-first') {
			if (a.context.isNativeParametricMaster !== b.context.isNativeParametricMaster) {
				return a.context.isNativeParametricMaster ? -1 : 1
			}
			if (a.context.isBackupAutosave !== b.context.isBackupAutosave) {
				return a.context.isBackupAutosave ? 1 : -1
			}
			if (a.context.authorityScore !== b.context.authorityScore) {
				return b.context.authorityScore - a.context.authorityScore
			}
		} else if (survivorRule === 'newest-revision') {
			if (a.context.isBackupAutosave !== b.context.isBackupAutosave) {
				return a.context.isBackupAutosave ? 1 : -1
			}
			const mtimeA = a.context.mtimeSec ?? -1
			const mtimeB = b.context.mtimeSec ?? -1
			if (mtimeA !== mtimeB) {
				return mtimeB - mtimeA
			}
			if (a.context.authorityScore !== b.context.authorityScore) {
				return b.context.authorityScore - a.context.authorityScore
			}
		} else if (survivorRule === 'oldest-canonical') {
			if (a.context.isBackupAutosave !== b.context.isBackupAutosave) {
				return a.context.isBackupAutosave ? 1 : -1
			}
			const mtimeA = a.context.mtimeSec ?? Number.MAX_SAFE_INTEGER
			const mtimeB = b.context.mtimeSec ?? Number.MAX_SAFE_INTEGER
			if (mtimeA !== mtimeB) {
				return mtimeA - mtimeB
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

		const mtimeA = a.context.mtimeSec ?? 0
		const mtimeB = b.context.mtimeSec ?? 0
		if (mtimeA !== mtimeB) {
			return mtimeB - mtimeA
		}
		return a.normalizedPath.localeCompare(b.normalizedPath)
	})

	return sorted[0] || null
}

/**
 * Determine the deterministic remediation verdict for a CAD/EDA cluster member.
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
			note: 'Excluded from CAD/EDA vault audit actions by manual operator override.',
		}
	}

	if (survivor && member.selectionKey === survivor.selectionKey) {
		return {
			verdict: 'keep-canonical-survivor',
			verdictLabel: VERDICT_LABELS['keep-canonical-survivor'],
			actionKind: 'keep',
			note: `Canonical ${member.context.tierLabel} artifact retained as the authoritative engineering master.`,
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

	if (options.protectReleasedPdm && member.context.isReleasedPdmVault) {
		return {
			verdict: 'blocked-released-pdm',
			verdictLabel: VERDICT_LABELS['blocked-released-pdm'],
			actionKind: 'shield',
			note: 'Strictly protected by Released PDM / ECO Approved / Mfg Freeze Guard; frozen release vaults are never altered automatically.',
		}
	}

	if (options.protectMfgCamRelease && member.context.isMfgCamRelease) {
		return {
			verdict: 'blocked-mfg-cam-release',
			verdictLabel: VERDICT_LABELS['blocked-mfg-cam-release'],
			actionKind: 'shield',
			note: 'Protected by Manufacturing / CAM Release Guard; production Gerber, drill, and BOM packages require engineering sign-off.',
		}
	}

	if (options.protectNativeParametric && member.context.isNativeParametricMaster) {
		return {
			verdict: 'blocked-native-parametric',
			verdictLabel: VERDICT_LABELS['blocked-native-parametric'],
			actionKind: 'shield',
			note: 'Protected by Native Parametric Master Guard; source CAD assemblies and KiCad schematics outside backup/spool pools require PDM review.',
		}
	}

	if (options.strategy === 'hardlink-mesh-exports') {
		return {
			verdict: 'hardlink-mesh-export',
			verdictLabel: VERDICT_LABELS['hardlink-mesh-export'],
			actionKind: 'hardlink',
			note: 'Replace redundant 3D print mesh, slicer G-code, or CAM export copy with a same-filesystem POSIX hardlink to the canonical survivor.',
		}
	}

	if (options.strategy === 'prune-cad-autosaves') {
		const isPruneEligible = member.context.isBackupAutosave
			|| member.context.isSlicerSpoolDownloads
			|| member.context.isStaleExport
		if (!isPruneEligible) {
			return {
				verdict: 'blocked-not-autosave',
				verdictLabel: VERDICT_LABELS['blocked-not-autosave'],
				actionKind: 'shield',
				note: 'Retained by Prune CAD Autosaves strategy because copy is outside -backups/, autosave, and slicer/spool pools.',
			}
		}
		return {
			verdict: 'reclaim-autosave-backup',
			verdictLabel: VERDICT_LABELS['reclaim-autosave-backup'],
			actionKind: 'reclaim',
			note: 'KiCad -backups/ snapshot, CAD autosave, or stale slicer spool duplicate superseded by canonical master.',
		}
	}

	if (member.context.isBackupAutosave || member.context.isSlicerSpoolDownloads) {
		return {
			verdict: 'reclaim-autosave-backup',
			verdictLabel: VERDICT_LABELS['reclaim-autosave-backup'],
			actionKind: 'reclaim',
			note: 'Redundant autosave, KiCad -backups/ copy, or slicer/spool export superseded by canonical engineering copy.',
		}
	}

	return {
		verdict: 'reclaim-cad-copy',
		verdictLabel: VERDICT_LABELS['reclaim-cad-copy'],
		actionKind: 'reclaim',
		note: 'Identical-hash mesh, slicer, or export duplicate outside protected PDM/CAM vaults; safe to reclaim.',
	}
}

/**
 * Normalize CAD auditor configuration options into deterministic bounds.
 *
 * @param {object} [rawOptions] Caller options.
 * @return {object} Normalized options.
 */
function normalizeOptions(rawOptions = {}) {
	const familyFilter = CAD_FAMILIES.includes(rawOptions.familyFilter)
		? rawOptions.familyFilter
		: 'all'
	const verdictFilter = CAD_VERDICT_FILTERS.includes(rawOptions.verdictFilter)
		? rawOptions.verdictFilter
		: 'all'
	const sortMode = CAD_SORT_MODES.includes(rawOptions.sortMode)
		? rawOptions.sortMode
		: 'reclaim_desc'
	const strategy = CAD_STRATEGIES.includes(rawOptions.strategy)
		? rawOptions.strategy
		: 'consolidate-released-pdm'
	const survivorRule = CAD_SURVIVOR_RULES.includes(rawOptions.survivorRule)
		? rawOptions.survivorRule
		: 'pdm-authority-first'

	const parsedDays = Number.parseInt(rawOptions.staleExportDays, 10)
	const staleExportDays = Number.isFinite(parsedDays) && parsedDays >= 0
		? Math.min(parsedDays, 3650)
		: 14

	const parsedMinKb = Number.parseFloat(rawOptions.minSizeKb)
	const minSizeKb = Number.isFinite(parsedMinKb) && parsedMinKb >= 0
		? parsedMinKb
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
		protectReleasedPdm: rawOptions.protectReleasedPdm !== false,
		protectMfgCamRelease: rawOptions.protectMfgCamRelease !== false,
		protectNativeParametric: rawOptions.protectNativeParametric !== false,
		staleExportDays,
		minSizeKb,
		searchQuery: String(rawOptions.searchQuery || '').trim().toLowerCase(),
		referenceTimeSec,
		memberOverrides: rawOptions.memberOverrides && typeof rawOptions.memberOverrides === 'object'
			? rawOptions.memberOverrides
			: {},
	}
}

const FAMILY_PRIORITY = Object.freeze({
	'native-cad-pdm': 4,
	'eda-pcb-schematics': 3,
	'cam-gerber-exports': 2,
	'mesh-slicer-prints': 1,
})

/**
 * Audit duplicate groups for CAD, 3D print meshes, KiCad EDA, and CAM/Gerber manufacturing artifacts.
 *
 * @param {Array<object>} duplicates Loaded duplicate groups.
 * @param {object} [rawOptions] Auditor configuration options.
 * @return {object} Deterministic audit analysis with summary, counts, and clusters.
 */
export function analyzeCadVaultDuplicates(duplicates, rawOptions = {}) {
	const options = normalizeOptions(rawOptions)
	const safeDuplicates = Array.isArray(duplicates) ? duplicates : []
	const minSizeBytes = options.minSizeKb * 1024

	const familyCounts = {
		all: 0,
		'native-cad-pdm': 0,
		'mesh-slicer-prints': 0,
		'eda-pcb-schematics': 0,
		'cam-gerber-exports': 0,
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
			const info = classifyCadArtifact(file.path)
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

		const forceKeepKeys = new Set()
		const excludeKeys = new Set()

		const members = validFiles.map((file, fileIdx) => {
			const normalizedPath = normalizePathForDiff(file.path) || String(file.path || '')
			const basename = extractBasename(normalizedPath)
			const selectionKey = String(getFileSelectionKey(file, `${groupIdx}-${fileIdx}`))
			const override = options.memberOverrides[selectionKey] || 'auto'
			if (override === 'force-keep') {
				forceKeepKeys.add(selectionKey)
			} else if (override === 'exclude') {
				excludeKeys.add(selectionKey)
			}

			const directInfo = classifyCadArtifact(file.path)
			const memberInfo = directInfo && directInfo.matched ? directInfo : primaryInfo
			const context = inspectCadMemberContext(file, memberInfo, options.referenceTimeSec, options.staleExportDays)
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

		const reclaimableMembers = members.filter(m => m.actionKind === 'reclaim' || m.actionKind === 'hardlink')
		const reclaimableBytes = reclaimableMembers.reduce((sum, m) => sum + m.size, 0)
		const reclaimableCopiesCount = reclaimableMembers.length
		const shieldedCopiesCount = members.filter(m => m.actionKind === 'shield').length
		const releasedPdmCopiesCount = members.filter(m => m.verdict === 'blocked-released-pdm' || m.context.isReleasedPdmVault).length
		const mfgReleaseCopiesCount = members.filter(m => m.verdict === 'blocked-mfg-cam-release' || m.context.isMfgCamRelease).length
		const nativeMasterCopiesCount = members.filter(m => m.verdict === 'blocked-native-parametric' || m.context.isNativeParametricMaster).length
		const autosaveBackupCopiesCount = members.filter(m => m.context.isBackupAutosave).length

		const hasReleasedPdmVault = members.some(m => m.context.isReleasedPdmVault)
		const hasMfgCamRelease = members.some(m => m.context.isMfgCamRelease)
		const hasNativeParametric = members.some(m => m.context.isNativeParametricMaster)
		const hasAutosaveBackup = members.some(m => m.context.isBackupAutosave)

		let clusterRiskState = 'reclaimable'
		if (members.some(m => m.verdict === 'blocked-released-pdm')) {
			clusterRiskState = 'released-pdm'
		} else if (members.some(m => m.verdict === 'blocked-mfg-cam-release')) {
			clusterRiskState = 'mfg-release'
		} else if (reclaimableCopiesCount === 0) {
			clusterRiskState = 'shielded'
		}

		const primaryGroupId = group.id ?? null
		const groupKey = String(group.hash || primaryGroupId || `cad-${groupIdx}`)
		const displayName = survivor ? survivor.basename : members[0].basename
		const governanceSignals = Array.from(new Set(members.map(m => m.tier)))
		const allRevisionTags = Array.from(new Set(members.flatMap(m => m.context.revisionTags)))

		rawClusters.push({
			groupKey,
			primaryGroupId,
			hash: group.hash || '',
			displayName,
			basename: displayName,
			partLineageStem: survivor ? survivor.context.partLineageStem : primaryInfo.partLineageStem,
			revisionTags: allRevisionTags,
			revisionSummary: allRevisionTags.length > 0 ? allRevisionTags.join(', ') : 'none',
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
			releasedPdmCopiesCount,
			mfgReleaseCopiesCount,
			nativeMasterCopiesCount,
			autosaveBackupCopiesCount,
			hasReleasedPdmVault,
			hasMfgCamRelease,
			hasNativeParametric,
			hasAutosaveBackup,
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
			|| cluster.partLineageStem.toLowerCase().includes(q)
			|| cluster.revisionSummary.toLowerCase().includes(q)
			|| cluster.extension.toLowerCase().includes(q)
			|| cluster.familyLabel.toLowerCase().includes(q)
			|| cluster.governanceSummary.toLowerCase().includes(q)
		) {
			return true
		}
		return cluster.members.some(m => (
			m.normalizedPath.toLowerCase().includes(q)
			|| m.basename.toLowerCase().includes(q)
			|| m.context.revisionTag.toLowerCase().includes(q)
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
		if (options.verdictFilter === 'released-pdm' && !cluster.hasReleasedPdmVault) {
			return false
		}
		if (options.verdictFilter === 'mfg-release' && !cluster.hasMfgCamRelease) {
			return false
		}
		if (options.verdictFilter === 'autosaves-backups' && !cluster.hasAutosaveBackup) {
			return false
		}
		if (options.verdictFilter === 'shielded' && cluster.shieldedCopiesCount === 0 && cluster.clusterRiskState !== 'shielded') {
			return false
		}
		return true
	})

	clusters.sort((a, b) => {
		if (options.sortMode === 'risk_desc') {
			const riskA = a.releasedPdmCopiesCount * 5 + a.mfgReleaseCopiesCount * 4 + a.nativeMasterCopiesCount * 2 + a.shieldedCopiesCount
			const riskB = b.releasedPdmCopiesCount * 5 + b.mfgReleaseCopiesCount * 4 + b.nativeMasterCopiesCount * 2 + b.shieldedCopiesCount
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
	const totalReleasedPdmClusters = clusters.filter(c => c.hasReleasedPdmVault).length
	const totalMfgReleaseClusters = clusters.filter(c => c.hasMfgCamRelease).length
	const totalAutosaveBackupCopiesCount = clusters.reduce((sum, c) => sum + c.autosaveBackupCopiesCount, 0)
	const efficiencyPct = totalRawDuplicateBytes > 0
		? Math.round((totalReclaimableBytes / totalRawDuplicateBytes) * 100)
		: 0

	return {
		schema: CAD_VAULT_SCHEMA,
		options: {
			familyFilter: options.familyFilter,
			verdictFilter: options.verdictFilter,
			sortMode: options.sortMode,
			strategy: options.strategy,
			survivorRule: options.survivorRule,
			protectReleasedPdm: options.protectReleasedPdm,
			protectMfgCamRelease: options.protectMfgCamRelease,
			protectNativeParametric: options.protectNativeParametric,
			staleExportDays: options.staleExportDays,
			minSizeKb: options.minSizeKb,
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
			totalReleasedPdmClusters,
			totalMfgReleaseClusters,
			totalAutosaveBackupCopiesCount,
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
 * Build a POSIX DRY_RUN=1 remediation script for CAD, 3D print mesh, KiCad EDA, and CAM consolidation.
 *
 * @param {object} analysis Output from analyzeCadVaultDuplicates.
 * @param {object} [options] Script options.
 * @param {string} [options.dataRoot='/var/www/nextcloud/data'] Nextcloud data root directory.
 * @return {string} POSIX bash script with single-quoted paths, SHA-256 verification, cross-device stat guard, and DRY_RUN=1 default.
 */
export function buildCadVaultScript(analysis, options = {}) {
	const dataRoot = String(options.dataRoot || '/var/www/nextcloud/data').replace(/\/+$/, '') || '/var/www/nextcloud/data'
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const strategy = (analysis && analysis.options && analysis.options.strategy) || 'consolidate-released-pdm'

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
		'# CAD, 3D Print, KiCad EDA & Manufacturing Release Vault Auditor',
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
		lines.push('echo "No reclaimable or hardlinkable CAD, mesh, KiCad, or CAM targets under current guards."')
		return lines.join('\n')
	}

	lines.push('reclaim_cad_copy() {')
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
	lines.push('hardlink_mesh_export() {')
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
		lines.push(`# ${op.family} [${op.tier}]: ${op.clusterName} (${formatBytes(op.size)})`)
		if (op.actionKind === 'hardlink') {
			lines.push(`hardlink_mesh_export ${escapePosixSingleQuote(op.survivorPath)} ${escapePosixSingleQuote(op.targetPath)}`)
		} else {
			lines.push(`reclaim_cad_copy ${escapePosixSingleQuote(op.survivorPath)} ${escapePosixSingleQuote(op.targetPath)}`)
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
 * Build a Nextcloud Desktop .sync-exclude.lst snippet for CAD lockfiles, KiCad backups, and FreeCAD autosaves.
 *
 * @param {object} analysis Output from analyzeCadVaultDuplicates.
 * @return {string} Newline-delimited Nextcloud sync-exclude patterns.
 */
export function buildCadSyncExcludeSnippet(analysis) {
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const lines = [
		'# Nextcloud Desktop .sync-exclude.lst rules for SolidWorks, KiCad, FreeCAD, and CAM temporary/backup artifacts',
		'~$*.sld*',
		'*.lck',
		'*-backups/',
		'*.fcstd1',
		'*.bak',
		'*.kicad_prl',
		'*_autosave*',
		'*~1',
	]
	const seen = new Set(lines)
	for (const cluster of clusters) {
		if (cluster && cluster.extension) {
			const ext = cluster.extension.toLowerCase()
			if (['fcstd', 'fcstd1', 'kicad_pcb', 'kicad_sch', 'sldprt', 'sldasm'].includes(ext)) {
				const bakPattern = `*.${ext}.bak`
				if (!seen.has(bakPattern)) {
					lines.push(bakPattern)
					seen.add(bakPattern)
				}
			}
		}
	}
	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe CSV audit report for CAD, 3D print, KiCad EDA, and CAM clusters.
 *
 * @param {object} analysis Output from analyzeCadVaultDuplicates.
 * @return {string} RFC-4180 CSV string with CWE-1236 formula escaping.
 */
export function buildCadVaultCsvReport(analysis) {
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const headers = [
		'Cluster Key',
		'Artifact Name',
		'Part Lineage Stem',
		'Revision Tags',
		'Extension',
		'Family',
		'Governance Tier',
		'Released PDM Vault',
		'Mfg / CAM Release',
		'Native Parametric Master',
		'Autosave / Backup',
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
			const row = [
				cluster.groupKey,
				cluster.basename,
				member.context.partLineageStem,
				member.context.revisionTag,
				member.extension,
				cluster.familyLabel,
				member.tierLabel,
				member.context.isReleasedPdmVault ? 'yes' : 'no',
				member.context.isMfgCamRelease ? 'yes' : 'no',
				member.context.isNativeParametricMaster ? 'yes' : 'no',
				member.context.isBackupAutosave ? 'yes' : 'no',
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
 * Build a structured JSON audit manifest for CAD, 3D print, KiCad EDA, and Manufacturing Release clusters.
 *
 * @param {object} analysis Output from analyzeCadVaultDuplicates.
 * @param {string} [generatedAt] Optional ISO timestamp override.
 * @return {string} Pretty-printed JSON manifest.
 */
export function buildCadVaultJsonReport(analysis, generatedAt = new Date().toISOString()) {
	const safeAnalysis = analysis && typeof analysis === 'object' ? analysis : { summary: {}, clusters: [], options: {} }
	return JSON.stringify({
		schema: CAD_VAULT_SCHEMA,
		generatedAt,
		options: safeAnalysis.options || {},
		summary: safeAnalysis.summary || {},
		clusters: (safeAnalysis.clusters || []).map(cluster => ({
			groupKey: cluster.groupKey,
			primaryGroupId: cluster.primaryGroupId,
			hash: cluster.hash,
			basename: cluster.basename,
			partLineageStem: cluster.partLineageStem,
			revisionTags: cluster.revisionTags,
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
				ageDays: member.context.ageDays,
				tier: member.tier,
				partLineageStem: member.context.partLineageStem,
				revisionTags: member.context.revisionTags,
				isReleasedPdmVault: member.context.isReleasedPdmVault,
				isMfgCamRelease: member.context.isMfgCamRelease,
				isNativeParametricMaster: member.context.isNativeParametricMaster,
				isBackupAutosave: member.context.isBackupAutosave,
				isSlicerSpoolDownloads: member.context.isSlicerSpoolDownloads,
				authorityScore: member.context.authorityScore,
			})),
		})),
	}, null, 2)
}
