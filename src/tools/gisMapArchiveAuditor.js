/**
 * Pure GIS, GeoSpatial Tile & CAD/BIM Map Archive Vault Auditor.
 * Classifies and audits duplicate clusters across 4 GeoSpatial & CAD/BIM Vault families:
 * - Vector / GIS Datasets (*.geojson, *.gpkg, *.shp/*.dbf/*.shx/*.prj sidecar bundles, *.kml, *.kmz)
 * - Raster / DEM Imagery (*.tif, *.geotiff, *.mbtiles, *.jp2, *.ecw)
 * - CAD / BIM Site Models (*.dwg, *.dxf, *.ifc, *.rvt, *.las, *.laz)
 * - GIS Tile & Pyramid Caches (*.ovr, *.aux.xml, tiles/, *.qgz~)
 *
 * Groups artifacts deterministically by project + CRS + normalized tile-set/layer signature,
 * shields canonical GeoPackage/IFC/GeoTIFF masters and prevents orphaning .shp sidecar bundles by default,
 * and computes safe reclaimable GB plus POSIX DRY_RUN=1 remediation scripts, CWE-1236 CSV exports,
 * JSON manifests, and .sync-exclude.lst rules.
 *
 * Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const GIS_MAP_ARCHIVE_SCHEMA = 'duplicatefinder.gis-map-archive-auditor.v1'

export const GIS_MAP_FAMILIES = Object.freeze([
	'all',
	'vector-gis-datasets',
	'raster-dem-imagery',
	'cad-bim-site-models',
	'gis-tile-pyramid-caches',
])

export const GIS_MAP_FAMILY_META = Object.freeze({
	'vector-gis-datasets': {
		id: 'vector-gis-datasets',
		label: 'Vector / GIS Datasets',
		shortLabel: 'Vector (.geojson/.gpkg/.shp+.dbf+.shx+.prj/.kml/.kmz)',
	},
	'raster-dem-imagery': {
		id: 'raster-dem-imagery',
		label: 'Raster / DEM Imagery',
		shortLabel: 'Raster/DEM (.tif/.geotiff/.mbtiles/.jp2/.ecw)',
	},
	'cad-bim-site-models': {
		id: 'cad-bim-site-models',
		label: 'CAD / BIM Site Models',
		shortLabel: 'CAD/BIM (.dwg/.dxf/.ifc/.rvt/.las/.laz)',
	},
	'gis-tile-pyramid-caches': {
		id: 'gis-tile-pyramid-caches',
		label: 'GIS Tile & Pyramid Caches',
		shortLabel: 'Caches (.ovr/.aux.xml/tiles/*.qgz~)',
	},
})

export const GIS_MAP_STRATEGIES = Object.freeze([
	'prune-caches-and-redundant-exports',
	'consolidate-gis-vault-hardlinks',
	'prune-tile-pyramids-and-caches-only',
])

export const GIS_MAP_SURVIVOR_RULES = Object.freeze([
	'canonical-gpkg-ifc-geotiff-first',
	'latest-revision-first',
	'shortest-path',
])

export const GIS_MAP_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'canonical-master',
	'shp-sidecar',
	'tile-cache',
	'cad-bim',
	'shielded',
])

export const GIS_MAP_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const GIS_MAP_PRESETS = Object.freeze([
	{
		id: 'all-gis-map-archive-audit',
		name: 'All GIS & CAD/BIM Map Audit',
		description: 'Audit vector GIS datasets, raster/DEM imagery, CAD/BIM site models, and tile/pyramid caches while shielding canonical GeoPackage/IFC/GeoTIFF masters and .shp sidecar bundles.',
		familyFilter: 'all',
		strategy: 'prune-caches-and-redundant-exports',
		survivorRule: 'canonical-gpkg-ifc-geotiff-first',
		protectCanonicalMasters: true,
		preventOrphaningShpSidecars: true,
		staleCacheDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'prune-tile-pyramids-and-caches',
		name: 'Prune Tile & Pyramid Caches',
		description: 'Reclaim duplicate .ovr pyramid overviews, .aux.xml sidecar stats, tiles/ raster caches, and .qgz~ autosave backups older than the retention window.',
		familyFilter: 'gis-tile-pyramid-caches',
		strategy: 'prune-tile-pyramids-and-caches-only',
		survivorRule: 'canonical-gpkg-ifc-geotiff-first',
		protectCanonicalMasters: true,
		preventOrphaningShpSidecars: true,
		staleCacheDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'consolidate-gis-vault-hardlinks',
		name: 'Hardlink-Consolidate GIS Vault',
		description: 'Deduplicate mirrored GeoTIFF rasters, MBTiles basemaps, and CAD/BIM site models onto canonical anchors via POSIX hardlinks while preserving .shp sidecar integrity.',
		familyFilter: 'all',
		strategy: 'consolidate-gis-vault-hardlinks',
		survivorRule: 'canonical-gpkg-ifc-geotiff-first',
		protectCanonicalMasters: true,
		preventOrphaningShpSidecars: true,
		staleCacheDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'audit-vector-gis-and-shp',
		name: 'Vector GIS & SHP Sidecars',
		description: 'Audit duplicate .geojson, .gpkg, .kml, .kmz, and .shp/.dbf/.shx/.prj bundles while preventing accidental orphaning of shapefile sidecars.',
		familyFilter: 'vector-gis-datasets',
		strategy: 'prune-caches-and-redundant-exports',
		survivorRule: 'canonical-gpkg-ifc-geotiff-first',
		protectCanonicalMasters: true,
		preventOrphaningShpSidecars: true,
		staleCacheDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'audit-cad-bim-and-rasters',
		name: 'CAD/BIM Site Models',
		description: 'Audit duplicate .dwg, .dxf, .ifc, .rvt, and .las/.laz LiDAR point clouds grouped by project and CRS while shielding canonical IFC masters.',
		familyFilter: 'cad-bim-site-models',
		strategy: 'prune-caches-and-redundant-exports',
		survivorRule: 'latest-revision-first',
		protectCanonicalMasters: true,
		preventOrphaningShpSidecars: true,
		staleCacheDays: 14,
		minSizeMb: 0,
	},
])

const VECTOR_GIS_EXT_SET = new Set([
	'geojson',
	'gpkg',
	'shp',
	'dbf',
	'shx',
	'prj',
	'cpg',
	'sbn',
	'sbx',
	'qix',
	'kml',
	'kmz',
	'gml',
	'fgb',
	'topojson',
])

const SHAPEFILE_SIDECAR_EXT_SET = new Set([
	'shp',
	'dbf',
	'shx',
	'prj',
	'cpg',
	'sbn',
	'sbx',
	'qix',
])

const RASTER_DEM_EXT_SET = new Set([
	'tif',
	'tiff',
	'geotiff',
	'gtiff',
	'mbtiles',
	'jp2',
	'ecw',
	'sid',
	'img',
	'asc',
	'dem',
	'hgt',
	'cog',
])

const CAD_BIM_EXT_SET = new Set([
	'dwg',
	'dxf',
	'ifc',
	'rvt',
	'las',
	'laz',
	'e57',
	'nwd',
	'nwc',
	'dgn',
	'skp',
])

const TILE_PYRAMID_CACHE_EXT_SET = new Set([
	'ovr',
	'aux.xml',
	'qgz~',
	'qgs~',
	'rrd',
	'mxd.bak',
	'dwl',
	'dwl2',
	'pbf',
	'mvt',
])

const TILE_CACHE_IMAGE_EXT_SET = new Set([
	'png',
	'jpg',
	'jpeg',
	'webp',
	'pbf',
	'mvt',
])

const TILE_CACHE_PATH_RE = /(\/(?:tiles?|tile[_-]?cache|tilecache|xyz|tms|wmts|pyramids?|overviews?|map[_-]?cache|qgis[_-]?cache|arcgis[_-]?cache|_alllayers|l\d{2}\/r[0-9a-f]+)(?:\/|$))/i
const GIS_AUTOSAVE_NAME_RE = /(?:\.aux\.xml$|\.ovr$|\.qgz~$|\.qgs~$|\.mxd\.bak$|\.dwl2?$|[._-](?:pyramid|overview|tilecache|autosave|bak)(?:[._-\d]|$))/i

const CANONICAL_MASTER_PATH_RE = /(\/(?:gis[_-]?vault|geo[_-]?vault|map[_-]?vault|canonical|masters?|master[_-]?data|bim[_-]?vault|cad[_-]?vault|production|projects?|surveys?|geodata|__groupfolders\/\d+\/(?:gis|geo|maps?|bim|cad|surveys?))(?:\/|$))/i
const EXPORT_STAGING_PATH_RE = /(\/(?:downloads?|telechargements?|tmp|temp|scratch|staging|exports?[_-]?tmp|deliverables?[_-]?old|incoming|dropzone|wetransfer|desktop|review[_-]?exports?)(?:\/|$))/i

const CRS_EPSG_RE = /(?:epsg[:_-]?|srid[:_-]?)(\d{4,5})/i
const CRS_NAMED_RE = /\b(wgs84|wgs[_-]?84|nad83|nad[_-]?83|rgf93|lambert93|etrs89|web[_-]?mercator|utm\d{1,2}[ns])\b/i
const REVISION_RE = /(?:^|[._\s-])(?:v|ver|rev|r|ed|survey|run)[._-]?(\d{1,3})(?:[._\s-]|$)/i

const IGNORED_PROJECT_SEGMENTS = new Set([
	'files',
	'gis',
	'gis-vault',
	'geo',
	'geo-vault',
	'geospatial',
	'geodata',
	'maps',
	'map-vault',
	'map-archive',
	'projects',
	'project',
	'surveys',
	'survey',
	'vectors',
	'vector',
	'rasters',
	'raster',
	'dem',
	'imagery',
	'orthophotos',
	'cad',
	'cad-vault',
	'bim',
	'bim-vault',
	'models',
	'lidar',
	'pointclouds',
	'tiles',
	'tilecache',
	'tile-cache',
	'pyramids',
	'overviews',
	'cache',
	'canonical',
	'masters',
	'master',
	'master-data',
	'exports',
	'staging',
	'downloads',
	'telechargements',
	'tmp',
	'temp',
	'desktop',
	'__groupfolders',
	'users',
	'home',
	'var',
	'www',
	'nextcloud',
	'data',
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
 * Extract lowercase extension including chained GIS cache extensions (.aux.xml, .qgz~, .mxd.bak).
 *
 * @param {string} basename File basename.
 * @return {string} Lowercase extension without leading dot.
 */
