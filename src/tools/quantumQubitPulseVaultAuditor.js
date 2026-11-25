/**
 * Pure Quantum Computing, Cryogenic Qubit & Pulse-Control Vault Auditor.
 * Classifies and audits duplicate clusters across 4 Quantum & Cryogenic QPU Vault families:
 * - Cryogenic Telemetry, Qubit Calibration & QPU Holds (.cryo, .bflog, .fridge, .qcalib, .qmap, .wiremap, .qcodes, .sqlite, .db, .json, .yaml, .toml in cryo/calib/hold context)
 * - Quantum Circuit, Pulse-Control & Readout Shot Masters (.qasm, .qasm3, .quil, .qir, .qpy, .stim, .dem, .b8, .seqc, .qua, .qobj, plus .h5, .hdf5, .nc, .npz, .zarr in QPU/pulse/shot context)
 * - Redundant Bloch, Tomography & Rabi/Ramsey Exports (.csv, .tsv, .txt, .dat, .parquet, .feather, .xlsx, .png, .pdf, .svg, .eps in quantum export context)
 * - Aer, Cirq, Transpiler & Pulse-Compiler Scratch (qiskit_cache/, aer_tmp/, cirq_tmp/, qutip_scratch/, cuquantum_tmp/, laboneq_cache/, qblox_tmp/, opx_staging/, pulse_cache/, transpile_tmp/, .qpy.tmp, .h5.lock, .stim.tmp, .seqc.tmp, .npz.part, .lck)
 *
 * Enforces strict QPU Benchmark Hold, Cryo/Calibration Baseline, and Circuit/Pulse Master conservation defaults:
 * - Strictly conserves QEC, NIST benchmark, calibration-freeze, and dilution-fridge hardware holds
 * - Strictly conserves Bluefors/Oxford cryo telemetry, T1/T2/crosstalk calibration matrices, and LabOneQ/QCoDeS/Qblox wiring maps
 * - Strictly conserves verified OpenQASM 2/3, Quil, QIR, QPY, Stim syndrome, SeqC/QUA pulse sequences, and single-shot IQ HDF5/Zarr masters
 * - Detects redundant Bloch/tomography/Rabi tables and plots when a verified QASM, Pulse, QPY, or Calibration anchor exists
 * - Blocks pruning of derived tomography/plot exports lacking a verified Quantum master anchor when guard is active
 * - Blocks hardlinks on mutable QASM, Quil, Stim, SeqC, QUA, calibration, CSV, Parquet, and simulator scratch files
 *
 * Generates DRY_RUN=1 POSIX remediation scripts, CWE-1236-safe CSV reports, JSON audit
 * manifests, and .sync-exclude.lst rules. Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const QUANTUM_QUBIT_PULSE_VAULT_SCHEMA = 'duplicatefinder.quantum-qubit-pulse-vault-auditor.v1'

export const QUANTUM_QUBIT_PULSE_FAMILIES = Object.freeze([
	'all',
	'quantum-calib-cryo-holds',
	'quantum-circuit-pulse-masters',
	'redundant-quantum-bloch-exports',
	'quantum-sim-transpile-scratch',
])

export const QUANTUM_QUBIT_PULSE_FAMILY_META = Object.freeze({
	'quantum-calib-cryo-holds': {
		id: 'quantum-calib-cryo-holds',
		label: 'Cryo, Calib & QPU Holds',
		shortLabel: 'Dilution Cryo Logs, T1/T2 Calibrations, Wiring Maps & QPU Holds (.cryo, .bflog, .qcalib, .qmap, .qcodes)',
	},
	'quantum-circuit-pulse-masters': {
		id: 'quantum-circuit-pulse-masters',
		label: 'QASM, Pulse & Shot Masters',
		shortLabel: 'Verified Circuit, Pulse & Readout Masters (.qasm, .qasm3, .quil, .qpy, .stim, .seqc, .qua, .h5, .zarr)',
	},
	'redundant-quantum-bloch-exports': {
		id: 'redundant-quantum-bloch-exports',
		label: 'Redundant Bloch & Tomography',
		shortLabel: 'Derived Tomography, Rabi/Ramsey & Bloch Exports (.csv, .parquet, .xlsx, .png, .pdf, .svg)',
	},
	'quantum-sim-transpile-scratch': {
		id: 'quantum-sim-transpile-scratch',
		label: 'Aer, Transpiler & Pulse Scratch',
		shortLabel: 'Simulator & Compiler Scratch (qiskit_cache/, aer_tmp/, laboneq_cache/, pulse_cache/, transpile_tmp/, .qpy.tmp)',
	},
})

export const QUANTUM_QUBIT_PULSE_STRATEGIES = Object.freeze([
	'prune-exports-and-pulse-scratch',
	'hardlink-immutable-qpy-and-hdf5',
	'quarantine-exports-and-pulse-scratch',
])

export const QUANTUM_QUBIT_PULSE_SURVIVOR_RULES = Object.freeze([
	'quantum-calib-qasm-first',
	'oldest-cryo-run-first',
	'newest-transpile-first',
	'shortest-path',
])

export const QUANTUM_QUBIT_PULSE_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'quantum-calib-cryo-protected',
	'qasm-pulse-master-protected',
	'qpu-benchmark-hold-protected',
	'quantum-export-redundant',
	'sim-transpile-scratch',
	'shielded',
])

export const QUANTUM_QUBIT_PULSE_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const QUANTUM_QUBIT_PULSE_PRESETS = Object.freeze([
	{
		id: 'all-quantum-qubit-pulse-audit',
		name: 'All Quantum & Cryo Vaults',
		description: 'Audit cryogenic fridge logs, qubit T1/T2 calibration baselines, QPU benchmark holds, QASM/Pulse/Shot masters, redundant Bloch/tomography exports, and Aer/transpiler scratch.',
		familyFilter: 'all',
		strategy: 'prune-exports-and-pulse-scratch',
		survivorRule: 'quantum-calib-qasm-first',
		protectCryoAndCalibration: true,
		protectCircuitAndPulseMasters: true,
		protectQpuBenchmarkHolds: true,
		requireQuantumAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'aer-transpiler-scratch-cleanup',
		name: 'Aer, Transpiler & Pulse Scratch',
		description: 'Reclaim qiskit_cache/, aer_tmp/, laboneq_cache/, qblox_tmp/, pulse_cache/, transpile_tmp/, and .qpy.tmp/.npz.part scratch older than the active cooldown window.',
		familyFilter: 'all',
		strategy: 'prune-exports-and-pulse-scratch',
		survivorRule: 'quantum-calib-qasm-first',
		protectCryoAndCalibration: true,
		protectCircuitAndPulseMasters: true,
		protectQpuBenchmarkHolds: true,
		requireQuantumAnchorForPrune: true,
		keepRecentRunDays: 14,
		minSizeKb: 0,
	},
	{
		id: 'redundant-bloch-vs-qasm-qpy',
		name: 'Redundant Exports vs QASM/QPY',
		description: 'Detect derived tomography CSV/Parquet tables and Bloch/Rabi/Ramsey quicklook plots backed by a verified QASM, QPY, Stim, SeqC, or QUA master anchor.',
		familyFilter: 'redundant-quantum-bloch-exports',
		strategy: 'quarantine-exports-and-pulse-scratch',
		survivorRule: 'quantum-calib-qasm-first',
		protectCryoAndCalibration: true,
		protectCircuitAndPulseMasters: true,
		protectQpuBenchmarkHolds: true,
		requireQuantumAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'cryo-calib-qpu-hold-shield',
		name: 'Cryo, Calib & QPU Holds Shield',
		description: 'Inspect dilution-fridge cryo logs, QCoDeS/LabOneQ calibration matrices, wiring maps, and QPU benchmark holds under strict conservation shield.',
		familyFilter: 'quantum-calib-cryo-holds',
		strategy: 'hardlink-immutable-qpy-and-hdf5',
		survivorRule: 'quantum-calib-qasm-first',
		protectCryoAndCalibration: true,
		protectCircuitAndPulseMasters: true,
		protectQpuBenchmarkHolds: true,
		requireQuantumAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'raw-qasm-pulse-shot-masters',
		name: 'QASM, Pulse & Shot Masters',
		description: 'Audit verified OpenQASM 2/3 circuits, Qiskit QPY, Stim QEC syndromes, Zurich SeqC / QUA pulse sequences, and raw IQ readout HDF5/Zarr masters.',
		familyFilter: 'quantum-circuit-pulse-masters',
		strategy: 'hardlink-immutable-qpy-and-hdf5',
		survivorRule: 'quantum-calib-qasm-first',
		protectCryoAndCalibration: true,
		protectCircuitAndPulseMasters: true,
		protectQpuBenchmarkHolds: true,
		requireQuantumAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
])

export const QUANTUM_QUBIT_PULSE_DEFAULT_CONFIG = Object.freeze({
	presetId: 'all-quantum-qubit-pulse-audit',
	familyFilter: 'all',
	verdictFilter: 'all',
	strategy: 'prune-exports-and-pulse-scratch',
	survivorRule: 'quantum-calib-qasm-first',
	sortMode: 'reclaim_desc',
	searchQuery: '',
	protectCryoAndCalibration: true,
	protectCircuitAndPulseMasters: true,
	protectQpuBenchmarkHolds: true,
	requireQuantumAnchorForPrune: true,
	keepRecentRunDays: 0,
	minSizeKb: 0,
})

const STRICT_QUANTUM_CALIB_EXT_RE = /\.(?:cryo|bflog|fridge|qcalib|qmap|wiremap|qcodes)$/i
const CONTEXT_QUANTUM_CALIB_EXT_RE = /\.(?:sqlite|sqlite3|db|json|yaml|yml|toml)$/i
const STRICT_QUANTUM_MASTER_EXT_RE = /\.(?:qasm|qasm3|quil|qir|qpy|stim|dem|b8|seqc|qua|qobj)$/i
const CONTEXT_QUANTUM_SHOT_EXT_RE = /\.(?:h5|hdf5|nc|npz|zarr)$/i
const CONTEXT_QUANTUM_EXPORT_EXT_RE = /\.(?:csv|tsv|txt|dat|parquet|feather|xlsx|png|pdf|svg|eps)$/i
const STRICT_QUANTUM_SCRATCH_EXT_RE = /\.(?:qpy\.tmp|qasm\.tmp|stim\.tmp|seqc\.tmp|qua\.tmp|h5\.lock|h5\.tmp|npz\.part|npz\.tmp|zarr\.lock|lck)$/i
const GENERIC_SCRATCH_EXT_RE = /\.(?:tmp|bak|lock|dmp|part|idx|log)$/i

const NON_QUANTUM_EXCLUSION_RE = /(?:geant4|cmssw|cern|synchrotron|beamline|gdml|epics|orbital|cadu|ccsds|neuro|electrophys|bids|dicom|nifti|hydrograph|multibeam|seismic|segy|photoshop|lightroom|premiere|davinci)/i
const QUANTUM_CONTEXT_HINT_RE = /(?:quantum|qubit|qpu|cryo|cryostat|dilution_?fridge|bluefors|oxford_?cryo|transmon|fluxonium|rydberg|ion_?trap|spin_?qubit|josephson|openqasm|qiskit|cirq|pennylane|qutip|cuquantum|laboneq|qcodes|qblox|zurich_?instruments|pulse_?ctrl|awg_?pulse|seqc|qec|surface_?code|syndrome|rabi|ramsey|tomography|bloch|iq_?demod|readout_?shot|t1_?t2|braket)/i
const QUANTUM_HOLD_PATH_RE = /(?:qpu_?hold|cryo_?hold|fridge_?hold|calib_?freeze|calibration_?freeze|qec_?hold|benchmark_?hold|nist_?hold|hardware_?hold|entanglement_?hold|cooldown_?hold)/i
const QUANTUM_CALIB_BASELINE_PATH_RE = /(?:00_cryo|00_calib|00_qcalib|00_wiring|00_fridge|cryo_logs|bluefors_logs|qcodes_db|calib_matrices|hamiltonian_calib|wiring_maps|t1_t2_baselines)/i
const QUANTUM_SCRATCH_PATH_RE = /(?:qiskit_cache|aer_tmp|aer_cache|cirq_tmp|qutip_scratch|cuquantum_tmp|laboneq_cache|qblox_tmp|opx_staging|pulse_cache|transpile_tmp|qec_decode_tmp|shot_buffer_tmp|cryo_tmp|sim_scratch)/i
const QUANTUM_INTERMEDIATE_PREFIX_RE = /^(?:tmp_qasm_|tmp_qpy_|tmp_pulse_|tmp_iq_|tmp_aer_|tmp_stim_|tmp_seqc_|tmp_qua_|cache_shot_|spill_iq_)/i
const QUANTUM_INTERMEDIATE_SUFFIX_RE = /(?:_aer_tmp|_transpile_tmp|_pulse_tmp|_iq_tmp|_qpy_tmp|_stim_tmp|_staging)$/i
const QUANTUM_EXPORT_PATH_RE = /(?:bloch_plots|tomography_exports|rabi_plots|ramsey_exports|qec_reports|shot_summaries|chevron_plots|rb_exports|_bloch|_tomography|_rabi|_ramsey|_rb_plot|_shot_csv)/i
const CANONICAL_QUANTUM_VAULT_PATH_RE = /(?:00_raw|00_qasm|00_qpy|00_pulse|00_shots|00_stim|00_qpu_masters|canonical|qpu_archive|cryo_archive)/i

/**
 * Normalize configuration values for Quantum Computing, Cryogenic Qubit & Pulse-Control Vault auditing.
 *
 * @param {object} [rawConfig] Raw user configuration.
 * @return {object} Normalized configuration.
 */
