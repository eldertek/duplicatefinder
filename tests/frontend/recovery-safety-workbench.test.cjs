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

function loadRecoveryModules() {
	const stats = loadModule('src/tools/duplicateStats.js')
	const pathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const selectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const audit = loadModule('src/tools/recoverySafetyAudit.js', {
		'./duplicateStats': stats,
		'./duplicatePathDiff': pathDiff,
		'./duplicateSelectionAndExport': selectionAndExport,
	})
	return { stats, pathDiff, selectionAndExport, audit }
}

function loadWorkbenchComponent(deps, overrides = {}) {
	return loadComponent('src/components/RecoverySafetyWorkbench.vue', {
		'../tools/api': {
			deleteFiles: async () => ({ success: [], errors: [] }),
			acknowledgeDuplicate: async () => {},
			...(overrides.api || {}),
		},
		'../tools/clipboardHelper': {
			copyTextSafely: async () => true,
			...(overrides.clipboard || {}),
		},
		'../tools/duplicateStats': deps.stats,
		'../tools/recoverySafetyAudit': deps.audit,
	})
}

const FIXED_NOW_MS = Date.UTC(2026, 10, 23, 12, 0, 0)

function createAuditFixtures() {
	const dayMs = 86400000
	return [
		{
			id: 101,
			hash: 'hash-critical-share',
			acknowledged: false,
			files: [
				{
					id: 1,
					nodeId: 9001,
					path: '/alice/files/Archive/Q4-Report.pdf',
					size: 2048000,
					mtime: Math.floor((FIXED_NOW_MS - 40 * dayMs) / 1000),
					isInOriginFolder: false,
				},
				{
					id: 2,
					nodeId: 9002,
					path: '/alice/files/Shared/Finance/Q4-Report (copy).pdf',
					size: 2048000,
					mtime: Math.floor((FIXED_NOW_MS - 12 * 3600000) / 1000),
					publicShare: true,
					isInOriginFolder: false,
				},
			],
		},
		{
			id: 102,
			hash: 'hash-safe-old',
			acknowledged: false,
			files: [
				{
					id: 3,
					nodeId: 9003,
					path: '/alice/files/Photos/2023/beach.jpg',
					size: 4096000,
					mtime: Math.floor((FIXED_NOW_MS - 120 * dayMs) / 1000),
					isInOriginFolder: true,
				},
				{
					id: 4,
					nodeId: 9004,
					path: '/alice/files/Downloads/beach.jpg',
					size: 4096000,
					mtime: Math.floor((FIXED_NOW_MS - 60 * dayMs) / 1000),
					isInOriginFolder: false,
				},
			],
		},
		{
			id: 103,
			hash: 'hash-all-protected',
			acknowledged: false,
			files: [
				{
					id: 5,
					nodeId: 9005,
					path: '/alice/files/OriginA/contract.pdf',
					size: 1024000,
					mtime: Math.floor((FIXED_NOW_MS - 2 * dayMs) / 1000),
					isInOriginFolder: true,
				},
				{
					id: 6,
					nodeId: 9006,
					path: '/alice/files/OriginB/contract.pdf',
					size: 1024000,
					mtime: Math.floor((FIXED_NOW_MS - 10 * dayMs) / 1000),
					isInOriginFolder: true,
				},
			],
		},
	]
}

