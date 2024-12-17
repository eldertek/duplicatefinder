<template>
    <div class="origin-folders-settings">
        <div class="description">
            {{ t('duplicatefinder', 'Configure folders that should be considered as origin folders. Files in these folders will never be marked as duplicates to be deleted.') }}
        </div>

        <div class="folders-list">
            <div v-for="folder in originFolders" :key="folder.id" class="folder-item">
                <NcButton type="tertiary" @click="removeFolder(folder)">
                    <template #icon>
                        <Delete :size="20" />
                    </template>
                </NcButton>
                <span class="folder-path">{{ folder.path }}</span>
            </div>
        </div>

        <div class="add-folder">
            <NcButton @click="pickFolder">
                <template #icon>
                    <Plus :size="20" />
                </template>
                {{ t('duplicatefinder', 'Add Origin Folder') }}
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
import { loadOriginFolders, saveOriginFolders, deleteOriginFolder } from '@/tools/api'

export default {
    name: 'OriginFoldersSettings',
    components: {
        NcButton,
        Delete,
        Plus,
    },
    data() {
        return {
            originFolders: [],
            selectedFolder: null,
        }
    },
    methods: {
        async pickFolder() {
            const picker = getFilePickerBuilder(t('duplicatefinder', 'Select Origin Folder'))
                .setMultiSelect(false)
                .setMimeTypeFilter(['httpd/unix-directory'])
                .setType(1)
                .allowDirectories()
                .build()

            try {
                const path = await picker.pick()
                if (path) {
                    if (this.originFolders.some(folder => folder.path === path)) {
                        showError(t('duplicatefinder', 'This folder is already an origin folder'))
                        return
                    }
                    
                    await saveOriginFolders([path])
                    await this.loadFolders()
                    
                    showSuccess(t('duplicatefinder', 'Folder added to origin folders'))
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
                // Supprimer du backend d'abord
                await deleteOriginFolder(folder.id)
                
                const index = this.originFolders.findIndex(f => f.id === folder.id)
                if (index !== -1) {
                    this.originFolders.splice(index, 1)
                }
                
                showSuccess(t('duplicatefinder', 'Folder {folder} removed from origin folders', { folder: folder.path }))
            } catch (error) {
                console.error('Error removing folder:', error)
                showError(t('duplicatefinder', 'Failed to remove folder'))
                await this.loadFolders()
            }
        },
        async loadFolders() {
            try {
                this.originFolders = await loadOriginFolders()
            } catch (error) {
                console.error('Error loading origin folders:', error)
                showError(t('duplicatefinder', 'Failed to load origin folders'))
            }
        }
    },
    mounted() {
        this.loadFolders()
    }
}
</script>

<style scoped>
.origin-folders-settings {
    padding: 20px;
}

.description {
    margin-bottom: 20px;
    color: var(--color-text-maxcontrast);
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