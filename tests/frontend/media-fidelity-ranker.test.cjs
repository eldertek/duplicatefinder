const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle } = require('./helpers.cjs')

function loadFidelityModules() {
	const duplicateStats = loadModule('src/tools/duplicateStats.js', {})
	const duplicateFilters = loadModule('src/tools/duplicateFilters.js', {})
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js', {})
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js', {})
	const visualMediaInspector = loadModule('src/tools/visualMediaInspector.js', {})
	const mediaFidelityRanker = loadModule('src/tools/mediaFidelityRanker.js', {
		'./duplicateFilters': duplicateFilters,
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
		'./visualMediaInspector': visualMediaInspector,
	})
	return {
		duplicateStats,
		duplicateFilters,
		duplicatePathDiff,
		duplicateSelectionAndExport,
		visualMediaInspector,
		mediaFidelityRanker,
	}
}

function loadFidelityWorkbench(apiMock = {}) {
	const { mediaFidelityRanker } = loadFidelityModules()
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js', {})
	return loadComponent('src/components/MediaFidelityWorkbench.vue', {
		'../tools/api': {
			deleteFiles: apiMock.deleteFiles || (async () => ({ deleted: [], failed: [] })),
		},
		'../tools/clipboardHelper': clipboardHelper,
		'../tools/mediaFidelityRanker': mediaFidelityRanker,
	})
}

function buildFlacHeaderBytes(sampleRate, channels, bitsPerSample) {
	const bytes = new Uint8Array(42)
	bytes[0] = 0x66
	bytes[1] = 0x4c
	bytes[2] = 0x61
	bytes[3] = 0x43
	bytes[4] = 0x00 // STREAMINFO
	// Sample rate (20 bits) | channels-1 (3 bits) | bitsPerSample-1 (5 bits)
	const chBits = (channels - 1) & 0x07
	const bpsBits = (bitsPerSample - 1) & 0x1f
	bytes[18] = (sampleRate >> 12) & 0xff
	bytes[19] = (sampleRate >> 4) & 0xff
	bytes[20] = ((sampleRate & 0x0f) << 4) | (chBits << 1) | ((bpsBits >> 4) & 0x01)
	bytes[21] = (bpsBits & 0x0f) << 4
	return bytes
}

function buildMp3Id3HeaderBytes() {
	// ID3v2.3 (0 bytes body) + MPEG-1 Layer III 128kbps 44100Hz frame sync
	return Uint8Array.from([
		0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
		0xff, 0xfb, 0x90, 0x00,
	])
}

function buildSampleFidelityDuplicates() {
	return [
		{
			id: 101,
			hash: 'img-raw-hash',
			size: 28000000,
			files: [
				{
					id: 1001,
					path: '/alice/files/Studio/Alpine_Sunset.dng',
					size: 28000000,
					mtime: 1731000000000,
					width: 6000,
					height: 4000,
					bitDepth: 14,
					hasExif: true,
					cameraModel: 'Fujifilm X-T5',
				},
			],
		},
		{
			id: 102,
			hash: 'img-jpg-hash',
			size: 950000,
			files: [
				{
					id: 1002,
					path: '/alice/files/WhatsApp/Alpine_Sunset_whatsapp.jpg',
					size: 950000,
					mtime: 1731000050000,
					width: 1600,
					height: 1066,
					bitDepth: 8,
					hasExif: false,
				},
				{
					id: 1003,
					path: '/alice/files/Exports/Alpine_Sunset_web.jpg',
					size: 1450000,
					mtime: 1731000060000,
					width: 2400,
					height: 1600,
					bitDepth: 8,
					hasExif: true,
				},
			],
		},
		{
			id: 103,
			hash: 'aud-flac-hash',
			size: 42000000,
			files: [
				{
					id: 1004,
					path: '/bob/files/Masters/Symphony_No9.flac',
					size: 42000000,
					mtime: 1731000100000,
					inlineBuffer: buildFlacHeaderBytes(96000, 2, 24),
					hasId3: true,
				},
			],
		},
		{
			id: 104,
			hash: 'aud-mp3-hash',
			size: 4500000,
			files: [
				{
					id: 1005,
					path: '/bob/files/Mobile/Symphony_No9_128k.mp3',
					size: 4500000,
					mtime: 1731000120000,
					inlineBuffer: buildMp3Id3HeaderBytes(),
				},
				{
					id: 1006,
					path: '/bob/files/Originals/Symphony_No9_upscaled_from_mp3.wav',
					size: 62000000,
					mtime: 1731000130000,
					sampleRate: 22050,
					bitDepth: 16,
				},
			],
		},
		{
			id: 105,
			hash: 'doc-docx-hash',
			size: 320000,
			files: [
				{
					id: 1007,
					path: '/alice/files/Legal/Contract_2026.docx',
					size: 320000,
					mtime: 1731000200000,
					isOriginFolder: true,
				},
			],
		},
		{
			id: 106,
			hash: 'doc-pdf-hash',
			size: 4800000,
			files: [
				{
					id: 1008,
					path: '/alice/files/Legal/Contract_2026_scanned.pdf',
					size: 4800000,
					mtime: 1731000250000,
					inlineBuffer: new TextEncoder().encode('%PDF-1.4\n1 0 obj << /Filter /DCTDecode >> endobj'),
				},
			],
		},
	]
}

