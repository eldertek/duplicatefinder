const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window } = require('./helpers.cjs')

function loadWorkbookDriftModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/workbookDriftAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function loadWorkbookDriftWorkbench(clipboardImpl) {
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js')
	const workbookDriftAuditor = loadWorkbookDriftModule()
	return loadComponent('src/components/WorkbookDriftWorkbench.vue', {
		'../tools/clipboardHelper': clipboardImpl === undefined
			? clipboardHelper
			: { copyTextSafely: text => clipboardHelper.copyTextSafely(text, clipboardImpl) },
		'../tools/workbookDriftAuditor': workbookDriftAuditor,
	})
}

function buildSampleWorkbookDuplicates() {
	const kib = 1024
	const mib = 1024 * 1024
	const refSec = 1796000000
	return [
		{
			id: 6101,
			hash: 'sha256-q4-consolidation-xlsx',
			size: 18 * mib,
			acknowledged: false,
			files: [
				{
					id: 61011,
					path: '/__groupfolders/10/Finance/Closing_2025/Q4_2025_Consolidation_FINAL_v2.xlsx',
					size: 18 * mib,
					mtime: refSec - 5 * 86400,
				},
				{
					id: 61012,
					path: '/alice/files/Downloads/Copy of Q4_2025_Consolidation_FINAL_v2.xlsx',
					size: 18 * mib,
					mtime: refSec - 45 * 86400,
				},
				{
					id: 61013,
					path: '/finance/audit/Q4_2025_Consolidation_FINAL_v2.xlsx',
					size: 18 * mib,
					mtime: refSec - 7 * 86400,
				},
			],
		},
		{
			id: 6102,
			hash: 'sha256-treasury-macro-xlsm',
			size: 6 * mib,
			acknowledged: false,
			files: [
				{
					id: 61021,
					path: '/treasury/models/FY2026_Cashflow_Macro.xlsm',
					size: 6 * mib,
					mtime: refSec - 10 * 86400,
				},
				{
					id: 61022,
					path: '/bob/files/Desktop/FY2026_Cashflow_Macro_draft.xlsm',
					size: 6 * mib,
					mtime: refSec - 40 * 86400,
				},
			],
		},
		{
			id: 6103,
			hash: 'sha256-revenue-pbix',
			size: 84 * mib,
			acknowledged: false,
			files: [
				{
					id: 61031,
					path: '/bi/powerbi/FY2025_Revenue_Cube.pbix',
					size: 84 * mib,
					mtime: refSec - 8 * 86400,
				},
				{
					id: 61032,
					path: '/carol/files/Downloads/FY2025_Revenue_Cube (1).pbix',
					size: 84 * mib,
					mtime: refSec - 25 * 86400,
				},
			],
		},
		{
			id: 6104,
			hash: 'sha256-ledger-parquet',
			size: 512 * kib,
			acknowledged: false,
			files: [
				{
					id: 61041,
					path: '/__groupfolders/10/Accounting/2026-03_GL_Journal.parquet',
					size: 512 * kib,
					mtime: refSec - 4 * 86400,
				},
				{
					id: 61042,
					path: '/dave/files/Exports/Copy of 2026-03_GL_Journal.parquet',
					size: 512 * kib,
					mtime: refSec - 20 * 86400,
				},
			],
		},
		{
			id: 6105,
			hash: 'sha256-non-workbook-photo',
			size: 4 * mib,
			acknowledged: false,
			files: [
				{
					id: 61051,
					path: '/alice/files/Photos/receipt_scan.jpg',
					size: 4 * mib,
					mtime: refSec - 10 * 86400,
				},
				{
					id: 61052,
					path: '/alice/files/Backup/receipt_scan.jpg',
					size: 4 * mib,
					mtime: refSec - 10 * 86400,
				},
			],
		},
	]
}

