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
					@extension-filter-changed="onExtensionFilterChanged"
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
							v-if="activeView === 'details'"
							type="button"
							class="topbar-batch-rules-button"
							:class="{ 'is-active': batchAutoSelectOpen }"
							:disabled="!hasDuplicates"
							:aria-pressed="batchAutoSelectOpen ? 'true' : 'false'"
							aria-keyshortcuts="w"
							:title="t('duplicatefinder', 'Toggle cross-group batch auto-select rules')"
							@click="toggleBatchAutoSelect">
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
								<polyline points="9 11 12 14 22 4" />
								<path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
							</svg>
							<span>{{ t('duplicatefinder', 'Batch Rules') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-hygiene-button"
							:class="{ 'is-active': hygieneOpen }"
							:disabled="!hasDuplicates"
							:aria-pressed="hygieneOpen ? 'true' : 'false'"
							aria-keyshortcuts="i"
							:title="t('duplicatefinder', 'Toggle file hygiene and bad-extension inspector')"
							@click="toggleFileHygiene">
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
								<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
								<path d="M9 12l2 2 4-4" />
							</svg>
							<span>{{ t('duplicatefinder', 'Hygiene') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-link-simulator-button"
							:class="{ 'is-active': linkSimulatorOpen }"
							:disabled="!hasDuplicates"
							:aria-pressed="linkSimulatorOpen ? 'true' : 'false'"
							aria-keyshortcuts="l"
							:title="t('duplicatefinder', 'Toggle hardlink and reference deduplication simulator')"
							@click="toggleLinkSimulator">
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
								<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
								<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
							</svg>
							<span>{{ t('duplicatefinder', 'Link Plan') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-folder-matrix-button"
							:class="{ 'is-active': folderMatrixOpen }"
							:disabled="!hasDuplicates"
							:aria-pressed="folderMatrixOpen ? 'true' : 'false'"
							aria-keyshortcuts="d"
							:title="t('duplicatefinder', 'Toggle directory folder pair matrix')"
							@click="toggleFolderMatrix">
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
								<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v3" />
								<rect x="3" y="10" width="8" height="10" rx="1" />
								<rect x="13" y="10" width="8" height="10" rx="1" />
							</svg>
							<span>{{ t('duplicatefinder', 'Folder Matrix') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-footprint-button"
							:class="{ 'is-active': footprintAnalyzerOpen }"
							:disabled="!hasDuplicates"
							:aria-pressed="footprintAnalyzerOpen ? 'true' : 'false'"
							aria-keyshortcuts="z"
							:title="t('duplicatefinder', 'Toggle storage footprint and extension analyzer')"
							@click="toggleFootprintAnalyzer">
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
								<path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
								<path d="M22 12A10 10 0 0 0 12 2v10z" />
							</svg>
							<span>{{ t('duplicatefinder', 'Footprint') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-photo-bursts-button"
							:class="{ 'is-active': photoBurstsOpen }"
							:disabled="!hasDuplicates"
							:aria-pressed="photoBurstsOpen ? 'true' : 'false'"
							aria-keyshortcuts="p"
							:title="t('duplicatefinder', 'Toggle photo and media timeline bursts')"
							@click="togglePhotoBursts">
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
								<rect
									x="3"
									y="4"
									width="14"
									height="14"
									rx="2"
									ry="2" />
								<path d="M17 8h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-2" />
								<circle
									cx="8.5"
									cy="9.5"
									r="1.5" />
								<polyline points="17 14 13 10 6 17" />
							</svg>
							<span>{{ t('duplicatefinder', 'Photo Bursts') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-recovery-safety-button"
							:class="{ 'is-active': recoverySafetyOpen }"
							:disabled="!hasDuplicates"
							:aria-pressed="recoverySafetyOpen ? 'true' : 'false'"
							aria-keyshortcuts="q"
							:title="t('duplicatefinder', 'Toggle recovery safety manifest and share-impact risk audit')"
							@click="toggleRecoverySafety">
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
								<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
								<line
									x1="12"
									y1="8"
									x2="12"
									y2="12" />
								<line
									x1="12"
									y1="16"
									x2="12.01"
									y2="16" />
							</svg>
							<span>{{ t('duplicatefinder', 'Recovery Audit') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-archive-inspector-button"
							:class="{ 'is-active': archiveInspectorOpen }"
							:disabled="!hasDuplicates"
							:aria-pressed="archiveInspectorOpen ? 'true' : 'false'"
							aria-keyshortcuts="1"
							:title="t('duplicatefinder', 'Toggle archive and container payload inspector')"
							@click="toggleArchiveInspector">
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
								<polyline points="21 8 21 21 3 21 3 8" />
								<rect
									x="1"
									y="3"
									width="22"
									height="5" />
								<line
									x1="10"
									y1="12"
									x2="14"
									y2="12" />
							</svg>
							<span>{{ t('duplicatefinder', 'Archives') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-audio-workbench-button"
							:class="{ 'is-active': audioWorkbenchOpen }"
							:disabled="!hasDuplicates"
							:aria-pressed="audioWorkbenchOpen ? 'true' : 'false'"
							aria-keyshortcuts="2"
							:title="t('duplicatefinder', 'Toggle audio tags, bitrate and album consolidator workbench')"
							@click="toggleAudioWorkbench">
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
								<path d="M9 18V5l12-2v13" />
								<circle
									cx="6"
									cy="18"
									r="3" />
								<circle
									cx="18"
									cy="16"
									r="3" />
							</svg>
							<span>{{ t('duplicatefinder', 'Audio Tags') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-video-workbench-button"
							:class="{ 'is-active': videoWorkbenchOpen }"
							:disabled="!hasDuplicates"
							:aria-pressed="videoWorkbenchOpen ? 'true' : 'false'"
							aria-keyshortcuts="3"
							:title="t('duplicatefinder', 'Toggle video frame fingerprint, codec quality and duration tolerance inspector')"
							@click="toggleVideoWorkbench">
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
								<rect
									x="2"
									y="4"
									width="15"
									height="16"
									rx="2" />
								<polygon points="22 7 17 12 22 17 22 7" />
							</svg>
							<span>{{ t('duplicatefinder', 'Video Scenes') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-sidecar-sweep-button"
							:class="{ 'is-active': sidecarSweepOpen }"
							:aria-pressed="sidecarSweepOpen ? 'true' : 'false'"
							aria-keyshortcuts="4"
							:title="t('duplicatefinder', 'Toggle orphaned sidecar and post-cleanup empty-folder sweep inspector')"
							@click="toggleSidecarSweep">
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
								<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
								<polyline points="14 2 14 8 20 8" />
								<line
									x1="9"
									y1="15"
									x2="15"
									y2="15" />
							</svg>
							<span>{{ t('duplicatefinder', 'Sidecar Sweep') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-rule-profiles-button"
							:class="{ 'is-active': ruleProfilesOpen }"
							:aria-pressed="ruleProfilesOpen ? 'true' : 'false'"
							aria-keyshortcuts="5"
							:title="t('duplicatefinder', 'Toggle cleanup rule profiles, regex exclusions and batch audit log')"
							@click="toggleRuleProfiles">
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
								<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
							</svg>
							<span>{{ t('duplicatefinder', 'Rule Profiles') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-document-lineage-button"
							:class="{ 'is-active': documentLineageOpen }"
							:aria-pressed="documentLineageOpen ? 'true' : 'false'"
							aria-keyshortcuts="6"
							:title="t('duplicatefinder', 'Toggle near-duplicate document fuzzy diff and version lineage workbench')"
							@click="toggleDocumentLineage">
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
								<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
								<polyline points="14 2 14 8 20 8" />
								<line
									x1="8"
									y1="13"
									x2="16"
									y2="13" />
								<line
									x1="8"
									y1="17"
									x2="13"
									y2="17" />
							</svg>
							<span>{{ t('duplicatefinder', 'Doc Lineage') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-photo-perceptual-button"
							:class="{ 'is-active': photoPerceptualOpen }"
							:aria-pressed="photoPerceptualOpen ? 'true' : 'false'"
							aria-keyshortcuts="7"
							:title="t('duplicatefinder', 'Toggle similar-photo perceptual pHash, EXIF sharpness and crop comparator workbench')"
							@click="togglePhotoPerceptual">
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
								<rect
									x="3"
									y="3"
									width="18"
									height="18"
									rx="2"
									ry="2" />
								<circle
									cx="8.5"
									cy="8.5"
									r="1.5" />
								<polyline points="21 15 16 10 5 21" />
							</svg>
							<span>{{ t('duplicatefinder', 'Similar Photos') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-broken-quarantine-button"
							:class="{ 'is-active': brokenQuarantineOpen }"
							:aria-pressed="brokenQuarantineOpen ? 'true' : 'false'"
							aria-keyshortcuts="8"
							:title="t('duplicatefinder', 'Toggle broken, zero-byte, truncated media and corrupted header quarantine workbench')"
							@click="toggleBrokenQuarantine">
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
								<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
								<line
									x1="12"
									y1="8"
									x2="12"
									y2="12" />
								<line
									x1="12"
									y1="16"
									x2="12.01"
									y2="16" />
							</svg>
							<span>{{ t('duplicatefinder', 'Quarantine') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-retention-pruner-button"
							:class="{ 'is-active': retentionPrunerOpen }"
							:aria-pressed="retentionPrunerOpen ? 'true' : 'false'"
							aria-keyshortcuts="9"
							:title="t('duplicatefinder', 'Toggle retention age, cold-storage and stale artifact pruner workbench')"
							@click="toggleRetentionPruner">
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
								<circle cx="12" cy="12" r="9" />
								<polyline points="12 6 12 12 16 14" />
								<path d="M5 3L2 6" />
								<path d="M22 6l-3-3" />
							</svg>
							<span>{{ t('duplicatefinder', 'Retention') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-filename-collisions-button"
							:class="{ 'is-active': filenameCollisionsOpen }"
							:aria-pressed="filenameCollisionsOpen ? 'true' : 'false'"
							aria-keyshortcuts="="
							:title="t('duplicatefinder', 'Toggle filename normalization and Unicode collision inspector')"
							@click="toggleFilenameCollisions">
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
								<path d="M5 9h14" />
								<path d="M5 15h14" />
								<path d="M9 5l-3 14" />
								<path d="M18 5l-3 14" />
							</svg>
							<span>{{ t('duplicatefinder', 'Collisions') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-quota-attribution-button"
							:class="{ 'is-active': quotaAttributionOpen }"
							:aria-pressed="quotaAttributionOpen ? 'true' : 'false'"
							aria-keyshortcuts="-"
							:title="t('duplicatefinder', 'Toggle multi-root cross-user quota attribution and chargeback heatmap')"
							@click="toggleQuotaAttribution">
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
								<rect
									x="3"
									y="3"
									width="7"
									height="7"
									rx="1" />
								<rect
									x="14"
									y="3"
									width="7"
									height="7"
									rx="1" />
								<rect
									x="3"
									y="14"
									width="7"
									height="7"
									rx="1" />
								<rect
									x="14"
									y="14"
									width="7"
									height="7"
									rx="1" />
							</svg>
							<span>{{ t('duplicatefinder', 'Quota') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-preview-cache-button"
							:class="{ 'is-active': previewCacheOpen }"
							:aria-pressed="previewCacheOpen ? 'true' : 'false'"
							aria-keyshortcuts="["
							:title="t('duplicatefinder', 'Toggle orphaned Nextcloud preview and cache reclaim analyzer')"
							@click="togglePreviewCache">
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
								<rect
									x="3"
									y="4"
									width="18"
									height="14"
									rx="2" />
								<circle
									cx="8.5"
									cy="9.5"
									r="1.5" />
								<path d="M21 15l-5-5L5 18" />
							</svg>
							<span>{{ t('duplicatefinder', 'Preview Cache') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-share-mount-button"
							:class="{ 'is-active': shareMountAuditorOpen }"
							:aria-pressed="shareMountAuditorOpen ? 'true' : 'false'"
							aria-keyshortcuts="]"
							:title="t('duplicatefinder', 'Toggle cross-share permission and orphaned external-mount auditor')"
							@click="toggleShareMountAuditor">
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
									cx="18"
									cy="5"
									r="3" />
								<circle
									cx="6"
									cy="12"
									r="3" />
								<circle
									cx="18"
									cy="19"
									r="3" />
								<line
									x1="8.59"
									y1="13.51"
									x2="15.42"
									y2="17.49" />
								<line
									x1="15.41"
									y1="6.51"
									x2="8.59"
									y2="10.49" />
							</svg>
							<span>{{ t('duplicatefinder', 'Shares & Mounts') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-backup-drift-button"
							:class="{ 'is-active': backupDriftOpen }"
							:aria-pressed="backupDriftOpen ? 'true' : 'false'"
							aria-keyshortcuts="\"
							:title="t('duplicatefinder', 'Toggle backup snapshot and mirror-tree drift synchronizer')"
							@click="toggleBackupDrift">
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
								<polyline points="1 4 1 10 7 10" />
								<polyline points="23 20 23 14 17 14" />
								<path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
							</svg>
							<span>{{ t('duplicatefinder', 'Backup Drift') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-automation-rulebook-button"
							:class="{ 'is-active': automationRulebookOpen }"
							:aria-pressed="automationRulebookOpen ? 'true' : 'false'"
							aria-keyshortcuts=";"
							:title="t('duplicatefinder', 'Toggle zero-touch scheduled retention rulebook and policy simulator')"
							@click="toggleAutomationRulebook">
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
									r="10" />
								<polyline points="12 6 12 12 16 14" />
							</svg>
							<span>{{ t('duplicatefinder', 'Rulebook') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-metadata-consolidation-button"
							:class="{ 'is-active': metadataConsolidationOpen }"
							:aria-pressed="metadataConsolidationOpen ? 'true' : 'false'"
							aria-keyshortcuts=","
							:title="t('duplicatefinder', 'Toggle Nextcloud metadata, tag, favorite and share-link consolidation workbench')"
							@click="toggleMetadataConsolidation">
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
								<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
								<line
									x1="7"
									y1="7"
									x2="7.01"
									y2="7" />
							</svg>
							<span>{{ t('duplicatefinder', 'Consolidate') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-forensic-verifier-button"
							:class="{ 'is-active': forensicVerifierOpen }"
							:aria-pressed="forensicVerifierOpen ? 'true' : 'false'"
							aria-keyshortcuts="."
							:title="t('duplicatefinder', 'Toggle zero-touch duplicate forensic diff and checksum chain verifier')"
							@click="toggleForensicVerifier">
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
								<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
								<polyline points="9 12 11 14 15 10" />
							</svg>
							<span>{{ t('duplicatefinder', 'Forensic') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-inode-verifier-button"
							:class="{ 'is-active': inodeVerifierOpen }"
							:aria-pressed="inodeVerifierOpen ? 'true' : 'false'"
							aria-keyshortcuts="'"
							:title="t('duplicatefinder', 'Toggle cross-volume inode, hardlink-alias and storage-backend safety verifier')"
							@click="toggleInodeVerifier">
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
									r="3" />
								<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" />
							</svg>
							<span>{{ t('duplicatefinder', 'Inodes') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-shadow-reclaim-button"
							:class="{ 'is-active': shadowReclaimOpen }"
							:aria-pressed="shadowReclaimOpen ? 'true' : 'false'"
							aria-keyshortcuts="`"
							:title="t('duplicatefinder', 'Toggle Nextcloud versions, trashbin and appdata shadow-duplicate reclaimer')"
							@click="toggleShadowReclaim">
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
								<polyline points="3 6 5 6 21 6" />
								<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
								<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
								<path d="M10 11v6M14 11v6" />
							</svg>
							<span>{{ t('duplicatefinder', 'Shadow') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-junk-pair-button"
							:class="{ 'is-active': junkPairInspectorOpen }"
							:aria-pressed="junkPairInspectorOpen ? 'true' : 'false'"
							aria-keyshortcuts="~"
							:title="t('duplicatefinder', 'Toggle zero-byte, truncated partial and AppleDouble junk pair inspector')"
							@click="toggleJunkPairInspector">
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
								<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
								<polyline points="14 2 14 8 20 8" />
								<line
									x1="9"
									y1="15"
									x2="15"
									y2="15" />
							</svg>
							<span>{{ t('duplicatefinder', 'Junk Pairs') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-media-fidelity-button"
							:class="{ 'is-active': mediaFidelityOpen }"
							:aria-pressed="mediaFidelityOpen ? 'true' : 'false'"
							aria-keyshortcuts="%"
							:title="t('duplicatefinder', 'Toggle near-duplicate media fidelity and transcode-loss ranker')"
							@click="toggleMediaFidelityRanker">
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
								<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
							</svg>
							<span>{{ t('duplicatefinder', 'Fidelity') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-cdc-chunking-button"
							:class="{ 'is-active': cdcChunkingOpen }"
							:aria-pressed="cdcChunkingOpen ? 'true' : 'false'"
							aria-keyshortcuts="#"
							:title="t('duplicatefinder', 'Toggle CDC / ZFS / Restic sub-file savings estimator')"
							@click="toggleCdcChunkingEstimator">
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
								<line
									x1="4"
									y1="9"
									x2="20"
									y2="9" />
								<line
									x1="4"
									y1="15"
									x2="20"
									y2="15" />
								<line
									x1="10"
									y1="3"
									x2="8"
									y2="21" />
								<line
									x1="16"
									y1="3"
									x2="14"
									y2="21" />
							</svg>
							<span>{{ t('duplicatefinder', 'CDC / ZFS') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-ops-schedule-button"
							:class="{ 'is-active': opsScheduleOpen }"
							:aria-pressed="opsScheduleOpen ? 'true' : 'false'"
							aria-keyshortcuts="@"
							:title="t('duplicatefinder', 'Toggle automated deduplication schedule, systemd/cron and flock/ionice generator')"
							@click="toggleOpsScheduleGenerator">
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
								<polyline points="12 7 12 12 15 14" />
							</svg>
							<span>{{ t('duplicatefinder', 'Ops Schedule') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-legal-hold-button"
							:class="{ 'is-active': legalHoldOpen }"
							:aria-pressed="legalHoldOpen ? 'true' : 'false'"
							aria-keyshortcuts="!"
							:title="t('duplicatefinder', 'Toggle compliance legal hold, evidence freeze and e-discovery guard')"
							@click="toggleLegalHoldGuard">
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
								<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
								<line
									x1="12"
									y1="8"
									x2="12"
									y2="13" />
								<line
									x1="12"
									y1="16"
									x2="12.01"
									y2="16" />
							</svg>
							<span>{{ t('duplicatefinder', 'Legal Hold') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-ransomware-canary-button"
							:class="{ 'is-active': ransomwareCanaryOpen }"
							:aria-pressed="ransomwareCanaryOpen ? 'true' : 'false'"
							aria-keyshortcuts="*"
							:title="t('duplicatefinder', 'Toggle ransomware canary, extension drift and mass-entropy anomaly guard')"
							@click="toggleRansomwareCanaryGuard">
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
								<polygon points="12 2 22 20 2 20 12 2" />
								<line
									x1="12"
									y1="9"
									x2="12"
									y2="13" />
								<line
									x1="12"
									y1="17"
									x2="12.01"
									y2="17" />
							</svg>
							<span>{{ t('duplicatefinder', 'Canary Guard') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-dev-tree-button"
							:class="{ 'is-active': devTreeReclaimerOpen }"
							:aria-pressed="devTreeReclaimerOpen ? 'true' : 'false'"
							aria-keyshortcuts="^"
							:title="t('duplicatefinder', 'Toggle dev workspace and dependency bloat whole-tree reclaimer')"
							@click="toggleDevTreeReclaimer">
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
								<polyline points="16 18 22 12 16 6" />
								<polyline points="8 6 2 12 8 18" />
							</svg>
							<span>{{ t('duplicatefinder', 'Dev Trees') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-conflict-storm-button"
							:class="{ 'is-active': conflictStormOpen }"
							:aria-pressed="conflictStormOpen ? 'true' : 'false'"
							aria-keyshortcuts="&amp;"
							:title="t('duplicatefinder', 'Toggle sync-conflict storm and cloud import fork resolver')"
							@click="toggleConflictStormResolver">
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
									cx="18"
									cy="18"
									r="3" />
								<circle
									cx="6"
									cy="6"
									r="3" />
								<path d="M13 6h3a2 2 0 0 1 2 2v7" />
								<line
									x1="6"
									y1="9"
									x2="6"
									y2="21" />
							</svg>
							<span>{{ t('duplicatefinder', 'Conflicts') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-vm-cow-button"
							:class="{ 'is-active': vmCowReflinkOpen }"
							:aria-pressed="vmCowReflinkOpen ? 'true' : 'false'"
							aria-keyshortcuts="$"
							:title="t('duplicatefinder', 'Toggle VM disk, database dump and container image CoW reflink auditor')"
							@click="toggleVmCowReflinkAuditor">
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
								<rect
									x="2"
									y="3"
									width="20"
									height="8"
									rx="2" />
								<rect
									x="2"
									y="13"
									width="20"
									height="8"
									rx="2" />
								<line
									x1="6"
									y1="7"
									x2="6.01"
									y2="7" />
								<line
									x1="6"
									y1="17"
									x2="6.01"
									y2="17" />
							</svg>
							<span>{{ t('duplicatefinder', 'VM / CoW') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-scientific-bundle-button"
							:class="{ 'is-active': scientificBundleOpen }"
							:aria-pressed="scientificBundleOpen ? 'true' : 'false'"
							aria-keyshortcuts="+"
							:title="t('duplicatefinder', 'Toggle scientific, GIS, CAD/BIM and ML-shard companion-bundle auditor')"
							@click="toggleScientificBundleAuditor">
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
								<path d="M12 2 2 7l10 5 10-5-10-5z" />
								<path d="m2 17 10 5 10-5" />
								<path d="m2 12 10 5 10-5" />
							</svg>
							<span>{{ t('duplicatefinder', 'Bundles') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-brand-kit-button"
							:class="{ 'is-active': brandKitAuditorOpen }"
							:aria-pressed="brandKitAuditorOpen ? 'true' : 'false'"
							aria-keyshortcuts=":"
							:title="t('duplicatefinder', 'Toggle creative brand kit, font family and vector/PSD master asset auditor')"
							@click="toggleBrandKitAuditor">
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
								<path d="M12 19l7-7 3 3-7 7-3-3z" />
								<path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
								<path d="M2 2l7.586 7.586" />
								<circle
									cx="11"
									cy="11"
									r="2" />
							</svg>
							<span>{{ t('duplicatefinder', 'Brand Kit') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-log-telemetry-button"
							:class="{ 'is-active': logTelemetryOpen }"
							:aria-pressed="logTelemetryOpen ? 'true' : 'false'"
							aria-keyshortcuts="|"
							:title="t('duplicatefinder', 'Toggle log rotation, telemetry dump and stale cache explosion auditor')"
							@click="toggleLogTelemetry">
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
								<polyline points="4 17 10 11 4 5" />
								<line
									x1="12"
									y1="19"
									x2="20"
									y2="19" />
							</svg>
							<span>{{ t('duplicatefinder', 'Logs & Caches') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-installer-repo-button"
							:class="{ 'is-active': installerRepoOpen }"
							:aria-pressed="installerRepoOpen ? 'true' : 'false'"
							aria-keyshortcuts="_"
							:title="t('duplicatefinder', 'Toggle OS installer, firmware, package cache and ISO distribution repository auditor')"
							@click="toggleInstallerRepo">
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
								<circle
									cx="12"
									cy="12"
									r="3" />
							</svg>
							<span>{{ t('duplicatefinder', 'Installers & ISOs') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-workbook-drift-button"
							:class="{ 'is-active': workbookDriftOpen }"
							:aria-pressed="workbookDriftOpen ? 'true' : 'false'"
							aria-keyshortcuts=">"
							:title="t('duplicatefinder', 'Toggle spreadsheet, BI report and financial workbook version-drift auditor')"
							@click="toggleWorkbookDrift">
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
								<rect
									x="3"
									y="3"
									width="18"
									height="18"
									rx="2" />
								<line
									x1="3"
									y1="9"
									x2="21"
									y2="9" />
								<line
									x1="9"
									y1="21"
									x2="9"
									y2="9" />
							</svg>
							<span>{{ t('duplicatefinder', 'Workbooks & BI') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-mailbox-archive-button"
							:class="{ 'is-active': mailboxArchiveOpen }"
							:aria-pressed="mailboxArchiveOpen ? 'true' : 'false'"
							aria-keyshortcuts="<"
							:title="t('duplicatefinder', 'Toggle email archive, mailbox dump and extracted attachment redundancy auditor')"
							@click="toggleMailboxArchive">
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
								<rect
									x="2"
									y="4"
									width="20"
									height="16"
									rx="2" />
								<path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
							</svg>
							<span>{{ t('duplicatefinder', 'Mail & Attachments') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-cad-vault-button"
							:class="{ 'is-active': cadVaultOpen }"
							:aria-pressed="cadVaultOpen ? 'true' : 'false'"
							aria-keyshortcuts="{"
							:title="t('duplicatefinder', 'Toggle CAD, 3D print, KiCad EDA and manufacturing release vault auditor')"
							@click="toggleCadVault">
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
								<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
								<polyline points="3.27 6.96 12 12.01 20.73 6.96" />
								<line
									x1="12"
									y1="22.08"
									x2="12"
									y2="12" />
							</svg>
							<span>{{ t('duplicatefinder', 'CAD & EDA') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-web-build-media-button"
							:class="{ 'is-active': webBuildMediaOpen }"
							:aria-pressed="webBuildMediaOpen ? 'true' : 'false'"
							aria-keyshortcuts="}"
							:title="t('duplicatefinder', 'Toggle web build output, responsive image pyramid, HLS/DASH chunks and source-map bloat auditor')"
							@click="toggleWebBuildMedia">
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
								<rect
									x="3"
									y="3"
									width="18"
									height="14"
									rx="2" />
								<path d="M8 21h8" />
								<path d="M12 17v4" />
								<path d="m7 9 3 2-3 2" />
								<path d="M13 13h4" />
							</svg>
							<span>{{ t('duplicatefinder', 'Web & Media') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-legal-document-ocr-button"
							:class="{ 'is-active': legalDocumentOcrOpen }"
							:aria-pressed="legalDocumentOcrOpen ? 'true' : 'false'"
							aria-keyshortcuts="("
							:title="t('duplicatefinder', 'Toggle legal contract, e-signature, OCR dual-scan and Office-PDF derivative auditor')"
							@click="toggleLegalDocumentOcr">
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
								<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
								<polyline points="14 2 14 8 20 8" />
								<path d="M9 15l2 2 4-4" />
							</svg>
							<span>{{ t('duplicatefinder', 'Docs & OCR') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-backup-takeout-button"
							:class="{ 'is-active': backupTakeoutOpen }"
							:aria-pressed="backupTakeoutOpen ? 'true' : 'false'"
							aria-keyshortcuts=")"
							:title="t('duplicatefinder', 'Toggle backup archive, cloud takeout bundle, dated snapshot and extracted-folder twin auditor')"
							@click="toggleBackupTakeout">
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
								<path d="M21 8v13H3V8" />
								<path d="M1 3h22v5H1z" />
								<path d="M10 12h4" />
							</svg>
							<span>{{ t('duplicatefinder', 'Backups & Takeout') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-daw-audio-button"
							:class="{ 'is-active': dawAudioOpen }"
							:aria-pressed="dawAudioOpen ? 'true' : 'false'"
							aria-keyshortcuts="&quot;"
							:title="t('duplicatefinder', 'Toggle DAW session, lossless stem master, mixdown revision and peak cache auditor')"
							@click="toggleDawAudio">
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
								<path d="M9 18V5l12-2v13" />
								<circle cx="6" cy="18" r="3" />
								<circle cx="18" cy="16" r="3" />
							</svg>
							<span>{{ t('duplicatefinder', 'Audio & DAW') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-vfx-render-cache-button"
							:class="{ 'is-active': vfxRenderCacheOpen }"
							:aria-pressed="vfxRenderCacheOpen ? 'true' : 'false'"
							aria-keyshortcuts="Shift+D"
							:title="t('duplicatefinder', 'Toggle 3D VFX scene, texture mip pyramid, bake sim cache and autosave auditor')"
							@click="toggleVfxRenderCache">
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
								<path d="M12 2l9 5v10l-9 5-9-5V7l9-5z" />
								<path d="M12 22V12" />
								<path d="M21 7l-9 5-9-5" />
							</svg>
							<span>{{ t('duplicatefinder', '3D & VFX Cache') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-elearning-scorm-button"
							:class="{ 'is-active': elearningScormOpen }"
							:aria-pressed="elearningScormOpen ? 'true' : 'false'"
							aria-keyshortcuts="Shift+L"
							:title="t('duplicatefinder', 'Toggle e-learning SCORM/H5P package, lecture recording transcode and slide deck handout auditor')"
							@click="toggleElearningScorm">
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
								<path d="M22 10v6M2 10l10-5 10 5-10 5z" />
								<path d="M6 12v5c0 2 2.7 3 6 3s6-1 6-3v-5" />
							</svg>
							<span>{{ t('duplicatefinder', 'Courses & SCORM') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-photo-raw-catalog-button"
							:class="{ 'is-active': photoRawCatalogOpen }"
							:aria-pressed="photoRawCatalogOpen ? 'true' : 'false'"
							aria-keyshortcuts="Shift+P"
							:title="t('duplicatefinder', 'Toggle RAW photography catalog, preview pyramid, sidecar and export derivative auditor')"
							@click="togglePhotoRawCatalog">
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
								<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
								<circle cx="12" cy="13" r="4" />
							</svg>
							<span>{{ t('duplicatefinder', 'RAW & Previews') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-vm-container-image-button"
							:class="{ 'is-active': vmContainerImageOpen }"
							:aria-pressed="vmContainerImageOpen ? 'true' : 'false'"
							aria-keyshortcuts="Shift+I"
							:title="t('duplicatefinder', 'Toggle VM, ISO and container image vault auditor')"
							@click="toggleVmContainerImage">
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
								<rect
									x="2"
									y="3"
									width="20"
									height="8"
									rx="2" />
								<rect
									x="2"
									y="13"
									width="20"
									height="8"
									rx="2" />
								<line
									x1="6"
									y1="7"
									x2="6.01"
									y2="7" />
								<line
									x1="6"
									y1="17"
									x2="6.01"
									y2="17" />
							</svg>
							<span>{{ t('duplicatefinder', 'VM & ISO Vault') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-ml-dataset-artifact-button"
							:class="{ 'is-active': mlDatasetArtifactOpen }"
							:aria-pressed="mlDatasetArtifactOpen ? 'true' : 'false'"
							aria-keyshortcuts="Shift+W"
							:title="t('duplicatefinder', 'Toggle ML weights, quantized checkpoints and dataset shard auditor')"
							@click="toggleMlDatasetArtifact">
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
								<ellipse
									cx="12"
									cy="5"
									rx="9"
									ry="3" />
								<path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
								<path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
							</svg>
							<span>{{ t('duplicatefinder', 'ML & Datasets') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-game3d-asset-vault-button"
							:class="{ 'is-active': game3dAssetVaultOpen }"
							:aria-pressed="game3dAssetVaultOpen ? 'true' : 'false'"
							aria-keyshortcuts="Shift+T"
							:title="t('duplicatefinder', 'Toggle Game Engine, Blender Backup and 3D PBR Texture Vault auditor')"
							@click="toggleGame3dAssetVault">
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
								<path d="M12 2 2 7l10 5 10-5-10-5z" />
								<path d="M2 17l10 5 10-5" />
								<path d="M2 12l10 5 10-5" />
							</svg>
							<span>{{ t('duplicatefinder', '3D & Game Vault') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-database-dump-log-button"
							:class="{ 'is-active': databaseDumpLogOpen }"
							:aria-pressed="databaseDumpLogOpen ? 'true' : 'false'"
							aria-keyshortcuts="Shift+Q"
							:title="t('duplicatefinder', 'Toggle Database Dump, Backup Snapshot and Log Rotation Vault auditor')"
							@click="toggleDatabaseDumpLog">
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
								<ellipse
									cx="12"
									cy="5"
									rx="9"
									ry="3" />
								<path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
								<path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
							</svg>
							<span>{{ t('duplicatefinder', 'DB & Log Vault') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-design-publishing-vault-button"
							:class="{ 'is-active': designPublishingVaultOpen }"
							:aria-pressed="designPublishingVaultOpen ? 'true' : 'false'"
							aria-keyshortcuts="Shift+F"
							:title="t('duplicatefinder', 'Toggle Creative Design Package, Print Proof and Typography Font Archive auditor')"
							@click="toggleDesignPublishingVault">
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
								<path d="M12 19l7-7 3 3-7 7-3-3z" />
								<path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
								<path d="M2 2l7.586 7.586" />
								<circle
									cx="11"
									cy="11"
									r="2" />
							</svg>
							<span>{{ t('duplicatefinder', 'Print & Font Vault') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-release-binary-artifact-button"
							:class="{ 'is-active': releaseBinaryArtifactOpen }"
							:aria-pressed="releaseBinaryArtifactOpen ? 'true' : 'false'"
							aria-keyshortcuts="Shift+K"
							:title="t('duplicatefinder', 'Toggle Release Binary, Signed Installer and SBOM Artifact Vault auditor')"
							@click="toggleReleaseBinaryArtifact">
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
								<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
								<path d="M9 12l2 2 4-4" />
							</svg>
							<span>{{ t('duplicatefinder', 'Release & SBOM Vault') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-email-archive-vault-button"
							:class="{ 'is-active': emailArchiveVaultOpen }"
							:aria-pressed="emailArchiveVaultOpen ? 'true' : 'false'"
							aria-keyshortcuts="Shift+H"
							:title="t('duplicatefinder', 'Toggle Email Archive, Mailbox Export and Attachment Vault auditor')"
							@click="toggleEmailArchiveVault">
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
								<rect
									x="2"
									y="4"
									width="20"
									height="16"
									rx="2" />
								<path d="M22 7l-10 7L2 7" />
							</svg>
							<span>{{ t('duplicatefinder', 'Email Archive Vault') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-audio-daw-vault-button"
							:class="{ 'is-active': audioDawVaultOpen }"
							:aria-pressed="audioDawVaultOpen ? 'true' : 'false'"
							aria-keyshortcuts="Shift+J"
							:title="t('duplicatefinder', 'Toggle Audio Production, DAW Project and Sample Library Vault auditor')"
							@click="toggleAudioDawVault">
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
								<path d="M9 18V5l12-2v13" />
								<circle
									cx="6"
									cy="18"
									r="3" />
								<circle
									cx="18"
									cy="16"
									r="3" />
							</svg>
							<span>{{ t('duplicatefinder', 'Audio DAW Vault') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-gis-map-archive-button"
							:class="{ 'is-active': gisMapArchiveOpen }"
							:aria-pressed="gisMapArchiveOpen ? 'true' : 'false'"
							aria-keyshortcuts="Shift+Z"
							:title="t('duplicatefinder', 'Toggle GIS, GeoSpatial Tile and CAD/BIM Map Archive Vault auditor')"
							@click="toggleGisMapArchive">
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
								<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
								<line
									x1="8"
									y1="2"
									x2="8"
									y2="18" />
								<line
									x1="16"
									y1="6"
									x2="16"
									y2="22" />
							</svg>
							<span>{{ t('duplicatefinder', 'GIS & Map Archive') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-scientific-research-vault-button"
							:class="{ 'is-active': scientificResearchVaultOpen }"
							:aria-pressed="scientificResearchVaultOpen ? 'true' : 'false'"
							aria-keyshortcuts="F8"
							:title="t('duplicatefinder', 'Toggle Academic Research, LaTeX/BibTeX and Scientific Dataset Vault auditor')"
							@click="toggleScientificResearchVault">
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
								<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
								<path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
								<line
									x1="9"
									y1="7"
									x2="16"
									y2="7" />
								<line
									x1="9"
									y1="11"
									x2="16"
									y2="11" />
							</svg>
							<span>{{ t('duplicatefinder', 'Research & Datasets') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-legal-contract-vault-button"
							:class="{ 'is-active': legalContractVaultOpen }"
							:aria-pressed="legalContractVaultOpen ? 'true' : 'false'"
							aria-keyshortcuts="F9"
							:title="t('duplicatefinder', 'Toggle Legal, Compliance and Signed Contract Vault auditor')"
							@click="toggleLegalContractVault">
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
								<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
								<path d="M9 12l2 2 4-4" />
							</svg>
							<span>{{ t('duplicatefinder', 'Legal & Contracts') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-medical-dicom-vault-button"
							:class="{ 'is-active': medicalDicomVaultOpen }"
							:aria-pressed="medicalDicomVaultOpen ? 'true' : 'false'"
							aria-keyshortcuts="F10"
							:title="t('duplicatefinder', 'Toggle Medical, DICOM and Health Imaging Vault auditor')"
							@click="toggleMedicalDicomVault">
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
								<rect
									x="3"
									y="3"
									width="18"
									height="18"
									rx="2" />
								<path d="M12 8v8" />
								<path d="M8 12h8" />
							</svg>
							<span>{{ t('duplicatefinder', 'Medical & DICOM') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-additive-mfg-vault-button"
							:class="{ 'is-active': additiveMfgVaultOpen }"
							:aria-pressed="additiveMfgVaultOpen ? 'true' : 'false'"
							aria-keyshortcuts="F7"
							:title="t('duplicatefinder', 'Toggle 3D Printing, CNC and Additive Manufacturing Vault auditor')"
							@click="toggleAdditiveMfgVault">
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
								<path d="M12 2l8 4.5v11L12 22l-8-4.5v-11L12 2z" />
								<path d="M12 12l8-4.5" />
								<path d="M12 12v10" />
								<path d="M12 12L4 7.5" />
							</svg>
							<span>{{ t('duplicatefinder', '3D Print & CNC') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-game-dev-pipeline-vault-button"
							:class="{ 'is-active': gameDevPipelineVaultOpen }"
							:aria-pressed="gameDevPipelineVaultOpen ? 'true' : 'false'"
							aria-keyshortcuts="F6"
							:title="t('duplicatefinder', 'Toggle Game Dev, Unity/Unreal and 3D Asset Pipeline Vault auditor')"
							@click="toggleGameDevPipelineVault">
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
								<polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
								<line x1="12" y1="22" x2="12" y2="15.5" />
								<polyline points="22 8.5 12 15.5 2 8.5" />
								<polyline points="2 15.5 12 8.5 22 15.5" />
								<line x1="12" y1="2" x2="12" y2="8.5" />
							</svg>
							<span>{{ t('duplicatefinder', 'Game Dev Pipeline') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-photo-grading-vault-button"
							:class="{ 'is-active': photoGradingVaultOpen }"
							:aria-pressed="photoGradingVaultOpen ? 'true' : 'false'"
							aria-keyshortcuts="F4"
							:title="t('duplicatefinder', 'Toggle Photography RAW, Lightroom/Capture One and Color Grading Vault auditor')"
							@click="togglePhotoGradingVault">
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
								<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
								<circle cx="12" cy="13" r="4" />
							</svg>
							<span>{{ t('duplicatefinder', 'RAW & Grading Vault') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-ml-checkpoint-vault-button"
							:class="{ 'is-active': mlCheckpointVaultOpen }"
							:aria-pressed="mlCheckpointVaultOpen ? 'true' : 'false'"
							aria-keyshortcuts="F2"
							:title="t('duplicatefinder', 'Toggle Machine Learning, LLM Weights and Dataset Checkpoint Vault auditor')"
							@click="toggleMlCheckpointVault">
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
								<rect x="4" y="4" width="16" height="16" rx="2" />
								<rect x="9" y="9" width="6" height="6" />
								<path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" />
							</svg>
							<span>{{ t('duplicatefinder', 'ML & LLM Vault') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-vm-backup-vault-button"
							:class="{ 'is-active': vmBackupVaultOpen }"
							:aria-pressed="vmBackupVaultOpen ? 'true' : 'false'"
							aria-keyshortcuts="F3"
							:title="t('duplicatefinder', 'Toggle Virtualization, VM Disk Images and Container Backup Vault auditor')"
							@click="toggleVmBackupVault">
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
								<rect x="2" y="3" width="20" height="7" rx="2" />
								<rect x="2" y="14" width="20" height="7" rx="2" />
								<line x1="6" y1="6.5" x2="6.01" y2="6.5" />
								<line x1="6" y1="17.5" x2="6.01" y2="17.5" />
							</svg>
							<span>{{ t('duplicatefinder', 'VM & Backup Vault') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-db-sql-log-vault-button"
							:class="{ 'is-active': dbSqlLogVaultOpen }"
							:aria-pressed="dbSqlLogVaultOpen ? 'true' : 'false'"
							aria-keyshortcuts="Shift+F8"
							:title="t('duplicatefinder', 'Toggle Database Dump, SQL Backup and Telemetry Log Vault auditor')"
							@click="toggleDbSqlLogVault">
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
								<ellipse cx="12" cy="5" rx="9" ry="3" />
								<path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
								<path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
							</svg>
							<span>{{ t('duplicatefinder', 'SQL & Telemetry Vault') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-broadcast-nle-vault-button"
							:class="{ 'is-active': broadcastNleVaultOpen }"
							:aria-pressed="broadcastNleVaultOpen ? 'true' : 'false'"
							aria-keyshortcuts="Shift+F9"
							:title="t('duplicatefinder', 'Toggle Broadcast Video, NLE Proxy and Camera Card Media Vault auditor')"
							@click="toggleBroadcastNleVault">
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
								<rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
								<line x1="7" y1="2" x2="7" y2="22" />
								<line x1="17" y1="2" x2="17" y2="22" />
								<line x1="2" y1="12" x2="22" y2="12" />
								<line x1="2" y1="7" x2="7" y2="7" />
								<line x1="2" y1="17" x2="7" y2="17" />
								<line x1="17" y1="17" x2="22" y2="17" />
								<line x1="17" y1="7" x2="22" y2="7" />
							</svg>
							<span>{{ t('duplicatefinder', 'Broadcast & NLE Vault') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-ecommerce-pim-vault-button"
							:class="{ 'is-active': ecommercePimVaultOpen }"
							:aria-pressed="ecommercePimVaultOpen ? 'true' : 'false'"
							aria-keyshortcuts="Shift+F7"
							:title="t('duplicatefinder', 'Toggle E-Commerce, PIM Product Media and Brand Asset Vault auditor')"
							@click="toggleEcommercePimVault">
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
								<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
								<line x1="3" y1="6" x2="21" y2="6" />
								<path d="M16 10a4 4 0 0 1-8 0" />
							</svg>
							<span>{{ t('duplicatefinder', 'E-Commerce & PIM Vault') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-finance-tax-vault-button"
							:class="{ 'is-active': financeTaxVaultOpen }"
							:aria-pressed="financeTaxVaultOpen ? 'true' : 'false'"
							aria-keyshortcuts="Shift+F6"
							:title="t('duplicatefinder', 'Toggle Financial, Accounting and Tax Compliance Vault auditor')"
							@click="toggleFinanceTaxVault">
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
								<rect x="2" y="3" width="20" height="18" rx="2" />
								<line x1="2" y1="9" x2="22" y2="9" />
								<line x1="9" y1="21" x2="9" y2="9" />
							</svg>
							<span>{{ t('duplicatefinder', 'Finance & Tax Vault') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-iot-firmware-vault-button"
							:class="{ 'is-active': iotFirmwareVaultOpen }"
							:aria-pressed="iotFirmwareVaultOpen ? 'true' : 'false'"
							aria-keyshortcuts="Shift+F4"
							:title="t('duplicatefinder', 'Toggle IoT Firmware, Embedded ROM and Hardware Lab Vault auditor')"
							@click="toggleIotFirmwareVault">
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
								<rect x="6" y="6" width="12" height="12" rx="2" />
								<line x1="9" y1="2" x2="9" y2="6" />
								<line x1="15" y1="2" x2="15" y2="6" />
								<line x1="9" y1="18" x2="9" y2="22" />
								<line x1="15" y1="18" x2="15" y2="22" />
								<line x1="2" y1="9" x2="6" y2="9" />
								<line x1="2" y1="15" x2="6" y2="15" />
								<line x1="18" y1="9" x2="22" y2="9" />
								<line x1="18" y1="15" x2="22" y2="15" />
							</svg>
							<span>{{ t('duplicatefinder', 'IoT & Firmware Vault') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-mobile-build-vault-button"
							:class="{ 'is-active': mobileBuildVaultOpen }"
							:aria-pressed="mobileBuildVaultOpen ? 'true' : 'false'"
							aria-keyshortcuts="Shift+F3"
							:title="t('duplicatefinder', 'Toggle Mobile App Build, iOS/Android Artifacts and Crash Symbol Vault auditor')"
							@click="toggleMobileBuildVault">
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
								<rect x="6" y="2" width="12" height="20" rx="2" />
								<line x1="12" y1="18" x2="12.01" y2="18" />
							</svg>
							<span>{{ t('duplicatefinder', 'Mobile & Crash Vault') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-k8s-terraform-vault-button"
							:class="{ 'is-active': k8sTerraformVaultOpen }"
							:aria-pressed="k8sTerraformVaultOpen ? 'true' : 'false'"
							aria-keyshortcuts="Shift+F2"
							:title="t('duplicatefinder', 'Toggle Kubernetes, Terraform and Infrastructure-as-Code State Vault auditor')"
							@click="toggleK8sTerraformVault">
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
								<polygon points="12 2 21 7 21 17 12 22 3 17 3 7 12 2" />
								<line x1="12" y1="22" x2="12" y2="12" />
								<line x1="21" y1="7" x2="12" y2="12" />
								<line x1="3" y1="7" x2="12" y2="12" />
							</svg>
							<span>{{ t('duplicatefinder', 'K8s & Terraform Vault') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-publishing-prepress-vault-button"
							:class="{ 'is-active': publishingPrepressVaultOpen }"
							:aria-pressed="publishingPrepressVaultOpen ? 'true' : 'false'"
							aria-keyshortcuts="Shift+F10"
							:title="t('duplicatefinder', 'Toggle Publishing, Prepress, Print-Ready PDF/X and Font Licensing Vault auditor')"
							@click="togglePublishingPrepressVault">
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
								<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
								<path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
								<line x1="8" y1="7" x2="16" y2="7" />
								<line x1="8" y1="11" x2="14" y2="11" />
							</svg>
							<span>{{ t('duplicatefinder', 'Publishing & Prepress Vault') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-genomics-bioinformatics-vault-button"
							:class="{ 'is-active': genomicsBioinformaticsVaultOpen }"
							:aria-pressed="genomicsBioinformaticsVaultOpen ? 'true' : 'false'"
							aria-keyshortcuts="Shift+F1"
							:title="t('duplicatefinder', 'Toggle Genomics, Bioinformatics and Scientific Sequencing Data Vault auditor')"
							@click="toggleGenomicsBioinformaticsVault">
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
								<path d="M2 15c6.667-6 13.333 0 20-6" />
								<path d="M9 22c1.798-1.998 2.518-3.995 2.807-5.993" />
								<path d="M15 2c-1.798 1.998-2.518 3.995-2.807 5.993" />
								<path d="m17 6-2.5-2.5" />
								<path d="m14 8-1-1" />
								<path d="m7 18 2.5 2.5" />
								<path d="m3.5 14.5.5.5" />
								<path d="m20 9 .5.5" />
								<path d="m6.5 12.5 1 1" />
								<path d="m16.5 10.5 1 1" />
								<path d="m10 16 1.5 1.5" />
							</svg>
							<span>{{ t('duplicatefinder', 'Genomics & Sequencing Vault') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-dfir-security-vault-button"
							:class="{ 'is-active': dfirSecurityVaultOpen }"
							:aria-pressed="dfirSecurityVaultOpen ? 'true' : 'false'"
							aria-keyshortcuts="Shift+F11"
							:title="t('duplicatefinder', 'Toggle Cybersecurity, DFIR Forensics, PCAP and Threat Intel Evidence Vault auditor')"
							@click="toggleDfirSecurityVault">
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
								<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
								<path d="M9 12l2 2 4-4" />
							</svg>
							<span>{{ t('duplicatefinder', 'DFIR & Security Vault') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-robotics-ros-vault-button"
							:class="{ 'is-active': roboticsRosVaultOpen }"
							:aria-pressed="roboticsRosVaultOpen ? 'true' : 'false'"
							aria-keyshortcuts="Shift+F12"
							:title="t('duplicatefinder', 'Toggle Robotics, Autonomous Systems, ROS2 Bags and LiDAR Point Cloud Vault auditor')"
							@click="toggleRoboticsRosVault">
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
								<rect x="4" y="7" width="16" height="12" rx="2" />
								<path d="M12 3v4" />
								<circle cx="9" cy="13" r="1.5" />
								<circle cx="15" cy="13" r="1.5" />
							</svg>
							<span>{{ t('duplicatefinder', 'Robotics & ROS2 Vault') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-semiconductor-eda-vault-button"
							:class="{ 'is-active': semiconductorEdaVaultOpen }"
							:aria-pressed="semiconductorEdaVaultOpen ? 'true' : 'false'"
							aria-keyshortcuts="Shift+F5"
							:title="t('duplicatefinder', 'Toggle Semiconductor EDA, ASIC/FPGA RTL, IC Layout and Waveform Verification Vault auditor')"
							@click="toggleSemiconductorEdaVault">
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
								<rect x="6" y="6" width="12" height="12" rx="1" />
								<path d="M9 1v5M15 1v5M9 18v5M15 18v5M1 9h5M1 15h5M18 9h5M18 15h5" />
							</svg>
							<span>{{ t('duplicatefinder', 'Semiconductor & EDA Vault') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-aerospace-cfd-vault-button"
							:class="{ 'is-active': aerospaceCfdVaultOpen }"
							:aria-pressed="aerospaceCfdVaultOpen ? 'true' : 'false'"
							aria-keyshortcuts="Alt+Shift+A"
							:title="t('duplicatefinder', 'Toggle Aerospace, CFD and Finite Element Simulation Vault auditor')"
							@click="toggleAerospaceCfdVault">
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
								<path d="M12 2L3 20l9-4 9 4L12 2z" />
								<path d="M12 10v6" />
							</svg>
							<span>{{ t('duplicatefinder', 'Aerospace & CFD Vault') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-battery-bms-vault-button"
							:class="{ 'is-active': batteryBmsVaultOpen }"
							:aria-pressed="batteryBmsVaultOpen ? 'true' : 'false'"
							aria-keyshortcuts="Alt+Shift+B"
							:title="t('duplicatefinder', 'Toggle Battery, EV Powertrain, BMS Telemetry and HIL Dyno Test Vault auditor')"
							@click="toggleBatteryBmsVault">
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
								<rect
									x="2"
									y="7"
									width="18"
									height="10"
									rx="2" />
								<path d="M22 11v2" />
								<path d="M11 9l-2 3h3l-2 3" />
							</svg>
							<span>{{ t('duplicatefinder', 'Battery & BMS Vault') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-chem-pharma-gmp-vault-button"
							:class="{ 'is-active': chemPharmaGmpVaultOpen }"
							:aria-pressed="chemPharmaGmpVaultOpen ? 'true' : 'false'"
							aria-keyshortcuts="Alt+Shift+C"
							:title="t('duplicatefinder', 'Toggle Chemical Process, Chromatography, Spectroscopy and Pharma GMP Vault auditor')"
							@click="toggleChemPharmaGmpVault">
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
								<path d="M9 3h6" />
								<path d="M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3" />
								<path d="M7.5 15h9" />
							</svg>
							<span>{{ t('duplicatefinder', 'Chem & Pharma GMP Vault') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-digital-grid-scada-vault-button"
							:class="{ 'is-active': digitalGridScadaVaultOpen }"
							:aria-pressed="digitalGridScadaVaultOpen ? 'true' : 'false'"
							aria-keyshortcuts="Alt+Shift+D"
							:title="t('duplicatefinder', 'Toggle Digital Grid, Substation SCADA, Protection Relay and Synchrophasor Vault auditor')"
							@click="toggleDigitalGridScadaVault">
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
								<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
							</svg>
							<span>{{ t('duplicatefinder', 'Digital Grid Vault') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-energy-seismic-vault-button"
							:class="{ 'is-active': energySeismicVaultOpen }"
							:aria-pressed="energySeismicVaultOpen ? 'true' : 'false'"
							aria-keyshortcuts="Alt+Shift+E"
							:title="t('duplicatefinder', 'Toggle Energy, Seismic SEG-Y, Well-Log and Reservoir Simulation Vault auditor')"
							@click="toggleEnergySeismicVault">
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
								<path d="M3 12h3l2-6 4 12 3-8 2 2h4" />
							</svg>
							<span>{{ t('duplicatefinder', 'Energy & Seismic Vault') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-fiber-telecom-rf-vault-button"
							:class="{ 'is-active': fiberTelecomRfVaultOpen }"
							:aria-pressed="fiberTelecomRfVaultOpen ? 'true' : 'false'"
							aria-keyshortcuts="Alt+Shift+F"
							:title="t('duplicatefinder', 'Toggle Fiber-Optic, Telecom RF Spectrum, VNA S-Parameter and 5G Baseband IQ Vault auditor')"
							@click="toggleFiberTelecomRfVault">
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
								<circle cx="12" cy="12" r="2" />
								<path d="M16.24 7.76a6 6 0 0 1 0 8.49" />
								<path d="M7.76 16.24a6 6 0 0 1 0-8.49" />
								<path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
								<path d="M4.93 19.07a10 10 0 0 1 0-14.14" />
							</svg>
							<span>{{ t('duplicatefinder', 'Fiber & RF Vault') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-geotech-shm-civil-vault-button"
							:class="{ 'is-active': geotechShmCivilVaultOpen }"
							:aria-pressed="geotechShmCivilVaultOpen ? 'true' : 'false'"
							aria-keyshortcuts="Alt+Shift+G"
							:title="t('duplicatefinder', 'Toggle Geotechnical, SHM, Tunneling TBM and Civil Sensor Vault auditor')"
							@click="toggleGeotechShmCivilVault">
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
								<path d="M3 20h18" />
								<path d="M5 20v-7a7 7 0 0 1 14 0v7" />
								<path d="M12 6v14" />
								<path d="M8.5 14h7" />
							</svg>
							<span>{{ t('duplicatefinder', 'Geotech & SHM Vault') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-hydrography-marine-vault-button"
							:class="{ 'is-active': hydrographyMarineVaultOpen }"
							:aria-pressed="hydrographyMarineVaultOpen ? 'true' : 'false'"
							aria-keyshortcuts="Alt+Shift+H"
							:title="t('duplicatefinder', 'Toggle Marine Hydrography, Multibeam Sonar and Subsea ROV Vault auditor')"
							@click="toggleHydrographyMarineVault">
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
								<path d="M2 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
								<path d="M2 19c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
								<path d="M12 3v9" />
								<path d="M8 7l4-4 4 4" />
							</svg>
							<span>{{ t('duplicatefinder', 'Hydro & ROV Vault') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-astronomy-fits-interferometry-vault-button"
							:class="{ 'is-active': astronomyFitsInterferometryVaultOpen }"
							:aria-pressed="astronomyFitsInterferometryVaultOpen ? 'true' : 'false'"
							aria-keyshortcuts="Alt+Shift+I"
							:title="t('duplicatefinder', 'Toggle Astronomy, FITS Astrophotography and Radio Interferometry Vault auditor')"
							@click="toggleAstronomyFitsInterferometryVault">
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
								<circle cx="12" cy="12" r="9" />
								<circle cx="12" cy="12" r="3" />
								<path d="M12 3v3" />
								<path d="M12 18v3" />
								<path d="M3 12h3" />
								<path d="M18 12h3" />
							</svg>
							<span>{{ t('duplicatefinder', 'Astro & FITS Vault') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-meteorology-climate-vault-button"
							:class="{ 'is-active': meteorologyClimateVaultOpen }"
							:aria-pressed="meteorologyClimateVaultOpen ? 'true' : 'false'"
							aria-keyshortcuts="Alt+Shift+J"
							:title="t('duplicatefinder', 'Toggle Meteorology, Weather Radar, NetCDF and Climate Model Vault auditor')"
							@click="toggleMeteorologyClimateVault">
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
								<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
								<path d="M12 12v6" />
								<path d="M9 15l3 3 3-3" />
							</svg>
							<span>{{ t('duplicatefinder', 'Meteo & Climate Vault') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-materials-microscopy-vault-button"
							:class="{ 'is-active': materialsMicroscopyVaultOpen }"
							:aria-pressed="materialsMicroscopyVaultOpen ? 'true' : 'false'"
							aria-keyshortcuts="Alt+Shift+K"
							:title="t('duplicatefinder', 'Toggle Materials Science, Electron Microscopy and Diffraction Vault auditor')"
							@click="toggleMaterialsMicroscopyVault">
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
								<polygon points="12 2 20 7 20 17 12 22 4 17 4 7 12 2" />
								<circle cx="12" cy="12" r="3" />
							</svg>
							<span>{{ t('duplicatefinder', 'Materials & EM Vault') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-lidar-photogrammetry-vault-button"
							:class="{ 'is-active': lidarPhotogrammetryVaultOpen }"
							:aria-pressed="lidarPhotogrammetryVaultOpen ? 'true' : 'false'"
							aria-keyshortcuts="Alt+Shift+L"
							:title="t('duplicatefinder', 'Toggle LiDAR, UAV Photogrammetry and Terrestrial Laser Scanning Vault auditor')"
							@click="toggleLidarPhotogrammetryVault">
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
								<path d="M12 2L2 7l10 5 10-5-10-5z" />
								<path d="M2 17l10 5 10-5" />
								<path d="M2 12l10 5 10-5" />
							</svg>
							<span>{{ t('duplicatefinder', 'LiDAR & Photogrammetry') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-mocap-biomechanics-vault-button"
							:class="{ 'is-active': mocapBiomechanicsVaultOpen }"
							:aria-pressed="mocapBiomechanicsVaultOpen ? 'true' : 'false'"
							aria-keyshortcuts="Alt+Shift+M"
							:title="t('duplicatefinder', 'Toggle Motion Capture, Biomechanics and Optical Tracking Vault auditor')"
							@click="toggleMocapBiomechanicsVault">
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
								<circle cx="12" cy="5" r="2" />
								<circle cx="6" cy="12" r="2" />
								<circle cx="18" cy="12" r="2" />
								<circle cx="8" cy="20" r="2" />
								<circle cx="16" cy="20" r="2" />
								<path d="M12 7v4m-4.5.5L12 11l4.5.5M12 11l-3.2 7.2M12 11l3.2 7.2" />
							</svg>
							<span>{{ t('duplicatefinder', 'Mocap & Biomechanics') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-neuroscience-electrophys-vault-button"
							:class="{ 'is-active': neuroscienceElectrophysVaultOpen }"
							:aria-pressed="neuroscienceElectrophysVaultOpen ? 'true' : 'false'"
							aria-keyshortcuts="Alt+Shift+N"
							:title="t('duplicatefinder', 'Toggle Neuroscience, Electrophysiology and BIDS Vault auditor')"
							@click="toggleNeuroscienceElectrophysVault">
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
								<path d="M2 12h3l2-5 3 10 3-12 3 11 2-4h4" />
							</svg>
							<span>{{ t('duplicatefinder', 'Neuro & BIDS') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-orbital-spacecraft-vault-button"
							:class="{ 'is-active': orbitalSpacecraftVaultOpen }"
							:aria-pressed="orbitalSpacecraftVaultOpen ? 'true' : 'false'"
							aria-keyshortcuts="Alt+Shift+O"
							:title="t('duplicatefinder', 'Toggle Orbital Spaceflight, CCSDS and Satellite Telemetry Vault auditor')"
							@click="toggleOrbitalSpacecraftVault">
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
									r="4" />
								<ellipse
									cx="12"
									cy="12"
									rx="10"
									ry="4"
									transform="rotate(-30 12 12)" />
								<circle
									cx="19"
									cy="8"
									r="1.5" />
							</svg>
							<span>{{ t('duplicatefinder', 'Orbital & CCSDS') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-particle-physics-hep-vault-button"
							:class="{ 'is-active': particlePhysicsHepVaultOpen }"
							:aria-pressed="particlePhysicsHepVaultOpen ? 'true' : 'false'"
							aria-keyshortcuts="Alt+Shift+P"
							:title="t('duplicatefinder', 'Toggle Particle Physics, HEP Detector and Synchrotron Beamline Vault auditor')"
							@click="toggleParticlePhysicsHepVault">
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
								<circle
									cx="12"
									cy="12"
									r="2.5" />
								<path d="M12 3v4" />
								<path d="M12 17v4" />
								<path d="M4.5 7.5l3.5 2" />
								<path d="M16 14.5l3.5 2" />
							</svg>
							<span>{{ t('duplicatefinder', 'Particle & HEP') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-quantum-qubit-pulse-vault-button"
							:class="{ 'is-active': quantumQubitPulseVaultOpen }"
							:aria-pressed="quantumQubitPulseVaultOpen ? 'true' : 'false'"
							aria-keyshortcuts="Alt+Shift+Q"
							:title="t('duplicatefinder', 'Toggle Quantum Computing, Cryogenic Qubit and Pulse-Control Vault auditor')"
							@click="toggleQuantumQubitPulseVault">
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
								<ellipse
									cx="12"
									cy="12"
									rx="9"
									ry="3.5" />
								<path d="M12 3v18" />
								<path d="M12 12l5-5" />
							</svg>
							<span>{{ t('duplicatefinder', 'Quantum & Qubit') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-railway-signaling-telemetry-vault-button"
							:class="{ 'is-active': railwaySignalingTelemetryVaultOpen }"
							:aria-pressed="railwaySignalingTelemetryVaultOpen ? 'true' : 'false'"
							aria-keyshortcuts="Alt+Shift+R"
							:title="t('duplicatefinder', 'Toggle Railway, ETCS/CBTC Signaling, Wayside Diagnostics and Rolling Stock Telemetry Vault auditor')"
							@click="toggleRailwaySignalingTelemetryVault">
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
								<rect
									x="6"
									y="3"
									width="12"
									height="12"
									rx="2" />
								<path d="M6 10h12" />
								<circle
									cx="9.5"
									cy="12.5"
									r="1" />
								<circle
									cx="14.5"
									cy="12.5"
									r="1" />
								<path d="M8 15l-3 6" />
								<path d="M16 15l3 6" />
								<path d="M6.5 18h11" />
							</svg>
							<span>{{ t('duplicatefinder', 'Railway & ETCS') }}</span>
						</button>
						<button
							v-if="activeView === 'details'"
							type="button"
							class="topbar-speech-asr-bioacoustics-vault-button"
							:class="{ 'is-active': speechAsrBioacousticsVaultOpen }"
							:aria-pressed="speechAsrBioacousticsVaultOpen ? 'true' : 'false'"
							aria-keyshortcuts="Alt+Shift+S"
							:title="t('duplicatefinder', 'Toggle Speech, Bioacoustics and Multilingual ASR Alignment Vault auditor')"
							@click="toggleSpeechAsrBioacousticsVault">
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
								<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
								<path d="M19 10v2a7 7 0 0 1-14 0v-2" />
								<path d="M12 19v3" />
								<path d="M8 22h8" />
							</svg>
							<span>{{ t('duplicatefinder', 'Speech & ASR') }}</span>
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
					<BatchAutoSelectWorkbench
						v-if="batchAutoSelectOpen"
						:filtered-duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onBatchSelectDuplicate"
						@compare-duplicate="onBatchCompareDuplicate"
						@start-scan="triggerScan"
						@batch-delete-completed="onBatchDeleteCompleted"
						@batch-acknowledge-completed="onBatchAcknowledgeCompleted"
						@close="batchAutoSelectOpen = false" />
					<FileHygieneInspector
						v-if="hygieneOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onHygieneSelectDuplicate"
						@compare-duplicate="onHygieneCompareDuplicate"
						@start-scan="triggerScan"
						@hygiene-delete-completed="onHygieneDeleteCompleted"
						@close="hygieneOpen = false" />
					<LinkDeduplicationSimulator
						v-if="linkSimulatorOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onLinkSimulatorSelectDuplicate"
						@compare-duplicate="onLinkSimulatorCompareDuplicate"
						@start-scan="triggerScan"
						@close="linkSimulatorOpen = false" />
					<FolderPairMatrix
						v-if="folderMatrixOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onFolderMatrixSelectDuplicate"
						@compare-duplicate="onFolderMatrixCompareDuplicate"
						@sync-folder-filter="onFolderMatrixSyncFolderFilter"
						@folder-pair-delete-completed="onFolderMatrixDeleteCompleted"
						@start-scan="triggerScan"
						@close="folderMatrixOpen = false" />
					<StorageFootprintAnalyzer
						v-if="footprintAnalyzerOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						:synced-extension-filter="footprintSyncedExtension"
						@select-duplicate="onFootprintSelectDuplicate"
						@compare-duplicate="onFootprintCompareDuplicate"
						@sync-extension-filter="onFootprintSyncExtensionFilter"
						@start-scan="triggerScan"
						@close="footprintAnalyzerOpen = false" />
					<PhotoBurstTimeline
						v-if="photoBurstsOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onPhotoBurstsSelectDuplicate"
						@compare-duplicate="onPhotoBurstsCompareDuplicate"
						@burst-delete-completed="onPhotoBurstsDeleteCompleted"
						@start-scan="triggerScan"
						@close="photoBurstsOpen = false" />
					<RecoverySafetyWorkbench
						v-if="recoverySafetyOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onRecoverySelectDuplicate"
						@compare-duplicate="onRecoveryCompareDuplicate"
						@recovery-delete-completed="onRecoveryDeleteCompleted"
						@recovery-acknowledge-completed="onRecoveryAcknowledgeCompleted"
						@start-scan="triggerScan"
						@close="recoverySafetyOpen = false" />
					<ArchivePayloadInspector
						v-if="archiveInspectorOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onArchiveSelectDuplicate"
						@compare-duplicate="onArchiveCompareDuplicate"
						@archive-delete-completed="onArchiveDeleteCompleted"
						@start-scan="triggerScan"
						@close="archiveInspectorOpen = false" />
					<AudioTagWorkbench
						v-if="audioWorkbenchOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onAudioSelectDuplicate"
						@compare-duplicate="onAudioCompareDuplicate"
						@audio-delete-completed="onAudioDeleteCompleted"
						@start-scan="triggerScan"
						@close="audioWorkbenchOpen = false" />
					<VideoSceneWorkbench
						v-if="videoWorkbenchOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onVideoSelectDuplicate"
						@compare-duplicate="onVideoCompareDuplicate"
						@video-delete-completed="onVideoDeleteCompleted"
						@start-scan="triggerScan"
						@close="videoWorkbenchOpen = false" />
					<SidecarSweepWorkbench
						v-if="sidecarSweepOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						:recent-cleaned-paths="recentCleanedPaths"
						:ignored-empty-folders="ignoredEmptyFolders"
						@select-duplicate="onSidecarSelectDuplicate"
						@compare-duplicate="onSidecarCompareDuplicate"
						@sidecar-delete-completed="onSidecarDeleteCompleted"
						@update-ignored-empty-folders="onUpdateIgnoredEmptyFolders"
						@empty-folders-deleted="onEmptyFoldersDeletedFromWorkbench"
						@start-scan="triggerScan"
						@close="sidecarSweepOpen = false" />
					<RuleProfilesWorkbench
						v-if="ruleProfilesOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onRuleProfilesSelectDuplicate"
						@compare-duplicate="onRuleProfilesCompareDuplicate"
						@rule-delete-completed="onRuleProfilesDeleteCompleted"
						@start-scan="triggerScan"
						@close="ruleProfilesOpen = false" />
					<DocumentLineageWorkbench
						v-if="documentLineageOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onDocumentLineageSelectDuplicate"
						@compare-duplicate="onDocumentLineageCompareDuplicate"
						@doc-delete-completed="onDocumentLineageDeleteCompleted"
						@start-scan="triggerScan"
						@close="documentLineageOpen = false" />
					<PhotoPerceptualWorkbench
						v-if="photoPerceptualOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onPhotoPerceptualSelectDuplicate"
						@compare-duplicate="onPhotoPerceptualCompareDuplicate"
						@photo-delete-completed="onPhotoPerceptualDeleteCompleted"
						@start-scan="triggerScan"
						@close="photoPerceptualOpen = false" />
					<BrokenMediaQuarantineWorkbench
						v-if="brokenQuarantineOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onBrokenQuarantineSelectDuplicate"
						@compare-duplicate="onBrokenQuarantineCompareDuplicate"
						@quarantine-delete-completed="onBrokenQuarantineDeleteCompleted"
						@start-scan="triggerScan"
						@close="brokenQuarantineOpen = false" />
					<RetentionAgeWorkbench
						v-if="retentionPrunerOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onRetentionSelectDuplicate"
						@compare-duplicate="onRetentionCompareDuplicate"
						@retention-delete-completed="onRetentionDeleteCompleted"
						@start-scan="triggerScan"
						@close="retentionPrunerOpen = false" />
					<FilenameCollisionWorkbench
						v-if="filenameCollisionsOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onFilenameCollisionSelectDuplicate"
						@compare-duplicate="onFilenameCollisionCompareDuplicate"
						@collision-delete-completed="onFilenameCollisionDeleteCompleted"
						@start-scan="triggerScan"
						@close="filenameCollisionsOpen = false" />
					<QuotaAttributionWorkbench
						v-if="quotaAttributionOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onQuotaSelectDuplicate"
						@compare-duplicate="onQuotaCompareDuplicate"
						@quota-delete-completed="onQuotaDeleteCompleted"
						@start-scan="triggerScan"
						@close="quotaAttributionOpen = false" />
					<PreviewCacheWorkbench
						v-if="previewCacheOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onPreviewCacheSelectDuplicate"
						@compare-duplicate="onPreviewCacheCompareDuplicate"
						@preview-cache-delete-completed="onPreviewCacheDeleteCompleted"
						@start-scan="triggerScan"
						@close="previewCacheOpen = false" />
					<ShareMountAuditorWorkbench
						v-if="shareMountAuditorOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onShareMountSelectDuplicate"
						@compare-duplicate="onShareMountCompareDuplicate"
						@share-mount-delete-completed="onShareMountDeleteCompleted"
						@start-scan="triggerScan"
						@close="shareMountAuditorOpen = false" />
					<BackupDriftWorkbench
						v-if="backupDriftOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onBackupDriftSelectDuplicate"
						@compare-duplicate="onBackupDriftCompareDuplicate"
						@backup-drift-delete-completed="onBackupDriftDeleteCompleted"
						@start-scan="triggerScan"
						@close="backupDriftOpen = false" />
					<AutomationRulebookWorkbench
						v-if="automationRulebookOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onAutomationRulebookSelectDuplicate"
						@compare-duplicate="onAutomationRulebookCompareDuplicate"
						@automation-delete-completed="onAutomationRulebookDeleteCompleted"
						@start-scan="triggerScan"
						@close="automationRulebookOpen = false" />
					<MetadataConsolidationWorkbench
						v-if="metadataConsolidationOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onMetadataConsolidationSelectDuplicate"
						@compare-duplicate="onMetadataConsolidationCompareDuplicate"
						@consolidation-delete-completed="onMetadataConsolidationDeleteCompleted"
						@start-scan="triggerScan"
						@close="metadataConsolidationOpen = false" />
					<ForensicVerifierWorkbench
						v-if="forensicVerifierOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onForensicSelectDuplicate"
						@compare-duplicate="onForensicCompareDuplicate"
						@forensic-delete-completed="onForensicDeleteCompleted"
						@start-scan="triggerScan"
						@close="forensicVerifierOpen = false" />
					<InodeSafetyWorkbench
						v-if="inodeVerifierOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onInodeSelectDuplicate"
						@compare-duplicate="onInodeCompareDuplicate"
						@inode-delete-completed="onInodeDeleteCompleted"
						@start-scan="triggerScan"
						@close="inodeVerifierOpen = false" />
					<ShadowReclaimWorkbench
						v-if="shadowReclaimOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onShadowSelectDuplicate"
						@compare-duplicate="onShadowCompareDuplicate"
						@shadow-delete-completed="onShadowDeleteCompleted"
						@start-scan="triggerScan"
						@close="shadowReclaimOpen = false" />
					<JunkPairInspectorWorkbench
						v-if="junkPairInspectorOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onJunkPairSelectDuplicate"
						@compare-duplicate="onJunkPairCompareDuplicate"
						@junk-pair-delete-completed="onJunkPairDeleteCompleted"
						@start-scan="triggerScan"
						@close="junkPairInspectorOpen = false" />
					<MediaFidelityWorkbench
						v-if="mediaFidelityOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onMediaFidelitySelectDuplicate"
						@compare-duplicate="onMediaFidelityCompareDuplicate"
						@fidelity-delete-completed="onMediaFidelityDeleteCompleted"
						@start-scan="triggerScan"
						@close="mediaFidelityOpen = false" />
					<CdcChunkingWorkbench
						v-if="cdcChunkingOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onCdcChunkingSelectDuplicate"
						@compare-duplicate="onCdcChunkingCompareDuplicate"
						@start-scan="triggerScan"
						@close="cdcChunkingOpen = false" />
					<OpsScheduleWorkbench
						v-if="opsScheduleOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onOpsScheduleSelectDuplicate"
						@compare-duplicate="onOpsScheduleCompareDuplicate"
						@start-scan="triggerScan"
						@close="opsScheduleOpen = false" />
					<LegalHoldWorkbench
						v-if="legalHoldOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onLegalHoldSelectDuplicate"
						@compare-duplicate="onLegalHoldCompareDuplicate"
						@start-scan="triggerScan"
						@close="legalHoldOpen = false" />
					<RansomwareCanaryWorkbench
						v-if="ransomwareCanaryOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onRansomwareCanarySelectDuplicate"
						@compare-duplicate="onRansomwareCanaryCompareDuplicate"
						@start-scan="triggerScan"
						@close="ransomwareCanaryOpen = false" />
					<DevTreeReclaimerWorkbench
						v-if="devTreeReclaimerOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onDevTreeSelectDuplicate"
						@compare-duplicate="onDevTreeCompareDuplicate"
						@start-scan="triggerScan"
						@close="devTreeReclaimerOpen = false" />
					<ConflictStormWorkbench
						v-if="conflictStormOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onConflictStormSelectDuplicate"
						@compare-duplicate="onConflictStormCompareDuplicate"
						@start-scan="triggerScan"
						@close="conflictStormOpen = false" />
					<VmCowReflinkWorkbench
						v-if="vmCowReflinkOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onVmCowSelectDuplicate"
						@compare-duplicate="onVmCowCompareDuplicate"
						@start-scan="triggerScan"
						@close="vmCowReflinkOpen = false" />
					<ScientificBundleWorkbench
						v-if="scientificBundleOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onScientificBundleSelectDuplicate"
						@compare-duplicate="onScientificBundleCompareDuplicate"
						@start-scan="triggerScan"
						@close="scientificBundleOpen = false" />
					<BrandKitAuditorWorkbench
						v-if="brandKitAuditorOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onBrandKitSelectDuplicate"
						@compare-duplicate="onBrandKitCompareDuplicate"
						@start-scan="triggerScan"
						@close="brandKitAuditorOpen = false" />
					<LogTelemetryWorkbench
						v-if="logTelemetryOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onLogTelemetrySelectDuplicate"
						@compare-duplicate="onLogTelemetryCompareDuplicate"
						@start-scan="triggerScan"
						@close="logTelemetryOpen = false" />
					<InstallerRepoWorkbench
						v-if="installerRepoOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onInstallerRepoSelectDuplicate"
						@compare-duplicate="onInstallerRepoCompareDuplicate"
						@start-scan="triggerScan"
						@close="installerRepoOpen = false" />
					<WorkbookDriftWorkbench
						v-if="workbookDriftOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onWorkbookDriftSelectDuplicate"
						@compare-duplicate="onWorkbookDriftCompareDuplicate"
						@start-scan="triggerScan"
						@close="workbookDriftOpen = false" />
					<MailboxArchiveWorkbench
						v-if="mailboxArchiveOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onMailboxArchiveSelectDuplicate"
						@compare-duplicate="onMailboxArchiveCompareDuplicate"
						@start-scan="triggerScan"
						@close="mailboxArchiveOpen = false" />
					<CadVaultWorkbench
						v-if="cadVaultOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onCadVaultSelectDuplicate"
						@compare-duplicate="onCadVaultCompareDuplicate"
						@start-scan="triggerScan"
						@close="cadVaultOpen = false" />
					<WebBuildMediaWorkbench
						v-if="webBuildMediaOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onWebBuildMediaSelectDuplicate"
						@compare-duplicate="onWebBuildMediaCompareDuplicate"
						@start-scan="triggerScan"
						@close="webBuildMediaOpen = false" />
					<LegalDocumentOcrWorkbench
						v-if="legalDocumentOcrOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onLegalDocumentOcrSelectDuplicate"
						@compare-duplicate="onLegalDocumentOcrCompareDuplicate"
						@start-scan="triggerScan"
						@close="legalDocumentOcrOpen = false" />
					<BackupTakeoutWorkbench
						v-if="backupTakeoutOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onBackupTakeoutSelectDuplicate"
						@compare-duplicate="onBackupTakeoutCompareDuplicate"
						@start-scan="triggerScan"
						@close="backupTakeoutOpen = false" />
					<DawAudioStemWorkbench
						v-if="dawAudioOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onDawAudioSelectDuplicate"
						@compare-duplicate="onDawAudioCompareDuplicate"
						@start-scan="triggerScan"
						@close="dawAudioOpen = false" />
					<VfxRenderCacheWorkbench
						v-if="vfxRenderCacheOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onVfxRenderCacheSelectDuplicate"
						@compare-duplicate="onVfxRenderCacheCompareDuplicate"
						@start-scan="triggerScan"
						@close="vfxRenderCacheOpen = false" />
					<ElearningScormWorkbench
						v-if="elearningScormOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onElearningScormSelectDuplicate"
						@compare-duplicate="onElearningScormCompareDuplicate"
						@start-scan="triggerScan"
						@close="elearningScormOpen = false" />
					<PhotoRawCatalogWorkbench
						v-if="photoRawCatalogOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onPhotoRawCatalogSelectDuplicate"
						@compare-duplicate="onPhotoRawCatalogCompareDuplicate"
						@start-scan="triggerScan"
						@close="photoRawCatalogOpen = false" />
					<VmContainerImageWorkbench
						v-if="vmContainerImageOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onVmContainerImageSelectDuplicate"
						@compare-duplicate="onVmContainerImageCompareDuplicate"
						@start-scan="triggerScan"
						@close="vmContainerImageOpen = false" />
					<MlDatasetArtifactWorkbench
						v-if="mlDatasetArtifactOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onMlDatasetArtifactSelectDuplicate"
						@compare-duplicate="onMlDatasetArtifactCompareDuplicate"
						@start-scan="triggerScan"
						@close="mlDatasetArtifactOpen = false" />
					<Game3dAssetVaultWorkbench
						v-if="game3dAssetVaultOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onGame3dAssetVaultSelectDuplicate"
						@compare-duplicate="onGame3dAssetVaultCompareDuplicate"
						@start-scan="triggerScan"
						@close="game3dAssetVaultOpen = false" />
					<DatabaseDumpLogWorkbench
						v-if="databaseDumpLogOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onDatabaseDumpLogSelectDuplicate"
						@compare-duplicate="onDatabaseDumpLogCompareDuplicate"
						@start-scan="triggerScan"
						@close="databaseDumpLogOpen = false" />
					<DesignPublishingVaultWorkbench
						v-if="designPublishingVaultOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onDesignPublishingVaultSelectDuplicate"
						@compare-duplicate="onDesignPublishingVaultCompareDuplicate"
						@start-scan="triggerScan"
						@close="designPublishingVaultOpen = false" />
					<ReleaseBinaryArtifactWorkbench
						v-if="releaseBinaryArtifactOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onReleaseBinaryArtifactSelectDuplicate"
						@compare-duplicate="onReleaseBinaryArtifactCompareDuplicate"
						@start-scan="triggerScan"
						@close="releaseBinaryArtifactOpen = false" />
					<EmailArchiveVaultWorkbench
						v-if="emailArchiveVaultOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onEmailArchiveVaultSelectDuplicate"
						@compare-duplicate="onEmailArchiveVaultCompareDuplicate"
						@start-scan="triggerScan"
						@close="emailArchiveVaultOpen = false" />
					<AudioDawVaultWorkbench
						v-if="audioDawVaultOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onAudioDawVaultSelectDuplicate"
						@compare-duplicate="onAudioDawVaultCompareDuplicate"
						@start-scan="triggerScan"
						@close="audioDawVaultOpen = false" />
					<GisMapArchiveWorkbench
						v-if="gisMapArchiveOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onGisMapArchiveSelectDuplicate"
						@compare-duplicate="onGisMapArchiveCompareDuplicate"
						@start-scan="triggerScan"
						@close="gisMapArchiveOpen = false" />
					<ScientificResearchVaultWorkbench
						v-if="scientificResearchVaultOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onScientificResearchVaultSelectDuplicate"
						@compare-duplicate="onScientificResearchVaultCompareDuplicate"
						@start-scan="triggerScan"
						@close="scientificResearchVaultOpen = false" />
					<LegalContractVaultWorkbench
						v-if="legalContractVaultOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onLegalContractVaultSelectDuplicate"
						@compare-duplicate="onLegalContractVaultCompareDuplicate"
						@start-scan="triggerScan"
						@close="legalContractVaultOpen = false" />
					<MedicalDicomVaultWorkbench
						v-if="medicalDicomVaultOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onMedicalDicomVaultSelectDuplicate"
						@compare-duplicate="onMedicalDicomVaultCompareDuplicate"
						@start-scan="triggerScan"
						@close="medicalDicomVaultOpen = false" />
					<AdditiveManufacturingVaultWorkbench
						v-if="additiveMfgVaultOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onAdditiveMfgVaultSelectDuplicate"
						@compare-duplicate="onAdditiveMfgVaultCompareDuplicate"
						@start-scan="triggerScan"
						@close="additiveMfgVaultOpen = false" />
					<GameDevPipelineVaultWorkbench
						v-if="gameDevPipelineVaultOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onGameDevPipelineVaultSelectDuplicate"
						@compare-duplicate="onGameDevPipelineVaultCompareDuplicate"
						@start-scan="triggerScan"
						@close="gameDevPipelineVaultOpen = false" />
					<PhotoGradingVaultWorkbench
						v-if="photoGradingVaultOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onPhotoGradingVaultSelectDuplicate"
						@compare-duplicate="onPhotoGradingVaultCompareDuplicate"
						@start-scan="triggerScan"
						@close="photoGradingVaultOpen = false" />
					<MlCheckpointVaultWorkbench
						v-if="mlCheckpointVaultOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onMlCheckpointVaultSelectDuplicate"
						@compare-duplicate="onMlCheckpointVaultCompareDuplicate"
						@start-scan="triggerScan"
						@close="mlCheckpointVaultOpen = false" />
					<VmBackupVaultWorkbench
						v-if="vmBackupVaultOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onVmBackupVaultSelectDuplicate"
						@compare-duplicate="onVmBackupVaultCompareDuplicate"
						@start-scan="triggerScan"
						@close="vmBackupVaultOpen = false" />
					<DbSqlLogVaultWorkbench
						v-if="dbSqlLogVaultOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onDbSqlLogVaultSelectDuplicate"
						@compare-duplicate="onDbSqlLogVaultCompareDuplicate"
						@start-scan="triggerScan"
						@close="dbSqlLogVaultOpen = false" />
					<BroadcastNleVaultWorkbench
						v-if="broadcastNleVaultOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onBroadcastNleVaultSelectDuplicate"
						@compare-duplicate="onBroadcastNleVaultCompareDuplicate"
						@start-scan="triggerScan"
						@close="broadcastNleVaultOpen = false" />
					<EcommercePimVaultWorkbench
						v-if="ecommercePimVaultOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onEcommercePimVaultSelectDuplicate"
						@compare-duplicate="onEcommercePimVaultCompareDuplicate"
						@start-scan="triggerScan"
						@close="ecommercePimVaultOpen = false" />
					<FinanceTaxVaultWorkbench
						v-if="financeTaxVaultOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onFinanceTaxVaultSelectDuplicate"
						@compare-duplicate="onFinanceTaxVaultCompareDuplicate"
						@start-scan="triggerScan"
						@close="financeTaxVaultOpen = false" />
					<IotFirmwareVaultWorkbench
						v-if="iotFirmwareVaultOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onIotFirmwareVaultSelectDuplicate"
						@compare-duplicate="onIotFirmwareVaultCompareDuplicate"
						@start-scan="triggerScan"
						@close="iotFirmwareVaultOpen = false" />
					<MobileBuildVaultWorkbench
						v-if="mobileBuildVaultOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onMobileBuildVaultSelectDuplicate"
						@compare-duplicate="onMobileBuildVaultCompareDuplicate"
						@start-scan="triggerScan"
						@close="mobileBuildVaultOpen = false" />
					<K8sTerraformVaultWorkbench
						v-if="k8sTerraformVaultOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onK8sTerraformVaultSelectDuplicate"
						@compare-duplicate="onK8sTerraformVaultCompareDuplicate"
						@start-scan="triggerScan"
						@close="k8sTerraformVaultOpen = false" />
					<PublishingPrepressVaultWorkbench
						v-if="publishingPrepressVaultOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onPublishingPrepressVaultSelectDuplicate"
						@compare-duplicate="onPublishingPrepressVaultCompareDuplicate"
						@start-scan="triggerScan"
						@close="publishingPrepressVaultOpen = false" />
					<GenomicsBioinformaticsVaultWorkbench
						v-if="genomicsBioinformaticsVaultOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onGenomicsBioinformaticsVaultSelectDuplicate"
						@compare-duplicate="onGenomicsBioinformaticsVaultCompareDuplicate"
						@start-scan="triggerScan"
						@close="genomicsBioinformaticsVaultOpen = false" />
					<DfirSecurityVaultWorkbench
						v-if="dfirSecurityVaultOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onDfirSecurityVaultSelectDuplicate"
						@compare-duplicate="onDfirSecurityVaultCompareDuplicate"
						@start-scan="triggerScan"
						@close="dfirSecurityVaultOpen = false" />
					<RoboticsRosVaultWorkbench
						v-if="roboticsRosVaultOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onRoboticsRosVaultSelectDuplicate"
						@compare-duplicate="onRoboticsRosVaultCompareDuplicate"
						@start-scan="triggerScan"
						@close="roboticsRosVaultOpen = false" />
					<SemiconductorEdaVaultWorkbench
						v-if="semiconductorEdaVaultOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onSemiconductorEdaVaultSelectDuplicate"
						@compare-duplicate="onSemiconductorEdaVaultCompareDuplicate"
						@start-scan="triggerScan"
						@close="semiconductorEdaVaultOpen = false" />
					<AerospaceCfdVaultWorkbench
						v-if="aerospaceCfdVaultOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onAerospaceCfdVaultSelectDuplicate"
						@compare-duplicate="onAerospaceCfdVaultCompareDuplicate"
						@start-scan="triggerScan"
						@close="aerospaceCfdVaultOpen = false" />
					<BatteryBmsVaultWorkbench
						v-if="batteryBmsVaultOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onBatteryBmsVaultSelectDuplicate"
						@compare-duplicate="onBatteryBmsVaultCompareDuplicate"
						@start-scan="triggerScan"
						@close="batteryBmsVaultOpen = false" />
					<ChemPharmaGmpVaultWorkbench
						v-if="chemPharmaGmpVaultOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onChemPharmaGmpVaultSelectDuplicate"
						@compare-duplicate="onChemPharmaGmpVaultCompareDuplicate"
						@start-scan="triggerScan"
						@close="chemPharmaGmpVaultOpen = false" />
					<DigitalGridScadaVaultWorkbench
						v-if="digitalGridScadaVaultOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onDigitalGridScadaVaultSelectDuplicate"
						@compare-duplicate="onDigitalGridScadaVaultCompareDuplicate"
						@start-scan="triggerScan"
						@close="digitalGridScadaVaultOpen = false" />
					<EnergySeismicVaultWorkbench
						v-if="energySeismicVaultOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onEnergySeismicVaultSelectDuplicate"
						@compare-duplicate="onEnergySeismicVaultCompareDuplicate"
						@start-scan="triggerScan"
						@close="energySeismicVaultOpen = false" />
					<FiberTelecomRfVaultWorkbench
						v-if="fiberTelecomRfVaultOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onFiberTelecomRfVaultSelectDuplicate"
						@compare-duplicate="onFiberTelecomRfVaultCompareDuplicate"
						@start-scan="triggerScan"
						@close="fiberTelecomRfVaultOpen = false" />
					<GeotechShmCivilVaultWorkbench
						v-if="geotechShmCivilVaultOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onGeotechShmCivilVaultSelectDuplicate"
						@compare-duplicate="onGeotechShmCivilVaultCompareDuplicate"
						@start-scan="triggerScan"
						@close="geotechShmCivilVaultOpen = false" />
					<HydrographyMarineVaultWorkbench
						v-if="hydrographyMarineVaultOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onHydrographyMarineVaultSelectDuplicate"
						@compare-duplicate="onHydrographyMarineVaultCompareDuplicate"
						@start-scan="triggerScan"
						@close="hydrographyMarineVaultOpen = false" />
					<AstronomyFitsInterferometryVaultWorkbench
						v-if="astronomyFitsInterferometryVaultOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onAstronomyFitsInterferometryVaultSelectDuplicate"
						@compare-duplicate="onAstronomyFitsInterferometryVaultCompareDuplicate"
						@start-scan="triggerScan"
						@close="astronomyFitsInterferometryVaultOpen = false" />
					<MeteorologyClimateVaultWorkbench
						v-if="meteorologyClimateVaultOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onMeteorologyClimateVaultSelectDuplicate"
						@compare-duplicate="onMeteorologyClimateVaultCompareDuplicate"
						@start-scan="triggerScan"
						@close="meteorologyClimateVaultOpen = false" />
					<MaterialsMicroscopyVaultWorkbench
						v-if="materialsMicroscopyVaultOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onMaterialsMicroscopyVaultSelectDuplicate"
						@compare-duplicate="onMaterialsMicroscopyVaultCompareDuplicate"
						@start-scan="triggerScan"
						@close="materialsMicroscopyVaultOpen = false" />
					<LidarPhotogrammetryVaultWorkbench
						v-if="lidarPhotogrammetryVaultOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onLidarPhotogrammetryVaultSelectDuplicate"
						@compare-duplicate="onLidarPhotogrammetryVaultCompareDuplicate"
						@start-scan="triggerScan"
						@close="lidarPhotogrammetryVaultOpen = false" />
					<MocapBiomechanicsVaultWorkbench
						v-if="mocapBiomechanicsVaultOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onMocapBiomechanicsVaultSelectDuplicate"
						@compare-duplicate="onMocapBiomechanicsVaultCompareDuplicate"
						@start-scan="triggerScan"
						@close="mocapBiomechanicsVaultOpen = false" />
					<NeuroscienceElectrophysVaultWorkbench
						v-if="neuroscienceElectrophysVaultOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onNeuroscienceElectrophysVaultSelectDuplicate"
						@compare-duplicate="onNeuroscienceElectrophysVaultCompareDuplicate"
						@start-scan="triggerScan"
						@close="neuroscienceElectrophysVaultOpen = false" />
					<OrbitalSpacecraftVaultWorkbench
						v-if="orbitalSpacecraftVaultOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onOrbitalSpacecraftVaultSelectDuplicate"
						@compare-duplicate="onOrbitalSpacecraftVaultCompareDuplicate"
						@start-scan="triggerScan"
						@close="orbitalSpacecraftVaultOpen = false" />
					<ParticlePhysicsHepVaultWorkbench
						v-if="particlePhysicsHepVaultOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onParticlePhysicsHepVaultSelectDuplicate"
						@compare-duplicate="onParticlePhysicsHepVaultCompareDuplicate"
						@start-scan="triggerScan"
						@close="particlePhysicsHepVaultOpen = false" />
					<QuantumQubitPulseVaultWorkbench
						v-if="quantumQubitPulseVaultOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onQuantumQubitPulseVaultSelectDuplicate"
						@compare-duplicate="onQuantumQubitPulseVaultCompareDuplicate"
						@start-scan="triggerScan"
						@close="quantumQubitPulseVaultOpen = false" />
					<RailwaySignalingTelemetryVaultWorkbench
						v-if="railwaySignalingTelemetryVaultOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onRailwaySignalingTelemetryVaultSelectDuplicate"
						@compare-duplicate="onRailwaySignalingTelemetryVaultCompareDuplicate"
						@start-scan="triggerScan"
						@close="railwaySignalingTelemetryVaultOpen = false" />
					<SpeechAsrBioacousticsVaultWorkbench
						v-if="speechAsrBioacousticsVaultOpen"
						:duplicates="treemapSourceDuplicates"
						:all-duplicates="allLoadedDuplicates"
						:current-duplicate-id="currentDuplicate ? currentDuplicate.id : null"
						@select-duplicate="onSpeechAsrBioacousticsVaultSelectDuplicate"
						@compare-duplicate="onSpeechAsrBioacousticsVaultCompareDuplicate"
						@start-scan="triggerScan"
						@close="speechAsrBioacousticsVaultOpen = false" />
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
import BatchAutoSelectWorkbench from './components/BatchAutoSelectWorkbench.vue';
import FileHygieneInspector from './components/FileHygieneInspector.vue';
import LinkDeduplicationSimulator from './components/LinkDeduplicationSimulator.vue';
import FolderPairMatrix from './components/FolderPairMatrix.vue'
import StorageFootprintAnalyzer from './components/StorageFootprintAnalyzer.vue'
import PhotoBurstTimeline from './components/PhotoBurstTimeline.vue'
import RecoverySafetyWorkbench from './components/RecoverySafetyWorkbench.vue'
import ArchivePayloadInspector from './components/ArchivePayloadInspector.vue'
import AudioTagWorkbench from './components/AudioTagWorkbench.vue'
import VideoSceneWorkbench from './components/VideoSceneWorkbench.vue'
import SidecarSweepWorkbench from './components/SidecarSweepWorkbench.vue'
import RuleProfilesWorkbench from './components/RuleProfilesWorkbench.vue'
import DocumentLineageWorkbench from './components/DocumentLineageWorkbench.vue'
import PhotoPerceptualWorkbench from './components/PhotoPerceptualWorkbench.vue'
import BrokenMediaQuarantineWorkbench from './components/BrokenMediaQuarantineWorkbench.vue'
import RetentionAgeWorkbench from './components/RetentionAgeWorkbench.vue'
import FilenameCollisionWorkbench from './components/FilenameCollisionWorkbench.vue'
import QuotaAttributionWorkbench from './components/QuotaAttributionWorkbench.vue'
import PreviewCacheWorkbench from './components/PreviewCacheWorkbench.vue'
import ShareMountAuditorWorkbench from './components/ShareMountAuditorWorkbench.vue'
import BackupDriftWorkbench from './components/BackupDriftWorkbench.vue'
import AutomationRulebookWorkbench from './components/AutomationRulebookWorkbench.vue'
import MetadataConsolidationWorkbench from './components/MetadataConsolidationWorkbench.vue'
import ForensicVerifierWorkbench from './components/ForensicVerifierWorkbench.vue'
import InodeSafetyWorkbench from './components/InodeSafetyWorkbench.vue'
import ShadowReclaimWorkbench from './components/ShadowReclaimWorkbench.vue'
import JunkPairInspectorWorkbench from './components/JunkPairInspectorWorkbench.vue'
import MediaFidelityWorkbench from './components/MediaFidelityWorkbench.vue'
import CdcChunkingWorkbench from './components/CdcChunkingWorkbench.vue'
import OpsScheduleWorkbench from './components/OpsScheduleWorkbench.vue'
import LegalHoldWorkbench from './components/LegalHoldWorkbench.vue'
import RansomwareCanaryWorkbench from './components/RansomwareCanaryWorkbench.vue'
import DevTreeReclaimerWorkbench from './components/DevTreeReclaimerWorkbench.vue'
import ConflictStormWorkbench from './components/ConflictStormWorkbench.vue'
import VmCowReflinkWorkbench from './components/VmCowReflinkWorkbench.vue'
import ScientificBundleWorkbench from './components/ScientificBundleWorkbench.vue'
import BrandKitAuditorWorkbench from './components/BrandKitAuditorWorkbench.vue'
import LogTelemetryWorkbench from './components/LogTelemetryWorkbench.vue'
import InstallerRepoWorkbench from './components/InstallerRepoWorkbench.vue'
import WorkbookDriftWorkbench from './components/WorkbookDriftWorkbench.vue'
import MailboxArchiveWorkbench from './components/MailboxArchiveWorkbench.vue'
import CadVaultWorkbench from './components/CadVaultWorkbench.vue'
import WebBuildMediaWorkbench from './components/WebBuildMediaWorkbench.vue'
import LegalDocumentOcrWorkbench from './components/LegalDocumentOcrWorkbench.vue'
import BackupTakeoutWorkbench from './components/BackupTakeoutWorkbench.vue'
import DawAudioStemWorkbench from './components/DawAudioStemWorkbench.vue'
import VfxRenderCacheWorkbench from './components/VfxRenderCacheWorkbench.vue'
import ElearningScormWorkbench from './components/ElearningScormWorkbench.vue'
import PhotoRawCatalogWorkbench from './components/PhotoRawCatalogWorkbench.vue'
import VmContainerImageWorkbench from './components/VmContainerImageWorkbench.vue'
import MlDatasetArtifactWorkbench from './components/MlDatasetArtifactWorkbench.vue'
import Game3dAssetVaultWorkbench from './components/Game3dAssetVaultWorkbench.vue'
import DatabaseDumpLogWorkbench from './components/DatabaseDumpLogWorkbench.vue'
import DesignPublishingVaultWorkbench from './components/DesignPublishingVaultWorkbench.vue'
import ReleaseBinaryArtifactWorkbench from './components/ReleaseBinaryArtifactWorkbench.vue'
import EmailArchiveVaultWorkbench from './components/EmailArchiveVaultWorkbench.vue'
import AudioDawVaultWorkbench from './components/AudioDawVaultWorkbench.vue'
import GisMapArchiveWorkbench from './components/GisMapArchiveWorkbench.vue'
import ScientificResearchVaultWorkbench from './components/ScientificResearchVaultWorkbench.vue'
import LegalContractVaultWorkbench from './components/LegalContractVaultWorkbench.vue'
import MedicalDicomVaultWorkbench from './components/MedicalDicomVaultWorkbench.vue'
import AdditiveManufacturingVaultWorkbench from './components/AdditiveManufacturingVaultWorkbench.vue'
import GameDevPipelineVaultWorkbench from './components/GameDevPipelineVaultWorkbench.vue'
import PhotoGradingVaultWorkbench from './components/PhotoGradingVaultWorkbench.vue'
import MlCheckpointVaultWorkbench from './components/MlCheckpointVaultWorkbench.vue'
import VmBackupVaultWorkbench from './components/VmBackupVaultWorkbench.vue'
import DbSqlLogVaultWorkbench from './components/DbSqlLogVaultWorkbench.vue'
import BroadcastNleVaultWorkbench from './components/BroadcastNleVaultWorkbench.vue'
import EcommercePimVaultWorkbench from './components/EcommercePimVaultWorkbench.vue'
import FinanceTaxVaultWorkbench from './components/FinanceTaxVaultWorkbench.vue'
import IotFirmwareVaultWorkbench from './components/IotFirmwareVaultWorkbench.vue'
import MobileBuildVaultWorkbench from './components/MobileBuildVaultWorkbench.vue'
import K8sTerraformVaultWorkbench from './components/K8sTerraformVaultWorkbench.vue'
import PublishingPrepressVaultWorkbench from './components/PublishingPrepressVaultWorkbench.vue'
import GenomicsBioinformaticsVaultWorkbench from './components/GenomicsBioinformaticsVaultWorkbench.vue'
import DfirSecurityVaultWorkbench from './components/DfirSecurityVaultWorkbench.vue'
import RoboticsRosVaultWorkbench from './components/RoboticsRosVaultWorkbench.vue'
import SemiconductorEdaVaultWorkbench from './components/SemiconductorEdaVaultWorkbench.vue'
import AerospaceCfdVaultWorkbench from './components/AerospaceCfdVaultWorkbench.vue'
import BatteryBmsVaultWorkbench from './components/BatteryBmsVaultWorkbench.vue'
import ChemPharmaGmpVaultWorkbench from './components/ChemPharmaGmpVaultWorkbench.vue'
import DigitalGridScadaVaultWorkbench from './components/DigitalGridScadaVaultWorkbench.vue'
import EnergySeismicVaultWorkbench from './components/EnergySeismicVaultWorkbench.vue'
import FiberTelecomRfVaultWorkbench from './components/FiberTelecomRfVaultWorkbench.vue'
import GeotechShmCivilVaultWorkbench from './components/GeotechShmCivilVaultWorkbench.vue'
import HydrographyMarineVaultWorkbench from './components/HydrographyMarineVaultWorkbench.vue'
import AstronomyFitsInterferometryVaultWorkbench from './components/AstronomyFitsInterferometryVaultWorkbench.vue'
import MeteorologyClimateVaultWorkbench from './components/MeteorologyClimateVaultWorkbench.vue'
import MaterialsMicroscopyVaultWorkbench from './components/MaterialsMicroscopyVaultWorkbench.vue'
import LidarPhotogrammetryVaultWorkbench from './components/LidarPhotogrammetryVaultWorkbench.vue'
import MocapBiomechanicsVaultWorkbench from './components/MocapBiomechanicsVaultWorkbench.vue'
import NeuroscienceElectrophysVaultWorkbench from './components/NeuroscienceElectrophysVaultWorkbench.vue'
import OrbitalSpacecraftVaultWorkbench from './components/OrbitalSpacecraftVaultWorkbench.vue'
import ParticlePhysicsHepVaultWorkbench from './components/ParticlePhysicsHepVaultWorkbench.vue'
import QuantumQubitPulseVaultWorkbench from './components/QuantumQubitPulseVaultWorkbench.vue'
import RailwaySignalingTelemetryVaultWorkbench from './components/RailwaySignalingTelemetryVaultWorkbench.vue'
import SpeechAsrBioacousticsVaultWorkbench from './components/SpeechAsrBioacousticsVaultWorkbench.vue'
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
		BatchAutoSelectWorkbench,
		FileHygieneInspector,
		LinkDeduplicationSimulator,
		FolderPairMatrix,
		StorageFootprintAnalyzer,
		PhotoBurstTimeline,
		RecoverySafetyWorkbench,
		ArchivePayloadInspector,
		AudioTagWorkbench,
		VideoSceneWorkbench,
		SidecarSweepWorkbench,
		RuleProfilesWorkbench,
		DocumentLineageWorkbench,
		PhotoPerceptualWorkbench,
		BrokenMediaQuarantineWorkbench,
		RetentionAgeWorkbench,
		FilenameCollisionWorkbench,
		QuotaAttributionWorkbench,
		PreviewCacheWorkbench,
		ShareMountAuditorWorkbench,
		BackupDriftWorkbench,
		AutomationRulebookWorkbench,
		MetadataConsolidationWorkbench,
		ForensicVerifierWorkbench,
		InodeSafetyWorkbench,
		ShadowReclaimWorkbench,
		JunkPairInspectorWorkbench,
		MediaFidelityWorkbench,
		CdcChunkingWorkbench,
		OpsScheduleWorkbench,
		LegalHoldWorkbench,
		RansomwareCanaryWorkbench,
		DevTreeReclaimerWorkbench,
		ConflictStormWorkbench,
		VmCowReflinkWorkbench,
		ScientificBundleWorkbench,
		BrandKitAuditorWorkbench,
		LogTelemetryWorkbench,
		InstallerRepoWorkbench,
		WorkbookDriftWorkbench,
		MailboxArchiveWorkbench,
		CadVaultWorkbench,
		WebBuildMediaWorkbench,
		LegalDocumentOcrWorkbench,
		BackupTakeoutWorkbench,
		DawAudioStemWorkbench,
		VfxRenderCacheWorkbench,
		ElearningScormWorkbench,
		PhotoRawCatalogWorkbench,
		VmContainerImageWorkbench,
		MlDatasetArtifactWorkbench,
		Game3dAssetVaultWorkbench,
		DatabaseDumpLogWorkbench,
		DesignPublishingVaultWorkbench,
		ReleaseBinaryArtifactWorkbench,
		EmailArchiveVaultWorkbench,
		AudioDawVaultWorkbench,
		GisMapArchiveWorkbench,
		ScientificResearchVaultWorkbench,
		LegalContractVaultWorkbench,
		MedicalDicomVaultWorkbench,
		AdditiveManufacturingVaultWorkbench,
		GameDevPipelineVaultWorkbench,
		PhotoGradingVaultWorkbench,
		MlCheckpointVaultWorkbench,
		VmBackupVaultWorkbench,
		DbSqlLogVaultWorkbench,
		BroadcastNleVaultWorkbench,
		EcommercePimVaultWorkbench,
		FinanceTaxVaultWorkbench,
		IotFirmwareVaultWorkbench,
		MobileBuildVaultWorkbench,
		K8sTerraformVaultWorkbench,
		PublishingPrepressVaultWorkbench,
		GenomicsBioinformaticsVaultWorkbench,
		DfirSecurityVaultWorkbench,
		RoboticsRosVaultWorkbench,
		SemiconductorEdaVaultWorkbench,
		AerospaceCfdVaultWorkbench,
		BatteryBmsVaultWorkbench,
		ChemPharmaGmpVaultWorkbench,
		DigitalGridScadaVaultWorkbench,
		EnergySeismicVaultWorkbench,
		FiberTelecomRfVaultWorkbench,
		GeotechShmCivilVaultWorkbench,
		HydrographyMarineVaultWorkbench,
		AstronomyFitsInterferometryVaultWorkbench,
		MeteorologyClimateVaultWorkbench,
		MaterialsMicroscopyVaultWorkbench,
		LidarPhotogrammetryVaultWorkbench,
		MocapBiomechanicsVaultWorkbench,
		NeuroscienceElectrophysVaultWorkbench,
		OrbitalSpacecraftVaultWorkbench,
		ParticlePhysicsHepVaultWorkbench,
		QuantumQubitPulseVaultWorkbench,
		RailwaySignalingTelemetryVaultWorkbench,
		SpeechAsrBioacousticsVaultWorkbench,
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
			batchAutoSelectOpen: false,
			hygieneOpen: false,
			linkSimulatorOpen: false,
			folderMatrixOpen: false,
			footprintAnalyzerOpen: false,
			photoBurstsOpen: false,
			recoverySafetyOpen: false,
			archiveInspectorOpen: false,
			audioWorkbenchOpen: false,
			videoWorkbenchOpen: false,
			sidecarSweepOpen: false,
			ruleProfilesOpen: false,
			documentLineageOpen: false,
			photoPerceptualOpen: false,
			brokenQuarantineOpen: false,
			retentionPrunerOpen: false,
			filenameCollisionsOpen: false,
			quotaAttributionOpen: false,
			previewCacheOpen: false,
			shareMountAuditorOpen: false,
			backupDriftOpen: false,
			automationRulebookOpen: false,
			metadataConsolidationOpen: false,
			forensicVerifierOpen: false,
			inodeVerifierOpen: false,
			shadowReclaimOpen: false,
			junkPairInspectorOpen: false,
			mediaFidelityOpen: false,
			cdcChunkingOpen: false,
			opsScheduleOpen: false,
			legalHoldOpen: false,
			ransomwareCanaryOpen: false,
			devTreeReclaimerOpen: false,
			conflictStormOpen: false,
			vmCowReflinkOpen: false,
			scientificBundleOpen: false,
			brandKitAuditorOpen: false,
			logTelemetryOpen: false,
			installerRepoOpen: false,
			workbookDriftOpen: false,
			mailboxArchiveOpen: false,
			cadVaultOpen: false,
			webBuildMediaOpen: false,
			legalDocumentOcrOpen: false,
			backupTakeoutOpen: false,
			dawAudioOpen: false,
			vfxRenderCacheOpen: false,
			elearningScormOpen: false,
			photoRawCatalogOpen: false,
			vmContainerImageOpen: false,
			mlDatasetArtifactOpen: false,
			game3dAssetVaultOpen: false,
			databaseDumpLogOpen: false,
			designPublishingVaultOpen: false,
			releaseBinaryArtifactOpen: false,
			emailArchiveVaultOpen: false,
			audioDawVaultOpen: false,
			gisMapArchiveOpen: false,
			scientificResearchVaultOpen: false,
			legalContractVaultOpen: false,
			medicalDicomVaultOpen: false,
			additiveMfgVaultOpen: false,
			gameDevPipelineVaultOpen: false,
			photoGradingVaultOpen: false,
			mlCheckpointVaultOpen: false,
			vmBackupVaultOpen: false,
			dbSqlLogVaultOpen: false,
			broadcastNleVaultOpen: false,
			ecommercePimVaultOpen: false,
			financeTaxVaultOpen: false,
			iotFirmwareVaultOpen: false,
			mobileBuildVaultOpen: false,
			k8sTerraformVaultOpen: false,
			publishingPrepressVaultOpen: false,
			genomicsBioinformaticsVaultOpen: false,
			dfirSecurityVaultOpen: false,
			roboticsRosVaultOpen: false,
			semiconductorEdaVaultOpen: false,
			aerospaceCfdVaultOpen: false,
			batteryBmsVaultOpen: false,
			chemPharmaGmpVaultOpen: false,
			digitalGridScadaVaultOpen: false,
			energySeismicVaultOpen: false,
			fiberTelecomRfVaultOpen: false,
			geotechShmCivilVaultOpen: false,
			hydrographyMarineVaultOpen: false,
			astronomyFitsInterferometryVaultOpen: false,
			meteorologyClimateVaultOpen: false,
			materialsMicroscopyVaultOpen: false,
			lidarPhotogrammetryVaultOpen: false,
			mocapBiomechanicsVaultOpen: false,
			neuroscienceElectrophysVaultOpen: false,
			orbitalSpacecraftVaultOpen: false,
			particlePhysicsHepVaultOpen: false,
			quantumQubitPulseVaultOpen: false,
			railwaySignalingTelemetryVaultOpen: false,
			speechAsrBioacousticsVaultOpen: false,
			reclamationHistory: loadReclamationHistory(),
			filteredDuplicatesForTreemap: null,
			treemapSyncedFolder: '',
			footprintSyncedExtension: '',
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
				'toggle-batch-auto-select': t('duplicatefinder', 'Toggle cross-group batch auto-select rules'),
				'toggle-file-hygiene': t('duplicatefinder', 'Toggle file hygiene and bad-extension inspector'),
				'toggle-link-simulator': t('duplicatefinder', 'Toggle hardlink and reference deduplication simulator'),
				'toggle-folder-matrix': t('duplicatefinder', 'Toggle directory folder pair matrix'),
				'toggle-storage-footprint': t('duplicatefinder', 'Toggle storage footprint and extension analyzer'),
				'toggle-photo-bursts': t('duplicatefinder', 'Toggle photo and media timeline bursts'),
				'toggle-recovery-safety': t('duplicatefinder', 'Toggle recovery safety manifest and share-impact audit'),
				'toggle-archive-inspector': t('duplicatefinder', 'Toggle archive and container payload inspector'),
				'toggle-audio-workbench': t('duplicatefinder', 'Toggle audio tags, bitrate and album consolidator workbench'),
				'toggle-video-workbench': t('duplicatefinder', 'Toggle video frame fingerprint, codec quality and duration tolerance inspector'),
				'toggle-sidecar-sweep': t('duplicatefinder', 'Toggle orphaned sidecar and post-cleanup empty-folder sweep inspector'),
				'toggle-rule-profiles': t('duplicatefinder', 'Toggle cleanup rule profiles, regex exclusions and batch audit log'),
				'toggle-document-lineage': t('duplicatefinder', 'Toggle near-duplicate document fuzzy diff and version lineage workbench'),
				'toggle-photo-perceptual': t('duplicatefinder', 'Toggle similar-photo perceptual pHash, EXIF sharpness and crop comparator workbench'),
				'toggle-broken-quarantine': t('duplicatefinder', 'Toggle broken, zero-byte, truncated media and corrupted header quarantine workbench'),
				'toggle-retention-pruner': t('duplicatefinder', 'Toggle retention age, cold-storage and stale artifact pruner workbench'),
				'toggle-filename-collisions': t('duplicatefinder', 'Toggle filename normalization and Locale/Unicode collision inspector'),
				'toggle-quota-attribution': t('duplicatefinder', 'Toggle multi-root cross-user quota attribution and chargeback heatmap'),
				'toggle-preview-cache': t('duplicatefinder', 'Toggle orphaned Nextcloud preview and cache reclaim analyzer'),
				'toggle-share-mount-auditor': t('duplicatefinder', 'Toggle cross-share permission and orphaned external-mount auditor'),
				'toggle-backup-drift': t('duplicatefinder', 'Toggle backup snapshot and mirror-tree drift synchronizer'),
				'toggle-automation-rulebook': t('duplicatefinder', 'Toggle zero-touch scheduled retention rulebook and policy simulator'),
				'toggle-metadata-consolidation': t('duplicatefinder', 'Toggle Nextcloud metadata, tag, favorite and share-link consolidation workbench'),
				'toggle-forensic-verifier': t('duplicatefinder', 'Toggle zero-touch duplicate forensic diff and checksum chain verifier'),
				'toggle-inode-verifier': t('duplicatefinder', 'Toggle cross-volume inode, hardlink-alias and storage-backend safety verifier'),
				'toggle-shadow-reclaim': t('duplicatefinder', 'Toggle Nextcloud versions, trashbin and appdata shadow-duplicate reclaimer'),
				'toggle-junk-pair-inspector': t('duplicatefinder', 'Toggle zero-byte, truncated partial and AppleDouble junk pair inspector'),
				'toggle-media-fidelity-ranker': t('duplicatefinder', 'Toggle near-duplicate media fidelity and transcode-loss ranker'),
				'toggle-cdc-chunking-estimator': t('duplicatefinder', 'Toggle CDC / ZFS / Restic sub-file savings estimator'),
				'toggle-ops-schedule-generator': t('duplicatefinder', 'Toggle automated deduplication schedule, systemd/cron and flock/ionice generator'),
				'toggle-legal-hold-guard': t('duplicatefinder', 'Toggle compliance legal hold, evidence freeze and e-discovery guard'),
				'toggle-ransomware-canary-guard': t('duplicatefinder', 'Toggle ransomware canary, extension drift and mass-entropy anomaly guard'),
				'toggle-dev-tree-reclaimer': t('duplicatefinder', 'Toggle dev workspace and dependency bloat whole-tree reclaimer'),
				'toggle-conflict-storm-resolver': t('duplicatefinder', 'Toggle sync-conflict storm and cloud import fork resolver'),
				'toggle-vm-cow-reflink-auditor': t('duplicatefinder', 'Toggle VM disk, database dump and container image CoW reflink auditor'),
				'toggle-scientific-bundle-auditor': t('duplicatefinder', 'Toggle scientific, GIS, CAD/BIM and ML-shard companion-bundle auditor'),
				'toggle-brand-kit-auditor': t('duplicatefinder', 'Toggle creative brand kit, font family and vector/PSD master asset auditor'),
				'toggle-log-telemetry-auditor': t('duplicatefinder', 'Toggle log rotation, telemetry dump and stale cache explosion auditor'),
				'toggle-installer-repo-auditor': t('duplicatefinder', 'Toggle OS installer, firmware, package cache and ISO distribution repository auditor'),
				'toggle-workbook-drift-auditor': t('duplicatefinder', 'Toggle spreadsheet, BI report and financial workbook version-drift auditor'),
				'toggle-mailbox-archive-auditor': t('duplicatefinder', 'Toggle email archive, mailbox dump and extracted attachment redundancy auditor'),
				'toggle-cad-vault-auditor': t('duplicatefinder', 'Toggle CAD, 3D print, KiCad EDA and manufacturing release vault auditor'),
				'toggle-web-build-media-auditor': t('duplicatefinder', 'Toggle web build output, responsive image pyramid, HLS/DASH chunks and source-map bloat auditor'),
				'toggle-legal-document-ocr-auditor': t('duplicatefinder', 'Toggle legal contract, e-signature, OCR dual-scan and Office-PDF derivative auditor'),
				'toggle-backup-takeout-auditor': t('duplicatefinder', 'Toggle backup archive, cloud takeout bundle, dated snapshot and extracted-folder twin auditor'),
				'toggle-daw-audio-stem-auditor': t('duplicatefinder', 'Toggle DAW session, lossless stem master, mixdown revision and peak cache auditor'),
				'toggle-vfx-render-cache-auditor': t('duplicatefinder', 'Toggle 3D VFX scene, texture mip pyramid, bake sim cache and autosave auditor'),
				'toggle-elearning-scorm-auditor': t('duplicatefinder', 'Toggle e-learning SCORM/H5P package, lecture recording transcode and slide deck handout auditor'),
				'toggle-photo-raw-catalog-auditor': t('duplicatefinder', 'Toggle RAW photography catalog, preview pyramid, sidecar and export derivative auditor'),
				'toggle-vm-container-image-auditor': t('duplicatefinder', 'Toggle VM, ISO and container image vault auditor'),
				'toggle-ml-dataset-artifact-auditor': t('duplicatefinder', 'Toggle ML weights, quantized checkpoints and dataset shard auditor'),
				'toggle-game3d-asset-vault-auditor': t('duplicatefinder', 'Toggle Game Engine, Blender backup and 3D PBR texture vault auditor'),
				'toggle-database-dump-log-auditor': t('duplicatefinder', 'Toggle Database Dump, Backup Snapshot and Log Rotation Vault auditor'),
				'toggle-design-publishing-vault-auditor': t('duplicatefinder', 'Toggle Creative Design Package, Print Proof and Typography Font Archive auditor'),
				'toggle-release-binary-artifact-auditor': t('duplicatefinder', 'Toggle Release Binary, Signed Installer and SBOM Artifact Vault auditor'),
				'toggle-email-archive-vault-auditor': t('duplicatefinder', 'Toggle Email Archive, Mailbox Export and Attachment Vault auditor'),
				'toggle-audio-daw-vault-auditor': t('duplicatefinder', 'Toggle Audio Production, DAW Project and Sample Library Vault auditor'),
				'toggle-gis-map-archive-auditor': t('duplicatefinder', 'Toggle GIS, GeoSpatial Tile and CAD/BIM Map Archive Vault auditor'),
				'toggle-scientific-research-vault-auditor': t('duplicatefinder', 'Toggle Academic Research, LaTeX/BibTeX and Scientific Dataset Vault auditor'),
				'toggle-legal-contract-vault-auditor': t('duplicatefinder', 'Toggle Legal, Compliance and Signed Contract Vault auditor'),
				'toggle-medical-dicom-vault-auditor': t('duplicatefinder', 'Toggle Medical, DICOM and Health Imaging Vault auditor'),
				'toggle-additive-mfg-vault-auditor': t('duplicatefinder', 'Toggle 3D Printing, CNC and Additive Manufacturing Vault auditor'),
				'toggle-game-dev-pipeline-vault-auditor': t('duplicatefinder', 'Toggle Game Dev, Unity/Unreal and 3D Asset Pipeline Vault auditor'),
				'toggle-photo-grading-vault-auditor': t('duplicatefinder', 'Toggle Photography RAW, Lightroom/Capture One and Color Grading Vault auditor'),
				'toggle-ml-checkpoint-vault-auditor': t('duplicatefinder', 'Toggle Machine Learning, LLM Weights and Dataset Checkpoint Vault auditor'),
				'toggle-db-sql-log-vault-auditor': t('duplicatefinder', 'Toggle Database Dump, SQL Backup and Telemetry Log Vault auditor'),
				'toggle-broadcast-nle-vault-auditor': t('duplicatefinder', 'Toggle Broadcast Video, NLE Proxy and Camera Card Media Vault auditor'),
				'toggle-ecommerce-pim-vault-auditor': t('duplicatefinder', 'Toggle E-Commerce, PIM Product Media and Brand Asset Vault auditor'),
				'toggle-finance-tax-vault-auditor': t('duplicatefinder', 'Toggle Financial, Accounting and Tax Compliance Vault auditor'),
				'toggle-iot-firmware-vault-auditor': t('duplicatefinder', 'Toggle IoT Firmware, Embedded ROM and Hardware Lab Vault auditor'),
				'toggle-mobile-build-vault-auditor': t('duplicatefinder', 'Toggle Mobile App Build, iOS/Android Artifacts and Crash Symbol Vault auditor'),
				'toggle-k8s-terraform-vault-auditor': t('duplicatefinder', 'Toggle Kubernetes, Terraform and Infrastructure-as-Code State Vault auditor'),
				'toggle-publishing-prepress-vault-auditor': t('duplicatefinder', 'Toggle Publishing, Prepress, Print-Ready PDF/X and Font Licensing Vault auditor'),
				'toggle-genomics-bioinformatics-vault-auditor': t('duplicatefinder', 'Toggle Genomics, Bioinformatics and Scientific Sequencing Data Vault auditor'),
				'toggle-dfir-security-vault-auditor': t('duplicatefinder', 'Toggle Cybersecurity, DFIR Forensics, PCAP and Threat Intel Evidence Vault auditor'),
				'toggle-robotics-ros-vault-auditor': t('duplicatefinder', 'Toggle Robotics, Autonomous Systems, ROS2 Bags and LiDAR Point Cloud Vault auditor'),
				'toggle-semiconductor-eda-vault-auditor': t('duplicatefinder', 'Toggle Semiconductor EDA, ASIC/FPGA RTL, IC Layout and Waveform Verification Vault auditor'),
				'toggle-aerospace-cfd-vault-auditor': t('duplicatefinder', 'Toggle Aerospace, CFD and Finite Element Simulation Vault auditor'),
				'toggle-battery-bms-vault-auditor': t('duplicatefinder', 'Toggle Battery, EV Powertrain, BMS Telemetry and HIL Dyno Test Vault auditor'),
				'toggle-chem-pharma-gmp-vault-auditor': t('duplicatefinder', 'Toggle Chemical Process, Chromatography, Spectroscopy and Pharma GMP Vault auditor'),
				'toggle-digital-grid-scada-vault-auditor': t('duplicatefinder', 'Toggle Digital Grid, Substation SCADA, Protection Relay and Synchrophasor Vault auditor'),
				'toggle-energy-seismic-vault-auditor': t('duplicatefinder', 'Toggle Energy, Seismic SEG-Y, Well-Log and Reservoir Simulation Vault auditor'),
				'toggle-fiber-telecom-rf-vault-auditor': t('duplicatefinder', 'Toggle Fiber-Optic, Telecom RF Spectrum, VNA S-Parameter and 5G Baseband IQ Vault auditor'),
				'toggle-geotech-shm-civil-vault-auditor': t('duplicatefinder', 'Toggle Geotechnical, SHM, Tunneling TBM and Civil Sensor Vault auditor'),
				'toggle-hydrography-marine-vault-auditor': t('duplicatefinder', 'Toggle Marine Hydrography, Multibeam Sonar and Subsea ROV Vault auditor'),
				'toggle-astronomy-fits-interferometry-vault-auditor': t('duplicatefinder', 'Toggle Astronomy, FITS Astrophotography and Radio Interferometry Vault auditor'),
				'toggle-meteorology-climate-vault-auditor': t('duplicatefinder', 'Toggle Meteorology, Weather Radar, NetCDF and Climate Model Vault auditor'),
				'toggle-materials-microscopy-vault-auditor': t('duplicatefinder', 'Toggle Materials Science, Electron Microscopy and Diffraction Vault auditor'),
				'toggle-lidar-photogrammetry-vault-auditor': t('duplicatefinder', 'Toggle LiDAR, UAV Photogrammetry and Terrestrial Laser Scanning Vault auditor'),
				'toggle-mocap-biomechanics-vault-auditor': t('duplicatefinder', 'Toggle Motion Capture, Biomechanics and Optical Tracking Vault auditor'),
				'toggle-neuroscience-electrophys-vault-auditor': t('duplicatefinder', 'Toggle Neuroscience, Electrophysiology and BIDS Vault auditor'),
				'toggle-orbital-spacecraft-vault-auditor': t('duplicatefinder', 'Toggle Orbital Spaceflight, CCSDS and Satellite Telemetry Vault auditor'),
				'toggle-particle-physics-hep-vault-auditor': t('duplicatefinder', 'Toggle Particle Physics, HEP Detector and Synchrotron Beamline Vault auditor'),
				'toggle-quantum-qubit-pulse-vault-auditor': t('duplicatefinder', 'Toggle Quantum Computing, Cryogenic Qubit and Pulse-Control Vault auditor'),
				'toggle-railway-signaling-telemetry-vault-auditor': t('duplicatefinder', 'Toggle Railway, ETCS/CBTC Signaling, Wayside Diagnostics and Rolling Stock Telemetry Vault auditor'),
				'toggle-speech-asr-bioacoustics-vault-auditor': t('duplicatefinder', 'Toggle Speech, Bioacoustics and Multilingual ASR Alignment Vault auditor'),
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
		toggleBatchAutoSelect() {
			if (this.activeView !== 'details' || !this.hasDuplicates) {
				return false
			}
			this.batchAutoSelectOpen = !this.batchAutoSelectOpen
			return true
		},
		onBatchSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onBatchCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleFileHygiene() {
			if (this.activeView !== 'details' || !this.hasDuplicates) {
				return false
			}
			this.hygieneOpen = !this.hygieneOpen
			return true
		},
		onHygieneSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onHygieneCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		onHygieneDeleteCompleted(payload) {
			this.onBatchDeleteCompleted(payload)
		},
		toggleLinkSimulator() {
			if (this.activeView !== 'details' || !this.hasDuplicates) {
				return false
			}
			this.linkSimulatorOpen = !this.linkSimulatorOpen
			return true
		},
		onLinkSimulatorSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onLinkSimulatorCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleFolderMatrix() {
			if (this.activeView !== 'details' || !this.hasDuplicates) {
				return false
			}
			this.folderMatrixOpen = !this.folderMatrixOpen
			return true
		},
		onFolderMatrixSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onFolderMatrixCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		onFolderMatrixSyncFolderFilter(folderPath) {
			this.onTreemapSyncFolderFilter(folderPath)
		},
		onFolderMatrixDeleteCompleted(payload) {
			this.onBatchDeleteCompleted(payload)
		},
		toggleFootprintAnalyzer() {
			if (this.activeView !== 'details' || !this.hasDuplicates) {
				return false
			}
			this.footprintAnalyzerOpen = !this.footprintAnalyzerOpen
			return true
		},
		onFootprintSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onFootprintCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		onFootprintSyncExtensionFilter(ext) {
			const normalized = typeof ext === 'string' ? ext.trim() : ''
			this.footprintSyncedExtension = normalized
			if (
				this.$refs.duplicateNavigation
				&& typeof this.$refs.duplicateNavigation.setExtensionFilter === 'function'
			) {
				this.$refs.duplicateNavigation.setExtensionFilter(normalized)
			}
		},
		onExtensionFilterChanged(ext) {
			this.footprintSyncedExtension = typeof ext === 'string' ? ext.trim() : ''
		},
		togglePhotoBursts() {
			if (this.activeView !== 'details' || !this.hasDuplicates) {
				return false
			}
			this.photoBurstsOpen = !this.photoBurstsOpen
			return true
		},
		onPhotoBurstsSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onPhotoBurstsCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		onPhotoBurstsDeleteCompleted(payload) {
			this.onBatchDeleteCompleted(payload)
		},
		toggleRecoverySafety() {
			if (this.activeView !== 'details' || !this.hasDuplicates) {
				return false
			}
			this.recoverySafetyOpen = !this.recoverySafetyOpen
			return true
		},
		onRecoverySelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onRecoveryCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		onRecoveryDeleteCompleted(payload) {
			this.onBatchDeleteCompleted(payload)
		},
		onRecoveryAcknowledgeCompleted(payload) {
			this.onBatchAcknowledgeCompleted(payload)
		},
		toggleArchiveInspector() {
			if (this.activeView !== 'details' || !this.hasDuplicates) {
				return false
			}
			this.archiveInspectorOpen = !this.archiveInspectorOpen
			return true
		},
		onArchiveSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onArchiveCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		onArchiveDeleteCompleted(payload) {
			this.onBatchDeleteCompleted(payload)
		},
		toggleAudioWorkbench() {
			if (this.activeView !== 'details' || !this.hasDuplicates) {
				return false
			}
			this.audioWorkbenchOpen = !this.audioWorkbenchOpen
			return true
		},
		onAudioSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onAudioCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		onAudioDeleteCompleted(payload) {
			this.onBatchDeleteCompleted(payload)
		},
		toggleVideoWorkbench() {
			if (this.activeView !== 'details' || !this.hasDuplicates) {
				return false
			}
			this.videoWorkbenchOpen = !this.videoWorkbenchOpen
			return true
		},
		onVideoSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onVideoCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		onVideoDeleteCompleted(payload) {
			this.onBatchDeleteCompleted(payload)
		},
		toggleSidecarSweep() {
			if (this.activeView !== 'details') {
				return false
			}
			this.sidecarSweepOpen = !this.sidecarSweepOpen
			return true
		},
		onSidecarSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onSidecarCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		onSidecarDeleteCompleted(payload) {
			this.onBatchDeleteCompleted(payload)
		},
		toggleRuleProfiles() {
			if (this.activeView !== 'details') {
				return false
			}
			this.ruleProfilesOpen = !this.ruleProfilesOpen
			return true
		},
		onRuleProfilesSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onRuleProfilesCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		onRuleProfilesDeleteCompleted(payload) {
			this.onBatchDeleteCompleted(payload)
		},
		toggleDocumentLineage() {
			if (this.activeView !== 'details') {
				return false
			}
			this.documentLineageOpen = !this.documentLineageOpen
			return true
		},
		onDocumentLineageSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onDocumentLineageCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		onDocumentLineageDeleteCompleted(payload) {
			this.onBatchDeleteCompleted(payload)
		},
		togglePhotoPerceptual() {
			if (this.activeView !== 'details') {
				return false
			}
			this.photoPerceptualOpen = !this.photoPerceptualOpen
			return true
		},
		onPhotoPerceptualSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onPhotoPerceptualCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		onPhotoPerceptualDeleteCompleted(payload) {
			this.onBatchDeleteCompleted(payload)
		},
		toggleBrokenQuarantine() {
			if (this.activeView !== 'details') {
				return false
			}
			this.brokenQuarantineOpen = !this.brokenQuarantineOpen
			return true
		},
		onBrokenQuarantineSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onBrokenQuarantineCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		onBrokenQuarantineDeleteCompleted(payload) {
			this.onBatchDeleteCompleted(payload)
		},
		toggleRetentionPruner() {
			if (this.activeView !== 'details') {
				return false
			}
			this.retentionPrunerOpen = !this.retentionPrunerOpen
			return true
		},
		onRetentionSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onRetentionCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		onRetentionDeleteCompleted(payload) {
			this.onBatchDeleteCompleted(payload)
		},
		toggleFilenameCollisions() {
			if (this.activeView !== 'details') {
				return false
			}
			this.filenameCollisionsOpen = !this.filenameCollisionsOpen
			return true
		},
		onFilenameCollisionSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onFilenameCollisionCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		onFilenameCollisionDeleteCompleted(payload) {
			this.onBatchDeleteCompleted(payload)
		},
		toggleQuotaAttribution() {
			if (this.activeView !== 'details') {
				return false
			}
			this.quotaAttributionOpen = !this.quotaAttributionOpen
			return true
		},
		onQuotaSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onQuotaCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		onQuotaDeleteCompleted(payload) {
			this.onBatchDeleteCompleted(payload)
		},
		togglePreviewCache() {
			if (this.activeView !== 'details') {
				return false
			}
			this.previewCacheOpen = !this.previewCacheOpen
			return true
		},
		onPreviewCacheSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onPreviewCacheCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		onPreviewCacheDeleteCompleted(payload) {
			this.onBatchDeleteCompleted(payload)
		},
		toggleShareMountAuditor() {
			if (this.activeView !== 'details') {
				return false
			}
			this.shareMountAuditorOpen = !this.shareMountAuditorOpen
			return true
		},
		onShareMountSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onShareMountCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		onShareMountDeleteCompleted(payload) {
			this.onBatchDeleteCompleted(payload)
		},
		toggleBackupDrift() {
			if (this.activeView !== 'details') {
				return false
			}
			this.backupDriftOpen = !this.backupDriftOpen
			return true
		},
		onBackupDriftSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onBackupDriftCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		onBackupDriftDeleteCompleted(payload) {
			this.onBatchDeleteCompleted(payload)
		},
		toggleAutomationRulebook() {
			if (this.activeView !== 'details') {
				return false
			}
			this.automationRulebookOpen = !this.automationRulebookOpen
			return true
		},
		onAutomationRulebookSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onAutomationRulebookCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		onAutomationRulebookDeleteCompleted(payload) {
			this.onBatchDeleteCompleted(payload)
		},
		toggleMetadataConsolidation() {
			if (this.activeView !== 'details') {
				return false
			}
			this.metadataConsolidationOpen = !this.metadataConsolidationOpen
			return true
		},
		onMetadataConsolidationSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onMetadataConsolidationCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		onMetadataConsolidationDeleteCompleted(payload) {
			this.onBatchDeleteCompleted(payload)
		},
		toggleForensicVerifier() {
			if (this.activeView !== 'details') {
				return false
			}
			this.forensicVerifierOpen = !this.forensicVerifierOpen
			return true
		},
		onForensicSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onForensicCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		onForensicDeleteCompleted(payload) {
			this.onBatchDeleteCompleted(payload)
		},
		toggleInodeVerifier() {
			if (this.activeView !== 'details') {
				return false
			}
			this.inodeVerifierOpen = !this.inodeVerifierOpen
			return true
		},
		onInodeSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onInodeCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		onInodeDeleteCompleted(payload) {
			this.onBatchDeleteCompleted(payload)
		},
		toggleShadowReclaim() {
			if (this.activeView !== 'details') {
				return false
			}
			this.shadowReclaimOpen = !this.shadowReclaimOpen
			return true
		},
		onShadowSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onShadowCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		onShadowDeleteCompleted(payload) {
			this.onBatchDeleteCompleted(payload)
		},
		toggleJunkPairInspector() {
			if (this.activeView !== 'details') {
				return false
			}
			this.junkPairInspectorOpen = !this.junkPairInspectorOpen
			return true
		},
		onJunkPairSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onJunkPairCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		onJunkPairDeleteCompleted(payload) {
			this.onBatchDeleteCompleted(payload)
		},
		toggleMediaFidelityRanker() {
			if (this.activeView !== 'details') {
				return false
			}
			this.mediaFidelityOpen = !this.mediaFidelityOpen
			return true
		},
		onMediaFidelitySelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onMediaFidelityCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		onMediaFidelityDeleteCompleted(payload) {
			this.onBatchDeleteCompleted(payload)
		},
		toggleCdcChunkingEstimator() {
			if (this.activeView !== 'details') {
				return false
			}
			this.cdcChunkingOpen = !this.cdcChunkingOpen
			return true
		},
		onCdcChunkingSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onCdcChunkingCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleOpsScheduleGenerator() {
			if (this.activeView !== 'details') {
				return false
			}
			this.opsScheduleOpen = !this.opsScheduleOpen
			return true
		},
		onOpsScheduleSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onOpsScheduleCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleLegalHoldGuard() {
			if (this.activeView !== 'details') {
				return false
			}
			this.legalHoldOpen = !this.legalHoldOpen
			return true
		},
		onLegalHoldSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onLegalHoldCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleRansomwareCanaryGuard() {
			if (this.activeView !== 'details') {
				return false
			}
			this.ransomwareCanaryOpen = !this.ransomwareCanaryOpen
			return true
		},
		onRansomwareCanarySelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onRansomwareCanaryCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleDevTreeReclaimer() {
			if (this.activeView !== 'details') {
				return false
			}
			this.devTreeReclaimerOpen = !this.devTreeReclaimerOpen
			return true
		},
		onDevTreeSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onDevTreeCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleConflictStormResolver() {
			if (this.activeView !== 'details') {
				return false
			}
			this.conflictStormOpen = !this.conflictStormOpen
			return true
		},
		onConflictStormSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onConflictStormCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleVmCowReflinkAuditor() {
			if (this.activeView !== 'details') {
				return false
			}
			this.vmCowReflinkOpen = !this.vmCowReflinkOpen
			return true
		},
		onVmCowSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onVmCowCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleScientificBundleAuditor() {
			if (this.activeView !== 'details') {
				return false
			}
			this.scientificBundleOpen = !this.scientificBundleOpen
			return true
		},
		onScientificBundleSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onScientificBundleCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleBrandKitAuditor() {
			if (this.activeView !== 'details') {
				return false
			}
			this.brandKitAuditorOpen = !this.brandKitAuditorOpen
			return true
		},
		onBrandKitSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onBrandKitCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleLogTelemetry() {
			if (this.activeView !== 'details') {
				return false
			}
			this.logTelemetryOpen = !this.logTelemetryOpen
			return true
		},
		onLogTelemetrySelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onLogTelemetryCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleInstallerRepo() {
			if (this.activeView !== 'details') {
				return false
			}
			this.installerRepoOpen = !this.installerRepoOpen
			return true
		},
		onInstallerRepoSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onInstallerRepoCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleWorkbookDrift() {
			if (this.activeView !== 'details') {
				return false
			}
			this.workbookDriftOpen = !this.workbookDriftOpen
			return true
		},
		onWorkbookDriftSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onWorkbookDriftCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleMailboxArchive() {
			if (this.activeView !== 'details') {
				return false
			}
			this.mailboxArchiveOpen = !this.mailboxArchiveOpen
			return true
		},
		onMailboxArchiveSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onMailboxArchiveCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleCadVault() {
			if (this.activeView !== 'details') {
				return false
			}
			this.cadVaultOpen = !this.cadVaultOpen
			return true
		},
		onCadVaultSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onCadVaultCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleWebBuildMedia() {
			if (this.activeView !== 'details') {
				return false
			}
			this.webBuildMediaOpen = !this.webBuildMediaOpen
			return true
		},
		onWebBuildMediaSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onWebBuildMediaCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleLegalDocumentOcr() {
			if (this.activeView !== 'details') {
				return false
			}
			this.legalDocumentOcrOpen = !this.legalDocumentOcrOpen
			return true
		},
		onLegalDocumentOcrSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onLegalDocumentOcrCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleBackupTakeout() {
			if (this.activeView !== 'details') {
				return false
			}
			this.backupTakeoutOpen = !this.backupTakeoutOpen
			return true
		},
		onBackupTakeoutSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onBackupTakeoutCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleDawAudio() {
			if (this.activeView !== 'details') {
				return false
			}
			this.dawAudioOpen = !this.dawAudioOpen
			return true
		},
		onDawAudioSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onDawAudioCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleVfxRenderCache() {
			if (this.activeView !== 'details') {
				return false
			}
			this.vfxRenderCacheOpen = !this.vfxRenderCacheOpen
			return true
		},
		onVfxRenderCacheSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onVfxRenderCacheCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleElearningScorm() {
			if (this.activeView !== 'details') {
				return false
			}
			this.elearningScormOpen = !this.elearningScormOpen
			return true
		},
		onElearningScormSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onElearningScormCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		togglePhotoRawCatalog() {
			if (this.activeView !== 'details') {
				return false
			}
			this.photoRawCatalogOpen = !this.photoRawCatalogOpen
			return true
		},
		onPhotoRawCatalogSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onPhotoRawCatalogCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleVmContainerImage() {
			if (this.activeView !== 'details') {
				return false
			}
			this.vmContainerImageOpen = !this.vmContainerImageOpen
			return true
		},
		onVmContainerImageSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onVmContainerImageCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleMlDatasetArtifact() {
			if (this.activeView !== 'details') {
				return false
			}
			this.mlDatasetArtifactOpen = !this.mlDatasetArtifactOpen
			return true
		},
		onMlDatasetArtifactSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onMlDatasetArtifactCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleGame3dAssetVault() {
			if (this.activeView !== 'details') {
				return false
			}
			this.game3dAssetVaultOpen = !this.game3dAssetVaultOpen
			return true
		},
		onGame3dAssetVaultSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onGame3dAssetVaultCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleDatabaseDumpLog() {
			if (this.activeView !== 'details') {
				return false
			}
			this.databaseDumpLogOpen = !this.databaseDumpLogOpen
			return true
		},
		onDatabaseDumpLogSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onDatabaseDumpLogCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleDesignPublishingVault() {
			if (this.activeView !== 'details') {
				return false
			}
			this.designPublishingVaultOpen = !this.designPublishingVaultOpen
			return true
		},
		onDesignPublishingVaultSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onDesignPublishingVaultCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleReleaseBinaryArtifact() {
			if (this.activeView !== 'details') {
				return false
			}
			this.releaseBinaryArtifactOpen = !this.releaseBinaryArtifactOpen
			return true
		},
		onReleaseBinaryArtifactSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onReleaseBinaryArtifactCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleEmailArchiveVault() {
			if (this.activeView !== 'details') {
				return false
			}
			this.emailArchiveVaultOpen = !this.emailArchiveVaultOpen
			return true
		},
		onEmailArchiveVaultSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onEmailArchiveVaultCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleAudioDawVault() {
			if (this.activeView !== 'details') {
				return false
			}
			this.audioDawVaultOpen = !this.audioDawVaultOpen
			return true
		},
		onAudioDawVaultSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onAudioDawVaultCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleGisMapArchive() {
			if (this.activeView !== 'details') {
				return false
			}
			this.gisMapArchiveOpen = !this.gisMapArchiveOpen
			return true
		},
		onGisMapArchiveSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onGisMapArchiveCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleScientificResearchVault() {
			if (this.activeView !== 'details') {
				return false
			}
			this.scientificResearchVaultOpen = !this.scientificResearchVaultOpen
			return true
		},
		onScientificResearchVaultSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onScientificResearchVaultCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleLegalContractVault() {
			if (this.activeView !== 'details') {
				return false
			}
			this.legalContractVaultOpen = !this.legalContractVaultOpen
			return true
		},
		onLegalContractVaultSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onLegalContractVaultCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleMedicalDicomVault() {
			if (this.activeView !== 'details') {
				return false
			}
			this.medicalDicomVaultOpen = !this.medicalDicomVaultOpen
			return true
		},
		onMedicalDicomVaultSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onMedicalDicomVaultCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleAdditiveMfgVault() {
			if (this.activeView !== 'details') {
				return false
			}
			this.additiveMfgVaultOpen = !this.additiveMfgVaultOpen
			return true
		},
		onAdditiveMfgVaultSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onAdditiveMfgVaultCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleGameDevPipelineVault() {
			if (this.activeView !== 'details') {
				return false
			}
			this.gameDevPipelineVaultOpen = !this.gameDevPipelineVaultOpen
			return true
		},
		onGameDevPipelineVaultSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onGameDevPipelineVaultCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		togglePhotoGradingVault() {
			if (this.activeView !== 'details') {
				return false
			}
			this.photoGradingVaultOpen = !this.photoGradingVaultOpen
			return true
		},
		onPhotoGradingVaultSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onPhotoGradingVaultCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleMlCheckpointVault() {
			if (this.activeView !== 'details') {
				return false
			}
			this.mlCheckpointVaultOpen = !this.mlCheckpointVaultOpen
			return true
		},
		onMlCheckpointVaultSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onMlCheckpointVaultCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleVmBackupVault() {
			if (this.activeView !== 'details') {
				return false
			}
			this.vmBackupVaultOpen = !this.vmBackupVaultOpen
			return true
		},
		onVmBackupVaultSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onVmBackupVaultCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleDbSqlLogVault() {
			if (this.activeView !== 'details') {
				return false
			}
			this.dbSqlLogVaultOpen = !this.dbSqlLogVaultOpen
			return true
		},
		onDbSqlLogVaultSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onDbSqlLogVaultCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleBroadcastNleVault() {
			if (this.activeView !== 'details') {
				return false
			}
			this.broadcastNleVaultOpen = !this.broadcastNleVaultOpen
			return true
		},
		onBroadcastNleVaultSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onBroadcastNleVaultCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleEcommercePimVault() {
			if (this.activeView !== 'details') {
				return false
			}
			this.ecommercePimVaultOpen = !this.ecommercePimVaultOpen
			return true
		},
		onEcommercePimVaultSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onEcommercePimVaultCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleFinanceTaxVault() {
			if (this.activeView !== 'details') {
				return false
			}
			this.financeTaxVaultOpen = !this.financeTaxVaultOpen
			return true
		},
		onFinanceTaxVaultSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onFinanceTaxVaultCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleIotFirmwareVault() {
			if (this.activeView !== 'details') {
				return false
			}
			this.iotFirmwareVaultOpen = !this.iotFirmwareVaultOpen
			return true
		},
		onIotFirmwareVaultSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onIotFirmwareVaultCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleMobileBuildVault() {
			if (this.activeView !== 'details') {
				return false
			}
			this.mobileBuildVaultOpen = !this.mobileBuildVaultOpen
			return true
		},
		onMobileBuildVaultSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onMobileBuildVaultCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleK8sTerraformVault() {
			if (this.activeView !== 'details') {
				return false
			}
			this.k8sTerraformVaultOpen = !this.k8sTerraformVaultOpen
			return true
		},
		onK8sTerraformVaultSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onK8sTerraformVaultCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		togglePublishingPrepressVault() {
			if (this.activeView !== 'details') {
				return false
			}
			this.publishingPrepressVaultOpen = !this.publishingPrepressVaultOpen
			return true
		},
		onPublishingPrepressVaultSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onPublishingPrepressVaultCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleGenomicsBioinformaticsVault() {
			if (this.activeView !== 'details') {
				return false
			}
			this.genomicsBioinformaticsVaultOpen = !this.genomicsBioinformaticsVaultOpen
			return true
		},
		onGenomicsBioinformaticsVaultSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onGenomicsBioinformaticsVaultCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleDfirSecurityVault() {
			if (this.activeView !== 'details') {
				return false
			}
			this.dfirSecurityVaultOpen = !this.dfirSecurityVaultOpen
			return true
		},
		onDfirSecurityVaultSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onDfirSecurityVaultCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleRoboticsRosVault() {
			if (this.activeView !== 'details') {
				return false
			}
			this.roboticsRosVaultOpen = !this.roboticsRosVaultOpen
			return true
		},
		onRoboticsRosVaultSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onRoboticsRosVaultCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleSemiconductorEdaVault() {
			if (this.activeView !== 'details') {
				return false
			}
			this.semiconductorEdaVaultOpen = !this.semiconductorEdaVaultOpen
			return true
		},
		onSemiconductorEdaVaultSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onSemiconductorEdaVaultCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleAerospaceCfdVault() {
			if (this.activeView !== 'details') {
				return false
			}
			this.aerospaceCfdVaultOpen = !this.aerospaceCfdVaultOpen
			return true
		},
		onAerospaceCfdVaultSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onAerospaceCfdVaultCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleBatteryBmsVault() {
			if (this.activeView !== 'details') {
				return false
			}
			this.batteryBmsVaultOpen = !this.batteryBmsVaultOpen
			return true
		},
		onBatteryBmsVaultSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onBatteryBmsVaultCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleChemPharmaGmpVault() {
			if (this.activeView !== 'details') {
				return false
			}
			this.chemPharmaGmpVaultOpen = !this.chemPharmaGmpVaultOpen
			return true
		},
		onChemPharmaGmpVaultSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onChemPharmaGmpVaultCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleDigitalGridScadaVault() {
			if (this.activeView !== 'details') {
				return false
			}
			this.digitalGridScadaVaultOpen = !this.digitalGridScadaVaultOpen
			return true
		},
		onDigitalGridScadaVaultSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onDigitalGridScadaVaultCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleEnergySeismicVault() {
			if (this.activeView !== 'details') {
				return false
			}
			this.energySeismicVaultOpen = !this.energySeismicVaultOpen
			return true
		},
		onEnergySeismicVaultSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onEnergySeismicVaultCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleFiberTelecomRfVault() {
			if (this.activeView !== 'details') {
				return false
			}
			this.fiberTelecomRfVaultOpen = !this.fiberTelecomRfVaultOpen
			return true
		},
		onFiberTelecomRfVaultSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onFiberTelecomRfVaultCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleGeotechShmCivilVault() {
			if (this.activeView !== 'details') {
				return false
			}
			this.geotechShmCivilVaultOpen = !this.geotechShmCivilVaultOpen
			return true
		},
		onGeotechShmCivilVaultSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onGeotechShmCivilVaultCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleHydrographyMarineVault() {
			if (this.activeView !== 'details') {
				return false
			}
			this.hydrographyMarineVaultOpen = !this.hydrographyMarineVaultOpen
			return true
		},
		onHydrographyMarineVaultSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onHydrographyMarineVaultCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleAstronomyFitsInterferometryVault() {
			if (this.activeView !== 'details') {
				return false
			}
			this.astronomyFitsInterferometryVaultOpen = !this.astronomyFitsInterferometryVaultOpen
			return true
		},
		onAstronomyFitsInterferometryVaultSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onAstronomyFitsInterferometryVaultCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleMeteorologyClimateVault() {
			if (this.activeView !== 'details') {
				return false
			}
			this.meteorologyClimateVaultOpen = !this.meteorologyClimateVaultOpen
			return true
		},
		onMeteorologyClimateVaultSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onMeteorologyClimateVaultCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleMaterialsMicroscopyVault() {
			if (this.activeView !== 'details') {
				return false
			}
			this.materialsMicroscopyVaultOpen = !this.materialsMicroscopyVaultOpen
			return true
		},
		onMaterialsMicroscopyVaultSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onMaterialsMicroscopyVaultCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleLidarPhotogrammetryVault() {
			if (this.activeView !== 'details') {
				return false
			}
			this.lidarPhotogrammetryVaultOpen = !this.lidarPhotogrammetryVaultOpen
			return true
		},
		onLidarPhotogrammetryVaultSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onLidarPhotogrammetryVaultCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleMocapBiomechanicsVault() {
			if (this.activeView !== 'details') {
				return false
			}
			this.mocapBiomechanicsVaultOpen = !this.mocapBiomechanicsVaultOpen
			return true
		},
		onMocapBiomechanicsVaultSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onMocapBiomechanicsVaultCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleNeuroscienceElectrophysVault() {
			if (this.activeView !== 'details') {
				return false
			}
			this.neuroscienceElectrophysVaultOpen = !this.neuroscienceElectrophysVaultOpen
			return true
		},
		onNeuroscienceElectrophysVaultSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onNeuroscienceElectrophysVaultCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleOrbitalSpacecraftVault() {
			if (this.activeView !== 'details') {
				return false
			}
			this.orbitalSpacecraftVaultOpen = !this.orbitalSpacecraftVaultOpen
			return true
		},
		onOrbitalSpacecraftVaultSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onOrbitalSpacecraftVaultCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleParticlePhysicsHepVault() {
			if (this.activeView !== 'details') {
				return false
			}
			this.particlePhysicsHepVaultOpen = !this.particlePhysicsHepVaultOpen
			return true
		},
		onParticlePhysicsHepVaultSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onParticlePhysicsHepVaultCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleQuantumQubitPulseVault() {
			if (this.activeView !== 'details') {
				return false
			}
			this.quantumQubitPulseVaultOpen = !this.quantumQubitPulseVaultOpen
			return true
		},
		onQuantumQubitPulseVaultSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onQuantumQubitPulseVaultCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleRailwaySignalingTelemetryVault() {
			if (this.activeView !== 'details') {
				return false
			}
			this.railwaySignalingTelemetryVaultOpen = !this.railwaySignalingTelemetryVaultOpen
			return true
		},
		onRailwaySignalingTelemetryVaultSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onRailwaySignalingTelemetryVaultCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		toggleSpeechAsrBioacousticsVault() {
			if (this.activeView !== 'details') {
				return false
			}
			this.speechAsrBioacousticsVaultOpen = !this.speechAsrBioacousticsVaultOpen
			return true
		},
		onSpeechAsrBioacousticsVaultSelectDuplicate(duplicate) {
			if (!duplicate) {
				return
			}
			this.onTreemapSelectDuplicate(duplicate)
		},
		onSpeechAsrBioacousticsVaultCompareDuplicate(duplicate) {
			this.onSimilarityCompareDuplicate(duplicate)
		},
		onUpdateIgnoredEmptyFolders(list) {
			this.ignoredEmptyFolders = Array.isArray(list) ? [...list] : []
			saveUiPreferences({ ignoredEmptyFolders: this.ignoredEmptyFolders })
		},
		onEmptyFoldersDeletedFromWorkbench({ deleted = [] } = {}) {
			if (!Array.isArray(deleted) || deleted.length === 0) {
				return
			}
			const deletedSet = new Set(deleted)
			this.modalEmptyFolders = this.modalEmptyFolders.filter(folder => !deletedSet.has(folder.path))
			this.selectedModalEmptyFolders = this.selectedModalEmptyFolders.filter(path => !deletedSet.has(path))
			if (this.modalEmptyFolders.length === 0) {
				this.recentCleanedPaths = []
			}
		},
		onBatchDeleteCompleted({
			deletedFiles = [],
			deletedNodeIds = [],
			bytesReclaimed = 0,
			groupsResolved = 0,
			sampleLabel = '',
		} = {}) {
			if (!Array.isArray(deletedFiles) || deletedFiles.length === 0) {
				return
			}
			this.recordTouchedFolders(deletedFiles.map(file => file && file.path).filter(Boolean))
			const deletedKeySet = new Set(
				deletedFiles.map(file => (file && file.id !== undefined && file.id !== null && file.id !== ''
					? `id:${file.id}`
					: `path:${file && file.path ? file.path : ''}`))
			)
			const deletedNodeSet = new Set(
				(Array.isArray(deletedNodeIds) ? deletedNodeIds : []).map(Number).filter(Number.isFinite)
			)
			const isDeletedFile = file => {
				if (!file || typeof file !== 'object') {
					return false
				}
				if (file.nodeId !== undefined && file.nodeId !== null && deletedNodeSet.has(Number(file.nodeId))) {
					return true
				}
				const key = file.id !== undefined && file.id !== null && file.id !== ''
					? `id:${file.id}`
					: `path:${file.path || ''}`
				return deletedKeySet.has(key)
			}

			const pruneList = list => {
				const next = []
				let resolvedCount = 0
				for (const group of Array.isArray(list) ? list : []) {
					const remainingFiles = (Array.isArray(group.files) ? group.files : []).filter(file => !isDeletedFile(file))
					if (remainingFiles.length <= 1) {
						resolvedCount += 1
						continue
					}
					next.push({
						...group,
						files: remainingFiles,
					})
				}
				return { next, resolvedCount }
			}

			const unackResult = pruneList(this.unacknowledgedDuplicates)
			const ackResult = pruneList(this.acknowledgedDuplicates)
			this.unacknowledgedDuplicates = unackResult.next
			this.acknowledgedDuplicates = ackResult.next
			if (unackResult.resolvedCount > 0) {
				this.adjustSectionPagination('unacknowledged', -unackResult.resolvedCount)
			}
			if (ackResult.resolvedCount > 0) {
				this.adjustSectionPagination('acknowledged', -ackResult.resolvedCount)
			}

			const actualResolved = unackResult.resolvedCount + ackResult.resolvedCount
			this.onReclamationRecorded({
				bytesReclaimed,
				filesDeleted: deletedFiles.length,
				groupsResolved: actualResolved > 0 ? actualResolved : groupsResolved,
				source: 'bulk',
				sampleLabel,
			})

			if (this.currentDuplicate) {
				const stillExists = [...this.unacknowledgedDuplicates, ...this.acknowledgedDuplicates]
					.find(group => group.id === this.currentDuplicate.id)
				this.currentDuplicate = stillExists
					|| this.unacknowledgedDuplicates[0]
					|| this.acknowledgedDuplicates[0]
					|| null
			}

			if (deletedNodeIds.length > deletedFiles.length) {
				this.refreshDuplicates({ silent: true })
			}
		},
		onBatchAcknowledgeCompleted({ groups = [] } = {}) {
			if (!Array.isArray(groups) || groups.length === 0) {
				return
			}
			const hashSet = new Set(groups.map(group => group && group.hash).filter(Boolean))
			const moved = []
			const remainingUnack = []
			for (const group of this.unacknowledgedDuplicates) {
				if (group && hashSet.has(group.hash)) {
					moved.push({ ...group, acknowledged: true })
				} else {
					remainingUnack.push(group)
				}
			}
			if (moved.length === 0) {
				return
			}
			this.unacknowledgedDuplicates = remainingUnack
			this.acknowledgedDuplicates = [...this.acknowledgedDuplicates, ...moved]
			this.adjustSectionPagination('unacknowledged', -moved.length)
			this.adjustSectionPagination('acknowledged', moved.length)
			if (this.currentDuplicate && hashSet.has(this.currentDuplicate.hash)) {
				const updated = moved.find(item => item.hash === this.currentDuplicate.hash)
				if (updated) {
					this.currentDuplicate = updated
				}
			}
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

			if (action === 'toggle-batch-auto-select') {
				if (this.toggleBatchAutoSelect() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-file-hygiene') {
				if (this.toggleFileHygiene() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-link-simulator') {
				if (this.toggleLinkSimulator() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-folder-matrix') {
				if (this.toggleFolderMatrix() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-storage-footprint') {
				if (this.toggleFootprintAnalyzer() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-photo-bursts') {
				if (this.togglePhotoBursts() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-recovery-safety') {
				if (this.toggleRecoverySafety() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-archive-inspector') {
				if (this.toggleArchiveInspector() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-audio-workbench') {
				if (this.toggleAudioWorkbench() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-video-workbench') {
				if (this.toggleVideoWorkbench() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-sidecar-sweep') {
				if (this.toggleSidecarSweep() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-rule-profiles') {
				if (this.toggleRuleProfiles() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-document-lineage') {
				if (this.toggleDocumentLineage() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-photo-perceptual') {
				if (this.togglePhotoPerceptual() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-broken-quarantine') {
				if (this.toggleBrokenQuarantine() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-retention-pruner') {
				if (this.toggleRetentionPruner() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-filename-collisions') {
				if (this.toggleFilenameCollisions() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-quota-attribution') {
				if (this.toggleQuotaAttribution() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-preview-cache') {
				if (this.togglePreviewCache() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-share-mount-auditor') {
				if (this.toggleShareMountAuditor() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-backup-drift') {
				if (this.toggleBackupDrift() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-automation-rulebook') {
				if (this.toggleAutomationRulebook() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-metadata-consolidation') {
				if (this.toggleMetadataConsolidation() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-forensic-verifier') {
				if (this.toggleForensicVerifier() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-inode-verifier') {
				if (this.toggleInodeVerifier() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-shadow-reclaim') {
				if (this.toggleShadowReclaim() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-junk-pair-inspector') {
				if (this.toggleJunkPairInspector() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-media-fidelity-ranker') {
				if (this.toggleMediaFidelityRanker() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-cdc-chunking-estimator') {
				if (this.toggleCdcChunkingEstimator() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-ops-schedule-generator') {
				if (this.toggleOpsScheduleGenerator() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-legal-hold-guard') {
				if (this.toggleLegalHoldGuard() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-ransomware-canary-guard') {
				if (this.toggleRansomwareCanaryGuard() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-dev-tree-reclaimer') {
				if (this.toggleDevTreeReclaimer() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-conflict-storm-resolver') {
				if (this.toggleConflictStormResolver() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-vm-cow-reflink-auditor') {
				if (this.toggleVmCowReflinkAuditor() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-scientific-bundle-auditor') {
				if (this.toggleScientificBundleAuditor() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-brand-kit-auditor') {
				if (this.toggleBrandKitAuditor() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-log-telemetry-auditor') {
				if (this.toggleLogTelemetry() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-installer-repo-auditor') {
				if (this.toggleInstallerRepo() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-workbook-drift-auditor') {
				if (this.toggleWorkbookDrift() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-mailbox-archive-auditor') {
				if (this.toggleMailboxArchive() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-cad-vault-auditor') {
				if (this.toggleCadVault() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-web-build-media-auditor') {
				if (this.toggleWebBuildMedia() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-legal-document-ocr-auditor') {
				if (this.toggleLegalDocumentOcr() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-backup-takeout-auditor') {
				if (this.toggleBackupTakeout() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-daw-audio-stem-auditor') {
				if (this.toggleDawAudio() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-vfx-render-cache-auditor') {
				if (this.toggleVfxRenderCache() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-elearning-scorm-auditor') {
				if (this.toggleElearningScorm() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-photo-raw-catalog-auditor') {
				if (this.togglePhotoRawCatalog() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-vm-container-image-auditor') {
				if (this.toggleVmContainerImage() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-ml-dataset-artifact-auditor') {
				if (this.toggleMlDatasetArtifact() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-game3d-asset-vault-auditor') {
				if (this.toggleGame3dAssetVault() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-database-dump-log-auditor') {
				if (this.toggleDatabaseDumpLog() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-design-publishing-vault-auditor') {
				if (this.toggleDesignPublishingVault() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-release-binary-artifact-auditor') {
				if (this.toggleReleaseBinaryArtifact() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-email-archive-vault-auditor') {
				if (this.toggleEmailArchiveVault() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-audio-daw-vault-auditor') {
				if (this.toggleAudioDawVault() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-gis-map-archive-auditor') {
				if (this.toggleGisMapArchive() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-scientific-research-vault-auditor') {
				if (this.toggleScientificResearchVault() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-legal-contract-vault-auditor') {
				if (this.toggleLegalContractVault() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-medical-dicom-vault-auditor') {
				if (this.toggleMedicalDicomVault() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-additive-mfg-vault-auditor') {
				if (this.toggleAdditiveMfgVault() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-game-dev-pipeline-vault-auditor') {
				if (this.toggleGameDevPipelineVault() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-photo-grading-vault-auditor') {
				if (this.togglePhotoGradingVault() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-ml-checkpoint-vault-auditor') {
				if (this.toggleMlCheckpointVault() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-vm-backup-vault-auditor') {
				if (this.toggleVmBackupVault() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-db-sql-log-vault-auditor') {
				if (this.toggleDbSqlLogVault() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-broadcast-nle-vault-auditor') {
				if (this.toggleBroadcastNleVault() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-ecommerce-pim-vault-auditor') {
				if (this.toggleEcommercePimVault() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-finance-tax-vault-auditor') {
				if (this.toggleFinanceTaxVault() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-iot-firmware-vault-auditor') {
				if (this.toggleIotFirmwareVault() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-mobile-build-vault-auditor') {
				if (this.toggleMobileBuildVault() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-k8s-terraform-vault-auditor') {
				if (this.toggleK8sTerraformVault() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-publishing-prepress-vault-auditor') {
				if (this.togglePublishingPrepressVault() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-genomics-bioinformatics-vault-auditor') {
				if (this.toggleGenomicsBioinformaticsVault() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-dfir-security-vault-auditor') {
				if (this.toggleDfirSecurityVault() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-robotics-ros-vault-auditor') {
				if (this.toggleRoboticsRosVault() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-semiconductor-eda-vault-auditor') {
				if (this.toggleSemiconductorEdaVault() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-aerospace-cfd-vault-auditor') {
				if (this.toggleAerospaceCfdVault() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-battery-bms-vault-auditor') {
				if (this.toggleBatteryBmsVault() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-chem-pharma-gmp-vault-auditor') {
				if (this.toggleChemPharmaGmpVault() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-digital-grid-scada-vault-auditor') {
				if (this.toggleDigitalGridScadaVault() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-energy-seismic-vault-auditor') {
				if (this.toggleEnergySeismicVault() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-fiber-telecom-rf-vault-auditor') {
				if (this.toggleFiberTelecomRfVault() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-geotech-shm-civil-vault-auditor') {
				if (this.toggleGeotechShmCivilVault() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-hydrography-marine-vault-auditor') {
				if (this.toggleHydrographyMarineVault() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-astronomy-fits-interferometry-vault-auditor') {
				if (this.toggleAstronomyFitsInterferometryVault() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-meteorology-climate-vault-auditor') {
				if (this.toggleMeteorologyClimateVault() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-materials-microscopy-vault-auditor') {
				if (this.toggleMaterialsMicroscopyVault() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-lidar-photogrammetry-vault-auditor') {
				if (this.toggleLidarPhotogrammetryVault() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-mocap-biomechanics-vault-auditor') {
				if (this.toggleMocapBiomechanicsVault() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-neuroscience-electrophys-vault-auditor') {
				if (this.toggleNeuroscienceElectrophysVault() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-orbital-spacecraft-vault-auditor') {
				if (this.toggleOrbitalSpacecraftVault() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-particle-physics-hep-vault-auditor') {
				if (this.toggleParticlePhysicsHepVault() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-quantum-qubit-pulse-vault-auditor') {
				if (this.toggleQuantumQubitPulseVault() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-railway-signaling-telemetry-vault-auditor') {
				if (this.toggleRailwaySignalingTelemetryVault() && typeof event.preventDefault === 'function') {
					event.preventDefault()
				}
				return
			}

			if (action === 'toggle-speech-asr-bioacoustics-vault-auditor') {
				if (this.toggleSpeechAsrBioacousticsVault() && typeof event.preventDefault === 'function') {
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
.app-content-topbar .topbar-similarity-button,
.app-content-topbar .topbar-batch-rules-button,
.app-content-topbar .topbar-hygiene-button,
.app-content-topbar .topbar-link-simulator-button,
.app-content-topbar .topbar-folder-matrix-button,
.app-content-topbar .topbar-footprint-button,
.app-content-topbar .topbar-photo-bursts-button,
.app-content-topbar .topbar-recovery-safety-button,
.app-content-topbar .topbar-archive-inspector-button,
.app-content-topbar .topbar-audio-workbench-button,
.app-content-topbar .topbar-video-workbench-button,
.app-content-topbar .topbar-sidecar-sweep-button,
.app-content-topbar .topbar-rule-profiles-button,
.app-content-topbar .topbar-document-lineage-button,
.app-content-topbar .topbar-photo-perceptual-button,
.app-content-topbar .topbar-broken-quarantine-button,
.app-content-topbar .topbar-retention-pruner-button,
.app-content-topbar .topbar-filename-collisions-button,
.app-content-topbar .topbar-quota-attribution-button,
.app-content-topbar .topbar-preview-cache-button,
.app-content-topbar .topbar-share-mount-button,
.app-content-topbar .topbar-backup-drift-button,
.app-content-topbar .topbar-automation-rulebook-button,
.app-content-topbar .topbar-metadata-consolidation-button,
.app-content-topbar .topbar-forensic-verifier-button,
.app-content-topbar .topbar-inode-verifier-button,
.app-content-topbar .topbar-shadow-reclaim-button,
.app-content-topbar .topbar-junk-pair-button,
.app-content-topbar .topbar-media-fidelity-button,
.app-content-topbar .topbar-cdc-chunking-button,
.app-content-topbar .topbar-ops-schedule-button,
.app-content-topbar .topbar-legal-hold-button,
.app-content-topbar .topbar-ransomware-canary-button,
.app-content-topbar .topbar-dev-tree-button,
.app-content-topbar .topbar-conflict-storm-button,
.app-content-topbar .topbar-vm-cow-button,
.app-content-topbar .topbar-scientific-bundle-button,
.app-content-topbar .topbar-brand-kit-button,
.app-content-topbar .topbar-log-telemetry-button,
.app-content-topbar .topbar-installer-repo-button,
.app-content-topbar .topbar-workbook-drift-button,
.app-content-topbar .topbar-mailbox-archive-button,
.app-content-topbar .topbar-cad-vault-button,
.app-content-topbar .topbar-web-build-media-button,
.app-content-topbar .topbar-legal-document-ocr-button,
.app-content-topbar .topbar-backup-takeout-button,
.app-content-topbar .topbar-daw-audio-button,
.app-content-topbar .topbar-vfx-render-cache-button,
.app-content-topbar .topbar-elearning-scorm-button,
.app-content-topbar .topbar-photo-raw-catalog-button,
.app-content-topbar .topbar-vm-container-image-button,
.app-content-topbar .topbar-ml-dataset-artifact-button,
.app-content-topbar .topbar-game3d-asset-vault-button,
.app-content-topbar .topbar-database-dump-log-button,
.app-content-topbar .topbar-design-publishing-vault-button,
.app-content-topbar .topbar-release-binary-artifact-button,
.app-content-topbar .topbar-email-archive-vault-button,
.app-content-topbar .topbar-audio-daw-vault-button,
.app-content-topbar .topbar-gis-map-archive-button,
.app-content-topbar .topbar-scientific-research-vault-button,
.app-content-topbar .topbar-legal-contract-vault-button,
.app-content-topbar .topbar-medical-dicom-vault-button,
.app-content-topbar .topbar-additive-mfg-vault-button,
.app-content-topbar .topbar-game-dev-pipeline-vault-button,
.app-content-topbar .topbar-photo-grading-vault-button,
.app-content-topbar .topbar-ml-checkpoint-vault-button,
.app-content-topbar .topbar-vm-backup-vault-button,
.app-content-topbar .topbar-db-sql-log-vault-button,
.app-content-topbar .topbar-broadcast-nle-vault-button,
.app-content-topbar .topbar-ecommerce-pim-vault-button,
.app-content-topbar .topbar-finance-tax-vault-button,
.app-content-topbar .topbar-iot-firmware-vault-button,
.app-content-topbar .topbar-mobile-build-vault-button,
.app-content-topbar .topbar-k8s-terraform-vault-button,
.app-content-topbar .topbar-publishing-prepress-vault-button,
.app-content-topbar .topbar-genomics-bioinformatics-vault-button,
.app-content-topbar .topbar-dfir-security-vault-button,
.app-content-topbar .topbar-robotics-ros-vault-button,
.app-content-topbar .topbar-semiconductor-eda-vault-button,
.app-content-topbar .topbar-aerospace-cfd-vault-button,
.app-content-topbar .topbar-battery-bms-vault-button,
.app-content-topbar .topbar-chem-pharma-gmp-vault-button,
.app-content-topbar .topbar-digital-grid-scada-vault-button,
.app-content-topbar .topbar-energy-seismic-vault-button,
.app-content-topbar .topbar-fiber-telecom-rf-vault-button,
.app-content-topbar .topbar-geotech-shm-civil-vault-button,
.app-content-topbar .topbar-hydrography-marine-vault-button,
.app-content-topbar .topbar-astronomy-fits-interferometry-vault-button,
.app-content-topbar .topbar-meteorology-climate-vault-button,
.app-content-topbar .topbar-materials-microscopy-vault-button,
.app-content-topbar .topbar-lidar-photogrammetry-vault-button,
.app-content-topbar .topbar-mocap-biomechanics-vault-button,
.app-content-topbar .topbar-neuroscience-electrophys-vault-button,
.app-content-topbar .topbar-orbital-spacecraft-vault-button,
.app-content-topbar .topbar-particle-physics-hep-vault-button,
.app-content-topbar .topbar-quantum-qubit-pulse-vault-button,
.app-content-topbar .topbar-railway-signaling-telemetry-vault-button,
.app-content-topbar .topbar-speech-asr-bioacoustics-vault-button {
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

.app-content-topbar .topbar-ops-schedule-button,
.app-content-topbar .topbar-legal-hold-button,
.app-content-topbar .topbar-ransomware-canary-button,
.app-content-topbar .topbar-dev-tree-button,
.app-content-topbar .topbar-conflict-storm-button,
.app-content-topbar .topbar-vm-cow-button,
.app-content-topbar .topbar-scientific-bundle-button,
.app-content-topbar .topbar-brand-kit-button,
.app-content-topbar .topbar-log-telemetry-button,
.app-content-topbar .topbar-installer-repo-button,
.app-content-topbar .topbar-workbook-drift-button,
.app-content-topbar .topbar-mailbox-archive-button,
.app-content-topbar .topbar-cad-vault-button,
.app-content-topbar .topbar-web-build-media-button,
.app-content-topbar .topbar-legal-document-ocr-button,
.app-content-topbar .topbar-backup-takeout-button,
.app-content-topbar .topbar-daw-audio-button,
.app-content-topbar .topbar-vfx-render-cache-button,
.app-content-topbar .topbar-elearning-scorm-button,
.app-content-topbar .topbar-photo-raw-catalog-button,
.app-content-topbar .topbar-vm-container-image-button,
.app-content-topbar .topbar-ml-dataset-artifact-button,
.app-content-topbar .topbar-game3d-asset-vault-button,
.app-content-topbar .topbar-database-dump-log-button,
.app-content-topbar .topbar-design-publishing-vault-button,
.app-content-topbar .topbar-release-binary-artifact-button,
.app-content-topbar .topbar-email-archive-vault-button,
.app-content-topbar .topbar-audio-daw-vault-button,
.app-content-topbar .topbar-gis-map-archive-button,
.app-content-topbar .topbar-scientific-research-vault-button,
.app-content-topbar .topbar-legal-contract-vault-button,
.app-content-topbar .topbar-medical-dicom-vault-button,
.app-content-topbar .topbar-additive-mfg-vault-button,
.app-content-topbar .topbar-game-dev-pipeline-vault-button,
.app-content-topbar .topbar-photo-grading-vault-button,
.app-content-topbar .topbar-ml-checkpoint-vault-button,
.app-content-topbar .topbar-vm-backup-vault-button,
.app-content-topbar .topbar-db-sql-log-vault-button,
.app-content-topbar .topbar-broadcast-nle-vault-button,
.app-content-topbar .topbar-ecommerce-pim-vault-button,
.app-content-topbar .topbar-finance-tax-vault-button,
.app-content-topbar .topbar-iot-firmware-vault-button,
.app-content-topbar .topbar-mobile-build-vault-button,
.app-content-topbar .topbar-k8s-terraform-vault-button,
.app-content-topbar .topbar-publishing-prepress-vault-button,
.app-content-topbar .topbar-genomics-bioinformatics-vault-button,
.app-content-topbar .topbar-dfir-security-vault-button,
.app-content-topbar .topbar-robotics-ros-vault-button,
.app-content-topbar .topbar-semiconductor-eda-vault-button,
.app-content-topbar .topbar-aerospace-cfd-vault-button,
.app-content-topbar .topbar-battery-bms-vault-button,
.app-content-topbar .topbar-chem-pharma-gmp-vault-button,
.app-content-topbar .topbar-digital-grid-scada-vault-button,
.app-content-topbar .topbar-energy-seismic-vault-button,
.app-content-topbar .topbar-fiber-telecom-rf-vault-button,
.app-content-topbar .topbar-geotech-shm-civil-vault-button,
.app-content-topbar .topbar-hydrography-marine-vault-button,
.app-content-topbar .topbar-astronomy-fits-interferometry-vault-button,
.app-content-topbar .topbar-meteorology-climate-vault-button,
.app-content-topbar .topbar-materials-microscopy-vault-button,
.app-content-topbar .topbar-lidar-photogrammetry-vault-button,
.app-content-topbar .topbar-mocap-biomechanics-vault-button,
.app-content-topbar .topbar-neuroscience-electrophys-vault-button,
.app-content-topbar .topbar-orbital-spacecraft-vault-button,
.app-content-topbar .topbar-particle-physics-hep-vault-button,
.app-content-topbar .topbar-quantum-qubit-pulse-vault-button,
.app-content-topbar .topbar-railway-signaling-telemetry-vault-button,
.app-content-topbar .topbar-speech-asr-bioacoustics-vault-button {
	min-height: 44px;
	min-width: 44px;
}

.app-content-topbar .topbar-scan-button svg,
.app-content-topbar .topbar-empty-folders-button svg,
.app-content-topbar .topbar-treemap-button svg,
.app-content-topbar .topbar-history-button svg,
.app-content-topbar .topbar-similarity-button svg,
.app-content-topbar .topbar-batch-rules-button svg,
.app-content-topbar .topbar-hygiene-button svg,
.app-content-topbar .topbar-link-simulator-button svg,
.app-content-topbar .topbar-folder-matrix-button svg,
.app-content-topbar .topbar-footprint-button svg,
.app-content-topbar .topbar-photo-bursts-button svg,
.app-content-topbar .topbar-recovery-safety-button svg,
.app-content-topbar .topbar-archive-inspector-button svg,
.app-content-topbar .topbar-audio-workbench-button svg,
.app-content-topbar .topbar-video-workbench-button svg,
.app-content-topbar .topbar-sidecar-sweep-button svg,
.app-content-topbar .topbar-rule-profiles-button svg,
.app-content-topbar .topbar-document-lineage-button svg,
.app-content-topbar .topbar-photo-perceptual-button svg,
.app-content-topbar .topbar-broken-quarantine-button svg,
.app-content-topbar .topbar-retention-pruner-button svg,
.app-content-topbar .topbar-filename-collisions-button svg,
.app-content-topbar .topbar-quota-attribution-button svg,
.app-content-topbar .topbar-preview-cache-button svg,
.app-content-topbar .topbar-share-mount-button svg,
.app-content-topbar .topbar-backup-drift-button svg,
.app-content-topbar .topbar-automation-rulebook-button svg,
.app-content-topbar .topbar-metadata-consolidation-button svg,
.app-content-topbar .topbar-forensic-verifier-button svg,
.app-content-topbar .topbar-inode-verifier-button svg,
.app-content-topbar .topbar-shadow-reclaim-button svg,
.app-content-topbar .topbar-junk-pair-button svg,
.app-content-topbar .topbar-media-fidelity-button svg,
.app-content-topbar .topbar-cdc-chunking-button svg,
.app-content-topbar .topbar-ops-schedule-button svg,
.app-content-topbar .topbar-legal-hold-button svg,
.app-content-topbar .topbar-ransomware-canary-button svg,
.app-content-topbar .topbar-dev-tree-button svg,
.app-content-topbar .topbar-conflict-storm-button svg,
.app-content-topbar .topbar-vm-cow-button svg,
.app-content-topbar .topbar-scientific-bundle-button svg,
.app-content-topbar .topbar-brand-kit-button svg,
.app-content-topbar .topbar-log-telemetry-button svg,
.app-content-topbar .topbar-installer-repo-button svg,
.app-content-topbar .topbar-workbook-drift-button svg,
.app-content-topbar .topbar-mailbox-archive-button svg,
.app-content-topbar .topbar-cad-vault-button svg,
.app-content-topbar .topbar-web-build-media-button svg,
.app-content-topbar .topbar-legal-document-ocr-button svg,
.app-content-topbar .topbar-backup-takeout-button svg,
.app-content-topbar .topbar-daw-audio-button svg,
.app-content-topbar .topbar-vfx-render-cache-button svg,
.app-content-topbar .topbar-elearning-scorm-button svg,
.app-content-topbar .topbar-photo-raw-catalog-button svg,
.app-content-topbar .topbar-vm-container-image-button svg,
.app-content-topbar .topbar-ml-dataset-artifact-button svg,
.app-content-topbar .topbar-game3d-asset-vault-button svg,
.app-content-topbar .topbar-database-dump-log-button svg,
.app-content-topbar .topbar-design-publishing-vault-button svg,
.app-content-topbar .topbar-release-binary-artifact-button svg,
.app-content-topbar .topbar-email-archive-vault-button svg,
.app-content-topbar .topbar-audio-daw-vault-button svg,
.app-content-topbar .topbar-gis-map-archive-button svg,
.app-content-topbar .topbar-scientific-research-vault-button svg,
.app-content-topbar .topbar-legal-contract-vault-button svg,
.app-content-topbar .topbar-medical-dicom-vault-button svg,
.app-content-topbar .topbar-additive-mfg-vault-button svg,
.app-content-topbar .topbar-game-dev-pipeline-vault-button svg,
.app-content-topbar .topbar-photo-grading-vault-button svg,
.app-content-topbar .topbar-ml-checkpoint-vault-button svg,
.app-content-topbar .topbar-vm-backup-vault-button svg,
.app-content-topbar .topbar-db-sql-log-vault-button svg,
.app-content-topbar .topbar-broadcast-nle-vault-button svg,
.app-content-topbar .topbar-ecommerce-pim-vault-button svg,
.app-content-topbar .topbar-finance-tax-vault-button svg,
.app-content-topbar .topbar-iot-firmware-vault-button svg,
.app-content-topbar .topbar-mobile-build-vault-button svg,
.app-content-topbar .topbar-k8s-terraform-vault-button svg,
.app-content-topbar .topbar-publishing-prepress-vault-button svg,
.app-content-topbar .topbar-genomics-bioinformatics-vault-button svg,
.app-content-topbar .topbar-dfir-security-vault-button svg,
.app-content-topbar .topbar-robotics-ros-vault-button svg,
.app-content-topbar .topbar-semiconductor-eda-vault-button svg,
.app-content-topbar .topbar-aerospace-cfd-vault-button svg,
.app-content-topbar .topbar-battery-bms-vault-button svg,
.app-content-topbar .topbar-chem-pharma-gmp-vault-button svg,
.app-content-topbar .topbar-digital-grid-scada-vault-button svg,
.app-content-topbar .topbar-energy-seismic-vault-button svg,
.app-content-topbar .topbar-fiber-telecom-rf-vault-button svg,
.app-content-topbar .topbar-geotech-shm-civil-vault-button svg,
.app-content-topbar .topbar-hydrography-marine-vault-button svg,
.app-content-topbar .topbar-astronomy-fits-interferometry-vault-button svg,
.app-content-topbar .topbar-meteorology-climate-vault-button svg,
.app-content-topbar .topbar-materials-microscopy-vault-button svg,
.app-content-topbar .topbar-lidar-photogrammetry-vault-button svg,
.app-content-topbar .topbar-mocap-biomechanics-vault-button svg,
.app-content-topbar .topbar-neuroscience-electrophys-vault-button svg,
.app-content-topbar .topbar-orbital-spacecraft-vault-button svg,
.app-content-topbar .topbar-particle-physics-hep-vault-button svg,
.app-content-topbar .topbar-quantum-qubit-pulse-vault-button svg,
.app-content-topbar .topbar-railway-signaling-telemetry-vault-button svg,
.app-content-topbar .topbar-speech-asr-bioacoustics-vault-button svg {
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
.app-content-topbar .topbar-similarity-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-batch-rules-button:hover:not(:disabled),
.app-content-topbar .topbar-batch-rules-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-hygiene-button:hover:not(:disabled),
.app-content-topbar .topbar-hygiene-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-link-simulator-button:hover:not(:disabled),
.app-content-topbar .topbar-link-simulator-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-folder-matrix-button:hover:not(:disabled),
.app-content-topbar .topbar-folder-matrix-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-footprint-button:hover:not(:disabled),
.app-content-topbar .topbar-footprint-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-photo-bursts-button:hover:not(:disabled),
.app-content-topbar .topbar-photo-bursts-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-recovery-safety-button:hover:not(:disabled),
.app-content-topbar .topbar-recovery-safety-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-archive-inspector-button:hover:not(:disabled),
.app-content-topbar .topbar-archive-inspector-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-audio-workbench-button:hover:not(:disabled),
.app-content-topbar .topbar-audio-workbench-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-video-workbench-button:hover:not(:disabled),
.app-content-topbar .topbar-video-workbench-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-sidecar-sweep-button:hover:not(:disabled),
.app-content-topbar .topbar-sidecar-sweep-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-rule-profiles-button:hover:not(:disabled),
.app-content-topbar .topbar-rule-profiles-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-document-lineage-button:hover:not(:disabled),
.app-content-topbar .topbar-document-lineage-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-photo-perceptual-button:hover:not(:disabled),
.app-content-topbar .topbar-photo-perceptual-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-broken-quarantine-button:hover:not(:disabled),
.app-content-topbar .topbar-broken-quarantine-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-retention-pruner-button:hover:not(:disabled),
.app-content-topbar .topbar-retention-pruner-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-filename-collisions-button:hover:not(:disabled),
.app-content-topbar .topbar-filename-collisions-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-quota-attribution-button:hover:not(:disabled),
.app-content-topbar .topbar-quota-attribution-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-preview-cache-button:hover:not(:disabled),
.app-content-topbar .topbar-preview-cache-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-share-mount-button:hover:not(:disabled),
.app-content-topbar .topbar-share-mount-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-backup-drift-button:hover:not(:disabled),
.app-content-topbar .topbar-backup-drift-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-automation-rulebook-button:hover:not(:disabled),
.app-content-topbar .topbar-automation-rulebook-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-metadata-consolidation-button:hover:not(:disabled),
.app-content-topbar .topbar-metadata-consolidation-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-forensic-verifier-button:hover:not(:disabled),
.app-content-topbar .topbar-forensic-verifier-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-inode-verifier-button:hover:not(:disabled),
.app-content-topbar .topbar-inode-verifier-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-shadow-reclaim-button:hover:not(:disabled),
.app-content-topbar .topbar-shadow-reclaim-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-junk-pair-button:hover:not(:disabled),
.app-content-topbar .topbar-junk-pair-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-media-fidelity-button:hover:not(:disabled),
.app-content-topbar .topbar-media-fidelity-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-cdc-chunking-button:hover:not(:disabled),
.app-content-topbar .topbar-cdc-chunking-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-ops-schedule-button:hover:not(:disabled),
.app-content-topbar .topbar-ops-schedule-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-legal-hold-button:hover:not(:disabled),
.app-content-topbar .topbar-legal-hold-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-ransomware-canary-button:hover:not(:disabled),
.app-content-topbar .topbar-ransomware-canary-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-dev-tree-button:hover:not(:disabled),
.app-content-topbar .topbar-dev-tree-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-conflict-storm-button:hover:not(:disabled),
.app-content-topbar .topbar-conflict-storm-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-vm-cow-button:hover:not(:disabled),
.app-content-topbar .topbar-vm-cow-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-scientific-bundle-button:hover:not(:disabled),
.app-content-topbar .topbar-scientific-bundle-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-brand-kit-button:hover:not(:disabled),
.app-content-topbar .topbar-brand-kit-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-log-telemetry-button:hover:not(:disabled),
.app-content-topbar .topbar-log-telemetry-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-installer-repo-button:hover:not(:disabled),
.app-content-topbar .topbar-installer-repo-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-workbook-drift-button:hover:not(:disabled),
.app-content-topbar .topbar-workbook-drift-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-mailbox-archive-button:hover:not(:disabled),
.app-content-topbar .topbar-mailbox-archive-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-cad-vault-button:hover:not(:disabled),
.app-content-topbar .topbar-cad-vault-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-web-build-media-button:hover:not(:disabled),
.app-content-topbar .topbar-web-build-media-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-legal-document-ocr-button:hover:not(:disabled),
.app-content-topbar .topbar-legal-document-ocr-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-backup-takeout-button:hover:not(:disabled),
.app-content-topbar .topbar-backup-takeout-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-daw-audio-button:hover:not(:disabled),
.app-content-topbar .topbar-daw-audio-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-vfx-render-cache-button:hover:not(:disabled),
.app-content-topbar .topbar-vfx-render-cache-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-elearning-scorm-button:hover:not(:disabled),
.app-content-topbar .topbar-elearning-scorm-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-photo-raw-catalog-button:hover:not(:disabled),
.app-content-topbar .topbar-photo-raw-catalog-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-vm-container-image-button:hover:not(:disabled),
.app-content-topbar .topbar-vm-container-image-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-ml-dataset-artifact-button:hover:not(:disabled),
.app-content-topbar .topbar-ml-dataset-artifact-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-game3d-asset-vault-button:hover:not(:disabled),
.app-content-topbar .topbar-game3d-asset-vault-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-database-dump-log-button:hover:not(:disabled),
.app-content-topbar .topbar-database-dump-log-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-design-publishing-vault-button:hover:not(:disabled),
.app-content-topbar .topbar-design-publishing-vault-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-release-binary-artifact-button:hover:not(:disabled),
.app-content-topbar .topbar-release-binary-artifact-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-email-archive-vault-button:hover:not(:disabled),
.app-content-topbar .topbar-email-archive-vault-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-audio-daw-vault-button:hover:not(:disabled),
.app-content-topbar .topbar-audio-daw-vault-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-gis-map-archive-button:hover:not(:disabled),
.app-content-topbar .topbar-gis-map-archive-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-scientific-research-vault-button:hover:not(:disabled),
.app-content-topbar .topbar-scientific-research-vault-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-legal-contract-vault-button:hover:not(:disabled),
.app-content-topbar .topbar-legal-contract-vault-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-medical-dicom-vault-button:hover:not(:disabled),
.app-content-topbar .topbar-medical-dicom-vault-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-additive-mfg-vault-button:hover:not(:disabled),
.app-content-topbar .topbar-additive-mfg-vault-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-game-dev-pipeline-vault-button:hover:not(:disabled),
.app-content-topbar .topbar-game-dev-pipeline-vault-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-photo-grading-vault-button:hover:not(:disabled),
.app-content-topbar .topbar-photo-grading-vault-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-ml-checkpoint-vault-button:hover:not(:disabled),
.app-content-topbar .topbar-ml-checkpoint-vault-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-vm-backup-vault-button:hover:not(:disabled),
.app-content-topbar .topbar-vm-backup-vault-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-db-sql-log-vault-button:hover:not(:disabled),
.app-content-topbar .topbar-db-sql-log-vault-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-broadcast-nle-vault-button:hover:not(:disabled),
.app-content-topbar .topbar-broadcast-nle-vault-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-ecommerce-pim-vault-button:hover:not(:disabled),
.app-content-topbar .topbar-ecommerce-pim-vault-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-finance-tax-vault-button:hover:not(:disabled),
.app-content-topbar .topbar-finance-tax-vault-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-iot-firmware-vault-button:hover:not(:disabled),
.app-content-topbar .topbar-iot-firmware-vault-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-mobile-build-vault-button:hover:not(:disabled),
.app-content-topbar .topbar-mobile-build-vault-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-k8s-terraform-vault-button:hover:not(:disabled),
.app-content-topbar .topbar-k8s-terraform-vault-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-publishing-prepress-vault-button:hover:not(:disabled),
.app-content-topbar .topbar-publishing-prepress-vault-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-genomics-bioinformatics-vault-button:hover:not(:disabled),
.app-content-topbar .topbar-genomics-bioinformatics-vault-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-dfir-security-vault-button:hover:not(:disabled),
.app-content-topbar .topbar-dfir-security-vault-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-robotics-ros-vault-button:hover:not(:disabled),
.app-content-topbar .topbar-robotics-ros-vault-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-semiconductor-eda-vault-button:hover:not(:disabled),
.app-content-topbar .topbar-semiconductor-eda-vault-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-aerospace-cfd-vault-button:hover:not(:disabled),
.app-content-topbar .topbar-aerospace-cfd-vault-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-battery-bms-vault-button:hover:not(:disabled),
.app-content-topbar .topbar-battery-bms-vault-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-chem-pharma-gmp-vault-button:hover:not(:disabled),
.app-content-topbar .topbar-chem-pharma-gmp-vault-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-digital-grid-scada-vault-button:hover:not(:disabled),
.app-content-topbar .topbar-digital-grid-scada-vault-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-energy-seismic-vault-button:hover:not(:disabled),
.app-content-topbar .topbar-energy-seismic-vault-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-fiber-telecom-rf-vault-button:hover:not(:disabled),
.app-content-topbar .topbar-fiber-telecom-rf-vault-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-geotech-shm-civil-vault-button:hover:not(:disabled),
.app-content-topbar .topbar-geotech-shm-civil-vault-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-hydrography-marine-vault-button:hover:not(:disabled),
.app-content-topbar .topbar-hydrography-marine-vault-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-astronomy-fits-interferometry-vault-button:hover:not(:disabled),
.app-content-topbar .topbar-astronomy-fits-interferometry-vault-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-meteorology-climate-vault-button:hover:not(:disabled),
.app-content-topbar .topbar-meteorology-climate-vault-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-materials-microscopy-vault-button:hover:not(:disabled),
.app-content-topbar .topbar-materials-microscopy-vault-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-lidar-photogrammetry-vault-button:hover:not(:disabled),
.app-content-topbar .topbar-lidar-photogrammetry-vault-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-mocap-biomechanics-vault-button:hover:not(:disabled),
.app-content-topbar .topbar-mocap-biomechanics-vault-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-neuroscience-electrophys-vault-button:hover:not(:disabled),
.app-content-topbar .topbar-neuroscience-electrophys-vault-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-orbital-spacecraft-vault-button:hover:not(:disabled),
.app-content-topbar .topbar-orbital-spacecraft-vault-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-particle-physics-hep-vault-button:hover:not(:disabled),
.app-content-topbar .topbar-particle-physics-hep-vault-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-quantum-qubit-pulse-vault-button:hover:not(:disabled),
.app-content-topbar .topbar-quantum-qubit-pulse-vault-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-railway-signaling-telemetry-vault-button:hover:not(:disabled),
.app-content-topbar .topbar-railway-signaling-telemetry-vault-button:focus-visible:not(:disabled),
.app-content-topbar .topbar-speech-asr-bioacoustics-vault-button:hover:not(:disabled),
.app-content-topbar .topbar-speech-asr-bioacoustics-vault-button:focus-visible:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element);
}

.app-content-topbar .topbar-treemap-button.is-active,
.app-content-topbar .topbar-history-button.is-active,
.app-content-topbar .topbar-similarity-button.is-active,
.app-content-topbar .topbar-batch-rules-button.is-active,
.app-content-topbar .topbar-hygiene-button.is-active,
.app-content-topbar .topbar-link-simulator-button.is-active,
.app-content-topbar .topbar-folder-matrix-button.is-active,
.app-content-topbar .topbar-footprint-button.is-active,
.app-content-topbar .topbar-photo-bursts-button.is-active,
.app-content-topbar .topbar-recovery-safety-button.is-active,
.app-content-topbar .topbar-archive-inspector-button.is-active,
.app-content-topbar .topbar-audio-workbench-button.is-active,
.app-content-topbar .topbar-video-workbench-button.is-active,
.app-content-topbar .topbar-sidecar-sweep-button.is-active,
.app-content-topbar .topbar-rule-profiles-button.is-active,
.app-content-topbar .topbar-document-lineage-button.is-active,
.app-content-topbar .topbar-photo-perceptual-button.is-active,
.app-content-topbar .topbar-broken-quarantine-button.is-active,
.app-content-topbar .topbar-retention-pruner-button.is-active,
.app-content-topbar .topbar-filename-collisions-button.is-active,
.app-content-topbar .topbar-quota-attribution-button.is-active,
.app-content-topbar .topbar-preview-cache-button.is-active,
.app-content-topbar .topbar-share-mount-button.is-active,
.app-content-topbar .topbar-backup-drift-button.is-active,
.app-content-topbar .topbar-automation-rulebook-button.is-active,
.app-content-topbar .topbar-metadata-consolidation-button.is-active,
.app-content-topbar .topbar-forensic-verifier-button.is-active,
.app-content-topbar .topbar-inode-verifier-button.is-active,
.app-content-topbar .topbar-shadow-reclaim-button.is-active,
.app-content-topbar .topbar-junk-pair-button.is-active,
.app-content-topbar .topbar-media-fidelity-button.is-active,
.app-content-topbar .topbar-cdc-chunking-button.is-active,
.app-content-topbar .topbar-ops-schedule-button.is-active,
.app-content-topbar .topbar-legal-hold-button.is-active,
.app-content-topbar .topbar-ransomware-canary-button.is-active,
.app-content-topbar .topbar-dev-tree-button.is-active,
.app-content-topbar .topbar-conflict-storm-button.is-active,
.app-content-topbar .topbar-vm-cow-button.is-active,
.app-content-topbar .topbar-scientific-bundle-button.is-active,
.app-content-topbar .topbar-brand-kit-button.is-active,
.app-content-topbar .topbar-log-telemetry-button.is-active,
.app-content-topbar .topbar-installer-repo-button.is-active,
.app-content-topbar .topbar-workbook-drift-button.is-active,
.app-content-topbar .topbar-mailbox-archive-button.is-active,
.app-content-topbar .topbar-cad-vault-button.is-active,
.app-content-topbar .topbar-web-build-media-button.is-active,
.app-content-topbar .topbar-legal-document-ocr-button.is-active,
.app-content-topbar .topbar-backup-takeout-button.is-active,
.app-content-topbar .topbar-daw-audio-button.is-active,
.app-content-topbar .topbar-vfx-render-cache-button.is-active,
.app-content-topbar .topbar-elearning-scorm-button.is-active,
.app-content-topbar .topbar-photo-raw-catalog-button.is-active,
.app-content-topbar .topbar-vm-container-image-button.is-active,
.app-content-topbar .topbar-ml-dataset-artifact-button.is-active,
.app-content-topbar .topbar-game3d-asset-vault-button.is-active,
.app-content-topbar .topbar-database-dump-log-button.is-active,
.app-content-topbar .topbar-design-publishing-vault-button.is-active,
.app-content-topbar .topbar-release-binary-artifact-button.is-active,
.app-content-topbar .topbar-email-archive-vault-button.is-active,
.app-content-topbar .topbar-audio-daw-vault-button.is-active,
.app-content-topbar .topbar-gis-map-archive-button.is-active,
.app-content-topbar .topbar-scientific-research-vault-button.is-active,
.app-content-topbar .topbar-legal-contract-vault-button.is-active,
.app-content-topbar .topbar-medical-dicom-vault-button.is-active,
.app-content-topbar .topbar-additive-mfg-vault-button.is-active,
.app-content-topbar .topbar-game-dev-pipeline-vault-button.is-active,
.app-content-topbar .topbar-photo-grading-vault-button.is-active,
.app-content-topbar .topbar-ml-checkpoint-vault-button.is-active,
.app-content-topbar .topbar-vm-backup-vault-button.is-active,
.app-content-topbar .topbar-db-sql-log-vault-button.is-active,
.app-content-topbar .topbar-broadcast-nle-vault-button.is-active,
.app-content-topbar .topbar-ecommerce-pim-vault-button.is-active,
.app-content-topbar .topbar-finance-tax-vault-button.is-active,
.app-content-topbar .topbar-iot-firmware-vault-button.is-active,
.app-content-topbar .topbar-mobile-build-vault-button.is-active,
.app-content-topbar .topbar-k8s-terraform-vault-button.is-active,
.app-content-topbar .topbar-publishing-prepress-vault-button.is-active,
.app-content-topbar .topbar-genomics-bioinformatics-vault-button.is-active,
.app-content-topbar .topbar-dfir-security-vault-button.is-active,
.app-content-topbar .topbar-robotics-ros-vault-button.is-active,
.app-content-topbar .topbar-semiconductor-eda-vault-button.is-active,
.app-content-topbar .topbar-aerospace-cfd-vault-button.is-active,
.app-content-topbar .topbar-battery-bms-vault-button.is-active,
.app-content-topbar .topbar-chem-pharma-gmp-vault-button.is-active,
.app-content-topbar .topbar-digital-grid-scada-vault-button.is-active,
.app-content-topbar .topbar-energy-seismic-vault-button.is-active,
.app-content-topbar .topbar-fiber-telecom-rf-vault-button.is-active,
.app-content-topbar .topbar-geotech-shm-civil-vault-button.is-active,
.app-content-topbar .topbar-hydrography-marine-vault-button.is-active,
.app-content-topbar .topbar-astronomy-fits-interferometry-vault-button.is-active,
.app-content-topbar .topbar-meteorology-climate-vault-button.is-active,
.app-content-topbar .topbar-materials-microscopy-vault-button.is-active,
.app-content-topbar .topbar-lidar-photogrammetry-vault-button.is-active,
.app-content-topbar .topbar-mocap-biomechanics-vault-button.is-active,
.app-content-topbar .topbar-neuroscience-electrophys-vault-button.is-active,
.app-content-topbar .topbar-orbital-spacecraft-vault-button.is-active,
.app-content-topbar .topbar-particle-physics-hep-vault-button.is-active,
.app-content-topbar .topbar-quantum-qubit-pulse-vault-button.is-active,
.app-content-topbar .topbar-railway-signaling-telemetry-vault-button.is-active,
.app-content-topbar .topbar-speech-asr-bioacoustics-vault-button.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.app-content-topbar .topbar-treemap-button:disabled,
.app-content-topbar .topbar-similarity-button:disabled,
.app-content-topbar .topbar-batch-rules-button:disabled,
.app-content-topbar .topbar-hygiene-button:disabled,
.app-content-topbar .topbar-link-simulator-button:disabled,
.app-content-topbar .topbar-folder-matrix-button:disabled,
.app-content-topbar .topbar-footprint-button:disabled,
.app-content-topbar .topbar-photo-bursts-button:disabled,
.app-content-topbar .topbar-recovery-safety-button:disabled,
.app-content-topbar .topbar-archive-inspector-button:disabled,
.app-content-topbar .topbar-audio-workbench-button:disabled,
.app-content-topbar .topbar-video-workbench-button:disabled {
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
.app-content-topbar .topbar-batch-rules-button > *,
.app-content-topbar .topbar-hygiene-button > *,
.app-content-topbar .topbar-link-simulator-button > *,
.app-content-topbar .topbar-folder-matrix-button > *,
.app-content-topbar .topbar-footprint-button > *,
.app-content-topbar .topbar-photo-bursts-button > *,
.app-content-topbar .topbar-recovery-safety-button > *,
.app-content-topbar .topbar-archive-inspector-button > *,
.app-content-topbar .topbar-audio-workbench-button > *,
.app-content-topbar .topbar-video-workbench-button > *,
.app-content-topbar .topbar-sidecar-sweep-button > *,
.app-content-topbar .topbar-rule-profiles-button > *,
.app-content-topbar .topbar-document-lineage-button > *,
.app-content-topbar .topbar-photo-perceptual-button > *,
.app-content-topbar .topbar-broken-quarantine-button > *,
.app-content-topbar .topbar-retention-pruner-button > *,
.app-content-topbar .topbar-filename-collisions-button > *,
.app-content-topbar .topbar-quota-attribution-button > *,
.app-content-topbar .topbar-preview-cache-button > *,
.app-content-topbar .topbar-share-mount-button > *,
.app-content-topbar .topbar-backup-drift-button > *,
.app-content-topbar .topbar-automation-rulebook-button > *,
.app-content-topbar .topbar-metadata-consolidation-button > *,
.app-content-topbar .topbar-forensic-verifier-button > *,
.app-content-topbar .topbar-inode-verifier-button > *,
.app-content-topbar .topbar-shadow-reclaim-button > *,
.app-content-topbar .topbar-junk-pair-button > *,
.app-content-topbar .topbar-media-fidelity-button > *,
.app-content-topbar .topbar-cdc-chunking-button > *,
.app-content-topbar .topbar-ops-schedule-button > *,
.app-content-topbar .topbar-legal-hold-button > *,
.app-content-topbar .topbar-ransomware-canary-button > *,
.app-content-topbar .topbar-dev-tree-button > *,
.app-content-topbar .topbar-conflict-storm-button > *,
.app-content-topbar .topbar-vm-cow-button > *,
.app-content-topbar .topbar-scientific-bundle-button > *,
.app-content-topbar .topbar-brand-kit-button > *,
.app-content-topbar .topbar-log-telemetry-button > *,
.app-content-topbar .topbar-installer-repo-button > *,
.app-content-topbar .topbar-workbook-drift-button > *,
.app-content-topbar .topbar-mailbox-archive-button > *,
.app-content-topbar .topbar-cad-vault-button > *,
.app-content-topbar .topbar-web-build-media-button > *,
.app-content-topbar .topbar-legal-document-ocr-button > *,
.app-content-topbar .topbar-backup-takeout-button > *,
.app-content-topbar .topbar-daw-audio-button > *,
.app-content-topbar .topbar-vfx-render-cache-button > *,
.app-content-topbar .topbar-elearning-scorm-button > *,
.app-content-topbar .topbar-photo-raw-catalog-button > *,
.app-content-topbar .topbar-vm-container-image-button > *,
.app-content-topbar .topbar-ml-dataset-artifact-button > *,
.app-content-topbar .topbar-game3d-asset-vault-button > *,
.app-content-topbar .topbar-database-dump-log-button > *,
.app-content-topbar .topbar-design-publishing-vault-button > *,
.app-content-topbar .topbar-release-binary-artifact-button > *,
.app-content-topbar .topbar-email-archive-vault-button > *,
.app-content-topbar .topbar-audio-daw-vault-button > *,
.app-content-topbar .topbar-gis-map-archive-button > *,
.app-content-topbar .topbar-scientific-research-vault-button > *,
.app-content-topbar .topbar-legal-contract-vault-button > *,
.app-content-topbar .topbar-medical-dicom-vault-button > *,
.app-content-topbar .topbar-additive-mfg-vault-button > *,
.app-content-topbar .topbar-game-dev-pipeline-vault-button > *,
.app-content-topbar .topbar-photo-grading-vault-button > *,
.app-content-topbar .topbar-ml-checkpoint-vault-button > *,
.app-content-topbar .topbar-vm-backup-vault-button > *,
.app-content-topbar .topbar-db-sql-log-vault-button > *,
.app-content-topbar .topbar-broadcast-nle-vault-button > *,
.app-content-topbar .topbar-ecommerce-pim-vault-button > *,
.app-content-topbar .topbar-finance-tax-vault-button > *,
.app-content-topbar .topbar-iot-firmware-vault-button > *,
.app-content-topbar .topbar-mobile-build-vault-button > *,
.app-content-topbar .topbar-k8s-terraform-vault-button > *,
.app-content-topbar .topbar-publishing-prepress-vault-button > *,
.app-content-topbar .topbar-genomics-bioinformatics-vault-button > *,
.app-content-topbar .topbar-dfir-security-vault-button > *,
.app-content-topbar .topbar-robotics-ros-vault-button > *,
.app-content-topbar .topbar-semiconductor-eda-vault-button > *,
.app-content-topbar .topbar-aerospace-cfd-vault-button > *,
.app-content-topbar .topbar-battery-bms-vault-button > *,
.app-content-topbar .topbar-chem-pharma-gmp-vault-button > *,
.app-content-topbar .topbar-digital-grid-scada-vault-button > *,
.app-content-topbar .topbar-energy-seismic-vault-button > *,
.app-content-topbar .topbar-fiber-telecom-rf-vault-button > *,
.app-content-topbar .topbar-geotech-shm-civil-vault-button > *,
.app-content-topbar .topbar-hydrography-marine-vault-button > *,
.app-content-topbar .topbar-astronomy-fits-interferometry-vault-button > *,
.app-content-topbar .topbar-meteorology-climate-vault-button > *,
.app-content-topbar .topbar-materials-microscopy-vault-button > *,
.app-content-topbar .topbar-lidar-photogrammetry-vault-button > *,
.app-content-topbar .topbar-mocap-biomechanics-vault-button > *,
.app-content-topbar .topbar-neuroscience-electrophys-vault-button > *,
.app-content-topbar .topbar-orbital-spacecraft-vault-button > *,
.app-content-topbar .topbar-particle-physics-hep-vault-button > *,
.app-content-topbar .topbar-quantum-qubit-pulse-vault-button > *,
.app-content-topbar .topbar-railway-signaling-telemetry-vault-button > *,
.app-content-topbar .topbar-speech-asr-bioacoustics-vault-button > *,
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
	.app-content-topbar .topbar-batch-rules-button,
	.app-content-topbar .topbar-hygiene-button,
	.app-content-topbar .topbar-link-simulator-button,
	.app-content-topbar .topbar-folder-matrix-button,
	.app-content-topbar .topbar-footprint-button,
	.app-content-topbar .topbar-photo-bursts-button,
	.app-content-topbar .topbar-recovery-safety-button,
	.app-content-topbar .topbar-archive-inspector-button,
	.app-content-topbar .topbar-audio-workbench-button,
	.app-content-topbar .topbar-video-workbench-button,
	.app-content-topbar .topbar-sidecar-sweep-button,
	.app-content-topbar .topbar-rule-profiles-button,
	.app-content-topbar .topbar-document-lineage-button,
	.app-content-topbar .topbar-photo-perceptual-button,
	.app-content-topbar .topbar-broken-quarantine-button,
	.app-content-topbar .topbar-retention-pruner-button,
	.app-content-topbar .topbar-filename-collisions-button,
	.app-content-topbar .topbar-quota-attribution-button,
	.app-content-topbar .topbar-preview-cache-button,
	.app-content-topbar .topbar-share-mount-button,
	.app-content-topbar .topbar-backup-drift-button,
	.app-content-topbar .topbar-automation-rulebook-button,
	.app-content-topbar .topbar-metadata-consolidation-button,
	.app-content-topbar .topbar-forensic-verifier-button,
	.app-content-topbar .topbar-inode-verifier-button,
	.app-content-topbar .topbar-shadow-reclaim-button,
	.app-content-topbar .topbar-junk-pair-button,
	.app-content-topbar .topbar-media-fidelity-button,
	.app-content-topbar .topbar-cdc-chunking-button,
	.app-content-topbar .topbar-ops-schedule-button,
	.app-content-topbar .topbar-legal-hold-button,
	.app-content-topbar .topbar-ransomware-canary-button,
	.app-content-topbar .topbar-dev-tree-button,
	.app-content-topbar .topbar-conflict-storm-button,
	.app-content-topbar .topbar-vm-cow-button,
	.app-content-topbar .topbar-scientific-bundle-button,
	.app-content-topbar .topbar-brand-kit-button,
	.app-content-topbar .topbar-log-telemetry-button,
	.app-content-topbar .topbar-installer-repo-button,
	.app-content-topbar .topbar-workbook-drift-button,
	.app-content-topbar .topbar-mailbox-archive-button,
	.app-content-topbar .topbar-cad-vault-button,
	.app-content-topbar .topbar-web-build-media-button,
	.app-content-topbar .topbar-legal-document-ocr-button,
	.app-content-topbar .topbar-backup-takeout-button,
	.app-content-topbar .topbar-daw-audio-button,
	.app-content-topbar .topbar-vfx-render-cache-button,
	.app-content-topbar .topbar-elearning-scorm-button,
	.app-content-topbar .topbar-photo-raw-catalog-button,
	.app-content-topbar .topbar-vm-container-image-button,
	.app-content-topbar .topbar-ml-dataset-artifact-button,
	.app-content-topbar .topbar-game3d-asset-vault-button,
	.app-content-topbar .topbar-database-dump-log-button,
	.app-content-topbar .topbar-design-publishing-vault-button,
	.app-content-topbar .topbar-release-binary-artifact-button,
	.app-content-topbar .topbar-email-archive-vault-button,
	.app-content-topbar .topbar-audio-daw-vault-button,
	.app-content-topbar .topbar-gis-map-archive-button,
	.app-content-topbar .topbar-scientific-research-vault-button,
	.app-content-topbar .topbar-legal-contract-vault-button,
	.app-content-topbar .topbar-medical-dicom-vault-button,
	.app-content-topbar .topbar-additive-mfg-vault-button,
	.app-content-topbar .topbar-game-dev-pipeline-vault-button,
	.app-content-topbar .topbar-photo-grading-vault-button,
	.app-content-topbar .topbar-ml-checkpoint-vault-button,
	.app-content-topbar .topbar-vm-backup-vault-button,
	.app-content-topbar .topbar-db-sql-log-vault-button,
	.app-content-topbar .topbar-broadcast-nle-vault-button,
	.app-content-topbar .topbar-ecommerce-pim-vault-button,
	.app-content-topbar .topbar-finance-tax-vault-button,
	.app-content-topbar .topbar-iot-firmware-vault-button,
	.app-content-topbar .topbar-mobile-build-vault-button,
	.app-content-topbar .topbar-k8s-terraform-vault-button,
	.app-content-topbar .topbar-publishing-prepress-vault-button,
	.app-content-topbar .topbar-genomics-bioinformatics-vault-button,
	.app-content-topbar .topbar-dfir-security-vault-button,
	.app-content-topbar .topbar-robotics-ros-vault-button,
	.app-content-topbar .topbar-semiconductor-eda-vault-button,
	.app-content-topbar .topbar-aerospace-cfd-vault-button,
	.app-content-topbar .topbar-battery-bms-vault-button,
	.app-content-topbar .topbar-chem-pharma-gmp-vault-button,
	.app-content-topbar .topbar-digital-grid-scada-vault-button,
	.app-content-topbar .topbar-energy-seismic-vault-button,
	.app-content-topbar .topbar-fiber-telecom-rf-vault-button,
	.app-content-topbar .topbar-geotech-shm-civil-vault-button,
	.app-content-topbar .topbar-hydrography-marine-vault-button,
	.app-content-topbar .topbar-astronomy-fits-interferometry-vault-button,
	.app-content-topbar .topbar-meteorology-climate-vault-button,
	.app-content-topbar .topbar-materials-microscopy-vault-button,
	.app-content-topbar .topbar-lidar-photogrammetry-vault-button,
	.app-content-topbar .topbar-mocap-biomechanics-vault-button,
	.app-content-topbar .topbar-neuroscience-electrophys-vault-button,
	.app-content-topbar .topbar-orbital-spacecraft-vault-button,
	.app-content-topbar .topbar-particle-physics-hep-vault-button,
	.app-content-topbar .topbar-quantum-qubit-pulse-vault-button,
	.app-content-topbar .topbar-railway-signaling-telemetry-vault-button,
	.app-content-topbar .topbar-speech-asr-bioacoustics-vault-button,
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
.app-content-topbar .topbar-batch-rules-button:focus-visible,
.app-content-topbar .topbar-footprint-button:focus-visible,
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