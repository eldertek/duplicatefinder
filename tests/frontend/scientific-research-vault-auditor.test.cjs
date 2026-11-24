const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window, document } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

/**
 * Load the pure Academic Research, LaTeX/BibTeX & Scientific Dataset Vault auditor module for tests.
 *
 * @return {object} Loaded module exports.
 */
function loadScientificResearchModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/scientificResearchVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

/**
 * Load ScientificResearchVaultWorkbench.vue with optional clipboard stub.
 *
 * @param {object} [clipboardImpl] Optional clipboard implementation.
 * @return {object} Vue component definition.
 */
function loadScientificResearchWorkbench(clipboardImpl) {
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js')
	const scientificResearchVaultAuditor = loadScientificResearchModule()
	return loadComponent('src/components/ScientificResearchVaultWorkbench.vue', {
		'../tools/clipboardHelper': clipboardImpl === undefined
			? clipboardHelper
			: { copyTextSafely: text => clipboardHelper.copyTextSafely(text, clipboardImpl) },
		'../tools/scientificResearchVaultAuditor': scientificResearchVaultAuditor,
	})
}

/**
 * Build synthetic duplicate clusters covering all 4 Academic Research & Scientific Dataset Vault families.
 *
 * @return {Array<object>} Sample duplicate groups.
 */
function buildSampleResearchDuplicates() {
	const mib = 1024 * 1024
	const refSec = 1796600000
	return [
		{
			id: 9981,
			hash: 'sha256-latex-canonical-manuscript',
			size: 18 * mib,
			acknowledged: false,
			files: [
				{
					id: 99811,
					path: '/research-vault/Papers/QuantumOptics/main_v3.tex',
					size: 18 * mib,
					mtime: refSec - 2 * 86400,
				},
				{
					id: 99812,
					path: '/canonical/Papers/QuantumOptics/main_v3.tex',
					size: 18 * mib,
					mtime: refSec - 2 * 86400,
				},
				{
					id: 99813,
					path: '/alice/files/Downloads/QuantumOptics/main_v3.tex',
					size: 18 * mib,
					mtime: refSec - 1 * 86400,
				},
			],
		},
		{
			id: 9982,
			hash: 'sha256-bibtex-canonical-refs',
			size: 4 * mib,
			acknowledged: false,
			files: [
				{
					id: 99821,
					path: '/research-vault/Papers/QuantumOptics/references.bib',
					size: 4 * mib,
					mtime: refSec - 3 * 86400,
				},
				{
					id: 99822,
					path: '/masters/Papers/QuantumOptics/references.bib',
					size: 4 * mib,
					mtime: refSec - 3 * 86400,
				},
			],
		},
		{
			id: 9983,
			hash: 'sha256-hdf5-raw-dataset-master',
			size: 920 * mib,
			acknowledged: false,
			files: [
				{
					id: 99831,
					path: '/research-vault/Datasets/ClimateCMIP6/ocean_flux_run4.hdf5',
					size: 920 * mib,
					mtime: refSec - 5 * 86400,
				},
				{
					id: 99832,
					path: '/raw-datasets/ClimateCMIP6/ocean_flux_run4.hdf5',
					size: 920 * mib,
					mtime: refSec - 5 * 86400,
				},
				{
					id: 99833,
					path: '/Downloads/ClimateCMIP6/ocean_flux_run4.hdf5',
					size: 920 * mib,
					mtime: refSec - 4 * 86400,
				},
			],
		},
		{
			id: 9984,
			hash: 'sha256-jupyter-notebook-guard',
			size: 42 * mib,
			acknowledged: false,
			files: [
				{
					id: 99841,
					path: '/research-vault/Experiments/NeuralScaling/ablation_analysis.ipynb',
					size: 42 * mib,
					mtime: refSec - 3 * 86400,
				},
				{
					id: 99842,
					path: '/canonical/Experiments/NeuralScaling/ablation_analysis.ipynb',
					size: 42 * mib,
					mtime: refSec - 3 * 86400,
				},
			],
		},
		{
			id: 9985,
			hash: 'sha256-latex-synctex-build-artifact',
			size: 85 * mib,
			acknowledged: false,
			files: [
				{
					id: 99851,
					path: '/research-vault/Papers/QuantumOptics/main.synctex.gz',
					size: 85 * mib,
					mtime: refSec - 28 * 86400,
				},
				{
					id: 99852,
					path: '/research-vault/Papers/QuantumOptics/build/main.synctex.gz',
					size: 85 * mib,
					mtime: refSec - 30 * 86400,
				},
				{
					id: 99853,
					path: '/Downloads/QuantumOptics/main.synctex.gz',
					size: 85 * mib,
					mtime: refSec - 32 * 86400,
				},
			],
		},
		{
			id: 9986,
			hash: 'sha256-ipynb-checkpoint-mirror',
			size: 64 * mib,
			acknowledged: false,
			files: [
				{
					id: 99861,
					path: '/research-vault/Experiments/NeuralScaling/.ipynb_checkpoints/ablation_analysis-checkpoint.ipynb',
					size: 64 * mib,
					mtime: refSec - 25 * 86400,
				},
				{
					id: 99862,
					path: '/Downloads/NeuralScaling/.ipynb_checkpoints/ablation_analysis-checkpoint.ipynb',
					size: 64 * mib,
					mtime: refSec - 26 * 86400,
				},
			],
		},
		{
			id: 9987,
			hash: 'sha256-formula-injection-csv-dataset',
			size: 30 * mib,
			acknowledged: false,
			files: [
				{
					id: 99871,
					path: '=cmd|calc/research-vault/Datasets/Spectroscopy/peaks.csv',
					size: 30 * mib,
					mtime: refSec - 12 * 86400,
				},
				{
					id: 99872,
					path: '=cmd|calc/Downloads/Spectroscopy/peaks.csv',
					size: 30 * mib,
					mtime: refSec - 11 * 86400,
				},
			],
		},
	]
}

