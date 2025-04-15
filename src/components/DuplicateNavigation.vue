<template>
    <NcAppNavigation>
        <template #list>
            <!-- Search Bar and Sort in One Line -->
            <div class="search-sort-container">
                <SearchBar @search="handleSearch" />
                <div class="sort-dropdown">
                    <button class="icon-only-button" @click="toggleSortMenu">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M11 9h9"></path>
                            <path d="M6 9h2"></path>
                            <path d="M4 19h16"></path>
                            <path d="M4 14h10"></path>
                            <path d="M17 14h2"></path>
                        </svg>
                    </button>
                    <div v-if="showSortMenu" class="sort-menu">
                        <div class="sort-option" @click="setSortOption('none'); toggleSortMenu()">
                            {{ t('duplicatefinder', 'Default') }}
                        </div>
                        <div class="sort-option" @click="setSortOption('size-desc'); toggleSortMenu()">
                            {{ t('duplicatefinder', 'Size (largest first)') }}
                        </div>
                        <div class="sort-option" @click="setSortOption('size-asc'); toggleSortMenu()">
                            {{ t('duplicatefinder', 'Size (smallest first)') }}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Main Navigation Items -->
            <div class="main-nav-items">
                <!-- Projects Button -->
                <button class="fixed-nav-button" @click="toggleProjectsMenu">
                    <FolderMultiple :size="20" />
                    <span class="button-label">{{ t('duplicatefinder', 'Projects') }}</span>
                </button>
                
                <!-- Settings Button -->
                <button class="fixed-nav-button" @click="$emit('open-settings')">
                    <Cog :size="20" />
                    <span class="button-label">{{ t('duplicatefinder', 'Settings') }}</span>
                </button>
                
                <!-- Help Button -->
                <button class="fixed-nav-button" @click="toggleHelpMenu">
                    <HelpCircle :size="20" />
                    <span class="button-label">{{ t('duplicatefinder', 'Help') }}</span>
                </button>
            </div>

            <!-- Projects Menu (only shown when toggleProjectsMenu is clicked) -->
            <div v-if="showProjectsMenu" class="fixed-menu projects-menu">
                <div class="menu-header">
                    <FolderMultiple :size="18" />
                    <span>{{ t('duplicatefinder', 'Projects') }}</span>
                </div>
                
                <div class="menu-action">
                    <div class="menu-item action-item" @click="$emit('open-projects')">
                        <FolderCog :size="16" />
                        <span>{{ t('duplicatefinder', 'Manage Projects') }}</span>
                    </div>
                </div>
                
                <div class="menu-section-title" v-if="projects.length > 0">
                    {{ t('duplicatefinder', 'Your Projects') }}
                </div>
                
                <div v-if="projects.length > 0" class="menu-items-list">
                    <div v-for="project in projects" :key="project.id" 
                         class="menu-item" 
                         :class="{'active': activeView === 'project' && activeProject === project.id}"
                         @click="$emit('view-project', project.id); toggleProjectsMenu()">
                        <Folder :size="16" />
                        <span>{{ project.name }}</span>
                    </div>
                </div>
                <div v-else class="empty-projects-message">
                    {{ t('duplicatefinder', 'No projects yet') }}
                    <div class="empty-action">
                        <button class="action-button" @click="$emit('open-projects'); toggleProjectsMenu()">
                            {{ t('duplicatefinder', 'Create your first project') }}
                        </button>
                    </div>
                </div>
                <div class="menu-footer">
                    <button class="menu-close-button" @click="toggleProjectsMenu">
                        {{ t('duplicatefinder', 'Close') }}
                    </button>
                </div>
            </div>

            <!-- Help Menu (only shown when toggleHelpMenu is clicked) -->
            <div v-if="showHelpMenu" class="fixed-menu help-menu">
                <div class="menu-header">
                    <HelpCircle :size="18" />
                    <span>{{ t('duplicatefinder', 'Help') }}</span>
                </div>
                
                <div class="menu-section">
                    <div class="menu-item" @click="$emit('show-help', 'guide'); toggleHelpMenu()">
                        <School :size="16" />
                        <span>{{ t('duplicatefinder', 'Getting Started') }}</span>
                        <span class="menu-item-description">{{ t('duplicatefinder', 'Learn the basics of using the app') }}</span>
                    </div>
                    
                    <div class="menu-item" @click="$emit('show-help', 'examples'); toggleHelpMenu()">
                        <PlayCircle :size="16" />
                        <span>{{ t('duplicatefinder', 'Usage Examples') }}</span>
                        <span class="menu-item-description">{{ t('duplicatefinder', 'See practical examples of finding and managing duplicates') }}</span>
                    </div>
                    
                    <div class="menu-item" @click="$emit('show-help', 'faq'); toggleHelpMenu()">
                        <FrequentlyAskedQuestions :size="16" />
                        <span>{{ t('duplicatefinder', 'FAQ') }}</span>
                        <span class="menu-item-description">{{ t('duplicatefinder', 'Find answers to common questions') }}</span>
                    </div>
                </div>
                
                <div class="menu-footer">
                    <button class="menu-close-button" @click="toggleHelpMenu">
                        {{ t('duplicatefinder', 'Close') }}
                    </button>
                </div>
            </div>

            <!-- Navigation for Acknowledged Duplicates -->
            <NcAppNavigationItem :name="t('duplicatefinder', 'Acknowledged')"
                :allowCollapse="true"
                :open="true">
                <template #icon>
                    <CheckCircle :size="20" />
                </template>
                <template>
                    <div v-show="filteredAcknowledgedDuplicates.length > 0">
                        <div v-for="duplicate in filteredAcknowledgedDuplicates" :key="duplicate.id" class="duplicate-item">
                            <DuplicateListItem
                                :duplicate="duplicate"
                                :isActive="currentDuplicateId === duplicate.id"
                                @duplicate-selected="openDuplicate"
                                @duplicate-resolved="handleDuplicateResolved" />
                        </div>
                    </div>
                    <div v-show="filteredAcknowledgedDuplicates.length === 0">
                        <p>{{ t('duplicatefinder', 'No acknowledged duplicates found.') }}</p>
                    </div>
                    <button v-if="hasMoreAcknowledged" @click="loadMoreAcknowledgedDuplicates" class="load-more-button">
                        {{ t('duplicatefinder', 'Load More') }}
                    </button>
                </template>
            </NcAppNavigationItem>

            <!-- Navigation for Unacknowledged Duplicates -->
            <NcAppNavigationItem :name="t('duplicatefinder', 'Unacknowledged')"
                :allowCollapse="true"
                :open="true"
                :active="activeView === 'details'">
                <template #icon>
                    <CloseCircle :size="20" />
                </template>
                <template>
                    <div v-show="filteredUnacknowledgedDuplicates.length > 0">
                        <div v-for="duplicate in filteredUnacknowledgedDuplicates" :key="duplicate.id" class="duplicate-item">
                            <DuplicateListItem
                                :duplicate="duplicate"
                                :isActive="currentDuplicateId === duplicate.id"
                                @duplicate-selected="openDuplicate"
                                @duplicate-resolved="handleDuplicateResolved" />
                        </div>
                    </div>
                    <div v-show="filteredUnacknowledgedDuplicates.length === 0">
                        <p>{{ t('duplicatefinder', 'No unacknowledged duplicates found.') }}</p>
                    </div>
                    <button v-if="hasMoreUnacknowledged" @click="loadMoreUnacknowledgedDuplicates" class="load-more-button">
                        {{ t('duplicatefinder', 'Load More') }}
                    </button>
                </template>
            </NcAppNavigationItem>

            <!-- Bulk Delete Button - Now at the bottom -->
            <div class="footer-actions">
                <button class="action-button bulk-delete-button" @click="$emit('open-bulk-delete')">
                    <Delete :size="16" />
                    <span>{{ t('duplicatefinder', 'Bulk Delete') }}</span>
                </button>
            </div>
        </template>
    </NcAppNavigation>
