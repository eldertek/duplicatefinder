/**
 * Pure Astronomy, FITS Astrophotography & Radio Interferometry Vault Auditor.
 * Classifies and audits duplicate clusters across 4 Astronomy & Interferometry Vault families:
 * - FITS Masters, WCS & Observatory Holds (MasterDark, MasterFlat, MasterBias, BPM, .wcs, .axy, .rdls, .corr, .asdf, .vot, .ecsv, ESO / ALMA / JWST MAST / NRAO VLA / SKA / LOFAR / Rubin LSST proprietary holds)
 * - Raw Subframes, SER & Radio Visibilities (.fits, .fit, .fts, .fz, .xisf, .ser, .adv, .oifits, .uvfits, .uvf, .sdfits, .vdif, .dada, .katdal, CASA .ms, SIGPROC .fil, PSRFITS .sf, FITS-IDI .idi, .phd2, astro RAW frames)
 * - Redundant Stretches, Quicklooks & Catalogs (non-linear stretched .png/.jpg/.webp/.tif/.mp4/.mov/.gif, .csv/.tsv/.txt/.reg/.kml when a verified FITS/XISF/SER/MS/UVFITS master anchor exists)
 * - PixInsight, Siril & CASA Scratch (wbpp_cache/, pixinsight_swap/, siril_process/, siril_tmp/, dss_autosave/, app_temp/, astap_tmp/, casa_scratch/, wsclean_tmp/, imager_tmp/, pp_/r_pp_/bkg_pp_ intermediates, .xisf.tmp, .fits.tmp, .ms.tmp, .lck)
 *
 * Enforces strict Observatory Embargo, Master Calibration, and Raw Subframe / Visibility conservation defaults:
 * - Strictly conserves ESO/ALMA/JWST/NRAO/SKA/LOFAR proprietary & archival observatory holds
 * - Strictly conserves MasterDark/MasterFlat/MasterBias/Superbias, WCS astrometry solutions, and ASDF/VOTable metadata standards
 * - Strictly conserves verified raw FITS/XISF/SER subframes and CASA MeasurementSet / UVFITS / OIFITS / VDIF radio visibility masters
 * - Detects redundant stretched/tone-mapped renders and catalog exports when a verified FITS/XISF/SER/MS/UVFITS master anchor exists
 * - Blocks pruning of stretched renders or catalog exports lacking a verified raw astronomical anchor when guard is active
 * - Blocks hardlinks on mutable CSV/TXT/JSON/XML/WCS/ASDF/MS/scratch files
 *
 * Generates DRY_RUN=1 POSIX remediation scripts, CWE-1236-safe CSV reports, JSON audit
 * manifests, and .sync-exclude.lst rules. Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const ASTRONOMY_FITS_INTERFEROMETRY_VAULT_SCHEMA = 'duplicatefinder.astronomy-fits-interferometry-vault-auditor.v1'

export const ASTRONOMY_FITS_FAMILIES = Object.freeze([
	'all',
	'fits-calibration-observatory-standards',
	'raw-subframe-interferometry-masters',
	'redundant-astro-stretch-exports',
	'pixinsight-siril-casa-scratch',
])

export const ASTRONOMY_FITS_FAMILY_META = Object.freeze({
	'fits-calibration-observatory-standards': {
		id: 'fits-calibration-observatory-standards',
		label: 'FITS Masters, WCS & Observatory',
		shortLabel: 'Master Calibrations, WCS & Standards (MasterDark/Flat/Bias, .wcs, .axy, .asdf, .vot, .ecsv, ALMA/ESO/JWST/NRAO)',
	},
	'raw-subframe-interferometry-masters': {
		id: 'raw-subframe-interferometry-masters',
		label: 'Raw Subframes & Visibilities',
		shortLabel: 'Verified Raw Masters (.fits, .fit, .fz, .xisf, .ser, .adv, .ms, .uvfits, .oifits, .vdif, .dada, .fil)',
	},
	'redundant-astro-stretch-exports': {
		id: 'redundant-astro-stretch-exports',
		label: 'Redundant Stretches & Catalogs',
		shortLabel: 'Derived Exports (stretched .png/.jpg/.tif/.mp4, .csv/.reg/.kml when FITS/XISF/MS anchor exists)',
	},
	'pixinsight-siril-casa-scratch': {
		id: 'pixinsight-siril-casa-scratch',
		label: 'WBPP, Siril & CASA Scratch',
		shortLabel: 'Processing Scratch (wbpp_cache/, pixinsight_swap/, siril_tmp/, casa_scratch/, pp_/r_pp_, .xisf.tmp, .ms.tmp)',
	},
})

export const ASTRONOMY_FITS_STRATEGIES = Object.freeze([
	'prune-exports-and-astro-scratch',
	'hardlink-immutable-fits-and-ms',
	'quarantine-exports-and-astro-scratch',
])

export const ASTRONOMY_FITS_SURVIVOR_RULES = Object.freeze([
	'fits-calibration-master-first',
	'oldest-observation-first',
	'newest-reduction-first',
	'shortest-path',
])

export const ASTRONOMY_FITS_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'astro-std-protected',
	'raw-subframe-interferometry-protected',
	'observatory-embargo-protected',
	'astro-export-redundant',
	'astro-scratch-intermediate',
	'shielded',
])

export const ASTRONOMY_FITS_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const ASTRONOMY_FITS_PRESETS = Object.freeze([
	{
		id: 'all-astronomy-fits-audit',
		name: 'All Astronomy & FITS Vaults',
		description: 'Audit MasterDark/Flat/Bias frames, WCS/ASDF/IVOA observatory holds, raw FITS/XISF/SER subframes, CASA MS/UVFITS/OIFITS visibilities, stretched quicklooks, and WBPP/Siril/CASA scratch.',
		familyFilter: 'all',
		strategy: 'prune-exports-and-astro-scratch',
		survivorRule: 'fits-calibration-master-first',
		protectCalibrationAndWcsStandards: true,
		protectRawSubframeAndInterferometryMasters: true,
		protectObservatoryEmbargoEvidence: true,
		requireAstroAnchorForPrune: true,
		keepRecentSessionDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'astro-processing-scratch-cleanup',
		name: 'WBPP, Siril & CASA Scratch',
		description: 'Reclaim wbpp_cache/, pixinsight_swap/, siril_tmp/, dss_autosave/, casa_scratch/, pp_/r_pp_ intermediates, and .xisf.tmp/.ms.tmp scratch older than the active imaging run grace window.',
		familyFilter: 'all',
		strategy: 'prune-exports-and-astro-scratch',
		survivorRule: 'fits-calibration-master-first',
		protectCalibrationAndWcsStandards: true,
		protectRawSubframeAndInterferometryMasters: true,
		protectObservatoryEmbargoEvidence: true,
		requireAstroAnchorForPrune: true,
		keepRecentSessionDays: 14,
		minSizeKb: 0,
	},
	{
		id: 'redundant-stretch-vs-fits-ms',
		name: 'Redundant Stretches vs FITS/MS',
		description: 'Detect stretched PNG/JPG/TIF/MP4 quicklooks and CSV/DS9 exports backed by a verified FITS, XISF, SER, CASA MS, UVFITS, or OIFITS master anchor.',
		familyFilter: 'redundant-astro-stretch-exports',
		strategy: 'quarantine-exports-and-astro-scratch',
		survivorRule: 'fits-calibration-master-first',
		protectCalibrationAndWcsStandards: true,
		protectRawSubframeAndInterferometryMasters: true,
		protectObservatoryEmbargoEvidence: true,
		requireAstroAnchorForPrune: true,
		keepRecentSessionDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'fits-calibration-observatory-shield',
		name: 'Calibrations & Observatory Shield',
		description: 'Inspect MasterDark/Flat/Bias calibrations, WCS/ASDF/IVOA tables, and ESO, ALMA, JWST MAST, NRAO VLA, LOFAR, and Rubin LSST embargoed archives under strict shield.',
		familyFilter: 'fits-calibration-observatory-standards',
		strategy: 'hardlink-immutable-fits-and-ms',
		survivorRule: 'fits-calibration-master-first',
		protectCalibrationAndWcsStandards: true,
		protectRawSubframeAndInterferometryMasters: true,
		protectObservatoryEmbargoEvidence: true,
		requireAstroAnchorForPrune: true,
		keepRecentSessionDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'raw-subframe-radio-visibilities',
		name: 'Raw Subframes & Radio Visibilities',
		description: 'Audit raw FITS/FIT/FZ/XISF light frames, SER/ADV lucky-imaging streams, CASA MeasurementSets, UVFITS/OIFITS interferometry, and VDIF/DADA/PSRFITS radio masters.',
		familyFilter: 'raw-subframe-interferometry-masters',
		strategy: 'hardlink-immutable-fits-and-ms',
		survivorRule: 'fits-calibration-master-first',
		protectCalibrationAndWcsStandards: true,
		protectRawSubframeAndInterferometryMasters: true,
		protectObservatoryEmbargoEvidence: true,
		requireAstroAnchorForPrune: true,
		keepRecentSessionDays: 0,
		minSizeKb: 0,
	},
])

export const ASTRONOMY_FITS_DEFAULT_CONFIG = Object.freeze({
	presetId: 'all-astronomy-fits-audit',
	familyFilter: 'all',
	verdictFilter: 'all',
	strategy: 'prune-exports-and-astro-scratch',
	survivorRule: 'fits-calibration-master-first',
	sortMode: 'reclaim_desc',
	searchQuery: '',
	protectCalibrationAndWcsStandards: true,
	protectRawSubframeAndInterferometryMasters: true,
	protectObservatoryEmbargoEvidence: true,
	requireAstroAnchorForPrune: true,
	keepRecentSessionDays: 0,
	minSizeKb: 0,
})

const STRICT_ASTRO_STD_EXT_RE = /\.(?:wcs|axy|rdls|corr|xyls|sip|asdf|vot|votable|ecsv|phd2|guidelog|obslog)$/i
const STRICT_ASTRO_RAW_EXT_RE = /\.(?:fits|fit|fts|fz|xisf|ser|adv|oifits|uvfits|uvf|sdfits|vdif|dada|katdal|miriad)$/i
const CONTEXT_RADIO_EXT_RE = /\.(?:ms|fil|sf|idi|vis|cal|bcal|gcal|kcal|tsys)$/i
const CONTEXT_ASTRO_DSLR_EXT_RE = /\.(?:raw|cr2|cr3|nef|arw|dng|orf|raf)$/i
const CONTEXT_COMPLIANCE_DOC_EXT_RE = /\.(?:xml|json|yaml|yml|pdf|txt|sig|p7s)$/i
const CONTEXT_ASTRO_EXPORT_EXT_RE = /\.(?:png|jpg|jpeg|webp|tif|tiff|bmp|gif|mp4|mov|mkv|avi|csv|tsv|txt|dat|reg|kml|kmz)$/i
const STRICT_ASTRO_SCRATCH_EXT_RE = /\.(?:xisf\.tmp|fits\.tmp|fit\.tmp|ms\.tmp|ser\.tmp|uvfits\.tmp|wbpp\.tmp|autosave\.tif|autosave|lck|swp)$/i
const GENERIC_SCRATCH_EXT_RE = /\.(?:tmp|bak|lock|dmp|part|idx|inf|log)$/i

const ASTRO_CONTEXT_HINT_RE = /(?:astronom|astrophoto|astro_?vault|telescope|observator|pixinsight|wbpp|siril|deepskystacker|dss_|astap|nina_?session|ekos|kstars|phd2|sharpcap|firecapture|autostakkert|registax|interferometr|radio_?astro|measurementset|casa_?pipeline|wsclean|aips|alma|vla|vlbi|lofar|ska_?sdp|meerkat|jwst|mast_?archive|eso_?archive|chandra|hubble|gaia|rubin|lsst|ztf|sdss|ngc\d+|ic\d+|messier|m\d{1,3}_(?:ha|oiii|sii|lrgb|rgb|lum)|light_?frames|master_?dark|master_?flat|master_?bias|plate_?solve|wcs_?solution|ds9|aladin|topcat|stsci|iraf|astropy)/i
const ASTRO_CALIBRATION_NAME_RE = /(?:^|[/_-])(?:master_?(?:dark|flat|bias|superbias|offset)|superbias|bpm|bad_?pixel|flatfield|dark_?library|bias_?library|cal_?table|bandpass_?cal|flux_?cal|gain_?cal)(?:[/_.-]|$)/i
const ASTRO_STD_PATH_RE = /(?:00_calibration|00_masters|00_wcs|calibration_library|master_calibrations|wcs_solutions|astrometry_solved|ivoa_archive|votable|asdf_metadata)/i
const OBSERVATORY_EMBARGO_PATH_RE = /(?:alma_?cycle|eso_?archive|jwst_?mast|hst_?archive|chandra_?cda|nrao_?vla|ska_?embargo|lofar_?lt|rubin_?dp|proprietary_?hold|observatory_?embargo|pi_?embargo|ivoa_?release)/i
const ASTRO_SCRATCH_PATH_RE = /(?:wbpp_cache|wbpp_tmp|pixinsight_swap|pi_swap|siril_process|siril_tmp|dss_autosave|app_temp|astap_tmp|casa_scratch|wsclean_tmp|imager_tmp|cal_tables_tmp|calibrated_tmp|registered_tmp|debayered_tmp|astro_staging|fits_cache)/i
const ASTRO_INTERMEDIATE_PREFIX_RE = /^(?:pp_|r_pp_|bkg_pp_|calibrated_|registered_|debayered_)/i
const ASTRO_INTERMEDIATE_SUFFIX_RE = /(?:_c_cc_d_r|_c_d_r|_c_r|_cc_d|_wbpp_tmp)$/i
const ASTRO_PROXY_PATH_RE = /(?:_stretched|_stretch|_abe|_dbe|_starless|_annotated|_quicklook|_web_?preview|_preview|_thumb|_histogram|_overlay|stretched_exports|quicklooks)/i
const CANONICAL_VAULT_PATH_RE = /(?:00_golden|00_master|00_raw|00_fits|00_calibration|00_interferometry|00_ms|canonical|astro_vault|fits_vault|observatory_vault|raw_subframes|radio_visibilities)/i

/**
 * Normalize configuration values for Astronomy, FITS Astrophotography & Radio Interferometry Vault auditing.
 *
 * @param {object} [rawConfig] Raw user configuration.
 * @return {object} Normalized configuration.
 */
