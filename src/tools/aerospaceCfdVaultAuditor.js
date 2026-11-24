/**
 * Pure Aerospace, CFD & Finite Element Simulation (FEA) Vault Auditor.
 * Classifies and audits duplicate clusters across 4 Aerospace, CFD & FEA Vault families:
 * - CAD Geometry, Mesh & Boundary Decks (.cgns, .cas.h5, .cas.gz, .msh.gz, .inp, .bdf, .nas, .dyn, .k, .step, .stp, .iges, .su2, .foam)
 * - Solver Checkpoints & Field Archives (.dat.h5, .dat.gz, .h5, .hdf5, .xdmf, .vtu.gz, .odb.gz, .rst.gz, .d3plot.gz, .pvd, .vtm, .f06, .op2)
 * - Uncompressed Raw Results & Volumetric Dumps (.vtk, .vtu, .vtp, .vtr, .vts, .plt, .szplt, .odb, .rst, .d3plot, context .dat/.cas/.msh)
 * - CFD/FEA Scratch, Parallel Partitions & Restart Logs (processor0/, fluent_tmp/, ansys_tmp/, abaqus_tmp/, nastran_scratch/, starccm_tmp/, paraview_cache/, .lck, .trn)
 *
 * Enforces strict flight-certification, input-deck, and compressed HDF5/CGNS preservation defaults:
 * - Strictly conserves CAD geometry, solver input decks (.inp/.bdf/.nas/.k/.cgns/.cas.h5/.msh.gz), and boundary conditions
 * - Strictly conserves compressed HDF5/CGNS/Gzip solver checkpoints (.dat.h5, .dat.gz, .h5, .xdmf, .vtu.gz, .odb.gz, .rst.gz)
 * - Strictly conserves flight-certification, wind-tunnel, and convergence validation baselines (cert/, wind_tunnel/, .f06/.op2/.pch)
 * - Detects redundant uncompressed .vtk/.vtu/.plt/.dat/.cas/.msh/.odb/.rst dumps when a verified compressed archive anchor exists
 * - Blocks deletion of uncompressed result dumps lacking a verified compressed anchor when guard is active
 * - Blocks hardlinks on mutable input decks, active solver restarts, uncompressed dumps, and CFD/FEA scratch
 *
 * Generates DRY_RUN=1 POSIX remediation scripts, CWE-1236-safe CSV reports, JSON audit
 * manifests, and .sync-exclude.lst rules. Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const AEROSPACE_CFD_VAULT_SCHEMA = 'duplicatefinder.aerospace-cfd-vault-auditor.v1'

export const AEROSPACE_CFD_FAMILIES = Object.freeze([
	'all',
	'cad-mesh-boundary',
	'solver-checkpoints-fields',
	'uncompressed-raw-results',
	'cfd-fea-scratch-restart',
])

export const AEROSPACE_CFD_FAMILY_META = Object.freeze({
	'cad-mesh-boundary': {
		id: 'cad-mesh-boundary',
		label: 'CAD, Mesh & Decks',
		shortLabel: 'Mesh & Decks (.cgns, .cas.h5, .msh.gz, .inp, .bdf, .k, .step)',
	},
	'solver-checkpoints-fields': {
		id: 'solver-checkpoints-fields',
		label: 'HDF5 & Checkpoints',
		shortLabel: 'Checkpoints (.dat.h5, .dat.gz, .h5, .xdmf, .vtu.gz, .odb.gz, .rst.gz)',
	},
	'uncompressed-raw-results': {
		id: 'uncompressed-raw-results',
		label: 'Raw VTK / ODB / DAT',
		shortLabel: 'Raw Results (.vtk, .vtu, .plt, .odb, .rst, .dat, .cas, .msh)',
	},
	'cfd-fea-scratch-restart': {
		id: 'cfd-fea-scratch-restart',
		label: 'CFD/FEA Scratch',
		shortLabel: 'Scratch (processor0/, fluent_tmp/, abaqus_tmp/, nastran_scratch/, .lck)',
	},
})

export const AEROSPACE_CFD_STRATEGIES = Object.freeze([
	'prune-uncompressed-dumps-and-cfd-scratch',
	'hardlink-immutable-meshes-and-hdf5',
	'quarantine-uncompressed-dumps-and-scratch',
])

export const AEROSPACE_CFD_SURVIVOR_RULES = Object.freeze([
	'archive-vault-h5-first',
	'oldest-solver-run-first',
	'newest-mesh-revision-first',
	'shortest-path',
])

export const AEROSPACE_CFD_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'deck-geometry-protected',
	'checkpoint-hdf5-protected',
	'flight-cert-protected',
	'uncompressed-vtk-odb-redundant',
	'cfd-fea-scratch-intermediate',
	'shielded',
])

export const AEROSPACE_CFD_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const AEROSPACE_CFD_PRESETS = Object.freeze([
	{
		id: 'all-aerospace-cfd-audit',
		name: 'All Aerospace, CFD & FEA Vaults',
		description: 'Audit CAD/CGNS meshes, NASTRAN/Abaqus/LS-DYNA decks, compressed HDF5/CGNS checkpoints, raw VTK/ODB/DAT dumps, and OpenFOAM/Fluent scratch while conserving flight-cert baselines.',
		familyFilter: 'all',
		strategy: 'prune-uncompressed-dumps-and-cfd-scratch',
		survivorRule: 'archive-vault-h5-first',
		protectGeometryAndInputDecks: true,
		protectCompressedCheckpoints: true,
		protectConvergenceAndFlightCert: true,
		requireCompressedAnchorForPrune: true,
		keepRecentSolverRunDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'cfd-fea-scratch-partitions-cleanup',
		name: 'CFD Scratch & Parallel Partitions',
		description: 'Reclaim redundant processor0..N/ OpenFOAM decompositions, fluent_tmp/, abaqus_tmp/, nastran_scratch/, and paraview_cache/ older than the active solver grace window.',
		familyFilter: 'all',
		strategy: 'prune-uncompressed-dumps-and-cfd-scratch',
		survivorRule: 'archive-vault-h5-first',
		protectGeometryAndInputDecks: true,
		protectCompressedCheckpoints: true,
		protectConvergenceAndFlightCert: true,
		requireCompressedAnchorForPrune: true,
		keepRecentSolverRunDays: 14,
		minSizeKb: 0,
	},
	{
		id: 'redundant-vtk-dat-vs-hdf5-audit',
		name: 'Redundant .vtk/.vtu/.dat vs .h5/.gz',
		description: 'Detect uncompressed .vtk, .vtu, .plt, .dat, .cas, and .msh CFD dumps backed by a verified compressed .dat.h5, .dat.gz, .cas.h5, .msh.gz, or .vtu.gz archive anchor.',
		familyFilter: 'uncompressed-raw-results',
		strategy: 'quarantine-uncompressed-dumps-and-scratch',
		survivorRule: 'archive-vault-h5-first',
		protectGeometryAndInputDecks: true,
		protectCompressedCheckpoints: true,
		protectConvergenceAndFlightCert: true,
		requireCompressedAnchorForPrune: true,
		keepRecentSolverRunDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'fea-odb-rst-vs-compressed-audit',
		name: 'FEA .odb/.rst/.cas vs .gz/.h5',
		description: 'Audit uncompressed Abaqus .odb, ANSYS .rst, LS-DYNA .d3plot, and Fluent .cas/.dat results paired with compressed .odb.gz, .rst.gz, or .h5 archival anchors.',
		familyFilter: 'all',
		strategy: 'quarantine-uncompressed-dumps-and-scratch',
		survivorRule: 'archive-vault-h5-first',
		protectGeometryAndInputDecks: true,
		protectCompressedCheckpoints: true,
		protectConvergenceAndFlightCert: true,
		requireCompressedAnchorForPrune: true,
		keepRecentSolverRunDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'flight-cert-decks-shield',
		name: 'Flight Cert, Decks & CGNS Shield',
		description: 'Inspect CAD geometry, CGNS/STEP meshes, NASTRAN/Abaqus/LS-DYNA input decks, and flight-certification artifacts under strict aerospace preservation shields.',
		familyFilter: 'cad-mesh-boundary',
		strategy: 'hardlink-immutable-meshes-and-hdf5',
		survivorRule: 'archive-vault-h5-first',
		protectGeometryAndInputDecks: true,
		protectCompressedCheckpoints: true,
		protectConvergenceAndFlightCert: true,
		requireCompressedAnchorForPrune: true,
		keepRecentSolverRunDays: 0,
		minSizeKb: 0,
	},
])

export const AEROSPACE_CFD_DEFAULT_CONFIG = Object.freeze({
	presetId: 'all-aerospace-cfd-audit',
	familyFilter: 'all',
	verdictFilter: 'all',
	strategy: 'prune-uncompressed-dumps-and-cfd-scratch',
	survivorRule: 'archive-vault-h5-first',
	sortMode: 'reclaim_desc',
	searchQuery: '',
	protectGeometryAndInputDecks: true,
	protectCompressedCheckpoints: true,
	protectConvergenceAndFlightCert: true,
	requireCompressedAnchorForPrune: true,
	keepRecentSolverRunDays: 0,
	minSizeKb: 0,
})

const COMPRESSED_MESH_DECK_EXT_RE = /\.(?:cas\.h5|cas\.gz|cas\.zst|msh\.gz|msh\.zst|cgns\.gz|cgns\.zst|stl\.gz|stl\.zst)$/i
const STRICT_GEOMETRY_DECK_EXT_RE = /\.(?:cgns|bdf|nas|dyn|step|stp|iges|igs|brep|su2|foam)$/i
const CONTEXT_GEOMETRY_DECK_EXT_RE = /\.(?:inp|k|geo)$/i

const COMPRESSED_CHECKPOINT_EXT_RE = /\.(?:dat\.h5|dat\.gz|dat\.zst|vtu\.gz|vtu\.zst|odb\.gz|odb\.zst|rst\.gz|rst\.zst|d3plot\.gz|d3plot\.zst|ensight\.gz|h5|hdf5|xdmf|xmf|vtm|pvd)$/i
const FLIGHT_CERT_RESULT_EXT_RE = /\.(?:f06|pch|op2)$/i

const STRICT_UNCOMPRESSED_RESULT_EXT_RE = /\.(?:vtk|vtu|vtp|vtr|vts|plt|szplt|odb|rst|d3plot)$/i
const CONTEXT_UNCOMPRESSED_CFD_EXT_RE = /\.(?:dat|cas|msh)$/i

const STRICT_CFD_SCRATCH_EXT_RE = /\.(?:res\.tmp|cas\.tmp|dat\.tmp|foam\.tmp|lck|lock|elab_tmp)$/i
const CONTEXT_CFD_SCRATCH_EXT_RE = /\.(?:trn|stt|msg|sta|log|tmp|bak)$/i

const MUTABLE_AEROSPACE_EXT_RE = /\.(?:inp|bdf|nas|dyn|k|step|stp|iges|igs|brep|geo|su2|foam|cgns|vtk|vtu|vtp|vtr|vts|plt|szplt|odb|rst|d3plot|dat|cas|msh|f06|pch|op2|trn|stt|msg|sta|lck|lock|tmp|bak|log)$/i

const AEROSPACE_CONTEXT_RE = /(?:aero|aerospace|cfd|fea|fem|openfoam|fluent|ansys|cfx|starccm|star-ccm|abaqus|nastran|ls-dyna|lsdyna|su2|paraview|tecplot|cgns|airfoil|wing|fuselage|nacelle|nozzle|turbomachinery|turbine|propeller|rotor|hypersonic|supersonic|transonic|mach|reynolds|wind[_-]?tunnel|flight[_-]?cert|flight[_-]?test|polymesh|snappyhexmesh|simplefoam|pimplefoam|rhocentralfoam|mesh|boundary|solver|timestep|transient|turbulence)/i

const CFD_SCRATCH_PATH_RE = /(?:^|\/)(?:processor\d+|dynamiccode|postprocessing\/tmp|fluent_tmp|ansys_tmp|abaqus_tmp|nastran_scratch|starccm_tmp|cfx_tmp|paraview_cache|solver_scratch|mesh_tmp|cfd_scratch|fea_scratch|restart_tmp|scratch|tmp|temp|cache)(?:\/|$)/i
const FLIGHT_CERT_PATH_RE = /(?:^|\/)(?:flight[_-]?cert|cert|certification|wind[_-]?tunnel|flight[_-]?test|validation|verification|residuals|convergence|baseline)(?:\/|$)/i
const CANONICAL_VAULT_PATH_RE = /(?:^|\/)(?:00_cert|aero[_-]?vault|cfd[_-]?vault|fea[_-]?vault|sim[_-]?archive|archive|vault|canonical|golden[_-]?mesh|release[_-]?decks)(?:\/|$)/i

const ANY_AEROSPACE_EXT_RE = /\.(?:cas\.h5|cas\.gz|cas\.zst|msh\.gz|msh\.zst|cgns\.gz|cgns\.zst|stl\.gz|stl\.zst|dat\.h5|dat\.gz|dat\.zst|vtu\.gz|vtu\.zst|odb\.gz|odb\.zst|rst\.gz|rst\.zst|d3plot\.gz|d3plot\.zst|ensight\.gz|res\.tmp|cas\.tmp|dat\.tmp|foam\.tmp|cgns|bdf|nas|dyn|step|stp|iges|igs|brep|su2|foam|inp|k|geo|h5|hdf5|xdmf|xmf|vtm|pvd|f06|pch|op2|vtk|vtu|vtp|vtr|vts|plt|szplt|odb|rst|d3plot|dat|cas|msh|trn|stt|msg|sta|lck|lock)$/i

const GENERIC_AERO_STEMS = new Set([
	'solution',
	'flow',
	'field',
	'fields',
	'mesh',
	'case',
	'data',
	'results',
	'result',
	'restart',
	'checkpoint',
	'model',
	'geometry',
	'surface',
	'volume',
	'run',
	'step',
])

const NOISE_PARENT_DIRS = new Set([
	'dynamiccode',
	'fluent_tmp',
	'ansys_tmp',
	'abaqus_tmp',
	'nastran_scratch',
	'starccm_tmp',
	'cfx_tmp',
	'paraview_cache',
	'solver_scratch',
	'mesh_tmp',
	'cfd_scratch',
	'fea_scratch',
	'restart_tmp',
	'scratch',
	'tmp',
	'temp',
	'cache',
	'postprocessing',
])

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
export function normalizeAerospaceCfdConfig(raw = {}) {
	const input = raw && typeof raw === 'object' ? raw : {}
	const preset = AEROSPACE_CFD_PRESETS.find(item => item.id === input.presetId) || null
	const base = preset
		? { ...AEROSPACE_CFD_DEFAULT_CONFIG, ...preset }
		: { ...AEROSPACE_CFD_DEFAULT_CONFIG }

	const familyFilter = AEROSPACE_CFD_FAMILIES.includes(input.familyFilter)
		? input.familyFilter
		: base.familyFilter
	const verdictFilter = AEROSPACE_CFD_VERDICT_FILTERS.includes(input.verdictFilter)
		? input.verdictFilter
		: base.verdictFilter
	const strategy = AEROSPACE_CFD_STRATEGIES.includes(input.strategy)
		? input.strategy
		: base.strategy
	const survivorRule = AEROSPACE_CFD_SURVIVOR_RULES.includes(input.survivorRule)
		? input.survivorRule
		: base.survivorRule
	const sortMode = AEROSPACE_CFD_SORT_MODES.includes(input.sortMode)
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
		protectGeometryAndInputDecks: typeof input.protectGeometryAndInputDecks === 'boolean'
			? input.protectGeometryAndInputDecks
			: base.protectGeometryAndInputDecks,
		protectCompressedCheckpoints: typeof input.protectCompressedCheckpoints === 'boolean'
			? input.protectCompressedCheckpoints
			: base.protectCompressedCheckpoints,
		protectConvergenceAndFlightCert: typeof input.protectConvergenceAndFlightCert === 'boolean'
			? input.protectConvergenceAndFlightCert
			: base.protectConvergenceAndFlightCert,
		requireCompressedAnchorForPrune: typeof input.requireCompressedAnchorForPrune === 'boolean'
			? input.requireCompressedAnchorForPrune
			: base.requireCompressedAnchorForPrune,
		keepRecentSolverRunDays: normalizeNonNegativeInt(input.keepRecentSolverRunDays, base.keepRecentSolverRunDays, 3650),
		minSizeKb: normalizeNonNegativeInt(input.minSizeKb, base.minSizeKb, 10000000),
		memberOverrides,
	}
}

/**
 * Extract basename from normalized filesystem path.
 *
 * @param {string} normalizedPath Normalized path.
 * @return {string} File basename.
 */
