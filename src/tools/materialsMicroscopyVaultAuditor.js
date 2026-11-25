/**
 * Pure Materials Science, Electron Microscopy & Diffraction Vault Auditor.
 * Classifies and audits duplicate clusters across 4 Materials & EM Vault families:
 * - CIF, Standards & Facility Holds (.cif, .mcif, POSCAR/INCAR/KPOINTS/POTCAR, .lmp, .xrdml, .gsas, .instprm, detector gain/dark/EBSD calibrations, ICSD/COD/Materials Project/EMPIAR/synchrotron beamline archive holds)
 * - Raw EM, Tomography & Diffraction (.dm3, .dm4, .ser, .emi, .mrc, .mrcs, .st, .ali, .rec, .emd, .velox, .bcf, .oh5, .ang, .ctf, .h5oina, .ras, .rasx, .brml, .cbf, .nxs, .mib, .blo, materials/STEM .h5/.hdf5)
 * - Redundant Figures & Tables (scale-bar micrograph .png/.jpg/.webp/.tif/.svg, diffraction/EDS/EELS plots, tilt-series .mp4/.avi/.gif, .csv/.tsv/.xlsx exports when a verified Raw EM/Diffraction/Standard master anchor exists)
 * - Cryo-EM, 4D-STEM & Rietveld Scratch (relion_scratch/, cryosparc_cache/, imod_tmp/, motioncor_tmp/, py4dstem_tmp/, hyperspy_cache/, dm_scratch/, aztec_tmp/, oim_scratch/, gsas_tmp/, vasp_scratch/, .dm4.tmp, .mrc.tmp, .lck)
 *
 * Enforces strict Facility Archive Hold, CIF/Calibration Standard, and Raw EM/Diffraction conservation defaults:
 * - Strictly conserves ICSD, COD, Materials Project, EMPIAR, and synchrotron beamline archival holds
 * - Strictly conserves CIF/mCIF crystal structures, VASP/LAMMPS input decks, GSAS/Rietveld instrument parameters, and TEM/EBSD/EDS detector calibrations
 * - Strictly conserves verified raw TEM/STEM/Cryo-EM micrographs, tomograms, 4D-STEM, EBSD, and XRD masters
 * - Detects redundant scale-bar micrograph renders, diffraction plots, tilt-series movies, and EDS/XRD CSV exports when a verified master anchor exists
 * - Blocks pruning of figure renders or table exports lacking a verified Materials/EM anchor when guard is active
 * - Blocks hardlinks on mutable CIF/VASP/LAMMPS/JSON/CSV/scratch files
 *
 * Generates DRY_RUN=1 POSIX remediation scripts, CWE-1236-safe CSV reports, JSON audit
 * manifests, and .sync-exclude.lst rules. Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const MATERIALS_MICROSCOPY_VAULT_SCHEMA = 'duplicatefinder.materials-microscopy-vault-auditor.v1'

export const MATERIALS_MICROSCOPY_FAMILIES = Object.freeze([
	'all',
	'cif-calibrations-facility-holds',
	'raw-microscopy-diffraction-masters',
	'redundant-em-figure-exports',
	'em-reconstruction-scratch',
])

export const MATERIALS_MICROSCOPY_FAMILY_META = Object.freeze({
	'cif-calibrations-facility-holds': {
		id: 'cif-calibrations-facility-holds',
		label: 'CIF, Calibrations & Holds',
		shortLabel: 'CIF/VASP/LAMMPS Inputs, Detector Calibrations & Facility Holds (.cif, POSCAR, .instprm, ICSD/COD/EMPIAR/Beamline)',
	},
	'raw-microscopy-diffraction-masters': {
		id: 'raw-microscopy-diffraction-masters',
		label: 'Raw EM, Tomography & XRD',
		shortLabel: 'Verified Microscopy & Diffraction Masters (.dm4, .mrc, .ser, .emd, .bcf, .oh5, .ang, .rasx, .cbf, .mib, .nxs)',
	},
	'redundant-em-figure-exports': {
		id: 'redundant-em-figure-exports',
		label: 'Redundant Figures & CSVs',
		shortLabel: 'Derived Scale-Bar Micrographs, IPF/EDS Maps & Tables (.png/.tif/.mp4/.csv/.xlsx when Raw EM/XRD anchor exists)',
	},
	'em-reconstruction-scratch': {
		id: 'em-reconstruction-scratch',
		label: 'Cryo-EM & 4D-STEM Scratch',
		shortLabel: 'Reconstruction & Solver Scratch (relion_scratch/, cryosparc_cache/, imod_tmp/, py4dstem_tmp/, vasp_scratch/, .dm4.tmp, .mrc.tmp)',
	},
})

export const MATERIALS_MICROSCOPY_STRATEGIES = Object.freeze([
	'prune-exports-and-em-scratch',
	'hardlink-immutable-raw-em-and-xrd',
	'quarantine-exports-and-em-scratch',
])

export const MATERIALS_MICROSCOPY_SURVIVOR_RULES = Object.freeze([
	'cif-raw-em-master-first',
	'oldest-acquisition-first',
	'newest-reconstruction-first',
	'shortest-path',
])

export const MATERIALS_MICROSCOPY_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'cif-cal-std-protected',
	'raw-em-diffraction-protected',
	'facility-hold-protected',
	'em-export-redundant',
	'em-scratch-intermediate',
	'shielded',
])

export const MATERIALS_MICROSCOPY_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const MATERIALS_MICROSCOPY_PRESETS = Object.freeze([
	{
		id: 'all-materials-microscopy-audit',
		name: 'All Materials & EM Vaults',
		description: 'Audit CIF/VASP/calibration baselines, ICSD/COD/EMPIAR/synchrotron holds, raw TEM/Cryo-EM/EBSD/XRD masters, scale-bar figure exports, and RELION/py4DSTEM/VASP scratch.',
		familyFilter: 'all',
		strategy: 'prune-exports-and-em-scratch',
		survivorRule: 'cif-raw-em-master-first',
		protectCifAndCalibrationStandards: true,
		protectRawEmDiffractionMasters: true,
		protectFacilityArchiveHolds: true,
		requireMaterialsAnchorForPrune: true,
		keepRecentJobDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'em-reconstruction-scratch-cleanup',
		name: 'Cryo-EM & 4D-STEM Scratch',
		description: 'Reclaim relion_scratch/, cryosparc_cache/, imod_tmp/, motioncor_tmp/, py4dstem_tmp/, vasp_scratch/, and .dm4.tmp/.mrc.tmp scratch older than the active reconstruction grace window.',
		familyFilter: 'all',
		strategy: 'prune-exports-and-em-scratch',
		survivorRule: 'cif-raw-em-master-first',
		protectCifAndCalibrationStandards: true,
		protectRawEmDiffractionMasters: true,
		protectFacilityArchiveHolds: true,
		requireMaterialsAnchorForPrune: true,
		keepRecentJobDays: 14,
		minSizeKb: 0,
	},
	{
		id: 'redundant-figures-vs-raw-em-xrd',
		name: 'Redundant Figures vs Raw EM/XRD',
		description: 'Detect scale-bar micrograph PNG/TIF exports, IPF/EDS maps, tilt-series MP4 loops, and EDS/XRD CSV tables backed by a verified Raw EM, Tomography, EBSD, or XRD master anchor.',
		familyFilter: 'redundant-em-figure-exports',
		strategy: 'quarantine-exports-and-em-scratch',
		survivorRule: 'cif-raw-em-master-first',
		protectCifAndCalibrationStandards: true,
		protectRawEmDiffractionMasters: true,
		protectFacilityArchiveHolds: true,
		requireMaterialsAnchorForPrune: true,
		keepRecentJobDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'cif-calibration-facility-shield',
		name: 'CIF, Calibrations & Facility Shield',
		description: 'Inspect CIF/mCIF structures, VASP/LAMMPS input decks, TEM gain/dark references, GSAS instrument parameters, and ICSD/COD/EMPIAR/beamline holds under strict shield.',
		familyFilter: 'cif-calibrations-facility-holds',
		strategy: 'hardlink-immutable-raw-em-and-xrd',
		survivorRule: 'cif-raw-em-master-first',
		protectCifAndCalibrationStandards: true,
		protectRawEmDiffractionMasters: true,
		protectFacilityArchiveHolds: true,
		requireMaterialsAnchorForPrune: true,
		keepRecentJobDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'raw-em-diffraction-masters',
		name: 'Raw EM, Tomography & XRD Masters',
		description: 'Audit raw Gatan DM3/DM4, Thermo Velox EMD, Cryo-EM MRC/MRCS, Bruker BCF, EBSD OH5/ANG/CTF, Medipix 4D-STEM MIB, and XRD RASX/BRML/CBF masters.',
		familyFilter: 'raw-microscopy-diffraction-masters',
		strategy: 'hardlink-immutable-raw-em-and-xrd',
		survivorRule: 'cif-raw-em-master-first',
		protectCifAndCalibrationStandards: true,
		protectRawEmDiffractionMasters: true,
		protectFacilityArchiveHolds: true,
		requireMaterialsAnchorForPrune: true,
		keepRecentJobDays: 0,
		minSizeKb: 0,
	},
])

export const MATERIALS_MICROSCOPY_DEFAULT_CONFIG = Object.freeze({
	presetId: 'all-materials-microscopy-audit',
	familyFilter: 'all',
	verdictFilter: 'all',
	strategy: 'prune-exports-and-em-scratch',
	survivorRule: 'cif-raw-em-master-first',
	sortMode: 'reclaim_desc',
	searchQuery: '',
	protectCifAndCalibrationStandards: true,
	protectRawEmDiffractionMasters: true,
	protectFacilityArchiveHolds: true,
	requireMaterialsAnchorForPrune: true,
	keepRecentJobDays: 0,
	minSizeKb: 0,
})

const STRICT_MAT_STD_EXT_RE = /\.(?:cif|mcif|poscar|contcar|potcar|incar|kpoints|vasp|lmp|lammps|xsf|pw|gjf|fchk|gsas|gpx|exp|prf|pcr|instprm|dmcal|edscal|ctfcal)$/i
const STRICT_MAT_STD_BASENAME_RE = /^(?:poscar|contcar|incar|kpoints|potcar|chgcar|wavecar|eigenval|doscar|outcar|in\.lammps|data\.lammps)$/i
const STRICT_EM_RAW_EXT_RE = /\.(?:dm3|dm4|ser|emi|mrc|mrcs|st|ali|rec|emd|velox|bcf|rpl|msa|emsa|spe|vms|spg|spa|oh5|ang|ctf|cpr|crc|ebsp|h5oina|xye|ras|rasx|brml|mdi|cpi|scn|pd3|cbf|sfrm|nxs|mib|blo|xrdml|uxd)$/i
const CONTEXT_MAT_SCI_EXT_RE = /\.(?:h5|hdf5|he5|hdf|zarr|raw|dat|xy|img|pdb|xyz)$/i
const CONTEXT_COMPLIANCE_DOC_EXT_RE = /\.(?:xml|json|yaml|yml|pdf|txt|sig|p7s|md|log)$/i
const CONTEXT_EM_EXPORT_EXT_RE = /\.(?:png|jpg|jpeg|webp|tif|tiff|bmp|gif|mp4|mov|mkv|avi|svg|csv|tsv|txt|xlsx)$/i
const STRICT_MAT_SCRATCH_EXT_RE = /\.(?:dm3\.tmp|dm4\.tmp|mrc\.tmp|mrcs\.tmp|ser\.tmp|emd\.tmp|bcf\.tmp|oh5\.tmp|nxs\.tmp|xrdml\.tmp|h5\.tmp|lck|swp)$/i
const STRICT_VASP_SCRATCH_NAME_RE = /^(?:wavecar|chgcar|chg|tmpcar)\.(?:tmp|bak|partial)$/i
const GENERIC_SCRATCH_EXT_RE = /\.(?:tmp|bak|lock|dmp|part|idx|inf)$/i

const MAT_CONTEXT_HINT_RE = /(?:materials?_?science|electron_?microscop|cryo_?em|tem_?vault|sem_?vault|fib_?sem|4d_?stem|stem_?haadf|diffraction|crystallograph|ebsd|eds_?spectrum|eels|rietveld|gsas|fullprof|xrd|synchrotron|beamline|relion|cryosparc|imod|motioncor|py4dstem|hyperspy|digital_?micrograph|velox|aztec|oim_?ebsd|vesta|crystalmaker|vasp|lammps|materials_?project|icsd|cod_?cif|empiar|medipix|nexus|micrograph|tomogram|tilt_?series|lattice|nanoparticle|perovskite|superalloy|metallograph|em_?vault|materials_?vault)/i
const MAT_CALIBRATION_NAME_RE = /(?:^|[/_-])(?:gain_?ref|dark_?ref|defect_?map|mag_?cal|camera_?length|eds_?std|k_?factor|ebsd_?cal|si_?standard|lab6_?standard|al2o3_?srm|beam_?center|distortion_?cal|ctf_?cal|zlp_?cal)(?:[/_.-]|$)/i
const MAT_STD_PATH_RE = /(?:00_cif_standards|00_calibrations|00_standards|cif_library|tem_calibration|camera_gain_ref|ebsd_calib|xrd_standards|vasp_inputs|lammps_inputs)/i
const FACILITY_ARCHIVE_HOLD_PATH_RE = /(?:icsd_?hold|cod_?hold|mp_?archive|materials_?project_?hold|beamline_?hold|synchrotron_?embargo|cryoem_?facility_?hold|empiar_?hold|facility_?hold|instrument_?hold|archive_?hold|publication_?embargo)/i
const MAT_SCRATCH_PATH_RE = /(?:relion_scratch|cryosparc_cache|imod_tmp|motioncor_tmp|ctf_scratch|py4dstem_tmp|hyperspy_cache|dm_scratch|velox_cache|aztec_tmp|oim_scratch|gsas_tmp|vasp_scratch|lammps_tmp|dask_worker_space|zarr_staging|em_staging|tomo_recon_tmp)/i
const MAT_INTERMEDIATE_PREFIX_RE = /^(?:tmp_motioncor_|tmp_relion_|tmp_imod_|tmp_py4dstem_|scratch_chunk_|tmp_gsas_|spill_)/i
const MAT_INTERMEDIATE_SUFFIX_RE = /(?:_motioncor_tmp|_ctf_tmp|_aligned_tmp|_regrid_tmp|_staging)$/i
const MAT_PROXY_PATH_RE = /(?:_scalebar|_annotated|_quicklook|_montage|_mip|_fft_plot|_diffraction_plot|_pole_figure|_ipf_map|_eds_map|_eels_plot|_xrd_plot|_rietveld_fit|_web_?preview|_preview|_thumb|figures_export|micrographs_png|quicklooks)/i
const CANONICAL_VAULT_PATH_RE = /(?:00_golden|00_master|00_raw|00_microscopy|00_diffraction|00_tomography|00_xrd|00_ebsd|canonical|em_vault|materials_vault|tem_archive|cryoem_archive)/i

/**
 * Normalize configuration values for Materials Science, Electron Microscopy & Diffraction Vault auditing.
 *
 * @param {object} [rawConfig] Raw user configuration.
 * @return {object} Normalized configuration.
 */
