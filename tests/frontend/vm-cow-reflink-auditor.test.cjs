const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window } = require('./helpers.cjs')

function loadVmCowModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/vmCowReflinkAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function loadVmCowWorkbench(clipboardImpl) {
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js')
	const vmCowReflinkAuditor = loadVmCowModule()
	return loadComponent('src/components/VmCowReflinkWorkbench.vue', {
		'../tools/clipboardHelper': clipboardImpl === undefined
			? clipboardHelper
			: { copyTextSafely: text => clipboardHelper.copyTextSafely(text, clipboardImpl) },
		'../tools/duplicateStats': duplicateStats,
		'../tools/vmCowReflinkAuditor': vmCowReflinkAuditor,
	})
}

function buildSampleVmCowDuplicates() {
	const gib = 1024 * 1024 * 1024
	const mib = 1024 * 1024
	const baseSec = 1795000000
	return [
		{
			id: 1201,
			hash: 'sha256-ubuntu-qcow2-golden',
			size: 4 * gib,
			acknowledged: false,
			files: [
				{
					id: 12011,
					path: '/ops/files/templates/ubuntu-24.04-golden.qcow2',
					size: 4 * gib,
					virtualSize: 20 * gib,
					allocatedSize: 4 * gib,
					mtime: baseSec - 86400,
					origin: true,
				},
				{
					id: 12012,
					path: '/ops/files/var/lib/libvirt/images/web-node-01.qcow2',
					size: 4 * gib,
					virtualSize: 20 * gib,
					allocatedSize: 4 * gib,
					mtime: baseSec,
					locked: true,
				},
				{
					id: 12013,
					path: '/ops/files/staging/dev-clone \'02\'.qcow2',
					size: 4 * gib,
					virtualSize: 20 * gib,
					allocatedSize: 4 * gib,
					mtime: baseSec - 3600,
					origin: false,
				},
				{
					id: 12014,
					path: '/ops/files/backups/ubuntu-snapshot-delta.qcow2',
					size: 4 * gib,
					mtime: baseSec - 7200,
					hasBackingFile: true,
				},
			],
		},
		{
			id: 1202,
			hash: 'sha256-sqlite-wal-db',
			size: 128 * mib,
			acknowledged: false,
			files: [
				{
					id: 12021,
					path: '/ops/files/db/prod-analytics.sqlite',
					size: 128 * mib,
					mtime: baseSec,
				},
				{
					id: 12022,
					path: '/ops/files/db/prod-analytics.sqlite-wal',
					size: 4 * mib,
					mtime: baseSec,
				},
				{
					id: 12023,
					path: '/ops/files/backups/prod-analytics-cold.sqlite',
					size: 128 * mib,
					mtime: baseSec - 43200,
				},
			],
		},
		{
			id: 1203,
			hash: 'sha256-pg-dump-sql-gz',
			size: 512 * mib,
			acknowledged: false,
			files: [
				{
					id: 12031,
					path: '/ops/files/dumps/billing-2026-11.sql.gz',
					size: 512 * mib,
					mtime: baseSec - 10000,
					origin: true,
				},
				{
					id: 12032,
					path: '/ops/files/archive/=cmd|\'/C calc\'!A0-billing.sql.gz',
					size: 512 * mib,
					mtime: baseSec - 5000,
				},
			],
		},
		{
			id: 1204,
			hash: 'sha256-container-oci-tar-zst',
			size: 640 * mib,
			acknowledged: false,
			files: [
				{
					id: 12041,
					path: '/ops/files/containers/nextcloud-rootfs-v30.tar.zst',
					size: 640 * mib,
					mtime: baseSec - 20000,
				},
				{
					id: 12042,
					path: '/ops/files/nocow/nextcloud-rootfs-copy.tar.zst',
					size: 640 * mib,
					mtime: baseSec - 15000,
					nocow: true,
				},
			],
		},
		{
			id: 1205,
			hash: 'sha256-unrelated-doc',
			size: 2 * mib,
			acknowledged: false,
			files: [
				{ id: 12051, path: '/ops/files/docs/readme.pdf', size: 2 * mib },
				{ id: 12052, path: '/ops/files/docs/readme-copy.pdf', size: 2 * mib },
			],
		},
	]
}