function extractBasename(normalizedPath) {
	const parts = String(normalizedPath || '').split('/')
	return parts[parts.length - 1] || ''
}

/**
 * Extract directory portion from normalized filesystem path.
 *
 * @param {string} normalizedPath Normalized path.
 * @return {string} Directory path.
 */
function extractDirname(normalizedPath) {
	const idx = String(normalizedPath || '').lastIndexOf('/')
	return idx > 0 ? String(normalizedPath).slice(0, idx) : ''
}

/**
 * Parse file mtime into epoch milliseconds when available.
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
 * Extract meaningful vehicle, wing, or simulation campaign folder from path.
 *
 * @param {string} normalizedPath Normalized path.
 * @return {string} Meaningful folder slug or empty string.
 */
function extractMeaningfulCaseFolder(normalizedPath) {
	const parts = String(normalizedPath || '').split('/').filter(Boolean)
	if (parts.length <= 1) {
		return ''
	}
	for (let i = parts.length - 2; i >= 0; i -= 1) {
		const segment = parts[i].toLowerCase()
		if (!NOISE_PARENT_DIRS.has(segment) && !/^processor\d+$/.test(segment)) {
			return segment.replace(/[^a-z0-9_-]/g, '-')
		}
	}
	return ''
}

/**
 * Detect Aerospace CFD/FEA solver toolchain and simulation stage from path and basename.
 *
 * @param {string} normalizedPath Normalized path.
 * @param {string} [basename] File basename.
 * @return {{ solverToolchain: string, simulationStage: string }} Detected toolchain and stage.
 */
