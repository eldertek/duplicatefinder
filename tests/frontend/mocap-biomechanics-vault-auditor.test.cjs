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

function loadMocapBiomechanicsAuditor() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/mocapBiomechanicsVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function loadMocapBiomechanicsVaultWorkbench(clipboardOverrides = {}) {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const auditor = loadModule('src/tools/mocapBiomechanicsVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
	return loadComponent('src/components/MocapBiomechanicsVaultWorkbench.vue', {
		'../tools/clipboardHelper': {
			copyTextSafely: async () => true,
			...clipboardOverrides,
		},
		'../tools/duplicateStats': duplicateStats,
		'../tools/mocapBiomechanicsVaultAuditor': auditor,
	})
}

function buildSampleMocapBiomechanicsDuplicates(referenceNowMs = Date.UTC(2026, 10, 25, 9, 0, 0)) {
	const oldMtime = Math.floor((referenceNowMs - 40 * 24 * 60 * 60 * 1000) / 1000)
	const recentMtime = Math.floor((referenceNowMs - 2 * 24 * 60 * 60 * 1000) / 1000)

	return [
		{
			id: 21301,
			hash: 'mocap-hash-wand-cal-rig',
			files: [
				{
					id: 1,
					nodeId: 1,
					path: '/mocap_vault/00_calibration/stage_b/stage_b_wand_2026.xcp',
					size: 64 * 1024,
					mtime: oldMtime,
				},
				{
					id: 2,
					nodeId: 2,
					path: '/mocap_vault/backup/stage_b/stage_b_wand_2026.xcp',
					size: 64 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21302,
			hash: 'mocap-hash-irb-gait-hold',
			files: [
				{
					id: 3,
					nodeId: 3,
					path: '/biomechanics_vault/irb_hold/clinical_gait_hold/pediatric_gait_trial04.c3d',
					size: 180 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 4,
					nodeId: 4,
					path: '/biomechanics_vault/mirror/irb_hold/pediatric_gait_trial04.c3d',
					size: 180 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21303,
			hash: 'mocap-hash-raw-c3d-sprint',
			files: [
				{
					id: 5,
					nodeId: 5,
					path: '/mocap_vault/00_c3d/sprint_track/sprint_start_01.c3d',
					size: 240 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 6,
					nodeId: 6,
					path: '/mocap_vault/nas_mirror/sprint_track/sprint_start_01.c3d',
					size: 240 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21304,
			hash: 'mocap-hash-optitrack-tak',
			files: [
				{
					id: 7,
					nodeId: 7,
					path: '/mocap_vault/00_optitrack/combat_stunt/combat_stunt_take03.tak',
					size: 150 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 8,
					nodeId: 8,
					path: '/mocap_vault/work/combat_stunt/combat_stunt_take03.tak',
					size: 150 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21305,
			hash: 'mocap-hash-redundant-fbx-anchored',
			files: [
				{
					id: 9,
					nodeId: 9,
					path: '/mocap_vault/retargeted_exports/sprint_track/sprint_start_01_retarget.fbx',
					size: 64 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 10,
					nodeId: 10,
					path: '/mocap_vault/fbx_exports/sprint_track/sprint_start_01_retarget.fbx',
					size: 64 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21306,
			hash: 'mocap-hash-unanchored-bvh-preview',
			files: [
				{
					id: 11,
					nodeId: 11,
					path: '/mocap_vault/bvh_exports/unanchored_dance_preview.bvh',
					size: 28 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 12,
					nodeId: 12,
					path: '/mocap_vault/preview_renders/unanchored_dance_preview.bvh',
					size: 28 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21307,
			hash: 'mocap-hash-vicon-scratch-old',
			files: [
				{
					id: 13,
					nodeId: 13,
					path: '/mocap_vault/vicon_tmp/session088/solve_pass_01.c3d.tmp',
					size: 190 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 14,
					nodeId: 14,
					path: '/mocap_vault/nexus_cache/session088/solve_pass_01.c3d.tmp',
					size: 190 * 1024 * 1024,
					mtime: oldMtime,
				},
			],
		},
		{
			id: 21308,
			hash: 'mocap-hash-motive-scratch-recent',
			files: [
				{
					id: 15,
					nodeId: 15,
					path: '/mocap_vault/motive_cache/run19/tmp_motive_gapfill.tak.tmp',
					size: 85 * 1024 * 1024,
					mtime: recentMtime,
				},
				{
					id: 16,
					nodeId: 16,
					path: '/mocap_vault/solve_scratch/run19/tmp_motive_gapfill.tak.tmp',
					size: 85 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21309,
			hash: 'mocap-hash-opensim-rig-and-vsk',
			files: [
				{
					id: 17,
					nodeId: 17,
					path: '/biomechanics_vault/00_osim/rajagopal_gait/subject_09_scaled.osim',
					size: 48 * 1024,
					mtime: oldMtime,
				},
				{
					id: 18,
					nodeId: 18,
					path: '/biomechanics_vault/subject_rigs/rajagopal_gait/subject_09_skeleton.vsk',
					size: 52 * 1024,
					mtime: oldMtime,
				},
			],
		},
		{
			id: 21310,
			hash: 'non-mocap-invoice-pdf',
			files: [
				{
					id: 19,
					nodeId: 19,
					path: '/Users/alex/Documents/invoices/electric_bill_nov2026.pdf',
					size: 120 * 1024,
					mtime: oldMtime,
				},
				{
					id: 20,
					nodeId: 20,
					path: '/Users/alex/Backup/invoices/electric_bill_nov2026.pdf',
					size: 120 * 1024,
					mtime: recentMtime,
				},
			],
		},
	]
}

describe('Cycle 213: Motion Capture, Biomechanics & Optical Tracking Vault Auditor', () => {
	test('classifies wand calibrations, IRB/gait holds, raw C3D/TAK/OSIM masters, redundant retargeted FBX/BVH exports, and Vicon/Motive scratch while ignoring non-domain files', () => {
		const {
			MOCAP_BIOMECHANICS_VAULT_SCHEMA,
			auditMocapBiomechanicsVault,
		} = loadMocapBiomechanicsAuditor()

		const nowMs = Date.UTC(2026, 10, 25, 9, 0, 0)
		const groups = buildSampleMocapBiomechanicsDuplicates(nowMs)
		const report = auditMocapBiomechanicsVault(groups, {}, nowMs)

		assert.equal(report.schema, MOCAP_BIOMECHANICS_VAULT_SCHEMA)
		assert.equal(report.summary.totalDomainGroupsCount, 9)
		assert.equal(report.clusters.some(c => c.id === 21310), false)

		const calCluster = report.clusters.find(c => c.id === 21301)
		assert.equal(calCluster.family, 'calibration-rigs-ethics-holds')
		assert.equal(calCluster.clusterVerdict, 'cal-rig-std-protected')
		assert.equal(calCluster.reclaimableBytes, 0)
		assert.equal(calCluster.members.every(m => m.shielded && m.action === 'keep'), true)

		const holdCluster = report.clusters.find(c => c.id === 21302)
		assert.equal(holdCluster.family, 'calibration-rigs-ethics-holds')
		assert.equal(holdCluster.clusterVerdict, 'ethics-hold-protected')
		assert.equal(holdCluster.reclaimableBytes, 0)
		assert.equal(holdCluster.hasProtectedEthicsHold, true)

		const c3dCluster = report.clusters.find(c => c.id === 21303)
		assert.equal(c3dCluster.family, 'raw-mocap-telemetry-masters')
		assert.equal(c3dCluster.clusterVerdict, 'raw-mocap-master-protected')
		assert.equal(c3dCluster.mocapToolchain, 'C3D Biomechanics Standard')
		assert.equal(c3dCluster.reclaimableBytes, 0)

		const takCluster = report.clusters.find(c => c.id === 21304)
		assert.equal(takCluster.family, 'raw-mocap-telemetry-masters')
		assert.equal(takCluster.mocapToolchain, 'OptiTrack Motive')
		assert.equal(takCluster.reclaimableBytes, 0)

		const anchoredFbx = report.clusters.find(c => c.id === 21305)
		assert.equal(anchoredFbx.family, 'redundant-retargeted-fbx-previews')
		assert.equal(anchoredFbx.hasMocapMasterAnchor, true)
		assert.equal(anchoredFbx.clusterVerdict, 'mocap-retarget-redundant')
		assert.equal(anchoredFbx.reclaimableBytes, 128 * 1024 * 1024)
		assert.equal(anchoredFbx.members.every(m => m.action === 'delete'), true)

		const unanchoredBvh = report.clusters.find(c => c.id === 21306)
		assert.equal(unanchoredBvh.family, 'redundant-retargeted-fbx-previews')
		assert.equal(unanchoredBvh.hasMocapMasterAnchor, false)
		assert.equal(unanchoredBvh.reclaimableBytes, 0)
		assert.equal(unanchoredBvh.members.every(m => m.shielded), true)

		const viconScratch = report.clusters.find(c => c.id === 21307)
		assert.equal(viconScratch.family, 'mocap-solver-retake-scratch')
		assert.equal(viconScratch.clusterVerdict, 'solver-scratch-intermediate')
		assert.equal(viconScratch.reclaimableBytes, 190 * 1024 * 1024)

		const osimCluster = report.clusters.find(c => c.id === 21309)
		assert.equal(osimCluster.family, 'calibration-rigs-ethics-holds')
		assert.equal(osimCluster.reclaimableBytes, 0)
	})

	test('enforces keepRecentSessionDays grace window, hardlink-immutable-c3d-x2d-and-tak safety, and CWE-1236 / DRY_RUN=1 exports', () => {
		const {
			auditMocapBiomechanicsVault,
			buildMocapBiomechanicsCsvReport,
			buildMocapBiomechanicsJsonManifest,
			buildMocapBiomechanicsRemediationScript,
			buildMocapBiomechanicsSyncExcludeList,
		} = loadMocapBiomechanicsAuditor()

		const nowMs = Date.UTC(2026, 10, 25, 9, 0, 0)
		const groups = buildSampleMocapBiomechanicsDuplicates(nowMs)

		// With 14-day grace window, recent Motive scratch (2 days old) is shielded while 40-day Vicon scratch is reclaimable
		const graceReport = auditMocapBiomechanicsVault(groups, { keepRecentSessionDays: 14 }, nowMs)
		const recentScratch = graceReport.clusters.find(c => c.id === 21308)
		const oldScratch = graceReport.clusters.find(c => c.id === 21307)
		assert.equal(recentScratch.reclaimableBytes, 0)
		assert.equal(oldScratch.reclaimableBytes, 190 * 1024 * 1024)

		// With hardlink strategy and raw-master shield off, immutable .c3d/.tak masters hardlink, while mutable .xcp/.tmp never hardlink
		const hardlinkReport = auditMocapBiomechanicsVault(groups, {
			strategy: 'hardlink-immutable-c3d-x2d-and-tak',
			protectRawMocapMasters: false,
			protectCalibrationsAndRigs: false,
			protectEthicsArchiveHolds: true,
		}, nowMs)

		const c3dCluster = hardlinkReport.clusters.find(c => c.id === 21303)
		assert.equal(c3dCluster.members.some(m => m.action === 'hardlink'), true)

		const takCluster = hardlinkReport.clusters.find(c => c.id === 21304)
		assert.equal(takCluster.members.some(m => m.action === 'hardlink'), true)

		const calCluster = hardlinkReport.clusters.find(c => c.id === 21301)
		assert.equal(calCluster.members.some(m => m.action === 'hardlink'), false)

		const script = buildMocapBiomechanicsRemediationScript(hardlinkReport)
		assert.equal(script.includes('DRY_RUN="${DRY_RUN:-1}"'), true)
		assert.equal(script.includes('run_cmd ln -f'), true)
		assert.equal(script.includes('stage_b_wand_2026.xcp'), true)
		assert.equal(script.includes('pediatric_gait_trial04.c3d'), false)

		// Quarantine strategy moves redundant retargets and scratch to QUARANTINE_DIR
		const quarantineReport = auditMocapBiomechanicsVault(groups, {
			strategy: 'quarantine-retargets-and-solver-scratch',
		}, nowMs)
		const quarantineScript = buildMocapBiomechanicsRemediationScript(quarantineReport)
		assert.equal(quarantineScript.includes('run_cmd mv -n'), true)

		// CWE-1236 formula injection protection in CSV
		const injectionGroup = [
			{
				id: 99999,
				hash: 'mocap-formula-test',
				files: [
					{
						id: 901,
						nodeId: 901,
						path: '/mocap_vault/vicon_tmp/=cmd("calc")_bad.c3d.tmp',
						size: 4096,
					},
					{
						id: 902,
						nodeId: 902,
						path: '/mocap_vault/vicon_tmp/normal_take.c3d.tmp',
						size: 4096,
					},
				],
			},
		]
		const injReport = auditMocapBiomechanicsVault(injectionGroup, {}, nowMs)
		const csv = buildMocapBiomechanicsCsvReport(injReport)
		assert.equal(csv.includes('cluster_id,cluster_name,mocap_toolchain'), true)
		assert.equal(csv.includes('\'=cmd'), true)

		const jsonManifest = JSON.parse(buildMocapBiomechanicsJsonManifest(graceReport))
		assert.equal(jsonManifest.schema, 'duplicatefinder.mocap-biomechanics-vault-auditor.v1')
		assert.equal(Array.isArray(jsonManifest.clusters), true)

		const excludeList = buildMocapBiomechanicsSyncExcludeList()
		assert.equal(excludeList.includes('vicon_tmp/'), true)
		assert.equal(excludeList.includes('motive_cache/'), true)
		assert.equal(excludeList.includes('*.c3d.tmp'), true)
		assert.equal(excludeList.includes('*.tak.tmp'), true)
	})

	test('MocapBiomechanicsVaultWorkbench renders empty state, presets, numeric filters, overrides, exports, and emits jump/compare', async () => {
		const copiedTexts = []
		const Workbench = loadMocapBiomechanicsVaultWorkbench({
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
			assert.ok(emptyVm.$el.querySelector('.mbv__empty-banner'), 'Empty banner renders when scan pool is empty')
		} finally {
			emptyVm.$destroy()
			mountEmpty.remove()
		}

		const groups = buildSampleMocapBiomechanicsDuplicates()
		const emitted = { select: [], compare: [] }
		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: groups,
					allDuplicates: groups,
					currentDuplicateId: 21305,
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
			assert.equal(wb.selectedCluster.id, 21305)
			assert.ok(wb.$el.querySelector('.mbv__workspace'))

			// Controlled numeric inputs never clamp mid-keystroke on empty/partial typing
			wb.keepRecentSessionDaysInput = ''
			wb.minSizeKbInput = ''
			await settle()
			assert.equal(wb.keepRecentSessionDaysInput, '')
			assert.equal(wb.parsedKeepRecentSessionDays, 0)
			assert.equal(wb.parsedMinSizeKb, 0)

			// Apply scratch cleanup preset
			wb.applyPreset('mocap-solver-scratch-cleanup')
			await settle()
			assert.equal(wb.keepRecentSessionDaysInput, '14')

			// Per-copy override on reclaimable target
			wb.applyPreset('all-mocap-biomechanics-audit')
			await settle()
			const firstOverrideSelect = wb.$el.querySelector('.mbv__override-select')
			assert.ok(firstOverrideSelect)
			wb.setMemberOverride(wb.selectedCluster.members[0].key, 'keep')
			await settle()
			assert.equal(wb.selectedCluster.members[0].shielded, true)

			// Jump & compare events
			wb.jumpToDuplicate(wb.selectedCluster)
			wb.compareDuplicate(wb.selectedCluster)
			assert.deepEqual(emitted.select, [21305])
			assert.deepEqual(emitted.compare, [21305])

			// Clipboard actions
			await wb.copyRemediationScript()
			await wb.copySyncExcludeSnippet()
			assert.equal(copiedTexts.length, 2)
			assert.ok(copiedTexts[0].includes('DRY_RUN='))
			assert.ok(copiedTexts[1].includes('vicon_tmp/'))
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('App.vue renders Mocap & Biomechanics topbar button and toggles MocapBiomechanicsVaultWorkbench via Alt+Shift+M', async () => {
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
		const MocapBiomechanicsVaultWorkbench = loadMocapBiomechanicsVaultWorkbench()

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
			'./components/MocapBiomechanicsVaultWorkbench.vue': { __esModule: true, default: MocapBiomechanicsVaultWorkbench },
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
					entities: type === 'unacknowledged' ? buildSampleMocapBiomechanicsDuplicates() : [],
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
			const btn = vm.$el.querySelector('.topbar-mocap-biomechanics-vault-button')
			assert.ok(btn, 'Topbar Mocap & Biomechanics button must render')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'Alt+Shift+M')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'M', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.mocapBiomechanicsVaultOpen, true)
			assert.ok(vm.$el.querySelector('.mocap-biomechanics-vault-workbench'), 'MocapBiomechanicsVaultWorkbench must open on Alt+Shift+M shortcut')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'M', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.mocapBiomechanicsVaultOpen, false)
			assert.equal(vm.$el.querySelector('.mocap-biomechanics-vault-workbench'), null, 'MocapBiomechanicsVaultWorkbench must toggle closed on Alt+Shift+M shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new Mocap & Biomechanics Vault files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/mocapBiomechanicsVaultAuditor.js',
			'src/components/MocapBiomechanicsVaultWorkbench.vue',
			'tests/frontend/mocap-biomechanics-vault-auditor.test.cjs',
			'tests/Vue/MocapBiomechanicsVaultWorkbenchTest.php',
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
