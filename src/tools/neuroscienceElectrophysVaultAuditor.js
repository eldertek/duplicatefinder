/**
 * Pure Neuroscience, Electrophysiology & BIDS Vault Auditor.
 * Classifies and audits duplicate clusters across 4 Neuroscience & Electrophysiology Vault families:
 * - BIDS Sidecars, Montages & IRB Holds (dataset_description.json, participants.tsv, *_channels.tsv, *_electrodes.tsv, *_coordsystem.json, *_events.tsv, *_eeg.json, *_ieeg.json, *_meg.json, .sfp, .elc, .elp, .ced, .loc, .bvef, .pos, .hsp, IRB/HIPAA/clinical-EEG holds)
 * - Raw Electrophysiology & Spike Masters (.nwb, .edf, .bdf, .eeg, .vhdr, .vmrk, raw .fif, .cnt, .gdf, .set, .fdt, .abf, .nev, .ns2, .ns3, .ns5, .ns6, .rhd, .rhs, .oebin, .xdf, .smr, .smrx, .plx, .pl2, .mff, .swc, .nml)
 * - Redundant Epochs, ICA & Previews (-epo.fif, -ave.fif, -ica.fif, -cov.fif, -trans.fif, -fwd.fif, -inv.fif, -stc.h5, .erp, derived .mat/.parquet/.feather, PSD/ERP .csv/.pdf/.png exports when verified Raw/BIDS Master anchor exists)
 * - Kilosort, Phy & DAQ Scratch (kilosort_tmp/, phy_cache/, mne_cache/, eeglab_tmp/, fieldtrip_tmp/, openephys_tmp/, lsl_scratch/, spike_tmp/, temp_wh.dat, whiten_temp.dat, .nwb.tmp, .edf.tmp, .bdf.tmp, .fif.tmp, .abf.tmp, .ns5.tmp, .xdf.tmp, .lck)
 *
 * Enforces strict IRB/Clinical-EEG Hold, BIDS/Montage Baseline, and Raw Electrophysiology conservation defaults:
 * - Strictly conserves IRB, HIPAA, clinical-EEG, SEEG, and human-intracranial archival holds
 * - Strictly conserves BIDS metadata sidecars, Polhemus/electrode digitizer montages, and BrainVision/EEGLAB headers
 * - Strictly conserves verified raw NWB, EDF, BioSemi BDF, Neuromag FIF, pClamp ABF, Blackrock NS5/NEV, Intan RHD/RHS, and LSL XDF masters
 * - Detects redundant MNE epochs/ICA derivatives, PSD/ERP exports, and spectrograms when a verified raw master anchor exists
 * - Blocks pruning of epochs/ICA/preview exports lacking a verified Raw/BIDS Master anchor when guard is active
 * - Blocks hardlinks on mutable BIDS JSON/TSV/montage/header/scratch files
 *
 * Generates DRY_RUN=1 POSIX remediation scripts, CWE-1236-safe CSV reports, JSON audit
 * manifests, and .sync-exclude.lst rules. Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const NEURO_ELECTROPHYS_VAULT_SCHEMA = 'duplicatefinder.neuroscience-electrophys-vault-auditor.v1'

export const NEURO_ELECTROPHYS_FAMILIES = Object.freeze([
	'all',
	'bids-montages-ethics-holds',
	'raw-electrophys-masters',
	'redundant-epochs-ica-exports',
	'kilosort-daq-scratch',
])

export const NEURO_ELECTROPHYS_FAMILY_META = Object.freeze({
	'bids-montages-ethics-holds': {
		id: 'bids-montages-ethics-holds',
		label: 'BIDS, Montages & Holds',
		shortLabel: 'BIDS Sidecars, Digitizer Montages & IRB/Clinical-EEG Holds (.sfp, .elc, .elp, .bvef, *_events.tsv, *_electrodes.tsv, IRB)',
	},
	'raw-electrophys-masters': {
		id: 'raw-electrophys-masters',
		label: 'Raw NWB, EDF, FIF & NS5',
		shortLabel: 'Verified Raw Electrophysiology, Patch-Clamp & Spike Masters (.nwb, .edf, .bdf, .vhdr/.eeg, .fif, .abf, .nev, .ns5, .rhd, .xdf)',
	},
	'redundant-epochs-ica-exports': {
		id: 'redundant-epochs-ica-exports',
		label: 'Redundant Epochs & ICA',
		shortLabel: 'Derived MNE Epochs/ICA (-epo.fif, -ica.fif, -ave.fif), FieldTrip .mat & ERP/PSD Exports (when Master Anchor Exists)',
	},
	'kilosort-daq-scratch': {
		id: 'kilosort-daq-scratch',
		label: 'Kilosort & DAQ Scratch',
		shortLabel: 'Kilosort, Phy & DAQ Scratch (kilosort_tmp/, phy_cache/, mne_cache/, lsl_scratch/, temp_wh.dat, .nwb.tmp, .edf.tmp)',
	},
})

export const NEURO_ELECTROPHYS_STRATEGIES = Object.freeze([
	'prune-derivatives-and-daq-scratch',
	'hardlink-immutable-nwb-edf-and-ns5',
	'quarantine-derivatives-and-daq-scratch',
])

export const NEURO_ELECTROPHYS_SURVIVOR_RULES = Object.freeze([
	'bids-raw-electrophys-first',
	'oldest-recording-first',
	'newest-sort-first',
	'shortest-path',
])

export const NEURO_ELECTROPHYS_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'bids-montage-protected',
	'raw-electrophys-protected',
	'irb-hold-protected',
	'neuro-derivative-redundant',
	'daq-scratch-intermediate',
	'shielded',
])

export const NEURO_ELECTROPHYS_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const NEURO_ELECTROPHYS_PRESETS = Object.freeze([
	{
		id: 'all-neuro-electrophys-audit',
		name: 'All Neuro & BIDS Vaults',
		description: 'Audit BIDS sidecars, montages, IRB/clinical-EEG holds, raw NWB/EDF/FIF/ABF/NS5 masters, redundant epochs/ICA derivatives, and Kilosort/DAQ scratch.',
		familyFilter: 'all',
		strategy: 'prune-derivatives-and-daq-scratch',
		survivorRule: 'bids-raw-electrophys-first',
		protectBidsAndMontages: true,
		protectRawElectrophysMasters: true,
		protectIrbClinicalHolds: true,
		requireNeuroAnchorForPrune: true,
		keepRecentRecordingDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'kilosort-daq-scratch-cleanup',
		name: 'Kilosort, Phy & DAQ Scratch',
		description: 'Reclaim kilosort_tmp/, phy_cache/, mne_cache/, eeglab_tmp/, lsl_scratch/, temp_wh.dat, and .nwb.tmp/.edf.tmp scratch older than the active recording grace window.',
		familyFilter: 'all',
		strategy: 'prune-derivatives-and-daq-scratch',
		survivorRule: 'bids-raw-electrophys-first',
		protectBidsAndMontages: true,
		protectRawElectrophysMasters: true,
		protectIrbClinicalHolds: true,
		requireNeuroAnchorForPrune: true,
		keepRecentRecordingDays: 14,
		minSizeKb: 0,
	},
	{
		id: 'redundant-epochs-vs-raw-nwb',
		name: 'Redundant Epochs/ICA vs Raw Masters',
		description: 'Detect MNE epochs/ICA/source estimates (-epo.fif, -ica.fif, -ave.fif), FieldTrip .mat derivatives, and PSD/ERP exports backed by a verified raw NWB/EDF/FIF/NS5 master anchor.',
		familyFilter: 'redundant-epochs-ica-exports',
		strategy: 'quarantine-derivatives-and-daq-scratch',
		survivorRule: 'bids-raw-electrophys-first',
		protectBidsAndMontages: true,
		protectRawElectrophysMasters: true,
		protectIrbClinicalHolds: true,
		requireNeuroAnchorForPrune: true,
		keepRecentRecordingDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'bids-montages-irb-shield',
		name: 'BIDS, Montages & IRB Shield',
		description: 'Inspect BIDS sidecars (dataset_description.json, *_events.tsv, *_electrodes.tsv), digitizer montages (.sfp, .elc, .elp, .bvef), and IRB/clinical-EEG holds under strict shield.',
		familyFilter: 'bids-montages-ethics-holds',
		strategy: 'hardlink-immutable-nwb-edf-and-ns5',
		survivorRule: 'bids-raw-electrophys-first',
		protectBidsAndMontages: true,
		protectRawElectrophysMasters: true,
		protectIrbClinicalHolds: true,
		requireNeuroAnchorForPrune: true,
		keepRecentRecordingDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'raw-nwb-edf-fif-ns5-masters',
		name: 'Raw NWB, EDF, FIF, ABF & NS5',
		description: 'Audit verified raw NWB, EDF, BioSemi BDF, Neuromag FIF, pClamp ABF, Blackrock NS5/NEV, Intan RHD/RHS, and LSL XDF masters.',
		familyFilter: 'raw-electrophys-masters',
		strategy: 'hardlink-immutable-nwb-edf-and-ns5',
		survivorRule: 'bids-raw-electrophys-first',
		protectBidsAndMontages: true,
		protectRawElectrophysMasters: true,
		protectIrbClinicalHolds: true,
		requireNeuroAnchorForPrune: true,
		keepRecentRecordingDays: 0,
		minSizeKb: 0,
	},
])

export const NEURO_ELECTROPHYS_DEFAULT_CONFIG = Object.freeze({
	presetId: 'all-neuro-electrophys-audit',
	familyFilter: 'all',
	verdictFilter: 'all',
	strategy: 'prune-derivatives-and-daq-scratch',
	survivorRule: 'bids-raw-electrophys-first',
	sortMode: 'reclaim_desc',
	searchQuery: '',
	protectBidsAndMontages: true,
	protectRawElectrophysMasters: true,
	protectIrbClinicalHolds: true,
	requireNeuroAnchorForPrune: true,
	keepRecentRecordingDays: 0,
	minSizeKb: 0,
})

const STRICT_MONTAGE_EXT_RE = /\.(?:sfp|elc|elp|ced|loc|bvef|pos|hsp)$/i
const STRICT_BIDS_SIDECAR_BASENAME_RE = /^(?:dataset_description\.json|participants\.(?:tsv|json)|scans\.(?:tsv|json)|sessions\.(?:tsv|json)|params\.py|chanmap\.mat|channel_map\.npy|channel_positions\.npy)$/i
const BIDS_ENTITY_SIDECAR_RE = /(?:^|[_/])(?:channels|electrodes|events|beh)\.(?:tsv|json)$|(?:^|[_/])(?:coordsystem|eeg|ieeg|meg|ephys|nirs)\.json$/i
const STRICT_RAW_ELECTROPHYS_EXT_RE = /\.(?:nwb|edf|vhdr|vmrk|eeg|cnt|gdf|set|fdt|abf|nev|ns2|ns3|ns5|ns6|rhd|rhs|oebin|xdf|smr|smrx|plx|pl2|mff|ds)$/i
const BIOSEMI_BDF_EXT_RE = /\.bdf$/i
const NON_NEURO_NASTRAN_HINT_RE = /(?:nastran|cfd|mesh|airfoil|fem|structural|fluent|ansys|abaqus|wing_box|fuselage)/i
const MNE_FIF_EXT_RE = /\.fif$/i
const MNE_DERIVATIVE_FIF_RE = /[-_](?:epo|ave|ica|cov|trans|fwd|inv|raw_sss|tsss|clean|resampled)\.fif$/i
const MORPHOLOGY_EXT_RE = /\.(?:swc|nml)$/i
const STRICT_NEURO_DERIVATIVE_EXT_RE = /\.(?:erp|stc\.h5)$/i
const CONTEXT_NEURO_DERIVATIVE_EXT_RE = /\.(?:mat|parquet|feather|csv|tsv|pdf|png|jpg|jpeg|webp|h5|hdf5|fif)$/i
const STRICT_NEURO_SCRATCH_EXT_RE = /\.(?:nwb\.tmp|edf\.tmp|bdf\.tmp|fif\.tmp|abf\.tmp|ns5\.tmp|xdf\.tmp|vhdr\.tmp|rhd\.tmp|lck|swp)$/i
const NEURO_SCRATCH_BASENAME_RE = /^(?:temp_wh\.dat|whiten_temp\.dat|rez\.mat\.tmp|whitening_mat_dat\.tmp)$/i
const GENERIC_SCRATCH_EXT_RE = /\.(?:tmp|bak|lock|dmp|part|idx|log)$/i

const NEURO_CONTEXT_HINT_RE = /(?:neuro|electrophys|bids|rawdata|sourcedata|eeg|ieeg|seeg|meg|ecog|lfp|spike|kilosort|phy|open_?ephys|openephys|blackrock|intan|neuropixels|brainvision|biosemi|neuromag|elekta|megin|fieldtrip|eeglab|mne|pclamp|patch_?clamp|nwb|xdf|lsl|connectom|morphology|neuromorpho|allen_?brain|bci|motor_?imagery|p300|ssvep)/i
const BIDS_SUB_SESSION_PATH_RE = /(?:^|\/)sub-[a-z0-9]+(?:\/ses-[a-z0-9]+)?\/(?:eeg|ieeg|meg|beh|ephys)\//i
const NEURO_MONTAGE_PATH_RE = /(?:00_bids|00_montages|00_electrodes|00_calibration|sourcedata|montages|digitizer|headshape|coordsystem)/i
const IRB_CLINICAL_HOLD_PATH_RE = /(?:irb_?hold|ethics_?hold|clinical_?eeg_?hold|seeg_?hold|epilepsy_?hold|hipaa_?neuro_?hold|patient_?eeg_?hold|intracranial_?hold|nda_?neuro_?hold|archive_?hold)/i
const NEURO_SCRATCH_PATH_RE = /(?:kilosort_tmp|kilosort_cache|phy_cache|phy_tmp|mne_cache|mne_tmp|eeglab_tmp|fieldtrip_tmp|openephys_tmp|lsl_scratch|spike_tmp|whiten_tmp|daq_scratch|recording_staging)/i
const NEURO_INTERMEDIATE_PREFIX_RE = /^(?:tmp_kilosort_|tmp_phy_|tmp_mne_|tmp_eeglab_|tmp_nwb_|tmp_edf_|tmp_lsl_|whiten_chunk_|daq_staging_|spill_)/i
const NEURO_INTERMEDIATE_SUFFIX_RE = /(?:_kilosort_tmp|_phy_tmp|_mne_tmp|_eeglab_tmp|_lsl_tmp|_daq_tmp|_staging)$/i
const NEURO_DERIVATIVE_PATH_RE = /(?:derivatives|epochs|ica_components|psd_exports|erp_exports|tfr_outputs|spectrograms|source_estimates|preproc_exports|feature_matrices|_epochs|_ica|_psd|_erp|_tfr|_ave|_epo)/i
const CANONICAL_NEURO_VAULT_PATH_RE = /(?:00_raw|00_rawdata|00_nwb|00_edf|00_bids|rawdata|sourcedata|canonical|neuro_vault|electrophys_vault|bids_archive|bci_vault)/i

/**
 * Normalize configuration values for Neuroscience, Electrophysiology & BIDS Vault auditing.
 *
 * @param {object} [rawConfig] Raw user configuration.
 * @return {object} Normalized configuration.
 */
