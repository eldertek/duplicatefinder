const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window } = require('./helpers.cjs')

function loadDawAudioModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/dawAudioStemAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function loadDawAudioWorkbench(clipboardImpl) {
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js')
	const dawAudioStemAuditor = loadDawAudioModule()
	return loadComponent('src/components/DawAudioStemWorkbench.vue', {
		'../tools/clipboardHelper': clipboardImpl === undefined
			? clipboardHelper
			: { copyTextSafely: text => clipboardHelper.copyTextSafely(text, clipboardImpl) },
		'../tools/dawAudioStemAuditor': dawAudioStemAuditor,
	})
}

function buildSampleDawAudioDuplicates() {
	const mib = 1024 * 1024
	const refSec = 1796000000
	return [
		{
			id: 9401,
			hash: 'sha256-lossless-studio-master',
			size: 160 * mib,
			acknowledged: false,
			files: [
				{
					id: 94011,
					path: '/__groupfolders/24/Master-Vault/NeonHorizon_MASTER_24bit_ISRC_FR01A2600001.wav',
					size: 160 * mib,
					mtime: refSec - 10 * 86400,
				},
				{
					id: 94012,
					path: '/alice/files/Released-Masters/NeonHorizon_MASTER_24bit.wav',
					size: 160 * mib,
					mtime: refSec - 10 * 86400,
				},
				{
					id: 94013,
					path: '/alice/files/Downloads/NeonHorizon_MASTER_24bit.wav',
					size: 160 * mib,
					mtime: refSec - 4 * 86400,
				},
			],
		},
		{
			id: 9402,
			hash: 'sha256-daw-session-root',
			size: 42 * mib,
			acknowledged: false,
			files: [
				{
					id: 94021,
					path: '/Studio/Active-Sessions/NeonHorizon/NeonHorizon.als',
					size: 42 * mib,
					mtime: refSec - 2 * 86400,
				},
				{
					id: 94022,
					path: '/Studio/Projects/NeonHorizon_Backup/NeonHorizon.als',
					size: 42 * mib,
					mtime: refSec - 8 * 86400,
				},
			],
		},
		{
			id: 9403,
			hash: 'sha256-lossy-review-verified',
			size: 14 * mib,
			acknowledged: false,
			files: [
				{
					id: 94031,
					path: '/Reviews/NeonHorizon_mix_v2.mp3',
					size: 14 * mib,
					mtime: refSec - 12 * 86400,
				},
				{
					id: 94032,
					path: '/Downloads/NeonHorizon_rough.mp3',
					size: 14 * mib,
					mtime: refSec - 11 * 86400,
				},
			],
		},
		{
			id: 9404,
			hash: 'sha256-peak-freeze-cache',
			size: 28 * mib,
			acknowledged: false,
			files: [
				{
					id: 94041,
					path: '/Studio/Active-Sessions/NeonHorizon/Freeze/Synth_Pad.wav',
					size: 28 * mib,
					mtime: refSec - 5 * 86400,
				},
				{
					id: 94042,
					path: '/Studio/Active-Sessions/NeonHorizon/Bounce Cache/Synth_Pad.wav.asd',
					size: 28 * mib,
					mtime: refSec - 65 * 86400,
				},
				{
					id: 94043,
					path: '/Studio/Active-Sessions/NeonHorizon/Peaks/Synth_Pad.reapeaks',
					size: 28 * mib,
					mtime: refSec - 72 * 86400,
				},
			],
		},
		{
			id: 9405,
			hash: 'sha256-lossy-orphan-unverified',
			size: 11 * mib,
			acknowledged: false,
			files: [
				{
					id: 94051,
					path: '/Reviews/MidnightEcho_premaster.m4a',
					size: 11 * mib,
					mtime: refSec - 20 * 86400,
				},
				{
					id: 94052,
					path: '/Downloads/MidnightEcho_rough.m4a',
					size: 11 * mib,
					mtime: refSec - 18 * 86400,
				},
			],
		},
		{
			id: 9406,
			hash: 'sha256-unrelated-assets',
			size: 2 * mib,
			acknowledged: false,
			files: [
				{ id: 94061, path: '/alice/files/Photos/alpine.jpg', size: 2 * mib, mtime: refSec - 3 * 86400 },
				{ id: 94062, path: '/src/utils/numberFormat.js', size: 2 * mib, mtime: refSec - 4 * 86400 },
			],
		},
	]
}

