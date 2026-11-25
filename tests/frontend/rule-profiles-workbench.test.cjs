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

const stub = name => ({
	name,
	render(h) {
		return h('div', { class: `stub-${name}` }, this.$slots.default)
	},
})

function createMemoryStorage() {
	const map = new Map()
	return {
		getItem(key) {
			return map.has(key) ? map.get(key) : null
		},
		setItem(key, value) {
			map.set(key, String(value))
		},
		removeItem(key) {
			map.delete(key)
		},
	}
}

function loadEngineDeps() {
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const ruleProfilesEngine = loadModule('src/tools/ruleProfilesEngine.js', {
		'./duplicateStats': duplicateStats,
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
	})
	return {
		duplicateStats,
		duplicatePathDiff,
		duplicateSelectionAndExport,
		ruleProfilesEngine,
	}
}

function createWorkbenchComponent({ apiOverrides = {} } = {}) {
	const deps = loadEngineDeps()
	const Workbench = loadComponent('src/components/RuleProfilesWorkbench.vue', {
		'../tools/api': {
			deleteFiles: async files => ({ success: files, errors: [] }),
			...apiOverrides,
		},
		'../tools/duplicateStats': deps.duplicateStats,
		'../tools/duplicatePathDiff': deps.duplicatePathDiff,
		'../tools/duplicateSelectionAndExport': deps.duplicateSelectionAndExport,
		'../tools/ruleProfilesEngine': deps.ruleProfilesEngine,
	})
	return { Workbench, ...deps }
}

