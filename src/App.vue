<template>
	<NcContent app-name="duplicatefinder">
		<NcAppNavigation v-if="(acknowledgedDuplicates.length > 0 || unacknowledgedDuplicates.length > 0) && !loading">
			<template #list>
				<NcAppNavigationItem name="Uncknowledged" :allowCollapse="true" :open="true">
					<template #icon>
						<CloseCircle :size="20" />
					</template>
					<template>
						<NcAppNavigationItem v-for="duplicate in unacknowledgedDuplicates" :key="duplicate.id"
							:name="duplicate.hash" :class="{ active: currentDuplicateId === duplicate.id }"
							@click="openDuplicate(duplicate)">
							<template #icon>
								<div class="nav-thumbnail"
									:style="{ backgroundImage: 'url(' + getPreviewImage(duplicate.files[0]) + ')' }"></div>
							</template>
						</NcAppNavigationItem>
					</template>
				</NcAppNavigationItem>
				<NcAppNavigationItem name="Acknowledged" :allowCollapse="true" :open="false">
					<template #icon>
						<CheckCircle :size="20" />
					</template>
					<template>
						<NcAppNavigationItem v-for="duplicate in acknowledgedDuplicates" :key="duplicate.id"
							:name="duplicate.hash" :class="{ active: currentDuplicateId === duplicate.id }"
							@click="openDuplicate(duplicate)">
							<template #icon>
								<div class="nav-thumbnail"
									:style="{ backgroundImage: 'url(' + getPreviewImage(duplicate.files[0]) + ')' }"></div>
							</template>
						</NcAppNavigationItem>
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
				<a v-if="currentDuplicate.files.length > 0" class="preview-link" :href="getPreviewUrl(currentDuplicate.files[0])"
					target="_blank">
					{{ t('duplicatefinder', 'Show Preview') }}
				</a>
				<a v-if="isAcknowledged(currentDuplicate)" class="acknowledge-link" @click="unacknowledgeDuplicate"
					href="#">
					{{ t('duplicatefinder', 'Unacknowledge it') }}
				</a>
				<a v-else class="acknowledge-link" @click="acknowledgeDuplicate" href="#">
					{{ t('duplicatefinder', 'Acknowledge it') }}
				</a>
			</div>
			<div v-if="currentDuplicate && currentDuplicate.files.length > 0">
				<div class="file-display" v-for="(file, index) in currentDuplicate.files" :key="file.id">
					<div class="file-info-container">
						<div class="thumbnail" :style="{ backgroundImage: 'url(' + getPreviewImage(file) + ')' }"></div>
						<div class="file-details">
							<p><strong>{{ t('duplicatefinder', 'File') }} {{ index + 1 }}</strong></p>
							<p><strong>{{ t('duplicatefinder', 'Hash:') }}</strong> {{ file.fileHash }}</p>
							<p><strong>{{ t('duplicatefinder', 'Path:') }}</strong> {{ normalizeItemPath(file.path) }}</p>
						</div>
					</div>
					<button @click="deleteDuplicate(file)" class="delete-button">{{ t('duplicatefinder', 'Delete')
					}}</button>
				</div>
			</div>
			<div v-else id="emptycontent">
				<div class="icon-file" />
				<div v-if="loading">
					<h2>{{ t('duplicatefinder', 'Fetching duplicates') }} {{ loadingDots }}</h2>
				</div>
				<div v-else>
					<h2>{{ t('duplicatefinder', 'No duplicates found or no duplicate selected.') }}</h2>
				</div>
			</div>
		</NcAppContent>
	</NcContent>
</template>

<script>

import { NcAppContent, NcContent } from '@nextcloud/vue'

import { generateUrl } from '@nextcloud/router'
import { showError, showSuccess } from '@nextcloud/dialogs'
import axios from '@nextcloud/axios'

import CheckCircle from 'vue-material-design-icons/CheckCircle'
import CloseCircle from 'vue-material-design-icons/CloseCircle'