</template>

<script>
import { NcAppNavigation, NcAppNavigationItem, NcButton } from '@nextcloud/vue';
import DuplicateListItem from './DuplicateListItem.vue';
import SearchBar from './SearchBar.vue';
import CloseCircle from 'vue-material-design-icons/CloseCircle';
import CheckCircle from 'vue-material-design-icons/CheckCircle';
import Cog from 'vue-material-design-icons/Cog';
import Delete from 'vue-material-design-icons/Delete';
import HelpCircle from 'vue-material-design-icons/HelpCircle';
import School from 'vue-material-design-icons/School';
import PlayCircle from 'vue-material-design-icons/PlayCircle';
import FrequentlyAskedQuestions from 'vue-material-design-icons/FrequentlyAskedQuestions';
import FolderMultiple from 'vue-material-design-icons/FolderMultiple';
import FolderCog from 'vue-material-design-icons/FolderCog';
import Folder from 'vue-material-design-icons/Folder';
import { fetchDuplicates } from '@/tools/api';
import { getTotalSizeOfDuplicate } from '@/tools/utils';

export default {
    components: {
        DuplicateListItem,
        SearchBar,
        NcAppNavigation,
        NcAppNavigationItem,
        NcButton,
        CheckCircle,
        CloseCircle,
        Cog,
        Delete,
        HelpCircle,
        School,
        PlayCircle,
        FrequentlyAskedQuestions,
        FolderMultiple,
        FolderCog,
        Folder
    },
    props: {
        acknowledgedDuplicates: Array,
        unacknowledgedDuplicates: Array,
        currentDuplicateId: [String, Number],
        activeView: {
            type: String,
            default: 'details'
        },
        activeProject: {
            type: Number,
            default: null
        },
        projects: {
            type: Array,
            default: () => []
        },
        acknowledgedPagination: {
            type: Object,
            default: () => ({
                currentPage: 1,
                totalPages: 1
            })
        },
        unacknowledgedPagination: {
            type: Object,
            default: () => ({
                currentPage: 1,
                totalPages: 1
            })
        },
        'has-duplicates': {
            type: Boolean,
            default: false
        }
    },
    data() {
        return {
            searchPattern: '',
            searchType: 'simple',
            acknowledgedPage: 1,
            unacknowledgedPage: 1,
            limit: 50,
            sortOption: 'none',
            showSortMenu: false,
            showProjectsMenu: false,
            showHelpMenu: false,
        };
    },
    computed: {
        hasMoreAcknowledged() {
            return this.acknowledgedPagination.currentPage < this.acknowledgedPagination.totalPages;
        },
        hasMoreUnacknowledged() {
            return this.unacknowledgedPagination.currentPage < this.unacknowledgedPagination.totalPages;
        },
        filteredUnacknowledgedDuplicates() {
            // First filter by search pattern
            const filtered = this.unacknowledgedDuplicates.filter(duplicate => {
                return this.filterDuplicate(duplicate);
            });

            // Then apply sorting if needed
            return this.sortDuplicates(filtered);
        },
        filteredAcknowledgedDuplicates() {
            // First filter by search pattern
            const filtered = this.acknowledgedDuplicates.filter(duplicate => {
                return this.filterDuplicate(duplicate);
            });

            // Then apply sorting if needed
            return this.sortDuplicates(filtered);
        }
    },
    methods: {
        handleSearch({ query, type }) {
            this.searchPattern = query;
            this.searchType = type;
        },
        toggleSortMenu() {
            this.showSortMenu = !this.showSortMenu;
            if (this.showSortMenu) {
                this.showProjectsMenu = false;
                this.showHelpMenu = false;
            }
        },
        toggleProjectsMenu() {
            this.showProjectsMenu = !this.showProjectsMenu;
            if (this.showProjectsMenu) {
                this.showSortMenu = false;
                this.showHelpMenu = false;
            }
        },
        toggleHelpMenu() {
            this.showHelpMenu = !this.showHelpMenu;
            if (this.showHelpMenu) {
                this.showSortMenu = false;
                this.showProjectsMenu = false;
            }
        },
        setSortOption(option) {
            this.sortOption = option;
        },
        handleSortChange() {
            // This method is called when the sort option changes
            // The actual sorting is done in the computed properties
            console.log('Sort option changed to:', this.sortOption);
        },
        sortDuplicates(duplicates) {
            if (this.sortOption === 'none') {
                return duplicates; // No sorting, return as is
            }

            // Create a copy to avoid mutating the original array
            const sortedDuplicates = [...duplicates];

            if (this.sortOption === 'size-desc') {
                // Sort by size, largest first
                return sortedDuplicates.sort((a, b) => {
                    const sizeA = getTotalSizeOfDuplicate(a);
                    const sizeB = getTotalSizeOfDuplicate(b);
                    return sizeB - sizeA; // Descending order
                });
            } else if (this.sortOption === 'size-asc') {
                // Sort by size, smallest first
                return sortedDuplicates.sort((a, b) => {
                    const sizeA = getTotalSizeOfDuplicate(a);
                    const sizeB = getTotalSizeOfDuplicate(b);
                    return sizeA - sizeB; // Ascending order
                });
            }

            return sortedDuplicates;
        },
        filterDuplicate(duplicate) {
            if (!this.searchPattern) {
                return true;
            }

            const matchFile = (file) => {
                const path = file.path.toLowerCase();
                if (this.searchType === 'simple') {
                    return path.includes(this.searchPattern.toLowerCase());
                }
                try {
                    const regex = new RegExp(this.searchPattern, 'i');
                    return regex.test(path);
                } catch (e) {
                    // If regex is invalid, fall back to simple search
                    return path.includes(this.searchPattern.toLowerCase());
                }
            };

            return duplicate.files.some(matchFile);
        },
        openDuplicate(duplicate) {
            this.$emit('open-duplicate', duplicate);
        },
        async loadMoreUnacknowledgedDuplicates() {
            this.unacknowledgedPage++;
            const newDuplicates = await fetchDuplicates('unacknowledged', this.limit, this.unacknowledgedPage);
            this.$emit('update-unacknowledged-duplicates', newDuplicates.entities);
        },
        async loadMoreAcknowledgedDuplicates() {
            this.acknowledgedPage++;
            const newDuplicates = await fetchDuplicates('acknowledged', this.limit, this.acknowledgedPage);
            this.$emit('update-acknowledged-duplicates', newDuplicates.entities);
        },
        handleDuplicateResolved({ duplicate, type }) {
            if (duplicate.files.length <= 1) {
                if (type === 'acknowledged') {
                    this.$emit('update-acknowledged-duplicates', this.acknowledgedDuplicates.filter(d => d.id !== duplicate.id));
                } else {
                    this.$emit('update-unacknowledged-duplicates', this.unacknowledgedDuplicates.filter(d => d.id !== duplicate.id));
                }
                const nextDuplicate = this.findNextAvailableDuplicate(duplicate, type);
                if (nextDuplicate) {
                    this.openDuplicate(nextDuplicate);
                } else {
                    this.$emit('open-duplicate', null);
                }
            }
        },

        findNextAvailableDuplicate(currentDuplicate, type) {
            const acknowledgedList = this.filteredAcknowledgedDuplicates;
            const unacknowledgedList = this.filteredUnacknowledgedDuplicates;

            if (type === 'acknowledged') {
                // Try to find next in acknowledged list
                const index = acknowledgedList.findIndex(d => d.id === currentDuplicate.id);
                if (index < acknowledgedList.length - 1) {
                    return acknowledgedList[index + 1];
                }
                // If no more in acknowledged, try unacknowledged
                return unacknowledgedList[0] || null;
            } else {
                // Try to find next in unacknowledged list
                const index = unacknowledgedList.findIndex(d => d.id === currentDuplicate.id);
                if (index < unacknowledgedList.length - 1) {
                    return unacknowledgedList[index + 1];
                }
                // If no more in unacknowledged, try acknowledged
                return acknowledgedList[0] || null;
            }
        }
    }
};
</script>

