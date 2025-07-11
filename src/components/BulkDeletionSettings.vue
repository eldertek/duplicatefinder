<template>
  <div class="bulk-deletion">
    <div v-if="!previewResults" class="bulk-deletion__content">
      <div class="summary-section">
        <NcEmptyContent
          :title="t('duplicatefinder', 'Bulk merge duplicates')"
          :description="t('duplicatefinder', 'Preview and merge multiple duplicates at once while preserving files in protected folders.')"
          :icon="'icon-delete'">
          <template #action>
            <div class="summary-actions">
              <NcButton type="primary" @click="performDryRun" :disabled="isLoading">
                <template #icon>
                  <NcLoadingIcon v-if="isLoading" />
                </template>
                {{ t('duplicatefinder', 'Start preview') }}
              </NcButton>
            </div>
          </template>
        </NcEmptyContent>
      </div>
    </div>

    <div v-else class="bulk-deletion__content">
      <div class="summary-section">
        <template v-if="hasDuplicatesToDelete">
          <p>{{ t('duplicatefinder',
            'Total files to delete: {count}, Space that will be freed: {size}',
            { count: totalFilesToDelete, size: formatBytes(totalSpaceFreed) }) }}</p>
          <div v-if="isLoading" class="loading-info">
            {{ t('duplicatefinder', 'Loading page {current} of {total}…',
              { current: currentPage, total: previewResults.pagination.totalPages }) }}
          </div>
          <div class="summary-actions">
            <NcButton type="tertiary" @click="toggleSelectAll">
              {{ isAllSelected ? t('duplicatefinder', 'Unselect all') : t('duplicatefinder', 'Select all') }}
            </NcButton>
            <NcButton type="error" @click="confirmBulkDelete"
              :disabled="isLoading || !hasSelectedFiles">
              <template #icon>
                <NcLoadingIcon v-if="isLoading" />
              </template>
              {{ t('duplicatefinder', 'Merge selected files') }}
            </NcButton>
          </div>
        </template>
        <template v-else>
          <NcEmptyContent
            :title="t('duplicatefinder', 'No duplicates found')"
            :description="t('duplicatefinder', 'No duplicate files were found that can be deleted. This could be because there are no duplicates, or all duplicates are in protected folders.')"
            :icon="'icon-info'">
            <template #action>
              <NcButton @click="previewResults = null">
                {{ t('duplicatefinder', 'Back') }}
              </NcButton>
            </template>
          </NcEmptyContent>
        </template>
      </div>

      <div v-if="hasDuplicatesToDelete" class="preview-section">
        <div class="preview-details">
          <h3>{{ t('duplicatefinder', 'Files to be deleted') }}</h3>
          <p class="merge-explanation">
            {{ t('duplicatefinder', 'For each duplicate group, at least one file will be preserved.') }}
            <span v-if="hasProtectedFiles">
              {{ t('duplicatefinder', 'Files in origin folders are automatically protected and will not be deleted.') }}
            </span>
          </p>
          <div class="preview-list">
            <div v-for="(group, hash) in previewResults.duplicateGroups" :key="hash" class="duplicate-group">
              <div class="group-header">
                <NcCheckboxRadioSwitch
                  v-if="group.filesToDelete.length > 0"
                  :checked="isGroupSelected(hash)"
                  @update:checked="toggleGroup(hash)"
                  type="checkbox"
                  name="group-select">
                  <span class="group-title">
                    {{ t('duplicatefinder', 'Duplicate group') }}
                    <span class="group-stats">
                      ({{ t('duplicatefinder', '{selected} of {total} files selected',
                        {
                          selected: selectedFiles[hash]?.length || 0,
                          total: group.filesToDelete.length
                        }) }})
                      <span v-if="group.protectedFileCount > 0" class="protected-info">
                        - {{ t('duplicatefinder', '{count} protected files in origin folders', { count: group.protectedFileCount }) }}
                      </span>
                    </span>
                  </span>
                </NcCheckboxRadioSwitch>
                <div v-else class="protected-only-notice">
                  <span class="group-title">
                    {{ t('duplicatefinder', 'Duplicate group (all files protected)') }}
                    <span class="protected-info">
                      - {{ t('duplicatefinder', 'All {count} files are in origin folders and cannot be deleted', { count: group.protectedFileCount }) }}
                    </span>
                  </span>
                </div>
              </div>
              <div class="group-content">
                <div v-for="(file, index) in group.filesToDelete" :key="index" class="file-display">
                  <div class="file-checkbox">
                    <NcCheckboxRadioSwitch
                      :checked="isFileSelected(hash, index)"
                      @update:checked="toggleFile(hash, index)"
                      type="checkbox"
                      name="file-select">
                      <div class="file-info">
                        <span v-html="file.humanizedPath"></span>
                        <span class="file-size">{{ formatBytes(file.size) }}</span>
                      </div>
                    </NcCheckboxRadioSwitch>
                  </div>
                </div>
                <div class="group-actions">
                  <NcButton type="tertiary" @click="previewGroupMerge(hash)" class="preview-button">
                    {{ t('duplicatefinder', 'Preview') }}
                  </NcButton>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { NcButton, NcCheckboxRadioSwitch, NcEmptyContent, NcLoadingIcon } from '@nextcloud/vue'
