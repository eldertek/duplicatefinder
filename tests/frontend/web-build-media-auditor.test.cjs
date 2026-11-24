const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window } = require('./helpers.cjs')

function loadWebBuildMediaModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/webBuildMediaAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function loadWebBuildMediaWorkbench(clipboardImpl) {
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js')
	const webBuildMediaAuditor = loadWebBuildMediaModule()
	return loadComponent('src/components/WebBuildMediaWorkbench.vue', {
		'../tools/clipboardHelper': clipboardImpl === undefined
			? clipboardHelper
			: { copyTextSafely: text => clipboardHelper.copyTextSafely(text, clipboardImpl) },
		'../tools/webBuildMediaAuditor': webBuildMediaAuditor,
	})
}

function buildSampleWebBuildDuplicates() {
	const kib = 1024
	const mib = 1024 * 1024
	const refSec = 1796000000
	return [
		{
			id: 9101,
			hash: 'sha256-hero-banner-pyramid',
			size: 4 * mib,
			acknowledged: false,
			files: [
				{
					id: 91011,
					path: '/__groupfolders/21/DAM-Originals/Campaigns/hero-banner.png',
					size: 4 * mib,
					mtime: refSec - 20 * 86400,
				},
				{
					id: 91012,
					path: '/__groupfolders/22/CDN-Release/assets/hero-banner@2x.png',
					size: 4 * mib,
					mtime: refSec - 5 * 86400,
				},
				{
					id: 91013,
					path: '/alice/files/image-cache/hero-banner-1280w.webp',
					size: 4 * mib,
					mtime: refSec - 25 * 86400,
				},
			],
		},
		{
			id: 9102,
			hash: 'sha256-hls-seg-001',
			size: 16 * mib,
			acknowledged: false,
			files: [
				{
					id: 91021,
					path: '/__groupfolders/22/CDN-Release/vod/hls/seg_001.ts',
					size: 16 * mib,
					mtime: refSec - 3 * 86400,
				},
				{
					id: 91022,
					path: '/alice/files/transcode-cache/vod/hls/seg_001.ts',
					size: 16 * mib,
					mtime: refSec - 18 * 86400,
				},
				{
					id: 91023,
					path: '/bob/files/Downloads/keynote_720p.mp4',
					size: 16 * mib,
					mtime: refSec - 22 * 86400,
				},
			],
		},
		{
			id: 9103,
			hash: 'sha256-next-static-chunk',
			size: 2 * mib,
			acknowledged: false,
			files: [
				{
					id: 91031,
					path: '/__groupfolders/22/CDN-Release/_next/static/chunks/main.a1b2c3d4.js',
					size: 2 * mib,
					mtime: refSec - 2 * 86400,
				},
				{
					id: 91032,
					path: '/web/staging/.next/static/chunks/main.a1b2c3d4.js',
					size: 2 * mib,
					mtime: refSec - 19 * 86400,
				},
				{
					id: 91033,
					path: '/web/dist/assets/chunk-9f8e7d6c.css',
					size: 2 * mib,
					mtime: refSec - 25 * 86400,
				},
			],
		},
		{
			id: 9104,
			hash: 'sha256-exposed-sourcemap',
			size: 8 * mib,
			acknowledged: false,
			files: [
				{
					id: 91041,
					path: '/web/dist/assets/app.84f1a2b3.js.map',
					size: 8 * mib,
					mtime: refSec - 16 * 86400,
				},
				{
					id: 91042,
					path: '/web/staging/.nuxt/app.84f1a2b3.js.map',
					size: 8 * mib,
					mtime: refSec - 28 * 86400,
				},
			],
		},
		{
			id: 9105,
			hash: 'sha256-unrelated-typescript-and-photo',
			size: 512 * kib,
			acknowledged: false,
			files: [
				{ id: 91051, path: '/alice/files/Photos/workshop.jpg', size: 512 * kib, mtime: refSec - 5 * 86400 },
				{ id: 91052, path: '/src/utils/formatDate.ts', size: 512 * kib, mtime: refSec - 9 * 86400 },
			],
		},
	]
}

