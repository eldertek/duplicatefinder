<template>
    <div class="projects-settings">
        <div class="description">
            <div class="header">
                <FolderMultiple :size="20" />
                {{ t('duplicatefinder', 'Create and manage projects to scan specific folders for duplicates. Projects allow you to focus on deduplicating files in particular areas without scanning your entire storage.') }}
            </div>
        </div>

        <div class="projects-list" v-if="projects.length > 0">
            <h3>{{ t('duplicatefinder', 'Your Projects') }}</h3>
            <div v-for="project in projects" :key="project.id" class="project-item">
                <div class="project-header">
                    <div class="project-title">
                        <h4>{{ project.name }}</h4>
                        <span class="project-date" v-if="project.lastScan">
                            {{ t('duplicatefinder', 'Last scan: {date}', { date: formatDate(project.lastScan) }) }}
                        </span>
                        <span class="project-date" v-else>
                            {{ t('duplicatefinder', 'Never scanned') }}
                        </span>
                    </div>
                    <div class="project-actions">
                        <NcButton type="tertiary" @click="editProject(project)" :aria-label="t('duplicatefinder', 'Edit project')">
                            <template #icon>
                                <Pencil :size="20" />
                            </template>
                            {{ t('duplicatefinder', 'Edit') }}
                        </NcButton>
                        <NcButton type="tertiary" @click="confirmDeleteProject(project)" :aria-label="t('duplicatefinder', 'Delete project')">
                            <template #icon>
                                <Delete :size="20" />
                            </template>
                            {{ t('duplicatefinder', 'Delete') }}
                        </NcButton>
                        <NcButton type="primary" @click="startProjectScan(project.id)" :aria-label="t('duplicatefinder', 'Start project scan')">
                            <template #icon>
                                <Magnify :size="20" />
                            </template>
                            {{ t('duplicatefinder', 'Start Scan') }}
                        </NcButton>
                        <NcButton type="primary" @click="viewProjectResults(project.id)" v-if="project.lastScan" :aria-label="t('duplicatefinder', 'View project results')">
                            <template #icon>
                                <Eye :size="20" />
                            </template>
                            {{ t('duplicatefinder', 'View Results') }}
                        </NcButton>
                    </div>
                </div>
                <div class="project-folders">
                    <h5>{{ t('duplicatefinder', 'Included Folders:') }}</h5>
                    <ul>
                        <li v-for="(folder, index) in project.folders" :key="index">
                            {{ folder }}
                        </li>
                    </ul>
                </div>
            </div>
        </div>

        <div class="empty-state" v-else>
            <div class="icon-folder"></div>
            <h3>{{ t('duplicatefinder', 'No projects yet') }}</h3>
            <p>{{ t('duplicatefinder', 'Create a project to scan specific folders for duplicates') }}</p>
        </div>

        <div class="add-project">
            <NcButton @click="showCreateProjectModal = true" :aria-label="t('duplicatefinder', 'Create new project')">
                <template #icon>
                    <Plus :size="20" />
                </template>
                {{ t('duplicatefinder', 'Create New Project') }}
            </NcButton>
        </div>

        <!-- Create/Edit Project Modal -->
        <NcModal v-if="showCreateProjectModal"
                 :title="editingProject ? t('duplicatefinder', 'Edit Project') : t('duplicatefinder', 'Create New Project')"
                 @close="cancelProjectModal">
            <div class="project-form">
                <div class="form-group">
                    <NcInputField id="project-name"
                                 :value="projectForm.name"
                                 @update:value="projectForm.name = $event"
                                 :label="t('duplicatefinder', 'Project Name')"
                                 :placeholder="t('duplicatefinder', 'Enter a name for your project')" />
                </div>

                <div class="form-group">
                    <label>{{ t('duplicatefinder', 'Selected Folders') }}</label>
                    <div class="selected-folders">
                        <div v-for="(folder, index) in projectForm.folders" :key="index" class="selected-folder">
                            <span>{{ folder }}</span>
                            <NcButton type="tertiary" @click="removeFolder(index)" :aria-label="t('duplicatefinder', 'Remove folder')">
                                <template #icon>
                                    <Close :size="16" />
                                </template>
                            </NcButton>
                        </div>
                        <div v-if="projectForm.folders.length === 0" class="no-folders">
                            {{ t('duplicatefinder', 'No folders selected') }}
                        </div>
                    </div>
                </div>

                <div class="form-actions">
                    <NcButton @click="pickFolder" :aria-label="t('duplicatefinder', 'Add folder to project')">
                        <template #icon>
                            <FolderPlus :size="20" />
                        </template>
                        {{ t('duplicatefinder', 'Add Folder') }}
                    </NcButton>

                    <div class="modal-buttons">
                        <NcButton type="tertiary" @click="cancelProjectModal" :aria-label="t('duplicatefinder', 'Cancel project creation')">
                            {{ t('duplicatefinder', 'Cancel') }}
                        </NcButton>
                        <NcButton type="primary"
                                  @click="saveProject"
                                  :disabled="!projectForm.name || projectForm.folders.length === 0"
                                  :aria-label="editingProject ? t('duplicatefinder', 'Update project') : t('duplicatefinder', 'Create project')">
                            {{ editingProject ? t('duplicatefinder', 'Update Project') : t('duplicatefinder', 'Create Project') }}
                        </NcButton>
                    </div>
                </div>
            </div>
        </NcModal>

        <!-- Delete Confirmation Modal -->
        <NcModal v-if="showDeleteModal"
                 :title="t('duplicatefinder', 'Delete Project')"
                 @close="showDeleteModal = false">
            <div class="delete-confirmation">
                <p>{{ t('duplicatefinder', 'Are you sure you want to delete the project "{name}"?', { name: projectToDelete?.name }) }}</p>
                <p>{{ t('duplicatefinder', 'This action cannot be undone.') }}</p>

                <div class="modal-buttons">
                    <NcButton type="tertiary" @click="showDeleteModal = false" :aria-label="t('duplicatefinder', 'Cancel project deletion')">
                        {{ t('duplicatefinder', 'Cancel') }}
                    </NcButton>
                    <NcButton type="error" @click="deleteProjectConfirmed" :aria-label="t('duplicatefinder', 'Confirm project deletion')">
                        {{ t('duplicatefinder', 'Delete Project') }}
                    </NcButton>
                </div>
            </div>
        </NcModal>
    </div>
