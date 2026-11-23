<template>
  <div class="duplicate-details-container" @keydown.esc="onDetailsEscape">
    <transition name="fade">
      <div v-show="!isLoadingNextDuplicate">
        <div v-if="duplicate && duplicate.files.length > 1" class="duplicate-details-content">
          <div class="details-header-row">
            <h3 class="details-group-title">
              {{ t('duplicatefinder', 'Duplicate Details') }} - {{ getGroupDisplayName(duplicate) }}
            </h3>
            <div class="details-header-pills">
              <span
                v-if="isGroupExcluded"
                class="group-status-pill is-excluded">
                {{ t('duplicatefinder', 'False positive (Excluded)') }}
              </span>
              <span
                class="group-status-pill"
                :class="duplicate.acknowledged ? 'is-acknowledged' : 'is-unacknowledged'">
                {{ duplicate.acknowledged ? t('duplicatefinder', 'Acknowledged') : t('duplicatefinder', 'Unacknowledged') }}
              </span>
            </div>
          </div>

          <div
            class="group-header-summary"
            role="region"
            :aria-label="t('duplicatefinder', 'Group summary')">
            <span class="group-header-summary__item group-header-summary__item--copies">
              {{ t('duplicatefinder', '{totalCopies} copies ({redundantCopies} redundant)', {
                totalCopies: groupHeaderSummary.totalCopies,
                redundantCopies: groupHeaderSummary.redundantCopies
              }) }}
            </span>
            <span class="group-header-summary__item group-header-summary__item--reclaimable">
              {{ t('duplicatefinder', '{reclaimableFormatted} reclaimable', {
                reclaimableFormatted: groupHeaderSummary.reclaimableFormatted
              }) }}
            </span>
            <span
              v-if="groupHeaderSummary.protectedCount > 0"
              class="group-header-summary__item group-header-summary__item--protected">
              {{ t('duplicatefinder', '{protectedCount} protected', {
                protectedCount: groupHeaderSummary.protectedCount
              }) }}
            </span>
            <span
              v-if="visualGroupSummaryLabel"
              class="group-header-summary__item group-header-summary__item--visual">
              {{ visualGroupSummaryLabel }}
            </span>
            <button
              v-if="visualGroupEvaluation.hasVisualMedia && duplicate.files.length >= 2"
              type="button"
              class="group-header-summary__inspect-button"
              @click="openVisualDiffCompare">
              {{ t('duplicatefinder', 'Inspect visual diff') }}
            </button>
            <div class="group-header-summary__hash-control">
              <button
                type="button"
                class="group-header-summary__copy-hash-button"
                :class="{
                  'is-copied': hashCopyStatus === 'copied',
                  'is-error': hashCopyStatus === 'error'
                }"
                :disabled="!fullGroupHash"
                aria-keyshortcuts="y"
                :title="shortGroupHash
                  ? t('duplicatefinder', 'Copy hash ({hash})', { hash: shortGroupHash })
                  : t('duplicatefinder', 'Copy hash')"
                :aria-label="shortGroupHash
                  ? t('duplicatefinder', 'Copy hash ({hash})', { hash: shortGroupHash })
                  : t('duplicatefinder', 'Copy hash')"
                @click="copyGroupHash">
                <svg
                  v-if="hashCopyStatus === 'copied'"
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <svg
                  v-else
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                <span class="group-header-summary__copy-hash-label">{{ t('duplicatefinder', 'Copy hash') }}</span>
                <code v-if="shortGroupHash" class="group-header-summary__hash-code">{{ shortGroupHash }}</code>
              </button>
              <span
                class="group-header-summary__copy-status"
                :class="{
                  'is-visible': Boolean(hashCopyStatusMessage),
                  'is-copied': hashCopyStatus === 'copied',
                  'is-error': hashCopyStatus === 'error'
                }"
                role="status"
                aria-live="polite">
                {{ hashCopyStatusMessage }}
              </span>
            </div>
          </div>

          <div class="summary-section">
            <div class="summary-info">
              <p class="summary-text">{{ t('duplicatefinder',
                'Welcome, the current duplicate has {numberOfFiles} files, total size: {formattedSize}',
                { numberOfFiles: duplicate.files.length, formattedSize: getDuplicateSize(duplicate) }) }}</p>
            </div>
            <div class="summary-actions">
              <button
                type="button"
                class="toolbar-button select-all-button"
                :disabled="defaultSelectAllTargetFiles.length === 0"
                aria-keyshortcuts="a"
                @click="selectAllFiles">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polyline points="9 11 12 14 22 4"></polyline>
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                </svg>
                <span>{{ t('duplicatefinder', 'Select All') }}</span>
              </button>

              <button
                type="button"
                class="toolbar-button delete-selected-button"
                :disabled="selectedFiles.length === 0"
                @click="deleteSelectedDuplicates">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  <line x1="10" y1="11" x2="10" y2="17"></line>
                  <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
                <span>{{ t('duplicatefinder', 'Delete Selected') }}</span>
              </button>

              <button
                v-if="duplicate.acknowledged"
                type="button"
                class="toolbar-button acknowledge-link is-acknowledged"
                :disabled="isAcknowledging"
                aria-keyshortcuts="u"
                @click="unOrAcknowledgeDuplicate(duplicate)">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                  <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
                <!-- TRANSLATORS Button that moves this group of duplicates back from the Acknowledged list to the Unacknowledged list -->
                <span>{{ t('duplicatefinder', 'Unacknowledge it') }}</span>
              </button>
              <button
                v-else
                type="button"
                class="toolbar-button acknowledge-link"
                :disabled="isAcknowledging"
                aria-keyshortcuts="u"
                @click="unOrAcknowledgeDuplicate(duplicate)">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                  <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
                <!-- TRANSLATORS Button that marks this group of duplicates as reviewed and kept as it is. It moves to the Acknowledged list; no files are deleted -->
                <span>{{ t('duplicatefinder', 'Acknowledge it') }}</span>
              </button>

              <button
                type="button"
                class="toolbar-button preview-button"
                :title="t('duplicatefinder', 'Show Preview')"
                @click="previewMerge">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
                <span>{{ t('duplicatefinder', 'Preview') }}</span>
              </button>

              <button
                type="button"
                class="toolbar-button compare-toggle-button"
                :class="{ 'is-active': compareMode }"
                :aria-pressed="compareMode ? 'true' : 'false'"
                aria-keyshortcuts="v"
                :title="t('duplicatefinder', 'Compare copies side-by-side')"
                @click="toggleCompareMode">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <rect x="3" y="4" width="8" height="16" rx="1"></rect>
                  <rect x="13" y="4" width="8" height="16" rx="1"></rect>
                </svg>
                <span>{{ compareMode ? t('duplicatefinder', 'List view') : t('duplicatefinder', 'Compare') }}</span>
              </button>

              <button
                type="button"
                class="toolbar-button false-positive-button"
                :class="{ 'is-excluded': isGroupExcluded }"
                :disabled="!fullGroupHash || isIgnoringRule || isGroupExcluded"
                :title="isGroupExcluded
                  ? t('duplicatefinder', 'Group hash is excluded from future scans')
                  : t('duplicatefinder', 'Mark as false positive and exclude hash from future scans')"
                @click="excludeGroupAsFalsePositive">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
                </svg>
                <span>{{ isGroupExcluded ? t('duplicatefinder', 'Excluded') : t('duplicatefinder', 'False positive') }}</span>
              </button>

              <div ref="actionsDropdown" class="dropdown" @keydown.esc.stop="showDropdown = false">
                <button
                  type="button"
                  class="dropdown-toggle has-tooltip"
                  :title="t('duplicatefinder', 'More actions')"
                  :aria-label="t('duplicatefinder', 'More actions')"
                  :aria-expanded="showDropdown ? 'true' : 'false'"
                  aria-haspopup="menu"
                  :data-tooltip="t('duplicatefinder', 'More actions')"
                  @click="toggleDropdown">
                  <span class="arrow-down"></span>
                </button>
                <div v-if="showDropdown" class="dropdown-menu" role="menu">
                  <button type="button" role="menuitem" @click="copyFileHash">
                    {{ t('duplicatefinder', 'Copy File Hash') }}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    :disabled="!fullGroupHash || isIgnoringRule || isGroupExcluded"
                    @click="excludeGroupAsFalsePositive">
                    {{ isGroupExcluded
                      ? t('duplicatefinder', 'Excluded from future scans')
                      : t('duplicatefinder', 'Exclude group (False positive)') }}
                  </button>
                  <button
                    v-for="pattern in groupIgnoreOptions.extensionPatterns"
                    :key="'ext-' + pattern"
                    type="button"
                    role="menuitem"
                    :disabled="isIgnoringRule || isPatternIgnored(pattern)"
                    @click="ignorePatternRule(pattern)">
                    {{ isPatternIgnored(pattern)
                      ? t('duplicatefinder', 'Ignored: {pattern}', { pattern })
                      : t('duplicatefinder', 'Ignore pattern: {pattern}', { pattern }) }}
                  </button>
                  <button
                    v-for="fileName in groupIgnoreOptions.exactFileNames"
                    :key="'name-' + fileName"
                    type="button"
                    role="menuitem"
                    :disabled="isIgnoringRule || isPatternIgnored(fileName)"
                    @click="ignorePatternRule(fileName)">
                    {{ isPatternIgnored(fileName)
                      ? t('duplicatefinder', 'Ignored: {pattern}', { pattern: fileName })
                      : t('duplicatefinder', 'Ignore file name: {name}', { name: fileName }) }}
                  </button>
                  <button
                    v-for="folderPath in groupIgnoreOptions.folderPaths"
                    :key="'folder-' + folderPath"
                    type="button"
                    role="menuitem"
                    :disabled="isIgnoringRule || isFolderExcluded(folderPath)"
                    @click="excludeFolderRule(folderPath)">
                    {{ isFolderExcluded(folderPath)
                      ? t('duplicatefinder', 'Excluded folder: {folder}', { folder: folderPath })
                      : t('duplicatefinder', 'Exclude folder: {folder}', { folder: folderPath }) }}
                  </button>
                  <div class="dropdown-menu-divider" role="separator"></div>
                  <button type="button" role="menuitem" @click="openIgnoreRulesSettings">
                    {{ t('duplicatefinder', 'Manage ignore rules...') }}
                  </button>
                </div>
              </div>
            </div>

            <div
              v-if="ignoreActionMessage || isGroupExcluded"
              class="ignore-rule-banner"
              :class="{ 'is-error': ignoreActionStatus === 'error' }"
              role="status"
              aria-live="polite">
              <span class="ignore-rule-banner__text">
                {{ ignoreActionMessage || t('duplicatefinder', 'This group hash is excluded from future scans.') }}
              </span>
              <button
                type="button"
                class="ignore-rule-banner__link"
                @click="openSettings">
                {{ t('duplicatefinder', 'Manage ignore rules') }}
              </button>
            </div>

            <div
              class="keep-rules-toolbar"
              role="group"
              :aria-label="t('duplicatefinder', 'Smart selection rules')">
              <span class="keep-rules-label">{{ t('duplicatefinder', 'Smart keep:') }}</span>
              <button
                v-for="ruleOption in keepRuleOptions"
                :key="ruleOption.id"
                type="button"
                class="toolbar-button keep-rule-button"
                :class="{ 'is-active': activeKeepRule === ruleOption.id }"
                :aria-pressed="activeKeepRule === ruleOption.id ? 'true' : 'false'"
                :disabled="selectableFiles.length === 0"
                @click="applyKeepRule(ruleOption.id)">
                <span>{{ ruleOption.label }}</span>
              </button>
              <button
                v-if="visualGroupEvaluation.hasDimensionSpread"
                type="button"
                class="toolbar-button resolution-winner-keep-button"
                :class="{ 'is-active': activeKeepRule === 'highest_resolution' }"
                :aria-pressed="activeKeepRule === 'highest_resolution' ? 'true' : 'false'"
                :disabled="selectableFiles.length === 0"
                @click="applyBestResolutionKeep">
                <span>{{ t('duplicatefinder', 'Keep best resolution') }}</span>
              </button>
            </div>

            <div
              v-if="deletionSafetyPlan.selectedCount > 0 || selectedFiles.length > 0"
              class="deletion-safety-bar">
              <div
                v-if="deletionSafetyPlan.selectedCount > 0"
                class="deletion-safety-summary"
                :class="{
                  'is-danger': deletionSafetyPlan.wouldDeleteAllCopies || deletionSafetyPlan.includesProtectedOrigin,
                  'is-safe': deletionSafetyPlan.canProceedSafely
                }"
                role="status"
                aria-live="polite">
                <p class="deletion-safety-summary__text">
                  {{ t('duplicatefinder',
                    'Deletion plan: {selectedCount} file(s) selected, {survivingCount} copy/copies kept, {reclaimableFormatted} freed.',
                    {
                      selectedCount: deletionSafetyPlan.selectedCount,
                      survivingCount: deletionSafetyPlan.survivingCount,
                      reclaimableFormatted: deletionSafetyPlan.reclaimableFormatted
                    }) }}
                </p>
                <p
                  v-if="deletionSafetyPlan.wouldDeleteAllCopies"
                  class="deletion-safety-summary__warning">
                  {{ t('duplicatefinder', 'Warning: all copies in this group are selected. At least one copy should be kept to avoid data loss.') }}
                </p>
                <p
                  v-else-if="deletionSafetyPlan.includesProtectedOrigin"
                  class="deletion-safety-summary__warning">
                  {{ t('duplicatefinder', 'Protected files in origin folders cannot be deleted.') }}
                </p>
              </div>

              <div
                v-if="selectedFiles.length > 0"
                class="deletion-safety-bar__actions">
                <button
                  v-if="deletionAuditPlan.selectedCount > 0"
                  type="button"
                  class="toolbar-button review-deletion-plan-button"
                  :aria-label="t('duplicatefinder', 'Review deletion plan')"
                  @click="openDryRunAuditDialog">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="9" y1="13" x2="15" y2="13"></line>
                    <line x1="9" y1="17" x2="13" y2="17"></line>
                  </svg>
                  <span>{{ t('duplicatefinder', 'Review plan') }}</span>
                </button>

                <button
                  ref="clearSelectionButton"
                  type="button"
                  class="toolbar-button clear-selection-button"
                  :aria-label="t('duplicatefinder', 'Clear selection')"
                  @click="clearSelection({ restoreFocus: true })">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                  <span>{{ t('duplicatefinder', 'Clear selection') }}</span>
                </button>
              </div>
            </div>
          </div>

          <div v-if="!compareMode" class="files-card" :class="{ 'is-compact-actions': !hasMultiFolderActions }">
            <div class="files-table-header">
              <div class="col-checkbox" @click.self="toggleSelectAllFromHeader">
                <input
                  type="checkbox"
                  class="file-row-checkbox file-header-checkbox"
                  :checked="isAllFilesSelected"
                  :indeterminate.prop="isSomeFilesSelected"
                  :disabled="defaultSelectAllTargetFiles.length === 0"
                  :title="t('duplicatefinder', 'Select All')"
                  :aria-label="t('duplicatefinder', 'Select All')"
                  @change="toggleSelectAllFromHeader"
                />
              </div>
              <div class="col-preview">{{ t('duplicatefinder', 'Preview') }}</div>
              <div class="col-name">{{ t('duplicatefinder', 'Name & Path') }}</div>
              <div class="col-size">{{ t('duplicatefinder', 'Size') }}</div>
              <div class="col-status">{{ t('duplicatefinder', 'Status') }}</div>
              <div class="col-actions">{{ t('duplicatefinder', 'Actions') }}</div>
            </div>

            <div
              v-for="(file, index) in duplicate.files"
              :key="fileKey(file)"
              class="file-display"
              :class="{
                'is-selected': isFileSelected(file),
                'is-keeping': selectedFiles.length > 0 && !isFileSelected(file),
                'is-protected': file.isInOriginFolder
              }">
              <input
                v-model="selectedFiles"
                type="checkbox"
                class="file-row-checkbox"
                :value="file"
                :disabled="file.isInOriginFolder"
                :aria-label="t('duplicatefinder', 'Select {file}', { file: file.path })"
                @change="activeKeepRule = null"
              />
              <DuplicateFileDisplay
                :file="file"
                :index="index"
                :duplicate-acknowledged="duplicate.acknowledged"
                :has-other-folders="hasFilesInOtherFolders(file)"
                :metadata-badges="fileMetadataBadges[index] || null"
                :visual-badge="fileVisualBadges[index] || null"
                :path-segments="filePathSegments[index] || []"
                :is-selected="isFileSelected(file)"
                :has-active-selection="selectedFiles.length > 0"
                @keepFolder="selectDuplicatesOutsideFolder(file)"
                @fileDeleted="removeFileFromListAndUpdate(file, $event)">
              </DuplicateFileDisplay>
            </div>
          </div>

          <DuplicateCompareView
            v-else
            :files="duplicate.files"
            :selected-files="selectedFiles"
            :path-segments-by-index="filePathSegments"
            :metadata-badges-by-index="fileMetadataBadges"
            :initial-inspection-mode="compareInitialMode"
            :live-dimensions-by-key="inspectedDimensionsByKey"
            @visual-inspection-updated="onVisualInspectionUpdated"
            @select-lower-res="applyLowerResSelection"
            @toggle-copy-selection="toggleFileSelection"
            @close-compare="closeCompareMode"
          />
        </div>
        <div v-else class="emptycontent" role="status" aria-live="polite">
          <div class="icon-file" />
          <div>
            <h2>{{ t('duplicatefinder', 'No duplicates found or no duplicate selected.') }}</h2>
            <p>{{ t('duplicatefinder', 'You can adjust settings or run a new scan to find duplicates.') }}</p>
            <div class="action-buttons">
              <button type="button" @click="openSettings" class="primary">{{ t('duplicatefinder', 'Open Settings') }}</button>
              <button type="button" @click="findDuplicates" :disabled="isScanning">
                {{ isScanning ? t('duplicatefinder', 'Scanning...') : t('duplicatefinder', 'Find Duplicates') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </transition>
    <transition name="fade">
      <div v-show="isLoadingNextDuplicate" class="loading-overlay">
        <NcLoadingSpinner />
      </div>
    </transition>
    <dialog
      v-if="showDeleteConfirmDialog"
      ref="deleteConfirmDialog"
      class="nc-confirm-dialog"
      :class="{ 'is-delete-all': confirmDialogPlan.wouldDeleteAllCopies }"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="nc-confirm-delete-title"
      aria-describedby="nc-confirm-delete-desc"
      @cancel.prevent="resolveDeleteConfirm(false)"
      @keydown.esc.prevent.stop="resolveDeleteConfirm(false)"
      @click.self="resolveDeleteConfirm(false)">
      <div class="nc-confirm-dialog__surface">
        <div class="nc-confirm-dialog__header">
          <span class="nc-confirm-dialog__icon" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
          </span>
          <h4 id="nc-confirm-delete-title" class="nc-confirm-dialog__title">
            {{ confirmDialogPlan.wouldDeleteAllCopies
              ? t('duplicatefinder', 'Delete all copies?')
              : (isDryRunDialog
                ? t('duplicatefinder', 'Dry-run deletion plan')
                : t('duplicatefinder', 'Confirm deletion')) }}
          </h4>
        </div>
        <p id="nc-confirm-delete-desc" class="nc-confirm-dialog__message">
          {{ confirmDialogPlan.wouldDeleteAllCopies
            ? t('duplicatefinder', 'This action will delete all instances of the duplicate. At least one copy should be kept. Are you sure you want to proceed?')
            : (isDryRunDialog
              ? t('duplicatefinder', 'Dry-run audit: inspect which files will be removed and which copies will remain safe. No files are deleted yet.')
              : t('duplicatefinder', 'Review the deletion impact below before permanently removing the selected files.')) }}
        </p>
        <dl class="nc-confirm-dialog__stats">
          <div class="nc-confirm-dialog__stat">
            <dt>{{ t('duplicatefinder', 'Files to delete') }}</dt>
            <dd>{{ confirmDialogPlan.selectedCount }}</dd>
          </div>
          <div class="nc-confirm-dialog__stat">
            <dt>{{ t('duplicatefinder', 'Copies kept') }}</dt>
            <dd>{{ confirmDialogPlan.survivingCount }}</dd>
          </div>
          <div class="nc-confirm-dialog__stat">
            <dt>{{ t('duplicatefinder', 'Space freed') }}</dt>
            <dd>{{ confirmDialogPlan.reclaimableFormatted }}</dd>
          </div>
        </dl>
        <div class="nc-confirm-dialog__audit">
          <section class="nc-confirm-dialog__audit-section nc-confirm-dialog__audit-section--delete">
            <h5 class="nc-confirm-dialog__audit-heading">
              {{ t('duplicatefinder', 'Files to delete ({count})', { count: confirmDialogAuditPlan.targetEntries.length }) }}
            </h5>
            <ul class="nc-confirm-dialog__path-list nc-confirm-dialog__path-list--delete">
              <li
                v-for="(entry, idx) in confirmDialogAuditPlan.targetEntries"
                :key="'del-' + (entry.key || entry.path || idx)"
                class="nc-confirm-dialog__path-item">
                <span class="nc-confirm-dialog__path-text" :title="entry.normalizedPath || entry.path">
                  {{ entry.normalizedPath || entry.path }}
                </span>
                <span class="nc-confirm-dialog__path-meta">
                  <span
                    v-if="entry.isProtected"
                    class="nc-confirm-dialog__path-badge is-protected">
                    {{ t('duplicatefinder', 'Protected origin') }}
                  </span>
                  <span class="nc-confirm-dialog__path-size">{{ entry.formattedSize }}</span>
                </span>
              </li>
            </ul>
          </section>
          <section class="nc-confirm-dialog__audit-section nc-confirm-dialog__audit-section--keep">
            <h5 class="nc-confirm-dialog__audit-heading">
              {{ t('duplicatefinder', 'Surviving copies kept ({count})', { count: confirmDialogAuditPlan.survivingEntries.length }) }}
            </h5>
            <ul
              v-if="confirmDialogAuditPlan.survivingEntries.length > 0"
              class="nc-confirm-dialog__path-list nc-confirm-dialog__path-list--keep">
              <li
                v-for="(entry, idx) in confirmDialogAuditPlan.survivingEntries"
                :key="'keep-' + (entry.key || entry.path || idx)"
                class="nc-confirm-dialog__path-item">
                <span class="nc-confirm-dialog__path-text" :title="entry.normalizedPath || entry.path">
                  {{ entry.normalizedPath || entry.path }}
                </span>
                <span class="nc-confirm-dialog__path-meta">
                  <span
                    class="nc-confirm-dialog__path-badge"
                    :class="entry.isProtected ? 'is-protected' : 'is-kept'">
                    {{ entry.isProtected
                      ? t('duplicatefinder', 'Protected origin')
                      : t('duplicatefinder', 'Kept') }}
                  </span>
                  <span class="nc-confirm-dialog__path-size">{{ entry.formattedSize }}</span>
                </span>
              </li>
            </ul>
            <p
              v-else
              class="nc-confirm-dialog__empty-keep-warning"
              role="status">
              {{ t('duplicatefinder', 'No copies will remain after this deletion.') }}
            </p>
          </section>
        </div>
        <div class="nc-confirm-dialog__actions">
          <div class="nc-confirm-dialog__export-group">
            <button
              type="button"
              class="nc-confirm-dialog__button nc-confirm-dialog__button--export"
              :disabled="confirmDialogAuditPlan.selectedCount === 0"
              @click="exportCurrentDeletionPlan">
              {{ t('duplicatefinder', 'Export plan (JSON)') }}
            </button>
            <span
              v-if="planExportMessage"
              class="nc-confirm-dialog__export-status"
              :class="{ 'is-error': planExportStatus === 'error' }"
              role="status"
              aria-live="polite">
              {{ planExportMessage }}
            </span>
          </div>
          <div class="nc-confirm-dialog__decision-group">
            <button
              type="button"
              class="nc-confirm-dialog__button nc-confirm-dialog__button--cancel"
              @click="resolveDeleteConfirm(false)">
              {{ isDryRunDialog ? t('duplicatefinder', 'Close') : t('duplicatefinder', 'Cancel') }}
            </button>
            <button
              type="button"
              class="nc-confirm-dialog__button nc-confirm-dialog__button--danger"
              :disabled="confirmDialogPlan.includesProtectedOrigin"
              @click="resolveDeleteConfirm(true)">
              {{ confirmDialogPlan.wouldDeleteAllCopies
                ? t('duplicatefinder', 'Delete all copies')
                : (isDryRunDialog
                  ? t('duplicatefinder', 'Execute deletion')
                  : t('duplicatefinder', 'Confirm delete')) }}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  </div>
</template>

<script>
import { acknowledgeDuplicate, unacknowledgeDuplicate, deleteFiles, findDuplicates as apiFindDuplicates, saveFilter, saveExcludedFolder } from '@/tools/api';
import { copyTextSafely } from '@/tools/clipboardHelper';
import { getFormattedSizeOfCurrentDuplicate, openFileInViewer, removeFileFromList, removeFilesFromList, getParentFolderPath, fileKey, isSameFile } from '@/tools/utils';
import { getFileSelectionKey, selectDuplicatesByKeepRule } from '@/tools/duplicateSelectionAndExport';
import { annotateDuplicateMetadataBadges } from '@/tools/duplicateMetadataBadges';
import { computePathDiffSegments } from '@/tools/duplicatePathDiff';
import { buildDeletionAuditPlan, downloadDeletionPlanJson, evaluateDeletionPlan } from '@/tools/deleteSafetyGuard';
import { computeGroupHeaderSummary } from '@/tools/duplicateGroupSummary';
import { formatShortHash, deriveGroupIgnoreOptions } from '@/tools/duplicateHashHelper';
import {
  evaluateResolutionWinners,
  normalizeExifMetadata,
  selectLowerResolutionKeys,
} from '@/tools/visualMediaInspector';
import { showSuccess, showError } from '@nextcloud/dialogs';
import DuplicateCompareView from './DuplicateCompareView.vue';
import DuplicateFileDisplay from './DuplicateFileDisplay.vue';

export default {
  components: {
    DuplicateCompareView,
    DuplicateFileDisplay
  },
  props: {
    duplicate: Object,
    isScanning: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {
      selectedFiles: [],
      activeKeepRule: null,
      compareMode: false,
      compareInitialMode: 'side-by-side',
      inspectedDimensionsByKey: {},
      isAcknowledging: false,
      acknowledgeRequestToken: 0,
      isLoadingNextDuplicate: false,
      showDropdown: false,
      showDeleteConfirmDialog: false,
      confirmDialogMode: 'confirm',
      pendingDeletePlan: null,
      pendingDeleteAuditPlan: null,
      pendingDeleteResolver: null,
      planExportStatus: 'idle',
      planExportMessage: '',
      planExportTimer: null,
      hashCopyStatus: 'idle',
      hashCopyStatusMessage: '',
      hashCopyResetTimer: null,
      isIgnoringRule: false,
      excludedHashesInSession: [],
      ignoredPatternsInSession: [],
      excludedFoldersInSession: [],
      ignoreActionStatus: 'idle',
      ignoreActionMessage: '',
      ignoreActionTimer: null,
      outsideClickHandler: null
    };
  },
  watch: {
    // A selection belongs to the duplicate it was made on: never carry it over to another one
    duplicate() {
      this.selectedFiles = [];
      this.activeKeepRule = null;
      this.compareInitialMode = 'side-by-side';
      this.inspectedDimensionsByKey = {};
      this.isAcknowledging = false;
      this.acknowledgeRequestToken += 1;
      this.showDropdown = false;
      this.resetHashCopyFeedback();
      this.resetPlanExportFeedback();
      this.resetIgnoreActionFeedback();
      if (this.showDeleteConfirmDialog || this.pendingDeleteResolver) {
        this.resolveDeleteConfirm(false);
      }
    }
  },
  mounted() {
    this.outsideClickHandler = event => {
      if (!this.showDropdown) {
        return;
      }
      const dropdown = this.$refs.actionsDropdown;
      if (dropdown && typeof dropdown.contains === 'function' && !dropdown.contains(event.target)) {
        this.showDropdown = false;
      }
    };
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('click', this.outsideClickHandler);
    }
  },
  beforeDestroy() {
    this.resetHashCopyFeedback();
    this.resetPlanExportFeedback();
    this.resetIgnoreActionFeedback();
    if (this.outsideClickHandler && typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
      document.removeEventListener('click', this.outsideClickHandler);
      this.outsideClickHandler = null;
    }
    if (this.pendingDeleteResolver) {
      this.resolveDeleteConfirm(false);
    }
  },
  computed: {
    keepRuleOptions() {
      return [
        { id: 'oldest', label: t('duplicatefinder', 'Keep oldest') },
        { id: 'newest', label: t('duplicatefinder', 'Keep newest') },
        { id: 'shortest_path', label: t('duplicatefinder', 'Keep shortest path') },
      ];
    },
    selectableFiles() {
      if (!this.duplicate || !Array.isArray(this.duplicate.files)) {
        return [];
      }
      return this.duplicate.files.filter(file => !file.isInOriginFolder);
    },
    defaultSelectAllTargetFiles() {
      const filesToSelect = this.selectableFiles;
      if (!this.duplicate || !Array.isArray(this.duplicate.files)) {
        return [];
      }
      if (filesToSelect.length === this.duplicate.files.length && filesToSelect.length > 0) {
        return filesToSelect.slice(1);
      }
      return filesToSelect;
    },
    isAllFilesSelected() {
      const targets = this.defaultSelectAllTargetFiles;
      return targets.length > 0 && targets.every(file => this.isFileSelected(file));
    },
    isSomeFilesSelected() {
      return this.selectedFiles.length > 0 && !this.isAllFilesSelected;
    },
    hasMultiFolderActions() {
      if (!this.duplicate || !Array.isArray(this.duplicate.files)) {
        return false;
      }
      return this.duplicate.files.some(file => this.hasFilesInOtherFolders(file));
    },
    fileMetadataBadges() {
      if (!this.duplicate || !Array.isArray(this.duplicate.files)) {
        return [];
      }
      return annotateDuplicateMetadataBadges(this.duplicate.files);
    },
    visualGroupEvaluation() {
      if (!this.duplicate || !Array.isArray(this.duplicate.files)) {
        return evaluateResolutionWinners([]);
      }
      return evaluateResolutionWinners(this.duplicate.files, this.inspectedDimensionsByKey);
    },
    fileVisualBadges() {
      if (!this.duplicate || !Array.isArray(this.duplicate.files)) {
        return [];
      }
      return this.duplicate.files.map((file, index) => {
        const evalEntry = this.visualGroupEvaluation.perFile[index] || {};
        const exif = normalizeExifMetadata(file);
        return {
          ...evalEntry,
          exifCamera: exif.camera || '',
        };
      });
    },
    visualGroupSummaryLabel() {
      const evaluation = this.visualGroupEvaluation;
      if (!evaluation.hasDimensionData) {
        return '';
      }
      const winnerEntry = evaluation.winnerIndex >= 0
        ? evaluation.perFile[evaluation.winnerIndex]
        : evaluation.perFile.find(entry => entry && entry.dimensions);
      if (!winnerEntry || !winnerEntry.dimensions) {
        return '';
      }
      if (evaluation.hasDimensionSpread) {
        return this.t('duplicatefinder', 'Best: {dims} ({ratio})', {
          dims: winnerEntry.dimensions.formattedDimensions,
          ratio: winnerEntry.dimensions.aspectRatio,
        });
      }
      return this.t('duplicatefinder', '{dims} ({ratio})', {
        dims: winnerEntry.dimensions.formattedDimensions,
        ratio: winnerEntry.dimensions.aspectRatio,
      });
    },
    filePathSegments() {
      if (!this.duplicate || !Array.isArray(this.duplicate.files)) {
        return [];
      }
      return computePathDiffSegments(this.duplicate.files);
    },
    groupHeaderSummary() {
      const files = this.duplicate && Array.isArray(this.duplicate.files)
        ? this.duplicate.files
        : [];
      return computeGroupHeaderSummary(files);
    },
    fullGroupHash() {
      if (!this.duplicate || typeof this.duplicate.hash !== 'string') {
        return '';
      }
      return this.duplicate.hash.trim();
    },
    shortGroupHash() {
      return formatShortHash(this.fullGroupHash);
    },
    isGroupExcluded() {
      const normalized = this.fullGroupHash.toLowerCase();
      if (!normalized) {
        return false;
      }
      return Boolean(
        (this.duplicate && this.duplicate.ignoredByRule)
        || this.excludedHashesInSession.includes(normalized)
      );
    },
    groupIgnoreOptions() {
      return deriveGroupIgnoreOptions(this.duplicate);
    },
    deletionSafetyPlan() {
      const files = this.duplicate && Array.isArray(this.duplicate.files)
        ? this.duplicate.files
        : [];
      const selectedKeys = this.selectedFiles
        .map(file => getFileSelectionKey(file))
        .filter(key => key !== null);
      return evaluateDeletionPlan(files, selectedKeys);
    },
    deletionAuditPlan() {
      const files = this.duplicate && Array.isArray(this.duplicate.files)
        ? this.duplicate.files
        : [];
      const selectedKeys = this.selectedFiles
        .map(file => getFileSelectionKey(file))
        .filter(key => key !== null);
      return buildDeletionAuditPlan(files, selectedKeys);
    },
    confirmDialogPlan() {
      return this.pendingDeletePlan || this.deletionSafetyPlan;
    },
    confirmDialogAuditPlan() {
      return this.pendingDeleteAuditPlan || this.deletionAuditPlan;
    },
    isDryRunDialog() {
      return this.confirmDialogMode === 'dry-run';
    }
  },
  methods: {
    fileKey,
    isFileSelected(file) {
      return this.selectedFiles.some(selected => isSameFile(selected, file));
    },
    getGroupDisplayName(duplicate) {
      if (!duplicate || !Array.isArray(duplicate.files) || duplicate.files.length === 0) {
        return '';
      }
      const names = duplicate.files
        .map(file => (file && file.path ? file.path.split('/').pop() : ''))
        .filter(Boolean);
      if (names.length > 0 && names.every(name => name === names[0])) {
        return names[0];
      }
      if (duplicate.hash && typeof duplicate.hash === 'string') {
        return duplicate.hash.substring(0, 8);
      }
      return names[0] || '';
    },
    toggleAcknowledge() {
      if (
        !this.duplicate
        || !Array.isArray(this.duplicate.files)
        || this.duplicate.files.length <= 1
        || this.showDeleteConfirmDialog
        || this.pendingDeleteResolver
        || this.isAcknowledging
      ) {
        return false;
      }
      this.unOrAcknowledgeDuplicate(this.duplicate);
      return true;
    },
    async unOrAcknowledgeDuplicate(duplicate) {
      if (!duplicate || this.isAcknowledging) {
        return false;
      }
      const token = ++this.acknowledgeRequestToken;
      this.isAcknowledging = true;
      try {
        const updatedDuplicate = { ...duplicate };

        if (updatedDuplicate.acknowledged) {
          await unacknowledgeDuplicate(updatedDuplicate.hash);
          updatedDuplicate.acknowledged = false;
        } else {
          await acknowledgeDuplicate(updatedDuplicate.hash);
          updatedDuplicate.acknowledged = true;
        }

        if (token === this.acknowledgeRequestToken) {
          this.$emit('duplicateUpdated', updatedDuplicate);
        }
        return true;
      } catch (error) {
        console.error('Error updating duplicate acknowledgement status:', error);
        if (typeof showError === 'function') {
          showError(this.t('duplicatefinder', 'Could not update acknowledgement status'));
        }
        return false;
      } finally {
        if (token === this.acknowledgeRequestToken) {
          this.isAcknowledging = false;
        }
      }
    },
    openFileInViewer,
    getDuplicateSize(duplicate) {
      return getFormattedSizeOfCurrentDuplicate(duplicate);
    },
    removeFileFromListAndUpdate(file, result = {}) {
      console.log('DuplicateDetails: Removing file from list:', file);
      if (file && file.path) {
        this.$emit('folders-touched', [file.path]);
      }
      const bytesReclaimed = Number(file && file.size) > 0 ? Math.floor(Number(file.size)) : 0;
      const sampleLabel = file && typeof file.path === 'string' ? file.path.split('/').pop() : '';
      if (result.deletedNodeIds && result.deletedNodeIds.length > 1) {
        this.$emit('reclamation-recorded', {
          bytesReclaimed,
          filesDeleted: result.deletedNodeIds.length,
          groupsResolved: 1,
          source: 'single',
          sampleLabel
        });
        this.$emit('duplicatesSearchCompleted');
        return;
      }
      removeFileFromList(file, this.duplicate.files);
      // A file that is gone cannot stay selected for the next "Delete Selected"
      this.selectedFiles = this.selectedFiles.filter(selected => !isSameFile(selected, file));
      console.log('DuplicateDetails: Files remaining:', this.duplicate.files.length);

      const isResolved = this.duplicate.files.length <= 1;
      this.$emit('reclamation-recorded', {
        bytesReclaimed,
        filesDeleted: 1,
        groupsResolved: isResolved ? 1 : 0,
        source: 'single',
        sampleLabel
      });

      if (isResolved) {
        console.log('DuplicateDetails: Emitting duplicate-resolved event');
        this.$emit('duplicate-resolved', {
          duplicate: {
            ...this.duplicate,
            files: [...this.duplicate.files]
          },
          type: this.duplicate.acknowledged ? 'acknowledged' : 'unacknowledged'
        });
      }
    },
    previewMerge() {
      // Open the first file in the viewer
      if (this.duplicate && this.duplicate.files.length > 0) {
        openFileInViewer(this.duplicate.files[0]);
      }
    },
    toggleCompareMode() {
      if (!this.duplicate || !Array.isArray(this.duplicate.files) || this.duplicate.files.length <= 1) {
        return false;
      }
      if (this.showDeleteConfirmDialog || this.pendingDeleteResolver) {
        return false;
      }
      if (this.compareMode) {
        this.compareInitialMode = 'side-by-side';
      }
      this.compareMode = !this.compareMode;
      return true;
    },
    openVisualDiffCompare() {
      if (!this.duplicate || !Array.isArray(this.duplicate.files) || this.duplicate.files.length <= 1) {
        return false;
      }
      if (this.showDeleteConfirmDialog || this.pendingDeleteResolver) {
        return false;
      }
      this.compareInitialMode = 'diff';
      this.compareMode = true;
      return true;
    },
    closeCompareMode() {
      this.compareMode = false;
      this.compareInitialMode = 'side-by-side';
    },
    onVisualInspectionUpdated(payload) {
      if (payload && payload.dimensionsByKey && typeof payload.dimensionsByKey === 'object') {
        this.inspectedDimensionsByKey = { ...payload.dimensionsByKey };
      }
    },
    applyLowerResSelection(keys) {
      if (!this.duplicate || !Array.isArray(this.duplicate.files) || !Array.isArray(keys)) {
        return;
      }
      const keySet = new Set(keys);
      this.activeKeepRule = 'highest_resolution';
      this.selectedFiles = this.duplicate.files.filter(file => {
        const key = getFileSelectionKey(file);
        return key !== null && keySet.has(key) && !file.isInOriginFolder;
      });
    },
    applyBestResolutionKeep() {
      if (!this.duplicate || !Array.isArray(this.duplicate.files)) {
        return;
      }
      const keys = selectLowerResolutionKeys(this.duplicate.files, this.inspectedDimensionsByKey);
      this.applyLowerResSelection(keys);
    },
    toggleFileSelection(file) {
      if (!file || file.isInOriginFolder) {
        return false;
      }
      this.activeKeepRule = null;
      if (this.isFileSelected(file)) {
        this.selectedFiles = this.selectedFiles.filter(selected => !isSameFile(selected, file));
      } else {
        this.selectedFiles = [...this.selectedFiles, file];
      }
      return true;
    },

    async executeSelectedDeletion(plan) {
      // Only an explicit confirmation on a full-group plan lets the server delete the last copy
      const allowLastCopy = Boolean(plan && plan.wouldDeleteAllCopies);
      const { success, deletedNodeIds = [] } = await deleteFiles(this.selectedFiles, { allowLastCopy });
      if (success.length > 0) {
        this.$emit('folders-touched', success.map(file => file && file.path).filter(Boolean));
        const bytesReclaimed = success.reduce(
          (sum, item) => sum + (Number(item && item.size) > 0 ? Math.floor(Number(item.size)) : 0),
          0
        );
        const sampleLabel = this.getGroupDisplayName(this.duplicate);
        if (deletedNodeIds.length > 1) {
          this.$emit('reclamation-recorded', {
            bytesReclaimed,
            filesDeleted: success.length,
            groupsResolved: 1,
            source: 'group',
            sampleLabel
          });
          this.$emit('duplicatesSearchCompleted');
          return;
        }
        removeFilesFromList(success, this.duplicate.files);
        this.selectedFiles = this.selectedFiles.filter(file => !success.includes(file));

        const isResolved = this.duplicate.files.length <= 1;
        this.$emit('reclamation-recorded', {
          bytesReclaimed,
          filesDeleted: success.length,
          groupsResolved: isResolved ? 1 : 0,
          source: 'group',
          sampleLabel
        });

        if (isResolved) {
          this.$emit('duplicate-resolved', {
            duplicate: this.duplicate,
            type: this.duplicate.acknowledged ? 'acknowledged' : 'unacknowledged'
          });
        }
      }
    },
    async openDryRunAuditDialog() {
      try {
        if (!this.duplicate || !Array.isArray(this.duplicate.files) || this.selectedFiles.length === 0) {
          return false;
        }
        const plan = this.deletionSafetyPlan;
        const auditPlan = this.deletionAuditPlan;
        const confirmDelete = await this.requestDeleteConfirmation(plan, {
          mode: 'dry-run',
          auditPlan,
        });
        if (!confirmDelete) {
          return false;
        }
        if (plan.includesProtectedOrigin || this.selectedFiles.some(file => file && file.isInOriginFolder)) {
          this.$emit('showError', this.t('duplicatefinder', 'Cannot delete protected files'));
          return false;
        }
        await this.executeSelectedDeletion(plan);
        return true;
      } catch (error) {
        console.error('Error executing deletion from dry-run plan:', error);
        return false;
      }
    },
    async deleteSelectedDuplicates() {
      try {
        if (!this.duplicate || !Array.isArray(this.duplicate.files) || this.selectedFiles.length === 0) {
          return;
        }
        const plan = this.deletionSafetyPlan;
        const auditPlan = this.deletionAuditPlan;
        // Verify whether protected files are selected
        if (plan.includesProtectedOrigin || this.selectedFiles.some(file => file && file.isInOriginFolder)) {
          this.$emit('showError', this.t('duplicatefinder', 'Cannot delete protected files'));
          return;
        }

        const confirmDelete = await this.requestDeleteConfirmation(plan, {
          mode: 'confirm',
          auditPlan,
        });
        if (!confirmDelete) {
          return;
        }
        await this.executeSelectedDeletion(plan);
      } catch (error) {
        console.error('Error deleting selected files:', error);
      }
    },
    requestDeleteConfirmation(plan, options = {}) {
      if (this.pendingDeleteResolver) {
        this.pendingDeleteResolver(false);
      }
      this.resetPlanExportFeedback();
      this.confirmDialogMode = options.mode === 'dry-run' ? 'dry-run' : 'confirm';
      this.pendingDeletePlan = plan || this.deletionSafetyPlan;
      this.pendingDeleteAuditPlan = options.auditPlan || this.deletionAuditPlan;
      this.showDeleteConfirmDialog = true;
      this.$nextTick(() => {
        const dialog = this.$refs.deleteConfirmDialog;
        if (!dialog) {
          return;
        }
        if (typeof dialog.showModal === 'function') {
          if (!dialog.open) {
            dialog.showModal();
          }
        } else {
          dialog.setAttribute('open', '');
        }
        const cancelButton = dialog.querySelector('.nc-confirm-dialog__button--cancel');
        if (cancelButton && typeof cancelButton.focus === 'function') {
          cancelButton.focus();
        }
      });
      return new Promise(resolve => {
        this.pendingDeleteResolver = resolve;
      });
    },
    resolveDeleteConfirm(confirmed) {
      const dialog = this.$refs.deleteConfirmDialog;
      if (dialog && typeof dialog.close === 'function' && dialog.open) {
        dialog.close();
      }
      this.showDeleteConfirmDialog = false;
      this.confirmDialogMode = 'confirm';
      this.pendingDeletePlan = null;
      this.pendingDeleteAuditPlan = null;
      this.resetPlanExportFeedback();
      const resolver = this.pendingDeleteResolver;
      this.pendingDeleteResolver = null;
      if (typeof resolver === 'function') {
        resolver(Boolean(confirmed));
      }
    },
    resetPlanExportFeedback() {
      if (this.planExportTimer) {
        clearTimeout(this.planExportTimer);
        this.planExportTimer = null;
      }
      this.planExportStatus = 'idle';
      this.planExportMessage = '';
    },
    exportCurrentDeletionPlan() {
      const auditPlan = this.confirmDialogAuditPlan;
      if (!auditPlan || auditPlan.selectedCount === 0) {
        return false;
      }
      this.resetPlanExportFeedback();
      const shortHash = this.shortGroupHash || 'group';
      const filename = `deletion-plan-${shortHash}.json`;
      const ok = downloadDeletionPlanJson(this.duplicate, auditPlan, filename);
      if (ok) {
        this.planExportStatus = 'exported';
        this.planExportMessage = this.t('duplicatefinder', 'Plan exported');
      } else {
        this.planExportStatus = 'error';
        this.planExportMessage = this.t('duplicatefinder', 'Export failed');
      }
      this.planExportTimer = setTimeout(() => {
        this.planExportStatus = 'idle';
        this.planExportMessage = '';
        this.planExportTimer = null;
      }, 2500);
      return ok;
    },
    applyKeepRule(rule) {
      if (!this.duplicate || !Array.isArray(this.duplicate.files) || this.duplicate.files.length <= 1) {
        return false;
      }
      if (this.showDeleteConfirmDialog || this.pendingDeleteResolver) {
        return false;
      }
      if (this.selectableFiles.length === 0) {
        return false;
      }
      const targetKeys = new Set(selectDuplicatesByKeepRule(this.duplicate.files, rule));
      this.selectedFiles = this.duplicate.files.filter(file => {
        if (!file || file.isInOriginFolder) {
          return false;
        }
        const key = getFileSelectionKey(file);
        return key !== null && targetKeys.has(key);
      });
      this.activeKeepRule = rule;
      return true;
    },
    selectAllFiles() {
      if (!this.duplicate || !Array.isArray(this.duplicate.files) || this.duplicate.files.length <= 1) {
        return false;
      }
      if (this.showDeleteConfirmDialog || this.pendingDeleteResolver) {
        return false;
      }
      if (this.defaultSelectAllTargetFiles.length === 0) {
        this.selectedFiles = [];
        this.activeKeepRule = null;
        return false;
      }
      this.activeKeepRule = null;
      if (this.isAllFilesSelected) {
        this.selectedFiles = [];
      } else {
        this.selectedFiles = [...this.defaultSelectAllTargetFiles];
      }
      return true;
    },
    clearSelection(options = {}) {
      if (this.showDeleteConfirmDialog || this.pendingDeleteResolver) {
        return false;
      }
      const shouldRestoreFocus = Boolean(
        options && options.restoreFocus
        && typeof document !== 'undefined'
        && this.$refs.clearSelectionButton
        && document.activeElement === this.$refs.clearSelectionButton
      );
      this.selectedFiles = [];
      this.activeKeepRule = null;
      if (shouldRestoreFocus) {
        this.$nextTick(() => {
          const selectAllBtn = this.$el && typeof this.$el.querySelector === 'function'
            ? this.$el.querySelector('.select-all-button')
            : null;
          if (selectAllBtn && typeof selectAllBtn.focus === 'function') {
            selectAllBtn.focus();
          }
        });
      }
      return true;
    },
    onDetailsEscape(event) {
      if (
        !this.duplicate
        || !Array.isArray(this.duplicate.files)
        || this.duplicate.files.length <= 1
        || this.showDeleteConfirmDialog
        || this.pendingDeleteResolver
        || this.showDropdown
      ) {
        return;
      }
      if (typeof document !== 'undefined' && typeof document.querySelector === 'function') {
        const hasOpenDialogOrMenu = document.querySelector(
          'dialog[open], [role="dialog"]:not([aria-hidden="true"]), [role="alertdialog"]:not([aria-hidden="true"]), [aria-modal="true"]:not([aria-hidden="true"]), [role="menu"]:not([aria-hidden="true"]), [role="listbox"]:not([aria-hidden="true"])'
        );
        if (hasOpenDialogOrMenu) {
          return;
        }
      }
      if (event && event.defaultPrevented) {
        return;
      }
      if (this.selectedFiles.length > 0) {
        if (event && typeof event.preventDefault === 'function') {
          event.preventDefault();
        }
        this.clearSelection();
      }
    },
    toggleSelectAllFromHeader() {
      if (this.defaultSelectAllTargetFiles.length === 0) {
        return;
      }
      this.selectAllFiles();
    },
    hasFilesInOtherFolders(targetFile) {
      if (!this.duplicate || !Array.isArray(this.duplicate.files) || !targetFile) {
        return false;
      }
      const keptFolder = getParentFolderPath(targetFile.path);
      return this.duplicate.files.some(
        file => !file.isInOriginFolder && getParentFolderPath(file.path) !== keptFolder
      );
    },
    selectDuplicatesOutsideFolder(targetFile) {
      if (!this.duplicate || !Array.isArray(this.duplicate.files) || !targetFile) {
        return;
      }
      this.activeKeepRule = null;
      const keptFolder = getParentFolderPath(targetFile.path);
      this.selectedFiles = this.duplicate.files.filter(
        file => !file.isInOriginFolder && getParentFolderPath(file.path) !== keptFolder
      );
    },
    removeDuplicateFromList(duplicate) {
      this.$emit('removeDuplicate', duplicate);
    },
    toggleDropdown() {
      this.showDropdown = !this.showDropdown;
    },
    resetHashCopyFeedback() {
      if (this.hashCopyResetTimer) {
        clearTimeout(this.hashCopyResetTimer);
        this.hashCopyResetTimer = null;
      }
      this.hashCopyStatus = 'idle';
      this.hashCopyStatusMessage = '';
    },
    async copyGroupHash() {
      const targetHash = this.fullGroupHash;
      if (!targetHash) {
        return false;
      }
      this.resetHashCopyFeedback();
      const copied = await copyTextSafely(targetHash);
      if (copied) {
        this.hashCopyStatus = 'copied';
        this.hashCopyStatusMessage = this.t('duplicatefinder', 'Copied');
      } else {
        this.hashCopyStatus = 'error';
        this.hashCopyStatusMessage = this.t('duplicatefinder', 'Copy failed');
      }
      this.hashCopyResetTimer = setTimeout(() => {
        this.hashCopyStatus = 'idle';
        this.hashCopyStatusMessage = '';
        this.hashCopyResetTimer = null;
      }, 2000);
      return copied;
    },
    copyFileHash() {
      if (this.duplicate && this.duplicate.files.length > 0) {
        const hash = this.duplicate.hash;
        navigator.clipboard.writeText(hash).then(() => {
          showSuccess(t('duplicatefinder', 'File hash copied to clipboard'));
          this.showDropdown = false;
        });
      }
    },
    resetIgnoreActionFeedback() {
      if (this.ignoreActionTimer) {
        clearTimeout(this.ignoreActionTimer);
        this.ignoreActionTimer = null;
      }
      this.ignoreActionStatus = 'idle';
      this.ignoreActionMessage = '';
    },
    setIgnoreActionFeedback(status, message) {
      this.resetIgnoreActionFeedback();
      this.ignoreActionStatus = status;
      this.ignoreActionMessage = message;
      this.ignoreActionTimer = setTimeout(() => {
        this.ignoreActionStatus = 'idle';
        this.ignoreActionMessage = '';
        this.ignoreActionTimer = null;
      }, 4500);
    },
    isPatternIgnored(pattern) {
      return typeof pattern === 'string' && this.ignoredPatternsInSession.includes(pattern.trim());
    },
    isFolderExcluded(folderPath) {
      return typeof folderPath === 'string' && this.excludedFoldersInSession.includes(folderPath.trim());
    },
    openIgnoreRulesSettings() {
      this.showDropdown = false;
      this.openSettings();
    },
    async excludeGroupAsFalsePositive() {
      const targetHash = this.fullGroupHash;
      if (!targetHash || this.isIgnoringRule || this.isGroupExcluded) {
        return false;
      }
      this.isIgnoringRule = true;
      this.showDropdown = false;
      try {
        if (typeof saveFilter === 'function') {
          await saveFilter({ type: 'hash', value: targetHash.toLowerCase() });
        }
        const normalizedHash = targetHash.toLowerCase();
        if (!this.excludedHashesInSession.includes(normalizedHash)) {
          this.excludedHashesInSession = [...this.excludedHashesInSession, normalizedHash];
        }
        const displayHash = this.shortGroupHash || targetHash;
        if (this.duplicate && !this.duplicate.acknowledged && typeof acknowledgeDuplicate === 'function') {
          await acknowledgeDuplicate(this.duplicate.hash);
          this.$emit('duplicateUpdated', {
            ...this.duplicate,
            acknowledged: true,
            ignoredByRule: true
          });
        }
        this.setIgnoreActionFeedback(
          'success',
          this.t('duplicatefinder', 'Marked as false positive. Hash {hash} excluded from future scans.', { hash: displayHash })
        );
        return true;
      } catch (error) {
        console.error('Error excluding duplicate hash:', error);
        this.setIgnoreActionFeedback(
          'error',
          this.t('duplicatefinder', 'Could not exclude group hash.')
        );
        return false;
      } finally {
        this.isIgnoringRule = false;
      }
    },
    async ignorePatternRule(pattern) {
      const trimmed = typeof pattern === 'string' ? pattern.trim() : '';
      if (!trimmed || this.isIgnoringRule || this.isPatternIgnored(trimmed)) {
        return false;
      }
      this.isIgnoringRule = true;
      this.showDropdown = false;
      try {
        if (typeof saveFilter === 'function') {
          await saveFilter({ type: 'name', value: trimmed });
        }
        this.ignoredPatternsInSession = [...this.ignoredPatternsInSession, trimmed];
        this.setIgnoreActionFeedback(
          'success',
          this.t('duplicatefinder', 'Rule "{pattern}" added to Ignore Rules.', { pattern: trimmed })
        );
        return true;
      } catch (error) {
        console.error('Error saving filename ignore rule:', error);
        this.setIgnoreActionFeedback(
          'error',
          this.t('duplicatefinder', 'Could not save filename ignore rule.')
        );
        return false;
      } finally {
        this.isIgnoringRule = false;
      }
    },
    async excludeFolderRule(folderPath) {
      const trimmed = typeof folderPath === 'string' ? folderPath.trim() : '';
      if (!trimmed || trimmed === '/' || this.isIgnoringRule || this.isFolderExcluded(trimmed)) {
        return false;
      }
      this.isIgnoringRule = true;
      this.showDropdown = false;
      try {
        if (typeof saveExcludedFolder === 'function') {
          await saveExcludedFolder(trimmed);
        }
        this.excludedFoldersInSession = [...this.excludedFoldersInSession, trimmed];
        this.setIgnoreActionFeedback(
          'success',
          this.t('duplicatefinder', 'Folder "{folder}" added to Excluded Folders.', { folder: trimmed })
        );
        return true;
      } catch (error) {
        console.error('Error excluding folder:', error);
        this.setIgnoreActionFeedback(
          'error',
          this.t('duplicatefinder', 'Could not exclude folder.')
        );
        return false;
      } finally {
        this.isIgnoringRule = false;
      }
    },
    openSettings() {
      this.$emit('openSettings');
    },
    async findDuplicates() {
      if (this.$listeners && this.$listeners.startScan) {
        this.$emit('startScan');
        return;
      }
      try {
        showSuccess(t('duplicatefinder', 'Duplicates search initiated (this may take a while)'));
        await apiFindDuplicates();
        showSuccess(t('duplicatefinder', 'All duplicates found'));
        this.$emit('duplicatesSearchCompleted');
      } catch (error) {
        console.error('Error finding duplicates:', error);
        showError(t('duplicatefinder', 'Could not initiate duplicate search'));
      }
    }
  }
}
</script>

<style scoped>
.duplicate-details-container {
  padding: 20px 24px 32px;
  box-sizing: border-box;
}

.details-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 14px;
}

