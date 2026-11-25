/**
 * Pure Particle Physics, HEP Detector & Synchrotron Beamline Vault Auditor.
 * Classifies and audits duplicate clusters across 4 Particle Physics & Beamline Vault families:
 * - Detector Calibration, GDML Geometry & Beam Safety Holds (.gdml, .geom, .cal, .ped, .epics, .tango, .sqlite, .db, .json, .xml, CERN/SLAC/DESY/ESRF beam-run & radiation holds)
 * - Raw Event Streams, ROOT Trees & Synchrotron Masters (.root, .rntuple, .nxs, .h5, .hdf5, .lhe, .hepmc, .hepmc3, .slcio, .edm4hep, .evio, .mid, .cbf, .edf, .mar3450)
 * - Redundant N-Tuple CSV, ASCII & Plot Exports (.csv, .tsv, .txt, .dat, .parquet, .feather, .xlsx, .png, .pdf, .svg, .eps in HEP/ROOT/beamline context)
 * - GEANT4, CMSSW, Pythia & Reconstruction Scratch (geant4_tmp/, cmssw_work/, root_cache/, pythia_scratch/, madgraph_tmp/, xrootd_staging/, beam_recon_tmp/, cvmfs_cache/, .root.tmp, .nxs.part, .h5.lock, .lhe.tmp, .evio.idx, .lck)
 *
 * Enforces strict Beam Safety Hold, GDML/Calibration Baseline, and Raw ROOT/NeXus Master conservation defaults:
 * - Strictly conserves radiation safety, beam-interlock, run-committee, and experiment-collaboration holds
 * - Strictly conserves GDML detector geometry, EPICS/Tango run logs, pedestal/alignment databases, and magnetic-field maps
 * - Strictly conserves verified CERN ROOT/RNTuple trees, NeXus/HDF5 beamline masters, LHE/HepMC/EDM4hep event records, and Pilatus/Eiger CBF/EDF frames
 * - Detects redundant N-tuple CSV/Parquet tables and histogram plots when a verified ROOT, NeXus, or Event master anchor exists
 * - Blocks pruning of derived N-tuple/plot exports lacking a verified HEP or Beamline master anchor when guard is active
 * - Blocks hardlinks on mutable GDML, XML, JSON, CSV, Parquet, LHE, HepMC, and simulation scratch files
 *
 * Generates DRY_RUN=1 POSIX remediation scripts, CWE-1236-safe CSV reports, JSON audit
 * manifests, and .sync-exclude.lst rules. Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const PARTICLE_PHYSICS_HEP_VAULT_SCHEMA = 'duplicatefinder.particle-physics-hep-vault-auditor.v1'

export const PARTICLE_PHYSICS_HEP_FAMILIES = Object.freeze([
	'all',
	'hep-calibration-beam-logs',
	'hep-root-beamline-masters',
	'redundant-hep-ntuple-exports',
	'hep-sim-recon-scratch',
])

export const PARTICLE_PHYSICS_HEP_FAMILY_META = Object.freeze({
	'hep-calibration-beam-logs': {
		id: 'hep-calibration-beam-logs',
		label: 'Calib, GDML & Beam Holds',
		shortLabel: 'Detector GDML, EPICS/Tango Logs, Pedestal DBs & Safety Holds (.gdml, .cal, .ped, .epics, .sqlite)',
	},
	'hep-root-beamline-masters': {
		id: 'hep-root-beamline-masters',
		label: 'ROOT, NeXus & Event Masters',
		shortLabel: 'Verified Raw & Tree Masters (.root, .rntuple, .nxs, .h5, .lhe, .hepmc, .slcio, .evio, .cbf, .edf)',
	},
	'redundant-hep-ntuple-exports': {
		id: 'redundant-hep-ntuple-exports',
		label: 'Redundant N-Tuple & Plots',
		shortLabel: 'Derived N-Tuple & Histogram Exports (.csv, .parquet, .dat, .xlsx, .png, .pdf, .svg)',
	},
	'hep-sim-recon-scratch': {
		id: 'hep-sim-recon-scratch',
		label: 'GEANT4, CMSSW & Recon Scratch',
		shortLabel: 'Simulation & Recon Scratch (geant4_tmp/, cmssw_work/, root_cache/, pythia_scratch/, xrootd_staging/, .root.tmp)',
	},
})

export const PARTICLE_PHYSICS_HEP_STRATEGIES = Object.freeze([
	'prune-exports-and-beam-scratch',
	'hardlink-immutable-root-and-nxs',
	'quarantine-exports-and-beam-scratch',
])

export const PARTICLE_PHYSICS_HEP_SURVIVOR_RULES = Object.freeze([
	'hep-calibration-root-first',
	'oldest-beam-run-first',
	'newest-recon-first',
	'shortest-path',
])

export const PARTICLE_PHYSICS_HEP_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'hep-calibration-protected',
	'root-beamline-protected',
	'beam-safety-hold-protected',
	'hep-export-redundant',
	'sim-recon-scratch',
	'shielded',
])

export const PARTICLE_PHYSICS_HEP_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const PARTICLE_PHYSICS_HEP_PRESETS = Object.freeze([
	{
		id: 'all-particle-physics-hep-audit',
		name: 'All Particle & HEP Vaults',
		description: 'Audit detector GDML/calibration baselines, beam-safety holds, ROOT/NeXus/LHE/CBF masters, redundant N-tuple/plot exports, and GEANT4/CMSSW scratch.',
		familyFilter: 'all',
		strategy: 'prune-exports-and-beam-scratch',
		survivorRule: 'hep-calibration-root-first',
		protectCalibrationAndGeometry: true,
		protectRootAndBeamlineMasters: true,
		protectBeamSafetyHolds: true,
		requireHepAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'geant4-cmssw-scratch-cleanup',
		name: 'GEANT4, CMSSW & Recon Scratch',
		description: 'Reclaim geant4_tmp/, cmssw_work/, root_cache/, pythia_scratch/, xrootd_staging/, and .root.tmp/.nxs.part scratch older than the active run grace window.',
		familyFilter: 'all',
		strategy: 'prune-exports-and-beam-scratch',
		survivorRule: 'hep-calibration-root-first',
		protectCalibrationAndGeometry: true,
		protectRootAndBeamlineMasters: true,
		protectBeamSafetyHolds: true,
		requireHepAnchorForPrune: true,
		keepRecentRunDays: 14,
		minSizeKb: 0,
	},
	{
		id: 'redundant-ntuple-vs-root-nxs',
		name: 'Redundant Exports vs ROOT/NeXus',
		description: 'Detect derived N-tuple CSV/Parquet tables and histogram quicklook plots backed by a verified ROOT, NeXus, LHE, or CBF master anchor.',
		familyFilter: 'redundant-hep-ntuple-exports',
		strategy: 'quarantine-exports-and-beam-scratch',
		survivorRule: 'hep-calibration-root-first',
		protectCalibrationAndGeometry: true,
		protectRootAndBeamlineMasters: true,
		protectBeamSafetyHolds: true,
		requireHepAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'calibration-gdml-safety-shield',
		name: 'Calib, GDML & Safety Holds Shield',
		description: 'Inspect GDML detector geometries, EPICS/Tango beamline logs, alignment/pedestal DBs, and radiation/interlock holds under strict conservation shield.',
		familyFilter: 'hep-calibration-beam-logs',
		strategy: 'hardlink-immutable-root-and-nxs',
		survivorRule: 'hep-calibration-root-first',
		protectCalibrationAndGeometry: true,
		protectRootAndBeamlineMasters: true,
		protectBeamSafetyHolds: true,
		requireHepAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'raw-root-nxs-event-masters',
		name: 'ROOT, NeXus & Event Masters',
		description: 'Audit verified CERN ROOT/RNTuple trees, synchrotron NeXus/HDF5 scans, LHE/HepMC/EDM4hep event records, and Pilatus/Eiger CBF/EDF detector masters.',
		familyFilter: 'hep-root-beamline-masters',
		strategy: 'hardlink-immutable-root-and-nxs',
		survivorRule: 'hep-calibration-root-first',
		protectCalibrationAndGeometry: true,
		protectRootAndBeamlineMasters: true,
		protectBeamSafetyHolds: true,
		requireHepAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
])

export const PARTICLE_PHYSICS_HEP_DEFAULT_CONFIG = Object.freeze({
	presetId: 'all-particle-physics-hep-audit',
	familyFilter: 'all',
	verdictFilter: 'all',
	strategy: 'prune-exports-and-beam-scratch',
	survivorRule: 'hep-calibration-root-first',
	sortMode: 'reclaim_desc',
	searchQuery: '',
	protectCalibrationAndGeometry: true,
	protectRootAndBeamlineMasters: true,
	protectBeamSafetyHolds: true,
	requireHepAnchorForPrune: true,
	keepRecentRunDays: 0,
	minSizeKb: 0,
})

const STRICT_HEP_CALIB_EXT_RE = /\.(?:gdml|geom|cal|ped|epics|tango|bmap)$/i
const CONTEXT_HEP_CALIB_EXT_RE = /\.(?:sqlite|sqlite3|db|json|xml|yaml|yml)$/i
const STRICT_HEP_MASTER_EXT_RE = /\.(?:root|rntuple|nxs|lhe|hepmc|hepmc3|slcio|edm4hep|evio|mid|cbf|edf|mar3450)$/i
const CONTEXT_SYNCHROTRON_H5_EXT_RE = /\.(?:h5|hdf5)$/i
const CONTEXT_HEP_EXPORT_EXT_RE = /\.(?:csv|tsv|txt|dat|parquet|feather|xlsx|png|pdf|svg|eps)$/i
const STRICT_HEP_SCRATCH_EXT_RE = /\.(?:root\.tmp|root\.part|nxs\.part|nxs\.tmp|h5\.lock|h5\.tmp|lhe\.tmp|hepmc\.tmp|evio\.idx|cbf\.tmp|mid\.tmp|lck)$/i
const GENERIC_SCRATCH_EXT_RE = /\.(?:tmp|bak|lock|dmp|part|idx|log)$/i

const NON_HEP_EXCLUSION_RE = /(?:orbital|cadu|vcdu|ccsds|satnogs|neuro|electrophys|bids|dicom|nifti|hydrograph|multibeam|kmall|s7k|seismic|segy|photoshop|lightroom|premiere|davinci)/i
const HEP_CONTEXT_HINT_RE = /(?:hep|particle|cern|slac|desy|esrf|fermilab|fnal|kek|jlab|bnl|lhc|cms|atlas|alice|lhcb|synchrotron|beamline|beam_?line|detector|calorimeter|tracker|muon|geant4|cmssw|athena|pythia|madgraph|delphes|root_?tree|rntuple|nexus|epics|tango_?ioc|xrootd|cvmfs|pilatus|eiger|diffraction|pedestal|luminosity|collider|accelerator|rf_?cavity)/i
const HEP_SAFETY_HOLD_PATH_RE = /(?:beam_?hold|radiation_?hold|interlock_?hold|run_?committee_?hold|collaboration_?hold|unblind_?hold|dosimetry_?hold|lhc_?archive_?hold|safety_?hold|calibration_?freeze)/i
const HEP_CALIB_BASELINE_PATH_RE = /(?:00_calib|00_gdml|00_geometry|00_epics|00_tango|00_alignment|calib_db|detector_geometry|pedestals|field_?maps|interlock_?logs)/i
const HEP_SCRATCH_PATH_RE = /(?:geant4_tmp|geant4_cache|cmssw_work|cmssw_tmp|root_cache|root_tmp|pythia_scratch|madgraph_tmp|xrootd_staging|beam_recon_tmp|cvmfs_cache|athena_scratch|delphes_tmp|sim_staging|recon_scratch|event_spill)/i
const HEP_INTERMEDIATE_PREFIX_RE = /^(?:tmp_root_|tmp_nxs_|tmp_g4_|tmp_geant4_|tmp_cmssw_|tmp_pythia_|tmp_recon_|tmp_beam_|spill_evt_|cache_h5_)/i
const HEP_INTERMEDIATE_SUFFIX_RE = /(?:_g4_tmp|_geant4_tmp|_cmssw_tmp|_root_tmp|_pythia_tmp|_recon_tmp|_staging)$/i
const HEP_EXPORT_PATH_RE = /(?:ntuple_exports|ntuple_csv|histogram_plots|hist_plots|beam_plots|quicklooks|ascii_exports|parquet_exports|_ntuple|_hist_plot|_quicklook|_ascii_export)/i
const CANONICAL_HEP_VAULT_PATH_RE = /(?:00_raw|00_root|00_nxs|00_nexus|00_events|00_beamline|00_run_masters|canonical|experiment_archive|beam_archive)/i

/**
 * Normalize configuration values for Particle Physics, HEP Detector & Synchrotron Beamline Vault auditing.
 *
 * @param {object} [rawConfig] Raw user configuration.
 * @return {object} Normalized configuration.
 */
