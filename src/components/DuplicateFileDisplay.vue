<template>
  <div class="file-info-container">
    <div
      class="thumbnail"
      role="button"
      tabindex="0"
      :style="{ backgroundImage: 'url(' + getPreviewImage(file) + ')' }"
      :title="t('duplicatefinder', 'Open File')"
      :aria-label="t('duplicatefinder', 'Open File')"
      @click="openInNewWindow"
      @keydown.enter.prevent="openInNewWindow"
      @keydown.space.prevent="openInNewWindow">
    </div>

    <div class="file-details" :title="normalizedPath">
      <div class="file-title-row">
        <p class="file-label">
          <strong>{{ t('duplicatefinder', 'File') }} {{ index + 1 }}</strong>
        </p>
        <span v-if="fileName" class="file-name-badge" :title="fileName">{{ fileName }}</span>
      </div>
      <div class="file-path-row">
        <p class="file-path" :title="normalizedPath"><strong>{{ t('duplicatefinder', 'Path:') }}</strong> {{ normalizedPath }}</p>
        <div class="copy-path-control">
          <button
            type="button"
            class="copy-path-button"
            :class="{ 'is-copied': copyStatus === 'copied', 'is-error': copyStatus === 'error' }"
            :title="t('duplicatefinder', 'Copy path')"
            :aria-label="t('duplicatefinder', 'Copy path')"
            :disabled="!pathToCopy"
            @click="copyFilePath">
            <svg
              v-if="copyStatus === 'copied'"
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
              <polyline points="20 6 9 17 4 12"></polyline>
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
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span class="copy-path-button__label">{{ t('duplicatefinder', 'Copy path') }}</span>
          </button>
          <span
            class="copy-path-status"
            :class="{
              'is-visible': Boolean(copyStatusMessage),
              'is-copied': copyStatus === 'copied',
              'is-error': copyStatus === 'error'
            }"
            role="status"
            aria-live="polite">
            {{ copyStatusMessage }}
          </span>
        </div>
      </div>
      <div v-if="hasMetadataBadges" class="file-metadata-badges">
        <span
          v-if="resolvedBadges.isProtectedOrigin"
          class="metadata-badge metadata-badge--protected">
          {{ t('duplicatefinder', 'Protected origin') }}
        </span>
        <span
          v-if="resolvedBadges.isOldest"
          class="metadata-badge metadata-badge--oldest">
          {{ t('duplicatefinder', 'Oldest') }}
        </span>
        <span
          v-if="resolvedBadges.isNewest"
          class="metadata-badge metadata-badge--newest">
          {{ t('duplicatefinder', 'Newest') }}
        </span>
        <span
          v-if="resolvedBadges.isShortestPath"
          class="metadata-badge metadata-badge--shortest">
          {{ t('duplicatefinder', 'Shortest path') }}
        </span>
        <span
          v-if="resolvedBadges.folderLabel"
          class="metadata-badge metadata-badge--folder"
          :title="t('duplicatefinder', 'Folder: {folder}', { folder: resolvedBadges.folderLabel })"
          :aria-label="t('duplicatefinder', 'Folder: {folder}', { folder: resolvedBadges.folderLabel })">
          <svg
            class="metadata-badge__icon"
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          </svg>
          <span class="metadata-badge__text">{{ resolvedBadges.folderLabel }}</span>
        </span>
      </div>
      <span v-if="file.isLivePhotoVideoMissing" class="file-status-badge is-duplicate">
        {{ t('duplicatefinder', 'Live Photo video is missing') }}
      </span>
    </div>

    <div class="file-size-column">
      <span class="file-size-value">{{ formattedFileSize }}</span>
    </div>

    <div class="file-status-column">
      <span v-if="file.isInOriginFolder" class="file-status-badge is-protected">
        {{ t('duplicatefinder', 'Protected') }}
      </span>
      <span v-else-if="index === 0" class="file-status-badge is-original">
        {{ t('duplicatefinder', 'Original') }}
      </span>
      <span v-else class="file-status-badge is-duplicate">
        {{ t('duplicatefinder', 'Duplicate') }}
      </span>
    </div>

    <div class="action-buttons" :class="{ 'is-compact': !hasOtherFolders }">
      <button
        type="button"
        class="action-button open-folder-button"
        :title="t('duplicatefinder', 'Open Folder')"
        :aria-label="t('duplicatefinder', 'Open Folder')"
        :data-tooltip="t('duplicatefinder', 'Open Folder')"
        @click="openFolderInNewWindow">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2z"></path>
        </svg>
      </button>

      <button
        type="button"
        class="action-button open-file-button"
        :title="t('duplicatefinder', 'Open File')"
        :aria-label="t('duplicatefinder', 'Open File')"
        :data-tooltip="t('duplicatefinder', 'Open File')"
        @click="openInNewWindow">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
          <polyline points="15 3 21 3 21 9"></polyline>
          <line x1="10" y1="14" x2="21" y2="3"></line>
        </svg>
      </button>

      <button
        v-if="hasOtherFolders"
        type="button"
        class="action-button keep-folder-button"
        :title="t('duplicatefinder', 'Select duplicates in other folders for deletion')"
        :aria-label="t('duplicatefinder', 'Keep Folder')"
        :data-tooltip="t('duplicatefinder', 'Keep Folder')"
        @click="$emit('keepFolder', file)">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2z"></path>
          <polyline points="9 14 11 16 15 12"></polyline>
        </svg>
      </button>

      <button
        v-if="!file.isInOriginFolder"
        type="button"
        class="delete-button"
        :title="t('duplicatefinder', 'Delete')"
        :aria-label="t('duplicatefinder', 'Delete')"
        :data-tooltip="t('duplicatefinder', 'Delete')"
        @click="deleteFile">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6"></path>
          <line x1="10" y1="11" x2="10" y2="17"></line>
          <line x1="14" y1="11" x2="14" y2="17"></line>
        </svg>
      </button>

      <button
        v-else
        type="button"
        class="protected-button"
        disabled
        :title="t('duplicatefinder', 'Protected')"
        :aria-label="t('duplicatefinder', 'Protected')"
        :data-tooltip="t('duplicatefinder', 'Protected')">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="3" y="11" width="18" height="10" rx="2" ry="2"></rect>
          <path d="M7.5 11V7.5a4.5 4.5 0 0 1 9 0V11"></path>
        </svg>
      </button>
    </div>
  </div>