test('Cycle 150: Media Fidelity & Transcode-Loss Ranker suite', async t => {
	await t.test('normalizeMediaStem and probeMediaHeaderBytes extract stem & codec telemetry accurately', () => {
		const { mediaFidelityRanker } = loadFidelityModules()

		const stemA = mediaFidelityRanker.normalizeMediaStem('Alpine_Sunset_whatsapp (1).jpg')
		assert.equal(stemA.canonicalStem, 'alpine-sunset')
		assert.ok(stemA.suffixHits.length >= 2)

		const flacMeta = mediaFidelityRanker.probeMediaHeaderBytes(
			buildFlacHeaderBytes(96000, 2, 24),
			'audio',
			'flac'
		)
		assert.equal(flacMeta.sampleRate, 96000)
		assert.equal(flacMeta.channels, 2)
		assert.equal(flacMeta.bitDepth, 24)
		assert.equal(flacMeta.probedFromBytes, true)

		const mp3Meta = mediaFidelityRanker.probeMediaHeaderBytes(
			buildMp3Id3HeaderBytes(),
			'audio',
			'mp3'
		)
		assert.equal(mp3Meta.bitrateKbps, 128)
		assert.equal(mp3Meta.sampleRate, 44100)
		assert.equal(mp3Meta.hasId3, true)

		const scannedPdf = mediaFidelityRanker.probeMediaHeaderBytes(
			new TextEncoder().encode('%PDF-1.4\n1 0 obj << /Filter /DCTDecode >> endobj'),
			'document',
			'pdf'
		)
		assert.equal(scannedPdf.isScanned, true)
		assert.equal(scannedPdf.hasFonts, false)
	})

	await t.test('analyzeMediaFidelity ranks true RAW/FLAC/DOCX masters above lossy & bloated upscales', () => {
		const { mediaFidelityRanker } = loadFidelityModules()
		const duplicates = buildSampleFidelityDuplicates()
		const report = mediaFidelityRanker.analyzeMediaFidelity(duplicates)

		assert.equal(report.schema, 'duplicatefinder.media-fidelity-ranker.v1')
		assert.equal(report.summary.totalClusters, 3)
		assert.ok(report.summary.bloatAlertCount >= 1)
		assert.ok(report.summary.safeQuarantineCount >= 4)

		const imageCluster = report.items.find(c => c.family === 'image')
		assert.ok(imageCluster)
		assert.equal(imageCluster.masterEntry.fileName, 'Alpine_Sunset.dng')
		assert.equal(imageCluster.masterEntry.decision.actionVerdict, 'keep-master')
		assert.equal(imageCluster.quarantineEntries.length, 2)

		const audioCluster = report.items.find(c => c.family === 'audio')
		assert.ok(audioCluster)
		assert.equal(audioCluster.masterEntry.fileName, 'Symphony_No9.flac')
		assert.equal(audioCluster.hasBloatRisk, true)
		const wavBloat = audioCluster.entries.find(e => e.fileName.endsWith('.wav'))
		assert.ok(wavBloat)
		assert.equal(wavBloat.scoring.isBloatedUpscale, true)
		assert.equal(wavBloat.decision.actionVerdict, 'review-bloat')

		const docCluster = report.items.find(c => c.family === 'document')
		assert.ok(docCluster)
		assert.equal(docCluster.masterEntry.fileName, 'Contract_2026.docx')
		const pdfScan = docCluster.entries.find(e => e.fileName.endsWith('.pdf'))
		assert.ok(pdfScan)
		assert.equal(pdfScan.scoring.isBloatedUpscale, true)
	})

	await t.test('Master preservation, holdLossyOnly, and lock/origin protections prevent unsafe deletes', () => {
		const { mediaFidelityRanker } = loadFidelityModules()
		const lossyOnlyGroup = [
			{
				id: 201,
				hash: 'lossy1',
				size: 3200000,
				files: [
					{ id: 2001, path: '/alice/files/Photos/Holiday_high.jpg', size: 3200000, width: 4000, height: 3000, hasExif: true },
					{ id: 2002, path: '/alice/files/WhatsApp/Holiday_whatsapp.jpg', size: 420000, width: 1200, height: 900, hasExif: false },
					{ id: 2003, path: '/alice/files/Archive/Holiday_locked.jpg', size: 800000, locked: true },
				],
			},
		]

		const heldReport = mediaFidelityRanker.analyzeMediaFidelity(lossyOnlyGroup, {
			holdLossyOnly: true,
		})
		assert.equal(heldReport.items.length, 1)
		assert.equal(heldReport.items[0].topVerdict, 'lossy-only')
		assert.equal(heldReport.items[0].quarantineEntries.length, 0)

		const releasedReport = mediaFidelityRanker.analyzeMediaFidelity(lossyOnlyGroup, {
			holdLossyOnly: false,
		})
		const released = releasedReport.items[0]
		assert.equal(released.quarantineEntries.length, 1)
		assert.equal(released.quarantineEntries[0].selectionKey, 2002)

		const selection = mediaFidelityRanker.collectSafeFidelitySelection(releasedReport)
		assert.equal(selection.files.length, 1)
		assert.equal(selection.files[0].id, 2002)
	})

	await t.test('Quarantine script, CWE-1236 CSV, and JSON exports escape payloads safely', () => {
		const { mediaFidelityRanker } = loadFidelityModules()
		const adversarial = [
			{
				id: 301,
				hash: 'adv1',
				size: 20000000,
				files: [
					{ id: 3001, path: '/alice/files/RAW/=SUM(1+1)_master.dng', size: 20000000, width: 5000, height: 3500, hasExif: true },
					{ id: 3002, path: '/alice/files/Exports/=HYPERLINK("evil.example")_web.jpg', size: 500000, width: 1200, height: 800 },
				],
			},
		]

		const report = mediaFidelityRanker.analyzeMediaFidelity(adversarial)
		const csv = mediaFidelityRanker.buildFidelityAuditCsv(report)
		assert.ok(csv.includes("'=SUM(1+1)_master.dng"))
		assert.ok(csv.includes("'=HYPERLINK("))

		const script = mediaFidelityRanker.buildFidelityQuarantineScript(report, {
			dataRoot: '/srv/nc/data',
		})
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes('files:scan'))
		assert.ok(!script.includes('rm -rf'))

		const json = JSON.parse(mediaFidelityRanker.buildFidelityJsonReport(report))
		assert.equal(json.schema, 'duplicatefinder.media-fidelity-ranker.v1')
		assert.equal(json.clusters.length, 1)
	})

	await t.test('MediaFidelityWorkbench.vue handles empty, populated, unclamped numeric inputs, XSS defense, and safe purge dialog', async () => {
		const deletedBatches = []
		const Workbench = loadFidelityWorkbench({
			deleteFiles: async files => {
				deletedBatches.push(files)
				return { success: files, errors: [] }
			},
		})

		// Empty state
		const emptyVm = new Vue({
			render: h => h(Workbench, {
				props: { duplicates: [], allDuplicates: [] },
			}),
		}).$mount()
		await settle()
		assert.ok(emptyVm.$el.querySelector('.mfw__empty'))
		emptyVm.$destroy()

		// Populated + XSS payload
		const duplicates = buildSampleFidelityDuplicates()
		duplicates[1].files[0].path = '/alice/files/WhatsApp/<img src=x onerror=alert(1)>/Alpine_Sunset_whatsapp.jpg'

		const completedEvents = []
		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates,
					allDuplicates: duplicates,
					currentDuplicateId: 101,
				},
				on: {
					'fidelity-delete-completed': payload => completedEvents.push(payload),
				},
			}),
		}).$mount()
		await settle()

		const comp = vm.$children[0]
		assert.equal(vm.$el.querySelectorAll('.mfw__cluster-card').length, 3)
		assert.equal(vm.$el.querySelector('img[src="x"]'), null, 'XSS tag must never render as DOM node')
		assert.ok(vm.$el.textContent.includes('<img src=x onerror=alert(1)>'))

		// Unclamped numeric input check: typing invalid/intermediate string must not clamp mid-keystroke
		const numInputs = vm.$el.querySelectorAll('input.mfw__num-input')
		assert.equal(numInputs.length, 2)
		comp.minLossInput = '999'
		await settle()
		assert.equal(comp.minLossInput, '999')
		comp.minLossInput = ''
		await settle()

		// Open dialog & confirm purge
		const globalPurgeBtn = vm.$el.querySelector('.mfw__global-bar .mfw__primary-btn.is-danger')
		assert.ok(globalPurgeBtn)
		globalPurgeBtn.click()
		await settle()

		const dialog = vm.$el.querySelector('dialog.mfw__dialog')
		assert.ok(dialog)
		const confirmBtn = dialog.querySelector('.mfw__primary-btn.is-danger')
		assert.ok(confirmBtn)
		confirmBtn.click()
		await settle()

		assert.equal(deletedBatches.length, 1)
		const deletedIds = deletedBatches[0].map(f => f.id)
		assert.ok(!deletedIds.includes(1001), 'DNG master must never be deleted')
		assert.ok(!deletedIds.includes(1004), 'FLAC master must never be deleted')
		assert.ok(!deletedIds.includes(1007), 'DOCX Origin master must never be deleted')
		assert.equal(completedEvents.length, 1)
		assert.equal(completedEvents[0].source, 'media-fidelity-ranker')

		vm.$destroy()
	})

	await t.test('App.vue + keyboardShortcuts wire % shortcut, topbar Fidelity button, and workbench toggle', async () => {
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		const reclamationHistory = loadModule('src/tools/reclamationHistory.js', {
			'./duplicateStats': loadModule('src/tools/duplicateStats.js'),
			'./duplicateFilters': loadModule('src/tools/duplicateFilters.js'),
		})
		assert.equal(
			keyboardShortcuts.resolveShortcutAction({ key: '%', shiftKey: true }),
			'toggle-media-fidelity-ranker'
		)
		assert.equal(
			keyboardShortcuts.resolveShortcutAction({ key: '%', target: { tagName: 'INPUT' } }),
			null
		)
		assert.ok(
			keyboardShortcuts.SHORTCUT_DEFINITIONS.some(def => def.id === 'toggle-media-fidelity-ranker' && def.keys.includes('%'))
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
			'./components/SpeechAsrBioacousticsVaultWorkbench.vue': { __esModule: true, default: stub('speech-asr-bioacoustics-vault-auditor') },
			'./components/TrafficItsV2xVaultWorkbench.vue': { __esModule: true, default: stub('traffic-its-v2x-vault-auditor') },
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
		const btn = vm.$el.querySelector('button.topbar-media-fidelity-button')
		assert.ok(btn, 'Topbar Fidelity button must render in details view')
		assert.equal(btn.getAttribute('aria-keyshortcuts'), '%')
		assert.equal(appComp.mediaFidelityOpen, false)

		btn.click()
		await settle()
		assert.equal(appComp.mediaFidelityOpen, true)
		assert.ok(vm.$el.querySelector('.stub-media-fidelity'))

		appComp.handleGlobalKeydown({
			key: '%',
			shiftKey: true,
			ctrlKey: false,
			metaKey: false,
			altKey: false,
			target: vm.$el,
			preventDefault: () => {},
		})
		await settle()
		assert.equal(appComp.mediaFidelityOpen, false)

		vm.$destroy()
	})

	await t.test('Cycle 150 touched files preserve zero U+2013/U+2014 dashes, zero XSS sinks, logical CSS, and >= 44px targets', () => {
		const files = [
			'src/tools/mediaFidelityRanker.js',
			'src/components/MediaFidelityWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
		]
		const xssPattern = new RegExp(['v-html', 'innerHTML', 'outerHTML', 'document\\.write'].join('|'))
		for (const rel of files) {
			const content = readFileSync(resolve(__dirname, '../..', rel), 'utf8')
			assert.ok(!content.includes('\u2013'), `Zero U+2013 in ${rel}`)
			assert.ok(!content.includes('\u2014'), `Zero U+2014 in ${rel}`)
			assert.equal(xssPattern.test(content), false, `Zero XSS sinks in ${rel}`)
		}
		const testContent = readFileSync(resolve(__dirname, 'media-fidelity-ranker.test.cjs'), 'utf8')
		assert.ok(!testContent.includes('\u2013'))
		assert.ok(!testContent.includes('\u2014'))

		const vueContent = readFileSync(resolve(__dirname, '../..', 'src/components/MediaFidelityWorkbench.vue'), 'utf8')
		assert.ok(vueContent.includes('min-block-size: 44px'))
		assert.ok(vueContent.includes(':focus-visible'))
		assert.ok(vueContent.includes('minmax(0, 1fr)'))
	})
})