export function normalizeNeuroscienceElectrophysConfig(rawConfig = {}) {
	const cfg = rawConfig && typeof rawConfig === 'object' ? rawConfig : {}
	const familyFilter = NEURO_ELECTROPHYS_FAMILIES.includes(cfg.familyFilter)
		? cfg.familyFilter
		: NEURO_ELECTROPHYS_DEFAULT_CONFIG.familyFilter
	const verdictFilter = NEURO_ELECTROPHYS_VERDICT_FILTERS.includes(cfg.verdictFilter)
		? cfg.verdictFilter
		: NEURO_ELECTROPHYS_DEFAULT_CONFIG.verdictFilter
	const strategy = NEURO_ELECTROPHYS_STRATEGIES.includes(cfg.strategy)
		? cfg.strategy
		: NEURO_ELECTROPHYS_DEFAULT_CONFIG.strategy
	const survivorRule = NEURO_ELECTROPHYS_SURVIVOR_RULES.includes(cfg.survivorRule)
		? cfg.survivorRule
		: NEURO_ELECTROPHYS_DEFAULT_CONFIG.survivorRule
	const sortMode = NEURO_ELECTROPHYS_SORT_MODES.includes(cfg.sortMode)
		? cfg.sortMode
		: NEURO_ELECTROPHYS_DEFAULT_CONFIG.sortMode

	const keepRecentParsed = Number(cfg.keepRecentRecordingDays)
	const keepRecentRecordingDays = Number.isFinite(keepRecentParsed) && keepRecentParsed >= 0
		? Math.floor(keepRecentParsed)
		: NEURO_ELECTROPHYS_DEFAULT_CONFIG.keepRecentRecordingDays

	const minSizeParsed = Number(cfg.minSizeKb)
	const minSizeKb = Number.isFinite(minSizeParsed) && minSizeParsed > 0
		? minSizeParsed
		: 0

	return {
		presetId: typeof cfg.presetId === 'string' && cfg.presetId ? cfg.presetId : NEURO_ELECTROPHYS_DEFAULT_CONFIG.presetId,
		familyFilter,
		verdictFilter,
		strategy,
		survivorRule,
		sortMode,
		searchQuery: typeof cfg.searchQuery === 'string' ? cfg.searchQuery.trim() : '',
		protectBidsAndMontages: cfg.protectBidsAndMontages !== undefined ? Boolean(cfg.protectBidsAndMontages) : true,
		protectRawElectrophysMasters: cfg.protectRawElectrophysMasters !== undefined ? Boolean(cfg.protectRawElectrophysMasters) : true,
		protectIrbClinicalHolds: cfg.protectIrbClinicalHolds !== undefined ? Boolean(cfg.protectIrbClinicalHolds) : true,
		requireNeuroAnchorForPrune: cfg.requireNeuroAnchorForPrune !== undefined ? Boolean(cfg.requireNeuroAnchorForPrune) : true,
		keepRecentRecordingDays,
		minSizeKb,
		memberOverrides: cfg.memberOverrides && typeof cfg.memberOverrides === 'object' ? { ...cfg.memberOverrides } : {},
	}
}