</template>
<script>
import { deleteFile } from '@/tools/api';
import { copyTextSafely } from '@/tools/clipboardHelper';
import { getPreviewImage, normalizeItemPath, getParentFolderPath } from '@/tools/utils';
import { generateUrl } from '@nextcloud/router';

export default {
  props: {
    file: Object,
    index: Number,
    duplicateAcknowledged: {
      type: Boolean,
      required: true
    },
    hasOtherFolders: {
      type: Boolean,
      default: false
    },
    metadataBadges: {
      type: Object,
      default: null
    }
  },
  data() {
    return {
      copyStatus: 'idle',
      copyStatusMessage: '',
      copyResetTimer: null
    };
  },
  computed: {
    resolvedBadges() {
      if (this.metadataBadges && typeof this.metadataBadges === 'object') {
        return this.metadataBadges;
      }
      return {
        isOldest: false,
        isNewest: false,
        isShortestPath: false,
        isProtectedOrigin: Boolean(this.file && this.file.isInOriginFolder),
        folderLabel: this.file && this.file.path ? getParentFolderPath(this.file.path) : ''
      };
    },
    hasMetadataBadges() {
      const badges = this.resolvedBadges;
      return Boolean(
        badges.isProtectedOrigin ||
        badges.isOldest ||
        badges.isNewest ||
        badges.isShortestPath ||
        badges.folderLabel
      );
    },
    normalizedPath() {
      if (!this.file || typeof this.file.path !== 'string') {
        return '';
      }
      return this.normalizeItemPath(this.file.path);
    },
    pathToCopy() {
      if (this.normalizedPath) {
        return this.normalizedPath;
      }
      return this.file && typeof this.file.path === 'string' ? this.file.path : '';
    },
    fileName() {
      if (!this.file || !this.file.path) {
        return '';
      }
      const parts = this.file.path.split('/');
      return parts[parts.length - 1] || '';
    },
    formattedFileSize() {
      const rawSize = this.file && Number.isFinite(Number(this.file.size)) ? Number(this.file.size) : 0;
      if (typeof OC !== 'undefined' && OC.Util && typeof OC.Util.humanFileSize === 'function') {
        return OC.Util.humanFileSize(rawSize);
      }
      return `${rawSize} B`;
    }
  },
  beforeDestroy() {
    if (this.copyResetTimer) {
      clearTimeout(this.copyResetTimer);
      this.copyResetTimer = null;
    }
  },
  methods: {
    getPreviewImage,
    normalizeItemPath,
    async copyFilePath() {
      const targetPath = this.pathToCopy;
      if (!targetPath) {
        return false;
      }
      if (this.copyResetTimer) {
        clearTimeout(this.copyResetTimer);
        this.copyResetTimer = null;
      }
      this.copyStatus = 'idle';
      this.copyStatusMessage = '';
      const copied = await copyTextSafely(targetPath);
      if (copied) {
        this.copyStatus = 'copied';
        this.copyStatusMessage = this.t('duplicatefinder', 'Copied');
      } else {
        this.copyStatus = 'error';
        this.copyStatusMessage = this.t('duplicatefinder', 'Copy failed');
      }
      this.copyResetTimer = setTimeout(() => {
        this.copyStatus = 'idle';
        this.copyStatusMessage = '';
        this.copyResetTimer = null;
      }, 2000);
      return copied;
    },
    openInNewWindow() {
      const url = generateUrl('/apps/files/files/' + this.file.nodeId + '?dir={dir}&openfile=true', {
        dir: this.getParentPath()
      });
      window.open(url, '_blank');
    },
    openFolderInNewWindow() {
      const url = generateUrl('/apps/files/files?dir={dir}', {
        dir: this.getParentPath()
      });
      window.open(url, '_blank');
    },
    getParentPath() {
      return getParentFolderPath(this.file.path);
    },
    async deleteFile() {
      try {
        console.log('DuplicateFileDisplay: Deleting file:', this.file);
        const deletedNodeIds = new Set();
        const deleted = await deleteFile(this.file, { deletedNodeIds });
        if (!deleted) return;
        const eventData = {
          file: this.file,
          acknowledged: this.duplicateAcknowledged,
          deletedNodeIds: Array.from(deletedNodeIds)
        };
        console.log('DuplicateFileDisplay: Emitting fileDeleted event with data:', eventData);
        this.$emit('fileDeleted', eventData);
      } catch (error) {
         console.error('DuplicateFileDisplay: Error deleting file:', error);
      }
    },
  }
}
</script>

