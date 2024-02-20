<template>
  <div class="file-info-container">
    <div class="thumbnail" :style="{ backgroundImage: 'url(' + getPreviewImage(file) + ')' }"></div>
    <div class="file-details">
      <p><strong>File:</strong> {{ file.name }}</p>
      <p><strong>Size:</strong> {{ file.size }} bytes</p>
      <p><strong>Path:</strong> {{ normalizeItemPath(file.path) }}</p>
    </div>
    <button @click="deleteFile" class="delete-button">Delete</button>
  </div>
</template>
<script>
import { deleteFile } from '@/tools/api';
import { getPreviewImage, normalizeItemPath } from '@/tools/utils';

export default {
  props: {
    file: Object
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

.file-display {
  width: calc(100% - 20px);
  display: flex;
  align-items: center;
  margin-bottom: 10px;
  margin-left: 10px;
  margin-right: 10px;
  border: 1px solid #e0e0e0;
  padding: 10px;
  border-radius: 5px;
  position: relative;
}

.file-display p {
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
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

.nav-thumbnail {
  width: 20px;
  height: 20px;
  background-size: cover;
  background-position: center;
  border-radius: 4px;
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

.summary-section {
  margin-top: 50px;
  margin-bottom: 20px;
  padding: 10px;
  border-radius: 5px;
  font-weight: bold;
  text-align: center;
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
  .file-display {
    flex-direction: column;
    align-items: center;
  }

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