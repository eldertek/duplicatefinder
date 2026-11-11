<template>
	<NcContent app-name="duplicatefinder">
		<NcLoadingIcon v-if="isLoading" />
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
					@open-duplicate="openDuplicate"
					@open-settings="settingsOpen = true"
					@open-projects="settingsOpen = true"
					@view-project="viewProject"
					@show-help="showHelp"
					@open-bulk-delete="openBulkDelete"
					@query-options-changed="handleQueryOptionsChanged"
					@update-acknowledged-duplicates="updateAcknowledgedDuplicates"
					@update-unacknowledged-duplicates="updateUnacknowledgedDuplicates" />
			</div>

			<NcAppContent>
				<div
					v-if="activeView === 'details' || activeView === 'bulk-delete'"
					class="app-content-topbar">
					<div class="topbar-summary">
						<h2 class="topbar-title">
							{{ activeView === 'bulk-delete'
								? t('duplicatefinder', 'Bulk Delete')
								: (totalDuplicateCount > 0
									? t('duplicatefinder', 'Duplicates ({count})', { count: totalDuplicateCount })
									: t('duplicatefinder', 'Duplicates')) }}
						</h2>
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
							v-if="activeView !== 'bulk-delete' && hasDuplicates"
							type="button"
							class="topbar-bulk-delete-button"
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
					<BulkDeletionSettings @duplicates-deleted="refreshDuplicates" />
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
import {
	fetchDuplicates,
	fetchProjects,
	fetchScanStatus,
	startUserScan,
	notifyScanStarted,
	notifyScanCompleted,
	notifyScanFailed,
} from '@/tools/api';
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
			helpModalOpen: false,
			currentHelpSection: 'guide',
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
		isScanRunning() {
			return Boolean(this.scanStatus && this.scanStatus.running)
		},
		formattedEta() {
			return this.isScanRunning ? formatScanEta(this.scanStatus.etaSeconds) : ''
		},
		totalDuplicateCount() {
			const unackCount = Number.isFinite(this.unacknowledgedPagination?.totalItems)
				? this.unacknowledgedPagination.totalItems
				: this.unacknowledgedDuplicates.length
			const ackCount = Number.isFinite(this.acknowledgedPagination?.totalItems)
				? this.acknowledgedPagination.totalItems
				: this.acknowledgedDuplicates.length
			return unackCount + ackCount
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
			if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
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
		handleDuplicateResolved({ duplicate, type }) {
			console.log('ISSUE146: App.handleDuplicateResolved called');
			console.log('ISSUE146: duplicate.id =', duplicate.id);
			console.log('ISSUE146: duplicate.hash =', duplicate.hash);
			console.log('ISSUE146: type =', type);

			// Remove from the appropriate list
			if (type === 'acknowledged') {
				console.log('ISSUE146: Removing from acknowledged list');
				console.log('ISSUE146: acknowledged list length before =', this.acknowledgedDuplicates.length);
				this.acknowledgedDuplicates = this.acknowledgedDuplicates.filter(d => d.hash !== duplicate.hash);
				console.log('ISSUE146: acknowledged list length after =', this.acknowledgedDuplicates.length);
			} else {
				console.log('ISSUE146: Removing from unacknowledged list');
				console.log('ISSUE146: unacknowledged list length before =', this.unacknowledgedDuplicates.length);
				this.unacknowledgedDuplicates = this.unacknowledgedDuplicates.filter(d => d.hash !== duplicate.hash);
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
				// Remove from both lists
				this.acknowledgedDuplicates = this.acknowledgedDuplicates.filter(d => d.id !== updatedDuplicate.id);
				this.unacknowledgedDuplicates = this.unacknowledgedDuplicates.filter(d => d.id !== updatedDuplicate.id);
				this.currentDuplicate = null;
			} else {
				// Existing logic to update the duplicate
				const sourceList = !updatedDuplicate.acknowledged ? this.acknowledgedDuplicates : this.unacknowledgedDuplicates;
				const targetList = !updatedDuplicate.acknowledged ? this.unacknowledgedDuplicates : this.acknowledgedDuplicates;
				const index = sourceList.findIndex(d => d.id === updatedDuplicate.id);

				if (index !== -1) {
					sourceList.splice(index, 1);
					targetList.push(updatedDuplicate);
				}

				this.currentDuplicate = updatedDuplicate;

				if (sourceList.length > 0) {
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
				} else {
					this.scheduleScanPoll(10000)
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
				this.scanStatus = { ...this.scanStatus, ...status }
				if (status.running) {
					this.wasTrackingActiveScan = true
					this.scheduleScanPoll(1500)
				} else {
					this.scheduleScanPoll(10000)
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
			this.scheduleScanPoll(10000)

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
			if (!this.isScanRunning && typeof document !== 'undefined' && document.visibilityState === 'hidden') {
				this.scheduleScanPoll(10000)
				return
			}
			try {
				const status = await fetchScanStatus()
				if (!this._isDestroyed && status) {
					await this.applyScanStatus(status)
				} else if (!this._isDestroyed) {
					this.scheduleScanPoll(this.isScanRunning ? 2000 : 10000)
				}
			} catch (error) {
				if (!this._isDestroyed) {
					this.scheduleScanPoll(this.isScanRunning ? 3000 : 15000)
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
						await this.refreshDuplicates({ silent: true })
						if (typeof notifyScanCompleted === 'function') {
							notifyScanCompleted()
						}
						this.scheduleScanPoll(10000)
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
				this.scheduleScanPoll(10000)
				if (typeof notifyScanFailed === 'function') {
					notifyScanFailed()
				}
			}
		},
		updateAcknowledgedDuplicates(newDuplicates) {
			this.acknowledgedDuplicates = [...this.acknowledgedDuplicates, ...newDuplicates]
		},
		updateUnacknowledgedDuplicates(newDuplicates) {
			this.unacknowledgedDuplicates = [...this.unacknowledgedDuplicates, ...newDuplicates]
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
	z-index: 10;
}

.topbar-title {
	margin: 0;
	font-size: 1.15rem;
	font-weight: 600;
	color: var(--color-main-text);
}

.topbar-actions {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-left: auto;
}

.app-content-topbar .topbar-scan-button {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	min-height: 34px;
	padding: 6px 14px;
	border-radius: var(--border-radius-large, 8px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-weight: 600;
	font-size: 0.9rem;
	line-height: 1.2;
	cursor: pointer;
	transition: background-color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
}

.app-content-topbar .topbar-scan-button:hover:not(:disabled),
.app-content-topbar .topbar-scan-button:focus-visible:not(:disabled) {
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
	display: inline-flex;
	align-items: center;
	gap: 6px;
	min-height: 34px;
	padding: 6px 14px;
	border-radius: var(--border-radius-large, 8px);
	border: 1px solid #d32f2f;
	background-color: #d32f2f;
	color: #ffffff;
	font-weight: 600;
	font-size: 0.9rem;
	line-height: 1.2;
	cursor: pointer;
	transition: background-color 0.15s ease, border-color 0.15s ease;
}

.app-content-topbar .topbar-bulk-delete-button:hover,
.app-content-topbar .topbar-bulk-delete-button:focus-visible {
	background-color: #b71c1c;
	border-color: #b71c1c;
	color: #ffffff;
}

.help-content {
	padding: var(--spacing-3);
	max-width: 800px;
	margin: 0 auto;
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