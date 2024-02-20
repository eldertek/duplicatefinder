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
			await this.moveToNext(duplicate, true);
		},
		async moveToNext(duplicate, forceNext = false) {
			// Determine the current list (acknowledged or unacknowledged) the duplicate belongs to
			let currentList = duplicate.acknowledged ? this.acknowledgedDuplicates : this.unacknowledgedDuplicates;
			let otherList = duplicate.acknowledged ? this.unacknowledgedDuplicates : this.acknowledgedDuplicates;

			// Find the index of the current duplicate in its list
			let currentIndex = currentList.findIndex(d => d.id === duplicate.id);

			// Logic to decide the next duplicate to display
			if (currentIndex >= 0) {
				// Remove the current duplicate from the list
				currentList.splice(currentIndex, 1);

				// If there's a next item in the same list, select it
				if (currentList.length > currentIndex) {
					this.currentDuplicate = currentList[currentIndex];
				} else if (currentList.length > 0) {
					// If we're at the end of the list, select the last item
					this.currentDuplicate = currentList[currentList.length - 1];
				} else if (forceNext && otherList.length > 0) {
					// If forceNext is true and the other list has items, select the first item from the other list
					this.currentDuplicate = otherList[0];
				} else {
					// If there are no duplicates left to display, clear the current selection
					this.currentDuplicate = null;
				}
			} else if (forceNext && otherList.length > 0) {
				// If the duplicate was not found in its expected list and forceNext is true,
				// select the first item from the other list
				this.currentDuplicate = otherList[0];
			} else {
				// In any other case, clear the current selection
				this.currentDuplicate = null;
			}
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
  