export function normalizeQuantumQubitPulseConfig(rawConfig = {}) {
	const cfg = rawConfig && typeof rawConfig === 'object' ? rawConfig : {}
	const familyFilter = QUANTUM_QUBIT_PULSE_FAMILIES.includes(cfg.familyFilter)
		? cfg.familyFilter
		: QUANTUM_QUBIT_PULSE_DEFAULT_CONFIG.familyFilter
	const verdictFilter = QUANTUM_QUBIT_PULSE_VERDICT_FILTERS.includes(cfg.verdictFilter)
		? cfg.verdictFilter
		: QUANTUM_QUBIT_PULSE_DEFAULT_CONFIG.verdictFilter
	const strategy = QUANTUM_QUBIT_PULSE_STRATEGIES.includes(cfg.strategy)
		? cfg.strategy
		: QUANTUM_QUBIT_PULSE_DEFAULT_CONFIG.strategy
	const survivorRule = QUANTUM_QUBIT_PULSE_SURVIVOR_RULES.includes(cfg.survivorRule)
		? cfg.survivorRule
		: QUANTUM_QUBIT_PULSE_DEFAULT_CONFIG.survivorRule
	const sortMode = QUANTUM_QUBIT_PULSE_SORT_MODES.includes(cfg.sortMode)
		? cfg.sortMode
		: QUANTUM_QUBIT_PULSE_DEFAULT_CONFIG.sortMode

	const keepRecentParsed = Number(cfg.keepRecentRunDays)
	const keepRecentRunDays = Number.isFinite(keepRecentParsed) && keepRecentParsed >= 0
		? Math.floor(keepRecentParsed)
		: QUANTUM_QUBIT_PULSE_DEFAULT_CONFIG.keepRecentRunDays

	const minSizeParsed = Number(cfg.minSizeKb)
	const minSizeKb = Number.isFinite(minSizeParsed) && minSizeParsed > 0
		? minSizeParsed
		: 0

	return {
		presetId: typeof cfg.presetId === 'string' && cfg.presetId ? cfg.presetId : QUANTUM_QUBIT_PULSE_DEFAULT_CONFIG.presetId,
		familyFilter,
		verdictFilter,
		strategy,
		survivorRule,
		sortMode,
		searchQuery: typeof cfg.searchQuery === 'string' ? cfg.searchQuery.trim() : '',
		protectCryoAndCalibration: cfg.protectCryoAndCalibration !== undefined ? Boolean(cfg.protectCryoAndCalibration) : true,
		protectCircuitAndPulseMasters: cfg.protectCircuitAndPulseMasters !== undefined ? Boolean(cfg.protectCircuitAndPulseMasters) : true,
		protectQpuBenchmarkHolds: cfg.protectQpuBenchmarkHolds !== undefined ? Boolean(cfg.protectQpuBenchmarkHolds) : true,
		requireQuantumAnchorForPrune: cfg.requireQuantumAnchorForPrune !== undefined ? Boolean(cfg.requireQuantumAnchorForPrune) : true,
		keepRecentRunDays,
		minSizeKb,
		memberOverrides: cfg.memberOverrides && typeof cfg.memberOverrides === 'object' ? { ...cfg.memberOverrides } : {},
	}
}

