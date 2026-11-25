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

function loadEnergySeismicAuditor() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/energySeismicVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function loadEnergySeismicVaultWorkbench(clipboardOverrides = {}) {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const auditor = loadModule('src/tools/energySeismicVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
	return loadComponent('src/components/EnergySeismicVaultWorkbench.vue', {
		'../tools/clipboardHelper': {
			copyTextSafely: async () => true,
			...clipboardOverrides,
		},
		'../tools/duplicateStats': duplicateStats,
		'../tools/energySeismicVaultAuditor': auditor,
	})
}

function buildSampleEnergySeismicDuplicates(referenceNowMs = Date.UTC(2026, 10, 24, 12, 0, 0)) {
	const oldMtime = Math.floor((referenceNowMs - 40 * 24 * 60 * 60 * 1000) / 1000)
	const recentMtime = Math.floor((referenceNowMs - 2 * 24 * 60 * 60 * 1000) / 1000)

	return [
		{
			id: 20501,
			hash: 'energy-hash-osdu-welllog-las',
			files: [
				{
					id: 1,
					nodeId: 1,
					path: '/energy_vault/00_osdu/well_logs/north_sea_well_15_9_f14.las',
					size: 24 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 2,
					nodeId: 2,
					path: '/energy_vault/work/petrel/well_15_9_f14/north_sea_well_15_9_f14.las',
					size: 24 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20502,
			hash: 'energy-hash-bsee-ccus-evidence',
			files: [
				{
					id: 3,
					nodeId: 3,
					path: '/energy_vault/compliance/bsee/ccus_permit/sleipner_co2_injection_2026.dlis',
					size: 62 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 4,
					nodeId: 4,
					path: '/energy_vault/mirror/bsee/ccus_permit/sleipner_co2_injection_2026.dlis',
					size: 62 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20503,
			hash: 'energy-hash-segy-seismic-anchor',
			files: [
				{
					id: 5,
					nodeId: 5,
					path: '/energy_vault/seismic_vault/3d_survey/block9_psdm_depth_stack.segy',
					size: 980 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 6,
					nodeId: 6,
					path: '/energy_vault/mirror/seismic/block9_psdm_depth_stack.segy',
					size: 980 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20504,
			hash: 'energy-hash-seismic-ascii-redundant',
			files: [
				{
					id: 7,
					nodeId: 7,
					path: '/energy_vault/exports/seismic/block9_psdm_depth_stack_trace_dump.csv',
					size: 420 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 8,
					nodeId: 8,
					path: '/energy_vault/kingdom/ascii/block9_psdm_depth_stack_trace_dump.csv',
					size: 420 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20505,
			hash: 'energy-hash-ascii-unanchored',
			files: [
				{
					id: 9,
					nodeId: 9,
					path: '/energy_vault/seismic/horizon_pick_unanchored.xyz',
					size: 160 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 10,
					nodeId: 10,
					path: '/energy_vault/seismic/copy/horizon_pick_unanchored.xyz',
					size: 160 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20506,
			hash: 'energy-hash-eclipse-reservoir-anchor',
			files: [
				{
					id: 11,
					nodeId: 11,
					path: '/energy_vault/production_models/eclipse/volve_history_match.unrst',
					size: 310 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 12,
					nodeId: 12,
					path: '/energy_vault/mirror/eclipse/volve_history_match.unrst',
					size: 310 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20507,
			hash: 'energy-hash-eclipse-rsm-redundant',
			files: [
				{
					id: 13,
					nodeId: 13,
					path: '/energy_vault/eclipse/exports/volve_history_match_summary.rsm',
					size: 85 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 14,
					nodeId: 14,
					path: '/energy_vault/tnavigator/exports/volve_history_match_summary.rsm',
					size: 85 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20508,
			hash: 'energy-hash-petrel-scratch',
			files: [
				{
					id: 15,
					nodeId: 15,
					path: '/energy_vault/study_a/petrel_tmp/seismic_cube_04.sgy.tmp',
					size: 140 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 16,
					nodeId: 16,
					path: '/energy_vault/study_b/petrel_tmp/seismic_cube_04.sgy.tmp',
					size: 140 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20509,
			hash: 'non-energy-unrelated',
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

describe('Cycle 205: Energy, Seismic SEG-Y, Well-Log & Reservoir Simulation Vault Auditor (pure logic)', () => {
	test('classifies Energy & Seismic families, detects toolchains, and shields OSDU, BSEE/CCUS, SEG-Y, and Reservoir anchors', () => {
		const {
			ENERGY_SEISMIC_VAULT_SCHEMA,
			classifyEnergySeismicFile,
			isEnergySeismicGroup,
			auditEnergySeismicVault,
		} = loadEnergySeismicAuditor()

		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = buildSampleEnergySeismicDuplicates(nowMs)

		assert.equal(classifyEnergySeismicFile({ path: '/personal/photos/weekend_trip.jpg', size: 1024 }).family, null)
		assert.equal(isEnergySeismicGroup(groups[8]), false)
		assert.equal(isEnergySeismicGroup(groups[0]), true)

		const lasMeta = classifyEnergySeismicFile(groups[0].files[0], nowMs)
		assert.equal(lasMeta.family, 'osdu-well-log-compliance')
		assert.equal(lasMeta.subsurfaceToolchain, 'Well-Log LAS / DLIS')
		assert.equal(lasMeta.isProtectedWellLogOsdu, true)
		assert.equal(lasMeta.energyTag, 'OSDU')

		const bseeMeta = classifyEnergySeismicFile(groups[1].files[0], nowMs)
		assert.equal(bseeMeta.family, 'osdu-well-log-compliance')
		assert.equal(bseeMeta.isProtectedRegulatoryWell, true)
		assert.equal(bseeMeta.energyTag, 'BSEE / NSTA')

		const segyMeta = classifyEnergySeismicFile(groups[2].files[0], nowMs)
		assert.equal(segyMeta.family, 'seismic-reservoir-anchors')
		assert.equal(segyMeta.isSeismicReservoirAnchor, true)
		assert.equal(segyMeta.subsurfaceToolchain, 'SEG-Y Seismic')

		const scratchMeta = classifyEnergySeismicFile(groups[7].files[0], nowMs)
		assert.equal(scratchMeta.family, 'subsurface-sim-scratch')
		assert.equal(scratchMeta.isScratchPath, true)
		assert.equal(scratchMeta.subsurfaceToolchain, 'SLB Petrel')

		const report = auditEnergySeismicVault(groups, {}, nowMs)
		assert.equal(report.schema, ENERGY_SEISMIC_VAULT_SCHEMA)
		assert.equal(report.summary.totalDomainGroupsCount, 8)
		assert.equal(report.summary.totalClustersCount, 8)

		const lasCluster = report.clusters.find(c => c.id === 20501)
		assert.equal(lasCluster.clusterVerdict, 'osdu-welllog-protected')
		assert.equal(lasCluster.reclaimableBytes, 0)
		assert.ok(lasCluster.members.every(m => m.shielded && m.action === 'keep'))

		const bseeCluster = report.clusters.find(c => c.id === 20502)
		assert.equal(bseeCluster.clusterVerdict, 'regulatory-ccus-protected')
		assert.equal(bseeCluster.reclaimableBytes, 0)

		const segyCluster = report.clusters.find(c => c.id === 20503)
		assert.equal(segyCluster.clusterVerdict, 'seismic-reservoir-protected')
		assert.equal(segyCluster.reclaimableBytes, 0)

		// Redundant CSV trace dump backed by SEG-Y anchor -> both copies reclaimable
		const csvCluster = report.clusters.find(c => c.id === 20504)
		assert.equal(csvCluster.clusterVerdict, 'ascii-export-redundant')
		assert.equal(csvCluster.hasSeismicReservoirAnchor, true)
		assert.equal(csvCluster.reclaimableTargetsCount, 2)
		assert.equal(csvCluster.reclaimableBytes, 2 * 420 * 1024 * 1024)

		// Unanchored XYZ horizon -> blocked while requireSeismicAnchorForPrune is true
		const unanchoredXyz = report.clusters.find(c => c.id === 20505)
		assert.equal(unanchoredXyz.hasSeismicReservoirAnchor, false)
		assert.equal(unanchoredXyz.reclaimableBytes, 0)
		assert.ok(unanchoredXyz.members.every(m => m.shielded))

		// Redundant ECLIPSE .rsm backed by .unrst anchor -> both copies reclaimable
		const rsmCluster = report.clusters.find(c => c.id === 20507)
		assert.equal(rsmCluster.clusterVerdict, 'ascii-export-redundant')
		assert.equal(rsmCluster.hasSeismicReservoirAnchor, true)
		assert.equal(rsmCluster.reclaimableTargetsCount, 2)

		// petrel_tmp scratch -> 1 non-survivor copy reclaimable
		const scratchCluster = report.clusters.find(c => c.id === 20508)
		assert.equal(scratchCluster.clusterVerdict, 'sim-scratch-intermediate')
		assert.equal(scratchCluster.reclaimableTargetsCount, 1)
		assert.equal(scratchCluster.reclaimableBytes, 140 * 1024 * 1024)
	})

	test('respects keepRecentSurveyDays grace window, hardlink safety on mutable files, and per-copy overrides', () => {
		const { auditEnergySeismicVault } = loadEnergySeismicAuditor()
		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = buildSampleEnergySeismicDuplicates(nowMs)

		// With 14-day survey/processing grace window, recent (2-day-old) scratch copy is shielded
		const graceReport = auditEnergySeismicVault(groups, {
			presetId: 'subsurface-scratch-cleanup',
			keepRecentSurveyDays: 14,
		}, nowMs)
		const scratchWithGrace = graceReport.clusters.find(c => c.id === 20508)
		assert.equal(scratchWithGrace.reclaimableBytes, 0)
		assert.ok(scratchWithGrace.members.every(m => m.shielded))

		// Hardlink strategy with shields disabled hardlinks immutable .segy, never mutable .las or .csv
		const hardlinkReport = auditEnergySeismicVault(groups, {
			strategy: 'hardlink-immutable-seismic-and-unrst',
			protectSeismicReservoirAnchors: false,
			protectWellLogAndOsdu: false,
			requireSeismicAnchorForPrune: false,
		}, nowMs)
		const segyHardlink = hardlinkReport.clusters.find(c => c.id === 20503)
		assert.equal(segyHardlink.hardlinkTargetsCount, 1)
		assert.equal(segyHardlink.deleteTargetsCount, 0)

		const lasMutable = hardlinkReport.clusters.find(c => c.id === 20501)
		assert.equal(lasMutable.hardlinkTargetsCount, 0)
		assert.equal(lasMutable.deleteTargetsCount, 1)

		// Per-copy override: keep a redundant CSV member and prune an unanchored XYZ copy
		const overrideReport = auditEnergySeismicVault(groups, {
			memberOverrides: {
				7: 'keep',
				10: 'prune',
			},
		}, nowMs)
		const csvCluster = overrideReport.clusters.find(c => c.id === 20504)
		assert.equal(csvCluster.members.find(m => m.id === 7).shielded, true)
		assert.equal(csvCluster.members.find(m => m.id === 7).action, 'keep')
		assert.equal(csvCluster.reclaimableTargetsCount, 1)

		const unanchoredXyz = overrideReport.clusters.find(c => c.id === 20505)
		assert.equal(unanchoredXyz.members.find(m => m.id === 10).shielded, false)
		assert.equal(unanchoredXyz.members.find(m => m.id === 10).action, 'delete')
		assert.equal(unanchoredXyz.reclaimableTargetsCount, 1)
	})

	test('generates safe DRY_RUN=1 POSIX script, CWE-1236 CSV, JSON manifest, and .sync-exclude.lst rules', () => {
		const {
			ENERGY_SEISMIC_VAULT_SCHEMA,
			auditEnergySeismicVault,
			buildEnergySeismicRemediationScript,
			buildEnergySeismicCsvReport,
			buildEnergySeismicJsonManifest,
			buildEnergySeismicSyncExcludeList,
		} = loadEnergySeismicAuditor()

		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = [
			...buildSampleEnergySeismicDuplicates(nowMs),
			{
				id: 20599,
				hash: 'energy-cwe1236-injection',
				files: [
					{
						id: 99,
						nodeId: 99,
						path: "/energy_vault/petrel_tmp/=CMD('calc')'run.sgy.tmp",
						size: 12 * 1024 * 1024,
						mtime: Math.floor((nowMs - 30 * 24 * 60 * 60 * 1000) / 1000),
					},
					{
						id: 100,
						nodeId: 100,
						path: '/energy_vault/petrel_tmp/clean_case.sgy.tmp',
						size: 12 * 1024 * 1024,
						mtime: Math.floor((nowMs - 20 * 24 * 60 * 60 * 1000) / 1000),
					},
				],
			},
		]

		const audit = auditEnergySeismicVault(groups, {
			strategy: 'quarantine-exports-and-sim-scratch',
		}, nowMs)

		const script = buildEnergySeismicRemediationScript(audit)
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes('mv -n'))
		assert.ok(!script.includes('north_sea_well_15_9_f14.las'))
		assert.ok(!script.includes('sleipner_co2_injection_2026.dlis'))

		const csv = buildEnergySeismicCsvReport(audit)
		assert.ok(csv.includes('cluster_id,cluster_name,subsurface_toolchain'))
		assert.ok(csv.includes('"\'=CMD('))

		const manifest = JSON.parse(buildEnergySeismicJsonManifest(audit))
		assert.equal(manifest.schema, ENERGY_SEISMIC_VAULT_SCHEMA)
		assert.ok(Array.isArray(manifest.clusters))
		assert.ok(manifest.clusters.length >= 8)

		const syncExclude = buildEnergySeismicSyncExcludeList()
		assert.ok(syncExclude.includes('petrel_tmp/'))
		assert.ok(syncExclude.includes('eclipse_scratch/'))
		assert.ok(syncExclude.includes('tnav_cache/'))
		assert.ok(syncExclude.includes('*.sgy.tmp'))
	})
})

describe('Cycle 205: EnergySeismicVaultWorkbench Vue component & App.vue Alt+Shift+E integration', () => {
	test('renders empty state, allows pre-scan configuration, and emits start-scan', async () => {
		const EnergySeismicVaultWorkbench = loadEnergySeismicVaultWorkbench()
		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)

		const vm = new Vue({
			render: h => h(EnergySeismicVaultWorkbench, {
				props: { duplicates: [], allDuplicates: [] },
				on: { 'start-scan': () => { vm.__scanStarted = true } },
			}),
		}).$mount(mountNode)

		try {
			await settle()
			assert.ok(vm.$el.querySelector('.esv__empty-banner'))
			const scanBtn = vm.$el.querySelector('.esv__primary-btn')
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
		const EnergySeismicVaultWorkbench = loadEnergySeismicVaultWorkbench({
			copyTextSafely: async (text) => {
				copied.push(text)
				return true
			},
		})
		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = buildSampleEnergySeismicDuplicates(nowMs)
		let selectedDup = null
		let comparedDup = null
		let closed = false

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue({
			render: h => h(EnergySeismicVaultWorkbench, {
				props: {
					duplicates: groups,
					allDuplicates: groups,
					currentDuplicateId: 20504,
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
			assert.equal(child.selectedCluster.id, 20504)

			// Controlled numeric inputs must allow empty intermediate typing without mid-keystroke clamping
			const numInputs = vm.$el.querySelectorAll('.esv__num-input')
			assert.equal(numInputs.length, 2)
			numInputs[0].value = ''
			numInputs[0].dispatchEvent(new window.Event('input'))
			await settle()
			assert.equal(child.keepRecentSurveyDaysInput, '')
			assert.equal(child.parsedKeepRecentSurveyDays, 0)

			// Apply preset for Well-Log (.las/.dlis) & OSDU Shield
			const presetBtns = Array.from(vm.$el.querySelectorAll('.esv__control-row .esv__seg-btn'))
			const osduBtn = presetBtns.find(b => b.textContent.includes('Well-Log (.las/.dlis) & OSDU Shield'))
			assert.ok(osduBtn)
			osduBtn.click()
			await settle()
			assert.equal(child.familyFilter, 'osdu-well-log-compliance')
			assert.equal(child.analysis.summary.totalClustersCount, 2)

			// Switch back to All Energy & Subsurface Vaults preset
			const allBtn = presetBtns.find(b => b.textContent.includes('All Energy & Subsurface Vaults'))
			allBtn.click()
			await settle()
			assert.equal(child.analysis.summary.totalClustersCount, 8)

			// Copy script and sync-exclude
			const copyScriptBtn = Array.from(vm.$el.querySelectorAll('.esv__tool-btn')).find(b => b.textContent.includes('Copy DRY_RUN=1 Script'))
			copyScriptBtn.click()
			await settle()
			assert.ok(copied.some(item => item.includes('DRY_RUN="${DRY_RUN:-1}"')))

			// Triage & Side-by-Side emissions
			const triageBtn = Array.from(vm.$el.querySelectorAll('.esv__inspector-actions .esv__tool-btn')).find(b => b.textContent.includes('Open in Triage'))
			triageBtn.click()
			await settle()
			assert.equal(selectedDup.id, 20504)

			const compareBtn = Array.from(vm.$el.querySelectorAll('.esv__inspector-actions .esv__tool-btn')).find(b => b.textContent.includes('Side-by-Side'))
			compareBtn.click()
			await settle()
			assert.equal(comparedDup.id, 20504)

			const closeBtn = vm.$el.querySelector('.esv__tool-btn.is-close')
			closeBtn.click()
			await settle()
			assert.equal(closed, true)
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('App.vue renders Energy & Seismic Vault topbar button and toggles EnergySeismicVaultWorkbench via Alt+Shift+E', async () => {
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
		const EnergySeismicVaultWorkbench = loadEnergySeismicVaultWorkbench()

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
			'./components/EnergySeismicVaultWorkbench.vue': { __esModule: true, default: EnergySeismicVaultWorkbench },
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
					entities: type === 'unacknowledged' ? buildSampleEnergySeismicDuplicates() : [],
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
			const btn = vm.$el.querySelector('.topbar-energy-seismic-vault-button')
			assert.ok(btn, 'Topbar Energy & Seismic Vault button must render')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'Alt+Shift+E')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'E', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.energySeismicVaultOpen, true)
			assert.ok(vm.$el.querySelector('.energy-seismic-vault-workbench'), 'EnergySeismicVaultWorkbench must open on Alt+Shift+E shortcut')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'E', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.energySeismicVaultOpen, false)
			assert.equal(vm.$el.querySelector('.energy-seismic-vault-workbench'), null, 'EnergySeismicVaultWorkbench must toggle closed on Alt+Shift+E shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new Energy & Seismic Vault files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/energySeismicVaultAuditor.js',
			'src/components/EnergySeismicVaultWorkbench.vue',
			'tests/frontend/energy-seismic-vault-auditor.test.cjs',
			'tests/Vue/EnergySeismicVaultWorkbenchTest.php',
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
