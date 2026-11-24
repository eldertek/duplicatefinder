const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window, document } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

/**
 * Load the pure Audio Production, DAW Project & Sample Library Vault auditor module for tests.
 *
 * @return {object} Loaded module exports.
 */
function loadAudioDawModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/audioDawVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

/**
 * Load AudioDawVaultWorkbench.vue with optional clipboard stub.
 *
 * @param {object} [clipboardImpl] Optional clipboard implementation.
 * @return {object} Vue component definition.
 */
function loadAudioDawWorkbench(clipboardImpl) {
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js')
	const audioDawVaultAuditor = loadAudioDawModule()
	return loadComponent('src/components/AudioDawVaultWorkbench.vue', {
		'../tools/clipboardHelper': clipboardImpl === undefined
			? clipboardHelper
			: { copyTextSafely: text => clipboardHelper.copyTextSafely(text, clipboardImpl) },
		'../tools/audioDawVaultAuditor': audioDawVaultAuditor,
	})
}

/**
 * Build synthetic duplicate clusters covering all 4 Audio Production & DAW Vault families.
 *
 * @return {Array<object>} Sample duplicate groups.
 */
function buildSampleAudioDawDuplicates() {
	const mib = 1024 * 1024
	const refSec = 1796500000
	return [
		{
			id: 9961,
			hash: 'sha256-ableton-master-project-v4',
			size: 180 * mib,
			acknowledged: false,
			files: [
				{
					id: 99611,
					path: '/studio-vault/Sessions/NeonHorizon/NeonHorizon_v4.als',
					size: 180 * mib,
					mtime: refSec - 2 * 86400,
				},
				{
					id: 99612,
					path: '/master-vault/Sessions/NeonHorizon/NeonHorizon_v4.als',
					size: 180 * mib,
					mtime: refSec - 2 * 86400,
				},
				{
					id: 99613,
					path: '/alice/files/Downloads/NeonHorizon/NeonHorizon_v4.als',
					size: 180 * mib,
					mtime: refSec - 1 * 86400,
				},
			],
		},
		{
			id: 9962,
			hash: 'sha256-wav-24bit-master-anchor',
			size: 640 * mib,
			acknowledged: false,
			files: [
				{
					id: 99621,
					path: '/Masters/NeonHorizon/NeonHorizon_24bit_48k_Master.wav',
					size: 640 * mib,
					mtime: refSec - 3 * 86400,
				},
				{
					id: 99622,
					path: '/Final-Masters/NeonHorizon/NeonHorizon_24bit_48k_Master.wav',
					size: 640 * mib,
					mtime: refSec - 3 * 86400,
				},
			],
		},
		{
			id: 9963,
			hash: 'sha256-reaper-peaks-cache-stale',
			size: 48 * mib,
			acknowledged: false,
			files: [
				{
					id: 99631,
					path: '/studio-vault/Sessions/NeonHorizon/Peak Files/LeadVocal.wav.reapeaks',
					size: 48 * mib,
					mtime: refSec - 30 * 86400,
				},
				{
					id: 99632,
					path: '/studio-vault/Sessions/NeonHorizon/Backup/LeadVocal.wav.reapeaks',
					size: 48 * mib,
					mtime: refSec - 31 * 86400,
				},
				{
					id: 99633,
					path: '/Downloads/NeonHorizon/LeadVocal.wav.reapeaks',
					size: 48 * mib,
					mtime: refSec - 32 * 86400,
				},
			],
		},
		{
			id: 9964,
			hash: 'sha256-kontakt-nki-sample-library',
			size: 320 * mib,
			acknowledged: false,
			files: [
				{
					id: 99641,
					path: '/studio-vault/Kontakt/GrandPiano/ConcertGrand.nki',
					size: 320 * mib,
					mtime: refSec - 20 * 86400,
				},
				{
					id: 99642,
					path: '/Sample-Packs/Kontakt/GrandPiano/ConcertGrand.nki',
					size: 320 * mib,
					mtime: refSec - 19 * 86400,
				},
				{
					id: 99643,
					path: '/Downloads/Sample-Packs/GrandPiano/ConcertGrand (1).nki',
					size: 320 * mib,
					mtime: refSec - 18 * 86400,
				},
			],
		},
		{
			id: 9965,
			hash: 'sha256-splice-drum-sample-pack-wav',
			size: 72 * mib,
			acknowledged: false,
			files: [
				{
					id: 99651,
					path: '/studio-vault/Splice/AnalogDrums/KSHMR_Kick_01.wav',
					size: 72 * mib,
					mtime: refSec - 25 * 86400,
				},
				{
					id: 99652,
					path: '/Samples/AnalogDrums/KSHMR_Kick_01_copy.wav',
					size: 72 * mib,
					mtime: refSec - 24 * 86400,
				},
			],
		},
		{
			id: 9966,
			hash: 'sha256-formula-injection-stem-mp3',
			size: 16 * mib,
			acknowledged: false,
			files: [
				{
					id: 99661,
					path: '=cmd|calc/studio-vault/Sessions/DemoTrack/rough_mix.mp3',
					size: 16 * mib,
					mtime: refSec - 6 * 86400,
				},
				{
					id: 99662,
					path: '=cmd|calc/Downloads/DemoTrack/rough_mix.mp3',
					size: 16 * mib,
					mtime: refSec - 5 * 86400,
				},
			],
		},
	]
}

