const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadModule, loadComponent, settle } = require('./helpers.cjs')

function loadQuarantineEngine() {
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const duplicateFilters = loadModule('src/tools/duplicateFilters.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	return loadModule('src/tools/brokenMediaQuarantine.js', {
		'./duplicateFilters': duplicateFilters,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function createWorkbenchComponent(deleteImpl = async files => ({ success: files, deletedNodeIds: files.map(f => f.nodeId || f.id) })) {
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const duplicateFilters = loadModule('src/tools/duplicateFilters.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const visualMediaInspector = loadModule('src/tools/visualMediaInspector.js', {
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
	const mediaContentInspector = loadModule('src/tools/mediaContentInspector.js', {
		'./duplicateStats': duplicateStats,
		'./duplicateFilters': duplicateFilters,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./visualMediaInspector': visualMediaInspector,
	})
	const brokenMediaQuarantine = loadModule('src/tools/brokenMediaQuarantine.js', {
		'./duplicateFilters': duplicateFilters,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
	const utils = loadModule('src/tools/utils.js', {
		'./notifications': { showErrorNotification: () => {} },
	})

	return loadComponent('src/components/BrokenMediaQuarantineWorkbench.vue', {
		'../tools/api': { deleteFiles: deleteImpl },
		'../tools/brokenMediaQuarantine': brokenMediaQuarantine,
		'../tools/duplicateStats': duplicateStats,
		'../tools/mediaContentInspector': mediaContentInspector,
		'../tools/utils': utils,
	})
}

function asciiBytes(str) {
	return Uint8Array.from(str.split('').map(c => c.charCodeAt(0)))
}

function makeValidPngBytes(width, height) {
	const bytes = new Uint8Array(45)
	const view = new DataView(bytes.buffer)
	bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
	view.setUint32(8, 13, false)
	bytes.set(asciiBytes('IHDR'), 12)
	view.setUint32(16, width, false)
	view.setUint32(20, height, false)
	bytes[24] = 8
	bytes[25] = 2
	// Fake IDAT + IEND
	bytes.set(asciiBytes('IEND'), 37)
	bytes.set([0xae, 0x42, 0x60, 0x82], 41)
	return bytes
}

function makeTruncatedPngBytes(width, height) {
	const full = makeValidPngBytes(width, height)
	return full.subarray(0, 32)
}

function makeValidJpegHeadAndTail() {
	// SOI + APP0 (16 bytes) + SOS + EOI
	const head = new Uint8Array([
		0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10,
		0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
		0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x11, 0x22,
	])
	const tail = new Uint8Array([0x11, 0x22, 0x33, 0x44, 0xff, 0xd9])
	return { head, tail }
}

describe('Cycle 137: Broken / Zero-Byte / Truncated Media & Corrupted Header Quarantine Workbench', () => {
	test('detects zero-byte, corrupted headers, truncated tails, HTML masquerades, dead-fill blocks, and healthy media', () => {
		const engine = loadQuarantineEngine()

		const zeroReport = engine.inspectFileStructuralIntegrity(new Uint8Array(0), new Uint8Array(0), {
			name: 'empty-shot.jpg',
			path: '/user/files/Photos/empty-shot.jpg',
			size: 0,
		})
		assert.equal(zeroReport.verdict, 'zero-byte')
		assert.equal(zeroReport.severity, 'critical')
		assert.equal(zeroReport.integrityScore, 0)

		const { head: jpgHead, tail: jpgTail } = makeValidJpegHeadAndTail()
		const validJpg = engine.inspectFileStructuralIntegrity(jpgHead, jpgTail, {
			name: 'holiday.jpg',
			size: 4096,
		})
		assert.equal(validJpg.verdict, 'healthy-verified')
		assert.equal(validJpg.integrityScore, 100)

		const truncatedJpg = engine.inspectFileStructuralIntegrity(jpgHead, new Uint8Array([0x11, 0x22, 0x33, 0x44]), {
			name: 'broken-tail.jpg',
			size: 120000,
		})
		assert.equal(truncatedJpg.verdict, 'truncated-tail')
		assert.equal(truncatedJpg.severity, 'high')

		const htmlMasquerade = engine.inspectFileStructuralIntegrity(
			asciiBytes('<!DOCTYPE html><html><title>502 Bad Gateway</title></html>'),
			new Uint8Array(0),
			{ name: 'gateway-error.jpg', size: 512 }
		)
		assert.equal(htmlMasquerade.verdict, 'html-masquerade')
		assert.equal(htmlMasquerade.severity, 'high')

		const deadFill = engine.inspectFileStructuralIntegrity(new Uint8Array(256).fill(0x00), new Uint8Array(0), {
			name: 'zeroed-blocks.png',
			size: 256,
		})
		assert.equal(deadFill.verdict, 'dead-fill')
		assert.equal(deadFill.severity, 'high')

		const validPng = engine.inspectFileStructuralIntegrity(makeValidPngBytes(1920, 1080), makeValidPngBytes(1920, 1080), {
			name: 'banner.png',
			size: 45,
		})
		assert.equal(validPng.verdict, 'healthy-verified')

		const truncPng = engine.inspectFileStructuralIntegrity(makeTruncatedPngBytes(1920, 1080), makeTruncatedPngBytes(1920, 1080), {
			name: 'cut.png',
			size: 32000,
		})
		assert.equal(truncPng.verdict, 'truncated-tail')

		const truncPdf = engine.inspectFileStructuralIntegrity(
			asciiBytes('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n'),
			asciiBytes('stream\n0123456789abcdef'),
			{ name: 'contract.pdf', size: 95000 }
		)
		assert.equal(truncPdf.verdict, 'truncated-tail')

		const validPdf = engine.inspectFileStructuralIntegrity(
			asciiBytes('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n'),
			asciiBytes('xref\n0 1\n0000000000 65535 f \ntrailer\n%%EOF\n'),
			{ name: 'signed.pdf', size: 95000 }
		)
		assert.equal(validPdf.verdict, 'healthy-verified')

		const badMp4 = engine.inspectFileStructuralIntegrity(
			new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0, 0x69, 0x73, 0x6f, 0x6d]),
			asciiBytes('mdat000011112222'),
			{ name: 'dashcam-no-moov.mp4', size: 4200000 }
		)
		assert.equal(badMp4.verdict, 'truncated-tail')

		// RIFF WebP declared 10000 bytes, actual file size 1200 bytes
		const webpHead = new Uint8Array(24)
		webpHead.set(asciiBytes('RIFF'), 0)
		new DataView(webpHead.buffer).setUint32(4, 10000, true)
		webpHead.set(asciiBytes('WEBP'), 8)
		webpHead.set(asciiBytes('VP8 '), 12)
		const truncWebp = engine.inspectFileStructuralIntegrity(webpHead, new Uint8Array(0), {
			name: 'hero.webp',
			size: 1200,
		})
		assert.equal(truncWebp.verdict, 'truncated-tail')
	})

	test('formats hex previews safely without control characters and persists quarantine vault cleanly', () => {
		const engine = loadQuarantineEngine()

		const payload = asciiBytes('<script>alert(1)</script>\x00\x01\x02ABCD')
		const hexDump = engine.formatSafeHexPreview(payload, 32, false)
		assert.ok(hexDump.includes('0000:'))
		assert.ok(hexDump.includes('...'))
		assert.equal(hexDump.includes('\x00'), false)

		const storeMap = new Map()
		const fakeStorage = {
			getItem: k => (storeMap.has(k) ? storeMap.get(k) : null),
			setItem: (k, v) => storeMap.set(k, v),
		}
		assert.deepEqual(engine.loadQuarantineVault(fakeStorage), {})
		fakeStorage.setItem(engine.QUARANTINE_STORAGE_KEY, '{broken-json')
		assert.deepEqual(engine.loadQuarantineVault(fakeStorage), {})

		const saved = engine.saveQuarantineVault({
			'id:101': { quarantinedAt: '2026-11-23T12:00:00.000Z', reason: 'Truncated JPEG tail' },
		}, fakeStorage)
		assert.equal(saved, true)
		const reloaded = engine.loadQuarantineVault(fakeStorage)
		assert.equal(reloaded['id:101'].reason, 'Truncated JPEG tail')
	})

	test('builds quarantine catalog with recovery safety tiers and CWE-1236-safe CSV / JSON exports', () => {
		const engine = loadQuarantineEngine()
		const duplicates = [
			{
				id: 'g1',
				hash: 'h-photo-1',
				files: [
					{ id: 1, name: 'master.jpg', path: '/user/files/Origin/master.jpg', size: 120000, isProtected: true },
					{ id: 2, name: 'copy-empty.jpg', path: '/user/files/Inbox/copy-empty.jpg', size: 0, isProtected: false },
					{ id: 3, name: 'partial.jpg.part', path: '/user/files/Inbox/partial.jpg.part', size: 4000, isProtected: false },
				],
			},
			{
				id: 'g2',
				hash: 'h-doc-2',
				files: [
					{ id: 4, name: '=cmd|calc!A0.pdf', path: '/user/files/Docs/=cmd|calc!A0.pdf', size: 64000, isProtected: false },
					{ id: 5, name: 'clean.pdf', path: '/user/files/Docs/clean.pdf', size: 64000, isProtected: false },
				],
			},
		]

		const probeByKey = {
			1: engine.inspectFileStructuralIntegrity(makeValidJpegHeadAndTail().head, makeValidJpegHeadAndTail().tail, duplicates[0].files[0]),
			4: engine.inspectFileStructuralIntegrity(asciiBytes('%PDF-1.7\n'), asciiBytes('truncated-end'), duplicates[1].files[0]),
			5: engine.inspectFileStructuralIntegrity(asciiBytes('%PDF-1.7\n'), asciiBytes('%%EOF\n'), duplicates[1].files[1]),
		}

		const catalog = engine.buildQuarantineCatalog(duplicates, {
			probeByKey,
			quarantineVault: {
				4: { quarantinedAt: '2026-11-23T10:00:00.000Z', reason: 'Missing %%EOF' },
			},
		})

		assert.equal(catalog.summary.totalInspected, 5)
		assert.equal(catalog.summary.zeroByteCount, 1)
		assert.equal(catalog.summary.truncatedTailCount, 1)
		assert.equal(catalog.summary.incompleteCount, 1)
		assert.equal(catalog.summary.quarantinedCount, 1)

		const safeKeys = engine.selectSafeDamagedKeys(catalog)
		assert.ok(safeKeys.includes('2'))
		assert.ok(safeKeys.includes('3'))
		assert.ok(safeKeys.includes('4'))
		assert.equal(safeKeys.includes('1'), false)

		const csv = engine.exportQuarantineCsv(catalog)
		assert.ok(csv.includes("'=cmd|calc!A0.pdf"), 'CWE-1236 formula prefix escaped')
		const manifest = JSON.parse(engine.exportQuarantineManifestJson(catalog, '2026-11-23T12:00:00.000Z'))
		assert.equal(manifest.schema, engine.QUARANTINE_REPORT_SCHEMA)
		assert.equal(manifest.findings.length, 5)
	})

	test('BrokenMediaQuarantineWorkbench.vue renders empty, populated, binary probing, vault staging, safe delete, and XSS defense', async () => {
		const deletedCalls = []
		const Workbench = createWorkbenchComponent(async (files, opts) => {
			deletedCalls.push({ files, opts })
			return {
				success: files,
				deletedNodeIds: files.map(f => f.nodeId || f.id),
			}
		})

		// Empty state
		const emptyVm = new Vue({
			render: h => h(Workbench, {
				props: { duplicates: [], allDuplicates: [] },
			}),
		}).$mount()
		await settle()
		assert.ok(emptyVm.$el.textContent.includes('No duplicate groups loaded yet'))
		emptyVm.$destroy()

		// Populated state with mocked head+tail range fetch
		const originalFetch = global.fetch
		global.fetch = async (url, init) => {
			const range = init && init.headers && init.headers.Range ? init.headers.Range : ''
			const isTail = range.startsWith('bytes=') && !range.startsWith('bytes=0-')
			const isBrokenPng = String(url).includes('xss-broken')
			const payload = isBrokenPng
				? (isTail ? asciiBytes('badtail') : makeTruncatedPngBytes(800, 600))
				: (isTail ? makeValidPngBytes(800, 600) : makeValidPngBytes(800, 600))
			return {
				ok: true,
				status: 206,
				arrayBuffer: async () => payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength),
			}
		}

		try {
			const duplicates = [
				{
					id: 88,
					hash: 'hash-quarantine-88',
					files: [
						{
							id: 801,
							nodeId: 801,
							name: 'intact-master.png',
							path: '/user/files/Origin/intact-master.png',
							size: 128000,
							isProtected: true,
							downloadUrl: 'https://cloud.example.test/remote.php/dav/files/alice/Origin/intact-master.png',
						},
						{
							id: 802,
							nodeId: 802,
							name: '<img src=x onerror=alert(1)>xss-broken.png',
							path: '/user/files/Inbox/<img src=x onerror=alert(1)>xss-broken.png',
							size: 96000,
							isProtected: false,
							downloadUrl: 'https://cloud.example.test/remote.php/dav/files/alice/Inbox/xss-broken.png',
						},
						{
							id: 803,
							nodeId: 803,
							name: 'zero-copy.png',
							path: '/user/files/Inbox/zero-copy.png',
							size: 0,
							isProtected: false,
						},
					],
				},
			]

			const vm = new Vue({
				render: h => h(Workbench, {
					props: {
						duplicates,
						allDuplicates: duplicates,
						currentDuplicateId: 88,
					},
				}),
			}).$mount()
			await settle()

			const comp = vm.$children[0]
			assert.equal(vm.$el.querySelectorAll('img[src="x"]').length, 0, 'XSS payload must not be rendered as HTML')
			assert.ok(vm.$el.textContent.includes('Zero-byte / stub'))

			// Probe visible files (head + tail)
			await comp.probeVisibleItems()
			await settle()
			assert.equal(comp.probeByKey['802'].verdict, 'truncated-tail')
			assert.equal(comp.probeByKey['801'].verdict, 'healthy-verified')
			const brokenItem = comp.catalog.items.find(item => item.key === '802')
			assert.ok(brokenItem)
			comp.selectItem(brokenItem)
			await settle()
			assert.ok(vm.$el.querySelector('.quarantine-wb__hex-pre').textContent.includes('0000:'))

			// Stage damaged items into quarantine vault
			comp.stageAllDamagedToVault()
			await settle()
			assert.equal(comp.catalog.summary.quarantinedCount, 2)

			// Select safe damaged copies & confirm delete
			comp.selectSafeDamaged()
			await settle()
			assert.equal(comp.selectedDeleteItems.length, 2)
			comp.openDeleteDialog()
			await settle()
			await comp.confirmBatchDelete()
			await settle()

			assert.equal(deletedCalls.length, 1)
			assert.equal(deletedCalls[0].files.length, 2)
			assert.equal(deletedCalls[0].opts.allowLastCopy, false)

			vm.$destroy()
		} finally {
			global.fetch = originalFetch
		}
	})

	test('App.vue + keyboardShortcuts wire 8 shortcut, topbar Quarantine button, and help dialog', async () => {
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		assert.equal(keyboardShortcuts.resolveShortcutAction({ key: '8' }), 'toggle-broken-quarantine')
		assert.equal(keyboardShortcuts.resolveShortcutAction({ key: '8', target: { tagName: 'INPUT' } }), null)
		assert.ok(keyboardShortcuts.SHORTCUT_DEFINITIONS.some(item => item.id === 'toggle-broken-quarantine' && item.keys.includes('8')))

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

		const topbarBtn = appVm.$el.querySelector('.topbar-broken-quarantine-button')
		assert.ok(topbarBtn, 'Quarantine topbar button renders in details view')
		assert.equal(topbarBtn.getAttribute('aria-keyshortcuts'), '8')
		assert.equal(topbarBtn.getAttribute('aria-pressed'), 'false')

		appVm.$children[0].handleGlobalKeydown({ key: '8', preventDefault() {} })
		await settle()
		assert.equal(appVm.$children[0].brokenQuarantineOpen, true)
		assert.equal(topbarBtn.getAttribute('aria-pressed'), 'true')
		assert.ok(appVm.$el.querySelector('.stub-broken-quarantine'))

		appVm.$children[0].handleGlobalKeydown({ key: '8', preventDefault() {} })
		await settle()
		assert.equal(appVm.$children[0].brokenQuarantineOpen, false)

		appVm.$destroy()
	})

	test('Cycle 137 touched files preserve zero U+2013/U+2014 dashes, zero XSS sinks, logical CSS, and >= 44px mobile targets', () => {
		const files = [
			'src/tools/brokenMediaQuarantine.js',
			'src/components/BrokenMediaQuarantineWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
			'tests/frontend/broken-media-quarantine.test.cjs',
		]
		for (const rel of files) {
			const content = readFileSync(resolve(__dirname, '../..', rel), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(content), false, `${rel} must contain zero typographic dashes`)
			if (!rel.endsWith('.test.cjs')) {
				assert.equal(/\bv-html\b|\.innerHTML\b|\.outerHTML\b|document\.write\b/.test(content), false, `${rel} must contain zero XSS sinks`)
			}
		}

		const vueCss = readFileSync(resolve(__dirname, '../..', 'src/components/BrokenMediaQuarantineWorkbench.vue'), 'utf8')
		assert.ok(vueCss.includes('minmax(0, 1fr)'))
		assert.ok(vueCss.includes('padding-block'))
		assert.ok(vueCss.includes('padding-inline'))
		assert.ok(vueCss.includes(':focus-visible'))
		assert.ok(vueCss.includes('min-block-size: 44px'))
	})
})
