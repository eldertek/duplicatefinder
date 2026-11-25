const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window, document } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

/**
 * Load the pure Machine Learning, LLM Weights & Dataset Checkpoint Vault auditor module.
 *
 * @return {object} Loaded module exports.
 */
function loadMlCheckpointModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/mlCheckpointVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

/**
 * Load MlCheckpointVaultWorkbench.vue with optional clipboard stub.
 *
 * @param {object} [clipboardImpl] Optional clipboard implementation.
 * @return {object} Vue component definition.
 */
function loadMlCheckpointWorkbench(clipboardImpl) {
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js')
	const mlCheckpointVaultAuditor = loadMlCheckpointModule()
	return loadComponent('src/components/MlCheckpointVaultWorkbench.vue', {
		'../tools/clipboardHelper': clipboardImpl === undefined
			? clipboardHelper
			: { copyTextSafely: text => clipboardHelper.copyTextSafely(text, clipboardImpl) },
		'../tools/mlCheckpointVaultAuditor': mlCheckpointVaultAuditor,
	})
}

/**
 * Build synthetic duplicate clusters covering .safetensors/.ckpt/.pt/.pth/.onnx/.bin weights,
 * best/final vs checkpoints/step-*, tokenizer.json/config.json, GGUF Q4_K_M/Q8_0 derived from FP16 safetensors,
 * .parquet/.arrow/.jsonl/.tfrecord datasets, and __pycache__/.cache/huggingface/wandb/lightning_logs caches.
 *
 * @return {Array<object>} Sample duplicate groups.
 */
