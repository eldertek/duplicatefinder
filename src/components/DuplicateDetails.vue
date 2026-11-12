<template>
  <div class="duplicate-details-container">
    <transition name="fade">
      <div v-show="!isLoadingNextDuplicate">
        <div v-if="duplicate && duplicate.files.length > 1" class="duplicate-details-content">
          <div class="details-header-row">
            <h3 class="details-group-title">
              {{ t('duplicatefinder', 'Duplicate Details') }} - {{ getGroupDisplayName(duplicate) }}
            </h3>
            <span
              class="group-status-pill"
              :class="duplicate.acknowledged ? 'is-acknowledged' : 'is-unacknowledged'">
              {{ duplicate.acknowledged ? t('duplicatefinder', 'Acknowledged') : t('duplicatefinder', 'Unacknowledged') }}
            </span>
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

              <a
                v-if="duplicate.acknowledged"
                href="#"
                class="toolbar-button acknowledge-link is-acknowledged"
                @click.prevent="unOrAcknowledgeDuplicate(duplicate)">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                  <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
                <span>{{ t('duplicatefinder', 'Unacknowledge it') }}</span>
              </a>
              <a
                v-else
                href="#"
                class="toolbar-button acknowledge-link"
                @click.prevent="unOrAcknowledgeDuplicate(duplicate)">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                  <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
                <span>{{ t('duplicatefinder', 'Acknowledge it') }}</span>
              </a>

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

              <div class="dropdown">
                <button
                  type="button"
                  class="dropdown-toggle"
                  :title="t('duplicatefinder', 'More actions')"
                  @click="toggleDropdown">
                  <span class="arrow-down"></span>
                </button>
                <div v-show="showDropdown" class="dropdown-menu">
                  <button type="button" @click="copyFileHash">{{ t('duplicatefinder', 'Copy File Hash') }}</button>
                </div>
              </div>
            </div>
          </div>

          <div class="files-card">
            <div class="files-table-header">
              <div class="col-checkbox" aria-hidden="true"></div>
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
                'is-protected': file.isInOriginFolder
              }">
              <input
                v-model="selectedFiles"
                type="checkbox"
                class="file-row-checkbox"
                :value="file"
                :disabled="file.isInOriginFolder"
              />
              <DuplicateFileDisplay
                :file="file"
                :index="index"
                :duplicate-acknowledged="duplicate.acknowledged"
                :has-other-folders="hasFilesInOtherFolders(file)"
                @keepFolder="selectDuplicatesOutsideFolder(file)"
                @fileDeleted="removeFileFromListAndUpdate(file)">
              </DuplicateFileDisplay>
            </div>
          </div>
        </div>
        <div v-else class="emptycontent">
          <div class="icon-file" />
          <div>
            <h2>{{ t('duplicatefinder', 'No duplicates found or no duplicate selected.') }}</h2>
            <p>{{ t('duplicatefinder', 'You can adjust settings or run a new scan to find duplicates.') }}</p>
            <div class="action-buttons">
              <button @click="openSettings" class="primary">{{ t('duplicatefinder', 'Open Settings') }}</button>
              <button @click="findDuplicates" :disabled="isScanning">
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
  </div>
</template>

<script>
import { acknowledgeDuplicate, unacknowledgeDuplicate, deleteFiles, findDuplicates as apiFindDuplicates } from '@/tools/api';
import { getFormattedSizeOfCurrentDuplicate, openFileInViewer, removeFileFromList, removeFilesFromList, normalizeItemPath, getParentFolderPath, fileKey, isSameFile } from '@/tools/utils';
import { showSuccess, showError } from '@nextcloud/dialogs';
import DuplicateFileDisplay from './DuplicateFileDisplay.vue';

