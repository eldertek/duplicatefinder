/**
 * Pure Scientific, GIS, CAD/BIM & ML-Shard Companion-Bundle Auditor.
 * Detects duplicate multi-file companion datasets across Nextcloud storage:
 * - GIS & Geospatial (.shp/.shx/.dbf/.prj/.cpg/.qix, GeoTIFF + .tfw/.aux.xml, .tab/.dat/.map, .gpkg)
 * - Medical & Bio-Microscopy (.nii/.nii.gz + .bval/.bvec/.json, .hdr/.img, .nhdr/.raw, .dcm + DICOMDIR, .ome.tif/.czi/.lif)
 * - CAD, BIM & 3D Assets (.obj/.mtl, .gltf/.bin, .sldasm/.sldprt/.dwg/.dxf/.ifc/.rvt/.step, .las/.laz/.lax/.e57)
 * - ML Checkpoints & Sharded Weights (.safetensors/.pt/.pth/.gguf/.onnx + .index.json/.onnx.data/config.json/tokenizer.json)
 *
 * Prevents naive single-file deletion from stranding mandatory companion files or breaking
 * clinical/assembly references, and produces atomic POSIX DRY_RUN=1 scripts,
 * CWE-1236-safe CSV reports, and JSON audit manifests.
 * Zero DOM dependencies, zero network side effects.
 */

import { normalizePathForDiff, formatFileModifiedTime } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const SCIENTIFIC_BUNDLE_SCHEMA = 'duplicatefinder.scientific-bundle-auditor.v1'

export const SCIENTIFIC_DOMAINS = Object.freeze([
	'all',
	'gis-geospatial',
	'medical-bio',
	'cad-bim-3d',
	'ml-checkpoints',
])

export const SCIENTIFIC_DOMAIN_META = Object.freeze({
	'gis-geospatial': {
		id: 'gis-geospatial',
		label: 'GIS & Geospatial',
		shortLabel: 'GIS',
	},
	'medical-bio': {
		id: 'medical-bio',
		label: 'Medical & Bio',
		shortLabel: 'Medical',
	},
	'cad-bim-3d': {
		id: 'cad-bim-3d',
		label: 'CAD, BIM & 3D',
		shortLabel: 'CAD/BIM',
	},
	'ml-checkpoints': {
		id: 'ml-checkpoints',
		label: 'ML Weights & Shards',
		shortLabel: 'ML Shards',
	},
})

export const SCIENTIFIC_PRESETS = Object.freeze([
	{
		id: 'all-scientific',
		name: 'All Domains',
		description: 'Audit GIS shapefiles, medical imaging, CAD/BIM assemblies, and ML model shards with full companion protection.',
		domainFilter: 'all',
		strategy: 'atomic-purge',
		survivorRule: 'complete-bundle-first',
		protectClinicalPaths: true,
		protectAssemblyRefs: true,
		minSizeMb: 0,
	},
	{
		id: 'gis-geospatial',
		name: 'GIS & Shapefile',
		description: 'Enforce .shp/.shx/.dbf/.prj bundle integrity and reclaim redundant geospatial exports atomically.',
		domainFilter: 'gis-geospatial',
		strategy: 'atomic-purge',
		survivorRule: 'complete-bundle-first',
		protectClinicalPaths: true,
		protectAssemblyRefs: true,
		minSizeMb: 0,
	},
	{
		id: 'medical-bids',
		name: 'Medical & BIDS',
		description: 'Protect clinical/HIPAA/DICOM paths while pairing .nii.gz, .bval, .bvec, .hdr/.img, and BIDS JSON metadata.',
		domainFilter: 'medical-bio',
		strategy: 'hardlink-preserve',
		survivorRule: 'production-first',
		protectClinicalPaths: true,
		protectAssemblyRefs: true,
		minSizeMb: 0,
	},
	{
		id: 'cad-ml-bundles',
		name: 'CAD/BIM & ML Shards',
		description: 'Guard SolidWorks/BIM assemblies and sharded .safetensors/.onnx weights via hardlink/reflink consolidation.',
		domainFilter: 'cad-bim-3d',
		strategy: 'hardlink-preserve',
		survivorRule: 'complete-bundle-first',
		protectClinicalPaths: true,
		protectAssemblyRefs: true,
		minSizeMb: 0,
	},
])

export const SCIENTIFIC_VERDICT_FILTERS = Object.freeze([
	'all',
	'atomic-reclaimable',
	'orphan-collateral-risk',
	'incomplete-bundle',
	'shielded',
])

export const SCIENTIFIC_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'collateral_desc',
	'completeness_asc',
	'name_asc',
])

export const SCIENTIFIC_STRATEGIES = Object.freeze([
	'atomic-purge',
	'hardlink-preserve',
])

export const SCIENTIFIC_SURVIVOR_RULES = Object.freeze([
	'complete-bundle-first',
	'production-first',
	'oldest-mtime',
	'newest-mtime',
	'shortest-path',
])

const COMPOUND_EXTENSIONS = Object.freeze([
	'safetensors.index.json',
	'bin.index.json',
	'tiff.aux.xml',
	'tif.aux.xml',
	'ome.tiff',
	'ome.tif',
	'aux.xml',
	'shp.xml',
	'nii.gz',
	'raw.gz',
	'onnx.data',
	'gpkg-journal',
	'gpkg-wal',
	'gpkg-shm',
])

