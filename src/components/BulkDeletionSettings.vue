<template>
  <div class="bulk-deletion-settings">
    <div class="settings-section">
      <h3>{{ t('duplicatefinder', 'Bulk Deletion Settings') }}</h3>
      <p class="settings-hint">
        {{ t('duplicatefinder', 'Configure how to handle duplicates outside of protected folders') }}
      </p>

      <div class="preview-section" v-if="previewResults.length">
        <h4>{{ t('duplicatefinder', 'Preview of files to be deleted') }}</h4>
        <div class="preview-list">
          <div v-for="(result, index) in previewResults" :key="index" class="preview-item">
            <NcCheckboxRadioSwitch
              :checked.sync="result.selected"
              @update:checked="updateSelection(index)">
              {{ result.path }}
            </NcCheckboxRadioSwitch>
            <span class="preview-reason">
              {{ t('duplicatefinder', 'Duplicate of {originalPath}', { originalPath: result.originalPath }) }}
            </span>
          </div>
        </div>
      </div>

      <div class="actions">
        <NcButton type="primary" @click="performDryRun" :disabled="isLoading">
          {{ t('duplicatefinder', 'Preview Deletions') }}
        </NcButton>
        <NcButton type="error" @click="confirmBulkDelete" 
          :disabled="isLoading || !hasSelectedFiles">
          {{ t('duplicatefinder', 'Delete Selected Files') }}
        </NcButton>
      </div>
    </div>
  </div>
</template>

<script>
import { showError, showSuccess } from '@nextcloud/dialogs'
import { NcButton, NcCheckboxRadioSwitch } from '@nextcloud/vue'
import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'

export default {
  name: 'BulkDeletionSettings',
  components: {
    NcButton,
    NcCheckboxRadioSwitch
  },
  data() {
    return {
      isLoading: false,
      previewResults: [],
    }
  },
  computed: {
    hasSelectedFiles() {
      return this.previewResults.some(result => result.selected)
    }
  },
  methods: {
    async performDryRun() {
      this.isLoading = true
      try {
        const response = await axios.get(generateUrl('/apps/duplicatefinder/api/duplicates/dry-run'))
        this.previewResults = response.data.results.map(result => ({
          ...result,
          selected: true
        }))
        showSuccess(t('duplicatefinder', 'Preview generated successfully'))
      } catch (error) {
        console.error('Error during dry run:', error)
        showError(t('duplicatefinder', 'Could not generate preview'))
      } finally {
        this.isLoading = false
      }
    },
    updateSelection(index) {
      this.previewResults[index].selected = !this.previewResults[index].selected
    },
    async confirmBulkDelete() {
      if (!confirm(t('duplicatefinder', 'Are you sure you want to delete all selected duplicates? This action cannot be undone.'))) {
        return
      }

      const selectedPaths = this.previewResults
        .filter(result => result.selected)
        .map(result => result.path)

      this.isLoading = true
      try {
        await axios.post(generateUrl('/apps/duplicatefinder/api/duplicates/bulk-delete'), {
          paths: selectedPaths
        })
        showSuccess(t('duplicatefinder', 'Selected duplicates deleted successfully'))
        this.$emit('duplicates-deleted')
        this.previewResults = []
      } catch (error) {
        console.error('Error during bulk deletion:', error)
        showError(t('duplicatefinder', 'Could not delete duplicates'))
      } finally {
        this.isLoading = false
      }
    }
  }
}
</script>

<style scoped>
.bulk-deletion-settings {
  margin: 20px 0;
}

.settings-hint {
  color: var(--color-text-maxcontrast);
  margin-bottom: 20px;
}

.preview-section {
  margin: 20px 0;
  max-height: 400px;
  overflow-y: auto;
}

.preview-item {
  display: flex;
  align-items: center;
  margin: 8px 0;
  padding: 8px;
  background: var(--color-background-hover);
  border-radius: var(--border-radius);
}

.preview-reason {
  margin-left: 10px;
  color: var(--color-text-maxcontrast);
  font-size: 0.9em;
}

.actions {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}
</style> 