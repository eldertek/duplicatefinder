const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window } = require('./helpers.cjs')

function loadForensicModules() {
	const duplicateStats = loadModule('src/tools/duplicateStats.js', {})
	const duplicateFilters = loadModule('src/tools/duplicateFilters.js', {})
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js', {})
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js', {})
	const forensicChecksumVerifier = loadModule('src/tools/forensicChecksumVerifier.js', {
		'./duplicateStats': duplicateStats,
		'./duplicateFilters': duplicateFilters,
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
	})
	return {
		duplicateStats,
		duplicateFilters,
		duplicatePathDiff,
		duplicateSelectionAndExport,
		forensicChecksumVerifier,
	}
}

function loadForensicWorkbench(apiMock = {}) {
	const {
		duplicateSelectionAndExport,
		forensicChecksumVerifier,
	} = loadForensicModules()

	const utils = loadModule('src/tools/utils.js', {
		'./notifications': { showErrorNotification: () => {} },
	})

	return loadComponent('src/components/ForensicVerifierWorkbench.vue', {
		'../tools/api': {
			deleteFiles: apiMock.deleteFiles || (async () => ({ deleted: [], failed: [] })),
		},
		'../tools/duplicateSelectionAndExport': duplicateSelectionAndExport,
		'../tools/utils': utils,
		'../tools/forensicChecksumVerifier': forensicChecksumVerifier,
	})
}

function makePdfBuffer(payloadSuffix = 'A') {
	const text = `%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Note (${payloadSuffix}) >>\nendobj\n%%EOF\n`
	return Buffer.from(text, 'utf8')
}

function makePngBuffer() {
	return Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D])
}

function makeSampleDuplicates() {
	const pdfA = makePdfBuffer('MASTER-0001')
	const pdfB = makePdfBuffer('MASTER-0001')
	const pdfDrift = makePdfBuffer('TAMPER-9999')
	const pngSpoof = makePngBuffer()

	const now = Date.UTC(2026, 10, 24, 0, 0, 0)
	const day = 86400000

	return [
		{
			id: 201,
			hash: 'd41d8cd98f00b204e9800998ecf8427e',
			size: pdfA.length,
			files: [
				{
					id: 2001,
					fileId: 2001,
					path: '/alice/files/Contracts/MasterAgreement.pdf',
					size: pdfA.length,
					mtime: now - 10 * day,
					inlineBuffer: pdfA,
				},
				{
					id: 2002,
					fileId: 2002,
					path: '/alice/files/Downloads/MasterAgreement-copy.pdf',
					size: pdfB.length,
					mtime: now - 2 * day,
					inlineBuffer: pdfB,
				},
			],
		},
		{
			id: 202,
			hash: '098f6bcd4621d373cade4e832627b4f6',
			size: pdfA.length,
			files: [
				{
					id: 2003,
					fileId: 2003,
					path: '/alice/files/Legal/AuditBrief.pdf',
					size: pdfA.length,
					mtime: now - 8 * day,
					inlineBuffer: pdfA,
				},
				{
					id: 2004,
					fileId: 2004,
					path: '/alice/files/SyncTemp/AuditBrief.pdf',
					size: pdfDrift.length,
					mtime: now - 1 * day,
					inlineBuffer: pdfDrift,
				},
			],
		},
		{
			id: 203,
			hash: '5d41402abc4b2a76b9719d911017c592',
			size: pngSpoof.length,
			files: [
				{
					id: 2005,
					fileId: 2005,
					path: '/alice/files/Quarantine/fake-invoice.pdf',
					size: pngSpoof.length,
					mtime: now - 3 * day,
					inlineBuffer: pngSpoof,
				},
				{
					id: 2006,
					fileId: 2006,
					path: '/alice/files/Archive/fake-invoice.pdf',
					size: pngSpoof.length,
					mtime: now - 1 * day,
					inlineBuffer: pngSpoof,
				},
			],
		},
	]
}