describe('DAW Session, Lossless Stem Master, Mixdown Revision & Peak Cache Auditor', () => {
	test('classifies all 4 audio and DAW families while ignoring unrelated files', () => {
		const mod = loadDawAudioModule()

		for (const p of [
			'/Studio/Track.als',
			'/Studio/Beat.flp',
			'/Studio/Album.logicx',
			'/Studio/Mix.ptx',
			'/Studio/Score.cpr',
			'/Studio/Pod.rpp',
			'/Studio/Spot.sesx',
			'/Studio/Song/Audio Files/Vocal_01.wav',
			'/Studio/Song/Samples/Kick_Dry.aiff',
		]) {
			assert.equal(mod.classifyDawAudioArtifact(p).family, 'daw-session-project-roots', `Expected daw-session-project-roots for ${p}`)
		}

		for (const p of [
			'/Masters/Song_MASTER_24bit.wav',
			'/Masters/Song_STEM.aiff',
			'/Masters/Song_MASTER.aif',
			'/Masters/Song_24bit.flac',
			'/Masters/Song_MASTER.alac',
			'/Masters/Song_MASTER.bwf',
			'/Masters/Song_STEM.caf',
			'/Masters/Song_MASTER.rf64',
		]) {
			assert.equal(mod.classifyDawAudioArtifact(p).family, 'lossless-studio-masters', `Expected lossless-studio-masters for ${p}`)
		}

		const hints = { losslessMasterStems: new Set(['neonhorizon']) }
		for (const p of [
			'/Reviews/NeonHorizon_rough.mp3',
			'/Reviews/NeonHorizon_mix_v2.m4a',
			'/Reviews/NeonHorizon_premaster.aac',
			'/Reviews/NeonHorizon.ogg',
			'/Reviews/NeonHorizon.opus',
			'/Reviews/NeonHorizon.wma',
		]) {
			assert.equal(mod.classifyDawAudioArtifact(p, hints).family, 'lossy-review-exports', `Expected lossy-review-exports for ${p}`)
		}

		for (const p of [
			'/Studio/Song/Track.wav.asd',
			'/Studio/Song/Track.pkf',
			'/Studio/Song/Track.wav.reapeaks',
			'/Studio/Song/Track.ovw',
			'/Studio/Song/Freeze/Pad.wav',
			'/Studio/Song/Bounce Cache/Pad.aif',
		]) {
			assert.equal(mod.classifyDawAudioArtifact(p).family, 'daw-freeze-peak-caches', `Expected daw-freeze-peak-caches for ${p}`)
		}

		assert.equal(mod.classifyDawAudioArtifact('/alice/files/Photos/alpine.jpg'), null)
		assert.equal(mod.classifyDawAudioArtifact('/src/utils/numberFormat.js'), null)

		const parsedMaster = mod.parseDawAudioArtifactInfo(
			'NeonHorizon_MASTER_24bit_ISRC_FR01A2600001.wav',
			'/Master-Vault/NeonHorizon_MASTER_24bit_ISRC_FR01A2600001.wav'
		)
		assert.equal(parsedMaster.lineageStem, 'NeonHorizon')
		assert.ok(parsedMaster.artifactTags.includes('master'))
		assert.ok(parsedMaster.artifactTags.includes('24bit'))
		assert.ok(parsedMaster.artifactTags.includes('master-vault'))
	})

	test('protects Released Masters, ISRC Vaults, and Active DAW Sessions, and blocks lossy deletion without conserved lossless master', () => {
		const mod = loadDawAudioModule()
		const analysis = mod.analyzeDawAudioDuplicates(buildSampleDawAudioDuplicates(), {
			strategy: 'consolidate-studio-masters',
			referenceTimeSec: 1796000000,
		})

		assert.equal(analysis.schema, 'duplicatefinder.daw-audio-stem-auditor.v1')
		assert.equal(analysis.summary.totalClustersCount, 5)
		assert.equal(analysis.summary.familyCounts['lossless-studio-masters'], 1)
		assert.equal(analysis.summary.familyCounts['daw-session-project-roots'], 1)
		assert.equal(analysis.summary.familyCounts['lossy-review-exports'], 2)
		assert.equal(analysis.summary.familyCounts['daw-freeze-peak-caches'], 1)

		const masterCluster = analysis.clusters.find(c => c.primaryGroupId === 9401)
		assert.ok(masterCluster)
		assert.equal(masterCluster.survivor.tier, 'released-master-vault')
		assert.equal(masterCluster.members.find(m => m.fileId === 94012).verdict, 'blocked-released-master-vault')
		assert.equal(masterCluster.members.find(m => m.fileId === 94013).verdict, 'consolidate-to-master-vault')

		const dawCluster = analysis.clusters.find(c => c.primaryGroupId === 9402)
		assert.ok(dawCluster)
		assert.equal(dawCluster.survivor.tier, 'active-daw-session')
		assert.equal(dawCluster.members.find(m => m.fileId === 94022).verdict, 'blocked-active-daw-session')

		const peakAnalysis = mod.analyzeDawAudioDuplicates(buildSampleDawAudioDuplicates(), {
			strategy: 'prune-stale-peak-freeze-caches',
			staleCacheDays: 30,
			referenceTimeSec: 1796000000,
		})
		const peakCluster = peakAnalysis.clusters.find(c => c.primaryGroupId === 9404)
		assert.ok(peakCluster)
		assert.equal(peakCluster.members.find(m => m.fileId === 94042).verdict, 'reclaim-stale-peak-cache')
		assert.equal(peakCluster.members.find(m => m.fileId === 94043).verdict, 'reclaim-stale-peak-cache')

		const lossyAnalysis = mod.analyzeDawAudioDuplicates(buildSampleDawAudioDuplicates(), {
			strategy: 'prune-lossy-twins-when-lossless-verified',
			referenceTimeSec: 1796000000,
		})
		const verifiedLossy = lossyAnalysis.clusters.find(c => c.primaryGroupId === 9403)
		assert.ok(verifiedLossy)
		assert.equal(verifiedLossy.members.find(m => m.fileId === 94032).verdict, 'reclaim-lossy-twin')

		const unverifiedLossy = lossyAnalysis.clusters.find(c => c.primaryGroupId === 9405)
		assert.ok(unverifiedLossy)
		assert.equal(unverifiedLossy.members.find(m => m.fileId === 94052).verdict, 'blocked-unverified-lossless-master')

		// Excluding all lossless masters for NeonHorizon must block pruning its lossy transcodes
		const excludedMasters = mod.analyzeDawAudioDuplicates(buildSampleDawAudioDuplicates(), {
			strategy: 'prune-lossy-twins-when-lossless-verified',
			referenceTimeSec: 1796000000,
			memberOverrides: {
				94011: 'exclude',
				94012: 'exclude',
				94013: 'exclude',
			},
		})
		const nowUnverified = excludedMasters.clusters.find(c => c.primaryGroupId === 9403)
		assert.equal(nowUnverified.members.find(m => m.fileId === 94032).verdict, 'blocked-unverified-lossless-master')
	})

	test('supports overrides, DRY_RUN=1 POSIX script, .sync-exclude.lst, CWE-1236 CSV, and JSON manifest', () => {
		const mod = loadDawAudioModule()
		const duplicates = [
			...buildSampleDawAudioDuplicates(),
			{
				id: 9499,
				hash: 'sha256-formula-daw',
				size: 4096000,
				acknowledged: false,
				files: [
					{ id: 94991, path: '/Master-Vault/=CMD("calc")_MASTER_24bit.wav', size: 4096000, mtime: 1795000000 },
					{ id: 94992, path: '/Downloads/stray_MASTER_24bit.wav', size: 4096000, mtime: 1790000000 },
				],
			},
			{
				id: 9498,
				hash: 'sha256-formula-plus-daw',
				size: 4096000,
				acknowledged: false,
				files: [
					{ id: 94981, path: '/Master-Vault/+malicious_STEM.flac', size: 4096000, mtime: 1795000000 },
					{ id: 94982, path: '/Downloads/stray_STEM.flac', size: 4096000, mtime: 1790000000 },
				],
			},
		]

		const consolidateAnalysis = mod.analyzeDawAudioDuplicates(duplicates, {
			strategy: 'consolidate-studio-masters',
			referenceTimeSec: 1796000000,
		})
		const masterCluster = consolidateAnalysis.clusters.find(c => c.primaryGroupId === 9401)
		assert.equal(masterCluster.members.find(m => m.fileId === 94013).verdict, 'consolidate-to-master-vault')
		assert.equal(masterCluster.members.find(m => m.fileId === 94013).actionKind, 'consolidate')

		const script = mod.buildDawAudioScript(consolidateAnalysis, { dataRoot: '/srv/nc/data' })
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes('sha256sum --'))
		assert.ok(script.includes('stat -c %d'))
		assert.ok(script.includes('consolidate_master_vault_copy'))
		assert.ok(script.includes('occ files:scan --path='))

		const overrideAnalysis = mod.analyzeDawAudioDuplicates(buildSampleDawAudioDuplicates(), {
			strategy: 'prune-stale-peak-freeze-caches',
			staleCacheDays: 30,
			memberOverrides: {
				94042: 'force-keep',
				94043: 'exclude',
			},
			referenceTimeSec: 1796000000,
		})
		const peakOverridden = overrideAnalysis.clusters.find(c => c.primaryGroupId === 9404)
		assert.equal(peakOverridden.members.find(m => m.fileId === 94042).verdict, 'blocked-manual-shield')
		assert.equal(peakOverridden.members.find(m => m.fileId === 94043).verdict, 'excluded')

		const syncExclude = mod.buildDawAudioSyncExcludeSnippet(consolidateAnalysis)
		for (const pattern of ['*.asd', '*.pkf', '*.reapeaks', 'Backup/']) {
			assert.ok(syncExclude.includes(pattern), `Expected .sync-exclude.lst pattern ${pattern}`)
		}

		const csv = mod.buildDawAudioCsvReport(consolidateAnalysis)
		assert.ok(csv.includes('"\'=CMD(""calc"")_MASTER_24bit.wav"') || csv.includes("'=CMD"))
		assert.ok(csv.includes("'+malicious_STEM.flac"))

		const json = JSON.parse(mod.buildDawAudioJsonReport(consolidateAnalysis, '2026-11-24T06:35:00Z'))
		assert.equal(json.schema, 'duplicatefinder.daw-audio-stem-auditor.v1')
		assert.equal(json.generatedAt, '2026-11-24T06:35:00Z')
		assert.ok(Array.isArray(json.clusters))
	})

	test('renders DawAudioStemWorkbench empty, filter-empty, populated, and interactive states without clamping numeric inputs', async () => {
		let copied = ''
		const Workbench = loadDawAudioWorkbench({
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
		assert.ok(emptyVm.$el.querySelector('.dasw__empty-banner'))
		emptyVm.$destroy()

		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: buildSampleDawAudioDuplicates(),
					allDuplicates: buildSampleDawAudioDuplicates(),
					currentDuplicateId: 9401,
				},
			}),
		}).$mount()
		await settle()

		assert.equal(vm.$el.querySelectorAll('.dasw__cluster-item').length, 5)
		assert.ok(vm.$el.textContent.includes('NeonHorizon_MASTER_24bit_ISRC_FR01A2600001.wav'))

		const numInputs = vm.$el.querySelectorAll('.dasw__num-input')
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
		assert.ok(vm.$el.querySelector('.dasw__notice.is-success'))

		const searchInput = vm.$el.querySelector('input[type="search"]')
		searchInput.value = 'no-such-daw-stem-xyz'
		searchInput.dispatchEvent(new window.Event('input'))
		await settle()
		assert.ok(vm.$el.querySelector('.dasw__empty-banner'))

		const resetBtn = Array.from(vm.$el.querySelectorAll('button')).find(b => b.textContent.includes('Reset Filters'))
		resetBtn.click()
		await settle()
		assert.equal(vm.$el.querySelectorAll('.dasw__cluster-item').length, 5)

		vm.$destroy()
	})

	test('integrates Audio & DAW button and " keyboard shortcut in App.vue', async () => {
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
		const DawWorkbench = loadDawAudioWorkbench({ writeText: async () => {} })

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
			'./components/DawAudioStemWorkbench.vue': { __esModule: true, default: DawWorkbench },
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
					entities: status === 'acknowledged' ? [] : buildSampleDawAudioDuplicates(),
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

		const topbarBtn = vm.$el.querySelector('.topbar-daw-audio-button')
		assert.ok(topbarBtn, 'Topbar Audio & DAW button must exist')

		const action = keyboardShortcuts.resolveShortcutAction({ key: '"', shiftKey: true, target: vm.$el })
		assert.equal(action, 'toggle-daw-audio-stem-auditor')

		topbarBtn.click()
		await settle()
		assert.ok(vm.$el.querySelector('.daw-audio-workbench'), 'DawAudioStemWorkbench must mount on click')

		window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '"', shiftKey: true, bubbles: true }))
		await settle()
		assert.equal(vm.$el.querySelector('.daw-audio-workbench'), null, 'DawAudioStemWorkbench must toggle closed on " shortcut')

		vm.$destroy()
	})

	test('keeps zero U+2013/U+2014 typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/dawAudioStemAuditor.js',
			'src/components/DawAudioStemWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
		]
		for (const relPath of files) {
			const content = readFileSync(resolve(__dirname, '../..', relPath), 'utf8')
			assert.equal(content.includes('\u2013'), false, `Unexpected U+2013 in ${relPath}`)
			assert.equal(content.includes('\u2014'), false, `Unexpected U+2014 in ${relPath}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `Unexpected XSS sink in ${relPath}`)
		}
		const vueContent = readFileSync(resolve(__dirname, '../..', 'src/components/DawAudioStemWorkbench.vue'), 'utf8')
		assert.ok(vueContent.includes('min-block-size: 44px'))
		assert.ok(vueContent.includes(':focus-visible'))
	})
})
