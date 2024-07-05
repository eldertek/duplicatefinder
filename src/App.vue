<template>
	<NcContent app-name="duplicatefinder">
		<DuplicateNavigation v-if="acknowledgedDuplicates.length > 0 || unacknowledgedDuplicates.length > 0"
			:acknowledged-duplicates="acknowledgedDuplicates" :unacknowledged-duplicates="unacknowledgedDuplicates"
			@open-duplicate="openDuplicate" />
		<NcAppContent>
			<DuplicateDetails :duplicate="currentDuplicate" @lastFileDeleted="removeDuplicate(currentDuplicate)"
				@duplicateUpdated="updateDuplicate(currentDuplicate)" />
		</NcAppContent>
	</NcContent>
</template>
  
  
<script>
import { NcAppContent, NcContent } from '@nextcloud/vue';
import DuplicateNavigation from './components/DuplicateNavigation.vue';
import DuplicateDetails from './components/DuplicateDetails.vue';
import { fetchDuplicates } from '@/tools/api';
import { removeDuplicateFromList } from '@/tools/utils';

export default {
	name: 'DuplicateFinder',
	components: {
		NcAppContent,
		NcContent,
		DuplicateNavigation,
		DuplicateDetails,
	},
	data() {
		return {
			acknowledgedDuplicates: [],
			unacknowledgedDuplicates: [],
			currentDuplicate: null
		};
	},
	methods: {
		async removeDuplicate(duplicate) {
			await removeDuplicateFromList(duplicate, this.acknowledgedDuplicates, this.unacknowledgedDuplicates);
			await this.refreshDuplicates();
			await this.moveToNext(duplicate);
		},
		async updateDuplicate(duplicate) {
			await this.refreshDuplicates();
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
			} catch (error) {
				console.error('Failed to refresh duplicates:', error);
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
  