/**
 * Extract normalized recording or BIDS session stem by stripping extensions and derivative suffixes.
 *
 * @param {string} basename Filename without directory.
 * @param {string} [normalized] Full normalized path.
 * @return {string} Normalized recording stem.
 */
export function extractNeuroscienceElectrophysStem(basename, normalized = '') {
	let stem = String(basename || normalized || '').trim().toLowerCase()
	stem = stem.replace(/\.(?:nwb\.tmp|edf\.tmp|bdf\.tmp|fif\.tmp|abf\.tmp|ns5\.tmp|xdf\.tmp|vhdr\.tmp|rhd\.tmp|stc\.h5)$/i, '')
	stem = stem.replace(/\.[a-z0-9]{1,8}$/i, '')
	stem = stem.replace(NEURO_INTERMEDIATE_PREFIX_RE, '')
	stem = stem.replace(NEURO_INTERMEDIATE_SUFFIX_RE, '')
	stem = stem.replace(/(?:[-_](?:epo|ave|ica|cov|trans|fwd|inv|raw_sss|tsss|preproc|filtered|psd|tfr|erp|spectrogram|epochs|features|clean|resampled|export|preview|plot|copy|bak|draft|v\d+|rev\d+))+$/i, '')
	return stem || 'neuro-recording'
}

/**
 * Extract canonical anchor key linking derived epochs/ICA/PSD exports to raw NWB/EDF/FIF/NS5 masters.
 *
 * @param {string} recordingStem Extracted recording stem.
 * @return {string} Canonical anchor key.
 */
export function extractNeuroscienceElectrophysAnchorKey(recordingStem) {
	return String(recordingStem || 'neuro-recording')
		.toLowerCase()
		.replace(/(?:[-_](?:eeg|ieeg|seeg|meg|ephys|nwb|edf|bdf|fif|abf|ns5|nev|rhd|xdf|channels|electrodes|events|coordsystem|summary|report))$/i, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '') || 'neuro-recording'
}

/**
 * Detect Neuroscience & Electrophysiology toolchain and workflow stage from path and filename.
 *
 * @param {string} normalized Normalized path.
 * @param {string} basename Filename.
 * @return {{ neuroToolchain: string, workflowStage: string }} Detected toolchain and stage.
 */
function extractNeuroToolchainAndStage(normalized, basename) {
	const text = `${normalized} ${basename}`.toLowerCase()
	let neuroToolchain = ''
	if (/\.nwb\b|neurodata/.test(text)) {
		neuroToolchain = 'NWB / DANDI Standard'
	} else if (/\.(?:vhdr|vmrk|bvef)\b|brainvision/.test(text)) {
		neuroToolchain = 'BrainVision Recorder'
	} else if (/\.bdf\b|biosemi/.test(text)) {
		neuroToolchain = 'BioSemi ActiveTwo'
	} else if (/\.edf\b/.test(text)) {
		neuroToolchain = 'EDF / Clinical EEG'
	} else if (/\.fif\b|neuromag|elekta|megin|\bmne\b/.test(text)) {
		neuroToolchain = 'MNE-Python / Neuromag MEG'
	} else if (/\.(?:set|fdt|erp)\b|eeglab|erplab/.test(text)) {
		neuroToolchain = 'EEGLAB / ERPLAB'
	} else if (/\.abf\b|pclamp|axon/.test(text)) {
		neuroToolchain = 'Axon pClamp Patch-Clamp'
	} else if (/\.(?:nev|ns2|ns3|ns5|ns6)\b|blackrock/.test(text)) {
		neuroToolchain = 'Blackrock Neurotech Array'
	} else if (/\.(?:rhd|rhs)\b|intan/.test(text)) {
		neuroToolchain = 'Intan RHX Electrophysiology'
	} else if (/\.oebin\b|open_?ephys|openephys/.test(text)) {
		neuroToolchain = 'Open Ephys Acquisition'
	} else if (/\.xdf\b|\blsl\b/.test(text)) {
		neuroToolchain = 'Lab Streaming Layer (XDF)'
	} else if (/kilosort|\bphy\b|temp_wh\.dat|spike_times/.test(text)) {
		neuroToolchain = 'Kilosort / Phy Spike Sorting'
	} else if (/\.(?:swc|nml)\b|neuromorpho/.test(text)) {
		neuroToolchain = 'SWC / NeuroML Morphology'
	} else if (BIDS_SUB_SESSION_PATH_RE.test(normalized.toLowerCase()) || STRICT_BIDS_SIDECAR_BASENAME_RE.test(basename) || BIDS_ENTITY_SIDECAR_RE.test(basename)) {
		neuroToolchain = 'BIDS-Electrophysiology'
	}

	let workflowStage = ''
	if (IRB_CLINICAL_HOLD_PATH_RE.test(text)) {
		workflowStage = 'IRB / Clinical-EEG / HIPAA Hold'
	} else if (STRICT_MONTAGE_EXT_RE.test(basename) || STRICT_BIDS_SIDECAR_BASENAME_RE.test(basename) || BIDS_ENTITY_SIDECAR_RE.test(basename)) {
		workflowStage = 'BIDS Sidecar / Montage Baseline'
	} else if (NEURO_SCRATCH_PATH_RE.test(text) || STRICT_NEURO_SCRATCH_EXT_RE.test(basename) || NEURO_SCRATCH_BASENAME_RE.test(basename) || NEURO_INTERMEDIATE_PREFIX_RE.test(basename) || NEURO_INTERMEDIATE_SUFFIX_RE.test(basename)) {
		workflowStage = 'Kilosort / Phy / DAQ Scratch'
	} else if (MNE_DERIVATIVE_FIF_RE.test(basename) || STRICT_NEURO_DERIVATIVE_EXT_RE.test(basename) || NEURO_DERIVATIVE_PATH_RE.test(text)) {
		workflowStage = 'Preprocessed Epochs / ICA / PSD'
	} else if (STRICT_RAW_ELECTROPHYS_EXT_RE.test(basename) || BIOSEMI_BDF_EXT_RE.test(basename) || MNE_FIF_EXT_RE.test(basename) || MORPHOLOGY_EXT_RE.test(basename)) {
		workflowStage = 'Raw Electrophysiology Master'
	}

	return { neuroToolchain, workflowStage }
}

