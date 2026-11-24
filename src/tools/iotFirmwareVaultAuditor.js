/**
 * Pure IoT Firmware, Embedded ROM & Hardware Lab Vault Auditor.
 * Classifies and audits duplicate clusters across 4 Embedded & Hardware Lab families:
 * - Firmware & Embedded ROM Images (.bin, .hex, .elf, .uf2, .dfu, .img, .srec, .mot)
 * - KiCad & Altium Schematics/PCB Sources (.kicad_sch, .kicad_pcb, .kicad_pro, .schdoc, .pcbdoc, .prjpcb)
 * - Gerbers, Drill & BOM Packages (.gbr, .drl, .gtl/.gbl/.gto/.gbo/.gts/.gbs/.gko, gerber/fab .zip, BOM/CPL .csv)
 * - Oscilloscope & Logic Analyzer Captures (.sr, .sal, .vcd, .csv scope/logic/calibration traces)
 *
 * Detects intermediate/debug firmware builds vs signed production releases, strictly shields
 * canonical KiCad/Altium sources, signed production firmware releases, and calibration lab golden
 * captures, and generates DRY_RUN=1 POSIX remediation scripts, CWE-1236-safe CSV reports,
 * JSON audit manifests, and .sync-exclude.lst rules.
 *
 * Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const IOT_FIRMWARE_VAULT_SCHEMA = 'duplicatefinder.iot-firmware-vault-auditor.v1'

export const IOT_FIRMWARE_FAMILIES = Object.freeze([
	'all',
	'firmware-rom-images',
	'eda-kicad-altium-sources',
	'gerber-bom-fab-packages',
	'lab-scope-logic-captures',
])

export const IOT_FIRMWARE_FAMILY_META = Object.freeze({
	'firmware-rom-images': {
		id: 'firmware-rom-images',
		label: 'Firmware & Embedded ROMs',
		shortLabel: 'Firmware (.bin, .hex, .elf, .uf2, .dfu, .img, .srec)',
	},
	'eda-kicad-altium-sources': {
		id: 'eda-kicad-altium-sources',
		label: 'KiCad & Altium EDA Sources',
		shortLabel: 'EDA (.kicad_sch, .kicad_pcb, .schdoc, .pcbdoc)',
	},
	'gerber-bom-fab-packages': {
		id: 'gerber-bom-fab-packages',
		label: 'Gerbers, Drill & BOM Packages',
		shortLabel: 'Gerbers & BOM (.gbr, .drl, gerber .zip)',
	},
	'lab-scope-logic-captures': {
		id: 'lab-scope-logic-captures',
		label: 'Scope & Logic Lab Captures',
		shortLabel: 'Lab Captures (.sr, .sal, .vcd, .csv)',
	},
})

export const IOT_FIRMWARE_STRATEGIES = Object.freeze([
	'prune-debug-and-scratch',
	'hardlink-immutable-releases',
	'quarantine-debug-and-captures',
])

export const IOT_FIRMWARE_SURVIVOR_RULES = Object.freeze([
	'signed-release-and-source-first',
	'oldest-golden-first',
	'newest-verified-release',
	'shortest-path',
])

export const IOT_FIRMWARE_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'signed-release-protected',
	'eda-source-protected',
	'calibration-lab-protected',
	'intermediate-debug-build',
	'scratch-capture-or-backup',
	'shielded',
])

export const IOT_FIRMWARE_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const IOT_FIRMWARE_PRESETS = Object.freeze([
	{
		id: 'all-iot-firmware-lab-audit',
		name: 'All Firmware, EDA, Gerbers & Lab',
		description: 'Audit firmware ROMs (.bin/.hex/.elf/.uf2/.dfu/.img/.srec), KiCad/Altium sources, Gerbers/BOMs, and scope/logic captures while strictly conserving KiCad/Altium sources, signed production releases, and calibration labs.',
		familyFilter: 'all',
		strategy: 'prune-debug-and-scratch',
		survivorRule: 'signed-release-and-source-first',
		protectEdaSources: true,
		protectSignedReleases: true,
		protectCalibrationLabs: true,
		requireVerifiedReleaseAnchor: true,
		keepRecentBuildDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'signed-production-and-eda-vault',
		name: 'Signed Releases & KiCad/Altium Shield',
		description: 'Isolate signed production firmware releases and canonical KiCad/Altium schematic and PCB repositories with maximum vault conservation.',
		familyFilter: 'all',
		strategy: 'quarantine-debug-and-captures',
		survivorRule: 'signed-release-and-source-first',
		protectEdaSources: true,
		protectSignedReleases: true,
		protectCalibrationLabs: true,
		requireVerifiedReleaseAnchor: true,
		keepRecentBuildDays: 14,
		minSizeKb: 0,
	},
	{
		id: 'debug-firmware-build-reclaim',
		name: 'Debug & Intermediate Build Pruner',
		description: 'Identify intermediate debug, nightly, .pio/build, and unsigned firmware builds that duplicate or shadow verified signed production releases.',
		familyFilter: 'firmware-rom-images',
		strategy: 'prune-debug-and-scratch',
		survivorRule: 'signed-release-and-source-first',
		protectEdaSources: true,
		protectSignedReleases: true,
		protectCalibrationLabs: true,
		requireVerifiedReleaseAnchor: true,
		keepRecentBuildDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'scope-logic-and-calibration-lab',
		name: 'Scope, Logic & Calibration Lab',
		description: 'Audit Sigrok (.sr), Saleae (.sal), VCD (.vcd), and oscilloscope CSV traces while strictly protecting golden calibration lab reference captures.',
		familyFilter: 'lab-scope-logic-captures',
		strategy: 'quarantine-debug-and-captures',
		survivorRule: 'oldest-golden-first',
		protectEdaSources: true,
		protectSignedReleases: true,
		protectCalibrationLabs: true,
		requireVerifiedReleaseAnchor: true,
		keepRecentBuildDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'hardlink-immutable-rom-gerbers',
		name: 'Hardlink Immutable ROMs & Gerbers',
		description: 'Deduplicate identical immutable firmware binaries and Gerber fabrication archives via POSIX hardlinks while blocking hardlinks on mutable KiCad/Altium sources and CSV files.',
		familyFilter: 'all',
		strategy: 'hardlink-immutable-releases',
		survivorRule: 'signed-release-and-source-first',
		protectEdaSources: true,
		protectSignedReleases: true,
		protectCalibrationLabs: true,
		requireVerifiedReleaseAnchor: false,
		keepRecentBuildDays: 0,
		minSizeKb: 0,
	},
])

export const IOT_FIRMWARE_DEFAULT_CONFIG = Object.freeze({
	presetId: 'all-iot-firmware-lab-audit',
	familyFilter: 'all',
	verdictFilter: 'all',
	strategy: 'prune-debug-and-scratch',
	survivorRule: 'signed-release-and-source-first',
	sortMode: 'reclaim_desc',
	searchQuery: '',
	protectEdaSources: true,
	protectSignedReleases: true,
	protectCalibrationLabs: true,
	requireVerifiedReleaseAnchor: true,
	keepRecentBuildDays: 0,
	minSizeKb: 0,
})

const FIRMWARE_DIRECT_EXT_RE = /\.(?:bin|hex|elf|uf2|dfu|srec|mot)$/i
const FIRMWARE_IMG_EXT_RE = /\.img$/i
const EDA_KICAD_ALTIUM_EXT_RE = /\.(?:kicad_sch|kicad_pcb|kicad_pro|schdoc|pcbdoc|prjpcb)$/i
const GERBER_DIRECT_EXT_RE = /\.(?:gbr|drl|gtl|gbl|gto|gbo|gts|gbs|gko|gm1|xlr)$/i
const ZIP_EXT_RE = /\.zip$/i
const CSV_EXT_RE = /\.csv$/i
const LAB_CAPTURE_DIRECT_EXT_RE = /\.(?:sr|sal|vcd)$/i

const MUTABLE_HARDWARE_EXT_RE = /\.(?:kicad_sch|kicad_pcb|kicad_pro|schdoc|pcbdoc|prjpcb|csv)$/i

const FIRMWARE_IMG_NAME_HINT_RE = /(?:firmware|fw|rom|boot|bootloader|uboot|flash|eeprom|rootfs|initrd|ota|esp32|stm32|nrf52|rp2040|imx|mcu|iot|embedded|gateway|openwrt|zephyr|freertos|buildroot|yocto)/i
const IOT_HARDWARE_PATH_HINT_RE = /(?:^|\/)(?:firmware|embedded|iot|rom|bootloader|ota|mcu|stm32|esp32|nrf52|rp2040|hardware|hw[-_]?lab|electronics|kicad|altium|pcb|schematics?|gerbers?|fab[-_]?release|oscilloscope|logic[-_]?analyzer|saleae|sigrok|calibration|calib|bench[-_]?tests?|emc[-_]?lab|jtag|swd)(?:\/|$)/i

const GERBER_ZIP_NAME_RE = /(?:gerber|gbr|fab[-_]?pkg|fab[-_]?release|pcb[-_]?fab|cam[-_]?out|mfg[-_]?gerber|board[-_]?fab)/i
const BOM_CSV_NAME_RE = /(?:^|[-_.])(?:bom|bill[-_]?of[-_]?materials|cpl|pick[-_]?and[-_]?place|pnp|centroids?)(?:[-_.]|$)/i
const LAB_CSV_NAME_RE = /(?:scope|oscilloscope|logic|saleae|sigrok|waveform|uart|spi|i2c|can[-_]?bus|can[-_]?trace|pwm|adc|dac|calibration|calib|bench|emc|rf[-_]?sweep|jtag|swd|logicdata)/i

const SIGNED_RELEASE_PATH_RE = /(?:^|\/)(?:signed[-_]?releases?|prod(?:uction)?[-_]?releases?|releases?\/signed|releases?\/prod|golden[-_]?images?|factory[-_]?images?|firmware[-_]?vault|secure[-_]?boot|ota[-_]?signed|release[-_]?vault)(?:\/|$)/i
const SIGNED_RELEASE_NAME_RE = /(?:^|[-_.])(?:signed|prod|production|release|factory|golden|ota[-_]?signed|secure[-_]?boot|hab[-_]?signed|fit[-_]?signed|verified)(?:[-_.]|$)/i

const DEBUG_INTERMEDIATE_PATH_RE = /(?:^|\/)(?:build|cmake[-_]?build[^/]*|\.pio\/build|target\/debug|obj|artifacts[-_]?tmp|ci[-_]?artifacts|nightly|nightlies|debug[-_]?builds?|staging|tmp|temp|dev[-_]?builds?)(?:\/|$)/i
const DEBUG_INTERMEDIATE_NAME_RE = /(?:^|[-_.])(?:debug|dbg|nightly|dev|staging|unsigned|unverified|rc\d*|alpha\d*|beta\d*|pre\d*|test[-_]?build|elf[-_]?tmp|draft|tmp|temp|copy\d*)(?:[-_.]|$)/i

const EDA_BACKUP_PATH_RE = /(?:^|\/)(?:[^/]*-backups?|backups?|autosave|history|__history|local[-_]?history|tmp|temp|scratch)(?:\/|$)/i
const EDA_BACKUP_NAME_RE = /(?:[-_.](?:autosave|bak|backup|old|tmp|temp|copy\d*|~\d+)|-\d{4}-\d{2}-\d{2}_\d{6}| \(\d+\))(?=\.[^.]+$)/i

const CALIBRATION_LAB_PATH_RE = /(?:^|\/)(?:calibration|calib|golden[-_]?captures?|reference[-_]?traces?|emc[-_]?cert|fcc[-_]?lab|ce[-_]?compliance|lab[-_]?calibration|bench[-_]?golden|cert[-_]?captures?)(?:\/|$)/i
const CALIBRATION_LAB_NAME_RE = /(?:^|[-_.])(?:calib|calibration|golden[-_]?trace|golden[-_]?ref|reference|emc|fcc|ce[-_]?test|bench[-_]?cal|cert)(?:[-_.]|$)/i

const SCRATCH_CAPTURE_PATH_RE = /(?:^|\/)(?:scratch|scope[-_]?scratch|downloads?|telechargements?|tmp|temp|reexports?|re[-_]?exports?|working|cache)(?:\/|$)/i
const SCRATCH_CAPTURE_NAME_RE = /(?:[-_.](?:scratch|reexport|re[-_]?export|raw[-_]?dump|unsorted|tmp|temp|old|bak|copy\d*)| \(\d+\))(?=\.[^.]+$)/i

const TARGET_MCU_RE = /(?:^|[^a-z0-9])(stm32[a-z0-9]+|esp32(?:[-_]?[sc]\d+)?|nrf5[0-9]{3}|rp2040|rp2350|imx[0-9][a-z0-9]*|samd[0-9]{2}|atmega[0-9]+|attiny[0-9]+|pic[0-9]+[a-z0-9]*|riscv(?:32|64)?|fpga|zynq|rtl87[0-9]{2}|cc26[0-9]{2}|lpc[0-9]{4})(?:[^a-z0-9]|$)/i
const FW_VERSION_RE = /(?:^|[^a-z0-9])(v\d+\.\d+(?:\.\d+)?(?:[-_](?:rc\d+|alpha|beta))?|rev[-_]?[a-z0-9]+|hw[-_]?\d+(?:\.\d+)?)(?:[^a-z0-9]|$)/i

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
export function normalizeIotFirmwareConfig(raw = {}) {
	const input = raw && typeof raw === 'object' ? raw : {}
	const preset = IOT_FIRMWARE_PRESETS.find(item => item.id === input.presetId) || null
	const base = preset ? { ...IOT_FIRMWARE_DEFAULT_CONFIG, ...preset } : { ...IOT_FIRMWARE_DEFAULT_CONFIG }

	const familyFilter = IOT_FIRMWARE_FAMILIES.includes(input.familyFilter)
		? input.familyFilter
		: base.familyFilter
	const verdictFilter = IOT_FIRMWARE_VERDICT_FILTERS.includes(input.verdictFilter)
		? input.verdictFilter
		: base.verdictFilter
	const strategy = IOT_FIRMWARE_STRATEGIES.includes(input.strategy)
		? input.strategy
		: base.strategy
	const survivorRule = IOT_FIRMWARE_SURVIVOR_RULES.includes(input.survivorRule)
		? input.survivorRule
		: base.survivorRule
	const sortMode = IOT_FIRMWARE_SORT_MODES.includes(input.sortMode)
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
		protectEdaSources: typeof input.protectEdaSources === 'boolean'
			? input.protectEdaSources
			: base.protectEdaSources,
		protectSignedReleases: typeof input.protectSignedReleases === 'boolean'
			? input.protectSignedReleases
			: base.protectSignedReleases,
		protectCalibrationLabs: typeof input.protectCalibrationLabs === 'boolean'
			? input.protectCalibrationLabs
			: base.protectCalibrationLabs,
		requireVerifiedReleaseAnchor: typeof input.requireVerifiedReleaseAnchor === 'boolean'
			? input.requireVerifiedReleaseAnchor
			: base.requireVerifiedReleaseAnchor,
		keepRecentBuildDays: normalizeNonNegativeInt(input.keepRecentBuildDays, base.keepRecentBuildDays, 3650),
		minSizeKb: normalizeNonNegativeInt(input.minSizeKb, base.minSizeKb, 10000000),
		memberOverrides,
	}
}

/**
 * Extract the basename from a normalized filesystem path.
 *
 * @param {string} normalizedPath Normalized path.
 * @return {string} File basename.
 */