describe('Cycle 134: Cleanup Rule Profiles, Regex Exclusion Presets & Batch Audit Log Workbench (5 shortcut)', () => {
	test('compileSafeRegex, ReDoS guard, and buildRegexMatchSegments handle safe and malicious inputs cleanly', () => {
		const { ruleProfilesEngine } = loadEngineDeps()

		const valid = ruleProfilesEngine.compileSafeRegex('(Photos|Originals)', 'imxg')
		assert.ok(valid.regex instanceof RegExp)
		assert.equal(valid.error, '')
		assert.equal(valid.flags, 'im')

		const badSyntax = ruleProfilesEngine.compileSafeRegex('([unclosed', 'i')
		assert.equal(badSyntax.regex, null)
		assert.ok(badSyntax.error.length > 0)

		const redos = ruleProfilesEngine.compileSafeRegex('(.+)+$', 'i')
		assert.equal(redos.regex, null)
		assert.ok(redos.error.includes('nested quantifiers'))

		const tooLong = ruleProfilesEngine.compileSafeRegex('a'.repeat(250), 'i')
		assert.equal(tooLong.regex, null)
		assert.ok(tooLong.error.includes('maximum length'))

		const segments = ruleProfilesEngine.buildRegexMatchSegments('/alice/files/Photos/img.jpg', /(Photos)/i)
		assert.deepEqual(segments, [
			{ text: '/alice/files/', matched: false },
			{ text: 'Photos', matched: true },
			{ text: '/img.jpg', matched: false },
		])
	})

	test('evaluateRegexExclusions and evaluateRuleProfilePlan enforce origin protection, regex weights, manual overrides, and batch cap', () => {
		const { ruleProfilesEngine } = loadEngineDeps()

		const duplicates = [
			{
				id: 101,
				hash: 'aaaa1111bbbb2222',
				acknowledged: false,
				files: [
					{ id: 1, nodeId: 11, path: '/alice/files/Originals/IMG_001.jpg', size: 4000, mtime: 1700000500, isInOriginFolder: true },
					{ id: 2, nodeId: 12, path: '/alice/files/Downloads/IMG_001 (1).jpg', size: 4000, mtime: 1700000900, isInOriginFolder: false },
					{ id: 3, nodeId: 13, path: '/alice/files/RAW/IMG_001.cr2', size: 24000, mtime: 1700000100, isInOriginFolder: false },
				],
			},
			{
				id: 102,
				hash: 'cccc3333dddd4444',
				acknowledged: false,
				files: [
					{ id: 4, nodeId: 14, path: '/alice/files/Photos/Vacation.jpg', size: 2500, mtime: 1700000200, isInOriginFolder: false },
					{ id: 5, nodeId: 15, path: '/alice/files/Temp/Vacation copy.jpg', size: 2500, mtime: 1700000800, isInOriginFolder: false },
					{ id: 6, nodeId: 16, path: '/alice/files/Shared/Vacation.jpg', size: 2500, mtime: 1700000300, isInOriginFolder: false, isShared: true },
				],
			},
		]

		const profile = ruleProfilesEngine.BUILTIN_RULE_PROFILES[0] // Safe Photos & Originals
		const exclusions = ruleProfilesEngine.evaluateRegexExclusions(duplicates, profile)
		assert.equal(exclusions.matchedCount, 1)
		assert.equal(exclusions.matchedFiles[0].path, '/alice/files/RAW/IMG_001.cr2')

		const plan = ruleProfilesEngine.evaluateRuleProfilePlan(duplicates, profile)
		assert.equal(plan.summary.totalGroups, 2)
		assert.equal(plan.summary.markedCount, 2)
		assert.equal(plan.summary.markedBytes, 6500)
		// Group 101 keeps Origin, shields CR2, marks Downloads (1)
		assert.equal(plan.groups[0].survivor.file.id, 1)
		assert.equal(plan.groups[0].shieldedEntries.length, 1)
		assert.equal(plan.groups[0].markedEntries[0].file.id, 2)
		// Group 102 keeps /Photos, shields isShared copy, marks Temp copy
		assert.equal(plan.groups[1].survivor.file.id, 4)
		assert.equal(plan.groups[1].shieldedEntries[0].file.id, 6)
		assert.equal(plan.groups[1].markedEntries[0].file.id, 5)

		// Batch cap defers second marked file without clamping invalid inputs
		const capped = ruleProfilesEngine.evaluateRuleProfilePlan(duplicates, profile, { maxBatchOverride: '1' })
		assert.equal(capped.summary.markedCount, 1)
		assert.equal(capped.summary.deferredCount, 1)

		const invalidCap = ruleProfilesEngine.evaluateRuleProfilePlan(duplicates, profile, { maxBatchOverride: 'abc' })
		assert.ok(invalidCap.summary.batchCapError.includes('whole number'))

		// Manual survivor promotion overrides score ranking
		const keyOfTemp = ruleProfilesEngine.evaluateRuleProfilePlan(duplicates, profile).groups[1].markedEntries[0].key
		const promoted = ruleProfilesEngine.evaluateRuleProfilePlan(duplicates, profile, {
			promotedByGroup: { 102: keyOfTemp },
		})
		assert.equal(promoted.groups[1].survivor.file.id, 5)
	})

	test('profile persistence, JSON import/export, audit log, CWE-1236 CSV safety, and shell-quoted restore script work deterministically', () => {
		const { ruleProfilesEngine } = loadEngineDeps()
		const storage = createMemoryStorage()

		const customProfile = ruleProfilesEngine.sanitizeRuleProfile({
			id: 'custom-work',
			name: 'Office Cleanup',
			preferredRegex: '(^|/)Docs(/|$)',
			demotedRegex: '(^|/)Inbox(/|$)',
			activeExclusionPresets: ['os_junk'],
			builtin: false,
		})
		ruleProfilesEngine.saveCustomRuleProfiles([customProfile], storage)
		const loaded = ruleProfilesEngine.loadCustomRuleProfiles(storage)
		assert.equal(loaded.length, 1)
		assert.equal(loaded[0].name, 'Office Cleanup')

		const exportedJson = ruleProfilesEngine.exportRuleProfileJson(loaded[0])
		const imported = ruleProfilesEngine.parseImportedRuleProfile(exportedJson)
		assert.equal(imported.ok, true)
		assert.equal(imported.profile.name, 'Office Cleanup')
		assert.equal(imported.profile.builtin, false)

		const badImport = ruleProfilesEngine.parseImportedRuleProfile('{not-json')
		assert.equal(badImport.ok, false)

		const updatedLog = ruleProfilesEngine.appendRuleAuditEntry({
			id: 'audit-1',
			timestamp: 1700001000000,
			status: 'completed',
			profileId: 'custom-work',
			profileName: '=CMD|calc!A0',
			deletedCount: 1,
			failedCount: 0,
			shieldedCount: 2,
			bytesReclaimed: 4096,
			items: [
				{
					path: "/alice/files/Inbox/o'malley $(whoami).pdf",
					survivorPath: '/alice/files/Docs/report.pdf',
					size: 4096,
					nodeId: 99,
					outcome: 'deleted',
				},
			],
		}, storage)
		assert.equal(updatedLog.length, 1)

		const csv = ruleProfilesEngine.exportAuditLogCsv(updatedLog)
		assert.ok(csv.includes("'=CMD|calc!A0"), 'CSV must neutralize leading = formula injection (CWE-1236)')

		const script = ruleProfilesEngine.buildTrashbinRestorePlan(updatedLog[0])
		assert.ok(script.includes("o'\"'\"'malley $(whoami).pdf"), 'Restore script must single-quote paths safely')

		const markedRestored = ruleProfilesEngine.updateAuditEntryStatus('audit-1', 'restored', storage)
		assert.equal(markedRestored[0].status, 'restored')
	})

	test('RuleProfilesWorkbench.vue renders empty, populated, non-clamping inputs, live <mark> tester, batch execution, audit log, and XSS defense', async () => {
		window.localStorage.clear()
		const deletedCalls = []
		const { Workbench } = createWorkbenchComponent({
			apiOverrides: {
				deleteFiles: async files => {
					deletedCalls.push(...files)
					return { success: files, errors: [] }
				},
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

		const xssPath = '/alice/files/Downloads/<img src=x onerror=alert(1)> copy.jpg'
		const sampleDuplicates = [
			{
				id: 501,
				hash: 'face5010deadbeef',
				acknowledged: false,
				files: [
					{ id: 10, nodeId: 100, path: '/alice/files/Photos/master.jpg', size: 8000, mtime: 1700000100, isInOriginFolder: false },
					{ id: 11, nodeId: 101, path: xssPath, size: 8000, mtime: 1700000200, isInOriginFolder: false },
				],
			},
		]

		const emittedCompleted = []
		const vm = new Vue({
			render(h) {
				return h(Workbench, {
					props: {
						duplicates: sampleDuplicates,
						allDuplicates: sampleDuplicates,
						currentDuplicateId: 501,
					},
					on: {
						'rule-delete-completed': payload => emittedCompleted.push(payload),
					},
				})
			},
		}).$mount()
		await settle()

		// Zero XSS execution: path appears as escaped textContent
		assert.equal(vm.$el.querySelectorAll('img').length, 0)
		assert.ok(vm.$el.textContent.includes('<img src=x onerror=alert(1)>'))

		// Non-clamping numeric batch cap input preserves user keystroke and displays validation alert
		const capInput = vm.$el.querySelector('#rule-max-batch-input')
		capInput.value = 'abc'
		capInput.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }))
		await settle()
		assert.equal(capInput.value, 'abc')
		assert.ok(vm.$el.querySelector('.rule-workbench__alert').textContent.includes('whole number'))

		// Clear invalid cap so batch can execute
		capInput.value = ''
		capInput.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }))
		await settle()

		// Switch to Regex Exclusions tab and test live regex <mark> preview
		const exclusionsTab = vm.$el.querySelector('#rule-tab-exclusions')
		exclusionsTab.click()
		await settle()
		const testerInput = vm.$el.querySelector('#custom-excl-pattern')
		testerInput.value = 'onerror'
		testerInput.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }))
		await settle()
		const marks = vm.$el.querySelectorAll('mark.rule-match-mark')
		assert.ok(marks.length >= 1)
		assert.equal(marks[0].textContent, 'onerror')

		// Switch back to Profiles tab and execute batch via confirmation dialog
		vm.$el.querySelector('#rule-tab-profiles').click()
		await settle()
		const execBtn = vm.$el.querySelector('.rule-workbench__execute-actions .rule-workbench__danger-btn')
		assert.equal(execBtn.disabled, false)
		execBtn.click()
		await settle()
		const confirmBtn = vm.$el.querySelector('.rule-confirm-dialog .rule-workbench__danger-btn')
		confirmBtn.click()
		await settle()

		assert.equal(deletedCalls.length, 1)
		assert.equal(deletedCalls[0].id, 11)
		assert.equal(emittedCompleted.length, 1)

		// Audit Log tab displays the recorded batch
		vm.$el.querySelector('#rule-tab-audit').click()
		await settle()
		assert.ok(vm.$el.querySelectorAll('.rule-audit-card').length >= 1)
		assert.ok(vm.$el.textContent.includes('Deleted: 1'))

		vm.$destroy()
	})

	test('App.vue + keyboardShortcuts wire 5 shortcut, topbar Rule Profiles button, and help dialog', async () => {
		const { Workbench } = createWorkbenchComponent()
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		const reclamationHistory = loadModule('src/tools/reclamationHistory.js', {
			'./duplicateFilters': loadModule('src/tools/duplicateFilters.js'),
			'./duplicateStats': loadModule('src/tools/duplicateStats.js'),
		})

		const duplicatesPayload = [
			{
				id: 951,
				hash: 'rule9510',
				acknowledged: false,
				files: [
					{ id: 1, nodeId: 11, path: '/alice/files/Photos/DSC_001.jpg', size: 3000, mtime: 1700000000, isInOriginFolder: false },
					{ id: 2, nodeId: 12, path: '/alice/files/Downloads/DSC_001 (1).jpg', size: 3000, mtime: 1700000100, isInOriginFolder: false },
				],
			},
		]

		const App = loadComponent('src/App.vue', {
			'@nextcloud/vue': {
				NcAppContent: slotBox('main'),
				NcContent: slotBox('div'),
				NcLoadingIcon: stub('nc-loading'),
				NcButton: slotBox('button'),
				NcModal: slotBox('div'),
				NcAppSettingsDialog: slotBox('div'),
				NcAppSettingsSection: slotBox('section'),
			},
			'./components/DuplicateNavigation.vue': { __esModule: true, default: stub('dup-nav') },
			'./components/DuplicateDetails.vue': { __esModule: true, default: stub('dup-details') },
			'./components/DuplicateTreemap.vue': { __esModule: true, default: stub('dup-treemap') },
			'./components/SpaceReclamationTimeline.vue': { __esModule: true, default: stub('reclamation-timeline') },
			'./components/SimilarityInspector.vue': { __esModule: true, default: stub('similarity-inspector') },
			'./components/BatchAutoSelectWorkbench.vue': { __esModule: true, default: stub('batch-auto-select') },
			'./components/FileHygieneInspector.vue': { __esModule: true, default: stub('file-hygiene-inspector') },
			'./components/LinkDeduplicationSimulator.vue': { __esModule: true, default: stub('link-simulator') },
			'./components/FolderPairMatrix.vue': { __esModule: true, default: stub('folder-pair-matrix') },
			'./components/StorageFootprintAnalyzer.vue': { __esModule: true, default: stub('storage-footprint-analyzer') },
			'./components/PhotoBurstTimeline.vue': { __esModule: true, default: stub('photo-bursts') },
			'./components/RecoverySafetyWorkbench.vue': { __esModule: true, default: stub('recovery-safety') },
			'./components/ArchivePayloadInspector.vue': { __esModule: true, default: stub('archive-inspector') },
			'./components/AudioTagWorkbench.vue': { __esModule: true, default: stub('audio-workbench') },
			'./components/VideoSceneWorkbench.vue': { __esModule: true, default: stub('video-workbench') },
			'./components/SidecarSweepWorkbench.vue': { __esModule: true, default: stub('sidecar-sweep') },
			'./components/RuleProfilesWorkbench.vue': { __esModule: true, default: Workbench },
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
			'./components/MocapBiomechanicsVaultWorkbench.vue': { __esModule: true, default: stub('mocap-biomechanics-vault-auditor') },
			'./components/NeuroscienceElectrophysVaultWorkbench.vue': { __esModule: true, default: stub('neuroscience-electrophys-vault-auditor') },
			'./components/OrbitalSpacecraftVaultWorkbench.vue': { __esModule: true, default: stub('orbital-spacecraft-vault-auditor') },
			'./components/ParticlePhysicsHepVaultWorkbench.vue': { __esModule: true, default: stub('particle-physics-hep-vault-auditor') },
			'./components/QuantumQubitPulseVaultWorkbench.vue': { __esModule: true, default: stub('quantum-qubit-pulse-vault-auditor') },
			'./components/RailwaySignalingTelemetryVaultWorkbench.vue': { __esModule: true, default: stub('railway-signaling-telemetry-vault-auditor') },
			'./components/OriginFoldersSettings.vue': { __esModule: true, default: stub('origin') },
			'./components/ExcludedFoldersSettings.vue': { __esModule: true, default: stub('excluded') },
			'./components/BulkDeletionSettings.vue': { __esModule: true, default: stub('bulk') },
			'./components/ProjectsSettings.vue': { __esModule: true, default: stub('projects') },
			'./components/ProjectDuplicates.vue': { __esModule: true, default: stub('proj-dups') },
			'./components/help/OnboardingGuide.vue': { __esModule: true, default: stub('onboarding') },
			'./components/help/UsageExamples.vue': { __esModule: true, default: stub('usage') },
			'./components/help/FAQ.vue': { __esModule: true, default: stub('faq') },
			'./components/FilterSettings.vue': { __esModule: true, default: stub('filter-settings') },
			'vue-material-design-icons/Folder': stub('icon-folder'),
			'vue-material-design-icons/FolderRemove': stub('icon-folder-remove'),
			'vue-material-design-icons/FolderMultiple': stub('icon-folder-multiple'),
			'vue-material-design-icons/Delete': stub('icon-delete'),
			'vue-material-design-icons/FilterOutline': stub('icon-filter'),
			'@/tools/api': {
				fetchDuplicates: async type => ({
					entities: type === 'unacknowledged' ? duplicatesPayload : [],
					pagination: { currentPage: 1, totalPages: 1, totalItems: type === 'unacknowledged' ? 1 : 0 },
				}),
				fetchProjects: async () => [],
				fetchScanStatus: async () => null,
				startUserScan: async () => null,
				notifyScanStarted: () => {},
				notifyScanCompleted: () => {},
				notifyScanFailed: () => {},
			},
			'@/tools/utils': utils,
			'@/tools/keyboardShortcuts': keyboardShortcuts,
			'@/tools/reclamationHistory': reclamationHistory,
		})

		const vm = new Vue(App).$mount()
		await settle()

		const topbarBtn = vm.$el.querySelector('.topbar-rule-profiles-button')
		assert.ok(topbarBtn, 'Topbar Rule Profiles button exists')
		assert.equal(topbarBtn.getAttribute('aria-keyshortcuts'), '5')

		document.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: '5', bubbles: true }))
		await settle()
		assert.ok(vm.$el.querySelector('.rule-profiles-workbench'), 'Pressing 5 opens RuleProfilesWorkbench')

		document.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: '5', bubbles: true }))
		await settle()
		assert.equal(vm.$el.querySelector('.rule-profiles-workbench'), null, 'Pressing 5 again hides RuleProfilesWorkbench')

		document.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: '?', shiftKey: true, bubbles: true }))
		await settle()
		const helpDialog = vm.$el.querySelector('dialog.shortcuts-dialog')
		assert.ok(helpDialog.textContent.includes('Toggle cleanup rule profiles, regex exclusions and batch audit log'))

		vm.$destroy()
	})

	test('Cycle 134 touched files preserve zero U+2013/U+2014 dashes, zero XSS sinks, logical CSS, and >= 44px mobile touch targets', () => {
		const files = [
			'src/tools/ruleProfilesEngine.js',
			'src/components/RuleProfilesWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
			'tests/frontend/rule-profiles-workbench.test.cjs',
		]
		for (const relPath of files) {
			const content = readFileSync(resolve(root, relPath), 'utf8')
			assert.equal(content.includes('\u2013'), false, `${relPath} must not contain U+2013`)
			assert.equal(content.includes('\u2014'), false, `${relPath} must not contain U+2014`)
			assert.equal(/\bv-html\b|\.innerHTML\s*=|\.outerHTML\s*=|document\.write\s*\(/.test(content), false, `${relPath} must have zero XSS sinks`)
		}
		const vueSource = readFileSync(resolve(root, 'src/components/RuleProfilesWorkbench.vue'), 'utf8')
		assert.ok(vueSource.includes('minmax(0, 1fr)'))
		assert.ok(vueSource.includes('min-block-size: 44px'))
		assert.ok(vueSource.includes(':focus-visible'))
		assert.ok(vueSource.includes('padding-inline'))
	})
})
