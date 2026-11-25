const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadModule, loadComponent, settle } = require('./helpers.cjs')

function loadDocumentEngine() {
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const duplicateFilters = loadModule('src/tools/duplicateFilters.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	return loadModule('src/tools/documentLineageInspector.js', {
		'./duplicateStats': duplicateStats,
		'./duplicateFilters': duplicateFilters,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
	})
}

function buildStoredZipBuffer(entries) {
	const textEncoder = new TextEncoder()
	const localParts = []
	const centralParts = []
	let offset = 0

	for (const entry of entries) {
		const nameBytes = textEncoder.encode(entry.name)
		const dataBytes = textEncoder.encode(entry.content)

		const localHeader = new Uint8Array(30 + nameBytes.length)
		const lView = new DataView(localHeader.buffer)
		lView.setUint32(0, 0x04034b50, true)
		lView.setUint16(4, 20, true)
		lView.setUint16(8, 0, true) // stored
		lView.setUint32(18, dataBytes.length, true)
		lView.setUint32(22, dataBytes.length, true)
		lView.setUint16(26, nameBytes.length, true)
		localHeader.set(nameBytes, 30)

		const centralHeader = new Uint8Array(46 + nameBytes.length)
		const cView = new DataView(centralHeader.buffer)
		cView.setUint32(0, 0x02014b50, true)
		cView.setUint16(4, 20, true)
		cView.setUint16(6, 20, true)
		cView.setUint16(10, 0, true)
		cView.setUint32(20, dataBytes.length, true)
		cView.setUint32(24, dataBytes.length, true)
		cView.setUint16(28, nameBytes.length, true)
		cView.setUint32(42, offset, true)
		centralHeader.set(nameBytes, 46)

		localParts.push(localHeader, dataBytes)
		centralParts.push(centralHeader)
		offset += localHeader.length + dataBytes.length
	}

	const cdOffset = offset
	let cdSize = 0
	for (const part of centralParts) {
		cdSize += part.length
	}

	const eocd = new Uint8Array(22)
	const eView = new DataView(eocd.buffer)
	eView.setUint32(0, 0x06054b50, true)
	eView.setUint16(8, entries.length, true)
	eView.setUint16(10, entries.length, true)
	eView.setUint32(12, cdSize, true)
	eView.setUint32(16, cdOffset, true)

	const totalLen = offset + cdSize + eocd.length
	const out = new Uint8Array(totalLen)
	let ptr = 0
	for (const part of [...localParts, ...centralParts, eocd]) {
		out.set(part, ptr)
		ptr += part.length
	}
	return out
}

function createWorkbenchComponent(deleteImpl = async files => ({ success: files, deletedNodeIds: files.map(f => f.nodeId || f.id) })) {
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const duplicateFilters = loadModule('src/tools/duplicateFilters.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const documentLineageInspector = loadModule('src/tools/documentLineageInspector.js', {
		'./duplicateStats': duplicateStats,
		'./duplicateFilters': duplicateFilters,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
	})
	const utils = loadModule('src/tools/utils.js', {
		'./notifications': { showErrorNotification: () => {} },
	})
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

	return loadComponent('src/components/DocumentLineageWorkbench.vue', {
		'../tools/api': { deleteFiles: deleteImpl },
		'../tools/documentLineageInspector': documentLineageInspector,
		'../tools/duplicateSelectionAndExport': duplicateSelectionAndExport,
		'../tools/duplicateStats': duplicateStats,
		'../tools/mediaContentInspector': mediaContentInspector,
		'../tools/utils': utils,
	})
}

