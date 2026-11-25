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

function loadChemPharmaGmpAuditor() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/chemPharmaGmpVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function loadChemPharmaGmpVaultWorkbench(clipboardOverrides = {}) {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const auditor = loadModule('src/tools/chemPharmaGmpVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
	return loadComponent('src/components/ChemPharmaGmpVaultWorkbench.vue', {
		'../tools/clipboardHelper': {
			copyTextSafely: async () => true,
			...clipboardOverrides,
		},
		'../tools/duplicateStats': duplicateStats,
		'../tools/chemPharmaGmpVaultAuditor': auditor,
	})
}

function buildSampleChemPharmaGmpDuplicates(referenceNowMs = Date.UTC(2026, 10, 24, 12, 0, 0)) {
	const oldMtime = Math.floor((referenceNowMs - 40 * 24 * 60 * 60 * 1000) / 1000)
	const recentMtime = Math.floor((referenceNowMs - 2 * 24 * 60 * 60 * 1000) / 1000)

	return [
		{
			id: 20301,
			hash: 'chem-hash-empower-meth',
			files: [
				{
					id: 1,
					nodeId: 1,
					path: '/pharma_vault/00_gmp/empower/assay_api_v12.meth',
					size: 14 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 2,
					nodeId: 2,
					path: '/pharma_vault/work/empower_assay/assay_api_v12.meth',
					size: 14 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20302,
			hash: 'chem-hash-oos-stability-coa',
			files: [
				{
					id: 3,
					nodeId: 3,
					path: '/pharma_vault/21cfr11/oos_investigation/batch_4409_coa_signed.pdf',
					size: 32 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 4,
					nodeId: 4,
					path: '/pharma_vault/mirror/oos_investigation/batch_4409_coa_signed.pdf',
					size: 32 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20303,
			hash: 'chem-hash-mzml-anchor',
			files: [
				{
					id: 5,
					nodeId: 5,
					path: '/pharma_vault/mzml_vault/lcms_batch_4409/lcms_batch_4409.mzml.zst',
					size: 720 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 6,
					nodeId: 6,
					path: '/pharma_vault/mirror/lcms_batch_4409/lcms_batch_4409.mzml.zst',
					size: 720 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20304,
			hash: 'chem-hash-mgf-redundant',
			files: [
				{
					id: 7,
					nodeId: 7,
					path: '/pharma_vault/exports/lcms_batch_4409/lcms_batch_4409_peaks.mgf',
					size: 840 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 8,
					nodeId: 8,
					path: '/pharma_vault/msconvert/lcms_batch_4409/lcms_batch_4409_peaks.mgf',
					size: 840 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20305,
			hash: 'chem-hash-csv-unanchored',
			files: [
				{
					id: 9,
					nodeId: 9,
					path: '/pharma_vault/chemstation/hplc_impurity_run/impurity_trace_unanchored.csv',
					size: 260 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 10,
					nodeId: 10,
					path: '/pharma_vault/chemstation/hplc_impurity_run/copy/impurity_trace_unanchored.csv',
					size: 260 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20306,
			hash: 'chem-hash-jdx-nmr-anchor',
			files: [
				{
					id: 11,
					nodeId: 11,
					path: '/pharma_vault/nmr_masters/topspin_1h_api/api_lot99_1h.jdx',
					size: 95 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 12,
					nodeId: 12,
					path: '/pharma_vault/bruker/topspin_1h_api/api_lot99_1h.jdx',
					size: 95 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20307,
			hash: 'chem-hash-nmr-xy-redundant',
			files: [
				{
					id: 13,
					nodeId: 13,
					path: '/pharma_vault/topspin/nmr_lot99/api_lot99_1h_exported.xy',
					size: 180 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 14,
					nodeId: 14,
					path: '/pharma_vault/exports/nmr_lot99/api_lot99_1h_exported.xy',
					size: 180 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20308,
			hash: 'chem-hash-instrument-scratch',
			files: [
				{
					id: 15,
					nodeId: 15,
					path: '/pharma_vault/lcms_rig1/empower_tmp/injection_044.mzml.tmp',
					size: 145 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 16,
					nodeId: 16,
					path: '/pharma_vault/lcms_rig2/empower_tmp/injection_044.mzml.tmp',
					size: 145 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20309,
			hash: 'non-chem-unrelated',
			files: [
				{
					id: 17,
					nodeId: 17,
					path: '/personal/photos/autumn_hike.jpg',
					size: 8 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 18,
					nodeId: 18,
					path: '/personal/backup/autumn_hike.jpg',
					size: 8 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
	]
}

describe('Cycle 203: Chemical Process, Chromatography & Pharma GMP Vault Auditor (pure logic)', () => {
	test('classifies Chem/Pharma GMP families, detects toolchains, and shields 21 CFR Part 11, OOS/stability, and mzML/JCAMP anchors', () => {
		const {
			CHEM_PHARMA_GMP_VAULT_SCHEMA,
			classifyChemPharmaGmpFile,
			isChemPharmaGmpGroup,
			auditChemPharmaGmpVault,
		} = loadChemPharmaGmpAuditor()

		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = buildSampleChemPharmaGmpDuplicates(nowMs)

		assert.equal(classifyChemPharmaGmpFile({ path: '/personal/photos/autumn_hike.jpg', size: 1024 }).family, null)
		assert.equal(isChemPharmaGmpGroup(groups[8]), false)
		assert.equal(isChemPharmaGmpGroup(groups[0]), true)

		const methMeta = classifyChemPharmaGmpFile(groups[0].files[0], nowMs)
		assert.equal(methMeta.family, 'gmp-batch-records-sop')
		assert.equal(methMeta.labToolchain, 'Waters Empower / MassLynx')
		assert.equal(methMeta.isProtectedGmp, true)

		const oosMeta = classifyChemPharmaGmpFile(groups[1].files[0], nowMs)
		assert.equal(oosMeta.family, 'gmp-batch-records-sop')
		assert.equal(oosMeta.isProtectedOosStability, true)

		const mzmlMeta = classifyChemPharmaGmpFile(groups[2].files[0], nowMs)
		assert.equal(mzmlMeta.family, 'compressed-spectroscopy-ms')
		assert.equal(mzmlMeta.isCompressedSpectraAnchor, true)

		const scratchMeta = classifyChemPharmaGmpFile(groups[7].files[0], nowMs)
		assert.equal(scratchMeta.family, 'instrument-acquisition-scratch')
		assert.equal(scratchMeta.isInstrumentScratchPath, true)
		assert.equal(scratchMeta.labToolchain, 'Waters Empower / MassLynx')

		const report = auditChemPharmaGmpVault(groups, {}, nowMs)
		assert.equal(report.schema, CHEM_PHARMA_GMP_VAULT_SCHEMA)
		assert.equal(report.summary.totalDomainGroupsCount, 8)
		assert.equal(report.summary.totalClustersCount, 8)

		const methCluster = report.clusters.find(c => c.id === 20301)
		assert.equal(methCluster.clusterVerdict, 'gmp-part11-protected')
		assert.equal(methCluster.reclaimableBytes, 0)
		assert.ok(methCluster.members.every(m => m.shielded && m.action === 'keep'))

		const oosCluster = report.clusters.find(c => c.id === 20302)
		assert.equal(oosCluster.clusterVerdict, 'oos-stability-protected')
		assert.equal(oosCluster.reclaimableBytes, 0)

		const mzmlCluster = report.clusters.find(c => c.id === 20303)
		assert.equal(mzmlCluster.clusterVerdict, 'spectra-archive-protected')
		assert.equal(mzmlCluster.reclaimableBytes, 0)

		// Redundant MGF backed by .mzml.zst anchor -> both copies reclaimable
		const mgfCluster = report.clusters.find(c => c.id === 20304)
		assert.equal(mgfCluster.clusterVerdict, 'peak-export-redundant')
		assert.equal(mgfCluster.hasCompressedSpectraAnchor, true)
		assert.equal(mgfCluster.reclaimableTargetsCount, 2)
		assert.equal(mgfCluster.reclaimableBytes, 2 * 840 * 1024 * 1024)

		// Unanchored CSV -> blocked while requireSpectraAnchorForPrune is true
		const csvCluster = report.clusters.find(c => c.id === 20305)
		assert.equal(csvCluster.hasCompressedSpectraAnchor, false)
		assert.equal(csvCluster.reclaimableBytes, 0)
		assert.ok(csvCluster.members.every(m => m.shielded))

		// Redundant NMR .xy backed by .jdx anchor -> both copies reclaimable
		const xyCluster = report.clusters.find(c => c.id === 20307)
		assert.equal(xyCluster.clusterVerdict, 'peak-export-redundant')
		assert.equal(xyCluster.hasCompressedSpectraAnchor, true)
		assert.equal(xyCluster.reclaimableTargetsCount, 2)

		// empower_tmp scratch -> 1 non-survivor copy reclaimable
		const scratchCluster = report.clusters.find(c => c.id === 20308)
		assert.equal(scratchCluster.clusterVerdict, 'instrument-scratch-intermediate')
		assert.equal(scratchCluster.reclaimableTargetsCount, 1)
		assert.equal(scratchCluster.reclaimableBytes, 145 * 1024 * 1024)
	})

	test('respects keepRecentAcqRunDays grace window, hardlink safety on mutable files, and per-copy overrides', () => {
		const { auditChemPharmaGmpVault } = loadChemPharmaGmpAuditor()
		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = buildSampleChemPharmaGmpDuplicates(nowMs)

		// With 14-day acquisition grace window, recent (2-day-old) scratch copy is shielded
		const graceReport = auditChemPharmaGmpVault(groups, {
			presetId: 'instrument-scratch-cleanup',
			keepRecentAcqRunDays: 14,
		}, nowMs)
		const scratchWithGrace = graceReport.clusters.find(c => c.id === 20308)
		assert.equal(scratchWithGrace.reclaimableBytes, 0)
		assert.ok(scratchWithGrace.members.every(m => m.shielded))

		// Hardlink strategy with spectra shield disabled hardlinks immutable .mzml.zst, never mutable .meth or .csv
		const hardlinkReport = auditChemPharmaGmpVault(groups, {
			strategy: 'hardlink-immutable-mzml-and-jdx',
			protectCompressedSpectraAnchors: false,
			protectGmpAndPart11: false,
			requireSpectraAnchorForPrune: false,
		}, nowMs)
		const mzmlHardlink = hardlinkReport.clusters.find(c => c.id === 20303)
		assert.equal(mzmlHardlink.hardlinkTargetsCount, 1)
		assert.equal(mzmlHardlink.deleteTargetsCount, 0)

		const methMutable = hardlinkReport.clusters.find(c => c.id === 20301)
		assert.equal(methMutable.hardlinkTargetsCount, 0)
		assert.equal(methMutable.deleteTargetsCount, 1)

		// Per-copy override: keep a redundant MGF member and prune an unanchored CSV copy
		const overrideReport = auditChemPharmaGmpVault(groups, {
			memberOverrides: {
				7: 'keep',
				10: 'prune',
			},
		}, nowMs)
		const mgfCluster = overrideReport.clusters.find(c => c.id === 20304)
		assert.equal(mgfCluster.members.find(m => m.id === 7).shielded, true)
		assert.equal(mgfCluster.members.find(m => m.id === 7).action, 'keep')
		assert.equal(mgfCluster.reclaimableTargetsCount, 1)

		const csvCluster = overrideReport.clusters.find(c => c.id === 20305)
		assert.equal(csvCluster.members.find(m => m.id === 10).action, 'delete')
		assert.equal(csvCluster.reclaimableTargetsCount, 1)
	})

	test('generates safe DRY_RUN=1 POSIX script, CWE-1236 CSV, JSON manifest, and .sync-exclude.lst', () => {
		const {
			CHEM_PHARMA_GMP_VAULT_SCHEMA,
			auditChemPharmaGmpVault,
			buildChemPharmaGmpRemediationScript,
			buildChemPharmaGmpCsvReport,
			buildChemPharmaGmpJsonManifest,
			buildChemPharmaGmpSyncExcludeList,
		} = loadChemPharmaGmpAuditor()

		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = buildSampleChemPharmaGmpDuplicates(nowMs)
		groups[3].files[1].path = "/pharma_vault/msconvert/O'Reilly assay/=cmd_peaks.mgf"

		const report = auditChemPharmaGmpVault(groups, {}, nowMs)
		const script = buildChemPharmaGmpRemediationScript(report)
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes('set -euo pipefail'))
		assert.ok(script.includes("'/pharma_vault/msconvert/O'\"'\"'Reilly assay/=cmd_peaks.mgf'"))
		assert.equal(script.includes('assay_api_v12.meth'), false)
		assert.equal(script.includes('batch_4409_coa_signed.pdf'), false)

		const csv = buildChemPharmaGmpCsvReport(report)
		assert.ok(csv.startsWith('cluster_id,cluster_name,lab_toolchain,'))
		assert.ok(csv.includes('peak-export-redundant'))
		assert.ok(csv.includes('oos-stability-protected'))

		// CWE-1236 formula injection neutralization check
		const formulaReport = auditChemPharmaGmpVault([
			{
				id: 99,
				hash: 'h-formula',
				files: [
					{ id: 991, nodeId: 991, path: '/pharma_vault/hplc/=HYPERLINK("http://evil")_hplc.csv', size: 2048, mtime: 1000 },
					{ id: 992, nodeId: 992, path: '/pharma_vault/mzml_vault/hplc_run.mzml', size: 2048, mtime: 1000 },
				],
			},
		], {}, nowMs)
		const formulaCsv = buildChemPharmaGmpCsvReport(formulaReport)
		assert.equal(formulaCsv.includes(',=HYPERLINK'), false)
		assert.ok(formulaCsv.includes("'=HYPERLINK") || formulaCsv.includes('"/pharma_vault/hplc/=HYPERLINK'))

		const json = JSON.parse(buildChemPharmaGmpJsonManifest(report))
		assert.equal(json.schema, CHEM_PHARMA_GMP_VAULT_SCHEMA)
		assert.equal(json.clusters.length, 8)

		const syncExclude = buildChemPharmaGmpSyncExcludeList()
		assert.ok(syncExclude.includes('empower_tmp/'))
		assert.ok(syncExclude.includes('chemstation_tmp/'))
		assert.ok(syncExclude.includes('*.mzml.tmp'))
		assert.ok(syncExclude.includes('*.fid.tmp'))
	})
})

describe('Cycle 203: ChemPharmaGmpVaultWorkbench Vue component & App.vue Alt+Shift+C integration', () => {
	test('renders empty state, populated audit workspace, presets, filters, and non-clamping numeric inputs', async () => {
		const Workbench = loadChemPharmaGmpVaultWorkbench()

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
			assert.ok(emptyVm.$el.querySelector('.cpg__empty-banner'))
			emptyVm.$el.querySelector('.cpg__primary-btn').click()
			await settle()
			assert.equal(emptyVm.scanTriggered, true)
		} finally {
			emptyVm.$destroy()
			emptyMount.remove()
		}

		// Populated state
		const groups = buildSampleChemPharmaGmpDuplicates()
		const copied = []
		const WorkbenchWithCopy = loadChemPharmaGmpVaultWorkbench({
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
						currentDuplicateId: 20304,
					},
				})
			},
		}).$mount(mountNode)

		try {
			await settle()
			assert.equal(vm.$el.querySelectorAll('.cpg__cluster-card').length, 8)
			assert.ok(vm.$el.textContent.includes('lcms_batch_4409_peaks.mgf'))

			// Numeric inputs never clamp or reset mid-keystroke when cleared
			const wbVm = vm.$children[0]
			wbVm.keepRecentAcqRunDaysInput = ''
			wbVm.minSizeKbInput = ''
			await settle()
			assert.equal(wbVm.keepRecentAcqRunDaysInput, '')
			assert.equal(wbVm.minSizeKbInput, '')
			assert.equal(wbVm.parsedKeepRecentAcqRunDays, 0)
			assert.equal(wbVm.parsedMinSizeKb, 0)

			// Apply preset: Instrument & msconvert Scratch
			const presetButtons = Array.from(vm.$el.querySelectorAll('.cpg__seg-btn'))
			const scratchPresetBtn = presetButtons.find(btn => btn.textContent.includes('Instrument & msconvert Scratch'))
			assert.ok(scratchPresetBtn)
			scratchPresetBtn.click()
			await settle()
			assert.equal(wbVm.presetId, 'instrument-scratch-cleanup')
			assert.equal(wbVm.keepRecentAcqRunDaysInput, '14')

			// Copy DRY_RUN=1 script
			const copyScriptBtn = Array.from(vm.$el.querySelectorAll('.cpg__tool-btn'))
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

	test('App.vue renders Chem & Pharma GMP Vault topbar button and toggles workbench on Alt+Shift+C', async () => {
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
		const ChemPharmaGmpVaultWorkbench = loadChemPharmaGmpVaultWorkbench()

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
			'./components/BatteryBmsVaultWorkbench.vue': { __esModule: true, default: stub('battery-bms-vault-auditor') },
			'./components/ChemPharmaGmpVaultWorkbench.vue': { __esModule: true, default: ChemPharmaGmpVaultWorkbench },
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
					entities: type === 'unacknowledged' ? buildSampleChemPharmaGmpDuplicates() : [],
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
			const btn = vm.$el.querySelector('.topbar-chem-pharma-gmp-vault-button')
			assert.ok(btn, 'Topbar Chem & Pharma GMP Vault button must render')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'Alt+Shift+C')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'C', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.chemPharmaGmpVaultOpen, true)
			assert.ok(vm.$el.querySelector('.chem-pharma-gmp-vault-workbench'), 'ChemPharmaGmpVaultWorkbench must open on Alt+Shift+C shortcut')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'C', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.chemPharmaGmpVaultOpen, false)
			assert.equal(vm.$el.querySelector('.chem-pharma-gmp-vault-workbench'), null, 'ChemPharmaGmpVaultWorkbench must toggle closed on Alt+Shift+C shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new Chem & Pharma GMP Vault files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/chemPharmaGmpVaultAuditor.js',
			'src/components/ChemPharmaGmpVaultWorkbench.vue',
			'tests/frontend/chem-pharma-gmp-vault-auditor.test.cjs',
			'tests/Vue/ChemPharmaGmpVaultWorkbenchTest.php',
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
