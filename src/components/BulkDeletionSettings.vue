<template>
	<div class="bulk-deletion">
		<div v-if="!previewResults" class="bulk-deletion__content">
			<div class="summary-section">
				<NcEmptyContent
					:title="t('duplicatefinder', 'Bulk delete duplicates')"
					:description="t('duplicatefinder', 'Preview and delete multiple duplicates at once while preserving files in protected folders.')"
					:icon="'icon-delete'">
					<template #action>
						<div class="summary-actions">
							<NcActions :menu-name="minSizeButtonLabel" :disabled="isLoading">
								<template #icon>
									<ChevronDown :size="20" />
								</template>
								<NcActionButton
									v-for="preset in minSizePresets"
									:key="preset.bytes"
									@click="setMinSizeBytes(preset.bytes, false)">
									{{ preset.label }}
								</NcActionButton>
							</NcActions>
							<NcButton type="primary" :disabled="isLoading || isScanningEmptyFolders || isScanningDuplicateFolders || isDeletingDuplicateFolder" @click="performDryRun">
								<template #icon>
									<NcLoadingIcon v-if="isLoading" />
								</template>
								{{ t('duplicatefinder', 'Start preview') }}
							</NcButton>
							<NcButton type="secondary"
								class="scan-duplicate-folders-button"
								:disabled="isLoading || isScanningEmptyFolders || isScanningDuplicateFolders || isDeletingDuplicateFolder"
								@click="scanDuplicateFolders">
								<template #icon>
									<NcLoadingIcon v-if="isScanningDuplicateFolders" />
								</template>
								{{ t('duplicatefinder', 'Scan duplicate folders') }}
							</NcButton>
							<NcButton type="secondary"
								class="scan-empty-folders-button"
								:disabled="isLoading || isScanningEmptyFolders || isScanningDuplicateFolders || isDeletingDuplicateFolder"
								@click="runEmptyFolderScan([])">
								<template #icon>
									<NcLoadingIcon v-if="isScanningEmptyFolders" />
								</template>
								{{ t('duplicatefinder', 'Scan empty folders') }}
							</NcButton>
						</div>
					</template>
				</NcEmptyContent>
			</div>

			<div v-if="duplicateFoldersScanCompleted" class="duplicate-folders-section">
				<div class="empty-folders-header">
					<div>
						<h3>{{ t('duplicatefinder', 'Duplicate folders ({count})', { count: duplicateFolderGroups.length }) }}</h3>
						<p class="merge-explanation">
							{{ duplicateFolderGroups.length > 0
								? t('duplicatefinder', 'Folders with 100% identical file trees. Keep one folder to delete matching copies from the others. Protected origin folders and Live Photos remain protected.')
								: t('duplicatefinder', 'No identical duplicate folders were found.') }}
						</p>
					</div>
					<div class="empty-folders-actions">
						<NcButton type="tertiary"
							class="dismiss-duplicate-folders-button"
							:disabled="isDeletingDuplicateFolder"
							@click="dismissDuplicateFoldersPanel">
							{{ t('duplicatefinder', 'Dismiss') }}
						</NcButton>
					</div>
				</div>

				<div v-if="duplicateFolderGroups.length > 0" class="post-cleanup-option duplicate-folders-empty-option">
					<NcCheckboxRadioSwitch
						:checked="detectEmptyFoldersAfterDelete"
						type="checkbox"
						@update:checked="detectEmptyFoldersAfterDelete = !detectEmptyFoldersAfterDelete">
						{{ t('duplicatefinder', 'Detect empty folders after deleting selected duplicates') }}
					</NcCheckboxRadioSwitch>
				</div>

				<div v-if="duplicateFolderGroups.length > 0" class="duplicate-folders-list">
					<div v-for="group in duplicateFolderGroups" :key="group.signature" class="duplicate-group duplicate-folder-group">
						<div class="group-header">
							<span class="group-title">
								{{ t('duplicatefinder', 'Identical folder group') }}
								<span class="group-stats">
									({{ t('duplicatefinder', '{files} files, {size} per folder, {reclaimable} reclaimable', {
										files: group.fileCount,
										size: formatBytes(group.totalSize),
										reclaimable: formatBytes(group.reclaimableSize)
									}) }})
								</span>
							</span>
						</div>
						<div class="duplicate-folder-rows">
							<div
								v-for="folder in getDuplicateGroupFolderDetails(group)"
								:key="folder.path"
								class="file-display duplicate-folder-row"
								:class="{ 'is-protected': folder.isProtected }">
								<div class="file-info duplicate-folder-info" :title="folder.path">
									<span class="file-path-label">{{ folder.path }}</span>
									<span v-if="folder.isProtected" class="origin-badge">
										{{ t('duplicatefinder', 'Protected') }}
									</span>
								</div>
								<NcButton
									type="secondary"
									class="keep-duplicate-folder-button"
									:disabled="isDeletingDuplicateFolder || !canKeepDuplicateFolder(group, folder.path)"
									@click="keepDuplicateFolder(group, folder.path)">
									<template #icon>
										<NcLoadingIcon v-if="isDeletingDuplicateFolder && activeKeptDuplicateFolder === folder.path" />
									</template>
									{{ t('duplicatefinder', 'Keep this folder') }}
								</NcButton>
							</div>
						</div>
					</div>
				</div>
			</div>

			<div v-if="emptyFolderScanCompleted" class="empty-folders-section">
				<div class="empty-folders-header">
					<div>
						<h3>{{ t('duplicatefinder', 'Empty folders ({count})', { count: emptyFolders.length }) }}</h3>
						<p class="merge-explanation">
							{{ t('duplicatefinder', 'Protected origin folders, excluded folders, and external mounts are automatically skipped.') }}
						</p>
					</div>
					<div class="empty-folders-actions">
						<NcButton v-if="activeEmptyFolders.length > 0" type="tertiary" @click="toggleSelectAllEmptyFolders">
							{{ isAllEmptyFoldersSelected ? t('duplicatefinder', 'Unselect all') : t('duplicatefinder', 'Select all') }}
						</NcButton>
						<NcButton
							v-if="selectedEmptyFolders.length > 0"
							type="secondary"
							class="ignore-empty-folders-button"
							:disabled="isScanningEmptyFolders || isDeletingEmptyFolders"
							@click="ignoreSelectedEmptyFolders">
							{{ t('duplicatefinder', 'Ignore selected ({count})', { count: selectedEmptyFolders.length }) }}
						</NcButton>
						<NcButton
							v-if="ignoredEmptyFoldersCount > 0"
							type="tertiary"
							class="toggle-ignored-folders-button"
							:disabled="isScanningEmptyFolders || isDeletingEmptyFolders"
							@click="showIgnoredEmptyFolders = !showIgnoredEmptyFolders">
							{{ showIgnoredEmptyFolders
								? t('duplicatefinder', 'Hide ignored ({count})', { count: ignoredEmptyFoldersCount })
								: t('duplicatefinder', 'Show ignored ({count})', { count: ignoredEmptyFoldersCount }) }}
						</NcButton>
						<NcButton
							v-if="ignoredEmptyFoldersCount > 0 || ignoredEmptyFolders.length > 0"
							type="tertiary"
							class="reset-ignored-folders-button"
							:disabled="isScanningEmptyFolders || isDeletingEmptyFolders"
							@click="resetIgnoredEmptyFolders">
							{{ t('duplicatefinder', 'Restore all') }}
						</NcButton>
						<NcButton v-if="emptyFolderScanWasScoped"
							type="secondary"
							:disabled="isScanningEmptyFolders || isDeletingEmptyFolders"
							@click="runEmptyFolderScan([])">
							{{ t('duplicatefinder', 'Scan all folders') }}
						</NcButton>
						<NcButton type="tertiary" :disabled="isDeletingEmptyFolders" @click="dismissEmptyFolderPanel">
							{{ t('duplicatefinder', 'Dismiss') }}
						</NcButton>
						<NcButton
							v-if="emptyFolders.length > 0"
							type="error"
							class="delete-empty-folders-button"
							:disabled="isDeletingEmptyFolders || selectedEmptyFolders.length === 0"
							@click="confirmDeleteEmptyFolders">
							<template #icon>
								<NcLoadingIcon v-if="isDeletingEmptyFolders" />
							</template>
							{{ t('duplicatefinder', 'Delete selected empty folders ({count})', { count: selectedEmptyFolders.length }) }}
						</NcButton>
					</div>
				</div>

				<div v-if="visibleEmptyFolders.length > 0" class="empty-folders-list">
					<div
						v-for="folder in visibleEmptyFolders"
						:key="folder.path"
						class="file-display empty-folder-item"
						:class="{
							'is-selected': isEmptyFolderSelected(folder.path),
							'is-ignored': isEmptyFolderIgnored(folder.path)
						}">
						<input
							type="checkbox"
							class="empty-folder-checkbox"
							:checked="isEmptyFolderSelected(folder.path)"
							:disabled="isEmptyFolderIgnored(folder.path)"
							@change="toggleEmptyFolder(folder.path)">
						<svg
							class="empty-folder-row-icon"
							xmlns="http://www.w3.org/2000/svg"
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.8"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true">
							<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
						</svg>
						<div
							class="file-info empty-folder-info"
							:title="folder.path"
							@click="!isEmptyFolderIgnored(folder.path) && toggleEmptyFolder(folder.path)">
							<span class="file-path-label">{{ folder.path }}</span>
							<span v-if="folder.hasEmptySubfolders" class="file-size">
								{{ t('duplicatefinder', 'Includes empty subfolders') }}
							</span>
						</div>
						<button
							type="button"
							class="empty-folder-ignore-button"
							:class="{ 'is-ignored': isEmptyFolderIgnored(folder.path) }"
							:title="isEmptyFolderIgnored(folder.path)
								? t('duplicatefinder', 'Restore folder to cleanup list')
								: t('duplicatefinder', 'Ignore folder in future scans')"
							:aria-label="isEmptyFolderIgnored(folder.path)
								? t('duplicatefinder', 'Restore folder to cleanup list')
								: t('duplicatefinder', 'Ignore folder in future scans')"
							@click.stop="toggleIgnoreEmptyFolder(folder.path)">
							<svg
								v-if="!isEmptyFolderIgnored(folder.path)"
								class="eye-icon eye-icon--visible"
								xmlns="http://www.w3.org/2000/svg"
								width="18"
								height="18"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true">
								<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
								<circle cx="12" cy="12" r="3" />
							</svg>
							<svg
								v-else
								class="eye-icon eye-icon--hidden"
								xmlns="http://www.w3.org/2000/svg"
								width="18"
								height="18"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true">
								<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
								<line x1="1"
									y1="1"
									x2="23"
									y2="23" />
							</svg>
						</button>
					</div>
				</div>
				<p v-else-if="emptyFolders.length > 0 && visibleEmptyFolders.length === 0" class="empty-folders-none">
					{{ t('duplicatefinder', 'All detected empty folders are currently ignored ({count}).', { count: ignoredEmptyFoldersCount }) }}
				</p>
				<p v-else class="empty-folders-none">
					{{ t('duplicatefinder', 'No empty folders were found.') }}
				</p>
			</div>
		</div>

		<div v-else class="bulk-deletion__content">
			<div class="summary-section">
				<template v-if="hasDuplicatesToDelete">
					<p>
						{{ t('duplicatefinder',
							'Total files to delete: {count}, Space that will be freed: {size}',
							{ count: totalFilesToDelete, size: formatBytes(totalSpaceFreed) }) }}
					</p>
					<div v-if="isLoading" class="loading-info">
						{{ t('duplicatefinder', 'Loading page {current} of {total}…',
							{ current: currentPage, total: previewResults.pagination.totalPages }) }}
					</div>
					<div class="summary-actions">
						<NcActions :menu-name="sortButtonLabel" :disabled="isLoading">
							<template #icon>
								<ChevronDown :size="20" />
							</template>
							<NcActionButton :model-value="sortOption === 'none'"
								@click="setSortOption('none')">
								{{ t('duplicatefinder', 'Default order') }}
							</NcActionButton>
							<NcActionButton :model-value="sortOption === 'size-desc'"
								@click="setSortOption('size-desc')">
								{{ t('duplicatefinder', 'Size (largest first)') }}
							</NcActionButton>
							<NcActionButton :model-value="sortOption === 'size-asc'"
								@click="setSortOption('size-asc')">
								{{ t('duplicatefinder', 'Size (smallest first)') }}
							</NcActionButton>
						</NcActions>
						<NcActions :menu-name="minSizeButtonLabel" :disabled="isLoading">
							<template #icon>
								<ChevronDown :size="20" />
							</template>
							<NcActionButton
								v-for="preset in minSizePresets"
								:key="preset.bytes"
								@click="setMinSizeBytes(preset.bytes, true)">
								{{ preset.label }}
							</NcActionButton>
						</NcActions>
						<NcButton type="tertiary" @click="toggleSelectAll">
							{{ isAllSelected ? t('duplicatefinder', 'Unselect all') : t('duplicatefinder', 'Select all') }}
						</NcButton>
						<NcActions :menu-name="t('duplicatefinder', 'Smart select')" :disabled="isLoading">
							<template #icon>
								<ChevronDown :size="20" />
							</template>
							<NcActionButton @click="selectAllExcept('first')">
								{{ t('duplicatefinder', 'Select all except first file of each group') }}
							</NcActionButton>
							<NcActionButton @click="selectAllExcept('last')">
								{{ t('duplicatefinder', 'Select all except last file of each group') }}
							</NcActionButton>
						</NcActions>
						<NcActions
							v-if="availableKeepFolders.length > 0"
							:menu-name="t('duplicatefinder', 'Keep folder')"
							:disabled="isLoading">
							<template #icon>
								<ChevronDown :size="20" />
							</template>
							<NcActionButton
								v-for="item in availableKeepFolders"
								:key="item.folder"
								:title="item.folder"
								@click="keepFolderAcrossGroups(item.folder)">
								{{ t('duplicatefinder', 'Keep {folder} ({count} groups)', { folder: item.folder, count: item.groupCount }) }}
							</NcActionButton>
						</NcActions>
						<NcButton
							type="error"
							class="delete-selected-files-button"
							:disabled="isLoading || !hasSelectedFiles"
							@click="confirmBulkDelete">
							<template #icon>
								<NcLoadingIcon v-if="isLoading" />
							</template>
							{{ t('duplicatefinder', 'Delete selected files') }}
						</NcButton>
					</div>
					<div class="post-cleanup-option">
						<NcCheckboxRadioSwitch
							:checked="detectEmptyFoldersAfterDelete"
							type="checkbox"
							@update:checked="detectEmptyFoldersAfterDelete = !detectEmptyFoldersAfterDelete">
							{{ t('duplicatefinder', 'Detect empty folders after deleting selected duplicates') }}
						</NcCheckboxRadioSwitch>
					</div>
				</template>
				<template v-else>
					<NcEmptyContent
						:title="t('duplicatefinder', 'No duplicates found')"
						:description="t('duplicatefinder', 'No duplicate files were found that can be deleted. This could be because there are no duplicates, or all duplicates are in protected folders.')"
						:icon="'icon-info'">
						<template #action>
							<NcButton @click="previewResults = null">
								{{ t('duplicatefinder', 'Back') }}
							</NcButton>
						</template>
					</NcEmptyContent>
				</template>
			</div>

			<div v-if="hasDuplicatesToDelete" class="preview-section">
				<div class="preview-details">
					<h3>{{ t('duplicatefinder', 'Files to be deleted') }}</h3>
					<p class="merge-explanation">
						{{ t('duplicatefinder', 'For each duplicate group, at least one file will be preserved.') }}
						<span v-if="hasProtectedFiles">
							{{ t('duplicatefinder', 'Files in origin folders are automatically protected and will not be deleted.') }}
						</span>
					</p>
					<div class="preview-list">
						<div v-for="(group, hash) in sortedDuplicateGroups" :key="hash" class="duplicate-group">
							<div class="group-header">
								<NcCheckboxRadioSwitch
									v-if="group.filesToDelete.length > 0"
									:checked="isGroupSelected(hash)"
									type="checkbox"
									@update:checked="toggleGroup(hash)">
									<span class="group-title">
										{{ t('duplicatefinder', 'Duplicate group') }}
										<span class="group-stats">
											({{ t('duplicatefinder', '{selected} of {total} files selected',
												{
													selected: selectedFiles[hash]?.length || 0,
													total: group.filesToDelete.length
												}) }})
											<span v-if="group.protectedFileCount > 0" class="protected-info">
												- {{ t('duplicatefinder', '{count} protected files in origin folders', { count: group.protectedFileCount }) }}
											</span>
										</span>
									</span>
								</NcCheckboxRadioSwitch>
								<div v-else class="protected-only-notice">
									<span class="group-title">
										{{ t('duplicatefinder', 'Duplicate group (all files protected)') }}
										<span class="protected-info">
											- {{ t('duplicatefinder', 'All {count} files are in origin folders and cannot be deleted', { count: group.protectedFileCount }) }}
										</span>
									</span>
								</div>
							</div>
							<div class="group-content">
								<div v-for="(file, index) in group.filesToDelete" :key="index" class="file-display">
									<div class="file-checkbox">
										<NcCheckboxRadioSwitch
											:checked="isFileSelected(hash, index)"
											type="checkbox"
											@update:checked="toggleFile(hash, index)">
											<div class="file-info" :title="cleanFilePath(file.path)">
												<span class="file-path-label"><span v-if="file.humanizedDirectory" class="path-directory">{{ file.humanizedDirectory }}/</span><span class="path-filename">{{ file.humanizedFileName }}</span></span>
												<span class="file-size">{{ formatBytes(file.size) }}</span>
											</div>
										</NcCheckboxRadioSwitch>
									</div>
								</div>
								<div v-if="group.filesToDelete.length > 0" class="group-actions">
									<NcButton type="tertiary" class="preview-button" @click="previewGroupMerge(hash)">
										{{ t('duplicatefinder', 'Preview') }}
									</NcButton>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>

		<div
			v-if="confirmDialog.open"
			class="nc-confirm-dialog-backdrop"
			role="presentation"
			@click.self="resolveConfirmDialog(false)"
			@keydown.esc="resolveConfirmDialog(false)">
			<div
				class="nc-confirm-dialog"
				role="alertdialog"
				aria-modal="true"
				aria-labelledby="bulk-nc-confirm-title"
				aria-describedby="bulk-nc-confirm-desc">
				<div class="nc-confirm-dialog__header">
					<span class="nc-confirm-dialog__icon" aria-hidden="true">
						<svg xmlns="http://www.w3.org/2000/svg"
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round">
							<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
							<line x1="12"
								y1="9"
								x2="12"
								y2="13" />
							<line x1="12"
								y1="17"
								x2="12.01"
								y2="17" />
						</svg>
					</span>
					<h4 id="bulk-nc-confirm-title" class="nc-confirm-dialog__title">
						{{ confirmDialog.title }}
					</h4>
				</div>
				<p id="bulk-nc-confirm-desc" class="nc-confirm-dialog__message">
					{{ confirmDialog.message }}
				</p>
				<dl v-if="confirmDialog.stats" class="nc-confirm-dialog__stats">
					<div class="nc-confirm-dialog__stat">
						<dt>{{ t('duplicatefinder', 'Files to delete') }}</dt>
						<dd>{{ confirmDialog.stats.deleteCount }}</dd>
					</div>
					<div class="nc-confirm-dialog__stat">
						<dt>{{ t('duplicatefinder', 'Groups affected') }}</dt>
						<dd>{{ confirmDialog.stats.groupCount }}</dd>
					</div>
					<div class="nc-confirm-dialog__stat">
						<dt>{{ t('duplicatefinder', 'Space freed') }}</dt>
						<dd>{{ confirmDialog.stats.reclaimableFormatted }}</dd>
					</div>
				</dl>
				<p v-if="confirmDialog.note" class="nc-confirm-dialog__note" role="status">
					{{ confirmDialog.note }}
				</p>
				<div class="nc-confirm-dialog__actions">
					<button
						type="button"
						class="nc-confirm-dialog__button nc-confirm-dialog__button--cancel"
						@click="resolveConfirmDialog(false)">
						{{ t('duplicatefinder', 'Cancel') }}
					</button>
					<button
						type="button"
						class="nc-confirm-dialog__button nc-confirm-dialog__button--danger"
						@click="resolveConfirmDialog(true)">
						{{ confirmDialog.confirmLabel }}
					</button>
				</div>
			</div>
		</div>
	</div>