/**
 * Extract normalized QPU experiment or pulse run stem by stripping extensions and export suffixes.
 *
 * @param {string} basename Filename without directory.
 * @param {string} [normalized] Full normalized path.
 * @return {string} Normalized QPU/experiment stem.
 */
export function extractQuantumQubitPulseStem(basename, normalized = '') {
	let stem = String(basename || normalized || '').trim().toLowerCase()
	stem = stem.replace(/\.(?:qpy\.tmp|qasm\.tmp|stim\.tmp|seqc\.tmp|qua\.tmp|h5\.lock|h5\.tmp|npz\.part|npz\.tmp|zarr\.lock)$/i, '')
	stem = stem.replace(/\.[a-z0-9]{1,8}$/i, '')
	stem = stem.replace(QUANTUM_INTERMEDIATE_PREFIX_RE, '')
	stem = stem.replace(QUANTUM_INTERMEDIATE_SUFFIX_RE, '')
	stem = stem.replace(/(?:[-_](?:bloch|tomography|rabi|ramsey|chevron|rb|plot|quicklook|summary|export|csv|parquet|report|preview|copy|bak|draft|v\d+|rev\d+))+$/i, '')
	return stem || 'qpu-run'
}

/**
 * Extract canonical anchor key linking derived Bloch/tomography/Rabi exports to QASM/Pulse/QPY masters.
 *
 * @param {string} runStem Extracted QPU run stem.
 * @return {string} Canonical anchor key.
 */
export function extractQuantumQubitPulseAnchorKey(runStem) {
	return String(runStem || 'qpu-run')
		.toLowerCase()
		.replace(/(?:[-_](?:qasm|qasm3|quil|qir|qpy|stim|dem|b8|seqc|qua|qobj|h5|hdf5|nc|npz|zarr|cryo|bflog|qcalib|qmap|bloch|tomography|rabi|ramsey|plot|export))$/i, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '') || 'qpu-run'
}

/**
 * Detect Quantum Computing, Cryogenic & Pulse-Control toolchain and workflow stage from path and filename.
 *
 * @param {string} normalized Normalized path.
 * @param {string} basename Filename.
 * @return {{ quantumToolchain: string, workflowStage: string }} Detected toolchain and stage.
 */
function extractQuantumToolchainAndStage(normalized, basename) {
	const text = `${normalized} ${basename}`.toLowerCase()
	let quantumToolchain = ''
	if (/\.(?:cryo|bflog|fridge)\b|bluefors|oxford_?cryo|dilution_?fridge/.test(text)) {
		quantumToolchain = 'Bluefors / Dilution Cryostat'
	} else if (/\.(?:qcalib|qmap|wiremap|qcodes)\b|qcodes|hamiltonian|t1_?t2/.test(text)) {
		quantumToolchain = 'QCoDeS / QPU Calibration DB'
	} else if (/\.(?:seqc)\b|laboneq|zurich_?instruments/.test(text)) {
		quantumToolchain = 'Zurich Instruments LabOneQ / SeqC'
	} else if (/\.(?:qua)\b|qblox|quantum_?opx|opx_?staging/.test(text)) {
		quantumToolchain = 'QUA / Qblox Pulse Control'
	} else if (/\.(?:qasm|qasm3|qpy|qobj)\b|qiskit|openqasm|aer_tmp/.test(text)) {
		quantumToolchain = 'OpenQASM / Qiskit / Aer'
	} else if (/\.(?:stim|dem|b8)\b|surface_?code|syndrome|qec/.test(text)) {
		quantumToolchain = 'Stim / QEC Syndrome Decoder'
	} else if (/\.(?:quil|qir)\b|cirq|pennylane|qutip|cuquantum/.test(text)) {
		quantumToolchain = 'Quil / QIR / Cirq / cuQuantum'
	} else if (/iq_?demod|readout_?shot|\.(?:zarr|npz|h5|hdf5|nc)\b/.test(text)) {
		quantumToolchain = 'Single-Shot IQ Readout Vault'
	}

	let workflowStage = ''
	if (QUANTUM_HOLD_PATH_RE.test(text)) {
		workflowStage = 'QPU Benchmark / Cryo / Calibration Hold'
	} else if (STRICT_QUANTUM_CALIB_EXT_RE.test(basename) || QUANTUM_CALIB_BASELINE_PATH_RE.test(text)) {
		workflowStage = 'Cryogenic Telemetry & Qubit Calibration'
	} else if (QUANTUM_SCRATCH_PATH_RE.test(text) || STRICT_QUANTUM_SCRATCH_EXT_RE.test(basename) || QUANTUM_INTERMEDIATE_PREFIX_RE.test(basename) || QUANTUM_INTERMEDIATE_SUFFIX_RE.test(basename)) {
		workflowStage = 'Aer / Transpiler / Pulse Compiler Scratch'
	} else if (QUANTUM_EXPORT_PATH_RE.test(text) || (CONTEXT_QUANTUM_EXPORT_EXT_RE.test(basename) && QUANTUM_CONTEXT_HINT_RE.test(text))) {
		workflowStage = 'Derived Bloch / Tomography / Rabi Export'
	} else if (STRICT_QUANTUM_MASTER_EXT_RE.test(basename) || (CONTEXT_QUANTUM_SHOT_EXT_RE.test(basename) && QUANTUM_CONTEXT_HINT_RE.test(text))) {
		workflowStage = 'Verified Circuit, Pulse or IQ Shot Master'
	}

	return { quantumToolchain, workflowStage }
}

