/**
 * Pure Meteorology, Weather Radar, NetCDF & Climate Model Vault Auditor.
 * Classifies and audits duplicate clusters across 4 Meteorology & Climate Vault families:
 * - CF-Conventions, WMO & Archive (CMOR tables, CF metadata, WMO BUFR/SYNOP/METAR, WRF namelist.input/wps, .cdl, .ncml, .zmetadata, ECMWF ERA5 / CMIP6 / EUMETSAT / NOAA NCEI / NEXRAD Level-II archive holds)
 * - Raw Radar, NetCDF & GRIB2 (.nc, .nc3, .nc4, .netcdf, .grib, .grib2, .grb, .grb2, .ar2v, .msg31, .nexrad, .cfradial, .odim, .odimh5, .dorade, .sigmet, .iris, wrfout_*, wrfrst_*, .sounding, .l1b, .l2, meteo .h5/.hdf5/.zarr)
 * - Redundant Quicklooks & CSVs (Skew-T/radar/isobar .png/.jpg/.webp/.tif/.gif/.mp4/.mov, .csv/.tsv/.geojson/.kml/.svg exports when a verified NetCDF/GRIB2/Radar/NWP master anchor exists)
 * - WRF, CDO & Radar Scratch (wrf_scratch/, wps_tmp/, ungrib_tmp/, metgrid_tmp/, cdo_tmp/, nco_tmp/, pyart_cache/, wradlib_cache/, radx_tmp/, eccodes_cache/, xarray_dask_spill/, dask_worker_space/, zarr_staging/, era5_download_tmp/, FILE:*, PFILE:*, .nc.tmp, .grib2.tmp, .ar2v.tmp, .lck)
 *
 * Enforces strict WMO/Climate Archive Hold, CF/CMOR Standard, and Raw Radar/NetCDF/GRIB2 conservation defaults:
 * - Strictly conserves ECMWF ERA5, CMIP6, CORDEX, EUMETSAT, NOAA NCEI, and NEXRAD Level-II archival holds
 * - Strictly conserves CF/CMOR metadata tables, WMO BUFR/SYNOP codes, WRF namelists, CDL/NcML schemas, and radar calibration profiles
 * - Strictly conserves verified raw NetCDF, GRIB/GRIB2, WRF output, and polarimetric weather radar masters
 * - Detects redundant quicklook renders, Skew-T plots, radar animation loops, and CSV/GeoJSON exports when a verified NetCDF/GRIB2/Radar master anchor exists
 * - Blocks pruning of quicklook renders or CSV exports lacking a verified raw meteorological anchor when guard is active
 * - Blocks hardlinks on mutable BUFR/NML/CDL/NcML/JSON/CSV/Zarr/scratch files
 *
 * Generates DRY_RUN=1 POSIX remediation scripts, CWE-1236-safe CSV reports, JSON audit
 * manifests, and .sync-exclude.lst rules. Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const METEOROLOGY_CLIMATE_VAULT_SCHEMA = 'duplicatefinder.meteorology-climate-vault-auditor.v1'

export const METEOROLOGY_CLIMATE_FAMILIES = Object.freeze([
	'all',
	'cf-wmo-climate-standards',
	'raw-radar-netcdf-nwp-masters',
	'redundant-meteo-render-exports',
	'wrf-nwp-cdo-nco-scratch',
])

export const METEOROLOGY_CLIMATE_FAMILY_META = Object.freeze({
	'cf-wmo-climate-standards': {
		id: 'cf-wmo-climate-standards',
		label: 'CF-Conventions, WMO & Archive',
		shortLabel: 'CF/CMOR Standards, WMO BUFR, WRF Namelists & Archive Holds (.bufr, .cdl, .ncml, namelist.wps, CMIP6/ERA5/NOAA)',
	},
	'raw-radar-netcdf-nwp-masters': {
		id: 'raw-radar-netcdf-nwp-masters',
		label: 'Raw Radar, NetCDF & GRIB2',
		shortLabel: 'Verified Science Masters (.nc, .nc4, .grib2, .ar2v, .cfradial, .odimh5, wrfout_*, meteo .hdf5/.zarr)',
	},
	'redundant-meteo-render-exports': {
		id: 'redundant-meteo-render-exports',
		label: 'Redundant Quicklooks & CSVs',
		shortLabel: 'Derived Plots & Exports (Skew-T/radar .png/.gif/.mp4, .csv/.geojson/.kml when NetCDF/GRIB2/Radar anchor exists)',
	},
	'wrf-nwp-cdo-nco-scratch': {
		id: 'wrf-nwp-cdo-nco-scratch',
		label: 'WRF, CDO & Radar Scratch',
		shortLabel: 'NWP & Operator Scratch (wrf_scratch/, cdo_tmp/, nco_tmp/, pyart_cache/, dask_worker_space/, FILE:*, .nc.tmp, .grib2.tmp)',
	},
})

export const METEOROLOGY_CLIMATE_STRATEGIES = Object.freeze([
	'prune-exports-and-meteo-scratch',
	'hardlink-immutable-nc-and-grib',
	'quarantine-exports-and-meteo-scratch',
])

export const METEOROLOGY_CLIMATE_SURVIVOR_RULES = Object.freeze([
	'cf-netcdf-master-first',
	'oldest-observation-first',
	'newest-forecast-run-first',
	'shortest-path',
])

export const METEOROLOGY_CLIMATE_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'meteo-std-protected',
	'raw-radar-netcdf-protected',
	'wmo-archive-embargo-protected',
	'meteo-export-redundant',
	'meteo-scratch-intermediate',
	'shielded',
])

export const METEOROLOGY_CLIMATE_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const METEOROLOGY_CLIMATE_PRESETS = Object.freeze([
	{
		id: 'all-meteorology-climate-audit',
		name: 'All Meteo & Climate Vaults',
		description: 'Audit CF/CMOR standards, WMO BUFR/SYNOP holds, ERA5/CMIP6/NOAA archives, raw NetCDF/GRIB2/WRF/NEXRAD masters, Skew-T/radar quicklooks, and WRF/CDO/Dask scratch.',
		familyFilter: 'all',
		strategy: 'prune-exports-and-meteo-scratch',
		survivorRule: 'cf-netcdf-master-first',
		protectCfWmoStandards: true,
		protectRawRadarNetcdfGribMasters: true,
		protectWmoArchiveHolds: true,
		requireMeteoAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'nwp-cdo-radar-scratch-cleanup',
		name: 'WRF, CDO & Radar Scratch',
		description: 'Reclaim wrf_scratch/, wps_tmp/, cdo_tmp/, nco_tmp/, pyart_cache/, dask_worker_space/, FILE:* intermediates, and .nc.tmp/.grib2.tmp scratch older than the active forecast run grace window.',
		familyFilter: 'all',
		strategy: 'prune-exports-and-meteo-scratch',
		survivorRule: 'cf-netcdf-master-first',
		protectCfWmoStandards: true,
		protectRawRadarNetcdfGribMasters: true,
		protectWmoArchiveHolds: true,
		requireMeteoAnchorForPrune: true,
		keepRecentRunDays: 14,
		minSizeKb: 0,
	},
	{
		id: 'redundant-quicklook-vs-nc-grib',
		name: 'Redundant Plots vs NetCDF/GRIB2',
		description: 'Detect Skew-T, radar loop PNG/GIF/MP4 quicklooks and CSV/GeoJSON exports backed by a verified NetCDF, GRIB2, WRF, or NEXRAD/CFRadial master anchor.',
		familyFilter: 'redundant-meteo-render-exports',
		strategy: 'quarantine-exports-and-meteo-scratch',
		survivorRule: 'cf-netcdf-master-first',
		protectCfWmoStandards: true,
		protectRawRadarNetcdfGribMasters: true,
		protectWmoArchiveHolds: true,
		requireMeteoAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'cf-wmo-archive-shield',
		name: 'CF/CMOR & WMO Archive Shield',
		description: 'Inspect CF/CMOR metadata schemas, WMO BUFR/SYNOP bulletins, WRF namelists, radar calibrations, and ERA5/CMIP6/EUMETSAT/NOAA archival holds under strict shield.',
		familyFilter: 'cf-wmo-climate-standards',
		strategy: 'hardlink-immutable-nc-and-grib',
		survivorRule: 'cf-netcdf-master-first',
		protectCfWmoStandards: true,
		protectRawRadarNetcdfGribMasters: true,
		protectWmoArchiveHolds: true,
		requireMeteoAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'raw-radar-netcdf-grib-masters',
		name: 'Raw Radar, NetCDF & GRIB2 Masters',
		description: 'Audit raw NetCDF3/4 climate cubes, GRIB/GRIB2 NWP forecasts, WRF wrfout/wrfrst runs, NEXRAD Level-II / CFRadial / ODIM_H5 radar scans, and satellite L1B/L2 masters.',
		familyFilter: 'raw-radar-netcdf-nwp-masters',
		strategy: 'hardlink-immutable-nc-and-grib',
		survivorRule: 'cf-netcdf-master-first',
		protectCfWmoStandards: true,
		protectRawRadarNetcdfGribMasters: true,
		protectWmoArchiveHolds: true,
		requireMeteoAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
])

export const METEOROLOGY_CLIMATE_DEFAULT_CONFIG = Object.freeze({
	presetId: 'all-meteorology-climate-audit',
	familyFilter: 'all',
	verdictFilter: 'all',
	strategy: 'prune-exports-and-meteo-scratch',
	survivorRule: 'cf-netcdf-master-first',
	sortMode: 'reclaim_desc',
	searchQuery: '',
	protectCfWmoStandards: true,
	protectRawRadarNetcdfGribMasters: true,
	protectWmoArchiveHolds: true,
	requireMeteoAnchorForPrune: true,
	keepRecentRunDays: 0,
	minSizeKb: 0,
})

const STRICT_METEO_STD_EXT_RE = /\.(?:bufr|synop|metar|taf|speci|wmo|cmor|cdl|ncml|cfmeta|radcal|nml|zmetadata|zattrs|zgroup)$/i
const STRICT_METEO_WRF_NAMELIST_RE = /^namelist\.(?:input|wps|arw|chem|fire)$/i
const STRICT_METEO_NETCDF_EXT_RE = /\.(?:nc|nc3|nc4|netcdf)$/i
const STRICT_METEO_GRIB_RADAR_EXT_RE = /\.(?:grib|grib2|grb|grb2|ar2v|msg31|nexrad|cfradial|odim|odimh5|dorade|sigmet|iris|gamic|mpas|icond2)$/i
const STRICT_METEO_WRF_OUTPUT_NAME_RE = /^(?:wrfout|wrfrst|wrfbdy|wrfinput|wrffdda|wrflowinp|met_em|geo_em)(?:_|\.)/i
const CONTEXT_METEO_SCI_EXT_RE = /\.(?:h5|hdf5|he5|hdf|zarr|uf|vol|ppi|rhi|raw|sounding|edt|mwx|ghg|tob1|tob3|l1b|l2|nat|hrpt)$/i
const CONTEXT_COMPLIANCE_DOC_EXT_RE = /\.(?:xml|json|yaml|yml|pdf|txt|sig|p7s)$/i
const CONTEXT_METEO_EXPORT_EXT_RE = /\.(?:png|jpg|jpeg|webp|tif|tiff|bmp|gif|mp4|mov|mkv|avi|svg|csv|tsv|txt|dat|geojson|kml|kmz)$/i
const STRICT_METEO_SCRATCH_EXT_RE = /\.(?:nc\.tmp|nc3\.tmp|nc4\.tmp|netcdf\.tmp|grib\.tmp|grib2\.tmp|grb2\.tmp|ar2v\.tmp|zarr\.tmp|cdo\.tmp|nco\.tmp|wrf\.tmp|lck|swp)$/i
const STRICT_WPS_INTERMEDIATE_NAME_RE = /^(?:file|pfile|sst|snow):[0-9]{4}-[0-9]{2}-[0-9]{2}/i
const GENERIC_SCRATCH_EXT_RE = /\.(?:tmp|bak|lock|dmp|part|idx|inf|log)$/i

const METEO_CONTEXT_HINT_RE = /(?:meteorolog|weather_?radar|nexrad|cfradial|odim|pyart|wradlib|radx|netcdf|cf_?convention|cmip5|cmip6|cordex|cmor|era5|ecmwf|eccodes|grib2?|wrfout|wrfrst|wrf_?model|wps|ungrib|metgrid|nwp|arome|arpege|icon_?d2|cosmo|mpas|gfs_?forecast|hrrr|nam_?nest|synoptic|radiosonde|dropsonde|skew_?t|sounding|bufr|metar|eumetsat|noaa|ncei|unidata|panoply|metview|grads|cdo_?ops|nco_?ops|xarray|climate_?model|reanalysis|precipitation|reflectivity|doppler|isobar|troposphere|stratosphere|climate_?vault|meteo_?vault)/i
const METEO_CALIBRATION_NAME_RE = /(?:^|[/_-])(?:radar_?calib|zdr_?bias|kdp_?cal|clutter_?map|beam_?blockage|cmor_?table|cf_?table|wmo_?table|station_?inventory|sonde_?cal|sensor_?offset)(?:[/_.-]|$)/i
const METEO_STD_PATH_RE = /(?:00_cf_metadata|00_standards|00_wmo|00_cmor|cmor_tables|cf_metadata|wmo_bufr_tables|station_inventory|radar_calib|calibration_zdr|namelists)/i
const WMO_ARCHIVE_HOLD_PATH_RE = /(?:ecmwf_?era5|era5_?reanalysis|cmip6_?archive|cordex_?archive|eumetsat_?hold|noaa_?ncei|nexrad_?l2_?archive|wmo_?gts|wmo_?embargo|operational_?hold|climate_?baseline|reanalysis_?hold|archive_?hold)/i
const METEO_SCRATCH_PATH_RE = /(?:wrf_scratch|wps_tmp|ungrib_tmp|metgrid_tmp|cdo_tmp|nco_tmp|pyart_cache|wradlib_cache|radx_tmp|eccodes_cache|xarray_dask_spill|dask_worker_space|zarr_staging|era5_download_tmp|nwp_staging|radar_mosaic_tmp|netcdf_cache)/i
const METEO_INTERMEDIATE_PREFIX_RE = /^(?:tmp_cdo_|tmp_nco_|ungrib_|metgrid_tmp_|spill_|chunk_tmp_)/i
const METEO_INTERMEDIATE_SUFFIX_RE = /(?:_regridded_tmp|_cdo_tmp|_nco_tmp|_dealiased_tmp|_staging)$/i
const METEO_PROXY_PATH_RE = /(?:_skewt|_reflectivity|_radar_loop|_quicklook|_isobar_map|_panoply|_metview|_grads_plot|_web_?preview|_preview|_thumb|_overlay|quicklooks|radar_loops|climate_plots)/i
const CANONICAL_VAULT_PATH_RE = /(?:00_golden|00_master|00_raw|00_netcdf|00_grib|00_radar|00_climate|00_reanalysis|canonical|meteo_vault|climate_vault|radar_vault|nwp_archive)/i

/**
 * Normalize configuration values for Meteorology, Weather Radar, NetCDF & Climate Model Vault auditing.
 *
 * @param {object} [rawConfig] Raw user configuration.
 * @return {object} Normalized configuration.
 */
