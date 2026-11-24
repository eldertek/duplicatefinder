<template>
	<section
		class="cad-vault-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'CAD, 3D Print, KiCad EDA and Manufacturing Release Vault Auditor')">
		<header class="cvw__toolbar">
			<div class="cvw__title-group">
				<h3 class="cvw__title">
					{{ t('duplicatefinder', 'CAD, 3D Print, KiCad EDA & Manufacturing Release Vault Auditor') }}
				</h3>
				<span
					class="cvw__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} reclaimable / {pdm} PDM vaults', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						pdm: analysis.summary.totalReleasedPdmClusters,
					}) }}
				</span>
			</div>

			<div class="cvw__toolbar-actions">
				<button
					type="button"
					class="cvw__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="cvw__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="cvw__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="cvw__tool-btn is-close"
					aria-keyshortcuts="{"
					:title="t('duplicatefinder', 'Hide CAD, 3D Print, KiCad EDA and Manufacturing Release Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide CAD Auditor') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="cvw__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="cvw__empty-banner"
			role="note">
			<div class="cvw__empty-text">
				<p class="cvw__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure Released PDM and Native Parametric guards before scanning') }}
				</p>
				<p class="cvw__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit duplicated parametric CAD assemblies (.sldprt/.step/.f3d/.fcstd), 3D print meshes & G-code (.stl/.3mf/.gcode), KiCad EDA boards (.kicad_pcb/.kicad_sch), and Gerber CAM releases while strictly guarding Released PDM and ECO Freeze vaults.') }}
				</p>
			</div>
			<button
				type="button"
				class="cvw__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="cvw__controls">
			<div class="cvw__control-row">
				<span class="cvw__control-label">{{ t('duplicatefinder', 'Audit Preset') }}</span>
				<div
					class="cvw__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'CAD vault audit presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="cvw__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="cvw__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="cvw__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="cvw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="cvw__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="cvw__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="cvw__seg-btn"
					:class="{ 'is-active': protectReleasedPdm }"
					:aria-pressed="protectReleasedPdm ? 'true' : 'false'"
					@click="protectReleasedPdm = !protectReleasedPdm">
					<span>{{ protectReleasedPdm ? t('duplicatefinder', 'Released PDM / ECO Freeze Guard: ON') : t('duplicatefinder', 'Released PDM / ECO Freeze Guard: OFF') }}</span>
				</button>

				<button
					type="button"
					class="cvw__seg-btn"
					:class="{ 'is-active': protectMfgCamRelease }"
					:aria-pressed="protectMfgCamRelease ? 'true' : 'false'"
					@click="protectMfgCamRelease = !protectMfgCamRelease">
					<span>{{ protectMfgCamRelease ? t('duplicatefinder', 'Mfg / CAM Release Guard: ON') : t('duplicatefinder', 'Mfg / CAM Release Guard: OFF') }}</span>
				</button>

				<button
					type="button"
					class="cvw__seg-btn"
					:class="{ 'is-active': protectNativeParametric }"
					:aria-pressed="protectNativeParametric ? 'true' : 'false'"
					@click="protectNativeParametric = !protectNativeParametric">
					<span>{{ protectNativeParametric ? t('duplicatefinder', 'Native Parametric Master Guard: ON') : t('duplicatefinder', 'Native Parametric Master Guard: OFF') }}</span>
				</button>
			</div>

			<div class="cvw__control-row cvw__inputs-row">
				<label class="cvw__field">
					<span class="cvw__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="cvw__input">
						<option value="consolidate-released-pdm">{{ t('duplicatefinder', 'Consolidate to Released PDM') }}</option>
						<option value="hardlink-mesh-exports">{{ t('duplicatefinder', 'Hardlink Mesh & CAM Exports (POSIX ln -f)') }}</option>
						<option value="prune-cad-autosaves">{{ t('duplicatefinder', 'Prune CAD Autosaves & KiCad -backups/') }}</option>
					</select>
				</label>

				<label class="cvw__field">
					<span class="cvw__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="cvw__input">
						<option value="pdm-authority-first">{{ t('duplicatefinder', 'Released PDM / Mfg Vault first') }}</option>
						<option value="native-master-first">{{ t('duplicatefinder', 'Native parametric master first') }}</option>
						<option value="newest-revision">{{ t('duplicatefinder', 'Newest engineering revision') }}</option>
						<option value="oldest-canonical">{{ t('duplicatefinder', 'Oldest canonical copy') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical path') }}</option>
					</select>
				</label>

				<label class="cvw__field">
					<span class="cvw__field-label">{{ t('duplicatefinder', 'Stale Export (d)') }}</span>
					<input
						v-model="staleExportDaysInput"
						type="number"
						min="0"
						step="1"
						class="cvw__input cvw__num-input">
				</label>

				<label class="cvw__field">
					<span class="cvw__field-label">{{ t('duplicatefinder', 'Min Size (KiB)') }}</span>
					<input
						v-model="minSizeKbInput"
						type="number"
						min="0"
						step="1"
						class="cvw__input cvw__num-input">
				</label>

				<label class="cvw__field cvw__field-grow">
					<span class="cvw__field-label">{{ t('duplicatefinder', 'Filter Part Stem, Revision or Path') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="cvw__input"
						:placeholder="t('duplicatefinder', 'e.g. .sldprt, .stl, .kicad_pcb, REV_A, -backups, gerbers')">
				</label>

				<label class="cvw__field cvw__field-grow">
					<span class="cvw__field-label">{{ t('duplicatefinder', 'Nextcloud Data Root') }}</span>
					<input
						v-model="dataRootInput"
						type="text"
						class="cvw__input"
						placeholder="/var/www/nextcloud/data">
				</label>

				<label class="cvw__field">
					<span class="cvw__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="cvw__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'PDM & release vault risk') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Part / file name (A-Z)') }}</option>
					</select>
				</label>
			</div>
		</div>

		<div class="cvw__kpis">
			<div class="cvw__kpi">
				<span class="cvw__kpi-label">{{ t('duplicatefinder', 'Safe Mesh & Autosave Reclaim') }}</span>
				<strong class="cvw__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="cvw__kpi">
				<span class="cvw__kpi-label">{{ t('duplicatefinder', 'Released PDM & Mfg Releases') }}</span>
				<strong class="cvw__kpi-val is-warn">
					{{ analysis.summary.totalReleasedPdmClusters }} {{ t('duplicatefinder', 'PDM') }} / {{ analysis.summary.totalMfgReleaseClusters }} {{ t('duplicatefinder', 'CAM release') }} ({{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }})
				</strong>
			</div>
			<div class="cvw__kpi">
				<span class="cvw__kpi-label">{{ t('duplicatefinder', 'Autosave & KiCad -backups/') }}</span>
				<strong class="cvw__kpi-val">
					{{ analysis.summary.totalAutosaveBackupCopiesCount }} {{ t('duplicatefinder', 'backup copies') }}
				</strong>
			</div>
			<div class="cvw__kpi">
				<span class="cvw__kpi-label">{{ t('duplicatefinder', 'Raw Engineering Footprint') }}</span>
				<strong class="cvw__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="!sourcePoolEmpty"
			class="cvw__filters-strip">
			<div
				class="cvw__chip-group"
				role="group"
				:aria-label="t('duplicatefinder', 'Filter by CAD and EDA artifact family')">
				<button
					type="button"
					class="cvw__chip"
					:class="{ 'is-active': familyFilter === 'all' }"
					:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
					@click="familyFilter = 'all'">
					<span>{{ t('duplicatefinder', 'All Engineering Artifacts ({count})', { count: analysis.summary.familyCounts.all || 0 }) }}</span>
				</button>
				<button
					v-for="familyItem in familyOptions"
					:key="familyItem.id"
					type="button"
					class="cvw__chip"
					:class="{ 'is-active': familyFilter === familyItem.id }"
					:aria-pressed="familyFilter === familyItem.id ? 'true' : 'false'"
					@click="familyFilter = familyItem.id">
					<span>{{ familyItem.label }} ({{ analysis.summary.familyCounts[familyItem.id] || 0 }})</span>
				</button>
			</div>

			<div
				class="cvw__chip-group"
				role="group"
				:aria-label="t('duplicatefinder', 'Filter by CAD audit verdict')">
				<button
					v-for="verdictOpt in verdictFilterOptions"
					:key="verdictOpt.id"
					type="button"
					class="cvw__chip"
					:class="{ 'is-active': verdictFilter === verdictOpt.id }"
					:aria-pressed="verdictFilter === verdictOpt.id ? 'true' : 'false'"
					@click="verdictFilter = verdictOpt.id">
					<span>{{ verdictOpt.label }}</span>
				</button>
			</div>
		</div>

		<div
			v-if="!sourcePoolEmpty && analysis.clusters.length === 0"
			class="cvw__empty-banner"
			role="note">
			<div class="cvw__empty-text">
				<p class="cvw__empty-title">
					{{ t('duplicatefinder', 'No CAD, 3D print mesh, KiCad EDA, or CAM release clusters match the active filters') }}
				</p>
				<p class="cvw__empty-hint">
					{{ t('duplicatefinder', 'Adjust the engineering family filter, lower minimum size, or clear the search query to inspect other duplicate groups.') }}
				</p>
			</div>
			<button
				type="button"
				class="cvw__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset Filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="cvw__workstation">
			<div class="cvw__list-pane">
				<div class="cvw__pane-header">
					<span class="cvw__pane-title">
						{{ t('duplicatefinder', 'CAD, Mesh & EDA Clusters ({count})', { count: analysis.clusters.length }) }}
					</span>
				</div>

				<div class="cvw__cluster-list">
					<button
						v-for="cluster in visibleClusters"
						:key="cluster.groupKey"
						type="button"
						class="cvw__cluster-item"
						:class="{ 'is-selected': selectedCluster && selectedCluster.groupKey === cluster.groupKey }"
						@click="selectedClusterKey = cluster.groupKey">
						<div class="cvw__cluster-top">
							<span class="cvw__cluster-name">{{ cluster.displayName }}</span>
							<span
								class="cvw__pill"
								:class="`is-risk-${cluster.clusterRiskState}`">
								{{ formatRiskLabel(cluster.clusterRiskState) }}
							</span>
						</div>
						<div class="cvw__cluster-meta">
							<span>{{ cluster.familyLabel }}</span>
							<span>{{ cluster.partLineageStem }}</span>
							<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
							<span>{{ cluster.formattedReclaimableBytes }}</span>
						</div>
						<div
							v-if="cluster.survivor"
							class="cvw__cluster-path">
							{{ cluster.survivor.normalizedPath }}
						</div>
					</button>
				</div>

				<div
					v-if="analysis.clusters.length > visibleLimit"
					class="cvw__load-more-wrap">
					<button
						type="button"
						class="cvw__tool-btn"
						@click="visibleLimit += 25">
						<span>{{ t('duplicatefinder', 'Load more ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
					</button>
				</div>
			</div>

			<div
				v-if="selectedCluster"
				class="cvw__inspector-pane">
				<header class="cvw__inspector-header">
					<div class="cvw__inspector-title-wrap">
						<h4 class="cvw__inspector-title">
							{{ selectedCluster.displayName }}
						</h4>
						<span class="cvw__inspector-sub">
							{{ selectedCluster.familyLabel }} / .{{ selectedCluster.extension }} / {{ selectedCluster.partLineageStem }}
						</span>
					</div>

					<div class="cvw__inspector-actions">
						<button
							type="button"
							class="cvw__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Focus Group') }}</span>
						</button>
						<button
							type="button"
							class="cvw__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Compare Copies') }}</span>
						</button>
					</div>
				</header>

				<div
					v-if="selectedCluster.hasReleasedPdmVault || selectedCluster.hasMfgCamRelease"
					class="cvw__warn-banner"
					role="note">
					<strong>{{ t('duplicatefinder', 'Released PDM & Manufacturing Release Guard Active:') }}</strong>
					{{ t('duplicatefinder', 'Copies inside Released PDM, ECO Approved, Mfg Freeze, or CAM Release folders are strictly shielded from automated deletion unless explicitly overridden by an operator.') }}
				</div>

				<div
					v-if="selectedCluster.hasAutosaveBackup"
					class="cvw__info-banner"
					role="note">
					<strong>{{ t('duplicatefinder', 'CAD Autosave or KiCad -backups/ Detected:') }}</strong>
					{{ t('duplicatefinder', 'Duplicate autosave, -bak, ~1, .fcstd1, or KiCad -backups/ snapshots found. Add the generated .sync-exclude.lst rules to stop desktop clients from syncing transient lockfiles and backup pools.') }}
				</div>

				<div class="cvw__meta-grid">
					<div class="cvw__meta-item">
						<span class="cvw__meta-label">{{ t('duplicatefinder', 'Part Lineage Stem') }}</span>
						<span>{{ selectedCluster.partLineageStem }}</span>
					</div>
					<div class="cvw__meta-item">
						<span class="cvw__meta-label">{{ t('duplicatefinder', 'Revision & Backup Tags') }}</span>
						<span>{{ selectedCluster.revisionSummary }}</span>
					</div>
					<div class="cvw__meta-item">
						<span class="cvw__meta-label">{{ t('duplicatefinder', 'Governance Tiers Present') }}</span>
						<span>{{ selectedCluster.governanceSummary }}</span>
					</div>
					<div class="cvw__meta-item">
						<span class="cvw__meta-label">{{ t('duplicatefinder', 'Canonical Master') }}</span>
						<span class="cvw__mono-text">{{ selectedCluster.survivor ? selectedCluster.survivor.normalizedPath : '-' }}</span>
					</div>
					<div class="cvw__meta-item">
						<span class="cvw__meta-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<span>{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableCopiesCount }} / {{ selectedCluster.copyCount }})</span>
					</div>
				</div>

				<div class="cvw__member-list">
					<article
						v-for="member in selectedCluster.members"
						:key="member.selectionKey"
						class="cvw__member-card"
						:class="`is-verdict-${member.verdict}`">
						<div class="cvw__member-top">
							<span class="cvw__member-name">{{ member.basename }}</span>
							<div class="cvw__member-badges">
								<span
									class="cvw__pill"
									:class="verdictPillClass(member.verdict)">
									{{ member.verdictLabel }}
								</span>
								<span
									class="cvw__pill"
									:class="authorityPillClass(member.context.authorityScore)">
									{{ t('duplicatefinder', 'Authority {score}', { score: member.context.authorityScore }) }}
								</span>
							</div>
						</div>

						<div class="cvw__member-path">
							{{ member.normalizedPath }}
						</div>

						<div class="cvw__member-meta">
							<span>{{ member.tierLabel }}</span>
							<span>{{ member.formattedSize }}</span>
							<span v-if="member.context.ageDays !== null">{{ member.context.ageDays }}d {{ t('duplicatefinder', 'old') }}</span>
							<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
						</div>

						<div class="cvw__companion-chips">
							<span class="cvw__companion-chip">{{ member.context.partLineageStem }}</span>
							<span
								v-if="member.context.revisionTag !== 'none'"
								class="cvw__companion-chip">
								{{ member.context.revisionTag }}
							</span>
							<span
								v-if="member.context.isReleasedPdmVault"
								class="cvw__companion-chip is-warn">
								{{ t('duplicatefinder', 'Released PDM / ECO Freeze') }}
							</span>
							<span
								v-if="member.context.isMfgCamRelease"
								class="cvw__companion-chip is-warn">
								{{ t('duplicatefinder', 'Mfg / CAM Release') }}
							</span>
							<span
								v-if="member.context.isNativeParametricMaster"
								class="cvw__companion-chip">
								{{ t('duplicatefinder', 'Native Parametric Master') }}
							</span>
							<span
								v-if="member.context.isBackupAutosave"
								class="cvw__companion-chip">
								{{ t('duplicatefinder', 'Autosave / -backups/') }}
							</span>
							<span
								v-if="member.context.isSlicerSpoolDownloads"
								class="cvw__companion-chip">
								{{ t('duplicatefinder', 'Slicer / Spool / Downloads') }}
							</span>
						</div>

						<p class="cvw__member-note">
							{{ member.note }}
						</p>

						<div class="cvw__override-bar">
							<span class="cvw__control-label">{{ t('duplicatefinder', 'Operator Override:') }}</span>
							<button
								type="button"
								class="cvw__seg-btn"
								:class="{ 'is-active': getMemberOverride(member.selectionKey) === 'auto' }"
								:aria-pressed="getMemberOverride(member.selectionKey) === 'auto' ? 'true' : 'false'"
								@click="setMemberOverride(member.selectionKey, 'auto')">
								<span>{{ t('duplicatefinder', 'Auto') }}</span>
							</button>
							<button
								type="button"
								class="cvw__seg-btn"
								:class="{ 'is-active': getMemberOverride(member.selectionKey) === 'force-keep' }"
								:aria-pressed="getMemberOverride(member.selectionKey) === 'force-keep' ? 'true' : 'false'"
								@click="setMemberOverride(member.selectionKey, 'force-keep')">
								<span>{{ t('duplicatefinder', 'Shield Copy') }}</span>
							</button>
							<button
								type="button"
								class="cvw__seg-btn"
								:class="{ 'is-active': getMemberOverride(member.selectionKey) === 'exclude' }"
								:aria-pressed="getMemberOverride(member.selectionKey) === 'exclude' ? 'true' : 'false'"
								@click="setMemberOverride(member.selectionKey, 'exclude')">
								<span>{{ t('duplicatefinder', 'Exclude') }}</span>
							</button>
						</div>
					</article>
				</div>
			</div>
		</div>

		<details
			v-if="analysis.clusters.length > 0"
			class="cvw__script-box">
			<summary class="cvw__script-summary">
				{{ t('duplicatefinder', 'POSIX DRY_RUN=1 Script (SHA-256 Verified + Hardlinks + occ files:scan) & .sync-exclude.lst') }}
			</summary>
			<div class="cvw__script-content">
				<div class="cvw__script-actions">
					<button
						type="button"
						class="cvw__tool-btn"
						@click="copyRemediationScript">
						<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
					</button>
					<button
						type="button"
						class="cvw__tool-btn"
						@click="copySyncExcludeSnippet">
						<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
					</button>
				</div>
				<pre class="cvw__code-pre"><code>{{ generatedScript }}</code></pre>
				<pre class="cvw__code-pre"><code>{{ generatedSyncExclude }}</code></pre>
			</div>
		</details>
	</section>
</template>

<script>
import { copyTextSafely } from '../tools/clipboardHelper'
import {
	CAD_FAMILY_META,
	CAD_PRESETS,
	analyzeCadVaultDuplicates,
	buildCadSyncExcludeSnippet,
	buildCadVaultCsvReport,
	buildCadVaultJsonReport,
	buildCadVaultScript,
} from '../tools/cadVaultAuditor'

export default {
	name: 'CadVaultWorkbench',
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
			type: [String, Number],
			default: null,
		},
	},
	data() {
		return {
			presetId: 'all-cad-pdm-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'consolidate-released-pdm',
			survivorRule: 'pdm-authority-first',
			protectReleasedPdm: true,
			protectMfgCamRelease: true,
			protectNativeParametric: true,
			staleExportDaysInput: '14',
			minSizeKbInput: '0',
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
			return CAD_PRESETS
		},
		familyOptions() {
			return Object.values(CAD_FAMILY_META)
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable / Hardlinkable') },
				{ id: 'released-pdm', label: this.t('duplicatefinder', 'Released PDM / ECO Freeze') },
				{ id: 'mfg-release', label: this.t('duplicatefinder', 'Mfg / CAM Release') },
				{ id: 'autosaves-backups', label: this.t('duplicatefinder', 'Autosaves & -backups/') },
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
		parsedStaleExportDays() {
			const trimmed = String(this.staleExportDaysInput ?? '').trim()
			if (!trimmed) {
				return 14
			}
			const parsed = Number(trimmed)
			return Number.isFinite(parsed) && parsed >= 0 ? parsed : 14
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
			return analyzeCadVaultDuplicates(this.activePool, {
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectReleasedPdm: this.protectReleasedPdm,
				protectMfgCamRelease: this.protectMfgCamRelease,
				protectNativeParametric: this.protectNativeParametric,
				staleExportDays: this.parsedStaleExportDays,
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
			return buildCadVaultScript(this.analysis, {
				dataRoot: this.dataRootInput,
			})
		},
		generatedSyncExclude() {
			return buildCadSyncExcludeSnippet(this.analysis)
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
			const preset = CAD_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectReleasedPdm = preset.protectReleasedPdm
			this.protectMfgCamRelease = preset.protectMfgCamRelease
			this.protectNativeParametric = preset.protectNativeParametric
			this.staleExportDaysInput = String(preset.staleExportDays)
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
			if (this.selectedCluster && !this.selectedClusterKey) {
				this.selectedClusterKey = this.selectedCluster.groupKey
			}
			this.$set(this.memberOverrides, selectionKey, value)
		},
		formatRiskLabel(riskState) {
			const map = {
				reclaimable: this.t('duplicatefinder', 'Reclaimable'),
				'released-pdm': this.t('duplicatefinder', 'Released PDM Guarded'),
				'mfg-release': this.t('duplicatefinder', 'Mfg Release Guarded'),
				shielded: this.t('duplicatefinder', 'Shielded'),
			}
			return map[riskState] || riskState
		},
		verdictPillClass(verdict) {
			if (verdict === 'keep-canonical-survivor') {
				return 'is-keep'
			}
			if (verdict === 'blocked-released-pdm' || verdict === 'blocked-mfg-cam-release') {
				return 'is-danger'
			}
			if (verdict === 'blocked-native-parametric' || verdict === 'blocked-not-autosave' || verdict === 'blocked-manual-shield' || verdict === 'excluded') {
				return 'is-warn'
			}
			if (verdict === 'hardlink-mesh-export') {
				return 'is-hardlink'
			}
			return 'is-reclaim'
		},
		authorityPillClass(score) {
			if (score >= 85) {
				return 'is-keep'
			}
			if (score >= 50) {
				return 'is-hardlink'
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
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 CAD, mesh, KiCad, and CAM consolidation script to clipboard.'))
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
			const csv = buildCadVaultCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-cad-vault-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe CAD vault CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildCadVaultJsonReport(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-cad-vault-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CAD vault JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.cad-vault-workbench {
	display: flex;
	flex-direction: column;
	gap: 14px;
	padding: 16px;
	margin-block-end: 16px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 10px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	box-sizing: border-box;
	min-inline-size: 0;
}

.cvw__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}

.cvw__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.cvw__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.cvw__status-badge {
	display: inline-flex;
	align-items: center;
	padding-block: 4px;
	padding-inline: 10px;
	border-radius: 999px;
	background-color: var(--color-background-hover);
	border: 1px solid var(--color-border);
	font-size: 0.82rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
	max-inline-size: 100%;
	overflow-wrap: anywhere;
}

.cvw__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.cvw__tool-btn,
.cvw__seg-btn,
.cvw__chip,
.cvw__primary-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	min-block-size: 44px;
	min-inline-size: 44px;
	padding-block: 8px;
	padding-inline: 14px;
	border-radius: var(--border-radius, 8px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-size: 0.85rem;
	font-weight: 600;
	cursor: pointer;
	box-sizing: border-box;
	transition: background-color 0.15s ease, border-color 0.15s ease;
}

.cvw__primary-btn {
	background-color: var(--color-primary-element, #0082c9);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-text, #ffffff);
}

.cvw__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.cvw__tool-btn.is-primary-outline {
	border-color: var(--color-primary-element, #0082c9);
}

.cvw__seg-btn.is-active,
.cvw__chip.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.cvw__tool-btn:focus-visible,
.cvw__seg-btn:focus-visible,
.cvw__chip:focus-visible,
.cvw__primary-btn:focus-visible,
.cvw__cluster-item:focus-visible,
.cvw__input:focus-visible,
.cvw__script-summary:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.cvw__notice {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	font-size: 0.86rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.cvw__notice.is-success {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.cvw__notice.is-error {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.cvw__empty-banner {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 14px;
	border-radius: var(--border-radius, 8px);
	border: 1px dashed var(--color-border-dark, var(--color-border));
	background-color: var(--color-background-hover);
}

.cvw__empty-text {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
	max-inline-size: 68ch;
}

.cvw__empty-title {
	margin: 0;
	font-weight: 700;
	font-size: 0.94rem;
}

.cvw__empty-hint {
	margin: 0;
	font-size: 0.85rem;
	color: var(--color-text-maxcontrast);
	line-height: 1.45;
}

.cvw__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
}

.cvw__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.cvw__control-label {
	font-size: 0.82rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.cvw__segments,
.cvw__chip-group,
.cvw__filters-strip {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.cvw__filters-strip {
	flex-direction: column;
	gap: 8px;
}

.cvw__inputs-row {
	align-items: flex-end;
}

.cvw__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.cvw__field-grow {
	flex: 1 1 200px;
}

.cvw__field-label {
	font-size: 0.78rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.cvw__input {
	min-block-size: 44px;
	padding-block: 6px;
	padding-inline: 10px;
	border: 1px solid var(--color-border-dark, var(--color-border));
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.86rem;
	box-sizing: border-box;
	inline-size: 100%;
	min-inline-size: 0;
}

.cvw__num-input {
	inline-size: 108px;
	max-inline-size: 100%;
}

.cvw__kpis {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 10px;
}

@media (min-width: 560px) {
	.cvw__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (min-width: 980px) {
	.cvw__kpis {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
}

.cvw__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.cvw__kpi-label {
	font-size: 0.76rem;
	font-weight: 700;
	text-transform: uppercase;
	color: var(--color-text-maxcontrast);
}

.cvw__kpi-val {
	font-size: 1.02rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.cvw__kpi-val.is-accent {
	color: #0b4a8b;
}

.cvw__kpi-val.is-warn {
	color: #7c4a03;
}

.cvw__workstation {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 14px;
}

@media (min-width: 1080px) {
	.cvw__workstation {
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr);
		align-items: start;
	}
}

.cvw__list-pane,
.cvw__inspector-pane {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.cvw__pane-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.cvw__pane-title {
	font-size: 0.88rem;
	font-weight: 700;
}

.cvw__cluster-list,
.cvw__member-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.cvw__cluster-item {
	display: flex;
	flex-direction: column;
	align-items: stretch;
	gap: 4px;
	padding-block: 10px;
	padding-inline: 12px;
	min-block-size: 44px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	text-align: start;
	cursor: pointer;
	min-inline-size: 0;
}

.cvw__cluster-item.is-selected {
	border-color: var(--color-primary-element, #0082c9);
	background-color: var(--color-primary-element-light);
}

.cvw__cluster-top,
.cvw__member-top {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.cvw__cluster-name,
.cvw__member-name {
	font-weight: 700;
	font-size: 0.9rem;
	overflow-wrap: anywhere;
}

.cvw__cluster-path,
.cvw__member-path {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.cvw__cluster-meta,
.cvw__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.cvw__pill {
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: 999px;
	font-size: 0.72rem;
	font-weight: 700;
	border: 1px solid var(--color-border);
}

.cvw__pill.is-risk-released-pdm,
.cvw__pill.is-danger {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.cvw__pill.is-risk-mfg-release,
.cvw__pill.is-risk-shielded,
.cvw__pill.is-warn {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.cvw__pill.is-hardlink {
	background-color: #e8f1fb;
	color: #0b4a8b;
	border-color: #9ec5fe;
}

.cvw__pill.is-risk-reclaimable,
.cvw__pill.is-reclaim,
.cvw__pill.is-keep {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.cvw__inspector-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.cvw__inspector-title-wrap {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-inline-size: 0;
}

.cvw__inspector-title {
	margin: 0;
	font-size: 0.98rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.cvw__inspector-sub {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.cvw__inspector-actions,
.cvw__override-bar,
.cvw__member-badges,
.cvw__companion-chips {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.cvw__companion-chip {
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: 6px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-family: monospace;
	font-size: 0.74rem;
	color: var(--color-main-text);
	overflow-wrap: anywhere;
}

.cvw__companion-chip.is-warn {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.cvw__warn-banner {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #f5c97b;
	background-color: #fff4e5;
	color: #7c4a03;
	font-size: 0.83rem;
	line-height: 1.45;
}

.cvw__info-banner {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #9ec5fe;
	background-color: #e8f1fb;
	color: #0b4a8b;
	font-size: 0.83rem;
	line-height: 1.45;
}

.cvw__meta-grid {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 8px;
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
}

@media (min-width: 640px) {
	.cvw__meta-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

.cvw__meta-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	font-size: 0.84rem;
	min-inline-size: 0;
	overflow-wrap: anywhere;
}

.cvw__meta-label {
	font-size: 0.74rem;
	font-weight: 700;
	text-transform: uppercase;
	color: var(--color-text-maxcontrast);
}

.cvw__mono-text {
	font-family: monospace;
	font-size: 0.8rem;
	overflow-wrap: anywhere;
}

.cvw__member-card {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.cvw__member-card.is-verdict-keep-canonical-survivor,
.cvw__member-card.is-verdict-reclaim-cad-copy,
.cvw__member-card.is-verdict-reclaim-autosave-backup {
	border-inline-start: 4px solid #0f5132;
}

.cvw__member-card.is-verdict-hardlink-mesh-export {
	border-inline-start: 4px solid #0b4a8b;
}

.cvw__member-card.is-verdict-blocked-released-pdm,
.cvw__member-card.is-verdict-blocked-mfg-cam-release {
	border-inline-start: 4px solid #842029;
}

.cvw__member-card.is-verdict-blocked-native-parametric,
.cvw__member-card.is-verdict-blocked-not-autosave,
.cvw__member-card.is-verdict-blocked-manual-shield,
.cvw__member-card.is-verdict-excluded {
	border-inline-start: 4px solid #7c4a03;
}

.cvw__member-note {
	margin: 0;
	font-size: 0.82rem;
	color: var(--color-text-maxcontrast);
	max-inline-size: 68ch;
}

.cvw__script-box {
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	padding-block: 8px;
	padding-inline: 12px;
	background-color: var(--color-main-background);
}

.cvw__script-summary {
	display: flex;
	align-items: center;
	min-block-size: 44px;
	font-weight: 700;
	font-size: 0.86rem;
	cursor: pointer;
}

.cvw__script-content {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding-block-start: 8px;
}

.cvw__script-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.cvw__code-pre {
	margin: 0;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-size: 0.78rem;
	line-height: 1.45;
	overflow-x: auto;
	max-block-size: 280px;
}

.cvw__load-more-wrap {
	display: flex;
	justify-content: center;
	padding-block: 6px;
}
</style>