.details-group-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-main-text);
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.details-header-pills {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.group-status-pill {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.group-status-pill.is-acknowledged {
  background-color: rgba(46, 125, 50, 0.16);
  color: #4caf50;
  border: 1px solid rgba(76, 175, 80, 0.35);
}

.group-status-pill.is-excluded {
  background-color: rgba(183, 28, 28, 0.12);
  color: #b71c1c;
  border: 1px solid rgba(183, 28, 28, 0.35);
}

.group-status-pill.is-unacknowledged {
  background-color: var(--color-background-dark);
  color: var(--color-text-maxcontrast);
  border: 1px solid var(--color-border-dark, var(--color-border));
}

.group-header-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  inline-size: 100%;
  max-inline-size: 100%;
  margin-block-start: 0;
  margin-block-end: 14px;
  padding-block: 8px;
  padding-inline: 12px;
  border-radius: var(--border-radius-large, 8px);
  border: 1px solid var(--color-border-dark, var(--color-border));
  background-color: var(--color-main-background);
  box-sizing: border-box;
}

.group-header-summary__item {
  display: inline-flex;
  align-items: center;
  min-block-size: 26px;
  max-inline-size: 100%;
  padding-block: 3px;
  padding-inline: 10px;
  border-radius: 999px;
  border: 1px solid var(--color-border-dark, var(--color-border));
  background-color: var(--color-background-hover);
  color: var(--color-main-text);
  font-size: 0.82rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1.3;
  overflow-wrap: anywhere;
  box-sizing: border-box;
}

.group-header-summary__item--reclaimable {
  background-color: rgba(46, 125, 50, 0.14);
  border-color: rgba(46, 125, 50, 0.48);
  color: var(--color-main-text);
}

.group-header-summary__item--protected {
  background-color: var(--color-primary-element-light, #e5eff5);
  border-color: var(--color-primary-element, #00679e);
  color: var(--color-primary-element-light-text, var(--color-main-text, #222222));
}

.group-header-summary__hash-control {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  max-inline-size: 100%;
  margin-inline-start: auto;
}

.group-header-summary__copy-hash-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-inline-size: 44px;
  min-block-size: 44px;
  max-inline-size: 100%;
  padding-block: 6px;
  padding-inline: 12px;
  border-radius: var(--border-radius-large, 8px);
  border: 1px solid var(--color-border-maxcontrast, var(--color-border-dark));
  background-color: var(--color-background-hover);
  color: var(--color-main-text);
  font-size: 0.8rem;
  font-weight: 600;
  line-height: 1.2;
  cursor: pointer;
  overflow-wrap: anywhere;
  box-sizing: border-box;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.group-header-summary__copy-hash-button svg {
  display: block;
  flex-shrink: 0;
  pointer-events: none;
}

.group-header-summary__copy-hash-button:hover:not(:disabled) {
  background-color: var(--color-background-dark);
  border-color: var(--color-primary-element, #0082c9);
  color: var(--color-primary-element, #0082c9);
}

.group-header-summary__copy-hash-button:focus-visible {
  outline: 2px solid var(--color-primary-element, #0082c9);
  outline-offset: 2px;
}

.group-header-summary__copy-hash-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.group-header-summary__copy-hash-button.is-copied {
  border-color: var(--color-element-success, #2e7d32);
  background-color: var(--color-background-dark);
}

.group-header-summary__copy-hash-button.is-error {
  border-color: var(--color-element-error, #d32f2f);
}

.group-header-summary__hash-code {
  padding-block: 1px;
  padding-inline: 6px;
  border-radius: 4px;
  background-color: var(--color-background-dark);
  color: var(--color-text-maxcontrast, var(--color-main-text));
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.76rem;
  font-weight: 500;
  overflow-wrap: anywhere;
}

.group-header-summary__copy-status {
  display: inline-flex;
  align-items: center;
  font-size: 0.78rem;
  font-weight: 600;
  line-height: 1.2;
  border-radius: 999px;
  max-inline-size: 100%;
  overflow-wrap: anywhere;
  box-sizing: border-box;
}

.group-header-summary__copy-status.is-visible {
  padding-block: 4px;
  padding-inline: 10px;
}

.group-header-summary__copy-status.is-copied {
  background-color: rgba(46, 125, 50, 0.14);
  border: 1px solid rgba(46, 125, 50, 0.48);
  color: var(--color-main-text);
}

.group-header-summary__copy-status.is-error {
  background-color: rgba(211, 47, 47, 0.14);
  border: 1px solid rgba(211, 47, 47, 0.48);
  color: var(--color-main-text);
}

.summary-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 14px;
  margin-bottom: 16px;
  padding: 14px 18px;
  border-radius: var(--border-radius-large, 10px);
  border: 1px solid var(--color-border-dark, var(--color-border));
  background-color: var(--color-background-hover);
}

.summary-info {
  flex: 1 1 260px;
  min-width: 0;
}

.summary-text {
  margin: 0;
  font-size: 0.96rem;
  font-weight: 600;
  color: var(--color-main-text);
  line-height: 1.4;
}

.summary-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.keep-rules-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  inline-size: 100%;
  padding-block-start: 10px;
  border-block-start: 1px solid var(--color-border);
  box-sizing: border-box;
}

.keep-rules-label {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--color-text-maxcontrast);
  margin-inline-end: 4px;
}

.keep-rule-button {
  min-block-size: 44px;
  min-inline-size: 44px;
}

.keep-rule-button:hover:not(:disabled),
.keep-rule-button:focus-visible:not(:disabled) {
  background-color: var(--color-background-dark);
  border-color: var(--color-primary-element, #0082c9);
}

.keep-rule-button.is-active:not(:disabled) {
  background-color: var(--color-primary-element-light);
  border-color: var(--color-primary-element, #0082c9);
  color: var(--color-primary-element, #0082c9);
}

.deletion-safety-bar {
  inline-size: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  box-sizing: border-box;
}

.deletion-safety-summary {
  flex: 1 1 260px;
  min-inline-size: 0;
  box-sizing: border-box;
  padding-block: 10px;
  padding-inline: 14px;
  border-radius: var(--border-radius-large, 8px);
  border: 1px solid var(--color-border-dark, var(--color-border));
  background-color: var(--color-main-background);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.deletion-safety-summary.is-safe {
  border-inline-start: 4px solid var(--color-primary-element, #0082c9);
}

.deletion-safety-summary.is-danger {
  border-color: #d32f2f;
  border-inline-start: 4px solid #d32f2f;
  background-color: rgba(211, 47, 47, 0.1);
}

.deletion-safety-summary__text {
  margin: 0;
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--color-main-text);
  line-height: 1.4;
}

.deletion-safety-summary__warning {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 700;
  color: #b71c1c;
  line-height: 1.4;
}

.deletion-safety-bar__actions {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  max-inline-size: 100%;
  box-sizing: border-box;
}

.deletion-safety-bar__actions .review-deletion-plan-button,
.deletion-safety-bar__actions .clear-selection-button {
  min-block-size: 44px;
  min-inline-size: 44px;
  max-inline-size: 100%;
  flex-shrink: 0;
}

.deletion-safety-bar__actions .review-deletion-plan-button:hover:not(:disabled),
.deletion-safety-bar__actions .review-deletion-plan-button:focus-visible:not(:disabled),
.deletion-safety-bar__actions .clear-selection-button:hover:not(:disabled),
.deletion-safety-bar__actions .clear-selection-button:focus-visible:not(:disabled) {
  background-color: var(--color-background-dark);
  border-color: var(--color-primary-element, #0082c9);
}

.deletion-safety-bar__actions .review-deletion-plan-button:focus-visible,
.deletion-safety-bar__actions .clear-selection-button:focus-visible {
  outline: 2px solid var(--color-primary-element, #0082c9);
  outline-offset: 2px;
}

.toolbar-button {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 6px;
  min-height: 34px;
  margin: 0 !important;
  padding: 6px 13px !important;
  border-radius: var(--border-radius-large, 8px);
  border: 1px solid var(--color-border-maxcontrast, var(--color-border-dark));
  background-color: var(--color-main-background);
  color: var(--color-main-text);
  font-size: 0.86rem;
  font-weight: 600;
  line-height: 1.2 !important;
  text-decoration: none;
  cursor: pointer;
  white-space: nowrap;
  box-sizing: border-box;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, opacity 0.15s ease;
}

.toolbar-button > *,
.toolbar-button svg,
.toolbar-button span {
  pointer-events: none;
}

.toolbar-button svg {
  display: block !important;
  flex-shrink: 0;
}

.select-all-button:hover:not(:disabled),
.select-all-button:focus-visible:not(:disabled),
.preview-button:hover:not(:disabled),
.preview-button:focus-visible:not(:disabled),
.compare-toggle-button:hover:not(:disabled),
.compare-toggle-button:focus-visible:not(:disabled),
.false-positive-button:hover:not(:disabled),
.false-positive-button:focus-visible:not(:disabled) {
  background-color: var(--color-background-dark);
  border-color: var(--color-primary-element, #ffffff);
}

.false-positive-button.is-excluded {
  border-color: rgba(183, 28, 28, 0.45);
  background-color: rgba(183, 28, 28, 0.1);
  color: var(--color-main-text);
}

.ignore-rule-banner {
  inline-size: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  padding-block: 8px;
  padding-inline: 12px;
  border-radius: var(--border-radius-large, 8px);
  border: 1px solid rgba(46, 125, 50, 0.45);
  background-color: rgba(46, 125, 50, 0.12);
  color: var(--color-main-text);
  font-size: 0.86rem;
  font-weight: 600;
  box-sizing: border-box;
}

.ignore-rule-banner.is-error {
  border-color: rgba(211, 47, 47, 0.5);
  background-color: rgba(211, 47, 47, 0.12);
}

.ignore-rule-banner__text {
  overflow-wrap: anywhere;
}

.ignore-rule-banner__link {
  min-block-size: 36px;
  padding-block: 4px;
  padding-inline: 10px;
  border-radius: 6px;
  border: 1px solid var(--color-border-maxcontrast, var(--color-border-dark));
  background-color: var(--color-main-background);
  color: var(--color-main-text);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
}

.ignore-rule-banner__link:hover,
.ignore-rule-banner__link:focus-visible {
  border-color: var(--color-primary-element, #0082c9);
  outline: 2px solid var(--color-primary-element, #0082c9);
  outline-offset: 1px;
}

.compare-toggle-button.is-active:not(:disabled) {
  background-color: var(--color-primary-element-light);
  border-color: var(--color-primary-element, #0082c9);
  color: var(--color-primary-element, #0082c9);
}

.delete-selected-button {
  background-color: #d32f2f;
  border-color: #d32f2f;
  color: #ffffff;
}

.delete-selected-button:hover:not(:disabled),
.delete-selected-button:focus-visible:not(:disabled) {
  background-color: #c62828;
  border-color: var(--color-primary-element, #ffffff);
  color: #ffffff;
}

.acknowledge-link {
  background-color: #2e7d32;
  border-color: #2e7d32;
  color: #ffffff !important;
}

.acknowledge-link:hover:not(:disabled),
.acknowledge-link:focus-visible:not(:disabled) {
  background-color: #256b29;
  border-color: var(--color-primary-element, #ffffff);
  color: #ffffff !important;
}

.acknowledge-link.is-acknowledged {
  background-color: var(--color-main-background);
  border-color: var(--color-border-maxcontrast, var(--color-border-dark));
  color: var(--color-main-text) !important;
}

.acknowledge-link.is-acknowledged:hover:not(:disabled),
.acknowledge-link.is-acknowledged:focus-visible:not(:disabled) {
  background-color: var(--color-background-dark);
  border-color: var(--color-primary-element, #ffffff);
}

.files-card {
  border: 1px solid var(--color-border-dark, var(--color-border));
  border-radius: var(--border-radius-large, 10px);
  background-color: var(--color-main-background);
  overflow: visible;
}

.files-table-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 16px;
  background-color: var(--color-background-hover);
  border-bottom: 1px solid var(--color-border-dark, var(--color-border));
  border-top-left-radius: 9px;
  border-top-right-radius: 9px;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-text-maxcontrast);
  text-transform: none;
  user-select: none;
  cursor: default;
}

.col-checkbox {
  width: 18px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer !important;
  user-select: none;
}

.col-preview {
  width: 92px;
  flex-shrink: 0;
  padding-inline-start: 12px;
  border-inline-start: 1px solid var(--color-border);
  text-align: start;
  box-sizing: border-box;
}

.col-name {
  flex: 1 1 220px;
  min-width: 0;
  padding-inline-start: 12px;
  border-inline-start: 1px solid var(--color-border);
  text-align: start;
  box-sizing: border-box;
}

.col-size {
  width: 108px;
  flex-shrink: 0;
  padding-inline-start: 12px;
  border-inline-start: 1px solid var(--color-border);
  text-align: start;
  box-sizing: border-box;
}

.col-status {
  width: 118px;
  flex-shrink: 0;
  padding-inline-start: 12px;
  border-inline-start: 1px solid var(--color-border);
  text-align: start;
  box-sizing: border-box;
}

.col-actions {
  width: 172px;
  flex-shrink: 0;
  padding-inline-start: 12px;
  border-inline-start: 1px solid var(--color-border);
  text-align: start;
  box-sizing: border-box;
}

.files-card.is-compact-actions .col-actions {
  width: 130px;
}

.file-display {
  width: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
  background-color: var(--color-main-background);
  transition: background-color 0.15s ease;
  position: relative;
}

.file-display:last-child {
  border-bottom: none;
  border-bottom-left-radius: 9px;
  border-bottom-right-radius: 9px;
}

.file-display:hover {
  background-color: var(--color-background-hover);
}

.file-display.is-selected {
  background-color: var(--color-primary-element-light);
  border-inline-start: 3px solid #d32f2f;
}

.file-display.is-keeping {
  border-inline-start: 3px solid var(--color-element-success, #2e7d32);
}

.file-row-checkbox,
.file-header-checkbox {
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

.file-row-checkbox:hover:not(:disabled),
.file-header-checkbox:hover:not(:disabled) {
  border-color: var(--color-primary-element, #0082c9) !important;
  box-shadow: none !important;
  outline: none !important;
  cursor: pointer !important;
}

.file-row-checkbox:focus,
.file-header-checkbox:focus {
  outline: none !important;
  box-shadow: none !important;
}

.file-row-checkbox:focus-visible,
.file-header-checkbox:focus-visible {
  outline: 2px solid var(--color-primary-element, #0082c9) !important;
  outline-offset: 2px;
}

.file-row-checkbox:checked,
.file-header-checkbox:checked {
  background-color: var(--color-primary-element, #0082c9) !important;
  border-color: var(--color-primary-element, #0082c9) !important;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'/%3E%3C/svg%3E") !important;
  background-size: 12px 12px !important;
  background-position: center !important;
  background-repeat: no-repeat !important;
}

.file-row-checkbox:indeterminate,
.file-header-checkbox:indeterminate {
  background-color: var(--color-primary-element, #0082c9) !important;
  border-color: var(--color-primary-element, #0082c9) !important;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-width='3.5' stroke-linecap='round'%3E%3Cline x1='5' y1='12' x2='19' y2='12'/%3E%3C/svg%3E") !important;
  background-size: 12px 12px !important;
  background-position: center !important;
  background-repeat: no-repeat !important;
}

.has-tooltip {
  position: relative;
}

.has-tooltip[data-tooltip]::after,
.file-display ::v-deep [data-tooltip]::after {
  content: attr(data-tooltip);
  position: absolute;
  bottom: calc(100% + 7px);
  inset-inline-end: 0;
  padding: 5px 9px;
  border-radius: 6px;
  background-color: #1f2328;
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.16);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.32);
  font-size: 0.76rem;
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transform: translateY(3px);
  transition: opacity 0.12s ease, transform 0.12s ease;
  z-index: 2100;
}

.has-tooltip[data-tooltip]:hover::after,
.has-tooltip[data-tooltip]:focus-visible::after,
.file-display ::v-deep [data-tooltip]:hover::after,
.file-display ::v-deep [data-tooltip]:focus-visible::after {
  opacity: 1;
  transform: translateY(0);
}

@media (max-width: 800px) {
  .duplicate-details-container {
    padding: 14px 12px 24px;
  }

  .summary-actions {
    width: 100%;
  }

  .toolbar-button,
  .dropdown-menu button,
  .action-buttons button,
  .nc-confirm-dialog__button {
    min-height: 44px;
  }

  .dropdown-toggle {
    min-width: 44px;
    min-height: 44px;
  }

  .ignore-rule-banner__link {
    min-block-size: 44px;
  }

  .action-buttons {
    flex-wrap: wrap;
  }

  .files-table-header {
    display: none;
  }

  .file-display {
    flex-direction: column;
    align-items: flex-start;
  }
}

.loading-overlay {
  position: absolute;
  top: 0;
  inset-inline-start: 0;
  width: 100%;
  height: 100%;
  background: rgba(255, 255, 255, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.5s;
}

.fade-enter, .fade-leave-to {
  opacity: 0;
}

input[type="checkbox"]:disabled {
  opacity: 0.45;
  cursor: not-allowed !important;
}

button:disabled,
button:disabled *,
.toolbar-button:disabled,
.toolbar-button:disabled * {
  opacity: 0.45;
  cursor: not-allowed !important;
}

.toolbar-button:disabled * {
  opacity: 1;
}

.dropdown {
  position: relative;
  display: inline-block;
}

.dropdown-toggle {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 34px;
  height: 34px;
  min-width: 34px;
  min-height: 34px;
  margin: 0 !important;
  padding: 0 !important;
  line-height: 1 !important;
  background: var(--color-main-background);
  border: 1px solid var(--color-border-maxcontrast, var(--color-border-dark));
  border-radius: var(--border-radius-large, 8px);
  cursor: pointer;
  box-sizing: border-box;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.dropdown-toggle:hover,
.dropdown-toggle:focus-visible {
  background-color: var(--color-background-dark);
  border-color: var(--color-primary-element, #ffffff);
}

.toolbar-button:focus-visible,
.dropdown-toggle:focus-visible,
.dropdown-menu button:focus-visible,
.action-buttons button:focus-visible,
.nc-confirm-dialog__button:focus-visible {
  outline: 2px solid var(--color-primary-element, #0082c9);
  outline-offset: 2px;
}

.arrow-down {
  display: block;
  width: 0;
  height: 0;
  margin: auto !important;
  border-inline-start: 5px solid transparent;
  border-inline-end: 5px solid transparent;
  border-top: 6px solid var(--color-main-text);
  pointer-events: none;
}

.dropdown-menu {
  position: absolute;
  inset-inline-end: 0;
  top: calc(100% + 4px);
  background-color: var(--color-main-background, #ffffff);
  background-image: linear-gradient(var(--color-main-background, #ffffff), var(--color-main-background, #ffffff)), linear-gradient(#22262c, #22262c);
  border: 1px solid var(--color-border-dark, var(--color-border));
  border-radius: var(--border-radius-large, 8px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
  z-index: 2000;
  min-width: 220px;
  max-inline-size: min(320px, calc(100vw - 24px));
  overflow: hidden;
}

.dropdown-menu button {
  display: block;
  width: 100%;
  padding: 9px 14px;
  text-align: start;
  background: none;
  border: none;
  color: var(--color-main-text);
  font-size: 0.88rem;
  cursor: pointer;
  overflow-wrap: anywhere;
}

.dropdown-menu button:hover:not(:disabled) {
  background: var(--color-background-hover);
}

.dropdown-menu-divider {
  border-block-start: 1px solid var(--color-border);
  margin-block: 4px;
}

@media (max-width: 800px) {
  .dropdown-toggle {
    width: 44px;
    height: 44px;
    min-width: 44px;
    min-height: 44px;
  }

  .dropdown-menu {
    position: fixed;
    inset-inline: 12px;
    top: auto;
    bottom: 12px;
    min-width: 0;
    max-inline-size: calc(100vw - 24px);
    max-block-size: 70vh;
    overflow-y: auto;
  }
}

.emptycontent {
  text-align: center;
  margin-top: 50px;
}

.emptycontent p {
  margin: 15px 0;
  color: var(--color-text-maxcontrast);
}

.action-buttons {
  margin-top: 20px;
  display: flex;
  justify-content: center;
  gap: 10px;
}

.action-buttons button {
  padding: 8px 16px;
  border-radius: var(--border-radius);
  border: 1px solid var(--color-border);
  background: var(--color-background-dark);
  cursor: pointer;
  transition: background 0.2s ease;
}

.action-buttons button:hover {
  background: var(--color-background-hover);
}

.action-buttons button.primary {
  background: var(--color-primary);
  color: var(--color-primary-text);
  border-color: var(--color-primary-element);
}

.action-buttons button.primary:hover {
  background: var(--color-primary-element-hover);
}

dialog.nc-confirm-dialog {
  position: fixed;
  inset: 0;
  margin: auto;
  inline-size: min(560px, calc(100vw - 24px));
  max-inline-size: 100%;
  max-block-size: calc(100vh - 24px);
  overflow: auto;
  background-color: var(--color-main-background, #ffffff);
  background-image: linear-gradient(var(--color-main-background, #ffffff), var(--color-main-background, #ffffff)), linear-gradient(#22262c, #22262c);
  color: var(--color-main-text);
  border: 1px solid var(--color-border-dark, var(--color-border));
  border-radius: var(--border-radius-large, 10px);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
  padding: 0;
  box-sizing: border-box;
  z-index: 20000 !important;
}

dialog.nc-confirm-dialog:not([open]) {
  display: none;
}

dialog.nc-confirm-dialog::backdrop {
  background-color: rgba(0, 0, 0, 0.45);
}

.nc-confirm-dialog__surface {
  padding-block: 20px;
  padding-inline: 22px;
  box-sizing: border-box;
}

.nc-confirm-dialog__header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-block-end: 10px;
}

.nc-confirm-dialog__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: 32px;
  block-size: 32px;
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

.nc-confirm-dialog__audit {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-block: 0 16px;
  margin-inline: 0;
  min-inline-size: 0;
  box-sizing: border-box;
}

.nc-confirm-dialog__audit-section {
  border-radius: var(--border-radius-large, 8px);
  border: 1px solid var(--color-border);
  background-color: var(--color-background-hover);
  padding-block: 10px;
  padding-inline: 12px;
  min-inline-size: 0;
  box-sizing: border-box;
}

.nc-confirm-dialog__audit-section--delete {
  border-inline-start: 4px solid #d32f2f;
}

.nc-confirm-dialog__audit-section--keep {
  border-inline-start: 4px solid #2e7d32;
}

.nc-confirm-dialog__audit-heading {
  margin-block: 0 8px;
  margin-inline: 0;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-main-text);
}

.nc-confirm-dialog__path-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-block-size: 140px;
  overflow-y: auto;
  overflow-x: hidden;
}

.nc-confirm-dialog__path-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px;
  padding-block: 4px;
  padding-inline: 8px;
  border-radius: 6px;
  background-color: var(--color-main-background);
  border: 1px solid var(--color-border);
  min-inline-size: 0;
  box-sizing: border-box;
}

.nc-confirm-dialog__path-text {
  flex: 1 1 180px;
  min-inline-size: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.78rem;
  line-height: 1.35;
  color: var(--color-main-text);
  overflow-wrap: anywhere;
}

.nc-confirm-dialog__path-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.nc-confirm-dialog__path-badge {
  display: inline-flex;
  align-items: center;
  padding-block: 2px;
  padding-inline: 7px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
  line-height: 1.2;
}

.nc-confirm-dialog__path-badge.is-kept {
  background-color: rgba(46, 125, 50, 0.14);
  border: 1px solid rgba(46, 125, 50, 0.48);
  color: var(--color-main-text);
}

.nc-confirm-dialog__path-badge.is-protected {
  background-color: var(--color-primary-element-light, #e5eff5);
  border: 1px solid var(--color-primary-element, #00679e);
  color: var(--color-primary-element-light-text, var(--color-main-text, #222222));
}

.nc-confirm-dialog__path-size {
  font-size: 0.76rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-maxcontrast);
  white-space: nowrap;
}

.nc-confirm-dialog__empty-keep-warning {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 700;
  color: #b71c1c;
}

.nc-confirm-dialog__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.nc-confirm-dialog__export-group,
.nc-confirm-dialog__decision-group {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.nc-confirm-dialog__export-status {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--color-main-text);
}

.nc-confirm-dialog__export-status.is-error {
  color: #b71c1c;
}

.nc-confirm-dialog__button--export {
  background-color: var(--color-main-background) !important;
  border: 1px solid var(--color-border-maxcontrast, var(--color-border-dark)) !important;
  color: var(--color-main-text) !important;
}

.nc-confirm-dialog__button--export:hover:not(:disabled),
.nc-confirm-dialog__button--export:focus-visible:not(:disabled) {
  background-color: var(--color-background-dark) !important;
  border-color: var(--color-primary-element, #0082c9) !important;
  color: var(--color-main-text) !important;
}

.nc-confirm-dialog__button {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  min-block-size: 44px !important;
  min-inline-size: 44px !important;
  padding-block: 8px !important;
  padding-inline: 16px !important;
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

.nc-confirm-dialog__button--cancel:hover,
.nc-confirm-dialog__button--cancel:focus-visible {
  background-color: var(--color-background-dark) !important;
  color: var(--color-main-text) !important;
}

.nc-confirm-dialog__button--danger {
  background-color: #d32f2f !important;
  border: 1px solid #d32f2f !important;
  color: #ffffff !important;
}

.nc-confirm-dialog__button--danger:hover,
.nc-confirm-dialog__button--danger:focus-visible {
  background-color: #b71c1c !important;
  border-color: #b71c1c !important;
  color: #ffffff !important;
}

@media (max-width: 480px) {
  .nc-confirm-dialog__stats {
    grid-template-columns: minmax(0, 1fr);
  }
}

.group-header-summary__item--visual {
  background-color: rgba(0, 130, 201, 0.12);
  border-color: rgba(0, 130, 201, 0.42);
  font-variant-numeric: tabular-nums;
}

.group-header-summary__inspect-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-inline-size: 44px;
  min-block-size: 44px;
  padding-block: 4px;
  padding-inline: 10px;
  border-radius: var(--border-radius-large, 8px);
  border: 1px solid var(--color-primary-element, #0082c9);
  background-color: var(--color-main-background);
  color: var(--color-main-text);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  box-sizing: border-box;
}

.group-header-summary__inspect-button:hover,
.group-header-summary__inspect-button:focus-visible,
.resolution-winner-keep-button:hover:not(:disabled),
.resolution-winner-keep-button:focus-visible:not(:disabled) {
  background-color: var(--color-background-dark);
  border-color: var(--color-primary-element, #0082c9);
  outline: 2px solid var(--color-primary-element, #0082c9);
  outline-offset: 2px;
}

.resolution-winner-keep-button.is-active {
  background-color: rgba(46, 125, 50, 0.16);
  border-color: rgba(46, 125, 50, 0.56);
}
</style>
