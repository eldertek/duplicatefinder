const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadModule, loadComponent, settle } = require('./helpers.cjs')

function loadPhotoEngine() {
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const duplicateFilters = loadModule('src/tools/duplicateFilters.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const visualMediaInspector = loadModule('src/tools/visualMediaInspector.js', {
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
	return loadModule('src/tools/photoPerceptualInspector.js', {
		'./duplicateFilters': duplicateFilters,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
		'./visualMediaInspector': visualMediaInspector,
	})
}

function makePatternRgba(width, height, mode = 'landscape-gradient') {
	const rgba = new Uint8ClampedArray(width * height * 4)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const idx = (y * width + x) * 4
			let r = 0
			let g = 0
			let b = 0
			if (mode === 'landscape-gradient') {
				r = Math.round((x / Math.max(1, width - 1)) * 220) + 15
				g = Math.round((y / Math.max(1, height - 1)) * 180) + 20
				b = Math.round(((x + y) / Math.max(1, width + height - 2)) * 150) + 30
			} else if (mode === 'landscape-bright') {
				r = Math.min(255, Math.round((x / Math.max(1, width - 1)) * 220) + 28)
				g = Math.min(255, Math.round((y / Math.max(1, height - 1)) * 180) + 32)
				b = Math.min(255, Math.round(((x + y) / Math.max(1, width + height - 2)) * 150) + 40)
			} else if (mode === 'crisp-checker') {
				const checker = ((Math.floor(x / 2) + Math.floor(y / 2)) % 2) === 0
				r = checker ? 240 : 18
				g = checker ? 235 : 22
				b = checker ? 230 : 25
			} else if (mode === 'flat-blur') {
				r = 128
				g = 128
				b = 128
			} else if (mode === 'dark') {
				r = 3
				g = 3
				b = 4
			}
			rgba[idx] = r
			rgba[idx + 1] = g
			rgba[idx + 2] = b
			rgba[idx + 3] = 255
		}
	}
	return rgba
}

function buildMinimalPngBytes(width, height) {
	const bytes = new Uint8Array(26)
	const view = new DataView(bytes.buffer)
	bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
	view.setUint32(8, 13, false)
	bytes.set([0x49, 0x48, 0x44, 0x52], 12) // IHDR
	view.setUint32(16, width, false)
	view.setUint32(20, height, false)
	bytes[24] = 8
	bytes[25] = 2
	return bytes
}

