const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window } = require('./helpers.cjs')

function loadElearningModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/elearningScormAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function loadElearningWorkbench(clipboardImpl) {
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js')
	const elearningScormAuditor = loadElearningModule()
	return loadComponent('src/components/ElearningScormWorkbench.vue', {
		'../tools/clipboardHelper': clipboardImpl === undefined
			? clipboardHelper
			: { copyTextSafely: text => clipboardHelper.copyTextSafely(text, clipboardImpl) },
		'../tools/elearningScormAuditor': elearningScormAuditor,
	})
}

function buildSampleElearningDuplicates() {
	const mib = 1024 * 1024
	const refSec = 1796000000
	return [
		{
			id: 9601,
			hash: 'sha256-elearning-scorm-vault',
			size: 180 * mib,
			acknowledged: false,
			files: [
				{
					id: 96011,
					path: '/__groupfolders/14/Accredited-LMS/BIO201_Genetics_Mod1.scorm.zip',
					size: 180 * mib,
					mtime: refSec - 12 * 86400,
				},
				{
					id: 96012,
					path: '/Faculty/Course-Releases/BIO201_Genetics_Mod1.scorm.zip',
					size: 180 * mib,
					mtime: refSec - 12 * 86400,
				},
				{
					id: 96013,
					path: '/alice/files/Downloads/BIO201_Genetics_Mod1.scorm.zip',
					size: 180 * mib,
					mtime: refSec - 3 * 86400,
				},
			],
		},
		{
			id: 9602,
			hash: 'sha256-elearning-lecture-master',
			size: 620 * mib,
			acknowledged: false,
			files: [
				{
					id: 96021,
					path: '/Lecture-Masters/CS101_Week02_NeuralNets.mov',
					size: 620 * mib,
					mtime: refSec - 20 * 86400,
				},
				{
					id: 96022,
					path: '/Studio/Raw-Lectures/CS101_Week02_NeuralNets_master.mkv',
					size: 620 * mib,
					mtime: refSec - 22 * 86400,
				},
			],
		},
		{
			id: 9603,
			hash: 'sha256-elearning-transcode-verified',
			size: 85 * mib,
			acknowledged: false,
			files: [
				{
					id: 96031,
					path: '/Courses/CS101/Transcodes/CS101_Week02_NeuralNets_1080p.mp4',
					size: 85 * mib,
					mtime: refSec - 5 * 86400,
				},
				{
					id: 96032,
					path: '/Downloads/CS101_Week02_NeuralNets_720p.mp4',
					size: 85 * mib,
					mtime: refSec - 11 * 86400,
				},
				{
					id: 96033,
					path: '/Courses/CS101/Audio/CS101_Week02_NeuralNets.m4a',
					size: 85 * mib,
					mtime: refSec - 9 * 86400,
				},
			],
		},
		{
			id: 9604,
			hash: 'sha256-elearning-transcode-orphan',
			size: 64 * mib,
			acknowledged: false,
			files: [
				{
					id: 96041,
					path: '/Courses/CS102/CS102_Databases_720p.mp4',
					size: 64 * mib,
					mtime: refSec - 18 * 86400,
				},
				{
					id: 96042,
					path: '/Downloads/CS102_Databases_480p.mp4',
					size: 64 * mib,
					mtime: refSec - 16 * 86400,
				},
			],
		},
		{
			id: 9605,
			hash: 'sha256-elearning-editable-deck',
			size: 28 * mib,
			acknowledged: false,
			files: [
				{
					id: 96051,
					path: '/Editable-Decks/CS101_Week02_NeuralNets.pptx',
					size: 28 * mib,
					mtime: refSec - 15 * 86400,
				},
				{
					id: 96052,
					path: '/Courses/CS101/CS101_Week02_NeuralNets.odp',
					size: 28 * mib,
					mtime: refSec - 19 * 86400,
				},
			],
		},
		{
			id: 9606,
			hash: 'sha256-elearning-handout-verified',
			size: 8 * mib,
			acknowledged: false,
			files: [
				{
					id: 96061,
					path: '/Courses/CS101/Handouts/CS101_Week02_NeuralNets_slides.pdf',
					size: 8 * mib,
					mtime: refSec - 10 * 86400,
				},
				{
					id: 96062,
					path: '/Downloads/CS101_Week02_NeuralNets_handout.pdf',
					size: 8 * mib,
					mtime: refSec - 7 * 86400,
				},
			],
		},
		{
			id: 9607,
			hash: 'sha256-elearning-handout-orphan',
			size: 6 * mib,
			acknowledged: false,
			files: [
				{
					id: 96071,
					path: '/Courses/BIO305/BIO305_Epigenetics_slides.pdf',
					size: 6 * mib,
					mtime: refSec - 25 * 86400,
				},
				{
					id: 96072,
					path: '/Downloads/BIO305_Epigenetics_notes.pdf',
					size: 6 * mib,
					mtime: refSec - 21 * 86400,
				},
			],
		},
		{
			id: 9608,
			hash: 'sha256-elearning-caption-quiz-staging',
			size: 2 * mib,
			acknowledged: false,
			files: [
				{
					id: 96081,
					path: '/Courses/CS101/CS101_Week02_NeuralNets.vtt',
					size: 2 * mib,
					mtime: refSec - 5 * 86400,
				},
				{
					id: 96082,
					path: '/Staging/CS101_Week02_Quiz.qti.xml',
					size: 2 * mib,
					mtime: refSec - 45 * 86400,
				},
				{
					id: 96083,
					path: '/Staging/~$CS101_Week02_NeuralNets.pptx',
					size: 2 * mib,
					mtime: refSec - 60 * 86400,
				},
				{
					id: 96084,
					path: '/Staging/BIO201_Backup.mbz.tmp',
					size: 2 * mib,
					mtime: refSec - 72 * 86400,
				},
			],
		},
		{
			id: 9609,
			hash: 'sha256-unrelated-assets',
			size: 2 * mib,
			acknowledged: false,
			files: [
				{ id: 96091, path: '/alice/files/Photos/alpine.jpg', size: 2 * mib, mtime: refSec - 3 * 86400 },
				{ id: 96092, path: '/Documents/StandardContract.pdf', size: 2 * mib, mtime: refSec - 4 * 86400 },
			],
		},
	]
}

