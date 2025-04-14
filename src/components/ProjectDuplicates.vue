<template>
    <div class="project-duplicates">
        <div class="project-header">
            <div class="project-info">
                <h2>{{ project ? project.name : t('duplicatefinder', 'Project') }}</h2>
                <div class="project-meta" v-if="project">
                    <span v-if="project.lastScan">
                        {{ t('duplicatefinder', 'Last scan: {date}', { date: formatDate(project.lastScan) }) }}
                    </span>
                    <span v-else>
                        {{ t('duplicatefinder', 'Never scanned') }}
                    </span>
                    <span class="folders-count">
                        {{ t('duplicatefinder', '{count} folders included', { count: project.folders.length }) }}
                    </span>
                </div>
            </div>
            <div class="project-actions">

                <NcButton type="primary" @click="refreshScan">
                    <template #icon>
                        <Refresh :size="20" />
                    </template>
                    {{ t('duplicatefinder', 'Refresh Scan') }}
                </NcButton>
            </div>
        </div>

        <NcLoadingIcon v-if="isLoading" />

        <div v-else-if="duplicates.length > 0" class="duplicates-list">
            <div class="duplicates-header">
                <h3>{{ t('duplicatefinder', 'Duplicates Found') }}</h3>
            </div>

            <div v-for="duplicate in duplicates" :key="duplicate.id" class="duplicate-item">
                <div class="duplicate-header">
                    <h4>
                        {{ duplicate.hash.substring(0, 8) }}
                        <span class="file-count">
                            {{ t('duplicatefinder', '{count} duplicate files', { count: duplicate.files.length }) }}
                        </span>
                    </h4>
                    <NcButton type="primary" @click="viewDuplicate(duplicate)">
                        {{ t('duplicatefinder', 'View Details') }}
                    </NcButton>
                </div>
                <div class="duplicate-files">
                    <div v-for="(file, index) in duplicate.files.slice(0, 3)" :key="index" class="file-preview">
                        <div class="file-icon" :style="getFileIconStyle(file)"></div>
                        <div class="file-info">
                            <div class="file-name">{{ getFileName(file.path) }}</div>
                            <div class="file-path">{{ getFilePath(file.path) }}</div>
                            <div class="file-size">{{ formatBytes(file.size) }}</div>
                        </div>
                    </div>
                    <div v-if="duplicate.files.length > 3" class="more-files">
                        {{ t('duplicatefinder', 'and {count} more files...', { count: duplicate.files.length - 3 }) }}
                    </div>
                </div>
            </div>

            <div class="pagination" v-if="pagination.totalPages > 1">
                <NcPagination
                    :page="pagination.currentPage"
                    :total-items="pagination.totalItems"
                    :limit="limit"
                    @update:page="changePage"
                />
            </div>
        </div>
    </div>
</template>

<script>
import { NcButton, NcLoadingIcon, NcPagination } from '@nextcloud/vue'

import Refresh from 'vue-material-design-icons/Refresh'
import { fetchProject, fetchProjectDuplicates, scanProject } from '@/tools/api'
import { showError, showSuccess } from '@nextcloud/dialogs'

