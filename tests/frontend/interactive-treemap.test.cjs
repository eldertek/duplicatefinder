const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window, document } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

const slotBox = tag => ({
	render(h) {
		return h(tag, this.$slots.default)
	},
})

function loadTreemapDeps() {
	const duplicateFilters = loadModule('src/tools/duplicateFilters.js')
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const duplicateTreemap = loadModule('src/tools/duplicateTreemap.js', {
		'./duplicateFilters': duplicateFilters,
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateStats': duplicateStats,
	})
	const DuplicateTreemap = loadComponent('src/components/DuplicateTreemap.vue', {
		'../tools/duplicateStats': duplicateStats,
		'../tools/duplicateTreemap': duplicateTreemap,
	})
	return {
		duplicateFilters,
		duplicatePathDiff,
		duplicateStats,
		duplicateTreemap,
		DuplicateTreemap,
	}
}

function createFullAppWithTreemap({ acknowledged = [], unacknowledged = [] } = {}) {
	const utils = loadModule('src/tools/utils.js', {
		'./notifications': { showErrorNotification: () => {} },
	})
	const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
	const {
		duplicateFilters,
		duplicatePathDiff,
		duplicateStats,
		DuplicateTreemap,
	} = loadTreemapDeps()
	const icon = slotBox('span')

	const SearchBar = loadComponent('src/components/SearchBar.vue', {
		'vue-material-design-icons/ChevronDown': icon,
	})

	const NcAppNavigationItemStub = {
		props: ['name', 'title', 'allowCollapse', 'open', 'active'],
		render(h) {
			return h('div', { class: ['nc-nav-item', { 'is-open': Boolean(this.open) }] }, [
				h('button', {
					attrs: { type: 'button' },
					on: { click: event => this.$emit('click', event) },
				}, this.name),
				this.$slots.default,
			])
		},
	}

	const DuplicateListItem = loadComponent('src/components/DuplicateListItem.vue', {
		'@nextcloud/vue': { NcAppNavigationItem: NcAppNavigationItemStub },
		'@/tools/duplicateStats': duplicateStats,
		'@/tools/utils': utils,
	})

	const DuplicateNavigation = loadComponent('src/components/DuplicateNavigation.vue', {
		'@nextcloud/vue': {
			NcAppNavigation: {
				render(h) {
					return h('nav', this.$scopedSlots.list ? this.$scopedSlots.list() : this.$slots.default)
				},
			},
			NcAppNavigationItem: NcAppNavigationItemStub,
			NcButton: slotBox('button'),
		},
		'./DuplicateListItem.vue': { __esModule: true, default: DuplicateListItem },
		'./SearchBar.vue': { __esModule: true, default: SearchBar },
		'vue-material-design-icons/CloseCircle': icon,
		'vue-material-design-icons/CheckCircle': icon,
		'vue-material-design-icons/Cog': icon,
		'vue-material-design-icons/Delete': icon,
		'vue-material-design-icons/HelpCircle': icon,
		'vue-material-design-icons/School': icon,
		'vue-material-design-icons/PlayCircle': icon,
		'vue-material-design-icons/FrequentlyAskedQuestions': icon,
		'vue-material-design-icons/FolderMultiple': icon,
		'vue-material-design-icons/FolderCog': icon,
		'vue-material-design-icons/Folder': icon,
		'@/tools/api': {
			fetchDuplicates: async () => ({ entities: [], pagination: { currentPage: 1, totalPages: 1 } }),
		},
		'@/tools/utils': utils,
		'@/tools/duplicateFilters': duplicateFilters,
		'@/tools/duplicatePreferences': loadModule('src/tools/duplicatePreferences.js'),
		'@/tools/duplicateSelectionAndExport': loadModule('src/tools/duplicateSelectionAndExport.js'),
		'@/tools/duplicateSortHelper': loadModule('src/tools/duplicateSortHelper.js'),
		'@/tools/duplicateStats': duplicateStats,
		'@/tools/duplicateMetadataBadges': loadModule('src/tools/duplicateMetadataBadges.js'),
	})

	const stub = name => ({
		name,
		props: ['duplicate', 'projectId', 'show', 'isScanning'],
		render(h) {
			return h('div', {
				class: `stub-${name}`,
				attrs: {
					'data-duplicate-id': this.duplicate ? String(this.duplicate.id) : '',
				},
			})
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
		'./components/DuplicateNavigation.vue': { __esModule: true, default: DuplicateNavigation },
		'./components/DuplicateDetails.vue': { __esModule: true, default: stub('duplicate-details') },
		'./components/DuplicateTreemap.vue': { __esModule: true, default: DuplicateTreemap },
		'./components/SpaceReclamationTimeline.vue': { __esModule: true, default: stub('space-reclamation-timeline') },
		'./components/SimilarityInspector.vue': { __esModule: true, default: stub('similarity-inspector') },
		'./components/BatchAutoSelectWorkbench.vue': { __esModule: true, default: stub('batch-auto-select') },
		'./components/FileHygieneInspector.vue': { __esModule: true, default: stub('file-hygiene') },
		'./components/LinkDeduplicationSimulator.vue': { __esModule: true, default: stub('link-simulator') },
		'./components/FolderPairMatrix.vue': { __esModule: true, default: stub('folder-matrix') },
		'./components/StorageFootprintAnalyzer.vue': { __esModule: true, default: stub('storage-footprint') },
		'./components/PhotoBurstTimeline.vue': { __esModule: true, default: stub('photo-bursts') },
		'./components/RecoverySafetyWorkbench.vue': { __esModule: true, default: stub('recovery-safety') },
		'./components/ArchivePayloadInspector.vue': { __esModule: true, default: stub('archive-inspector') },
		'./components/AudioTagWorkbench.vue': { __esModule: true, default: stub('audio-workbench') },
		'./components/VideoSceneWorkbench.vue': { __esModule: true, default: stub('video-workbench') },
		'./components/SidecarSweepWorkbench.vue': { __esModule: true, default: stub('sidecar-sweep') },
		'./components/RuleProfilesWorkbench.vue': { __esModule: true, default: stub('rule-profiles') },
		'./components/DocumentLineageWorkbench.vue': { __esModule: true, default: stub('document-lineage') },
		'./components/PhotoPerceptualWorkbench.vue': { __esModule: true, default: stub('photo-perceptual') },
		'./components/BrokenMediaQuarantineWorkbench.vue': { __esModule: true, default: stub('broken-quarantine') },
'./components/RetentionAgeWorkbench.vue': { __esModule: true, default: stub('retention-pruner') },
			'./components/FilenameCollisionWorkbench.vue': { __esModule: true, default: stub('filename-collisions') },
			'./components/QuotaAttributionWorkbench.vue': { __esModule: true, default: stub('quota-attribution') },
			'./components/PreviewCacheWorkbench.vue': { __esModule: true, default: stub('preview-cache') },
			'./components/ShareMountAuditorWorkbench.vue': { __esModule: true, default: stub('share-mount') },
			'./components/BackupDriftWorkbench.vue': { __esModule: true, default: stub('backup-drift') },
			'./components/AutomationRulebookWorkbench.vue': { __esModule: true, default: stub('automation-rulebook') },
			'./components/MetadataConsolidationWorkbench.vue': { __esModule: true, default: stub('metadata-consolidation') },
			'./components/ForensicVerifierWorkbench.vue': { __esModule: true, default: stub('forensic-verifier') },
			'./components/InodeSafetyWorkbench.vue': { __esModule: true, default: stub('inode-verifier') },
			'./components/ShadowReclaimWorkbench.vue': { __esModule: true, default: stub('shadow-reclaim') },
			'./components/JunkPairInspectorWorkbench.vue': { __esModule: true, default: stub('junk-pair') },
			'./components/MediaFidelityWorkbench.vue': { __esModule: true, default: stub('media-fidelity') },
			'./components/CdcChunkingWorkbench.vue': { __esModule: true, default: stub('cdc-chunking') },
			'./components/OpsScheduleWorkbench.vue': { __esModule: true, default: stub('ops-schedule') },
			'./components/LegalHoldWorkbench.vue': { __esModule: true, default: stub('legal-hold') },
			'./components/RansomwareCanaryWorkbench.vue': { __esModule: true, default: stub('ransomware-canary') },
			'./components/DevTreeReclaimerWorkbench.vue': { __esModule: true, default: stub('dev-tree') },
			'./components/ConflictStormWorkbench.vue': { __esModule: true, default: stub('conflict-storm') },
			'./components/VmCowReflinkWorkbench.vue': { __esModule: true, default: stub('vm-cow') },
			'./components/ScientificBundleWorkbench.vue': { __esModule: true, default: stub('scientific-bundle') },
			'./components/BrandKitAuditorWorkbench.vue': { __esModule: true, default: stub('brand-kit-auditor') },
			'./components/LogTelemetryWorkbench.vue': { __esModule: true, default: stub('log-telemetry-auditor') },
			'./components/InstallerRepoWorkbench.vue': { __esModule: true, default: stub('installer-repo-auditor') },
			'./components/WorkbookDriftWorkbench.vue': { __esModule: true, default: stub('workbook-drift-auditor') },
			'./components/MailboxArchiveWorkbench.vue': { __esModule: true, default: stub('mailbox-archive-auditor') },
			'./components/CadVaultWorkbench.vue': { __esModule: true, default: stub('cad-vault-auditor') },
			'./components/WebBuildMediaWorkbench.vue': { __esModule: true, default: stub('web-build-media-auditor') },
			'./components/LegalDocumentOcrWorkbench.vue': { __esModule: true, default: stub('legal-document-ocr-auditor') },
			'./components/BackupTakeoutWorkbench.vue': { __esModule: true, default: stub('backup-takeout-auditor') },
			'./components/DawAudioStemWorkbench.vue': { __esModule: true, default: stub('daw-audio-stem-auditor') },
			'./components/VfxRenderCacheWorkbench.vue': { __esModule: true, default: stub('vfx-render-cache-auditor') },
			'./components/ElearningScormWorkbench.vue': { __esModule: true, default: stub('elearning-scorm-auditor') },
			'./components/PhotoRawCatalogWorkbench.vue': { __esModule: true, default: stub('photo-raw-catalog-auditor') },
			'./components/VmContainerImageWorkbench.vue': { __esModule: true, default: stub('vm-container-image-auditor') },
			'./components/MlDatasetArtifactWorkbench.vue': { __esModule: true, default: stub('ml-dataset-artifact-auditor') },
			'./components/Game3dAssetVaultWorkbench.vue': { __esModule: true, default: stub('game3d-asset-vault-auditor') },
			'./components/DatabaseDumpLogWorkbench.vue': { __esModule: true, default: stub('database-dump-log-auditor') },
			'./components/DesignPublishingVaultWorkbench.vue': { __esModule: true, default: stub('design-publishing-vault-auditor') },
			'./components/ReleaseBinaryArtifactWorkbench.vue': { __esModule: true, default: stub('release-binary-artifact-auditor') },
			'./components/EmailArchiveVaultWorkbench.vue': { __esModule: true, default: stub('email-archive-vault-auditor') },
			'./components/AudioDawVaultWorkbench.vue': { __esModule: true, default: stub('audio-daw-vault-auditor') },
			'./components/GisMapArchiveWorkbench.vue': { __esModule: true, default: stub('gis-map-archive-auditor') },
			'./components/ScientificResearchVaultWorkbench.vue': { __esModule: true, default: stub('scientific-research-vault-auditor') },
			'./components/LegalContractVaultWorkbench.vue': { __esModule: true, default: stub('legal-contract-vault-auditor') },
			'./components/MedicalDicomVaultWorkbench.vue': { __esModule: true, default: stub('medical-dicom-vault-auditor') },
			'./components/AdditiveManufacturingVaultWorkbench.vue': { __esModule: true, default: stub('additive-mfg-vault-auditor') },
			'./components/GameDevPipelineVaultWorkbench.vue': { __esModule: true, default: stub('game-dev-pipeline-vault-auditor') },
			'./components/PhotoGradingVaultWorkbench.vue': { __esModule: true, default: stub('photo-grading-vault-auditor') },
			'./components/MlCheckpointVaultWorkbench.vue': { __esModule: true, default: stub('ml-checkpoint-vault-auditor') },
			'./components/VmBackupVaultWorkbench.vue': { __esModule: true, default: stub('vm-backup-vault-auditor') },
			'./components/DbSqlLogVaultWorkbench.vue': { __esModule: true, default: stub('db-sql-log-vault-auditor') },
			'./components/BroadcastNleVaultWorkbench.vue': { __esModule: true, default: stub('broadcast-nle-vault-auditor') },
			'./components/EcommercePimVaultWorkbench.vue': { __esModule: true, default: stub('ecommerce-pim-vault-auditor') },
			'./components/FinanceTaxVaultWorkbench.vue': { __esModule: true, default: stub('finance-tax-vault-auditor') },
			'./components/IotFirmwareVaultWorkbench.vue': { __esModule: true, default: stub('iot-firmware-vault-auditor') },
			'./components/MobileBuildVaultWorkbench.vue': { __esModule: true, default: stub('mobile-build-vault-auditor') },
			'./components/K8sTerraformVaultWorkbench.vue': { __esModule: true, default: stub('k8s-terraform-vault-auditor') },
			'./components/PublishingPrepressVaultWorkbench.vue': { __esModule: true, default: stub('publishing-prepress-vault-auditor') },
			'./components/GenomicsBioinformaticsVaultWorkbench.vue': { __esModule: true, default: stub('genomics-bioinformatics-vault-auditor') },
			'./components/DfirSecurityVaultWorkbench.vue': { __esModule: true, default: stub('dfir-security-vault-auditor') },
			'./components/RoboticsRosVaultWorkbench.vue': { __esModule: true, default: stub('robotics-ros-vault-auditor') },
			'./components/SemiconductorEdaVaultWorkbench.vue': { __esModule: true, default: stub('semiconductor-eda-vault-auditor') },
			'./components/AerospaceCfdVaultWorkbench.vue': { __esModule: true, default: stub('aerospace-cfd-vault-auditor') },
			'./components/BatteryBmsVaultWorkbench.vue': { __esModule: true, default: stub('battery-bms-vault-auditor') },
			'./components/ChemPharmaGmpVaultWorkbench.vue': { __esModule: true, default: stub('chem-pharma-gmp-vault-auditor') },
			'./components/DigitalGridScadaVaultWorkbench.vue': { __esModule: true, default: stub('digital-grid-scada-vault-auditor') },
			'./components/EnergySeismicVaultWorkbench.vue': { __esModule: true, default: stub('energy-seismic-vault-auditor') },
			'./components/FiberTelecomRfVaultWorkbench.vue': { __esModule: true, default: stub('fiber-telecom-rf-vault-auditor') },
			'./components/GeotechShmCivilVaultWorkbench.vue': { __esModule: true, default: stub('geotech-shm-civil-vault-auditor') },
			'./components/HydrographyMarineVaultWorkbench.vue': { __esModule: true, default: stub('hydrography-marine-vault-auditor') },
			'./components/AstronomyFitsInterferometryVaultWorkbench.vue': { __esModule: true, default: stub('astronomy-fits-interferometry-vault-auditor') },
			'./components/MeteorologyClimateVaultWorkbench.vue': { __esModule: true, default: stub('meteorology-climate-vault-auditor') },
			'./components/MaterialsMicroscopyVaultWorkbench.vue': { __esModule: true, default: stub('materials-microscopy-vault-auditor') },
			'./components/LidarPhotogrammetryVaultWorkbench.vue': { __esModule: true, default: stub('lidar-photogrammetry-vault-auditor') },
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
				entities: type === 'acknowledged' ? acknowledged : unacknowledged,
				pagination: {
					currentPage: 1,
					totalPages: 1,
					totalItems: type === 'acknowledged' ? acknowledged.length : unacknowledged.length,
					hasMore: false,
				},
			}),
			fetchProjects: async () => [],
		},
		'@/tools/utils': utils,
		'@/tools/keyboardShortcuts': keyboardShortcuts,
		'@/tools/reclamationHistory': loadModule('src/tools/reclamationHistory.js', {
			'./duplicateFilters': duplicateFilters,
			'./duplicateStats': duplicateStats,
		}),
		'vue-material-design-icons/Folder': icon,
		'vue-material-design-icons/FolderRemove': icon,
		'vue-material-design-icons/FolderMultiple': icon,
		'vue-material-design-icons/Delete': icon,
		'vue-material-design-icons/FilterOutline': icon,
	})

	return { App, duplicatePathDiff }
}

