<template>
	<NcContent app-name="duplicatefinder">
		<NcLoadingIcon v-if="isLoading" />
		<template v-else>
			<DuplicateNavigation v-if="acknowledgedDuplicates.length > 0 || unacknowledgedDuplicates.length > 0"
				:acknowledged-duplicates="acknowledgedDuplicates" :unacknowledged-duplicates="unacknowledgedDuplicates"
				@open-duplicate="openDuplicate"
				@open-settings="settingsOpen = true" />
			<NcAppContent>
				<DuplicateDetails ref="duplicateDetails" :duplicate="currentDuplicate" @duplicate-resolved="handleDuplicateResolved"
					@duplicateUpdated="updateDuplicate" />
			</NcAppContent>

			<NcAppSettingsDialog 
				:open.sync="settingsOpen" 
				:show-navigation="true" 
				:name="t('duplicatefinder', 'Duplicate Finder Settings')">
				<NcAppSettingsSection 
					id="origin-folders" 
					:name="t('duplicatefinder', 'Origin Folders')">
					<template #icon>
						<Folder :size="20" />
					</template>
					<OriginFoldersSettings />
				</NcAppSettingsSection>

				<NcAppSettingsSection 
					id="bulk-deletion" 
					:name="t('duplicatefinder', 'Bulk Deletion')">
					<template #icon>
						<Delete :size="20" />
					</template>
					<BulkDeletionSettings @duplicates-deleted="refreshDuplicates" />
				</NcAppSettingsSection>
			</NcAppSettingsDialog>
		</template>
	</NcContent>
</template>
  
  
<script>
import { NcAppContent, NcContent, NcLoadingIcon, NcAppSettingsDialog, NcAppSettingsSection } from '@nextcloud/vue';
import DuplicateNavigation from './components/DuplicateNavigation.vue';
import DuplicateDetails from './components/DuplicateDetails.vue';
import OriginFoldersSettings from './components/OriginFoldersSettings.vue';
import BulkDeletionSettings from './components/BulkDeletionSettings.vue';
import { fetchDuplicates } from '@/tools/api';
import { removeDuplicateFromList } from '@/tools/utils';
import Folder from 'vue-material-design-icons/Folder';
import Delete from 'vue-material-design-icons/Delete';

export default {
	name: 'DuplicateFinder',
	components: {
		NcAppContent,
		NcContent,
		NcLoadingIcon,
		DuplicateNavigation,
		DuplicateDetails,
		OriginFoldersSettings,
		BulkDeletionSettings,
		NcAppSettingsDialog,
		NcAppSettingsSection,
		Folder,
		Delete,
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
		};
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
			this.currentDuplicate = duplicate;
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
</style>