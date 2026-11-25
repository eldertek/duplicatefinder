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

function loadBatteryBmsAuditor() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/batteryBmsVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function loadBatteryBmsVaultWorkbench(clipboardOverrides = {}) {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const auditor = loadModule('src/tools/batteryBmsVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
	return loadComponent('src/components/BatteryBmsVaultWorkbench.vue', {
		'../tools/clipboardHelper': {
			copyTextSafely: async () => true,
			...clipboardOverrides,
		},
		'../tools/duplicateStats': duplicateStats,
		'../tools/batteryBmsVaultAuditor': auditor,
	})
}

function buildSampleBatteryBmsDuplicates(referenceNowMs = Date.UTC(2026, 10, 24, 12, 0, 0)) {
	const oldMtime = Math.floor((referenceNowMs - 40 * 24 * 60 * 60 * 1000) / 1000)
	const recentMtime = Math.floor((referenceNowMs - 2 * 24 * 60 * 60 * 1000) / 1000)

	return [
		{
			id: 20201,
			hash: 'bms-hash-a2l-cal',
			files: [
				{
					id: 1,
					nodeId: 1,
					path: '/ev_battery/bms_vault/pack_800v/bms_master_v42.a2l',
					size: 18 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 2,
					nodeId: 2,
					path: '/ev_battery/work/pack_800v_cal/bms_master_v42.a2l',
					size: 18 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20202,
			hash: 'bms-hash-homologation-r100',
			files: [
				{
					id: 3,
					nodeId: 3,
					path: '/ev_battery/un_r100/thermal_runaway/nail_penetration_report.pdf',
					size: 42 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 4,
					nodeId: 4,
					path: '/ev_battery/mirror/un_r100/nail_penetration_report.pdf',
					size: 42 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20203,
			hash: 'bms-hash-mdf4-anchor',
			files: [
				{
					id: 5,
					nodeId: 5,
					path: '/ev_battery/mdf4_vault/dyno_wltp_pack800v/dyno_wltp_pack800v.mf4.zst',
					size: 640 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 6,
					nodeId: 6,
					path: '/ev_battery/mirror/dyno_wltp_pack800v/dyno_wltp_pack800v.mf4.zst',
					size: 640 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20204,
			hash: 'bms-hash-csv-redundant',
			files: [
				{
					id: 7,
					nodeId: 7,
					path: '/ev_battery/exports/dyno_wltp_pack800v/dyno_wltp_pack800v_raw.csv',
					size: 980 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 8,
					nodeId: 8,
					path: '/ev_battery/canape/dyno_wltp_pack800v/dyno_wltp_pack800v_raw.csv',
					size: 980 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20205,
			hash: 'bms-hash-asc-unanchored',
			files: [
				{
					id: 9,
					nodeId: 9,
					path: '/ev_battery/canoe/inverter_bench/inverter_fault_capture.asc',
					size: 320 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 10,
					nodeId: 10,
					path: '/ev_battery/canoe/inverter_bench/copy/inverter_fault_capture.asc',
					size: 320 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20206,
			hash: 'bms-hash-ndax-cycler',
			files: [
				{
					id: 11,
					nodeId: 11,
					path: '/ev_battery/cycler_masters/nmc811_formation/cell_nmc811_c05.ndax',
					size: 110 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 12,
					nodeId: 12,
					path: '/ev_battery/arbin/nmc811_formation/cell_nmc811_c05.ndax',
					size: 110 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20207,
			hash: 'bms-hash-eis-mpr-mat',
			files: [
				{
					id: 13,
					nodeId: 13,
					path: '/ev_battery/biologic/eis_nyquist_25c/cell_nmc811_c05_exported.mat',
					size: 210 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 14,
					nodeId: 14,
					path: '/ev_battery/exports/eis_nyquist_25c/cell_nmc811_c05_exported.mat',
					size: 210 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20208,
			hash: 'bms-hash-hil-scratch',
			files: [
				{
					id: 15,
					nodeId: 15,
					path: '/ev_battery/hil_rig1/dspace_tmp/bms_plant_build.slxc',
					size: 160 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 16,
					nodeId: 16,
					path: '/ev_battery/hil_rig2/dspace_tmp/bms_plant_build.slxc',
					size: 160 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20209,
			hash: 'non-battery-unrelated',
			files: [
				{
					id: 17,
					nodeId: 17,
					path: '/personal/photos/summer_2026.jpg',
					size: 8 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 18,
					nodeId: 18,
					path: '/personal/backup/summer_2026.jpg',
					size: 8 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
	]
}

describe('Cycle 202: Battery, EV Powertrain, BMS Telemetry & HIL Dyno Test Vault Auditor (pure logic)', () => {
	test('classifies Battery/BMS families, detects toolchains, and shields calibration, homologation, and MDF4/cycler anchors', () => {
		const {
			BATTERY_BMS_VAULT_SCHEMA,
			classifyBatteryBmsFile,
			isBatteryBmsGroup,
			auditBatteryBmsVault,
		} = loadBatteryBmsAuditor()

		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = buildSampleBatteryBmsDuplicates(nowMs)

		assert.equal(classifyBatteryBmsFile({ path: '/personal/photos/summer_2026.jpg', size: 1024 }).family, null)
		assert.equal(isBatteryBmsGroup(groups[8]), false)
		assert.equal(isBatteryBmsGroup(groups[0]), true)

		const a2lMeta = classifyBatteryBmsFile(groups[0].files[0], nowMs)
		assert.equal(a2lMeta.family, 'bms-calibration-homologation')
		assert.equal(a2lMeta.benchToolchain, 'Vector CANoe / CANape / MDF4')
		assert.equal(a2lMeta.isProtectedCalibration, true)

		const r100Meta = classifyBatteryBmsFile(groups[1].files[0], nowMs)
		assert.equal(r100Meta.family, 'bms-calibration-homologation')
		assert.equal(r100Meta.isProtectedHomologation, true)
		assert.equal(r100Meta.benchToolchain, 'Thermal Abuse & Homologation Rig')

		const mdfMeta = classifyBatteryBmsFile(groups[2].files[0], nowMs)
		assert.equal(mdfMeta.family, 'compressed-telemetry-cycler')
		assert.equal(mdfMeta.isCompressedTelemetryAnchor, true)

		const scratchMeta = classifyBatteryBmsFile(groups[7].files[0], nowMs)
		assert.equal(scratchMeta.family, 'hil-dyno-scratch-logs')
		assert.equal(scratchMeta.isBenchScratchPath, true)
		assert.equal(scratchMeta.benchToolchain, 'dSPACE ControlDesk / Simulink HIL')

		const report = auditBatteryBmsVault(groups, {}, nowMs)
		assert.equal(report.schema, BATTERY_BMS_VAULT_SCHEMA)
		assert.equal(report.summary.totalDomainGroupsCount, 8)
		assert.equal(report.summary.totalClustersCount, 8)

		const a2lCluster = report.clusters.find(c => c.id === 20201)
		assert.equal(a2lCluster.clusterVerdict, 'calibration-homologation-protected')
		assert.equal(a2lCluster.reclaimableBytes, 0)
		assert.ok(a2lCluster.members.every(m => m.shielded && m.action === 'keep'))

		const r100Cluster = report.clusters.find(c => c.id === 20202)
		assert.equal(r100Cluster.clusterVerdict, 'homologation-abuse-protected')
		assert.equal(r100Cluster.reclaimableBytes, 0)

		const mdfCluster = report.clusters.find(c => c.id === 20203)
		assert.equal(mdfCluster.clusterVerdict, 'telemetry-archive-protected')
		assert.equal(mdfCluster.reclaimableBytes, 0)

		// Redundant CSV backed by .mf4.zst anchor -> both copies reclaimable
		const csvCluster = report.clusters.find(c => c.id === 20204)
		assert.equal(csvCluster.clusterVerdict, 'raw-export-redundant')
		assert.equal(csvCluster.hasCompressedTelemetryAnchor, true)
		assert.equal(csvCluster.reclaimableTargetsCount, 2)
		assert.equal(csvCluster.reclaimableBytes, 2 * 980 * 1024 * 1024)

		// Unanchored ASC -> blocked while requireCompressedAnchorForPrune is true
		const ascCluster = report.clusters.find(c => c.id === 20205)
		assert.equal(ascCluster.hasCompressedTelemetryAnchor, false)
		assert.equal(ascCluster.reclaimableBytes, 0)
		assert.ok(ascCluster.members.every(m => m.shielded))

		// Redundant cycler .mat backed by .ndax anchor -> both copies reclaimable
		const matCluster = report.clusters.find(c => c.id === 20207)
		assert.equal(matCluster.clusterVerdict, 'raw-export-redundant')
		assert.equal(matCluster.hasCompressedTelemetryAnchor, true)
		assert.equal(matCluster.reclaimableTargetsCount, 2)

		// HIL dspace_tmp scratch -> 1 non-survivor copy reclaimable
		const scratchCluster = report.clusters.find(c => c.id === 20208)
		assert.equal(scratchCluster.clusterVerdict, 'hil-dyno-scratch-intermediate')
		assert.equal(scratchCluster.reclaimableTargetsCount, 1)
		assert.equal(scratchCluster.reclaimableBytes, 160 * 1024 * 1024)
	})

	test('respects keepRecentBenchRunDays grace window, hardlink safety on mutable files, and per-copy overrides', () => {
		const { auditBatteryBmsVault } = loadBatteryBmsAuditor()
		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = buildSampleBatteryBmsDuplicates(nowMs)

		// With 14-day bench grace window, recent (2-day-old) HIL scratch copy is shielded
		const graceReport = auditBatteryBmsVault(groups, {
			presetId: 'hil-dyno-scratch-cleanup',
			keepRecentBenchRunDays: 14,
		}, nowMs)
		const scratchWithGrace = graceReport.clusters.find(c => c.id === 20208)
		assert.equal(scratchWithGrace.reclaimableBytes, 0)
		assert.ok(scratchWithGrace.members.every(m => m.shielded))

		// Hardlink strategy with telemetry shield disabled hardlinks immutable .mf4.zst, never mutable .a2l or .asc
		const hardlinkReport = auditBatteryBmsVault(groups, {
			strategy: 'hardlink-immutable-telemetry-and-cycler',
			protectCompressedTelemetryAnchors: false,
			protectCalibrationAndHomologation: false,
			requireCompressedAnchorForPrune: false,
		}, nowMs)
		const mdfHardlink = hardlinkReport.clusters.find(c => c.id === 20203)
		assert.equal(mdfHardlink.hardlinkTargetsCount, 1)
		assert.equal(mdfHardlink.deleteTargetsCount, 0)

		const a2lMutable = hardlinkReport.clusters.find(c => c.id === 20201)
		assert.equal(a2lMutable.hardlinkTargetsCount, 0)
		assert.equal(a2lMutable.deleteTargetsCount, 1)

		// Per-copy override: keep a redundant CSV member and prune an unanchored ASC copy
		const overrideReport = auditBatteryBmsVault(groups, {
			memberOverrides: {
				7: 'keep',
				10: 'prune',
			},
		}, nowMs)
		const csvCluster = overrideReport.clusters.find(c => c.id === 20204)
		assert.equal(csvCluster.members.find(m => m.id === 7).shielded, true)
		assert.equal(csvCluster.members.find(m => m.id === 7).action, 'keep')
		assert.equal(csvCluster.reclaimableTargetsCount, 1)

		const ascCluster = overrideReport.clusters.find(c => c.id === 20205)
		assert.equal(ascCluster.members.find(m => m.id === 10).action, 'delete')
		assert.equal(ascCluster.reclaimableTargetsCount, 1)
	})

	test('generates safe DRY_RUN=1 POSIX script, CWE-1236 CSV, JSON manifest, and .sync-exclude.lst', () => {
		const {
			BATTERY_BMS_VAULT_SCHEMA,
			auditBatteryBmsVault,
			buildBatteryBmsRemediationScript,
			buildBatteryBmsCsvReport,
			buildBatteryBmsJsonManifest,
			buildBatteryBmsSyncExcludeList,
		} = loadBatteryBmsAuditor()

		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = buildSampleBatteryBmsDuplicates(nowMs)
		groups[3].files[1].path = "/ev_battery/canape/O'Reilly pack/=cmd_raw.csv"

		const report = auditBatteryBmsVault(groups, {}, nowMs)
		const script = buildBatteryBmsRemediationScript(report)
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes('set -euo pipefail'))
		assert.ok(script.includes("'/ev_battery/canape/O'\"'\"'Reilly pack/=cmd_raw.csv'"))
		assert.equal(script.includes('bms_master_v42.a2l'), false)
		assert.equal(script.includes('nail_penetration_report.pdf'), false)

		const csv = buildBatteryBmsCsvReport(report)
		assert.ok(csv.startsWith('cluster_id,cluster_name,bench_toolchain,'))
		assert.ok(csv.includes('raw-export-redundant'))
		assert.ok(csv.includes('homologation-abuse-protected'))

		// CWE-1236 formula injection neutralization check
		const formulaReport = auditBatteryBmsVault([
			{
				id: 99,
				hash: 'h-formula',
				files: [
					{ id: 991, nodeId: 991, path: '/ev_battery/bms/=HYPERLINK("http://evil")_bms.csv', size: 2048, mtime: 1000 },
					{ id: 992, nodeId: 992, path: '/ev_battery/mdf4_vault/bms_run.mf4', size: 2048, mtime: 1000 },
				],
			},
		], {}, nowMs)
		const formulaCsv = buildBatteryBmsCsvReport(formulaReport)
		assert.equal(formulaCsv.includes(',=HYPERLINK'), false)
		assert.ok(formulaCsv.includes("'=HYPERLINK") || formulaCsv.includes('"/ev_battery/bms/=HYPERLINK'))

		const json = JSON.parse(buildBatteryBmsJsonManifest(report))
		assert.equal(json.schema, BATTERY_BMS_VAULT_SCHEMA)
		assert.equal(json.clusters.length, 8)

		const syncExclude = buildBatteryBmsSyncExcludeList()
		assert.ok(syncExclude.includes('dspace_tmp/'))
		assert.ok(syncExclude.includes('canape_tmp/'))
		assert.ok(syncExclude.includes('*.mf4.tmp'))
		assert.ok(syncExclude.includes('*.slxc'))
	})
})

describe('Cycle 202: BatteryBmsVaultWorkbench Vue component & App.vue Alt+Shift+B integration', () => {
	test('renders empty state, populated audit workspace, presets, filters, and non-clamping numeric inputs', async () => {
		const Workbench = loadBatteryBmsVaultWorkbench()

		// Empty state
		const emptyMount = document.createElement('div')
		document.body.appendChild(emptyMount)
		const emptyVm = new Vue({
			render(h) {
				return h(Workbench, {
					props: { duplicates: [], allDuplicates: [] },
					on: { 'start-scan': () => { this.scanTriggered = true } },
				})
			},
			data() {
				return { scanTriggered: false }
			},
		}).$mount(emptyMount)
		try {
			await settle()
			assert.ok(emptyVm.$el.querySelector('.bbv__empty-banner'))
			emptyVm.$el.querySelector('.bbv__primary-btn').click()
			await settle()
			assert.equal(emptyVm.scanTriggered, true)
		} finally {
			emptyVm.$destroy()
			emptyMount.remove()
		}

		// Populated state
		const groups = buildSampleBatteryBmsDuplicates()
		const copied = []
		const WorkbenchWithCopy = loadBatteryBmsVaultWorkbench({
			copyTextSafely: async (text) => {
				copied.push(text)
				return true
			},
		})
		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue({
			render(h) {
				return h(WorkbenchWithCopy, {
					props: {
						duplicates: groups,
						allDuplicates: groups,
						currentDuplicateId: 20204,
					},
				})
			},
		}).$mount(mountNode)

		try {
			await settle()
			assert.equal(vm.$el.querySelectorAll('.bbv__cluster-card').length, 8)
			assert.ok(vm.$el.textContent.includes('dyno_wltp_pack800v_raw.csv'))

			// Numeric inputs never clamp or reset mid-keystroke when cleared
			const wbVm = vm.$children[0]
			wbVm.keepRecentBenchRunDaysInput = ''
			wbVm.minSizeKbInput = ''
			await settle()
			assert.equal(wbVm.keepRecentBenchRunDaysInput, '')
			assert.equal(wbVm.minSizeKbInput, '')
			assert.equal(wbVm.parsedKeepRecentBenchRunDays, 0)
			assert.equal(wbVm.parsedMinSizeKb, 0)

			// Apply preset: HIL & Dyno Scratch Cache
			const presetButtons = Array.from(vm.$el.querySelectorAll('.bbv__seg-btn'))
			const hilPresetBtn = presetButtons.find(btn => btn.textContent.includes('HIL & Dyno Scratch Cache'))
			assert.ok(hilPresetBtn)
			hilPresetBtn.click()
			await settle()
			assert.equal(wbVm.presetId, 'hil-dyno-scratch-cleanup')
			assert.equal(wbVm.keepRecentBenchRunDaysInput, '14')

			// Copy DRY_RUN=1 script
			const copyScriptBtn = Array.from(vm.$el.querySelectorAll('.bbv__tool-btn'))
				.find(btn => btn.textContent.includes('Copy DRY_RUN=1 Script'))
			assert.ok(copyScriptBtn)
			copyScriptBtn.click()
			await settle()
			assert.equal(copied.length, 1)
			assert.ok(copied[0].includes('DRY_RUN="${DRY_RUN:-1}"'))
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('App.vue renders Battery & BMS Vault topbar button and toggles workbench on Alt+Shift+B', async () => {
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
		const BatteryBmsVaultWorkbench = loadBatteryBmsVaultWorkbench()

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
			'./components/BatteryBmsVaultWorkbench.vue': { __esModule: true, default: BatteryBmsVaultWorkbench },
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
					entities: type === 'unacknowledged' ? buildSampleBatteryBmsDuplicates() : [],
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
			const btn = vm.$el.querySelector('.topbar-battery-bms-vault-button')
			assert.ok(btn, 'Topbar Battery & BMS Vault button must render')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'Alt+Shift+B')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'B', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.batteryBmsVaultOpen, true)
			assert.ok(vm.$el.querySelector('.battery-bms-vault-workbench'), 'BatteryBmsVaultWorkbench must open on Alt+Shift+B shortcut')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'B', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.batteryBmsVaultOpen, false)
			assert.equal(vm.$el.querySelector('.battery-bms-vault-workbench'), null, 'BatteryBmsVaultWorkbench must toggle closed on Alt+Shift+B shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new Battery & BMS Vault files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/batteryBmsVaultAuditor.js',
			'src/components/BatteryBmsVaultWorkbench.vue',
			'tests/frontend/battery-bms-vault-auditor.test.cjs',
			'tests/Vue/BatteryBmsVaultWorkbenchTest.php',
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
