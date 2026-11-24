/**
 * Pure Semiconductor EDA, ASIC/FPGA RTL, IC Layout (GDSII/OASIS) & Waveform Verification Vault Auditor.
 * Classifies and audits duplicate clusters across 4 Semiconductor & EDA Vault families:
 * - RTL Source, Constraints & IP (.sv, .svh, .vhd, .vhdl, .sdc, .xdc, .upf, .cpf, .ipx, .xci, EDA .v/.vh/.tcl)
 * - IC Layout & Tapeout Signoff (.gds.gz, .oas.gz, .gds, .gds2, .oas, .oasis, .lef, .spef, EDA .def/.lib/.db/.sdf)
 * - Simulation Waveforms & Coverage (.fst, .vcd.gz, .fsdb.zst, .ucdb, .vdb, .vcd, .fsdb, .wlf, EDA .shm/.trn/.dsn)
 * - EDA Synth, PnR & Sim Scratch (xsim.dir/, simv.daidir/, xcelium.d/, INCA_libs/, vivado_cache/, innovus_tmp/, .elab_cache)
 *
 * Enforces strict tapeout signoff and RTL source preservation defaults:
 * - Strictly conserves RTL (.sv/.v/.vhd), timing/power constraints (.sdc/.xdc/.upf/.cpf), and signoff LEF/DEF/LIB/SPEF/SDF
 * - Strictly conserves compressed tapeout archives (.gds.gz, .gds2.gz, .oas.gz, .oasis.gz)
 * - Strictly conserves compact/compressed waveforms & coverage (.fst, .vcd.gz, .fsdb.zst, .ucdb, .vdb)
 * - Detects redundant uncompressed .gds/.oas layout files when a verified .gds.gz/.oas.gz tapeout anchor exists
 * - Detects redundant uncompressed .vcd/.fsdb/.wlf waveforms when a verified .fst/.vcd.gz/.fsdb.zst anchor exists
 * - Blocks deletion of uncompressed .gds/.oas/.vcd/.fsdb/.wlf lacking a verified compressed anchor when guard is active
 * - Blocks hardlinks on mutable RTL/constraints, active coverage DBs, uncompressed dumps, and EDA scratch
 *
 * Generates DRY_RUN=1 POSIX remediation scripts, CWE-1236-safe CSV reports, JSON audit
 * manifests, and .sync-exclude.lst rules. Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const SEMICONDUCTOR_EDA_VAULT_SCHEMA = 'duplicatefinder.semiconductor-eda-vault-auditor.v1'

export const SEMICONDUCTOR_EDA_FAMILIES = Object.freeze([
	'all',
	'rtl-constraints-ip',
	'ic-layout-tapeout',
	'sim-waveforms-coverage',
	'eda-synth-sim-scratch',
])

export const SEMICONDUCTOR_EDA_FAMILY_META = Object.freeze({
	'rtl-constraints-ip': {
		id: 'rtl-constraints-ip',
		label: 'RTL & Constraints',
		shortLabel: 'RTL (.sv, .v, .vhd, .sdc, .xdc, .upf, .ipx)',
	},
	'ic-layout-tapeout': {
		id: 'ic-layout-tapeout',
		label: 'IC Layout & Tapeout',
		shortLabel: 'Layout (.gds.gz, .oas.gz, .gds, .oas, .lef, .spef)',
	},
	'sim-waveforms-coverage': {
		id: 'sim-waveforms-coverage',
		label: 'Waveforms & Coverage',
		shortLabel: 'Waveforms (.fst, .vcd.gz, .fsdb, .vcd, .wlf, .ucdb)',
	},
	'eda-synth-sim-scratch': {
		id: 'eda-synth-sim-scratch',
		label: 'EDA Synth & Sim Scratch',
		shortLabel: 'Scratch (xsim.dir/, simv.daidir/, xcelium.d/, vivado_cache/)',
	},
})

export const SEMICONDUCTOR_EDA_STRATEGIES = Object.freeze([
	'prune-uncompressed-dumps-and-eda-scratch',
	'hardlink-immutable-tapeout-and-waveforms',
	'quarantine-uncompressed-dumps-and-scratch',
])

export const SEMICONDUCTOR_EDA_SURVIVOR_RULES = Object.freeze([
	'tapeout-vault-archive-first',
	'oldest-tapeout-first',
	'newest-rtl-revision-first',
	'shortest-path',
])

export const SEMICONDUCTOR_EDA_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'rtl-constraints-protected',
	'compressed-tapeout-protected',
	'compressed-waveform-protected',
	'uncompressed-gds-vcd-redundant',
	'eda-synth-sim-scratch-intermediate',
	'shielded',
])

export const SEMICONDUCTOR_EDA_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const SEMICONDUCTOR_EDA_PRESETS = Object.freeze([
	{
		id: 'all-semiconductor-eda-audit',
		name: 'All Semiconductor & EDA Vaults',
		description: 'Audit RTL & timing constraints, GDSII/OASIS tapeout layouts, FSDB/VCD/FST simulation waveforms, and Vivado/VCS/Xcelium scratch while conserving canonical silicon tapeout anchors.',
		familyFilter: 'all',
		strategy: 'prune-uncompressed-dumps-and-eda-scratch',
		survivorRule: 'tapeout-vault-archive-first',
		protectRtlAndConstraints: true,
		protectCompressedTapeoutAndSignoff: true,
		protectCompressedWaveforms: true,
		requireCompressedAnchorForPrune: true,
		keepRecentTapeoutDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'eda-synth-sim-scratch-cleanup',
		name: 'Synth, PnR & Sim Scratch Cleanup',
		description: 'Reclaim redundant xsim.dir/, simv.daidir/, xcelium.d/, INCA_libs/, vivado_cache/, genus_tmp/, and innovus_tmp/ intermediates older than the tapeout grace window while conserving RTL, GDS.GZ, and FST vaults.',
		familyFilter: 'all',
		strategy: 'prune-uncompressed-dumps-and-eda-scratch',
		survivorRule: 'tapeout-vault-archive-first',
		protectRtlAndConstraints: true,
		protectCompressedTapeoutAndSignoff: true,
		protectCompressedWaveforms: true,
		requireCompressedAnchorForPrune: true,
		keepRecentTapeoutDays: 14,
		minSizeKb: 0,
	},
	{
		id: 'redundant-uncompressed-waveform-audit',
		name: 'Redundant .vcd/.fsdb/.wlf vs .fst/.vcd.gz',
		description: 'Detect uncompressed .vcd, .fsdb, and .wlf simulation waveform dumps backed by a verified compressed .fst, .vcd.gz, or .fsdb.zst archive anchor and quarantine or prune them safely.',
		familyFilter: 'sim-waveforms-coverage',
		strategy: 'quarantine-uncompressed-dumps-and-scratch',
		survivorRule: 'tapeout-vault-archive-first',
		protectRtlAndConstraints: true,
		protectCompressedTapeoutAndSignoff: true,
		protectCompressedWaveforms: true,
		requireCompressedAnchorForPrune: true,
		keepRecentTapeoutDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'ic-layout-gds-oas-vs-gz-audit',
		name: 'IC Layout (.gds/.oas vs .gds.gz/.oas.gz)',
		description: 'Identify uncompressed .gds, .gds2, and .oas layout exports backed by a verified .gds.gz or .oas.gz tapeout anchor while conserving LEF, SPEF, and signoff collateral.',
		familyFilter: 'ic-layout-tapeout',
		strategy: 'quarantine-uncompressed-dumps-and-scratch',
		survivorRule: 'tapeout-vault-archive-first',
		protectRtlAndConstraints: true,
		protectCompressedTapeoutAndSignoff: true,
		protectCompressedWaveforms: true,
		requireCompressedAnchorForPrune: true,
		keepRecentTapeoutDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'rtl-constraints-tapeout-shield',
		name: 'Conserved RTL, SDC/XDC & Signoff Shield',
		description: 'Inspect SystemVerilog/VHDL RTL, SDC/XDC/UPF constraints, and compressed tapeout/signoff collateral under strict silicon preservation shields.',
		familyFilter: 'rtl-constraints-ip',
		strategy: 'hardlink-immutable-tapeout-and-waveforms',
		survivorRule: 'tapeout-vault-archive-first',
		protectRtlAndConstraints: true,
		protectCompressedTapeoutAndSignoff: true,
		protectCompressedWaveforms: true,
		requireCompressedAnchorForPrune: true,
		keepRecentTapeoutDays: 0,
		minSizeKb: 0,
	},
])

export const SEMICONDUCTOR_EDA_DEFAULT_CONFIG = Object.freeze({
	presetId: 'all-semiconductor-eda-audit',
	familyFilter: 'all',
	verdictFilter: 'all',
	strategy: 'prune-uncompressed-dumps-and-eda-scratch',
	survivorRule: 'tapeout-vault-archive-first',
	sortMode: 'reclaim_desc',
	searchQuery: '',
	protectRtlAndConstraints: true,
	protectCompressedTapeoutAndSignoff: true,
	protectCompressedWaveforms: true,
	requireCompressedAnchorForPrune: true,
	keepRecentTapeoutDays: 0,
	minSizeKb: 0,
})

const STRICT_RTL_EXT_RE = /\.(?:sv|svh|vhd|vhdl|sdc|xdc|upf|cpf|ipx|xci)$/i
const CONTEXT_RTL_EXT_RE = /\.(?:v|vh|tcl)$/i

const COMPRESSED_LAYOUT_EXT_RE = /\.(?:gds2?|oas(?:is)?)\.(?:gz|zst|bz2|xz|lz4)$/i
const UNCOMPRESSED_LAYOUT_EXT_RE = /\.(?:gds2?|oas(?:is)?)$/i
const STRICT_SIGNOFF_EXT_RE = /\.(?:lef|spef|spef\.gz|spef\.zst)$/i
const CONTEXT_SIGNOFF_EXT_RE = /\.(?:def|lib|db|sdf)$/i

const COMPRESSED_WAVEFORM_EXT_RE = /\.(?:fst|vcd\.(?:gz|zst|bz2|xz)|fsdb\.(?:gz|zst|bz2|xz)|wlf\.(?:gz|zst))$/i
const STRICT_COVERAGE_EXT_RE = /\.(?:ucdb|vdb)$/i
const STRICT_UNCOMPRESSED_WAVEFORM_EXT_RE = /\.(?:fsdb|vcd|wlf)$/i
const CONTEXT_WAVEFORM_EXT_RE = /\.(?:shm|trn|dsn)$/i

const STRICT_EDA_SCRATCH_EXT_RE = /\.(?:elab_cache|wlf\.tmp|fsdb\.tmp|vcd\.tmp)$/i
const CONTEXT_EDA_SCRATCH_EXT_RE = /\.(?:jou|pb|str)$/i

const MUTABLE_EDA_EXT_RE = /\.(?:sv|svh|v|vh|vhd|vhdl|sdc|xdc|upf|cpf|ipx|xci|tcl|gds|gds2|oas|oasis|lef|def|lib|db|spef|sdf|vcd|fsdb|wlf|shm|trn|dsn|ucdb|vdb|jou|pb|str|log|tmp)$/i

const EDA_CONTEXT_RE = /(?:rtl|asic|fpga|verilog|systemverilog|vhdl|vivado|quartus|synopsys|vcs|verdi|cadence|xcelium|innovus|genus|calibre|mentor|questa|modelsim|tapeout|gdsii|oasis|foundry|pdk|netlist|testbench|waveform|simv|xsim|uvm|sky130|gf180|tsmc|smic|semiconductor|silicon|chip|wafer|signoff|synthesis|pnr|drc|lvs)/i

const EDA_SCRATCH_PATH_RE = /(?:^|\/)(?:xsim\.dir|simv\.daidir|work\.lib|inca_libs|xcelium\.d|vivado_cache|\.xil|genus_tmp|innovus_tmp|calibre_tmp|drc_tmp|lvs_tmp|eda_scratch|sim_scratch|synth_tmp|pnr_tmp|verif_tmp|wave_tmp|scratch|tmp|temp|cache)(?:\/|$)/i
const CANONICAL_TAPEOUT_PATH_RE = /(?:^|\/)(?:00_tapeout|tapeout[_-]?vault|silicon[_-]?vault|rtl[_-]?vault|golden[_-]?rtl|signoff[_-]?vault|pdk[_-]?vault|foundry[_-]?release|gds[_-]?archive|wave[_-]?archive|canonical|archive|vault)(?:\/|$)/i

const ANY_EDA_EXT_RE = /\.(?:gds2?\.(?:gz|zst|bz2|xz|lz4)|oas(?:is)?\.(?:gz|zst|bz2|xz|lz4)|vcd\.(?:gz|zst|bz2|xz)|fsdb\.(?:gz|zst|bz2|xz)|wlf\.(?:gz|zst)|spef\.(?:gz|zst)|elab_cache|wlf\.tmp|fsdb\.tmp|vcd\.tmp|sv|svh|vhd|vhdl|sdc|xdc|upf|cpf|ipx|xci|tcl|v|vh|gds|gds2|oas|oasis|lef|def|lib|db|spef|sdf|fst|ucdb|vdb|fsdb|vcd|wlf|shm|trn|dsn|jou|pb|str)$/i

const GENERIC_EDA_STEMS = new Set([
	'top',
	'rtl',
	'tb',
	'testbench',
	'waves',
	'waveform',
	'dump',
	'sim',
	'layout',
	'chip',
	'core',
	'soc',
	'design',
	'constraints',
	'timing',
	'coverage',
	'transcript',
])

const NOISE_PARENT_DIRS = new Set([
	'xsim.dir',
	'simv.daidir',
	'work.lib',
	'inca_libs',
	'xcelium.d',
	'vivado_cache',
	'.xil',
	'genus_tmp',
	'innovus_tmp',
	'calibre_tmp',
	'drc_tmp',
	'lvs_tmp',
	'eda_scratch',
	'sim_scratch',
	'synth_tmp',
	'pnr_tmp',
	'verif_tmp',
	'wave_tmp',
	'scratch',
	'tmp',
	'temp',
	'cache',
	'build',
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
export function normalizeSemiconductorEdaConfig(raw = {}) {
	const input = raw && typeof raw === 'object' ? raw : {}
	const preset = SEMICONDUCTOR_EDA_PRESETS.find(item => item.id === input.presetId) || null
	const base = preset
		? { ...SEMICONDUCTOR_EDA_DEFAULT_CONFIG, ...preset }
		: { ...SEMICONDUCTOR_EDA_DEFAULT_CONFIG }

	const familyFilter = SEMICONDUCTOR_EDA_FAMILIES.includes(input.familyFilter)
		? input.familyFilter
		: base.familyFilter
	const verdictFilter = SEMICONDUCTOR_EDA_VERDICT_FILTERS.includes(input.verdictFilter)
		? input.verdictFilter
		: base.verdictFilter
	const strategy = SEMICONDUCTOR_EDA_STRATEGIES.includes(input.strategy)
		? input.strategy
		: base.strategy
	const survivorRule = SEMICONDUCTOR_EDA_SURVIVOR_RULES.includes(input.survivorRule)
		? input.survivorRule
		: base.survivorRule
	const sortMode = SEMICONDUCTOR_EDA_SORT_MODES.includes(input.sortMode)
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
		protectRtlAndConstraints: typeof input.protectRtlAndConstraints === 'boolean'
			? input.protectRtlAndConstraints
			: base.protectRtlAndConstraints,
		protectCompressedTapeoutAndSignoff: typeof input.protectCompressedTapeoutAndSignoff === 'boolean'
			? input.protectCompressedTapeoutAndSignoff
			: base.protectCompressedTapeoutAndSignoff,
		protectCompressedWaveforms: typeof input.protectCompressedWaveforms === 'boolean'
			? input.protectCompressedWaveforms
			: base.protectCompressedWaveforms,
		requireCompressedAnchorForPrune: typeof input.requireCompressedAnchorForPrune === 'boolean'
			? input.requireCompressedAnchorForPrune
			: base.requireCompressedAnchorForPrune,
		keepRecentTapeoutDays: normalizeNonNegativeInt(input.keepRecentTapeoutDays, base.keepRecentTapeoutDays, 3650),
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
 * Extract meaningful silicon project or IP block folder from a path, skipping scratch subdirs.
 *
 * @param {string} normalizedPath Normalized path.
 * @return {string} Meaningful folder slug or empty string.
 */