/**
 * Extract concise Quantum Computing & Cryo domain tag badge when present.
 *
 * @param {string} lowerBase Lowercase filename.
 * @param {string} lowerPath Lowercase full path.
 * @return {string} Short tag or empty string.
 */
function extractQuantumDomainTag(lowerBase, lowerPath) {
	const text = `${lowerPath} ${lowerBase}`
	if (QUANTUM_HOLD_PATH_RE.test(text)) {
		return 'QPU / BENCHMARK HOLD'
	}
	if (/\.(?:cryo|bflog|fridge)\b/.test(lowerBase)) {
		return 'CRYO FRIDGE LOG'
	}
	if (/\.(?:qcalib|qmap|wiremap|qcodes)\b/.test(lowerBase)) {
		return 'QUBIT CALIBRATION'
	}
	if (/\.(?:qasm|qasm3|quil|qir)\b/.test(lowerBase)) {
		return 'OPENQASM / QIR'
	}
	if (/\.qpy\b/.test(lowerBase)) {
		return 'QISKIT QPY MASTER'
	}
	if (/\.(?:stim|dem|b8)\b/.test(lowerBase)) {
		return 'STIM QEC MASTER'
	}
	if (/\.(?:seqc|qua)\b/.test(lowerBase)) {
		return 'AWG PULSE MASTER'
	}
	if (/\.(?:h5|hdf5|nc|npz|zarr)\b/.test(lowerBase) && QUANTUM_CONTEXT_HINT_RE.test(text)) {
		return 'IQ SHOT MASTER'
	}
	if (STRICT_QUANTUM_SCRATCH_EXT_RE.test(lowerBase)) {
		return 'SIM / PULSE SCRATCH'
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
 * Classify a single file within the Quantum Computing, Cryogenic Qubit & Pulse-Control domain.
 *
 * @param {object} file Duplicate file object.
 * @param {number} [referenceNowMs] Reference current timestamp in ms.
 * @return {object} Classification metadata (family === null if non-domain file).
 */
export function classifyQuantumQubitPulseFile(file, referenceNowMs = Date.now()) {
	const rawPath = String(file?.path || file?.name || '')
	const normalized = normalizePathForDiff(rawPath)
	const lower = normalized.toLowerCase()
	const slashIdx = normalized.lastIndexOf('/')
	const basename = slashIdx >= 0 ? normalized.slice(slashIdx + 1) : normalized
	const dirname = slashIdx >= 0 ? normalized.slice(0, slashIdx) : ''
	const lowerBase = basename.toLowerCase()
	const size = Math.max(0, Number(file?.size) || 0)
	const { mtimeMs, ageDays, formattedMtime } = parseFileTime(file, referenceNowMs)

	const hasExcludedContext = NON_QUANTUM_EXCLUSION_RE.test(lower)
	const hasQuantumContext = !hasExcludedContext && QUANTUM_CONTEXT_HINT_RE.test(lower)
	const isCalibBaselinePath = !hasExcludedContext && QUANTUM_CALIB_BASELINE_PATH_RE.test(lower)
	const isBenchmarkHoldPath = !hasExcludedContext && QUANTUM_HOLD_PATH_RE.test(lower)
	const isCanonicalVaultPath = !hasExcludedContext && CANONICAL_QUANTUM_VAULT_PATH_RE.test(lower)
	const isScratchPath = !hasExcludedContext && QUANTUM_SCRATCH_PATH_RE.test(lower)
	const isQuantumExportPath = !hasExcludedContext && QUANTUM_EXPORT_PATH_RE.test(lower)

	const isStrictScratchExt = !hasExcludedContext && STRICT_QUANTUM_SCRATCH_EXT_RE.test(lowerBase)
	const isGenericScratchExt = GENERIC_SCRATCH_EXT_RE.test(lowerBase)
	const isIntermediateSubfile = !hasExcludedContext && (QUANTUM_INTERMEDIATE_PREFIX_RE.test(lowerBase) || QUANTUM_INTERMEDIATE_SUFFIX_RE.test(lowerBase))

	const isCryoOrCalibration = !hasExcludedContext && (
		STRICT_QUANTUM_CALIB_EXT_RE.test(lowerBase)
		|| (CONTEXT_QUANTUM_CALIB_EXT_RE.test(lowerBase) && (hasQuantumContext || isCalibBaselinePath || isBenchmarkHoldPath))
	)

	const isQuantumShotMaster = CONTEXT_QUANTUM_SHOT_EXT_RE.test(lowerBase)
		&& !hasExcludedContext
		&& (hasQuantumContext || isCanonicalVaultPath)
	const isStrictCircuitOrPulseMaster = !hasExcludedContext && (
		STRICT_QUANTUM_MASTER_EXT_RE.test(lowerBase)
		|| isQuantumShotMaster
	)

	const isContextExport = !hasExcludedContext
		&& !isStrictCircuitOrPulseMaster
		&& !isCryoOrCalibration
		&& CONTEXT_QUANTUM_EXPORT_EXT_RE.test(lowerBase)
		&& (hasQuantumContext || isQuantumExportPath)

	let family = null
	let artifactKind = 'Unknown'
	let vaultRole = 'Outside Quantum & Cryogenic QPU Vault'
	let isProtectedCryoCalibration = false
	let isProtectedCircuitPulseMaster = false
	let isProtectedQpuBenchmarkHold = false
	let isQuantumMasterAnchor = false
	let isRedundantQuantumExport = false
	let isMutableFile = false

	if (
		isStrictScratchExt
		|| (isScratchPath && (isGenericScratchExt || isContextExport || isStrictCircuitOrPulseMaster || isCryoOrCalibration))
		|| (isIntermediateSubfile && (isStrictCircuitOrPulseMaster || isContextExport || hasQuantumContext))
		|| (isGenericScratchExt && hasQuantumContext && !isCalibBaselinePath && !isBenchmarkHoldPath)
	) {
		family = 'quantum-sim-transpile-scratch'
		artifactKind = isStrictScratchExt
			? 'QPY / Stim / SeqC / IQ Staging Scratch'
			: (isIntermediateSubfile ? 'Aer / Transpiler Intermediate Cache' : 'LabOneQ / Qblox / cuQuantum Scratch')
		vaultRole = 'Aer, Cirq, LabOneQ, Qblox or Pulse-Compiler Scratch'
		isMutableFile = true
	} else if (isBenchmarkHoldPath && (isCryoOrCalibration || isStrictCircuitOrPulseMaster || isContextExport || hasQuantumContext)) {
		family = 'quantum-calib-cryo-holds'
		artifactKind = 'QPU Benchmark / Cryo / Calibration Hold'
		vaultRole = 'Protected QPU Hardware & Benchmark Hold'
		isProtectedQpuBenchmarkHold = true
		isProtectedCryoCalibration = true
		isQuantumMasterAnchor = isStrictCircuitOrPulseMaster || isCryoOrCalibration
		isMutableFile = /\.(?:cryo|bflog|fridge|qcalib|qmap|wiremap|qcodes|sqlite|sqlite3|db|json|yaml|yml|toml|csv|tsv|txt|log)$/i.test(lowerBase) || isCryoOrCalibration
	} else if (isCryoOrCalibration) {
		family = 'quantum-calib-cryo-holds'
		if (/\.(?:cryo|bflog|fridge)$/i.test(lowerBase)) {
			artifactKind = 'Dilution Refrigerator Cryo Telemetry Log'
			vaultRole = 'Canonical Mixing-Chamber & Cooldown Log'
		} else if (/\.(?:qmap|wiremap)$/i.test(lowerBase)) {
			artifactKind = 'QPU Coupler & Cryo Wiring Map'
			vaultRole = 'Canonical Attenuator, Feedline & Qubit Map'
		} else {
			artifactKind = 'Qubit Hamiltonian / T1-T2 Calibration DB'
			vaultRole = 'Canonical QCoDeS, LabOneQ or QPU Calibration Baseline'
		}
		isProtectedCryoCalibration = true
		isQuantumMasterAnchor = true
		isMutableFile = true
	} else if (isStrictCircuitOrPulseMaster) {
		family = 'quantum-circuit-pulse-masters'
		if (/\.(?:qasm|qasm3|quil)$/i.test(lowerBase)) {
			artifactKind = 'OpenQASM / Quil Quantum Circuit Master'
			vaultRole = 'Canonical Gate-Level Circuit Specification'
		} else if (/\.qpy$/i.test(lowerBase)) {
			artifactKind = 'Qiskit QPY Binary Circuit Master'
			vaultRole = 'Immutable Parameterized Circuit & Schedule Archive'
		} else if (/\.qir$/i.test(lowerBase)) {
			artifactKind = 'QIR LLVM Quantum Bitcode Master'
			vaultRole = 'Immutable Quantum Intermediate Representation'
		} else if (/\.(?:stim|dem|b8)$/i.test(lowerBase)) {
			artifactKind = 'Stim QEC Circuit / Syndrome Shot Master'
			vaultRole = 'Canonical Quantum Error Correction Dataset'
		} else if (/\.(?:seqc|qua)$/i.test(lowerBase)) {
			artifactKind = 'Zurich SeqC / QUA Pulse Sequence Master'
			vaultRole = 'Canonical AWG & OPX Microwave Pulse Program'
		} else if (isQuantumShotMaster) {
			artifactKind = 'Single-Shot IQ Readout HDF5 / Zarr Master'
			vaultRole = 'Unaltered Qubit State Readout Shot Dataset'
		} else {
			artifactKind = 'QObj Pulse & Circuit Payload Master'
			vaultRole = 'Canonical Quantum Execution Payload'
		}
		isProtectedCircuitPulseMaster = true
		isQuantumMasterAnchor = true
		isMutableFile = /\.(?:qasm|qasm3|quil|stim|dem|seqc|qua|qobj|json|yaml)$/i.test(lowerBase)
	} else if (isContextExport) {
		family = 'redundant-quantum-bloch-exports'
		if (/\.(?:csv|tsv|txt|dat|parquet|feather|xlsx)$/i.test(lowerBase)) {
			artifactKind = 'Derived Tomography / Shot Summary Table'
		} else {
			artifactKind = 'Bloch Sphere / Rabi / Ramsey Quicklook Plot'
		}
		vaultRole = 'Derived Quantum Tomography Table or Plot Export'
		isRedundantQuantumExport = true
		isMutableFile = true
	}

	const { quantumToolchain, workflowStage } = extractQuantumToolchainAndStage(normalized, basename)
	const runStem = extractQuantumQubitPulseStem(basename, normalized)
	const quantumAnchorKey = extractQuantumQubitPulseAnchorKey(runStem)
	const quantumTag = extractQuantumDomainTag(lowerBase, lower)

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
		quantumToolchain,
		workflowStage,
		runStem,
		quantumAnchorKey,
		quantumTag,
		isProtectedCryoCalibration,
		isProtectedCircuitPulseMaster,
		isProtectedQpuBenchmarkHold,
		isQuantumMasterAnchor,
		isRedundantQuantumExport,
		isMutableFile,
		isScratchPath: isScratchPath || isStrictScratchExt || (isIntermediateSubfile && family === 'quantum-sim-transpile-scratch') || (isGenericScratchExt && hasQuantumContext && family === 'quantum-sim-transpile-scratch'),
		isCalibBaselinePath,
		isBenchmarkHoldPath,
		isCanonicalVaultPath,
	}
}

/**
 * Determine whether a duplicate group belongs to the Quantum Computing, Cryogenic Qubit & Pulse-Control domain.
 *
 * @param {object} group Duplicate group.
 * @return {boolean} True when at least one file belongs to this domain.
 */
export function isQuantumQubitPulseGroup(group) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return false
	}
	return group.files.some(file => classifyQuantumQubitPulseFile(file).family !== null)
}