</template>

<script>
import { showError, showSuccess } from '@nextcloud/dialogs'
import { getFilePickerBuilder } from '@nextcloud/dialogs'
import { NcButton, NcModal, NcInputField } from '@nextcloud/vue'
import Delete from 'vue-material-design-icons/Delete'
import Plus from 'vue-material-design-icons/Plus'
import Pencil from 'vue-material-design-icons/Pencil'
import FolderMultiple from 'vue-material-design-icons/FolderMultiple'
import FolderPlus from 'vue-material-design-icons/FolderPlus'
import Close from 'vue-material-design-icons/Close'
import Magnify from 'vue-material-design-icons/Magnify'
import Eye from 'vue-material-design-icons/Eye'
import {
    fetchProjects,
    createProject,
    updateProject,
    deleteProject,
    scanProject
} from '@/tools/api'

export default {
    name: 'ProjectsSettings',
    components: {
        NcButton,
        NcModal,
        NcTextField,
        Delete,
        Plus,
        Pencil,
        FolderMultiple,
        FolderPlus,
        Close,
        Magnify,
        Eye
    },
    data() {
        return {
            projects: [],
            showCreateProjectModal: false,
            showDeleteModal: false,
            editingProject: null,
            projectToDelete: null,
            projectForm: {
                name: '',
                folders: []
            }
        }
    },
    methods: {
        async loadProjects() {
            try {
                this.projects = await fetchProjects()
            } catch (error) {
                console.error('Error loading projects:', error)
                showError(t('duplicatefinder', 'Failed to load projects'))
            }
        },

        editProject(project) {
            this.editingProject = project
            this.projectForm = {
                name: project.name,
                folders: [...project.folders]
            }
            this.showCreateProjectModal = true
        },

        async pickFolder() {
            const picker = getFilePickerBuilder(t('duplicatefinder', 'Select Folder for Project'))
                .setMultiSelect(false)
                .setMimeTypeFilter(['httpd/unix-directory'])
                .setType(1)
                .allowDirectories()
                .build()

            try {
                const path = await picker.pick()
                if (path) {
                    // Check if folder is already selected
                    if (this.projectForm.folders.includes(path)) {
                        showError(t('duplicatefinder', 'This folder is already selected'))
                        return
                    }

                    this.projectForm.folders.push(path)
                }
            } catch (error) {
                console.error('Error picking folder:', error)
            }
        },

        removeFolder(index) {
            this.projectForm.folders.splice(index, 1)
        },

        async saveProject() {
            try {
                if (this.editingProject) {
                    // Update existing project
                    await updateProject(
                        this.editingProject.id,
                        this.projectForm.name,
                        this.projectForm.folders
                    )
                } else {
                    // Create new project
                    await createProject(
                        this.projectForm.name,
                        this.projectForm.folders
                    )
                }

                // Refresh projects list
                await this.loadProjects()

                // Close modal
                this.cancelProjectModal()
            } catch (error) {
                console.error('Error saving project:', error)
            }
        },

        cancelProjectModal() {
            this.showCreateProjectModal = false
            this.editingProject = null
            this.projectForm = {
                name: '',
                folders: []
            }
        },

        confirmDeleteProject(project) {
            this.projectToDelete = project
            this.showDeleteModal = true
        },

        async deleteProjectConfirmed() {
            if (!this.projectToDelete) return

            try {
                await deleteProject(this.projectToDelete.id)
                await this.loadProjects()
                this.showDeleteModal = false
                this.projectToDelete = null
            } catch (error) {
                console.error('Error deleting project:', error)
            }
        },

        async startProjectScan(projectId) {
            try {
                await scanProject(projectId)
                showSuccess(t('duplicatefinder', 'Project scan initiated. This may take a while.'))
            } catch (error) {
                console.error('Error starting project scan:', error)
            }
        },

        viewProjectResults(projectId) {
            // Emit event to parent component to show project results
            this.$emit('view-project', projectId)
        },

        formatDate(dateString) {
            if (!dateString) return ''

            const date = new Date(dateString)
            return date.toLocaleString()
        }
    },
    mounted() {
        this.loadProjects()
    }
}
</script>