export function normalizeAstronomyFitsConfig(rawConfig = {}) {
	const cfg = rawConfig && typeof rawConfig === 'object' ? rawConfig : {}
	const familyFilter = ASTRONOMY_FITS_FAMILIES.includes(cfg.familyFilter)
		? cfg.familyFilter
		: ASTRONOMY_FITS_DEFAULT_CONFIG.familyFilter
	const verdictFilter = ASTRONOMY_FITS_VERDICT_FILTERS.includes(cfg.verdictFilter)
		? cfg.verdictFilter
		: ASTRONOMY_FITS_DEFAULT_CONFIG.verdictFilter
	const strategy = ASTRONOMY_FITS_STRATEGIES.includes(cfg.strategy)
		? cfg.strategy
		: ASTRONOMY_FITS_DEFAULT_CONFIG.strategy
	const survivorRule = ASTRONOMY_FITS_SURVIVOR_RULES.includes(cfg.survivorRule)
		? cfg.survivorRule
		: ASTRONOMY_FITS_DEFAULT_CONFIG.survivorRule
	const sortMode = ASTRONOMY_FITS_SORT_MODES.includes(cfg.sortMode)
		? cfg.sortMode
		: ASTRONOMY_FITS_DEFAULT_CONFIG.sortMode

	const keepRecentParsed = Number(cfg.keepRecentSessionDays)
	const keepRecentSessionDays = Number.isFinite(keepRecentParsed) && keepRecentParsed >= 0
		? Math.floor(keepRecentParsed)
		: ASTRONOMY_FITS_DEFAULT_CONFIG.keepRecentSessionDays

	const minSizeParsed = Number(cfg.minSizeKb)
	const minSizeKb = Number.isFinite(minSizeParsed) && minSizeParsed > 0
		? minSizeParsed
		: 0

	return {
		presetId: typeof cfg.presetId === 'string' && cfg.presetId ? cfg.presetId : ASTRONOMY_FITS_DEFAULT_CONFIG.presetId,
		familyFilter,
		verdictFilter,
		strategy,
		survivorRule,
		sortMode,
		searchQuery: typeof cfg.searchQuery === 'string' ? cfg.searchQuery.trim() : '',
		protectCalibrationAndWcsStandards: cfg.protectCalibrationAndWcsStandards !== undefined ? Boolean(cfg.protectCalibrationAndWcsStandards) : true,
		protectRawSubframeAndInterferometryMasters: cfg.protectRawSubframeAndInterferometryMasters !== undefined ? Boolean(cfg.protectRawSubframeAndInterferometryMasters) : true,
		protectObservatoryEmbargoEvidence: cfg.protectObservatoryEmbargoEvidence !== undefined ? Boolean(cfg.protectObservatoryEmbargoEvidence) : true,
		requireAstroAnchorForPrune: cfg.requireAstroAnchorForPrune !== undefined ? Boolean(cfg.requireAstroAnchorForPrune) : true,
		keepRecentSessionDays,
		minSizeKb,
		memberOverrides: cfg.memberOverrides && typeof cfg.memberOverrides === 'object' ? { ...cfg.memberOverrides } : {},
	}
}

