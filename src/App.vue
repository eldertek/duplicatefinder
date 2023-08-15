<template>
    <div id="content" class="app-duplicatefinder">
        <AppNavigation>
            <ul>
                <AppNavigationItem v-for="duplicate in duplicates"
                    :key="duplicate.id"
                    :title="duplicate.hash"
                    :class="{active: currentDuplicateId === duplicate.id}"
                    @click="openDuplicate(duplicate)">
                </AppNavigationItem>
            </ul>
        </AppNavigation>
        <AppContent>
            <div v-if="currentDuplicate && currentDuplicate.files.length > 0">
                <div class="file-display" v-for="(file, index) in currentDuplicate.files" :key="file.id">
                    <p>File {{ index + 1 }}:</p>
                    <p>Hash: {{ file.fileHash }}</p>
                    <p>Path: {{ file.path }}</p>
                </div>
            </div>
            <div v-else id="emptycontent">
                <div class="icon-file" />
                <h2>{{ t('duplicatefinder', 'No duplicates found or no duplicate selected.') }}</h2>
            </div>
        </AppContent>
    </div>
</template>

<script>
import ActionButton from '@nextcloud/vue/dist/Components/ActionButton'
import AppContent from '@nextcloud/vue/dist/Components/AppContent'
import AppNavigation from '@nextcloud/vue/dist/Components/AppNavigation'
import AppNavigationItem from '@nextcloud/vue/dist/Components/AppNavigationItem'

import '@nextcloud/dialogs/styles/toast.scss'
import { generateUrl } from '@nextcloud/router'
import { showError, showSuccess } from '@nextcloud/dialogs'
import axios from '@nextcloud/axios'

export default {
	name: 'App',
	components: {
		ActionButton,
		AppContent,
		AppNavigation,
		AppNavigationItem,
	},
	data() {
		return {
			duplicates: [],
			currentDuplicateId: null,
			updating: false,
			loading: true,
		}
	},
	computed: {
		currentDuplicate() {
			if (this.currentDuplicateId === null) {
				return null
			}
			return this.duplicates.find((duplicate) => duplicate.id === this.currentDuplicateId)
		},
	},
	async mounted() {
		try {
			const response = await axios.get(generateUrl('/apps/duplicatefinder/api/v1/duplicates'))
			this.duplicates = response.data.data.entities
		} catch (e) {
			console.error(e)
			showError(t('duplicatefinder', 'Could not fetch duplicates'))
		}
		this.loading = false
	},
	methods: {
		openDuplicate(duplicate) {
			this.currentDuplicateId = duplicate.id
		},
		async deleteDuplicate(duplicate) {
			try {
				await axios.delete(generateUrl(`/apps/duplicatefinder/api/v1/duplicates/${duplicate.id}`))
				this.duplicates.splice(this.duplicates.indexOf(duplicate), 1)
				if (this.currentDuplicateId === duplicate.id) {
					this.currentDuplicateId = null
				}
				showSuccess(t('duplicatefinder', 'Duplicate deleted'))
			} catch (e) {
				console.error(e)
				showError(t('duplicatefinder', 'Could not delete the duplicate'))
			}
		},
	},
}
</script>

<style scoped>
	#app-content > div {
		width: 100%;
		height: 100%;
		padding: 20px;
		display: flex;
		flex-direction: column;
		flex-grow: 1;
	}

	input[type='text'] {
		width: 100%;
	}

	textarea {
		flex-grow: 1;
		width: 100%;
	}

    .file-display {
        width: 50%;
        float: left;
        padding: 20px;
        box-sizing: border-box;
    }
</style>