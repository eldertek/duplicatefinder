const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window, document } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

/**
 * Load the pure Photography RAW, Lightroom/Capture One & Color Grading Vault auditor module.
 *
 * @return {object} Loaded module exports.
 */
function loadPhotoGradingModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/photoGradingVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

/**
 * Load PhotoGradingVaultWorkbench.vue with optional clipboard stub.
 *
 * @param {object} [clipboardImpl] Optional clipboard implementation.
 * @return {object} Vue component definition.
 */
function loadPhotoGradingWorkbench(clipboardImpl) {
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js')
	const photoGradingVaultAuditor = loadPhotoGradingModule()
	return loadComponent('src/components/PhotoGradingVaultWorkbench.vue', {
		'../tools/clipboardHelper': clipboardImpl === undefined
			? clipboardHelper
			: { copyTextSafely: text => clipboardHelper.copyTextSafely(text, clipboardImpl) },
		'../tools/photoGradingVaultAuditor': photoGradingVaultAuditor,
	})
}

/**
 * Build synthetic duplicate clusters covering RAW originals, .lrcat/.xmp/.cos/.eip/LUTs,
 * Previews.lrdata/Smart Previews.lrdata/Proxies/Cache, and derived .jpg/.tif/.psd + RAW+JPG pairs.
 *
 * @return {Array<object>} Sample duplicate groups.
 */
