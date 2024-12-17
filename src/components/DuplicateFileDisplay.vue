<template>
  <div class="file-info-container">
    <div class="thumbnail" :style="{ backgroundImage: 'url(' + getPreviewImage(file) + ')' }"></div>
    <div class="file-details">
      <p><strong>{{ t('duplicatefinder', 'File') }} {{ index + 1 }}</strong></p>
      <p><strong>{{ t('duplicatefinder', 'Path:') }}</strong> {{ normalizeItemPath(file.path) }}</p>
    </div>
    <button v-if="!file.isInOriginFolder" @click="deleteFile" class="delete-button">
      {{ t('duplicatefinder', 'Delete') }}
    </button>
    <button v-else class="protected-button" disabled>
      {{ t('duplicatefinder', 'Protected') }}
    </button>
  </div>
</template>
<script>
import { deleteFile } from '@/tools/api';
import { getPreviewImage, normalizeItemPath } from '@/tools/utils';

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
  .delete-button, .protected-button {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    margin-left: 0;
  }
}

/* Mobile stles */
@media (max-width: 800px) {
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

  .delete-button, .protected-button {
    width: 100%;
    margin-left: 0;
    margin-right: 0;
    padding: 3px 7px;
    font-size: 12px;
    margin-top: 10px;
  }
}

</style>