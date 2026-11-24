const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window } = require('./helpers.cjs')

function loadInodeModules() {
	const duplicateStats = loadModule('src/tools/duplicateStats.js', {})
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js', {})
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js', {})
	const inodeSafetyVerifier = loadModule('src/tools/inodeSafetyVerifier.js', {
		'./duplicateStats': duplicateStats,
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
	})
	return {
		duplicateStats,
		duplicatePathDiff,
		duplicateSelectionAndExport,
		inodeSafetyVerifier,
	}
}

function loadInodeWorkbench(apiMock = {}, clipboardMock = {}) {
	const { inodeSafetyVerifier } = loadInodeModules()
	return loadComponent('src/components/InodeSafetyWorkbench.vue', {
		'../tools/api': {
			deleteFiles: apiMock.deleteFiles || (async () => ({ deleted: [], failed: [] })),
		},
		'../tools/clipboardHelper': {
			copyTextSafely: clipboardMock.copyTextSafely || (async () => true),
		},
		'../tools/inodeSafetyVerifier': inodeSafetyVerifier,
	})
}

function makeSampleDuplicates() {
	const now = Date.UTC(2026, 10, 24, 0, 0, 0)
	const day = 86400000
	const unitSize = 4 * 1024 * 1024

	return [
		{
			id: 501,
			hash: 'a1b2c3d4e5f60708090a0b0c0d0e0f10',
			size: unitSize,
			files: [
				{
					id: 5001,
					fileId: 5001,
					path: '/alice/files/Projects/dataset-v1.bin',
					size: unitSize,
					mtime: now - 20 * day,
					dev: 2049,
					inode: 100101,
					nlink: 2,
					fsType: 'ext4',
				},
				{
					id: 5002,
					fileId: 5002,
					path: '/alice/files/Backups/dataset-v1-link.bin',
					size: unitSize,
					mtime: now - 10 * day,
					dev: 2049,
					inode: 100101,
					nlink: 2,
					fsType: 'ext4',
				},
			],
		},
		{
			id: 502,
			hash: 'b2c3d4e5f60708090a0b0c0d0e0f1011',
			size: unitSize,
			files: [
				{
					id: 5003,
					fileId: 5003,
					path: '/alice/files/Origin/master-archive.tar',
					size: unitSize,
					mtime: now - 15 * day,
					isInOriginFolder: true,
					dev: 2049,
					inode: 200201,
					nlink: 1,
					fsType: 'xfs',
				},
				{
					id: 5004,
					fileId: 5004,
					path: '/alice/files/Downloads/master-archive-snap.tar',
					size: unitSize,
					mtime: now - 5 * day,
					dev: 2049,
					inode: 200202,
					nlink: 3,
					fsType: 'xfs',
				},
			],
		},
		{
			id: 503,
			hash: 'c3d4e5f60708090a0b0c0d0e0f101112',
			size: unitSize,
			files: [
				{
					id: 5005,
					fileId: 5005,
					path: '/alice/files/Finance/report-2026.pdf',
					size: unitSize,
					mtime: now - 12 * day,
					dev: 2049,
					inode: 300301,
					nlink: 1,
					fsType: 'btrfs',
				},
				{
					id: 5006,
					fileId: 5006,
					path: '/bob/files/Inbox/report-2026-copy.pdf',
					size: unitSize,
					mtime: now - 2 * day,
					dev: 2065,
					inode: 400401,
					nlink: 1,
					fsType: 'btrfs',
				},
			],
		},
		{
			id: 504,
			hash: 'd4e5f60708090a0b0c0d0e0f10111213',
			size: unitSize,
			files: [
				{
					id: 5007,
					fileId: 5007,
					path: '/alice/files/Media/raw-clip.mp4',
					size: unitSize,
					mtime: now - 9 * day,
					dev: 2049,
					inode: 500501,
					nlink: 1,
					fsType: 'xfs',
				},
				{
					id: 5008,
					fileId: 5008,
					path: '/alice/files/Temp/raw-clip-dup.mp4',
					size: unitSize,
					mtime: now - 1 * day,
					dev: 2049,
					inode: 500502,
					nlink: 1,
					fsType: 'xfs',
				},
			],
		},
	]
}

