<template>
	<section
		class="k8s-terraform-vault-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Kubernetes, Terraform and Infrastructure-as-Code State Vault Auditor')">
		<header class="ktv__toolbar">
			<div class="ktv__title-group">
				<h3 class="ktv__title">
					{{ t('duplicatefinder', 'Kubernetes, Terraform & IaC State Vault Auditor') }}
				</h3>
				<span
					class="ktv__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} ({gb}) reclaimable / {state} state, {helm} helm, {certs} pki, {secrets} secret-risk', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						gb: analysis.summary.reclaimableGb,
						state: analysis.summary.totalActiveStateClusters,
						helm: analysis.summary.totalHelmReleaseClusters,
						certs: analysis.summary.totalActiveCertKeyClusters,
						secrets: analysis.summary.totalSecretExposureClusters,
					}) }}
				</span>
			</div>

			<div class="ktv__toolbar-actions">
				<button
					type="button"
					class="ktv__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="ktv__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="ktv__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="ktv__tool-btn"
					@click="copySyncExcludeSnippet">
					<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
				</button>
				<button
					type="button"
					class="ktv__tool-btn is-close"
					aria-keyshortcuts="Shift+F2"
					:title="t('duplicatefinder', 'Hide Kubernetes, Terraform and IaC State Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide K8s & Terraform Vault') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="ktv__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="ktv__kpis">
			<div class="ktv__kpi">
				<span class="ktv__kpi-label">{{ t('duplicatefinder', 'Safe Backup, Plan & Leak Reclaim') }}</span>
				<strong class="ktv__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.reclaimableGb }} / {{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="ktv__kpi">
				<span class="ktv__kpi-label">{{ t('duplicatefinder', 'Conserved State, Helm & PKI') }}</span>
				<strong class="ktv__kpi-val is-warn">
					{{ analysis.summary.totalActiveStateClusters }} {{ t('duplicatefinder', 'state') }} / {{ analysis.summary.totalHelmReleaseClusters }} {{ t('duplicatefinder', 'helm') }} / {{ analysis.summary.totalActiveCertKeyClusters }} {{ t('duplicatefinder', 'certs') }}
				</strong>
			</div>
			<div class="ktv__kpi">
				<span class="ktv__kpi-label">{{ t('duplicatefinder', 'Stale Backups/Plans & Secret Risks') }}</span>
				<strong class="ktv__kpi-val is-danger">
					{{ analysis.summary.totalStaleBackupPlanClusters }} {{ t('duplicatefinder', 'stale') }} / {{ analysis.summary.totalSecretExposureClusters }} {{ t('duplicatefinder', 'secret exposure') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="ktv__kpi">
				<span class="ktv__kpi-label">{{ t('duplicatefinder', 'Raw IaC & Cluster Footprint') }}</span>
				<strong class="ktv__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="ktv__empty-banner"
			role="note">
			<div class="ktv__empty-text">
				<p class="ktv__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure active .tfstate, Helm release, and PKI certificate shields before scanning') }}
				</p>
				<p class="ktv__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit Terraform states (.tfstate, .tfstate.backup, .tfplan), secret-risk variables (.tfvars), Helm/K8s manifests (.yaml, .yml, .tgz), and PKI credentials (.pem, .crt, .key, .kubeconfig).') }}
				</p>
			</div>
			<button
				type="button"
				class="ktv__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="ktv__controls">
			<div class="ktv__control-row">
				<span class="ktv__control-label">{{ t('duplicatefinder', 'Vault Preset') }}</span>
				<div
					class="ktv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Kubernetes and Terraform vault presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="ktv__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="ktv__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="ktv__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="ktv__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="ktv__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="ktv__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="ktv__seg-btn"
					:class="{ 'is-active': protectActiveTfstate }"
					:aria-pressed="protectActiveTfstate ? 'true' : 'false'"
					@click="protectActiveTfstate = !protectActiveTfstate">
					<span>{{ protectActiveTfstate ? t('duplicatefinder', 'Shield Active .tfstate: ON') : t('duplicatefinder', 'Shield Active .tfstate: OFF') }}</span>
				</button>

				<button
					type="button"
					class="ktv__seg-btn"
					:class="{ 'is-active': protectHelmReleases }"
					:aria-pressed="protectHelmReleases ? 'true' : 'false'"
					@click="protectHelmReleases = !protectHelmReleases">
					<span>{{ protectHelmReleases ? t('duplicatefinder', 'Shield Helm Releases: ON') : t('duplicatefinder', 'Shield Helm Releases: OFF') }}</span>
				</button>

				<button
					type="button"
					class="ktv__seg-btn"
					:class="{ 'is-active': protectActiveCertsAndKeys }"
					:aria-pressed="protectActiveCertsAndKeys ? 'true' : 'false'"
					@click="protectActiveCertsAndKeys = !protectActiveCertsAndKeys">
					<span>{{ protectActiveCertsAndKeys ? t('duplicatefinder', 'Shield Active Certs/Keys: ON') : t('duplicatefinder', 'Shield Active Certs/Keys: OFF') }}</span>
				</button>

				<button
					type="button"
					class="ktv__seg-btn"
					:class="{ 'is-active': requireActiveStateAnchor }"
					:aria-pressed="requireActiveStateAnchor ? 'true' : 'false'"
					@click="requireActiveStateAnchor = !requireActiveStateAnchor">
					<span>{{ requireActiveStateAnchor ? t('duplicatefinder', 'Require State Anchor: ON') : t('duplicatefinder', 'Require State Anchor: OFF') }}</span>
				</button>
			</div>

			<div class="ktv__control-row ktv__inputs-row">
				<label class="ktv__field">
					<span class="ktv__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="ktv__input">
						<option value="prune-backups-plans-and-leaks">{{ t('duplicatefinder', 'Prune Stale Backups/Plans & Quarantine Secrets') }}</option>
						<option value="hardlink-immutable-charts">{{ t('duplicatefinder', 'Hardlink Immutable Helm .tgz (Block State & Keys)') }}</option>
						<option value="quarantine-stale-and-exposed">{{ t('duplicatefinder', 'Quarantine Stale Snapshots & Exposed Secrets Only') }}</option>
					</select>
				</label>

				<label class="ktv__field">
					<span class="ktv__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="ktv__input">
						<option value="active-state-and-vault-first">{{ t('duplicatefinder', 'Active .tfstate, Certs & Helm Releases first') }}</option>
						<option value="oldest-vault-first">{{ t('duplicatefinder', 'Oldest vault mtime first') }}</option>
						<option value="newest-active-state">{{ t('duplicatefinder', 'Newest active state mtime first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical vault path') }}</option>
					</select>
				</label>

				<label class="ktv__field">
					<span class="ktv__field-label">{{ t('duplicatefinder', 'Backup Grace (d)') }}</span>
					<input
						v-model="keepRecentBackupDaysInput"
						type="number"
						min="0"
						step="1"
						class="ktv__input ktv__num-input">
				</label>

				<label class="ktv__field">
					<span class="ktv__field-label">{{ t('duplicatefinder', 'Min Size (KiB)') }}</span>
					<input
						v-model="minSizeKbInput"
						type="number"
						min="0"
						step="1"
						class="ktv__input ktv__num-input">
				</label>

				<label class="ktv__field ktv__field-grow">
					<span class="ktv__field-label">{{ t('duplicatefinder', 'Filter Stack, Environment, Artifact or Secret Path') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="ktv__input"
						:placeholder="t('duplicatefinder', 'e.g. Terraform, Helm, prod, tfstate.backup, tfvars, tfplan, kubeconfig, key')">
				</label>

				<label class="ktv__field">
					<span class="ktv__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="ktv__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Security & state priority') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Artifact filename (A-Z)') }}</option>
					</select>
				</label>
			</div>

			<div class="ktv__control-row">
				<span class="ktv__control-label">{{ t('duplicatefinder', 'Artifact Family') }}</span>
				<div
					class="ktv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Kubernetes and Terraform artifact family filter')">
					<button
						type="button"
						class="ktv__seg-btn"
						:class="{ 'is-active': familyFilter === 'all' }"
						:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
						@click="familyFilter = 'all'">
						<span>{{ t('duplicatefinder', 'All Families ({count})', { count: analysis.summary.totalUnfilteredClustersCount }) }}</span>
					</button>
					<button
						v-for="fam in analysis.familyBreakdown"
						:key="fam.id"
						type="button"
						class="ktv__seg-btn"
						:class="{ 'is-active': familyFilter === fam.id }"
						:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
						:title="fam.shortLabel"
						@click="familyFilter = fam.id">
						<span>{{ fam.label }} ({{ fam.clustersCount }})</span>
					</button>
				</div>
			</div>

			<div class="ktv__control-row">
				<span class="ktv__control-label">{{ t('duplicatefinder', 'Governance') }}</span>
				<div
					class="ktv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'IaC governance verdict filter')">
					<button
						v-for="opt in verdictFilterOptions"
						:key="opt.id"
						type="button"
						class="ktv__seg-btn"
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
			class="ktv__empty-filter"
			role="note">
			<p class="ktv__empty-title">
				{{ t('duplicatefinder', 'No Terraform states, Helm charts, K8s manifests, or PKI certificates match the active filters.') }}
			</p>
			<button
				type="button"
				class="ktv__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="ktv__workspace">
			<div
				class="ktv__cluster-list"
				role="list"
				:aria-label="t('duplicatefinder', 'Audited Kubernetes and Terraform State Vault clusters')">
				<button
					v-for="cluster in visibleClusters"
					:key="String(cluster.id)"
					type="button"
					class="ktv__cluster-card"
					:class="{ 'is-selected': selectedCluster && selectedCluster.id === cluster.id }"
					@click="selectedClusterId = cluster.id">
					<div class="ktv__cluster-top">
						<strong class="ktv__cluster-name">{{ cluster.name }}</strong>
						<span
							class="ktv__pill"
							:class="verdictPillClass(cluster.clusterVerdict)">
							{{ formatVerdictLabel(cluster.clusterVerdict) }}
						</span>
					</div>
					<div class="ktv__cluster-meta">
						<span
							v-if="cluster.iacTool"
							class="ktv__tag">{{ cluster.iacTool }}</span>
						<span
							v-if="cluster.iacEnvironment"
							class="ktv__tag">{{ cluster.iacEnvironment }}</span>
						<span class="ktv__tag">{{ cluster.iacLineageStem || cluster.name }}</span>
						<span class="ktv__tag">{{ cluster.familyLabel }}</span>
					</div>
					<div class="ktv__cluster-badges">
						<span
							v-if="cluster.hasSecretExposureRisk"
							class="ktv__badge is-security">
							{{ cluster.maxSecretRiskLevel === 'critical'
								? t('duplicatefinder', 'Secret Exposure Risk: CRITICAL')
								: t('duplicatefinder', 'Secret Exposure Risk: ELEVATED') }}
						</span>
						<span
							v-if="cluster.hasActiveTfstate"
							class="ktv__badge is-keep">
							{{ t('duplicatefinder', 'Active .tfstate Conserved') }}
						</span>
						<span
							v-if="cluster.hasActiveCertOrKey"
							class="ktv__badge is-keep">
							{{ t('duplicatefinder', 'Active PKI / Kubeconfig') }}
						</span>
						<span
							v-if="cluster.hasHelmRelease"
							class="ktv__badge is-consolidate">
							{{ t('duplicatefinder', 'Active Helm Release') }}
						</span>
						<span
							v-if="cluster.hasRedundantTfstateBackup"
							class="ktv__badge is-warn">
							{{ t('duplicatefinder', 'Redundant .tfstate.backup') }}
						</span>
						<span
							v-if="cluster.hasExpiredTfplan"
							class="ktv__badge is-warn">
							{{ t('duplicatefinder', 'Expired .tfplan') }}
						</span>
					</div>
					<div class="ktv__cluster-bottom">
						<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
						<strong class="ktv__cluster-reclaim">{{ cluster.formattedReclaimableBytes }}</strong>
					</div>
				</button>

				<button
					v-if="analysis.clusters.length > visibleLimit"
					type="button"
					class="ktv__load-more-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more clusters ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
				</button>
			</div>

			<div
				v-if="selectedCluster"
				class="ktv__inspector">
				<header class="ktv__inspector-head">
					<div class="ktv__inspector-title-wrap">
						<h4 class="ktv__inspector-title">
							{{ selectedCluster.name }}
						</h4>
						<p class="ktv__inspector-sub">
							{{ selectedCluster.iacTool || selectedCluster.iacLineageStem }} | {{ selectedCluster.iacEnvironment || selectedCluster.familyLabel }} | {{ selectedCluster.formattedUnitBytes }}
						</p>
					</div>
					<div class="ktv__inspector-actions">
						<button
							type="button"
							class="ktv__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Open in Triage') }}</span>
						</button>
						<button
							type="button"
							class="ktv__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Side-by-Side') }}</span>
						</button>
					</div>
				</header>

				<div class="ktv__lineage-grid">
					<div class="ktv__lineage-item">
						<span class="ktv__lineage-label">{{ t('duplicatefinder', 'IaC Stack & Environment') }}</span>
						<strong class="ktv__lineage-val">{{ selectedCluster.iacTool ? `${selectedCluster.iacTool} / ` : '' }}{{ selectedCluster.iacEnvironment ? `${selectedCluster.iacEnvironment} / ` : '' }}{{ selectedCluster.iacLineageStem }}</strong>
					</div>
					<div class="ktv__lineage-item">
						<span class="ktv__lineage-label">{{ t('duplicatefinder', 'State, Release & PKI Conservation') }}</span>
						<strong class="ktv__lineage-val">
							{{ selectedCluster.hasActiveTfstate ? t('duplicatefinder', 'Active .tfstate Shielded') : (selectedCluster.hasActiveCertOrKey ? t('duplicatefinder', 'Active Cert/Key/Kubeconfig Shielded') : (selectedCluster.hasHelmRelease ? t('duplicatefinder', 'Active Helm Release Shielded') : t('duplicatefinder', 'Stale Backup, Plan, or Exposed Secret Copy'))) }}
						</strong>
					</div>
					<div class="ktv__lineage-item">
						<span class="ktv__lineage-label">{{ t('duplicatefinder', 'Secret Security & State Anchor') }}</span>
						<strong class="ktv__lineage-val">
							{{ selectedCluster.hasSecretExposureRisk ? t('duplicatefinder', 'Secret Exposure Risk ({level})', { level: selectedCluster.maxSecretRiskLevel.toUpperCase() }) : t('duplicatefinder', 'No Secret Exposure Flagged') }} | {{ selectedCluster.hasActiveStateAnchor ? t('duplicatefinder', 'Active .tfstate Anchor Verified') : t('duplicatefinder', 'No .tfstate Anchor') }}
						</strong>
					</div>
					<div class="ktv__lineage-item">
						<span class="ktv__lineage-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<strong class="ktv__lineage-val is-accent">
							{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableTargetsCount }} {{ t('duplicatefinder', 'targets') }})
						</strong>
					</div>
				</div>

				<div class="ktv__members-list">
					<div
						v-for="member in selectedCluster.members"
						:key="member.key"
						class="ktv__member-card">
						<div class="ktv__member-top">
							<code class="ktv__member-path">{{ member.normalized }}</code>
							<div class="ktv__member-pills">
								<span
									v-if="member.hasSecretExposureRisk"
									class="ktv__pill is-security">
									{{ member.secretRiskLevel === 'critical'
										? t('duplicatefinder', 'SECRET RISK: CRITICAL')
										: t('duplicatefinder', 'SECRET RISK: ELEVATED') }}
								</span>
								<span
									class="ktv__pill"
									:class="verdictPillClass(member.governanceTier)">
									{{ member.artifactKind }}
								</span>
								<span
									v-if="member.iacTag"
									class="ktv__pill is-consolidate">
									{{ member.iacTag }}
								</span>
								<span
									class="ktv__pill"
									:class="actionPillClass(member)">
									{{ formatMemberActionLabel(member) }}
								</span>
							</div>
						</div>
						<div class="ktv__member-bottom">
							<div class="ktv__member-meta">
								<span>{{ formatMemberSize(member.size) }}</span>
								<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
								<span>{{ member.vaultRole }}</span>
								<span v-if="member.secretExposureReason">{{ member.secretExposureReason }}</span>
								<span v-if="member.protectedReason">{{ member.protectedReason }}</span>
							</div>
							<div class="ktv__member-actions">
								<button
									type="button"
									class="ktv__mini-btn"
									@click="copyMemberPath(member.normalized)">
									<span>{{ t('duplicatefinder', 'Copy Path') }}</span>
								</button>
								<label
									v-if="!member.isSurvivor && !(member.isActiveTfstate && protectActiveTfstate) && !(member.isHelmRelease && protectHelmReleases) && !(member.isActiveCertOrKey && protectActiveCertsAndKeys)"
									class="ktv__override-field">
									<span class="ktv__sr-only">{{ t('duplicatefinder', 'Override verdict') }}</span>
									<select
										class="ktv__override-select"
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

				<div class="ktv__code-panels">
					<div class="ktv__code-box">
						<div class="ktv__code-head">
							<strong>{{ t('duplicatefinder', 'DRY_RUN=1 POSIX Cleanup Script') }}</strong>
							<button
								type="button"
								class="ktv__mini-btn"
								@click="copyRemediationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="ktv__pre"><code>{{ generatedScript }}</code></pre>
					</div>

					<div class="ktv__code-box">
						<div class="ktv__code-head">
							<strong>{{ t('duplicatefinder', 'Nextcloud .sync-exclude.lst Rules') }}</strong>
							<button
								type="button"
								class="ktv__mini-btn"
								@click="copySyncExcludeSnippet">
								<span>{{ t('duplicatefinder', 'Copy Rules') }}</span>
							</button>
						</div>
						<pre class="ktv__pre"><code>{{ generatedSyncExclude }}</code></pre>
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
	K8S_TERRAFORM_PRESETS,
	auditK8sTerraformVault,
	buildK8sTerraformCsvReport,
	buildK8sTerraformJsonManifest,
	buildK8sTerraformRemediationScript,
	buildK8sTerraformSyncExcludeList,
} from '../tools/k8sTerraformVaultAuditor'

