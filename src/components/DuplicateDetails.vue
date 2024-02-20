<template>
  <div v-if="duplicate && duplicate.files.length > 0">
    <div class="summary-section">
      <p>{{ t('duplicatefinder',
        'Welcome, the current duplicate has {numberOfFiles} files, total size: {formattedSize}',
        { numberOfFiles: duplicate.files.length, formattedSize: getDuplicateSize(duplicate) }) }}</p>
    </div>
    <div v-for="(file, index) in duplicate.files" :key="file.id" class="file-display">
      <DuplicateFileDisplay :file="file" :index="index" @fileDeleted="removeFileFromListAndUpdate(file)">
      </DuplicateFileDisplay>
    </div>
  </div>
  <div v-else class="emptycontent">
				<div class="icon-file" />
				<div>
					<h2>{{ t('duplicatefinder', 'No duplicates found or no duplicate selected.') }}</h2>
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
.summary-section {
  margin-top: 50px;
  margin-bottom: 20px;
  padding: 10px;
  border-radius: 5px;
  font-weight: bold;
  text-align: center;
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

@media (max-width: 800px) {
  .file-display {
    flex-direction: column;
    align-items: center;
  }

}
</style>