function extractBasename(normalizedPath) {
	const parts = String(normalizedPath || '').split('/')
	return parts[parts.length - 1] || ''
}

/**
 * Extract the directory portion from a normalized filesystem path.
 *
 * @param {string} normalizedPath Normalized path.
 * @return {string} Parent directory path.
 */
function extractDirname(normalizedPath) {
	const idx = String(normalizedPath || '').lastIndexOf('/')
	return idx > 0 ? String(normalizedPath).slice(0, idx) : ''
}

/**
 * Parse a file mtime value into epoch milliseconds when available.
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
 * Extract target MCU / board identifier (e.g. STM32F407, ESP32-S3, NRF52840, RP2040).
 *
 * @param {string} normalizedPath Normalized path.
 * @param {string} basename File basename.
 * @return {string} Uppercase MCU/board token or empty string.
 */
export function extractHardwareTarget(normalizedPath, basename = '') {
	const baseMatch = String(basename || '').match(TARGET_MCU_RE)
	if (baseMatch) {
		return baseMatch[1].toUpperCase().replace(/_/g, '-')
	}
	const pathMatch = String(normalizedPath || '').match(TARGET_MCU_RE)
	return pathMatch ? pathMatch[1].toUpperCase().replace(/_/g, '-') : ''
}

/**
 * Extract firmware semver or hardware revision tag (e.g. v1.4.2, REV-B).
 *
 * @param {string} normalizedPath Normalized path.
 * @param {string} basename File basename.
 * @return {string} Version/revision tag or empty string.
 */