/**
 * Extract normalized astronomical target or observation stem by stripping extensions and processing suffixes.
 *
 * @param {string} basename Filename without directory.
 * @param {string} [normalized] Full normalized path.
 * @return {string} Normalized observation stem.
 */
export function extractAstronomyFitsStem(basename, normalized = '') {
	let stem = String(basename || normalized || '').trim().toLowerCase()
	stem = stem.replace(/\.(?:xisf\.tmp|fits\.tmp|fit\.tmp|ms\.tmp|ser\.tmp|uvfits\.tmp|wbpp\.tmp|autosave\.tif|info\.txt)$/i, '')
	stem = stem.replace(/\.[a-z0-9]{1,8}$/i, '')
	stem = stem.replace(ASTRO_INTERMEDIATE_PREFIX_RE, '')
	stem = stem.replace(ASTRO_INTERMEDIATE_SUFFIX_RE, '')
	stem = stem.replace(/(?:_stretched|_stretch|_abe|_dbe|_starless|_annotated|_quicklook|_web_preview|_preview|_thumbnail|_histogram|_mosaic_preview|_catalog_export|_ds9_reg|_export|_csv|_copy|_bak|_draft|_v\d+|_rev\d+)$/i, '')
	return stem || 'astro-observation'
}

/**
 * Extract canonical anchor key linking derived stretched renders or catalogs to raw FITS/XISF/SER/MS/UVFITS masters.
 *
 * @param {string} runStem Extracted observation stem.
 * @return {string} Canonical anchor key.
 */
export function extractAstronomyFitsAnchorKey(runStem) {
	return String(runStem || 'astro-observation')
		.toLowerCase()
		.replace(/(?:_rgb|_lrgb|_ha|_oiii|_sii|_sho|_hoo|_render|_render_final|_mosaic|_catalog|_table|_summary|_export)$/i, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '') || 'astro-observation'
}

/**
 * Detect Astronomy / Astrophotography / Radio Interferometry toolchain and workflow stage from path and filename.
 *
 * @param {string} normalized Normalized path.
 * @param {string} basename Filename.
 * @return {{ astroToolchain: string, workflowStage: string }} Detected toolchain and stage.
 */
