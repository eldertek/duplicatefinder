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
			</NcAppContent>
		</template>
	</NcContent>
</template>
  
  
<script>
import { NcAppContent, NcContent, NcLoadingSpinner } from '@nextcloud/vue';
import DuplicateNavigation from './components/DuplicateNavigation.vue';
import DuplicateDetails from './components/DuplicateDetails.vue';
import { fetchDuplicates } from '@/tools/api';
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
			page: 1,
			limit: 50,
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
			this.isLoading = true;
			try {
				// Reload all duplicates if needed
				if (this.acknowledgedDuplicates.length < this.limit || this.unacknowledgedDuplicates.length < this.limit) {
					const allData = await fetchDuplicates('all', this.limit, this.page);
					this.acknowledgedDuplicates = allData.entities.filter(duplicate => duplicate.acknowledged);
					this.unacknowledgedDuplicates = allData.entities.filter(duplicate => !duplicate.acknowledged);
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