import { fetchDuplicatesForBulk, deleteFiles } from '@/tools/api'
import { openFileInViewer } from '@/tools/utils'

export default {
  name: 'BulkDeletionSettings',
  components: {
    NcButton,
    NcCheckboxRadioSwitch,
    NcEmptyContent,
    NcLoadingIcon
  },
  data() {
    return {
      isLoading: false,
      previewResults: null,
      currentPage: 1,
      hasMorePages: false,
      limit: 100,
      selectedFiles: {}
    }
  },
  computed: {
    hasDuplicatesToDelete() {
      return this.previewResults &&
             Object.keys(this.previewResults.duplicateGroups).length > 0
    },
    hasSelectedFiles() {
      if (!this.previewResults) return false
      return Object.values(this.selectedFiles).some(files => files.length > 0)
    },
    totalFilesToDelete() {
      if (!this.previewResults) return 0
      return Object.values(this.selectedFiles).reduce((total, files) => total + files.length, 0)
    },
    totalSpaceFreed() {
      if (!this.previewResults) return 0
      return Object.entries(this.selectedFiles).reduce((total, [hash, selectedIndexes]) => {
        const group = this.previewResults.duplicateGroups[hash]
        return total + selectedIndexes.reduce((sum, index) =>
          sum + group.filesToDelete[index].size, 0)
      }, 0)
    },
    hasProtectedFiles() {
      if (!this.previewResults) return false
      return Object.values(this.previewResults.duplicateGroups).some(group => 
        group.protectedFileCount > 0
      )
    },
    isAllSelected() {
      if (!this.previewResults) return false
      return Object.values(this.previewResults.duplicateGroups).every(group =>
        this.selectedFiles[group.hash]?.length === group.filesToDelete.length
      )
    }
  },
  methods: {
    formatBytes(bytes) {
      if (bytes === 0) return '0 Bytes'
      const k = 1024
      const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
      const i = Math.floor(Math.log(bytes) / Math.log(k))
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    },
    humanizePath(path) {
      // Remove /admin/files/ prefix
      let humanized = path.replace(/^\/[^/]+\/files\//, '/')

      // Split path into directory and filename
      const parts = humanized.split('/')
      const fileName = parts.pop()
      const directory = parts.join('/')

      // If there's a directory path, show it in a lighter color
      if (directory) {
        return `<span class="path-directory">${directory}/</span><span class="path-filename">${fileName}</span>`
      }

      return `<span class="path-filename">${fileName}</span>`
    },
    async loadPage(page) {
      try {
        const response = await fetchDuplicatesForBulk(this.limit, page)

        // Transform entities into expected interface format
        const duplicateGroups = { ...(this.previewResults?.duplicateGroups || {}) }

        // Initialize arrays for each group
        response.entities.forEach(entity => {
          if (!this.selectedFiles[entity.hash]) {
            this.$set(this.selectedFiles, entity.hash, [])
          }
        })

        response.entities.forEach(entity => {
          duplicateGroups[entity.hash] = {
            hash: entity.hash,
            filesToDelete: entity.files.map(file => ({
              path: file.path,
              humanizedPath: this.humanizePath(file.path),
              size: file.size,
              nodeId: file.nodeId,
              mimetype: file.mimetype || 'application/octet-stream'
            }))
          }
        })

        this.previewResults = {
          duplicateGroups,
          pagination: response.pagination
        }

        this.hasMorePages = page < response.pagination.totalPages
        this.currentPage = page
      } catch (error) {
        console.error('Error loading page:', error)
      }
    },
    async performDryRun() {
      this.isLoading = true
      try {
        await this.loadPage(1)
        if (this.hasMorePages) {
          await this.loadRemainingPages()
        }
      } catch (error) {
        console.error('Error during dry run:', error)
      } finally {
        this.isLoading = false
      }
    },
    async loadRemainingPages() {
      const totalPages = this.previewResults.pagination.totalPages
      const remainingPages = Array.from(
        { length: totalPages - this.currentPage },
        (_, i) => i + this.currentPage + 1
      )

      // Load remaining pages in parallel with a reasonable chunk size
      const chunkSize = 5
      for (let i = 0; i < remainingPages.length; i += chunkSize) {
        const chunk = remainingPages.slice(i, i + chunkSize)
        await Promise.all(chunk.map(page => this.loadPage(page)))
      }
    },
    isGroupSelected(hash) {
      const group = this.previewResults.duplicateGroups[hash]
      return this.selectedFiles[hash]?.length === group.filesToDelete.length
    },
    isFileSelected(hash, index) {
      return this.selectedFiles[hash]?.includes(index) || false
    },
    toggleGroup(hash) {
      const group = this.previewResults.duplicateGroups[hash]
      const isSelected = !this.isGroupSelected(hash)

      if (isSelected) {
        this.$set(this.selectedFiles, hash,
          Array.from({ length: group.filesToDelete.length }, (_, i) => i)
        )
      } else {
        this.$set(this.selectedFiles, hash, [])
      }
    },
    toggleFile(hash, index) {
      if (!this.selectedFiles[hash]) {
        this.$set(this.selectedFiles, hash, [])
      }

      const selectedIndex = this.selectedFiles[hash].indexOf(index)
      if (selectedIndex === -1) {
        this.selectedFiles[hash].push(index)
      } else {
        this.selectedFiles[hash].splice(selectedIndex, 1)
      }
    },
    previewGroupMerge(hash) {
      // Get the first file from the group to preview
      const group = this.previewResults.duplicateGroups[hash];

      if (group && group.filesToDelete && group.filesToDelete.length > 0) {
        // We need to create a file object that has the necessary properties for the viewer
        const file = {
          path: group.filesToDelete[0].path,
          nodeId: group.filesToDelete[0].nodeId || '',
          mimetype: group.filesToDelete[0].mimetype || 'application/octet-stream'
        };

        // Open the file in the viewer
        openFileInViewer(file);
      }
    },

    async confirmBulkDelete() {
      if (!confirm(t('duplicatefinder', 'Are you sure you want to merge all selected duplicates? This action cannot be undone.'))) {
        return
      }

      // Ensure at least one file per group is preserved
      let allGroupsValid = true;
      Object.entries(this.selectedFiles).forEach(([hash, selectedIndexes]) => {
        const group = this.previewResults.duplicateGroups[hash];
        // Check if protected files exist for this group
        const hasProtectedFiles = group.protectedFileCount > 0;
        
        if (selectedIndexes.length === group.filesToDelete.length && !hasProtectedFiles) {
          // If all files in a group are selected and no protected copies exist, deselect one to preserve it
          this.selectedFiles[hash] = selectedIndexes.slice(0, -1);
          allGroupsValid = false;
        }
      });

      if (!allGroupsValid) {
        alert(t('duplicatefinder', 'Some groups had all files selected. One file from each group has been automatically preserved.'));
      }

      const filesToDelete = Object.entries(this.selectedFiles).flatMap(([hash, selectedIndexes]) => {
        const group = this.previewResults.duplicateGroups[hash]
        return selectedIndexes.map(index => ({
          path: group.filesToDelete[index].path,
          size: group.filesToDelete[index].size
        }))
      })

      this.isLoading = true
      try {
        const { success, errors } = await deleteFiles(filesToDelete)

        if (success.length > 0) {
          this.$emit('duplicates-deleted')
          this.previewResults = null
          this.selectedFiles = {}
        }

        if (errors.length > 0) {
          console.error('Some files could not be deleted:', errors)
        }
      } catch (error) {
        console.error('Error during bulk deletion:', error)
      } finally {
        this.isLoading = false
      }
    },
    toggleSelectAll() {
      if (this.isAllSelected) {
        // Unselect all
        Object.keys(this.selectedFiles).forEach(hash => {
          this.$set(this.selectedFiles, hash, [])
        })
      } else {
        // Select all
        Object.keys(this.previewResults.duplicateGroups).forEach(hash => {
          const group = this.previewResults.duplicateGroups[hash]
          this.$set(this.selectedFiles, hash,
            Array.from({ length: group.filesToDelete.length }, (_, i) => i)
          )
        })
      }
    }
  }
}
</script>

<style scoped>
.bulk-deletion {
  height: 100%;
  padding: var(--default-grid-baseline, 4px) 0;
}

.bulk-deletion__content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 var(--default-grid-baseline, 4px);
}