function extractAstroToolchainAndStage(normalized, basename) {
	const text = `${normalized} ${basename}`.toLowerCase()
	let astroToolchain = ''
	if (/pixinsight|wbpp|\.(?:xisf)\b/.test(text)) {
		astroToolchain = 'PixInsight / WBPP (XISF)'
	} else if (/siril|pp_|r_pp_|bkg_pp_/.test(text)) {
		astroToolchain = 'Siril Astrophotography'
	} else if (/casa|measurementset|wsclean|aips|alma|vla|lofar|ska|\.(?:ms|uvfits|uvf|idi|katdal|miriad)\b/.test(text)) {
		astroToolchain = 'CASA / Radio Interferometry'
	} else if (/\.(?:vdif|dada|fil|sf)\b|vlbi|psrfits|sigproc/.test(text)) {
		astroToolchain = 'VLBI / Pulsar Radio Baseband'
	} else if (/\.(?:oifits)\b/.test(text)) {
		astroToolchain = 'Optical Interferometry (OIFITS)'
	} else if (/\.(?:ser|adv)\b|firecapture|sharpcap|autostakkert/.test(text)) {
		astroToolchain = 'Lucky Imaging (SER / ADV)'
	} else if (/astrometry|\.(?:wcs|axy|rdls|corr|xyls|sip)\b|astap/.test(text)) {
		astroToolchain = 'Astrometry / WCS Plate Solve'
	} else if (/phd2|\.(?:phd2|guidelog)\b|nina|ekos|kstars/.test(text)) {
		astroToolchain = 'N.I.N.A. / Ekos / PHD2 Acquisition'
	} else if (/\.(?:asdf|vot|votable|ecsv)\b|jwst|mast|eso|chandra|ivoa/.test(text)) {
		astroToolchain = 'IVOA / Observatory Science Data'
	} else if (/\.(?:fits|fit|fts|fz)\b/.test(text)) {
		astroToolchain = 'FITS Scientific Imaging'
	}

	let workflowStage = ''
	if (OBSERVATORY_EMBARGO_PATH_RE.test(text)) {
		workflowStage = 'Observatory / Embargo Hold'
	} else if (ASTRO_CALIBRATION_NAME_RE.test(text) || STRICT_ASTRO_STD_EXT_RE.test(basename) || ASTRO_STD_PATH_RE.test(text)) {
		workflowStage = 'Master Calibration / WCS / IVOA'
	} else if (/\.(?:ms|uvfits|uvf|oifits|vdif|dada|fil|sf|idi|sdfits|katdal|miriad)\b/.test(text)) {
		workflowStage = 'Radio / Optical Visibility Master'
	} else if (/\.(?:fits|fit|fts|fz|xisf|ser|adv)\b/.test(text) || CONTEXT_ASTRO_DSLR_EXT_RE.test(basename)) {
		workflowStage = 'Raw Light / SER Master Frame'
	} else if (ASTRO_SCRATCH_PATH_RE.test(text) || STRICT_ASTRO_SCRATCH_EXT_RE.test(basename) || ASTRO_INTERMEDIATE_PREFIX_RE.test(basename) || ASTRO_INTERMEDIATE_SUFFIX_RE.test(basename)) {
		workflowStage = 'WBPP / Siril / CASA Scratch'
	} else if (CONTEXT_ASTRO_EXPORT_EXT_RE.test(basename) || ASTRO_PROXY_PATH_RE.test(text)) {
		workflowStage = 'Stretched Quicklook / Catalog Export'
	}

	return { astroToolchain, workflowStage }
}

/**
 * Extract concise Astronomy domain tag badge when present.
 *
 * @param {string} lowerBase Lowercase filename.
 * @param {string} lowerPath Lowercase full path.
 * @return {string} Short tag or empty string.
 */
