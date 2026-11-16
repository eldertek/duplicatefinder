<template>
	<NcContent app-name="duplicatefinder">
		<div v-if="isLoading" class="app-loading-container">
			<NcLoadingIcon :size="44" />
		</div>
		<template v-else>
			<div class="app-navigation-header">
				<DuplicateNavigation
					ref="duplicateNavigation"
					:acknowledged-duplicates="acknowledgedDuplicates"
					:unacknowledged-duplicates="unacknowledgedDuplicates"
					:currentDuplicateId="currentDuplicate?.id"
					:acknowledgedPagination="acknowledgedPagination"
					:unacknowledgedPagination="unacknowledgedPagination"
					:activeView="activeView"
					:activeProject="activeProject"
					:projects="projects"
					:initial-sort-option="sortOption"
					:initial-min-size-bytes="minSizeBytes"
					:has-duplicates="hasDuplicates"
					:pagination-reset-token="paginationResetToken"
					@open-duplicate="openDuplicate"
					@open-settings="settingsOpen = true"
					@open-projects="settingsOpen = true"
					@view-project="viewProject"
					@show-help="showHelp"
					@query-options-changed="handleQueryOptionsChanged"
					@load-more-start="onLoadMoreStart"
					@update-acknowledged-duplicates="updateAcknowledgedDuplicates"
					@update-unacknowledged-duplicates="updateUnacknowledgedDuplicates" />
			</div>

			<NcAppContent>
				<div
					v-if="activeView === 'details' || activeView === 'bulk-delete'"
					class="app-content-topbar">
					<div
						class="topbar-summary"
						:class="{ 'has-count-tooltip': activeView !== 'bulk-delete' }">
						<h2
							class="topbar-title"
							:title="activeView !== 'bulk-delete' ? duplicateCountTooltipText : null"
							:data-tooltip="activeView !== 'bulk-delete' ? duplicateCountTooltipText : null">
							{{ activeView === 'bulk-delete'
								? t('duplicatefinder', 'Bulk Delete')
								: (totalDuplicateCount > 0
									? t('duplicatefinder', 'Duplicates ({count})', { count: totalDuplicateCount })
									: t('duplicatefinder', 'Duplicates')) }}
						</h2>
						<span
							v-if="activeView !== 'bulk-delete'"
							class="topbar-count-help"
							tabindex="0"
							role="button"
							:title="duplicateCountTooltipText"
							:aria-label="duplicateCountTooltipText">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="15"
								height="15"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true">
								<circle cx="12" cy="12" r="10"></circle>
								<line x1="12" y1="16" x2="12" y2="12"></line>
								<line x1="12" y1="8" x2="12.01" y2="8"></line>
							</svg>
						</span>
						<div
							v-if="activeView !== 'bulk-delete'"
							class="topbar-count-tooltip"
							role="tooltip">
							<div class="topbar-count-tooltip__title">
								{{ t('duplicatefinder', 'Active duplicate groups in current scan ({total})', { total: totalDuplicateCount }) }}
							</div>
							<ul class="topbar-count-tooltip__list">
								<li>{{ t('duplicatefinder', 'Unacknowledged groups ({count})', { count: unacknowledgedDuplicateCount }) }}</li>
								<li>{{ t('duplicatefinder', 'Acknowledged groups ({count})', { count: acknowledgedDuplicateCount }) }}</li>
								<li>{{ t('duplicatefinder', 'Excluded folders and ignored files are not counted.') }}</li>
								<li>{{ t('duplicatefinder', 'Reflects active scan results matching your current size filter.') }}</li>
							</ul>
						</div>
					</div>
					<div class="topbar-actions">
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-scan-button"
							:disabled="isScanRunning"
							:title="t('duplicatefinder', 'Scan storage for duplicate files')"
							@click="triggerScan">
							<svg
								class="topbar-scan-icon"
								:class="{ 'is-spinning': isScanRunning }"
								xmlns="http://www.w3.org/2000/svg"
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true">
								<path d="M21 12a9 9 0 1 1-2.64-6.36"></path>
								<polyline points="21 3 21 9 15 9"></polyline>
							</svg>
							<span>{{ isScanRunning ? t('duplicatefinder', 'Scanning...') : t('duplicatefinder', 'Scan') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-empty-folders-button"
							:title="t('duplicatefinder', 'Detect and delete empty folders after cleanup')"
							@click="openEmptyFoldersModal">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true">
								<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
								<line x1="9" y1="14" x2="15" y2="14"></line>
							</svg>
							<span>{{ t('duplicatefinder', 'Empty Folders') }}</span>
						</button>
						<button
							v-if="activeView !== 'bulk-delete'"
							type="button"
							class="topbar-bulk-delete-button"
							:disabled="!hasDuplicates"
							:title="hasDuplicates
								? t('duplicatefinder', 'Preview and delete multiple duplicates at once')
								: t('duplicatefinder', 'No duplicates available for bulk deletion')"
							@click="openBulkDelete">
							<Delete :size="18" />
							<span>{{ t('duplicatefinder', 'Bulk Delete') }}</span>
						</button>
						<NcButton
							v-else-if="activeView === 'bulk-delete'"
							type="secondary"
							class="topbar-back-button"
							@click="closeBulkDelete">
							{{ t('duplicatefinder', 'Back to duplicates') }}
						</NcButton>
					</div>
				</div>

				<div
					v-if="isScanRunning"
					class="scan-progress-banner"
					role="status"
					aria-live="polite">
					<div class="scan-progress-header">
						<div class="scan-progress-info">
							<span class="scan-progress-title">{{ t('duplicatefinder', 'Scanning for duplicates...') }}</span>
							<span
								v-if="!scanStatus.indeterminate && scanStatus.totalFiles > 0"
								class="scan-progress-counts">
								{{ t('duplicatefinder', '{scanned} / {total} files ({percent}%)', {
									scanned: scanStatus.scannedFiles,
									total: scanStatus.totalFiles,
									percent: scanStatus.percentage,
								}) }}
							</span>
							<span
								v-else-if="scanStatus.scannedFiles > 0"
								class="scan-progress-counts">
								{{ t('duplicatefinder', '{scanned} files scanned', { scanned: scanStatus.scannedFiles }) }}
							</span>
						</div>
						<span v-if="formattedEta" class="scan-progress-eta">
							{{ t('duplicatefinder', 'Estimated remaining {eta}', { eta: formattedEta }) }}
						</span>
					</div>
					<div
						class="scan-progress-track"
						role="progressbar"
						:aria-valuenow="scanStatus.indeterminate ? null : scanStatus.percentage"
						aria-valuemin="0"
						aria-valuemax="100">
						<div
							class="scan-progress-fill"
							:class="{ 'is-indeterminate': scanStatus.indeterminate || scanStatus.totalFiles === 0 }"
							:style="(scanStatus.indeterminate || scanStatus.totalFiles === 0) ? {} : { width: `${scanStatus.percentage}%` }" />
					</div>
				</div>

				<template v-if="activeView === 'bulk-delete'">
					<BulkDeletionSettings
						@duplicates-deleted="refreshDuplicates"
						@folders-touched="recordTouchedFolders" />
				</template>
				<template v-else-if="activeView === 'project'">
					<ProjectDuplicates
						:projectId="activeProject"
						@back-to-projects="backToProjects"
						@view-duplicate="viewProjectDuplicate" />
				</template>
				<template v-else-if="activeView === 'project-duplicate'">
					<DuplicateDetails
						ref="projectDuplicateDetails"
						:duplicate="projectDuplicate"
						@duplicate-resolved="backToProject"
						@duplicateUpdated="updateDuplicate"
						@openSettings="settingsOpen = true"
						@folders-touched="recordTouchedFolders"
						@duplicatesSearchCompleted="backToProject" />
				</template>
				<template v-else>
					<DuplicateDetails
						ref="duplicateDetails"
						:duplicate="currentDuplicate"
						:is-scanning="isScanRunning"
						@duplicate-resolved="handleDuplicateResolved"
						@duplicateUpdated="updateDuplicate"
						@openSettings="settingsOpen = true"
						@startScan="triggerScan"
						@folders-touched="recordTouchedFolders"
						@duplicatesSearchCompleted="refreshDuplicates" />
				</template>
			</NcAppContent>

			<NcAppSettingsDialog
				:open.sync="settingsOpen"
				:show-navigation="true"
				:name="t('duplicatefinder', 'Duplicate Finder Settings')">
				<NcAppSettingsSection
					id="filters"
					:name="t('duplicatefinder', 'Filters')">
					<template #icon>
						<FilterOutline :size="20" />
					</template>
					<FilterSettings @filters-changed="refreshDuplicates" />
				</NcAppSettingsSection>

				<NcAppSettingsSection
					id="origin-folders"
					:name="t('duplicatefinder', 'Origin Folders')">
					<template #icon>
						<Folder :size="20" />
					</template>
					<OriginFoldersSettings @origin-folders-changed="refreshDuplicates" />
				</NcAppSettingsSection>

				<NcAppSettingsSection
					id="excluded-folders"
					:name="t('duplicatefinder', 'Excluded Folders')">
					<template #icon>
						<FolderRemove :size="20" />
					</template>
					<ExcludedFoldersSettings @excluded-folders-changed="refreshDuplicates" />
				</NcAppSettingsSection>

				<NcAppSettingsSection
					id="projects"
					:name="t('duplicatefinder', 'Projects')">
					<template #icon>
						<FolderMultiple :size="20" />
					</template>
					<ProjectsSettings @view-project="viewProject" />
				</NcAppSettingsSection>
			</NcAppSettingsDialog>

			<NcModal
				v-if="helpModalOpen"
				:title="helpModalTitle"
				@close="helpModalOpen = false">
				<div class="help-content">
					<OnboardingGuide v-if="currentHelpSection === 'guide'" :show="true" @close="helpModalOpen = false" />
					<UsageExamples v-if="currentHelpSection === 'examples'" :show="true" @close="helpModalOpen = false" />
					<FAQ v-if="currentHelpSection === 'faq'" :show="true" @close="helpModalOpen = false" />
				</div>
			</NcModal>

			<NcModal
				v-if="emptyFoldersModalOpen"
				:title="t('duplicatefinder', 'Empty Folders Cleanup')"
				@close="emptyFoldersModalOpen = false">
				<div class="empty-folders-modal">
					<p class="empty-folders-modal__hint">
						{{ t('duplicatefinder', 'Detect folders left empty after removing duplicates and optionally delete them in one go. Protected origin folders, excluded folders, and external mounts are never deleted.') }}
					</p>
					<div class="empty-folders-modal__toolbar">
						<NcButton
							v-if="recentCleanedPaths.length > 0"
							type="secondary"
							:disabled="emptyFoldersLoading || emptyFoldersDeleting"
							@click="scanEmptyFoldersInModal(true)">
							{{ t('duplicatefinder', 'Check cleaned locations') }}
						</NcButton>
						<NcButton
							type="secondary"
							:disabled="emptyFoldersLoading || emptyFoldersDeleting"
							@click="scanEmptyFoldersInModal(false)">
							{{ t('duplicatefinder', 'Scan all folders') }}
						</NcButton>
						<NcButton
							v-if="modalEmptyFolders.length > 0"
							type="tertiary"
							:disabled="emptyFoldersLoading || emptyFoldersDeleting"
							@click="toggleSelectAllModalEmptyFolders">
							{{ isAllModalEmptyFoldersSelected ? t('duplicatefinder', 'Unselect all') : t('duplicatefinder', 'Select all') }}
						</NcButton>
						<NcButton
							v-if="modalEmptyFolders.length > 0"
							type="error"
							class="modal-delete-empty-folders-button"
							:disabled="emptyFoldersLoading || emptyFoldersDeleting || selectedModalEmptyFolders.length === 0"
							@click="deleteSelectedModalEmptyFolders">
							{{ t('duplicatefinder', 'Delete selected ({count})', { count: selectedModalEmptyFolders.length }) }}
						</NcButton>
					</div>

					<div v-if="emptyFoldersLoading" class="empty-folders-modal__status">
						<NcLoadingIcon :size="24" />
						<span>{{ t('duplicatefinder', 'Scanning for empty folders...') }}</span>
					</div>
					<div v-else-if="modalEmptyFoldersScanned && modalEmptyFolders.length === 0" class="empty-folders-modal__status">
						<span>{{ t('duplicatefinder', 'No empty folders were found.') }}</span>
					</div>
					<div v-else-if="modalEmptyFolders.length > 0" class="empty-folders-modal__list">
						<label
							v-for="folder in modalEmptyFolders"
							:key="folder.path"
							class="empty-folders-modal__item">
							<input
								type="checkbox"
								:checked="selectedModalEmptyFolders.includes(folder.path)"
								@change="toggleModalEmptyFolder(folder.path)">
							<span class="empty-folders-modal__path">{{ folder.path }}</span>
							<span v-if="folder.hasEmptySubfolders" class="empty-folders-modal__badge">
								{{ t('duplicatefinder', 'Includes empty subfolders') }}
							</span>
						</label>
					</div>
				</div>
			</NcModal>
		</template>
	</NcContent>
</template>


<script>
import { NcAppContent, NcContent, NcLoadingIcon, NcAppSettingsDialog, NcAppSettingsSection, NcButton, NcModal } from '@nextcloud/vue';
import DuplicateNavigation from './components/DuplicateNavigation.vue';
import DuplicateDetails from './components/DuplicateDetails.vue';
import OriginFoldersSettings from './components/OriginFoldersSettings.vue';
import ExcludedFoldersSettings from './components/ExcludedFoldersSettings.vue';
import BulkDeletionSettings from './components/BulkDeletionSettings.vue';
import ProjectsSettings from './components/ProjectsSettings.vue';
import ProjectDuplicates from './components/ProjectDuplicates.vue';
import OnboardingGuide from './components/help/OnboardingGuide.vue';
import UsageExamples from './components/help/UsageExamples.vue';
import FAQ from './components/help/FAQ.vue';
import * as api from '@/tools/api';
const {
	fetchDuplicates,
	fetchProjects,
	fetchScanStatus,
	startUserScan,
	notifyScanStarted,
	notifyScanCompleted,
	notifyScanFailed,
} = api;
import {
	removeDuplicateFromList,
	loadUiPreferences,
	saveUiPreferences,
	formatScanEta,
} from '@/tools/utils';
import Folder from 'vue-material-design-icons/Folder';
import FolderRemove from 'vue-material-design-icons/FolderRemove';
import FolderMultiple from 'vue-material-design-icons/FolderMultiple';
import Delete from 'vue-material-design-icons/Delete';
import FilterOutline from 'vue-material-design-icons/FilterOutline';
import SearchBar from './components/SearchBar.vue'
import FilterSettings from './components/FilterSettings.vue';

export default {
	name: 'DuplicateFinder',
	components: {
		NcAppContent,
		NcContent,
		NcLoadingIcon,
		NcButton,
		NcModal,
		DuplicateNavigation,
		DuplicateDetails,
		OriginFoldersSettings,
		ExcludedFoldersSettings,
		BulkDeletionSettings,
		ProjectsSettings,
		ProjectDuplicates,
		NcAppSettingsDialog,
		NcAppSettingsSection,
		Folder,
		FolderRemove,
		FolderMultiple,
		Delete,
		FilterOutline,
		OnboardingGuide,
		UsageExamples,
		FAQ,
		SearchBar,
		FilterSettings
	},
	data() {
		const savedPreferences = loadUiPreferences();
		return {
			acknowledgedDuplicates: [],
			unacknowledgedDuplicates: [],
			currentDuplicate: null,
			isLoading: false,
			page: 1,
			limit: 50,
			sortOption: savedPreferences.sortOption,
			minSizeBytes: savedPreferences.minSizeBytes,
			settingsOpen: false,
			activeView: 'details',
			acknowledgedPagination: {
				currentPage: 1,
				totalPages: 1
			},
			unacknowledgedPagination: {
				currentPage: 1,
				totalPages: 1
			},
			paginationResetToken: 0,
			pendingOffsetDelta: {
				acknowledged: 0,
				unacknowledged: 0,
			},
			helpModalOpen: false,
			currentHelpSection: 'guide',
			emptyFoldersModalOpen: false,
			emptyFoldersLoading: false,
			emptyFoldersDeleting: false,
			modalEmptyFoldersScanned: false,
			modalEmptyFolders: [],
			selectedModalEmptyFolders: [],
			recentCleanedPaths: [],
			activeProject: null,
			projectDuplicate: null,
			projects: [],
			scanStatus: {
				running: false,
				indeterminate: false,
				scannedFiles: 0,
				totalFiles: 0,
				percentage: 0,
				startedAt: null,
				updatedAt: null,
				completedAt: null,
				completedSeq: 0,
				etaSeconds: null,
			},
			lastCompletedSeq: 0,
			wasTrackingActiveScan: false,
			scanPollTimer: null,
			visibilityHandler: null,
		};
	},
	computed: {
		hasDuplicates() {
			return this.acknowledgedDuplicates.length > 0 || this.unacknowledgedDuplicates.length > 0
		},
		isAllModalEmptyFoldersSelected() {
			return this.modalEmptyFolders.length > 0
				&& this.selectedModalEmptyFolders.length === this.modalEmptyFolders.length
		},
		isScanRunning() {
			return Boolean(this.scanStatus && this.scanStatus.running)
		},
		formattedEta() {
			return this.isScanRunning ? formatScanEta(this.scanStatus.etaSeconds) : ''
		},
		unacknowledgedDuplicateCount() {
			if (this.unacknowledgedPagination && this.unacknowledgedPagination.hasMore === false) {
				return this.unacknowledgedDuplicates.length
			}
			return Number.isFinite(this.unacknowledgedPagination?.totalItems)
				? this.unacknowledgedPagination.totalItems
				: this.unacknowledgedDuplicates.length
		},
		acknowledgedDuplicateCount() {
			if (this.acknowledgedPagination && this.acknowledgedPagination.hasMore === false) {
				return this.acknowledgedDuplicates.length
			}
			return Number.isFinite(this.acknowledgedPagination?.totalItems)
				? this.acknowledgedPagination.totalItems
				: this.acknowledgedDuplicates.length
		},
		totalDuplicateCount() {
			return this.unacknowledgedDuplicateCount + this.acknowledgedDuplicateCount
		},
		duplicateCountTooltipText() {
			return t(
				'duplicatefinder',
				'Active duplicate groups in current scan ({total} total, {unacknowledged} unacknowledged, {acknowledged} acknowledged). Excluded folders and ignored files are not counted.',
				{
					total: this.totalDuplicateCount,
					unacknowledged: this.unacknowledgedDuplicateCount,
					acknowledged: this.acknowledgedDuplicateCount,
				}
			)
		},
		helpModalTitle() {
			const titles = {
				guide: t('duplicatefinder', 'Getting Started'),
				examples: t('duplicatefinder', 'Usage Examples'),
				faq: t('duplicatefinder', 'FAQ')
			}
			return titles[this.currentHelpSection] || t('duplicatefinder', 'Help')
		},
		currentHelpComponent() {
			const components = {
				guide: OnboardingGuide,
				examples: UsageExamples,
				faq: FAQ
			}
			return components[this.currentHelpSection]
		}
	},
	async created() {
		this.visibilityHandler = () => {
			if (
				typeof document !== 'undefined'
				&& document.visibilityState === 'visible'
				&& (this.wasTrackingActiveScan || this.isScanRunning)
			) {
				this.pollScanStatus()
			}
		}
		if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
			document.addEventListener('visibilitychange', this.visibilityHandler)
		}
		await this.loadInitialData()
	},
	beforeDestroy() {
		this.clearScanPollTimer()
		if (this.visibilityHandler && typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
			document.removeEventListener('visibilitychange', this.visibilityHandler)
			this.visibilityHandler = null
		}
	},
	methods: {
		onLoadMoreStart(section) {
			if (section === 'acknowledged' || section === 'unacknowledged') {
				this.pendingOffsetDelta[section] = 0
			}
		},
		adjustSectionPagination(section, delta) {
			if (!delta || (section !== 'acknowledged' && section !== 'unacknowledged')) {
				return
			}
			this.pendingOffsetDelta[section] = (this.pendingOffsetDelta[section] || 0) + delta
			const paginationKey = section === 'acknowledged' ? 'acknowledgedPagination' : 'unacknowledgedPagination'
			const current = this[paginationKey] || {}
			const updated = { ...current }
			if (Number.isFinite(updated.totalItems)) {
				updated.totalItems = Math.max(0, updated.totalItems + delta)
				const limit = Number(updated.limit) > 0 ? Number(updated.limit) : this.limit
				updated.totalPages = Math.max(1, Math.ceil(updated.totalItems / limit))
			}
			if (Number.isInteger(updated.nextOffset)) {
				updated.nextOffset = Math.max(0, updated.nextOffset + delta)
			}
			if (typeof updated.hasMore === 'boolean' && Number.isFinite(updated.totalItems) && Number.isInteger(updated.nextOffset)) {
				updated.hasMore = updated.hasMore && updated.nextOffset < updated.totalItems
			}
			this[paginationKey] = updated
		},
		handleDuplicateResolved({ duplicate, type }) {
			console.log('ISSUE146: App.handleDuplicateResolved called');
			console.log('ISSUE146: duplicate.id =', duplicate.id);
			console.log('ISSUE146: duplicate.hash =', duplicate.hash);
			console.log('ISSUE146: type =', type);

			// Remove from the appropriate list
			if (type === 'acknowledged') {
				console.log('ISSUE146: Removing from acknowledged list');
				const beforeLen = this.acknowledgedDuplicates.length;
				console.log('ISSUE146: acknowledged list length before =', beforeLen);
				this.acknowledgedDuplicates = this.acknowledgedDuplicates.filter(d => d.hash !== duplicate.hash);
				const removed = beforeLen - this.acknowledgedDuplicates.length;
				if (removed > 0) {
					this.adjustSectionPagination('acknowledged', -removed);
				}
				console.log('ISSUE146: acknowledged list length after =', this.acknowledgedDuplicates.length);
			} else {
				console.log('ISSUE146: Removing from unacknowledged list');
				const beforeLen = this.unacknowledgedDuplicates.length;
				console.log('ISSUE146: unacknowledged list length before =', beforeLen);
				this.unacknowledgedDuplicates = this.unacknowledgedDuplicates.filter(d => d.hash !== duplicate.hash);
				const removed = beforeLen - this.unacknowledgedDuplicates.length;
				if (removed > 0) {
					this.adjustSectionPagination('unacknowledged', -removed);
				}
				console.log('ISSUE146: unacknowledged list length after =', this.unacknowledgedDuplicates.length);
			}

			// Trigger DuplicateNavigation to find and select the next duplicate
			// This will respect the current sort order
			if (this.$refs.duplicateNavigation) {
				console.log('ISSUE146: Calling selectNextDuplicateAfterResolution on DuplicateNavigation');
				this.$refs.duplicateNavigation.selectNextDuplicateAfterResolution(duplicate, type);
			} else {
				console.log('ISSUE146: ERROR - duplicateNavigation ref not found!');
			}

			console.log('ISSUE146: currentDuplicate after resolution =', this.currentDuplicate ? this.currentDuplicate.id : 'null');
		},
		async removeDuplicate(duplicate) {
			console.log('App: removeDuplicate called with:', duplicate);
			// Get the updated lists after removing the duplicate
			const { acknowledgedDuplicates: newAcknowledged, unacknowledgedDuplicates: newUnacknowledged } =
				removeDuplicateFromList(duplicate, this.acknowledgedDuplicates, this.unacknowledgedDuplicates);

			console.log('App: Got updated lists:', {
				acknowledgedCount: newAcknowledged.length,
				unacknowledgedCount: newUnacknowledged.length
			});

			// Update both lists
			this.acknowledgedDuplicates = newAcknowledged;
			this.unacknowledgedDuplicates = newUnacknowledged;

			// If no duplicates left in either list, clear current duplicate
			if (newAcknowledged.length === 0 && newUnacknowledged.length === 0) {
				console.log('App: No duplicates left, clearing current duplicate');
				this.currentDuplicate = null;
				return;
			}

			// Find next duplicate to display based on the acknowledged status
			if (duplicate.acknowledged) {
				console.log('App: Setting next duplicate from acknowledged list');
				this.currentDuplicate = newAcknowledged[0] || newUnacknowledged[0] || null;
			} else {
				console.log('App: Setting next duplicate from unacknowledged list');
				this.currentDuplicate = newUnacknowledged[0] || newAcknowledged[0] || null;
			}

			console.log('App: New current duplicate:', this.currentDuplicate);

			// Refresh duplicates to ensure UI is up to date
			console.log('App: Refreshing duplicates');
			await this.refreshDuplicates();
			console.log('App: Refresh complete');
		},
		async updateDuplicate(updatedDuplicate) {
			// Check if the duplicate still has more than one file
			if (updatedDuplicate.files.length <= 1) {
				const prevAckLen = this.acknowledgedDuplicates.length;
				const prevUnackLen = this.unacknowledgedDuplicates.length;
				// Remove from both lists
				this.acknowledgedDuplicates = this.acknowledgedDuplicates.filter(d => d.id !== updatedDuplicate.id);
				this.unacknowledgedDuplicates = this.unacknowledgedDuplicates.filter(d => d.id !== updatedDuplicate.id);
				if (prevAckLen !== this.acknowledgedDuplicates.length) {
					this.adjustSectionPagination('acknowledged', this.acknowledgedDuplicates.length - prevAckLen);
				}
				if (prevUnackLen !== this.unacknowledgedDuplicates.length) {
					this.adjustSectionPagination('unacknowledged', this.unacknowledgedDuplicates.length - prevUnackLen);
				}
				this.currentDuplicate = null;
			} else {
				// Existing logic to update the duplicate
				const sourceSection = !updatedDuplicate.acknowledged ? 'acknowledged' : 'unacknowledged';
				const targetSection = !updatedDuplicate.acknowledged ? 'unacknowledged' : 'acknowledged';
				const sourceList = !updatedDuplicate.acknowledged ? this.acknowledgedDuplicates : this.unacknowledgedDuplicates;
				const targetList = !updatedDuplicate.acknowledged ? this.unacknowledgedDuplicates : this.acknowledgedDuplicates;
				const index = sourceList.findIndex(d => d.id === updatedDuplicate.id);

				if (index !== -1) {
					sourceList.splice(index, 1);
					targetList.push(updatedDuplicate);
					this.adjustSectionPagination(sourceSection, -1);
					this.adjustSectionPagination(targetSection, 1);
				}

				if (this.$refs.duplicateNavigation && typeof this.$refs.duplicateNavigation.selectNextDuplicateAfterResolution === 'function') {
					this.$refs.duplicateNavigation.selectNextDuplicateAfterResolution(updatedDuplicate, sourceSection);
				} else if (sourceList.length > 0) {
					const nextIndex = index < sourceList.length ? index : 0;
					this.currentDuplicate = sourceList[nextIndex];
				} else {
					this.currentDuplicate = targetList[0] || null;
				}
			}
		},
		moveToNext(duplicate) {
			let currentList = duplicate.acknowledged ? this.acknowledgedDuplicates : this.unacknowledgedDuplicates;
			const currentIndex = currentList.findIndex(d => d.id === duplicate.id);
			if (currentIndex !== -1 && currentIndex < currentList.length - 1) {
				this.currentDuplicate = currentList[currentIndex + 1];
			} else {
				this.currentDuplicate = currentList[0];
			}
		},
		async openDuplicate(duplicate) {
			this.activeView = 'details'
			this.currentDuplicate = duplicate
		},
		async handleQueryOptionsChanged({ sortBy, minSize }) {
			this.sortOption = sortBy || 'none';
			this.minSizeBytes = Number(minSize) > 0 ? Number(minSize) : 0;
			saveUiPreferences({
				sortOption: this.sortOption,
				minSizeBytes: this.minSizeBytes,
			});
			await this.refreshDuplicates({ silent: true });
		},
		async refreshDuplicates(options = {}) {
			const showSpinner = Boolean(options && options.fullScreen === true);
			if (showSpinner) {
				this.isLoading = true;
			}
			try {
				const queryOptions = {
					sortBy: this.sortOption,
					minSize: this.minSizeBytes
				};
				const [acknowledgedResponse, unacknowledgedResponse] = await Promise.all([
					fetchDuplicates('acknowledged', 50, 1, queryOptions),
					fetchDuplicates('unacknowledged', 50, 1, queryOptions)
				]);

				this.acknowledgedDuplicates = acknowledgedResponse.entities;
				this.unacknowledgedDuplicates = unacknowledgedResponse.entities;
				this.acknowledgedPagination = acknowledgedResponse.pagination;
				this.unacknowledgedPagination = unacknowledgedResponse.pagination;
				this.pendingOffsetDelta.acknowledged = 0;
				this.pendingOffsetDelta.unacknowledged = 0;
				this.paginationResetToken++;

				if (this.currentDuplicate) {
					const existsAcknowledged = this.acknowledgedDuplicates.find(d => d.id === this.currentDuplicate.id);
					const existsUnacknowledged = this.unacknowledgedDuplicates.find(d => d.id === this.currentDuplicate.id);
					if (existsAcknowledged) {
						this.currentDuplicate = existsAcknowledged;
					} else if (existsUnacknowledged) {
						this.currentDuplicate = existsUnacknowledged;
					} else {
						this.currentDuplicate = this.unacknowledgedDuplicates[0] || this.acknowledgedDuplicates[0] || null;
					}
				} else if (this.activeView === 'details') {
					this.currentDuplicate = this.unacknowledgedDuplicates[0] || this.acknowledgedDuplicates[0] || null;
				}
			} finally {
				if (showSpinner) {
					this.isLoading = false;
				}
			}
		},
		async loadInitialData() {
			this.isLoading = true
			try {
				const queryOptions = {
					sortBy: this.sortOption,
					minSize: this.minSizeBytes
				}
				const statusPromise = typeof fetchScanStatus === 'function'
					? fetchScanStatus().catch(() => null)
					: Promise.resolve(null)
				const [acknowledgedResponse, unacknowledgedResponse, projectsResponse, initialScanStatus] = await Promise.all([
					fetchDuplicates('acknowledged', 50, 1, queryOptions),
					fetchDuplicates('unacknowledged', 50, 1, queryOptions),
					fetchProjects(),
					statusPromise
				])

				this.acknowledgedDuplicates = acknowledgedResponse.entities
				this.unacknowledgedDuplicates = unacknowledgedResponse.entities
				this.acknowledgedPagination = acknowledgedResponse.pagination
				this.unacknowledgedPagination = unacknowledgedResponse.pagination
				this.projects = projectsResponse
				if (!this.currentDuplicate && this.activeView === 'details') {
					this.currentDuplicate = this.unacknowledgedDuplicates[0] || this.acknowledgedDuplicates[0] || null
				}
				if (initialScanStatus) {
					await this.applyScanStatus(initialScanStatus, { isInitial: true })
				}
			} catch (error) {
				console.error('Error loading initial data:', error)
			} finally {
				this.isLoading = false
			}
		},
		clearScanPollTimer() {
			if (this.scanPollTimer) {
				clearTimeout(this.scanPollTimer)
				this.scanPollTimer = null
			}
		},
		scheduleScanPoll(delayMs) {
			this.clearScanPollTimer()
			if (this._isDestroyed || typeof fetchScanStatus !== 'function') {
				return
			}
			this.scanPollTimer = setTimeout(() => {
				this.pollScanStatus()
			}, delayMs)
			if (this.scanPollTimer && typeof this.scanPollTimer.unref === 'function') {
				this.scanPollTimer.unref()
			}
		},
		async applyScanStatus(status, { isInitial = false } = {}) {
			if (!status || typeof status !== 'object') {
				return
			}
			const incomingSeq = Number.isFinite(Number(status.completedSeq)) ? Number(status.completedSeq) : 0
			if (isInitial) {
				this.lastCompletedSeq = incomingSeq
				this.wasTrackingActiveScan = false
				this.scanStatus = {
					...this.scanStatus,
					running: false,
					indeterminate: false,
					completedSeq: incomingSeq,
					etaSeconds: null,
				}
				return
			}

			const wasRunning = this.wasTrackingActiveScan || Boolean(this.scanStatus && this.scanStatus.running)
			this.scanStatus = { ...this.scanStatus, ...status }

			if (status.running) {
				this.wasTrackingActiveScan = true
				this.scheduleScanPoll(1500)
				return
			}

			const completedNewScan = incomingSeq > this.lastCompletedSeq || wasRunning
			if (incomingSeq > this.lastCompletedSeq) {
				this.lastCompletedSeq = incomingSeq
			}
			this.wasTrackingActiveScan = false
			this.clearScanPollTimer()

			if (completedNewScan) {
				await this.refreshDuplicates({ silent: true })
				if (wasRunning && typeof notifyScanCompleted === 'function') {
					notifyScanCompleted()
				}
			}
		},
		async pollScanStatus() {
			if (this._isDestroyed || typeof fetchScanStatus !== 'function') {
				return
			}
			if (!this.wasTrackingActiveScan && !this.isScanRunning) {
				this.clearScanPollTimer()
				return
			}
			try {
				const status = await fetchScanStatus()
				if (!this._isDestroyed && status) {
					await this.applyScanStatus(status)
				} else if (!this._isDestroyed && (this.wasTrackingActiveScan || this.isScanRunning)) {
					this.scheduleScanPoll(2000)
				}
			} catch (error) {
				if (!this._isDestroyed && (this.wasTrackingActiveScan || this.isScanRunning)) {
					this.scheduleScanPoll(3000)
				}
			}
		},
		async triggerScan() {
			if (this.isScanRunning || typeof startUserScan !== 'function') {
				return
			}
			this.wasTrackingActiveScan = true
			this.scanStatus = {
				...this.scanStatus,
				running: true,
				indeterminate: true,
				scannedFiles: 0,
				totalFiles: 0,
				percentage: 0,
				etaSeconds: null,
			}
			if (typeof notifyScanStarted === 'function') {
				notifyScanStarted()
			}
			this.scheduleScanPoll(1200)

			try {
				const finalStatus = await startUserScan()
				if (!this._isDestroyed) {
					if (finalStatus) {
						await this.applyScanStatus(finalStatus)
					} else {
						this.scanStatus = { ...this.scanStatus, running: false, indeterminate: false, percentage: 100 }
						this.wasTrackingActiveScan = false
						this.clearScanPollTimer()
						await this.refreshDuplicates({ silent: true })
						if (typeof notifyScanCompleted === 'function') {
							notifyScanCompleted()
						}
					}
				}
			} catch (error) {
				if (this._isDestroyed) {
					return
				}
				try {
					if (typeof fetchScanStatus === 'function') {
						const liveStatus = await fetchScanStatus()
						if (liveStatus && (liveStatus.running || Number(liveStatus.completedSeq) > this.lastCompletedSeq)) {
							await this.applyScanStatus(liveStatus)
							return
						}
					}
				} catch (pollErr) {
					// Ignore secondary status check error
				}
				this.wasTrackingActiveScan = false
				this.scanStatus = { ...this.scanStatus, running: false, indeterminate: false }
				this.clearScanPollTimer()
				if (typeof notifyScanFailed === 'function') {
					notifyScanFailed()
				}
			}
		},
		mergePaginatedDuplicates(section, newDuplicates, incomingPagination) {
			const listKey = section === 'acknowledged' ? 'acknowledgedDuplicates' : 'unacknowledgedDuplicates'
			const paginationKey = section === 'acknowledged' ? 'acknowledgedPagination' : 'unacknowledgedPagination'
			const currentList = Array.isArray(this[listKey]) ? this[listKey] : []
			const incomingList = Array.isArray(newDuplicates) ? newDuplicates : []

			if (incomingPagination === undefined) {
				const delta = incomingList.length - currentList.length
				this[listKey] = incomingList
				if (delta !== 0) {
					this.adjustSectionPagination(section, delta)
				}
				if (!this.currentDuplicate && this.activeView === 'details' && this[listKey].length > 0) {
					this.currentDuplicate = this[listKey][0]
				}
				return
			}

			const existingKeys = new Set(currentList.map(d => d && (d.hash || d.id)).filter(Boolean))
			const uniqueIncoming = incomingList.filter(d => {
				const key = d && (d.hash || d.id)
				if (!key) {
					return true
				}
				if (existingKeys.has(key)) {
					return false
				}
				existingKeys.add(key)
				return true
			})
			this[listKey] = [...currentList, ...uniqueIncoming]

			if (incomingPagination && typeof incomingPagination === 'object') {
				const delta = this.pendingOffsetDelta[section] || 0
				this.pendingOffsetDelta[section] = 0
				const mergedPagination = {
					...(this[paginationKey] || {}),
					...incomingPagination,
				}
				if (Number.isInteger(mergedPagination.nextOffset) && delta !== 0) {
					mergedPagination.nextOffset = Math.max(0, mergedPagination.nextOffset + delta)
				}
				if (Number.isFinite(mergedPagination.totalItems) && delta !== 0) {
					mergedPagination.totalItems = Math.max(0, mergedPagination.totalItems + delta)
				}
				if (incomingList.length === 0) {
					mergedPagination.hasMore = false
				} else if (
					typeof mergedPagination.hasMore === 'boolean'
					&& Number.isFinite(mergedPagination.totalItems)
					&& Number.isInteger(mergedPagination.nextOffset)
				) {
					mergedPagination.hasMore = mergedPagination.hasMore && mergedPagination.nextOffset < mergedPagination.totalItems
				}
				if (mergedPagination.hasMore === false) {
					mergedPagination.totalItems = this[listKey].length
				}
				this[paginationKey] = mergedPagination
			}

			if (!this.currentDuplicate && this.activeView === 'details' && this[listKey].length > 0) {
				this.currentDuplicate = this[listKey][0]
			}
		},
		updateAcknowledgedDuplicates(newDuplicates, pagination) {
			this.mergePaginatedDuplicates('acknowledged', newDuplicates, pagination)
		},
		updateUnacknowledgedDuplicates(newDuplicates, pagination) {
			this.mergePaginatedDuplicates('unacknowledged', newDuplicates, pagination)
		},
		openBulkDelete() {
			this.activeView = 'bulk-delete'
			this.currentDuplicate = null
		},
		closeBulkDelete() {
			this.activeView = 'details'
			if (!this.currentDuplicate) {
				this.currentDuplicate = this.unacknowledgedDuplicates[0] || this.acknowledgedDuplicates[0] || null
			}
		},
		showHelp(section) {
			this.currentHelpSection = section || 'guide'
			this.helpModalOpen = true
		},
		recordTouchedFolders(paths) {
			if (!Array.isArray(paths) || paths.length === 0) {
				return
			}
			const seen = new Set(this.recentCleanedPaths)
			paths.forEach(path => {
				if (typeof path === 'string' && path.trim() !== '') {
					seen.add(path.trim())
				}
			})
			this.recentCleanedPaths = Array.from(seen)
		},
		async openEmptyFoldersModal() {
			this.emptyFoldersModalOpen = true
			await this.scanEmptyFoldersInModal(this.recentCleanedPaths.length > 0)
		},
		async scanEmptyFoldersInModal(useCleanedScope = false) {
			if (typeof api.scanEmptyFolders !== 'function') {
				return
			}
			this.emptyFoldersLoading = true
			try {
				const scopePaths = useCleanedScope && this.recentCleanedPaths.length > 0
					? [...this.recentCleanedPaths]
					: []
				const response = await api.scanEmptyFolders(scopePaths)
				const folders = Array.isArray(response?.folders) ? response.folders : []
				this.modalEmptyFolders = folders
				this.selectedModalEmptyFolders = folders.map(folder => folder.path)
				this.modalEmptyFoldersScanned = true
			} catch (error) {
				console.error('Error scanning empty folders from modal:', error)
			} finally {
				this.emptyFoldersLoading = false
			}
		},
		toggleModalEmptyFolder(path) {
			const idx = this.selectedModalEmptyFolders.indexOf(path)
			if (idx === -1) {
				this.selectedModalEmptyFolders.push(path)
			} else {
				this.selectedModalEmptyFolders.splice(idx, 1)
			}
		},
		toggleSelectAllModalEmptyFolders() {
			if (this.isAllModalEmptyFoldersSelected) {
				this.selectedModalEmptyFolders = []
			} else {
				this.selectedModalEmptyFolders = this.modalEmptyFolders.map(folder => folder.path)
			}
		},
		async deleteSelectedModalEmptyFolders() {
			if (this.selectedModalEmptyFolders.length === 0 || typeof api.deleteEmptyFolders !== 'function') {
				return
			}
			if (typeof confirm === 'function' && !confirm(t('duplicatefinder', 'Are you sure you want to delete the selected empty folders?'))) {
				return
			}
			this.emptyFoldersDeleting = true
			try {
				const { deleted } = await api.deleteEmptyFolders([...this.selectedModalEmptyFolders])
				if (deleted.length > 0) {
					const deletedSet = new Set(deleted)
					this.modalEmptyFolders = this.modalEmptyFolders.filter(folder => !deletedSet.has(folder.path))
					this.selectedModalEmptyFolders = this.selectedModalEmptyFolders.filter(path => !deletedSet.has(path))
					if (this.modalEmptyFolders.length === 0) {
						this.recentCleanedPaths = []
					}
				}
			} catch (error) {
				console.error('Error deleting empty folders from modal:', error)
			} finally {
				this.emptyFoldersDeleting = false
			}
		},

		viewProject(projectId) {
			this.activeProject = projectId
			this.activeView = 'project'
			this.settingsOpen = false
		},

		backToProjects() {
			this.activeProject = null
			this.activeView = 'details'
			this.settingsOpen = true
		},

		viewProjectDuplicate(duplicate) {
			this.projectDuplicate = duplicate
			this.activeView = 'project-duplicate'
		},

		backToProject() {
			this.projectDuplicate = null
			this.activeView = 'project'
		},
		handleSearch({ query, type }) {
			// Convert the search pattern to a RegExp object
			let searchRegex
			try {
				searchRegex = new RegExp(query, 'i') // case-insensitive search
			} catch (e) {
				// If invalid regex, do a simple text search
				searchRegex = new RegExp(this.escapeRegex(query), 'i')
			}

			// Filter duplicates based on the search pattern
			this.filteredDuplicates = this.duplicates.filter(duplicate => {
				return duplicate.files.some(file => {
					const fileName = file.path.split('/').pop() // Get just the filename
					return searchRegex.test(fileName)
				})
			})
		},
		escapeRegex(string) {
			return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
		}
	}
}
</script>

<style>
.app-loading-container {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 100%;
	height: 100%;
	min-height: calc(100vh - var(--header-height, 50px));
	flex: 1 1 auto;
	margin: auto;
}

.app-content {
	overflow-y: auto;
}

.app-content-topbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 12px 20px 12px 56px;
	min-height: 56px;
	box-sizing: border-box;
	border-bottom: 1px solid var(--color-border);
	background-color: var(--color-main-background);
	position: sticky;
	top: 0;
	z-index: 100;
}

