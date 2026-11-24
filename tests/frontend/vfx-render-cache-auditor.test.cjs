const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window } = require('./helpers.cjs')

function loadVfxRenderModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/vfxRenderCacheAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function loadVfxRenderWorkbench(clipboardImpl) {
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js')
	const vfxRenderCacheAuditor = loadVfxRenderModule()
	return loadComponent('src/components/VfxRenderCacheWorkbench.vue', {
		'../tools/clipboardHelper': clipboardImpl === undefined
			? clipboardHelper
			: { copyTextSafely: text => clipboardHelper.copyTextSafely(text, clipboardImpl) },
		'../tools/vfxRenderCacheAuditor': vfxRenderCacheAuditor,
	})
}

function buildSampleVfxRenderDuplicates() {
	const mib = 1024 * 1024
	const refSec = 1796000000
	return [
		{
			id: 9501,
			hash: 'sha256-vfx-master-shot-scene',
			size: 240 * mib,
			acknowledged: false,
			files: [
				{
					id: 95011,
					path: '/__groupfolders/31/Master-Shot/SH010_HeroMech_v12.blend',
					size: 240 * mib,
					mtime: refSec - 10 * 86400,
				},
				{
					id: 95012,
					path: '/alice/files/Final/SH010_HeroMech_v12.blend',
					size: 240 * mib,
					mtime: refSec - 10 * 86400,
				},
				{
					id: 95013,
					path: '/alice/files/Downloads/SH010_HeroMech_v12.blend',
					size: 240 * mib,
					mtime: refSec - 3 * 86400,
				},
			],
		},
		{
			id: 9502,
			hash: 'sha256-vfx-usd-published-stage',
			size: 95 * mib,
			acknowledged: false,
			files: [
				{
					id: 95021,
					path: '/Studio/USD/HeroMech_Lookdev.usdc',
					size: 95 * mib,
					mtime: refSec - 6 * 86400,
				},
				{
					id: 95022,
					path: '/Studio/Published/HeroMech_Lookdev.usdc',
					size: 95 * mib,
					mtime: refSec - 9 * 86400,
				},
			],
		},
		{
			id: 9503,
			hash: 'sha256-vfx-highres-texture-source',
			size: 128 * mib,
			acknowledged: false,
			files: [
				{
					id: 95031,
					path: '/Studio/Textures/8K/HeroMech_Armor_8K_albedo.exr',
					size: 128 * mib,
					mtime: refSec - 12 * 86400,
				},
				{
					id: 95032,
					path: '/Studio/Archive/Textures/HeroMech_Armor_4K_albedo.png',
					size: 128 * mib,
					mtime: refSec - 15 * 86400,
				},
			],
		},
		{
			id: 9504,
			hash: 'sha256-vfx-mip-downscale-verified',
			size: 16 * mib,
			acknowledged: false,
			files: [
				{
					id: 95041,
					path: '/Studio/Mips/HeroMech_Armor_2K_albedo.tx',
					size: 16 * mib,
					mtime: refSec - 10 * 86400,
				},
				{
					id: 95042,
					path: '/Downloads/HeroMech_Armor_1K_albedo.dds',
					size: 16 * mib,
					mtime: refSec - 9 * 86400,
				},
			],
		},
		{
			id: 9505,
			hash: 'sha256-vfx-mip-orphan-unverified',
			size: 12 * mib,
			acknowledged: false,
			files: [
				{
					id: 95051,
					path: '/Studio/Mips/HeroMech_Armor_2K_normal.ktx2',
					size: 12 * mib,
					mtime: refSec - 20 * 86400,
				},
				{
					id: 95052,
					path: '/Downloads/HeroMech_Armor_512_normal.dds',
					size: 12 * mib,
					mtime: refSec - 18 * 86400,
				},
			],
		},
		{
			id: 9506,
			hash: 'sha256-vfx-sim-bake-cache',
			size: 320 * mib,
			acknowledged: false,
			files: [
				{
					id: 95061,
					path: '/Studio/Shots/SH010/Bake/Explosion_001.vdb',
					size: 320 * mib,
					mtime: refSec - 4 * 86400,
				},
				{
					id: 95062,
					path: '/Studio/Shots/SH010/DerivedDataCache/Explosion_001.bphys',
					size: 320 * mib,
					mtime: refSec - 62 * 86400,
				},
				{
					id: 95063,
					path: '/Studio/Shots/SH010/LightingData/SH010_preview.exr',
					size: 320 * mib,
					mtime: refSec - 75 * 86400,
				},
			],
		},
		{
			id: 9507,
			hash: 'sha256-vfx-autosave-generations',
			size: 48 * mib,
			acknowledged: false,
			files: [
				{
					id: 95071,
					path: '/Studio/Shots/SH010/SH010_HeroMech.blend1',
					size: 48 * mib,
					mtime: refSec - 5 * 86400,
				},
				{
					id: 95072,
					path: '/Studio/Shots/SH010/SH010_HeroMech.blend2',
					size: 48 * mib,
					mtime: refSec - 68 * 86400,
				},
				{
					id: 95073,
					path: '/Studio/Shots/SH010/SH010_HeroMech.c4d.bak',
					size: 48 * mib,
					mtime: refSec - 80 * 86400,
				},
			],
		},
		{
			id: 9508,
			hash: 'sha256-unrelated-assets',
			size: 2 * mib,
			acknowledged: false,
			files: [
				{ id: 95081, path: '/alice/files/Photos/alpine.jpg', size: 2 * mib, mtime: refSec - 3 * 86400 },
				{ id: 95082, path: '/src/utils/numberFormat.js', size: 2 * mib, mtime: refSec - 4 * 86400 },
			],
		},
	]
}

