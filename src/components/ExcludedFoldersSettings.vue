<template>
    <div class="excluded-folders-settings">
        <div class="description">
            <div class="header">
                <FolderRemove :size="20" />
                {{ t('duplicatefinder', 'Configure folders that should be excluded from duplicate scanning. Files in these folders (and subfolders) will be ignored during duplicate detection.') }}
            </div>
        </div>

        <div class="folders-list">
            <div v-for="folder in excludedFolders" :key="folder.id" class="folder-item">
                <NcButton type="tertiary" @click="removeFolder(folder)">
                    <template #icon>
                        <Delete :size="20" />
                    </template>
                </NcButton>
                <span class="folder-path">{{ folder.folderPath }}</span>
            </div>
        </div>

        <div class="add-folder">
            <NcButton @click="pickFolder">
                <template #icon>
                    <Plus :size="20" />
                </template>
                {{ t('duplicatefinder', 'Add Excluded Folder') }}
            </NcButton>
        </div>
    </div>
</template>

<script>
import { showError, showSuccess } from '@nextcloud/dialogs'
import { getFilePickerBuilder } from '@nextcloud/dialogs'
import { NcButton } from '@nextcloud/vue'
import Delete from 'vue-material-design-icons/Delete'
import Plus from 'vue-material-design-icons/Plus'
import FolderRemove from 'vue-material-design-icons/FolderRemove'
import { loadExcludedFolders, saveExcludedFolder, deleteExcludedFolder } from '@/tools/api'

export default {
    name: 'ExcludedFoldersSettings',
    components: {
        NcButton,
        Delete,
        Plus,
        FolderRemove,
    },
    data() {
        return {
            excludedFolders: [],
        }
    },
    methods: {
        async pickFolder() {
            const picker = getFilePickerBuilder(t('duplicatefinder', 'Select Folder to Exclude'))
                .setMultiSelect(false)
                .setMimeTypeFilter(['httpd/unix-directory'])
                .setType(1)
                .allowDirectories()
                .build()

            try {
                const path = await picker.pick()
                if (path) {
                    if (this.excludedFolders.some(folder => folder.folderPath === path)) {
                        showError(t('duplicatefinder', 'This folder is already excluded'))
                        return
                    }
                    
                    await saveExcludedFolder(path)
                    await this.loadFolders()
                }
            } catch (error) {
                console.error('Error picking folder:', error)
                await this.loadFolders()
            }
        },
        async removeFolder(folder) {
            if (!folder.id) {
                console.error('Cannot remove folder without ID:', folder)
                showError(t('duplicatefinder', 'Invalid folder data'))
                return
            }

            try {
                await deleteExcludedFolder(folder.id)
                const index = this.excludedFolders.findIndex(f => f.id === folder.id)
                if (index !== -1) {
                    this.excludedFolders.splice(index, 1)
                }
                
                showSuccess(t('duplicatefinder', 'Folder {folder} removed from excluded folders', { folder: folder.folderPath }))
            } catch (error) {
                console.error('Error removing folder:', error)
                showError(t('duplicatefinder', 'Failed to remove folder'))
                await this.loadFolders()
            }
        },
        async loadFolders() {
            try {
                this.excludedFolders = await loadExcludedFolders()
            } catch (error) {
                console.error('Error loading excluded folders:', error)
                showError(t('duplicatefinder', 'Failed to load excluded folders'))
            }
        }
    },
    mounted() {
        this.loadFolders()
    }
}
</script>

<style scoped>
.excluded-folders-settings {
    padding: 20px;
}

.description {
    margin-bottom: 20px;
    color: var(--color-text-maxcontrast);
}

.header {
    display: flex;
    align-items: center;
    gap: 8px;
}

.header :deep(svg) {
    color: var(--color-primary-element);
}

.folders-list {
    margin: 20px 0;
}

.folder-item {
    display: flex;
    align-items: center;
    margin-bottom: 10px;
    padding: 8px;
    background-color: var(--color-background-hover);
    border-radius: var(--border-radius);
}

.folder-path {
    margin-left: 10px;
    flex-grow: 1;
    word-break: break-all;
}

.add-folder {
    margin-top: 20px;
}
</style> 