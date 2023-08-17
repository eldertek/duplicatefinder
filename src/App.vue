<template>
	<NcContent app-name="duplicatefinder">
		<NcAppNavigation v-if="duplicates.length > 0">
			<template #list>
				<NcAppNavigationItem v-for="duplicate in duplicates" :key="duplicate.id" :name="duplicate.hash"
					:class="{ active: currentDuplicateId === duplicate.id }" @click="openDuplicate(duplicate)">
					<template #icon>
						<div class="nav-thumbnail"
							:style="{ backgroundImage: 'url(' + getPreviewImage(duplicate.files[0]) + ')' }"></div>
					</template>
				</NcAppNavigationItem>
			</template>
		</NcAppNavigation>
		<NcAppContent>
			<div v-if="currentDuplicate && currentDuplicate.files.length > 0" class="summary-section">
				<p>{{ t('duplicatefinder',
					'Welcome, the current duplicate has {numberOfFiles} files, total size: {formattedSize}',
					{ numberOfFiles: numberOfFilesInCurrentDuplicate, formattedSize: formattedSizeOfCurrentDuplicate }) }}
				</p>
			</div>
			<div v-if="currentDuplicate && currentDuplicate.files.length > 0">
				<div class="file-display" v-for="(file, index) in currentDuplicate.files" :key="file.id">
					<div class="thumbnail" :style="{ backgroundImage: 'url(' + getPreviewImage(file) + ')' }"></div>
					<div class="file-details">
						<p><strong>{{ t('duplicatefinder', 'File') }} {{ index + 1 }}:</strong></p>
						<p><strong>{{ t('duplicatefinder', 'Hash:') }}</strong> {{ file.fileHash }}</p>
						<p><strong>{{ t('duplicatefinder', 'Path:') }}</strong> {{ file.path }}</p>
					</div>
					<button @click="deleteDuplicate(file)" class="delete-button">{{ t('duplicatefinder', 'Delete')
					}}</button>
				</div>
			</div>
			<div v-else id="emptycontent">
				<div class="icon-file" />
				<h2>{{ t('duplicatefinder', 'No duplicates found or no duplicate selected.') }}</h2>
			</div>
		</NcAppContent>
	</NcContent>
</template>

<script>

import { NcAppContent, NcAppNavigation, NcAppNavigationItem, NcContent } from '@nextcloud/vue'

import { generateUrl } from '@nextcloud/router'
import { showError, showSuccess } from '@nextcloud/dialogs'
import axios from '@nextcloud/axios'