export function normalizeMeteorologyClimateConfig(rawConfig = {}) {
	const cfg = rawConfig && typeof rawConfig === 'object' ? rawConfig : {}
	const familyFilter = METEOROLOGY_CLIMATE_FAMILIES.includes(cfg.familyFilter)
		? cfg.familyFilter
		: METEOROLOGY_CLIMATE_DEFAULT_CONFIG.familyFilter
	const verdictFilter = METEOROLOGY_CLIMATE_VERDICT_FILTERS.includes(cfg.verdictFilter)
		? cfg.verdictFilter
		: METEOROLOGY_CLIMATE_DEFAULT_CONFIG.verdictFilter
	const strategy = METEOROLOGY_CLIMATE_STRATEGIES.includes(cfg.strategy)
		? cfg.strategy
		: METEOROLOGY_CLIMATE_DEFAULT_CONFIG.strategy
	const survivorRule = METEOROLOGY_CLIMATE_SURVIVOR_RULES.includes(cfg.survivorRule)
		? cfg.survivorRule
		: METEOROLOGY_CLIMATE_DEFAULT_CONFIG.survivorRule
	const sortMode = METEOROLOGY_CLIMATE_SORT_MODES.includes(cfg.sortMode)
		? cfg.sortMode
		: METEOROLOGY_CLIMATE_DEFAULT_CONFIG.sortMode

	const keepRecentParsed = Number(cfg.keepRecentRunDays)
	const keepRecentRunDays = Number.isFinite(keepRecentParsed) && keepRecentParsed >= 0
		? Math.floor(keepRecentParsed)
		: METEOROLOGY_CLIMATE_DEFAULT_CONFIG.keepRecentRunDays

	const minSizeParsed = Number(cfg.minSizeKb)
	const minSizeKb = Number.isFinite(minSizeParsed) && minSizeParsed > 0
		? minSizeParsed
		: 0

	return {
		presetId: typeof cfg.presetId === 'string' && cfg.presetId ? cfg.presetId : METEOROLOGY_CLIMATE_DEFAULT_CONFIG.presetId,
		familyFilter,
		verdictFilter,
		strategy,
		survivorRule,
		sortMode,
		searchQuery: typeof cfg.searchQuery === 'string' ? cfg.searchQuery.trim() : '',
		protectCfWmoStandards: cfg.protectCfWmoStandards !== undefined ? Boolean(cfg.protectCfWmoStandards) : true,
		protectRawRadarNetcdfGribMasters: cfg.protectRawRadarNetcdfGribMasters !== undefined ? Boolean(cfg.protectRawRadarNetcdfGribMasters) : true,
		protectWmoArchiveHolds: cfg.protectWmoArchiveHolds !== undefined ? Boolean(cfg.protectWmoArchiveHolds) : true,
		requireMeteoAnchorForPrune: cfg.requireMeteoAnchorForPrune !== undefined ? Boolean(cfg.requireMeteoAnchorForPrune) : true,
		keepRecentRunDays,
		minSizeKb,
		memberOverrides: cfg.memberOverrides && typeof cfg.memberOverrides === 'object' ? { ...cfg.memberOverrides } : {},
	}
}

