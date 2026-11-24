const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window, document } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

/**
 * Load the pure GIS, GeoSpatial Tile & CAD/BIM Map Archive Vault auditor module for tests.
 *
 * @return {object} Loaded module exports.
 */
function loadGisMapModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/gisMapArchiveAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

/**
 * Load GisMapArchiveWorkbench.vue with optional clipboard stub.
 *
 * @param {object} [clipboardImpl] Optional clipboard implementation.
 * @return {object} Vue component definition.
 */
function loadGisMapWorkbench(clipboardImpl) {
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js')
	const gisMapArchiveAuditor = loadGisMapModule()
	return loadComponent('src/components/GisMapArchiveWorkbench.vue', {
		'../tools/clipboardHelper': clipboardImpl === undefined
			? clipboardHelper
			: { copyTextSafely: text => clipboardHelper.copyTextSafely(text, clipboardImpl) },
		'../tools/gisMapArchiveAuditor': gisMapArchiveAuditor,
	})
}

/**
 * Build synthetic duplicate clusters covering all 4 GIS & CAD/BIM Map Archive families.
 *
 * @return {Array<object>} Sample duplicate groups.
 */
function buildSampleGisMapDuplicates() {
	const mib = 1024 * 1024
	const refSec = 1796600000
	return [
		{
			id: 9971,
			hash: 'sha256-gpkg-canonical-cadastre',
			size: 420 * mib,
			acknowledged: false,
			files: [
				{
					id: 99711,
					path: '/gis-vault/Projects/MetroRail/EPSG_2154/cadastre_parcels.gpkg',
					size: 420 * mib,
					mtime: refSec - 2 * 86400,
				},
				{
					id: 99712,
					path: '/canonical/Projects/MetroRail/EPSG_2154/cadastre_parcels.gpkg',
					size: 420 * mib,
					mtime: refSec - 2 * 86400,
				},
				{
					id: 99713,
					path: '/alice/files/Downloads/MetroRail/EPSG_2154/cadastre_parcels.gpkg',
					size: 420 * mib,
					mtime: refSec - 1 * 86400,
				},
			],
		},
		{
			id: 9972,
			hash: 'sha256-shp-sidecar-bundle-dbf',
			size: 64 * mib,
			acknowledged: false,
			files: [
				{
					id: 99721,
					path: '/gis-vault/Projects/MetroRail/EPSG_2154/roads.dbf',
					size: 64 * mib,
					mtime: refSec - 5 * 86400,
				},
				{
					id: 99722,
					path: '/gis-vault/Surveys/MetroRail/EPSG_2154/roads.dbf',
					size: 64 * mib,
					mtime: refSec - 5 * 86400,
				},
			],
		},
		{
			id: 9973,
			hash: 'sha256-geotiff-dem-master',
			size: 860 * mib,
			acknowledged: false,
			files: [
				{
					id: 99731,
					path: '/gis-vault/Projects/AlpineBasin/EPSG_32631/dem_1m_2026.geotiff',
					size: 860 * mib,
					mtime: refSec - 4 * 86400,
				},
				{
					id: 99732,
					path: '/masters/Projects/AlpineBasin/EPSG_32631/dem_1m_2026.geotiff',
					size: 860 * mib,
					mtime: refSec - 4 * 86400,
				},
			],
		},
		{
			id: 9974,
			hash: 'sha256-ifc-bim-site-model',
			size: 510 * mib,
			acknowledged: false,
			files: [
				{
					id: 99741,
					path: '/bim-vault/Projects/MetroRail/EPSG_2154/station_north_v3.ifc',
					size: 510 * mib,
					mtime: refSec - 3 * 86400,
				},
				{
					id: 99742,
					path: '/Downloads/MetroRail/station_north_v3.ifc',
					size: 510 * mib,
					mtime: refSec - 2 * 86400,
				},
			],
		},
		{
			id: 9975,
			hash: 'sha256-gdal-ovr-pyramid-cache',
			size: 190 * mib,
			acknowledged: false,
			files: [
				{
					id: 99751,
					path: '/gis-vault/Projects/AlpineBasin/overviews/dem_1m_2026.tif.ovr',
					size: 190 * mib,
					mtime: refSec - 30 * 86400,
				},
				{
					id: 99752,
					path: '/gis-vault/Projects/AlpineBasin/tiles/dem_1m_2026.tif.ovr',
					size: 190 * mib,
					mtime: refSec - 32 * 86400,
				},
				{
					id: 99753,
					path: '/Downloads/AlpineBasin/dem_1m_2026.tif.ovr',
					size: 190 * mib,
					mtime: refSec - 34 * 86400,
				},
			],
		},
		{
			id: 9976,
			hash: 'sha256-formula-injection-geojson',
			size: 24 * mib,
			acknowledged: false,
			files: [
				{
					id: 99761,
					path: '=cmd|calc/gis-vault/Projects/Harbor/WGS84/berths.geojson',
					size: 24 * mib,
					mtime: refSec - 10 * 86400,
				},
				{
					id: 99762,
					path: '=cmd|calc/Downloads/Harbor/WGS84/berths.geojson',
					size: 24 * mib,
					mtime: refSec - 9 * 86400,
				},
			],
		},
	]
}

