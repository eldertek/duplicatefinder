const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window, document } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

/**
 * Load the pure Release Binary & SBOM Artifact Vault auditor module for tests.
 *
 * @return {object} Loaded module exports.
 */
function loadReleaseBinaryModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/releaseBinaryArtifactAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

/**
 * Load ReleaseBinaryArtifactWorkbench.vue with optional clipboard stub.
 *
 * @param {object} [clipboardImpl] Optional clipboard implementation.
 * @return {object} Vue component definition.
 */
function loadReleaseBinaryWorkbench(clipboardImpl) {
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js')
	const releaseBinaryArtifactAuditor = loadReleaseBinaryModule()
	return loadComponent('src/components/ReleaseBinaryArtifactWorkbench.vue', {
		'../tools/clipboardHelper': clipboardImpl === undefined
			? clipboardHelper
			: { copyTextSafely: text => clipboardHelper.copyTextSafely(text, clipboardImpl) },
		'../tools/releaseBinaryArtifactAuditor': releaseBinaryArtifactAuditor,
	})
}

/**
 * Build synthetic duplicate clusters covering all 4 release binary and SBOM vault families.
 *
 * @return {Array<object>} Sample duplicate groups.
 */
function buildSampleReleaseBinaryDuplicates() {
	const mib = 1024 * 1024
	const refSec = 1796000000
	return [
		{
			id: 9901,
			hash: 'sha256-acme-studio-2-4-0-arm64-dmg-latest-ga',
			size: 256 * mib,
			acknowledged: false,
			files: [
				{
					id: 99011,
					path: '/__groupfolders/12/releases/ga/acme-studio-2.4.0-arm64.dmg',
					size: 256 * mib,
					mtime: refSec - 2 * 86400,
				},
				{
					id: 99012,
					path: '/releases/signed/acme-studio-2.4.0-arm64.dmg',
					size: 256 * mib,
					mtime: refSec - 2 * 86400,
				},
				{
					id: 99013,
					path: '/alice/files/Downloads/acme-studio-2.4.0-arm64.dmg',
					size: 256 * mib,
					mtime: refSec - 1 * 86400,
				},
			],
		},
		{
			id: 9902,
			hash: 'sha256-acme-studio-2-0-1-lts-x86-64-msi',
			size: 192 * mib,
			acknowledged: false,
			files: [
				{
					id: 99021,
					path: '/releases/lts/signed/acme-studio-2.0.1-lts-x86_64.msi',
					size: 192 * mib,
					mtime: refSec - 60 * 86400,
				},
				{
					id: 99022,
					path: '/release-vault/lts/acme-studio-2.0.1-lts-x86_64.msi',
					size: 192 * mib,
					mtime: refSec - 58 * 86400,
				},
			],
		},
		{
			id: 9903,
			hash: 'sha256-acme-studio-2-5-0-rc1-nightly-appimage',
			size: 140 * mib,
			acknowledged: false,
			files: [
				{
					id: 99031,
					path: '/ci-artifacts/nightly/acme-studio-2.5.0-nightly.20261001-x86_64.AppImage',
					size: 140 * mib,
					mtime: refSec - 30 * 86400,
				},
				{
					id: 99032,
					path: '/staging/mirrors/acme-studio-2.5.0-nightly.20261001-x86_64.AppImage',
					size: 140 * mib,
					mtime: refSec - 32 * 86400,
				},
				{
					id: 99033,
					path: '/alice/files/Downloads/acme-studio-2.5.0-nightly.20261001-x86_64.AppImage',
					size: 140 * mib,
					mtime: refSec - 31 * 86400,
				},
			],
		},
		{
			id: 9904,
			hash: 'sha256-acme-studio-2-4-0-arm64-dmg-sig',
			size: 2 * mib,
			acknowledged: false,
			files: [
				{
					id: 99041,
					path: '/__groupfolders/12/releases/ga/acme-studio-2.4.0-arm64.dmg.sig',
					size: 2 * mib,
					mtime: refSec - 2 * 86400,
				},
				{
					id: 99042,
					path: '/alice/files/Downloads/acme-studio-2.4.0-arm64.dmg.sig',
					size: 2 * mib,
					mtime: refSec - 1 * 86400,
				},
			],
		},
		{
			id: 9905,
			hash: 'sha256-acme-studio-2-4-0-cdx-sbom',
			size: 4 * mib,
			acknowledged: false,
			files: [
				{
					id: 99051,
					path: '/__groupfolders/12/releases/ga/acme-studio-2.4.0-arm64.cdx.json',
					size: 4 * mib,
					mtime: refSec - 2 * 86400,
				},
				{
					id: 99052,
					path: '/staging/acme-studio-2.4.0-arm64.cdx.json',
					size: 4 * mib,
					mtime: refSec - 1 * 86400,
				},
			],
		},
		{
			id: 9906,
			hash: 'sha256-pyhelper-1-2-0-whl-spdx',
			size: 32 * mib,
			acknowledged: false,
			files: [
				{
					id: 99061,
					path: '/releases/ga/pyhelper-1.2.0-py3-none-any.whl',
					size: 32 * mib,
					mtime: refSec - 10 * 86400,
				},
				{
					id: 99062,
					path: '/Downloads/pyhelper-1.2.0-py3-none-any.whl',
					size: 32 * mib,
					mtime: refSec - 9 * 86400,
				},
			],
		},
		{
			id: 9907,
			hash: 'sha256-formula-injection-test-nupkg',
			size: 12 * mib,
			acknowledged: false,
			files: [
				{
					id: 99071,
					path: '=cmd|calc/releases/ga/pkg-1.0.0.nupkg',
					size: 12 * mib,
					mtime: refSec - 5 * 86400,
				},
				{
					id: 99072,
					path: '=cmd|calc/Downloads/pkg-1.0.0.nupkg',
					size: 12 * mib,
					mtime: refSec - 4 * 86400,
				},
			],
		},
	]
}

