<template>
  <div class="file-info-container">
    <div
      class="thumbnail"
      :style="{ backgroundImage: 'url(' + getPreviewImage(file) + ')' }"
      :title="t('duplicatefinder', 'Open File')"
      @click="openInNewWindow">
    </div>

    <div class="file-details" :title="normalizedPath">
      <div class="file-title-row">
        <p class="file-label">
          <strong>{{ t('duplicatefinder', 'File') }} {{ index + 1 }}</strong>
        </p>
        <span v-if="fileName" class="file-name-badge" :title="fileName">{{ fileName }}</span>
      </div>
      <p class="file-path" :title="normalizedPath"><strong>{{ t('duplicatefinder', 'Path:') }}</strong> {{ normalizedPath }}</p>
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
    }
  },
  computed: {
    normalizedPath() {
      return this.normalizeItemPath(this.file.path);
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
  methods: {
    getPreviewImage,
    normalizeItemPath,
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
        await deleteFile(this.file);
        const eventData = {
          file: this.file,
          acknowledged: this.duplicateAcknowledged
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
  margin-left: 12px;
  margin-right: 24px;
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

.thumbnail:hover {
  border-color: var(--color-primary-element);
}

.file-details {
  flex: 1 1 220px;
  min-width: 0;
  padding-left: 12px;
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

.file-path {
  margin: 0;
  font-size: 0.84rem;
  color: var(--color-text-maxcontrast);
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
  line-height: 1.4;
}

.file-size-column {
  width: 108px;
  flex-shrink: 0;
  padding-left: 12px;
  font-size: 0.88rem;
  font-variant-numeric: tabular-nums;
  color: var(--color-main-text);
  white-space: nowrap;
  box-sizing: border-box;
}

.file-status-column {
  width: 118px;
  flex-shrink: 0;
  padding-left: 12px;
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
  padding-left: 12px;
  flex-shrink: 0;
  margin-left: auto;
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

/* Mobile styles */
@media (max-width: 800px) {
  .file-info-container {
    flex-direction: column;
    align-items: stretch;
  }

  .thumbnail {
    margin-left: 0;
    margin-right: 0;
  }

  .file-details,
  .file-size-column,
  .file-status-column {
    width: 100%;
    flex-basis: auto;
    padding-left: 0;
  }

  .action-buttons {
    width: 100%;
    justify-content: flex-start;
    padding-left: 0;
    margin-left: 0;
    margin-top: 6px;
  }
}
</style>