function extractAstroDomainTag(lowerBase, lowerPath) {
	const text = `${lowerPath} ${lowerBase}`
	if (OBSERVATORY_EMBARGO_PATH_RE.test(text)) {
		return 'OBSERVATORY HOLD'
	}
	if (ASTRO_CALIBRATION_NAME_RE.test(text)) {
		return 'MASTER CAL'
	}
	if (/\.(?:wcs|axy|rdls|corr|xyls|sip)\b/.test(text)) {
		return 'WCS-SOLVE'
	}
	if (/\.(?:asdf|vot|votable|ecsv)\b/.test(text)) {
		return 'IVOA / ASDF'
	}
	if (/\.(?:ms|uvfits|uvf|oifits|idi|katdal|miriad)\b/.test(text)) {
		return 'INTERFEROMETRY'
	}
	if (/\.(?:vdif|dada|fil|sf)\b/.test(text)) {
		return 'VLBI / PULSAR'
	}
	if (/\.(?:xisf)\b/.test(text)) {
		return 'PIXINSIGHT-XISF'
	}
	if (/\.(?:ser|adv)\b/.test(text)) {
		return 'SER-LUCKY'
	}
	if (/\.(?:fits|fit|fts|fz)\b/.test(text)) {
		return 'FITS-MASTER'
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
 * Classify a single file within the Astronomy, FITS Astrophotography & Radio Interferometry domain.
 *
 * @param {object} file Duplicate file object.
 * @param {number} [referenceNowMs] Reference current timestamp in ms.
 * @return {object} Classification metadata (family === null if non-domain file).
 */
export function classifyAstronomyFitsFile(file, referenceNowMs = Date.now()) {
	const rawPath = String(file?.path || file?.name || '')
	const normalized = normalizePathForDiff(rawPath)
	const lower = normalized.toLowerCase()
	const slashIdx = normalized.lastIndexOf('/')
	const basename = slashIdx >= 0 ? normalized.slice(slashIdx + 1) : normalized
	const dirname = slashIdx >= 0 ? normalized.slice(0, slashIdx) : ''
	const lowerBase = basename.toLowerCase()
	const size = Math.max(0, Number(file?.size) || 0)
	const { mtimeMs, ageDays, formattedMtime } = parseFileTime(file, referenceNowMs)

	const hasAstroContext = ASTRO_CONTEXT_HINT_RE.test(lower)
	const isCalibrationName = ASTRO_CALIBRATION_NAME_RE.test(lower)
	const isScratchPath = ASTRO_SCRATCH_PATH_RE.test(lower)
	const isStrictScratchExt = STRICT_ASTRO_SCRATCH_EXT_RE.test(lowerBase)
	const isGenericScratchExt = GENERIC_SCRATCH_EXT_RE.test(lowerBase)
	const isIntermediateSubframe = ASTRO_INTERMEDIATE_PREFIX_RE.test(lowerBase) || ASTRO_INTERMEDIATE_SUFFIX_RE.test(lowerBase)
	const isAstroStdPath = ASTRO_STD_PATH_RE.test(lower)
	const isObservatoryEmbargoPath = OBSERVATORY_EMBARGO_PATH_RE.test(lower)
	const isCanonicalVaultPath = CANONICAL_VAULT_PATH_RE.test(lower)
	const isAstroProxyPath = ASTRO_PROXY_PATH_RE.test(lower)

	const isStrictAstroStdExt = STRICT_ASTRO_STD_EXT_RE.test(lowerBase)
	const isStrictAstroRawExt = STRICT_ASTRO_RAW_EXT_RE.test(lowerBase)
	const isContextRadioExt = CONTEXT_RADIO_EXT_RE.test(lowerBase) && hasAstroContext
	const isContextDslrAstroExt = CONTEXT_ASTRO_DSLR_EXT_RE.test(lowerBase) && hasAstroContext
	const isContextComplianceDoc = CONTEXT_COMPLIANCE_DOC_EXT_RE.test(lowerBase) && (isAstroStdPath || isObservatoryEmbargoPath)
	const isContextAstroExport = CONTEXT_ASTRO_EXPORT_EXT_RE.test(lowerBase) && (hasAstroContext || isAstroProxyPath)

	let family = null
	let artifactKind = 'Unknown'
	let vaultRole = 'Outside Astronomy & FITS Vault'
	let isProtectedAstroStandard = false
	let isProtectedRawAstroMaster = false
	let isProtectedObservatoryEmbargo = false
	let isAstroMasterAnchor = false
	let isRedundantAstroExport = false
	let isMutableFile = false

	if (
		isStrictScratchExt
		|| (isScratchPath && (isGenericScratchExt || isContextAstroExport || isStrictAstroRawExt || isContextRadioExt || isContextDslrAstroExt || isStrictAstroStdExt))
		|| (isIntermediateSubframe && (isStrictAstroRawExt || isContextDslrAstroExt || hasAstroContext))
		|| (isGenericScratchExt && hasAstroContext)
	) {
		family = 'pixinsight-siril-casa-scratch'
		artifactKind = isStrictScratchExt
			? 'PixInsight / Siril / CASA Scratch'
			: (isIntermediateSubframe ? 'WBPP / Siril Intermediate Subframe' : 'Pipeline Solver or Staging Scratch')
		vaultRole = 'PixInsight WBPP / Siril / DSS / CASA Scratch'
		isMutableFile = true
	} else if (isObservatoryEmbargoPath && (isStrictAstroStdExt || isStrictAstroRawExt || isContextRadioExt || isContextDslrAstroExt || isContextComplianceDoc)) {
		family = 'fits-calibration-observatory-standards'
		artifactKind = 'ESO / ALMA / JWST / NRAO Observatory Hold'
		vaultRole = 'Embargoed Observatory & Archival Science Data'
		isProtectedObservatoryEmbargo = true
		isProtectedAstroStandard = true
		isAstroMasterAnchor = isStrictAstroStdExt || isStrictAstroRawExt || isContextRadioExt || isContextDslrAstroExt
		isMutableFile = /\.(?:xml|json|yaml|yml|txt|ms|wcs|asdf|vot|votable|ecsv)$/i.test(lowerBase)
	} else if (
		isStrictAstroStdExt
		|| (isCalibrationName && (isStrictAstroRawExt || isContextRadioExt || isContextDslrAstroExt))
		|| (isAstroStdPath && (isContextComplianceDoc || isStrictAstroRawExt || isContextRadioExt))
	) {
		family = 'fits-calibration-observatory-standards'
		if (isCalibrationName) {
			artifactKind = 'Master Calibration (Dark / Flat / Bias / CalTable)'
			vaultRole = 'Reusable Telescope / Interferometer Calibration Baseline'
		} else if (/\.(?:wcs|axy|rdls|corr|xyls|sip)$/i.test(lowerBase)) {
			artifactKind = 'WCS Astrometry Plate-Solve Solution'
			vaultRole = 'World Coordinate System & Catalog Alignment'
		} else {
			artifactKind = 'IVOA / ASDF / Observatory Metadata Standard'
			vaultRole = 'Scientific Provenance & Acquisition Standard'
		}
		isProtectedAstroStandard = true
		isAstroMasterAnchor = isStrictAstroStdExt || isStrictAstroRawExt || isContextRadioExt || isContextDslrAstroExt
		isMutableFile = /\.(?:wcs|axy|rdls|corr|xyls|sip|asdf|vot|votable|ecsv|phd2|guidelog|obslog|xml|json|yaml|yml|txt|ms|cal|bcal|gcal|kcal|tsys)$/i.test(lowerBase)
	} else if (isStrictAstroRawExt || isContextRadioExt || isContextDslrAstroExt) {
		family = 'raw-subframe-interferometry-masters'
		if (/\.(?:ms|uvfits|uvf|oifits|sdfits|idi|katdal|miriad)$/i.test(lowerBase)) {
			artifactKind = 'Radio / Optical Interferometry Visibility Master'
			vaultRole = 'CASA MeasurementSet / UVFITS / OIFITS Master'
		} else if (/\.(?:vdif|dada|fil|sf)$/i.test(lowerBase)) {
			artifactKind = 'VLBI / Pulsar Radio Baseband Master'
			vaultRole = 'High-Rate Baseband / Filterbank / PSRFITS Master'
		} else if (/\.(?:ser|adv)$/i.test(lowerBase)) {
			artifactKind = 'Planetary / Solar SER Lucky-Imaging Master'
			vaultRole = 'Uncompressed High-FPS Astronomical Stream'
		} else {
			artifactKind = 'Raw FITS / XISF / Telescope Light Subframe'
			vaultRole = 'Linear Sensor Acquisition Master'
		}
		isProtectedRawAstroMaster = true
		isAstroMasterAnchor = true
		isMutableFile = /\.(?:ms|miriad)$/i.test(lowerBase)
	} else if (isContextComplianceDoc) {
		family = 'fits-calibration-observatory-standards'
		artifactKind = 'Observatory Archive & Calibration Manifest'
		vaultRole = 'Observing Proposal & Data Reduction Provenance'
		isProtectedAstroStandard = true
		isMutableFile = true
	} else if (isContextAstroExport) {
		family = 'redundant-astro-stretch-exports'
		if (/\.(?:mp4|mov|mkv|avi|gif)$/i.test(lowerBase)) {
			artifactKind = 'Astrophotography Timelapse / Preview Video'
		} else if (/\.(?:csv|tsv|txt|dat|reg|kml|kmz)$/i.test(lowerBase)) {
			artifactKind = 'Source Catalog / DS9 Region / ASCII Export'
		} else {
			artifactKind = 'Stretched / Tone-Mapped Quicklook Render'
		}
		vaultRole = 'Derived Stretched Render or Catalog Export'
		isRedundantAstroExport = true
		isMutableFile = true
	}

	const { astroToolchain, workflowStage } = extractAstroToolchainAndStage(normalized, basename)
	const runStem = extractAstronomyFitsStem(basename, normalized)
	const astroAnchorKey = extractAstronomyFitsAnchorKey(runStem)
	const astroTag = extractAstroDomainTag(lowerBase, lower)

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
		astroToolchain,
		workflowStage,
		runStem,
		astroAnchorKey,
		astroTag,
		isProtectedAstroStandard,
		isProtectedRawAstroMaster,
		isProtectedObservatoryEmbargo,
		isAstroMasterAnchor,
		isRedundantAstroExport,
		isMutableFile,
		isScratchPath: isScratchPath || isStrictScratchExt || (isIntermediateSubframe && family === 'pixinsight-siril-casa-scratch') || (isGenericScratchExt && hasAstroContext),
		isAstroStdPath,
		isObservatoryEmbargoPath,
		isCanonicalVaultPath,
	}
}

/**
 * Determine whether a duplicate group belongs to the Astronomy, FITS Astrophotography & Radio Interferometry domain.
 *
 * @param {object} group Duplicate group.
 * @return {boolean} True when at least one file belongs to this domain.
 */
export function isAstronomyFitsGroup(group) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return false
	}
	return group.files.some(file => classifyAstronomyFitsFile(file).family !== null)
}

/**
 * Build cross-group correlation index linking verified FITS/XISF/SER/MS/UVFITS/MasterCal anchors
 * to derived stretched PNG/JPG/TIF/MP4 quicklooks and CSV/DS9 catalog exports.
 *
 * @param {Array<object>} groups Domain duplicate groups.
 * @return {object} Correlation index.
 */
export function buildAstronomyFitsCorrelationIndex(groups) {
	const anchorStems = new Set()
	const anchorKeys = new Set()

	for (const group of Array.isArray(groups) ? groups : []) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (const file of group.files) {
			const meta = classifyAstronomyFitsFile(file)
			if (!meta.family) {
				continue
			}
			if (meta.isAstroMasterAnchor) {
				anchorStems.add(meta.runStem)
				anchorKeys.add(meta.astroAnchorKey)
			}
		}
	}

	return {
		anchorStems,
		anchorKeys,
	}
}

