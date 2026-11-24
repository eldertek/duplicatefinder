const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window } = require('./helpers.cjs')

function loadDevTreeModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/devTreeReclaimer.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function loadDevTreeWorkbench(clipboardImpl) {
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js')
	const devTreeReclaimer = loadDevTreeModule()
	return loadComponent('src/components/DevTreeReclaimerWorkbench.vue', {
		'../tools/clipboardHelper': clipboardImpl === undefined
			? clipboardHelper
			: { copyTextSafely: text => clipboardHelper.copyTextSafely(text, clipboardImpl) },
		'../tools/duplicateStats': duplicateStats,
		'../tools/devTreeReclaimer': devTreeReclaimer,
	})
}

function buildSampleDevDuplicates() {
	const nowSec = Math.floor(Date.now() / 1000)
	const sixtyDaysAgo = nowSec - (60 * 86400)
	const twoDaysAgo = nowSec - (2 * 86400)

	return [
		{
			id: 801,
			hash: 'sha-lodash-1',
			acknowledged: false,
			files: [
				{
					id: 8011,
					path: '/alice/files/Projects/acme-web/node_modules/@babel/core/lib/index.js',
					size: 1048576,
					mtime: twoDaysAgo,
					isInOriginFolder: false,
				},
				{
					id: 8012,
					path: '/alice/files/Projects/legacy-portal/node_modules/@babel/core/lib/index.js',
					size: 1048576,
					mtime: sixtyDaysAgo,
					isInOriginFolder: false,
				},
				{
					id: 8013,
					path: '/bob/files/Archive/client-site/node_modules/@babel/core/lib/index.js',
					size: 1048576,
					mtime: sixtyDaysAgo,
					isInOriginFolder: true,
				},
			],
		},
		{
			id: 802,
			hash: 'sha-symfony-2',
			acknowledged: false,
			files: [
				{
					id: 8021,
					path: '/alice/files/Projects/api-v2/vendor/symfony/http-foundation/Request.php',
					size: 524288,
					mtime: twoDaysAgo,
					isInOriginFolder: false,
				},
				{
					id: 8022,
					path: '/alice/files/Projects/api-v1/vendor/symfony/http-foundation/Request.php',
					size: 524288,
					mtime: sixtyDaysAgo,
					isInOriginFolder: false,
				},
			],
		},
		{
			id: 803,
			hash: 'sha-venv-3',
			acknowledged: false,
			files: [
				{
					id: 8031,
					path: '/alice/files/Projects/ml-lab/.venv/lib/python3.11/site-packages/numpy/core.so',
					size: 2097152,
					mtime: sixtyDaysAgo,
					isInOriginFolder: false,
				},
				{
					id: 8032,
					path: '/alice/files/Projects/ml-prod/.venv/lib/python3.11/site-packages/numpy/core.so',
					size: 2097152,
					mtime: twoDaysAgo,
					isInOriginFolder: false,
				},
			],
		},
		{
			id: 804,
			hash: 'sha-git-pack-4',
			acknowledged: false,
			files: [
				{
					id: 8041,
					path: '/alice/files/Projects/acme-web/.git/objects/pack/pack-1234.pack',
					size: 4194304,
					mtime: sixtyDaysAgo,
					isInOriginFolder: false,
				},
				{
					id: 8042,
					path: '/alice/files/Projects/acme-mirror/.git/objects/pack/pack-1234.pack',
					size: 4194304,
					mtime: sixtyDaysAgo,
					isInOriginFolder: false,
				},
			],
		},
		{
			id: 805,
			hash: 'sha-source-overlap-5',
			acknowledged: false,
			files: [
				{
					id: 8051,
					path: '/alice/files/Projects/legacy-portal/node_modules/lodash/package.json',
					size: 4096,
					mtime: sixtyDaysAgo,
					isInOriginFolder: false,
				},
				{
					id: 8052,
					path: '/alice/files/Projects/shared-docs/src/package.json',
					size: 4096,
					mtime: twoDaysAgo,
					isInOriginFolder: false,
				},
			],
		},
		{
			id: 806,
			hash: 'sha-rust-target-6',
			acknowledged: false,
			files: [
				{
					id: 8061,
					path: '/alice/files/Projects/rust-worker/target/release/deps/libfoo.rlib',
					size: 3145728,
					mtime: sixtyDaysAgo,
					isInOriginFolder: false,
				},
				{
					id: 8062,
					path: '/alice/files/Projects/rust-worker-old/target/release/deps/libfoo.rlib',
					size: 3145728,
					mtime: sixtyDaysAgo,
					isInOriginFolder: false,
				},
			],
		},
	]
}

