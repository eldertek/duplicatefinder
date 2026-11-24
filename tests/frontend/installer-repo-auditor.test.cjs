const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window } = require('./helpers.cjs')

function loadInstallerRepoModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/installerRepoAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function loadInstallerRepoWorkbench(clipboardImpl) {
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js')
	const installerRepoAuditor = loadInstallerRepoModule()
	return loadComponent('src/components/InstallerRepoWorkbench.vue', {
		'../tools/clipboardHelper': clipboardImpl === undefined
			? clipboardHelper
			: { copyTextSafely: text => clipboardHelper.copyTextSafely(text, clipboardImpl) },
		'../tools/installerRepoAuditor': installerRepoAuditor,
	})
}

function buildSampleInstallerDuplicates() {
	const mib = 1024 * 1024
	const refSec = 1796000000
	return [
		{
			id: 5101,
			hash: 'sha256-ubuntu-2404-iso',
			size: 2048 * mib,
			acknowledged: false,
			files: [
				{
					id: 51011,
					path: '/__groupfolders/12/iso-repo/ubuntu-24.04.1-live-server-amd64-signed.iso',
					size: 2048 * mib,
					mtime: refSec - 10 * 86400,
				},
				{
					id: 51012,
					path: '/pxe/tftpboot/ubuntu/ubuntu-24.04.1-live-server-amd64.iso',
					size: 2048 * mib,
					mtime: refSec - 12 * 86400,
				},
				{
					id: 51013,
					path: '/alice/files/Downloads/Admin \'26\'/ubuntu-24.04.1-live-server-amd64.iso',
					size: 2048 * mib,
					mtime: refSec - 45 * 86400,
				},
			],
		},
		{
			id: 5102,
			hash: 'sha256-desktop-msi-rc',
			size: 180 * mib,
			acknowledged: false,
			files: [
				{
					id: 51021,
					path: '/__groupfolders/12/releases/AppSuite-v4.2.0-x64-signed.msi',
					size: 180 * mib,
					mtime: refSec - 5 * 86400,
				},
				{
					id: 51022,
					path: '/bob/files/Downloads/AppSuite-v4.2.0-rc1-x64.msi',
					size: 180 * mib,
					mtime: refSec - 20 * 86400,
				},
			],
		},
		{
			id: 5103,
			hash: 'sha256-firmware-capsule',
			size: 32 * mib,
			acknowledged: false,
			files: [
				{
					id: 51031,
					path: '/firmware-vault/dell-r750/BIOS_R750_v2.1.4.cap',
					size: 32 * mib,
					mtime: refSec - 60 * 86400,
				},
				{
					id: 51032,
					path: '/carol/files/Downloads/BIOS_R750_v2.1.4.cap',
					size: 32 * mib,
					mtime: refSec - 40 * 86400,
				},
			],
		},
		{
			id: 5104,
			hash: 'sha256-apt-pkg-pool',
			size: 64 * mib,
			acknowledged: false,
			files: [
				{
					id: 51041,
					path: '/var/cache/apt/archives/python3-numpy_1.26.4_arm64.deb',
					size: 64 * mib,
					mtime: refSec - 3 * 86400,
				},
				{
					id: 51042,
					path: '/dave/files/Downloads/=SUM(1+1)-python3-numpy_1.26.4_arm64.deb',
					size: 64 * mib,
					mtime: refSec - 35 * 86400,
				},
			],
		},
		{
			id: 5105,
			hash: 'sha256-rpi-img-xz',
			size: 900 * mib,
			acknowledged: false,
			files: [
				{
					id: 51051,
					path: '/golden/arm/raspios-bookworm-arm64.img.xz',
					size: 900 * mib,
					mtime: refSec - 8 * 86400,
				},
				{
					id: 51052,
					path: '/eve/files/Desktop/raspios-bookworm-arm64.img.xz',
					size: 900 * mib,
					mtime: refSec - 25 * 86400,
				},
			],
		},
		{
			id: 5106,
			hash: 'sha256-non-installer-txt',
			size: 1024,
			acknowledged: false,
			files: [
				{ id: 51061, path: '/alice/files/notes/readme.txt', size: 1024, mtime: refSec - 1000 },
				{ id: 51062, path: '/bob/files/notes/readme.txt', size: 1024, mtime: refSec - 1000 },
			],
		},
	]
}

