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

function loadYachtRacingFoilingNmeaAuditor() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/yachtRacingFoilingNmeaVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function loadYachtRacingFoilingNmeaVaultWorkbench(clipboardOverrides = {}) {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const auditor = loadModule('src/tools/yachtRacingFoilingNmeaVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
	return loadComponent('src/components/YachtRacingFoilingNmeaVaultWorkbench.vue', {
		'../tools/clipboardHelper': {
			copyTextSafely: async () => true,
			...clipboardOverrides,
		},
		'../tools/duplicateStats': duplicateStats,
		'../tools/yachtRacingFoilingNmeaVaultAuditor': auditor,
	})
}

function buildSampleYachtDuplicates(referenceNowMs = Date.UTC(2026, 10, 25, 12, 0, 0)) {
	const oldMtime = Math.floor((referenceNowMs - 45 * 24 * 60 * 60 * 1000) / 1000)
	const recentMtime = Math.floor((referenceNowMs - 2 * 24 * 60 * 60 * 1000) / 1000)

	return [
		{
			id: 22501,
			hash: 'yacht-hash-orc-hull-offset',
			files: [
				{
					id: 1,
					nodeId: 1,
					path: '/yacht_vault/00_orc/ac75_hull_04/ac75_hull_04_cert.orc',
					size: 320 * 1024,
					mtime: oldMtime,
				},
				{
					id: 2,
					nodeId: 2,
					path: '/yacht_vault/mirror/ac75_hull_04_cert.orc',
					size: 320 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 22502,
			hash: 'yacht-hash-protest-hold',
			files: [
				{
					id: 3,
					nodeId: 3,
					path: '/yacht_vault/protest_hold/jury_hold/mark_rounding_case_09.yrhold',
					size: 512 * 1024,
					mtime: oldMtime,
				},
				{
					id: 4,
					nodeId: 4,
					path: '/yacht_vault/mirror/jury_hold/mark_rounding_case_09.yrhold',
					size: 512 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 22503,
			hash: 'yacht-hash-nmea2k-pgn-master',
			files: [
				{
					id: 5,
					nodeId: 5,
					path: '/yacht_vault/00_n2k/leg_03_biskay/leg_03_biskay_telemetry.n2k',
					size: 480 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 6,
					nodeId: 6,
					path: '/yacht_vault/nas_mirror/leg_03_biskay/leg_03_biskay_telemetry.n2k',
					size: 480 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 22504,
			hash: 'yacht-hash-foil-hydro-master',
			files: [
				{
					id: 7,
					nodeId: 7,
					path: '/yacht_vault/00_foil/starboard_tfoil_run12/starboard_tfoil_run12.foil',
					size: 640 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 8,
					nodeId: 8,
					path: '/yacht_vault/backup/starboard_tfoil_run12/starboard_tfoil_run12.foil',
					size: 640 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 22505,
			hash: 'yacht-hash-redundant-replay-anchored',
			files: [
				{
					id: 9,
					nodeId: 9,
					path: '/yacht_vault/race_replays/leg_03_biskay_telemetry_replay.mp4',
					size: 64 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 10,
					nodeId: 10,
					path: '/yacht_vault/steward_exports/leg_03_biskay_telemetry_replay.mp4',
					size: 64 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 22506,
			hash: 'yacht-hash-unanchored-gpx-export',
			files: [
				{
					id: 11,
					nodeId: 11,
					path: '/yacht_vault/gpx_tracks/orphan_regatta_88_gpx_export.gpx',
					size: 24 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 12,
					nodeId: 12,
					path: '/yacht_vault/polar_plots/orphan_regatta_88_gpx_export.gpx',
					size: 24 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 22507,
			hash: 'yacht-hash-old-expedition-scratch',
			files: [
				{
					id: 13,
					nodeId: 13,
					path: '/yacht_vault/expedition_cache/leg_03_biskay_buf.nmea.tmp',
					size: 140 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 14,
					nodeId: 14,
					path: '/yacht_vault/nmea_ring_spool/leg_03_biskay_buf.nmea.tmp',
					size: 140 * 1024 * 1024,
					mtime: oldMtime,
				},
			],
		},
		{
			id: 22508,
			hash: 'yacht-hash-recent-foil-cfd-scratch',
			files: [
				{
					id: 15,
					nodeId: 15,
					path: '/yacht_vault/foil_cfd_scratch/starboard_tfoil_run12.n2k.idx',
					size: 48 * 1024 * 1024,
					mtime: recentMtime,
				},
				{
					id: 16,
					nodeId: 16,
					path: '/yacht_vault/vpp_solver_tmp/starboard_tfoil_run12.n2k.idx',
					size: 48 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 22509,
			hash: 'yacht-hash-non-domain-excluded',
			files: [
				{
					id: 17,
					nodeId: 17,
					path: '/xr_vault/00_splat/atrium_lobby_scan_3dgs.splat',
					size: 8 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 18,
					nodeId: 18,
					path: '/hydrography_vault/00_sonar/kongsberg_line_04.kmall',
					size: 8 * 1024 * 1024,
					mtime: oldMtime,
				},
			],
		},
	]
}

describe('Cycle 225: Yacht Racing, Foil Hydrodynamics & Maritime NMEA/VDR Telemetry Vault Auditor', () => {
	test('classifyYachtRacingFoilingNmeaFile classifies all 4 vault families and excludes non-domain files', () => {
		const {
			classifyYachtRacingFoilingNmeaFile,
			extractYachtRacingFoilingNmeaStem,
			extractYachtRacingFoilingNmeaAnchorKey,
		} = loadYachtRacingFoilingNmeaAuditor()

		const orc = classifyYachtRacingFoilingNmeaFile({ path: '/yacht_vault/00_orc/ac75_hull_04_cert.orc', size: 1024 })
		assert.equal(orc.family, 'yacht-class-rules-vdr-holds')
		assert.equal(orc.isProtectedClassOrVdr, true)
		assert.equal(orc.isMutableFile, true)

		const hold = classifyYachtRacingFoilingNmeaFile({ path: '/yacht_vault/protest_hold/jury_hold/mark_rounding_case_09.yrhold', size: 2048 })
		assert.equal(hold.family, 'yacht-class-rules-vdr-holds')
		assert.equal(hold.isProtectedProtestHold, true)
		assert.equal(hold.yachtTag, 'PROTEST / VDR HOLD')

		const n2kMaster = classifyYachtRacingFoilingNmeaFile({ path: '/yacht_vault/00_n2k/leg_03_biskay_telemetry.n2k', size: 4096 })
		assert.equal(n2kMaster.family, 'yacht-nmea-foil-hydro-masters')
		assert.equal(n2kMaster.isProtectedNmeaFoilMaster, true)
		assert.equal(n2kMaster.isMutableFile, false)

		const foilMaster = classifyYachtRacingFoilingNmeaFile({ path: '/yacht_vault/00_foil/starboard_tfoil_run12.foil', size: 4096 })
		assert.equal(foilMaster.family, 'yacht-nmea-foil-hydro-masters')
		assert.equal(foilMaster.isProtectedNmeaFoilMaster, true)
		assert.equal(foilMaster.isMutableFile, false)

		const replayExport = classifyYachtRacingFoilingNmeaFile({ path: '/yacht_vault/race_replays/leg_03_biskay_telemetry_replay.mp4', size: 4096 })
		assert.equal(replayExport.family, 'redundant-yacht-export-previews')
		assert.equal(replayExport.isRedundantYachtExport, true)

		const scratch = classifyYachtRacingFoilingNmeaFile({ path: '/yacht_vault/expedition_cache/leg_03_biskay_buf.nmea.tmp', size: 4096 })
		assert.equal(scratch.family, 'yacht-nav-sim-telemetry-scratch')
		assert.equal(scratch.isScratchPath, true)

		const excludedXr = classifyYachtRacingFoilingNmeaFile({ path: '/xr_vault/00_splat/atrium_lobby_scan_3dgs.splat', size: 4096 })
		assert.equal(excludedXr.family, null)

		const excludedHydro = classifyYachtRacingFoilingNmeaFile({ path: '/hydrography_vault/00_sonar/kongsberg_line_04.kmall', size: 4096 })
		assert.equal(excludedHydro.family, null)

		assert.equal(extractYachtRacingFoilingNmeaStem('leg_03_biskay_telemetry_replay.mp4'), 'leg_03_biskay_telemetry')
		assert.equal(extractYachtRacingFoilingNmeaAnchorKey('leg_03_biskay_telemetry'), 'leg-03-biskay-telemetry')
	})

	test('auditYachtRacingFoilingNmeaVault protects ORC/VDR, protest holds, and NMEA/Foil masters while enforcing anchor guard and grace window', () => {
		const { auditYachtRacingFoilingNmeaVault } = loadYachtRacingFoilingNmeaAuditor()
		const nowMs = Date.UTC(2026, 10, 25, 12, 0, 0)
		const groups = buildSampleYachtDuplicates(nowMs)

		const report = auditYachtRacingFoilingNmeaVault(groups, {}, nowMs)
		assert.equal(report.summary.totalDomainGroupsCount, 8)
		assert.equal(report.summary.totalClustersCount, 8)
		assert.equal(report.summary.totalClassVdrClusters, 1)
		assert.equal(report.summary.totalNmeaFoilMasterClusters, 2)
		assert.equal(report.summary.totalProtestHoldClusters, 1)

		const orcCluster = report.clusters.find(c => c.id === 22501)
		assert.equal(orcCluster.reclaimableBytes, 0)
		assert.equal(orcCluster.clusterVerdict, 'yacht-class-vdr-protected')

		const holdCluster = report.clusters.find(c => c.id === 22502)
		assert.equal(holdCluster.reclaimableBytes, 0)
		assert.equal(holdCluster.clusterVerdict, 'yacht-protest-hold-protected')

		const anchoredReplay = report.clusters.find(c => c.id === 22505)
		assert.equal(anchoredReplay.hasYachtMasterAnchor, true)
		assert.equal(anchoredReplay.clusterVerdict, 'yacht-export-redundant')
		assert.equal(anchoredReplay.reclaimableBytes, 2 * 64 * 1024 * 1024)

		const unanchoredGpx = report.clusters.find(c => c.id === 22506)
		assert.equal(unanchoredGpx.hasYachtMasterAnchor, false)
		assert.equal(unanchoredGpx.reclaimableBytes, 0)
		assert.equal(unanchoredGpx.clusterVerdict, 'shielded')

		const unguardedReport = auditYachtRacingFoilingNmeaVault(groups, { requireYachtMasterAnchorForPrune: false }, nowMs)
		const unanchoredUnguarded = unguardedReport.clusters.find(c => c.id === 22506)
		assert.equal(unanchoredUnguarded.reclaimableBytes, 24 * 1024 * 1024)

		const graceReport = auditYachtRacingFoilingNmeaVault(groups, { keepRecentRunDays: 14 }, nowMs)
		const recentScratch = graceReport.clusters.find(c => c.id === 22508)
		assert.equal(recentScratch.reclaimableBytes, 0)
		assert.equal(recentScratch.clusterVerdict, 'shielded')
		const oldScratch = graceReport.clusters.find(c => c.id === 22507)
		assert.equal(oldScratch.reclaimableBytes, 140 * 1024 * 1024)
	})

	test('hardlink strategy never hardlinks mutable ORC/VDR/export/scratch and generates safe POSIX script, CWE-1236 CSV, JSON, and sync-exclude', () => {
		const {
			auditYachtRacingFoilingNmeaVault,
			buildYachtRacingFoilingNmeaCsvReport,
			buildYachtRacingFoilingNmeaJsonManifest,
			buildYachtRacingFoilingNmeaRemediationScript,
			buildYachtRacingFoilingNmeaSyncExcludeList,
		} = loadYachtRacingFoilingNmeaAuditor()

		const nowMs = Date.UTC(2026, 10, 25, 12, 0, 0)
		const groups = buildSampleYachtDuplicates(nowMs)
		groups.push({
			id: 22599,
			hash: 'yacht-hash-formula-injection',
			files: [
				{
					id: 99,
					nodeId: 99,
					path: '=cmd|\' /C calc\'!A0/expedition_cache/run_tmp.nmea.tmp',
					size: 1024,
					mtime: Math.floor((nowMs - 30 * 24 * 60 * 60 * 1000) / 1000),
				},
				{
					id: 100,
					nodeId: 100,
					path: '/yacht_vault/nmea_ring_spool/normal_run_tmp.n2k.idx',
					size: 1024,
					mtime: Math.floor((nowMs - 30 * 24 * 60 * 60 * 1000) / 1000),
				},
			],
		})

		const hardlinkAudit = auditYachtRacingFoilingNmeaVault(groups, {
			strategy: 'hardlink-immutable-yacht-masters',
			protectNmeaFoilHydroMasters: false,
			protectClassRulesAndVdrBaselines: false,
		}, nowMs)

		const n2kCluster = hardlinkAudit.clusters.find(c => c.id === 22503)
		assert.equal(n2kCluster.hardlinkTargetsCount, 1)
		assert.equal(n2kCluster.deleteTargetsCount, 0)

		const orcCluster = hardlinkAudit.clusters.find(c => c.id === 22501)
		assert.equal(orcCluster.hardlinkTargetsCount, 0)
		assert.equal(orcCluster.deleteTargetsCount, 1)

		const script = buildYachtRacingFoilingNmeaRemediationScript(hardlinkAudit)
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes('run_cmd ln -f'))
		assert.ok(!script.includes('mark_rounding_case_09.yrhold'))

		const csv = buildYachtRacingFoilingNmeaCsvReport(hardlinkAudit)
		assert.ok(csv.includes('maritime_toolchain'))
		assert.ok(csv.includes("'=cmd|"))

		const manifest = JSON.parse(buildYachtRacingFoilingNmeaJsonManifest(hardlinkAudit))
		assert.equal(manifest.schema, 'duplicatefinder.yacht-racing-foiling-nmea-vault-auditor.v1')
		assert.ok(Array.isArray(manifest.clusters))

		const syncExclude = buildYachtRacingFoilingNmeaSyncExcludeList()
		assert.ok(syncExclude.includes('expedition_cache/'))
		assert.ok(syncExclude.includes('nmea_ring_spool/'))
		assert.ok(syncExclude.includes('*.nmea.tmp'))
		assert.ok(syncExclude.includes('*.n2k.idx'))
	})

	test('YachtRacingFoilingNmeaVaultWorkbench renders interactive controls, switches presets, preserves numeric input mid-keystroke, and copies script', async () => {
		const Workbench = loadYachtRacingFoilingNmeaVaultWorkbench()
		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const samples = buildSampleYachtDuplicates()
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
			assert.ok(rootEl.classList.contains('yacht-racing-foiling-nmea-vault-workbench'))
			assert.equal(rootEl.querySelectorAll('.yrn__cluster-card').length, 8)

			const presetBtns = Array.from(rootEl.querySelectorAll('.yrn__seg-btn'))
			const scratchPresetBtn = presetBtns.find(btn => btn.textContent.includes('Nav & Telemetry Scratch'))
			assert.ok(scratchPresetBtn)
			scratchPresetBtn.click()
			await settle()

			const wbVm = vm.$children[0]
			assert.equal(wbVm.presetId, 'yacht-nav-scratch-cleanup')
			assert.equal(wbVm.keepRecentRunDaysInput, '14')

			const numInputs = rootEl.querySelectorAll('input.yrn__num-input')
			numInputs[0].value = ''
			numInputs[0].dispatchEvent(new window.Event('input'))
			await settle()
			assert.equal(wbVm.keepRecentRunDaysInput, '')
			assert.equal(wbVm.parsedKeepRecentRunDays, 0)

			const searchInput = rootEl.querySelector('input[type="search"]')
			searchInput.value = 'leg_03_biskay'
			searchInput.dispatchEvent(new window.Event('input'))
			await settle()
			assert.equal(rootEl.querySelectorAll('.yrn__cluster-card').length, 3)

			const copyBtn = Array.from(rootEl.querySelectorAll('button')).find(b => b.textContent.includes('Copy DRY_RUN=1 Script'))
			assert.ok(copyBtn)
			copyBtn.click()
			await settle()
			assert.ok(rootEl.querySelector('.yrn__notice').textContent.includes('Copied DRY_RUN=1'))
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('App.vue integrates YachtRacingFoilingNmeaVaultWorkbench with topbar button and Alt+Shift+Y shortcut', async () => {
		window.localStorage.clear()
		const Workbench = loadYachtRacingFoilingNmeaVaultWorkbench()
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
			'./components/WineEnologyHaccpVaultWorkbench.vue': { __esModule: true, default: stub('wine-enology-haccp-vault-auditor') },
			'./components/XrSpatialNerfSplatVaultWorkbench.vue': { __esModule: true, default: stub('xr-spatial-nerf-splat-vault-auditor') },
			'./components/YachtRacingFoilingNmeaVaultWorkbench.vue': { __esModule: true, default: Workbench },
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
					entities: type === 'unacknowledged' ? buildSampleYachtDuplicates() : [],
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
			const btn = vm.$el.querySelector('.topbar-yacht-racing-foiling-nmea-vault-button')
			assert.ok(btn, 'Topbar Yacht & NMEA/VDR button must render')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'Alt+Shift+Y')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Y', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.yachtRacingFoilingNmeaVaultOpen, true)
			assert.ok(vm.$el.querySelector('.yacht-racing-foiling-nmea-vault-workbench'), 'YachtRacingFoilingNmeaVaultWorkbench must open on Alt+Shift+Y shortcut')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Y', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.yachtRacingFoilingNmeaVaultOpen, false)
			assert.equal(vm.$el.querySelector('.yacht-racing-foiling-nmea-vault-workbench'), null, 'YachtRacingFoilingNmeaVaultWorkbench must toggle closed on Alt+Shift+Y shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new Yacht Racing, Foil Hydrodynamics & Maritime NMEA/VDR Vault files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/yachtRacingFoilingNmeaVaultAuditor.js',
			'src/components/YachtRacingFoilingNmeaVaultWorkbench.vue',
			'tests/frontend/yacht-racing-foiling-nmea-vault-auditor.test.cjs',
			'tests/Vue/YachtRacingFoilingNmeaVaultWorkbenchTest.php',
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