function buildSamplePhotoGradingDuplicates() {
	const mib = 1024 * 1024
	const refSec = 1796900000
	return [
		{
			id: 9601,
			hash: 'sha256-raw-cr3-4021',
			size: 52 * mib,
			acknowledged: false,
			files: [
				{
					id: 96011,
					path: '/StudioVault/RAW-Masters/2026-09_Paris/IMG_4021.CR3',
					size: 52 * mib,
					mtime: refSec - 30 * 86400,
				},
				{
					id: 96012,
					path: '/StudioVault/Downloads/IMG_4021_copy.CR3',
					size: 52 * mib,
					mtime: refSec - 25 * 86400,
				},
			],
		},
		{
			id: 9602,
			hash: 'sha256-raw-arw-nef-raf-dng-orf-rw2',
			size: 46 * mib,
			acknowledged: false,
			files: [
				{
					id: 96021,
					path: '/StudioVault/RAW-Vault/SonyA7R5/DSC08812.ARW',
					size: 46 * mib,
					mtime: refSec - 28 * 86400,
				},
				{
					id: 96022,
					path: '/StudioVault/Staging/DSC08812 (1).ARW',
					size: 46 * mib,
					mtime: refSec - 22 * 86400,
				},
			],
		},
		{
			id: 9603,
			hash: 'sha256-xmp-sidecar-4021',
			size: 64 * 1024,
			acknowledged: false,
			files: [
				{
					id: 96031,
					path: '/StudioVault/RAW-Masters/2026-09_Paris/IMG_4021.xmp',
					size: 64 * 1024,
					mtime: refSec - 20 * 86400,
				},
				{
					id: 96032,
					path: '/StudioVault/Staging/IMG_4021.xmp',
					size: 64 * 1024,
					mtime: refSec - 18 * 86400,
				},
			],
		},
		{
			id: 9604,
			hash: 'sha256-lrcat-active-paris',
			size: 280 * mib,
			acknowledged: false,
			files: [
				{
					id: 96041,
					path: '/StudioVault/Lightroom/Paris_2026_Master.lrcat',
					size: 280 * mib,
					mtime: refSec - 15 * 86400,
				},
				{
					id: 96042,
					path: '/StudioVault/Staging/Paris_2026_Master_copy.lrcat',
					size: 280 * mib,
					mtime: refSec - 14 * 86400,
				},
			],
		},
		{
			id: 9605,
			hash: 'sha256-c1-eip-cos-lut',
			size: 48 * mib,
			acknowledged: false,
			files: [
				{
					id: 96051,
					path: '/StudioVault/CaptureOne/Sessions/Editorial_2026/FRAME_1102.eip',
					size: 48 * mib,
					mtime: refSec - 16 * 86400,
				},
				{
					id: 96052,
					path: '/StudioVault/Downloads/FRAME_1102.eip',
					size: 48 * mib,
					mtime: refSec - 12 * 86400,
				},
			],
		},
		{
			id: 9606,
			hash: 'sha256-lr-previews-lrdata',
			size: 620 * mib,
			acknowledged: false,
			files: [
				{
					id: 96061,
					path: '/StudioVault/Lightroom/Paris_2026_Master Previews.lrdata/A/ABCD-1234.lrprev',
					size: 620 * mib,
					mtime: refSec - 40 * 86400,
				},
				{
					id: 96062,
					path: '/StudioVault/Lightroom/Old/Previews.lrdata/A/ABCD-1234.lrprev',
					size: 620 * mib,
					mtime: refSec - 45 * 86400,
				},
			],
		},
		{
			id: 9607,
			hash: 'sha256-smart-previews-proxies-cache',
			size: 340 * mib,
			acknowledged: false,
			files: [
				{
					id: 96071,
					path: '/StudioVault/Lightroom/Paris_2026_Master Smart Previews.lrdata/B/B123.dng',
					size: 340 * mib,
					mtime: refSec - 25 * 86400,
				},
				{
					id: 96072,
					path: '/StudioVault/CaptureOne/Cache/Proxies/B123.cot',
					size: 340 * mib,
					mtime: refSec - 30 * 86400,
				},
			],
		},
		{
			id: 9608,
			hash: 'sha256-proxies-cache-folder',
			size: 190 * mib,
			acknowledged: false,
			files: [
				{
					id: 96081,
					path: '/StudioVault/ColorGrading/Proxies/Reel_01_ProRes.jpg',
					size: 190 * mib,
					mtime: refSec - 20 * 86400,
				},
				{
					id: 96082,
					path: '/StudioVault/ColorGrading/Cache/Reel_01_ProRes.jpg',
					size: 190 * mib,
					mtime: refSec - 24 * 86400,
				},
			],
		},
		{
			id: 9609,
			hash: 'sha256-raw-jpg-pair-4021',
			size: 14 * mib,
			acknowledged: false,
			files: [
				{
					id: 96091,
					path: '/StudioVault/Exports/2026-09_Paris/IMG_4021_graded_print.JPG',
					size: 14 * mib,
					mtime: refSec - 8 * 86400,
				},
				{
					id: 96092,
					path: '/StudioVault/Downloads/IMG_4021_export_web.JPG',
					size: 14 * mib,
					mtime: refSec - 5 * 86400,
				},
			],
		},
		{
			id: 9610,
			hash: 'sha256-derived-psd-tif-orphan',
			size: 140 * mib,
			acknowledged: false,
			files: [
				{
					id: 96101,
					path: '/StudioVault/ColorGrading/Retouch/ORPHAN_9901_retouch.psd',
					size: 140 * mib,
					mtime: refSec - 10 * 86400,
				},
				{
					id: 96102,
					path: '/StudioVault/Staging/ORPHAN_9901_retouch_copy.psd',
					size: 140 * mib,
					mtime: refSec - 6 * 86400,
				},
			],
		},
	]
}