/**
 * Extract concise Neuroscience & Electrophysiology domain tag badge when present.
 *
 * @param {string} lowerBase Lowercase filename.
 * @param {string} lowerPath Lowercase full path.
 * @return {string} Short tag or empty string.
 */
function extractNeuroDomainTag(lowerBase, lowerPath) {
	const text = `${lowerPath} ${lowerBase}`
	if (IRB_CLINICAL_HOLD_PATH_RE.test(text)) {
		return 'IRB / CLINICAL HOLD'
	}
	if (STRICT_BIDS_SIDECAR_BASENAME_RE.test(lowerBase) || BIDS_ENTITY_SIDECAR_RE.test(lowerBase)) {
		return 'BIDS SIDECAR'
	}
	if (STRICT_MONTAGE_EXT_RE.test(lowerBase)) {
		return 'ELECTRODE MONTAGE'
	}
	if (/\.nwb\b/.test(lowerBase)) {
		return 'NWB MASTER'
	}
	if (/\.(?:edf|bdf)\b/.test(lowerBase)) {
		return 'EDF / BDF RAW'
	}
	if (/\.(?:vhdr|vmrk|eeg)\b/.test(lowerBase)) {
		return 'BRAINVISION TRIPLET'
	}
	if (MNE_DERIVATIVE_FIF_RE.test(lowerBase)) {
		return 'MNE DERIVATIVE'
	}
	if (/\.fif\b/.test(lowerBase)) {
		return 'MEG FIF RAW'
	}
	if (/\.abf\b/.test(lowerBase)) {
		return 'PATCH-CLAMP ABF'
	}
	if (/\.(?:nev|ns2|ns3|ns5|ns6|rhd|rhs|oebin)\b/.test(lowerBase)) {
		return 'SPIKE / LFP RAW'
	}
	if (/\.xdf\b/.test(lowerBase)) {
		return 'LSL XDF STREAM'
	}
	if (/\.(?:swc|nml)\b/.test(lowerBase)) {
		return 'NEURON MORPHOLOGY'
	}
	if (NEURO_SCRATCH_BASENAME_RE.test(lowerBase) || STRICT_NEURO_SCRATCH_EXT_RE.test(lowerBase)) {
		return 'DAQ / SORT SCRATCH'
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
 * Classify a single file within the Neuroscience, Electrophysiology & BIDS domain.
 *
 * @param {object} file Duplicate file object.
 * @param {number} [referenceNowMs] Reference current timestamp in ms.
 * @return {object} Classification metadata (family === null if non-domain file).
 */
export function classifyNeuroscienceElectrophysFile(file, referenceNowMs = Date.now()) {
	const rawPath = String(file?.path || file?.name || '')
	const normalized = normalizePathForDiff(rawPath)
	const lower = normalized.toLowerCase()
	const slashIdx = normalized.lastIndexOf('/')
	const basename = slashIdx >= 0 ? normalized.slice(slashIdx + 1) : normalized
	const dirname = slashIdx >= 0 ? normalized.slice(0, slashIdx) : ''
	const lowerBase = basename.toLowerCase()
	const size = Math.max(0, Number(file?.size) || 0)
	const { mtimeMs, ageDays, formattedMtime } = parseFileTime(file, referenceNowMs)

	const hasNeuroContext = NEURO_CONTEXT_HINT_RE.test(lower) || BIDS_SUB_SESSION_PATH_RE.test(lower)
	const isBidsPath = BIDS_SUB_SESSION_PATH_RE.test(lower) || /(?:^|\/)(?:bids|rawdata|sourcedata)(?:\/|$)/i.test(lower)
	const isNeuroMontagePath = NEURO_MONTAGE_PATH_RE.test(lower)
	const isIrbHoldPath = IRB_CLINICAL_HOLD_PATH_RE.test(lower)
	const isCanonicalVaultPath = CANONICAL_NEURO_VAULT_PATH_RE.test(lower)
	const isScratchPath = NEURO_SCRATCH_PATH_RE.test(lower)
	const isNeuroDerivativePath = NEURO_DERIVATIVE_PATH_RE.test(lower)

	const isStrictScratchExt = STRICT_NEURO_SCRATCH_EXT_RE.test(lowerBase) || NEURO_SCRATCH_BASENAME_RE.test(lowerBase)
	const isGenericScratchExt = GENERIC_SCRATCH_EXT_RE.test(lowerBase)
	const isIntermediateSubfile = NEURO_INTERMEDIATE_PREFIX_RE.test(lowerBase) || NEURO_INTERMEDIATE_SUFFIX_RE.test(lowerBase)

	const isStrictMontageExt = STRICT_MONTAGE_EXT_RE.test(lowerBase) && (hasNeuroContext || isNeuroMontagePath || /\.(?:sfp|elc|elp|bvef|hsp)$/i.test(lowerBase))
	const isBidsSidecar = (STRICT_BIDS_SIDECAR_BASENAME_RE.test(lowerBase) && (hasNeuroContext || isBidsPath || isNeuroMontagePath || /^dataset_description\.json$/i.test(lowerBase)))
		|| (BIDS_ENTITY_SIDECAR_RE.test(lowerBase) && (hasNeuroContext || isBidsPath || /_(?:eeg|ieeg|meg|ephys)\.json$|_(?:channels|electrodes|events)\.tsv$/i.test(lowerBase)))

	const isBiosemiBdf = BIOSEMI_BDF_EXT_RE.test(lowerBase) && !NON_NEURO_NASTRAN_HINT_RE.test(lower) && (
		hasNeuroContext
		|| isBidsPath
		|| isIrbHoldPath
		|| /biosemi|eeg|sub-|ses-|task-|sleep|polysomn/i.test(lower)
	)
	const isMneDerivativeFif = MNE_DERIVATIVE_FIF_RE.test(lowerBase)
	const isRawFif = MNE_FIF_EXT_RE.test(lowerBase) && !isMneDerivativeFif
	const isMorphologyMaster = MORPHOLOGY_EXT_RE.test(lowerBase) && (hasNeuroContext || /morph|neuron|dendrit|axon|connectom/i.test(lower))
	const isStrictRawMasterExt = (STRICT_RAW_ELECTROPHYS_EXT_RE.test(lowerBase) || isBiosemiBdf || isRawFif || isMorphologyMaster)
		&& !isMneDerivativeFif

	const isContextDerivative = (
		STRICT_NEURO_DERIVATIVE_EXT_RE.test(lowerBase)
		|| isMneDerivativeFif
		|| (CONTEXT_NEURO_DERIVATIVE_EXT_RE.test(lowerBase) && !isStrictRawMasterExt && !isBidsSidecar && (hasNeuroContext || isNeuroDerivativePath))
	)

	let family = null
	let artifactKind = 'Unknown'
	let vaultRole = 'Outside Neuroscience & Electrophysiology Vault'
	let isProtectedBidsMontage = false
	let isProtectedRawElectrophysMaster = false
	let isProtectedIrbClinicalHold = false
	let isNeuroMasterAnchor = false
	let isRedundantNeuroDerivative = false
	let isMutableFile = false

	if (
		isStrictScratchExt
		|| (isScratchPath && (isGenericScratchExt || isContextDerivative || isStrictRawMasterExt || isStrictMontageExt || isBidsSidecar))
		|| (isIntermediateSubfile && (isStrictRawMasterExt || isContextDerivative || hasNeuroContext))
		|| (isGenericScratchExt && hasNeuroContext)
	) {
		family = 'kilosort-daq-scratch'
		artifactKind = isStrictScratchExt
			? 'Kilosort / DAQ Whitening & Recording Scratch'
			: (isIntermediateSubfile ? 'Spike-Sorting / MNE Intermediate Cache' : 'LSL / Open Ephys / Phy Scratch')
		vaultRole = 'Kilosort, Phy, MNE, EEGLAB or DAQ Scratch'
		isMutableFile = true
	} else if (isIrbHoldPath && (isStrictMontageExt || isBidsSidecar || isStrictRawMasterExt || isContextDerivative || hasNeuroContext)) {
		family = 'bids-montages-ethics-holds'
		artifactKind = 'IRB / Clinical-EEG / HIPAA Hold'
		vaultRole = 'Protected Clinical & Human Electrophysiology Hold'
		isProtectedIrbClinicalHold = true
		isProtectedBidsMontage = true
		isNeuroMasterAnchor = isStrictRawMasterExt || isBidsSidecar || isStrictMontageExt
		isMutableFile = /\.(?:json|tsv|csv|txt|xml|vhdr|vmrk|set|sfp|elc|elp|ced|loc|bvef|pos|hsp|py|mat|log)$/i.test(lowerBase) || isBidsSidecar
	} else if (isBidsSidecar || isStrictMontageExt) {
		family = 'bids-montages-ethics-holds'
		if (STRICT_MONTAGE_EXT_RE.test(lowerBase)) {
			artifactKind = 'Electrode Montage / Polhemus Head-Shape'
			vaultRole = '3D Sensor Coordinate & Digitizer Baseline'
		} else if (/^params\.py$|^chanmap\.mat$|^channel_/i.test(lowerBase)) {
			artifactKind = 'Kilosort / Phy Probe Map & Parameters'
			vaultRole = 'Neuropixels / Silicon Probe Geometry Baseline'
		} else {
			artifactKind = 'BIDS-Electrophysiology Metadata Sidecar'
			vaultRole = 'Canonical Channel, Event & Acquisition Provenance'
		}
		isProtectedBidsMontage = true
		isNeuroMasterAnchor = true
		isMutableFile = true
	} else if (isStrictRawMasterExt) {
		family = 'raw-electrophys-masters'
		if (/\.nwb$/i.test(lowerBase)) {
			artifactKind = 'NWB Neurodata Without Borders Master'
			vaultRole = 'FAIR HDF5 Electrophysiology & Behavior Master'
		} else if (/\.(?:edf|bdf)$/i.test(lowerBase)) {
			artifactKind = 'EDF / BioSemi BDF Raw EEG Master'
			vaultRole = 'Unaltered Continuous Bio-Potential Master'
		} else if (/\.(?:vhdr|vmrk|eeg)$/i.test(lowerBase)) {
			artifactKind = 'BrainVision Triplet (.vhdr/.vmrk/.eeg) Master'
			vaultRole = 'Synchronized EEG Header, Marker & Binary Master'
		} else if (isRawFif) {
			artifactKind = 'Neuromag / MNE Raw MEG FIF Master'
			vaultRole = 'Unfiltered SQUID / OPM MEG Acquisition Master'
		} else if (/\.abf$/i.test(lowerBase)) {
			artifactKind = 'Axon pClamp Patch-Clamp ABF Master'
			vaultRole = 'Whole-Cell / Single-Channel Clamp Master'
		} else if (/\.(?:nev|ns2|ns3|ns5|ns6|rhd|rhs|oebin|smr|smrx|plx|pl2)$/i.test(lowerBase)) {
			artifactKind = 'Multi-Electrode Spike / LFP Raw Master'
			vaultRole = 'High-Rate Broadband Neural Recording Master'
		} else if (/\.xdf$/i.test(lowerBase)) {
			artifactKind = 'Lab Streaming Layer XDF Multimodal Master'
			vaultRole = 'Time-Synchronized BCI & Marker Stream Master'
		} else if (isMorphologyMaster) {
			artifactKind = 'Neuron Morphology Reconstruction (.swc/.nml)'
			vaultRole = 'Curated Dendritic & Axonal Arbor Master'
		} else {
			artifactKind = 'Raw EEG / EEGLAB / CTF Acquisition Master'
			vaultRole = 'Canonical Raw Electrophysiology Recording'
		}
		isProtectedRawElectrophysMaster = true
		isNeuroMasterAnchor = true
		isMutableFile = /\.(?:vhdr|vmrk|set|oebin|swc|nml)$/i.test(lowerBase)
	} else if (isContextDerivative) {
		family = 'redundant-epochs-ica-exports'
		if (isMneDerivativeFif) {
			artifactKind = 'MNE Preprocessed Epochs / ICA / Inverse FIF'
		} else if (/\.erp$/i.test(lowerBase) || /\.mat$/i.test(lowerBase)) {
			artifactKind = 'EEGLAB / FieldTrip / ERPLAB Derived Matrix'
		} else if (/\.(?:parquet|feather|h5|hdf5)$/i.test(lowerBase)) {
			artifactKind = 'Spectral / Connectivity Feature Matrix'
		} else if (/\.(?:csv|tsv)$/i.test(lowerBase)) {
			artifactKind = 'PSD / ERP Amplitude Table Export'
		} else {
			artifactKind = 'Topomap / Spectrogram / ERP Quicklook Export'
		}
		vaultRole = 'Derived Electrophysiology Epoch, ICA or Plot Export'
		isRedundantNeuroDerivative = true
		isMutableFile = true
	}

	const { neuroToolchain, workflowStage } = extractNeuroToolchainAndStage(normalized, basename)
	const recordingStem = extractNeuroscienceElectrophysStem(basename, normalized)
	const neuroAnchorKey = extractNeuroscienceElectrophysAnchorKey(recordingStem)
	const neuroTag = extractNeuroDomainTag(lowerBase, lower)

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
		neuroToolchain,
		workflowStage,
		recordingStem,
		neuroAnchorKey,
		neuroTag,
		isProtectedBidsMontage,
		isProtectedRawElectrophysMaster,
		isProtectedIrbClinicalHold,
		isNeuroMasterAnchor,
		isRedundantNeuroDerivative,
		isMutableFile,
		isScratchPath: isScratchPath || isStrictScratchExt || (isIntermediateSubfile && family === 'kilosort-daq-scratch') || (isGenericScratchExt && hasNeuroContext),
		isBidsPath,
		isNeuroMontagePath,
		isIrbHoldPath,
		isCanonicalVaultPath,
	}
}

/**
 * Determine whether a duplicate group belongs to the Neuroscience & Electrophysiology domain.
 *
 * @param {object} group Duplicate group.
 * @return {boolean} True when at least one file belongs to this domain.
 */
export function isNeuroscienceElectrophysGroup(group) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return false
	}
	return group.files.some(file => classifyNeuroscienceElectrophysFile(file).family !== null)
}

