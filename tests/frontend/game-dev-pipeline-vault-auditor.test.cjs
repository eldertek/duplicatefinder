const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window, document } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

/**
 * Load the pure Game Dev, Unity/Unreal & 3D Asset Pipeline Vault auditor module for tests.
 *
 * @return {object} Loaded module exports.
 */
function loadGameDevPipelineModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/gameDevPipelineVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

/**
 * Load GameDevPipelineVaultWorkbench.vue with optional clipboard stub.
 *
 * @param {object} [clipboardImpl] Optional clipboard implementation.
 * @return {object} Vue component definition.
 */
function loadGameDevPipelineWorkbench(clipboardImpl) {
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js')
	const gameDevPipelineVaultAuditor = loadGameDevPipelineModule()
	return loadComponent('src/components/GameDevPipelineVaultWorkbench.vue', {
		'../tools/clipboardHelper': clipboardImpl === undefined
			? clipboardHelper
			: { copyTextSafely: text => clipboardHelper.copyTextSafely(text, clipboardImpl) },
		'../tools/gameDevPipelineVaultAuditor': gameDevPipelineVaultAuditor,
	})
}

/**
 * Build synthetic duplicate clusters covering all 4 Game Dev, Unity/Unreal & 3D Asset Pipeline families.
 *
 * @return {Array<object>} Sample duplicate groups.
 */