export function normalizeMaterialsMicroscopyConfig(rawConfig = {}) {
	const cfg = rawConfig && typeof rawConfig === 'object' ? rawConfig : {}
	const familyFilter = MATERIALS_MICROSCOPY_FAMILIES.includes(cfg.familyFilter)
		? cfg.familyFilter
		: MATERIALS_MICROSCOPY_DEFAULT_CONFIG.familyFilter
	const verdictFilter = MATERIALS_MICROSCOPY_VERDICT_FILTERS.includes(cfg.verdictFilter)
		? cfg.verdictFilter
		: MATERIALS_MICROSCOPY_DEFAULT_CONFIG.verdictFilter
	const strategy = MATERIALS_MICROSCOPY_STRATEGIES.includes(cfg.strategy)
		? cfg.strategy
		: MATERIALS_MICROSCOPY_DEFAULT_CONFIG.strategy
	const survivorRule = MATERIALS_MICROSCOPY_SURVIVOR_RULES.includes(cfg.survivorRule)
		? cfg.survivorRule
		: MATERIALS_MICROSCOPY_DEFAULT_CONFIG.survivorRule
	const sortMode = MATERIALS_MICROSCOPY_SORT_MODES.includes(cfg.sortMode)
		? cfg.sortMode
		: MATERIALS_MICROSCOPY_DEFAULT_CONFIG.sortMode

	const keepRecentParsed = Number(cfg.keepRecentJobDays)
	const keepRecentJobDays = Number.isFinite(keepRecentParsed) && keepRecentParsed >= 0
		? Math.floor(keepRecentParsed)
		: MATERIALS_MICROSCOPY_DEFAULT_CONFIG.keepRecentJobDays

	const minSizeParsed = Number(cfg.minSizeKb)
	const minSizeKb = Number.isFinite(minSizeParsed) && minSizeParsed > 0
		? minSizeParsed
		: 0

	return {
		presetId: typeof cfg.presetId === 'string' && cfg.presetId ? cfg.presetId : MATERIALS_MICROSCOPY_DEFAULT_CONFIG.presetId,
		familyFilter,
		verdictFilter,
		strategy,
		survivorRule,
		sortMode,
		searchQuery: typeof cfg.searchQuery === 'string' ? cfg.searchQuery.trim() : '',
		protectCifAndCalibrationStandards: cfg.protectCifAndCalibrationStandards !== undefined ? Boolean(cfg.protectCifAndCalibrationStandards) : true,
		protectRawEmDiffractionMasters: cfg.protectRawEmDiffractionMasters !== undefined ? Boolean(cfg.protectRawEmDiffractionMasters) : true,
		protectFacilityArchiveHolds: cfg.protectFacilityArchiveHolds !== undefined ? Boolean(cfg.protectFacilityArchiveHolds) : true,
		requireMaterialsAnchorForPrune: cfg.requireMaterialsAnchorForPrune !== undefined ? Boolean(cfg.requireMaterialsAnchorForPrune) : true,
		keepRecentJobDays,
		minSizeKb,
		memberOverrides: cfg.memberOverrides && typeof cfg.memberOverrides === 'object' ? { ...cfg.memberOverrides } : {},
	}
}

