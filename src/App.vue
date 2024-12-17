<template>
	<NcContent app-name="duplicatefinder">
		<NcLoadingSpinner v-if="isLoading" />
		<template v-else>
			<DuplicateNavigation v-if="acknowledgedDuplicates.length > 0 || unacknowledgedDuplicates.length > 0"
				:acknowledged-duplicates="acknowledgedDuplicates" :unacknowledged-duplicates="unacknowledgedDuplicates"
				@open-duplicate="openDuplicate"
				@open-settings="settingsOpen = true" />
			<NcAppContent>
				<DuplicateDetails ref="duplicateDetails" :duplicate="currentDuplicate" @lastFileDeleted="removeDuplicate(currentDuplicate)"
					@duplicateUpdated="updateDuplicate(currentDuplicate)" />
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
			</NcAppSettingsDialog>
		</template>
	</NcContent>
</template>
  
  
<script>
import { NcAppContent, NcContent, NcLoadingSpinner, NcButton, NcAppSettingsDialog, NcAppSettingsSection } from '@nextcloud/vue';
import DuplicateNavigation from './components/DuplicateNavigation.vue';
import DuplicateDetails from './components/DuplicateDetails.vue';
import OriginFoldersSettings from './components/OriginFoldersSettings.vue';
import { fetchDuplicates } from '@/tools/api';
import { removeDuplicateFromList } from '@/tools/utils';
import Cog from 'vue-material-design-icons/Cog';
import Folder from 'vue-material-design-icons/Folder';

export default {
	name: 'DuplicateFinder',
	components: {
		NcAppContent,
		NcContent,
		NcLoadingSpinner,
		NcButton,
		DuplicateNavigation,
		DuplicateDetails,
		OriginFoldersSettings,
		NcAppSettingsDialog,
		NcAppSettingsSection,
		Cog,
		Folder,
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
		async removeDuplicate(duplicate) {
			removeDuplicateFromList(duplicate, this.acknowledgedDuplicates, this.unacknowledgedDuplicates);
			this.moveToNext(duplicate);
		},
		async updateDuplicate(duplicate) {
			this.moveToNext(duplicate);
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