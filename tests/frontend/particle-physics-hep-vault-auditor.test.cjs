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

function loadParticlePhysicsHepAuditor() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/particlePhysicsHepVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function loadParticlePhysicsHepVaultWorkbench(clipboardOverrides = {}) {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const auditor = loadModule('src/tools/particlePhysicsHepVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
	return loadComponent('src/components/ParticlePhysicsHepVaultWorkbench.vue', {
		'../tools/clipboardHelper': {
			copyTextSafely: async () => true,
			...clipboardOverrides,
		},
		'../tools/duplicateStats': duplicateStats,
		'../tools/particlePhysicsHepVaultAuditor': auditor,
	})
}

function buildSampleParticlePhysicsHepDuplicates(referenceNowMs = Date.UTC(2026, 10, 25, 9, 0, 0)) {
	const oldMtime = Math.floor((referenceNowMs - 40 * 24 * 60 * 60 * 1000) / 1000)
	const recentMtime = Math.floor((referenceNowMs - 2 * 24 * 60 * 60 * 1000) / 1000)

	return [
		{
			id: 21601,
			hash: 'hep-hash-gdml-geometry',
			files: [
				{
					id: 1,
					nodeId: 1,
					path: '/hep_vault/00_gdml/calorimeter_v4/calorimeter_barrel_v4.gdml',
					size: 128 * 1024,
					mtime: oldMtime,
				},
				{
					id: 2,
					nodeId: 2,
					path: '/hep_vault/mirror/calorimeter_barrel_v4.gdml',
					size: 128 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21602,
			hash: 'hep-hash-safety-unblind-hold',
			files: [
				{
					id: 3,
					nodeId: 3,
					path: '/beam_vault/radiation_hold/unblind_hold/run_08821_epics_interlock.epics',
					size: 180 * 1024,
					mtime: oldMtime,
				},
				{
					id: 4,
					nodeId: 4,
					path: '/beam_vault/mirror/radiation_hold/run_08821_epics_interlock.epics',
					size: 180 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21603,
			hash: 'hep-hash-root-tree-master',
			files: [
				{
					id: 5,
					nodeId: 5,
					path: '/hep_vault/00_root/run_4210/run_4210_dimuon_reco.root',
					size: 640 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 6,
					nodeId: 6,
					path: '/hep_vault/nas_mirror/run_4210/run_4210_dimuon_reco.root',
					size: 640 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21604,
			hash: 'hep-hash-nexus-beamline-master',
			files: [
				{
					id: 7,
					nodeId: 7,
					path: '/synchrotron_vault/00_nxs/esrf_id13/beam_scan_1092.nxs',
					size: 420 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 8,
					nodeId: 8,
					path: '/synchrotron_vault/backup/esrf_id13/beam_scan_1092.nxs',
					size: 420 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21605,
			hash: 'hep-hash-redundant-ntuple-anchored',
			files: [
				{
					id: 9,
					nodeId: 9,
					path: '/hep_vault/ntuple_exports/run_4210_dimuon_reco_ntuple.parquet',
					size: 85 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 10,
					nodeId: 10,
					path: '/hep_vault/histogram_plots/run_4210_dimuon_reco_ntuple.parquet',
					size: 85 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21606,
			hash: 'hep-hash-unanchored-ntuple-csv',
			files: [
				{
					id: 11,
					nodeId: 11,
					path: '/hep_vault/ntuple_csv/orphan_beam_8801_ntuple.csv',
					size: 16 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 12,
					nodeId: 12,
					path: '/hep_vault/ascii_exports/orphan_beam_8801_ntuple.csv',
					size: 16 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21607,
			hash: 'hep-hash-geant4-old-scratch',
			files: [
				{
					id: 13,
					nodeId: 13,
					path: '/hep_vault/geant4_tmp/run_4210_calo_sim.root.tmp',
					size: 190 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 14,
					nodeId: 14,
					path: '/hep_vault/cmssw_work/run_4210_calo_sim.root.tmp',
					size: 190 * 1024 * 1024,
					mtime: oldMtime,
				},
			],
		},
		{
			id: 21608,
			hash: 'hep-hash-recent-xrootd-scratch',
			files: [
				{
					id: 15,
					nodeId: 15,
					path: '/hep_vault/xrootd_staging/beam_scan_1092.nxs.part',
					size: 64 * 1024 * 1024,
					mtime: recentMtime,
				},
				{
					id: 16,
					nodeId: 16,
					path: '/hep_vault/pythia_scratch/beam_scan_1092.nxs.part',
					size: 64 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21609,
			hash: 'non-hep-orbital-noise',
			files: [
				{
					id: 17,
					nodeId: 17,
					path: '/orbital_vault/00_cadu/pass_01.cadu',
					size: 40 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 18,
					nodeId: 18,
					path: '/orbital_vault/mirror/pass_01.cadu',
					size: 40 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
	]
}

describe('Cycle 216: Particle Physics, HEP Detector & Synchrotron Beamline Vault Auditor', () => {
	test('normalizeParticlePhysicsHepConfig clamps invalid fields and preserves valid defaults', () => {
		const {
			PARTICLE_PHYSICS_HEP_DEFAULT_CONFIG,
			normalizeParticlePhysicsHepConfig,
		} = loadParticlePhysicsHepAuditor()

		const def = normalizeParticlePhysicsHepConfig()
		assert.deepEqual(def, {
			...PARTICLE_PHYSICS_HEP_DEFAULT_CONFIG,
			memberOverrides: {},
		})

		const custom = normalizeParticlePhysicsHepConfig({
			familyFilter: 'invalid-family',
			verdictFilter: 'unknown-verdict',
			strategy: 'bogus',
			survivorRule: 'bogus',
			sortMode: 'bogus',
			keepRecentRunDays: -5,
			minSizeKb: -10,
			searchQuery: '  root  ',
			protectCalibrationAndGeometry: false,
		})
		assert.equal(custom.familyFilter, 'all')
		assert.equal(custom.verdictFilter, 'all')
		assert.equal(custom.strategy, 'prune-exports-and-beam-scratch')
		assert.equal(custom.survivorRule, 'hep-calibration-root-first')
		assert.equal(custom.sortMode, 'reclaim_desc')
		assert.equal(custom.keepRecentRunDays, 0)
		assert.equal(custom.minSizeKb, 0)
		assert.equal(custom.searchQuery, 'root')
		assert.equal(custom.protectCalibrationAndGeometry, false)
	})

	test('classifyParticlePhysicsHepFile classifies all 4 HEP & Beamline families and excludes non-HEP domains', () => {
		const { classifyParticlePhysicsHepFile } = loadParticlePhysicsHepAuditor()

		const gdml = classifyParticlePhysicsHepFile({ path: '/hep_vault/00_gdml/detector_v2.gdml', size: 1024 })
		assert.equal(gdml.family, 'hep-calibration-beam-logs')
		assert.equal(gdml.isProtectedCalibrationGeometry, true)
		assert.equal(gdml.hepTag, 'GDML GEOMETRY')

		const hold = classifyParticlePhysicsHepFile({ path: '/beam_vault/radiation_hold/beam_interlock.epics', size: 2048 })
		assert.equal(hold.family, 'hep-calibration-beam-logs')
		assert.equal(hold.isProtectedBeamSafetyHold, true)
		assert.equal(hold.hepTag, 'SAFETY / UNBLIND HOLD')

		const rootMaster = classifyParticlePhysicsHepFile({ path: '/hep_vault/00_root/run_4210.root', size: 4096 })
		assert.equal(rootMaster.family, 'hep-root-beamline-masters')
		assert.equal(rootMaster.isProtectedRootBeamlineMaster, true)
		assert.equal(rootMaster.hepTag, 'CERN ROOT TREE')

		const nxsMaster = classifyParticlePhysicsHepFile({ path: '/synchrotron_vault/00_nxs/beam_scan.nxs', size: 4096 })
		assert.equal(nxsMaster.family, 'hep-root-beamline-masters')
		assert.equal(nxsMaster.isProtectedRootBeamlineMaster, true)
		assert.equal(nxsMaster.hepTag, 'NEXUS BEAMLINE')

		const lheMaster = classifyParticlePhysicsHepFile({ path: '/cern_sim/ttbar_events.lhe', size: 4096 })
		assert.equal(lheMaster.family, 'hep-root-beamline-masters')
		assert.equal(lheMaster.isMutableFile, true)

		const cbfMaster = classifyParticlePhysicsHepFile({ path: '/esrf_id13/diffraction_001.cbf', size: 4096 })
		assert.equal(cbfMaster.family, 'hep-root-beamline-masters')
		assert.equal(cbfMaster.isMutableFile, false)

		const ntupleExport = classifyParticlePhysicsHepFile({ path: '/hep_vault/ntuple_exports/run_4210_ntuple.parquet', size: 1024 })
		assert.equal(ntupleExport.family, 'redundant-hep-ntuple-exports')
		assert.equal(ntupleExport.isRedundantHepExport, true)

		const scratch = classifyParticlePhysicsHepFile({ path: '/hep_vault/geant4_tmp/run_4210.root.tmp', size: 1024 })
		assert.equal(scratch.family, 'hep-sim-recon-scratch')
		assert.equal(scratch.isScratchPath, true)

		const orbital = classifyParticlePhysicsHepFile({ path: '/orbital_vault/00_cadu/pass_01.cadu', size: 4096 })
		assert.equal(orbital.family, null)

		const genericCsv = classifyParticlePhysicsHepFile({ path: '/documents/grocery_list.csv', size: 512 })
		assert.equal(genericCsv.family, null)
	})

	test('auditParticlePhysicsHepVault conserves GDML, ROOT/NeXus, safety holds, unanchored CSVs, and respects grace window', () => {
		const {
			PARTICLE_PHYSICS_HEP_VAULT_SCHEMA,
			auditParticlePhysicsHepVault,
		} = loadParticlePhysicsHepAuditor()

		const nowMs = Date.UTC(2026, 10, 25, 9, 0, 0)
		const groups = buildSampleParticlePhysicsHepDuplicates(nowMs)

		const report = auditParticlePhysicsHepVault(groups, {}, nowMs)
		assert.equal(report.schema, PARTICLE_PHYSICS_HEP_VAULT_SCHEMA)
		assert.equal(report.summary.totalClustersCount, 8)
		assert.equal(report.summary.totalCalibClusters, 1)
		assert.equal(report.summary.totalRootMasterClusters, 2)
		assert.equal(report.summary.totalSafetyHoldClusters, 1)

		const gdmlCluster = report.clusters.find(c => c.id === 21601)
		assert.equal(gdmlCluster.reclaimableBytes, 0)
		assert.equal(gdmlCluster.clusterVerdict, 'hep-calibration-protected')

		const holdCluster = report.clusters.find(c => c.id === 21602)
		assert.equal(holdCluster.reclaimableBytes, 0)
		assert.equal(holdCluster.clusterVerdict, 'beam-safety-hold-protected')

		const rootCluster = report.clusters.find(c => c.id === 21603)
		assert.equal(rootCluster.reclaimableBytes, 0)
		assert.equal(rootCluster.clusterVerdict, 'root-beamline-protected')

		const anchoredExport = report.clusters.find(c => c.id === 21605)
		assert.equal(anchoredExport.hasHepMasterAnchor, true)
		assert.equal(anchoredExport.clusterVerdict, 'hep-export-redundant')
		assert.equal(anchoredExport.reclaimableBytes, 2 * 85 * 1024 * 1024)

		const unanchoredExport = report.clusters.find(c => c.id === 21606)
		assert.equal(unanchoredExport.hasHepMasterAnchor, false)
		assert.equal(unanchoredExport.reclaimableBytes, 0)
		assert.equal(unanchoredExport.clusterVerdict, 'shielded')

		const unguardedReport = auditParticlePhysicsHepVault(groups, { requireHepAnchorForPrune: false }, nowMs)
		const unanchoredUnguarded = unguardedReport.clusters.find(c => c.id === 21606)
		assert.equal(unanchoredUnguarded.reclaimableBytes, 16 * 1024 * 1024)

		const graceReport = auditParticlePhysicsHepVault(groups, { keepRecentRunDays: 14 }, nowMs)
		const recentScratch = graceReport.clusters.find(c => c.id === 21608)
		assert.equal(recentScratch.reclaimableBytes, 0)
		assert.equal(recentScratch.clusterVerdict, 'shielded')
		const oldScratch = graceReport.clusters.find(c => c.id === 21607)
		assert.equal(oldScratch.reclaimableBytes, 190 * 1024 * 1024)
	})

	test('hardlink strategy never hardlinks mutable GDML/CSV/scratch and generates safe POSIX script, CWE-1236 CSV, JSON, and sync-exclude', () => {
		const {
			auditParticlePhysicsHepVault,
			buildParticlePhysicsHepCsvReport,
			buildParticlePhysicsHepJsonManifest,
			buildParticlePhysicsHepRemediationScript,
			buildParticlePhysicsHepSyncExcludeList,
		} = loadParticlePhysicsHepAuditor()

		const nowMs = Date.UTC(2026, 10, 25, 9, 0, 0)
		const groups = buildSampleParticlePhysicsHepDuplicates(nowMs)
		groups.push({
			id: 21699,
			hash: 'hep-hash-formula-injection',
			files: [
				{
					id: 99,
					nodeId: 99,
					path: '=cmd|\' /C calc\'!A0/geant4_tmp/run_tmp.root.tmp',
					size: 1024,
					mtime: Math.floor((nowMs - 30 * 24 * 60 * 60 * 1000) / 1000),
				},
				{
					id: 100,
					nodeId: 100,
					path: '/hep_vault/cmssw_work/normal_sim_tmp.root.tmp',
					size: 1024,
					mtime: Math.floor((nowMs - 30 * 24 * 60 * 60 * 1000) / 1000),
				},
			],
		})

		const hardlinkAudit = auditParticlePhysicsHepVault(groups, {
			strategy: 'hardlink-immutable-root-and-nxs',
			protectRootAndBeamlineMasters: false,
		}, nowMs)

		const rootCluster = hardlinkAudit.clusters.find(c => c.id === 21603)
		assert.equal(rootCluster.hardlinkTargetsCount, 1)
		assert.equal(rootCluster.deleteTargetsCount, 0)

		const script = buildParticlePhysicsHepRemediationScript(hardlinkAudit)
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes('run_cmd ln -f'))
		assert.ok(!script.includes('calorimeter_barrel_v4.gdml'))
		assert.ok(!script.includes('run_08821_epics_interlock.epics'))

		const csv = buildParticlePhysicsHepCsvReport(hardlinkAudit)
		assert.ok(csv.includes('hep_toolchain'))
		assert.ok(csv.includes("'=cmd|"))

		const manifest = JSON.parse(buildParticlePhysicsHepJsonManifest(hardlinkAudit))
		assert.equal(manifest.schema, 'duplicatefinder.particle-physics-hep-vault-auditor.v1')
		assert.ok(Array.isArray(manifest.clusters))

		const syncExclude = buildParticlePhysicsHepSyncExcludeList()
		assert.ok(syncExclude.includes('geant4_tmp/'))
		assert.ok(syncExclude.includes('cmssw_work/'))
		assert.ok(syncExclude.includes('*.root.tmp'))
		assert.ok(syncExclude.includes('*.nxs.part'))
	})

	test('ParticlePhysicsHepVaultWorkbench renders interactive controls, switches presets, preserves numeric input mid-keystroke, and updates overrides', async () => {
		const Workbench = loadParticlePhysicsHepVaultWorkbench()
		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const samples = buildSampleParticlePhysicsHepDuplicates()
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
			assert.ok(rootEl.classList.contains('particle-physics-hep-vault-workbench'))
			assert.equal(rootEl.querySelectorAll('.pph__cluster-card').length, 8)

			const presetBtns = Array.from(rootEl.querySelectorAll('.pph__seg-btn'))
			const scratchPresetBtn = presetBtns.find(btn => btn.textContent.includes('GEANT4, CMSSW & Recon Scratch'))
			assert.ok(scratchPresetBtn)
			scratchPresetBtn.click()
			await settle()

			const wbVm = vm.$children[0]
			assert.equal(wbVm.presetId, 'geant4-cmssw-scratch-cleanup')
			assert.equal(wbVm.keepRecentRunDaysInput, '14')

			const numInputs = rootEl.querySelectorAll('input.pph__num-input')
			numInputs[0].value = ''
			numInputs[0].dispatchEvent(new window.Event('input'))
			await settle()
			assert.equal(wbVm.keepRecentRunDaysInput, '')
			assert.equal(wbVm.parsedKeepRecentRunDays, 0)

			const searchInput = rootEl.querySelector('input[type="search"]')
			searchInput.value = 'beam_scan_1092'
			searchInput.dispatchEvent(new window.Event('input'))
			await settle()
			assert.equal(rootEl.querySelectorAll('.pph__cluster-card').length, 2)

			const resetBtn = Array.from(rootEl.querySelectorAll('button')).find(b => b.textContent.includes('Copy DRY_RUN=1 Script'))
			assert.ok(resetBtn)
			resetBtn.click()
			await settle()
			assert.ok(rootEl.querySelector('.pph__notice').textContent.includes('Copied DRY_RUN=1'))
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('App.vue integrates ParticlePhysicsHepVaultWorkbench with topbar button and Alt+Shift+P shortcut', async () => {
		window.localStorage.clear()
		const Workbench = loadParticlePhysicsHepVaultWorkbench()
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
			'./components/ParticlePhysicsHepVaultWorkbench.vue': { __esModule: true, default: Workbench },
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
					entities: type === 'unacknowledged' ? buildSampleParticlePhysicsHepDuplicates() : [],
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
			const btn = vm.$el.querySelector('.topbar-particle-physics-hep-vault-button')
			assert.ok(btn, 'Topbar Particle & HEP button must render')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'Alt+Shift+P')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'P', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.particlePhysicsHepVaultOpen, true)
			assert.ok(vm.$el.querySelector('.particle-physics-hep-vault-workbench'), 'ParticlePhysicsHepVaultWorkbench must open on Alt+Shift+P shortcut')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'P', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.particlePhysicsHepVaultOpen, false)
			assert.equal(vm.$el.querySelector('.particle-physics-hep-vault-workbench'), null, 'ParticlePhysicsHepVaultWorkbench must toggle closed on Alt+Shift+P shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new Particle Physics & HEP Vault files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/particlePhysicsHepVaultAuditor.js',
			'src/components/ParticlePhysicsHepVaultWorkbench.vue',
			'tests/frontend/particle-physics-hep-vault-auditor.test.cjs',
			'tests/Vue/ParticlePhysicsHepVaultWorkbenchTest.php',
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
