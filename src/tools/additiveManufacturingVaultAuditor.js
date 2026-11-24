/**
 * Pure 3D Printing, CNC & Additive Manufacturing Vault Auditor.
 * Classifies and audits duplicate clusters across 4 Additive & CNC Manufacturing families:
 * - CAD & Parametric Master Sources (*.step, *.stp, *.iges, *.igs, *.f3d, *.fcstd, *.scad, *.sldprt, *.brep)
 * - 3D Meshes & 3MF Print Projects (*.stl, *.3mf, *.obj, *.ply, *.amf)
 * - Ephemeral G-code, CNC & SLA Resin Slices (*.gcode, *.bgcode, *.ctb, *.goo, *.pwmx, *.sl1, *.sl1s, *.photon, *.chitubox, *.nc, *.tap, *.ngc)
 * - Slicer Profiles & Machine Presets (PrusaSlicer / Bambu Studio / OrcaSlicer / Cura *.ini, *.json, *.curaprofile, *.orca_printer, *.bbl)
 *
 * Distinguishes identical geometry mesh duplicates from regenerated slicer/toolpath outputs,
 * tracks cross-artifact CAD/mesh source availability for slice clusters, shields CAD/STEP sources
 * and slicer profiles by default, and generates POSIX DRY_RUN=1 remediation scripts,
 * CWE-1236-safe CSV exports, JSON manifests, and .sync-exclude.lst rules.
 *
 * Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const ADDITIVE_MFG_VAULT_SCHEMA = 'duplicatefinder.additive-mfg-vault-auditor.v1'

export const ADDITIVE_MFG_FAMILIES = Object.freeze([
	'all',
	'cad-parametric-sources',
	'meshes-3mf-projects',
	'toolpaths-resin-slices',
	'slicer-profiles-presets',
])

export const ADDITIVE_MFG_FAMILY_META = Object.freeze({
	'cad-parametric-sources': {
		id: 'cad-parametric-sources',
		label: 'CAD & STEP Sources',
		shortLabel: 'CAD Masters (.step, .stp, .f3d, .fcstd, .scad)',
	},
	'meshes-3mf-projects': {
		id: 'meshes-3mf-projects',
		label: '3D Meshes & 3MF',
		shortLabel: 'Meshes & Projects (.stl, .3mf, .obj, .ply)',
	},
	'toolpaths-resin-slices': {
		id: 'toolpaths-resin-slices',
		label: 'G-code, CNC & SLA Slices',
		shortLabel: 'Toolpaths & Resin (.gcode, .bgcode, .ctb, .goo, .nc)',
	},
	'slicer-profiles-presets': {
		id: 'slicer-profiles-presets',
		label: 'Slicer Profiles & Presets',
		shortLabel: 'PrusaSlicer / Bambu / Orca (.ini, .json, .orca_printer)',
	},
})

export const ADDITIVE_MFG_STRATEGIES = Object.freeze([
	'prune-ephemeral-slices-keep-cad',
	'consolidate-mesh-hardlinks',
	'prune-spool-prints-only',
])

export const ADDITIVE_MFG_SURVIVOR_RULES = Object.freeze([
	'cad-step-source-first',
	'slicer-3mf-project-first',
	'shortest-path',
])

export const ADDITIVE_MFG_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'mesh-duplicates',
	'regenerated-slices',
	'cad-sources',
	'slicer-profiles',
	'sla-resin',
	'cnc-toolpaths',
	'shielded',
])

export const ADDITIVE_MFG_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'ephemeral_risk_desc',
	'copies_desc',
	'name_asc',
])

export const ADDITIVE_MFG_PRESETS = Object.freeze([
	{
		id: 'all-additive-cnc-audit',
		name: 'All 3D Print & CNC Audit',
		description: 'Audit CAD/STEP masters, .stl/.3mf mesh duplicates, ephemeral .gcode/.bgcode/.ctb/.goo slices, and PrusaSlicer/Bambu/Orca profiles while preserving source masters.',
		familyFilter: 'all',
		strategy: 'prune-ephemeral-slices-keep-cad',
		survivorRule: 'cad-step-source-first',
		protectCadStepSources: true,
		protectSlicerProfiles: true,
		protectProductionPlates: true,
		staleSliceDays: 7,
		minSizeMb: 0,
	},
	{
		id: 'prune-ephemeral-gcode-resin',
		name: 'Prune Ephemeral G-code & SLA',
		description: 'Target regenerated .gcode, .bgcode, .ctb, .goo, and CNC .nc duplicates in print queues and staging folders while keeping CAD/STEP sources and production plates untouched.',
		familyFilter: 'toolpaths-resin-slices',
		strategy: 'prune-ephemeral-slices-keep-cad',
		survivorRule: 'cad-step-source-first',
		protectCadStepSources: true,
		protectSlicerProfiles: true,
		protectProductionPlates: true,
		staleSliceDays: 7,
		minSizeMb: 0,
	},
	{
		id: 'consolidate-mesh-3mf-hardlinks',
		name: 'Hardlink STL & 3MF Meshes',
		description: 'Deduplicate identical .stl, .3mf, and .obj geometry meshes onto canonical project anchors via POSIX hardlinks at zero extra disk footprint.',
		familyFilter: 'meshes-3mf-projects',
		strategy: 'consolidate-mesh-hardlinks',
		survivorRule: 'slicer-3mf-project-first',
		protectCadStepSources: true,
		protectSlicerProfiles: true,
		protectProductionPlates: true,
		staleSliceDays: 7,
		minSizeMb: 0,
	},
	{
		id: 'protect-cad-step-and-profiles',
		name: 'CAD/STEP & Slicer Profiles Guard',
		description: 'Inspect parametric .step/.stp/.f3d/.fcstd/.scad sources and PrusaSlicer/Bambu/Orca .ini/.json presets so master sources and machine profiles remain shielded.',
		familyFilter: 'cad-parametric-sources',
		strategy: 'prune-ephemeral-slices-keep-cad',
		survivorRule: 'cad-step-source-first',
		protectCadStepSources: true,
		protectSlicerProfiles: true,
		protectProductionPlates: true,
		staleSliceDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'audit-spool-cnc-toolpaths',
		name: 'Spool & SD-Card G-code Sweep',
		description: 'Reclaim only stale G-code, SLA resin slices, and CNC toolpaths inside OctoPrint/Mainsail/SD-card/Downloads spool directories older than the retention window.',
		familyFilter: 'all',
		strategy: 'prune-spool-prints-only',
		survivorRule: 'cad-step-source-first',
		protectCadStepSources: true,
		protectSlicerProfiles: true,
		protectProductionPlates: true,
		staleSliceDays: 7,
		minSizeMb: 0,
	},
])

const CAD_PARAMETRIC_EXT_SET = new Set([
	'step',
	'stp',
	'iges',
	'igs',
	'f3d',
	'f3z',
	'fcstd',
	'scad',
	'sldprt',
	'sldasm',
	'brep',
	'ipt',
	'catpart',
])

const MESH_PROJECT_EXT_SET = new Set([
	'stl',
	'3mf',
	'obj',
	'ply',
	'amf',
])

const FDM_GCODE_EXT_SET = new Set([
	'gcode',
	'gco',
	'bgcode',
	'gx',
	'x3g',
])

const SLA_RESIN_SLICE_EXT_SET = new Set([
	'ctb',
	'goo',
	'pwmx',
	'pwmo',
	'pwma',
	'sl1',
	'sl1s',
	'photon',
	'photons',
	'chitubox',
	'cbddlp',
	'prz',
	'cws',
])

const CNC_TOOLPATH_EXT_SET = new Set([
	'nc',
	'tap',
	'ngc',
	'cnc',
	'ncc',
	'cam',
])

const SLICER_PROFILE_EXT_SET = new Set([
	'orca_printer',
	'orca_filament',
	'orca_process',
	'curaprofile',
	'bbl',
	'prusaprofile',
])

const SLICER_CONFIG_GENERIC_EXT_SET = new Set([
	'ini',
	'json',
	'cfg',
])

const SLICER_PROFILE_SIGNAL_RE = /(?:prusaslicer|prusa[_-]?slicer|bambu[_-]?studio|bambulab|orcaslicer|orca[_-]?slicer|superslicer|cura|chitubox|lychee|klipper|printer\.cfg|filament|process|machine[_-]?profile|nozzle|slicer[_-]?profile|slicer[_-]?presets?|print[_-]?settings)/i
const ADDITIVE_CONTEXT_RE = /(?:3d[_-]?print|additive|fabrication|fablab|maker|prusaslicer|prusa|bambu|orcaslicer|voron|ender|klipper|octoprint|mainsail|fluidd|fdm|sla|msla|resin|extruder|nozzle|build[_-]?plate|spool|gcode|bgcode|cnc|mill|lathe|router|grbl|linuxcnc|fanuc|toolpath|cam[_-]?ops|stl|3mf|step|cad)/i

const PRODUCTION_PLATE_PATH_RE = /(?:production[_-]?plates?|print[_-]?farm[_-]?release|validated[_-]?slices?|golden[_-]?gcode|fixture[_-]?locked|released[_-]?bom|mfg[_-]?freeze|certified[_-]?toolpath)/i
const CANONICAL_SOURCE_PATH_RE = /(\/(?:cad|cad[_-]?sources?|step[_-]?masters?|sources?|masters?|parametric|3d[_-]?models?|models?|parts?|3mf[_-]?projects?|projects?|slicer[_-]?profiles?|profiles?|presets?|configs?|cnc[_-]?masters?|canonical|vault|__groupfolders\/\d+\/(?:cad|3dprint|additive|cnc|fab|manufacturing))(?:\/|$))/i
const EPHEMERAL_SPOOL_PATH_RE = /(\/(?:spool|print[_-]?spool|sd[_-]?card|sdcard|usb[_-]?stick|octoprint|mainsail|fluidd|klipper[_-]?gcodes?|bambu[_-]?cache|slicer[_-]?output|tmp|temp|scratch|staging|downloads?|telechargements?|inbox|incoming|exports?|trash[_-]?slices)(?:\/|$))/i

const MACHINE_PATTERNS = [
	{ re: /(?:^|[^a-z0-9])(?:bambu[_-]?(?:x1c|x1e|x1|p1s|p1p|a1|a1[_-]?mini)|bambulab|x1c|p1s|p1p)(?:$|[^a-z0-9])/i, label: 'Bambu Lab' },
	{ re: /(?:^|[^a-z0-9])(?:prusa[_-]?(?:mk4s?|mk3s?\+?|xl|mini)|mk4s?|mk3s)(?:$|[^a-z0-9])/i, label: 'Prusa' },
	{ re: /(?:^|[^a-z0-9])(?:voron[_-]?(?:2\.4|trident|0\.2|v0)|voron)(?:$|[^a-z0-9])/i, label: 'Voron' },
	{ re: /(?:^|[^a-z0-9])(?:elegoo[_-]?(?:saturn|mars|jupiter)|saturn\d*|mars\d*)(?:$|[^a-z0-9])/i, label: 'Elegoo SLA' },
	{ re: /(?:^|[^a-z0-9])(?:anycubic[_-]?(?:photon|mono)|photon[_-]?mono)(?:$|[^a-z0-9])/i, label: 'Anycubic SLA' },
	{ re: /(?:^|[^a-z0-9])(?:creality[_-]?(?:k1|ender)|ender[_-]?\d+)(?:$|[^a-z0-9])/i, label: 'Creality' },
	{ re: /(?:^|[^a-z0-9])(?:grbl|linuxcnc|fanuc|haas|shapeoko|xcarve|cnc[_-]?(?:3axis|4axis|5axis|router|mill))(?:$|[^a-z0-9])/i, label: 'CNC Mill/Router' },
]

const MATERIAL_PATTERNS = [
	{ re: /(?:^|[^a-z0-9])(pa12[_-]?cf|pa[_-]?cf|petg[_-]?cf|pla\+|pla|petg|abs|asa|tpu|nylon|pc|peek)(?:$|[^a-z0-9])/i },
	{ re: /(?:^|[^a-z0-9])(resin|waterwashable|tough[_-]?resin|abs[_-]?like|alu[_-]?\d{4}|6061|7075|brass|delrin|pom)(?:$|[^a-z0-9])/i },
]

const LAYER_NOZZLE_RE = /(?:^|[^a-z0-9])(0\.\d{1,3}mm|\d\.\d{1,2}n|nozzle[_-]?\d\.\d{1,2})(?:$|[^a-z0-9])/i
const PART_REVISION_RE = /(?:^|[._\s-])(?:v|rev|r|plate|bed|run)[._-]?(\d{1,4})(?:[._\s-]|$)/i

const IGNORED_PROJECT_SEGMENTS = new Set([
	'files',
	'3dprint',
	'3d-print',
	'3dprinting',
	'additive',
	'additive-mfg',
	'manufacturing',
	'cad',
	'cad-sources',
	'step',
	'step-masters',
	'sources',
	'masters',
	'master',
	'models',
	'meshes',
	'stl',
	'3mf',
	'3mf-projects',
	'gcode',
	'gcodes',
	'slices',
	'resin',
	'sla',
	'cnc',
	'toolpaths',
	'profiles',
	'slicer-profiles',
	'presets',
	'spool',
	'print-spool',
	'sd-card',
	'sdcard',
	'octoprint',
	'mainsail',
	'fluidd',
	'sliced',
	'exports',
	'staging',
	'downloads',
	'telechargements',
	'tmp',
	'temp',
	'scratch',
	'inbox',
	'incoming',
	'__groupfolders',
	'users',
	'home',
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
 * Extract lowercase file extension.
 *
 * @param {string} basename File basename.
 * @return {string} Lowercase extension without leading dot.
 */
