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

function loadBurstModules() {
	const stats = loadModule('src/tools/duplicateStats.js')
	const filters = loadModule('src/tools/duplicateFilters.js')
	const pathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const selectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const burst = loadModule('src/tools/photoBurstClustering.js', {
		'./duplicateFilters': filters,
		'./duplicatePathDiff': pathDiff,
		'./duplicateSelectionAndExport': selectionAndExport,
		'./duplicateStats': stats,
	})
	return { stats, filters, pathDiff, selectionAndExport, burst }
}

function loadBurstComponent(deps, apiOverrides = {}) {
	return loadComponent('src/components/PhotoBurstTimeline.vue', {
		'@nextcloud/router': { generateUrl: url => url },
		'../tools/api': {
			deleteFiles: async () => ({ success: [], errors: [] }),
			...apiOverrides,
		},
		'../tools/duplicatePathDiff': deps.pathDiff,
		'../tools/photoBurstClustering': deps.burst,
	})
}

function createSampleDuplicates() {
	return [
		{
			id: 10,
			hash: 'h-burst-1',
			acknowledged: false,
			files: [
				{
					id: 1001,
					nodeId: 5001,
					path: '/alice/files/Photos/Paris/IMG_20250412_140210.jpg',
					mimetype: 'image/jpeg',
					size: 5 * 1024 * 1024,
					width: 4032,
					height: 3024,
					mtime: 1744466530,
					isInOriginFolder: false,
				},
				{
					id: 1002,
					nodeId: 5002,
					path: '/alice/files/Inbox/IMG-20250412-WA0001.jpg',
					mimetype: 'image/jpeg',
					size: 800 * 1024,
					width: 1600,
					height: 1200,
					mtime: 1744467000,
					isInOriginFolder: false,
				},
			],
		},
		{
			id: 11,
			hash: 'h-burst-2',
			acknowledged: false,
			files: [
				{
					id: 1101,
					nodeId: 5101,
					path: '/alice/files/Photos/Paris/IMG_20250412_140345.jpg',
					mimetype: 'image/jpeg',
					size: 6 * 1024 * 1024,
					width: 4032,
					height: 3024,
					mtime: 1744466625,
					isInOriginFolder: true,
				},
				{
					id: 1102,
					nodeId: 5102,
					path: '/alice/files/Backups/IMG_20250412_140345-edited.jpg',
					mimetype: 'image/jpeg',
					size: 4 * 1024 * 1024,
					width: 4032,
					height: 3024,
					mtime: 1744466900,
					isInOriginFolder: false,
				},
			],
		},
		{
			id: 12,
			hash: 'h-video-day2',
			acknowledged: false,
			files: [
				{
					id: 1201,
					nodeId: 5201,
					path: '/alice/files/Videos/VID_20250410_091500.mp4',
					mimetype: 'video/mp4',
					size: 80 * 1024 * 1024,
					mtime: 1744276500,
					isInOriginFolder: false,
				},
				{
					id: 1202,
					nodeId: 5202,
					path: '/alice/files/Downloads/VID_20250410_091500.mp4',
					mimetype: 'video/mp4',
					size: 80 * 1024 * 1024,
					mtime: 1744277000,
					isInOriginFolder: false,
				},
			],
		},
		{
			id: 13,
			hash: 'h-raw-ack',
			acknowledged: true,
			files: [
				{
					id: 1301,
					nodeId: 5301,
					path: '/alice/files/Photos/RAW/DSC0042.NEF',
					mimetype: 'image/x-nikon-nef',
					size: 28 * 1024 * 1024,
					mtime: 1744468000,
					isInOriginFolder: false,
				},
				{
					id: 1302,
					nodeId: 5302,
					path: '/alice/files/Backups/DSC0042.NEF',
					mimetype: 'image/x-nikon-nef',
					size: 28 * 1024 * 1024,
					mtime: 1744468100,
					isInOriginFolder: false,
				},
			],
		},
		{
			id: 14,
			hash: 'h-non-media',
			acknowledged: false,
			files: [
				{
					id: 1401,
					path: '/alice/files/Docs/contract.pdf',
					mimetype: 'application/pdf',
					size: 2 * 1024 * 1024,
					isInOriginFolder: false,
				},
				{
					id: 1402,
					path: '/alice/files/Inbox/contract.pdf',
					mimetype: 'application/pdf',
					size: 2 * 1024 * 1024,
					isInOriginFolder: false,
				},
			],
		},
	]
}