export function normalizeParticlePhysicsHepConfig(rawConfig = {}) {
	const cfg = rawConfig && typeof rawConfig === 'object' ? rawConfig : {}
	const familyFilter = PARTICLE_PHYSICS_HEP_FAMILIES.includes(cfg.familyFilter)
		? cfg.familyFilter
		: PARTICLE_PHYSICS_HEP_DEFAULT_CONFIG.familyFilter
	const verdictFilter = PARTICLE_PHYSICS_HEP_VERDICT_FILTERS.includes(cfg.verdictFilter)
		? cfg.verdictFilter
		: PARTICLE_PHYSICS_HEP_DEFAULT_CONFIG.verdictFilter
	const strategy = PARTICLE_PHYSICS_HEP_STRATEGIES.includes(cfg.strategy)
		? cfg.strategy
		: PARTICLE_PHYSICS_HEP_DEFAULT_CONFIG.strategy
	const survivorRule = PARTICLE_PHYSICS_HEP_SURVIVOR_RULES.includes(cfg.survivorRule)
		? cfg.survivorRule
		: PARTICLE_PHYSICS_HEP_DEFAULT_CONFIG.survivorRule
	const sortMode = PARTICLE_PHYSICS_HEP_SORT_MODES.includes(cfg.sortMode)
		? cfg.sortMode
		: PARTICLE_PHYSICS_HEP_DEFAULT_CONFIG.sortMode

	const keepRecentParsed = Number(cfg.keepRecentRunDays)
	const keepRecentRunDays = Number.isFinite(keepRecentParsed) && keepRecentParsed >= 0
		? Math.floor(keepRecentParsed)
		: PARTICLE_PHYSICS_HEP_DEFAULT_CONFIG.keepRecentRunDays

	const minSizeParsed = Number(cfg.minSizeKb)
	const minSizeKb = Number.isFinite(minSizeParsed) && minSizeParsed > 0
		? minSizeParsed
		: 0

	return {
		presetId: typeof cfg.presetId === 'string' && cfg.presetId ? cfg.presetId : PARTICLE_PHYSICS_HEP_DEFAULT_CONFIG.presetId,
		familyFilter,
		verdictFilter,
		strategy,
		survivorRule,
		sortMode,
		searchQuery: typeof cfg.searchQuery === 'string' ? cfg.searchQuery.trim() : '',
		protectCalibrationAndGeometry: cfg.protectCalibrationAndGeometry !== undefined ? Boolean(cfg.protectCalibrationAndGeometry) : true,
		protectRootAndBeamlineMasters: cfg.protectRootAndBeamlineMasters !== undefined ? Boolean(cfg.protectRootAndBeamlineMasters) : true,
		protectBeamSafetyHolds: cfg.protectBeamSafetyHolds !== undefined ? Boolean(cfg.protectBeamSafetyHolds) : true,
		requireHepAnchorForPrune: cfg.requireHepAnchorForPrune !== undefined ? Boolean(cfg.requireHepAnchorForPrune) : true,
		keepRecentRunDays,
		minSizeKb,
		memberOverrides: cfg.memberOverrides && typeof cfg.memberOverrides === 'object' ? { ...cfg.memberOverrides } : {},
	}
}