export default {
  components: {
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
      isLoadingNextDuplicate: false,
      showDropdown: false
    };
  },
  watch: {
    // A selection belongs to the duplicate it was made on: never carry it over to another one
    duplicate() {
      this.selectedFiles = [];
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
    async unOrAcknowledgeDuplicate(duplicate) {
      try {
        const updatedDuplicate = { ...duplicate };

        if (updatedDuplicate.acknowledged) {
          await unacknowledgeDuplicate(updatedDuplicate.hash);
          updatedDuplicate.acknowledged = false;
        } else {
          await acknowledgeDuplicate(updatedDuplicate.hash);
          updatedDuplicate.acknowledged = true;
        }

        this.$emit('duplicateUpdated', updatedDuplicate);
      } catch (error) {
        console.error('Error updating duplicate acknowledgement status:', error);
      }
    },
    openFileInViewer,
    getDuplicateSize(duplicate) {
      return getFormattedSizeOfCurrentDuplicate(duplicate);
    },
    removeFileFromListAndUpdate(file) {
      console.log('DuplicateDetails: Removing file from list:', file);
      removeFileFromList(file, this.duplicate.files);
      // A file that is gone cannot stay selected for the next "Delete Selected"
      this.selectedFiles = this.selectedFiles.filter(selected => !isSameFile(selected, file));
      console.log('DuplicateDetails: Files remaining:', this.duplicate.files.length);

      if (this.duplicate.files.length <= 1) {
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

    async deleteSelectedDuplicates() {
      try {
        const fileHashes = this.selectedFiles.map(file => file.hash);
        const allInstances = this.duplicate.files.filter(file => fileHashes.includes(file.hash));

        // Verify whether protected files are selected
        const hasProtectedFiles = this.selectedFiles.some(file => file.isInOriginFolder);
        if (hasProtectedFiles) {
          this.$emit('showError', this.t('duplicatefinder', 'Cannot delete protected files'));
          return;
        }

        // Check if at least one file will remain after deletion
        const remainingFiles = this.duplicate.files.filter(file => !this.selectedFiles.includes(file));
        let allowLastCopy = false;
        if (remainingFiles.length === 0) {
          const confirmDelete = confirm(this.t('duplicatefinder', 'This action will delete all instances of the duplicate. At least one copy should be kept. Are you sure you want to proceed?'));
          if (!confirmDelete) return;
          // Only an explicit confirmation lets the server delete the last copy
          allowLastCopy = true;
        }

        const { success, errors } = await deleteFiles(this.selectedFiles, { allowLastCopy });
        if (success.length > 0) {
          removeFilesFromList(success, this.duplicate.files);
          this.selectedFiles = this.selectedFiles.filter(file => !success.includes(file));

          if (this.duplicate.files.length <= 1) {
            this.$emit('duplicate-resolved', {
              duplicate: this.duplicate,
              type: this.duplicate.acknowledged ? 'acknowledged' : 'unacknowledged'
            });
          }
        }
      } catch (error) {
        console.error('Error deleting selected files:', error);
      }
    },
    selectAllFiles() {
      // Only select non-protected files and keep at least one copy
      const filesToSelect = this.duplicate.files.filter(file => !file.isInOriginFolder);

      if (filesToSelect.length === this.duplicate.files.length && filesToSelect.length > 0) {
        this.selectedFiles = filesToSelect.slice(1);
      } else {
        this.selectedFiles = filesToSelect;
      }
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
    copyFileHash() {
      if (this.duplicate && this.duplicate.files.length > 0) {
        const hash = this.duplicate.hash;
        navigator.clipboard.writeText(hash).then(() => {
          showSuccess(t('duplicatefinder', 'File hash copied to clipboard'));
          this.showDropdown = false;
        });
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
  word-break: break-word;
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

.group-status-pill.is-unacknowledged {
  background-color: var(--color-background-dark);
  color: var(--color-text-maxcontrast);
  border: 1px solid var(--color-border-dark, var(--color-border));
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

.toolbar-button svg {
  display: block !important;
  flex-shrink: 0;
}

.select-all-button:hover:not(:disabled),
.select-all-button:focus-visible:not(:disabled),
.preview-button:hover:not(:disabled),
.preview-button:focus-visible:not(:disabled) {
  background-color: var(--color-background-dark);
  border-color: var(--color-primary-element);
}

.delete-selected-button {
  background-color: #d32f2f;
  border-color: #d32f2f;
  color: #ffffff;
}

.delete-selected-button:hover:not(:disabled),
.delete-selected-button:focus-visible:not(:disabled) {
  background-color: #b71c1c;
  border-color: #b71c1c;
  color: #ffffff;
}

.acknowledge-link {
  background-color: #2e7d32;
  border-color: #2e7d32;
  color: #ffffff !important;
}

.acknowledge-link:hover,
.acknowledge-link:focus-visible {
  background-color: #1b5e20;
  border-color: #1b5e20;
  color: #ffffff !important;
}

.acknowledge-link.is-acknowledged {
  background-color: var(--color-main-background);
  border-color: var(--color-border-maxcontrast, var(--color-border-dark));
  color: var(--color-main-text) !important;
}

.acknowledge-link.is-acknowledged:hover,
.acknowledge-link.is-acknowledged:focus-visible {
  background-color: var(--color-background-dark);
  border-color: var(--color-primary-element);
}

.files-card {
  border: 1px solid var(--color-border-dark, var(--color-border));
  border-radius: var(--border-radius-large, 10px);
  background-color: var(--color-main-background);
  overflow: hidden;
}

.files-table-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 16px;
  background-color: var(--color-background-hover);
  border-bottom: 1px solid var(--color-border-dark, var(--color-border));
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-text-maxcontrast);
  text-transform: none;
}

.col-checkbox {
  width: 20px;
  flex-shrink: 0;
}

.col-preview {
  width: 56px;
  flex-shrink: 0;
}

.col-name {
  flex: 1 1 220px;
  min-width: 0;
  padding-left: 12px;
  border-left: 1px solid var(--color-border);
}

.col-size {
  width: 96px;
  flex-shrink: 0;
  padding-left: 12px;
  border-left: 1px solid var(--color-border);
}

.col-status {
  width: 106px;
  flex-shrink: 0;
  padding-left: 12px;
  border-left: 1px solid var(--color-border);
}

.col-actions {
  width: 148px;
  flex-shrink: 0;
  padding-left: 12px;
  border-left: 1px solid var(--color-border);
  text-align: right;
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
}

.file-display:hover {
  background-color: var(--color-background-hover);
}

.file-display.is-selected {
  background-color: var(--color-primary-element-light);
}

.file-row-checkbox {
  width: 18px;
  height: 18px;
  margin: 0;
  flex-shrink: 0;
  cursor: pointer;
  accent-color: var(--color-primary-element, #0082c9);
}

@media (max-width: 800px) {
  .duplicate-details-container {
    padding: 14px 12px 24px;
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
  left: 0;
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
  cursor: not-allowed;
}

button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.dropdown {
  position: relative;
  display: inline-block;
}

.dropdown-toggle {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  min-width: 34px;
  min-height: 34px;
  margin: 0 !important;
  padding: 6px 10px !important;
  line-height: 1 !important;
  background: var(--color-main-background);
  border: 1px solid var(--color-border-maxcontrast, var(--color-border-dark));
  border-radius: var(--border-radius-large, 8px);
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.dropdown-toggle:hover {
  background-color: var(--color-background-dark);
  border-color: var(--color-primary-element);
}

.arrow-down {
  display: inline-block;
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 5px solid var(--color-main-text);
}

.dropdown-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  background-color: var(--color-main-background, #ffffff);
  background-image: linear-gradient(var(--color-main-background, #ffffff), var(--color-main-background, #ffffff)), linear-gradient(#22262c, #22262c);
  border: 1px solid var(--color-border-dark, var(--color-border));
  border-radius: var(--border-radius-large, 8px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
  z-index: 2000;
  min-width: 160px;
  overflow: hidden;
}

.dropdown-menu button {
  display: block;
  width: 100%;
  padding: 9px 14px;
  text-align: left;
  background: none;
  border: none;
  color: var(--color-main-text);
  font-size: 0.88rem;
  cursor: pointer;
}

.dropdown-menu button:hover {
  background: var(--color-background-hover);
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
</style>