<style scoped>
.duplicate-item {
    width: 100%;
}

/* Search and Sort Combined */
.search-sort-container {
    display: flex;
    align-items: center;
    padding: 8px;
    border-bottom: 1px solid var(--color-border);
}

.search-sort-container :deep(.search-container) {
    flex-grow: 1;
    margin: 0;
}

.sort-dropdown {
    position: relative;
    margin-left: 8px;
}

.icon-only-button {
    background: transparent;
    border: none;
    border-radius: 50%;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background-color 0.2s;
}

.icon-only-button:hover {
    background-color: var(--color-background-hover);
}

.sort-menu {
    position: absolute;
    right: 0;
    top: 100%;
    background: var(--color-main-background);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    z-index: 100;
    min-width: 180px;
}

.sort-option {
    padding: 8px 12px;
    cursor: pointer;
    transition: background-color 0.2s;
}

.sort-option:hover {
    background-color: var(--color-background-hover);
}

/* Icon Navigation */
.main-nav-items {
    display: flex;
    padding: 12px;
    border-bottom: 1px solid var(--color-border);
    justify-content: space-around;
}

.fixed-nav-button {
    display: flex;
    flex-direction: column;
    align-items: center;
    background: transparent;
    border: none;
    border-radius: 8px;
    padding: 8px 16px;
    cursor: pointer;
    transition: background-color 0.2s;
}