describe('Cycle 179: Audio Production, DAW Project & Sample Library Vault Auditor', () => {
	test('classifies all 4 audio/DAW families and extracts session, revision, and audio signature deterministically', () => {
		const mod = loadAudioDawModule()

		const als = mod.classifyAudioDawFile({ path: '/studio-vault/Sessions/NeonHorizon/NeonHorizon_v4.als' })
		assert.equal(als.family, 'daw-projects')
		assert.equal(als.dawHost, 'Ableton Live')
		assert.equal(als.sessionName, 'neonhorizon')
		assert.equal(als.revisionNumber, 4)

		const rpp = mod.classifyAudioDawFile({ path: '/studio-vault/Projects/FilmScore/Cue01.rpp' })
		assert.equal(rpp.family, 'daw-projects')
		assert.equal(rpp.dawHost, 'REAPER')

		const wavMaster = mod.classifyAudioDawFile({ path: '/Masters/NeonHorizon/NeonHorizon_24bit_48k_Master.wav' })
		assert.equal(wavMaster.family, 'rendered-stems-bounces')
		assert.equal(wavMaster.is24BitWavMaster, true)
		assert.equal(wavMaster.isLossless, true)

		const nki = mod.classifyAudioDawFile({ path: '/studio-vault/Kontakt/GrandPiano/ConcertGrand.nki' })
		assert.equal(nki.family, 'sample-instrument-libraries')
		assert.equal(nki.dawHost, 'Kontakt')

		const sampleWav = mod.classifyAudioDawFile({ path: '/Splice/AnalogDrums/KSHMR_Kick_01_copy.wav' })
		assert.equal(sampleWav.family, 'sample-instrument-libraries')
		assert.equal(sampleWav.audioSignature, 'kshmr-kick-01')

		const peaks = mod.classifyAudioDawFile({ path: '/studio-vault/Sessions/NeonHorizon/Peak Files/LeadVocal.wav.reapeaks' })
		assert.equal(peaks.family, 'daw-autosave-peak-caches')
		assert.equal(peaks.dawHost, 'REAPER')
		assert.equal(peaks.audioSignature, 'leadvocal')

		const backupAls = mod.classifyAudioDawFile({ path: '/studio-vault/Sessions/NeonHorizon/Backup/NeonHorizon_autosave.als' })
		assert.equal(backupAls.family, 'daw-autosave-peak-caches')

		const unrelated = mod.classifyAudioDawFile({ path: '/Documents/invoice.pdf' })
		assert.equal(unrelated, null)
	})

	test('shields latest master DAW projects and 24-bit WAV master anchors by default and computes safe reclaimable GB', () => {
		const mod = loadAudioDawModule()
		const report = mod.analyzeAudioDawVault(buildSampleAudioDawDuplicates())

		assert.equal(report.schema, mod.AUDIO_DAW_VAULT_SCHEMA)
		assert.equal(report.summary.totalClustersCount, 6)
		assert.equal(report.summary.totalMasterProjectClusters, 1)
		assert.equal(report.summary.total24BitWavMasterClusters, 1)
		assert.ok(report.summary.totalReclaimableBytes > 0)
		assert.match(report.summary.reclaimableGb, /^\d+\.\d{2} GB$/)

		// Latest master DAW project: both vault copies shielded, only Downloads copy reclaimed
		const projectCluster = report.clusters.find(c => c.primaryGroupId === 9961)
		assert.ok(projectCluster)
		assert.equal(projectCluster.isLatestMasterProject, true)
		const vaultCopies = projectCluster.members.filter(m => m.meta.inMasterVault)
		const downloadCopy = projectCluster.members.find(m => m.path.includes('/Downloads/'))
		assert.equal(vaultCopies.length, 2)
		assert.equal(vaultCopies[0].verdict, 'keep-canonical-survivor')
		assert.equal(vaultCopies[1].verdict, 'blocked-latest-master-project')
		assert.equal(vaultCopies[1].actionType, 'keep')
		assert.equal(downloadCopy.actionType, 'prune')

		// 24-bit WAV master in Masters & Final-Masters: both shielded by default
		const wavMasterCluster = report.clusters.find(c => c.primaryGroupId === 9962)
		assert.ok(wavMasterCluster)
		assert.equal(wavMasterCluster.has24BitWavMaster, true)
		assert.equal(wavMasterCluster.reclaimableCopiesCount, 0)
		assert.equal(wavMasterCluster.riskState, 'wav-master-protected')

		// Stale .reapeaks cache copies are reclaimable
		const peaksCluster = report.clusters.find(c => c.primaryGroupId === 9963)
		assert.ok(peaksCluster)
		assert.equal(peaksCluster.reclaimableCopiesCount, 2)

		// Sample library copies are reclaimable
		const nkiCluster = report.clusters.find(c => c.primaryGroupId === 9964)
		assert.ok(nkiCluster)
		assert.equal(nkiCluster.reclaimableCopiesCount, 2)
	})

	test('generates safe POSIX DRY_RUN=1 script, CWE-1236 CSV, JSON manifest, and .sync-exclude.lst rules', () => {
		const mod = loadAudioDawModule()
		const analysis = mod.analyzeAudioDawVault(buildSampleAudioDawDuplicates(), {
			strategy: 'consolidate-sample-library-hardlinks',
		})

		const script = mod.buildAudioDawRemediationScript(analysis, { dataRoot: '/srv/nextcloud/data' })
		assert.ok(script.startsWith('#!/usr/bin/env sh'))
		assert.ok(script.includes('set -eu'))
		assert.ok(script.includes('DRY_RUN="$' + '{DRY_RUN:-1}"'))
		assert.ok(script.includes('ln -f '))

		const csv = mod.buildAudioDawCsvReport(analysis)
		assert.ok(csv.includes('Session,Revision,AudioSignature'))
		// CWE-1236 neutralization for leading '=' formula injection
		assert.ok(csv.includes("'=cmd|calc/"), 'CSV must neutralize leading = with single quote')

		const jsonStr = mod.buildAudioDawJsonReport(analysis)
		const parsed = JSON.parse(jsonStr)
		assert.equal(parsed.schema, mod.AUDIO_DAW_VAULT_SCHEMA)
		assert.equal(parsed.clusters.length, 6)

		const syncExclude = mod.buildAudioDawSyncExcludeSnippet(analysis)
		assert.ok(syncExclude.includes('*.reapeaks'))
		assert.ok(syncExclude.includes('*.asd'))
		assert.ok(syncExclude.includes('*.pkf'))
		assert.ok(syncExclude.includes('Backup/'))
	})

	test('AudioDawVaultWorkbench.vue renders clusters, applies presets, toggles guards, overrides verdicts, and copies script', async () => {
		const copied = []
		const Workbench = loadAudioDawWorkbench({
			writeText: async text => {
				copied.push(text)
			},
		})
		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: buildSampleAudioDawDuplicates(),
					allDuplicates: buildSampleAudioDawDuplicates(),
				},
			}),
		}).$mount(mountNode)

		try {
			await settle()
			assert.equal(vm.$el.classList.contains('audio-daw-vault-workbench'), true)
			assert.equal(vm.$el.querySelectorAll('.adv__cluster-card').length, 6)

			// Apply Sample Libraries preset
			const presetBtns = Array.from(vm.$el.querySelectorAll('.adv__seg-btn'))
			const samplePreset = presetBtns.find(b => b.textContent.includes('Hardlink-Consolidate Samples'))
			assert.ok(samplePreset)
			samplePreset.click()
			await settle()
			assert.equal(vm.$el.querySelectorAll('.adv__cluster-card').length, 2)

			// Reset to All DAW & Sample Vault Audit
			const allPreset = presetBtns.find(b => b.textContent.includes('All DAW & Sample Vault Audit'))
			allPreset.click()
			await settle()
			assert.equal(vm.$el.querySelectorAll('.adv__cluster-card').length, 6)

			// Copy DRY_RUN=1 script
			const copyBtn = Array.from(vm.$el.querySelectorAll('.adv__tool-btn')).find(b => b.textContent.includes('Copy DRY_RUN=1 Script'))
			assert.ok(copyBtn)
			copyBtn.click()
			await settle()
			assert.equal(copied.length, 1)
			assert.ok(copied[0].includes('DRY_RUN="$' + '{DRY_RUN:-1}"'))
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('App.vue wires AudioDawVaultWorkbench with Shift+J shortcut without breaking unshifted j', async () => {
		window.localStorage.clear()
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		const statsModule = loadModule('src/tools/duplicateStats.js')
		const AudioDawVaultWorkbench = loadAudioDawWorkbench()

		const slotBox = tag => ({
			render(h) {
				return h(tag, this.$slots.default)
			},
		})
		const icon = slotBox('span')
		const stub = name => ({
			name,
			props: ['duplicate', 'projectId', 'show', 'isScanning'],
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
			'./components/LinkDeduplicationSimulator.vue': { __esModule: true, default: stub('link') },
			'./components/FolderPairMatrix.vue': { __esModule: true, default: stub('matrix') },
			'./components/StorageFootprintAnalyzer.vue': { __esModule: true, default: stub('footprint') },
			'./components/PhotoBurstTimeline.vue': { __esModule: true, default: stub('burst') },
			'./components/RecoverySafetyWorkbench.vue': { __esModule: true, default: stub('recovery') },
			'./components/ArchivePayloadInspector.vue': { __esModule: true, default: stub('archive') },
			'./components/AudioTagWorkbench.vue': { __esModule: true, default: stub('audio') },
			'./components/VideoSceneWorkbench.vue': { __esModule: true, default: stub('video') },
			'./components/SidecarSweepWorkbench.vue': { __esModule: true, default: stub('sidecar') },
			'./components/RuleProfilesWorkbench.vue': { __esModule: true, default: stub('rules') },
			'./components/DocumentLineageWorkbench.vue': { __esModule: true, default: stub('doc') },
			'./components/PhotoPerceptualWorkbench.vue': { __esModule: true, default: stub('photo') },
			'./components/BrokenMediaQuarantineWorkbench.vue': { __esModule: true, default: stub('broken') },
			'./components/RetentionAgeWorkbench.vue': { __esModule: true, default: stub('retention') },
			'./components/FilenameCollisionWorkbench.vue': { __esModule: true, default: stub('collision') },
			'./components/QuotaAttributionWorkbench.vue': { __esModule: true, default: stub('quota') },
			'./components/PreviewCacheWorkbench.vue': { __esModule: true, default: stub('preview') },
			'./components/ShareMountAuditorWorkbench.vue': { __esModule: true, default: stub('share') },
			'./components/BackupDriftWorkbench.vue': { __esModule: true, default: stub('backup') },
			'./components/AutomationRulebookWorkbench.vue': { __esModule: true, default: stub('auto') },
			'./components/MetadataConsolidationWorkbench.vue': { __esModule: true, default: stub('meta') },
			'./components/ForensicVerifierWorkbench.vue': { __esModule: true, default: stub('forensic') },
			'./components/InodeSafetyWorkbench.vue': { __esModule: true, default: stub('inode') },
			'./components/ShadowReclaimWorkbench.vue': { __esModule: true, default: stub('shadow') },
			'./components/JunkPairInspectorWorkbench.vue': { __esModule: true, default: stub('junk') },
			'./components/MediaFidelityWorkbench.vue': { __esModule: true, default: stub('fidelity') },
			'./components/CdcChunkingWorkbench.vue': { __esModule: true, default: stub('cdc') },
			'./components/OpsScheduleWorkbench.vue': { __esModule: true, default: stub('ops') },
			'./components/LegalHoldWorkbench.vue': { __esModule: true, default: stub('legal') },
			'./components/RansomwareCanaryWorkbench.vue': { __esModule: true, default: stub('canary') },
			'./components/DevTreeReclaimerWorkbench.vue': { __esModule: true, default: stub('devtree') },
			'./components/ConflictStormWorkbench.vue': { __esModule: true, default: stub('conflict') },
			'./components/VmCowReflinkWorkbench.vue': { __esModule: true, default: stub('vmcow') },
			'./components/ScientificBundleWorkbench.vue': { __esModule: true, default: stub('sci') },
			'./components/BrandKitAuditorWorkbench.vue': { __esModule: true, default: stub('brand') },
			'./components/LogTelemetryWorkbench.vue': { __esModule: true, default: stub('log') },
			'./components/InstallerRepoWorkbench.vue': { __esModule: true, default: stub('installer') },
			'./components/WorkbookDriftWorkbench.vue': { __esModule: true, default: stub('workbook') },
			'./components/MailboxArchiveWorkbench.vue': { __esModule: true, default: stub('mailbox') },
			'./components/CadVaultWorkbench.vue': { __esModule: true, default: stub('cad') },
			'./components/WebBuildMediaWorkbench.vue': { __esModule: true, default: stub('webbuild') },
			'./components/LegalDocumentOcrWorkbench.vue': { __esModule: true, default: stub('legalocr') },
			'./components/BackupTakeoutWorkbench.vue': { __esModule: true, default: stub('takeout') },
			'./components/DawAudioStemWorkbench.vue': { __esModule: true, default: stub('daw') },
			'./components/VfxRenderCacheWorkbench.vue': { __esModule: true, default: stub('vfx') },
			'./components/ElearningScormWorkbench.vue': { __esModule: true, default: stub('scorm') },
			'./components/PhotoRawCatalogWorkbench.vue': { __esModule: true, default: stub('photoraw') },
			'./components/VmContainerImageWorkbench.vue': { __esModule: true, default: stub('vmcontainer') },
			'./components/MlDatasetArtifactWorkbench.vue': { __esModule: true, default: stub('mldataset') },
			'./components/Game3dAssetVaultWorkbench.vue': { __esModule: true, default: stub('game3d') },
			'./components/DatabaseDumpLogWorkbench.vue': { __esModule: true, default: stub('dblog') },
			'./components/DesignPublishingVaultWorkbench.vue': { __esModule: true, default: stub('designpub') },
			'./components/ReleaseBinaryArtifactWorkbench.vue': { __esModule: true, default: stub('release-binary-artifact-auditor') },
			'./components/EmailArchiveVaultWorkbench.vue': { __esModule: true, default: stub('email-archive-vault-auditor') },
			'./components/AudioDawVaultWorkbench.vue': { __esModule: true, default: AudioDawVaultWorkbench },
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
			'./components/OriginFoldersSettings.vue': { __esModule: true, default: stub('origin') },
			'./components/ExcludedFoldersSettings.vue': { __esModule: true, default: stub('excluded') },
			'./components/BulkDeletionSettings.vue': { __esModule: true, default: stub('bulk') },
			'./components/ProjectsSettings.vue': { __esModule: true, default: stub('projects') },
			'./components/ProjectDuplicates.vue': { __esModule: true, default: stub('project-dups') },
			'./components/help/OnboardingGuide.vue': { __esModule: true, default: stub('guide') },
			'./components/help/UsageExamples.vue': { __esModule: true, default: stub('examples') },
			'./components/help/FAQ.vue': { __esModule: true, default: stub('faq') },
			'./components/FilterSettings.vue': { __esModule: true, default: stub('filters') },
			'@/tools/api': {
				fetchDuplicates: async type => ({
					entities: type === 'unacknowledged' ? buildSampleAudioDawDuplicates() : [],
					pagination: { currentPage: 1, totalPages: 1, totalItems: 6, hasMore: false },
				}),
				fetchProjects: async () => [],
			},
			'@/tools/utils': utils,
			'@/tools/keyboardShortcuts': keyboardShortcuts,
			'@/tools/reclamationHistory': loadModule('src/tools/reclamationHistory.js', {
				'./duplicateFilters': loadModule('src/tools/duplicateFilters.js'),
				'./duplicateStats': statsModule,
			}),
			'vue-material-design-icons/Folder': icon,
			'vue-material-design-icons/FolderRemove': icon,
			'vue-material-design-icons/FolderMultiple': icon,
			'vue-material-design-icons/Delete': icon,
			'vue-material-design-icons/FilterOutline': icon,
		})

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue(App).$mount(mountNode)
		try {
			await settle()

			// Unshifted j still resolves to next-duplicate
			assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'j', shiftKey: false }), 'next-duplicate')
			assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'J', shiftKey: true }), 'toggle-audio-daw-vault-auditor')

			const btn = vm.$el.querySelector('button.topbar-audio-daw-vault-button')
			assert.ok(btn, 'Audio DAW Vault button is rendered in topbar')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'Shift+J')
			assert.equal(vm.$el.querySelector('.audio-daw-vault-workbench'), null)

			// Shift+J opens workbench
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'J', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.ok(vm.$el.querySelector('.audio-daw-vault-workbench'), 'AudioDawVaultWorkbench must open on Shift+J shortcut')

			// Shift+J again closes workbench
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'J', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.$el.querySelector('.audio-daw-vault-workbench'), null, 'AudioDawVaultWorkbench must toggle closed on Shift+J shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new Audio DAW Vault files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/audioDawVaultAuditor.js',
			'src/components/AudioDawVaultWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
		]
		for (const rel of files) {
			const content = readFileSync(resolve(root, rel), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(content), false, `No U+2013/U+2014 in ${rel}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `No XSS sink in ${rel}`)
		}
	})
})