function getExtension(basename) {
	if (!basename || typeof basename !== 'string') {
		return ''
	}
	const lower = basename.toLowerCase()
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
 * Normalize a 3D print, CAD, or CNC filename into a canonical model/part stem.
 * Strips slicer suffixes (layer height, filament, printer name, time estimate, copy/rev tags)
 * so STEP sources, STL meshes, and G-code/CTB slices of the same part correlate cleanly.
 *
 * @param {string} basename File basename.
 * @return {string} Canonical model/part stem.
 */
export function normalizeModelPartStem(basename) {
	if (!basename || typeof basename !== 'string') {
		return 'untitled-part'
	}
	let stem = basename.trim()
	const dotIdx = stem.lastIndexOf('.')
	if (dotIdx > 0) {
		stem = stem.slice(0, dotIdx)
	}

	let prev = ''
	while (prev !== stem) {
		prev = stem
		stem = stem.replace(
			/(?:\s*\(\d+\)|[._\s-]+(?:0\.\d{1,3}mm|\d\.\d{1,2}n|nozzle\d+|pla\+?|petg|abs|asa|tpu|resin|pa12cf|mk4s?|mk3s|x1c|p1s|p1p|a1mini|voron|saturn\d*|mars\d*|grbl|cnc|3axis|slice|sliced|plate\d*|bed\d*|\d+h\d+m|\d+m|copy|backup|bak|dup|duplicate|old|tmp|final|fixed|repaired|v\d+|rev\d+|r\d+))+$/gi,
			''
		)
	}

	stem = stem
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')

	return stem || 'additive-part'
}

/**
 * Extract project or assembly workspace name from path segments.
 *
 * @param {string} basename File basename.
 * @param {string} fullPath Full normalized path.
 * @return {string} Project workspace slug.
 */
export function extractAdditiveProjectWorkspace(basename, fullPath = '') {
	const segments = safeNormalizePath(fullPath).split('/').filter(Boolean)
	const dirSegments = segments.slice(0, -1)

	for (let i = dirSegments.length - 1; i >= 0; i -= 1) {
		const clean = dirSegments[i].toLowerCase()
		if (clean && !IGNORED_PROJECT_SEGMENTS.has(clean) && !/^\d+$/.test(clean)) {
			return clean.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'workshop'
		}
	}

	return normalizeModelPartStem(basename)
}

/**
 * Extract printer / CNC machine profile and slicer vendor metadata.
 *
 * @param {string} ext File extension.
 * @param {string} combinedContext Path + basename context.
 * @param {string} family Assigned additive family.
 * @return {object} Machine, slicer, spec, and material metadata.
 */
export function extractMachineAndSlicerMetadata(ext, combinedContext, family) {
	let machineProfile = 'Generic Additive'
	for (const entry of MACHINE_PATTERNS) {
		if (entry.re.test(combinedContext)) {
			machineProfile = entry.label
			break
		}
	}
	if (machineProfile === 'Generic Additive') {
		if (SLA_RESIN_SLICE_EXT_SET.has(ext)) {
			machineProfile = 'MSLA Resin Printer'
		} else if (CNC_TOOLPATH_EXT_SET.has(ext)) {
			machineProfile = 'CNC Mill/Router'
		} else if (family === 'cad-parametric-sources') {
			machineProfile = 'Parametric CAD'
		} else if (FDM_GCODE_EXT_SET.has(ext)) {
			machineProfile = 'FDM FFF Printer'
		}
	}

	let slicerVendor = 'Additive Vault'
	if (/orcaslicer|orca_printer|orca_filament|orca_process/i.test(combinedContext)) {
		slicerVendor = 'OrcaSlicer'
	} else if (/bambu|bambulab|\.bbl$/i.test(combinedContext)) {
		slicerVendor = 'Bambu Studio'
	} else if (/prusaslicer|prusa|bgcode|sl1s?|prusaprofile/i.test(combinedContext)) {
		slicerVendor = 'PrusaSlicer'
	} else if (/cura|curaprofile/i.test(combinedContext)) {
		slicerVendor = 'UltiMaker Cura'
	} else if (/chitubox|ctb|cbddlp/i.test(combinedContext)) {
		slicerVendor = 'Chitubox SLA'
	} else if (/lychee|\.goo$/i.test(combinedContext)) {
		slicerVendor = 'Lychee / Elegoo'
	} else if (/fusion|f3d|f3z/i.test(combinedContext)) {
		slicerVendor = 'Fusion 360'
	} else if (/freecad|fcstd/i.test(combinedContext)) {
		slicerVendor = 'FreeCAD'
	} else if (/openscad|scad/i.test(combinedContext)) {
		slicerVendor = 'OpenSCAD'
	} else if (CNC_TOOLPATH_EXT_SET.has(ext)) {
		slicerVendor = 'CAM Post-Processor'
	} else if (CAD_PARAMETRIC_EXT_SET.has(ext)) {
		slicerVendor = 'STEP / IGES Master'
	} else if (ext === '3mf') {
		slicerVendor = '3MF Project'
	} else if (ext === 'stl' || ext === 'obj') {
		slicerVendor = 'Mesh Geometry'
	}

	const specMatch = LAYER_NOZZLE_RE.exec(combinedContext)
	const layerOrNozzleSpec = specMatch
		? specMatch[1].toLowerCase()
		: (SLA_RESIN_SLICE_EXT_SET.has(ext)
			? '0.05mm SLA'
			: (CNC_TOOLPATH_EXT_SET.has(ext) ? 'CAM Toolpath' : (family === 'cad-parametric-sources' ? 'B-Rep Source' : 'Standard')))

	let materialTag = 'Unspecified'
	for (const mat of MATERIAL_PATTERNS) {
		const m = mat.re.exec(combinedContext)
		if (m) {
			materialTag = m[1].toUpperCase().replace(/_/g, '-')
			break
		}
	}

	return {
		machineProfile,
		slicerVendor,
		layerOrNozzleSpec,
		materialTag,
	}
}

/**
 * Parse revision or plate index from filename or path.
 *
 * @param {string} basename File basename.
 * @param {string} fullPath Full path.
 * @return {number} Parsed revision/plate number or 0.
 */
export function parsePartRevisionOrPlate(basename, fullPath = '') {
	const match = PART_REVISION_RE.exec(basename) || PART_REVISION_RE.exec(fullPath)
	if (!match) {
		return 0
	}
	const num = Number.parseInt(match[1], 10)
	return Number.isFinite(num) && num > 0 ? num : 0
}

/**
 * Format bytes as GB string with 2 decimals (e.g. "1.45 GB").
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
 * Classify a single file into one of the 4 Additive Manufacturing & CNC Vault families.
 *
 * @param {object} file Duplicate file entry.
 * @return {object|null} Classification metadata or null if unrelated.
 */
export function classifyAdditiveManufacturingFile(file) {
	if (!file || typeof file !== 'object') {
		return null
	}
	const path = safeNormalizePath(file.path || file.filePath || '')
	const basename = getBasename(path)
	if (!basename) {
		return null
	}
	const ext = getExtension(basename)
	if (!ext) {
		return null
	}
	const mtimeSec = normalizeMtimeSec(file.mtime)
	const combinedContext = `${path} ${basename}`

	const isCadSource = CAD_PARAMETRIC_EXT_SET.has(ext)
	const isMeshProject = MESH_PROJECT_EXT_SET.has(ext)
	const isFdmGcode = FDM_GCODE_EXT_SET.has(ext)
	const isSlaResinSlice = SLA_RESIN_SLICE_EXT_SET.has(ext)
	const isCncToolpath = CNC_TOOLPATH_EXT_SET.has(ext)
	const isToolpathOrSlice = isFdmGcode || isSlaResinSlice || isCncToolpath

	const hasSlicerProfileSignal = SLICER_PROFILE_SIGNAL_RE.test(combinedContext)
	const hasAdditiveContext = ADDITIVE_CONTEXT_RE.test(combinedContext)
	const isSlicerProfile = SLICER_PROFILE_EXT_SET.has(ext)
		|| (SLICER_CONFIG_GENERIC_EXT_SET.has(ext) && (hasSlicerProfileSignal || (hasAdditiveContext && /profile|preset|printer|filament|process|config/i.test(combinedContext))))

	if (!isCadSource && !isMeshProject && !isToolpathOrSlice && !isSlicerProfile) {
		return null
	}

	let family = 'meshes-3mf-projects'
	let artifactKind = 'mesh-duplicate'
	let artifactKindBadge = 'Mesh Duplicate'
	let formatBadge = `.${ext.toUpperCase()}`

	if (isCadSource) {
		family = 'cad-parametric-sources'
		artifactKind = 'cad-master-source'
		artifactKindBadge = 'CAD/STEP Source'
		formatBadge = `CAD .${ext.toUpperCase()}`
	} else if (isToolpathOrSlice) {
		family = 'toolpaths-resin-slices'
		artifactKind = 'ephemeral-slice'
		if (isSlaResinSlice) {
			artifactKindBadge = 'SLA Resin Slice'
			formatBadge = `SLA .${ext.toUpperCase()}`
		} else if (isCncToolpath) {
			artifactKindBadge = 'CNC Toolpath'
			formatBadge = `CNC .${ext.toUpperCase()}`
		} else {
			artifactKindBadge = 'Ephemeral G-code'
			formatBadge = `G-code .${ext.toUpperCase()}`
		}
	} else if (isSlicerProfile) {
		family = 'slicer-profiles-presets'
		artifactKind = 'slicer-profile'
		artifactKindBadge = 'Slicer Profile'
		formatBadge = `Preset .${ext.toUpperCase()}`
	} else if (ext === '3mf') {
		artifactKind = 'mesh-3mf-project'
		artifactKindBadge = '3MF Print Project'
		formatBadge = '3MF Project'
	} else {
		formatBadge = `Mesh .${ext.toUpperCase()}`
	}

	const modelPartStem = normalizeModelPartStem(basename)
	const projectWorkspace = extractAdditiveProjectWorkspace(basename, path)
	const revisionOrPlate = parsePartRevisionOrPlate(basename, path)
	const machineMeta = extractMachineAndSlicerMetadata(ext, combinedContext, family)

	const isProductionPlate = PRODUCTION_PLATE_PATH_RE.test(combinedContext)
	const inEphemeralSpool = EPHEMERAL_SPOOL_PATH_RE.test(path)
	const inCanonicalSource = CANONICAL_SOURCE_PATH_RE.test(path) && !inEphemeralSpool
	const is3mfProject = ext === '3mf'

	const vaultKey = `${projectWorkspace}/${modelPartStem}`

	return {
		path,
		dirname: getDirname(path),
		basename,
		ext,
		family,
		artifactKind,
		artifactKindBadge,
		formatBadge,
		modelPartStem,
		projectWorkspace,
		revisionOrPlate,
		machineProfile: machineMeta.machineProfile,
		slicerVendor: machineMeta.slicerVendor,
		layerOrNozzleSpec: machineMeta.layerOrNozzleSpec,
		materialTag: machineMeta.materialTag,
		mtimeSec,
		isCadSource,
		isMeshProject,
		is3mfProject,
		isFdmGcode,
		isSlaResinSlice,
		isCncToolpath,
		isToolpathOrSlice,
		isSlicerProfile,
		isProductionPlate,
		inCanonicalSource,
		inEphemeralSpool,
		vaultKey,
	}
}

/**
 * Compute reference timestamp from duplicate groups for deterministic age calculations.
 *
 * @param {Array<object>} duplicateGroups Raw duplicate groups.
 * @return {number} Reference timestamp in epoch seconds.
 */
function resolveReferenceNowSec(duplicateGroups) {
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
		}
	}
	return maxMtimeSec > 0 ? maxMtimeSec : Math.floor(Date.now() / 1000)
}

