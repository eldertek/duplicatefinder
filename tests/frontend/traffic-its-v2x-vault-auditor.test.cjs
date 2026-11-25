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

function loadTrafficItsV2xAuditor() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/trafficItsV2xVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function loadTrafficItsV2xVaultWorkbench(clipboardOverrides = {}) {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const auditor = loadModule('src/tools/trafficItsV2xVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
	return loadComponent('src/components/TrafficItsV2xVaultWorkbench.vue', {
		'../tools/clipboardHelper': {
			copyTextSafely: async () => true,
			...clipboardOverrides,
		},
		'../tools/duplicateStats': duplicateStats,
		'../tools/trafficItsV2xVaultAuditor': auditor,
	})
}

function buildSampleTrafficItsV2xDuplicates(referenceNowMs = Date.UTC(2026, 10, 25, 12, 0, 0)) {
	const oldMtime = Math.floor((referenceNowMs - 45 * 24 * 60 * 60 * 1000) / 1000)
	const recentMtime = Math.floor((referenceNowMs - 2 * 24 * 60 * 60 * 1000) / 1000)

	return [
		{
			id: 22001,
			hash: 'traffic-hash-pki-timing',
			files: [
				{
					id: 1,
					nodeId: 1,
					path: '/traffic_vault/00_timing/corridor_i90/signal_plan_am_peak.ntcip',
					size: 160 * 1024,
					mtime: oldMtime,
				},
				{
					id: 2,
					nodeId: 2,
					path: '/traffic_vault/mirror/signal_plan_am_peak.ntcip',
					size: 160 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 22002,
			hash: 'traffic-hash-safety-hold',
			files: [
				{
					id: 3,
					nodeId: 3,
					path: '/traffic_vault/safety_hold/crash_hold/intersection_44_v2x.scms',
					size: 256 * 1024,
					mtime: oldMtime,
				},
				{
					id: 4,
					nodeId: 4,
					path: '/traffic_vault/mirror/safety_hold/intersection_44_v2x.scms',
					size: 256 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 22003,
			hash: 'traffic-hash-rsu-pcapng-master',
			files: [
				{
					id: 5,
					nodeId: 5,
					path: '/traffic_vault/00_v2x/rsu_corridor_north/rsu_07_bsm_capture.pcapng',
					size: 640 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 6,
					nodeId: 6,
					path: '/traffic_vault/nas_mirror/rsu_corridor_north/rsu_07_bsm_capture.pcapng',
					size: 640 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 22004,
			hash: 'traffic-hash-sumo-network-master',
			files: [
				{
					id: 7,
					nodeId: 7,
					path: '/traffic_vault/00_sim/metro_ring/corridor_08_calibrated.net.xml',
					size: 320 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 8,
					nodeId: 8,
					path: '/traffic_vault/backup/metro_ring/corridor_08_calibrated.net.xml',
					size: 320 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 22005,
			hash: 'traffic-hash-redundant-heatmap-anchored',
			files: [
				{
					id: 9,
					nodeId: 9,
					path: '/traffic_vault/corridor_heatmaps/rsu_07_bsm_capture_los_report.png',
					size: 84 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 10,
					nodeId: 10,
					path: '/traffic_vault/speed_contours/rsu_07_bsm_capture_los_report.png',
					size: 84 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 22006,
			hash: 'traffic-hash-unanchored-fcd-export',
			files: [
				{
					id: 11,
					nodeId: 11,
					path: '/traffic_vault/fcd_exports/orphan_arterial_901_fcd_export.csv',
					size: 16 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 12,
					nodeId: 12,
					path: '/traffic_vault/travel_time_reports/orphan_arterial_901_fcd_export.csv',
					size: 16 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 22007,
			hash: 'traffic-hash-sumo-old-scratch',
			files: [
				{
					id: 13,
					nodeId: 13,
					path: '/traffic_vault/sumo_tmp/corridor_08_run.rou.tmp',
					size: 190 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 14,
					nodeId: 14,
					path: '/traffic_vault/vissim_scratch/corridor_08_run.rou.tmp',
					size: 190 * 1024 * 1024,
					mtime: oldMtime,
				},
			],
		},
		{
			id: 22008,
			hash: 'traffic-hash-recent-rsu-scratch',
			files: [
				{
					id: 15,
					nodeId: 15,
					path: '/traffic_vault/rsu_spool/corridor_08_calibrated.blf.part',
					size: 58 * 1024 * 1024,
					mtime: recentMtime,
				},
				{
					id: 16,
					nodeId: 16,
					path: '/traffic_vault/obu_cache/corridor_08_calibrated.blf.part',
					size: 58 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 22009,
			hash: 'traffic-hash-non-domain-excluded',
			files: [
				{
					id: 17,
					nodeId: 17,
					path: '/photos/vacation_2026/beach_sunset.jpg',
					size: 8 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 18,
					nodeId: 18,
					path: '/speech_vault/00_alignments/speaker_01.TextGrid',
					size: 8 * 1024 * 1024,
					mtime: oldMtime,
				},
			],
		},
	]
}

describe('Cycle 220: Traffic ITS, V2X Connected Mobility & Corridor Signal Vault Auditor', () => {
	test('classifyTrafficItsV2xFile classifies all 4 vault families and excludes non-domain files', () => {
		const { classifyTrafficItsV2xFile, extractTrafficItsV2xStem, extractTrafficItsV2xAnchorKey } = loadTrafficItsV2xAuditor()

		const pkiTiming = classifyTrafficItsV2xFile({ path: '/traffic_vault/00_timing/signal_plan_am_peak.ntcip', size: 1024 })
		assert.equal(pkiTiming.family, 'v2x-pki-signal-timing-holds')
		assert.equal(pkiTiming.isProtectedPkiTiming, true)
		assert.equal(pkiTiming.isMutableFile, true)

		const safetyHold = classifyTrafficItsV2xFile({ path: '/traffic_vault/safety_hold/crash_hold/intersection_44_v2x.scms', size: 2048 })
		assert.equal(safetyHold.family, 'v2x-pki-signal-timing-holds')
		assert.equal(safetyHold.isProtectedSafetyHold, true)
		assert.equal(safetyHold.trafficTag, 'CORRIDOR SAFETY HOLD')

		const pcapMaster = classifyTrafficItsV2xFile({ path: '/traffic_vault/00_v2x/rsu_07_bsm_capture.pcapng', size: 4096 })
		assert.equal(pcapMaster.family, 'traffic-v2x-telemetry-masters')
		assert.equal(pcapMaster.isProtectedTelemetryMaster, true)
		assert.equal(pcapMaster.isMutableFile, false)

		const sumoMaster = classifyTrafficItsV2xFile({ path: '/traffic_vault/00_sim/corridor_08_calibrated.net.xml', size: 4096 })
		assert.equal(sumoMaster.family, 'traffic-v2x-telemetry-masters')
		assert.equal(sumoMaster.isProtectedTelemetryMaster, true)
		assert.equal(sumoMaster.isMutableFile, true)

		const heatmapExport = classifyTrafficItsV2xFile({ path: '/traffic_vault/corridor_heatmaps/rsu_07_bsm_capture_los_report.png', size: 4096 })
		assert.equal(heatmapExport.family, 'redundant-corridor-report-exports')
		assert.equal(heatmapExport.isRedundantTrafficExport, true)

		const scratch = classifyTrafficItsV2xFile({ path: '/traffic_vault/sumo_tmp/corridor_08_run.rou.tmp', size: 4096 })
		assert.equal(scratch.family, 'sumo-vissim-rsu-scratch')
		assert.equal(scratch.isScratchPath, true)

		const nonDomainPhoto = classifyTrafficItsV2xFile({ path: '/photos/vacation_2026/beach_sunset.jpg', size: 4096 })
		assert.equal(nonDomainPhoto.family, null)

		const excludedSpeech = classifyTrafficItsV2xFile({ path: '/speech_vault/00_alignments/speaker_01.TextGrid', size: 4096 })
		assert.equal(excludedSpeech.family, null)

		assert.equal(extractTrafficItsV2xStem('rsu_07_bsm_capture_los_report.png'), 'rsu_07_bsm_capture')
		assert.equal(extractTrafficItsV2xAnchorKey('rsu_07_bsm_capture'), 'rsu-07-bsm-capture')
	})

	test('auditTrafficItsV2xVault protects PKI, timing, safety holds, and V2X/Sim masters while enforcing anchor guard and grace window', () => {
		const { auditTrafficItsV2xVault } = loadTrafficItsV2xAuditor()
		const nowMs = Date.UTC(2026, 10, 25, 12, 0, 0)
		const groups = buildSampleTrafficItsV2xDuplicates(nowMs)

		const report = auditTrafficItsV2xVault(groups, {}, nowMs)
		assert.equal(report.summary.totalDomainGroupsCount, 8)
		assert.equal(report.summary.totalClustersCount, 8)
		assert.equal(report.summary.totalPkiTimingClusters, 1)
		assert.equal(report.summary.totalTelemetryMasterClusters, 2)
		assert.equal(report.summary.totalSafetyHoldClusters, 1)

		const pkiCluster = report.clusters.find(c => c.id === 22001)
		assert.equal(pkiCluster.reclaimableBytes, 0)
		assert.equal(pkiCluster.clusterVerdict, 'v2x-pki-timing-protected')

		const safetyCluster = report.clusters.find(c => c.id === 22002)
		assert.equal(safetyCluster.reclaimableBytes, 0)
		assert.equal(safetyCluster.clusterVerdict, 'corridor-safety-hold-protected')

		const anchoredExport = report.clusters.find(c => c.id === 22005)
		assert.equal(anchoredExport.hasTrafficMasterAnchor, true)
		assert.equal(anchoredExport.clusterVerdict, 'corridor-export-redundant')
		assert.equal(anchoredExport.reclaimableBytes, 2 * 84 * 1024 * 1024)

		const unanchoredExport = report.clusters.find(c => c.id === 22006)
		assert.equal(unanchoredExport.hasTrafficMasterAnchor, false)
		assert.equal(unanchoredExport.reclaimableBytes, 0)
		assert.equal(unanchoredExport.clusterVerdict, 'shielded')

		const unguardedReport = auditTrafficItsV2xVault(groups, { requireTrafficAnchorForPrune: false }, nowMs)
		const unanchoredUnguarded = unguardedReport.clusters.find(c => c.id === 22006)
		assert.equal(unanchoredUnguarded.reclaimableBytes, 16 * 1024 * 1024)

		const graceReport = auditTrafficItsV2xVault(groups, { keepRecentRunDays: 14 }, nowMs)
		const recentScratch = graceReport.clusters.find(c => c.id === 22008)
		assert.equal(recentScratch.reclaimableBytes, 0)
		assert.equal(recentScratch.clusterVerdict, 'shielded')
		const oldScratch = graceReport.clusters.find(c => c.id === 22007)
		assert.equal(oldScratch.reclaimableBytes, 190 * 1024 * 1024)
	})

	test('hardlink strategy never hardlinks mutable SUMO/PKI/heatmap/scratch and generates safe POSIX script, CWE-1236 CSV, JSON, and sync-exclude', () => {
		const {
			auditTrafficItsV2xVault,
			buildTrafficItsV2xCsvReport,
			buildTrafficItsV2xJsonManifest,
			buildTrafficItsV2xRemediationScript,
			buildTrafficItsV2xSyncExcludeList,
		} = loadTrafficItsV2xAuditor()

		const nowMs = Date.UTC(2026, 10, 25, 12, 0, 0)
		const groups = buildSampleTrafficItsV2xDuplicates(nowMs)
		groups.push({
			id: 22099,
			hash: 'traffic-hash-formula-injection',
			files: [
				{
					id: 99,
					nodeId: 99,
					path: '=cmd|\' /C calc\'!A0/sumo_tmp/run_tmp.rou.tmp',
					size: 1024,
					mtime: Math.floor((nowMs - 30 * 24 * 60 * 60 * 1000) / 1000),
				},
				{
					id: 100,
					nodeId: 100,
					path: '/traffic_vault/vissim_scratch/normal_run_tmp.rou.tmp',
					size: 1024,
					mtime: Math.floor((nowMs - 30 * 24 * 60 * 60 * 1000) / 1000),
				},
			],
		})

		const hardlinkAudit = auditTrafficItsV2xVault(groups, {
			strategy: 'hardlink-immutable-v2x-and-loop-masters',
			protectTelemetryAndSimMasters: false,
		}, nowMs)

		const pcapCluster = hardlinkAudit.clusters.find(c => c.id === 22003)
		assert.equal(pcapCluster.hardlinkTargetsCount, 1)
		assert.equal(pcapCluster.deleteTargetsCount, 0)

		const sumoCluster = hardlinkAudit.clusters.find(c => c.id === 22004)
		assert.equal(sumoCluster.hardlinkTargetsCount, 0)
		assert.equal(sumoCluster.deleteTargetsCount, 1)

		const script = buildTrafficItsV2xRemediationScript(hardlinkAudit)
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes('run_cmd ln -f'))
		assert.ok(!script.includes('signal_plan_am_peak.ntcip'))
		assert.ok(!script.includes('intersection_44_v2x.scms'))

		const csv = buildTrafficItsV2xCsvReport(hardlinkAudit)
		assert.ok(csv.includes('traffic_toolchain'))
		assert.ok(csv.includes("'=cmd|"))

		const manifest = JSON.parse(buildTrafficItsV2xJsonManifest(hardlinkAudit))
		assert.equal(manifest.schema, 'duplicatefinder.traffic-its-v2x-vault-auditor.v1')
		assert.ok(Array.isArray(manifest.clusters))

		const syncExclude = buildTrafficItsV2xSyncExcludeList()
		assert.ok(syncExclude.includes('sumo_tmp/'))
		assert.ok(syncExclude.includes('vissim_scratch/'))
		assert.ok(syncExclude.includes('*.rou.tmp'))
		assert.ok(syncExclude.includes('*.blf.part'))
	})

	test('TrafficItsV2xVaultWorkbench renders interactive controls, switches presets, preserves numeric input mid-keystroke, and copies script', async () => {
		const Workbench = loadTrafficItsV2xVaultWorkbench()
		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const samples = buildSampleTrafficItsV2xDuplicates()
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
			assert.ok(rootEl.classList.contains('traffic-its-v2x-vault-workbench'))
			assert.equal(rootEl.querySelectorAll('.tiv__cluster-card').length, 8)

			const presetBtns = Array.from(rootEl.querySelectorAll('.tiv__seg-btn'))
			const scratchPresetBtn = presetBtns.find(btn => btn.textContent.includes('SUMO, VISSIM & RSU Scratch'))
			assert.ok(scratchPresetBtn)
			scratchPresetBtn.click()
			await settle()

			const wbVm = vm.$children[0]
			assert.equal(wbVm.presetId, 'sumo-vissim-rsu-scratch-cleanup')
			assert.equal(wbVm.keepRecentRunDaysInput, '14')

			const numInputs = rootEl.querySelectorAll('input.tiv__num-input')
			numInputs[0].value = ''
			numInputs[0].dispatchEvent(new window.Event('input'))
			await settle()
			assert.equal(wbVm.keepRecentRunDaysInput, '')
			assert.equal(wbVm.parsedKeepRecentRunDays, 0)

			const searchInput = rootEl.querySelector('input[type="search"]')
			searchInput.value = 'corridor_08_calibrated'
			searchInput.dispatchEvent(new window.Event('input'))
			await settle()
			assert.equal(rootEl.querySelectorAll('.tiv__cluster-card').length, 2)

			const copyBtn = Array.from(rootEl.querySelectorAll('button')).find(b => b.textContent.includes('Copy DRY_RUN=1 Script'))
			assert.ok(copyBtn)
			copyBtn.click()
			await settle()
			assert.ok(rootEl.querySelector('.tiv__notice').textContent.includes('Copied DRY_RUN=1'))
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('App.vue integrates TrafficItsV2xVaultWorkbench with topbar button and Alt+Shift+T shortcut', async () => {
		window.localStorage.clear()
		const Workbench = loadTrafficItsV2xVaultWorkbench()
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
			'./components/TrafficItsV2xVaultWorkbench.vue': { __esModule: true, default: Workbench },
			'./components/UrbanWaterUtilityPipelineVaultWorkbench.vue': { __esModule: true, default: stub('urban-water-utility-pipeline-vault-auditor') },
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
					entities: type === 'unacknowledged' ? buildSampleTrafficItsV2xDuplicates() : [],
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
			const btn = vm.$el.querySelector('.topbar-traffic-its-v2x-vault-button')
			assert.ok(btn, 'Topbar Traffic & V2X button must render')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'Alt+Shift+T')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'T', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.trafficItsV2xVaultOpen, true)
			assert.ok(vm.$el.querySelector('.traffic-its-v2x-vault-workbench'), 'TrafficItsV2xVaultWorkbench must open on Alt+Shift+T shortcut')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'T', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.trafficItsV2xVaultOpen, false)
			assert.equal(vm.$el.querySelector('.traffic-its-v2x-vault-workbench'), null, 'TrafficItsV2xVaultWorkbench must toggle closed on Alt+Shift+T shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new Traffic ITS & V2X Vault files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/trafficItsV2xVaultAuditor.js',
			'src/components/TrafficItsV2xVaultWorkbench.vue',
			'tests/frontend/traffic-its-v2x-vault-auditor.test.cjs',
			'tests/Vue/TrafficItsV2xVaultWorkbenchTest.php',
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