describe('Cycle 181: Academic Research, LaTeX/BibTeX & Scientific Dataset Vault Auditor', () => {
	test('classifies all 4 academic/scientific research families and extracts paper/experiment + dataset signature deterministically', () => {
		const mod = loadScientificResearchModule()

		const tex = mod.classifyScientificResearchFile({ path: '/research-vault/Papers/QuantumOptics/main_v3.tex' })
		assert.equal(tex.family, 'manuscripts-bibliography')
		assert.equal(tex.paperExperiment, 'quantumoptics')
		assert.equal(tex.isCanonicalMaster, true)
		assert.equal(tex.revisionNumber, 3)

		const bib = mod.classifyScientificResearchFile({ path: '/research-vault/Papers/QuantumOptics/references.bib' })
		assert.equal(bib.family, 'manuscripts-bibliography')
		assert.equal(bib.isCanonicalMaster, true)

		const preprint = mod.classifyScientificResearchFile({ path: '/research-vault/Papers/QuantumOptics/arxiv_preprint_v2.pdf' })
		assert.equal(preprint.family, 'manuscripts-bibliography')

		const hdf5 = mod.classifyScientificResearchFile({ path: '/research-vault/Datasets/ClimateCMIP6/ocean_flux_run4.hdf5' })
		assert.equal(hdf5.family, 'scientific-datasets-notebooks')
		assert.equal(hdf5.paperExperiment, 'climatecmip6')
		assert.equal(hdf5.isCanonicalMaster, true)

		const netcdf = mod.classifyScientificResearchFile({ path: '/raw-datasets/ClimateCMIP6/era5_temp.nc' })
		assert.equal(netcdf.family, 'scientific-datasets-notebooks')
		assert.equal(netcdf.isCanonicalMaster, true)

		const fits = mod.classifyScientificResearchFile({ path: '/research-vault/Datasets/Exoplanets/jwst_cube.fits' })
		assert.equal(fits.family, 'scientific-datasets-notebooks')
		assert.equal(fits.researchTool, 'Astropy / FITS')

		const synctex = mod.classifyScientificResearchFile({ path: '/research-vault/Papers/QuantumOptics/main.synctex.gz' })
		assert.equal(synctex.family, 'latex-build-artifacts')
		assert.equal(synctex.datasetSignature, 'main')

		const latexmk = mod.classifyScientificResearchFile({ path: '/research-vault/Papers/QuantumOptics/main.fdb_latexmk' })
		assert.equal(latexmk.family, 'latex-build-artifacts')

		const checkpoint = mod.classifyScientificResearchFile({ path: '/research-vault/Experiments/NeuralScaling/.ipynb_checkpoints/ablation_analysis-checkpoint.ipynb' })
		assert.equal(checkpoint.family, 'figure-checkpoint-mirrors')
		assert.equal(checkpoint.isCheckpointMirror, true)
		assert.equal(checkpoint.datasetSignature, 'ablation-analysis')

		const plotPng = mod.classifyScientificResearchFile({ path: '/research-vault/Papers/QuantumOptics/figures/fig02_spectrum_plot.png' })
		assert.equal(plotPng.family, 'figure-checkpoint-mirrors')

		const epsFig = mod.classifyScientificResearchFile({ path: '/research-vault/Papers/QuantumOptics/figures/architecture.eps' })
		assert.equal(epsFig.family, 'figure-checkpoint-mirrors')

		const unrelated = mod.classifyScientificResearchFile({ path: '/Photos/vacation_2026.jpg' })
		assert.equal(unrelated, null)
	})

	test('shields canonical .tex/.bib/HDF5/NetCDF masters and active .ipynb notebooks by default', () => {
		const mod = loadScientificResearchModule()
		const report = mod.analyzeScientificResearchVault(buildSampleResearchDuplicates())

		assert.equal(report.schema, mod.SCIENTIFIC_RESEARCH_VAULT_SCHEMA)
		assert.equal(report.summary.totalClustersCount, 7)
		assert.equal(report.summary.totalCanonicalMasterClusters, 3)
		assert.equal(report.summary.totalNotebookGuardClusters, 1)
		assert.ok(report.summary.totalReclaimableBytes > 0)
		assert.match(report.summary.reclaimableGb, /^\d+\.\d{2} GB$/)

		// Canonical .tex: both vault copies shielded, only Downloads copy reclaimed
		const texCluster = report.clusters.find(c => c.primaryGroupId === 9981)
		assert.ok(texCluster)
		const vaultTex = texCluster.members.filter(m => m.meta.isCanonicalMaster)
		const dlTex = texCluster.members.find(m => m.path.includes('/Downloads/'))
		assert.equal(vaultTex.length, 2)
		assert.equal(vaultTex[0].verdict, 'keep-canonical-survivor')
		assert.equal(vaultTex[1].verdict, 'blocked-canonical-master')
		assert.equal(vaultTex[1].actionType, 'keep')
		assert.equal(dlTex.actionType, 'prune')

		// Canonical .bib in research-vault & masters: both shielded by default
		const bibCluster = report.clusters.find(c => c.primaryGroupId === 9982)
		assert.ok(bibCluster)
		assert.equal(bibCluster.reclaimableCopiesCount, 0)
		assert.equal(bibCluster.riskState, 'canonical-master-protected')

		// Canonical .ipynb notebook guard: both canonical copies shielded by default
		const nbCluster = report.clusters.find(c => c.primaryGroupId === 9984)
		assert.ok(nbCluster)
		assert.equal(nbCluster.hasCanonicalNotebook, true)
		assert.equal(nbCluster.reclaimableCopiesCount, 0)
		assert.equal(nbCluster.riskState, 'notebook-protected')
		assert.equal(nbCluster.members[1].verdict, 'blocked-canonical-notebook')

		// Stale .synctex.gz build artifacts are reclaimable
		const buildCluster = report.clusters.find(c => c.primaryGroupId === 9985)
		assert.ok(buildCluster)
		assert.equal(buildCluster.reclaimableCopiesCount, 2)
	})

	test('generates safe POSIX DRY_RUN=1 script, CWE-1236 CSV, JSON manifest, and .sync-exclude.lst rules', () => {
		const mod = loadScientificResearchModule()
		const analysis = mod.analyzeScientificResearchVault(buildSampleResearchDuplicates(), {
			strategy: 'consolidate-research-vault-hardlinks',
		})

		const script = mod.buildScientificResearchRemediationScript(analysis, { dataRoot: '/srv/nextcloud/data' })
		assert.ok(script.startsWith('#!/usr/bin/env sh'))
		assert.ok(script.includes('set -eu'))
		assert.ok(script.includes('DRY_RUN="$' + '{DRY_RUN:-1}"'))
		assert.ok(script.includes('ln -f '))

		const csv = mod.buildScientificResearchCsvReport(analysis)
		assert.ok(csv.includes('PaperExperiment,DatasetSignature,ResearchTool'))
		// CWE-1236 neutralization for leading '=' formula injection
		assert.ok(csv.includes("'=cmd|calc/"), 'CSV must neutralize leading = with single quote')

		const jsonStr = mod.buildScientificResearchJsonReport(analysis)
		const parsed = JSON.parse(jsonStr)
		assert.equal(parsed.schema, mod.SCIENTIFIC_RESEARCH_VAULT_SCHEMA)
		assert.equal(parsed.clusters.length, 7)

		const syncExclude = mod.buildScientificResearchSyncExcludeSnippet(analysis)
		assert.ok(syncExclude.includes('*.aux'))
		assert.ok(syncExclude.includes('*.fdb_latexmk'))
		assert.ok(syncExclude.includes('*.synctex.gz'))
		assert.ok(syncExclude.includes('.ipynb_checkpoints/'))
	})

	test('ScientificResearchVaultWorkbench.vue renders clusters, applies presets, toggles guards, and copies script', async () => {
		const copied = []
		const Workbench = loadScientificResearchWorkbench({
			writeText: async text => {
				copied.push(text)
			},
		})
		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: buildSampleResearchDuplicates(),
					allDuplicates: buildSampleResearchDuplicates(),
				},
			}),
		}).$mount(mountNode)

		try {
			await settle()
			assert.equal(vm.$el.classList.contains('scientific-research-vault-workbench'), true)
			assert.equal(vm.$el.querySelectorAll('.srv__cluster-card').length, 7)

			// Apply LaTeX Build & Checkpoints preset
			const presetBtns = Array.from(vm.$el.querySelectorAll('.srv__seg-btn'))
			const buildPreset = presetBtns.find(b => b.textContent.includes('Prune LaTeX Build & Checkpoints'))
			assert.ok(buildPreset)
			buildPreset.click()
			await settle()
			assert.equal(vm.$el.querySelectorAll('.srv__cluster-card').length, 1)

			// Reset to All Research & Dataset Audit
			const allPreset = presetBtns.find(b => b.textContent.includes('All Research & Dataset Audit'))
			allPreset.click()
			await settle()
			assert.equal(vm.$el.querySelectorAll('.srv__cluster-card').length, 7)

			// Copy DRY_RUN=1 script
			const copyBtn = Array.from(vm.$el.querySelectorAll('.srv__tool-btn')).find(b => b.textContent.includes('Copy DRY_RUN=1 Script'))
			assert.ok(copyBtn)
			copyBtn.click()
			await settle()
			assert.equal(copied.length, 1)
			assert.ok(copied[0].includes('DRY_RUN="$' + '{DRY_RUN:-1}"'))
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('App.vue wires ScientificResearchVaultWorkbench with F8 shortcut cleanly', async () => {
		window.localStorage.clear()
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		const statsModule = loadModule('src/tools/duplicateStats.js')
		const ScientificResearchVaultWorkbench = loadScientificResearchWorkbench()

		const slotBox = tag => ({
			render(h) {
				return h(tag, this.$slots.default)
			},
		})
		const icon = slotBox('span')
		const stub = name => ({
			name,
			props: ['duplicate', 'projectId', 'show', 'isScanning'],
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
			'./components/DocumentLineageWorkbench.vue': { __esModule: true, default: stub('doc') },
			'./components/PhotoPerceptualWorkbench.vue': { __esModule: true, default: stub('photo') },
			'./components/BrokenMediaQuarantineWorkbench.vue': { __esModule: true, default: stub('broken') },
			'./components/RetentionAgeWorkbench.vue': { __esModule: true, default: stub('retention') },
			'./components/FilenameCollisionWorkbench.vue': { __esModule: true, default: stub('collision') },
			'./components/QuotaAttributionWorkbench.vue': { __esModule: true, default: stub('quota') },
			'./components/PreviewCacheWorkbench.vue': { __esModule: true, default: stub('preview') },
			'./components/ShareMountAuditorWorkbench.vue': { __esModule: true, default: stub('share') },
			'./components/BackupDriftWorkbench.vue': { __esModule: true, default: stub('backup') },
			'./components/AutomationRulebookWorkbench.vue': { __esModule: true, default: stub('auto') },
			'./components/MetadataConsolidationWorkbench.vue': { __esModule: true, default: stub('meta') },
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
			'./components/ReleaseBinaryArtifactWorkbench.vue': { __esModule: true, default: stub('release-binary-artifact-auditor') },
			'./components/EmailArchiveVaultWorkbench.vue': { __esModule: true, default: stub('email-archive-vault-auditor') },
			'./components/AudioDawVaultWorkbench.vue': { __esModule: true, default: stub('audio-daw-vault-auditor') },
			'./components/GisMapArchiveWorkbench.vue': { __esModule: true, default: stub('gis-map-archive-auditor') },
			'./components/ScientificResearchVaultWorkbench.vue': { __esModule: true, default: ScientificResearchVaultWorkbench },
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
					entities: type === 'unacknowledged' ? buildSampleResearchDuplicates() : [],
					pagination: { currentPage: 1, totalPages: 1, totalItems: 7, hasMore: false },
				}),
				fetchProjects: async () => [],
			},
			'@/tools/utils': utils,
			'@/tools/keyboardShortcuts': keyboardShortcuts,
			'@/tools/reclamationHistory': loadModule('src/tools/reclamationHistory.js', {
				'./duplicateFilters': loadModule('src/tools/duplicateFilters.js'),
				'./duplicateStats': statsModule,
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

			assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'F8', shiftKey: false }), 'toggle-scientific-research-vault-auditor')
			assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'F8', ctrlKey: true }), null)
			assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'F8', target: { tagName: 'INPUT' } }), null)

			const btn = vm.$el.querySelector('button.topbar-scientific-research-vault-button')
			assert.ok(btn, 'Research & Datasets button is rendered in topbar')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'F8')
			assert.equal(vm.$el.querySelector('.scientific-research-vault-workbench'), null)

			// F8 opens workbench
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F8', bubbles: true, cancelable: true }))
			await settle()
			assert.ok(vm.$el.querySelector('.scientific-research-vault-workbench'), 'ScientificResearchVaultWorkbench must open on F8 shortcut')

			// F8 again closes workbench
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F8', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.$el.querySelector('.scientific-research-vault-workbench'), null, 'ScientificResearchVaultWorkbench must toggle closed on F8 shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new Academic Research Vault files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/scientificResearchVaultAuditor.js',
			'src/components/ScientificResearchVaultWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
		]
		for (const rel of files) {
			const content = readFileSync(resolve(root, rel), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(content), false, `No U+2013/U+2014 in ${rel}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `No XSS sink in ${rel}`)
		}
	})
})
