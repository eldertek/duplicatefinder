<template>
    <NcAppNavigation>
        <template #list>
            <!-- Search Bar and Sort in One Line -->
            <div class="search-sort-container">
                <SearchBar ref="searchBar" @search="handleSearch" />
                <div class="sort-dropdown" @keydown.esc="showSortMenu = false">
                    <button
                        type="button"
                        class="icon-only-button"
                        :class="{ 'has-active-filter': hasActiveSortOrFilter }"
                        :title="t('duplicatefinder', 'Sort and filter by size')"
                        :aria-label="t('duplicatefinder', 'Sort and filter by size')"
                        :aria-expanded="showSortMenu ? 'true' : 'false'"
                        aria-haspopup="true"
                        @click="toggleSortMenu">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M11 9h9"></path>
                            <path d="M6 9h2"></path>
                            <path d="M4 19h16"></path>
                            <path d="M4 14h10"></path>
                            <path d="M17 14h2"></path>
                        </svg>
                        <span v-if="hasActiveSortOrFilter" class="active-filter-dot"></span>
                    </button>
                    <div v-if="showSortMenu" class="sort-menu">
                        <div class="sort-menu-section-title">
                            {{ t('duplicatefinder', 'Sort order') }}
                        </div>
                        <button
                            type="button"
                            class="sort-option"
                            :class="{ 'active': sortOption === 'none' }"
                            :aria-pressed="sortOption === 'none' ? 'true' : 'false'"
                            @click="setSortOption('none'); toggleSortMenu()">
                            {{ t('duplicatefinder', 'Default') }}
                        </button>
                        <button
                            type="button"
                            class="sort-option"
                            :class="{ 'active': sortOption === 'size-desc' }"
                            :aria-pressed="sortOption === 'size-desc' ? 'true' : 'false'"
                            @click="setSortOption('size-desc'); toggleSortMenu()">
                            {{ t('duplicatefinder', 'Size (largest first)') }}
                        </button>
                        <button
                            type="button"
                            class="sort-option"
                            :class="{ 'active': sortOption === 'size-asc' }"
                            :aria-pressed="sortOption === 'size-asc' ? 'true' : 'false'"
                            @click="setSortOption('size-asc'); toggleSortMenu()">
                            {{ t('duplicatefinder', 'Size (smallest first)') }}
                        </button>
                        <div class="sort-menu-divider"></div>
                        <div class="sort-menu-section-title">
                            {{ t('duplicatefinder', 'Minimum file size') }}
                        </div>
                        <button
                            v-for="preset in minSizePresets"
                            :key="preset.bytes"
                            type="button"
                            class="sort-option"
                            :class="{ 'active': minSizeBytes === preset.bytes }"
                            :aria-pressed="minSizeBytes === preset.bytes ? 'true' : 'false'"
                            @click="setMinSizeBytes(preset.bytes); toggleSortMenu()">
                            {{ preset.label }}
                        </button>
                        <div class="custom-size-row" @click.stop>
                            <input
                                v-model="customMinSizeMb"
                                type="number"
                                min="0"
                                step="any"
                                class="custom-size-input"
                                :placeholder="t('duplicatefinder', 'Min MB')"
                                :aria-label="t('duplicatefinder', 'Min MB')"
                                @keyup.enter="applyCustomMinSize" />
                            <button type="button" class="custom-size-apply" @click="applyCustomMinSize">
                                {{ t('duplicatefinder', 'Apply') }}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Main Navigation Items -->
            <div class="main-nav-items">
                <!-- Projects Button -->
                <button
                    type="button"
                    class="fixed-nav-button"
                    :aria-expanded="showProjectsMenu ? 'true' : 'false'"
                    @click="toggleProjectsMenu">
                    <FolderMultiple :size="20" />
                    <span class="button-label">{{ t('duplicatefinder', 'Projects') }}</span>
                </button>
                
                <!-- Settings Button -->
                <button type="button" class="fixed-nav-button" @click="$emit('open-settings')">
                    <Cog :size="20" />
                    <span class="button-label">{{ t('duplicatefinder', 'Settings') }}</span>
                </button>
                
                <!-- Help Button -->
                <button
                    type="button"
                    class="fixed-nav-button"
                    :aria-expanded="showHelpMenu ? 'true' : 'false'"
                    @click="toggleHelpMenu">
                    <HelpCircle :size="20" />
                    <span class="button-label">{{ t('duplicatefinder', 'Help') }}</span>
                </button>
            </div>

            <!-- Projects Menu (only shown when toggleProjectsMenu is clicked) -->
            <div v-if="showProjectsMenu" class="fixed-menu projects-menu" @keydown.esc="toggleProjectsMenu">
                <div class="menu-header">
                    <FolderMultiple :size="18" />
                    <span>{{ t('duplicatefinder', 'Projects') }}</span>
                </div>
                
                <div class="menu-action">
                    <button type="button" class="menu-item action-item" @click="$emit('open-projects')">
                        <FolderCog :size="16" />
                        <span>{{ t('duplicatefinder', 'Manage Projects') }}</span>
                    </button>
                </div>
                
                <div class="menu-section-title" v-if="projects.length > 0">
                    {{ t('duplicatefinder', 'Your Projects') }}
                </div>
                
                <div v-if="projects.length > 0" class="menu-items-list">
                    <button
                         v-for="project in projects"
                         :key="project.id"
                         type="button"
                         class="menu-item"
                         :class="{'active': activeView === 'project' && activeProject === project.id}"
                         @click="$emit('view-project', project.id); toggleProjectsMenu()">
                        <Folder :size="16" />
                        <span>{{ project.name }}</span>
                    </button>
                </div>
                <div v-else class="empty-projects-message">
                    {{ t('duplicatefinder', 'No projects yet') }}
                    <div class="empty-action">
                        <button type="button" class="action-button" @click="$emit('open-projects'); toggleProjectsMenu()">
                            {{ t('duplicatefinder', 'Create your first project') }}
                        </button>
                    </div>
                </div>
                <div class="menu-footer">
                    <button type="button" class="menu-close-button" @click="toggleProjectsMenu">
                        {{ t('duplicatefinder', 'Close') }}
                    </button>
                </div>
            </div>

            <!-- Help Menu (only shown when toggleHelpMenu is clicked) -->
            <div v-if="showHelpMenu" class="fixed-menu help-menu" @keydown.esc="toggleHelpMenu">
                <div class="menu-header">
                    <HelpCircle :size="18" />
                    <span>{{ t('duplicatefinder', 'Help') }}</span>
                </div>
                
                <div class="menu-section">
                    <button type="button" class="menu-item" @click="$emit('show-help', 'guide'); toggleHelpMenu()">
                        <School :size="16" />
                        <span>{{ t('duplicatefinder', 'Getting Started') }}</span>
                        <span class="menu-item-description">{{ t('duplicatefinder', 'Learn the basics of using the app') }}</span>
                    </button>
                    
                    <button type="button" class="menu-item" @click="$emit('show-help', 'examples'); toggleHelpMenu()">
                        <PlayCircle :size="16" />
                        <span>{{ t('duplicatefinder', 'Usage Examples') }}</span>
                        <span class="menu-item-description">{{ t('duplicatefinder', 'See practical examples of finding and managing duplicates') }}</span>
                    </button>
                    
                    <button type="button" class="menu-item" @click="$emit('show-help', 'faq'); toggleHelpMenu()">
                        <FrequentlyAskedQuestions :size="16" />
                        <span>{{ t('duplicatefinder', 'FAQ') }}</span>
                        <span class="menu-item-description">{{ t('duplicatefinder', 'Find answers to common questions') }}</span>
                    </button>
                </div>
                
                <div class="menu-footer">
                    <button type="button" class="menu-close-button" @click="toggleHelpMenu">
                        {{ t('duplicatefinder', 'Close') }}
                    </button>
                </div>
            </div>

            <!-- Quick File-Type Filter Chips & Live Reclaimable Summary -->
            <div class="quick-filter-panel">
                <div
                    class="quick-filter-chips"
                    role="group"
                    :aria-label="t('duplicatefinder', 'Filter duplicates by file type')">
                    <button
                        v-for="chip in categoryFilterChips"
                        :key="chip.id"
                        type="button"
                        class="filter-chip"
                        :class="{ 'active': selectedCategory === chip.id }"
                        :aria-pressed="selectedCategory === chip.id ? 'true' : 'false'"
                        @click="setCategoryFilter(chip.id)">
                        {{ chip.label }}
                    </button>
                </div>
                <div
                    class="reclaimable-summary-badge"
                    role="status"
                    aria-live="polite"
                    aria-atomic="true">
                    <span class="reclaimable-summary-value">
                        {{ t('duplicatefinder', 'Reclaimable: {size}', { size: reclaimableSummary.formatted }) }}
                    </span>
                    <span v-if="reclaimableSummary.groupCount > 0" class="reclaimable-summary-meta">
                        {{ t('duplicatefinder', '{groups} groups, {copies} extra', {
                            groups: reclaimableSummary.groupCount,
                            copies: reclaimableSummary.redundantCopies,
                        }) }}
                    </span>
                </div>
                <button
                    type="button"
                    class="export-csv-button"
                    :disabled="filteredDuplicatesForExport.length === 0"
                    :title="t('duplicatefinder', 'Export filtered duplicates as CSV')"
                    :aria-label="t('duplicatefinder', 'Export CSV')"
                    @click="exportFilteredCsv">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    <span>{{ t('duplicatefinder', 'Export CSV') }}</span>
                </button>
            </div>

            <!-- Navigation for Acknowledged Duplicates -->
            <NcAppNavigationItem
                class="duplicate-section-nav duplicate-section-acknowledged"
                :name="t('duplicatefinder', 'Acknowledged')"
                :allowCollapse="true"
                :open="acknowledgedOpen"
                :active="activeView === 'details' && activeSection === 'acknowledged'"
                @click="toggleSection('acknowledged', $event)"
                @update:open="onSectionOpenChange('acknowledged', $event)">
                <template #icon>
                    <CheckCircle :size="20" />
                </template>
                    <div v-show="filteredAcknowledgedDuplicates.length > 0">
                        <div v-for="duplicate in filteredAcknowledgedDuplicates" :key="duplicate.id" class="duplicate-item">
                            <DuplicateListItem
                                :duplicate="duplicate"
                                :isActive="currentDuplicateId === duplicate.id"
                                @duplicate-selected="openDuplicate"
                                @duplicate-resolved="handleDuplicateResolved" />
                        </div>
                    </div>
                    <div v-show="filteredAcknowledgedDuplicates.length === 0" role="status" aria-live="polite">
                        <p>{{ t('duplicatefinder', 'No acknowledged duplicates found.') }}</p>
                    </div>
                    <div
                        v-if="hasMoreAcknowledged"
                        ref="acknowledgedSentinel"
                        class="load-more-sentinel"
                        aria-hidden="true" />
                    <button
                        v-if="hasMoreAcknowledged"
                        type="button"
                        :disabled="isLoadingMoreAcknowledged"
                        class="load-more-button"
                        @click="loadMoreAcknowledgedDuplicates()">
                        {{ t('duplicatefinder', 'Load More') }}
                    </button>
            </NcAppNavigationItem>

            <!-- Navigation for Unacknowledged Duplicates -->
            <NcAppNavigationItem
                class="duplicate-section-nav duplicate-section-unacknowledged"
                :name="t('duplicatefinder', 'Unacknowledged')"
                :allowCollapse="true"
                :open="unacknowledgedOpen"
                :active="activeView === 'details' && activeSection === 'unacknowledged'"
                @click="toggleSection('unacknowledged', $event)"
                @update:open="onSectionOpenChange('unacknowledged', $event)">
                <template #icon>
                    <CloseCircle :size="20" />
                </template>
                    <div v-show="filteredUnacknowledgedDuplicates.length > 0">
                        <div v-for="duplicate in filteredUnacknowledgedDuplicates" :key="duplicate.id" class="duplicate-item">
                            <DuplicateListItem
                                :duplicate="duplicate"
                                :isActive="currentDuplicateId === duplicate.id"
                                @duplicate-selected="openDuplicate"
                                @duplicate-resolved="handleDuplicateResolved" />
                        </div>
                    </div>
                    <div v-show="filteredUnacknowledgedDuplicates.length === 0" role="status" aria-live="polite">
                        <p>{{ t('duplicatefinder', 'No unacknowledged duplicates found.') }}</p>
                    </div>
                    <div
                        v-if="hasMoreUnacknowledged"
                        ref="unacknowledgedSentinel"
                        class="load-more-sentinel"
                        aria-hidden="true" />
                    <button
                        v-if="hasMoreUnacknowledged"
                        type="button"
                        :disabled="isLoadingMoreUnacknowledged"
                        class="load-more-button"
                        @click="loadMoreUnacknowledgedDuplicates()">
                        {{ t('duplicatefinder', 'Load More') }}
                    </button>
            </NcAppNavigationItem>
        </template>
    </NcAppNavigation>
