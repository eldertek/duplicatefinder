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

function loadArchiveModules() {
	const stats = loadModule('src/tools/duplicateStats.js')
	const filters = loadModule('src/tools/duplicateFilters.js')
	const pathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const selectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const inspector = loadModule('src/tools/archivePayloadInspector.js', {
		'./duplicateStats': stats,
		'./duplicateFilters': filters,
		'./duplicatePathDiff': pathDiff,
		'./duplicateSelectionAndExport': selectionAndExport,
	})
	return { stats, filters, pathDiff, selectionAndExport, inspector }
}

function loadWorkbenchComponent(deps, overrides = {}) {
	const utils = loadModule('src/tools/utils.js', {
		'./notifications': { showErrorNotification: () => {} },
	})
	return loadComponent('src/components/ArchivePayloadInspector.vue', {
		'../tools/api': {
			deleteFiles: async () => ({ success: [], errors: [] }),
			...(overrides.api || {}),
		},
		'../tools/duplicateStats': deps.stats,
		'../tools/utils': utils,
		'../tools/archivePayloadInspector': deps.inspector,
	})
}

/**
 * Build a spec-compliant synthetic ZIP buffer (Local File Headers + Central Directory + EOCD).
 */
function buildSyntheticZipBuffer(entries) {
	const localChunks = []
	const cdChunks = []
	let offset = 0

	for (const item of entries) {
		const nameBytes = Buffer.from(item.name, 'utf8')
		const payloadBytes = item.payload ? Buffer.from(item.payload) : Buffer.alloc(0)
		const compressedSize = item.compressedSize !== undefined ? item.compressedSize : payloadBytes.length
		const uncompressedSize = item.uncompressedSize !== undefined ? item.uncompressedSize : payloadBytes.length
		const crc32 = item.crc32 !== undefined ? item.crc32 : 0x12345678
		const method = item.method !== undefined ? item.method : 0
		const flags = 0x0800 // UTF-8
		const dosTime = 0x5421
		const dosDate = 0x5b77 // 2025-11-23

		const localHeader = Buffer.alloc(30)
		localHeader.writeUInt32LE(0x04034b50, 0)
		localHeader.writeUInt16LE(20, 4)
		localHeader.writeUInt16LE(flags, 6)
		localHeader.writeUInt16LE(method, 8)
		localHeader.writeUInt16LE(dosTime, 10)
		localHeader.writeUInt16LE(dosDate, 12)
		localHeader.writeUInt32LE(crc32 >>> 0, 14)
		localHeader.writeUInt32LE(compressedSize >>> 0, 18)
		localHeader.writeUInt32LE(uncompressedSize >>> 0, 22)
		localHeader.writeUInt16LE(nameBytes.length, 26)
		localHeader.writeUInt16LE(0, 28)

		localChunks.push(localHeader, nameBytes, payloadBytes)

		const cdHeader = Buffer.alloc(46)
		cdHeader.writeUInt32LE(0x02014b50, 0)
		cdHeader.writeUInt16LE(20, 4)
		cdHeader.writeUInt16LE(20, 6)
		cdHeader.writeUInt16LE(flags, 8)
		cdHeader.writeUInt16LE(method, 10)
		cdHeader.writeUInt16LE(dosTime, 12)
		cdHeader.writeUInt16LE(dosDate, 14)
		cdHeader.writeUInt32LE(crc32 >>> 0, 16)
		cdHeader.writeUInt32LE(compressedSize >>> 0, 20)
		cdHeader.writeUInt32LE(uncompressedSize >>> 0, 24)
		cdHeader.writeUInt16LE(nameBytes.length, 28)
		cdHeader.writeUInt16LE(0, 30)
		cdHeader.writeUInt16LE(0, 32)
		cdHeader.writeUInt16LE(0, 34)
		cdHeader.writeUInt16LE(0, 36)
		cdHeader.writeUInt32LE(item.name.endsWith('/') ? 0x10 : 0, 38)
		cdHeader.writeUInt32LE(offset, 42)

		cdChunks.push(cdHeader, nameBytes)
		offset += localHeader.length + nameBytes.length + payloadBytes.length
	}

	const cdBuffer = Buffer.concat(cdChunks)
	const eocd = Buffer.alloc(22)
	eocd.writeUInt32LE(0x06054b50, 0)
	eocd.writeUInt16LE(0, 4)
	eocd.writeUInt16LE(0, 6)
	eocd.writeUInt16LE(entries.length, 8)
	eocd.writeUInt16LE(entries.length, 10)
	eocd.writeUInt32LE(cdBuffer.length, 12)
	eocd.writeUInt32LE(offset, 16)
	eocd.writeUInt16LE(0, 20)

	const full = Buffer.concat([...localChunks, cdBuffer, eocd])
	return {
		arrayBuffer: full.buffer.slice(full.byteOffset, full.byteOffset + full.byteLength),
		cdOffset: offset,
		totalLength: full.length,
	}
}