describe('E-Learning SCORM/H5P Package, Lecture Recording Transcode & Slide Deck Handout Auditor', () => {
	test('classifies all 4 pedagogical/LMS families while ignoring unrelated files', () => {
		const mod = loadElearningModule()

		for (const p of [
			'/Accredited-LMS/BIO201.scorm.zip',
			'/Course-Releases/BIO201/imsmanifest.xml',
			'/Accredited-LMS/InteractiveQuiz.h5p',
			'/Course-Releases/MoodleExport.mbz',
			'/Course-Releases/CommonCartridge.imscc',
		]) {
			assert.equal(mod.classifyElearningArtifact(p).family, 'lms-scorm-packages', `Expected lms-scorm-packages for ${p}`)
		}

		for (const p of [
			'/Lecture-Masters/CS101_Week01.mov',
			'/Lecture-Masters/CS101_Week01.mkv',
			'/Lecture-Masters/CS101_Week01.mp4',
			'/Transcodes/CS101_Week01_1080p.mp4',
			'/Transcodes/CS101_Week01_720p.mp4',
			'/Transcodes/CS101_Week01_480p.mp4',
			'/Audio/CS101_Week01.m4a',
		]) {
			assert.equal(mod.classifyElearningArtifact(p).family, 'lecture-video-transcodes', `Expected lecture-video-transcodes for ${p}`)
		}

		for (const p of [
			'/Editable-Decks/CS101_Week01.pptx',
			'/Editable-Decks/CS101_Week01.key',
			'/Editable-Decks/CS101_Week01.odp',
			'/Handouts/CS101_Week01_slides.pdf',
			'/Handouts/CS101_Week01_handout.pdf',
			'/Handouts/CS101_Week01_notes.pdf',
		]) {
			assert.equal(mod.classifyElearningArtifact(p).family, 'slide-deck-handout-exports', `Expected slide-deck-handout-exports for ${p}`)
		}

		for (const p of [
			'/Staging/CS101_Week01.vtt',
			'/Staging/CS101_Week01.srt',
			'/Staging/Quiz_01.qti.xml',
			'/Courses/CS101/~$CS101_Week01.pptx',
			'/Courses/CS101/.~lock.CS101_Week01.odp#',
			'/Staging/Backup.mbz.tmp',
			'/Staging/upload.tmp',
		]) {
			assert.equal(mod.classifyElearningArtifact(p).family, 'caption-quiz-staging', `Expected caption-quiz-staging for ${p}`)
		}

		assert.equal(mod.classifyElearningArtifact('/alice/files/Photos/alpine.jpg'), null)
		assert.equal(mod.classifyElearningArtifact('/Documents/StandardContract.pdf'), null)

		const parsedTranscode = mod.parseElearningArtifactInfo(
			'CS101_Week02_NeuralNets_720p.mp4',
			'/Downloads/CS101_Week02_NeuralNets_720p.mp4'
		)
		assert.equal(parsedTranscode.lessonLineageStem, 'CS101_Week02_NeuralNets')
		assert.equal(parsedTranscode.isLectureTranscodeTwin, true)

		const parsedManifest = mod.parseElearningArtifactInfo(
			'imsmanifest.xml',
			'/Accredited-LMS/BIO201_Genetics/imsmanifest.xml'
		)
		assert.equal(parsedManifest.lessonLineageStem, 'BIO201_Genetics')
		assert.equal(parsedManifest.isImsManifest, true)
	})

	test('protects LMS vaults, master recordings, and editable decks, and blocks transcode/handout pruning without conserved source', () => {
		const mod = loadElearningModule()
		const analysis = mod.analyzeElearningScormDuplicates(buildSampleElearningDuplicates(), {
			strategy: 'consolidate-lms-masters',
			staleCacheDays: 30,
			referenceTimeSec: 1796000000,
		})

		assert.equal(analysis.schema, 'duplicatefinder.elearning-scorm-auditor.v1')
		assert.equal(analysis.summary.totalClustersCount, 8)
		assert.equal(analysis.summary.familyCounts['lms-scorm-packages'], 1)
		assert.equal(analysis.summary.familyCounts['lecture-video-transcodes'], 3)
		assert.equal(analysis.summary.familyCounts['slide-deck-handout-exports'], 3)
		assert.equal(analysis.summary.familyCounts['caption-quiz-staging'], 1)

		const lmsCluster = analysis.clusters.find(c => c.primaryGroupId === 9601)
		assert.ok(lmsCluster)
		assert.equal(lmsCluster.survivor.tier, 'published-lms-vault')
		assert.equal(lmsCluster.members.find(m => m.fileId === 96012).verdict, 'blocked-published-lms-vault')
		assert.equal(lmsCluster.members.find(m => m.fileId === 96013).verdict, 'consolidate-to-lms-vault')

		const masterCluster = analysis.clusters.find(c => c.primaryGroupId === 9602)
		assert.ok(masterCluster)
		assert.equal(masterCluster.survivor.tier, 'master-recording-source')
		assert.equal(masterCluster.members.find(m => m.fileId === 96022).verdict, 'blocked-master-recording-source')

		const deckCluster = analysis.clusters.find(c => c.primaryGroupId === 9605)
		assert.ok(deckCluster)
		assert.equal(deckCluster.survivor.tier, 'editable-deck-origin')
		assert.equal(deckCluster.members.find(m => m.fileId === 96052).verdict, 'blocked-editable-deck-origin')

		const stagingCluster = analysis.clusters.find(c => c.primaryGroupId === 9608)
		assert.ok(stagingCluster)
		assert.equal(stagingCluster.members.find(m => m.fileId === 96081).verdict, 'keep-canonical-survivor')
		assert.equal(stagingCluster.members.find(m => m.fileId === 96082).verdict, 'reclaim-course-staging')
		assert.equal(stagingCluster.members.find(m => m.fileId === 96083).verdict, 'reclaim-course-staging')
		assert.equal(stagingCluster.members.find(m => m.fileId === 96084).verdict, 'reclaim-course-staging')

		const transcodeAnalysis = mod.analyzeElearningScormDuplicates(buildSampleElearningDuplicates(), {
			strategy: 'prune-lecture-transcodes-when-source-verified',
			referenceTimeSec: 1796000000,
		})
		const verifiedTranscodes = transcodeAnalysis.clusters.find(c => c.primaryGroupId === 9603)
		assert.equal(verifiedTranscodes.members.find(m => m.fileId === 96032).verdict, 'reclaim-verified-lecture-transcode')
		assert.equal(verifiedTranscodes.members.find(m => m.fileId === 96033).verdict, 'reclaim-verified-lecture-transcode')

		const orphanTranscodes = transcodeAnalysis.clusters.find(c => c.primaryGroupId === 9604)
		assert.equal(orphanTranscodes.members.find(m => m.fileId === 96042).verdict, 'blocked-unverified-master-recording')

		const excludedMasterAnalysis = mod.analyzeElearningScormDuplicates(buildSampleElearningDuplicates(), {
			strategy: 'prune-lecture-transcodes-when-source-verified',
			referenceTimeSec: 1796000000,
			memberOverrides: {
				96021: 'exclude',
				96022: 'exclude',
			},
		})
		const nowUnverifiedTranscode = excludedMasterAnalysis.clusters.find(c => c.primaryGroupId === 9603)
		assert.equal(nowUnverifiedTranscode.members.find(m => m.fileId === 96032).verdict, 'blocked-unverified-master-recording')

		const handoutAnalysis = mod.analyzeElearningScormDuplicates(buildSampleElearningDuplicates(), {
			strategy: 'hardlink-handout-exports',
			referenceTimeSec: 1796000000,
		})
		const verifiedHandouts = handoutAnalysis.clusters.find(c => c.primaryGroupId === 9606)
		assert.equal(verifiedHandouts.members.find(m => m.fileId === 96062).verdict, 'hardlink-verified-handout-export')
		assert.equal(verifiedHandouts.members.find(m => m.fileId === 96062).actionKind, 'consolidate')

		const orphanHandouts = handoutAnalysis.clusters.find(c => c.primaryGroupId === 9607)
		assert.equal(orphanHandouts.members.find(m => m.fileId === 96072).verdict, 'blocked-unverified-editable-deck')
	})

	test('supports overrides, DRY_RUN=1 POSIX script, .sync-exclude.lst, CWE-1236 CSV, and JSON manifest', () => {
		const mod = loadElearningModule()
		const duplicates = [
			...buildSampleElearningDuplicates(),
			{
				id: 9699,
				hash: 'sha256-formula-lms',
				size: 4096000,
				acknowledged: false,
				files: [
					{ id: 96991, path: '/Accredited-LMS/=CMD("calc")_Course.scorm.zip', size: 4096000, mtime: 1795000000 },
					{ id: 96992, path: '/Downloads/stray_Course.scorm.zip', size: 4096000, mtime: 1790000000 },
				],
			},
			{
				id: 9698,
				hash: 'sha256-formula-plus-lms',
				size: 4096000,
				acknowledged: false,
				files: [
					{ id: 96981, path: '/Course-Releases/+malicious_Deck.pptx', size: 4096000, mtime: 1795000000 },
					{ id: 96982, path: '/Downloads/stray_Deck.pptx', size: 4096000, mtime: 1790000000 },
				],
			},
		]

		const consolidateAnalysis = mod.analyzeElearningScormDuplicates(duplicates, {
			strategy: 'consolidate-lms-masters',
			referenceTimeSec: 1796000000,
		})
		const lmsCluster = consolidateAnalysis.clusters.find(c => c.primaryGroupId === 9601)
		assert.equal(lmsCluster.members.find(m => m.fileId === 96013).verdict, 'consolidate-to-lms-vault')
		assert.equal(lmsCluster.members.find(m => m.fileId === 96013).actionKind, 'consolidate')

		const script = mod.buildElearningScormScript(consolidateAnalysis, { dataRoot: '/srv/nc/data' })
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes('sha256sum --'))
		assert.ok(script.includes('stat -c %d'))
		assert.ok(script.includes('consolidate_lms_master_copy'))
		assert.ok(script.includes('occ files:scan --path='))

		const overrideAnalysis = mod.analyzeElearningScormDuplicates(buildSampleElearningDuplicates(), {
			strategy: 'consolidate-lms-masters',
			staleCacheDays: 30,
			memberOverrides: {
				96082: 'force-keep',
				96083: 'exclude',
			},
			referenceTimeSec: 1796000000,
		})
		const stagingOverridden = overrideAnalysis.clusters.find(c => c.primaryGroupId === 9608)
		assert.equal(stagingOverridden.members.find(m => m.fileId === 96082).verdict, 'blocked-manual-shield')
		assert.equal(stagingOverridden.members.find(m => m.fileId === 96083).verdict, 'excluded')

		const syncExclude = mod.buildElearningScormSyncExcludeSnippet(consolidateAnalysis)
		for (const pattern of ['*.mbz.tmp', '~$*.pptx', '.~lock.*.odp#']) {
			assert.ok(syncExclude.includes(pattern), `Expected .sync-exclude.lst pattern ${pattern}`)
		}

		const csv = mod.buildElearningScormCsvReport(consolidateAnalysis)
		assert.ok(csv.includes('"\'=CMD(""calc"")_Course.scorm.zip"') || csv.includes("'=CMD"))
		assert.ok(csv.includes("'+malicious_Deck.pptx"))

		const json = JSON.parse(mod.buildElearningScormJsonReport(consolidateAnalysis, '2026-11-24T07:05:00Z'))
		assert.equal(json.schema, 'duplicatefinder.elearning-scorm-auditor.v1')
		assert.equal(json.generatedAt, '2026-11-24T07:05:00Z')
		assert.ok(Array.isArray(json.clusters))
	})

	test('renders ElearningScormWorkbench empty, filter-empty, populated, and interactive states without clamping numeric inputs', async () => {
		let copied = ''
		const Workbench = loadElearningWorkbench({
			writeText: async text => {
				copied = text
			},
		})

		const emptyVm = new Vue({
			render: h => h(Workbench, {
				props: { duplicates: [], allDuplicates: [] },
			}),
		}).$mount()
		await settle()
		assert.ok(emptyVm.$el.querySelector('.esw__empty-banner'))
		emptyVm.$destroy()

		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: buildSampleElearningDuplicates(),
					allDuplicates: buildSampleElearningDuplicates(),
					currentDuplicateId: 9601,
				},
			}),
		}).$mount()
		await settle()

		assert.equal(vm.$el.querySelectorAll('.esw__cluster-item').length, 8)
		assert.ok(vm.$el.textContent.includes('BIO201_Genetics_Mod1.scorm.zip'))

		const numInputs = vm.$el.querySelectorAll('.esw__num-input')
		assert.equal(numInputs.length, 3)
		for (const input of numInputs) {
			input.value = ''
			input.dispatchEvent(new window.Event('input'))
			await settle()
			assert.equal(input.value, '', 'Numeric input must not clamp or reset mid-keystroke')
		}

		const copyBtn = Array.from(vm.$el.querySelectorAll('button')).find(b => b.textContent.includes('Copy DRY_RUN=1 Script'))
		copyBtn.click()
		await settle()
		assert.ok(copied.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(vm.$el.querySelector('.esw__notice.is-success'))

		const searchInput = vm.$el.querySelector('input[type="search"]')
		searchInput.value = 'no-such-course-asset-xyz'
		searchInput.dispatchEvent(new window.Event('input'))
		await settle()
		assert.ok(vm.$el.querySelector('.esw__empty-banner'))

		const resetBtn = Array.from(vm.$el.querySelectorAll('button')).find(b => b.textContent.includes('Reset Filters'))
		resetBtn.click()
		await settle()
		assert.equal(vm.$el.querySelectorAll('.esw__cluster-item').length, 8)

		vm.$destroy()
	})

	test('integrates Courses & SCORM button and Shift+L keyboard shortcut in App.vue', async () => {
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
		const ElearningWorkbench = loadElearningWorkbench({ writeText: async () => {} })

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
			'@nextcloud/dialogs': { showError: () => {}, showSuccess: () => {} },
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
			'./components/StorageFootprintAnalyzer.vue': { __esModule: true, default: stub('storage-footprint') },
			'./components/PhotoBurstTimeline.vue': { __esModule: true, default: stub('photo-burst') },
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
			'./components/ElearningScormWorkbench.vue': { __esModule: true, default: ElearningWorkbench },
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
			'./components/OriginFoldersSettings.vue': { __esModule: true, default: stub('origin') },
			'./components/ExcludedFoldersSettings.vue': { __esModule: true, default: stub('excluded') },
			'./components/BulkDeletionSettings.vue': { __esModule: true, default: stub('bulk') },
			'./components/ProjectsSettings.vue': { __esModule: true, default: stub('projects') },
			'./components/ProjectDuplicates.vue': { __esModule: true, default: stub('project-duplicates') },
			'./components/help/OnboardingGuide.vue': { __esModule: true, default: stub('onboarding') },
			'./components/help/UsageExamples.vue': { __esModule: true, default: stub('usage') },
			'./components/help/FAQ.vue': { __esModule: true, default: stub('faq') },
			'./components/FilterSettings.vue': { __esModule: true, default: stub('filters') },
			'@/tools/api': {
				fetchDuplicates: async status => ({
					entities: status === 'acknowledged' ? [] : buildSampleElearningDuplicates(),
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

		const topbarBtn = vm.$el.querySelector('.topbar-elearning-scorm-button')
		assert.ok(topbarBtn, 'Topbar Courses & SCORM button must exist')

		const action = keyboardShortcuts.resolveShortcutAction({ key: 'L', shiftKey: true, target: vm.$el })
		assert.equal(action, 'toggle-elearning-scorm-auditor')
		assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'l', shiftKey: false, target: vm.$el }), 'toggle-link-simulator')

		topbarBtn.click()
		await settle()
		assert.ok(vm.$el.querySelector('.elearning-scorm-workbench'), 'ElearningScormWorkbench must mount on click')

		window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'L', shiftKey: true, bubbles: true }))
		await settle()
		assert.equal(vm.$el.querySelector('.elearning-scorm-workbench'), null, 'ElearningScormWorkbench must toggle closed on Shift+L shortcut')

		vm.$destroy()
	})

	test('keeps zero U+2013/U+2014 typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/elearningScormAuditor.js',
			'src/components/ElearningScormWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
		]
		for (const relPath of files) {
			const content = readFileSync(resolve(__dirname, '../..', relPath), 'utf8')
			assert.equal(content.includes('\u2013'), false, `Unexpected U+2013 in ${relPath}`)
			assert.equal(content.includes('\u2014'), false, `Unexpected U+2014 in ${relPath}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `Unexpected XSS sink in ${relPath}`)
		}
		const vueContent = readFileSync(resolve(__dirname, '../..', 'src/components/ElearningScormWorkbench.vue'), 'utf8')
		assert.ok(vueContent.includes('min-block-size: 44px'))
		assert.ok(vueContent.includes(':focus-visible'))
	})
})