/**
 * Extract normalized sample, specimen, or diffraction run stem by stripping extensions and suffixes.
 *
 * @param {string} basename Filename without directory.
 * @param {string} [normalized] Full normalized path.
 * @return {string} Normalized specimen/run stem.
 */
export function extractMaterialsMicroscopyStem(basename, normalized = '') {
	let stem = String(basename || normalized || '').trim().toLowerCase()
	stem = stem.replace(/\.(?:dm3\.tmp|dm4\.tmp|mrc\.tmp|mrcs\.tmp|ser\.tmp|emd\.tmp|bcf\.tmp|oh5\.tmp|nxs\.tmp|xrdml\.tmp|h5\.tmp)$/i, '')
	stem = stem.replace(/\.[a-z0-9]{1,8}$/i, '')
	stem = stem.replace(MAT_INTERMEDIATE_PREFIX_RE, '')
	stem = stem.replace(MAT_INTERMEDIATE_SUFFIX_RE, '')
	stem = stem.replace(/(?:_scalebar|_annotated|_quicklook|_montage|_mip|_fft_plot|_diffraction_plot|_pole_figure|_ipf_map|_eds_map|_eels_plot|_xrd_plot|_rietveld_fit|_web_preview|_preview|_thumbnail|_export|_csv|_copy|_bak|_draft|_v\d+|_rev\d+)$/i, '')
	return stem || 'specimen-scan'
}

/**
 * Extract canonical anchor key linking derived figures/CSV tables to raw EM, Diffraction, or CIF masters.
 *
 * @param {string} runStem Extracted specimen/run stem.
 * @return {string} Canonical anchor key.
 */
export function extractMaterialsMicroscopyAnchorKey(runStem) {
	return String(runStem || 'specimen-scan')
		.toLowerCase()
		.replace(/(?:_haadf|_bf|_df|_abf|_fft|_saed|_cbed|_eds|_eels|_ipf|_pf|_xrd|_2theta|_tomo|_tilt|_plot|_map|_table|_summary|_export)$/i, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '') || 'specimen-scan'
}

/**
 * Detect Materials Science, Electron Microscopy & Diffraction toolchain and workflow stage from path and filename.
 *
 * @param {string} normalized Normalized path.
 * @param {string} basename Filename.
 * @return {{ materialsToolchain: string, workflowStage: string }} Detected toolchain and stage.
 */