function extractMeaningfulBlockFolder(normalizedPath) {
	const parts = String(normalizedPath || '').split('/').filter(Boolean)
	if (parts.length <= 1) {
		return ''
	}
	for (let i = parts.length - 2; i >= 0; i -= 1) {
		const segment = parts[i].toLowerCase()
		if (!NOISE_PARENT_DIRS.has(segment)) {
			return segment.replace(/[^a-z0-9_-]/g, '-')
		}
	}
	return ''
}

/**
 * Detect EDA toolchain platform and silicon verification stage from path and basename.
 *
 * @param {string} normalizedPath Normalized path.
 * @param {string} [basename] File basename.
 * @return {{ edaToolchain: string, pipelineStage: string }} Detected toolchain and stage.
 */
export function extractEdaToolchainAndStage(normalizedPath, basename = '') {
	const lowerPath = String(normalizedPath || '').toLowerCase()
	const lowerBase = String(basename || '').toLowerCase()

	let edaToolchain = 'ASIC / FPGA EDA Vault'
	if (/vivado|xilinx|amd|\.xdc$|\.xci$|xsim\.dir/i.test(lowerPath + '/' + lowerBase)) {
		edaToolchain = 'AMD Vivado / XSim'
	} else if (/quartus|intel_fpga|altera/i.test(lowerPath)) {
		edaToolchain = 'Intel Quartus Prime'
	} else if (/vcs|verdi|synopsys|simv\.daidir|\.fsdb(?:\.(?:gz|zst|bz2|xz))?$/i.test(lowerPath + '/' + lowerBase)) {
		edaToolchain = 'Synopsys VCS / Verdi'
	} else if (/xcelium|innovus|genus|cadence|xcelium\.d|inca_libs|\.shm$/i.test(lowerPath + '/' + lowerBase)) {
		edaToolchain = 'Cadence Xcelium / Innovus'
	} else if (/calibre|questa|modelsim|mentor|siemens|\.ucdb$|\.wlf(?:\.(?:gz|zst))?$/i.test(lowerPath + '/' + lowerBase)) {
		edaToolchain = 'Siemens Questa / Calibre'
	} else if (/verilator|gtkwave|icarus|openlane|sky130|gf180|\.fst$/i.test(lowerPath + '/' + lowerBase)) {
		edaToolchain = 'OpenLane / Verilator / FST'
	} else if (COMPRESSED_LAYOUT_EXT_RE.test(lowerBase) || UNCOMPRESSED_LAYOUT_EXT_RE.test(lowerBase)) {
		edaToolchain = 'GDSII / OASIS Tapeout'
	}

	let pipelineStage = ''
	if (STRICT_RTL_EXT_RE.test(lowerBase) || (CONTEXT_RTL_EXT_RE.test(lowerBase) && EDA_CONTEXT_RE.test(lowerPath))) {
		pipelineStage = /\.(?:sdc|xdc|upf|cpf)$/i.test(lowerBase)
			? 'Timing & Power Constraints (.sdc/.xdc/.upf)'
			: 'RTL Source & IP Collateral (.sv/.v/.vhd)'
	} else if (COMPRESSED_LAYOUT_EXT_RE.test(lowerBase)) {
		pipelineStage = 'Compressed Tapeout Layout (.gds.gz/.oas.gz)'
	} else if (UNCOMPRESSED_LAYOUT_EXT_RE.test(lowerBase)) {
		pipelineStage = 'Uncompressed IC Layout (.gds/.oas)'
	} else if (STRICT_SIGNOFF_EXT_RE.test(lowerBase) || (CONTEXT_SIGNOFF_EXT_RE.test(lowerBase) && EDA_CONTEXT_RE.test(lowerPath))) {
		pipelineStage = 'Signoff Physical & Timing Collateral (.lef/.def/.spef/.lib)'
	} else if (COMPRESSED_WAVEFORM_EXT_RE.test(lowerBase) || STRICT_COVERAGE_EXT_RE.test(lowerBase)) {
		pipelineStage = 'Compressed Waveform & Coverage Anchor (.fst/.vcd.gz/.ucdb)'
	} else if (STRICT_UNCOMPRESSED_WAVEFORM_EXT_RE.test(lowerBase) || (CONTEXT_WAVEFORM_EXT_RE.test(lowerBase) && EDA_CONTEXT_RE.test(lowerPath))) {
		pipelineStage = 'Uncompressed Simulation Waveform (.vcd/.fsdb/.wlf)'
	} else if (EDA_SCRATCH_PATH_RE.test(lowerPath) || STRICT_EDA_SCRATCH_EXT_RE.test(lowerBase)) {
		pipelineStage = 'Synthesis, PnR & Sim Scratch'
	}

	return { edaToolchain, pipelineStage }
}