/**
 * Build cross-group correlation index linking verified Raw Electrophysiology/BIDS/Montage anchors
 * to derived MNE epochs/ICA, FieldTrip matrices, and PSD/ERP exports.
 *
 * @param {Array<object>} groups Domain duplicate groups.
 * @return {object} Correlation index.
 */
export function buildNeuroscienceElectrophysCorrelationIndex(groups) {
	const anchorStems = new Set()
	const anchorKeys = new Set()

	for (const group of Array.isArray(groups) ? groups : []) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (const file of group.files) {
			const meta = classifyNeuroscienceElectrophysFile(file)
			if (!meta.family) {
				continue
			}
			if (meta.isNeuroMasterAnchor) {
				anchorStems.add(meta.recordingStem)
				anchorKeys.add(meta.neuroAnchorKey)
			}
		}
	}

	return {
		anchorStems,
		anchorKeys,
	}
}

/**
 * Determine primary family for a heterogeneous Neuroscience & Electrophysiology cluster.
 *
 * @param {Array<object>} members Classified members.
 * @return {string} Family ID.
 */
function resolveClusterFamily(members) {
	if (members.some(m => m.family === 'bids-montages-ethics-holds')) {
		return 'bids-montages-ethics-holds'
	}
	if (members.some(m => m.family === 'raw-electrophys-masters')) {
		return 'raw-electrophys-masters'
	}
	if (members.some(m => m.family === 'redundant-epochs-ica-exports')) {
		return 'redundant-epochs-ica-exports'
	}
	return 'kilosort-daq-scratch'
}