function extractMaterialsToolchainAndStage(normalized, basename) {
	const text = `${normalized} ${basename}`.toLowerCase()
	let materialsToolchain = ''
	if (/\.(?:dm3|dm4|dmcal)\b|digital_?micrograph|gatan/.test(text)) {
		materialsToolchain = 'Gatan DigitalMicrograph'
	} else if (/\.(?:emd|ser|emi|velox)\b|velox|thermo_?fisher|fei/.test(text)) {
		materialsToolchain = 'Thermo Velox / TIA'
	} else if (/\.(?:mrc|mrcs|st|ali|rec)\b|relion|cryosparc|imod|motioncor|empiar/.test(text)) {
		materialsToolchain = 'Cryo-EM RELION / IMOD'
	} else if (/\.(?:mib|blo)\b|py4dstem|hyperspy|4d_?stem/.test(text)) {
		materialsToolchain = '4D-STEM py4DSTEM / HyperSpy'
	} else if (/\.(?:oh5|ang|ctf|cpr|crc|ebsp|h5oina)\b|oim|aztec|ebsd/.test(text)) {
		materialsToolchain = 'EBSD OIM / Oxford Aztec'
	} else if (/\.(?:bcf|rpl|msa|emsa|edscal)\b|eds|eels/.test(text)) {
		materialsToolchain = 'EDS / EELS Microanalysis'
	} else if (/\.(?:xrdml|uxd|ras|rasx|brml|gsas|gpx|instprm|cbf|sfrm|nxs)\b|gsas|fullprof|rietveld|synchrotron|beamline/.test(text)) {
		materialsToolchain = 'XRD / Synchrotron / GSAS-II'
	} else if (STRICT_MAT_STD_BASENAME_RE.test(basename) || /\.(?:cif|mcif|poscar|contcar|potcar|incar|kpoints|vasp|lmp|lammps|xsf)\b|vasp|lammps/.test(text)) {
		materialsToolchain = 'VASP / LAMMPS / CIF'
	} else if (/\.(?:spe|vms|spg|spa)\b/.test(text)) {
		materialsToolchain = 'XPS / VAMAS Surface Analysis'
	}

	let workflowStage = ''
	if (FACILITY_ARCHIVE_HOLD_PATH_RE.test(text)) {
		workflowStage = 'Facility / Synchrotron Hold'
	} else if (MAT_CALIBRATION_NAME_RE.test(text) || STRICT_MAT_STD_EXT_RE.test(basename) || STRICT_MAT_STD_BASENAME_RE.test(basename) || MAT_STD_PATH_RE.test(text)) {
		workflowStage = 'CIF / Calibration / DFT Input'
	} else if (STRICT_EM_RAW_EXT_RE.test(basename) || (CONTEXT_MAT_SCI_EXT_RE.test(basename) && MAT_CONTEXT_HINT_RE.test(text))) {
		workflowStage = 'Raw EM / Tomography / XRD Master'
	} else if (MAT_SCRATCH_PATH_RE.test(text) || STRICT_MAT_SCRATCH_EXT_RE.test(basename) || STRICT_VASP_SCRATCH_NAME_RE.test(basename) || MAT_INTERMEDIATE_PREFIX_RE.test(basename) || MAT_INTERMEDIATE_SUFFIX_RE.test(basename)) {
		workflowStage = 'Cryo-EM / 4D-STEM / DFT Scratch'
	} else if (CONTEXT_EM_EXPORT_EXT_RE.test(basename) || MAT_PROXY_PATH_RE.test(text)) {
		workflowStage = 'Scale-Bar Figure / CSV Export'
	}

	return { materialsToolchain, workflowStage }
}

/**
 * Extract concise Materials & EM domain tag badge when present.
 *
 * @param {string} lowerBase Lowercase filename.
 * @param {string} lowerPath Lowercase full path.
 * @return {string} Short tag or empty string.
 */