/**
 * Extract normalized silicon block lineage stem and tapeout anchor key to correlate
 * uncompressed .gds/.oas against .gds.gz/.oas.gz and uncompressed .vcd/.fsdb/.wlf against .fst/.vcd.gz/.fsdb.zst.
 *
 * @param {string} basename File basename.
 * @param {string} [normalizedPath] Full normalized path for block folder context.
 * @return {string} Normalized lineage stem.
 */
export function extractEdaLineageStem(basename, normalizedPath = '') {
	let stem = String(basename || '').trim().toLowerCase()
	stem = stem.replace(ANY_EDA_EXT_RE, '')
	stem = stem.replace(/\s+\(\d+\)$/, '')
	stem = stem.replace(/\s*-\s*copy(?:\s*\(\d+\))?$/i, '')

	let prev = ''
	while (stem !== prev) {
		prev = stem
		stem = stem.replace(
			/(?:[-_.](?:raw|uncompressed|unzipped|dump|wave|waves|exported|merged|copy\d*|tmp|temp|v\d+(?:\.\d+)?))$/i,
			''
		)
	}

	if (!stem || GENERIC_EDA_STEMS.has(stem)) {
		const blockFolder = extractMeaningfulBlockFolder(normalizedPath)
		if (blockFolder) {
			return `${blockFolder}_${stem || 'silicon'}`
		}
	}

	return stem || 'unknown-silicon-block'
}