</template>

<script>
import { NcButton, NcCheckboxRadioSwitch, NcEmptyContent, NcLoadingIcon, NcActions, NcActionButton } from '@nextcloud/vue'
import * as api from '@/tools/api'
import { openFileInViewer, getTotalSizeOfDuplicate, getParentFolderPath, loadUiPreferences, saveUiPreferences } from '@/tools/utils'
import ChevronDown from 'vue-material-design-icons/ChevronDown.vue'
import { translate as t } from '@nextcloud/l10n'

const { fetchDuplicatesForBulk, deleteFiles } = api

export default {
	name: 'BulkDeletionSettings',
	components: {
		NcButton,
		NcCheckboxRadioSwitch,
		NcEmptyContent,
		NcLoadingIcon,
		NcActions,
		NcActionButton,
		ChevronDown,
	},
	data() {
		return {
			isLoading: false,
			previewResults: null,
			currentPage: 1,
			hasMorePages: false,
			limit: 100,
			selectedFiles: {},
			sortOption: 'none',
			minSizeBytes: 0,
			detectEmptyFoldersAfterDelete: false,
			isScanningDuplicateFolders: false,
			isDeletingDuplicateFolder: false,
			activeKeptDuplicateFolder: '',
			duplicateFoldersScanCompleted: false,
			duplicateFolderGroups: [],
			duplicateFolderSummary: {
				groupCount: 0,
				duplicateFolderCount: 0,
				reclaimableSize: 0,
			},
			isScanningEmptyFolders: false,
			isDeletingEmptyFolders: false,
			emptyFolderScanCompleted: false,
			emptyFolderScanWasScoped: false,
			emptyFolders: [],
			selectedEmptyFolders: [],
			ignoredEmptyFolders: typeof loadUiPreferences === 'function' && Array.isArray(loadUiPreferences()?.ignoredEmptyFolders)
				? [...loadUiPreferences().ignoredEmptyFolders]
				: [],
			showIgnoredEmptyFolders: false,
			confirmDialog: {
				open: false,
				title: '',
				message: '',
				confirmLabel: '',
				stats: null,
				note: '',
				resolver: null,
			},
		}
	},
	computed: {
		activeEmptyFolders() {
			const ignoredSet = new Set(this.ignoredEmptyFolders)
			return this.emptyFolders.filter(folder => !ignoredSet.has(folder.path))
		},
		ignoredEmptyFoldersCount() {
			const ignoredSet = new Set(this.ignoredEmptyFolders)
			return this.emptyFolders.filter(folder => ignoredSet.has(folder.path)).length
		},
		visibleEmptyFolders() {
			return this.showIgnoredEmptyFolders
				? this.emptyFolders
				: this.activeEmptyFolders
		},
		isAllEmptyFoldersSelected() {
			return this.activeEmptyFolders.length > 0
        && this.activeEmptyFolders.every(folder => this.selectedEmptyFolders.includes(folder.path))
		},
		hasDuplicatesToDelete() {
			return this.previewResults
             && Object.keys(this.previewResults.duplicateGroups).length > 0
		},
		hasSelectedFiles() {
			if (!this.previewResults) return false
			return Object.values(this.selectedFiles).some(files => files.length > 0)
		},
		totalFilesToDelete() {
			if (!this.previewResults) return 0
			return Object.values(this.selectedFiles).reduce((total, files) => total + files.length, 0)
		},
		totalSpaceFreed() {
			if (!this.previewResults) return 0
			return Object.entries(this.selectedFiles).reduce((total, [hash, selectedIndexes]) => {
				const group = this.previewResults.duplicateGroups[hash]
				if (!group || !Array.isArray(group.filesToDelete)) {
					return total
				}
				return total + selectedIndexes.reduce((sum, index) =>
					sum + (group.filesToDelete[index]?.size || 0), 0)
			}, 0)
		},
		hasProtectedFiles() {
			if (!this.previewResults) return false
			return Object.values(this.previewResults.duplicateGroups).some(group =>
				group.protectedFileCount > 0
			)
		},
		isAllSelected() {
			if (!this.previewResults) return false
			const selectableGroups = Object.values(this.previewResults.duplicateGroups)
				.filter(group => Array.isArray(group.filesToDelete) && group.filesToDelete.length > 0)
			if (selectableGroups.length === 0) return false
			return selectableGroups.every(group =>
				(this.selectedFiles[group.hash]?.length || 0) === group.filesToDelete.length
			)
		},
		sortButtonLabel() {
			switch (this.sortOption) {
			case 'size-desc':
				return t('duplicatefinder', 'Sort: Size (largest first)')
			case 'size-asc':
				return t('duplicatefinder', 'Sort: Size (smallest first)')
			default:
				return t('duplicatefinder', 'Sort: Default')
			}
		},
		minSizePresets() {
			return [
				{ bytes: 0, label: t('duplicatefinder', 'All sizes') },
				{ bytes: 1024 * 1024, label: '>= 1 MB' },
				{ bytes: 10 * 1024 * 1024, label: '>= 10 MB' },
				{ bytes: 100 * 1024 * 1024, label: '>= 100 MB' },
				{ bytes: 1024 * 1024 * 1024, label: '>= 1 GB' },
			]
		},
		minSizeButtonLabel() {
			const active = this.minSizePresets.find(preset => preset.bytes === this.minSizeBytes)
			if (!active || active.bytes === 0) {
				return t('duplicatefinder', 'Min size: All sizes')
			}
			return t('duplicatefinder', 'Min size: {size}', { size: active.label })
		},
		availableKeepFolders() {
			if (!this.previewResults || !this.previewResults.duplicateGroups) {
				return []
			}
			const countsByFolder = new Map()
			Object.values(this.previewResults.duplicateGroups).forEach(group => {
				const files = group.filesToDelete || []
				const foldersInGroup = new Set(files.map(file => getParentFolderPath(file.path)))
				if (foldersInGroup.size < 2) {
					return
				}
				foldersInGroup.forEach(folder => {
					countsByFolder.set(folder, (countsByFolder.get(folder) || 0) + 1)
				})
			})
			return Array.from(countsByFolder.entries())
				.map(([folder, groupCount]) => ({ folder, groupCount }))
				.sort((a, b) => b.groupCount - a.groupCount || a.folder.localeCompare(b.folder))
		},
		sortedDuplicateGroups() {
			if (!this.previewResults) return {}

			// Convert object to array for sorting
			const groupsArray = Object.entries(this.previewResults.duplicateGroups).map(([hash, group]) => ({
				hash,
				...group,
			}))

			// Sort based on selected option
			if (this.sortOption === 'size-desc') {
				groupsArray.sort((a, b) => {
					const sizeA = getTotalSizeOfDuplicate({ files: a.filesToDelete })
					const sizeB = getTotalSizeOfDuplicate({ files: b.filesToDelete })
					return sizeB - sizeA
				})
			} else if (this.sortOption === 'size-asc') {
				groupsArray.sort((a, b) => {
					const sizeA = getTotalSizeOfDuplicate({ files: a.filesToDelete })
					const sizeB = getTotalSizeOfDuplicate({ files: b.filesToDelete })
					return sizeA - sizeB
				})
			}

			// Convert back to object
			const sortedGroups = {}
			groupsArray.forEach(group => {
				sortedGroups[group.hash] = group
			})

			return sortedGroups
		},
	},
	beforeDestroy() {
		if (this.confirmDialog && typeof this.confirmDialog.resolver === 'function') {
			this.resolveConfirmDialog(false)
		}
	},
	methods: {
		formatBytes(bytes) {
			if (bytes === 0) return '0 Bytes'
			const k = 1024
			const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
			const i = Math.floor(Math.log(bytes) / Math.log(k))
			return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
		},
		cleanFilePath(path) {
			return String(path || '').replace(/^\/[^/]+\/files\//, '/')
		},
		humanizePathParts(path) {
			const humanized = this.cleanFilePath(path)
			const parts = humanized.split('/')
			const fileName = parts.pop() || ''
			const directory = parts.join('/')
			return {
				directory,
				fileName,
			}
		},
		async loadPage(page) {
			try {
				const response = await fetchDuplicatesForBulk(this.limit, page, {
					sortBy: this.sortOption,
					minSize: this.minSizeBytes,
				})

				// Transform entities into expected interface format
				const duplicateGroups = { ...(this.previewResults?.duplicateGroups || {}) }

				// Initialize arrays for each group
				response.entities.forEach(entity => {
					if (!this.selectedFiles[entity.hash]) {
						this.$set(this.selectedFiles, entity.hash, [])
					}
				})

				response.entities.forEach(entity => {
					const files = Array.isArray(entity.files) ? entity.files : []
					duplicateGroups[entity.hash] = {
						hash: entity.hash,
						protectedFileCount: Number(entity.protectedFileCount) || 0,
						hasOnlyProtectedFiles: Boolean(entity.hasOnlyProtectedFiles),
						filesToDelete: files.map(file => {
							const humanized = this.humanizePathParts(file.path)
							return {
								path: file.path,
								humanizedDirectory: humanized.directory,
								humanizedFileName: humanized.fileName,
								size: file.size,
								nodeId: file.nodeId,
								mimetype: file.mimetype || 'application/octet-stream',
							}
						}),
					}
				})

				this.previewResults = {
					duplicateGroups,
					pagination: response.pagination,
				}

				this.hasMorePages = page < response.pagination.totalPages
				this.currentPage = page
			} catch (error) {
				console.error('Error loading page:', error)
			}
		},
		async performDryRun() {
			this.isLoading = true
			try {
				await this.loadPage(1)
				if (this.hasMorePages) {
					await this.loadRemainingPages()
				}
			} catch (error) {
				console.error('Error during dry run:', error)
			} finally {
				this.isLoading = false
			}
		},
		async loadRemainingPages() {
			const totalPages = this.previewResults.pagination.totalPages
			const remainingPages = Array.from(
				{ length: totalPages - this.currentPage },
				(_, i) => i + this.currentPage + 1
			)

			// Load remaining pages in parallel with a reasonable chunk size
			const chunkSize = 5
			for (let i = 0; i < remainingPages.length; i += chunkSize) {
				const chunk = remainingPages.slice(i, i + chunkSize)
				await Promise.all(chunk.map(page => this.loadPage(page)))
			}
		},
		isGroupSelected(hash) {
			const group = this.previewResults.duplicateGroups[hash]
			return this.selectedFiles[hash]?.length === group.filesToDelete.length
		},
		isFileSelected(hash, index) {
			return this.selectedFiles[hash]?.includes(index) || false
		},
		toggleGroup(hash) {
			const group = this.previewResults.duplicateGroups[hash]
			const isSelected = !this.isGroupSelected(hash)

			if (isSelected) {
				this.$set(this.selectedFiles, hash,
					Array.from({ length: group.filesToDelete.length }, (_, i) => i)
				)
			} else {
				this.$set(this.selectedFiles, hash, [])
			}
		},
		toggleFile(hash, index) {
			if (!this.selectedFiles[hash]) {
				this.$set(this.selectedFiles, hash, [])
			}

			const selectedIndex = this.selectedFiles[hash].indexOf(index)
			if (selectedIndex === -1) {
				this.selectedFiles[hash].push(index)
			} else {
				this.selectedFiles[hash].splice(selectedIndex, 1)
			}
		},
		previewGroupMerge(hash) {
			// Get the first file from the group to preview
			const group = this.previewResults.duplicateGroups[hash]

			if (group && group.filesToDelete && group.filesToDelete.length > 0) {
				// We need to create a file object that has the necessary properties for the viewer
				const file = {
					path: group.filesToDelete[0].path,
					nodeId: group.filesToDelete[0].nodeId || '',
					mimetype: group.filesToDelete[0].mimetype || 'application/octet-stream',
				}

				// Open the file in the viewer
				openFileInViewer(file)
			}
		},

		requestConfirmation({ title, message, confirmLabel, stats = null, note = '' }) {
			if (this.confirmDialog && typeof this.confirmDialog.resolver === 'function') {
				this.confirmDialog.resolver(false)
			}
			this.confirmDialog = {
				open: true,
				title,
				message,
				confirmLabel,
				stats,
				note,
				resolver: null,
			}
			return new Promise(resolve => {
				this.confirmDialog.resolver = resolve
			})
		},
		resolveConfirmDialog(confirmed) {
			const resolver = this.confirmDialog ? this.confirmDialog.resolver : null
			this.confirmDialog.open = false
			this.confirmDialog.stats = null
			this.confirmDialog.note = ''
			this.confirmDialog.resolver = null
			if (typeof resolver === 'function') {
				resolver(Boolean(confirmed))
			}
		},
		computeBulkDeletionAuditPlan() {
			const groups = (this.previewResults && this.previewResults.duplicateGroups) || {}
			const safeSelections = {}
			let deleteCount = 0
			let groupCount = 0
			let reclaimableBytes = 0
			let autoPreservedCount = 0

			Object.entries(this.selectedFiles || {}).forEach(([hash, selectedIndexes]) => {
				const group = groups[hash]
				if (!group || !Array.isArray(group.filesToDelete) || !Array.isArray(selectedIndexes)) {
					return
				}
				const validIndexes = selectedIndexes.filter(index => Boolean(group.filesToDelete[index]))
				if (validIndexes.length === 0) {
					safeSelections[hash] = []
					return
				}
				const hasProtectedFiles = Number(group.protectedFileCount) > 0
				let finalIndexes = validIndexes
				if (validIndexes.length === group.filesToDelete.length && !hasProtectedFiles) {
					finalIndexes = validIndexes.slice(0, -1)
					autoPreservedCount += 1
				}
				safeSelections[hash] = finalIndexes
				if (finalIndexes.length > 0) {
					groupCount += 1
					deleteCount += finalIndexes.length
					finalIndexes.forEach(index => {
						reclaimableBytes += Number(group.filesToDelete[index].size) || 0
					})
				}
			})

			return {
				safeSelections,
				deleteCount,
				groupCount,
				reclaimableBytes,
				reclaimableFormatted: this.formatBytes(reclaimableBytes),
				autoPreservedCount,
			}
		},

		async confirmBulkDelete() {
			const auditPlan = this.computeBulkDeletionAuditPlan()
			const note = auditPlan.autoPreservedCount > 0
				? t('duplicatefinder', '{count} copy/copies will be kept automatically so at least one copy remains per group.', { count: auditPlan.autoPreservedCount })
				: ''
			const confirmed = await this.requestConfirmation({
				title: t('duplicatefinder', 'Delete selected duplicates?'),
				message: t('duplicatefinder', 'Are you sure you want to delete all selected duplicates? This action cannot be undone.'),
				confirmLabel: t('duplicatefinder', 'Delete selected files'),
				stats: {
					deleteCount: auditPlan.deleteCount,
					groupCount: auditPlan.groupCount,
					reclaimableFormatted: auditPlan.reclaimableFormatted,
				},
				note,
			})
			if (!confirmed) {
				return
			}

			// Apply the verified safe selections so at least one copy per group is preserved
			Object.entries(auditPlan.safeSelections).forEach(([hash, safeIndexes]) => {
				this.$set(this.selectedFiles, hash, safeIndexes)
			})

			const filesToDelete = Object.entries(this.selectedFiles).flatMap(([hash, selectedIndexes]) => {
				const group = this.previewResults.duplicateGroups[hash]
				if (!group || !Array.isArray(group.filesToDelete)) {
					return []
				}
				return selectedIndexes
					.filter(index => group.filesToDelete[index])
					.map(index => ({
						path: group.filesToDelete[index].path,
						size: group.filesToDelete[index].size,
						// The server uses them to find the exact file and to keep the last copy of the group
						nodeId: group.filesToDelete[index].nodeId,
						fileHash: hash,
					}))
			})

			if (filesToDelete.length === 0) {
				return
			}

			this.isLoading = true
			try {
				const { success, errors } = await deleteFiles(filesToDelete)

				if (success.length > 0) {
					const deletedPaths = success.map(file => file && file.path).filter(Boolean)
					const bytesReclaimed = success.reduce(
						(sum, file) => sum + (Number(file && file.size) > 0 ? Math.floor(Number(file.size)) : 0),
						0
					)
					const groupsResolved = new Set(success.map(file => file && file.fileHash).filter(Boolean)).size
					const firstDeletedName = deletedPaths[0] ? deletedPaths[0].split('/').pop() : ''
					this.$emit('reclamation-recorded', {
						bytesReclaimed,
						filesDeleted: success.length,
						groupsResolved,
						source: 'bulk',
						sampleLabel: firstDeletedName,
					})
					this.$emit('folders-touched', deletedPaths)
					this.$emit('duplicates-deleted')
					this.previewResults = null
					this.selectedFiles = {}
					if (this.detectEmptyFoldersAfterDelete && typeof api.scanEmptyFolders === 'function') {
						await this.runEmptyFolderScan(deletedPaths)
					}
				}

				if (errors.length > 0) {
					console.error('Some files could not be deleted:', errors)
				}
			} catch (error) {
				console.error('Error during bulk deletion:', error)
			} finally {
				this.isLoading = false
			}
		},
		toggleSelectAll() {
			if (this.isAllSelected) {
				// Unselect all
				Object.keys(this.selectedFiles).forEach(hash => {
					this.$set(this.selectedFiles, hash, [])
				})
			} else {
				// Select all
				Object.keys(this.previewResults.duplicateGroups).forEach(hash => {
					const group = this.previewResults.duplicateGroups[hash]
					this.$set(this.selectedFiles, hash,
						Array.from({ length: group.filesToDelete.length }, (_, i) => i)
					)
				})
			}
		},
		async setSortOption(option) {
			if (this.sortOption === option) {
				return
			}
			this.sortOption = option
			if (this.previewResults && this.hasMorePages) {
				this.previewResults = null
				this.selectedFiles = {}
				await this.performDryRun()
			}
		},
		async setMinSizeBytes(bytes, reloadPreview = false) {
			const normalized = Number(bytes) > 0 ? Math.floor(Number(bytes)) : 0
			if (this.minSizeBytes === normalized) {
				return
			}
			this.minSizeBytes = normalized
			if (reloadPreview) {
				this.previewResults = null
				this.selectedFiles = {}
				await this.performDryRun()
			}
		},
		selectAllExcept(position) {
			Object.keys(this.previewResults.duplicateGroups).forEach(hash => {
				const group = this.previewResults.duplicateGroups[hash]
				const indexes = Array.from({ length: group.filesToDelete.length }, (_, i) => i)
				this.$set(this.selectedFiles, hash,
					position === 'first' ? indexes.slice(1) : indexes.slice(0, -1)
				)
			})
		},
		keepFolderAcrossGroups(keptFolder) {
			if (!this.previewResults || !this.previewResults.duplicateGroups) {
				return
			}
			Object.entries(this.previewResults.duplicateGroups).forEach(([hash, group]) => {
				const files = group.filesToDelete || []
				const hasCopyInKeptFolder = files.some(file => getParentFolderPath(file.path) === keptFolder)
				if (!hasCopyInKeptFolder) {
					this.$set(this.selectedFiles, hash, [])
					return
				}
				const indexesOutsideFolder = []
				files.forEach((file, index) => {
					if (getParentFolderPath(file.path) !== keptFolder) {
						indexesOutsideFolder.push(index)
					}
				})
				this.$set(this.selectedFiles, hash, indexesOutsideFolder)
			})
		},
		async runEmptyFolderScan(candidatePaths = []) {
			if (typeof api.scanEmptyFolders !== 'function') {
				return
			}
			this.isScanningEmptyFolders = true
			try {
				const scoped = Array.isArray(candidatePaths) && candidatePaths.length > 0
				const response = await api.scanEmptyFolders(scoped ? candidatePaths : [])
				const folders = Array.isArray(response?.folders) ? response.folders : []
				const prefs = typeof loadUiPreferences === 'function' ? loadUiPreferences() : null
				this.ignoredEmptyFolders = Array.isArray(prefs?.ignoredEmptyFolders) ? [...prefs.ignoredEmptyFolders] : []
				const ignoredSet = new Set(this.ignoredEmptyFolders)
				this.emptyFolders = folders
				this.selectedEmptyFolders = folders
					.filter(folder => !ignoredSet.has(folder.path))
					.map(folder => folder.path)
				this.emptyFolderScanWasScoped = scoped
				this.emptyFolderScanCompleted = true
			} catch (error) {
				console.error('Error scanning empty folders:', error)
			} finally {
				this.isScanningEmptyFolders = false
			}
		},
		isEmptyFolderIgnored(path) {
			return this.ignoredEmptyFolders.includes(path)
		},
		toggleIgnoreEmptyFolder(path) {
			const set = new Set(this.ignoredEmptyFolders)
			if (set.has(path)) {
				set.delete(path)
			} else {
				set.add(path)
				this.selectedEmptyFolders = this.selectedEmptyFolders.filter(p => p !== path)
			}
			this.ignoredEmptyFolders = Array.from(set)
			if (typeof saveUiPreferences === 'function') {
				saveUiPreferences({ ignoredEmptyFolders: this.ignoredEmptyFolders })
			}
		},
		ignoreSelectedEmptyFolders() {
			if (this.selectedEmptyFolders.length === 0) {
				return
			}
			const set = new Set(this.ignoredEmptyFolders)
			this.selectedEmptyFolders.forEach(path => set.add(path))
			this.ignoredEmptyFolders = Array.from(set)
			this.selectedEmptyFolders = []
			if (typeof saveUiPreferences === 'function') {
				saveUiPreferences({ ignoredEmptyFolders: this.ignoredEmptyFolders })
			}
		},
		resetIgnoredEmptyFolders() {
			this.ignoredEmptyFolders = []
			this.showIgnoredEmptyFolders = false
			this.selectedEmptyFolders = this.emptyFolders.map(folder => folder.path)
			if (typeof saveUiPreferences === 'function') {
				saveUiPreferences({ ignoredEmptyFolders: [] })
			}
		},
		isEmptyFolderSelected(path) {
			return this.selectedEmptyFolders.includes(path)
		},
		toggleEmptyFolder(path) {
			if (this.isEmptyFolderIgnored(path)) {
				return
			}
			const idx = this.selectedEmptyFolders.indexOf(path)
			if (idx === -1) {
				this.selectedEmptyFolders.push(path)
			} else {
				this.selectedEmptyFolders.splice(idx, 1)
			}
		},
		toggleSelectAllEmptyFolders() {
			if (this.isAllEmptyFoldersSelected) {
				this.selectedEmptyFolders = []
			} else {
				this.selectedEmptyFolders = this.activeEmptyFolders.map(folder => folder.path)
			}
		},
		dismissEmptyFolderPanel() {
			this.emptyFolderScanCompleted = false
			this.emptyFolders = []
			this.selectedEmptyFolders = []
		},
		async confirmDeleteEmptyFolders() {
			if (this.selectedEmptyFolders.length === 0 || typeof api.deleteEmptyFolders !== 'function') {
				return
			}
			const confirmed = await this.requestConfirmation({
				title: t('duplicatefinder', 'Delete empty folders?'),
				message: t('duplicatefinder', 'Are you sure you want to delete the selected empty folders?'),
				confirmLabel: t('duplicatefinder', 'Delete empty folders'),
			})
			if (!confirmed) {
				return
			}
			this.isDeletingEmptyFolders = true
			try {
				const pathsToDeleteSet = new Set(this.selectedEmptyFolders)
				this.emptyFolders.forEach(folder => {
					if (folder && folder.path && !this.isEmptyFolderIgnored(folder.path)) {
						for (const selectedPath of this.selectedEmptyFolders) {
							if (folder.path.startsWith(`${selectedPath}/`)) {
								pathsToDeleteSet.add(folder.path)
								break
							}
						}
					}
				})
				const { deleted } = await api.deleteEmptyFolders(Array.from(pathsToDeleteSet))
				if (deleted.length > 0) {
					const deletedSet = new Set(deleted)
					const remaining = this.emptyFolders.filter(folder => !deletedSet.has(folder.path))
					this.emptyFolders = remaining.map(folder => ({
						...folder,
						hasEmptySubfolders: remaining.some(
							other => other.path !== folder.path && other.path.startsWith(`${folder.path}/`)
						),
					}))
					this.selectedEmptyFolders = this.selectedEmptyFolders.filter(path => !deletedSet.has(path))
					if (this.emptyFolders.length === 0) {
						this.emptyFolderScanCompleted = false
					}
				}
			} catch (error) {
				console.error('Error deleting empty folders:', error)
			} finally {
				this.isDeletingEmptyFolders = false
			}
		},
		async scanDuplicateFolders() {
			if (typeof api.fetchDuplicateFolders !== 'function') {
				return
			}
			this.isScanningDuplicateFolders = true
			try {
				const response = await api.fetchDuplicateFolders({
					minSize: this.minSizeBytes,
				})
				this.duplicateFolderGroups = Array.isArray(response?.groups) ? response.groups : []
				this.duplicateFolderSummary = response?.summary || {
					groupCount: this.duplicateFolderGroups.length,
					duplicateFolderCount: 0,
					reclaimableSize: 0,
				}
				this.duplicateFoldersScanCompleted = true
			} catch (error) {
				console.error('Error scanning duplicate folders:', error)
			} finally {
				this.isScanningDuplicateFolders = false
			}
		},
		dismissDuplicateFoldersPanel() {
			this.duplicateFoldersScanCompleted = false
			this.duplicateFolderGroups = []
			this.duplicateFolderSummary = {
				groupCount: 0,
				duplicateFolderCount: 0,
				reclaimableSize: 0,
			}
		},
		getDuplicateGroupFolderDetails(group) {
			if (Array.isArray(group?.folderDetails) && group.folderDetails.length > 0) {
				return group.folderDetails
			}
			if (Array.isArray(group?.folders)) {
				return group.folders.map(folderPath => ({
					path: folderPath,
					isProtected: false,
					protectedFileCount: 0,
					deletableFileCount: Number(group.fileCount) || 0,
					deletableSize: Number(group.totalSize) || 0,
					files: [],
				}))
			}
			return []
		},
		collectFilesOutsideKeptFolder(group, keptFolderPath) {
			const details = this.getDuplicateGroupFolderDetails(group)
			const keptFolder = keptFolderPath
				? details.find(folder => folder && folder.path === keptFolderPath)
				: null
			if (!keptFolder) {
				return []
			}

			const keptNodeIds = new Set()
			if (Array.isArray(keptFolder.files)) {
				keptFolder.files.forEach(file => {
					if (file && file.nodeId) {
						keptNodeIds.add(Number(file.nodeId))
					}
				})
			}

			const files = []
			const seenKeys = new Set()

			details.forEach(folder => {
				if (!folder || folder.path === keptFolderPath || !Array.isArray(folder.files)) {
					return
				}
				folder.files.forEach(file => {
					if (!file || file.isInOriginFolder || !file.path) {
						return
					}
					if (file.nodeId && keptNodeIds.has(Number(file.nodeId))) {
						return
					}
					const key = file.nodeId ? `id:${file.nodeId}` : `path:${file.path}`
					if (seenKeys.has(key)) {
						return
					}
					seenKeys.add(key)
					files.push({
						path: file.path,
						nodeId: file.nodeId,
						fileHash: file.fileHash || group.signature,
						size: Number(file.size) || 0,
						mimetype: file.mimetype || 'application/octet-stream',
					})
				})
			})

			// Delete photo files before paired Live Photo video files (.mov/.mp4/.m4v)
			return files.sort((a, b) => {
				const isVideoA = /\.(mov|mp4|m4v)$/i.test(a.path) ? 1 : 0
				const isVideoB = /\.(mov|mp4|m4v)$/i.test(b.path) ? 1 : 0
				if (isVideoA !== isVideoB) {
					return isVideoA - isVideoB
				}
				return a.path.localeCompare(b.path)
			})
		},
		canKeepDuplicateFolder(group, keptFolderPath) {
			return this.collectFilesOutsideKeptFolder(group, keptFolderPath).length > 0
		},
		async keepDuplicateFolder(group, keptFolderPath) {
			const filesToDelete = this.collectFilesOutsideKeptFolder(group, keptFolderPath)
			if (filesToDelete.length === 0) {
				return
			}

			const totalBytes = filesToDelete.reduce((sum, file) => sum + (Number(file.size) || 0), 0)
			const confirmed = await this.requestConfirmation({
				title: t('duplicatefinder', 'Keep this folder and delete duplicate copies?'),
				message: t('duplicatefinder', 'Keep "{folder}" and delete {count} duplicate files ({size}) from the other identical folders? Protected origin folders and Live Photo safeguards remain enforced.', {
					folder: keptFolderPath,
					count: filesToDelete.length,
					size: this.formatBytes(totalBytes),
				}),
				confirmLabel: t('duplicatefinder', 'Delete duplicate copies'),
			})
			if (!confirmed) {
				return
			}

			this.isDeletingDuplicateFolder = true
			this.activeKeptDuplicateFolder = keptFolderPath
			try {
				const { success } = await deleteFiles(filesToDelete)
				if (success.length > 0) {
					const deletedPaths = success.map(file => file && file.path).filter(Boolean)
					const bytesReclaimed = success.reduce(
						(sum, file) => sum + (Number(file && file.size) > 0 ? Math.floor(Number(file.size)) : 0),
						0
					)
					const groupsResolved = new Set(success.map(file => file && file.fileHash).filter(Boolean)).size
					this.$emit('reclamation-recorded', {
						bytesReclaimed,
						filesDeleted: success.length,
						groupsResolved,
						source: 'folder',
						sampleLabel: keptFolderPath,
					})
					this.$emit('folders-touched', deletedPaths)
					this.$emit('duplicates-deleted')
					if (this.detectEmptyFoldersAfterDelete && typeof api.scanEmptyFolders === 'function') {
						await this.runEmptyFolderScan(deletedPaths)
					}
					await this.scanDuplicateFolders()
				}
			} catch (error) {
				console.error('Error keeping duplicate folder:', error)
			} finally {
				this.isDeletingDuplicateFolder = false
				this.activeKeptDuplicateFolder = ''
			}
		},
	},
}
</script>

<style scoped>
.bulk-deletion {
  height: 100%;
  padding: var(--default-grid-baseline, 4px) 0;
}

.bulk-deletion__content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 var(--default-grid-baseline, 4px);
}