describe('Cycle 128: Smart Photo & Media Timeline Bursts & Chronology Clustering (p shortcut)', () => {
	test('photoBurstClustering parses camera timestamps/sequences, clusters bursts, respects keep rules, and sanitizes CSV/JSON exports', () => {
		const { burst } = loadBurstModules()

		const meta = burst.parseMediaFilenameMeta('IMG_20250412_140210-edited.jpg')
		assert.equal(meta.hasTimePrecision, true)
		assert.equal(meta.isEdited, true)
		assert.equal(burst.formatUtcDateBucket(meta.timestampFromName), '2025-04-12')
		assert.equal(burst.formatTimeOfDay(meta.timestampFromName), '14:02:10')

		const seqMeta = burst.parseMediaFilenameMeta('DSC0042.NEF')
		assert.equal(seqMeta.burstPrefix, 'DSC')
		assert.equal(seqMeta.sequenceNumber, 42)

		const groups = createSampleDuplicates()
		const timeline = burst.buildPhotoBurstTimeline(groups, {
			burstWindowMinutes: 15,
			keepStrategy: 'sharpest',
		})

		// Non-media PDF and acknowledged RAW are excluded by default
		assert.equal(timeline.scopeSummary.skippedNonMediaCount, 1)
		assert.equal(timeline.scopeSummary.skippedAcknowledgedCount, 1)
		assert.equal(timeline.summary.mediaGroupsCount, 3)
		assert.equal(timeline.summary.clusterCount, 2)
		assert.equal(timeline.summary.rapidBurstCount, 1)
		assert.equal(timeline.summary.shootDayCount, 2)

		// Rapid burst on 2025-04-12 combines groups 10 and 11 (95s apart)
		const rapidBurst = timeline.clusters.find(c => c.clusterKind === 'rapid_burst')
		assert.ok(rapidBurst)
		assert.equal(rapidBurst.groupCount, 2)
		assert.equal(rapidBurst.dateBucket, '2025-04-12')
		assert.equal(rapidBurst.groups[0].winnerFile.id, 1001)
		assert.equal(rapidBurst.groups[1].winnerFile.id, 1101)
		assert.equal(rapidBurst.groups[1].winnerReason, 'protected_origin')

		// Narrowing to onlyMultiGroupBursts hides single-group video
		const multiOnly = burst.buildPhotoBurstTimeline(groups, { onlyMultiGroupBursts: true })
		assert.equal(multiOnly.summary.clusterCount, 1)

		// Including acknowledged + RAW filter surfaces the NEF group
		const ackIncluded = burst.buildPhotoBurstTimeline(groups, {
			includeAcknowledged: true,
			mediaFilter: 'variants',
		})
		assert.ok(ackIncluded.clusters.some(c => c.groups.some(g => g.isRaw)))

		// Keep oldest vs newest strategy checks
		const oldestWin = burst.pickBurstGroupWinner(groups[0].files, 'oldest')
		assert.equal(oldestWin.winnerFile.id, 1001)
		const newestWin = burst.pickBurstGroupWinner(groups[0].files, 'newest')
		assert.equal(newestWin.winnerFile.id, 1002)

		// CSV formula injection defense (CWE-1236) + JSON schema
		const injectedGroups = [
			{
				id: 99,
				hash: 'h-xss',
				files: [
					{ id: 991, path: '/alice/files/Photos/=CMD().jpg', mimetype: 'image/jpeg', size: 1024, mtime: 1744466530 },
					{ id: 992, path: '/alice/files/Inbox/@SUM(1+1).jpg', mimetype: 'image/jpeg', size: 1024, mtime: 1744466540 },
				],
			},
		]
		const injectedTimeline = burst.buildPhotoBurstTimeline(injectedGroups)
		const csv = burst.buildBurstManifestCsv(injectedTimeline)
		assert.ok(csv.includes("'=CMD().jpg") || csv.includes("'@SUM(1+1).jpg"))
		const parsedJson = JSON.parse(burst.buildBurstManifestJson(timeline, {}, new Set(), '2026-11-23T12:00:00Z'))
		assert.equal(parsedJson.schema, burst.PHOTO_BURST_MANIFEST_SCHEMA)
		assert.equal(parsedJson.exportedAt, '2026-11-23T12:00:00Z')
		assert.equal(parsedJson.clusters.length, 2)
	})

	test('PhotoBurstTimeline.vue handles empty, non-media, filtered-empty, populated, manual keep, delete confirmation, and XSS-safe paths', async () => {
		const deps = loadBurstModules()
		const deletedPayloads = []
		const Comp = loadBurstComponent(deps, {
			deleteFiles: async files => {
				deletedPayloads.push(files)
				return { success: files, errors: [] }
			},
		})

		// 1. Empty state
		const emptyVm = new Vue({
			render: h => h(Comp, { props: { duplicates: [], allDuplicates: [] } }),
		}).$mount()
		await settle()
		assert.ok(emptyVm.$el.textContent.includes('No duplicate groups loaded yet'))

		// 2. Non-media state
		const pdfOnly = [createSampleDuplicates()[4]]
		const nonMediaVm = new Vue({
			render: h => h(Comp, { props: { duplicates: pdfOnly, allDuplicates: pdfOnly } }),
		}).$mount()
		await settle()
		assert.ok(nonMediaVm.$el.textContent.includes('No photo or video duplicate groups in this scope'))

		// 3. Populated state + XSS filename + interactions
		const groups = createSampleDuplicates()
		groups[0].files[1].path = '/alice/files/Inbox/<img src=x onerror=alert(1)>IMG-20250412-WA0001.jpg'
		const emitted = []
		const vm = new Vue({
			render: h => h(Comp, {
				props: {
					duplicates: groups,
					allDuplicates: groups,
					currentDuplicateId: 10,
				},
				on: {
					'select-duplicate': d => emitted.push({ type: 'select', d }),
					'compare-duplicate': d => emitted.push({ type: 'compare', d }),
					'burst-delete-completed': p => emitted.push({ type: 'deleted', p }),
				},
			}),
		}).$mount()
		await settle()

		// Zero injected XSS nodes
		assert.equal(vm.$el.querySelectorAll('img[onerror]').length, 0)
		assert.ok(vm.$el.textContent.includes('<img src=x onerror=alert(1)>'))
		assert.ok(vm.$el.textContent.includes('2025-04-12'))
		assert.ok(vm.$el.textContent.includes('Rapid burst'))

		// Inspect & Compare emissions
		const inspectButtons = vm.$el.querySelectorAll('.burst-group-tile__action-btn')
		inspectButtons[0].click()
		inspectButtons[1].click()
		await settle()
		assert.equal(emitted[0].type, 'select')
		assert.equal(emitted[0].d.id, 10)
		assert.equal(emitted[1].type, 'compare')
		assert.equal(emitted[1].d.id, 10)

		// Filtered empty state + reset
		const searchInput = vm.$el.querySelector('.photo-burst-timeline__search-input')
		searchInput.value = 'no-such-shoot-999'
		searchInput.dispatchEvent(new document.defaultView.Event('input'))
		await settle()
		assert.ok(vm.$el.textContent.includes('No bursts match your current filters'))
		vm.$el.querySelector('.photo-burst-timeline__secondary-btn').click()
		await settle()
		assert.ok(vm.$el.querySelectorAll('.burst-cluster-card').length === 2)

		// Delete confirmation on first burst cluster
		const deleteBtn = vm.$el.querySelector('.burst-cluster-card__delete-btn')
		deleteBtn.click()
		await settle()
		const confirmBtn = vm.$el.querySelector('.burst-cluster-card__confirm-btn')
		assert.ok(confirmBtn)
		confirmBtn.click()
		await settle()
		assert.equal(deletedPayloads.length, 1)
		assert.equal(deletedPayloads[0].length, 2)
		assert.ok(emitted.some(e => e.type === 'deleted'))
	})

	test('App.vue and keyboardShortcuts wire p shortcut, topbar Photo Bursts button, help dialog, and deletion pruning', async () => {
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'p' }), 'toggle-photo-bursts')
		assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'p', ctrlKey: true }), null)
		assert.equal(
			keyboardShortcuts.resolveShortcutAction({ key: 'p', target: { tagName: 'INPUT' } }),
			null
		)
		assert.ok(
			keyboardShortcuts.SHORTCUT_DEFINITIONS.some(item => item.id === 'toggle-photo-bursts' && item.keys.includes('p'))
		)

		const deps = loadBurstModules()
		const BurstComp = loadBurstComponent(deps)
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const reclamationHistory = loadModule('src/tools/reclamationHistory.js', {
			'./duplicateFilters': deps.filters,
			'./duplicateStats': deps.stats,
		})
		const stub = name => ({ render(h) { return h('div', { attrs: { 'data-stub': name } }) } })
		const icon = slotBox('span')

		const App = loadComponent('src/App.vue', {
			'@nextcloud/vue': {
				NcAppContent: slotBox('main'),
				NcContent: slotBox('div'),
				NcLoadingIcon: slotBox('span'),
				NcButton: slotBox('button'),
				NcModal: slotBox('div'),
				NcAppSettingsDialog: slotBox('div'),
				NcAppSettingsSection: slotBox('section'),
			},
			'./components/DuplicateNavigation.vue': { __esModule: true, default: stub('nav') },
			'./components/DuplicateDetails.vue': { __esModule: true, default: stub('details') },
			'./components/DuplicateTreemap.vue': { __esModule: true, default: stub('treemap') },
			'./components/SpaceReclamationTimeline.vue': { __esModule: true, default: stub('history') },
			'./components/SimilarityInspector.vue': { __esModule: true, default: stub('similarity') },
			'./components/BatchAutoSelectWorkbench.vue': { __esModule: true, default: stub('batch') },
			'./components/FileHygieneInspector.vue': { __esModule: true, default: stub('file-hygiene') },
			'./components/LinkDeduplicationSimulator.vue': { __esModule: true, default: stub('link-simulator') },
			'./components/FolderPairMatrix.vue': { __esModule: true, default: stub('folder-matrix') },
			'./components/StorageFootprintAnalyzer.vue': { __esModule: true, default: stub('storage-footprint') },
			'./components/PhotoBurstTimeline.vue': { __esModule: true, default: BurstComp },
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
					entities: type === 'unacknowledged' ? createSampleDuplicates() : [],
					pagination: { currentPage: 1, totalPages: 1, totalItems: type === 'unacknowledged' ? 5 : 0 },
				}),
				fetchProjects: async () => [],
				fetchScanStatus: async () => ({ running: false, completedSeq: 1 }),
				startUserScan: async () => ({ running: false, completedSeq: 1 }),
				notifyScanStarted: () => {},
				notifyScanCompleted: () => {},
				notifyScanFailed: () => {},
			},
			'@/tools/utils': utils,
			'@/tools/keyboardShortcuts': keyboardShortcuts,
			'@/tools/reclamationHistory': reclamationHistory,
			'vue-material-design-icons/Folder': icon,
			'vue-material-design-icons/FolderRemove': icon,
			'vue-material-design-icons/FolderMultiple': icon,
			'vue-material-design-icons/Delete': icon,
			'vue-material-design-icons/FilterOutline': icon,
		})

		const vm = new Vue({
			render: h => h(App),
		}).$mount()
		await settle()
		await settle()

		const topbarBtn = vm.$el.querySelector('.topbar-photo-bursts-button')
		assert.ok(topbarBtn)
		assert.equal(topbarBtn.getAttribute('aria-keyshortcuts'), 'p')
		assert.equal(topbarBtn.getAttribute('aria-pressed'), 'false')

		// Press 'p' to open PhotoBurstTimeline
		document.defaultView.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: 'p', bubbles: true }))
		await settle()
		assert.equal(topbarBtn.getAttribute('aria-pressed'), 'true')
		assert.ok(vm.$el.querySelector('.photo-burst-timeline'))

		// Help dialog lists toggle-photo-bursts
		assert.ok(vm.$el.textContent.includes('Toggle photo and media timeline bursts'))

		// Press 'p' again to close
		document.defaultView.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: 'p', bubbles: true }))
		await settle()
		assert.equal(topbarBtn.getAttribute('aria-pressed'), 'false')
		assert.equal(vm.$el.querySelector('.photo-burst-timeline'), null)
	})

	test('Cycle 128 touched files preserve zero U+2013/U+2014 dashes, zero XSS sinks, logical CSS, and >= 44px mobile touch targets', () => {
		const files = [
			'src/tools/photoBurstClustering.js',
			'src/components/PhotoBurstTimeline.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
			'tests/frontend/photo-burst-timeline.test.cjs',
		]
		for (const rel of files) {
			const content = readFileSync(resolve(root, rel), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(content), false, `${rel} must contain zero U+2013/U+2014 dashes`)
		}

		const vueSource = readFileSync(resolve(root, 'src/components/PhotoBurstTimeline.vue'), 'utf8')
		assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(vueSource), false, 'PhotoBurstTimeline.vue must have zero XSS sinks')
		const styleSection = vueSource.slice(vueSource.indexOf('<style'))
		assert.equal(/margin-(left|right)|padding-(left|right)|border-(left|right)/.test(styleSection), false, 'PhotoBurstTimeline.vue must use logical CSS properties')
		assert.ok(styleSection.includes(':focus-visible'), 'PhotoBurstTimeline.vue must define :focus-visible styles')
		assert.ok(styleSection.includes('min-block-size: 44px'), 'PhotoBurstTimeline.vue must enforce >= 44px touch targets on mobile')
	})
})