</template>

<script>
import { NcAppNavigation, NcAppNavigationItem } from '@nextcloud/vue';
import DuplicateListItem from './DuplicateListItem.vue';
import SearchBar from './SearchBar.vue';
import CloseCircle from 'vue-material-design-icons/CloseCircle';
import CheckCircle from 'vue-material-design-icons/CheckCircle';
import Cog from 'vue-material-design-icons/Cog';
import HelpCircle from 'vue-material-design-icons/HelpCircle';
import School from 'vue-material-design-icons/School';
import PlayCircle from 'vue-material-design-icons/PlayCircle';
import FrequentlyAskedQuestions from 'vue-material-design-icons/FrequentlyAskedQuestions';
import FolderMultiple from 'vue-material-design-icons/FolderMultiple';
import FolderCog from 'vue-material-design-icons/FolderCog';
import Folder from 'vue-material-design-icons/Folder';
import { fetchDuplicates } from '@/tools/api';
import { getTotalSizeOfDuplicate, loadUiPreferences, saveUiPreferences } from '@/tools/utils';
import {
    DUPLICATE_FILTER_CATEGORIES,
    computeReclaimableSummary,
    matchesDuplicateCategory,
} from '@/tools/duplicateFilters';
import { downloadDuplicatesCsv } from '@/tools/duplicateSelectionAndExport';