.summary-section {
  margin-top: 50px;
  margin-bottom: 20px;
  padding: 10px;
  border-radius: 5px;
  font-weight: bold;
  text-align: center;
  width: 100%;
}

.summary-actions {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
}

.preview-section {
  background-color: var(--color-main-background);
  border-radius: var(--border-radius-large);
  padding: 20px;
}

.file-display {
  width: calc(100% - 20px);
  box-sizing: border-box;
  display: flex;
  align-items: center;
  margin-bottom: 10px;
  margin-inline: 10px;
  border: 1px solid var(--color-border);
  padding: 10px;
  border-radius: var(--border-radius);
  position: relative;
  min-width: 0;
  transition: all 0.2s ease;
}

.file-display:hover {
  background: var(--color-background-hover);
  border-color: var(--color-primary);
}

.duplicate-group {
  margin: 15px 0;
  padding: 15px;
  background: var(--color-background-hover);
  border-radius: var(--border-radius);
  transition: background-color 0.2s ease;
}

.duplicate-group:hover {
  background: var(--color-background-dark);
}

.group-header {
  margin-bottom: 10px;
}

.group-content {
  margin-inline-start: 20px;
}

.path-directory {
  color: var(--color-text-maxcontrast);
}

.path-filename {
  color: var(--color-text-default);
}