/**
 * Extract normalized meteorological run, radar volume, or climate variable stem by stripping extensions and suffixes.
 *
 * @param {string} basename Filename without directory.
 * @param {string} [normalized] Full normalized path.
 * @return {string} Normalized run/observation stem.
 */
export function extractMeteorologyClimateStem(basename, normalized = '') {
	let stem = String(basename || normalized || '').trim().toLowerCase()
	stem = stem.replace(/\.(?:nc\.tmp|nc3\.tmp|nc4\.tmp|netcdf\.tmp|grib\.tmp|grib2\.tmp|grb2\.tmp|ar2v\.tmp|zarr\.tmp|cdo\.tmp|nco\.tmp|wrf\.tmp|tar\.nc)$/i, '')
	stem = stem.replace(/\.[a-z0-9]{1,8}$/i, '')
	stem = stem.replace(METEO_INTERMEDIATE_PREFIX_RE, '')
	stem = stem.replace(METEO_INTERMEDIATE_SUFFIX_RE, '')
	stem = stem.replace(/(?:_skewt|_reflectivity|_velocity|_radar_loop|_quicklook|_isobar_map|_panoply|_metview|_grads_plot|_web_preview|_preview|_thumbnail|_timeseries|_export|_csv|_copy|_bak|_draft|_v\d+|_rev\d+)$/i, '')
	return stem || 'meteo-observation'
}

/**
 * Extract canonical anchor key linking derived Skew-T/radar quicklooks or CSV exports to NetCDF/GRIB2/Radar masters.
 *
 * @param {string} runStem Extracted meteorological stem.
 * @return {string} Canonical anchor key.
 */
export function extractMeteorologyClimateAnchorKey(runStem) {
	return String(runStem || 'meteo-observation')
		.toLowerCase()
		.replace(/(?:_dbz|_zdr|_kdp|_vel|_sw|_rhohv|_t2m|_mslp|_z500|_precip|_wind|_plot|_loop|_map|_catalog|_table|_summary|_export)$/i, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '') || 'meteo-observation'
}

/**
 * Detect Meteorology, Weather Radar & Climate Model toolchain and workflow stage from path and filename.
 *
 * @param {string} normalized Normalized path.
 * @param {string} basename Filename.
 * @return {{ meteoToolchain: string, workflowStage: string }} Detected toolchain and stage.
 */