/**
 * Score a file copy's authority as canonical additive manufacturing survivor (0-100).
 *
 * @param {object} member Classified file member.
 * @param {string} survivorRule Selected survivor rule.
 * @return {number} Authority score 0-100.
 */
function computeMemberAuthorityScore(member, survivorRule) {
	let score = 40

	if (member.meta.isProductionPlate) {
		score += 34
	}
	if (member.meta.isCadSource) {
		score += 30
	}
	if (member.meta.isSlicerProfile || member.meta.is3mfProject) {
		score += 18
	}
	if (member.meta.inCanonicalSource) {
		score += 22
	}
	if (member.meta.inEphemeralSpool) {
		score -= 30
	}
	if (member.meta.isToolpathOrSlice && !member.meta.isProductionPlate && !member.meta.inCanonicalSource) {
		score -= 12
	}
	if (member.isInOriginFolder) {
		score += 18
	}

	if (survivorRule === 'slicer-3mf-project-first') {
		if (member.meta.is3mfProject || member.meta.isSlicerProfile) {
			score += 20
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
	if (a.meta.isProductionPlate !== b.meta.isProductionPlate) {
		return a.meta.isProductionPlate ? -1 : 1
	}
	if (survivorRule === 'slicer-3mf-project-first') {
		const a3mf = a.meta.is3mfProject || a.meta.isSlicerProfile
		const b3mf = b.meta.is3mfProject || b.meta.isSlicerProfile
		if (a3mf !== b3mf) {
			return a3mf ? -1 : 1
		}
	}
	if (a.meta.isCadSource !== b.meta.isCadSource) {
		return a.meta.isCadSource ? -1 : 1
	}
	if (a.meta.inCanonicalSource !== b.meta.inCanonicalSource) {
		return a.meta.inCanonicalSource ? -1 : 1
	}
	if (a.meta.inEphemeralSpool !== b.meta.inEphemeralSpool) {
		return a.meta.inEphemeralSpool ? 1 : -1
	}
	if (survivorRule === 'shortest-path' && a.meta.path.length !== b.meta.path.length) {
		return a.meta.path.length - b.meta.path.length
	}
	if (a.authorityScore !== b.authorityScore) {
		return b.authorityScore - a.authorityScore
	}
	if (a.mtimeSec !== b.mtimeSec) {
		return b.mtimeSec - a.mtimeSec
	}
	return a.meta.path.localeCompare(b.meta.path)
}

/**
 * Analyze duplicate groups for 3D Printing, CNC & Additive Manufacturing Vault governance.
 *
 * @param {Array<object>} duplicateGroups Array of duplicate group objects.
 * @param {object} [options] Analysis configuration options.
 * @return {object} Deterministic audit report.
 */
export function analyzeAdditiveManufacturingVault(duplicateGroups, options = {}) {
	const groups = Array.isArray(duplicateGroups) ? duplicateGroups.filter(Boolean) : []
	const familyFilter = ADDITIVE_MFG_FAMILIES.includes(options.familyFilter) ? options.familyFilter : 'all'
	const verdictFilter = ADDITIVE_MFG_VERDICT_FILTERS.includes(options.verdictFilter) ? options.verdictFilter : 'all'
	const sortMode = ADDITIVE_MFG_SORT_MODES.includes(options.sortMode) ? options.sortMode : 'reclaim_desc'
	const strategy = ADDITIVE_MFG_STRATEGIES.includes(options.strategy)
		? options.strategy
		: 'prune-ephemeral-slices-keep-cad'
	const survivorRule = ADDITIVE_MFG_SURVIVOR_RULES.includes(options.survivorRule)
		? options.survivorRule
		: 'cad-step-source-first'

	const protectCadStepSources = options.protectCadStepSources !== false
	const protectSlicerProfiles = options.protectSlicerProfiles !== false
	const protectProductionPlates = options.protectProductionPlates !== false
	const staleSliceDays = Number.isFinite(Number(options.staleSliceDays)) && Number(options.staleSliceDays) >= 0
		? Number(options.staleSliceDays)
		: 7
	const minSizeMb = Number.isFinite(Number(options.minSizeMb)) && Number(options.minSizeMb) > 0
		? Number(options.minSizeMb)
		: 0
	const minSizeBytes = minSizeMb * 1024 * 1024
	const searchQuery = typeof options.searchQuery === 'string' ? options.searchQuery.trim().toLowerCase() : ''
	const memberOverrides = options.memberOverrides && typeof options.memberOverrides === 'object'
		? options.memberOverrides
		: {}

	const referenceNowSec = Number.isFinite(Number(options.referenceNowSec)) && Number(options.referenceNowSec) > 0
		? Number(options.referenceNowSec)
		: resolveReferenceNowSec(groups)

	const preClassifiedGroups = []
	const cadStemsPresent = new Set()
	const meshStemsPresent = new Set()

	for (const group of groups) {
		const files = Array.isArray(group.files) ? group.files.filter(Boolean) : []
		if (files.length < 2) {
			continue
		}

		const classifiedMembers = []
		for (const file of files) {
			const meta = classifyAdditiveManufacturingFile(file)
			if (!meta) {
				continue
			}
			if (meta.isCadSource) {
				cadStemsPresent.add(meta.modelPartStem)
			}
			if (meta.isMeshProject) {
				meshStemsPresent.add(meta.modelPartStem)
			}
			const size = Number.isFinite(Number(file.size)) && Number(file.size) > 0
				? Number(file.size)
				: (Number.isFinite(Number(group.size)) ? Number(group.size) : 0)
			const mtimeSec = normalizeMtimeSec(file.mtime)
			const ageDays = mtimeSec > 0 ? Math.max(0, Math.round(((referenceNowSec - mtimeSec) / 86400) * 10) / 10) : 0
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
				meta,
				authorityScore: 0,
				verdict: 'keep-canonical-survivor',
				verdictReason: '',
				actionType: 'keep',
			}
			member.authorityScore = computeMemberAuthorityScore(member, survivorRule)
			classifiedMembers.push(member)
		}

		if (classifiedMembers.length >= 2) {
			preClassifiedGroups.push({ group, files, classifiedMembers })
		}
	}

	const allClusters = []

	for (const entry of preClassifiedGroups) {
		const { group, files, classifiedMembers } = entry
		classifiedMembers.sort((a, b) => compareSurvivorCandidates(a, b, survivorRule))
		const survivor = classifiedMembers[0]
		const primaryMeta = survivor.meta
		const family = primaryMeta.family
		const familyMeta = ADDITIVE_MFG_FAMILY_META[family] || ADDITIVE_MFG_FAMILY_META['meshes-3mf-projects']

		const hasCadSourceInCluster = classifiedMembers.some(m => m.meta.isCadSource)
		const hasCadSourceInVault = hasCadSourceInCluster || cadStemsPresent.has(primaryMeta.modelPartStem)
		const hasMeshSourceInVault = family === 'meshes-3mf-projects' || meshStemsPresent.has(primaryMeta.modelPartStem)
		const hasProductionPlate = classifiedMembers.some(m => m.meta.isProductionPlate)
		const hasSlicerProfile = classifiedMembers.some(m => m.meta.isSlicerProfile)
		const hasSlaResinSlice = classifiedMembers.some(m => m.meta.isSlaResinSlice)
		const hasCncToolpath = classifiedMembers.some(m => m.meta.isCncToolpath)

		let duplicationClass = 'mesh-duplicate'
		let duplicationBadge = 'Mesh Duplicate'
		let sliceLineageBadge = 'Mesh Geometry Cluster'

		if (family === 'cad-parametric-sources') {
			duplicationClass = 'cad-source'
			duplicationBadge = 'CAD/STEP Master'
			sliceLineageBadge = 'Parametric Source Vault'
		} else if (family === 'slicer-profiles-presets') {
			duplicationClass = 'slicer-profile'
			duplicationBadge = 'Slicer Profile'
			sliceLineageBadge = 'Machine / Filament Preset'
		} else if (family === 'toolpaths-resin-slices') {
			duplicationClass = 'regenerated-slice'
			duplicationBadge = hasSlaResinSlice
				? 'Ephemeral SLA Slice'
				: (hasCncToolpath ? 'CNC Toolpath Copy' : 'Regenerated G-code')
			if (hasCadSourceInVault) {
				sliceLineageBadge = 'Regenerable from CAD/STEP'
			} else if (hasMeshSourceInVault) {
				sliceLineageBadge = 'Regenerable from STL/3MF'
			} else {
				sliceLineageBadge = 'Orphan Slice (No CAD/Mesh)'
			}
		} else {
			duplicationClass = 'mesh-duplicate'
			duplicationBadge = primaryMeta.is3mfProject ? '3MF Project Duplicate' : 'Mesh Duplicate'
			sliceLineageBadge = hasCadSourceInVault ? 'CAD/STEP Source Present' : 'Mesh Geometry Only'
		}

		let reclaimableBytes = 0
		let reclaimableCopiesCount = 0
		let consolidatableCopiesCount = 0
		let shieldedCopiesCount = 0

		classifiedMembers.forEach((member, idx) => {
			const override = memberOverrides[member.selectionKey] || 'auto'

			if (idx === 0) {
				member.verdict = 'keep-canonical-survivor'
				member.actionType = 'keep'
				if (member.meta.isProductionPlate) {
					member.verdictReason = 'Validated production plate / fixture-locked survivor'
				} else if (member.meta.isCadSource) {
					member.verdictReason = `Canonical CAD/STEP source (${member.meta.formatBadge})`
				} else if (member.meta.isSlicerProfile) {
					member.verdictReason = `Canonical ${member.meta.slicerVendor} preset anchor`
				} else if (member.meta.inCanonicalSource) {
					member.verdictReason = `Primary ${member.meta.projectWorkspace} vault anchor`
				} else {
					member.verdictReason = 'Highest-authority additive manufacturing survivor'
				}
				shieldedCopiesCount += 1
				return
			}

			if (override === 'keep') {
				member.verdict = 'blocked-manual-shield'
				member.actionType = 'keep'
				member.verdictReason = 'Manually shielded by fabrication engineer'
				shieldedCopiesCount += 1
				return
			}

			if (override === 'prune') {
				member.verdict = strategy === 'consolidate-mesh-hardlinks'
					? 'consolidate-hardlink-mesh-asset'
					: 'reclaim-duplicate-additive-asset'
				member.actionType = strategy === 'consolidate-mesh-hardlinks' ? 'hardlink' : 'prune'
				member.verdictReason = 'Engineer override: marked for controlled remediation'
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

			if (protectProductionPlates && member.meta.isProductionPlate) {
				member.verdict = 'blocked-production-plate'
				member.actionType = 'keep'
				member.verdictReason = `Production plate / golden toolpath locked (${member.meta.machineProfile})`
				shieldedCopiesCount += 1
				return
			}

			if (protectCadStepSources && member.meta.isCadSource && strategy !== 'consolidate-mesh-hardlinks') {
				member.verdict = 'blocked-cad-step-source'
				member.actionType = 'keep'
				member.verdictReason = `CAD/STEP source conservation active (${member.meta.formatBadge})`
				shieldedCopiesCount += 1
				return
			}

			if (protectSlicerProfiles && (member.meta.isSlicerProfile || (member.meta.is3mfProject && member.meta.inCanonicalSource)) && strategy !== 'consolidate-mesh-hardlinks') {
				member.verdict = 'blocked-slicer-profile'
				member.actionType = 'keep'
				member.verdictReason = `${member.meta.slicerVendor} profile / 3MF project preserved`
				shieldedCopiesCount += 1
				return
			}

			if (
				member.meta.inEphemeralSpool
				&& !member.meta.isProductionPlate
				&& member.ageDays < staleSliceDays
				&& strategy === 'prune-spool-prints-only'
			) {
				member.verdict = 'blocked-recent-spool'
				member.actionType = 'keep'
				member.verdictReason = `Recent print spool file (${member.ageDays}d < ${staleSliceDays}d window)`
				shieldedCopiesCount += 1
				return
			}

			if (strategy === 'consolidate-mesh-hardlinks') {
				member.verdict = 'consolidate-hardlink-mesh-asset'
				member.actionType = 'hardlink'
				member.verdictReason = `Hardlink-consolidate onto ${survivor.basename} canonical anchor`
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				consolidatableCopiesCount += 1
				return
			}

			if (strategy === 'prune-spool-prints-only') {
				if (member.meta.inEphemeralSpool && member.meta.isToolpathOrSlice) {
					member.verdict = member.meta.isSlaResinSlice
						? 'reclaim-ephemeral-sla-slice'
						: (member.meta.isCncToolpath ? 'reclaim-ephemeral-cnc-toolpath' : 'reclaim-ephemeral-gcode')
					member.actionType = 'prune'
					member.verdictReason = 'Stale ephemeral slice/toolpath in spool or SD-card staging'
					reclaimableBytes += member.size
					reclaimableCopiesCount += 1
					return
				}
				member.verdict = 'blocked-strategy-scope'
				member.actionType = 'keep'
				member.verdictReason = 'Outside spool & SD-card cleanup scope'
				shieldedCopiesCount += 1
				return
			}

			if (member.meta.isToolpathOrSlice) {
				member.verdict = member.meta.isSlaResinSlice
					? 'reclaim-ephemeral-sla-slice'
					: (member.meta.isCncToolpath ? 'reclaim-ephemeral-cnc-toolpath' : 'reclaim-ephemeral-gcode')
				member.actionType = 'prune'
				member.verdictReason = hasCadSourceInVault
					? 'Ephemeral slice copy (CAD/STEP master preserved in vault)'
					: 'Redundant slice/toolpath copy outside survivor anchor'
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				return
			}

			if (member.meta.isMeshProject) {
				member.verdict = 'reclaim-duplicate-mesh'
				member.actionType = 'prune'
				member.verdictReason = member.meta.inEphemeralSpool
					? 'Redundant mesh export in downloads/staging folder'
					: 'Duplicate STL/3MF/OBJ mesh copy outside canonical project'
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				return
			}

			if (member.meta.isSlicerProfile) {
				member.verdict = 'reclaim-duplicate-profile'
				member.actionType = 'prune'
				member.verdictReason = `Redundant ${member.meta.slicerVendor} preset outside profile guard`
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				return
			}

			member.verdict = 'reclaim-duplicate-cad-copy'
			member.actionType = 'prune'
			member.verdictReason = 'Duplicate CAD copy outside conservation guard'
			reclaimableBytes += member.size
			reclaimableCopiesCount += 1
		})

		const rawInfo = computeGroupReclaimableInfo({ ...group, files })
		const rawDuplicateBytes = rawInfo.reclaimableBytes || Math.max(0, (classifiedMembers.length - 1) * survivor.size)

		let riskState = 'reclaimable'
		let riskPriority = 2
		if (reclaimableCopiesCount === 0) {
			if (hasProductionPlate) {
				riskState = 'production-plate-locked'
				riskPriority = 6
			} else if (hasCadSourceInCluster) {
				riskState = 'cad-source-protected'
				riskPriority = 5
			} else if (hasSlicerProfile) {
				riskState = 'slicer-profile-protected'
				riskPriority = 4
			} else {
				riskState = 'shielded'
				riskPriority = 3
			}
		} else if (consolidatableCopiesCount > 0) {
			riskState = 'consolidatable'
			riskPriority = 3
		} else if (duplicationClass === 'regenerated-slice') {
			riskState = 'ephemeral-slice-reclaimable'
			riskPriority = 5
		}

		allClusters.push({
			groupKey: `${group.id ?? group.hash ?? primaryMeta.vaultKey}::${primaryMeta.vaultKey}`,
			primaryGroupId: group.id ?? null,
			hash: group.hash || '',
			family,
			familyLabel: familyMeta.label,
			familyShortLabel: familyMeta.shortLabel,
			projectWorkspace: primaryMeta.projectWorkspace,
			modelPartStem: primaryMeta.modelPartStem,
			machineProfile: primaryMeta.machineProfile,
			slicerVendor: primaryMeta.slicerVendor,
			layerOrNozzleSpec: primaryMeta.layerOrNozzleSpec,
			materialTag: primaryMeta.materialTag,
			revisionOrPlate: primaryMeta.revisionOrPlate,
			revisionLabel: primaryMeta.revisionOrPlate > 0 ? `v/plate #${primaryMeta.revisionOrPlate}` : 'canonical',
			formatBadge: primaryMeta.formatBadge,
			duplicationClass,
			duplicationBadge,
			sliceLineageBadge,
			hasCadSourceInVault,
			hasMeshSourceInVault,
			hasCadSourceInCluster,
			hasProductionPlate,
			hasSlicerProfile,
			hasSlaResinSlice,
			hasCncToolpath,
			vaultKey: primaryMeta.vaultKey,
			displayName: survivor.basename,
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

	const familyBreakdown = Object.keys(ADDITIVE_MFG_FAMILY_META).map(famId => {
		const famClusters = allClusters.filter(c => c.family === famId)
		const famReclaim = famClusters.reduce((acc, c) => acc + c.reclaimableBytes, 0)
		return {
			id: famId,
			label: ADDITIVE_MFG_FAMILY_META[famId].label,
			shortLabel: ADDITIVE_MFG_FAMILY_META[famId].shortLabel,
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
			if (verdictFilter === 'mesh-duplicates' && cluster.duplicationClass !== 'mesh-duplicate') {
				return false
			}
			if (verdictFilter === 'regenerated-slices' && cluster.duplicationClass !== 'regenerated-slice') {
				return false
			}
			if (verdictFilter === 'cad-sources' && cluster.family !== 'cad-parametric-sources') {
				return false
			}
			if (verdictFilter === 'slicer-profiles' && cluster.family !== 'slicer-profiles-presets') {
				return false
			}
			if (verdictFilter === 'sla-resin' && !cluster.hasSlaResinSlice) {
				return false
			}
			if (verdictFilter === 'cnc-toolpaths' && !cluster.hasCncToolpath) {
				return false
			}
			if (verdictFilter === 'shielded' && cluster.reclaimableCopiesCount > 0) {
				return false
			}
		}
		if (searchQuery) {
			const haystack = [
				cluster.projectWorkspace,
				cluster.modelPartStem,
				cluster.machineProfile,
				cluster.slicerVendor,
				cluster.layerOrNozzleSpec,
				cluster.materialTag,
				cluster.duplicationBadge,
				cluster.sliceLineageBadge,
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
		if (sortMode === 'ephemeral_risk_desc') {
			const classWeight = {
				'regenerated-slice': 4,
				'mesh-duplicate': 3,
				'slicer-profile': 2,
				'cad-source': 1,
			}
			const diff = (classWeight[b.duplicationClass] || 0) - (classWeight[a.duplicationClass] || 0)
			if (diff !== 0) {
				return diff
			}
			if (a.riskPriority !== b.riskPriority) {
				return b.riskPriority - a.riskPriority
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
	const totalMeshDuplicateClusters = filteredClusters.filter(c => c.duplicationClass === 'mesh-duplicate').length
	const totalRegeneratedSliceClusters = filteredClusters.filter(c => c.duplicationClass === 'regenerated-slice').length
	const totalCadSourceClusters = filteredClusters.filter(c => c.family === 'cad-parametric-sources').length
	const totalProfileClusters = filteredClusters.filter(c => c.family === 'slicer-profiles-presets').length
	const totalSlaResinClusters = filteredClusters.filter(c => c.hasSlaResinSlice).length
	const totalCncToolpathClusters = filteredClusters.filter(c => c.hasCncToolpath).length
	const distinctModelPartsCount = new Set(filteredClusters.map(c => c.modelPartStem)).size
	const efficiencyPct = totalRawDuplicateBytes > 0
		? Math.min(100, Math.round((totalReclaimableBytes / totalRawDuplicateBytes) * 100))
		: 0

	return {
		schema: ADDITIVE_MFG_VAULT_SCHEMA,
		generatedAt: new Date(referenceNowSec * 1000).toISOString(),
		options: {
			familyFilter,
			verdictFilter,
			sortMode,
			strategy,
			survivorRule,
			protectCadStepSources,
			protectSlicerProfiles,
			protectProductionPlates,
			staleSliceDays,
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
			totalMeshDuplicateClusters,
			totalRegeneratedSliceClusters,
			totalCadSourceClusters,
			totalProfileClusters,
			totalSlaResinClusters,
			totalCncToolpathClusters,
			distinctModelPartsCount,
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
 * Build a safe POSIX DRY_RUN=1 remediation script for 3D Printing, CNC & Additive Vault cleanup.
 *
 * @param {object} analysis Output of analyzeAdditiveManufacturingVault.
 * @param {object} [options] Script generation options.
 * @return {string} POSIX shell script.
 */
export function buildAdditiveMfgRemediationScript(analysis, options = {}) {
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
		'# DuplicateFinder 3D Printing, CNC & Additive Manufacturing Vault Remediation Script',
		`# Schema: ${ADDITIVE_MFG_VAULT_SCHEMA}`,
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
		lines.push(`# Additive Vault: ${cluster.vaultKey} [${cluster.duplicationBadge} / ${cluster.machineProfile}] (${cluster.formattedReclaimableBytes})`)
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
		lines.push('# No actionable ephemeral slices or redundant mesh copies under current CAD/STEP & profile guards.')
	} else {
		lines.push('# After applying with DRY_RUN=0, refresh Nextcloud filecache:')
		lines.push('# sudo -u www-data php /var/www/nextcloud/occ files:scan --all')
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe CSV audit report.
 *
 * @param {object} analysis Output of analyzeAdditiveManufacturingVault.
 * @return {string} CSV content.
 */
export function buildAdditiveMfgCsvReport(analysis) {
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const headers = [
		'ProjectWorkspace',
		'ModelPartStem',
		'DuplicationClass',
		'SliceLineage',
		'MachineProfile',
		'SlicerVendor',
		'LayerOrNozzleSpec',
		'MaterialTag',
		'Family',
		'Format',
		'CadStepSourcePresent',
		'ProductionPlateGuard',
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
				cluster.projectWorkspace,
				cluster.modelPartStem,
				cluster.duplicationClass,
				cluster.sliceLineageBadge,
				cluster.machineProfile,
				cluster.slicerVendor,
				cluster.layerOrNozzleSpec,
				cluster.materialTag,
				cluster.family,
				member.meta.formatBadge,
				cluster.hasCadSourceInVault ? 'yes' : 'no',
				member.meta.isProductionPlate ? 'yes' : 'no',
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
 * @param {object} analysis Output of analyzeAdditiveManufacturingVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildAdditiveMfgJsonReport(analysis) {
	const payload = {
		schema: ADDITIVE_MFG_VAULT_SCHEMA,
		generatedAt: analysis && analysis.generatedAt ? analysis.generatedAt : new Date().toISOString(),
		options: analysis ? analysis.options : {},
		summary: analysis ? analysis.summary : {},
		familyBreakdown: analysis ? analysis.familyBreakdown : [],
		clusters: (analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []).map(cluster => ({
			groupKey: cluster.groupKey,
			primaryGroupId: cluster.primaryGroupId,
			hash: cluster.hash,
			projectWorkspace: cluster.projectWorkspace,
			modelPartStem: cluster.modelPartStem,
			machineProfile: cluster.machineProfile,
			slicerVendor: cluster.slicerVendor,
			layerOrNozzleSpec: cluster.layerOrNozzleSpec,
			materialTag: cluster.materialTag,
			family: cluster.family,
			formatBadge: cluster.formatBadge,
			duplicationClass: cluster.duplicationClass,
			duplicationBadge: cluster.duplicationBadge,
			sliceLineageBadge: cluster.sliceLineageBadge,
			hasCadSourceInVault: cluster.hasCadSourceInVault,
			hasMeshSourceInVault: cluster.hasMeshSourceInVault,
			hasProductionPlate: cluster.hasProductionPlate,
			riskState: cluster.riskState,
			reclaimableBytes: cluster.reclaimableBytes,
			reclaimableGb: cluster.reclaimableGb,
			rawDuplicateBytes: cluster.rawDuplicateBytes,
			members: (cluster.members || []).map(m => ({
				path: m.path,
				size: m.size,
				artifactKind: m.meta.artifactKind,
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
 * Build a Nextcloud desktop client .sync-exclude.lst snippet for transient slicer caches and partial G-code/SLA spool transfers.
 *
 * @param {object} analysis Output of analyzeAdditiveManufacturingVault.
 * @return {string} Sync exclude rules.
 */
export function buildAdditiveMfgSyncExcludeSnippet(analysis) {
	const sliceCount = analysis && analysis.summary ? analysis.summary.totalRegeneratedSliceClusters : 0
	const meshCount = analysis && analysis.summary ? analysis.summary.totalMeshDuplicateClusters : 0
	return [
		'# DuplicateFinder 3D Printing, CNC & Additive Manufacturing Sync Exclusions',
		`# Detected mesh clusters: ${meshCount} | Ephemeral slice/toolpath clusters: ${sliceCount}`,
		'*.gcode.tmp',
		'*.bgcode.part',
		'*.ctb.tmp',
		'*.goo.part',
		'*.3mf.bak',
		'*.stl.tmp',
		'PrusaSlicer/cache/*',
		'BambuStudio/cache/*',
		'OrcaSlicer/cache/*',
		'octoprint_spool/*.tmp',
		'mainsail_tmp/*',
		'Thumbs.db',
		'.DS_Store',
	].join('\n')
}