function extractMaterialsDomainTag(lowerBase, lowerPath) {
	const text = `${lowerPath} ${lowerBase}`
	if (FACILITY_ARCHIVE_HOLD_PATH_RE.test(text)) {
		return 'FACILITY HOLD'
	}
	if (MAT_CALIBRATION_NAME_RE.test(text)) {
		return 'DETECTOR CAL'
	}
	if (STRICT_MAT_STD_BASENAME_RE.test(lowerBase) || /\.(?:poscar|contcar|potcar|incar|kpoints|vasp|lmp|lammps|xsf|pw|gjf|fchk)\b/.test(text)) {
		return 'DFT / MD INPUT'
	}
	if (/\.(?:cif|mcif|gsas|gpx|exp|prf|pcr|instprm)\b/.test(text)) {
		return 'CIF / RIETVELD'
	}
	if (/\.(?:dm3|dm4|ser|emi|emd|velox)\b/.test(text)) {
		return 'TEM / STEM RAW'
	}
	if (/\.(?:mrc|mrcs|st|ali|rec)\b/.test(text)) {
		return 'CRYO-EM / TOMO'
	}
	if (/\.(?:mib|blo)\b/.test(text)) {
		return '4D-STEM RAW'
	}
	if (/\.(?:oh5|ang|ctf|cpr|crc|ebsp|h5oina)\b/.test(text)) {
		return 'EBSD MAP'
	}
	if (/\.(?:bcf|rpl|msa|emsa|spe|vms)\b/.test(text)) {
		return 'EDS / EELS / XPS'
	}
	if (/\.(?:xrdml|uxd|ras|rasx|brml|mdi|cpi|scn|pd3|cbf|sfrm|nxs)\b/.test(text)) {
		return 'XRD / NEXUS'
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
 * Classify a single file within the Materials Science, Electron Microscopy & Diffraction domain.
 *
 * @param {object} file Duplicate file object.
 * @param {number} [referenceNowMs] Reference current timestamp in ms.
 * @return {object} Classification metadata (family === null if non-domain file).
 */
export function classifyMaterialsMicroscopyFile(file, referenceNowMs = Date.now()) {
	const rawPath = String(file?.path || file?.name || '')
	const normalized = normalizePathForDiff(rawPath)
	const lower = normalized.toLowerCase()
	const slashIdx = normalized.lastIndexOf('/')
	const basename = slashIdx >= 0 ? normalized.slice(slashIdx + 1) : normalized
	const dirname = slashIdx >= 0 ? normalized.slice(0, slashIdx) : ''
	const lowerBase = basename.toLowerCase()
	const size = Math.max(0, Number(file?.size) || 0)
	const { mtimeMs, ageDays, formattedMtime } = parseFileTime(file, referenceNowMs)

	const hasMaterialsContext = MAT_CONTEXT_HINT_RE.test(lower)
	const isCalibrationName = MAT_CALIBRATION_NAME_RE.test(lower)
	const isScratchPath = MAT_SCRATCH_PATH_RE.test(lower)
	const isStrictScratchExt = STRICT_MAT_SCRATCH_EXT_RE.test(lowerBase)
	const isVaspScratchName = STRICT_VASP_SCRATCH_NAME_RE.test(lowerBase)
	const isGenericScratchExt = GENERIC_SCRATCH_EXT_RE.test(lowerBase)
	const isIntermediateSubfile = MAT_INTERMEDIATE_PREFIX_RE.test(lowerBase) || MAT_INTERMEDIATE_SUFFIX_RE.test(lowerBase)
	const isMatStdPath = MAT_STD_PATH_RE.test(lower)
	const isFacilityHoldPath = FACILITY_ARCHIVE_HOLD_PATH_RE.test(lower)
	const isCanonicalVaultPath = CANONICAL_VAULT_PATH_RE.test(lower)
	const isMatProxyPath = MAT_PROXY_PATH_RE.test(lower)

	const isStrictMatStdExt = STRICT_MAT_STD_EXT_RE.test(lowerBase)
		|| (STRICT_MAT_STD_BASENAME_RE.test(lowerBase) && (hasMaterialsContext || isMatStdPath || isFacilityHoldPath || /^(?:poscar|contcar|incar|kpoints|potcar)$/i.test(lowerBase)))
	const isStrictEmRawExt = STRICT_EM_RAW_EXT_RE.test(lowerBase)
	const isContextMatSciExt = CONTEXT_MAT_SCI_EXT_RE.test(lowerBase) && hasMaterialsContext
	const isContextComplianceDoc = CONTEXT_COMPLIANCE_DOC_EXT_RE.test(lowerBase) && (isMatStdPath || isFacilityHoldPath)
	const isContextEmExport = CONTEXT_EM_EXPORT_EXT_RE.test(lowerBase) && (hasMaterialsContext || isMatProxyPath)

	let family = null
	let artifactKind = 'Unknown'
	let vaultRole = 'Outside Materials & EM Vault'
	let isProtectedCifCalibrationStandard = false
	let isProtectedRawEmDiffractionMaster = false
	let isProtectedFacilityArchiveHold = false
	let isMaterialsMasterAnchor = false
	let isRedundantEmExport = false
	let isMutableFile = false

	if (
		isStrictScratchExt
		|| isVaspScratchName
		|| (isScratchPath && (isGenericScratchExt || isContextEmExport || isStrictEmRawExt || isContextMatSciExt || isStrictMatStdExt))
		|| (isIntermediateSubfile && (isStrictEmRawExt || isContextMatSciExt || hasMaterialsContext))
		|| (isGenericScratchExt && hasMaterialsContext)
	) {
		family = 'em-reconstruction-scratch'
		artifactKind = isStrictScratchExt
			? 'EM / Diffraction Scratch File'
			: (isVaspScratchName || isIntermediateSubfile ? 'MotionCor / RELION / VASP Intermediate' : 'Cryo-EM / 4D-STEM / Rietveld Scratch')
		vaultRole = 'RELION / cryoSPARC / IMOD / py4DSTEM Scratch'
		isMutableFile = true
	} else if (isFacilityHoldPath && (isStrictMatStdExt || isStrictEmRawExt || isContextMatSciExt || isContextComplianceDoc)) {
		family = 'cif-calibrations-facility-holds'
		artifactKind = 'ICSD / COD / EMPIAR / Synchrotron Hold'
		vaultRole = 'Protected Facility & Publication Embargo Hold'
		isProtectedFacilityArchiveHold = true
		isProtectedCifCalibrationStandard = true
		isMaterialsMasterAnchor = isStrictMatStdExt || isStrictEmRawExt || isContextMatSciExt
		isMutableFile = /\.(?:xml|json|yaml|yml|txt|md|log|cif|mcif|incar|kpoints|poscar|contcar|lmp|lammps|zarr)$/i.test(lowerBase)
			|| STRICT_MAT_STD_BASENAME_RE.test(lowerBase)
	} else if (
		isStrictMatStdExt
		|| (isCalibrationName && (isStrictEmRawExt || isContextMatSciExt || isContextComplianceDoc))
		|| (isMatStdPath && (isContextComplianceDoc || isStrictEmRawExt || isContextMatSciExt))
	) {
		family = 'cif-calibrations-facility-holds'
		if (isCalibrationName) {
			artifactKind = 'TEM / EBSD / Camera Calibration Baseline'
			vaultRole = 'Gain/Dark Reference & Camera Length Baseline'
		} else if (STRICT_MAT_STD_BASENAME_RE.test(lowerBase) || /\.(?:poscar|contcar|potcar|incar|kpoints|vasp|lmp|lammps|xsf|pw|gjf|fchk)$/i.test(lowerBase)) {
			artifactKind = 'VASP / LAMMPS / DFT Simulation Deck'
			vaultRole = 'Reproducible Atomistic & Ab-Initio Baseline'
		} else if (/\.(?:gsas|gpx|exp|prf|pcr|instprm|xrdml|uxd)$/i.test(lowerBase)) {
			artifactKind = 'Rietveld / XRD Instrument Standard'
			vaultRole = 'Diffractometer Geometry & Phase Standard'
		} else {
			artifactKind = 'CIF / mCIF Crystallographic Standard'
			vaultRole = 'Crystallographic Structure & Metadata Standard'
		}
		isProtectedCifCalibrationStandard = true
		isMaterialsMasterAnchor = isStrictMatStdExt || isStrictEmRawExt || isContextMatSciExt
		isMutableFile = /\.(?:cif|mcif|poscar|contcar|potcar|incar|kpoints|vasp|lmp|lammps|xsf|pw|gjf|fchk|gsas|gpx|exp|prf|pcr|instprm|dmcal|edscal|ctfcal|xml|json|yaml|yml|txt|md|log)$/i.test(lowerBase)
			|| STRICT_MAT_STD_BASENAME_RE.test(lowerBase)
	} else if (isStrictEmRawExt || isContextMatSciExt) {
		family = 'raw-microscopy-diffraction-masters'
		if (/\.(?:mrc|mrcs|st|ali|rec)$/i.test(lowerBase)) {
			artifactKind = 'Cryo-EM Movie / Electron Tomogram Master'
			vaultRole = 'Uncompressed Dose-Fractionated / Tilt Master'
		} else if (/\.(?:mib|blo)$/i.test(lowerBase)) {
			artifactKind = '4D-STEM Medipix / Blockfile Master'
			vaultRole = '4D Scanning Diffraction Datacube Master'
		} else if (/\.(?:oh5|ang|ctf|cpr|crc|ebsp|h5oina)$/i.test(lowerBase)) {
			artifactKind = 'EBSD Orientation / Kikuchi Master'
			vaultRole = 'Electron Backscatter Diffraction Master'
		} else if (/\.(?:bcf|rpl|msa|emsa|spe|vms|spg|spa)$/i.test(lowerBase)) {
			artifactKind = 'EDS / EELS / XPS Spectroscopy Master'
			vaultRole = 'Analytical Elemental & Core-Loss Master'
		} else if (/\.(?:ras|rasx|brml|mdi|cpi|scn|pd3|cbf|sfrm|nxs|xye|xy)$/i.test(lowerBase)) {
			artifactKind = 'XRD / Synchrotron NeXus Diffraction Master'
			vaultRole = 'Raw Powder / Single-Crystal Diffraction Master'
		} else {
			artifactKind = 'TEM / STEM / Velox Raw Micrograph Master'
			vaultRole = 'Calibrated Detector-Space Micrograph Master'
		}
		isProtectedRawEmDiffractionMaster = true
		isMaterialsMasterAnchor = true
		isMutableFile = /\.(?:zarr)$/i.test(lowerBase)
	} else if (isContextComplianceDoc) {
		family = 'cif-calibrations-facility-holds'
		artifactKind = 'Beamline / Microscope Session Manifest'
		vaultRole = 'Facility Acquisition Log & Provenance'
		isProtectedCifCalibrationStandard = true
		isMutableFile = true
	} else if (isContextEmExport) {
		family = 'redundant-em-figure-exports'
		if (/\.(?:mp4|mov|mkv|avi|gif)$/i.test(lowerBase)) {
			artifactKind = 'Tomogram / Tilt-Series Animation Video'
		} else if (/\.(?:csv|tsv|txt|xlsx)$/i.test(lowerBase)) {
			artifactKind = 'EDS / XRD / Rietveld CSV Table Export'
		} else {
			artifactKind = 'Annotated Scale-Bar / IPF / FFT Figure'
		}
		vaultRole = 'Derived Publication Figure or Table Export'
		isRedundantEmExport = true
		isMutableFile = true
	}

	const { materialsToolchain, workflowStage } = extractMaterialsToolchainAndStage(normalized, basename)
	const runStem = extractMaterialsMicroscopyStem(basename, normalized)
	const materialsAnchorKey = extractMaterialsMicroscopyAnchorKey(runStem)
	const materialsTag = extractMaterialsDomainTag(lowerBase, lower)

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
		materialsToolchain,
		workflowStage,
		runStem,
		materialsAnchorKey,
		materialsTag,
		isProtectedCifCalibrationStandard,
		isProtectedRawEmDiffractionMaster,
		isProtectedFacilityArchiveHold,
		isMaterialsMasterAnchor,
		isRedundantEmExport,
		isMutableFile,
		isScratchPath: isScratchPath || isStrictScratchExt || isVaspScratchName || (isIntermediateSubfile && family === 'em-reconstruction-scratch') || (isGenericScratchExt && hasMaterialsContext),
		isMatStdPath,
		isFacilityHoldPath,
		isCanonicalVaultPath,
	}
}

/**
 * Determine whether a duplicate group belongs to the Materials Science, Electron Microscopy & Diffraction domain.
 *
 * @param {object} group Duplicate group.
 * @return {boolean} True when at least one file belongs to this domain.
 */
export function isMaterialsMicroscopyGroup(group) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return false
	}
	return group.files.some(file => classifyMaterialsMicroscopyFile(file).family !== null)
}

