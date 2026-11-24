<template>
	<section
		class="scientific-research-vault-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Academic Research, LaTeX/BibTeX and Scientific Dataset Vault Auditor')">
		<header class="srv__toolbar">
			<div class="srv__title-group">
				<h3 class="srv__title">
					{{ t('duplicatefinder', 'Academic Research, LaTeX/BibTeX & Scientific Dataset Vault Auditor') }}
				</h3>
				<span
					class="srv__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} ({gb}) reclaimable / {masters} canonical masters & {notebooks} notebook guards', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						gb: analysis.summary.reclaimableGb,
						masters: analysis.summary.totalCanonicalMasterClusters,
						notebooks: analysis.summary.totalNotebookGuardClusters,
					}) }}
				</span>
			</div>

			<div class="srv__toolbar-actions">
				<button
					type="button"
					class="srv__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="srv__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="srv__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="srv__tool-btn is-close"
					aria-keyshortcuts="F8"
					:title="t('duplicatefinder', 'Hide Academic Research, LaTeX/BibTeX and Scientific Dataset Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Research Vault') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="srv__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="srv__kpis">
			<div class="srv__kpi">
				<span class="srv__kpi-label">{{ t('duplicatefinder', 'Safe Research Vault Reclaim') }}</span>
				<strong class="srv__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.reclaimableGb }} / {{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="srv__kpi">
				<span class="srv__kpi-label">{{ t('duplicatefinder', 'Canonical Masters & Notebook Guards') }}</span>
				<strong class="srv__kpi-val is-warn">
					{{ analysis.summary.totalCanonicalMasterClusters }} {{ t('duplicatefinder', 'masters') }} / {{ analysis.summary.totalNotebookGuardClusters }} {{ t('duplicatefinder', 'notebooks') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="srv__kpi">
				<span class="srv__kpi-label">{{ t('duplicatefinder', 'Papers / LaTeX Builds / Figures') }}</span>
				<strong class="srv__kpi-val">
					{{ analysis.summary.distinctPapersCount }} {{ t('duplicatefinder', 'papers') }} / {{ analysis.summary.totalLatexBuildClusters }} {{ t('duplicatefinder', 'builds') }} / {{ analysis.summary.totalFigureCheckpointClusters }} {{ t('duplicatefinder', 'mirrors') }}
				</strong>
			</div>
			<div class="srv__kpi">
				<span class="srv__kpi-label">{{ t('duplicatefinder', 'Raw Scientific Footprint') }}</span>
				<strong class="srv__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="srv__empty-banner"
			role="note">
			<div class="srv__empty-text">
				<p class="srv__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure canonical .tex/.bib/HDF5/NetCDF and notebook guards before scanning') }}
				</p>
				<p class="srv__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit duplicate manuscripts & bibliography (.tex/.bib/.pdf preprints/.docx), scientific datasets & notebooks (.ipynb/.hdf5/.h5/.nc/.fits/.mat/.parquet/.csv), LaTeX build artifacts (.aux/.bbl/.blg/.fls/.fdb_latexmk/.synctex.gz/.log), and figure/checkpoint mirrors (.eps/.svg/.png plots/.ipynb_checkpoints).') }}
				</p>
			</div>
			<button
				type="button"
				class="srv__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="srv__controls">
			<div class="srv__control-row">
				<span class="srv__control-label">{{ t('duplicatefinder', 'Research Preset') }}</span>
				<div
					class="srv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Academic research and scientific dataset vault presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="srv__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="srv__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="srv__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="srv__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="srv__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="srv__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="srv__seg-btn"
					:class="{ 'is-active': protectCanonicalMasters }"
					:aria-pressed="protectCanonicalMasters ? 'true' : 'false'"
					@click="protectCanonicalMasters = !protectCanonicalMasters">
					<span>{{ protectCanonicalMasters ? t('duplicatefinder', 'Shield Canonical .tex/.bib/HDF5/NetCDF: ON') : t('duplicatefinder', 'Shield Canonical .tex/.bib/HDF5/NetCDF: OFF') }}</span>
				</button>

				<button
					type="button"
					class="srv__seg-btn"
					:class="{ 'is-active': protectCanonicalNotebooks }"
					:aria-pressed="protectCanonicalNotebooks ? 'true' : 'false'"
					@click="protectCanonicalNotebooks = !protectCanonicalNotebooks">
					<span>{{ protectCanonicalNotebooks ? t('duplicatefinder', 'Shield Canonical .ipynb Notebooks: ON') : t('duplicatefinder', 'Shield Canonical .ipynb Notebooks: OFF') }}</span>
				</button>
			</div>

			<div class="srv__control-row srv__inputs-row">
				<label class="srv__field">
					<span class="srv__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="srv__input">
						<option value="prune-build-artifacts-and-mirrors">{{ t('duplicatefinder', 'Prune LaTeX Builds & Redundant Mirrors') }}</option>
						<option value="consolidate-research-vault-hardlinks">{{ t('duplicatefinder', 'Hardlink-Consolidate Scientific Datasets') }}</option>
						<option value="prune-latex-build-and-checkpoints-only">{{ t('duplicatefinder', 'Prune LaTeX Builds & Checkpoints Only') }}</option>
					</select>
				</label>

				<label class="srv__field">
					<span class="srv__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="srv__input">
						<option value="canonical-tex-bib-hdf5-netcdf-first">{{ t('duplicatefinder', 'Canonical .tex / .bib / HDF5 / NetCDF first') }}</option>
						<option value="latest-revision-first">{{ t('duplicatefinder', 'Latest Experiment / Draft Revision first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical path') }}</option>
					</select>
				</label>

				<label class="srv__field">
					<span class="srv__field-label">{{ t('duplicatefinder', 'Stale Build (d)') }}</span>
					<input
						v-model="staleArtifactDaysInput"
						type="number"
						min="0"
						step="1"
						class="srv__input srv__num-input">
				</label>

				<label class="srv__field">
					<span class="srv__field-label">{{ t('duplicatefinder', 'Min Size (MiB)') }}</span>
					<input
						v-model="minSizeMbInput"
						type="number"
						min="0"
						step="1"
						class="srv__input srv__num-input">
				</label>

				<label class="srv__field srv__field-grow">
					<span class="srv__field-label">{{ t('duplicatefinder', 'Filter Paper, Experiment, Dataset or Path') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="srv__input"
						:placeholder="t('duplicatefinder', 'e.g. .tex, .bib, .hdf5, .nc, .ipynb, .synctex.gz, .eps')">
				</label>

				<label class="srv__field srv__field-grow">
					<span class="srv__field-label">{{ t('duplicatefinder', 'Nextcloud Data Root') }}</span>
					<input
						v-model="dataRootInput"
						type="text"
						class="srv__input"
						placeholder="/var/www/nextcloud/data">
				</label>

				<label class="srv__field">
					<span class="srv__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="srv__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Master & notebook guard risk') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Artifact name (A-Z)') }}</option>
					</select>
				</label>
			</div>

			<div class="srv__control-row">
				<span class="srv__control-label">{{ t('duplicatefinder', 'Vault Family') }}</span>
				<div
					class="srv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Academic research vault family filter')">
					<button
						type="button"
						class="srv__seg-btn"
						:class="{ 'is-active': familyFilter === 'all' }"
						:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
						@click="familyFilter = 'all'">
						<span>{{ t('duplicatefinder', 'All Families ({count})', { count: analysis.summary.totalUnfilteredClustersCount }) }}</span>
					</button>
					<button
						v-for="fam in analysis.familyBreakdown"
						:key="fam.id"
						type="button"
						class="srv__seg-btn"
						:class="{ 'is-active': familyFilter === fam.id }"
						:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
						:title="fam.shortLabel"
						@click="familyFilter = fam.id">
						<span>{{ fam.label }} ({{ fam.clustersCount }})</span>
					</button>
				</div>
			</div>

			<div class="srv__control-row">
				<span class="srv__control-label">{{ t('duplicatefinder', 'Verdict') }}</span>
				<div
					class="srv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Academic research vault verdict filter')">
					<button
						v-for="opt in verdictFilterOptions"
						:key="opt.id"
						type="button"
						class="srv__seg-btn"
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
			class="srv__empty-filter"
			role="note">
			<p class="srv__empty-title">
				{{ t('duplicatefinder', 'No manuscript, scientific dataset, LaTeX build or figure/checkpoint duplicate clusters match the active filters.') }}
			</p>
			<button
				type="button"
				class="srv__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="srv__workspace">
			<div
				class="srv__cluster-list"
				role="list"
				:aria-label="t('duplicatefinder', 'Audited academic research and scientific dataset clusters')">
				<button
					v-for="cluster in visibleClusters"
					:key="cluster.groupKey"
					type="button"
					class="srv__cluster-card"
					:class="{ 'is-selected': selectedCluster && selectedCluster.groupKey === cluster.groupKey }"
					@click="selectedClusterKey = cluster.groupKey">
					<div class="srv__cluster-top">
						<strong class="srv__cluster-name">{{ cluster.displayName }}</strong>
						<span
							class="srv__pill"
							:class="riskPillClass(cluster.riskState)">
							{{ formatRiskLabel(cluster.riskState) }}
						</span>
					</div>
					<div class="srv__cluster-meta">
						<span class="srv__tag">{{ cluster.paperExperiment }}</span>
						<span class="srv__tag">{{ cluster.researchTool }}</span>
						<span class="srv__tag">{{ cluster.formatBadge }}</span>
					</div>
					<div class="srv__cluster-badges">
						<span
							v-if="cluster.hasCanonicalMaster"
							class="srv__badge is-keep">
							{{ t('duplicatefinder', 'Canonical Master') }}
						</span>
						<span
							v-if="cluster.hasCanonicalNotebook"
							class="srv__badge is-consolidate">
							{{ t('duplicatefinder', 'Notebook Guard') }}
						</span>
						<span
							v-if="cluster.family === 'latex-build-artifacts'"
							class="srv__badge is-warn">
							{{ t('duplicatefinder', 'LaTeX Build') }}
						</span>
						<span
							v-if="cluster.hasCheckpointMirror"
							class="srv__badge is-danger">
							{{ t('duplicatefinder', 'Checkpoint Mirror') }}
						</span>
					</div>
					<div class="srv__cluster-bottom">
						<span>{{ cluster.copiesCount }} {{ t('duplicatefinder', 'copies') }}</span>
						<strong class="srv__cluster-reclaim">{{ cluster.formattedReclaimableBytes }}</strong>
					</div>
				</button>

				<button
					v-if="analysis.clusters.length > visibleLimit"
					type="button"
					class="srv__load-more-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more clusters ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
				</button>
			</div>

			<div
				v-if="selectedCluster"
				class="srv__inspector">
				<header class="srv__inspector-head">
					<div class="srv__inspector-title-wrap">
						<h4 class="srv__inspector-title">
							{{ selectedCluster.displayName }}
						</h4>
						<p class="srv__inspector-sub">
							{{ selectedCluster.vaultKey }} | {{ selectedCluster.researchTool }} | {{ selectedCluster.familyLabel }}
						</p>
					</div>
					<div class="srv__inspector-actions">
						<button
							type="button"
							class="srv__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Open in Triage') }}</span>
						</button>
						<button
							type="button"
							class="srv__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Side-by-Side') }}</span>
						</button>
					</div>
				</header>

				<div class="srv__lineage-grid">
					<div class="srv__lineage-item">
						<span class="srv__lineage-label">{{ t('duplicatefinder', 'Paper / Experiment') }}</span>
						<strong class="srv__lineage-val">{{ selectedCluster.paperExperiment }} ({{ selectedCluster.revisionLabel }})</strong>
					</div>
					<div class="srv__lineage-item">
						<span class="srv__lineage-label">{{ t('duplicatefinder', 'Dataset / Manuscript Signature') }}</span>
						<strong class="srv__lineage-val">{{ selectedCluster.datasetSignature }}</strong>
					</div>
					<div class="srv__lineage-item">
						<span class="srv__lineage-label">{{ t('duplicatefinder', 'Master & Notebook Protection') }}</span>
						<strong class="srv__lineage-val">
							{{ selectedCluster.hasCanonicalMaster ? t('duplicatefinder', 'Canonical Master Guard') : t('duplicatefinder', 'Standard Research Artifact') }}
							|
							{{ selectedCluster.hasCanonicalNotebook ? t('duplicatefinder', 'Jupyter Notebook Guard') : selectedCluster.formatBadge }}
						</strong>
					</div>
					<div class="srv__lineage-item">
						<span class="srv__lineage-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<strong class="srv__lineage-val is-accent">
							{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableGb }})
						</strong>
					</div>
				</div>

				<div class="srv__members-list">
					<div
						v-for="member in selectedCluster.members"
						:key="member.selectionKey"
						class="srv__member-card">
						<div class="srv__member-top">
							<code class="srv__member-path">{{ member.path }}</code>
							<div class="srv__member-pills">
								<span
									class="srv__pill"
									:class="authorityPillClass(member.authorityScore)">
									{{ t('duplicatefinder', 'Authority {score}', { score: member.authorityScore }) }}
								</span>
								<span
									class="srv__pill"
									:class="verdictPillClass(member.verdict)">
									{{ member.verdict }}
								</span>
							</div>
						</div>
						<div class="srv__member-bottom">
							<div class="srv__member-meta">
								<span>{{ member.formattedSize }}</span>
								<span>{{ member.formattedMtime }}</span>
								<span>{{ member.verdictReason }}</span>
							</div>
							<label
								v-if="member.verdict !== 'keep-canonical-survivor'"
								class="srv__override-field">
								<span class="srv__sr-only">{{ t('duplicatefinder', 'Override verdict') }}</span>
								<select
									class="srv__override-select"
									:value="getMemberOverride(member.selectionKey)"
									@change="setMemberOverride(member.selectionKey, $event.target.value)">
									<option value="auto">{{ t('duplicatefinder', 'Auto') }}</option>
									<option value="keep">{{ t('duplicatefinder', 'Force Keep / Shield') }}</option>
									<option value="prune">{{ t('duplicatefinder', 'Force Remediate') }}</option>
								</select>
							</label>
						</div>
					</div>
				</div>

				<div class="srv__code-panels">
					<div class="srv__code-box">
						<div class="srv__code-head">
							<strong>{{ t('duplicatefinder', 'DRY_RUN=1 POSIX Cleanup Script') }}</strong>
							<button
								type="button"
								class="srv__mini-btn"
								@click="copyRemediationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="srv__pre"><code>{{ generatedScript }}</code></pre>
					</div>

					<div class="srv__code-box">
						<div class="srv__code-head">
							<strong>{{ t('duplicatefinder', 'Nextcloud .sync-exclude.lst Rules') }}</strong>
							<button
								type="button"
								class="srv__mini-btn"
								@click="copySyncExcludeSnippet">
								<span>{{ t('duplicatefinder', 'Copy Rules') }}</span>
							</button>
						</div>
						<pre class="srv__pre"><code>{{ generatedSyncExclude }}</code></pre>
					</div>
				</div>
			</div>
		</div>
	</section>
