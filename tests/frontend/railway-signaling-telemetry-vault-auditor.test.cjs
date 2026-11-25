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

function loadRailwaySignalingAuditor() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/railwaySignalingTelemetryVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function loadRailwaySignalingTelemetryVaultWorkbench(clipboardOverrides = {}) {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const auditor = loadModule('src/tools/railwaySignalingTelemetryVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
	return loadComponent('src/components/RailwaySignalingTelemetryVaultWorkbench.vue', {
		'../tools/clipboardHelper': {
			copyTextSafely: async () => true,
			...clipboardOverrides,
		},
		'../tools/duplicateStats': duplicateStats,
		'../tools/railwaySignalingTelemetryVaultAuditor': auditor,
	})
}

function buildSampleRailwaySignalingDuplicates(referenceNowMs = Date.UTC(2026, 10, 25, 12, 0, 0)) {
	const oldMtime = Math.floor((referenceNowMs - 45 * 24 * 60 * 60 * 1000) / 1000)
	const recentMtime = Math.floor((referenceNowMs - 2 * 24 * 60 * 60 * 1000) / 1000)

	return [
		{
			id: 21801,
			hash: 'rail-hash-etcs-balise',
			files: [
				{
					id: 1,
					nodeId: 1,
					path: '/railway_vault/00_etcs/lgv_sud_est/balise_group_4412.bal',
					size: 128 * 1024,
					mtime: oldMtime,
				},
				{
					id: 2,
					nodeId: 2,
					path: '/railway_vault/mirror/balise_group_4412.bal',
					size: 128 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21802,
			hash: 'rail-hash-sil4-hold',
			files: [
				{
					id: 3,
					nodeId: 3,
					path: '/railway_vault/sil4_hold/era_baseline/paris_lyon_interlocking_v9.ixl',
					size: 256 * 1024,
					mtime: oldMtime,
				},
				{
					id: 4,
					nodeId: 4,
					path: '/railway_vault/mirror/sil4_hold/paris_lyon_interlocking_v9.ixl',
					size: 256 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21803,
			hash: 'rail-hash-otmr-master',
			files: [
				{
					id: 5,
					nodeId: 5,
					path: '/railway_vault/00_otmr/tgv_duplex_712/corridor_alpha_run_19.otmr',
					size: 720 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 6,
					nodeId: 6,
					path: '/railway_vault/nas_mirror/tgv_duplex_712/corridor_alpha_run_19.otmr',
					size: 720 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21804,
			hash: 'rail-hash-railml-master',
			files: [
				{
					id: 7,
					nodeId: 7,
					path: '/railway_vault/00_railml/corridor_west/junction_08_topology.railml',
					size: 380 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 8,
					nodeId: 8,
					path: '/railway_vault/backup/corridor_west/junction_08_topology.railml',
					size: 380 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21805,
			hash: 'rail-hash-redundant-kpi-anchored',
			files: [
				{
					id: 9,
					nodeId: 9,
					path: '/railway_vault/kpi_exports/corridor_alpha_run_19_tqi.parquet',
					size: 92 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 10,
					nodeId: 10,
					path: '/railway_vault/speed_profile_exports/corridor_alpha_run_19_tqi.parquet',
					size: 92 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21806,
			hash: 'rail-hash-unanchored-wheel-flat-csv',
			files: [
				{
					id: 11,
					nodeId: 11,
					path: '/railway_vault/wheel_flat_plots/orphan_trainset_304_tqi.csv',
					size: 18 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 12,
					nodeId: 12,
					path: '/railway_vault/tqi_summaries/orphan_trainset_304_tqi.csv',
					size: 18 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21807,
			hash: 'rail-hash-opentrack-old-scratch',
			files: [
				{
					id: 13,
					nodeId: 13,
					path: '/railway_vault/opentrack_cache/corridor_alpha_sim.jru.tmp',
					size: 210 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 14,
					nodeId: 14,
					path: '/railway_vault/etcs_sim_tmp/corridor_alpha_sim.jru.tmp',
					size: 210 * 1024 * 1024,
					mtime: oldMtime,
				},
			],
		},
		{
			id: 21808,
			hash: 'rail-hash-recent-tcms-scratch',
			files: [
				{
					id: 15,
					nodeId: 15,
					path: '/railway_vault/tcms_staging/junction_08_topology.mf4.part',
					size: 64 * 1024 * 1024,
					mtime: recentMtime,
				},
				{
					id: 16,
					nodeId: 16,
					path: '/railway_vault/jru_decode_tmp/junction_08_topology.mf4.part',
					size: 64 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21809,
			hash: 'non-railway-quantum-noise',
			files: [
				{
					id: 17,
					nodeId: 17,
					path: '/quantum_vault/00_qpy/bell_ghz_127q.qpy',
					size: 48 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 18,
					nodeId: 18,
					path: '/quantum_vault/mirror/bell_ghz_127q.qpy',
					size: 48 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
	]
}

describe('Cycle 218: Railway, ETCS/CBTC Signaling, Wayside Diagnostics & Rolling Stock Telemetry Vault Auditor', () => {
	test('normalizeRailwaySignalingConfig clamps invalid fields and preserves valid defaults', () => {
		const {
			RAILWAY_SIGNALING_DEFAULT_CONFIG,
			normalizeRailwaySignalingConfig,
		} = loadRailwaySignalingAuditor()

		const def = normalizeRailwaySignalingConfig()
		assert.deepEqual(def, {
			...RAILWAY_SIGNALING_DEFAULT_CONFIG,
			memberOverrides: {},
		})

		const custom = normalizeRailwaySignalingConfig({
			familyFilter: 'invalid-family',
			verdictFilter: 'unknown-verdict',
			strategy: 'bogus',
			survivorRule: 'bogus',
			sortMode: 'bogus',
			keepRecentRunDays: -5,
			minSizeKb: -10,
			searchQuery: '  railml  ',
			protectEtcsAndInterlocking: false,
		})
		assert.equal(custom.familyFilter, 'all')
		assert.equal(custom.verdictFilter, 'all')
		assert.equal(custom.strategy, 'prune-exports-and-wayside-scratch')
		assert.equal(custom.survivorRule, 'railway-etcs-otmr-first')
		assert.equal(custom.sortMode, 'reclaim_desc')
		assert.equal(custom.keepRecentRunDays, 0)
		assert.equal(custom.minSizeKb, 0)
		assert.equal(custom.searchQuery, 'railml')
		assert.equal(custom.protectEtcsAndInterlocking, false)
	})

	test('classifyRailwaySignalingFile classifies all 4 Railway & Signaling families and excludes non-Railway domains', () => {
		const { classifyRailwaySignalingFile } = loadRailwaySignalingAuditor()

		const balise = classifyRailwaySignalingFile({ path: '/railway_vault/00_etcs/balise_4412.bal', size: 1024 })
		assert.equal(balise.family, 'railway-interlocking-etcs-holds')
		assert.equal(balise.isProtectedEtcsInterlocking, true)
		assert.equal(balise.railwayTag, 'ETCS / BALISE')

		const hold = classifyRailwaySignalingFile({ path: '/railway_vault/sil4_hold/interlocking_v9.ixl', size: 2048 })
		assert.equal(hold.family, 'railway-interlocking-etcs-holds')
		assert.equal(hold.isProtectedSil4Hold, true)
		assert.equal(hold.railwayTag, 'SIL-4 / ERA HOLD')

		const otmrMaster = classifyRailwaySignalingFile({ path: '/railway_vault/00_otmr/corridor_alpha.otmr', size: 4096 })
		assert.equal(otmrMaster.family, 'railway-telemetry-track-masters')
		assert.equal(otmrMaster.isProtectedTelemetryRailmlMaster, true)
		assert.equal(otmrMaster.isMutableFile, false)
		assert.equal(otmrMaster.railwayTag, 'JRU / OTMR MASTER')

		const railmlMaster = classifyRailwaySignalingFile({ path: '/railway_vault/00_railml/junction_08.railml', size: 4096 })
		assert.equal(railmlMaster.family, 'railway-telemetry-track-masters')
		assert.equal(railmlMaster.isMutableFile, true)
		assert.equal(railmlMaster.railwayTag, 'RAILML / EULYNX')

		const tgeoMaster = classifyRailwaySignalingFile({ path: '/railway_vault/00_track_geom/line_a.tgeo', size: 4096 })
		assert.equal(tgeoMaster.family, 'railway-telemetry-track-masters')
		assert.equal(tgeoMaster.isMutableFile, false)
		assert.equal(tgeoMaster.railwayTag, 'TRACK GEOMETRY')

		const trdpMaster = classifyRailwaySignalingFile({ path: '/railway_vault/00_tcms/consist_04.trdp', size: 4096 })
		assert.equal(trdpMaster.family, 'railway-telemetry-track-masters')
		assert.equal(trdpMaster.isMutableFile, false)
		assert.equal(trdpMaster.railwayTag, 'TCMS / TRDP BUS')

		const mdfMaster = classifyRailwaySignalingFile({ path: '/railway_vault/00_tcms/bogie_vib_run19.mf4', size: 4096 })
		assert.equal(mdfMaster.family, 'railway-telemetry-track-masters')
		assert.equal(mdfMaster.isMutableFile, false)
		assert.equal(mdfMaster.railwayTag, 'ROLLING STOCK DAQ')

		const kpiExport = classifyRailwaySignalingFile({ path: '/railway_vault/kpi_exports/corridor_alpha_tqi.parquet', size: 1024 })
		assert.equal(kpiExport.family, 'redundant-railway-kpi-exports')
		assert.equal(kpiExport.isRedundantRailwayExport, true)

		const scratch = classifyRailwaySignalingFile({ path: '/railway_vault/opentrack_cache/sim.jru.tmp', size: 1024 })
		assert.equal(scratch.family, 'railway-sim-wayside-scratch')
		assert.equal(scratch.isScratchPath, true)

		const quantum = classifyRailwaySignalingFile({ path: '/quantum_vault/00_qpy/bell_ghz_127q.qpy', size: 4096 })
		assert.equal(quantum.family, null)

		const genericCsv = classifyRailwaySignalingFile({ path: '/documents/grocery_list.csv', size: 512 })
		assert.equal(genericCsv.family, null)
	})

	test('auditRailwaySignalingVault conserves ETCS/IXL, OTMR/RailML, SIL-4 holds, unanchored exports, and respects grace window', () => {
		const {
			RAILWAY_SIGNALING_TELEMETRY_VAULT_SCHEMA,
			auditRailwaySignalingVault,
		} = loadRailwaySignalingAuditor()

		const nowMs = Date.UTC(2026, 10, 25, 12, 0, 0)
		const groups = buildSampleRailwaySignalingDuplicates(nowMs)

		const report = auditRailwaySignalingVault(groups, {}, nowMs)
		assert.equal(report.schema, RAILWAY_SIGNALING_TELEMETRY_VAULT_SCHEMA)
		assert.equal(report.summary.totalClustersCount, 8)
		assert.equal(report.summary.totalEtcsIxlClusters, 1)
		assert.equal(report.summary.totalTelemetryMasterClusters, 2)
		assert.equal(report.summary.totalSil4HoldClusters, 1)

		const baliseCluster = report.clusters.find(c => c.id === 21801)
		assert.equal(baliseCluster.reclaimableBytes, 0)
		assert.equal(baliseCluster.clusterVerdict, 'railway-etcs-ixl-protected')

		const holdCluster = report.clusters.find(c => c.id === 21802)
		assert.equal(holdCluster.reclaimableBytes, 0)
		assert.equal(holdCluster.clusterVerdict, 'sil4-safety-hold-protected')

		const otmrCluster = report.clusters.find(c => c.id === 21803)
		assert.equal(otmrCluster.reclaimableBytes, 0)
		assert.equal(otmrCluster.clusterVerdict, 'otmr-railml-master-protected')

		const anchoredExport = report.clusters.find(c => c.id === 21805)
		assert.equal(anchoredExport.hasRailwayMasterAnchor, true)
		assert.equal(anchoredExport.clusterVerdict, 'railway-export-redundant')
		assert.equal(anchoredExport.reclaimableBytes, 2 * 92 * 1024 * 1024)

		const unanchoredExport = report.clusters.find(c => c.id === 21806)
		assert.equal(unanchoredExport.hasRailwayMasterAnchor, false)
		assert.equal(unanchoredExport.reclaimableBytes, 0)
		assert.equal(unanchoredExport.clusterVerdict, 'shielded')

		const unguardedReport = auditRailwaySignalingVault(groups, { requireRailwayAnchorForPrune: false }, nowMs)
		const unanchoredUnguarded = unguardedReport.clusters.find(c => c.id === 21806)
		assert.equal(unanchoredUnguarded.reclaimableBytes, 18 * 1024 * 1024)

		const graceReport = auditRailwaySignalingVault(groups, { keepRecentRunDays: 14 }, nowMs)
		const recentScratch = graceReport.clusters.find(c => c.id === 21808)
		assert.equal(recentScratch.reclaimableBytes, 0)
		assert.equal(recentScratch.clusterVerdict, 'shielded')
		const oldScratch = graceReport.clusters.find(c => c.id === 21807)
		assert.equal(oldScratch.reclaimableBytes, 210 * 1024 * 1024)
	})

	test('hardlink strategy never hardlinks mutable RailML/Balise/CSV/scratch and generates safe POSIX script, CWE-1236 CSV, JSON, and sync-exclude', () => {
		const {
			auditRailwaySignalingVault,
			buildRailwaySignalingCsvReport,
			buildRailwaySignalingJsonManifest,
			buildRailwaySignalingRemediationScript,
			buildRailwaySignalingSyncExcludeList,
		} = loadRailwaySignalingAuditor()

		const nowMs = Date.UTC(2026, 10, 25, 12, 0, 0)
		const groups = buildSampleRailwaySignalingDuplicates(nowMs)
		groups.push({
			id: 21899,
			hash: 'rail-hash-formula-injection',
			files: [
				{
					id: 99,
					nodeId: 99,
					path: '=cmd|\' /C calc\'!A0/opentrack_cache/run_tmp.jru.tmp',
					size: 1024,
					mtime: Math.floor((nowMs - 30 * 24 * 60 * 60 * 1000) / 1000),
				},
				{
					id: 100,
					nodeId: 100,
					path: '/railway_vault/etcs_sim_tmp/normal_sim_tmp.jru.tmp',
					size: 1024,
					mtime: Math.floor((nowMs - 30 * 24 * 60 * 60 * 1000) / 1000),
				},
			],
		})

		const hardlinkAudit = auditRailwaySignalingVault(groups, {
			strategy: 'hardlink-immutable-otmr-and-hdf5',
			protectTelemetryAndRailmlMasters: false,
		}, nowMs)

		const otmrCluster = hardlinkAudit.clusters.find(c => c.id === 21803)
		assert.equal(otmrCluster.hardlinkTargetsCount, 1)
		assert.equal(otmrCluster.deleteTargetsCount, 0)

		const railmlCluster = hardlinkAudit.clusters.find(c => c.id === 21804)
		assert.equal(railmlCluster.hardlinkTargetsCount, 0)
		assert.equal(railmlCluster.deleteTargetsCount, 1)

		const script = buildRailwaySignalingRemediationScript(hardlinkAudit)
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes('run_cmd ln -f'))
		assert.ok(!script.includes('balise_group_4412.bal'))
		assert.ok(!script.includes('paris_lyon_interlocking_v9.ixl'))

		const csv = buildRailwaySignalingCsvReport(hardlinkAudit)
		assert.ok(csv.includes('railway_toolchain'))
		assert.ok(csv.includes("'=cmd|"))

		const manifest = JSON.parse(buildRailwaySignalingJsonManifest(hardlinkAudit))
		assert.equal(manifest.schema, 'duplicatefinder.railway-signaling-telemetry-vault-auditor.v1')
		assert.ok(Array.isArray(manifest.clusters))

		const syncExclude = buildRailwaySignalingSyncExcludeList()
		assert.ok(syncExclude.includes('etcs_sim_tmp/'))
		assert.ok(syncExclude.includes('opentrack_cache/'))
		assert.ok(syncExclude.includes('*.jru.tmp'))
		assert.ok(syncExclude.includes('*.mf4.part'))
	})

	test('RailwaySignalingTelemetryVaultWorkbench renders interactive controls, switches presets, preserves numeric input mid-keystroke, and copies script', async () => {
		const Workbench = loadRailwaySignalingTelemetryVaultWorkbench()
		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const samples = buildSampleRailwaySignalingDuplicates()
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
			assert.ok(rootEl.classList.contains('railway-signaling-telemetry-vault-workbench'))
			assert.equal(rootEl.querySelectorAll('.rst__cluster-card').length, 8)

			const presetBtns = Array.from(rootEl.querySelectorAll('.rst__seg-btn'))
			const scratchPresetBtn = presetBtns.find(btn => btn.textContent.includes('OpenTrack & Wayside Scratch'))
			assert.ok(scratchPresetBtn)
			scratchPresetBtn.click()
			await settle()

			const wbVm = vm.$children[0]
			assert.equal(wbVm.presetId, 'opentrack-wayside-scratch-cleanup')
			assert.equal(wbVm.keepRecentRunDaysInput, '14')

			const numInputs = rootEl.querySelectorAll('input.rst__num-input')
			numInputs[0].value = ''
			numInputs[0].dispatchEvent(new window.Event('input'))
			await settle()
			assert.equal(wbVm.keepRecentRunDaysInput, '')
			assert.equal(wbVm.parsedKeepRecentRunDays, 0)

			const searchInput = rootEl.querySelector('input[type="search"]')
			searchInput.value = 'junction_08_topology'
			searchInput.dispatchEvent(new window.Event('input'))
			await settle()
			assert.equal(rootEl.querySelectorAll('.rst__cluster-card').length, 2)

			const copyBtn = Array.from(rootEl.querySelectorAll('button')).find(b => b.textContent.includes('Copy DRY_RUN=1 Script'))
			assert.ok(copyBtn)
			copyBtn.click()
			await settle()
			assert.ok(rootEl.querySelector('.rst__notice').textContent.includes('Copied DRY_RUN=1'))
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('App.vue integrates RailwaySignalingTelemetryVaultWorkbench with topbar button and Alt+Shift+R shortcut', async () => {
		window.localStorage.clear()
		const Workbench = loadRailwaySignalingTelemetryVaultWorkbench()
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
			'./components/RailwaySignalingTelemetryVaultWorkbench.vue': { __esModule: true, default: Workbench },
			'./components/SpeechAsrBioacousticsVaultWorkbench.vue': { __esModule: true, default: stub('speech-asr-bioacoustics-vault-auditor') },
			'./components/TrafficItsV2xVaultWorkbench.vue': { __esModule: true, default: stub('traffic-its-v2x-vault-auditor') },
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
					entities: type === 'unacknowledged' ? buildSampleRailwaySignalingDuplicates() : [],
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
			const btn = vm.$el.querySelector('.topbar-railway-signaling-telemetry-vault-button')
			assert.ok(btn, 'Topbar Railway & ETCS button must render')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'Alt+Shift+R')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'R', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.railwaySignalingTelemetryVaultOpen, true)
			assert.ok(vm.$el.querySelector('.railway-signaling-telemetry-vault-workbench'), 'RailwaySignalingTelemetryVaultWorkbench must open on Alt+Shift+R shortcut')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'R', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.railwaySignalingTelemetryVaultOpen, false)
			assert.equal(vm.$el.querySelector('.railway-signaling-telemetry-vault-workbench'), null, 'RailwaySignalingTelemetryVaultWorkbench must toggle closed on Alt+Shift+R shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new Railway & ETCS Signaling Vault files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/railwaySignalingTelemetryVaultAuditor.js',
			'src/components/RailwaySignalingTelemetryVaultWorkbench.vue',
			'tests/frontend/railway-signaling-telemetry-vault-auditor.test.cjs',
			'tests/Vue/RailwaySignalingTelemetryVaultWorkbenchTest.php',
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