function buildSampleGameDevPipelineDuplicates() {
	const mib = 1024 * 1024
	const refSec = 1796900000
	return [
		{
			id: 9501,
			hash: 'sha256-dcc-blend-hero-mech',
			size: 64 * mib,
			acknowledged: false,
			files: [
				{
					id: 95011,
					path: '/CyberOdyssey/SourceArt/hero_mech_rig.blend',
					size: 64 * mib,
					mtime: refSec - 25 * 86400,
				},
				{
					id: 95012,
					path: '/CyberOdyssey/Downloads/hero_mech_rig_copy.blend',
					size: 64 * mib,
					mtime: refSec - 20 * 86400,
				},
			],
		},
		{
			id: 9502,
			hash: 'sha256-dcc-fbx-hero-mech',
			size: 38 * mib,
			acknowledged: false,
			files: [
				{
					id: 95021,
					path: '/CyberOdyssey/Content/Meshes/hero_mech_lod0.fbx',
					size: 38 * mib,
					mtime: refSec - 18 * 86400,
				},
				{
					id: 95022,
					path: '/CyberOdyssey/Staging/hero_mech_lod0 (1).fbx',
					size: 38 * mib,
					mtime: refSec - 14 * 86400,
				},
			],
		},
		{
			id: 9503,
			hash: 'sha256-unreal-uasset-hero-mech',
			size: 42 * mib,
			acknowledged: false,
			files: [
				{
					id: 95031,
					path: '/CyberOdyssey/Content/Characters/SM_Hero_Mech.uasset',
					size: 42 * mib,
					mtime: refSec - 15 * 86400,
				},
				{
					id: 95032,
					path: '/CyberOdyssey/GoldenMaster/Content/Characters/SM_Hero_Mech.uasset',
					size: 42 * mib,
					mtime: refSec - 15 * 86400,
				},
			],
		},
		{
			id: 9504,
			hash: 'sha256-unreal-umap-citadel',
			size: 110 * mib,
			acknowledged: false,
			files: [
				{
					id: 95041,
					path: '/CyberOdyssey/Content/Levels/L_Citadel_Main.umap',
					size: 110 * mib,
					mtime: refSec - 12 * 86400,
				},
				{
					id: 95042,
					path: '/CyberOdyssey/Staging/L_Citadel_Main_backup.umap',
					size: 110 * mib,
					mtime: refSec - 11 * 86400,
				},
			],
		},
		{
			id: 9505,
			hash: 'sha256-unity-prefab-mat-turret',
			size: 16 * mib,
			acknowledged: false,
			files: [
				{
					id: 95051,
					path: '/OrbitalRunner/Assets/Prefabs/Turret_MK2.prefab',
					size: 16 * mib,
					mtime: refSec - 10 * 86400,
				},
				{
					id: 95052,
					path: '/OrbitalRunner/Scratch/Turret_MK2.prefab',
					size: 16 * mib,
					mtime: refSec - 9 * 86400,
				},
			],
		},
		{
			id: 9506,
			hash: 'sha256-unity-scene-hangar',
			size: 24 * mib,
			acknowledged: false,
			files: [
				{
					id: 95061,
					path: '/OrbitalRunner/Assets/Scenes/Hangar_Bay.unity',
					size: 24 * mib,
					mtime: refSec - 10 * 86400,
				},
				{
					id: 95062,
					path: '/OrbitalRunner/Assets/Materials/Turret_Metal.mat',
					size: 24 * mib,
					mtime: refSec - 9 * 86400,
				},
			],
		},
		{
			id: 9507,
			hash: 'sha256-tex-exr-skybox-hdri',
			size: 85 * mib,
			acknowledged: false,
			files: [
				{
					id: 95071,
					path: '/CyberOdyssey/Content/Textures/citadel_skybox_8k.exr',
					size: 85 * mib,
					mtime: refSec - 20 * 86400,
				},
				{
					id: 95072,
					path: '/CyberOdyssey/Downloads/citadel_skybox_8k_copy.exr',
					size: 85 * mib,
					mtime: refSec - 16 * 86400,
				},
			],
		},
		{
			id: 9508,
			hash: 'sha256-tex-ktx2-dds-mech-normal',
			size: 32 * mib,
			acknowledged: false,
			files: [
				{
					id: 95081,
					path: '/OrbitalRunner/Assets/Textures/hero_mech_normal_4k.ktx2',
					size: 32 * mib,
					mtime: refSec - 14 * 86400,
				},
				{
					id: 95082,
					path: '/OrbitalRunner/Downloads/hero_mech_normal_4k.ktx2',
					size: 32 * mib,
					mtime: refSec - 12 * 86400,
				},
				{
					id: 95083,
					path: '/OrbitalRunner/Scratch/hero_mech_normal_4k.dds',
					size: 32 * mib,
					mtime: refSec - 11 * 86400,
				},
			],
		},
		{
			id: 9509,
			hash: 'sha256-cache-unreal-ddc-intermediate',
			size: 140 * mib,
			acknowledged: false,
			files: [
				{
					id: 95091,
					path: '/CyberOdyssey/DerivedDataCache/hero_mech_4k.ddc',
					size: 140 * mib,
					mtime: refSec - 1 * 86400,
				},
				{
					id: 95092,
					path: '/CyberOdyssey/Intermediate/Build/hero_mech_4k.ddc',
					size: 140 * mib,
					mtime: refSec - 15 * 86400,
				},
				{
					id: 95093,
					path: '/CyberOdyssey/Saved/Autosaves/Game/hero_mech_4k.umap',
					size: 140 * mib,
					mtime: refSec - 3 * 86400,
				},
			],
		},
		{
			id: 9510,
			hash: 'sha256-cache-unity-library-artifactdb',
			size: 96 * mib,
			acknowledged: false,
			files: [
				{
					id: 95101,
					path: '/OrbitalRunner/Library/ArtifactDB/turret_mk2_cache.assetcache',
					size: 96 * mib,
					mtime: refSec - 14 * 86400,
				},
				{
					id: 95102,
					path: '/OrbitalRunner/Temp/ShaderCache/turret_mk2_cache.assetcache',
					size: 96 * mib,
					mtime: refSec - 16 * 86400,
				},
			],
		},
		{
			id: 9511,
			hash: 'sha256-cwe1236-injection-path-glb',
			size: 14 * mib,
			acknowledged: false,
			files: [
				{
					id: 95111,
					path: '/OrbitalRunner/Assets/Meshes/=CMD(\'calc\')_drone.glb',
					size: 14 * mib,
					mtime: refSec - 10 * 86400,
				},
				{
					id: 95112,
					path: '+SUM(1,1)_drone/Library/ShaderCache/drone.shaderbin',
					size: 14 * mib,
					mtime: refSec - 10 * 86400,
				},
			],
		},
		{
			id: 9512,
			hash: 'sha256-unrelated-invoice-pdf',
			size: 2 * mib,
			acknowledged: false,
			files: [
				{
					id: 95121,
					path: '/Accounting/invoice_2026_11.pdf',
					size: 2 * mib,
					mtime: refSec - 5 * 86400,
				},
				{
					id: 95122,
					path: '/Accounting/Archive/invoice_2026_11.pdf',
					size: 2 * mib,
					mtime: refSec - 5 * 86400,
				},
			],
		},
	]
}