describe('3D VFX Scene, Texture Mip Pyramid, Bake Sim Cache & Autosave Auditor', () => {
	test('classifies all 4 3D/VFX families while ignoring unrelated files', () => {
		const mod = loadVfxRenderModule()

		for (const p of [
			'/Master-Shot/SH010_Hero.blend',
			'/Final/SH010_FX.hip',
			'/Final/SH010_FX.hiplc',
			'/Master-Shot/Rig_Hero.ma',
			'/Master-Shot/Rig_Hero.mb',
			'/Final/Product_Turntable.c4d',
			'/USD/CityBlock.usd',
			'/USD/CityBlock.usda',
			'/USD/CityBlock.usdc',
			'/USD/CityBlock.usdz',
		]) {
			assert.equal(mod.classifyVfxRenderArtifact(p).family, 'vfx-scene-blend-masters', `Expected vfx-scene-blend-masters for ${p}`)
		}

		for (const p of [
			'/Textures/HeroArmor_8K_albedo.exr',
			'/Textures/HeroArmor_4K_normal.png',
			'/Textures/HeroArmor_2K_roughness.tx',
			'/Textures/HeroArmor_1K_albedo.dds',
			'/Textures/HeroArmor_512_roughness.ktx2',
		]) {
			assert.equal(mod.classifyVfxRenderArtifact(p).family, 'texture-mip-pyramids', `Expected texture-mip-pyramids for ${p}`)
		}

		for (const p of [
			'/Shots/SH010/Smoke_001.bphys',
			'/Shots/SH010/Pyro_001.vdb',
			'/Shots/SH010/Pyro_001.vdb.tmp',
			'/Shots/SH010/Cloth_001.abc',
			'/Shots/SH010/Deform_001.pc2',
			'/Shots/SH010/Sim_001.mdd',
			'/Project/DerivedDataCache/Shader_01.bin',
			'/Project/Bake/GI_Map.exr',
			'/Project/LightingData/Lightprobe.asset',
			'/Project/Renders/SH010_preview.exr',
		]) {
			assert.equal(mod.classifyVfxRenderArtifact(p).family, 'sim-bake-frame-caches', `Expected sim-bake-frame-caches for ${p}`)
		}

		for (const p of [
			'/Shots/SH010/Scene.blend1',
			'/Shots/SH010/Scene.blend2',
			'/Shots/SH010/Scene.autosave',
			'/Shots/SH010/Scene.c4d.bak',
			'/Shots/SH010/Scene.ma.swatches',
		]) {
			assert.equal(mod.classifyVfxRenderArtifact(p).family, 'scene-autosave-generations', `Expected scene-autosave-generations for ${p}`)
		}

		assert.equal(mod.classifyVfxRenderArtifact('/alice/files/Photos/alpine.jpg'), null)
		assert.equal(mod.classifyVfxRenderArtifact('/src/utils/numberFormat.js'), null)

		const parsedTex = mod.parseVfxRenderArtifactInfo(
			'HeroMech_Armor_8K_albedo.exr',
			'/Studio/Textures/8K/HeroMech_Armor_8K_albedo.exr'
		)
		assert.equal(parsedTex.assetLineageStem, 'HeroMech_Armor')
		assert.equal(parsedTex.textureChannel, 'albedo')
		assert.ok(parsedTex.artifactTags.includes('8K'))
		assert.ok(parsedTex.artifactTags.includes('albedo'))
	})

	test('protects Master-Shot, Published USD stages, and 4K/8K textures, and blocks downscale deletion without conserved 4K/8K source', () => {
		const mod = loadVfxRenderModule()
		const analysis = mod.analyzeVfxRenderDuplicates(buildSampleVfxRenderDuplicates(), {
			strategy: 'consolidate-shot-master-vault',
			referenceTimeSec: 1796000000,
		})

		assert.equal(analysis.schema, 'duplicatefinder.vfx-render-cache-auditor.v1')
		assert.equal(analysis.summary.totalClustersCount, 7)
		assert.equal(analysis.summary.familyCounts['vfx-scene-blend-masters'], 2)
		assert.equal(analysis.summary.familyCounts['texture-mip-pyramids'], 3)
		assert.equal(analysis.summary.familyCounts['sim-bake-frame-caches'], 1)
		assert.equal(analysis.summary.familyCounts['scene-autosave-generations'], 1)

		const masterCluster = analysis.clusters.find(c => c.primaryGroupId === 9501)
		assert.ok(masterCluster)
		assert.equal(masterCluster.survivor.tier, 'shot-master-vault')
		assert.equal(masterCluster.members.find(m => m.fileId === 95012).verdict, 'blocked-shot-master-vault')
		assert.equal(masterCluster.members.find(m => m.fileId === 95013).verdict, 'consolidate-to-shot-master-vault')

		const usdCluster = analysis.clusters.find(c => c.primaryGroupId === 9502)
		assert.ok(usdCluster)
		assert.equal(usdCluster.survivor.tier, 'published-usd-stage')
		assert.equal(usdCluster.members.find(m => m.fileId === 95022).verdict, 'blocked-published-usd-stage')

		const highresCluster = analysis.clusters.find(c => c.primaryGroupId === 9503)
		assert.ok(highresCluster)
		assert.equal(highresCluster.survivor.tier, 'highres-texture-source')
		assert.equal(highresCluster.members.find(m => m.fileId === 95032).verdict, 'blocked-highres-texture-source')

		const cacheAnalysis = mod.analyzeVfxRenderDuplicates(buildSampleVfxRenderDuplicates(), {
			strategy: 'prune-autosave-bake-caches',
			staleCacheDays: 30,
			referenceTimeSec: 1796000000,
		})
		const simCluster = cacheAnalysis.clusters.find(c => c.primaryGroupId === 9506)
		assert.ok(simCluster)
		assert.equal(simCluster.members.find(m => m.fileId === 95061).verdict, 'keep-canonical-survivor')
		assert.equal(simCluster.members.find(m => m.fileId === 95062).verdict, 'reclaim-autosave-bake-cache')
		assert.equal(simCluster.members.find(m => m.fileId === 95063).verdict, 'reclaim-autosave-bake-cache')

		const autosaveCluster = cacheAnalysis.clusters.find(c => c.primaryGroupId === 9507)
		assert.ok(autosaveCluster)
		assert.equal(autosaveCluster.members.find(m => m.fileId === 95072).verdict, 'reclaim-autosave-bake-cache')
		assert.equal(autosaveCluster.members.find(m => m.fileId === 95073).verdict, 'reclaim-autosave-bake-cache')

		const mipAnalysis = mod.analyzeVfxRenderDuplicates(buildSampleVfxRenderDuplicates(), {
			strategy: 'prune-downscaled-textures-when-source-verified',
			referenceTimeSec: 1796000000,
		})
		const verifiedMip = mipAnalysis.clusters.find(c => c.primaryGroupId === 9504)
		assert.ok(verifiedMip)
		assert.equal(verifiedMip.members.find(m => m.fileId === 95042).verdict, 'reclaim-downscale-mip')

		const unverifiedMip = mipAnalysis.clusters.find(c => c.primaryGroupId === 9505)
		assert.ok(unverifiedMip)
		assert.equal(unverifiedMip.members.find(m => m.fileId === 95052).verdict, 'blocked-unverified-highres-source')

		// Excluding all 4K/8K albedo sources must block pruning HeroMech_Armor albedo downscales
		const excludedSources = mod.analyzeVfxRenderDuplicates(buildSampleVfxRenderDuplicates(), {
			strategy: 'prune-downscaled-textures-when-source-verified',
			referenceTimeSec: 1796000000,
			memberOverrides: {
				95031: 'exclude',
				95032: 'exclude',
			},
		})
		const nowUnverified = excludedSources.clusters.find(c => c.primaryGroupId === 9504)
		assert.equal(nowUnverified.members.find(m => m.fileId === 95042).verdict, 'blocked-unverified-highres-source')
	})

	test('supports overrides, DRY_RUN=1 POSIX script, .sync-exclude.lst, CWE-1236 CSV, and JSON manifest', () => {
		const mod = loadVfxRenderModule()
		const duplicates = [
			...buildSampleVfxRenderDuplicates(),
			{
				id: 9599,
				hash: 'sha256-formula-vfx',
				size: 4096000,
				acknowledged: false,
				files: [
					{ id: 95991, path: '/Master-Shot/=CMD("calc")_SH010.blend', size: 4096000, mtime: 1795000000 },
					{ id: 95992, path: '/Downloads/stray_SH010.blend', size: 4096000, mtime: 1790000000 },
				],
			},
			{
				id: 9598,
				hash: 'sha256-formula-plus-vfx',
				size: 4096000,
				acknowledged: false,
				files: [
					{ id: 95981, path: '/Final/+malicious_Stage.usdc', size: 4096000, mtime: 1795000000 },
					{ id: 95982, path: '/Downloads/stray_Stage.usdc', size: 4096000, mtime: 1790000000 },
				],
			},
		]

		const consolidateAnalysis = mod.analyzeVfxRenderDuplicates(duplicates, {
			strategy: 'consolidate-shot-master-vault',
			referenceTimeSec: 1796000000,
		})
		const masterCluster = consolidateAnalysis.clusters.find(c => c.primaryGroupId === 9501)
		assert.equal(masterCluster.members.find(m => m.fileId === 95013).verdict, 'consolidate-to-shot-master-vault')
		assert.equal(masterCluster.members.find(m => m.fileId === 95013).actionKind, 'consolidate')

		const script = mod.buildVfxRenderScript(consolidateAnalysis, { dataRoot: '/srv/nc/data' })
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes('sha256sum --'))
		assert.ok(script.includes('stat -c %d'))
		assert.ok(script.includes('consolidate_shot_master_copy'))
		assert.ok(script.includes('occ files:scan --path='))

		const overrideAnalysis = mod.analyzeVfxRenderDuplicates(buildSampleVfxRenderDuplicates(), {
			strategy: 'prune-autosave-bake-caches',
			staleCacheDays: 30,
			memberOverrides: {
				95062: 'force-keep',
				95063: 'exclude',
			},
			referenceTimeSec: 1796000000,
		})
		const simOverridden = overrideAnalysis.clusters.find(c => c.primaryGroupId === 9506)
		assert.equal(simOverridden.members.find(m => m.fileId === 95062).verdict, 'blocked-manual-shield')
		assert.equal(simOverridden.members.find(m => m.fileId === 95063).verdict, 'excluded')

		const syncExclude = mod.buildVfxRenderSyncExcludeSnippet(consolidateAnalysis)
		for (const pattern of ['*.blend1', '*.blend2', 'DerivedDataCache/', '*.bphys', '*.vdb.tmp']) {
			assert.ok(syncExclude.includes(pattern), `Expected .sync-exclude.lst pattern ${pattern}`)
		}

		const csv = mod.buildVfxRenderCsvReport(consolidateAnalysis)
		assert.ok(csv.includes('"\'=CMD(""calc"")_SH010.blend"') || csv.includes("'=CMD"))
		assert.ok(csv.includes("'+malicious_Stage.usdc"))

		const json = JSON.parse(mod.buildVfxRenderJsonReport(consolidateAnalysis, '2026-11-24T06:50:00Z'))
		assert.equal(json.schema, 'duplicatefinder.vfx-render-cache-auditor.v1')
		assert.equal(json.generatedAt, '2026-11-24T06:50:00Z')
		assert.ok(Array.isArray(json.clusters))
	})

	test('renders VfxRenderCacheWorkbench empty, filter-empty, populated, and interactive states without clamping numeric inputs', async () => {
		let copied = ''
		const Workbench = loadVfxRenderWorkbench({
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
		assert.ok(emptyVm.$el.querySelector('.vrcw__empty-banner'))
		emptyVm.$destroy()

		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: buildSampleVfxRenderDuplicates(),
					allDuplicates: buildSampleVfxRenderDuplicates(),
					currentDuplicateId: 9501,
				},
			}),
		}).$mount()
		await settle()

		assert.equal(vm.$el.querySelectorAll('.vrcw__cluster-item').length, 7)
		assert.ok(vm.$el.textContent.includes('SH010_HeroMech_v12.blend'))

		const numInputs = vm.$el.querySelectorAll('.vrcw__num-input')
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
		assert.ok(vm.$el.querySelector('.vrcw__notice.is-success'))

		const searchInput = vm.$el.querySelector('input[type="search"]')
		searchInput.value = 'no-such-vfx-asset-xyz'
		searchInput.dispatchEvent(new window.Event('input'))
		await settle()
		assert.ok(vm.$el.querySelector('.vrcw__empty-banner'))

		const resetBtn = Array.from(vm.$el.querySelectorAll('button')).find(b => b.textContent.includes('Reset Filters'))
		resetBtn.click()
		await settle()
		assert.equal(vm.$el.querySelectorAll('.vrcw__cluster-item').length, 7)

		vm.$destroy()
	})

	test('integrates 3D & VFX Cache button and Shift+D keyboard shortcut in App.vue', async () => {
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
		const VfxWorkbench = loadVfxRenderWorkbench({ writeText: async () => {} })

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
			'./components/VfxRenderCacheWorkbench.vue': { __esModule: true, default: VfxWorkbench },
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
					entities: status === 'acknowledged' ? [] : buildSampleVfxRenderDuplicates(),
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

		const topbarBtn = vm.$el.querySelector('.topbar-vfx-render-cache-button')
		assert.ok(topbarBtn, 'Topbar 3D & VFX Cache button must exist')

		const action = keyboardShortcuts.resolveShortcutAction({ key: 'D', shiftKey: true, target: vm.$el })
		assert.equal(action, 'toggle-vfx-render-cache-auditor')
		assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'd', shiftKey: false, target: vm.$el }), 'toggle-folder-matrix')

		topbarBtn.click()
		await settle()
		assert.ok(vm.$el.querySelector('.vfx-render-workbench'), 'VfxRenderCacheWorkbench must mount on click')

		window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'D', shiftKey: true, bubbles: true }))
		await settle()
		assert.equal(vm.$el.querySelector('.vfx-render-workbench'), null, 'VfxRenderCacheWorkbench must toggle closed on Shift+D shortcut')

		vm.$destroy()
	})

	test('keeps zero U+2013/U+2014 typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/vfxRenderCacheAuditor.js',
			'src/components/VfxRenderCacheWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
		]
		for (const relPath of files) {
			const content = readFileSync(resolve(__dirname, '../..', relPath), 'utf8')
			assert.equal(content.includes('\u2013'), false, `Unexpected U+2013 in ${relPath}`)
			assert.equal(content.includes('\u2014'), false, `Unexpected U+2014 in ${relPath}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `Unexpected XSS sink in ${relPath}`)
		}
		const vueContent = readFileSync(resolve(__dirname, '../..', 'src/components/VfxRenderCacheWorkbench.vue'), 'utf8')
		assert.ok(vueContent.includes('min-block-size: 44px'))
		assert.ok(vueContent.includes(':focus-visible'))
	})
})