describe('Cycle 162: Spreadsheet, BI Report & Financial Workbook Version-Drift Auditor Workbench', () => {
	test('classifies spreadsheets, macro workbooks, BI models, and Parquet/ledger exports accurately', () => {
		const mod = loadWorkbookDriftModule()

		assert.equal(mod.classifyWorkbookArtifact('/Finance/Q4_2025.xlsx').family, 'spreadsheets')
		assert.equal(mod.classifyWorkbookArtifact('/Treasury/Model.xlsm').family, 'macro-workbooks')
		assert.equal(mod.classifyWorkbookArtifact('/Treasury/Model.xlsm').isMacroEnabled, true)
		assert.equal(mod.classifyWorkbookArtifact('/BI/Exec.pbix').family, 'bi-reports')
		assert.equal(mod.classifyWorkbookArtifact('/BI/Exec.twbx').family, 'bi-reports')
		assert.equal(mod.classifyWorkbookArtifact('/Accounting/Ledger.parquet').family, 'columnar-exports')
		assert.equal(mod.classifyWorkbookArtifact('/Accounting/Bank.ofx').family, 'columnar-exports')
		assert.equal(mod.classifyWorkbookArtifact('/Photos/img.jpg'), null)

		assert.equal(mod.extractFiscalPeriod('/Finance/Q4_2025_Consolidation.xlsx'), '2025-Q4')
		assert.equal(mod.extractFiscalPeriod('/Finance/FY2026_Budget.xlsm'), 'FY2026')
		assert.equal(mod.extractFiscalPeriod('/Accounting/2026-03_GL.parquet'), '2026-03')

		const driftCopy = mod.inspectWorkbookVersionDrift('Copy of Q4_2025_Consolidation_FINAL_v2.xlsx')
		assert.equal(driftCopy.isCopyFork, true)
		assert.equal(driftCopy.isFinalDrift, true)
		assert.equal(driftCopy.versionTag, 'FINAL v2')

		const draftDrift = mod.inspectWorkbookVersionDrift('Copie de Budget_brouillon.xlsx')
		assert.equal(draftDrift.isCopyFork, true)
		assert.equal(draftDrift.isWorkingDraft, true)
	})

	test('shields Finance vaults, macro workbooks, and BI masters while reclaiming stale drift copies', () => {
		const mod = loadWorkbookDriftModule()
		const sample = buildSampleWorkbookDuplicates()

		const analysis = mod.analyzeWorkbookDriftDuplicates(sample, {
			referenceTimeSec: 1796000000,
			protectFinanceVaults: true,
			protectMacroWorkbooks: true,
			protectBiModels: true,
		})

		assert.equal(analysis.summary.totalClustersCount, 4)
		assert.equal(analysis.summary.familyCounts.spreadsheets, 1)
		assert.equal(analysis.summary.familyCounts['macro-workbooks'], 1)
		assert.equal(analysis.summary.familyCounts['bi-reports'], 1)
		assert.equal(analysis.summary.familyCounts['columnar-exports'], 1)

		const xlsxCluster = analysis.clusters.find(c => c.primaryGroupId === 6101)
		assert.ok(xlsxCluster)
		assert.equal(xlsxCluster.fiscalSummary, '2025-Q4')
		assert.equal(xlsxCluster.hasFinanceVaultCopy, true)
		const aliceXlsx = xlsxCluster.members.find(m => m.normalizedPath.includes('/Downloads/'))
		const auditXlsx = xlsxCluster.members.find(m => m.normalizedPath.includes('/finance/audit/'))
		assert.equal(aliceXlsx.actionKind, 'reclaim')
		assert.equal(auditXlsx.verdict, 'blocked-finance-vault')
		assert.equal(auditXlsx.actionKind, 'shield')

		const macroCluster = analysis.clusters.find(c => c.primaryGroupId === 6102)
		assert.ok(macroCluster)
		const bobMacro = macroCluster.members.find(m => m.normalizedPath.includes('/Desktop/'))
		assert.equal(bobMacro.verdict, 'blocked-macro-workbook')
		assert.equal(bobMacro.actionKind, 'shield')

		const unguardedMacro = mod.analyzeWorkbookDriftDuplicates(sample, {
			referenceTimeSec: 1796000000,
			protectFinanceVaults: true,
			protectMacroWorkbooks: false,
			protectBiModels: true,
		})
		const unguardedBobMacro = unguardedMacro.clusters.find(c => c.primaryGroupId === 6102).members.find(m => m.normalizedPath.includes('/Desktop/'))
		assert.equal(unguardedBobMacro.actionKind, 'reclaim')
	})

	test('supports hardlink-vault strategy, CWE-1236 CSV protection, POSIX quoting, and JSON schema', () => {
		const mod = loadWorkbookDriftModule()
		const refSec = 1796000000
		const payloadGroup = [
			{
				id: 6201,
				hash: 'sha256-cwe1236-workbook',
				size: 2048 * 1024,
				files: [
					{
						id: 62011,
						path: '/__groupfolders/10/Finance/=cmd|\'calc.exe\'!A0_Budget \'26\'.xlsx',
						size: 2048 * 1024,
						mtime: refSec - 5 * 86400,
					},
					{
						id: 62012,
						path: '/eve/files/Downloads/=cmd|\'calc.exe\'!A0_Budget \'26\'.xlsx',
						size: 2048 * 1024,
						mtime: refSec - 40 * 86400,
					},
				],
			},
		]

		const hardlinkAnalysis = mod.analyzeWorkbookDriftDuplicates(payloadGroup, {
			strategy: 'hardlink-vault',
			referenceTimeSec: refSec,
		})

		const script = mod.buildWorkbookDriftScript(hardlinkAnalysis, { dataRoot: '/var/nc/data' })
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes('VERIFY_SHA256="${VERIFY_SHA256:-1}"'))
		assert.ok(script.includes('hardlink_workbook_mirror'))
		assert.ok(script.includes("'\\''"))
		assert.ok(script.includes('occ files:scan --path='))

		const excludeSnippet = mod.buildWorkbookSyncExcludeSnippet(hardlinkAnalysis)
		assert.ok(excludeSnippet.includes('~$*.xlsx'))
		assert.ok(excludeSnippet.includes('*.pbix.tmp'))

		const csv = mod.buildWorkbookDriftCsvReport(hardlinkAnalysis)
		assert.ok(csv.includes('"\'=cmd|'), 'CWE-1236 formula payload must be single-quote neutralized in CSV')

		const json = JSON.parse(mod.buildWorkbookDriftJsonReport(hardlinkAnalysis, '2026-11-24T05:00:00.000Z'))
		assert.equal(json.schema, mod.WORKBOOK_DRIFT_SCHEMA)
		assert.equal(json.clusters.length, 1)
	})

	test('WorkbookDriftWorkbench.vue handles empty state, presets, unclamped numeric inputs, overrides, and clipboard', async () => {
		const Workbench = loadWorkbookDriftWorkbench({ writeText: async () => true })

		const emptyVm = new Vue({
			render(h) {
				return h(Workbench, {
					props: { duplicates: [], allDuplicates: [] },
				})
			},
		}).$mount()
		await settle()
		assert.ok(emptyVm.$el.querySelector('.wdw__empty-banner'))
		emptyVm.$destroy()

		const sample = buildSampleWorkbookDuplicates()
		const emitted = []
		const vm = new Vue({
			render(h) {
				return h(Workbench, {
					props: {
						duplicates: sample,
						allDuplicates: sample,
						currentDuplicateId: 6101,
					},
					on: {
						'select-duplicate': d => emitted.push(['select', d.id]),
						'compare-duplicate': d => emitted.push(['compare', d.id]),
					},
				})
			},
		}).$mount()
		await settle()

		assert.equal(vm.$el.querySelectorAll('.wdw__cluster-item').length, 4)

		const numInputs = vm.$el.querySelectorAll('.wdw__num-input')
		assert.equal(numInputs.length, 2)
		numInputs[0].value = ''
		numInputs[0].dispatchEvent(new window.Event('input'))
		await settle()
		assert.equal(numInputs[0].value, '', 'Numeric input must not clamp or reset mid-keystroke')

		const presetBtns = vm.$el.querySelectorAll('.wdw__control-row .wdw__seg-btn')
		const macroPresetBtn = Array.from(presetBtns).find(b => b.textContent.includes('Macro & VBA'))
		assert.ok(macroPresetBtn)
		macroPresetBtn.click()
		await settle()
		assert.equal(vm.$el.querySelectorAll('.wdw__cluster-item').length, 1)

		const allPresetBtn = Array.from(presetBtns).find(b => b.textContent.includes('All Workbooks & BI Audit'))
		allPresetBtn.click()
		await settle()
		assert.equal(vm.$el.querySelectorAll('.wdw__cluster-item').length, 4)

		const shieldBtn = Array.from(vm.$el.querySelectorAll('.wdw__override-bar button')).find(b => b.textContent.includes('Shield Copy'))
		assert.ok(shieldBtn)
		shieldBtn.click()
		await settle()
		assert.ok(shieldBtn.classList.contains('is-active'))

		const copyBtn = Array.from(vm.$el.querySelectorAll('.wdw__toolbar-actions button')).find(b => b.textContent.includes('Copy DRY_RUN=1 Script'))
		copyBtn.click()
		await settle()
		assert.ok(vm.$el.querySelector('.wdw__notice.is-success'))

		const focusBtn = Array.from(vm.$el.querySelectorAll('.wdw__inspector-actions button')).find(b => b.textContent.includes('Focus Group'))
		focusBtn.click()
		await settle()
		assert.deepEqual(emitted[0], ['select', 6101])

		vm.$destroy()
	})

	test('App.vue wires > keyboard shortcut and topbar Workbooks & BI button cleanly', async () => {
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
		const WorkbookWorkbench = loadWorkbookDriftWorkbench({ writeText: async () => true })

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
			'./components/WorkbookDriftWorkbench.vue': { __esModule: true, default: WorkbookWorkbench },
			'./components/MailboxArchiveWorkbench.vue': { __esModule: true, default: stub('mailbox-archive-auditor') },
			'./components/CadVaultWorkbench.vue': { __esModule: true, default: stub('cad-vault-auditor') },
			'./components/WebBuildMediaWorkbench.vue': { __esModule: true, default: stub('web-build-media-auditor') },
			'./components/LegalDocumentOcrWorkbench.vue': { __esModule: true, default: stub('legal-document-ocr-auditor') },
			'./components/BackupTakeoutWorkbench.vue': { __esModule: true, default: stub('backup-takeout-auditor') },
			'./components/DawAudioStemWorkbench.vue': { __esModule: true, default: stub('daw-audio-stem-auditor') },
			'./components/VfxRenderCacheWorkbench.vue': { __esModule: true, default: stub('vfx-render-cache-auditor') },
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
					entities: status === 'acknowledged' ? [] : buildSampleWorkbookDuplicates(),
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

		const topbarBtn = vm.$el.querySelector('.topbar-workbook-drift-button')
		assert.ok(topbarBtn, 'Topbar Workbooks & BI button must exist')

		const action = keyboardShortcuts.resolveShortcutAction({ key: '>', shiftKey: true, target: vm.$el })
		assert.equal(action, 'toggle-workbook-drift-auditor')

		topbarBtn.click()
		await settle()
		assert.ok(vm.$el.querySelector('.workbook-drift-workbench'), 'WorkbookDriftWorkbench must mount on click')

		window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '>', shiftKey: true, bubbles: true }))
		await settle()
		assert.equal(vm.$el.querySelector('.workbook-drift-workbench'), null, 'WorkbookDriftWorkbench must toggle closed on > shortcut')

		vm.$destroy()
	})

	test('keeps zero U+2013/U+2014 typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/workbookDriftAuditor.js',
			'src/components/WorkbookDriftWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
		]
		for (const relPath of files) {
			const content = readFileSync(resolve(__dirname, '../..', relPath), 'utf8')
			assert.equal(content.includes('\u2013'), false, `Unexpected U+2013 in ${relPath}`)
			assert.equal(content.includes('\u2014'), false, `Unexpected U+2014 in ${relPath}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `Unexpected XSS sink in ${relPath}`)
		}
		const vueContent = readFileSync(resolve(__dirname, '../..', 'src/components/WorkbookDriftWorkbench.vue'), 'utf8')
		assert.ok(vueContent.includes('min-block-size: 44px'))
		assert.ok(vueContent.includes(':focus-visible'))
	})
})