.fixed-nav-button:hover {
    background-color: var(--color-background-hover);
}

.button-label {
    margin-top: 6px;
    font-size: 12px;
    color: var(--color-text);
}

/* Fixed Menus */
.fixed-menu {
    background: var(--color-main-background);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    margin: 0 8px 16px 8px;
    max-width: 400px;
    width: calc(100% - 16px);
}

.menu-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: bold;
    padding: 12px 16px;
    border-bottom: 1px solid var(--color-border);
    background-color: var(--color-background-hover);
    border-radius: 8px 8px 0 0;
}

.menu-section-title {
    font-weight: bold;
    padding: 8px 16px 4px;
    font-size: 0.9rem;
    color: var(--color-text-maxcontrast);
}

.menu-section {
    padding: 8px 0;
}

.menu-action {
    padding: 8px 0;
    border-bottom: 1px solid var(--color-border-dark);
}

.menu-item {
    padding: 10px 16px;
    display: flex;
    align-items: flex-start;
    cursor: pointer;
    transition: background-color 0.2s;
    flex-wrap: wrap;
    border-left: 3px solid transparent;
}

.action-item {
    color: var(--color-primary-element);
}

.menu-item span {
    margin-left: 10px;
}

.menu-item-description {
    margin-left: 26px !important;
    font-size: 0.8rem;
    color: var(--color-text-maxcontrast);
    width: 100%;
    margin-top: 4px;
}

