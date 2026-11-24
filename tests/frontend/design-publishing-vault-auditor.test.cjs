const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window } = require('./helpers.cjs')

/**
 * Load the pure Design & Publishing Vault auditor module for tests.
 *
 * @return {object} Loaded module exports.
 */
function loadDesignPublishingModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/designPublishingVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

/**
 * Load DesignPublishingVaultWorkbench.vue with optional clipboard stub.
 *
 * @param {object} [clipboardImpl] Optional clipboard implementation.
 * @return {object} Vue component definition.
 */
function loadDesignPublishingWorkbench(clipboardImpl) {
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js')
	const designPublishingVaultAuditor = loadDesignPublishingModule()
	return loadComponent('src/components/DesignPublishingVaultWorkbench.vue', {
		'../tools/clipboardHelper': clipboardImpl === undefined
			? clipboardHelper
			: { copyTextSafely: text => clipboardHelper.copyTextSafely(text, clipboardImpl) },
		'../tools/designPublishingVaultAuditor': designPublishingVaultAuditor,
	})
}

/**
 * Build synthetic duplicate clusters covering all 4 design and publishing families.
 *
 * @return {Array<object>} Sample duplicate groups.
 */
function buildSampleDesignPublishingDuplicates() {
	const mib = 1024 * 1024
	const refSec = 1796000000
	return [
		{
			id: 9801,
			hash: 'sha256-catalog-autumn-2026-indd-master',
			size: 180 * mib,
			acknowledged: false,
			files: [
				{
					id: 98011,
					path: '/__groupfolders/21/01_Master/Catalog_Autumn_2026.indd',
					size: 180 * mib,
					mtime: refSec - 2 * 86400,
				},
				{
					id: 98012,
					path: '/Studio/Masters/Catalog_Autumn_2026.indd',
					size: 180 * mib,
					mtime: refSec - 4 * 86400,
				},
				{
					id: 98013,
					path: '/alice/files/Downloads/Catalog_Autumn_2026.indd',
					size: 180 * mib,
					mtime: refSec - 1 * 86400,
				},
			],
		},
		{
			id: 9802,
			hash: 'sha256-catalog-autumn-2026-bat-proof-verified',
			size: 64 * mib,
			acknowledged: false,
			files: [
				{
					id: 98021,
					path: '/Studio/02_Print_Proofs/Catalog_Autumn_2026_PRINT_CMYK.pdf',
					size: 64 * mib,
					mtime: refSec - 1 * 86400,
				},
				{
					id: 98022,
					path: '/Studio/02_Print_Proofs/Catalog_Autumn_2026_BAT_v1.pdf',
					size: 64 * mib,
					mtime: refSec - 5 * 86400,
				},
				{
					id: 98023,
					path: '/alice/files/Downloads/Catalog_Autumn_2026_web_preview.pdf',
					size: 64 * mib,
					mtime: refSec - 3 * 86400,
				},
			],
		},
		{
			id: 9803,
			hash: 'sha256-orphan-flyer-proof-unverified-master',
			size: 42 * mib,
			acknowledged: false,
			files: [
				{
					id: 98031,
					path: '/Print_Proofs/Legacy_Flyer_2025_X1a.pdf',
					size: 42 * mib,
					mtime: refSec - 20 * 86400,
				},
				{
					id: 98032,
					path: '/Downloads/Legacy_Flyer_2025_BLEED.pdf',
					size: 42 * mib,
					mtime: refSec - 18 * 86400,
				},
			],
		},
		{
			id: 9804,
			hash: 'sha256-inter-bold-otf-packaged-fonts',
			size: 2 * mib,
			acknowledged: false,
			files: [
				{
					id: 98041,
					path: '/_FontVault/Inter/Inter-Bold.otf',
					size: 2 * mib,
					mtime: refSec - 30 * 86400,
				},
				{
					id: 98042,
					path: '/_FontVault/Backup/Inter-Bold.otf',
					size: 2 * mib,
					mtime: refSec - 31 * 86400,
				},
				{
					id: 98043,
					path: '/Campaign_Spring/Document fonts/Inter-Bold.otf',
					size: 2 * mib,
					mtime: refSec - 5 * 86400,
				},
				{
					id: 98044,
					path: '/Campaign_Fall/Document fonts/Inter-Bold.otf',
					size: 2 * mib,
					mtime: refSec - 2 * 86400,
				},
			],
		},
		{
			id: 9805,
			hash: 'sha256-hero-packshot-links-clones',
			size: 48 * mib,
			acknowledged: false,
			files: [
				{
					id: 98051,
					path: '/_SharedAssets/Packshots/hero_bottle.tif',
					size: 48 * mib,
					mtime: refSec - 15 * 86400,
				},
				{
					id: 98052,
					path: '/Campaign_Spring/Links/hero_bottle.tif',
					size: 48 * mib,
					mtime: refSec - 4 * 86400,
				},
				{
					id: 98053,
					path: '/Campaign_Fall/Links/hero_bottle.tif',
					size: 48 * mib,
					mtime: refSec - 2 * 86400,
				},
			],
		},
		{
			id: 9806,
			hash: 'sha256-stale-creative-locks-and-caches',
			size: 24 * mib,
			acknowledged: false,
			files: [
				{
					id: 98061,
					path: '/Studio/01_Master/~Catalog_Autumn_2026~lock.idlk',
					size: 24 * mib,
					mtime: refSec - 10 * 86400,
				},
				{
					id: 98062,
					path: '/Studio/01_Master/InDesign Recovery/RecoveryData_01',
					size: 24 * mib,
					mtime: refSec - 12 * 86400,
				},
				{
					id: 98063,
					path: '/Studio/01_Master/Photoshop Temp90210',
					size: 24 * mib,
					mtime: refSec - 11 * 86400,
				},
				{
					id: 98064,
					path: '/Studio/01_Master/.BridgeCacheT',
					size: 24 * mib,
					mtime: refSec - 14 * 86400,
				},
				{
					id: 98065,
					path: '/Studio/01_Master/_thumb_cache.db',
					size: 24 * mib,
					mtime: refSec - 15 * 86400,
				},
			],
		},
		{
			id: 9807,
			hash: 'sha256-fresh-active-indesign-lock',
			size: 4 * mib,
			acknowledged: false,
			files: [
				{
					id: 98071,
					path: '/Studio/Active/~Winter_Lookbook~live.idlk',
					size: 4 * mib,
					mtime: refSec - 1 * 86400,
				},
				{
					id: 98072,
					path: '/Studio/Mirror/~Winter_Lookbook~live.idlk',
					size: 4 * mib,
					mtime: refSec - 1 * 86400,
				},
			],
		},
	]
}

