const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window } = require('./helpers.cjs')

function loadBrandKitModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/brandKitAssetAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function loadBrandKitWorkbench(clipboardImpl) {
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js')
	const brandKitAuditor = loadBrandKitModule()
	return loadComponent('src/components/BrandKitAuditorWorkbench.vue', {
		'../tools/clipboardHelper': clipboardImpl === undefined
			? clipboardHelper
			: { copyTextSafely: text => clipboardHelper.copyTextSafely(text, clipboardImpl) },
		'../tools/brandKitAssetAuditor': brandKitAuditor,
	})
}

function buildSampleBrandDuplicates() {
	const mib = 1024 * 1024
	const baseSec = 1796000000
	return [
		{
			id: 3101,
			hash: 'sha256-font-acme-otf',
			size: 2 * mib,
			acknowledged: false,
			files: [
				{
					id: 31011,
					path: '/Clients/Beta/Campaign/Document fonts/AcmeSans-Bold.otf',
					size: 2 * mib,
					mtime: baseSec - 3600,
				},
				{
					id: 31012,
					path: '/Brand-Kit/Typography/Foundry/AcmeSans-Bold.otf',
					size: 2 * mib,
					mtime: baseSec - 86400,
				},
				{
					id: 31013,
					path: '/Marketing/Exports/Social \'2026\'/AcmeSans-Bold.otf',
					size: 2 * mib,
					mtime: baseSec,
				},
				{
					id: 31014,
					path: '/Archive/Commercial-Fonts/AcmeSans-Bold.otf',
					size: 2 * mib,
					mtime: baseSec - 7200,
				},
			],
		},
		{
			id: 3102,
			hash: 'sha256-font-acme-woff2',
			size: 1 * mib,
			acknowledged: false,
			files: [
				{
					id: 31021,
					path: '/Brand-Kit/Typography/Web/AcmeSans-Bold.woff2',
					size: 1 * mib,
					mtime: baseSec - 7200,
				},
				{
					id: 31022,
					path: '/Web/Staging/fonts/AcmeSans-Bold.woff2',
					size: 1 * mib,
					mtime: baseSec,
				},
			],
		},
		{
			id: 3103,
			hash: 'sha256-logo-primary-svg',
			size: 512 * 1024,
			acknowledged: false,
			files: [
				{
					id: 31031,
					path: '/Brand/Identity/Logo-Primary.svg',
					size: 512 * 1024,
					mtime: baseSec - 172800,
				},
				{
					id: 31032,
					path: '/Campaigns/Q4-Launch/Logo-Primary.svg',
					size: 512 * 1024,
					mtime: baseSec - 1800,
				},
				{
					id: 31033,
					path: '/Design-System/Logos/Logo-Primary.svg',
					size: 512 * 1024,
					mtime: baseSec - 86400,
				},
			],
		},
		{
			id: 3104,
			hash: 'sha256-hero-banner-psd',
			size: 64 * mib,
			acknowledged: false,
			files: [
				{
					id: 31041,
					path: '/01_Masters/Hero/Hero-Banner.psd',
					size: 64 * mib,
					mtime: baseSec - 20000,
				},
				{
					id: 31042,
					path: '/Exports/Client-Review/Hero-Banner.psd',
					size: 64 * mib,
					mtime: baseSec,
				},
			],
		},
		{
			id: 3105,
			hash: 'sha256-brand-tokens-json',
			size: 128 * 1024,
			acknowledged: false,
			files: [
				{
					id: 31051,
					path: '/Design-System/Tokens/acme.tokens.json',
					size: 128 * 1024,
					mtime: baseSec - 9000,
				},
				{
					id: 31052,
					path: '/Tmp/Copy/acme.tokens.json',
					size: 128 * 1024,
					mtime: baseSec,
				},
			],
		},
		{
			id: 3106,
			hash: 'sha256-intro-lottie',
			size: 4 * mib,
			acknowledged: false,
			files: [
				{
					id: 31061,
					path: '/Brand-Kit/Motion/Intro-Reveal.bodymovin.json',
					size: 4 * mib,
					mtime: baseSec - 5000,
				},
				{
					id: 31062,
					path: '/Social/Drafts/Intro-Reveal.bodymovin.json',
					size: 4 * mib,
					mtime: baseSec,
				},
			],
		},
		{
			id: 3107,
			hash: 'sha256-formula-risk',
			size: 2 * mib,
			acknowledged: false,
			files: [
				{
					id: 31071,
					path: '/Brand/Vectors/=CMD()logo.ai',
					size: 2 * mib,
					mtime: baseSec - 1000,
				},
				{
					id: 31072,
					path: '/Downloads/+export-logo.ai',
					size: 2 * mib,
					mtime: baseSec,
				},
			],
		},
		{
			id: 3108,
			hash: 'sha256-unrelated-doc',
			size: 1024,
			acknowledged: false,
			files: [
				{ id: 31081, path: '/Docs/readme.txt', size: 1024, mtime: baseSec },
				{ id: 31082, path: '/Backup/readme.txt', size: 1024, mtime: baseSec },
			],
		},
	]
}