.topbar-summary {
	position: relative;
	display: inline-flex;
	align-items: center;
	gap: 6px;
}

.topbar-title {
	margin: 0;
	font-size: 1.15rem;
	font-weight: 600;
	color: var(--color-main-text);
}

.topbar-summary.has-count-tooltip .topbar-title {
	cursor: help;
}

.topbar-count-help {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 22px;
	height: 22px;
	border-radius: 50%;
	color: var(--color-text-maxcontrast);
	cursor: help;
	outline: none;
	transition: color 0.15s ease, background-color 0.15s ease;
}

.topbar-summary.has-count-tooltip:hover .topbar-count-help,
.topbar-count-help:focus-visible {
	color: var(--color-main-text);
	background-color: var(--color-background-hover);
}

.topbar-count-tooltip {
	position: absolute;
	top: calc(100% + 8px);
	left: 0;
	min-width: 280px;
	max-width: 360px;
	padding: 10px 12px;
	border-radius: var(--border-radius-large, 8px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-main-background, #ffffff);
	background-image: linear-gradient(var(--color-main-background, #ffffff), var(--color-main-background, #ffffff)), linear-gradient(#22262c, #22262c);
	color: var(--color-main-text);
	box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
	font-size: 12px;
	font-weight: 400;
	line-height: 1.45;
	z-index: 2000;
	opacity: 0;
	visibility: hidden;
	pointer-events: none;
	transform: translateY(-2px);
	transition: opacity 0.12s ease, transform 0.12s ease, visibility 0.12s ease;
}

.topbar-summary.has-count-tooltip:hover .topbar-count-tooltip,
.topbar-summary.has-count-tooltip:focus-within .topbar-count-tooltip {
	opacity: 1;
	visibility: visible;
	transform: translateY(0);
}

.topbar-count-tooltip__title {
	font-weight: 600;
	margin-bottom: 6px;
	color: var(--color-main-text);
}

.topbar-count-tooltip__list {
	margin: 0;
	padding-left: 16px;
	list-style: disc;
}

.topbar-count-tooltip__list li + li {
	margin-top: 3px;
}

.topbar-actions {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-left: auto;
}

.app-content-topbar .topbar-scan-button,
.app-content-topbar .topbar-empty-folders-button {
	display: inline-flex !important;
	align-items: center !important;
	justify-content: center !important;
	gap: 6px;
	min-height: 34px;
	margin: 0 !important;
	padding: 6px 14px !important;
	border-radius: var(--border-radius-large, 8px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-weight: 600;
	font-size: 0.9rem;
	line-height: 1.2 !important;
	cursor: pointer;
	box-sizing: border-box;
	transition: background-color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
}

.app-content-topbar .topbar-scan-button svg,
.app-content-topbar .topbar-empty-folders-button svg {
	display: block !important;
	flex-shrink: 0;
}

.app-content-topbar .topbar-scan-button:hover:not(:disabled),
.app-content-topbar .topbar-scan-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-empty-folders-button:hover:not(:disabled),
.app-content-topbar .topbar-empty-folders-button:focus-visible:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element);
}

.app-content-topbar .topbar-scan-button:disabled {
	opacity: 0.7;
	cursor: wait;
}

.topbar-scan-icon.is-spinning {
	animation: duplicatefinder-spin 1s linear infinite;
}

@keyframes duplicatefinder-spin {
	from {
		transform: rotate(0deg);
	}
	to {
		transform: rotate(360deg);
	}
}

.scan-progress-banner {
	padding: 12px 20px;
	border-bottom: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
}

.scan-progress-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 8px;
	margin-bottom: 8px;
	font-size: 0.875rem;
}

.scan-progress-info {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 10px;
}

.scan-progress-title {
	font-weight: 600;
	color: var(--color-main-text);
}

.scan-progress-counts {
	color: var(--color-text-maxcontrast);
	font-variant-numeric: tabular-nums;
}

.scan-progress-eta {
	color: var(--color-text-maxcontrast);
	font-size: 0.82rem;
	font-variant-numeric: tabular-nums;
}

.scan-progress-track {
	position: relative;
	width: 100%;
	height: 8px;
	border-radius: 999px;
	background-color: var(--color-background-dark);
	overflow: hidden;
}

.scan-progress-fill {
	height: 100%;
	border-radius: 999px;
	background-color: var(--color-primary-element, #0082c9);
	transition: width 0.25s ease;
}

.scan-progress-fill.is-indeterminate {
	width: 35%;
	animation: duplicatefinder-indeterminate 1.4s ease-in-out infinite;
}

@keyframes duplicatefinder-indeterminate {
	0% {
		transform: translateX(-100%);
	}
	100% {
		transform: translateX(300%);
	}
}

.app-content-topbar .topbar-bulk-delete-button {
	display: inline-flex !important;
	align-items: center !important;
	justify-content: center !important;
	gap: 6px;
	min-height: 34px;
	margin: 0 !important;
	padding: 6px 14px !important;
	border-radius: var(--border-radius-large, 8px);
	border: 1px solid #d32f2f;
	background-color: #d32f2f;
	color: #ffffff;
	font-weight: 600;
	font-size: 0.9rem;
	line-height: 1.2 !important;
	cursor: pointer;
	box-sizing: border-box;
	transition: background-color 0.15s ease, border-color 0.15s ease;
}

.app-content-topbar .topbar-bulk-delete-button .material-design-icon,
.app-content-topbar .topbar-bulk-delete-button svg {
	display: inline-flex !important;
	align-items: center !important;
	justify-content: center !important;
	bottom: 0 !important;
	flex-shrink: 0;
}

.app-content-topbar .topbar-bulk-delete-button:hover:not(:disabled),
.app-content-topbar .topbar-bulk-delete-button:focus-visible:not(:disabled) {
	background-color: #b71c1c;
	border-color: #b71c1c;
	color: #ffffff;
}

.app-content-topbar .topbar-scan-button > *,
.app-content-topbar .topbar-empty-folders-button > *,
.app-content-topbar .topbar-bulk-delete-button > * {
	pointer-events: none;
}

.app-content-topbar .topbar-bulk-delete-button:disabled,
.app-content-topbar .topbar-bulk-delete-button:disabled * {
	opacity: 0.45;
	cursor: not-allowed !important;
}

.app-content-topbar .topbar-bulk-delete-button:disabled * {
	opacity: 1;
}

.help-content {
	padding: var(--spacing-3);
	max-width: 800px;
	margin: 0 auto;
}

.empty-folders-modal {
	padding: 20px;
	max-width: 760px;
	margin: 0 auto;
}

.empty-folders-modal__hint {
	margin: 0 0 14px;
	color: var(--color-text-maxcontrast);
	font-size: 0.92rem;
	line-height: 1.45;
}

.empty-folders-modal__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	margin-bottom: 16px;
}

.empty-folders-modal__status {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 16px 0;
	color: var(--color-text-maxcontrast);
}

.empty-folders-modal__list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-height: 50vh;
	overflow-y: auto;
}

