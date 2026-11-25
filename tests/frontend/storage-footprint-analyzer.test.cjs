const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, document } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

const slotBox = tag => ({
	render(h) {
		return h(tag, this.$slots.default)
	},
})

function loadAnalyzerModules() {
	const stats = loadModule('src/tools/duplicateStats.js')
	const filters = loadModule('src/tools/duplicateFilters.js')
	const pathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const selectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const analyzer = loadModule('src/tools/storageFootprintAnalyzer.js', {
		'./duplicateFilters': filters,
		'./duplicatePathDiff': pathDiff,
		'./duplicateSelectionAndExport': selectionAndExport,
		'./duplicateStats': stats,
	})
	return { stats, filters, pathDiff, selectionAndExport, analyzer }
}

function loadAnalyzerComponent(deps) {
	return loadComponent('src/components/StorageFootprintAnalyzer.vue', {
		'../tools/storageFootprintAnalyzer': deps.analyzer,
	})
}

function createSampleGroups() {
	return [
		{
			id: 1,
			hash: 'h-video',
			acknowledged: false,
			files: [
				{ id: 101, path: '/alice/files/Videos/trip.mp4', mimetype: 'video/mp4', size: 120 * 1024 * 1024, isInOriginFolder: true },
				{ id: 102, path: '/alice/files/Backups/trip.mp4', mimetype: 'video/mp4', size: 120 * 1024 * 1024, isInOriginFolder: false },
			],
		},
		{
			id: 2,
			hash: 'h-image',
			acknowledged: false,
			files: [
				{ id: 201, path: '/alice/files/Photos/2025/sunset.jpg', mimetype: 'image/jpeg', size: 4 * 1024 * 1024, isInOriginFolder: false },
				{ id: 202, path: '/alice/files/Photos/2025/sunset-copy.jpg', mimetype: 'image/jpeg', size: 4 * 1024 * 1024, isInOriginFolder: false },
				{ id: 203, path: '/alice/files/Inbox/sunset.jpg', mimetype: 'image/jpeg', size: 4 * 1024 * 1024, isInOriginFolder: false },
			],
		},
		{
			id: 3,
			hash: 'h-archive',
			acknowledged: false,
			files: [
				{ id: 301, path: '/alice/files/Backups/archive.zip', mimetype: 'application/zip', size: 25 * 1024 * 1024, isInOriginFolder: false },
				{ id: 302, path: '/alice/files/Old/archive.zip', mimetype: 'application/zip', size: 25 * 1024 * 1024, isInOriginFolder: false },
			],
		},
		{
			id: 4,
			hash: 'h-doc-ack',
			acknowledged: true,
			files: [
				{ id: 401, path: '/alice/files/Docs/manual.pdf', mimetype: 'application/pdf', size: 50 * 1024, isInOriginFolder: false },
				{ id: 402, path: '/alice/files/Inbox/manual.pdf', mimetype: 'application/pdf', size: 50 * 1024, isInOriginFolder: false },
			],
		},
	]
}

