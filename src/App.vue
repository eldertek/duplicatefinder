<template>
	<NcContent app-name="duplicatefinder">
		<DuplicateNavigation v-if="acknowledgedDuplicates.length > 0 || unacknowledgedDuplicates.length > 0" :acknowledged-duplicates="acknowledgedDuplicates"
			:unacknowledged-duplicates="unacknowledgedDuplicates" @open-duplicate="openDuplicate" />
		<NcAppContent>
			<DuplicateDetails :duplicate="currentDuplicate"
			@lastFileDeleted="removeDuplicate(currentDuplicate)"/>
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
			// Go to next duplicate
			if (this.acknowledgedDuplicates.length > 0 && duplicate.acknowledged) {
				this.currentDuplicate = this.acknowledgedDuplicates[0];
			} else if (this.unacknowledgedDuplicates.length > 0) {
				this.currentDuplicate = this.unacknowledgedDuplicates[0];
			} else {
				this.currentDuplicate = null;
			}
		},
		async openDuplicate(duplicate) {
			this.currentDuplicate = duplicate;
		},
		async refreshDuplicates() {
			try {
				// Fetch unacknowledged duplicates
				const unacknowledgedData = await fetchDuplicates('unacknowledged', 5);
				this.unacknowledgedDuplicates = unacknowledgedData.entities;

				// Fetch acknowledged duplicates
				const acknowledgedData = await fetchDuplicates('acknowledged', 5);
				this.acknowledgedDuplicates = acknowledgedData.entities;
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
  