/**
 * Extract normalized beamline run or physics dataset stem by stripping extensions and export suffixes.
 *
 * @param {string} basename Filename without directory.
 * @param {string} [normalized] Full normalized path.
 * @return {string} Normalized run/dataset stem.
 */
export function extractParticlePhysicsHepStem(basename, normalized = '') {
	let stem = String(basename || normalized || '').trim().toLowerCase()
	stem = stem.replace(/\.(?:root\.tmp|root\.part|nxs\.part|nxs\.tmp|h5\.lock|h5\.tmp|lhe\.tmp|hepmc\.tmp|evio\.idx|cbf\.tmp|mid\.tmp)$/i, '')
	stem = stem.replace(/\.[a-z0-9]{1,8}$/i, '')
	stem = stem.replace(HEP_INTERMEDIATE_PREFIX_RE, '')
	stem = stem.replace(HEP_INTERMEDIATE_SUFFIX_RE, '')
	stem = stem.replace(/(?:[-_](?:ntuple|hist|histogram|plot|quicklook|ascii|csv|parquet|export|summary|report|preview|copy|bak|draft|v\d+|rev\d+))+$/i, '')
	return stem || 'hep-run'
}

/**
 * Extract canonical anchor key linking derived N-tuple CSV/Parquet/plot exports to ROOT/NeXus/Event masters.
 *
 * @param {string} runStem Extracted run stem.
 * @return {string} Canonical anchor key.
 */
export function extractParticlePhysicsHepAnchorKey(runStem) {
	return String(runStem || 'hep-run')
		.toLowerCase()
		.replace(/(?:[-_](?:root|rntuple|nxs|h5|hdf5|lhe|hepmc|hepmc3|slcio|edm4hep|evio|mid|cbf|edf|gdml|cal|ped|ntuple|hist|plot|quicklook|export))$/i, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '') || 'hep-run'
}

/**
 * Detect Particle Physics, HEP Detector & Synchrotron toolchain and workflow stage from path and filename.
 *
 * @param {string} normalized Normalized path.
 * @param {string} basename Filename.
 * @return {{ hepToolchain: string, workflowStage: string }} Detected toolchain and stage.
 */
function extractHepToolchainAndStage(normalized, basename) {
	const text = `${normalized} ${basename}`.toLowerCase()
	let hepToolchain = ''
	if (/\.(?:gdml|geom|bmap)\b/.test(text)) {
		hepToolchain = 'GDML / Detector Geometry'
	} else if (/\.(?:epics|tango)\b|epics|tango_?ioc|interlock/.test(text)) {
		hepToolchain = 'EPICS / Tango Beamline Control'
	} else if (/\.(?:cal|ped)\b|pedestal|alignment/.test(text)) {
		hepToolchain = 'Detector Calibration / Pedestal DB'
	} else if (/\.(?:root|rntuple)\b/.test(text)) {
		hepToolchain = 'CERN ROOT / RNTuple'
	} else if (/\.(?:nxs)\b|nexus/.test(text)) {
		hepToolchain = 'NeXus / HDF5 Synchrotron'
	} else if (/\.(?:cbf|edf|mar3450)\b|pilatus|eiger/.test(text)) {
		hepToolchain = 'Pilatus / Eiger X-Ray Detector'
	} else if (/\.(?:lhe|hepmc|hepmc3)\b|pythia|madgraph/.test(text)) {
		hepToolchain = 'Pythia / MadGraph / HepMC Event Gen'
	} else if (/\.(?:slcio|edm4hep|evio|mid)\b/.test(text)) {
		hepToolchain = 'LCIO / EDM4hep / EVIO / MIDAS DAQ'
	} else if (/geant4|cmssw|athena|delphes/.test(text)) {
		hepToolchain = 'GEANT4 / CMSSW / Athena Recon'
	} else if (/xrootd|cvmfs/.test(text)) {
		hepToolchain = 'XRootD / CVMFS Grid Cache'
	}

	let workflowStage = ''
	if (HEP_SAFETY_HOLD_PATH_RE.test(text)) {
		workflowStage = 'Radiation / Beam-Interlock / Unblind Hold'
	} else if (STRICT_HEP_CALIB_EXT_RE.test(basename) || HEP_CALIB_BASELINE_PATH_RE.test(text)) {
		workflowStage = 'Detector Geometry & Calibration Baseline'
	} else if (HEP_SCRATCH_PATH_RE.test(text) || STRICT_HEP_SCRATCH_EXT_RE.test(basename) || HEP_INTERMEDIATE_PREFIX_RE.test(basename) || HEP_INTERMEDIATE_SUFFIX_RE.test(basename)) {
		workflowStage = 'GEANT4 / CMSSW / Recon Staging Scratch'
	} else if (HEP_EXPORT_PATH_RE.test(text) || (CONTEXT_HEP_EXPORT_EXT_RE.test(basename) && HEP_CONTEXT_HINT_RE.test(text))) {
		workflowStage = 'Derived N-Tuple / Histogram Plot Export'
	} else if (STRICT_HEP_MASTER_EXT_RE.test(basename) || (CONTEXT_SYNCHROTRON_H5_EXT_RE.test(basename) && HEP_CONTEXT_HINT_RE.test(text))) {
		workflowStage = 'Raw Event Stream / ROOT / NeXus Master'
	}

	return { hepToolchain, workflowStage }
}

/**
 * Extract concise Particle Physics & HEP domain tag badge when present.
 *
 * @param {string} lowerBase Lowercase filename.
 * @param {string} lowerPath Lowercase full path.
 * @return {string} Short tag or empty string.
 */
