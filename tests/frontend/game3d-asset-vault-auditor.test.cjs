const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window } = require('./helpers.cjs')

function loadGame3dModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/game3dAssetVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function loadGame3dWorkbench(clipboardImpl) {
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js')
	const game3dAssetVaultAuditor = loadGame3dModule()
	return loadComponent('src/components/Game3dAssetVaultWorkbench.vue', {
		'../tools/clipboardHelper': clipboardImpl === undefined
			? clipboardHelper
			: { copyTextSafely: text => clipboardHelper.copyTextSafely(text, clipboardImpl) },
		'../tools/game3dAssetVaultAuditor': game3dAssetVaultAuditor,
	})
}

function buildSampleGame3dDuplicates() {
	const mib = 1024 * 1024
	const refSec = 1796000000
	return [
		{
			id: 9801,
			hash: 'sha256-hero-character-blend-master',
			size: 512 * mib,
			acknowledged: false,
			files: [
				{
					id: 98011,
					path: '/__groupfolders/12/vault/scenes/hero_rig.blend',
					size: 512 * mib,
					mtime: refSec - 15 * 86400,
				},
				{
					id: 98012,
					path: '/production/scenes/hero_rig.blend',
					size: 512 * mib,
					mtime: refSec - 20 * 86400,
				},
				{
					id: 98013,
					path: '/alice/files/Downloads/hero_rig.blend',
					size: 512 * mib,
					mtime: refSec - 4 * 86400,
				},
			],
		},
		{
			id: 9802,
			hash: 'sha256-benchy-3mf-master',
			size: 24 * mib,
			acknowledged: false,
			files: [
				{
					id: 98021,
					path: '/vault/models/benchy_v2.3mf',
					size: 24 * mib,
					mtime: refSec - 18 * 86400,
				},
				{
					id: 98022,
					path: '/Downloads/benchy_v2.3mf',
					size: 24 * mib,
					mtime: refSec - 5 * 86400,
				},
			],
		},
		{
			id: 9803,
			hash: 'sha256-brick-wall-albedo-4k-master',
			size: 64 * mib,
			acknowledged: false,
			files: [
				{
					id: 98031,
					path: '/vault/textures/brick_wall_albedo_4k.png',
					size: 64 * mib,
					mtime: refSec - 16 * 86400,
				},
				{
					id: 98032,
					path: '/production/textures/brick_wall_albedo_4k.png',
					size: 64 * mib,
					mtime: refSec - 22 * 86400,
				},
				{
					id: 98033,
					path: '/alice/files/Downloads/brick_wall_albedo_4k.png',
					size: 64 * mib,
					mtime: refSec - 3 * 86400,
				},
			],
		},
		{
			id: 9804,
			hash: 'sha256-brick-wall-albedo-1k-verified-downscale',
			size: 8 * mib,
			acknowledged: false,
			files: [
				{
					id: 98041,
					path: '/vault/textures/brick_wall_albedo_1k.webp',
					size: 8 * mib,
					mtime: refSec - 12 * 86400,
				},
				{
					id: 98042,
					path: '/alice/files/Downloads/brick_wall_albedo_1k.webp',
					size: 8 * mib,
					mtime: refSec - 2 * 86400,
				},
			],
		},
		{
			id: 9805,
			hash: 'sha256-orphan-cobble-normal-2k-unverified',
			size: 16 * mib,
			acknowledged: false,
			files: [
				{
					id: 98051,
					path: '/Textures/cobble_normal_2k.tga',
					size: 16 * mib,
					mtime: refSec - 18 * 86400,
				},
				{
					id: 98052,
					path: '/Downloads/cobble_normal_2k.tga',
					size: 16 * mib,
					mtime: refSec - 6 * 86400,
				},
			],
		},
		{
			id: 9806,
			hash: 'sha256-hero-rig-blender-backups-verified',
			size: 510 * mib,
			acknowledged: false,
			files: [
				{
					id: 98061,
					path: '/vault/scenes/hero_rig.blend1',
					size: 510 * mib,
					mtime: refSec - 3 * 86400,
				},
				{
					id: 98062,
					path: '/vault/scenes/hero_rig.blend2',
					size: 510 * mib,
					mtime: refSec - 20 * 86400,
				},
				{
					id: 98063,
					path: '/vault/scenes/autosave_hero_rig.blend',
					size: 510 * mib,
					mtime: refSec - 35 * 86400,
				},
			],
		},
		{
			id: 9807,
			hash: 'sha256-orphan-mech-gcode-unverified',
			size: 40 * mib,
			acknowledged: false,
			files: [
				{
					id: 98071,
					path: '/Slicer/orphan_mech.gcode',
					size: 40 * mib,
					mtime: refSec - 25 * 86400,
				},
				{
					id: 98072,
					path: '/Downloads/orphan_mech.gcode',
					size: 40 * mib,
					mtime: refSec - 28 * 86400,
				},
			],
		},
		{
			id: 9808,
			hash: 'sha256-benchy-gcode-verified',
			size: 12 * mib,
			acknowledged: false,
			files: [
				{
					id: 98081,
					path: '/Slicer/benchy_v2.gcode',
					size: 12 * mib,
					mtime: refSec - 20 * 86400,
				},
				{
					id: 98082,
					path: '/Slicer/archive/benchy_v2.bgcode',
					size: 12 * mib,
					mtime: refSec - 32 * 86400,
				},
			],
		},
		{
			id: 9809,
			hash: 'sha256-engine-derived-shader-caches',
			size: 320 * mib,
			acknowledged: false,
			files: [
				{
					id: 98091,
					path: '/UnityProject/Library/ArtifactDB/artifact.db',
					size: 320 * mib,
					mtime: refSec - 2 * 86400,
				},
				{
					id: 98092,
					path: '/UnityProject/Library/ShaderCache/EditorOnly/shader.bin',
					size: 320 * mib,
					mtime: refSec - 21 * 86400,
				},
				{
					id: 98093,
					path: '/UnrealProject/DerivedDataCache/Boot.ddc',
					size: 320 * mib,
					mtime: refSec - 30 * 86400,
				},
				{
					id: 98094,
					path: '/UnrealProject/Intermediate/Build/Win64/shader_cache_dx12.bin',
					size: 320 * mib,
					mtime: refSec - 40 * 86400,
				},
			],
		},
		{
			id: 9810,
			hash: 'sha256-unrelated-files',
			size: 4 * mib,
			acknowledged: false,
			files: [
				{ id: 98101, path: '/alice/files/Photos/alpine.jpg', size: 4 * mib, mtime: refSec - 3 * 86400 },
				{ id: 98102, path: '/Documents/StandardContract.pdf', size: 4 * mib, mtime: refSec - 4 * 86400 },
			],
		},
	]
}