/**
 * Compute deterministic survivor priority score for a Neuroscience & Electrophysiology vault member.
 *
 * @param {object} member Classified member.
 * @param {string} survivorRule Survivor rule.
 * @return {number} Priority score (higher wins).
 */
function scoreMemberForSurvivor(member, survivorRule) {
	const mtimeScore = member.mtimeMs !== null ? member.mtimeMs / 1e10 : 0
	const shortPathScore = 1000 - Math.min(999, member.normalized.length)

	if (survivorRule === 'oldest-recording-first') {
		const oldestScore = member.mtimeMs !== null ? -mtimeScore : 0
		return (member.isProtectedIrbClinicalHold ? 100000 : 0)
			+ (member.isProtectedBidsMontage ? 97000 : 0)
			+ (member.isProtectedRawElectrophysMaster ? 94000 : 0)
			+ (member.isCanonicalVaultPath ? 25000 : 0)
			+ (member.isBidsPath ? 10000 : 0)
			+ (member.isScratchPath ? -55000 : 0)
			+ (member.isRedundantNeuroDerivative ? -40000 : 0)
			+ oldestScore
			+ shortPathScore
	}

	if (survivorRule === 'newest-sort-first') {
		return (member.isProtectedIrbClinicalHold ? 100000 : 0)
			+ (member.isProtectedBidsMontage ? 97000 : 0)
			+ (member.isProtectedRawElectrophysMaster ? 94000 : 0)
			+ (member.isScratchPath ? -50000 : 0)
			+ (member.isRedundantNeuroDerivative ? -40000 : 0)
			+ mtimeScore
	}

	if (survivorRule === 'shortest-path') {
		return (member.isProtectedIrbClinicalHold ? 52000 : 0)
			+ (member.isProtectedBidsMontage ? 50000 : 0)
			+ (member.isProtectedRawElectrophysMaster ? 48000 : 0)
			+ (member.isScratchPath ? -30000 : 0)
			+ shortPathScore
	}

	return (member.isProtectedIrbClinicalHold ? 100000 : 0)
		+ (member.isProtectedBidsMontage ? 97000 : 0)
		+ (member.isProtectedRawElectrophysMaster ? 94000 : 0)
		+ (member.isCanonicalVaultPath ? 25000 : 0)
		+ (member.isBidsPath ? 10000 : 0)
		+ (member.isRedundantNeuroDerivative ? -45000 : 0)
		+ (member.isScratchPath ? -60000 : 0)
		+ shortPathScore
}