/**
 * Build cross-group correlation index linking verified QASM/Pulse/QPY/Calibration anchors
 * to derived Bloch/tomography/Rabi CSV/Parquet tables and plots.
 *
 * @param {Array<object>} groups Domain duplicate groups.
 * @return {object} Correlation index.
 */
export function buildQuantumQubitPulseCorrelationIndex(groups) {
	const anchorStems = new Set()
	const anchorKeys = new Set()

	for (const group of Array.isArray(groups) ? groups : []) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (const file of group.files) {
			const meta = classifyQuantumQubitPulseFile(file)
			if (!meta.family) {
				continue
			}
			if (meta.isQuantumMasterAnchor) {
				anchorStems.add(meta.runStem)
				anchorKeys.add(meta.quantumAnchorKey)
			}
		}
	}

	return {
		anchorStems,
		anchorKeys,
	}
}

/**
 * Determine primary family for a heterogeneous Quantum & Cryo cluster.
 *
 * @param {Array<object>} members Classified members.
 * @return {string} Family ID.
 */
function resolveClusterFamily(members) {
	if (members.some(m => m.family === 'quantum-calib-cryo-holds')) {
		return 'quantum-calib-cryo-holds'
	}
	if (members.some(m => m.family === 'quantum-circuit-pulse-masters')) {
		return 'quantum-circuit-pulse-masters'
	}
	if (members.some(m => m.family === 'redundant-quantum-bloch-exports')) {
		return 'redundant-quantum-bloch-exports'
	}
	return 'quantum-sim-transpile-scratch'
}