export default {
	name: 'K8sTerraformVaultWorkbench',
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
			presetId: 'all-k8s-terraform-vault-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'prune-backups-plans-and-leaks',
			survivorRule: 'active-state-and-vault-first',
			protectActiveTfstate: true,
			protectHelmReleases: true,
			protectActiveCertsAndKeys: true,
			requireActiveStateAnchor: true,
			keepRecentBackupDaysInput: '0',
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
			return K8S_TERRAFORM_PRESETS
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable') },
				{ id: 'secret-exposure-risk', label: this.t('duplicatefinder', 'Secret Risk') },
				{ id: 'active-tfstate-protected', label: this.t('duplicatefinder', 'Active .tfstate') },
				{ id: 'helm-release-protected', label: this.t('duplicatefinder', 'Helm Release') },
				{ id: 'active-cert-key-protected', label: this.t('duplicatefinder', 'Cert / Key') },
				{ id: 'redundant-tfstate-backup', label: this.t('duplicatefinder', 'State Backup') },
				{ id: 'expired-tfplan-artifact', label: this.t('duplicatefinder', 'Expired .tfplan') },
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
		parsedKeepRecentBackupDays() {
			const trimmed = String(this.keepRecentBackupDaysInput ?? '').trim()
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
			return auditK8sTerraformVault(this.activePool, {
				presetId: this.presetId,
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectActiveTfstate: this.protectActiveTfstate,
				protectHelmReleases: this.protectHelmReleases,
				protectActiveCertsAndKeys: this.protectActiveCertsAndKeys,
				requireActiveStateAnchor: this.requireActiveStateAnchor,
				keepRecentBackupDays: this.parsedKeepRecentBackupDays,
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
			return buildK8sTerraformRemediationScript(this.analysis)
		},
		generatedSyncExclude() {
			return buildK8sTerraformSyncExcludeList()
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
			const preset = K8S_TERRAFORM_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectActiveTfstate = preset.protectActiveTfstate
			this.protectHelmReleases = preset.protectHelmReleases
			this.protectActiveCertsAndKeys = preset.protectActiveCertsAndKeys
			this.requireActiveStateAnchor = preset.requireActiveStateAnchor
			this.keepRecentBackupDaysInput = String(preset.keepRecentBackupDays)
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
				'active-tfstate-protected': this.t('duplicatefinder', 'Active .tfstate'),
				'helm-release-protected': this.t('duplicatefinder', 'Helm Release'),
				'active-cert-key-protected': this.t('duplicatefinder', 'Active Cert / Key'),
				'redundant-tfstate-backup': this.t('duplicatefinder', '.tfstate.backup'),
				'expired-tfplan-artifact': this.t('duplicatefinder', 'Expired .tfplan'),
				'secret-exposure-risk': this.t('duplicatefinder', 'Secret Risk'),
				'iac-manifest-duplicate': this.t('duplicatefinder', 'IaC Duplicate'),
			}
			return map[verdict] || verdict
		},
		verdictPillClass(verdict) {
			if (verdict === 'secret-exposure-risk') {
				return 'is-security'
			}
			if (verdict === 'active-tfstate-protected' || verdict === 'active-cert-key-protected') {
				return 'is-keep'
			}
			if (verdict === 'helm-release-protected') {
				return 'is-consolidate'
			}
			if (verdict === 'redundant-tfstate-backup' || verdict === 'expired-tfplan-artifact') {
				return 'is-reclaim'
			}
			return 'is-warn'
		},
		actionPillClass(member) {
			if (member.action === 'delete') {
				return member.hasSecretExposureRisk ? 'is-security' : 'is-reclaim'
			}
			if (member.action === 'hardlink') {
				return 'is-consolidate'
			}
			return member.shielded ? 'is-keep' : 'is-warn'
		},
		formatMemberActionLabel(member) {
			if (member.action === 'delete') {
				return (this.strategy === 'quarantine-stale-and-exposed' || member.hasSecretExposureRisk)
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
				this.setNotice(this.t('duplicatefinder', 'Copied Kubernetes or Terraform vault file path to clipboard.'))
			} else {
				this.setNotice(this.t('duplicatefinder', 'Unable to copy path to clipboard.'), 'error')
			}
		},
		async copyRemediationScript() {
			const ok = await copyTextSafely(this.generatedScript)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 Kubernetes & Terraform remediation script to clipboard.'))
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
			const csv = buildK8sTerraformCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-k8s-terraform-vault-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe Kubernetes & Terraform State Vault CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildK8sTerraformJsonManifest(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-k8s-terraform-vault-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported Kubernetes & Terraform State Vault JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.k8s-terraform-vault-workbench {
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

.ktv__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
}

.ktv__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.ktv__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.ktv__status-badge {
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

.ktv__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.ktv__tool-btn,
.ktv__seg-btn,
.ktv__primary-btn,
.ktv__load-more-btn,
.ktv__mini-btn {
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

.ktv__tool-btn:hover:not(:disabled),
.ktv__seg-btn:hover:not(:disabled),
.ktv__load-more-btn:hover:not(:disabled),
.ktv__mini-btn:hover:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element);
}

.ktv__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.ktv__tool-btn.is-primary-outline,
.ktv__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.ktv__primary-btn {
	background-color: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #fff);
}

.ktv__tool-btn:focus-visible,
.ktv__seg-btn:focus-visible,
.ktv__primary-btn:focus-visible,
.ktv__load-more-btn:focus-visible,
.ktv__mini-btn:focus-visible,
.ktv__cluster-card:focus-visible,
.ktv__input:focus-visible,
.ktv__override-select:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.ktv__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 6px;
	font-size: 0.85rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.ktv__notice.is-success {
	background-color: var(--color-background-hover);
	border-color: var(--color-success, #2d8a4e);
}

.ktv__notice.is-error {
	background-color: var(--color-background-hover);
	border-color: var(--color-error, #b91c1c);
}

.ktv__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.ktv__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.ktv__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.ktv__kpi-val {
	font-size: 0.92rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.ktv__kpi-val.is-accent {
	color: var(--color-primary-element);
}

.ktv__kpi-val.is-warn {
	color: var(--color-warning-text, var(--color-main-text));
}

.ktv__kpi-val.is-danger {
	color: var(--color-error, #b91c1c);
}

.ktv__empty-banner,
.ktv__empty-filter {
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

.ktv__empty-text {
	flex: 1 1 240px;
	min-inline-size: 0;
}

.ktv__empty-title {
	margin: 0 0 4px;
	font-weight: 700;
	font-size: 0.92rem;
}

.ktv__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
}

.ktv__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
}

.ktv__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.ktv__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	min-inline-size: 96px;
}

.ktv__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
}

.ktv__inputs-row {
	align-items: flex-end;
}

.ktv__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.ktv__field-grow {
	flex: 1 1 180px;
}

.ktv__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.ktv__input,
.ktv__override-select {
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

.ktv__num-input {
	inline-size: 96px;
}

.ktv__workspace {
	display: grid;
	grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
	gap: 12px;
	min-inline-size: 0;
}

.ktv__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 640px;
	overflow-y: auto;
	min-inline-size: 0;
}

.ktv__cluster-card {
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

.ktv__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.ktv__cluster-top,
.ktv__cluster-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
}

.ktv__cluster-name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.ktv__cluster-meta,
.ktv__cluster-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
}

.ktv__tag {
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: 4px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-family: monospace;
	font-size: 0.75rem;
}

.ktv__badge,
.ktv__pill {
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

.ktv__pill.is-keep,
.ktv__badge.is-keep {
	border-color: var(--color-success, #2d8a4e);
}

.ktv__pill.is-security,
.ktv__badge.is-security {
	border-color: var(--color-error, #b91c1c);
	color: var(--color-error, #b91c1c);
}

.ktv__pill.is-consolidate,
.ktv__badge.is-consolidate {
	border-color: var(--color-primary-element);
}

.ktv__pill.is-warn,
.ktv__badge.is-warn {
	border-color: var(--color-warning, #b45309);
}

.ktv__pill.is-reclaim {
	border-color: var(--color-primary-element);
}

.ktv__cluster-reclaim {
	font-family: monospace;
	font-size: 0.84rem;
}

.ktv__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.ktv__inspector-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 8px;
	border-block-end: 1px solid var(--color-border);
}

.ktv__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.ktv__inspector-title {
	margin: 0 0 4px;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.ktv__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	font-family: monospace;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.ktv__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.ktv__lineage-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.ktv__lineage-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.ktv__lineage-label {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
}

.ktv__lineage-val {
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.ktv__lineage-val.is-accent {
	color: var(--color-primary-element);
}

.ktv__members-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.ktv__member-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.ktv__member-top,
.ktv__member-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.ktv__member-path {
	font-size: 0.8rem;
	overflow-wrap: anywhere;
	min-inline-size: 0;
	flex: 1 1 200px;
}

.ktv__member-pills,
.ktv__member-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
}

.ktv__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	min-inline-size: 0;
}

.ktv__code-panels {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.ktv__code-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.ktv__code-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
}

.ktv__pre {
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

.ktv__sr-only {
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
	.ktv__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.ktv__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.ktv__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 640px) {
	.k8s-terraform-vault-workbench {
		padding: 10px;
	}

	.ktv__kpis,
	.ktv__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.ktv__num-input {
		inline-size: 100%;
	}

	.ktv__field {
		flex: 1 1 100%;
	}
}
</style>