describe('Cycle 177: Release Binary, Signed Installer & SBOM Artifact Vault Auditor', () => {
	test('classifies installers, pre-releases, detached signatures and CycloneDX/SPDX SBOMs deterministically', () => {
		const mod = loadReleaseBinaryModule()

		const dmg = mod.classifyReleaseArtifactFile({ path: '/releases/ga/acme-studio-2.4.0-arm64.dmg' })
		assert.equal(dmg.family, 'signed-ga-and-lts-installers')
		assert.equal(dmg.product, 'acme-studio')
		assert.equal(dmg.semver.raw, '2.4.0')
		assert.equal(dmg.targetArch, 'arm64')
		assert.equal(dmg.platform, 'macOS')
		assert.equal(dmg.channel, 'ga')

		const ltsMsi = mod.classifyReleaseArtifactFile({ path: '/releases/lts/signed/acme-studio-2.0.1-lts-x86_64.msi' })
		assert.equal(ltsMsi.family, 'signed-ga-and-lts-installers')
		assert.equal(ltsMsi.channel, 'lts')
		assert.equal(ltsMsi.targetArch, 'x86_64')
		assert.equal(ltsMsi.platform, 'Windows')
		assert.equal(ltsMsi.isLts, true)

		const nightlyApp = mod.classifyReleaseArtifactFile({ path: '/ci-artifacts/nightly/acme-studio-2.5.0-nightly.1-x86_64.AppImage' })
		assert.equal(nightlyApp.family, 'prerelease-and-ci-builds')
		assert.equal(nightlyApp.channel, 'nightly')
		assert.equal(nightlyApp.platform, 'Linux')

		const sig = mod.classifyReleaseArtifactFile({ path: '/releases/ga/acme-studio-2.4.0-arm64.dmg.sig' })
		assert.equal(sig.family, 'detached-signatures-and-checksums')
		assert.equal(sig.targetInstallerBasename, 'acme-studio-2.4.0-arm64.dmg')

		const cdx = mod.classifyReleaseArtifactFile({ path: '/releases/ga/acme-studio-2.4.0-arm64.cdx.json' })
		assert.equal(cdx.family, 'sbom-and-attestation-manifests')
		assert.equal(cdx.formatBadge, 'CycloneDX')

		const spdx = mod.classifyReleaseArtifactFile({ path: '/releases/ga/acme-studio-2.4.0-x86_64.spdx.json' })
		assert.equal(spdx.family, 'sbom-and-attestation-manifests')
		assert.equal(spdx.formatBadge, 'SPDX')

		const unrelated = mod.classifyReleaseArtifactFile({ path: '/Photos/holiday.jpg' })
		assert.equal(unrelated, null)

		assert.ok(mod.compareSemver(
			mod.parseArtifactSemver('app-2.4.0.dmg'),
			mod.parseArtifactSemver('app-2.4.0-rc1.dmg'),
		) > 0, 'GA release must outrank RC pre-release of same version')
	})

	test('protects latest GA & signed LTS releases, links signatures/SBOMs, and computes safe reclaimable GB', () => {
		const mod = loadReleaseBinaryModule()
		const sample = buildSampleReleaseBinaryDuplicates()
		const analysis = mod.analyzeReleaseBinaryArtifacts(sample, {
			referenceNowSec: 1796000000,
		})

		assert.equal(analysis.schema, mod.RELEASE_BINARY_ARTIFACT_SCHEMA)
		assert.equal(analysis.summary.totalClustersCount, 7)
		assert.ok(analysis.summary.totalReclaimableBytes > 0)
		assert.match(analysis.summary.reclaimableGb, /^\d+\.\d{2} GB$/)
		assert.ok(analysis.summary.totalProtectedGaLtsClusters >= 2)
		assert.ok(analysis.summary.totalSignedClusters >= 2)
		assert.ok(analysis.summary.totalSbomLinkedClusters >= 2)

		// Latest GA cluster protects canonical vault copies while reclaiming Downloads copy
		const latestGaCluster = analysis.clusters.find(c => c.primaryGroupId === 9901)
		assert.ok(latestGaCluster)
		assert.equal(latestGaCluster.isLatestGa, true)
		assert.equal(latestGaCluster.hasDetachedSignature, true)
		assert.equal(latestGaCluster.hasSbomCompanion, true)
		const gaVaultSecond = latestGaCluster.members.find(m => m.path.includes('releases/signed/acme-studio-2.4.0-arm64.dmg') || m.path.includes('__groupfolders/12/releases/ga/acme-studio-2.4.0-arm64.dmg'))
		const gaVaultProtected = latestGaCluster.members.find(m => m.verdict === 'blocked-latest-ga-release')
		const gaDownloadCopy = latestGaCluster.members.find(m => m.path.includes('Downloads/acme-studio-2.4.0-arm64.dmg'))
		assert.ok(gaVaultSecond)
		assert.ok(gaVaultProtected, 'Second canonical GA vault copy must be protected as blocked-latest-ga-release')
		assert.ok(gaDownloadCopy)
		assert.equal(gaDownloadCopy.verdict, 'reclaim-mirror-copy')

		// Signed LTS cluster in canonical vaults is 100% shielded under default prune strategy
		const ltsCluster = analysis.clusters.find(c => c.primaryGroupId === 9902)
		assert.ok(ltsCluster)
		assert.equal(ltsCluster.isSignedLts, true)
		assert.equal(ltsCluster.reclaimableBytes, 0)
		assert.equal(ltsCluster.riskState, 'signed-lts-protected')

		// Hardlink consolidation strategy marks canonical LTS mirror as hardlink-consolidatable
		const hardlinkAnalysis = mod.analyzeReleaseBinaryArtifacts(sample, {
			strategy: 'consolidate-release-vault-hardlinks',
			referenceNowSec: 1796000000,
		})
		const ltsHardlink = hardlinkAnalysis.clusters.find(c => c.primaryGroupId === 9902)
		assert.equal(ltsHardlink.consolidatableCopiesCount, 1)
		assert.equal(ltsHardlink.riskState, 'consolidatable')

		// Script, CWE-1236 CSV, JSON, and sync-exclude generation
		const script = mod.buildReleaseBinaryRemediationScript(analysis, { dataRoot: '/srv/nextcloud/data' })
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes('set -eu'))
		assert.ok(script.includes('rm -f \'/srv/nextcloud/data/') && script.includes('Downloads/acme-studio-2.4.0-arm64.dmg\''))

		const csv = mod.buildReleaseBinaryCsvReport(analysis)
		assert.ok(csv.includes('Product,Semver,TargetArch'))
		assert.ok(csv.includes('\'=cmd|calc') || csv.includes('"\'=cmd|calc'), 'CWE-1236 formula payload must be neutralized')

		const json = JSON.parse(mod.buildReleaseBinaryJsonReport(analysis))
		assert.equal(json.schema, mod.RELEASE_BINARY_ARTIFACT_SCHEMA)
		assert.equal(json.clusters.length, 7)

		const syncExclude = mod.buildReleaseBinarySyncExcludeSnippet(analysis)
		assert.ok(syncExclude.includes('ci-artifacts/'))
	})

	test('ReleaseBinaryArtifactWorkbench.vue renders empty & populated states, filters, overrides, and copies script', async () => {
		let copiedText = ''
		const Workbench = loadReleaseBinaryWorkbench({
			writeText: async text => {
				copiedText = text
			},
		})

		// Empty state
		const emptyVm = new Vue({
			render(h) {
				return h(Workbench, {
					props: { duplicates: [], allDuplicates: [] },
					on: {
						'start-scan': () => {
							this.scanTriggered = true
						},
					},
				})
			},
			data: () => ({ scanTriggered: false }),
		}).$mount()
		try {
			await settle()
			assert.ok(emptyVm.$el.querySelector('.rba__empty-banner'))
			emptyVm.$el.querySelector('.rba__primary-btn').click()
			await settle()
			assert.equal(emptyVm.scanTriggered, true)
		} finally {
			emptyVm.$destroy()
		}

		// Populated state
		const sample = buildSampleReleaseBinaryDuplicates()
		let selectedDup = null
		let comparedDup = null
		const vm = new Vue({
			render(h) {
				return h(Workbench, {
					ref: 'wb',
					props: { duplicates: sample, allDuplicates: sample, currentDuplicateId: 9901 },
					on: {
						'select-duplicate': dup => {
							selectedDup = dup
						},
						'compare-duplicate': dup => {
							comparedDup = dup
						},
					},
				})
			},
		}).$mount()
		try {
			await settle()
			const wb = vm.$refs.wb
			assert.equal(wb.analysis.clusters.length, 7)
			assert.ok(vm.$el.querySelector('.rba__workspace'))

			// Preset switch
			wb.applyPreset('audit-sbom-compliance-vault')
			await settle()
			assert.equal(wb.familyFilter, 'sbom-and-attestation-manifests')
			assert.equal(wb.analysis.clusters.length, 1)

			// Reset filters
			wb.resetFilters()
			await settle()
			assert.equal(wb.analysis.clusters.length, 7)

			// Numeric input is never clamped mid-keystroke
			wb.keepPreviousGaInput = ''
			await settle()
			assert.equal(wb.keepPreviousGaInput, '')
			assert.equal(wb.parsedKeepPreviousGa, 1)

			// Copy DRY_RUN=1 script
			await wb.copyRemediationScript()
			await settle()
			assert.ok(copiedText.includes('DRY_RUN="${DRY_RUN:-1}"'))

			// Jump & compare emits
			wb.jumpToDuplicate(wb.selectedCluster)
			wb.compareDuplicate(wb.selectedCluster)
			assert.ok(selectedDup)
			assert.ok(comparedDup)
		} finally {
			vm.$destroy()
		}
	})

	test('integrates Release & SBOM Vault button and Shift+K keyboard shortcut in App.vue without breaking k navigation', async () => {
		window.localStorage.clear()
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		const ReleaseBinaryArtifactWorkbench = loadReleaseBinaryWorkbench()
		const slotBox = tag => ({
			render(h) {
				return h(tag, this.$slots.default)
			},
		})
		const stub = name => ({
			name,
			props: ['duplicate', 'projectId', 'show', 'isScanning'],
			render(h) {
				return h('div', { class: `stub-${name}` })
			},
		})
		const icon = slotBox('span')

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
			'./components/DuplicateNavigation.vue': { __esModule: true, default: stub('duplicate-nav') },
			'./components/DuplicateDetails.vue': { __esModule: true, default: stub('duplicate-details') },
			'./components/DuplicateTreemap.vue': { __esModule: true, default: stub('treemap') },
			'./components/SpaceReclamationTimeline.vue': { __esModule: true, default: stub('reclaim') },
			'./components/SimilarityInspector.vue': { __esModule: true, default: stub('similarity') },
			'./components/BatchAutoSelectWorkbench.vue': { __esModule: true, default: stub('batch') },
			'./components/FileHygieneInspector.vue': { __esModule: true, default: stub('hygiene') },
			'./components/LinkDeduplicationSimulator.vue': { __esModule: true, default: stub('link') },
			'./components/FolderPairMatrix.vue': { __esModule: true, default: stub('matrix') },
			'./components/StorageFootprintAnalyzer.vue': { __esModule: true, default: stub('footprint') },
			'./components/PhotoBurstTimeline.vue': { __esModule: true, default: stub('burst') },
			'./components/RecoverySafetyWorkbench.vue': { __esModule: true, default: stub('recovery') },
			'./components/ArchivePayloadInspector.vue': { __esModule: true, default: stub('archive') },
			'./components/AudioTagWorkbench.vue': { __esModule: true, default: stub('audio') },
			'./components/VideoSceneWorkbench.vue': { __esModule: true, default: stub('video') },
			'./components/SidecarSweepWorkbench.vue': { __esModule: true, default: stub('sidecar') },
			'./components/RuleProfilesWorkbench.vue': { __esModule: true, default: stub('rules') },
			'./components/DocumentLineageWorkbench.vue': { __esModule: true, default: stub('lineage') },
			'./components/PhotoPerceptualWorkbench.vue': { __esModule: true, default: stub('perceptual') },
			'./components/BrokenMediaQuarantineWorkbench.vue': { __esModule: true, default: stub('quarantine') },
			'./components/RetentionAgeWorkbench.vue': { __esModule: true, default: stub('retention') },
			'./components/FilenameCollisionWorkbench.vue': { __esModule: true, default: stub('collision') },
			'./components/QuotaAttributionWorkbench.vue': { __esModule: true, default: stub('quota') },
			'./components/PreviewCacheWorkbench.vue': { __esModule: true, default: stub('preview') },
			'./components/ShareMountAuditorWorkbench.vue': { __esModule: true, default: stub('share') },
			'./components/BackupDriftWorkbench.vue': { __esModule: true, default: stub('backup') },
			'./components/AutomationRulebookWorkbench.vue': { __esModule: true, default: stub('automation') },
			'./components/MetadataConsolidationWorkbench.vue': { __esModule: true, default: stub('metadata') },
			'./components/ForensicVerifierWorkbench.vue': { __esModule: true, default: stub('forensic') },
			'./components/InodeSafetyWorkbench.vue': { __esModule: true, default: stub('inode') },
			'./components/ShadowReclaimWorkbench.vue': { __esModule: true, default: stub('shadow') },
			'./components/JunkPairInspectorWorkbench.vue': { __esModule: true, default: stub('junk') },
			'./components/MediaFidelityWorkbench.vue': { __esModule: true, default: stub('fidelity') },
			'./components/CdcChunkingWorkbench.vue': { __esModule: true, default: stub('cdc') },
			'./components/OpsScheduleWorkbench.vue': { __esModule: true, default: stub('ops') },
			'./components/LegalHoldWorkbench.vue': { __esModule: true, default: stub('legal') },
			'./components/RansomwareCanaryWorkbench.vue': { __esModule: true, default: stub('canary') },
			'./components/DevTreeReclaimerWorkbench.vue': { __esModule: true, default: stub('devtree') },
			'./components/ConflictStormWorkbench.vue': { __esModule: true, default: stub('conflict') },
			'./components/VmCowReflinkWorkbench.vue': { __esModule: true, default: stub('vmcow') },
			'./components/ScientificBundleWorkbench.vue': { __esModule: true, default: stub('sci') },
			'./components/BrandKitAuditorWorkbench.vue': { __esModule: true, default: stub('brand') },
			'./components/LogTelemetryWorkbench.vue': { __esModule: true, default: stub('log') },
			'./components/InstallerRepoWorkbench.vue': { __esModule: true, default: stub('installer') },
			'./components/WorkbookDriftWorkbench.vue': { __esModule: true, default: stub('workbook') },
			'./components/MailboxArchiveWorkbench.vue': { __esModule: true, default: stub('mailbox') },
			'./components/CadVaultWorkbench.vue': { __esModule: true, default: stub('cad') },
			'./components/WebBuildMediaWorkbench.vue': { __esModule: true, default: stub('webbuild') },
			'./components/LegalDocumentOcrWorkbench.vue': { __esModule: true, default: stub('legalocr') },
			'./components/BackupTakeoutWorkbench.vue': { __esModule: true, default: stub('takeout') },
			'./components/DawAudioStemWorkbench.vue': { __esModule: true, default: stub('daw') },
			'./components/VfxRenderCacheWorkbench.vue': { __esModule: true, default: stub('vfx') },
			'./components/ElearningScormWorkbench.vue': { __esModule: true, default: stub('scorm') },
			'./components/PhotoRawCatalogWorkbench.vue': { __esModule: true, default: stub('photoraw') },
			'./components/VmContainerImageWorkbench.vue': { __esModule: true, default: stub('vmcontainer') },
			'./components/MlDatasetArtifactWorkbench.vue': { __esModule: true, default: stub('mldataset') },
			'./components/Game3dAssetVaultWorkbench.vue': { __esModule: true, default: stub('game3d') },
			'./components/DatabaseDumpLogWorkbench.vue': { __esModule: true, default: stub('dblog') },
			'./components/DesignPublishingVaultWorkbench.vue': { __esModule: true, default: stub('designpub') },
			'./components/ReleaseBinaryArtifactWorkbench.vue': { __esModule: true, default: ReleaseBinaryArtifactWorkbench },
			'./components/EmailArchiveVaultWorkbench.vue': { __esModule: true, default: stub('email-archive-vault-auditor') },
			'./components/AudioDawVaultWorkbench.vue': { __esModule: true, default: stub('audio-daw-vault-auditor') },
			'./components/OriginFoldersSettings.vue': { __esModule: true, default: stub('origin') },
			'./components/ExcludedFoldersSettings.vue': { __esModule: true, default: stub('excluded') },
			'./components/BulkDeletionSettings.vue': { __esModule: true, default: stub('bulk') },
			'./components/ProjectsSettings.vue': { __esModule: true, default: stub('projects') },
			'./components/ProjectDuplicates.vue': { __esModule: true, default: stub('project-dups') },
			'./components/help/OnboardingGuide.vue': { __esModule: true, default: stub('guide') },
			'./components/help/UsageExamples.vue': { __esModule: true, default: stub('examples') },
			'./components/help/FAQ.vue': { __esModule: true, default: stub('faq') },
			'./components/FilterSettings.vue': { __esModule: true, default: stub('filters') },
			'@/tools/api': {
				fetchDuplicates: async type => ({
					entities: type === 'unacknowledged' ? buildSampleReleaseBinaryDuplicates() : [],
					pagination: { currentPage: 1, totalPages: 1, totalItems: 7, hasMore: false },
				}),
				fetchProjects: async () => [],
			},
			'@/tools/utils': utils,
			'@/tools/keyboardShortcuts': keyboardShortcuts,
			'@/tools/reclamationHistory': loadModule('src/tools/reclamationHistory.js', {
				'./duplicateFilters': loadModule('src/tools/duplicateFilters.js'),
				'./duplicateStats': loadModule('src/tools/duplicateStats.js'),
			}),
			'vue-material-design-icons/Folder': icon,
			'vue-material-design-icons/FolderRemove': icon,
			'vue-material-design-icons/FolderMultiple': icon,
			'vue-material-design-icons/Delete': icon,
			'vue-material-design-icons/FilterOutline': icon,
		})

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue(App).$mount(mountNode)
		try {
			await settle()

			// Unshifted k still resolves to previous-duplicate
			assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'k', shiftKey: false }), 'previous-duplicate')
			assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'K', shiftKey: true }), 'toggle-release-binary-artifact-auditor')

			const btn = vm.$el.querySelector('button.topbar-release-binary-artifact-button')
			assert.ok(btn, 'Release & SBOM Vault button is rendered in topbar')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'Shift+K')
			assert.equal(vm.$el.querySelector('.release-binary-artifact-workbench'), null)

			// Shift+K opens workbench
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'K', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.ok(vm.$el.querySelector('.release-binary-artifact-workbench'), 'ReleaseBinaryArtifactWorkbench must open on Shift+K shortcut')

			// Shift+K again closes workbench
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'K', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.$el.querySelector('.release-binary-artifact-workbench'), null, 'ReleaseBinaryArtifactWorkbench must toggle closed on Shift+K shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new Release Binary & SBOM files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/releaseBinaryArtifactAuditor.js',
			'src/components/ReleaseBinaryArtifactWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
		]
		for (const rel of files) {
			const content = readFileSync(resolve(root, rel), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(content), false, `No U+2013/U+2014 in ${rel}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `No XSS sink in ${rel}`)
		}
	})
})