export function extractFirmwareVersion(normalizedPath, basename = '') {
	const baseMatch = String(basename || '').match(FW_VERSION_RE)
	if (baseMatch) {
		return baseMatch[1].toLowerCase().replace(/_/g, '-')
	}
	const pathMatch = String(normalizedPath || '').match(FW_VERSION_RE)
	return pathMatch ? pathMatch[1].toLowerCase().replace(/_/g, '-') : ''
}

/**
 * Extract a normalized hardware lineage stem for correlating debug builds,
 * autosaves, and scratch captures against signed releases and EDA/lab originals.
 *
 * @param {string} basename File basename.
 * @return {string} Normalized hardware lineage stem.
 */
export function extractHardwareLineageStem(basename) {
	let stem = String(basename || '').trim().toLowerCase()
	stem = stem.replace(/\.(?:bin|hex|elf|uf2|dfu|img|srec|mot|kicad_sch|kicad_pcb|kicad_pro|schdoc|pcbdoc|prjpcb|gbr|drl|gtl|gbl|gto|gbo|gts|gbs|gko|gm1|xlr|sr|sal|vcd|csv|zip)$/i, '')
	stem = stem.replace(/\s+\(\d+\)$/, '')
	stem = stem.replace(/-\d{4}-\d{2}-\d{2}_\d{6}$/, '')
	let prev = ''
	while (stem !== prev) {
		prev = stem
		stem = stem.replace(/[-_.](?:debug|dbg|nightly|dev|staging|unsigned|unverified|rc\d*|alpha\d*|beta\d*|pre\d*|test[-_]?build|signed|prod|production|release|factory|golden|ota[-_]?signed|secure[-_]?boot|hab[-_]?signed|fit[-_]?signed|verified|autosave|bak|backup|calib|calibration|reference|scratch|reexport|re[-_]?export|raw[-_]?dump|unsorted|old|tmp|temp|copy\d*|~\d+)$/i, '')
	}
	return stem || 'unknown-hardware-artifact'
}

/**
 * Extract a concise build or hardware provenance tag.
 *
 * @param {string} lowerBase Lowercase basename.
 * @param {string} lowerPath Lowercase path.
 * @return {string} Provenance tag or empty string.
 */