.summary-section {
  margin-top: 50px;
  margin-bottom: 20px;
  padding: 10px;
  border-radius: 5px;
  font-weight: bold;
  text-align: center;
  width: 100%;
}

.summary-actions {
  margin-top: 10px;
  display: flex;
  justify-content: center;
  gap: 10px;
}

.preview-section {
  background-color: var(--color-main-background);
  border-radius: var(--border-radius-large);
  padding: 20px;
}

.file-display {
  width: calc(100% - 20px);
  display: flex;
  align-items: center;
  margin-bottom: 10px;
  margin-left: 10px;
  margin-right: 10px;
  border: 1px solid var(--color-border);
  padding: 10px;
  border-radius: var(--border-radius);
  position: relative;
  transition: all 0.2s ease;
}

.file-display:hover {
  background: var(--color-background-hover);
  border-color: var(--color-primary);
}

.duplicate-group {
  margin: 15px 0;
  padding: 15px;
  background: var(--color-background-hover);
  border-radius: var(--border-radius);
  transition: background-color 0.2s ease;
}

.duplicate-group:hover {
  background: var(--color-background-dark);
}

.group-header {
  margin-bottom: 10px;
}

.group-content {
  margin-left: 20px;
}

.path-directory {
  color: var(--color-text-maxcontrast);
}

