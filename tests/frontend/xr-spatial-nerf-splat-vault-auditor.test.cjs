const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window, document } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

const slotBox = tag => ({
	render(h) {
		return h(tag, this.$slots.default)
	},
})

function loadXrSpatialNerfSplatAuditor() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/xrSpatialNerfSplatVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function loadXrSpatialNerfSplatVaultWorkbench(clipboardOverrides = {}) {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const auditor = loadModule('src/tools/xrSpatialNerfSplatVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
	return loadComponent('src/components/XrSpatialNerfSplatVaultWorkbench.vue', {
		'../tools/clipboardHelper': {
			copyTextSafely: async () => true,
			...clipboardOverrides,
		},
		'../tools/duplicateStats': duplicateStats,
		'../tools/xrSpatialNerfSplatVaultAuditor': auditor,
	})
}

function buildSampleXrSpatialDuplicates(referenceNowMs = Date.UTC(2026, 10, 25, 12, 0, 0)) {
	const oldMtime = Math.floor((referenceNowMs - 45 * 24 * 60 * 60 * 1000) / 1000)
	const recentMtime = Math.floor((referenceNowMs - 2 * 24 * 60 * 60 * 1000) / 1000)

	return [
		{
			id: 22401,
			hash: 'xr-hash-openxr-calib-baseline',
			files: [
				{
					id: 1,
					nodeId: 1,
					path: '/xr_vault/00_openxr/headset_rig_04/headset_rig_04_ipd_calib.oxr',
					size: 320 * 1024,
					mtime: oldMtime,
				},
				{
					id: 2,
					nodeId: 2,
					path: '/xr_vault/mirror/headset_rig_04_ipd_calib.oxr',
					size: 320 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 22402,
			hash: 'xr-hash-safety-hold',
			files: [
				{
					id: 3,
					nodeId: 3,
					path: '/xr_vault/safety_hold/xr_hold/optics_sar_audit_lot09.xrhold',
					size: 512 * 1024,
					mtime: oldMtime,
				},
				{
					id: 4,
					nodeId: 4,
					path: '/xr_vault/mirror/xr_hold/optics_sar_audit_lot09.xrhold',
					size: 512 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 22403,
			hash: 'xr-hash-3dgs-splat-master',
			files: [
				{
					id: 5,
					nodeId: 5,
					path: '/xr_vault/00_splat/atrium_lobby_scan/atrium_lobby_scan_3dgs.splat',
					size: 480 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 6,
					nodeId: 6,
					path: '/xr_vault/nas_mirror/atrium_lobby_scan/atrium_lobby_scan_3dgs.splat',
					size: 480 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 22404,
			hash: 'xr-hash-volcap-vpcc-master',
			files: [
				{
					id: 7,
					nodeId: 7,
					path: '/xr_vault/00_volcap/stage_take_12/stage_take_12_actor.vpcc',
					size: 640 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 8,
					nodeId: 8,
					path: '/xr_vault/backup/stage_take_12/stage_take_12_actor.vpcc',
					size: 640 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 22405,
			hash: 'xr-hash-redundant-preview-anchored',
			files: [
				{
					id: 9,
					nodeId: 9,
					path: '/xr_vault/turntable_renders/atrium_lobby_scan_3dgs_turntable.mp4',
					size: 64 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 10,
					nodeId: 10,
					path: '/xr_vault/webxr_lods/atrium_lobby_scan_3dgs_turntable.mp4',
					size: 64 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 22406,
			hash: 'xr-hash-unanchored-webxr-lod',
			files: [
				{
					id: 11,
					nodeId: 11,
					path: '/xr_vault/webxr_lods/orphan_courtyard_88_webxr_lod.glb',
					size: 24 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 12,
					nodeId: 12,
					path: '/xr_vault/splat_previews/orphan_courtyard_88_webxr_lod.glb',
					size: 24 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 22407,
			hash: 'xr-hash-old-nerf-scratch',
			files: [
				{
					id: 13,
					nodeId: 13,
					path: '/xr_vault/nerfstudio_cache/atrium_lobby_scan_buf.splat.tmp',
					size: 140 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 14,
					nodeId: 14,
					path: '/xr_vault/gsplat_raster_tmp/atrium_lobby_scan_buf.splat.tmp',
					size: 140 * 1024 * 1024,
					mtime: oldMtime,
				},
			],
		},
		{
			id: 22408,
			hash: 'xr-hash-recent-colmap-scratch',
			files: [
				{
					id: 15,
					nodeId: 15,
					path: '/xr_vault/colmap_feature_cache/stage_take_12_run.colmap.idx',
					size: 48 * 1024 * 1024,
					mtime: recentMtime,
				},
				{
					id: 16,
					nodeId: 16,
					path: '/xr_vault/openxr_runtime_logs/stage_take_12_run.colmap.idx',
					size: 48 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 22409,
			hash: 'xr-hash-non-domain-excluded',
			files: [
				{
					id: 17,
					nodeId: 17,
					path: '/winery_vault/00_cellar/tank_08_merlot/tank_08_merlot_curve.ferm',
					size: 8 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 18,
					nodeId: 18,
					path: '/vet_vault/00_vetpacs/equine_carpus_12_series.vetdcm',
					size: 8 * 1024 * 1024,
					mtime: oldMtime,
				},
			],
		},
	]
}

describe('Cycle 224: XR Spatial Computing, Photorealistic NeRF/Gaussian Splatting & Volumetric Video Vault Auditor', () => {
	test('classifyXrSpatialNerfSplatFile classifies all 4 vault families and excludes non-domain files', () => {
		const {
			classifyXrSpatialNerfSplatFile,
			extractXrSpatialNerfSplatStem,
			extractXrSpatialNerfSplatAnchorKey,
		} = loadXrSpatialNerfSplatAuditor()

		const oxr = classifyXrSpatialNerfSplatFile({ path: '/xr_vault/00_openxr/headset_rig_04_ipd_calib.oxr', size: 1024 })
		assert.equal(oxr.family, 'xr-spatial-calibration-holds')
		assert.equal(oxr.isProtectedSpatialCalibration, true)
		assert.equal(oxr.isMutableFile, true)

		const hold = classifyXrSpatialNerfSplatFile({ path: '/xr_vault/safety_hold/xr_hold/optics_sar_audit_lot09.xrhold', size: 2048 })
		assert.equal(hold.family, 'xr-spatial-calibration-holds')
		assert.equal(hold.isProtectedSafetyHold, true)
		assert.equal(hold.xrTag, 'XR SAFETY HOLD')

		const splatMaster = classifyXrSpatialNerfSplatFile({ path: '/xr_vault/00_splat/atrium_lobby_scan_3dgs.splat', size: 4096 })
		assert.equal(splatMaster.family, 'xr-nerf-splat-volumetric-masters')
		assert.equal(splatMaster.isProtectedNerfSplatMaster, true)
		assert.equal(splatMaster.isMutableFile, false)

		const vpccMaster = classifyXrSpatialNerfSplatFile({ path: '/xr_vault/00_volcap/stage_take_12_actor.vpcc', size: 4096 })
		assert.equal(vpccMaster.family, 'xr-nerf-splat-volumetric-masters')
		assert.equal(vpccMaster.isProtectedNerfSplatMaster, true)
		assert.equal(vpccMaster.isMutableFile, false)

		const previewExport = classifyXrSpatialNerfSplatFile({ path: '/xr_vault/turntable_renders/atrium_lobby_scan_3dgs_turntable.mp4', size: 4096 })
		assert.equal(previewExport.family, 'redundant-xr-preview-exports')
		assert.equal(previewExport.isRedundantXrExport, true)

		const scratch = classifyXrSpatialNerfSplatFile({ path: '/xr_vault/nerfstudio_cache/atrium_lobby_scan_buf.splat.tmp', size: 4096 })
		assert.equal(scratch.family, 'xr-runtime-training-scratch')
		assert.equal(scratch.isScratchPath, true)

		const excludedWine = classifyXrSpatialNerfSplatFile({ path: '/winery_vault/00_cellar/tank_08_merlot_curve.ferm', size: 4096 })
		assert.equal(excludedWine.family, null)

		const excludedVet = classifyXrSpatialNerfSplatFile({ path: '/vet_vault/00_vetpacs/equine_carpus_12_series.vetdcm', size: 4096 })
		assert.equal(excludedVet.family, null)

		assert.equal(extractXrSpatialNerfSplatStem('atrium_lobby_scan_3dgs_turntable.mp4'), 'atrium_lobby_scan_3dgs')
		assert.equal(extractXrSpatialNerfSplatAnchorKey('atrium_lobby_scan_3dgs'), 'atrium-lobby-scan-3dgs')
	})

	test('auditXrSpatialNerfSplatVault protects OpenXR/USDZ, safety holds, and NeRF/3DGS masters while enforcing anchor guard and grace window', () => {
		const { auditXrSpatialNerfSplatVault } = loadXrSpatialNerfSplatAuditor()
		const nowMs = Date.UTC(2026, 10, 25, 12, 0, 0)
		const groups = buildSampleXrSpatialDuplicates(nowMs)

		const report = auditXrSpatialNerfSplatVault(groups, {}, nowMs)
		assert.equal(report.summary.totalDomainGroupsCount, 8)
		assert.equal(report.summary.totalClustersCount, 8)
		assert.equal(report.summary.totalCalibrationClusters, 1)
		assert.equal(report.summary.totalNerfSplatMasterClusters, 2)
		assert.equal(report.summary.totalSafetyHoldClusters, 1)

		const oxrCluster = report.clusters.find(c => c.id === 22401)
		assert.equal(oxrCluster.reclaimableBytes, 0)
		assert.equal(oxrCluster.clusterVerdict, 'xr-spatial-calibration-protected')

		const holdCluster = report.clusters.find(c => c.id === 22402)
		assert.equal(holdCluster.reclaimableBytes, 0)
		assert.equal(holdCluster.clusterVerdict, 'xr-safety-hold-protected')

		const anchoredPreview = report.clusters.find(c => c.id === 22405)
		assert.equal(anchoredPreview.hasXrMasterAnchor, true)
		assert.equal(anchoredPreview.clusterVerdict, 'xr-preview-redundant')
		assert.equal(anchoredPreview.reclaimableBytes, 2 * 64 * 1024 * 1024)

		const unanchoredPreview = report.clusters.find(c => c.id === 22406)
		assert.equal(unanchoredPreview.hasXrMasterAnchor, false)
		assert.equal(unanchoredPreview.reclaimableBytes, 0)
		assert.equal(unanchoredPreview.clusterVerdict, 'shielded')

		const unguardedReport = auditXrSpatialNerfSplatVault(groups, { requireXrMasterAnchorForPrune: false }, nowMs)
		const unanchoredUnguarded = unguardedReport.clusters.find(c => c.id === 22406)
		assert.equal(unanchoredUnguarded.reclaimableBytes, 24 * 1024 * 1024)

		const graceReport = auditXrSpatialNerfSplatVault(groups, { keepRecentRunDays: 14 }, nowMs)
		const recentScratch = graceReport.clusters.find(c => c.id === 22408)
		assert.equal(recentScratch.reclaimableBytes, 0)
		assert.equal(recentScratch.clusterVerdict, 'shielded')
		const oldScratch = graceReport.clusters.find(c => c.id === 22407)
		assert.equal(oldScratch.reclaimableBytes, 140 * 1024 * 1024)
	})

	test('hardlink strategy never hardlinks mutable OpenXR/USDZ/preview/scratch and generates safe POSIX script, CWE-1236 CSV, JSON, and sync-exclude', () => {
		const {
			auditXrSpatialNerfSplatVault,
			buildXrSpatialNerfSplatCsvReport,
			buildXrSpatialNerfSplatJsonManifest,
			buildXrSpatialNerfSplatRemediationScript,
			buildXrSpatialNerfSplatSyncExcludeList,
		} = loadXrSpatialNerfSplatAuditor()

		const nowMs = Date.UTC(2026, 10, 25, 12, 0, 0)
		const groups = buildSampleXrSpatialDuplicates(nowMs)
		groups.push({
			id: 22499,
			hash: 'xr-hash-formula-injection',
			files: [
				{
					id: 99,
					nodeId: 99,
					path: '=cmd|\' /C calc\'!A0/nerfstudio_cache/run_tmp.splat.tmp',
					size: 1024,
					mtime: Math.floor((nowMs - 30 * 24 * 60 * 60 * 1000) / 1000),
				},
				{
					id: 100,
					nodeId: 100,
					path: '/xr_vault/colmap_feature_cache/normal_run_tmp.colmap.idx',
					size: 1024,
					mtime: Math.floor((nowMs - 30 * 24 * 60 * 60 * 1000) / 1000),
				},
			],
		})

		const hardlinkAudit = auditXrSpatialNerfSplatVault(groups, {
			strategy: 'hardlink-immutable-xr-masters',
			protectNerfSplatVolumetricMasters: false,
			protectSpatialCalibrationAndSafetyHolds: false,
		}, nowMs)

		const splatCluster = hardlinkAudit.clusters.find(c => c.id === 22403)
		assert.equal(splatCluster.hardlinkTargetsCount, 1)
		assert.equal(splatCluster.deleteTargetsCount, 0)

		const oxrCluster = hardlinkAudit.clusters.find(c => c.id === 22401)
		assert.equal(oxrCluster.hardlinkTargetsCount, 0)
		assert.equal(oxrCluster.deleteTargetsCount, 1)

		const script = buildXrSpatialNerfSplatRemediationScript(hardlinkAudit)
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes('run_cmd ln -f'))
		assert.ok(!script.includes('optics_sar_audit_lot09.xrhold'))

		const csv = buildXrSpatialNerfSplatCsvReport(hardlinkAudit)
		assert.ok(csv.includes('xr_toolchain'))
		assert.ok(csv.includes("'=cmd|"))

		const manifest = JSON.parse(buildXrSpatialNerfSplatJsonManifest(hardlinkAudit))
		assert.equal(manifest.schema, 'duplicatefinder.xr-spatial-nerf-splat-vault-auditor.v1')
		assert.ok(Array.isArray(manifest.clusters))

		const syncExclude = buildXrSpatialNerfSplatSyncExcludeList()
		assert.ok(syncExclude.includes('nerfstudio_cache/'))
		assert.ok(syncExclude.includes('colmap_feature_cache/'))
		assert.ok(syncExclude.includes('*.splat.tmp'))
		assert.ok(syncExclude.includes('*.colmap.idx'))
	})

	test('XrSpatialNerfSplatVaultWorkbench renders interactive controls, switches presets, preserves numeric input mid-keystroke, and copies script', async () => {
		const Workbench = loadXrSpatialNerfSplatVaultWorkbench()
		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const samples = buildSampleXrSpatialDuplicates()
		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: samples,
					allDuplicates: samples,
				},
			}),
		}).$mount(mountNode)

		try {
			await settle()
			const rootEl = vm.$el
			assert.ok(rootEl.classList.contains('xr-spatial-nerf-splat-vault-workbench'))
			assert.equal(rootEl.querySelectorAll('.xns__cluster-card').length, 8)

			const presetBtns = Array.from(rootEl.querySelectorAll('.xns__seg-btn'))
			const scratchPresetBtn = presetBtns.find(btn => btn.textContent.includes('Training & Runtime Scratch'))
			assert.ok(scratchPresetBtn)
			scratchPresetBtn.click()
			await settle()

			const wbVm = vm.$children[0]
			assert.equal(wbVm.presetId, 'xr-runtime-scratch-cleanup')
			assert.equal(wbVm.keepRecentRunDaysInput, '14')

			const numInputs = rootEl.querySelectorAll('input.xns__num-input')
			numInputs[0].value = ''
			numInputs[0].dispatchEvent(new window.Event('input'))
			await settle()
			assert.equal(wbVm.keepRecentRunDaysInput, '')
			assert.equal(wbVm.parsedKeepRecentRunDays, 0)

			const searchInput = rootEl.querySelector('input[type="search"]')
			searchInput.value = 'atrium_lobby_scan'
			searchInput.dispatchEvent(new window.Event('input'))
			await settle()
			assert.equal(rootEl.querySelectorAll('.xns__cluster-card').length, 3)

			const copyBtn = Array.from(rootEl.querySelectorAll('button')).find(b => b.textContent.includes('Copy DRY_RUN=1 Script'))
			assert.ok(copyBtn)
			copyBtn.click()
			await settle()
			assert.ok(rootEl.querySelector('.xns__notice').textContent.includes('Copied DRY_RUN=1'))
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('App.vue integrates XrSpatialNerfSplatVaultWorkbench with topbar button and Alt+Shift+X shortcut', async () => {
		window.localStorage.clear()
		const Workbench = loadXrSpatialNerfSplatVaultWorkbench()
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		const icon = slotBox('span')
		const SearchBar = loadComponent('src/components/SearchBar.vue', {
			'vue-material-design-icons/ChevronDown': icon,
		})
		const NcAppNavigationItemStub = {
			props: ['name', 'title', 'allowCollapse', 'open', 'active'],
			render(h) {
				return h('div', { class: ['nc-nav-item', { 'is-open': Boolean(this.open) }] }, [
					h('button', {
						attrs: { type: 'button' },
						on: { click: event => this.$emit('click', event) },
					}, this.name),
					this.$slots.default,
				])
			},
		}
		const DuplicateListItem = loadComponent('src/components/DuplicateListItem.vue', {
			'@nextcloud/vue': { NcAppNavigationItem: NcAppNavigationItemStub },
			'@/tools/duplicateStats': loadModule('src/tools/duplicateStats.js'),
			'@/tools/utils': utils,
		})
		const DuplicateNavigation = loadComponent('src/components/DuplicateNavigation.vue', {
			'@nextcloud/vue': {
				NcAppNavigation: {
					render(h) {
						return h('nav', this.$scopedSlots.list ? this.$scopedSlots.list() : this.$slots.default)
					},
				},
				NcAppNavigationItem: NcAppNavigationItemStub,
				NcButton: slotBox('button'),
			},
			'./DuplicateListItem.vue': { __esModule: true, default: DuplicateListItem },
			'./SearchBar.vue': { __esModule: true, default: SearchBar },
			'vue-material-design-icons/CloseCircle': icon,
			'vue-material-design-icons/CheckCircle': icon,
			'vue-material-design-icons/Cog': icon,
			'vue-material-design-icons/Delete': icon,
			'vue-material-design-icons/HelpCircle': icon,
			'vue-material-design-icons/School': icon,
			'vue-material-design-icons/PlayCircle': icon,
			'vue-material-design-icons/FrequentlyAskedQuestions': icon,
			'vue-material-design-icons/FolderMultiple': icon,
			'vue-material-design-icons/FolderCog': icon,
			'vue-material-design-icons/Folder': icon,
			'@/tools/api': {
				fetchDuplicates: async () => ({ entities: [], pagination: { currentPage: 1, totalPages: 1 } }),
			},
			'@/tools/utils': utils,
			'@/tools/duplicateFilters': loadModule('src/tools/duplicateFilters.js'),
			'@/tools/duplicatePreferences': loadModule('src/tools/duplicatePreferences.js'),
			'@/tools/duplicateSelectionAndExport': loadModule('src/tools/duplicateSelectionAndExport.js'),
			'@/tools/duplicateSortHelper': loadModule('src/tools/duplicateSortHelper.js'),
			'@/tools/duplicateStats': loadModule('src/tools/duplicateStats.js'),
		})
		const stub = name => ({
			name,
			props: ['duplicate', 'projectId', 'show', 'isScanning'],
			render(h) {
				return h('div', { class: `stub-${name}` })
			},
		})
		const statsModule = loadModule('src/tools/duplicateStats.js')
		const treemapModule = loadModule('src/tools/duplicateTreemap.js', {
			'./duplicateFilters': loadModule('src/tools/duplicateFilters.js'),
			'./duplicatePathDiff': loadModule('src/tools/duplicatePathDiff.js'),
			'./duplicateStats': statsModule,
		})
		const DuplicateTreemap = loadComponent('src/components/DuplicateTreemap.vue', {
			'../tools/duplicateStats': statsModule,
			'../tools/duplicateTreemap': treemapModule,
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
			'./components/DuplicateNavigation.vue': { __esModule: true, default: DuplicateNavigation },
			'./components/DuplicateDetails.vue': { __esModule: true, default: stub('duplicate-details') },
			'./components/DuplicateTreemap.vue': { __esModule: true, default: DuplicateTreemap },
			'./components/SpaceReclamationTimeline.vue': { __esModule: true, default: stub('space-reclamation-timeline') },
			'./components/SimilarityInspector.vue': { __esModule: true, default: stub('similarity-inspector') },
			'./components/BatchAutoSelectWorkbench.vue': { __esModule: true, default: stub('batch-auto-select') },
			'./components/FileHygieneInspector.vue': { __esModule: true, default: stub('file-hygiene') },
			'./components/LinkDeduplicationSimulator.vue': { __esModule: true, default: stub('link-simulator') },
			'./components/FolderPairMatrix.vue': { __esModule: true, default: stub('folder-matrix') },
			'./components/StorageFootprintAnalyzer.vue': { __esModule: true, default: stub('storage-footprint') },
			'./components/PhotoBurstTimeline.vue': { __esModule: true, default: stub('photo-bursts') },
			'./components/RecoverySafetyWorkbench.vue': { __esModule: true, default: stub('recovery-safety') },
			'./components/ArchivePayloadInspector.vue': { __esModule: true, default: stub('archive-inspector') },
			'./components/AudioTagWorkbench.vue': { __esModule: true, default: stub('audio-workbench') },
			'./components/VideoSceneWorkbench.vue': { __esModule: true, default: stub('video-workbench') },
			'./components/SidecarSweepWorkbench.vue': { __esModule: true, default: stub('sidecar-sweep') },
			'./components/RuleProfilesWorkbench.vue': { __esModule: true, default: stub('rule-profiles') },
			'./components/DocumentLineageWorkbench.vue': { __esModule: true, default: stub('document-lineage') },
			'./components/PhotoPerceptualWorkbench.vue': { __esModule: true, default: stub('photo-perceptual') },
			'./components/BrokenMediaQuarantineWorkbench.vue': { __esModule: true, default: stub('broken-media') },
			'./components/RetentionAgeWorkbench.vue': { __esModule: true, default: stub('retention-age') },
			'./components/FilenameCollisionWorkbench.vue': { __esModule: true, default: stub('filename-collision') },
			'./components/QuotaAttributionWorkbench.vue': { __esModule: true, default: stub('quota-attribution') },
			'./components/PreviewCacheWorkbench.vue': { __esModule: true, default: stub('preview-cache') },
			'./components/ShareMountAuditorWorkbench.vue': { __esModule: true, default: stub('share-mount-auditor') },
			'./components/BackupDriftWorkbench.vue': { __esModule: true, default: stub('backup-drift') },
			'./components/AutomationRulebookWorkbench.vue': { __esModule: true, default: stub('automation-rulebook') },
			'./components/MetadataConsolidationWorkbench.vue': { __esModule: true, default: stub('metadata-consolidation') },
			'./components/ForensicVerifierWorkbench.vue': { __esModule: true, default: stub('forensic-verifier') },
			'./components/InodeSafetyWorkbench.vue': { __esModule: true, default: stub('inode-safety') },
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
			'./components/MaterialsMicroscopyVaultWorkbench.vue': { __esModule: true, default: stub('materials-microscopy-vault-auditor') },
			'./components/LidarPhotogrammetryVaultWorkbench.vue': { __esModule: true, default: stub('lidar-photogrammetry-vault-auditor') },
			'./components/MocapBiomechanicsVaultWorkbench.vue': { __esModule: true, default: stub('mocap-biomechanics-vault-auditor') },
			'./components/NeuroscienceElectrophysVaultWorkbench.vue': { __esModule: true, default: stub('neuroscience-electrophys-vault-auditor') },
			'./components/OrbitalSpacecraftVaultWorkbench.vue': { __esModule: true, default: stub('orbital-spacecraft-vault-auditor') },
			'./components/ParticlePhysicsHepVaultWorkbench.vue': { __esModule: true, default: stub('particle-physics-hep-vault-auditor') },
			'./components/QuantumQubitPulseVaultWorkbench.vue': { __esModule: true, default: stub('quantum-qubit-pulse-vault-auditor') },
			'./components/RailwaySignalingTelemetryVaultWorkbench.vue': { __esModule: true, default: stub('railway-signaling-telemetry-vault-auditor') },
			'./components/SpeechAsrBioacousticsVaultWorkbench.vue': { __esModule: true, default: stub('speech-asr-bioacoustics-vault-auditor') },
			'./components/TrafficItsV2xVaultWorkbench.vue': { __esModule: true, default: stub('traffic-its-v2x-vault-auditor') },
			'./components/UrbanWaterUtilityPipelineVaultWorkbench.vue': { __esModule: true, default: stub('urban-water-utility-pipeline-vault-auditor') },
			'./components/VeterinaryEquineGenomicsVaultWorkbench.vue': { __esModule: true, default: stub('veterinary-equine-genomics-vault-auditor') },
			'./components/WineEnologyHaccpVaultWorkbench.vue': { __esModule: true, default: stub('wine-enology-haccp-vault-auditor') },
			'./components/XrSpatialNerfSplatVaultWorkbench.vue': { __esModule: true, default: Workbench },
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
					entities: type === 'unacknowledged' ? buildSampleXrSpatialDuplicates() : [],
					pagination: { currentPage: 1, totalPages: 1, totalItems: 9, hasMore: false },
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
			const btn = vm.$el.querySelector('.topbar-xr-spatial-nerf-splat-vault-button')
			assert.ok(btn, 'Topbar XR & NeRF/3DGS button must render')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'Alt+Shift+X')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'X', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.xrSpatialNerfSplatVaultOpen, true)
			assert.ok(vm.$el.querySelector('.xr-spatial-nerf-splat-vault-workbench'), 'XrSpatialNerfSplatVaultWorkbench must open on Alt+Shift+X shortcut')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'X', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.xrSpatialNerfSplatVaultOpen, false)
			assert.equal(vm.$el.querySelector('.xr-spatial-nerf-splat-vault-workbench'), null, 'XrSpatialNerfSplatVaultWorkbench must toggle closed on Alt+Shift+X shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new XR Spatial Computing, NeRF/3DGS & Volumetric Video Vault files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/xrSpatialNerfSplatVaultAuditor.js',
			'src/components/XrSpatialNerfSplatVaultWorkbench.vue',
			'tests/frontend/xr-spatial-nerf-splat-vault-auditor.test.cjs',
			'tests/Vue/XrSpatialNerfSplatVaultWorkbenchTest.php',
		]
		for (const rel of files) {
			const content = readFileSync(resolve(root, rel), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(content), false, `No U+2013/U+2014 in ${rel}`)
			if (rel.startsWith('src/')) {
				assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `No XSS sink in ${rel}`)
			}
		}
	})
})