function extractBuildTag(lowerBase, lowerPath) {
	if (/ota[-_]?signed|secure[-_]?boot|hab[-_]?signed|fit[-_]?signed/i.test(lowerBase)) {
		return 'secure-signed'
	}
	if (SIGNED_RELEASE_NAME_RE.test(lowerBase) || SIGNED_RELEASE_PATH_RE.test(lowerPath)) {
		return 'signed-prod'
	}
	if (/\.kicad_(?:sch|pcb|pro)$/i.test(lowerBase)) {
		return EDA_BACKUP_PATH_RE.test(lowerPath) || EDA_BACKUP_NAME_RE.test(lowerBase)
			? 'kicad-autosave'
			: 'kicad-source'
	}
	if (/\.(?:schdoc|pcbdoc|prjpcb)$/i.test(lowerBase)) {
		return EDA_BACKUP_PATH_RE.test(lowerPath) || EDA_BACKUP_NAME_RE.test(lowerBase)
			? 'altium-backup'
			: 'altium-source'
	}
	if (CALIBRATION_LAB_NAME_RE.test(lowerBase) || CALIBRATION_LAB_PATH_RE.test(lowerPath)) {
		return 'calibration-lab'
	}
	if (DEBUG_INTERMEDIATE_NAME_RE.test(lowerBase) || DEBUG_INTERMEDIATE_PATH_RE.test(lowerPath)) {
		return 'debug-build'
	}
	if (/\.uf2$/i.test(lowerBase)) {
		return 'uf2-flash'
	}
	if (/\.dfu$/i.test(lowerBase)) {
		return 'dfu-image'
	}
	if (/\.srec$|\.mot$/i.test(lowerBase)) {
		return 'motorola-srec'
	}
	if (/\.(?:gbr|drl|gtl|gbl|gto|gbo|gts|gbs|gko|gm1|xlr)$/i.test(lowerBase) || GERBER_ZIP_NAME_RE.test(lowerBase)) {
		return 'gerber-cam'
	}
	if (/\.sr$/i.test(lowerBase)) {
		return 'sigrok-trace'
	}
	if (/\.sal$/i.test(lowerBase)) {
		return 'saleae-logic'
	}
	if (/\.vcd$/i.test(lowerBase)) {
		return 'vcd-waveform'
	}
	if (SCRATCH_CAPTURE_NAME_RE.test(lowerBase) || SCRATCH_CAPTURE_PATH_RE.test(lowerPath)) {
		return 'lab-scratch'
	}
	return ''
}

/**
 * Classify a single duplicate file into the IoT Firmware, Embedded ROM & Hardware Lab domain.
 *
 * @param {object} file Duplicate file entry.
 * @param {number} [referenceNowMs] Reference epoch ms.
 * @return {object} Classification metadata (family === null if outside domain).
 */