function extractHepDomainTag(lowerBase, lowerPath) {
	const text = `${lowerPath} ${lowerBase}`
	if (HEP_SAFETY_HOLD_PATH_RE.test(text)) {
		return 'SAFETY / UNBLIND HOLD'
	}
	if (/\.(?:gdml|geom|bmap)\b/.test(lowerBase)) {
		return 'GDML GEOMETRY'
	}
	if (/\.(?:cal|ped|epics|tango)\b/.test(lowerBase)) {
		return 'CALIB / EPICS LOG'
	}
	if (/\.(?:root|rntuple)\b/.test(lowerBase)) {
		return 'CERN ROOT TREE'
	}
	if (/\.nxs\b/.test(lowerBase)) {
		return 'NEXUS BEAMLINE'
	}
	if (/\.(?:lhe|hepmc|hepmc3)\b/.test(lowerBase)) {
		return 'LHE / HEPMC EVENTS'
	}
	if (/\.(?:slcio|edm4hep|evio|mid)\b/.test(lowerBase)) {
		return 'DAQ EVENT MASTER'
	}
	if (/\.(?:cbf|edf|mar3450)\b/.test(lowerBase)) {
		return 'SYNCHROTRON FRAME'
	}
	if (/\.(?:h5|hdf5)\b/.test(lowerBase) && HEP_CONTEXT_HINT_RE.test(text)) {
		return 'HDF5 BEAM MASTER'
	}
	if (STRICT_HEP_SCRATCH_EXT_RE.test(lowerBase)) {
		return 'SIM / RECON SCRATCH'
	}
	return ''
}

/**
 * Parse file mtime into epoch milliseconds and age in days.
 *
 * @param {object} file Duplicate file entry.
 * @param {number} referenceNowMs Reference current time in ms.
 * @return {{ mtimeMs: number|null, ageDays: number|null, formattedMtime: string }} Parsed timestamps.
 */
function parseFileTime(file, referenceNowMs) {
	const raw = file?.mtime ?? file?.modified ?? file?.lastModified ?? null
	if (raw === null || raw === undefined || raw === '') {
		return { mtimeMs: null, ageDays: null, formattedMtime: '' }
	}
	let mtimeMs = null
	if (typeof raw === 'number' && Number.isFinite(raw)) {
		mtimeMs = raw < 1e12 ? raw * 1000 : raw
	} else if (typeof raw === 'string') {
		const num = Number(raw)
		if (Number.isFinite(num) && raw.trim() !== '') {
			mtimeMs = num < 1e12 ? num * 1000 : num
		} else {
			const parsed = Date.parse(raw)
			if (Number.isFinite(parsed)) {
				mtimeMs = parsed
			}
		}
	}
	if (mtimeMs === null || !Number.isFinite(mtimeMs)) {
		return { mtimeMs: null, ageDays: null, formattedMtime: '' }
	}
	const ageDays = Math.max(0, Math.floor((referenceNowMs - mtimeMs) / (24 * 60 * 60 * 1000)))
	const formattedMtime = formatFileModifiedTime(Math.floor(mtimeMs / 1000)) || ''
	return { mtimeMs, ageDays, formattedMtime }
}

/**
 * Classify a single file within the Particle Physics, HEP Detector & Synchrotron Beamline domain.
 *
 * @param {object} file Duplicate file object.
 * @param {number} [referenceNowMs] Reference current timestamp in ms.
 * @return {object} Classification metadata (family === null if non-domain file).
 */
