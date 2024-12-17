<template>
    <div class="origin-folders-settings">
        <div class="description">
            {{ t('duplicatefinder', 'Configure folders that should be considered as origin folders. Files in these folders will never be marked as duplicates to be deleted.') }}
        </div>

        <div class="folders-list">
            <div v-for="(folder, index) in originFolders" :key="index" class="folder-item">
                <NcButton type="tertiary" @click="removeFolder(index)">
                    <template #icon>
                        <Delete :size="20" />
                    </template>
                </NcButton>
                <span class="folder-path">{{ folder }}</span>
            </div>
        </div>

        <div class="add-folder">
            <NcButton @click="showFolderPicker = true">
                <template #icon>
                    <Plus :size="20" />
                </template>
                {{ t('duplicatefinder', 'Add Origin Folder') }}
            </NcButton>
        </div>

        <NcModal v-if="showFolderPicker" 
                @close="showFolderPicker = false"
                :title="t('duplicatefinder', 'Select Origin Folder')">
            <!-- Here we'll need to implement a folder picker component -->
            <div class="folder-picker">
                <!-- Placeholder for folder picker -->
                <p>{{ t('duplicatefinder', 'Folder picker will be implemented here') }}</p>
            </div>
            <template #actions>
                <NcButton type="primary" @click="addFolder">
                    {{ t('duplicatefinder', 'Add') }}
                </NcButton>
                <NcButton type="tertiary" @click="showFolderPicker = false">
                    {{ t('duplicatefinder', 'Cancel') }}
                </NcButton>
            </template>
        </NcModal>
    </div>
</template>

<script>
import { NcButton, NcModal } from '@nextcloud/vue'
import Delete from 'vue-material-design-icons/Delete'
import Plus from 'vue-material-design-icons/Plus'

export default {
    name: 'OriginFoldersSettings',
    components: {
        NcButton,
        NcModal,
        Delete,
        Plus,
    },
    data() {
        return {
            originFolders: [],
            showFolderPicker: false,
        }
    },
    methods: {
        removeFolder(index) {
            this.originFolders.splice(index, 1)
            this.saveOriginFolders()
        },
        addFolder() {
            // TODO: Implement folder selection logic
            this.showFolderPicker = false
            this.saveOriginFolders()
        },
        async saveOriginFolders() {
            // TODO: Implement API call to save origin folders
            try {
                // await saveOriginFolders(this.originFolders)
                // Show success message
            } catch (error) {
                // Show error message
            }
        },
        async loadOriginFolders() {
            // TODO: Implement API call to load origin folders
            try {
                // const folders = await loadOriginFolders()
                // this.originFolders = folders
            } catch (error) {
                // Show error message
            }
        }
    },
    mounted() {
        this.loadOriginFolders()
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
    padding: 5px;
    background-color: var(--color-background-hover);
    border-radius: var(--border-radius);
}

.folder-path {
    margin-left: 10px;
}

.add-folder {
    margin-top: 20px;
}

.folder-picker {
    min-height: 300px;
    border: 2px dashed var(--color-border);
    border-radius: var(--border-radius);
    margin: 20px 0;
    padding: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
}
</style> 