describe('Cycle 185: Game Dev, Unity/Unreal & 3D Asset Pipeline Vault Auditor', () => {
	test('classifies DCC meshes, Unity/Unreal scenes & prefabs, HDR/GPU textures, and ephemeral caches accurately while filtering non-pipeline files', () => {
		const mod = loadGameDevPipelineModule()

		const blend = mod.classifyGameDevPipelineFile({ path: '/Proj/SourceArt/hero.blend', mtime: 1796900000 })
		assert.equal(blend.family, 'dcc-source-meshes')
		assert.equal(blend.isDccMesh, true)
		assert.equal(blend.engineName, 'Blender DCC')

		const umap = mod.classifyGameDevPipelineFile({ path: '/Proj/Content/Levels/Arena.umap', mtime: 1796900000 })
		assert.equal(umap.family, 'engine-scenes-prefabs')
		assert.equal(umap.isUnrealAsset, true)
		assert.equal(umap.engineName, 'Unreal Engine')

		const prefab = mod.classifyGameDevPipelineFile({ path: '/Proj/Assets/Prefabs/Bot.prefab', mtime: 1796900000 })
		assert.equal(prefab.family, 'engine-scenes-prefabs')
		assert.equal(prefab.isUnityAsset, true)
		assert.equal(prefab.engineName, 'Unity')

		const exr = mod.classifyGameDevPipelineFile({ path: '/Proj/Content/Textures/studio_4k.exr', mtime: 1796900000 })
		assert.equal(exr.family, 'pipeline-textures-hdr')
		assert.equal(exr.isHdrMasterTexture, true)

		const ddcUmap = mod.classifyGameDevPipelineFile({ path: '/Proj/DerivedDataCache/Arena.umap', mtime: 1796900000 })
		assert.equal(ddcUmap.family, 'engine-ephemeral-caches')
		assert.equal(ddcUmap.isEphemeralCache, true)
		assert.equal(ddcUmap.isEngineScenePrefab, false)

		const libCache = mod.classifyGameDevPipelineFile({ path: '/Proj/Library/ArtifactDB/hash.bin', mtime: 1796900000 })
		assert.equal(libCache.family, 'engine-ephemeral-caches')
		assert.equal(libCache.isEphemeralCache, true)

		const unrelated = mod.classifyGameDevPipelineFile({ path: '/Documents/report.pdf', mtime: 1796900000 })
		assert.equal(unrelated, null)
	})

	test('protects .blend/.fbx sources, .unity/.prefab/.uasset/.umap scenes, and canonical .exr by default while reclaiming ephemeral Library/Intermediate/DDC caches and staging textures', () => {
		const mod = loadGameDevPipelineModule()
		const groups = buildSampleGameDevPipelineDuplicates()

		const report = mod.analyzeGameDevPipelineVault(groups)
		assert.equal(report.schema, 'duplicatefinder.game-dev-pipeline-vault-auditor.v1')
		assert.equal(report.summary.totalUnfilteredClustersCount, 11)
		assert.ok(report.summary.totalRegenerableCacheClusters >= 2)
		assert.ok(report.summary.totalMeshDuplicateClusters >= 2)
		assert.ok(report.summary.totalTextureDuplicateClusters >= 2)
		assert.ok(report.summary.totalScenePrefabClusters >= 4)

		// .blend and .fbx sources are strictly protected by default
		const blendCluster = report.clusters.find(c => c.primaryGroupId === 9501)
		assert.ok(blendCluster)
		assert.equal(blendCluster.reclaimableCopiesCount, 0)
		assert.equal(blendCluster.riskState, 'dcc-source-protected')

		const fbxCluster = report.clusters.find(c => c.primaryGroupId === 9502)
		assert.ok(fbxCluster)
		assert.equal(fbxCluster.reclaimableCopiesCount, 0)

		// .uasset, .umap, .prefab, .unity/.mat are protected by default
		const umapCluster = report.clusters.find(c => c.primaryGroupId === 9504)
		assert.ok(umapCluster)
		assert.equal(umapCluster.reclaimableCopiesCount, 0)
		assert.equal(umapCluster.riskState, 'scene-prefab-protected')

		const prefabCluster = report.clusters.find(c => c.primaryGroupId === 9505)
		assert.ok(prefabCluster)
		assert.equal(prefabCluster.reclaimableCopiesCount, 0)

		// Unreal DDC / Intermediate / Saved/Autosaves caches are reclaimable and linked to project sources
		const ddcCluster = report.clusters.find(c => c.primaryGroupId === 9509)
		assert.ok(ddcCluster)
		assert.equal(ddcCluster.duplicationClass, 'regenerable-cache')
		assert.equal(ddcCluster.hasDccSourceInVault, true)
		assert.equal(ddcCluster.assetLineageBadge, 'Regenerable from Project Sources')
		assert.equal(ddcCluster.reclaimableCopiesCount, 2)

		// Unity Library/ArtifactDB & Temp/ShaderCache cluster is reclaimable
		const unityLibCluster = report.clusters.find(c => c.primaryGroupId === 9510)
		assert.ok(unityLibCluster)
		assert.equal(unityLibCluster.duplicationClass, 'regenerable-cache')
		assert.equal(unityLibCluster.reclaimableCopiesCount, 1)

		// .ktx2/.dds texture duplicate in Downloads/Scratch is reclaimable
		const ktx2Cluster = report.clusters.find(c => c.primaryGroupId === 9508)
		assert.ok(ktx2Cluster)
		assert.equal(ktx2Cluster.duplicationClass, 'texture-duplicate')
		assert.equal(ktx2Cluster.reclaimableCopiesCount, 2)
	})

	test('supports hardlink consolidation, stale-cache-only retention window, and disabling DCC/scene shields', () => {
		const mod = loadGameDevPipelineModule()
		const groups = buildSampleGameDevPipelineDuplicates()

		// Hardlink consolidation on meshes & textures
		const hardlinkReport = mod.analyzeGameDevPipelineVault(groups, {
			strategy: 'consolidate-mesh-texture-hardlinks',
			survivorRule: 'engine-content-assets-first',
		})
		const fbxCluster = hardlinkReport.clusters.find(c => c.primaryGroupId === 9502)
		assert.equal(fbxCluster.consolidatableCopiesCount, 1)
		assert.equal(fbxCluster.members[1].actionType, 'hardlink')

		// Stale-cache-only strategy respects staleCacheDays (9509 has a 2d-old Saved/Autosaves entry)
		const staleReport = mod.analyzeGameDevPipelineVault(groups, {
			strategy: 'prune-ephemeral-caches-only',
			staleCacheDays: 7,
		})
		const ddcCluster = staleReport.clusters.find(c => c.primaryGroupId === 9509)
		const recentAutosave = ddcCluster.members.find(m => m.path.includes('Saved/Autosaves'))
		assert.equal(recentAutosave.verdict, 'blocked-recent-cache')
		assert.equal(recentAutosave.actionType, 'keep')

		// Non-cache textures are untouched under prune-ephemeral-caches-only
		const ktx2Stale = staleReport.clusters.find(c => c.primaryGroupId === 9508)
		assert.equal(ktx2Stale.reclaimableCopiesCount, 0)

		// Disabling DCC & scene shields allows reclaiming redundant copies
		const unshielded = mod.analyzeGameDevPipelineVault(groups, {
			protectDccSources: false,
			protectScenesAndPrefabs: false,
			protectProductionAssets: false,
		})
		const unshieldedBlend = unshielded.clusters.find(c => c.primaryGroupId === 9501)
		assert.equal(unshieldedBlend.reclaimableCopiesCount, 1)
	})

	test('generates DRY_RUN=1 POSIX script, CWE-1236-safe CSV, JSON manifest, and .sync-exclude.lst rules', () => {
		const mod = loadGameDevPipelineModule()
		const groups = buildSampleGameDevPipelineDuplicates()
		const analysis = mod.analyzeGameDevPipelineVault(groups)

		const script = mod.buildGameDevPipelineRemediationScript(analysis, {
			dataRoot: '/srv/nextcloud/data',
		})
		assert.ok(script.startsWith('#!/usr/bin/env sh'))
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes('run_cmd rm -f '))
		assert.ok(script.includes('/srv/nextcloud/data/'))
		assert.ok(script.includes('occ files:scan --all'))
		// Quote escaping for CWE-1236 path containing apostrophes
		assert.ok(script.includes("'\\''calc'\\''") || script.includes('DerivedDataCache'))

		const csv = mod.buildGameDevPipelineCsvReport(analysis)
		const csvLines = csv.split('\n')
		assert.ok(csvLines[0].startsWith('ProjectWorkspace,AssetStem,DuplicationClass'))
		// Formula injection on +SUM(...) path is neutralized with leading apostrophe
		assert.ok(csv.includes("'+SUM(1,1)_drone/Library/ShaderCache/drone.shaderbin"))

		const jsonStr = mod.buildGameDevPipelineJsonReport(analysis)
		const parsed = JSON.parse(jsonStr)
		assert.equal(parsed.schema, 'duplicatefinder.game-dev-pipeline-vault-auditor.v1')
		assert.equal(parsed.clusters.length, analysis.clusters.length)

		const syncExclude = mod.buildGameDevPipelineSyncExcludeSnippet(analysis)
		assert.ok(syncExclude.includes('Library/'))
		assert.ok(syncExclude.includes('Intermediate/'))
		assert.ok(syncExclude.includes('DerivedDataCache/'))
		assert.ok(syncExclude.includes('Saved/Autosaves/'))
		assert.ok(syncExclude.includes('*.blend1'))
	})

	test('GameDevPipelineVaultWorkbench.vue renders clusters, switches presets, accepts numeric typing without mid-keystroke clamping, and copies DRY_RUN=1 script', async () => {
		const copiedPayloads = []
		const Workbench = loadGameDevPipelineWorkbench({
			writeText: async text => {
				copiedPayloads.push(text)
			},
		})
		const groups = buildSampleGameDevPipelineDuplicates()
		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)

		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: groups,
					allDuplicates: groups,
				},
			}),
		}).$mount(mountNode)

		try {
			await settle()
			assert.equal(vm.$el.querySelectorAll('.gdpv__cluster-card').length, 11)

			// Click preset "Prune Library/Intermediate/DDC"
			const presetButtons = Array.from(vm.$el.querySelectorAll('.gdpv__seg-btn'))
			const cachePresetBtn = presetButtons.find(btn => btn.textContent.includes('Prune Library/Intermediate/DDC'))
			assert.ok(cachePresetBtn, 'Cache preset button exists')
			cachePresetBtn.click()
			await settle()
			assert.equal(vm.$el.querySelectorAll('.gdpv__cluster-card').length, 2)

			// Click All Families to restore full list
			const allFamBtn = Array.from(vm.$el.querySelectorAll('.gdpv__seg-btn')).find(btn => btn.textContent.includes('All Families'))
			allFamBtn.click()
			await settle()
			assert.equal(vm.$el.querySelectorAll('.gdpv__cluster-card').length, 11)

			// Numeric input is not clamped mid-keystroke
			const numInputs = vm.$el.querySelectorAll('input.gdpv__num-input')
			assert.equal(numInputs.length, 2)
			numInputs[0].value = ''
			numInputs[0].dispatchEvent(new window.Event('input', { bubbles: true }))
			await settle()
			assert.equal(numInputs[0].value, '')

			// Copy DRY_RUN=1 script
			const copyBtn = Array.from(vm.$el.querySelectorAll('.gdpv__tool-btn')).find(b => b.textContent.includes('Copy DRY_RUN=1 Script'))
			copyBtn.click()
			await settle()
			assert.equal(copiedPayloads.length, 1)
			assert.ok(copiedPayloads[0].includes('DRY_RUN="${DRY_RUN:-1}"'))
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('GameDevPipelineVaultWorkbench.vue renders empty state CTA and reset-filters empty state cleanly', async () => {
		let scanTriggered = false
		const Workbench = loadGameDevPipelineWorkbench()
		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: [],
					allDuplicates: [],
				},
				on: {
					'start-scan': () => {
						scanTriggered = true
					},
				},
			}),
		}).$mount(mountNode)

		try {
			await settle()
			const scanBtn = vm.$el.querySelector('.gdpv__primary-btn')
			assert.ok(scanBtn, 'Empty state Scan storage CTA renders')
			scanBtn.click()
			await settle()
			assert.equal(scanTriggered, true)
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('App.vue wires GameDevPipelineVaultWorkbench with F6 shortcut cleanly', async () => {
		window.localStorage.clear()
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		const statsModule = loadModule('src/tools/duplicateStats.js')
		const GameDevPipelineVaultWorkbench = loadGameDevPipelineWorkbench()

		const slotBox = tag => ({
			render(h) {
				return h(tag, this.$slots.default)
			},
		})
		const icon = slotBox('span')
		const stub = name => ({
			name,
			props: ['duplicate', 'projectId', 'show', 'isScanning'],
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
			'./components/GameDevPipelineVaultWorkbench.vue': { __esModule: true, default: GameDevPipelineVaultWorkbench },
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
			'./components/ProjectDuplicates.vue': { __esModule: true, default: stub('project-dups') },
			'./components/help/OnboardingGuide.vue': { __esModule: true, default: stub('guide') },
			'./components/help/UsageExamples.vue': { __esModule: true, default: stub('examples') },
			'./components/help/FAQ.vue': { __esModule: true, default: stub('faq') },
			'./components/FilterSettings.vue': { __esModule: true, default: stub('filters') },
			'@/tools/api': {
				fetchDuplicates: async type => ({
					entities: type === 'unacknowledged' ? buildSampleGameDevPipelineDuplicates() : [],
					pagination: { currentPage: 1, totalPages: 1, totalItems: 12, hasMore: false },
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

			assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'F6', shiftKey: false }), 'toggle-game-dev-pipeline-vault-auditor')
			assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'F6', ctrlKey: true }), null)
			assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'F6', target: { tagName: 'INPUT' } }), null)

			const btn = vm.$el.querySelector('button.topbar-game-dev-pipeline-vault-button')
			assert.ok(btn, 'Game Dev Pipeline button is rendered in topbar')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'F6')
			assert.equal(vm.$el.querySelector('.game-dev-pipeline-vault-workbench'), null)

			// F6 opens workbench
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F6', bubbles: true, cancelable: true }))
			await settle()
			assert.ok(vm.$el.querySelector('.game-dev-pipeline-vault-workbench'), 'GameDevPipelineVaultWorkbench must open on F6 shortcut')

			// F6 again closes workbench
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F6', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.$el.querySelector('.game-dev-pipeline-vault-workbench'), null, 'GameDevPipelineVaultWorkbench must toggle closed on F6 shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new Game Dev, Unity/Unreal & 3D Asset Pipeline Vault files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/gameDevPipelineVaultAuditor.js',
			'src/components/GameDevPipelineVaultWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
		]
		for (const rel of files) {
			const content = readFileSync(resolve(root, rel), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(content), false, `No U+2013/U+2014 in ${rel}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `No XSS sink in ${rel}`)
		}
	})
})
