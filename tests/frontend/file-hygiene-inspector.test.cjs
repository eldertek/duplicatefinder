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

function loadHygieneModule() {
	const stats = loadModule('src/tools/duplicateStats.js')
	const metadataBadges = loadModule('src/tools/duplicateMetadataBadges.js')
	const selectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	return {
		stats,
		hygiene: loadModule('src/tools/fileHygieneInspector.js', {
			'./duplicateStats': stats,
			'./duplicateMetadataBadges': metadataBadges,
			'./duplicateSelectionAndExport': selectionAndExport,
		}),
	}
}

function loadHygieneComponent(apiOverrides = {}) {
	const { stats, hygiene } = loadHygieneModule()
	const utils = loadModule('src/tools/utils.js', {
		'./notifications': { showErrorNotification: () => {} },
	})
	return loadComponent('src/components/FileHygieneInspector.vue', {
		'../tools/api': {
			deleteFiles: async files => ({ success: files, errors: [], deletedNodeIds: files.map(f => f.nodeId).filter(Boolean) }),
			...apiOverrides,
		},
		'../tools/duplicateStats': stats,
		'../tools/utils': utils,
		'../tools/fileHygieneInspector': hygiene,
	})
}

describe('Cycle 123: File Hygiene, Bad-Extension & Sync-Artifact Inspector', () => {
	test('pure helpers detect bad extensions, sync conflicts, zero-byte files, and magic-byte headers', () => {
		const { hygiene } = loadHygieneModule()

		assert.equal(hygiene.extractExtension('/alice/files/Photo.JPEG'), 'jpeg')
		assert.equal(hygiene.extractExtension('/alice/files/.DS_Store'), '')
		assert.equal(hygiene.extractExtension('/alice/files/noext'), '')

		const badTxt = hygiene.detectBadExtension('/alice/files/vacation.txt', 'image/jpeg')
		assert.equal(badTxt.mismatch, true)
		assert.equal(badTxt.reason, 'extension-mismatch')
		assert.equal(badTxt.currentExtension, 'txt')
		assert.equal(badTxt.suggestedExtension, 'jpg')

		const missingExt = hygiene.detectBadExtension('/alice/files/contract', 'application/pdf')
		assert.equal(missingExt.mismatch, true)
		assert.equal(missingExt.reason, 'missing-extension')
		assert.equal(missingExt.suggestedExtension, 'pdf')

		const genericMime = hygiene.detectBadExtension('/alice/files/blob.bin', 'application/octet-stream')
		assert.equal(genericMime.mismatch, false)

		const validJpeg = hygiene.detectBadExtension('/alice/files/shot.jpeg', 'image/jpeg; charset=binary')
		assert.equal(validJpeg.mismatch, false)

		const ncConflict = hygiene.detectSyncConflictOrJunk('/alice/files/Notes (conflicted copy 2026-11-23).md')
		assert.equal(ncConflict.matched, true)
		assert.equal(ncConflict.subType, 'nextcloud-conflict')

		const dsStore = hygiene.detectSyncConflictOrJunk('/alice/files/Folder/.DS_Store')
		assert.equal(dsStore.matched, true)
		assert.equal(dsStore.subType, 'os-junk')

		const pngBytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00])
		const magicMismatch = hygiene.inspectMagicBytes(pngBytes, 'image/jpeg', '/alice/files/fake.txt')
		assert.equal(magicMismatch.status, 'header-mismatch')
		assert.equal(magicMismatch.detectedFormat, 'PNG')

		const magicOk = hygiene.inspectMagicBytes(pngBytes, 'image/png', '/alice/files/real.png')
		assert.equal(magicOk.status, 'verified')

		const magicEmpty = hygiene.inspectMagicBytes(new Uint8Array(0), 'image/png', '/alice/files/zero.png')
		assert.equal(magicEmpty.status, 'empty')
	})

	test('analyzeFileHygiene, safe cleanup plan, and CWE-1236 CSV/JSON export enforce surviving-copy & origin protection', () => {
		const { hygiene } = loadHygieneModule()

		const groups = [
			{
				id: 101,
				hash: 'hash-img',
				acknowledged: false,
				files: [
					{ id: 1, nodeId: 11, path: '/alice/files/Origin/photo.jpg', size: 2048, mimetype: 'image/jpeg', isInOriginFolder: true },
					{ id: 2, nodeId: 12, path: '/alice/files/Temp/photo.txt', size: 2048, mimetype: 'image/jpeg', isInOriginFolder: false },
					{ id: 3, nodeId: 13, path: '/alice/files/Sync/photo (conflicted copy 2026-11-20).jpg', size: 2048, mimetype: 'image/jpeg', isInOriginFolder: false },
				],
			},
			{
				id: 102,
				hash: 'hash-zero',
				acknowledged: false,
				files: [
					{ id: 4, nodeId: 14, path: '/alice/files/A/empty.log', size: 0, mimetype: 'text/plain', isInOriginFolder: false },
					{ id: 5, nodeId: 15, path: '/alice/files/B/empty.log', size: 0, mimetype: 'text/plain', isInOriginFolder: false },
				],
			},
			{
				id: 103,
				hash: 'hash-xss',
				acknowledged: false,
				files: [
					{ id: 6, nodeId: 16, path: '/alice/files/=cmd/bad.tmp', size: 512, mimetype: 'text/plain', isInOriginFolder: false },
					{ id: 7, nodeId: 17, path: '/alice/files/Clean/ok.txt', size: 512, mimetype: 'text/plain', isInOriginFolder: false },
				],
			},
		]

		const analysis = hygiene.analyzeFileHygiene(groups)
		assert.equal(analysis.summary.byCategory['bad-extension'], 2)
		assert.equal(analysis.summary.byCategory['zero-byte'], 2)
		assert.equal(analysis.summary.byCategory['sync-conflict'], 2)
		assert.equal(analysis.summary.byCategory['mixed-extension-group'], 2)
		assert.equal(analysis.summary.affectedGroupCount, 3)

		const conflictOnly = hygiene.filterHygieneFindings(analysis.findings, { category: 'sync-conflict', query: 'conflicted' })
		assert.equal(conflictOnly.length, 1)
		assert.equal(conflictOnly[0].file.id, 3)

		// Safe clutter picks conflict & zero-byte while preserving at least 1 surviving copy in hash-zero
		const safeTokens = hygiene.pickSafeHygieneSelectionKeys(analysis.findings)
		const plan = hygiene.buildHygieneCleanupPlan(analysis.findings, safeTokens)
		assert.equal(plan.selectedCount, 3) // id 3 (conflict), id 4 (first zero-byte), id 6 (=cmd/bad.tmp)
		assert.ok(plan.selectedFiles.every(f => !f.isInOriginFolder))

		// Attempting to delete ALL copies of hash-zero must block the last copy
		const allZeroTokens = ['hash:hash-zero::4', 'hash:hash-zero::5']
		const blockedLastCopyPlan = hygiene.buildHygieneCleanupPlan(analysis.findings, allZeroTokens)
		assert.equal(blockedLastCopyPlan.selectedCount, 1)
		assert.equal(blockedLastCopyPlan.skippedLastCopyCount, 1)

		const csv = hygiene.buildHygieneAuditCsv(analysis.findings)
		assert.ok(csv.includes('\r\n'))
		assert.ok(csv.includes("'/alice/files/=cmd/bad.tmp") || csv.includes('"/alice/files/=cmd/bad.tmp"') || csv.includes('/alice/files/=cmd/bad.tmp'))

		// Direct formula prefix neutralization check
		const formulaFinding = [{
			category: 'sync-conflict',
			severity: 'warning',
			groupId: 1,
			groupHash: 'h',
			filePath: '=HYPERLINK("http://evil","click")',
			sizeBytes: 10,
			declaredMime: 'text/plain',
			currentExtension: 'tmp',
			suggestedExtension: '',
			isProtected: false,
			reason: '+SUM(A1)',
		}]
		const safeCsv = hygiene.buildHygieneAuditCsv(formulaFinding)
		assert.ok(safeCsv.includes("\"'=HYPERLINK"))
		assert.ok(safeCsv.includes("\"'+SUM(A1)\""))

		const json = JSON.parse(hygiene.buildHygieneAuditJson(analysis, '2026-11-23T12:00:00.000Z'))
		assert.equal(json.schema, hygiene.HYGIENE_REPORT_SCHEMA)
		assert.equal(json.exportedAt, '2026-11-23T12:00:00.000Z')
		assert.equal(json.findings.length, analysis.findings.length)
	})

	test('FileHygieneInspector.vue covers empty, clean, populated, filter-reset, header verification, safe cleanup, and XSS defense', async () => {
		const deletedCalls = []
		const Inspector = loadHygieneComponent({
			deleteFiles: async (files, opts) => {
				deletedCalls.push({ files, opts })
				return { success: files, errors: [], deletedNodeIds: files.map(f => f.nodeId) }
			},
		})

		// 1. Empty state
		const emptyVm = new Vue({
			render(h) {
				return h(Inspector, { props: { duplicates: [], allDuplicates: [] } })
			},
		}).$mount()
		await settle()
		assert.ok(emptyVm.$el.querySelector('.hygiene-inspector__empty'))
		emptyVm.$destroy()

		// 2. Clean state
		const cleanVm = new Vue({
			render(h) {
				return h(Inspector, {
					props: {
						duplicates: [{
							id: 1,
							hash: 'clean',
							files: [
								{ id: 1, path: '/alice/files/A/doc.pdf', size: 1024, mimetype: 'application/pdf', isInOriginFolder: false },
								{ id: 2, path: '/alice/files/B/doc.pdf', size: 1024, mimetype: 'application/pdf', isInOriginFolder: false },
							],
						}],
						allDuplicates: [],
					},
				})
			},
		}).$mount()
		await settle()
		assert.ok(cleanVm.$el.querySelector('.hygiene-inspector__clean'))
		cleanVm.$destroy()

		// 3. Populated + XSS + filter + header probe + safe delete
		const xssPath = '/alice/files/<img src=x onerror=alert(1)>/bad (conflicted copy 2026-11-23).txt'
		const popGroups = [
			{
				id: 55,
				hash: 'h55',
				files: [
					{
						id: 501,
						nodeId: 5010,
						path: '/alice/files/Origin/pic.jpg',
						size: 4096,
						mimetype: 'image/jpeg',
						isInOriginFolder: true,
					},
					{
						id: 502,
						nodeId: 5020,
						path: xssPath,
						size: 4096,
						mimetype: 'image/jpeg',
						downloadUrl: 'https://cloud.example.test/dav/bad',
						isInOriginFolder: false,
					},
				],
			},
		]

		const origFetch = global.fetch
		const origOC = global.window.OC
		global.fetch = async () => ({
			ok: true,
			arrayBuffer: async () => new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]).buffer,
		})

		try {
			const emittedDeletes = []
			const popVm = new Vue({
				render(h) {
					return h(Inspector, {
						props: {
							duplicates: popGroups,
							allDuplicates: popGroups,
							currentDuplicateId: 55,
						},
						on: {
							'hygiene-delete-completed': payload => emittedDeletes.push(payload),
						},
					})
				},
			}).$mount()
			await settle()

			// XSS safety: no injected <img> inside findings list
			assert.equal(popVm.$el.querySelectorAll('img').length, 0)
			assert.ok(popVm.$el.textContent.includes('<img src=x onerror=alert(1)>'))

			// Search filter no-match & reset
			const searchInput = popVm.$el.querySelector('.hygiene-inspector__search-input')
			searchInput.value = 'does-not-exist-anywhere'
			searchInput.dispatchEvent(new document.defaultView.Event('input'))
			await settle()
			assert.ok(popVm.$el.querySelector('.hygiene-inspector__clean'))

			const resetBtn = Array.from(popVm.$el.querySelectorAll('button')).find(b => b.textContent.includes('Reset filters'))
			resetBtn.click()
			await settle()
			assert.ok(popVm.$el.querySelectorAll('.hygiene-card').length >= 2)

			// Verify magic-byte header on first finding
			const verifyBtn = Array.from(popVm.$el.querySelectorAll('.hygiene-card__btn')).find(b => b.textContent.includes('Verify header'))
			verifyBtn.click()
			await settle()
			assert.ok(popVm.$el.querySelector('.hygiene-card__header-status').textContent.includes('PNG'))

			// Select safe clutter -> open confirmation dialog -> execute cleanup
			const selectSafeBtn = Array.from(popVm.$el.querySelectorAll('button')).find(b => b.textContent.includes('Select safe clutter'))
			selectSafeBtn.click()
			await settle()

			const cleanBtn = popVm.$el.querySelector('.hygiene-inspector__danger-btn')
			assert.equal(cleanBtn.disabled, false)
			cleanBtn.click()
			await settle()

			const confirmBtn = popVm.$el.querySelector('.hygiene-confirm-dialog__btn.is-danger')
			confirmBtn.click()
			await settle()

			assert.equal(deletedCalls.length, 1)
			assert.equal(deletedCalls[0].opts.allowLastCopy, false)
			assert.equal(deletedCalls[0].files[0].id, 502)
			assert.equal(emittedDeletes.length, 1)
			popVm.$destroy()
		} finally {
			global.fetch = origFetch
			global.window.OC = origOC
		}
	})

	test('App.vue and keyboardShortcuts.js wire i shortcut, topbar Hygiene button, and ? help dialog', async () => {
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'i' }), 'toggle-file-hygiene')
		assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'i', ctrlKey: true }), null)

		const icon = slotBox('span')
		const stub = name => ({
			name,
			props: ['duplicate', 'projectId', 'show', 'isScanning', 'duplicates', 'allDuplicates', 'currentDuplicateId'],
			render(h) {
				return h('div', { class: `stub-${name}` })
			},
		})
		const DuplicateNavigation = {
			name: 'DuplicateNavigation',
			props: ['acknowledgedDuplicates', 'unacknowledgedDuplicates'],
			methods: {
				getNavigableDuplicates() {
					return this.unacknowledgedDuplicates
				},
			},
			render(h) {
				return h('nav', { class: 'stub-nav' })
			},
		}

		const FileHygieneInspector = loadHygieneComponent()
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
			'./components/FileHygieneInspector.vue': { __esModule: true, default: FileHygieneInspector },
			'./components/LinkDeduplicationSimulator.vue': { __esModule: true, default: stub('link-simulator') },
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
			'./components/MeteorologyClimateVaultWorkbench.vue': { __esModule: true, default: stub('meteorology-climate-vault-auditor') },
			'./components/MaterialsMicroscopyVaultWorkbench.vue': { __esModule: true, default: stub('materials-microscopy-vault-auditor') },
			'./components/LidarPhotogrammetryVaultWorkbench.vue': { __esModule: true, default: stub('lidar-photogrammetry-vault-auditor') },
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
								{ id: 91, path: '/alice/files/a.jpg', size: 100, mimetype: 'image/jpeg', isInOriginFolder: true },
								{ id: 92, path: '/alice/files/a.txt', size: 100, mimetype: 'image/jpeg', isInOriginFolder: false },
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

		const topbarBtn = vm.$el.querySelector('.topbar-hygiene-button')
		assert.ok(topbarBtn)
		assert.equal(topbarBtn.getAttribute('aria-keyshortcuts'), 'i')
		assert.equal(topbarBtn.getAttribute('aria-pressed'), 'false')
		assert.equal(vm.$el.querySelector('.hygiene-inspector'), null)

		window.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: 'i', bubbles: true }))
		await settle()
		assert.equal(topbarBtn.getAttribute('aria-pressed'), 'true')
		assert.ok(vm.$el.querySelector('.hygiene-inspector'))

		// Documented in ? shortcuts dialog
		window.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: '?', bubbles: true }))
		await settle()
		const dialogText = vm.$el.querySelector('.shortcuts-dialog').textContent
		assert.ok(dialogText.includes('Toggle file hygiene'))

		// Ignored when key pressed inside input
		const input = document.createElement('input')
		document.body.appendChild(input)
		try {
			input.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: 'i', bubbles: true }))
			await settle()
			assert.equal(topbarBtn.getAttribute('aria-pressed'), 'true')
		} finally {
			document.body.removeChild(input)
		}

		topbarBtn.click()
		await settle()
		assert.equal(topbarBtn.getAttribute('aria-pressed'), 'false')
		assert.equal(vm.$el.querySelector('.hygiene-inspector'), null)

		vm.$destroy()
	})

	test('Cycle 123 files preserve zero U+2013/U+2014 dashes, zero XSS sinks, logical CSS, and >= 44px mobile touch targets', () => {
		const files = [
			'src/tools/fileHygieneInspector.js',
			'src/components/FileHygieneInspector.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
		]
		for (const relPath of files) {
			const content = readFileSync(resolve(root, relPath), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(content), false, `${relPath} must contain zero U+2013/U+2014 dashes`)
			assert.equal(/v-html|innerHTML|outerHTML|insertAdjacentHTML/.test(content), false, `${relPath} must contain zero HTML injection sinks`)
		}

		const vueSource = readFileSync(resolve(root, 'src/components/FileHygieneInspector.vue'), 'utf8')
		const styleSection = vueSource.slice(vueSource.indexOf('<style'))
		assert.equal(/margin-(left|right)|padding-(left|right)|border-(left|right)/.test(styleSection), false, 'FileHygieneInspector.vue must use logical CSS properties')
		assert.ok(styleSection.includes('min-block-size: 44px'), 'FileHygieneInspector.vue must enforce >= 44px touch targets on mobile')
	})
})