.menu-item:hover, .menu-item.active {
    background-color: var(--color-background-hover);
    border-left-color: var(--color-primary-element);
}

.menu-items-list {
    max-height: 200px;
    overflow-y: auto;
    padding: 8px 0;
}

.empty-projects-message {
    padding: 16px;
    color: var(--color-text-maxcontrast);
    font-style: italic;
    font-size: 0.9rem;
    text-align: center;
}

.empty-action {
    margin-top: 12px;
}

.action-button {
    background-color: var(--color-primary-element);
    color: var(--color-primary-text);
    border: none;
    border-radius: 4px;
    padding: 8px 12px;
    cursor: pointer;
    font-size: 0.9rem;
}

.action-button:hover {
    background-color: var(--color-primary-element-hover);
}

.menu-footer {
    padding: 8px;
    border-top: 1px solid var(--color-border);
    background-color: var(--color-background-hover);
    border-radius: 0 0 8px 8px;
}

.menu-close-button {
    width: 100%;
    padding: 8px;
    background-color: transparent;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    cursor: pointer;
    text-align: center;
    transition: background-color 0.2s;
}

.menu-close-button:hover {
    background-color: var(--color-background-hover);
}

/* Footer Actions */
.footer-actions {
    margin-top: auto;
    padding: 8px;
    border-top: 1px solid var(--color-border);
}

.action-button {
    display: flex;
    align-items: center;
    background: transparent;
    border: none;
    padding: 8px;
    border-radius: 4px;
    width: 100%;
    cursor: pointer;
    transition: background-color 0.2s;
}

.action-button:hover {
    background-color: var(--color-background-hover);
}

.action-button span {
    margin-left: 8px;
}

.bulk-delete-button {
    color: var(--color-error);
}

.load-more-button {
    margin: 8px;
    padding: 6px 12px;
    background-color: var(--color-primary-element);
    color: var(--color-primary-text);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    width: calc(100% - 16px);
}

.load-more-button:hover {
    background-color: var(--color-primary-element-hover);
}
</style>