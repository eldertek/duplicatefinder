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

function loadInspectorDeps() {
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const duplicateFilters = loadModule('src/tools/duplicateFilters.js')
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const mediaContentInspector = loadModule('src/tools/mediaContentInspector.js', {
		'./visualMediaInspector': loadModule('src/tools/visualMediaInspector.js', {
			'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		}),
	})
	const sidecarSweepInspector = loadModule('src/tools/sidecarSweepInspector.js', {
		'./duplicateStats': duplicateStats,
		'./duplicateFilters': duplicateFilters,
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./mediaContentInspector': mediaContentInspector,
	})
	return {
		duplicateStats,
		duplicateFilters,
		duplicatePathDiff,
		duplicateSelectionAndExport,
		mediaContentInspector,
		sidecarSweepInspector,
	}
}

function createWorkbenchComponent({ apiOverrides = {} } = {}) {
	const deps = loadInspectorDeps()
	const utils = loadModule('src/tools/utils.js', {
		'./notifications': { showErrorNotification: () => {} },
	})
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js')

	const Workbench = loadComponent('src/components/SidecarSweepWorkbench.vue', {
		'../tools/api': {
			deleteFiles: async files => ({ success: files, errors: [] }),
			scanEmptyFolders: async () => ({ folders: [], count: 0 }),
			deleteEmptyFolders: async paths => ({ deleted: paths, errors: [] }),
			...apiOverrides,
		},
		'../tools/clipboardHelper': clipboardHelper,
		'../tools/duplicateStats': deps.duplicateStats,
		'../tools/mediaContentInspector': deps.mediaContentInspector,
		'../tools/sidecarSweepInspector': deps.sidecarSweepInspector,
		'../tools/utils': utils,
	})

	return { Workbench, ...deps }
}

describe('Cycle 133: Orphaned Sidecar & Post-Cleanup Empty-Folder Sweep Inspector (4 shortcut)', () => {
	test('parseSidecarCandidate handles standard, double-extension, language-tagged subtitles, Apple AAE, and checksum manifests', () => {
		const { sidecarSweepInspector } = loadInspectorDeps()

		const stdXmp = sidecarSweepInspector.parseSidecarCandidate('/alice/files/Photos/IMG_1001.xmp')
		assert.equal(stdXmp.sidecarExt, 'xmp')
		assert.equal(stdXmp.family, 'photo-raw')
		assert.equal(stdXmp.baseStem, 'img_1001')
		assert.equal(stdXmp.hintedMasterName, '')

		const doubleXmp = sidecarSweepInspector.parseSidecarCandidate('/alice/files/RAW/DSC_0420.NEF.xmp')
		assert.equal(doubleXmp.sidecarExt, 'xmp')
		assert.equal(doubleXmp.baseStem, 'dsc_0420')
		assert.equal(doubleXmp.hintedMasterExt, 'nef')
		assert.equal(doubleXmp.hintedMasterName, 'dsc_0420.nef')

		const sub = sidecarSweepInspector.parseSidecarCandidate('/alice/files/Movies/Matrix.en.forced.srt')
		assert.equal(sub.sidecarExt, 'srt')
		assert.equal(sub.family, 'video-subtitle')
		assert.equal(sub.baseStem, 'matrix')
		assert.deepEqual(sub.languageTags, ['en', 'forced'])

		const aae = sidecarSweepInspector.parseSidecarCandidate('/alice/files/iPhone/IMG_E5512.AAE')
		assert.equal(aae.sidecarExt, 'aae')
		assert.ok(aae.alternateStems.includes('img_5512'))

		const sum = sidecarSweepInspector.parseSidecarCandidate('/alice/files/Backups/SHA256SUMS.sha256')
		assert.equal(sum.family, 'checksum-manifest')
		assert.equal(sum.isFolderWideChecksum, true)

		assert.equal(sidecarSweepInspector.parseSidecarCandidate('/alice/files/Photos/IMG_1001.jpg'), null)
	})

	test('parseWebdavDirectoryEntries safely parses PROPFIND XML, decodes URLs & entities, and skips self-directory', () => {
		const { sidecarSweepInspector } = loadInspectorDeps()
		const xml = `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">
  <d:response>
    <d:href>/remote.php/dav/files/alice/Photos/Trip%202026/</d:href>
    <d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat>
  </d:response>
  <d:response>
    <d:href>/remote.php/dav/files/alice/Photos/Trip%202026/IMG_001.CR2</d:href>
    <d:propstat><d:prop>
      <d:getcontentlength>24500123</d:getcontentlength>
      <d:getcontenttype>image/x-canon-cr2</d:getcontenttype>
      <d:getlastmodified>Mon, 10 Aug 2026 12:30:00 GMT</d:getlastmodified>
      <oc:fileid>88101</oc:fileid>
    </d:prop></d:propstat>
  </d:response>
  <d:response>
    <d:href>/remote.php/dav/files/alice/Photos/Trip%202026/Rock%20%26%20Roll.xmp</d:href>
    <d:propstat><d:prop>
      <d:getcontentlength>4096</d:getcontentlength>
      <d:getcontenttype>application/rdf+xml</d:getcontenttype>
      <oc:fileid>88102</oc:fileid>
    </d:prop></d:propstat>
  </d:response>
</d:multistatus>`

		const entries = sidecarSweepInspector.parseWebdavDirectoryEntries(xml, '/Photos/Trip 2026')
		assert.equal(entries.length, 2)
		assert.equal(entries[0].name, 'IMG_001.CR2')
		assert.equal(entries[0].size, 24500123)
		assert.equal(entries[0].nodeId, 88101)
		assert.equal(entries[1].name, 'Rock & Roll.xmp')
		assert.equal(entries[1].path, '/Photos/Trip 2026/Rock & Roll.xmp')
	})

	test('analyzeSidecarSweepCatalog classifies confirmed/inferred orphans, cascade risks, redundant copies, healthy paired, and exports safely', () => {
		const { sidecarSweepInspector } = loadInspectorDeps()

		const groups = [
			{
				id: 1,
				hash: 'h-xmp',
				files: [
					{
						id: 101,
						nodeId: 1001,
						path: '/alice/files/Photos/Keep/IMG_001.xmp',
						size: 4000,
						mtime: 1700000100,
						isInOriginFolder: true,
					},
					{
						id: 102,
						nodeId: 1002,
						path: '/alice/files/Photos/OrphanCopy/IMG_001.xmp',
						size: 4000,
						mtime: 1700000200,
						isInOriginFolder: false,
					},
				],
			},
			{
				id: 2,
				hash: 'h-vid',
				files: [
					{
						id: 201,
						nodeId: 2001,
						path: '/alice/files/Movies/Keep/Clip.mp4',
						size: 5000000,
						mtime: 1700000100,
						isInOriginFolder: true,
					},
					{
						id: 202,
						nodeId: 2002,
						path: '/alice/files/Movies/Doomed/Clip.mp4',
						size: 5000000,
						mtime: 1700000300,
						isInOriginFolder: false,
					},
				],
			},
			{
				id: 3,
				hash: 'h-srt',
				files: [
					{
						id: 301,
						nodeId: 3001,
						path: '/alice/files/Movies/Doomed/Clip.en.srt',
						size: 12000,
						mtime: 1700000300,
						isInOriginFolder: false,
					},
					{
						id: 302,
						nodeId: 3002,
						path: '/alice/files/Archive/Lost.srt',
						size: 8000,
						mtime: 1700000100,
						isInOriginFolder: false,
					},
				],
			},
			{
				id: 4,
				hash: 'h-cwe',
				files: [
					{
						id: 401,
						nodeId: 4001,
						path: '/alice/files/Bad/=cmd|\' /C calc\'!A0.xmp',
						size: 512,
						mtime: 1700000000,
						isInOriginFolder: false,
					},
				],
			},
		]

		const probedFoldersByPath = {
			'/Photos/Keep': {
				status: 'probed',
				entries: [
					{ path: '/Photos/Keep/IMG_001.CR2', name: 'IMG_001.CR2', isDirectory: false, size: 22000000 },
					{ path: '/Photos/Keep/IMG_001.xmp', name: 'IMG_001.xmp', isDirectory: false, size: 4000 },
				],
			},
			'/Photos/OrphanCopy': {
				status: 'probed',
				entries: [
					{ path: '/Photos/OrphanCopy/IMG_001.xmp', name: 'IMG_001.xmp', isDirectory: false, size: 4000 },
					{ path: '/Photos/OrphanCopy/Leftover.aae', name: 'Leftover.aae', isDirectory: false, size: 1500 },
				],
			},
		}

		const catalog = sidecarSweepInspector.analyzeSidecarSweepCatalog(groups, {
			keepStrategy: 'paired_survivor',
			probedFoldersByPath,
			emptyFolders: [
				{ path: '/Temp', name: 'Temp', depth: 1, hasEmptySubfolders: true },
				{ path: '/Temp/Nested', name: 'Nested', depth: 2, hasEmptySubfolders: false },
				{ path: '/KeepEmpty', name: 'KeepEmpty', depth: 1, hasEmptySubfolders: false },
			],
			ignoredEmptyFolders: ['/KeepEmpty'],
		})

		const byPath = Object.fromEntries(catalog.items.map(item => [item.displayPath, item]))

		assert.equal(byPath['/Photos/Keep/IMG_001.xmp'].status, 'healthy-paired')
		assert.equal(byPath['/Photos/Keep/IMG_001.xmp'].isProtected, true)
		assert.equal(byPath['/Photos/OrphanCopy/IMG_001.xmp'].status, 'redundant-duplicate')
		assert.equal(byPath['/Photos/OrphanCopy/Leftover.aae'].status, 'orphaned-confirmed')
		assert.equal(byPath['/Movies/Doomed/Clip.en.srt'].status, 'cascade-orphan-risk')
		assert.equal(byPath['/Archive/Lost.srt'].status, 'orphaned-inferred')

		// Deepest-first empty folder ordering & ignore filtering
		assert.equal(catalog.emptyFoldersReport.active.length, 2)
		assert.equal(catalog.emptyFoldersReport.active[0].displayPath, '/Temp/Nested')
		assert.equal(catalog.emptyFoldersReport.active[1].displayPath, '/Temp')
		assert.equal(catalog.emptyFoldersReport.ignoredCount, 1)

		// Safe sweep key selection never selects protected or healthy-paired
		const safeDefault = sidecarSweepInspector.selectSafeSweepItemKeys(catalog, {
			includeCascade: true,
			includeInferred: false,
		})
		assert.ok(safeDefault.includes(byPath['/Photos/OrphanCopy/IMG_001.xmp'].itemKey))
		assert.ok(safeDefault.includes(byPath['/Photos/OrphanCopy/Leftover.aae'].itemKey))
		assert.ok(safeDefault.includes(byPath['/Movies/Doomed/Clip.en.srt'].itemKey))
		assert.ok(!safeDefault.includes(byPath['/Photos/Keep/IMG_001.xmp'].itemKey))
		assert.ok(!safeDefault.includes(byPath['/Archive/Lost.srt'].itemKey))

		// Exports: JSON schema, CWE-1236 CSV, and POSIX rollback script
		const json = JSON.parse(sidecarSweepInspector.exportSidecarSweepJson(catalog, { exportedAt: '2026-11-23T12:00:00Z' }))
		assert.equal(json.schema, sidecarSweepInspector.SIDECAR_SWEEP_SCHEMA)
		assert.ok(json.sidecars.length >= 5)
		assert.equal(json.emptyFolders.length, 3)

		const csv = sidecarSweepInspector.exportSidecarSweepCsv(catalog)
		assert.ok(csv.includes('record_type,status,family'))
		assert.ok(!csv.includes(',=cmd|'), 'CWE-1236 formula must be neutralized')

		const sh = sidecarSweepInspector.generateSidecarRollbackScript(catalog, { exportedAt: '2026-11-23T12:00:00Z' })
		assert.ok(sh.startsWith('#!/usr/bin/env bash'))
		assert.ok(sh.includes('MODE="dry-run"'))
		assert.ok(sh.includes('restore_sidecar_entry'))
		assert.ok(sh.includes('recreate_empty_folder'))
	})

	test('SidecarSweepWorkbench.vue renders empty, populated, WebDAV probe, safe delete, empty-folder sweep, and XSS defense', async () => {
		const deletedFilesCalls = []
		const scanEmptyCalls = []
		const deletedEmptyCalls = []
		const originalFetch = global.fetch

		global.window.OC = {
			getCurrentUser: () => ({ uid: 'alice' }),
			linkToRemoteBase: tail => `https://cloud.example/remote.php/${tail}`,
			requestToken: 'tok-133',
		}
		global.fetch = async (url, opts = {}) => {
			if (opts.method === 'PROPFIND') {
				return {
					ok: true,
					status: 207,
					text: async () => `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">
  <d:response><d:href>/remote.php/dav/files/alice/Shoot/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>
  <d:response><d:href>/remote.php/dav/files/alice/Shoot/Orphan.xmp</d:href><d:propstat><d:prop><d:getcontentlength>2048</d:getcontentlength></d:prop></d:propstat></d:response>
</d:multistatus>`,
				}
			}
			return { ok: true, status: 204 }
		}

		try {
			const { Workbench } = createWorkbenchComponent({
				apiOverrides: {
					deleteFiles: async files => {
						deletedFilesCalls.push(files)
						return { success: files, errors: [], deletedNodeIds: files.map(f => f.nodeId) }
					},
					scanEmptyFolders: async paths => {
						scanEmptyCalls.push(paths)
						return {
							folders: [
								{ path: '/Shoot/EmptySub', name: 'EmptySub', depth: 2, hasEmptySubfolders: false, mtime: 1700000000 },
							],
							count: 1,
						}
					},
					deleteEmptyFolders: async paths => {
						deletedEmptyCalls.push(paths)
						return { deleted: paths, errors: [] }
					},
				},
			})

			// 1. Empty duplicate pool still supports empty-folder scan CTA
			const emptyVm = new Vue({
				render(h) {
					return h(Workbench, {
						props: {
							duplicates: [],
							allDuplicates: [],
						},
					})
				},
			}).$mount()
			await settle()
			assert.ok(emptyVm.$el.textContent.includes('No duplicate groups loaded yet'))
			assert.ok(emptyVm.$el.querySelector('.sidecar-workbench__empty-actions button'))
			emptyVm.$destroy()

			// 2. Populated state with XSS payload in filename
			const groups = [
				{
					id: 51,
					hash: 'h-51',
					files: [
						{
							id: 501,
							nodeId: 5001,
							path: '/alice/files/Shoot/<img src=x onerror=alert(1)>.xmp',
							size: 2048,
							mtime: 1700000000,
							isInOriginFolder: false,
						},
					],
				},
			]

			const vm = new Vue({
				render(h) {
					return h(Workbench, {
						props: {
							duplicates: groups,
							allDuplicates: groups,
							recentCleanedPaths: ['/Shoot/EmptySub'],
							ignoredEmptyFolders: [],
						},
					})
				},
			}).$mount()
			await settle()

			assert.equal(vm.$el.querySelector('img'), null, 'XSS payload must never render as HTML element')
			assert.ok(vm.$el.textContent.includes('<img src=x onerror=alert(1)>.xmp'))

			// Probe via WebDAV
			const probeBtn = Array.from(vm.$el.querySelectorAll('button')).find(b => b.textContent.includes('Probe folders (WebDAV)'))
			assert.ok(probeBtn)
			probeBtn.click()
			await settle()
			assert.ok(vm.$el.textContent.includes('Confirmed orphan'))
			assert.ok(vm.$el.textContent.includes('Orphan.xmp'))

			// Select safe sweep targets and delete
			const selectSafeBtn = Array.from(vm.$el.querySelectorAll('button')).find(b => b.textContent.includes('Select safe sweep'))
			selectSafeBtn.click()
			await settle()

			const sweepBtn = Array.from(vm.$el.querySelectorAll('button')).find(b => b.textContent.includes('Sweep 2 sidecars'))
			assert.ok(sweepBtn && !sweepBtn.disabled)
			sweepBtn.click()
			await settle()

			const confirmBtn = Array.from(vm.$el.querySelectorAll('dialog button')).find(b => b.textContent.includes('Confirm sweep'))
			assert.ok(confirmBtn)
			confirmBtn.click()
			await settle()
			assert.equal(deletedFilesCalls.length, 1)

			// Scan and sweep empty folders
			const scanEmptyBtn = Array.from(vm.$el.querySelectorAll('button')).find(b => b.textContent.includes('Scan empty folders'))
			scanEmptyBtn.click()
			await settle()
			assert.equal(scanEmptyCalls.length, 1)
			assert.ok(vm.$el.textContent.includes('/Shoot/EmptySub'))

			const sweepEmptyBtn = Array.from(vm.$el.querySelectorAll('button')).find(b => b.textContent.includes('Sweep 1 empty folders'))
			sweepEmptyBtn.click()
			await settle()

			const confirmEmptyBtn = Array.from(vm.$el.querySelectorAll('dialog button')).find(b => b.textContent.includes('Delete empty folders'))
			assert.ok(confirmEmptyBtn)
			confirmEmptyBtn.click()
			await settle()
			assert.deepEqual(deletedEmptyCalls, [['/Shoot/EmptySub']])

			vm.$destroy()
		} finally {
			global.fetch = originalFetch
		}
	})

	test('App.vue + keyboardShortcuts wire 4 shortcut, topbar Sidecar Sweep button, and help dialog', async () => {
		const {
			SHORTCUT_DEFINITIONS,
			resolveShortcutAction,
		} = loadModule('src/tools/keyboardShortcuts.js')

		const def = SHORTCUT_DEFINITIONS.find(d => d.id === 'toggle-sidecar-sweep')
		assert.ok(def)
		assert.deepEqual(def.keys, ['4'])
		assert.equal(resolveShortcutAction({ key: '4' }), 'toggle-sidecar-sweep')
		assert.equal(resolveShortcutAction({ key: '4', target: { tagName: 'INPUT' } }), null)

		const { Workbench, ...deps } = createWorkbenchComponent()
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		const reclamationHistory = loadModule('src/tools/reclamationHistory.js', {
			'./duplicateFilters': deps.duplicateFilters,
			'./duplicateStats': deps.duplicateStats,
		})

		const duplicatesPayload = [
			{
				id: 901,
				hash: 'hash-901',
				acknowledged: false,
				files: [
					{ id: 1, nodeId: 11, path: '/alice/files/Photos/DSC_001.xmp', size: 3000, mtime: 1700000000, mimetype: 'application/rdf+xml', isInOriginFolder: false },
					{ id: 2, nodeId: 12, path: '/alice/files/Backup/DSC_001.xmp', size: 3000, mtime: 1700000100, mimetype: 'application/rdf+xml', isInOriginFolder: false },
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
			'./components/SidecarSweepWorkbench.vue': { __esModule: true, default: Workbench },
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

		const topbarBtn = vm.$el.querySelector('.topbar-sidecar-sweep-button')
		assert.ok(topbarBtn, 'Topbar Sidecar Sweep button exists')
		assert.equal(topbarBtn.getAttribute('aria-keyshortcuts'), '4')

		document.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: '4', bubbles: true }))
		await settle()
		assert.ok(vm.$el.querySelector('.sidecar-sweep-workbench'), 'Pressing 4 opens SidecarSweepWorkbench')

		document.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: '4', bubbles: true }))
		await settle()
		assert.equal(vm.$el.querySelector('.sidecar-sweep-workbench'), null, 'Pressing 4 again hides SidecarSweepWorkbench')

		// Help dialog lists 4 shortcut
		document.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: '?', shiftKey: true, bubbles: true }))
		await settle()
		const helpDialog = vm.$el.querySelector('dialog.shortcuts-dialog')
		assert.ok(helpDialog.textContent.includes('Toggle orphaned sidecar and post-cleanup empty-folder sweep inspector'))

		vm.$destroy()
	})

	test('Cycle 133 touched files preserve zero U+2013/U+2014 dashes, zero XSS sinks, logical CSS, and >= 44px mobile touch targets', () => {
		const files = [
			'src/tools/sidecarSweepInspector.js',
			'src/components/SidecarSweepWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
			'tests/frontend/sidecar-sweep-inspector.test.cjs',
		]
		for (const relPath of files) {
			const content = readFileSync(resolve(root, relPath), 'utf8')
			assert.equal(content.includes('\u2013'), false, `${relPath} must not contain U+2013`)
			assert.equal(content.includes('\u2014'), false, `${relPath} must not contain U+2014`)
			assert.equal(/\bv-html\b|\.innerHTML\s*=|\.outerHTML\s*=|document\.write\s*\(/.test(content), false, `${relPath} must have zero XSS sinks`)
		}
		const vueSource = readFileSync(resolve(root, 'src/components/SidecarSweepWorkbench.vue'), 'utf8')
		assert.ok(vueSource.includes('minmax(0, 1fr)'))
		assert.ok(vueSource.includes('min-block-size: 44px'))
		assert.ok(vueSource.includes(':focus-visible'))
		assert.ok(vueSource.includes('padding-inline'))
	})
})