/**
 * Compute deterministic survivor priority score for a Quantum & Cryo vault member.
 *
 * @param {object} member Classified member.
 * @param {string} survivorRule Survivor rule.
 * @return {number} Priority score (higher wins).
 */
function scoreMemberForSurvivor(member, survivorRule) {
	const mtimeScore = member.mtimeMs !== null ? member.mtimeMs / 1e10 : 0
	const shortPathScore = 1000 - Math.min(999, member.normalized.length)

	if (survivorRule === 'oldest-cryo-run-first') {
		const oldestScore = member.mtimeMs !== null ? -mtimeScore : 0
		return (member.isProtectedQpuBenchmarkHold ? 100000 : 0)
			+ (member.isProtectedCryoCalibration ? 97000 : 0)
			+ (member.isProtectedCircuitPulseMaster ? 94000 : 0)
			+ (member.isCanonicalVaultPath ? 25000 : 0)
			+ (member.isCalibBaselinePath ? 10000 : 0)
			+ (member.isScratchPath ? -55000 : 0)
			+ (member.isRedundantQuantumExport ? -40000 : 0)
			+ oldestScore
			+ shortPathScore
	}

	if (survivorRule === 'newest-transpile-first') {
		return (member.isProtectedQpuBenchmarkHold ? 100000 : 0)
			+ (member.isProtectedCryoCalibration ? 97000 : 0)
			+ (member.isProtectedCircuitPulseMaster ? 94000 : 0)
			+ (member.isScratchPath ? -50000 : 0)
			+ (member.isRedundantQuantumExport ? -40000 : 0)
			+ mtimeScore
	}

	if (survivorRule === 'shortest-path') {
		return (member.isProtectedQpuBenchmarkHold ? 52000 : 0)
			+ (member.isProtectedCryoCalibration ? 50000 : 0)
			+ (member.isProtectedCircuitPulseMaster ? 48000 : 0)
			+ (member.isScratchPath ? -30000 : 0)
			+ shortPathScore
	}

	return (member.isProtectedQpuBenchmarkHold ? 100000 : 0)
		+ (member.isProtectedCryoCalibration ? 97000 : 0)
		+ (member.isProtectedCircuitPulseMaster ? 94000 : 0)
		+ (member.isCanonicalVaultPath ? 25000 : 0)
		+ (member.isCalibBaselinePath ? 10000 : 0)
		+ (member.isRedundantQuantumExport ? -45000 : 0)
		+ (member.isScratchPath ? -60000 : 0)
		+ shortPathScore
}