.path-filename {
  color: var(--color-text-default);
}

.group-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: bold;
}

.group-stats {
  color: var(--color-text-maxcontrast);
  font-weight: normal;
}

.file-checkbox {
  width: 100%;
}

.file-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  gap: 10px;
}

.file-size {
  color: var(--color-text-maxcontrast);
  white-space: nowrap;
}

@media (max-width: 800px) {
  .file-info {
    flex-direction: column;
    align-items: flex-start;
  }

  .file-size {
    margin-left: 20px;
  }
}

.loading-info {
  color: var(--color-text-maxcontrast);
  font-size: 0.9em;
  margin: 10px 0;
}

.protected-info {
  color: var(--color-warning);
  font-weight: normal;
  font-size: 0.9em;
}

.protected-only-notice {
  padding: 10px;
  background-color: var(--color-background-hover);
  border-radius: var(--border-radius);
  opacity: 0.7;
}

.protected-only-notice .group-title {
  display: block;
  color: var(--color-text-lighter);
}

.merge-explanation {
  font-size: 0.9em;
  color: var(--color-text-maxcontrast);
  margin-bottom: 15px;
}

.group-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
  margin-right: 10px;
}

.preview-button {
  background-color: #17a2b8;
  color: white;
  border: none;
  padding: 5px 10px;
  border-radius: 3px;
  cursor: pointer;
  transition: background-color 0.3s ease;
}

.preview-button:hover {
  background-color: #138496;
}
</style>