function buildSampleMlCheckpointDuplicates() {
	const mib = 1024 * 1024
	const refSec = 1796900000
	return [
		{
			id: 9701,
			hash: 'sha256-llama3-fp16-best',
			size: 512 * mib,
			acknowledged: false,
			files: [
				{
					id: 97011,
					path: '/ML-Vault/Models/llama-3-8b/best/llama-3-8b-fp16.safetensors',
					size: 512 * mib,
					mtime: refSec - 86400 * 10,
					isInOriginFolder: false,
				},
				{
					id: 97012,
					path: '/Staging/llama-3-8b/final/llama-3-8b-fp16.safetensors',
					size: 512 * mib,
					mtime: refSec - 86400 * 3,
					isInOriginFolder: false,
				},
			],
		},
		{
			id: 9702,
			hash: 'sha256-llama3-tokenizer',
			size: 4 * mib,
			acknowledged: false,
			files: [
				{
					id: 97021,
					path: '/ML-Vault/Models/llama-3-8b/best/tokenizer.json',
					size: 4 * mib,
					mtime: refSec - 86400 * 10,
					isInOriginFolder: false,
				},
				{
					id: 97022,
					path: '/Downloads/llama-3-8b/config.json',
					size: 4 * mib,
					mtime: refSec - 86400 * 2,
					isInOriginFolder: false,
				},
			],
		},
		{
			id: 9703,
			hash: 'sha256-llama3-gguf-q4km',
			size: 256 * mib,
			acknowledged: false,
			files: [
				{
					id: 97031,
					path: '/ML-Vault/GGUF/llama-3-8b-Q4_K_M.gguf',
					size: 256 * mib,
					mtime: refSec - 86400 * 8,
					isInOriginFolder: false,
				},
				{
					id: 97032,
					path: '/Downloads/llama-3-8b-Q4_K_M.gguf',
					size: 256 * mib,
					mtime: refSec - 86400 * 1,
					isInOriginFolder: false,
				},
			],
		},
		{
			id: 9704,
			hash: 'sha256-orphan-gguf-q80',
			size: 320 * mib,
			acknowledged: false,
			files: [
				{
					id: 97041,
					path: '/ML-Vault/GGUF/orphan-mistral-7b-Q8_0.gguf',
					size: 320 * mib,
					mtime: refSec - 86400 * 6,
					isInOriginFolder: false,
				},
				{
					id: 97042,
					path: '/Downloads/orphan-mistral-7b-Q8_0.gguf',
					size: 320 * mib,
					mtime: refSec - 86400 * 2,
					isInOriginFolder: false,
				},
			],
		},
		{
			id: 9705,
			hash: 'sha256-llama3-step-1000',
			size: 180 * mib,
			acknowledged: false,
			files: [
				{
					id: 97051,
					path: '/ML-Vault/Models/llama-3-8b/checkpoints/step-1000/model.ckpt',
					size: 180 * mib,
					mtime: refSec - 86400 * 25,
					isInOriginFolder: false,
				},
				{
					id: 97052,
					path: '/Scratch/llama-3-8b/checkpoints/step-1000/model.ckpt',
					size: 180 * mib,
					mtime: refSec - 86400 * 22,
					isInOriginFolder: false,
				},
			],
		},
		{
			id: 9706,
			hash: 'sha256-dataset-parquet',
			size: 120 * mib,
			acknowledged: false,
			files: [
				{
					id: 97061,
					path: '/ML-Vault/Datasets/fineweb/train-0001.parquet',
					size: 120 * mib,
					mtime: refSec - 86400 * 15,
					isInOriginFolder: false,
				},
				{
					id: 97062,
					path: '/Staging/fineweb/train-0001.parquet',
					size: 120 * mib,
					mtime: refSec - 86400 * 5,
					isInOriginFolder: false,
				},
			],
		},
		{
			id: 9707,
			hash: 'sha256-hf-wandb-cache',
			size: 90 * mib,
			acknowledged: false,
			files: [
				{
					id: 97071,
					path: '/home/trainer/.cache/huggingface/hub/models--llama-3-8b/blobs/weights.bin',
					size: 90 * mib,
					mtime: refSec - 86400 * 30,
					isInOriginFolder: false,
				},
				{
					id: 97072,
					path: '/home/trainer/wandb/run-20261101/files/weights.bin',
					size: 90 * mib,
					mtime: refSec - 86400 * 28,
					isInOriginFolder: false,
				},
			],
		},
		{
			id: 9708,
			hash: 'sha256-pycache-lightning',
			size: 24 * mib,
			acknowledged: false,
			files: [
				{
					id: 97081,
					path: '/Projects/llama-3-8b/__pycache__/trainer.cpython-312.pyc',
					size: 24 * mib,
					mtime: refSec - 86400 * 20,
					isInOriginFolder: false,
				},
				{
					id: 97082,
					path: '/Projects/llama-3-8b/lightning_logs/version_4/events.out.tfevents.1700',
					size: 24 * mib,
					mtime: refSec - 86400 * 19,
					isInOriginFolder: false,
				},
			],
		},
	]
}

