<template>
	<section
		class="genomics-bioinformatics-vault-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Genomics, Bioinformatics and Scientific Sequencing Data Vault Auditor')">
		<header class="gbv__toolbar">
			<div class="gbv__title-group">
				<h3 class="gbv__title">
					{{ t('duplicatefinder', 'Genomics, Bioinformatics & Scientific Sequencing Data Vault Auditor') }}
				</h3>
				<span
					class="gbv__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} ({gb}) reclaimable / {reads} raw+cram, {vcfs} vcf.gz, {indexes} indexes, {sams} sam-dup, {work} work/tmp', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						gb: analysis.summary.reclaimableGb,
						reads: analysis.summary.totalRawReadCramClusters,
						vcfs: analysis.summary.totalFinalVcfClusters,
						indexes: analysis.summary.totalIndexSidecarClusters,
						sams: analysis.summary.totalRedundantSamClusters,
						work: analysis.summary.totalPipelineWorkClusters,
					}) }}
				</span>
			</div>

			<div class="gbv__toolbar-actions">
				<button
					type="button"
					class="gbv__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="gbv__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="gbv__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="gbv__tool-btn"
					@click="copySyncExcludeSnippet">
					<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
				</button>
				<button
					type="button"
					class="gbv__tool-btn is-close"
					aria-keyshortcuts="Shift+F1"
					:title="t('duplicatefinder', 'Hide Genomics, Bioinformatics and Scientific Sequencing Data Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Genomics & Sequencing Vault') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="gbv__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="gbv__kpis">
			<div class="gbv__kpi">
				<span class="gbv__kpi-label">{{ t('duplicatefinder', 'Safe SAM & Work Reclaim') }}</span>
				<strong class="gbv__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.reclaimableGb }} / {{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="gbv__kpi">
				<span class="gbv__kpi-label">{{ t('duplicatefinder', 'Conserved FASTQ/CRAM, VCF & Indexes') }}</span>
				<strong class="gbv__kpi-val is-warn">
					{{ analysis.summary.totalRawReadCramClusters }} {{ t('duplicatefinder', 'reads/cram') }} / {{ analysis.summary.totalFinalVcfClusters }} {{ t('duplicatefinder', 'vcf.gz') }} / {{ analysis.summary.totalIndexSidecarClusters }} {{ t('duplicatefinder', 'bai/tbi') }}
				</strong>
			</div>
			<div class="gbv__kpi">
				<span class="gbv__kpi-label">{{ t('duplicatefinder', 'Redundant SAM & Nextflow/Snakemake') }}</span>
				<strong class="gbv__kpi-val is-danger">
					{{ analysis.summary.totalRedundantSamClusters }} {{ t('duplicatefinder', 'sam') }} / {{ analysis.summary.totalPipelineWorkClusters }} {{ t('duplicatefinder', 'work/tmp') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="gbv__kpi">
				<span class="gbv__kpi-label">{{ t('duplicatefinder', 'Raw Sequencing Duplicate Footprint') }}</span>
				<strong class="gbv__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="gbv__empty-banner"
			role="note">
			<div class="gbv__empty-text">
				<p class="gbv__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure FASTQ.GZ/CRAM, VCF.GZ, and .bai/.tbi shields before scanning') }}
				</p>
				<p class="gbv__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit raw sequencing reads (.fastq, .fastq.gz, .fq.gz, .fasta, .fa), alignments (.bam, .cram, .sam, .bai, .crai), variants (.vcf, .vcf.gz, .bcf, .tbi), single-cell matrices/notebooks (.h5ad, .loom, .rds, .ipynb), and Nextflow work/ or Snakemake tmp/ intermediates.') }}
				</p>
			</div>
			<button
				type="button"
				class="gbv__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="gbv__controls">
			<div class="gbv__control-row">
				<span class="gbv__control-label">{{ t('duplicatefinder', 'Vault Preset') }}</span>
				<div
					class="gbv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Genomics and Bioinformatics vault presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="gbv__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="gbv__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="gbv__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="gbv__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="gbv__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="gbv__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="gbv__seg-btn"
					:class="{ 'is-active': protectRawReadsAndCram }"
					:aria-pressed="protectRawReadsAndCram ? 'true' : 'false'"
					@click="protectRawReadsAndCram = !protectRawReadsAndCram">
					<span>{{ protectRawReadsAndCram ? t('duplicatefinder', 'Shield .fastq.gz/.cram: ON') : t('duplicatefinder', 'Shield .fastq.gz/.cram: OFF') }}</span>
				</button>

				<button
					type="button"
					class="gbv__seg-btn"
					:class="{ 'is-active': protectFinalVcfCalls }"
					:aria-pressed="protectFinalVcfCalls ? 'true' : 'false'"
					@click="protectFinalVcfCalls = !protectFinalVcfCalls">
					<span>{{ protectFinalVcfCalls ? t('duplicatefinder', 'Shield .vcf.gz/.bcf: ON') : t('duplicatefinder', 'Shield .vcf.gz/.bcf: OFF') }}</span>
				</button>

				<button
					type="button"
					class="gbv__seg-btn"
					:class="{ 'is-active': protectAlignmentAndVariantIndexes }"
					:aria-pressed="protectAlignmentAndVariantIndexes ? 'true' : 'false'"
					@click="protectAlignmentAndVariantIndexes = !protectAlignmentAndVariantIndexes">
					<span>{{ protectAlignmentAndVariantIndexes ? t('duplicatefinder', 'Shield .bai/.crai/.tbi: ON') : t('duplicatefinder', 'Shield .bai/.crai/.tbi: OFF') }}</span>
				</button>

				<button
					type="button"
					class="gbv__seg-btn"
					:class="{ 'is-active': requireBamOrCramForSamPrune }"
					:aria-pressed="requireBamOrCramForSamPrune ? 'true' : 'false'"
					@click="requireBamOrCramForSamPrune = !requireBamOrCramForSamPrune">
					<span>{{ requireBamOrCramForSamPrune ? t('duplicatefinder', 'Require .bam/.cram for .sam: ON') : t('duplicatefinder', 'Require .bam/.cram for .sam: OFF') }}</span>
				</button>
			</div>

			<div class="gbv__control-row gbv__inputs-row">
				<label class="gbv__field">
					<span class="gbv__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="gbv__input">
						<option value="prune-sam-and-pipeline-intermediates">{{ t('duplicatefinder', 'Prune Redundant .sam & Nextflow/Snakemake Work') }}</option>
						<option value="hardlink-archived-reads-and-cram">{{ t('duplicatefinder', 'Hardlink Immutable FASTQ.GZ/CRAM/VCF.GZ (Block Mutable)') }}</option>
						<option value="quarantine-uncompressed-sam-and-scratch">{{ t('duplicatefinder', 'Quarantine Uncompressed .sam & Pipeline Scratch') }}</option>
					</select>
				</label>

				<label class="gbv__field">
					<span class="gbv__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="gbv__input">
						<option value="raw-cram-vcf-archive-first">{{ t('duplicatefinder', 'Archived FASTQ.GZ, CRAM, VCF.GZ & Indexes first') }}</option>
						<option value="oldest-run-first">{{ t('duplicatefinder', 'Oldest sequencing run mtime first') }}</option>
						<option value="newest-analysis-first">{{ t('duplicatefinder', 'Newest analysis revision first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical vault path') }}</option>
					</select>
				</label>

				<label class="gbv__field">
					<span class="gbv__field-label">{{ t('duplicatefinder', 'Work Grace (d)') }}</span>
					<input
						v-model="keepRecentPipelineDaysInput"
						type="number"
						min="0"
						step="1"
						class="gbv__input gbv__num-input">
				</label>

				<label class="gbv__field">
					<span class="gbv__field-label">{{ t('duplicatefinder', 'Min Size (KiB)') }}</span>
					<input
						v-model="minSizeKbInput"
						type="number"
						min="0"
						step="1"
						class="gbv__input gbv__num-input">
				</label>

				<label class="gbv__field gbv__field-grow">
					<span class="gbv__field-label">{{ t('duplicatefinder', 'Filter Sample, Pipeline Engine, Sequencing Format or Work Path') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="gbv__input"
						:placeholder="t('duplicatefinder', 'e.g. fastq.gz, cram, bam, sam, bai, vcf.gz, tbi, h5ad, rds, Nextflow, work')">
				</label>

				<label class="gbv__field">
					<span class="gbv__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="gbv__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Redundant SAM & pipeline priority') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Artifact filename (A-Z)') }}</option>
					</select>
				</label>
			</div>

			<div class="gbv__control-row">
				<span class="gbv__control-label">{{ t('duplicatefinder', 'Artifact Family') }}</span>
				<div
					class="gbv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Genomics and Bioinformatics artifact family filter')">
					<button
						type="button"
						class="gbv__seg-btn"
						:class="{ 'is-active': familyFilter === 'all' }"
						:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
						@click="familyFilter = 'all'">
						<span>{{ t('duplicatefinder', 'All Families ({count})', { count: analysis.summary.totalUnfilteredClustersCount }) }}</span>
					</button>
					<button
						v-for="fam in analysis.familyBreakdown"
						:key="fam.id"
						type="button"
						class="gbv__seg-btn"
						:class="{ 'is-active': familyFilter === fam.id }"
						:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
						:title="fam.shortLabel"
						@click="familyFilter = fam.id">
						<span>{{ fam.label }} ({{ fam.clustersCount }})</span>
					</button>
				</div>
			</div>

			<div class="gbv__control-row">
				<span class="gbv__control-label">{{ t('duplicatefinder', 'Governance') }}</span>
				<div
					class="gbv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Genomics governance verdict filter')">
					<button
						v-for="opt in verdictFilterOptions"
						:key="opt.id"
						type="button"
						class="gbv__seg-btn"
						:class="{ 'is-active': verdictFilter === opt.id }"
						:aria-pressed="verdictFilter === opt.id ? 'true' : 'false'"
						@click="verdictFilter = opt.id">
						<span>{{ opt.label }}</span>
					</button>
				</div>
			</div>
		</div>

		<div
			v-if="!sourcePoolEmpty && analysis.clusters.length === 0"
			class="gbv__empty-filter"
			role="note">
			<p class="gbv__empty-title">
				{{ t('duplicatefinder', 'No sequencing reads, alignments, variants, indexes, matrices, or pipeline intermediates match the active filters.') }}
			</p>
			<button
				type="button"
				class="gbv__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="gbv__workspace">
			<div
				class="gbv__cluster-list"
				role="list"
				:aria-label="t('duplicatefinder', 'Audited Genomics and Bioinformatics sequencing clusters')">
				<button
					v-for="cluster in visibleClusters"
					:key="String(cluster.id)"
					type="button"
					class="gbv__cluster-card"
					:class="{ 'is-selected': selectedCluster && selectedCluster.id === cluster.id }"
					@click="selectedClusterId = cluster.id">
					<div class="gbv__cluster-top">
						<strong class="gbv__cluster-name">{{ cluster.name }}</strong>
						<span
							class="gbv__pill"
							:class="verdictPillClass(cluster.clusterVerdict)">
							{{ formatVerdictLabel(cluster.clusterVerdict) }}
						</span>
					</div>
					<div class="gbv__cluster-meta">
						<span
							v-if="cluster.pipelineEngine"
							class="gbv__tag">{{ cluster.pipelineEngine }}</span>
						<span
							v-if="cluster.sequencingStage"
							class="gbv__tag">{{ cluster.sequencingStage }}</span>
						<span class="gbv__tag">{{ cluster.familyLabel }}</span>
					</div>
					<div class="gbv__cluster-badges">
						<span
							v-if="cluster.hasRedundantUncompressedSam"
							class="gbv__badge is-security">
							{{ cluster.hasBamOrCramAnchor
								? t('duplicatefinder', 'Redundant Uncompressed .sam (BAM/CRAM exists)')
								: t('duplicatefinder', 'Uncompressed .sam (No BAM/CRAM Anchor)') }}
						</span>
						<span
							v-if="cluster.hasProtectedRawReadOrCram"
							class="gbv__badge is-keep">
							{{ t('duplicatefinder', 'Raw FASTQ/CRAM Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedFinalVcf"
							class="gbv__badge is-keep">
							{{ t('duplicatefinder', 'Final VCF.GZ/BCF Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedIndexSidecar"
							class="gbv__badge is-consolidate">
							{{ t('duplicatefinder', 'Index (.bai/.crai/.tbi) Conserved') }}
						</span>
						<span
							v-if="cluster.hasPipelineWorkIntermediate"
							class="gbv__badge is-warn">
							{{ t('duplicatefinder', 'Nextflow/Snakemake work/tmp') }}
						</span>
						<span
							v-if="cluster.hasMatrixOrNotebook"
							class="gbv__badge is-consolidate">
							{{ t('duplicatefinder', 'Matrix / Notebook') }}
						</span>
					</div>
					<div class="gbv__cluster-bottom">
						<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
						<strong class="gbv__cluster-reclaim">{{ cluster.formattedReclaimableBytes }}</strong>
					</div>
				</button>

				<button
					v-if="analysis.clusters.length > visibleLimit"
					type="button"
					class="gbv__load-more-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more clusters ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
				</button>
			</div>

			<div
				v-if="selectedCluster"
				class="gbv__inspector">
				<header class="gbv__inspector-head">
					<div class="gbv__inspector-title-wrap">
						<h4 class="gbv__inspector-title">
							{{ selectedCluster.name }}
						</h4>
						<p class="gbv__inspector-sub">
							{{ selectedCluster.pipelineEngine || selectedCluster.lineageStem }} | {{ selectedCluster.sequencingStage || selectedCluster.familyLabel }} | {{ selectedCluster.formattedUnitBytes }}
						</p>
					</div>
					<div class="gbv__inspector-actions">
						<button
							type="button"
							class="gbv__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Open in Triage') }}</span>
						</button>
						<button
							type="button"
							class="gbv__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Side-by-Side') }}</span>
						</button>
					</div>
				</header>

				<div class="gbv__lineage-grid">
					<div class="gbv__lineage-item">
						<span class="gbv__lineage-label">{{ t('duplicatefinder', 'Sample Lineage & Pipeline Engine') }}</span>
						<strong class="gbv__lineage-val">{{ selectedCluster.pipelineEngine ? `${selectedCluster.pipelineEngine} / ` : '' }}{{ selectedCluster.lineageStem }} ({{ selectedCluster.sampleAnchorKey }})</strong>
					</div>
					<div class="gbv__lineage-item">
						<span class="gbv__lineage-label">{{ t('duplicatefinder', 'Archive & Index Conservation') }}</span>
						<strong class="gbv__lineage-val">
							{{ selectedCluster.hasProtectedRawReadOrCram ? t('duplicatefinder', 'Raw FASTQ.GZ / CRAM Shielded') : (selectedCluster.hasProtectedFinalVcf ? t('duplicatefinder', 'Final VCF.GZ / BCF Shielded') : (selectedCluster.hasProtectedIndexSidecar ? t('duplicatefinder', 'Index (.bai/.crai/.tbi) Shielded') : t('duplicatefinder', 'Pipeline Intermediate or Matrix'))) }}
						</strong>
					</div>
					<div class="gbv__lineage-item">
						<span class="gbv__lineage-label">{{ t('duplicatefinder', 'Alignment & Variant Anchors') }}</span>
						<strong class="gbv__lineage-val">
							{{ selectedCluster.hasBamOrCramAnchor ? t('duplicatefinder', 'Verified .bam/.cram Anchor Found') : (selectedCluster.hasCompressedFastqAnchor ? t('duplicatefinder', 'Compressed .fastq.gz Anchor Found') : (selectedCluster.hasCompressedVcfAnchor ? t('duplicatefinder', 'Compressed .vcf.gz Anchor Found') : t('duplicatefinder', 'No Compressed Anchor Detected'))) }}
						</strong>
					</div>
					<div class="gbv__lineage-item">
						<span class="gbv__lineage-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<strong class="gbv__lineage-val is-accent">
							{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableTargetsCount }} {{ t('duplicatefinder', 'targets') }})
						</strong>
					</div>
				</div>

				<div class="gbv__members-list">
					<div
						v-for="member in selectedCluster.members"
						:key="member.key"
						class="gbv__member-card">
						<div class="gbv__member-top">
							<code class="gbv__member-path">{{ member.normalized }}</code>
							<div class="gbv__member-pills">
								<span
									v-if="member.isRedundantSamMember"
									class="gbv__pill is-security">
									{{ t('duplicatefinder', 'REDUNDANT .SAM (BAM/CRAM EXISTS)') }}
								</span>
								<span
									v-if="member.isPipelineWorkPath"
									class="gbv__pill is-warn">
									{{ member.isNextflowWork ? t('duplicatefinder', 'NEXTFLOW WORK/') : (member.isSnakemakeWork ? t('duplicatefinder', 'SNAKEMAKE TMP/') : t('duplicatefinder', 'SCRATCH/CHECKPOINT')) }}
								</span>
								<span
									class="gbv__pill"
									:class="verdictPillClass(member.governanceTier)">
									{{ member.artifactKind }}
								</span>
								<span
									v-if="member.genomicsTag"
									class="gbv__pill is-consolidate">
									{{ member.genomicsTag }}
								</span>
								<span
									class="gbv__pill"
									:class="actionPillClass(member)">
									{{ formatMemberActionLabel(member) }}
								</span>
							</div>
						</div>
						<div class="gbv__member-bottom">
							<div class="gbv__member-meta">
								<span>{{ formatMemberSize(member.size) }}</span>
								<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
								<span>{{ member.vaultRole }}</span>
								<span v-if="member.samRedundancyReason">{{ member.samRedundancyReason }}</span>
								<span v-if="member.protectedReason">{{ member.protectedReason }}</span>
							</div>
							<div class="gbv__member-actions">
								<button
									type="button"
									class="gbv__mini-btn"
									@click="copyMemberPath(member.normalized)">
									<span>{{ t('duplicatefinder', 'Copy Path') }}</span>
								</button>
								<label
									v-if="!member.isSurvivor && !(member.isProtectedRawReadOrCram && protectRawReadsAndCram) && !(member.isProtectedFinalVcf && protectFinalVcfCalls) && !(member.isProtectedIndexSidecar && protectAlignmentAndVariantIndexes)"
									class="gbv__override-field">
									<span class="gbv__sr-only">{{ t('duplicatefinder', 'Override verdict') }}</span>
									<select
										class="gbv__override-select"
										:value="getMemberOverride(member.key)"
										@change="setMemberOverride(member.key, $event.target.value)">
										<option value="auto">{{ t('duplicatefinder', 'Auto') }}</option>
										<option value="keep">{{ t('duplicatefinder', 'Force Keep / Shield') }}</option>
										<option value="prune">{{ t('duplicatefinder', 'Force Remediate') }}</option>
									</select>
								</label>
							</div>
						</div>
					</div>
				</div>

				<div class="gbv__code-panels">
					<div class="gbv__code-box">
						<div class="gbv__code-head">
							<strong>{{ t('duplicatefinder', 'DRY_RUN=1 POSIX Cleanup Script') }}</strong>
							<button
								type="button"
								class="gbv__mini-btn"
								@click="copyRemediationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="gbv__pre"><code>{{ generatedScript }}</code></pre>
					</div>

					<div class="gbv__code-box">
						<div class="gbv__code-head">
							<strong>{{ t('duplicatefinder', 'Nextcloud .sync-exclude.lst Rules') }}</strong>
							<button
								type="button"
								class="gbv__mini-btn"
								@click="copySyncExcludeSnippet">
								<span>{{ t('duplicatefinder', 'Copy Rules') }}</span>
							</button>
						</div>
						<pre class="gbv__pre"><code>{{ generatedSyncExclude }}</code></pre>
					</div>
				</div>
			</div>
		</div>
	</section>
</template>

<script>
import { copyTextSafely } from '../tools/clipboardHelper'
import { formatBytes } from '../tools/duplicateStats'
import {
	GENOMICS_BIOINFORMATICS_PRESETS,
	auditGenomicsBioinformaticsVault,
	buildGenomicsBioinformaticsCsvReport,
	buildGenomicsBioinformaticsJsonManifest,
	buildGenomicsBioinformaticsRemediationScript,
	buildGenomicsBioinformaticsSyncExcludeList,
} from '../tools/genomicsBioinformaticsVaultAuditor'

export default {
	name: 'GenomicsBioinformaticsVaultWorkbench',
	props: {
		duplicates: {
			type: Array,
			default: () => [],
		},
		allDuplicates: {
			type: Array,
			default: () => [],
		},
		currentDuplicateId: {
			type: [Number, String],
			default: null,
		},
	},
	data() {
		return {
			presetId: 'all-genomics-sequencing-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'prune-sam-and-pipeline-intermediates',
			survivorRule: 'raw-cram-vcf-archive-first',
			protectRawReadsAndCram: true,
			protectFinalVcfCalls: true,
			protectAlignmentAndVariantIndexes: true,
			requireBamOrCramForSamPrune: true,
			keepRecentPipelineDaysInput: '0',
			minSizeKbInput: '0',
			searchQueryInput: '',
			sortMode: 'reclaim_desc',
			selectedClusterId: null,
			visibleLimit: 25,
			memberOverrides: {},
			statusNotice: '',
			statusNoticeType: 'success',
		}
	},
	computed: {
		presets() {
			return GENOMICS_BIOINFORMATICS_PRESETS
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable') },
				{ id: 'uncompressed-sam-redundant', label: this.t('duplicatefinder', 'Redundant .sam') },
				{ id: 'pipeline-work-intermediate', label: this.t('duplicatefinder', 'Nextflow/Snakemake Work') },
				{ id: 'raw-read-cram-protected', label: this.t('duplicatefinder', 'FASTQ.GZ / CRAM') },
				{ id: 'final-vcf-protected', label: this.t('duplicatefinder', 'VCF.GZ / BCF') },
				{ id: 'index-sidecar-protected', label: this.t('duplicatefinder', '.bai / .crai / .tbi') },
				{ id: 'matrix-notebook-duplicate', label: this.t('duplicatefinder', 'Matrix / Notebook') },
				{ id: 'shielded', label: this.t('duplicatefinder', 'Shielded') },
			]
		},
		filteredSourceCount() {
			return Array.isArray(this.duplicates) ? this.duplicates.length : 0
		},
		allSourceCount() {
			return Array.isArray(this.allDuplicates) && this.allDuplicates.length > 0
				? this.allDuplicates.length
				: this.filteredSourceCount
		},
		activePool() {
			if (this.scope === 'all' && Array.isArray(this.allDuplicates) && this.allDuplicates.length > 0) {
				return this.allDuplicates
			}
			return Array.isArray(this.duplicates) ? this.duplicates : []
		},
		sourcePoolEmpty() {
			return this.filteredSourceCount === 0 && this.allSourceCount === 0
		},
		parsedKeepRecentPipelineDays() {
			const trimmed = String(this.keepRecentPipelineDaysInput ?? '').trim()
			if (!trimmed) {
				return 0
			}
			const parsed = Number(trimmed)
			return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
		},
		parsedMinSizeKb() {
			const trimmed = String(this.minSizeKbInput ?? '').trim()
			if (!trimmed) {
				return 0
			}
			const parsed = Number(trimmed)
			return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
		},
		analysis() {
			return auditGenomicsBioinformaticsVault(this.activePool, {
				presetId: this.presetId,
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectRawReadsAndCram: this.protectRawReadsAndCram,
				protectFinalVcfCalls: this.protectFinalVcfCalls,
				protectAlignmentAndVariantIndexes: this.protectAlignmentAndVariantIndexes,
				requireBamOrCramForSamPrune: this.requireBamOrCramForSamPrune,
				keepRecentPipelineDays: this.parsedKeepRecentPipelineDays,
				minSizeKb: this.parsedMinSizeKb,
				searchQuery: this.searchQueryInput,
				memberOverrides: this.memberOverrides,
			})
		},
		visibleClusters() {
			return this.analysis.clusters.slice(0, this.visibleLimit)
		},
		selectedCluster() {
			const clusters = this.analysis.clusters
			if (!clusters.length) {
				return null
			}
			if (this.selectedClusterId !== null && this.selectedClusterId !== undefined) {
				const found = clusters.find(c => c.id === this.selectedClusterId)
				if (found) {
					return found
				}
			}
			if (this.currentDuplicateId !== null && this.currentDuplicateId !== undefined) {
				const byCurrent = clusters.find(c => c.id === this.currentDuplicateId)
				if (byCurrent) {
					return byCurrent
				}
			}
			return clusters[0]
		},
		generatedScript() {
			return buildGenomicsBioinformaticsRemediationScript(this.analysis)
		},
		generatedSyncExclude() {
			return buildGenomicsBioinformaticsSyncExcludeList()
		},
	},
	methods: {
		t(app, text, vars) {
			if (typeof globalThis.t === 'function') {
				return globalThis.t(app, text, vars)
			}
			if (!vars) {
				return text
			}
			return Object.keys(vars).reduce(
				(acc, key) => acc.replace(new RegExp(`\\{${key}\\}`, 'g'), String(vars[key])),
				text
			)
		},
		setNotice(message, type = 'success') {
			this.statusNotice = message
			this.statusNoticeType = type
		},
		formatMemberSize(size) {
			return formatBytes(size)
		},
		applyPreset(presetId) {
			const preset = GENOMICS_BIOINFORMATICS_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectRawReadsAndCram = preset.protectRawReadsAndCram
			this.protectFinalVcfCalls = preset.protectFinalVcfCalls
			this.protectAlignmentAndVariantIndexes = preset.protectAlignmentAndVariantIndexes
			this.requireBamOrCramForSamPrune = preset.requireBamOrCramForSamPrune
			this.keepRecentPipelineDaysInput = String(preset.keepRecentPipelineDays)
			this.minSizeKbInput = String(preset.minSizeKb)
			this.verdictFilter = 'all'
			this.visibleLimit = 25
		},
		resetFilters() {
			this.familyFilter = 'all'
			this.verdictFilter = 'all'
			this.minSizeKbInput = '0'
			this.searchQueryInput = ''
			this.visibleLimit = 25
		},
		getMemberOverride(selectionKey) {
			return this.memberOverrides[selectionKey] || 'auto'
		},
		setMemberOverride(selectionKey, value) {
			if (this.selectedCluster && this.selectedClusterId === null) {
				this.selectedClusterId = this.selectedCluster.id
			}
			this.$set(this.memberOverrides, selectionKey, value)
		},
		formatVerdictLabel(verdict) {
			const map = {
				'raw-read-cram-protected': this.t('duplicatefinder', 'FASTQ.GZ / CRAM'),
				'final-vcf-protected': this.t('duplicatefinder', 'VCF.GZ / BCF'),
				'index-sidecar-protected': this.t('duplicatefinder', '.bai / .crai / .tbi'),
				'uncompressed-sam-redundant': this.t('duplicatefinder', 'Redundant .sam'),
				'pipeline-work-intermediate': this.t('duplicatefinder', 'Pipeline Work'),
				'matrix-notebook-duplicate': this.t('duplicatefinder', 'Matrix / Notebook'),
			}
			return map[verdict] || verdict
		},
		verdictPillClass(verdict) {
			if (verdict === 'uncompressed-sam-redundant') {
				return 'is-security'
			}
			if (verdict === 'raw-read-cram-protected' || verdict === 'final-vcf-protected' || verdict === 'index-sidecar-protected') {
				return 'is-keep'
			}
			if (verdict === 'matrix-notebook-duplicate') {
				return 'is-consolidate'
			}
			if (verdict === 'pipeline-work-intermediate') {
				return 'is-reclaim'
			}
			return 'is-warn'
		},
		actionPillClass(member) {
			if (member.action === 'delete') {
				return member.isRedundantSamMember ? 'is-security' : 'is-reclaim'
			}
			if (member.action === 'hardlink') {
				return 'is-consolidate'
			}
			return member.shielded ? 'is-keep' : 'is-warn'
		},
		formatMemberActionLabel(member) {
			if (member.action === 'delete') {
				return (this.strategy === 'quarantine-uncompressed-sam-and-scratch' && (member.isUncompressedSam || member.isPipelineWorkPath))
					? this.t('duplicatefinder', 'QUARANTINE')
					: this.t('duplicatefinder', 'RECLAIM')
			}
			if (member.action === 'hardlink') {
				return this.t('duplicatefinder', 'HARDLINK')
			}
			if (member.isSurvivor) {
				return this.t('duplicatefinder', 'KEEP (SURVIVOR)')
			}
			return member.shielded
				? this.t('duplicatefinder', 'KEEP (SHIELDED)')
				: this.t('duplicatefinder', 'KEEP')
		},
		findSourceDuplicate(cluster) {
			if (!cluster) {
				return null
			}
			return cluster.group
				|| this.activePool.find(g => g && g.id === cluster.id)
				|| this.activePool.find(g => g && g.hash && g.hash === cluster.hash)
				|| null
		},
		jumpToDuplicate(cluster) {
			const target = this.findSourceDuplicate(cluster)
			if (target) {
				this.$emit('select-duplicate', target)
			}
		},
		compareDuplicate(cluster) {
			const target = this.findSourceDuplicate(cluster)
			if (target) {
				this.$emit('compare-duplicate', target)
			}
		},
		async copyMemberPath(path) {
			const ok = await copyTextSafely(path)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied Genomics or Sequencing vault file path to clipboard.'))
			} else {
				this.setNotice(this.t('duplicatefinder', 'Unable to copy path to clipboard.'), 'error')
			}
		},
		async copyRemediationScript() {
			const ok = await copyTextSafely(this.generatedScript)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 Genomics & Sequencing remediation script to clipboard.'))
			} else {
				this.setNotice(this.t('duplicatefinder', 'Unable to copy script to clipboard.'), 'error')
			}
		},
		async copySyncExcludeSnippet() {
			const ok = await copyTextSafely(this.generatedSyncExclude)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied .sync-exclude.lst rules to clipboard.'))
			} else {
				this.setNotice(this.t('duplicatefinder', 'Unable to copy .sync-exclude.lst rules to clipboard.'), 'error')
			}
		},
		triggerDownload(content, filename, mimeType) {
			if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
				return false
			}
			const blob = new Blob([content], { type: mimeType })
			const objectUrl = URL.createObjectURL(blob)
			const anchor = document.createElement('a')
			anchor.href = objectUrl
			anchor.download = filename
			anchor.style.display = 'none'
			document.body.appendChild(anchor)
			anchor.click()
			document.body.removeChild(anchor)
			if (typeof URL.revokeObjectURL === 'function') {
				URL.revokeObjectURL(objectUrl)
			}
			return true
		},
		exportAuditCsv() {
			const csv = buildGenomicsBioinformaticsCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-genomics-bioinformatics-vault-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe Genomics & Bioinformatics Vault CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildGenomicsBioinformaticsJsonManifest(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-genomics-bioinformatics-vault-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported Genomics & Bioinformatics Vault JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.genomics-bioinformatics-vault-workbench {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 14px;
	margin-block-end: 16px;
	border: 1px solid var(--color-border-dark, var(--color-border));
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	box-sizing: border-box;
	min-inline-size: 0;
	max-inline-size: 100%;
	overflow-x: clip;
}

.gbv__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
}

.gbv__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.gbv__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.gbv__status-badge {
	display: inline-flex;
	align-items: center;
	padding-block: 4px;
	padding-inline: 10px;
	border-radius: 6px;
	background-color: var(--color-background-hover);
	border: 1px solid var(--color-border);
	font-family: monospace;
	font-size: 0.8rem;
	font-weight: 600;
	max-inline-size: 100%;
	overflow-wrap: anywhere;
}

.gbv__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.gbv__tool-btn,
.gbv__seg-btn,
.gbv__primary-btn,
.gbv__load-more-btn,
.gbv__mini-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-block-size: 44px;
	min-inline-size: 44px;
	padding-block: 6px;
	padding-inline: 12px;
	border: 1px solid var(--color-border-dark, var(--color-border));
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-size: 0.85rem;
	font-weight: 600;
	cursor: pointer;
	box-sizing: border-box;
	max-inline-size: 100%;
	text-align: center;
}

.gbv__tool-btn:hover:not(:disabled),
.gbv__seg-btn:hover:not(:disabled),
.gbv__load-more-btn:hover:not(:disabled),
.gbv__mini-btn:hover:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element);
}