export default {
    name: 'ProjectDuplicates',
    components: {
        NcButton,
        NcLoadingIcon,
        NcPagination,

        Refresh
    },
    props: {
        projectId: {
            type: Number,
            required: true
        }
    },
    data() {
        return {
            project: null,
            duplicates: [],
            isLoading: true,
            pagination: {
                currentPage: 1,
                totalPages: 1,
                totalItems: 0
            },
            limit: 10
        }
    },
    watch: {
        projectId() {
            this.loadProject()
        }
    },
    methods: {
        async loadProject() {
            this.isLoading = true
            try {
                this.project = await fetchProject(this.projectId)
                await this.loadDuplicates()
            } catch (error) {
                console.error('Error loading project:', error)
                showError(t('duplicatefinder', 'Failed to load project'))
            } finally {
                this.isLoading = false
            }
        },

        async loadDuplicates() {
            this.isLoading = true
            try {
                const result = await fetchProjectDuplicates(
                    this.projectId,
                    'all',
                    this.pagination.currentPage,
                    this.limit
                )

                this.duplicates = result.entities
                this.pagination = result.pagination
            } catch (error) {
                console.error('Error loading duplicates:', error)
                showError(t('duplicatefinder', 'Failed to load duplicates'))
            } finally {
                this.isLoading = false
            }
        },

        async refreshScan() {
            try {
                this.isLoading = true
                await scanProject(this.projectId)
                showSuccess(t('duplicatefinder', 'Project scan initiated. This may take a while.'))

                // Wait a bit before reloading to give the scan time to start
                setTimeout(() => {
                    this.loadDuplicates()
                }, 2000)
            } catch (error) {
                console.error('Error refreshing scan:', error)
                this.isLoading = false
            }
        },

        changePage(page) {
            this.pagination.currentPage = page
            this.loadDuplicates()
        },



        viewDuplicate(duplicate) {
            this.$emit('view-duplicate', duplicate)
        },

        getFileName(path) {
            if (!path) return ''
            const parts = path.split('/')
            return parts[parts.length - 1]
        },

        getFilePath(path) {
            if (!path) return ''
            const parts = path.split('/')
            parts.pop() // Remove filename
            return parts.join('/')
        },

        getFileIconStyle(file) {
            const mimeType = file.mimetype || 'application/octet-stream'
            const iconUrl = OC.MimeType.getIconUrl(mimeType)
            return {
                backgroundImage: `url(${iconUrl})`
            }
        },

        formatBytes(bytes, decimals = 2) {
            if (bytes === 0) return '0 Bytes'

            const k = 1024
            const dm = decimals < 0 ? 0 : decimals
            const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

            const i = Math.floor(Math.log(bytes) / Math.log(k))

            return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
        },

        formatDate(dateString) {
            if (!dateString) return ''

            const date = new Date(dateString)
            return date.toLocaleString()
        }
    },
    mounted() {
        this.loadProject()
    }
}
</script>

<style scoped>
.project-duplicates {
    padding: 20px;
}

.project-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 20px;
    flex-wrap: wrap;
    gap: 20px;
}

.project-info h2 {
    margin: 0 0 5px 0;
}

.project-meta {
    display: flex;
    gap: 15px;
    color: var(--color-text-maxcontrast);
    font-size: 14px;
}

.project-actions {
    display: flex;
    gap: 10px;
}

.duplicates-header {
    display: flex;
    align-items: center;
    margin-bottom: 15px;
}

.duplicates-header h3 {
    margin: 0;
}

.duplicate-item {
    margin-bottom: 20px;
    padding: 16px;
    background-color: var(--color-background-hover);
    border-radius: var(--border-radius);
    border: 1px solid var(--color-border);
}

.duplicate-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;
}

.duplicate-header h4 {
    margin: 0;
    font-size: 16px;
}

.file-count {
    margin-left: 10px;
    font-weight: normal;
    font-size: 14px;
    color: var(--color-text-maxcontrast);
}

.duplicate-files {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.file-preview {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px;
    background-color: var(--color-background-dark);
    border-radius: var(--border-radius);
}

.file-icon {
    width: 32px;
    height: 32px;
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center;
}

.file-info {
    flex: 1;
    overflow: hidden;
}

.file-name {
    font-weight: bold;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.file-path {
    font-size: 12px;
    color: var(--color-text-maxcontrast);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.file-size {
    font-size: 12px;
}

.more-files {
    font-style: italic;
    color: var(--color-text-maxcontrast);
    padding: 5px;
    text-align: center;
}

.pagination {
    margin-top: 20px;
    display: flex;
    justify-content: center;
}

.empty-state {
    text-align: center;
    padding: 40px 0;
    color: var(--color-text-maxcontrast);
}

.empty-state .icon-search {
    background-size: 48px;
    height: 48px;
    width: 48px;
    margin: 0 auto 20px;
}

.empty-state button {
    margin-top: 20px;
}
</style>