function extractMeteoToolchainAndStage(normalized, basename) {
	const text = `${normalized} ${basename}`.toLowerCase()
	let meteoToolchain = ''
	if (STRICT_METEO_WRF_OUTPUT_NAME_RE.test(basename) || STRICT_METEO_WRF_NAMELIST_RE.test(basename) || /wrf|wps|ungrib|metgrid/.test(text)) {
		meteoToolchain = 'WRF / WPS NWP'
	} else if (/\.(?:grib|grib2|grb|grb2)\b|eccodes|ecmwf|era5|arome|arpege|gfs|hrrr/.test(text)) {
		meteoToolchain = 'ECMWF ecCodes / GRIB2'
	} else if (/\.(?:ar2v|msg31|nexrad|cfradial|odim|odimh5|dorade|sigmet|iris|gamic|uf)\b|pyart|wradlib|radx|nexrad/.test(text)) {
		meteoToolchain = 'NEXRAD / Py-ART / Radx Radar'
	} else if (/cdo_?tmp|nco_?tmp|tmp_cdo_|tmp_nco_|cdo_|nco_/.test(text)) {
		meteoToolchain = 'CDO / NCO Climate Operators'
	} else if (/\.(?:zarr|zmetadata|zattrs|zgroup)\b|xarray|dask/.test(text)) {
		meteoToolchain = 'Zarr / Xarray / Dask Cloud'
	} else if (/\.(?:bufr|synop|metar|taf|speci|wmo)\b|wmo_?gts/.test(text)) {
		meteoToolchain = 'WMO BUFR / Synoptic GTS'
	} else if (/cmip5|cmip6|cordex|cmor|\.(?:cmor|cdl|ncml)\b/.test(text)) {
		meteoToolchain = 'CMIP6 / CMOR Climate Model'
	} else if (/\.(?:l1b|l2|nat|hrpt)\b|eumetsat|noaa_?ncei/.test(text)) {
		meteoToolchain = 'EUMETSAT / NOAA Satellite L1B/L2'
	} else if (/\.(?:nc|nc3|nc4|netcdf)\b|unidata|cf_?convention/.test(text)) {
		meteoToolchain = 'Unidata NetCDF4 / CF-Grid'
	} else if (/panoply|metview|grads|skew_?t/.test(text)) {
		meteoToolchain = 'GrADS / Metview / Panoply Plot'
	}

	let workflowStage = ''
	if (WMO_ARCHIVE_HOLD_PATH_RE.test(text)) {
		workflowStage = 'WMO / Reanalysis Archive Hold'
	} else if (METEO_CALIBRATION_NAME_RE.test(text) || STRICT_METEO_STD_EXT_RE.test(basename) || STRICT_METEO_WRF_NAMELIST_RE.test(basename) || METEO_STD_PATH_RE.test(text)) {
		workflowStage = 'CF / CMOR / WMO Standard'
	} else if (STRICT_METEO_GRIB_RADAR_EXT_RE.test(basename) || STRICT_METEO_WRF_OUTPUT_NAME_RE.test(basename) || STRICT_METEO_NETCDF_EXT_RE.test(basename) || CONTEXT_METEO_SCI_EXT_RE.test(basename)) {
		workflowStage = 'Raw Radar / NetCDF / NWP Master'
	} else if (METEO_SCRATCH_PATH_RE.test(text) || STRICT_METEO_SCRATCH_EXT_RE.test(basename) || STRICT_WPS_INTERMEDIATE_NAME_RE.test(basename) || METEO_INTERMEDIATE_PREFIX_RE.test(basename) || METEO_INTERMEDIATE_SUFFIX_RE.test(basename)) {
		workflowStage = 'WRF / CDO / Radar Scratch'
	} else if (CONTEXT_METEO_EXPORT_EXT_RE.test(basename) || METEO_PROXY_PATH_RE.test(text)) {
		workflowStage = 'Quicklook Plot / CSV Export'
	}

	return { meteoToolchain, workflowStage }
}

/**
 * Extract concise Meteorology & Climate domain tag badge when present.
 *
 * @param {string} lowerBase Lowercase filename.
 * @param {string} lowerPath Lowercase full path.
 * @return {string} Short tag or empty string.
 */
