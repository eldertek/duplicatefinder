const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window } = require('./helpers.cjs')

function loadPhotoRawModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/photoRawCatalogAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function loadPhotoRawWorkbench(clipboardImpl) {
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js')
	const photoRawCatalogAuditor = loadPhotoRawModule()
	return loadComponent('src/components/PhotoRawCatalogWorkbench.vue', {
		'../tools/clipboardHelper': clipboardImpl === undefined
			? clipboardHelper
			: { copyTextSafely: text => clipboardHelper.copyTextSafely(text, clipboardImpl) },
		'../tools/photoRawCatalogAuditor': photoRawCatalogAuditor,
	})
}

function buildSamplePhotoRawDuplicates() {
	const mib = 1024 * 1024
	const refSec = 1796000000
	return [
		{
			id: 9701,
			hash: 'sha256-photo-raw-vault',
			size: 48 * mib,
			acknowledged: false,
			files: [
				{
					id: 97011,
					path: '/__groupfolders/14/RAW-Masters/WED_2026_0512_0042.CR3',
					size: 48 * mib,
					mtime: refSec - 12 * 86400,
				},
				{
					id: 97012,
					path: '/Studio/Selects-Picked/WED_2026_0512_0042.CR3',
					size: 48 * mib,
					mtime: refSec - 12 * 86400,
				},
				{
					id: 97013,
					path: '/alice/files/Downloads/WED_2026_0512_0042.CR3',
					size: 48 * mib,
					mtime: refSec - 3 * 86400,
				},
			],
		},
		{
			id: 9702,
			hash: 'sha256-photo-raw-original',
			size: 62 * mib,
			acknowledged: false,
			files: [
				{
					id: 97021,
					path: '/Archive/2026/StudioShoot/PORTRAIT_0108.NEF',
					size: 62 * mib,
					mtime: refSec - 20 * 86400,
				},
				{
					id: 97022,
					path: '/Backup/2026/StudioShoot/PORTRAIT_0108.NEF',
					size: 62 * mib,
					mtime: refSec - 22 * 86400,
				},
			],
		},
		{
			id: 9703,
			hash: 'sha256-photo-sidecars',
			size: 1 * mib,
			acknowledged: false,
			files: [
				{
					id: 97031,
					path: '/RAW-Masters/WED_2026_0512_0042.xmp',
					size: 1 * mib,
					mtime: refSec - 10 * 86400,
				},
				{
					id: 97032,
					path: '/Studio/Edits/WED_2026_0512_0042.CR3.dop',
					size: 1 * mib,
					mtime: refSec - 11 * 86400,
				},
				{
					id: 97033,
					path: '/Downloads/WED_2026_0512_0042.pp3',
					size: 1 * mib,
					mtime: refSec - 6 * 86400,
				},
			],
		},
		{
			id: 9704,
			hash: 'sha256-photo-exports-verified',
			size: 12 * mib,
			acknowledged: false,
			files: [
				{
					id: 97041,
					path: '/Exports/WED_2026_0512_0042_web_2048px.jpg',
					size: 12 * mib,
					mtime: refSec - 5 * 86400,
				},
				{
					id: 97042,
					path: '/Downloads/WED_2026_0512_0042_instagram.jpg',
					size: 12 * mib,
					mtime: refSec - 8 * 86400,
				},
				{
					id: 97043,
					path: '/Social/PORTRAIT_0108.heic',
					size: 12 * mib,
					mtime: refSec - 7 * 86400,
				},
			],
		},
		{
			id: 9705,
			hash: 'sha256-photo-exports-orphan',
			size: 9 * mib,
			acknowledged: false,
			files: [
				{
					id: 97051,
					path: '/Exports/ORPHAN_LANDSCAPE_099_export.jpg',
					size: 9 * mib,
					mtime: refSec - 18 * 86400,
				},
				{
					id: 97052,
					path: '/Downloads/ORPHAN_LANDSCAPE_099_print.tif',
					size: 9 * mib,
					mtime: refSec - 16 * 86400,
				},
			],
		},
		{
			id: 9706,
			hash: 'sha256-photo-preview-pyramids',
			size: 35 * mib,
			acknowledged: false,
			files: [
				{
					id: 97061,
					path: '/Lightroom/Catalog Previews.lrdata/A/ABCD/ABCD-1234.lrprev',
					size: 35 * mib,
					mtime: refSec - 4 * 86400,
				},
				{
					id: 97062,
					path: '/Lightroom/Catalog Smart Previews.lrdata/B/BCDE/BCDE-5678.lrprev',
					size: 35 * mib,
					mtime: refSec - 45 * 86400,
				},
				{
					id: 97063,
					path: '/Lightroom/Catalog.lrcat-wal',
					size: 35 * mib,
					mtime: refSec - 60 * 86400,
				},
				{
					id: 97064,
					path: '/CaptureOne/Cache/Thumbnails/WED_2026_0512_0042.thumbnail.jpg',
					size: 35 * mib,
					mtime: refSec - 72 * 86400,
				},
			],
		},
		{
			id: 9707,
			hash: 'sha256-unrelated-assets',
			size: 2 * mib,
			acknowledged: false,
			files: [
				{ id: 97071, path: '/alice/files/Photos/alpine.jpg', size: 2 * mib, mtime: refSec - 3 * 86400 },
				{ id: 97072, path: '/Documents/StandardContract.pdf', size: 2 * mib, mtime: refSec - 4 * 86400 },
			],
		},
	]
}

