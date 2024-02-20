<template>
  <div class="duplicate-details">
    <div v-if="duplicate && duplicate.files.length > 0" class="summary-section">
      <p>Welcome, the current duplicate has {{ duplicate.files.length }} files, total size: {{ getDuplicateSize(duplicate) }}</p>
      <div v-for="(file) in duplicate.files" :key="file.id" class="file-display">
        <DuplicateFileDisplay :file="file" @fileDeleted="removeFileFromListAndUpdate(file)"></DuplicateFileDisplay>
      </div>
    </div>
    <div v-else class="emptycontent">
      <div class="icon-file"></div>
      <h2>No files found for this duplicate.</h2>
    </div>
  </div>
</template>

<script>
import { getFormattedSizeOfCurrentDuplicate, removeFileFromList } from '@/tools/utils';
import DuplicateFileDisplay from './DuplicateFileDisplay.vue';

export default {
  components: {
    DuplicateFileDisplay
  },
  props: {
    duplicate: Object
  },
  methods: {
    getDuplicateSize(duplicate) {
      return getFormattedSizeOfCurrentDuplicate(duplicate);
    },
    removeFileFromListAndUpdate(file) {
      removeFileFromList(file, this.duplicate.files);

      if (this.duplicate.files.length === 1) {
        this.$emit('lastFileDeleted', this.duplicate);
      }
    },
  }
}
</script>

<style scoped>
.duplicate-details {
  overflow-y: auto;
}

.duplicate-details > div {
  width: 100%;
  height: 100%;
  padding: 20px;
  display: flex;
  flex-direction: column;
  flex-grow: 1;
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

.summary-section {
  margin-top: 50px;
  margin-bottom: 20px;
  padding: 10px;
  border-radius: 5px;
  font-weight: bold;
  text-align: center;
}