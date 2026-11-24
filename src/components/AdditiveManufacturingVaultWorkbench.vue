<template>
	<section
		class="additive-mfg-vault-workbench"
		role="region"
		:aria-label="t('duplicatefinder', '3D Printing, CNC and Additive Manufacturing Vault Auditor')">
		<header class="amv__toolbar">
			<div class="amv__title-group">
				<h3 class="amv__title">
					{{ t('duplicatefinder', '3D Printing, CNC & Additive Manufacturing Vault Auditor') }}
				</h3>
				<span
					class="amv__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} ({gb}) reclaimable / {meshes} meshes vs {slices} slices & {cads} CAD/STEP', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						gb: analysis.summary.reclaimableGb,
						meshes: analysis.summary.totalMeshDuplicateClusters,
						slices: analysis.summary.totalRegeneratedSliceClusters,
						cads: analysis.summary.totalCadSourceClusters,
					}) }}
				</span>
			</div>

			<div class="amv__toolbar-actions">
				<button
					type="button"
					class="amv__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="amv__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="amv__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="amv__tool-btn is-close"
					aria-keyshortcuts="F7"
					:title="t('duplicatefinder', 'Hide 3D Printing, CNC and Additive Manufacturing Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide 3D Print & CNC') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="amv__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="amv__kpis">
			<div class="amv__kpi">
				<span class="amv__kpi-label">{{ t('duplicatefinder', 'Safe Additive Vault Reclaim') }}</span>
				<strong class="amv__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.reclaimableGb }} / {{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="amv__kpi">
				<span class="amv__kpi-label">{{ t('duplicatefinder', 'Mesh Duplicates vs Regenerated Slices') }}</span>
				<strong class="amv__kpi-val is-warn">
					{{ analysis.summary.totalMeshDuplicateClusters }} {{ t('duplicatefinder', 'meshes') }} / {{ analysis.summary.totalRegeneratedSliceClusters }} {{ t('duplicatefinder', 'slices') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="amv__kpi">
				<span class="amv__kpi-label">{{ t('duplicatefinder', 'CAD/STEP Sources & Slicer Profiles') }}</span>
				<strong class="amv__kpi-val">
					{{ analysis.summary.distinctModelPartsCount }} {{ t('duplicatefinder', 'parts') }} / {{ analysis.summary.totalCadSourceClusters }} {{ t('duplicatefinder', 'CAD') }} / {{ analysis.summary.totalProfileClusters }} {{ t('duplicatefinder', 'profiles') }} / {{ analysis.summary.totalSlaResinClusters }} {{ t('duplicatefinder', 'SLA') }}
				</strong>
			</div>
			<div class="amv__kpi">
				<span class="amv__kpi-label">{{ t('duplicatefinder', 'Raw Fabrication Footprint') }}</span>
				<strong class="amv__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="amv__empty-banner"
			role="note">
			<div class="amv__empty-text">
				<p class="amv__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure CAD/STEP conservation and slicer profile guards before scanning') }}
				</p>
				<p class="amv__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit CAD/STEP masters (.step, .stp, .f3d, .fcstd), 3D meshes (.stl, .3mf, .obj), ephemeral slices (.gcode, .bgcode, .ctb, .goo, CNC .nc), and PrusaSlicer/Bambu/Orca profiles (.ini, .json) while preserving source geometry.') }}
				</p>
			</div>
			<button
				type="button"
				class="amv__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="amv__controls">
			<div class="amv__control-row">
				<span class="amv__control-label">{{ t('duplicatefinder', 'Fab Preset') }}</span>
				<div
					class="amv__segments"
					role="group"
					:aria-label="t('duplicatefinder', '3D Printing, CNC and Additive Manufacturing vault presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="amv__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="amv__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="amv__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="amv__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="amv__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="amv__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="amv__seg-btn"
					:class="{ 'is-active': protectCadStepSources }"
					:aria-pressed="protectCadStepSources ? 'true' : 'false'"
					@click="protectCadStepSources = !protectCadStepSources">
					<span>{{ protectCadStepSources ? t('duplicatefinder', 'Shield CAD/STEP Sources: ON') : t('duplicatefinder', 'Shield CAD/STEP Sources: OFF') }}</span>
				</button>

				<button
					type="button"
					class="amv__seg-btn"
					:class="{ 'is-active': protectSlicerProfiles }"
					:aria-pressed="protectSlicerProfiles ? 'true' : 'false'"
					@click="protectSlicerProfiles = !protectSlicerProfiles">
					<span>{{ protectSlicerProfiles ? t('duplicatefinder', 'Shield Slicer Profiles & 3MF: ON') : t('duplicatefinder', 'Shield Slicer Profiles & 3MF: OFF') }}</span>
				</button>

				<button
					type="button"
					class="amv__seg-btn"
					:class="{ 'is-active': protectProductionPlates }"
					:aria-pressed="protectProductionPlates ? 'true' : 'false'"
					@click="protectProductionPlates = !protectProductionPlates">
					<span>{{ protectProductionPlates ? t('duplicatefinder', 'Shield Production Plates: ON') : t('duplicatefinder', 'Shield Production Plates: OFF') }}</span>
				</button>
			</div>

			<div class="amv__control-row amv__inputs-row">
				<label class="amv__field">
					<span class="amv__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="amv__input">
						<option value="prune-ephemeral-slices-keep-cad">{{ t('duplicatefinder', 'Prune Ephemeral Slices & Keep CAD/STEP') }}</option>
						<option value="consolidate-mesh-hardlinks">{{ t('duplicatefinder', 'Hardlink-Consolidate Identical Meshes') }}</option>
						<option value="prune-spool-prints-only">{{ t('duplicatefinder', 'Prune Spool / SD-Card G-code Only') }}</option>
					</select>
				</label>

				<label class="amv__field">
					<span class="amv__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="amv__input">
						<option value="cad-step-source-first">{{ t('duplicatefinder', 'CAD/STEP Master & Production first') }}</option>
						<option value="slicer-3mf-project-first">{{ t('duplicatefinder', '3MF Project / Slicer Profile first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical path') }}</option>
					</select>
				</label>

				<label class="amv__field">
					<span class="amv__field-label">{{ t('duplicatefinder', 'Spool Age (d)') }}</span>
					<input
						v-model="staleSliceDaysInput"
						type="number"
						min="0"
						step="1"
						class="amv__input amv__num-input">
				</label>

				<label class="amv__field">
					<span class="amv__field-label">{{ t('duplicatefinder', 'Min Size (MiB)') }}</span>
					<input
						v-model="minSizeMbInput"
						type="number"
						min="0"
						step="1"
						class="amv__input amv__num-input">
				</label>

				<label class="amv__field amv__field-grow">
					<span class="amv__field-label">{{ t('duplicatefinder', 'Filter Part Stem, Printer, Slicer or Material') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="amv__input"
						:placeholder="t('duplicatefinder', 'e.g. extruder, .step, .3mf, .bgcode, .ctb, MK4, Bambu, Orca')">
				</label>

				<label class="amv__field amv__field-grow">
					<span class="amv__field-label">{{ t('duplicatefinder', 'Nextcloud Data Root') }}</span>
					<input
						v-model="dataRootInput"
						type="text"
						class="amv__input"
						placeholder="/var/www/nextcloud/data">
				</label>

				<label class="amv__field">
					<span class="amv__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="amv__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="ephemeral_risk_desc">{{ t('duplicatefinder', 'Ephemeral slice priority') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Part filename (A-Z)') }}</option>
					</select>
				</label>
			</div>

			<div class="amv__control-row">
				<span class="amv__control-label">{{ t('duplicatefinder', 'Vault Family') }}</span>
				<div
					class="amv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Additive manufacturing vault family filter')">
					<button
						type="button"
						class="amv__seg-btn"
						:class="{ 'is-active': familyFilter === 'all' }"
						:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
						@click="familyFilter = 'all'">
						<span>{{ t('duplicatefinder', 'All Families ({count})', { count: analysis.summary.totalUnfilteredClustersCount }) }}</span>
					</button>
					<button
						v-for="fam in analysis.familyBreakdown"
						:key="fam.id"
						type="button"
						class="amv__seg-btn"
						:class="{ 'is-active': familyFilter === fam.id }"
						:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
						:title="fam.shortLabel"
						@click="familyFilter = fam.id">
						<span>{{ fam.label }} ({{ fam.clustersCount }})</span>
					</button>
				</div>
			</div>

			<div class="amv__control-row">
				<span class="amv__control-label">{{ t('duplicatefinder', 'Mesh & Slice') }}</span>
				<div
					class="amv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Additive vault mesh vs slice verdict filter')">
					<button
						v-for="opt in verdictFilterOptions"
						:key="opt.id"
						type="button"
						class="amv__seg-btn"
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
			class="amv__empty-filter"
			role="note">
			<p class="amv__empty-title">
				{{ t('duplicatefinder', 'No CAD/STEP sources, 3D meshes, G-code/SLA resin slices, CNC toolpaths or slicer profile duplicate clusters match the active filters.') }}
			</p>
			<button
				type="button"
				class="amv__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="amv__workspace">
			<div
				class="amv__cluster-list"
				role="list"
				:aria-label="t('duplicatefinder', 'Audited 3D printing, CNC and additive manufacturing clusters')">
				<button
					v-for="cluster in visibleClusters"
					:key="cluster.groupKey"
					type="button"
					class="amv__cluster-card"
					:class="{ 'is-selected': selectedCluster && selectedCluster.groupKey === cluster.groupKey }"
					@click="selectedClusterKey = cluster.groupKey">
					<div class="amv__cluster-top">
						<strong class="amv__cluster-name">{{ cluster.displayName }}</strong>
						<span
							class="amv__pill"
							:class="riskPillClass(cluster.riskState)">
							{{ formatRiskLabel(cluster.riskState) }}
						</span>
					</div>
					<div class="amv__cluster-meta">
						<span class="amv__tag">{{ cluster.projectWorkspace }}</span>
						<span class="amv__tag">{{ cluster.modelPartStem }}</span>
						<span class="amv__tag">{{ cluster.machineProfile }}</span>
					</div>
					<div class="amv__cluster-badges">
						<span
							class="amv__badge"
							:class="duplicationBadgeClass(cluster.duplicationClass)">
							{{ cluster.duplicationBadge }}
						</span>
						<span
							class="amv__badge"
							:class="lineageBadgeClass(cluster)">
							{{ cluster.sliceLineageBadge }}
						</span>
						<span
							v-if="cluster.hasProductionPlate"
							class="amv__badge is-danger">
							{{ t('duplicatefinder', 'Production Plate') }}
						</span>
						<span
							v-if="cluster.hasSlaResinSlice"
							class="amv__badge is-warn">
							{{ t('duplicatefinder', 'SLA Resin') }}
						</span>
					</div>
					<div class="amv__cluster-bottom">
						<span>{{ cluster.copiesCount }} {{ t('duplicatefinder', 'copies') }}</span>
						<strong class="amv__cluster-reclaim">{{ cluster.formattedReclaimableBytes }}</strong>
					</div>
				</button>

				<button
					v-if="analysis.clusters.length > visibleLimit"
					type="button"
					class="amv__load-more-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more clusters ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
				</button>
			</div>

			<div
				v-if="selectedCluster"
				class="amv__inspector">
				<header class="amv__inspector-head">
					<div class="amv__inspector-title-wrap">
						<h4 class="amv__inspector-title">
							{{ selectedCluster.displayName }}
						</h4>
						<p class="amv__inspector-sub">
							{{ selectedCluster.vaultKey }} | {{ selectedCluster.slicerVendor }} | {{ selectedCluster.familyLabel }}
						</p>
					</div>
					<div class="amv__inspector-actions">
						<button
							type="button"
							class="amv__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Open in Triage') }}</span>
						</button>
						<button
							type="button"
							class="amv__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Side-by-Side') }}</span>
						</button>
					</div>
				</header>

				<div class="amv__lineage-grid">
					<div class="amv__lineage-item">
						<span class="amv__lineage-label">{{ t('duplicatefinder', 'Model Part Stem & Spec') }}</span>
						<strong class="amv__lineage-val">{{ selectedCluster.modelPartStem }} ({{ selectedCluster.layerOrNozzleSpec }} / {{ selectedCluster.materialTag }})</strong>
					</div>
					<div class="amv__lineage-item">
						<span class="amv__lineage-label">{{ t('duplicatefinder', 'Machine & Slicer Profile') }}</span>
						<strong class="amv__lineage-val">{{ selectedCluster.machineProfile }} / {{ selectedCluster.slicerVendor }}</strong>
					</div>
					<div class="amv__lineage-item">
						<span class="amv__lineage-label">{{ t('duplicatefinder', 'Mesh vs Slice Lineage') }}</span>
						<strong class="amv__lineage-val">
							{{ selectedCluster.duplicationBadge }} | {{ selectedCluster.sliceLineageBadge }}
						</strong>
					</div>
					<div class="amv__lineage-item">
						<span class="amv__lineage-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<strong class="amv__lineage-val is-accent">
							{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableGb }})
						</strong>
					</div>
				</div>

				<div class="amv__members-list">
					<div
						v-for="member in selectedCluster.members"
						:key="member.selectionKey"
						class="amv__member-card">
						<div class="amv__member-top">
							<code class="amv__member-path">{{ member.path }}</code>
							<div class="amv__member-pills">
								<span
									class="amv__pill"
									:class="member.meta.isCadSource ? 'is-keep' : (member.meta.isToolpathOrSlice ? 'is-warn' : 'is-consolidate')">
									{{ member.meta.artifactKindBadge }}
								</span>
								<span
									class="amv__pill"
									:class="authorityPillClass(member.authorityScore)">
									{{ t('duplicatefinder', 'Authority {score}', { score: member.authorityScore }) }}
								</span>
								<span
									class="amv__pill"
									:class="verdictPillClass(member.verdict)">
									{{ member.verdict }}
								</span>
							</div>
						</div>
						<div class="amv__member-bottom">
							<div class="amv__member-meta">
								<span>{{ member.formattedSize }}</span>
								<span>{{ member.formattedMtime }}</span>
								<span>{{ member.verdictReason }}</span>
							</div>
							<label
								v-if="member.verdict !== 'keep-canonical-survivor'"
								class="amv__override-field">
								<span class="amv__sr-only">{{ t('duplicatefinder', 'Override verdict') }}</span>
								<select
									class="amv__override-select"
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

				<div class="amv__code-panels">
					<div class="amv__code-box">
						<div class="amv__code-head">
							<strong>{{ t('duplicatefinder', 'DRY_RUN=1 POSIX Cleanup Script') }}</strong>
							<button
								type="button"
								class="amv__mini-btn"
								@click="copyRemediationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="amv__pre"><code>{{ generatedScript }}</code></pre>
					</div>

					<div class="amv__code-box">
						<div class="amv__code-head">
							<strong>{{ t('duplicatefinder', 'Nextcloud .sync-exclude.lst Rules') }}</strong>
							<button
								type="button"
								class="amv__mini-btn"
								@click="copySyncExcludeSnippet">
								<span>{{ t('duplicatefinder', 'Copy Rules') }}</span>
							</button>
						</div>
						<pre class="amv__pre"><code>{{ generatedSyncExclude }}</code></pre>
					</div>
				</div>
			</div>
		</div>
	</section>
</template>

<script>
import { copyTextSafely } from '../tools/clipboardHelper'
import {
	ADDITIVE_MFG_PRESETS,
	analyzeAdditiveManufacturingVault,
	buildAdditiveMfgCsvReport,
	buildAdditiveMfgJsonReport,
	buildAdditiveMfgRemediationScript,
	buildAdditiveMfgSyncExcludeSnippet,
} from '../tools/additiveManufacturingVaultAuditor'

export default {
	name: 'AdditiveManufacturingVaultWorkbench',
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
			presetId: 'all-additive-cnc-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'prune-ephemeral-slices-keep-cad',
			survivorRule: 'cad-step-source-first',
			protectCadStepSources: true,
			protectSlicerProfiles: true,
			protectProductionPlates: true,
			staleSliceDaysInput: '7',
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
			return ADDITIVE_MFG_PRESETS
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable') },
				{ id: 'mesh-duplicates', label: this.t('duplicatefinder', 'Mesh Duplicates') },
				{ id: 'regenerated-slices', label: this.t('duplicatefinder', 'Regenerated Slices') },
				{ id: 'cad-sources', label: this.t('duplicatefinder', 'CAD/STEP Sources') },
				{ id: 'slicer-profiles', label: this.t('duplicatefinder', 'Slicer Profiles') },
				{ id: 'sla-resin', label: this.t('duplicatefinder', 'SLA Resin (.ctb/.goo)') },
				{ id: 'cnc-toolpaths', label: this.t('duplicatefinder', 'CNC Toolpaths') },
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
		parsedStaleSliceDays() {
			const trimmed = String(this.staleSliceDaysInput ?? '').trim()
			if (!trimmed) {
				return 7
			}
			const parsed = Number(trimmed)
			return Number.isFinite(parsed) && parsed >= 0 ? parsed : 7
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
			return analyzeAdditiveManufacturingVault(this.activePool, {
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectCadStepSources: this.protectCadStepSources,
				protectSlicerProfiles: this.protectSlicerProfiles,
				protectProductionPlates: this.protectProductionPlates,
				staleSliceDays: this.parsedStaleSliceDays,
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
			return buildAdditiveMfgRemediationScript(this.analysis, {
				dataRoot: this.dataRootInput,
			})
		},
		generatedSyncExclude() {
			return buildAdditiveMfgSyncExcludeSnippet(this.analysis)
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
			const preset = ADDITIVE_MFG_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectCadStepSources = preset.protectCadStepSources
			this.protectSlicerProfiles = preset.protectSlicerProfiles
			this.protectProductionPlates = preset.protectProductionPlates
			this.staleSliceDaysInput = String(preset.staleSliceDays)
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
		duplicationBadgeClass(duplicationClass) {
			if (duplicationClass === 'cad-source') {
				return 'is-keep'
			}
			if (duplicationClass === 'regenerated-slice') {
				return 'is-warn'
			}
			return 'is-consolidate'
		},
		lineageBadgeClass(cluster) {
			if (cluster.hasCadSourceInVault) {
				return 'is-keep'
			}
			if (cluster.duplicationClass === 'regenerated-slice' && !cluster.hasMeshSourceInVault) {
				return 'is-danger'
			}
			return 'is-consolidate'
		},
		formatRiskLabel(riskState) {
			const map = {
				reclaimable: this.t('duplicatefinder', 'Reclaimable'),
				consolidatable: this.t('duplicatefinder', 'Hardlink Ready'),
				'ephemeral-slice-reclaimable': this.t('duplicatefinder', 'Ephemeral Slice Reclaimable'),
				'production-plate-locked': this.t('duplicatefinder', 'Production Plate Locked'),
				'cad-source-protected': this.t('duplicatefinder', 'CAD/STEP Protected'),
				'slicer-profile-protected': this.t('duplicatefinder', 'Slicer Profile Protected'),
				shielded: this.t('duplicatefinder', 'Shielded'),
			}
			return map[riskState] || riskState
		},
		riskPillClass(riskState) {
			if (riskState === 'production-plate-locked') {
				return 'is-danger'
			}
			if (riskState === 'cad-source-protected' || riskState === 'slicer-profile-protected' || riskState === 'shielded') {
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
			if (verdict === 'blocked-production-plate' || verdict === 'blocked-cad-step-source') {
				return 'is-danger'
			}
			if (verdict.startsWith('blocked-')) {
				return 'is-warn'
			}
			if (verdict === 'consolidate-hardlink-mesh-asset') {
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
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 Additive Manufacturing Vault remediation script to clipboard.'))
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
			const csv = buildAdditiveMfgCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-additive-mfg-vault-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe Additive Manufacturing Vault CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildAdditiveMfgJsonReport(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-additive-mfg-vault-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported Additive Manufacturing Vault JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.additive-mfg-vault-workbench {
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

.amv__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
}

.amv__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.amv__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.amv__status-badge {
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

.amv__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.amv__tool-btn,
.amv__seg-btn,
.amv__primary-btn,
.amv__load-more-btn,
.amv__mini-btn {
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

.amv__tool-btn:hover:not(:disabled),
.amv__seg-btn:hover:not(:disabled),
.amv__load-more-btn:hover:not(:disabled),
.amv__mini-btn:hover:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element);
}

.amv__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.amv__tool-btn.is-primary-outline,
.amv__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.amv__primary-btn {
	background-color: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #fff);
}

.amv__tool-btn:focus-visible,
.amv__seg-btn:focus-visible,
.amv__primary-btn:focus-visible,
.amv__load-more-btn:focus-visible,
.amv__mini-btn:focus-visible,
.amv__cluster-card:focus-visible,
.amv__input:focus-visible,
.amv__override-select:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.amv__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 6px;
	font-size: 0.85rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.amv__notice.is-success {
	background-color: var(--color-background-hover);
	border-color: var(--color-success, #2d8a4e);
}

.amv__notice.is-error {
	background-color: var(--color-background-hover);
	border-color: var(--color-error, #b91c1c);
}

.amv__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.amv__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.amv__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.amv__kpi-val {
	font-size: 0.92rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.amv__kpi-val.is-accent {
	color: var(--color-primary-element);
}

.amv__kpi-val.is-warn {
	color: var(--color-warning-text, var(--color-main-text));
}

.amv__empty-banner,
.amv__empty-filter {
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

.amv__empty-text {
	flex: 1 1 240px;
	min-inline-size: 0;
}

.amv__empty-title {
	margin: 0 0 4px;
	font-weight: 700;
	font-size: 0.92rem;
}

.amv__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
}

.amv__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
}

.amv__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.amv__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	min-inline-size: 96px;
}

.amv__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
}

.amv__inputs-row {
	align-items: flex-end;
}

.amv__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.amv__field-grow {
	flex: 1 1 180px;
}

.amv__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.amv__input,
.amv__override-select {
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

.amv__num-input {
	inline-size: 96px;
}

.amv__workspace {
	display: grid;
	grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
	gap: 12px;
	min-inline-size: 0;
}

.amv__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 640px;
	overflow-y: auto;
	min-inline-size: 0;
}

.amv__cluster-card {
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

.amv__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.amv__cluster-top,
.amv__cluster-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
}

.amv__cluster-name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.amv__cluster-meta,
.amv__cluster-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
}

.amv__tag {
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: 4px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-family: monospace;
	font-size: 0.75rem;
}

.amv__badge,
.amv__pill {
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

.amv__pill.is-keep,
.amv__badge.is-keep {
	border-color: var(--color-success, #2d8a4e);
}

.amv__pill.is-danger,
.amv__badge.is-danger {
	border-color: var(--color-error, #b91c1c);
}

.amv__pill.is-consolidate,
.amv__badge.is-consolidate {
	border-color: var(--color-primary-element);
}

.amv__pill.is-warn,
.amv__badge.is-warn {
	border-color: var(--color-warning, #b45309);
}

.amv__cluster-reclaim {
	font-family: monospace;
	font-size: 0.84rem;
}

.amv__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.amv__inspector-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 8px;
	border-block-end: 1px solid var(--color-border);
}

.amv__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.amv__inspector-title {
	margin: 0 0 4px;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.amv__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	font-family: monospace;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.amv__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.amv__lineage-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.amv__lineage-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.amv__lineage-label {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
}

.amv__lineage-val {
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.amv__lineage-val.is-accent {
	color: var(--color-primary-element);
}

.amv__members-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.amv__member-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.amv__member-top,
.amv__member-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.amv__member-path {
	font-size: 0.8rem;
	overflow-wrap: anywhere;
	min-inline-size: 0;
	flex: 1 1 200px;
}

.amv__member-pills {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.amv__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	min-inline-size: 0;
}

.amv__code-panels {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.amv__code-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.amv__code-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
}

.amv__pre {
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

.amv__sr-only {
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
	.amv__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.amv__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.amv__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 640px) {
	.additive-mfg-vault-workbench {
		padding: 10px;
	}

	.amv__kpis,
	.amv__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.amv__num-input {
		inline-size: 100%;
	}

	.amv__field {
		flex: 1 1 100%;
	}
}
</style>