export default {
	name: 'App',
	components: {
		NcAppContent,
		NcContent,
		CheckCircle,
		CloseCircle,
		NcAppNavigation: () => import('@nextcloud/vue').then(m => m.NcAppNavigation),
		NcAppNavigationItem: () => import('@nextcloud/vue').then(m => m.NcAppNavigationItem),
	},
	data() {
		return {
			acknowledgedDuplicates: [],
			unacknowledgedDuplicates: [],
			currentPageAcknowledged: 1,
			currentPageUnacknowledged: 1,

			currentDuplicateId: null,
			updating: false,
			loading: true,
			loadingDots: '',
			loadingInterval: null,

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
			// Check in acknowledgedDuplicates
			const duplicate = this.acknowledgedDuplicates.find(dup => dup.id === this.currentDuplicateId);
			if (duplicate) return duplicate;

			// Check in unacknowledgedDuplicates
			return this.unacknowledgedDuplicates.find(dup => dup.id === this.currentDuplicateId);
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
		this.startLoadingAnimation();
		this.fetchAllPages('acknowledged');
		this.fetchAllPages('unacknowledged');
		this.stopLoadingAnimation();
	},
	methods: {
		startLoadingAnimation() {
			this.loadingDots = '';
			this.loadingInterval = setInterval(() => {
				this.loadingDots += '.';
				if (this.loadingDots.length > 3) {
					this.loadingDots = '';
				}
			}, 500); // Change dot every 500ms
		},
		stopLoadingAnimation() {
			clearInterval(this.loadingInterval);
			this.loadingDots = ''; // Reset loading dots
		},


		async fetchAllPages(type) {
			let currentPage = 1;
			let url;
			this.loading = true;

			do {
				if (type === 'acknowledged') {
					url = generateUrl(`/apps/duplicatefinder/api/duplicates/acknowledged?page=${currentPage}`);
				} else if (type === 'unacknowledged') {
					url = generateUrl(`/apps/duplicatefinder/api/duplicates/unacknowledged?page=${currentPage}`);
				} else {
					console.error('Invalid type');
					showError(t('duplicatefinder', 'Could not fetch duplicates'));
					return;
				}

				try {
					const response = await axios.get(url);
					const newDuplicates = response.data.entities;
					const pagination = response.data.pagination;

					if (type === 'acknowledged') {
						this.acknowledgedDuplicates = [...this.acknowledgedDuplicates, ...newDuplicates];
						this.totalPagesAcknowledged = pagination.totalPages;
					} else {
						this.unacknowledgedDuplicates = [...this.unacknowledgedDuplicates, ...newDuplicates];
						this.totalPagesUnacknowledged = pagination.totalPages;
					}

					currentPage++;
				} catch (e) {
					console.error(e);
					showError(t('duplicatefinder', `Could not fetch ${type} duplicates`));
					this.loading = false;
					return;
				}
			} while (currentPage <= this[`totalPages${type.charAt(0).toUpperCase() + type.slice(1)}`]);

			this.loading = false;
		},

		async acknowledgeDuplicate() {
			try {
				const hash = this.currentDuplicate.hash;
				await axios.post(generateUrl(`/apps/duplicatefinder/api/duplicates/acknowledge/${hash}`));

				showSuccess(t('duplicatefinder', 'Duplicate acknowledged successfully'));

				// Move the duplicate from the  unacknowledgedlist to the acknowledged list
				const index = this.unacknowledgedDuplicates.findIndex(dup => dup.id === this.currentDuplicateId);
				const [removedItem] = this.unacknowledgedDuplicates.splice(index, 1);
				this.acknowledgedDuplicates.push(removedItem);

				// Switch to the next unacknowledged duplicate in the list
				if (this.unacknowledgedDuplicates[index]) {
					this.openDuplicate(this.unacknowledgedDuplicates[index]);
				} else {
					// If no more duplicates are left in the unacknowledged list
					this.currentDuplicateId = null;
				}
			} catch (e) {
				console.error(e);
				showError(t('duplicatefinder', 'Could not acknowledge the duplicate'));
			}
		},
		async unacknowledgeDuplicate() {
			try {
				const hash = this.currentDuplicate.hash;
				await axios.post(generateUrl(`/apps/duplicatefinder/api/duplicates/unacknowledge/${hash}`));

				showSuccess(t('duplicatefinder', 'Duplicate unacknowledged successfully'));

				// Move the duplicate from the acknowledged list to the unacknowledged list
				const index = this.acknowledgedDuplicates.findIndex(dup => dup.id === this.currentDuplicateId);
				const [removedItem] = this.acknowledgedDuplicates.splice(index, 1);
				this.unacknowledgedDuplicates.push(removedItem);

			} catch (e) {
				console.error(e);
				showError(t('duplicatefinder', 'Could not unacknowledge the duplicate'));
			}
		},
		isAcknowledged(duplicate) {
			return this.acknowledgedDuplicates.some(dup => dup.id === duplicate.id);
		},
		getPreviewUrl(item) {
			const itemPath = this.normalizeItemPath(item.path);
			// Use the Nextcloud OC object to generate a webDAV URL
			return OC.generateUrl('/remote.php/webdav/') + encodeURIComponent(itemPath);
		},
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

				// Determine which list the current duplicate belongs to
				let currentList = null;
				if (this.unacknowledgedDuplicates.some(dup => dup.id === this.currentDuplicateId)) {
					currentList = this.unacknowledgedDuplicates;
				} else if (this.acknowledgedDuplicates.some(dup => dup.id === this.currentDuplicateId)) {
					currentList = this.acknowledgedDuplicates;
				}

				// If only one file remains for the current hash, remove the hash
				if (this.currentDuplicate.files.length === 1 && currentList) {
					const duplicateIndex = currentList.findIndex(dup => dup.id === this.currentDuplicateId);

					// Remove the hash from the navigation bar
					currentList.splice(duplicateIndex, 1);

					// Switch to the next hash in the same list
					if (currentList[duplicateIndex]) {
						this.openDuplicate(currentList[duplicateIndex]);
					} else if (currentList[duplicateIndex - 1]) { // If current hash was the last, switch to the previous
						this.openDuplicate(currentList[duplicateIndex - 1]);
					} else {
						this.currentDuplicateId = null; // If no more hashes are left in the current list
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

.file-info-container {
	display: flex;
	align-items: center;
}

.file-display {
	width: calc(100% - 20px);
	display: flex;
	align-items: center;
	margin-bottom: 10px;
	margin-left: 10px;
	margin-right: 10px;
	border: 1px solid #e0e0e0;
	padding: 10px;
	border-radius: 5px;
	position: relative;
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

/* Desktop styles */
@media (min-width: 801px) {
	.delete-button {
		position: absolute;
		right: 10px;
		top: 50%;
		transform: translateY(-50%);
		margin-left: 0;
		/* <-- reset margin for desktop */
	}
}

/* Mobile stles */
@media (max-width: 800px) {
	.file-display {
		flex-direction: column;
		align-items: center;
	}

	.file-info-container {
		display: flex;
		width: 100%;
		align-items: center;
		margin-bottom: 10px;
		justify-content: space-between;
	}

	.thumbnail {
		margin-right: 20px;
		margin-bottom: 0;
		flex-shrink: 0;
	}

	.file-details {
		flex-grow: 1;
		width: calc(100% - 100px);
	}

	.file-details p {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 90%;
	}

	.delete-button {
		width: 100%;
		margin-left: 0;
		margin-right: 0;
		padding: 3px 7px;
		font-size: 12px;
		margin-top: 10px;
	}
}

.acknowledge-link {
	color: #007BFF; /* Blue color */
	text-decoration: none;
	transition: color 0.3s ease;
}

.acknowledge-link:hover {
	color: #0056b3; /* Darker blue on hover */
}

.preview-link {
    color: #28a745; /* Green color */
    text-decoration: none;
    transition: color 0.3s ease;
}

.preview-link:hover {
    color: #1e7e34; /* Darker green on hover */
}

</style>