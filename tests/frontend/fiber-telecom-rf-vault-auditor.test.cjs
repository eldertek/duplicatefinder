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

function loadFiberTelecomRfAuditor() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/fiberTelecomRfVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function loadFiberTelecomRfVaultWorkbench(clipboardOverrides = {}) {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const auditor = loadModule('src/tools/fiberTelecomRfVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
	return loadComponent('src/components/FiberTelecomRfVaultWorkbench.vue', {
		'../tools/clipboardHelper': {
			copyTextSafely: async () => true,
			...clipboardOverrides,
		},
		'../tools/duplicateStats': duplicateStats,
		'../tools/fiberTelecomRfVaultAuditor': auditor,
	})
}

function buildSampleFiberTelecomRfDuplicates(referenceNowMs = Date.UTC(2026, 10, 24, 12, 0, 0)) {
	const oldMtime = Math.floor((referenceNowMs - 40 * 24 * 60 * 60 * 1000) / 1000)
	const recentMtime = Math.floor((referenceNowMs - 2 * 24 * 60 * 60 * 1000) / 1000)

	return [
		{
			id: 20601,
			hash: 'rf-hash-vna-calkit-solt',
			files: [
				{
					id: 1,
					nodeId: 1,
					path: '/rf_vault/00_cal/iso17025/keysight_n4691b_ecal_26ghz.csa',
					size: 14 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 2,
					nodeId: 2,
					path: '/rf_vault/lab_bench/pna_x/keysight_n4691b_ecal_26ghz.csa',
					size: 14 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20602,
			hash: 'rf-hash-fcc-etsi-compliance',
			files: [
				{
					id: 3,
					nodeId: 3,
					path: '/rf_vault/compliance/fcc_part15/3gpp_ts38_521_n78_sar_compliance.sigmf-data',
					size: 56 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 4,
					nodeId: 4,
					path: '/rf_vault/mirror/fcc_part15/3gpp_ts38_521_n78_sar_compliance.sigmf-data',
					size: 56 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20603,
			hash: 'rf-hash-otdr-touchstone-master',
			files: [
				{
					id: 5,
					nodeId: 5,
					path: '/fiber_vault/00_otdr/metro_ring_span04_1550nm.sor',
					size: 120 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 6,
					nodeId: 6,
					path: '/fiber_vault/mirror/viavi/metro_ring_span04_1550nm.sor',
					size: 120 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20604,
			hash: 'rf-hash-touchstone-s4p-master',
			files: [
				{
					id: 7,
					nodeId: 7,
					path: '/rf_vault/00_master/mmwave_pa_28ghz_sweep.s4p',
					size: 180 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 8,
					nodeId: 8,
					path: '/rf_vault/work/rohde/mmwave_pa_28ghz_sweep.s4p',
					size: 180 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20605,
			hash: 'rf-hash-redundant-csv-anchored',
			files: [
				{
					id: 9,
					nodeId: 9,
					path: '/rf_vault/exports/vna/mmwave_pa_28ghz_sweep_sparam_table.csv',
					size: 320 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 10,
					nodeId: 10,
					path: '/rf_vault/matlab/mmwave_pa_28ghz_sweep_sparam_table.csv',
					size: 320 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20606,
			hash: 'rf-hash-unanchored-mat-export',
			files: [
				{
					id: 11,
					nodeId: 11,
					path: '/rf_vault/rf_spectrum/unanchored_anechoic_sweep.mat',
					size: 95 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 12,
					nodeId: 12,
					path: '/rf_vault/mirror/rf_spectrum/unanchored_anechoic_sweep.mat',
					size: 95 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20607,
			hash: 'rf-hash-old-solver-scratch',
			files: [
				{
					id: 13,
					nodeId: 13,
					path: '/rf_vault/hfss_scratch/old_phased_array_28ghz.aedt.tmp',
					size: 410 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 14,
					nodeId: 14,
					path: '/rf_vault/vna_tmp/old_phased_array_28ghz.aedt.tmp',
					size: 410 * 1024 * 1024,
					mtime: oldMtime,
				},
			],
		},
		{
			id: 20608,
			hash: 'rf-hash-recent-sdr-scratch',
			files: [
				{
					id: 15,
					nodeId: 15,
					path: '/rf_vault/sdr_staging/live_5g_nr_capture.iq.tmp',
					size: 210 * 1024 * 1024,
					mtime: recentMtime,
				},
				{
					id: 16,
					nodeId: 16,
					path: '/rf_vault/gnuradio_tmp/live_5g_nr_capture.iq.tmp',
					size: 210 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20609,
			hash: 'non-rf-family-photo',
			files: [
				{
					id: 17,
					nodeId: 17,
					path: '/Photos/holiday_beach.jpg',
					size: 4 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 18,
					nodeId: 18,
					path: '/Backup/Photos/holiday_beach.jpg',
					size: 4 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
	]
}

describe('Cycle 206: Fiber-Optic, Telecom RF Spectrum, VNA S-Parameter & 5G Baseband IQ Vault Auditor', () => {
	test('classifies calibration kits, FCC/ETSI evidence, OTDR/Touchstone/IQ masters, redundant CSV/MAT exports, and RF scratch while ignoring non-domain files', () => {
		const auditor = loadFiberTelecomRfAuditor()
		const referenceNowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = buildSampleFiberTelecomRfDuplicates(referenceNowMs)

		const result = auditor.auditFiberTelecomRfVault(groups, {}, referenceNowMs)

		assert.equal(result.schema, auditor.FIBER_TELECOM_RF_VAULT_SCHEMA)
		assert.equal(result.summary.totalDomainGroupsCount, 8)
		assert.equal(result.summary.totalClustersCount, 8)
		assert.equal(result.summary.totalCalibrationClusters, 1)
		assert.equal(result.summary.totalRegulatoryRfClusters, 1)
		assert.equal(result.summary.totalFiberRfMasterClusters, 2)
		assert.equal(result.summary.totalRedundantExportClusters, 2)
		assert.equal(result.summary.totalRfScratchClusters, 2)

		const calCluster = result.clusters.find(c => c.id === 20601)
		assert.ok(calCluster)
		assert.equal(calCluster.family, 'fiber-rf-calibration-compliance')
		assert.equal(calCluster.clusterVerdict, 'calibration-std-protected')
		assert.equal(calCluster.reclaimableBytes, 0)
		assert.equal(calCluster.shieldedCount, 2)
		assert.equal(calCluster.rfToolchain, 'Keysight PNA / FieldFox')

		const fccCluster = result.clusters.find(c => c.id === 20602)
		assert.ok(fccCluster)
		assert.equal(fccCluster.clusterVerdict, 'regulatory-rf-protected')
		assert.equal(fccCluster.reclaimableBytes, 0)
		assert.equal(fccCluster.hasProtectedRegulatoryRf, true)

		const otdrCluster = result.clusters.find(c => c.id === 20603)
		assert.ok(otdrCluster)
		assert.equal(otdrCluster.clusterVerdict, 'fiber-rf-master-protected')
		assert.equal(otdrCluster.reclaimableBytes, 0)
		assert.equal(otdrCluster.rfToolchain, 'EXFO / VIAVI OTDR')

		const redundantCsvCluster = result.clusters.find(c => c.id === 20605)
		assert.ok(redundantCsvCluster)
		assert.equal(redundantCsvCluster.family, 'redundant-rf-csv-exports')
		assert.equal(redundantCsvCluster.hasFiberRfMasterAnchor, true)
		assert.equal(redundantCsvCluster.clusterVerdict, 'rf-export-redundant')
		assert.equal(redundantCsvCluster.reclaimableBytes, 640 * 1024 * 1024)
		assert.equal(redundantCsvCluster.deleteTargetsCount, 2)

		const unanchoredMatCluster = result.clusters.find(c => c.id === 20606)
		assert.ok(unanchoredMatCluster)
		assert.equal(unanchoredMatCluster.hasFiberRfMasterAnchor, false)
		assert.equal(unanchoredMatCluster.reclaimableBytes, 0)
		assert.equal(unanchoredMatCluster.shieldedCount, 2)
	})

	test('enforces keepRecentCaptureDays grace window, hardlink-immutable-iq-and-sor safety, and CWE-1236 / DRY_RUN=1 exports', () => {
		const auditor = loadFiberTelecomRfAuditor()
		const referenceNowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = buildSampleFiberTelecomRfDuplicates(referenceNowMs)

		const graceAudit = auditor.auditFiberTelecomRfVault(groups, {
			keepRecentCaptureDays: 14,
		}, referenceNowMs)

		const oldScratch = graceAudit.clusters.find(c => c.id === 20607)
		const recentScratch = graceAudit.clusters.find(c => c.id === 20608)
		assert.ok(oldScratch)
		assert.ok(recentScratch)
		assert.equal(oldScratch.reclaimableBytes, 410 * 1024 * 1024)
		assert.equal(recentScratch.reclaimableBytes, 0)
		assert.equal(recentScratch.shieldedCount, 2)

		const hardlinkAudit = auditor.auditFiberTelecomRfVault(groups, {
			strategy: 'hardlink-immutable-iq-and-sor',
			protectFiberRfMasterAnchors: false,
		}, referenceNowMs)

		const otdrCluster = hardlinkAudit.clusters.find(c => c.id === 20603)
		assert.ok(otdrCluster)
		assert.equal(otdrCluster.hardlinkTargetsCount, 1)
		assert.equal(otdrCluster.deleteTargetsCount, 0)

		const csvCluster = hardlinkAudit.clusters.find(c => c.id === 20605)
		assert.ok(csvCluster)
		assert.equal(csvCluster.hardlinkTargetsCount, 0)
		assert.equal(csvCluster.deleteTargetsCount, 2)

		const script = auditor.buildFiberTelecomRfRemediationScript(hardlinkAudit)
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes('run_cmd ln -f'))
		assert.ok(!script.includes('keysight_n4691b_ecal_26ghz.csa'))
		assert.ok(!script.includes('3gpp_ts38_521_n78_sar_compliance.sigmf-data'))

		const formulaGroups = [
			{
				id: 20699,
				hash: 'rf-formula-hash',
				files: [
					{
						id: 991,
						nodeId: 991,
						path: '/rf_vault/vna_tmp/=cmd|calc!A0_sweep.s2p.bak',
						size: 4096,
						mtime: 1700000000,
					},
					{
						id: 992,
						nodeId: 992,
						path: '/rf_vault/rohde_scratch/=cmd|calc!A0_sweep.s2p.bak',
						size: 4096,
						mtime: 1700000000,
					},
				],
			},
		]
		const formulaAudit = auditor.auditFiberTelecomRfVault(formulaGroups, {}, referenceNowMs)
		const csv = auditor.buildFiberTelecomRfCsvReport(formulaAudit)
		assert.ok(csv.includes("'=cmd|calc!A0_sweep.s2p.bak"))

		const json = JSON.parse(auditor.buildFiberTelecomRfJsonManifest(graceAudit))
		assert.equal(json.schema, auditor.FIBER_TELECOM_RF_VAULT_SCHEMA)
		assert.equal(json.clusters.length, 8)

		const syncExclude = auditor.buildFiberTelecomRfSyncExcludeList()
		assert.ok(syncExclude.includes('vna_tmp/'))
		assert.ok(syncExclude.includes('*.sor.tmp'))
		assert.ok(syncExclude.includes('*.iq.tmp'))
	})

	test('FiberTelecomRfVaultWorkbench renders empty state, presets, numeric filters, overrides, exports, and emits jump/compare', async () => {
		const copiedTexts = []
		const Workbench = loadFiberTelecomRfVaultWorkbench({
			copyTextSafely: async (text) => {
				copiedTexts.push(text)
				return true
			},
		})

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const referenceNowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const sampleDuplicates = buildSampleFiberTelecomRfDuplicates(referenceNowMs)

		const vm = new Vue({
			data: {
				duplicates: [],
				allDuplicates: [],
				selected: null,
				compared: null,
				scanStarted: false,
				closed: false,
			},
			render(h) {
				return h(Workbench, {
					props: {
						duplicates: this.duplicates,
						allDuplicates: this.allDuplicates,
					},
					on: {
						'select-duplicate': d => { this.selected = d },
						'compare-duplicate': d => { this.compared = d },
						'start-scan': () => { this.scanStarted = true },
						close: () => { this.closed = true },
					},
				})
			},
		}).$mount(mountNode)

		try {
			await settle()
			assert.ok(vm.$el.querySelector('.ftrf__empty-banner'))
			vm.$el.querySelector('.ftrf__primary-btn').click()
			await settle()
			assert.equal(vm.scanStarted, true)

			vm.duplicates = sampleDuplicates.slice(0, 6)
			vm.allDuplicates = sampleDuplicates
			await settle()

			const workbenchVm = vm.$children[0]
			assert.equal(workbenchVm.analysis.summary.totalClustersCount, 6)

			const scopeButtons = Array.from(vm.$el.querySelectorAll('.ftrf__seg-btn'))
			const allScopeBtn = scopeButtons.find(b => b.textContent.includes('All loaded'))
			assert.ok(allScopeBtn)
			allScopeBtn.click()
			await settle()
			assert.equal(workbenchVm.analysis.summary.totalClustersCount, 8)

			const presetButtons = Array.from(vm.$el.querySelectorAll('.ftrf__seg-btn'))
			const scratchPresetBtn = presetButtons.find(b => b.textContent.includes('VNA, SDR & EM Solver Scratch'))
			assert.ok(scratchPresetBtn)
			scratchPresetBtn.click()
			await settle()
			assert.equal(workbenchVm.keepRecentCaptureDaysInput, '14')

			workbenchVm.minSizeKbInput = 'abc'
			await settle()
			assert.equal(workbenchVm.parsedMinSizeKb, 0)
			workbenchVm.minSizeKbInput = '0'
			await settle()

			const cards = vm.$el.querySelectorAll('.ftrf__cluster-card')
			assert.ok(cards.length > 0)
			cards[0].click()
			await settle()

			const triageBtn = Array.from(vm.$el.querySelectorAll('.ftrf__inspector-actions button')).find(b => b.textContent.includes('Open in Triage'))
			const compareBtn = Array.from(vm.$el.querySelectorAll('.ftrf__inspector-actions button')).find(b => b.textContent.includes('Side-by-Side'))
			triageBtn.click()
			compareBtn.click()
			await settle()
			assert.ok(vm.selected)
			assert.ok(vm.compared)

			const copyScriptBtn = Array.from(vm.$el.querySelectorAll('.ftrf__toolbar-actions button')).find(b => b.textContent.includes('Copy DRY_RUN=1 Script'))
			copyScriptBtn.click()
			await settle()
			assert.ok(copiedTexts.some(t => t.includes('DRY_RUN=')))

			const hideBtn = vm.$el.querySelector('.ftrf__tool-btn.is-close')
			hideBtn.click()
			await settle()
			assert.equal(vm.closed, true)
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('App.vue renders Fiber & RF Vault topbar button and toggles FiberTelecomRfVaultWorkbench via Alt+Shift+F', async () => {
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
		const FiberTelecomRfVaultWorkbench = loadFiberTelecomRfVaultWorkbench()

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
			'./components/FiberTelecomRfVaultWorkbench.vue': { __esModule: true, default: FiberTelecomRfVaultWorkbench },
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
					entities: type === 'unacknowledged' ? buildSampleFiberTelecomRfDuplicates() : [],
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
			const btn = vm.$el.querySelector('.topbar-fiber-telecom-rf-vault-button')
			assert.ok(btn, 'Topbar Fiber & RF Vault button must render')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'Alt+Shift+F')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.fiberTelecomRfVaultOpen, true)
			assert.ok(vm.$el.querySelector('.fiber-telecom-rf-vault-workbench'), 'FiberTelecomRfVaultWorkbench must open on Alt+Shift+F shortcut')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.fiberTelecomRfVaultOpen, false)
			assert.equal(vm.$el.querySelector('.fiber-telecom-rf-vault-workbench'), null, 'FiberTelecomRfVaultWorkbench must toggle closed on Alt+Shift+F shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new Fiber & RF Vault files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/fiberTelecomRfVaultAuditor.js',
			'src/components/FiberTelecomRfVaultWorkbench.vue',
			'tests/frontend/fiber-telecom-rf-vault-auditor.test.cjs',
			'tests/Vue/FiberTelecomRfVaultWorkbenchTest.php',
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