.empty-folders-modal__item {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	cursor: pointer;
}

.empty-folders-modal__item:hover {
	background-color: var(--color-background-hover);
}

.empty-folders-modal__path {
	flex: 1 1 auto;
	min-width: 0;
	overflow-wrap: anywhere;
	word-break: break-word;
	color: var(--color-main-text);
}

.empty-folders-modal__badge {
	color: var(--color-text-maxcontrast);
	font-size: 0.82rem;
	white-space: nowrap;
}

:deep(.modal-container) {
	background-color: var(--color-main-background);
	border-radius: var(--border-radius-large);
	box-shadow: var(--shadow-modal);
	border: 1px solid var(--color-border);
	overflow: hidden;
}

:deep(.modal-wrapper) {
	border-radius: var(--border-radius-large);
}

:deep(.modal-header) {
	background-color: var(--color-primary-element-light);
	border-bottom: 1px solid var(--color-border);
	padding: 16px 20px;
}

:deep(.modal-title) {
	color: var(--color-main-text);
	font-weight: bold;
	font-size: 20px;
}

:deep(.modal-container__close) {
	opacity: 0.7;
	transition: opacity 0.2s ease;
}

:deep(.modal-container__close:hover) {
	opacity: 1;
}

:deep(.modal-container__content) {
	padding: 0;
	max-height: 80vh;
	overflow-y: auto;
}

.file-picker .file-picker__main {
	min-width: 0;
}

.file-picker .file-picker__files {
	overflow-x: hidden;
	overflow-y: auto;
}

.file-picker .file-picker__files th.row-name {
	width: auto;
}

.file-picker .file-picker__files th.row-size {
	width: 110px;
}

.file-picker .file-picker__files th.row-modified {
	width: 150px;
}

.file-picker .file-picker__name-container {
	min-width: 0;
}
</style>