describe('VM Disk, Database Dump & Container Image CoW Reflink Auditor', () => {
	test('classifies workload families, active WAL/hypervisor locks, backing chains, and NOCOW traps accurately', () => {
		const mod = loadVmCowModule()
		const sample = buildSampleVmCowDuplicates()
		const analysis = mod.analyzeVmCowReflink(sample, {
			backendId: 'btrfs-xfs',
			strategy: 'cow-reflink',
			minSizeBytes: 1024 * 1024,
		})

		// Group 1205 (PDFs) must be excluded as non-VM/DB/container workload
		assert.equal(analysis.summary.totalGroupsCount, 4)
		assert.equal(analysis.summary.familyStats['vm-disk'].count, 1)
		assert.equal(analysis.summary.familyStats['database-file'].count, 1)
		assert.equal(analysis.summary.familyStats['database-dump'].count, 1)
		assert.equal(analysis.summary.familyStats['container-image'].count, 1)

		// Active locks: web-node-01.qcow2 (locked: true + libvirt path) + prod-analytics.sqlite (sibling -wal)
		assert.ok(analysis.summary.activeLockedFilesCount >= 2)
		assert.equal(analysis.summary.backingChainFilesCount, 1)
		assert.ok(analysis.summary.cowReflinkNetSavingsBytes > 0)
		assert.ok(analysis.summary.protectedActiveBytes > 0)

		const vmGroup = analysis.groups.find(g => g.primaryGroupId === 1201)
		assert.ok(vmGroup)
		assert.equal(vmGroup.survivor.normalizedPath, '/templates/ubuntu-24.04-golden.qcow2')

		const libvirtCopy = vmGroup.copies.find(c => c.normalizedPath.includes('web-node-01.qcow2'))
		assert.equal(libvirtCopy.verdict, 'blocked-active-lock')
		assert.equal(libvirtCopy.cowSavingsBytes, 0)

		const devClone = vmGroup.copies.find(c => c.normalizedPath.includes('dev-clone'))
		assert.equal(devClone.verdict, 'cow-reflink-ready')
		assert.ok(devClone.cowSavingsBytes > 0)

		const deltaCopy = vmGroup.copies.find(c => c.normalizedPath.includes('snapshot-delta'))
		assert.equal(deltaCopy.verdict, 'blocked-backing-chain')
		assert.equal(deltaCopy.cowSavingsBytes, 0)

		// NOCOW container copy must be blocked from CoW reflink
		const containerGroup = analysis.groups.find(g => g.primaryGroupId === 1204)
		assert.ok(containerGroup)
		const nocowCopy = containerGroup.copies.find(c => c.hasNocowFlag)
		assert.equal(nocowCopy.verdict, 'blocked-nocow')
		assert.equal(nocowCopy.cowSavingsBytes, 0)
	})

	test('blocks mutable VM disks from read-only hardlinks while allowing immutable dumps', () => {
		const mod = loadVmCowModule()
		const sample = buildSampleVmCowDuplicates()
		const analysis = mod.analyzeVmCowReflink(sample, {
			backendId: 'hardlink-readonly',
			strategy: 'cow-reflink',
			minSizeBytes: 1024 * 1024,
		})

		const vmGroup = analysis.groups.find(g => g.primaryGroupId === 1201)
		const devClone = vmGroup.copies.find(c => c.normalizedPath.includes('dev-clone'))
		assert.equal(devClone.verdict, 'blocked-mutable-hardlink')
		assert.equal(devClone.cowSavingsBytes, 0)

		const dumpGroup = analysis.groups.find(g => g.primaryGroupId === 1203)
		const dumpCopy = dumpGroup.copies[0]
		assert.equal(dumpCopy.verdict, 'hardlink-immutable-ready')
		assert.ok(dumpCopy.cowSavingsBytes > 0)
	})

	test('generates DRY_RUN=1 POSIX single-quoted scripts, CWE-1236 safe CSV, and JSON manifest', () => {
		const mod = loadVmCowModule()
		const sample = buildSampleVmCowDuplicates()
		const analysis = mod.analyzeVmCowReflink(sample, {
			backendId: 'btrfs-xfs',
			strategy: 'cow-reflink',
			minSizeBytes: 1024 * 1024,
		})

		const script = mod.buildVmCowReflinkScript(analysis, { dataRoot: '/srv/nc data' })
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes("DATA_ROOT='/srv/nc data'"))
		assert.ok(script.includes('cp --reflink=always --sparse=always'))
		assert.ok(script.includes("'\\''02'\\''"))
		assert.ok(script.includes('# BLOCKED (ACTIVE_LOCK):'))
		assert.ok(script.includes('# GUARDED (BACKING_CHAIN):'))
		assert.ok(script.includes('assert_unlocked'))

		const apfsAnalysis = mod.analyzeVmCowReflink(sample, {
			backendId: 'apfs',
			strategy: 'cow-reflink',
			minSizeBytes: 1024 * 1024,
		})
		const apfsScript = mod.buildVmCowReflinkScript(apfsAnalysis)
		assert.ok(apfsScript.includes('cp -c --'))

		const csv = mod.buildVmCowCsvReport(analysis)
		const lines = csv.split('\r\n')
		assert.ok(lines.length > 2)
		const maliciousRow = lines.find(line => line.includes('calc'))
		assert.ok(maliciousRow)
		// CWE-1236: path starting with '/' is safe; verify formula-prefixed cell neutralization if any
		const formulaAnalysis = mod.analyzeVmCowReflink([
			{
				id: 1300,
				hash: 'h1',
				size: 10 * 1024 * 1024,
				files: [
					{ id: 1, path: '=HYPERLINK("http://evil")/base.sql', size: 10 * 1024 * 1024 },
					{ id: 2, path: '+SUM(1,2)/copy.sql', size: 10 * 1024 * 1024 },
				],
			},
		])
		const formulaCsv = mod.buildVmCowCsvReport(formulaAnalysis)
		assert.ok(formulaCsv.includes("'=HYPERLINK"))
		assert.ok(formulaCsv.includes("'+SUM"))

		const json = JSON.parse(mod.buildVmCowJsonReport(analysis))
		assert.equal(json.schema, mod.VM_COW_SCHEMA)
		assert.equal(json.groups.length, 4)
	})

	test('VmCowReflinkWorkbench.vue renders empty, filtered-empty, populated, unclamped numeric input, and overrides', async () => {
		let copiedText = ''
		const Workbench = loadVmCowWorkbench({
			writeText: async text => {
				copiedText = text
			},
		})

		// Empty state
		const emptyVm = new Vue({
			render: h => h(Workbench, {
				props: { duplicates: [], allDuplicates: [] },
			}),
		}).$mount()
		await settle()
		assert.ok(emptyVm.$el.querySelector('.vcw__empty-banner'))
		emptyVm.$destroy()

		// Populated state
		const sample = buildSampleVmCowDuplicates()
		const vm = new Vue({
			render: h => h(Workbench, {
				props: { duplicates: sample, allDuplicates: sample, currentDuplicateId: 1201 },
			}),
		}).$mount()
		await settle()

		const groupItems = vm.$el.querySelectorAll('.vcw__group-item')
		assert.equal(groupItems.length, 4)

		// Unclamped numeric input: clear to '' and type '999999' without mid-keystroke clamping
		const numInput = vm.$el.querySelector('.vcw__num-input')
		numInput.value = ''
		numInput.dispatchEvent(new window.Event('input'))
		await settle()
		assert.equal(numInput.value, '')

		numInput.value = '999999'
		numInput.dispatchEvent(new window.Event('input'))
		await settle()
		assert.equal(numInput.value, '999999')
		assert.ok(vm.$el.querySelector('.vcw__empty-banner'))

		// Reset back to 1 MiB
		numInput.value = '1'
		numInput.dispatchEvent(new window.Event('input'))
		await settle()
		assert.equal(vm.$el.querySelectorAll('.vcw__group-item').length, 4)

		// Copy DRY_RUN=1 script
		const toolbarButtons = Array.from(vm.$el.querySelectorAll('.vcw__tool-btn'))
		const copyBtn = toolbarButtons.find(btn => btn.textContent.includes('Copy DRY_RUN=1 Script'))
		assert.ok(copyBtn)
		copyBtn.click()
		await settle()
		assert.ok(copiedText.includes('DRY_RUN="${DRY_RUN:-1}"'))

		// Override to Protect Group
		const overrideBtns = Array.from(vm.$el.querySelectorAll('.vcw__override-bar .vcw__seg-btn'))
		const protectBtn = overrideBtns.find(btn => btn.textContent.includes('Protect Group'))
		assert.ok(protectBtn)
		protectBtn.click()
		await settle()
		assert.ok(vm.$el.textContent.includes('Group manually locked by administrator override'))

		vm.$destroy()
	})

	test('App.vue wires $ shortcut and VmCowReflinkWorkbench cleanly', async () => {
		window.localStorage.clear()
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
		const VmCowWorkbench = loadVmCowWorkbench()
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
			'./components/VmCowReflinkWorkbench.vue': { __esModule: true, default: VmCowWorkbench },
			'./components/ScientificBundleWorkbench.vue': { __esModule: true, default: stub('scientific-bundle') },
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
					entities: status === 'acknowledged' ? [] : buildSampleVmCowDuplicates(),
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

		const topbarBtn = vm.$el.querySelector('.topbar-vm-cow-button')
		assert.ok(topbarBtn, 'Topbar VM / CoW button must exist')

		const action = keyboardShortcuts.resolveShortcutAction({ key: '$', shiftKey: true, target: vm.$el })
		assert.equal(action, 'toggle-vm-cow-reflink-auditor')

		topbarBtn.click()
		await settle()
		assert.ok(vm.$el.querySelector('.vm-cow-workbench'), 'VmCowReflinkWorkbench must mount on click')

		window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '$', shiftKey: true, bubbles: true }))
		await settle()
		assert.equal(vm.$el.querySelector('.vm-cow-workbench'), null, 'VmCowReflinkWorkbench must toggle closed on $ shortcut')

		vm.$destroy()
	})

	test('keeps zero U+2013/U+2014 typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/vmCowReflinkAuditor.js',
			'src/components/VmCowReflinkWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
		]
		for (const relPath of files) {
			const content = readFileSync(resolve(__dirname, '../..', relPath), 'utf8')
			assert.equal(content.includes('\u2013'), false, `Unexpected U+2013 in ${relPath}`)
			assert.equal(content.includes('\u2014'), false, `Unexpected U+2014 in ${relPath}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `Unexpected XSS sink in ${relPath}`)
		}
		const vueContent = readFileSync(resolve(__dirname, '../..', 'src/components/VmCowReflinkWorkbench.vue'), 'utf8')
		assert.ok(vueContent.includes('min-block-size: 44px'))
		assert.ok(vueContent.includes(':focus-visible'))
	})
})