.gbv__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.gbv__tool-btn.is-primary-outline,
.gbv__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.gbv__primary-btn {
	background-color: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #fff);
}

.gbv__tool-btn:focus-visible,
.gbv__seg-btn:focus-visible,
.gbv__primary-btn:focus-visible,
.gbv__load-more-btn:focus-visible,
.gbv__mini-btn:focus-visible,
.gbv__cluster-card:focus-visible,
.gbv__input:focus-visible,
.gbv__override-select:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.gbv__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 6px;
	font-size: 0.85rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.gbv__notice.is-success {
	background-color: var(--color-background-hover);
	border-color: var(--color-success, #2d8a4e);
}

.gbv__notice.is-error {
	background-color: var(--color-background-hover);
	border-color: var(--color-error, #b91c1c);
}

.gbv__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.gbv__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.gbv__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.gbv__kpi-val {
	font-size: 0.92rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.gbv__kpi-val.is-accent {
	color: var(--color-primary-element);
}

.gbv__kpi-val.is-warn {
	color: var(--color-warning-text, var(--color-main-text));
}

.gbv__kpi-val.is-danger {
	color: var(--color-error, #b91c1c);
}

.gbv__empty-banner,
.gbv__empty-filter {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 12px 14px;
	border: 1px dashed var(--color-border-dark, var(--color-border));
	border-radius: 6px;
	background-color: var(--color-background-hover);
}

.gbv__empty-text {
	flex: 1 1 240px;
	min-inline-size: 0;
}

.gbv__empty-title {
	margin: 0 0 4px;
	font-weight: 700;
	font-size: 0.92rem;
}

.gbv__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
}

.gbv__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
}

.gbv__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.gbv__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	min-inline-size: 96px;
}

.gbv__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
}

