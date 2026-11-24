const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window } = require('./helpers.cjs')

function loadMailboxArchiveModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/mailboxArchiveAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function loadMailboxArchiveWorkbench(clipboardImpl) {
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js')
	const mailboxArchiveAuditor = loadMailboxArchiveModule()
	return loadComponent('src/components/MailboxArchiveWorkbench.vue', {
		'../tools/clipboardHelper': clipboardImpl === undefined
			? clipboardHelper
			: { copyTextSafely: text => clipboardHelper.copyTextSafely(text, clipboardImpl) },
		'../tools/mailboxArchiveAuditor': mailboxArchiveAuditor,
	})
}

function buildSampleMailboxDuplicates() {
	const kib = 1024
	const mib = 1024 * 1024
	const refSec = 1796000000
	return [
		{
			id: 7101,
			hash: 'sha256-exec-pst-mailbox',
			size: 120 * mib,
			acknowledged: false,
			files: [
				{
					id: 71011,
					path: '/__groupfolders/12/Legal-Hold/eDiscovery_2025/Exec_Archive.pst',
					size: 120 * mib,
					mtime: refSec - 12 * 86400,
				},
				{
					id: 71012,
					path: '/alice/files/Takeout/Mail/Exec_Archive.pst',
					size: 120 * mib,
					mtime: refSec - 45 * 86400,
				},
				{
					id: 71013,
					path: '/bob/files/Outlook Files/Exec_Archive.pst',
					size: 120 * mib,
					mtime: refSec - 5 * 86400,
				},
			],
		},
		{
			id: 7102,
			hash: 'sha256-ost-offline-cache',
			size: 64 * mib,
			acknowledged: false,
			files: [
				{
					id: 71021,
					path: '/shared-mailbox/Finance/Archive_2026.ost',
					size: 64 * mib,
					mtime: refSec - 3 * 86400,
				},
				{
					id: 71022,
					path: '/carol/files/Outlook/Archive_2026.ost',
					size: 64 * mib,
					mtime: refSec - 4 * 86400,
				},
			],
		},
		{
			id: 7103,
			hash: 'sha256-invoice-attachment-pdf',
			size: 2 * mib,
			acknowledged: false,
			files: [
				{
					id: 71031,
					path: '/Projects/Acme/Billing/invoice.pdf',
					size: 2 * mib,
					mtime: refSec - 10 * 86400,
				},
				{
					id: 71032,
					path: '/alice/files/Mail Downloads/Re_ Fwd_ invoice.pdf',
					size: 2 * mib,
					mtime: refSec - 42 * 86400,
				},
				{
					id: 71033,
					path: '/bob/files/Pieces jointes/invoice.pdf',
					size: 2 * mib,
					mtime: refSec - 35 * 86400,
				},
			],
		},
		{
			id: 7104,
			hash: 'sha256-contract-eml-message',
			size: 512 * kib,
			acknowledged: false,
			files: [
				{
					id: 71041,
					path: '/shared-mailbox/Contracts/Signed_Agreement.eml',
					size: 512 * kib,
					mtime: refSec - 8 * 86400,
				},
				{
					id: 71042,
					path: '/dave/files/Downloads/Signed_Agreement.eml',
					size: 512 * kib,
					mtime: refSec - 50 * 86400,
				},
			],
		},
		{
			id: 7105,
			hash: 'sha256-calendar-ics',
			size: 64 * kib,
			acknowledged: false,
			files: [
				{
					id: 71051,
					path: '/__groupfolders/4/Mail-Archive/Board_Meetings_2026.ics',
					size: 64 * kib,
					mtime: refSec - 6 * 86400,
				},
				{
					id: 71052,
					path: '/eve/files/Takeout/Mail/Board_Meetings_2026.ics',
					size: 64 * kib,
					mtime: refSec - 40 * 86400,
				},
			],
		},
		{
			id: 7106,
			hash: 'sha256-ordinary-photo',
			size: 3 * mib,
			acknowledged: false,
			files: [
				{ id: 71061, path: '/alice/files/Photos/beach.jpg', size: 3 * mib, mtime: refSec - 10 * 86400 },
				{ id: 71062, path: '/alice/files/Backup/beach.jpg', size: 3 * mib, mtime: refSec - 12 * 86400 },
			],
		},
	]
}

