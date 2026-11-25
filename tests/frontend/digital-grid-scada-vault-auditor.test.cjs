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

function loadDigitalGridScadaAuditor() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/digitalGridScadaVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function loadDigitalGridScadaVaultWorkbench(clipboardOverrides = {}) {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const auditor = loadModule('src/tools/digitalGridScadaVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
	return loadComponent('src/components/DigitalGridScadaVaultWorkbench.vue', {
		'../tools/clipboardHelper': {
			copyTextSafely: async () => true,
			...clipboardOverrides,
		},
		'../tools/duplicateStats': duplicateStats,
		'../tools/digitalGridScadaVaultAuditor': auditor,
	})
}

function buildSampleDigitalGridScadaDuplicates(referenceNowMs = Date.UTC(2026, 10, 24, 12, 0, 0)) {
	const oldMtime = Math.floor((referenceNowMs - 40 * 24 * 60 * 60 * 1000) / 1000)
	const recentMtime = Math.floor((referenceNowMs - 2 * 24 * 60 * 60 * 1000) / 1000)

	return [
		{
			id: 20401,
			hash: 'grid-hash-iec61850-scd',
			files: [
				{
					id: 1,
					nodeId: 1,
					path: '/grid_vault/00_nerc_cip/iec61850/substation_alpha_230kv.scd',
					size: 18 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 2,
					nodeId: 2,
					path: '/grid_vault/work/substation_alpha_230kv/substation_alpha_230kv.scd',
					size: 18 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20402,
			hash: 'grid-hash-prc002-fault-evidence',
			files: [
				{
					id: 3,
					nodeId: 3,
					path: '/grid_vault/nerc_cip/prc-002/fault_evidence/breaker_trip_230kv_line4.cff',
					size: 46 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 4,
					nodeId: 4,
					path: '/grid_vault/mirror/prc-002/fault_evidence/breaker_trip_230kv_line4.cff',
					size: 46 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20403,
			hash: 'grid-hash-comtrade-anchor',
			files: [
				{
					id: 5,
					nodeId: 5,
					path: '/grid_vault/comtrade_vault/substation_beta_line12/disturbance_line12_2026.cff',
					size: 320 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 6,
					nodeId: 6,
					path: '/grid_vault/mirror/comtrade/disturbance_line12_2026.cff',
					size: 320 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20404,
			hash: 'grid-hash-scada-csv-redundant',
			files: [
				{
					id: 7,
					nodeId: 7,
					path: '/grid_vault/exports/comtrade/disturbance_line12_2026_waveform.csv',
					size: 640 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 8,
					nodeId: 8,
					path: '/grid_vault/scada/historian/disturbance_line12_2026_waveform.csv',
					size: 640 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20405,
			hash: 'grid-hash-scada-csv-unanchored',
			files: [
				{
					id: 9,
					nodeId: 9,
					path: '/grid_vault/scada/feeder_voltage_unanchored.csv',
					size: 190 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 10,
					nodeId: 10,
					path: '/grid_vault/scada/copy/feeder_voltage_unanchored.csv',
					size: 190 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20406,
			hash: 'grid-hash-pscad-model-anchor',
			files: [
				{
					id: 11,
					nodeId: 11,
					path: '/grid_vault/production_cases/pscad/hvdc_substation_study.pscx',
					size: 110 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 12,
					nodeId: 12,
					path: '/grid_vault/mirror/pscad/hvdc_substation_study.pscx',
					size: 110 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20407,
			hash: 'grid-hash-emtp-pl4-redundant',
			files: [
				{
					id: 13,
					nodeId: 13,
					path: '/grid_vault/pscad/exports/hvdc_substation_study_plot.pl4',
					size: 280 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 14,
					nodeId: 14,
					path: '/grid_vault/emtp/exports/hvdc_substation_study_plot.pl4',
					size: 280 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20408,
			hash: 'grid-hash-pscad-scratch',
			files: [
				{
					id: 15,
					nodeId: 15,
					path: '/grid_vault/study_a/pscad_tmp/transient_run_09.cfg.tmp',
					size: 150 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 16,
					nodeId: 16,
					path: '/grid_vault/study_b/pscad_tmp/transient_run_09.cfg.tmp',
					size: 150 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20409,
			hash: 'non-grid-unrelated',
			files: [
				{
					id: 17,
					nodeId: 17,
					path: '/personal/photos/weekend_trip.jpg',
					size: 8 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 18,
					nodeId: 18,
					path: '/personal/backup/weekend_trip.jpg',
					size: 8 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
	]
}

describe('Cycle 204: Digital Grid, Substation SCADA & Synchrophasor Vault Auditor (pure logic)', () => {
	test('classifies Digital Grid families, detects toolchains, and shields NERC CIP, PRC-002, SCL, and COMTRADE/PMU anchors', () => {
		const {
			DIGITAL_GRID_SCADA_VAULT_SCHEMA,
			classifyDigitalGridScadaFile,
			isDigitalGridScadaGroup,
			auditDigitalGridScadaVault,
		} = loadDigitalGridScadaAuditor()

		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = buildSampleDigitalGridScadaDuplicates(nowMs)

		assert.equal(classifyDigitalGridScadaFile({ path: '/personal/photos/weekend_trip.jpg', size: 1024 }).family, null)
		assert.equal(isDigitalGridScadaGroup(groups[8]), false)
		assert.equal(isDigitalGridScadaGroup(groups[0]), true)

		const scdMeta = classifyDigitalGridScadaFile(groups[0].files[0], nowMs)
		assert.equal(scdMeta.family, 'nerc-cip-substation-scl')
		assert.equal(scdMeta.gridToolchain, 'IEC 61850 SCL')
		assert.equal(scdMeta.isProtectedNercCipScl, true)
		assert.equal(scdMeta.gridTag, 'NERC CIP')

		const prcMeta = classifyDigitalGridScadaFile(groups[1].files[0], nowMs)
		assert.equal(prcMeta.family, 'nerc-cip-substation-scl')
		assert.equal(prcMeta.isProtectedFaultEvidence, true)
		assert.equal(prcMeta.gridTag, 'NERC PRC-002')

		const comtradeMeta = classifyDigitalGridScadaFile(groups[2].files[0], nowMs)
		assert.equal(comtradeMeta.family, 'comtrade-pmu-grid-anchors')
		assert.equal(comtradeMeta.isComtradePmuAnchor, true)

		const scratchMeta = classifyDigitalGridScadaFile(groups[7].files[0], nowMs)
		assert.equal(scratchMeta.family, 'grid-solver-scada-scratch')
		assert.equal(scratchMeta.isGridScratchPath, true)
		assert.equal(scratchMeta.gridToolchain, 'PSCAD / EMTDC')

		const report = auditDigitalGridScadaVault(groups, {}, nowMs)
		assert.equal(report.schema, DIGITAL_GRID_SCADA_VAULT_SCHEMA)
		assert.equal(report.summary.totalDomainGroupsCount, 8)
		assert.equal(report.summary.totalClustersCount, 8)

		const scdCluster = report.clusters.find(c => c.id === 20401)
		assert.equal(scdCluster.clusterVerdict, 'nerc-cip-scl-protected')
		assert.equal(scdCluster.reclaimableBytes, 0)
		assert.ok(scdCluster.members.every(m => m.shielded && m.action === 'keep'))

		const prcCluster = report.clusters.find(c => c.id === 20402)
		assert.equal(prcCluster.clusterVerdict, 'fault-evidence-protected')
		assert.equal(prcCluster.reclaimableBytes, 0)

		const comtradeCluster = report.clusters.find(c => c.id === 20403)
		assert.equal(comtradeCluster.clusterVerdict, 'comtrade-pmu-protected')
		assert.equal(comtradeCluster.reclaimableBytes, 0)

		// Redundant SCADA CSV backed by COMTRADE .cff anchor -> both copies reclaimable
		const csvCluster = report.clusters.find(c => c.id === 20404)
		assert.equal(csvCluster.clusterVerdict, 'scada-export-redundant')
		assert.equal(csvCluster.hasComtradePmuAnchor, true)
		assert.equal(csvCluster.reclaimableTargetsCount, 2)
		assert.equal(csvCluster.reclaimableBytes, 2 * 640 * 1024 * 1024)

		// Unanchored SCADA CSV -> blocked while requireComtradeAnchorForPrune is true
		const unanchoredCsv = report.clusters.find(c => c.id === 20405)
		assert.equal(unanchoredCsv.hasComtradePmuAnchor, false)
		assert.equal(unanchoredCsv.reclaimableBytes, 0)
		assert.ok(unanchoredCsv.members.every(m => m.shielded))

		// Redundant EMTP/PSCAD .pl4 backed by .pscx anchor -> both copies reclaimable
		const pl4Cluster = report.clusters.find(c => c.id === 20407)
		assert.equal(pl4Cluster.clusterVerdict, 'scada-export-redundant')
		assert.equal(pl4Cluster.hasComtradePmuAnchor, true)
		assert.equal(pl4Cluster.reclaimableTargetsCount, 2)

		// pscad_tmp scratch -> 1 non-survivor copy reclaimable
		const scratchCluster = report.clusters.find(c => c.id === 20408)
		assert.equal(scratchCluster.clusterVerdict, 'grid-scratch-intermediate')
		assert.equal(scratchCluster.reclaimableTargetsCount, 1)
		assert.equal(scratchCluster.reclaimableBytes, 150 * 1024 * 1024)
	})

	test('respects keepRecentGridEventDays grace window, hardlink safety on mutable files, and per-copy overrides', () => {
		const { auditDigitalGridScadaVault } = loadDigitalGridScadaAuditor()
		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = buildSampleDigitalGridScadaDuplicates(nowMs)

		// With 14-day event grace window, recent (2-day-old) scratch copy is shielded
		const graceReport = auditDigitalGridScadaVault(groups, {
			presetId: 'grid-solver-scratch-cleanup',
			keepRecentGridEventDays: 14,
		}, nowMs)
		const scratchWithGrace = graceReport.clusters.find(c => c.id === 20408)
		assert.equal(scratchWithGrace.reclaimableBytes, 0)
		assert.ok(scratchWithGrace.members.every(m => m.shielded))

		// Hardlink strategy with shields disabled hardlinks immutable .cff, never mutable .scd or .csv
		const hardlinkReport = auditDigitalGridScadaVault(groups, {
			strategy: 'hardlink-immutable-comtrade-and-pmu',
			protectComtradePmuAnchors: false,
			protectNercCipAndScl: false,
			requireComtradeAnchorForPrune: false,
		}, nowMs)
		const comtradeHardlink = hardlinkReport.clusters.find(c => c.id === 20403)
		assert.equal(comtradeHardlink.hardlinkTargetsCount, 1)
		assert.equal(comtradeHardlink.deleteTargetsCount, 0)

		const scdMutable = hardlinkReport.clusters.find(c => c.id === 20401)
		assert.equal(scdMutable.hardlinkTargetsCount, 0)
		assert.equal(scdMutable.deleteTargetsCount, 1)

		// Per-copy override: keep a redundant SCADA CSV member and prune an unanchored CSV copy
		const overrideReport = auditDigitalGridScadaVault(groups, {
			memberOverrides: {
				7: 'keep',
				10: 'prune',
			},
		}, nowMs)
		const csvCluster = overrideReport.clusters.find(c => c.id === 20404)
		assert.equal(csvCluster.members.find(m => m.id === 7).shielded, true)
		assert.equal(csvCluster.members.find(m => m.id === 7).action, 'keep')
		assert.equal(csvCluster.reclaimableTargetsCount, 1)

		const unanchoredCsv = overrideReport.clusters.find(c => c.id === 20405)
		assert.equal(unanchoredCsv.members.find(m => m.id === 10).shielded, false)
		assert.equal(unanchoredCsv.members.find(m => m.id === 10).action, 'delete')
		assert.equal(unanchoredCsv.reclaimableTargetsCount, 1)
	})

	test('generates safe DRY_RUN=1 POSIX script, CWE-1236 CSV, JSON manifest, and .sync-exclude.lst rules', () => {
		const {
			DIGITAL_GRID_SCADA_VAULT_SCHEMA,
			auditDigitalGridScadaVault,
			buildDigitalGridScadaRemediationScript,
			buildDigitalGridScadaCsvReport,
			buildDigitalGridScadaJsonManifest,
			buildDigitalGridScadaSyncExcludeList,
		} = loadDigitalGridScadaAuditor()

		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = [
			...buildSampleDigitalGridScadaDuplicates(nowMs),
			{
				id: 20499,
				hash: 'grid-cwe1236-injection',
				files: [
					{
						id: 99,
						nodeId: 99,
						path: "/grid_vault/pscad_tmp/=CMD('calc')'run.cfg.tmp",
						size: 12 * 1024 * 1024,
						mtime: Math.floor((nowMs - 30 * 24 * 60 * 60 * 1000) / 1000),
					},
					{
						id: 100,
						nodeId: 100,
						path: '/grid_vault/pscad_tmp/clean_case.cfg.tmp',
						size: 12 * 1024 * 1024,
						mtime: Math.floor((nowMs - 20 * 24 * 60 * 60 * 1000) / 1000),
					},
				],
			},
		]

		const audit = auditDigitalGridScadaVault(groups, {
			strategy: 'quarantine-exports-and-grid-scratch',
		}, nowMs)

		const script = buildDigitalGridScadaRemediationScript(audit)
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes('mv -n'))
		assert.ok(!script.includes('substation_alpha_230kv.scd'))
		assert.ok(!script.includes('breaker_trip_230kv_line4.cff'))

		const csv = buildDigitalGridScadaCsvReport(audit)
		assert.ok(csv.includes('cluster_id,cluster_name,grid_toolchain'))
		assert.ok(csv.includes('"\'=CMD('))

		const manifest = JSON.parse(buildDigitalGridScadaJsonManifest(audit))
		assert.equal(manifest.schema, DIGITAL_GRID_SCADA_VAULT_SCHEMA)
		assert.ok(Array.isArray(manifest.clusters))
		assert.ok(manifest.clusters.length >= 8)

		const syncExclude = buildDigitalGridScadaSyncExcludeList()
		assert.ok(syncExclude.includes('pscad_tmp/'))
		assert.ok(syncExclude.includes('psse_scratch/'))
		assert.ok(syncExclude.includes('powerfactory_tmp/'))
		assert.ok(syncExclude.includes('*.cfg.tmp'))
	})
})

describe('Cycle 204: DigitalGridScadaVaultWorkbench Vue component & App.vue Alt+Shift+D integration', () => {
	test('renders empty state, allows pre-scan configuration, and emits start-scan', async () => {
		const DigitalGridScadaVaultWorkbench = loadDigitalGridScadaVaultWorkbench()
		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)

		const vm = new Vue({
			render: h => h(DigitalGridScadaVaultWorkbench, {
				props: { duplicates: [], allDuplicates: [] },
				on: { 'start-scan': () => { vm.__scanStarted = true } },
			}),
		}).$mount(mountNode)

		try {
			await settle()
			assert.ok(vm.$el.querySelector('.dgs__empty-banner'))
			const scanBtn = vm.$el.querySelector('.dgs__primary-btn')
			assert.ok(scanBtn)
			scanBtn.click()
			await settle()
			assert.equal(vm.__scanStarted, true)
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('filters clusters, keeps controlled numeric inputs unclamped mid-keystroke, and handles clipboard/overrides/actions', async () => {
		const copied = []
		const DigitalGridScadaVaultWorkbench = loadDigitalGridScadaVaultWorkbench({
			copyTextSafely: async (text) => {
				copied.push(text)
				return true
			},
		})
		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = buildSampleDigitalGridScadaDuplicates(nowMs)
		let selectedDup = null
		let comparedDup = null
		let closed = false

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue({
			render: h => h(DigitalGridScadaVaultWorkbench, {
				props: {
					duplicates: groups,
					allDuplicates: groups,
					currentDuplicateId: 20404,
				},
				on: {
					'select-duplicate': (d) => { selectedDup = d },
					'compare-duplicate': (d) => { comparedDup = d },
					close: () => { closed = true },
				},
			}),
		}).$mount(mountNode)

		try {
			await settle()
			const child = vm.$children[0]
			assert.equal(child.analysis.summary.totalClustersCount, 8)
			assert.equal(child.selectedCluster.id, 20404)

			// Controlled numeric inputs must allow empty intermediate typing without mid-keystroke clamping
			const numInputs = vm.$el.querySelectorAll('.dgs__num-input')
			assert.equal(numInputs.length, 2)
			numInputs[0].value = ''
			numInputs[0].dispatchEvent(new window.Event('input'))
			await settle()
			assert.equal(child.keepRecentGridEventDaysInput, '')
			assert.equal(child.parsedKeepRecentGridEventDays, 0)

			// Apply preset for IEC 61850 SCL & NERC CIP Shield
			const presetBtns = Array.from(vm.$el.querySelectorAll('.dgs__control-row .dgs__seg-btn'))
			const sclBtn = presetBtns.find(b => b.textContent.includes('IEC 61850 SCL & NERC CIP Shield'))
			assert.ok(sclBtn)
			sclBtn.click()
			await settle()
			assert.equal(child.familyFilter, 'nerc-cip-substation-scl')
			assert.equal(child.analysis.summary.totalClustersCount, 2)

			// Switch back to All Digital Grid & SCADA Vaults preset
			const allBtn = presetBtns.find(b => b.textContent.includes('All Digital Grid & SCADA Vaults'))
			allBtn.click()
			await settle()
			assert.equal(child.analysis.summary.totalClustersCount, 8)

			// Copy script and sync-exclude
			const copyScriptBtn = Array.from(vm.$el.querySelectorAll('.dgs__tool-btn')).find(b => b.textContent.includes('Copy DRY_RUN=1 Script'))
			copyScriptBtn.click()
			await settle()
			assert.ok(copied.some(item => item.includes('DRY_RUN="${DRY_RUN:-1}"')))

			// Triage & Side-by-Side emissions
			const triageBtn = Array.from(vm.$el.querySelectorAll('.dgs__inspector-actions .dgs__tool-btn')).find(b => b.textContent.includes('Open in Triage'))
			triageBtn.click()
			await settle()
			assert.equal(selectedDup.id, 20404)

			const compareBtn = Array.from(vm.$el.querySelectorAll('.dgs__inspector-actions .dgs__tool-btn')).find(b => b.textContent.includes('Side-by-Side'))
			compareBtn.click()
			await settle()
			assert.equal(comparedDup.id, 20404)

			const closeBtn = vm.$el.querySelector('.dgs__tool-btn.is-close')
			closeBtn.click()
			await settle()
			assert.equal(closed, true)
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('App.vue renders Digital Grid Vault topbar button and toggles DigitalGridScadaVaultWorkbench via Alt+Shift+D', async () => {
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
		const DigitalGridScadaVaultWorkbench = loadDigitalGridScadaVaultWorkbench()

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
			'./components/DigitalGridScadaVaultWorkbench.vue': { __esModule: true, default: DigitalGridScadaVaultWorkbench },
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
					entities: type === 'unacknowledged' ? buildSampleDigitalGridScadaDuplicates() : [],
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
			const btn = vm.$el.querySelector('.topbar-digital-grid-scada-vault-button')
			assert.ok(btn, 'Topbar Digital Grid Vault button must render')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'Alt+Shift+D')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'D', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.digitalGridScadaVaultOpen, true)
			assert.ok(vm.$el.querySelector('.digital-grid-scada-vault-workbench'), 'DigitalGridScadaVaultWorkbench must open on Alt+Shift+D shortcut')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'D', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.digitalGridScadaVaultOpen, false)
			assert.equal(vm.$el.querySelector('.digital-grid-scada-vault-workbench'), null, 'DigitalGridScadaVaultWorkbench must toggle closed on Alt+Shift+D shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new Digital Grid & SCADA Vault files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/digitalGridScadaVaultAuditor.js',
			'src/components/DigitalGridScadaVaultWorkbench.vue',
			'tests/frontend/digital-grid-scada-vault-auditor.test.cjs',
			'tests/Vue/DigitalGridScadaVaultWorkbenchTest.php',
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