describe('BrandKitAssetAuditor & BrandKitAuditorWorkbench', () => {
	test('extracts compound brand extensions and classifies asset specs accurately', () => {
		const mod = loadBrandKitModule()
		assert.equal(mod.extractBrandAssetExtension('/Design-System/acme.tokens.json'), 'tokens.json')
		assert.equal(mod.extractBrandAssetExtension('/Motion/intro.bodymovin.json'), 'bodymovin.json')
		assert.equal(mod.extractBrandAssetExtension('/Fonts/Inter-Bold.OTF'), 'otf')
		assert.equal(mod.extractBrandAssetExtension('/Logos/mark.svg'), 'svg')

		const desc = mod.parseBrandAssetDescriptor('/Brand/Logo-Primary@2x.png')
		assert.equal(desc.normalizedStem, 'logo-primary')
		assert.equal(mod.findBrandAssetSpec('otf', 'inter.otf').family, 'typography-fonts')
		assert.equal(mod.findBrandAssetSpec('svg', 'mark.svg').family, 'vector-identity')
		assert.equal(mod.findBrandAssetSpec('psd', 'hero.psd').family, 'layered-design')
		assert.equal(mod.findBrandAssetSpec('aep', 'spot.aep').family, 'motion-templates')
		assert.equal(mod.findBrandAssetSpec('txt', 'readme.txt'), null)
	})

	test('protects foundry licenses, canonical brand anchors, and package folders in purge mode while allowing hardlink consolidation', () => {
		const mod = loadBrandKitModule()
		const sample = buildSampleBrandDuplicates()
		const inventory = [
			{ path: '/Brand-Kit/Typography/Foundry/EULA.pdf', size: 42000 },
			{ path: '/Brand-Kit/Typography/Foundry/AcmeSans-Bold.woff2', size: 320000 },
			{ path: '/Campaigns/Q4-Launch/Logo-Primary.png', size: 220000 },
			{ path: '/Campaigns/Q4-Launch/Logo-Primary@2x.png', size: 450000 },
		]

		const purgeAnalysis = mod.analyzeBrandKitAssets(sample, {
			strategy: 'consolidate-purge',
			protectFoundryLicenses: true,
			protectBrandCanonical: true,
			protectDerivedLineage: true,
			companionInventory: inventory,
		})

		assert.equal(purgeAnalysis.summary.totalKitsCount, 7)
		const fontKit = purgeAnalysis.kits.find(k => k.primaryGroupId === 3101)
		assert.ok(fontKit)
		assert.equal(fontKit.survivor.normalizedPath, '/Brand-Kit/Typography/Foundry/AcmeSans-Bold.otf')
		assert.equal(fontKit.hasFoundryLicense, true)
		const docFontsCopy = fontKit.members.find(m => m.normalizedPath === '/Clients/Beta/Campaign/Document fonts/AcmeSans-Bold.otf')
		const commercialBackupCopy = fontKit.members.find(m => m.normalizedPath === '/Archive/Commercial-Fonts/AcmeSans-Bold.otf')
		const marketingExportCopy = fontKit.members.find(m => m.normalizedPath.startsWith('/Marketing/Exports/'))
		assert.equal(docFontsCopy.verdict, 'blocked-lineage-anchor')
		assert.equal(commercialBackupCopy.verdict, 'blocked-foundry-license')
		assert.equal(marketingExportCopy.verdict, 'reclaim-duplicate-copy')

		const logoKit = purgeAnalysis.kits.find(k => k.primaryGroupId === 3103)
		assert.ok(logoKit)
		const designSysCopy = logoKit.members.find(m => m.normalizedPath === '/Design-System/Logos/Logo-Primary.svg')
		const campaignCopy = logoKit.members.find(m => m.normalizedPath === '/Campaigns/Q4-Launch/Logo-Primary.svg')
		assert.equal(designSysCopy.verdict, 'blocked-brand-canonical')
		assert.equal(campaignCopy.verdict, 'blocked-lineage-anchor')
		assert.equal(campaignCopy.context.derivedExportCount, 2)

		// Hardlink mode safely deduplicates across package folders, foundry folders, and canonical mirrors
		const hardlinkAnalysis = mod.analyzeBrandKitAssets(sample, {
			strategy: 'hardlink-preserve',
			protectFoundryLicenses: true,
			protectBrandCanonical: true,
			protectDerivedLineage: true,
			companionInventory: inventory,
		})
		const hardlinkFontKit = hardlinkAnalysis.kits.find(k => k.primaryGroupId === 3101)
		assert.equal(hardlinkFontKit.reclaimableCopiesCount, 3)
		assert.ok(hardlinkFontKit.members.filter(m => m.role === 'copy').every(m => m.verdict === 'hardlink-master-candidate'))
	})

	test('emits POSIX single-quoted DRY_RUN=1 scripts, CWE-1236 CSV, and JSON manifest', () => {
		const mod = loadBrandKitModule()
		const sample = buildSampleBrandDuplicates()
		const analysis = mod.analyzeBrandKitAssets(sample, {
			strategy: 'hardlink-preserve',
		})

		const script = mod.buildBrandKitScript(analysis, {
			dataRoot: '/srv/nextcloud/data',
		})
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes("'/Marketing/Exports/Social '\\''2026'\\''/AcmeSans-Bold.otf'"))
		assert.ok(script.includes('stat -c %d'))
		assert.ok(script.includes('occ files:scan --path='))

		const csv = mod.buildBrandKitCsvReport(analysis)
		assert.ok(csv.includes('"\'=CMD()logo.ai"') || csv.includes("'=CMD()"))
		assert.ok(!csv.includes(',=CMD()'))
		assert.ok(!csv.includes(',+export-logo.ai'))

		const json = JSON.parse(mod.buildBrandKitJsonReport(analysis, '2026-11-24T03:00:00Z'))
		assert.equal(json.schema, mod.BRAND_KIT_SCHEMA)
		assert.equal(json.kits.length, 7)
	})

	test('BrandKitAuditorWorkbench.vue renders empty, populated, unclamped numeric input, preset filter, and overrides', async () => {
		let copiedText = ''
		const Workbench = loadBrandKitWorkbench({
			writeText: async text => {
				copiedText = text
			},
		})

		const emptyVm = new Vue({
			render: h => h(Workbench, {
				props: { duplicates: [], allDuplicates: [] },
			}),
		}).$mount()
		await settle()
		assert.ok(emptyVm.$el.querySelector('.bkw__empty-banner'))
		emptyVm.$destroy()

		const sample = buildSampleBrandDuplicates()
		const vm = new Vue({
			render: h => h(Workbench, {
				props: { duplicates: sample, allDuplicates: sample, currentDuplicateId: 3104 },
			}),
		}).$mount()
		await settle()

		assert.equal(vm.$el.querySelectorAll('.bkw__kit-item').length, 7)

		// Unclamped numeric input mid-keystroke
		const numInput = vm.$el.querySelector('.bkw__num-input')
		numInput.value = ''
		numInput.dispatchEvent(new window.Event('input'))
		await settle()
		assert.equal(numInput.value, '')

		numInput.value = '999999'
		numInput.dispatchEvent(new window.Event('input'))
		await settle()
		assert.equal(numInput.value, '999999')
		assert.ok(vm.$el.querySelector('.bkw__empty-banner'))

		numInput.value = '0'
		numInput.dispatchEvent(new window.Event('input'))
		await settle()
		assert.equal(vm.$el.querySelectorAll('.bkw__kit-item').length, 7)

		// Switch preset to Foundry & Webfonts
		const fontPresetBtn = Array.from(vm.$el.querySelectorAll('.bkw__seg-btn'))
			.find(btn => btn.textContent.includes('Foundry & Webfonts'))
		assert.ok(fontPresetBtn)
		fontPresetBtn.click()
		await settle()
		assert.equal(vm.$el.querySelectorAll('.bkw__kit-item').length, 2)

		// Copy DRY_RUN=1 script
		const copyBtn = Array.from(vm.$el.querySelectorAll('.bkw__tool-btn'))
			.find(btn => btn.textContent.includes('Copy DRY_RUN=1 Script'))
		assert.ok(copyBtn)
		copyBtn.click()
		await settle()
		assert.ok(copiedText.includes('DRY_RUN="${DRY_RUN:-1}"'))

		// Override kit to Shield Kit
		const shieldBtn = Array.from(vm.$el.querySelectorAll('.bkw__override-bar .bkw__seg-btn'))
			.find(btn => btn.textContent.includes('Shield Kit'))
		assert.ok(shieldBtn)
		shieldBtn.click()
		await settle()
		assert.ok(vm.$el.textContent.includes('Kit Shielded'))

		vm.$destroy()
	})

	test('App.vue wires : shortcut and BrandKitAuditorWorkbench cleanly', async () => {
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
		const BrandWorkbench = loadBrandKitWorkbench()
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
			'./components/DevTreeReclaimerWorkbench.vue': { __esModule: true, default: stub('dev-tree') },
			'./components/ConflictStormWorkbench.vue': { __esModule: true, default: stub('conflict-storm') },
			'./components/VmCowReflinkWorkbench.vue': { __esModule: true, default: stub('vm-cow') },
			'./components/ScientificBundleWorkbench.vue': { __esModule: true, default: stub('scientific-bundle') },
			'./components/BrandKitAuditorWorkbench.vue': { __esModule: true, default: BrandWorkbench },
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
					entities: status === 'acknowledged' ? [] : buildSampleBrandDuplicates(),
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

		const topbarBtn = vm.$el.querySelector('.topbar-brand-kit-button')
		assert.ok(topbarBtn, 'Topbar Brand Kit button must exist')

		const action = keyboardShortcuts.resolveShortcutAction({ key: ':', shiftKey: false, target: vm.$el })
		assert.equal(action, 'toggle-brand-kit-auditor')

		topbarBtn.click()
		await settle()
		assert.ok(vm.$el.querySelector('.brand-kit-workbench'), 'BrandKitAuditorWorkbench must mount on click')

		window.dispatchEvent(new window.KeyboardEvent('keydown', { key: ':', shiftKey: true, bubbles: true }))
		await settle()
		assert.equal(vm.$el.querySelector('.brand-kit-workbench'), null, 'BrandKitAuditorWorkbench must toggle closed on : shortcut')

		vm.$destroy()
	})

	test('keeps zero U+2013/U+2014 typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/brandKitAssetAuditor.js',
			'src/components/BrandKitAuditorWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
		]
		for (const relPath of files) {
			const content = readFileSync(resolve(__dirname, '../..', relPath), 'utf8')
			assert.equal(content.includes('\u2013'), false, `Unexpected U+2013 in ${relPath}`)
			assert.equal(content.includes('\u2014'), false, `Unexpected U+2014 in ${relPath}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `Unexpected XSS sink in ${relPath}`)
		}
		const vueContent = readFileSync(resolve(__dirname, '../..', 'src/components/BrandKitAuditorWorkbench.vue'), 'utf8')
		assert.ok(vueContent.includes('min-block-size: 44px'))
		assert.ok(vueContent.includes(':focus-visible'))
	})
})
