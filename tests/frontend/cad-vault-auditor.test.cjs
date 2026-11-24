const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window } = require('./helpers.cjs')

function loadCadVaultModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/cadVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function loadCadVaultWorkbench(clipboardImpl) {
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js')
	const cadVaultAuditor = loadCadVaultModule()
	return loadComponent('src/components/CadVaultWorkbench.vue', {
		'../tools/clipboardHelper': clipboardImpl === undefined
			? clipboardHelper
			: { copyTextSafely: text => clipboardHelper.copyTextSafely(text, clipboardImpl) },
		'../tools/cadVaultAuditor': cadVaultAuditor,
	})
}

function buildSampleCadDuplicates() {
	const kib = 1024
	const mib = 1024 * 1024
	const refSec = 1796000000
	return [
		{
			id: 8101,
			hash: 'sha256-chassis-sldprt',
			size: 48 * mib,
			acknowledged: false,
			files: [
				{
					id: 81011,
					path: '/__groupfolders/14/Released-PDM/ECO-Approved/Chassis_Main_REV_A.sldprt',
					size: 48 * mib,
					mtime: refSec - 15 * 86400,
				},
				{
					id: 81012,
					path: '/alice/files/Engineering/CAD/Chassis_Main_Rev02.sldprt',
					size: 48 * mib,
					mtime: refSec - 6 * 86400,
				},
				{
					id: 81013,
					path: '/bob/files/Downloads/Chassis_Main_v3_autosave.sldprt',
					size: 48 * mib,
					mtime: refSec - 25 * 86400,
				},
			],
		},
		{
			id: 8102,
			hash: 'sha256-extruder-mount-stl',
			size: 18 * mib,
			acknowledged: false,
			files: [
				{
					id: 81021,
					path: '/Engineering/3D-Models/Extruder_Mount_v3_FIXED.stl',
					size: 18 * mib,
					mtime: refSec - 4 * 86400,
				},
				{
					id: 81022,
					path: '/alice/files/PrusaSlicer/Exports/Extruder_Mount_v3_FIXED.stl',
					size: 18 * mib,
					mtime: refSec - 20 * 86400,
				},
				{
					id: 81023,
					path: '/bob/files/Downloads/Extruder_Mount_v3_FIXED~1.stl',
					size: 18 * mib,
					mtime: refSec - 30 * 86400,
				},
			],
		},
		{
			id: 8103,
			hash: 'sha256-controller-kicad-pcb',
			size: 6 * mib,
			acknowledged: false,
			files: [
				{
					id: 81031,
					path: '/Hardware/KiCad/MainController/MainController.kicad_pcb',
					size: 6 * mib,
					mtime: refSec - 3 * 86400,
				},
				{
					id: 81032,
					path: '/Hardware/KiCad/MainController/MainController-backups/MainController-2026-11-24_041500.kicad_pcb',
					size: 6 * mib,
					mtime: refSec - 22 * 86400,
				},
				{
					id: 81033,
					path: '/alice/files/Hardware/Mirror/MainController.kicad_pcb',
					size: 6 * mib,
					mtime: refSec - 5 * 86400,
				},
			],
		},
		{
			id: 8104,
			hash: 'sha256-gerbers-release-zip',
			size: 12 * mib,
			acknowledged: false,
			files: [
				{
					id: 81041,
					path: '/__groupfolders/15/Mfg-Release/PCB_RevB/gerbers.zip',
					size: 12 * mib,
					mtime: refSec - 10 * 86400,
				},
				{
					id: 81042,
					path: '/alice/files/Exports/gerbers.zip',
					size: 12 * mib,
					mtime: refSec - 18 * 86400,
				},
			],
		},
		{
			id: 8105,
			hash: 'sha256-unrelated-photo',
			size: 512 * kib,
			acknowledged: false,
			files: [
				{ id: 81051, path: '/alice/files/Photos/workshop.jpg', size: 512 * kib, mtime: refSec - 5 * 86400 },
				{ id: 81052, path: '/alice/files/Backup/workshop.jpg', size: 512 * kib, mtime: refSec - 9 * 86400 },
			],
		},
	]
}