describe('ML, LLM Weights & Dataset Checkpoint Vault Auditor', () => {
	test('normalizeModelStem & extractModelWorkspace correlate FP16 safetensors, GGUF Q4_K_M/Q8_0, step-*, and configs', () => {
		const { normalizeModelStem, extractModelWorkspace, classifyMlCheckpointFile } = loadMlCheckpointModule()

		assert.equal(normalizeModelStem('llama-3-8b-fp16.safetensors'), 'llama-3-8b')
		assert.equal(normalizeModelStem('llama-3-8b-Q4_K_M.gguf'), 'llama-3-8b')
		assert.equal(normalizeModelStem('tokenizer.json', '/ML-Vault/Models/llama-3-8b/best/tokenizer.json'), 'llama-3-8b')
		assert.equal(extractModelWorkspace('model.ckpt', '/ML-Vault/Models/llama-3-8b/checkpoints/step-1000/model.ckpt'), 'llama-3-8b')

		const bestWeight = classifyMlCheckpointFile({ path: '/ML-Vault/Models/llama-3-8b/best/model.safetensors' })
		assert.equal(bestWeight.family, 'best-final-weights-configs')
		assert.equal(bestWeight.isBestOrFinalWeight, true)
		assert.equal(bestWeight.isFp16SafetensorsMaster, true)

		const tok = classifyMlCheckpointFile({ path: '/ML-Vault/Models/llama-3-8b/best/tokenizer.json' })
		assert.equal(tok.family, 'best-final-weights-configs')
		assert.equal(tok.isTokenizerOrConfig, true)

		const gguf = classifyMlCheckpointFile({ path: '/ML-Vault/GGUF/llama-3-8b-Q8_0.gguf' })
		assert.equal(gguf.family, 'quantized-gguf-variants')
		assert.equal(gguf.isQuantizedGguf, true)
		assert.equal(gguf.quantTag, 'Q8_0')

		const stepCkpt = classifyMlCheckpointFile({ path: '/Models/llama-3-8b/checkpoints/step-2000/model.pt' })
		assert.equal(stepCkpt.family, 'intermediate-step-checkpoints')
		assert.equal(stepCkpt.isIntermediateStepCheckpoint, true)
		assert.equal(stepCkpt.stepNumber, 2000)

		const onnxBest = classifyMlCheckpointFile({ path: '/Models/encoder/final/encoder.onnx' })
		assert.equal(onnxBest.family, 'best-final-weights-configs')
		assert.equal(onnxBest.isBestOrFinalWeight, true)

		const arrowDataset = classifyMlCheckpointFile({ path: '/Datasets/corpus/shard-00.arrow' })
		assert.equal(arrowDataset.family, 'datasets-and-regenerable-caches')
		assert.equal(arrowDataset.isDatasetShard, true)

		const jsonlDataset = classifyMlCheckpointFile({ path: '/Datasets/corpus/sft.jsonl' })
		assert.equal(jsonlDataset.family, 'datasets-and-regenerable-caches')
		assert.equal(jsonlDataset.isDatasetShard, true)

		const tfrecordDataset = classifyMlCheckpointFile({ path: '/Datasets/corpus/train.tfrecord' })
		assert.equal(tfrecordDataset.family, 'datasets-and-regenerable-caches')
		assert.equal(tfrecordDataset.isDatasetShard, true)

		const pycache = classifyMlCheckpointFile({ path: '/repo/__pycache__/eval.cpython-311.pyc' })
		assert.equal(pycache.family, 'datasets-and-regenerable-caches')
		assert.equal(pycache.isRegenerableCache, true)

		const unrelated = classifyMlCheckpointFile({ path: '/Photos/vacation/IMG_001.jpg' })
		assert.equal(unrelated, null)
	})

	test('analyzeMlCheckpointVault shields best/final weights and tokenizer/config, links GGUF Q4_K_M to FP16 safetensors, and reclaims step-* and caches', () => {
		const { analyzeMlCheckpointVault } = loadMlCheckpointModule()
		const groups = buildSampleMlCheckpointDuplicates()

		const report = analyzeMlCheckpointVault(groups)
		assert.equal(report.schema, 'duplicatefinder.ml-checkpoint-vault-auditor.v1')
		assert.equal(report.summary.totalClustersCount, 8)
		assert.equal(report.summary.totalBestFinalClusters, 2)
		assert.equal(report.summary.totalTokenizerConfigClusters, 1)
		assert.equal(report.summary.totalGgufQuantClusters, 2)
		assert.equal(report.summary.totalStepCheckpointClusters, 1)
		assert.equal(report.summary.totalDatasetClusters, 1)
		assert.equal(report.summary.totalRegenerableCacheClusters, 2)

		// best/final safetensors cluster must be strictly shielded
		const bestCluster = report.clusters.find(c => c.primaryGroupId === 9701)
		assert.ok(bestCluster)
		assert.equal(bestCluster.reclaimableCopiesCount, 0)
		assert.equal(bestCluster.members[1].verdict, 'blocked-best-final-weights')

		// tokenizer.json / config.json cluster must be strictly shielded
		const tokCluster = report.clusters.find(c => c.primaryGroupId === 9702)
		assert.ok(tokCluster)
		assert.equal(tokCluster.reclaimableCopiesCount, 0)
		assert.equal(tokCluster.members[1].verdict, 'blocked-tokenizer-config')

		// llama-3-8b Q4_K_M GGUF has FP16 safetensors master in vault -> derived twin reclaimable
		const llamaGguf = report.clusters.find(c => c.primaryGroupId === 9703)
		assert.ok(llamaGguf)
		assert.equal(llamaGguf.isDerivedGgufQuantFromFp16, true)
		assert.equal(llamaGguf.reclaimableCopiesCount, 1)
		assert.equal(llamaGguf.members[1].verdict, 'reclaim-quantized-gguf-twin')

		// orphan-mistral-7b Q8_0 GGUF has NO FP16 safetensors master -> blocked
		const orphanGguf = report.clusters.find(c => c.primaryGroupId === 9704)
		assert.ok(orphanGguf)
		assert.equal(orphanGguf.isDerivedGgufQuantFromFp16, false)
		assert.equal(orphanGguf.reclaimableCopiesCount, 0)
		assert.equal(orphanGguf.members[1].verdict, 'blocked-unverified-fp16-master')

		// checkpoints/step-1000 duplicate copy is reclaimable while best/final is conserved
		const stepCluster = report.clusters.find(c => c.primaryGroupId === 9705)
		assert.ok(stepCluster)
		assert.equal(stepCluster.reclaimableCopiesCount, 1)
		assert.equal(stepCluster.members[1].verdict, 'reclaim-intermediate-step-checkpoint')

		// dataset .parquet duplicate copy is reclaimable by default (canonical kept)
		const datasetCluster = report.clusters.find(c => c.primaryGroupId === 9706)
		assert.ok(datasetCluster)
		assert.equal(datasetCluster.reclaimableCopiesCount, 1)
		assert.equal(datasetCluster.members[1].verdict, 'reclaim-dataset-shard-copy')

		// .cache/huggingface + wandb + __pycache__ + lightning_logs are reclaimable
		const hfCache = report.clusters.find(c => c.primaryGroupId === 9707)
		assert.ok(hfCache)
		assert.equal(hfCache.reclaimableCopiesCount, 1)
		assert.equal(hfCache.members[1].verdict, 'reclaim-regenerable-ml-cache')

		const pyCache = report.clusters.find(c => c.primaryGroupId === 9708)
		assert.ok(pyCache)
		assert.equal(pyCache.reclaimableCopiesCount, 1)
		assert.equal(pyCache.members[1].verdict, 'reclaim-regenerable-ml-cache')
	})

	test('strategies, dataset shield, origin protection, and exports (DRY_RUN=1 script, CWE-1236 CSV, JSON, .sync-exclude.lst) work safely', () => {
		const {
			analyzeMlCheckpointVault,
			buildMlCheckpointVaultRemediationScript,
			buildMlCheckpointVaultCsvReport,
			buildMlCheckpointVaultJsonReport,
			buildMlCheckpointVaultSyncExcludeSnippet,
		} = loadMlCheckpointModule()

		const groups = buildSampleMlCheckpointDuplicates()
		groups.push({
			id: 9799,
			hash: 'sha256-cwe-injection',
			size: 1024 * 1024,
			files: [
				{ id: 97991, path: '=HYPERLINK("http://evil")/weights.pth', size: 1024 * 1024, mtime: 1796000000, isInOriginFolder: true },
				{ id: 97992, path: '+cmd|calc/weights.pth', size: 1024 * 1024, mtime: 1796000000, isInOriginFolder: false },
			],
		})

		const shieldedDatasets = analyzeMlCheckpointVault(groups, { protectDatasetShards: true })
		const dsCluster = shieldedDatasets.clusters.find(c => c.primaryGroupId === 9706)
		assert.equal(dsCluster.reclaimableCopiesCount, 0)
		assert.equal(dsCluster.members[1].verdict, 'blocked-dataset-shard')

		const hardlinkReport = analyzeMlCheckpointVault(groups, { strategy: 'consolidate-vault-hardlinks' })
		assert.ok(hardlinkReport.summary.totalConsolidatableCopiesCount > 0)

		const defaultReport = analyzeMlCheckpointVault(groups)
		const script = buildMlCheckpointVaultRemediationScript(defaultReport, { dataRoot: '/srv/nc/data' })
		assert.match(script, /^#!\/usr\/bin\/env sh/)
		assert.match(script, /DRY_RUN="\$\{DRY_RUN:-1\}"/)
		assert.match(script, /run_cmd rm -f/)
		assert.match(script, /occ files:scan --all/)

		const hardlinkScript = buildMlCheckpointVaultRemediationScript(hardlinkReport, { dataRoot: '/srv/nc/data' })
		assert.match(hardlinkScript, /run_cmd ln -f/)

		const csv = buildMlCheckpointVaultCsvReport(defaultReport)
		assert.match(csv, /ModelWorkspace,ModelStem,DuplicationClass/)
		assert.doesNotMatch(csv, /(?:^|,)=HYPERLINK/m)
		assert.match(csv, /'=HYPERLINK|'\+cmd/)

		const json = JSON.parse(buildMlCheckpointVaultJsonReport(defaultReport))
		assert.equal(json.schema, 'duplicatefinder.ml-checkpoint-vault-auditor.v1')
		assert.ok(Array.isArray(json.clusters))

		const syncExclude = buildMlCheckpointVaultSyncExcludeSnippet(defaultReport)
		assert.match(syncExclude, /__pycache__\//)
		assert.match(syncExclude, /\.cache\/huggingface\//)
		assert.match(syncExclude, /wandb\//)
		assert.match(syncExclude, /lightning_logs\//)
		assert.match(syncExclude, /checkpoints\/step-\*\//)
	})

	test('MlCheckpointVaultWorkbench renders empty and populated states, switches presets/filters, and triggers exports', async () => {
		const copiedPayloads = []
		const MlCheckpointVaultWorkbench = loadMlCheckpointWorkbench({
			writeText: async text => {
				copiedPayloads.push(text)
			},
		})

		const emptyNode = document.createElement('div')
		document.body.appendChild(emptyNode)
		let startScanCount = 0
		const emptyVm = new Vue({
			render: h => h(MlCheckpointVaultWorkbench, {
				props: { duplicates: [], allDuplicates: [] },
				on: { 'start-scan': () => { startScanCount += 1 } },
			}),
		}).$mount(emptyNode)
		try {
			await settle()
			assert.ok(emptyVm.$el.querySelector('.mcvw__empty-banner'))
			emptyVm.$el.querySelector('.mcvw__primary-btn').click()
			await settle()
			assert.equal(startScanCount, 1)
		} finally {
			emptyVm.$destroy()
			emptyNode.remove()
		}

		const groups = buildSampleMlCheckpointDuplicates()
		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue({
			render: h => h(MlCheckpointVaultWorkbench, {
				props: { duplicates: groups, allDuplicates: groups, currentDuplicateId: 9703 },
			}),
		}).$mount(mountNode)
		try {
			await settle()
			assert.equal(vm.$el.querySelectorAll('.mcvw__cluster-card').length, 8)
			assert.ok(vm.$el.textContent.includes('llama-3-8b-Q4_K_M.gguf'))

			// Click preset "Prune __pycache__, HF Hub, wandb & Lightning"
			const presetBtns = Array.from(vm.$el.querySelectorAll('.mcvw__seg-btn'))
			const cachePresetBtn = presetBtns.find(b => b.textContent.includes('Prune __pycache__, HF Hub, wandb & Lightning'))
			assert.ok(cachePresetBtn)
			cachePresetBtn.click()
			await settle()
			assert.equal(vm.$el.querySelectorAll('.mcvw__cluster-card').length, 3)

			// Copy DRY_RUN=1 script
			const copyScriptBtn = Array.from(vm.$el.querySelectorAll('.mcvw__tool-btn')).find(b => b.textContent.includes('Copy DRY_RUN=1 Script'))
			assert.ok(copyScriptBtn)
			copyScriptBtn.click()
			await settle()
			assert.equal(copiedPayloads.length, 1)
			assert.match(copiedPayloads[0], /DRY_RUN=/)
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('App.vue renders ML & LLM Vault topbar button and toggles MlCheckpointVaultWorkbench with F2', async () => {
		const slotBox = tag => ({
			render(h) {
				return h(tag, this.$slots.default)
			},
		})
		const MlCheckpointVaultWorkbench = loadMlCheckpointWorkbench()
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		const statsModule = loadModule('src/tools/duplicateStats.js')
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})

		const stub = name => ({
			name,
			props: ['duplicate', 'projectId', 'show', 'isScanning'],
			render(h) {
				return h('div', { class: `stub-${name}` })
			},
		})
		const icon = slotBox('span')

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
			'./components/DuplicateCompareView.vue': { __esModule: true, default: stub('compare') },
			'./components/DuplicateTreemap.vue': { __esModule: true, default: stub('treemap') },
			'./components/SpaceReclamationTimeline.vue': { __esModule: true, default: stub('history') },
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
			'./components/DocumentLineageWorkbench.vue': { __esModule: true, default: stub('lineage') },
			'./components/PhotoPerceptualWorkbench.vue': { __esModule: true, default: stub('perceptual') },
			'./components/BrokenMediaQuarantineWorkbench.vue': { __esModule: true, default: stub('quarantine') },
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
			'./components/PhotoGradingVaultWorkbench.vue': { __esModule: true, default: stub('photo-grading-vault-auditor') },
			'./components/MlCheckpointVaultWorkbench.vue': { __esModule: true, default: MlCheckpointVaultWorkbench },
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
			'./components/NeuroscienceElectrophysVaultWorkbench.vue': { __esModule: true, default: stub('neuroscience-electrophys-vault-auditor') },
			'./components/OrbitalSpacecraftVaultWorkbench.vue': { __esModule: true, default: stub('orbital-spacecraft-vault-auditor') },
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
					entities: type === 'unacknowledged' ? buildSampleMlCheckpointDuplicates() : [],
					pagination: { currentPage: 1, totalPages: 1, totalItems: 8, hasMore: false },
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

			assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'F2', shiftKey: false }), 'toggle-ml-checkpoint-vault-auditor')
			assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'F2', ctrlKey: true }), null)
			assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'F2', target: { tagName: 'INPUT' } }), null)

			const btn = vm.$el.querySelector('button.topbar-ml-checkpoint-vault-button')
			assert.ok(btn, 'ML & LLM Vault button is rendered in topbar')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'F2')
			assert.equal(vm.$el.querySelector('.ml-checkpoint-vault-workbench'), null)

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F2', bubbles: true, cancelable: true }))
			await settle()
			assert.ok(vm.$el.querySelector('.ml-checkpoint-vault-workbench'), 'MlCheckpointVaultWorkbench must open on F2 shortcut')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F2', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.$el.querySelector('.ml-checkpoint-vault-workbench'), null, 'MlCheckpointVaultWorkbench must toggle closed on F2 shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new Machine Learning, LLM Weights & Dataset Checkpoint Vault files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/mlCheckpointVaultAuditor.js',
			'src/components/MlCheckpointVaultWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
		]
		for (const rel of files) {
			const content = readFileSync(resolve(root, rel), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(content), false, `No U+2013/U+2014 in ${rel}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `No XSS sink in ${rel}`)
		}
	})
})