/**
 * Audit a single Neuroscience & Electrophysiology duplicate cluster.
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
		const meta = classifyNeuroscienceElectrophysFile(file, referenceNowMs)
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
	const primaryToolchain = rawMembers.find(m => m.neuroToolchain)?.neuroToolchain || ''
	const primaryStage = rawMembers.find(m => m.workflowStage)?.workflowStage || ''
	const primaryStem = rawMembers[0].recordingStem || extractNeuroscienceElectrophysStem(primaryName, rawMembers[0].normalized)
	const primaryAnchorKey = rawMembers[0].neuroAnchorKey || extractNeuroscienceElectrophysAnchorKey(primaryStem)

	const hasNeuroMasterAnchor = Boolean(
		rawMembers.some(m => m.isNeuroMasterAnchor)
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

		const isRedundantNeuroDerivativeMember = member.isRedundantNeuroDerivative && hasNeuroMasterAnchor

		let redundancyReason = ''
		if (member.isRedundantNeuroDerivative) {
			redundancyReason = isRedundantNeuroDerivativeMember
				? 'Derived MNE epochs/ICA, FieldTrip .mat, or PSD/ERP export duplicates verified Raw NWB/EDF/FIF/NS5 master'
				: 'Preprocessed epochs, ICA, or plot export without verified Raw Electrophysiology or BIDS master anchor'
		}

		let governanceTier = 'daq-scratch-intermediate'
		let shielded = false
		let protectedReason = ''
		let action = 'keep'

		if (override === 'keep') {
			governanceTier = member.isProtectedIrbClinicalHold
				? 'irb-hold-protected'
				: (member.isProtectedBidsMontage
					? 'bids-montage-protected'
					: (member.isProtectedRawElectrophysMaster
						? 'raw-electrophys-protected'
						: (member.isRedundantNeuroDerivative
							? 'neuro-derivative-redundant'
							: 'daq-scratch-intermediate')))
			shielded = true
			protectedReason = 'Manually shielded via per-copy override'
		} else if (member.isProtectedIrbClinicalHold && config.protectIrbClinicalHolds) {
			governanceTier = 'irb-hold-protected'
			shielded = true
			protectedReason = 'IRB, HIPAA, clinical-EEG, or SEEG intracranial hold strictly conserved'
		} else if (member.isProtectedBidsMontage && config.protectBidsAndMontages) {
			governanceTier = 'bids-montage-protected'
			shielded = true
			protectedReason = 'BIDS metadata sidecar, digitizer montage (.sfp/.elc/.elp/.bvef), or probe map strictly conserved'
		} else if (member.isProtectedRawElectrophysMaster && config.protectRawElectrophysMasters) {
			governanceTier = 'raw-electrophys-protected'
			shielded = true
			protectedReason = 'Verified raw NWB, EDF, BDF, FIF, ABF, Blackrock NS5/NEV, Intan RHD, or XDF master strictly conserved'
		} else if (isSurvivor && !isRedundantNeuroDerivativeMember) {
			governanceTier = member.isProtectedIrbClinicalHold
				? 'irb-hold-protected'
				: (member.isProtectedBidsMontage
					? 'bids-montage-protected'
					: (member.isProtectedRawElectrophysMaster
						? 'raw-electrophys-protected'
						: (member.isRedundantNeuroDerivative
							? 'neuro-derivative-redundant'
							: 'daq-scratch-intermediate')))
			shielded = true
			protectedReason = 'Canonical Neuroscience & Electrophysiology vault survivor retained'
		} else if (override === 'prune') {
			governanceTier = member.isRedundantNeuroDerivative
				? 'neuro-derivative-redundant'
				: (member.isProtectedBidsMontage
					? 'bids-montage-protected'
					: 'daq-scratch-intermediate')
			action = config.strategy === 'hardlink-immutable-nwb-edf-and-ns5' && !member.isMutableFile && !member.isScratchPath
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
			config.keepRecentRecordingDays > 0
			&& member.isScratchPath
			&& member.ageDays !== null
			&& member.ageDays < config.keepRecentRecordingDays
		) {
			governanceTier = 'daq-scratch-intermediate'
			shielded = true
			protectedReason = `Within ${config.keepRecentRecordingDays}-day active Kilosort, Phy, MNE, or DAQ grace window`
		} else if (member.isRedundantNeuroDerivative) {
			governanceTier = 'neuro-derivative-redundant'
			if (config.requireNeuroAnchorForPrune && !hasNeuroMasterAnchor) {
				shielded = true
				protectedReason = 'Blocked until a verified Raw NWB, EDF, FIF, ABF, NS5, or BIDS master anchor exists'
			} else {
				action = 'delete'
				deleteTargetsCount += 1
				reclaimableBytes += member.size
				protectedReason = redundancyReason
			}
		} else if (member.isScratchPath) {
			governanceTier = 'daq-scratch-intermediate'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
			protectedReason = 'Kilosort, Phy, MNE, EEGLAB, or LSL DAQ scratch eligible for cleanup'
		} else if (member.isProtectedRawElectrophysMaster || member.isProtectedBidsMontage) {
			governanceTier = member.isProtectedBidsMontage ? 'bids-montage-protected' : 'raw-electrophys-protected'
			action = config.strategy === 'hardlink-immutable-nwb-edf-and-ns5' && !member.isMutableFile ? 'hardlink' : 'delete'
			if (action === 'hardlink') {
				hardlinkSavingsBytes += member.size
				hardlinkTargetsCount += 1
			} else {
				deleteTargetsCount += 1
			}
			reclaimableBytes += member.size
		} else if (config.strategy === 'hardlink-immutable-nwb-edf-and-ns5' && !member.isMutableFile) {
			governanceTier = 'raw-electrophys-protected'
			action = 'hardlink'
			hardlinkSavingsBytes += member.size
			hardlinkTargetsCount += 1
			reclaimableBytes += member.size
		} else {
			governanceTier = 'daq-scratch-intermediate'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
		}

		if (shielded) {
			shieldedCount += 1
		}

		return {
			...member,
			isRedundantNeuroDerivativeMember,
			redundancyReason,
			isSurvivor,
			governanceTier,
			shielded,
			protectedReason,
			action,
		}
	})

	const hasRedundantNeuroDerivative = members.some(m => m.isRedundantNeuroDerivativeMember || m.isRedundantNeuroDerivative)
	const hasProtectedIrbHold = members.some(m => m.governanceTier === 'irb-hold-protected' && m.shielded)
	const hasProtectedBidsMontage = members.some(m => m.governanceTier === 'bids-montage-protected' && m.shielded)
	const hasProtectedRawElectrophysMaster = members.some(m => m.governanceTier === 'raw-electrophys-protected' && m.shielded)
	const hasDaqScratchIntermediate = members.some(m => m.isScratchPath)

	let clusterVerdict = 'shielded'
	if (reclaimableBytes > 0) {
		if (members.some(m => m.isRedundantNeuroDerivativeMember && !m.shielded)) {
			clusterVerdict = 'neuro-derivative-redundant'
		} else if (members.some(m => m.isScratchPath && !m.shielded)) {
			clusterVerdict = 'daq-scratch-intermediate'
		} else {
			clusterVerdict = 'reclaimable'
		}
	} else if (hasProtectedIrbHold) {
		clusterVerdict = 'irb-hold-protected'
	} else if (hasProtectedBidsMontage) {
		clusterVerdict = 'bids-montage-protected'
	} else if (hasProtectedRawElectrophysMaster) {
		clusterVerdict = 'raw-electrophys-protected'
	}

	let priorityScore = 10
	if (reclaimableBytes > 0) {
		priorityScore = hasRedundantNeuroDerivative ? 95 : 85
	} else if (hasProtectedIrbHold) {
		priorityScore = 60
	} else if (hasProtectedBidsMontage) {
		priorityScore = 50
	}

	const neuroTags = [...new Set(members.map(m => m.neuroTag).filter(Boolean))]
	const familyMeta = NEURO_ELECTROPHYS_FAMILY_META[family] || NEURO_ELECTROPHYS_FAMILY_META['kilosort-daq-scratch']

	return {
		id: group.id ?? primaryName,
		hash: group.hash || '',
		name: primaryName,
		neuroToolchain: primaryToolchain,
		workflowStage: primaryStage,
		recordingStem: primaryStem,
		neuroAnchorKey: primaryAnchorKey,
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
		hasProtectedBidsMontage,
		hasProtectedRawElectrophysMaster,
		hasProtectedIrbHold,
		hasRedundantNeuroDerivative,
		hasDaqScratchIntermediate,
		hasNeuroMasterAnchor,
		neuroTags,
		members,
		sourceGroup: group,
	}
}

/**
 * Audit a list of duplicate groups as a Neuroscience, Electrophysiology & BIDS Vault.
 *
 * @param {Array<object>} groups Duplicate groups.
 * @param {object} [rawConfig] Optional audit configuration.
 * @param {number} [referenceNowMs] Optional reference timestamp in ms.
 * @return {object} Comprehensive Neuroscience & Electrophysiology vault audit report.
 */