test('Cycle 146: Zero-Touch Forensic Diff & Checksum Chain Verifier', async t => {
	await t.test('sha256HexSync and computeSha256Hex match NIST FIPS 180-4 test vectors', async () => {
		const { forensicChecksumVerifier } = loadForensicModules()
		const emptyDigest = forensicChecksumVerifier.sha256HexSync(new Uint8Array(0))
		assert.equal(emptyDigest, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')

		const abcBytes = Buffer.from('abc', 'utf8')
		assert.equal(
			forensicChecksumVerifier.sha256HexSync(abcBytes),
			'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
		)
		assert.equal(
			await forensicChecksumVerifier.computeSha256Hex(abcBytes),
			'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
		)
	})

	await t.test('detectMagicSignature and checkExtensionSignatureCoherence catch extension spoofing and null-fill corruption', () => {
		const { forensicChecksumVerifier } = loadForensicModules()
		const pngMagic = forensicChecksumVerifier.detectMagicSignature(makePngBuffer())
		assert.equal(pngMagic.family, 'png')
		assert.equal(pngMagic.isAllZero, false)

		const spoofCheck = forensicChecksumVerifier.checkExtensionSignatureCoherence('/files/invoice.pdf', pngMagic)
		assert.equal(spoofCheck.coherent, false)
		assert.ok(spoofCheck.reason.includes('.pdf'))

		const validCheck = forensicChecksumVerifier.checkExtensionSignatureCoherence('/files/photo.png', pngMagic)
		assert.equal(validCheck.coherent, true)

		const zeroBuf = new Uint8Array(64)
		const zeroMagic = forensicChecksumVerifier.detectMagicSignature(zeroBuf)
		assert.equal(zeroMagic.isAllZero, true)
		assert.equal(forensicChecksumVerifier.checkExtensionSignatureCoherence('/files/data.bin', zeroMagic).coherent, false)
	})

	await t.test('compareByteBuffersForensic pinpoints exact first divergence byte offset and hex/ASCII window', () => {
		const { forensicChecksumVerifier } = loadForensicModules()
		const a = Buffer.from('HEADER_BLOCK_0000_PAYLOAD_ALPHA_END', 'utf8')
		const b = Buffer.from('HEADER_BLOCK_0000_PAYLOAD_OMEGA_END', 'utf8')

		const identical = forensicChecksumVerifier.compareByteBuffersForensic(a, a)
		assert.equal(identical.identical, true)
		assert.equal(identical.firstDivergenceOffset, -1)

		const diff = forensicChecksumVerifier.compareByteBuffersForensic(a, b)
		assert.equal(diff.identical, false)
		assert.equal(diff.firstDivergenceOffset, 26)
		assert.ok(diff.mismatchedBytes >= 4)
		assert.ok(diff.asciiA.includes('ALPHA'))
		assert.ok(diff.asciiB.includes('OMEGA'))
		assert.ok(diff.divergentIndices.length >= 4)
	})

	await t.test('analyzeForensicChecksumChain classifies cleared, drift-blocked, and signature-anomaly groups accurately', async () => {
		const { forensicChecksumVerifier, duplicateSelectionAndExport } = loadForensicModules()
		const groups = makeSampleDuplicates()
		const liveMap = {}

		for (const group of groups) {
			for (let i = 0; i < group.files.length; i++) {
				const f = group.files[i]
				const key = duplicateSelectionAndExport.getFileSelectionKey(f, i)
				liveMap[key] = await forensicChecksumVerifier.buildLiveVerificationRecord(f, {
					fullBuffer: f.inlineBuffer,
				})
			}
		}

		const report = forensicChecksumVerifier.analyzeForensicChecksumChain(groups, {
			liveVerificationsByKey: liveMap,
			strictVerifiedOnly: true,
			blockSignatureMismatch: true,
		})

		assert.equal(report.summary.totalGroups, 3)
		assert.equal(report.summary.clearedGroupCount, 1)
		assert.equal(report.summary.blockedGroupCount, 2)
		assert.equal(report.summary.driftFileCount, 1)

		const g201 = report.allItems.find(item => item.groupId === 201)
		const g202 = report.allItems.find(item => item.groupId === 202)
		const g203 = report.allItems.find(item => item.groupId === 203)
		assert.equal(g201.verdict, 'cleared')
		assert.equal(g202.verdict, 'blocked-drift')
		assert.ok(g202.firstByteDiff && g202.firstByteDiff.firstDivergenceOffset > 0)
		assert.equal(g203.verdict, 'blocked-anomaly')

		// Only the cleared redundant copy in group 201 should be selectable for safe deletion
		const safeSelection = forensicChecksumVerifier.collectForensicClearedSelection(report)
		assert.equal(safeSelection.files.length, 1)
		assert.equal(safeSelection.files[0].id, 2002)
	})

	await t.test('export builders produce valid JSON certificate, sha256sum manifest, and CWE-1236-safe CSV', async () => {
		const { forensicChecksumVerifier, duplicateSelectionAndExport } = loadForensicModules()
		const groups = [
			{
				id: 301,
				hash: 'd41d8cd98f00b204e9800998ecf8427e',
				size: 16,
				files: [
					{ id: 3001, path: '=CMD("calc")/Master.txt', size: 16, mtime: 1700000000000, inlineBuffer: Buffer.from('0123456789ABCDEF') },
					{ id: 3002, path: '/Backup/Master.txt', size: 16, mtime: 1700000500000, inlineBuffer: Buffer.from('0123456789ABCDEF') },
				],
			},
		]
		const liveMap = {}
		for (let i = 0; i < groups[0].files.length; i++) {
			const f = groups[0].files[i]
			liveMap[duplicateSelectionAndExport.getFileSelectionKey(f, i)] = await forensicChecksumVerifier.buildLiveVerificationRecord(f, {
				fullBuffer: f.inlineBuffer,
			})
		}

		const report = forensicChecksumVerifier.analyzeForensicChecksumChain(groups, { liveVerificationsByKey: liveMap })
		const json = JSON.parse(forensicChecksumVerifier.buildForensicChecksumManifest(report))
		assert.equal(json.schema, forensicChecksumVerifier.FORENSIC_CHAIN_SCHEMA)
		assert.equal(json.groups[0].copies.length, 2)

		const sums = forensicChecksumVerifier.buildForensicSha256SumsFile(report)
		assert.ok(sums.includes('/Backup/Master.txt'))
		assert.ok(/^[0-9a-f]{64} {2}/m.test(sums))

		const csv = forensicChecksumVerifier.buildForensicAuditCsv(report)
		assert.ok(csv.includes('"=CMD(""calc"")/Master.txt"') || csv.includes('"\'=CMD'))
		assert.ok(!csv.includes('\n=CMD'))
	})

	await t.test('ForensicVerifierWorkbench.vue renders empty & populated views, runs zero-touch verification, displays byte diff, and deletes only cleared copies', async () => {
		const deletedPayloads = []
		const completedEvents = []
		const Workbench = loadForensicWorkbench({
			deleteFiles: async files => {
				deletedPayloads.push(files)
				return { deleted: files.map(f => f.id), failed: [] }
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

		const sample = makeSampleDuplicates()
		const vm = new Vue({
			render(h) {
				return h(Workbench, {
					props: {
						duplicates: sample,
						allDuplicates: sample,
						currentDuplicateId: 201,
					},
					on: {
						'forensic-delete-completed': payload => completedEvents.push(payload),
					},
				})
			},
		}).$mount()
		await settle()

		assert.ok(vm.$el.textContent.includes('Zero-Touch Forensic Diff & Checksum Chain'))
		assert.ok(vm.$el.textContent.includes('MasterAgreement.pdf'))

		// Click "Verify Visible" to run live zero-touch SHA-256 verification across all 3 groups
		const verifyAllBtn = Array.from(vm.$el.querySelectorAll('button')).find(b => b.textContent.includes('Verify Visible'))
		assert.ok(verifyAllBtn)
		verifyAllBtn.click()
		const deadline = Date.now() + 2000
		while (vm.$el.textContent.includes('Pending Probe') && Date.now() < deadline) {
			await settle()
		}
		await settle()

		assert.ok(vm.$el.textContent.includes('Cleared'))
		assert.ok(vm.$el.textContent.includes('Drift Blocked'))
		assert.ok(vm.$el.textContent.includes('Forensic Byte Divergence Detected at Offset'))

		// Global Delete Cleared Copies should target ONLY the single cleared redundant copy (id 2002)
		const globalDelBtn = vm.$el.querySelector('.fvw__global-action-bar button.fvw__primary-btn.is-danger')
		assert.ok(globalDelBtn, 'Global Delete Cleared Copies button must appear')
		globalDelBtn.click()
		await settle()

		const confirmBtn = vm.$el.querySelector('dialog button.fvw__primary-btn.is-danger')
		assert.ok(confirmBtn, 'Confirm button inside dialog must exist')
		confirmBtn.click()
		await settle()

		assert.equal(deletedPayloads.length, 1)
		assert.equal(deletedPayloads[0].length, 1)
		assert.equal(deletedPayloads[0][0].id, 2002)
		assert.equal(completedEvents.length, 1)
		assert.equal(completedEvents[0].source, 'forensic-checksum-verifier')

		vm.$destroy()
	})

	await t.test('App.vue wires topbar Forensic button and . keyboard shortcut', async () => {
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		const reclamationHistory = loadModule('src/tools/reclamationHistory.js', {
			'./duplicateStats': loadModule('src/tools/duplicateStats.js'),
			'./duplicateFilters': loadModule('src/tools/duplicateFilters.js'),
		})
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
			render(h) {
				return h(App)
			},
		}).$mount()
		await settle()

		const appComp = vm.$children[0]
		const btn = vm.$el.querySelector('button.topbar-forensic-verifier-button')
		assert.ok(btn, 'Topbar Forensic button must be rendered')
		assert.equal(btn.getAttribute('aria-keyshortcuts'), '.')
		assert.equal(btn.getAttribute('aria-pressed'), 'false')

		btn.click()
		await settle()
		assert.equal(appComp.forensicVerifierOpen, true)
		assert.equal(btn.getAttribute('aria-pressed'), 'true')
		assert.ok(vm.$el.querySelector('.stub-forensic-verifier'))

		window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '.', bubbles: true }))
		await settle()
		assert.equal(appComp.forensicVerifierOpen, false)

		vm.$destroy()
	})

	await t.test('Cycle 146 touched files preserve zero U+2013/U+2014 dashes, zero XSS sinks, logical CSS, and >= 44px mobile targets', () => {
		const files = [
			'src/tools/forensicChecksumVerifier.js',
			'src/components/ForensicVerifierWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
		]
		for (const relPath of files) {
			const content = readFileSync(resolve(__dirname, '../..', relPath), 'utf8')
			assert.ok(!/[\u2013\u2014]/.test(content), `No U+2013/U+2014 allowed in ${relPath}`)
			assert.ok(!/v-html|innerHTML|outerHTML|document\.write/.test(content), `No XSS sink allowed in ${relPath}`)
		}
		const vueContent = readFileSync(resolve(__dirname, '../..', 'src/components/ForensicVerifierWorkbench.vue'), 'utf8')
		assert.ok(vueContent.includes(':focus-visible'))
		assert.ok(vueContent.includes('44px'))
		assert.ok(vueContent.includes('padding-inline'))
		assert.ok(vueContent.includes('minmax('))
	})
})
