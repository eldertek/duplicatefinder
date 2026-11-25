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

function loadMaterialsMicroscopyAuditor() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/materialsMicroscopyVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function loadMaterialsMicroscopyVaultWorkbench(clipboardOverrides = {}) {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const auditor = loadModule('src/tools/materialsMicroscopyVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
	return loadComponent('src/components/MaterialsMicroscopyVaultWorkbench.vue', {
		'../tools/clipboardHelper': {
			copyTextSafely: async () => true,
			...clipboardOverrides,
		},
		'../tools/duplicateStats': duplicateStats,
		'../tools/materialsMicroscopyVaultAuditor': auditor,
	})
}

function buildSampleMaterialsMicroscopyDuplicates(referenceNowMs = Date.UTC(2026, 10, 25, 9, 0, 0)) {
	const oldMtime = Math.floor((referenceNowMs - 40 * 24 * 60 * 60 * 1000) / 1000)
	const recentMtime = Math.floor((referenceNowMs - 2 * 24 * 60 * 60 * 1000) / 1000)

	return [
		{
			id: 21101,
			hash: 'mat-hash-cif-vasp-input',
			files: [
				{
					id: 1,
					nodeId: 1,
					path: '/materials_vault/00_cif_standards/perovskite_batio3/BaTiO3_P4mm.cif',
					size: 24 * 1024,
					mtime: oldMtime,
				},
				{
					id: 2,
					nodeId: 2,
					path: '/materials_vault/backup/perovskite_batio3/BaTiO3_P4mm.cif',
					size: 24 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21102,
			hash: 'mat-hash-empiar-facility-hold',
			files: [
				{
					id: 3,
					nodeId: 3,
					path: '/em_vault/empiar_hold/cryoem_facility_hold/apoferritin_emd_2025.mrc',
					size: 512 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 4,
					nodeId: 4,
					path: '/em_vault/mirror/empiar_hold/apoferritin_emd_2025.mrc',
					size: 512 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21103,
			hash: 'mat-hash-raw-dm4-tem',
			files: [
				{
					id: 5,
					nodeId: 5,
					path: '/em_vault/00_microscopy/titan_krios_alloy/ni_superalloy_haadf_001.dm4',
					size: 180 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 6,
					nodeId: 6,
					path: '/em_vault/nas_mirror/titan_krios_alloy/ni_superalloy_haadf_001.dm4',
					size: 180 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21104,
			hash: 'mat-hash-ebsd-oh5-xrd',
			files: [
				{
					id: 7,
					nodeId: 7,
					path: '/materials_vault/00_ebsd/ti6al4v_scan/ti64_grain_map_01.oh5',
					size: 96 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 8,
					nodeId: 8,
					path: '/materials_vault/work/ti6al4v_scan/ti64_grain_map_01.oh5',
					size: 96 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21105,
			hash: 'mat-hash-redundant-scalebar-anchored',
			files: [
				{
					id: 9,
					nodeId: 9,
					path: '/em_vault/figures_export/titan_krios_alloy/ni_superalloy_haadf_001_scalebar.png',
					size: 48 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 10,
					nodeId: 10,
					path: '/em_vault/manuscript_draft/titan_krios_alloy/ni_superalloy_haadf_001_scalebar.png',
					size: 48 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21106,
			hash: 'mat-hash-unanchored-ipf-figure',
			files: [
				{
					id: 11,
					nodeId: 11,
					path: '/materials_vault/figures_export/unanchored_precipitate_ipf_map.png',
					size: 32 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 12,
					nodeId: 12,
					path: '/materials_vault/slides/unanchored_precipitate_ipf_map.png',
					size: 32 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21107,
			hash: 'mat-hash-relion-scratch-old',
			files: [
				{
					id: 13,
					nodeId: 13,
					path: '/em_vault/relion_scratch/job042/particles_stack_01.mrc.tmp',
					size: 160 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 14,
					nodeId: 14,
					path: '/em_vault/cryosparc_cache/job042/particles_stack_01.mrc.tmp',
					size: 160 * 1024 * 1024,
					mtime: oldMtime,
				},
			],
		},
		{
			id: 21108,
			hash: 'mat-hash-py4dstem-scratch-recent',
			files: [
				{
					id: 15,
					nodeId: 15,
					path: '/em_vault/py4dstem_tmp/run09/tmp_py4dstem_bragg_disk.h5.tmp',
					size: 80 * 1024 * 1024,
					mtime: recentMtime,
				},
				{
					id: 16,
					nodeId: 16,
					path: '/em_vault/dm_scratch/run09/tmp_py4dstem_bragg_disk.h5.tmp',
					size: 80 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21109,
			hash: 'mat-hash-vasp-poscar-and-calibration',
			files: [
				{
					id: 17,
					nodeId: 17,
					path: '/materials_vault/vasp_inputs/li_cathode/POSCAR',
					size: 12 * 1024,
					mtime: oldMtime,
				},
				{
					id: 18,
					nodeId: 18,
					path: '/materials_vault/00_calibrations/tem_calibration/k3_gain_ref_2026.dm4',
					size: 64 * 1024 * 1024,
					mtime: oldMtime,
				},
			],
		},
		{
			id: 21110,
			hash: 'non-materials-vacation-photo',
			files: [
				{
					id: 19,
					nodeId: 19,
					path: '/Users/alex/Photos/vacation_paris.jpg',
					size: 4 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 20,
					nodeId: 20,
					path: '/Users/alex/Backup/vacation_paris.jpg',
					size: 4 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
	]
}

describe('Cycle 211: Materials Science, Electron Microscopy & Diffraction Vault Auditor', () => {
	test('classifies CIF/VASP standards, ICSD/EMPIAR facility holds, raw EM/EBSD/XRD masters, redundant figures, and RELION/py4DSTEM scratch while ignoring non-domain files', () => {
		const {
			MATERIALS_MICROSCOPY_VAULT_SCHEMA,
			auditMaterialsMicroscopyVault,
		} = loadMaterialsMicroscopyAuditor()

		const nowMs = Date.UTC(2026, 10, 25, 9, 0, 0)
		const groups = buildSampleMaterialsMicroscopyDuplicates(nowMs)
		const report = auditMaterialsMicroscopyVault(groups, {}, nowMs)

		assert.equal(report.schema, MATERIALS_MICROSCOPY_VAULT_SCHEMA)
		assert.equal(report.summary.totalDomainGroupsCount, 9)
		assert.equal(report.clusters.some(c => c.id === 21110), false)

		const cifCluster = report.clusters.find(c => c.id === 21101)
		assert.equal(cifCluster.family, 'cif-calibrations-facility-holds')
		assert.equal(cifCluster.clusterVerdict, 'cif-cal-std-protected')
		assert.equal(cifCluster.reclaimableBytes, 0)
		assert.equal(cifCluster.members.every(m => m.shielded && m.action === 'keep'), true)

		const holdCluster = report.clusters.find(c => c.id === 21102)
		assert.equal(holdCluster.family, 'cif-calibrations-facility-holds')
		assert.equal(holdCluster.clusterVerdict, 'facility-hold-protected')
		assert.equal(holdCluster.reclaimableBytes, 0)
		assert.equal(holdCluster.hasProtectedFacilityHold, true)

		const dm4Cluster = report.clusters.find(c => c.id === 21103)
		assert.equal(dm4Cluster.family, 'raw-microscopy-diffraction-masters')
		assert.equal(dm4Cluster.clusterVerdict, 'raw-em-diffraction-protected')
		assert.equal(dm4Cluster.materialsToolchain, 'Gatan DigitalMicrograph')
		assert.equal(dm4Cluster.reclaimableBytes, 0)

		const ebsdCluster = report.clusters.find(c => c.id === 21104)
		assert.equal(ebsdCluster.family, 'raw-microscopy-diffraction-masters')
		assert.equal(ebsdCluster.materialsToolchain, 'EBSD OIM / Oxford Aztec')
		assert.equal(ebsdCluster.reclaimableBytes, 0)

		const anchoredFigure = report.clusters.find(c => c.id === 21105)
		assert.equal(anchoredFigure.family, 'redundant-em-figure-exports')
		assert.equal(anchoredFigure.hasMaterialsMasterAnchor, true)
		assert.equal(anchoredFigure.clusterVerdict, 'em-export-redundant')
		assert.equal(anchoredFigure.reclaimableBytes, 96 * 1024 * 1024)
		assert.equal(anchoredFigure.members.every(m => m.action === 'delete'), true)

		const unanchoredFigure = report.clusters.find(c => c.id === 21106)
		assert.equal(unanchoredFigure.family, 'redundant-em-figure-exports')
		assert.equal(unanchoredFigure.hasMaterialsMasterAnchor, false)
		assert.equal(unanchoredFigure.reclaimableBytes, 0)
		assert.equal(unanchoredFigure.members.every(m => m.shielded), true)

		const relionScratch = report.clusters.find(c => c.id === 21107)
		assert.equal(relionScratch.family, 'em-reconstruction-scratch')
		assert.equal(relionScratch.clusterVerdict, 'em-scratch-intermediate')
		assert.equal(relionScratch.reclaimableBytes, 160 * 1024 * 1024)

		const vaspCal = report.clusters.find(c => c.id === 21109)
		assert.equal(vaspCal.family, 'cif-calibrations-facility-holds')
		assert.equal(vaspCal.reclaimableBytes, 0)
	})

	test('enforces keepRecentJobDays grace window, hardlink-immutable-raw-em-and-xrd safety, and CWE-1236 / DRY_RUN=1 exports', () => {
		const {
			auditMaterialsMicroscopyVault,
			buildMaterialsMicroscopyCsvReport,
			buildMaterialsMicroscopyJsonManifest,
			buildMaterialsMicroscopyRemediationScript,
			buildMaterialsMicroscopySyncExcludeList,
		} = loadMaterialsMicroscopyAuditor()

		const nowMs = Date.UTC(2026, 10, 25, 9, 0, 0)
		const groups = buildSampleMaterialsMicroscopyDuplicates(nowMs)

		// With 14-day grace window, recent py4DSTEM scratch (2 days old) is shielded while 40-day RELION scratch is reclaimable
		const graceReport = auditMaterialsMicroscopyVault(groups, { keepRecentJobDays: 14 }, nowMs)
		const recentScratch = graceReport.clusters.find(c => c.id === 21108)
		const oldScratch = graceReport.clusters.find(c => c.id === 21107)
		assert.equal(recentScratch.reclaimableBytes, 0)
		assert.equal(oldScratch.reclaimableBytes, 160 * 1024 * 1024)

		// With hardlink strategy and raw-master shield off, immutable .dm4/.oh5 masters hardlink, while mutable .cif/.tmp never hardlink
		const hardlinkReport = auditMaterialsMicroscopyVault(groups, {
			strategy: 'hardlink-immutable-raw-em-and-xrd',
			protectRawEmDiffractionMasters: false,
			protectCifAndCalibrationStandards: false,
			protectFacilityArchiveHolds: true,
		}, nowMs)

		const dm4Cluster = hardlinkReport.clusters.find(c => c.id === 21103)
		assert.equal(dm4Cluster.members.some(m => m.action === 'hardlink'), true)

		const cifCluster = hardlinkReport.clusters.find(c => c.id === 21101)
		assert.equal(cifCluster.members.some(m => m.action === 'hardlink'), false)

		const script = buildMaterialsMicroscopyRemediationScript(hardlinkReport)
		assert.equal(script.includes('DRY_RUN="${DRY_RUN:-1}"'), true)
		assert.equal(script.includes('run_cmd ln -f'), true)
		assert.equal(script.includes('BaTiO3_P4mm.cif'), true)
		assert.equal(script.includes('apoferritin_emd_2025.mrc'), false)

		// Quarantine strategy moves redundant figures and scratch to QUARANTINE_DIR
		const quarantineReport = auditMaterialsMicroscopyVault(groups, {
			strategy: 'quarantine-exports-and-em-scratch',
		}, nowMs)
		const quarantineScript = buildMaterialsMicroscopyRemediationScript(quarantineReport)
		assert.equal(quarantineScript.includes('run_cmd mv -n'), true)

		// CWE-1236 formula injection protection in CSV
		const injectionGroup = [
			{
				id: 99999,
				hash: 'mat-formula-test',
				files: [
					{
						id: 901,
						nodeId: 901,
						path: '/em_vault/relion_scratch/=cmd("calc")_bad.mrc.tmp',
						size: 4096,
					},
					{
						id: 902,
						nodeId: 902,
						path: '/em_vault/relion_scratch/normal_job.mrc.tmp',
						size: 4096,
					},
				],
			},
		]
		const injReport = auditMaterialsMicroscopyVault(injectionGroup, {}, nowMs)
		const csv = buildMaterialsMicroscopyCsvReport(injReport)
		assert.equal(csv.includes('cluster_id,cluster_name,materials_toolchain'), true)
		assert.equal(csv.includes('\'=cmd'), true)

		const jsonManifest = JSON.parse(buildMaterialsMicroscopyJsonManifest(graceReport))
		assert.equal(jsonManifest.schema, 'duplicatefinder.materials-microscopy-vault-auditor.v1')
		assert.equal(Array.isArray(jsonManifest.clusters), true)

		const excludeList = buildMaterialsMicroscopySyncExcludeList()
		assert.equal(excludeList.includes('relion_scratch/'), true)
		assert.equal(excludeList.includes('py4dstem_tmp/'), true)
		assert.equal(excludeList.includes('*.dm4.tmp'), true)
		assert.equal(excludeList.includes('*.mrc.tmp'), true)
	})

	test('MaterialsMicroscopyVaultWorkbench renders empty state, presets, numeric filters, overrides, exports, and emits jump/compare', async () => {
		const copiedTexts = []
		const Workbench = loadMaterialsMicroscopyVaultWorkbench({
			copyTextSafely: async (text) => {
				copiedTexts.push(text)
				return true
			},
		})

		const mountEmpty = document.createElement('div')
		document.body.appendChild(mountEmpty)
		const emptyVm = new Vue({
			render: h => h(Workbench, {
				props: { duplicates: [], allDuplicates: [] },
			}),
		}).$mount(mountEmpty)

		try {
			await settle()
			assert.ok(emptyVm.$el.querySelector('.mmv__empty-banner'), 'Empty banner renders when scan pool is empty')
		} finally {
			emptyVm.$destroy()
			mountEmpty.remove()
		}

		const groups = buildSampleMaterialsMicroscopyDuplicates()
		const emitted = { select: [], compare: [] }
		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: groups,
					allDuplicates: groups,
					currentDuplicateId: 21105,
				},
				on: {
					'select-duplicate': d => emitted.select.push(d.id),
					'compare-duplicate': d => emitted.compare.push(d.id),
				},
			}),
		}).$mount(mountNode)

		try {
			await settle()
			const wb = vm.$children[0]
			assert.equal(wb.selectedCluster.id, 21105)
			assert.ok(wb.$el.querySelector('.mmv__workspace'))

			// Controlled numeric inputs never clamp mid-keystroke on empty/partial typing
			wb.keepRecentJobDaysInput = ''
			wb.minSizeKbInput = ''
			await settle()
			assert.equal(wb.keepRecentJobDaysInput, '')
			assert.equal(wb.parsedKeepRecentJobDays, 0)
			assert.equal(wb.parsedMinSizeKb, 0)

			// Apply scratch cleanup preset
			wb.applyPreset('em-reconstruction-scratch-cleanup')
			await settle()
			assert.equal(wb.keepRecentJobDaysInput, '14')

			// Per-copy override on reclaimable target
			wb.applyPreset('all-materials-microscopy-audit')
			await settle()
			const firstOverrideSelect = wb.$el.querySelector('.mmv__override-select')
			assert.ok(firstOverrideSelect)
			wb.setMemberOverride(wb.selectedCluster.members[0].key, 'keep')
			await settle()
			assert.equal(wb.selectedCluster.members[0].shielded, true)

			// Jump & compare events
			wb.jumpToDuplicate(wb.selectedCluster)
			wb.compareDuplicate(wb.selectedCluster)
			assert.deepEqual(emitted.select, [21105])
			assert.deepEqual(emitted.compare, [21105])

			// Clipboard actions
			await wb.copyRemediationScript()
			await wb.copySyncExcludeSnippet()
			assert.equal(copiedTexts.length, 2)
			assert.ok(copiedTexts[0].includes('DRY_RUN='))
			assert.ok(copiedTexts[1].includes('relion_scratch/'))
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('App.vue renders Materials & EM Vault topbar button and toggles MaterialsMicroscopyVaultWorkbench via Alt+Shift+K', async () => {
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
		const MaterialsMicroscopyVaultWorkbench = loadMaterialsMicroscopyVaultWorkbench()

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
			'./components/MaterialsMicroscopyVaultWorkbench.vue': { __esModule: true, default: MaterialsMicroscopyVaultWorkbench },
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
					entities: type === 'unacknowledged' ? buildSampleMaterialsMicroscopyDuplicates() : [],
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
			const btn = vm.$el.querySelector('.topbar-materials-microscopy-vault-button')
			assert.ok(btn, 'Topbar Materials & EM Vault button must render')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'Alt+Shift+K')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'K', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.materialsMicroscopyVaultOpen, true)
			assert.ok(vm.$el.querySelector('.materials-microscopy-vault-workbench'), 'MaterialsMicroscopyVaultWorkbench must open on Alt+Shift+K shortcut')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'K', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.materialsMicroscopyVaultOpen, false)
			assert.equal(vm.$el.querySelector('.materials-microscopy-vault-workbench'), null, 'MaterialsMicroscopyVaultWorkbench must toggle closed on Alt+Shift+K shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new Materials & EM Vault files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/materialsMicroscopyVaultAuditor.js',
			'src/components/MaterialsMicroscopyVaultWorkbench.vue',
			'tests/frontend/materials-microscopy-vault-auditor.test.cjs',
			'tests/Vue/MaterialsMicroscopyVaultWorkbenchTest.php',
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
