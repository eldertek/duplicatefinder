const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle } = require('./helpers.cjs')

function loadCdcModules() {
	const duplicateStats = loadModule('src/tools/duplicateStats.js', {})
	const duplicateFilters = loadModule('src/tools/duplicateFilters.js', {})
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js', {})
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js', {})
	const cdcChunkingEstimator = loadModule('src/tools/cdcChunkingEstimator.js', {
		'./duplicateFilters': duplicateFilters,
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
	return {
		duplicateStats,
		duplicateFilters,
		duplicatePathDiff,
		duplicateSelectionAndExport,
		cdcChunkingEstimator,
	}
}

function loadCdcWorkbench() {
	const { cdcChunkingEstimator, duplicateStats } = loadCdcModules()
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js', {})
	return loadComponent('src/components/CdcChunkingWorkbench.vue', {
		'../tools/clipboardHelper': clipboardHelper,
		'../tools/duplicateStats': duplicateStats,
		'../tools/cdcChunkingEstimator': cdcChunkingEstimator,
	})
}

function buildSampleCdcDuplicates() {
	return [
		{
			id: 201,
			hash: 'vm-snap-1',
			size: 4 * 1024 * 1024 * 1024,
			files: [
				{
					id: 2001,
					path: '/alice/files/VMs/debian12-app-2026-11-20.qcow2',
					size: 4 * 1024 * 1024 * 1024,
					mtime: 1732000000000,
				},
			],
		},
		{
			id: 202,
			hash: 'vm-snap-2',
			size: 4294967296 + 64 * 1024 * 1024,
			files: [
				{
					id: 2002,
					path: '/alice/files/VMs/debian12-app-2026-11-24.qcow2',
					size: 4294967296 + 64 * 1024 * 1024,
					mtime: 1732300000000,
				},
			],
		},
		{
			id: 203,
			hash: 'db-dump-1',
			size: 512 * 1024 * 1024,
			files: [
				{
					id: 2003,
					path: '/ops/files/Databases/nextcloud-core-v1.sqlite',
					size: 512 * 1024 * 1024,
					mtime: 1732100000000,
				},
			],
		},
		{
			id: 204,
			hash: 'db-dump-2',
			size: 520 * 1024 * 1024,
			files: [
				{
					id: 2004,
					path: '/ops/files/Databases/nextcloud-core-v2.sqlite',
					size: 520 * 1024 * 1024,
					mtime: 1732400000000,
				},
			],
		},
		{
			id: 205,
			hash: 'trap-gz-1',
			size: 256 * 1024 * 1024,
			files: [
				{
					id: 2005,
					path: '/ops/files/Backups/mailspool-2026-11-20.tar.gz',
					size: 256 * 1024 * 1024,
					mtime: 1732050000000,
				},
			],
		},
		{
			id: 206,
			hash: 'trap-gz-2',
			size: 257 * 1024 * 1024,
			files: [
				{
					id: 2006,
					path: '/ops/files/Backups/mailspool-2026-11-24.tar.gz',
					size: 257 * 1024 * 1024,
					mtime: 1732350000000,
				},
			],
		},
		{
			id: 207,
			hash: 'exact-iso-sha256',
			size: 1200 * 1024 * 1024,
			files: [
				{
					id: 2007,
					path: '/alice/files/ISOs/ubuntu-24.04-live-server.iso',
					size: 1200 * 1024 * 1024,
					hash: 'exact-iso-sha256',
					mtime: 1732000000000,
				},
				{
					id: 2008,
					path: '/bob/files/Mirror/ubuntu-24.04-live-server.iso',
					size: 1200 * 1024 * 1024,
					hash: 'exact-iso-sha256',
					mtime: 1732000100000,
				},
			],
		},
	]
}

test('Cycle 151: Content-Defined Chunking (CDC) / ZFS / Restic Sub-File Savings Estimator', async (t) => {
	await t.test('pure Gear-hash FastCDC resists byte-shift boundary collapse unlike fixed-block chunking', () => {
		const { cdcChunkingEstimator } = loadCdcModules()
		const {
			buildSyntheticShiftProbe,
			chunkBytesFastCdc,
			chunkBytesFixed,
			compareFixedVsFastCdcBytes,
		} = cdcChunkingEstimator

		const probe = buildSyntheticShiftProbe({
			shiftBytes: 64,
			avgChunkBytes: 2048,
			fixedBlockBytes: 2048,
			payloadBytes: 65536,
		})

		assert.equal(probe.shiftBytes, 64)
		assert.ok(probe.fastcdc.totalChunks > 10, 'FastCDC produces multiple variable-size chunks')
		assert.ok(probe.fastcdc.zeroChunks >= 1, 'FastCDC detects zero-filled sparse chunks')
		assert.ok(
			probe.fastcdc.reusePct > probe.fixed.reusePct,
			`FastCDC reuse (${probe.fastcdc.reusePct}%) must exceed shifted fixed-block reuse (${probe.fixed.reusePct}%)`,
		)
		assert.ok(probe.cdcAdvantageBytes > 0, 'CDC advantage bytes should be strictly positive on shifted binary')

		// Direct buffer check with non-periodic pseudo-random payload
		const bufA = new Uint8Array(24576)
		let lcg = 0x2468ace1
		for (let i = 0; i < bufA.length; i++) {
			lcg = (Math.imul(lcg, 1664525) + 1013904223) >>> 0
			bufA[i] = (lcg >>> 16) & 0xff
		}
		const bufB = new Uint8Array(bufA.length + 33)
		bufB.set(bufA, 33)
		const cdcA = chunkBytesFastCdc(bufA, { avgChunkBytes: 1024 })
		const fixedA = chunkBytesFixed(bufA, 1024)
		assert.equal(fixedA.blockCount, 24)
		assert.ok(cdcA.chunkCount >= 4)
		const directCmp = compareFixedVsFastCdcBytes(
			[{ label: 'a', bytes: bufA }, { label: 'b', bytes: bufB }],
			{ avgChunkBytes: 1024, fixedBlockBytes: 1024 },
		)
		assert.ok(directCmp.fastcdc.savedBytes > directCmp.fixed.savedBytes)
	})

	await t.test('classifies workloads, clusters lineage stems, detects compressed traps, and models ZFS DDT RAM', () => {
		const { cdcChunkingEstimator } = loadCdcModules()
		const {
			buildCdcAuditCsv,
			buildCdcAuditJson,
			buildCdcSavingsReport,
			buildCdcVerificationScript,
			classifyCdcWorkload,
			extractCdcStem,
		} = cdcChunkingEstimator

		assert.equal(extractCdcStem('/VMs/debian12-app-2026-11-24.qcow2'), 'debian12-app')
		assert.equal(classifyCdcWorkload({ path: '/VMs/app.qcow2' }).workloadClass, 'vm_image')
		assert.equal(classifyCdcWorkload({ path: '/db/core.sqlite' }).workloadClass, 'sqlite_db')
		assert.equal(classifyCdcWorkload({ path: '/backups/mail.tar.gz' }).isCompressedTrap, true)
		assert.equal(classifyCdcWorkload({ path: '/backups/mail-rsyncable.tar.gz' }).isCompressedTrap, false)

		const report = buildCdcSavingsReport(buildSampleCdcDuplicates(), {
			backendId: 'restic_s3',
			avgChunkBytes: 65536,
			fixedBlockBytes: 65536,
			ddtRamBudgetGb: 16,
		})

		assert.equal(report.summary.totalClusters, 4)
		assert.ok(report.summary.cdcNetSavedBytes > report.summary.fileLevelSavedBytes)
		assert.ok(report.summary.cdcGainOverFileBytes > 0)
		assert.equal(report.summary.compressedTrapCount, 1)

		const vmCluster = report.items.find(item => item.workloadClass === 'vm_image')
		assert.ok(vmCluster, 'VM image siblings clustered by lineage stem')
		assert.equal(vmCluster.fileCount, 2)
		assert.equal(vmCluster.verdict, 'cdc-high-gain')

		const trapCluster = report.items.find(item => item.workloadClass === 'compressed_trap')
		assert.ok(trapCluster)
		assert.equal(trapCluster.verdict, 'compressed-trap')

		// Tiny DDT RAM budget triggers DDT RAM risk on ZFS backend
		const zfsReport = buildCdcSavingsReport(buildSampleCdcDuplicates(), {
			backendId: 'zfs_dedup',
			avgChunkBytes: 8192,
			fixedBlockBytes: 8192,
			ddtRamBudgetGb: 0.001,
		})
		assert.equal(zfsReport.summary.ddtBudgetExceeded, true)
		assert.ok(zfsReport.items.some(item => item.verdict === 'ddt-ram-risk'))

		const zfsScript = buildCdcVerificationScript(zfsReport, {
			zfsPool: "ncpool/data'$(id)",
		})
		assert.ok(zfsScript.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(zfsScript.includes('zdb -S "$ZFS_DATASET"'))
		assert.ok(zfsScript.includes("'\"'\"'"), 'POSIX single-quote escaping applied')

		// CWE-1236 neutralization & JSON export
		const injectedDuplicates = [
			{
				id: 999,
				hash: 'inj',
				size: 1024 * 1024,
				files: [
					{ id: 9001, path: '/=CMD|calc!A0.qcow2', size: 1024 * 1024 },
					{ id: 9002, path: '/+SUM(1,2).qcow2', size: 1024 * 1024 },
				],
			},
		]
		const injReport = buildCdcSavingsReport(injectedDuplicates)
		const csv = buildCdcAuditCsv(injReport)
		assert.ok(csv.includes("'=CMD|calc!A0.qcow2") || csv.includes("'/=CMD|calc!A0.qcow2"))
		const jsonObj = buildCdcAuditJson(injReport)
		assert.equal(jsonObj.schema, 'duplicatefinder.cdc-savings-estimator.v1')
	})

	await t.test('CdcChunkingWorkbench.vue handles empty, populated, unclamped numeric inputs, and XSS safety', async () => {
		const Workbench = loadCdcWorkbench()

		// 1. Empty state
		const emptyVm = new Vue({
			render: h => h(Workbench, { props: { duplicates: [], allDuplicates: [] } }),
		}).$mount()
		await settle()
		assert.ok(emptyVm.$el.textContent.includes('No duplicate or large-asset scan data loaded yet'))
		emptyVm.$destroy()

		// 2. Populated state with XSS probe filename
		const sample = buildSampleCdcDuplicates()
		sample[0].files[0].path = '/alice/files/VMs/<img src=x onerror=alert(1)>-2026-11-20.qcow2'
		const emitted = []
		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: sample,
					allDuplicates: sample,
					currentDuplicateId: 201,
				},
				on: {
					'select-duplicate': d => emitted.push(['select', d]),
					'compare-duplicate': d => emitted.push(['compare', d]),
				},
			}),
		}).$mount()
		await settle()

		assert.equal(vm.$el.querySelectorAll('img').length, 0, 'XSS payload must not inject <img>')
		assert.ok(vm.$el.textContent.includes('<img src=x onerror=alert(1)>'))
		assert.ok(vm.$el.textContent.includes('FastCDC Net Reclaim'))

		// Unclamped numeric inputs: typing '0' must not be overwritten mid-keystroke
		const ddtInput = vm.$el.querySelector('input[aria-label="ZFS DDT RAM budget in GiB"]')
		assert.ok(ddtInput)
		ddtInput.value = '0'
		ddtInput.dispatchEvent(new window.Event('input', { bubbles: true }))
		await settle()
		assert.equal(ddtInput.value, '0')

		// Switch backend to ZFS Dedup
		const zfsBtn = Array.from(vm.$el.querySelectorAll('button')).find(b => b.textContent.includes('ZFS Dedup'))
		assert.ok(zfsBtn)
		zfsBtn.click()
		await settle()
		assert.equal(zfsBtn.getAttribute('aria-pressed'), 'true')

		// Workload filter to Compressed Traps
		const trapBtn = Array.from(vm.$el.querySelectorAll('button')).find(b => b.textContent.includes('Compressed Traps'))
		assert.ok(trapBtn)
		trapBtn.click()
		await settle()
		assert.ok(vm.$el.textContent.includes('mailspool'))

		vm.$destroy()
	})

	await t.test('App.vue wires topbar CDC button and # keyboard shortcut cleanly', async () => {
		const { duplicateStats, duplicateFilters, cdcChunkingEstimator } = loadCdcModules()
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js', {})
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const reclamationHistory = loadModule('src/tools/reclamationHistory.js', {
			'./duplicateStats': duplicateStats,
			'./duplicateFilters': duplicateFilters,
		})
		assert.equal(keyboardShortcuts.resolveShortcutAction({ key: '#' }), 'toggle-cdc-chunking-estimator')

		const stub = name => ({ render(h) { return h('div', { class: `stub-${name}` }) } })
		const slotStub = tag => ({ render(h) { return h(tag, this.$slots.default) } })
		const CdcWorkbench = loadCdcWorkbench()
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
			'./components/CdcChunkingWorkbench.vue': { __esModule: true, default: CdcWorkbench },
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
				fetchDuplicates: async (status) => ({
					entities: status === 'acknowledged' ? [] : buildSampleCdcDuplicates(),
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
			'@/tools/cdcChunkingEstimator': cdcChunkingEstimator,
			'vue-material-design-icons/Folder': stub('icon-folder'),
			'vue-material-design-icons/FolderRemove': stub('icon-folder-remove'),
			'vue-material-design-icons/FolderMultiple': stub('icon-folder-multiple'),
			'vue-material-design-icons/Delete': stub('icon-delete'),
			'vue-material-design-icons/FilterOutline': stub('icon-filter'),
		})

		const vm = new Vue({
			render: h => h(App),
		}).$mount()
		await settle()

		const appComp = vm.$children[0]
		const topBtn = vm.$el.querySelector('button.topbar-cdc-chunking-button')
		assert.ok(topBtn, 'Topbar CDC button rendered')
		assert.equal(topBtn.getAttribute('aria-keyshortcuts'), '#')
		assert.equal(appComp.cdcChunkingOpen, false)

		appComp.handleGlobalKeydown({
			key: '#',
			shiftKey: true,
			ctrlKey: false,
			metaKey: false,
			altKey: false,
			target: vm.$el,
			preventDefault: () => {},
		})
		await settle()
		assert.equal(appComp.cdcChunkingOpen, true)
		assert.ok(vm.$el.querySelector('.cdc-chunking-workbench'))

		topBtn.click()
		await settle()
		assert.equal(appComp.cdcChunkingOpen, false)

		vm.$destroy()
	})

	await t.test('source files contain zero typographic dashes, zero XSS sinks, and enforce 44px targets & focus-visible', () => {
		const files = [
			'src/tools/cdcChunkingEstimator.js',
			'src/components/CdcChunkingWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
		]
		for (const rel of files) {
			const content = readFileSync(resolve(__dirname, '../..', rel), 'utf8')
			assert.equal(content.includes('\u2013'), false, `No U+2013 in ${rel}`)
			assert.equal(content.includes('\u2014'), false, `No U+2014 in ${rel}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `No XSS sink in ${rel}`)
		}
		const vueContent = readFileSync(resolve(__dirname, '../..', 'src/components/CdcChunkingWorkbench.vue'), 'utf8')
		assert.ok(vueContent.includes('min-block-size: 44px'))
		assert.ok(vueContent.includes(':focus-visible'))
	})
})