describe('Cycle 161: OS Installer, Firmware, Package Cache & ISO Distribution Repository Auditor', () => {
	test('classifies ISO, desktop installer, firmware, and package cache extensions accurately', () => {
		const mod = loadInstallerRepoModule()

		assert.equal(mod.classifyInstallerArtifact('/iso-repo/ubuntu-24.04.1-amd64.iso').family, 'os-iso-images')
		assert.equal(mod.classifyInstallerArtifact('/golden/raspios-arm64.img.xz').family, 'os-iso-images')
		assert.equal(mod.classifyInstallerArtifact('/golden/raspios-arm64.img.xz').extension, 'img.xz')
		assert.equal(mod.classifyInstallerArtifact('/downloads/Setup-x64.msi').family, 'desktop-installers')
		assert.equal(mod.classifyInstallerArtifact('/downloads/Slack.dmg').family, 'desktop-installers')
		assert.equal(mod.classifyInstallerArtifact('/downloads/Obsidian.AppImage').family, 'desktop-installers')
		assert.equal(mod.classifyInstallerArtifact('/firmware-vault/router-openwrt.bin').family, 'firmware-bios-blobs')
		assert.equal(mod.classifyInstallerArtifact('/firmware-vault/uefi-update.cap').family, 'firmware-bios-blobs')
		assert.equal(mod.classifyInstallerArtifact('/var/cache/apt/archives/curl_8.5.0_amd64.deb').family, 'package-repo-caches')
		assert.equal(mod.classifyInstallerArtifact('/repo/arch/linux-6.11.pkg.tar.zst').family, 'package-repo-caches')
		assert.equal(mod.classifyInstallerArtifact('/repo/arch/linux-6.11.pkg.tar.zst').extension, 'pkg.tar.zst')
		assert.equal(mod.classifyInstallerArtifact('/alice/files/data/random-weights.bin'), null)
		assert.equal(mod.classifyInstallerArtifact('/alice/files/notes/readme.txt'), null)
	})

	test('extracts architecture, version, release channel, and platform metadata', () => {
		const mod = loadInstallerRepoModule()

		const isoMeta = mod.extractArtifactMetadata('ubuntu-24.04.1-live-server-amd64.iso', '/iso-repo/ubuntu-24.04.1-live-server-amd64.iso', 'os-iso-images')
		assert.equal(isoMeta.arch, 'x86_64')
		assert.equal(isoMeta.version, '24.04.1')
		assert.equal(isoMeta.platform, 'linux')

		const rcMeta = mod.extractArtifactMetadata('AppSuite-v4.2.0-rc1-arm64.msi', '/downloads/AppSuite-v4.2.0-rc1-arm64.msi', 'desktop-installers')
		assert.equal(rcMeta.arch, 'arm64')
		assert.equal(rcMeta.version, '4.2.0')
		assert.equal(rcMeta.channel, 'rc-beta')
		assert.equal(rcMeta.isRcOrBeta, true)
		assert.equal(rcMeta.platform, 'windows')
	})

	test('shields golden repo copies under consolidate-repo and allows hardlink-mirror across repos', () => {
		const mod = loadInstallerRepoModule()
		const sample = buildSampleInstallerDuplicates()

		const consolidate = mod.analyzeInstallerRepoDuplicates(sample, {
			strategy: 'consolidate-repo',
			protectGoldenRepos: true,
			protectSignedArtifacts: true,
			protectFirmwareBlobs: true,
			referenceTimeSec: 1796000000,
		})

		assert.equal(consolidate.summary.totalClustersCount, 5)
		const isoCluster = consolidate.clusters.find(c => c.primaryGroupId === 5101)
		assert.ok(isoCluster)
		assert.equal(isoCluster.survivor.id, 51011)
		const pxeCopy = isoCluster.members.find(m => m.id === 51012)
		const downloadCopy = isoCluster.members.find(m => m.id === 51013)
		assert.equal(pxeCopy.verdict, 'blocked-golden-repo')
		assert.equal(pxeCopy.actionKind, 'shield')
		assert.equal(downloadCopy.verdict, 'reclaim-duplicate-copy')
		assert.equal(downloadCopy.actionKind, 'reclaim')

		const hardlink = mod.analyzeInstallerRepoDuplicates(sample, {
			strategy: 'hardlink-mirror',
			referenceTimeSec: 1796000000,
		})
		const hardlinkIso = hardlink.clusters.find(c => c.primaryGroupId === 5101)
		const hardlinkPxe = hardlinkIso.members.find(m => m.id === 51012)
		assert.equal(hardlinkPxe.verdict, 'hardlink-repo-mirror')
		assert.equal(hardlinkPxe.actionKind, 'hardlink')
	})

	test('generates POSIX DRY_RUN=1 script, .sync-exclude.lst, CWE-1236 CSV, and JSON manifest', () => {
		const mod = loadInstallerRepoModule()
		const sample = buildSampleInstallerDuplicates()
		const analysis = mod.analyzeInstallerRepoDuplicates(sample, {
			strategy: 'consolidate-repo',
			referenceTimeSec: 1796000000,
		})

		const script = mod.buildInstallerRepoScript(analysis, { dataRoot: '/srv/nc/data' })
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes('VERIFY_SHA256="${VERIFY_SHA256:-1}"'))
		assert.ok(script.includes("DATA_ROOT='/srv/nc/data'"))
		assert.ok(script.includes("'\\''26'\\''"))
		assert.ok(script.includes('php occ files:scan --path='))

		const syncExclude = mod.buildInstallerSyncExcludeSnippet(analysis)
		assert.ok(syncExclude.includes('*.iso'))
		assert.ok(syncExclude.includes('*.img.xz'))

		const csv = mod.buildInstallerRepoCsvReport(analysis)
		assert.ok(csv.includes('Cluster Key,Artifact Name,Extension'))
		assert.equal(csv.includes(',=SUM('), false, 'CWE-1236 formula must be neutralized')
		assert.ok(csv.includes("'=SUM(") || csv.includes('"\'=SUM(') || csv.includes("/Downloads/'=SUM(") || csv.includes('/Downloads/=SUM('))

		const jsonStr = mod.buildInstallerRepoJsonReport(analysis, '2026-11-24T05:30:00Z')
		const parsed = JSON.parse(jsonStr)
		assert.equal(parsed.schema, mod.INSTALLER_REPO_SCHEMA)
		assert.equal(parsed.generatedAt, '2026-11-24T05:30:00Z')
		assert.equal(parsed.clusters.length, 5)
	})

	test('neutralizes CWE-1236 leading formula payloads in CSV path cells', () => {
		const mod = loadInstallerRepoModule()
		const formulaDuplicates = [
			{
				id: 5201,
				hash: 'sha256-cwe1236',
				size: 1024 * 1024,
				files: [
					{ id: 52011, path: '=HYPERLINK("http://evil.example","ok")/setup.msi', size: 1024 * 1024, mtime: 1796000000 },
					{ id: 52012, path: '/golden/setup.msi', size: 1024 * 1024, mtime: 1796000000 },
				],
			},
		]
		const analysis = mod.analyzeInstallerRepoDuplicates(formulaDuplicates, { referenceTimeSec: 1796000000 })
		const csv = mod.buildInstallerRepoCsvReport(analysis)
		const lines = csv.split('\r\n')
		assert.ok(lines.some(line => line.includes("'=HYPERLINK")))
	})

	test('InstallerRepoWorkbench.vue handles empty state, presets, unclamped numeric inputs, and script copy', async () => {
		let copiedText = ''
		const Workbench = loadInstallerRepoWorkbench({
			writeText: async text => {
				copiedText = text
			},
		})

		const emptyVm = new Vue({
			render: h => h(Workbench, { props: { duplicates: [], allDuplicates: [] } }),
		}).$mount()
		await settle()
		assert.ok(emptyVm.$el.textContent.includes('No duplicate scan dataset loaded yet'))
		emptyVm.$destroy()

		const sample = buildSampleInstallerDuplicates()
		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: sample,
					allDuplicates: sample,
					currentDuplicateId: 5103,
				},
			}),
		}).$mount()
		await settle()

		const comp = vm.$children[0]
		assert.equal(comp.selectedCluster.primaryGroupId, 5103)

		// Unclamped numeric inputs must keep raw text mid-keystroke
		const numInputs = vm.$el.querySelectorAll('.irw__num-input')
		assert.equal(numInputs.length, 2)
		numInputs[0].value = ''
		numInputs[0].dispatchEvent(new window.Event('input'))
		await settle()
		assert.equal(comp.staleDownloadDaysInput, '')

		comp.applyPreset('iso-pxe-hardlink')
		await settle()
		assert.equal(comp.familyFilter, 'os-iso-images')
		assert.equal(comp.strategy, 'hardlink-mirror')
		assert.equal(comp.analysis.summary.totalClustersCount, 2)

		await comp.copyRemediationScript()
		await settle()
		assert.ok(copiedText.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(vm.$el.querySelector('.irw__notice.is-success'))

		vm.$destroy()
	})

	test('App.vue wires topbar Installers & ISOs button and _ shortcut cleanly', async () => {
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
		const InstallerWorkbench = loadInstallerRepoWorkbench()
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
			'./components/InstallerRepoWorkbench.vue': { __esModule: true, default: InstallerWorkbench },
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
					entities: status === 'acknowledged' ? [] : buildSampleInstallerDuplicates(),
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

		const topbarBtn = vm.$el.querySelector('.topbar-installer-repo-button')
		assert.ok(topbarBtn, 'Topbar Installers & ISOs button must exist')

		const action = keyboardShortcuts.resolveShortcutAction({ key: '_', shiftKey: true, target: vm.$el })
		assert.equal(action, 'toggle-installer-repo-auditor')

		topbarBtn.click()
		await settle()
		assert.ok(vm.$el.querySelector('.installer-repo-workbench'), 'InstallerRepoWorkbench must mount on click')

		window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '_', shiftKey: true, bubbles: true }))
		await settle()
		assert.equal(vm.$el.querySelector('.installer-repo-workbench'), null, 'InstallerRepoWorkbench must toggle closed on _ shortcut')

		vm.$destroy()
	})

	test('keeps zero U+2013/U+2014 typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/installerRepoAuditor.js',
			'src/components/InstallerRepoWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
		]
		for (const relPath of files) {
			const content = readFileSync(resolve(__dirname, '../..', relPath), 'utf8')
			assert.equal(content.includes('\u2013'), false, `Unexpected U+2013 in ${relPath}`)
			assert.equal(content.includes('\u2014'), false, `Unexpected U+2014 in ${relPath}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `Unexpected XSS sink in ${relPath}`)
		}
		const vueContent = readFileSync(resolve(__dirname, '../..', 'src/components/InstallerRepoWorkbench.vue'), 'utf8')
		assert.ok(vueContent.includes('min-block-size: 44px'))
		assert.ok(vueContent.includes(':focus-visible'))
	})
})