/**
 * Extract broader silicon anchor key (stripping corner/run split suffixes like _rc0, _ssg_0p81v, _run02).
 *
 * @param {string} lineageStem Normalized lineage stem.
 * @return {string} Silicon anchor key.
 */
export function extractTapeoutAnchorKey(lineageStem) {
	return String(lineageStem || '')
		.replace(/(?:[-_.](?:run\d+|seed\d+|part\d+|chunk\d+|\d{1,4}))+$/i, '')
		|| 'unknown-silicon-block'
}

/**
 * Extract concise EDA artifact tag for badges and CSV exports.
 *
 * @param {string} lowerBase Lowercase basename.
 * @param {string} lowerPath Lowercase full path.
 * @return {string} EDA artifact tag.
 */
function extractEdaTag(lowerBase, lowerPath) {
	if (/\.(?:sv|svh|v|vh|vhd|vhdl)$/i.test(lowerBase)) {
		return 'rtl-hdl'
	}
	if (/\.(?:sdc|xdc|upf|cpf|ipx|xci)$/i.test(lowerBase)) {
		return 'timing-power-constraint'
	}
	if (COMPRESSED_LAYOUT_EXT_RE.test(lowerBase)) {
		return 'tapeout-layout-compressed'
	}
	if (UNCOMPRESSED_LAYOUT_EXT_RE.test(lowerBase)) {
		return 'layout-uncompressed'
	}
	if (STRICT_SIGNOFF_EXT_RE.test(lowerBase) || (CONTEXT_SIGNOFF_EXT_RE.test(lowerBase) && EDA_CONTEXT_RE.test(lowerPath))) {
		return 'signoff-collateral'
	}
	if (COMPRESSED_WAVEFORM_EXT_RE.test(lowerBase)) {
		return 'waveform-compressed'
	}
	if (STRICT_COVERAGE_EXT_RE.test(lowerBase)) {
		return 'coverage-database'
	}
	if (STRICT_UNCOMPRESSED_WAVEFORM_EXT_RE.test(lowerBase) || (CONTEXT_WAVEFORM_EXT_RE.test(lowerBase) && EDA_CONTEXT_RE.test(lowerPath))) {
		return 'waveform-uncompressed'
	}
	if (STRICT_EDA_SCRATCH_EXT_RE.test(lowerBase) || EDA_SCRATCH_PATH_RE.test(lowerPath)) {
		return 'eda-synth-sim-scratch'
	}
	return ''
}

/**
 * Classify a single duplicate file into the Semiconductor EDA, RTL, IC Layout & Waveform Vault domain.
 *
 * @param {object} file Duplicate file entry.
 * @param {number} [referenceNowMs] Reference epoch ms.
 * @return {object} Classification metadata (family === null if outside domain).
 */
export function classifySemiconductorEdaFile(file, referenceNowMs = Date.now()) {
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

	const hasEdaContext = EDA_CONTEXT_RE.test(lower)
	const isEdaScratchPath = EDA_SCRATCH_PATH_RE.test(lower)
	const isCanonicalTapeoutPath = CANONICAL_TAPEOUT_PATH_RE.test(lower) && !isEdaScratchPath

	const isStrictRtl = STRICT_RTL_EXT_RE.test(lowerBase)
	const isContextRtl = CONTEXT_RTL_EXT_RE.test(lowerBase) && hasEdaContext

	const isCompressedLayout = COMPRESSED_LAYOUT_EXT_RE.test(lowerBase)
	const isUncompressedLayout = !isCompressedLayout && UNCOMPRESSED_LAYOUT_EXT_RE.test(lowerBase)
	const isSignoffCollateral = STRICT_SIGNOFF_EXT_RE.test(lowerBase)
		|| (CONTEXT_SIGNOFF_EXT_RE.test(lowerBase) && hasEdaContext)

	const isCompressedWaveform = COMPRESSED_WAVEFORM_EXT_RE.test(lowerBase)
	const isCoverageDb = STRICT_COVERAGE_EXT_RE.test(lowerBase)
	const isUncompressedWaveform = !isCompressedWaveform && (
		STRICT_UNCOMPRESSED_WAVEFORM_EXT_RE.test(lowerBase)
		|| (CONTEXT_WAVEFORM_EXT_RE.test(lowerBase) && hasEdaContext)
	)

	const isStrictScratchExt = STRICT_EDA_SCRATCH_EXT_RE.test(lowerBase)
	const isContextScratch = (isEdaScratchPath && (hasEdaContext || ANY_EDA_EXT_RE.test(lowerBase)))
		|| (CONTEXT_EDA_SCRATCH_EXT_RE.test(lowerBase) && hasEdaContext)

	let family = null
	let artifactKind = ''
	let vaultRole = ''
	let isProtectedRtlConstraints = false
	let isProtectedCompressedTapeout = false
	let isProtectedCompressedWaveform = false
	let isCompressedLayoutAnchor = false
	let isCompressedWaveformAnchor = false
	let isUncompressedLayoutFile = false
	let isUncompressedWaveformFile = false
	const isMutableFile = MUTABLE_EDA_EXT_RE.test(lowerBase)

	if (isStrictRtl || isContextRtl) {
		family = 'rtl-constraints-ip'
		isProtectedRtlConstraints = !isEdaScratchPath
		if (/\.(?:sdc|xdc|upf|cpf)$/i.test(lowerBase)) {
			artifactKind = 'Timing & Power Constraints (.sdc/.xdc/.upf/.cpf)'
			vaultRole = isEdaScratchPath ? 'Scratch Constraint Copy' : 'Canonical Silicon Constraints Vault'
		} else if (/\.(?:ipx|xci)$/i.test(lowerBase)) {
			artifactKind = 'IP-XACT / Vivado IP Manifest (.ipx/.xci)'
			vaultRole = isEdaScratchPath ? 'Scratch IP Manifest Copy' : 'Canonical IP Collateral Vault'
		} else {
			artifactKind = 'RTL Hardware Description (.sv/.v/.vhd)'
			vaultRole = isEdaScratchPath ? 'Scratch RTL Copy' : 'Canonical RTL Source Vault'
		}
	} else if (isCompressedLayout || isUncompressedLayout || isSignoffCollateral) {
		family = 'ic-layout-tapeout'
		if (isCompressedLayout) {
			isCompressedLayoutAnchor = !isEdaScratchPath
			isProtectedCompressedTapeout = !isEdaScratchPath
			artifactKind = 'Compressed Tapeout Layout (.gds.gz/.oas.gz)'
			vaultRole = isEdaScratchPath ? 'Scratch GDS.GZ/OAS.GZ Copy' : 'Archived Tapeout GDSII / OASIS Vault'
		} else if (isSignoffCollateral) {
			isProtectedCompressedTapeout = !isEdaScratchPath
			artifactKind = 'Signoff Physical & Timing Collateral (.lef/.def/.spef/.lib)'
			vaultRole = isEdaScratchPath ? 'Scratch Signoff Copy' : 'Conserved Tapeout Signoff Collateral'
		} else {
			isUncompressedLayoutFile = true
			artifactKind = 'Uncompressed IC Layout (.gds/.gds2/.oas)'
			vaultRole = isEdaScratchPath ? 'Scratch Uncompressed GDS/OAS' : 'Uncompressed IC Layout Export'
		}
	} else if (isCompressedWaveform || isCoverageDb || isUncompressedWaveform) {
		family = 'sim-waveforms-coverage'
		if (isCompressedWaveform) {
			isCompressedWaveformAnchor = !isEdaScratchPath
			isProtectedCompressedWaveform = !isEdaScratchPath
			artifactKind = 'Compressed Waveform Archive (.fst/.vcd.gz/.fsdb.zst)'
			vaultRole = isEdaScratchPath ? 'Scratch Compressed Waveform' : 'Archived Compressed Waveform Vault'
		} else if (isCoverageDb) {
			isProtectedCompressedWaveform = !isEdaScratchPath
			artifactKind = 'Verification Coverage Database (.ucdb/.vdb)'
			vaultRole = isEdaScratchPath ? 'Scratch Coverage Copy' : 'Conserved Regression Coverage DB'
		} else {
			isUncompressedWaveformFile = true
			artifactKind = 'Uncompressed Simulation Waveform (.fsdb/.vcd/.wlf)'
			vaultRole = isEdaScratchPath ? 'Scratch Waveform Dump' : 'Uncompressed Waveform Dump Copy'
		}
	} else if (isStrictScratchExt || isContextScratch) {
		family = 'eda-synth-sim-scratch'
		artifactKind = isStrictScratchExt
			? 'Transient EDA Elaboration / Waveform Temp'
			: 'EDA Synthesis, PnR & Sim Scratch'
		vaultRole = 'Vivado / VCS / Xcelium / Innovus Scratch'
	}

	const { edaToolchain, pipelineStage } = extractEdaToolchainAndStage(normalized, basename)
	const lineageStem = extractEdaLineageStem(basename, normalized)
	const tapeoutAnchorKey = extractTapeoutAnchorKey(lineageStem)
	const blockFolder = extractMeaningfulBlockFolder(normalized)
	const edaTag = extractEdaTag(lowerBase, lower)

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
		edaToolchain,
		pipelineStage,
		lineageStem,
		tapeoutAnchorKey,
		blockFolder,
		edaTag,
		isProtectedRtlConstraints,
		isProtectedCompressedTapeout,
		isProtectedCompressedWaveform,
		isCompressedLayoutAnchor,
		isCompressedWaveformAnchor,
		isUncompressedLayoutFile,
		isUncompressedWaveformFile,
		isMutableFile,
		isEdaScratchPath: isEdaScratchPath || isStrictScratchExt,
		isCanonicalTapeoutPath,
	}
}