export function classifyParticlePhysicsHepFile(file, referenceNowMs = Date.now()) {
	const rawPath = String(file?.path || file?.name || '')
	const normalized = normalizePathForDiff(rawPath)
	const lower = normalized.toLowerCase()
	const slashIdx = normalized.lastIndexOf('/')
	const basename = slashIdx >= 0 ? normalized.slice(slashIdx + 1) : normalized
	const dirname = slashIdx >= 0 ? normalized.slice(0, slashIdx) : ''
	const lowerBase = basename.toLowerCase()
	const size = Math.max(0, Number(file?.size) || 0)
	const { mtimeMs, ageDays, formattedMtime } = parseFileTime(file, referenceNowMs)

	const hasExcludedContext = NON_HEP_EXCLUSION_RE.test(lower)
	const hasHepContext = !hasExcludedContext && HEP_CONTEXT_HINT_RE.test(lower)
	const isCalibBaselinePath = !hasExcludedContext && HEP_CALIB_BASELINE_PATH_RE.test(lower)
	const isSafetyHoldPath = !hasExcludedContext && HEP_SAFETY_HOLD_PATH_RE.test(lower)
	const isCanonicalVaultPath = !hasExcludedContext && CANONICAL_HEP_VAULT_PATH_RE.test(lower)
	const isScratchPath = !hasExcludedContext && HEP_SCRATCH_PATH_RE.test(lower)
	const isHepExportPath = !hasExcludedContext && HEP_EXPORT_PATH_RE.test(lower)

	const isStrictScratchExt = !hasExcludedContext && STRICT_HEP_SCRATCH_EXT_RE.test(lowerBase)
	const isGenericScratchExt = GENERIC_SCRATCH_EXT_RE.test(lowerBase)
	const isIntermediateSubfile = !hasExcludedContext && (HEP_INTERMEDIATE_PREFIX_RE.test(lowerBase) || HEP_INTERMEDIATE_SUFFIX_RE.test(lowerBase))

	const isCalibrationOrGeometry = !hasExcludedContext && (
		STRICT_HEP_CALIB_EXT_RE.test(lowerBase)
		|| (CONTEXT_HEP_CALIB_EXT_RE.test(lowerBase) && (hasHepContext || isCalibBaselinePath || isSafetyHoldPath))
	)

	const isSynchrotronH5Master = CONTEXT_SYNCHROTRON_H5_EXT_RE.test(lowerBase)
		&& !hasExcludedContext
		&& (hasHepContext || isCanonicalVaultPath)
	const isStrictRootOrMasterExt = !hasExcludedContext && (
		STRICT_HEP_MASTER_EXT_RE.test(lowerBase)
		|| isSynchrotronH5Master
	)

	const isContextExport = !hasExcludedContext
		&& !isStrictRootOrMasterExt
		&& !isCalibrationOrGeometry
		&& CONTEXT_HEP_EXPORT_EXT_RE.test(lowerBase)
		&& (hasHepContext || isHepExportPath)

	let family = null
	let artifactKind = 'Unknown'
	let vaultRole = 'Outside Particle Physics & HEP Beamline Vault'
	let isProtectedCalibrationGeometry = false
	let isProtectedRootBeamlineMaster = false
	let isProtectedBeamSafetyHold = false
	let isHepMasterAnchor = false
	let isRedundantHepExport = false
	let isMutableFile = false

	if (
		isStrictScratchExt
		|| (isScratchPath && (isGenericScratchExt || isContextExport || isStrictRootOrMasterExt || isCalibrationOrGeometry))
		|| (isIntermediateSubfile && (isStrictRootOrMasterExt || isContextExport || hasHepContext))
		|| (isGenericScratchExt && hasHepContext)
	) {
		family = 'hep-sim-recon-scratch'
		artifactKind = isStrictScratchExt
			? 'ROOT / NeXus / Event Staging Scratch'
			: (isIntermediateSubfile ? 'GEANT4 / CMSSW Intermediate Cache' : 'Pythia / MadGraph / XRootD Scratch')
		vaultRole = 'GEANT4, CMSSW, Pythia, XRootD or Beamline Recon Scratch'
		isMutableFile = true
	} else if (isSafetyHoldPath && (isCalibrationOrGeometry || isStrictRootOrMasterExt || isContextExport || hasHepContext)) {
		family = 'hep-calibration-beam-logs'
		artifactKind = 'Radiation / Beam-Interlock / Unblind Hold'
		vaultRole = 'Protected Experiment & Beamline Safety Hold'
		isProtectedBeamSafetyHold = true
		isProtectedCalibrationGeometry = true
		isHepMasterAnchor = isStrictRootOrMasterExt || isCalibrationOrGeometry
		isMutableFile = /\.(?:gdml|geom|cal|ped|epics|tango|sqlite|sqlite3|db|json|xml|yaml|yml|csv|tsv|txt|log)$/i.test(lowerBase) || isCalibrationOrGeometry
	} else if (isCalibrationOrGeometry) {
		family = 'hep-calibration-beam-logs'
		if (/\.(?:gdml|geom|bmap)$/i.test(lowerBase)) {
			artifactKind = 'GDML Detector Geometry / Magnetic Field Map'
			vaultRole = 'Canonical GEANT4 / Detector Volume Baseline'
		} else if (/\.(?:epics|tango)$/i.test(lowerBase)) {
			artifactKind = 'EPICS / Tango IOC Beamline Control Log'
			vaultRole = 'Canonical Accelerator & Magnet Interlock Log'
		} else {
			artifactKind = 'Detector Calibration / Pedestal / Alignment DB'
			vaultRole = 'Canonical Gain, Alignment & Run Condition Baseline'
		}
		isProtectedCalibrationGeometry = true
		isHepMasterAnchor = true
		isMutableFile = true
	} else if (isStrictRootOrMasterExt) {
		family = 'hep-root-beamline-masters'
		if (/\.(?:root|rntuple)$/i.test(lowerBase)) {
			artifactKind = 'CERN ROOT / RNTuple Analysis Tree Master'
			vaultRole = 'Canonical Event & Histogram Tree Master'
		} else if (/\.nxs$/i.test(lowerBase) || isSynchrotronH5Master) {
			artifactKind = 'NeXus / HDF5 Synchrotron Beamline Master'
			vaultRole = 'Unaltered Diffraction, SAXS or Tomography Master'
		} else if (/\.(?:lhe|hepmc|hepmc3)$/i.test(lowerBase)) {
			artifactKind = 'LHE / HepMC Monte Carlo Event Master'
			vaultRole = 'Canonical Parton & Generator Event Stream'
		} else if (/\.(?:cbf|edf|mar3450)$/i.test(lowerBase)) {
			artifactKind = 'Pilatus / Eiger X-Ray Detector Frame Master'
			vaultRole = 'Raw Synchrotron Area-Detector Frame Master'
		} else {
			artifactKind = 'LCIO / EDM4hep / EVIO / MIDAS DAQ Master'
			vaultRole = 'Canonical Raw Detector Readout Stream'
		}
		isProtectedRootBeamlineMaster = true
		isHepMasterAnchor = true
		isMutableFile = /\.(?:lhe|hepmc|hepmc3|xml|json)$/i.test(lowerBase)
	} else if (isContextExport) {
		family = 'redundant-hep-ntuple-exports'
		if (/\.(?:csv|tsv|txt|dat|parquet|feather|xlsx)$/i.test(lowerBase)) {
			artifactKind = 'Derived N-Tuple / ASCII Table Export'
		} else {
			artifactKind = 'Histogram / Beamline Quicklook Plot Export'
		}
		vaultRole = 'Derived N-Tuple Table or Quicklook Plot Export'
		isRedundantHepExport = true
		isMutableFile = true
	}

	const { hepToolchain, workflowStage } = extractHepToolchainAndStage(normalized, basename)
	const runStem = extractParticlePhysicsHepStem(basename, normalized)
	const hepAnchorKey = extractParticlePhysicsHepAnchorKey(runStem)
	const hepTag = extractHepDomainTag(lowerBase, lower)

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
		hepToolchain,
		workflowStage,
		runStem,
		hepAnchorKey,
		hepTag,
		isProtectedCalibrationGeometry,
		isProtectedRootBeamlineMaster,
		isProtectedBeamSafetyHold,
		isHepMasterAnchor,
		isRedundantHepExport,
		isMutableFile,
		isScratchPath: isScratchPath || isStrictScratchExt || (isIntermediateSubfile && family === 'hep-sim-recon-scratch') || (isGenericScratchExt && hasHepContext),
		isCalibBaselinePath,
		isSafetyHoldPath,
		isCanonicalVaultPath,
	}
}

/**
 * Determine whether a duplicate group belongs to the Particle Physics, HEP & Synchrotron domain.
 *
 * @param {object} group Duplicate group.
 * @return {boolean} True when at least one file belongs to this domain.
 */
export function isParticlePhysicsHepGroup(group) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return false
	}
	return group.files.some(file => classifyParticlePhysicsHepFile(file).family !== null)
}

/**
 * Build cross-group correlation index linking verified ROOT/NeXus/Event/Calibration anchors
 * to derived N-tuple CSV/Parquet tables and histogram quicklook plots.
 *
 * @param {Array<object>} groups Domain duplicate groups.
 * @return {object} Correlation index.
 */
export function buildParticlePhysicsHepCorrelationIndex(groups) {
	const anchorStems = new Set()
	const anchorKeys = new Set()

	for (const group of Array.isArray(groups) ? groups : []) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (const file of group.files) {
			const meta = classifyParticlePhysicsHepFile(file)
			if (!meta.family) {
				continue
			}
			if (meta.isHepMasterAnchor) {
				anchorStems.add(meta.runStem)
				anchorKeys.add(meta.hepAnchorKey)
			}
		}
	}

	return {
		anchorStems,
		anchorKeys,
	}
}

/**
 * Determine primary family for a heterogeneous Particle Physics & HEP cluster.
 *
 * @param {Array<object>} members Classified members.
 * @return {string} Family ID.
 */
function resolveClusterFamily(members) {
	if (members.some(m => m.family === 'hep-calibration-beam-logs')) {
		return 'hep-calibration-beam-logs'
	}
	if (members.some(m => m.family === 'hep-root-beamline-masters')) {
		return 'hep-root-beamline-masters'
	}
	if (members.some(m => m.family === 'redundant-hep-ntuple-exports')) {
		return 'redundant-hep-ntuple-exports'
	}
	return 'hep-sim-recon-scratch'
}

/**
 * Compute deterministic survivor priority score for a Particle Physics & HEP vault member.
 *
 * @param {object} member Classified member.
 * @param {string} survivorRule Survivor rule.
 * @return {number} Priority score (higher wins).
 */