<style scoped>
.file-info-container {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1 1 0;
  min-width: 0;
  width: 100%;
}

.thumbnail {
  width: 56px;
  height: 56px;
  margin-inline: 12px 24px;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  background-color: var(--color-background-dark);
  border: 1px solid var(--color-border-dark, var(--color-border));
  border-radius: 8px;
  flex-shrink: 0;
  cursor: pointer;
  transition: border-color 0.15s ease, transform 0.15s ease;
  box-sizing: border-box;
}

.thumbnail:hover,
.thumbnail:focus-visible {
  border-color: var(--color-primary-element);
}

.thumbnail:focus-visible {
  outline: 2px solid var(--color-primary-element, #0082c9);
  outline-offset: 2px;
}

.file-details {
  flex: 1 1 220px;
  min-width: 0;
  padding-inline-start: 12px;
  overflow: hidden;
  box-sizing: border-box;
}

.file-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 3px;
}

.file-label {
  margin: 0;
  font-size: 0.95rem;
  color: var(--color-main-text);
}

.file-name-badge {
  font-size: 0.8rem;
  color: var(--color-text-maxcontrast);
  background-color: var(--color-background-dark);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 1px 7px;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-path-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  max-inline-size: 100%;
}

.file-path {
  margin: 0;
  flex: 1 1 200px;
  min-inline-size: 0;
  font-size: 0.84rem;
  color: var(--color-text-maxcontrast);
  white-space: normal;
  overflow-wrap: anywhere;
  line-height: 1.4;
}