.group-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: bold;
}

.group-stats {
  color: var(--color-text-maxcontrast);
  font-weight: normal;
}

.file-checkbox {
  width: 100%;
}

.file-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  min-width: 0;
  gap: 10px;
}

.file-path-label {
  min-width: 0;
  overflow-wrap: anywhere;
}

.file-size {
  color: var(--color-text-maxcontrast);
  white-space: nowrap;
}

@media (max-width: 800px) {
  .preview-section,
  .empty-folders-section,
  .duplicate-folders-section {
    padding: 12px;
  }

  .group-content {
    margin-inline-start: 8px;
  }

  .file-display {
    width: 100%;
    margin-inline: 0;
  }

  .file-info {
    flex-direction: column;
    align-items: flex-start;
  }

  .file-size {
    margin-inline-start: 0;
  }

  .empty-folder-ignore-button {
    min-width: 44px;
    min-height: 44px;
  }
}

.loading-info {
  color: var(--color-text-maxcontrast);
  font-size: 0.9em;
  margin: 10px 0;
}

.protected-info {
  color: var(--color-warning);
  font-weight: normal;
  font-size: 0.9em;
}

.protected-only-notice {
  padding: 10px;
  background-color: var(--color-background-hover);
  border-radius: var(--border-radius);
  opacity: 0.7;
}