function scoreMemberForSurvivor(member, survivorRule) {
	const mtimeScore = member.mtimeMs !== null ? member.mtimeMs / 1e10 : 0
	const shortPathScore = 1000 - Math.min(999, member.normalized.length)

	if (survivorRule === 'oldest-beam-run-first') {
		const oldestScore = member.mtimeMs !== null ? -mtimeScore : 0
		return (member.isProtectedBeamSafetyHold ? 100000 : 0)
			+ (member.isProtectedCalibrationGeometry ? 97000 : 0)
			+ (member.isProtectedRootBeamlineMaster ? 94000 : 0)
			+ (member.isCanonicalVaultPath ? 25000 : 0)
			+ (member.isCalibBaselinePath ? 10000 : 0)
			+ (member.isScratchPath ? -55000 : 0)
			+ (member.isRedundantHepExport ? -40000 : 0)
			+ oldestScore
			+ shortPathScore
	}

	if (survivorRule === 'newest-recon-first') {
		return (member.isProtectedBeamSafetyHold ? 100000 : 0)
			+ (member.isProtectedCalibrationGeometry ? 97000 : 0)
			+ (member.isProtectedRootBeamlineMaster ? 94000 : 0)
			+ (member.isScratchPath ? -50000 : 0)
			+ (member.isRedundantHepExport ? -40000 : 0)
			+ mtimeScore
	}

	if (survivorRule === 'shortest-path') {
		return (member.isProtectedBeamSafetyHold ? 52000 : 0)
			+ (member.isProtectedCalibrationGeometry ? 50000 : 0)
			+ (member.isProtectedRootBeamlineMaster ? 48000 : 0)
			+ (member.isScratchPath ? -30000 : 0)
			+ shortPathScore
	}

	return (member.isProtectedBeamSafetyHold ? 100000 : 0)
		+ (member.isProtectedCalibrationGeometry ? 97000 : 0)
		+ (member.isProtectedRootBeamlineMaster ? 94000 : 0)
		+ (member.isCanonicalVaultPath ? 25000 : 0)
		+ (member.isCalibBaselinePath ? 10000 : 0)
		+ (member.isRedundantHepExport ? -45000 : 0)
		+ (member.isScratchPath ? -60000 : 0)
		+ shortPathScore
}

/**
 * Audit a single Particle Physics, HEP & Synchrotron duplicate cluster.
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
		const meta = classifyParticlePhysicsHepFile(file, referenceNowMs)
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
	const primaryToolchain = rawMembers.find(m => m.hepToolchain)?.hepToolchain || ''
	const primaryStage = rawMembers.find(m => m.workflowStage)?.workflowStage || ''
	const primaryStem = rawMembers[0].runStem || extractParticlePhysicsHepStem(primaryName, rawMembers[0].normalized)
	const primaryAnchorKey = rawMembers[0].hepAnchorKey || extractParticlePhysicsHepAnchorKey(primaryStem)

	const hasHepMasterAnchor = Boolean(
		rawMembers.some(m => m.isHepMasterAnchor)
		|| correlationIndex.anchorStems.has(primaryStem)
		|| correlationIndex.anchorKeys.has(primaryAnchorKey)
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

		const isRedundantHepExportMember = member.isRedundantHepExport && hasHepMasterAnchor

		let redundancyReason = ''
		if (member.isRedundantHepExport) {
			redundancyReason = isRedundantHepExportMember
				? 'Derived N-tuple table or histogram plot duplicates verified ROOT, NeXus, or Event master'
				: 'Derived N-tuple or plot export without verified ROOT, NeXus, or Event master anchor'
		}

		let governanceTier = 'sim-recon-scratch'
		let shielded = false
		let protectedReason = ''
		let action = 'keep'

		if (override === 'keep') {
			governanceTier = member.isProtectedBeamSafetyHold
				? 'beam-safety-hold-protected'
				: (member.isProtectedCalibrationGeometry
					? 'hep-calibration-protected'
					: (member.isProtectedRootBeamlineMaster
						? 'root-beamline-protected'
						: (member.isRedundantHepExport
							? 'hep-export-redundant'
							: 'sim-recon-scratch')))
			shielded = true
			protectedReason = 'Manually shielded via per-copy override'
		} else if (member.isProtectedBeamSafetyHold && config.protectBeamSafetyHolds) {
			governanceTier = 'beam-safety-hold-protected'
			shielded = true
			protectedReason = 'Radiation safety, beam-interlock, or experiment unblind hold strictly conserved'
		} else if (member.isProtectedCalibrationGeometry && config.protectCalibrationAndGeometry) {
			governanceTier = 'hep-calibration-protected'
			shielded = true
			protectedReason = 'GDML detector geometry, EPICS/Tango log, or calibration DB strictly conserved'
		} else if (member.isProtectedRootBeamlineMaster && config.protectRootAndBeamlineMasters) {
			governanceTier = 'root-beamline-protected'
			shielded = true
			protectedReason = 'Verified ROOT, NeXus/HDF5, LHE/HepMC, LCIO/EDM4hep, or CBF/EDF master strictly conserved'
		} else if (isSurvivor && !isRedundantHepExportMember) {
			governanceTier = member.isProtectedBeamSafetyHold
				? 'beam-safety-hold-protected'
				: (member.isProtectedCalibrationGeometry
					? 'hep-calibration-protected'
					: (member.isProtectedRootBeamlineMaster
						? 'root-beamline-protected'
						: (member.isRedundantHepExport
							? 'hep-export-redundant'
							: 'sim-recon-scratch')))
			shielded = true
			protectedReason = 'Canonical Particle Physics & HEP vault survivor retained'
		} else if (override === 'prune') {
			governanceTier = member.isRedundantHepExport
				? 'hep-export-redundant'
				: (member.isProtectedCalibrationGeometry
					? 'hep-calibration-protected'
					: 'sim-recon-scratch')
			action = config.strategy === 'hardlink-immutable-root-and-nxs' && !member.isMutableFile && !member.isScratchPath
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
			config.keepRecentRunDays > 0
			&& member.isScratchPath
			&& member.ageDays !== null
			&& member.ageDays < config.keepRecentRunDays
		) {
			governanceTier = 'sim-recon-scratch'
			shielded = true
			protectedReason = `Within ${config.keepRecentRunDays}-day active GEANT4, CMSSW, or beamline run grace window`
		} else if (member.isRedundantHepExport) {
			governanceTier = 'hep-export-redundant'
			if (config.requireHepAnchorForPrune && !hasHepMasterAnchor) {
				shielded = true
				protectedReason = 'Blocked until a verified ROOT, NeXus, LHE, or CBF master anchor exists'
			} else {
				action = 'delete'
				deleteTargetsCount += 1
				reclaimableBytes += member.size
				protectedReason = redundancyReason
			}
		} else if (member.isScratchPath) {
			governanceTier = 'sim-recon-scratch'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
			protectedReason = 'GEANT4, CMSSW, Pythia, XRootD, or recon staging scratch eligible for cleanup'
		} else if (member.isProtectedRootBeamlineMaster || member.isProtectedCalibrationGeometry) {
			governanceTier = member.isProtectedCalibrationGeometry ? 'hep-calibration-protected' : 'root-beamline-protected'
			action = config.strategy === 'hardlink-immutable-root-and-nxs' && !member.isMutableFile ? 'hardlink' : 'delete'
			if (action === 'hardlink') {
				hardlinkSavingsBytes += member.size
				hardlinkTargetsCount += 1
			} else {
				deleteTargetsCount += 1
			}
			reclaimableBytes += member.size
		} else if (config.strategy === 'hardlink-immutable-root-and-nxs' && !member.isMutableFile) {
			governanceTier = 'root-beamline-protected'
			action = 'hardlink'
			hardlinkSavingsBytes += member.size
			hardlinkTargetsCount += 1
			reclaimableBytes += member.size
		} else {
			governanceTier = 'sim-recon-scratch'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
		}

		if (shielded) {
			shieldedCount += 1
		}

		return {
			...member,
			isRedundantHepExportMember,
			redundancyReason,
			isSurvivor,
			governanceTier,
			shielded,
			protectedReason,
			action,
		}
	})

	const hasRedundantHepExport = members.some(m => m.isRedundantHepExportMember || m.isRedundantHepExport)
	const hasProtectedBeamSafetyHold = members.some(m => m.governanceTier === 'beam-safety-hold-protected' && m.shielded)
	const hasProtectedCalibration = members.some(m => m.governanceTier === 'hep-calibration-protected' && m.shielded)
	const hasProtectedRootMaster = members.some(m => m.governanceTier === 'root-beamline-protected' && m.shielded)
	const hasSimReconScratch = members.some(m => m.isScratchPath)

	let clusterVerdict = 'shielded'
	if (reclaimableBytes > 0) {
		if (members.some(m => m.isRedundantHepExportMember && !m.shielded)) {
			clusterVerdict = 'hep-export-redundant'
		} else if (members.some(m => m.isScratchPath && !m.shielded)) {
			clusterVerdict = 'sim-recon-scratch'
		} else {
			clusterVerdict = 'reclaimable'
		}
	} else if (hasProtectedBeamSafetyHold) {
		clusterVerdict = 'beam-safety-hold-protected'
	} else if (hasProtectedCalibration) {
		clusterVerdict = 'hep-calibration-protected'
	} else if (hasProtectedRootMaster) {
		clusterVerdict = 'root-beamline-protected'
	}

	let priorityScore = 10
	if (reclaimableBytes > 0) {
		priorityScore = hasRedundantHepExport ? 95 : 85
	} else if (hasProtectedBeamSafetyHold) {
		priorityScore = 60
	} else if (hasProtectedCalibration) {
		priorityScore = 50
	}

	const hepTags = [...new Set(members.map(m => m.hepTag).filter(Boolean))]
	const familyMeta = PARTICLE_PHYSICS_HEP_FAMILY_META[family] || PARTICLE_PHYSICS_HEP_FAMILY_META['hep-sim-recon-scratch']

	return {
		id: group.id ?? primaryName,
		hash: group.hash || '',
		name: primaryName,
		hepToolchain: primaryToolchain,
		workflowStage: primaryStage,
		runStem: primaryStem,
		hepAnchorKey: primaryAnchorKey,
		family,
		familyLabel: familyMeta.label,
		clusterVerdict,
		priorityScore,
		copyCount: members.length,
		unitBytes,
		totalBytes,
		reclaimableBytes,
		hardlinkSavingsBytes,
		formattedUnitBytes: formatBytes(unitBytes),
		formattedTotalBytes: formatBytes(totalBytes),
		formattedReclaimableBytes: formatBytes(reclaimableBytes),
		reclaimableTargetsCount: deleteTargetsCount + hardlinkTargetsCount,
		deleteTargetsCount,
		hardlinkTargetsCount,
		shieldedCount,
		survivorKey,
		survivorPath: survivor.normalized,
		hasProtectedCalibration,
		hasProtectedRootMaster,
		hasProtectedBeamSafetyHold,
		hasRedundantHepExport,
		hasSimReconScratch,
		hasHepMasterAnchor,
		hepTags,
		members,
		sourceGroup: group,
	}
}

/**
 * Audit a list of duplicate groups as a Particle Physics, HEP Detector & Synchrotron Beamline Vault.
 *
 * @param {Array<object>} groups Duplicate groups.
 * @param {object} [rawConfig] Optional audit configuration.
 * @param {number} [referenceNowMs] Optional reference timestamp in ms.
 * @return {object} Comprehensive Particle Physics & HEP vault audit report.
 */