.gbv__inputs-row {
	align-items: flex-end;
}

.gbv__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.gbv__field-grow {
	flex: 1 1 180px;
}

.gbv__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.gbv__input,
.gbv__override-select {
	min-block-size: 44px;
	padding-block: 6px;
	padding-inline: 10px;
	border: 1px solid var(--color-border-dark, var(--color-border));
	border-radius: 6px;
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.85rem;
	box-sizing: border-box;
	max-inline-size: 100%;
}

.gbv__num-input {
	inline-size: 96px;
}

.gbv__workspace {
	display: grid;
	grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
	gap: 12px;
	min-inline-size: 0;
}

.gbv__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 640px;
	overflow-y: auto;
	min-inline-size: 0;
}

.gbv__cluster-card {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px 12px;
	min-block-size: 44px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	text-align: start;
	cursor: pointer;
	min-inline-size: 0;
	max-inline-size: 100%;
	box-sizing: border-box;
}

.gbv__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.gbv__cluster-top,
.gbv__cluster-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
}

.gbv__cluster-name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.gbv__cluster-meta,
.gbv__cluster-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
}

.gbv__tag {
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: 4px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-family: monospace;
	font-size: 0.75rem;
}

.gbv__badge,
.gbv__pill {
	display: inline-flex;
	align-items: center;
	padding-block: 2px;
	padding-inline: 7px;
	border-radius: 999px;
	font-size: 0.74rem;
	font-weight: 700;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
}