describe('Cycle 135: Near-Duplicate Document Fuzzy Diff & Version Lineage Workbench', () => {
	test('parses document kinds, version lineage tags, PDF Info/signatures, Office ZIP XML, and plain text safely', () => {
		const docEngine = loadDocumentEngine()

		assert.equal(docEngine.classifyDocumentKind({ name: 'Contract.pdf', mimetype: 'application/pdf' }), 'pdf')
		assert.equal(docEngine.classifyDocumentKind({ name: 'Spec_v2.docx' }), 'office')
		assert.equal(docEngine.classifyDocumentKind({ name: 'Notes.md' }), 'text')
		assert.equal(docEngine.classifyDocumentKind({ name: 'Ledger.csv' }), 'data')
		assert.equal(docEngine.classifyDocumentKind({ name: 'Photo.jpg', mimetype: 'image/jpeg' }), null)

		const v1 = docEngine.parseDocumentVersionMeta('Contrat_Client_v1_draft.pdf')
		const v2 = docEngine.parseDocumentVersionMeta('Contrat_Client_v2.1_FINAL_signed (1).pdf')
		assert.equal(v1.canonicalStem, 'contrat client')
		assert.equal(v2.canonicalStem, 'contrat client')
		assert.deepEqual(v1.versionTuple, [1, 0, 0])
		assert.deepEqual(v2.versionTuple, [2, 1, 0])
		assert.equal(v1.isDraft, true)
		assert.equal(v2.isSignedOrFinal, true)
		assert.equal(v2.isCopyArtifact, true)

		const pdfSample = [
			'%PDF-1.7',
			'1 0 obj << /Type /Pages /Count 12 >> endobj',
			'2 0 obj << /Title (Annual Report 2026) /Author (Alice Martin) /Font <<>> /Type /Sig /ByteRange [0 10 20 30] >> endobj',
			'BT (Executive summary revenue grew 18 percent across Europe) Tj ET',
		].join('\n')
		const pdfBytes = new Uint8Array(pdfSample.split('').map(ch => ch.charCodeAt(0)))
		const pdfProbe = docEngine.probeDocumentBuffer(pdfBytes, { name: 'Report.pdf' })
		assert.equal(pdfProbe.probed, true)
		assert.equal(pdfProbe.formatLabel, 'PDF 1.7')
		assert.equal(pdfProbe.pageCount, 12)
		assert.equal(pdfProbe.title, 'Annual Report 2026')
		assert.equal(pdfProbe.author, 'Alice Martin')
		assert.equal(pdfProbe.isSigned, true)
		assert.equal(pdfProbe.hasTextLayer, true)

		const docxBytes = buildStoredZipBuffer([
			{
				name: 'docProps/core.xml',
				content: '<cp:coreProperties><dc:title>Architecture Plan</dc:title><cp:lastModifiedBy>Emma</cp:lastModifiedBy><cp:revision>7</cp:revision></cp:coreProperties>',
			},
			{
				name: 'word/document.xml',
				content: '<w:document><w:body><w:ins w:id="1"/><w:p><w:r><w:t>Hello</w:t></w:r></w:p></w:body></w:document>',
			},
			{ name: 'word/comments.xml', content: '<w:comments/>' },
			{ name: 'word/media/diagram1.png', content: 'pngbytes' },
		])
		const docxProbe = docEngine.probeDocumentBuffer(docxBytes, { name: 'Architecture_Plan.docx' })
		assert.equal(docxProbe.probed, true)
		assert.equal(docxProbe.formatLabel, 'DOCX')
		assert.equal(docxProbe.title, 'Architecture Plan')
		assert.equal(docxProbe.author, 'Emma')
		assert.equal(docxProbe.revision, 7)
		assert.equal(docxProbe.hasComments, true)
		assert.equal(docxProbe.hasTrackedChanges, true)
		assert.equal(docxProbe.embeddedMediaCount, 1)

		const mdProbe = docEngine.probeDocumentBuffer('# Roadmap Q4\n\nShip fuzzy diff.\nVerify mobile.', { name: 'Roadmap.md' })
		assert.equal(mdProbe.probed, true)
		assert.equal(mdProbe.title, 'Roadmap Q4')
		assert.equal(mdProbe.headingCount, 1)
		assert.equal(mdProbe.wordCount, 8)

		// Corrupt buffer should fail gracefully without throwing
		const corruptPdf = docEngine.parsePdfMetadata(new Uint8Array([1, 2, 3]), { name: 'bad.pdf' })
		assert.equal(corruptPdf.probed, false)
		assert.equal(corruptPdf.corrupt, true)
	})

	test('computes shingle Jaccard, cosine similarity, Myers/LCS line diff, lineage catalog, and CWE-1236 exports', () => {
		const docEngine = loadDocumentEngine()

		const leftLines = ['# Spec', 'Goal: deduplicate documents fast', 'Keep signed master', 'Footer']
		const rightLines = ['# Spec', 'Goal: deduplicate documents fast', 'Keep latest version', 'Extra line', 'Footer']
		const diff = docEngine.computeDocumentLineDiff(leftLines, rightLines)
		assert.equal(diff.unchangedCount, 3)
		assert.equal(diff.removedCount, 1)
		assert.equal(diff.addedCount, 2)
		assert.ok(diff.similarityPct >= 40 && diff.similarityPct <= 80)

		const duplicates = [
			{
				id: 101,
				hash: 'doc-hash-1',
				files: [
					{ id: 1, nodeId: 11, path: '/alice/files/Contracts/Contrat_Client_v1_draft.pdf', size: 120000, mtime: 1700000000 },
					{ id: 2, nodeId: 12, path: '/alice/files/Inbox/Contrat_Client_v1_draft (1).pdf', size: 120000, mtime: 1700000100 },
				],
			},
			{
				id: 102,
				hash: 'doc-hash-2',
				files: [
					{ id: 3, nodeId: 13, path: '/alice/files/Contracts/Contrat_Client_v2_FINAL_signed.pdf', size: 145000, mtime: 1700050000, is_origin: true },
					{ id: 4, nodeId: 14, path: '/alice/files/Backup/Contrat_Client_v2_FINAL_signed.pdf', size: 145000, mtime: 1700050100 },
				],
			},
		]

		const probeByKey = {
			1: docEngine.parsePlainTextDocument('Clause 1 payment net 30\nClause 2 delivery', { name: 'Contrat_Client_v1_draft.pdf' }),
			2: docEngine.parsePlainTextDocument('Clause 1 payment net 30\nClause 2 delivery', { name: 'Contrat_Client_v1_draft (1).pdf' }),
			3: docEngine.parsePlainTextDocument('Clause 1 payment net 30\nClause 2 delivery\nSigned by Alice', { name: 'Contrat_Client_v2_FINAL_signed.pdf' }),
			4: docEngine.parsePlainTextDocument('Clause 1 payment net 30\nClause 2 delivery\nSigned by Alice', { name: 'Contrat_Client_v2_FINAL_signed.pdf' }),
		}

		const catalog = docEngine.buildDocumentLineageCatalog(duplicates, {
			clusteringMode: 'lineages',
			keepRule: 'latest_complete',
			similarityThreshold: 50,
			probeByKey,
		})

		assert.equal(catalog.clusters.length, 1)
		const cluster = catalog.clusters[0]
		assert.equal(cluster.fileCount, 4)
		assert.equal(cluster.survivorKey, '3')
		assert.equal(cluster.isCrossGroupLineage, true)
		assert.equal(cluster.hasSignedCopy, true)

		// Exact-copy-only mode should keep 1 copy of doc-hash-1 (never wipe out distinct hash when includeOlderRevisions=false)
		const exactKeys = docEngine.selectSupersededDocumentKeys(catalog, {
			includeExactCopies: true,
			includeOlderRevisions: false,
		})
		assert.deepEqual(exactKeys, ['4'])

		// All-superseded mode includes older draft revisions too, while never touching protected survivor '3'
		const allSuperseded = docEngine.selectSupersededDocumentKeys(catalog, {
			includeExactCopies: true,
			includeOlderRevisions: true,
		})
		assert.equal(allSuperseded.includes('3'), false)
		assert.equal(allSuperseded.length, 3)

		// CWE-1236 CSV formula neutralization check
		const formulaCluster = docEngine.buildDocumentLineageCatalog([
			{
				id: 201,
				hash: 'csv-hash',
				files: [
					{ id: 21, path: '/alice/files/=cmd|calc.txt', size: 100, mtime: 1700000000 },
					{ id: 22, path: '/alice/files/+SUM(A1).txt', size: 100, mtime: 1700000100 },
				],
			},
		], { clusteringMode: 'groups' })
		const csv = docEngine.exportDocumentLineageCsv(formulaCluster)
		assert.ok(csv.includes("'=cmd|calc.txt") || csv.includes('"\'=cmd|calc.txt"'))
		assert.ok(csv.includes("'+SUM(A1).txt") || csv.includes('"\'+SUM(A1).txt"'))

		const json = JSON.parse(docEngine.exportDocumentLineageJson(catalog, '2026-11-23T12:00:00Z'))
		assert.equal(json.schema, docEngine.DOC_LINEAGE_SCHEMA)
		assert.equal(json.clusters.length, 1)
	})

	test('DocumentLineageWorkbench.vue renders empty, populated, non-clamping threshold, WebDAV probe diff, XSS defense, and safe delete', async () => {
		const deletedPayloads = []
		const Workbench = createWorkbenchComponent(async files => {
			deletedPayloads.push(...files)
			return { success: files, deletedNodeIds: files.map(f => f.nodeId) }
		})

		// 1. Empty state
		const emptyVm = new Vue({
			render: h => h(Workbench, {
				props: { duplicates: [], allDuplicates: [] },
			}),
		}).$mount()
		await settle()
		assert.ok(emptyVm.$el.querySelector('.doc-workbench__empty'))
		let scanTriggered = false
		emptyVm.$children[0].$on('start-scan', () => { scanTriggered = true })
		emptyVm.$el.querySelector('.doc-workbench__primary-btn').click()
		assert.equal(scanTriggered, true)
		emptyVm.$destroy()

		// 2. Populated state + live fetch probe + XSS defense
		const origFetch = global.fetch
		const origWindowFetch = global.window.fetch
		const mockContentByUrl = {
			'https://cloud.example.test/doc1': '# Release Notes\nInitial draft\n<script>alert(1)</script>',
			'https://cloud.example.test/doc2': '# Release Notes\nUpdated release notes\nVerified tests\n<script>alert(1)</script>',
		}
		const fetchStub = async url => ({
			ok: true,
			status: 200,
			arrayBuffer: async () => new TextEncoder().encode(mockContentByUrl[url] || 'fallback').buffer,
		})
		global.fetch = fetchStub
		global.window.fetch = fetchStub

		try {
			const duplicates = [
				{
					id: 501,
					hash: 'md-hash-1',
					files: [
						{
							id: 61,
							nodeId: 601,
							path: '/alice/files/Docs/Notes_v1_draft.md',
							downloadUrl: 'https://cloud.example.test/doc1',
							size: 400,
							mtime: 1700000000,
						},
						{
							id: 62,
							nodeId: 602,
							path: '/alice/files/Inbox/Notes_v1_draft (1).md',
							downloadUrl: 'https://cloud.example.test/doc1',
							size: 400,
							mtime: 1700000100,
						},
					],
				},
				{
					id: 502,
					hash: 'md-hash-2',
					files: [
						{
							id: 63,
							nodeId: 603,
							path: '/alice/files/Docs/Notes_v2_FINAL.md',
							downloadUrl: 'https://cloud.example.test/doc2',
							size: 520,
							mtime: 1700020000,
						},
						{
							id: 64,
							nodeId: 604,
							path: '/alice/files/Backup/Notes_v2_FINAL.md',
							downloadUrl: 'https://cloud.example.test/doc2',
							size: 520,
							mtime: 1700020100,
						},
					],
				},
			]

			const vm = new Vue({
				render: h => h(Workbench, {
					props: { duplicates, allDuplicates: duplicates },
				}),
			}).$mount()
			await settle()

			assert.equal(vm.$el.querySelectorAll('.doc-cluster-card').length, 1)
			assert.equal(vm.$el.querySelectorAll('.doc-revision-card').length, 4)

			// Non-clamping numeric threshold input mid-keystroke
			const numInput = vm.$el.querySelector('.doc-workbench__number-input')
			numInput.value = '8'
			numInput.dispatchEvent(new window.Event('input'))
			await settle()
			assert.equal(vm.$children[0].similarityDraft, '8')
			numInput.dispatchEvent(new window.Event('blur'))
			await settle()
			assert.equal(vm.$children[0].similarityThreshold, 50)
			assert.equal(vm.$children[0].similarityDraft, '50')

			// Probe active pair via mocked WebDAV fetch
			await vm.$children[0].probeActivePair()
			await settle()
			const diffLines = vm.$el.querySelectorAll('.doc-diff-line')
			assert.ok(diffLines.length >= 3)
			// Verify XSS payload rendered strictly as text, zero injected <script> tags
			assert.equal(vm.$el.querySelectorAll('script').length, 0)
			assert.ok(vm.$el.textContent.includes('<script>alert(1)</script>'))

			// Select exact copies and execute safe deletion
			vm.$children[0].selectSupersededCopies(false)
			await settle()
			assert.equal(vm.$children[0].selectedDeleteItems.length, 1)

			let completedEvents = 0
			vm.$children[0].$on('doc-delete-completed', () => { completedEvents += 1 })
			await vm.$children[0].confirmDocumentDeletion()
			await settle()
			assert.equal(deletedPayloads.length, 1)
			assert.equal(completedEvents, 1)

			vm.$destroy()
		} finally {
			global.fetch = origFetch
			global.window.fetch = origWindowFetch
		}
	})

	test('App.vue + keyboardShortcuts wire 6 shortcut, topbar Doc Lineage button, and help dialog', async () => {
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const reclamationHistory = loadModule('src/tools/reclamationHistory.js', {
			'./duplicateFilters': loadModule('src/tools/duplicateFilters.js'),
			'./duplicateStats': loadModule('src/tools/duplicateStats.js'),
		})

		const shortcut6 = keyboardShortcuts.SHORTCUT_DEFINITIONS.find(def => def.keys.includes('6'))
		assert.ok(shortcut6)
		assert.equal(shortcut6.action, 'toggle-document-lineage')
		assert.equal(keyboardShortcuts.resolveShortcutAction({ key: '6' }), 'toggle-document-lineage')

		const stub = name => ({ name, render(h) { return h('div', { class: `stub-${name}` }) } })
		const slotBox = tag => ({
			functional: true,
			render(h, ctx) { return h(tag, ctx.data, ctx.children) },
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
				fetchDuplicates: async type => ({
					entities: type === 'unacknowledged' ? [] : [],
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

		const topbarBtn = appVm.$el.querySelector('.topbar-document-lineage-button')
		assert.ok(topbarBtn, 'Doc Lineage topbar button renders in details view')
		assert.equal(topbarBtn.getAttribute('aria-keyshortcuts'), '6')
		assert.equal(topbarBtn.getAttribute('aria-pressed'), 'false')

		// Press 6 shortcut
		appVm.$children[0].handleGlobalKeydown({ key: '6', preventDefault() {} })
		await settle()
		assert.equal(appVm.$children[0].documentLineageOpen, true)
		assert.equal(topbarBtn.getAttribute('aria-pressed'), 'true')
		assert.ok(appVm.$el.querySelector('.stub-document-lineage'))

		// Press 6 again to close
		appVm.$children[0].handleGlobalKeydown({ key: '6', preventDefault() {} })
		await settle()
		assert.equal(appVm.$children[0].documentLineageOpen, false)

		appVm.$destroy()
	})

	test('Cycle 135 touched files preserve zero U+2013/U+2014 dashes, zero XSS sinks, logical CSS, and >= 44px mobile targets', () => {
		const files = [
			'src/tools/documentLineageInspector.js',
			'src/components/DocumentLineageWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
			'tests/frontend/document-lineage-workbench.test.cjs',
		]
		for (const rel of files) {
			const content = readFileSync(resolve(__dirname, '../..', rel), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(content), false, `${rel} must contain zero typographic dashes`)
			if (!rel.endsWith('.test.cjs')) {
				assert.equal(/\bv-html\b|\.innerHTML\b|\.outerHTML\b|document\.write\b/.test(content), false, `${rel} must contain zero XSS sinks`)
			}
		}

		const vueCss = readFileSync(resolve(__dirname, '../..', 'src/components/DocumentLineageWorkbench.vue'), 'utf8')
		assert.ok(vueCss.includes('minmax(0, 1fr)'))
		assert.ok(vueCss.includes('padding-block'))
		assert.ok(vueCss.includes('padding-inline'))
		assert.ok(vueCss.includes(':focus-visible'))
		assert.ok(vueCss.includes('min-block-size: 44px'))
	})
})
