const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window, document } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

/**
 * Load the pure Genomics, Bioinformatics & Scientific Sequencing Data Vault auditor module.
 *
 * @return {object} Loaded module exports.
 */
function loadGenomicsVaultModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateStats': duplicateStats,
	})
	return loadModule('src/tools/genomicsBioinformaticsVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

/**
 * Load GenomicsBioinformaticsVaultWorkbench Vue component with mocked clipboard helper.
 *
 * @param {Array<string>} [copiedPayloads] Array collecting copied strings.
 * @return {object} Loaded Vue component definition.
 */
function loadGenomicsVaultWorkbench(copiedPayloads = []) {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateStats': duplicateStats,
	})
	const genomicsBioinformaticsVaultAuditor = loadModule('src/tools/genomicsBioinformaticsVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
	return loadComponent('src/components/GenomicsBioinformaticsVaultWorkbench.vue', {
		'../tools/clipboardHelper': {
			copyTextSafely: async (text) => {
				copiedPayloads.push(text)
				return true
			},
		},
		'../tools/duplicateStats': duplicateStats,
		'../tools/genomicsBioinformaticsVaultAuditor': genomicsBioinformaticsVaultAuditor,
	})
}

/**
 * Build deterministic Genomics, Bioinformatics & Sequencing duplicate groups.
 *
 * @param {number} [nowMs] Reference epoch milliseconds.
 * @return {Array<object>} Sample duplicate groups.
 */
