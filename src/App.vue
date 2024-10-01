<template>
	<NcContent app-name="duplicatefinder">
		<NcLoadingSpinner v-if="isLoading" />
		<template v-else>
			<DuplicateNavigation v-if="acknowledgedDuplicates.length > 0 || unacknowledgedDuplicates.length > 0"
				:acknowledged-duplicates="acknowledgedDuplicates" :unacknowledged-duplicates="unacknowledgedDuplicates"
				@open-duplicate="openDuplicate" />
			<NcAppContent>
				<DuplicateDetails :duplicate="currentDuplicate" @lastFileDeleted="removeDuplicate(currentDuplicate)"
					@duplicateUpdated="updateDuplicate(currentDuplicate)" />
				<!-- Add a button for non-admin users to initiate a duplicate search -->
				<button v-if="!isAdmin" @click="initiateUserDuplicateSearch">{{ t('duplicatefinder', 'Find My Duplicates') }}</button>
			</NcAppContent>
		</template>
	</NcContent>
</template>
  
  
<script>
import { NcAppContent, NcContent, NcLoadingSpinner } from '@nextcloud/vue';
import DuplicateNavigation from './components/DuplicateNavigation.vue';
import DuplicateDetails from './components/DuplicateDetails.vue';
import { fetchDuplicates, initiateUserDuplicateSearch } from '@/tools/api';
import { removeDuplicateFromList } from '@/tools/utils';

export default {
	name: 'DuplicateFinder',
	components: {
		NcAppContent,
		NcContent,
		NcLoadingSpinner,
		DuplicateNavigation,
		DuplicateDetails,
	},
	data() {
		return {
			acknowledgedDuplicates: [],
			unacknowledgedDuplicates: [],
			currentDuplicate: null,
			isLoading: false,
			isAdmin: false, // Add a new data property to track if the user is an admin
		};
	},
	methods: {
		async removeDuplicate(duplicate) {
			await removeDuplicateFromList(duplicate, this.acknowledgedDuplicates, this.unacknowledgedDuplicates);
			await this.moveToNext(duplicate);
		},
		async updateDuplicate(duplicate) {
			await this.moveToNext(duplicate);
		},
		async moveToNext(duplicate) {
			let currentList = duplicate.acknowledged ? this.acknowledgedDuplicates : this.unacknowledgedDuplicates;
			this.currentDuplicate = currentList[0];
		},
		async openDuplicate(duplicate) {
			this.currentDuplicate = duplicate;
		},
		async refreshDuplicates() {
			try {
				// Reload all duplicates if needed
				if (this.acknowledgedDuplicates.length < 5 || this.unacknowledgedDuplicates.length < 5) {
					const allData = await fetchDuplicates('all', 50);
					this.acknowledgedDuplicates = allData.entities.filter(duplicate => duplicate.acknowledged);
					this.unacknowledgedDuplicates = allData.entities.filter(duplicate => !duplicate.acknowledged);
				}
			} finally {
				this.isLoading = false;
			}
		},
		async initiateUserDuplicateSearch() {
			try {
				await initiateUserDuplicateSearch();
				this.refreshDuplicates();
			} catch (error) {
				console.error('Error initiating user duplicate search:', error);
			}
		},
	},
	mounted() {
		// Fetch initial duplicates
		this.refreshDuplicates();
		// Check if the user is an admin
		this.isAdmin = OC.currentUser.isAdmin;
	}
}
</script>
  
<style>
.app-content {
	overflow-y: auto;
}
</style>
