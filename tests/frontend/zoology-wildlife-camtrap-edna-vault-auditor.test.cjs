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

function loadZoologyWildlifeCamtrapEdnaAuditor() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/zoologyWildlifeCamtrapEdnaVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function loadZoologyWildlifeCamtrapEdnaVaultWorkbench(clipboardOverrides = {}) {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const auditor = loadModule('src/tools/zoologyWildlifeCamtrapEdnaVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
	return loadComponent('src/components/ZoologyWildlifeCamtrapEdnaVaultWorkbench.vue', {
		'../tools/clipboardHelper': {
			copyTextSafely: async () => true,
			...clipboardOverrides,
		},
		'../tools/duplicateStats': duplicateStats,
		'../tools/zoologyWildlifeCamtrapEdnaVaultAuditor': auditor,
	})
}

function buildSampleWildlifeDuplicates(referenceNowMs = Date.UTC(2026, 10, 25, 12, 0, 0)) {
	const oldMtime = Math.floor((referenceNowMs - 45 * 24 * 60 * 60 * 1000) / 1000)
	const recentMtime = Math.floor((referenceNowMs - 2 * 24 * 60 * 60 * 1000) / 1000)

	return [
		{
			id: 22601,
			hash: 'wildlife-hash-cites-permit',
			files: [
				{
					id: 1,
					nodeId: 1,
					path: '/wildlife_vault/00_cites/lynx_survey_2026/lynx_survey_2026_permit.cites',
					size: 320 * 1024,
					mtime: oldMtime,
				},
				{
					id: 2,
					nodeId: 2,
					path: '/wildlife_vault/mirror/lynx_survey_2026_permit.cites',
					size: 320 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 22602,
			hash: 'wildlife-hash-quarantine-hold',
			files: [
				{
					id: 3,
					nodeId: 3,
					path: '/wildlife_vault/poaching_hold/quarantine_hold/seizure_case_14.wildlife_hold',
					size: 512 * 1024,
					mtime: oldMtime,
				},
				{
					id: 4,
					nodeId: 4,
					path: '/wildlife_vault/mirror/quarantine_hold/seizure_case_14.wildlife_hold',
					size: 512 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 22603,
			hash: 'wildlife-hash-camtrap-master',
			files: [
				{
					id: 5,
					nodeId: 5,
					path: '/wildlife_vault/00_camtrap/serengeti_grid_07/serengeti_grid_07_burst.raw',
					size: 480 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 6,
					nodeId: 6,
					path: '/wildlife_vault/nas_mirror/serengeti_grid_07/serengeti_grid_07_burst.raw',
					size: 480 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 22604,
			hash: 'wildlife-hash-edna-master',
			files: [
				{
					id: 7,
					nodeId: 7,
					path: '/wildlife_vault/00_edna/alpine_stream_12/alpine_stream_12_run.pod5',
					size: 640 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 8,
					nodeId: 8,
					path: '/wildlife_vault/backup/alpine_stream_12/alpine_stream_12_run.pod5',
					size: 640 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 22605,
			hash: 'wildlife-hash-redundant-crop-anchored',
			files: [
				{
					id: 9,
					nodeId: 9,
					path: '/wildlife_vault/annotated_crops/serengeti_grid_07_burst_annotated.jpg',
					size: 64 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 10,
					nodeId: 10,
					path: '/wildlife_vault/camtrap_thumbs/serengeti_grid_07_burst_annotated.jpg',
					size: 64 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 22606,
			hash: 'wildlife-hash-unanchored-krona-export',
			files: [
				{
					id: 11,
					nodeId: 11,
					path: '/wildlife_vault/edna_krona_html/orphan_transect_88_krona.html',
					size: 24 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 12,
					nodeId: 12,
					path: '/wildlife_vault/diversity_reports/orphan_transect_88_krona.html',
					size: 24 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 22607,
			hash: 'wildlife-hash-old-megadetector-scratch',
			files: [
				{
					id: 13,
					nodeId: 13,
					path: '/wildlife_vault/megadetector_cache/serengeti_grid_07_buf.camtrap.tmp',
					size: 140 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 14,
					nodeId: 14,
					path: '/wildlife_vault/camtrap_ingest_tmp/serengeti_grid_07_buf.camtrap.tmp',
					size: 140 * 1024 * 1024,
					mtime: oldMtime,
				},
			],
		},
		{
			id: 22608,
			hash: 'wildlife-hash-recent-qiime2-scratch',
			files: [
				{
					id: 15,
					nodeId: 15,
					path: '/wildlife_vault/qiime2_artifact_tmp/alpine_stream_12.edna.idx',
					size: 48 * 1024 * 1024,
					mtime: recentMtime,
				},
				{
					id: 16,
					nodeId: 16,
					path: '/wildlife_vault/edna_demux_scratch/alpine_stream_12.edna.idx',
					size: 48 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 22609,
			hash: 'wildlife-hash-non-domain-excluded',
			files: [
				{
					id: 17,
					nodeId: 17,
					path: '/yacht_vault/00_n2k/leg_03_biskay.n2k',
					size: 8 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 18,
					nodeId: 18,
					path: '/xr_vault/00_splat/atrium_lobby_scan_3dgs.splat',
					size: 8 * 1024 * 1024,
					mtime: oldMtime,
				},
			],
		},
	]
}

describe('Cycle 226: Zoology, Wildlife Camera-Trap, GPS Collar & Biodiversity eDNA Vault Auditor', () => {
	test('classifyZoologyWildlifeCamtrapEdnaFile classifies all 4 vault families and excludes non-domain files', () => {
		const {
			classifyZoologyWildlifeCamtrapEdnaFile,
			extractZoologyWildlifeCamtrapEdnaStem,
			extractZoologyWildlifeCamtrapEdnaAnchorKey,
		} = loadZoologyWildlifeCamtrapEdnaAuditor()

		const cites = classifyZoologyWildlifeCamtrapEdnaFile({ path: '/wildlife_vault/00_cites/lynx_survey_2026_permit.cites', size: 1024 })
		assert.equal(cites.family, 'wildlife-cites-permits-quarantine-holds')
		assert.equal(cites.isProtectedCitesOrVoucher, true)
		assert.equal(cites.isMutableFile, true)

		const hold = classifyZoologyWildlifeCamtrapEdnaFile({ path: '/wildlife_vault/poaching_hold/quarantine_hold/seizure_case_14.wildlife_hold', size: 2048 })
		assert.equal(hold.family, 'wildlife-cites-permits-quarantine-holds')
		assert.equal(hold.isProtectedWildlifeHold, true)
		assert.equal(hold.wildlifeTag, 'CITES / QUARANTINE HOLD')

		const camtrapMaster = classifyZoologyWildlifeCamtrapEdnaFile({ path: '/wildlife_vault/00_camtrap/serengeti_grid_07_burst.raw', size: 4096 })
		assert.equal(camtrapMaster.family, 'wildlife-camtrap-gps-edna-masters')
		assert.equal(camtrapMaster.isProtectedWildlifeMaster, true)
		assert.equal(camtrapMaster.isMutableFile, false)

		const collarMaster = classifyZoologyWildlifeCamtrapEdnaFile({ path: '/wildlife_vault/00_collar/wolf_pack_alpha_04.lotek', size: 4096 })
		assert.equal(collarMaster.family, 'wildlife-camtrap-gps-edna-masters')
		assert.equal(collarMaster.isProtectedWildlifeMaster, true)
		assert.equal(collarMaster.wildlifeTag, 'GPS COLLAR MASTER')

		const ednaMaster = classifyZoologyWildlifeCamtrapEdnaFile({ path: '/wildlife_vault/00_edna/alpine_stream_12_run.pod5', size: 4096 })
		assert.equal(ednaMaster.family, 'wildlife-camtrap-gps-edna-masters')
		assert.equal(ednaMaster.isProtectedWildlifeMaster, true)
		assert.equal(ednaMaster.isMutableFile, false)

		const cropExport = classifyZoologyWildlifeCamtrapEdnaFile({ path: '/wildlife_vault/annotated_crops/serengeti_grid_07_burst_annotated.jpg', size: 4096 })
		assert.equal(cropExport.family, 'redundant-wildlife-export-previews')
		assert.equal(cropExport.isRedundantWildlifeExport, true)

		const scratch = classifyZoologyWildlifeCamtrapEdnaFile({ path: '/wildlife_vault/megadetector_cache/serengeti_grid_07_buf.camtrap.tmp', size: 4096 })
		assert.equal(scratch.family, 'wildlife-pipeline-ingest-scratch')
		assert.equal(scratch.isScratchPath, true)

		const excludedYacht = classifyZoologyWildlifeCamtrapEdnaFile({ path: '/yacht_vault/00_n2k/leg_03_biskay.n2k', size: 4096 })
		assert.equal(excludedYacht.family, null)

		const excludedXr = classifyZoologyWildlifeCamtrapEdnaFile({ path: '/xr_vault/00_splat/atrium_lobby_scan_3dgs.splat', size: 4096 })
		assert.equal(excludedXr.family, null)

		assert.equal(extractZoologyWildlifeCamtrapEdnaStem('serengeti_grid_07_burst_annotated.jpg'), 'serengeti_grid_07_burst')
		assert.equal(extractZoologyWildlifeCamtrapEdnaAnchorKey('serengeti_grid_07_burst'), 'serengeti-grid-07-burst')
	})

	test('auditZoologyWildlifeCamtrapEdnaVault protects CITES/vouchers, quarantine holds, and wildlife masters while enforcing anchor guard and grace window', () => {
		const { auditZoologyWildlifeCamtrapEdnaVault } = loadZoologyWildlifeCamtrapEdnaAuditor()
		const nowMs = Date.UTC(2026, 10, 25, 12, 0, 0)
		const groups = buildSampleWildlifeDuplicates(nowMs)

		const report = auditZoologyWildlifeCamtrapEdnaVault(groups, {}, nowMs)
		assert.equal(report.summary.totalDomainGroupsCount, 8)
		assert.equal(report.summary.totalClustersCount, 8)
		assert.equal(report.summary.totalCitesVoucherClusters, 1)
		assert.equal(report.summary.totalWildlifeMasterClusters, 2)
		assert.equal(report.summary.totalWildlifeHoldClusters, 1)

		const citesCluster = report.clusters.find(c => c.id === 22601)
		assert.equal(citesCluster.reclaimableBytes, 0)
		assert.equal(citesCluster.clusterVerdict, 'wildlife-cites-voucher-protected')

		const holdCluster = report.clusters.find(c => c.id === 22602)
		assert.equal(holdCluster.reclaimableBytes, 0)
		assert.equal(holdCluster.clusterVerdict, 'wildlife-hold-protected')

		const anchoredCrop = report.clusters.find(c => c.id === 22605)
		assert.equal(anchoredCrop.hasWildlifeMasterAnchor, true)
		assert.equal(anchoredCrop.clusterVerdict, 'wildlife-export-redundant')
		assert.equal(anchoredCrop.reclaimableBytes, 2 * 64 * 1024 * 1024)

		const unanchoredKrona = report.clusters.find(c => c.id === 22606)
		assert.equal(unanchoredKrona.hasWildlifeMasterAnchor, false)
		assert.equal(unanchoredKrona.reclaimableBytes, 0)
		assert.equal(unanchoredKrona.clusterVerdict, 'shielded')

		const unguardedReport = auditZoologyWildlifeCamtrapEdnaVault(groups, { requireWildlifeMasterAnchorForPrune: false }, nowMs)
		const unanchoredUnguarded = unguardedReport.clusters.find(c => c.id === 22606)
		assert.equal(unanchoredUnguarded.reclaimableBytes, 24 * 1024 * 1024)

		const graceReport = auditZoologyWildlifeCamtrapEdnaVault(groups, { keepRecentRunDays: 14 }, nowMs)
		const recentScratch = graceReport.clusters.find(c => c.id === 22608)
		assert.equal(recentScratch.reclaimableBytes, 0)
		assert.equal(recentScratch.clusterVerdict, 'shielded')
		const oldScratch = graceReport.clusters.find(c => c.id === 22607)
		assert.equal(oldScratch.reclaimableBytes, 140 * 1024 * 1024)
	})

	test('hardlink strategy never hardlinks mutable CITES/export/scratch and generates safe POSIX script, CWE-1236 CSV, JSON, and sync-exclude', () => {
		const {
			auditZoologyWildlifeCamtrapEdnaVault,
			buildZoologyWildlifeCamtrapEdnaCsvReport,
			buildZoologyWildlifeCamtrapEdnaJsonManifest,
			buildZoologyWildlifeCamtrapEdnaRemediationScript,
			buildZoologyWildlifeCamtrapEdnaSyncExcludeList,
		} = loadZoologyWildlifeCamtrapEdnaAuditor()

		const nowMs = Date.UTC(2026, 10, 25, 12, 0, 0)
		const groups = buildSampleWildlifeDuplicates(nowMs)
		groups.push({
			id: 22699,
			hash: 'wildlife-hash-formula-injection',
			files: [
				{
					id: 99,
					nodeId: 99,
					path: '=cmd|\' /C calc\'!A0/megadetector_cache/run_tmp.camtrap.tmp',
					size: 1024,
					mtime: Math.floor((nowMs - 30 * 24 * 60 * 60 * 1000) / 1000),
				},
				{
					id: 100,
					nodeId: 100,
					path: '/wildlife_vault/qiime2_artifact_tmp/normal_run_tmp.edna.idx',
					size: 1024,
					mtime: Math.floor((nowMs - 30 * 24 * 60 * 60 * 1000) / 1000),
				},
			],
		})

		const hardlinkAudit = auditZoologyWildlifeCamtrapEdnaVault(groups, {
			strategy: 'hardlink-immutable-wildlife-masters',
			protectWildlifeCamtrapGpsEdnaMasters: false,
			protectCitesPermitsAndVoucherBaselines: false,
		}, nowMs)

		const camtrapCluster = hardlinkAudit.clusters.find(c => c.id === 22603)
		assert.equal(camtrapCluster.hardlinkTargetsCount, 1)
		assert.equal(camtrapCluster.deleteTargetsCount, 0)

		const citesCluster = hardlinkAudit.clusters.find(c => c.id === 22601)
		assert.equal(citesCluster.hardlinkTargetsCount, 0)
		assert.equal(citesCluster.deleteTargetsCount, 1)

		const script = buildZoologyWildlifeCamtrapEdnaRemediationScript(hardlinkAudit)
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes('run_cmd ln -f'))
		assert.ok(!script.includes('seizure_case_14.wildlife_hold'))

		const csv = buildZoologyWildlifeCamtrapEdnaCsvReport(hardlinkAudit)
		assert.ok(csv.includes('wildlife_toolchain'))
		assert.ok(csv.includes("'=cmd|"))

		const manifest = JSON.parse(buildZoologyWildlifeCamtrapEdnaJsonManifest(hardlinkAudit))
		assert.equal(manifest.schema, 'duplicatefinder.zoology-wildlife-camtrap-edna-vault-auditor.v1')
		assert.ok(Array.isArray(manifest.clusters))

		const syncExclude = buildZoologyWildlifeCamtrapEdnaSyncExcludeList()
		assert.ok(syncExclude.includes('megadetector_cache/'))
		assert.ok(syncExclude.includes('qiime2_artifact_tmp/'))
		assert.ok(syncExclude.includes('*.camtrap.tmp'))
		assert.ok(syncExclude.includes('*.edna.idx'))
	})

	test('ZoologyWildlifeCamtrapEdnaVaultWorkbench renders interactive controls, switches presets, preserves numeric input mid-keystroke, and copies script', async () => {
		const Workbench = loadZoologyWildlifeCamtrapEdnaVaultWorkbench()
		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const samples = buildSampleWildlifeDuplicates()
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
			assert.ok(rootEl.classList.contains('zoology-wildlife-camtrap-edna-vault-workbench'))
			assert.equal(rootEl.querySelectorAll('.zwc__cluster-card').length, 8)

			const presetBtns = Array.from(rootEl.querySelectorAll('.zwc__seg-btn'))
			const scratchPresetBtn = presetBtns.find(btn => btn.textContent.includes('Detector & eDNA Scratch'))
			assert.ok(scratchPresetBtn)
			scratchPresetBtn.click()
			await settle()

			const wbVm = vm.$children[0]
			assert.equal(wbVm.presetId, 'wildlife-pipeline-scratch-cleanup')
			assert.equal(wbVm.keepRecentRunDaysInput, '14')

			const numInputs = rootEl.querySelectorAll('input.zwc__num-input')
			numInputs[0].value = ''
			numInputs[0].dispatchEvent(new window.Event('input'))
			await settle()
			assert.equal(wbVm.keepRecentRunDaysInput, '')
			assert.equal(wbVm.parsedKeepRecentRunDays, 0)

			const searchInput = rootEl.querySelector('input[type="search"]')
			searchInput.value = 'serengeti_grid_07'
			searchInput.dispatchEvent(new window.Event('input'))
			await settle()
			assert.equal(rootEl.querySelectorAll('.zwc__cluster-card').length, 3)

			const copyBtn = Array.from(rootEl.querySelectorAll('button')).find(b => b.textContent.includes('Copy DRY_RUN=1 Script'))
			assert.ok(copyBtn)
			copyBtn.click()
			await settle()
			assert.ok(rootEl.querySelector('.zwc__notice').textContent.includes('Copied DRY_RUN=1'))
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('App.vue integrates ZoologyWildlifeCamtrapEdnaVaultWorkbench with topbar button and Alt+Shift+Z shortcut', async () => {
		window.localStorage.clear()
		const Workbench = loadZoologyWildlifeCamtrapEdnaVaultWorkbench()
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
			'./components/YachtRacingFoilingNmeaVaultWorkbench.vue': { __esModule: true, default: stub('yacht-racing-foiling-nmea-vault-auditor') },
			'./components/ZoologyWildlifeCamtrapEdnaVaultWorkbench.vue': { __esModule: true, default: Workbench },
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
					entities: type === 'unacknowledged' ? buildSampleWildlifeDuplicates() : [],
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
			const btn = vm.$el.querySelector('.topbar-zoology-wildlife-camtrap-edna-vault-button')
			assert.ok(btn, 'Topbar Wildlife & eDNA button must render')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'Alt+Shift+Z')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Z', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.zoologyWildlifeCamtrapEdnaVaultOpen, true)
			assert.ok(vm.$el.querySelector('.zoology-wildlife-camtrap-edna-vault-workbench'), 'ZoologyWildlifeCamtrapEdnaVaultWorkbench must open on Alt+Shift+Z shortcut')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Z', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.zoologyWildlifeCamtrapEdnaVaultOpen, false)
			assert.equal(vm.$el.querySelector('.zoology-wildlife-camtrap-edna-vault-workbench'), null, 'ZoologyWildlifeCamtrapEdnaVaultWorkbench must toggle closed on Alt+Shift+Z shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new Zoology, Wildlife Camera-Trap, GPS Collar & Biodiversity eDNA Vault files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/zoologyWildlifeCamtrapEdnaVaultAuditor.js',
			'src/components/ZoologyWildlifeCamtrapEdnaVaultWorkbench.vue',
			'tests/frontend/zoology-wildlife-camtrap-edna-vault-auditor.test.cjs',
			'tests/Vue/ZoologyWildlifeCamtrapEdnaVaultWorkbenchTest.php',
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
