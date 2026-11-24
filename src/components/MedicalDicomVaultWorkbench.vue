<template>
	<section
		class="medical-dicom-vault-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Medical, DICOM and Health Imaging Vault Auditor')">
		<header class="mdv__toolbar">
			<div class="mdv__title-group">
				<h3 class="mdv__title">
					{{ t('duplicatefinder', 'Medical, DICOM & Health Imaging Vault Auditor') }}
				</h3>
				<span
					class="mdv__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} ({gb}) reclaimable / {phi} high PHI & {holds} clinical-hold/DICOMDIR guards', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						gb: analysis.summary.reclaimableGb,
						phi: analysis.summary.totalHighPhiClusters,
						holds: analysis.summary.totalClinicalHoldSrClusters,
					}) }}
				</span>
			</div>

			<div class="mdv__toolbar-actions">
				<button
					type="button"
					class="mdv__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="mdv__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="mdv__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="mdv__tool-btn is-close"
					aria-keyshortcuts="F10"
					:title="t('duplicatefinder', 'Hide Medical, DICOM and Health Imaging Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Medical Vault') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="mdv__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="mdv__kpis">
			<div class="mdv__kpi">
				<span class="mdv__kpi-label">{{ t('duplicatefinder', 'Safe Medical Vault Reclaim') }}</span>
				<strong class="mdv__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.reclaimableGb }} / {{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="mdv__kpi">
				<span class="mdv__kpi-label">{{ t('duplicatefinder', 'PHI Risk & Anonymization Status') }}</span>
				<strong class="mdv__kpi-val is-warn">
					{{ analysis.summary.totalHighPhiClusters }} {{ t('duplicatefinder', 'high PHI') }} / {{ analysis.summary.totalAnonymizedClusters }} {{ t('duplicatefinder', 'de-ID') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="mdv__kpi">
				<span class="mdv__kpi-label">{{ t('duplicatefinder', 'Studies / DICOM / NIfTI / HL7') }}</span>
				<strong class="mdv__kpi-val">
					{{ analysis.summary.distinctStudiesCount }} {{ t('duplicatefinder', 'studies') }} / {{ analysis.summary.totalDicomSeriesClusters }} {{ t('duplicatefinder', 'DICOM') }} / {{ analysis.summary.totalNiftiClusters }} {{ t('duplicatefinder', 'NIfTI') }} / {{ analysis.summary.totalHl7FhirClusters }} {{ t('duplicatefinder', 'HL7/FHIR') }}
				</strong>
			</div>
			<div class="mdv__kpi">
				<span class="mdv__kpi-label">{{ t('duplicatefinder', 'Raw Imaging Footprint') }}</span>
				<strong class="mdv__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="mdv__empty-banner"
			role="note">
			<div class="mdv__empty-text">
				<p class="mdv__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure PACS series and clinical-hold guards before scanning') }}
				</p>
				<p class="mdv__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit DICOM studies & series (.dcm, .dicom, .ima, DICOMDIR), volumetric NIfTI/BIDS (.nii, .nii.gz, .nrrd), HL7/FHIR clinical payloads (.hl7, .fhir.json, .cda, DICOM SR), and radiology PDF/viewer exports with PHI anonymization risk badges.') }}
				</p>
			</div>
			<button
				type="button"
				class="mdv__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="mdv__controls">
			<div class="mdv__control-row">
				<span class="mdv__control-label">{{ t('duplicatefinder', 'Clinical Preset') }}</span>
				<div
					class="mdv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Medical, DICOM and health imaging vault presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="mdv__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="mdv__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="mdv__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="mdv__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="mdv__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="mdv__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="mdv__seg-btn"
					:class="{ 'is-active': protectClinicalHoldAndSr }"
					:aria-pressed="protectClinicalHoldAndSr ? 'true' : 'false'"
					@click="protectClinicalHoldAndSr = !protectClinicalHoldAndSr">
					<span>{{ protectClinicalHoldAndSr ? t('duplicatefinder', 'Shield Clinical Hold & DICOMDIR/SR: ON') : t('duplicatefinder', 'Shield Clinical Hold & DICOMDIR/SR: OFF') }}</span>
				</button>

				<button
					type="button"
					class="mdv__seg-btn"
					:class="{ 'is-active': protectCanonicalPacsSeries }"
					:aria-pressed="protectCanonicalPacsSeries ? 'true' : 'false'"
					@click="protectCanonicalPacsSeries = !protectCanonicalPacsSeries">
					<span>{{ protectCanonicalPacsSeries ? t('duplicatefinder', 'Shield Canonical PACS Series: ON') : t('duplicatefinder', 'Shield Canonical PACS Series: OFF') }}</span>
				</button>
			</div>

			<div class="mdv__control-row mdv__inputs-row">
				<label class="mdv__field">
					<span class="mdv__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="mdv__input">
						<option value="prune-exports-keep-series">{{ t('duplicatefinder', 'Prune Exports & Keep PACS Series') }}</option>
						<option value="consolidate-pacs-hardlinks">{{ t('duplicatefinder', 'Hardlink-Consolidate PACS Series') }}</option>
						<option value="prune-viewer-exports-only">{{ t('duplicatefinder', 'Prune Viewer & CD Exports Only') }}</option>
					</select>
				</label>

				<label class="mdv__field">
					<span class="mdv__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="mdv__input">
						<option value="pacs-series-clinical-first">{{ t('duplicatefinder', 'Clinical-Hold / DICOMDIR / PACS first') }}</option>
						<option value="anonymized-deid-first">{{ t('duplicatefinder', 'Anonymized / De-ID copy first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical path') }}</option>
					</select>
				</label>

				<label class="mdv__field">
					<span class="mdv__field-label">{{ t('duplicatefinder', 'Export Age (d)') }}</span>
					<input
						v-model="staleExportDaysInput"
						type="number"
						min="0"
						step="1"
						class="mdv__input mdv__num-input">
				</label>

				<label class="mdv__field">
					<span class="mdv__field-label">{{ t('duplicatefinder', 'Min Size (MiB)') }}</span>
					<input
						v-model="minSizeMbInput"
						type="number"
						min="0"
						step="1"
						class="mdv__input mdv__num-input">
				</label>

				<label class="mdv__field mdv__field-grow">
					<span class="mdv__field-label">{{ t('duplicatefinder', 'Filter Cohort, Study ID, Modality or PHI') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="mdv__input"
						:placeholder="t('duplicatefinder', 'e.g. STUDY-2026, sub-042, .dcm, .nii.gz, fhir, phi')">
				</label>

				<label class="mdv__field mdv__field-grow">
					<span class="mdv__field-label">{{ t('duplicatefinder', 'Nextcloud Data Root') }}</span>
					<input
						v-model="dataRootInput"
						type="text"
						class="mdv__input"
						placeholder="/var/www/nextcloud/data">
				</label>

				<label class="mdv__field">
					<span class="mdv__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="mdv__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="phi_risk_desc">{{ t('duplicatefinder', 'PHI exposure risk') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Study filename (A-Z)') }}</option>
					</select>
				</label>
			</div>

			<div class="mdv__control-row">
				<span class="mdv__control-label">{{ t('duplicatefinder', 'Imaging Family') }}</span>
				<div
					class="mdv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Medical imaging vault family filter')">
					<button
						type="button"
						class="mdv__seg-btn"
						:class="{ 'is-active': familyFilter === 'all' }"
						:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
						@click="familyFilter = 'all'">
						<span>{{ t('duplicatefinder', 'All Families ({count})', { count: analysis.summary.totalUnfilteredClustersCount }) }}</span>
					</button>
					<button
						v-for="fam in analysis.familyBreakdown"
						:key="fam.id"
						type="button"
						class="mdv__seg-btn"
						:class="{ 'is-active': familyFilter === fam.id }"
						:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
						:title="fam.shortLabel"
						@click="familyFilter = fam.id">
						<span>{{ fam.label }} ({{ fam.clustersCount }})</span>
					</button>
				</div>
			</div>

			<div class="mdv__control-row">
				<span class="mdv__control-label">{{ t('duplicatefinder', 'PHI & Verdict') }}</span>
				<div
					class="mdv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Medical vault PHI and verdict filter')">
					<button
						v-for="opt in verdictFilterOptions"
						:key="opt.id"
						type="button"
						class="mdv__seg-btn"
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
			class="mdv__empty-filter"
			role="note">
			<p class="mdv__empty-title">
				{{ t('duplicatefinder', 'No DICOM studies, NIfTI volumes, HL7/FHIR payloads or radiology report duplicate clusters match the active filters.') }}
			</p>
			<button
				type="button"
				class="mdv__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="mdv__workspace">
			<div
				class="mdv__cluster-list"
				role="list"
				:aria-label="t('duplicatefinder', 'Audited medical imaging and health record clusters')">
				<button
					v-for="cluster in visibleClusters"
					:key="cluster.groupKey"
					type="button"
					class="mdv__cluster-card"
					:class="{ 'is-selected': selectedCluster && selectedCluster.groupKey === cluster.groupKey }"
					@click="selectedClusterKey = cluster.groupKey">
					<div class="mdv__cluster-top">
						<strong class="mdv__cluster-name">{{ cluster.displayName }}</strong>
						<span
							class="mdv__pill"
							:class="riskPillClass(cluster.riskState)">
							{{ formatRiskLabel(cluster.riskState) }}
						</span>
					</div>
					<div class="mdv__cluster-meta">
						<span class="mdv__tag">{{ cluster.patientCohort }}</span>
						<span class="mdv__tag">{{ cluster.studySeriesId }}</span>
						<span class="mdv__tag">{{ cluster.modality }}</span>
					</div>
					<div class="mdv__cluster-badges">
						<span
							class="mdv__badge"
							:class="phiBadgeClass(cluster.phiRiskLevel)">
							{{ cluster.phiRiskBadge }}
						</span>
						<span
							v-if="cluster.hasClinicalHold"
							class="mdv__badge is-danger">
							{{ t('duplicatefinder', 'Clinical Hold') }}
						</span>
						<span
							v-if="cluster.hasDicomdirOrSr"
							class="mdv__badge is-keep">
							{{ t('duplicatefinder', 'DICOMDIR/SR') }}
						</span>
						<span
							v-if="cluster.hasProtectedPacsSeries"
							class="mdv__badge is-consolidate">
							{{ t('duplicatefinder', 'PACS Series') }}
						</span>
					</div>
					<div class="mdv__cluster-bottom">
						<span>{{ cluster.copiesCount }} {{ t('duplicatefinder', 'copies') }}</span>
						<strong class="mdv__cluster-reclaim">{{ cluster.formattedReclaimableBytes }}</strong>
					</div>
				</button>

				<button
					v-if="analysis.clusters.length > visibleLimit"
					type="button"
					class="mdv__load-more-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more clusters ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
				</button>
			</div>

			<div
				v-if="selectedCluster"
				class="mdv__inspector">
				<header class="mdv__inspector-head">
					<div class="mdv__inspector-title-wrap">
						<h4 class="mdv__inspector-title">
							{{ selectedCluster.displayName }}
						</h4>
						<p class="mdv__inspector-sub">
							{{ selectedCluster.vaultKey }} | {{ selectedCluster.imagingSystem }} | {{ selectedCluster.familyLabel }}
						</p>
					</div>
					<div class="mdv__inspector-actions">
						<button
							type="button"
							class="mdv__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Open in Triage') }}</span>
						</button>
						<button
							type="button"
							class="mdv__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Side-by-Side') }}</span>
						</button>
					</div>
				</header>

				<div class="mdv__lineage-grid">
					<div class="mdv__lineage-item">
						<span class="mdv__lineage-label">{{ t('duplicatefinder', 'Patient / Subject Cohort') }}</span>
						<strong class="mdv__lineage-val">{{ selectedCluster.patientCohort }} ({{ selectedCluster.sliceLabel }})</strong>
					</div>
					<div class="mdv__lineage-item">
						<span class="mdv__lineage-label">{{ t('duplicatefinder', 'Study / Series & Modality') }}</span>
						<strong class="mdv__lineage-val">{{ selectedCluster.studySeriesId }} / {{ selectedCluster.modality }}</strong>
					</div>
					<div class="mdv__lineage-item">
						<span class="mdv__lineage-label">{{ t('duplicatefinder', 'PHI & Anonymization Risk') }}</span>
						<strong class="mdv__lineage-val">
							{{ selectedCluster.phiRiskBadge }}
							|
							{{ selectedCluster.hasClinicalHold ? t('duplicatefinder', 'Clinical Hold Locked') : (selectedCluster.hasDicomdirOrSr ? t('duplicatefinder', 'DICOMDIR/SR Protected') : selectedCluster.formatBadge) }}
						</strong>
					</div>
					<div class="mdv__lineage-item">
						<span class="mdv__lineage-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<strong class="mdv__lineage-val is-accent">
							{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableGb }})
						</strong>
					</div>
				</div>

				<div class="mdv__members-list">
					<div
						v-for="member in selectedCluster.members"
						:key="member.selectionKey"
						class="mdv__member-card">
						<div class="mdv__member-top">
							<code class="mdv__member-path">{{ member.path }}</code>
							<div class="mdv__member-pills">
								<span
									class="mdv__pill"
									:class="phiBadgeClass(member.meta.phiRiskLevel)">
									{{ member.meta.phiRiskBadge }}
								</span>
								<span
									class="mdv__pill"
									:class="authorityPillClass(member.authorityScore)">
									{{ t('duplicatefinder', 'Authority {score}', { score: member.authorityScore }) }}
								</span>
								<span
									class="mdv__pill"
									:class="verdictPillClass(member.verdict)">
									{{ member.verdict }}
								</span>
							</div>
						</div>
						<div class="mdv__member-bottom">
							<div class="mdv__member-meta">
								<span>{{ member.formattedSize }}</span>
								<span>{{ member.formattedMtime }}</span>
								<span>{{ member.verdictReason }}</span>
							</div>
							<label
								v-if="member.verdict !== 'keep-canonical-survivor'"
								class="mdv__override-field">
								<span class="mdv__sr-only">{{ t('duplicatefinder', 'Override verdict') }}</span>
								<select
									class="mdv__override-select"
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

				<div class="mdv__code-panels">
					<div class="mdv__code-box">
						<div class="mdv__code-head">
							<strong>{{ t('duplicatefinder', 'DRY_RUN=1 POSIX Cleanup Script') }}</strong>
							<button
								type="button"
								class="mdv__mini-btn"
								@click="copyRemediationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="mdv__pre"><code>{{ generatedScript }}</code></pre>
					</div>

					<div class="mdv__code-box">
						<div class="mdv__code-head">
							<strong>{{ t('duplicatefinder', 'Nextcloud .sync-exclude.lst Rules') }}</strong>
							<button
								type="button"
								class="mdv__mini-btn"
								@click="copySyncExcludeSnippet">
								<span>{{ t('duplicatefinder', 'Copy Rules') }}</span>
							</button>
						</div>
						<pre class="mdv__pre"><code>{{ generatedSyncExclude }}</code></pre>
					</div>
				</div>
			</div>
		</div>
	</section>
</template>

<script>
import { copyTextSafely } from '../tools/clipboardHelper'
import {
	MEDICAL_DICOM_PRESETS,
	analyzeMedicalDicomVault,
	buildMedicalDicomCsvReport,
	buildMedicalDicomJsonReport,
	buildMedicalDicomRemediationScript,
	buildMedicalDicomSyncExcludeSnippet,
} from '../tools/medicalDicomVaultAuditor'

export default {
	name: 'MedicalDicomVaultWorkbench',
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
			presetId: 'all-medical-dicom-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'prune-exports-keep-series',
			survivorRule: 'pacs-series-clinical-first',
			protectClinicalHoldAndSr: true,
			protectCanonicalPacsSeries: true,
			staleExportDaysInput: '14',
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
			return MEDICAL_DICOM_PRESETS
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable') },
				{ id: 'phi-high', label: this.t('duplicatefinder', 'PHI Risk: High') },
				{ id: 'anonymized', label: this.t('duplicatefinder', 'Anonymized / De-ID') },
				{ id: 'clinical-hold', label: this.t('duplicatefinder', 'Clinical Hold / DICOMDIR') },
				{ id: 'dicom-series', label: this.t('duplicatefinder', 'DICOM Series') },
				{ id: 'nifti-bids', label: this.t('duplicatefinder', 'NIfTI / BIDS') },
				{ id: 'hl7-fhir', label: this.t('duplicatefinder', 'HL7 / FHIR') },
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
		parsedMinSizeMb() {
			const trimmed = String(this.minSizeMbInput ?? '').trim()
			if (!trimmed) {
				return 0
			}
			const parsed = Number(trimmed)
			return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
		},
		analysis() {
			return analyzeMedicalDicomVault(this.activePool, {
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectClinicalHoldAndSr: this.protectClinicalHoldAndSr,
				protectCanonicalPacsSeries: this.protectCanonicalPacsSeries,
				staleExportDays: this.parsedStaleExportDays,
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
			return buildMedicalDicomRemediationScript(this.analysis, {
				dataRoot: this.dataRootInput,
			})
		},
		generatedSyncExclude() {
			return buildMedicalDicomSyncExcludeSnippet(this.analysis)
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
			const preset = MEDICAL_DICOM_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectClinicalHoldAndSr = preset.protectClinicalHoldAndSr
			this.protectCanonicalPacsSeries = preset.protectCanonicalPacsSeries
			this.staleExportDaysInput = String(preset.staleExportDays)
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
		phiBadgeClass(phiRiskLevel) {
			if (phiRiskLevel === 'high-phi') {
				return 'is-danger'
			}
			if (phiRiskLevel === 'anonymized') {
				return 'is-keep'
			}
			return 'is-warn'
		},
		formatRiskLabel(riskState) {
			const map = {
				reclaimable: this.t('duplicatefinder', 'Reclaimable'),
				consolidatable: this.t('duplicatefinder', 'Hardlink Ready'),
				'phi-high-reclaimable': this.t('duplicatefinder', 'PHI High Reclaimable'),
				'clinical-hold-locked': this.t('duplicatefinder', 'Clinical Hold Locked'),
				'dicomdir-sr-protected': this.t('duplicatefinder', 'DICOMDIR/SR Protected'),
				'pacs-series-protected': this.t('duplicatefinder', 'PACS Series Protected'),
				shielded: this.t('duplicatefinder', 'Shielded'),
			}
			return map[riskState] || riskState
		},
		riskPillClass(riskState) {
			if (riskState === 'clinical-hold-locked' || riskState === 'phi-high-reclaimable') {
				return 'is-danger'
			}
			if (riskState === 'dicomdir-sr-protected' || riskState === 'pacs-series-protected' || riskState === 'shielded') {
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
			if (verdict === 'blocked-clinical-hold' || verdict === 'blocked-dicomdir-sr') {
				return 'is-danger'
			}
			if (verdict.startsWith('blocked-')) {
				return 'is-warn'
			}
			if (verdict === 'consolidate-hardlink-pacs-asset') {
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
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 Medical DICOM Vault remediation script to clipboard.'))
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
			const csv = buildMedicalDicomCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-medical-dicom-vault-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe Medical DICOM Vault CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildMedicalDicomJsonReport(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-medical-dicom-vault-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported Medical DICOM Vault JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.medical-dicom-vault-workbench {
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

.mdv__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
}

.mdv__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.mdv__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.mdv__status-badge {
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

.mdv__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.mdv__tool-btn,
.mdv__seg-btn,
.mdv__primary-btn,
.mdv__load-more-btn,
.mdv__mini-btn {
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

.mdv__tool-btn:hover:not(:disabled),
.mdv__seg-btn:hover:not(:disabled),
.mdv__load-more-btn:hover:not(:disabled),
.mdv__mini-btn:hover:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element);
}

.mdv__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.mdv__tool-btn.is-primary-outline,
.mdv__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.mdv__primary-btn {
	background-color: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #fff);
}

.mdv__tool-btn:focus-visible,
.mdv__seg-btn:focus-visible,
.mdv__primary-btn:focus-visible,
.mdv__load-more-btn:focus-visible,
.mdv__mini-btn:focus-visible,
.mdv__cluster-card:focus-visible,
.mdv__input:focus-visible,
.mdv__override-select:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.mdv__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 6px;
	font-size: 0.85rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.mdv__notice.is-success {
	background-color: var(--color-background-hover);
	border-color: var(--color-success, #2d8a4e);
}

.mdv__notice.is-error {
	background-color: var(--color-background-hover);
	border-color: var(--color-error, #b91c1c);
}

.mdv__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.mdv__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.mdv__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.mdv__kpi-val {
	font-size: 0.92rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.mdv__kpi-val.is-accent {
	color: var(--color-primary-element);
}

.mdv__kpi-val.is-warn {
	color: var(--color-warning-text, var(--color-main-text));
}

.mdv__empty-banner,
.mdv__empty-filter {
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

.mdv__empty-text {
	flex: 1 1 240px;
	min-inline-size: 0;
}

.mdv__empty-title {
	margin: 0 0 4px;
	font-weight: 700;
	font-size: 0.92rem;
}

.mdv__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
}

.mdv__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
}

.mdv__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.mdv__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	min-inline-size: 96px;
}

.mdv__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
}

.mdv__inputs-row {
	align-items: flex-end;
}

.mdv__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.mdv__field-grow {
	flex: 1 1 180px;
}

.mdv__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.mdv__input,
.mdv__override-select {
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

.mdv__num-input {
	inline-size: 96px;
}

.mdv__workspace {
	display: grid;
	grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
	gap: 12px;
	min-inline-size: 0;
}

.mdv__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 640px;
	overflow-y: auto;
	min-inline-size: 0;
}

.mdv__cluster-card {
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

.mdv__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.mdv__cluster-top,
.mdv__cluster-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
}

.mdv__cluster-name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.mdv__cluster-meta,
.mdv__cluster-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
}

.mdv__tag {
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: 4px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-family: monospace;
	font-size: 0.75rem;
}

.mdv__badge,
.mdv__pill {
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

.mdv__pill.is-keep,
.mdv__badge.is-keep {
	border-color: var(--color-success, #2d8a4e);
}

.mdv__pill.is-danger,
.mdv__badge.is-danger {
	border-color: var(--color-error, #b91c1c);
}

.mdv__pill.is-consolidate,
.mdv__badge.is-consolidate {
	border-color: var(--color-primary-element);
}

.mdv__pill.is-warn,
.mdv__badge.is-warn {
	border-color: var(--color-warning, #b45309);
}

.mdv__cluster-reclaim {
	font-family: monospace;
	font-size: 0.84rem;
}

.mdv__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.mdv__inspector-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 8px;
	border-block-end: 1px solid var(--color-border);
}

.mdv__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.mdv__inspector-title {
	margin: 0 0 4px;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.mdv__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	font-family: monospace;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.mdv__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.mdv__lineage-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.mdv__lineage-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.mdv__lineage-label {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
}

.mdv__lineage-val {
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.mdv__lineage-val.is-accent {
	color: var(--color-primary-element);
}

.mdv__members-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.mdv__member-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.mdv__member-top,
.mdv__member-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.mdv__member-path {
	font-size: 0.8rem;
	overflow-wrap: anywhere;
	min-inline-size: 0;
	flex: 1 1 200px;
}

.mdv__member-pills {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.mdv__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	min-inline-size: 0;
}

.mdv__code-panels {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.mdv__code-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.mdv__code-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
}

.mdv__pre {
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

.mdv__sr-only {
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
	.mdv__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.mdv__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.mdv__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 640px) {
	.medical-dicom-vault-workbench {
		padding: 10px;
	}

	.mdv__kpis,
	.mdv__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.mdv__num-input {
		inline-size: 100%;
	}

	.mdv__field {
		flex: 1 1 100%;
	}
}
</style>
