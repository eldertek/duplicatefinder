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

function loadAstronomyFitsAuditor() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/astronomyFitsInterferometryVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function loadAstronomyFitsVaultWorkbench(clipboardOverrides = {}) {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const auditor = loadModule('src/tools/astronomyFitsInterferometryVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
	return loadComponent('src/components/AstronomyFitsInterferometryVaultWorkbench.vue', {
		'../tools/clipboardHelper': {
			copyTextSafely: async () => true,
			...clipboardOverrides,
		},
		'../tools/duplicateStats': duplicateStats,
		'../tools/astronomyFitsInterferometryVaultAuditor': auditor,
	})
}

function buildSampleAstronomyFitsDuplicates(referenceNowMs = Date.UTC(2026, 10, 24, 12, 0, 0)) {
	const oldMtime = Math.floor((referenceNowMs - 40 * 24 * 60 * 60 * 1000) / 1000)
	const recentMtime = Math.floor((referenceNowMs - 2 * 24 * 60 * 60 * 1000) / 1000)

	return [
		{
			id: 20901,
			hash: 'astro-hash-master-flat-cal',
			files: [
				{
					id: 1,
					nodeId: 1,
					path: '/astro_vault/00_calibration/pixinsight/MasterFlat_Ha_3nm_bin1.xisf',
					size: 64 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 2,
					nodeId: 2,
					path: '/astro_vault/backup/calibration/MasterFlat_Ha_3nm_bin1.xisf',
					size: 64 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20902,
			hash: 'astro-hash-alma-embargo-hold',
			files: [
				{
					id: 3,
					nodeId: 3,
					path: '/observatory_vault/alma_cycle11/proprietary_hold/uid_A001_X15a_calibrated.uvfits',
					size: 256 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 4,
					nodeId: 4,
					path: '/observatory_vault/mirror/alma_cycle11/uid_A001_X15a_calibrated.uvfits',
					size: 256 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20903,
			hash: 'astro-hash-ngc7000-raw-fits',
			files: [
				{
					id: 5,
					nodeId: 5,
					path: '/astro_vault/00_fits/ngc7000_cygnus/ngc7000_ha_sub042.fits',
					size: 120 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 6,
					nodeId: 6,
					path: '/astro_vault/nas_mirror/ngc7000_cygnus/ngc7000_ha_sub042.fits',
					size: 120 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20904,
			hash: 'astro-hash-casa-ms-radio',
			files: [
				{
					id: 7,
					nodeId: 7,
					path: '/astro_vault/00_interferometry/vla_band_c/3c286_calibrator_vis.ms',
					size: 512 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 8,
					nodeId: 8,
					path: '/astro_vault/work/vla_band_c/3c286_calibrator_vis.ms',
					size: 512 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20905,
			hash: 'astro-hash-redundant-stretch-anchored',
			files: [
				{
					id: 9,
					nodeId: 9,
					path: '/astro_vault/stretched_exports/ngc7000_cygnus/ngc7000_ha_sub042_stretched.png',
					size: 90 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 10,
					nodeId: 10,
					path: '/astro_vault/web_gallery/ngc7000_cygnus/ngc7000_ha_sub042_stretched.png',
					size: 90 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20906,
			hash: 'astro-hash-unanchored-stretch',
			files: [
				{
					id: 11,
					nodeId: 11,
					path: '/astro_vault/astrophotography/m31_unanchored_quicklook.jpg',
					size: 40 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 12,
					nodeId: 12,
					path: '/astro_vault/mirror/astrophotography/m31_unanchored_quicklook.jpg',
					size: 40 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20907,
			hash: 'astro-hash-old-wbpp-scratch',
			files: [
				{
					id: 13,
					nodeId: 13,
					path: '/astro_vault/wbpp_cache/ngc7000_calibrated/pp_ngc7000_ha_sub042.xisf.tmp',
					size: 300 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 14,
					nodeId: 14,
					path: '/astro_vault/siril_tmp/ngc7000_calibrated/pp_ngc7000_ha_sub042.xisf.tmp',
					size: 300 * 1024 * 1024,
					mtime: oldMtime,
				},
			],
		},
		{
			id: 20908,
			hash: 'astro-hash-recent-casa-scratch',
			files: [
				{
					id: 15,
					nodeId: 15,
					path: '/astro_vault/casa_scratch/live_wsclean_run/lofar_imaging_pass2.ms.tmp',
					size: 180 * 1024 * 1024,
					mtime: recentMtime,
				},
				{
					id: 16,
					nodeId: 16,
					path: '/astro_vault/wsclean_tmp/live_wsclean_run/lofar_imaging_pass2.ms.tmp',
					size: 180 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20909,
			hash: 'non-astro-family-photo',
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

describe('Cycle 209: Astronomy, FITS Astrophotography & Radio Interferometry Vault Auditor', () => {
	test('classifies Master calibrations, observatory embargo holds, raw FITS/MS masters, redundant stretched exports, and WBPP/CASA scratch while ignoring non-domain files', () => {
		const auditor = loadAstronomyFitsAuditor()
		const referenceNowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = buildSampleAstronomyFitsDuplicates(referenceNowMs)

		const result = auditor.auditAstronomyFitsInterferometryVault(groups, {}, referenceNowMs)

		assert.equal(result.schema, auditor.ASTRONOMY_FITS_INTERFEROMETRY_VAULT_SCHEMA)
		assert.equal(result.summary.totalDomainGroupsCount, 8)
		assert.equal(result.summary.totalClustersCount, 8)
		assert.equal(result.summary.totalAstroStdClusters, 1)
		assert.equal(result.summary.totalObservatoryEmbargoClusters, 1)
		assert.equal(result.summary.totalRawAstroMasterClusters, 2)
		assert.equal(result.summary.totalRedundantExportClusters, 2)
		assert.equal(result.summary.totalAstroScratchClusters, 2)

		const masterFlatCluster = result.clusters.find(c => c.id === 20901)
		assert.ok(masterFlatCluster)
		assert.equal(masterFlatCluster.family, 'fits-calibration-observatory-standards')
		assert.equal(masterFlatCluster.clusterVerdict, 'astro-std-protected')
		assert.equal(masterFlatCluster.reclaimableBytes, 0)
		assert.equal(masterFlatCluster.shieldedCount, 2)
		assert.equal(masterFlatCluster.astroToolchain, 'PixInsight / WBPP (XISF)')

		const almaCluster = result.clusters.find(c => c.id === 20902)
		assert.ok(almaCluster)
		assert.equal(almaCluster.clusterVerdict, 'observatory-embargo-protected')
		assert.equal(almaCluster.reclaimableBytes, 0)
		assert.equal(almaCluster.hasProtectedObservatoryEmbargo, true)

		const rawFitsCluster = result.clusters.find(c => c.id === 20903)
		assert.ok(rawFitsCluster)
		assert.equal(rawFitsCluster.clusterVerdict, 'raw-subframe-interferometry-protected')
		assert.equal(rawFitsCluster.reclaimableBytes, 0)
		assert.equal(rawFitsCluster.astroToolchain, 'FITS Scientific Imaging')

		const casaCluster = result.clusters.find(c => c.id === 20904)
		assert.ok(casaCluster)
		assert.equal(casaCluster.clusterVerdict, 'raw-subframe-interferometry-protected')
		assert.equal(casaCluster.reclaimableBytes, 0)
		assert.equal(casaCluster.astroToolchain, 'CASA / Radio Interferometry')

		const redundantStretchCluster = result.clusters.find(c => c.id === 20905)
		assert.ok(redundantStretchCluster)
		assert.equal(redundantStretchCluster.family, 'redundant-astro-stretch-exports')
		assert.equal(redundantStretchCluster.hasAstroMasterAnchor, true)
		assert.equal(redundantStretchCluster.clusterVerdict, 'astro-export-redundant')
		assert.equal(redundantStretchCluster.reclaimableBytes, 180 * 1024 * 1024)
		assert.equal(redundantStretchCluster.deleteTargetsCount, 2)

		const unanchoredStretchCluster = result.clusters.find(c => c.id === 20906)
		assert.ok(unanchoredStretchCluster)
		assert.equal(unanchoredStretchCluster.hasAstroMasterAnchor, false)
		assert.equal(unanchoredStretchCluster.reclaimableBytes, 0)
		assert.equal(unanchoredStretchCluster.shieldedCount, 2)
	})

	test('enforces keepRecentSessionDays grace window, hardlink-immutable-fits-and-ms safety, and CWE-1236 / DRY_RUN=1 exports', () => {
		const auditor = loadAstronomyFitsAuditor()
		const referenceNowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = buildSampleAstronomyFitsDuplicates(referenceNowMs)

		const graceAudit = auditor.auditAstronomyFitsInterferometryVault(groups, {
			keepRecentSessionDays: 14,
		}, referenceNowMs)

		const oldScratch = graceAudit.clusters.find(c => c.id === 20907)
		const recentScratch = graceAudit.clusters.find(c => c.id === 20908)
		assert.ok(oldScratch)
		assert.ok(recentScratch)
		assert.equal(oldScratch.reclaimableBytes, 300 * 1024 * 1024)
		assert.equal(recentScratch.reclaimableBytes, 0)
		assert.equal(recentScratch.shieldedCount, 2)

		const hardlinkAudit = auditor.auditAstronomyFitsInterferometryVault(groups, {
			strategy: 'hardlink-immutable-fits-and-ms',
			protectRawSubframeAndInterferometryMasters: false,
		}, referenceNowMs)

		const fitsCluster = hardlinkAudit.clusters.find(c => c.id === 20903)
		assert.ok(fitsCluster)
		assert.equal(fitsCluster.hardlinkTargetsCount, 1)
		assert.equal(fitsCluster.deleteTargetsCount, 0)

		const stretchCluster = hardlinkAudit.clusters.find(c => c.id === 20905)
		assert.ok(stretchCluster)
		assert.equal(stretchCluster.hardlinkTargetsCount, 0)
		assert.equal(stretchCluster.deleteTargetsCount, 2)

		const script = auditor.buildAstronomyFitsRemediationScript(hardlinkAudit)
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes('run_cmd ln -f'))
		assert.ok(!script.includes('MasterFlat_Ha_3nm_bin1.xisf'))
		assert.ok(!script.includes('uid_A001_X15a_calibrated.uvfits'))

		const formulaGroups = [
			{
				id: 20999,
				hash: 'astro-formula-hash',
				files: [
					{
						id: 991,
						nodeId: 991,
						path: '/astro_vault/wbpp_cache/=cmd|calc!A0_sub.xisf.tmp',
						size: 4096,
						mtime: 1700000000,
					},
					{
						id: 992,
						nodeId: 992,
						path: '/astro_vault/siril_tmp/=cmd|calc!A0_sub.xisf.tmp',
						size: 4096,
						mtime: 1700000000,
					},
				],
			},
		]
		const formulaAudit = auditor.auditAstronomyFitsInterferometryVault(formulaGroups, {}, referenceNowMs)
		const csv = auditor.buildAstronomyFitsCsvReport(formulaAudit)
		assert.ok(csv.includes("'=cmd|calc!A0_sub.xisf.tmp"))

		const json = JSON.parse(auditor.buildAstronomyFitsJsonManifest(graceAudit))
		assert.equal(json.schema, auditor.ASTRONOMY_FITS_INTERFEROMETRY_VAULT_SCHEMA)
		assert.equal(json.clusters.length, 8)

		const syncExclude = auditor.buildAstronomyFitsSyncExcludeList()
		assert.ok(syncExclude.includes('wbpp_cache/'))
		assert.ok(syncExclude.includes('*.xisf.tmp'))
		assert.ok(syncExclude.includes('*.ms.tmp'))
	})

	test('AstronomyFitsInterferometryVaultWorkbench renders empty state, presets, numeric filters, overrides, exports, and emits jump/compare', async () => {
		const copiedTexts = []
		const Workbench = loadAstronomyFitsVaultWorkbench({
			copyTextSafely: async (text) => {
				copiedTexts.push(text)
				return true
			},
		})

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const referenceNowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const sampleDuplicates = buildSampleAstronomyFitsDuplicates(referenceNowMs)

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
			assert.ok(vm.$el.querySelector('.afv__empty-banner'))
			vm.$el.querySelector('.afv__primary-btn').click()
			await settle()
			assert.equal(vm.scanStarted, true)

			vm.duplicates = sampleDuplicates.slice(0, 6)
			vm.allDuplicates = sampleDuplicates
			await settle()

			const workbenchVm = vm.$children[0]
			assert.equal(workbenchVm.analysis.summary.totalClustersCount, 6)

			const scopeButtons = Array.from(vm.$el.querySelectorAll('.afv__seg-btn'))
			const allScopeBtn = scopeButtons.find(b => b.textContent.includes('All loaded'))
			assert.ok(allScopeBtn)
			allScopeBtn.click()
			await settle()
			assert.equal(workbenchVm.analysis.summary.totalClustersCount, 8)

			const presetButtons = Array.from(vm.$el.querySelectorAll('.afv__seg-btn'))
			const scratchPresetBtn = presetButtons.find(b => b.textContent.includes('WBPP, Siril & CASA Scratch'))
			assert.ok(scratchPresetBtn)
			scratchPresetBtn.click()
			await settle()
			assert.equal(workbenchVm.keepRecentSessionDaysInput, '14')

			workbenchVm.minSizeKbInput = 'abc'
			await settle()
			assert.equal(workbenchVm.parsedMinSizeKb, 0)
			assert.equal(workbenchVm.minSizeKbInput, 'abc')
			workbenchVm.minSizeKbInput = '0'
			await settle()

			const cards = vm.$el.querySelectorAll('.afv__cluster-card')
			assert.ok(cards.length > 0)
			cards[0].click()
			await settle()

			const triageBtn = Array.from(vm.$el.querySelectorAll('.afv__inspector-actions button')).find(b => b.textContent.includes('Open in Triage'))
			const compareBtn = Array.from(vm.$el.querySelectorAll('.afv__inspector-actions button')).find(b => b.textContent.includes('Side-by-Side'))
			triageBtn.click()
			compareBtn.click()
			await settle()
			assert.ok(vm.selected)
			assert.ok(vm.compared)

			const copyScriptBtn = Array.from(vm.$el.querySelectorAll('.afv__toolbar-actions button')).find(b => b.textContent.includes('Copy DRY_RUN=1 Script'))
			copyScriptBtn.click()
			await settle()
			assert.ok(copiedTexts.some(t => t.includes('DRY_RUN=')))

			const hideBtn = vm.$el.querySelector('.afv__tool-btn.is-close')
			hideBtn.click()
			await settle()
			assert.equal(vm.closed, true)
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('App.vue renders Astro & FITS Vault topbar button and toggles AstronomyFitsInterferometryVaultWorkbench via Alt+Shift+I', async () => {
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
		const AstronomyFitsInterferometryVaultWorkbench = loadAstronomyFitsVaultWorkbench()

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
			'./components/AstronomyFitsInterferometryVaultWorkbench.vue': { __esModule: true, default: AstronomyFitsInterferometryVaultWorkbench },
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
					entities: type === 'unacknowledged' ? buildSampleAstronomyFitsDuplicates() : [],
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
			const btn = vm.$el.querySelector('.topbar-astronomy-fits-interferometry-vault-button')
			assert.ok(btn, 'Topbar Astro & FITS Vault button must render')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'Alt+Shift+I')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'I', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.astronomyFitsInterferometryVaultOpen, true)
			assert.ok(vm.$el.querySelector('.astronomy-fits-interferometry-vault-workbench'), 'AstronomyFitsInterferometryVaultWorkbench must open on Alt+Shift+I shortcut')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'I', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.astronomyFitsInterferometryVaultOpen, false)
			assert.equal(vm.$el.querySelector('.astronomy-fits-interferometry-vault-workbench'), null, 'AstronomyFitsInterferometryVaultWorkbench must toggle closed on Alt+Shift+I shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new Astronomy & FITS Vault files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/astronomyFitsInterferometryVaultAuditor.js',
			'src/components/AstronomyFitsInterferometryVaultWorkbench.vue',
			'tests/frontend/astronomy-fits-interferometry-vault-auditor.test.cjs',
			'tests/Vue/AstronomyFitsInterferometryVaultWorkbenchTest.php',
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
