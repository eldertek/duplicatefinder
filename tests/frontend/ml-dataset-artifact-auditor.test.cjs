const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window } = require('./helpers.cjs')

function loadMlDatasetModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/mlDatasetArtifactAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function loadMlDatasetWorkbench(clipboardImpl) {
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js')
	const mlDatasetArtifactAuditor = loadMlDatasetModule()
	return loadComponent('src/components/MlDatasetArtifactWorkbench.vue', {
		'../tools/clipboardHelper': clipboardImpl === undefined
			? clipboardHelper
			: { copyTextSafely: text => clipboardHelper.copyTextSafely(text, clipboardImpl) },
		'../tools/mlDatasetArtifactAuditor': mlDatasetArtifactAuditor,
	})
}

function buildSampleMlDatasetDuplicates() {
	const mib = 1024 * 1024
	const refSec = 1796000000
	return [
		{
			id: 9901,
			hash: 'sha256-llama3-master-weights',
			size: 4096 * mib,
			acknowledged: false,
			files: [
				{
					id: 99011,
					path: '/__groupfolders/14/release/llama-3-8b/llama-3-8b.safetensors',
					size: 4096 * mib,
					mtime: refSec - 15 * 86400,
				},
				{
					id: 99012,
					path: '/production/models/llama-3-8b/llama-3-8b.safetensors',
					size: 4096 * mib,
					mtime: refSec - 20 * 86400,
				},
				{
					id: 99013,
					path: '/alice/files/Downloads/llama-3-8b.safetensors',
					size: 4096 * mib,
					mtime: refSec - 4 * 86400,
				},
			],
		},
		{
			id: 9902,
			hash: 'sha256-llama3-sidecars',
			size: 2 * mib,
			acknowledged: false,
			files: [
				{
					id: 99021,
					path: '/release/llama-3-8b/tokenizer.json',
					size: 2 * mib,
					mtime: refSec - 18 * 86400,
				},
				{
					id: 99022,
					path: '/production/models/llama-3-8b/tokenizer.json',
					size: 2 * mib,
					mtime: refSec - 19 * 86400,
				},
				{
					id: 99023,
					path: '/release/llama-3-8b/SHA256SUMS',
					size: 2 * mib,
					mtime: refSec - 20 * 86400,
				},
			],
		},
		{
			id: 9903,
			hash: 'sha256-llama3-gguf-verified',
			size: 2048 * mib,
			acknowledged: false,
			files: [
				{
					id: 99031,
					path: '/release/llama-3-8b/llama-3-8b-Q4_K_M.gguf',
					size: 2048 * mib,
					mtime: refSec - 12 * 86400,
				},
				{
					id: 99032,
					path: '/alice/files/Downloads/llama-3-8b-Q4_K_M.gguf',
					size: 2048 * mib,
					mtime: refSec - 3 * 86400,
				},
			],
		},
		{
			id: 9904,
			hash: 'sha256-orphan-quantized-unverified',
			size: 1536 * mib,
			acknowledged: false,
			files: [
				{
					id: 99041,
					path: '/Exports/mistral-orphan-Q8_0.gguf',
					size: 1536 * mib,
					mtime: refSec - 15 * 86400,
				},
				{
					id: 99042,
					path: '/Downloads/mistral-orphan-Q8_0.gguf',
					size: 1536 * mib,
					mtime: refSec - 6 * 86400,
				},
			],
		},
		{
			id: 9905,
			hash: 'sha256-training-step-checkpoints',
			size: 512 * mib,
			acknowledged: false,
			files: [
				{
					id: 99051,
					path: '/Training/run-01/checkpoint-4000/optimizer.pt',
					size: 512 * mib,
					mtime: refSec - 2 * 86400,
				},
				{
					id: 99052,
					path: '/Training/run-01/checkpoint-3000/optimizer.pt',
					size: 512 * mib,
					mtime: refSec - 18 * 86400,
				},
				{
					id: 99053,
					path: '/Training/run-01/step-005000/scheduler.pt',
					size: 512 * mib,
					mtime: refSec - 30 * 86400,
				},
				{
					id: 99054,
					path: '/Training/run-01/epoch_03/rng_state.pth',
					size: 512 * mib,
					mtime: refSec - 45 * 86400,
				},
			],
		},
		{
			id: 9906,
			hash: 'sha256-notebook-hub-caches',
			size: 256 * mib,
			acknowledged: false,
			files: [
				{
					id: 99061,
					path: '/Notebooks/.ipynb_checkpoints/eval-checkpoint.ipynb',
					size: 256 * mib,
					mtime: refSec - 2 * 86400,
				},
				{
					id: 99062,
					path: '/Experiments/mlruns/0/run123/artifacts/trace.bin',
					size: 256 * mib,
					mtime: refSec - 25 * 86400,
				},
				{
					id: 99063,
					path: '/Experiments/wandb/run-20261001_120000-abc/files/model.bin',
					size: 256 * mib,
					mtime: refSec - 35 * 86400,
				},
				{
					id: 99064,
					path: '/Home/.cache/huggingface/hub/models--llama3/blobs/blob01',
					size: 256 * mib,
					mtime: refSec - 40 * 86400,
				},
			],
		},
		{
			id: 9907,
			hash: 'sha256-unverified-dataset-shards',
			size: 768 * mib,
			acknowledged: false,
			files: [
				{
					id: 99071,
					path: '/Datasets/fineweb-edu-00001-of-00016.parquet',
					size: 768 * mib,
					mtime: refSec - 22 * 86400,
				},
				{
					id: 99072,
					path: '/Downloads/fineweb-edu-00001-of-00016.parquet',
					size: 768 * mib,
					mtime: refSec - 10 * 86400,
				},
			],
		},
		{
			id: 9908,
			hash: 'sha256-unrelated-assets',
			size: 2 * mib,
			acknowledged: false,
			files: [
				{ id: 99081, path: '/alice/files/Photos/alpine.jpg', size: 2 * mib, mtime: refSec - 3 * 86400 },
				{ id: 99082, path: '/Documents/StandardContract.pdf', size: 2 * mib, mtime: refSec - 4 * 86400 },
			],
		},
	]
}

