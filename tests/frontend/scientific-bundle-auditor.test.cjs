const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window } = require('./helpers.cjs')

function loadScientificBundleModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/scientificBundleAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function loadScientificBundleWorkbench(clipboardImpl) {
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js')
	const scientificBundleAuditor = loadScientificBundleModule()
	return loadComponent('src/components/ScientificBundleWorkbench.vue', {
		'../tools/clipboardHelper': clipboardImpl === undefined
			? clipboardHelper
			: { copyTextSafely: text => clipboardHelper.copyTextSafely(text, clipboardImpl) },
		'../tools/duplicateStats': duplicateStats,
		'../tools/scientificBundleAuditor': scientificBundleAuditor,
	})
}

function buildSampleScientificDuplicates() {
	const mib = 1024 * 1024
	const baseSec = 1796000000
	return [
		{
			id: 2101,
			hash: 'sha256-parcels-shp',
			size: 25 * mib,
			acknowledged: false,
			files: [
				{
					id: 21011,
					path: '/gis/exports/partial-copy/parcels.shp',
					size: 25 * mib,
					mtime: baseSec - 86400,
				},
				{
					id: 21012,
					path: '/gis/prod/cadastre/parcels.shp',
					size: 25 * mib,
					mtime: baseSec,
				},
				{
					id: 21013,
					path: '/gis/staging/old \'2025\'/parcels.shp',
					size: 25 * mib,
					mtime: baseSec - 3600,
				},
			],
		},
		{
			id: 2102,
			hash: 'sha256-parcels-dbf',
			size: 12 * mib,
			acknowledged: false,
			files: [
				{
					id: 21021,
					path: '/gis/prod/cadastre/parcels.dbf',
					size: 12 * mib,
					mtime: baseSec,
				},
				{
					id: 21022,
					path: '/gis/staging/old \'2025\'/parcels.dbf',
					size: 12 * mib,
					mtime: baseSec - 3600,
				},
			],
		},
		{
			id: 2103,
			hash: 'sha256-parcels-shx',
			size: 2 * mib,
			acknowledged: false,
			files: [
				{
					id: 21031,
					path: '/gis/prod/cadastre/parcels.shx',
					size: 2 * mib,
					mtime: baseSec,
				},
				{
					id: 21032,
					path: '/gis/staging/old \'2025\'/parcels.shx',
					size: 2 * mib,
					mtime: baseSec - 3600,
				},
			],
		},
		{
			id: 2104,
			hash: 'sha256-bids-nifti',
			size: 120 * mib,
			acknowledged: false,
			files: [
				{
					id: 21041,
					path: '/clinical/neuro/bids/sub-01_dwi.nii.gz',
					size: 120 * mib,
					mtime: baseSec - 7200,
				},
				{
					id: 21042,
					path: '/exports/neuro-share/sub-01_dwi.nii.gz',
					size: 120 * mib,
					mtime: baseSec,
				},
			],
		},
		{
			id: 2105,
			hash: 'sha256-cad-gltf',
			size: 40 * mib,
			acknowledged: false,
			files: [
				{
					id: 21051,
					path: '/cad/production/turbine/rotor.gltf',
					size: 40 * mib,
					mtime: baseSec - 1000,
				},
				{
					id: 21052,
					path: '/cad/backups/rotor.gltf',
					size: 40 * mib,
					mtime: baseSec,
				},
			],
		},
		{
			id: 2106,
			hash: 'sha256-ml-shard-01',
			size: 512 * mib,
			acknowledged: false,
			files: [
				{
					id: 21061,
					path: '/ai/serving/llama3/model-00001-of-00004.safetensors',
					size: 512 * mib,
					mtime: baseSec - 10000,
				},
				{
					id: 21062,
					path: '/ai/scratch/llama3/model-00001-of-00004.safetensors',
					size: 512 * mib,
					mtime: baseSec,
				},
			],
		},
	]
}

function buildSampleInventory() {
	const mib = 1024 * 1024
	return [
		{ path: '/gis/exports/partial-copy/parcels.shx', size: 2 * mib },
		{ path: '/gis/prod/cadastre/parcels.prj', size: 1024 },
		{ path: '/gis/staging/old \'2025\'/parcels.prj', size: 1024 },
		{ path: '/clinical/neuro/bids/sub-01_dwi.bval', size: 2048 },
		{ path: '/clinical/neuro/bids/sub-01_dwi.bvec', size: 4096 },
		{ path: '/cad/production/turbine/rotor.bin', size: 18 * mib },
		{ path: '/cad/backups/rotor.bin', size: 18 * mib },
		{ path: '/ai/serving/llama3/config.json', size: 4096 },
		{ path: '/ai/serving/llama3/tokenizer.json', size: 2 * mib },
		{ path: '/ai/serving/llama3/model.safetensors.index.json', size: 65536 },
	]
}