/**
 * Determine primary family for a heterogeneous Astronomy & FITS cluster.
 *
 * @param {Array<object>} members Classified members.
 * @return {string} Family ID.
 */
function resolveClusterFamily(members) {
	if (members.some(m => m.family === 'fits-calibration-observatory-standards')) {
		return 'fits-calibration-observatory-standards'
	}
	if (members.some(m => m.family === 'raw-subframe-interferometry-masters')) {
		return 'raw-subframe-interferometry-masters'
	}
	if (members.some(m => m.family === 'redundant-astro-stretch-exports')) {
		return 'redundant-astro-stretch-exports'
	}
	return 'pixinsight-siril-casa-scratch'
}

/**
 * Compute deterministic survivor priority score for an Astronomy & FITS vault member.
 *
 * @param {object} member Classified member.
 * @param {string} survivorRule Survivor rule.
 * @return {number} Priority score (higher wins).
 */
function scoreMemberForSurvivor(member, survivorRule) {
	const mtimeScore = member.mtimeMs !== null ? member.mtimeMs / 1e10 : 0
	const shortPathScore = 1000 - Math.min(999, member.normalized.length)

	if (survivorRule === 'oldest-observation-first') {
		const oldestScore = member.mtimeMs !== null ? -mtimeScore : 0
		return (member.isProtectedObservatoryEmbargo ? 100000 : 0)
			+ (member.isProtectedAstroStandard ? 97000 : 0)
			+ (member.isProtectedRawAstroMaster ? 94000 : 0)
			+ (member.isCanonicalVaultPath ? 25000 : 0)
			+ (member.isScratchPath ? -55000 : 0)
			+ (member.isRedundantAstroExport ? -40000 : 0)
			+ oldestScore
			+ shortPathScore
	}

	if (survivorRule === 'newest-reduction-first') {
		return (member.isProtectedObservatoryEmbargo ? 100000 : 0)
			+ (member.isProtectedAstroStandard ? 97000 : 0)
			+ (member.isProtectedRawAstroMaster ? 94000 : 0)
			+ (member.isScratchPath ? -50000 : 0)
			+ (member.isRedundantAstroExport ? -40000 : 0)
			+ mtimeScore
	}

	if (survivorRule === 'shortest-path') {
		return (member.isProtectedObservatoryEmbargo ? 52000 : 0)
			+ (member.isProtectedAstroStandard ? 50000 : 0)
			+ (member.isProtectedRawAstroMaster ? 48000 : 0)
			+ (member.isScratchPath ? -30000 : 0)
			+ shortPathScore
	}

	return (member.isProtectedObservatoryEmbargo ? 100000 : 0)
		+ (member.isProtectedAstroStandard ? 97000 : 0)
		+ (member.isProtectedRawAstroMaster ? 94000 : 0)
		+ (member.isCanonicalVaultPath ? 25000 : 0)
		+ (member.isRedundantAstroExport ? -45000 : 0)
		+ (member.isScratchPath ? -60000 : 0)
		+ shortPathScore
}