const BUNDLE_SPECS = Object.freeze([
	{
		id: 'esri-shapefile',
		label: 'ESRI Shapefile Bundle',
		domain: 'gis-geospatial',
		primaryExts: ['shp'],
		mandatoryExts: ['shx', 'dbf'],
		optionalExts: ['prj', 'cpg', 'sbn', 'sbx', 'qix', 'qpj', 'shp.xml', 'fix', 'atx', 'xml'],
		companionMatchExts: ['shx', 'dbf', 'prj', 'cpg', 'sbn', 'sbx', 'qix', 'qpj', 'shp.xml', 'fix', 'atx'],
		isAssemblyAnchor: false,
	},
	{
		id: 'mapinfo-tab',
		label: 'MapInfo TAB Bundle',
		domain: 'gis-geospatial',
		primaryExts: ['tab'],
		mandatoryExts: ['dat', 'map'],
		optionalExts: ['id', 'ind'],
		companionMatchExts: ['dat', 'map', 'id', 'ind'],
		isAssemblyAnchor: false,
	},
	{
		id: 'geotiff-raster',
		label: 'GeoTIFF & Raster Worldfile',
		domain: 'gis-geospatial',
		primaryExts: ['geotiff', 'tif', 'tiff', 'jp2', 'ecw', 'sid', 'asc'],
		mandatoryExts: [],
		optionalExts: ['tfw', 'tfwx', 'jgw', 'pgw', 'aux.xml', 'tif.aux.xml', 'tiff.aux.xml', 'ovr', 'ers', 'prj'],
		companionMatchExts: ['tfw', 'tfwx', 'jgw', 'pgw', 'aux.xml', 'tif.aux.xml', 'tiff.aux.xml', 'ovr', 'ers'],
		requiresCompanionEvidence: true,
		isAssemblyAnchor: false,
	},
	{
		id: 'geopackage',
		label: 'GeoPackage SQLite Store',
		domain: 'gis-geospatial',
		primaryExts: ['gpkg'],
		mandatoryExts: [],
		optionalExts: ['gpkg-wal', 'gpkg-shm', 'gpkg-journal'],
		companionMatchExts: ['gpkg-wal', 'gpkg-shm', 'gpkg-journal'],
		isAssemblyAnchor: false,
	},
	{
		id: 'nifti-bids',
		label: 'NIfTI / BIDS Neuroimaging',
		domain: 'medical-bio',
		primaryExts: ['nii.gz', 'nii'],
		mandatoryExts: [],
		optionalExts: ['bval', 'bvec', 'json', 'tsv'],
		companionMatchExts: ['bval', 'bvec'],
		isAssemblyAnchor: false,
	},
	{
		id: 'analyze-pair',
		label: 'Analyze 7.5 Header/Image Pair',
		domain: 'medical-bio',
		primaryExts: ['hdr'],
		mandatoryExts: ['img'],
		optionalExts: ['mat'],
		companionMatchExts: ['img'],
		isAssemblyAnchor: false,
	},
	{
		id: 'nrrd-volume',
		label: 'NRRD Volume Bundle',
		domain: 'medical-bio',
		primaryExts: ['nhdr', 'nrrd'],
		mandatoryExts: [],
		optionalExts: ['raw', 'raw.gz'],
		companionMatchExts: ['raw', 'raw.gz'],
		isAssemblyAnchor: false,
	},
	{
		id: 'dicom-series',
		label: 'DICOM Clinical Series',
		domain: 'medical-bio',
		primaryExts: ['dcm', 'dicom'],
		mandatoryExts: [],
		optionalExts: ['dicomdir', 'xml', 'json'],
		companionMatchExts: ['dicomdir'],
		dirLevelAnchorFiles: ['dicomdir'],
		isAssemblyAnchor: false,
	},
	{
		id: 'bio-microscopy',
		label: 'OME-TIFF / Bio-Microscopy',
		domain: 'medical-bio',
		primaryExts: ['ome.tif', 'ome.tiff', 'czi', 'lif', 'nd2', 'ims'],
		mandatoryExts: [],
		optionalExts: ['xml', 'json', 'txt'],
		companionMatchExts: [],
		isAssemblyAnchor: false,
	},
	{
		id: 'wavefront-obj',
		label: 'Wavefront OBJ + Material Bundle',
		domain: 'cad-bim-3d',
		primaryExts: ['obj'],
		mandatoryExts: ['mtl'],
		optionalExts: ['png', 'jpg', 'jpeg', 'tga', 'bmp'],
		companionMatchExts: ['mtl'],
		isAssemblyAnchor: true,
	},
	{
		id: 'gltf-split',
		label: 'glTF Split Geometry Bundle',
		domain: 'cad-bim-3d',
		primaryExts: ['gltf'],
		mandatoryExts: ['bin'],
		optionalExts: ['png', 'jpg', 'jpeg', 'ktx2', 'webp'],
		companionMatchExts: ['bin'],
		isAssemblyAnchor: true,
	},
	{
		id: 'cad-bim-assembly',
		label: 'CAD / BIM Assembly & Drawing',
		domain: 'cad-bim-3d',
		primaryExts: ['sldasm', 'sldprt', 'slddrw', 'dwg', 'dxf', 'ifc', 'rvt', 'rfa', 'nwd', 'nwc', 'step', 'stp', 'iges', 'igs', 'blend'],
		mandatoryExts: [],
		optionalExts: ['bak', 'dwl', 'dwl2', 'ctb', 'pc3', 'blend1', 'xml'],
		companionMatchExts: ['dwl', 'dwl2', 'ctb', 'pc3', 'blend1'],
		dirLevelAnchorExts: ['sldasm', 'rvt', 'ifc', 'nwd'],
		isAssemblyAnchor: true,
	},
	{
		id: 'lidar-pointcloud',
		label: 'LiDAR Point-Cloud Bundle',
		domain: 'cad-bim-3d',
		primaryExts: ['las', 'laz', 'e57', 'pcd', 'ply', 'rcp', 'rcs'],
		mandatoryExts: [],
		optionalExts: ['lax', 'prj', 'lasx', 'xml'],
		companionMatchExts: ['lax', 'lasx'],
		isAssemblyAnchor: false,
	},
	{
		id: 'ml-model-shards',
		label: 'ML Checkpoint & Shard Bundle',
		domain: 'ml-checkpoints',
		primaryExts: ['safetensors', 'pt', 'pth', 'gguf', 'onnx', 'ckpt'],
		mandatoryExts: [],
		optionalExts: ['safetensors.index.json', 'bin.index.json', 'onnx.data', 'onnx_data', 'json', 'txt'],
		companionMatchExts: ['safetensors.index.json', 'bin.index.json', 'onnx.data', 'onnx_data'],
		dirLevelAnchorFiles: ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'generation_config.json', 'model.safetensors.index.json'],
		isAssemblyAnchor: true,
	},
])

const DIR_INDEX_KNOWN_EXTS = new Set(
	BUNDLE_SPECS.flatMap(spec => [
		...spec.primaryExts,
		...spec.mandatoryExts,
		...spec.optionalExts,
		...spec.companionMatchExts,
		...(spec.dirLevelAnchorExts || []),
	])
)

const DIR_LEVEL_ANCHOR_FILES = new Set(
	BUNDLE_SPECS.flatMap(spec => spec.dirLevelAnchorFiles || [])
)

const CLINICAL_PATH_RE = /(?:^|\/)(?:clinical|patient|patients|hipaa|irb|dicom|radiology|biobank|trials?|medical|pathology|neuro|bids|ehr|phi)(?:\/|_|-|$)/i
const PRODUCTION_PATH_RE = /(?:^|\/)(?:prod|production|canonical|master|golden|reference|published|release|serving|models-prod|clinical-archive)(?:\/|_|-|$)/i
const STAGING_PATH_RE = /(?:^|\/)(?:backup|backups|bak|tmp|temp|scratch|staging|export|exports|copy|copies|download|downloads|inbox|unsorted|archive|old)(?:\/|_|-|$)/i
const SHARD_SUFFIX_RE = /(?:-|_)(?:\d{4,5}-of-\d{4,5}|shard[-_]?\d+|part[-_]?\d+|slice[-_]?\d+)$/i
const ASSEMBLY_ANCHOR_EXTS = new Set(['sldasm', 'rvt', 'ifc', 'nwd', 'gltf', 'obj', 'blend'])

/**
 * Escape a string for safe POSIX single-quoted shell interpolation.
 *
 * @param {string} value Raw text value.
 * @return {string} Single-quoted POSIX shell literal.
 */
function escapePosixSingleQuote(value) {
	return `'${String(value ?? '').replace(/'/g, '\'\\\'\'')}'`
}

