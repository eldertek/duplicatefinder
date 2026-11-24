<template>
	<section
		class="dfir-security-vault-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Cybersecurity, DFIR Forensics, PCAP and Threat Intel Evidence Vault Auditor')">
		<header class="dsv__toolbar">
			<div class="dsv__title-group">
				<h3 class="dsv__title">
					{{ t('duplicatefinder', 'Cybersecurity, DFIR Forensics, PCAP & Threat Intel Evidence Vault Auditor') }}
				</h3>
				<span
					class="dsv__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} ({gb}) reclaimable / {forensics} e01+vmem, {pcaps} pcap.gz+siem, {ioc} ioc, {rawpcap} pcap-dup, {scratch} scratch', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						gb: analysis.summary.reclaimableGb,
						forensics: analysis.summary.totalForensicImageClusters,
						pcaps: analysis.summary.totalCompressedPcapSiemClusters,
						ioc: analysis.summary.totalThreatIntelClusters,
						rawpcap: analysis.summary.totalRedundantPcapClusters,
						scratch: analysis.summary.totalCarvingScratchClusters,
					}) }}
				</span>
			</div>

			<div class="dsv__toolbar-actions">
				<button
					type="button"
					class="dsv__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="dsv__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="dsv__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="dsv__tool-btn"
					@click="copySyncExcludeSnippet">
					<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
				</button>
				<button
					type="button"
					class="dsv__tool-btn is-close"
					aria-keyshortcuts="Shift+F11"
					:title="t('duplicatefinder', 'Hide Cybersecurity, DFIR Forensics, PCAP and Threat Intel Evidence Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide DFIR & Security Vault') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="dsv__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="dsv__kpis">
			<div class="dsv__kpi">
				<span class="dsv__kpi-label">{{ t('duplicatefinder', 'Safe PCAP & Scratch Reclaim') }}</span>
				<strong class="dsv__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.reclaimableGb }} / {{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="dsv__kpi">
				<span class="dsv__kpi-label">{{ t('duplicatefinder', 'Conserved E01/VMEM, PCAP.GZ & IOCs') }}</span>
				<strong class="dsv__kpi-val is-warn">
					{{ analysis.summary.totalForensicImageClusters }} {{ t('duplicatefinder', 'e01/vmem') }} / {{ analysis.summary.totalCompressedPcapSiemClusters }} {{ t('duplicatefinder', 'pcap.gz/siem') }} / {{ analysis.summary.totalThreatIntelClusters }} {{ t('duplicatefinder', 'ioc/quarantine') }}
				</strong>
			</div>
			<div class="dsv__kpi">
				<span class="dsv__kpi-label">{{ t('duplicatefinder', 'Redundant .pcap & Carving Scratch') }}</span>
				<strong class="dsv__kpi-val is-danger">
					{{ analysis.summary.totalRedundantPcapClusters }} {{ t('duplicatefinder', 'pcap-dup') }} / {{ analysis.summary.totalCarvingScratchClusters }} {{ t('duplicatefinder', 'scratch') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="dsv__kpi">
				<span class="dsv__kpi-label">{{ t('duplicatefinder', 'Raw Evidence Duplicate Footprint') }}</span>
				<strong class="dsv__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="dsv__empty-banner"
			role="note">
			<div class="dsv__empty-text">
				<p class="dsv__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure E01/VMEM, PCAP.GZ, and YARA/Quarantine shields before scanning') }}
				</p>
				<p class="dsv__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit forensic disk/memory images (.e01, .aff4, .vmem, .lime, .dd, .dmp), packet captures (.pcap, .pcapng, .pcap.gz, .pcap.zst, .har), malware/IOCs (.yar, .stix, .sigma.yml, .zip.enc), and SIEM/Volatility/Plaso carving scratch (.evtx, .plaso, volatility_cache/, carved_tmp/).') }}
				</p>
			</div>
			<button
				type="button"
				class="dsv__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="dsv__controls">
			<div class="dsv__control-row">
				<span class="dsv__control-label">{{ t('duplicatefinder', 'Vault Preset') }}</span>
				<div
					class="dsv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'DFIR and Security vault presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="dsv__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="dsv__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="dsv__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="dsv__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="dsv__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="dsv__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="dsv__seg-btn"
					:class="{ 'is-active': protectForensicEvidenceImages }"
					:aria-pressed="protectForensicEvidenceImages ? 'true' : 'false'"
					@click="protectForensicEvidenceImages = !protectForensicEvidenceImages">
					<span>{{ protectForensicEvidenceImages ? t('duplicatefinder', 'Shield .e01/.vmem/.aff4: ON') : t('duplicatefinder', 'Shield .e01/.vmem/.aff4: OFF') }}</span>
				</button>

				<button
					type="button"
					class="dsv__seg-btn"
					:class="{ 'is-active': protectCompressedPcapAndSiem }"
					:aria-pressed="protectCompressedPcapAndSiem ? 'true' : 'false'"
					@click="protectCompressedPcapAndSiem = !protectCompressedPcapAndSiem">
					<span>{{ protectCompressedPcapAndSiem ? t('duplicatefinder', 'Shield .pcap.gz/.evtx: ON') : t('duplicatefinder', 'Shield .pcap.gz/.evtx: OFF') }}</span>
				</button>

				<button
					type="button"
					class="dsv__seg-btn"
					:class="{ 'is-active': protectThreatIntelAndQuarantine }"
					:aria-pressed="protectThreatIntelAndQuarantine ? 'true' : 'false'"
					@click="protectThreatIntelAndQuarantine = !protectThreatIntelAndQuarantine">
					<span>{{ protectThreatIntelAndQuarantine ? t('duplicatefinder', 'Shield .yar/.stix/.enc: ON') : t('duplicatefinder', 'Shield .yar/.stix/.enc: OFF') }}</span>
				</button>

				<button
					type="button"
					class="dsv__seg-btn"
					:class="{ 'is-active': requireCompressedPcapAnchorForPrune }"
					:aria-pressed="requireCompressedPcapAnchorForPrune ? 'true' : 'false'"
					@click="requireCompressedPcapAnchorForPrune = !requireCompressedPcapAnchorForPrune">
					<span>{{ requireCompressedPcapAnchorForPrune ? t('duplicatefinder', 'Require .pcap.gz for .pcap: ON') : t('duplicatefinder', 'Require .pcap.gz for .pcap: OFF') }}</span>
				</button>
			</div>

			<div class="dsv__control-row dsv__inputs-row">
				<label class="dsv__field">
					<span class="dsv__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="dsv__input">
						<option value="prune-pcap-and-carving-scratch">{{ t('duplicatefinder', 'Prune Redundant .pcap & Carving Scratch') }}</option>
						<option value="hardlink-archived-forensics-and-pcap">{{ t('duplicatefinder', 'Hardlink Immutable E01/PCAP.GZ (Block Mutable)') }}</option>
						<option value="quarantine-uncompressed-pcap-and-scratch">{{ t('duplicatefinder', 'Quarantine Uncompressed .pcap & Scratch') }}</option>
					</select>
				</label>

				<label class="dsv__field">
					<span class="dsv__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="dsv__input">
						<option value="evidence-custody-archive-first">{{ t('duplicatefinder', 'Archived E01/VMEM, PCAP.GZ & Custody first') }}</option>
						<option value="oldest-acquisition-first">{{ t('duplicatefinder', 'Oldest acquisition mtime first') }}</option>
						<option value="newest-analysis-first">{{ t('duplicatefinder', 'Newest case revision first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical vault path') }}</option>
					</select>
				</label>

				<label class="dsv__field">
					<span class="dsv__field-label">{{ t('duplicatefinder', 'Incident Grace (d)') }}</span>
					<input
						v-model="keepRecentIncidentDaysInput"
						type="number"
						min="0"
						step="1"
						class="dsv__input dsv__num-input">
				</label>

				<label class="dsv__field">
					<span class="dsv__field-label">{{ t('duplicatefinder', 'Min Size (KiB)') }}</span>
					<input
						v-model="minSizeKbInput"
						type="number"
						min="0"
						step="1"
						class="dsv__input dsv__num-input">
				</label>

				<label class="dsv__field dsv__field-grow">
					<span class="dsv__field-label">{{ t('duplicatefinder', 'Filter Incident, Tooling Platform, Evidence Format or Scratch Path') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="dsv__input"
						:placeholder="t('duplicatefinder', 'e.g. e01, vmem, pcap.gz, pcap, yara, stix, evtx, volatility, plaso')">
				</label>

				<label class="dsv__field">
					<span class="dsv__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="dsv__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Redundant .pcap & scratch priority') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Artifact filename (A-Z)') }}</option>
					</select>
				</label>
			</div>

			<div class="dsv__control-row">
				<span class="dsv__control-label">{{ t('duplicatefinder', 'Evidence Family') }}</span>
				<div
					class="dsv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'DFIR and Security evidence family filter')">
					<button
						type="button"
						class="dsv__seg-btn"
						:class="{ 'is-active': familyFilter === 'all' }"
						:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
						@click="familyFilter = 'all'">
						<span>{{ t('duplicatefinder', 'All Families ({count})', { count: analysis.summary.totalUnfilteredClustersCount }) }}</span>
					</button>
					<button
						v-for="fam in analysis.familyBreakdown"
						:key="fam.id"
						type="button"
						class="dsv__seg-btn"
						:class="{ 'is-active': familyFilter === fam.id }"
						:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
						:title="fam.shortLabel"
						@click="familyFilter = fam.id">
						<span>{{ fam.label }} ({{ fam.clustersCount }})</span>
					</button>
				</div>
			</div>

			<div class="dsv__control-row">
				<span class="dsv__control-label">{{ t('duplicatefinder', 'Governance') }}</span>
				<div
					class="dsv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'DFIR governance verdict filter')">
					<button
						v-for="opt in verdictFilterOptions"
						:key="opt.id"
						type="button"
						class="dsv__seg-btn"
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
			class="dsv__empty-filter"
			role="note">
			<p class="dsv__empty-title">
				{{ t('duplicatefinder', 'No forensic images, packet captures, threat intel bundles, or carving scratch match the active filters.') }}
			</p>
			<button
				type="button"
				class="dsv__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="dsv__workspace">
			<div
				class="dsv__cluster-list"
				role="list"
				:aria-label="t('duplicatefinder', 'Audited DFIR and Security evidence clusters')">
				<button
					v-for="cluster in visibleClusters"
					:key="String(cluster.id)"
					type="button"
					class="dsv__cluster-card"
					:class="{ 'is-selected': selectedCluster && selectedCluster.id === cluster.id }"
					@click="selectedClusterId = cluster.id">
					<div class="dsv__cluster-top">
						<strong class="dsv__cluster-name">{{ cluster.name }}</strong>
						<span
							class="dsv__pill"
							:class="verdictPillClass(cluster.clusterVerdict)">
							{{ formatVerdictLabel(cluster.clusterVerdict) }}
						</span>
					</div>
					<div class="dsv__cluster-meta">
						<span
							v-if="cluster.toolingPlatform"
							class="dsv__tag">{{ cluster.toolingPlatform }}</span>
						<span
							v-if="cluster.evidenceStage"
							class="dsv__tag">{{ cluster.evidenceStage }}</span>
						<span class="dsv__tag">{{ cluster.familyLabel }}</span>
					</div>
					<div class="dsv__cluster-badges">
						<span
							v-if="cluster.hasRedundantUncompressedPcap"
							class="dsv__badge is-security">
							{{ cluster.hasCompressedPcapAnchor
								? t('duplicatefinder', 'Redundant .pcap (PCAP.GZ Anchor Exists)')
								: t('duplicatefinder', 'Uncompressed .pcap (No PCAP.GZ Anchor)') }}
						</span>
						<span
							v-if="cluster.hasProtectedForensicImage"
							class="dsv__badge is-keep">
							{{ t('duplicatefinder', 'E01 / VMEM / Custody Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedCompressedPcapOrSiem"
							class="dsv__badge is-keep">
							{{ t('duplicatefinder', 'PCAP.GZ / SIEM Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedThreatIntelOrQuarantine"
							class="dsv__badge is-consolidate">
							{{ t('duplicatefinder', 'YARA / STIX / Quarantine Conserved') }}
						</span>
						<span
							v-if="cluster.hasCarvingScratchIntermediate"
							class="dsv__badge is-warn">
							{{ t('duplicatefinder', 'Volatility / Plaso / Carving Scratch') }}
						</span>
					</div>
					<div class="dsv__cluster-bottom">
						<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
						<strong class="dsv__cluster-reclaim">{{ cluster.formattedReclaimableBytes }}</strong>
					</div>
				</button>

				<button
					v-if="analysis.clusters.length > visibleLimit"
					type="button"
					class="dsv__load-more-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more clusters ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
				</button>
			</div>

			<div
				v-if="selectedCluster"
				class="dsv__inspector">
				<header class="dsv__inspector-head">
					<div class="dsv__inspector-title-wrap">
						<h4 class="dsv__inspector-title">
							{{ selectedCluster.name }}
						</h4>
						<p class="dsv__inspector-sub">
							{{ selectedCluster.toolingPlatform || selectedCluster.lineageStem }} | {{ selectedCluster.evidenceStage || selectedCluster.familyLabel }} | {{ selectedCluster.formattedUnitBytes }}
						</p>
					</div>
					<div class="dsv__inspector-actions">
						<button
							type="button"
							class="dsv__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Open in Triage') }}</span>
						</button>
						<button
							type="button"
							class="dsv__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Side-by-Side') }}</span>
						</button>
					</div>
				</header>

				<div class="dsv__lineage-grid">
					<div class="dsv__lineage-item">
						<span class="dsv__lineage-label">{{ t('duplicatefinder', 'Case Lineage & Tooling Platform') }}</span>
						<strong class="dsv__lineage-val">{{ selectedCluster.toolingPlatform ? `${selectedCluster.toolingPlatform} / ` : '' }}{{ selectedCluster.lineageStem }} ({{ selectedCluster.incidentAnchorKey }})</strong>
					</div>
					<div class="dsv__lineage-item">
						<span class="dsv__lineage-label">{{ t('duplicatefinder', 'Chain-of-Custody & Vault Shield') }}</span>
						<strong class="dsv__lineage-val">
							{{ selectedCluster.hasProtectedForensicImage ? t('duplicatefinder', 'E01 / VMEM / Hash Manifest Shielded') : (selectedCluster.hasProtectedCompressedPcapOrSiem ? t('duplicatefinder', 'PCAP.GZ / SIEM Cold Archive Shielded') : (selectedCluster.hasProtectedThreatIntelOrQuarantine ? t('duplicatefinder', 'YARA / STIX / Quarantine Shielded') : t('duplicatefinder', 'Carving or Scratch Artifact'))) }}
						</strong>
					</div>
					<div class="dsv__lineage-item">
						<span class="dsv__lineage-label">{{ t('duplicatefinder', 'Compressed PCAP Archive Anchor') }}</span>
						<strong class="dsv__lineage-val">
							{{ selectedCluster.hasCompressedPcapAnchor ? t('duplicatefinder', 'Verified .pcap.gz / .pcap.zst Anchor Found') : t('duplicatefinder', 'No Compressed PCAP Anchor Detected') }}
						</strong>
					</div>
					<div class="dsv__lineage-item">
						<span class="dsv__lineage-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<strong class="dsv__lineage-val is-accent">
							{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableTargetsCount }} {{ t('duplicatefinder', 'targets') }})
						</strong>
					</div>
				</div>

				<div class="dsv__members-list">
					<div
						v-for="member in selectedCluster.members"
						:key="member.key"
						class="dsv__member-card">
						<div class="dsv__member-top">
							<code class="dsv__member-path">{{ member.normalized }}</code>
							<div class="dsv__member-pills">
								<span
									v-if="member.isRedundantPcapMember"
									class="dsv__pill is-security">
									{{ t('duplicatefinder', 'REDUNDANT .PCAP (PCAP.GZ EXISTS)') }}
								</span>
								<span
									v-if="member.isCarvingScratchPath"
									class="dsv__pill is-warn">
									{{ t('duplicatefinder', 'CARVING / VOLATILITY SCRATCH') }}
								</span>
								<span
									class="dsv__pill"
									:class="verdictPillClass(member.governanceTier)">
									{{ member.artifactKind }}
								</span>
								<span
									v-if="member.dfirTag"
									class="dsv__pill is-consolidate">
									{{ member.dfirTag }}
								</span>
								<span
									class="dsv__pill"
									:class="actionPillClass(member)">
									{{ formatMemberActionLabel(member) }}
								</span>
							</div>
						</div>
						<div class="dsv__member-bottom">
							<div class="dsv__member-meta">
								<span>{{ formatMemberSize(member.size) }}</span>
								<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
								<span>{{ member.vaultRole }}</span>
								<span v-if="member.pcapRedundancyReason">{{ member.pcapRedundancyReason }}</span>
								<span v-if="member.protectedReason">{{ member.protectedReason }}</span>
							</div>
							<div class="dsv__member-actions">
								<button
									type="button"
									class="dsv__mini-btn"
									@click="copyMemberPath(member.normalized)">
									<span>{{ t('duplicatefinder', 'Copy Path') }}</span>
								</button>
								<label
									v-if="!member.isSurvivor && !(member.isProtectedForensicImage && protectForensicEvidenceImages) && !(member.isProtectedCompressedPcapOrSiem && protectCompressedPcapAndSiem) && !(member.isProtectedThreatIntelOrQuarantine && protectThreatIntelAndQuarantine)"
									class="dsv__override-field">
									<span class="dsv__sr-only">{{ t('duplicatefinder', 'Override verdict') }}</span>
									<select
										class="dsv__override-select"
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

				<div class="dsv__code-panels">
					<div class="dsv__code-box">
						<div class="dsv__code-head">
							<strong>{{ t('duplicatefinder', 'DRY_RUN=1 POSIX Cleanup Script') }}</strong>
							<button
								type="button"
								class="dsv__mini-btn"
								@click="copyRemediationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="dsv__pre"><code>{{ generatedScript }}</code></pre>
					</div>

					<div class="dsv__code-box">
						<div class="dsv__code-head">
							<strong>{{ t('duplicatefinder', 'Nextcloud .sync-exclude.lst Rules') }}</strong>
							<button
								type="button"
								class="dsv__mini-btn"
								@click="copySyncExcludeSnippet">
								<span>{{ t('duplicatefinder', 'Copy Rules') }}</span>
							</button>
						</div>
						<pre class="dsv__pre"><code>{{ generatedSyncExclude }}</code></pre>
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
	DFIR_SECURITY_PRESETS,
	auditDfirSecurityVault,
	buildDfirSecurityCsvReport,
	buildDfirSecurityJsonManifest,
	buildDfirSecurityRemediationScript,
	buildDfirSecuritySyncExcludeList,
} from '../tools/dfirSecurityVaultAuditor'

export default {
	name: 'DfirSecurityVaultWorkbench',
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
			presetId: 'all-dfir-security-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'prune-pcap-and-carving-scratch',
			survivorRule: 'evidence-custody-archive-first',
			protectForensicEvidenceImages: true,
			protectCompressedPcapAndSiem: true,
			protectThreatIntelAndQuarantine: true,
			requireCompressedPcapAnchorForPrune: true,
			keepRecentIncidentDaysInput: '0',
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
			return DFIR_SECURITY_PRESETS
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable') },
				{ id: 'uncompressed-pcap-redundant', label: this.t('duplicatefinder', 'Redundant .pcap') },
				{ id: 'carving-scratch-intermediate', label: this.t('duplicatefinder', 'Carving Scratch') },
				{ id: 'forensic-image-protected', label: this.t('duplicatefinder', 'E01 / VMEM') },
				{ id: 'compressed-pcap-siem-protected', label: this.t('duplicatefinder', 'PCAP.GZ / SIEM') },
				{ id: 'threat-intel-quarantine-protected', label: this.t('duplicatefinder', 'YARA / Quarantine') },
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
		parsedKeepRecentIncidentDays() {
			const trimmed = String(this.keepRecentIncidentDaysInput ?? '').trim()
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
			return auditDfirSecurityVault(this.activePool, {
				presetId: this.presetId,
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectForensicEvidenceImages: this.protectForensicEvidenceImages,
				protectCompressedPcapAndSiem: this.protectCompressedPcapAndSiem,
				protectThreatIntelAndQuarantine: this.protectThreatIntelAndQuarantine,
				requireCompressedPcapAnchorForPrune: this.requireCompressedPcapAnchorForPrune,
				keepRecentIncidentDays: this.parsedKeepRecentIncidentDays,
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
			return buildDfirSecurityRemediationScript(this.analysis)
		},
		generatedSyncExclude() {
			return buildDfirSecuritySyncExcludeList()
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
			const preset = DFIR_SECURITY_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectForensicEvidenceImages = preset.protectForensicEvidenceImages
			this.protectCompressedPcapAndSiem = preset.protectCompressedPcapAndSiem
			this.protectThreatIntelAndQuarantine = preset.protectThreatIntelAndQuarantine
			this.requireCompressedPcapAnchorForPrune = preset.requireCompressedPcapAnchorForPrune
			this.keepRecentIncidentDaysInput = String(preset.keepRecentIncidentDays)
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
				'forensic-image-protected': this.t('duplicatefinder', 'E01 / VMEM'),
				'compressed-pcap-siem-protected': this.t('duplicatefinder', 'PCAP.GZ / SIEM'),
				'threat-intel-quarantine-protected': this.t('duplicatefinder', 'YARA / Quarantine'),
				'uncompressed-pcap-redundant': this.t('duplicatefinder', 'Redundant .pcap'),
				'carving-scratch-intermediate': this.t('duplicatefinder', 'Carving Scratch'),
			}
			return map[verdict] || verdict
		},
		verdictPillClass(verdict) {
			if (verdict === 'uncompressed-pcap-redundant') {
				return 'is-security'
			}
			if (verdict === 'forensic-image-protected' || verdict === 'compressed-pcap-siem-protected') {
				return 'is-keep'
			}
			if (verdict === 'threat-intel-quarantine-protected') {
				return 'is-consolidate'
			}
			if (verdict === 'carving-scratch-intermediate') {
				return 'is-reclaim'
			}
			return 'is-warn'
		},
		actionPillClass(member) {
			if (member.action === 'delete') {
				return member.isRedundantPcapMember ? 'is-security' : 'is-reclaim'
			}
			if (member.action === 'hardlink') {
				return 'is-consolidate'
			}
			return member.shielded ? 'is-keep' : 'is-warn'
		},
		formatMemberActionLabel(member) {
			if (member.action === 'delete') {
				return (this.strategy === 'quarantine-uncompressed-pcap-and-scratch' && (member.isUncompressedPcapFile || member.isCarvingScratchPath))
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
				this.setNotice(this.t('duplicatefinder', 'Copied DFIR or Security vault file path to clipboard.'))
			} else {
				this.setNotice(this.t('duplicatefinder', 'Unable to copy path to clipboard.'), 'error')
			}
		},
		async copyRemediationScript() {
			const ok = await copyTextSafely(this.generatedScript)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 DFIR & Security remediation script to clipboard.'))
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
			const csv = buildDfirSecurityCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-dfir-security-vault-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe DFIR & Security Vault CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildDfirSecurityJsonManifest(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-dfir-security-vault-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported DFIR & Security Vault JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.dfir-security-vault-workbench {
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

.dsv__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
}

.dsv__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.dsv__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.dsv__status-badge {
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

.dsv__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.dsv__tool-btn,
.dsv__seg-btn,
.dsv__primary-btn,
.dsv__load-more-btn,
.dsv__mini-btn {
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

.dsv__tool-btn:hover:not(:disabled),
.dsv__seg-btn:hover:not(:disabled),
.dsv__load-more-btn:hover:not(:disabled),
.dsv__mini-btn:hover:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element);
}

.dsv__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.dsv__tool-btn.is-primary-outline,
.dsv__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.dsv__primary-btn {
	background-color: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #fff);
}

.dsv__tool-btn:focus-visible,
.dsv__seg-btn:focus-visible,
.dsv__primary-btn:focus-visible,
.dsv__load-more-btn:focus-visible,
.dsv__mini-btn:focus-visible,
.dsv__cluster-card:focus-visible,
.dsv__input:focus-visible,
.dsv__override-select:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.dsv__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 6px;
	font-size: 0.85rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.dsv__notice.is-success {
	background-color: var(--color-background-hover);
	border-color: var(--color-success, #2d8a4e);
}

.dsv__notice.is-error {
	background-color: var(--color-background-hover);
	border-color: var(--color-error, #b91c1c);
}

.dsv__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.dsv__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.dsv__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.dsv__kpi-val {
	font-size: 0.92rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.dsv__kpi-val.is-accent {
	color: var(--color-primary-element);
}

.dsv__kpi-val.is-warn {
	color: var(--color-warning-text, var(--color-main-text));
}

.dsv__kpi-val.is-danger {
	color: var(--color-error, #b91c1c);
}

.dsv__empty-banner,
.dsv__empty-filter {
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

.dsv__empty-text {
	flex: 1 1 240px;
	min-inline-size: 0;
}

.dsv__empty-title {
	margin: 0 0 4px;
	font-weight: 700;
	font-size: 0.92rem;
}

.dsv__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
}

.dsv__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
}

.dsv__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.dsv__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	min-inline-size: 96px;
}

.dsv__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
}

.dsv__inputs-row {
	align-items: flex-end;
}

.dsv__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.dsv__field-grow {
	flex: 1 1 180px;
}

.dsv__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.dsv__input,
.dsv__override-select {
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

.dsv__num-input {
	inline-size: 96px;
}

.dsv__workspace {
	display: grid;
	grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
	gap: 12px;
	min-inline-size: 0;
}

.dsv__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 640px;
	overflow-y: auto;
	min-inline-size: 0;
}

.dsv__cluster-card {
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

.dsv__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.dsv__cluster-top,
.dsv__cluster-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
}

.dsv__cluster-name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.dsv__cluster-meta,
.dsv__cluster-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
}

.dsv__tag {
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: 4px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-family: monospace;
	font-size: 0.75rem;
}

.dsv__badge,
.dsv__pill {
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

.dsv__pill.is-keep,
.dsv__badge.is-keep {
	border-color: var(--color-success, #2d8a4e);
}

.dsv__pill.is-security,
.dsv__badge.is-security {
	border-color: var(--color-error, #b91c1c);
	color: var(--color-error, #b91c1c);
}

.dsv__pill.is-consolidate,
.dsv__badge.is-consolidate {
	border-color: var(--color-primary-element);
}

.dsv__pill.is-warn,
.dsv__badge.is-warn {
	border-color: var(--color-warning, #b45309);
}

.dsv__pill.is-reclaim {
	border-color: var(--color-primary-element);
}

.dsv__cluster-reclaim {
	font-family: monospace;
	font-size: 0.84rem;
}

.dsv__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.dsv__inspector-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 8px;
	border-block-end: 1px solid var(--color-border);
}

.dsv__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.dsv__inspector-title {
	margin: 0 0 4px;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.dsv__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	font-family: monospace;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.dsv__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.dsv__lineage-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.dsv__lineage-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.dsv__lineage-label {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
}

.dsv__lineage-val {
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.dsv__lineage-val.is-accent {
	color: var(--color-primary-element);
}

.dsv__members-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.dsv__member-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.dsv__member-top,
.dsv__member-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.dsv__member-path {
	font-size: 0.8rem;
	overflow-wrap: anywhere;
	min-inline-size: 0;
	flex: 1 1 200px;
}

.dsv__member-pills,
.dsv__member-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
}

.dsv__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	min-inline-size: 0;
}

.dsv__code-panels {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.dsv__code-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.dsv__code-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
}

.dsv__pre {
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

.dsv__sr-only {
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
	.dsv__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.dsv__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.dsv__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 640px) {
	.dfir-security-vault-workbench {
		padding: 10px;
	}

	.dsv__kpis,
	.dsv__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.dsv__num-input {
		inline-size: 100%;
	}

	.dsv__field {
		flex: 1 1 100%;
	}
}
</style>