function buildSampleGenomicsDuplicates(nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)) {
	const twoDaysAgo = Math.floor((nowMs - 2 * 24 * 60 * 60 * 1000) / 1000)
	const thirtyDaysAgo = Math.floor((nowMs - 30 * 24 * 60 * 60 * 1000) / 1000)

	return [
		{
			id: 1971,
			hash: 'hash-raw-fastq-gz',
			acknowledged: false,
			files: [
				{
					id: 19711,
					path: '/Sequencing_Archive/00_Raw/CohortA/PT001_S1_L001_R1.fastq.gz',
					size: 1800 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19712,
					path: '/Pipelines/rnaseq/work/a4/9b1c2d3e4f/PT001_S1_L001_R1.fastq.gz',
					size: 1800 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1972,
			hash: 'hash-fq-gz-and-fasta',
			acknowledged: false,
			files: [
				{
					id: 19721,
					path: '/Genomics_Vault/Raw_Reads/CohortB/SAMPLE_02_R2.fq.gz',
					size: 920 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19722,
					path: '/Genomics_Vault/Backup_Mirror/CohortB/SAMPLE_02_R2.fq.gz',
					size: 920 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1973,
			hash: 'hash-reference-fasta',
			acknowledged: false,
			files: [
				{
					id: 19731,
					path: '/Genomics_Vault/Reference_Genomes/GRCh38.primary_assembly.fa',
					size: 3100 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19732,
					path: '/Pipelines/snakemake/.snakemake/shadow/GRCh38.primary_assembly.fa',
					size: 3100 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1974,
			hash: 'hash-cram-bam-anchors',
			acknowledged: false,
			files: [
				{
					id: 19741,
					path: '/Sequencing_Archive/CRAM_Archive/PT001.cram',
					size: 1250 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19742,
					path: '/Pipelines/snakemake/tmp/PT001.cram',
					size: 1250 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1975,
			hash: 'hash-bam-and-bai-index',
			acknowledged: false,
			files: [
				{
					id: 19751,
					path: '/Sequencing_Archive/Alignments/SAMPLE_02.bam',
					size: 2400 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19752,
					path: '/Pipelines/rnaseq/work/b1/c2d3e4f5a6/SAMPLE_02.bam',
					size: 2400 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1976,
			hash: 'hash-bai-crai-indexes',
			acknowledged: false,
			files: [
				{
					id: 19761,
					path: '/Sequencing_Archive/Alignments/SAMPLE_02.bam.bai',
					size: 12 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19762,
					path: '/Sequencing_Archive/CRAM_Archive/PT001.cram.crai',
					size: 8 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19763,
					path: '/Pipelines/rnaseq/work/b1/c2d3e4f5a6/SAMPLE_02.bam.bai',
					size: 12 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1977,
			hash: 'hash-redundant-uncompressed-sam',
			acknowledged: false,
			files: [
				{
					id: 19771,
					path: '/Pipelines/rnaseq/tmp/PT001.sam',
					size: 4800 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19772,
					path: '/Scratch/PT001_copy1.sam',
					size: 4800 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1978,
			hash: 'hash-unanchored-sam',
			acknowledged: false,
			files: [
				{
					id: 19781,
					path: '/Lab_Alignments/ORPHAN_SAMPLE_99.sam',
					size: 640 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19782,
					path: '/Lab_Alignments/Copy/ORPHAN_SAMPLE_99.sam',
					size: 640 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1979,
			hash: 'hash-vcf-gz-and-tbi',
			acknowledged: false,
			files: [
				{
					id: 19791,
					path: '/Sequencing_Archive/Final_Variants/CohortA_wgs.vcf.gz',
					size: 510 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19792,
					path: '/Pipelines/snakemake/snakemake_tmp/CohortA_wgs.vcf.gz',
					size: 510 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1980,
			hash: 'hash-tbi-index-sidecars',
			acknowledged: false,
			files: [
				{
					id: 19801,
					path: '/Sequencing_Archive/Final_Variants/CohortA_wgs.vcf.gz.tbi',
					size: 4 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19802,
					path: '/Sequencing_Archive/Final_Variants/Mirror/CohortA_wgs.vcf.gz.tbi',
					size: 4 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1981,
			hash: 'hash-single-cell-h5ad-rds-ipynb',
			acknowledged: false,
			files: [
				{
					id: 19811,
					path: '/Genomics_Vault/Results/PBMC_cohort_scanpy.h5ad',
					size: 1400 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19812,
					path: '/Downloads/PBMC_cohort_scanpy.h5ad',
					size: 1400 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1982,
			hash: 'hash-seurat-rds-and-ipynb',
			acknowledged: false,
			files: [
				{
					id: 19821,
					path: '/Genomics_Vault/Results/scrna_seurat_clustered.rds',
					size: 720 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19822,
					path: '/Analysis/scrna_downstream_analysis.ipynb',
					size: 18 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19823,
					path: '/Analysis/.ipynb_checkpoints/scrna_downstream_analysis-checkpoint.ipynb',
					size: 18 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1983,
			hash: 'hash-non-genomics-files',
			acknowledged: false,
			files: [
				{
					id: 19831,
					path: '/Photos/Holiday/DSC_0012.jpg',
					size: 5 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19832,
					path: '/Finance/Q4_budget_dashboard.ipynb',
					size: 2 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
	]
}

describe('Cycle 197: Genomics, Bioinformatics & Scientific Sequencing Data Vault Auditor', () => {
	test('classifies sequencing reads, BAM/CRAM/SAM + indexes, VCF/BCF + tbi, matrices/notebooks, and Nextflow/Snakemake work paths while ignoring unrelated files', () => {
		const mod = loadGenomicsVaultModule()
		const fastqGz = mod.classifyGenomicsBioinformaticsFile({
			path: '/Sequencing_Archive/00_Raw/PT001_R1.fastq.gz',
			size: 1024,
		})
		assert.equal(fastqGz.family, 'raw-sequencing-reads')
		assert.equal(fastqGz.isProtectedRawReadOrCram, true)
		assert.equal(fastqGz.genomicsTag, 'fastq-gz')

		const cram = mod.classifyGenomicsBioinformaticsFile({
			path: '/Sequencing_Archive/CRAM/PT001.cram',
			size: 1024,
		})
		assert.equal(cram.family, 'alignments-and-indexes')
		assert.equal(cram.isCram, true)
		assert.equal(cram.isProtectedRawReadOrCram, true)

		const samWork = mod.classifyGenomicsBioinformaticsFile({
			path: '/Pipelines/rnaseq/work/a4/9b1c2d3e/PT001.sam',
			size: 2048,
		})
		assert.equal(samWork.family, 'alignments-and-indexes')
		assert.equal(samWork.isUncompressedSam, true)
		assert.equal(samWork.isNextflowWork, true)
		assert.equal(samWork.isPipelineWorkPath, true)
		assert.equal(samWork.pipelineEngine, 'Nextflow')

		const tbi = mod.classifyGenomicsBioinformaticsFile({
			path: '/Sequencing_Archive/Final_Variants/CohortA.vcf.gz.tbi',
			size: 512,
		})
		assert.equal(tbi.family, 'variants-and-annotations')
		assert.equal(tbi.isProtectedIndexSidecar, true)
		assert.equal(tbi.genomicsTag, 'tbi-index')

		const h5ad = mod.classifyGenomicsBioinformaticsFile({
			path: '/Analysis/PBMC_scrna.h5ad',
			size: 4096,
		})
		assert.equal(h5ad.family, 'matrices-notebooks-pipelines')
		assert.equal(h5ad.isMatrixOrNotebook, true)
		assert.equal(h5ad.isMutableFile, true)

		const nonBioPhoto = mod.classifyGenomicsBioinformaticsFile({
			path: '/Photos/Holiday/DSC_0012.jpg',
			size: 1024,
		})
		assert.equal(nonBioPhoto.family, null)

		const nonBioNotebook = mod.classifyGenomicsBioinformaticsFile({
			path: '/Finance/Q4_budget_dashboard.ipynb',
			size: 1024,
		})
		assert.equal(nonBioNotebook.family, null)
	})

	test('strictly conserves archived .fastq.gz, .cram, .vcf.gz, and .bai/.crai/.tbi while reclaiming Nextflow work/, Snakemake tmp/, and redundant .sam backed by .bam/.cram', () => {
		const mod = loadGenomicsVaultModule()
		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = buildSampleGenomicsDuplicates(nowMs)

		const report = mod.auditGenomicsBioinformaticsVault(groups, {}, nowMs)
		assert.equal(report.schema, mod.GENOMICS_BIOINFORMATICS_VAULT_SCHEMA)
		assert.equal(report.summary.totalClustersCount, 12)

		// Cluster 1971: Raw archived .fastq.gz is strictly conserved; Nextflow work/ copy is reclaimed
		const fastqCluster = report.clusters.find(c => c.id === 1971)
		assert.ok(fastqCluster)
		assert.equal(fastqCluster.clusterVerdict, 'raw-read-cram-protected')
		const rawFastqMember = fastqCluster.members.find(m => m.id === 19711)
		const workFastqMember = fastqCluster.members.find(m => m.id === 19712)
		assert.equal(rawFastqMember.shielded, true)
		assert.equal(rawFastqMember.action, 'keep')
		assert.equal(workFastqMember.shielded, false)
		assert.equal(workFastqMember.action, 'delete')

		// Cluster 1972: Duplicate archived .fq.gz copies in both canonical vaults are both conserved when protectRawReadsAndCram is true
		const fqArchiveCluster = report.clusters.find(c => c.id === 1972)
		assert.ok(fqArchiveCluster)
		assert.equal(fqArchiveCluster.members.every(m => m.shielded && m.action === 'keep'), true)

		// Cluster 1976: Canonical .bai and .crai are strictly conserved; Nextflow work/ .bai copy is reclaimed
		const indexCluster = report.clusters.find(c => c.id === 1976)
		assert.ok(indexCluster)
		assert.equal(indexCluster.members.find(m => m.id === 19761).shielded, true)
		assert.equal(indexCluster.members.find(m => m.id === 19762).shielded, true)
		assert.equal(indexCluster.members.find(m => m.id === 19763).action, 'delete')

		// Cluster 1977: Uncompressed PT001.sam is flagged redundant because PT001.cram exists in cluster 1974
		const redundantSamCluster = report.clusters.find(c => c.id === 1977)
		assert.ok(redundantSamCluster)
		assert.equal(redundantSamCluster.hasBamOrCramAnchor, true)
		assert.equal(redundantSamCluster.clusterVerdict, 'uncompressed-sam-redundant')
		assert.equal(redundantSamCluster.members.every(m => m.isRedundantSamMember), true)

		// Cluster 1978: Orphan ORPHAN_SAMPLE_99.sam without any .bam/.cram anchor is shielded when requireBamOrCramForSamPrune is ON
		const orphanSamCluster = report.clusters.find(c => c.id === 1978)
		assert.ok(orphanSamCluster)
		assert.equal(orphanSamCluster.hasBamOrCramAnchor, false)
		assert.equal(orphanSamCluster.members.every(m => m.shielded && m.action === 'keep'), true)

		// Cluster 1979 & 1980: Final .vcf.gz and .vcf.gz.tbi in canonical archive are conserved; snakemake_tmp copy is reclaimed
		const vcfCluster = report.clusters.find(c => c.id === 1979)
		assert.ok(vcfCluster)
		assert.equal(vcfCluster.members.find(m => m.id === 19791).shielded, true)
		assert.equal(vcfCluster.members.find(m => m.id === 19792).action, 'delete')

		const tbiCluster = report.clusters.find(c => c.id === 1980)
		assert.ok(tbiCluster)
		assert.equal(tbiCluster.members.every(m => m.shielded && m.action === 'keep'), true)
	})

	test('respects Nextflow/Snakemake pipeline work grace window and never hardlinks mutable .h5ad/.rds/.ipynb/.sam files', () => {
		const mod = loadGenomicsVaultModule()
		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = buildSampleGenomicsDuplicates(nowMs)

		// With 7-day grace window, 2-day-old work/ intermediate is shielded
		const graceReport = mod.auditGenomicsBioinformaticsVault(groups, {
			keepRecentPipelineDays: 7,
		}, nowMs)
		const fastqCluster = graceReport.clusters.find(c => c.id === 1971)
		const twoDayWorkMember = fastqCluster.members.find(m => m.id === 19712)
		assert.equal(twoDayWorkMember.shielded, true)
		assert.match(twoDayWorkMember.protectedReason, /7-day/)

		// Hardlink strategy blocks hardlinks on mutable .h5ad/.rds/.ipynb/.sam and work/ paths
		const hardlinkReport = mod.auditGenomicsBioinformaticsVault(groups, {
			strategy: 'hardlink-archived-reads-and-cram',
			protectRawReadsAndCram: false,
			protectFinalVcfCalls: false,
			protectAlignmentAndVariantIndexes: false,
		}, nowMs)

		const h5adCluster = hardlinkReport.clusters.find(c => c.id === 1981)
		const h5adDuplicate = h5adCluster.members.find(m => m.id === 19812)
		assert.notEqual(h5adDuplicate.action, 'hardlink')

		const fqCluster = hardlinkReport.clusters.find(c => c.id === 1972)
		const fqDuplicate = fqCluster.members.find(m => m.id === 19722)
		assert.equal(fqDuplicate.action, 'hardlink')

		const script = mod.buildGenomicsBioinformaticsRemediationScript(hardlinkReport)
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes('run_cmd ln -f'))
		assert.equal(/ln -f[^\n]*\.(?:h5ad|loom|rds|ipynb|sam)'/i.test(script), false)
	})

	test('generates CWE-1236 formula-safe CSV, deterministic JSON manifest, and .sync-exclude.lst rules', () => {
		const mod = loadGenomicsVaultModule()
		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = [
			{
				id: 9901,
				hash: 'hash-cwe1236',
				files: [
					{ id: 1, path: '/Sequencing_Archive/=CMD("calc")_PT01.fastq.gz', size: 2048, mtime: Math.floor(nowMs / 1000) - 100000 },
					{ id: 2, path: '/Pipelines/work/ab/cdef1234/+malicious_PT01.fastq.gz', size: 2048, mtime: Math.floor(nowMs / 1000) - 1000 },
				],
			},
		]

		const report = mod.auditGenomicsBioinformaticsVault(groups, {}, nowMs)
		const csv = mod.buildGenomicsBioinformaticsCsvReport(report)
		assert.ok(csv.includes('cluster_id,cluster_name,pipeline_engine'))
		assert.ok(csv.includes("'/Sequencing_Archive/=CMD") || csv.includes('=CMD') === false || csv.includes("'=CMD"))

		const manifest = JSON.parse(mod.buildGenomicsBioinformaticsJsonManifest(report))
		assert.equal(manifest.schema, mod.GENOMICS_BIOINFORMATICS_VAULT_SCHEMA)
		assert.equal(manifest.clusters.length, 1)

		const syncExclude = mod.buildGenomicsBioinformaticsSyncExcludeList()
		assert.ok(syncExclude.includes('work/'))
		assert.ok(syncExclude.includes('.nextflow/'))
		assert.ok(syncExclude.includes('.snakemake/'))
		assert.ok(syncExclude.includes('.ipynb_checkpoints/'))
		assert.ok(syncExclude.includes('*.sam.tmp'))
	})

	test('GenomicsBioinformaticsVaultWorkbench renders KPIs, presets, shield toggles, filters, per-copy overrides, and exports cleanly', async () => {
		const copied = []
		const Workbench = loadGenomicsVaultWorkbench(copied)
		const duplicates = buildSampleGenomicsDuplicates()

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates,
					allDuplicates: duplicates,
					currentDuplicateId: 1977,
				},
			}),
		}).$mount(mountNode)

		try {
			await settle()
			const rootEl = vm.$el
			assert.ok(rootEl.classList.contains('genomics-bioinformatics-vault-workbench'))
			assert.equal(rootEl.querySelectorAll('.gbv__cluster-card').length, 12)
			assert.ok(rootEl.textContent.includes('PT001.sam'))

			// Click Redundant Uncompressed .sam preset
			const presetBtns = Array.from(rootEl.querySelectorAll('.gbv__seg-btn'))
			const samPresetBtn = presetBtns.find(b => b.textContent.includes('Redundant Uncompressed .sam'))
			assert.ok(samPresetBtn)
			samPresetBtn.click()
			await settle()
			assert.ok(rootEl.querySelectorAll('.gbv__cluster-card').length >= 2)

			// Copy DRY_RUN=1 script & .sync-exclude.lst
			const copyScriptBtn = Array.from(rootEl.querySelectorAll('.gbv__tool-btn')).find(b => b.textContent.includes('Copy DRY_RUN=1 Script'))
			copyScriptBtn.click()
			await settle()
			assert.equal(copied.length, 1)
			assert.ok(copied[0].includes('DRY_RUN="${DRY_RUN:-1}"'))

			const copyExcludeBtn = Array.from(rootEl.querySelectorAll('.gbv__tool-btn')).find(b => b.textContent.includes('Copy .sync-exclude.lst'))
			copyExcludeBtn.click()
			await settle()
			assert.equal(copied.length, 2)
			assert.ok(copied[1].includes('.snakemake/'))
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('GenomicsBioinformaticsVaultWorkbench renders empty-state banner when no duplicates are loaded', async () => {
		const Workbench = loadGenomicsVaultWorkbench()
		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: [],
					allDuplicates: [],
				},
			}),
		}).$mount(mountNode)

		try {
			await settle()
			assert.ok(vm.$el.querySelector('.gbv__empty-banner'))
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('App.vue opens and closes GenomicsBioinformaticsVaultWorkbench via Shift+F1 and topbar button', async () => {
		window.localStorage.clear()
		const stub = name => ({
			name,
			props: ['duplicate', 'projectId', 'show', 'isScanning'],
			render(h) {
				return h('div', { attrs: { 'data-stub': name } })
			},
		})
		const slotBox = tag => ({ render(h) { return h(tag, {}, this.$slots.default) } })
		const icon = { render: h => h('span') }

		const statsModule = loadModule('src/tools/duplicateStats.js')
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		const SearchBar = loadComponent('src/components/SearchBar.vue', {
			'vue-material-design-icons/ChevronDown': icon,
		})
		const DuplicateListItem = loadComponent('src/components/DuplicateListItem.vue', {
			'@nextcloud/vue': { NcAppNavigationItem: slotBox('div') },
			'@/tools/duplicateStats': statsModule,
			'@/tools/utils': utils,
		})
		const DuplicateNavigation = loadComponent('src/components/DuplicateNavigation.vue', {
			'@nextcloud/vue': {
				NcAppNavigation: { render(h) { return h('nav', this.$scopedSlots.list ? this.$scopedSlots.list() : this.$slots.default) } },
				NcAppNavigationItem: slotBox('div'),
				NcButton: slotBox('button'),
			},
			'./DuplicateListItem.vue': { __esModule: true, default: DuplicateListItem },
			'./SearchBar.vue': { __esModule: true, default: SearchBar },
			'vue-material-design-icons/CloseCircle': icon,
			'vue-material-design-icons/CheckCircle': icon,
			'vue-material-design-icons/Cog': icon,
			'vue-material-design-icons/Delete': icon,
			'vue-material-design-icons/HelpCircle': icon,
			'vue-material-design-icons/School': icon,
			'vue-material-design-icons/PlayCircle': icon,
			'vue-material-design-icons/FrequentlyAskedQuestions': icon,
			'vue-material-design-icons/FolderMultiple': icon,
			'vue-material-design-icons/FolderCog': icon,
			'vue-material-design-icons/Folder': icon,
			'@/tools/api': { fetchDuplicates: async () => ({ entities: [], pagination: { currentPage: 1, totalPages: 1 } }) },
			'@/tools/utils': utils,
			'@/tools/duplicateFilters': loadModule('src/tools/duplicateFilters.js'),
			'@/tools/duplicatePreferences': loadModule('src/tools/duplicatePreferences.js'),
			'@/tools/duplicateSelectionAndExport': loadModule('src/tools/duplicateSelectionAndExport.js'),
			'@/tools/duplicateSortHelper': loadModule('src/tools/duplicateSortHelper.js'),
			'@/tools/duplicateStats': statsModule,
		})
		const DuplicateTreemap = loadComponent('src/components/DuplicateTreemap.vue', {
			'../tools/duplicateStats': statsModule,
			'../tools/duplicateTreemap': loadModule('src/tools/duplicateTreemap.js', {
				'./duplicateFilters': loadModule('src/tools/duplicateFilters.js'),
				'./duplicatePathDiff': loadModule('src/tools/duplicatePathDiff.js'),
				'./duplicateStats': statsModule,
			}),
		})
		const GenomicsBioinformaticsVaultWorkbench = loadGenomicsVaultWorkbench()

		const App = loadComponent('src/App.vue', {
			'@nextcloud/dialogs': { showError: () => {}, showSuccess: () => {} },
			'@nextcloud/vue': {
				NcAppContent: slotBox('div'),
				NcAppNavigation: slotBox('div'),
				NcAppNavigationItem: slotBox('li'),
				NcAppNavigationList: slotBox('ul'),
				NcAppNavigationNew: slotBox('div'),
				NcAppSidebar: slotBox('aside'),
				NcEmptyContent: slotBox('div'),
				NcContent: slotBox('div'),
				NcLoadingIcon: slotBox('span'),
				NcAppSettingsDialog: slotBox('section'),
				NcAppSettingsSection: slotBox('div'),
				NcButton: slotBox('button'),
				NcModal: slotBox('div'),
			},
			'./components/DuplicateNavigation.vue': { __esModule: true, default: DuplicateNavigation },
			'./components/DuplicateDetails.vue': { __esModule: true, default: stub('details') },
			'./components/DuplicateTreemap.vue': { __esModule: true, default: DuplicateTreemap },
			'./components/SpaceReclamationTimeline.vue': { __esModule: true, default: stub('timeline') },
			'./components/SimilarityInspector.vue': { __esModule: true, default: stub('similarity') },
			'./components/BatchAutoSelectWorkbench.vue': { __esModule: true, default: stub('batch') },
			'./components/FileHygieneInspector.vue': { __esModule: true, default: stub('hygiene') },
			'./components/LinkDeduplicationSimulator.vue': { __esModule: true, default: stub('link') },
			'./components/FolderPairMatrix.vue': { __esModule: true, default: stub('matrix') },
			'./components/StorageFootprintAnalyzer.vue': { __esModule: true, default: stub('footprint') },
			'./components/PhotoBurstTimeline.vue': { __esModule: true, default: stub('burst') },
			'./components/RecoverySafetyWorkbench.vue': { __esModule: true, default: stub('safety') },
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
			'./components/GenomicsBioinformaticsVaultWorkbench.vue': { __esModule: true, default: GenomicsBioinformaticsVaultWorkbench },
			'./components/DfirSecurityVaultWorkbench.vue': { __esModule: true, default: stub('dfir-security-vault-auditor') },
			'./components/RoboticsRosVaultWorkbench.vue': { __esModule: true, default: stub('robotics-ros-vault-auditor') },
			'./components/SemiconductorEdaVaultWorkbench.vue': { __esModule: true, default: stub('semiconductor-eda-vault-auditor') },
			'./components/AerospaceCfdVaultWorkbench.vue': { __esModule: true, default: stub('aerospace-cfd-vault-auditor') },
			'./components/BatteryBmsVaultWorkbench.vue': { __esModule: true, default: stub('battery-bms-vault-auditor') },
			'./components/ChemPharmaGmpVaultWorkbench.vue': { __esModule: true, default: stub('chem-pharma-gmp-vault-auditor') },
			'./components/DigitalGridScadaVaultWorkbench.vue': { __esModule: true, default: stub('digital-grid-scada-vault-auditor') },
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
					entities: type === 'unacknowledged' ? buildSampleGenomicsDuplicates() : [],
					pagination: { currentPage: 1, totalPages: 1, totalItems: 13, hasMore: false },
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

			const btn = vm.$el.querySelector('button.topbar-genomics-bioinformatics-vault-button')
			assert.ok(btn, 'Genomics & Sequencing Vault button is rendered in topbar')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'Shift+F1')
			assert.equal(vm.$el.querySelector('.genomics-bioinformatics-vault-workbench'), null)

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F1', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.ok(vm.$el.querySelector('.genomics-bioinformatics-vault-workbench'), 'GenomicsBioinformaticsVaultWorkbench must open on Shift+F1 shortcut')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F1', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.$el.querySelector('.genomics-bioinformatics-vault-workbench'), null, 'GenomicsBioinformaticsVaultWorkbench must toggle closed on Shift+F1 shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new Genomics, Bioinformatics & Scientific Sequencing Vault files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/genomicsBioinformaticsVaultAuditor.js',
			'src/components/GenomicsBioinformaticsVaultWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
		]
		for (const rel of files) {
			const content = readFileSync(resolve(root, rel), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(content), false, `No U+2013/U+2014 in ${rel}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `No XSS sink in ${rel}`)
		}
	})
})