function extractMeteoDomainTag(lowerBase, lowerPath) {
	const text = `${lowerPath} ${lowerBase}`
	if (WMO_ARCHIVE_HOLD_PATH_RE.test(text)) {
		return 'ARCHIVE HOLD'
	}
	if (METEO_CALIBRATION_NAME_RE.test(text)) {
		return 'RADAR / CMOR CAL'
	}
	if (STRICT_METEO_WRF_NAMELIST_RE.test(lowerBase)) {
		return 'WRF-NAMELIST'
	}
	if (/\.(?:bufr|synop|metar|taf|speci|wmo)\b/.test(text)) {
		return 'WMO-BUFR'
	}
	if (/\.(?:cmor|cdl|ncml|cfmeta|zmetadata)\b/.test(text)) {
		return 'CF / CMOR STD'
	}
	if (/\.(?:ar2v|msg31|nexrad|cfradial|odim|odimh5|dorade|sigmet|iris|gamic)\b/.test(text)) {
		return 'RADAR-L2'
	}
	if (/\.(?:grib|grib2|grb|grb2)\b/.test(text)) {
		return 'GRIB2-NWP'
	}
	if (STRICT_METEO_WRF_OUTPUT_NAME_RE.test(lowerBase)) {
		return 'WRF-OUTPUT'
	}
	if (/\.(?:zarr)\b/.test(text)) {
		return 'ZARR-CUBE'
	}
	if (/\.(?:nc|nc3|nc4|netcdf)\b/.test(text)) {
		return 'NETCDF-CF'
	}
	if (/\.(?:sounding|edt|mwx|l1b|l2|nat|hrpt)\b/.test(text)) {
		return 'SONDE / SAT-L1B'
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
 * Classify a single file within the Meteorology, Weather Radar, NetCDF & Climate Model domain.
 *
 * @param {object} file Duplicate file object.
 * @param {number} [referenceNowMs] Reference current timestamp in ms.
 * @return {object} Classification metadata (family === null if non-domain file).
 */
export function classifyMeteorologyClimateFile(file, referenceNowMs = Date.now()) {
	const rawPath = String(file?.path || file?.name || '')
	const normalized = normalizePathForDiff(rawPath)
	const lower = normalized.toLowerCase()
	const slashIdx = normalized.lastIndexOf('/')
	const basename = slashIdx >= 0 ? normalized.slice(slashIdx + 1) : normalized
	const dirname = slashIdx >= 0 ? normalized.slice(0, slashIdx) : ''
	const lowerBase = basename.toLowerCase()
	const size = Math.max(0, Number(file?.size) || 0)
	const { mtimeMs, ageDays, formattedMtime } = parseFileTime(file, referenceNowMs)

	const hasMeteoContext = METEO_CONTEXT_HINT_RE.test(lower)
	const isCalibrationName = METEO_CALIBRATION_NAME_RE.test(lower)
	const isScratchPath = METEO_SCRATCH_PATH_RE.test(lower)
	const isStrictScratchExt = STRICT_METEO_SCRATCH_EXT_RE.test(lowerBase)
	const isWpsIntermediate = STRICT_WPS_INTERMEDIATE_NAME_RE.test(lowerBase) && hasMeteoContext
	const isGenericScratchExt = GENERIC_SCRATCH_EXT_RE.test(lowerBase)
	const isIntermediateSubfile = METEO_INTERMEDIATE_PREFIX_RE.test(lowerBase) || METEO_INTERMEDIATE_SUFFIX_RE.test(lowerBase)
	const isMeteoStdPath = METEO_STD_PATH_RE.test(lower)
	const isWmoArchiveHoldPath = WMO_ARCHIVE_HOLD_PATH_RE.test(lower)
	const isCanonicalVaultPath = CANONICAL_VAULT_PATH_RE.test(lower)
	const isMeteoProxyPath = METEO_PROXY_PATH_RE.test(lower)

	const isStrictMeteoStdExt = STRICT_METEO_STD_EXT_RE.test(lowerBase)
		|| (STRICT_METEO_WRF_NAMELIST_RE.test(lowerBase) && (hasMeteoContext || /^namelist\.(?:wps|arw)$/i.test(lowerBase)))
	const isStrictNetcdfExt = STRICT_METEO_NETCDF_EXT_RE.test(lowerBase)
	const isStrictGribRadarExt = STRICT_METEO_GRIB_RADAR_EXT_RE.test(lowerBase)
	const isStrictWrfOutputName = STRICT_METEO_WRF_OUTPUT_NAME_RE.test(lowerBase)
		&& !isStrictScratchExt
		&& !isGenericScratchExt
		&& !CONTEXT_METEO_EXPORT_EXT_RE.test(lowerBase)
	const isContextMeteoSciExt = CONTEXT_METEO_SCI_EXT_RE.test(lowerBase) && hasMeteoContext
	const isContextComplianceDoc = CONTEXT_COMPLIANCE_DOC_EXT_RE.test(lowerBase) && (isMeteoStdPath || isWmoArchiveHoldPath)
	const isContextMeteoExport = CONTEXT_METEO_EXPORT_EXT_RE.test(lowerBase) && (hasMeteoContext || isMeteoProxyPath)

	let family = null
	let artifactKind = 'Unknown'
	let vaultRole = 'Outside Meteorology & Climate Vault'
	let isProtectedCfWmoStandard = false
	let isProtectedRawMeteoMaster = false
	let isProtectedWmoArchiveHold = false
	let isMeteoMasterAnchor = false
	let isRedundantMeteoExport = false
	let isMutableFile = false

	if (
		isStrictScratchExt
		|| isWpsIntermediate
		|| (isScratchPath && (isGenericScratchExt || isContextMeteoExport || isStrictNetcdfExt || isStrictGribRadarExt || isStrictWrfOutputName || isContextMeteoSciExt || isStrictMeteoStdExt))
		|| (isIntermediateSubfile && (isStrictNetcdfExt || isStrictGribRadarExt || isContextMeteoSciExt || hasMeteoContext))
		|| (isGenericScratchExt && hasMeteoContext)
	) {
		family = 'wrf-nwp-cdo-nco-scratch'
		artifactKind = isStrictScratchExt
			? 'NetCDF / GRIB2 / Radar Scratch'
			: (isWpsIntermediate || isIntermediateSubfile ? 'WPS / CDO / NCO Intermediate' : 'WRF / Dask / Xarray Staging Scratch')
		vaultRole = 'WRF / WPS / CDO / NCO / Py-ART Scratch'
		isMutableFile = true
	} else if (isWmoArchiveHoldPath && (isStrictMeteoStdExt || isStrictNetcdfExt || isStrictGribRadarExt || isStrictWrfOutputName || isContextMeteoSciExt || isContextComplianceDoc)) {
		family = 'cf-wmo-climate-standards'
		artifactKind = 'ECMWF / CMIP6 / EUMETSAT / NOAA Archive Hold'
		vaultRole = 'Protected WMO & Reanalysis Archival Hold'
		isProtectedWmoArchiveHold = true
		isProtectedCfWmoStandard = true
		isMeteoMasterAnchor = isStrictMeteoStdExt || isStrictNetcdfExt || isStrictGribRadarExt || isStrictWrfOutputName || isContextMeteoSciExt
		isMutableFile = /\.(?:xml|json|yaml|yml|txt|bufr|synop|metar|taf|cdl|ncml|nml|zarr|zmetadata|zattrs|zgroup)$/i.test(lowerBase)
	} else if (
		isStrictMeteoStdExt
		|| (isCalibrationName && (isStrictNetcdfExt || isStrictGribRadarExt || isContextMeteoSciExt || isContextComplianceDoc))
		|| (isMeteoStdPath && (isContextComplianceDoc || isStrictNetcdfExt || isStrictGribRadarExt))
	) {
		family = 'cf-wmo-climate-standards'
		if (isCalibrationName) {
			artifactKind = 'Radar Calibration / CMOR Table'
			vaultRole = 'Polarimetric Calibration & Climate Table Baseline'
		} else if (/\.(?:bufr|synop|metar|taf|speci|wmo)$/i.test(lowerBase)) {
			artifactKind = 'WMO BUFR / Synoptic Bulletin'
			vaultRole = 'Operational GTS Synoptic & Upper-Air Standard'
		} else if (STRICT_METEO_WRF_NAMELIST_RE.test(lowerBase) || /\.(?:nml)$/i.test(lowerBase)) {
			artifactKind = 'WRF / NWP Namelist Configuration'
			vaultRole = 'Reproducible Forecast Domain & Physics Config'
		} else {
			artifactKind = 'CF / CMOR / CDL / Zarr Metadata Standard'
			vaultRole = 'Climate Model Provenance & Schema Standard'
		}
		isProtectedCfWmoStandard = true
		isMeteoMasterAnchor = isStrictMeteoStdExt || isStrictNetcdfExt || isStrictGribRadarExt || isContextMeteoSciExt
		isMutableFile = /\.(?:bufr|synop|metar|taf|speci|wmo|cmor|cdl|ncml|cfmeta|radcal|nml|zmetadata|zattrs|zgroup|xml|json|yaml|yml|txt)$/i.test(lowerBase)
			|| STRICT_METEO_WRF_NAMELIST_RE.test(lowerBase)
	} else if (isStrictNetcdfExt || isStrictGribRadarExt || isStrictWrfOutputName || isContextMeteoSciExt) {
		family = 'raw-radar-netcdf-nwp-masters'
		if (/\.(?:ar2v|msg31|nexrad|cfradial|odim|odimh5|dorade|sigmet|iris|gamic|uf|vol|ppi|rhi)$/i.test(lowerBase)) {
			artifactKind = 'Weather Radar Level-II / Polarimetric Master'
			vaultRole = 'NEXRAD / CFRadial / ODIM_H5 Scan Master'
		} else if (/\.(?:grib|grib2|grb|grb2|mpas|icond2)$/i.test(lowerBase) || isStrictWrfOutputName) {
			artifactKind = 'GRIB2 / WRF NWP Model Master'
			vaultRole = 'Numerical Weather Prediction Output Master'
		} else if (/\.(?:sounding|edt|mwx|ghg|tob1|tob3|l1b|l2|nat|hrpt)$/i.test(lowerBase)) {
			artifactKind = 'Radiosonde / Satellite L1B/L2 Telemetry'
			vaultRole = 'Upper-Air & Orbital Radiance Master'
		} else if (/\.(?:zarr)$/i.test(lowerBase)) {
			artifactKind = 'Zarr / Xarray Climate Datacube'
			vaultRole = 'Chunked Climate & Reanalysis Store'
		} else {
			artifactKind = 'NetCDF CF-Grid Climate / Model Master'
			vaultRole = 'Immutable NetCDF / HDF-EOS Science Master'
		}
		isProtectedRawMeteoMaster = true
		isMeteoMasterAnchor = true
		isMutableFile = /\.(?:zarr)$/i.test(lowerBase)
	} else if (isContextComplianceDoc) {
		family = 'cf-wmo-climate-standards'
		artifactKind = 'Climate Archive & Station Manifest'
		vaultRole = 'WMO Station Metadata & Run Provenance'
		isProtectedCfWmoStandard = true
		isMutableFile = true
	} else if (isContextMeteoExport) {
		family = 'redundant-meteo-render-exports'
		if (/\.(?:mp4|mov|mkv|avi|gif)$/i.test(lowerBase)) {
			artifactKind = 'Radar Loop / Forecast Animation Video'
		} else if (/\.(?:csv|tsv|txt|dat|geojson|kml|kmz)$/i.test(lowerBase)) {
			artifactKind = 'Time-Series CSV / GeoJSON / KML Export'
		} else {
			artifactKind = 'Skew-T / Synoptic / Radar Quicklook Plot'
		}
		vaultRole = 'Derived Meteorological Plot or Table Export'
		isRedundantMeteoExport = true
		isMutableFile = true
	}

	const { meteoToolchain, workflowStage } = extractMeteoToolchainAndStage(normalized, basename)
	const runStem = extractMeteorologyClimateStem(basename, normalized)
	const meteoAnchorKey = extractMeteorologyClimateAnchorKey(runStem)
	const meteoTag = extractMeteoDomainTag(lowerBase, lower)

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
		meteoToolchain,
		workflowStage,
		runStem,
		meteoAnchorKey,
		meteoTag,
		isProtectedCfWmoStandard,
		isProtectedRawMeteoMaster,
		isProtectedWmoArchiveHold,
		isMeteoMasterAnchor,
		isRedundantMeteoExport,
		isMutableFile,
		isScratchPath: isScratchPath || isStrictScratchExt || isWpsIntermediate || (isIntermediateSubfile && family === 'wrf-nwp-cdo-nco-scratch') || (isGenericScratchExt && hasMeteoContext),
		isMeteoStdPath,
		isWmoArchiveHoldPath,
		isCanonicalVaultPath,
	}
}

/**
 * Determine whether a duplicate group belongs to the Meteorology, Weather Radar, NetCDF & Climate Model domain.
 *
 * @param {object} group Duplicate group.
 * @return {boolean} True when at least one file belongs to this domain.
 */
export function isMeteorologyClimateGroup(group) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return false
	}
	return group.files.some(file => classifyMeteorologyClimateFile(file).family !== null)
}