function getExtension(basename) {
	if (!basename || typeof basename !== 'string') {
		return ''
	}
	const lower = basename.toLowerCase()
	if (lower.endsWith('.aux.xml')) {
		return 'aux.xml'
	}
	if (lower.endsWith('.mxd.bak')) {
		return 'mxd.bak'
	}
	if (lower.endsWith('.qgz~')) {
		return 'qgz~'
	}
	if (lower.endsWith('.qgs~')) {
		return 'qgs~'
	}
	const dotIdx = lower.lastIndexOf('.')
	if (dotIdx <= 0 || dotIdx === lower.length - 1) {
		return ''
	}
	return lower.slice(dotIdx + 1)
}

/**
 * Extract basename stem without extension for shapefile bundle matching.
 *
 * @param {string} basename File basename.
 * @return {string} Lowercase stem without extension.
 */
function getShapefileStem(basename) {
	if (!basename || typeof basename !== 'string') {
		return ''
	}
	const lower = basename.toLowerCase()
	const dotIdx = lower.lastIndexOf('.')
	return dotIdx > 0 ? lower.slice(0, dotIdx) : lower
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
 * Extract GIS/BIM project or survey name from path or basename.
 *
 * @param {string} basename File basename.
 * @param {string} fullPath Full normalized path.
 * @return {string} Normalized project slug.
 */
export function extractGisProjectName(basename, fullPath = '') {
	const segments = safeNormalizePath(fullPath).split('/').filter(Boolean)
	const dirSegments = segments.slice(0, -1)

	for (let i = 0; i < dirSegments.length; i += 1) {
		const segLower = dirSegments[i].toLowerCase()
		if (
			/^(?:gis[_-]?vault|geo[_-]?vault|map[_-]?vault|projects?|surveys?|cad[_-]?vault|bim[_-]?vault|geodata|rasters?|vectors?|tiles?|tilecache|masters?|canonical)$/.test(segLower)
			&& i + 1 < dirSegments.length
		) {
			const nextSeg = dirSegments[i + 1].toLowerCase()
			if (nextSeg && !IGNORED_PROJECT_SEGMENTS.has(nextSeg) && !/^\d+$/.test(nextSeg) && !/^z\d{1,2}$/.test(nextSeg)) {
				return nextSeg.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'gis-project'
			}
		}
	}

	for (let i = dirSegments.length - 1; i >= 0; i -= 1) {
		const clean = dirSegments[i].toLowerCase()
		if (clean && !IGNORED_PROJECT_SEGMENTS.has(clean) && !/^\d+$/.test(clean) && !/^z\d{1,2}$/.test(clean)) {
			return clean.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'gis-project'
		}
	}

	return normalizeGisTileSignature(basename, fullPath)
}

/**
 * Extract CRS / EPSG code signature from basename or path.
 *
 * @param {string} basename File basename.
 * @param {string} fullPath Full normalized path.
 * @return {string} Normalized CRS label (e.g. EPSG:2154, WGS84, CRS-UNSPECIFIED).
 */
export function extractCrsCode(basename, fullPath = '') {
	const epsgMatch = CRS_EPSG_RE.exec(basename) || CRS_EPSG_RE.exec(fullPath)
	if (epsgMatch) {
		return `EPSG:${epsgMatch[1]}`
	}
	const namedMatch = CRS_NAMED_RE.exec(basename) || CRS_NAMED_RE.exec(fullPath)
	if (namedMatch) {
		return namedMatch[1].toUpperCase().replace(/[_-]+/g, '')
	}
	return 'CRS-UNSPECIFIED'
}

/**
 * Parse revision number from GIS/CAD filename or path.
 *
 * @param {string} basename File basename.
 * @param {string} fullPath Full normalized path.
 * @return {number} Parsed revision number or 0.
 */
export function parseGisRevision(basename, fullPath = '') {
	const match = REVISION_RE.exec(basename) || REVISION_RE.exec(fullPath)
	if (!match) {
		return 0
	}
	const num = Number.parseInt(match[1], 10)
	return Number.isFinite(num) && num > 0 ? num : 0
}

/**
 * Normalize a GIS dataset, raster, CAD/BIM model, or tile filename into a deterministic tile-set/layer signature.
 *
 * @param {string} basename File basename.
 * @param {string} fullPath Full normalized path.
 * @return {string} Normalized tile-set/layer signature slug.
 */
export function normalizeGisTileSignature(basename, fullPath = '') {
	if (!basename || typeof basename !== 'string') {
		return 'untitled-layer'
	}
	let stem = basename.trim()
	// Strip chained GIS overview / auxiliary / backup extensions first
	stem = stem.replace(/\.(?:aux\.xml|mxd\.bak|ovr|qgz~|qgs~|rrd|dwl2?)$/i, '')
	const dotIdx = stem.lastIndexOf('.')
	if (dotIdx > 0) {
		stem = stem.slice(0, dotIdx)
	}
	// Strip secondary GIS extension if still chained (e.g. ortho.tif.ovr -> ortho)
	stem = stem.replace(/\.(?:tif|tiff|geotiff|gtiff|jp2|ecw|shp|gpkg|geojson|dwg|dxf|ifc|rvt|las|laz|mbtiles)$/i, '')

	let prev = ''
	while (prev !== stem) {
		prev = stem
		stem = stem.replace(/(?:\s*\(\d+\)|[._\s-]+(?:copy|backup|bak|autosave|dup|duplicate|old|export|tmp|v\d+|rev\d+|\d{4}[-_]\d{2}[-_]\d{2}))+$/gi, '')
	}
	stem = stem
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')

	// If inside numeric slippy tile path like /tiles/14/8291/5642.png, include zoom tile prefix
	const tileZoomMatch = /\/(?:tiles?|xyz|tms|wmts)\/(\d{1,2})\/(\d+)\/(\d+)\.[^/]+$/i.exec(safeNormalizePath(fullPath))
	if (tileZoomMatch) {
		return `tile-z${tileZoomMatch[1]}-${tileZoomMatch[2]}-${tileZoomMatch[3]}`
	}

	return stem || 'gis-layer'
}

/**
 * Detect GIS/BIM authoring tool and format badge for display.
 *
 * @param {string} ext File extension.
 * @param {string} fullPath Full normalized path.
 * @param {string} family Assigned family ID.
 * @param {boolean} isCanonicalMaster Whether file is a canonical GeoPackage/IFC/GeoTIFF master.
 * @param {boolean} isShpSidecar Whether file belongs to a shapefile bundle.
 * @return {object} GIS tool label and format badge.
 */
function detectGisToolAndFormat(ext, fullPath, family, isCanonicalMaster, isShpSidecar) {
	const lowerPath = fullPath.toLowerCase()
	let gisTool = 'OGC / GeoSpatial'
	if (ext === 'gpkg' || ext === 'qgz~' || ext === 'qgs~' || lowerPath.includes('qgis')) {
		gisTool = 'QGIS / OGC GeoPackage'
	} else if (isShpSidecar || ext === 'mxd.bak' || lowerPath.includes('arcgis') || lowerPath.includes('esri')) {
		gisTool = 'Esri Shapefile / ArcGIS'
	} else if (ext === 'ifc' || ext === 'rvt' || ext === 'nwd' || ext === 'nwc' || lowerPath.includes('revit') || lowerPath.includes('bim')) {
		gisTool = 'BIM / IFC / Revit'
	} else if (ext === 'dwg' || ext === 'dxf' || ext === 'dwl' || ext === 'dwl2' || ext === 'dgn') {
		gisTool = 'AutoCAD / Civil 3D'
	} else if (ext === 'las' || ext === 'laz' || ext === 'e57') {
		gisTool = 'PDAL / LiDAR Point Cloud'
	} else if (ext === 'mbtiles' || ext === 'pbf' || ext === 'mvt') {
		gisTool = 'MBTiles / Vector Tiles'
	} else if (ext === 'tif' || ext === 'tiff' || ext === 'geotiff' || ext === 'gtiff' || ext === 'jp2' || ext === 'ecw' || ext === 'ovr' || ext === 'aux.xml') {
		gisTool = 'GDAL / Raster DEM'
	} else if (ext === 'geojson' || ext === 'topojson' || ext === 'fgb') {
		gisTool = 'GeoJSON / OGC Vector'
	} else if (ext === 'kml' || ext === 'kmz') {
		gisTool = 'Google Earth / KML'
	}

	let formatBadge = ext ? `.${ext}` : 'gis'
	if (family === 'gis-tile-pyramid-caches') {
		formatBadge = ext ? `CACHE .${ext}` : 'Tile Cache'
	} else if (isShpSidecar) {
		formatBadge = `SHP .${ext}`
	} else if (isCanonicalMaster && ext === 'gpkg') {
		formatBadge = 'GPKG Master'
	} else if (isCanonicalMaster && ext === 'ifc') {
		formatBadge = 'IFC Master'
	} else if (isCanonicalMaster && (ext === 'tif' || ext === 'tiff' || ext === 'geotiff' || ext === 'gtiff')) {
		formatBadge = 'GeoTIFF Master'
	}

	return { gisTool, formatBadge }
}

/**
 * Classify a single file into one of the 4 GIS, GeoSpatial Tile & CAD/BIM Map Archive families.
 *
 * @param {object} file Duplicate file entry.
 * @return {object|null} Classification metadata or null if unrelated.
 */
export function classifyGisMapFile(file) {
	if (!file || typeof file !== 'object') {
		return null
	}
	const path = safeNormalizePath(file.path || file.filePath || '')
	const basename = getBasename(path)
	if (!basename) {
		return null
	}
	const ext = getExtension(basename)
	const mtimeSec = normalizeMtimeSec(file.mtime)

	const inTileCacheDir = TILE_CACHE_PATH_RE.test(path)
	const hasCacheName = GIS_AUTOSAVE_NAME_RE.test(basename)

	const isTilePyramidCache = TILE_PYRAMID_CACHE_EXT_SET.has(ext)
		|| (inTileCacheDir && (TILE_CACHE_IMAGE_EXT_SET.has(ext) || RASTER_DEM_EXT_SET.has(ext) || VECTOR_GIS_EXT_SET.has(ext)))
		|| (hasCacheName && (RASTER_DEM_EXT_SET.has(ext) || VECTOR_GIS_EXT_SET.has(ext) || CAD_BIM_EXT_SET.has(ext)))

	const isVectorGis = !isTilePyramidCache && VECTOR_GIS_EXT_SET.has(ext)
	const isRasterDem = !isTilePyramidCache && !isVectorGis && RASTER_DEM_EXT_SET.has(ext)
	const isCadBim = !isTilePyramidCache && !isVectorGis && !isRasterDem && CAD_BIM_EXT_SET.has(ext)

	if (!isTilePyramidCache && !isVectorGis && !isRasterDem && !isCadBim) {
		return null
	}

	let family = 'vector-gis-datasets'
	let artifactKind = 'vector-gis'
	if (isRasterDem) {
		family = 'raster-dem-imagery'
		artifactKind = 'raster-dem'
	} else if (isCadBim) {
		family = 'cad-bim-site-models'
		artifactKind = 'cad-bim-model'
	} else if (isTilePyramidCache) {
		family = 'gis-tile-pyramid-caches'
		artifactKind = 'tile-pyramid-cache'
	}

	const projectName = extractGisProjectName(basename, path)
	const crsCode = extractCrsCode(basename, path)
	const revisionNumber = parseGisRevision(basename, path)
	const tileSignature = normalizeGisTileSignature(basename, path)

	const inExportStaging = EXPORT_STAGING_PATH_RE.test(path)
	const inCanonicalVault = CANONICAL_MASTER_PATH_RE.test(path) && !inExportStaging
	const isShpSidecar = isVectorGis && SHAPEFILE_SIDECAR_EXT_SET.has(ext)
	const isShpCompanionOnly = isShpSidecar && ext !== 'shp'

	const isCanonicalMasterFormat = ext === 'gpkg'
		|| ext === 'ifc'
		|| ext === 'tif'
		|| ext === 'tiff'
		|| ext === 'geotiff'
		|| ext === 'gtiff'

	const isCanonicalMaster = !isTilePyramidCache
		&& isCanonicalMasterFormat
		&& inCanonicalVault

	const { gisTool, formatBadge } = detectGisToolAndFormat(ext, path, family, isCanonicalMaster, isShpSidecar)
	const dirname = getDirname(path)
	const shapefileBundleKey = isShpSidecar ? `${dirname}::${getShapefileStem(basename)}` : ''
	const vaultKey = `${projectName}/${crsCode}/${tileSignature}`

	return {
		path,
		dirname,
		basename,
		ext,
		family,
		artifactKind,
		gisTool,
		formatBadge,
		projectName,
		crsCode,
		revisionNumber,
		tileSignature,
		mtimeSec,
		isShpSidecar,
		isShpCompanionOnly,
		shapefileBundleKey,
		isCanonicalMasterFormat,
		isCanonicalMaster,
		inCanonicalVault,
		inExportStaging,
		vaultKey,
	}
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
 * Build cross-group index of shapefile sidecar bundles and reference timestamp.
 *
 * @param {Array<object>} duplicateGroups Raw duplicate groups.
 * @return {object} Shapefile bundle map and reference timestamp.
 */
function buildGisArchiveIndex(duplicateGroups) {
	const shpBundles = new Map()
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
			const meta = classifyGisMapFile(file)
			if (!meta || !meta.isShpSidecar || !meta.shapefileBundleKey) {
				continue
			}
			if (!shpBundles.has(meta.shapefileBundleKey)) {
				shpBundles.set(meta.shapefileBundleKey, new Set())
			}
			shpBundles.get(meta.shapefileBundleKey).add(meta.ext)
		}
	}

	return {
		shpBundles,
		referenceNowSec: maxMtimeSec > 0 ? maxMtimeSec : Math.floor(Date.now() / 1000),
	}
}

