<template>
	<NcContent app-name="duplicatefinder">
		<div v-if="isLoading" class="app-loading-container">
			<NcLoadingIcon :size="44" />
		</div>
		<template v-else>
			<div class="app-navigation-header">
				<DuplicateNavigation
					ref="duplicateNavigation"
					:acknowledged-duplicates="acknowledgedDuplicates"
					:unacknowledged-duplicates="unacknowledgedDuplicates"
					:currentDuplicateId="currentDuplicate?.id"
					:acknowledgedPagination="acknowledgedPagination"
					:unacknowledgedPagination="unacknowledgedPagination"
					:activeView="activeView"
					:activeProject="activeProject"
					:projects="projects"
					:initial-sort-option="sortOption"
					:initial-min-size-bytes="minSizeBytes"
					:has-duplicates="hasDuplicates"
					:pagination-reset-token="paginationResetToken"
					@open-duplicate="openDuplicate"
					@open-settings="settingsOpen = true"
					@open-projects="settingsOpen = true"
					@view-project="viewProject"
					@show-help="showHelp"
					@query-options-changed="handleQueryOptionsChanged"
					@filtered-duplicates-changed="onFilteredDuplicatesChanged"
					@folder-filter-changed="onFolderFilterChanged"
					@load-more-start="onLoadMoreStart"
					@update-acknowledged-duplicates="updateAcknowledgedDuplicates"
					@update-unacknowledged-duplicates="updateUnacknowledgedDuplicates" />
			</div>

			<NcAppContent>
				<div
					v-if="activeView === 'details' || activeView === 'bulk-delete'"
					class="app-content-topbar">
					<div
						class="topbar-summary"
						:class="{ 'has-count-tooltip': activeView !== 'bulk-delete' }">
						<h2
							class="topbar-title"
							:data-tooltip="activeView !== 'bulk-delete' ? duplicateCountTooltipText : null">
							{{ activeView === 'bulk-delete'
								? t('duplicatefinder', 'Bulk Delete')
								: (totalDuplicateCount > 0
									? t('duplicatefinder', 'Duplicates ({count})', { count: totalDuplicateCount })
									: t('duplicatefinder', 'Duplicates')) }}
						</h2>
						<span
							v-if="activeView !== 'bulk-delete'"
							class="topbar-count-help"
							tabindex="0"
							role="button"
							:data-tooltip="duplicateCountTooltipText"
							:aria-label="duplicateCountTooltipText">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="15"
								height="15"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true">
								<circle cx="12" cy="12" r="10"></circle>
								<line x1="12" y1="16" x2="12" y2="12"></line>
								<line x1="12" y1="8" x2="12.01" y2="8"></line>
							</svg>
						</span>
						<div
							v-if="activeView !== 'bulk-delete'"
							class="topbar-count-tooltip"
							role="tooltip">
							<div class="topbar-count-tooltip__title">
								{{ t('duplicatefinder', 'Active duplicate groups in current scan ({total})', { total: totalDuplicateCount }) }}
							</div>
							<ul class="topbar-count-tooltip__list">
								<li>{{ t('duplicatefinder', 'Unacknowledged groups ({count})', { count: unacknowledgedDuplicateCount }) }}</li>
								<li>{{ t('duplicatefinder', 'Acknowledged groups ({count})', { count: acknowledgedDuplicateCount }) }}</li>
								<li>{{ t('duplicatefinder', 'Excluded folders and ignored files are not counted.') }}</li>
								<li>{{ t('duplicatefinder', 'Reflects active scan results matching your current size filter.') }}</li>
							</ul>
						</div>
					</div>
					<div class="topbar-actions">
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-scan-button"
							:disabled="isScanRunning"
							:title="t('duplicatefinder', 'Scan storage for duplicate files')"
							@click="triggerScan">
							<svg
								class="topbar-scan-icon"
								:class="{ 'is-spinning': isScanRunning }"
								xmlns="http://www.w3.org/2000/svg"
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true">
								<path d="M21 12a9 9 0 1 1-2.64-6.36"></path>
								<polyline points="21 3 21 9 15 9"></polyline>
							</svg>
							<span>{{ isScanRunning ? t('duplicatefinder', 'Scanning...') : t('duplicatefinder', 'Scan') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-empty-folders-button"
							:title="t('duplicatefinder', 'Detect and delete empty folders after cleanup')"
							@click="openEmptyFoldersModal">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true">
								<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
								<line x1="9" y1="14" x2="15" y2="14"></line>
							</svg>
							<span>{{ t('duplicatefinder', 'Empty Folders') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-treemap-button"
							:class="{ 'is-active': treemapOpen }"
							:disabled="!hasDuplicates"
							:aria-pressed="treemapOpen ? 'true' : 'false'"
							aria-keyshortcuts="t"
							:title="t('duplicatefinder', 'Toggle interactive storage treemap')"
							@click="toggleTreemap">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true">
								<rect x="3" y="3" width="11" height="11" rx="1"></rect>
								<rect x="16" y="3" width="5" height="7" rx="1"></rect>
								<rect x="16" y="12" width="5" height="9" rx="1"></rect>
								<rect x="3" y="16" width="11" height="5" rx="1"></rect>
							</svg>
							<span>{{ t('duplicatefinder', 'Treemap') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-history-button"
							:class="{ 'is-active': historyOpen }"
							:aria-pressed="historyOpen ? 'true' : 'false'"
							aria-keyshortcuts="h"
							:title="t('duplicatefinder', 'Toggle scan history and space reclamation timeline')"
							@click="toggleHistory">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true">
								<circle
									cx="12"
									cy="12"
									r="9" />
								<polyline points="12 7 12 12 15 15" />
							</svg>
							<span>{{ t('duplicatefinder', 'History') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-similarity-button"
							:class="{ 'is-active': similarityOpen }"
							:disabled="!hasDuplicates"
							:aria-pressed="similarityOpen ? 'true' : 'false'"
							aria-keyshortcuts="f"
							:title="t('duplicatefinder', 'Toggle similarity threshold and fuzzy match inspector')"
							@click="toggleSimilarityInspector">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true">
								<line x1="4" y1="21" x2="4" y2="14" />
								<line x1="4" y1="10" x2="4" y2="3" />
								<line x1="12" y1="21" x2="12" y2="12" />
								<line x1="12" y1="8" x2="12" y2="3" />
								<line x1="20" y1="21" x2="20" y2="16" />
								<line x1="20" y1="12" x2="20" y2="3" />
								<line x1="1" y1="14" x2="7" y2="14" />
								<line x1="9" y1="8" x2="15" y2="8" />
								<line x1="17" y1="16" x2="23" y2="16" />
							</svg>
							<span>{{ t('duplicatefinder', 'Similarity') }}</span>
						</button>
						<button
							v-if="activeView !== 'bulk-delete'"
							type="button"
							class="topbar-bulk-delete-button"
							:disabled="!hasDuplicates"
							:title="hasDuplicates
								? t('duplicatefinder', 'Preview and delete multiple duplicates at once')
								: t('duplicatefinder', 'No duplicates available for bulk deletion')"
							aria-keyshortcuts="b"
							@click="openBulkDelete">
							<Delete :size="18" />
							<span>{{ t('duplicatefinder', 'Bulk Delete') }}</span>
						</button>
						<NcButton
							v-else-if="activeView === 'bulk-delete'"
							type="secondary"
							class="topbar-back-button"
							aria-keyshortcuts="b"
							@click="closeBulkDelete">
							{{ t('duplicatefinder', 'Back to duplicates') }}
						</NcButton>
					</div>
				</div>

				<div
					v-if="isScanRunning"
					class="scan-progress-banner"
					role="status"
					aria-live="polite">
					<div class="scan-progress-header">
						<div class="scan-progress-info">
							<span class="scan-progress-title">{{ t('duplicatefinder', 'Scanning for duplicates...') }}</span>
							<span
								v-if="!scanStatus.indeterminate && scanStatus.totalFiles > 0"
								class="scan-progress-counts">
								{{ t('duplicatefinder', '{scanned} / {total} files ({percent}%)', {
									scanned: scanStatus.scannedFiles,
									total: scanStatus.totalFiles,
									percent: scanStatus.percentage,
								}) }}
							</span>
							<span
								v-else-if="scanStatus.scannedFiles > 0"
								class="scan-progress-counts">
								{{ t('duplicatefinder', '{scanned} files scanned', { scanned: scanStatus.scannedFiles }) }}
							</span>
						</div>
						<span v-if="formattedEta" class="scan-progress-eta">
							{{ t('duplicatefinder', 'Estimated remaining {eta}', { eta: formattedEta }) }}
						</span>
					</div>
					<div
						class="scan-progress-track"
						role="progressbar"
						:aria-valuenow="scanStatus.indeterminate ? null : scanStatus.percentage"
						aria-valuemin="0"
						aria-valuemax="100">
						<div
							class="scan-progress-fill"
							:class="{ 'is-indeterminate': scanStatus.indeterminate || scanStatus.totalFiles === 0 }"
							:style="(scanStatus.indeterminate || scanStatus.totalFiles === 0) ? {} : { width: `${scanStatus.percentage}%` }" />
					</div>
				</div>

				<template v-if="activeView === 'bulk-delete'">
					<BulkDeletionSettings
						@duplicates-deleted="refreshDuplicates"
						@reclamation-recorded="onReclamationRecorded"
						@folders-touched="recordTouchedFolders" />
				</template>
				<template v-else-if="activeView === 'project'">
					<ProjectDuplicates
						:projectId="activeProject"
						@back-to-projects="backToProjects"
						@view-duplicate="viewProjectDuplicate" />
				</template>
				<template v-else-if="activeView === 'project-duplicate'">
					<DuplicateDetails
						ref="projectDuplicateDetails"
						:duplicate="projectDuplicate"
						@duplicate-resolved="backToProject"
						@duplicateUpdated="updateDuplicate"
						@openSettings="settingsOpen = true"
						@reclamation-recorded="onReclamationRecorded"
						@folders-touched="recordTouchedFolders"
						@duplicatesSearchCompleted="backToProject" />
				</template>
				<template v-else>
					<SpaceReclamationTimeline
						v-if="historyOpen"
						:history-state="reclamationHistory"
						:current-backlog="currentReclamationBacklog"
						@clear-history="onClearReclamationHistory"
						@close="historyOpen = false" />
					<SimilarityInspector
						v-if="similarityOpen"
						:duplicates="treemapSourceDuplicates"
						:current-duplicate="currentDuplicate"
						@select-duplicate="onSimilaritySelectDuplicate"
						@compare-duplicate="onSimilarityCompareDuplicate"
						@start-scan="triggerScan"
						@close="similarityOpen = false" />
					<DuplicateTreemap
						v-if="treemapOpen"
						:duplicates="treemapSourceDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						:current-duplicate-hash="currentDuplicate ? (currentDuplicate.hash || '') : ''"
						:synced-folder-filter="treemapSyncedFolder"
						@select-duplicate="onTreemapSelectDuplicate"
						@sync-folder-filter="onTreemapSyncFolderFilter"
						@close="treemapOpen = false" />
					<DuplicateDetails
						ref="duplicateDetails"
						:duplicate="currentDuplicate"
						:is-scanning="isScanRunning"
						@duplicate-resolved="handleDuplicateResolved"
						@duplicateUpdated="updateDuplicate"
						@openSettings="settingsOpen = true"
						@startScan="triggerScan"
						@reclamation-recorded="onReclamationRecorded"
						@folders-touched="recordTouchedFolders"
						@duplicatesSearchCompleted="refreshDuplicates" />
				</template>
			</NcAppContent>

			<NcAppSettingsDialog
				:open.sync="settingsOpen"
				:show-navigation="true"
				:name="t('duplicatefinder', 'Duplicate Finder Settings')">
				<NcAppSettingsSection
					id="filters"
					:name="t('duplicatefinder', 'Filters')">
					<template #icon>
						<FilterOutline :size="20" />
					</template>
					<FilterSettings
						:duplicates="allLoadedDuplicates"
						@filters-changed="refreshDuplicates" />
				</NcAppSettingsSection>

				<NcAppSettingsSection
					id="origin-folders"
					:name="t('duplicatefinder', 'Origin Folders')">
					<template #icon>
						<Folder :size="20" />
					</template>
					<OriginFoldersSettings @origin-folders-changed="refreshDuplicates" />
				</NcAppSettingsSection>

				<NcAppSettingsSection
					id="excluded-folders"
					:name="t('duplicatefinder', 'Excluded Folders')">
					<template #icon>
						<FolderRemove :size="20" />
					</template>
					<ExcludedFoldersSettings @excluded-folders-changed="refreshDuplicates" />
				</NcAppSettingsSection>

				<NcAppSettingsSection
					id="projects"
					:name="t('duplicatefinder', 'Projects')">
					<template #icon>
						<FolderMultiple :size="20" />
					</template>
					<ProjectsSettings @view-project="viewProject" />
				</NcAppSettingsSection>
			</NcAppSettingsDialog>

			<NcModal
				v-if="helpModalOpen"
				:title="helpModalTitle"
				@close="helpModalOpen = false">
				<div class="help-content">
					<OnboardingGuide v-if="currentHelpSection === 'guide'" :show="true" @close="helpModalOpen = false" />
					<UsageExamples v-if="currentHelpSection === 'examples'" :show="true" @close="helpModalOpen = false" />
					<FAQ v-if="currentHelpSection === 'faq'" :show="true" @close="helpModalOpen = false" />
				</div>
			</NcModal>

			<NcModal
				v-if="emptyFoldersModalOpen"
				size="large"
				:title="t('duplicatefinder', 'Empty Folders Cleanup')"
				@close="emptyFoldersModalOpen = false">
				<div class="empty-folders-modal">
					<h3 class="empty-folders-modal__title">
						{{ t('duplicatefinder', 'Empty Folders Cleanup') }}
					</h3>
					<p class="empty-folders-modal__hint">
						{{ t('duplicatefinder', 'Finds folders left empty after removing duplicates. You can optionally delete them. Protected and excluded folders remain untouched.') }}
					</p>
					<div class="empty-folders-modal__toolbar">
						<div class="empty-folders-modal__toolbar-left">
							<button
								type="button"
								class="empty-folders-scan-btn"
								:disabled="emptyFoldersLoading || emptyFoldersDeleting"
								@click="scanEmptyFoldersInModal(false)">
								{{ t('duplicatefinder', 'Scan folders') }}
							</button>
							<button
								v-if="recentCleanedPaths.length > 0"
								type="button"
								class="empty-folders-pill-btn"
								:disabled="emptyFoldersLoading || emptyFoldersDeleting"
								@click="scanEmptyFoldersInModal(true)">
								{{ t('duplicatefinder', 'Check cleaned locations') }}
							</button>
						</div>
						<div class="empty-folders-modal__toolbar-right">
							<button
								v-if="activeModalEmptyFolders.length > 0"
								type="button"
								class="empty-folders-unselect-link"
								:disabled="emptyFoldersLoading || emptyFoldersDeleting"
								@click="toggleSelectAllModalEmptyFolders">
								{{ isAllModalEmptyFoldersSelected ? t('duplicatefinder', 'Unselect all') : t('duplicatefinder', 'Select all') }}
							</button>
							<button
								v-if="selectedModalEmptyFolders.length > 0"
								type="button"
								class="empty-folders-pill-btn modal-ignore-empty-folders-button"
								:disabled="emptyFoldersLoading || emptyFoldersDeleting"
								@click="ignoreSelectedModalEmptyFolders">
								{{ t('duplicatefinder', 'Ignore: {count}', { count: selectedModalEmptyFolders.length }) }}
							</button>
							<button
								v-if="ignoredModalEmptyFoldersCount > 0"
								type="button"
								class="empty-folders-pill-btn modal-toggle-ignored-folders-button"
								:disabled="emptyFoldersLoading || emptyFoldersDeleting"
								@click="showIgnoredModalEmptyFolders = !showIgnoredModalEmptyFolders">
								{{ showIgnoredModalEmptyFolders
									? t('duplicatefinder', 'Hide: {count}', { count: ignoredModalEmptyFoldersCount })
									: t('duplicatefinder', 'Show: {count}', { count: ignoredModalEmptyFoldersCount }) }}
							</button>
							<button
								v-if="ignoredModalEmptyFoldersCount > 0 || ignoredEmptyFolders.length > 0"
								type="button"
								class="empty-folders-pill-btn empty-folders-reset-btn modal-reset-ignored-folders-button"
								:disabled="emptyFoldersLoading || emptyFoldersDeleting"
								:title="t('duplicatefinder', 'Restore all ignored folders')"
								:aria-label="t('duplicatefinder', 'Restore all ignored folders')"
								@click="resetIgnoredModalEmptyFolders">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="16"
									height="16"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true">
									<polyline points="1 4 1 10 7 10"></polyline>
									<path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
								</svg>
							</button>
						</div>
					</div>

					<div v-if="!emptyFoldersLoading && modalEmptyFolders.length > 0" class="empty-folders-modal__summary">
						<div class="empty-folders-modal__found-count">
							{{ t('duplicatefinder', 'Empty folders found: {count}', { count: activeModalEmptyFolders.length }) }}
						</div>
						<button
							type="button"
							class="empty-folders-delete-pill modal-delete-empty-folders-button"
							:disabled="emptyFoldersLoading || emptyFoldersDeleting || selectedModalEmptyFolders.length === 0"
							@click="deleteSelectedModalEmptyFolders">
							{{ t('duplicatefinder', 'Permanently delete {count} folders', { count: selectedModalEmptyFolders.length }) }}
						</button>
						<h4 v-if="visibleModalEmptyFolders.length > 0" class="empty-folders-modal__section-title">
							{{ t('duplicatefinder', 'Selected folders') }}
						</h4>
					</div>

					<div v-if="emptyFoldersLoading" class="empty-folders-modal__status">
						<NcLoadingIcon :size="24" />
						<span>{{ t('duplicatefinder', 'Scanning for empty folders...') }}</span>
					</div>
					<div v-else-if="modalEmptyFoldersScanned && modalEmptyFolders.length === 0" class="empty-folders-modal__status">
						<span>{{ t('duplicatefinder', 'No empty folders were found.') }}</span>
					</div>
					<div v-else-if="modalEmptyFoldersScanned && visibleModalEmptyFolders.length === 0" class="empty-folders-modal__status">
						<span>{{ t('duplicatefinder', 'All detected empty folders are currently ignored ({count}).', { count: ignoredModalEmptyFoldersCount }) }}</span>
						<button
							v-if="ignoredModalEmptyFoldersCount > 0 || ignoredEmptyFolders.length > 0"
							type="button"
							class="empty-folders-pill-btn modal-restore-all-ignored-button"
							:disabled="emptyFoldersLoading || emptyFoldersDeleting"
							@click="resetIgnoredModalEmptyFolders">
							{{ t('duplicatefinder', 'Restore all') }}
						</button>
					</div>
					<div v-else-if="visibleModalEmptyFolders.length > 0" class="empty-folders-modal__list">
						<div
							v-for="folder in visibleModalEmptyFolders"
							:key="folder.path"
							class="empty-folders-modal__item"
							:class="{
								'is-selected': selectedModalEmptyFolders.includes(folder.path),
								'is-ignored': isEmptyFolderIgnored(folder.path)
							}">
							<input
								type="checkbox"
								class="empty-folder-checkbox"
								:checked="selectedModalEmptyFolders.includes(folder.path)"
								:disabled="isEmptyFolderIgnored(folder.path)"
								@change="toggleModalEmptyFolder(folder.path)">
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
								<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
							</svg>
							<span
								class="empty-folders-modal__path"
								@click="!isEmptyFolderIgnored(folder.path) && toggleModalEmptyFolder(folder.path)">
								{{ folder.path }}
							</span>
							<span v-if="folder.hasEmptySubfolders" class="empty-folders-modal__badge">
								{{ t('duplicatefinder', 'Includes empty subfolders') }}
							</span>
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
								@click.stop="toggleIgnoreModalEmptyFolder(folder.path)">
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
									<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
									<circle cx="12" cy="12" r="3"></circle>
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
									<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
									<line x1="1" y1="1" x2="23" y2="23"></line>
								</svg>
							</button>
						</div>
					</div>

					<div
						v-if="confirmDialog.open && emptyFoldersModalOpen"
						class="nc-confirm-dialog-backdrop"
						role="presentation"
						@click.self="resolveConfirmDialog(false)"
						@keydown.esc="resolveConfirmDialog(false)">
						<div
							class="nc-confirm-dialog"
							role="alertdialog"
							aria-modal="true"
							aria-labelledby="app-nc-confirm-title"
							aria-describedby="app-nc-confirm-desc">
							<div class="nc-confirm-dialog__header">
								<span class="nc-confirm-dialog__icon" aria-hidden="true">
									<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
										<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
										<line x1="12" y1="9" x2="12" y2="13"></line>
										<line x1="12" y1="17" x2="12.01" y2="17"></line>
									</svg>
								</span>
								<h4 id="app-nc-confirm-title" class="nc-confirm-dialog__title">
									{{ confirmDialog.title }}
								</h4>
							</div>
							<p id="app-nc-confirm-desc" class="nc-confirm-dialog__message">
								{{ confirmDialog.message }}
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
			</NcModal>

			<div
				v-if="confirmDialog.open && !emptyFoldersModalOpen"
				class="nc-confirm-dialog-backdrop"
				role="presentation"
				@click.self="resolveConfirmDialog(false)"
				@keydown.esc="resolveConfirmDialog(false)">
				<div
					class="nc-confirm-dialog"
					role="alertdialog"
					aria-modal="true"
					aria-labelledby="app-nc-confirm-title"
					aria-describedby="app-nc-confirm-desc">
					<div class="nc-confirm-dialog__header">
						<span class="nc-confirm-dialog__icon" aria-hidden="true">
							<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
								<line x1="12" y1="9" x2="12" y2="13"></line>
								<line x1="12" y1="17" x2="12.01" y2="17"></line>
							</svg>
						</span>
						<h4 id="app-nc-confirm-title" class="nc-confirm-dialog__title">
							{{ confirmDialog.title }}
						</h4>
					</div>
					<p id="app-nc-confirm-desc" class="nc-confirm-dialog__message">
						{{ confirmDialog.message }}
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

			<dialog
				ref="shortcutsDialog"
				class="shortcuts-dialog"
				aria-labelledby="shortcuts-dialog-title"
				@cancel.prevent="closeShortcutsDialog"
				@close="onShortcutsDialogClose"
				@click="onShortcutsDialogBackdropClick">
				<div class="shortcuts-dialog__surface">
					<header class="shortcuts-dialog__header">
						<h3 id="shortcuts-dialog-title" class="shortcuts-dialog__title">
							{{ t('duplicatefinder', 'Keyboard shortcuts') }}
						</h3>
						<button
							type="button"
							class="shortcuts-dialog__close"
							:title="t('duplicatefinder', 'Close')"
							:aria-label="t('duplicatefinder', 'Close')"
							@click="closeShortcutsDialog">
							<svg
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
								<line x1="18" y1="6" x2="6" y2="18" />
								<line x1="6" y1="6" x2="18" y2="18" />
							</svg>
						</button>
					</header>
					<div class="shortcuts-dialog__body">
						<dl class="shortcuts-dialog__list">
							<div
								v-for="shortcut in keyboardShortcutItems"
								:key="shortcut.id"
								class="shortcuts-dialog__row">
								<dt class="shortcuts-dialog__keys">
									<kbd
										v-for="keyLabel in shortcut.keyLabels"
										:key="keyLabel"
										class="shortcuts-dialog__kbd">
										{{ keyLabel }}
									</kbd>
								</dt>
								<dd class="shortcuts-dialog__description">
									{{ shortcut.description }}
								</dd>
							</div>
						</dl>
					</div>
				</div>
			</dialog>
		</template>
	</NcContent>
</template>


<script>
import { NcAppContent, NcContent, NcLoadingIcon, NcAppSettingsDialog, NcAppSettingsSection, NcButton, NcModal } from '@nextcloud/vue';
import DuplicateNavigation from './components/DuplicateNavigation.vue';
import DuplicateDetails from './components/DuplicateDetails.vue';
import DuplicateTreemap from './components/DuplicateTreemap.vue';
import SpaceReclamationTimeline from './components/SpaceReclamationTimeline.vue';
import SimilarityInspector from './components/SimilarityInspector.vue';
import OriginFoldersSettings from './components/OriginFoldersSettings.vue';
import ExcludedFoldersSettings from './components/ExcludedFoldersSettings.vue';
import BulkDeletionSettings from './components/BulkDeletionSettings.vue';
import ProjectsSettings from './components/ProjectsSettings.vue';
import ProjectDuplicates from './components/ProjectDuplicates.vue';
import OnboardingGuide from './components/help/OnboardingGuide.vue';
import UsageExamples from './components/help/UsageExamples.vue';
import FAQ from './components/help/FAQ.vue';
import * as api from '@/tools/api';
import {
	removeDuplicateFromList,
	loadUiPreferences,
	saveUiPreferences,
	formatScanEta,
} from '@/tools/utils';
import {
	SHORTCUT_DEFINITIONS,
	buildNavigableDuplicates,
	resolveShortcutAction,
	stepDuplicateSelection,
} from '@/tools/keyboardShortcuts';
import {
	clearReclamationHistory,
	computeDuplicateBacklogSnapshot,
	loadReclamationHistory,
	recordCleanupBatch,
	recordScanSnapshot,
	saveReclamationHistory,
} from '@/tools/reclamationHistory';
import Folder from 'vue-material-design-icons/Folder';
import FolderRemove from 'vue-material-design-icons/FolderRemove';
import FolderMultiple from 'vue-material-design-icons/FolderMultiple';
import Delete from 'vue-material-design-icons/Delete';
import FilterOutline from 'vue-material-design-icons/FilterOutline';
import FilterSettings from './components/FilterSettings.vue';

const {
	fetchDuplicates,
	fetchProjects,
	fetchScanStatus,
	startUserScan,
	notifyScanStarted,
	notifyScanCompleted,
	notifyScanFailed,
} = api;

const KEEP_SHORTCUT_RULES = Object.freeze({
	'keep-oldest': 'oldest',
	'keep-newest': 'newest',
	'keep-shortest-path': 'shortest_path',
});

export default {
	name: 'DuplicateFinder',
	components: {
		NcAppContent,
		NcContent,
		NcLoadingIcon,
		NcButton,
		NcModal,
		DuplicateNavigation,
		DuplicateDetails,
		DuplicateTreemap,
		SpaceReclamationTimeline,
		SimilarityInspector,
		OriginFoldersSettings,
		ExcludedFoldersSettings,
		BulkDeletionSettings,
		ProjectsSettings,
		ProjectDuplicates,
		NcAppSettingsDialog,
		NcAppSettingsSection,
		Folder,
		FolderRemove,
		FolderMultiple,
		Delete,
		FilterOutline,
		OnboardingGuide,
		UsageExamples,
		FAQ,
		FilterSettings
	},
	data() {
		const savedPreferences = loadUiPreferences();
		return {
			acknowledgedDuplicates: [],
			unacknowledgedDuplicates: [],
			currentDuplicate: null,
			isLoading: false,
			page: 1,
			limit: 50,
			sortOption: savedPreferences.sortOption,
			minSizeBytes: savedPreferences.minSizeBytes,
			settingsOpen: false,
			treemapOpen: false,
			historyOpen: false,
			similarityOpen: false,
			reclamationHistory: loadReclamationHistory(),
			filteredDuplicatesForTreemap: null,
			treemapSyncedFolder: '',
			activeView: 'details',
			acknowledgedPagination: {
				currentPage: 1,
				totalPages: 1
			},
			unacknowledgedPagination: {
				currentPage: 1,
				totalPages: 1
			},
			paginationResetToken: 0,
			pendingOffsetDelta: {
				acknowledged: 0,
				unacknowledged: 0,
			},
			helpModalOpen: false,
			currentHelpSection: 'guide',
			emptyFoldersModalOpen: false,
			emptyFoldersLoading: false,
			emptyFoldersDeleting: false,
			modalEmptyFoldersScanned: false,
			modalEmptyFolders: [],
			selectedModalEmptyFolders: [],
			ignoredEmptyFolders: Array.isArray(savedPreferences.ignoredEmptyFolders)
				? [...savedPreferences.ignoredEmptyFolders]
				: [],
			showIgnoredModalEmptyFolders: false,
			recentCleanedPaths: [],
			confirmDialog: {
				open: false,
				title: '',
				message: '',
				confirmLabel: '',
				resolver: null,
			},
			activeProject: null,
			projectDuplicate: null,
			projects: [],
			scanStatus: {
				running: false,
				indeterminate: false,
				scannedFiles: 0,
				totalFiles: 0,
				percentage: 0,
				startedAt: null,
				updatedAt: null,
				completedAt: null,
				completedSeq: 0,
				etaSeconds: null,
			},
			lastCompletedSeq: 0,
			wasTrackingActiveScan: false,
			scanPollTimer: null,
			visibilityHandler: null,
			keydownHandler: null,
			shortcutsDialogOpen: false,
			lastFocusedBeforeShortcuts: null,
		};
	},
	computed: {
		hasDuplicates() {
			return this.acknowledgedDuplicates.length > 0 || this.unacknowledgedDuplicates.length > 0
		},
		treemapSourceDuplicates() {
			if (Array.isArray(this.filteredDuplicatesForTreemap)) {
				return this.filteredDuplicatesForTreemap
			}
			const unacknowledged = Array.isArray(this.unacknowledgedDuplicates) ? this.unacknowledgedDuplicates : []
			const acknowledged = Array.isArray(this.acknowledgedDuplicates) ? this.acknowledgedDuplicates : []
			return [...unacknowledged, ...acknowledged]
		},
		activeModalEmptyFolders() {
			const ignoredSet = new Set(this.ignoredEmptyFolders)
			return this.modalEmptyFolders.filter(folder => !ignoredSet.has(folder.path))
		},
		ignoredModalEmptyFoldersCount() {
			const ignoredSet = new Set(this.ignoredEmptyFolders)
			return this.modalEmptyFolders.filter(folder => ignoredSet.has(folder.path)).length
		},
		visibleModalEmptyFolders() {
			return this.showIgnoredModalEmptyFolders
				? this.modalEmptyFolders
				: this.activeModalEmptyFolders
		},
		isAllModalEmptyFoldersSelected() {
			return this.activeModalEmptyFolders.length > 0
				&& this.activeModalEmptyFolders.every(folder => this.selectedModalEmptyFolders.includes(folder.path))
		},
		isScanRunning() {
			return Boolean(this.scanStatus && this.scanStatus.running)
		},
		formattedEta() {
			return this.isScanRunning ? formatScanEta(this.scanStatus.etaSeconds) : ''
		},
		unacknowledgedDuplicateCount() {
			if (this.unacknowledgedPagination && this.unacknowledgedPagination.hasMore === false) {
				return this.unacknowledgedDuplicates.length
			}
			return Number.isFinite(this.unacknowledgedPagination?.totalItems)
				? this.unacknowledgedPagination.totalItems
				: this.unacknowledgedDuplicates.length
		},
		acknowledgedDuplicateCount() {
			if (this.acknowledgedPagination && this.acknowledgedPagination.hasMore === false) {
				return this.acknowledgedDuplicates.length
			}
			return Number.isFinite(this.acknowledgedPagination?.totalItems)
				? this.acknowledgedPagination.totalItems
				: this.acknowledgedDuplicates.length
		},
		totalDuplicateCount() {
			return this.unacknowledgedDuplicateCount + this.acknowledgedDuplicateCount
		},
		allLoadedDuplicates() {
			const unack = Array.isArray(this.unacknowledgedDuplicates) ? this.unacknowledgedDuplicates : []
			const ack = Array.isArray(this.acknowledgedDuplicates) ? this.acknowledgedDuplicates : []
			return [...unack, ...ack]
		},
		currentReclamationBacklog() {
			return computeDuplicateBacklogSnapshot(
				this.allLoadedDuplicates,
				{
					unacknowledgedCount: this.unacknowledgedDuplicateCount,
					acknowledgedCount: this.acknowledgedDuplicateCount,
				},
				this.scanStatus
			)
		},
		duplicateCountTooltipText() {
			return t(
				'duplicatefinder',
				'Active duplicate groups in current scan ({total} total, {unacknowledged} unacknowledged, {acknowledged} acknowledged). Excluded folders and ignored files are not counted.',
				{
					total: this.totalDuplicateCount,
					unacknowledged: this.unacknowledgedDuplicateCount,
					acknowledged: this.acknowledgedDuplicateCount,
				}
			)
		},
		helpModalTitle() {
			const titles = {
				guide: t('duplicatefinder', 'Getting Started'),
				examples: t('duplicatefinder', 'Usage Examples'),
				faq: t('duplicatefinder', 'FAQ')
			}
			return titles[this.currentHelpSection] || t('duplicatefinder', 'Help')
		},
		currentHelpComponent() {
			const components = {
				guide: OnboardingGuide,
				examples: UsageExamples,
				faq: FAQ
			}
			return components[this.currentHelpSection]
		},
		keyboardShortcutItems() {
			const descriptions = {
				'next-duplicate': t('duplicatefinder', 'Select next duplicate group'),
				'previous-duplicate': t('duplicatefinder', 'Select previous duplicate group'),
				'jump-to-largest-group': t('duplicatefinder', 'Jump to largest reclaimable group'),
				'keep-oldest': t('duplicatefinder', 'Keep oldest copy in active group'),
				'keep-newest': t('duplicatefinder', 'Keep newest copy in active group'),
				'keep-shortest-path': t('duplicatefinder', 'Keep shortest path copy in active group'),
				'select-duplicate-copies': t('duplicatefinder', 'Select safe duplicate copies (keep oldest)'),
				'clear-selection': t('duplicatefinder', 'Clear current selection'),
				'copy-group-hash': t('duplicatefinder', 'Copy active group hash'),
				'export-csv-report': t('duplicatefinder', 'Export current duplicate report (CSV)'),
				'export-json-report': t('duplicatefinder', 'Export current duplicate report (JSON)'),
				'toggle-bulk-delete-view': t('duplicatefinder', 'Toggle Bulk Delete view'),
				'toggle-compare-view': t('duplicatefinder', 'Toggle side-by-side visual comparison'),
				'toggle-treemap': t('duplicatefinder', 'Toggle interactive storage treemap'),
				'toggle-reclamation-history': t('duplicatefinder', 'Toggle scan history and reclamation timeline'),
				'toggle-similarity-inspector': t('duplicatefinder', 'Toggle similarity threshold and fuzzy match inspector'),
				'toggle-acknowledge': t('duplicatefinder', 'Acknowledge or unacknowledge active group'),
				'focus-search': t('duplicatefinder', 'Focus duplicate search bar'),
				'cycle-min-size-filter': t('duplicatefinder', 'Cycle minimum file size filter'),
				'reset-filters': t('duplicatefinder', 'Reset all active filters and sorting'),
				'reset-all-filters': t('duplicatefinder', 'Reset all active filters'),
				'toggle-help': t('duplicatefinder', 'Toggle keyboard shortcuts help'),
				'close-help': t('duplicatefinder', 'Close keyboard shortcuts dialog'),
			}
			const keyLabelsMap = {
				ArrowDown: '↓',
				ArrowUp: '↑',
				Escape: 'Esc',
			}
			return SHORTCUT_DEFINITIONS.map(item => ({
				id: item.id,
				keyLabels: item.keys.map(key => keyLabelsMap[key] || key),
				description: descriptions[item.id] || item.id,
			}))
		},
	},
	async created() {
		this.visibilityHandler = () => {
			if (
				typeof document !== 'undefined'
				&& document.visibilityState === 'visible'
				&& (this.wasTrackingActiveScan || this.isScanRunning)
			) {
				this.pollScanStatus()
			}
		}
		if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
			document.addEventListener('visibilitychange', this.visibilityHandler)
		}
		await this.loadInitialData()
	},
	mounted() {
		this.keydownHandler = event => this.handleGlobalKeydown(event)
		if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
			window.addEventListener('keydown', this.keydownHandler)
		}
	},
	beforeDestroy() {
		this.clearScanPollTimer()
		if (this.visibilityHandler && typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
			document.removeEventListener('visibilitychange', this.visibilityHandler)
			this.visibilityHandler = null
		}
		if (this.keydownHandler && typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
			window.removeEventListener('keydown', this.keydownHandler)
			this.keydownHandler = null
		}
	},
	methods: {
		getNavigableDuplicatesList() {
			if (
				this.$refs.duplicateNavigation
				&& typeof this.$refs.duplicateNavigation.getNavigableDuplicates === 'function'
			) {
				return this.$refs.duplicateNavigation.getNavigableDuplicates()
			}
			return buildNavigableDuplicates(this.acknowledgedDuplicates, this.unacknowledgedDuplicates)
		},
		navigateDuplicateByShortcut(direction) {
			const list = this.getNavigableDuplicatesList()
			const currentId = this.currentDuplicate ? this.currentDuplicate.id : null
			const targetDuplicate = stepDuplicateSelection(list, currentId, direction)
			if (!targetDuplicate) {
				return null
			}
			this.openDuplicate(targetDuplicate)
			this.$nextTick(() => {
				if (
					this.$refs.duplicateNavigation
					&& typeof this.$refs.duplicateNavigation.scrollActiveDuplicateIntoView === 'function'
				) {
					this.$refs.duplicateNavigation.scrollActiveDuplicateIntoView()
				}
			})
			return targetDuplicate
		},
		focusSearchBar() {
			if (
				this.$refs.duplicateNavigation
				&& typeof this.$refs.duplicateNavigation.focusSearch === 'function'
				&& this.$refs.duplicateNavigation.focusSearch()
			) {
				return true
			}
			const fallbackInput = this.$el && typeof this.$el.querySelector === 'function'
				? this.$el.querySelector('.search-input')
				: null
			if (fallbackInput && typeof fallbackInput.focus === 'function') {
				fallbackInput.focus()
				return true
			}
			return false
		},
		resetNavigationFilters() {
			if (this.activeView !== 'details') {
				return false
			}
			const navigation = this.$refs.duplicateNavigation
			if (navigation && typeof navigation.resetActiveFilters === 'function') {
				return navigation.resetActiveFilters()
			}
			if (navigation && navigation.hasActiveFilters && typeof navigation.resetFilters === 'function') {
				navigation.resetFilters()
				return true
			}
			return false
		},
		/**
		 * Cycles the minimum file size filter in details view.
		 * @returns {boolean} True when the minimum file size filter was cycled.
		 */
		cycleMinSizeFilter() {
			if (this.activeView !== 'details') {
				return false
			}
			const navigation = this.$refs.duplicateNavigation
			if (navigation && typeof navigation.cycleMinSizeFilter === 'function') {
				return Boolean(navigation.cycleMinSizeFilter())
			}
			return false
		},
		/**
		 * Jump to the duplicate group with the largest reclaimable space in details view.
		 * @returns {boolean} True when a group was selected.
		 */
		jumpToLargestDuplicateGroup() {
			if (this.activeView !== 'details') {
				return false
			}
			const navigation = this.$refs.duplicateNavigation
			if (navigation && typeof navigation.jumpToLargestGroup === 'function') {
				return navigation.jumpToLargestGroup()
			}
			if (navigation && navigation.largestDuplicateGroup) {
				this.openDuplicate(navigation.largestDuplicateGroup)
				return true
			}
			return false
		},
		/**
		 * Export the currently filtered duplicate report using the given navigation method in details view.
		 * @param {string} methodName Method name on DuplicateNavigation ('exportFilteredCsv' | 'exportFilteredJson').
		 * @returns {boolean} True when a non-empty export was triggered.
		 */
		exportFilteredReport(methodName) {
			if (this.activeView !== 'details') {
				return false
			}
			const navigation = this.$refs.duplicateNavigation
			if (
				!navigation
				|| !Array.isArray(navigation.filteredDuplicatesForExport)
				|| navigation.filteredDuplicatesForExport.length === 0
			) {
				return false
			}
			if (typeof navigation[methodName] === 'function') {
				return Boolean(navigation[methodName]())
			}
			return false
		},
		/**
		 * Export the currently filtered duplicate report as CSV in details view.
		 * @returns {boolean} True when a non-empty CSV export was triggered.
		 */
		exportFilteredCsvReport() {
			return this.exportFilteredReport('exportFilteredCsv')
		},
		/**
		 * Export the currently filtered duplicate report as JSON in details view.
		 * @returns {boolean} True when a non-empty JSON export was triggered.
		 */
		exportFilteredJsonReport() {
			return this.exportFilteredReport('exportFilteredJson')
		},
		/**
		 * Toggles between the details triage view and the bulk-delete view.
		 * Never triggers any deletion automatically.
		 * @returns {boolean} True when the active view switched.
		 */
		toggleBulkDeleteView() {
			if (this.activeView === 'bulk-delete') {
				this.closeBulkDelete()
				return true
			}
			if (this.activeView === 'details' && this.hasDuplicates) {
				this.openBulkDelete()
				return true
			}
			return false
		},
		toggleTreemap() {
			if (this.activeView !== 'details' || !this.hasDuplicates) {
				return false
			}
			this.treemapOpen = !this.treemapOpen
			return true
		},
		toggleHistory() {
			if (this.activeView !== 'details') {
				return false
			}
			this.historyOpen = !this.historyOpen
			return true
		},
		toggleSimilarityInspector() {
			if (this.activeView !== 'details' || !this.hasDuplicates) {
				return false
			}
			this.similarityOpen = !this.similarityOpen
			return true
		},
		onSimilaritySelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onSimilarityCompareDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
			this.$nextTick(() => {
				const detailsComponent = this.getActiveDuplicateDetailsComponent()
				if (detailsComponent && typeof detailsComponent.openCompareMode === 'function') {
					detailsComponent.openCompareMode()
				}
			})
		},
		recordCurrentScanSnapshot(trigger = 'sync') {
			const updated = recordScanSnapshot(
				this.reclamationHistory,
				this.currentReclamationBacklog,
				{ trigger }
			)
			if (updated !== this.reclamationHistory) {
				this.reclamationHistory = updated
				saveReclamationHistory(undefined, updated)
			}
		},
		onReclamationRecorded(batch) {
			const updated = recordCleanupBatch(this.reclamationHistory, batch)
			if (updated !== this.reclamationHistory) {
				this.reclamationHistory = updated
				saveReclamationHistory(undefined, updated)
			}
		},
		onClearReclamationHistory() {
			this.reclamationHistory = clearReclamationHistory(undefined)
		},
		onFilteredDuplicatesChanged(list) {
			this.filteredDuplicatesForTreemap = Array.isArray(list) ? list : []
		},
		onFolderFilterChanged(folderQuery) {
			this.treemapSyncedFolder = typeof folderQuery === 'string' ? folderQuery.trim() : ''
		},
		onTreemapSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.openDuplicate(duplicate)
			this.$nextTick(() => {
				if (
					this.$refs.duplicateNavigation
					&& typeof this.$refs.duplicateNavigation.scrollActiveDuplicateIntoView === 'function'
				) {
					this.$refs.duplicateNavigation.scrollActiveDuplicateIntoView()
				}
			})
		},
		onTreemapSyncFolderFilter(folderPath) {
			const normalized = typeof folderPath === 'string' ? folderPath.trim() : ''
			this.treemapSyncedFolder = normalized
			if (
				this.$refs.duplicateNavigation
				&& typeof this.$refs.duplicateNavigation.setFolderFilter === 'function'
			) {
				this.$refs.duplicateNavigation.setFolderFilter(normalized)
			}
		},
		openShortcutsDialog() {
			this.lastFocusedBeforeShortcuts = typeof document !== 'undefined' ? document.activeElement : null
			this.shortcutsDialogOpen = true
			this.$nextTick(() => {
				const dialog = this.$refs.shortcutsDialog
				if (!dialog) {
					return
				}
				if (typeof dialog.showModal === 'function') {
					if (!dialog.open) {
						dialog.showModal()
					}
				} else {
					dialog.setAttribute('open', '')
				}
			})
		},
		closeShortcutsDialog() {
			this.shortcutsDialogOpen = false
			const dialog = this.$refs.shortcutsDialog
			if (dialog) {
				if (typeof dialog.close === 'function') {
					if (dialog.open) {
						dialog.close()
					}
				} else {
					dialog.removeAttribute('open')
				}
			}
			const previousFocus = this.lastFocusedBeforeShortcuts
			this.lastFocusedBeforeShortcuts = null
			if (previousFocus && typeof previousFocus.focus === 'function' && previousFocus.isConnected) {
				previousFocus.focus()
			}
		},
		toggleShortcutsDialog() {
			if (this.shortcutsDialogOpen) {
				this.closeShortcutsDialog()
			} else {
				this.openShortcutsDialog()
			}
		},
		onShortcutsDialogClose() {
			this.shortcutsDialogOpen = false
			const previousFocus = this.lastFocusedBeforeShortcuts
			this.lastFocusedBeforeShortcuts = null
			if (previousFocus && typeof previousFocus.focus === 'function' && previousFocus.isConnected) {
				previousFocus.focus()
			}
		},
		onShortcutsDialogBackdropClick(event) {
			if (event && event.target === this.$refs.shortcutsDialog) {
				this.closeShortcutsDialog()
			}
		},
		getActiveDuplicateDetailsComponent() {
			if (this.activeView === 'project-duplicate') {
				return this.$refs.projectDuplicateDetails || null
			}
			if (this.activeView === 'details') {
				return this.$refs.duplicateDetails || null
			}
			return null
		},
		hasOpenBlockingDialog() {
			const detailsComponent = this.getActiveDuplicateDetailsComponent()
			if (detailsComponent && detailsComponent.showDeleteConfirmDialog) {
				return true
			}
			if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
				const openDialogs = document.querySelectorAll('dialog[open]')
				for (const dialog of openDialogs) {
					if (dialog !== this.$refs.shortcutsDialog) {
						return true
					}
				}
			}
			if (typeof document !== 'undefined' && typeof document.querySelector === 'function') {
				const openAriaDialog = document.querySelector(
					'[role="dialog"]:not([aria-hidden="true"]), [role="alertdialog"]:not([aria-hidden="true"]), [aria-modal="true"]:not([aria-hidden="true"])'
				)
				if (openAriaDialog && openAriaDialog !== this.$refs.shortcutsDialog) {
					return true
				}
			}
			return false
		},
		handleGlobalKeydown(event) {
			const hasBlockingModal = Boolean(
				this.isLoading
				|| this.settingsOpen
				|| this.helpModalOpen
				|| this.emptyFoldersModalOpen
				|| (this.confirmDialog && this.confirmDialog.open)
				|| this.hasOpenBlockingDialog()
			)
			const action = resolveShortcutAction(event, {
				isHelpOpen: this.shortcutsDialogOpen,
				hasBlockingModal,
			})
			if (!action) {
				return
			}

			if (action === 'close-help') {
				if (typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				this.closeShortcutsDialog()
				return
			}

			if (action === 'toggle-help') {
				if (typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				this.toggleShortcutsDialog()
				return
			}

			if (action === 'focus-search') {
				if (typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				this.focusSearchBar()
				return
			}

			if (action === 'reset-filters' || action === 'reset-all-filters') {
				if (this.resetNavigationFilters() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'cycle-min-size-filter') {
				if (this.cycleMinSizeFilter() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'jump-to-largest-group') {
				if (this.jumpToLargestDuplicateGroup() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'export-csv-report') {
				if (this.exportFilteredCsvReport() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'export-json-report') {
				if (this.exportFilteredJsonReport() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-bulk-delete-view') {
				if (this.toggleBulkDeleteView() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-compare-view') {
				const detailsComponent = this.getActiveDuplicateDetailsComponent()
				if (
					!detailsComponent
					|| typeof detailsComponent.toggleCompareMode !== 'function'
					|| !detailsComponent.duplicate
					|| !Array.isArray(detailsComponent.duplicate.files)
					|| detailsComponent.duplicate.files.length <= 1
				) {
					return
				}
				if (detailsComponent.toggleCompareMode() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-treemap') {
				if (this.toggleTreemap() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-reclamation-history') {
				if (this.toggleHistory() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-similarity-inspector') {
				if (this.toggleSimilarityInspector() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-acknowledge') {
				const detailsComponent = this.getActiveDuplicateDetailsComponent()
				if (
					!detailsComponent
					|| typeof detailsComponent.toggleAcknowledge !== 'function'
					|| !detailsComponent.duplicate
					|| !Array.isArray(detailsComponent.duplicate.files)
					|| detailsComponent.duplicate.files.length <= 1
				) {
					return
				}
				if (detailsComponent.toggleAcknowledge() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			const keepRule = KEEP_SHORTCUT_RULES[action]
			if (keepRule) {
				const detailsComponent = this.getActiveDuplicateDetailsComponent()
				if (
					!detailsComponent
					|| typeof detailsComponent.applyKeepRule !== 'function'
					|| !detailsComponent.duplicate
					|| !Array.isArray(detailsComponent.duplicate.files)
					|| detailsComponent.duplicate.files.length <= 1
				) {
					return
				}
				if (typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				detailsComponent.applyKeepRule(keepRule)
				return
			}

			if (action === 'select-duplicate-copies') {
				const detailsComponent = this.getActiveDuplicateDetailsComponent()
				if (
					!detailsComponent
					|| typeof detailsComponent.selectAllFiles !== 'function'
					|| !detailsComponent.duplicate
					|| !Array.isArray(detailsComponent.duplicate.files)
					|| detailsComponent.duplicate.files.length <= 1
				) {
					return
				}
				if (detailsComponent.selectAllFiles() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'clear-selection') {
				const detailsComponent = this.getActiveDuplicateDetailsComponent()
				if (
					!detailsComponent
					|| typeof detailsComponent.clearSelection !== 'function'
					|| !detailsComponent.duplicate
					|| !Array.isArray(detailsComponent.duplicate.files)
					|| detailsComponent.duplicate.files.length <= 1
				) {
					return
				}
				if (typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				detailsComponent.clearSelection()
				return
			}

			if (action === 'copy-group-hash') {
				const detailsComponent = this.getActiveDuplicateDetailsComponent()
				if (
					!detailsComponent
					|| typeof detailsComponent.copyGroupHash !== 'function'
					|| !detailsComponent.duplicate
					|| !Array.isArray(detailsComponent.duplicate.files)
					|| detailsComponent.duplicate.files.length <= 1
					|| !detailsComponent.fullGroupHash
				) {
					return
				}
				if (typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				detailsComponent.copyGroupHash()
				return
			}

			if (action === 'next-duplicate' || action === 'previous-duplicate') {
				if (this.activeView !== 'details') {
					return
				}
				if (typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				this.navigateDuplicateByShortcut(action === 'previous-duplicate' ? 'previous' : 'next')
			}
		},
		onLoadMoreStart(section) {
			if (section === 'acknowledged' || section === 'unacknowledged') {
				this.pendingOffsetDelta[section] = 0
			}
		},
		adjustSectionPagination(section, delta) {
			if (!delta || (section !== 'acknowledged' && section !== 'unacknowledged')) {
				return
			}
			this.pendingOffsetDelta[section] = (this.pendingOffsetDelta[section] || 0) + delta
			const paginationKey = section === 'acknowledged' ? 'acknowledgedPagination' : 'unacknowledgedPagination'
			const current = this[paginationKey] || {}
			const updated = { ...current }
			if (Number.isFinite(updated.totalItems)) {
				updated.totalItems = Math.max(0, updated.totalItems + delta)
				const limit = Number(updated.limit) > 0 ? Number(updated.limit) : this.limit
				updated.totalPages = Math.max(1, Math.ceil(updated.totalItems / limit))
			}
			if (Number.isInteger(updated.nextOffset)) {
				updated.nextOffset = Math.max(0, updated.nextOffset + delta)
			}
			if (typeof updated.hasMore === 'boolean' && Number.isFinite(updated.totalItems) && Number.isInteger(updated.nextOffset)) {
				updated.hasMore = updated.hasMore && updated.nextOffset < updated.totalItems
			}
			this[paginationKey] = updated
		},
		handleDuplicateResolved({ duplicate, type }) {
			console.log('ISSUE146: App.handleDuplicateResolved called');
			console.log('ISSUE146: duplicate.id =', duplicate.id);
			console.log('ISSUE146: duplicate.hash =', duplicate.hash);
			console.log('ISSUE146: type =', type);

			// Remove from the appropriate list
			if (type === 'acknowledged') {
				console.log('ISSUE146: Removing from acknowledged list');
				const beforeLen = this.acknowledgedDuplicates.length;
				console.log('ISSUE146: acknowledged list length before =', beforeLen);
				this.acknowledgedDuplicates = this.acknowledgedDuplicates.filter(d => d.hash !== duplicate.hash);
				const removed = beforeLen - this.acknowledgedDuplicates.length;
				if (removed > 0) {
					this.adjustSectionPagination('acknowledged', -removed);
				}
				console.log('ISSUE146: acknowledged list length after =', this.acknowledgedDuplicates.length);
			} else {
				console.log('ISSUE146: Removing from unacknowledged list');
				const beforeLen = this.unacknowledgedDuplicates.length;
				console.log('ISSUE146: unacknowledged list length before =', beforeLen);
				this.unacknowledgedDuplicates = this.unacknowledgedDuplicates.filter(d => d.hash !== duplicate.hash);
				const removed = beforeLen - this.unacknowledgedDuplicates.length;
				if (removed > 0) {
					this.adjustSectionPagination('unacknowledged', -removed);
				}
				console.log('ISSUE146: unacknowledged list length after =', this.unacknowledgedDuplicates.length);
			}

			// Trigger DuplicateNavigation to find and select the next duplicate
			// This will respect the current sort order
			if (this.$refs.duplicateNavigation) {
				console.log('ISSUE146: Calling selectNextDuplicateAfterResolution on DuplicateNavigation');
				this.$refs.duplicateNavigation.selectNextDuplicateAfterResolution(duplicate, type);
			} else {
				console.log('ISSUE146: ERROR - duplicateNavigation ref not found!');
			}

			console.log('ISSUE146: currentDuplicate after resolution =', this.currentDuplicate ? this.currentDuplicate.id : 'null');
		},
		async removeDuplicate(duplicate) {
			console.log('App: removeDuplicate called with:', duplicate);
			// Get the updated lists after removing the duplicate
			const { acknowledgedDuplicates: newAcknowledged, unacknowledgedDuplicates: newUnacknowledged } =
				removeDuplicateFromList(duplicate, this.acknowledgedDuplicates, this.unacknowledgedDuplicates);

			console.log('App: Got updated lists:', {
				acknowledgedCount: newAcknowledged.length,
				unacknowledgedCount: newUnacknowledged.length
			});

			// Update both lists
			this.acknowledgedDuplicates = newAcknowledged;
			this.unacknowledgedDuplicates = newUnacknowledged;

			// If no duplicates left in either list, clear current duplicate
			if (newAcknowledged.length === 0 && newUnacknowledged.length === 0) {
				console.log('App: No duplicates left, clearing current duplicate');
				this.currentDuplicate = null;
				return;
			}

			// Find next duplicate to display based on the acknowledged status
			if (duplicate.acknowledged) {
				console.log('App: Setting next duplicate from acknowledged list');
				this.currentDuplicate = newAcknowledged[0] || newUnacknowledged[0] || null;
			} else {
				console.log('App: Setting next duplicate from unacknowledged list');
				this.currentDuplicate = newUnacknowledged[0] || newAcknowledged[0] || null;
			}

			console.log('App: New current duplicate:', this.currentDuplicate);

			// Refresh duplicates to ensure UI is up to date
			console.log('App: Refreshing duplicates');
			await this.refreshDuplicates();
			console.log('App: Refresh complete');
		},
		async updateDuplicate(updatedDuplicate) {
			// Check if the duplicate still has more than one file
			if (updatedDuplicate.files.length <= 1) {
				const prevAckLen = this.acknowledgedDuplicates.length;
				const prevUnackLen = this.unacknowledgedDuplicates.length;
				// Remove from both lists
				this.acknowledgedDuplicates = this.acknowledgedDuplicates.filter(d => d.id !== updatedDuplicate.id);
				this.unacknowledgedDuplicates = this.unacknowledgedDuplicates.filter(d => d.id !== updatedDuplicate.id);
				if (prevAckLen !== this.acknowledgedDuplicates.length) {
					this.adjustSectionPagination('acknowledged', this.acknowledgedDuplicates.length - prevAckLen);
				}
				if (prevUnackLen !== this.unacknowledgedDuplicates.length) {
					this.adjustSectionPagination('unacknowledged', this.unacknowledgedDuplicates.length - prevUnackLen);
				}
				this.currentDuplicate = null;
			} else {
				// Existing logic to update the duplicate
				const sourceSection = !updatedDuplicate.acknowledged ? 'acknowledged' : 'unacknowledged';
				const targetSection = !updatedDuplicate.acknowledged ? 'unacknowledged' : 'acknowledged';
				const sourceList = !updatedDuplicate.acknowledged ? this.acknowledgedDuplicates : this.unacknowledgedDuplicates;
				const targetList = !updatedDuplicate.acknowledged ? this.unacknowledgedDuplicates : this.acknowledgedDuplicates;
				const index = sourceList.findIndex(d => d.id === updatedDuplicate.id);

				if (index !== -1) {
					sourceList.splice(index, 1);
					targetList.push(updatedDuplicate);
					this.adjustSectionPagination(sourceSection, -1);
					this.adjustSectionPagination(targetSection, 1);
				}

				if (this.$refs.duplicateNavigation && typeof this.$refs.duplicateNavigation.selectNextDuplicateAfterResolution === 'function') {
					this.$refs.duplicateNavigation.selectNextDuplicateAfterResolution(updatedDuplicate, sourceSection);
				} else if (sourceList.length > 0) {
					const nextIndex = index < sourceList.length ? index : 0;
					this.currentDuplicate = sourceList[nextIndex];
				} else {
					this.currentDuplicate = targetList[0] || null;
				}
			}
		},
		moveToNext(duplicate) {
			const currentList = duplicate.acknowledged ? this.acknowledgedDuplicates : this.unacknowledgedDuplicates;
			const currentIndex = currentList.findIndex(d => d.id === duplicate.id);
			if (currentIndex !== -1 && currentIndex < currentList.length - 1) {
				this.currentDuplicate = currentList[currentIndex + 1];
			} else {
				this.currentDuplicate = currentList[0];
			}
		},
		async openDuplicate(duplicate) {
			this.activeView = 'details'
			this.currentDuplicate = duplicate
		},
		async handleQueryOptionsChanged({ sortBy, minSize }) {
			this.sortOption = sortBy || 'none';
			this.minSizeBytes = Number(minSize) > 0 ? Number(minSize) : 0;
			saveUiPreferences({
				sortOption: this.sortOption,
				minSizeBytes: this.minSizeBytes,
			});
			await this.refreshDuplicates({ silent: true });
		},
		async refreshDuplicates(options = {}) {
			const showSpinner = Boolean(options && options.fullScreen === true);
			if (showSpinner) {
				this.isLoading = true;
			}
			try {
				const queryOptions = {
					sortBy: this.sortOption,
					minSize: this.minSizeBytes
				};
				const [acknowledgedResponse, unacknowledgedResponse] = await Promise.all([
					fetchDuplicates('acknowledged', 50, 1, queryOptions),
					fetchDuplicates('unacknowledged', 50, 1, queryOptions)
				]);

				this.acknowledgedDuplicates = acknowledgedResponse.entities;
				this.unacknowledgedDuplicates = unacknowledgedResponse.entities;
				this.acknowledgedPagination = acknowledgedResponse.pagination;
				this.unacknowledgedPagination = unacknowledgedResponse.pagination;
				this.pendingOffsetDelta.acknowledged = 0;
				this.pendingOffsetDelta.unacknowledged = 0;
				this.paginationResetToken++;

				if (this.currentDuplicate) {
					const existsAcknowledged = this.acknowledgedDuplicates.find(d => d.id === this.currentDuplicate.id);
					const existsUnacknowledged = this.unacknowledgedDuplicates.find(d => d.id === this.currentDuplicate.id);
					if (existsAcknowledged) {
						this.currentDuplicate = existsAcknowledged;
					} else if (existsUnacknowledged) {
						this.currentDuplicate = existsUnacknowledged;
					} else {
						this.currentDuplicate = this.unacknowledgedDuplicates[0] || this.acknowledgedDuplicates[0] || null;
					}
				} else if (this.activeView === 'details') {
					this.currentDuplicate = this.unacknowledgedDuplicates[0] || this.acknowledgedDuplicates[0] || null;
				}
			} finally {
				if (showSpinner) {
					this.isLoading = false;
				}
			}
		},
		async loadInitialData() {
			this.isLoading = true
			try {
				const queryOptions = {
					sortBy: this.sortOption,
					minSize: this.minSizeBytes
				}
				const statusPromise = typeof fetchScanStatus === 'function'
					? fetchScanStatus().catch(() => null)
					: Promise.resolve(null)
				const [acknowledgedResponse, unacknowledgedResponse, projectsResponse, initialScanStatus] = await Promise.all([
					fetchDuplicates('acknowledged', 50, 1, queryOptions),
					fetchDuplicates('unacknowledged', 50, 1, queryOptions),
					fetchProjects(),
					statusPromise
				])

				this.acknowledgedDuplicates = acknowledgedResponse.entities
				this.unacknowledgedDuplicates = unacknowledgedResponse.entities
				this.acknowledgedPagination = acknowledgedResponse.pagination
				this.unacknowledgedPagination = unacknowledgedResponse.pagination
				this.projects = projectsResponse
				if (!this.currentDuplicate && this.activeView === 'details') {
					this.currentDuplicate = this.unacknowledgedDuplicates[0] || this.acknowledgedDuplicates[0] || null
				}
				if (initialScanStatus) {
					await this.applyScanStatus(initialScanStatus, { isInitial: true })
				}
				this.recordCurrentScanSnapshot('baseline')
			} catch (error) {
				console.error('Error loading initial data:', error)
			} finally {
				this.isLoading = false
			}
		},
		clearScanPollTimer() {
			if (this.scanPollTimer) {
				clearTimeout(this.scanPollTimer)
				this.scanPollTimer = null
			}
		},
		scheduleScanPoll(delayMs) {
			this.clearScanPollTimer()
			if (this._isDestroyed || typeof fetchScanStatus !== 'function') {
				return
			}
			this.scanPollTimer = setTimeout(() => {
				this.pollScanStatus()
			}, delayMs)
			if (this.scanPollTimer && typeof this.scanPollTimer.unref === 'function') {
				this.scanPollTimer.unref()
			}
		},
		async applyScanStatus(status, { isInitial = false } = {}) {
			if (!status || typeof status !== 'object') {
				return
			}
			const incomingSeq = Number.isFinite(Number(status.completedSeq)) ? Number(status.completedSeq) : 0
			if (isInitial) {
				this.lastCompletedSeq = incomingSeq
				this.wasTrackingActiveScan = false
				this.scanStatus = {
					...this.scanStatus,
					running: false,
					indeterminate: false,
					completedSeq: incomingSeq,
					etaSeconds: null,
				}
				return
			}

			const wasRunning = this.wasTrackingActiveScan || Boolean(this.scanStatus && this.scanStatus.running)
			this.scanStatus = { ...this.scanStatus, ...status }

			if (status.running) {
				this.wasTrackingActiveScan = true
				this.scheduleScanPoll(1500)
				return
			}

			const completedNewScan = incomingSeq > this.lastCompletedSeq || wasRunning
			if (incomingSeq > this.lastCompletedSeq) {
				this.lastCompletedSeq = incomingSeq
			}
			this.wasTrackingActiveScan = false
			this.clearScanPollTimer()

			if (completedNewScan) {
				await this.refreshDuplicates({ silent: true })
				this.recordCurrentScanSnapshot('manual')
				if (wasRunning && typeof notifyScanCompleted === 'function') {
					notifyScanCompleted()
				}
			}
		},
		async pollScanStatus() {
			if (this._isDestroyed || typeof fetchScanStatus !== 'function') {
				return
			}
			if (!this.wasTrackingActiveScan && !this.isScanRunning) {
				this.clearScanPollTimer()
				return
			}
			try {
				const status = await fetchScanStatus()
				if (!this._isDestroyed && status) {
					await this.applyScanStatus(status)
				} else if (!this._isDestroyed && (this.wasTrackingActiveScan || this.isScanRunning)) {
					this.scheduleScanPoll(2000)
				}
			} catch (error) {
				if (!this._isDestroyed && (this.wasTrackingActiveScan || this.isScanRunning)) {
					this.scheduleScanPoll(3000)
				}
			}
		},
		async triggerScan() {
			if (this.isScanRunning || typeof startUserScan !== 'function') {
				return
			}
			this.wasTrackingActiveScan = true
			this.scanStatus = {
				...this.scanStatus,
				running: true,
				indeterminate: true,
				scannedFiles: 0,
				totalFiles: 0,
				percentage: 0,
				etaSeconds: null,
			}
			if (typeof notifyScanStarted === 'function') {
				notifyScanStarted()
			}
			this.scheduleScanPoll(1200)

			try {
				const finalStatus = await startUserScan()
				if (!this._isDestroyed) {
					if (finalStatus) {
						await this.applyScanStatus(finalStatus)
					} else {
						this.scanStatus = { ...this.scanStatus, running: false, indeterminate: false, percentage: 100 }
						this.wasTrackingActiveScan = false
						this.clearScanPollTimer()
						await this.refreshDuplicates({ silent: true })
						this.recordCurrentScanSnapshot('manual')
						if (typeof notifyScanCompleted === 'function') {
							notifyScanCompleted()
						}
					}
				}
			} catch (error) {
				if (this._isDestroyed) {
					return
				}
				try {
					if (typeof fetchScanStatus === 'function') {
						const liveStatus = await fetchScanStatus()
						if (liveStatus && (liveStatus.running || Number(liveStatus.completedSeq) > this.lastCompletedSeq)) {
							await this.applyScanStatus(liveStatus)
							return
						}
					}
				} catch (pollErr) {
					// Ignore secondary status check error
				}
				this.wasTrackingActiveScan = false
				this.scanStatus = { ...this.scanStatus, running: false, indeterminate: false }
				this.clearScanPollTimer()
				if (typeof notifyScanFailed === 'function') {
					notifyScanFailed()
				}
			}
		},
		mergePaginatedDuplicates(section, newDuplicates, incomingPagination) {
			const listKey = section === 'acknowledged' ? 'acknowledgedDuplicates' : 'unacknowledgedDuplicates'
			const paginationKey = section === 'acknowledged' ? 'acknowledgedPagination' : 'unacknowledgedPagination'
			const currentList = Array.isArray(this[listKey]) ? this[listKey] : []
			const incomingList = Array.isArray(newDuplicates) ? newDuplicates : []

			if (incomingPagination === undefined) {
				const delta = incomingList.length - currentList.length
				this[listKey] = incomingList
				if (delta !== 0) {
					this.adjustSectionPagination(section, delta)
				}
				if (!this.currentDuplicate && this.activeView === 'details' && this[listKey].length > 0) {
					this.currentDuplicate = this[listKey][0]
				}
				return
			}

			const existingKeys = new Set(currentList.map(d => d && (d.hash || d.id)).filter(Boolean))
			const uniqueIncoming = incomingList.filter(d => {
				const key = d && (d.hash || d.id)
				if (!key) {
					return true
				}
				if (existingKeys.has(key)) {
					return false
				}
				existingKeys.add(key)
				return true
			})
			this[listKey] = [...currentList, ...uniqueIncoming]

			if (incomingPagination && typeof incomingPagination === 'object') {
				const delta = this.pendingOffsetDelta[section] || 0
				this.pendingOffsetDelta[section] = 0
				const mergedPagination = {
					...(this[paginationKey] || {}),
					...incomingPagination,
				}
				if (Number.isInteger(mergedPagination.nextOffset) && delta !== 0) {
					mergedPagination.nextOffset = Math.max(0, mergedPagination.nextOffset + delta)
				}
				if (Number.isFinite(mergedPagination.totalItems) && delta !== 0) {
					mergedPagination.totalItems = Math.max(0, mergedPagination.totalItems + delta)
				}
				if (incomingList.length === 0) {
					mergedPagination.hasMore = false
				} else if (
					typeof mergedPagination.hasMore === 'boolean'
					&& Number.isFinite(mergedPagination.totalItems)
					&& Number.isInteger(mergedPagination.nextOffset)
				) {
					mergedPagination.hasMore = mergedPagination.hasMore && mergedPagination.nextOffset < mergedPagination.totalItems
				}
				if (mergedPagination.hasMore === false) {
					mergedPagination.totalItems = this[listKey].length
				}
				this[paginationKey] = mergedPagination
			}

			if (!this.currentDuplicate && this.activeView === 'details' && this[listKey].length > 0) {
				this.currentDuplicate = this[listKey][0]
			}
		},
		updateAcknowledgedDuplicates(newDuplicates, pagination) {
			this.mergePaginatedDuplicates('acknowledged', newDuplicates, pagination)
		},
		updateUnacknowledgedDuplicates(newDuplicates, pagination) {
			this.mergePaginatedDuplicates('unacknowledged', newDuplicates, pagination)
		},
		openBulkDelete() {
			this.activeView = 'bulk-delete'
			this.currentDuplicate = null
		},
		closeBulkDelete() {
			this.activeView = 'details'
			if (!this.currentDuplicate) {
				this.currentDuplicate = this.unacknowledgedDuplicates[0] || this.acknowledgedDuplicates[0] || null
			}
		},
		showHelp(section) {
			this.currentHelpSection = section || 'guide'
			this.helpModalOpen = true
		},
		recordTouchedFolders(paths) {
			if (!Array.isArray(paths) || paths.length === 0) {
				return
			}
			const seen = new Set(this.recentCleanedPaths)
			paths.forEach(path => {
				if (typeof path === 'string' && path.trim() !== '') {
					seen.add(path.trim())
				}
			})
			this.recentCleanedPaths = Array.from(seen)
		},
		async openEmptyFoldersModal() {
			this.emptyFoldersModalOpen = true
			await this.scanEmptyFoldersInModal(this.recentCleanedPaths.length > 0)
		},
		async scanEmptyFoldersInModal(useCleanedScope = false) {
			if (typeof api.scanEmptyFolders !== 'function') {
				return
			}
			this.emptyFoldersLoading = true
			try {
				const scopePaths = useCleanedScope && this.recentCleanedPaths.length > 0
					? [...this.recentCleanedPaths]
					: []
				const response = await api.scanEmptyFolders(scopePaths)
				const folders = Array.isArray(response?.folders) ? response.folders : []
				const prefs = loadUiPreferences()
				this.ignoredEmptyFolders = Array.isArray(prefs.ignoredEmptyFolders) ? [...prefs.ignoredEmptyFolders] : []
				const ignoredSet = new Set(this.ignoredEmptyFolders)
				this.modalEmptyFolders = folders
				this.selectedModalEmptyFolders = folders
					.filter(folder => !ignoredSet.has(folder.path))
					.map(folder => folder.path)
				this.modalEmptyFoldersScanned = true
			} catch (error) {
				console.error('Error scanning empty folders from modal:', error)
			} finally {
				this.emptyFoldersLoading = false
			}
		},
		isEmptyFolderIgnored(path) {
			return this.ignoredEmptyFolders.includes(path)
		},
		toggleIgnoreModalEmptyFolder(path) {
			const set = new Set(this.ignoredEmptyFolders)
			if (set.has(path)) {
				set.delete(path)
			} else {
				set.add(path)
				this.selectedModalEmptyFolders = this.selectedModalEmptyFolders.filter(p => p !== path)
			}
			this.ignoredEmptyFolders = Array.from(set)
			saveUiPreferences({ ignoredEmptyFolders: this.ignoredEmptyFolders })
		},
		ignoreSelectedModalEmptyFolders() {
			if (this.selectedModalEmptyFolders.length === 0) {
				return
			}
			const set = new Set(this.ignoredEmptyFolders)
			this.selectedModalEmptyFolders.forEach(path => set.add(path))
			this.ignoredEmptyFolders = Array.from(set)
			this.selectedModalEmptyFolders = []
			saveUiPreferences({ ignoredEmptyFolders: this.ignoredEmptyFolders })
		},
		resetIgnoredModalEmptyFolders() {
			this.ignoredEmptyFolders = []
			this.showIgnoredModalEmptyFolders = false
			this.selectedModalEmptyFolders = this.modalEmptyFolders.map(folder => folder.path)
			saveUiPreferences({ ignoredEmptyFolders: [] })
		},
		toggleModalEmptyFolder(path) {
			if (this.isEmptyFolderIgnored(path)) {
				return
			}
			const idx = this.selectedModalEmptyFolders.indexOf(path)
			if (idx === -1) {
				this.selectedModalEmptyFolders.push(path)
			} else {
				this.selectedModalEmptyFolders.splice(idx, 1)
			}
		},
		toggleSelectAllModalEmptyFolders() {
			if (this.isAllModalEmptyFoldersSelected) {
				this.selectedModalEmptyFolders = []
			} else {
				this.selectedModalEmptyFolders = this.activeModalEmptyFolders.map(folder => folder.path)
			}
		},
		requestConfirmation({ title, message, confirmLabel }) {
			if (this.confirmDialog && typeof this.confirmDialog.resolver === 'function') {
				this.confirmDialog.resolver(false)
			}
			this.confirmDialog = {
				open: true,
				title,
				message,
				confirmLabel,
				resolver: null,
			}
			return new Promise(resolve => {
				this.confirmDialog.resolver = resolve
			})
		},
		resolveConfirmDialog(confirmed) {
			const resolver = this.confirmDialog ? this.confirmDialog.resolver : null
			this.confirmDialog.open = false
			this.confirmDialog.resolver = null
			if (typeof resolver === 'function') {
				resolver(Boolean(confirmed))
			}
		},
		async deleteSelectedModalEmptyFolders() {
			if (this.selectedModalEmptyFolders.length === 0 || typeof api.deleteEmptyFolders !== 'function') {
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
			this.emptyFoldersDeleting = true
			try {
				const pathsToDeleteSet = new Set(this.selectedModalEmptyFolders)
				this.modalEmptyFolders.forEach(folder => {
					if (folder && folder.path && !this.isEmptyFolderIgnored(folder.path)) {
						for (const selectedPath of this.selectedModalEmptyFolders) {
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
					const remaining = this.modalEmptyFolders.filter(folder => !deletedSet.has(folder.path))
					this.modalEmptyFolders = remaining.map(folder => ({
						...folder,
						hasEmptySubfolders: remaining.some(
							other => other.path !== folder.path && other.path.startsWith(`${folder.path}/`)
						),
					}))
					this.selectedModalEmptyFolders = this.selectedModalEmptyFolders.filter(path => !deletedSet.has(path))
					if (this.modalEmptyFolders.length === 0) {
						this.recentCleanedPaths = []
					}
				}
			} catch (error) {
				console.error('Error deleting empty folders from modal:', error)
			} finally {
				this.emptyFoldersDeleting = false
			}
		},

		viewProject(projectId) {
			this.activeProject = projectId
			this.activeView = 'project'
			this.settingsOpen = false
		},

		backToProjects() {
			this.activeProject = null
			this.activeView = 'details'
			this.settingsOpen = true
		},

		viewProjectDuplicate(duplicate) {
			this.projectDuplicate = duplicate
			this.activeView = 'project-duplicate'
		},

		backToProject() {
			this.projectDuplicate = null
			this.activeView = 'project'
		},
		handleSearch({ query, type }) {
			// Convert the search pattern to a RegExp object
			let searchRegex
			try {
				searchRegex = new RegExp(query, 'i') // case-insensitive search
			} catch (e) {
				// If invalid regex, do a simple text search
				searchRegex = new RegExp(this.escapeRegex(query), 'i')
			}

			// Filter duplicates based on the search pattern
			this.filteredDuplicates = this.duplicates.filter(duplicate => {
				return duplicate.files.some(file => {
					const fileName = file.path.split('/').pop() // Get just the filename
					return searchRegex.test(fileName)
				})
			})
		},
		escapeRegex(string) {
			return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
		}
	}
}
</script>

<style>
.app-loading-container {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 100%;
	height: 100%;
	min-height: calc(100vh - var(--header-height, 50px));
	flex: 1 1 auto;
	margin: auto;
}

.app-content {
	overflow-y: auto;
}

.app-content-topbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 12px;
	padding-block: 12px;
	padding-inline: 56px 20px;
	min-height: 56px;
	box-sizing: border-box;
	border-bottom: 1px solid var(--color-border);
	background-color: var(--color-main-background);
	position: sticky;
	top: 0;
	z-index: 100;
}

.topbar-summary {
	position: relative;
	display: inline-flex;
	align-items: center;
	gap: 6px;
	min-width: 0;
}

.topbar-title {
	margin: 0;
	font-size: 1.15rem;
	font-weight: 600;
	color: var(--color-main-text);
}

.topbar-summary.has-count-tooltip .topbar-title {
	cursor: help;
}

.topbar-count-help {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 22px;
	height: 22px;
	border-radius: 50%;
	color: var(--color-text-maxcontrast);
	cursor: help;
	outline: none;
	transition: color 0.15s ease, background-color 0.15s ease;
}

.topbar-summary.has-count-tooltip:hover .topbar-count-help,
.topbar-count-help:focus-visible {
	color: var(--color-main-text);
	background-color: var(--color-background-hover);
}

.topbar-count-tooltip {
	position: absolute;
	top: calc(100% + 8px);
	inset-inline-start: 0;
	min-width: 280px;
	max-width: min(360px, calc(100vw - 32px));
	padding: 10px 12px;
	border-radius: var(--border-radius-large, 8px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-main-background, #ffffff);
	background-image: linear-gradient(var(--color-main-background, #ffffff), var(--color-main-background, #ffffff)), linear-gradient(#22262c, #22262c);
	color: var(--color-main-text);
	box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
	font-size: 12px;
	font-weight: 400;
	line-height: 1.45;
	z-index: 2000;
	opacity: 0;
	visibility: hidden;
	pointer-events: none;
	transform: translateY(-2px);
	transition: opacity 0.12s ease, transform 0.12s ease, visibility 0.12s ease;
}

.topbar-summary.has-count-tooltip:hover .topbar-count-tooltip,
.topbar-summary.has-count-tooltip:focus-within .topbar-count-tooltip {
	opacity: 1;
	visibility: visible;
	transform: translateY(0);
}

.topbar-count-tooltip__title {
	font-weight: 600;
	margin-bottom: 6px;
	color: var(--color-main-text);
}

.topbar-count-tooltip__list {
	margin: 0;
	padding-inline-start: 16px;
	list-style: disc;
}

.topbar-count-tooltip__list li + li {
	margin-top: 3px;
}

.topbar-actions {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px;
	margin-inline-start: auto;
	min-width: 0;
}

.app-content-topbar .topbar-scan-button,
.app-content-topbar .topbar-empty-folders-button,
.app-content-topbar .topbar-treemap-button,
.app-content-topbar .topbar-history-button,
.app-content-topbar .topbar-similarity-button {
	display: inline-flex !important;
	align-items: center !important;
	justify-content: center !important;
	gap: 6px;
	min-height: 34px;
	margin: 0 !important;
	padding: 6px 14px !important;
	border-radius: var(--border-radius-large, 8px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-weight: 600;
	font-size: 0.9rem;
	line-height: 1.2 !important;
	cursor: pointer;
	box-sizing: border-box;
	transition: background-color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
}

.app-content-topbar .topbar-scan-button svg,
.app-content-topbar .topbar-empty-folders-button svg,
.app-content-topbar .topbar-treemap-button svg,
.app-content-topbar .topbar-history-button svg,
.app-content-topbar .topbar-similarity-button svg {
	display: block !important;
	flex-shrink: 0;
}

.app-content-topbar .topbar-scan-button:hover:not(:disabled),
.app-content-topbar .topbar-scan-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-empty-folders-button:hover:not(:disabled),
.app-content-topbar .topbar-empty-folders-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-treemap-button:hover:not(:disabled),
.app-content-topbar .topbar-treemap-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-history-button:hover:not(:disabled),
.app-content-topbar .topbar-history-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-similarity-button:hover:not(:disabled),
.app-content-topbar .topbar-similarity-button:focus-visible:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element);
}

.app-content-topbar .topbar-treemap-button.is-active,
.app-content-topbar .topbar-history-button.is-active,
.app-content-topbar .topbar-similarity-button.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.app-content-topbar .topbar-treemap-button:disabled,
.app-content-topbar .topbar-similarity-button:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.app-content-topbar .topbar-scan-button:disabled {
	opacity: 0.7;
	cursor: wait;
}

.topbar-scan-icon.is-spinning {
	animation: duplicatefinder-spin 1s linear infinite;
}

@keyframes duplicatefinder-spin {
	from {
		transform: rotate(0deg);
	}
	to {
		transform: rotate(360deg);
	}
}

.scan-progress-banner {
	padding: 12px 20px;
	border-bottom: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
}

.scan-progress-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 8px;
	margin-bottom: 8px;
	font-size: 0.875rem;
}

.scan-progress-info {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 10px;
}

.scan-progress-title {
	font-weight: 600;
	color: var(--color-main-text);
}

.scan-progress-counts {
	color: var(--color-text-maxcontrast);
	font-variant-numeric: tabular-nums;
}

.scan-progress-eta {
	color: var(--color-text-maxcontrast);
	font-size: 0.82rem;
	font-variant-numeric: tabular-nums;
}

.scan-progress-track {
	position: relative;
	width: 100%;
	height: 8px;
	border-radius: 999px;
	background-color: var(--color-background-dark);
	overflow: hidden;
}

.scan-progress-fill {
	height: 100%;
	border-radius: 999px;
	background-color: var(--color-primary-element, #0082c9);
	transition: width 0.25s ease;
}

.scan-progress-fill.is-indeterminate {
	width: 35%;
	animation: duplicatefinder-indeterminate 1.4s ease-in-out infinite;
}

@keyframes duplicatefinder-indeterminate {
	0% {
		transform: translateX(-100%);
	}
	100% {
		transform: translateX(300%);
	}
}

.app-content-topbar .topbar-bulk-delete-button {
	display: inline-flex !important;
	align-items: center !important;
	justify-content: center !important;
	gap: 6px;
	min-height: 34px;
	margin: 0 !important;
	padding: 6px 14px !important;
	border-radius: var(--border-radius-large, 8px);
	border: 1px solid #d32f2f;
	background-color: #d32f2f;
	color: #ffffff;
	font-weight: 600;
	font-size: 0.9rem;
	line-height: 1.2 !important;
	cursor: pointer;
	box-sizing: border-box;
	transition: background-color 0.15s ease, border-color 0.15s ease;
}

.app-content-topbar .topbar-bulk-delete-button .material-design-icon,
.app-content-topbar .topbar-bulk-delete-button svg {
	display: inline-flex !important;
	align-items: center !important;
	justify-content: center !important;
	bottom: 0 !important;
	flex-shrink: 0;
}

.app-content-topbar .topbar-bulk-delete-button:hover:not(:disabled),
.app-content-topbar .topbar-bulk-delete-button:focus-visible:not(:disabled) {
	background-color: #b71c1c;
	border-color: #b71c1c;
	color: #ffffff;
}

.app-content-topbar .topbar-scan-button > *,
.app-content-topbar .topbar-empty-folders-button > *,
.app-content-topbar .topbar-treemap-button > *,
.app-content-topbar .topbar-history-button > *,
.app-content-topbar .topbar-similarity-button > *,
.app-content-topbar .topbar-bulk-delete-button > * {
	pointer-events: none;
}

.app-content-topbar .topbar-bulk-delete-button:disabled,
.app-content-topbar .topbar-bulk-delete-button:disabled * {
	opacity: 0.45;
	cursor: not-allowed !important;
}

.app-content-topbar .topbar-bulk-delete-button:disabled * {
	opacity: 1;
}

.help-content {
	padding: var(--spacing-3);
	max-width: 800px;
	margin: 0 auto;
}

.empty-folders-modal {
	padding: 22px 24px;
	width: 100%;
	max-width: 780px;
	margin: 0 auto;
	box-sizing: border-box;
}

.empty-folders-modal__title {
	margin: 0 0 8px;
	font-size: 1.35rem;
	font-weight: 700;
	color: var(--color-main-text);
}

.empty-folders-modal__hint {
	margin: 0 0 18px;
	color: var(--color-text-maxcontrast);
	font-size: 0.94rem;
	line-height: 1.48;
}

.empty-folders-modal__toolbar {
	display: flex;
	flex-wrap: nowrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	margin-bottom: 18px;
}

.empty-folders-modal__toolbar-left,
.empty-folders-modal__toolbar-right {
	display: flex;
	flex-wrap: nowrap;
	align-items: center;
	gap: 8px;
	white-space: nowrap;
}

.empty-folders-modal__toolbar-right {
	margin-inline-start: auto;
}

@media (max-width: 580px) {
	.empty-folders-modal__toolbar,
	.empty-folders-modal__toolbar-left,
	.empty-folders-modal__toolbar-right {
		flex-wrap: wrap;
	}
}

@media (max-width: 768px) {
	.app-content-topbar {
		padding-block: 10px;
		padding-inline: 52px 12px;
	}

	.topbar-actions {
		width: 100%;
		margin-inline-start: 0;
	}

	.app-content-topbar .topbar-scan-button,
	.app-content-topbar .topbar-empty-folders-button,
	.app-content-topbar .topbar-treemap-button,
	.app-content-topbar .topbar-history-button,
	.app-content-topbar .topbar-similarity-button,
	.app-content-topbar .topbar-bulk-delete-button {
		min-height: 44px;
	}

	.topbar-count-tooltip {
		min-width: 0;
		width: min(320px, calc(100vw - 32px));
	}

	.empty-folder-ignore-button {
		min-width: 44px;
		min-height: 44px;
	}

	.nc-confirm-dialog__button {
		min-height: 44px !important;
	}
}

.empty-folders-scan-btn {
	display: inline-flex !important;
	align-items: center !important;
	justify-content: center !important;
	min-height: 34px !important;
	padding: 6px 16px !important;
	margin: 0 !important;
	border-radius: var(--border-radius-large, 8px) !important;
	border: 1px solid var(--color-primary-element, #0082c9) !important;
	background-color: var(--color-primary-element, #0082c9) !important;
	background-image: none !important;
	color: #ffffff !important;
	box-shadow: none !important;
	font-size: 0.9rem;
	font-weight: 600;
	white-space: nowrap;
	cursor: pointer;
	transition: opacity 0.15s ease, filter 0.15s ease;
}

.empty-folders-scan-btn:hover:not(:disabled),
.empty-folders-scan-btn:focus:not(:disabled) {
	background-color: var(--color-primary-element, #0082c9) !important;
	border-color: var(--color-primary-element, #0082c9) !important;
	color: #ffffff !important;
	filter: brightness(1.08);
}

.empty-folders-unselect-link {
	display: inline-flex !important;
	align-items: center !important;
	background: transparent !important;
	background-color: transparent !important;
	background-image: none !important;
	border: none !important;
	box-shadow: none !important;
	min-height: 0 !important;
	padding: 4px 6px !important;
	margin: 0 !important;
	color: var(--color-text-maxcontrast) !important;
	font-size: 0.9rem;
	font-weight: 500;
	white-space: nowrap;
	text-decoration: underline !important;
	cursor: pointer;
}

.empty-folders-unselect-link:hover:not(:disabled),
.empty-folders-unselect-link:focus:not(:disabled) {
	background: transparent !important;
	background-color: transparent !important;
	border: none !important;
	color: var(--color-main-text) !important;
}

.empty-folders-pill-btn {
	display: inline-flex !important;
	align-items: center !important;
	justify-content: center !important;
	min-height: 32px !important;
	padding: 5px 12px !important;
	margin: 0 !important;
	border-radius: var(--border-radius-large, 8px) !important;
	border: 1px solid var(--color-border-dark, var(--color-border)) !important;
	background-color: var(--color-background-hover) !important;
	background-image: none !important;
	color: var(--color-main-text) !important;
	box-shadow: none !important;
	font-size: 0.88rem;
	font-weight: 600;
	white-space: nowrap;
	cursor: pointer;
	transition: background-color 0.15s ease, border-color 0.15s ease;
}

.empty-folders-pill-btn:hover:not(:disabled),
.empty-folders-pill-btn:focus:not(:disabled) {
	background-color: var(--color-background-dark) !important;
	border-color: var(--color-border-maxcontrast, var(--color-border-dark)) !important;
	color: var(--color-main-text) !important;
}

.empty-folders-reset-btn {
	width: 32px !important;
	min-width: 32px !important;
	height: 32px !important;
	min-height: 32px !important;
	padding: 0 !important;
	flex-shrink: 0;
}

.empty-folders-modal__summary {
	margin-bottom: 10px;
}

.empty-folders-modal__found-count {
	margin: 0 0 12px;
	font-size: 1.12rem;
	font-weight: 500;
	color: var(--color-main-text);
}

.empty-folders-delete-pill {
	display: inline-flex !important;
	align-items: center !important;
	justify-content: center !important;
	min-height: 36px !important;
	padding: 7px 16px !important;
	margin: 0 !important;
	border-radius: var(--border-radius-large, 8px) !important;
	border: 1px solid #d32f2f !important;
	background-color: #d32f2f !important;
	background-image: none !important;
	color: #ffffff !important;
	box-shadow: none !important;
	font-size: 0.92rem;
	font-weight: 600;
	white-space: nowrap;
	cursor: pointer;
	transition: background-color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
}

.empty-folders-delete-pill:hover:not(:disabled),
.empty-folders-delete-pill:focus:not(:disabled) {
	background-color: #b71c1c !important;
	border-color: #b71c1c !important;
	color: #ffffff !important;
}

.empty-folders-delete-pill:disabled {
	opacity: 0.5 !important;
	cursor: not-allowed !important;
}

.empty-folders-modal__section-title {
	margin: 20px 0 10px;
	font-size: 1.05rem;
	font-weight: 700;
	color: var(--color-main-text);
}

.empty-folders-modal__status {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 16px 0;
	color: var(--color-text-maxcontrast);
}

.empty-folders-modal__list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-height: 46vh;
	overflow-y: auto;
}

.empty-folders-modal__item {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 10px 14px;
	border: 1px solid var(--color-border-dark, var(--color-border));
	border-radius: var(--border-radius-large, 8px);
	cursor: pointer;
}

.empty-folders-modal__item:hover {
	background-color: var(--color-background-hover);
}

.empty-folders-modal__item.is-selected {
	background-color: var(--color-background-hover);
}

.empty-folders-modal__item.is-ignored {
	opacity: 0.65;
	background-color: var(--color-background-dark);
}

.empty-folder-row-icon {
	flex-shrink: 0;
	color: var(--color-text-maxcontrast);
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

.empty-folders-modal__path {
	flex: 1 1 auto;
	min-width: 0;
	overflow-wrap: anywhere;
	color: var(--color-main-text);
}

.empty-folders-modal__ignored-pill {
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

.empty-folders-modal__badge {
	color: var(--color-text-maxcontrast);
	font-size: 0.82rem;
	white-space: nowrap;
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

.empty-folder-ignore-button:focus-visible,
.topbar-count-help:focus-visible,
.app-content-topbar .topbar-scan-button:focus-visible,
.app-content-topbar .topbar-empty-folders-button:focus-visible,
.app-content-topbar .topbar-treemap-button:focus-visible,
.app-content-topbar .topbar-history-button:focus-visible,
.app-content-topbar .topbar-similarity-button:focus-visible,
.app-content-topbar .topbar-bulk-delete-button:focus-visible,
.nc-confirm-dialog__button:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9) !important;
	outline-offset: 2px;
}

.empty-folder-ignore-button.is-ignored {
	color: var(--color-primary-element, #0082c9);
}

:deep(.modal-container) {
	background-color: var(--color-main-background);
	border-radius: var(--border-radius-large);
	box-shadow: var(--shadow-modal);
	border: 1px solid var(--color-border);
	overflow: hidden;
}

:deep(.modal-wrapper--large > .modal-container) {
	width: min(760px, 92vw);
	max-width: 760px;
}

:deep(.modal-wrapper) {
	border-radius: var(--border-radius-large);
}

:deep(.modal-header) {
	background-color: var(--color-primary-element-light);
	border-bottom: 1px solid var(--color-border);
	padding: 16px 20px;
}

:deep(.modal-title) {
	color: var(--color-main-text);
	font-weight: bold;
	font-size: 20px;
}

:deep(.modal-container__close) {
	opacity: 0.7;
	transition: opacity 0.2s ease;
}

:deep(.modal-container__close:hover) {
	opacity: 1;
}

:deep(.modal-container__content) {
	padding: 0;
	max-height: 80vh;
	overflow-y: auto;
}

.file-picker .file-picker__main {
	min-width: 0;
}

.file-picker .file-picker__files {
	overflow-x: hidden;
	overflow-y: auto;
}

.file-picker .file-picker__files th.row-name {
	width: auto;
}

.file-picker .file-picker__files th.row-size {
	width: 110px;
}

.file-picker .file-picker__files th.row-modified {
	width: 150px;
}

.file-picker .file-picker__name-container {
	min-width: 0;
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
	margin: 0 0 18px;
	font-size: 0.92rem;
	line-height: 1.48;
	color: var(--color-text-maxcontrast, var(--color-main-text));
}

.nc-confirm-dialog__actions {
	display: flex;
	justify-content: flex-end;
	gap: 10px;
}

.nc-confirm-dialog__button {
	display: inline-flex !important;
	align-items: center !important;
	justify-content: center !important;
	min-height: 34px !important;
	padding: 6px 14px !important;
	margin: 0 !important;
	border-radius: var(--border-radius-large, 8px) !important;
	background-image: none !important;
	box-shadow: none !important;
	font-size: 0.9rem;
	font-weight: 600;
	cursor: pointer;
	transition: background-color 0.15s ease, border-color 0.15s ease;
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

.shortcuts-dialog {
	margin-block: auto;
	margin-inline: auto;
	padding-block: 0;
	padding-inline: 0;
	inline-size: min(480px, calc(100vw - 24px));
	max-inline-size: calc(100vw - 24px);
	max-block-size: calc(100vh - 32px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	border-radius: var(--border-radius-large, 10px);
	background-color: var(--color-main-background, #ffffff);
	color: var(--color-main-text);
	box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
	box-sizing: border-box;
	overflow: auto;
}

.shortcuts-dialog::backdrop {
	background-color: rgba(0, 0, 0, 0.45);
}

.shortcuts-dialog__surface {
	display: flex;
	flex-direction: column;
	min-inline-size: 0;
}

.shortcuts-dialog__header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block: 14px;
	padding-inline: 20px 12px;
	border-block-end: 1px solid var(--color-border);
}

.shortcuts-dialog__title {
	margin-block: 0;
	margin-inline: 0;
	font-size: 1.05rem;
	font-weight: 600;
	color: var(--color-main-text);
}

.shortcuts-dialog__close {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-inline-size: 44px;
	min-block-size: 44px;
	padding-block: 0;
	padding-inline: 0;
	margin-block: 0;
	margin-inline: 0;
	border: 1px solid transparent;
	border-radius: var(--border-radius-pill, 999px);
	background-color: transparent;
	color: var(--color-text-maxcontrast, var(--color-main-text));
	cursor: pointer;
	flex-shrink: 0;
	transition: background-color 0.15s ease, color 0.15s ease;
}

.shortcuts-dialog__close:hover {
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
}

.shortcuts-dialog__close:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.shortcuts-dialog__body {
	padding-block: 16px;
	padding-inline: 20px;
}

.shortcuts-dialog__list {
	display: grid;
	gap: 10px;
	margin-block: 0;
	margin-inline: 0;
}

.shortcuts-dialog__row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 8px 16px;
	padding-block: 8px;
	padding-inline: 0;
	border-block-end: 1px solid var(--color-border);
}

.shortcuts-dialog__row:last-child {
	border-block-end: none;
}

.shortcuts-dialog__keys {
	display: inline-flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 6px;
	margin-inline: 0;
}

.shortcuts-dialog__kbd {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-inline-size: 28px;
	min-block-size: 26px;
	padding-block: 2px;
	padding-inline: 8px;
	border: 1px solid var(--color-border-dark, var(--color-border));
	border-radius: var(--border-radius, 4px);
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-family: inherit;
	font-size: 0.85rem;
	font-weight: 600;
	box-sizing: border-box;
}

.shortcuts-dialog__description {
	margin-block: 0;
	margin-inline: 0;
	color: var(--color-main-text);
	font-size: 0.92rem;
	line-height: 1.4;
	text-align: end;
	flex: 1 1 180px;
	min-inline-size: 0;
}

@media (max-width: 480px) {
	.shortcuts-dialog__row {
		flex-direction: column;
		align-items: flex-start;
	}

	.shortcuts-dialog__description {
		text-align: start;
		flex-basis: auto;
	}
}
</style>