/**
 * Determine whether a duplicate group belongs to the Semiconductor EDA & IC Verification Vault domain.
 *
 * @param {object} group Duplicate group.
 * @return {boolean} True when at least one file belongs to this domain.
 */
export function isSemiconductorEdaGroup(group) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return false
	}
	return group.files.some(file => classifySemiconductorEdaFile(file).family !== null)
}

/**
 * Build cross-group correlation index linking verified compressed GDSII/OASIS (.gds.gz/.oas.gz)
 * and compressed waveform (.fst/.vcd.gz/.fsdb.zst) archive anchors to redundant uncompressed copies.
 *
 * @param {Array<object>} groups Domain duplicate groups.
 * @return {object} Correlation index.
 */
export function buildSemiconductorEdaCorrelationIndex(groups) {
	const compressedLayoutStems = new Set()
	const compressedLayoutAnchorKeys = new Set()
	const compressedWaveformStems = new Set()
	const compressedWaveformAnchorKeys = new Set()

	for (const group of Array.isArray(groups) ? groups : []) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (const file of group.files) {
			const meta = classifySemiconductorEdaFile(file)
			if (!meta.family) {
				continue
			}
			if (meta.isCompressedLayoutAnchor) {
				compressedLayoutStems.add(meta.lineageStem)
				compressedLayoutAnchorKeys.add(meta.tapeoutAnchorKey)
			}
			if (meta.isCompressedWaveformAnchor) {
				compressedWaveformStems.add(meta.lineageStem)
				compressedWaveformAnchorKeys.add(meta.tapeoutAnchorKey)
			}
		}
	}

	return {
		compressedLayoutStems,
		compressedLayoutAnchorKeys,
		compressedWaveformStems,
		compressedWaveformAnchorKeys,
	}
}

/**
 * Determine primary family for a heterogeneous Semiconductor EDA cluster.
 *
 * @param {Array<object>} members Classified members.
 * @return {string} Family ID.
 */
function resolveClusterFamily(members) {
	if (members.some(m => m.family === 'rtl-constraints-ip')) {
		return 'rtl-constraints-ip'
	}
	if (members.some(m => m.family === 'ic-layout-tapeout')) {
		return 'ic-layout-tapeout'
	}
	if (members.some(m => m.family === 'sim-waveforms-coverage')) {
		return 'sim-waveforms-coverage'
	}
	return 'eda-synth-sim-scratch'
}

/**
 * Compute deterministic survivor priority score for a Semiconductor EDA vault member.
 *
 * @param {object} member Classified member.
 * @param {string} survivorRule Survivor rule.
 * @return {number} Priority score (higher wins).
 */
function scoreMemberForSurvivor(member, survivorRule) {
	const mtimeScore = member.mtimeMs !== null ? member.mtimeMs / 1e10 : 0
	const shortPathScore = 1000 - Math.min(999, member.normalized.length)

	if (survivorRule === 'oldest-tapeout-first') {
		const oldestScore = member.mtimeMs !== null ? -mtimeScore : 0
		return (member.isProtectedRtlConstraints ? 98000 : 0)
			+ (member.isProtectedCompressedTapeout ? 94000 : 0)
			+ (member.isProtectedCompressedWaveform ? 92000 : 0)
			+ (member.isCanonicalTapeoutPath ? 25000 : 0)
			+ (member.isEdaScratchPath ? -55000 : 0)
			+ ((member.isUncompressedLayoutFile || member.isUncompressedWaveformFile) ? -40000 : 0)
			+ oldestScore
			+ shortPathScore
	}

	if (survivorRule === 'newest-rtl-revision-first') {
		return (member.isProtectedRtlConstraints ? 98000 : 0)
			+ (member.isProtectedCompressedTapeout ? 94000 : 0)
			+ (member.isProtectedCompressedWaveform ? 92000 : 0)
			+ (member.isEdaScratchPath ? -50000 : 0)
			+ ((member.isUncompressedLayoutFile || member.isUncompressedWaveformFile) ? -40000 : 0)
			+ mtimeScore
	}

	if (survivorRule === 'shortest-path') {
		return (member.isProtectedRtlConstraints ? 50000 : 0)
			+ (member.isProtectedCompressedTapeout ? 48000 : 0)
			+ (member.isProtectedCompressedWaveform ? 46000 : 0)
			+ (member.isEdaScratchPath ? -30000 : 0)
			+ shortPathScore
	}

	return (member.isProtectedRtlConstraints ? 99000 : 0)
		+ (member.isProtectedCompressedTapeout ? 95000 : 0)
		+ (member.isProtectedCompressedWaveform ? 93000 : 0)
		+ (member.isCanonicalTapeoutPath ? 25000 : 0)
		+ ((member.isUncompressedLayoutFile || member.isUncompressedWaveformFile) ? -45000 : 0)
		+ (member.isEdaScratchPath ? -60000 : 0)
		+ shortPathScore
}