/**
 * Extract positive byte size from a duplicate file entry.
 *
 * @param {object} file Duplicate file entry.
 * @return {number} File size in bytes.
 */
function getFileSize(file) {
	const raw = Number(file && (file.size ?? file.fileSize ?? 0))
	return Number.isFinite(raw) && raw > 0 ? raw : 0
}

/**
 * Extract normalized modification timestamp in Unix seconds.
 *
 * @param {object} file Duplicate file entry.
 * @return {number} Timestamp in Unix seconds or 0 when absent.
 */
function getFileMtimeSeconds(file) {
	const raw = Number(file && (file.mtime ?? file.modifiedTime ?? file.lastModified ?? 0))
	if (!Number.isFinite(raw) || raw <= 0) {
		return 0
	}
	return raw > 1e12 ? Math.floor(raw / 1000) : Math.floor(raw)
}

/**
 * Split a normalized path into parent directory path and basename.
 *
 * @param {string} normalizedPath Normalized file path.
 * @return {{ dirPath: string, fileName: string }} Directory and filename pair.
 */
function splitDirAndName(normalizedPath) {
	const clean = String(normalizedPath || '').replace(/\/+$/, '')
	const slashIdx = clean.lastIndexOf('/')
	if (slashIdx === -1) {
		return { dirPath: '/', fileName: clean }
	}
	return {
		dirPath: clean.slice(0, slashIdx) || '/',
		fileName: clean.slice(slashIdx + 1),
	}
}

/**
 * Extract compound or single lowercase extension from a file path.
 *
 * @param {string} filePath Raw or normalized file path.
 * @return {string} Normalized lowercase extension without leading dot.
 */
export function extractScientificExtension(filePath) {
	const normalized = normalizePathForDiff(filePath)
	const { fileName } = splitDirAndName(normalized)
	const lower = fileName.toLowerCase()
	if (!lower) {
		return ''
	}

	for (const compound of COMPOUND_EXTENSIONS) {
		if (lower.endsWith(`.${compound}`)) {
			return compound
		}
	}

	if (lower === 'dicomdir') {
		return 'dicomdir'
	}

	const dotIdx = lower.lastIndexOf('.')
	if (dotIdx <= 0 || dotIdx === lower.length - 1) {
		return ''
	}
	return lower.slice(dotIdx + 1)
}

/**
 * Parse bundle stem, directory path, and shard token from a path.
 *
 * @param {string} filePath Raw or normalized path.
 * @return {object} Parsed descriptor.
 */
export function parseBundleDescriptor(filePath) {
	const normalizedPath = normalizePathForDiff(filePath)
	const { dirPath, fileName } = splitDirAndName(normalizedPath)
	const ext = extractScientificExtension(normalizedPath)
	const lowerName = fileName.toLowerCase()
	let stem = fileName
	if (ext && lowerName.endsWith(`.${ext}`)) {
		stem = fileName.slice(0, fileName.length - ext.length - 1)
	}
	const lowerStem = stem.toLowerCase()
	const shardMatch = lowerStem.match(SHARD_SUFFIX_RE)
	const bundleStem = shardMatch
		? lowerStem.slice(0, lowerStem.length - shardMatch[0].length) || lowerStem
		: lowerStem

	return {
		normalizedPath,
		dirPath,
		fileName,
		lowerFileName: lowerName,
		ext,
		stem,
		bundleStem,
		isShard: Boolean(shardMatch),
	}
}

/**
 * Resolve matching scientific bundle specification for a file extension and directory context.
 *
 * @param {string} ext Normalized extension.
 * @param {object} descriptor Parsed bundle descriptor.
 * @param {object|undefined} dirState Directory companion index entry.
 * @return {{ spec: object, roleInSpec: string }|null} Matched bundle specification or null.
 */
function findMatchingSpec(ext, descriptor, dirState) {
	if (!ext && descriptor.lowerFileName !== 'dicomdir') {
		return null
	}

	const effectiveExt = descriptor.lowerFileName === 'dicomdir' ? 'dicomdir' : ext

	for (const spec of BUNDLE_SPECS) {
		if (spec.primaryExts.includes(effectiveExt)) {
			if (spec.requiresCompanionEvidence) {
				const stemEntry = dirState && dirState.byStem.get(descriptor.bundleStem)
				const hasGeoCompanion = Boolean(
					stemEntry && spec.optionalExts.some(optExt => stemEntry.exts.has(optExt))
				)
				const hasGeoPathHint = /(?:^|\/)(?:gis|geo|geotiff|orthophoto|raster|dem|lidar|satellite|map|maps|ortho|qgis|arcgis)(?:\/|_|-|$)/i.test(descriptor.normalizedPath)
				if (!hasGeoCompanion && !hasGeoPathHint) {
					continue
				}
			}
			return { spec, roleInSpec: 'primary' }
		}
	}

	for (const spec of BUNDLE_SPECS) {
		if (spec.mandatoryExts.includes(effectiveExt) || spec.companionMatchExts.includes(effectiveExt)) {
			return { spec, roleInSpec: 'companion' }
		}
	}

	// Handle shared optional extensions (e.g. .prj, .json, .xml) only if a primary of that spec exists in the same directory
	if (dirState) {
		const stemEntry = dirState.byStem.get(descriptor.bundleStem)
		for (const spec of BUNDLE_SPECS) {
			const hasStemPrimary = stemEntry && spec.primaryExts.some(p => stemEntry.exts.has(p))
			const hasDirAnchor = (spec.dirLevelAnchorFiles || []).includes(descriptor.lowerFileName)
				&& spec.primaryExts.some(p => dirState.allExts.has(p))
			if ((hasStemPrimary && spec.optionalExts.includes(effectiveExt)) || hasDirAnchor) {
				return { spec, roleInSpec: 'companion' }
			}
		}
	}

	return null
}

/**
 * Build directory-level companion index across all duplicate groups and optional inventory.
 *
 * @param {Array<object>} duplicates Duplicate group entities.
 * @param {Array<object|string>} [companionInventory] Supplementary sibling inventory.
 * @return {Map<string, object>} Directory path to companion index map.
 */