/**
 * Build a minimal USTAR TAR binary buffer.
 */
function buildSyntheticTarBuffer(entries) {
	const blocks = []
	for (const item of entries) {
		const header = Buffer.alloc(512)
		Buffer.from(item.name, 'utf8').copy(header, 0, 0, 100)
		const size = item.size || 0
		Buffer.from(size.toString(8).padStart(11, '0'), 'ascii').copy(header, 124)
		Buffer.from('15000000000', 'ascii').copy(header, 136)
		header[156] = item.name.endsWith('/') ? 53 : 48 // '5' or '0'
		Buffer.from('ustar\0', 'ascii').copy(header, 257)
		Buffer.from('00', 'ascii').copy(header, 263)
		blocks.push(header)

		const paddedSize = Math.ceil(size / 512) * 512
		if (paddedSize > 0) {
			blocks.push(Buffer.alloc(paddedSize))
		}
	}
	blocks.push(Buffer.alloc(1024))
	const full = Buffer.concat(blocks)
	return full.buffer.slice(full.byteOffset, full.byteOffset + full.byteLength)
}

/**
 * Build a minimal GZIP header + trailer with FNAME flag.
 */
function buildSyntheticGzipBuffer(innerName, isize) {
	const nameBytes = Buffer.from(`${innerName}\0`, 'utf8')
	const header = Buffer.alloc(10)
	header[0] = 0x1f
	header[1] = 0x8b
	header[2] = 0x08
	header[3] = 0x08 // FNAME
	header.writeUInt32LE(1760000000, 4)
	const trailer = Buffer.alloc(8)
	trailer.writeUInt32LE(isize >>> 0, 4)
	const full = Buffer.concat([header, nameBytes, Buffer.from([0x03, 0x00]), trailer])
	return full.buffer.slice(full.byteOffset, full.byteOffset + full.byteLength)
}

