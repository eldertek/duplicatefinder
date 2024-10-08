<template>
  <div>
    <transition name="fade">
      <div v-show="!isLoadingNextDuplicate">
        <div v-if="duplicate && duplicate.files.length > 1">
          <div class="summary-section">
            <p>{{ t('duplicatefinder',
              'Welcome, the current duplicate has {numberOfFiles} files, total size: {formattedSize}',
              { numberOfFiles: duplicate.files.length, formattedSize: getDuplicateSize(duplicate) }) }}</p>
            <a @click.prevent="openFileInViewer(duplicate.files[0])" href="#"
              class="preview-link">
              {{ t('duplicatefinder', 'Show Preview') }}
            </a>
            <a v-if="duplicate.acknowledged" class="acknowledge-link" @click="unOrAcknowledgeDuplicate(duplicate)" href="#">
              {{ t('duplicatefinder', 'Unacknowledge it') }}
            </a>
            <a v-else class="acknowledge-link" @click="unOrAcknowledgeDuplicate(duplicate)" href="#">
              {{ t('duplicatefinder', 'Acknowledge it') }}
            </a>
            <button @click="deleteSelectedDuplicates">{{ t('duplicatefinder', 'Delete Selected') }}</button>
            <!-- New Select All Button -->
            <button @click="selectAllFiles">{{ t('duplicatefinder', 'Select All') }}</button>
          </div>
          <div v-for="(file, index) in duplicate.files" :key="file.id" class="file-display">
            <input type="checkbox" v-model="selectedFiles" :value="file" />
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
import { acknowledgeDuplicate, unacknowledgeDuplicate, deleteFiles } from '@/tools/api';
import { getFormattedSizeOfCurrentDuplicate, openFileInViewer, removeFileFromList, removeFilesFromList } from '@/tools/utils';
import DuplicateFileDisplay from './DuplicateFileDisplay.vue';

export default {
  components: {
    DuplicateFileDisplay
  },
  props: {
    duplicate: Object
  },
  data() {
    return {
      selectedFiles: [],
      isLoadingNextDuplicate: false, // Add this line
    };
  },
  methods: {
    unOrAcknowledgeDuplicate(duplicate) {
      if (duplicate.acknowledged) {
        unacknowledgeDuplicate(duplicate.hash);
      } else {
        acknowledgeDuplicate(duplicate.hash);
      }
      this.$emit('duplicateUpdated', duplicate);
    },
    openFileInViewer,
    getDuplicateSize(duplicate) {
      return getFormattedSizeOfCurrentDuplicate(duplicate);
    },
    removeFileFromListAndUpdate(file) {
      removeFileFromList(file, this.duplicate.files);
      if (this.duplicate.files.length === 0) {
        this.$emit('lastFileDeleted', this.duplicate);
      }
    },
    async deleteSelectedDuplicates() {
      try {
        const fileHashes = this.selectedFiles.map(file => file.hash);
        const allInstances = this.duplicate.files.filter(file => fileHashes.includes(file.hash));
        if (allInstances.length === this.duplicate.files.length) {
          const confirmDelete = confirm(this.t('duplicatefinder', 'This action will delete all instances of the selected files. Are you sure you want to proceed?'));
          if (!confirmDelete) return;
        }
        await deleteFiles(this.selectedFiles);
        removeFilesFromList(this.selectedFiles, this.duplicate.files);
        this.selectedFiles = [];
      } catch (error) {
        console.error('Error deleting selected files:', error);
      }
    },
    selectAllFiles() {
      this.selectedFiles = [...this.duplicate.files];
    },
    removeDuplicateFromList(duplicate) {
      this.$emit('removeDuplicate', duplicate);
    }
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

@media (max-width: 800px) {
  .file-display {
    flex-direction: column;
    align-items: center;
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
.fade-enter, .fade-leave-to /* .fade-leave-active pour <2.1.8 */ {
  opacity: 0;
}
</style>