function buildDirectoryIndex(duplicates, companionInventory = []) {
	const dirs = new Map()

	/**
	 * Return or initialize directory index state.
	 *
	 * @param {string} dirPath Directory path.
	 * @return {object} Directory state object.
	 */
	function ensureDir(dirPath) {
		let state = dirs.get(dirPath)
		if (!state) {
			state = {
				dirPath,
				byStem: new Map(),
				allExts: new Set(),
				anchorFiles: new Map(),
				allFiles: [],
			}
			dirs.set(dirPath, state)
		}
		return state
	}

	/**
	 * Ingest one file or companion entry into the directory index.
	 *
	 * @param {object} fileObj File object containing path and size.
	 * @param {string|number|null} [groupId] Optional parent duplicate group ID.
	 * @return {void}
	 */
	function ingestEntry(fileObj, groupId = null) {
		if (!fileObj || !fileObj.path) {
			return
		}
		const desc = parseBundleDescriptor(fileObj.path)
		if (!desc.normalizedPath) {
			return
		}
		const isAnchorFile = DIR_LEVEL_ANCHOR_FILES.has(desc.lowerFileName)
		if (!DIR_INDEX_KNOWN_EXTS.has(desc.ext) && !isAnchorFile) {
			return
		}

		const dirState = ensureDir(desc.dirPath)
		const fileEntry = {
			normalizedPath: desc.normalizedPath,
			fileName: desc.fileName,
			lowerFileName: desc.lowerFileName,
			ext: desc.ext,
			bundleStem: desc.bundleStem,
			sizeBytes: getFileSize(fileObj),
			mtimeSec: getFileMtimeSeconds(fileObj),
			groupId,
		}

		// Deduplicate exact paths within directory index
		if (!dirState.allFiles.some(item => item.normalizedPath === fileEntry.normalizedPath)) {
			dirState.allFiles.push(fileEntry)
		}
		if (desc.ext) {
			dirState.allExts.add(desc.ext)
		}
		if (isAnchorFile) {
			dirState.anchorFiles.set(desc.lowerFileName, fileEntry)
		}

		let stemState = dirState.byStem.get(desc.bundleStem)
		if (!stemState) {
			stemState = {
				exts: new Set(),
				files: [],
			}
			dirState.byStem.set(desc.bundleStem, stemState)
		}
		if (desc.ext) {
			stemState.exts.add(desc.ext)
		}
		if (!stemState.files.some(item => item.normalizedPath === fileEntry.normalizedPath)) {
			stemState.files.push(fileEntry)
		}
	}

	for (const group of duplicates) {
		const files = Array.isArray(group && group.files) ? group.files : []
		for (const file of files) {
			ingestEntry(file, group.id ?? null)
			if (Array.isArray(file && file.companions)) {
				for (const comp of file.companions) {
					if (typeof comp === 'string') {
						ingestEntry({ path: comp, size: 0 }, null)
					} else if (comp && comp.path) {
						ingestEntry(comp, null)
					}
				}
			}
		}
	}

	if (Array.isArray(companionInventory)) {
		for (const item of companionInventory) {
			if (typeof item === 'string') {
				ingestEntry({ path: item, size: 0 }, null)
			} else if (item && item.path) {
				ingestEntry(item, null)
			}
		}
	}

	return dirs
}

/**
 * Evaluate bundle completeness, companion collateral, and safety shields for one file copy.
 *
 * @param {object} file Source file object.
 * @param {object} descriptor Parsed bundle descriptor.
 * @param {{ spec: object, roleInSpec: string }} specMatch Matched bundle specification.
 * @param {Map<string, object>} dirIndex Directory companion index.
 * @return {object} Evaluated bundle context.
 */
function evaluateBundleContext(file, descriptor, specMatch, dirIndex) {
	const { spec, roleInSpec } = specMatch
	const dirState = dirIndex.get(descriptor.dirPath)
	const stemState = dirState ? dirState.byStem.get(descriptor.bundleStem) : null

	const presentExts = stemState ? new Set(stemState.exts) : new Set(descriptor.ext ? [descriptor.ext] : [])
	const companionFiles = []
	const seenCompanionPaths = new Set([descriptor.normalizedPath])

	if (stemState) {
		for (const sibling of stemState.files) {
			if (!seenCompanionPaths.has(sibling.normalizedPath)) {
				seenCompanionPaths.add(sibling.normalizedPath)
				companionFiles.push(sibling)
			}
		}
	}

	if (dirState && Array.isArray(spec.dirLevelAnchorFiles)) {
		for (const anchorName of spec.dirLevelAnchorFiles) {
			const anchor = dirState.anchorFiles.get(anchorName)
			if (anchor && !seenCompanionPaths.has(anchor.normalizedPath)) {
				seenCompanionPaths.add(anchor.normalizedPath)
				companionFiles.push(anchor)
			}
		}
	}

	const hasPrimary = spec.primaryExts.some(ext => presentExts.has(ext))
	const missingMandatory = spec.mandatoryExts.filter(ext => !presentExts.has(ext))
	const presentMandatory = spec.mandatoryExts.filter(ext => presentExts.has(ext))
	const presentOptional = spec.optionalExts.filter(ext => presentExts.has(ext))

	let completenessStatus = 'complete'
	if (!hasPrimary && roleInSpec === 'companion') {
		completenessStatus = 'companion-only'
	} else if (missingMandatory.length > 0) {
		completenessStatus = 'incomplete'
	}

	const totalMandatory = spec.mandatoryExts.length
	const mandatoryWeight = totalMandatory > 0
		? Math.round((presentMandatory.length / totalMandatory) * 70)
		: (hasPrimary ? 70 : 30)
	const optionalScore = Math.min(30, presentOptional.length * 8 + (hasPrimary ? 10 : 0))
	const completenessScore = Math.min(100, mandatoryWeight + optionalScore)

	const companionBytes = companionFiles.reduce((acc, item) => acc + item.sizeBytes, 0)
	const orphanCollateralBytes = (roleInSpec === 'primary' || spec.mandatoryExts.includes(descriptor.ext))
		? companionFiles.reduce((acc, item) => acc + item.sizeBytes, 0)
		: 0

	const isClinicalPath = Boolean(
		(file && (file.clinicalProtected || file.legalHold))
		|| (spec.domain === 'medical-bio' && CLINICAL_PATH_RE.test(descriptor.normalizedPath))
		|| CLINICAL_PATH_RE.test(descriptor.normalizedPath)
	)

	const hasDirAssemblyAnchor = Boolean(
		dirState
		&& Array.isArray(spec.dirLevelAnchorExts)
		&& spec.dirLevelAnchorExts.some(anchorExt => dirState.allExts.has(anchorExt))
	)
	const hasDirMlAnchor = Boolean(
		spec.domain === 'ml-checkpoints'
		&& dirState
		&& (dirState.anchorFiles.has('config.json') || dirState.anchorFiles.has('model.safetensors.index.json'))
		&& PRODUCTION_PATH_RE.test(descriptor.normalizedPath)
	)
	const isAssemblyProtected = Boolean(
		(file && (file.locked || file.assemblyAnchor || file.origin))
		|| (spec.isAssemblyAnchor && (ASSEMBLY_ANCHOR_EXTS.has(descriptor.ext) || hasDirAssemblyAnchor || hasDirMlAnchor) && PRODUCTION_PATH_RE.test(descriptor.normalizedPath))
	)

	const isProductionPath = PRODUCTION_PATH_RE.test(descriptor.normalizedPath) || Boolean(file && file.origin)
	const isStagingPath = STAGING_PATH_RE.test(descriptor.normalizedPath)

	return {
		specId: spec.id,
		specLabel: spec.label,
		domain: spec.domain,
		roleInSpec,
		completenessStatus,
		completenessScore,
		hasPrimary,
		presentMandatory,
		missingMandatory,
		presentOptional,
		companionFiles,
		companionCount: companionFiles.length,
		companionBytes,
		orphanCollateralBytes,
		isClinicalPath,
		isAssemblyProtected,
		isProductionPath,
		isStagingPath,
	}
}