</template>

<script>
import { copyTextSafely } from '../tools/clipboardHelper'
import {
	SCIENTIFIC_RESEARCH_PRESETS,
	analyzeScientificResearchVault,
	buildScientificResearchCsvReport,
	buildScientificResearchJsonReport,
	buildScientificResearchRemediationScript,
	buildScientificResearchSyncExcludeSnippet,
} from '../tools/scientificResearchVaultAuditor'

export default {
	name: 'ScientificResearchVaultWorkbench',
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
			presetId: 'all-scientific-research-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'prune-build-artifacts-and-mirrors',
			survivorRule: 'canonical-tex-bib-hdf5-netcdf-first',
			protectCanonicalMasters: true,
			protectCanonicalNotebooks: true,
			staleArtifactDaysInput: '14',
			minSizeMbInput: '0',
			searchQueryInput: '',
			dataRootInput: '/var/www/nextcloud/data',
			sortMode: 'reclaim_desc',
			selectedClusterKey: '',
			visibleLimit: 25,
			memberOverrides: {},
			statusNotice: '',
			statusNoticeType: 'success',
		}
	},
	computed: {
		presets() {
			return SCIENTIFIC_RESEARCH_PRESETS
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable') },
				{ id: 'canonical-master', label: this.t('duplicatefinder', 'Canonical Masters') },
				{ id: 'notebook-guard', label: this.t('duplicatefinder', 'Notebook Guards') },
				{ id: 'latex-build', label: this.t('duplicatefinder', 'LaTeX Builds') },
				{ id: 'figure-checkpoint', label: this.t('duplicatefinder', 'Figures / Checkpoints') },
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
		parsedStaleArtifactDays() {
			const trimmed = String(this.staleArtifactDaysInput ?? '').trim()
			if (!trimmed) {
				return 14
			}
			const parsed = Number(trimmed)
			return Number.isFinite(parsed) && parsed >= 0 ? parsed : 14
		},
		parsedMinSizeMb() {
			const trimmed = String(this.minSizeMbInput ?? '').trim()
			if (!trimmed) {
				return 0
			}
			const parsed = Number(trimmed)
			return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
		},
		analysis() {
			return analyzeScientificResearchVault(this.activePool, {
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectCanonicalMasters: this.protectCanonicalMasters,
				protectCanonicalNotebooks: this.protectCanonicalNotebooks,
				staleArtifactDays: this.parsedStaleArtifactDays,
				minSizeMb: this.parsedMinSizeMb,
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
			if (this.selectedClusterKey) {
				const found = clusters.find(c => c.groupKey === this.selectedClusterKey)
				if (found) {
					return found
				}
			}
			if (this.currentDuplicateId !== null && this.currentDuplicateId !== undefined) {
				const byCurrent = clusters.find(c => c.primaryGroupId === this.currentDuplicateId)
				if (byCurrent) {
					return byCurrent
				}
			}
			return clusters[0]
		},
		generatedScript() {
			return buildScientificResearchRemediationScript(this.analysis, {
				dataRoot: this.dataRootInput,
			})
		},
		generatedSyncExclude() {
			return buildScientificResearchSyncExcludeSnippet(this.analysis)
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
		applyPreset(presetId) {
			const preset = SCIENTIFIC_RESEARCH_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectCanonicalMasters = preset.protectCanonicalMasters
			this.protectCanonicalNotebooks = preset.protectCanonicalNotebooks
			this.staleArtifactDaysInput = String(preset.staleArtifactDays)
			this.minSizeMbInput = String(preset.minSizeMb)
			this.verdictFilter = 'all'
			this.visibleLimit = 25
		},
		resetFilters() {
			this.familyFilter = 'all'
			this.verdictFilter = 'all'
			this.minSizeMbInput = '0'
			this.searchQueryInput = ''
			this.visibleLimit = 25
		},
		getMemberOverride(selectionKey) {
			return this.memberOverrides[selectionKey] || 'auto'
		},
		setMemberOverride(selectionKey, value) {
			if (this.selectedCluster && !this.selectedClusterKey) {
				this.selectedClusterKey = this.selectedCluster.groupKey
			}
			this.$set(this.memberOverrides, selectionKey, value)
		},
		formatRiskLabel(riskState) {
			const map = {
				reclaimable: this.t('duplicatefinder', 'Reclaimable'),
				consolidatable: this.t('duplicatefinder', 'Hardlink Ready'),
				'build-reclaimable': this.t('duplicatefinder', 'Stale LaTeX Build'),
				'canonical-master-protected': this.t('duplicatefinder', 'Canonical Master Protected'),
				'notebook-protected': this.t('duplicatefinder', 'Notebook Guarded'),
				shielded: this.t('duplicatefinder', 'Shielded'),
			}
			return map[riskState] || riskState
		},
		riskPillClass(riskState) {
			if (riskState === 'canonical-master-protected') {
				return 'is-danger'
			}
			if (riskState === 'notebook-protected' || riskState === 'shielded') {
				return 'is-warn'
			}
			if (riskState === 'consolidatable') {
				return 'is-consolidate'
			}
			return 'is-reclaim'
		},
		verdictPillClass(verdict) {
			if (verdict === 'keep-canonical-survivor') {
				return 'is-keep'
			}
			if (verdict === 'blocked-canonical-master' || verdict === 'blocked-canonical-notebook') {
				return 'is-danger'
			}
			if (verdict.startsWith('blocked-')) {
				return 'is-warn'
			}
			if (verdict === 'consolidate-hardlink-research-asset') {
				return 'is-consolidate'
			}
			return 'is-reclaim'
		},
		authorityPillClass(score) {
			if (score >= 80) {
				return 'is-keep'
			}
			if (score >= 50) {
				return 'is-consolidate'
			}
			return 'is-warn'
		},
		findSourceDuplicate(cluster) {
			if (!cluster) {
				return null
			}
			return this.activePool.find(g => g && g.id === cluster.primaryGroupId)
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
		async copyRemediationScript() {
			const ok = await copyTextSafely(this.generatedScript)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 Academic Research Vault remediation script to clipboard.'))
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
			const csv = buildScientificResearchCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-scientific-research-vault-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe Academic Research Vault CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildScientificResearchJsonReport(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-scientific-research-vault-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported Academic Research Vault JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.scientific-research-vault-workbench {
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

.srv__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
}

.srv__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.srv__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.srv__status-badge {
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

.srv__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.srv__tool-btn,
.srv__seg-btn,
.srv__primary-btn,
.srv__load-more-btn,
.srv__mini-btn {
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

.srv__tool-btn:hover:not(:disabled),
.srv__seg-btn:hover:not(:disabled),
.srv__load-more-btn:hover:not(:disabled),
.srv__mini-btn:hover:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element);
}

.srv__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.srv__tool-btn.is-primary-outline,
.srv__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.srv__primary-btn {
	background-color: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #fff);
}

.srv__tool-btn:focus-visible,
.srv__seg-btn:focus-visible,
.srv__primary-btn:focus-visible,
.srv__load-more-btn:focus-visible,
.srv__mini-btn:focus-visible,
.srv__cluster-card:focus-visible,
.srv__input:focus-visible,
.srv__override-select:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.srv__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 6px;
	font-size: 0.85rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.srv__notice.is-success {
	background-color: var(--color-background-hover);
	border-color: var(--color-success, #2d8a4e);
}

.srv__notice.is-error {
	background-color: var(--color-background-hover);
	border-color: var(--color-error, #b91c1c);
}

.srv__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.srv__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.srv__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.srv__kpi-val {
	font-size: 0.92rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.srv__kpi-val.is-accent {
	color: var(--color-primary-element);
}

.srv__kpi-val.is-warn {
	color: var(--color-warning-text, var(--color-main-text));
}

.srv__empty-banner,
.srv__empty-filter {
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

.srv__empty-text {
	flex: 1 1 240px;
	min-inline-size: 0;
}

.srv__empty-title {
	margin: 0 0 4px;
	font-weight: 700;
	font-size: 0.92rem;
}

.srv__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
}

.srv__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
}

.srv__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.srv__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	min-inline-size: 96px;
}

.srv__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
}

.srv__inputs-row {
	align-items: flex-end;
}

.srv__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.srv__field-grow {
	flex: 1 1 180px;
}

.srv__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.srv__input,
.srv__override-select {
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

.srv__num-input {
	inline-size: 96px;
}

.srv__workspace {
	display: grid;
	grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
	gap: 12px;
	min-inline-size: 0;
}

.srv__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 640px;
	overflow-y: auto;
	min-inline-size: 0;
}

.srv__cluster-card {
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

.srv__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.srv__cluster-top,
.srv__cluster-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
}

.srv__cluster-name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.srv__cluster-meta,
.srv__cluster-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
}

.srv__tag {
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: 4px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-family: monospace;
	font-size: 0.75rem;
}

.srv__badge,
.srv__pill {
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

.srv__pill.is-keep,
.srv__badge.is-keep {
	border-color: var(--color-success, #2d8a4e);
}

.srv__pill.is-danger,
.srv__badge.is-danger {
	border-color: var(--color-error, #b91c1c);
}

.srv__pill.is-consolidate,
.srv__badge.is-consolidate {
	border-color: var(--color-primary-element);
}

.srv__pill.is-warn,
.srv__badge.is-warn {
	border-color: var(--color-warning, #b45309);
}

.srv__cluster-reclaim {
	font-family: monospace;
	font-size: 0.84rem;
}

.srv__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.srv__inspector-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 8px;
	border-block-end: 1px solid var(--color-border);
}

.srv__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.srv__inspector-title {
	margin: 0 0 4px;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.srv__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	font-family: monospace;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.srv__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.srv__lineage-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.srv__lineage-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.srv__lineage-label {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
}

.srv__lineage-val {
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.srv__lineage-val.is-accent {
	color: var(--color-primary-element);
}

.srv__members-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.srv__member-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.srv__member-top,
.srv__member-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.srv__member-path {
	font-size: 0.8rem;
	overflow-wrap: anywhere;
	min-inline-size: 0;
	flex: 1 1 200px;
}

.srv__member-pills {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.srv__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	min-inline-size: 0;
}

.srv__code-panels {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.srv__code-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.srv__code-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
}

.srv__pre {
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

.srv__sr-only {
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
	.srv__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.srv__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.srv__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 640px) {
	.scientific-research-vault-workbench {
		padding: 10px;
	}

	.srv__kpis,
	.srv__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.srv__num-input {
		inline-size: 100%;
	}

	.srv__field {
		flex: 1 1 100%;
	}
}
</style>