export function classifyIotFirmwareFile(file, referenceNowMs = Date.now()) {
	const rawPath = file?.path || file?.name || ''
	const normalized = normalizePathForDiff(rawPath) || String(rawPath || '').replace(/\\/g, '/')
	const lower = normalized.toLowerCase()
	const basename = extractBasename(normalized)
	const lowerBase = basename.toLowerCase()
	const dir = extractDirname(normalized)
	const lowerDir = dir.toLowerCase()

	const targetMcu = extractHardwareTarget(normalized, basename)
	const firmwareVersion = extractFirmwareVersion(normalized, basename)
	const hardwareLineageStem = extractHardwareLineageStem(basename)

	const hasHardwarePathHint = IOT_HARDWARE_PATH_HINT_RE.test(lower) || Boolean(targetMcu)

	const isDirectFirmwareExt = FIRMWARE_DIRECT_EXT_RE.test(lowerBase)
	const isImgFirmwareMatch = FIRMWARE_IMG_EXT_RE.test(lowerBase) && (
		hasHardwarePathHint || FIRMWARE_IMG_NAME_HINT_RE.test(lowerBase)
	)
	const isFirmwareMatch = isDirectFirmwareExt || isImgFirmwareMatch

	const isEdaSourceMatch = EDA_KICAD_ALTIUM_EXT_RE.test(lowerBase)
	const isGerberMatch = GERBER_DIRECT_EXT_RE.test(lowerBase)
		|| (ZIP_EXT_RE.test(lowerBase) && (GERBER_ZIP_NAME_RE.test(lowerBase) || /\/(?:gerbers?|fab[-_]?release|pcb[-_]?fab)\//i.test(lower)))
		|| (CSV_EXT_RE.test(lowerBase) && BOM_CSV_NAME_RE.test(lowerBase) && (hasHardwarePathHint || /bom|cpl|pick[-_]?and[-_]?place/i.test(lowerBase)))

	const isLabCaptureMatch = LAB_CAPTURE_DIRECT_EXT_RE.test(lowerBase)
		|| (CSV_EXT_RE.test(lowerBase) && !BOM_CSV_NAME_RE.test(lowerBase) && (
			LAB_CSV_NAME_RE.test(lowerBase)
			|| /\/(?:oscilloscope|logic[-_]?analyzer|saleae|sigrok|calibration|calib|bench[-_]?tests?|emc[-_]?lab)\//i.test(lower)
		))

	const inDomain = Boolean(isFirmwareMatch || isEdaSourceMatch || isGerberMatch || isLabCaptureMatch)

	const isMutableFile = MUTABLE_HARDWARE_EXT_RE.test(lowerBase)
	const isDebugPath = DEBUG_INTERMEDIATE_PATH_RE.test(lower)
	const isDebugName = DEBUG_INTERMEDIATE_NAME_RE.test(lowerBase)
	const isSignedPath = SIGNED_RELEASE_PATH_RE.test(lower)
	const isSignedName = SIGNED_RELEASE_NAME_RE.test(lowerBase)
	const isEdaBackup = EDA_BACKUP_PATH_RE.test(lower) || EDA_BACKUP_NAME_RE.test(lowerBase)
	const isCalibPath = CALIBRATION_LAB_PATH_RE.test(lower)
	const isCalibName = CALIBRATION_LAB_NAME_RE.test(lowerBase)
	const isScratchPath = SCRATCH_CAPTURE_PATH_RE.test(lower)
	const isScratchName = SCRATCH_CAPTURE_NAME_RE.test(lowerBase)

	let family = null
	let artifactKind = 'unknown'

	if (inDomain) {
		if (isEdaSourceMatch) {
			family = 'eda-kicad-altium-sources'
			if (isEdaBackup) {
				artifactKind = 'eda-autosave-backup'
			} else if (/\.(?:schdoc|pcbdoc|prjpcb)$/i.test(lowerBase)) {
				artifactKind = 'altium-pcb-schematic'
			} else {
				artifactKind = 'kicad-pcb-schematic'
			}
		} else if (isFirmwareMatch) {
			family = 'firmware-rom-images'
			if (isDebugPath || isDebugName || isScratchPath || isScratchName) {
				artifactKind = /\.elf$/i.test(lowerBase) ? 'debug-elf-symbols' : 'intermediate-debug-firmware'
			} else if (isSignedPath || isSignedName) {
				artifactKind = 'signed-production-firmware'
			} else if (/\.uf2$|\.dfu$/i.test(lowerBase)) {
				artifactKind = 'bootloader-flash-image'
			} else if (/\.hex$|\.srec$|\.mot$/i.test(lowerBase)) {
				artifactKind = 'embedded-rom-hex-srec'
			} else {
				artifactKind = 'firmware-binary-image'
			}
		} else if (isGerberMatch) {
			family = 'gerber-bom-fab-packages'
			if (isScratchPath || isScratchName || isDebugPath || isEdaBackup) {
				artifactKind = 'gerber-staging-reexport'
			} else if (CSV_EXT_RE.test(lowerBase)) {
				artifactKind = 'pcb-bom-cpl-table'
			} else if (ZIP_EXT_RE.test(lowerBase)) {
				artifactKind = 'gerber-fab-archive'
			} else {
				artifactKind = 'gerber-drill-layer'
			}
		} else {
			family = 'lab-scope-logic-captures'
			if ((isCalibPath || isCalibName) && !isScratchPath && !isScratchName) {
				artifactKind = 'calibration-lab-golden-capture'
			} else if (isScratchPath || isScratchName || isDebugPath || isDebugName) {
				artifactKind = 'scope-scratch-capture'
			} else if (/\.sr$|\.sal$/i.test(lowerBase)) {
				artifactKind = 'logic-analyzer-trace'
			} else if (/\.vcd$/i.test(lowerBase)) {
				artifactKind = 'vcd-signal-dump'
			} else {
				artifactKind = 'oscilloscope-csv-trace'
			}
		}
	}

	const mtimeMs = extractMtimeMs(file)
	const ageDays = mtimeMs !== null && Number.isFinite(referenceNowMs)
		? Math.max(0, Math.floor((referenceNowMs - mtimeMs) / 86400000))
		: null

	const isScratchOrDebugMarker = isDebugPath || isDebugName || isScratchPath || isScratchName || isEdaBackup

	const isSignedRelease = family === 'firmware-rom-images'
		&& (isSignedPath || isSignedName)
		&& !isScratchOrDebugMarker

	const isEdaSource = family === 'eda-kicad-altium-sources' && !isEdaBackup

	const isCalibrationLab = (family === 'lab-scope-logic-captures' || family === 'firmware-rom-images')
		&& (isCalibPath || isCalibName)
		&& !isDebugPath
		&& !isDebugName
		&& !isScratchPath
		&& !isScratchName

	const isIntermediateDebugBuild = family === 'firmware-rom-images'
		&& !isSignedRelease
		&& !isCalibrationLab
		&& (isDebugPath || isDebugName)

	const isScratchCaptureOrBackup = inDomain
		&& !isSignedRelease
		&& !isEdaSource
		&& !isCalibrationLab
		&& !isIntermediateDebugBuild
		&& (isEdaBackup || isScratchPath || isScratchName || isDebugPath || isDebugName)

	const buildTag = extractBuildTag(lowerBase, lower)

	const hardwareRole = isSignedRelease
		? 'signed-production-release'
		: (isEdaSource
			? 'canonical-eda-source'
			: (isCalibrationLab
				? 'calibration-lab-golden'
				: (isIntermediateDebugBuild
					? 'intermediate-debug-build'
					: (isScratchCaptureOrBackup ? 'scratch-capture-or-backup' : 'hardware-vault-copy'))))

	return {
		family,
		artifactKind,
		hardwareRole,
		normalized,
		lower,
		basename,
		lowerBase,
		dir,
		lowerDir,
		targetMcu,
		firmwareVersion,
		hardwareLineageStem,
		buildTag,
		isSignedRelease,
		isEdaSource,
		isCalibrationLab,
		isIntermediateDebugBuild,
		isScratchCaptureOrBackup,
		isMutableFile,
		isScratchOrDebugMarker,
		size: Number(file?.size) || 0,
		mtimeMs,
		ageDays,
		formattedMtime: formatFileModifiedTime(file),
	}
}

/**
 * Determine whether a duplicate group belongs to the IoT Firmware, Embedded ROM & Hardware Lab domain.
 *
 * @param {object} group Duplicate group.
 * @return {boolean} True when at least one file matches the domain.
 */
export function isIotFirmwareGroup(group) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return false
	}
	return group.files.some(file => classifyIotFirmwareFile(file).family !== null)
}

/**
 * Build a cross-vault hardware correlation index linking intermediate/debug builds and scratch
 * captures to conserved signed production releases, canonical KiCad/Altium sources, and calibration labs.
 *
 * @param {Array<object>} groups Domain duplicate groups.
 * @return {object} Correlation index.
 */
function buildIotFirmwareCorrelationIndex(groups) {
	const verifiedReleaseStems = new Set()
	const verifiedMcuTargets = new Set()
	const debugVariantsByStem = new Map()

	for (const group of groups) {
		for (const file of group.files || []) {
			const meta = classifyIotFirmwareFile(file)
			if (!meta.family) {
				continue
			}
			if (meta.isSignedRelease || meta.isEdaSource || meta.isCalibrationLab) {
				verifiedReleaseStems.add(meta.hardwareLineageStem)
				if (meta.targetMcu) {
					verifiedMcuTargets.add(meta.targetMcu)
				}
			}
			if (meta.isIntermediateDebugBuild || meta.isScratchCaptureOrBackup) {
				debugVariantsByStem.set(
					meta.hardwareLineageStem,
					(debugVariantsByStem.get(meta.hardwareLineageStem) || 0) + 1
				)
			}
		}
	}

	return {
		verifiedReleaseStems,
		verifiedMcuTargets,
		debugVariantsByStem,
	}
}

/**
 * Resolve the primary governance family of a cluster across its classified members.
 *
 * @param {Array<object>} members Classified members.
 * @return {string} Family ID.
 */
function resolveClusterFamily(members) {
	if (members.some(m => m.family === 'eda-kicad-altium-sources')) {
		return 'eda-kicad-altium-sources'
	}
	if (members.some(m => m.family === 'firmware-rom-images')) {
		return 'firmware-rom-images'
	}
	if (members.some(m => m.family === 'gerber-bom-fab-packages')) {
		return 'gerber-bom-fab-packages'
	}
	return 'lab-scope-logic-captures'
}

/**
 * Compute deterministic survivor priority score for a cluster member.
 *
 * @param {object} member Classified member.
 * @param {string} survivorRule Survivor rule.
 * @return {number} Priority score (higher wins).
 */
