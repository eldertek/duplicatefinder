const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle } = require('./helpers.cjs')

function loadJunkModules() {
	const duplicateStats = loadModule('src/tools/duplicateStats.js', {})
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js', {})
	const junkPairInspector = loadModule('src/tools/junkPairInspector.js', {
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
	return {
		duplicateStats,
		duplicateSelectionAndExport,
		junkPairInspector,
	}
}

function loadJunkWorkbench(apiMock = {}) {
	const { junkPairInspector } = loadJunkModules()
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js', {})
	return loadComponent('src/components/JunkPairInspectorWorkbench.vue', {
		'../tools/api': {
			deleteFiles: apiMock.deleteFiles || (async () => ({ deleted: [], failed: [] })),
		},
		'../tools/clipboardHelper': clipboardHelper,
		'../tools/junkPairInspector': junkPairInspector,
	})
}

function makeSampleDuplicates() {
	const appleDoubleMagic = Uint8Array.from([0x00, 0x05, 0x16, 0x07, 0x00, 0x02, 0x00, 0x00])
	return [
		{
			id: 901,
			hash: 'aaa111222333',
			size: 4096,
			files: [
				{
					id: 9001,
					path: '/alice/files/Projects/Budget2026.pdf',
					size: 120000,
					mtime: 1730000000000,
				},
				{
					id: 9002,
					path: '/alice/files/Projects/Budget2026.pdf.ocTransferId42.part',
					size: 4096,
					mtime: 1730000005000,
				},
				{
					id: 9003,
					path: '/alice/files/Projects/._Budget2026.pdf',
					size: 4096,
					mtime: 1730000010000,
					inlineBuffer: appleDoubleMagic,
				},
			],
		},
		{
			id: 902,
			hash: 'bbb111222333',
			size: 65536,
			files: [
				{
					id: 9004,
					path: '/bob/files/Imports/ArchiveUnfinished.zip.crdownload',
					size: 65536,
					mtime: 1730000100000,
				},
				{
					id: 9005,
					path: '/bob/files/Media/._OrphanedScan.jpg',
					size: 4096,
					mtime: 1730000110000,
				},
			],
		},
		{
			id: 903,
			hash: 'ccc111222333',
			size: 0,
			files: [
				{
					id: 9006,
					path: '/alice/files/Templates/.gitkeep',
					size: 0,
					mtime: 1730000200000,
				},
				{
					id: 9007,
					path: '/alice/files/Staging/empty-dup.txt',
					size: 0,
					mtime: 1730000210000,
				},
				{
					id: 9008,
					path: '/alice/files/Archive/empty-dup.txt',
					size: 0,
					mtime: 1730000220000,
				},
			],
		},
		{
			id: 904,
			hash: 'ddd111222333',
			size: 6144,
			files: [
				{
					id: 9009,
					path: '/carol/files/Shared/.DS_Store',
					size: 6144,
					mtime: 1730000300000,
				},
				{
					id: 9010,
					path: '/carol/files/OriginVault/.DS_Store',
					size: 6144,
					mtime: 1730000310000,
					isOriginFolder: true,
				},
				{
					id: 9011,
					path: '/carol/files/LockedShare/Thumbs.db',
					size: 6144,
					mtime: 1730000320000,
					isLocked: true,
				},
			],
		},
	]
}

test('Cycle 149: Zero-Byte, Truncated Partial & AppleDouble Junk Pair Inspector', async t => {
	await t.test('classifyJunkBasename and hasAppleDoubleMagic distinguish markers, partials, AppleDouble forks, OS clutter, and zero-byte files', () => {
		const { junkPairInspector } = loadJunkModules()
		const magicBuf = Uint8Array.from([0x00, 0x05, 0x16, 0x07, 0x00, 0x02, 0x00, 0x00])

		assert.equal(junkPairInspector.hasAppleDoubleMagic(magicBuf), true)
		assert.equal(junkPairInspector.hasAppleDoubleMagic(Uint8Array.from([0x89, 0x50, 0x4E, 0x47])), false)

		const gitkeep = junkPairInspector.classifyJunkBasename('.gitkeep', { size: 0 })
		assert.equal(gitkeep.junkKind, 'intentional-marker')
		assert.equal(gitkeep.category, 'intentional-marker')

		const initPy = junkPairInspector.classifyJunkBasename('__init__.py', { size: 0 })
		assert.equal(initPy.junkKind, 'intentional-marker')

		const appleDouble = junkPairInspector.classifyJunkBasename('._Invoice.pdf', {
			size: 4096,
			inlineBuffer: magicBuf,
		})
		assert.equal(appleDouble.junkKind, 'appledouble-fork')
		assert.equal(appleDouble.expectedCompanion, 'Invoice.pdf')
		assert.equal(appleDouble.appleMagic, true)

		const ocPartial = junkPairInspector.classifyJunkBasename('Backup.tar.gz.ocTransferId8812.part', { size: 1024 })
		assert.equal(ocPartial.junkKind, 'nextcloud-chunk-partial')
		assert.equal(ocPartial.expectedCompanion, 'Backup.tar.gz')

		const crPartial = junkPairInspector.classifyJunkBasename('Deck.pptx.crdownload', { size: 512 })
		assert.equal(crPartial.junkKind, 'partial-upload-fragment')
		assert.equal(crPartial.expectedCompanion, 'Deck.pptx')

		const dsStore = junkPairInspector.classifyJunkBasename('.DS_Store', { size: 6144 })
		assert.equal(dsStore.junkKind, 'os-metadata-cache')

		const officeLock = junkPairInspector.classifyJunkBasename('~$Contract.docx', { size: 162 })
		assert.equal(officeLock.junkKind, 'office-lockfile')
		assert.equal(officeLock.expectedCompanion, 'Contract.docx')

		const libreLock = junkPairInspector.classifyJunkBasename('.~lock.Budget.ods#', { size: 96 })
		assert.equal(libreLock.junkKind, 'office-lockfile')
		assert.equal(libreLock.expectedCompanion, 'Budget.ods')

		const zeroAccidental = junkPairInspector.classifyJunkBasename('broken-export.csv', { size: 0 })
		assert.equal(zeroAccidental.junkKind, 'zero-byte-file')
		assert.equal(zeroAccidental.category, 'zero-byte')
	})

	await t.test('analyzeJunkPairs and collectSafeJunkPurgeSelection enforce companion pairing, Origin/lock/marker guardrails, and zero-byte anchor preservation', () => {
		const { junkPairInspector } = loadJunkModules()
		const sample = makeSampleDuplicates()
		const report = junkPairInspector.analyzeJunkPairs(sample)

		assert.equal(report.schema, junkPairInspector.JUNK_PAIR_SCHEMA)
		assert.equal(report.summary.flaggedGroupCount, 4)

		// Safe purge should include:
		// 9002 (paired .part beside Budget2026.pdf), 9003 (paired ._Budget2026.pdf),
		// 9007 (redundant 0 B dup; 9008 Archive/empty-dup.txt is kept as 0 B anchor), 9009 (.DS_Store non-origin/non-locked)
		const selection = junkPairInspector.collectSafeJunkPurgeSelection(report)
		const safeIds = selection.files.map(f => f.id).sort((a, b) => a - b)
		assert.deepEqual(safeIds, [9002, 9003, 9007, 9009])

		// Quarantined/protected items must NEVER be in safe selection:
		// 9001 (healthy original), 9004 (unpaired .crdownload), 9005 (orphaned ._OrphanedScan.jpg),
		// 9006 (.gitkeep marker), 9008 (0 B anchor), 9010 (Origin .DS_Store), 9011 (locked Thumbs.db)
		for (const protectedId of [9001, 9004, 9005, 9006, 9008, 9010, 9011]) {
			assert.ok(!safeIds.includes(protectedId), `Protected file ${protectedId} must not be selected`)
		}
		assert.equal(report.summary.quarantineCount, 2)
		assert.equal(report.summary.intentionalMarkerCount, 1)
	})

	await t.test('export builders produce DRY_RUN=1 POSIX/OCC purge scripts, CWE-1236-safe CSV, and JSON audit certificate', () => {
		const { junkPairInspector } = loadJunkModules()
		const groups = [
			{
				id: 950,
				hash: 'fff000',
				size: 2048,
				files: [
					{ id: 9501, path: '=CMD("calc")/Report.pdf', size: 8192 },
					{ id: 9502, path: '=CMD("calc")/Report.pdf.part', size: 2048 },
					{ id: 9503, path: '/alice/files/Unpaired/Missing.zip.part', size: 4096 },
				],
			},
		]
		const report = junkPairInspector.analyzeJunkPairs(groups)

		const script = junkPairInspector.buildJunkSafePurgeScript(report, {
			dataRoot: '/srv/nextcloud/data',
		})
		assert.ok(script.includes('DRY_RUN="$' + '{DRY_RUN:-1}"'))
		assert.ok(script.includes('Report.pdf.part'))
		assert.ok(!script.includes('Missing.zip.part'), 'Unpaired partial must not appear in safe purge script')
		assert.ok(script.includes('php occ files:scan'))

		const csv = junkPairInspector.buildJunkQuarantineCsv(report)
		assert.ok(csv.includes('"\'=CMD(""calc"")/Report.pdf.part"'))
		assert.ok(!csv.includes(',=CMD'))

		const json = JSON.parse(junkPairInspector.buildJunkPairJsonReport(report, '2026-11-24T00:00:00.000Z'))
		assert.equal(json.schema, junkPairInspector.JUNK_PAIR_SCHEMA)
		assert.equal(json.groups.length, 1)
		assert.equal(json.groups[0].findings.length, 2)
	})

	await t.test('JunkPairInspectorWorkbench.vue renders empty, populated, unclamped numeric filter, XSS defense, and safe purge dialog', async () => {
		const deletedPayloads = []
		const completedEvents = []
		const Workbench = loadJunkWorkbench({
			deleteFiles: async files => {
				deletedPayloads.push(files)
				return { deleted: files.map(f => f.id), failed: [] }
			},
		})

		const emptyVm = new Vue({
			render(h) {
				return h(Workbench, {
					props: { duplicates: [], allDuplicates: [] },
				})
			},
		}).$mount()
		await settle()
		assert.ok(emptyVm.$el.textContent.includes('No duplicate groups loaded yet'))
		emptyVm.$destroy()

		const sample = makeSampleDuplicates()
		sample[0].files[1].path = '/alice/files/Projects/<img src=x onerror=alert(1)>.pdf.ocTransferId42.part'
		const vm = new Vue({
			render(h) {
				return h(Workbench, {
					props: {
						duplicates: sample,
						allDuplicates: sample,
						currentDuplicateId: 901,
					},
					on: {
						'junk-pair-delete-completed': payload => completedEvents.push(payload),
					},
				})
			},
		}).$mount()
		await settle()

		const comp = vm.$children[0]
		assert.ok(vm.$el.textContent.includes('Zero-Byte, Partial & AppleDouble Junk Pair Inspector'))
		assert.equal(vm.$el.querySelectorAll('img[src="x"]').length, 0)

		// Unclamped controlled numeric input check
		comp.minSizeKbInput = '999999'
		await settle()
		assert.equal(comp.minSizeKbInput, '999999')
		assert.ok(vm.$el.textContent.includes('No junk pairs or zero-byte fragments match the active filters.'))
		comp.minSizeKbInput = ''
		await settle()

		// Trigger batch safe purge dialog
		const globalDelBtn = vm.$el.querySelector('.jpw__global-bar button.jpw__primary-btn.is-danger')
		assert.ok(globalDelBtn, 'Global safe purge button must be visible')
		globalDelBtn.click()
		await settle()

		const confirmBtn = vm.$el.querySelector('.jpw__dialog button.jpw__primary-btn.is-danger')
		assert.ok(confirmBtn, 'Dialog confirm button must exist')
		confirmBtn.click()
		await settle()

		assert.equal(deletedPayloads.length, 1)
		const deletedIds = deletedPayloads[0].map(f => f.id).sort((a, b) => a - b)
		assert.ok(!deletedIds.includes(9001))
		assert.ok(!deletedIds.includes(9004))
		assert.ok(!deletedIds.includes(9005))
		assert.ok(!deletedIds.includes(9006))
		assert.ok(!deletedIds.includes(9010))
		assert.ok(!deletedIds.includes(9011))
		assert.equal(completedEvents.length, 1)
		assert.equal(completedEvents[0].source, 'junk-pair-inspector')

		vm.$destroy()
	})

	await t.test('App.vue + keyboardShortcuts wire ~ shortcut, topbar Junk Pairs button, and workbench toggle', async () => {
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		const reclamationHistory = loadModule('src/tools/reclamationHistory.js', {
			'./duplicateStats': loadModule('src/tools/duplicateStats.js'),
			'./duplicateFilters': loadModule('src/tools/duplicateFilters.js'),
		})
		assert.equal(
			keyboardShortcuts.resolveShortcutAction({ key: '~', shiftKey: true }),
			'toggle-junk-pair-inspector'
		)
		assert.equal(
			keyboardShortcuts.resolveShortcutAction({ key: '~', target: { tagName: 'INPUT' } }),
			null
		)
		assert.ok(
			keyboardShortcuts.SHORTCUT_DEFINITIONS.some(def => def.id === 'toggle-junk-pair-inspector' && def.keys.includes('~'))
		)

		const stub = name => ({ render(h) { return h('div', { class: `stub-${name}` }) } })
		const slotStub = tag => ({ render(h) { return h(tag, this.$slots.default) } })

		const App = loadComponent('src/App.vue', {
			'@nextcloud/vue': {
				NcAppContent: slotStub('div'),
				NcContent: slotStub('div'),
				NcLoadingIcon: stub('loading'),
				NcButton: slotStub('button'),
				NcModal: stub('modal'),
				NcAppSettingsDialog: slotStub('div'),
				NcAppSettingsSection: slotStub('div'),
			},
			'./components/DuplicateNavigation.vue': { __esModule: true, default: stub('nav') },
			'./components/DuplicateDetails.vue': { __esModule: true, default: stub('details') },
			'./components/DuplicateTreemap.vue': { __esModule: true, default: stub('treemap') },
			'./components/SpaceReclamationTimeline.vue': { __esModule: true, default: stub('history') },
			'./components/SimilarityInspector.vue': { __esModule: true, default: stub('similarity') },
			'./components/BatchAutoSelectWorkbench.vue': { __esModule: true, default: stub('batch') },
			'./components/FileHygieneInspector.vue': { __esModule: true, default: stub('hygiene') },
			'./components/LinkDeduplicationSimulator.vue': { __esModule: true, default: stub('link-sim') },
			'./components/FolderPairMatrix.vue': { __esModule: true, default: stub('folder-matrix') },
			'./components/StorageFootprintAnalyzer.vue': { __esModule: true, default: stub('footprint') },
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
			'./components/OriginFoldersSettings.vue': { __esModule: true, default: stub('origin') },
			'./components/ExcludedFoldersSettings.vue': { __esModule: true, default: stub('excluded') },
			'./components/BulkDeletionSettings.vue': { __esModule: true, default: stub('bulk') },
			'./components/FilterSettings.vue': { __esModule: true, default: stub('filter-settings') },
			'./components/ProjectsSettings.vue': { __esModule: true, default: stub('projects') },
			'./components/ProjectDuplicates.vue': { __esModule: true, default: stub('proj-dups') },
			'./components/help/OnboardingGuide.vue': { __esModule: true, default: stub('onboarding') },
			'./components/help/UsageExamples.vue': { __esModule: true, default: stub('usage') },
			'./components/help/FAQ.vue': { __esModule: true, default: stub('faq') },
			'vue-material-design-icons/Folder': stub('icon-folder'),
			'vue-material-design-icons/FolderRemove': stub('icon-folder-remove'),
			'vue-material-design-icons/FolderMultiple': stub('icon-folder-multiple'),
			'vue-material-design-icons/Delete': stub('icon-delete'),
			'vue-material-design-icons/FilterOutline': stub('icon-filter'),
			'@/tools/api': {
				fetchDuplicates: async () => ({ entities: [], pagination: { currentPage: 1, totalPages: 1 } }),
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
		})

		const vm = new Vue({
			render: h => h(App),
		}).$mount()
		await settle()

		const appComp = vm.$children[0]
		const btn = vm.$el.querySelector('button.topbar-junk-pair-button')
		assert.ok(btn, 'Topbar Junk Pairs button must render in details view')
		assert.equal(btn.getAttribute('aria-keyshortcuts'), '~')
		assert.equal(appComp.junkPairInspectorOpen, false)

		btn.click()
		await settle()
		assert.equal(appComp.junkPairInspectorOpen, true)
		assert.ok(vm.$el.querySelector('.stub-junk-pair'))

		appComp.handleGlobalKeydown({
			key: '~',
			shiftKey: true,
			ctrlKey: false,
			metaKey: false,
			altKey: false,
			target: vm.$el,
			preventDefault: () => {},
		})
		await settle()
		assert.equal(appComp.junkPairInspectorOpen, false)

		vm.$destroy()
	})

	await t.test('Cycle 149 touched files preserve zero U+2013/U+2014 dashes, zero XSS sinks, logical CSS, and >= 44px targets', () => {
		const files = [
			'src/tools/junkPairInspector.js',
			'src/components/JunkPairInspectorWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
		]
		const xssPattern = new RegExp(['v-html', 'innerHTML', 'outerHTML', 'document\\.write'].join('|'))
		for (const rel of files) {
			const content = readFileSync(resolve(__dirname, '../..', rel), 'utf8')
			assert.ok(!content.includes('\u2013'), `Zero U+2013 in ${rel}`)
			assert.ok(!content.includes('\u2014'), `Zero U+2014 in ${rel}`)
			assert.equal(xssPattern.test(content), false, `Zero XSS sinks in ${rel}`)
		}
		const testFiles = [
			'tests/frontend/junk-pair-inspector.test.cjs',
			'tests/frontend/forensic-checksum-verifier.test.cjs',
		]
		for (const rel of testFiles) {
			const content = readFileSync(resolve(__dirname, '../..', rel), 'utf8')
			assert.ok(!content.includes('\u2013'), `Zero U+2013 in ${rel}`)
			assert.ok(!content.includes('\u2014'), `Zero U+2014 in ${rel}`)
		}
		const vueContent = readFileSync(resolve(__dirname, '../..', 'src/components/JunkPairInspectorWorkbench.vue'), 'utf8')
		assert.ok(vueContent.includes('min-block-size: 44px'))
		assert.ok(vueContent.includes(':focus-visible'))
		assert.ok(vueContent.includes('minmax(0, 1fr)'))
	})
})
