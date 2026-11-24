<template>
	<section
		class="brand-kit-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Creative Brand Kit, Font Family and Vector/PSD Master Asset Auditor')">
		<header class="bkw__toolbar">
			<div class="bkw__title-group">
				<h3 class="bkw__title">
					{{ t('duplicatefinder', 'Creative Brand Kit, Font Family & Vector/PSD Master Auditor') }}
				</h3>
				<span
					class="bkw__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{kits} kits / {reclaim} reclaimable / {guarded} foundry-licensed kits', {
						kits: analysis.summary.totalKitsCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						guarded: analysis.summary.totalLicensedFontKitsCount,
					}) }}
				</span>
			</div>

			<div class="bkw__toolbar-actions">
				<button
					type="button"
					class="bkw__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="bkw__tool-btn"
					:disabled="analysis.kits.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="bkw__tool-btn"
					@click="copyConsolidationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="bkw__tool-btn is-close"
					aria-keyshortcuts=":"
					:title="t('duplicatefinder', 'Hide creative brand kit, font family and vector/PSD master asset auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Brand Kit Auditor') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="bkw__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="bkw__empty-banner"
			role="note">
			<div class="bkw__empty-text">
				<p class="bkw__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure brand kit protection rules before scanning') }}
				</p>
				<p class="bkw__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit duplicate foundry fonts (.otf/.ttf/.woff2), vector identity masters (.svg/.ai/.eps), layered PSD/Figma/InDesign files, and motion templates while protecting canonical Brand Kits.') }}
				</p>
			</div>
			<button
				type="button"
				class="bkw__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="bkw__controls">
			<div class="bkw__control-row">
				<span class="bkw__control-label">{{ t('duplicatefinder', 'Audit Preset') }}</span>
				<div
					class="bkw__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Brand kit audit presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="bkw__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="bkw__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="bkw__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="bkw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="bkw__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="bkw__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="bkw__seg-btn"
					:class="{ 'is-active': protectFoundryLicenses }"
					:aria-pressed="protectFoundryLicenses ? 'true' : 'false'"
					@click="protectFoundryLicenses = !protectFoundryLicenses">
					<span>{{ protectFoundryLicenses ? t('duplicatefinder', 'Foundry EULA Guard: ON') : t('duplicatefinder', 'Foundry EULA Guard: OFF') }}</span>
				</button>

				<button
					type="button"
					class="bkw__seg-btn"
					:class="{ 'is-active': protectBrandCanonical }"
					:aria-pressed="protectBrandCanonical ? 'true' : 'false'"
					@click="protectBrandCanonical = !protectBrandCanonical">
					<span>{{ protectBrandCanonical ? t('duplicatefinder', 'Canonical Brand Guard: ON') : t('duplicatefinder', 'Canonical Brand Guard: OFF') }}</span>
				</button>

				<button
					type="button"
					class="bkw__seg-btn"
					:class="{ 'is-active': protectDerivedLineage }"
					:aria-pressed="protectDerivedLineage ? 'true' : 'false'"
					@click="protectDerivedLineage = !protectDerivedLineage">
					<span>{{ protectDerivedLineage ? t('duplicatefinder', 'Package / Export Lineage: ON') : t('duplicatefinder', 'Package / Export Lineage: OFF') }}</span>
				</button>
			</div>

			<div class="bkw__control-row bkw__inputs-row">
				<label class="bkw__field">
					<span class="bkw__field-label">{{ t('duplicatefinder', 'Action Strategy') }}</span>
					<select v-model="strategy" class="bkw__input">
						<option value="consolidate-purge">{{ t('duplicatefinder', 'Consolidate & Purge Redundant Copies') }}</option>
						<option value="hardlink-preserve">{{ t('duplicatefinder', 'Hardlink / Reflink (preserve project fonts & links)') }}</option>
					</select>
				</label>

				<label class="bkw__field">
					<span class="bkw__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="bkw__input">
						<option value="brand-master-first">{{ t('duplicatefinder', 'Canonical Brand Kit / Master first') }}</option>
						<option value="licensed-foundry-first">{{ t('duplicatefinder', 'Foundry / EULA folder first') }}</option>
						<option value="oldest-mtime">{{ t('duplicatefinder', 'Oldest master timestamp') }}</option>
						<option value="newest-mtime">{{ t('duplicatefinder', 'Newest revised master') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical path') }}</option>
					</select>
				</label>

				<label class="bkw__field">
					<span class="bkw__field-label">{{ t('duplicatefinder', 'Min Kit Size (MiB)') }}</span>
					<input
						v-model="minSizeMbInput"
						type="number"
						min="0"
						step="1"
						class="bkw__input bkw__num-input">
				</label>

				<label class="bkw__field bkw__field-grow">
					<span class="bkw__field-label">{{ t('duplicatefinder', 'Filter Asset, Font, Vector or Path') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="bkw__input"
						:placeholder="t('duplicatefinder', 'e.g. .otf, .woff2, .svg, .psd, /Brand-Kit')">
				</label>

				<label class="bkw__field bkw__field-grow">
					<span class="bkw__field-label">{{ t('duplicatefinder', 'Nextcloud Data Root') }}</span>
					<input
						v-model="dataRootInput"
						type="text"
						class="bkw__input"
						placeholder="/var/www/nextcloud/data">
				</label>

				<label class="bkw__field">
					<span class="bkw__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="bkw__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="lineage_risk_desc">{{ t('duplicatefinder', 'License & lineage risk') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most project copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Asset name (A-Z)') }}</option>
					</select>
				</label>
			</div>
		</div>

		<div class="bkw__kpis">
			<div class="bkw__kpi">
				<span class="bkw__kpi-label">{{ t('duplicatefinder', 'Safe Brand Reclaim') }}</span>
				<strong class="bkw__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="bkw__kpi">
				<span class="bkw__kpi-label">{{ t('duplicatefinder', 'Foundry-Licensed Kits') }}</span>
				<strong class="bkw__kpi-val is-warn">
					{{ analysis.summary.totalLicensedFontKitsCount }} {{ t('duplicatefinder', 'kits') }} ({{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }})
				</strong>
			</div>
			<div class="bkw__kpi">
				<span class="bkw__kpi-label">{{ t('duplicatefinder', 'Sibling Derived Exports') }}</span>
				<strong class="bkw__kpi-val">
					{{ analysis.summary.totalDerivedExportsTracked }} {{ t('duplicatefinder', 'files') }} ({{ analysis.summary.formattedDerivedExportBytes }})
				</strong>
			</div>
			<div class="bkw__kpi">
				<span class="bkw__kpi-label">{{ t('duplicatefinder', 'Raw Creative Footprint') }}</span>
				<strong class="bkw__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="!sourcePoolEmpty"
			class="bkw__filters-strip">
			<div
				class="bkw__chip-group"
				role="group"
				:aria-label="t('duplicatefinder', 'Filter by creative asset family')">
				<button
					type="button"
					class="bkw__chip"
					:class="{ 'is-active': familyFilter === 'all' }"
					:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
					@click="familyFilter = 'all'">
					<span>{{ t('duplicatefinder', 'All Assets ({count})', { count: totalFamilyMatches }) }}</span>
				</button>
				<button
					v-for="familyItem in familyOptions"
					:key="familyItem.id"
					type="button"
					class="bkw__chip"
					:class="{ 'is-active': familyFilter === familyItem.id }"
					:aria-pressed="familyFilter === familyItem.id ? 'true' : 'false'"
					@click="familyFilter = familyItem.id">
					<span>{{ familyItem.label }} ({{ analysis.summary.familyCounts[familyItem.id] || 0 }})</span>
				</button>
			</div>

			<div
				class="bkw__chip-group"
				role="group"
				:aria-label="t('duplicatefinder', 'Filter by brand audit verdict')">
				<button
					v-for="verdictOpt in verdictFilterOptions"
					:key="verdictOpt.id"
					type="button"
					class="bkw__chip"
					:class="{ 'is-active': verdictFilter === verdictOpt.id }"
					:aria-pressed="verdictFilter === verdictOpt.id ? 'true' : 'false'"
					@click="verdictFilter = verdictOpt.id">
					<span>{{ verdictOpt.label }}</span>
				</button>
			</div>
		</div>

		<div
			v-if="!sourcePoolEmpty && analysis.kits.length === 0"
			class="bkw__empty-banner"
			role="note">
			<div class="bkw__empty-text">
				<p class="bkw__empty-title">
					{{ t('duplicatefinder', 'No brand kits, font families, or vector/PSD masters match the active filters') }}
				</p>
				<p class="bkw__empty-hint">
					{{ t('duplicatefinder', 'Lower the minimum kit size threshold, clear the search query, or switch to All Assets.') }}
				</p>
			</div>
			<button
				type="button"
				class="bkw__primary-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.kits.length > 0"
			class="bkw__workstation">
			<div class="bkw__list-pane">
				<div class="bkw__pane-header">
					<span class="bkw__pane-title">
						{{ t('duplicatefinder', 'Brand Asset Kits ({shown}/{total})', { shown: visibleKits.length, total: analysis.kits.length }) }}
					</span>
				</div>

				<div
					class="bkw__kit-list"
					role="listbox"
					:aria-label="t('duplicatefinder', 'Audited creative brand kits and master assets')">
					<button
						v-for="kit in visibleKits"
						:key="kit.groupKey"
						type="button"
						role="option"
						class="bkw__kit-item"
						:class="{ 'is-selected': selectedKit && selectedKit.groupKey === kit.groupKey }"
						:aria-selected="selectedKit && selectedKit.groupKey === kit.groupKey ? 'true' : 'false'"
						@click="selectedKitKey = kit.groupKey">
						<div class="bkw__kit-top">
							<span class="bkw__kit-name">
								{{ kit.displayName }}.{{ kit.extension }}
							</span>
							<span
								class="bkw__pill"
								:class="`is-risk-${kit.kitRiskState}`">
								{{ formatKitRiskLabel(kit.kitRiskState) }}
							</span>
						</div>
						<div class="bkw__kit-path">
							{{ kit.tierLabel }} | {{ kit.survivor.dirPath }}
						</div>
						<div class="bkw__kit-meta">
							<span>{{ kit.familyShortLabel }}</span>
							<span>{{ kit.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
							<span>{{ t('duplicatefinder', 'Reclaim:') }} {{ kit.formattedReclaimableBytes }}</span>
						</div>
					</button>
				</div>

				<div
					v-if="analysis.kits.length > visibleKits.length"
					class="bkw__load-more-wrap">
					<button
						type="button"
						class="bkw__seg-btn"
						@click="visibleLimit += 25">
						<span>{{ t('duplicatefinder', 'Show more kits ({remaining} remaining)', { remaining: analysis.kits.length - visibleKits.length }) }}</span>
					</button>
				</div>
			</div>

			<div
				v-if="selectedKit"
				class="bkw__inspector-pane">
				<div class="bkw__inspector-header">
					<div class="bkw__inspector-title-wrap">
						<h4 class="bkw__inspector-title">
							{{ selectedKit.displayName }}.{{ selectedKit.extension }}
						</h4>
						<span class="bkw__inspector-sub">
							{{ selectedKit.specLabel }} | {{ selectedKit.familyLabel }}
						</span>
					</div>
					<div class="bkw__inspector-actions">
						<button
							type="button"
							class="bkw__tool-btn"
							@click="jumpToDuplicate(selectedKit)">
							<span>{{ t('duplicatefinder', 'Jump to Group') }}</span>
						</button>
						<button
							type="button"
							class="bkw__tool-btn"
							@click="compareDuplicate(selectedKit)">
							<span>{{ t('duplicatefinder', 'Compare Side-by-Side') }}</span>
						</button>
					</div>
				</div>

				<div
					v-if="selectedKit.hasFoundryLicense"
					class="bkw__warn-banner"
					role="note">
					{{ t('duplicatefinder', 'Foundry / EULA protection active: licensed typeface copies are guarded against accidental purge. Switch Strategy to Hardlink / Reflink to deduplicate bytes while keeping local font folders intact.') }}
				</div>

				<div
					v-else-if="selectedKit.derivedExportCountTotal > 0"
					class="bkw__info-banner"
					role="note">
					{{ t('duplicatefinder', 'Master-vs-Export lineage detected: {count} sibling derived export(s) ({bytes}) sit alongside these masters. Canonical Brand Kit anchors remain protected.', {
						count: selectedKit.derivedExportCountTotal,
						bytes: selectedKit.formattedDerivedExportBytesTotal,
					}) }}
				</div>

				<div class="bkw__meta-grid">
					<div class="bkw__meta-item">
						<span class="bkw__meta-label">{{ t('duplicatefinder', 'Canonical Survivor') }}</span>
						<span class="bkw__mono-text">{{ selectedKit.survivor.normalizedPath }}</span>
					</div>
					<div class="bkw__meta-item">
						<span class="bkw__meta-label">{{ t('duplicatefinder', 'Asset Tier / Authority') }}</span>
						<span>{{ selectedKit.tierLabel }} ({{ selectedKit.survivor.context.authorityScore }}/100)</span>
					</div>
					<div class="bkw__meta-item">
						<span class="bkw__meta-label">{{ t('duplicatefinder', 'Total Kit Footprint') }}</span>
						<span>{{ selectedKit.formattedTotalBytes }}</span>
					</div>
					<div class="bkw__meta-item">
						<span class="bkw__meta-label">{{ t('duplicatefinder', 'Safe Reclaim / Derived Exports') }}</span>
						<span>{{ selectedKit.formattedReclaimableBytes }} / {{ selectedKit.formattedDerivedExportBytesTotal }}</span>
					</div>
				</div>

				<div class="bkw__override-bar">
					<span class="bkw__control-label">{{ t('duplicatefinder', 'Kit Override:') }}</span>
					<button
						type="button"
						class="bkw__seg-btn"
						:class="{ 'is-active': selectedKit.groupOverride === 'auto' }"
						@click="setGroupOverride(selectedKit.groupKey, 'auto')">
						<span>{{ t('duplicatefinder', 'Auto') }}</span>
					</button>
					<button
						type="button"
						class="bkw__seg-btn"
						:class="{ 'is-active': selectedKit.groupOverride === 'shield' }"
						@click="setGroupOverride(selectedKit.groupKey, 'shield')">
						<span>{{ t('duplicatefinder', 'Shield Kit') }}</span>
					</button>
					<button
						type="button"
						class="bkw__seg-btn"
						:class="{ 'is-active': selectedKit.groupOverride === 'exclude' }"
						@click="setGroupOverride(selectedKit.groupKey, 'exclude')">
						<span>{{ t('duplicatefinder', 'Exclude') }}</span>
					</button>
				</div>

				<div class="bkw__member-list">
					<div
						v-for="member in selectedKit.members"
						:key="member.selectionKey"
						class="bkw__member-card"
						:class="`is-verdict-${member.verdict}`">
						<div class="bkw__member-top">
							<span class="bkw__member-name">{{ member.fileName }}</span>
							<div class="bkw__member-badges">
								<span
									class="bkw__pill"
									:class="verdictPillClass(member.verdict)">
									{{ member.verdictLabel }}
								</span>
								<span
									class="bkw__pill"
									:class="authorityPillClass(member.context.authorityScore)">
									{{ t('duplicatefinder', 'Authority {score}/100', { score: member.context.authorityScore }) }}
								</span>
							</div>
						</div>

						<div class="bkw__member-path">
							{{ member.normalizedPath }}
						</div>

						<div class="bkw__member-meta">
							<span>{{ t('duplicatefinder', 'Size:') }} {{ member.formattedSize }}</span>
							<span>{{ t('duplicatefinder', 'Derived exports:') }} {{ member.context.derivedExportCount }} ({{ member.context.formattedDerivedExportBytes }})</span>
							<span>{{ t('duplicatefinder', 'Modified:') }} {{ member.formattedMtime || t('duplicatefinder', 'Unknown') }}</span>
						</div>

						<div
							v-if="member.context.licenseFiles.length > 0 || member.context.fontSiblings.length > 0 || member.context.derivedExports.length > 0"
							class="bkw__companion-chips">
							<span
								v-for="lic in member.context.licenseFiles"
								:key="`lic:${lic.normalizedPath}`"
								class="bkw__companion-chip is-license"
								:title="lic.normalizedPath">
								{{ t('duplicatefinder', 'License:') }} {{ lic.fileName }}
							</span>
							<span
								v-for="fnt in member.context.fontSiblings"
								:key="`fnt:${fnt.normalizedPath}`"
								class="bkw__companion-chip"
								:title="fnt.normalizedPath">
								{{ t('duplicatefinder', 'Font pair:') }} {{ fnt.fileName }}
							</span>
							<span
								v-for="exp in member.context.derivedExports"
								:key="`exp:${exp.normalizedPath}`"
								class="bkw__companion-chip"
								:title="exp.normalizedPath">
								{{ t('duplicatefinder', 'Export:') }} {{ exp.fileName }}
							</span>
						</div>

						<p class="bkw__member-note">
							{{ member.verdictReason }}
						</p>

						<div
							v-if="member.role !== 'survivor'"
							class="bkw__override-bar">
							<button
								type="button"
								class="bkw__seg-btn"
								:class="{ 'is-active': getCopyOverride(member.selectionKey) === 'auto' }"
								@click="setCopyOverride(member.selectionKey, 'auto')">
								<span>{{ t('duplicatefinder', 'Auto') }}</span>
							</button>
							<button
								type="button"
								class="bkw__seg-btn"
								:class="{ 'is-active': getCopyOverride(member.selectionKey) === 'pin-keeper' }"
								@click="setCopyOverride(member.selectionKey, 'pin-keeper')">
								<span>{{ t('duplicatefinder', 'Pin Keeper') }}</span>
							</button>
							<button
								type="button"
								class="bkw__seg-btn"
								:class="{ 'is-active': getCopyOverride(member.selectionKey) === 'force-reclaim' }"
								@click="setCopyOverride(member.selectionKey, 'force-reclaim')">
								<span>{{ t('duplicatefinder', 'Force Reclaim') }}</span>
							</button>
							<button
								type="button"
								class="bkw__seg-btn"
								:class="{ 'is-active': getCopyOverride(member.selectionKey) === 'shield' }"
								@click="setCopyOverride(member.selectionKey, 'shield')">
								<span>{{ t('duplicatefinder', 'Shield Copy') }}</span>
							</button>
						</div>
					</div>
				</div>

				<details class="bkw__script-box">
					<summary class="bkw__script-summary">
						{{ t('duplicatefinder', 'POSIX DRY_RUN=1 Brand Consolidation & occ files:scan Script') }}
					</summary>
					<div class="bkw__script-content">
						<div class="bkw__script-actions">
							<button
								type="button"
								class="bkw__tool-btn"
								@click="copyConsolidationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="bkw__code-pre"><code>{{ generatedScript }}</code></pre>
					</div>
				</details>
			</div>
		</div>
	</section>
</template>

<script>
import { copyTextSafely } from '../tools/clipboardHelper'
import {
	BRAND_FAMILY_META,
	BRAND_PRESETS,
	analyzeBrandKitAssets,
	buildBrandKitCsvReport,
	buildBrandKitJsonReport,
	buildBrandKitScript,
} from '../tools/brandKitAssetAuditor'

export default {
	name: 'BrandKitAuditorWorkbench',
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
			presetId: 'all-brand-kits',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'consolidate-purge',
			survivorRule: 'brand-master-first',
			protectFoundryLicenses: true,
			protectBrandCanonical: true,
			protectDerivedLineage: true,
			minSizeMbInput: '0',
			searchQueryInput: '',
			dataRootInput: '/var/www/nextcloud/data',
			sortMode: 'reclaim_desc',
			selectedKitKey: '',
			visibleLimit: 25,
			groupOverrides: {},
			copyOverrides: {},
			statusNotice: '',
			statusNoticeType: 'success',
		}
	},
	computed: {
		presets() {
			return BRAND_PRESETS
		},
		familyOptions() {
			return Object.values(BRAND_FAMILY_META)
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable / Hardlinkable') },
				{ id: 'license-guarded', label: this.t('duplicatefinder', 'Foundry License Guard') },
				{ id: 'export-collateral-risk', label: this.t('duplicatefinder', 'Derived Export Lineage') },
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
		parsedMinSizeMb() {
			const trimmed = String(this.minSizeMbInput ?? '').trim()
			if (!trimmed) {
				return 0
			}
			const parsed = Number(trimmed)
			return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
		},
		analysis() {
			return analyzeBrandKitAssets(this.activePool, {
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectFoundryLicenses: this.protectFoundryLicenses,
				protectBrandCanonical: this.protectBrandCanonical,
				protectDerivedLineage: this.protectDerivedLineage,
				minSizeMb: this.parsedMinSizeMb,
				searchQuery: this.searchQueryInput,
				groupOverrides: this.groupOverrides,
				copyOverrides: this.copyOverrides,
			})
		},
		totalFamilyMatches() {
			const counts = this.analysis.summary.familyCounts || {}
			return Object.values(counts).reduce((sum, val) => sum + Number(val || 0), 0)
		},
		visibleKits() {
			return this.analysis.kits.slice(0, this.visibleLimit)
		},
		selectedKit() {
			const kits = this.analysis.kits
			if (!kits.length) {
				return null
			}
			if (this.selectedKitKey) {
				const found = kits.find(k => k.groupKey === this.selectedKitKey)
				if (found) {
					return found
				}
			}
			if (this.currentDuplicateId !== null && this.currentDuplicateId !== undefined) {
				const byCurrent = kits.find(k => k.primaryGroupId === this.currentDuplicateId)
				if (byCurrent) {
					return byCurrent
				}
			}
			return kits[0]
		},
		generatedScript() {
			return buildBrandKitScript(this.analysis, {
				dataRoot: this.dataRootInput,
			})
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
			const preset = BRAND_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectFoundryLicenses = preset.protectFoundryLicenses
			this.protectBrandCanonical = preset.protectBrandCanonical
			this.protectDerivedLineage = preset.protectDerivedLineage
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
		getCopyOverride(selectionKey) {
			return this.copyOverrides[selectionKey] || 'auto'
		},
		setGroupOverride(groupKey, value) {
			this.selectedKitKey = groupKey
			this.$set(this.groupOverrides, groupKey, value)
		},
		setCopyOverride(selectionKey, value) {
			if (this.selectedKit && !this.selectedKitKey) {
				this.selectedKitKey = this.selectedKit.groupKey
			}
			this.$set(this.copyOverrides, selectionKey, value)
		},
		formatKitRiskLabel(riskState) {
			const map = {
				reclaimable: this.t('duplicatefinder', 'Consolidatable'),
				'license-guarded': this.t('duplicatefinder', 'Foundry Guarded'),
				'export-collateral-risk': this.t('duplicatefinder', 'Export Lineage'),
				shielded: this.t('duplicatefinder', 'Shielded'),
			}
			return map[riskState] || riskState
		},
		verdictPillClass(verdict) {
			if (verdict === 'keep-canonical-master') {
				return 'is-keep'
			}
			if (verdict === 'blocked-foundry-license' || verdict === 'blocked-brand-canonical') {
				return 'is-danger'
			}
			if (verdict === 'blocked-lineage-anchor' || verdict === 'blocked-manual-shield' || verdict === 'excluded') {
				return 'is-warn'
			}
			if (verdict === 'hardlink-master-candidate') {
				return 'is-hardlink'
			}
			return 'is-reclaim'
		},
		authorityPillClass(score) {
			if (score >= 75) {
				return 'is-keep'
			}
			if (score >= 45) {
				return 'is-hardlink'
			}
			return 'is-warn'
		},
		findSourceDuplicate(kit) {
			if (!kit) {
				return null
			}
			return this.activePool.find(g => g && g.id === kit.primaryGroupId)
				|| this.activePool.find(g => g && g.hash && g.hash === kit.hash)
				|| null
		},
		jumpToDuplicate(kit) {
			const target = this.findSourceDuplicate(kit)
			if (target) {
				this.$emit('select-duplicate', target)
			}
		},
		compareDuplicate(kit) {
			const target = this.findSourceDuplicate(kit)
			if (target) {
				this.$emit('compare-duplicate', target)
			}
		},
		async copyConsolidationScript() {
			const ok = await copyTextSafely(this.generatedScript)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 brand kit consolidation script to clipboard.'))
			} else {
				this.setNotice(this.t('duplicatefinder', 'Unable to copy script to clipboard.'), 'error')
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
			const csv = buildBrandKitCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-brand-kit-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe brand kit CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildBrandKitJsonReport(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-brand-kit-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported brand kit JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.brand-kit-workbench {
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

.bkw__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
}

.bkw__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.bkw__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.bkw__status-badge {
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

.bkw__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.bkw__tool-btn,
.bkw__seg-btn,
.bkw__chip,
.bkw__primary-btn {
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

.bkw__primary-btn {
	background-color: var(--color-primary-element, #0082c9);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-text, #ffffff);
}

.bkw__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.bkw__tool-btn.is-primary-outline {
	border-color: var(--color-primary-element, #0082c9);
}

.bkw__seg-btn.is-active,
.bkw__chip.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.bkw__tool-btn:focus-visible,
.bkw__seg-btn:focus-visible,
.bkw__chip:focus-visible,
.bkw__primary-btn:focus-visible,
.bkw__kit-item:focus-visible,
.bkw__input:focus-visible,
.bkw__script-summary:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.bkw__notice {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	font-size: 0.86rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.bkw__notice.is-success {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.bkw__notice.is-error {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.bkw__empty-banner {
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

.bkw__empty-text {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
	max-inline-size: 68ch;
}

.bkw__empty-title {
	margin: 0;
	font-weight: 700;
	font-size: 0.94rem;
}

.bkw__empty-hint {
	margin: 0;
	font-size: 0.85rem;
	color: var(--color-text-maxcontrast);
	line-height: 1.45;
}

.bkw__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
}

.bkw__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.bkw__control-label {
	font-size: 0.82rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.bkw__segments,
.bkw__chip-group,
.bkw__filters-strip {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.bkw__filters-strip {
	flex-direction: column;
	gap: 8px;
}

.bkw__inputs-row {
	align-items: flex-end;
}

.bkw__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.bkw__field-grow {
	flex: 1 1 200px;
}

.bkw__field-label {
	font-size: 0.78rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.bkw__input {
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

.bkw__num-input {
	inline-size: 115px;
}

.bkw__kpis {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 10px;
}

@media (min-width: 560px) {
	.bkw__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (min-width: 980px) {
	.bkw__kpis {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
}

.bkw__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.bkw__kpi-label {
	font-size: 0.76rem;
	font-weight: 700;
	text-transform: uppercase;
	color: var(--color-text-maxcontrast);
}

.bkw__kpi-val {
	font-size: 1.02rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.bkw__kpi-val.is-accent {
	color: #0b4a8b;
}

.bkw__kpi-val.is-warn {
	color: #7c4a03;
}

.bkw__workstation {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 14px;
}

@media (min-width: 1080px) {
	.bkw__workstation {
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr);
		align-items: start;
	}
}

.bkw__list-pane,
.bkw__inspector-pane {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.bkw__pane-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.bkw__pane-title {
	font-size: 0.88rem;
	font-weight: 700;
}

.bkw__kit-list,
.bkw__member-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.bkw__kit-item {
	display: flex;
	flex-direction: column;
	align-items: stretch;
	gap: 4px;
	padding: 10px 12px;
	min-block-size: 44px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	text-align: start;
	cursor: pointer;
	min-inline-size: 0;
}

.bkw__kit-item.is-selected {
	border-color: var(--color-primary-element, #0082c9);
	background-color: var(--color-primary-element-light);
}

.bkw__kit-top,
.bkw__member-top {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.bkw__kit-name,
.bkw__member-name {
	font-weight: 700;
	font-size: 0.9rem;
	overflow-wrap: anywhere;
}

.bkw__kit-path,
.bkw__member-path {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.bkw__kit-meta,
.bkw__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.bkw__pill {
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: 999px;
	font-size: 0.72rem;
	font-weight: 700;
	border: 1px solid var(--color-border);
}

.bkw__pill.is-risk-license-guarded,
.bkw__pill.is-danger {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.bkw__pill.is-risk-export-collateral-risk,
.bkw__pill.is-risk-shielded,
.bkw__pill.is-warn {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.bkw__pill.is-hardlink {
	background-color: #e8f1fb;
	color: #0b4a8b;
	border-color: #9ec5fe;
}

.bkw__pill.is-risk-reclaimable,
.bkw__pill.is-reclaim,
.bkw__pill.is-keep {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.bkw__inspector-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.bkw__inspector-title-wrap {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-inline-size: 0;
}

.bkw__inspector-title {
	margin: 0;
	font-size: 0.98rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.bkw__inspector-sub {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.bkw__inspector-actions,
.bkw__override-bar,
.bkw__member-badges,
.bkw__companion-chips {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.bkw__companion-chip {
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

.bkw__companion-chip.is-license {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.bkw__warn-banner {
	padding: 10px 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #f5c97b;
	background-color: #fff4e5;
	color: #7c4a03;
	font-size: 0.83rem;
	line-height: 1.45;
}

.bkw__info-banner {
	padding: 10px 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #9ec5fe;
	background-color: #e8f1fb;
	color: #0b4a8b;
	font-size: 0.83rem;
	line-height: 1.45;
}

.bkw__meta-grid {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 8px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
}

@media (min-width: 640px) {
	.bkw__meta-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

.bkw__meta-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	font-size: 0.84rem;
	min-inline-size: 0;
	overflow-wrap: anywhere;
}

.bkw__meta-label {
	font-size: 0.74rem;
	font-weight: 700;
	text-transform: uppercase;
	color: var(--color-text-maxcontrast);
}

.bkw__mono-text {
	font-family: monospace;
	font-size: 0.8rem;
	overflow-wrap: anywhere;
}

.bkw__member-card {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.bkw__member-card.is-verdict-keep-canonical-master,
.bkw__member-card.is-verdict-reclaim-duplicate-copy {
	border-inline-start: 4px solid #0f5132;
}

.bkw__member-card.is-verdict-hardlink-master-candidate {
	border-inline-start: 4px solid #0b4a8b;
}

.bkw__member-card.is-verdict-blocked-foundry-license,
.bkw__member-card.is-verdict-blocked-brand-canonical {
	border-inline-start: 4px solid #842029;
}

.bkw__member-card.is-verdict-blocked-lineage-anchor,
.bkw__member-card.is-verdict-blocked-manual-shield,
.bkw__member-card.is-verdict-excluded {
	border-inline-start: 4px solid #7c4a03;
}

.bkw__member-note {
	margin: 0;
	font-size: 0.82rem;
	color: var(--color-text-maxcontrast);
	max-inline-size: 68ch;
}

.bkw__script-box {
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	padding: 8px 12px;
	background-color: var(--color-main-background);
}

.bkw__script-summary {
	display: flex;
	align-items: center;
	min-block-size: 44px;
	font-weight: 700;
	font-size: 0.86rem;
	cursor: pointer;
}

.bkw__script-content {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding-block-start: 8px;
}

.bkw__script-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.bkw__code-pre {
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

.bkw__load-more-wrap {
	display: flex;
	justify-content: center;
	padding-block: 6px;
}
</style>
