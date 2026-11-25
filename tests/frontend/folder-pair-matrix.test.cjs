const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, document } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

const slotBox = tag => ({
	render(h) {
		return h(tag, this.$slots.default)
	},
})

function loadMatrixModules() {
	const stats = loadModule('src/tools/duplicateStats.js')
	const selectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const pathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const matrix = loadModule('src/tools/folderPairMatrix.js', {
		'./duplicateStats': stats,
		'./duplicateSelectionAndExport': selectionAndExport,
		'./duplicatePathDiff': pathDiff,
	})
	return { stats, selectionAndExport, pathDiff, matrix }
}

function loadMatrixComponent(deps, apiOverrides = {}) {
	return loadComponent('src/components/FolderPairMatrix.vue', {
		'../tools/api': {
			deleteFiles: async () => ({ success: [], errors: [], deletedNodeIds: [] }),
			...apiOverrides,
		},
		'../tools/duplicatePathDiff': deps.pathDiff,
		'../tools/folderPairMatrix': deps.matrix,
	})
}

function createSampleGroups() {
	return [
		{
			id: 101,
			hash: 'hash-101',
			acknowledged: false,
			files: [
				{ id: 1, nodeId: 1001, path: '/alice/files/Photos/2025/beach.jpg', size: 4000000, mtime: 1700000100, isInOriginFolder: true },
				{ id: 2, nodeId: 1002, path: '/alice/files/Backups/Phone/beach.jpg', size: 4000000, mtime: 1700000500, isInOriginFolder: false },
				{ id: 3, nodeId: 1003, path: '/alice/files/Inbox/beach.jpg', size: 4000000, mtime: 1700000800, isInOriginFolder: false },
			],
		},
		{
			id: 102,
			hash: 'hash-102',
			acknowledged: false,
			files: [
				{ id: 4, nodeId: 1004, path: '/alice/files/Photos/2025/sunset.mov', size: 8000000, mtime: 1700000200, isInOriginFolder: true },
				{ id: 5, nodeId: 1005, path: '/alice/files/Backups/Phone/sunset.mov', size: 8000000, mtime: 1700000600, isInOriginFolder: false },
			],
		},
		{
			id: 103,
			hash: 'hash-103',
			acknowledged: false,
			files: [
				{ id: 6, nodeId: 1006, path: '/alice/files/Photos/2025/sunset.jpg', size: 2000000, mtime: 1700000200, isInOriginFolder: false },
				{ id: 7, nodeId: 1007, path: '/alice/files/Backups/Phone/sunset.jpg', size: 2000000, mtime: 1700000600, isInOriginFolder: false },
			],
		},
		{
			id: 104,
			hash: 'hash-104',
			acknowledged: true,
			files: [
				{ id: 8, nodeId: 1008, path: '/alice/files/Work/spec.pdf', size: 1500000, mtime: 1700000100, isInOriginFolder: false },
				{ id: 9, nodeId: 1009, path: '/alice/files/Archive/spec.pdf', size: 1500000, mtime: 1700000300, isInOriginFolder: false },
			],
		},
	]
}