describe('Cycle 127: Interactive Storage Footprint & Extension Analyzer (z shortcut)', () => {
	test('storageFootprintAnalyzer aggregates categories, size tiers, extensions, sorting, and CWE-1236-safe CSV/JSON exports', () => {
		const { analyzer } = loadAnalyzerModules()

		assert.equal(analyzer.classifySizeTier(1024), 'tiny')
		assert.equal(analyzer.classifySizeTier(200 * 1024), 'small')
		assert.equal(analyzer.classifySizeTier(2 * 1024 * 1024), 'medium')
		assert.equal(analyzer.classifySizeTier(20 * 1024 * 1024), 'large')
		assert.equal(analyzer.classifySizeTier(150 * 1024 * 1024), 'huge')

		const groups = createSampleGroups()
		const fullReport = analyzer.buildStorageFootprintReport(groups)

		assert.equal(fullReport.summary.totalGroups, 4)
		assert.equal(fullReport.summary.totalFiles, 9)
		assert.equal(fullReport.summary.redundantFiles, 5)
		assert.equal(fullReport.summary.protectedFiles, 1)
		assert.equal(fullReport.summary.uniqueExtensionsCount, 4)
		assert.equal(fullReport.extensions[0].ext, '.mp4')
		assert.equal(fullReport.extensions[0].category, 'videos')
		assert.equal(fullReport.extensions[0].largestGroup.id, 1)
		assert.equal(fullReport.topOffenders[0].id, 1)

		// Excluding acknowledged omits .pdf
		const unackOnly = analyzer.buildStorageFootprintReport(groups, { includeAcknowledged: false })
		assert.equal(unackOnly.summary.totalGroups, 3)
		assert.equal(unackOnly.scopeSummary.skippedAcknowledgedCount, 1)
		assert.equal(unackOnly.extensions.some(e => e.ext === '.pdf'), false)

		// Category filter + tier filter + search
		const imagesOnly = analyzer.buildStorageFootprintReport(groups, { categoryFilter: 'images' })
		assert.equal(imagesOnly.extensions.length, 1)
		assert.equal(imagesOnly.extensions[0].ext, '.jpg')
		assert.equal(imagesOnly.extensions[0].topFolder, '/Photos/2025')

		const hugeOnly = analyzer.buildStorageFootprintReport(groups, { sizeTierFilter: 'huge' })
		assert.equal(hugeOnly.extensions.length, 1)
		assert.equal(hugeOnly.extensions[0].ext, '.mp4')

		const byFilesDesc = analyzer.buildStorageFootprintReport(groups, { sortBy: 'files_desc' })
		assert.equal(byFilesDesc.extensions[0].ext, '.jpg')

		const byExtAsc = analyzer.buildStorageFootprintReport(groups, { sortBy: 'ext_asc' })
		assert.deepEqual(byExtAsc.extensions.map(e => e.ext), ['.jpg', '.mp4', '.pdf', '.zip'])

		// CWE-1236 formula neutralization in CSV export + clean JSON schema
		const evilGroups = [
			{
				id: 99,
				hash: 'h-evil',
				acknowledged: false,
				files: [
					{ id: 901, path: '/alice/files/=CMD()/=evil.txt', size: 2048, isInOriginFolder: false },
					{ id: 902, path: '/alice/files/Safe/=evil.txt', size: 2048, isInOriginFolder: false },
				],
			},
		]
		const evilReport = analyzer.buildStorageFootprintReport(evilGroups)
		const csv = analyzer.exportFootprintCsv(evilReport)
		assert.ok(csv.includes('"\'=CMD()"') || csv.includes('"\'/=CMD()"') || csv.includes('"\'=evil.txt"'))
		assert.ok(!csv.includes(',=evil.txt,'))

		const parsedJson = JSON.parse(analyzer.exportFootprintJson(fullReport))
		assert.equal(parsedJson.schema, analyzer.FOOTPRINT_REPORT_SCHEMA)
		assert.equal(parsedJson.extensions.length, 4)
		assert.equal(Object.prototype.hasOwnProperty.call(parsedJson.extensions[0].largestGroup, 'duplicate'), false)
	})

	test('StorageFootprintAnalyzer.vue renders empty, populated, filtered-empty, category/tier filtering, sidebar sync, and XSS defense', async () => {
		const deps = loadAnalyzerModules()
		const AnalyzerComp = loadAnalyzerComponent(deps)

		// Empty state
		const emptyEvents = []
		const emptyVm = new Vue({
			render: h => h(AnalyzerComp, {
				props: { duplicates: [], allDuplicates: [] },
				on: { 'start-scan': () => emptyEvents.push('scan') },
			}),
		}).$mount()
		await settle()
		assert.ok(emptyVm.$el.textContent.includes('No duplicate groups loaded yet'))
		emptyVm.$el.querySelector('.footprint-analyzer__primary-btn').click()
		assert.deepEqual(emptyEvents, ['scan'])
		emptyVm.$destroy()

		// Populated state with XSS payload in path
		const groups = [
			...createSampleGroups(),
			{
				id: 77,
				hash: 'xss-hash',
				acknowledged: false,
				files: [
					{ id: 771, path: '/alice/files/<img src=x onerror=alert(1)>/payload.dat', size: 1024, isInOriginFolder: false },
					{ id: 772, path: '/alice/files/Safe/payload.dat', size: 1024, isInOriginFolder: false },
				],
			},
		]
		const events = { select: [], compare: [], sync: [] }
		const vm = new Vue({
			render: h => h(AnalyzerComp, {
				props: {
					duplicates: groups,
					allDuplicates: groups,
					currentDuplicateId: 1,
					syncedExtensionFilter: '.mp4',
				},
				on: {
					'select-duplicate': g => events.select.push(g.id),
					'compare-duplicate': g => events.compare.push(g.id),
					'sync-extension-filter': ext => events.sync.push(ext),
				},
			}),
		}).$mount()
		await settle()

		// Zero XSS <img> injection
		assert.equal(vm.$el.querySelectorAll('img').length, 0)
		assert.ok(vm.$el.textContent.includes('<img src=x onerror=alert(1)>'))

		// Stacked bar and extension rows rendered
		assert.ok(vm.$el.querySelectorAll('.footprint-stacked-bar__segment').length >= 4)
		assert.equal(vm.$el.querySelectorAll('.footprint-ext-row').length, 5)
		assert.ok(vm.$el.querySelector('.footprint-ext-row.is-synced'))

		// Toggle sync off for .mp4, then sync .jpg
		const firstSyncBtn = vm.$el.querySelectorAll('.footprint-ext-row')[0].querySelector('.footprint-ext-action-btn')
		assert.equal(firstSyncBtn.getAttribute('aria-pressed'), 'true')
		firstSyncBtn.click()
		assert.deepEqual(events.sync, [''])

		// Inspect largest + Compare actions
		const rowButtons = vm.$el.querySelectorAll('.footprint-ext-row')[0].querySelectorAll('.footprint-ext-action-btn')
		rowButtons[1].click()
		rowButtons[2].click()
		assert.deepEqual(events.select, [1])
		assert.deepEqual(events.compare, [1])

		// Category filter narrows list; search mismatch enters filtered-empty and Reset restores
		const imagesChip = Array.from(vm.$el.querySelectorAll('.footprint-category-chip'))
			.find(el => el.textContent.includes('Images'))
		imagesChip.click()
		await settle()
		assert.equal(vm.$el.querySelectorAll('.footprint-ext-row').length, 1)

		const searchInput = vm.$el.querySelector('.footprint-analyzer__search-input')
		searchInput.value = 'nonexistent-ext-xyz'
		searchInput.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }))
		await settle()
		assert.ok(vm.$el.querySelector('.footprint-analyzer__filtered-empty'))

		const resetBtn = vm.$el.querySelector('.footprint-analyzer__filtered-empty button')
		resetBtn.click()
		await settle()
		assert.equal(vm.$el.querySelectorAll('.footprint-ext-row').length, 5)

		vm.$destroy()
	})

	test('App.vue + keyboardShortcuts wire z shortcut, topbar Footprint button, help dialog, and sidebar extension sync', async () => {
		const shortcuts = loadModule('src/tools/keyboardShortcuts.js')
		assert.equal(shortcuts.resolveShortcutAction({ key: 'z' }), 'toggle-storage-footprint')
		assert.ok(shortcuts.SHORTCUT_DEFINITIONS.some(item => item.action === 'toggle-storage-footprint' && item.keys.includes('z')))

		const deps = loadAnalyzerModules()
		const AnalyzerComp = loadAnalyzerComponent(deps)
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const reclamationHistory = loadModule('src/tools/reclamationHistory.js', {
			'./duplicateFilters': deps.filters,
			'./duplicateStats': deps.stats,
		})

		const syncedExtensions = []
		const DuplicateNavigation = {
			name: 'DuplicateNavigation',
			props: ['acknowledgedDuplicates', 'unacknowledgedDuplicates', 'currentDuplicateId'],
			methods: {
				setExtensionFilter(ext) {
					syncedExtensions.push(ext)
					this.$emit('extension-filter-changed', ext)
				},
				scrollActiveDuplicateIntoView() {},
			},
			render(h) {
				return h('nav', { class: 'stub-nav' })
			},
		}

		const stub = name => ({
			name,
			render(h) {
				return h('div', { attrs: { 'data-stub': name } })
			},
		})

		const sampleGroups = createSampleGroups().filter(g => !g.acknowledged)

		const App = loadComponent('src/App.vue', {
			'@nextcloud/vue': {
				NcAppContent: slotBox('main'),
				NcContent: slotBox('div'),
				NcLoadingIcon: slotBox('span'),
				NcButton: slotBox('button'),
				NcModal: slotBox('div'),
				NcAppSettingsDialog: slotBox('div'),
				NcAppSettingsSection: slotBox('section'),
			},
			'./components/DuplicateNavigation.vue': { __esModule: true, default: DuplicateNavigation },
			'./components/DuplicateDetails.vue': { __esModule: true, default: stub('duplicate-details') },
			'./components/DuplicateTreemap.vue': { __esModule: true, default: stub('duplicate-treemap') },
			'./components/SpaceReclamationTimeline.vue': { __esModule: true, default: stub('space-reclamation-timeline') },
			'./components/SimilarityInspector.vue': { __esModule: true, default: stub('similarity-inspector') },
			'./components/BatchAutoSelectWorkbench.vue': { __esModule: true, default: stub('batch-auto-select') },
			'./components/FileHygieneInspector.vue': { __esModule: true, default: stub('file-hygiene') },
			'./components/LinkDeduplicationSimulator.vue': { __esModule: true, default: stub('link-simulator') },
			'./components/FolderPairMatrix.vue': { __esModule: true, default: stub('folder-matrix') },
			'./components/StorageFootprintAnalyzer.vue': { __esModule: true, default: AnalyzerComp },
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
			'./components/MocapBiomechanicsVaultWorkbench.vue': { __esModule: true, default: stub('mocap-biomechanics-vault-auditor') },
			'./components/OriginFoldersSettings.vue': { __esModule: true, default: stub('origin') },
			'./components/ExcludedFoldersSettings.vue': { __esModule: true, default: stub('excluded') },
			'./components/BulkDeletionSettings.vue': { __esModule: true, default: stub('bulk') },
			'./components/ProjectsSettings.vue': { __esModule: true, default: stub('projects') },
			'./components/ProjectDuplicates.vue': { __esModule: true, default: stub('project-dups') },
			'./components/FilterSettings.vue': { __esModule: true, default: stub('filter-settings') },
			'./components/help/OnboardingGuide.vue': { __esModule: true, default: stub('guide') },
			'./components/help/UsageExamples.vue': { __esModule: true, default: stub('examples') },
			'./components/help/FAQ.vue': { __esModule: true, default: stub('faq') },
			'@/tools/api': {
				fetchDuplicates: async type => ({
					entities: type === 'unacknowledged' ? sampleGroups : [],
					pagination: {
						currentPage: 1,
						totalPages: 1,
						totalItems: type === 'unacknowledged' ? sampleGroups.length : 0,
						hasMore: false,
					},
				}),
				fetchProjects: async () => [],
				fetchScanStatus: async () => ({ running: false, completedSeq: 1 }),
				startUserScan: async () => null,
				notifyScanStarted: () => {},
				notifyScanCompleted: () => {},
				notifyScanFailed: () => {},
			},
			'@/tools/utils': utils,
			'@/tools/keyboardShortcuts': shortcuts,
			'@/tools/reclamationHistory': reclamationHistory,
			'vue-material-design-icons/Folder': slotBox('span'),
			'vue-material-design-icons/FolderRemove': slotBox('span'),
			'vue-material-design-icons/FolderMultiple': slotBox('span'),
			'vue-material-design-icons/Delete': slotBox('span'),
			'vue-material-design-icons/FilterOutline': slotBox('span'),
		})

		const vm = new Vue({ render: h => h(App) }).$mount()
		await settle()

		const topbarBtn = vm.$el.querySelector('.topbar-footprint-button')
		assert.ok(topbarBtn)
		assert.equal(topbarBtn.getAttribute('aria-pressed'), 'false')
		assert.equal(topbarBtn.getAttribute('aria-keyshortcuts'), 'z')

		// Press 'z' shortcut to open StorageFootprintAnalyzer
		window.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: 'z', bubbles: true }))
		await settle()
		assert.equal(topbarBtn.getAttribute('aria-pressed'), 'true')
		assert.ok(vm.$el.querySelector('.footprint-analyzer'))

		// Help dialog lists 'z' shortcut in DOM
		window.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: '?', bubbles: true }))
		await settle()
		assert.ok(vm.$el.querySelector('.shortcuts-dialog').textContent.includes('Toggle storage footprint and extension analyzer'))
		window.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
		await settle()

		// Filter sidebar sync from StorageFootprintAnalyzer forwards to DuplicateNavigation.setExtensionFilter
		const filterBtn = vm.$el.querySelector('.footprint-ext-row .footprint-ext-action-btn')
		filterBtn.click()
		await settle()
		assert.deepEqual(syncedExtensions, ['.mp4'])
		assert.equal(filterBtn.getAttribute('aria-pressed'), 'true')

		// Press 'z' again to close
		window.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: 'z', bubbles: true }))
		await settle()
		assert.equal(topbarBtn.getAttribute('aria-pressed'), 'false')
		assert.equal(vm.$el.querySelector('.footprint-analyzer'), null)

		vm.$destroy()
	})

	test('Cycle 127 touched files preserve zero U+2013/U+2014 dashes, zero XSS sinks, logical CSS, and >= 44px mobile touch targets', () => {
		for (const relPath of [
			'src/tools/storageFootprintAnalyzer.js',
			'src/components/StorageFootprintAnalyzer.vue',
			'src/tools/keyboardShortcuts.js',
			'src/components/DuplicateNavigation.vue',
			'src/App.vue',
			'tests/frontend/storage-footprint-analyzer.test.cjs',
		]) {
			const content = readFileSync(resolve(root, relPath), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(content), false, `${relPath} must contain zero U+2013/U+2014 dashes`)
		}

		const vueSource = readFileSync(resolve(root, 'src/components/StorageFootprintAnalyzer.vue'), 'utf8')
		assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(vueSource), false, 'StorageFootprintAnalyzer.vue must have zero XSS sinks')
		const styleSection = vueSource.slice(vueSource.indexOf('<style'))
		assert.equal(/margin-(left|right)|padding-(left|right)|border-(left|right)/.test(styleSection), false, 'StorageFootprintAnalyzer.vue must use logical CSS properties')
		assert.ok(styleSection.includes(':focus-visible'), 'StorageFootprintAnalyzer.vue must define :focus-visible styles')
		assert.ok(styleSection.includes('min-block-size: 44px'), 'StorageFootprintAnalyzer.vue must enforce >= 44px touch targets on mobile')
	})
})