describe('Web Build Output, Responsive Image Pyramid, HLS/DASH Chunks & Source-Map Bloat Auditor', () => {
	test('classifies all 4 web build and media families while ignoring plain photos and TypeScript .ts files', () => {
		const mod = loadWebBuildMediaModule()

		for (const p of [
			'/assets/hero@2x.png',
			'/assets/hero@3x.jpg',
			'/assets/banner-1280w.jpg',
			'/assets/card_thumb.png',
			'/assets/gallery_640x480.png',
			'/cdn/hero.webp',
			'/cdn/hero.avif',
			'/cdn/hero.jxl',
			'/dam-originals/master.tif',
		]) {
			assert.equal(mod.classifyWebBuildMediaArtifact(p).family, 'responsive-media-pyramids', `Expected responsive-media-pyramids for ${p}`)
		}

		for (const p of [
			'/media/hls/seg_001.ts',
			'/media/dash/chunk-stream0-00001.m4s',
			'/media/hls/master.m3u8',
			'/media/dash/manifest.mpd',
			'/media/ladders/demo_480p.mp4',
			'/media/ladders/demo_720p.mp4',
		]) {
			assert.equal(mod.classifyWebBuildMediaArtifact(p).family, 'streaming-chunk-trees', `Expected streaming-chunk-trees for ${p}`)
		}

		for (const p of [
			'/web/.next/static/chunks/app.js',
			'/web/.nuxt/entry.mjs',
			'/web/dist/assets/vendor.css',
			'/cdn/main.a1b2c3d4.js',
			'/cdn/chunk-9f8e7d6c.css',
		]) {
			assert.equal(mod.classifyWebBuildMediaArtifact(p).family, 'frontend-build-caches', `Expected frontend-build-caches for ${p}`)
		}

		for (const p of [
			'/web/dist/app.js.map',
			'/web/dist/styles.css.map',
			'/web/dist/index.d.ts.map',
			'/web/dist/core.wasm.map',
			'/web/tsconfig.tsbuildinfo',
			'/web/dist/stats.json',
		]) {
			assert.equal(mod.classifyWebBuildMediaArtifact(p).family, 'debug-sourcemaps-symbols', `Expected debug-sourcemaps-symbols for ${p}`)
		}

		assert.equal(mod.classifyWebBuildMediaArtifact('/alice/files/Photos/workshop.jpg'), null)
		assert.equal(mod.classifyWebBuildMediaArtifact('/src/utils/formatDate.ts'), null)

		const parsedPyramid = mod.parseWebBuildArtifactInfo('hero-banner@2x.webp', '/cdn/hero-banner@2x.webp')
		assert.equal(parsedPyramid.assetLineageStem, 'hero-banner')
		assert.ok(parsedPyramid.artifactTags.includes('@2x'))
		assert.ok(parsedPyramid.artifactTags.includes('webp'))
		assert.equal(parsedPyramid.isResponsiveDerivative, true)

		const parsedChunk = mod.parseWebBuildArtifactInfo('main.a1b2c3d4.js', '/web/.next/static/chunks/main.a1b2c3d4.js')
		assert.equal(parsedChunk.assetLineageStem, 'main')
		assert.ok(parsedChunk.artifactTags.includes('hash:a1b2c3d4'))
		assert.ok(parsedChunk.artifactTags.includes('.next/static'))
		assert.equal(parsedChunk.isBuildCacheArtifact, true)
	})

	test('shields DAM Source Masters and Active CDN Releases while flagging exposed .map leaks and transcode caches', () => {
		const mod = loadWebBuildMediaModule()
		const analysis = mod.analyzeWebBuildMediaDuplicates(buildSampleWebBuildDuplicates(), {
			referenceTimeSec: 1796000000,
			staleBuildDays: 14,
		})

		assert.equal(analysis.schema, 'duplicatefinder.web-build-media-auditor.v1')
		assert.equal(analysis.summary.totalClustersCount, 4)
		assert.equal(analysis.summary.familyCounts['responsive-media-pyramids'], 1)
		assert.equal(analysis.summary.familyCounts['streaming-chunk-trees'], 1)
		assert.equal(analysis.summary.familyCounts['frontend-build-caches'], 1)
		assert.equal(analysis.summary.familyCounts['debug-sourcemaps-symbols'], 1)

		const pyramidCluster = analysis.clusters.find(c => c.primaryGroupId === 9101)
		assert.ok(pyramidCluster)
		assert.equal(pyramidCluster.survivor.tier, 'dam-source-master')
		assert.equal(pyramidCluster.members.find(m => m.fileId === 91012).verdict, 'blocked-active-cdn')
		assert.equal(pyramidCluster.members.find(m => m.fileId === 91013).verdict, 'reclaim-build-cache')

		const hlsCluster = analysis.clusters.find(c => c.primaryGroupId === 9102)
		assert.ok(hlsCluster)
		assert.equal(hlsCluster.survivor.fileId, 91021)
		assert.equal(hlsCluster.members.find(m => m.fileId === 91022).verdict, 'reclaim-build-cache')

		const nextCluster = analysis.clusters.find(c => c.primaryGroupId === 9103)
		assert.ok(nextCluster)
		assert.equal(nextCluster.survivor.tier, 'active-cdn-release')
		assert.equal(nextCluster.members.find(m => m.fileId === 91032).verdict, 'reclaim-build-cache')

		const mapCluster = analysis.clusters.find(c => c.primaryGroupId === 9104)
		assert.ok(mapCluster)
		assert.equal(mapCluster.clusterRiskState, 'map-leak')
		assert.equal(mapCluster.members.find(m => m.fileId === 91042).verdict, 'reclaim-map-leak')
	})

	test('supports all 3 strategies, operator overrides, DRY_RUN=1 POSIX script, .sync-exclude.lst, CWE-1236 CSV, and JSON manifest', () => {
		const mod = loadWebBuildMediaModule()
		const duplicates = [
			...buildSampleWebBuildDuplicates(),
			{
				id: 9199,
				hash: 'sha256-formula-map',
				size: 102400,
				acknowledged: false,
				files: [
					{ id: 91991, path: '/web/dist/assets/=CMD("calc").js.map', size: 102400, mtime: 1795000000 },
					{ id: 91992, path: '/web/staging/+malicious.js.map', size: 102400, mtime: 1790000000 },
				],
			},
		]

		const hardlinkAnalysis = mod.analyzeWebBuildMediaDuplicates(duplicates, {
			familyFilter: 'streaming-chunk-trees',
			strategy: 'hardlink-shared-asset-chunks',
			survivorRule: 'dam-cdn-authority-first',
			referenceTimeSec: 1796000000,
		})
		assert.equal(hardlinkAnalysis.clusters.length, 1)
		const hlsTarget = hardlinkAnalysis.clusters[0].members.find(m => m.fileId === 91022)
		assert.equal(hlsTarget.verdict, 'hardlink-asset-chunk')
		assert.equal(hlsTarget.actionKind, 'hardlink')

		const script = mod.buildWebBuildMediaScript(hardlinkAnalysis, { dataRoot: '/srv/nc/data' })
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes('sha256sum --'))
		assert.ok(script.includes('stat -c %d'))
		assert.ok(script.includes('ln -f --'))
		assert.ok(script.includes('hardlink_web_chunk'))
		assert.ok(script.includes('occ files:scan --path='))

		const stripAnalysis = mod.analyzeWebBuildMediaDuplicates(duplicates, {
			strategy: 'strip-stale-sourcemaps-builds',
			referenceTimeSec: 1796000000,
		})
		const stripMap = stripAnalysis.clusters.find(c => c.primaryGroupId === 9104)
		assert.equal(stripMap.members.find(m => m.fileId === 91042).verdict, 'reclaim-map-leak')
		const stripHls = stripAnalysis.clusters.find(c => c.primaryGroupId === 9102)
		assert.equal(stripHls.members.find(m => m.fileId === 91022).verdict, 'reclaim-build-cache')

		const overrideAnalysis = mod.analyzeWebBuildMediaDuplicates(buildSampleWebBuildDuplicates(), {
			memberOverrides: {
				91022: 'force-keep',
				91023: 'exclude',
			},
			referenceTimeSec: 1796000000,
		})
		const overriddenHls = overrideAnalysis.clusters.find(c => c.primaryGroupId === 9102)
		assert.equal(overriddenHls.members.find(m => m.fileId === 91022).verdict, 'blocked-manual-shield')
		assert.equal(overriddenHls.members.find(m => m.fileId === 91023).verdict, 'excluded')

		const syncExclude = mod.buildWebBuildSyncExcludeSnippet(hardlinkAnalysis)
		for (const pattern of ['dist/', '.next/', '*.js.map', '*.tsbuildinfo']) {
			assert.ok(syncExclude.includes(pattern), `Expected .sync-exclude.lst pattern ${pattern}`)
		}

		const fullAnalysis = mod.analyzeWebBuildMediaDuplicates(duplicates, { referenceTimeSec: 1796000000 })
		const csv = mod.buildWebBuildMediaCsvReport(fullAnalysis)
		assert.ok(csv.includes('"\'=CMD(""calc"").js.map"') || csv.includes("'=CMD"))
		assert.ok(csv.includes("'+malicious"))

		const json = JSON.parse(mod.buildWebBuildMediaJsonReport(fullAnalysis, '2026-11-24T06:00:00Z'))
		assert.equal(json.schema, 'duplicatefinder.web-build-media-auditor.v1')
		assert.equal(json.generatedAt, '2026-11-24T06:00:00Z')
		assert.ok(Array.isArray(json.clusters))
	})

	test('renders WebBuildMediaWorkbench empty, filter-empty, populated, and interactive states', async () => {
		let copied = ''
		const Workbench = loadWebBuildMediaWorkbench({
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
		assert.ok(emptyVm.$el.querySelector('.wbmw__empty-banner'))
		emptyVm.$destroy()

		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: buildSampleWebBuildDuplicates(),
					allDuplicates: buildSampleWebBuildDuplicates(),
					currentDuplicateId: 9104,
				},
			}),
		}).$mount()
		await settle()

		assert.equal(vm.$el.querySelectorAll('.wbmw__cluster-item').length, 4)
		assert.ok(vm.$el.textContent.includes('app.84f1a2b3.js.map'))

		const numInputs = vm.$el.querySelectorAll('.wbmw__num-input')
		assert.equal(numInputs.length, 2)
		numInputs[0].value = ''
		numInputs[0].dispatchEvent(new window.Event('input'))
		await settle()
		assert.equal(numInputs[0].value, '', 'Numeric input must not clamp or reset mid-keystroke')

		const copyBtn = Array.from(vm.$el.querySelectorAll('button')).find(b => b.textContent.includes('Copy DRY_RUN=1 Script'))
		copyBtn.click()
		await settle()
		assert.ok(copied.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(vm.$el.querySelector('.wbmw__notice.is-success'))

		const searchInput = vm.$el.querySelector('input[type="search"]')
		searchInput.value = 'no-such-web-artifact-xyz'
		searchInput.dispatchEvent(new window.Event('input'))
		await settle()
		assert.ok(vm.$el.querySelector('.wbmw__empty-banner'))

		const resetBtn = Array.from(vm.$el.querySelectorAll('button')).find(b => b.textContent.includes('Reset Filters'))
		resetBtn.click()
		await settle()
		assert.equal(vm.$el.querySelectorAll('.wbmw__cluster-item').length, 4)

		vm.$destroy()
	})

	test('integrates Web & Media button and } keyboard shortcut in App.vue', async () => {
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
		const WebWorkbench = loadWebBuildMediaWorkbench({ writeText: async () => {} })

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
			'./components/WebBuildMediaWorkbench.vue': { __esModule: true, default: WebWorkbench },
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
					entities: status === 'acknowledged' ? [] : buildSampleWebBuildDuplicates(),
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

		const topbarBtn = vm.$el.querySelector('.topbar-web-build-media-button')
		assert.ok(topbarBtn, 'Topbar Web & Media button must exist')

		const action = keyboardShortcuts.resolveShortcutAction({ key: '}', shiftKey: true, target: vm.$el })
		assert.equal(action, 'toggle-web-build-media-auditor')

		topbarBtn.click()
		await settle()
		assert.ok(vm.$el.querySelector('.web-build-media-workbench'), 'WebBuildMediaWorkbench must mount on click')

		window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '}', shiftKey: true, bubbles: true }))
		await settle()
		assert.equal(vm.$el.querySelector('.web-build-media-workbench'), null, 'WebBuildMediaWorkbench must toggle closed on } shortcut')

		vm.$destroy()
	})

	test('keeps zero U+2013/U+2014 typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/webBuildMediaAuditor.js',
			'src/components/WebBuildMediaWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
		]
		for (const relPath of files) {
			const content = readFileSync(resolve(__dirname, '../..', relPath), 'utf8')
			assert.equal(content.includes('\u2013'), false, `Unexpected U+2013 in ${relPath}`)
			assert.equal(content.includes('\u2014'), false, `Unexpected U+2014 in ${relPath}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `Unexpected XSS sink in ${relPath}`)
		}
		const vueContent = readFileSync(resolve(__dirname, '../..', 'src/components/WebBuildMediaWorkbench.vue'), 'utf8')
		assert.ok(vueContent.includes('min-block-size: 44px'))
		assert.ok(vueContent.includes(':focus-visible'))
	})
})