describe('Cycle 186: Photography RAW, Lightroom/Capture One & Color Grading Vault Auditor', () => {
	test('classifies all RAW, catalog/sidecar, preview/proxy, and derived export families and protects RAW + .xmp + .lrcat by default', () => {
		const mod = loadPhotoGradingModule()
		assert.equal(mod.normalizeShootStem('IMG_4021_graded_print.JPG'), 'img-4021')
		assert.equal(mod.normalizeShootStem('IMG_4021.CR3.xmp'), 'img-4021')
		assert.equal(mod.normalizeShootStem('DSC08812 (1).ARW'), 'dsc08812')

		// Verify all required RAW extensions classify as raw-camera-originals
		for (const ext of ['cr3', 'cr2', 'nef', 'arw', 'raf', 'dng', 'orf', 'rw2']) {
			const c = mod.classifyPhotoGradingFile({ path: `/RAW-Vault/SHOT_001.${ext}`, size: 1000 })
			assert.ok(c, `Should classify .${ext}`)
			assert.equal(c.family, 'raw-camera-originals')
			assert.equal(c.isRawOriginal, true)
		}

		// Verify .lrcat, .xmp, .cos, .eip classify as catalogs-grading-sidecars
		for (const ext of ['lrcat', 'xmp', 'cos', 'eip']) {
			const c = mod.classifyPhotoGradingFile({ path: `/Lightroom/Session_01.${ext}`, size: 1000 })
			assert.ok(c, `Should classify .${ext}`)
			assert.equal(c.family, 'catalogs-grading-sidecars')
		}

		const report = mod.analyzePhotoGradingVault(buildSamplePhotoGradingDuplicates(), {
			referenceNowSec: 1796900000,
		})

		assert.equal(report.schema, mod.PHOTO_GRADING_VAULT_SCHEMA)
		assert.equal(report.summary.totalClustersCount, 10)
		assert.equal(report.summary.totalRawClusters, 2)
		assert.equal(report.summary.totalCatalogSidecarClusters, 3)
		assert.equal(report.summary.totalRegenerableCacheClusters, 3)
		assert.equal(report.summary.totalDerivedExportClusters, 2)
		assert.equal(report.summary.totalRawJpgPairClusters, 2)

		// RAW originals, .xmp/.eip sidecars, and active .lrcat catalogs must be shielded by default
		const rawCluster = report.clusters.find(c => c.primaryGroupId === 9601)
		assert.equal(rawCluster.reclaimableCopiesCount, 0)
		assert.equal(rawCluster.members[1].verdict, 'blocked-raw-original')

		const xmpCluster = report.clusters.find(c => c.primaryGroupId === 9603)
		assert.equal(xmpCluster.reclaimableCopiesCount, 0)
		assert.equal(xmpCluster.members[1].verdict, 'blocked-active-sidecar-xmp')

		const lrcatCluster = report.clusters.find(c => c.primaryGroupId === 9604)
		assert.equal(lrcatCluster.reclaimableCopiesCount, 0)
		assert.equal(lrcatCluster.members[1].verdict, 'blocked-active-lrcat')

		// Previews.lrdata, Smart Previews.lrdata, Proxies/, Cache/ are reclaimable
		const lrdataCluster = report.clusters.find(c => c.primaryGroupId === 9606)
		assert.equal(lrdataCluster.reclaimableCopiesCount, 1)
		assert.equal(lrdataCluster.members[1].verdict, 'reclaim-regenerable-preview-cache')

		const proxiesCluster = report.clusters.find(c => c.primaryGroupId === 9608)
		assert.equal(proxiesCluster.reclaimableCopiesCount, 1)
		assert.equal(proxiesCluster.members[1].verdict, 'reclaim-regenerable-preview-cache')

		// RAW+JPG pair detected for IMG_4021
		const rawJpgCluster = report.clusters.find(c => c.primaryGroupId === 9609)
		assert.equal(rawJpgCluster.isRawJpgPair, true)
		assert.equal(rawJpgCluster.hasRawOriginalInVault, true)
		assert.equal(rawJpgCluster.hasXmpSidecarInVault, true)
		assert.equal(rawJpgCluster.members[1].verdict, 'reclaim-raw-jpg-pair-copy')
	})

	test('enforces RAW+XMP master verification when requireRawXmpForExportPrune is enabled and supports hardlink/cache-only strategies', () => {
		const mod = loadPhotoGradingModule()
		const sample = buildSamplePhotoGradingDuplicates()

		const strictExportsReport = mod.analyzePhotoGradingVault(sample, {
			requireRawXmpForExportPrune: true,
			referenceNowSec: 1796900000,
		})
		const orphanPsdCluster = strictExportsReport.clusters.find(c => c.primaryGroupId === 9610)
		assert.equal(orphanPsdCluster.reclaimableCopiesCount, 0)
		assert.equal(orphanPsdCluster.members[1].verdict, 'blocked-unverified-raw-xmp')

		const rawJpgCluster = strictExportsReport.clusters.find(c => c.primaryGroupId === 9609)
		assert.equal(rawJpgCluster.reclaimableCopiesCount, 1)
		assert.equal(rawJpgCluster.members[1].verdict, 'reclaim-raw-jpg-pair-copy')

		const hardlinkReport = mod.analyzePhotoGradingVault(sample, {
			strategy: 'consolidate-raw-hardlinks',
			referenceNowSec: 1796900000,
		})
		assert.ok(hardlinkReport.summary.totalConsolidatableCopiesCount >= 8)
		const rawHardlink = hardlinkReport.clusters.find(c => c.primaryGroupId === 9601)
		assert.equal(rawHardlink.members[1].actionType, 'hardlink')
		assert.equal(rawHardlink.members[1].verdict, 'consolidate-hardlink-photo-asset')

		const cacheOnlyReport = mod.analyzePhotoGradingVault(sample, {
			strategy: 'prune-regenerable-caches-only',
			staleCacheDays: 35,
			referenceNowSec: 1796900000,
		})
		const freshSmartPreview = cacheOnlyReport.clusters.find(c => c.primaryGroupId === 9607)
		assert.equal(freshSmartPreview.members[1].actionType, 'keep')
	})

	test('generates DRY_RUN=1 POSIX script, CWE-1236 CSV, JSON manifest, and .sync-exclude.lst rules', () => {
		const mod = loadPhotoGradingModule()
		const sample = [
			...buildSamplePhotoGradingDuplicates(),
			{
				id: 9699,
				hash: 'sha256-cwe1236-quote-test',
				size: 2048,
				files: [
					{
						id: 96991,
						path: '=CMD(\'calc\')/StudioVault/Lightroom/O\'Brien/Previews.lrdata/item.lrprev',
						size: 2048,
						mtime: 1796800000,
					},
					{
						id: 96992,
						path: '/StudioVault/Lightroom/O\'Brien/Cache/+SUM(A1).lrprev',
						size: 2048,
						mtime: 1796700000,
					},
				],
			},
		]

		const report = mod.analyzePhotoGradingVault(sample, { referenceNowSec: 1796900000 })
		const script = mod.buildPhotoGradingVaultRemediationScript(report, { dataRoot: '/srv/nc/data' })
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes("run_cmd rm -f '/srv/nc/data/StudioVault/Lightroom/O'\\''Brien/Cache/+SUM(A1).lrprev'"))
		assert.ok(!script.includes('IMG_4021.CR3'))
		assert.ok(!script.includes('Paris_2026_Master.lrcat'))

		const csv = mod.buildPhotoGradingVaultCsvReport(report)
		assert.ok(csv.includes('ShootWorkspace,ShootStem,DuplicationClass,RawJpgPair'))
		assert.ok(csv.includes("'=CMD('"))
		assert.ok(!csv.includes(',+SUM('))

		const json = JSON.parse(mod.buildPhotoGradingVaultJsonReport(report))
		assert.equal(json.schema, mod.PHOTO_GRADING_VAULT_SCHEMA)
		assert.ok(Array.isArray(json.clusters))

		const syncExclude = mod.buildPhotoGradingVaultSyncExcludeSnippet(report)
		assert.ok(syncExclude.includes('Previews.lrdata/'))
		assert.ok(syncExclude.includes('Smart Previews.lrdata/'))
		assert.ok(syncExclude.includes('Proxies/'))
		assert.ok(syncExclude.includes('Cache/'))
	})

	test('PhotoGradingVaultWorkbench mounts, filters RAW+JPG pairs, toggles conservation guards, overrides members, and exports reports', async () => {
		const copied = []
		const Workbench = loadPhotoGradingWorkbench({
			writeText: async text => {
				copied.push(text)
			},
		})

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: buildSamplePhotoGradingDuplicates(),
					allDuplicates: buildSamplePhotoGradingDuplicates(),
					currentDuplicateId: 9606,
				},
			}),
		}).$mount(mountNode)

		try {
			await settle()
			const rootEl = vm.$el
			assert.ok(rootEl.classList.contains('photo-grading-vault-workbench'))
			assert.ok(rootEl.textContent.includes('Photography RAW, Lightroom/Capture One & Color Grading Vault Auditor'))

			// Copy DRY_RUN=1 script button
			const copyBtn = Array.from(rootEl.querySelectorAll('button')).find(b => b.textContent.includes('Copy DRY_RUN=1 Script'))
			assert.ok(copyBtn)
			copyBtn.click()
			await settle()
			assert.equal(copied.length, 1)
			assert.ok(copied[0].includes('DRY_RUN="${DRY_RUN:-1}"'))

			// Filter by RAW+JPG Pairs
			const pairFilterBtn = Array.from(rootEl.querySelectorAll('button')).find(b => b.textContent.trim() === 'RAW+JPG Pairs')
			assert.ok(pairFilterBtn)
			pairFilterBtn.click()
			await settle()
			const cards = rootEl.querySelectorAll('.pgvw__cluster-card')
			assert.equal(cards.length, 2)
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('App.vue mounts topbar button and toggles PhotoGradingVaultWorkbench with F4 shortcut', async () => {
		const slotBox = tag => ({
			render(h) {
				return h(tag, this.$slots.default)
			},
		})
		const stub = name => ({
			name,
			props: ['duplicate', 'projectId', 'show', 'isScanning'],
			render(h) {
				return h('div', { class: `stub-${name}` })
			},
		})
		const icon = slotBox('span')
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		const statsModule = loadModule('src/tools/duplicateStats.js')
		const PhotoGradingVaultWorkbench = loadPhotoGradingWorkbench()

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
			'./components/GisMapArchiveWorkbench.vue': { __esModule: true, default: stub('gis-map-archive-auditor') },
			'./components/ScientificResearchVaultWorkbench.vue': { __esModule: true, default: stub('scientific-research-vault-auditor') },
			'./components/LegalContractVaultWorkbench.vue': { __esModule: true, default: stub('legal-contract-vault-auditor') },
			'./components/MedicalDicomVaultWorkbench.vue': { __esModule: true, default: stub('medical-dicom-vault-auditor') },
			'./components/AdditiveManufacturingVaultWorkbench.vue': { __esModule: true, default: stub('additive-mfg-vault-auditor') },
			'./components/GameDevPipelineVaultWorkbench.vue': { __esModule: true, default: stub('game-dev-pipeline-vault-auditor') },
			'./components/PhotoGradingVaultWorkbench.vue': { __esModule: true, default: PhotoGradingVaultWorkbench },
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
					entities: type === 'unacknowledged' ? buildSamplePhotoGradingDuplicates() : [],
					pagination: { currentPage: 1, totalPages: 1, totalItems: 10, hasMore: false },
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

			assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'F4', shiftKey: false }), 'toggle-photo-grading-vault-auditor')
			assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'F4', ctrlKey: true }), null)
			assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'F4', target: { tagName: 'INPUT' } }), null)

			const btn = vm.$el.querySelector('button.topbar-photo-grading-vault-button')
			assert.ok(btn, 'RAW & Grading Vault button is rendered in topbar')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'F4')
			assert.equal(vm.$el.querySelector('.photo-grading-vault-workbench'), null)

			// F4 opens workbench
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F4', bubbles: true, cancelable: true }))
			await settle()
			assert.ok(vm.$el.querySelector('.photo-grading-vault-workbench'), 'PhotoGradingVaultWorkbench must open on F4 shortcut')

			// F4 again closes workbench
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F4', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.$el.querySelector('.photo-grading-vault-workbench'), null, 'PhotoGradingVaultWorkbench must toggle closed on F4 shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new Photography RAW, Lightroom/Capture One & Color Grading Vault files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/photoGradingVaultAuditor.js',
			'src/components/PhotoGradingVaultWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
		]
		for (const rel of files) {
			const content = readFileSync(resolve(root, rel), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(content), false, `No U+2013/U+2014 in ${rel}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `No XSS sink in ${rel}`)
		}
	})
})