.copy-path-control {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  max-inline-size: 100%;
  flex-shrink: 0;
}

.copy-path-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-inline-size: 44px;
  min-block-size: 44px;
  max-inline-size: 100%;
  padding-block: 6px;
  padding-inline: 12px;
  border-radius: 8px;
  border: 1px solid var(--color-border-maxcontrast, var(--color-border-dark));
  background-color: var(--color-background-hover);
  color: var(--color-main-text);
  font-size: 0.8rem;
  font-weight: 600;
  line-height: 1.2;
  cursor: pointer;
  box-sizing: border-box;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.copy-path-button svg {
  display: block;
  flex-shrink: 0;
  pointer-events: none;
}

.copy-path-button:hover:not(:disabled) {
  background-color: var(--color-background-dark);
  border-color: var(--color-primary-element, #0082c9);
  color: var(--color-primary-element, #0082c9);
}

.copy-path-button:focus-visible {
  outline: 2px solid var(--color-primary-element, #0082c9);
  outline-offset: 2px;
}

.copy-path-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.copy-path-button.is-copied {
  border-color: var(--color-element-success, #2e7d32);
  background-color: var(--color-background-dark);
}

.copy-path-button.is-error {
  border-color: var(--color-element-error, #d32f2f);
}

.copy-path-status {
  display: inline-flex;
  align-items: center;
  font-size: 0.78rem;
  font-weight: 600;
  line-height: 1.2;
  border-radius: 999px;
  max-inline-size: 100%;
  box-sizing: border-box;
}

.copy-path-status.is-visible {
  margin-inline-start: 6px;
  padding-block: 4px;
  padding-inline: 10px;
}

.copy-path-status.is-copied {
  background-color: rgba(46, 125, 50, 0.14);
  border: 1px solid rgba(46, 125, 50, 0.48);
  color: var(--color-main-text);
}

.copy-path-status.is-error {
  background-color: rgba(211, 47, 47, 0.14);
  border: 1px solid rgba(211, 47, 47, 0.48);
  color: var(--color-main-text);
}

.file-metadata-badges {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-block-start: 6px;
  max-inline-size: 100%;
}

.metadata-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding-block: 2px;
  padding-inline: 8px;
  border-radius: 999px;
  border: 1px solid var(--color-border-dark, var(--color-border));
  background-color: var(--color-background-hover);
  color: var(--color-main-text);
  font-size: 0.76rem;
  font-weight: 600;
  line-height: 1.35;
  max-inline-size: 100%;
  box-sizing: border-box;
}

.metadata-badge--protected {
  background-color: var(--color-primary-element-light, #e5eff5);
  border-color: var(--color-primary-element, #00679e);
  color: var(--color-primary-element-light-text, var(--color-main-text, #222222));
}

.metadata-badge--oldest {
  background-color: rgba(46, 125, 50, 0.14);
  border-color: rgba(46, 125, 50, 0.48);
  color: var(--color-main-text);
}

.metadata-badge--newest {
  background-color: rgba(2, 119, 189, 0.14);
  border-color: rgba(2, 119, 189, 0.45);
  color: var(--color-main-text);
}

.metadata-badge--shortest {
  background-color: rgba(217, 119, 6, 0.14);
  border-color: rgba(217, 119, 6, 0.48);
  color: var(--color-main-text);
}

.metadata-badge--folder {
  background-color: var(--color-background-dark);
  border-color: var(--color-border-dark, var(--color-border));
  color: var(--color-text-maxcontrast, var(--color-main-text));
  min-inline-size: 0;
}

.metadata-badge__icon {
  display: block;
  flex-shrink: 0;
}

.metadata-badge__text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size-column {
  width: 108px;
  flex-shrink: 0;
  padding-inline-start: 12px;
  font-size: 0.88rem;
  font-variant-numeric: tabular-nums;
  color: var(--color-main-text);
  white-space: nowrap;
  box-sizing: border-box;
}

.file-status-column {
  width: 118px;
  flex-shrink: 0;
  padding-inline-start: 12px;
  box-sizing: border-box;
}

.file-status-badge {
  display: inline-flex;
  align-items: center;
  font-size: 0.84rem;
  font-weight: 600;
}

.file-status-badge.is-original {
  color: #4caf50;
}

.file-status-badge.is-duplicate {
  color: #e57373;
}

.file-status-badge.is-protected {
  color: var(--color-primary-element, #0082c9);
}

.action-buttons {
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;
  align-items: center;
  justify-content: flex-start;
  width: 172px;
  padding-inline-start: 12px;
  flex-shrink: 0;
  margin-inline-start: auto;
  box-sizing: border-box;
}

.action-buttons.is-compact {
  width: 130px;
}

.action-button,
.delete-button,
.protected-button {
  position: relative;
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
  vertical-align: middle;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  box-sizing: border-box;
  flex-shrink: 0;
}

.action-button svg,
.delete-button svg,
.protected-button svg {
  display: block !important;
  width: 16px;
  height: 16px;
  margin: auto !important;
  flex-shrink: 0;
  pointer-events: none;
}

.action-button {
  background-color: var(--color-background-hover);
  color: var(--color-main-text);
  border: 1px solid var(--color-border-maxcontrast, var(--color-border-dark));
}

.action-button:hover {
  background-color: var(--color-background-dark);
  border-color: var(--color-primary-element, #ffffff);
  color: var(--color-primary-element, #ffffff);
}

.delete-button {
  background-color: #d32f2f;
  color: #ffffff;
  border: 1px solid #d32f2f;
}

.delete-button:hover {
  background-color: #c62828;
  border-color: var(--color-primary-element, #ffffff);
  color: #ffffff;
}

.protected-button {
  background-color: var(--color-background-dark);
  color: var(--color-text-maxcontrast);
  border: 1px solid var(--color-border);
  cursor: not-allowed;
  opacity: 0.65;
}

.action-button:focus-visible,
.delete-button:focus-visible,
.protected-button:focus-visible {
  outline: 2px solid var(--color-primary-element, #0082c9);
  outline-offset: 2px;
}

/* Mobile styles */
@media (max-width: 800px) {
  .file-info-container {
    flex-direction: column;
    align-items: stretch;
  }

  .thumbnail {
    margin-inline: 0;
  }

  .file-name-badge {
    max-width: 100%;
  }

  .file-details,
  .file-size-column,
  .file-status-column {
    width: 100%;
    flex-basis: auto;
    padding-inline-start: 0;
  }

  .action-buttons,
  .action-buttons.is-compact {
    width: 100%;
    flex-wrap: wrap;
    justify-content: flex-start;
    padding-inline-start: 0;
    margin-inline-start: 0;
    margin-top: 6px;
  }

  .action-button,
  .delete-button,
  .protected-button {
    min-width: 44px;
    min-height: 44px;
  }
}
</style>