/**
 * Deterministic comparator for selecting canonical survivor copy within a bundle group.
 *
 * @param {object} a First candidate member.
 * @param {object} b Second candidate member.
 * @param {string} rule Active survivor anchor rule.
 * @return {number} Sort order integer.
 */
function compareMembersBySurvivorRule(a, b, rule) {
	if (rule === 'complete-bundle-first') {
		if (a.context.completenessStatus === 'complete' && b.context.completenessStatus !== 'complete') {
			return -1
		}
		if (b.context.completenessStatus === 'complete' && a.context.completenessStatus !== 'complete') {
			return 1
		}
		if (a.context.completenessScore !== b.context.completenessScore) {
			return b.context.completenessScore - a.context.completenessScore
		}
		if (a.context.isClinicalPath !== b.context.isClinicalPath) {
			return a.context.isClinicalPath ? -1 : 1
		}
		if (a.context.isProductionPath !== b.context.isProductionPath) {
			return a.context.isProductionPath ? -1 : 1
		}
	} else if (rule === 'production-first') {
		if (a.context.isClinicalPath !== b.context.isClinicalPath) {
			return a.context.isClinicalPath ? -1 : 1
		}
		if (a.context.isProductionPath !== b.context.isProductionPath) {
			return a.context.isProductionPath ? -1 : 1
		}
		if (a.context.isStagingPath !== b.context.isStagingPath) {
			return a.context.isStagingPath ? 1 : -1
		}
		if (a.context.completenessScore !== b.context.completenessScore) {
			return b.context.completenessScore - a.context.completenessScore
		}
	} else if (rule === 'oldest-mtime') {
		if (a.mtimeSec !== b.mtimeSec) {
			return a.mtimeSec - b.mtimeSec
		}
	} else if (rule === 'newest-mtime') {
		if (a.mtimeSec !== b.mtimeSec) {
			return b.mtimeSec - a.mtimeSec
		}
	} else if (rule === 'shortest-path') {
		if (a.normalizedPath.length !== b.normalizedPath.length) {
			return a.normalizedPath.length - b.normalizedPath.length
		}
	}

	if (a.context.isStagingPath !== b.context.isStagingPath) {
		return a.context.isStagingPath ? 1 : -1
	}
	if (a.mtimeSec !== b.mtimeSec) {
		return a.mtimeSec - b.mtimeSec
	}
	return a.normalizedPath.localeCompare(b.normalizedPath)
}

/**
 * Read administrator override string for a group or file key.
 *
 * @param {object|null|undefined} overrides Override lookup map.
 * @param {string} key Group or file selection key.
 * @return {string} Override identifier or 'auto'.
 */
function getOverrideForKey(overrides, key) {
	if (!overrides || typeof overrides !== 'object') {
		return 'auto'
	}
	const val = overrides[key]
	return typeof val === 'string' ? val : 'auto'
}

/**
 * Run deterministic Scientific, GIS, CAD/BIM & ML-Shard Companion-Bundle analysis.
 *
 * @param {Array<object>} duplicates Duplicate group entities.
 * @param {object} [options] Analysis configuration and filters.
 * @return {object} Complete structured audit result.
 */