describe('Cycle 125: Directory Folder Pair Overlap Matrix & Side-by-Side Folder Deduplication', () => {
	test('pure matrix engine computes normalized parent folders, overlap percentages, mirror types, and sorting accurately', () => {
		const { matrix } = loadMatrixModules()

		assert.equal(matrix.getNormalizedParentFolder('/alice/files/Photos/2025/img.jpg'), '/Photos/2025')
		assert.equal(matrix.getNormalizedParentFolder('/alice/files/top.txt'), '/')
		assert.equal(matrix.getNormalizedParentFolder(''), '')

		const groups = createSampleGroups()
		const result = matrix.buildFolderPairMatrix(groups, { includeAcknowledged: false })

		assert.equal(result.summary.evaluatedGroupCount, 3)
		assert.equal(result.summary.skippedAcknowledgedCount, 1)
		assert.equal(result.pairs.length, 3)

		// Top pair must be /Backups/Phone <-> /Photos/2025 (3 shared groups, 14 MB reclaimable)
		const topPair = result.pairs[0]
		assert.equal(topPair.leftFolder, '/Backups/Phone')
		assert.equal(topPair.rightFolder, '/Photos/2025')
		assert.equal(topPair.sharedGroupCount, 3)
		assert.equal(topPair.containmentPercent, 100)
		assert.equal(topPair.jaccardPercent, 100)
		assert.equal(topPair.mirrorKind, 'exact_mirror')
		assert.equal(topPair.rightHasProtected, true)
		assert.equal(topPair.recommendedKeepSide, 'right')
		assert.equal(topPair.recommendationReason, 'protected_origin')
		assert.equal(topPair.cleanLeftBytes, 14000000)

		// Including acknowledged brings in /Archive <-> /Work
		const withAck = matrix.buildFolderPairMatrix(groups, { includeAcknowledged: true })
		assert.equal(withAck.pairs.length, 4)

		// Filtering minSharedGroups >= 2 narrows to only /Backups/Phone <-> /Photos/2025
		const minTwo = matrix.buildFolderPairMatrix(groups, { minSharedGroups: 2 })
		assert.equal(minTwo.pairs.length, 1)
		assert.equal(minTwo.pairs[0].sharedGroupCount, 3)

		// Path search matches both sides regardless of token order
		const searched = matrix.buildFolderPairMatrix(groups, { searchQuery: 'Inbox Photos' })
		assert.equal(searched.pairs.length, 1)
		assert.equal(searched.pairs[0].leftFolder, '/Inbox')
		assert.equal(searched.pairs[0].rightFolder, '/Photos/2025')
	})

	test('buildFolderPairCleanupPlan enforces protected origin lock, surviving copy guard, user exclusions, Live Photo ordering, and safe CSV/JSON exports', () => {
		const { matrix } = loadMatrixModules()
		const groups = createSampleGroups()
		const matrixResult = matrix.buildFolderPairMatrix(groups)
		const topPair = matrixResult.pairs[0]

		// Auto keep selects right (/Photos/2025) and marks 3 files in left (/Backups/Phone)
		const autoPlan = matrix.buildFolderPairCleanupPlan(topPair, { keepSide: 'auto' })
		assert.equal(autoPlan.keepSide, 'right')
		assert.equal(autoPlan.cleanedFolder, '/Backups/Phone')
		assert.equal(autoPlan.summary.deleteCount, 3)
		assert.equal(autoPlan.summary.reclaimableBytes, 14000000)

		// Live Photo safety: sunset.jpg must be ordered before sunset.mov
		const sunsetJpgIdx = autoPlan.deleteTargets.findIndex(t => t.path.endsWith('sunset.jpg'))
		const sunsetMovIdx = autoPlan.deleteTargets.findIndex(t => t.path.endsWith('sunset.mov'))
		assert.ok(sunsetJpgIdx !== -1 && sunsetMovIdx !== -1 && sunsetJpgIdx < sunsetMovIdx)

		// Flipping keepSide to left (/Backups/Phone) must STILL skip protected origin files in /Photos/2025
		const flippedPlan = matrix.buildFolderPairCleanupPlan(topPair, { keepSide: 'left' })
		assert.equal(flippedPlan.keepSide, 'left')
		assert.equal(flippedPlan.summary.protectedSkippedCount, 2)
		assert.equal(flippedPlan.summary.deleteCount, 1)
		assert.equal(flippedPlan.deleteTargets[0].path, '/alice/files/Photos/2025/sunset.jpg')

		// User exclusion unchecks a specific file safely
		const excludedPlan = matrix.buildFolderPairCleanupPlan(topPair, {
			keepSide: 'auto',
			excludedFileKeys: ['2'],
		})
		assert.equal(excludedPlan.summary.deleteCount, 2)

		// CWE-1236 CSV neutralization + JSON schema
		const formulaMatrix = matrix.buildFolderPairMatrix([
			{
				id: 90,
				hash: 'h90',
				acknowledged: false,
				files: [
					{ id: 901, path: '=CMD()/a.txt', size: 512, isInOriginFolder: false },
					{ id: 902, path: '+SUM(1)/a.txt', size: 512, isInOriginFolder: false },
				],
			},
		])
		const csv = matrix.buildFolderPairMatrixCsv(formulaMatrix)
		assert.ok(csv.includes("'=CMD()"))
		assert.ok(csv.includes("'+SUM(1)"))

		const json = JSON.parse(matrix.buildFolderPairMatrixJson(matrixResult, {
			scope: 'all',
			exportedAt: '2026-11-23T13:00:00.000Z',
		}))
		assert.equal(json.schema, 'duplicatefinder.folder-pair-matrix.v1')
		assert.equal(json.pairs.length, 3)
		assert.equal(json.pairs[0].groups.length, 3)
	})

	test('FolderPairMatrix.vue handles empty, populated, side swap, exclusion, dialog delete execution, filter sync, and XSS defense', async () => {
		const deps = loadMatrixModules()
		const deleteCalls = []
		const MatrixComp = loadMatrixComponent(deps, {
			deleteFiles: async files => {
				deleteCalls.push(files)
				return {
					success: files,
					errors: [],
					deletedNodeIds: files.map(f => f.nodeId).filter(Boolean),
				}
			},
		})

		const mountEl = document.createElement('div')
		document.body.appendChild(mountEl)

		// Empty state
		const emptyEvents = []
		const emptyVm = new Vue({
			render: h => h(MatrixComp, {
				props: { duplicates: [], allDuplicates: [] },
				on: { 'start-scan': () => emptyEvents.push('scan') },
			}),
		}).$mount(mountEl)
		await settle()
		assert.ok(emptyVm.$el.textContent.includes('No duplicate groups loaded yet'))
		emptyVm.$el.querySelector('.folder-matrix__primary-btn').click()
		assert.deepEqual(emptyEvents, ['scan'])
		emptyVm.$destroy()

		// Populated state with XSS payload
		const xssGroups = [
			...createSampleGroups(),
			{
				id: 205,
				hash: 'xss-hash',
				acknowledged: false,
				files: [
					{ id: 501, nodeId: 5001, path: '/alice/files/<img src=x onerror=alert(1)>/evil.jpg', size: 1000, isInOriginFolder: false },
					{ id: 502, nodeId: 5002, path: '/alice/files/SafeMirror/evil.jpg', size: 1000, isInOriginFolder: false },
				],
			},
		]

		const events = { select: [], compare: [], sync: [], deleted: [] }
		const vm = new Vue({
			render: h => h(MatrixComp, {
				props: {
					duplicates: xssGroups,
					allDuplicates: xssGroups,
					currentDuplicateId: 101,
				},
				on: {
					'select-duplicate': g => events.select.push(g.id),
					'compare-duplicate': g => events.compare.push(g.id),
					'sync-folder-filter': folder => events.sync.push(folder),
					'folder-pair-delete-completed': payload => events.deleted.push(payload),
				},
			}),
		}).$mount()
		document.body.appendChild(vm.$el)
		await settle()

		// XSS payload is escaped as plain text (zero injected <img> elements)
		assert.equal(vm.$el.querySelectorAll('img').length, 0)
		assert.ok(vm.$el.textContent.includes('<img src=x onerror=alert(1)>'))

		// Side-by-side rows are rendered for top pair
		const rows = vm.$el.querySelectorAll('.folder-diff-row')
		assert.equal(rows.length, 3)

		// Filter sidebar button emits sync-folder-filter
		const syncButtons = vm.$el.querySelectorAll('.folder-side-box__btn')
		const filterBtn = Array.from(syncButtons).find(btn => btn.textContent.includes('Filter sidebar'))
		filterBtn.click()
		assert.equal(events.sync.length, 1)
		assert.equal(events.sync[0], '/Backups/Phone')

		// Uncheck one file in cleaned side -> delete count drops from 3 to 2
		const checkboxes = vm.$el.querySelectorAll('.folder-diff-entry__checkbox')
		assert.equal(checkboxes.length, 3)
		checkboxes[0].click()
		await settle()

		const dangerBtn = vm.$el.querySelector('.folder-matrix__danger-btn')
		assert.ok(dangerBtn.textContent.includes('2 files'))

		// Open native alertdialog and execute deletion
		dangerBtn.click()
		await settle()
		const dialog = vm.$el.querySelector('dialog.folder-matrix-dialog')
		assert.ok(dialog)
		dialog.querySelector('.folder-matrix-dialog__btn.is-danger').click()
		await settle()

		assert.equal(deleteCalls.length, 1)
		assert.equal(deleteCalls[0].length, 2)
		assert.equal(events.deleted.length, 1)
		assert.equal(events.deleted[0].deletedFiles.length, 2)
		assert.ok(vm.$el.querySelector('.folder-matrix__feedback.is-success'))

		vm.$destroy()
	})

	test('App.vue + keyboardShortcuts wire d shortcut, topbar Folder Matrix button, help dialog, and sidebar sync', async () => {
		const shortcuts = loadModule('src/tools/keyboardShortcuts.js')
		assert.equal(shortcuts.resolveShortcutAction({ key: 'd' }), 'toggle-folder-matrix')
		assert.ok(shortcuts.SHORTCUT_DEFINITIONS.some(item => item.action === 'toggle-folder-matrix' && item.keys.includes('d')))

		const deps = loadMatrixModules()
		const MatrixComp = loadMatrixComponent(deps, {
			deleteFiles: async files => ({
				success: files,
				errors: [],
				deletedNodeIds: files.map(f => f.nodeId).filter(Boolean),
			}),
		})

		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const stats = deps.stats
		const syncedFolders = []
		const DuplicateNavigation = {
			name: 'DuplicateNavigation',
			props: ['acknowledgedDuplicates', 'unacknowledgedDuplicates', 'currentDuplicateId'],
			methods: {
				setFolderFilter(folderPath) {
					syncedFolders.push(folderPath)
				},
				scrollActiveDuplicateIntoView() {},
			},
			render(h) {
				return h('nav', { class: 'stub-nav' })
			},
		}
		const reclamationHistory = loadModule('src/tools/reclamationHistory.js', {
			'./duplicateFilters': loadModule('src/tools/duplicateFilters.js'),
			'./duplicateStats': stats,
		})

		const stub = name => ({
			name,
			render(h) {
				return h('div', { attrs: { 'data-stub': name } })
			},
		})

		const sampleGroups = createSampleGroups().filter(g => !g.acknowledged)

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
			'./components/LinkDeduplicationSimulator.vue': { __esModule: true, default: stub('link-simulator') },
			'./components/FolderPairMatrix.vue': { __esModule: true, default: MatrixComp },
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
					entities: type === 'unacknowledged' ? sampleGroups : [],
					pagination: {
						currentPage: 1,
						totalPages: 1,
						totalItems: type === 'unacknowledged' ? sampleGroups.length : 0,
						hasMore: false,
					},
				}),
				fetchProjects: async () => [],
				fetchScanStatus: async () => ({ running: false, completedSeq: 1 }),
				startUserScan: async () => null,
				notifyScanStarted: () => {},
				notifyScanCompleted: () => {},
				notifyScanFailed: () => {},
			},
			'@/tools/utils': utils,
			'@/tools/keyboardShortcuts': shortcuts,
			'@/tools/reclamationHistory': reclamationHistory,
			'vue-material-design-icons/Folder': slotBox('span'),
			'vue-material-design-icons/FolderRemove': slotBox('span'),
			'vue-material-design-icons/FolderMultiple': slotBox('span'),
			'vue-material-design-icons/Delete': slotBox('span'),
			'vue-material-design-icons/FilterOutline': slotBox('span'),
		})

		const vm = new Vue({ render: h => h(App) }).$mount()
		await settle()

		const topbarBtn = vm.$el.querySelector('.topbar-folder-matrix-button')
		assert.ok(topbarBtn)
		assert.equal(topbarBtn.getAttribute('aria-pressed'), 'false')
		assert.equal(topbarBtn.getAttribute('aria-keyshortcuts'), 'd')

		// Press 'd' shortcut to open FolderPairMatrix
		window.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: 'd', bubbles: true }))
		await settle()
		assert.equal(topbarBtn.getAttribute('aria-pressed'), 'true')
		assert.ok(vm.$el.querySelector('.folder-matrix'))

		// Help dialog lists 'd' shortcut in DOM
		window.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: '?', bubbles: true }))
		await settle()
		assert.ok(vm.$el.querySelector('.shortcuts-dialog').textContent.includes('Toggle directory folder pair matrix'))
		window.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
		await settle()

		// Filter sidebar sync from FolderPairMatrix forwards to DuplicateNavigation.setFolderFilter
		const filterBtn = Array.from(vm.$el.querySelectorAll('.folder-side-box__btn'))
			.find(btn => btn.textContent.includes('Filter sidebar'))
		filterBtn.click()
		await settle()
		assert.deepEqual(syncedFolders, ['/Backups/Phone'])

		// Press 'd' again to close
		window.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: 'd', bubbles: true }))
		await settle()
		assert.equal(topbarBtn.getAttribute('aria-pressed'), 'false')
		assert.equal(vm.$el.querySelector('.folder-matrix'), null)

		vm.$destroy()
	})

	test('Cycle 125 touched files preserve zero U+2013/U+2014 dashes, zero XSS sinks, logical CSS, and >= 44px mobile touch targets', () => {
		for (const relPath of [
			'src/tools/folderPairMatrix.js',
			'src/components/FolderPairMatrix.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
			'tests/frontend/folder-pair-matrix.test.cjs',
		]) {
			const content = readFileSync(resolve(root, relPath), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(content), false, `${relPath} must contain zero U+2013/U+2014 dashes`)
		}

		const vueSource = readFileSync(resolve(root, 'src/components/FolderPairMatrix.vue'), 'utf8')
		assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(vueSource), false, 'FolderPairMatrix.vue must have zero XSS sinks')
		const styleSection = vueSource.slice(vueSource.indexOf('<style'))
		assert.equal(/margin-(left|right)|padding-(left|right)|border-(left|right)/.test(styleSection), false, 'FolderPairMatrix.vue must use logical CSS properties')
		assert.ok(styleSection.includes(':focus-visible'), 'FolderPairMatrix.vue must define :focus-visible styles')
		assert.ok(styleSection.includes('min-block-size: 44px'), 'FolderPairMatrix.vue must enforce >= 44px touch targets on mobile')
	})
})