function scoreMemberForSurvivor(member, survivorRule) {
	const mtimeScore = member.mtimeMs !== null ? member.mtimeMs / 1e10 : 0
	const shortPathScore = 1000 - Math.min(999, member.normalized.length)

	if (survivorRule === 'oldest-golden-first') {
		const oldestScore = member.mtimeMs !== null ? -mtimeScore : 0
		return (member.isSignedRelease ? 65000 : 0)
			+ (member.isEdaSource ? 62000 : 0)
			+ (member.isCalibrationLab ? 60000 : 0)
			+ (member.isScratchOrDebugMarker ? -35000 : 0)
			+ oldestScore
			+ shortPathScore
	}

	if (survivorRule === 'newest-verified-release') {
		return (member.isSignedRelease ? 50000 : 0)
			+ (member.isEdaSource ? 45000 : 0)
			+ (member.isCalibrationLab ? 40000 : 0)
			+ (member.isScratchOrDebugMarker ? -30000 : 0)
			+ mtimeScore
	}

	if (survivorRule === 'shortest-path') {
		return (member.isIntermediateDebugBuild || member.isScratchCaptureOrBackup ? -3000 : 0)
			+ shortPathScore
	}

	return (member.isSignedRelease ? 75000 : 0)
		+ (member.isEdaSource ? 72000 : 0)
		+ (member.isCalibrationLab ? 68000 : 0)
		+ (member.isIntermediateDebugBuild ? -35000 : 0)
		+ (member.isScratchCaptureOrBackup ? -30000 : 0)
		+ shortPathScore
}

/**
 * Audit a single IoT Firmware, Embedded ROM & Hardware Lab duplicate cluster.
 *
 * @param {object} group Duplicate group.
 * @param {object} correlationIndex Hardware vault correlation index.
 * @param {object} config Normalized configuration.
 * @param {number} referenceNowMs Reference epoch ms.
 * @return {object|null} Audited cluster entry or null if outside domain.
 */