export function analyzeScientificBundles(duplicates, options = {}) {
	const safeDuplicates = Array.isArray(duplicates) ? duplicates : []
	const domainFilter = SCIENTIFIC_DOMAINS.includes(options.domainFilter)
		? options.domainFilter
		: 'all'
	const verdictFilter = SCIENTIFIC_VERDICT_FILTERS.includes(options.verdictFilter)
		? options.verdictFilter
		: 'all'
	const sortMode = SCIENTIFIC_SORT_MODES.includes(options.sortMode)
		? options.sortMode
		: 'reclaim_desc'
	const strategy = SCIENTIFIC_STRATEGIES.includes(options.strategy)
		? options.strategy
		: 'atomic-purge'
	const survivorRule = SCIENTIFIC_SURVIVOR_RULES.includes(options.survivorRule)
		? options.survivorRule
		: 'complete-bundle-first'
	const protectClinicalPaths = options.protectClinicalPaths !== false
	const protectAssemblyRefs = options.protectAssemblyRefs !== false
	const minSizeMbRaw = Number(options.minSizeMb)
	const minSizeBytes = Number.isFinite(minSizeMbRaw) && minSizeMbRaw > 0
		? minSizeMbRaw * 1024 * 1024
		: 0
	const searchQuery = typeof options.searchQuery === 'string'
		? options.searchQuery.trim().toLowerCase()
		: ''
	const groupOverrides = options.groupOverrides && typeof options.groupOverrides === 'object'
		? options.groupOverrides
		: {}
	const copyOverrides = options.copyOverrides && typeof options.copyOverrides === 'object'
		? options.copyOverrides
		: {}

	const dirIndex = buildDirectoryIndex(safeDuplicates, options.companionInventory)

	const domainCounts = {
		'gis-geospatial': 0,
		'medical-bio': 0,
		'cad-bim-3d': 0,
		'ml-checkpoints': 0,
	}

	const analyzedBundles = []
	let totalRawDuplicateBytes = 0
	let totalAtomicReclaimableBytes = 0
	let totalHardlinkSavingsBytes = 0
	let totalOrphanCollateralBytes = 0
	let incompleteBundlesCount = 0
	let shieldedCopiesCount = 0
	let atomicReclaimableCopiesCount = 0

	for (let idx = 0; idx < safeDuplicates.length; idx += 1) {
		const group = safeDuplicates[idx]
		const files = Array.isArray(group && group.files) ? group.files : []
		if (files.length < 2) {
			continue
		}

		// Match first file that belongs to a known scientific/GIS/CAD/ML bundle spec
		let matchedSpecInfo = null
		for (const file of files) {
			const desc = parseBundleDescriptor(file && file.path)
			const dirState = dirIndex.get(desc.dirPath)
			const match = findMatchingSpec(desc.ext, desc, dirState)
			if (match) {
				matchedSpecInfo = match
				break
			}
		}
		if (!matchedSpecInfo) {
			continue
		}

		const domain = matchedSpecInfo.spec.domain
		const groupKey = String(group.id ?? group.hash ?? `scientific-${idx}`)
		const groupOverride = getOverrideForKey(groupOverrides, groupKey)

		const rawMembers = files.map((file, fileIdx) => {
			const desc = parseBundleDescriptor(file && file.path)
			const dirState = dirIndex.get(desc.dirPath)
			const localMatch = findMatchingSpec(desc.ext, desc, dirState) || matchedSpecInfo
			const context = evaluateBundleContext(file, desc, localMatch, dirIndex)
			const selectionKey = getFileSelectionKey(file) || `${groupKey}::${desc.normalizedPath || fileIdx}`
			return {
				file,
				selectionKey,
				normalizedPath: desc.normalizedPath,
				dirPath: desc.dirPath,
				fileName: desc.fileName,
				ext: desc.ext,
				stem: desc.stem,
				bundleStem: desc.bundleStem,
				isShard: desc.isShard,
				sizeBytes: getFileSize(file),
				formattedSize: formatBytes(getFileSize(file)),
				mtimeSec: getFileMtimeSeconds(file),
				formattedMtime: formatFileModifiedTime(file),
				context,
			}
		})

		// Determine survivor: manual pin first, else deterministic survivorRule
		const pinnedSurvivor = rawMembers.find(m => getOverrideForKey(copyOverrides, m.selectionKey) === 'pin-keeper')
		const sortedCandidates = [...rawMembers].sort((a, b) => compareMembersBySurvivorRule(a, b, survivorRule))
		const survivorMember = pinnedSurvivor || sortedCandidates[0]

		const hasAnyCompleteCopy = rawMembers.some(m => m.context.completenessStatus === 'complete')
		const completeCount = rawMembers.filter(m => m.context.completenessStatus === 'complete').length

		const members = rawMembers.map(member => {
			const isSurvivor = member.selectionKey === survivorMember.selectionKey
			const copyOverride = getOverrideForKey(copyOverrides, member.selectionKey)
			let verdict = 'atomic-bundle-reclaim'
			let verdictLabel = 'Atomic Bundle Reclaim'
			let verdictReason = ''
			let reclaimBytes = member.sizeBytes + member.context.companionBytes
			let hardlinkBytes = member.sizeBytes

			if (isSurvivor) {
				verdict = 'keep-canonical-bundle'
				verdictLabel = 'Canonical Bundle Survivor'
				verdictReason = `Retained as canonical ${member.context.specLabel} (${member.context.completenessStatus}, ${member.context.companionCount} companions).`
				reclaimBytes = 0
				hardlinkBytes = 0
			} else if (groupOverride === 'shield' || copyOverride === 'shield') {
				verdict = 'blocked-manual-shield'
				verdictLabel = 'Admin Shielded'
				verdictReason = 'Bundle or copy locked by administrator safety override.'
				reclaimBytes = 0
				hardlinkBytes = 0
			} else if (groupOverride === 'exclude') {
				verdict = 'excluded'
				verdictLabel = 'Excluded'
				verdictReason = 'Excluded from scientific bundle reclamation plan.'
				reclaimBytes = 0
				hardlinkBytes = 0
			} else if (protectClinicalPaths && member.context.isClinicalPath && copyOverride !== 'force-purge') {
				verdict = 'blocked-clinical-shield'
				verdictLabel = 'Clinical / IRB Shielded'
				verdictReason = 'Clinical, HIPAA, BIDS, or DICOM path is protected from automated deletion.'
				reclaimBytes = 0
				hardlinkBytes = 0
			} else if (protectAssemblyRefs && member.context.isAssemblyProtected && copyOverride !== 'force-purge') {
				verdict = 'blocked-assembly-ref'
				verdictLabel = 'Assembly / Model Anchor'
				verdictReason = 'Active CAD/BIM assembly or production ML serving anchor is protected.'
				reclaimBytes = 0
				hardlinkBytes = 0
			} else if (
				member.context.completenessStatus === 'complete'
				&& survivorMember.context.completenessStatus !== 'complete'
				&& copyOverride !== 'force-purge'
			) {
				verdict = 'blocked-incomplete-anchor'
				verdictLabel = 'Only Complete Bundle'
				verdictReason = 'Surviving copy is incomplete; reclaiming this complete bundle would lose mandatory companions.'
				reclaimBytes = 0
				hardlinkBytes = 0
			} else if (
				completeCount === 1
				&& member.context.completenessStatus === 'complete'
				&& copyOverride !== 'force-purge'
			) {
				verdict = 'blocked-incomplete-anchor'
				verdictLabel = 'Only Complete Bundle'
				verdictReason = 'Only complete bundle across duplicate locations.'
				reclaimBytes = 0
				hardlinkBytes = 0
			} else if (strategy === 'hardlink-preserve' && copyOverride !== 'force-purge') {
				verdict = 'hardlink-bundle-candidate'
				verdictLabel = 'Hardlink / Reflink Preserve'
				verdictReason = `Preserve companion graph in ${member.dirPath} via inode hardlink or CoW reflink.`
				reclaimBytes = member.sizeBytes
				hardlinkBytes = member.sizeBytes
			} else {
				verdict = 'atomic-bundle-reclaim'
				verdictLabel = member.context.companionCount > 0
					? `Atomic Purge (+${member.context.companionCount} companions)`
					: 'Atomic Purge'
				verdictReason = member.context.companionCount > 0
					? `Reclaims primary file plus ${member.context.companionCount} redundant companion(s) atomically without stranding metadata.`
					: 'Redundant copy safe to reclaim while canonical bundle remains intact.'
			}

			return {
				...member,
				role: isSurvivor ? 'survivor' : 'candidate',
				verdict,
				verdictLabel,
				verdictReason,
				reclaimBytes,
				formattedReclaimBytes: formatBytes(reclaimBytes),
				hardlinkBytes,
				formattedHardlinkBytes: formatBytes(hardlinkBytes),
			}
		})

		const copies = members.filter(m => m.role === 'candidate')
		const groupInfo = computeGroupReclaimableInfo(group)
		const rawDuplicateBytes = groupInfo.reclaimableBytes
		const bundleTotalFootprintBytes = members.reduce((acc, m) => acc + m.sizeBytes + m.context.companionBytes, 0)
		const atomicReclaimableBytes = copies.reduce((acc, c) => acc + c.reclaimBytes, 0)
		const hardlinkSavingsBytes = copies.reduce((acc, c) => acc + c.hardlinkBytes, 0)
		const orphanCollateralBytes = copies.reduce((acc, c) => (
			c.verdict === 'atomic-bundle-reclaim' || c.verdict === 'hardlink-bundle-candidate'
				? acc + c.context.orphanCollateralBytes
				: acc
		), 0)

		const hasIncompleteMember = members.some(m => m.context.completenessStatus === 'incomplete' || m.context.completenessStatus === 'companion-only')
		const hasShieldedMember = copies.some(c => c.verdict.startsWith('blocked-'))
		const hasOrphanCollateralRisk = orphanCollateralBytes > 0
		const hasAtomicReclaimable = copies.some(c => c.verdict === 'atomic-bundle-reclaim' || c.verdict === 'hardlink-bundle-candidate')

		let groupRiskState = 'healthy-reclaimable'
		if (!hasAnyCompleteCopy && matchedSpecInfo.spec.mandatoryExts.length > 0) {
			groupRiskState = 'incomplete-bundle'
		} else if (hasOrphanCollateralRisk) {
			groupRiskState = 'orphan-collateral-risk'
		} else if (hasShieldedMember) {
			groupRiskState = 'shielded'
		}

		const bundleRecord = {
			groupKey,
			primaryGroupId: group.id ?? null,
			hash: String(group.hash || ''),
			domain,
			domainLabel: SCIENTIFIC_DOMAIN_META[domain].label,
			specId: matchedSpecInfo.spec.id,
			specLabel: matchedSpecInfo.spec.label,
			displayName: survivorMember.stem || survivorMember.fileName,
			extension: survivorMember.ext,
			mandatoryExts: [...matchedSpecInfo.spec.mandatoryExts],
			groupOverride,
			groupRiskState,
			hasIncompleteMember,
			hasShieldedMember,
			hasOrphanCollateralRisk,
			hasAtomicReclaimable,
			minCompletenessScore: Math.min(...members.map(m => m.context.completenessScore)),
			copyCount: members.length,
			rawDuplicateBytes,
			formattedRawDuplicateBytes: formatBytes(rawDuplicateBytes),
			bundleTotalFootprintBytes,
			formattedBundleTotalFootprintBytes: formatBytes(bundleTotalFootprintBytes),
			atomicReclaimableBytes,
			formattedAtomicReclaimableBytes: formatBytes(atomicReclaimableBytes),
			hardlinkSavingsBytes,
			formattedHardlinkSavingsBytes: formatBytes(hardlinkSavingsBytes),
			orphanCollateralBytes,
			formattedOrphanCollateralBytes: formatBytes(orphanCollateralBytes),
			survivor: members.find(m => m.role === 'survivor') || members[0],
			members,
			copies,
		}

		// Domain KPI counts reflect all matched scientific bundles before domain/verdict narrowing,
		// after size & search filters are evaluated.
		const matchesMinSize = bundleRecord.bundleTotalFootprintBytes >= minSizeBytes
		const matchesSearch = !searchQuery || (
			bundleRecord.displayName.toLowerCase().includes(searchQuery)
			|| bundleRecord.extension.toLowerCase().includes(searchQuery)
			|| bundleRecord.specLabel.toLowerCase().includes(searchQuery)
			|| bundleRecord.members.some(m => (
				m.normalizedPath.toLowerCase().includes(searchQuery)
				|| m.context.companionFiles.some(c => c.fileName.toLowerCase().includes(searchQuery))
			))
		)

		if (!matchesMinSize || !matchesSearch) {
			continue
		}

		domainCounts[domain] += 1

		if (domainFilter !== 'all' && bundleRecord.domain !== domainFilter) {
			continue
		}
		if (verdictFilter === 'atomic-reclaimable' && !bundleRecord.hasAtomicReclaimable) {
			continue
		}
		if (verdictFilter === 'orphan-collateral-risk' && !bundleRecord.hasOrphanCollateralRisk) {
			continue
		}
		if (verdictFilter === 'incomplete-bundle' && !bundleRecord.hasIncompleteMember) {
			continue
		}
		if (verdictFilter === 'shielded' && !bundleRecord.hasShieldedMember) {
			continue
		}

		analyzedBundles.push(bundleRecord)
		totalRawDuplicateBytes += bundleRecord.rawDuplicateBytes
		totalAtomicReclaimableBytes += bundleRecord.atomicReclaimableBytes
		totalHardlinkSavingsBytes += bundleRecord.hardlinkSavingsBytes
		totalOrphanCollateralBytes += bundleRecord.orphanCollateralBytes
		if (bundleRecord.hasIncompleteMember) {
			incompleteBundlesCount += 1
		}
		shieldedCopiesCount += bundleRecord.copies.filter(c => c.verdict.startsWith('blocked-')).length
		atomicReclaimableCopiesCount += bundleRecord.copies.filter(c => (
			c.verdict === 'atomic-bundle-reclaim' || c.verdict === 'hardlink-bundle-candidate'
		)).length
	}

	analyzedBundles.sort((a, b) => {
		if (sortMode === 'collateral_desc') {
			if (a.orphanCollateralBytes !== b.orphanCollateralBytes) {
				return b.orphanCollateralBytes - a.orphanCollateralBytes
			}
		} else if (sortMode === 'completeness_asc') {
			if (a.minCompletenessScore !== b.minCompletenessScore) {
				return a.minCompletenessScore - b.minCompletenessScore
			}
		} else if (sortMode === 'name_asc') {
			return a.displayName.localeCompare(b.displayName)
		}

		if (a.atomicReclaimableBytes !== b.atomicReclaimableBytes) {
			return b.atomicReclaimableBytes - a.atomicReclaimableBytes
		}
		return a.displayName.localeCompare(b.displayName)
	})

	const efficiencyPct = totalRawDuplicateBytes > 0
		? Math.min(100, Math.round((totalAtomicReclaimableBytes / totalRawDuplicateBytes) * 100))
		: 0

	return {
		schema: SCIENTIFIC_BUNDLE_SCHEMA,
		strategy,
		survivorRule,
		domainFilter,
		verdictFilter,
		summary: {
			totalBundlesCount: analyzedBundles.length,
			totalRawDuplicateBytes,
			formattedRawDuplicateBytes: formatBytes(totalRawDuplicateBytes),
			atomicReclaimableBytes: totalAtomicReclaimableBytes,
			formattedAtomicReclaimableBytes: formatBytes(totalAtomicReclaimableBytes),
			hardlinkSavingsBytes: totalHardlinkSavingsBytes,
			formattedHardlinkSavingsBytes: formatBytes(totalHardlinkSavingsBytes),
			orphanCollateralBytes: totalOrphanCollateralBytes,
			formattedOrphanCollateralBytes: formatBytes(totalOrphanCollateralBytes),
			incompleteBundlesCount,
			shieldedCopiesCount,
			atomicReclaimableCopiesCount,
			efficiencyPct,
			domainCounts,
		},
		bundles: analyzedBundles,
	}
}

