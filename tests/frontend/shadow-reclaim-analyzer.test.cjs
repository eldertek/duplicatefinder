const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window } = require('./helpers.cjs')

function loadShadowModules() {
	const duplicateStats = loadModule('src/tools/duplicateStats.js', {})
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js', {})
	const shadowReclaimAnalyzer = loadModule('src/tools/shadowReclaimAnalyzer.js', {
		'./duplicateStats': duplicateStats,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
	})
	return {
		duplicateStats,
		duplicateSelectionAndExport,
		shadowReclaimAnalyzer,
	}
}

function loadShadowWorkbench(apiMock = {}, clipboardMock = {}) {
	const { shadowReclaimAnalyzer } = loadShadowModules()
	return loadComponent('src/components/ShadowReclaimWorkbench.vue', {
		'../tools/api': {
			deleteFiles: apiMock.deleteFiles || (async () => ({ deleted: [], failed: [] })),
		},
		'../tools/clipboardHelper': {
			copyTextSafely: clipboardMock.copyTextSafely || (async () => true),
		},
		'../tools/shadowReclaimAnalyzer': shadowReclaimAnalyzer,
	})
}

function makeSampleShadowDuplicates() {
	const nowMs = Date.UTC(2026, 10, 24, 0, 0, 0)
	const nowSec = Math.floor(nowMs / 1000)
	const daySec = 86400
	const unitSize = 5 * 1024 * 1024

	return {
		nowMs,
		unitSize,
		groups: [
			{
				id: 801,
				hash: 'f1a2b3c4d5e60708090a0b0c0d0e0f01',
				size: unitSize,
				files: [
					{
						id: 8001,
						fileId: 8001,
						path: '/alice/files/Engineering/architecture.pdf',
						size: unitSize,
						mtime: nowMs - 40 * daySec * 1000,
					},
					{
						id: 8002,
						fileId: 8002,
						path: `/alice/files_versions/Engineering/architecture.pdf.v${nowSec - 30 * daySec}`,
						size: unitSize,
						mtime: nowMs - 30 * daySec * 1000,
					},
					{
						id: 8003,
						fileId: 8003,
						path: `/alice/files_versions/Engineering/architecture.pdf.v${nowSec - 4 * daySec}`,
						size: unitSize,
						mtime: nowMs - 4 * daySec * 1000,
					},
				],
			},
			{
				id: 802,
				hash: 'f2a2b3c4d5e60708090a0b0c0d0e0f02',
				size: unitSize,
				files: [
					{
						id: 8004,
						fileId: 8004,
						path: '/alice/files/Finance/q4-ledger.xlsx',
						size: unitSize,
						mtime: nowMs - 25 * daySec * 1000,
					},
					{
						id: 8005,
						fileId: 8005,
						path: `/bob/files_trashbin/files/q4-ledger.xlsx.d${nowSec - 20 * daySec}`,
						size: unitSize,
						mtime: nowMs - 20 * daySec * 1000,
					},
				],
			},
			{
				id: 803,
				hash: 'f3a2b3c4d5e60708090a0b0c0d0e0f03',
				size: unitSize,
				files: [
					{
						id: 8006,
						fileId: 8006,
						path: '/alice/files/Design/brand-hero.png',
						size: unitSize,
						mtime: nowMs - 50 * daySec * 1000,
					},
					{
						id: 8007,
						fileId: 8007,
						path: '/appdata_oc998877/richdocuments/cache/brand-hero.png',
						size: unitSize,
						mtime: nowMs - 15 * daySec * 1000,
					},
				],
			},
			{
				id: 804,
				hash: 'f4a2b3c4d5e60708090a0b0c0d0e0f04',
				size: unitSize,
				files: [
					{
						id: 8008,
						fileId: 8008,
						path: `/carol/files_trashbin/files/orphaned-deck.pptx.d${nowSec - 45 * daySec}`,
						size: unitSize,
						mtime: nowMs - 45 * daySec * 1000,
					},
					{
						id: 8009,
						fileId: 8009,
						path: `/carol/files_versions/Presentations/orphaned-deck.pptx.v${nowSec - 60 * daySec}`,
						size: unitSize,
						mtime: nowMs - 60 * daySec * 1000,
					},
				],
			},
		],
	}
}