export function extractSolverToolchainAndStage(normalizedPath, basename = '') {
	const lowerPath = String(normalizedPath || '').toLowerCase()
	const lowerBase = String(basename || '').toLowerCase()
	const combined = `${lowerPath}/${lowerBase}`

	let solverToolchain = 'Aerospace CFD / FEA Vault'
	if (/openfoam|snappyhexmesh|simplefoam|pimplefoam|rhocentralfoam|polymesh|processor\d+|\.foam(?:\.tmp)?$/i.test(combined)) {
		solverToolchain = 'OpenFOAM Parallel CFD'
	} else if (/fluent|ansys|cfx|\.(?:cas|dat)\.(?:h5|gz|zst)$|\.(?:cas|dat|rst(?:\.(?:gz|zst))?)$/i.test(combined)) {
		solverToolchain = 'ANSYS Fluent / Mechanical'
	} else if (/starccm|star-ccm|starccm_tmp/i.test(combined)) {
		solverToolchain = 'Siemens STAR-CCM+'
	} else if (/abaqus|\.odb(?:\.(?:gz|zst))?$|\.inp$/i.test(combined)) {
		solverToolchain = 'Dassault Abaqus FEA'
	} else if (/nastran|\.(?:bdf|nas|f06|pch|op2)$/i.test(combined)) {
		solverToolchain = 'MSC Nastran Structural'
	} else if (/ls-dyna|lsdyna|\.d3plot(?:\.(?:gz|zst))?$|\.dyn$/i.test(combined)) {
		solverToolchain = 'ANSYS LS-DYNA Explicit'
	} else if (/su2|\.su2$/i.test(combined)) {
		solverToolchain = 'SU2 Aerospace CFD'
	} else if (/paraview|tecplot|\.(?:vtk|vtu(?:\.(?:gz|zst))?|vtp|vtr|vts|vtm|pvd|plt|szplt|xdmf|xmf)$/i.test(combined)) {
		solverToolchain = 'ParaView / VTK / Tecplot'
	} else if (/cgns|hdf5|\.(?:cgns(?:\.(?:gz|zst))?|h5|hdf5)$/i.test(combined)) {
		solverToolchain = 'CGNS / HDF5 Archive'
	}

	let simulationStage = ''
	if (FLIGHT_CERT_PATH_RE.test(lowerPath) || FLIGHT_CERT_RESULT_EXT_RE.test(lowerBase)) {
		simulationStage = 'Flight Cert & Validation Baseline'
	} else if (COMPRESSED_MESH_DECK_EXT_RE.test(lowerBase) || STRICT_GEOMETRY_DECK_EXT_RE.test(lowerBase) || (CONTEXT_GEOMETRY_DECK_EXT_RE.test(lowerBase) && AEROSPACE_CONTEXT_RE.test(lowerPath))) {
		simulationStage = 'CAD Geometry, Mesh & Solver Deck'
	} else if (COMPRESSED_CHECKPOINT_EXT_RE.test(lowerBase)) {
		simulationStage = 'Compressed HDF5 / Checkpoint Archive'
	} else if (STRICT_UNCOMPRESSED_RESULT_EXT_RE.test(lowerBase) || (CONTEXT_UNCOMPRESSED_CFD_EXT_RE.test(lowerBase) && AEROSPACE_CONTEXT_RE.test(lowerPath))) {
		simulationStage = 'Uncompressed Field / Result Dump'
	} else if (CFD_SCRATCH_PATH_RE.test(lowerPath) || STRICT_CFD_SCRATCH_EXT_RE.test(lowerBase)) {
		simulationStage = 'Parallel Partitions & Solver Scratch'
	}

	return { solverToolchain, simulationStage }
}

