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

function loadAerospaceCfdAuditor() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/aerospaceCfdVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function loadAerospaceCfdVaultWorkbench(clipboardOverrides = {}) {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const auditor = loadModule('src/tools/aerospaceCfdVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
	return loadComponent('src/components/AerospaceCfdVaultWorkbench.vue', {
		'../tools/clipboardHelper': {
			copyTextSafely: async () => true,
			...clipboardOverrides,
		},
		'../tools/duplicateStats': duplicateStats,
		'../tools/aerospaceCfdVaultAuditor': auditor,
	})
}

function buildSampleAerospaceCfdDuplicates(referenceNowMs = Date.UTC(2026, 10, 24, 12, 0, 0)) {
	const oldMtime = Math.floor((referenceNowMs - 40 * 24 * 60 * 60 * 1000) / 1000)
	const recentMtime = Math.floor((referenceNowMs - 2 * 24 * 60 * 60 * 1000) / 1000)

	return [
		{
			id: 20101,
			hash: 'aero-hash-cgns-deck',
			files: [
				{
					id: 1,
					nodeId: 1,
					path: '/aero/cfd_vault/wing_m6/onera_m6_wing.cgns',
					size: 180 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 2,
					nodeId: 2,
					path: '/aero/work/wing_m6_run2/onera_m6_wing.cgns',
					size: 180 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20102,
			hash: 'aero-hash-nastran-cert',
			files: [
				{
					id: 3,
					nodeId: 3,
					path: '/aero/flight_cert/fuselage_bulkhead/bulkhead_modal.bdf',
					size: 24 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 4,
					nodeId: 4,
					path: '/aero/work/fuselage_bulkhead/bulkhead_modal.bdf',
					size: 24 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20103,
			hash: 'aero-hash-hdf5-anchor',
			files: [
				{
					id: 5,
					nodeId: 5,
					path: '/aero/sim_archive/nacelle_mach085/nacelle_mach085.dat.h5',
					size: 520 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 6,
					nodeId: 6,
					path: '/aero/mirror/nacelle_mach085/nacelle_mach085.dat.h5',
					size: 520 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20104,
			hash: 'aero-hash-vtk-redundant',
			files: [
				{
					id: 7,
					nodeId: 7,
					path: '/aero/post/nacelle_mach085/nacelle_mach085_raw.vtu',
					size: 950 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 8,
					nodeId: 8,
					path: '/aero/paraview/nacelle_mach085/nacelle_mach085_raw.vtu',
					size: 950 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20105,
			hash: 'aero-hash-odb-unanchored',
			files: [
				{
					id: 9,
					nodeId: 9,
					path: '/aero/abaqus/turbine_blade_creep/turbine_blade_creep.odb',
					size: 400 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 10,
					nodeId: 10,
					path: '/aero/abaqus/turbine_blade_creep/copy/turbine_blade_creep.odb',
					size: 400 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20106,
			hash: 'aero-hash-openfoam-processor',
			files: [
				{
					id: 11,
					nodeId: 11,
					path: '/aero/openfoam/airfoil_naca0012/processor0/0/U',
					size: 64 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 12,
					nodeId: 12,
					path: '/aero/openfoam/airfoil_naca0012/processor1/0/U',
					size: 64 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20107,
			hash: 'aero-hash-fluent-scratch',
			files: [
				{
					id: 13,
					nodeId: 13,
					path: '/aero/fluent_tmp/nozzle_jet/nozzle_jet.cas.tmp',
					size: 96 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 14,
					nodeId: 14,
					path: '/aero/ansys_tmp/nozzle_jet/nozzle_jet.cas.tmp',
					size: 96 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 20108,
			hash: 'non-aero-family-photo',
			files: [
				{
					id: 15,
					nodeId: 15,
					path: '/alice/Photos/holiday.jpg',
					size: 4 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 16,
					nodeId: 16,
					path: '/alice/Backup/holiday.jpg',
					size: 4 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
	]
}

describe('Cycle 201: Aerospace, CFD & Finite Element Simulation Vault Auditor (pure logic)', () => {
	test('classifies Aerospace CFD/FEA families, detects toolchains, and shields decks, flight-cert, and HDF5 anchors', () => {
		const auditor = loadAerospaceCfdAuditor()
		const referenceNowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = buildSampleAerospaceCfdDuplicates(referenceNowMs)

		const report = auditor.auditAerospaceCfdVault(groups, {}, referenceNowMs)

		assert.equal(report.schema, auditor.AEROSPACE_CFD_VAULT_SCHEMA)
		assert.equal(report.summary.totalDomainGroupsCount, 7)
		assert.equal(report.familyCounts['cad-mesh-boundary'], 2)
		assert.equal(report.familyCounts['solver-checkpoints-fields'], 1)
		assert.equal(report.familyCounts['uncompressed-raw-results'], 2)
		assert.equal(report.familyCounts['cfd-fea-scratch-restart'], 2)

		// CGNS mesh and NASTRAN flight-cert deck must be strictly shielded
		const cgnsCluster = report.clusters.find(c => c.id === 20101)
		assert.ok(cgnsCluster)
		assert.equal(cgnsCluster.hasProtectedGeometryDeck, true)
		assert.equal(cgnsCluster.hasReclaimable, false)
		assert.ok(cgnsCluster.members.every(m => m.shielded && m.action === 'keep'))

		const certCluster = report.clusters.find(c => c.id === 20102)
		assert.ok(certCluster)
		assert.equal(certCluster.hasProtectedFlightCert, true)
		assert.equal(certCluster.clusterVerdict, 'flight-cert-protected')
		assert.equal(certCluster.hasReclaimable, false)

		// Compressed .dat.h5 anchor must be conserved under default shields
		const hdf5Cluster = report.clusters.find(c => c.id === 20103)
		assert.ok(hdf5Cluster)
		assert.equal(hdf5Cluster.hasProtectedCompressedCheckpoint, true)
		assert.equal(hdf5Cluster.hasCompressedArchiveAnchor, true)
		assert.equal(hdf5Cluster.hasReclaimable, false)

		// Redundant uncompressed .vtu matching nacelle_mach085.dat.h5 must be flagged as reclaimable
		const vtuCluster = report.clusters.find(c => c.id === 20104)
		assert.ok(vtuCluster)
		assert.equal(vtuCluster.hasCompressedArchiveAnchor, true)
		assert.equal(vtuCluster.clusterVerdict, 'uncompressed-vtk-odb-redundant')
		assert.equal(vtuCluster.hasReclaimable, true)
		assert.equal(vtuCluster.deleteTargetsCount, 2)

		// Uncompressed .odb WITHOUT a compressed .odb.gz/.h5 anchor must be blocked by requireCompressedAnchorForPrune
		const odbCluster = report.clusters.find(c => c.id === 20105)
		assert.ok(odbCluster)
		assert.equal(odbCluster.hasCompressedArchiveAnchor, false)
		assert.equal(odbCluster.hasReclaimable, false)
		assert.ok(odbCluster.members.every(m => m.shielded))

		// OpenFOAM processorN/ and Fluent scratch should be reclaimable
		const foamCluster = report.clusters.find(c => c.id === 20106)
		assert.ok(foamCluster)
		assert.equal(foamCluster.solverToolchain, 'OpenFOAM Parallel CFD')
		assert.equal(foamCluster.hasCfdScratchIntermediate, true)
		assert.equal(foamCluster.hasReclaimable, true)
		assert.equal(foamCluster.deleteTargetsCount, 1)

		const fluentScratch = report.clusters.find(c => c.id === 20107)
		assert.ok(fluentScratch)
		assert.equal(fluentScratch.hasCfdScratchIntermediate, true)
		assert.equal(fluentScratch.hasReclaimable, true)
	})

	test('respects keepRecentSolverRunDays grace window, hardlink safety on mutable files, and per-copy overrides', () => {
		const auditor = loadAerospaceCfdAuditor()
		const referenceNowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = buildSampleAerospaceCfdDuplicates(referenceNowMs)

		// 14-day grace window shields 2-day-old OpenFOAM/Fluent scratch while allowing 40-day-old non-survivor scratch
		const graceReport = auditor.auditAerospaceCfdVault(groups, {
			presetId: 'cfd-fea-scratch-partitions-cleanup',
			keepRecentSolverRunDays: 14,
		}, referenceNowMs)

		const foamCluster = graceReport.clusters.find(c => c.id === 20106)
		const recentMember = foamCluster.members.find(m => m.id === 12)
		assert.equal(recentMember.shielded, true)
		assert.match(recentMember.protectedReason, /14-day active solver run/)

		// Hardlink strategy must NEVER hardlink mutable .cgns/.bdf or scratch, only immutable .dat.h5 when checkpoint shield is off
		const hardlinkReport = auditor.auditAerospaceCfdVault(groups, {
			strategy: 'hardlink-immutable-meshes-and-hdf5',
			protectCompressedCheckpoints: false,
		}, referenceNowMs)
		const hdf5Cluster = hardlinkReport.clusters.find(c => c.id === 20103)
		assert.equal(hdf5Cluster.hardlinkTargetsCount, 1)
		const scratchCluster = hardlinkReport.clusters.find(c => c.id === 20107)
		assert.equal(scratchCluster.hardlinkTargetsCount, 0)

		// Per-copy keep override shields a redundant .vtu copy
		const overrideReport = auditor.auditAerospaceCfdVault(groups, {
			memberOverrides: { 7: 'keep' },
		}, referenceNowMs)
		const vtuCluster = overrideReport.clusters.find(c => c.id === 20104)
		const overriddenCopy = vtuCluster.members.find(m => m.id === 7)
		assert.equal(overriddenCopy.shielded, true)
		assert.equal(vtuCluster.deleteTargetsCount, 1)
	})

	test('generates safe DRY_RUN=1 POSIX script, CWE-1236 CSV, JSON manifest, and .sync-exclude.lst', () => {
		const auditor = loadAerospaceCfdAuditor()
		const referenceNowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = buildSampleAerospaceCfdDuplicates(referenceNowMs)
		groups.push({
			id: 20199,
			hash: 'aero-hash-formula-injection',
			files: [
				{
					id: 991,
					nodeId: 991,
					path: '/aero/fluent_tmp/=CMD|calc!/=HYPERLINK("evil").cas.tmp',
					size: 12 * 1024 * 1024,
					mtime: Math.floor((referenceNowMs - 30 * 24 * 60 * 60 * 1000) / 1000),
				},
				{
					id: 992,
					nodeId: 992,
					path: '/aero/fluent_tmp/normal_case/clean.cas.tmp',
					size: 12 * 1024 * 1024,
					mtime: Math.floor((referenceNowMs - 30 * 24 * 60 * 60 * 1000) / 1000),
				},
			],
		})

		const report = auditor.auditAerospaceCfdVault(groups, {
			strategy: 'quarantine-uncompressed-dumps-and-scratch',
		}, referenceNowMs)

		const script = auditor.buildAerospaceCfdRemediationScript(report)
		assert.match(script, /DRY_RUN="\$\{DRY_RUN:-1\}"/)
		assert.match(script, /run_cmd mv -n/)
		assert.doesNotMatch(script, /bulkhead_modal\.bdf/)

		const csv = auditor.buildAerospaceCfdCsvReport(report)
		assert.match(csv, /^cluster_id,cluster_name,solver_toolchain/m)
		assert.match(csv, /'=HYPERLINK/)

		const json = JSON.parse(auditor.buildAerospaceCfdJsonManifest(report))
		assert.equal(json.schema, auditor.AEROSPACE_CFD_VAULT_SCHEMA)
		assert.equal(json.clusters.length, 8)

		const syncExclude = auditor.buildAerospaceCfdSyncExcludeList()
		assert.match(syncExclude, /^processor\*\/$/m)
		assert.match(syncExclude, /^fluent_tmp\/$/m)
		assert.match(syncExclude, /^nastran_scratch\/$/m)
	})
})

describe('Cycle 201: AerospaceCfdVaultWorkbench Vue component & App.vue Alt+Shift+A integration', () => {
	test('renders empty state, populated audit workspace, presets, filters, and non-clamping numeric inputs', async () => {
		const Workbench = loadAerospaceCfdVaultWorkbench()
		const emptyVm = new Vue({
			render: h => h(Workbench, {
				props: { duplicates: [], allDuplicates: [] },
			}),
		}).$mount()
		try {
			await settle()
			assert.ok(emptyVm.$el.querySelector('.acv__empty-banner'))
			assert.equal(emptyVm.$el.querySelector('.acv__workspace'), null)
		} finally {
			emptyVm.$destroy()
		}

		const referenceNowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = buildSampleAerospaceCfdDuplicates(referenceNowMs)
		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)

		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: groups,
					allDuplicates: groups,
					currentDuplicateId: 20104,
				},
			}),
		}).$mount(mountNode)

		try {
			await settle()
			const wb = vm.$children[0]
			assert.ok(vm.$el.querySelector('.acv__workspace'))
			assert.equal(wb.selectedCluster.id, 20104)

			// Controlled numeric input must never be clamped/reset mid-keystroke when cleared to ''
			const numInputs = vm.$el.querySelectorAll('input.acv__num-input')
			assert.equal(numInputs.length, 2)
			numInputs[0].value = ''
			numInputs[0].dispatchEvent(new window.Event('input', { bubbles: true }))
			await settle()
			assert.equal(wb.keepRecentSolverRunDaysInput, '')
			assert.equal(wb.parsedKeepRecentSolverRunDays, 0)

			// Apply preset
			const presetBtns = Array.from(vm.$el.querySelectorAll('.acv__control-row .acv__seg-btn'))
			const scratchPresetBtn = presetBtns.find(b => b.textContent.includes('CFD Scratch & Parallel Partitions'))
			assert.ok(scratchPresetBtn)
			scratchPresetBtn.click()
			await settle()
			assert.equal(wb.presetId, 'cfd-fea-scratch-partitions-cleanup')
			assert.equal(wb.keepRecentSolverRunDaysInput, '14')

			// Search filter empty state + reset
			const searchInput = vm.$el.querySelector('input[type="search"]')
			searchInput.value = 'nonexistent-aerospace-xyz-999'
			searchInput.dispatchEvent(new window.Event('input', { bubbles: true }))
			await settle()
			assert.ok(vm.$el.querySelector('.acv__empty-filter'))
			vm.$el.querySelector('.acv__empty-filter button').click()
			await settle()
			assert.ok(vm.$el.querySelector('.acv__workspace'))
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('App.vue renders Aerospace & CFD Vault topbar button and toggles workbench on Alt+Shift+A', async () => {
		window.localStorage.clear()
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		const icon = slotBox('span')
		const stub = name => ({
			name,
			props: ['duplicate', 'projectId', 'show', 'isScanning', 'duplicates', 'allDuplicates', 'currentDuplicateId'],
			render(h) {
				return h('div', { class: `stub-${name}` })
			},
		})
		const SearchBar = loadComponent('src/components/SearchBar.vue', {
			'vue-material-design-icons/ChevronDown': icon,
		})
		const NcAppNavigationItemStub = {
			props: ['name', 'title', 'allowCollapse', 'open', 'active'],
			render(h) {
				return h('div', { class: 'nc-nav-item' }, [
					h('button', { attrs: { type: 'button' } }, this.name),
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
		const AerospaceCfdVaultWorkbench = loadAerospaceCfdVaultWorkbench()

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
			'./components/AerospaceCfdVaultWorkbench.vue': { __esModule: true, default: AerospaceCfdVaultWorkbench },
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
					entities: type === 'unacknowledged' ? buildSampleAerospaceCfdDuplicates() : [],
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

			const btn = vm.$el.querySelector('button.topbar-aerospace-cfd-vault-button')
			assert.ok(btn, 'Aerospace & CFD Vault button is rendered in topbar')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'Alt+Shift+A')
			assert.equal(vm.$el.querySelector('.aerospace-cfd-vault-workbench'), null)

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'A', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.ok(vm.$el.querySelector('.aerospace-cfd-vault-workbench'), 'AerospaceCfdVaultWorkbench must open on Alt+Shift+A shortcut')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'A', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.$el.querySelector('.aerospace-cfd-vault-workbench'), null, 'AerospaceCfdVaultWorkbench must toggle closed on Alt+Shift+A shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new Aerospace & CFD Vault files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/aerospaceCfdVaultAuditor.js',
			'src/components/AerospaceCfdVaultWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
		]
		for (const rel of files) {
			const content = readFileSync(resolve(root, rel), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(content), false, `No U+2013/U+2014 in ${rel}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `No XSS sink in ${rel}`)
		}
	})
})
