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

function loadSimulatorModule() {
	const stats = loadModule('src/tools/duplicateStats.js')
	const selectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const pathDiff = loadModule('src/tools/duplicatePathDiff.js')
	return {
		stats,
		sim: loadModule('src/tools/linkDeduplicationSimulator.js', {
			'./duplicateStats': stats,
			'./duplicateSelectionAndExport': selectionAndExport,
			'./duplicatePathDiff': pathDiff,
		}),
	}
}

function loadSimulatorComponent(clipboardOverrides = {}) {
	const { sim } = loadSimulatorModule()
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js')
	return loadComponent('src/components/LinkDeduplicationSimulator.vue', {
		'../tools/clipboardHelper': {
			...clipboardHelper,
			...clipboardOverrides,
		},
		'../tools/linkDeduplicationSimulator': sim,
	})
}

describe('Cycle 124: Hardlink & Reference Replacement Deduplication Simulator', () => {
	test('pure helpers compute relative symlinks, shell quoting, scope compatibility, and master anchor priority', () => {
		const { sim } = loadSimulatorModule()

		assert.equal(
			sim.computeRelativeSymlinkTarget('/alice/files/Archive/2025/photo.jpg', '/alice/files/Origin/photo.jpg'),
			'../../Origin/photo.jpg'
		)
		assert.equal(
			sim.computeRelativeSymlinkTarget('/alice/files/Origin/copy.jpg', '/alice/files/Origin/master.jpg'),
			'master.jpg'
		)

		assert.equal(
			sim.shellQuote("/alice/files/Bob's photo.jpg"),
			"'/alice/files/Bob'\"'\"'s photo.jpg'"
		)

		const sameScope = sim.checkHardlinkCompatibility(
			{ id: 1, path: '/alice/files/Origin/a.bin' },
			{ id: 2, path: '/alice/files/Backup/a.bin' }
		)
		assert.equal(sameScope.compatible, true)

		const crossUser = sim.checkHardlinkCompatibility(
			{ id: 1, path: '/alice/files/Origin/a.bin' },
			{ id: 2, path: '/bob/files/Backup/a.bin' }
		)
		assert.equal(crossUser.compatible, false)
		assert.equal(crossUser.reason, 'cross-storage-scope')

		const crossStorage = sim.checkHardlinkCompatibility(
			{ id: 1, path: '/alice/files/Origin/a.bin', storageId: 'local::1' },
			{ id: 2, path: '/alice/files/External/a.bin', storageId: 'smb::9' }
		)
		assert.equal(crossStorage.compatible, false)

		// Protected origin always wins over older non-origin copy
		const picked = sim.pickMasterTarget([
			{ id: 1, path: '/alice/files/Backup/old.bin', mtime: 100, isInOriginFolder: false },
			{ id: 2, path: '/alice/files/Origin/keep.bin', mtime: 500, isInOriginFolder: true },
		], 'oldest')
		assert.equal(picked.id, 2)

		// Manual promote cannot override origin protection when origin copy exists
		const blockedManual = sim.pickMasterTarget([
			{ id: 1, path: '/alice/files/Backup/old.bin', isInOriginFolder: false },
			{ id: 2, path: '/alice/files/Origin/keep.bin', isInOriginFolder: true },
		], 'origin_first', 1)
		assert.equal(blockedManual.id, 2)
	})

	test('simulateLinkDeduplication handles hardlink vs symlink vs hybrid, protected origin lock, zero-byte skip, and script/CSV/JSON exports', () => {
		const { sim } = loadSimulatorModule()

		const groups = [
			{
				id: 10,
				hash: 'hash-same-scope',
				files: [
					{ id: 1, path: '/alice/files/Origin/doc.pdf', size: 4096, mtime: 2000, isInOriginFolder: true },
					{ id: 2, path: '/alice/files/Archive/doc.pdf', size: 4096, mtime: 1000, isInOriginFolder: false },
					{ id: 3, path: '/alice/files/Origin/mirror.pdf', size: 4096, mtime: 3000, isInOriginFolder: true },
				],
			},
			{
				id: 11,
				hash: 'hash-cross-scope',
				files: [
					{ id: 4, path: '/alice/files/Work/deck.pptx', size: 8192, mtime: 1000, isInOriginFolder: false },
					{ id: 5, path: '/bob/files/Shared/deck.pptx', size: 8192, mtime: 2000, isInOriginFolder: false },
				],
			},
			{
				id: 12,
				hash: 'hash-zero',
				files: [
					{ id: 6, path: '/alice/files/A/empty.txt', size: 0, mtime: 1000, isInOriginFolder: false },
					{ id: 7, path: '/alice/files/B/empty.txt', size: 0, mtime: 2000, isInOriginFolder: false },
				],
			},
			{
				id: 13,
				hash: 'hash-formula',
				files: [
					{ id: 8, path: '/alice/files/Safe/report.csv', size: 1024, mtime: 1000, isInOriginFolder: false },
					{ id: 9, path: '/alice/files/=cmd|calc/report.csv', size: 1024, mtime: 2000, isInOriginFolder: false },
				],
			},
		]

		const hardlinkSim = sim.simulateLinkDeduplication(groups, { mode: 'hardlink' })
		assert.equal(hardlinkSim.summary.totalGroups, 4)
		assert.equal(hardlinkSim.summary.readyOperations, 2) // id 2 + id 9
		assert.equal(hardlinkSim.summary.protectedSkipped, 1) // id 3 in Origin
		assert.equal(hardlinkSim.summary.blockedOperations, 1) // id 5 cross-user
		assert.equal(hardlinkSim.summary.zeroByteSkipped, 1) // id 7 zero-byte
		assert.equal(hardlinkSim.summary.reclaimableBytes, 4096 + 1024)

		// Hybrid mode unblocks cross-scope copy using relative symlink
		const hybridSim = sim.simulateLinkDeduplication(groups, { mode: 'hybrid' })
		assert.equal(hybridSim.summary.readyOperations, 3)
		assert.equal(hybridSim.summary.blockedOperations, 0)
		assert.equal(hybridSim.summary.reclaimableBytes, 4096 + 8192 + 1024)
		const crossGroup = hybridSim.groupPlans.find(g => g.groupId === 11)
		assert.equal(crossGroup.targets[0].effectiveAction, 'symlink')
		assert.equal(crossGroup.targets[0].relativeTarget, '../../../alice/files/Work/deck.pptx')

		// Filter check
		assert.equal(sim.filterSimulatedGroups(hardlinkSim.groupPlans, { statusFilter: 'ready' }).length, 2)
		assert.equal(sim.filterSimulatedGroups(hardlinkSim.groupPlans, { statusFilter: 'warnings' }).length, 3)
		assert.equal(sim.filterSimulatedGroups(hardlinkSim.groupPlans, { statusFilter: 'protected' }).length, 1)
		assert.equal(sim.filterSimulatedGroups(hardlinkSim.groupPlans, { query: 'deck.pptx' }).length, 1)

		// Dry-run-first bash script
		const script = sim.buildExecutionShellScript(hybridSim, {
			generatedAt: '2026-11-23T12:00:00.000Z',
			dataRoot: '/var/nc/data',
		})
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes("'/var/nc/data/alice/files/Origin/doc.pdf'"))
		assert.ok(script.includes("apply_link 'symlink'"))
		assert.equal(/[\u2013\u2014]/.test(script), false)

		// JSON schema
		const parsedJson = JSON.parse(sim.buildLinkPlanJson(hybridSim, '2026-11-23T12:00:00.000Z'))
		assert.equal(parsedJson.schema, sim.LINK_PLAN_SCHEMA)
		assert.equal(parsedJson.summary.readyOperations, 3)

		// CWE-1236 safe CSV
		const csv = sim.buildLinkPlanCsv(hybridSim)
		assert.ok(csv.includes('\r\n'))
		const formulaSim = sim.simulateLinkDeduplication([{
			id: 99,
			hash: 'h-evil',
			files: [
				{ id: 901, path: '/alice/files/ok.txt', size: 500, mtime: 100 },
				{ id: 902, path: '=HYPERLINK("http://evil","click")', size: 500, mtime: 200 },
			],
		}])
		const safeCsv = sim.buildLinkPlanCsv(formulaSim)
		assert.ok(safeCsv.includes('"\'=HYPERLINK(""http://evil"",""click"")"'))
	})

	test('LinkDeduplicationSimulator.vue handles empty, populated, mode switches, master promotion, script preview, clipboard, and XSS defense', async () => {
		const copied = []
		const SimComponent = loadSimulatorComponent({
			copyTextSafely: async (text) => {
				copied.push(text)
				return true
			},
		})

		// Empty state
		let scanTriggered = 0
		const emptyVm = new Vue({
			render: h => h(SimComponent, {
				props: { duplicates: [], allDuplicates: [] },
				on: { 'start-scan': () => { scanTriggered += 1 } },
			}),
		}).$mount()
		await settle()
		assert.ok(emptyVm.$el.querySelector('.link-simulator__empty'))
		emptyVm.$el.querySelector('.link-simulator__primary-btn').click()
		assert.equal(scanTriggered, 1)
		emptyVm.$destroy()

		// Populated state with XSS payload in path
		const xssPath = '/bob/files/<img src=x onerror=alert(1)>.pdf'
		const inspected = []
		const compared = []
		const popVm = new Vue({
			render: h => h(SimComponent, {
				props: {
					duplicates: [{
						id: 50,
						hash: 'h-xss',
						files: [
							{ id: 501, path: '/alice/files/Origin/master.pdf', size: 2048, mtime: 100 },
							{ id: 502, path: xssPath, size: 2048, mtime: 200 },
						],
					}],
					allDuplicates: [],
					currentDuplicateId: 50,
				},
				on: {
					'select-duplicate': g => inspected.push(g),
					'compare-duplicate': g => compared.push(g),
				},
			}),
		}).$mount()
		await settle()

		// XSS string must render as literal text, never an img element
		assert.equal(popVm.$el.querySelector('img'), null)
		assert.ok(popVm.$el.textContent.includes('<img src=x onerror=alert(1)>'))

		// Initial hardlink mode blocks cross-user target -> 0 ready
		assert.ok(popVm.$el.querySelector('.link-simulator__badge').textContent.includes('0 links ready'))

		// Switch to Relative Symlink pill button
		const pillButtons = Array.from(popVm.$el.querySelectorAll('.link-simulator__pill-btn'))
		const symlinkBtn = pillButtons.find(btn => btn.textContent.includes('Relative Symlink'))
		assert.ok(symlinkBtn)
		symlinkBtn.click()
		await settle()
		assert.ok(popVm.$el.querySelector('.link-simulator__badge').textContent.includes('1 links ready'))

		// Promote target as master
		const promoteBtn = popVm.$el.querySelector('.link-target-row__promote-btn')
		assert.ok(promoteBtn)
		promoteBtn.click()
		await settle()
		assert.ok(popVm.$el.querySelector('.link-plan-card__master').textContent.includes(xssPath))

		// Toggle script preview drawer
		const previewBtn = Array.from(popVm.$el.querySelectorAll('.link-simulator__tool-btn'))
			.find(btn => btn.textContent.includes('Preview shell plan'))
		assert.ok(previewBtn)
		assert.equal(previewBtn.getAttribute('aria-expanded'), 'false')
		previewBtn.click()
		await settle()
		assert.equal(previewBtn.getAttribute('aria-expanded'), 'true')
		assert.ok(popVm.$el.querySelector('.link-simulator__script-pre').textContent.includes('DRY_RUN'))

		// Copy script to clipboard
		const copyBtn = Array.from(popVm.$el.querySelectorAll('.link-simulator__tool-btn'))
			.find(btn => btn.textContent.includes('Copy Script'))
		copyBtn.click()
		await settle()
		assert.equal(copied.length, 1)
		assert.ok(popVm.$el.querySelector('.link-simulator__feedback.is-success'))

		// Inspect & Compare actions
		const cardBtns = Array.from(popVm.$el.querySelectorAll('.link-plan-card__btn'))
		cardBtns.find(b => b.textContent.includes('Inspect group')).click()
		cardBtns.find(b => b.textContent.includes('Compare')).click()
		assert.equal(inspected.length, 1)
		assert.equal(compared.length, 1)

		popVm.$destroy()
	})

	test('App.vue + keyboardShortcuts wire l shortcut, topbar Link Plan button, help dialog, and editable guard', async () => {
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		const linkDef = keyboardShortcuts.SHORTCUT_DEFINITIONS.find(def => def.id === 'toggle-link-simulator')
		assert.ok(linkDef)
		assert.deepEqual(linkDef.keys, ['l'])
		assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'l' }), 'toggle-link-simulator')
		assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'l', ctrlKey: true }), null)

		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const stub = cls => ({ render: h => h('div', { class: cls }) })
		const icon = slotBox('span')
		const DuplicateNavigation = {
			name: 'DuplicateNavigation',
			props: ['acknowledgedDuplicates', 'unacknowledgedDuplicates', 'currentDuplicateId'],
			methods: {
				resetAllFilters() {},
				focusSearchInput() {},
				cycleMinSizeFilter() {},
				exportCurrentCsv() {},
				exportCurrentJson() {},
			},
			render(h) {
				return h('nav', { class: 'stub-nav' })
			},
		}

		const SimComponent = loadSimulatorComponent()
		const App = loadComponent('src/App.vue', {
			'@nextcloud/vue': {
				NcAppContent: slotBox('main'),
				NcContent: slotBox('div'),
				NcLoadingIcon: slotBox('span'),
				NcButton: slotBox('button'),
				NcModal: slotBox('div'),
				NcAppSettingsDialog: slotBox('div'),
				NcAppSettingsSection: slotBox('section'),
			},
			'./components/DuplicateNavigation.vue': { __esModule: true, default: DuplicateNavigation },
			'./components/DuplicateDetails.vue': { __esModule: true, default: stub('duplicate-details') },
			'./components/DuplicateTreemap.vue': { __esModule: true, default: stub('duplicate-treemap') },
			'./components/SpaceReclamationTimeline.vue': { __esModule: true, default: stub('space-reclamation-timeline') },
			'./components/SimilarityInspector.vue': { __esModule: true, default: stub('similarity-inspector') },
			'./components/BatchAutoSelectWorkbench.vue': { __esModule: true, default: stub('batch-auto-select') },
			'./components/FileHygieneInspector.vue': { __esModule: true, default: stub('file-hygiene') },
			'./components/LinkDeduplicationSimulator.vue': { __esModule: true, default: SimComponent },
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
			'./components/OriginFoldersSettings.vue': { __esModule: true, default: stub('origin') },
			'./components/ExcludedFoldersSettings.vue': { __esModule: true, default: stub('excluded') },
			'./components/BulkDeletionSettings.vue': { __esModule: true, default: stub('bulk') },
			'./components/ProjectsSettings.vue': { __esModule: true, default: stub('projects') },
			'./components/ProjectDuplicates.vue': { __esModule: true, default: stub('project-dups') },
			'./components/FilterSettings.vue': { __esModule: true, default: stub('filter-settings') },
			'./components/help/OnboardingGuide.vue': { __esModule: true, default: stub('guide') },
			'./components/help/UsageExamples.vue': { __esModule: true, default: stub('examples') },
			'./components/help/FAQ.vue': { __esModule: true, default: stub('faq') },
			'@/tools/api': {
				fetchDuplicates: async type => ({
					entities: type === 'unacknowledged'
						? [{
							id: 9,
							hash: 'h9',
							files: [
								{ id: 91, path: '/alice/files/Origin/a.jpg', size: 1024, isInOriginFolder: true },
								{ id: 92, path: '/alice/files/Temp/a.jpg', size: 1024, isInOriginFolder: false },
							],
						}]
						: [],
					pagination: { currentPage: 1, totalPages: 1, hasMore: false, totalItems: type === 'unacknowledged' ? 1 : 0 },
				}),
				fetchProjects: async () => [],
				fetchScanStatus: async () => ({ running: false, completedSeq: 0 }),
				startUserScan: async () => ({ running: false }),
				notifyScanStarted: () => {},
				notifyScanCompleted: () => {},
				notifyScanFailed: () => {},
			},
			'@/tools/utils': utils,
			'@/tools/keyboardShortcuts': keyboardShortcuts,
			'@/tools/reclamationHistory': loadModule('src/tools/reclamationHistory.js', {
				'./duplicateFilters': loadModule('src/tools/duplicateFilters.js'),
				'./duplicateStats': loadModule('src/tools/duplicateStats.js'),
			}),
			'vue-material-design-icons/Folder': icon,
			'vue-material-design-icons/FolderRemove': icon,
			'vue-material-design-icons/FolderMultiple': icon,
			'vue-material-design-icons/Delete': icon,
			'vue-material-design-icons/FilterOutline': icon,
		})

		const vm = new Vue({ render: h => h(App) }).$mount()
		await settle()

		const topbarBtn = vm.$el.querySelector('.topbar-link-simulator-button')
		assert.ok(topbarBtn)
		assert.equal(topbarBtn.getAttribute('aria-keyshortcuts'), 'l')
		assert.equal(topbarBtn.getAttribute('aria-pressed'), 'false')
		assert.equal(vm.$el.querySelector('.link-simulator'), null)

		window.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: 'l', bubbles: true }))
		await settle()
		assert.equal(topbarBtn.getAttribute('aria-pressed'), 'true')
		assert.ok(vm.$el.querySelector('.link-simulator'))

		// Documented in ? shortcuts dialog
		window.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: '?', bubbles: true }))
		await settle()
		const dialogText = vm.$el.querySelector('.shortcuts-dialog').textContent
		assert.ok(dialogText.includes('Toggle hardlink and reference deduplication simulator'))

		// Ignored inside editable input
		const input = document.createElement('input')
		document.body.appendChild(input)
		try {
			input.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: 'l', bubbles: true }))
			await settle()
			assert.equal(topbarBtn.getAttribute('aria-pressed'), 'true')
		} finally {
			document.body.removeChild(input)
		}

		topbarBtn.click()
		await settle()
		assert.equal(topbarBtn.getAttribute('aria-pressed'), 'false')
		assert.equal(vm.$el.querySelector('.link-simulator'), null)

		vm.$destroy()
	})

	test('Cycle 124 files preserve zero U+2013/U+2014 dashes, zero XSS sinks, logical CSS, and >= 44px mobile touch targets', () => {
		const files = [
			'src/tools/linkDeduplicationSimulator.js',
			'src/components/LinkDeduplicationSimulator.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
		]
		for (const relPath of files) {
			const content = readFileSync(resolve(root, relPath), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(content), false, `${relPath} must contain zero U+2013/U+2014 dashes`)
			assert.equal(/v-html|innerHTML|outerHTML|insertAdjacentHTML/.test(content), false, `${relPath} must contain zero HTML injection sinks`)
		}

		const vueSource = readFileSync(resolve(root, 'src/components/LinkDeduplicationSimulator.vue'), 'utf8')
		const styleSection = vueSource.slice(vueSource.indexOf('<style'))
		assert.equal(/margin-(left|right)|padding-(left|right)|border-(left|right)/.test(styleSection), false, 'LinkDeduplicationSimulator.vue must use logical CSS properties')
		assert.ok(styleSection.includes(':focus-visible'), 'LinkDeduplicationSimulator.vue must define :focus-visible styles')
		assert.ok(styleSection.includes('min-block-size: 44px'), 'LinkDeduplicationSimulator.vue must enforce >= 44px touch targets on mobile')
	})
})