/**
 * Audit a single Astronomy, FITS Astrophotography & Radio Interferometry duplicate cluster.
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
		const meta = classifyAstronomyFitsFile(file, referenceNowMs)
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
	const primaryToolchain = rawMembers.find(m => m.astroToolchain)?.astroToolchain || ''
	const primaryStage = rawMembers.find(m => m.workflowStage)?.workflowStage || ''
	const primaryStem = rawMembers[0].runStem || extractAstronomyFitsStem(primaryName, rawMembers[0].normalized)
	const primaryAnchorKey = rawMembers[0].astroAnchorKey || extractAstronomyFitsAnchorKey(primaryStem)

	const hasAstroMasterAnchor = Boolean(
		rawMembers.some(m => m.isAstroMasterAnchor)
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

		const isRedundantAstroExportMember = member.isRedundantAstroExport && hasAstroMasterAnchor

		let redundancyReason = ''
		if (member.isRedundantAstroExport) {
			redundancyReason = isRedundantAstroExportMember
				? 'Derived stretched render or catalog export duplicates verified FITS, XISF, SER, MS, or UVFITS master'
				: 'Stretched render or catalog export without verified FITS, XISF, SER, or MS master anchor'
		}

		let governanceTier = 'astro-scratch-intermediate'
		let shielded = false
		let protectedReason = ''
		let action = 'keep'

		if (override === 'keep') {
			governanceTier = member.isProtectedObservatoryEmbargo
				? 'observatory-embargo-protected'
				: (member.isProtectedAstroStandard
					? 'astro-std-protected'
					: (member.isProtectedRawAstroMaster
						? 'raw-subframe-interferometry-protected'
						: (member.isRedundantAstroExport
							? 'astro-export-redundant'
							: 'astro-scratch-intermediate')))
			shielded = true
			protectedReason = 'Manually shielded via per-copy override'
		} else if (member.isProtectedObservatoryEmbargo && config.protectObservatoryEmbargoEvidence) {
			governanceTier = 'observatory-embargo-protected'
			shielded = true
			protectedReason = 'ESO / ALMA / JWST / NRAO observatory embargo or archival baseline strictly conserved'
		} else if (member.isProtectedAstroStandard && config.protectCalibrationAndWcsStandards) {
			governanceTier = 'astro-std-protected'
			shielded = true
			protectedReason = 'Master calibration (Dark/Flat/Bias), WCS plate solve, or IVOA/ASDF standard strictly conserved'
		} else if (member.isProtectedRawAstroMaster && config.protectRawSubframeAndInterferometryMasters) {
			governanceTier = 'raw-subframe-interferometry-protected'
			shielded = true
			protectedReason = 'Verified raw FITS/XISF/SER subframe or radio interferometry visibility master strictly conserved'
		} else if (isSurvivor && !isRedundantAstroExportMember) {
			governanceTier = member.isProtectedObservatoryEmbargo
				? 'observatory-embargo-protected'
				: (member.isProtectedAstroStandard
					? 'astro-std-protected'
					: (member.isProtectedRawAstroMaster
						? 'raw-subframe-interferometry-protected'
						: (member.isRedundantAstroExport
							? 'astro-export-redundant'
							: 'astro-scratch-intermediate')))
			shielded = true
			protectedReason = 'Canonical Astronomy & Interferometry vault survivor retained'
		} else if (override === 'prune') {
			governanceTier = member.isRedundantAstroExport
				? 'astro-export-redundant'
				: (member.isProtectedAstroStandard
					? 'astro-std-protected'
					: 'astro-scratch-intermediate')
			action = config.strategy === 'hardlink-immutable-fits-and-ms' && !member.isMutableFile && !member.isScratchPath
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
			config.keepRecentSessionDays > 0
			&& member.isScratchPath
			&& member.ageDays !== null
			&& member.ageDays < config.keepRecentSessionDays
		) {
			governanceTier = 'astro-scratch-intermediate'
			shielded = true
			protectedReason = `Within ${config.keepRecentSessionDays}-day active imaging or CASA reduction grace window`
		} else if (member.isRedundantAstroExport) {
			governanceTier = 'astro-export-redundant'
			if (config.requireAstroAnchorForPrune && !hasAstroMasterAnchor) {
				shielded = true
				protectedReason = 'Blocked until a verified FITS, XISF, SER, MS, or UVFITS master anchor exists'
			} else {
				action = 'delete'
				deleteTargetsCount += 1
				reclaimableBytes += member.size
				protectedReason = redundancyReason
			}
		} else if (member.isScratchPath) {
			governanceTier = 'astro-scratch-intermediate'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
			protectedReason = 'PixInsight WBPP, Siril, DSS, or CASA processing scratch eligible for cleanup'
		} else if (member.isProtectedRawAstroMaster || member.isProtectedAstroStandard) {
			governanceTier = member.isProtectedAstroStandard ? 'astro-std-protected' : 'raw-subframe-interferometry-protected'
			action = config.strategy === 'hardlink-immutable-fits-and-ms' && !member.isMutableFile ? 'hardlink' : 'delete'
			if (action === 'hardlink') {
				hardlinkSavingsBytes += member.size
				hardlinkTargetsCount += 1
			} else {
				deleteTargetsCount += 1
			}
			reclaimableBytes += member.size
		} else if (config.strategy === 'hardlink-immutable-fits-and-ms' && !member.isMutableFile) {
			governanceTier = 'raw-subframe-interferometry-protected'
			action = 'hardlink'
			hardlinkSavingsBytes += member.size
			hardlinkTargetsCount += 1
			reclaimableBytes += member.size
		} else {
			governanceTier = 'astro-scratch-intermediate'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
		}

		if (shielded) {
			shieldedCount += 1
		}

		return {
			...member,
			isRedundantAstroExportMember,
			redundancyReason,
			isSurvivor,
			governanceTier,
			shielded,
			protectedReason,
			action,
		}
	})

	const hasRedundantAstroExport = members.some(m => m.isRedundantAstroExportMember || m.isRedundantAstroExport)
	const hasProtectedObservatoryEmbargo = members.some(m => m.governanceTier === 'observatory-embargo-protected' && m.shielded)
	const hasProtectedAstroStandard = members.some(m => m.governanceTier === 'astro-std-protected' && m.shielded)
	const hasProtectedRawAstroMaster = members.some(m => m.governanceTier === 'raw-subframe-interferometry-protected' && m.shielded)
	const hasAstroScratchIntermediate = members.some(m => m.isScratchPath)

	let clusterVerdict = 'shielded'
	if (reclaimableBytes > 0) {
		if (members.some(m => m.isRedundantAstroExportMember && !m.shielded)) {
			clusterVerdict = 'astro-export-redundant'
		} else if (members.some(m => m.isScratchPath && !m.shielded)) {
			clusterVerdict = 'astro-scratch-intermediate'
		} else {
			clusterVerdict = 'reclaimable'
		}
	} else if (hasProtectedObservatoryEmbargo) {
		clusterVerdict = 'observatory-embargo-protected'
	} else if (hasProtectedAstroStandard) {
		clusterVerdict = 'astro-std-protected'
	} else if (hasProtectedRawAstroMaster) {
		clusterVerdict = 'raw-subframe-interferometry-protected'
	}

	let priorityScore = 10
	if (reclaimableBytes > 0) {
		priorityScore = hasRedundantAstroExport ? 95 : 85
	} else if (hasProtectedObservatoryEmbargo) {
		priorityScore = 60
	} else if (hasProtectedAstroStandard) {
		priorityScore = 50
	}

	const astroTags = [...new Set(members.map(m => m.astroTag).filter(Boolean))]
	const familyMeta = ASTRONOMY_FITS_FAMILY_META[family] || ASTRONOMY_FITS_FAMILY_META['pixinsight-siril-casa-scratch']

	return {
		id: group.id ?? primaryName,
		hash: group.hash || '',
		name: primaryName,
		astroToolchain: primaryToolchain,
		workflowStage: primaryStage,
		runStem: primaryStem,
		astroAnchorKey: primaryAnchorKey,
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
		hasProtectedAstroStandard,
		hasProtectedRawAstroMaster,
		hasProtectedObservatoryEmbargo,
		hasRedundantAstroExport,
		hasAstroScratchIntermediate,
		hasAstroMasterAnchor,
		astroTags,
		members,
		sourceGroup: group,
	}
}

/**
 * Audit a list of duplicate groups as an Astronomy, FITS Astrophotography & Radio Interferometry Vault.
 *
 * @param {Array<object>} groups Duplicate groups.
 * @param {object} [rawConfig] Optional audit configuration.
 * @param {number} [referenceNowMs] Optional reference timestamp in ms.
 * @return {object} Comprehensive Astronomy & Interferometry vault audit report.
 */