/**
 * Audit a single Quantum Computing, Cryogenic Qubit & Pulse-Control duplicate cluster.
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
		const meta = classifyQuantumQubitPulseFile(file, referenceNowMs)
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
	const primaryToolchain = rawMembers.find(m => m.quantumToolchain)?.quantumToolchain || ''
	const primaryStage = rawMembers.find(m => m.workflowStage)?.workflowStage || ''
	const primaryStem = rawMembers[0].runStem || extractQuantumQubitPulseStem(primaryName, rawMembers[0].normalized)
	const primaryAnchorKey = rawMembers[0].quantumAnchorKey || extractQuantumQubitPulseAnchorKey(primaryStem)

	const hasQuantumMasterAnchor = Boolean(
		rawMembers.some(m => m.isQuantumMasterAnchor)
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

		const isRedundantQuantumExportMember = member.isRedundantQuantumExport && hasQuantumMasterAnchor

		let redundancyReason = ''
		if (member.isRedundantQuantumExport) {
			redundancyReason = isRedundantQuantumExportMember
				? 'Derived tomography table or Bloch/Rabi plot duplicates verified QASM, Pulse, QPY, or Shot master'
				: 'Derived tomography or plot export without verified QASM, Pulse, QPY, or Calibration anchor'
		}

		let governanceTier = 'sim-transpile-scratch'
		let shielded = false
		let protectedReason = ''
		let action = 'keep'

		if (override === 'keep') {
			governanceTier = member.isProtectedQpuBenchmarkHold
				? 'qpu-benchmark-hold-protected'
				: (member.isProtectedCryoCalibration
					? 'quantum-calib-cryo-protected'
					: (member.isProtectedCircuitPulseMaster
						? 'qasm-pulse-master-protected'
						: (member.isRedundantQuantumExport
							? 'quantum-export-redundant'
							: 'sim-transpile-scratch')))
			shielded = true
			protectedReason = 'Manually shielded via per-copy override'
		} else if (member.isProtectedQpuBenchmarkHold && config.protectQpuBenchmarkHolds) {
			governanceTier = 'qpu-benchmark-hold-protected'
			shielded = true
			protectedReason = 'QPU benchmark, QEC, cryo, or calibration-freeze hold strictly conserved'
		} else if (member.isProtectedCryoCalibration && config.protectCryoAndCalibration) {
			governanceTier = 'quantum-calib-cryo-protected'
			shielded = true
			protectedReason = 'Dilution cryo log, qubit calibration DB, or wiring map strictly conserved'
		} else if (member.isProtectedCircuitPulseMaster && config.protectCircuitAndPulseMasters) {
			governanceTier = 'qasm-pulse-master-protected'
			shielded = true
			protectedReason = 'Verified OpenQASM, QPY, Stim, SeqC/QUA pulse, or IQ shot master strictly conserved'
		} else if (isSurvivor && !isRedundantQuantumExportMember) {
			governanceTier = member.isProtectedQpuBenchmarkHold
				? 'qpu-benchmark-hold-protected'
				: (member.isProtectedCryoCalibration
					? 'quantum-calib-cryo-protected'
					: (member.isProtectedCircuitPulseMaster
						? 'qasm-pulse-master-protected'
						: (member.isRedundantQuantumExport
							? 'quantum-export-redundant'
							: 'sim-transpile-scratch')))
			shielded = true
			protectedReason = 'Canonical Quantum & Cryogenic vault survivor retained'
		} else if (override === 'prune') {
			governanceTier = member.isRedundantQuantumExport
				? 'quantum-export-redundant'
				: (member.isProtectedCryoCalibration
					? 'quantum-calib-cryo-protected'
					: 'sim-transpile-scratch')
			action = config.strategy === 'hardlink-immutable-qpy-and-hdf5' && !member.isMutableFile && !member.isScratchPath
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
			governanceTier = 'sim-transpile-scratch'
			shielded = true
			protectedReason = `Within ${config.keepRecentRunDays}-day active cooldown or pulse-compiler grace window`
		} else if (member.isRedundantQuantumExport) {
			governanceTier = 'quantum-export-redundant'
			if (config.requireQuantumAnchorForPrune && !hasQuantumMasterAnchor) {
				shielded = true
				protectedReason = 'Blocked until a verified QASM, QPY, Stim, SeqC, or Calibration anchor exists'
			} else {
				action = 'delete'
				deleteTargetsCount += 1
				reclaimableBytes += member.size
				protectedReason = redundancyReason
			}
		} else if (member.isScratchPath) {
			governanceTier = 'sim-transpile-scratch'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
			protectedReason = 'Aer, Cirq, LabOneQ, Qblox, or transpiler scratch eligible for cleanup'
		} else if (member.isProtectedCircuitPulseMaster || member.isProtectedCryoCalibration) {
			governanceTier = member.isProtectedCryoCalibration ? 'quantum-calib-cryo-protected' : 'qasm-pulse-master-protected'
			action = config.strategy === 'hardlink-immutable-qpy-and-hdf5' && !member.isMutableFile ? 'hardlink' : 'delete'
			if (action === 'hardlink') {
				hardlinkSavingsBytes += member.size
				hardlinkTargetsCount += 1
			} else {
				deleteTargetsCount += 1
			}
			reclaimableBytes += member.size
		} else if (config.strategy === 'hardlink-immutable-qpy-and-hdf5' && !member.isMutableFile) {
			governanceTier = 'qasm-pulse-master-protected'
			action = 'hardlink'
			hardlinkSavingsBytes += member.size
			hardlinkTargetsCount += 1
			reclaimableBytes += member.size
		} else {
			governanceTier = 'sim-transpile-scratch'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
		}

		if (shielded) {
			shieldedCount += 1
		}

		return {
			...member,
			isRedundantQuantumExportMember,
			redundancyReason,
			isSurvivor,
			governanceTier,
			shielded,
			protectedReason,
			action,
		}
	})

	const hasRedundantQuantumExport = members.some(m => m.isRedundantQuantumExportMember || m.isRedundantQuantumExport)
	const hasProtectedQpuBenchmarkHold = members.some(m => m.governanceTier === 'qpu-benchmark-hold-protected' && m.shielded)
	const hasProtectedCryoCalibration = members.some(m => m.governanceTier === 'quantum-calib-cryo-protected' && m.shielded)
	const hasProtectedCircuitPulseMaster = members.some(m => m.governanceTier === 'qasm-pulse-master-protected' && m.shielded)
	const hasSimTranspileScratch = members.some(m => m.isScratchPath)

	let clusterVerdict = 'shielded'
	if (reclaimableBytes > 0) {
		if (members.some(m => m.isRedundantQuantumExportMember && !m.shielded)) {
			clusterVerdict = 'quantum-export-redundant'
		} else if (members.some(m => m.isScratchPath && !m.shielded)) {
			clusterVerdict = 'sim-transpile-scratch'
		} else {
			clusterVerdict = 'reclaimable'
		}
	} else if (hasProtectedQpuBenchmarkHold) {
		clusterVerdict = 'qpu-benchmark-hold-protected'
	} else if (hasProtectedCryoCalibration) {
		clusterVerdict = 'quantum-calib-cryo-protected'
	} else if (hasProtectedCircuitPulseMaster) {
		clusterVerdict = 'qasm-pulse-master-protected'
	}

	let priorityScore = 10
	if (reclaimableBytes > 0) {
		priorityScore = hasRedundantQuantumExport ? 95 : 85
	} else if (hasProtectedQpuBenchmarkHold) {
		priorityScore = 60
	} else if (hasProtectedCryoCalibration) {
		priorityScore = 50
	}

	const quantumTags = [...new Set(members.map(m => m.quantumTag).filter(Boolean))]
	const familyMeta = QUANTUM_QUBIT_PULSE_FAMILY_META[family] || QUANTUM_QUBIT_PULSE_FAMILY_META['quantum-sim-transpile-scratch']

	return {
		id: group.id ?? primaryName,
		hash: group.hash || '',
		name: primaryName,
		quantumToolchain: primaryToolchain,
		workflowStage: primaryStage,
		runStem: primaryStem,
		quantumAnchorKey: primaryAnchorKey,
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
		hasProtectedCryoCalibration,
		hasProtectedCircuitPulseMaster,
		hasProtectedQpuBenchmarkHold,
		hasRedundantQuantumExport,
		hasSimTranspileScratch,
		hasQuantumMasterAnchor,
		quantumTags,
		members,
		sourceGroup: group,
	}
}

/**
 * Audit a list of duplicate groups as a Quantum Computing, Cryogenic Qubit & Pulse-Control Vault.
 *
 * @param {Array<object>} groups Duplicate groups.
 * @param {object} [rawConfig] Optional audit configuration.
 * @param {number} [referenceNowMs] Optional reference timestamp in ms.
 * @return {object} Comprehensive Quantum & Cryogenic vault audit report.
 */
