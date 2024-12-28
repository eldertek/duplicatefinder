<template>
  <div class="file-info-container">
    <div class="thumbnail" :style="{ backgroundImage: 'url(' + getPreviewImage(file) + ')' }"></div>
    <div class="file-details">
      <p><strong>{{ t('duplicatefinder', 'File') }} {{ index + 1 }}</strong></p>
      <p><strong>{{ t('duplicatefinder', 'Path:') }}</strong> {{ normalizeItemPath(file.path) }}</p>
    </div>
    <div class="action-buttons">
      <button @click="openInNewWindow" class="action-button">
        {{ t('duplicatefinder', 'Open File') }}
      </button>
      <button @click="openFolderInNewWindow" class="action-button">
        {{ t('duplicatefinder', 'Open Folder') }}
      </button>
      <button v-if="!file.isInOriginFolder" @click="deleteFile" class="delete-button">
        {{ t('duplicatefinder', 'Delete') }}
      </button>
      <button v-else class="protected-button" disabled>
        {{ t('duplicatefinder', 'Protected') }}
      </button>
    </div>
  </div>
</template>
<script>
import { deleteFile } from '@/tools/api';
import { getPreviewImage, normalizeItemPath } from '@/tools/utils';
import { generateUrl } from '@nextcloud/router';

export default {
  props: {
    file: Object,
    index: Number,
    duplicateAcknowledged: {
      type: Boolean,
      required: true
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
      const path = this.file.path.replace(/^\/[^/]+\/files/, '');
      const lastSlashIndex = path.lastIndexOf('/');
      const parentPath = path.substring(0, lastSlashIndex);
      return parentPath || '/';
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
         // Handled by api.js
      }
    },
  }
}
</script>

<style scoped>
.file-info-container {
  display: flex;
  align-items: center;
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

.action-buttons {
  display: flex;
  gap: 8px;
  align-items: center;
}

.action-button {
  background-color: var(--color-primary);
  color: #fff;
  border: none;
  padding: 5px 10px;
  border-radius: 5px;
  cursor: pointer;
  transition: background-color 0.3s;
}

.action-button:hover {
  background-color: var(--color-primary-dark);
}

.protected-button {
  background-color: #ccc;
  color: #666;
  border: none;
  padding: 5px 10px;
  border-radius: 5px;
  cursor: not-allowed;
  margin-left: 10px;
}

/* Desktop styles */
@media (min-width: 801px) {
  .action-buttons {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    margin-left: 0;
  }
}

/* Mobile styles */
@media (max-width: 800px) {
  .file-info-container {
    display: flex;
    width: 100%;
    align-items: center;
    margin-bottom: 10px;
    justify-content: space-between;
    flex-direction: column;
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

  .action-buttons {
    width: 100%;
    flex-wrap: wrap;
    justify-content: center;
    margin-top: 10px;
  }

  .action-button, .delete-button, .protected-button {
    flex: 1;
    min-width: 80px;
    margin: 5px;
    padding: 3px 7px;
    font-size: 12px;
  }
}

</style>