/**
 * Build cross-group correlation index linking verified Raw EM/Diffraction/Standard anchors
 * to derived scale-bar figures and EDS/XRD CSV exports.
 *
 * @param {Array<object>} groups Domain duplicate groups.
 * @return {object} Correlation index.
 */
export function buildMaterialsMicroscopyCorrelationIndex(groups) {
	const anchorStems = new Set()
	const anchorKeys = new Set()

	for (const group of Array.isArray(groups) ? groups : []) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (const file of group.files) {
			const meta = classifyMaterialsMicroscopyFile(file)
			if (!meta.family) {
				continue
			}
			if (meta.isMaterialsMasterAnchor) {
				anchorStems.add(meta.runStem)
				anchorKeys.add(meta.materialsAnchorKey)
			}
		}
	}

	return {
		anchorStems,
		anchorKeys,
	}
}

/**
 * Determine primary family for a heterogeneous Materials & EM cluster.
 *
 * @param {Array<object>} members Classified members.
 * @return {string} Family ID.
 */
function resolveClusterFamily(members) {
	if (members.some(m => m.family === 'cif-calibrations-facility-holds')) {
		return 'cif-calibrations-facility-holds'
	}
	if (members.some(m => m.family === 'raw-microscopy-diffraction-masters')) {
		return 'raw-microscopy-diffraction-masters'
	}
	if (members.some(m => m.family === 'redundant-em-figure-exports')) {
		return 'redundant-em-figure-exports'
	}
	return 'em-reconstruction-scratch'
}

/**
 * Compute deterministic survivor priority score for a Materials & EM vault member.
 *
 * @param {object} member Classified member.
 * @param {string} survivorRule Survivor rule.
 * @return {number} Priority score (higher wins).
 */
function scoreMemberForSurvivor(member, survivorRule) {
	const mtimeScore = member.mtimeMs !== null ? member.mtimeMs / 1e10 : 0
	const shortPathScore = 1000 - Math.min(999, member.normalized.length)

	if (survivorRule === 'oldest-acquisition-first') {
		const oldestScore = member.mtimeMs !== null ? -mtimeScore : 0
		return (member.isProtectedFacilityArchiveHold ? 100000 : 0)
			+ (member.isProtectedCifCalibrationStandard ? 97000 : 0)
			+ (member.isProtectedRawEmDiffractionMaster ? 94000 : 0)
			+ (member.isCanonicalVaultPath ? 25000 : 0)
			+ (member.isScratchPath ? -55000 : 0)
			+ (member.isRedundantEmExport ? -40000 : 0)
			+ oldestScore
			+ shortPathScore
	}

	if (survivorRule === 'newest-reconstruction-first') {
		return (member.isProtectedFacilityArchiveHold ? 100000 : 0)
			+ (member.isProtectedCifCalibrationStandard ? 97000 : 0)
			+ (member.isProtectedRawEmDiffractionMaster ? 94000 : 0)
			+ (member.isScratchPath ? -50000 : 0)
			+ (member.isRedundantEmExport ? -40000 : 0)
			+ mtimeScore
	}

	if (survivorRule === 'shortest-path') {
		return (member.isProtectedFacilityArchiveHold ? 52000 : 0)
			+ (member.isProtectedCifCalibrationStandard ? 50000 : 0)
			+ (member.isProtectedRawEmDiffractionMaster ? 48000 : 0)
			+ (member.isScratchPath ? -30000 : 0)
			+ shortPathScore
	}

	return (member.isProtectedFacilityArchiveHold ? 100000 : 0)
		+ (member.isProtectedCifCalibrationStandard ? 97000 : 0)
		+ (member.isProtectedRawEmDiffractionMaster ? 94000 : 0)
		+ (member.isCanonicalVaultPath ? 25000 : 0)
		+ (member.isRedundantEmExport ? -45000 : 0)
		+ (member.isScratchPath ? -60000 : 0)
		+ shortPathScore
}