/**
 * Extract normalized simulation case stem to correlate uncompressed .vtk/.vtu/.dat/.cas/.odb/.rst
 * against compressed .dat.h5/.dat.gz/.cas.h5/.msh.gz/.vtu.gz/.odb.gz/.rst.gz anchors.
 *
 * @param {string} basename File basename.
 * @param {string} [normalizedPath] Full normalized path for campaign folder context.
 * @return {string} Normalized case lineage stem.
 */
export function extractAerospaceCaseStem(basename, normalizedPath = '') {
	let stem = String(basename || '').trim().toLowerCase()
	stem = stem.replace(ANY_AEROSPACE_EXT_RE, '')
	stem = stem.replace(/\s+\(\d+\)$/, '')
	stem = stem.replace(/\s*-\s*copy(?:\s*\(\d+\))?$/i, '')

	let prev = ''
	while (stem !== prev) {
		prev = stem
		stem = stem.replace(
			/(?:[-_.](?:raw|uncompressed|unzipped|ascii|dump|exported|merged|copy\d*|tmp|temp|v\d+(?:\.\d+)?))$/i,
			''
		)
	}

	if (!stem || GENERIC_AERO_STEMS.has(stem)) {
		const caseFolder = extractMeaningfulCaseFolder(normalizedPath)
		if (caseFolder) {
			return `${caseFolder}_${stem || 'aero'}`
		}
	}

	return stem || 'unknown-aero-case'
}

/**
 * Extract broader simulation archive anchor key (stripping iteration, timestep, and partition suffixes).
 *
 * @param {string} caseStem Normalized case lineage stem.
 * @return {string} Simulation archive anchor key.
 */
export function extractArchiveAnchorKey(caseStem) {
	return String(caseStem || '')
		.replace(/(?:[-_.](?:t\d+|iter\d+|step\d+|ts\d+|rank\d+|part\d+|\d{1,5}))+$/i, '')
		|| 'unknown-aero-case'
}

/**
 * Extract concise Aerospace/CFD artifact tag for UI badges and CSV exports.
 *
 * @param {string} lowerBase Lowercase basename.
 * @param {string} lowerPath Lowercase full path.
 * @return {string} Aerospace/CFD artifact tag.
 */
function extractAeroTag(lowerBase, lowerPath) {
	if (FLIGHT_CERT_PATH_RE.test(lowerPath) || FLIGHT_CERT_RESULT_EXT_RE.test(lowerBase)) {
		return 'flight-cert-baseline'
	}
	if (COMPRESSED_MESH_DECK_EXT_RE.test(lowerBase) || STRICT_GEOMETRY_DECK_EXT_RE.test(lowerBase) || (CONTEXT_GEOMETRY_DECK_EXT_RE.test(lowerBase) && AEROSPACE_CONTEXT_RE.test(lowerPath))) {
		return 'cad-mesh-deck'
	}
	if (COMPRESSED_CHECKPOINT_EXT_RE.test(lowerBase)) {
		return 'compressed-hdf5-checkpoint'
	}
	if (STRICT_UNCOMPRESSED_RESULT_EXT_RE.test(lowerBase) || (CONTEXT_UNCOMPRESSED_CFD_EXT_RE.test(lowerBase) && AEROSPACE_CONTEXT_RE.test(lowerPath))) {
		return 'uncompressed-field-dump'
	}
	if (STRICT_CFD_SCRATCH_EXT_RE.test(lowerBase) || CFD_SCRATCH_PATH_RE.test(lowerPath)) {
		return 'cfd-fea-scratch'
	}
	return ''
}

/**
 * Classify a single duplicate file into the Aerospace, CFD & FEA Vault domain.
 *
 * @param {object} file Duplicate file entry.
 * @param {number} [referenceNowMs] Reference epoch ms.
 * @return {object} Classification metadata (family === null if outside domain).
 */