/**
 * Generate a safe POSIX bash script with DRY_RUN=1 default for atomic companion-bundle
 * quarantine/reclaim or hardlink/reflink consolidation plus Nextcloud occ files:scan.
 *
 * @param {object} analysis Result of analyzeScientificBundles.
 * @param {object} [options] Script options (dataRoot, quarantineDir).
 * @return {string} POSIX bash script text.
 */
export function buildScientificBundleScript(analysis, options = {}) {
	const dataRoot = typeof options.dataRoot === 'string' && options.dataRoot.trim()
		? options.dataRoot.trim().replace(/\/+$/, '')
		: '/var/www/nextcloud/data'
	const quarantineDir = typeof options.quarantineDir === 'string' && options.quarantineDir.trim()
		? options.quarantineDir.trim().replace(/\/+$/, '')
		: '/var/backups/duplicatefinder-bundle-quarantine'

	const bundles = analysis && Array.isArray(analysis.bundles) ? analysis.bundles : []
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'IFS=$\'\\n\\t\'',
		'',
		'# Nextcloud DuplicateFinder: Scientific, GIS, CAD/BIM & ML-Shard Atomic Bundle Plan',
		`# Strategy: ${analysis?.strategy || 'atomic-purge'}`,
		`# Atomic Reclaim Estimate: ${analysis?.summary?.formattedAtomicReclaimableBytes || '0 B'}`,
		`# Protected Orphan Collateral: ${analysis?.summary?.formattedOrphanCollateralBytes || '0 B'}`,
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'ALLOW_DELETE="$' + '{ALLOW_DELETE:-0}"',
		`DATA_ROOT=${escapePosixSingleQuote(dataRoot)}`,
		`QUARANTINE_DIR=${escapePosixSingleQuote(quarantineDir)}`,
		'',
		'resolve_path() {',
		'  local rel="$1"',
		'  rel="$' + '{rel#/}"',
		'  printf \'%s/%s\' "$DATA_ROOT" "$rel"',
		'}',
		'',
		'atomic_reclaim_file() {',
		'  local target="$1"',
		'  if [ ! -e "$target" ]; then',
		'    return 0',
		'  fi',
		'  if [ "$DRY_RUN" = "1" ]; then',
		'    printf \'[DRY_RUN] quarantine/reclaim: %s\\n\' "$target"',
		'  elif [ "$ALLOW_DELETE" = "1" ]; then',
		'    rm -f -- "$target"',
		'  else',
		'    mkdir -p -- "$QUARANTINE_DIR"',
		'    mv -n -- "$target" "$QUARANTINE_DIR/"',
		'  fi',
		'}',
		'',
	]

	let actionCount = 0
	const touchedDirs = new Set()

	for (const bundle of bundles) {
		lines.push(`# === [${bundle.domain.toUpperCase()}] ${bundle.specLabel}: ${bundle.displayName} ===`)
		lines.push(`SURVIVOR=$(resolve_path ${escapePosixSingleQuote(bundle.survivor.normalizedPath)})`)

		for (const copy of bundle.copies) {
			const quotedRel = escapePosixSingleQuote(copy.normalizedPath)
			if (copy.verdict.startsWith('blocked-') || copy.verdict === 'excluded') {
				lines.push(`# SHIELDED (${copy.verdict.toUpperCase()}): ${quotedRel} -- ${copy.verdictReason}`)
				continue
			}

			actionCount += 1
			touchedDirs.add(copy.dirPath)
			lines.push(`TARGET=$(resolve_path ${quotedRel})`)

			if (copy.verdict === 'hardlink-bundle-candidate') {
				lines.push('if [ -f "$SURVIVOR" ] && [ -f "$TARGET" ]; then')
				lines.push('  if [ "$DRY_RUN" = "1" ]; then')
				lines.push('    printf \'[DRY_RUN] ln -f -- %s %s\\n\' "$SURVIVOR" "$TARGET"')
				lines.push('  else')
				lines.push('    ln -f -- "$SURVIVOR" "$TARGET"')
				lines.push('  fi')
				lines.push('fi')
			} else {
				lines.push('if [ -f "$SURVIVOR" ] && [ -f "$TARGET" ]; then')
				lines.push('  atomic_reclaim_file "$TARGET"')
				for (const companion of copy.context.companionFiles) {
					lines.push(`  atomic_reclaim_file "$(resolve_path ${escapePosixSingleQuote(companion.normalizedPath)})"`)
				}
				lines.push('fi')
			}
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('# No actionable scientific/GIS/CAD/ML companion bundles matched active safety filters.')
	} else {
		lines.push('# Re-index affected Nextcloud directories after non-dry-run execution:')
		for (const dir of Array.from(touchedDirs).sort()) {
			lines.push(`# sudo -u www-data php occ files:scan --path=${escapePosixSingleQuote(dir)}`)
		}
	}

	return lines.join('\n')
}