describe('Cycle 155: Dev Workspace & Dependency Bloat Whole-Tree Reclaimer', () => {
	test('detectDevTreePathInfo classifies ecosystems, scoped packages, and source/manifest shields', () => {
		const { detectDevTreePathInfo } = loadDevTreeModule()

		const nodeScoped = detectDevTreePathInfo('/alice/files/Projects/web/node_modules/@babel/core/lib/index.js')
		assert.equal(nodeScoped.isDevTreeFile, true)
		assert.equal(nodeScoped.ecosystemId, 'node')
		assert.equal(nodeScoped.markerSegment, 'node_modules')
		assert.equal(nodeScoped.treeRootPath, '/alice/files/Projects/web/node_modules')
		assert.equal(nodeScoped.workspaceRoot, '/alice/files/Projects/web')
		assert.equal(nodeScoped.packageName, '@babel/core')

		const phpVendor = detectDevTreePathInfo('/alice/files/api/vendor/symfony/console/Application.php')
		assert.equal(phpVendor.ecosystemId, 'php')
		assert.equal(phpVendor.packageName, 'symfony/console')

		const pyVenv = detectDevTreePathInfo('/alice/files/ml/.venv/lib/python3.11/site-packages/pandas/io.py')
		assert.equal(pyVenv.ecosystemId, 'python')
		assert.equal(pyVenv.packageName, 'pandas')

		const gitPack = detectDevTreePathInfo('/alice/files/repo/.git/objects/pack/pack-abc.pack')
		assert.equal(gitPack.ecosystemId, 'git')
		assert.equal(gitPack.isImmutableGitObject, true)
		assert.equal(gitPack.treeRootPath, '/alice/files/repo/.git/objects')

		const srcFile = detectDevTreePathInfo('/alice/files/Projects/web/src/index.ts')
		assert.equal(srcFile.isDevTreeFile, false)
		assert.equal(srcFile.isSourceOrManifest, true)

		const manifestFile = detectDevTreePathInfo('/alice/files/Projects/web/package.json')
		assert.equal(manifestFile.isDevTreeFile, false)
		assert.equal(manifestFile.isSourceOrManifest, true)
	})

	test('analyzeDevTreeDuplicates rolls up trees, guards primary/origin/.git/objects, and handles overrides', () => {
		const { analyzeDevTreeDuplicates } = loadDevTreeModule()
		const analysis = analyzeDevTreeDuplicates(buildSampleDevDuplicates(), {
			presetId: 'safe-whole-tree',
		})

		assert.ok(analysis.summary.totalTreesCount >= 8)
		assert.ok(analysis.summary.purgeableTreesCount >= 2)
		assert.ok(analysis.summary.gitGcTreesCount === 2)
		assert.ok(analysis.summary.protectedTreesCount >= 1)
		assert.ok(analysis.summary.cherryPickBlockedFilesCount >= 12)

		// Newest active node_modules tree (acme-web, 2d old) is retained below staleness floor
		const acmeNode = analysis.allTrees.find(t => t.treeRootPath === '/alice/files/Projects/acme-web/node_modules')
		assert.equal(acmeNode.recommendedAction, 'keep-primary')
		assert.equal(acmeNode.isStale, false)

		// Stale secondary node_modules tree (legacy-portal) is marked for whole-tree purge and flags source overlap
		const legacyNode = analysis.allTrees.find(t => t.treeRootPath === '/alice/files/Projects/legacy-portal/node_modules')
		assert.equal(legacyNode.recommendedAction, 'purge-tree')
		assert.equal(legacyNode.hasSourceOverlapInGroups, true)

		// Origin-protected tree (client-site) is shielded and anchors primary marker
		const originNode = analysis.allTrees.find(t => t.treeRootPath === '/bob/files/Archive/client-site/node_modules')
		assert.equal(originNode.recommendedAction, 'protected-shield')
		assert.equal(originNode.hasOriginProtectedCopy, true)
		assert.equal(originNode.isPrimaryWorkspace, true)

		// .git/objects is NEVER purge-tree
		const gitTree = analysis.allTrees.find(t => t.treeRootPath === '/alice/files/Projects/acme-web/.git/objects')
		assert.equal(gitTree.recommendedAction, 'git-gc-only')

		// Rust target tree is kept until includeBuildOutputs is enabled
		const rustTarget = analysis.allTrees.find(t => t.treeRootPath === '/alice/files/Projects/rust-worker-old/target')
		assert.equal(rustTarget.recommendedAction, 'keep-primary')

		const aggressive = analyzeDevTreeDuplicates(buildSampleDevDuplicates(), {
			presetId: 'aggressive-ci-clean',
		})
		const rustTargetAggressive = aggressive.allTrees.find(t => t.treeRootPath === '/alice/files/Projects/rust-worker-old/target')
		assert.equal(rustTargetAggressive.recommendedAction, 'purge-tree')

		// Operator override can shield a purgeable tree
		const overridden = analyzeDevTreeDuplicates(buildSampleDevDuplicates(), {
			presetId: 'safe-whole-tree',
			approvedTreeOverrides: {
				'/alice/files/Projects/legacy-portal/node_modules': 'shielded',
			},
		})
		const shieldedLegacy = overridden.allTrees.find(t => t.treeRootPath === '/alice/files/Projects/legacy-portal/node_modules')
		assert.equal(shieldedLegacy.recommendedAction, 'protected-shield')
	})

	test('script, sync-exclude, CWE-1236 CSV, and JSON generators are safe and shell-escaped', () => {
		const {
			analyzeDevTreeDuplicates,
			buildDevTreeReclaimScript,
			buildNextcloudSyncExcludeRules,
			buildDevTreeCsvReport,
			buildDevTreeJsonReport,
			escapePosixSingleQuote,
			DEV_TREE_SCHEMA,
		} = loadDevTreeModule()

		assert.equal(escapePosixSingleQuote("foo'bar"), "'foo'\"'\"'bar'")

		const samples = buildSampleDevDuplicates()
		samples.push({
			id: 807,
			hash: 'sha-formula-7',
			acknowledged: false,
			files: [
				{
					id: 8071,
					path: "/alice/files/=cmd('calc')/node_modules/pkg/index.js",
					size: 1024,
					mtime: 1000,
					isInOriginFolder: false,
				},
				{
					id: 8072,
					path: '/alice/files/Projects/acme-web/node_modules/pkg/index.js',
					size: 1024,
					mtime: Math.floor(Date.now() / 1000),
					isInOriginFolder: false,
				},
			],
		})

		const analysis = analyzeDevTreeDuplicates(samples)
		const script = buildDevTreeReclaimScript(analysis)
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes('rm -rf -- "$target"'))
		assert.ok(script.includes('files:scan --path='))
		assert.ok(!script.includes("reclaim_tree '/alice/files/Projects/acme-web/.git/objects'"))
		assert.ok(script.includes('git -C'))

		const syncExclude = buildNextcloudSyncExcludeRules(analysis)
		assert.ok(syncExclude.includes('node_modules/'))
		assert.ok(syncExclude.includes('vendor/'))
		assert.ok(syncExclude.includes('.venv/'))

		const csv = buildDevTreeCsvReport(analysis)
		assert.ok(csv.includes('/alice/files/=cmd'))
		// Direct formula prefix at start of path triggers CWE-1236 neutralization
		const formulaAnalysis = analyzeDevTreeDuplicates([
			{
				id: 808,
				hash: 'sha-808',
				files: [
					{ id: 1, path: '=HYPERLINK("x")/node_modules/a/b.js', size: 512, mtime: 1000 },
					{ id: 2, path: '/alice/files/ok/node_modules/a/b.js', size: 512, mtime: Math.floor(Date.now() / 1000) },
				],
			},
		])
		const formulaCsv = buildDevTreeCsvReport(formulaAnalysis)
		assert.ok(formulaCsv.includes("'=HYPERLINK"))

		const parsedJson = JSON.parse(buildDevTreeJsonReport(analysis))
		assert.equal(parsedJson.schema, DEV_TREE_SCHEMA)
		assert.ok(Array.isArray(parsedJson.trees))
		assert.ok(parsedJson.trees.length > 0)
	})

	test('DevTreeReclaimerWorkbench.vue renders empty/populated states, unclamped numeric inputs, and overrides', async () => {
		const Workbench = loadDevTreeWorkbench({ writeText: async () => {} })

		const emptyVm = new Vue({
			render: h => h(Workbench, {
				props: { duplicates: [], allDuplicates: [] },
			}),
		}).$mount()
		await settle()
		assert.ok(emptyVm.$el.textContent.includes('Scan storage'))
		emptyVm.$destroy()

		const events = []
		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: buildSampleDevDuplicates(),
					allDuplicates: buildSampleDevDuplicates(),
					currentDuplicateId: 801,
				},
				on: {
					'select-duplicate': item => events.push(['select', item.id]),
					'compare-duplicate': item => events.push(['compare', item.id]),
					close: () => events.push(['close']),
				},
			}),
		}).$mount()
		await settle()

		const cmp = vm.$children[0]
		assert.ok(vm.$el.textContent.includes('NO SINGLE-FILE CHERRY-PICK GUARD'))
		assert.ok(vm.$el.textContent.includes('Purgeable Dev Trees'))

		// Numeric input must not clamp mid-keystroke
		cmp.minStaleDaysInput = ''
		await settle()
		assert.equal(cmp.minStaleDaysInput, '')
		cmp.minStaleDaysInput = '45'
		await settle()
		assert.equal(cmp.parsedMinStaleDays, 45)

		// Preset switching
		cmp.applyPreset('aggressive-ci-clean')
		await settle()
		assert.equal(cmp.presetId, 'aggressive-ci-clean')
		assert.equal(cmp.includeBuildOutputs, true)

		// Operator override
		const targetPath = '/alice/files/Projects/legacy-portal/node_modules'
		cmp.setTreeOverride(targetPath, 'shielded')
		await settle()
		const overriddenTree = cmp.analysis.allTrees.find(t => t.treeRootPath === targetPath)
		assert.equal(overriddenTree.recommendedAction, 'protected-shield')

		// Emit inspect group
		const inspectBtn = Array.from(vm.$el.querySelectorAll('button')).find(b => b.textContent.includes('Inspect group'))
		assert.ok(inspectBtn)
		inspectBtn.click()
		await settle()
		assert.equal(events[0][0], 'select')

		vm.$destroy()
	})

	test('App.vue wires ^ shortcut and DevTreeReclaimerWorkbench cleanly', async () => {
		window.localStorage.clear()
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		const duplicateFilters = loadModule('src/tools/duplicateFilters.js')
		const duplicateStats = loadModule('src/tools/duplicateStats.js')
		const reclamationHistory = loadModule('src/tools/reclamationHistory.js', {
			'./duplicateFilters': duplicateFilters,
			'./duplicateStats': duplicateStats,
		})
		const DevTreeWorkbench = loadDevTreeWorkbench()

		const slotBox = tag => ({
			render(h) {
				return h(tag, { on: this.$listeners }, this.$slots.default)
			},
		})
		const stub = name => ({
			name,
			props: ['duplicate', 'projectId', 'show', 'duplicates', 'allDuplicates', 'currentDuplicateId'],
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
			'./components/DevTreeReclaimerWorkbench.vue': { __esModule: true, default: DevTreeWorkbench },
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
			'./components/OriginFoldersSettings.vue': { __esModule: true, default: stub('origin') },
			'./components/ExcludedFoldersSettings.vue': { __esModule: true, default: stub('excluded') },
			'./components/BulkDeletionSettings.vue': { __esModule: true, default: stub('bulk') },
			'./components/ProjectsSettings.vue': { __esModule: true, default: stub('projects') },
			'./components/ProjectDuplicates.vue': { __esModule: true, default: stub('project-duplicates') },
			'./components/help/OnboardingGuide.vue': { __esModule: true, default: stub('onboarding') },
			'./components/help/UsageExamples.vue': { __esModule: true, default: stub('usage') },
			'./components/help/FAQ.vue': { __esModule: true, default: stub('faq') },
			'./components/FilterSettings.vue': { __esModule: true, default: stub('filter-settings') },
			'@/tools/api': {
				fetchDuplicates: async status => ({
					entities: status === 'acknowledged' ? [] : buildSampleDevDuplicates(),
					pagination: { currentPage: 1, totalPages: 1 },
				}),
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
			'vue-material-design-icons/Folder': stub('icon-folder'),
			'vue-material-design-icons/FolderRemove': stub('icon-folder-remove'),
			'vue-material-design-icons/FolderMultiple': stub('icon-folder-multiple'),
			'vue-material-design-icons/Delete': stub('icon-delete'),
			'vue-material-design-icons/FilterOutline': stub('icon-filter-outline'),
		})

		const vm = new Vue({ render: h => h(App) }).$mount()
		await settle()

		const topbarBtn = vm.$el.querySelector('.topbar-dev-tree-button')
		assert.ok(topbarBtn, 'Topbar Dev Trees button must exist')

		const action = keyboardShortcuts.resolveShortcutAction({ key: '^', shiftKey: true, target: vm.$el })
		assert.equal(action, 'toggle-dev-tree-reclaimer')

		topbarBtn.click()
		await settle()
		assert.ok(vm.$el.querySelector('.dev-tree-reclaimer-workbench'), 'DevTreeReclaimerWorkbench must mount on click')

		window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '^', shiftKey: true, bubbles: true }))
		await settle()
		assert.equal(vm.$el.querySelector('.dev-tree-reclaimer-workbench'), null, 'DevTreeReclaimerWorkbench must toggle closed on ^ shortcut')

		vm.$destroy()
	})

	test('keeps zero U+2013/U+2014 typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/devTreeReclaimer.js',
			'src/components/DevTreeReclaimerWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
		]
		for (const relPath of files) {
			const content = readFileSync(resolve(__dirname, '../..', relPath), 'utf8')
			assert.equal(content.includes('\u2013'), false, `Unexpected U+2013 in ${relPath}`)
			assert.equal(content.includes('\u2014'), false, `Unexpected U+2014 in ${relPath}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `Unexpected XSS sink in ${relPath}`)
		}
		const vueContent = readFileSync(resolve(__dirname, '../..', 'src/components/DevTreeReclaimerWorkbench.vue'), 'utf8')
		assert.ok(vueContent.includes('min-block-size: 44px'))
		assert.ok(vueContent.includes(':focus-visible'))
	})
})