export function auditNeuroscienceElectrophysVault(groups, rawConfig = {}, referenceNowMs = Date.now()) {
	const config = normalizeNeuroscienceElectrophysConfig(rawConfig)
	const groupList = Array.isArray(groups) ? groups : []

	const domainGroups = groupList.filter(isNeuroscienceElectrophysGroup)
	const correlationIndex = buildNeuroscienceElectrophysCorrelationIndex(domainGroups)

	const allClusters = domainGroups
		.map(group => auditSingleCluster(group, correlationIndex, config, referenceNowMs))
		.filter(Boolean)

	const minBytes = config.minSizeKb * 1024
	const sizeFiltered = allClusters.filter(cluster => cluster.unitBytes >= minBytes || cluster.totalBytes >= minBytes)

	const familyCounts = {
		'bids-montages-ethics-holds': 0,
		'raw-electrophys-masters': 0,
		'redundant-epochs-ica-exports': 0,
		'kilosort-daq-scratch': 0,
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
				cluster.neuroToolchain,
				cluster.workflowStage,
				cluster.recordingStem,
				cluster.neuroAnchorKey,
				cluster.familyLabel,
				...cluster.neuroTags,
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
	let totalBidsMontageClusters = 0
	let totalRawElectrophysMasterClusters = 0
	let totalIrbHoldClusters = 0
	let totalRedundantDerivativeClusters = 0
	let totalDaqScratchClusters = 0

	for (const cluster of filteredClusters) {
		rawDuplicateBytes += Math.max(0, cluster.totalBytes - cluster.unitBytes)
		reclaimableBytes += cluster.reclaimableBytes
		totalReclaimableCopiesCount += cluster.reclaimableTargetsCount
		totalShieldedCopiesCount += cluster.shieldedCount
		if (cluster.hasProtectedBidsMontage) {
			totalBidsMontageClusters += 1
		}
		if (cluster.hasProtectedRawElectrophysMaster) {
			totalRawElectrophysMasterClusters += 1
		}
		if (cluster.hasProtectedIrbHold) {
			totalIrbHoldClusters += 1
		}
		if (cluster.hasRedundantNeuroDerivative) {
			totalRedundantDerivativeClusters += 1
		}
		if (cluster.hasDaqScratchIntermediate) {
			totalDaqScratchClusters += 1
		}
	}

	const reclaimableGb = `${(reclaimableBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
	const efficiencyPct = rawDuplicateBytes > 0
		? Math.min(100, Math.round((reclaimableBytes / rawDuplicateBytes) * 100))
		: 0

	const familyBreakdown = NEURO_ELECTROPHYS_FAMILIES
		.filter(id => id !== 'all')
		.map(id => ({
			id,
			label: NEURO_ELECTROPHYS_FAMILY_META[id].label,
			shortLabel: NEURO_ELECTROPHYS_FAMILY_META[id].shortLabel,
			clustersCount: familyCounts[id] || 0,
		}))

	return {
		schema: NEURO_ELECTROPHYS_VAULT_SCHEMA,
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
			totalBidsMontageClusters,
			totalRawElectrophysMasterClusters,
			totalIrbHoldClusters,
			totalRedundantDerivativeClusters,
			totalDaqScratchClusters,
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
 * Build a safe POSIX DRY_RUN=1 remediation script for Neuroscience & Electrophysiology Vaults.
 * Strictly blocks deletion or hardlinking of shielded BIDS sidecars/montages, IRB Holds,
 * and verified Raw NWB/EDF/FIF/NS5 masters, and never hardlinks mutable files or scratch.
 *
 * @param {object} auditResult Result from auditNeuroscienceElectrophysVault.
 * @return {string} POSIX bash script.
 */
export function buildNeuroscienceElectrophysRemediationScript(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# Neuroscience, Electrophysiology & BIDS Vault Auditor',
		'# Safe POSIX Remediation Script (default DRY_RUN=1)',
		'# Run with DRY_RUN=0 ./neuroscience-electrophys-vault-reclaim.sh only after verifying Raw NWB/EDF/FIF/ABF/NS5 anchors.',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'QUARANTINE_DIR="$' + '{QUARANTINE_DIR:-./.neuro-electrophys-scratch-quarantine}"',
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
	const strategy = auditResult?.config?.strategy || 'prune-derivatives-and-daq-scratch'
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
			} else if (strategy === 'quarantine-derivatives-and-daq-scratch' && (target.isRedundantNeuroDerivative || target.isScratchPath)) {
				lines.push('run_cmd mkdir -p "$QUARANTINE_DIR"')
				lines.push(`run_cmd mv -n ${quotePosixPath(target.normalized)} "$QUARANTINE_DIR/"`)
			} else {
				lines.push(`run_cmd rm -f ${quotePosixPath(target.normalized)}`)
			}
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('printf "No reclaimable derivatives or DAQ scratch under active Neuroscience & BIDS shields.\\n"')
	} else {
		lines.push(`printf "Completed Neuroscience & Electrophysiology Vault remediation plan (%d target actions, DRY_RUN=%s).\\n" "${actionCount}" "$DRY_RUN"`)
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe RFC-4180 CSV audit report.
 *
 * @param {object} auditResult Result from auditNeuroscienceElectrophysVault.
 * @return {string} RFC-4180 CSV string.
 */
export function buildNeuroscienceElectrophysCsvReport(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const headers = [
		'cluster_id',
		'cluster_name',
		'neuro_toolchain',
		'workflow_stage',
		'recording_stem',
		'neuro_anchor_key',
		'family',
		'cluster_verdict',
		'has_neuro_master_anchor',
		'is_redundant_neuro_derivative',
		'is_daq_scratch',
		'member_path',
		'artifact_kind',
		'vault_role',
		'neuro_tag',
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
				cluster.neuroToolchain || '',
				cluster.workflowStage || '',
				cluster.recordingStem,
				cluster.neuroAnchorKey,
				cluster.family,
				cluster.clusterVerdict,
				cluster.hasNeuroMasterAnchor ? 'true' : 'false',
				member.isRedundantNeuroDerivativeMember ? 'true' : 'false',
				member.isScratchPath ? 'true' : 'false',
				member.normalized,
				member.artifactKind,
				member.vaultRole,
				member.neuroTag || '',
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
 * @param {object} auditResult Result from auditNeuroscienceElectrophysVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildNeuroscienceElectrophysJsonManifest(auditResult) {
	const payload = {
		schema: NEURO_ELECTROPHYS_VAULT_SCHEMA,
		generatedAt: new Date().toISOString(),
		config: auditResult?.config || NEURO_ELECTROPHYS_DEFAULT_CONFIG,
		summary: auditResult?.summary || {},
		clusters: (auditResult?.clusters || []).map(cluster => ({
			id: cluster.id,
			name: cluster.name,
			neuroToolchain: cluster.neuroToolchain,
			workflowStage: cluster.workflowStage,
			recordingStem: cluster.recordingStem,
			neuroAnchorKey: cluster.neuroAnchorKey,
			family: cluster.family,
			clusterVerdict: cluster.clusterVerdict,
			unitBytes: cluster.unitBytes,
			totalBytes: cluster.totalBytes,
			reclaimableBytes: cluster.reclaimableBytes,
			survivorPath: cluster.survivorPath,
			hasProtectedBidsMontage: cluster.hasProtectedBidsMontage,
			hasProtectedRawElectrophysMaster: cluster.hasProtectedRawElectrophysMaster,
			hasProtectedIrbHold: cluster.hasProtectedIrbHold,
			hasRedundantNeuroDerivative: cluster.hasRedundantNeuroDerivative,
			hasDaqScratchIntermediate: cluster.hasDaqScratchIntermediate,
			hasNeuroMasterAnchor: cluster.hasNeuroMasterAnchor,
			neuroTags: cluster.neuroTags,
			members: (cluster.members || []).map(member => ({
				path: member.normalized,
				artifactKind: member.artifactKind,
				vaultRole: member.vaultRole,
				neuroTag: member.neuroTag || '',
				governanceTier: member.governanceTier,
				action: member.action,
				shielded: member.shielded,
				protectedReason: member.protectedReason,
				isRedundantNeuroDerivativeMember: member.isRedundantNeuroDerivativeMember,
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
 * cloud sync of Kilosort, Phy, MNE, EEGLAB, FieldTrip, Open Ephys, and LSL scratch directories.
 *
 * @return {string} Line-delimited .sync-exclude.lst rules.
 */
export function buildNeuroscienceElectrophysSyncExcludeList() {
	return [
		'# Nextcloud / rsync exclusion rules for Neuroscience & Electrophysiology Vaults',
		'kilosort_tmp/',
		'kilosort_cache/',
		'phy_cache/',
		'phy_tmp/',
		'mne_cache/',
		'mne_tmp/',
		'eeglab_tmp/',
		'fieldtrip_tmp/',
		'openephys_tmp/',
		'lsl_scratch/',
		'spike_tmp/',
		'whiten_tmp/',
		'daq_scratch/',
		'recording_staging/',
		'temp_wh.dat',
		'whiten_temp.dat',
		'rez.mat.tmp',
		'tmp_kilosort_*',
		'tmp_phy_*',
		'tmp_mne_*',
		'tmp_eeglab_*',
		'tmp_nwb_*',
		'tmp_edf_*',
		'tmp_lsl_*',
		'*.nwb.tmp',
		'*.edf.tmp',
		'*.bdf.tmp',
		'*.fif.tmp',
		'*.abf.tmp',
		'*.ns5.tmp',
		'*.xdf.tmp',
		'*.vhdr.tmp',
		'*.rhd.tmp',
		'*.lck',
		'*.lock',
		'*.tmp',
	].join('\n')
}