describe('ScientificBundleAuditor & ScientificBundleWorkbench', () => {
	test('extracts compound extensions, normalizes ML shards, and protects incomplete/clinical/assembly bundles', () => {
		const mod = loadScientificBundleModule()

		assert.equal(mod.extractScientificExtension('/neuro/sub-01.nii.gz'), 'nii.gz')
		assert.equal(mod.extractScientificExtension('/micro/slide_01.ome.tiff'), 'ome.tiff')
		assert.equal(mod.extractScientificExtension('/ai/model.safetensors.index.json'), 'safetensors.index.json')
		assert.equal(mod.extractScientificExtension('/dicom/DICOMDIR'), 'dicomdir')

		const shardDesc = mod.parseBundleDescriptor('/ai/llama/model-00001-of-00004.safetensors')
		assert.equal(shardDesc.isShard, true)
		assert.equal(shardDesc.bundleStem, 'model')

		const sample = buildSampleScientificDuplicates()
		const inventory = buildSampleInventory()
		const analysis = mod.analyzeScientificBundles(sample, {
			companionInventory: inventory,
			strategy: 'atomic-purge',
			survivorRule: 'complete-bundle-first',
			protectClinicalPaths: true,
			protectAssemblyRefs: true,
		})

		assert.equal(analysis.schema, mod.SCIENTIFIC_BUNDLE_SCHEMA)
		assert.equal(analysis.bundles.length, 6)
		assert.ok(analysis.summary.atomicReclaimableBytes > 0)
		assert.ok(analysis.summary.orphanCollateralBytes > 0)
		assert.equal(analysis.summary.incompleteBundlesCount >= 1, true)

		const shpBundle = analysis.bundles.find(b => b.primaryGroupId === 2101)
		assert.ok(shpBundle)
		assert.equal(shpBundle.domain, 'gis-geospatial')
		assert.equal(shpBundle.survivor.normalizedPath, '/gis/prod/cadastre/parcels.shp')
		assert.equal(shpBundle.survivor.context.completenessStatus, 'complete')

		const partialMember = shpBundle.members.find(m => m.normalizedPath === '/gis/exports/partial-copy/parcels.shp')
		assert.ok(partialMember)
		assert.equal(partialMember.context.completenessStatus, 'incomplete')
		assert.deepEqual(partialMember.context.missingMandatory, ['dbf'])

		const clinicalBundle = analysis.bundles.find(b => b.primaryGroupId === 2104)
		assert.ok(clinicalBundle)
		assert.equal(clinicalBundle.domain, 'medical-bio')
		assert.equal(clinicalBundle.survivor.normalizedPath, '/clinical/neuro/bids/sub-01_dwi.nii.gz')

		// When survivorRule puts clinical path as candidate, clinical shield still blocks deletion
		const clinicalCandidateCheck = mod.analyzeScientificBundles(sample, {
			companionInventory: inventory,
			survivorRule: 'newest-mtime',
			protectClinicalPaths: true,
		})
		const clinicalAsCandidate = clinicalCandidateCheck.bundles
			.find(b => b.primaryGroupId === 2104)
			.members.find(m => m.normalizedPath === '/clinical/neuro/bids/sub-01_dwi.nii.gz')
		assert.equal(clinicalAsCandidate.verdict, 'blocked-clinical-shield')

		// CAD glTF bundle with rotor.bin companion
		const gltfBundle = analysis.bundles.find(b => b.primaryGroupId === 2105)
		assert.ok(gltfBundle)
		assert.equal(gltfBundle.domain, 'cad-bim-3d')
		assert.equal(gltfBundle.survivor.normalizedPath, '/cad/production/turbine/rotor.gltf')
		assert.equal(gltfBundle.survivor.context.completenessStatus, 'complete')

		// ML shard bundle sees directory-level config.json & model.safetensors.index.json
		const mlBundle = analysis.bundles.find(b => b.primaryGroupId === 2106)
		assert.ok(mlBundle)
		assert.equal(mlBundle.domain, 'ml-checkpoints')
		assert.ok(mlBundle.survivor.context.companionFiles.some(c => c.fileName === 'config.json'))
	})

	test('generates POSIX single-quoted DRY_RUN=1 scripts, hardlink mode, CWE-1236 CSV, and JSON manifest', () => {
		const mod = loadScientificBundleModule()
		const sample = buildSampleScientificDuplicates()
		const inventory = buildSampleInventory()

		const analysis = mod.analyzeScientificBundles(sample, {
			companionInventory: inventory,
			strategy: 'atomic-purge',
		})
		const script = mod.buildScientificBundleScript(analysis, { dataRoot: '/srv/nc data' })
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes("DATA_ROOT='/srv/nc data'"))
		assert.ok(script.includes("old '\\''2025'\\''/parcels.shp"))
		assert.ok(script.includes('atomic_reclaim_file'))
		assert.ok(script.includes('occ files:scan --path='))

		const hardlinkAnalysis = mod.analyzeScientificBundles(sample, {
			companionInventory: inventory,
			strategy: 'hardlink-preserve',
		})
		const hardlinkScript = mod.buildScientificBundleScript(hardlinkAnalysis)
		assert.ok(hardlinkScript.includes('ln -f --'))

		const formulaAnalysis = mod.analyzeScientificBundles([
			{
				id: 9901,
				hash: 'sha256-formula',
				size: 1024 * 1024,
				files: [
					{ id: 1, path: '=HYPERLINK("http://evil")/parcels.shp', size: 1024 * 1024, mtime: 1000 },
					{ id: 2, path: '+SUM(A1:A2)/parcels.shp', size: 1024 * 1024, mtime: 2000 },
				],
			},
		])
		const csv = mod.buildScientificBundleCsvReport(formulaAnalysis)
		assert.ok(csv.includes("'=HYPERLINK"))
		assert.ok(csv.includes("'+SUM"))

		const json = JSON.parse(mod.buildScientificBundleJsonReport(analysis))
		assert.equal(json.schema, mod.SCIENTIFIC_BUNDLE_SCHEMA)
		assert.equal(json.bundles.length, 6)
	})

	test('ScientificBundleWorkbench.vue renders empty, populated, unclamped numeric input, preset filter, and overrides', async () => {
		let copiedText = ''
		const Workbench = loadScientificBundleWorkbench({
			writeText: async text => {
				copiedText = text
			},
		})

		const emptyVm = new Vue({
			render: h => h(Workbench, {
				props: { duplicates: [], allDuplicates: [] },
			}),
		}).$mount()
		await settle()
		assert.ok(emptyVm.$el.querySelector('.sbw__empty-banner'))
		emptyVm.$destroy()

		const sample = buildSampleScientificDuplicates()
		const vm = new Vue({
			render: h => h(Workbench, {
				props: { duplicates: sample, allDuplicates: sample, currentDuplicateId: 2101 },
			}),
		}).$mount()
		await settle()

		assert.equal(vm.$el.querySelectorAll('.sbw__bundle-item').length, 6)

		// Unclamped numeric input mid-keystroke
		const numInput = vm.$el.querySelector('.sbw__num-input')
		numInput.value = ''
		numInput.dispatchEvent(new window.Event('input'))
		await settle()
		assert.equal(numInput.value, '')

		numInput.value = '999999'
		numInput.dispatchEvent(new window.Event('input'))
		await settle()
		assert.equal(numInput.value, '999999')
		assert.ok(vm.$el.querySelector('.sbw__empty-banner'))

		numInput.value = '0'
		numInput.dispatchEvent(new window.Event('input'))
		await settle()
		assert.equal(vm.$el.querySelectorAll('.sbw__bundle-item').length, 6)

		// Copy DRY_RUN=1 script
		const copyBtn = Array.from(vm.$el.querySelectorAll('.sbw__tool-btn'))
			.find(btn => btn.textContent.includes('Copy DRY_RUN=1 Script'))
		assert.ok(copyBtn)
		copyBtn.click()
		await settle()
		assert.ok(copiedText.includes('DRY_RUN="${DRY_RUN:-1}"'))

		// Override to Shield Bundle
		const shieldBtn = Array.from(vm.$el.querySelectorAll('.sbw__override-bar .sbw__seg-btn'))
			.find(btn => btn.textContent.includes('Shield Bundle'))
		assert.ok(shieldBtn)
		shieldBtn.click()
		await settle()
		assert.ok(vm.$el.textContent.includes('Admin Shielded'))

		vm.$destroy()
	})

	test('App.vue wires + shortcut and ScientificBundleWorkbench cleanly', async () => {
		window.localStorage.clear()
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		const duplicateFilters = loadModule('src/tools/duplicateFilters.js')
		const duplicateStats = loadModule('src/tools/duplicateStats.js')
		const reclamationHistory = loadModule('src/tools/reclamationHistory.js', {
			'./duplicateFilters': duplicateFilters,
			'./duplicateStats': duplicateStats,
		})
		const BundleWorkbench = loadScientificBundleWorkbench()
		const slotBox = tag => ({
			render(h) {
				return h(tag, { on: this.$listeners }, this.$slots.default)
			},
		})
		const stub = name => ({
			name,
			props: ['duplicate', 'projectId', 'show', 'duplicates', 'allDuplicates', 'currentDuplicateId'],
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
			'./components/LinkDeduplicationSimulator.vue': { __esModule: true, default: stub('link-sim') },
			'./components/FolderPairMatrix.vue': { __esModule: true, default: stub('folder-matrix') },
			'./components/StorageFootprintAnalyzer.vue': { __esModule: true, default: stub('footprint') },
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
			'./components/ScientificBundleWorkbench.vue': { __esModule: true, default: BundleWorkbench },
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
			'./components/OriginFoldersSettings.vue': { __esModule: true, default: stub('origin') },
			'./components/ExcludedFoldersSettings.vue': { __esModule: true, default: stub('excluded') },
			'./components/BulkDeletionSettings.vue': { __esModule: true, default: stub('bulk') },
			'./components/ProjectsSettings.vue': { __esModule: true, default: stub('projects') },
			'./components/ProjectDuplicates.vue': { __esModule: true, default: stub('project-duplicates') },
			'./components/help/OnboardingGuide.vue': { __esModule: true, default: stub('onboarding') },
			'./components/help/UsageExamples.vue': { __esModule: true, default: stub('usage') },
			'./components/help/FAQ.vue': { __esModule: true, default: stub('faq') },
			'./components/FilterSettings.vue': { __esModule: true, default: stub('filter-settings') },
			'@/tools/api': {
				fetchDuplicates: async status => ({
					entities: status === 'acknowledged' ? [] : buildSampleScientificDuplicates(),
					pagination: { currentPage: 1, totalPages: 1 },
				}),
				fetchProjects: async () => [],
				fetchScanStatus: async () => ({ isRunning: false, scannedFiles: 0, totalFiles: 0, percentage: 0 }),
				startUserScan: async () => ({}),
				notifyScanStarted: () => {},
				notifyScanCompleted: () => {},
				notifyScanFailed: () => {},
				fetchEmptyFolders: async () => [],
				deleteEmptyFolders: async () => ({ deleted: [] }),
			},
			'@/tools/utils': utils,
			'@/tools/keyboardShortcuts': keyboardShortcuts,
			'@/tools/reclamationHistory': reclamationHistory,
			'vue-material-design-icons/Folder': stub('icon-folder'),
			'vue-material-design-icons/FolderRemove': stub('icon-folder-remove'),
			'vue-material-design-icons/FolderMultiple': stub('icon-folder-multiple'),
			'vue-material-design-icons/Delete': stub('icon-delete'),
			'vue-material-design-icons/FilterOutline': stub('icon-filter-outline'),
		})

		const vm = new Vue({ render: h => h(App) }).$mount()
		await settle()

		const topbarBtn = vm.$el.querySelector('.topbar-scientific-bundle-button')
		assert.ok(topbarBtn, 'Topbar Bundles button must exist')

		const action = keyboardShortcuts.resolveShortcutAction({ key: '+', shiftKey: true, target: vm.$el })
		assert.equal(action, 'toggle-scientific-bundle-auditor')

		topbarBtn.click()
		await settle()
		assert.ok(vm.$el.querySelector('.scientific-bundle-workbench'), 'ScientificBundleWorkbench must mount on click')

		window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '+', shiftKey: true, bubbles: true }))
		await settle()
		assert.equal(vm.$el.querySelector('.scientific-bundle-workbench'), null, 'ScientificBundleWorkbench must toggle closed on + shortcut')

		vm.$destroy()
	})

	test('keeps zero U+2013/U+2014 typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/scientificBundleAuditor.js',
			'src/components/ScientificBundleWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
		]
		for (const relPath of files) {
			const content = readFileSync(resolve(__dirname, '../..', relPath), 'utf8')
			assert.equal(content.includes('\u2013'), false, `Unexpected U+2013 in ${relPath}`)
			assert.equal(content.includes('\u2014'), false, `Unexpected U+2014 in ${relPath}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `Unexpected XSS sink in ${relPath}`)
		}
		const vueContent = readFileSync(resolve(__dirname, '../..', 'src/components/ScientificBundleWorkbench.vue'), 'utf8')
		assert.ok(vueContent.includes('min-block-size: 44px'))
		assert.ok(vueContent.includes(':focus-visible'))
	})
})
