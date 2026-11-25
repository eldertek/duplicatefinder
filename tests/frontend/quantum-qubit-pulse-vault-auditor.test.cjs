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

function loadQuantumQubitPulseAuditor() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/quantumQubitPulseVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function loadQuantumQubitPulseVaultWorkbench(clipboardOverrides = {}) {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const auditor = loadModule('src/tools/quantumQubitPulseVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
	return loadComponent('src/components/QuantumQubitPulseVaultWorkbench.vue', {
		'../tools/clipboardHelper': {
			copyTextSafely: async () => true,
			...clipboardOverrides,
		},
		'../tools/duplicateStats': duplicateStats,
		'../tools/quantumQubitPulseVaultAuditor': auditor,
	})
}

function buildSampleQuantumQubitPulseDuplicates(referenceNowMs = Date.UTC(2026, 10, 25, 9, 0, 0)) {
	const oldMtime = Math.floor((referenceNowMs - 40 * 24 * 60 * 60 * 1000) / 1000)
	const recentMtime = Math.floor((referenceNowMs - 2 * 24 * 60 * 60 * 1000) / 1000)

	return [
		{
			id: 21701,
			hash: 'qpu-hash-cryo-calib',
			files: [
				{
					id: 1,
					nodeId: 1,
					path: '/quantum_vault/00_cryo/bluefors_ld400/cooldown_42_t1_t2.qcalib',
					size: 128 * 1024,
					mtime: oldMtime,
				},
				{
					id: 2,
					nodeId: 2,
					path: '/quantum_vault/mirror/cooldown_42_t1_t2.qcalib',
					size: 128 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21702,
			hash: 'qpu-hash-benchmark-hold',
			files: [
				{
					id: 3,
					nodeId: 3,
					path: '/quantum_vault/benchmark_hold/nist_hold/surface_code_d7_wiring.qmap',
					size: 180 * 1024,
					mtime: oldMtime,
				},
				{
					id: 4,
					nodeId: 4,
					path: '/quantum_vault/mirror/benchmark_hold/surface_code_d7_wiring.qmap',
					size: 180 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21703,
			hash: 'qpu-hash-qpy-circuit-master',
			files: [
				{
					id: 5,
					nodeId: 5,
					path: '/quantum_vault/00_qpy/transmon_127q/bell_ghz_127q_sweep.qpy',
					size: 640 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 6,
					nodeId: 6,
					path: '/quantum_vault/nas_mirror/transmon_127q/bell_ghz_127q_sweep.qpy',
					size: 640 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21704,
			hash: 'qpu-hash-seqc-pulse-master',
			files: [
				{
					id: 7,
					nodeId: 7,
					path: '/quantum_vault/00_pulse/laboneq_shfqc/drag_pi_pulse_q04.seqc',
					size: 420 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 8,
					nodeId: 8,
					path: '/quantum_vault/backup/laboneq_shfqc/drag_pi_pulse_q04.seqc',
					size: 420 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21705,
			hash: 'qpu-hash-redundant-bloch-anchored',
			files: [
				{
					id: 9,
					nodeId: 9,
					path: '/quantum_vault/tomography_exports/bell_ghz_127q_sweep_tomography.parquet',
					size: 85 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 10,
					nodeId: 10,
					path: '/quantum_vault/bloch_plots/bell_ghz_127q_sweep_tomography.parquet',
					size: 85 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21706,
			hash: 'qpu-hash-unanchored-rabi-csv',
			files: [
				{
					id: 11,
					nodeId: 11,
					path: '/quantum_vault/rabi_plots/orphan_fluxonium_991_rabi.csv',
					size: 16 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 12,
					nodeId: 12,
					path: '/quantum_vault/shot_summaries/orphan_fluxonium_991_rabi.csv',
					size: 16 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21707,
			hash: 'qpu-hash-aer-old-scratch',
			files: [
				{
					id: 13,
					nodeId: 13,
					path: '/quantum_vault/aer_tmp/bell_ghz_127q_sim.qpy.tmp',
					size: 190 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 14,
					nodeId: 14,
					path: '/quantum_vault/transpile_tmp/bell_ghz_127q_sim.qpy.tmp',
					size: 190 * 1024 * 1024,
					mtime: oldMtime,
				},
			],
		},
		{
			id: 21708,
			hash: 'qpu-hash-recent-laboneq-scratch',
			files: [
				{
					id: 15,
					nodeId: 15,
					path: '/quantum_vault/laboneq_cache/drag_pi_pulse_q04.npz.part',
					size: 64 * 1024 * 1024,
					mtime: recentMtime,
				},
				{
					id: 16,
					nodeId: 16,
					path: '/quantum_vault/pulse_cache/drag_pi_pulse_q04.npz.part',
					size: 64 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21709,
			hash: 'non-quantum-hep-noise',
			files: [
				{
					id: 17,
					nodeId: 17,
					path: '/hep_vault/00_root/run_4210.root',
					size: 40 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 18,
					nodeId: 18,
					path: '/hep_vault/mirror/run_4210.root',
					size: 40 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
	]
}

describe('Cycle 217: Quantum Computing, Cryogenic Qubit & Pulse-Control Vault Auditor', () => {
	test('normalizeQuantumQubitPulseConfig clamps invalid fields and preserves valid defaults', () => {
		const {
			QUANTUM_QUBIT_PULSE_DEFAULT_CONFIG,
			normalizeQuantumQubitPulseConfig,
		} = loadQuantumQubitPulseAuditor()

		const def = normalizeQuantumQubitPulseConfig()
		assert.deepEqual(def, {
			...QUANTUM_QUBIT_PULSE_DEFAULT_CONFIG,
			memberOverrides: {},
		})

		const custom = normalizeQuantumQubitPulseConfig({
			familyFilter: 'invalid-family',
			verdictFilter: 'unknown-verdict',
			strategy: 'bogus',
			survivorRule: 'bogus',
			sortMode: 'bogus',
			keepRecentRunDays: -5,
			minSizeKb: -10,
			searchQuery: '  qasm  ',
			protectCryoAndCalibration: false,
		})
		assert.equal(custom.familyFilter, 'all')
		assert.equal(custom.verdictFilter, 'all')
		assert.equal(custom.strategy, 'prune-exports-and-pulse-scratch')
		assert.equal(custom.survivorRule, 'quantum-calib-qasm-first')
		assert.equal(custom.sortMode, 'reclaim_desc')
		assert.equal(custom.keepRecentRunDays, 0)
		assert.equal(custom.minSizeKb, 0)
		assert.equal(custom.searchQuery, 'qasm')
		assert.equal(custom.protectCryoAndCalibration, false)
	})

	test('classifyQuantumQubitPulseFile classifies all 4 Quantum & Cryo families and excludes non-Quantum domains', () => {
		const { classifyQuantumQubitPulseFile } = loadQuantumQubitPulseAuditor()

		const cryo = classifyQuantumQubitPulseFile({ path: '/quantum_vault/00_cryo/bluefors_cooldown.bflog', size: 1024 })
		assert.equal(cryo.family, 'quantum-calib-cryo-holds')
		assert.equal(cryo.isProtectedCryoCalibration, true)
		assert.equal(cryo.quantumTag, 'CRYO FRIDGE LOG')

		const hold = classifyQuantumQubitPulseFile({ path: '/quantum_vault/benchmark_hold/surface_code.qmap', size: 2048 })
		assert.equal(hold.family, 'quantum-calib-cryo-holds')
		assert.equal(hold.isProtectedQpuBenchmarkHold, true)
		assert.equal(hold.quantumTag, 'QPU / BENCHMARK HOLD')

		const qpyMaster = classifyQuantumQubitPulseFile({ path: '/quantum_vault/00_qpy/ghz_127q.qpy', size: 4096 })
		assert.equal(qpyMaster.family, 'quantum-circuit-pulse-masters')
		assert.equal(qpyMaster.isProtectedCircuitPulseMaster, true)
		assert.equal(qpyMaster.isMutableFile, false)
		assert.equal(qpyMaster.quantumTag, 'QISKIT QPY MASTER')

		const qasmMaster = classifyQuantumQubitPulseFile({ path: '/quantum_vault/00_qasm/grover_v3.qasm3', size: 4096 })
		assert.equal(qasmMaster.family, 'quantum-circuit-pulse-masters')
		assert.equal(qasmMaster.isMutableFile, true)
		assert.equal(qasmMaster.quantumTag, 'OPENQASM / QIR')

		const stimMaster = classifyQuantumQubitPulseFile({ path: '/quantum_vault/00_stim/surface_d5.stim', size: 4096 })
		assert.equal(stimMaster.family, 'quantum-circuit-pulse-masters')
		assert.equal(stimMaster.quantumTag, 'STIM QEC MASTER')

		const seqcMaster = classifyQuantumQubitPulseFile({ path: '/quantum_vault/00_pulse/drag_q04.seqc', size: 4096 })
		assert.equal(seqcMaster.family, 'quantum-circuit-pulse-masters')
		assert.equal(seqcMaster.quantumTag, 'AWG PULSE MASTER')

		const iqShotMaster = classifyQuantumQubitPulseFile({ path: '/quantum_vault/00_shots/iq_demod_run19.h5', size: 4096 })
		assert.equal(iqShotMaster.family, 'quantum-circuit-pulse-masters')
		assert.equal(iqShotMaster.isMutableFile, false)
		assert.equal(iqShotMaster.quantumTag, 'IQ SHOT MASTER')

		const blochExport = classifyQuantumQubitPulseFile({ path: '/quantum_vault/tomography_exports/ghz_127q_tomography.parquet', size: 1024 })
		assert.equal(blochExport.family, 'redundant-quantum-bloch-exports')
		assert.equal(blochExport.isRedundantQuantumExport, true)

		const scratch = classifyQuantumQubitPulseFile({ path: '/quantum_vault/aer_tmp/ghz_127q.qpy.tmp', size: 1024 })
		assert.equal(scratch.family, 'quantum-sim-transpile-scratch')
		assert.equal(scratch.isScratchPath, true)

		const hep = classifyQuantumQubitPulseFile({ path: '/hep_vault/00_root/run_4210.root', size: 4096 })
		assert.equal(hep.family, null)

		const genericCsv = classifyQuantumQubitPulseFile({ path: '/documents/grocery_list.csv', size: 512 })
		assert.equal(genericCsv.family, null)
	})

	test('auditQuantumQubitPulseVault conserves cryo/calib, QASM/Pulse/QPY, QPU holds, unanchored exports, and respects grace window', () => {
		const {
			QUANTUM_QUBIT_PULSE_VAULT_SCHEMA,
			auditQuantumQubitPulseVault,
		} = loadQuantumQubitPulseAuditor()

		const nowMs = Date.UTC(2026, 10, 25, 9, 0, 0)
		const groups = buildSampleQuantumQubitPulseDuplicates(nowMs)

		const report = auditQuantumQubitPulseVault(groups, {}, nowMs)
		assert.equal(report.schema, QUANTUM_QUBIT_PULSE_VAULT_SCHEMA)
		assert.equal(report.summary.totalClustersCount, 8)
		assert.equal(report.summary.totalCryoCalibClusters, 1)
		assert.equal(report.summary.totalCircuitMasterClusters, 2)
		assert.equal(report.summary.totalBenchmarkHoldClusters, 1)

		const cryoCluster = report.clusters.find(c => c.id === 21701)
		assert.equal(cryoCluster.reclaimableBytes, 0)
		assert.equal(cryoCluster.clusterVerdict, 'quantum-calib-cryo-protected')

		const holdCluster = report.clusters.find(c => c.id === 21702)
		assert.equal(holdCluster.reclaimableBytes, 0)
		assert.equal(holdCluster.clusterVerdict, 'qpu-benchmark-hold-protected')

		const qpyCluster = report.clusters.find(c => c.id === 21703)
		assert.equal(qpyCluster.reclaimableBytes, 0)
		assert.equal(qpyCluster.clusterVerdict, 'qasm-pulse-master-protected')

		const anchoredExport = report.clusters.find(c => c.id === 21705)
		assert.equal(anchoredExport.hasQuantumMasterAnchor, true)
		assert.equal(anchoredExport.clusterVerdict, 'quantum-export-redundant')
		assert.equal(anchoredExport.reclaimableBytes, 2 * 85 * 1024 * 1024)

		const unanchoredExport = report.clusters.find(c => c.id === 21706)
		assert.equal(unanchoredExport.hasQuantumMasterAnchor, false)
		assert.equal(unanchoredExport.reclaimableBytes, 0)
		assert.equal(unanchoredExport.clusterVerdict, 'shielded')

		const unguardedReport = auditQuantumQubitPulseVault(groups, { requireQuantumAnchorForPrune: false }, nowMs)
		const unanchoredUnguarded = unguardedReport.clusters.find(c => c.id === 21706)
		assert.equal(unanchoredUnguarded.reclaimableBytes, 16 * 1024 * 1024)

		const graceReport = auditQuantumQubitPulseVault(groups, { keepRecentRunDays: 14 }, nowMs)
		const recentScratch = graceReport.clusters.find(c => c.id === 21708)
		assert.equal(recentScratch.reclaimableBytes, 0)
		assert.equal(recentScratch.clusterVerdict, 'shielded')
		const oldScratch = graceReport.clusters.find(c => c.id === 21707)
		assert.equal(oldScratch.reclaimableBytes, 190 * 1024 * 1024)
	})

	test('hardlink strategy never hardlinks mutable QCalib/SeqC/CSV/scratch and generates safe POSIX script, CWE-1236 CSV, JSON, and sync-exclude', () => {
		const {
			auditQuantumQubitPulseVault,
			buildQuantumQubitPulseCsvReport,
			buildQuantumQubitPulseJsonManifest,
			buildQuantumQubitPulseRemediationScript,
			buildQuantumQubitPulseSyncExcludeList,
		} = loadQuantumQubitPulseAuditor()

		const nowMs = Date.UTC(2026, 10, 25, 9, 0, 0)
		const groups = buildSampleQuantumQubitPulseDuplicates(nowMs)
		groups.push({
			id: 21799,
			hash: 'qpu-hash-formula-injection',
			files: [
				{
					id: 99,
					nodeId: 99,
					path: '=cmd|\' /C calc\'!A0/aer_tmp/run_tmp.qpy.tmp',
					size: 1024,
					mtime: Math.floor((nowMs - 30 * 24 * 60 * 60 * 1000) / 1000),
				},
				{
					id: 100,
					nodeId: 100,
					path: '/quantum_vault/transpile_tmp/normal_sim_tmp.qpy.tmp',
					size: 1024,
					mtime: Math.floor((nowMs - 30 * 24 * 60 * 60 * 1000) / 1000),
				},
			],
		})

		const hardlinkAudit = auditQuantumQubitPulseVault(groups, {
			strategy: 'hardlink-immutable-qpy-and-hdf5',
			protectCircuitAndPulseMasters: false,
		}, nowMs)

		const qpyCluster = hardlinkAudit.clusters.find(c => c.id === 21703)
		assert.equal(qpyCluster.hardlinkTargetsCount, 1)
		assert.equal(qpyCluster.deleteTargetsCount, 0)

		const seqcCluster = hardlinkAudit.clusters.find(c => c.id === 21704)
		assert.equal(seqcCluster.hardlinkTargetsCount, 0)
		assert.equal(seqcCluster.deleteTargetsCount, 1)

		const script = buildQuantumQubitPulseRemediationScript(hardlinkAudit)
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes('run_cmd ln -f'))
		assert.ok(!script.includes('cooldown_42_t1_t2.qcalib'))
		assert.ok(!script.includes('surface_code_d7_wiring.qmap'))

		const csv = buildQuantumQubitPulseCsvReport(hardlinkAudit)
		assert.ok(csv.includes('quantum_toolchain'))
		assert.ok(csv.includes("'=cmd|"))

		const manifest = JSON.parse(buildQuantumQubitPulseJsonManifest(hardlinkAudit))
		assert.equal(manifest.schema, 'duplicatefinder.quantum-qubit-pulse-vault-auditor.v1')
		assert.ok(Array.isArray(manifest.clusters))

		const syncExclude = buildQuantumQubitPulseSyncExcludeList()
		assert.ok(syncExclude.includes('qiskit_cache/'))
		assert.ok(syncExclude.includes('aer_tmp/'))
		assert.ok(syncExclude.includes('*.qpy.tmp'))
		assert.ok(syncExclude.includes('*.npz.part'))
	})

	test('QuantumQubitPulseVaultWorkbench renders interactive controls, switches presets, preserves numeric input mid-keystroke, and copies script', async () => {
		const Workbench = loadQuantumQubitPulseVaultWorkbench()
		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const samples = buildSampleQuantumQubitPulseDuplicates()
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
			assert.ok(rootEl.classList.contains('quantum-qubit-pulse-vault-workbench'))
			assert.equal(rootEl.querySelectorAll('.qqp__cluster-card').length, 8)

			const presetBtns = Array.from(rootEl.querySelectorAll('.qqp__seg-btn'))
			const scratchPresetBtn = presetBtns.find(btn => btn.textContent.includes('Aer, Transpiler & Pulse Scratch'))
			assert.ok(scratchPresetBtn)
			scratchPresetBtn.click()
			await settle()

			const wbVm = vm.$children[0]
			assert.equal(wbVm.presetId, 'aer-transpiler-scratch-cleanup')
			assert.equal(wbVm.keepRecentRunDaysInput, '14')

			const numInputs = rootEl.querySelectorAll('input.qqp__num-input')
			numInputs[0].value = ''
			numInputs[0].dispatchEvent(new window.Event('input'))
			await settle()
			assert.equal(wbVm.keepRecentRunDaysInput, '')
			assert.equal(wbVm.parsedKeepRecentRunDays, 0)

			const searchInput = rootEl.querySelector('input[type="search"]')
			searchInput.value = 'drag_pi_pulse_q04'
			searchInput.dispatchEvent(new window.Event('input'))
			await settle()
			assert.equal(rootEl.querySelectorAll('.qqp__cluster-card').length, 2)

			const copyBtn = Array.from(rootEl.querySelectorAll('button')).find(b => b.textContent.includes('Copy DRY_RUN=1 Script'))
			assert.ok(copyBtn)
			copyBtn.click()
			await settle()
			assert.ok(rootEl.querySelector('.qqp__notice').textContent.includes('Copied DRY_RUN=1'))
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('App.vue integrates QuantumQubitPulseVaultWorkbench with topbar button and Alt+Shift+Q shortcut', async () => {
		window.localStorage.clear()
		const Workbench = loadQuantumQubitPulseVaultWorkbench()
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
			'./components/QuantumQubitPulseVaultWorkbench.vue': { __esModule: true, default: Workbench },
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
					entities: type === 'unacknowledged' ? buildSampleQuantumQubitPulseDuplicates() : [],
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
			const btn = vm.$el.querySelector('.topbar-quantum-qubit-pulse-vault-button')
			assert.ok(btn, 'Topbar Quantum & Qubit button must render')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'Alt+Shift+Q')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Q', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.quantumQubitPulseVaultOpen, true)
			assert.ok(vm.$el.querySelector('.quantum-qubit-pulse-vault-workbench'), 'QuantumQubitPulseVaultWorkbench must open on Alt+Shift+Q shortcut')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Q', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.quantumQubitPulseVaultOpen, false)
			assert.equal(vm.$el.querySelector('.quantum-qubit-pulse-vault-workbench'), null, 'QuantumQubitPulseVaultWorkbench must toggle closed on Alt+Shift+Q shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new Quantum & Cryo Vault files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/quantumQubitPulseVaultAuditor.js',
			'src/components/QuantumQubitPulseVaultWorkbench.vue',
			'tests/frontend/quantum-qubit-pulse-vault-auditor.test.cjs',
			'tests/Vue/QuantumQubitPulseVaultWorkbenchTest.php',
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