describe('Cycle 130: Archive & Container Payload Duplicate Inspector Workbench', () => {
	test('parses ZIP Central Directory, tail-range windows, local-header fallback, TAR, and GZIP safely', () => {
		const { inspector } = loadArchiveModules()

		const zip = buildSyntheticZipBuffer([
			{ name: 'docs/', uncompressedSize: 0, compressedSize: 0, crc32: 0 },
			{ name: 'docs/Q4-Report.pdf', uncompressedSize: 2048000, compressedSize: 1024000, crc32: 0xaabbccdd, method: 8 },
			{ name: 'backup/Q4-Report-dup.pdf', uncompressedSize: 2048000, compressedSize: 1024000, crc32: 0xaabbccdd, method: 8 },
			{ name: 'nested/inner-bundle.zip', uncompressedSize: 512000, compressedSize: 400000, crc32: 0x11223344, method: 8 },
			{ name: '../../etc/passwd', uncompressedSize: 512, compressedSize: 256, crc32: 0x99887766, method: 8 },
			{ name: 'bomb.bin', uncompressedSize: 250 * 1024 * 1024, compressedSize: 1024, crc32: 0x55555555, method: 8 },
		])

		const parsedZip = inspector.parseZipBuffer(zip.arrayBuffer)
		assert.equal(parsedZip.status, 'ready')
		assert.equal(parsedZip.parseMode, 'central-directory')
		assert.equal(parsedZip.summary.fileCount, 5)
		assert.equal(parsedZip.summary.directoryCount, 1)
		assert.equal(parsedZip.summary.nestedArchiveCount, 1)
		assert.equal(parsedZip.summary.intraDuplicateCount, 1)
		assert.equal(parsedZip.summary.intraDuplicateWastedBytes, 2048000)
		assert.equal(parsedZip.summary.pathTraversalCount, 1)
		assert.equal(parsedZip.summary.zipBombSuspectCount, 1)

		// Tail-window range simulation (offset slice starting inside file)
		const fullBytes = new Uint8Array(zip.arrayBuffer)
		const tailStart = zip.cdOffset
		const tailSlice = fullBytes.slice(tailStart)
		const parsedTail = inspector.parseZipBuffer(tailSlice, {
			tailOffset: tailStart,
			headBuffer: fullBytes.slice(0, 64),
		})
		assert.equal(parsedTail.parseMode, 'central-directory')
		assert.equal(parsedTail.summary.fileCount, 5)

		// Local-header fallback when EOCD is absent (only first header bytes provided)
		const localOnlyZip = buildSyntheticZipBuffer([
			{ name: 'alpha.txt', payload: Buffer.from('hello world'), method: 0, crc32: 0x0d4a1185 },
		])
		const headSlice = new Uint8Array(localOnlyZip.arrayBuffer).slice(0, 30 + 9 + 11)
		const parsedLocal = inspector.parseZipBuffer(headSlice)
		assert.equal(parsedLocal.status, 'ready')
		assert.equal(parsedLocal.parseMode, 'local-headers')
		assert.equal(parsedLocal.entries[0].path, 'alpha.txt')

		// TAR USTAR parser
		const tarBuf = buildSyntheticTarBuffer([
			{ name: 'src/', size: 0 },
			{ name: 'src/index.js', size: 1024 },
			{ name: 'vendor/deps.tar.gz', size: 4096 },
		])
		const parsedTar = inspector.parseTarBuffer(tarBuf)
		assert.equal(parsedTar.status, 'ready')
		assert.equal(parsedTar.format, 'tar')
		assert.equal(parsedTar.summary.fileCount, 2)
		assert.equal(parsedTar.summary.directoryCount, 1)
		assert.equal(parsedTar.summary.nestedArchiveCount, 1)

		// GZIP header parser
		const gzBuf = buildSyntheticGzipBuffer('database-dump.sql', 65536)
		const parsedGz = inspector.parseArchivePayload(gzBuf, { path: '/alice/files/Backups/db.sql.gz', size: 8192 })
		assert.equal(parsedGz.status, 'ready')
		assert.equal(parsedGz.format, 'gzip')
		assert.equal(parsedGz.entries[0].path, 'database-dump.sql')
		assert.equal(parsedGz.entries[0].uncompressedSize, 65536)

		// Signature mismatch check (.zip file containing RAR header)
		const rarMagic = new Uint8Array([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00])
		const mismatch = inspector.parseArchivePayload(rarMagic, { path: '/alice/files/disguised.zip', size: 1024 })
		assert.equal(mismatch.status, 'signature-only')
		assert.equal(mismatch.format, 'rar')
		assert.equal(mismatch.signatureMismatch, true)
	})

	test('detects cross-archive payload overlaps, loose extracted file matches, and builds CWE-1236-safe exports', () => {
		const { inspector } = loadArchiveModules()

		const zipA = buildSyntheticZipBuffer([
			{ name: 'docs/Q4-Report.pdf', uncompressedSize: 2048000, compressedSize: 1000000, crc32: 0x11111111, method: 8 },
			{ name: 'docs/budget.xlsx', uncompressedSize: 512000, compressedSize: 250000, crc32: 0x22222222, method: 8 },
		])
		const zipB = buildSyntheticZipBuffer([
			{ name: 'archived/Q4-Report.pdf', uncompressedSize: 2048000, compressedSize: 1000000, crc32: 0x11111111, method: 8 },
			{ name: 'archived/extra.txt', uncompressedSize: 1024, compressedSize: 500, crc32: 0x33333333, method: 8 },
		])

		const duplicates = [
			{
				id: 201,
				hash: 'zip-a-hash',
				files: [
					{ id: 1, path: '/alice/files/Backups/=cmd|calc.zip', size: 1250000, mtime: 1700000000, isInOriginFolder: true, archiveBuffer: zipA.arrayBuffer },
					{ id: 2, path: '/alice/files/Downloads/=cmd|calc.zip', size: 1250000, mtime: 1700100000, isInOriginFolder: false },
				],
			},
			{
				id: 202,
				hash: 'zip-b-hash',
				files: [
					{ id: 3, path: '/alice/files/Backups/feb-release.zip', size: 1000500, mtime: 1700200000, isInOriginFolder: false, archiveBuffer: zipB.arrayBuffer },
					{ id: 4, path: '/alice/files/Temp/feb-release.zip', size: 1000500, mtime: 1700300000, isInOriginFolder: false },
				],
			},
			{
				id: 203,
				hash: 'loose-pdf-hash',
				files: [
					{ id: 5, path: '/alice/files/Extracted/Q4-Report.pdf', size: 2048000, mtime: 1700400000, isInOriginFolder: false },
					{ id: 6, path: '/alice/files/Shared/Q4-Report.pdf', size: 2048000, mtime: 1700500000, isInOriginFolder: false },
				],
			},
		]

		const inspectedMap = {
			'201': inspector.parseArchivePayload(zipA.arrayBuffer, duplicates[0].files[0]),
			'202': inspector.parseArchivePayload(zipB.arrayBuffer, duplicates[1].files[0]),
		}

		const catalog = inspector.buildArchiveGroupsCatalog(duplicates, inspectedMap, { keepRule: 'oldest' })
		assert.equal(catalog.summary.totalArchiveGroups, 2)
		assert.equal(catalog.summary.extractedOverlapGroupsCount, 2)
		assert.equal(catalog.summary.crossOverlapPairsCount, 1)
		assert.equal(catalog.crossOverlaps[0].jaccardPercent, 33)
		assert.equal(catalog.crossOverlaps[0].sharedBytes, 2048000)

		const group201 = catalog.groups.find(g => g.groupId === 201)
		assert.equal(group201.extractedMatchCount, 1)
		assert.equal(group201.survivors[0].id, 1)
		assert.equal(group201.deletionCandidates[0].id, 2)

		const comparison = inspector.compareArchivePayloads(inspectedMap['201'], inspectedMap['202'])
		assert.equal(comparison.sharedCount, 1)
		assert.equal(comparison.onlyACount, 1)
		assert.equal(comparison.onlyBCount, 1)

		const jsonText = inspector.buildArchiveAuditJson(catalog, comparison)
		const parsedJson = JSON.parse(jsonText)
		assert.equal(parsedJson.schema, inspector.ARCHIVE_INSPECTOR_SCHEMA)
		assert.equal(parsedJson.archives.length, 2)

		const csvText = inspector.buildArchiveAuditCsv(catalog)
		assert.ok(csvText.includes('"\'=cmd|calc.zip"'), 'Formula injection prefix must be neutralized in CSV export')
	})

	test('ArchivePayloadInspector.vue renders empty, populated, inspection, side-by-side compare, safe delete, and XSS defense', async () => {
		const deps = loadArchiveModules()
		const deletedPayloads = []
		const Workbench = loadWorkbenchComponent(deps, {
			api: {
				deleteFiles: async files => {
					deletedPayloads.push(files)
					return { success: files, errors: [], deletedNodeIds: files.map(f => f.nodeId) }
				},
			},
		})

		// Empty state
		const emptyEvents = []
		const emptyVm = new Vue({
			render(h) {
				return h(Workbench, {
					props: { duplicates: [], allDuplicates: [] },
					on: { 'start-scan': () => emptyEvents.push('scan') },
				})
			},
		}).$mount()
		await settle()
		assert.ok(emptyVm.$el.textContent.includes('No duplicate groups loaded yet'))
		emptyVm.$el.querySelector('.archive-workbench__primary-btn').click()
		await settle()
		assert.deepEqual(emptyEvents, ['scan'])

		const zipA = buildSyntheticZipBuffer([
			{ name: '<img src=x onerror=alert(1)>/payload.pdf', uncompressedSize: 4096, compressedSize: 2048, crc32: 0xabcd1234, method: 8 },
			{ name: 'nested/sub.zip', uncompressedSize: 1024, compressedSize: 900, crc32: 0x22223333, method: 8 },
		])
		const zipB = buildSyntheticZipBuffer([
			{ name: 'copy/payload.pdf', uncompressedSize: 4096, compressedSize: 2048, crc32: 0xabcd1234, method: 8 },
		])

		const duplicates = [
			{
				id: 301,
				hash: 'xss-zip-hash',
				files: [
					{
						id: 11,
						nodeId: 5011,
						path: '/alice/files/Origin/<img src=x onerror=alert(1)>.zip',
						size: 3072,
						mtime: 1700000000,
						isInOriginFolder: true,
						archiveBuffer: zipA.arrayBuffer,
					},
					{
						id: 12,
						nodeId: 5012,
						path: '/alice/files/Downloads/dup-archive.zip',
						size: 3072,
						mtime: 1700100000,
						isInOriginFolder: false,
					},
				],
			},
			{
				id: 302,
				hash: 'second-zip-hash',
				files: [
					{
						id: 13,
						nodeId: 5013,
						path: '/alice/files/Backups/second.zip',
						size: 2048,
						mtime: 1700200000,
						isInOriginFolder: false,
						archiveBuffer: zipB.arrayBuffer,
					},
					{
						id: 14,
						nodeId: 5014,
						path: '/alice/files/Temp/second.zip',
						size: 2048,
						mtime: 1700300000,
						isInOriginFolder: false,
					},
				],
			},
			{
				id: 303,
				hash: 'loose-payload-hash',
				files: [
					{ id: 15, nodeId: 5015, path: '/alice/files/Docs/payload.pdf', size: 4096, mtime: 1700400000, isInOriginFolder: false },
					{ id: 16, nodeId: 5016, path: '/alice/files/Share/payload.pdf', size: 4096, mtime: 1700500000, isInOriginFolder: false },
				],
			},
		]

		const emitted = []
		const vm = new Vue({
			render(h) {
				return h(Workbench, {
					props: {
						duplicates,
						allDuplicates: duplicates,
						currentDuplicateId: 301,
					},
					on: {
						'archive-delete-completed': payload => emitted.push(['delete', payload]),
					},
				})
			},
		}).$mount()
		await settle()

		assert.equal(vm.$el.querySelectorAll('img').length, 0, 'Malicious filename must not render raw HTML')
		assert.ok(vm.$el.textContent.includes('<img src=x onerror=alert(1)>.zip'))

		// Inspect visible containers
		const inspectVisibleBtn = Array.from(vm.$el.querySelectorAll('button')).find(btn => btn.textContent.includes('Inspect visible'))
		inspectVisibleBtn.click()
		await settle()

		assert.equal(vm.$el.querySelectorAll('img').length, 0, 'Inner zip path XSS payload must remain plain text')
		assert.ok(vm.$el.textContent.includes('Already extracted in storage'))
		assert.ok(vm.$el.textContent.includes('Nested archive'))

		// Side-by-side compare against second archive
		const compareSelect = vm.$el.querySelector('.archive-detail__compare-box select')
		assert.ok(compareSelect, 'Compare dropdown should appear once 2 archives are inspected')
		compareSelect.value = '302'
		compareSelect.dispatchEvent(new document.defaultView.Event('change', { bubbles: true }))
		await settle()
		assert.ok(vm.$el.textContent.includes('50%'), '1 shared out of 2 union entries = 50% Jaccard')

		// Open safe delete dialog & confirm deletion
		const deleteTrigger = vm.$el.querySelector('.archive-detail__actions .archive-workbench__danger-btn')
		deleteTrigger.click()
		await settle()
		const dialog = vm.$el.querySelector('dialog.archive-delete-dialog')
		assert.ok(dialog.hasAttribute('open') || dialog.open)
		const confirmBtn = dialog.querySelector('.archive-workbench__danger-btn')
		confirmBtn.click()
		await settle()

		assert.equal(deletedPayloads.length, 1)
		assert.equal(deletedPayloads[0].length, 1)
		assert.equal(deletedPayloads[0][0].nodeId, 5012, 'Protected origin file 5011 must NEVER be deleted')
		assert.equal(emitted.length, 1)
		assert.equal(emitted[0][0], 'delete')
	})

	test('App.vue + keyboardShortcuts wire 1 shortcut, topbar Archives button, and help dialog', async () => {
		const shortcuts = loadModule('src/tools/keyboardShortcuts.js')
		assert.ok(
			shortcuts.SHORTCUT_DEFINITIONS.some(item => item.id === 'toggle-archive-inspector' && item.keys.includes('1')),
			'SHORTCUT_DEFINITIONS must document 1 for toggle-archive-inspector'
		)
		assert.equal(shortcuts.resolveShortcutAction({ key: '1' }), 'toggle-archive-inspector')
		assert.equal(shortcuts.resolveShortcutAction({ key: '1', target: { tagName: 'INPUT' } }), null)

		const deps = loadArchiveModules()
		const Workbench = loadWorkbenchComponent(deps)
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const icon = slotBox('span')
		const stub = name => ({
			name,
			props: ['duplicate', 'projectId', 'show', 'isScanning'],
			render(h) {
				return h('div', { class: `stub-${name}` })
			},
		})
		const group = {
			id: 401,
			hash: 'app-zip-hash',
			acknowledged: false,
			files: [
				{ id: 1, path: '/alice/files/Archive/pack.zip', size: 4096, mtime: 1700000000, isInOriginFolder: false },
				{ id: 2, path: '/alice/files/Downloads/pack.zip', size: 4096, mtime: 1700100000, isInOriginFolder: false },
			],
		}

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
			'./components/DuplicateNavigation.vue': {
				__esModule: true,
				default: {
					name: 'DuplicateNavigation',
					props: ['acknowledgedDuplicates', 'unacknowledgedDuplicates'],
					render(h) {
						return h('nav')
					},
				},
			},
			'./components/DuplicateDetails.vue': { __esModule: true, default: stub('duplicate-details') },
			'./components/DuplicateTreemap.vue': { __esModule: true, default: stub('treemap') },
			'./components/SpaceReclamationTimeline.vue': { __esModule: true, default: stub('timeline') },
			'./components/SimilarityInspector.vue': { __esModule: true, default: stub('similarity') },
			'./components/BatchAutoSelectWorkbench.vue': { __esModule: true, default: stub('batch') },
			'./components/FileHygieneInspector.vue': { __esModule: true, default: stub('hygiene') },
			'./components/LinkDeduplicationSimulator.vue': { __esModule: true, default: stub('link-sim') },
			'./components/FolderPairMatrix.vue': { __esModule: true, default: stub('folder-matrix') },
			'./components/StorageFootprintAnalyzer.vue': { __esModule: true, default: stub('storage-footprint') },
			'./components/PhotoBurstTimeline.vue': { __esModule: true, default: stub('photo-bursts') },
			'./components/RecoverySafetyWorkbench.vue': { __esModule: true, default: stub('recovery-safety') },
			'./components/ArchivePayloadInspector.vue': { __esModule: true, default: Workbench },
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
					entities: type === 'unacknowledged' ? [group] : [],
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
			'@/tools/keyboardShortcuts': shortcuts,
			'@/tools/reclamationHistory': loadModule('src/tools/reclamationHistory.js', {
				'./duplicateStats': deps.stats,
				'./duplicateFilters': deps.filters,
			}),
			'vue-material-design-icons/Folder': icon,
			'vue-material-design-icons/FolderRemove': icon,
			'vue-material-design-icons/FolderMultiple': icon,
			'vue-material-design-icons/Delete': icon,
			'vue-material-design-icons/FilterOutline': icon,
		})

		const vm = new Vue({ render: h => h(App) }).$mount()
		await settle()

		const topbarBtn = vm.$el.querySelector('.topbar-archive-inspector-button')
		assert.ok(topbarBtn, 'Topbar Archives button exists')
		assert.equal(topbarBtn.getAttribute('aria-keyshortcuts'), '1')
		assert.equal(vm.$el.querySelector('.archive-payload-workbench'), null)

		document.defaultView.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: '1', bubbles: true }))
		await settle()
		assert.ok(vm.$el.querySelector('.archive-payload-workbench'), 'Pressing 1 opens ArchivePayloadInspector')

		document.defaultView.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: '1', bubbles: true }))
		await settle()
		assert.equal(vm.$el.querySelector('.archive-payload-workbench'), null, 'Pressing 1 again hides ArchivePayloadInspector')
	})

	test('Cycle 130 touched files preserve zero U+2013/U+2014 dashes, zero XSS sinks, logical CSS, and >= 44px mobile targets', () => {
		const files = [
			'src/tools/archivePayloadInspector.js',
			'src/components/ArchivePayloadInspector.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
		]
		for (const rel of files) {
			const content = readFileSync(resolve(root, rel), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(content), false, `${rel} must contain zero U+2013/U+2014 dashes`)
			assert.equal(/\bv-html\s*=/.test(content), false, `${rel} must contain zero v-html sinks`)
			assert.equal(/\.innerHTML\s*=/.test(content), false, `${rel} must contain zero innerHTML sinks`)
			assert.equal(/document\.write\s*\(/.test(content), false, `${rel} must contain zero document.write sinks`)
		}
		const vueSource = readFileSync(resolve(root, 'src/components/ArchivePayloadInspector.vue'), 'utf8')
		assert.ok(vueSource.includes('padding-block:'), 'Uses CSS logical padding-block')
		assert.ok(vueSource.includes('padding-inline:'), 'Uses CSS logical padding-inline')
		assert.ok(vueSource.includes(':focus-visible'), 'Includes :focus-visible outline styles')
		assert.ok(/min-block-size:\s*(?:4[4-9]|[5-9]\d)px/.test(vueSource), 'Includes >= 44px mobile touch targets')
		assert.ok(vueSource.includes('minmax(0, 1fr)'), 'Uses minmax(0, 1fr) overflow-safe grid')
	})
})
