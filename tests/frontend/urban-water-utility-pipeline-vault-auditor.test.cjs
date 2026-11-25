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

function loadUrbanWaterUtilityPipelineAuditor() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/urbanWaterUtilityPipelineVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function loadUrbanWaterUtilityPipelineVaultWorkbench(clipboardOverrides = {}) {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const auditor = loadModule('src/tools/urbanWaterUtilityPipelineVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
	return loadComponent('src/components/UrbanWaterUtilityPipelineVaultWorkbench.vue', {
		'../tools/clipboardHelper': {
			copyTextSafely: async () => true,
			...clipboardOverrides,
		},
		'../tools/duplicateStats': duplicateStats,
		'../tools/urbanWaterUtilityPipelineVaultAuditor': auditor,
	})
}

function buildSampleUrbanWaterDuplicates(referenceNowMs = Date.UTC(2026, 10, 25, 12, 0, 0)) {
	const oldMtime = Math.floor((referenceNowMs - 45 * 24 * 60 * 60 * 1000) / 1000)
	const recentMtime = Math.floor((referenceNowMs - 2 * 24 * 60 * 60 * 1000) / 1000)

	return [
		{
			id: 22101,
			hash: 'water-hash-epanet-baseline',
			files: [
				{
					id: 1,
					nodeId: 1,
					path: '/water_vault/00_epanet/dma_north_04/dma_north_04_calibrated.inp',
					size: 320 * 1024,
					mtime: oldMtime,
				},
				{
					id: 2,
					nodeId: 2,
					path: '/water_vault/mirror/dma_north_04_calibrated.inp',
					size: 320 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 22102,
			hash: 'water-hash-pipeline-safety-hold',
			files: [
				{
					id: 3,
					nodeId: 3,
					path: '/water_vault/phmsa_hold/integrity_hold/trunk_main_18_audit.sdwis',
					size: 512 * 1024,
					mtime: oldMtime,
				},
				{
					id: 4,
					nodeId: 4,
					path: '/water_vault/mirror/phmsa_hold/trunk_main_18_audit.sdwis',
					size: 512 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 22103,
			hash: 'water-hash-ami-smart-meter-master',
			files: [
				{
					id: 5,
					nodeId: 5,
					path: '/water_vault/00_ami/sector_07/sector_07_meter_rollup.ami',
					size: 480 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 6,
					nodeId: 6,
					path: '/water_vault/nas_mirror/sector_07/sector_07_meter_rollup.ami',
					size: 480 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 22104,
			hash: 'water-hash-ili-pigging-master',
			files: [
				{
					id: 7,
					nodeId: 7,
					path: '/water_vault/00_ili/transmission_line_b/line_b_pigging_run.ili',
					size: 640 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 8,
					nodeId: 8,
					path: '/water_vault/backup/transmission_line_b/line_b_pigging_run.ili',
					size: 640 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 22105,
			hash: 'water-hash-redundant-flow-export-anchored',
			files: [
				{
					id: 9,
					nodeId: 9,
					path: '/water_vault/flow_profiles/sector_07_meter_rollup_flow_profile.csv',
					size: 72 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 10,
					nodeId: 10,
					path: '/water_vault/billing_exports/sector_07_meter_rollup_flow_profile.csv',
					size: 72 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 22106,
			hash: 'water-hash-unanchored-pressure-export',
			files: [
				{
					id: 11,
					nodeId: 11,
					path: '/water_vault/pressure_contours/orphan_zone_91_pressure_contour.png',
					size: 24 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 12,
					nodeId: 12,
					path: '/water_vault/gis_exports/orphan_zone_91_pressure_contour.png',
					size: 24 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 22107,
			hash: 'water-hash-epanet-old-scratch',
			files: [
				{
					id: 13,
					nodeId: 13,
					path: '/water_vault/epanet_tmp/dma_north_04_run.inp.tmp',
					size: 140 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 14,
					nodeId: 14,
					path: '/water_vault/swmm_scratch/dma_north_04_run.inp.tmp',
					size: 140 * 1024 * 1024,
					mtime: oldMtime,
				},
			],
		},
		{
			id: 22108,
			hash: 'water-hash-recent-ami-scratch',
			files: [
				{
					id: 15,
					nodeId: 15,
					path: '/water_vault/ami_spool/sector_07_meter_rollup.ami.part',
					size: 48 * 1024 * 1024,
					mtime: recentMtime,
				},
				{
					id: 16,
					nodeId: 16,
					path: '/water_vault/mdm_staging/sector_07_meter_rollup.ami.part',
					size: 48 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 22109,
			hash: 'water-hash-non-domain-excluded',
			files: [
				{
					id: 17,
					nodeId: 17,
					path: '/grid_vault/00_comtrade/substation_03_fault.cfg',
					size: 8 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 18,
					nodeId: 18,
					path: '/traffic_vault/00_v2x/rsu_07_bsm_capture.pcapng',
					size: 8 * 1024 * 1024,
					mtime: oldMtime,
				},
			],
		},
	]
}

describe('Cycle 221: Urban Water Utility, Hydraulic Network & Pipeline Telemetry Vault Auditor', () => {
	test('classifyUrbanWaterUtilityPipelineFile classifies all 4 vault families and excludes non-domain files', () => {
		const {
			classifyUrbanWaterUtilityPipelineFile,
			extractUrbanWaterUtilityPipelineStem,
			extractUrbanWaterUtilityPipelineAnchorKey,
		} = loadUrbanWaterUtilityPipelineAuditor()

		const epanet = classifyUrbanWaterUtilityPipelineFile({ path: '/water_vault/00_epanet/dma_north_04_calibrated.inp', size: 1024 })
		assert.equal(epanet.family, 'water-regulatory-epanet-compliance')
		assert.equal(epanet.isProtectedComplianceModel, true)
		assert.equal(epanet.isMutableFile, true)

		const safetyHold = classifyUrbanWaterUtilityPipelineFile({ path: '/water_vault/phmsa_hold/integrity_hold/trunk_main_18_audit.sdwis', size: 2048 })
		assert.equal(safetyHold.family, 'water-regulatory-epanet-compliance')
		assert.equal(safetyHold.isProtectedSafetyHold, true)
		assert.equal(safetyHold.utilityTag, 'REGULATORY / INTEGRITY HOLD')

		const amiMaster = classifyUrbanWaterUtilityPipelineFile({ path: '/water_vault/00_ami/sector_07_meter_rollup.ami', size: 4096 })
		assert.equal(amiMaster.family, 'ami-pipeline-telemetry-masters')
		assert.equal(amiMaster.isProtectedTelemetryMaster, true)
		assert.equal(amiMaster.isMutableFile, false)

		const iliMaster = classifyUrbanWaterUtilityPipelineFile({ path: '/water_vault/00_ili/line_b_pigging_run.ili', size: 4096 })
		assert.equal(iliMaster.family, 'ami-pipeline-telemetry-masters')
		assert.equal(iliMaster.isProtectedTelemetryMaster, true)
		assert.equal(iliMaster.isMutableFile, false)

		const flowExport = classifyUrbanWaterUtilityPipelineFile({ path: '/water_vault/flow_profiles/sector_07_meter_rollup_flow_profile.csv', size: 4096 })
		assert.equal(flowExport.family, 'redundant-utility-csv-exports')
		assert.equal(flowExport.isRedundantUtilityExport, true)

		const scratch = classifyUrbanWaterUtilityPipelineFile({ path: '/water_vault/epanet_tmp/dma_north_04_run.inp.tmp', size: 4096 })
		assert.equal(scratch.family, 'hydraulic-solver-utility-scratch')
		assert.equal(scratch.isScratchPath, true)

		const excludedGrid = classifyUrbanWaterUtilityPipelineFile({ path: '/grid_vault/00_comtrade/substation_03_fault.comtrade', size: 4096 })
		assert.equal(excludedGrid.family, null)

		const excludedTraffic = classifyUrbanWaterUtilityPipelineFile({ path: '/traffic_vault/00_v2x/rsu_07_bsm_capture.pcapng', size: 4096 })
		assert.equal(excludedTraffic.family, null)

		assert.equal(extractUrbanWaterUtilityPipelineStem('sector_07_meter_rollup_flow_profile.csv'), 'sector_07_meter_rollup')
		assert.equal(extractUrbanWaterUtilityPipelineAnchorKey('sector_07_meter_rollup'), 'sector-07-meter-rollup')
	})

	test('auditUrbanWaterUtilityPipelineVault protects EPA/EPANET, holds, and AMI/ILI masters while enforcing anchor guard and grace window', () => {
		const { auditUrbanWaterUtilityPipelineVault } = loadUrbanWaterUtilityPipelineAuditor()
		const nowMs = Date.UTC(2026, 10, 25, 12, 0, 0)
		const groups = buildSampleUrbanWaterDuplicates(nowMs)

		const report = auditUrbanWaterUtilityPipelineVault(groups, {}, nowMs)
		assert.equal(report.summary.totalDomainGroupsCount, 8)
		assert.equal(report.summary.totalClustersCount, 8)
		assert.equal(report.summary.totalComplianceModelClusters, 1)
		assert.equal(report.summary.totalTelemetryMasterClusters, 2)
		assert.equal(report.summary.totalSafetyHoldClusters, 1)

		const epanetCluster = report.clusters.find(c => c.id === 22101)
		assert.equal(epanetCluster.reclaimableBytes, 0)
		assert.equal(epanetCluster.clusterVerdict, 'water-regulatory-epanet-protected')

		const safetyCluster = report.clusters.find(c => c.id === 22102)
		assert.equal(safetyCluster.reclaimableBytes, 0)
		assert.equal(safetyCluster.clusterVerdict, 'pipeline-safety-hold-protected')

		const anchoredExport = report.clusters.find(c => c.id === 22105)
		assert.equal(anchoredExport.hasUtilityMasterAnchor, true)
		assert.equal(anchoredExport.clusterVerdict, 'utility-export-redundant')
		assert.equal(anchoredExport.reclaimableBytes, 2 * 72 * 1024 * 1024)

		const unanchoredExport = report.clusters.find(c => c.id === 22106)
		assert.equal(unanchoredExport.hasUtilityMasterAnchor, false)
		assert.equal(unanchoredExport.reclaimableBytes, 0)
		assert.equal(unanchoredExport.clusterVerdict, 'shielded')

		const unguardedReport = auditUrbanWaterUtilityPipelineVault(groups, { requireUtilityAnchorForPrune: false }, nowMs)
		const unanchoredUnguarded = unguardedReport.clusters.find(c => c.id === 22106)
		assert.equal(unanchoredUnguarded.reclaimableBytes, 24 * 1024 * 1024)

		const graceReport = auditUrbanWaterUtilityPipelineVault(groups, { keepRecentRunDays: 14 }, nowMs)
		const recentScratch = graceReport.clusters.find(c => c.id === 22108)
		assert.equal(recentScratch.reclaimableBytes, 0)
		assert.equal(recentScratch.clusterVerdict, 'shielded')
		const oldScratch = graceReport.clusters.find(c => c.id === 22107)
		assert.equal(oldScratch.reclaimableBytes, 140 * 1024 * 1024)
	})

	test('hardlink strategy never hardlinks mutable EPANET/compliance/export/scratch and generates safe POSIX script, CWE-1236 CSV, JSON, and sync-exclude', () => {
		const {
			auditUrbanWaterUtilityPipelineVault,
			buildUrbanWaterUtilityPipelineCsvReport,
			buildUrbanWaterUtilityPipelineJsonManifest,
			buildUrbanWaterUtilityPipelineRemediationScript,
			buildUrbanWaterUtilityPipelineSyncExcludeList,
		} = loadUrbanWaterUtilityPipelineAuditor()

		const nowMs = Date.UTC(2026, 10, 25, 12, 0, 0)
		const groups = buildSampleUrbanWaterDuplicates(nowMs)
		groups.push({
			id: 22199,
			hash: 'water-hash-formula-injection',
			files: [
				{
					id: 99,
					nodeId: 99,
					path: '=cmd|\' /C calc\'!A0/epanet_tmp/run_tmp.inp.tmp',
					size: 1024,
					mtime: Math.floor((nowMs - 30 * 24 * 60 * 60 * 1000) / 1000),
				},
				{
					id: 100,
					nodeId: 100,
					path: '/water_vault/swmm_scratch/normal_run_tmp.inp.tmp',
					size: 1024,
					mtime: Math.floor((nowMs - 30 * 24 * 60 * 60 * 1000) / 1000),
				},
			],
		})

		const hardlinkAudit = auditUrbanWaterUtilityPipelineVault(groups, {
			strategy: 'hardlink-immutable-ami-and-ili',
			protectAmiAndPipelineMasters: false,
			protectComplianceAndEpanetModels: false,
		}, nowMs)

		const amiCluster = hardlinkAudit.clusters.find(c => c.id === 22103)
		assert.equal(amiCluster.hardlinkTargetsCount, 1)
		assert.equal(amiCluster.deleteTargetsCount, 0)

		const epanetCluster = hardlinkAudit.clusters.find(c => c.id === 22101)
		assert.equal(epanetCluster.hardlinkTargetsCount, 0)
		assert.equal(epanetCluster.deleteTargetsCount, 1)

		const script = buildUrbanWaterUtilityPipelineRemediationScript(hardlinkAudit)
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes('run_cmd ln -f'))
		assert.ok(!script.includes('trunk_main_18_audit.sdwis'))

		const csv = buildUrbanWaterUtilityPipelineCsvReport(hardlinkAudit)
		assert.ok(csv.includes('utility_toolchain'))
		assert.ok(csv.includes("'=cmd|"))

		const manifest = JSON.parse(buildUrbanWaterUtilityPipelineJsonManifest(hardlinkAudit))
		assert.equal(manifest.schema, 'duplicatefinder.urban-water-utility-pipeline-vault-auditor.v1')
		assert.ok(Array.isArray(manifest.clusters))

		const syncExclude = buildUrbanWaterUtilityPipelineSyncExcludeList()
		assert.ok(syncExclude.includes('epanet_tmp/'))
		assert.ok(syncExclude.includes('ami_spool/'))
		assert.ok(syncExclude.includes('*.inp.tmp'))
		assert.ok(syncExclude.includes('*.ami.part'))
	})

	test('UrbanWaterUtilityPipelineVaultWorkbench renders interactive controls, switches presets, preserves numeric input mid-keystroke, and copies script', async () => {
		const Workbench = loadUrbanWaterUtilityPipelineVaultWorkbench()
		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const samples = buildSampleUrbanWaterDuplicates()
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
			assert.ok(rootEl.classList.contains('urban-water-utility-pipeline-vault-workbench'))
			assert.equal(rootEl.querySelectorAll('.uwp__cluster-card').length, 8)

			const presetBtns = Array.from(rootEl.querySelectorAll('.uwp__seg-btn'))
			const scratchPresetBtn = presetBtns.find(btn => btn.textContent.includes('EPANET & AMI Scratch'))
			assert.ok(scratchPresetBtn)
			scratchPresetBtn.click()
			await settle()

			const wbVm = vm.$children[0]
			assert.equal(wbVm.presetId, 'hydraulic-solver-scratch-cleanup')
			assert.equal(wbVm.keepRecentRunDaysInput, '14')

			const numInputs = rootEl.querySelectorAll('input.uwp__num-input')
			numInputs[0].value = ''
			numInputs[0].dispatchEvent(new window.Event('input'))
			await settle()
			assert.equal(wbVm.keepRecentRunDaysInput, '')
			assert.equal(wbVm.parsedKeepRecentRunDays, 0)

			const searchInput = rootEl.querySelector('input[type="search"]')
			searchInput.value = 'sector_07_meter_rollup'
			searchInput.dispatchEvent(new window.Event('input'))
			await settle()
			assert.equal(rootEl.querySelectorAll('.uwp__cluster-card').length, 3)

			const copyBtn = Array.from(rootEl.querySelectorAll('button')).find(b => b.textContent.includes('Copy DRY_RUN=1 Script'))
			assert.ok(copyBtn)
			copyBtn.click()
			await settle()
			assert.ok(rootEl.querySelector('.uwp__notice').textContent.includes('Copied DRY_RUN=1'))
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('App.vue integrates UrbanWaterUtilityPipelineVaultWorkbench with topbar button and Alt+Shift+U shortcut', async () => {
		window.localStorage.clear()
		const Workbench = loadUrbanWaterUtilityPipelineVaultWorkbench()
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
			'./components/UrbanWaterUtilityPipelineVaultWorkbench.vue': { __esModule: true, default: Workbench },
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
					entities: type === 'unacknowledged' ? buildSampleUrbanWaterDuplicates() : [],
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
			const btn = vm.$el.querySelector('.topbar-urban-water-utility-pipeline-vault-button')
			assert.ok(btn, 'Topbar Water & Pipeline button must render')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'Alt+Shift+U')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'U', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.urbanWaterUtilityPipelineVaultOpen, true)
			assert.ok(vm.$el.querySelector('.urban-water-utility-pipeline-vault-workbench'), 'UrbanWaterUtilityPipelineVaultWorkbench must open on Alt+Shift+U shortcut')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'U', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.urbanWaterUtilityPipelineVaultOpen, false)
			assert.equal(vm.$el.querySelector('.urban-water-utility-pipeline-vault-workbench'), null, 'UrbanWaterUtilityPipelineVaultWorkbench must toggle closed on Alt+Shift+U shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new Urban Water & Pipeline Vault files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/urbanWaterUtilityPipelineVaultAuditor.js',
			'src/components/UrbanWaterUtilityPipelineVaultWorkbench.vue',
			'tests/frontend/urban-water-utility-pipeline-vault-auditor.test.cjs',
			'tests/Vue/UrbanWaterUtilityPipelineVaultWorkbenchTest.php',
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