/**
 * Audit a single Semiconductor EDA, RTL, IC Layout & Waveform duplicate cluster.
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
		const meta = classifySemiconductorEdaFile(file, referenceNowMs)
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
	const primaryToolchain = rawMembers.find(m => m.edaToolchain)?.edaToolchain || ''
	const primaryStage = rawMembers.find(m => m.pipelineStage)?.pipelineStage || ''
	const primaryStem = rawMembers[0].lineageStem || extractEdaLineageStem(primaryName, rawMembers[0].normalized)
	const primaryAnchorKey = rawMembers[0].tapeoutAnchorKey || extractTapeoutAnchorKey(primaryStem)

	const hasCompressedLayoutAnchor = Boolean(
		rawMembers.some(m => m.isCompressedLayoutAnchor)
		|| correlationIndex.compressedLayoutStems.has(primaryStem)
		|| correlationIndex.compressedLayoutAnchorKeys.has(primaryAnchorKey)
	)

	const hasCompressedWaveformAnchor = Boolean(
		rawMembers.some(m => m.isCompressedWaveformAnchor)
		|| correlationIndex.compressedWaveformStems.has(primaryStem)
		|| correlationIndex.compressedWaveformAnchorKeys.has(primaryAnchorKey)
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

		const isRedundantLayoutMember = member.isUncompressedLayoutFile && hasCompressedLayoutAnchor
		const isRedundantWaveformMember = member.isUncompressedWaveformFile && hasCompressedWaveformAnchor
		const isRedundantUncompressedMember = isRedundantLayoutMember || isRedundantWaveformMember

		let redundancyReason = ''
		if (member.isUncompressedLayoutFile) {
			redundancyReason = isRedundantLayoutMember
				? 'Uncompressed .gds/.oas duplicates verified .gds.gz/.oas.gz tapeout archive'
				: 'Uncompressed .gds/.oas without verified compressed .gds.gz/.oas.gz anchor'
		} else if (member.isUncompressedWaveformFile) {
			redundancyReason = isRedundantWaveformMember
				? 'Uncompressed .vcd/.fsdb/.wlf duplicates verified .fst/.vcd.gz/.fsdb.zst archive'
				: 'Uncompressed .vcd/.fsdb/.wlf without verified compressed waveform anchor'
		}

		let governanceTier = 'eda-synth-sim-scratch-intermediate'
		let shielded = false
		let protectedReason = ''
		let action = 'keep'

		if (override === 'keep') {
			governanceTier = member.isProtectedRtlConstraints
				? 'rtl-constraints-protected'
				: (member.isProtectedCompressedTapeout
					? 'compressed-tapeout-protected'
					: (member.isProtectedCompressedWaveform
						? 'compressed-waveform-protected'
						: ((member.isUncompressedLayoutFile || member.isUncompressedWaveformFile)
							? 'uncompressed-gds-vcd-redundant'
							: 'eda-synth-sim-scratch-intermediate')))
			shielded = true
			protectedReason = 'Manually shielded via per-copy override'
		} else if (member.isProtectedRtlConstraints && config.protectRtlAndConstraints) {
			governanceTier = 'rtl-constraints-protected'
			shielded = true
			protectedReason = 'RTL hardware source (.sv/.v/.vhd) and timing/power constraints strictly conserved'
		} else if (member.isProtectedCompressedTapeout && config.protectCompressedTapeoutAndSignoff) {
			governanceTier = 'compressed-tapeout-protected'
			shielded = true
			protectedReason = member.isCompressedLayoutAnchor
				? 'Compressed tapeout GDSII/OASIS (.gds.gz/.oas.gz) archive strictly conserved'
				: 'Signoff physical and timing collateral (.lef/.def/.spef/.lib) strictly conserved'
		} else if (member.isProtectedCompressedWaveform && config.protectCompressedWaveforms) {
			governanceTier = 'compressed-waveform-protected'
			shielded = true
			protectedReason = 'Compressed waveform or coverage archive (.fst/.vcd.gz/.ucdb) strictly conserved'
		} else if (isSurvivor && !isRedundantUncompressedMember) {
			governanceTier = member.isProtectedRtlConstraints
				? 'rtl-constraints-protected'
				: (member.isProtectedCompressedTapeout
					? 'compressed-tapeout-protected'
					: (member.isProtectedCompressedWaveform
						? 'compressed-waveform-protected'
						: ((member.isUncompressedLayoutFile || member.isUncompressedWaveformFile)
							? 'uncompressed-gds-vcd-redundant'
							: 'eda-synth-sim-scratch-intermediate')))
			shielded = true
			protectedReason = 'Canonical Semiconductor EDA vault survivor retained'
		} else if (override === 'prune') {
			governanceTier = (member.isUncompressedLayoutFile || member.isUncompressedWaveformFile)
				? 'uncompressed-gds-vcd-redundant'
				: (member.isProtectedRtlConstraints
					? 'rtl-constraints-protected'
					: 'eda-synth-sim-scratch-intermediate')
			action = config.strategy === 'hardlink-immutable-tapeout-and-waveforms' && !member.isMutableFile && !member.isEdaScratchPath
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
			config.keepRecentTapeoutDays > 0
			&& member.isEdaScratchPath
			&& member.ageDays !== null
			&& member.ageDays < config.keepRecentTapeoutDays
		) {
			governanceTier = 'eda-synth-sim-scratch-intermediate'
			shielded = true
			protectedReason = `Within ${config.keepRecentTapeoutDays}-day active tapeout retention window`
		} else if (member.isUncompressedLayoutFile || member.isUncompressedWaveformFile) {
			governanceTier = 'uncompressed-gds-vcd-redundant'
			const hasRequiredAnchor = member.isUncompressedLayoutFile ? hasCompressedLayoutAnchor : hasCompressedWaveformAnchor
			if (config.requireCompressedAnchorForPrune && !hasRequiredAnchor) {
				shielded = true
				protectedReason = member.isUncompressedLayoutFile
					? 'Blocked until a verified .gds.gz/.oas.gz tapeout anchor exists'
					: 'Blocked until a verified .fst/.vcd.gz/.fsdb.zst waveform anchor exists'
			} else {
				action = 'delete'
				deleteTargetsCount += 1
				reclaimableBytes += member.size
				protectedReason = redundancyReason
			}
		} else if (member.isEdaScratchPath) {
			governanceTier = 'eda-synth-sim-scratch-intermediate'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
			protectedReason = 'Vivado/VCS/Xcelium/Innovus scratch eligible for safe cleanup'
		} else if (member.isProtectedCompressedTapeout || member.isProtectedCompressedWaveform) {
			governanceTier = member.isProtectedCompressedTapeout ? 'compressed-tapeout-protected' : 'compressed-waveform-protected'
			action = config.strategy === 'hardlink-immutable-tapeout-and-waveforms' && !member.isMutableFile ? 'hardlink' : 'delete'
			if (action === 'hardlink') {
				hardlinkSavingsBytes += member.size
				hardlinkTargetsCount += 1
			} else {
				deleteTargetsCount += 1
			}
			reclaimableBytes += member.size
		} else if (config.strategy === 'hardlink-immutable-tapeout-and-waveforms' && !member.isMutableFile) {
			governanceTier = 'compressed-tapeout-protected'
			action = 'hardlink'
			hardlinkSavingsBytes += member.size
			hardlinkTargetsCount += 1
			reclaimableBytes += member.size
		} else {
			governanceTier = 'eda-synth-sim-scratch-intermediate'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
		}

		if (shielded) {
			shieldedCount += 1
		}

		return {
			...member,
			isRedundantLayoutMember,
			isRedundantWaveformMember,
			isRedundantUncompressedMember,
			redundancyReason,
			isSurvivor,
			governanceTier,
			shielded,
			protectedReason,
			action,
		}
	})

	const hasRedundantUncompressedGdsOrVcd = members.some(m => m.isRedundantUncompressedMember || m.isUncompressedLayoutFile || m.isUncompressedWaveformFile)
	const hasEdaScratchIntermediate = members.some(m => m.isEdaScratchPath)
	const hasProtectedRtlConstraints = members.some(m => m.governanceTier === 'rtl-constraints-protected')
	const hasProtectedCompressedTapeout = members.some(m => m.governanceTier === 'compressed-tapeout-protected')
	const hasProtectedCompressedWaveform = members.some(m => m.governanceTier === 'compressed-waveform-protected')

	let clusterVerdict = 'eda-synth-sim-scratch-intermediate'
	if (members.some(m => m.isRedundantUncompressedMember)) {
		clusterVerdict = 'uncompressed-gds-vcd-redundant'
	} else if (hasProtectedRtlConstraints) {
		clusterVerdict = 'rtl-constraints-protected'
	} else if (hasProtectedCompressedTapeout) {
		clusterVerdict = 'compressed-tapeout-protected'
	} else if (hasProtectedCompressedWaveform) {
		clusterVerdict = 'compressed-waveform-protected'
	} else if (hasEdaScratchIntermediate) {
		clusterVerdict = 'eda-synth-sim-scratch-intermediate'
	} else if (hasRedundantUncompressedGdsOrVcd) {
		clusterVerdict = 'uncompressed-gds-vcd-redundant'
	}

	const hasReclaimable = (deleteTargetsCount + hardlinkTargetsCount) > 0
	const edaTags = Array.from(new Set(members.map(m => m.edaTag).filter(Boolean)))

	const riskScore = (members.some(m => m.isRedundantUncompressedMember) ? 125 : 0)
		+ (hasEdaScratchIntermediate ? 110 : 0)
		+ (hasProtectedRtlConstraints ? 95 : 0)
		+ (hasProtectedCompressedTapeout ? 90 : 0)
		+ (hasProtectedCompressedWaveform ? 85 : 0)
		+ (hasReclaimable ? 20 : 0)

	return {
		id: group.id ?? primaryName,
		hash: group.hash || '',
		name: primaryName,
		edaToolchain: primaryToolchain,
		pipelineStage: primaryStage,
		lineageStem: primaryStem,
		tapeoutAnchorKey: primaryAnchorKey,
		family,
		familyLabel: SEMICONDUCTOR_EDA_FAMILY_META[family]?.label || family,
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
		hasProtectedRtlConstraints,
		hasProtectedCompressedTapeout,
		hasProtectedCompressedWaveform,
		hasRedundantUncompressedGdsOrVcd,
		hasEdaScratchIntermediate,
		hasCompressedLayoutAnchor,
		hasCompressedWaveformAnchor,
		edaTags,
		members,
		group,
	}
}

/**
 * Audit duplicate groups across Semiconductor EDA, RTL, IC Layout & Waveform Verification Vaults.
 *
 * @param {Array<object>} groups Duplicate groups.
 * @param {object} [rawConfig] Audit configuration overrides.
 * @param {number} [referenceNowMs] Reference epoch ms for deterministic tests.
 * @return {object} Complete audit report with summary, family counts, and filtered clusters.
 */