.gbv__pill.is-keep,
.gbv__badge.is-keep {
	border-color: var(--color-success, #2d8a4e);
}

.gbv__pill.is-security,
.gbv__badge.is-security {
	border-color: var(--color-error, #b91c1c);
	color: var(--color-error, #b91c1c);
}

.gbv__pill.is-consolidate,
.gbv__badge.is-consolidate {
	border-color: var(--color-primary-element);
}

.gbv__pill.is-warn,
.gbv__badge.is-warn {
	border-color: var(--color-warning, #b45309);
}

.gbv__pill.is-reclaim {
	border-color: var(--color-primary-element);
}

.gbv__cluster-reclaim {
	font-family: monospace;
	font-size: 0.84rem;
}

.gbv__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.gbv__inspector-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 8px;
	border-block-end: 1px solid var(--color-border);
}

.gbv__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.gbv__inspector-title {
	margin: 0 0 4px;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.gbv__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	font-family: monospace;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.gbv__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.gbv__lineage-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.gbv__lineage-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.gbv__lineage-label {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
}

.gbv__lineage-val {
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.gbv__lineage-val.is-accent {
	color: var(--color-primary-element);
}

.gbv__members-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.gbv__member-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.gbv__member-top,
.gbv__member-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.gbv__member-path {
	font-size: 0.8rem;
	overflow-wrap: anywhere;
	min-inline-size: 0;
	flex: 1 1 200px;
}

.gbv__member-pills,
.gbv__member-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
}

.gbv__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	min-inline-size: 0;
}

.gbv__code-panels {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.gbv__code-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.gbv__code-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
}

.gbv__pre {
	margin: 0;
	padding: 8px;
	border-radius: 4px;
	background-color: var(--color-background-hover);
	font-family: monospace;
	font-size: 0.75rem;
	max-block-size: 200px;
	overflow: auto;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}

.gbv__sr-only {
	position: absolute;
	inline-size: 1px;
	block-size: 1px;
	padding: 0;
	margin: -1px;
	overflow: hidden;
	clip-path: inset(50%);
	white-space: nowrap;
	border: 0;
}

@media (max-width: 1120px) {
	.gbv__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.gbv__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.gbv__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 640px) {
	.genomics-bioinformatics-vault-workbench {
		padding: 10px;
	}

	.gbv__kpis,
	.gbv__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.gbv__num-input {
		inline-size: 100%;
	}

	.gbv__field {
		flex: 1 1 100%;
	}
}
</style>