export function classifyAerospaceCfdFile(file, referenceNowMs = Date.now()) {
	const rawPath = file?.path || file?.name || ''
	const normalized = normalizePathForDiff(rawPath)
	const lower = normalized.toLowerCase()
	const basename = extractBasename(normalized)
	const lowerBase = basename.toLowerCase()
	const dirname = extractDirname(normalized)
	const size = Math.max(0, Number(file?.size) || 0)
	const mtimeMs = extractMtimeMs(file)
	const formattedMtime = mtimeMs !== null ? formatFileModifiedTime(mtimeMs / 1000) : ''
	const ageDays = mtimeMs !== null ? Math.max(0, (referenceNowMs - mtimeMs) / (24 * 60 * 60 * 1000)) : null

	const hasAeroContext = AEROSPACE_CONTEXT_RE.test(lower)
	const isCfdScratchPath = CFD_SCRATCH_PATH_RE.test(lower)
	const isFlightCertPath = FLIGHT_CERT_PATH_RE.test(lower) && !isCfdScratchPath
	const isCanonicalVaultPath = (CANONICAL_VAULT_PATH_RE.test(lower) || isFlightCertPath) && !isCfdScratchPath

	const isCompressedMeshDeck = COMPRESSED_MESH_DECK_EXT_RE.test(lowerBase)
	const isStrictDeck = STRICT_GEOMETRY_DECK_EXT_RE.test(lowerBase)
	const isContextDeck = CONTEXT_GEOMETRY_DECK_EXT_RE.test(lowerBase) && hasAeroContext

	const isCompressedCheckpoint = COMPRESSED_CHECKPOINT_EXT_RE.test(lowerBase)
	const isFlightCertResult = FLIGHT_CERT_RESULT_EXT_RE.test(lowerBase)

	const isUncompressedResult = !isCompressedMeshDeck && !isCompressedCheckpoint && (
		STRICT_UNCOMPRESSED_RESULT_EXT_RE.test(lowerBase)
		|| (CONTEXT_UNCOMPRESSED_CFD_EXT_RE.test(lowerBase) && hasAeroContext)
	)

	const isStrictScratchExt = STRICT_CFD_SCRATCH_EXT_RE.test(lowerBase)
	const isContextScratch = (isCfdScratchPath && (hasAeroContext || ANY_AEROSPACE_EXT_RE.test(lowerBase) || /(?:^|\/)processor\d+(?:\/|$)/i.test(lower)))
		|| (CONTEXT_CFD_SCRATCH_EXT_RE.test(lowerBase) && hasAeroContext)

	let family = null
	let artifactKind = ''
	let vaultRole = ''
	let isProtectedGeometryDeck = false
	let isProtectedCompressedCheckpoint = false
	let isProtectedFlightCert = false
	let isCompressedArchiveAnchor = false
	let isUncompressedResultDump = false
	const isMutableFile = MUTABLE_AEROSPACE_EXT_RE.test(lowerBase)

	if (isCompressedMeshDeck || isStrictDeck || isContextDeck) {
		family = 'cad-mesh-boundary'
		isProtectedGeometryDeck = !isCfdScratchPath
		isProtectedFlightCert = isFlightCertPath
		if (isCompressedMeshDeck) {
			isCompressedArchiveAnchor = !isCfdScratchPath
			artifactKind = 'Compressed Mesh & Case Deck (.cas.h5/.cas.gz/.msh.gz/.cgns.gz)'
			vaultRole = isCfdScratchPath ? 'Scratch Compressed Mesh' : 'Canonical Compressed Mesh Anchor'
		} else if (/\.(?:step|stp|iges|igs|brep|geo)$/i.test(lowerBase)) {
			artifactKind = 'Aerospace CAD Geometry (.step/.iges/.brep)'
			vaultRole = isCfdScratchPath ? 'Scratch CAD Copy' : 'Canonical CAD Geometry Vault'
		} else {
			artifactKind = 'Solver Mesh & Boundary Deck (.cgns/.bdf/.nas/.inp/.k)'
			vaultRole = isCfdScratchPath ? 'Scratch Solver Deck' : 'Canonical Mesh & Input Deck Vault'
		}
	} else if (isCompressedCheckpoint || isFlightCertResult) {
		family = 'solver-checkpoints-fields'
		if (isFlightCertResult) {
			isProtectedFlightCert = !isCfdScratchPath
			isProtectedCompressedCheckpoint = !isCfdScratchPath
			artifactKind = 'Structural Validation Output (.f06/.pch/.op2)'
			vaultRole = isCfdScratchPath ? 'Scratch Nastran Output' : 'Conserved Structural Cert Output'
		} else {
			isCompressedArchiveAnchor = !isCfdScratchPath
			isProtectedCompressedCheckpoint = !isCfdScratchPath
			isProtectedFlightCert = isFlightCertPath
			artifactKind = 'Compressed Checkpoint / Field Archive (.dat.h5/.h5/.vtu.gz/.odb.gz)'
			vaultRole = isCfdScratchPath ? 'Scratch Checkpoint Copy' : 'Archived HDF5 / Field Anchor Vault'
		}
	} else if (isUncompressedResult) {
		family = 'uncompressed-raw-results'
		isProtectedFlightCert = isFlightCertPath
		isUncompressedResultDump = true
		if (/\.(?:vtk|vtu|vtp|vtr|vts|plt|szplt)$/i.test(lowerBase)) {
			artifactKind = 'Uncompressed Field Visualization Dump (.vtk/.vtu/.plt)'
			vaultRole = isCfdScratchPath ? 'Scratch VTK / Tecplot Dump' : 'Uncompressed Field Dump Copy'
		} else if (/\.(?:odb|rst|d3plot)$/i.test(lowerBase)) {
			artifactKind = 'Uncompressed FEA Result Archive (.odb/.rst/.d3plot)'
			vaultRole = isCfdScratchPath ? 'Scratch FEA Result' : 'Uncompressed FEA Result Copy'
		} else {
			artifactKind = 'Uncompressed Fluent/CFD Case or Data (.dat/.cas/.msh)'
			vaultRole = isCfdScratchPath ? 'Scratch CFD Export' : 'Uncompressed CFD Case/Data Copy'
		}
	} else if (isStrictScratchExt || isContextScratch) {
		family = 'cfd-fea-scratch-restart'
		artifactKind = isStrictScratchExt
			? 'Transient Solver Lock / Restart Temp (.lck/.tmp)'
			: 'Parallel Partition / Solver Scratch (processorN/, *_tmp/)'
		vaultRole = 'OpenFOAM / Fluent / Abaqus / Nastran Scratch'
	}

	const { solverToolchain, simulationStage } = extractSolverToolchainAndStage(normalized, basename)
	const caseStem = extractAerospaceCaseStem(basename, normalized)
	const archiveAnchorKey = extractArchiveAnchorKey(caseStem)
	const caseFolder = extractMeaningfulCaseFolder(normalized)
	const aeroTag = extractAeroTag(lowerBase, lower)

	return {
		normalized,
		lower,
		basename,
		dirname,
		size,
		mtimeMs,
		formattedMtime,
		ageDays,
		family,
		artifactKind,
		vaultRole,
		solverToolchain,
		simulationStage,
		caseStem,
		archiveAnchorKey,
		caseFolder,
		aeroTag,
		isProtectedGeometryDeck,
		isProtectedCompressedCheckpoint,
		isProtectedFlightCert,
		isCompressedArchiveAnchor,
		isUncompressedResultDump,
		isMutableFile,
		isCfdScratchPath: isCfdScratchPath || isStrictScratchExt,
		isFlightCertPath,
		isCanonicalVaultPath,
	}
}

/**
 * Determine whether a duplicate group belongs to the Aerospace, CFD & FEA Vault domain.
 *
 * @param {object} group Duplicate group.
 * @return {boolean} True when at least one file belongs to this domain.
 */
export function isAerospaceCfdGroup(group) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return false
	}
	return group.files.some(file => classifyAerospaceCfdFile(file).family !== null)
}

/**
 * Build cross-group correlation index linking verified compressed HDF5/CGNS/Gzip archives
 * (.dat.h5, .dat.gz, .cas.h5, .msh.gz, .vtu.gz, .odb.gz, .rst.gz, .h5) to uncompressed dumps.
 *
 * @param {Array<object>} groups Domain duplicate groups.
 * @return {object} Correlation index.
 */
export function buildAerospaceCfdCorrelationIndex(groups) {
	const compressedStems = new Set()
	const compressedAnchorKeys = new Set()

	for (const group of Array.isArray(groups) ? groups : []) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (const file of group.files) {
			const meta = classifyAerospaceCfdFile(file)
			if (!meta.family) {
				continue
			}
			if (meta.isCompressedArchiveAnchor) {
				compressedStems.add(meta.caseStem)
				compressedAnchorKeys.add(meta.archiveAnchorKey)
			}
		}
	}

	return {
		compressedStems,
		compressedAnchorKeys,
	}
}

/**
 * Determine primary family for a heterogeneous Aerospace CFD/FEA cluster.
 *
 * @param {Array<object>} members Classified members.
 * @return {string} Family ID.
 */
function resolveClusterFamily(members) {
	if (members.some(m => m.family === 'cad-mesh-boundary')) {
		return 'cad-mesh-boundary'
	}
	if (members.some(m => m.family === 'solver-checkpoints-fields')) {
		return 'solver-checkpoints-fields'
	}
	if (members.some(m => m.family === 'uncompressed-raw-results')) {
		return 'uncompressed-raw-results'
	}
	return 'cfd-fea-scratch-restart'
}

/**
 * Compute deterministic survivor priority score for an Aerospace CFD/FEA vault member.
 *
 * @param {object} member Classified member.
 * @param {string} survivorRule Survivor rule.
 * @return {number} Priority score (higher wins).
 */
function scoreMemberForSurvivor(member, survivorRule) {
	const mtimeScore = member.mtimeMs !== null ? member.mtimeMs / 1e10 : 0
	const shortPathScore = 1000 - Math.min(999, member.normalized.length)

	if (survivorRule === 'oldest-solver-run-first') {
		const oldestScore = member.mtimeMs !== null ? -mtimeScore : 0
		return (member.isProtectedFlightCert ? 100000 : 0)
			+ (member.isProtectedGeometryDeck ? 97000 : 0)
			+ (member.isProtectedCompressedCheckpoint ? 94000 : 0)
			+ (member.isCanonicalVaultPath ? 25000 : 0)
			+ (member.isCfdScratchPath ? -55000 : 0)
			+ (member.isUncompressedResultDump ? -40000 : 0)
			+ oldestScore
			+ shortPathScore
	}

	if (survivorRule === 'newest-mesh-revision-first') {
		return (member.isProtectedFlightCert ? 100000 : 0)
			+ (member.isProtectedGeometryDeck ? 97000 : 0)
			+ (member.isProtectedCompressedCheckpoint ? 94000 : 0)
			+ (member.isCfdScratchPath ? -50000 : 0)
			+ (member.isUncompressedResultDump ? -40000 : 0)
			+ mtimeScore
	}

	if (survivorRule === 'shortest-path') {
		return (member.isProtectedFlightCert ? 52000 : 0)
			+ (member.isProtectedGeometryDeck ? 50000 : 0)
			+ (member.isProtectedCompressedCheckpoint ? 48000 : 0)
			+ (member.isCfdScratchPath ? -30000 : 0)
			+ shortPathScore
	}

	return (member.isProtectedFlightCert ? 100000 : 0)
		+ (member.isProtectedGeometryDeck ? 97000 : 0)
		+ (member.isProtectedCompressedCheckpoint ? 94000 : 0)
		+ (member.isCanonicalVaultPath ? 25000 : 0)
		+ (member.isUncompressedResultDump ? -45000 : 0)
		+ (member.isCfdScratchPath ? -60000 : 0)
		+ shortPathScore
}