export function auditSemiconductorEdaVault(groups, rawConfig = {}, referenceNowMs = Date.now()) {
	const config = normalizeSemiconductorEdaConfig(rawConfig)
	const sourceGroups = Array.isArray(groups) ? groups : []
	const domainGroups = sourceGroups.filter(isSemiconductorEdaGroup)
	const correlationIndex = buildSemiconductorEdaCorrelationIndex(domainGroups)

	const allClusters = domainGroups
		.map(group => auditSingleCluster(group, correlationIndex, config, referenceNowMs))
		.filter(Boolean)

	const minSizeBytes = config.minSizeKb * 1024
	const sizeFiltered = allClusters.filter(cluster => cluster.unitBytes >= minSizeBytes)

	const familyCounts = {
		all: sizeFiltered.length,
		'rtl-constraints-ip': 0,
		'ic-layout-tapeout': 0,
		'sim-waveforms-coverage': 0,
		'eda-synth-sim-scratch': 0,
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
		if (config.verdictFilter === 'uncompressed-gds-vcd-redundant' && !cluster.hasRedundantUncompressedGdsOrVcd) {
			return false
		}
		if (config.verdictFilter === 'eda-synth-sim-scratch-intermediate' && !cluster.hasEdaScratchIntermediate) {
			return false
		}
		if (
			config.verdictFilter !== 'all'
			&& config.verdictFilter !== 'reclaimable'
			&& config.verdictFilter !== 'shielded'
			&& config.verdictFilter !== 'uncompressed-gds-vcd-redundant'
			&& config.verdictFilter !== 'eda-synth-sim-scratch-intermediate'
			&& cluster.clusterVerdict !== config.verdictFilter
		) {
			return false
		}
		if (query.length > 0) {
			const matchesName = cluster.name.toLowerCase().includes(query)
			const matchesStem = cluster.lineageStem.toLowerCase().includes(query)
			const matchesToolchain = cluster.edaToolchain.toLowerCase().includes(query)
			const matchesStage = cluster.pipelineStage.toLowerCase().includes(query)
			const matchesTag = cluster.edaTags.some(tag => tag.toLowerCase().includes(query))
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
	let totalRtlClusters = 0
	let totalTapeoutClusters = 0
	let totalWaveformArchiveClusters = 0
	let totalRedundantGdsVcdClusters = 0
	let totalEdaScratchClusters = 0

	for (const cluster of filteredClusters) {
		rawDuplicateBytes += Math.max(0, cluster.totalBytes - cluster.unitBytes)
		reclaimableBytes += cluster.reclaimableBytes
		totalReclaimableCopiesCount += cluster.reclaimableTargetsCount
		totalShieldedCopiesCount += cluster.shieldedCount

		if (cluster.hasProtectedRtlConstraints) {
			totalRtlClusters += 1
		}
		if (cluster.hasProtectedCompressedTapeout) {
			totalTapeoutClusters += 1
		}
		if (cluster.hasProtectedCompressedWaveform) {
			totalWaveformArchiveClusters += 1
		}
		if (cluster.hasRedundantUncompressedGdsOrVcd) {
			totalRedundantGdsVcdClusters += 1
		}
		if (cluster.hasEdaScratchIntermediate) {
			totalEdaScratchClusters += 1
		}
	}

	const efficiencyPct = rawDuplicateBytes > 0
		? Math.min(100, Math.round((reclaimableBytes / rawDuplicateBytes) * 100))
		: 0

	const reclaimableGb = `${(reclaimableBytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`

	const familyBreakdown = SEMICONDUCTOR_EDA_FAMILIES
		.filter(id => id !== 'all')
		.map(id => ({
			id,
			label: SEMICONDUCTOR_EDA_FAMILY_META[id].label,
			shortLabel: SEMICONDUCTOR_EDA_FAMILY_META[id].shortLabel,
			clustersCount: familyCounts[id] || 0,
		}))

	return {
		schema: SEMICONDUCTOR_EDA_VAULT_SCHEMA,
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
			totalRtlClusters,
			totalTapeoutClusters,
			totalWaveformArchiveClusters,
			totalRedundantGdsVcdClusters,
			totalEdaScratchClusters,
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
 * Build a safe POSIX DRY_RUN=1 remediation script for Semiconductor EDA vaults.
 * Strictly blocks deletion or hardlinking of shielded RTL/constraints, compressed GDS.GZ/OAS.GZ,
 * signoff collateral, and compressed waveform/coverage archives, and never hardlinks mutable files or EDA scratch.
 *
 * @param {object} auditResult Result from auditSemiconductorEdaVault.
 * @return {string} POSIX bash script.
 */
export function buildSemiconductorEdaRemediationScript(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# Semiconductor EDA, ASIC/FPGA RTL, IC Layout (GDSII/OASIS) & Waveform Verification Vault Auditor',
		'# Safe POSIX Remediation Script (default DRY_RUN=1)',
		'# Run with DRY_RUN=0 ./semiconductor-eda-vault-reclaim.sh only after verifying RTL, GDS.GZ, and FST anchors.',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'QUARANTINE_DIR="$' + '{QUARANTINE_DIR:-./.semiconductor-eda-scratch-quarantine}"',
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
	const strategy = auditResult?.config?.strategy || 'prune-uncompressed-dumps-and-eda-scratch'
	for (const cluster of clusters) {
		const actions = (cluster.members || []).filter(m => !m.shielded && (m.action === 'delete' || m.action === 'hardlink'))
		if (actions.length === 0) {
			continue
		}
		lines.push(`# Cluster: ${cluster.name} | Family: ${cluster.familyLabel} | Survivor: ${cluster.survivorPath}`)
		for (const target of actions) {
			actionCount += 1
			if (target.action === 'hardlink' && !target.isMutableFile && !target.isEdaScratchPath) {
				lines.push(`run_cmd ln -f ${quotePosixPath(cluster.survivorPath)} ${quotePosixPath(target.normalized)}`)
			} else if (strategy === 'quarantine-uncompressed-dumps-and-scratch' && (target.isUncompressedLayoutFile || target.isUncompressedWaveformFile || target.isEdaScratchPath)) {
				lines.push('run_cmd mkdir -p "$QUARANTINE_DIR"')
				lines.push(`run_cmd mv -n ${quotePosixPath(target.normalized)} "$QUARANTINE_DIR/"`)
			} else {
				lines.push(`run_cmd rm -f ${quotePosixPath(target.normalized)}`)
			}
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('printf "No reclaimable uncompressed .gds/.oas/.vcd/.fsdb/.wlf dumps or EDA scratch under active vault shields.\\n"')
	} else {
		lines.push(`printf "Completed Semiconductor & EDA Vault remediation plan (%d target actions, DRY_RUN=%s).\\n" "${actionCount}" "$DRY_RUN"`)
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe RFC-4180 CSV audit report.
 *
 * @param {object} auditResult Result from auditSemiconductorEdaVault.
 * @return {string} RFC-4180 CSV string.
 */
export function buildSemiconductorEdaCsvReport(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const headers = [
		'cluster_id',
		'cluster_name',
		'eda_toolchain',
		'pipeline_stage',
		'lineage_stem',
		'tapeout_anchor_key',
		'family',
		'cluster_verdict',
		'has_compressed_layout_anchor',
		'has_compressed_waveform_anchor',
		'is_redundant_uncompressed',
		'is_eda_scratch',
		'member_path',
		'artifact_kind',
		'vault_role',
		'eda_tag',
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
				cluster.edaToolchain || '',
				cluster.pipelineStage || '',
				cluster.lineageStem,
				cluster.tapeoutAnchorKey,
				cluster.family,
				cluster.clusterVerdict,
				cluster.hasCompressedLayoutAnchor ? 'true' : 'false',
				cluster.hasCompressedWaveformAnchor ? 'true' : 'false',
				member.isRedundantUncompressedMember ? 'true' : 'false',
				member.isEdaScratchPath ? 'true' : 'false',
				member.normalized,
				member.artifactKind,
				member.vaultRole,
				member.edaTag || '',
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
 * @param {object} auditResult Result from auditSemiconductorEdaVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildSemiconductorEdaJsonManifest(auditResult) {
	const payload = {
		schema: SEMICONDUCTOR_EDA_VAULT_SCHEMA,
		generatedAt: new Date().toISOString(),
		config: auditResult?.config || SEMICONDUCTOR_EDA_DEFAULT_CONFIG,
		summary: auditResult?.summary || {},
		clusters: (auditResult?.clusters || []).map(cluster => ({
			id: cluster.id,
			name: cluster.name,
			edaToolchain: cluster.edaToolchain,
			pipelineStage: cluster.pipelineStage,
			lineageStem: cluster.lineageStem,
			tapeoutAnchorKey: cluster.tapeoutAnchorKey,
			family: cluster.family,
			clusterVerdict: cluster.clusterVerdict,
			unitBytes: cluster.unitBytes,
			totalBytes: cluster.totalBytes,
			reclaimableBytes: cluster.reclaimableBytes,
			survivorPath: cluster.survivorPath,
			hasProtectedRtlConstraints: cluster.hasProtectedRtlConstraints,
			hasProtectedCompressedTapeout: cluster.hasProtectedCompressedTapeout,
			hasProtectedCompressedWaveform: cluster.hasProtectedCompressedWaveform,
			hasRedundantUncompressedGdsOrVcd: cluster.hasRedundantUncompressedGdsOrVcd,
			hasEdaScratchIntermediate: cluster.hasEdaScratchIntermediate,
			hasCompressedLayoutAnchor: cluster.hasCompressedLayoutAnchor,
			hasCompressedWaveformAnchor: cluster.hasCompressedWaveformAnchor,
			edaTags: cluster.edaTags,
			members: (cluster.members || []).map(member => ({
				path: member.normalized,
				artifactKind: member.artifactKind,
				vaultRole: member.vaultRole,
				edaTag: member.edaTag || '',
				governanceTier: member.governanceTier,
				action: member.action,
				shielded: member.shielded,
				protectedReason: member.protectedReason,
				isRedundantLayoutMember: member.isRedundantLayoutMember,
				isRedundantWaveformMember: member.isRedundantWaveformMember,
				isRedundantUncompressedMember: member.isRedundantUncompressedMember,
				isEdaScratchPath: member.isEdaScratchPath,
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
 * cloud sync of Vivado/VCS/Xcelium build dirs, PnR temp directories,
 * and transient elaboration or waveform scratch files.
 *
 * @return {string} Line-delimited .sync-exclude.lst rules.
 */
export function buildSemiconductorEdaSyncExcludeList() {
	return [
		'# Nextcloud / rsync exclusion rules for Semiconductor EDA, RTL & IC Layout Vaults',
		'xsim.dir/',
		'simv.daidir/',
		'work.lib/',
		'INCA_libs/',
		'xcelium.d/',
		'vivado_cache/',
		'.Xil/',
		'genus_tmp/',
		'innovus_tmp/',
		'calibre_tmp/',
		'drc_tmp/',
		'lvs_tmp/',
		'eda_scratch/',
		'sim_scratch/',
		'*.elab_cache',
		'*.wlf.tmp',
		'*.fsdb.tmp',
		'*.vcd.tmp',
		'*.tmp',
	].join('\n')
}