/**
 * Score a file copy's authority as canonical survivor anchor (0-100).
 *
 * @param {object} member Classified file member.
 * @param {string} survivorRule Selected survivor rule.
 * @return {number} Authority score 0-100.
 */
function computeMemberAuthorityScore(member, survivorRule) {
	let score = 40

	if (member.meta.isCanonicalMaster) {
		score += 34
	} else if (member.meta.isCanonicalMasterFormat) {
		score += 12
	}
	if (member.meta.inCanonicalVault) {
		score += 22
	}
	if (member.meta.inExportStaging) {
		score -= 26
	}
	if (member.meta.isShpSidecar) {
		score += 10
	}
	if (member.meta.family === 'gis-tile-pyramid-caches') {
		score -= 16
	}
	if (member.isInOriginFolder) {
		score += 18
	}

	if (survivorRule === 'latest-revision-first') {
		if (member.meta.revisionNumber > 0) {
			score += Math.min(16, member.meta.revisionNumber * 3)
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
	if (a.meta.isCanonicalMaster !== b.meta.isCanonicalMaster) {
		return a.meta.isCanonicalMaster ? -1 : 1
	}

	if (survivorRule === 'latest-revision-first') {
		if (a.meta.revisionNumber !== b.meta.revisionNumber) {
			return b.meta.revisionNumber - a.meta.revisionNumber
		}
		if (a.mtimeSec !== b.mtimeSec) {
			return b.mtimeSec - a.mtimeSec
		}
	} else if (survivorRule === 'shortest-path') {
		if (a.meta.path.length !== b.meta.path.length) {
			return a.meta.path.length - b.meta.path.length
		}
	}

	if (a.authorityScore !== b.authorityScore) {
		return b.authorityScore - a.authorityScore
	}
	if (a.meta.inCanonicalVault !== b.meta.inCanonicalVault) {
		return a.meta.inCanonicalVault ? -1 : 1
	}
	if (a.mtimeSec !== b.mtimeSec) {
		return b.mtimeSec - a.mtimeSec
	}
	return a.meta.path.localeCompare(b.meta.path)
}

/**
 * Analyze duplicate groups for GIS, GeoSpatial Tile & CAD/BIM Map Archive governance.
 *
 * @param {Array<object>} duplicateGroups Array of duplicate group objects.
 * @param {object} [options] Analysis configuration options.
 * @return {object} Deterministic audit report.
 */
export function analyzeGisMapArchive(duplicateGroups, options = {}) {
	const groups = Array.isArray(duplicateGroups) ? duplicateGroups.filter(Boolean) : []
	const familyFilter = GIS_MAP_FAMILIES.includes(options.familyFilter) ? options.familyFilter : 'all'
	const verdictFilter = GIS_MAP_VERDICT_FILTERS.includes(options.verdictFilter) ? options.verdictFilter : 'all'
	const sortMode = GIS_MAP_SORT_MODES.includes(options.sortMode) ? options.sortMode : 'reclaim_desc'
	const strategy = GIS_MAP_STRATEGIES.includes(options.strategy)
		? options.strategy
		: 'prune-caches-and-redundant-exports'
	const survivorRule = GIS_MAP_SURVIVOR_RULES.includes(options.survivorRule)
		? options.survivorRule
		: 'canonical-gpkg-ifc-geotiff-first'

	const protectCanonicalMasters = options.protectCanonicalMasters !== false
	const preventOrphaningShpSidecars = options.preventOrphaningShpSidecars !== false
	const staleCacheDays = Number.isFinite(Number(options.staleCacheDays)) && Number(options.staleCacheDays) >= 0
		? Number(options.staleCacheDays)
		: 14
	const minSizeMb = Number.isFinite(Number(options.minSizeMb)) && Number(options.minSizeMb) > 0
		? Number(options.minSizeMb)
		: 0
	const minSizeBytes = minSizeMb * 1024 * 1024
	const searchQuery = typeof options.searchQuery === 'string' ? options.searchQuery.trim().toLowerCase() : ''
	const memberOverrides = options.memberOverrides && typeof options.memberOverrides === 'object'
		? options.memberOverrides
		: {}

	const index = buildGisArchiveIndex(groups)
	const referenceNowSec = Number.isFinite(Number(options.referenceNowSec)) && Number(options.referenceNowSec) > 0
		? Number(options.referenceNowSec)
		: index.referenceNowSec

	const allClusters = []

	for (const group of groups) {
		const files = Array.isArray(group.files) ? group.files.filter(Boolean) : []
		if (files.length < 2) {
			continue
		}

		const classifiedMembers = []
		for (const file of files) {
			const meta = classifyGisMapFile(file)
			if (!meta) {
				continue
			}
			const size = Number.isFinite(Number(file.size)) && Number(file.size) > 0
				? Number(file.size)
				: (Number.isFinite(Number(group.size)) ? Number(group.size) : 0)
			const mtimeSec = normalizeMtimeSec(file.mtime)
			const ageDays = mtimeSec > 0 ? Math.max(0, Math.round(((referenceNowSec - mtimeSec) / 86400) * 10) / 10) : 0
			const bundleExts = meta.shapefileBundleKey && index.shpBundles.has(meta.shapefileBundleKey)
				? Array.from(index.shpBundles.get(meta.shapefileBundleKey)).sort()
				: []
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
				shpBundleExts: bundleExts,
				meta,
				authorityScore: 0,
				verdict: 'keep-canonical-survivor',
				verdictReason: '',
				actionType: 'keep',
			}
			member.authorityScore = computeMemberAuthorityScore(member, survivorRule)
			classifiedMembers.push(member)
		}

		if (classifiedMembers.length < 2) {
			continue
		}

		classifiedMembers.sort((a, b) => compareSurvivorCandidates(a, b, survivorRule))
		const survivor = classifiedMembers[0]
		const primaryMeta = survivor.meta
		const family = primaryMeta.family
		const familyMeta = GIS_MAP_FAMILY_META[family] || GIS_MAP_FAMILY_META['vector-gis-datasets']

		const hasCanonicalMaster = classifiedMembers.some(m => m.meta.isCanonicalMaster)
		const hasShpSidecarBundle = classifiedMembers.some(m => m.meta.isShpSidecar)

		let reclaimableBytes = 0
		let reclaimableCopiesCount = 0
		let consolidatableCopiesCount = 0
		let shieldedCopiesCount = 0

		classifiedMembers.forEach((member, idx) => {
			const override = memberOverrides[member.selectionKey] || 'auto'

			if (idx === 0) {
				member.verdict = 'keep-canonical-survivor'
				member.actionType = 'keep'
				if (member.meta.isCanonicalMaster) {
					member.verdictReason = `Canonical ${member.meta.formatBadge} vault anchor`
				} else if (member.meta.isShpSidecar) {
					member.verdictReason = 'Primary shapefile sidecar bundle anchor'
				} else if (member.meta.inCanonicalVault) {
					member.verdictReason = 'Primary GIS/BIM vault anchor'
				} else {
					member.verdictReason = 'Highest-authority geospatial asset survivor'
				}
				shieldedCopiesCount += 1
				return
			}

			if (override === 'keep') {
				member.verdict = 'blocked-manual-shield'
				member.actionType = 'keep'
				member.verdictReason = 'Manually shielded by GIS/BIM engineer'
				shieldedCopiesCount += 1
				return
			}

			if (override === 'prune') {
				member.verdict = strategy === 'consolidate-gis-vault-hardlinks'
					? 'consolidate-hardlink-gis-asset'
					: 'reclaim-duplicate-gis-asset'
				member.actionType = strategy === 'consolidate-gis-vault-hardlinks' ? 'hardlink' : 'prune'
				member.verdictReason = 'Operator override: marked for safe remediation'
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

			// Prevent orphaning .shp/.dbf/.shx/.prj sidecars by default
			if (preventOrphaningShpSidecars && member.meta.isShpSidecar) {
				member.verdict = 'blocked-shp-sidecar-integrity'
				member.actionType = 'keep'
				const bundleList = member.shpBundleExts.length > 0
					? member.shpBundleExts.map(e => `.${e}`).join('/')
					: `.${member.meta.ext}`
				member.verdictReason = `Shapefile sidecar guard (${bundleList}): prevents orphaning .shp/.dbf/.shx/.prj bundle`
				shieldedCopiesCount += 1
				return
			}

			// Shield canonical GeoPackage / IFC / GeoTIFF masters inside canonical vault
			if (protectCanonicalMasters && member.meta.isCanonicalMaster && strategy !== 'consolidate-gis-vault-hardlinks') {
				member.verdict = 'blocked-canonical-master'
				member.actionType = 'keep'
				member.verdictReason = `Canonical ${member.meta.formatBadge} shielded for ${member.meta.projectName}`
				shieldedCopiesCount += 1
				return
			}

			// Protect very recent tile/pyramid caches inside active GIS tree
			if (
				family === 'gis-tile-pyramid-caches'
				&& !member.meta.inExportStaging
				&& member.ageDays < staleCacheDays
			) {
				member.verdict = 'blocked-recent-tile-cache'
				member.actionType = 'keep'
				member.verdictReason = `Recent GIS tile/pyramid cache (${member.ageDays}d < ${staleCacheDays}d threshold)`
				shieldedCopiesCount += 1
				return
			}

			// Strategy: hardlink-consolidate GIS vault copies
			if (strategy === 'consolidate-gis-vault-hardlinks') {
				member.verdict = 'consolidate-hardlink-gis-asset'
				member.actionType = 'hardlink'
				member.verdictReason = `Hardlink-consolidate onto ${survivor.basename} anchor`
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				consolidatableCopiesCount += 1
				return
			}

			// Strategy: prune tile pyramids and caches only
			if (strategy === 'prune-tile-pyramids-and-caches-only') {
				if (family === 'gis-tile-pyramid-caches' || member.meta.inExportStaging) {
					member.verdict = 'reclaim-stale-tile-pyramid-cache'
					member.actionType = 'prune'
					member.verdictReason = `Stale ${member.meta.gisTool} pyramid/tile cache (${member.ageDays}d old)`
					reclaimableBytes += member.size
					reclaimableCopiesCount += 1
					return
				}
				member.verdict = 'blocked-strategy-scope'
				member.actionType = 'keep'
				member.verdictReason = 'Outside tile/pyramid cache cleanup strategy scope'
				shieldedCopiesCount += 1
				return
			}

			// Default strategy: prune-caches-and-redundant-exports
			if (member.meta.inExportStaging) {
				member.verdict = 'reclaim-staging-export'
				member.actionType = 'prune'
				member.verdictReason = 'Redundant GIS/CAD export or download staging copy'
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				return
			}

			if (family === 'gis-tile-pyramid-caches') {
				member.verdict = 'reclaim-stale-tile-pyramid-cache'
				member.actionType = 'prune'
				member.verdictReason = `Stale ${member.meta.gisTool} tile/pyramid cache (${member.ageDays}d old)`
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				return
			}

			if (family === 'cad-bim-site-models') {
				member.verdict = 'reclaim-redundant-cad-bim-copy'
				member.actionType = 'prune'
				member.verdictReason = 'Redundant CAD/BIM site model copy superseded by canonical anchor'
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				return
			}

			member.verdict = 'reclaim-redundant-geospatial-copy'
			member.actionType = 'prune'
			member.verdictReason = 'Redundant geospatial dataset copy outside canonical master anchors'
			reclaimableBytes += member.size
			reclaimableCopiesCount += 1
		})

		const rawInfo = computeGroupReclaimableInfo({ ...group, files })
		const rawDuplicateBytes = rawInfo.reclaimableBytes || Math.max(0, (classifiedMembers.length - 1) * survivor.size)

		let riskState = 'reclaimable'
		let riskPriority = 2
		if (reclaimableCopiesCount === 0) {
			if (hasShpSidecarBundle) {
				riskState = 'shp-sidecar-protected'
				riskPriority = 5
			} else if (hasCanonicalMaster) {
				riskState = 'canonical-master-protected'
				riskPriority = 4
			} else {
				riskState = 'shielded'
				riskPriority = 3
			}
		} else if (consolidatableCopiesCount > 0) {
			riskState = 'consolidatable'
			riskPriority = 3
		} else if (family === 'gis-tile-pyramid-caches') {
			riskState = 'cache-reclaimable'
			riskPriority = 2
		}

		allClusters.push({
			groupKey: `${group.id ?? group.hash ?? primaryMeta.vaultKey}::${primaryMeta.vaultKey}`,
			primaryGroupId: group.id ?? null,
			hash: group.hash || '',
			family,
			familyLabel: familyMeta.label,
			familyShortLabel: familyMeta.shortLabel,
			projectName: primaryMeta.projectName,
			crsCode: primaryMeta.crsCode,
			revisionNumber: primaryMeta.revisionNumber,
			revisionLabel: primaryMeta.revisionNumber > 0 ? `v${primaryMeta.revisionNumber}` : 'unversioned',
			tileSignature: primaryMeta.tileSignature,
			gisTool: primaryMeta.gisTool,
			formatBadge: primaryMeta.formatBadge,
			vaultKey: primaryMeta.vaultKey,
			displayName: survivor.basename,
			hasCanonicalMaster,
			hasShpSidecarBundle,
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

	const familyBreakdown = Object.keys(GIS_MAP_FAMILY_META).map(famId => {
		const famClusters = allClusters.filter(c => c.family === famId)
		const famReclaim = famClusters.reduce((acc, c) => acc + c.reclaimableBytes, 0)
		return {
			id: famId,
			label: GIS_MAP_FAMILY_META[famId].label,
			shortLabel: GIS_MAP_FAMILY_META[famId].shortLabel,
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
			if (verdictFilter === 'canonical-master' && !cluster.hasCanonicalMaster) {
				return false
			}
			if (verdictFilter === 'shp-sidecar' && !cluster.hasShpSidecarBundle) {
				return false
			}
			if (verdictFilter === 'tile-cache' && cluster.family !== 'gis-tile-pyramid-caches') {
				return false
			}
			if (verdictFilter === 'cad-bim' && cluster.family !== 'cad-bim-site-models') {
				return false
			}
			if (verdictFilter === 'shielded' && cluster.reclaimableCopiesCount > 0) {
				return false
			}
		}
		if (searchQuery) {
			const haystack = [
				cluster.projectName,
				cluster.crsCode,
				cluster.tileSignature,
				cluster.gisTool,
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
		if (sortMode === 'risk_desc') {
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
	const totalCanonicalMasterClusters = filteredClusters.filter(c => c.hasCanonicalMaster).length
	const totalShpSidecarClusters = filteredClusters.filter(c => c.hasShpSidecarBundle).length
	const totalTileCacheClusters = filteredClusters.filter(c => c.family === 'gis-tile-pyramid-caches').length
	const totalCadBimClusters = filteredClusters.filter(c => c.family === 'cad-bim-site-models').length
	const distinctProjectsCount = new Set(filteredClusters.map(c => c.projectName)).size
	const efficiencyPct = totalRawDuplicateBytes > 0
		? Math.min(100, Math.round((totalReclaimableBytes / totalRawDuplicateBytes) * 100))
		: 0

	return {
		schema: GIS_MAP_ARCHIVE_SCHEMA,
		generatedAt: new Date(referenceNowSec * 1000).toISOString(),
		options: {
			familyFilter,
			verdictFilter,
			sortMode,
			strategy,
			survivorRule,
			protectCanonicalMasters,
			preventOrphaningShpSidecars,
			staleCacheDays,
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
			totalCanonicalMasterClusters,
			totalShpSidecarClusters,
			totalTileCacheClusters,
			totalCadBimClusters,
			distinctProjectsCount,
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
 * Build a safe POSIX DRY_RUN=1 remediation script for GIS, GeoSpatial Tile & CAD/BIM Map Archive cleanup.
 *
 * @param {object} analysis Output of analyzeGisMapArchive.
 * @param {object} [options] Script generation options.
 * @return {string} POSIX shell script.
 */
export function buildGisMapRemediationScript(analysis, options = {}) {
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
		'# DuplicateFinder GIS, GeoSpatial Tile & CAD/BIM Map Archive Remediation Script',
		`# Schema: ${GIS_MAP_ARCHIVE_SCHEMA}`,
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
		lines.push(`# GIS Archive: ${cluster.vaultKey} [${cluster.gisTool} / ${cluster.formatBadge}] (${cluster.formattedReclaimableBytes})`)
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
		lines.push('# No actionable GIS, raster, CAD/BIM or tile cache duplicates under current canonical master and SHP sidecar guards.')
	} else {
		lines.push('# After applying with DRY_RUN=0, refresh Nextcloud filecache:')
		lines.push('# sudo -u www-data php /var/www/nextcloud/occ files:scan --all')
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe CSV audit report.
 *
 * @param {object} analysis Output of analyzeGisMapArchive.
 * @return {string} CSV content.
 */
export function buildGisMapCsvReport(analysis) {
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const headers = [
		'Project',
		'CRS',
		'TileSignature',
		'GisTool',
		'Family',
		'Format',
		'CanonicalMaster',
		'ShpSidecar',
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
				cluster.projectName,
				cluster.crsCode,
				cluster.tileSignature,
				cluster.gisTool,
				cluster.family,
				cluster.formatBadge,
				member.meta.isCanonicalMaster ? 'yes' : 'no',
				member.meta.isShpSidecar ? 'yes' : 'no',
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
 * @param {object} analysis Output of analyzeGisMapArchive.
 * @return {string} Pretty-printed JSON string.
 */
export function buildGisMapJsonReport(analysis) {
	const payload = {
		schema: GIS_MAP_ARCHIVE_SCHEMA,
		generatedAt: analysis && analysis.generatedAt ? analysis.generatedAt : new Date().toISOString(),
		options: analysis ? analysis.options : {},
		summary: analysis ? analysis.summary : {},
		familyBreakdown: analysis ? analysis.familyBreakdown : [],
		clusters: (analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []).map(cluster => ({
			groupKey: cluster.groupKey,
			primaryGroupId: cluster.primaryGroupId,
			hash: cluster.hash,
			projectName: cluster.projectName,
			crsCode: cluster.crsCode,
			tileSignature: cluster.tileSignature,
			gisTool: cluster.gisTool,
			family: cluster.family,
			formatBadge: cluster.formatBadge,
			hasCanonicalMaster: cluster.hasCanonicalMaster,
			hasShpSidecarBundle: cluster.hasShpSidecarBundle,
			riskState: cluster.riskState,
			reclaimableBytes: cluster.reclaimableBytes,
			reclaimableGb: cluster.reclaimableGb,
			rawDuplicateBytes: cluster.rawDuplicateBytes,
			members: (cluster.members || []).map(m => ({
				path: m.path,
				size: m.size,
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
 * Build a Nextcloud desktop client .sync-exclude.lst snippet for transient GIS tile caches, pyramids, and lock/backup files.
 *
 * @param {object} analysis Output of analyzeGisMapArchive.
 * @return {string} Sync exclude rules.
 */
export function buildGisMapSyncExcludeSnippet(analysis) {
	const tileCacheCount = analysis && analysis.summary ? analysis.summary.totalTileCacheClusters : 0
	const shpClusterCount = analysis && analysis.summary ? analysis.summary.totalShpSidecarClusters : 0
	return [
		'# DuplicateFinder GIS, GeoSpatial Tile & CAD/BIM Pyramid/Cache Sync Exclusions',
		`# Detected tile/pyramid cache clusters: ${tileCacheCount} | Protected SHP sidecar clusters: ${shpClusterCount}`,
		'*.ovr',
		'*.aux.xml',
		'*.qgz~',
		'*.qgs~',
		'*.rrd',
		'*.mxd.bak',
		'*.dwl',
		'*.dwl2',
		'tiles/',
		'tilecache/',
		'overviews/',
		'pyramids/',
	].join('\n')
}