export default {
	name: 'App',
	components: {
		NcAppContent,
		NcAppNavigation,
		NcAppNavigationItem,
		NcContent
	},
	data() {
		return {
			duplicates: [],
			currentDuplicateId: null,
			updating: false,
			loading: true,

			groupedResult: {
				groupedItems: [],
				totalSize: 0,
				itemCount: 0,
				uniqueTotalSize: 0
			},

		}
	},
	computed: {
		currentDuplicate() {
			if (this.currentDuplicateId === null) {
				return null;
			}
			return this.duplicates.find((duplicate) => duplicate.id === this.currentDuplicateId);
		},
		sizeOfCurrentDuplicate() {
			if (!this.currentDuplicate) {
				return 0;
			}
			return this.currentDuplicate.files.reduce((acc, file) => acc + file.size, 0);
		},
		numberOfFilesInCurrentDuplicate() {
			if (!this.currentDuplicate) {
				return 0;
			}
			return this.currentDuplicate.files.length;
		},
		formattedSizeOfCurrentDuplicate() {
			return OC.Util.humanFileSize(this.sizeOfCurrentDuplicate);
		}
	},
	async mounted() {
		try {
			const response = await axios.get(generateUrl('/apps/duplicatefinder/api/v1/duplicates'))
			this.duplicates = response.data.data.entities

			// Automatically set the currentDuplicateId to the ID of the first duplicate
			if (this.duplicates.length > 0) {
				this.currentDuplicateId = this.duplicates[0].id
			}

		} catch (e) {
			console.error(e)
			showError(t('duplicatefinder', 'Could not fetch duplicates'))
		}
		this.loading = false
	},
	methods: {
		getPreviewImage(item) {
			if (this.isImage(item) || this.isVideo(item)) {
				const query = new URLSearchParams({
					file: this.normalizeItemPath(item.path),
					fileId: item.nodeId,
					x: 500,
					y: 500,
					forceIcon: 0
				});
				return OC.generateUrl('/core/preview.png?') + query.toString();
			}

			return OC.MimeType.getIconUrl(item.mimetype);
		},
		isImage(item) {
			return item.mimetype.substr(0, item.mimetype.indexOf('/')) === 'image';
		},
		isVideo(item) {
			return item.mimetype.substr(0, item.mimetype.indexOf('/')) === 'video';
		},
		normalizeItemPath(path) {
			return path.match(/\/([^/]*)\/files(\/.*)/)[2];
		},
		openDuplicate(duplicate) {
			this.currentDuplicateId = duplicate.id
		},
		async deleteDuplicate(item) {
			const fileClient = OC.Files.getClient();
			try {
				await fileClient.remove(this.normalizeItemPath(item.path));
				showSuccess(t('duplicatefinder', 'Duplicate deleted'));

				// Remove the deleted item from the duplicates list in the UI
				const index = this.currentDuplicate.files.findIndex(file => file.id === item.id);
				if (index !== -1) {
					this.currentDuplicate.files.splice(index, 1);
				}

				// Check if only one file remains for the current hash
				if (this.currentDuplicate.files.length === 1) {
					const duplicateIndex = this.duplicates.findIndex(duplicate => duplicate.id === this.currentDuplicateId);

					// Remove the hash from the navigation bar
					this.duplicates.splice(duplicateIndex, 1);

					// Switch to the next hash
					if (this.duplicates[duplicateIndex]) {
						this.openDuplicate(this.duplicates[duplicateIndex]);
					} else if (this.duplicates[duplicateIndex - 1]) { // If current hash was the last, switch to the previous
						this.openDuplicate(this.duplicates[duplicateIndex - 1]);
					} else {
						this.currentDuplicateId = null; // If no more hashes are left
					}
				}

			} catch (e) {
				console.error(e);
				showError(t('duplicatefinder', `Could not delete the duplicate at path: ${item.path}`));
			}
		}
	},
}

</script>

<style scoped>
.app-content {
	overflow-y: auto;
}

#app-content>div {
	width: 100%;
	height: 100%;
	padding: 20px;
	display: flex;
	flex-direction: column;
	flex-grow: 1;
}

.file-display {
	width: calc(100% - 20px);
	;
	display: flex;
	align-items: center;
	margin-bottom: 10px;
	margin-left: 10px;
	margin-right: 10px;
	border: 1px solid #e0e0e0;
	padding: 10px;
	border-radius: 5px;
}

.file-display p {
	white-space: nowrap;
	text-overflow: ellipsis;
	overflow: hidden;
}

.file-details {
	flex-grow: 1;
	overflow: hidden;
}

.thumbnail {
	width: 80px;
	height: 80px;
	background-size: cover;
	background-position: center;
	margin-right: 20px;
	border-radius: 5px;
	flex-shrink: 0;
}

.nav-thumbnail {
	width: 20px;
	height: 20px;
	background-size: cover;
	background-position: center;
	border-radius: 4px;
}

.delete-button {
	background-color: #ff4b5a;
	color: #fff;
	border: none;
	padding: 5px 10px;
	border-radius: 5px;
	cursor: pointer;
	transition: background-color 0.3s;
	margin-left: 10px;
}

.delete-button:hover {
	background-color: #e43f51;
}

.summary-section {
	margin-top: 50px;
	margin-bottom: 20px;
	padding: 10px;
	border-radius: 5px;
	font-weight: bold;
	text-align: center;
}

/* Responsive adjustments */
@media (max-width: 600px) {
	.delete-button {
		padding: 3px 7px;
		font-size: 12px;
	}
}

@media (max-width: 600px) {
	.thumbnail {
		width: 50px;
		height: 50px;
		margin-right: 10px;
	}

	.file-details p {
		font-size: 14px;
	}
}
</style>