describe('Cycle 116: WizTree / TreeSize Pro interactive click-to-zoom treemap synchronized with list', () => {
	test('duplicateTreemap builds exact non-inflated tree, compresses single-child folders, and lays out squarified tiles', () => {
		const { duplicateTreemap } = loadTreemapDeps()
		const {
			buildDuplicateTreemapTree,
			findTreemapNodeByPath,
			buildTreemapBreadcrumbs,
			computeSquarifiedTreemapLayout,
			treemapNodeContainsDuplicate,
		} = duplicateTreemap

		const emptyRoot = buildDuplicateTreemapTree([])
		assert.equal(emptyRoot.reclaimableBytes, 0)
		assert.equal(emptyRoot.children.length, 0)
		assert.deepEqual(computeSquarifiedTreemapLayout([]), { tiles: [], totalBytes: 0 })

		const duplicates = [
			{
				id: 101,
				hash: 'hash-photo-1',
				acknowledged: false,
				files: [
					{ id: 1, path: '/alice/files/Origin/sunset.jpg', size: 1000, mimetype: 'image/jpeg', isInOriginFolder: true },
					{ id: 2, path: '/alice/files/Photos/2023/sunset.jpg', size: 1000, mimetype: 'image/jpeg', isInOriginFolder: false },
					{ id: 3, path: '/alice/files/Backups/2023/Raw/sunset.jpg', size: 1000, mimetype: 'image/jpeg', isInOriginFolder: false },
				],
			},
			{
				id: 102,
				hash: 'hash-video-2',
				acknowledged: false,
				files: [
					{ id: 4, path: '/alice/files/Videos/clip.mp4', size: 4000, mimetype: 'video/mp4', isInOriginFolder: false },
					{ id: 5, path: '/alice/files/Videos/clip-copy.mp4', size: 4000, mimetype: 'video/mp4', isInOriginFolder: false },
				],
			},
		]

		const rootNode = buildDuplicateTreemapTree(duplicates)
		// Group 101 reclaimable = (3-1)*1000 = 2000; Group 102 reclaimable = (2-1)*4000 = 4000 => 6000 total
		assert.equal(rootNode.reclaimableBytes, 6000)
		assert.equal(rootNode.groupCount, 2)
		assert.equal(rootNode.category, 'videos')

		// Single-child folder chain compression: Backups/2023/Raw collapses to one folder tile
		const backupsNode = findTreemapNodeByPath(rootNode, '/Backups/2023/Raw')
		assert.ok(backupsNode)
		assert.equal(backupsNode.name, 'Backups/2023/Raw')
		assert.equal(backupsNode.reclaimableBytes, 1000)

		const crumbs = buildTreemapBreadcrumbs(rootNode, backupsNode)
		assert.deepEqual(crumbs, [
			{ name: 'All duplicates', path: '/' },
			{ name: 'Backups/2023/Raw', path: '/Backups/2023/Raw' },
		])

		assert.equal(treemapNodeContainsDuplicate(backupsNode, 101), true)
		assert.equal(treemapNodeContainsDuplicate(backupsNode, 102), false)

		const layout = computeSquarifiedTreemapLayout(rootNode.children, { aspect: 1.8, maxTiles: 16 })
		assert.equal(layout.totalBytes, 6000)
		assert.equal(layout.tiles.length, 3)

		let areaSum = 0
		for (const tile of layout.tiles) {
			assert.ok(tile.x >= 0 && tile.x <= 100)
			assert.ok(tile.y >= 0 && tile.y <= 100)
			assert.ok(tile.width > 0 && tile.x + tile.width <= 100.01)
			assert.ok(tile.height > 0 && tile.y + tile.height <= 100.01)
			areaSum += (tile.width * tile.height) / 100
		}
		assert.ok(Math.abs(areaSum - 100) < 0.2, `expected full area coverage (~100%), got ${areaSum}`)

		// Tail bucketing works cleanly when exceeding maxTiles
		const manyNodes = Array.from({ length: 12 }, (_, idx) => ({
			kind: 'group',
			id: `g-${idx}`,
			name: `file-${idx}.txt`,
			reclaimableBytes: (12 - idx) * 100,
			groupCount: 1,
			copyCount: 2,
			category: 'documents',
			categoryBytes: { documents: (12 - idx) * 100 },
			groupKeys: [`id:${idx}`],
		}))
		const bucketed = computeSquarifiedTreemapLayout(manyNodes, { maxTiles: 5, otherLabel: 'Other' })
		assert.equal(bucketed.tiles.length, 5)
		assert.equal(bucketed.tiles[4].node.kind, 'bucket')
		assert.equal(bucketed.tiles[4].node.items.length, 8)
	})

	test('DuplicateTreemap supports click-to-zoom, Backspace zoom-out, bucket drilldown, and XSS-safe rendering', async () => {
		const { DuplicateTreemap } = loadTreemapDeps()
		const xssFolder = '<img src=x onerror=alert(1)>'
		const duplicates = [
			{
				id: 1,
				hash: 'h1',
				files: [
					{ id: 10, path: `/alice/files/${xssFolder}/Sub/evil.jpg`, size: 5000, mimetype: 'image/jpeg', isInOriginFolder: false },
					{ id: 11, path: '/alice/files/Safe/evil.jpg', size: 5000, mimetype: 'image/jpeg', isInOriginFolder: false },
				],
			},
		]

		const selected = []
		const synced = []
		const vm = new Vue({
			render(h) {
				return h(DuplicateTreemap, {
					props: {
						duplicates,
						currentDuplicateId: 1,
						syncedFolderFilter: '',
					},
					on: {
						'select-duplicate': dup => selected.push(dup),
						'sync-folder-filter': path => synced.push(path),
					},
				})
			},
		}).$mount()
		await settle()

		// Zero XSS element injection
		assert.equal(vm.$el.querySelectorAll('img').length, 0)
		assert.ok(vm.$el.textContent.includes(xssFolder))

		const tiles = Array.from(vm.$el.querySelectorAll('.treemap-tile'))
		assert.equal(tiles.length, 2)
		assert.ok(tiles.every(tile => tile.classList.contains('is-containing-active')))

		// Click compressed folder tile to zoom in
		const xssTile = tiles.find(tile => tile.textContent.includes(xssFolder))
		xssTile.click()
		await settle()

		const breadcrumbs = Array.from(vm.$el.querySelectorAll('.treemap-breadcrumb-button'))
		assert.equal(breadcrumbs.length, 2)
		assert.ok(breadcrumbs[1].classList.contains('is-current'))

		// Group leaf inside zoomed folder is directly active and clicking selects duplicate
		const leafTile = vm.$el.querySelector('.treemap-tile--kind-group')
		assert.ok(leafTile)
		assert.ok(leafTile.classList.contains('is-active'))
		leafTile.click()
		await settle()
		assert.equal(selected.length, 1)
		assert.equal(selected[0].id, 1)

		// Sync folder filter emits target path
		const syncBtn = vm.$el.querySelector('.treemap-sync-button')
		assert.ok(syncBtn)
		syncBtn.click()
		await settle()
		assert.equal(synced[0], `/${xssFolder}/Sub`)

		// Backspace zooms out to root
		vm.$el.dispatchEvent(
			new document.defaultView.KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }),
		)
		await settle()
		assert.equal(vm.$el.querySelectorAll('.treemap-breadcrumb-button').length, 1)
		vm.$destroy()
	})

	test('DuplicateTreemap drills into Other bucket when many sibling folders exist', async () => {
		const { DuplicateTreemap } = loadTreemapDeps()
		const duplicates = Array.from({ length: 20 }, (_, idx) => ({
			id: idx + 1,
			hash: `h-${idx}`,
			files: [
				{ id: idx * 2 + 1, path: `/alice/files/Folder_${String(idx).padStart(2, '0')}/doc.pdf`, size: (20 - idx) * 1000, mimetype: 'application/pdf', isInOriginFolder: false },
				{ id: idx * 2 + 2, path: `/alice/files/Origin/doc-${idx}.pdf`, size: (20 - idx) * 1000, mimetype: 'application/pdf', isInOriginFolder: true },
			],
		}))

		const vm = new Vue({
			render(h) {
				return h(DuplicateTreemap, {
					props: { duplicates },
				})
			},
		}).$mount()
		await settle()

		const bucketTile = vm.$el.querySelector('.treemap-tile--kind-bucket')
		assert.ok(bucketTile, 'expected Other bucket tile when siblings exceed maxTiles')
		bucketTile.click()
		await settle()

		assert.ok(vm.$el.querySelector('.treemap-breadcrumb-current'))
		assert.equal(vm.$el.querySelectorAll('.treemap-tile').length, 5)
		vm.$destroy()
	})

	test('App.vue integrates Treemap button, t shortcut, help dialog entry, and 2-way list synchronization', async () => {
		window.localStorage.clear()
		const { resolveShortcutAction } = loadModule('src/tools/keyboardShortcuts.js')
		assert.equal(resolveShortcutAction({ key: 't' }), 'toggle-treemap')
		assert.equal(resolveShortcutAction({ key: 't', ctrlKey: true }), null)

		const { App } = createFullAppWithTreemap({
			unacknowledged: [
				{
					id: 1,
					hash: 'h-photos',
					acknowledged: false,
					files: [
						{ id: 11, path: '/alice/files/Photos/2023/a.jpg', size: 2048, mimetype: 'image/jpeg', isInOriginFolder: false },
						{ id: 12, path: '/alice/files/Photos/2023/b.jpg', size: 2048, mimetype: 'image/jpeg', isInOriginFolder: false },
					],
				},
				{
					id: 2,
					hash: 'h-videos',
					acknowledged: false,
					files: [
						{ id: 21, path: '/alice/files/Videos/movie.mp4', size: 8192, mimetype: 'video/mp4', isInOriginFolder: false },
						{ id: 22, path: '/alice/files/Backups/movie.mp4', size: 8192, mimetype: 'video/mp4', isInOriginFolder: false },
					],
				},
			],
		})

		const vm = new Vue(App).$mount()
		await settle()

		const topBtn = vm.$el.querySelector('.topbar-treemap-button')
		assert.ok(topBtn)
		assert.equal(topBtn.getAttribute('aria-keyshortcuts'), 't')
		assert.equal(topBtn.getAttribute('aria-pressed'), 'false')
		assert.equal(vm.$el.querySelector('.treemap-workspace'), null)

		// Press 't' to open interactive treemap
		window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 't', bubbles: true }))
		await settle()
		assert.equal(topBtn.getAttribute('aria-pressed'), 'true')
		assert.ok(vm.$el.querySelector('.treemap-workspace'))

		// Help dialog lists 't' shortcut
		const shortcutTexts = Array.from(vm.$el.querySelectorAll('.shortcuts-dialog__row')).map(row => row.textContent)
		assert.ok(shortcutTexts.some(text => text.includes('t') && text.toLowerCase().includes('treemap')))

		// Zoom into Videos and click the group tile -> selects duplicate #2 in App.vue and DuplicateDetails
		const videosTile = Array.from(vm.$el.querySelectorAll('.treemap-tile')).find(el => el.textContent.includes('Videos'))
		assert.ok(videosTile)
		videosTile.click()
		await settle()

		const groupTile = vm.$el.querySelector('.treemap-tile--kind-group')
		assert.ok(groupTile)
		groupTile.click()
		await settle()
		assert.equal(vm.currentDuplicate.id, 2)
		assert.equal(vm.$el.querySelector('.stub-duplicate-details').getAttribute('data-duplicate-id'), '2')
		assert.ok(vm.$el.querySelector('.treemap-tile--kind-group.is-active'))

		// Filter list to /Videos -> sidebar list filters down to group #2 only
		vm.$el.querySelector('.treemap-sync-button').click()
		await settle()
		assert.equal(vm.treemapSyncedFolder, '/Videos')
		assert.equal(vm.treemapSourceDuplicates.length, 1)
		assert.equal(vm.treemapSourceDuplicates[0].id, 2)

		// Clicking root breadcrumb clears synced folder filter and restores all 2 groups
		vm.$el.querySelector('.treemap-breadcrumb-button').click()
		await settle()
		assert.equal(vm.treemapSyncedFolder, '')
		assert.equal(vm.treemapSourceDuplicates.length, 2)

		// Pressing 't' inside an editable input must NOT close treemap
		const searchInput = vm.$el.querySelector('.search-input')
		searchInput.dispatchEvent(new window.KeyboardEvent('keydown', { key: 't', bubbles: true }))
		await settle()
		assert.ok(vm.$el.querySelector('.treemap-workspace'))

		// Pressing 't' globally closes treemap
		window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 't', bubbles: true }))
		await settle()
		assert.equal(vm.$el.querySelector('.treemap-workspace'), null)

		vm.$destroy()
	})

	test('Cycle 116 touched files preserve zero typographic dashes, zero XSS sinks, logical CSS, and >= 44px touch targets', () => {
		const files = [
			'src/tools/duplicateTreemap.js',
			'src/tools/keyboardShortcuts.js',
			'src/components/DuplicateTreemap.vue',
			'src/components/DuplicateNavigation.vue',
			'src/App.vue',
		]
		for (const relPath of files) {
			const content = readFileSync(resolve(root, relPath), 'utf8')
			assert.ok(!/[\u2013\u2014]/.test(content), `No U+2013/U+2014 dash allowed in ${relPath}`)
			assert.ok(!/v-html|innerHTML|outerHTML|document\.write/.test(content), `No DOM XSS sink allowed in ${relPath}`)
		}

		const treemapSource = readFileSync(resolve(root, 'src/components/DuplicateTreemap.vue'), 'utf8')
		assert.ok(treemapSource.includes(':focus-visible'))
		assert.ok(treemapSource.includes('44px'))
		assert.ok(treemapSource.includes('inline-size'))
		assert.ok(treemapSource.includes('block-size'))
		assert.ok(treemapSource.includes('insetInlineStart'))
	})
})
