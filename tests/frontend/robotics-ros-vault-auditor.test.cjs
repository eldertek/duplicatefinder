const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window, document } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

/**
 * Load the pure Robotics, Autonomous Systems, ROS2 Bags & LiDAR Point Cloud Vault auditor module.
 *
 * @return {object} Loaded module exports.
 */
function loadRoboticsRosVaultModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateStats': duplicateStats,
	})
	return loadModule('src/tools/roboticsRosVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

/**
 * Load RoboticsRosVaultWorkbench Vue component with mocked clipboard helper.
 *
 * @param {Array<string>} [copiedPayloads] Array collecting copied strings.
 * @return {object} Loaded Vue component definition.
 */
function loadRoboticsRosVaultWorkbench(copiedPayloads = []) {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateStats': duplicateStats,
	})
	const roboticsRosVaultAuditor = loadModule('src/tools/roboticsRosVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
	return loadComponent('src/components/RoboticsRosVaultWorkbench.vue', {
		'../tools/clipboardHelper': {
			copyTextSafely: async (text) => {
				copiedPayloads.push(text)
				return true
			},
		},
		'../tools/duplicateStats': duplicateStats,
		'../tools/roboticsRosVaultAuditor': roboticsRosVaultAuditor,
	})
}

/**
 * Build deterministic Robotics, ROS2 Bags & LiDAR duplicate groups.
 *
 * @param {number} [nowMs] Reference epoch milliseconds.
 * @return {Array<object>} Sample duplicate groups.
 */