describe('Game Engine, Blender Backup & 3D PBR Texture Vault Auditor', () => {
	test('classifies all 4 Game/Blender/PBR families while ignoring unrelated files', () => {
		const mod = loadGame3dModule()

		for (const p of [
			'/vault/scenes/hero.blend',
			'/games/MyGame/MyGame.uproject',
			'/games/MyGame/Scenes/Main.unity',
			'/assets/meshes/knight.fbx',
			'/assets/meshes/knight.glb',
			'/assets/meshes/knight.gltf',
			'/assets/ar/chair.usdz',
			'/print/gearbox.3mf',
		]) {
			assert.equal(mod.classifyGame3dAsset(p).family, '3d-scene-and-mesh-masters', `Expected 3d-scene-and-mesh-masters for ${p}`)
		}

		for (const p of [
			'/scenes/hero.blend1',
			'/scenes/hero.blend2',
			'/scenes/hero.blend3',
			'/scenes/autosave_hero.blend',
			'/slicer/gearbox.gcode',
			'/slicer/gearbox.bgcode',
		]) {
			assert.equal(mod.classifyGame3dAsset(p).family, 'blender-and-slicer-backups', `Expected blender-and-slicer-backups for ${p}`)
		}

		for (const p of [
			'/textures/brick_albedo_8k.png',
			'/textures/brick_basecolor_4k.tga',
			'/textures/brick_normal_2k.ktx2',
			'/textures/brick_roughness_1k.dds',
			'/textures/brick_orm_1k.webp',
		]) {
			assert.equal(mod.classifyGame3dAsset(p).family, 'pbr-texture-resolution-pyramids', `Expected pbr-texture-resolution-pyramids for ${p}`)
		}

		for (const p of [
			'/UnityGame/Library/ArtifactDB/data.db',
			'/UnityGame/Library/ShaderCache/cache.bin',
			'/UnityGame/Temp/StagingArea/tmp.dat',
			'/UnrealGame/DerivedDataCache/DDC.pak',
			'/UnrealGame/Intermediate/Build/obj.o',
			'/UnrealGame/Saved/Autosaves/Map_Auto1.umap',
			'/Blender/Cache/cloth.meshcache',
			'/ShaderBin/shader_cache_vulkan.bin',
		]) {
			assert.equal(mod.classifyGame3dAsset(p).family, 'engine-derived-shader-caches', `Expected engine-derived-shader-caches for ${p}`)
		}

		assert.equal(mod.classifyGame3dAsset('/alice/files/Photos/alpine.jpg'), null)
		assert.equal(mod.classifyGame3dAsset('/Documents/StandardContract.pdf'), null)
		assert.equal(mod.classifyGame3dAsset('/Screenshots/ui_preview.png'), null)

		const pbrMaster = mod.parseGame3dAssetInfo('brick_wall_albedo_4k.png', '/vault/textures/brick_wall_albedo_4k.png')
		const pbrDown = mod.parseGame3dAssetInfo('brick_wall_albedo_1k.webp', '/Downloads/brick_wall_albedo_1k.webp')
		assert.equal(pbrMaster.pbrMaterialStem, 'brick_wall')
		assert.equal(pbrDown.pbrMaterialStem, 'brick_wall')
		assert.equal(pbrMaster.pbrChannel, 'albedo')
		assert.equal(pbrDown.pbrChannel, 'albedo')
		assert.equal(pbrMaster.isMasterPbr4kOr8k, true)
		assert.equal(pbrDown.isPbrDownscale, true)
	})

	test('protects 3D scene and 4K/8K PBR masters, blocks unverified downscales/gcode/backups, and executes all 3 strategies', () => {
		const mod = loadGame3dModule()
		const analysis = mod.analyzeGame3dAssetVaultDuplicates(buildSampleGame3dDuplicates(), {
			strategy: 'consolidate-pbr-texture-downscales',
			staleCacheDays: 14,
			keepRecentBackups: 1,
			referenceTimeSec: 1796000000,
		})

		assert.equal(analysis.schema, 'duplicatefinder.game3d-asset-vault-auditor.v1')
		assert.equal(analysis.summary.totalClustersCount, 9)
		assert.equal(analysis.summary.familyCounts['3d-scene-and-mesh-masters'], 2)
		assert.equal(analysis.summary.familyCounts['pbr-texture-resolution-pyramids'], 3)
		assert.equal(analysis.summary.familyCounts['blender-and-slicer-backups'], 3)
		assert.equal(analysis.summary.familyCounts['engine-derived-shader-caches'], 1)

		const sceneCluster = analysis.clusters.find(c => c.primaryGroupId === 9801)
		assert.ok(sceneCluster)
		assert.equal(sceneCluster.survivor.fileId, 98011)
		assert.equal(sceneCluster.members.find(m => m.fileId === 98012).verdict, 'blocked-scene-master')
		assert.equal(sceneCluster.members.find(m => m.fileId === 98013).verdict, 'consolidate-to-vault-master')

		const pbrMasterCluster = analysis.clusters.find(c => c.primaryGroupId === 9803)
		assert.ok(pbrMasterCluster)
		assert.equal(pbrMasterCluster.members.find(m => m.fileId === 98032).verdict, 'blocked-pbr-master-4k-8k')
		assert.equal(pbrMasterCluster.members.find(m => m.fileId === 98033).verdict, 'consolidate-to-vault-master')

		const verifiedDownscale = analysis.clusters.find(c => c.primaryGroupId === 9804)
		assert.ok(verifiedDownscale)
		assert.equal(verifiedDownscale.members.find(m => m.fileId === 98042).verdict, 'consolidate-pbr-downscale')

		const unverifiedDownscale = analysis.clusters.find(c => c.primaryGroupId === 9805)
		assert.ok(unverifiedDownscale)
		assert.equal(unverifiedDownscale.members.find(m => m.fileId === 98052).verdict, 'blocked-unverified-scene-master')

		const unverifiedGcode = analysis.clusters.find(c => c.primaryGroupId === 9807)
		assert.ok(unverifiedGcode)
		assert.equal(unverifiedGcode.members.find(m => m.fileId === 98072).verdict, 'blocked-unverified-scene-master')

		const verifiedGcode = analysis.clusters.find(c => c.primaryGroupId === 9808)
		assert.ok(verifiedGcode)
		assert.equal(verifiedGcode.members.find(m => m.fileId === 98082).verdict, 'reclaim-blender-slicer-backup')

		const excludedMasterAnalysis = mod.analyzeGame3dAssetVaultDuplicates(buildSampleGame3dDuplicates(), {
			strategy: 'consolidate-pbr-texture-downscales',
			referenceTimeSec: 1796000000,
			memberOverrides: {
				98031: 'exclude',
				98032: 'exclude',
				98021: 'exclude',
			},
		})
		assert.equal(
			excludedMasterAnalysis.clusters.find(c => c.primaryGroupId === 9804).members.find(m => m.fileId === 98042).verdict,
			'blocked-unverified-scene-master'
		)
		assert.equal(
			excludedMasterAnalysis.clusters.find(c => c.primaryGroupId === 9808).members.find(m => m.fileId === 98082).verdict,
			'blocked-unverified-scene-master'
		)

		const backupAnalysis = mod.analyzeGame3dAssetVaultDuplicates(buildSampleGame3dDuplicates(), {
			strategy: 'prune-blender-auto-backups',
			keepRecentBackups: 1,
			staleCacheDays: 14,
			referenceTimeSec: 1796000000,
		})
		const heroBackup = backupAnalysis.clusters.find(c => c.primaryGroupId === 9806)
		assert.ok(heroBackup)
		assert.equal(heroBackup.members.find(m => m.fileId === 98061).verdict, 'keep-canonical-survivor')
		assert.equal(heroBackup.members.find(m => m.fileId === 98062).verdict, 'reclaim-blender-slicer-backup')
		assert.equal(heroBackup.members.find(m => m.fileId === 98063).verdict, 'reclaim-blender-slicer-backup')

		const cacheAnalysis = mod.analyzeGame3dAssetVaultDuplicates(buildSampleGame3dDuplicates(), {
			strategy: 'prune-engine-derived-caches',
			staleCacheDays: 14,
			referenceTimeSec: 1796000000,
		})
		const cacheCluster = cacheAnalysis.clusters.find(c => c.primaryGroupId === 9809)
		assert.ok(cacheCluster)
		assert.equal(cacheCluster.members.find(m => m.fileId === 98091).verdict, 'keep-canonical-survivor')
		assert.equal(cacheCluster.members.find(m => m.fileId === 98092).verdict, 'reclaim-engine-derived-cache')
		assert.equal(cacheCluster.members.find(m => m.fileId === 98093).verdict, 'reclaim-engine-derived-cache')
		assert.equal(cacheCluster.members.find(m => m.fileId === 98094).verdict, 'reclaim-engine-derived-cache')
	})

	test('supports operator overrides, DRY_RUN=1 POSIX script, .sync-exclude.lst, CWE-1236 CSV, and JSON manifest', () => {
		const mod = loadGame3dModule()
		const duplicates = [
			...buildSampleGame3dDuplicates(),
			{
				id: 9899,
				hash: 'sha256-formula-blend',
				size: 1024 * 1024 * 10,
				acknowledged: false,
				files: [
					{ id: 98991, path: '/vault/scenes/=CMD("calc")_scene.blend', size: 10485760, mtime: 1795000000 },
					{ id: 98992, path: '/Downloads/stray_scene.blend', size: 10485760, mtime: 1790000000 },
				],
			},
			{
				id: 9898,
				hash: 'sha256-formula-plus-blend',
				size: 4096,
				acknowledged: false,
				files: [
					{ id: 98981, path: '/vault/scenes/+malicious_scene.blend', size: 4096, mtime: 1795000000 },
					{ id: 98982, path: '/Downloads/stray_plus_scene.blend', size: 4096, mtime: 1790000000 },
				],
			},
		]

		const analysis = mod.analyzeGame3dAssetVaultDuplicates(duplicates, {
			strategy: 'consolidate-pbr-texture-downscales',
			referenceTimeSec: 1796000000,
		})

		const script = mod.buildGame3dAssetVaultScript(analysis, { dataRoot: '/srv/nc/data' })
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes('sha256sum --'))
		assert.ok(script.includes('stat -c %d'))
		assert.ok(script.includes('consolidate_3d_artifact'))
		assert.ok(script.includes('prune_verified_3d_artifact'))
		assert.ok(script.includes('occ files:scan --path='))

		const overrideAnalysis = mod.analyzeGame3dAssetVaultDuplicates(buildSampleGame3dDuplicates(), {
			strategy: 'prune-blender-auto-backups',
			keepRecentBackups: 1,
			staleCacheDays: 14,
			memberOverrides: {
				98062: 'force-keep',
				98063: 'exclude',
			},
			referenceTimeSec: 1796000000,
		})
		const overridden = overrideAnalysis.clusters.find(c => c.primaryGroupId === 9806)
		assert.equal(overridden.members.find(m => m.fileId === 98062).verdict, 'blocked-manual-shield')
		assert.equal(overridden.members.find(m => m.fileId === 98063).verdict, 'excluded')

		const syncExclude = mod.buildGame3dAssetVaultSyncExcludeSnippet(analysis)
		for (const pattern of ['Library/ArtifactDB/', 'Library/ShaderCache/', 'DerivedDataCache/', 'Intermediate/', 'Saved/Autosaves/', '*.blend1', 'autosave_*.blend']) {
			assert.ok(syncExclude.includes(pattern), `Expected .sync-exclude.lst pattern ${pattern}`)
		}

		const csv = mod.buildGame3dAssetVaultCsvReport(analysis)
		assert.ok(csv.includes('"\'=CMD(""calc"")_scene.blend"') || csv.includes("'=CMD"))
		assert.ok(csv.includes("'+malicious_scene.blend"))

		const json = JSON.parse(mod.buildGame3dAssetVaultJsonReport(analysis, '2026-11-24T07:55:00Z'))
		assert.equal(json.schema, 'duplicatefinder.game3d-asset-vault-auditor.v1')
		assert.equal(json.generatedAt, '2026-11-24T07:55:00Z')
		assert.ok(Array.isArray(json.clusters))
	})

	test('renders Game3dAssetVaultWorkbench empty, filter-empty, populated, and interactive states without clamping numeric inputs', async () => {
		let copied = ''
		const Workbench = loadGame3dWorkbench({
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
		assert.ok(emptyVm.$el.querySelector('.g3dv__empty-banner'))
		emptyVm.$destroy()

		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: buildSampleGame3dDuplicates(),
					allDuplicates: buildSampleGame3dDuplicates(),
					currentDuplicateId: 9801,
				},
			}),
		}).$mount()
		await settle()

		assert.equal(vm.$el.querySelectorAll('.g3dv__cluster-item').length, 9)
		assert.ok(vm.$el.textContent.includes('hero_rig.blend'))

		const numInputs = vm.$el.querySelectorAll('.g3dv__num-input')
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
		assert.ok(vm.$el.querySelector('.g3dv__notice.is-success'))

		const searchInput = vm.$el.querySelector('input[type="search"]')
		searchInput.value = 'no-such-3d-asset-xyz'
		searchInput.dispatchEvent(new window.Event('input'))
		await settle()
		assert.ok(vm.$el.querySelector('.g3dv__empty-banner'))

		const resetBtn = Array.from(vm.$el.querySelectorAll('button')).find(b => b.textContent.includes('Reset Filters'))
		resetBtn.click()
		await settle()
		assert.equal(vm.$el.querySelectorAll('.g3dv__cluster-item').length, 9)

		vm.$destroy()
	})

	test('integrates 3D & Game Vault button and Shift+T keyboard shortcut in App.vue', async () => {
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
		const Game3dWorkbench = loadGame3dWorkbench({ writeText: async () => {} })

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
			'./components/Game3dAssetVaultWorkbench.vue': { __esModule: true, default: Game3dWorkbench },
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
					entities: status === 'acknowledged' ? [] : buildSampleGame3dDuplicates(),
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

		const topbarBtn = vm.$el.querySelector('.topbar-game3d-asset-vault-button')
		assert.ok(topbarBtn, 'Topbar 3D & Game Vault button must exist')

		const action = keyboardShortcuts.resolveShortcutAction({ key: 'T', shiftKey: true, target: vm.$el })
		assert.equal(action, 'toggle-game3d-asset-vault-auditor')
		assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 't', shiftKey: false, target: vm.$el }), 'toggle-treemap')

		topbarBtn.click()
		await settle()
		assert.ok(vm.$el.querySelector('.game3d-asset-vault-workbench'), 'Game3dAssetVaultWorkbench must mount on click')

		window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'T', shiftKey: true, bubbles: true }))
		await settle()
		assert.equal(vm.$el.querySelector('.game3d-asset-vault-workbench'), null, 'Game3dAssetVaultWorkbench must toggle closed on Shift+T shortcut')

		vm.$destroy()
	})

	test('keeps zero U+2013/U+2014 typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/game3dAssetVaultAuditor.js',
			'src/components/Game3dAssetVaultWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
		]
		for (const relPath of files) {
			const content = readFileSync(resolve(__dirname, '../..', relPath), 'utf8')
			assert.equal(content.includes('\u2013'), false, `Unexpected U+2013 in ${relPath}`)
			assert.equal(content.includes('\u2014'), false, `Unexpected U+2014 in ${relPath}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `Unexpected XSS sink in ${relPath}`)
		}
		const vueContent = readFileSync(resolve(__dirname, '../..', 'src/components/Game3dAssetVaultWorkbench.vue'), 'utf8')
		assert.ok(vueContent.includes('min-block-size: 44px'))
		assert.ok(vueContent.includes(':focus-visible'))
	})
})
