const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window } = require('./helpers.cjs')

function loadCanaryModules() {
	const duplicateStats = loadModule('src/tools/duplicateStats.js', {})
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js', {})
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js', {})
	const ransomwareCanaryGuard = loadModule('src/tools/ransomwareCanaryGuard.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
	return {
		duplicateStats,
		duplicatePathDiff,
		duplicateSelectionAndExport,
		ransomwareCanaryGuard,
	}
}

function loadCanaryWorkbench() {
	const { ransomwareCanaryGuard } = loadCanaryModules()
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js', {})
	return loadComponent('src/components/RansomwareCanaryWorkbench.vue', {
		'../tools/clipboardHelper': clipboardHelper,
		'../tools/ransomwareCanaryGuard': ransomwareCanaryGuard,
	})
}

function buildSampleAnomalyDuplicates() {
	const baseWave = 1732500000000
	return [
		{
			id: 901,
			hash: 'rc-drift-01',
			size: 48 * 1024 * 1024,
			files: [
				{
					id: 9001,
					path: '/alice/files/Finance/q4-audit-report.pdf',
					size: 48 * 1024 * 1024,
					mtime: baseWave - 86400000,
					isOrigin: true,
				},
				{
					id: 9002,
					path: '/alice/files/DesktopSync/q4-audit-report.pdf.locked',
					size: 48 * 1024 * 1024,
					mtime: baseWave + 60000,
					entropy: 7.97,
					mime: 'application/octet-stream',
				},
			],
		},
		{
			id: 902,
			hash: 'rc-canary-02',
			size: 1024 * 1024,
			files: [
				{
					id: 9003,
					path: '/__groupfolders/4/_000_canary/tripwire-ledger.csv',
					size: 1024 * 1024,
					mtime: baseWave + 120000,
					entropy: 7.94,
				},
				{
					id: 9004,
					path: '/bob/files/Shared/_000_canary/tripwire-ledger.csv.enc',
					size: 1024 * 1024,
					mtime: baseWave + 150000,
					entropy: 7.98,
				},
			],
		},
		{
			id: 903,
			hash: 'rc-note-03',
			size: 4096,
			files: [
				{
					id: 9005,
					path: '/alice/files/README_DECRYPT.txt',
					size: 4096,
					mtime: baseWave + 180000,
				},
				{
					id: 9006,
					path: '/bob/files/Projects/README_DECRYPT.txt',
					size: 4096,
					mtime: baseWave + 210000,
				},
			],
		},
		{
			id: 904,
			hash: 'rc-clean-04',
			size: 12 * 1024 * 1024,
			files: [
				{
					id: 9007,
					path: '/carol/files/Photos/summer-archive.tar.gz',
					size: 12 * 1024 * 1024,
					mtime: baseWave - 604800000,
					entropy: 7.96,
				},
				{
					id: 9008,
					path: '/carol/files/Backups/summer-archive.tar.gz',
					size: 12 * 1024 * 1024,
					mtime: baseWave - 604700000,
					entropy: 7.96,
				},
			],
		},
		{
			id: 905,
			hash: '=CMD("calc")',
			size: 2048,
			files: [
				{
					id: 9009,
					path: '/alice/files/Vault/ledger.txt',
					size: 2048,
					mtime: baseWave + 240000,
					entropy: 7.95,
				},
				{
					id: 9010,
					path: '/alice/files/ledger.txt',
					size: 2048,
					mtime: baseWave - 4000000,
					entropy: 4.1,
				},
			],
		},
	]
}

test('RansomwareCanaryGuard pure engine and RansomwareCanaryWorkbench.vue', async t => {
	await t.test('sanitizes incident IDs, admin tokens, entropy normalization, and safe pattern compilation', () => {
		const { ransomwareCanaryGuard } = loadCanaryModules()
		assert.equal(ransomwareCanaryGuard.sanitizeIncidentId('  inc 2026 / #77! '), 'INC-2026-77')
		assert.equal(ransomwareCanaryGuard.sanitizeIncidentId(''), 'INC-2026-001')
		assert.equal(ransomwareCanaryGuard.sanitizeAdminId(' sec-ops;rm -rf '), 'sec-opsrm-rf')
		assert.equal(ransomwareCanaryGuard.normalizeEntropyBits(0.99), 7.92)
		assert.equal(ransomwareCanaryGuard.normalizeEntropyBits(7.91), 7.91)
		assert.equal(ransomwareCanaryGuard.normalizeEntropyBits(null), null)

		const safeReDoS = ransomwareCanaryGuard.compileSafePattern('(a+)+b')
		assert.equal(typeof safeReDoS, 'function')
		assert.equal(safeReDoS('/alice/(a+)+b/file.txt'), true)
	})

	await t.test('detects extension drift, canary tripwires, ransom notes, entropy spikes, burst waves, and shields clean survivors', () => {
		const { ransomwareCanaryGuard } = loadCanaryModules()
		const report = ransomwareCanaryGuard.evaluateRansomwareCanaryGuard(buildSampleAnomalyDuplicates(), {
			incidentId: 'INC-2026-88',
			entropyThreshold: 7.85,
			burstWindowMinutes: 15,
			burstMinFiles: 3,
			quarantineBulkDelete: true,
		})

		assert.equal(report.policy.incidentId, 'INC-2026-88')
		assert.equal(report.summary.totalGroups, 5)
		assert.equal(report.summary.extensionDriftCount, 2)
		assert.equal(report.summary.canaryTripwireCount, 1)
		assert.equal(report.summary.ransomNoteCount, 1)
		assert.equal(report.summary.entropyAnomalyCount, 3)
		assert.equal(report.summary.burstWindowCount, 1)
		assert.equal(report.summary.bulkDeletionQuarantineActive, true)
		assert.equal(report.summary.cleanGroupsCount, 1)

		// Benign .tar.gz with high natural entropy must stay clean
		const cleanArchiveGroup = report.groups.find(g => g.groupId === 904)
		assert.equal(cleanArchiveGroup.quarantineStatus, 'clean')
		assert.equal(cleanArchiveGroup.bulkDeleteBlocked, false)

		// Drifted group must pick the clean PDF original as protected survivor, never .pdf.locked
		const driftGroup = report.groups.find(g => g.groupId === 901)
		assert.equal(driftGroup.quarantineStatus, 'quarantined')
		assert.equal(driftGroup.bulkDeleteBlocked, true)
		assert.equal(driftGroup.cleanSurvivorProtected, true)
		assert.equal(driftGroup.survivorPath, '/alice/files/Finance/q4-audit-report.pdf')
		assert.ok(driftGroup.findings.includes('extension_drift'))
		assert.ok(driftGroup.findings.includes('high_entropy_anomaly'))

		// Canary + all-suspect group must hold all copies
		const canaryGroup = report.groups.find(g => g.groupId === 902)
		assert.equal(canaryGroup.quarantineStatus, 'hold-all')
		assert.equal(canaryGroup.bulkDeleteBlocked, true)
	})

	await t.test('validates admin verification clearance, exports CWE-1236 CSV/JSON, and generates non-destructive occ script', () => {
		const { ransomwareCanaryGuard } = loadCanaryModules()
		const invalid = ransomwareCanaryGuard.validateVerificationInput({ verifierId: '', reason: 'ok' })
		assert.equal(invalid.valid, false)
		assert.ok(invalid.errors.length >= 1)

		const valid = ransomwareCanaryGuard.validateVerificationInput({
			verifierId: 'sec-lead',
			reason: 'Confirmed clean PDF checksum matches nightly ZFS snapshot',
		})
		assert.equal(valid.valid, true)

		const report = ransomwareCanaryGuard.evaluateRansomwareCanaryGuard(buildSampleAnomalyDuplicates(), {
			incidentId: 'INC-2026-99',
			verifiedRegistry: {
				'id:901': {
					groupKey: 'id:901',
					incidentId: 'INC-2026-99',
					verifiedBy: valid.verifierId,
					reason: valid.reason,
					verifiedAtIso: '2026-11-24T01:00:00.000Z',
				},
			},
		})

		const verifiedGroup = report.groups.find(g => g.groupId === 901)
		assert.equal(verifiedGroup.quarantineStatus, 'verified-safe')
		assert.equal(verifiedGroup.bulkDeleteBlocked, false)
		assert.equal(report.summary.verifiedSafeCount, 1)

		const jsonText = ransomwareCanaryGuard.exportRansomwareGuardJson(report, '2026-11-24T01:00:00.000Z')
		const parsed = JSON.parse(jsonText)
		assert.equal(parsed.schema, ransomwareCanaryGuard.RANSOMWARE_CANARY_SCHEMA)
		assert.equal(parsed.groups.length, 5)

		const csv = ransomwareCanaryGuard.exportRansomwareGuardCsv(report)
		assert.ok(csv.includes('"\'=CMD(""calc"")"'))
		assert.ok(csv.includes('quarantine_status'))

		const script = ransomwareCanaryGuard.buildRansomwareContainmentScript(report)
		assert.ok(script.includes('set -euo pipefail'))
		assert.ok(script.includes('sha256sum'))
		assert.ok(script.includes('files:scan'))
		assert.equal(/\brm\s+-rf\b|\brm\s+/.test(script), false)
	})

	await t.test('RansomwareCanaryWorkbench.vue renders empty & populated states, unclamped numeric inputs, and admin verification flow', async () => {
		window.localStorage.clear()
		const Workbench = loadCanaryWorkbench()

		const emptyVm = new Vue({
			render: h => h(Workbench, { props: { duplicates: [], allDuplicates: [] } }),
		}).$mount()
		await settle()
		assert.ok(emptyVm.$el.textContent.includes('Scan storage'))

		const events = []
		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: buildSampleAnomalyDuplicates(),
					allDuplicates: buildSampleAnomalyDuplicates(),
					currentDuplicateId: 901,
				},
				on: {
					'select-duplicate': item => events.push(['select', item.id]),
					'compare-duplicate': item => events.push(['compare', item.id]),
					close: () => events.push(['close']),
				},
			}),
		}).$mount()
		await settle()

		const workbenchCmp = vm.$children[0]
		assert.ok(vm.$el.textContent.includes('Quarantined Groups'))
		workbenchCmp.selectedGroupKey = 'id:901'
		await settle()
		assert.ok(vm.$el.textContent.includes('PROTECTED CLEAN SURVIVOR'))

		// Numeric input must not be clamped mid-keystroke
		workbenchCmp.entropyThresholdInput = ''
		await settle()
		assert.equal(workbenchCmp.entropyThresholdInput, '')
		workbenchCmp.entropyThresholdInput = '7.75'
		await settle()

		// Preset switch
		workbenchCmp.applyPreset('desktop-sync-burst')
		await settle()
		assert.equal(workbenchCmp.presetId, 'desktop-sync-burst')

		// Select group 901 and verify quarantine release
		workbenchCmp.selectedGroupKey = 'id:901'
		workbenchCmp.verifierIdInput = 'sec-admin'
		workbenchCmp.verificationReasonInput = 'Verified clean original matches backup manifest'
		workbenchCmp.verifySelectedGroup()
		await settle()
		assert.equal(workbenchCmp.selectedGroup.quarantineStatus, 'verified-safe')
		assert.equal(workbenchCmp.selectedGroup.bulkDeleteBlocked, false)

		// Lock back into quarantine
		workbenchCmp.lockSelectedInQuarantine()
		await settle()
		assert.equal(workbenchCmp.selectedGroup.quarantineStatus, 'quarantined')
		assert.equal(workbenchCmp.selectedGroup.bulkDeleteBlocked, true)

		const buttons = Array.from(vm.$el.querySelectorAll('button'))
		const inspectBtn = buttons.find(btn => btn.textContent.includes('Inspect group'))
		assert.ok(inspectBtn)
		inspectBtn.click()
		await settle()
		assert.deepEqual(events[0], ['select', 901])

		emptyVm.$destroy()
		vm.$destroy()
	})

	await t.test('App.vue wires * shortcut and RansomwareCanaryWorkbench cleanly', async () => {
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
		const CanaryWorkbench = loadCanaryWorkbench()
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
			'./components/RansomwareCanaryWorkbench.vue': { __esModule: true, default: CanaryWorkbench },
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
					entities: status === 'acknowledged' ? [] : buildSampleAnomalyDuplicates(),
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

		const topbarBtn = vm.$el.querySelector('.topbar-ransomware-canary-button')
		assert.ok(topbarBtn, 'Topbar Canary Guard button must exist')

		const action = keyboardShortcuts.resolveShortcutAction({ key: '*', shiftKey: true, target: vm.$el })
		assert.equal(action, 'toggle-ransomware-canary-guard')

		topbarBtn.click()
		await settle()
		assert.ok(vm.$el.querySelector('.ransomware-canary-workbench'), 'RansomwareCanaryWorkbench must mount on click')

		window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '*', shiftKey: true, bubbles: true }))
		await settle()
		assert.equal(vm.$el.querySelector('.ransomware-canary-workbench'), null, 'RansomwareCanaryWorkbench must toggle closed on * shortcut')

		vm.$destroy()
	})

	await t.test('keeps zero U+2013/U+2014 typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/ransomwareCanaryGuard.js',
			'src/components/RansomwareCanaryWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
		]
		for (const relPath of files) {
			const content = readFileSync(resolve(__dirname, '../..', relPath), 'utf8')
			assert.equal(content.includes('\u2013'), false, `Unexpected U+2013 in ${relPath}`)
			assert.equal(content.includes('\u2014'), false, `Unexpected U+2014 in ${relPath}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `Unexpected XSS sink in ${relPath}`)
		}
		const vueContent = readFileSync(resolve(__dirname, '../..', 'src/components/RansomwareCanaryWorkbench.vue'), 'utf8')
		assert.ok(vueContent.includes('min-block-size: 44px'))
		assert.ok(vueContent.includes(':focus-visible'))
	})
})