export default {
    components: {
        DuplicateListItem,
        SearchBar,
        NcAppNavigation,
        NcAppNavigationItem,
        CheckCircle,
        CloseCircle,
        Cog,
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
        hasDuplicates: {
            type: Boolean,
            default: false
        },
        initialSortOption: {
            type: String,
            default: 'none'
        },
        initialMinSizeBytes: {
            type: Number,
            default: 0
        },
        paginationResetToken: {
            type: Number,
            default: 0
        }
    },
    data() {
        const savedPreferences = loadUiPreferences();
        return {
            searchPattern: '',
            searchType: 'simple',
            acknowledgedPage: 1,
            unacknowledgedPage: 1,
            isLoadingMoreAcknowledged: false,
            isLoadingMoreUnacknowledged: false,
            exhaustedAcknowledged: false,
            exhaustedUnacknowledged: false,
            acknowledgedSentinelObserver: null,
            unacknowledgedSentinelObserver: null,
            limit: 50,
            sortOption: this.initialSortOption || 'none',
            minSizeBytes: Number(this.initialMinSizeBytes) > 0 ? Number(this.initialMinSizeBytes) : 0,
            customMinSizeMb: Number(this.initialMinSizeBytes) > 0
                ? String(Math.round((Number(this.initialMinSizeBytes) / (1024 * 1024)) * 100) / 100)
                : '',
            showSortMenu: false,
            showProjectsMenu: false,
            showHelpMenu: false,
            selectedCategory: 'all',
            acknowledgedOpen: savedPreferences.acknowledgedOpen,
            unacknowledgedOpen: savedPreferences.unacknowledgedOpen,
            activeSection: 'unacknowledged',
        };
    },
    created() {
        this.syncActiveSectionWithDuplicate(this.currentDuplicateId);
    },
    mounted() {
        this.setupSentinelObservers();
    },
    beforeDestroy() {
        this.teardownSentinelObservers();
    },
    watch: {
        initialSortOption(newValue) {
            this.sortOption = newValue || 'none';
        },
        initialMinSizeBytes(newValue) {
            this.minSizeBytes = Number(newValue) > 0 ? Number(newValue) : 0;
        },
        paginationResetToken() {
            this.acknowledgedPage = 1;
            this.unacknowledgedPage = 1;
            this.exhaustedAcknowledged = false;
            this.exhaustedUnacknowledged = false;
            this.$nextTick(() => {
                this.setupSentinelObservers();
            });
        },
        currentDuplicateId(newId) {
            this.syncActiveSectionWithDuplicate(newId);
            this.maybeAutoLoadForDuplicate(newId, false);
        },
        acknowledgedDuplicates(newList, oldList) {
            this.syncActiveSectionWithDuplicate(this.currentDuplicateId);
            const prevLen = Array.isArray(oldList) ? oldList.length : 0;
            const nextLen = Array.isArray(newList) ? newList.length : 0;
            if (nextLen < prevLen) {
                this.$nextTick(() => {
                    this.checkAutoLoadAfterShrink('acknowledged');
                });
            }
            this.$nextTick(() => {
                this.setupSentinelObservers();
            });
        },
        unacknowledgedDuplicates(newList, oldList) {
            this.syncActiveSectionWithDuplicate(this.currentDuplicateId);
            const prevLen = Array.isArray(oldList) ? oldList.length : 0;
            const nextLen = Array.isArray(newList) ? newList.length : 0;
            if (nextLen < prevLen) {
                this.$nextTick(() => {
                    this.checkAutoLoadAfterShrink('unacknowledged');
                });
            }
            this.$nextTick(() => {
                this.setupSentinelObservers();
            });
        },
        hasMoreAcknowledged() {
            this.$nextTick(() => {
                this.setupSentinelObservers();
            });
        },
        hasMoreUnacknowledged() {
            this.$nextTick(() => {
                this.setupSentinelObservers();
            });
        }
    },
    computed: {
        hasAnyDuplicates() {
            return Boolean(
                this.hasDuplicates
                || (Array.isArray(this.unacknowledgedDuplicates) && this.unacknowledgedDuplicates.length > 0)
                || (Array.isArray(this.acknowledgedDuplicates) && this.acknowledgedDuplicates.length > 0)
            );
        },
        hasActiveSortOrFilter() {
            return this.sortOption !== 'none' || this.minSizeBytes > 0;
        },
        categoryFilterChips() {
            return [
                { id: 'all', label: t('duplicatefinder', 'All') },
                { id: 'images', label: t('duplicatefinder', 'Images') },
                { id: 'videos', label: t('duplicatefinder', 'Videos') },
                { id: 'audio', label: t('duplicatefinder', 'Audio') },
                { id: 'documents', label: t('duplicatefinder', 'Documents') },
                { id: 'archives', label: t('duplicatefinder', 'Archives') },
                { id: 'large', label: t('duplicatefinder', '> 10 MB') },
            ];
        },
        minSizePresets() {
            return [
                { bytes: 0, label: t('duplicatefinder', 'All sizes') },
                { bytes: 1024 * 1024, label: '>= 1 MB' },
                { bytes: 10 * 1024 * 1024, label: '>= 10 MB' },
                { bytes: 100 * 1024 * 1024, label: '>= 100 MB' },
                { bytes: 1024 * 1024 * 1024, label: '>= 1 GB' },
            ];
        },
        hasMoreAcknowledged() {
            if (this.exhaustedAcknowledged) {
                return false;
            }
            if (this.acknowledgedPagination && typeof this.acknowledgedPagination.hasMore === 'boolean') {
                return this.acknowledgedPagination.hasMore;
            }
            const currentPage = Math.max(
                Number(this.acknowledgedPagination && this.acknowledgedPagination.currentPage) || 1,
                this.acknowledgedPage,
            );
            const totalPages = Number(this.acknowledgedPagination && this.acknowledgedPagination.totalPages) || 1;
            return currentPage < totalPages;
        },
        hasMoreUnacknowledged() {
            if (this.exhaustedUnacknowledged) {
                return false;
            }
            if (this.unacknowledgedPagination && typeof this.unacknowledgedPagination.hasMore === 'boolean') {
                return this.unacknowledgedPagination.hasMore;
            }
            const currentPage = Math.max(
                Number(this.unacknowledgedPagination && this.unacknowledgedPagination.currentPage) || 1,
                this.unacknowledgedPage,
            );
            const totalPages = Number(this.unacknowledgedPagination && this.unacknowledgedPagination.totalPages) || 1;
            return currentPage < totalPages;
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
        },
        reclaimableSummary() {
            const unacknowledged = Array.isArray(this.filteredUnacknowledgedDuplicates)
                ? this.filteredUnacknowledgedDuplicates
                : [];
            const acknowledged = Array.isArray(this.filteredAcknowledgedDuplicates)
                ? this.filteredAcknowledgedDuplicates
                : [];
            return computeReclaimableSummary([...unacknowledged, ...acknowledged]);
        },
        filteredDuplicatesForExport() {
            const unacknowledged = Array.isArray(this.filteredUnacknowledgedDuplicates)
                ? this.filteredUnacknowledgedDuplicates
                : [];
            const acknowledged = Array.isArray(this.filteredAcknowledgedDuplicates)
                ? this.filteredAcknowledgedDuplicates
                : [];
            return [...unacknowledged, ...acknowledged];
        }
    },
    methods: {
        exportFilteredCsv() {
            if (this.filteredDuplicatesForExport.length === 0) {
                return false;
            }
            return downloadDuplicatesCsv(this.filteredDuplicatesForExport, 'duplicates-export.csv');
        },
        focusSearch() {
            if (this.$refs.searchBar && typeof this.$refs.searchBar.focus === 'function') {
                this.$refs.searchBar.focus();
                return true;
            }
            return false;
        },
        getNavigableDuplicates() {
            const acknowledged = this.acknowledgedOpen ? this.filteredAcknowledgedDuplicates : [];
            const unacknowledged = this.unacknowledgedOpen ? this.filteredUnacknowledgedDuplicates : [];
            return [...acknowledged, ...unacknowledged];
        },
        scrollActiveDuplicateIntoView() {
            if (!this.$el || typeof this.$el.querySelector !== 'function') {
                return;
            }
            const activeEl = this.$el.querySelector('.duplicate-item .is-active');
            if (activeEl && typeof activeEl.scrollIntoView === 'function') {
                activeEl.scrollIntoView({ block: 'nearest' });
            }
        },
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
            if (this.sortOption === option) {
                return;
            }
            this.sortOption = option;
            this.acknowledgedPage = 1;
            this.unacknowledgedPage = 1;
            this.exhaustedAcknowledged = false;
            this.exhaustedUnacknowledged = false;
            this.$emit('query-options-changed', {
                sortBy: this.sortOption,
                minSize: this.minSizeBytes,
            });
        },
        setMinSizeBytes(bytes) {
            const normalized = Number(bytes) > 0 ? Math.floor(Number(bytes)) : 0;
            if (this.minSizeBytes === normalized) {
                return;
            }
            this.minSizeBytes = normalized;
            this.customMinSizeMb = normalized > 0
                ? String(Math.round((normalized / (1024 * 1024)) * 100) / 100)
                : '';
            this.acknowledgedPage = 1;
            this.unacknowledgedPage = 1;
            this.exhaustedAcknowledged = false;
            this.exhaustedUnacknowledged = false;
            this.$emit('query-options-changed', {
                sortBy: this.sortOption,
                minSize: this.minSizeBytes,
            });
        },
        applyCustomMinSize() {
            const parsedMb = parseFloat(String(this.customMinSizeMb).trim());
            const bytes = Number.isFinite(parsedMb) && parsedMb > 0
                ? Math.round(parsedMb * 1024 * 1024)
                : 0;
            this.setMinSizeBytes(bytes);
            this.showSortMenu = false;
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
        setCategoryFilter(category) {
            this.selectedCategory = DUPLICATE_FILTER_CATEGORIES.includes(category) ? category : 'all';
        },
        filterDuplicate(duplicate) {
            if (this.minSizeBytes > 0) {
                const hasLargeEnoughCopy = Array.isArray(duplicate.files)
                    && duplicate.files.some(file => Number(file.size) >= this.minSizeBytes);
                if (!hasLargeEnoughCopy) {
                    return false;
                }
            }

            if (this.selectedCategory !== 'all' && !matchesDuplicateCategory(duplicate, this.selectedCategory)) {
                return false;
            }

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
        syncActiveSectionWithDuplicate(duplicateId) {
            if (duplicateId === null || duplicateId === undefined) {
                return;
            }
            if (Array.isArray(this.acknowledgedDuplicates) && this.acknowledgedDuplicates.some(d => d.id === duplicateId)) {
                this.activeSection = 'acknowledged';
            } else if (Array.isArray(this.unacknowledgedDuplicates) && this.unacknowledgedDuplicates.some(d => d.id === duplicateId)) {
                this.activeSection = 'unacknowledged';
            }
        },
        toggleSection(section, event) {
            if (event && typeof event.preventDefault === 'function') {
                event.preventDefault();
            }
            this.activeSection = section;
            if (section === 'acknowledged') {
                this.acknowledgedOpen = !this.acknowledgedOpen;
                saveUiPreferences({ acknowledgedOpen: this.acknowledgedOpen });
            } else {
                this.unacknowledgedOpen = !this.unacknowledgedOpen;
                saveUiPreferences({ unacknowledgedOpen: this.unacknowledgedOpen });
            }
        },
        onSectionOpenChange(section, isOpen) {
            this.activeSection = section;
            if (section === 'acknowledged') {
                this.acknowledgedOpen = Boolean(isOpen);
                saveUiPreferences({ acknowledgedOpen: this.acknowledgedOpen });
            } else {
                this.unacknowledgedOpen = Boolean(isOpen);
                saveUiPreferences({ unacknowledgedOpen: this.unacknowledgedOpen });
            }
        },
        openDuplicate(duplicate) {
            if (duplicate && typeof duplicate.acknowledged === 'boolean') {
                this.activeSection = duplicate.acknowledged ? 'acknowledged' : 'unacknowledged';
            } else if (duplicate && duplicate.id !== undefined) {
                this.syncActiveSectionWithDuplicate(duplicate.id);
            }
            this.$emit('open-duplicate', duplicate);
            if (duplicate && duplicate.id !== undefined && duplicate.id !== null) {
                this.maybeAutoLoadForDuplicate(duplicate.id, true);
            }
        },
        setupSentinelObservers() {
            this.teardownSentinelObservers();
            if (typeof window === 'undefined' || typeof window.IntersectionObserver !== 'function') {
                return;
            }
            if (this.hasMoreAcknowledged && this.$refs.acknowledgedSentinel) {
                this.acknowledgedSentinelObserver = new window.IntersectionObserver(entries => {
                    const entry = entries && entries[0];
                    const rawLen = Array.isArray(this.acknowledgedDuplicates) ? this.acknowledgedDuplicates.length : 0;
                    if (entry && entry.isIntersecting && rawLen > 2 && this.acknowledgedOpen) {
                        this.triggerAutoLoadMore('acknowledged');
                    }
                }, { rootMargin: '80px' });
                this.acknowledgedSentinelObserver.observe(this.$refs.acknowledgedSentinel);
            }
            if (this.hasMoreUnacknowledged && this.$refs.unacknowledgedSentinel) {
                this.unacknowledgedSentinelObserver = new window.IntersectionObserver(entries => {
                    const entry = entries && entries[0];
                    const rawLen = Array.isArray(this.unacknowledgedDuplicates) ? this.unacknowledgedDuplicates.length : 0;
                    if (entry && entry.isIntersecting && rawLen > 2 && this.unacknowledgedOpen) {
                        this.triggerAutoLoadMore('unacknowledged');
                    }
                }, { rootMargin: '80px' });
                this.unacknowledgedSentinelObserver.observe(this.$refs.unacknowledgedSentinel);
            }
        },
        teardownSentinelObservers() {
            if (this.acknowledgedSentinelObserver) {
                this.acknowledgedSentinelObserver.disconnect();
                this.acknowledgedSentinelObserver = null;
            }
            if (this.unacknowledgedSentinelObserver) {
                this.unacknowledgedSentinelObserver.disconnect();
                this.unacknowledgedSentinelObserver = null;
            }
        },
        maybeAutoLoadForDuplicate(duplicateId, explicitAction = false) {
            if (duplicateId === null || duplicateId === undefined) {
                return;
            }
            const unackList = this.filteredUnacknowledgedDuplicates;
            const unackIndex = unackList.findIndex(d => d && d.id === duplicateId);
            if (unackIndex !== -1) {
                const canTrigger = explicitAction ? unackList.length >= 1 : unackList.length > 2;
                if (canTrigger && unackIndex >= unackList.length - 2) {
                    this.triggerAutoLoadMore('unacknowledged');
                }
                return;
            }
            const ackList = this.filteredAcknowledgedDuplicates;
            const ackIndex = ackList.findIndex(d => d && d.id === duplicateId);
            if (ackIndex !== -1) {
                const canTrigger = explicitAction ? ackList.length >= 1 : ackList.length > 2;
                if (canTrigger && ackIndex >= ackList.length - 2) {
                    this.triggerAutoLoadMore('acknowledged');
                }
            }
        },
        checkAutoLoadAfterShrink(section) {
            const rawList = section === 'acknowledged'
                ? (Array.isArray(this.acknowledgedDuplicates) ? this.acknowledgedDuplicates : [])
                : (Array.isArray(this.unacknowledgedDuplicates) ? this.unacknowledgedDuplicates : []);
            const filteredList = section === 'acknowledged'
                ? this.filteredAcknowledgedDuplicates
                : this.filteredUnacknowledgedDuplicates;

            if (rawList.length <= 2) {
                this.triggerAutoLoadMore(section);
                return;
            }
            if (this.currentDuplicateId !== null && this.currentDuplicateId !== undefined) {
                const idx = filteredList.findIndex(d => d && d.id === this.currentDuplicateId);
                if (idx !== -1 && idx >= filteredList.length - 2) {
                    this.triggerAutoLoadMore(section);
                }
            }
        },
        triggerAutoLoadMore(section) {
            if (section === 'acknowledged') {
                if (this.hasMoreAcknowledged && !this.isLoadingMoreAcknowledged) {
                    this.loadMoreAcknowledgedDuplicates({ isAuto: true });
                }
            } else if (this.hasMoreUnacknowledged && !this.isLoadingMoreUnacknowledged) {
                this.loadMoreUnacknowledgedDuplicates({ isAuto: true });
            }
        },
        async loadMoreUnacknowledgedDuplicates(loadOptions = {}) {
            if (this.isLoadingMoreUnacknowledged) {
                return;
            }
            const isAuto = Boolean(loadOptions && loadOptions.isAuto === true);
            this.isLoadingMoreUnacknowledged = true;
            this.$emit('load-more-start', 'unacknowledged');
            this.unacknowledgedPage++;
            const requestOptions = {
                sortBy: this.sortOption,
                minSize: this.minSizeBytes,
            };
            if (this.unacknowledgedPagination && Number.isInteger(this.unacknowledgedPagination.nextOffset)) {
                requestOptions.offset = this.unacknowledgedPagination.nextOffset;
            }
            try {
                const newDuplicates = await fetchDuplicates('unacknowledged', this.limit, this.unacknowledgedPage, requestOptions);
                const entities = (newDuplicates && Array.isArray(newDuplicates.entities)) ? newDuplicates.entities : [];
                const pagination = (newDuplicates && newDuplicates.pagination) ? newDuplicates.pagination : null;
                if (isAuto && entities.length === 0) {
                    this.exhaustedUnacknowledged = true;
                }
                this.$emit('update-unacknowledged-duplicates', entities, pagination);
            } catch (error) {
                this.unacknowledgedPage = Math.max(1, this.unacknowledgedPage - 1);
                if (isAuto) {
                    this.exhaustedUnacknowledged = true;
                }
            } finally {
                this.isLoadingMoreUnacknowledged = false;
            }
        },
        async loadMoreAcknowledgedDuplicates(loadOptions = {}) {
            if (this.isLoadingMoreAcknowledged) {
                return;
            }
            const isAuto = Boolean(loadOptions && loadOptions.isAuto === true);
            this.isLoadingMoreAcknowledged = true;
            this.$emit('load-more-start', 'acknowledged');
            this.acknowledgedPage++;
            const requestOptions = {
                sortBy: this.sortOption,
                minSize: this.minSizeBytes,
            };
            if (this.acknowledgedPagination && Number.isInteger(this.acknowledgedPagination.nextOffset)) {
                requestOptions.offset = this.acknowledgedPagination.nextOffset;
            }
            try {
                const newDuplicates = await fetchDuplicates('acknowledged', this.limit, this.acknowledgedPage, requestOptions);
                const entities = (newDuplicates && Array.isArray(newDuplicates.entities)) ? newDuplicates.entities : [];
                const pagination = (newDuplicates && newDuplicates.pagination) ? newDuplicates.pagination : null;
                if (isAuto && entities.length === 0) {
                    this.exhaustedAcknowledged = true;
                }
                this.$emit('update-acknowledged-duplicates', entities, pagination);
            } catch (error) {
                this.acknowledgedPage = Math.max(1, this.acknowledgedPage - 1);
                if (isAuto) {
                    this.exhaustedAcknowledged = true;
                }
            } finally {
                this.isLoadingMoreAcknowledged = false;
            }
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
            // Filter out the current duplicate from the lists since it's being removed
            const acknowledgedList = this.filteredAcknowledgedDuplicates.filter(d => d.id !== currentDuplicate.id);
            const unacknowledgedList = this.filteredUnacknowledgedDuplicates.filter(d => d.id !== currentDuplicate.id);

            console.log('ISSUE146: findNextAvailableDuplicate called');
            console.log('ISSUE146: currentDuplicate.id =', currentDuplicate.id);
            console.log('ISSUE146: type =', type);
            console.log('ISSUE146: sortOption =', this.sortOption);
            
            // Log the sorted lists with their IDs and sizes (after filtering out current)
            console.log('ISSUE146: acknowledgedList IDs and sizes (after filtering):');
            acknowledgedList.forEach((d, i) => {
                const size = getTotalSizeOfDuplicate(d);
                console.log(`ISSUE146:   [${i}] id=${d.id}, size=${size}, hash=${d.hash}`);
            });
            
            console.log('ISSUE146: unacknowledgedList IDs and sizes (after filtering):');
            unacknowledgedList.forEach((d, i) => {
                const size = getTotalSizeOfDuplicate(d);
                console.log(`ISSUE146:   [${i}] id=${d.id}, size=${size}, hash=${d.hash}`);
            });

            // When sorting is active, always take the first item from the sorted list
            // This ensures we always get the next item according to the current sort order
            if (this.sortOption !== 'none') {
                console.log('ISSUE146: Sorting is active, taking first from sorted list');
                
                if (type === 'acknowledged') {
                    if (acknowledgedList.length > 0) {
                        const firstDup = acknowledgedList[0];
                        console.log('ISSUE146: Taking first from sorted acknowledgedList');
                        console.log('ISSUE146: First duplicate id =', firstDup.id);
                        console.log('ISSUE146: First duplicate size =', getTotalSizeOfDuplicate(firstDup));
                        return firstDup;
                    }
                    // If no more in acknowledged, try unacknowledged
                    if (unacknowledgedList.length > 0) {
                        const firstUnack = unacknowledgedList[0];
                        console.log('ISSUE146: No more acknowledged, taking first unacknowledged');
                        console.log('ISSUE146: First unacknowledged id =', firstUnack.id);
                        console.log('ISSUE146: First unacknowledged size =', getTotalSizeOfDuplicate(firstUnack));
                        return firstUnack;
                    }
                } else {
                    if (unacknowledgedList.length > 0) {
                        const firstDup = unacknowledgedList[0];
                        console.log('ISSUE146: Taking first from sorted unacknowledgedList');
                        console.log('ISSUE146: First duplicate id =', firstDup.id);
                        console.log('ISSUE146: First duplicate size =', getTotalSizeOfDuplicate(firstDup));
                        return firstDup;
                    }
                    // If no more in unacknowledged, try acknowledged
                    if (acknowledgedList.length > 0) {
                        const firstAck = acknowledgedList[0];
                        console.log('ISSUE146: No more unacknowledged, taking first acknowledged');
                        console.log('ISSUE146: First acknowledged id =', firstAck.id);
                        console.log('ISSUE146: First acknowledged size =', getTotalSizeOfDuplicate(firstAck));
                        return firstAck;
                    }
                }
                console.log('ISSUE146: No duplicates left at all');
                return null;
            }

            // Original behavior when no sorting is active
            console.log('ISSUE146: No sorting active, using original logic');
            
            // Since we already filtered out the current duplicate, we need to use the original lists for finding the index
            const originalAcknowledgedList = this.filteredAcknowledgedDuplicates;
            const originalUnacknowledgedList = this.filteredUnacknowledgedDuplicates;
            
            if (type === 'acknowledged') {
                // Try to find next in acknowledged list
                const index = originalAcknowledgedList.findIndex(d => d.id === currentDuplicate.id);
                console.log('ISSUE146: index in originalAcknowledgedList =', index);
                
                if (index !== -1 && index < originalAcknowledgedList.length - 1) {
                    // Found current duplicate and there's a next one
                    const nextDup = originalAcknowledgedList[index + 1];
                    console.log('ISSUE146: Found next in same list at index', index + 1);
                    console.log('ISSUE146: Next duplicate id =', nextDup.id);
                    console.log('ISSUE146: Next duplicate size =', getTotalSizeOfDuplicate(nextDup));
                    return nextDup;
                }
                // Current duplicate not found (already removed) or was the last one
                // Take the first from the filtered list (without current duplicate)
                if (acknowledgedList.length > 0) {
                    const firstDup = acknowledgedList[0];
                    console.log('ISSUE146: Taking first from acknowledgedList');
                    console.log('ISSUE146: First duplicate id =', firstDup.id);
                    console.log('ISSUE146: First duplicate size =', getTotalSizeOfDuplicate(firstDup));
                    return firstDup;
                }
                // If no more in acknowledged, try unacknowledged
                if (unacknowledgedList.length > 0) {
                    const firstUnack = unacknowledgedList[0];
                    console.log('ISSUE146: No more acknowledged, taking first unacknowledged');
                    console.log('ISSUE146: First unacknowledged id =', firstUnack.id);
                    console.log('ISSUE146: First unacknowledged size =', getTotalSizeOfDuplicate(firstUnack));
                    return firstUnack;
                }
                console.log('ISSUE146: No duplicates left at all');
                return null;
            } else {
                // Try to find next in unacknowledged list
                const index = originalUnacknowledgedList.findIndex(d => d.id === currentDuplicate.id);
                console.log('ISSUE146: index in originalUnacknowledgedList =', index);
                
                if (index !== -1 && index < originalUnacknowledgedList.length - 1) {
                    // Found current duplicate and there's a next one
                    const nextDup = originalUnacknowledgedList[index + 1];
                    console.log('ISSUE146: Found next in same list at index', index + 1);
                    console.log('ISSUE146: Next duplicate id =', nextDup.id);
                    console.log('ISSUE146: Next duplicate size =', getTotalSizeOfDuplicate(nextDup));
                    return nextDup;
                }
                // Current duplicate not found (already removed) or was the last one
                // Take the first from the filtered list (without current duplicate)
                if (unacknowledgedList.length > 0) {
                    const firstDup = unacknowledgedList[0];
                    console.log('ISSUE146: Taking first from unacknowledgedList');
                    console.log('ISSUE146: First duplicate id =', firstDup.id);
                    console.log('ISSUE146: First duplicate size =', getTotalSizeOfDuplicate(firstDup));
                    return firstDup;
                }
                // If no more in unacknowledged, try acknowledged
                if (acknowledgedList.length > 0) {
                    const firstAck = acknowledgedList[0];
                    console.log('ISSUE146: No more unacknowledged, taking first acknowledged');
                    console.log('ISSUE146: First acknowledged id =', firstAck.id);
                    console.log('ISSUE146: First acknowledged size =', getTotalSizeOfDuplicate(firstAck));
                    return firstAck;
                }
                console.log('ISSUE146: No duplicates left at all');
                return null;
            }
        },

        selectNextDuplicateAfterResolution(duplicate, type) {
            console.log('ISSUE146: selectNextDuplicateAfterResolution called');
            console.log('ISSUE146: duplicate.id =', duplicate.id);
            console.log('ISSUE146: duplicate.hash =', duplicate.hash);
            
            // Wait for Vue to update the DOM with the new lists
            this.$nextTick(() => {
                console.log('ISSUE146: After nextTick, lists should be updated');
                const nextDuplicate = this.findNextAvailableDuplicate(duplicate, type);
                if (nextDuplicate) {
                    console.log('ISSUE146: Opening next duplicate');
                    console.log('ISSUE146: nextDuplicate.id =', nextDuplicate.id);
                    console.log('ISSUE146: nextDuplicate.hash =', nextDuplicate.hash);
                    this.openDuplicate(nextDuplicate);
                } else {
                    console.log('ISSUE146: No next duplicate found, emitting null');
                    this.$emit('open-duplicate', null);
                }
            });
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
    position: relative;
    z-index: 2000;
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
    z-index: 2000;
    margin-inline-start: 8px;
}

.icon-only-button {
    position: relative;
    background: transparent;
    border: none;
    border-radius: 50%;
    width: 44px;
    height: 44px;
    min-width: 44px;
    min-height: 44px;
    margin: 0 !important;
    padding: 0 !important;
    line-height: 1 !important;
    flex-shrink: 0;
    color: var(--color-main-text);
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    cursor: pointer;
    transition: background-color 0.2s;
    box-sizing: border-box;
}

.icon-only-button svg {
    display: block !important;
    margin: auto !important;
    flex-shrink: 0;
}

.icon-only-button:hover,
.icon-only-button.has-active-filter {
    background-color: var(--color-background-hover);
}

.icon-only-button:focus-visible,
.sort-option:focus-visible,
.custom-size-input:focus-visible,
.custom-size-apply:focus-visible,
.fixed-nav-button:focus-visible,
.filter-chip:focus-visible,
.menu-item:focus-visible,
.action-button:focus-visible,
.menu-close-button:focus-visible,
.load-more-button:focus-visible {
    outline: 2px solid var(--color-primary-element, #0082c9);
    outline-offset: 2px;
}

.active-filter-dot {
    position: absolute;
    top: 6px;
    inset-inline-end: 6px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background-color: var(--color-primary-element);
}

.sort-menu {
    position: absolute;
    inset-inline-end: 0;
    top: calc(100% + 4px);
    background-color: var(--color-main-background, #ffffff);
    background-image: linear-gradient(var(--color-main-background, #ffffff), var(--color-main-background, #ffffff)), linear-gradient(#22262c, #22262c);
    border: 1px solid var(--color-border-dark, var(--color-border));
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
    z-index: 2000;
    min-width: 220px;
    max-width: calc(100vw - 24px);
    padding: 6px 0;
    opacity: 1;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
}

.sort-menu-section-title {
    padding: 6px 12px 4px;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--color-text-maxcontrast);
    text-transform: uppercase;
    letter-spacing: 0.03em;
}

.sort-menu-divider {
    height: 1px;
    margin: 4px 0;
    background-color: var(--color-border);
}

.sort-option {
    display: flex;
    align-items: center;
    width: 100%;
    min-height: 44px;
    padding: 7px 12px;
    border: none;
    background: transparent;
    color: var(--color-main-text);
    text-align: start;
    cursor: pointer;
    transition: background-color 0.2s;
    font-size: 0.9rem;
}

.sort-option:hover {
    background-color: var(--color-background-hover);
}

.sort-option.active {
    font-weight: 600;
    color: var(--color-primary-element);
    background-color: var(--color-primary-element-light);
}

.custom-size-row {
    display: flex;
    gap: 6px;
    padding: 6px 10px 8px;
}

.custom-size-input {
    width: 100%;
    min-width: 0;
    padding: 4px 8px;
    font-size: 0.85rem;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: var(--color-main-background);
    color: var(--color-main-text);
}

.custom-size-apply {
    padding: 4px 10px;
    font-size: 0.82rem;
    border: none;
    border-radius: 4px;
    background: var(--color-primary-element);
    color: var(--color-primary-text);
    cursor: pointer;
    white-space: nowrap;
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
    justify-content: center;
    min-width: 44px;
    min-height: 44px;
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
    position: relative;
    z-index: 1500;
    background-color: var(--color-main-background, #ffffff);
    background-image: linear-gradient(var(--color-main-background, #ffffff), var(--color-main-background, #ffffff)), linear-gradient(#22262c, #22262c);
    border: 1px solid var(--color-border-dark, var(--color-border));
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
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
    width: 100%;
    min-height: 44px;
    padding: 10px 16px;
    display: flex;
    align-items: flex-start;
    text-align: start;
    background: transparent;
    border-block: none;
    border-inline-end: none;
    border-inline-start: 3px solid transparent;
    color: var(--color-main-text);
    cursor: pointer;
    transition: background-color 0.2s;
    flex-wrap: wrap;
}

.action-item {
    color: var(--color-primary-element);
}

.menu-item span {
    margin-inline-start: 10px;
}

.menu-item-description {
    margin-inline-start: 26px !important;
    font-size: 0.8rem;
    color: var(--color-text-maxcontrast);
    width: 100%;
    margin-top: 4px;
}

.menu-item:hover, .menu-item.active {
    background-color: var(--color-background-hover);
    border-inline-start-color: var(--color-primary-element);
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

.load-more-button {
    margin: 8px;
    padding: 8px 12px;
    min-height: 44px;
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

/* Quick File-Type Filter Chips & Live Reclaimable Summary */
.quick-filter-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-block: 10px;
    padding-inline: 10px;
    border-block-end: 1px solid var(--color-border);
    max-inline-size: 100%;
    box-sizing: border-box;
}

.quick-filter-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    max-inline-size: 100%;
    box-sizing: border-box;
}

.filter-chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-inline-size: 44px;
    min-block-size: 44px;
    padding-block: 6px;
    padding-inline: 12px;
    border: 1px solid var(--color-border-dark, var(--color-border));
    border-radius: 999px;
    background-color: var(--color-main-background);
    color: var(--color-main-text);
    font-size: 0.85rem;
    font-weight: 500;
    line-height: 1.2;
    cursor: pointer;
    transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
    box-sizing: border-box;
}

.filter-chip:hover {
    background-color: var(--color-background-hover);
}

.filter-chip.active {
    background-color: var(--color-primary-element);
    border-color: var(--color-primary-element);
    color: var(--color-primary-text);
    font-weight: 600;
}

.filter-chip.active:hover {
    background-color: var(--color-primary-element-hover);
    border-color: var(--color-primary-element-hover);
}

.reclaimable-summary-badge {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 4px 8px;
    padding-block: 6px;
    padding-inline: 10px;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    background-color: var(--color-background-hover);
    color: var(--color-main-text);
    font-size: 0.82rem;
    line-height: 1.3;
    max-inline-size: 100%;
    box-sizing: border-box;
}

.reclaimable-summary-value {
    font-weight: 600;
    color: var(--color-main-text);
}

.reclaimable-summary-meta {
    color: var(--color-text-maxcontrast);
    font-size: 0.78rem;
}

.export-csv-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    inline-size: 100%;
    min-inline-size: 44px;
    min-block-size: 44px;
    padding-block: 6px;
    padding-inline: 12px;
    margin: 0;
    border: 1px solid var(--color-border-dark, var(--color-border));
    border-radius: 6px;
    background-color: var(--color-main-background);
    color: var(--color-main-text);
    font-size: 0.85rem;
    font-weight: 600;
    line-height: 1.2;
    cursor: pointer;
    box-sizing: border-box;
    transition: background-color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
}

.export-csv-button svg {
    display: block;
    flex-shrink: 0;
}

.export-csv-button:hover:not(:disabled) {
    background-color: var(--color-background-hover);
    border-color: var(--color-primary-element, #0082c9);
}

.export-csv-button:focus-visible {
    outline: 2px solid var(--color-primary-element, #0082c9);
    outline-offset: 2px;
}

.export-csv-button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
}

/* Consistent highlighting and full-row clickability for Acknowledged / Unacknowledged sections */
.duplicate-section-nav :deep(.app-navigation-entry.active .button-vue.icon-collapse) {
    color: var(--color-primary-element-text);
}

.duplicate-section-nav :deep(.app-navigation-entry.active .button-vue.icon-collapse:hover),
.duplicate-section-nav :deep(.app-navigation-entry.active .button-vue.icon-collapse:focus-visible) {
    background-color: var(--color-primary-element-hover);
    color: var(--color-primary-element-text);
}

.duplicate-section-nav :deep(.app-navigation-entry:not(.active) .button-vue.icon-collapse:hover),
.duplicate-section-nav :deep(.app-navigation-entry:not(.active) .button-vue.icon-collapse:focus-visible) {
    background-color: var(--color-primary-element-light);
    color: var(--color-primary-element);
}
</style>