test('Cycle 147: Cross-Volume Inode, Hardlink-Alias & Storage-Backend Safety Verifier', async (t) => {
	await t.test('detects hardlink aliases (0 B true savings), external nlink traps, cross-device EXDEV, and verified-safe groups', () => {
		const { inodeSafetyVerifier } = loadInodeModules()
		const unitSize = 4 * 1024 * 1024
		const groups = makeSampleDuplicates()

		const report = inodeSafetyVerifier.analyzeInodeSafety(groups, {
			intent: 'delete_copies',
			filesystemOverride: 'auto',
		})

		assert.equal(report.schema, inodeSafetyVerifier.INODE_AUDIT_SCHEMA)
		assert.equal(report.summary.totalGroups, 4)

		const aliasGroup = report.items.find(item => item.groupId === 501)
		assert.equal(aliasGroup.primaryVerdict, 'already-hardlinked')
		assert.equal(aliasGroup.truePhysicalReclaimableBytes, 0)
		assert.equal(aliasGroup.phantomDeltaBytes, unitSize)
		assert.equal(aliasGroup.safeReclaimCount, 0)

		const trapGroup = report.items.find(item => item.groupId === 502)
		assert.equal(trapGroup.primaryVerdict, 'external-nlink-trap')
		assert.equal(trapGroup.truePhysicalReclaimableBytes, 0)
		assert.equal(trapGroup.safeReclaimCount, 0)

		const exdevGroup = report.items.find(item => item.groupId === 503)
		assert.equal(exdevGroup.primaryVerdict, 'cross-device-exdev')
		assert.equal(exdevGroup.truePhysicalReclaimableBytes, unitSize)
		assert.equal(exdevGroup.safeReclaimCount, 1)

		const safeGroup = report.items.find(item => item.groupId === 504)
		assert.equal(safeGroup.primaryVerdict, 'verified-safe')
		assert.equal(safeGroup.truePhysicalReclaimableBytes, unitSize)
		assert.equal(safeGroup.safeReclaimCount, 1)

		assert.equal(report.summary.truePhysicalReclaimableBytes, unitSize * 2)
		assert.equal(report.summary.phantomSavingsBytes, unitSize * 2)

		// Switching intent to hardlink or reflink blocks cross-device EXDEV group
		const linkReport = inodeSafetyVerifier.analyzeInodeSafety(groups, {
			intent: 'hardlink',
			filesystemOverride: 'auto',
		})
		const exdevInLinkMode = linkReport.items.find(item => item.groupId === 503)
		assert.equal(exdevInLinkMode.safeReclaimCount, 0)
		assert.equal(exdevInLinkMode.copies[1].copyVerdict, 'cross-device-exdev')

		// Switching filesystemOverride to objectstore blocks POSIX reflink/hardlink
		const s3Report = inodeSafetyVerifier.analyzeInodeSafety(groups, {
			intent: 'reflink',
			filesystemOverride: 'objectstore',
		})
		const safeOnS3 = s3Report.items.find(item => item.groupId === 504)
		assert.equal(safeOnS3.primaryVerdict, 'backend-blocked')
		assert.equal(safeOnS3.safeReclaimCount, 0)
	})

	await t.test('detects sparse block anomalies and server-side encryption constraints', () => {
		const { inodeSafetyVerifier } = loadInodeModules()
		const report = inodeSafetyVerifier.analyzeInodeSafety([
			{
				id: 601,
				hash: 'sparse0001',
				size: 10 * 1024 * 1024,
				files: [
					{
						id: 6001,
						path: '/alice/files/VMs/disk.img',
						size: 10 * 1024 * 1024,
						allocatedBytes: 512 * 1024,
						dev: 2049,
						inode: 9001,
						nlink: 1,
						fsType: 'btrfs',
					},
					{
						id: 6002,
						path: '/alice/files/VMs/disk-copy.img',
						size: 10 * 1024 * 1024,
						allocatedBytes: 512 * 1024,
						dev: 2049,
						inode: 9002,
						nlink: 1,
						fsType: 'btrfs',
					},
				],
			},
			{
				id: 602,
				hash: 'enc0002',
				size: 2048,
				files: [
					{
						id: 6003,
						path: '/alice/files/Vault/secret.pdf',
						size: 2048,
						dev: 2049,
						inode: 9003,
						nlink: 1,
						encrypted: true,
						encryptionMode: 'oc_encryption',
					},
					{
						id: 6004,
						path: '/alice/files/Vault/secret-dup.pdf',
						size: 2048,
						dev: 2049,
						inode: 9004,
						nlink: 1,
						encrypted: true,
						encryptionMode: 'oc_encryption',
					},
				],
			},
		], { intent: 'hardlink' })

		const sparseItem = report.items.find(item => item.groupId === 601)
		assert.equal(sparseItem.primaryVerdict, 'sparse-anomaly')
		assert.equal(sparseItem.truePhysicalReclaimableBytes, 512 * 1024)
		assert.equal(sparseItem.phantomDeltaBytes, (10 * 1024 * 1024) - (512 * 1024))

		const encItem = report.items.find(item => item.groupId === 602)
		assert.equal(encItem.primaryVerdict, 'backend-blocked')
		assert.equal(encItem.safeReclaimCount, 0)
	})

	await t.test('generates POSIX-quoted stat probes, DRY_RUN=1 OCC scripts, JSON, and CWE-1236-safe CSV', () => {
		const { inodeSafetyVerifier } = loadInodeModules()
		const injectionPath = '/alice/files/sub/=CMD(calc)\'$(id).bin'
		const report = inodeSafetyVerifier.analyzeInodeSafety([
			{
				id: 701,
				hash: 'safe701',
				size: 4096,
				files: [
					{ id: 7001, path: '/alice/files/origin/=SUM(1,2).bin', size: 4096, dev: 1, inode: 11, nlink: 1, isInOriginFolder: true },
					{ id: 7002, path: injectionPath, size: 4096, dev: 1, inode: 12, nlink: 1 },
				],
			},
		], { intent: 'hardlink' })

		const probe = inodeSafetyVerifier.buildInodeStatProbeScript(report, {
			dataRoot: '/srv/nextcloud/data',
		})
		assert.ok(probe.includes('#!/usr/bin/env bash'))
		assert.ok(probe.includes('stat -c'))
		assert.ok(probe.includes('find "$DATA_ROOT" -xdev -samefile'))
		assert.ok(probe.includes('\'"\'"\''))

		const occScript = inodeSafetyVerifier.buildInodeOccPlanScript(report, {
			dataRoot: '/srv/nextcloud/data',
		})
		assert.ok(occScript.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(occScript.includes('ln -f'))
		assert.ok(occScript.includes('occ files:scan'))
		assert.ok(occScript.includes('occ files:cleanup'))

		const json = JSON.parse(inodeSafetyVerifier.buildInodeSafetyJson(report))
		assert.equal(json.schema, inodeSafetyVerifier.INODE_AUDIT_SCHEMA)
		assert.equal(json.groups.length, 1)

		const csv = inodeSafetyVerifier.buildInodeSafetyCsv(report)
		assert.ok(csv.includes('Group True Physical Reclaim Bytes'))
		// CWE-1236 formula neutralization prefixes leading =/+/-/@ with a single quote inside CSV cell
		assert.ok(csv.includes("'=SUM(1,2).bin"))
	})

	await t.test('InodeSafetyWorkbench.vue renders empty, populated, unclamped numeric input, safe deletion, and XSS defense', async () => {
		const deletedPayloads = []
		const completedEvents = []
		const Workbench = loadInodeWorkbench({
			deleteFiles: async (files) => {
				deletedPayloads.push(files)
				return { deleted: files.map(f => f.id), failed: [] }
			},
		})

		// Empty state
		const emptyVm = new Vue({
			render: h => h(Workbench, { props: { duplicates: [], allDuplicates: [] } }),
		}).$mount()
		await settle()
		assert.ok(emptyVm.$el.textContent.includes('No duplicate groups loaded yet'))
		emptyVm.$destroy()

		// Populated state + XSS path sanitization
		const groups = makeSampleDuplicates()
		groups[3].files[1].path = '/alice/files/Temp/<img src=x onerror=alert(1)>.mp4'

		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: groups,
					allDuplicates: groups,
					currentDuplicateId: 504,
				},
				on: {
					'inode-delete-completed': payload => completedEvents.push(payload),
				},
			}),
		}).$mount()
		await settle()

		const comp = vm.$children[0]
		assert.ok(vm.$el.textContent.includes('Inode Topology & Storage-Backend Safety Verifier'))
		assert.equal(vm.$el.querySelectorAll('img[src="x"]').length, 0)

		// Unclamped controlled numeric input check
		comp.minReclaimKbInput = '999999'
		await settle()
		assert.equal(comp.minReclaimKbInput, '999999')
		assert.ok(vm.$el.textContent.includes('No duplicate groups match'))
		comp.minReclaimKbInput = ''
		await settle()

		// Trigger safe deletion of verified copies (only 5006 and 5008, never 5002 alias or 5004 external nlink trap)
		const globalDelBtn = vm.$el.querySelector('.isw__global-bar button.isw__primary-btn.is-danger')
		assert.ok(globalDelBtn, 'Global safe deletion button must be visible')
		globalDelBtn.click()
		await settle()

		const confirmBtn = vm.$el.querySelector('.isw__dialog button.isw__primary-btn.is-danger')
		assert.ok(confirmBtn)
		confirmBtn.click()
		await settle()

		assert.equal(deletedPayloads.length, 1)
		const deletedIds = deletedPayloads[0].map(f => f.id).sort((a, b) => a - b)
		assert.deepEqual(deletedIds, [5006, 5008])
		assert.equal(completedEvents.length, 1)
		assert.equal(completedEvents[0].source, 'inode-safety-verifier')

		vm.$destroy()
	})

	await t.test('App.vue + keyboardShortcuts wire apostrophe (\') shortcut, topbar Inodes button, and help dialog', async () => {
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		const reclamationHistory = loadModule('src/tools/reclamationHistory.js', {
			'./duplicateStats': loadModule('src/tools/duplicateStats.js'),
			'./duplicateFilters': loadModule('src/tools/duplicateFilters.js'),
		})
		assert.equal(
			keyboardShortcuts.resolveShortcutAction({ key: "'" }),
			'toggle-inode-verifier',
		)
		assert.ok(
			keyboardShortcuts.SHORTCUT_DEFINITIONS.some(def => def.id === 'toggle-inode-verifier' && def.keys.includes("'")),
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
			'./components/CadVaultWorkbench.vue': { __esModule: true, default: stub('cad-vault-auditor') },
			'./components/WebBuildMediaWorkbench.vue': { __esModule: true, default: stub('web-build-media-auditor') },
			'./components/LegalDocumentOcrWorkbench.vue': { __esModule: true, default: stub('legal-document-ocr-auditor') },
			'./components/BackupTakeoutWorkbench.vue': { __esModule: true, default: stub('backup-takeout-auditor') },
			'./components/DawAudioStemWorkbench.vue': { __esModule: true, default: stub('daw-audio-stem-auditor') },
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
		const btn = vm.$el.querySelector('button.topbar-inode-verifier-button')
		assert.ok(btn, 'Topbar Inodes button must be rendered')
		assert.equal(btn.getAttribute('aria-keyshortcuts'), "'")
		assert.equal(btn.getAttribute('aria-pressed'), 'false')

		btn.click()
		await settle()
		assert.equal(appComp.inodeVerifierOpen, true)
		assert.equal(btn.getAttribute('aria-pressed'), 'true')
		assert.ok(vm.$el.querySelector('.stub-inode-verifier'))

		window.dispatchEvent(new window.KeyboardEvent('keydown', { key: "'", bubbles: true }))
		await settle()
		assert.equal(appComp.inodeVerifierOpen, false)

		vm.$destroy()
	})

	await t.test('Cycle 147 touched files preserve zero U+2013/U+2014 dashes, zero XSS sinks, logical CSS, and >= 44px mobile targets', () => {
		const files = [
			'src/tools/inodeSafetyVerifier.js',
			'src/components/InodeSafetyWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
		]
		for (const relPath of files) {
			const content = readFileSync(resolve(__dirname, '../..', relPath), 'utf8')
			assert.ok(!/[\u2013\u2014]/.test(content), `No U+2013/U+2014 allowed in ${relPath}`)
			assert.ok(!/v-html|innerHTML|outerHTML|document\.write/.test(content), `No XSS sink allowed in ${relPath}`)
		}
		const vueContent = readFileSync(resolve(__dirname, '../..', 'src/components/InodeSafetyWorkbench.vue'), 'utf8')
		assert.ok(vueContent.includes(':focus-visible'))
		assert.ok(vueContent.includes('44px'))
		assert.ok(vueContent.includes('padding-inline'))
		assert.ok(vueContent.includes('minmax('))
	})
})