export function auditAstronomyFitsInterferometryVault(groups, rawConfig = {}, referenceNowMs = Date.now()) {
	const config = normalizeAstronomyFitsConfig(rawConfig)
	const groupList = Array.isArray(groups) ? groups : []

	const domainGroups = groupList.filter(isAstronomyFitsGroup)
	const correlationIndex = buildAstronomyFitsCorrelationIndex(domainGroups)

	const allClusters = domainGroups
		.map(group => auditSingleCluster(group, correlationIndex, config, referenceNowMs))
		.filter(Boolean)

	const minBytes = config.minSizeKb * 1024
	const sizeFiltered = allClusters.filter(cluster => cluster.unitBytes >= minBytes || cluster.totalBytes >= minBytes)

	const familyCounts = {
		'fits-calibration-observatory-standards': 0,
		'raw-subframe-interferometry-masters': 0,
		'redundant-astro-stretch-exports': 0,
		'pixinsight-siril-casa-scratch': 0,
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
				cluster.astroToolchain,
				cluster.workflowStage,
				cluster.runStem,
				cluster.astroAnchorKey,
				cluster.familyLabel,
				...cluster.astroTags,
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
	let totalAstroStdClusters = 0
	let totalRawAstroMasterClusters = 0
	let totalObservatoryEmbargoClusters = 0
	let totalRedundantExportClusters = 0
	let totalAstroScratchClusters = 0

	for (const cluster of filteredClusters) {
		rawDuplicateBytes += Math.max(0, cluster.totalBytes - cluster.unitBytes)
		reclaimableBytes += cluster.reclaimableBytes
		totalReclaimableCopiesCount += cluster.reclaimableTargetsCount
		totalShieldedCopiesCount += cluster.shieldedCount
		if (cluster.hasProtectedAstroStandard) {
			totalAstroStdClusters += 1
		}
		if (cluster.hasProtectedRawAstroMaster) {
			totalRawAstroMasterClusters += 1
		}
		if (cluster.hasProtectedObservatoryEmbargo) {
			totalObservatoryEmbargoClusters += 1
		}
		if (cluster.hasRedundantAstroExport) {
			totalRedundantExportClusters += 1
		}
		if (cluster.hasAstroScratchIntermediate) {
			totalAstroScratchClusters += 1
		}
	}

	const reclaimableGb = `${(reclaimableBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
	const efficiencyPct = rawDuplicateBytes > 0
		? Math.min(100, Math.round((reclaimableBytes / rawDuplicateBytes) * 100))
		: 0

	const familyBreakdown = ASTRONOMY_FITS_FAMILIES
		.filter(id => id !== 'all')
		.map(id => ({
			id,
			label: ASTRONOMY_FITS_FAMILY_META[id].label,
			shortLabel: ASTRONOMY_FITS_FAMILY_META[id].shortLabel,
			clustersCount: familyCounts[id] || 0,
		}))

	return {
		schema: ASTRONOMY_FITS_INTERFEROMETRY_VAULT_SCHEMA,
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
			totalAstroStdClusters,
			totalRawAstroMasterClusters,
			totalObservatoryEmbargoClusters,
			totalRedundantExportClusters,
			totalAstroScratchClusters,
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
 * Build a safe POSIX DRY_RUN=1 remediation script for Astronomy, FITS & Radio Interferometry Vaults.
 * Strictly blocks deletion or hardlinking of shielded Master Calibrations, Observatory Holds,
 * and verified Raw FITS/XISF/SER/MS/UVFITS masters, and never hardlinks mutable files or scratch.
 *
 * @param {object} auditResult Result from auditAstronomyFitsInterferometryVault.
 * @return {string} POSIX bash script.
 */
export function buildAstronomyFitsRemediationScript(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# Astronomy, FITS Astrophotography & Radio Interferometry Vault Auditor',
		'# Safe POSIX Remediation Script (default DRY_RUN=1)',
		'# Run with DRY_RUN=0 ./astronomy-fits-vault-reclaim.sh only after verifying FITS/XISF/MS anchors.',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'QUARANTINE_DIR="$' + '{QUARANTINE_DIR:-./.astronomy-fits-scratch-quarantine}"',
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
	const strategy = auditResult?.config?.strategy || 'prune-exports-and-astro-scratch'
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
			} else if (strategy === 'quarantine-exports-and-astro-scratch' && (target.isRedundantAstroExport || target.isScratchPath)) {
				lines.push('run_cmd mkdir -p "$QUARANTINE_DIR"')
				lines.push(`run_cmd mv -n ${quotePosixPath(target.normalized)} "$QUARANTINE_DIR/"`)
			} else {
				lines.push(`run_cmd rm -f ${quotePosixPath(target.normalized)}`)
			}
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('printf "No reclaimable stretched renders or WBPP/Siril/CASA scratch under active Astronomy & FITS shields.\\n"')
	} else {
		lines.push(`printf "Completed Astronomy & FITS Vault remediation plan (%d target actions, DRY_RUN=%s).\\n" "${actionCount}" "$DRY_RUN"`)
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe RFC-4180 CSV audit report.
 *
 * @param {object} auditResult Result from auditAstronomyFitsInterferometryVault.
 * @return {string} RFC-4180 CSV string.
 */
export function buildAstronomyFitsCsvReport(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const headers = [
		'cluster_id',
		'cluster_name',
		'astro_toolchain',
		'workflow_stage',
		'run_stem',
		'astro_anchor_key',
		'family',
		'cluster_verdict',
		'has_astro_master_anchor',
		'is_redundant_astro_export',
		'is_astro_scratch',
		'member_path',
		'artifact_kind',
		'vault_role',
		'astro_tag',
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
				cluster.astroToolchain || '',
				cluster.workflowStage || '',
				cluster.runStem,
				cluster.astroAnchorKey,
				cluster.family,
				cluster.clusterVerdict,
				cluster.hasAstroMasterAnchor ? 'true' : 'false',
				member.isRedundantAstroExportMember ? 'true' : 'false',
				member.isScratchPath ? 'true' : 'false',
				member.normalized,
				member.artifactKind,
				member.vaultRole,
				member.astroTag || '',
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
 * @param {object} auditResult Result from auditAstronomyFitsInterferometryVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildAstronomyFitsJsonManifest(auditResult) {
	const payload = {
		schema: ASTRONOMY_FITS_INTERFEROMETRY_VAULT_SCHEMA,
		generatedAt: new Date().toISOString(),
		config: auditResult?.config || ASTRONOMY_FITS_DEFAULT_CONFIG,
		summary: auditResult?.summary || {},
		clusters: (auditResult?.clusters || []).map(cluster => ({
			id: cluster.id,
			name: cluster.name,
			astroToolchain: cluster.astroToolchain,
			workflowStage: cluster.workflowStage,
			runStem: cluster.runStem,
			astroAnchorKey: cluster.astroAnchorKey,
			family: cluster.family,
			clusterVerdict: cluster.clusterVerdict,
			unitBytes: cluster.unitBytes,
			totalBytes: cluster.totalBytes,
			reclaimableBytes: cluster.reclaimableBytes,
			survivorPath: cluster.survivorPath,
			hasProtectedAstroStandard: cluster.hasProtectedAstroStandard,
			hasProtectedRawAstroMaster: cluster.hasProtectedRawAstroMaster,
			hasProtectedObservatoryEmbargo: cluster.hasProtectedObservatoryEmbargo,
			hasRedundantAstroExport: cluster.hasRedundantAstroExport,
			hasAstroScratchIntermediate: cluster.hasAstroScratchIntermediate,
			hasAstroMasterAnchor: cluster.hasAstroMasterAnchor,
			astroTags: cluster.astroTags,
			members: (cluster.members || []).map(member => ({
				path: member.normalized,
				artifactKind: member.artifactKind,
				vaultRole: member.vaultRole,
				astroTag: member.astroTag || '',
				governanceTier: member.governanceTier,
				action: member.action,
				shielded: member.shielded,
				protectedReason: member.protectedReason,
				isRedundantAstroExportMember: member.isRedundantAstroExportMember,
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
 * cloud sync of PixInsight WBPP, Siril, DSS, ASTAP, and CASA scratch directories.
 *
 * @return {string} Line-delimited .sync-exclude.lst rules.
 */
export function buildAstronomyFitsSyncExcludeList() {
	return [
		'# Nextcloud / rsync exclusion rules for Astronomy, FITS Astrophotography & Radio Interferometry Vaults',
		'wbpp_cache/',
		'wbpp_tmp/',
		'pixinsight_swap/',
		'pi_swap/',
		'siril_process/',
		'siril_tmp/',
		'dss_autosave/',
		'app_temp/',
		'astap_tmp/',
		'casa_scratch/',
		'wsclean_tmp/',
		'imager_tmp/',
		'cal_tables_tmp/',
		'astro_staging/',
		'fits_cache/',
		'pp_*',
		'r_pp_*',
		'bkg_pp_*',
		'*.xisf.tmp',
		'*.fits.tmp',
		'*.fit.tmp',
		'*.ms.tmp',
		'*.ser.tmp',
		'*.uvfits.tmp',
		'*.wbpp.tmp',
		'*.autosave.tif',
		'*.autosave',
		'*.lck',
		'*.lock',
		'*.tmp',
	].join('\n')
}
