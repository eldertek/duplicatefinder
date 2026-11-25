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

function loadHydrographyMarineAuditor() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/hydrographyMarineVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function loadHydrographyMarineVaultWorkbench(clipboardOverrides = {}) {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const auditor = loadModule('src/tools/hydrographyMarineVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
	return loadComponent('src/components/HydrographyMarineVaultWorkbench.vue', {
		'../tools/clipboardHelper': {
			copyTextSafely: async () => true,
			...clipboardOverrides,
		},
		'../tools/duplicateStats': duplicateStats,
		'../tools/hydrographyMarineVaultAuditor': auditor,
	})
}

function buildSampleHydrographyMarineDuplicates(referenceNowMs = Date.UTC(2026, 10, 24, 12, 0, 0)) {
	const oldMtime = Math.floor((referenceNowMs - 40 * 24 * 60 * 60 * 1000) / 1000)
	const recentMtime = Math.floor((referenceNowMs - 2 * 24 * 60 * 60 * 1000) / 1000)

	return [
		{
			id: 20801,
			hash: 'hydro-hash-iho-bag-surface',
			files: [
				{
					id: 1,
					nodeId: 1,
					path: '/hydro_vault/00_bag/iho_s102/north_sea_block14_bathy_1m.bag',
					size: 48 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 2,
					nodeId: 2,
					path: '/hydro_vault/deliverables/north_sea_block14_bathy_1m.bag',
					size: 48 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20802,
			hash: 'hydro-hash-offshore-uxo-hold',
			files: [
				{
					id: 3,
					nodeId: 3,
					path: '/hydro_vault/compliance/boem_hold/dogger_bank_uxo_clearance.s57',
					size: 24 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 4,
					nodeId: 4,
					path: '/hydro_vault/mirror/boem_hold/dogger_bank_uxo_clearance.s57',
					size: 24 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20803,
			hash: 'hydro-hash-kongsberg-kmall',
			files: [
				{
					id: 5,
					nodeId: 5,
					path: '/sonar_vault/00_sonar/kongsberg/em2040_line_042_survey.kmall',
					size: 320 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 6,
					nodeId: 6,
					path: '/sonar_vault/ship_mirror/kongsberg/em2040_line_042_survey.kmall',
					size: 320 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20804,
			hash: 'hydro-hash-rov-sbet-hd',
			files: [
				{
					id: 7,
					nodeId: 7,
					path: '/rov_archive/00_rov/applanix/pipeline_kp18_sbet_nav.sbet',
					size: 150 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 8,
					nodeId: 8,
					path: '/rov_archive/work/applanix/pipeline_kp18_sbet_nav.sbet',
					size: 150 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20805,
			hash: 'hydro-hash-redundant-xyz-anchored',
			files: [
				{
					id: 9,
					nodeId: 9,
					path: '/sonar_vault/exports/multibeam/em2040_line_042_survey_xyz_export.xyz',
					size: 210 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 10,
					nodeId: 10,
					path: '/sonar_vault/gis/multibeam/em2040_line_042_survey_xyz_export.xyz',
					size: 210 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20806,
			hash: 'hydro-hash-unanchored-csv-soundings',
			files: [
				{
					id: 11,
					nodeId: 11,
					path: '/hydro_vault/bathymetry/unanchored_harbor_soundings.csv',
					size: 75 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 12,
					nodeId: 12,
					path: '/hydro_vault/mirror/bathymetry/unanchored_harbor_soundings.csv',
					size: 75 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20807,
			hash: 'hydro-hash-old-qimera-scratch',
			files: [
				{
					id: 13,
					nodeId: 13,
					path: '/hydro_vault/qimera_tmp/swath_calibration_pass4.qpd.tmp',
					size: 400 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 14,
					nodeId: 14,
					path: '/hydro_vault/caris_cache/swath_calibration_pass4.qpd.tmp',
					size: 400 * 1024 * 1024,
					mtime: oldMtime,
				},
			],
		},
		{
			id: 20808,
			hash: 'hydro-hash-recent-sonar-staging',
			files: [
				{
					id: 15,
					nodeId: 15,
					path: '/sonar_vault/sonar_staging/live_cruise_line88.kmall.part',
					size: 180 * 1024 * 1024,
					mtime: recentMtime,
				},
				{
					id: 16,
					nodeId: 16,
					path: '/sonar_vault/rov_cache/live_cruise_line88.kmall.part',
					size: 180 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20809,
			hash: 'non-hydro-family-photo',
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

describe('Cycle 208: Marine Hydrography, Multibeam Sonar & Subsea ROV Vault Auditor', () => {
	test('classifies IHO BAG/S-57, offshore holds, KMALL/SBET/ROV masters, redundant XYZ exports, and Qimera scratch while ignoring non-domain files', () => {
		const auditor = loadHydrographyMarineAuditor()
		const referenceNowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = buildSampleHydrographyMarineDuplicates(referenceNowMs)

		const result = auditor.auditHydrographyMarineVault(groups, {}, referenceNowMs)

		assert.equal(result.schema, auditor.HYDROGRAPHY_MARINE_VAULT_SCHEMA)
		assert.equal(result.summary.totalDomainGroupsCount, 8)
		assert.equal(result.summary.totalClustersCount, 8)
		assert.equal(result.summary.totalHydroStdClusters, 1)
		assert.equal(result.summary.totalOffshoreRegulatoryClusters, 1)
		assert.equal(result.summary.totalSonarRovMasterClusters, 2)
		assert.equal(result.summary.totalRedundantExportClusters, 2)
		assert.equal(result.summary.totalHydroScratchClusters, 2)

		const bagCluster = result.clusters.find(c => c.id === 20801)
		assert.ok(bagCluster)
		assert.equal(bagCluster.family, 'hydro-standards-compliance')
		assert.equal(bagCluster.clusterVerdict, 'hydro-std-protected')
		assert.equal(bagCluster.reclaimableBytes, 0)
		assert.equal(bagCluster.shieldedCount, 2)
		assert.equal(bagCluster.hydroToolchain, 'IHO S-57 / S-100 / BAG')

		const boemCluster = result.clusters.find(c => c.id === 20802)
		assert.ok(boemCluster)
		assert.equal(boemCluster.clusterVerdict, 'offshore-regulatory-protected')
		assert.equal(boemCluster.reclaimableBytes, 0)
		assert.equal(boemCluster.hasProtectedOffshoreRegulatory, true)

		const kmallCluster = result.clusters.find(c => c.id === 20803)
		assert.ok(kmallCluster)
		assert.equal(kmallCluster.clusterVerdict, 'sonar-rov-master-protected')
		assert.equal(kmallCluster.reclaimableBytes, 0)
		assert.equal(kmallCluster.hydroToolchain, 'Kongsberg MBES / Simrad')

		const redundantXyzCluster = result.clusters.find(c => c.id === 20805)
		assert.ok(redundantXyzCluster)
		assert.equal(redundantXyzCluster.family, 'redundant-hydro-xyz-exports')
		assert.equal(redundantXyzCluster.hasHydroMasterAnchor, true)
		assert.equal(redundantXyzCluster.clusterVerdict, 'hydro-export-redundant')
		assert.equal(redundantXyzCluster.reclaimableBytes, 420 * 1024 * 1024)
		assert.equal(redundantXyzCluster.deleteTargetsCount, 2)

		const unanchoredCsvCluster = result.clusters.find(c => c.id === 20806)
		assert.ok(unanchoredCsvCluster)
		assert.equal(unanchoredCsvCluster.hasHydroMasterAnchor, false)
		assert.equal(unanchoredCsvCluster.reclaimableBytes, 0)
		assert.equal(unanchoredCsvCluster.shieldedCount, 2)
	})

	test('enforces keepRecentSurveyDays grace window, hardlink-immutable-sonar-and-bag safety, and CWE-1236 / DRY_RUN=1 exports', () => {
		const auditor = loadHydrographyMarineAuditor()
		const referenceNowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = buildSampleHydrographyMarineDuplicates(referenceNowMs)

		const graceAudit = auditor.auditHydrographyMarineVault(groups, {
			keepRecentSurveyDays: 14,
		}, referenceNowMs)

		const oldScratch = graceAudit.clusters.find(c => c.id === 20807)
		const recentScratch = graceAudit.clusters.find(c => c.id === 20808)
		assert.ok(oldScratch)
		assert.ok(recentScratch)
		assert.equal(oldScratch.reclaimableBytes, 400 * 1024 * 1024)
		assert.equal(recentScratch.reclaimableBytes, 0)
		assert.equal(recentScratch.shieldedCount, 2)

		const hardlinkAudit = auditor.auditHydrographyMarineVault(groups, {
			strategy: 'hardlink-immutable-sonar-and-bag',
			protectSonarRovMasterAnchors: false,
		}, referenceNowMs)

		const kmallCluster = hardlinkAudit.clusters.find(c => c.id === 20803)
		assert.ok(kmallCluster)
		assert.equal(kmallCluster.hardlinkTargetsCount, 1)
		assert.equal(kmallCluster.deleteTargetsCount, 0)

		const xyzCluster = hardlinkAudit.clusters.find(c => c.id === 20805)
		assert.ok(xyzCluster)
		assert.equal(xyzCluster.hardlinkTargetsCount, 0)
		assert.equal(xyzCluster.deleteTargetsCount, 2)

		const script = auditor.buildHydrographyMarineRemediationScript(hardlinkAudit)
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes('run_cmd ln -f'))
		assert.ok(!script.includes('north_sea_block14_bathy_1m.bag'))
		assert.ok(!script.includes('dogger_bank_uxo_clearance.s57'))

		const formulaGroups = [
			{
				id: 20899,
				hash: 'hydro-formula-hash',
				files: [
					{
						id: 991,
						nodeId: 991,
						path: '/hydro_vault/qimera_tmp/=cmd|calc!A0_swath.qpd.tmp',
						size: 4096,
						mtime: 1700000000,
					},
					{
						id: 992,
						nodeId: 992,
						path: '/hydro_vault/caris_cache/=cmd|calc!A0_swath.qpd.tmp',
						size: 4096,
						mtime: 1700000000,
					},
				],
			},
		]
		const formulaAudit = auditor.auditHydrographyMarineVault(formulaGroups, {}, referenceNowMs)
		const csv = auditor.buildHydrographyMarineCsvReport(formulaAudit)
		assert.ok(csv.includes("'=cmd|calc!A0_swath.qpd.tmp"))

		const json = JSON.parse(auditor.buildHydrographyMarineJsonManifest(graceAudit))
		assert.equal(json.schema, auditor.HYDROGRAPHY_MARINE_VAULT_SCHEMA)
		assert.equal(json.clusters.length, 8)

		const syncExclude = auditor.buildHydrographyMarineSyncExcludeList()
		assert.ok(syncExclude.includes('qimera_tmp/'))
		assert.ok(syncExclude.includes('*.qpd.tmp'))
		assert.ok(syncExclude.includes('*.kmall.part'))
	})

	test('HydrographyMarineVaultWorkbench renders empty state, presets, numeric filters, overrides, exports, and emits jump/compare', async () => {
		const copiedTexts = []
		const Workbench = loadHydrographyMarineVaultWorkbench({
			copyTextSafely: async (text) => {
				copiedTexts.push(text)
				return true
			},
		})

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const referenceNowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const sampleDuplicates = buildSampleHydrographyMarineDuplicates(referenceNowMs)

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
			assert.ok(vm.$el.querySelector('.hmv__empty-banner'))
			vm.$el.querySelector('.hmv__primary-btn').click()
			await settle()
			assert.equal(vm.scanStarted, true)

			vm.duplicates = sampleDuplicates.slice(0, 6)
			vm.allDuplicates = sampleDuplicates
			await settle()

			const workbenchVm = vm.$children[0]
			assert.equal(workbenchVm.analysis.summary.totalClustersCount, 6)

			const scopeButtons = Array.from(vm.$el.querySelectorAll('.hmv__seg-btn'))
			const allScopeBtn = scopeButtons.find(b => b.textContent.includes('All loaded'))
			assert.ok(allScopeBtn)
			allScopeBtn.click()
			await settle()
			assert.equal(workbenchVm.analysis.summary.totalClustersCount, 8)

			const presetButtons = Array.from(vm.$el.querySelectorAll('.hmv__seg-btn'))
			const scratchPresetBtn = presetButtons.find(b => b.textContent.includes('Qimera, CARIS & ROV Scratch'))
			assert.ok(scratchPresetBtn)
			scratchPresetBtn.click()
			await settle()
			assert.equal(workbenchVm.keepRecentSurveyDaysInput, '14')

			workbenchVm.minSizeKbInput = 'abc'
			await settle()
			assert.equal(workbenchVm.parsedMinSizeKb, 0)
			assert.equal(workbenchVm.minSizeKbInput, 'abc')
			workbenchVm.minSizeKbInput = '0'
			await settle()

			const cards = vm.$el.querySelectorAll('.hmv__cluster-card')
			assert.ok(cards.length > 0)
			cards[0].click()
			await settle()

			const triageBtn = Array.from(vm.$el.querySelectorAll('.hmv__inspector-actions button')).find(b => b.textContent.includes('Open in Triage'))
			const compareBtn = Array.from(vm.$el.querySelectorAll('.hmv__inspector-actions button')).find(b => b.textContent.includes('Side-by-Side'))
			triageBtn.click()
			compareBtn.click()
			await settle()
			assert.ok(vm.selected)
			assert.ok(vm.compared)

			const copyScriptBtn = Array.from(vm.$el.querySelectorAll('.hmv__toolbar-actions button')).find(b => b.textContent.includes('Copy DRY_RUN=1 Script'))
			copyScriptBtn.click()
			await settle()
			assert.ok(copiedTexts.some(t => t.includes('DRY_RUN=')))

			const hideBtn = vm.$el.querySelector('.hmv__tool-btn.is-close')
			hideBtn.click()
			await settle()
			assert.equal(vm.closed, true)
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('App.vue renders Hydro & ROV Vault topbar button and toggles HydrographyMarineVaultWorkbench via Alt+Shift+H', async () => {
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
		const HydrographyMarineVaultWorkbench = loadHydrographyMarineVaultWorkbench()

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
			'./components/HydrographyMarineVaultWorkbench.vue': { __esModule: true, default: HydrographyMarineVaultWorkbench },
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
					entities: type === 'unacknowledged' ? buildSampleHydrographyMarineDuplicates() : [],
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
			const btn = vm.$el.querySelector('.topbar-hydrography-marine-vault-button')
			assert.ok(btn, 'Topbar Hydro & ROV Vault button must render')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'Alt+Shift+H')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'H', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.hydrographyMarineVaultOpen, true)
			assert.ok(vm.$el.querySelector('.hydrography-marine-vault-workbench'), 'HydrographyMarineVaultWorkbench must open on Alt+Shift+H shortcut')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'H', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.hydrographyMarineVaultOpen, false)
			assert.equal(vm.$el.querySelector('.hydrography-marine-vault-workbench'), null, 'HydrographyMarineVaultWorkbench must toggle closed on Alt+Shift+H shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new Hydrography & ROV Vault files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/hydrographyMarineVaultAuditor.js',
			'src/components/HydrographyMarineVaultWorkbench.vue',
			'tests/frontend/hydrography-marine-vault-auditor.test.cjs',
			'tests/Vue/HydrographyMarineVaultWorkbenchTest.php',
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
