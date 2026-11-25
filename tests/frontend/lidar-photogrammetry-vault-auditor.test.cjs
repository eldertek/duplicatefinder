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

function loadLidarPhotogrammetryAuditor() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/lidarPhotogrammetryVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function loadLidarPhotogrammetryVaultWorkbench(clipboardOverrides = {}) {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const auditor = loadModule('src/tools/lidarPhotogrammetryVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
	return loadComponent('src/components/LidarPhotogrammetryVaultWorkbench.vue', {
		'../tools/clipboardHelper': {
			copyTextSafely: async () => true,
			...clipboardOverrides,
		},
		'../tools/duplicateStats': duplicateStats,
		'../tools/lidarPhotogrammetryVaultAuditor': auditor,
	})
}

function buildSampleLidarPhotogrammetryDuplicates(referenceNowMs = Date.UTC(2026, 10, 25, 9, 0, 0)) {
	const oldMtime = Math.floor((referenceNowMs - 40 * 24 * 60 * 60 * 1000) / 1000)
	const recentMtime = Math.floor((referenceNowMs - 2 * 24 * 60 * 60 * 1000) / 1000)

	return [
		{
			id: 21201,
			hash: 'lidar-hash-gcp-targets',
			files: [
				{
					id: 1,
					nodeId: 1,
					path: '/lidar_vault/00_gcp/bridge_corridor_west/bridge_west_2026.gcp',
					size: 32 * 1024,
					mtime: oldMtime,
				},
				{
					id: 2,
					nodeId: 2,
					path: '/lidar_vault/backup/bridge_corridor_west/bridge_west_2026.gcp',
					size: 32 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21202,
			hash: 'lidar-hash-alta-survey-hold',
			files: [
				{
					id: 3,
					nodeId: 3,
					path: '/survey_vault/alta_hold/usgs_3dep_hold/river_basin_tile04.copc.laz',
					size: 640 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 4,
					nodeId: 4,
					path: '/survey_vault/mirror/alta_hold/river_basin_tile04.copc.laz',
					size: 640 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21203,
			hash: 'lidar-hash-raw-e57-tls',
			files: [
				{
					id: 5,
					nodeId: 5,
					path: '/tls_archive/00_tls/cathedral_nave/cathedral_nave_station_01.e57',
					size: 420 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 6,
					nodeId: 6,
					path: '/tls_archive/nas_mirror/cathedral_nave/cathedral_nave_station_01.e57',
					size: 420 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21204,
			hash: 'lidar-hash-metashape-psx',
			files: [
				{
					id: 7,
					nodeId: 7,
					path: '/photogrammetry_vault/00_photogrammetry/quarry_north/quarry_north_uav.psx',
					size: 140 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 8,
					nodeId: 8,
					path: '/photogrammetry_vault/work/quarry_north/quarry_north_uav.psx',
					size: 140 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21205,
			hash: 'lidar-hash-redundant-decimated-mesh-anchored',
			files: [
				{
					id: 9,
					nodeId: 9,
					path: '/tls_archive/exports_mesh/cathedral_nave/cathedral_nave_station_01_decimated.obj',
					size: 72 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 10,
					nodeId: 10,
					path: '/tls_archive/client_preview/cathedral_nave/cathedral_nave_station_01_decimated.obj',
					size: 72 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21206,
			hash: 'lidar-hash-unanchored-ortho-quicklook',
			files: [
				{
					id: 11,
					nodeId: 11,
					path: '/lidar_vault/ortho_previews/unanchored_solar_farm_ortho_preview.png',
					size: 36 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 12,
					nodeId: 12,
					path: '/lidar_vault/deliverable_previews/unanchored_solar_farm_ortho_preview.png',
					size: 36 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21207,
			hash: 'lidar-hash-metashape-scratch-old',
			files: [
				{
					id: 13,
					nodeId: 13,
					path: '/photogrammetry_vault/metashape_tmp/job088/dense_cloud_tile_01.e57.tmp',
					size: 210 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 14,
					nodeId: 14,
					path: '/photogrammetry_vault/agisoft_cache/job088/dense_cloud_tile_01.e57.tmp',
					size: 210 * 1024 * 1024,
					mtime: oldMtime,
				},
			],
		},
		{
			id: 21208,
			hash: 'lidar-hash-potree-scratch-recent',
			files: [
				{
					id: 15,
					nodeId: 15,
					path: '/lidar_vault/potree_cache/run19/tmp_potree_octree_chunk.laz.tmp',
					size: 95 * 1024 * 1024,
					mtime: recentMtime,
				},
				{
					id: 16,
					nodeId: 16,
					path: '/lidar_vault/entwine_tmp/run19/tmp_potree_octree_chunk.laz.tmp',
					size: 95 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21209,
			hash: 'lidar-hash-ppk-rinex-and-boresight',
			files: [
				{
					id: 17,
					nodeId: 17,
					path: '/lidar_vault/00_boresight/wingtra_sony_rx1r2/boresight_leverarm.cam',
					size: 16 * 1024,
					mtime: oldMtime,
				},
				{
					id: 18,
					nodeId: 18,
					path: '/lidar_vault/ppk_gnss/wingtra_sony_rx1r2/base_station_045.obs',
					size: 18 * 1024 * 1024,
					mtime: oldMtime,
				},
			],
		},
		{
			id: 21210,
			hash: 'non-lidar-music-track',
			files: [
				{
					id: 19,
					nodeId: 19,
					path: '/Users/jordan/Music/podcast_episode_12.mp3',
					size: 14 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 20,
					nodeId: 20,
					path: '/Users/jordan/Backup/podcast_episode_12.mp3',
					size: 14 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
	]
}

describe('Cycle 212: LiDAR, UAV Photogrammetry & Terrestrial Laser Scanning Vault Auditor', () => {
	test('classifies GCP/boresight/PPK baselines, ALTA/3DEP survey holds, raw E57/COPC-LAZ/PSX masters, redundant meshes/orthos, and Metashape/Potree scratch while ignoring non-domain files', () => {
		const {
			LIDAR_PHOTOGRAMMETRY_VAULT_SCHEMA,
			auditLidarPhotogrammetryVault,
		} = loadLidarPhotogrammetryAuditor()

		const nowMs = Date.UTC(2026, 10, 25, 9, 0, 0)
		const groups = buildSampleLidarPhotogrammetryDuplicates(nowMs)
		const report = auditLidarPhotogrammetryVault(groups, {}, nowMs)

		assert.equal(report.schema, LIDAR_PHOTOGRAMMETRY_VAULT_SCHEMA)
		assert.equal(report.summary.totalDomainGroupsCount, 9)
		assert.equal(report.clusters.some(c => c.id === 21210), false)

		const gcpCluster = report.clusters.find(c => c.id === 21201)
		assert.equal(gcpCluster.family, 'gcp-calibrations-survey-holds')
		assert.equal(gcpCluster.clusterVerdict, 'gcp-cal-std-protected')
		assert.equal(gcpCluster.reclaimableBytes, 0)
		assert.equal(gcpCluster.members.every(m => m.shielded && m.action === 'keep'), true)

		const holdCluster = report.clusters.find(c => c.id === 21202)
		assert.equal(holdCluster.family, 'gcp-calibrations-survey-holds')
		assert.equal(holdCluster.clusterVerdict, 'survey-hold-protected')
		assert.equal(holdCluster.reclaimableBytes, 0)
		assert.equal(holdCluster.hasProtectedSurveyHold, true)

		const e57Cluster = report.clusters.find(c => c.id === 21203)
		assert.equal(e57Cluster.family, 'raw-lidar-photogrammetry-masters')
		assert.equal(e57Cluster.clusterVerdict, 'raw-lidar-master-protected')
		assert.equal(e57Cluster.lidarToolchain, 'ASTM E57 / LAStools / TerraSolid')
		assert.equal(e57Cluster.reclaimableBytes, 0)

		const psxCluster = report.clusters.find(c => c.id === 21204)
		assert.equal(psxCluster.family, 'raw-lidar-photogrammetry-masters')
		assert.equal(psxCluster.lidarToolchain, 'Agisoft Metashape')
		assert.equal(psxCluster.reclaimableBytes, 0)

		const anchoredMesh = report.clusters.find(c => c.id === 21205)
		assert.equal(anchoredMesh.family, 'redundant-mesh-ortho-exports')
		assert.equal(anchoredMesh.hasLidarMasterAnchor, true)
		assert.equal(anchoredMesh.clusterVerdict, 'lidar-export-redundant')
		assert.equal(anchoredMesh.reclaimableBytes, 144 * 1024 * 1024)
		assert.equal(anchoredMesh.members.every(m => m.action === 'delete'), true)

		const unanchoredOrtho = report.clusters.find(c => c.id === 21206)
		assert.equal(unanchoredOrtho.family, 'redundant-mesh-ortho-exports')
		assert.equal(unanchoredOrtho.hasLidarMasterAnchor, false)
		assert.equal(unanchoredOrtho.reclaimableBytes, 0)
		assert.equal(unanchoredOrtho.members.every(m => m.shielded), true)

		const metashapeScratch = report.clusters.find(c => c.id === 21207)
		assert.equal(metashapeScratch.family, 'photogrammetry-tiling-scratch')
		assert.equal(metashapeScratch.clusterVerdict, 'tiling-scratch-intermediate')
		assert.equal(metashapeScratch.reclaimableBytes, 210 * 1024 * 1024)

		const ppkCal = report.clusters.find(c => c.id === 21209)
		assert.equal(ppkCal.family, 'gcp-calibrations-survey-holds')
		assert.equal(ppkCal.reclaimableBytes, 0)
	})

	test('enforces keepRecentJobDays grace window, hardlink-immutable-e57-laz-and-tls safety, and CWE-1236 / DRY_RUN=1 exports', () => {
		const {
			auditLidarPhotogrammetryVault,
			buildLidarPhotogrammetryCsvReport,
			buildLidarPhotogrammetryJsonManifest,
			buildLidarPhotogrammetryRemediationScript,
			buildLidarPhotogrammetrySyncExcludeList,
		} = loadLidarPhotogrammetryAuditor()

		const nowMs = Date.UTC(2026, 10, 25, 9, 0, 0)
		const groups = buildSampleLidarPhotogrammetryDuplicates(nowMs)

		// With 14-day grace window, recent Potree scratch (2 days old) is shielded while 40-day Metashape scratch is reclaimable
		const graceReport = auditLidarPhotogrammetryVault(groups, { keepRecentJobDays: 14 }, nowMs)
		const recentScratch = graceReport.clusters.find(c => c.id === 21208)
		const oldScratch = graceReport.clusters.find(c => c.id === 21207)
		assert.equal(recentScratch.reclaimableBytes, 0)
		assert.equal(oldScratch.reclaimableBytes, 210 * 1024 * 1024)

		// With hardlink strategy and raw-master shield off, immutable .e57 masters hardlink, while mutable .gcp/.psx/.tmp never hardlink
		const hardlinkReport = auditLidarPhotogrammetryVault(groups, {
			strategy: 'hardlink-immutable-e57-laz-and-tls',
			protectRawLidarPhotogrammetryMasters: false,
			protectGcpAndCalibrationBaselines: false,
			protectSurveyArchiveHolds: true,
		}, nowMs)

		const e57Cluster = hardlinkReport.clusters.find(c => c.id === 21203)
		assert.equal(e57Cluster.members.some(m => m.action === 'hardlink'), true)

		const psxCluster = hardlinkReport.clusters.find(c => c.id === 21204)
		assert.equal(psxCluster.members.some(m => m.action === 'hardlink'), false)

		const gcpCluster = hardlinkReport.clusters.find(c => c.id === 21201)
		assert.equal(gcpCluster.members.some(m => m.action === 'hardlink'), false)

		const script = buildLidarPhotogrammetryRemediationScript(hardlinkReport)
		assert.equal(script.includes('DRY_RUN="${DRY_RUN:-1}"'), true)
		assert.equal(script.includes('run_cmd ln -f'), true)
		assert.equal(script.includes('bridge_west_2026.gcp'), true)
		assert.equal(script.includes('river_basin_tile04.copc.laz'), false)

		// Quarantine strategy moves redundant meshes/orthos and scratch to QUARANTINE_DIR
		const quarantineReport = auditLidarPhotogrammetryVault(groups, {
			strategy: 'quarantine-exports-and-tiling-scratch',
		}, nowMs)
		const quarantineScript = buildLidarPhotogrammetryRemediationScript(quarantineReport)
		assert.equal(quarantineScript.includes('run_cmd mv -n'), true)

		// CWE-1236 formula injection protection in CSV
		const injectionGroup = [
			{
				id: 99998,
				hash: 'lidar-formula-test',
				files: [
					{
						id: 901,
						nodeId: 901,
						path: '/lidar_vault/metashape_tmp/=cmd("calc")_bad.e57.tmp',
						size: 4096,
					},
					{
						id: 902,
						nodeId: 902,
						path: '/lidar_vault/metashape_tmp/normal_job.e57.tmp',
						size: 4096,
					},
				],
			},
		]
		const injReport = auditLidarPhotogrammetryVault(injectionGroup, {}, nowMs)
		const csv = buildLidarPhotogrammetryCsvReport(injReport)
		assert.equal(csv.includes('cluster_id,cluster_name,lidar_toolchain'), true)
		assert.equal(csv.includes('\'=cmd'), true)

		const jsonManifest = JSON.parse(buildLidarPhotogrammetryJsonManifest(graceReport))
		assert.equal(jsonManifest.schema, 'duplicatefinder.lidar-photogrammetry-vault-auditor.v1')
		assert.equal(Array.isArray(jsonManifest.clusters), true)

		const excludeList = buildLidarPhotogrammetrySyncExcludeList()
		assert.equal(excludeList.includes('metashape_tmp/'), true)
		assert.equal(excludeList.includes('potree_cache/'), true)
		assert.equal(excludeList.includes('*.e57.tmp'), true)
		assert.equal(excludeList.includes('*.laz.tmp'), true)
	})

	test('LidarPhotogrammetryVaultWorkbench renders empty state, presets, numeric filters, overrides, exports, and emits jump/compare', async () => {
		const copiedTexts = []
		const Workbench = loadLidarPhotogrammetryVaultWorkbench({
			copyTextSafely: async (text) => {
				copiedTexts.push(text)
				return true
			},
		})

		const mountEmpty = document.createElement('div')
		document.body.appendChild(mountEmpty)
		const emptyVm = new Vue({
			render: h => h(Workbench, {
				props: { duplicates: [], allDuplicates: [] },
			}),
		}).$mount(mountEmpty)

		try {
			await settle()
			assert.ok(emptyVm.$el.querySelector('.lpv__empty-banner'), 'Empty banner renders when scan pool is empty')
		} finally {
			emptyVm.$destroy()
			mountEmpty.remove()
		}

		const groups = buildSampleLidarPhotogrammetryDuplicates()
		const emitted = { select: [], compare: [] }
		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: groups,
					allDuplicates: groups,
					currentDuplicateId: 21205,
				},
				on: {
					'select-duplicate': d => emitted.select.push(d.id),
					'compare-duplicate': d => emitted.compare.push(d.id),
				},
			}),
		}).$mount(mountNode)

		try {
			await settle()
			const wb = vm.$children[0]
			assert.equal(wb.selectedCluster.id, 21205)
			assert.ok(wb.$el.querySelector('.lpv__workspace'))

			// Controlled numeric inputs never clamp mid-keystroke on empty/partial typing
			wb.keepRecentJobDaysInput = ''
			wb.minSizeKbInput = ''
			await settle()
			assert.equal(wb.keepRecentJobDaysInput, '')
			assert.equal(wb.parsedKeepRecentJobDays, 0)
			assert.equal(wb.parsedMinSizeKb, 0)

			// Apply scratch cleanup preset
			wb.applyPreset('photogrammetry-tiling-scratch-cleanup')
			await settle()
			assert.equal(wb.keepRecentJobDaysInput, '14')

			// Per-copy override on reclaimable target
			wb.applyPreset('all-lidar-photogrammetry-audit')
			await settle()
			const firstOverrideSelect = wb.$el.querySelector('.lpv__override-select')
			assert.ok(firstOverrideSelect)
			wb.setMemberOverride(wb.selectedCluster.members[0].key, 'keep')
			await settle()
			assert.equal(wb.selectedCluster.members[0].shielded, true)

			// Jump & compare events
			wb.jumpToDuplicate(wb.selectedCluster)
			wb.compareDuplicate(wb.selectedCluster)
			assert.deepEqual(emitted.select, [21205])
			assert.deepEqual(emitted.compare, [21205])

			// Clipboard actions
			await wb.copyRemediationScript()
			await wb.copySyncExcludeSnippet()
			assert.equal(copiedTexts.length, 2)
			assert.ok(copiedTexts[0].includes('DRY_RUN='))
			assert.ok(copiedTexts[1].includes('metashape_tmp/'))
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('App.vue renders LiDAR & Photogrammetry topbar button and toggles LidarPhotogrammetryVaultWorkbench via Alt+Shift+L', async () => {
		window.localStorage.clear()
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
		const LidarPhotogrammetryVaultWorkbench = loadLidarPhotogrammetryVaultWorkbench()

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
			'./components/LidarPhotogrammetryVaultWorkbench.vue': { __esModule: true, default: LidarPhotogrammetryVaultWorkbench },
			'./components/MocapBiomechanicsVaultWorkbench.vue': { __esModule: true, default: stub('mocap-biomechanics-vault-auditor') },
			'./components/NeuroscienceElectrophysVaultWorkbench.vue': { __esModule: true, default: stub('neuroscience-electrophys-vault-auditor') },
			'./components/OrbitalSpacecraftVaultWorkbench.vue': { __esModule: true, default: stub('orbital-spacecraft-vault-auditor') },
			'./components/ParticlePhysicsHepVaultWorkbench.vue': { __esModule: true, default: stub('particle-physics-hep-vault-auditor') },
			'./components/QuantumQubitPulseVaultWorkbench.vue': { __esModule: true, default: stub('quantum-qubit-pulse-vault-auditor') },
			'./components/RailwaySignalingTelemetryVaultWorkbench.vue': { __esModule: true, default: stub('railway-signaling-telemetry-vault-auditor') },
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
					entities: type === 'unacknowledged' ? buildSampleLidarPhotogrammetryDuplicates() : [],
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
			const btn = vm.$el.querySelector('.topbar-lidar-photogrammetry-vault-button')
			assert.ok(btn, 'Topbar LiDAR & Photogrammetry button must render')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'Alt+Shift+L')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'L', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.lidarPhotogrammetryVaultOpen, true)
			assert.ok(vm.$el.querySelector('.lidar-photogrammetry-vault-workbench'), 'LidarPhotogrammetryVaultWorkbench must open on Alt+Shift+L shortcut')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'L', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.lidarPhotogrammetryVaultOpen, false)
			assert.equal(vm.$el.querySelector('.lidar-photogrammetry-vault-workbench'), null, 'LidarPhotogrammetryVaultWorkbench must toggle closed on Alt+Shift+L shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new LiDAR & Photogrammetry Vault files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/lidarPhotogrammetryVaultAuditor.js',
			'src/components/LidarPhotogrammetryVaultWorkbench.vue',
			'tests/frontend/lidar-photogrammetry-vault-auditor.test.cjs',
			'tests/Vue/LidarPhotogrammetryVaultWorkbenchTest.php',
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