/**
 * Audit a single Materials Science, Electron Microscopy & Diffraction duplicate cluster.
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
		const meta = classifyMaterialsMicroscopyFile(file, referenceNowMs)
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
	const primaryToolchain = rawMembers.find(m => m.materialsToolchain)?.materialsToolchain || ''
	const primaryStage = rawMembers.find(m => m.workflowStage)?.workflowStage || ''
	const primaryStem = rawMembers[0].runStem || extractMaterialsMicroscopyStem(primaryName, rawMembers[0].normalized)
	const primaryAnchorKey = rawMembers[0].materialsAnchorKey || extractMaterialsMicroscopyAnchorKey(primaryStem)

	const hasMaterialsMasterAnchor = Boolean(
		rawMembers.some(m => m.isMaterialsMasterAnchor)
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

		const isRedundantEmExportMember = member.isRedundantEmExport && hasMaterialsMasterAnchor

		let redundancyReason = ''
		if (member.isRedundantEmExport) {
			redundancyReason = isRedundantEmExportMember
				? 'Derived scale-bar figure or CSV table duplicates verified Raw EM, Diffraction, or CIF master'
				: 'Microscopy figure or CSV table without verified Raw EM, Diffraction, or CIF master anchor'
		}

		let governanceTier = 'em-scratch-intermediate'
		let shielded = false
		let protectedReason = ''
		let action = 'keep'

		if (override === 'keep') {
			governanceTier = member.isProtectedFacilityArchiveHold
				? 'facility-hold-protected'
				: (member.isProtectedCifCalibrationStandard
					? 'cif-cal-std-protected'
					: (member.isProtectedRawEmDiffractionMaster
						? 'raw-em-diffraction-protected'
						: (member.isRedundantEmExport
							? 'em-export-redundant'
							: 'em-scratch-intermediate')))
			shielded = true
			protectedReason = 'Manually shielded via per-copy override'
		} else if (member.isProtectedFacilityArchiveHold && config.protectFacilityArchiveHolds) {
			governanceTier = 'facility-hold-protected'
			shielded = true
			protectedReason = 'ICSD / COD / EMPIAR / Synchrotron beamline archival hold strictly conserved'
		} else if (member.isProtectedCifCalibrationStandard && config.protectCifAndCalibrationStandards) {
			governanceTier = 'cif-cal-std-protected'
			shielded = true
			protectedReason = 'CIF/mCIF structure, VASP/LAMMPS input, or detector calibration strictly conserved'
		} else if (member.isProtectedRawEmDiffractionMaster && config.protectRawEmDiffractionMasters) {
			governanceTier = 'raw-em-diffraction-protected'
			shielded = true
			protectedReason = 'Verified raw TEM/STEM/Cryo-EM, EBSD, or XRD diffraction master strictly conserved'
		} else if (isSurvivor && !isRedundantEmExportMember) {
			governanceTier = member.isProtectedFacilityArchiveHold
				? 'facility-hold-protected'
				: (member.isProtectedCifCalibrationStandard
					? 'cif-cal-std-protected'
					: (member.isProtectedRawEmDiffractionMaster
						? 'raw-em-diffraction-protected'
						: (member.isRedundantEmExport
							? 'em-export-redundant'
							: 'em-scratch-intermediate')))
			shielded = true
			protectedReason = 'Canonical Materials & EM vault survivor retained'
		} else if (override === 'prune') {
			governanceTier = member.isRedundantEmExport
				? 'em-export-redundant'
				: (member.isProtectedCifCalibrationStandard
					? 'cif-cal-std-protected'
					: 'em-scratch-intermediate')
			action = config.strategy === 'hardlink-immutable-raw-em-and-xrd' && !member.isMutableFile && !member.isScratchPath
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
			config.keepRecentJobDays > 0
			&& member.isScratchPath
			&& member.ageDays !== null
			&& member.ageDays < config.keepRecentJobDays
		) {
			governanceTier = 'em-scratch-intermediate'
			shielded = true
			protectedReason = `Within ${config.keepRecentJobDays}-day active Cryo-EM, 4D-STEM, or DFT reconstruction grace window`
		} else if (member.isRedundantEmExport) {
			governanceTier = 'em-export-redundant'
			if (config.requireMaterialsAnchorForPrune && !hasMaterialsMasterAnchor) {
				shielded = true
				protectedReason = 'Blocked until a verified Raw EM, Diffraction, or CIF master anchor exists'
			} else {
				action = 'delete'
				deleteTargetsCount += 1
				reclaimableBytes += member.size
				protectedReason = redundancyReason
			}
		} else if (member.isScratchPath) {
			governanceTier = 'em-scratch-intermediate'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
			protectedReason = 'RELION/cryoSPARC, IMOD, py4DSTEM, or VASP staging scratch eligible for cleanup'
		} else if (member.isProtectedRawEmDiffractionMaster || member.isProtectedCifCalibrationStandard) {
			governanceTier = member.isProtectedCifCalibrationStandard ? 'cif-cal-std-protected' : 'raw-em-diffraction-protected'
			action = config.strategy === 'hardlink-immutable-raw-em-and-xrd' && !member.isMutableFile ? 'hardlink' : 'delete'
			if (action === 'hardlink') {
				hardlinkSavingsBytes += member.size
				hardlinkTargetsCount += 1
			} else {
				deleteTargetsCount += 1
			}
			reclaimableBytes += member.size
		} else if (config.strategy === 'hardlink-immutable-raw-em-and-xrd' && !member.isMutableFile) {
			governanceTier = 'raw-em-diffraction-protected'
			action = 'hardlink'
			hardlinkSavingsBytes += member.size
			hardlinkTargetsCount += 1
			reclaimableBytes += member.size
		} else {
			governanceTier = 'em-scratch-intermediate'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
		}

		if (shielded) {
			shieldedCount += 1
		}

		return {
			...member,
			isRedundantEmExportMember,
			redundancyReason,
			isSurvivor,
			governanceTier,
			shielded,
			protectedReason,
			action,
		}
	})

	const hasRedundantEmExport = members.some(m => m.isRedundantEmExportMember || m.isRedundantEmExport)
	const hasProtectedFacilityHold = members.some(m => m.governanceTier === 'facility-hold-protected' && m.shielded)
	const hasProtectedCifCalStandard = members.some(m => m.governanceTier === 'cif-cal-std-protected' && m.shielded)
	const hasProtectedRawEmMaster = members.some(m => m.governanceTier === 'raw-em-diffraction-protected' && m.shielded)
	const hasEmScratchIntermediate = members.some(m => m.isScratchPath)

	let clusterVerdict = 'shielded'
	if (reclaimableBytes > 0) {
		if (members.some(m => m.isRedundantEmExportMember && !m.shielded)) {
			clusterVerdict = 'em-export-redundant'
		} else if (members.some(m => m.isScratchPath && !m.shielded)) {
			clusterVerdict = 'em-scratch-intermediate'
		} else {
			clusterVerdict = 'reclaimable'
		}
	} else if (hasProtectedFacilityHold) {
		clusterVerdict = 'facility-hold-protected'
	} else if (hasProtectedCifCalStandard) {
		clusterVerdict = 'cif-cal-std-protected'
	} else if (hasProtectedRawEmMaster) {
		clusterVerdict = 'raw-em-diffraction-protected'
	}

	let priorityScore = 10
	if (reclaimableBytes > 0) {
		priorityScore = hasRedundantEmExport ? 95 : 85
	} else if (hasProtectedFacilityHold) {
		priorityScore = 60
	} else if (hasProtectedCifCalStandard) {
		priorityScore = 50
	}

	const materialsTags = [...new Set(members.map(m => m.materialsTag).filter(Boolean))]
	const familyMeta = MATERIALS_MICROSCOPY_FAMILY_META[family] || MATERIALS_MICROSCOPY_FAMILY_META['em-reconstruction-scratch']

	return {
		id: group.id ?? primaryName,
		hash: group.hash || '',
		name: primaryName,
		materialsToolchain: primaryToolchain,
		workflowStage: primaryStage,
		runStem: primaryStem,
		materialsAnchorKey: primaryAnchorKey,
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
		hasProtectedCifCalStandard,
		hasProtectedRawEmMaster,
		hasProtectedFacilityHold,
		hasRedundantEmExport,
		hasEmScratchIntermediate,
		hasMaterialsMasterAnchor,
		materialsTags,
		members,
		sourceGroup: group,
	}
}

/**
 * Audit a list of duplicate groups as a Materials Science, Electron Microscopy & Diffraction Vault.
 *
 * @param {Array<object>} groups Duplicate groups.
 * @param {object} [rawConfig] Optional audit configuration.
 * @param {number} [referenceNowMs] Optional reference timestamp in ms.
 * @return {object} Comprehensive Materials & EM vault audit report.
 */