describe('Cycle 180: GIS, GeoSpatial Tile & CAD/BIM Map Archive Vault Auditor', () => {
	test('classifies all 4 GIS/CAD/BIM families and extracts project, CRS, and tile-set signature deterministically', () => {
		const mod = loadGisMapModule()

		const gpkg = mod.classifyGisMapFile({ path: '/gis-vault/Projects/MetroRail/EPSG_2154/cadastre_parcels.gpkg' })
		assert.equal(gpkg.family, 'vector-gis-datasets')
		assert.equal(gpkg.projectName, 'metrorail')
		assert.equal(gpkg.crsCode, 'EPSG:2154')
		assert.equal(gpkg.isCanonicalMaster, true)

		const shpDbf = mod.classifyGisMapFile({ path: '/gis-vault/Projects/MetroRail/EPSG_2154/roads.dbf' })
		assert.equal(shpDbf.family, 'vector-gis-datasets')
		assert.equal(shpDbf.isShpSidecar, true)
		assert.equal(shpDbf.isShpCompanionOnly, true)

		const geotiff = mod.classifyGisMapFile({ path: '/gis-vault/Projects/AlpineBasin/EPSG_32631/dem_1m_2026.geotiff' })
		assert.equal(geotiff.family, 'raster-dem-imagery')
		assert.equal(geotiff.crsCode, 'EPSG:32631')
		assert.equal(geotiff.isCanonicalMaster, true)

		const ifc = mod.classifyGisMapFile({ path: '/bim-vault/Projects/MetroRail/EPSG_2154/station_north_v3.ifc' })
		assert.equal(ifc.family, 'cad-bim-site-models')
		assert.equal(ifc.isCanonicalMaster, true)
		assert.equal(ifc.revisionNumber, 3)

		const laz = mod.classifyGisMapFile({ path: '/gis-vault/Projects/AlpineBasin/lidar_tile_04.laz' })
		assert.equal(laz.family, 'cad-bim-site-models')
		assert.equal(laz.gisTool, 'PDAL / LiDAR Point Cloud')

		const ovr = mod.classifyGisMapFile({ path: '/gis-vault/Projects/AlpineBasin/overviews/dem_1m_2026.tif.ovr' })
		assert.equal(ovr.family, 'gis-tile-pyramid-caches')
		assert.equal(ovr.tileSignature, 'dem-1m-2026')

		const auxXml = mod.classifyGisMapFile({ path: '/gis-vault/Projects/AlpineBasin/dem_1m_2026.tif.aux.xml' })
		assert.equal(auxXml.family, 'gis-tile-pyramid-caches')

		const qgzTilde = mod.classifyGisMapFile({ path: '/gis-vault/Projects/MetroRail/site_map.qgz~' })
		assert.equal(qgzTilde.family, 'gis-tile-pyramid-caches')

		const slippyTile = mod.classifyGisMapFile({ path: '/gis-vault/Projects/MetroRail/tiles/14/8291/5642.png' })
		assert.equal(slippyTile.family, 'gis-tile-pyramid-caches')
		assert.equal(slippyTile.tileSignature, 'tile-z14-8291-5642')

		const unrelated = mod.classifyGisMapFile({ path: '/Documents/contract.pdf' })
		assert.equal(unrelated, null)
	})

	test('shields canonical GeoPackage/IFC/GeoTIFF masters and prevents orphaning .shp sidecars by default', () => {
		const mod = loadGisMapModule()
		const report = mod.analyzeGisMapArchive(buildSampleGisMapDuplicates())

		assert.equal(report.schema, mod.GIS_MAP_ARCHIVE_SCHEMA)
		assert.equal(report.summary.totalClustersCount, 6)
		assert.equal(report.summary.totalCanonicalMasterClusters, 3)
		assert.equal(report.summary.totalShpSidecarClusters, 1)
		assert.ok(report.summary.totalReclaimableBytes > 0)
		assert.match(report.summary.reclaimableGb, /^\d+\.\d{2} GB$/)

		// Canonical GeoPackage: both vault copies shielded, only Downloads copy reclaimed
		const gpkgCluster = report.clusters.find(c => c.primaryGroupId === 9971)
		assert.ok(gpkgCluster)
		const vaultGpkg = gpkgCluster.members.filter(m => m.meta.isCanonicalMaster)
		const dlGpkg = gpkgCluster.members.find(m => m.path.includes('/Downloads/'))
		assert.equal(vaultGpkg.length, 2)
		assert.equal(vaultGpkg[0].verdict, 'keep-canonical-survivor')
		assert.equal(vaultGpkg[1].verdict, 'blocked-canonical-master')
		assert.equal(vaultGpkg[1].actionType, 'keep')
		assert.equal(dlGpkg.actionType, 'prune')

		// Shapefile sidecar (.dbf): shielded against orphaning by default
		const shpCluster = report.clusters.find(c => c.primaryGroupId === 9972)
		assert.ok(shpCluster)
		assert.equal(shpCluster.hasShpSidecarBundle, true)
		assert.equal(shpCluster.reclaimableCopiesCount, 0)
		assert.equal(shpCluster.riskState, 'shp-sidecar-protected')
		assert.equal(shpCluster.members[1].verdict, 'blocked-shp-sidecar-integrity')

		// GeoTIFF DEM masters in gis-vault & masters: both shielded by default
		const demCluster = report.clusters.find(c => c.primaryGroupId === 9973)
		assert.ok(demCluster)
		assert.equal(demCluster.reclaimableCopiesCount, 0)
		assert.equal(demCluster.riskState, 'canonical-master-protected')

		// Stale .ovr pyramid caches are reclaimable
		const ovrCluster = report.clusters.find(c => c.primaryGroupId === 9975)
		assert.ok(ovrCluster)
		assert.equal(ovrCluster.reclaimableCopiesCount, 2)
	})

	test('generates safe POSIX DRY_RUN=1 script, CWE-1236 CSV, JSON manifest, and .sync-exclude.lst rules', () => {
		const mod = loadGisMapModule()
		const analysis = mod.analyzeGisMapArchive(buildSampleGisMapDuplicates(), {
			strategy: 'consolidate-gis-vault-hardlinks',
		})

		const script = mod.buildGisMapRemediationScript(analysis, { dataRoot: '/srv/nextcloud/data' })
		assert.ok(script.startsWith('#!/usr/bin/env sh'))
		assert.ok(script.includes('set -eu'))
		assert.ok(script.includes('DRY_RUN="$' + '{DRY_RUN:-1}"'))
		assert.ok(script.includes('ln -f '))

		const csv = mod.buildGisMapCsvReport(analysis)
		assert.ok(csv.includes('Project,CRS,TileSignature'))
		// CWE-1236 neutralization for leading '=' formula injection
		assert.ok(csv.includes("'=cmd|calc/"), 'CSV must neutralize leading = with single quote')

		const jsonStr = mod.buildGisMapJsonReport(analysis)
		const parsed = JSON.parse(jsonStr)
		assert.equal(parsed.schema, mod.GIS_MAP_ARCHIVE_SCHEMA)
		assert.equal(parsed.clusters.length, 6)

		const syncExclude = mod.buildGisMapSyncExcludeSnippet(analysis)
		assert.ok(syncExclude.includes('*.ovr'))
		assert.ok(syncExclude.includes('*.aux.xml'))
		assert.ok(syncExclude.includes('*.qgz~'))
		assert.ok(syncExclude.includes('tiles/'))
	})

	test('GisMapArchiveWorkbench.vue renders clusters, applies presets, toggles guards, and copies script', async () => {
		const copied = []
		const Workbench = loadGisMapWorkbench({
			writeText: async text => {
				copied.push(text)
			},
		})
		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: buildSampleGisMapDuplicates(),
					allDuplicates: buildSampleGisMapDuplicates(),
				},
			}),
		}).$mount(mountNode)

		try {
			await settle()
			assert.equal(vm.$el.classList.contains('gis-map-archive-workbench'), true)
			assert.equal(vm.$el.querySelectorAll('.gma__cluster-card').length, 6)

			// Apply Tile & Pyramid Caches preset
			const presetBtns = Array.from(vm.$el.querySelectorAll('.gma__seg-btn'))
			const cachePreset = presetBtns.find(b => b.textContent.includes('Prune Tile & Pyramid Caches'))
			assert.ok(cachePreset)
			cachePreset.click()
			await settle()
			assert.equal(vm.$el.querySelectorAll('.gma__cluster-card').length, 1)

			// Reset to All GIS & CAD/BIM Map Audit
			const allPreset = presetBtns.find(b => b.textContent.includes('All GIS & CAD/BIM Map Audit'))
			allPreset.click()
			await settle()
			assert.equal(vm.$el.querySelectorAll('.gma__cluster-card').length, 6)

			// Copy DRY_RUN=1 script
			const copyBtn = Array.from(vm.$el.querySelectorAll('.gma__tool-btn')).find(b => b.textContent.includes('Copy DRY_RUN=1 Script'))
			assert.ok(copyBtn)
			copyBtn.click()
			await settle()
			assert.equal(copied.length, 1)
			assert.ok(copied[0].includes('DRY_RUN="$' + '{DRY_RUN:-1}"'))
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('App.vue wires GisMapArchiveWorkbench with Shift+Z shortcut without breaking unshifted z', async () => {
		window.localStorage.clear()
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		const statsModule = loadModule('src/tools/duplicateStats.js')
		const GisMapArchiveWorkbench = loadGisMapWorkbench()

		const slotBox = tag => ({
			render(h) {
				return h(tag, this.$slots.default)
			},
		})
		const icon = slotBox('span')
		const stub = name => ({
			name,
			props: ['duplicate', 'projectId', 'show', 'isScanning'],
			render(h) {
				return h('div', { class: `stub-${name}` })
			},
		})

		const App = loadComponent('src/App.vue', {
			'@nextcloud/vue': {
				NcAppContent: slotBox('main'),
				NcContent: slotBox('div'),
				NcLoadingIcon: slotBox('span'),
				NcAppSettingsDialog: slotBox('section'),
				NcAppSettingsSection: slotBox('div'),
				NcButton: slotBox('button'),
				NcModal: slotBox('div'),
			},
			'./components/DuplicateNavigation.vue': { __esModule: true, default: stub('nav') },
			'./components/DuplicateDetails.vue': { __esModule: true, default: stub('details') },
			'./components/DuplicateTreemap.vue': { __esModule: true, default: stub('treemap') },
			'./components/SpaceReclamationTimeline.vue': { __esModule: true, default: stub('timeline') },
			'./components/SimilarityInspector.vue': { __esModule: true, default: stub('similarity') },
			'./components/BatchAutoSelectWorkbench.vue': { __esModule: true, default: stub('batch') },
			'./components/FileHygieneInspector.vue': { __esModule: true, default: stub('hygiene') },
			'./components/LinkDeduplicationSimulator.vue': { __esModule: true, default: stub('link') },
			'./components/FolderPairMatrix.vue': { __esModule: true, default: stub('matrix') },
			'./components/StorageFootprintAnalyzer.vue': { __esModule: true, default: stub('footprint') },
			'./components/PhotoBurstTimeline.vue': { __esModule: true, default: stub('burst') },
			'./components/RecoverySafetyWorkbench.vue': { __esModule: true, default: stub('recovery') },
			'./components/ArchivePayloadInspector.vue': { __esModule: true, default: stub('archive') },
			'./components/AudioTagWorkbench.vue': { __esModule: true, default: stub('audio') },
			'./components/VideoSceneWorkbench.vue': { __esModule: true, default: stub('video') },
			'./components/SidecarSweepWorkbench.vue': { __esModule: true, default: stub('sidecar') },
			'./components/RuleProfilesWorkbench.vue': { __esModule: true, default: stub('rules') },
			'./components/DocumentLineageWorkbench.vue': { __esModule: true, default: stub('doc') },
			'./components/PhotoPerceptualWorkbench.vue': { __esModule: true, default: stub('photo') },
			'./components/BrokenMediaQuarantineWorkbench.vue': { __esModule: true, default: stub('broken') },
			'./components/RetentionAgeWorkbench.vue': { __esModule: true, default: stub('retention') },
			'./components/FilenameCollisionWorkbench.vue': { __esModule: true, default: stub('collision') },
			'./components/QuotaAttributionWorkbench.vue': { __esModule: true, default: stub('quota') },
			'./components/PreviewCacheWorkbench.vue': { __esModule: true, default: stub('preview') },
			'./components/ShareMountAuditorWorkbench.vue': { __esModule: true, default: stub('share') },
			'./components/BackupDriftWorkbench.vue': { __esModule: true, default: stub('backup') },
			'./components/AutomationRulebookWorkbench.vue': { __esModule: true, default: stub('auto') },
			'./components/MetadataConsolidationWorkbench.vue': { __esModule: true, default: stub('meta') },
			'./components/ForensicVerifierWorkbench.vue': { __esModule: true, default: stub('forensic') },
			'./components/InodeSafetyWorkbench.vue': { __esModule: true, default: stub('inode') },
			'./components/ShadowReclaimWorkbench.vue': { __esModule: true, default: stub('shadow') },
			'./components/JunkPairInspectorWorkbench.vue': { __esModule: true, default: stub('junk') },
			'./components/MediaFidelityWorkbench.vue': { __esModule: true, default: stub('fidelity') },
			'./components/CdcChunkingWorkbench.vue': { __esModule: true, default: stub('cdc') },
			'./components/OpsScheduleWorkbench.vue': { __esModule: true, default: stub('ops') },
			'./components/LegalHoldWorkbench.vue': { __esModule: true, default: stub('legal') },
			'./components/RansomwareCanaryWorkbench.vue': { __esModule: true, default: stub('canary') },
			'./components/DevTreeReclaimerWorkbench.vue': { __esModule: true, default: stub('devtree') },
			'./components/ConflictStormWorkbench.vue': { __esModule: true, default: stub('conflict') },
			'./components/VmCowReflinkWorkbench.vue': { __esModule: true, default: stub('vmcow') },
			'./components/ScientificBundleWorkbench.vue': { __esModule: true, default: stub('sci') },
			'./components/BrandKitAuditorWorkbench.vue': { __esModule: true, default: stub('brand') },
			'./components/LogTelemetryWorkbench.vue': { __esModule: true, default: stub('log') },
			'./components/InstallerRepoWorkbench.vue': { __esModule: true, default: stub('installer') },
			'./components/WorkbookDriftWorkbench.vue': { __esModule: true, default: stub('workbook') },
			'./components/MailboxArchiveWorkbench.vue': { __esModule: true, default: stub('mailbox') },
			'./components/CadVaultWorkbench.vue': { __esModule: true, default: stub('cad') },
			'./components/WebBuildMediaWorkbench.vue': { __esModule: true, default: stub('webbuild') },
			'./components/LegalDocumentOcrWorkbench.vue': { __esModule: true, default: stub('legalocr') },
			'./components/BackupTakeoutWorkbench.vue': { __esModule: true, default: stub('takeout') },
			'./components/DawAudioStemWorkbench.vue': { __esModule: true, default: stub('daw') },
			'./components/VfxRenderCacheWorkbench.vue': { __esModule: true, default: stub('vfx') },
			'./components/ElearningScormWorkbench.vue': { __esModule: true, default: stub('scorm') },
			'./components/PhotoRawCatalogWorkbench.vue': { __esModule: true, default: stub('photoraw') },
			'./components/VmContainerImageWorkbench.vue': { __esModule: true, default: stub('vmcontainer') },
			'./components/MlDatasetArtifactWorkbench.vue': { __esModule: true, default: stub('mldataset') },
			'./components/Game3dAssetVaultWorkbench.vue': { __esModule: true, default: stub('game3d') },
			'./components/DatabaseDumpLogWorkbench.vue': { __esModule: true, default: stub('dblog') },
			'./components/DesignPublishingVaultWorkbench.vue': { __esModule: true, default: stub('designpub') },
			'./components/ReleaseBinaryArtifactWorkbench.vue': { __esModule: true, default: stub('release-binary-artifact-auditor') },
			'./components/EmailArchiveVaultWorkbench.vue': { __esModule: true, default: stub('email-archive-vault-auditor') },
			'./components/AudioDawVaultWorkbench.vue': { __esModule: true, default: stub('audio-daw-vault-auditor') },
			'./components/GisMapArchiveWorkbench.vue': { __esModule: true, default: GisMapArchiveWorkbench },
			'./components/ScientificResearchVaultWorkbench.vue': { __esModule: true, default: stub('scientific-research-vault-auditor') },
			'./components/LegalContractVaultWorkbench.vue': { __esModule: true, default: stub('legal-contract-vault-auditor') },
			'./components/MedicalDicomVaultWorkbench.vue': { __esModule: true, default: stub('medical-dicom-vault-auditor') },
			'./components/AdditiveManufacturingVaultWorkbench.vue': { __esModule: true, default: stub('additive-mfg-vault-auditor') },
			'./components/GameDevPipelineVaultWorkbench.vue': { __esModule: true, default: stub('game-dev-pipeline-vault-auditor') },
			'./components/PhotoGradingVaultWorkbench.vue': { __esModule: true, default: stub('photo-grading-vault-auditor') },
			'./components/MlCheckpointVaultWorkbench.vue': { __esModule: true, default: stub('ml-checkpoint-vault-auditor') },
			'./components/VmBackupVaultWorkbench.vue': { __esModule: true, default: stub('vm-backup-vault-auditor') },
			'./components/OriginFoldersSettings.vue': { __esModule: true, default: stub('origin') },
			'./components/ExcludedFoldersSettings.vue': { __esModule: true, default: stub('excluded') },
			'./components/BulkDeletionSettings.vue': { __esModule: true, default: stub('bulk') },
			'./components/ProjectsSettings.vue': { __esModule: true, default: stub('projects') },
			'./components/ProjectDuplicates.vue': { __esModule: true, default: stub('project-dups') },
			'./components/help/OnboardingGuide.vue': { __esModule: true, default: stub('guide') },
			'./components/help/UsageExamples.vue': { __esModule: true, default: stub('examples') },
			'./components/help/FAQ.vue': { __esModule: true, default: stub('faq') },
			'./components/FilterSettings.vue': { __esModule: true, default: stub('filters') },
			'@/tools/api': {
				fetchDuplicates: async type => ({
					entities: type === 'unacknowledged' ? buildSampleGisMapDuplicates() : [],
					pagination: { currentPage: 1, totalPages: 1, totalItems: 6, hasMore: false },
				}),
				fetchProjects: async () => [],
			},
			'@/tools/utils': utils,
			'@/tools/keyboardShortcuts': keyboardShortcuts,
			'@/tools/reclamationHistory': loadModule('src/tools/reclamationHistory.js', {
				'./duplicateFilters': loadModule('src/tools/duplicateFilters.js'),
				'./duplicateStats': statsModule,
			}),
			'vue-material-design-icons/Folder': icon,
			'vue-material-design-icons/FolderRemove': icon,
			'vue-material-design-icons/FolderMultiple': icon,
			'vue-material-design-icons/Delete': icon,
			'vue-material-design-icons/FilterOutline': icon,
		})

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue(App).$mount(mountNode)
		try {
			await settle()

			// Unshifted z still resolves to toggle-storage-footprint
			assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'z', shiftKey: false }), 'toggle-storage-footprint')
			assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'Z', shiftKey: true }), 'toggle-gis-map-archive-auditor')

			const btn = vm.$el.querySelector('button.topbar-gis-map-archive-button')
			assert.ok(btn, 'GIS Map Archive button is rendered in topbar')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'Shift+Z')
			assert.equal(vm.$el.querySelector('.gis-map-archive-workbench'), null)

			// Shift+Z opens workbench
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Z', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.ok(vm.$el.querySelector('.gis-map-archive-workbench'), 'GisMapArchiveWorkbench must open on Shift+Z shortcut')

			// Shift+Z again closes workbench
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Z', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.$el.querySelector('.gis-map-archive-workbench'), null, 'GisMapArchiveWorkbench must toggle closed on Shift+Z shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new GIS Map Archive files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/gisMapArchiveAuditor.js',
			'src/components/GisMapArchiveWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
		]
		for (const rel of files) {
			const content = readFileSync(resolve(root, rel), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(content), false, `No U+2013/U+2014 in ${rel}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `No XSS sink in ${rel}`)
		}
	})
})