/**
 * Build cross-group correlation index linking verified NetCDF/GRIB2/WRF/Radar/Standard anchors
 * to derived Skew-T/radar quicklooks and CSV/GeoJSON exports.
 *
 * @param {Array<object>} groups Domain duplicate groups.
 * @return {object} Correlation index.
 */
export function buildMeteorologyClimateCorrelationIndex(groups) {
	const anchorStems = new Set()
	const anchorKeys = new Set()

	for (const group of Array.isArray(groups) ? groups : []) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (const file of group.files) {
			const meta = classifyMeteorologyClimateFile(file)
			if (!meta.family) {
				continue
			}
			if (meta.isMeteoMasterAnchor) {
				anchorStems.add(meta.runStem)
				anchorKeys.add(meta.meteoAnchorKey)
			}
		}
	}

	return {
		anchorStems,
		anchorKeys,
	}
}

/**
 * Determine primary family for a heterogeneous Meteorology & Climate cluster.
 *
 * @param {Array<object>} members Classified members.
 * @return {string} Family ID.
 */
function resolveClusterFamily(members) {
	if (members.some(m => m.family === 'cf-wmo-climate-standards')) {
		return 'cf-wmo-climate-standards'
	}
	if (members.some(m => m.family === 'raw-radar-netcdf-nwp-masters')) {
		return 'raw-radar-netcdf-nwp-masters'
	}
	if (members.some(m => m.family === 'redundant-meteo-render-exports')) {
		return 'redundant-meteo-render-exports'
	}
	return 'wrf-nwp-cdo-nco-scratch'
}