function buildSampleRoboticsDuplicates(nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)) {
	const twoDaysAgo = Math.floor((nowMs - 2 * 24 * 60 * 60 * 1000) / 1000)
	const thirtyDaysAgo = Math.floor((nowMs - 30 * 24 * 60 * 60 * 1000) / 1000)

	return [
		{
			id: 1991,
			hash: 'hash-urdf-kinematics',
			acknowledged: false,
			files: [
				{
					id: 19911,
					path: '/Robotics_Vault/00_Missions/Atlas_R4/urdf_models/atlas_r4.urdf',
					size: 128 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19912,
					path: '/Robotics_Vault/Mirror/Atlas_R4/atlas_r4.urdf',
					size: 128 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1992,
			hash: 'hash-extrinsics-calib',
			acknowledged: false,
			files: [
				{
					id: 19921,
					path: '/Robotics_Vault/Calibration_Vault/ouster_os1.extrinsics.yaml',
					size: 24 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19922,
					path: '/Robotics_Lab/Mirror/ouster_os1.extrinsics.yaml',
					size: 24 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1993,
			hash: 'hash-compressed-mcap-anchor',
			acknowledged: false,
			files: [
				{
					id: 19931,
					path: '/Robotics_Vault/MCAP_Archive/highway_loop_01.mcap.zst',
					size: 1400 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19932,
					path: '/Robotics_Vault/Mirror/highway_loop_01.mcap.zst',
					size: 1400 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1994,
			hash: 'hash-redundant-uncompressed-bag',
			acknowledged: false,
			files: [
				{
					id: 19941,
					path: '/Robotics_Lab/Staging/highway_loop_01_raw.bag',
					size: 2800 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19942,
					path: '/Robotics_Lab/Mirror/highway_loop_01.bag',
					size: 2800 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1995,
			hash: 'hash-unbacked-uncompressed-db3',
			acknowledged: false,
			files: [
				{
					id: 19951,
					path: '/Robotics_Lab/Fleet/warehouse_amr_solo.db3',
					size: 640 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19952,
					path: '/Robotics_Lab/Backup/warehouse_amr_solo.db3',
					size: 640 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1996,
			hash: 'hash-compressed-laz-anchor',
			acknowledged: false,
			files: [
				{
					id: 19961,
					path: '/Robotics_Vault/LiDAR_Vault/campus_corridor.copc.laz',
					size: 920 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19962,
					path: '/Robotics_Lab/Mirror/campus_corridor.copc.laz',
					size: 920 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1997,
			hash: 'hash-redundant-las-export',
			acknowledged: false,
			files: [
				{
					id: 19971,
					path: '/Robotics_Lab/Exports/campus_corridor_uncompressed.las',
					size: 1850 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19972,
					path: '/Robotics_Lab/pointcloud_tmp/campus_corridor.las',
					size: 1850 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1998,
			hash: 'hash-e57-canonical-lidar',
			acknowledged: false,
			files: [
				{
					id: 19981,
					path: '/Robotics_Vault/LiDAR_Vault/bay_dock_scan.e57',
					size: 512 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19982,
					path: '/Robotics_Vault/Mirror/bay_dock_scan.e57',
					size: 512 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1999,
			hash: 'hash-colcon-gazebo-scratch',
			acknowledged: false,
			files: [
				{
					id: 19991,
					path: '/Robotics_Lab/gazebo_cache/nav2_world_old.simcache',
					size: 320 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19992,
					path: '/Robotics_Lab/slam_tmp/recent_mission/nav2_world_old.simcache',
					size: 320 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1990,
			hash: 'hash-unrelated-photo',
			acknowledged: false,
			files: [
				{
					id: 19901,
					path: '/Photos/Vacation/beach.jpg',
					size: 4 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19902,
					path: '/Photos/Backup/beach.jpg',
					size: 4 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
	]
}

describe('Cycle 199: Robotics, Autonomous Systems, ROS2 Bags & LiDAR Point Cloud Vault Auditor', () => {
	test('classifies URDF/calibration, ROS2 MCAP/BAG, LiDAR LAZ/LAS/E57, and Colcon/Gazebo scratch while ignoring unrelated files', () => {
		const {
			classifyRoboticsRosFile,
			isRoboticsRosGroup,
			extractRoboticsLineageStem,
			auditRoboticsRosVault,
		} = loadRoboticsRosVaultModule()

		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = buildSampleRoboticsDuplicates(nowMs)

		assert.equal(classifyRoboticsRosFile({ path: '/Robotics_Vault/atlas_r4.urdf', size: 1024 }).family, 'robot-kinematics-calibration')
		assert.equal(classifyRoboticsRosFile({ path: '/Robotics_Vault/ouster_os1.extrinsics.yaml', size: 1024 }).family, 'robot-kinematics-calibration')
		assert.equal(classifyRoboticsRosFile({ path: '/Robotics_Vault/highway_loop_01.mcap.zst', size: 1024 }).family, 'rosbag-mcap-telemetry')
		assert.equal(classifyRoboticsRosFile({ path: '/Robotics_Lab/highway_loop_01.bag', size: 1024 }).family, 'rosbag-mcap-telemetry')
		assert.equal(classifyRoboticsRosFile({ path: '/Robotics_Vault/campus.copc.laz', size: 1024 }).family, 'lidar-point-cloud')
		assert.equal(classifyRoboticsRosFile({ path: '/Robotics_Lab/campus.las', size: 1024 }).family, 'lidar-point-cloud')
		assert.equal(classifyRoboticsRosFile({ path: '/Robotics_Lab/gazebo_cache/nav2_world.simcache', size: 1024 }).family, 'colcon-sim-scratch')
		assert.equal(classifyRoboticsRosFile({ path: '/Photos/Vacation/beach.jpg', size: 1024 }).family, null)

		assert.equal(extractRoboticsLineageStem('highway_loop_01_raw.bag'), 'highway_loop_01')
		assert.equal(extractRoboticsLineageStem('highway_loop_01.mcap.zst'), 'highway_loop_01')
		assert.equal(extractRoboticsLineageStem('campus_corridor_uncompressed.las'), 'campus_corridor')
		assert.equal(extractRoboticsLineageStem('campus_corridor.copc.laz'), 'campus_corridor')

		assert.equal(isRoboticsRosGroup(groups[0]), true)
		assert.equal(isRoboticsRosGroup(groups[9]), false)

		const result = auditRoboticsRosVault(groups, {}, nowMs)
		assert.equal(result.summary.totalDomainGroupsCount, 9)
		assert.equal(result.familyCounts['robot-kinematics-calibration'], 2)
		assert.equal(result.familyCounts['rosbag-mcap-telemetry'], 3)
		assert.equal(result.familyCounts['lidar-point-cloud'], 3)
		assert.equal(result.familyCounts['colcon-sim-scratch'], 1)
	})

	test('strictly conserves URDF/calibration, compressed MCAP.ZST, and LAZ/E57 while reclaiming redundant .bag/.las and sim scratch', () => {
		const { auditRoboticsRosVault } = loadRoboticsRosVaultModule()
		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const result = auditRoboticsRosVault(buildSampleRoboticsDuplicates(nowMs), {}, nowMs)

		const urdfCluster = result.clusters.find(c => c.id === 1991)
		assert.ok(urdfCluster)
		assert.equal(urdfCluster.clusterVerdict, 'kinematics-calibration-protected')
		assert.equal(urdfCluster.reclaimableBytes, 0)
		assert.equal(urdfCluster.members.every(m => m.shielded && m.action === 'keep'), true)

		const mcapCluster = result.clusters.find(c => c.id === 1993)
		assert.ok(mcapCluster)
		assert.equal(mcapCluster.clusterVerdict, 'compressed-rosbag-protected')
		assert.equal(mcapCluster.reclaimableBytes, 0)
		assert.equal(mcapCluster.members.every(m => m.shielded && m.action === 'keep'), true)

		const redundantBagCluster = result.clusters.find(c => c.id === 1994)
		assert.ok(redundantBagCluster)
		assert.equal(redundantBagCluster.hasCompressedBagAnchor, true)
		assert.equal(redundantBagCluster.clusterVerdict, 'uncompressed-bag-las-redundant')
		assert.equal(redundantBagCluster.deleteTargetsCount, 2)
		assert.equal(redundantBagCluster.reclaimableBytes, 2 * 2800 * 1024 * 1024)

		const unbackedDb3Cluster = result.clusters.find(c => c.id === 1995)
		assert.ok(unbackedDb3Cluster)
		assert.equal(unbackedDb3Cluster.hasCompressedBagAnchor, false)
		assert.equal(unbackedDb3Cluster.deleteTargetsCount, 0)
		assert.equal(unbackedDb3Cluster.members.every(m => m.shielded && m.action === 'keep'), true)

		const redundantLasCluster = result.clusters.find(c => c.id === 1997)
		assert.ok(redundantLasCluster)
		assert.equal(redundantLasCluster.hasCompressedLidarAnchor, true)
		assert.equal(redundantLasCluster.clusterVerdict, 'uncompressed-bag-las-redundant')
		assert.equal(redundantLasCluster.deleteTargetsCount, 2)

		const e57Cluster = result.clusters.find(c => c.id === 1998)
		assert.ok(e57Cluster)
		assert.equal(e57Cluster.clusterVerdict, 'lidar-pointcloud-protected')
		assert.equal(e57Cluster.reclaimableBytes, 0)

		const simScratchCluster = result.clusters.find(c => c.id === 1999)
		assert.ok(simScratchCluster)
		assert.equal(simScratchCluster.clusterVerdict, 'colcon-sim-scratch-intermediate')
		assert.equal(simScratchCluster.deleteTargetsCount, 1)
		assert.equal(simScratchCluster.reclaimableBytes, 320 * 1024 * 1024)
	})

	test('respects mission grace window and never hardlinks mutable URDF/YAML/bag or simulation scratch', () => {
		const { auditRoboticsRosVault, buildRoboticsRosRemediationScript } = loadRoboticsRosVaultModule()
		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)

		const graceAudit = auditRoboticsRosVault(buildSampleRoboticsDuplicates(nowMs), {
			presetId: 'colcon-sim-scratch-cleanup',
			keepRecentMissionDays: 14,
		}, nowMs)
		const scratchCluster = graceAudit.clusters.find(c => c.id === 1999)
		assert.ok(scratchCluster)
		// 30-day-old survivor is kept; 2-day-old scratch inside slam_tmp is shielded by 14-day grace window
		assert.equal(scratchCluster.deleteTargetsCount, 0)
		assert.equal(scratchCluster.reclaimableBytes, 0)
		assert.equal(scratchCluster.members.every(m => m.shielded), true)

		const hardlinkAudit = auditRoboticsRosVault(buildSampleRoboticsDuplicates(nowMs), {
			strategy: 'hardlink-immutable-bags-and-lidar',
			protectKinematicsAndCalibration: false,
			protectCompressedRosbags: false,
			protectCanonicalLidarCaptures: false,
		}, nowMs)
		const mcapCluster = hardlinkAudit.clusters.find(c => c.id === 1993)
		const urdfCluster = hardlinkAudit.clusters.find(c => c.id === 1991)
		assert.equal(mcapCluster.hardlinkTargetsCount, 1)
		// Mutable .urdf must never be hardlinked
		assert.equal(urdfCluster.hardlinkTargetsCount, 0)

		const script = buildRoboticsRosRemediationScript(hardlinkAudit)
		assert.match(script, /DRY_RUN=/)
		assert.match(script, /run_cmd ln -f/)
		assert.doesNotMatch(script, /ln -f .*atlas_r4\.urdf/)
	})

	test('generates CWE-1236 formula-safe CSV, deterministic JSON manifest, and .sync-exclude.lst rules', () => {
		const {
			ROBOTICS_ROS_VAULT_SCHEMA,
			auditRoboticsRosVault,
			buildRoboticsRosCsvReport,
			buildRoboticsRosJsonManifest,
			buildRoboticsRosSyncExcludeList,
		} = loadRoboticsRosVaultModule()

		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const formulaGroups = [
			{
				id: 99,
				hash: 'hash-formula',
				files: [
					{ id: 991, path: '/Robotics_Lab/colcon_build/=cmd|\' -C calc\'!A0.simcache', size: 4096, mtime: Math.floor(nowMs / 1000) },
					{ id: 992, path: '/Robotics_Lab/gazebo_cache/+evil.simcache', size: 4096, mtime: Math.floor(nowMs / 1000) },
				],
			},
		]
		const audit = auditRoboticsRosVault(formulaGroups, {}, nowMs)
		const csv = buildRoboticsRosCsvReport(audit)
		assert.match(csv, /cluster_id,cluster_name,robotics_platform/)
		assert.match(csv, /"'=cmd\|/)

		const json = JSON.parse(buildRoboticsRosJsonManifest(audit))
		assert.equal(json.schema, ROBOTICS_ROS_VAULT_SCHEMA)
		assert.equal(json.clusters.length, 1)

		const syncExclude = buildRoboticsRosSyncExcludeList()
		assert.match(syncExclude, /colcon_build\//)
		assert.match(syncExclude, /gazebo_cache\//)
		assert.match(syncExclude, /\*\.db3-wal/)
	})

	test('RoboticsRosVaultWorkbench renders KPIs, presets, shield toggles, filters, per-copy overrides, and copy actions cleanly', async () => {
		const copied = []
		const RoboticsRosVaultWorkbench = loadRoboticsRosVaultWorkbench(copied)
		const groups = buildSampleRoboticsDuplicates()

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue({
			render: h => h('div', [h(RoboticsRosVaultWorkbench, {
				props: {
					duplicates: groups,
					allDuplicates: groups,
					currentDuplicateId: 1994,
				},
			})]),
		}).$mount(mountNode)

		try {
			await settle()
			assert.ok(vm.$el.querySelector('.robotics-ros-vault-workbench'))
			assert.match(vm.$el.textContent, /Robotics, Autonomous Systems, ROS2 Bags & LiDAR Point Cloud Vault Auditor/)
			assert.equal(vm.$el.querySelectorAll('.rrv__cluster-card').length, 9)

			// Apply LiDAR preset
			const lidarPresetBtn = Array.from(vm.$el.querySelectorAll('.rrv__seg-btn'))
				.find(btn => btn.textContent.includes('LiDAR Point Cloud'))
			assert.ok(lidarPresetBtn)
			lidarPresetBtn.click()
			await settle()
			assert.equal(vm.$el.querySelectorAll('.rrv__cluster-card').length, 3)

			// Copy remediation script
			const copyScriptBtn = Array.from(vm.$el.querySelectorAll('.rrv__tool-btn'))
				.find(btn => btn.textContent.includes('Copy DRY_RUN=1 Script'))
			assert.ok(copyScriptBtn)
			copyScriptBtn.click()
			await settle()
			assert.equal(copied.length, 1)
			assert.match(copied[0], /DRY_RUN=/)
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('RoboticsRosVaultWorkbench renders empty-state banner when no duplicates are loaded', async () => {
		const RoboticsRosVaultWorkbench = loadRoboticsRosVaultWorkbench()
		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		let scanEmitted = false
		const vm = new Vue({
			render: h => h(RoboticsRosVaultWorkbench, {
				props: {
					duplicates: [],
					allDuplicates: [],
				},
				on: {
					'start-scan': () => {
						scanEmitted = true
					},
				},
			}),
		}).$mount(mountNode)

		try {
			await settle()
			const emptyBanner = vm.$el.querySelector('.rrv__empty-banner')
			assert.ok(emptyBanner, 'Empty banner is visible when no duplicates are loaded')
			const scanBtn = emptyBanner.querySelector('button')
			assert.ok(scanBtn)
			scanBtn.click()
			await settle()
			assert.equal(scanEmitted, true)
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('App.vue opens and closes RoboticsRosVaultWorkbench via Shift+F12 and topbar button', async () => {
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
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
		const RoboticsRosVaultWorkbench = loadRoboticsRosVaultWorkbench()
		const icon = { render: h => h('span') }
		const stub = name => ({
			name,
			props: ['duplicate', 'projectId', 'show', 'isScanning'],
			render: h => h('div', { class: `stub-${name}` }),
		})
		const SearchBar = loadComponent('src/components/SearchBar.vue', {
			'vue-material-design-icons/ChevronDown': icon,
		})
		const DuplicateListItem = loadComponent('src/components/DuplicateListItem.vue', {
			'@nextcloud/vue': { NcAppNavigationItem: stub('nav-item') },
			'@/tools/duplicateStats': statsModule,
			'@/tools/utils': utils,
		})
		const DuplicateNavigation = loadComponent('src/components/DuplicateNavigation.vue', {
			'@nextcloud/vue': {
				NcAppNavigation: { render: h => h('nav') },
				NcAppNavigationItem: stub('nav-item'),
				NcButton: stub('btn'),
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
			'@/tools/api': { fetchDuplicates: async () => ({ entities: [], pagination: { currentPage: 1, totalPages: 1 } }) },
			'@/tools/utils': utils,
			'@/tools/duplicateFilters': loadModule('src/tools/duplicateFilters.js'),
			'@/tools/duplicatePreferences': loadModule('src/tools/duplicatePreferences.js'),
			'@/tools/duplicateSelectionAndExport': loadModule('src/tools/duplicateSelectionAndExport.js'),
			'@/tools/duplicateSortHelper': loadModule('src/tools/duplicateSortHelper.js'),
			'@/tools/duplicateStats': statsModule,
		})

		const App = loadComponent('src/App.vue', {
			'@nextcloud/vue': {
				NcAppContent: { render(h) { return h('main', this.$slots.default) } },
				NcContent: { render(h) { return h('div', this.$slots.default) } },
				NcLoadingIcon: stub('loading'),
				NcAppSettingsDialog: stub('settings-dialog'),
				NcAppSettingsSection: stub('settings-section'),
				NcButton: { render(h) { return h('button', this.$slots.default) } },
				NcModal: stub('modal'),
			},
			'./components/DuplicateNavigation.vue': { __esModule: true, default: DuplicateNavigation },
			'./components/DuplicateDetails.vue': { __esModule: true, default: stub('details') },
			'./components/DuplicateTreemap.vue': { __esModule: true, default: DuplicateTreemap },
			'./components/SpaceReclamationTimeline.vue': { __esModule: true, default: stub('history') },
			'./components/SimilarityInspector.vue': { __esModule: true, default: stub('similarity') },
			'./components/BatchAutoSelectWorkbench.vue': { __esModule: true, default: stub('batch') },
			'./components/FileHygieneInspector.vue': { __esModule: true, default: stub('hygiene') },
			'./components/LinkDeduplicationSimulator.vue': { __esModule: true, default: stub('link') },
			'./components/FolderPairMatrix.vue': { __esModule: true, default: stub('matrix') },
			'./components/StorageFootprintAnalyzer.vue': { __esModule: true, default: stub('footprint') },
			'./components/PhotoBurstTimeline.vue': { __esModule: true, default: stub('burst') },
			'./components/RecoverySafetyWorkbench.vue': { __esModule: true, default: stub('safety') },
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
			'./components/RoboticsRosVaultWorkbench.vue': { __esModule: true, default: RoboticsRosVaultWorkbench },
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
					entities: type === 'unacknowledged' ? buildSampleRoboticsDuplicates() : [],
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

			const btn = vm.$el.querySelector('button.topbar-robotics-ros-vault-button')
			assert.ok(btn, 'Robotics & ROS2 Vault button is rendered in topbar')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'Shift+F12')
			assert.equal(vm.$el.querySelector('.robotics-ros-vault-workbench'), null)

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F12', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.ok(vm.$el.querySelector('.robotics-ros-vault-workbench'), 'RoboticsRosVaultWorkbench must open on Shift+F12 shortcut')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F12', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.$el.querySelector('.robotics-ros-vault-workbench'), null, 'RoboticsRosVaultWorkbench must toggle closed on Shift+F12 shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new Robotics & ROS2 Vault files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/roboticsRosVaultAuditor.js',
			'src/components/RoboticsRosVaultWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
		]
		for (const rel of files) {
			const content = readFileSync(resolve(root, rel), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(content), false, `No U+2013/U+2014 in ${rel}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `No XSS sink in ${rel}`)
		}
	})
})
