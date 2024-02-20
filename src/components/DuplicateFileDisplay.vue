<template>
  <div class="file-info-container">
    <div class="thumbnail" :style="{ backgroundImage: 'url(' + getPreviewImage(file) + ')' }"></div>
    <div class="file-details">
      <p><strong>{{ t('duplicatefinder', 'File') }} {{ index + 1 }}</strong></p>
      <p><strong>{{ t('duplicatefinder', 'Path:') }}</strong> {{ normalizeItemPath(file.path) }}</p>
    </div>
    <button @click="deleteFile" class="delete-button">{{ t('duplicatefinder', 'Delete') }}</button>
  </div>
</template>
<script>
import { deleteFile } from '@/tools/api';
import { getPreviewImage, normalizeItemPath } from '@/tools/utils';

export default {
  props: {
    file: Object,
    index: Number
  },
  methods: {
    getPreviewImage,
    normalizeItemPath,
    deleteFile() {
      deleteFile(this.file);

      this.$emit('fileDeleted', this.file);
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
  color: #007BFF;
  /* Blue color */
  text-decoration: none;
  transition: color 0.3s ease;
}

.acknowledge-link:hover {
  color: #0056b3;
  /* Darker blue on hover */
}

.preview-link {
  color: #28a745;
  /* Green color */
  text-decoration: none;
  transition: color 0.3s ease;
}

.preview-link:hover {
  color: #1e7e34;
  /* Darker green on hover */
}

</style>