describe('RAW Photography Catalog, Preview Pyramid, Sidecar & Export Derivative Auditor', () => {
	test('classifies all 4 photo and catalog families while ignoring unrelated files', () => {
		const mod = loadPhotoRawModule()

		for (const p of [
			'/RAW-Masters/SHOT_01.cr3',
			'/RAW-Masters/SHOT_01.cr2',
			'/Selects-Picked/SHOT_01.nef',
			'/Archive/SHOT_01.arw',
			'/Archive/SHOT_01.raf',
			'/Archive/SHOT_01.orf',
			'/Archive/SHOT_01.rw2',
			'/Archive/SHOT_01.dng',
			'/Archive/SHOT_01.pef',
			'/Archive/SHOT_01.srw',
		]) {
			assert.equal(mod.classifyPhotoRawArtifact(p).family, 'camera-raw-masters', `Expected camera-raw-masters for ${p}`)
		}

		for (const p of [
			'/Lightroom/Previews.lrdata/A/ABCD/ABCD-1.lrprev',
			'/Lightroom/Smart Previews.lrdata/B/BCDE/BCDE-1.lrprev',
			'/Lightroom/Catalog.lrcat-wal',
			'/CaptureOne/Settings150/IMG_001.cos',
			'/CaptureOne/Cache/IMG_001.cot',
			'/Catalog/IMG_001.thumbnail.jpg',
		]) {
			assert.equal(mod.classifyPhotoRawArtifact(p).family, 'catalog-preview-pyramids', `Expected catalog-preview-pyramids for ${p}`)
		}

		for (const p of [
			'/Exports/IMG_001_export.jpg',
			'/Photos/IMG_001_web_2048px.jpg',
			'/Photos/IMG_001_instagram.heic',
			'/Photos/IMG_001_print.tif',
		]) {
			assert.equal(mod.classifyPhotoRawArtifact(p).family, 'developed-jpeg-export-twins', `Expected developed-jpeg-export-twins for ${p}`)
		}

		for (const p of [
			'/RAW-Masters/IMG_001.xmp',
			'/RAW-Masters/IMG_001.CR3.dop',
			'/RAW-Masters/IMG_001.CR3.pp3',
			'/RAW-Masters/IMG_001.acr',
		]) {
			assert.equal(mod.classifyPhotoRawArtifact(p).family, 'sidecar-metadata-files', `Expected sidecar-metadata-files for ${p}`)
		}

		assert.equal(mod.classifyPhotoRawArtifact('/alice/files/Photos/alpine.jpg'), null)
		assert.equal(mod.classifyPhotoRawArtifact('/Documents/StandardContract.pdf'), null)

		const stemExport = mod.parsePhotoRawArtifactInfo(
			'WED_2026_0512_0042_web_2048px.jpg',
			'/Exports/WED_2026_0512_0042_web_2048px.jpg'
		)
		assert.equal(stemExport.shotLineageStem, 'WED_2026_0512_0042')
		assert.equal(stemExport.isDevelopedExportCandidate, true)

		const stemSidecar = mod.parsePhotoRawArtifactInfo(
			'WED_2026_0512_0042.CR3.dop',
			'/Studio/Edits/WED_2026_0512_0042.CR3.dop'
		)
		assert.equal(stemSidecar.shotLineageStem, 'WED_2026_0512_0042')
		assert.equal(stemSidecar.isSidecarCandidate, true)
	})

	test('protects RAW vaults, RAW originals, and sidecars, and blocks developed export deletion when no RAW master is conserved', () => {
		const mod = loadPhotoRawModule()
		const analysis = mod.analyzePhotoRawCatalogDuplicates(buildSamplePhotoRawDuplicates(), {
			strategy: 'consolidate-raw-selects',
			staleCacheDays: 30,
			referenceTimeSec: 1796000000,
		})

		assert.equal(analysis.schema, 'duplicatefinder.photo-raw-catalog-auditor.v1')
		assert.equal(analysis.summary.totalClustersCount, 6)
		assert.equal(analysis.summary.familyCounts['camera-raw-masters'], 2)
		assert.equal(analysis.summary.familyCounts['sidecar-metadata-files'], 1)
		assert.equal(analysis.summary.familyCounts['developed-jpeg-export-twins'], 2)
		assert.equal(analysis.summary.familyCounts['catalog-preview-pyramids'], 1)

		const rawVaultCluster = analysis.clusters.find(c => c.primaryGroupId === 9701)
		assert.ok(rawVaultCluster)
		assert.equal(rawVaultCluster.survivor.tier, 'raw-selects-vault')
		assert.equal(rawVaultCluster.members.find(m => m.fileId === 97012).verdict, 'blocked-raw-selects-vault')
		assert.equal(rawVaultCluster.members.find(m => m.fileId === 97013).verdict, 'consolidate-to-raw-vault')

		const rawOrigCluster = analysis.clusters.find(c => c.primaryGroupId === 9702)
		assert.ok(rawOrigCluster)
		assert.equal(rawOrigCluster.survivor.tier, 'camera-raw-original')
		assert.equal(rawOrigCluster.members.find(m => m.fileId === 97022).verdict, 'blocked-camera-raw-original')

		const sidecarCluster = analysis.clusters.find(c => c.primaryGroupId === 9703)
		assert.ok(sidecarCluster)
		assert.equal(sidecarCluster.survivor.tier, 'sidecar-edit-origin')
		assert.equal(sidecarCluster.members.find(m => m.fileId === 97032).verdict, 'blocked-sidecar-edit-origin')
		assert.equal(sidecarCluster.members.find(m => m.fileId === 97033).verdict, 'consolidate-to-raw-vault')

		const previewAnalysis = mod.analyzePhotoRawCatalogDuplicates(buildSamplePhotoRawDuplicates(), {
			strategy: 'prune-catalog-preview-pyramids',
			staleCacheDays: 30,
			referenceTimeSec: 1796000000,
		})
		const previewCluster = previewAnalysis.clusters.find(c => c.primaryGroupId === 9706)
		assert.ok(previewCluster)
		assert.equal(previewCluster.members.find(m => m.fileId === 97061).verdict, 'keep-canonical-survivor')
		assert.equal(previewCluster.members.find(m => m.fileId === 97062).verdict, 'reclaim-catalog-preview-pyramid')
		assert.equal(previewCluster.members.find(m => m.fileId === 97063).verdict, 'reclaim-catalog-preview-pyramid')
		assert.equal(previewCluster.members.find(m => m.fileId === 97064).verdict, 'reclaim-catalog-preview-pyramid')

		const exportAnalysis = mod.analyzePhotoRawCatalogDuplicates(buildSamplePhotoRawDuplicates(), {
			strategy: 'prune-web-exports-when-raw-verified',
			referenceTimeSec: 1796000000,
		})
		const verifiedExports = exportAnalysis.clusters.find(c => c.primaryGroupId === 9704)
		assert.equal(verifiedExports.members.find(m => m.fileId === 97042).verdict, 'reclaim-verified-web-export')
		assert.equal(verifiedExports.members.find(m => m.fileId === 97043).verdict, 'reclaim-verified-web-export')

		const orphanExports = exportAnalysis.clusters.find(c => c.primaryGroupId === 9705)
		assert.equal(orphanExports.members.find(m => m.fileId === 97052).verdict, 'blocked-unverified-raw-master')

		const excludedRawAnalysis = mod.analyzePhotoRawCatalogDuplicates(buildSamplePhotoRawDuplicates(), {
			strategy: 'prune-web-exports-when-raw-verified',
			referenceTimeSec: 1796000000,
			memberOverrides: {
				97011: 'exclude',
				97012: 'exclude',
				97013: 'exclude',
			},
		})
		const nowUnverifiedExport = excludedRawAnalysis.clusters.find(c => c.primaryGroupId === 9704)
		assert.equal(nowUnverifiedExport.members.find(m => m.fileId === 97042).verdict, 'blocked-unverified-raw-master')
		assert.equal(nowUnverifiedExport.members.find(m => m.fileId === 97043).verdict, 'reclaim-verified-web-export')
	})

	test('supports overrides, DRY_RUN=1 POSIX script, .sync-exclude.lst, CWE-1236 CSV, and JSON manifest', () => {
		const mod = loadPhotoRawModule()
		const duplicates = [
			...buildSamplePhotoRawDuplicates(),
			{
				id: 9799,
				hash: 'sha256-formula-raw',
				size: 4096000,
				acknowledged: false,
				files: [
					{ id: 97991, path: '/RAW-Masters/=CMD("calc")_Shoot.cr3', size: 4096000, mtime: 1795000000 },
					{ id: 97992, path: '/Downloads/stray_Shoot.cr3', size: 4096000, mtime: 1790000000 },
				],
			},
			{
				id: 9798,
				hash: 'sha256-formula-plus-sidecar',
				size: 512000,
				acknowledged: false,
				files: [
					{ id: 97981, path: '/Selects-Picked/+malicious_Edit.xmp', size: 512000, mtime: 1795000000 },
					{ id: 97982, path: '/Downloads/stray_Edit.xmp', size: 512000, mtime: 1790000000 },
				],
			},
		]

		const consolidateAnalysis = mod.analyzePhotoRawCatalogDuplicates(duplicates, {
			strategy: 'consolidate-raw-selects',
			referenceTimeSec: 1796000000,
		})
		const rawCluster = consolidateAnalysis.clusters.find(c => c.primaryGroupId === 9701)
		assert.equal(rawCluster.members.find(m => m.fileId === 97013).verdict, 'consolidate-to-raw-vault')
		assert.equal(rawCluster.members.find(m => m.fileId === 97013).actionKind, 'consolidate')

		const script = mod.buildPhotoRawCatalogScript(consolidateAnalysis, { dataRoot: '/srv/nc/data' })
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes('sha256sum --'))
		assert.ok(script.includes('stat -c %d'))
		assert.ok(script.includes('consolidate_raw_catalog_copy'))
		assert.ok(script.includes('occ files:scan --path='))

		const overrideAnalysis = mod.analyzePhotoRawCatalogDuplicates(buildSamplePhotoRawDuplicates(), {
			strategy: 'prune-catalog-preview-pyramids',
			staleCacheDays: 30,
			memberOverrides: {
				97062: 'force-keep',
				97063: 'exclude',
			},
			referenceTimeSec: 1796000000,
		})
		const previewOverridden = overrideAnalysis.clusters.find(c => c.primaryGroupId === 9706)
		assert.equal(previewOverridden.members.find(m => m.fileId === 97062).verdict, 'blocked-manual-shield')
		assert.equal(previewOverridden.members.find(m => m.fileId === 97063).verdict, 'excluded')

		const syncExclude = mod.buildPhotoRawCatalogSyncExcludeSnippet(consolidateAnalysis)
		for (const pattern of ['*.lrdata/', '*.lrcat-wal', '*.tmp', 'Thumbs.db']) {
			assert.ok(syncExclude.includes(pattern), `Expected .sync-exclude.lst pattern ${pattern}`)
		}

		const csv = mod.buildPhotoRawCatalogCsvReport(consolidateAnalysis)
		assert.ok(csv.includes('"\'=CMD(""calc"")_Shoot.cr3"') || csv.includes("'=CMD"))
		assert.ok(csv.includes("'+malicious_Edit.xmp"))

		const json = JSON.parse(mod.buildPhotoRawCatalogJsonReport(consolidateAnalysis, '2026-11-24T07:15:00Z'))
		assert.equal(json.schema, 'duplicatefinder.photo-raw-catalog-auditor.v1')
		assert.equal(json.generatedAt, '2026-11-24T07:15:00Z')
		assert.ok(Array.isArray(json.clusters))
	})

	test('renders PhotoRawCatalogWorkbench empty, filter-empty, populated, and interactive states without clamping numeric inputs', async () => {
		let copied = ''
		const Workbench = loadPhotoRawWorkbench({
			writeText: async text => {
				copied = text
			},
		})

		const emptyVm = new Vue({
			render: h => h(Workbench, {
				props: { duplicates: [], allDuplicates: [] },
			}),
		}).$mount()
		await settle()
		assert.ok(emptyVm.$el.querySelector('.prw__empty-banner'))
		emptyVm.$destroy()

		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: buildSamplePhotoRawDuplicates(),
					allDuplicates: buildSamplePhotoRawDuplicates(),
					currentDuplicateId: 9701,
				},
			}),
		}).$mount()
		await settle()

		assert.equal(vm.$el.querySelectorAll('.prw__cluster-item').length, 6)
		assert.ok(vm.$el.textContent.includes('WED_2026_0512_0042.CR3'))

		const numInputs = vm.$el.querySelectorAll('.prw__num-input')
		assert.equal(numInputs.length, 3)
		for (const input of numInputs) {
			input.value = ''
			input.dispatchEvent(new window.Event('input'))
			await settle()
			assert.equal(input.value, '', 'Numeric input must not clamp or reset mid-keystroke')
		}

		const copyBtn = Array.from(vm.$el.querySelectorAll('button')).find(b => b.textContent.includes('Copy DRY_RUN=1 Script'))
		copyBtn.click()
		await settle()
		assert.ok(copied.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(vm.$el.querySelector('.prw__notice.is-success'))

		const searchInput = vm.$el.querySelector('input[type="search"]')
		searchInput.value = 'no-such-photo-catalog-xyz'
		searchInput.dispatchEvent(new window.Event('input'))
		await settle()
		assert.ok(vm.$el.querySelector('.prw__empty-banner'))

		const resetBtn = Array.from(vm.$el.querySelectorAll('button')).find(b => b.textContent.includes('Reset Filters'))
		resetBtn.click()
		await settle()
		assert.equal(vm.$el.querySelectorAll('.prw__cluster-item').length, 6)

		vm.$destroy()
	})

	test('integrates RAW & Previews button and Shift+P keyboard shortcut in App.vue', async () => {
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
		const PhotoRawWorkbench = loadPhotoRawWorkbench({ writeText: async () => {} })

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
			'@nextcloud/dialogs': { showError: () => {}, showSuccess: () => {} },
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
			'./components/StorageFootprintAnalyzer.vue': { __esModule: true, default: stub('storage-footprint') },
			'./components/PhotoBurstTimeline.vue': { __esModule: true, default: stub('photo-burst') },
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
			'./components/PhotoRawCatalogWorkbench.vue': { __esModule: true, default: PhotoRawWorkbench },
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
			'./components/OriginFoldersSettings.vue': { __esModule: true, default: stub('origin') },
			'./components/ExcludedFoldersSettings.vue': { __esModule: true, default: stub('excluded') },
			'./components/BulkDeletionSettings.vue': { __esModule: true, default: stub('bulk') },
			'./components/ProjectsSettings.vue': { __esModule: true, default: stub('projects') },
			'./components/ProjectDuplicates.vue': { __esModule: true, default: stub('project-duplicates') },
			'./components/help/OnboardingGuide.vue': { __esModule: true, default: stub('onboarding') },
			'./components/help/UsageExamples.vue': { __esModule: true, default: stub('usage') },
			'./components/help/FAQ.vue': { __esModule: true, default: stub('faq') },
			'./components/FilterSettings.vue': { __esModule: true, default: stub('filters') },
			'@/tools/api': {
				fetchDuplicates: async status => ({
					entities: status === 'acknowledged' ? [] : buildSamplePhotoRawDuplicates(),
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

		const topbarBtn = vm.$el.querySelector('.topbar-photo-raw-catalog-button')
		assert.ok(topbarBtn, 'Topbar RAW & Previews button must exist')

		const action = keyboardShortcuts.resolveShortcutAction({ key: 'P', shiftKey: true, target: vm.$el })
		assert.equal(action, 'toggle-photo-raw-catalog-auditor')
		assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'p', shiftKey: false, target: vm.$el }), 'toggle-photo-bursts')

		topbarBtn.click()
		await settle()
		assert.ok(vm.$el.querySelector('.photo-raw-catalog-workbench'), 'PhotoRawCatalogWorkbench must mount on click')

		window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'P', shiftKey: true, bubbles: true }))
		await settle()
		assert.equal(vm.$el.querySelector('.photo-raw-catalog-workbench'), null, 'PhotoRawCatalogWorkbench must toggle closed on Shift+P shortcut')

		vm.$destroy()
	})

	test('keeps zero U+2013/U+2014 typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/photoRawCatalogAuditor.js',
			'src/components/PhotoRawCatalogWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
		]
		for (const relPath of files) {
			const content = readFileSync(resolve(__dirname, '../..', relPath), 'utf8')
			assert.equal(content.includes('\u2013'), false, `Unexpected U+2013 in ${relPath}`)
			assert.equal(content.includes('\u2014'), false, `Unexpected U+2014 in ${relPath}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `Unexpected XSS sink in ${relPath}`)
		}
		const vueContent = readFileSync(resolve(__dirname, '../..', 'src/components/PhotoRawCatalogWorkbench.vue'), 'utf8')
		assert.ok(vueContent.includes('min-block-size: 44px'))
		assert.ok(vueContent.includes(':focus-visible'))
	})
})
