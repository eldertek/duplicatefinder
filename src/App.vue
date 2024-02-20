<template>
	<NcContent app-name="duplicatefinder">
		<DuplicateNavigation :acknowledged-duplicates="acknowledgedDuplicates"
			:unacknowledged-duplicates="unacknowledgedDuplicates" @open-duplicate="openDuplicate" />
		<NcAppContent>
			<DuplicateDetails v-if="currentDuplicate" :duplicate="currentDuplicate"
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
		},
		async openDuplicate(duplicate) {
			this.currentDuplicate = duplicate;
		},
		async refreshDuplicates() {
			try {
				// Fetch unacknowledged duplicates
				const unacknowledgedData = await fetchDuplicates('unacknowledged', 20);
				this.unacknowledgedDuplicates = unacknowledgedData.entities;

				// Fetch acknowledged duplicates
				const acknowledgedData = await fetchDuplicates('acknowledged', 20);
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
#app {
	max-width: 1200px;
	margin: 0 auto;
}

.empty-state {
	text-align: center;
	padding: 20px;
}
</style>
  