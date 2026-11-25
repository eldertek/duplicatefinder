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

function loadMeteorologyClimateAuditor() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/meteorologyClimateVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function loadMeteorologyClimateVaultWorkbench(clipboardOverrides = {}) {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const auditor = loadModule('src/tools/meteorologyClimateVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
	return loadComponent('src/components/MeteorologyClimateVaultWorkbench.vue', {
		'../tools/clipboardHelper': {
			copyTextSafely: async () => true,
			...clipboardOverrides,
		},
		'../tools/duplicateStats': duplicateStats,
		'../tools/meteorologyClimateVaultAuditor': auditor,
	})
}

function buildSampleMeteorologyClimateDuplicates(referenceNowMs = Date.UTC(2026, 10, 25, 9, 0, 0)) {
	const oldMtime = Math.floor((referenceNowMs - 40 * 24 * 60 * 60 * 1000) / 1000)
	const recentMtime = Math.floor((referenceNowMs - 2 * 24 * 60 * 60 * 1000) / 1000)

	return [
		{
			id: 21001,
			hash: 'meteo-hash-wrf-namelist',
			files: [
				{
					id: 1,
					nodeId: 1,
					path: '/meteo_vault/00_standards/wrf_namelists/namelist.wps',
					size: 16 * 1024,
					mtime: oldMtime,
				},
				{
					id: 2,
					nodeId: 2,
					path: '/meteo_vault/backup/namelists/namelist.wps',
					size: 16 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21002,
			hash: 'meteo-hash-era5-archive-hold',
			files: [
				{
					id: 3,
					nodeId: 3,
					path: '/climate_vault/ecmwf_era5/reanalysis_hold/era5_t2m_europe_2025.nc4',
					size: 512 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 4,
					nodeId: 4,
					path: '/climate_vault/mirror/ecmwf_era5/era5_t2m_europe_2025.nc4',
					size: 512 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21003,
			hash: 'meteo-hash-wrfout-netcdf',
			files: [
				{
					id: 5,
					nodeId: 5,
					path: '/meteo_vault/00_netcdf/wrf_cyclone_run/wrfout_d01_2026-11-20_00.nc',
					size: 240 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 6,
					nodeId: 6,
					path: '/meteo_vault/nas_mirror/wrf_cyclone_run/wrfout_d01_2026-11-20_00.nc',
					size: 240 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21004,
			hash: 'meteo-hash-nexrad-ar2v-radar',
			files: [
				{
					id: 7,
					nodeId: 7,
					path: '/radar_vault/00_radar/kddc_supercell/KDDC20261120_000512_V06.ar2v',
					size: 96 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 8,
					nodeId: 8,
					path: '/radar_vault/work/kddc_supercell/KDDC20261120_000512_V06.ar2v',
					size: 96 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21005,
			hash: 'meteo-hash-redundant-skewt-anchored',
			files: [
				{
					id: 9,
					nodeId: 9,
					path: '/meteo_vault/quicklooks/wrf_cyclone_run/wrfout_d01_2026-11-20_00_skewt.png',
					size: 75 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 10,
					nodeId: 10,
					path: '/meteo_vault/web_portal/wrf_cyclone_run/wrfout_d01_2026-11-20_00_skewt.png',
					size: 75 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21006,
			hash: 'meteo-hash-unanchored-radar-loop',
			files: [
				{
					id: 11,
					nodeId: 11,
					path: '/radar_vault/radar_loops/unanchored_convection_loop.gif',
					size: 36 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 12,
					nodeId: 12,
					path: '/radar_vault/mirror/radar_loops/unanchored_convection_loop.gif',
					size: 36 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21007,
			hash: 'meteo-hash-old-cdo-scratch',
			files: [
				{
					id: 13,
					nodeId: 13,
					path: '/climate_vault/cdo_tmp/cmip6_regrid/tmp_cdo_tasmax_ssp585.nc.tmp',
					size: 320 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 14,
					nodeId: 14,
					path: '/climate_vault/nco_tmp/cmip6_regrid/tmp_cdo_tasmax_ssp585.nc.tmp',
					size: 320 * 1024 * 1024,
					mtime: oldMtime,
				},
			],
		},
		{
			id: 21008,
			hash: 'meteo-hash-recent-wrf-scratch',
			files: [
				{
					id: 15,
					nodeId: 15,
					path: '/meteo_vault/wrf_scratch/live_gfs_cycle/gfs_0p25_f024.grib2.tmp',
					size: 160 * 1024 * 1024,
					mtime: recentMtime,
				},
				{
					id: 16,
					nodeId: 16,
					path: '/meteo_vault/eccodes_cache/live_gfs_cycle/gfs_0p25_f024.grib2.tmp',
					size: 160 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21009,
			hash: 'non-meteo-holiday-photo',
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

describe('Cycle 210: Meteorology, Weather Radar, NetCDF & Climate Model Vault Auditor', () => {
	test('classifies CF/WMO standards, ERA5/CMIP6 archive holds, raw NetCDF/GRIB2/Radar masters, redundant quicklooks, and WRF/CDO scratch while ignoring non-domain files', () => {
		const auditor = loadMeteorologyClimateAuditor()
		const referenceNowMs = Date.UTC(2026, 10, 25, 9, 0, 0)
		const groups = buildSampleMeteorologyClimateDuplicates(referenceNowMs)

		const result = auditor.auditMeteorologyClimateVault(groups, {}, referenceNowMs)

		assert.equal(result.schema, auditor.METEOROLOGY_CLIMATE_VAULT_SCHEMA)
		assert.equal(result.summary.totalDomainGroupsCount, 8)
		assert.equal(result.summary.totalClustersCount, 8)
		assert.equal(result.summary.totalCfWmoStdClusters, 1)
		assert.equal(result.summary.totalWmoArchiveHoldClusters, 1)
		assert.equal(result.summary.totalRawMeteoMasterClusters, 2)
		assert.equal(result.summary.totalRedundantExportClusters, 2)
		assert.equal(result.summary.totalMeteoScratchClusters, 2)

		const namelistCluster = result.clusters.find(c => c.id === 21001)
		assert.ok(namelistCluster)
		assert.equal(namelistCluster.family, 'cf-wmo-climate-standards')
		assert.equal(namelistCluster.clusterVerdict, 'meteo-std-protected')
		assert.equal(namelistCluster.reclaimableBytes, 0)
		assert.equal(namelistCluster.shieldedCount, 2)
		assert.equal(namelistCluster.meteoToolchain, 'WRF / WPS NWP')

		const era5Cluster = result.clusters.find(c => c.id === 21002)
		assert.ok(era5Cluster)
		assert.equal(era5Cluster.clusterVerdict, 'wmo-archive-embargo-protected')
		assert.equal(era5Cluster.reclaimableBytes, 0)
		assert.equal(era5Cluster.hasProtectedWmoArchiveHold, true)

		const wrfCluster = result.clusters.find(c => c.id === 21003)
		assert.ok(wrfCluster)
		assert.equal(wrfCluster.clusterVerdict, 'raw-radar-netcdf-protected')
		assert.equal(wrfCluster.reclaimableBytes, 0)
		assert.equal(wrfCluster.meteoToolchain, 'WRF / WPS NWP')

		const nexradCluster = result.clusters.find(c => c.id === 21004)
		assert.ok(nexradCluster)
		assert.equal(nexradCluster.clusterVerdict, 'raw-radar-netcdf-protected')
		assert.equal(nexradCluster.reclaimableBytes, 0)
		assert.equal(nexradCluster.meteoToolchain, 'NEXRAD / Py-ART / Radx Radar')

		const redundantQuicklookCluster = result.clusters.find(c => c.id === 21005)
		assert.ok(redundantQuicklookCluster)
		assert.equal(redundantQuicklookCluster.family, 'redundant-meteo-render-exports')
		assert.equal(redundantQuicklookCluster.hasMeteoMasterAnchor, true)
		assert.equal(redundantQuicklookCluster.clusterVerdict, 'meteo-export-redundant')
		assert.equal(redundantQuicklookCluster.reclaimableBytes, 150 * 1024 * 1024)
		assert.equal(redundantQuicklookCluster.deleteTargetsCount, 2)

		const unanchoredLoopCluster = result.clusters.find(c => c.id === 21006)
		assert.ok(unanchoredLoopCluster)
		assert.equal(unanchoredLoopCluster.hasMeteoMasterAnchor, false)
		assert.equal(unanchoredLoopCluster.reclaimableBytes, 0)
		assert.equal(unanchoredLoopCluster.shieldedCount, 2)
	})

	test('enforces keepRecentRunDays grace window, hardlink-immutable-nc-and-grib safety, and CWE-1236 / DRY_RUN=1 exports', () => {
		const auditor = loadMeteorologyClimateAuditor()
		const referenceNowMs = Date.UTC(2026, 10, 25, 9, 0, 0)
		const groups = buildSampleMeteorologyClimateDuplicates(referenceNowMs)

		const graceAudit = auditor.auditMeteorologyClimateVault(groups, {
			keepRecentRunDays: 14,
		}, referenceNowMs)

		const oldScratch = graceAudit.clusters.find(c => c.id === 21007)
		const recentScratch = graceAudit.clusters.find(c => c.id === 21008)
		assert.ok(oldScratch)
		assert.ok(recentScratch)
		assert.equal(oldScratch.reclaimableBytes, 320 * 1024 * 1024)
		assert.equal(recentScratch.reclaimableBytes, 0)
		assert.equal(recentScratch.shieldedCount, 2)

		const hardlinkAudit = auditor.auditMeteorologyClimateVault(groups, {
			strategy: 'hardlink-immutable-nc-and-grib',
			protectRawRadarNetcdfGribMasters: false,
		}, referenceNowMs)

		const wrfCluster = hardlinkAudit.clusters.find(c => c.id === 21003)
		assert.ok(wrfCluster)
		assert.equal(wrfCluster.hardlinkTargetsCount, 1)
		assert.equal(wrfCluster.deleteTargetsCount, 0)

		const quicklookCluster = hardlinkAudit.clusters.find(c => c.id === 21005)
		assert.ok(quicklookCluster)
		assert.equal(quicklookCluster.hardlinkTargetsCount, 0)
		assert.equal(quicklookCluster.deleteTargetsCount, 2)

		const script = auditor.buildMeteorologyClimateRemediationScript(hardlinkAudit)
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes('run_cmd ln -f'))
		assert.ok(!script.includes('namelist.wps'))
		assert.ok(!script.includes('era5_t2m_europe_2025.nc4'))

		const formulaGroups = [
			{
				id: 21099,
				hash: 'meteo-formula-hash',
				files: [
					{
						id: 991,
						nodeId: 991,
						path: '/meteo_vault/cdo_tmp/=cmd|calc!A0_run.nc.tmp',
						size: 4096,
						mtime: 1700000000,
					},
					{
						id: 992,
						nodeId: 992,
						path: '/meteo_vault/nco_tmp/=cmd|calc!A0_run.nc.tmp',
						size: 4096,
						mtime: 1700000000,
					},
				],
			},
		]
		const formulaAudit = auditor.auditMeteorologyClimateVault(formulaGroups, {}, referenceNowMs)
		const csv = auditor.buildMeteorologyClimateCsvReport(formulaAudit)
		assert.ok(csv.includes("'=cmd|calc!A0_run.nc.tmp"))

		const json = JSON.parse(auditor.buildMeteorologyClimateJsonManifest(graceAudit))
		assert.equal(json.schema, auditor.METEOROLOGY_CLIMATE_VAULT_SCHEMA)
		assert.equal(json.clusters.length, 8)

		const syncExclude = auditor.buildMeteorologyClimateSyncExcludeList()
		assert.ok(syncExclude.includes('wrf_scratch/'))
		assert.ok(syncExclude.includes('*.nc.tmp'))
		assert.ok(syncExclude.includes('*.grib2.tmp'))
	})

	test('MeteorologyClimateVaultWorkbench renders empty state, presets, numeric filters, overrides, exports, and emits jump/compare', async () => {
		const copiedTexts = []
		const Workbench = loadMeteorologyClimateVaultWorkbench({
			copyTextSafely: async (text) => {
				copiedTexts.push(text)
				return true
			},
		})

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const referenceNowMs = Date.UTC(2026, 10, 25, 9, 0, 0)
		const sampleDuplicates = buildSampleMeteorologyClimateDuplicates(referenceNowMs)

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
			assert.ok(vm.$el.querySelector('.mcv__empty-banner'))
			vm.$el.querySelector('.mcv__primary-btn').click()
			await settle()
			assert.equal(vm.scanStarted, true)

			vm.duplicates = sampleDuplicates.slice(0, 6)
			vm.allDuplicates = sampleDuplicates
			await settle()

			const workbenchVm = vm.$children[0]
			assert.equal(workbenchVm.analysis.summary.totalClustersCount, 6)

			const scopeButtons = Array.from(vm.$el.querySelectorAll('.mcv__seg-btn'))
			const allScopeBtn = scopeButtons.find(b => b.textContent.includes('All loaded'))
			assert.ok(allScopeBtn)
			allScopeBtn.click()
			await settle()
			assert.equal(workbenchVm.analysis.summary.totalClustersCount, 8)

			const presetButtons = Array.from(vm.$el.querySelectorAll('.mcv__seg-btn'))
			const scratchPresetBtn = presetButtons.find(b => b.textContent.includes('WRF, CDO & Radar Scratch'))
			assert.ok(scratchPresetBtn)
			scratchPresetBtn.click()
			await settle()
			assert.equal(workbenchVm.keepRecentRunDaysInput, '14')

			workbenchVm.minSizeKbInput = 'abc'
			await settle()
			assert.equal(workbenchVm.parsedMinSizeKb, 0)
			assert.equal(workbenchVm.minSizeKbInput, 'abc')
			workbenchVm.minSizeKbInput = '0'
			await settle()

			const cards = vm.$el.querySelectorAll('.mcv__cluster-card')
			assert.ok(cards.length > 0)
			cards[0].click()
			await settle()

			const triageBtn = Array.from(vm.$el.querySelectorAll('.mcv__inspector-actions button')).find(b => b.textContent.includes('Open in Triage'))
			const compareBtn = Array.from(vm.$el.querySelectorAll('.mcv__inspector-actions button')).find(b => b.textContent.includes('Side-by-Side'))
			triageBtn.click()
			compareBtn.click()
			await settle()
			assert.ok(vm.selected)
			assert.ok(vm.compared)

			const copyScriptBtn = Array.from(vm.$el.querySelectorAll('.mcv__toolbar-actions button')).find(b => b.textContent.includes('Copy DRY_RUN=1 Script'))
			copyScriptBtn.click()
			await settle()
			assert.ok(copiedTexts.some(t => t.includes('DRY_RUN=')))

			const hideBtn = vm.$el.querySelector('.mcv__tool-btn.is-close')
			hideBtn.click()
			await settle()
			assert.equal(vm.closed, true)
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('App.vue renders Meteo & Climate Vault topbar button and toggles MeteorologyClimateVaultWorkbench via Alt+Shift+J', async () => {
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
		const MeteorologyClimateVaultWorkbench = loadMeteorologyClimateVaultWorkbench()

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
			'./components/MeteorologyClimateVaultWorkbench.vue': { __esModule: true, default: MeteorologyClimateVaultWorkbench },
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
					entities: type === 'unacknowledged' ? buildSampleMeteorologyClimateDuplicates() : [],
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
			const btn = vm.$el.querySelector('.topbar-meteorology-climate-vault-button')
			assert.ok(btn, 'Topbar Meteo & Climate Vault button must render')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'Alt+Shift+J')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'J', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.meteorologyClimateVaultOpen, true)
			assert.ok(vm.$el.querySelector('.meteorology-climate-vault-workbench'), 'MeteorologyClimateVaultWorkbench must open on Alt+Shift+J shortcut')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'J', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.meteorologyClimateVaultOpen, false)
			assert.equal(vm.$el.querySelector('.meteorology-climate-vault-workbench'), null, 'MeteorologyClimateVaultWorkbench must toggle closed on Alt+Shift+J shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new Meteorology & Climate Vault files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/meteorologyClimateVaultAuditor.js',
			'src/components/MeteorologyClimateVaultWorkbench.vue',
			'tests/frontend/meteorology-climate-vault-auditor.test.cjs',
			'tests/Vue/MeteorologyClimateVaultWorkbenchTest.php',
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