/**
 * Compute deterministic survivor priority score for a Meteorology & Climate vault member.
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
		return (member.isProtectedWmoArchiveHold ? 100000 : 0)
			+ (member.isProtectedCfWmoStandard ? 97000 : 0)
			+ (member.isProtectedRawMeteoMaster ? 94000 : 0)
			+ (member.isCanonicalVaultPath ? 25000 : 0)
			+ (member.isScratchPath ? -55000 : 0)
			+ (member.isRedundantMeteoExport ? -40000 : 0)
			+ oldestScore
			+ shortPathScore
	}

	if (survivorRule === 'newest-forecast-run-first') {
		return (member.isProtectedWmoArchiveHold ? 100000 : 0)
			+ (member.isProtectedCfWmoStandard ? 97000 : 0)
			+ (member.isProtectedRawMeteoMaster ? 94000 : 0)
			+ (member.isScratchPath ? -50000 : 0)
			+ (member.isRedundantMeteoExport ? -40000 : 0)
			+ mtimeScore
	}

	if (survivorRule === 'shortest-path') {
		return (member.isProtectedWmoArchiveHold ? 52000 : 0)
			+ (member.isProtectedCfWmoStandard ? 50000 : 0)
			+ (member.isProtectedRawMeteoMaster ? 48000 : 0)
			+ (member.isScratchPath ? -30000 : 0)
			+ shortPathScore
	}

	return (member.isProtectedWmoArchiveHold ? 100000 : 0)
		+ (member.isProtectedCfWmoStandard ? 97000 : 0)
		+ (member.isProtectedRawMeteoMaster ? 94000 : 0)
		+ (member.isCanonicalVaultPath ? 25000 : 0)
		+ (member.isRedundantMeteoExport ? -45000 : 0)
		+ (member.isScratchPath ? -60000 : 0)
		+ shortPathScore
}

/**
 * Audit a single Meteorology, Weather Radar, NetCDF & Climate Model duplicate cluster.
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
		const meta = classifyMeteorologyClimateFile(file, referenceNowMs)
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
	const primaryToolchain = rawMembers.find(m => m.meteoToolchain)?.meteoToolchain || ''
	const primaryStage = rawMembers.find(m => m.workflowStage)?.workflowStage || ''
	const primaryStem = rawMembers[0].runStem || extractMeteorologyClimateStem(primaryName, rawMembers[0].normalized)
	const primaryAnchorKey = rawMembers[0].meteoAnchorKey || extractMeteorologyClimateAnchorKey(primaryStem)

	const hasMeteoMasterAnchor = Boolean(
		rawMembers.some(m => m.isMeteoMasterAnchor)
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

		const isRedundantMeteoExportMember = member.isRedundantMeteoExport && hasMeteoMasterAnchor

		let redundancyReason = ''
		if (member.isRedundantMeteoExport) {
			redundancyReason = isRedundantMeteoExportMember
				? 'Derived Skew-T/radar plot or CSV export duplicates verified NetCDF, GRIB2, WRF, or Radar master'
				: 'Meteorological plot or CSV export without verified NetCDF, GRIB2, WRF, or Radar master anchor'
		}

		let governanceTier = 'meteo-scratch-intermediate'
		let shielded = false
		let protectedReason = ''
		let action = 'keep'

		if (override === 'keep') {
			governanceTier = member.isProtectedWmoArchiveHold
				? 'wmo-archive-embargo-protected'
				: (member.isProtectedCfWmoStandard
					? 'meteo-std-protected'
					: (member.isProtectedRawMeteoMaster
						? 'raw-radar-netcdf-protected'
						: (member.isRedundantMeteoExport
							? 'meteo-export-redundant'
							: 'meteo-scratch-intermediate')))
			shielded = true
			protectedReason = 'Manually shielded via per-copy override'
		} else if (member.isProtectedWmoArchiveHold && config.protectWmoArchiveHolds) {
			governanceTier = 'wmo-archive-embargo-protected'
			shielded = true
			protectedReason = 'ECMWF ERA5 / CMIP6 / EUMETSAT / NOAA archival hold strictly conserved'
		} else if (member.isProtectedCfWmoStandard && config.protectCfWmoStandards) {
			governanceTier = 'meteo-std-protected'
			shielded = true
			protectedReason = 'CF/CMOR standard, WMO BUFR bulletin, WRF namelist, or radar calibration strictly conserved'
		} else if (member.isProtectedRawMeteoMaster && config.protectRawRadarNetcdfGribMasters) {
			governanceTier = 'raw-radar-netcdf-protected'
			shielded = true
			protectedReason = 'Verified raw NetCDF, GRIB2, WRF output, or weather radar master strictly conserved'
		} else if (isSurvivor && !isRedundantMeteoExportMember) {
			governanceTier = member.isProtectedWmoArchiveHold
				? 'wmo-archive-embargo-protected'
				: (member.isProtectedCfWmoStandard
					? 'meteo-std-protected'
					: (member.isProtectedRawMeteoMaster
						? 'raw-radar-netcdf-protected'
						: (member.isRedundantMeteoExport
							? 'meteo-export-redundant'
							: 'meteo-scratch-intermediate')))
			shielded = true
			protectedReason = 'Canonical Meteorology & Climate vault survivor retained'
		} else if (override === 'prune') {
			governanceTier = member.isRedundantMeteoExport
				? 'meteo-export-redundant'
				: (member.isProtectedCfWmoStandard
					? 'meteo-std-protected'
					: 'meteo-scratch-intermediate')
			action = config.strategy === 'hardlink-immutable-nc-and-grib' && !member.isMutableFile && !member.isScratchPath
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
			governanceTier = 'meteo-scratch-intermediate'
			shielded = true
			protectedReason = `Within ${config.keepRecentRunDays}-day active NWP forecast or CDO/NCO processing grace window`
		} else if (member.isRedundantMeteoExport) {
			governanceTier = 'meteo-export-redundant'
			if (config.requireMeteoAnchorForPrune && !hasMeteoMasterAnchor) {
				shielded = true
				protectedReason = 'Blocked until a verified NetCDF, GRIB2, WRF, or Radar master anchor exists'
			} else {
				action = 'delete'
				deleteTargetsCount += 1
				reclaimableBytes += member.size
				protectedReason = redundancyReason
			}
		} else if (member.isScratchPath) {
			governanceTier = 'meteo-scratch-intermediate'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
			protectedReason = 'WRF/WPS, CDO/NCO, Py-ART, or Dask staging scratch eligible for cleanup'
		} else if (member.isProtectedRawMeteoMaster || member.isProtectedCfWmoStandard) {
			governanceTier = member.isProtectedCfWmoStandard ? 'meteo-std-protected' : 'raw-radar-netcdf-protected'
			action = config.strategy === 'hardlink-immutable-nc-and-grib' && !member.isMutableFile ? 'hardlink' : 'delete'
			if (action === 'hardlink') {
				hardlinkSavingsBytes += member.size
				hardlinkTargetsCount += 1
			} else {
				deleteTargetsCount += 1
			}
			reclaimableBytes += member.size
		} else if (config.strategy === 'hardlink-immutable-nc-and-grib' && !member.isMutableFile) {
			governanceTier = 'raw-radar-netcdf-protected'
			action = 'hardlink'
			hardlinkSavingsBytes += member.size
			hardlinkTargetsCount += 1
			reclaimableBytes += member.size
		} else {
			governanceTier = 'meteo-scratch-intermediate'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
		}

		if (shielded) {
			shieldedCount += 1
		}

		return {
			...member,
			isRedundantMeteoExportMember,
			redundancyReason,
			isSurvivor,
			governanceTier,
			shielded,
			protectedReason,
			action,
		}
	})

	const hasRedundantMeteoExport = members.some(m => m.isRedundantMeteoExportMember || m.isRedundantMeteoExport)
	const hasProtectedWmoArchiveHold = members.some(m => m.governanceTier === 'wmo-archive-embargo-protected' && m.shielded)
	const hasProtectedCfWmoStandard = members.some(m => m.governanceTier === 'meteo-std-protected' && m.shielded)
	const hasProtectedRawMeteoMaster = members.some(m => m.governanceTier === 'raw-radar-netcdf-protected' && m.shielded)
	const hasMeteoScratchIntermediate = members.some(m => m.isScratchPath)

	let clusterVerdict = 'shielded'
	if (reclaimableBytes > 0) {
		if (members.some(m => m.isRedundantMeteoExportMember && !m.shielded)) {
			clusterVerdict = 'meteo-export-redundant'
		} else if (members.some(m => m.isScratchPath && !m.shielded)) {
			clusterVerdict = 'meteo-scratch-intermediate'
		} else {
			clusterVerdict = 'reclaimable'
		}
	} else if (hasProtectedWmoArchiveHold) {
		clusterVerdict = 'wmo-archive-embargo-protected'
	} else if (hasProtectedCfWmoStandard) {
		clusterVerdict = 'meteo-std-protected'
	} else if (hasProtectedRawMeteoMaster) {
		clusterVerdict = 'raw-radar-netcdf-protected'
	}

	let priorityScore = 10
	if (reclaimableBytes > 0) {
		priorityScore = hasRedundantMeteoExport ? 95 : 85
	} else if (hasProtectedWmoArchiveHold) {
		priorityScore = 60
	} else if (hasProtectedCfWmoStandard) {
		priorityScore = 50
	}

	const meteoTags = [...new Set(members.map(m => m.meteoTag).filter(Boolean))]
	const familyMeta = METEOROLOGY_CLIMATE_FAMILY_META[family] || METEOROLOGY_CLIMATE_FAMILY_META['wrf-nwp-cdo-nco-scratch']

	return {
		id: group.id ?? primaryName,
		hash: group.hash || '',
		name: primaryName,
		meteoToolchain: primaryToolchain,
		workflowStage: primaryStage,
		runStem: primaryStem,
		meteoAnchorKey: primaryAnchorKey,
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
		hasProtectedCfWmoStandard,
		hasProtectedRawMeteoMaster,
		hasProtectedWmoArchiveHold,
		hasRedundantMeteoExport,
		hasMeteoScratchIntermediate,
		hasMeteoMasterAnchor,
		meteoTags,
		members,
		sourceGroup: group,
	}
}

/**
 * Audit a list of duplicate groups as a Meteorology, Weather Radar, NetCDF & Climate Model Vault.
 *
 * @param {Array<object>} groups Duplicate groups.
 * @param {object} [rawConfig] Optional audit configuration.
 * @param {number} [referenceNowMs] Optional reference timestamp in ms.
 * @return {object} Comprehensive Meteorology & Climate vault audit report.
 */