<style scoped>
.projects-settings {
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

.projects-list {
    margin: 20px 0;
}

.project-item {
    margin-bottom: 20px;
    padding: 16px;
    background-color: var(--color-background-hover);
    border-radius: var(--border-radius);
    border: 1px solid var(--color-border);
}

.project-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
    flex-wrap: wrap;
    gap: 10px;
}

.project-title h4 {
    margin: 0;
    font-size: 16px;
}

.project-date {
    font-size: 12px;
    color: var(--color-text-maxcontrast);
}

.project-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}

.project-folders {
    margin-top: 10px;
}

.project-folders h5 {
    margin: 0 0 5px 0;
    font-size: 14px;
}

.project-folders ul {
    margin: 0;
    padding-left: 20px;
}

.empty-state {
    text-align: center;
    padding: 40px 0;
    color: var(--color-text-maxcontrast);
}

.empty-state .icon-folder {
    background-size: 48px;
    height: 48px;
    width: 48px;
    margin: 0 auto 20px;
}

.add-project {
    margin-top: 20px;
}

.project-form {
    padding: 10px;
}

.form-group {
    margin-bottom: 20px;
}

.form-group label {
    display: block;
    margin-bottom: 5px;
    font-weight: bold;
}

.selected-folders {
    margin-top: 10px;
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius);
    padding: 10px;
    max-height: 200px;
    overflow-y: auto;
}

.selected-folder {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 5px;
    margin-bottom: 5px;
    background-color: var(--color-background-hover);
    border-radius: var(--border-radius);
}

.no-folders {
    color: var(--color-text-maxcontrast);
    font-style: italic;
}

.form-actions {
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.modal-buttons {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 10px;
}

.delete-confirmation {
    padding: 10px;
}
</style>