export function auditMaterialsMicroscopyVault(groups, rawConfig = {}, referenceNowMs = Date.now()) {
	const config = normalizeMaterialsMicroscopyConfig(rawConfig)
	const groupList = Array.isArray(groups) ? groups : []

	const domainGroups = groupList.filter(isMaterialsMicroscopyGroup)
	const correlationIndex = buildMaterialsMicroscopyCorrelationIndex(domainGroups)

	const allClusters = domainGroups
		.map(group => auditSingleCluster(group, correlationIndex, config, referenceNowMs))
		.filter(Boolean)

	const minBytes = config.minSizeKb * 1024
	const sizeFiltered = allClusters.filter(cluster => cluster.unitBytes >= minBytes || cluster.totalBytes >= minBytes)

	const familyCounts = {
		'cif-calibrations-facility-holds': 0,
		'raw-microscopy-diffraction-masters': 0,
		'redundant-em-figure-exports': 0,
		'em-reconstruction-scratch': 0,
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
				cluster.materialsToolchain,
				cluster.workflowStage,
				cluster.runStem,
				cluster.materialsAnchorKey,
				cluster.familyLabel,
				...cluster.materialsTags,
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
	let totalCifCalStdClusters = 0
	let totalRawEmMasterClusters = 0
	let totalFacilityHoldClusters = 0
	let totalRedundantExportClusters = 0
	let totalEmScratchClusters = 0

	for (const cluster of filteredClusters) {
		rawDuplicateBytes += Math.max(0, cluster.totalBytes - cluster.unitBytes)
		reclaimableBytes += cluster.reclaimableBytes
		totalReclaimableCopiesCount += cluster.reclaimableTargetsCount
		totalShieldedCopiesCount += cluster.shieldedCount
		if (cluster.hasProtectedCifCalStandard) {
			totalCifCalStdClusters += 1
		}
		if (cluster.hasProtectedRawEmMaster) {
			totalRawEmMasterClusters += 1
		}
		if (cluster.hasProtectedFacilityHold) {
			totalFacilityHoldClusters += 1
		}
		if (cluster.hasRedundantEmExport) {
			totalRedundantExportClusters += 1
		}
		if (cluster.hasEmScratchIntermediate) {
			totalEmScratchClusters += 1
		}
	}

	const reclaimableGb = `${(reclaimableBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
	const efficiencyPct = rawDuplicateBytes > 0
		? Math.min(100, Math.round((reclaimableBytes / rawDuplicateBytes) * 100))
		: 0

	const familyBreakdown = MATERIALS_MICROSCOPY_FAMILIES
		.filter(id => id !== 'all')
		.map(id => ({
			id,
			label: MATERIALS_MICROSCOPY_FAMILY_META[id].label,
			shortLabel: MATERIALS_MICROSCOPY_FAMILY_META[id].shortLabel,
			clustersCount: familyCounts[id] || 0,
		}))

	return {
		schema: MATERIALS_MICROSCOPY_VAULT_SCHEMA,
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
			totalCifCalStdClusters,
			totalRawEmMasterClusters,
			totalFacilityHoldClusters,
			totalRedundantExportClusters,
			totalEmScratchClusters,
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
 * Build a safe POSIX DRY_RUN=1 remediation script for Materials Science & Electron Microscopy Vaults.
 * Strictly blocks deletion or hardlinking of shielded CIF/calibration standards, Facility Holds,
 * and verified Raw EM/Diffraction masters, and never hardlinks mutable files or scratch.
 *
 * @param {object} auditResult Result from auditMaterialsMicroscopyVault.
 * @return {string} POSIX bash script.
 */
export function buildMaterialsMicroscopyRemediationScript(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# Materials Science, Electron Microscopy & Diffraction Vault Auditor',
		'# Safe POSIX Remediation Script (default DRY_RUN=1)',
		'# Run with DRY_RUN=0 ./materials-microscopy-vault-reclaim.sh only after verifying Raw EM/Diffraction anchors.',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'QUARANTINE_DIR="$' + '{QUARANTINE_DIR:-./.materials-microscopy-scratch-quarantine}"',
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
	const strategy = auditResult?.config?.strategy || 'prune-exports-and-em-scratch'
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
			} else if (strategy === 'quarantine-exports-and-em-scratch' && (target.isRedundantEmExport || target.isScratchPath)) {
				lines.push('run_cmd mkdir -p "$QUARANTINE_DIR"')
				lines.push(`run_cmd mv -n ${quotePosixPath(target.normalized)} "$QUARANTINE_DIR/"`)
			} else {
				lines.push(`run_cmd rm -f ${quotePosixPath(target.normalized)}`)
			}
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('printf "No reclaimable scale-bar figures or Cryo-EM/4D-STEM/VASP scratch under active Materials & EM shields.\\n"')
	} else {
		lines.push(`printf "Completed Materials & EM Vault remediation plan (%d target actions, DRY_RUN=%s).\\n" "${actionCount}" "$DRY_RUN"`)
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe RFC-4180 CSV audit report.
 *
 * @param {object} auditResult Result from auditMaterialsMicroscopyVault.
 * @return {string} RFC-4180 CSV string.
 */
export function buildMaterialsMicroscopyCsvReport(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const headers = [
		'cluster_id',
		'cluster_name',
		'materials_toolchain',
		'workflow_stage',
		'run_stem',
		'materials_anchor_key',
		'family',
		'cluster_verdict',
		'has_materials_master_anchor',
		'is_redundant_em_export',
		'is_em_scratch',
		'member_path',
		'artifact_kind',
		'vault_role',
		'materials_tag',
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
				cluster.materialsToolchain || '',
				cluster.workflowStage || '',
				cluster.runStem,
				cluster.materialsAnchorKey,
				cluster.family,
				cluster.clusterVerdict,
				cluster.hasMaterialsMasterAnchor ? 'true' : 'false',
				member.isRedundantEmExportMember ? 'true' : 'false',
				member.isScratchPath ? 'true' : 'false',
				member.normalized,
				member.artifactKind,
				member.vaultRole,
				member.materialsTag || '',
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
 * @param {object} auditResult Result from auditMaterialsMicroscopyVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildMaterialsMicroscopyJsonManifest(auditResult) {
	const payload = {
		schema: MATERIALS_MICROSCOPY_VAULT_SCHEMA,
		generatedAt: new Date().toISOString(),
		config: auditResult?.config || MATERIALS_MICROSCOPY_DEFAULT_CONFIG,
		summary: auditResult?.summary || {},
		clusters: (auditResult?.clusters || []).map(cluster => ({
			id: cluster.id,
			name: cluster.name,
			materialsToolchain: cluster.materialsToolchain,
			workflowStage: cluster.workflowStage,
			runStem: cluster.runStem,
			materialsAnchorKey: cluster.materialsAnchorKey,
			family: cluster.family,
			clusterVerdict: cluster.clusterVerdict,
			unitBytes: cluster.unitBytes,
			totalBytes: cluster.totalBytes,
			reclaimableBytes: cluster.reclaimableBytes,
			survivorPath: cluster.survivorPath,
			hasProtectedCifCalStandard: cluster.hasProtectedCifCalStandard,
			hasProtectedRawEmMaster: cluster.hasProtectedRawEmMaster,
			hasProtectedFacilityHold: cluster.hasProtectedFacilityHold,
			hasRedundantEmExport: cluster.hasRedundantEmExport,
			hasEmScratchIntermediate: cluster.hasEmScratchIntermediate,
			hasMaterialsMasterAnchor: cluster.hasMaterialsMasterAnchor,
			materialsTags: cluster.materialsTags,
			members: (cluster.members || []).map(member => ({
				path: member.normalized,
				artifactKind: member.artifactKind,
				vaultRole: member.vaultRole,
				materialsTag: member.materialsTag || '',
				governanceTier: member.governanceTier,
				action: member.action,
				shielded: member.shielded,
				protectedReason: member.protectedReason,
				isRedundantEmExportMember: member.isRedundantEmExportMember,
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
 * cloud sync of RELION, cryoSPARC, IMOD, py4DSTEM, DigitalMicrograph, and VASP scratch directories.
 *
 * @return {string} Line-delimited .sync-exclude.lst rules.
 */
export function buildMaterialsMicroscopySyncExcludeList() {
	return [
		'# Nextcloud / rsync exclusion rules for Materials Science, Electron Microscopy & Diffraction Vaults',
		'relion_scratch/',
		'cryosparc_cache/',
		'imod_tmp/',
		'motioncor_tmp/',
		'ctf_scratch/',
		'py4dstem_tmp/',
		'hyperspy_cache/',
		'dm_scratch/',
		'velox_cache/',
		'aztec_tmp/',
		'oim_scratch/',
		'gsas_tmp/',
		'vasp_scratch/',
		'lammps_tmp/',
		'dask_worker_space/',
		'zarr_staging/',
		'em_staging/',
		'tomo_recon_tmp/',
		'tmp_motioncor_*',
		'tmp_relion_*',
		'tmp_imod_*',
		'tmp_py4dstem_*',
		'*.dm3.tmp',
		'*.dm4.tmp',
		'*.mrc.tmp',
		'*.mrcs.tmp',
		'*.ser.tmp',
		'*.emd.tmp',
		'*.bcf.tmp',
		'*.oh5.tmp',
		'*.nxs.tmp',
		'*.xrdml.tmp',
		'*.h5.tmp',
		'*.lck',
		'*.lock',
		'*.tmp',
	].join('\n')
}