.protected-only-notice .group-title {
  display: block;
  color: var(--color-text-lighter);
}

.merge-explanation {
  font-size: 0.9em;
  color: var(--color-text-maxcontrast);
  margin-bottom: 15px;
}

.group-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
  margin-inline-end: 10px;
}

.preview-button {
  background-color: #17a2b8;
  color: white;
  border: none;
  padding: 5px 10px;
  border-radius: 3px;
  cursor: pointer;
  transition: background-color 0.3s ease;
}

.preview-button:hover {
  background-color: #138496;
}

.post-cleanup-option {
  margin-top: 12px;
  display: flex;
  justify-content: center;
  font-weight: normal;
}

.empty-folders-section,
.duplicate-folders-section {
  background-color: var(--color-main-background);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-large);
  padding: 20px;
  margin-bottom: 24px;
}

.duplicate-folders-empty-option {
  justify-content: flex-start;
  margin-top: 0;
  margin-bottom: 12px;
}

.duplicate-folder-row {
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.duplicate-folder-row.is-protected {
  border-color: var(--color-primary-element);
}

.duplicate-folder-info {
  flex: 1 1 220px;
}

.origin-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--color-primary-element, #00679e);
  font-size: 0.78rem;
  font-weight: 600;
  background-color: var(--color-primary-element-light, #e5eff5);
  color: var(--color-primary-element-light-text, var(--color-main-text, #222222));
  white-space: nowrap;
}

.keep-duplicate-folder-button {
  flex-shrink: 0;
}

.scan-duplicate-folders-button:focus-visible,
.keep-duplicate-folder-button:focus-visible,
.dismiss-duplicate-folders-button:focus-visible {
  outline: 2px solid var(--color-primary-element, #00679e);
  outline-offset: 2px;
}

.empty-folders-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 12px;
}

.empty-folders-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.empty-folders-none {
  color: var(--color-text-maxcontrast);
  margin: 8px 0 0;
}

.empty-folder-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.empty-folder-item.is-selected {
  background-color: var(--color-primary-element-light);
}

.empty-folder-item.is-ignored {
  opacity: 0.65;
  background-color: var(--color-background-dark);
}

.empty-folder-info {
  flex: 1 1 auto;
  cursor: pointer;
}

.empty-folder-checkbox {
  appearance: none !important;
  -webkit-appearance: none !important;
  width: 18px !important;
  height: 18px !important;
  min-width: 18px !important;
  min-height: 18px !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 1.5px solid var(--color-border-maxcontrast, #767676) !important;
  border-radius: 4px !important;
  background-color: var(--color-main-background, #ffffff) !important;
  box-shadow: none !important;
  outline: none !important;
  flex-shrink: 0;
  cursor: pointer !important;
  transition: border-color 0.12s ease, background-color 0.12s ease;
}

.empty-folder-checkbox:hover:not(:disabled) {
  border-color: var(--color-primary-element, #0082c9) !important;
  box-shadow: none !important;
  outline: none !important;
}

.empty-folder-checkbox:focus {
  outline: none !important;
  box-shadow: none !important;
}

.empty-folder-checkbox:focus-visible {
  outline: 2px solid var(--color-primary-element, #0082c9) !important;
  outline-offset: 2px;
}

.empty-folder-checkbox:checked {
  background-color: var(--color-primary-element, #0082c9) !important;
  border-color: var(--color-primary-element, #0082c9) !important;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'/%3E%3C/svg%3E") !important;
  background-size: 12px 12px !important;
  background-position: center !important;
  background-repeat: no-repeat !important;
}

.empty-folder-checkbox:disabled {
  opacity: 0.45;
  cursor: not-allowed !important;
}

.empty-folder-ignored-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.76rem;
  font-weight: 600;
  background-color: var(--color-background-hover);
  border: 1px solid var(--color-border-dark, var(--color-border));
  color: var(--color-text-maxcontrast);
  white-space: nowrap;
}

.empty-folder-row-icon {
  flex-shrink: 0;
  color: var(--color-text-maxcontrast);
}

.empty-folder-ignore-button {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 30px;
  height: 30px;
  min-width: 30px;
  min-height: 30px;
  margin: 0 !important;
  padding: 0 !important;
  border-radius: 6px;
  border: none !important;
  background: transparent !important;
  box-shadow: none !important;
  color: var(--color-text-maxcontrast);
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.empty-folder-ignore-button:hover {
  background-color: var(--color-background-hover) !important;
  color: var(--color-main-text);
}

.empty-folder-ignore-button:focus-visible {
  outline: 2px solid var(--color-primary-element, #0082c9) !important;
  outline-offset: 2px;
}

.empty-folder-ignore-button.is-ignored {
  color: var(--color-primary-element, #0082c9);
}

.nc-confirm-dialog-backdrop {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 20000 !important;
}

.nc-confirm-dialog {
  width: 100%;
  max-width: 440px;
  background-color: var(--color-main-background, #ffffff);
  background-image: linear-gradient(var(--color-main-background, #ffffff), var(--color-main-background, #ffffff)), linear-gradient(#22262c, #22262c);
  color: var(--color-main-text);
  border: 1px solid var(--color-border-dark, var(--color-border));
  border-radius: var(--border-radius-large, 10px);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
  padding: 20px 22px;
  box-sizing: border-box;
}

.nc-confirm-dialog__header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.nc-confirm-dialog__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background-color: rgba(211, 47, 47, 0.14);
  color: #ef5350;
  flex-shrink: 0;
}

.nc-confirm-dialog__title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--color-main-text);
}

.nc-confirm-dialog__message {
  margin-block: 0 14px;
  margin-inline: 0;
  font-size: 0.92rem;
  line-height: 1.48;
  color: var(--color-text-maxcontrast, var(--color-main-text));
}

.nc-confirm-dialog__stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-block: 0 14px;
  margin-inline: 0;
  padding: 10px;
  border-radius: var(--border-radius-large, 8px);
  border: 1px solid var(--color-border);
  background-color: var(--color-background-hover);
  box-sizing: border-box;
}

.nc-confirm-dialog__stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-inline-size: 0;
}

.nc-confirm-dialog__stat dt {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-maxcontrast);
}

.nc-confirm-dialog__stat dd {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--color-main-text);
  overflow-wrap: anywhere;
}

.nc-confirm-dialog__note {
  margin-block: 0 14px;
  margin-inline: 0;
  padding-block: 8px;
  padding-inline: 10px;
  border-radius: 6px;
  border-inline-start: 3px solid var(--color-primary-element, #0082c9);
  background-color: var(--color-background-hover);
  font-size: 0.84rem;
  line-height: 1.4;
  color: var(--color-main-text);
}

.nc-confirm-dialog__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.nc-confirm-dialog__button {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  min-block-size: 44px !important;
  min-inline-size: 44px !important;
  padding-block: 8px !important;
  padding-inline: 14px !important;
  margin: 0 !important;
  border-radius: var(--border-radius-large, 8px) !important;
  background-image: none !important;
  box-shadow: none !important;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.nc-confirm-dialog__button:focus-visible {
  outline: 2px solid var(--color-primary-element, #0082c9);
  outline-offset: 2px;
}

.nc-confirm-dialog__button--cancel {
  background-color: var(--color-background-hover) !important;
  border: 1px solid var(--color-border-dark, var(--color-border)) !important;
  color: var(--color-main-text) !important;
}

.nc-confirm-dialog__button--cancel:hover {
  background-color: var(--color-background-dark) !important;
  color: var(--color-main-text) !important;
}

.nc-confirm-dialog__button--danger {
  background-color: #d32f2f !important;
  border: 1px solid #d32f2f !important;
  color: #ffffff !important;
}

.nc-confirm-dialog__button--danger:hover {
  background-color: #b71c1c !important;
  border-color: #b71c1c !important;
  color: #ffffff !important;
}

.delete-selected-files-button:not(:disabled),
.delete-empty-folders-button:not(:disabled) {
  background-color: var(--color-error-element, #d32f2f) !important;
  border: 1px solid var(--color-error-element, #d32f2f) !important;
  color: #ffffff !important;
}

.delete-selected-files-button:hover:not(:disabled),
.delete-selected-files-button:focus-visible:not(:disabled),
.delete-empty-folders-button:hover:not(:disabled),
.delete-empty-folders-button:focus-visible:not(:disabled) {
  background-color: #b71c1c !important;
  border-color: #b71c1c !important;
  color: #ffffff !important;
}

.delete-selected-files-button:not(:disabled) ::v-deep .button-vue__text,
.delete-empty-folders-button:not(:disabled) ::v-deep .button-vue__text {
  color: #ffffff !important;
}

.delete-selected-files-button:disabled,
.delete-empty-folders-button:disabled {
  background-color: var(--color-background-dark, #ededed) !important;
  border: 1px solid var(--color-border-dark, var(--color-border)) !important;
  color: var(--color-text-maxcontrast, #595959) !important;
  opacity: 1 !important;
  filter: none !important;
  cursor: not-allowed !important;
}

.delete-selected-files-button:disabled ::v-deep .button-vue__text,
.delete-empty-folders-button:disabled ::v-deep .button-vue__text {
  color: var(--color-text-maxcontrast, #595959) !important;
  cursor: not-allowed !important;
}
</style>