function auditSingleCluster(group, correlationIndex, config, referenceNowMs) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return null
	}

	const rawMembers = group.files.map((file, index) => {
		const meta = classifyIotFirmwareFile(file, referenceNowMs)
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
	const primaryMcu = rawMembers.find(m => m.targetMcu)?.targetMcu || ''
	const primaryVersion = rawMembers.find(m => m.firmwareVersion)?.firmwareVersion || ''
	const primaryStem = rawMembers[0].hardwareLineageStem || extractHardwareLineageStem(primaryName)
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

	const hasVerifiedReleaseAnchor = Boolean(
		survivor.isSignedRelease
		|| survivor.isEdaSource
		|| survivor.isCalibrationLab
		|| correlationIndex.verifiedReleaseStems.has(primaryStem)
		|| (primaryMcu && correlationIndex.verifiedMcuTargets.has(primaryMcu))
	)

	let reclaimableBytes = 0
	let hardlinkSavingsBytes = 0
	let deleteTargetsCount = 0
	let hardlinkTargetsCount = 0
	let shieldedCount = 0

	const members = rawMembers.map((member) => {
		const isSurvivor = member.key === survivorKey
		const override = config.memberOverrides?.[member.key] || 'auto'
		let governanceTier = 'scratch-capture-or-backup'
		let shielded = false
		let protectedReason = ''
		let action = 'keep'

		if (override === 'keep' && !isSurvivor) {
			governanceTier = member.isSignedRelease
				? 'signed-release-protected'
				: (member.isEdaSource
					? 'eda-source-protected'
					: (member.isCalibrationLab ? 'calibration-lab-protected' : 'scratch-capture-or-backup'))
			shielded = true
			protectedReason = 'Manually shielded via per-copy override'
		} else if (member.isSignedRelease && config.protectSignedReleases) {
			governanceTier = 'signed-release-protected'
			shielded = true
			protectedReason = 'Signed production firmware release strictly conserved'
		} else if (member.isEdaSource && config.protectEdaSources) {
			governanceTier = 'eda-source-protected'
			shielded = true
			protectedReason = 'KiCad / Altium schematic & PCB source strictly conserved'
		} else if (member.isCalibrationLab && config.protectCalibrationLabs) {
			governanceTier = 'calibration-lab-protected'
			shielded = true
			protectedReason = 'Calibration lab golden capture strictly conserved'
		} else if (isSurvivor) {
			governanceTier = member.isSignedRelease
				? 'signed-release-protected'
				: (member.isEdaSource
					? 'eda-source-protected'
					: (member.isCalibrationLab
						? 'calibration-lab-protected'
						: (member.isIntermediateDebugBuild ? 'intermediate-debug-build' : 'scratch-capture-or-backup')))
			shielded = true
			protectedReason = 'Canonical hardware & firmware survivor retained'
		} else if (override === 'prune') {
			governanceTier = member.isIntermediateDebugBuild ? 'intermediate-debug-build' : 'scratch-capture-or-backup'
			action = config.strategy === 'hardlink-immutable-releases' && !member.isMutableFile && !survivor.isEdaSource
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
		} else if (member.isSignedRelease) {
			governanceTier = 'signed-release-protected'
			action = 'delete'
			reclaimableBytes += member.size
			deleteTargetsCount += 1
		} else if (member.isEdaSource) {
			governanceTier = 'eda-source-protected'
			action = 'delete'
			reclaimableBytes += member.size
			deleteTargetsCount += 1
		} else if (member.isCalibrationLab) {
			governanceTier = 'calibration-lab-protected'
			action = 'delete'
			reclaimableBytes += member.size
			deleteTargetsCount += 1
		} else if (
			config.keepRecentBuildDays > 0
			&& member.ageDays !== null
			&& member.ageDays < config.keepRecentBuildDays
		) {
			governanceTier = member.isIntermediateDebugBuild ? 'intermediate-debug-build' : 'scratch-capture-or-backup'
			shielded = true
			protectedReason = `Within ${config.keepRecentBuildDays}-day lab build grace window`
		} else if (member.isIntermediateDebugBuild) {
			governanceTier = 'intermediate-debug-build'
			if (config.requireVerifiedReleaseAnchor && !hasVerifiedReleaseAnchor) {
				shielded = true
				protectedReason = 'Blocked until a signed production release or canonical hardware anchor is verified'
			} else if (config.strategy === 'hardlink-immutable-releases' && !member.isMutableFile && !survivor.isEdaSource) {
				action = 'hardlink'
				hardlinkSavingsBytes += member.size
				hardlinkTargetsCount += 1
				reclaimableBytes += member.size
			} else {
				action = 'delete'
				deleteTargetsCount += 1
				reclaimableBytes += member.size
			}
		} else if (config.strategy === 'hardlink-immutable-releases' && !member.isMutableFile && !survivor.isEdaSource) {
			governanceTier = 'scratch-capture-or-backup'
			action = 'hardlink'
			hardlinkSavingsBytes += member.size
			reclaimableBytes += member.size
			hardlinkTargetsCount += 1
		} else if (config.requireVerifiedReleaseAnchor && !hasVerifiedReleaseAnchor) {
			governanceTier = 'scratch-capture-or-backup'
			shielded = true
			protectedReason = 'Blocked until a signed production release, EDA source, or calibration anchor is verified'
		} else {
			governanceTier = member.isIntermediateDebugBuild ? 'intermediate-debug-build' : 'scratch-capture-or-backup'
			action = 'delete'
			reclaimableBytes += member.size
			deleteTargetsCount += 1
		}

		if (shielded) {
			shieldedCount += 1
		}

		return {
			...member,
			isSurvivor,
			governanceTier,
			shielded,
			protectedReason,
			action,
		}
	})

	let clusterVerdict = 'scratch-capture-or-backup'
	if (members.some(m => m.governanceTier === 'signed-release-protected')) {
		clusterVerdict = 'signed-release-protected'
	} else if (members.some(m => m.governanceTier === 'eda-source-protected')) {
		clusterVerdict = 'eda-source-protected'
	} else if (members.some(m => m.governanceTier === 'calibration-lab-protected')) {
		clusterVerdict = 'calibration-lab-protected'
	} else if (members.some(m => m.governanceTier === 'intermediate-debug-build')) {
		clusterVerdict = 'intermediate-debug-build'
	}

	const hasReclaimable = (deleteTargetsCount + hardlinkTargetsCount) > 0
	const buildTags = Array.from(new Set(members.map(m => m.buildTag).filter(Boolean)))
	const crossGroupDebugVariantsCount = correlationIndex.debugVariantsByStem.get(primaryStem) || 0

	const riskScore = (clusterVerdict === 'signed-release-protected' ? 100 : 0)
		+ (clusterVerdict === 'eda-source-protected' ? 96 : 0)
		+ (clusterVerdict === 'calibration-lab-protected' ? 92 : 0)
		+ (clusterVerdict === 'intermediate-debug-build' ? 76 : 0)
		+ (hasReclaimable ? 20 : 0)

	return {
		id: group.id ?? primaryName,
		hash: group.hash || '',
		name: primaryName,
		targetMcu: primaryMcu,
		firmwareVersion: primaryVersion,
		hardwareLineageStem: primaryStem,
		family,
		familyLabel: IOT_FIRMWARE_FAMILY_META[family]?.label || family,
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
		hasSignedRelease: members.some(m => m.governanceTier === 'signed-release-protected'),
		hasEdaSource: members.some(m => m.governanceTier === 'eda-source-protected'),
		hasCalibrationLab: members.some(m => m.governanceTier === 'calibration-lab-protected'),
		hasIntermediateDebugBuild: members.some(m => m.isIntermediateDebugBuild) || crossGroupDebugVariantsCount > 0,
		hasScratchCaptureOrBackup: members.some(m => m.isScratchCaptureOrBackup),
		hasVerifiedReleaseAnchor,
		crossGroupDebugVariantsCount,
		buildTags,
		members,
		group,
	}
}

/**
 * Audit duplicate groups across IoT Firmware, Embedded ROM & Hardware Lab vaults.
 *
 * @param {Array<object>} groups Duplicate groups.
 * @param {object} [rawConfig] Audit configuration overrides.
 * @param {number} [referenceNowMs] Reference epoch ms for deterministic tests.
 * @return {object} Complete audit report with summary, family counts, and filtered clusters.
 */
export function auditIotFirmwareVault(groups, rawConfig = {}, referenceNowMs = Date.now()) {
	const config = normalizeIotFirmwareConfig(rawConfig)
	const sourceGroups = Array.isArray(groups) ? groups : []
	const domainGroups = sourceGroups.filter(isIotFirmwareGroup)
	const correlationIndex = buildIotFirmwareCorrelationIndex(domainGroups)

	const allClusters = domainGroups
		.map(group => auditSingleCluster(group, correlationIndex, config, referenceNowMs))
		.filter(Boolean)

	const minSizeBytes = config.minSizeKb * 1024
	const sizeFiltered = allClusters.filter(cluster => cluster.unitBytes >= minSizeBytes)

	const familyCounts = {
		all: sizeFiltered.length,
		'firmware-rom-images': 0,
		'eda-kicad-altium-sources': 0,
		'gerber-bom-fab-packages': 0,
		'lab-scope-logic-captures': 0,
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
		if (
			config.verdictFilter !== 'all'
			&& config.verdictFilter !== 'reclaimable'
			&& config.verdictFilter !== 'shielded'
			&& cluster.clusterVerdict !== config.verdictFilter
		) {
			return false
		}
		if (query.length > 0) {
			const matchesName = cluster.name.toLowerCase().includes(query)
			const matchesStem = cluster.hardwareLineageStem.toLowerCase().includes(query)
			const matchesMcu = cluster.targetMcu.toLowerCase().includes(query)
			const matchesVer = cluster.firmwareVersion.toLowerCase().includes(query)
			const matchesTag = cluster.buildTags.some(tag => tag.toLowerCase().includes(query))
			const matchesMember = cluster.members.some(m => m.lower.includes(query))
			if (!matchesName && !matchesStem && !matchesMcu && !matchesVer && !matchesTag && !matchesMember) {
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
	let totalSignedReleaseClusters = 0
	let totalEdaSourceClusters = 0
	let totalCalibrationLabClusters = 0
	let totalDebugBuildClusters = 0
	let totalScratchBackupClusters = 0

	for (const cluster of filteredClusters) {
		rawDuplicateBytes += Math.max(0, cluster.totalBytes - cluster.unitBytes)
		reclaimableBytes += cluster.reclaimableBytes
		totalReclaimableCopiesCount += cluster.reclaimableTargetsCount
		totalShieldedCopiesCount += cluster.shieldedCount

		if (cluster.hasSignedRelease) {
			totalSignedReleaseClusters += 1
		}
		if (cluster.hasEdaSource) {
			totalEdaSourceClusters += 1
		}
		if (cluster.hasCalibrationLab) {
			totalCalibrationLabClusters += 1
		}
		if (cluster.hasIntermediateDebugBuild) {
			totalDebugBuildClusters += 1
		}
		if (cluster.hasScratchCaptureOrBackup) {
			totalScratchBackupClusters += 1
		}
	}

	const efficiencyPct = rawDuplicateBytes > 0
		? Math.min(100, Math.round((reclaimableBytes / rawDuplicateBytes) * 100))
		: 0

	const reclaimableGb = `${(reclaimableBytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`

	const familyBreakdown = IOT_FIRMWARE_FAMILIES
		.filter(id => id !== 'all')
		.map(id => ({
			id,
			label: IOT_FIRMWARE_FAMILY_META[id].label,
			shortLabel: IOT_FIRMWARE_FAMILY_META[id].shortLabel,
			clustersCount: familyCounts[id] || 0,
		}))

	return {
		schema: IOT_FIRMWARE_VAULT_SCHEMA,
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
			totalSignedReleaseClusters,
			totalEdaSourceClusters,
			totalCalibrationLabClusters,
			totalDebugBuildClusters,
			totalScratchBackupClusters,
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
 * Build a safe POSIX DRY_RUN=1 remediation script for IoT Firmware & Hardware Lab vaults.
 * Strictly blocks deletion or hardlinking of shielded signed releases, KiCad/Altium sources,
 * and calibration lab captures, and never hardlinks mutable EDA or CSV files.
 *
 * @param {object} auditResult Result from auditIotFirmwareVault.
 * @return {string} POSIX bash script.
 */
export function buildIotFirmwareRemediationScript(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# IoT Firmware, Embedded ROM & Hardware Lab Vault Auditor',
		'# Safe POSIX Remediation Script (default DRY_RUN=1)',
		'# Run with DRY_RUN=0 ./iot-firmware-vault-reclaim.sh only after verifying signed releases, KiCad/Altium sources, and calibration labs.',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'QUARANTINE_DIR="$' + '{QUARANTINE_DIR:-./.iot-firmware-quarantine}"',
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
	const strategy = auditResult?.config?.strategy || 'prune-debug-and-scratch'
	for (const cluster of clusters) {
		const actions = (cluster.members || []).filter(m => !m.shielded && (m.action === 'delete' || m.action === 'hardlink'))
		if (actions.length === 0) {
			continue
		}
		lines.push(`# Cluster: ${cluster.name} | Family: ${cluster.familyLabel} | Survivor: ${cluster.survivorPath}`)
		for (const target of actions) {
			actionCount += 1
			if (target.action === 'hardlink' && !target.isMutableFile) {
				lines.push(`run_cmd ln -f ${quotePosixPath(cluster.survivorPath)} ${quotePosixPath(target.normalized)}`)
			} else if (strategy === 'quarantine-debug-and-captures') {
				lines.push('run_cmd mkdir -p "$QUARANTINE_DIR"')
				lines.push(`run_cmd mv -n ${quotePosixPath(target.normalized)} "$QUARANTINE_DIR/"`)
			} else {
				lines.push(`run_cmd rm -f ${quotePosixPath(target.normalized)}`)
			}
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('printf "No reclaimable debug builds or scratch captures under current hardware vault protections.\\n"')
	} else {
		lines.push(`printf "Completed IoT Firmware & Hardware Lab Vault remediation plan (%d target actions, DRY_RUN=%s).\\n" "${actionCount}" "$DRY_RUN"`)
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe RFC-4180 CSV audit report.
 *
 * @param {object} auditResult Result from auditIotFirmwareVault.
 * @return {string} RFC-4180 CSV string.
 */
export function buildIotFirmwareCsvReport(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const headers = [
		'cluster_id',
		'cluster_name',
		'target_mcu_board',
		'firmware_version',
		'hardware_lineage_stem',
		'family',
		'cluster_verdict',
		'member_path',
		'artifact_kind',
		'hardware_role',
		'build_tag',
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
				cluster.targetMcu || '',
				cluster.firmwareVersion || '',
				cluster.hardwareLineageStem,
				cluster.family,
				cluster.clusterVerdict,
				member.normalized,
				member.artifactKind,
				member.hardwareRole,
				member.buildTag || '',
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
 * @param {object} auditResult Result from auditIotFirmwareVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildIotFirmwareJsonManifest(auditResult) {
	const payload = {
		schema: IOT_FIRMWARE_VAULT_SCHEMA,
		generatedAt: new Date().toISOString(),
		config: auditResult?.config || IOT_FIRMWARE_DEFAULT_CONFIG,
		summary: auditResult?.summary || {},
		clusters: (auditResult?.clusters || []).map(cluster => ({
			id: cluster.id,
			name: cluster.name,
			targetMcu: cluster.targetMcu,
			firmwareVersion: cluster.firmwareVersion,
			hardwareLineageStem: cluster.hardwareLineageStem,
			family: cluster.family,
			clusterVerdict: cluster.clusterVerdict,
			unitBytes: cluster.unitBytes,
			totalBytes: cluster.totalBytes,
			reclaimableBytes: cluster.reclaimableBytes,
			survivorPath: cluster.survivorPath,
			hasSignedRelease: cluster.hasSignedRelease,
			hasEdaSource: cluster.hasEdaSource,
			hasCalibrationLab: cluster.hasCalibrationLab,
			hasIntermediateDebugBuild: cluster.hasIntermediateDebugBuild,
			hasScratchCaptureOrBackup: cluster.hasScratchCaptureOrBackup,
			hasVerifiedReleaseAnchor: cluster.hasVerifiedReleaseAnchor,
			crossGroupDebugVariantsCount: cluster.crossGroupDebugVariantsCount,
			buildTags: cluster.buildTags,
			members: (cluster.members || []).map(member => ({
				path: member.normalized,
				artifactKind: member.artifactKind,
				hardwareRole: member.hardwareRole,
				buildTag: member.buildTag || '',
				governanceTier: member.governanceTier,
				action: member.action,
				shielded: member.shielded,
				protectedReason: member.protectedReason,
				isSurvivor: member.isSurvivor,
				size: member.size,
			})),
		})),
	}
	return JSON.stringify(payload, null, 2)
}

/**
 * Generate a Nextcloud/rsync .sync-exclude.lst rule set for intermediate firmware build trees,
 * KiCad/Altium autosaves and lockfiles, and temporary oscilloscope/logic scratch captures.
 *
 * @return {string} Line-delimited .sync-exclude.lst rules.
 */
export function buildIotFirmwareSyncExcludeList() {
	return [
		'# Nextcloud / rsync exclusion rules for IoT Firmware Build Trees, EDA Autosaves & Lab Scratch',
		'.pio/build/',
		'cmake-build-*/',
		'target/debug/',
		'*-backups/',
		'__history/',
		'*.lck',
		'~*.kicad_pcb',
		'~*.kicad_sch',
		'*_autosave.*',
		'*_debug.bin',
		'*_debug.elf',
		'*_nightly.bin',
		'*_scratch.sr',
		'*_scratch.sal',
		'scope_scratch/',
		'*.tmp',
	].join('\n')
}