describe('Email Archive, Mailbox Dump & Extracted Attachment Redundancy Auditor', () => {
	test('classifies all 4 mailbox and attachment families and ignores unrelated files', () => {
		const mod = loadMailboxArchiveModule()

		assert.equal(mod.classifyMailboxArtifact('/archive/exec.pst').family, 'mailbox-containers')
		assert.equal(mod.classifyMailboxArtifact('/archive/mail.ost').family, 'mailbox-containers')
		assert.equal(mod.classifyMailboxArtifact('/takeout/All mail.mbox').family, 'mailbox-containers')
		assert.equal(mod.classifyMailboxArtifact('/notes/lotus.nsf').family, 'mailbox-containers')
		assert.equal(mod.classifyMailboxArtifact('/mac/outlook.olm').family, 'mailbox-containers')

		assert.equal(mod.classifyMailboxArtifact('/mail/notice.eml').family, 'individual-messages')
		assert.equal(mod.classifyMailboxArtifact('/apple/1024.emlx').family, 'individual-messages')
		assert.equal(mod.classifyMailboxArtifact('/outlook/item.msg').family, 'individual-messages')
		assert.equal(mod.classifyMailboxArtifact('/templates/reply.oft').family, 'individual-messages')

		assert.equal(mod.classifyMailboxArtifact('/cal/invite.ics').family, 'calendar-contacts')
		assert.equal(mod.classifyMailboxArtifact('/contacts/lead.vcf').family, 'calendar-contacts')
		assert.equal(mod.classifyMailboxArtifact('/contacts/team.vcard').family, 'calendar-contacts')

		const att1 = mod.classifyMailboxArtifact('/alice/files/Pieces jointes/devis.pdf')
		assert.equal(att1.family, 'extracted-attachments')
		assert.equal(att1.isExtractedAttachmentLocation, true)

		const att2 = mod.classifyMailboxArtifact('/alice/files/Mail Downloads/Re_ Fwd_ invoice.pdf')
		assert.equal(att2.family, 'extracted-attachments')
		assert.equal(att2.hasMailForwardPrefix, true)
		assert.equal(att2.normalizedStem, 'invoice.pdf')

		assert.equal(mod.classifyMailboxArtifact('/alice/files/Photos/beach.jpg'), null)
	})

	test('protects legal-hold/eDiscovery vaults and unconsolidated .ost/.pst stores by default while flagging takeout & attachments', () => {
		const mod = loadMailboxArchiveModule()
		const analysis = mod.analyzeMailboxArchiveDuplicates(buildSampleMailboxDuplicates(), {
			referenceTimeSec: 1796000000,
			staleExportDays: 30,
		})

		assert.equal(analysis.schema, 'duplicatefinder.mailbox-archive-auditor.v1')
		assert.equal(analysis.summary.totalClustersCount, 5)
		assert.equal(analysis.summary.familyCounts['mailbox-containers'], 2)
		assert.equal(analysis.summary.familyCounts['individual-messages'], 1)
		assert.equal(analysis.summary.familyCounts['calendar-contacts'], 1)
		assert.equal(analysis.summary.familyCounts['extracted-attachments'], 1)

		const pstCluster = analysis.clusters.find(c => c.primaryGroupId === 7101)
		assert.ok(pstCluster)
		assert.equal(pstCluster.survivor.tier, 'legal-hold-vault')
		assert.equal(pstCluster.hasLegalHoldVault, true)

		const takeoutMember = pstCluster.members.find(m => m.fileId === 71012)
		assert.equal(takeoutMember.tier, 'takeout-export-dump')
		assert.equal(takeoutMember.verdict, 'reclaim-stale-export')

		const activePstMember = pstCluster.members.find(m => m.fileId === 71013)
		assert.equal(activePstMember.context.isActiveMailStore, true)
		assert.equal(activePstMember.verdict, 'blocked-active-mailstore')

		const ostCluster = analysis.clusters.find(c => c.primaryGroupId === 7102)
		assert.ok(ostCluster)
		const ostCopy = ostCluster.members.find(m => m.fileId === 71022)
		assert.equal(ostCopy.verdict, 'blocked-active-mailstore')
		assert.equal(ostCluster.reclaimableCopiesCount, 0)

		const attCluster = analysis.clusters.find(c => c.primaryGroupId === 7103)
		assert.ok(attCluster)
		assert.equal(attCluster.survivor.normalizedPath, '/Projects/Acme/Billing/invoice.pdf')
		assert.equal(attCluster.reclaimableCopiesCount, 2)
	})

	test('supports all 3 strategies, operator overrides, DRY_RUN=1 POSIX script, .sync-exclude.lst, CWE-1236 CSV, and JSON manifest', () => {
		const mod = loadMailboxArchiveModule()
		const duplicates = [
			...buildSampleMailboxDuplicates(),
			{
				id: 7199,
				hash: 'sha256-formula-eml',
				size: 102400,
				acknowledged: false,
				files: [
					{ id: 71991, path: '/shared-mailbox/Archive/=CMD("calc").eml', size: 102400, mtime: 1795000000 },
					{ id: 71992, path: '/alice/files/Mail Downloads/+malicious.eml', size: 102400, mtime: 1790000000 },
				],
			},
		]

		const hardlinkAnalysis = mod.analyzeMailboxArchiveDuplicates(duplicates, {
			familyFilter: 'extracted-attachments',
			strategy: 'hardlink-attachments-to-project',
			survivorRule: 'project-path-first',
			referenceTimeSec: 1796000000,
		})
		assert.equal(hardlinkAnalysis.clusters.length, 1)
		const hlMember = hardlinkAnalysis.clusters[0].members.find(m => m.fileId === 71032)
		assert.equal(hlMember.verdict, 'hardlink-attachment-to-project')
		assert.equal(hlMember.actionKind, 'hardlink')

		const script = mod.buildMailboxArchiveScript(hardlinkAnalysis, { dataRoot: '/srv/nc/data' })
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes('sha256sum --'))
		assert.ok(script.includes('stat -c %d'))
		assert.ok(script.includes('ln -f --'))
		assert.ok(script.includes('hardlink_attachment_to_project'))
		assert.ok(script.includes('occ files:scan --path='))

		const pruneAnalysis = mod.analyzeMailboxArchiveDuplicates(duplicates, {
			strategy: 'prune-stale-mbox-exports',
			staleExportDays: 30,
			referenceTimeSec: 1796000000,
		})
		const prunePst = pruneAnalysis.clusters.find(c => c.primaryGroupId === 7101)
		assert.equal(prunePst.members.find(m => m.fileId === 71012).verdict, 'reclaim-stale-export')

		const overrideAnalysis = mod.analyzeMailboxArchiveDuplicates(buildSampleMailboxDuplicates(), {
			memberOverrides: {
				'71032': 'force-keep',
				'71033': 'exclude',
			},
			referenceTimeSec: 1796000000,
		})
		const overriddenAtt = overrideAnalysis.clusters.find(c => c.primaryGroupId === 7103)
		assert.equal(overriddenAtt.members.find(m => m.fileId === 71032).verdict, 'blocked-manual-shield')
		assert.equal(overriddenAtt.members.find(m => m.fileId === 71033).verdict, 'excluded')

		const syncExclude = mod.buildMailboxSyncExcludeSnippet(hardlinkAnalysis)
		assert.ok(syncExclude.includes('~$*.pst'))
		assert.ok(syncExclude.includes('*.pst.tmp'))
		assert.ok(syncExclude.includes('.lock'))

		const fullAnalysis = mod.analyzeMailboxArchiveDuplicates(duplicates, { referenceTimeSec: 1796000000 })
		const csv = mod.buildMailboxArchiveCsvReport(fullAnalysis)
		assert.ok(csv.includes('"\'=CMD(""calc"").eml"') || csv.includes("'=CMD"))
		assert.ok(csv.includes('"\'+malicious.eml"') || csv.includes("'+malicious.eml"))

		const json = JSON.parse(mod.buildMailboxArchiveJsonReport(fullAnalysis, '2026-11-24T05:00:00Z'))
		assert.equal(json.schema, 'duplicatefinder.mailbox-archive-auditor.v1')
		assert.equal(json.generatedAt, '2026-11-24T05:00:00Z')
		assert.ok(Array.isArray(json.clusters))
	})

	test('renders MailboxArchiveWorkbench empty, filter-empty, populated, and interactive states', async () => {
		let copied = ''
		const Workbench = loadMailboxArchiveWorkbench({
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
		assert.ok(emptyVm.$el.querySelector('.maw__empty-banner'))
		emptyVm.$destroy()

		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: buildSampleMailboxDuplicates(),
					allDuplicates: buildSampleMailboxDuplicates(),
					currentDuplicateId: 7103,
				},
			}),
		}).$mount()
		await settle()

		assert.equal(vm.$el.querySelectorAll('.maw__cluster-item').length, 5)
		assert.ok(vm.$el.textContent.includes('invoice.pdf'))

		const numInputs = vm.$el.querySelectorAll('.maw__num-input')
		assert.equal(numInputs.length, 2)
		numInputs[0].value = ''
		numInputs[0].dispatchEvent(new window.Event('input'))
		await settle()
		assert.equal(numInputs[0].value, '', 'Numeric input must not clamp or reset mid-keystroke')

		const copyBtn = Array.from(vm.$el.querySelectorAll('button')).find(b => b.textContent.includes('Copy DRY_RUN=1 Script'))
		copyBtn.click()
		await settle()
		assert.ok(copied.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(vm.$el.querySelector('.maw__notice.is-success'))

		const searchInput = vm.$el.querySelector('input[type="search"]')
		searchInput.value = 'no-such-mailbox-xyz'
		searchInput.dispatchEvent(new window.Event('input'))
		await settle()
		assert.ok(vm.$el.querySelector('.maw__empty-banner'))

		const resetBtn = Array.from(vm.$el.querySelectorAll('button')).find(b => b.textContent.includes('Reset Filters'))
		resetBtn.click()
		await settle()
		assert.equal(vm.$el.querySelectorAll('.maw__cluster-item').length, 5)

		vm.$destroy()
	})

	test('integrates Mailbox & Attachments button and < keyboard shortcut in App.vue', async () => {
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
		const MailboxWorkbench = loadMailboxArchiveWorkbench({ writeText: async () => {} })

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
			'./components/MailboxArchiveWorkbench.vue': { __esModule: true, default: MailboxWorkbench },
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
					entities: status === 'acknowledged' ? [] : buildSampleMailboxDuplicates(),
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

		const topbarBtn = vm.$el.querySelector('.topbar-mailbox-archive-button')
		assert.ok(topbarBtn, 'Topbar Mail & Attachments button must exist')

		const action = keyboardShortcuts.resolveShortcutAction({ key: '<', shiftKey: false, target: vm.$el })
		assert.equal(action, 'toggle-mailbox-archive-auditor')

		topbarBtn.click()
		await settle()
		assert.ok(vm.$el.querySelector('.mailbox-archive-workbench'), 'MailboxArchiveWorkbench must mount on click')

		window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '<', bubbles: true }))
		await settle()
		assert.equal(vm.$el.querySelector('.mailbox-archive-workbench'), null, 'MailboxArchiveWorkbench must toggle closed on < shortcut')

		vm.$destroy()
	})

	test('keeps zero U+2013/U+2014 typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/mailboxArchiveAuditor.js',
			'src/components/MailboxArchiveWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
		]
		for (const relPath of files) {
			const content = readFileSync(resolve(__dirname, '../..', relPath), 'utf8')
			assert.equal(content.includes('\u2013'), false, `Unexpected U+2013 in ${relPath}`)
			assert.equal(content.includes('\u2014'), false, `Unexpected U+2014 in ${relPath}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `Unexpected XSS sink in ${relPath}`)
		}
		const vueContent = readFileSync(resolve(__dirname, '../..', 'src/components/MailboxArchiveWorkbench.vue'), 'utf8')
		assert.ok(vueContent.includes('min-block-size: 44px'))
		assert.ok(vueContent.includes(':focus-visible'))
	})
})