describe('CAD, 3D Print, KiCad EDA & Manufacturing Release Vault Auditor', () => {
	test('classifies all 4 CAD/EDA/CAM families, parses revision tags and partLineageStem, and ignores unrelated files', () => {
		const mod = loadCadVaultModule()

		for (const ext of ['sldprt', 'sldasm', 'slddrw', 'step', 'stp', 'iges', 'igs', 'f3d', 'fcstd', 'catpart', 'catproduct', 'prt', 'ipt', 'iam', 'dwg', 'dxf']) {
			assert.equal(mod.classifyCadArtifact(`/cad/part.${ext}`).family, 'native-cad-pdm', `Expected native-cad-pdm for .${ext}`)
		}
		for (const ext of ['stl', '3mf', 'obj', 'ply', 'amf', 'gcode', 'bgcode', 'ctb']) {
			assert.equal(mod.classifyCadArtifact(`/prints/model.${ext}`).family, 'mesh-slicer-prints', `Expected mesh-slicer-prints for .${ext}`)
		}
		for (const ext of ['kicad_pcb', 'kicad_sch', 'kicad_pro', 'kicad_mod', 'brd', 'sch', 'pcbdoc', 'schdoc', 'step_eda', '3dshapes']) {
			assert.equal(mod.classifyCadArtifact(`/eda/board.${ext}`).family, 'eda-pcb-schematics', `Expected eda-pcb-schematics for .${ext}`)
		}
		assert.equal(mod.classifyCadArtifact('/eda/Connectors.3dshapes/JST_PH.step').family, 'eda-pcb-schematics')

		for (const ext of ['gbr', 'gtl', 'gbl', 'drl', 'nc', 'tap']) {
			assert.equal(mod.classifyCadArtifact(`/cam/layer.${ext}`).family, 'cam-gerber-exports', `Expected cam-gerber-exports for .${ext}`)
		}
		assert.equal(mod.classifyCadArtifact('/cam/gerbers.zip').family, 'cam-gerber-exports')
		assert.equal(mod.classifyCadArtifact('/cam/fab-release.zip').family, 'cam-gerber-exports')
		assert.equal(mod.classifyCadArtifact('/cam/bom_export.csv').family, 'cam-gerber-exports')
		assert.equal(mod.classifyCadArtifact('/alice/files/Photos/workshop.jpg'), null)

		const revA = mod.parseCadRevisionInfo('Bracket_Mount_REV_A.sldprt')
		const rev02 = mod.parseCadRevisionInfo('Bracket_Mount_Rev02.sldprt')
		const v3Fixed = mod.parseCadRevisionInfo('Bracket_Mount_v3_FIXED.stl')
		const bakTilde = mod.parseCadRevisionInfo('Bracket_Mount-bak~1.fcstd1')
		const kicadBackup = mod.parseCadRevisionInfo(
			'MainController-2026-11-24_041500.kicad_pcb',
			'/Hardware/MainController-backups/MainController-2026-11-24_041500.kicad_pcb'
		)

		assert.equal(revA.partLineageStem, 'Bracket_Mount')
		assert.equal(rev02.partLineageStem, 'Bracket_Mount')
		assert.equal(v3Fixed.partLineageStem, 'Bracket_Mount')
		assert.equal(bakTilde.partLineageStem, 'Bracket_Mount')
		assert.equal(bakTilde.isAutosaveOrBackup, true)
		assert.ok(revA.revisionTags.includes('REV_A'))
		assert.ok(rev02.revisionTags.includes('Rev02'))
		assert.ok(v3Fixed.revisionTags.includes('v3'))
		assert.ok(v3Fixed.revisionTags.includes('FIXED'))
		assert.equal(kicadBackup.partLineageStem, 'MainController')
		assert.equal(kicadBackup.isAutosaveOrBackup, true)
		assert.ok(kicadBackup.revisionTags.includes('-backups'))
	})

	test('shields Released PDM, Mfg Release, and Native Parametric masters while catching mesh/autosave/-backups/ duplicates', () => {
		const mod = loadCadVaultModule()
		const analysis = mod.analyzeCadVaultDuplicates(buildSampleCadDuplicates(), {
			referenceTimeSec: 1796000000,
			staleExportDays: 14,
		})

		assert.equal(analysis.schema, 'duplicatefinder.cad-vault-auditor.v1')
		assert.equal(analysis.summary.totalClustersCount, 4)
		assert.equal(analysis.summary.familyCounts['native-cad-pdm'], 1)
		assert.equal(analysis.summary.familyCounts['mesh-slicer-prints'], 1)
		assert.equal(analysis.summary.familyCounts['eda-pcb-schematics'], 1)
		assert.equal(analysis.summary.familyCounts['cam-gerber-exports'], 1)

		const cadCluster = analysis.clusters.find(c => c.primaryGroupId === 8101)
		assert.ok(cadCluster)
		assert.equal(cadCluster.survivor.tier, 'released-pdm-vault')
		assert.equal(cadCluster.members.find(m => m.fileId === 81012).verdict, 'blocked-native-parametric')
		assert.equal(cadCluster.members.find(m => m.fileId === 81013).verdict, 'reclaim-autosave-backup')

		const stlCluster = analysis.clusters.find(c => c.primaryGroupId === 8102)
		assert.ok(stlCluster)
		assert.equal(stlCluster.survivor.fileId, 81021)
		assert.equal(stlCluster.reclaimableCopiesCount, 2)

		const kicadCluster = analysis.clusters.find(c => c.primaryGroupId === 8103)
		assert.ok(kicadCluster)
		assert.equal(kicadCluster.members.find(m => m.fileId === 81032).verdict, 'reclaim-autosave-backup')
		assert.equal(kicadCluster.members.find(m => m.fileId === 81033).verdict, 'blocked-native-parametric')

		const gerberCluster = analysis.clusters.find(c => c.primaryGroupId === 8104)
		assert.ok(gerberCluster)
		assert.equal(gerberCluster.survivor.tier, 'mfg-cam-release')
		assert.equal(gerberCluster.members.find(m => m.fileId === 81042).verdict, 'reclaim-autosave-backup')
	})

	test('supports all 3 strategies, operator overrides, DRY_RUN=1 POSIX script, .sync-exclude.lst, CWE-1236 CSV, and JSON manifest', () => {
		const mod = loadCadVaultModule()
		const duplicates = [
			...buildSampleCadDuplicates(),
			{
				id: 8199,
				hash: 'sha256-formula-stl',
				size: 102400,
				acknowledged: false,
				files: [
					{ id: 81991, path: '/Engineering/Meshes/=CMD("calc").stl', size: 102400, mtime: 1795000000 },
					{ id: 81992, path: '/alice/files/PrusaSlicer/+malicious.stl', size: 102400, mtime: 1790000000 },
				],
			},
		]

		const hardlinkAnalysis = mod.analyzeCadVaultDuplicates(duplicates, {
			familyFilter: 'mesh-slicer-prints',
			strategy: 'hardlink-mesh-exports',
			survivorRule: 'pdm-authority-first',
			referenceTimeSec: 1796000000,
		})
		assert.equal(hardlinkAnalysis.clusters.length, 2)
		const stlTarget = hardlinkAnalysis.clusters
			.find(c => c.primaryGroupId === 8102)
			.members.find(m => m.fileId === 81022)
		assert.equal(stlTarget.verdict, 'hardlink-mesh-export')
		assert.equal(stlTarget.actionKind, 'hardlink')

		const script = mod.buildCadVaultScript(hardlinkAnalysis, { dataRoot: '/srv/nc/data' })
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes('sha256sum --'))
		assert.ok(script.includes('stat -c %d'))
		assert.ok(script.includes('ln -f --'))
		assert.ok(script.includes('hardlink_mesh_export'))
		assert.ok(script.includes('occ files:scan --path='))

		const pruneAnalysis = mod.analyzeCadVaultDuplicates(duplicates, {
			strategy: 'prune-cad-autosaves',
			protectNativeParametric: false,
			referenceTimeSec: 1796000000,
		})
		const pruneKicad = pruneAnalysis.clusters.find(c => c.primaryGroupId === 8103)
		assert.equal(pruneKicad.members.find(m => m.fileId === 81032).verdict, 'reclaim-autosave-backup')
		assert.equal(pruneKicad.members.find(m => m.fileId === 81033).verdict, 'blocked-not-autosave')

		const overrideAnalysis = mod.analyzeCadVaultDuplicates(buildSampleCadDuplicates(), {
			memberOverrides: {
				81022: 'force-keep',
				81023: 'exclude',
			},
			referenceTimeSec: 1796000000,
		})
		const overriddenStl = overrideAnalysis.clusters.find(c => c.primaryGroupId === 8102)
		assert.equal(overriddenStl.members.find(m => m.fileId === 81022).verdict, 'blocked-manual-shield')
		assert.equal(overriddenStl.members.find(m => m.fileId === 81023).verdict, 'excluded')

		const syncExclude = mod.buildCadSyncExcludeSnippet(hardlinkAnalysis)
		for (const pattern of ['~$*.sld*', '*.lck', '*-backups/', '*.fcstd1', '*.bak']) {
			assert.ok(syncExclude.includes(pattern), `Expected .sync-exclude.lst pattern ${pattern}`)
		}

		const fullAnalysis = mod.analyzeCadVaultDuplicates(duplicates, { referenceTimeSec: 1796000000 })
		const csv = mod.buildCadVaultCsvReport(fullAnalysis)
		assert.ok(csv.includes('"\'=CMD(""calc"").stl"') || csv.includes("'=CMD"))
		assert.ok(csv.includes("'+malicious"))

		const json = JSON.parse(mod.buildCadVaultJsonReport(fullAnalysis, '2026-11-24T06:00:00Z'))
		assert.equal(json.schema, 'duplicatefinder.cad-vault-auditor.v1')
		assert.equal(json.generatedAt, '2026-11-24T06:00:00Z')
		assert.ok(Array.isArray(json.clusters))
	})

	test('renders CadVaultWorkbench empty, filter-empty, populated, and interactive states', async () => {
		let copied = ''
		const Workbench = loadCadVaultWorkbench({
			writeText: async text => {
				copied = text
			},
		})

		const emptyVm = new Vue({
			render: h => h(Workbench, {
				props: { duplicates: [], allDuplicates: [] },
			}),
		}).$mount()
		await settle()
		assert.ok(emptyVm.$el.querySelector('.cvw__empty-banner'))
		emptyVm.$destroy()

		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: buildSampleCadDuplicates(),
					allDuplicates: buildSampleCadDuplicates(),
					currentDuplicateId: 8102,
				},
			}),
		}).$mount()
		await settle()

		assert.equal(vm.$el.querySelectorAll('.cvw__cluster-item').length, 4)
		assert.ok(vm.$el.textContent.includes('Extruder_Mount_v3_FIXED.stl'))

		const numInputs = vm.$el.querySelectorAll('.cvw__num-input')
		assert.equal(numInputs.length, 2)
		numInputs[0].value = ''
		numInputs[0].dispatchEvent(new window.Event('input'))
		await settle()
		assert.equal(numInputs[0].value, '', 'Numeric input must not clamp or reset mid-keystroke')

		const copyBtn = Array.from(vm.$el.querySelectorAll('button')).find(b => b.textContent.includes('Copy DRY_RUN=1 Script'))
		copyBtn.click()
		await settle()
		assert.ok(copied.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(vm.$el.querySelector('.cvw__notice.is-success'))

		const searchInput = vm.$el.querySelector('input[type="search"]')
		searchInput.value = 'no-such-cad-part-xyz'
		searchInput.dispatchEvent(new window.Event('input'))
		await settle()
		assert.ok(vm.$el.querySelector('.cvw__empty-banner'))

		const resetBtn = Array.from(vm.$el.querySelectorAll('button')).find(b => b.textContent.includes('Reset Filters'))
		resetBtn.click()
		await settle()
		assert.equal(vm.$el.querySelectorAll('.cvw__cluster-item').length, 4)

		vm.$destroy()
	})

	test('integrates CAD & EDA button and { keyboard shortcut in App.vue', async () => {
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		const duplicateFilters = loadModule('src/tools/duplicateFilters.js')
		const duplicateStats = loadModule('src/tools/duplicateStats.js')
		const reclamationHistory = loadModule('src/tools/reclamationHistory.js', {
			'./duplicateFilters': duplicateFilters,
			'./duplicateStats': duplicateStats,
		})
		const CadWorkbench = loadCadVaultWorkbench({ writeText: async () => {} })

		const slotBox = tag => ({
			render(h) {
				return h(tag, { on: this.$listeners }, this.$slots.default)
			},
		})
		const stub = name => ({
			name,
			props: ['duplicate', 'projectId', 'show', 'duplicates', 'allDuplicates', 'currentDuplicateId'],
			render(h) {
				return h('div', { class: `stub-${name}` })
			},
		})

		const App = loadComponent('src/App.vue', {
			'@nextcloud/dialogs': { showError: () => {}, showSuccess: () => {} },
			'@nextcloud/vue': {
				NcAppContent: slotBox('main'),
				NcContent: slotBox('div'),
				NcLoadingIcon: slotBox('span'),
				NcAppSettingsDialog: slotBox('section'),
				NcAppSettingsSection: slotBox('div'),
				NcButton: slotBox('button'),
				NcModal: slotBox('div'),
			},
			'./components/DuplicateNavigation.vue': { __esModule: true, default: stub('nav') },
			'./components/DuplicateDetails.vue': { __esModule: true, default: stub('details') },
			'./components/DuplicateTreemap.vue': { __esModule: true, default: stub('treemap') },
			'./components/SpaceReclamationTimeline.vue': { __esModule: true, default: stub('timeline') },
			'./components/SimilarityInspector.vue': { __esModule: true, default: stub('similarity') },
			'./components/BatchAutoSelectWorkbench.vue': { __esModule: true, default: stub('batch') },
			'./components/FileHygieneInspector.vue': { __esModule: true, default: stub('hygiene') },
			'./components/LinkDeduplicationSimulator.vue': { __esModule: true, default: stub('link-sim') },
			'./components/FolderPairMatrix.vue': { __esModule: true, default: stub('folder-matrix') },
			'./components/StorageFootprintAnalyzer.vue': { __esModule: true, default: stub('storage-footprint') },
			'./components/PhotoBurstTimeline.vue': { __esModule: true, default: stub('photo-burst') },
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
			'./components/CadVaultWorkbench.vue': { __esModule: true, default: CadWorkbench },
			'./components/WebBuildMediaWorkbench.vue': { __esModule: true, default: stub('web-build-media-auditor') },
			'./components/LegalDocumentOcrWorkbench.vue': { __esModule: true, default: stub('legal-document-ocr-auditor') },
			'./components/OriginFoldersSettings.vue': { __esModule: true, default: stub('origin') },
			'./components/ExcludedFoldersSettings.vue': { __esModule: true, default: stub('excluded') },
			'./components/BulkDeletionSettings.vue': { __esModule: true, default: stub('bulk') },
			'./components/ProjectsSettings.vue': { __esModule: true, default: stub('projects') },
			'./components/ProjectDuplicates.vue': { __esModule: true, default: stub('project-duplicates') },
			'./components/help/OnboardingGuide.vue': { __esModule: true, default: stub('onboarding') },
			'./components/help/UsageExamples.vue': { __esModule: true, default: stub('usage') },
			'./components/help/FAQ.vue': { __esModule: true, default: stub('faq') },
			'./components/FilterSettings.vue': { __esModule: true, default: stub('filter-settings') },
			'@/tools/api': {
				fetchDuplicates: async status => ({
					entities: status === 'acknowledged' ? [] : buildSampleCadDuplicates(),
					pagination: { currentPage: 1, totalPages: 1 },
				}),
				fetchProjects: async () => [],
				fetchScanStatus: async () => ({ isRunning: false, scannedFiles: 0, totalFiles: 0, percentage: 0 }),
				startUserScan: async () => ({}),
				notifyScanStarted: () => {},
				notifyScanCompleted: () => {},
				notifyScanFailed: () => {},
				fetchEmptyFolders: async () => [],
				deleteEmptyFolders: async () => ({ deleted: [] }),
			},
			'@/tools/utils': utils,
			'@/tools/keyboardShortcuts': keyboardShortcuts,
			'@/tools/reclamationHistory': reclamationHistory,
			'vue-material-design-icons/Folder': stub('icon-folder'),
			'vue-material-design-icons/FolderRemove': stub('icon-folder-remove'),
			'vue-material-design-icons/FolderMultiple': stub('icon-folder-multiple'),
			'vue-material-design-icons/Delete': stub('icon-delete'),
			'vue-material-design-icons/FilterOutline': stub('icon-filter-outline'),
		})

		const vm = new Vue({ render: h => h(App) }).$mount()
		await settle()

		const topbarBtn = vm.$el.querySelector('.topbar-cad-vault-button')
		assert.ok(topbarBtn, 'Topbar CAD & EDA button must exist')

		const action = keyboardShortcuts.resolveShortcutAction({ key: '{', shiftKey: true, target: vm.$el })
		assert.equal(action, 'toggle-cad-vault-auditor')

		topbarBtn.click()
		await settle()
		assert.ok(vm.$el.querySelector('.cad-vault-workbench'), 'CadVaultWorkbench must mount on click')

		window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '{', shiftKey: true, bubbles: true }))
		await settle()
		assert.equal(vm.$el.querySelector('.cad-vault-workbench'), null, 'CadVaultWorkbench must toggle closed on { shortcut')

		vm.$destroy()
	})

	test('keeps zero U+2013/U+2014 typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/cadVaultAuditor.js',
			'src/components/CadVaultWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
		]
		for (const relPath of files) {
			const content = readFileSync(resolve(__dirname, '../..', relPath), 'utf8')
			assert.equal(content.includes('\u2013'), false, `Unexpected U+2013 in ${relPath}`)
			assert.equal(content.includes('\u2014'), false, `Unexpected U+2014 in ${relPath}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `Unexpected XSS sink in ${relPath}`)
		}
		const vueContent = readFileSync(resolve(__dirname, '../..', 'src/components/CadVaultWorkbench.vue'), 'utf8')
		assert.ok(vueContent.includes('min-block-size: 44px'))
		assert.ok(vueContent.includes(':focus-visible'))
	})
})