export function auditParticlePhysicsHepVault(groups, rawConfig = {}, referenceNowMs = Date.now()) {
	const config = normalizeParticlePhysicsHepConfig(rawConfig)
	const groupList = Array.isArray(groups) ? groups : []

	const domainGroups = groupList.filter(isParticlePhysicsHepGroup)
	const correlationIndex = buildParticlePhysicsHepCorrelationIndex(domainGroups)

	const allClusters = domainGroups
		.map(group => auditSingleCluster(group, correlationIndex, config, referenceNowMs))
		.filter(Boolean)

	const minBytes = config.minSizeKb * 1024
	const sizeFiltered = allClusters.filter(cluster => cluster.unitBytes >= minBytes || cluster.totalBytes >= minBytes)

	const familyCounts = {
		'hep-calibration-beam-logs': 0,
		'hep-root-beamline-masters': 0,
		'redundant-hep-ntuple-exports': 0,
		'hep-sim-recon-scratch': 0,
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
		if (config.verdictFilter === 'reclaimable' && cluster.reclaimableBytes <= 0) {
			return false
		}
		if (config.verdictFilter === 'shielded' && cluster.reclaimableBytes > 0) {
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
		if (query) {
			const haystacks = [
				cluster.name,
				cluster.hepToolchain,
				cluster.workflowStage,
				cluster.runStem,
				cluster.hepAnchorKey,
				cluster.familyLabel,
				...cluster.hepTags,
				...cluster.members.map(m => `${m.normalized} ${m.artifactKind} ${m.vaultRole}`),
			]
			if (!haystacks.some(val => String(val || '').toLowerCase().includes(query))) {
				return false
			}
		}
		return true
	})

	filteredClusters.sort((a, b) => {
		if (config.sortMode === 'risk_desc') {
			return (b.priorityScore - a.priorityScore) || (b.reclaimableBytes - a.reclaimableBytes) || a.name.localeCompare(b.name)
		}
		if (config.sortMode === 'copies_desc') {
			return (b.copyCount - a.copyCount) || (b.reclaimableBytes - a.reclaimableBytes) || a.name.localeCompare(b.name)
		}
		if (config.sortMode === 'name_asc') {
			return a.name.localeCompare(b.name)
		}
		return (b.reclaimableBytes - a.reclaimableBytes) || (b.priorityScore - a.priorityScore) || a.name.localeCompare(b.name)
	})

	let rawDuplicateBytes = 0
	let reclaimableBytes = 0
	let totalReclaimableCopiesCount = 0
	let totalShieldedCopiesCount = 0
	let totalCalibClusters = 0
	let totalRootMasterClusters = 0
	let totalSafetyHoldClusters = 0
	let totalRedundantExportClusters = 0
	let totalSimScratchClusters = 0

	for (const cluster of filteredClusters) {
		rawDuplicateBytes += Math.max(0, cluster.totalBytes - cluster.unitBytes)
		reclaimableBytes += cluster.reclaimableBytes
		totalReclaimableCopiesCount += cluster.reclaimableTargetsCount
		totalShieldedCopiesCount += cluster.shieldedCount
		if (cluster.hasProtectedCalibration) {
			totalCalibClusters += 1
		}
		if (cluster.hasProtectedRootMaster) {
			totalRootMasterClusters += 1
		}
		if (cluster.hasProtectedBeamSafetyHold) {
			totalSafetyHoldClusters += 1
		}
		if (cluster.hasRedundantHepExport) {
			totalRedundantExportClusters += 1
		}
		if (cluster.hasSimReconScratch) {
			totalSimScratchClusters += 1
		}
	}

	const reclaimableGb = `${(reclaimableBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
	const efficiencyPct = rawDuplicateBytes > 0
		? Math.min(100, Math.round((reclaimableBytes / rawDuplicateBytes) * 100))
		: 0

	const familyBreakdown = PARTICLE_PHYSICS_HEP_FAMILIES
		.filter(id => id !== 'all')
		.map(id => ({
			id,
			label: PARTICLE_PHYSICS_HEP_FAMILY_META[id].label,
			shortLabel: PARTICLE_PHYSICS_HEP_FAMILY_META[id].shortLabel,
			clustersCount: familyCounts[id] || 0,
		}))

	return {
		schema: PARTICLE_PHYSICS_HEP_VAULT_SCHEMA,
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
			totalCalibClusters,
			totalRootMasterClusters,
			totalSafetyHoldClusters,
			totalRedundantExportClusters,
			totalSimScratchClusters,
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
 * Build a safe POSIX DRY_RUN=1 remediation script for Particle Physics & HEP Vaults.
 * Strictly blocks deletion or hardlinking of shielded GDML/calibration baselines, beam-safety holds,
 * and verified ROOT/NeXus/Event masters, and never hardlinks mutable files or scratch.
 *
 * @param {object} auditResult Result from auditParticlePhysicsHepVault.
 * @return {string} POSIX bash script.
 */
export function buildParticlePhysicsHepRemediationScript(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# Particle Physics, HEP Detector & Synchrotron Beamline Vault Auditor',
		'# Safe POSIX Remediation Script (default DRY_RUN=1)',
		'# Run with DRY_RUN=0 ./particle-physics-hep-vault-reclaim.sh only after verifying ROOT/NeXus/Event and GDML anchors.',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'QUARANTINE_DIR="$' + '{QUARANTINE_DIR:-./.particle-hep-scratch-quarantine}"',
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
	const strategy = auditResult?.config?.strategy || 'prune-exports-and-beam-scratch'
	for (const cluster of clusters) {
		const actions = (cluster.members || []).filter(m => !m.shielded && (m.action === 'delete' || m.action === 'hardlink'))
		if (actions.length === 0) {
			continue
		}
		lines.push(`# Cluster: ${cluster.name} | Family: ${cluster.familyLabel} | Survivor: ${cluster.survivorPath}`)
		for (const target of actions) {
			actionCount += 1
			if (target.action === 'hardlink' && !target.isMutableFile && !target.isScratchPath) {
				lines.push(`run_cmd ln -f ${quotePosixPath(cluster.survivorPath)} ${quotePosixPath(target.normalized)}`)
			} else if (strategy === 'quarantine-exports-and-beam-scratch' && (target.isRedundantHepExport || target.isScratchPath)) {
				lines.push('run_cmd mkdir -p "$QUARANTINE_DIR"')
				lines.push(`run_cmd mv -n ${quotePosixPath(target.normalized)} "$QUARANTINE_DIR/"`)
			} else {
				lines.push(`run_cmd rm -f ${quotePosixPath(target.normalized)}`)
			}
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('printf "No reclaimable exports or recon scratch under active HEP & Beamline shields.\\n"')
	} else {
		lines.push(`printf "Completed Particle Physics & HEP Vault remediation plan (%d target actions, DRY_RUN=%s).\\n" "${actionCount}" "$DRY_RUN"`)
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe RFC-4180 CSV audit report.
 *
 * @param {object} auditResult Result from auditParticlePhysicsHepVault.
 * @return {string} RFC-4180 CSV string.
 */
export function buildParticlePhysicsHepCsvReport(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const headers = [
		'cluster_id',
		'cluster_name',
		'hep_toolchain',
		'workflow_stage',
		'run_stem',
		'hep_anchor_key',
		'family',
		'cluster_verdict',
		'has_hep_master_anchor',
		'is_redundant_hep_export',
		'is_sim_recon_scratch',
		'member_path',
		'artifact_kind',
		'vault_role',
		'hep_tag',
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
				cluster.hepToolchain || '',
				cluster.workflowStage || '',
				cluster.runStem,
				cluster.hepAnchorKey,
				cluster.family,
				cluster.clusterVerdict,
				cluster.hasHepMasterAnchor ? 'true' : 'false',
				member.isRedundantHepExportMember ? 'true' : 'false',
				member.isScratchPath ? 'true' : 'false',
				member.normalized,
				member.artifactKind,
				member.vaultRole,
				member.hepTag || '',
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
 * @param {object} auditResult Result from auditParticlePhysicsHepVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildParticlePhysicsHepJsonManifest(auditResult) {
	const payload = {
		schema: PARTICLE_PHYSICS_HEP_VAULT_SCHEMA,
		generatedAt: new Date().toISOString(),
		config: auditResult?.config || PARTICLE_PHYSICS_HEP_DEFAULT_CONFIG,
		summary: auditResult?.summary || {},
		clusters: (auditResult?.clusters || []).map(cluster => ({
			id: cluster.id,
			name: cluster.name,
			hepToolchain: cluster.hepToolchain,
			workflowStage: cluster.workflowStage,
			runStem: cluster.runStem,
			hepAnchorKey: cluster.hepAnchorKey,
			family: cluster.family,
			clusterVerdict: cluster.clusterVerdict,
			unitBytes: cluster.unitBytes,
			totalBytes: cluster.totalBytes,
			reclaimableBytes: cluster.reclaimableBytes,
			survivorPath: cluster.survivorPath,
			hasProtectedCalibration: cluster.hasProtectedCalibration,
			hasProtectedRootMaster: cluster.hasProtectedRootMaster,
			hasProtectedBeamSafetyHold: cluster.hasProtectedBeamSafetyHold,
			hasRedundantHepExport: cluster.hasRedundantHepExport,
			hasSimReconScratch: cluster.hasSimReconScratch,
			hasHepMasterAnchor: cluster.hasHepMasterAnchor,
			hepTags: cluster.hepTags,
			members: (cluster.members || []).map(member => ({
				path: member.normalized,
				artifactKind: member.artifactKind,
				vaultRole: member.vaultRole,
				hepTag: member.hepTag || '',
				governanceTier: member.governanceTier,
				action: member.action,
				shielded: member.shielded,
				protectedReason: member.protectedReason,
				isRedundantHepExportMember: member.isRedundantHepExportMember,
				isScratchPath: member.isScratchPath,
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
 * cloud sync of GEANT4, CMSSW, ROOT, Pythia, MadGraph, XRootD, and CVMFS scratch directories.
 *
 * @return {string} Line-delimited .sync-exclude.lst rules.
 */
export function buildParticlePhysicsHepSyncExcludeList() {
	return [
		'# Nextcloud / rsync exclusion rules for Particle Physics & HEP Beamline Vaults',
		'geant4_tmp/',
		'geant4_cache/',
		'cmssw_work/',
		'cmssw_tmp/',
		'root_cache/',
		'root_tmp/',
		'pythia_scratch/',
		'madgraph_tmp/',
		'xrootd_staging/',
		'beam_recon_tmp/',
		'cvmfs_cache/',
		'athena_scratch/',
		'delphes_tmp/',
		'sim_staging/',
		'recon_scratch/',
		'event_spill/',
		'tmp_root_*',
		'tmp_nxs_*',
		'tmp_g4_*',
		'tmp_geant4_*',
		'tmp_cmssw_*',
		'tmp_pythia_*',
		'tmp_recon_*',
		'tmp_beam_*',
		'spill_evt_*',
		'*.root.tmp',
		'*.root.part',
		'*.nxs.part',
		'*.nxs.tmp',
		'*.h5.lock',
		'*.h5.tmp',
		'*.lhe.tmp',
		'*.hepmc.tmp',
		'*.evio.idx',
		'*.cbf.tmp',
		'*.mid.tmp',
		'*.lck',
		'*.lock',
		'*.tmp',
	].join('\n')
}
