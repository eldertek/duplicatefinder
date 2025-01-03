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
            <button @click="deleteSelectedDuplicates" :disabled="selectedFiles.length === 0">
              {{ t('duplicatefinder', 'Delete Selected') }}
            </button>
            <button @click="selectAllFiles">{{ t('duplicatefinder', 'Select All') }}</button>
            <div class="dropdown">
              <button class="dropdown-toggle" @click="toggleDropdown">
                <span class="arrow-down"></span>
              </button>
              <div class="dropdown-menu" v-show="showDropdown">
                <button @click="copyFileHash">{{ t('duplicatefinder', 'Copy File Hash') }}</button>
              </div>
            </div>
          </div>
          <div v-for="(file, index) in duplicate.files" :key="file.id" class="file-display">
            <input 
              type="checkbox" 
              v-model="selectedFiles" 
              :value="file" 
              :disabled="file.isInOriginFolder"
              @change="handleFileSelection(file)"
            />
            <DuplicateFileDisplay 
              :file="file" 
              :index="index" 
              :duplicate-acknowledged="duplicate.acknowledged"
              @fileDeleted="removeFileFromListAndUpdate(file)">
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
import { showSuccess } from '@nextcloud/dialogs';
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
      isLoadingNextDuplicate: false,
      showDropdown: false
    };
  },
  methods: {
    async unOrAcknowledgeDuplicate(duplicate) {
      try {
        // Créer une copie du doublon pour viter les mutations directes
        const updatedDuplicate = { ...duplicate };
        
        if (updatedDuplicate.acknowledged) {
          await unacknowledgeDuplicate(updatedDuplicate.hash);
          updatedDuplicate.acknowledged = false;
        } else {
          await acknowledgeDuplicate(updatedDuplicate.hash);
          updatedDuplicate.acknowledged = true;
        }
        
        // Émettre l'événement avec le doublon mis à jour
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
      console.log('DuplicateDetails: Files remaining:', this.duplicate.files.length);
      
      if (this.duplicate.files.length <= 1) {
        console.log('DuplicateDetails: Emitting duplicate-resolved event');
        // Émettre un événement pour indiquer que ce doublon doit être retiré
        this.$emit('duplicate-resolved', {
          duplicate: {
            ...this.duplicate,
            files: [...this.duplicate.files]
          },
          type: this.duplicate.acknowledged ? 'acknowledged' : 'unacknowledged'
        });
      }
    },
    async deleteSelectedDuplicates() {
      try {
        const fileHashes = this.selectedFiles.map(file => file.hash);
        const allInstances = this.duplicate.files.filter(file => fileHashes.includes(file.hash));
        
        // Vérifier si des fichiers protégés sont sélectionnés
        const hasProtectedFiles = this.selectedFiles.some(file => file.isInOriginFolder);
        if (hasProtectedFiles) {
          this.$emit('showError', this.t('duplicatefinder', 'Cannot delete protected files'));
          return;
        }

        if (allInstances.length === this.duplicate.files.length) {
          const confirmDelete = confirm(this.t('duplicatefinder', 'This action will delete all instances of the selected files. Are you sure you want to proceed?'));
          if (!confirmDelete) return;
        }
        
        const { success, errors } = await deleteFiles(this.selectedFiles);
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
      // Ne sélectionner que les fichiers non protégés
      this.selectedFiles = this.duplicate.files.filter(file => !file.isInOriginFolder);
    },
    // Ajouter une méthode pour vérifier si un fichier peut être sélectionné
    canSelectFile(file) {
      return !file.isInOriginFolder;
    },
    // Ajouter une méthode pour gérer la sélection d'un fichier
    handleFileSelection(file) {
      if (!this.canSelectFile(file)) {
        return;
      }
      const index = this.selectedFiles.indexOf(file);
      if (index === -1) {
        this.selectedFiles.push(file);
      } else {
        this.selectedFiles.splice(index, 1);
      }
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

input[type="checkbox"]:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background-color: #cccccc;
}

.dropdown {
  position: relative;
  display: inline-block;
  margin-left: 8px;
}

.dropdown-toggle {
  padding: 8px;
  background: var(--color-background-dark);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  cursor: pointer;
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
  top: 100%;
  background: var(--color-main-background);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  box-shadow: var(--shadow-popup);
  z-index: 100;
  min-width: 150px;
}

.dropdown-menu button {
  display: block;
  width: 100%;
  padding: 8px 12px;
  text-align: left;
  background: none;
  border: none;
  cursor: pointer;
}

.dropdown-menu button:hover {
  background: var(--color-background-hover);
}
</style>