/**
 * Build an RFC 4180 CRLF CSV report with CWE-1236 formula injection neutralization.
 *
 * @param {object} analysis Result of analyzeScientificBundles.
 * @return {string} Safe CSV report string.
 */
export function buildScientificBundleCsvReport(analysis) {
	const header = [
		'group_key',
		'domain',
		'spec_label',
		'bundle_name',
		'role',
		'completeness_status',
		'completeness_score',
		'verdict',
		'path',
		'size_bytes',
		'companion_count',
		'companion_bytes',
		'orphan_collateral_bytes',
		'reclaim_bytes',
		'missing_mandatory',
		'companion_files',
		'verdict_reason',
	]
	const rows = [header.map(escapeCsvCell).join(',')]
	const bundles = analysis && Array.isArray(analysis.bundles) ? analysis.bundles : []

	for (const bundle of bundles) {
		for (const member of bundle.members) {
			const row = [
				bundle.groupKey,
				bundle.domain,
				bundle.specLabel,
				bundle.displayName,
				member.role,
				member.context.completenessStatus,
				member.context.completenessScore,
				member.verdict,
				member.normalizedPath,
				member.sizeBytes,
				member.context.companionCount,
				member.context.companionBytes,
				member.context.orphanCollateralBytes,
				member.reclaimBytes,
				member.context.missingMandatory.join(' '),
				member.context.companionFiles.map(c => c.fileName).join(' | '),
				member.verdictReason,
			]
			rows.push(row.map(escapeCsvCell).join(','))
		}
	}

	return rows.join('\r\n')
}

/**
 * Build structured JSON manifest for scientific/GIS/CAD/ML bundle auditing.
 *
 * @param {object} analysis Result of analyzeScientificBundles.
 * @return {string} Pretty-printed JSON string.
 */
export function buildScientificBundleJsonReport(analysis) {
	const payload = {
		schema: SCIENTIFIC_BUNDLE_SCHEMA,
		strategy: analysis?.strategy || 'atomic-purge',
		survivorRule: analysis?.survivorRule || 'complete-bundle-first',
		summary: analysis?.summary || {},
		bundles: (analysis?.bundles || []).map(bundle => ({
			groupKey: bundle.groupKey,
			primaryGroupId: bundle.primaryGroupId,
			hash: bundle.hash,
			domain: bundle.domain,
			specId: bundle.specId,
			specLabel: bundle.specLabel,
			displayName: bundle.displayName,
			groupRiskState: bundle.groupRiskState,
			rawDuplicateBytes: bundle.rawDuplicateBytes,
			bundleTotalFootprintBytes: bundle.bundleTotalFootprintBytes,
			atomicReclaimableBytes: bundle.atomicReclaimableBytes,
			orphanCollateralBytes: bundle.orphanCollateralBytes,
			survivorPath: bundle.survivor.normalizedPath,
			members: bundle.members.map(m => ({
				path: m.normalizedPath,
				role: m.role,
				verdict: m.verdict,
				completenessStatus: m.context.completenessStatus,
				completenessScore: m.context.completenessScore,
				sizeBytes: m.sizeBytes,
				companionCount: m.context.companionCount,
				companionBytes: m.context.companionBytes,
				orphanCollateralBytes: m.context.orphanCollateralBytes,
				reclaimBytes: m.reclaimBytes,
				missingMandatory: m.context.missingMandatory,
				companionPaths: m.context.companionFiles.map(c => c.normalizedPath),
				verdictReason: m.verdictReason,
			})),
		})),
	}
	return JSON.stringify(payload, null, 2)
}