export function auditMeteorologyClimateVault(groups, rawConfig = {}, referenceNowMs = Date.now()) {
	const config = normalizeMeteorologyClimateConfig(rawConfig)
	const groupList = Array.isArray(groups) ? groups : []

	const domainGroups = groupList.filter(isMeteorologyClimateGroup)
	const correlationIndex = buildMeteorologyClimateCorrelationIndex(domainGroups)

	const allClusters = domainGroups
		.map(group => auditSingleCluster(group, correlationIndex, config, referenceNowMs))
		.filter(Boolean)

	const minBytes = config.minSizeKb * 1024
	const sizeFiltered = allClusters.filter(cluster => cluster.unitBytes >= minBytes || cluster.totalBytes >= minBytes)

	const familyCounts = {
		'cf-wmo-climate-standards': 0,
		'raw-radar-netcdf-nwp-masters': 0,
		'redundant-meteo-render-exports': 0,
		'wrf-nwp-cdo-nco-scratch': 0,
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
				cluster.meteoToolchain,
				cluster.workflowStage,
				cluster.runStem,
				cluster.meteoAnchorKey,
				cluster.familyLabel,
				...cluster.meteoTags,
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
	let totalCfWmoStdClusters = 0
	let totalRawMeteoMasterClusters = 0
	let totalWmoArchiveHoldClusters = 0
	let totalRedundantExportClusters = 0
	let totalMeteoScratchClusters = 0

	for (const cluster of filteredClusters) {
		rawDuplicateBytes += Math.max(0, cluster.totalBytes - cluster.unitBytes)
		reclaimableBytes += cluster.reclaimableBytes
		totalReclaimableCopiesCount += cluster.reclaimableTargetsCount
		totalShieldedCopiesCount += cluster.shieldedCount
		if (cluster.hasProtectedCfWmoStandard) {
			totalCfWmoStdClusters += 1
		}
		if (cluster.hasProtectedRawMeteoMaster) {
			totalRawMeteoMasterClusters += 1
		}
		if (cluster.hasProtectedWmoArchiveHold) {
			totalWmoArchiveHoldClusters += 1
		}
		if (cluster.hasRedundantMeteoExport) {
			totalRedundantExportClusters += 1
		}
		if (cluster.hasMeteoScratchIntermediate) {
			totalMeteoScratchClusters += 1
		}
	}

	const reclaimableGb = `${(reclaimableBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
	const efficiencyPct = rawDuplicateBytes > 0
		? Math.min(100, Math.round((reclaimableBytes / rawDuplicateBytes) * 100))
		: 0

	const familyBreakdown = METEOROLOGY_CLIMATE_FAMILIES
		.filter(id => id !== 'all')
		.map(id => ({
			id,
			label: METEOROLOGY_CLIMATE_FAMILY_META[id].label,
			shortLabel: METEOROLOGY_CLIMATE_FAMILY_META[id].shortLabel,
			clustersCount: familyCounts[id] || 0,
		}))

	return {
		schema: METEOROLOGY_CLIMATE_VAULT_SCHEMA,
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
			totalCfWmoStdClusters,
			totalRawMeteoMasterClusters,
			totalWmoArchiveHoldClusters,
			totalRedundantExportClusters,
			totalMeteoScratchClusters,
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
 * Build a safe POSIX DRY_RUN=1 remediation script for Meteorology, Weather Radar & Climate Model Vaults.
 * Strictly blocks deletion or hardlinking of shielded CF/WMO standards, Archive Holds,
 * and verified Raw NetCDF/GRIB2/WRF/Radar masters, and never hardlinks mutable files or scratch.
 *
 * @param {object} auditResult Result from auditMeteorologyClimateVault.
 * @return {string} POSIX bash script.
 */
export function buildMeteorologyClimateRemediationScript(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# Meteorology, Weather Radar, NetCDF & Climate Model Vault Auditor',
		'# Safe POSIX Remediation Script (default DRY_RUN=1)',
		'# Run with DRY_RUN=0 ./meteorology-climate-vault-reclaim.sh only after verifying NetCDF/GRIB2/Radar anchors.',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'QUARANTINE_DIR="$' + '{QUARANTINE_DIR:-./.meteorology-climate-scratch-quarantine}"',
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
	const strategy = auditResult?.config?.strategy || 'prune-exports-and-meteo-scratch'
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
			} else if (strategy === 'quarantine-exports-and-meteo-scratch' && (target.isRedundantMeteoExport || target.isScratchPath)) {
				lines.push('run_cmd mkdir -p "$QUARANTINE_DIR"')
				lines.push(`run_cmd mv -n ${quotePosixPath(target.normalized)} "$QUARANTINE_DIR/"`)
			} else {
				lines.push(`run_cmd rm -f ${quotePosixPath(target.normalized)}`)
			}
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('printf "No reclaimable Skew-T/radar quicklooks or WRF/CDO/NCO scratch under active Meteorology & Climate shields.\\n"')
	} else {
		lines.push(`printf "Completed Meteorology & Climate Vault remediation plan (%d target actions, DRY_RUN=%s).\\n" "${actionCount}" "$DRY_RUN"`)
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe RFC-4180 CSV audit report.
 *
 * @param {object} auditResult Result from auditMeteorologyClimateVault.
 * @return {string} RFC-4180 CSV string.
 */
export function buildMeteorologyClimateCsvReport(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const headers = [
		'cluster_id',
		'cluster_name',
		'meteo_toolchain',
		'workflow_stage',
		'run_stem',
		'meteo_anchor_key',
		'family',
		'cluster_verdict',
		'has_meteo_master_anchor',
		'is_redundant_meteo_export',
		'is_meteo_scratch',
		'member_path',
		'artifact_kind',
		'vault_role',
		'meteo_tag',
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
				cluster.meteoToolchain || '',
				cluster.workflowStage || '',
				cluster.runStem,
				cluster.meteoAnchorKey,
				cluster.family,
				cluster.clusterVerdict,
				cluster.hasMeteoMasterAnchor ? 'true' : 'false',
				member.isRedundantMeteoExportMember ? 'true' : 'false',
				member.isScratchPath ? 'true' : 'false',
				member.normalized,
				member.artifactKind,
				member.vaultRole,
				member.meteoTag || '',
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
 * @param {object} auditResult Result from auditMeteorologyClimateVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildMeteorologyClimateJsonManifest(auditResult) {
	const payload = {
		schema: METEOROLOGY_CLIMATE_VAULT_SCHEMA,
		generatedAt: new Date().toISOString(),
		config: auditResult?.config || METEOROLOGY_CLIMATE_DEFAULT_CONFIG,
		summary: auditResult?.summary || {},
		clusters: (auditResult?.clusters || []).map(cluster => ({
			id: cluster.id,
			name: cluster.name,
			meteoToolchain: cluster.meteoToolchain,
			workflowStage: cluster.workflowStage,
			runStem: cluster.runStem,
			meteoAnchorKey: cluster.meteoAnchorKey,
			family: cluster.family,
			clusterVerdict: cluster.clusterVerdict,
			unitBytes: cluster.unitBytes,
			totalBytes: cluster.totalBytes,
			reclaimableBytes: cluster.reclaimableBytes,
			survivorPath: cluster.survivorPath,
			hasProtectedCfWmoStandard: cluster.hasProtectedCfWmoStandard,
			hasProtectedRawMeteoMaster: cluster.hasProtectedRawMeteoMaster,
			hasProtectedWmoArchiveHold: cluster.hasProtectedWmoArchiveHold,
			hasRedundantMeteoExport: cluster.hasRedundantMeteoExport,
			hasMeteoScratchIntermediate: cluster.hasMeteoScratchIntermediate,
			hasMeteoMasterAnchor: cluster.hasMeteoMasterAnchor,
			meteoTags: cluster.meteoTags,
			members: (cluster.members || []).map(member => ({
				path: member.normalized,
				artifactKind: member.artifactKind,
				vaultRole: member.vaultRole,
				meteoTag: member.meteoTag || '',
				governanceTier: member.governanceTier,
				action: member.action,
				shielded: member.shielded,
				protectedReason: member.protectedReason,
				isRedundantMeteoExportMember: member.isRedundantMeteoExportMember,
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
 * cloud sync of WRF/WPS, CDO, NCO, Py-ART, Radx, and Dask/Zarr scratch directories.
 *
 * @return {string} Line-delimited .sync-exclude.lst rules.
 */
export function buildMeteorologyClimateSyncExcludeList() {
	return [
		'# Nextcloud / rsync exclusion rules for Meteorology, Weather Radar, NetCDF & Climate Model Vaults',
		'wrf_scratch/',
		'wps_tmp/',
		'ungrib_tmp/',
		'metgrid_tmp/',
		'cdo_tmp/',
		'nco_tmp/',
		'pyart_cache/',
		'wradlib_cache/',
		'radx_tmp/',
		'eccodes_cache/',
		'xarray_dask_spill/',
		'dask_worker_space/',
		'zarr_staging/',
		'era5_download_tmp/',
		'nwp_staging/',
		'radar_mosaic_tmp/',
		'netcdf_cache/',
		'FILE:*',
		'PFILE:*',
		'tmp_cdo_*',
		'tmp_nco_*',
		'*.nc.tmp',
		'*.nc3.tmp',
		'*.nc4.tmp',
		'*.netcdf.tmp',
		'*.grib.tmp',
		'*.grib2.tmp',
		'*.grb2.tmp',
		'*.ar2v.tmp',
		'*.zarr.tmp',
		'*.cdo.tmp',
		'*.nco.tmp',
		'*.wrf.tmp',
		'*.lck',
		'*.lock',
		'*.tmp',
	].join('\n')
}
