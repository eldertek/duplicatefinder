<template>
	<NcContent app-name="duplicatefinder">
		<NcLoadingIcon v-if="isLoading" />
		<template v-else>
			<div class="app-navigation-header">
				<DuplicateNavigation
					:acknowledged-duplicates="acknowledgedDuplicates"
					:unacknowledged-duplicates="unacknowledgedDuplicates"
					:currentDuplicateId="currentDuplicate?.id"
					:acknowledgedPagination="acknowledgedPagination"
					:unacknowledgedPagination="unacknowledgedPagination"
					:activeView="activeView"
					:activeProject="activeProject"
					:projects="projects"
					:has-duplicates="acknowledgedDuplicates.length > 0 || unacknowledgedDuplicates.length > 0"
					@open-duplicate="openDuplicate"
					@open-settings="settingsOpen = true"
					@open-projects="settingsOpen = true"
					@view-project="viewProject"
					@show-help="showHelp"
					@open-bulk-delete="openBulkDelete"
					@update-acknowledged-duplicates="updateAcknowledgedDuplicates"
					@update-unacknowledged-duplicates="updateUnacknowledgedDuplicates" />
			</div>

			<NcAppContent>
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
						@duplicate-resolved="handleDuplicateResolved"
						@duplicateUpdated="updateDuplicate"
						@openSettings="settingsOpen = true"
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
					<FilterSettings />
				</NcAppSettingsSection>

				<NcAppSettingsSection
					id="origin-folders"
					:name="t('duplicatefinder', 'Origin Folders')">
					<template #icon>
						<Folder :size="20" />
					</template>
					<OriginFoldersSettings />
				</NcAppSettingsSection>

				<NcAppSettingsSection
					id="excluded-folders"
					:name="t('duplicatefinder', 'Excluded Folders')">
					<template #icon>
						<FolderRemove :size="20" />
					</template>
					<ExcludedFoldersSettings />
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
import { fetchDuplicates, fetchProjects } from '@/tools/api';
import { removeDuplicateFromList } from '@/tools/utils';
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
		return {
			acknowledgedDuplicates: [],
			unacknowledgedDuplicates: [],
			currentDuplicate: null,
			isLoading: false,
			page: 1,
			limit: 50,
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
		};
	},
	computed: {
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
		await this.loadInitialData()
	},
	methods: {
		handleDuplicateResolved({ duplicate, type }) {
			console.log('App: Handling duplicate-resolved event:', { duplicate, type });

			// Remove from the appropriate list
			if (type === 'acknowledged') {
				console.log('App: Removing from acknowledged list');
				this.acknowledgedDuplicates = this.acknowledgedDuplicates.filter(d => d.hash !== duplicate.hash);
			} else {
				console.log('App: Removing from unacknowledged list');
				this.unacknowledgedDuplicates = this.unacknowledgedDuplicates.filter(d => d.hash !== duplicate.hash);
			}

			// Update current duplicate
			if (type === 'acknowledged') {
				console.log('App: Setting next duplicate from acknowledged list');
				this.currentDuplicate = this.acknowledgedDuplicates[0] || this.unacknowledgedDuplicates[0] || null;
			} else {
				console.log('App: Setting next duplicate from unacknowledged list');
				this.currentDuplicate = this.unacknowledgedDuplicates[0] || this.acknowledgedDuplicates[0] || null;
			}

			console.log('App: New lists state:', {
				acknowledgedCount: this.acknowledgedDuplicates.length,
				unacknowledgedCount: this.unacknowledgedDuplicates.length,
				currentDuplicate: this.currentDuplicate ? this.currentDuplicate.hash : null
			});
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
		async refreshDuplicates() {
			this.isLoading = true;
			try {
				const allData = await fetchDuplicates('all', this.limit, this.page);

				// Mettre à jour les doublons reconnus
				this.acknowledgedDuplicates = allData.entities.filter(duplicate => duplicate.acknowledged);

				// Mettre à jour les doublons non reconnus
				this.unacknowledgedDuplicates = allData.entities.filter(duplicate => !duplicate.acknowledged);

				// Maintenir le duplicata courant si possible
				if (this.currentDuplicate) {
					const existsAcknowledged = this.acknowledgedDuplicates.find(d => d.id === this.currentDuplicate.id);
					const existsUnacknowledged = this.unacknowledgedDuplicates.find(d => d.id === this.currentDuplicate.id);
					if (existsAcknowledged) {
						this.currentDuplicate = existsAcknowledged;
					} else if (existsUnacknowledged) {
						this.currentDuplicate = existsUnacknowledged;
					} else {
						this.currentDuplicate = this.acknowledgedDuplicates[0] || this.unacknowledgedDuplicates[0] || null;
					}
				}
			} finally {
				this.isLoading = false;
			}
		},
		async loadInitialData() {
			try {
				const [acknowledgedResponse, unacknowledgedResponse, projectsResponse] = await Promise.all([
					fetchDuplicates('acknowledged', 50, 1),
					fetchDuplicates('unacknowledged', 50, 1),
					fetchProjects()
				])

				this.acknowledgedDuplicates = acknowledgedResponse.entities
				this.unacknowledgedDuplicates = unacknowledgedResponse.entities
				this.acknowledgedPagination = acknowledgedResponse.pagination
				this.unacknowledgedPagination = unacknowledgedResponse.pagination
				this.projects = projectsResponse
			} catch (error) {
				console.error('Error loading initial data:', error)
				showError(t('duplicatefinder', 'Could not load duplicates'))
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
	},
	mounted() {
		// Fetch initial duplicates
		this.refreshDuplicates();
	}
}
</script>

<style>
.app-content {
	overflow-y: auto;
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
</style>