describe('ML Weights, Quantized Checkpoints & Dataset Shard Auditor', () => {
	test('classifies all 4 ML/Dataset families while ignoring unrelated files', () => {
		const mod = loadMlDatasetModule()

		for (const p of [
			'/release/llama-3-8b/model.safetensors',
			'/production/bert/pytorch_model.bin',
			'/models/resnet50.onnx',
			'/models/encoder.pt',
			'/release/decoder.pth',
			'/models/llama-3-8b/config.json',
			'/models/llama-3-8b/tokenizer.json',
			'/release/llama-3-8b/model.safetensors.index.json',
			'/release/llama-3-8b/SHA256SUMS',
		]) {
			assert.equal(mod.classifyMlDatasetArtifact(p).family, 'model-master-weights', `Expected model-master-weights for ${p}`)
		}

		for (const p of [
			'/models/llama-3-8b-Q4_K_M.gguf',
			'/models/llama-3-8b-Q5_K_M.gguf',
			'/models/llama-3-8b-Q8_0.gguf',
			'/models/llama-3-8b-F16.gguf',
			'/models/qwen-7b.awq',
			'/models/mistral-7b.exl2',
		]) {
			assert.equal(mod.classifyMlDatasetArtifact(p).family, 'quantized-weight-variants', `Expected quantized-weight-variants for ${p}`)
		}

		for (const p of [
			'/runs/exp1/checkpoint-1000/model.pt',
			'/runs/exp1/step-005000/weights.pth',
			'/runs/exp1/epoch_03/checkpoint.safetensors',
			'/runs/exp1/checkpoints/step-200/model.pt',
			'/runs/exp1/optimizer.pt',
			'/runs/exp1/scheduler.pt',
			'/runs/exp1/rng_state.pth',
		]) {
			assert.equal(mod.classifyMlDatasetArtifact(p).family, 'training-step-checkpoints', `Expected training-step-checkpoints for ${p}`)
		}

		for (const p of [
			'/datasets/train-0001.parquet',
			'/datasets/tokens.arrow',
			'/datasets/embeddings.hdf5',
			'/datasets/features.h5',
			'/datasets/shard-001.tfrecord',
			'/notebooks/.ipynb_checkpoints/exp-checkpoint.ipynb',
			'/mlruns/0/run1/metrics/loss',
			'/wandb/run-20261101_010203-xyz/files/wandb-summary.json',
			'/home/user/.cache/huggingface/hub/models--qwen/refs/main',
		]) {
			assert.equal(mod.classifyMlDatasetArtifact(p).family, 'dataset-shards-and-notebook-caches', `Expected dataset-shards-and-notebook-caches for ${p}`)
		}

		assert.equal(mod.classifyMlDatasetArtifact('/alice/files/Photos/alpine.jpg'), null)
		assert.equal(mod.classifyMlDatasetArtifact('/Documents/StandardContract.pdf'), null)

		const stemMaster = mod.parseMlDatasetArtifactInfo('llama-3-8b.safetensors', '/release/llama-3-8b/llama-3-8b.safetensors')
		const stemQuant = mod.parseMlDatasetArtifactInfo('llama-3-8b-Q4_K_M.gguf', '/Downloads/llama-3-8b-Q4_K_M.gguf')
		const stemSidecar = mod.parseMlDatasetArtifactInfo('tokenizer.json', '/release/llama-3-8b/tokenizer.json')
		assert.equal(stemMaster.modelLineageStem, 'llama-3-8b')
		assert.equal(stemQuant.modelLineageStem, 'llama-3-8b')
		assert.equal(stemSidecar.modelLineageStem, 'llama-3-8b')
		assert.equal(stemQuant.quantTag, 'Q4_K_M')
	})

	test('protects model masters and sidecars, blocks unverified quantized/shard deletions, and executes all 3 strategies', () => {
		const mod = loadMlDatasetModule()
		const analysis = mod.analyzeMlDatasetArtifactDuplicates(buildSampleMlDatasetDuplicates(), {
			strategy: 'consolidate-quantized-model-twins',
			staleCacheDays: 14,
			keepRecentCheckpoints: 2,
			referenceTimeSec: 1796000000,
		})

		assert.equal(analysis.schema, 'duplicatefinder.ml-dataset-artifact-auditor.v1')
		assert.equal(analysis.summary.totalClustersCount, 7)
		assert.equal(analysis.summary.familyCounts['model-master-weights'], 2)
		assert.equal(analysis.summary.familyCounts['quantized-weight-variants'], 2)
		assert.equal(analysis.summary.familyCounts['training-step-checkpoints'], 1)
		assert.equal(analysis.summary.familyCounts['dataset-shards-and-notebook-caches'], 2)

		const masterCluster = analysis.clusters.find(c => c.primaryGroupId === 9901)
		assert.ok(masterCluster)
		assert.equal(masterCluster.survivor.fileId, 99011)
		assert.equal(masterCluster.members.find(m => m.fileId === 99012).verdict, 'blocked-model-master-weights')
		assert.equal(masterCluster.members.find(m => m.fileId === 99013).verdict, 'consolidate-to-model-master')

		const sidecarCluster = analysis.clusters.find(c => c.primaryGroupId === 9902)
		assert.ok(sidecarCluster)
		assert.equal(sidecarCluster.members.find(m => m.fileId === 99022).verdict, 'blocked-sidecar-manifest')
		assert.equal(sidecarCluster.members.find(m => m.fileId === 99023).verdict, 'blocked-sidecar-manifest')

		const verifiedQuant = analysis.clusters.find(c => c.primaryGroupId === 9903)
		assert.ok(verifiedQuant)
		assert.equal(verifiedQuant.members.find(m => m.fileId === 99032).verdict, 'consolidate-to-model-master')

		const unverifiedQuant = analysis.clusters.find(c => c.primaryGroupId === 9904)
		assert.ok(unverifiedQuant)
		assert.equal(unverifiedQuant.members.find(m => m.fileId === 99042).verdict, 'blocked-unverified-model-master')

		const unverifiedShard = analysis.clusters.find(c => c.primaryGroupId === 9907)
		assert.ok(unverifiedShard)
		assert.equal(unverifiedShard.members.find(m => m.fileId === 99072).verdict, 'blocked-unverified-model-master')

		const excludedMasterAnalysis = mod.analyzeMlDatasetArtifactDuplicates(buildSampleMlDatasetDuplicates(), {
			strategy: 'consolidate-quantized-model-twins',
			referenceTimeSec: 1796000000,
			memberOverrides: {
				99011: 'exclude',
				99012: 'exclude',
				99021: 'exclude',
				99022: 'exclude',
				99023: 'exclude',
			},
		})
		const nowUnverifiedQuant = excludedMasterAnalysis.clusters.find(c => c.primaryGroupId === 9903)
		assert.equal(nowUnverifiedQuant.members.find(m => m.fileId === 99032).verdict, 'blocked-unverified-model-master')

		const checkpointAnalysis = mod.analyzeMlDatasetArtifactDuplicates(buildSampleMlDatasetDuplicates(), {
			strategy: 'prune-intermediate-step-checkpoints',
			keepRecentCheckpoints: 2,
			staleCacheDays: 14,
			referenceTimeSec: 1796000000,
		})
		const cpCluster = checkpointAnalysis.clusters.find(c => c.primaryGroupId === 9905)
		assert.ok(cpCluster)
		assert.equal(cpCluster.members.find(m => m.fileId === 99051).verdict, 'keep-canonical-survivor')
		assert.equal(cpCluster.members.find(m => m.fileId === 99052).verdict, 'blocked-recent-step-checkpoint')
		assert.equal(cpCluster.members.find(m => m.fileId === 99053).verdict, 'reclaim-step-checkpoint')
		assert.equal(cpCluster.members.find(m => m.fileId === 99054).verdict, 'reclaim-step-checkpoint')

		const cacheAnalysis = mod.analyzeMlDatasetArtifactDuplicates(buildSampleMlDatasetDuplicates(), {
			strategy: 'prune-notebook-and-hub-caches',
			staleCacheDays: 14,
			referenceTimeSec: 1796000000,
		})
		const cacheCluster = cacheAnalysis.clusters.find(c => c.primaryGroupId === 9906)
		assert.ok(cacheCluster)
		assert.equal(cacheCluster.members.find(m => m.fileId === 99061).verdict, 'keep-canonical-survivor')
		assert.equal(cacheCluster.members.find(m => m.fileId === 99062).verdict, 'reclaim-notebook-hub-cache')
		assert.equal(cacheCluster.members.find(m => m.fileId === 99063).verdict, 'reclaim-notebook-hub-cache')
		assert.equal(cacheCluster.members.find(m => m.fileId === 99064).verdict, 'reclaim-notebook-hub-cache')
	})

	test('supports operator overrides, DRY_RUN=1 POSIX script, .sync-exclude.lst, CWE-1236 CSV, and JSON manifest', () => {
		const mod = loadMlDatasetModule()
		const duplicates = [
			...buildSampleMlDatasetDuplicates(),
			{
				id: 9999,
				hash: 'sha256-formula-model',
				size: 1024 * 1024 * 50,
				acknowledged: false,
				files: [
					{ id: 99991, path: '/release/formula-model/=CMD("calc")_weights.safetensors', size: 52428800, mtime: 1795000000 },
					{ id: 99992, path: '/Downloads/stray_weights.safetensors', size: 52428800, mtime: 1790000000 },
				],
			},
			{
				id: 9998,
				hash: 'sha256-formula-plus-model',
				size: 4096,
				acknowledged: false,
				files: [
					{ id: 99981, path: '/release/formula-model/+malicious_weights.safetensors', size: 4096, mtime: 1795000000 },
					{ id: 99982, path: '/Downloads/stray_plus_weights.safetensors', size: 4096, mtime: 1790000000 },
				],
			},
		]

		const analysis = mod.analyzeMlDatasetArtifactDuplicates(duplicates, {
			strategy: 'consolidate-quantized-model-twins',
			referenceTimeSec: 1796000000,
		})

		const script = mod.buildMlDatasetArtifactScript(analysis, { dataRoot: '/srv/nc/data' })
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes('sha256sum --'))
		assert.ok(script.includes('stat -c %d'))
		assert.ok(script.includes('consolidate_ml_artifact'))
		assert.ok(script.includes('occ files:scan --path='))

		const overrideAnalysis = mod.analyzeMlDatasetArtifactDuplicates(buildSampleMlDatasetDuplicates(), {
			strategy: 'prune-intermediate-step-checkpoints',
			keepRecentCheckpoints: 1,
			staleCacheDays: 14,
			memberOverrides: {
				99053: 'force-keep',
				99054: 'exclude',
			},
			referenceTimeSec: 1796000000,
		})
		const cpOverridden = overrideAnalysis.clusters.find(c => c.primaryGroupId === 9905)
		assert.equal(cpOverridden.members.find(m => m.fileId === 99053).verdict, 'blocked-manual-shield')
		assert.equal(cpOverridden.members.find(m => m.fileId === 99054).verdict, 'excluded')

		const syncExclude = mod.buildMlDatasetArtifactSyncExcludeSnippet(analysis)
		for (const pattern of ['.ipynb_checkpoints/', 'mlruns/', 'wandb/', '.cache/huggingface/', 'checkpoint-*/', 'optimizer.pt']) {
			assert.ok(syncExclude.includes(pattern), `Expected .sync-exclude.lst pattern ${pattern}`)
		}

		const csv = mod.buildMlDatasetArtifactCsvReport(analysis)
		assert.ok(csv.includes('"\'=CMD(""calc"")_weights.safetensors"') || csv.includes("'=CMD"))
		assert.ok(csv.includes("'+malicious_weights.safetensors"))

		const json = JSON.parse(mod.buildMlDatasetArtifactJsonReport(analysis, '2026-11-24T07:45:00Z'))
		assert.equal(json.schema, 'duplicatefinder.ml-dataset-artifact-auditor.v1')
		assert.equal(json.generatedAt, '2026-11-24T07:45:00Z')
		assert.ok(Array.isArray(json.clusters))
	})

	test('renders MlDatasetArtifactWorkbench empty, filter-empty, populated, and interactive states without clamping numeric inputs', async () => {
		let copied = ''
		const Workbench = loadMlDatasetWorkbench({
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
		assert.ok(emptyVm.$el.querySelector('.mldw__empty-banner'))
		emptyVm.$destroy()

		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: buildSampleMlDatasetDuplicates(),
					allDuplicates: buildSampleMlDatasetDuplicates(),
					currentDuplicateId: 9901,
				},
			}),
		}).$mount()
		await settle()

		assert.equal(vm.$el.querySelectorAll('.mldw__cluster-item').length, 7)
		assert.ok(vm.$el.textContent.includes('llama-3-8b.safetensors'))

		const numInputs = vm.$el.querySelectorAll('.mldw__num-input')
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
		assert.ok(vm.$el.querySelector('.mldw__notice.is-success'))

		const searchInput = vm.$el.querySelector('input[type="search"]')
		searchInput.value = 'no-such-ml-artifact-xyz'
		searchInput.dispatchEvent(new window.Event('input'))
		await settle()
		assert.ok(vm.$el.querySelector('.mldw__empty-banner'))

		const resetBtn = Array.from(vm.$el.querySelectorAll('button')).find(b => b.textContent.includes('Reset Filters'))
		resetBtn.click()
		await settle()
		assert.equal(vm.$el.querySelectorAll('.mldw__cluster-item').length, 7)

		vm.$destroy()
	})

	test('integrates ML & Datasets button and Shift+W keyboard shortcut in App.vue', async () => {
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
		const MlDatasetWorkbench = loadMlDatasetWorkbench({ writeText: async () => {} })

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
			'./components/MlDatasetArtifactWorkbench.vue': { __esModule: true, default: MlDatasetWorkbench },
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
					entities: status === 'acknowledged' ? [] : buildSampleMlDatasetDuplicates(),
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

		const topbarBtn = vm.$el.querySelector('.topbar-ml-dataset-artifact-button')
		assert.ok(topbarBtn, 'Topbar ML & Datasets button must exist')

		const action = keyboardShortcuts.resolveShortcutAction({ key: 'W', shiftKey: true, target: vm.$el })
		assert.equal(action, 'toggle-ml-dataset-artifact-auditor')
		assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'w', shiftKey: false, target: vm.$el }), 'toggle-batch-auto-select')

		topbarBtn.click()
		await settle()
		assert.ok(vm.$el.querySelector('.ml-dataset-artifact-workbench'), 'MlDatasetArtifactWorkbench must mount on click')

		window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'W', shiftKey: true, bubbles: true }))
		await settle()
		assert.equal(vm.$el.querySelector('.ml-dataset-artifact-workbench'), null, 'MlDatasetArtifactWorkbench must toggle closed on Shift+W shortcut')

		vm.$destroy()
	})

	test('keeps zero U+2013/U+2014 typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/mlDatasetArtifactAuditor.js',
			'src/components/MlDatasetArtifactWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
		]
		for (const relPath of files) {
			const content = readFileSync(resolve(__dirname, '../..', relPath), 'utf8')
			assert.equal(content.includes('\u2013'), false, `Unexpected U+2013 in ${relPath}`)
			assert.equal(content.includes('\u2014'), false, `Unexpected U+2014 in ${relPath}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `Unexpected XSS sink in ${relPath}`)
		}
		const vueContent = readFileSync(resolve(__dirname, '../..', 'src/components/MlDatasetArtifactWorkbench.vue'), 'utf8')
		assert.ok(vueContent.includes('min-block-size: 44px'))
		assert.ok(vueContent.includes(':focus-visible'))
	})
})