function createWorkbenchComponent(deleteImpl = async files => ({ success: files, deletedNodeIds: files.map(f => f.nodeId || f.id) })) {
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const duplicateFilters = loadModule('src/tools/duplicateFilters.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const visualMediaInspector = loadModule('src/tools/visualMediaInspector.js', {
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
	const photoPerceptualInspector = loadModule('src/tools/photoPerceptualInspector.js', {
		'./duplicateFilters': duplicateFilters,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
		'./visualMediaInspector': visualMediaInspector,
	})
	const mediaContentInspector = loadModule('src/tools/mediaContentInspector.js', {
		'./duplicateStats': duplicateStats,
		'./duplicateFilters': duplicateFilters,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./visualMediaInspector': visualMediaInspector,
	})
	const utils = loadModule('src/tools/utils.js', {
		'./notifications': { showErrorNotification: () => {} },
	})

	return loadComponent('src/components/PhotoPerceptualWorkbench.vue', {
		'../tools/api': { deleteFiles: deleteImpl },
		'../tools/duplicateSelectionAndExport': duplicateSelectionAndExport,
		'../tools/duplicateStats': duplicateStats,
		'../tools/mediaContentInspector': mediaContentInspector,
		'../tools/photoPerceptualInspector': photoPerceptualInspector,
		'../tools/utils': utils,
	})
}

describe('Cycle 136: Similar-Photo Perceptual pHash/dHash, EXIF Resolution, Histogram Sharpness & Crop Comparator Workbench', () => {
	test('computes DCT pHash, 16-bin RGB/Luma histogram, sharpness telemetry, and PNG/EXIF probe safely', () => {
		const engine = loadPhotoEngine()

		const rgbaA = makePatternRgba(64, 48, 'landscape-gradient')
		const rgbaB = makePatternRgba(32, 24, 'landscape-bright')
		const rgbaC = makePatternRgba(64, 48, 'crisp-checker')

		const pHashA = engine.computePerceptualDctHash(rgbaA, 64, 48)
		const pHashB = engine.computePerceptualDctHash(rgbaB, 32, 24)
		const pHashC = engine.computePerceptualDctHash(rgbaC, 64, 48)

		assert.ok(pHashA && /^[0-9a-f]{16}$/.test(pHashA.hex))
		assert.equal(pHashA.bits.length, 64)
		assert.equal(engine.computePerceptualDctHash(null, 0, 0), null)

		const histA = engine.computeColorHistogram(rgbaA, 64, 48)
		const histB = engine.computeColorHistogram(rgbaB, 32, 24)
		assert.equal(histA.bins, 16)
		assert.equal(histA.luma.length, 16)
		const histCmp = engine.compareColorHistograms(histA, histB)
		assert.ok(histCmp.combinedSimilarityPct >= 40)

		const sharpCrisp = engine.computeSharpnessAndExposure(rgbaC, 64, 48)
		const sharpBlur = engine.computeSharpnessAndExposure(makePatternRgba(64, 48, 'flat-blur'), 64, 48)
		const sharpDark = engine.computeSharpnessAndExposure(makePatternRgba(64, 48, 'dark'), 64, 48)
		assert.ok(sharpCrisp.sharpnessScore > sharpBlur.sharpnessScore)
		assert.equal(sharpCrisp.sharpnessTier, 'crisp')
		assert.equal(sharpBlur.sharpnessTier, 'soft')
		assert.equal(sharpDark.exposureStatus, 'underexposed')

		const pngBytes = buildMinimalPngBytes(4000, 3000)
		const probed = engine.probePhotoBufferAndPixels(
			pngBytes,
			{ id: 1, name: 'Sunset.png', path: '/Photos/Sunset.png', mimetype: 'image/png', size: 4200000 },
			{ rgba: rgbaA, width: 64, height: 48 },
		)
		assert.equal(probed.probed, true)
		assert.equal(probed.format, 'PNG')
		assert.equal(probed.width, 4000)
		assert.equal(probed.height, 3000)
		assert.equal(probed.bitDepth, 8)
		assert.ok(probed.pHash && probed.dHash && probed.histogram && probed.sharpness)
		assert.notEqual(pHashA.hex, pHashC.hex)
		assert.ok(pHashB)
	})

	test('analyzes crop framing, cross-group perceptual clustering, survivor keep rules, and CWE-1236 safe exports', () => {
		const engine = loadPhotoEngine()

		const cropCheck = engine.analyzeCropAndFraming(
			{ width: 4000, height: 3000, size: 5000000, sharpnessScore: 84, exif: { hasExif: true } },
			{ width: 3200, height: 1800, size: 1800000, sharpnessScore: 60, exif: { hasExif: true } },
		)
		assert.equal(cropCheck.relationship, 'aspect-cropped')
		assert.ok(cropCheck.cropRetentionPct < 100)
		assert.ok(cropCheck.cropOverlayBox.heightPct < 100)

		const socialCheck = engine.analyzeCropAndFraming(
			{ width: 4000, height: 3000, size: 5000000, exif: { hasExif: true } },
			{ width: 1600, height: 1200, size: 220000, isSocialCopy: true, exif: { hasExif: false } },
		)
		assert.equal(socialCheck.relationship, 'social-reencoded')

		const duplicates = [
			{
				id: 101,
				hash: 'aaaa1111',
				files: [
					{
						id: 1,
						name: 'IMG_4021.DNG',
						path: '/Originals/IMG_4021.DNG',
						mimetype: 'image/x-adobe-dng',
						size: 24000000,
						width: 6000,
						height: 4000,
						pHash: 'f0f0f0f00f0f0f0f',
						dHash: 'a5a5a5a55a5a5a5a',
						sharpnessScore: 88,
						isOrigin: true,
					},
					{
						id: 2,
						name: 'IMG_4021_crop.jpg',
						path: '/Social/IMG_4021_crop.jpg',
						mimetype: 'image/jpeg',
						size: 1200000,
						width: 3200,
						height: 1800,
						pHash: 'f0f0f0f00f0f0f0e',
						dHash: 'a5a5a5a55a5a5a58',
						sharpnessScore: 52,
					},
				],
			},
			{
				id: 102,
				hash: 'bbbb2222',
				files: [
					{
						id: 3,
						name: 'IMG_4021-WA0001.jpg',
						path: '/WhatsApp/IMG_4021-WA0001.jpg',
						mimetype: 'image/jpeg',
						size: 180000,
						width: 1200,
						height: 800,
						pHash: 'f0f0f0f00f0f0f0f',
						dHash: 'a5a5a5a55a5a5a5a',
						sharpnessScore: 34,
					},
					{
						id: 4,
						name: '=CMD|calc!A0.jpg',
						path: '+SUM(1+1)/WhatsApp/copy.jpg',
						mimetype: 'image/jpeg',
						size: 180000,
						width: 1200,
						height: 800,
						pHash: 'f0f0f0f00f0f0f0f',
						dHash: 'a5a5a5a55a5a5a5a',
						sharpnessScore: 34,
					},
				],
			},
		]

		const catalog = engine.buildPhotoPerceptualCatalog(duplicates, {
			clusteringMode: 'perceptual',
			keepRule: 'highest_quality',
			maxHammingDistance: 10,
			minSimilarityPct: 80,
		})

		assert.equal(catalog.clusters.length, 1)
		assert.equal(catalog.summary.totalPhotos, 4)
		assert.equal(catalog.clusters[0].survivorFile.name, 'IMG_4021.DNG')
		assert.equal(catalog.clusters[0].hasCropped, true)
		assert.equal(catalog.clusters[0].hasSocial, true)
		assert.equal(catalog.clusters[0].hasRawPair, true)

		const inferiorNoCrop = engine.selectInferiorPhotoKeys(catalog, { includeCropped: false })
		const inferiorWithCrop = engine.selectInferiorPhotoKeys(catalog, { includeCropped: true })
		assert.ok(!inferiorNoCrop.includes(String(1)))
		assert.ok(inferiorWithCrop.length >= inferiorNoCrop.length)

		const csv = engine.exportPhotoPerceptualCsv(catalog)
		assert.ok(csv.includes("'=CMD|calc!A0.jpg"))
		assert.ok(csv.includes("'+SUM(1+1)/WhatsApp/copy.jpg"))

		const json = JSON.parse(engine.exportPhotoPerceptualJson(catalog, '2026-11-23T12:00:00.000Z'))
		assert.equal(json.schema, engine.PHOTO_PERCEPTUAL_SCHEMA)
		assert.equal(json.clusters.length, 1)
	})

	test('PhotoPerceptualWorkbench.vue renders empty, populated, non-clamping inputs, probing, XSS defense, and safe delete', async () => {
		const deletedCalls = []
		const Workbench = createWorkbenchComponent(async files => {
			deletedCalls.push(files)
			return { success: files, deletedNodeIds: files.map(f => f.nodeId || f.id) }
		})

		const emptyVm = new Vue({
			render: h => h(Workbench, { props: { duplicates: [], allDuplicates: [] } }),
		}).$mount()
		await settle()
		assert.ok(emptyVm.$el.textContent.includes('No duplicate photo groups loaded yet'))
		emptyVm.$destroy()

		const originalFetch = global.fetch
		const pngHeader = buildMinimalPngBytes(5472, 3648)
		global.fetch = async () => ({
			ok: true,
			status: 200,
			arrayBuffer: async () => pngHeader.buffer,
		})

		try {
			const duplicates = [
				{
					id: 501,
					hash: 'cccc3333',
					files: [
						{
							id: 21,
							nodeId: 21,
							name: 'Portrait_Master.png',
							path: '/Studio/Portrait_Master.png',
							downloadUrl: 'https://cloud.example.test/remote.php/dav/files/u/Studio/Portrait_Master.png',
							mimetype: 'image/png',
							size: 9400000,
							width: 5472,
							height: 3648,
							pHash: '1122334455667788',
							dHash: '8877665544332211',
							sharpnessScore: 86,
							exif: { make: 'Canon', model: 'EOS R5', iso: 100 },
						},
						{
							id: 22,
							nodeId: 22,
							name: '<img src=x onerror=alert(1)>.jpg',
							path: '/Exports/<img src=x onerror=alert(1)>.jpg',
							downloadUrl: 'https://cloud.example.test/remote.php/dav/files/u/Exports/crop.jpg',
							mimetype: 'image/jpeg',
							size: 950000,
							width: 1920,
							height: 1080,
							pHash: '1122334455667789',
							dHash: '8877665544332210',
							sharpnessScore: 44,
						},
					],
				},
			]

			const vm = new Vue({
				render: h => h(Workbench, {
					props: { duplicates, allDuplicates: duplicates, currentDuplicateId: 501 },
				}),
			}).$mount()
			await settle()

			const comp = vm.$children[0]
			assert.equal(comp.catalog.clusters.length, 1)
			assert.equal(vm.$el.querySelectorAll('img').length, 0, 'XSS payload must not inject an <img> element')
			assert.ok(vm.$el.textContent.includes('<img src=x onerror=alert(1)>.jpg'))

			// Non-clamping numeric input mid-keystroke test
			const hammingInput = vm.$el.querySelector('input[aria-label="Maximum Hamming bit distance"]')
			hammingInput.value = ''
			hammingInput.dispatchEvent(new window.Event('input'))
			await settle()
			assert.equal(comp.hammingDraft, '', 'Must not clamp or reset empty draft mid-keystroke')
			hammingInput.dispatchEvent(new window.Event('blur'))
			await settle()
			assert.equal(comp.maxHammingDistance, 10)

			// Probe cluster
			await comp.probeCluster(comp.activeCluster)
			await settle()
			assert.ok(Object.keys(comp.probeByKey).length >= 1)

			// Select inferior + crops and confirm delete
			comp.selectInferiorCopies(true)
			await settle()
			assert.equal(comp.selectedDeleteItems.length, 1)

			comp.openDeleteDialog()
			await settle()
			await comp.confirmBatchDelete()
			await settle()
			assert.equal(deletedCalls.length, 1)
			assert.equal(deletedCalls[0][0].name, '<img src=x onerror=alert(1)>.jpg')

			vm.$destroy()
		} finally {
			global.fetch = originalFetch
		}
	})

	test('App.vue + keyboardShortcuts wire 7 shortcut, topbar Similar Photos button, and help dialog', async () => {
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		assert.equal(keyboardShortcuts.resolveShortcutAction({ key: '7' }), 'toggle-photo-perceptual')
		assert.equal(keyboardShortcuts.resolveShortcutAction({ key: '7', target: { tagName: 'INPUT' } }), null)
		assert.ok(keyboardShortcuts.SHORTCUT_DEFINITIONS.some(item => item.id === 'toggle-photo-perceptual' && item.keys.includes('7')))

		const stub = name => ({
			name,
			render(h) {
				return h('div', { class: `stub-${name}` })
			},
		})
		const slotBox = tag => ({
			render(h) {
				return h(tag, this.$slots.default)
			},
		})

		const duplicatePreferences = loadModule('src/tools/duplicatePreferences.js')
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
			'./duplicatePreferences': duplicatePreferences,
		})
		const duplicateStats = loadModule('src/tools/duplicateStats.js')
		const duplicateFilters = loadModule('src/tools/duplicateFilters.js')
		const reclamationHistory = loadModule('src/tools/reclamationHistory.js', {
			'./duplicateStats': duplicateStats,
			'./duplicateFilters': duplicateFilters,
		})

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
				fetchDuplicates: async () => ({
					entities: [],
					pagination: { currentPage: 1, totalPages: 1, totalItems: 0 },
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

		const appVm = new Vue({ render: h => h(App) }).$mount()
		await settle()

		const topbarBtn = appVm.$el.querySelector('.topbar-photo-perceptual-button')
		assert.ok(topbarBtn, 'Similar Photos topbar button renders in details view')
		assert.equal(topbarBtn.getAttribute('aria-keyshortcuts'), '7')
		assert.equal(topbarBtn.getAttribute('aria-pressed'), 'false')

		appVm.$children[0].handleGlobalKeydown({ key: '7', preventDefault() {} })
		await settle()
		assert.equal(appVm.$children[0].photoPerceptualOpen, true)
		assert.equal(topbarBtn.getAttribute('aria-pressed'), 'true')
		assert.ok(appVm.$el.querySelector('.stub-photo-perceptual'))

		appVm.$children[0].handleGlobalKeydown({ key: '7', preventDefault() {} })
		await settle()
		assert.equal(appVm.$children[0].photoPerceptualOpen, false)

		appVm.$destroy()
	})

	test('Cycle 136 touched files preserve zero U+2013/U+2014 dashes, zero XSS sinks, logical CSS, and >= 44px mobile targets', () => {
		const files = [
			'src/tools/photoPerceptualInspector.js',
			'src/components/PhotoPerceptualWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
			'tests/frontend/photo-perceptual-workbench.test.cjs',
		]
		for (const rel of files) {
			const content = readFileSync(resolve(__dirname, '../..', rel), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(content), false, `${rel} must contain zero typographic dashes`)
			if (!rel.endsWith('.test.cjs')) {
				assert.equal(/\bv-html\b|\.innerHTML\b|\.outerHTML\b|document\.write\b/.test(content), false, `${rel} must contain zero XSS sinks`)
			}
		}

		const vueCss = readFileSync(resolve(__dirname, '../..', 'src/components/PhotoPerceptualWorkbench.vue'), 'utf8')
		assert.ok(vueCss.includes('minmax(0, 1fr)'))
		assert.ok(vueCss.includes('padding-block'))
		assert.ok(vueCss.includes('padding-inline'))
		assert.ok(vueCss.includes(':focus-visible'))
		assert.ok(vueCss.includes('min-block-size: 44px'))
	})
})