describe('Cycle 176: Creative Design Package, Print Proof & Typography Font Archive Auditor', () => {
	test('classifies all 4 design & publishing families accurately and ignores unrelated files', () => {
		const mod = loadDesignPublishingModule()

		for (const p of [
			'/01_Master/Poster.psd',
			'/01_Master/Billboard.psb',
			'/01_Master/Logo_Suite.ai',
			'/01_Master/Brochure.indd',
			'/01_Master/Brochure.idml',
			'/01_Master/DesignSystem.fig',
			'/01_Master/MobileUI.sketch',
			'/01_Master/Packaging.afdesign',
			'/01_Master/Retouch.afphoto',
			'/01_Master/Magazine.afpub',
		]) {
			assert.equal(mod.classifyDesignPublishingAsset(p).family, 'master-layout-sources', `Expected master-layout-sources for ${p}`)
		}

		for (const p of [
			'/02_Print_Proofs/Brochure_PRINT_CMYK.pdf',
			'/02_Print_Proofs/Brochure_X1a.pdf',
			'/02_Print_Proofs/Brochure_BLEED.pdf',
			'/02_Print_Proofs/Brochure_BAT_v3.pdf',
			'/02_Print_Proofs/Brochure_web_preview.pdf',
			'/02_Print_Proofs/Vector_DieLine.eps',
		]) {
			assert.equal(mod.classifyDesignPublishingAsset(p).family, 'print-and-web-export-proofs', `Expected print-and-web-export-proofs for ${p}`)
		}

		for (const p of [
			'/Campaign_A/Document fonts/Gotham-Medium.otf',
			'/Campaign_A/Document fonts/Roboto-Regular.ttf',
			'/Campaign_A/Document fonts/BrandDisplay.woff2',
			'/_FontVault/Gotham-Medium.otf',
			'/Campaign_B/Links/hero_banner.tif',
			'/_SharedAssets/hero_banner.tif',
		]) {
			assert.equal(mod.classifyDesignPublishingAsset(p).family, 'packaged-fonts-and-linked-clones', `Expected packaged-fonts-and-linked-clones for ${p}`)
		}

		for (const p of [
			'/Studio/~Brochure~01.idlk',
			'/Studio/InDesign Recovery/DBTmp01',
			'/Studio/Photoshop Temp781234',
			'/Studio/export_staging.tmp',
			'/Studio/.BridgeCache',
			'/Studio/_thumb_cache.bin',
		]) {
			assert.equal(mod.classifyDesignPublishingAsset(p).family, 'creative-recovery-and-preview-caches', `Expected creative-recovery-and-preview-caches for ${p}`)
		}

		for (const p of [
			'/docs/readme.txt',
			'/accounting/budget_2026.xlsx',
			'/backups/db.sql.zst',
			'/src/app.js',
			'/contracts/signed_nda.pdf',
		]) {
			assert.equal(mod.classifyDesignPublishingAsset(p), null, `Expected null for unrelated file ${p}`)
		}
	})

	test('enforces master-layout protection, font-library-anchor guard, unverified-design-master block, and 3 strategies', () => {
		const mod = loadDesignPublishingModule()
		const sample = buildSampleDesignPublishingDuplicates()
		const refSec = 1796000000

		const analysis = mod.analyzeDesignPublishingDuplicates(sample, {
			referenceTimeSec: refSec,
			strategy: 'consolidate-packaged-fonts-and-links',
			keepBatVersions: 1,
			staleRecoveryDays: 3,
		})

		assert.equal(analysis.schema, 'duplicatefinder.design-publishing-vault-auditor.v1')
		assert.equal(analysis.summary.totalClustersCount, 7)

		const masterCluster = analysis.clusters.find(c => c.primaryGroupId === 9801)
		assert.equal(masterCluster.survivor.normalizedPath, '/__groupfolders/21/01_Master/Catalog_Autumn_2026.indd')
		assert.equal(masterCluster.members.find(m => m.fileId === 98012).verdict, 'blocked-master-layout-source')
		assert.equal(masterCluster.members.find(m => m.fileId === 98013).verdict, 'consolidate-to-studio-anchor')

		const verifiedProofCluster = analysis.clusters.find(c => c.primaryGroupId === 9802)
		assert.equal(verifiedProofCluster.members.find(m => m.fileId === 98021).verdict, 'keep-canonical-survivor')
		assert.equal(verifiedProofCluster.members.find(m => m.fileId === 98022).verdict, 'reclaim-superseded-proof-pdf')
		assert.equal(verifiedProofCluster.members.find(m => m.fileId === 98023).verdict, 'reclaim-superseded-proof-pdf')

		const unverifiedProofCluster = analysis.clusters.find(c => c.primaryGroupId === 9803)
		assert.equal(unverifiedProofCluster.hasUnverifiedDesignMaster, true)
		assert.equal(unverifiedProofCluster.members.find(m => m.fileId === 98032).verdict, 'blocked-unverified-design-master')
		assert.equal(unverifiedProofCluster.reclaimableCopiesCount, 0)

		const fontCluster = analysis.clusters.find(c => c.primaryGroupId === 9804)
		assert.equal(fontCluster.members.find(m => m.fileId === 98041).verdict, 'keep-canonical-survivor')
		assert.equal(fontCluster.members.find(m => m.fileId === 98042).verdict, 'blocked-font-library-anchor')
		assert.equal(fontCluster.members.find(m => m.fileId === 98043).verdict, 'consolidate-to-font-vault')
		assert.equal(fontCluster.members.find(m => m.fileId === 98044).verdict, 'consolidate-to-font-vault')

		const linksCluster = analysis.clusters.find(c => c.primaryGroupId === 9805)
		assert.equal(linksCluster.members.find(m => m.fileId === 98051).verdict, 'keep-canonical-survivor')
		assert.equal(linksCluster.members.find(m => m.fileId === 98052).verdict, 'consolidate-to-font-vault')

		const staleLockCluster = analysis.clusters.find(c => c.primaryGroupId === 9806)
		assert.equal(staleLockCluster.reclaimableCopiesCount, 4)

		const freshLockCluster = analysis.clusters.find(c => c.primaryGroupId === 9807)
		assert.equal(freshLockCluster.members.find(m => m.fileId === 98072).verdict, 'blocked-active-creative-lock')
		assert.equal(freshLockCluster.reclaimableCopiesCount, 0)

		const locksOnly = mod.analyzeDesignPublishingDuplicates(sample, {
			referenceTimeSec: refSec,
			strategy: 'prune-stale-creative-locks-and-caches',
		})
		const fontsInLocksStrategy = locksOnly.clusters.find(c => c.primaryGroupId === 9804)
		assert.equal(fontsInLocksStrategy.members.find(m => m.fileId === 98043).verdict, 'blocked-strategy-scope')

		const proofsOnly = mod.analyzeDesignPublishingDuplicates(sample, {
			referenceTimeSec: refSec,
			strategy: 'prune-superseded-proof-pdfs',
		})
		const locksInProofsStrategy = proofsOnly.clusters.find(c => c.primaryGroupId === 9806)
		assert.equal(locksInProofsStrategy.members.find(m => m.fileId === 98062).verdict, 'blocked-strategy-scope')

		const overridden = mod.analyzeDesignPublishingDuplicates(sample, {
			referenceTimeSec: refSec,
			memberOverrides: {
				98043: 'force-keep',
				98062: 'exclude',
			},
		})
		assert.equal(overridden.clusters.find(c => c.primaryGroupId === 9804).members.find(m => m.fileId === 98043).verdict, 'blocked-manual-shield')
		assert.equal(overridden.clusters.find(c => c.primaryGroupId === 9806).members.find(m => m.fileId === 98062).verdict, 'excluded')
	})

	test('generates POSIX DRY_RUN=1 script, .sync-exclude.lst, CWE-1236 CSV and JSON manifest', () => {
		const mod = loadDesignPublishingModule()
		const sample = buildSampleDesignPublishingDuplicates()
		sample[0].files[2].path = "/alice/files/Downloads/O'Brien Catalog.indd"

		const analysis = mod.analyzeDesignPublishingDuplicates(sample, {
			referenceTimeSec: 1796000000,
		})

		const script = mod.buildDesignPublishingScript(analysis, { dataRoot: '/srv/nextcloud/data' })
		assert.ok(script.includes('DRY_RUN="$' + '{DRY_RUN:-1}"'))
		assert.ok(script.includes('sha256sum --'))
		assert.ok(script.includes('stat -c %d'))
		assert.ok(script.includes('stat -f %d'))
		assert.ok(script.includes('occ files:scan --path='))
		assert.ok(script.includes("O'\\''Brien Catalog.indd"))

		const syncExclude = mod.buildDesignPublishingSyncExcludeSnippet(analysis)
		assert.ok(syncExclude.includes('*.idlk'))
		assert.ok(syncExclude.includes('InDesign Recovery/'))
		assert.ok(syncExclude.includes('Photoshop Temp*'))
		assert.ok(syncExclude.includes('.BridgeCache*'))
		assert.ok(syncExclude.includes('_thumb_cache.*'))

		const formulaInjected = [
			{
				id: 9899,
				hash: 'sha256-cwe1236-probe',
				size: 1024,
				files: [
					{ id: 98991, path: '/01_Master/=HYPERLINK("evil.example").psd', size: 1024, mtime: 1795000000 },
					{ id: 98992, path: '/Downloads/+cmd.psd', size: 1024, mtime: 1795000000 },
				],
			},
		]
		const csvAnalysis = mod.analyzeDesignPublishingDuplicates(formulaInjected, { referenceTimeSec: 1796000000 })
		const csv = mod.buildDesignPublishingCsvReport(csvAnalysis)
		assert.ok(csv.includes("'=HYPERLINK") || csv.includes("\"'=HYPERLINK"))

		const jsonStr = mod.buildDesignPublishingJsonReport(analysis, '2026-11-24T08:00:00Z')
		const parsed = JSON.parse(jsonStr)
		assert.equal(parsed.schema, 'duplicatefinder.design-publishing-vault-auditor.v1')
		assert.equal(parsed.generatedAt, '2026-11-24T08:00:00Z')
		assert.equal(parsed.clusters.length, 7)
	})

	test('DesignPublishingVaultWorkbench renders empty, populated, numeric non-clamping, filters, overrides and clipboard notice', async () => {
		let copied = ''
		const Workbench = loadDesignPublishingWorkbench({
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
		assert.ok(emptyVm.$el.querySelector('.dpv__empty-banner'))
		emptyVm.$destroy()

		const sample = buildSampleDesignPublishingDuplicates()
		const vm = new Vue({
			render: h => h(Workbench, {
				props: { duplicates: sample, allDuplicates: sample, currentDuplicateId: 9802 },
			}),
		}).$mount()
		await settle()

		assert.equal(vm.$el.querySelectorAll('.dpv__cluster-item').length, 7)

		const numInputs = vm.$el.querySelectorAll('.dpv__num-input')
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
		assert.ok(copied.includes('DRY_RUN="$' + '{DRY_RUN:-1}"'))
		assert.ok(vm.$el.querySelector('.dpv__notice.is-success'))

		const searchInput = vm.$el.querySelector('input[type="search"]')
		searchInput.value = 'no-such-design-asset-xyz'
		searchInput.dispatchEvent(new window.Event('input'))
		await settle()
		assert.ok(vm.$el.querySelector('.dpv__empty-banner'))

		const resetBtn = Array.from(vm.$el.querySelectorAll('button')).find(b => b.textContent.includes('Reset Filters'))
		resetBtn.click()
		await settle()
		assert.equal(vm.$el.querySelectorAll('.dpv__cluster-item').length, 7)

		vm.$destroy()
	})

	test('integrates Print & Font Vault button and Shift+F keyboard shortcut in App.vue', async () => {
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
		const DesignPublishingVaultWorkbench = loadDesignPublishingWorkbench({ writeText: async () => {} })

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
			'./components/PhotoRawCatalogWorkbench.vue': { __esModule: true, default: stub('photo-raw-catalog-auditor') },
			'./components/VmContainerImageWorkbench.vue': { __esModule: true, default: stub('vm-container-image-auditor') },
			'./components/MlDatasetArtifactWorkbench.vue': { __esModule: true, default: stub('ml-dataset-artifact-auditor') },
			'./components/Game3dAssetVaultWorkbench.vue': { __esModule: true, default: stub('game3d-asset-vault-auditor') },
			'./components/DatabaseDumpLogWorkbench.vue': { __esModule: true, default: stub('database-dump-log-auditor') },
			'./components/DesignPublishingVaultWorkbench.vue': { __esModule: true, default: DesignPublishingVaultWorkbench },
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
			'./components/OriginFoldersSettings.vue': { __esModule: true, default: stub('origin') },
			'./components/ExcludedFoldersSettings.vue': { __esModule: true, default: stub('excluded') },
			'./components/BulkDeletionSettings.vue': { __esModule: true, default: stub('bulk') },
			'./components/ProjectsSettings.vue': { __esModule: true, default: stub('projects') },
			'./components/ProjectDuplicates.vue': { __esModule: true, default: stub('project-duplicates') },
			'./components/help/OnboardingGuide.vue': { __esModule: true, default: stub('guide') },
			'./components/help/UsageExamples.vue': { __esModule: true, default: stub('examples') },
			'./components/help/FAQ.vue': { __esModule: true, default: stub('faq') },
			'./components/FilterSettings.vue': { __esModule: true, default: stub('filters') },
			'@/tools/api': {
				fetchDuplicates: async status => ({
					entities: status === 'acknowledged' ? [] : buildSampleDesignPublishingDuplicates(),
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

		const topbarBtn = vm.$el.querySelector('.topbar-design-publishing-vault-button')
		assert.ok(topbarBtn, 'Topbar Print & Font Vault button must exist')

		const action = keyboardShortcuts.resolveShortcutAction({ key: 'F', shiftKey: true, target: vm.$el })
		assert.equal(action, 'toggle-design-publishing-vault-auditor')
		assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'f', shiftKey: false, target: vm.$el }), 'toggle-similarity-inspector')

		topbarBtn.click()
		await settle()
		assert.ok(vm.$el.querySelector('.design-publishing-vault-workbench'), 'DesignPublishingVaultWorkbench must mount on click')

		window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F', shiftKey: true, bubbles: true }))
		await settle()
		assert.equal(vm.$el.querySelector('.design-publishing-vault-workbench'), null, 'DesignPublishingVaultWorkbench must toggle closed on Shift+F shortcut')

		vm.$destroy()
	})

	test('keeps zero U+2013/U+2014 typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/designPublishingVaultAuditor.js',
			'src/components/DesignPublishingVaultWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
		]
		for (const relPath of files) {
			const content = readFileSync(resolve(__dirname, '../..', relPath), 'utf8')
			assert.equal(content.includes('\u2013'), false, `Unexpected U+2013 in ${relPath}`)
			assert.equal(content.includes('\u2014'), false, `Unexpected U+2014 in ${relPath}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `Unexpected XSS sink in ${relPath}`)
		}
		const vueContent = readFileSync(resolve(__dirname, '../..', 'src/components/DesignPublishingVaultWorkbench.vue'), 'utf8')
		assert.ok(vueContent.includes('min-block-size: 44px'))
		assert.ok(vueContent.includes(':focus-visible'))
	})
})