/**
 * Audit a single Aerospace, CFD & FEA duplicate cluster.
 *
 * @param {object} group Duplicate group.
 * @param {object} correlationIndex Cross-group correlation index.
 * @param {object} config Normalized configuration.
 * @param {number} referenceNowMs Reference epoch ms.
 * @return {object|null} Audited cluster entry or null if outside domain.
 */
function auditSingleCluster(group, correlationIndex, config, referenceNowMs) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return null
	}

	const rawMembers = group.files.map((file, index) => {
		const meta = classifyAerospaceCfdFile(file, referenceNowMs)
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
	const primaryToolchain = rawMembers.find(m => m.solverToolchain)?.solverToolchain || ''
	const primaryStage = rawMembers.find(m => m.simulationStage)?.simulationStage || ''
	const primaryStem = rawMembers[0].caseStem || extractAerospaceCaseStem(primaryName, rawMembers[0].normalized)
	const primaryAnchorKey = rawMembers[0].archiveAnchorKey || extractArchiveAnchorKey(primaryStem)

	const hasCompressedArchiveAnchor = Boolean(
		rawMembers.some(m => m.isCompressedArchiveAnchor)
		|| correlationIndex.compressedStems.has(primaryStem)
		|| correlationIndex.compressedAnchorKeys.has(primaryAnchorKey)
	)

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

	let reclaimableBytes = 0
	let hardlinkSavingsBytes = 0
	let deleteTargetsCount = 0
	let hardlinkTargetsCount = 0
	let shieldedCount = 0

	const members = rawMembers.map((member) => {
		const isSurvivor = member.key === survivorKey
		const override = config.memberOverrides?.[member.key] || 'auto'

		const isRedundantUncompressedMember = member.isUncompressedResultDump && hasCompressedArchiveAnchor

		let redundancyReason = ''
		if (member.isUncompressedResultDump) {
			redundancyReason = isRedundantUncompressedMember
				? 'Uncompressed .vtk/.vtu/.odb/.rst/.dat duplicates verified .h5/.gz archive anchor'
				: 'Uncompressed CFD/FEA dump without verified compressed .h5/.gz archive anchor'
		}

		let governanceTier = 'cfd-fea-scratch-intermediate'
		let shielded = false
		let protectedReason = ''
		let action = 'keep'

		if (override === 'keep') {
			governanceTier = member.isProtectedFlightCert
				? 'flight-cert-protected'
				: (member.isProtectedGeometryDeck
					? 'deck-geometry-protected'
					: (member.isProtectedCompressedCheckpoint
						? 'checkpoint-hdf5-protected'
						: (member.isUncompressedResultDump
							? 'uncompressed-vtk-odb-redundant'
							: 'cfd-fea-scratch-intermediate')))
			shielded = true
			protectedReason = 'Manually shielded via per-copy override'
		} else if (member.isProtectedFlightCert && config.protectConvergenceAndFlightCert) {
			governanceTier = 'flight-cert-protected'
			shielded = true
			protectedReason = 'Flight-certification, wind-tunnel, or convergence baseline strictly conserved'
		} else if (member.isProtectedGeometryDeck && config.protectGeometryAndInputDecks) {
			governanceTier = 'deck-geometry-protected'
			shielded = true
			protectedReason = 'CAD geometry, CGNS/HDF5 mesh, and solver input deck strictly conserved'
		} else if (member.isProtectedCompressedCheckpoint && config.protectCompressedCheckpoints) {
			governanceTier = 'checkpoint-hdf5-protected'
			shielded = true
			protectedReason = 'Compressed HDF5/CGNS/Gzip solver checkpoint strictly conserved'
		} else if (isSurvivor && !isRedundantUncompressedMember) {
			governanceTier = member.isProtectedFlightCert
				? 'flight-cert-protected'
				: (member.isProtectedGeometryDeck
					? 'deck-geometry-protected'
					: (member.isProtectedCompressedCheckpoint
						? 'checkpoint-hdf5-protected'
						: (member.isUncompressedResultDump
							? 'uncompressed-vtk-odb-redundant'
							: 'cfd-fea-scratch-intermediate')))
			shielded = true
			protectedReason = 'Canonical Aerospace CFD/FEA vault survivor retained'
		} else if (override === 'prune') {
			governanceTier = member.isUncompressedResultDump
				? 'uncompressed-vtk-odb-redundant'
				: (member.isProtectedGeometryDeck
					? 'deck-geometry-protected'
					: 'cfd-fea-scratch-intermediate')
			action = config.strategy === 'hardlink-immutable-meshes-and-hdf5' && !member.isMutableFile && !member.isCfdScratchPath
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
		} else if (
			config.keepRecentSolverRunDays > 0
			&& member.isCfdScratchPath
			&& member.ageDays !== null
			&& member.ageDays < config.keepRecentSolverRunDays
		) {
			governanceTier = 'cfd-fea-scratch-intermediate'
			shielded = true
			protectedReason = `Within ${config.keepRecentSolverRunDays}-day active solver run retention window`
		} else if (member.isUncompressedResultDump) {
			governanceTier = 'uncompressed-vtk-odb-redundant'
			if (config.requireCompressedAnchorForPrune && !hasCompressedArchiveAnchor) {
				shielded = true
				protectedReason = 'Blocked until a verified .h5/.dat.h5/.gz/.odb.gz archive anchor exists'
			} else {
				action = 'delete'
				deleteTargetsCount += 1
				reclaimableBytes += member.size
				protectedReason = redundancyReason
			}
		} else if (member.isCfdScratchPath) {
			governanceTier = 'cfd-fea-scratch-intermediate'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
			protectedReason = 'OpenFOAM/Fluent/Abaqus/Nastran scratch or partition eligible for cleanup'
		} else if (member.isProtectedCompressedCheckpoint || member.isProtectedGeometryDeck) {
			governanceTier = member.isProtectedGeometryDeck ? 'deck-geometry-protected' : 'checkpoint-hdf5-protected'
			action = config.strategy === 'hardlink-immutable-meshes-and-hdf5' && !member.isMutableFile ? 'hardlink' : 'delete'
			if (action === 'hardlink') {
				hardlinkSavingsBytes += member.size
				hardlinkTargetsCount += 1
			} else {
				deleteTargetsCount += 1
			}
			reclaimableBytes += member.size
		} else if (config.strategy === 'hardlink-immutable-meshes-and-hdf5' && !member.isMutableFile) {
			governanceTier = 'checkpoint-hdf5-protected'
			action = 'hardlink'
			hardlinkSavingsBytes += member.size
			hardlinkTargetsCount += 1
			reclaimableBytes += member.size
		} else {
			governanceTier = 'cfd-fea-scratch-intermediate'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
		}

		if (shielded) {
			shieldedCount += 1
		}

		return {
			...member,
			isRedundantUncompressedMember,
			redundancyReason,
			isSurvivor,
			governanceTier,
			shielded,
			protectedReason,
			action,
		}
	})

	const hasRedundantUncompressedDump = members.some(m => m.isRedundantUncompressedMember || m.isUncompressedResultDump)
	const hasCfdScratchIntermediate = members.some(m => m.isCfdScratchPath)
	const hasProtectedGeometryDeck = members.some(m => m.governanceTier === 'deck-geometry-protected')
	const hasProtectedCompressedCheckpoint = members.some(m => m.governanceTier === 'checkpoint-hdf5-protected')
	const hasProtectedFlightCert = members.some(m => m.governanceTier === 'flight-cert-protected')

	let clusterVerdict = 'cfd-fea-scratch-intermediate'
	if (members.some(m => m.isRedundantUncompressedMember)) {
		clusterVerdict = 'uncompressed-vtk-odb-redundant'
	} else if (hasProtectedFlightCert) {
		clusterVerdict = 'flight-cert-protected'
	} else if (hasProtectedGeometryDeck) {
		clusterVerdict = 'deck-geometry-protected'
	} else if (hasProtectedCompressedCheckpoint) {
		clusterVerdict = 'checkpoint-hdf5-protected'
	} else if (hasCfdScratchIntermediate) {
		clusterVerdict = 'cfd-fea-scratch-intermediate'
	} else if (hasRedundantUncompressedDump) {
		clusterVerdict = 'uncompressed-vtk-odb-redundant'
	}

	const hasReclaimable = (deleteTargetsCount + hardlinkTargetsCount) > 0
	const aeroTags = Array.from(new Set(members.map(m => m.aeroTag).filter(Boolean)))

	const riskScore = (members.some(m => m.isRedundantUncompressedMember) ? 125 : 0)
		+ (hasCfdScratchIntermediate ? 110 : 0)
		+ (hasProtectedFlightCert ? 100 : 0)
		+ (hasProtectedGeometryDeck ? 95 : 0)
		+ (hasProtectedCompressedCheckpoint ? 90 : 0)
		+ (hasReclaimable ? 20 : 0)

	return {
		id: group.id ?? primaryName,
		hash: group.hash || '',
		name: primaryName,
		solverToolchain: primaryToolchain,
		simulationStage: primaryStage,
		caseStem: primaryStem,
		archiveAnchorKey: primaryAnchorKey,
		family,
		familyLabel: AEROSPACE_CFD_FAMILY_META[family]?.label || family,
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
		hasProtectedGeometryDeck,
		hasProtectedCompressedCheckpoint,
		hasProtectedFlightCert,
		hasRedundantUncompressedDump,
		hasCfdScratchIntermediate,
		hasCompressedArchiveAnchor,
		aeroTags,
		members,
		group,
	}
}

/**
 * Audit duplicate groups across Aerospace, CFD & Finite Element Simulation Vaults.
 *
 * @param {Array<object>} groups Duplicate groups.
 * @param {object} [rawConfig] Audit configuration overrides.
 * @param {number} [referenceNowMs] Reference epoch ms for deterministic tests.
 * @return {object} Complete audit report with summary, family counts, and filtered clusters.
 */
export function auditAerospaceCfdVault(groups, rawConfig = {}, referenceNowMs = Date.now()) {
	const config = normalizeAerospaceCfdConfig(rawConfig)
	const sourceGroups = Array.isArray(groups) ? groups : []
	const domainGroups = sourceGroups.filter(isAerospaceCfdGroup)
	const correlationIndex = buildAerospaceCfdCorrelationIndex(domainGroups)

	const allClusters = domainGroups
		.map(group => auditSingleCluster(group, correlationIndex, config, referenceNowMs))
		.filter(Boolean)

	const minSizeBytes = config.minSizeKb * 1024
	const sizeFiltered = allClusters.filter(cluster => cluster.unitBytes >= minSizeBytes)

	const familyCounts = {
		all: sizeFiltered.length,
		'cad-mesh-boundary': 0,
		'solver-checkpoints-fields': 0,
		'uncompressed-raw-results': 0,
		'cfd-fea-scratch-restart': 0,
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
		if (config.verdictFilter === 'uncompressed-vtk-odb-redundant' && !cluster.hasRedundantUncompressedDump) {
			return false
		}
		if (config.verdictFilter === 'cfd-fea-scratch-intermediate' && !cluster.hasCfdScratchIntermediate) {
			return false
		}
		if (
			config.verdictFilter !== 'all'
			&& config.verdictFilter !== 'reclaimable'
			&& config.verdictFilter !== 'shielded'
			&& config.verdictFilter !== 'uncompressed-vtk-odb-redundant'
			&& config.verdictFilter !== 'cfd-fea-scratch-intermediate'
			&& cluster.clusterVerdict !== config.verdictFilter
		) {
			return false
		}
		if (query.length > 0) {
			const matchesName = cluster.name.toLowerCase().includes(query)
			const matchesStem = cluster.caseStem.toLowerCase().includes(query)
			const matchesToolchain = cluster.solverToolchain.toLowerCase().includes(query)
			const matchesStage = cluster.simulationStage.toLowerCase().includes(query)
			const matchesTag = cluster.aeroTags.some(tag => tag.toLowerCase().includes(query))
			const matchesMember = cluster.members.some(m => m.lower.includes(query))
			if (!matchesName && !matchesStem && !matchesToolchain && !matchesStage && !matchesTag && !matchesMember) {
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
	let totalGeometryDeckClusters = 0
	let totalCheckpointArchiveClusters = 0
	let totalFlightCertClusters = 0
	let totalRedundantDumpClusters = 0
	let totalCfdScratchClusters = 0

	for (const cluster of filteredClusters) {
		rawDuplicateBytes += Math.max(0, cluster.totalBytes - cluster.unitBytes)
		reclaimableBytes += cluster.reclaimableBytes
		totalReclaimableCopiesCount += cluster.reclaimableTargetsCount
		totalShieldedCopiesCount += cluster.shieldedCount

		if (cluster.hasProtectedGeometryDeck) {
			totalGeometryDeckClusters += 1
		}
		if (cluster.hasProtectedCompressedCheckpoint) {
			totalCheckpointArchiveClusters += 1
		}
		if (cluster.hasProtectedFlightCert) {
			totalFlightCertClusters += 1
		}
		if (cluster.hasRedundantUncompressedDump) {
			totalRedundantDumpClusters += 1
		}
		if (cluster.hasCfdScratchIntermediate) {
			totalCfdScratchClusters += 1
		}
	}

	const efficiencyPct = rawDuplicateBytes > 0
		? Math.min(100, Math.round((reclaimableBytes / rawDuplicateBytes) * 100))
		: 0

	const reclaimableGb = `${(reclaimableBytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`

	const familyBreakdown = AEROSPACE_CFD_FAMILIES
		.filter(id => id !== 'all')
		.map(id => ({
			id,
			label: AEROSPACE_CFD_FAMILY_META[id].label,
			shortLabel: AEROSPACE_CFD_FAMILY_META[id].shortLabel,
			clustersCount: familyCounts[id] || 0,
		}))

	return {
		schema: AEROSPACE_CFD_VAULT_SCHEMA,
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
			totalGeometryDeckClusters,
			totalCheckpointArchiveClusters,
			totalFlightCertClusters,
			totalRedundantDumpClusters,
			totalCfdScratchClusters,
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
 * Build a safe POSIX DRY_RUN=1 remediation script for Aerospace CFD & FEA vaults.
 * Strictly blocks deletion or hardlinking of shielded geometry decks, compressed HDF5/CGNS archives,
 * and flight-certification baselines, and never hardlinks mutable files or solver scratch.
 *
 * @param {object} auditResult Result from auditAerospaceCfdVault.
 * @return {string} POSIX bash script.
 */
export function buildAerospaceCfdRemediationScript(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# Aerospace, CFD & Finite Element Simulation (FEA) Vault Auditor',
		'# Safe POSIX Remediation Script (default DRY_RUN=1)',
		'# Run with DRY_RUN=0 ./aerospace-cfd-vault-reclaim.sh only after verifying HDF5/CGNS and flight-cert anchors.',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'QUARANTINE_DIR="$' + '{QUARANTINE_DIR:-./.aerospace-cfd-scratch-quarantine}"',
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
	const strategy = auditResult?.config?.strategy || 'prune-uncompressed-dumps-and-cfd-scratch'
	for (const cluster of clusters) {
		const actions = (cluster.members || []).filter(m => !m.shielded && (m.action === 'delete' || m.action === 'hardlink'))
		if (actions.length === 0) {
			continue
		}
		lines.push(`# Cluster: ${cluster.name} | Family: ${cluster.familyLabel} | Survivor: ${cluster.survivorPath}`)
		for (const target of actions) {
			actionCount += 1
			if (target.action === 'hardlink' && !target.isMutableFile && !target.isCfdScratchPath) {
				lines.push(`run_cmd ln -f ${quotePosixPath(cluster.survivorPath)} ${quotePosixPath(target.normalized)}`)
			} else if (strategy === 'quarantine-uncompressed-dumps-and-scratch' && (target.isUncompressedResultDump || target.isCfdScratchPath)) {
				lines.push('run_cmd mkdir -p "$QUARANTINE_DIR"')
				lines.push(`run_cmd mv -n ${quotePosixPath(target.normalized)} "$QUARANTINE_DIR/"`)
			} else {
				lines.push(`run_cmd rm -f ${quotePosixPath(target.normalized)}`)
			}
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('printf "No reclaimable uncompressed .vtk/.vtu/.odb/.rst/.dat dumps or CFD/FEA scratch under active vault shields.\\n"')
	} else {
		lines.push(`printf "Completed Aerospace CFD/FEA Vault remediation plan (%d target actions, DRY_RUN=%s).\\n" "${actionCount}" "$DRY_RUN"`)
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe RFC-4180 CSV audit report.
 *
 * @param {object} auditResult Result from auditAerospaceCfdVault.
 * @return {string} RFC-4180 CSV string.
 */
export function buildAerospaceCfdCsvReport(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const headers = [
		'cluster_id',
		'cluster_name',
		'solver_toolchain',
		'simulation_stage',
		'case_stem',
		'archive_anchor_key',
		'family',
		'cluster_verdict',
		'has_compressed_archive_anchor',
		'is_redundant_uncompressed',
		'is_cfd_scratch',
		'member_path',
		'artifact_kind',
		'vault_role',
		'aero_tag',
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
				cluster.solverToolchain || '',
				cluster.simulationStage || '',
				cluster.caseStem,
				cluster.archiveAnchorKey,
				cluster.family,
				cluster.clusterVerdict,
				cluster.hasCompressedArchiveAnchor ? 'true' : 'false',
				member.isRedundantUncompressedMember ? 'true' : 'false',
				member.isCfdScratchPath ? 'true' : 'false',
				member.normalized,
				member.artifactKind,
				member.vaultRole,
				member.aeroTag || '',
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
 * @param {object} auditResult Result from auditAerospaceCfdVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildAerospaceCfdJsonManifest(auditResult) {
	const payload = {
		schema: AEROSPACE_CFD_VAULT_SCHEMA,
		generatedAt: new Date().toISOString(),
		config: auditResult?.config || AEROSPACE_CFD_DEFAULT_CONFIG,
		summary: auditResult?.summary || {},
		clusters: (auditResult?.clusters || []).map(cluster => ({
			id: cluster.id,
			name: cluster.name,
			solverToolchain: cluster.solverToolchain,
			simulationStage: cluster.simulationStage,
			caseStem: cluster.caseStem,
			archiveAnchorKey: cluster.archiveAnchorKey,
			family: cluster.family,
			clusterVerdict: cluster.clusterVerdict,
			unitBytes: cluster.unitBytes,
			totalBytes: cluster.totalBytes,
			reclaimableBytes: cluster.reclaimableBytes,
			survivorPath: cluster.survivorPath,
			hasProtectedGeometryDeck: cluster.hasProtectedGeometryDeck,
			hasProtectedCompressedCheckpoint: cluster.hasProtectedCompressedCheckpoint,
			hasProtectedFlightCert: cluster.hasProtectedFlightCert,
			hasRedundantUncompressedDump: cluster.hasRedundantUncompressedDump,
			hasCfdScratchIntermediate: cluster.hasCfdScratchIntermediate,
			hasCompressedArchiveAnchor: cluster.hasCompressedArchiveAnchor,
			aeroTags: cluster.aeroTags,
			members: (cluster.members || []).map(member => ({
				path: member.normalized,
				artifactKind: member.artifactKind,
				vaultRole: member.vaultRole,
				aeroTag: member.aeroTag || '',
				governanceTier: member.governanceTier,
				action: member.action,
				shielded: member.shielded,
				protectedReason: member.protectedReason,
				isRedundantUncompressedMember: member.isRedundantUncompressedMember,
				isCfdScratchPath: member.isCfdScratchPath,
				isMutableFile: member.isMutableFile,
				isSurvivor: member.isSurvivor,
				size: member.size,
			})),
		})),
	}
	return JSON.stringify(payload, null, 2)
}

/**
 * Generate a Nextcloud/rsync .sync-exclude.lst rule set to prevent accidental
 * cloud sync of OpenFOAM processorN/ partitions, Fluent/Abaqus/Nastran scratch dirs,
 * and transient solver lock/restart files.
 *
 * @return {string} Line-delimited .sync-exclude.lst rules.
 */
export function buildAerospaceCfdSyncExcludeList() {
	return [
		'# Nextcloud / rsync exclusion rules for Aerospace, CFD & FEA Simulation Vaults',
		'processor*/',
		'dynamicCode/',
		'postProcessing/tmp/',
		'fluent_tmp/',
		'ansys_tmp/',
		'abaqus_tmp/',
		'nastran_scratch/',
		'starccm_tmp/',
		'cfx_tmp/',
		'paraview_cache/',
		'solver_scratch/',
		'mesh_tmp/',
		'*.res.tmp',
		'*.cas.tmp',
		'*.dat.tmp',
		'*.foam.tmp',
		'*.lck',
		'*.lock',
		'*.tmp',
	].join('\n')
}
