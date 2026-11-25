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

function loadWineEnologyHaccpAuditor() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/wineEnologyHaccpVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function loadWineEnologyHaccpVaultWorkbench(clipboardOverrides = {}) {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const auditor = loadModule('src/tools/wineEnologyHaccpVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
	return loadComponent('src/components/WineEnologyHaccpVaultWorkbench.vue', {
		'../tools/clipboardHelper': {
			copyTextSafely: async () => true,
			...clipboardOverrides,
		},
		'../tools/duplicateStats': duplicateStats,
		'../tools/wineEnologyHaccpVaultAuditor': auditor,
	})
}

function buildSampleWineEnologyDuplicates(referenceNowMs = Date.UTC(2026, 10, 25, 12, 0, 0)) {
	const oldMtime = Math.floor((referenceNowMs - 45 * 24 * 60 * 60 * 1000) / 1000)
	const recentMtime = Math.floor((referenceNowMs - 2 * 24 * 60 * 60 * 1000) / 1000)

	return [
		{
			id: 22301,
			hash: 'wine-hash-haccp-ttb-baseline',
			files: [
				{
					id: 1,
					nodeId: 1,
					path: '/winery_vault/00_ttb/vintage_2025_cabernet/vintage_2025_cabernet_excise.ttb',
					size: 320 * 1024,
					mtime: oldMtime,
				},
				{
					id: 2,
					nodeId: 2,
					path: '/winery_vault/mirror/vintage_2025_cabernet_excise.ttb',
					size: 320 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 22302,
			hash: 'wine-hash-recall-fsma-hold',
			files: [
				{
					id: 3,
					nodeId: 3,
					path: '/winery_vault/fsma_hold/recall_hold/lot_b2025_sulfite_audit.recall',
					size: 512 * 1024,
					mtime: oldMtime,
				},
				{
					id: 4,
					nodeId: 4,
					path: '/winery_vault/mirror/recall_hold/lot_b2025_sulfite_audit.recall',
					size: 512 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 22303,
			hash: 'wine-hash-cellar-ferm-master',
			files: [
				{
					id: 5,
					nodeId: 5,
					path: '/winery_vault/00_cellar/tank_08_merlot/tank_08_merlot_curve.ferm',
					size: 480 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 6,
					nodeId: 6,
					path: '/winery_vault/nas_mirror/tank_08_merlot/tank_08_merlot_curve.ferm',
					size: 480 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 22304,
			hash: 'wine-hash-lab-ftir-master',
			files: [
				{
					id: 7,
					nodeId: 7,
					path: '/winery_vault/00_ftir/ipa_batch_19/ipa_batch_19_spectrum.ftir',
					size: 640 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 8,
					nodeId: 8,
					path: '/winery_vault/backup/ipa_batch_19/ipa_batch_19_spectrum.ftir',
					size: 640 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 22305,
			hash: 'wine-hash-redundant-export-anchored',
			files: [
				{
					id: 9,
					nodeId: 9,
					path: '/winery_vault/fermentation_reports/tank_08_merlot_curve_ferm_report.pdf',
					size: 64 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 10,
					nodeId: 10,
					path: '/winery_vault/tasting_sheets/tank_08_merlot_curve_ferm_report.pdf',
					size: 64 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 22306,
			hash: 'wine-hash-unanchored-brix-export',
			files: [
				{
					id: 11,
					nodeId: 11,
					path: '/winery_vault/lab_exports/orphan_cuvee_77_brix_csv.csv',
					size: 24 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 12,
					nodeId: 12,
					path: '/winery_vault/cellar_summaries/orphan_cuvee_77_brix_csv.csv',
					size: 24 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 22307,
			hash: 'wine-hash-old-cellar-scratch',
			files: [
				{
					id: 13,
					nodeId: 13,
					path: '/winery_vault/cellar_scada_tmp/tank_08_merlot_buf.ferm.tmp',
					size: 140 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 14,
					nodeId: 14,
					path: '/winery_vault/ferm_telemetry_cache/tank_08_merlot_buf.ferm.tmp',
					size: 140 * 1024 * 1024,
					mtime: oldMtime,
				},
			],
		},
		{
			id: 22308,
			hash: 'wine-hash-recent-ftir-scratch',
			files: [
				{
					id: 15,
					nodeId: 15,
					path: '/winery_vault/ftir_buf/ipa_batch_19_run.ftir.idx',
					size: 48 * 1024 * 1024,
					mtime: recentMtime,
				},
				{
					id: 16,
					nodeId: 16,
					path: '/winery_vault/hplc_spool/ipa_batch_19_run.ftir.idx',
					size: 48 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 22309,
			hash: 'wine-hash-non-domain-excluded',
			files: [
				{
					id: 17,
					nodeId: 17,
					path: '/vet_vault/00_vetpacs/equine_carpus_12_series.vetdcm',
					size: 8 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 18,
					nodeId: 18,
					path: '/water_vault/00_epanet/dma_north_04_calibrated.inp',
					size: 8 * 1024 * 1024,
					mtime: oldMtime,
				},
			],
		},
	]
}

describe('Cycle 223: Wine Enology, Brewery Fermentation & Food-Safety HACCP Vault Auditor', () => {
	test('classifyWineEnologyHaccpFile classifies all 4 vault families and excludes non-domain files', () => {
		const {
			classifyWineEnologyHaccpFile,
			extractWineEnologyHaccpStem,
			extractWineEnologyHaccpAnchorKey,
		} = loadWineEnologyHaccpAuditor()

		const ttb = classifyWineEnologyHaccpFile({ path: '/winery_vault/00_ttb/vintage_2025_cabernet_excise.ttb', size: 1024 })
		assert.equal(ttb.family, 'wine-haccp-regulatory-holds')
		assert.equal(ttb.isProtectedRegulatoryHaccp, true)
		assert.equal(ttb.isMutableFile, true)

		const hold = classifyWineEnologyHaccpFile({ path: '/winery_vault/fsma_hold/recall_hold/lot_b2025_sulfite_audit.recall', size: 2048 })
		assert.equal(hold.family, 'wine-haccp-regulatory-holds')
		assert.equal(hold.isProtectedRecallHold, true)
		assert.equal(hold.wineTag, 'FSMA / RECALL HOLD')

		const fermMaster = classifyWineEnologyHaccpFile({ path: '/winery_vault/00_cellar/tank_08_merlot_curve.ferm', size: 4096 })
		assert.equal(fermMaster.family, 'enology-fermentation-masters')
		assert.equal(fermMaster.isProtectedEnologyMaster, true)
		assert.equal(fermMaster.isMutableFile, false)

		const ftirMaster = classifyWineEnologyHaccpFile({ path: '/winery_vault/00_ftir/ipa_batch_19_spectrum.ftir', size: 4096 })
		assert.equal(ftirMaster.family, 'enology-fermentation-masters')
		assert.equal(ftirMaster.isProtectedEnologyMaster, true)
		assert.equal(ftirMaster.isMutableFile, false)

		const fermExport = classifyWineEnologyHaccpFile({ path: '/winery_vault/fermentation_reports/tank_08_merlot_curve_ferm_report.pdf', size: 4096 })
		assert.equal(fermExport.family, 'redundant-enology-reports-exports')
		assert.equal(fermExport.isRedundantEnologyExport, true)

		const scratch = classifyWineEnologyHaccpFile({ path: '/winery_vault/cellar_scada_tmp/tank_08_merlot_buf.ferm.tmp', size: 4096 })
		assert.equal(scratch.family, 'cellar-fermentation-lab-scratch')
		assert.equal(scratch.isScratchPath, true)

		const excludedVet = classifyWineEnologyHaccpFile({ path: '/vet_vault/00_vetpacs/equine_carpus_12_series.vetdcm', size: 4096 })
		assert.equal(excludedVet.family, null)

		const excludedWater = classifyWineEnologyHaccpFile({ path: '/water_vault/00_epanet/dma_north_04_calibrated.inp', size: 4096 })
		assert.equal(excludedWater.family, null)

		assert.equal(extractWineEnologyHaccpStem('tank_08_merlot_curve_ferm_report.pdf'), 'tank_08_merlot_curve')
		assert.equal(extractWineEnologyHaccpAnchorKey('tank_08_merlot_curve'), 'tank-08-merlot-curve')
	})

	test('auditWineEnologyHaccpVault protects HACCP/TTB/OIV, recall holds, and Cellar/Lab masters while enforcing anchor guard and grace window', () => {
		const { auditWineEnologyHaccpVault } = loadWineEnologyHaccpAuditor()
		const nowMs = Date.UTC(2026, 10, 25, 12, 0, 0)
		const groups = buildSampleWineEnologyDuplicates(nowMs)

		const report = auditWineEnologyHaccpVault(groups, {}, nowMs)
		assert.equal(report.summary.totalDomainGroupsCount, 8)
		assert.equal(report.summary.totalClustersCount, 8)
		assert.equal(report.summary.totalRegulatoryHaccpClusters, 1)
		assert.equal(report.summary.totalEnologyMasterClusters, 2)
		assert.equal(report.summary.totalRecallHoldClusters, 1)

		const ttbCluster = report.clusters.find(c => c.id === 22301)
		assert.equal(ttbCluster.reclaimableBytes, 0)
		assert.equal(ttbCluster.clusterVerdict, 'wine-haccp-regulatory-protected')

		const holdCluster = report.clusters.find(c => c.id === 22302)
		assert.equal(holdCluster.reclaimableBytes, 0)
		assert.equal(holdCluster.clusterVerdict, 'recall-quarantine-hold-protected')

		const anchoredExport = report.clusters.find(c => c.id === 22305)
		assert.equal(anchoredExport.hasEnologyMasterAnchor, true)
		assert.equal(anchoredExport.clusterVerdict, 'enology-export-redundant')
		assert.equal(anchoredExport.reclaimableBytes, 2 * 64 * 1024 * 1024)

		const unanchoredExport = report.clusters.find(c => c.id === 22306)
		assert.equal(unanchoredExport.hasEnologyMasterAnchor, false)
		assert.equal(unanchoredExport.reclaimableBytes, 0)
		assert.equal(unanchoredExport.clusterVerdict, 'shielded')

		const unguardedReport = auditWineEnologyHaccpVault(groups, { requireEnologyMasterAnchorForPrune: false }, nowMs)
		const unanchoredUnguarded = unguardedReport.clusters.find(c => c.id === 22306)
		assert.equal(unanchoredUnguarded.reclaimableBytes, 24 * 1024 * 1024)

		const graceReport = auditWineEnologyHaccpVault(groups, { keepRecentRunDays: 14 }, nowMs)
		const recentScratch = graceReport.clusters.find(c => c.id === 22308)
		assert.equal(recentScratch.reclaimableBytes, 0)
		assert.equal(recentScratch.clusterVerdict, 'shielded')
		const oldScratch = graceReport.clusters.find(c => c.id === 22307)
		assert.equal(oldScratch.reclaimableBytes, 140 * 1024 * 1024)
	})

	test('hardlink strategy never hardlinks mutable HACCP/TTB/export/scratch and generates safe POSIX script, CWE-1236 CSV, JSON, and sync-exclude', () => {
		const {
			auditWineEnologyHaccpVault,
			buildWineEnologyHaccpCsvReport,
			buildWineEnologyHaccpJsonManifest,
			buildWineEnologyHaccpRemediationScript,
			buildWineEnologyHaccpSyncExcludeList,
		} = loadWineEnologyHaccpAuditor()

		const nowMs = Date.UTC(2026, 10, 25, 12, 0, 0)
		const groups = buildSampleWineEnologyDuplicates(nowMs)
		groups.push({
			id: 22399,
			hash: 'wine-hash-formula-injection',
			files: [
				{
					id: 99,
					nodeId: 99,
					path: '=cmd|\' /C calc\'!A0/cellar_scada_tmp/run_tmp.ferm.tmp',
					size: 1024,
					mtime: Math.floor((nowMs - 30 * 24 * 60 * 60 * 1000) / 1000),
				},
				{
					id: 100,
					nodeId: 100,
					path: '/winery_vault/ftir_buf/normal_run_tmp.ftir.idx',
					size: 1024,
					mtime: Math.floor((nowMs - 30 * 24 * 60 * 60 * 1000) / 1000),
				},
			],
		})

		const hardlinkAudit = auditWineEnologyHaccpVault(groups, {
			strategy: 'hardlink-immutable-enology-masters',
			protectEnologyMasters: false,
			protectRegulatoryAndHaccpHolds: false,
		}, nowMs)

		const fermCluster = hardlinkAudit.clusters.find(c => c.id === 22303)
		assert.equal(fermCluster.hardlinkTargetsCount, 1)
		assert.equal(fermCluster.deleteTargetsCount, 0)

		const ttbCluster = hardlinkAudit.clusters.find(c => c.id === 22301)
		assert.equal(ttbCluster.hardlinkTargetsCount, 0)
		assert.equal(ttbCluster.deleteTargetsCount, 1)

		const script = buildWineEnologyHaccpRemediationScript(hardlinkAudit)
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes('run_cmd ln -f'))
		assert.ok(!script.includes('lot_b2025_sulfite_audit.recall'))

		const csv = buildWineEnologyHaccpCsvReport(hardlinkAudit)
		assert.ok(csv.includes('enology_toolchain'))
		assert.ok(csv.includes("'=cmd|"))

		const manifest = JSON.parse(buildWineEnologyHaccpJsonManifest(hardlinkAudit))
		assert.equal(manifest.schema, 'duplicatefinder.wine-enology-haccp-vault-auditor.v1')
		assert.ok(Array.isArray(manifest.clusters))

		const syncExclude = buildWineEnologyHaccpSyncExcludeList()
		assert.ok(syncExclude.includes('cellar_scada_tmp/'))
		assert.ok(syncExclude.includes('ftir_buf/'))
		assert.ok(syncExclude.includes('*.ferm.tmp'))
		assert.ok(syncExclude.includes('*.ftir.idx'))
	})

	test('WineEnologyHaccpVaultWorkbench renders interactive controls, switches presets, preserves numeric input mid-keystroke, and copies script', async () => {
		const Workbench = loadWineEnologyHaccpVaultWorkbench()
		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const samples = buildSampleWineEnologyDuplicates()
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
			assert.ok(rootEl.classList.contains('wine-enology-haccp-vault-workbench'))
			assert.equal(rootEl.querySelectorAll('.weh__cluster-card').length, 8)

			const presetBtns = Array.from(rootEl.querySelectorAll('.weh__seg-btn'))
			const scratchPresetBtn = presetBtns.find(btn => btn.textContent.includes('Cellar & Lab Scratch'))
			assert.ok(scratchPresetBtn)
			scratchPresetBtn.click()
			await settle()

			const wbVm = vm.$children[0]
			assert.equal(wbVm.presetId, 'cellar-ferm-scratch-cleanup')
			assert.equal(wbVm.keepRecentRunDaysInput, '14')

			const numInputs = rootEl.querySelectorAll('input.weh__num-input')
			numInputs[0].value = ''
			numInputs[0].dispatchEvent(new window.Event('input'))
			await settle()
			assert.equal(wbVm.keepRecentRunDaysInput, '')
			assert.equal(wbVm.parsedKeepRecentRunDays, 0)

			const searchInput = rootEl.querySelector('input[type="search"]')
			searchInput.value = 'tank_08_merlot'
			searchInput.dispatchEvent(new window.Event('input'))
			await settle()
			assert.equal(rootEl.querySelectorAll('.weh__cluster-card').length, 3)

			const copyBtn = Array.from(rootEl.querySelectorAll('button')).find(b => b.textContent.includes('Copy DRY_RUN=1 Script'))
			assert.ok(copyBtn)
			copyBtn.click()
			await settle()
			assert.ok(rootEl.querySelector('.weh__notice').textContent.includes('Copied DRY_RUN=1'))
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('App.vue integrates WineEnologyHaccpVaultWorkbench with topbar button and Alt+Shift+W shortcut', async () => {
		window.localStorage.clear()
		const Workbench = loadWineEnologyHaccpVaultWorkbench()
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
			'./components/RailwaySignalingTelemetryVaultWorkbench.vue': { __esModule: true, default: stub('railway-signaling-telemetry-vault-auditor') },
			'./components/SpeechAsrBioacousticsVaultWorkbench.vue': { __esModule: true, default: stub('speech-asr-bioacoustics-vault-auditor') },
			'./components/TrafficItsV2xVaultWorkbench.vue': { __esModule: true, default: stub('traffic-its-v2x-vault-auditor') },
			'./components/UrbanWaterUtilityPipelineVaultWorkbench.vue': { __esModule: true, default: stub('urban-water-utility-pipeline-vault-auditor') },
			'./components/VeterinaryEquineGenomicsVaultWorkbench.vue': { __esModule: true, default: stub('veterinary-equine-genomics-vault-auditor') },
			'./components/WineEnologyHaccpVaultWorkbench.vue': { __esModule: true, default: Workbench },
			'./components/XrSpatialNerfSplatVaultWorkbench.vue': { __esModule: true, default: stub('xr-spatial-nerf-splat-vault-auditor') },
			'./components/YachtRacingFoilingNmeaVaultWorkbench.vue': { __esModule: true, default: stub('yacht-racing-foiling-nmea-vault-auditor') },
			'./components/ZoologyWildlifeCamtrapEdnaVaultWorkbench.vue': { __esModule: true, default: stub('zoology-wildlife-camtrap-edna-vault-auditor') },
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
					entities: type === 'unacknowledged' ? buildSampleWineEnologyDuplicates() : [],
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
			const btn = vm.$el.querySelector('.topbar-wine-enology-haccp-vault-button')
			assert.ok(btn, 'Topbar Wine & HACCP button must render')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'Alt+Shift+W')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'W', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.wineEnologyHaccpVaultOpen, true)
			assert.ok(vm.$el.querySelector('.wine-enology-haccp-vault-workbench'), 'WineEnologyHaccpVaultWorkbench must open on Alt+Shift+W shortcut')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'W', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.wineEnologyHaccpVaultOpen, false)
			assert.equal(vm.$el.querySelector('.wine-enology-haccp-vault-workbench'), null, 'WineEnologyHaccpVaultWorkbench must toggle closed on Alt+Shift+W shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new Wine Enology, Brewery Fermentation & HACCP Vault files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/wineEnologyHaccpVaultAuditor.js',
			'src/components/WineEnologyHaccpVaultWorkbench.vue',
			'tests/frontend/wine-enology-haccp-vault-auditor.test.cjs',
			'tests/Vue/WineEnologyHaccpVaultWorkbenchTest.php',
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