export function auditQuantumQubitPulseVault(groups, rawConfig = {}, referenceNowMs = Date.now()) {
	const config = normalizeQuantumQubitPulseConfig(rawConfig)
	const groupList = Array.isArray(groups) ? groups : []

	const domainGroups = groupList.filter(isQuantumQubitPulseGroup)
	const correlationIndex = buildQuantumQubitPulseCorrelationIndex(domainGroups)

	const allClusters = domainGroups
		.map(group => auditSingleCluster(group, correlationIndex, config, referenceNowMs))
		.filter(Boolean)

	const minBytes = config.minSizeKb * 1024
	const sizeFiltered = allClusters.filter(cluster => cluster.unitBytes >= minBytes || cluster.totalBytes >= minBytes)

	const familyCounts = {
		'quantum-calib-cryo-holds': 0,
		'quantum-circuit-pulse-masters': 0,
		'redundant-quantum-bloch-exports': 0,
		'quantum-sim-transpile-scratch': 0,
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
				cluster.quantumToolchain,
				cluster.workflowStage,
				cluster.runStem,
				cluster.quantumAnchorKey,
				cluster.familyLabel,
				...cluster.quantumTags,
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
	let totalCryoCalibClusters = 0
	let totalCircuitMasterClusters = 0
	let totalBenchmarkHoldClusters = 0
	let totalRedundantExportClusters = 0
	let totalSimScratchClusters = 0

	for (const cluster of filteredClusters) {
		rawDuplicateBytes += Math.max(0, cluster.totalBytes - cluster.unitBytes)
		reclaimableBytes += cluster.reclaimableBytes
		totalReclaimableCopiesCount += cluster.reclaimableTargetsCount
		totalShieldedCopiesCount += cluster.shieldedCount
		if (cluster.hasProtectedCryoCalibration) {
			totalCryoCalibClusters += 1
		}
		if (cluster.hasProtectedCircuitPulseMaster) {
			totalCircuitMasterClusters += 1
		}
		if (cluster.hasProtectedQpuBenchmarkHold) {
			totalBenchmarkHoldClusters += 1
		}
		if (cluster.hasRedundantQuantumExport) {
			totalRedundantExportClusters += 1
		}
		if (cluster.hasSimTranspileScratch) {
			totalSimScratchClusters += 1
		}
	}

	const reclaimableGb = `${(reclaimableBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
	const efficiencyPct = rawDuplicateBytes > 0
		? Math.min(100, Math.round((reclaimableBytes / rawDuplicateBytes) * 100))
		: 0

	const familyBreakdown = QUANTUM_QUBIT_PULSE_FAMILIES
		.filter(id => id !== 'all')
		.map(id => ({
			id,
			label: QUANTUM_QUBIT_PULSE_FAMILY_META[id].label,
			shortLabel: QUANTUM_QUBIT_PULSE_FAMILY_META[id].shortLabel,
			clustersCount: familyCounts[id] || 0,
		}))

	return {
		schema: QUANTUM_QUBIT_PULSE_VAULT_SCHEMA,
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
			totalCryoCalibClusters,
			totalCircuitMasterClusters,
			totalBenchmarkHoldClusters,
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
 * Build a safe POSIX DRY_RUN=1 remediation script for Quantum & Cryo Vaults.
 * Strictly blocks deletion or hardlinking of shielded cryo/calibration baselines, QPU benchmark holds,
 * and verified QASM/Pulse/QPY/Shot masters, and never hardlinks mutable files or scratch.
 *
 * @param {object} auditResult Result from auditQuantumQubitPulseVault.
 * @return {string} POSIX bash script.
 */
export function buildQuantumQubitPulseRemediationScript(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# Quantum Computing, Cryogenic Qubit & Pulse-Control Vault Auditor',
		'# Safe POSIX Remediation Script (default DRY_RUN=1)',
		'# Run with DRY_RUN=0 ./quantum-qubit-pulse-vault-reclaim.sh only after verifying QASM/QPY/Pulse and Cryo anchors.',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'QUARANTINE_DIR="$' + '{QUARANTINE_DIR:-./.quantum-pulse-scratch-quarantine}"',
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
	const strategy = auditResult?.config?.strategy || 'prune-exports-and-pulse-scratch'
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
			} else if (strategy === 'quarantine-exports-and-pulse-scratch' && (target.isRedundantQuantumExport || target.isScratchPath)) {
				lines.push('run_cmd mkdir -p "$QUARANTINE_DIR"')
				lines.push(`run_cmd mv -n ${quotePosixPath(target.normalized)} "$QUARANTINE_DIR/"`)
			} else {
				lines.push(`run_cmd rm -f ${quotePosixPath(target.normalized)}`)
			}
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('printf "No reclaimable exports or pulse scratch under active Quantum & Cryo shields.\\n"')
	} else {
		lines.push(`printf "Completed Quantum & Cryogenic Vault remediation plan (%d target actions, DRY_RUN=%s).\\n" "${actionCount}" "$DRY_RUN"`)
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe RFC-4180 CSV audit report.
 *
 * @param {object} auditResult Result from auditQuantumQubitPulseVault.
 * @return {string} RFC-4180 CSV string.
 */
export function buildQuantumQubitPulseCsvReport(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const headers = [
		'cluster_id',
		'cluster_name',
		'quantum_toolchain',
		'workflow_stage',
		'run_stem',
		'quantum_anchor_key',
		'family',
		'cluster_verdict',
		'has_quantum_master_anchor',
		'is_redundant_quantum_export',
		'is_sim_transpile_scratch',
		'member_path',
		'artifact_kind',
		'vault_role',
		'quantum_tag',
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
				cluster.quantumToolchain || '',
				cluster.workflowStage || '',
				cluster.runStem,
				cluster.quantumAnchorKey,
				cluster.family,
				cluster.clusterVerdict,
				cluster.hasQuantumMasterAnchor ? 'true' : 'false',
				member.isRedundantQuantumExportMember ? 'true' : 'false',
				member.isScratchPath ? 'true' : 'false',
				member.normalized,
				member.artifactKind,
				member.vaultRole,
				member.quantumTag || '',
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
 * @param {object} auditResult Result from auditQuantumQubitPulseVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildQuantumQubitPulseJsonManifest(auditResult) {
	const payload = {
		schema: QUANTUM_QUBIT_PULSE_VAULT_SCHEMA,
		generatedAt: new Date().toISOString(),
		config: auditResult?.config || QUANTUM_QUBIT_PULSE_DEFAULT_CONFIG,
		summary: auditResult?.summary || {},
		clusters: (auditResult?.clusters || []).map(cluster => ({
			id: cluster.id,
			name: cluster.name,
			quantumToolchain: cluster.quantumToolchain,
			workflowStage: cluster.workflowStage,
			runStem: cluster.runStem,
			quantumAnchorKey: cluster.quantumAnchorKey,
			family: cluster.family,
			clusterVerdict: cluster.clusterVerdict,
			unitBytes: cluster.unitBytes,
			totalBytes: cluster.totalBytes,
			reclaimableBytes: cluster.reclaimableBytes,
			survivorPath: cluster.survivorPath,
			hasProtectedCryoCalibration: cluster.hasProtectedCryoCalibration,
			hasProtectedCircuitPulseMaster: cluster.hasProtectedCircuitPulseMaster,
			hasProtectedQpuBenchmarkHold: cluster.hasProtectedQpuBenchmarkHold,
			hasRedundantQuantumExport: cluster.hasRedundantQuantumExport,
			hasSimTranspileScratch: cluster.hasSimTranspileScratch,
			hasQuantumMasterAnchor: cluster.hasQuantumMasterAnchor,
			quantumTags: cluster.quantumTags,
			members: (cluster.members || []).map(member => ({
				path: member.normalized,
				artifactKind: member.artifactKind,
				vaultRole: member.vaultRole,
				quantumTag: member.quantumTag || '',
				governanceTier: member.governanceTier,
				action: member.action,
				shielded: member.shielded,
				protectedReason: member.protectedReason,
				isRedundantQuantumExportMember: member.isRedundantQuantumExportMember,
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
 * cloud sync of Qiskit Aer, Cirq, LabOneQ, Qblox, OPX, and transpiler scratch directories.
 *
 * @return {string} Line-delimited .sync-exclude.lst rules.
 */
export function buildQuantumQubitPulseSyncExcludeList() {
	return [
		'# Nextcloud / rsync exclusion rules for Quantum Computing & Cryogenic QPU Vaults',
		'qiskit_cache/',
		'aer_tmp/',
		'aer_cache/',
		'cirq_tmp/',
		'qutip_scratch/',
		'cuquantum_tmp/',
		'laboneq_cache/',
		'qblox_tmp/',
		'opx_staging/',
		'pulse_cache/',
		'transpile_tmp/',
		'qec_decode_tmp/',
		'shot_buffer_tmp/',
		'cryo_tmp/',
		'sim_scratch/',
		'tmp_qasm_*',
		'tmp_qpy_*',
		'tmp_pulse_*',
		'tmp_iq_*',
		'tmp_aer_*',
		'tmp_stim_*',
		'tmp_seqc_*',
		'tmp_qua_*',
		'cache_shot_*',
		'spill_iq_*',
		'*.qpy.tmp',
		'*.qasm.tmp',
		'*.stim.tmp',
		'*.seqc.tmp',
		'*.qua.tmp',
		'*.h5.lock',
		'*.h5.tmp',
		'*.npz.part',
		'*.npz.tmp',
		'*.zarr.lock',
		'*.lck',
		'*.lock',
		'*.tmp',
	].join('\n')
}