test('Cycle 148: Nextcloud Versions, Trashbin & Appdata Shadow-Duplicate Reclaimer', async (t) => {
	await t.test('parses Nextcloud files_versions, files_trashbin, appdata_* and live paths accurately', () => {
		const { shadowReclaimAnalyzer } = loadShadowModules()

		const ver = shadowReclaimAnalyzer.parseNextcloudShadowPath('/alice/files_versions/Docs/plan.pdf.v1730000000')
		assert.equal(ver.shadowType, 'files_versions')
		assert.equal(ver.isShadow, true)
		assert.equal(ver.userId, 'alice')
		assert.equal(ver.epochTimestampSec, 1730000000)
		assert.equal(ver.logicalOriginalPath, '/alice/files/Docs/plan.pdf')

		const trash = shadowReclaimAnalyzer.parseNextcloudShadowPath('/data/bob/files_trashbin/files/report.csv.d1731000000')
		assert.equal(trash.shadowType, 'files_trashbin')
		assert.equal(trash.userId, 'bob')
		assert.equal(trash.trashbinBucket, 'files')
		assert.equal(trash.epochTimestampSec, 1731000000)
		assert.equal(trash.logicalOriginalPath, '/bob/files/report.csv')

		const app = shadowReclaimAnalyzer.parseNextcloudShadowPath('/appdata_oc123xyz/preview/42/1024-1024.png')
		assert.equal(app.shadowType, 'appdata')
		assert.equal(app.instanceId, 'oc123xyz')
		assert.equal(app.appdataScope, 'preview')
		assert.equal(app.isRegenerableAppdata, true)

		const live = shadowReclaimAnalyzer.parseNextcloudShadowPath('/alice/files/Docs/plan.pdf')
		assert.equal(live.shadowType, 'live_file')
		assert.equal(live.isShadow, false)
		assert.equal(live.userId, 'alice')
	})

	await t.test('analyzes versions, trashbin, appdata, cross-user shadows, shadow-only protection, and retention grace age', () => {
		const { shadowReclaimAnalyzer } = loadShadowModules()
		const { groups, nowMs, unitSize } = makeSampleShadowDuplicates()

		const report = shadowReclaimAnalyzer.analyzeShadowDuplicates(groups, {
			strategy: 'live_first',
			minShadowAgeDays: 10,
			includeAppdata: true,
			protectLastShadowAnchor: true,
			referenceNowMs: nowMs,
		})

		assert.equal(report.schema, shadowReclaimAnalyzer.SHADOW_RECLAIM_SCHEMA)
		assert.equal(report.summary.totalGroups, 4)
		assert.equal(report.summary.shadowBackedGroups, 3)
		assert.equal(report.summary.shadowOnlyGroups, 1)
		assert.equal(report.summary.crossUserShadowGroups, 1)
		// Group 801: 8002 (30d) reclaimable, 8003 (4d) held by 10d grace window
		// Group 802: 8005 (20d) reclaimable, cross-user
		// Group 803: 8007 (15d) appdata reclaimable
		// Group 804: shadow-only -> 1 anchor protected (8008 or 8009 depending on sort), 1 reclaimable
		assert.equal(report.summary.retentionHeldCount, 1)
		assert.equal(report.summary.safeReclaimShadowCount, 4)
		assert.equal(report.summary.totalShadowReclaimableBytes, unitSize * 4)

		const crossGroup = report.items.find(i => i.groupId === 802)
		assert.equal(crossGroup.isCrossUserShadow, true)
		assert.deepEqual(crossGroup.affectedUsers, ['alice', 'bob'])

		const shadowOnly = report.items.find(i => i.groupId === 804)
		assert.equal(shadowOnly.isShadowOnlyGroup, true)
		assert.equal(shadowOnly.safeReclaimCount, 1)

		// Turning off protectLastShadowAnchor makes both copies in shadow-only group reclaimable
		const unguarded = shadowReclaimAnalyzer.analyzeShadowDuplicates(groups, {
			strategy: 'live_first',
			minShadowAgeDays: 10,
			includeAppdata: true,
			protectLastShadowAnchor: false,
			referenceNowMs: nowMs,
		})
		const unguardedShadowOnly = unguarded.items.find(i => i.groupId === 804)
		assert.equal(unguardedShadowOnly.safeReclaimCount, 2)

		// Disabling includeAppdata holds group 803
		const noAppdata = shadowReclaimAnalyzer.analyzeShadowDuplicates(groups, {
			includeAppdata: false,
			referenceNowMs: nowMs,
		})
		const appItem = noAppdata.items.find(i => i.groupId === 803)
		assert.equal(appItem.safeReclaimCount, 0)
		assert.equal(appItem.heldCount, 1)
	})

	await t.test('filters, sorts, and generates POSIX-safe DRY_RUN=1 OCC cleanup scripts, probes, JSON, and CWE-1236-safe CSV', () => {
		const { shadowReclaimAnalyzer } = loadShadowModules()
		const { nowMs } = makeSampleShadowDuplicates()
		const injectedGroups = [
			{
				id: 901,
				hash: 'inj901',
				size: 4096,
				files: [
					{ id: 9001, path: '/alice/files/=SUM(1,2).pdf', size: 4096, mtime: nowMs - 40 * 86400000 },
					{ id: 9002, path: "/alice/files_versions/=CMD(calc)'$(id).pdf.v1700000000", size: 4096, mtime: nowMs - 40 * 86400000 },
					{ id: 9003, path: '/bob/files_trashbin/files/+HYPERLINK.pdf.d1700000000', size: 4096, mtime: nowMs - 40 * 86400000 },
				],
			},
		]

		const report = shadowReclaimAnalyzer.analyzeShadowDuplicates(injectedGroups, {
			referenceNowMs: nowMs,
		})

		const filteredBob = shadowReclaimAnalyzer.filterAndSortShadowItems(report.items, {
			userFilter: 'bob',
			shadowFilter: 'files_trashbin',
		})
		assert.equal(filteredBob.length, 1)

		const occPerUser = shadowReclaimAnalyzer.buildShadowOccCleanupScript(report, {
			occMode: 'per_user_cleanup',
			dataRoot: '/srv/nc/data',
		})
		assert.ok(occPerUser.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(occPerUser.includes("versions:cleanup 'alice'"))
		assert.ok(occPerUser.includes("trashbin:cleanup 'bob'"))
		assert.ok(occPerUser.includes("files:scan 'alice'"))
		assert.ok(occPerUser.includes("files:scan 'bob'"))
		assert.ok(occPerUser.includes("'\\''"))

		const occAllUsers = shadowReclaimAnalyzer.buildShadowOccCleanupScript(report, {
			occMode: 'all_users_cleanup',
		})
		assert.ok(occAllUsers.includes('versions:cleanup --all-users'))
		assert.ok(occAllUsers.includes('trashbin:cleanup --all-users'))

		const probe = shadowReclaimAnalyzer.buildShadowProbeScript(report, {
			dataRoot: '/srv/nc/data',
		})
		assert.ok(probe.includes('files_versions'))
		assert.ok(probe.includes('files_trashbin'))
		assert.ok(probe.includes('appdata_*'))

		const json = JSON.parse(shadowReclaimAnalyzer.buildShadowReclaimJson(report))
		assert.equal(json.schema, shadowReclaimAnalyzer.SHADOW_RECLAIM_SCHEMA)
		assert.equal(json.groups.length, 1)

		const csv = shadowReclaimAnalyzer.buildShadowReclaimCsv(report)
		assert.ok(csv.includes('Logical Original Path'))
		assert.ok(csv.includes("'=SUM(1,2).pdf"))
		assert.ok(csv.includes('/bob/files_trashbin/files/+HYPERLINK.pdf.d1700000000'))
	})

	await t.test('ShadowReclaimWorkbench.vue renders empty, no-shadow, populated, unclamped numeric inputs, safe deletion, and XSS defense', async () => {
		const deletedPayloads = []
		const completedEvents = []
		const Workbench = loadShadowWorkbench({
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

		// Non-empty duplicates but zero shadow files
		const noShadowVm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: [
						{
							id: 1,
							size: 1024,
							files: [
								{ id: 11, path: '/alice/files/a.txt', size: 1024 },
								{ id: 12, path: '/alice/files/b.txt', size: 1024 },
							],
						},
					],
					allDuplicates: [],
				},
			}),
		}).$mount()
		await settle()
		assert.ok(noShadowVm.$el.textContent.includes('No Nextcloud files_versions, files_trashbin, or appdata_* shadow duplicates detected'))
		noShadowVm.$destroy()

		// Populated state with XSS payload
		const { groups } = makeSampleShadowDuplicates()
		groups[2].files[1].path = '/appdata_oc998877/richdocuments/<img src=x onerror=alert(1)>.png'

		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: groups,
					allDuplicates: groups,
					currentDuplicateId: 801,
				},
				on: {
					'shadow-delete-completed': payload => completedEvents.push(payload),
				},
			}),
		}).$mount()
		await settle()

		const comp = vm.$children[0]
		assert.ok(vm.$el.textContent.includes('Versions, Trashbin & Appdata Shadow Reclaimer'))
		assert.equal(vm.$el.querySelectorAll('img[src="x"]').length, 0)

		// Unclamped controlled numeric inputs check
		comp.minAgeDaysInput = '999999'
		await settle()
		assert.equal(comp.minAgeDaysInput, '999999')
		comp.minAgeDaysInput = ''
		await settle()

		comp.minReclaimKbInput = '999999'
		await settle()
		assert.equal(comp.minReclaimKbInput, '999999')
		assert.ok(vm.$el.textContent.includes('No shadow duplicate groups match'))
		comp.minReclaimKbInput = ''
		await settle()

		// Trigger safe deletion of verified shadow copies
		const globalDelBtn = vm.$el.querySelector('.srw__global-bar button.srw__primary-btn.is-danger')
		assert.ok(globalDelBtn, 'Global safe shadow deletion button must be visible')
		globalDelBtn.click()
		await settle()

		const confirmBtn = vm.$el.querySelector('.srw__dialog button.srw__primary-btn.is-danger')
		assert.ok(confirmBtn)
		confirmBtn.click()
		await settle()

		assert.equal(deletedPayloads.length, 1)
		const deletedIds = deletedPayloads[0].map(f => f.id).sort((a, b) => a - b)
		// Live files 8001, 8004, 8006 are NEVER deleted; 1 shadow-only anchor in group 804 is protected
		assert.ok(!deletedIds.includes(8001))
		assert.ok(!deletedIds.includes(8004))
		assert.ok(!deletedIds.includes(8006))
		assert.equal(deletedIds.length, 5)
		assert.equal(completedEvents.length, 1)
		assert.equal(completedEvents[0].source, 'shadow-reclaim-workbench')

		vm.$destroy()
	})

	await t.test('App.vue + keyboardShortcuts wire backtick (`) shortcut, topbar Shadow button, and workbench toggle', async () => {
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		const reclamationHistory = loadModule('src/tools/reclamationHistory.js', {
			'./duplicateStats': loadModule('src/tools/duplicateStats.js'),
			'./duplicateFilters': loadModule('src/tools/duplicateFilters.js'),
		})
		assert.equal(
			keyboardShortcuts.resolveShortcutAction({ key: '`' }),
			'toggle-shadow-reclaim',
		)
		assert.ok(
			keyboardShortcuts.SHORTCUT_DEFINITIONS.some(def => def.id === 'toggle-shadow-reclaim' && def.keys.includes('`')),
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
		const btn = vm.$el.querySelector('button.topbar-shadow-reclaim-button')
		assert.ok(btn, 'Topbar Shadow button must be rendered')
		assert.equal(btn.getAttribute('aria-keyshortcuts'), '`')
		assert.equal(btn.getAttribute('aria-pressed'), 'false')

		btn.click()
		await settle()
		assert.equal(appComp.shadowReclaimOpen, true)
		assert.equal(btn.getAttribute('aria-pressed'), 'true')
		assert.ok(vm.$el.querySelector('.stub-shadow-reclaim'))

		window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '`', bubbles: true }))
		await settle()
		assert.equal(appComp.shadowReclaimOpen, false)

		vm.$destroy()
	})

	await t.test('Cycle 148 touched files preserve zero U+2013/U+2014 dashes, zero XSS sinks, logical CSS, and >= 44px mobile targets', () => {
		const files = [
			'src/tools/shadowReclaimAnalyzer.js',
			'src/components/ShadowReclaimWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
		]
		for (const relPath of files) {
			const content = readFileSync(resolve(__dirname, '../..', relPath), 'utf8')
			assert.ok(!/[\u2013\u2014]/.test(content), `No U+2013/U+2014 allowed in ${relPath}`)
			assert.ok(!/v-html|innerHTML|outerHTML|document\.write/.test(content), `No XSS sink allowed in ${relPath}`)
		}
		const vueContent = readFileSync(resolve(__dirname, '../..', 'src/components/ShadowReclaimWorkbench.vue'), 'utf8')
		assert.ok(vueContent.includes(':focus-visible'))
		assert.ok(vueContent.includes('44px'))
		assert.ok(vueContent.includes('padding-inline'))
		assert.ok(vueContent.includes('minmax('))
	})
})