describe('Cycle 129: Recovery Safety Manifest & Share-Impact Risk Pre-Check Workbench', () => {
	test('detects public share links, recent modifications, sensitive paths, and preserves protected origins', () => {
		const { audit } = loadRecoveryModules()
		const fixtures = createAuditFixtures()

		const report = audit.buildRecoverySafetyReport(fixtures, {
			nowMs: FIXED_NOW_MS,
			recentWindowDays: 7,
			keepStrategy: 'oldest',
			sortBy: 'risk-desc',
		})

		assert.equal(report.summary.totalGroups, 3)
		assert.equal(report.summary.tierCounts.critical, 1)
		assert.equal(report.summary.tierCounts.low, 2)
		assert.equal(report.summary.shareImpactFilesCount, 1)
		assert.equal(report.summary.publicLinkRiskCount, 1)
		assert.equal(report.summary.recentFilesCount, 1)
		assert.equal(report.summary.sensitiveFilesCount, 1)

		const criticalGroup = report.groups[0]
		assert.equal(criticalGroup.groupId, 101)
		assert.equal(criticalGroup.riskTier, 'critical')
		assert.equal(criticalGroup.riskScore, 100)
		assert.equal(criticalGroup.hasPublicLinkRisk, true)
		assert.equal(criticalGroup.shareDisparityRisk, true)
		assert.equal(criticalGroup.hasRecentRisk, true)
		assert.equal(criticalGroup.hasSensitiveRisk, true)
		assert.ok(criticalGroup.riskReasons.some(r => r.includes('Public link')))
		assert.ok(criticalGroup.riskReasons.some(r => r.includes('Modified within 24 hours')))

		const safeGroup = report.groups.find(g => g.groupId === 102)
		assert.equal(safeGroup.riskTier, 'low')
		assert.equal(safeGroup.riskScore, 0)
		assert.equal(safeGroup.survivors[0].isProtected, true)
		assert.equal(safeGroup.deletionCandidates[0].normalizedPath, '/Downloads/beach.jpg')

		const protectedOnly = report.groups.find(g => g.groupId === 103)
		assert.equal(protectedOnly.hasDeletableTargets, false)
		assert.equal(protectedOnly.allProtected, true)
		assert.equal(protectedOnly.deletionCandidates.length, 0)
	})

	test('generates POSIX-safe restore-from-trash.sh, JSON manifest v1, and CWE-1236 safe CSV', () => {
		const { audit } = loadRecoveryModules()

		const dangerousPathGroup = [
			{
				id: 201,
				hash: 'h-injection',
				acknowledged: false,
				files: [
					{
						id: 21,
						nodeId: 771,
						path: '/bob/files/Keep/clean.txt',
						size: 512,
						mtime: 1700000000,
						isInOriginFolder: false,
					},
					{
						id: 22,
						nodeId: 772,
						path: "/bob/files/o'hare $(whoami) `id`\n.txt",
						size: 512,
						mtime: 1700000500,
						isInOriginFolder: false,
					},
					{
						id: 23,
						nodeId: 773,
						path: '=CMD()|calc',
						size: 512,
						mtime: 1700000600,
						isInOriginFolder: false,
					},
				],
			},
		]

		const report = audit.buildRecoverySafetyReport(dangerousPathGroup, {
			nowMs: FIXED_NOW_MS,
		})

		const script = audit.buildRestoreFromTrashScript(report, {
			exportedAt: '2026-11-23T12:00:00.000Z',
		})
		assert.ok(script.startsWith('#!/usr/bin/env bash'))
		assert.ok(script.includes('set -euo pipefail'))
		assert.ok(script.includes("NC_USER='bob'"))
		assert.ok(script.includes("'\\''"))
		assert.ok(!script.includes('\n.txt'))

		const manifest = JSON.parse(audit.buildRecoveryManifestJson(report, {
			exportedAt: '2026-11-23T12:00:00.000Z',
		}))
		assert.equal(manifest.schema, 'duplicatefinder.recovery-manifest.v1')
		assert.equal(manifest.groups.length, 1)
		assert.equal(manifest.groups[0].keep.length, 1)
		assert.equal(manifest.groups[0].delete.length, 2)

		const csv = audit.buildRiskAuditCsv(report)
		const lines = csv.split('\r\n')
		assert.equal(lines.length, 4)
		assert.ok(lines[3].includes("'=CMD()|calc"), 'CWE-1236 leading = must be neutralized')
	})

	test('RecoverySafetyWorkbench.vue enforces recovery-kit gate, filters risk tiers, acknowledges, and cleans safe groups', async () => {
		const deps = loadRecoveryModules()
		const deleteCalls = []
		const ackCalls = []

		const Workbench = loadWorkbenchComponent(deps, {
			api: {
				deleteFiles: async files => {
					deleteCalls.push(files)
					return { success: files, errors: [] }
				},
				acknowledgeDuplicate: async hash => {
					ackCalls.push(hash)
				},
			},
		})

		const fixtures = createAuditFixtures()
		const emittedDeletes = []
		const emittedAcks = []

		const vm = new Vue({
			render(h) {
				return h(Workbench, {
					props: {
						duplicates: fixtures,
						allDuplicates: fixtures,
						currentDuplicateId: 102,
					},
					on: {
						'recovery-delete-completed': payload => emittedDeletes.push(payload),
						'recovery-acknowledge-completed': payload => emittedAcks.push(payload),
					},
				})
			},
		}).$mount()
		await settle()

		const cards = vm.$el.querySelectorAll('.recovery-group-card')
		assert.equal(cards.length, 3)

		// Toggle script preview and copy script (unlocks recovery kit gate)
		const previewBtn = Array.from(vm.$el.querySelectorAll('button')).find(btn => btn.textContent.includes('Preview restore-from-trash.sh'))
		assert.ok(previewBtn, 'Preview restore script button must exist')
		previewBtn.click()
		await settle()
		assert.ok(vm.$el.querySelector('.recovery-safety__script-code').textContent.includes('restore_trash_entry'))

		// Select safe low-risk groups (only group 102 has a deletable safe target; 103 is all protected)
		const selectSafeBtn = Array.from(vm.$el.querySelectorAll('button')).find(btn => btn.textContent.includes('Select safe low-risk'))
		selectSafeBtn.click()
		await settle()

		const cleanBtn = vm.$el.querySelector('.recovery-safety__danger-btn')
		assert.equal(cleanBtn.disabled, true, 'Batch delete must remain locked until recovery kit is exported')

		// Copy script to unlock recovery kit gate
		const copyBtn = Array.from(vm.$el.querySelectorAll('button')).find(btn => btn.textContent.includes('Copy script'))
		copyBtn.click()
		await settle()
		assert.equal(cleanBtn.disabled, false, 'Batch delete unlocks once recovery kit is copied/downloaded')

		// Acknowledge selected group first
		const ackBtn = Array.from(vm.$el.querySelectorAll('button')).find(btn => btn.textContent.includes('Acknowledge selected'))
		ackBtn.click()
		await settle()
		assert.deepEqual(ackCalls, ['hash-safe-old'])
		assert.equal(emittedAcks.length, 1)

		// Execute two-step safe batch delete
		cleanBtn.click()
		await settle()
		const confirmBtn = Array.from(vm.$el.querySelectorAll('.recovery-safety__danger-btn')).find(btn => btn.textContent.includes('Confirm delete'))
		assert.ok(confirmBtn, 'Two-step inline confirm button must appear')
		confirmBtn.click()
		await settle()

		assert.equal(deleteCalls.length, 1)
		assert.equal(deleteCalls[0].length, 1)
		assert.equal(deleteCalls[0][0].path, '/alice/files/Downloads/beach.jpg')
		assert.equal(emittedDeletes.length, 1)
		assert.equal(emittedDeletes[0].bytesReclaimed, 4096000)
	})

	test('App.vue integrates Recovery Audit button and q keyboard shortcut cleanly', async () => {
		const deps = loadRecoveryModules()
		const Workbench = loadWorkbenchComponent(deps)
		const stub = name => ({ name, render: h => h('div', { attrs: { 'data-stub': name } }) })

		const App = loadComponent('src/App.vue', {
			'@nextcloud/vue': {
				NcAppContent: slotBox('main'),
				NcContent: slotBox('div'),
				NcLoadingIcon: slotBox('span'),
				NcButton: {
					props: ['type', 'disabled'],
					render(h) {
						return h('button', { attrs: { type: 'button', disabled: this.disabled }, on: this.$listeners }, this.$slots.default)
					},
				},
				NcModal: slotBox('div'),
				NcAppSettingsDialog: slotBox('div'),
				NcAppSettingsSection: slotBox('section'),
			},
			'./components/DuplicateNavigation.vue': { __esModule: true, default: stub('stub-nav') },
			'./components/DuplicateDetails.vue': { __esModule: true, default: stub('stub-details') },
			'./components/DuplicateTreemap.vue': { __esModule: true, default: stub('treemap') },
			'./components/SpaceReclamationTimeline.vue': { __esModule: true, default: stub('history') },
			'./components/SimilarityInspector.vue': { __esModule: true, default: stub('similarity') },
			'./components/BatchAutoSelectWorkbench.vue': { __esModule: true, default: stub('batch') },
			'./components/FileHygieneInspector.vue': { __esModule: true, default: stub('file-hygiene') },
			'./components/LinkDeduplicationSimulator.vue': { __esModule: true, default: stub('link-simulator') },
			'./components/FolderPairMatrix.vue': { __esModule: true, default: stub('folder-matrix') },
			'./components/StorageFootprintAnalyzer.vue': { __esModule: true, default: stub('storage-footprint') },
			'./components/PhotoBurstTimeline.vue': { __esModule: true, default: stub('photo-bursts') },
			'./components/RecoverySafetyWorkbench.vue': { __esModule: true, default: Workbench },
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
			'./components/OriginFoldersSettings.vue': { __esModule: true, default: stub('origin') },
			'./components/ExcludedFoldersSettings.vue': { __esModule: true, default: stub('excluded') },
			'./components/BulkDeletionSettings.vue': { __esModule: true, default: stub('bulk') },
			'./components/ProjectsSettings.vue': { __esModule: true, default: stub('projects') },
			'./components/ProjectDuplicates.vue': { __esModule: true, default: stub('project-duplicates') },
			'./components/FilterSettings.vue': { __esModule: true, default: stub('filters') },
			'./components/help/OnboardingGuide.vue': { __esModule: true, default: stub('guide') },
			'./components/help/UsageExamples.vue': { __esModule: true, default: stub('examples') },
			'./components/help/FAQ.vue': { __esModule: true, default: stub('faq') },
			'@/tools/api': {
				fetchDuplicates: async type => ({
					entities: type === 'unacknowledged' ? createAuditFixtures() : [],
					pagination: { currentPage: 1, totalPages: 1, totalItems: type === 'unacknowledged' ? 3 : 0 },
				}),
				fetchProjects: async () => [],
				fetchScanStatus: async () => ({ running: false, completedSeq: 1 }),
				startUserScan: async () => ({ running: false, completedSeq: 1 }),
				notifyScanStarted: () => {},
				notifyScanCompleted: () => {},
				notifyScanFailed: () => {},
			},
			'@/tools/utils': loadModule('src/tools/utils.js', {
				'./notifications': { showErrorNotification: () => {} },
			}),
			'@/tools/keyboardShortcuts': loadModule('src/tools/keyboardShortcuts.js'),
			'@/tools/reclamationHistory': loadModule('src/tools/reclamationHistory.js', {
				'./duplicateFilters': loadModule('src/tools/duplicateFilters.js'),
				'./duplicateStats': deps.stats,
			}),
			'vue-material-design-icons/Folder': slotBox('span'),
			'vue-material-design-icons/FolderRemove': slotBox('span'),
			'vue-material-design-icons/FolderMultiple': slotBox('span'),
			'vue-material-design-icons/Delete': slotBox('span'),
			'vue-material-design-icons/FilterOutline': slotBox('span'),
		})

		const vm = new Vue({
			render: h => h(App),
		}).$mount()
		await settle()
		await settle()

		const topbarBtn = vm.$el.querySelector('.topbar-recovery-safety-button')
		assert.ok(topbarBtn, 'Topbar Recovery Audit button must render')
		assert.equal(topbarBtn.disabled, false)

		document.defaultView.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: 'q', bubbles: true }))
		await settle()
		assert.ok(vm.$el.querySelector('.recovery-safety-workbench'), 'Pressing q opens RecoverySafetyWorkbench')

		document.defaultView.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: 'q', bubbles: true }))
		await settle()
		assert.equal(vm.$el.querySelector('.recovery-safety-workbench'), null, 'Pressing q again hides RecoverySafetyWorkbench')
	})

	test('RecoverySafetyWorkbench.vue uses logical CSS, focus-visible, 44px mobile touch targets, and zero XSS/dash regressions', () => {
		const vueSource = readFileSync(resolve(root, 'src/components/RecoverySafetyWorkbench.vue'), 'utf8')
		assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(vueSource), false)
		assert.equal(/[\u2013\u2014]/.test(vueSource), false)
		const styleSection = vueSource.slice(vueSource.indexOf('<style'))
		assert.equal(/margin-(left|right)|padding-(left|right)|border-(left|right)/.test(styleSection), false)
		assert.ok(styleSection.includes(':focus-visible'))
		assert.ok(styleSection.includes('min-block-size: 44px'))
	})
})
