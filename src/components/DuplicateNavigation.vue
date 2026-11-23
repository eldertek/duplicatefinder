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
                            :class="{ 'active': sortOption === 'reclaimable-desc' }"
                            :aria-pressed="sortOption === 'reclaimable-desc' ? 'true' : 'false'"
                            @click="setSortOption('reclaimable-desc'); toggleSortMenu()">
                            {{ t('duplicatefinder', 'Reclaimable space (most wasted first)') }}
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
                        <span class="filter-chip-label">{{ chip.label }}</span>
                        <span class="filter-chip-count">({{ chip.count }})</span>
                    </button>
                </div>
                <div class="folder-filter-row">
                    <input
                        v-model="folderQuery"
                        type="text"
                        class="folder-filter-input"
                        :placeholder="t('duplicatefinder', 'Folder filter (/Photos or !/Backups)')"
                        :aria-label="t('duplicatefinder', 'Filter by folder prefix (e.g. /Photos or !/Backups)')"
                        @keydown.esc="folderQuery = ''" />
                </div>
                <div class="min-size-filter-row">
                    <label
                        for="duplicate-min-size-select"
                        class="min-size-filter-label">
                        {{ t('duplicatefinder', 'Minimum file size') }}
                    </label>
                    <select
                        id="duplicate-min-size-select"
                        v-model="selectedMinSizePreset"
                        class="min-size-filter-select"
                        :aria-label="t('duplicatefinder', 'Minimum file size')"
                        aria-keyshortcuts="m">
                        <option
                            v-for="option in minSizeSelectOptions"
                            :key="option.id"
                            :value="option.id">
                            {{ option.label }}
                        </option>
                        <option
                            v-if="selectedMinSizePreset === 'custom'"
                            value="custom">
                            {{ customMinSizeOptionLabel }}
                        </option>
                    </select>
                </div>
                <div class="min-copies-filter-row">
                    <label
                        for="duplicate-min-copies-select"
                        class="min-copies-filter-label">
                        {{ t('duplicatefinder', 'Minimum copies') }}
                    </label>
                    <select
                        id="duplicate-min-copies-select"
                        v-model="selectedMinCopiesPreset"
                        class="min-copies-filter-select"
                        :aria-label="t('duplicatefinder', 'Minimum copies')">
                        <option
                            v-for="option in minCopiesSelectOptions"
                            :key="option.id"
                            :value="option.id">
                            {{ option.label }}
                        </option>
                    </select>
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
                <div
                    v-if="extensionBreakdown.length > 0"
                    class="extension-insights-bar"
                    role="group"
                    :aria-label="t('duplicatefinder', 'Top duplicate file extensions by reclaimable space')">
                    <div class="extension-insights-header">
                        <span class="extension-insights-label">
                            {{ t('duplicatefinder', 'Top extensions') }}
                        </span>
                        <button
                            v-if="largestDuplicateGroup"
                            type="button"
                            class="largest-group-jump-button"
                            :class="{ 'active': currentDuplicateId === largestDuplicateGroup.id }"
                            aria-keyshortcuts="g"
                            :title="t('duplicatefinder', 'Jump to largest duplicate group ({size})', { size: largestDuplicateFormattedSize })"
                            :aria-label="t('duplicatefinder', 'Jump to largest duplicate group ({size})', { size: largestDuplicateFormattedSize })"
                            @click="jumpToLargestGroup">
                            {{ t('duplicatefinder', 'Largest: {size}', { size: largestDuplicateFormattedSize }) }}
                        </button>
                    </div>
                    <div class="extension-insights-list">
                        <button
                            v-for="item in extensionBreakdown"
                            :key="item.ext"
                            type="button"
                            class="extension-insight-chip"
                            :class="{ 'active': selectedExtension === item.ext }"
                            :aria-pressed="selectedExtension === item.ext ? 'true' : 'false'"
                            :title="t('duplicatefinder', '{ext}: {size} reclaimable ({pct}%, {groups} groups)', {
                                ext: item.ext,
                                size: item.reclaimableFormatted,
                                pct: item.sharePct,
                                groups: item.groupCount,
                            })"
                            @click="toggleExtensionFilter(item.ext)">
                            <span class="extension-insight-ext">{{ item.ext }}</span>
                            <span class="extension-insight-size">{{ item.reclaimableFormatted }}</span>
                            <span class="extension-insight-pct">{{ item.sharePct }}%</span>
                        </button>
                    </div>
                </div>
                <div
                    v-if="activeFilterChips.length > 0"
                    class="active-filter-chips"
                    role="group"
                    :aria-label="t('duplicatefinder', 'Active filters')">
                    <button
                        v-for="chip in activeFilterChips"
                        :key="chip.key"
                        type="button"
                        class="active-filter-chip"
                        :data-filter-key="chip.key"
                        :title="t('duplicatefinder', 'Remove filter: {label}', { label: chip.label })"
                        :aria-label="t('duplicatefinder', 'Remove filter: {label}', { label: chip.label })"
                        @click="removeFilterChip(chip.key)">
                        <span class="active-filter-chip-label">{{ chip.label }}</span>
                        <span class="active-filter-chip-remove" aria-hidden="true">×</span>
                    </button>
                </div>
                <div class="quick-filter-actions">
                    <button
                        v-if="hasActiveFilters"
                        type="button"
                        class="reset-filters-button"
                        aria-keyshortcuts="r 0"
                        :title="t('duplicatefinder', 'Reset all active filters and sorting')"
                        :aria-label="resetFiltersButtonLabel"
                        aria-live="polite"
                        @click="resetFilters">
                        {{ resetFiltersButtonLabel }}
                    </button>
                    <button
                        type="button"
                        class="export-csv-button"
                        aria-keyshortcuts="e"
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
                    <button
                        type="button"
                        class="export-json-button"
                        aria-keyshortcuts="x"
                        :disabled="filteredDuplicatesForExport.length === 0"
                        :title="t('duplicatefinder', 'Export filtered duplicates as JSON')"
                        :aria-label="t('duplicatefinder', 'Export JSON')"
                        @click="exportFilteredJson">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                        <span>{{ t('duplicatefinder', 'Export JSON') }}</span>
                    </button>
                </div>
                <div
                    class="sr-only filtered-groups-live-status"
                    role="status"
                    aria-live="polite"
                    aria-atomic="true">
                    {{ filteredGroupsAnnouncement }}
                </div>
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
                <template #extra>
                    <span
                        v-if="filteredAcknowledgedDuplicates.length > 0"
                        class="section-group-count"
                        :aria-label="t('duplicatefinder', '{count} groups', { count: filteredAcknowledgedDuplicates.length })">
                        {{ filteredAcknowledgedDuplicates.length }}
                    </span>
                </template>
                    <div v-show="acknowledgedEmptyState === 'populated'">
                        <div v-for="duplicate in filteredAcknowledgedDuplicates" :key="duplicate.id" class="duplicate-item">
                            <DuplicateListItem
                                :duplicate="duplicate"
                                :isActive="currentDuplicateId === duplicate.id"
                                :max-reclaimable-bytes="maxVisibleReclaimableBytes"
                                @duplicate-selected="openDuplicate"
                                @duplicate-resolved="handleDuplicateResolved" />
                        </div>
                    </div>
                    <div
                        v-if="acknowledgedEmptyState !== 'populated'"
                        class="empty-duplicates-state"
                        role="status"
                        aria-live="polite">
                        <template v-if="acknowledgedEmptyState === 'filtered-empty'">
                            <p class="empty-state-message">
                                {{ t('duplicatefinder', 'No duplicates match the current filters') }}
                            </p>
                            <button
                                type="button"
                                class="empty-state-reset-button"
                                aria-keyshortcuts="r 0"
                                :aria-label="t('duplicatefinder', 'Reset filters')"
                                @click="resetFilters">
                                {{ t('duplicatefinder', 'Reset filters') }}
                            </button>
                        </template>
                        <p v-else class="empty-state-message">
                            {{ t('duplicatefinder', 'No duplicates found yet') }}
                        </p>
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
                <template #extra>
                    <span
                        v-if="filteredUnacknowledgedDuplicates.length > 0"
                        class="section-group-count"
                        :aria-label="t('duplicatefinder', '{count} groups', { count: filteredUnacknowledgedDuplicates.length })">
                        {{ filteredUnacknowledgedDuplicates.length }}
                    </span>
                </template>
                    <div v-show="unacknowledgedEmptyState === 'populated'">
                        <div v-for="duplicate in filteredUnacknowledgedDuplicates" :key="duplicate.id" class="duplicate-item">
                            <DuplicateListItem
                                :duplicate="duplicate"
                                :isActive="currentDuplicateId === duplicate.id"
                                :max-reclaimable-bytes="maxVisibleReclaimableBytes"
                                @duplicate-selected="openDuplicate"
                                @duplicate-resolved="handleDuplicateResolved" />
                        </div>
                    </div>
                    <div
                        v-if="unacknowledgedEmptyState !== 'populated'"
                        class="empty-duplicates-state"
                        role="status"
                        aria-live="polite">
                        <template v-if="unacknowledgedEmptyState === 'filtered-empty'">
                            <p class="empty-state-message">
                                {{ t('duplicatefinder', 'No duplicates match the current filters') }}
                            </p>
                            <button
                                type="button"
                                class="empty-state-reset-button"
                                aria-keyshortcuts="r 0"
                                :aria-label="t('duplicatefinder', 'Reset filters')"
                                @click="resetFilters">
                                {{ t('duplicatefinder', 'Reset filters') }}
                            </button>
                        </template>
                        <p v-else class="empty-state-message">
                            {{ t('duplicatefinder', 'No duplicates found yet') }}
                        </p>
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
    MIN_COPIES_PRESETS,
    MIN_SIZE_PRESETS,
    buildActiveFilterChips,
    computeCategoryCounts,
    computeReclaimableSummary,
    countActiveTriageFilters,
    filterDuplicatesByMinCopies,
    filterDuplicatesByMinSize,
    matchesDuplicateCategory,
} from '@/tools/duplicateFilters';
import {
    DEFAULT_ALLOWED_SORT_KEYS,
    filterDuplicatesByFolderPrefix,
    loadTriagePreferences,
    saveTriagePreferences,
} from '@/tools/duplicatePreferences';
import { downloadDuplicatesCsv, downloadDuplicatesJson } from '@/tools/duplicateSelectionAndExport';
import { sortDuplicatesDeterministically } from '@/tools/duplicateSortHelper';
import {
    computeExtensionBreakdown,
    computeGroupReclaimableBytes,
    computeMaxReclaimableBytes,
    findLargestDuplicateGroup,
    formatBytes,
    matchesDuplicateExtension,
} from '@/tools/duplicateStats';

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
            selectedExtension: '',
            folderQuery: '',
            minCopiesPreset: 'any',
            acknowledgedOpen: savedPreferences.acknowledgedOpen,
            unacknowledgedOpen: savedPreferences.unacknowledgedOpen,
            activeSection: 'unacknowledged',
        };
    },
    created() {
        this.restoreTriagePreferences();
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
        hasActiveFilters() {
            return this.selectedCategory !== 'all'
                || this.selectedExtension !== ''
                || this.folderQuery.trim() !== ''
                || this.minSizeBytes > 0
                || this.selectedMinCopiesPreset !== 'any'
                || this.sortOption !== 'none'
                || Boolean(this.searchPattern);
        },
        activeTriageFilterCount() {
            return countActiveTriageFilters({
                category: this.selectedCategory,
                extension: this.selectedExtension,
                folderQuery: this.folderQuery,
                minSizePreset: this.selectedMinSizePreset,
                minCopiesPreset: this.selectedMinCopiesPreset,
                searchQuery: this.searchPattern,
            });
        },
        activeFilterChips() {
            const chips = buildActiveFilterChips({
                category: this.selectedCategory,
                extension: this.selectedExtension,
                folderQuery: this.folderQuery,
                minSizePreset: this.selectedMinSizePreset,
                minSizeBytes: this.minSizeBytes,
                minCopiesPreset: this.selectedMinCopiesPreset,
                searchQuery: this.searchPattern,
            });
            const localizedCategories = {
                Images: t('duplicatefinder', 'Images'),
                Videos: t('duplicatefinder', 'Videos'),
                Audio: t('duplicatefinder', 'Audio'),
                Documents: t('duplicatefinder', 'Documents'),
                Archives: t('duplicatefinder', 'Archives'),
                '> 10 MB': t('duplicatefinder', '> 10 MB'),
            };
            return chips.map(chip => {
                if (chip.key === 'category' && Object.prototype.hasOwnProperty.call(localizedCategories, chip.label)) {
                    return { ...chip, label: localizedCategories[chip.label] };
                }
                return chip;
            });
        },
        resetFiltersButtonLabel() {
            if (this.activeTriageFilterCount > 0) {
                return t('duplicatefinder', 'Reset filters ({count})', {
                    count: this.activeTriageFilterCount,
                });
            }
            return t('duplicatefinder', 'Reset filters');
        },
        baseDuplicatesForCategoryCounts() {
            const unacknowledged = Array.isArray(this.unacknowledgedDuplicates)
                ? this.unacknowledgedDuplicates
                : [];
            const acknowledged = Array.isArray(this.acknowledgedDuplicates)
                ? this.acknowledgedDuplicates
                : [];
            return this.applyClientFilters([...unacknowledged, ...acknowledged], {
                ignoreCategory: true,
                ignoreExtension: true,
            });
        },
        categoryCounts() {
            return computeCategoryCounts(this.baseDuplicatesForCategoryCounts);
        },
        categoryFilterChips() {
            const counts = this.categoryCounts;
            return [
                { id: 'all', label: t('duplicatefinder', 'All'), count: counts.all },
                { id: 'images', label: t('duplicatefinder', 'Images'), count: counts.images },
                { id: 'videos', label: t('duplicatefinder', 'Videos'), count: counts.videos },
                { id: 'audio', label: t('duplicatefinder', 'Audio'), count: counts.audio },
                { id: 'documents', label: t('duplicatefinder', 'Documents'), count: counts.documents },
                { id: 'archives', label: t('duplicatefinder', 'Archives'), count: counts.archives },
                { id: 'large', label: t('duplicatefinder', '> 10 MB'), count: counts.large },
            ];
        },
        selectedMinSizePreset: {
            get() {
                for (const [key, bytes] of Object.entries(MIN_SIZE_PRESETS)) {
                    if (this.minSizeBytes === bytes) {
                        return key;
                    }
                }
                return 'custom';
            },
            set(preset) {
                this.setMinSizePreset(preset);
            },
        },
        minSizeSelectOptions() {
            return [
                { id: 'any', bytes: MIN_SIZE_PRESETS.any, label: t('duplicatefinder', 'Any size') },
                { id: '1mb', bytes: MIN_SIZE_PRESETS['1mb'], label: '>= 1 MB' },
                { id: '10mb', bytes: MIN_SIZE_PRESETS['10mb'], label: '>= 10 MB' },
                { id: '100mb', bytes: MIN_SIZE_PRESETS['100mb'], label: '>= 100 MB' },
            ];
        },
        selectedMinCopiesPreset: {
            get() {
                return Object.prototype.hasOwnProperty.call(MIN_COPIES_PRESETS, this.minCopiesPreset)
                    ? this.minCopiesPreset
                    : 'any';
            },
            set(preset) {
                this.setMinCopiesPreset(preset);
            },
        },
        minCopiesSelectOptions() {
            return [
                { id: 'any', minCopies: MIN_COPIES_PRESETS.any, label: t('duplicatefinder', 'Any count') },
                { id: '3plus', minCopies: MIN_COPIES_PRESETS['3plus'], label: t('duplicatefinder', '3+ copies') },
                { id: '5plus', minCopies: MIN_COPIES_PRESETS['5plus'], label: t('duplicatefinder', '5+ copies') },
            ];
        },
        customMinSizeOptionLabel() {
            return `>= ${formatBytes(this.minSizeBytes)}`;
        },
        minSizePresets() {
            return [
                { bytes: MIN_SIZE_PRESETS.any, label: t('duplicatefinder', 'All sizes') },
                { bytes: MIN_SIZE_PRESETS['1mb'], label: '>= 1 MB' },
                { bytes: MIN_SIZE_PRESETS['10mb'], label: '>= 10 MB' },
                { bytes: MIN_SIZE_PRESETS['100mb'], label: '>= 100 MB' },
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
            return this.sortDuplicates(this.applyClientFilters(this.unacknowledgedDuplicates));
        },
        filteredAcknowledgedDuplicates() {
            return this.sortDuplicates(this.applyClientFilters(this.acknowledgedDuplicates));
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
        baseFilteredDuplicatesForStats() {
            const unacknowledged = Array.isArray(this.unacknowledgedDuplicates)
                ? this.unacknowledgedDuplicates
                : [];
            const acknowledged = Array.isArray(this.acknowledgedDuplicates)
                ? this.acknowledgedDuplicates
                : [];
            return this.applyClientFilters([...unacknowledged, ...acknowledged], {
                ignoreExtension: true,
            });
        },
        extensionBreakdown() {
            return computeExtensionBreakdown(this.baseFilteredDuplicatesForStats, 3);
        },
        largestDuplicateGroup() {
            return findLargestDuplicateGroup(this.filteredDuplicatesForExport);
        },
        maxVisibleReclaimableBytes() {
            return computeMaxReclaimableBytes(this.filteredDuplicatesForExport);
        },
        largestDuplicateFormattedSize() {
            if (!this.largestDuplicateGroup) {
                return '';
            }
            return formatBytes(computeGroupReclaimableBytes(this.largestDuplicateGroup));
        },
        filteredDuplicatesForExport() {
            const unacknowledged = Array.isArray(this.filteredUnacknowledgedDuplicates)
                ? this.filteredUnacknowledgedDuplicates
                : [];
            const acknowledged = Array.isArray(this.filteredAcknowledgedDuplicates)
                ? this.filteredAcknowledgedDuplicates
                : [];
            return [...unacknowledged, ...acknowledged];
        },
        totalLoadedGroupCount() {
            const unacknowledged = Array.isArray(this.unacknowledgedDuplicates)
                ? this.unacknowledgedDuplicates.length
                : 0;
            const acknowledged = Array.isArray(this.acknowledgedDuplicates)
                ? this.acknowledgedDuplicates.length
                : 0;
            return unacknowledged + acknowledged;
        },
        filteredGroupsAnnouncement() {
            const total = this.totalLoadedGroupCount;
            if (total === 0) {
                return '';
            }
            const count = this.filteredDuplicatesForExport.length;
            if (this.hasActiveFilters) {
                return total === 1
                    ? t('duplicatefinder', '{count} of {total} duplicate group shown', { count, total })
                    : t('duplicatefinder', '{count} of {total} duplicate groups shown', { count, total });
            }
            return count === 1
                ? t('duplicatefinder', '{count} duplicate group shown', { count })
                : t('duplicatefinder', '{count} duplicate groups shown', { count });
        },
        acknowledgedEmptyState() {
            return this.resolveSectionEmptyState(
                this.acknowledgedDuplicates,
                this.filteredAcknowledgedDuplicates,
            );
        },
        unacknowledgedEmptyState() {
            return this.resolveSectionEmptyState(
                this.unacknowledgedDuplicates,
                this.filteredUnacknowledgedDuplicates,
            );
        }
    },
    methods: {
        /**
         * Determine deterministic display state for a duplicate navigation section.
         * @param {Array} rawDuplicates Unfiltered duplicates passed to the section.
         * @param {Array} filteredDuplicates Duplicates remaining after active filters.
         * @returns {'populated'|'filtered-empty'|'initial-empty'}
         */
        resolveSectionEmptyState(rawDuplicates, filteredDuplicates) {
            const filteredCount = Array.isArray(filteredDuplicates) ? filteredDuplicates.length : 0;
            if (filteredCount > 0) {
                return 'populated';
            }
            const rawCount = Array.isArray(rawDuplicates) ? rawDuplicates.length : 0;
            return rawCount > 0 ? 'filtered-empty' : 'initial-empty';
        },
        exportFilteredCsv() {
            if (this.filteredDuplicatesForExport.length === 0) {
                return false;
            }
            return downloadDuplicatesCsv(this.filteredDuplicatesForExport, 'duplicates-export.csv');
        },
        exportFilteredJson() {
            if (this.filteredDuplicatesForExport.length === 0) {
                return false;
            }
            return downloadDuplicatesJson(this.filteredDuplicatesForExport, 'duplicates-export.json');
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
        getSafeLocalStorage() {
            try {
                return typeof window !== 'undefined' ? window.localStorage : null;
            } catch (error) {
                return null;
            }
        },
        restoreTriagePreferences() {
            const restored = loadTriagePreferences(this.getSafeLocalStorage(), {
                allowedCategories: DUPLICATE_FILTER_CATEGORIES,
                allowedSortKeys: DEFAULT_ALLOWED_SORT_KEYS,
            });
            this.selectedCategory = restored.category;
            if (!this.initialSortOption || this.initialSortOption === 'none') {
                this.sortOption = restored.sortKey;
            }
        },
        persistTriagePreferences() {
            saveTriagePreferences(
                this.getSafeLocalStorage(),
                {
                    category: this.selectedCategory,
                    sortKey: this.sortOption,
                },
                {
                    allowedCategories: DUPLICATE_FILTER_CATEGORIES,
                    allowedSortKeys: DEFAULT_ALLOWED_SORT_KEYS,
                },
            );
        },
        clearSearchFilter() {
            this.searchPattern = '';
            if (this.$refs.searchBar && typeof this.$refs.searchBar.clear === 'function') {
                this.$refs.searchBar.clear();
            } else if (this.$refs.searchBar && 'searchQuery' in this.$refs.searchBar) {
                this.$refs.searchBar.searchQuery = '';
            }
        },
        removeFilterChip(key) {
            if (key === 'category') {
                this.selectedCategory = 'all';
                this.persistTriagePreferences();
                return;
            }
            if (key === 'extension') {
                this.selectedExtension = '';
                return;
            }
            if (key === 'folder') {
                this.folderQuery = '';
                return;
            }
            if (key === 'minSize') {
                this.setMinSizeBytes(0);
                return;
            }
            if (key === 'minCopies') {
                this.setMinCopiesPreset('any');
                return;
            }
            if (key === 'search') {
                this.clearSearchFilter();
            }
        },
        resetActiveFilters() {
            if (!this.hasActiveFilters) {
                return false;
            }
            this.resetFilters();
            return true;
        },
        resetFilters() {
            const queryOptionsChanged = this.sortOption !== 'none' || this.minSizeBytes > 0;
            this.selectedCategory = 'all';
            this.selectedExtension = '';
            this.folderQuery = '';
            this.minCopiesPreset = 'any';
            this.sortOption = 'none';
            this.minSizeBytes = 0;
            this.customMinSizeMb = '';
            this.clearSearchFilter();
            this.persistTriagePreferences();
            if (queryOptionsChanged) {
                this.acknowledgedPage = 1;
                this.unacknowledgedPage = 1;
                this.exhaustedAcknowledged = false;
                this.exhaustedUnacknowledged = false;
                this.$emit('query-options-changed', {
                    sortBy: 'none',
                    minSize: 0,
                });
            }
        },
        setSortOption(option) {
            const normalized = DEFAULT_ALLOWED_SORT_KEYS.includes(option) ? option : 'none';
            if (this.sortOption === normalized) {
                return;
            }
            this.sortOption = normalized;
            this.persistTriagePreferences();
            this.acknowledgedPage = 1;
            this.unacknowledgedPage = 1;
            this.exhaustedAcknowledged = false;
            this.exhaustedUnacknowledged = false;
            this.$emit('query-options-changed', {
                sortBy: this.sortOption,
                minSize: this.minSizeBytes,
            });
        },
        setMinSizePreset(preset) {
            if (typeof preset === 'string' && Object.prototype.hasOwnProperty.call(MIN_SIZE_PRESETS, preset)) {
                this.setMinSizeBytes(MIN_SIZE_PRESETS[preset]);
            }
        },
        /**
         * Cycles the minimum file size filter across presets:
         * All ('any') -> >= 1 MB ('1mb') -> >= 10 MB ('10mb') -> >= 100 MB ('100mb') -> All ('any').
         * @returns {boolean} True when the preset was cycled.
         */
        cycleMinSizeFilter() {
            const cycleOrder = ['any', '1mb', '10mb', '100mb'];
            const currentIndex = cycleOrder.indexOf(this.selectedMinSizePreset);
            const nextPreset = currentIndex === -1
                ? cycleOrder[0]
                : cycleOrder[(currentIndex + 1) % cycleOrder.length];
            this.setMinSizePreset(nextPreset);
            return true;
        },
        setMinCopiesPreset(preset) {
            const normalized = typeof preset === 'string'
                ? preset.trim().toLowerCase()
                : 'any';
            this.minCopiesPreset = Object.prototype.hasOwnProperty.call(MIN_COPIES_PRESETS, normalized)
                ? normalized
                : 'any';
        },
        applyClientFilters(duplicates, filterOptions = {}) {
            const list = Array.isArray(duplicates) ? duplicates : [];
            const byMinSize = this.selectedMinSizePreset === 'custom'
                ? list
                : filterDuplicatesByMinSize(list, this.selectedMinSizePreset);
            const byMinCopies = filterDuplicatesByMinCopies(byMinSize, this.selectedMinCopiesPreset);
            const filtered = byMinCopies.filter(duplicate => {
                return this.filterDuplicate(duplicate, {
                    ...filterOptions,
                    ignoreMinSize: this.selectedMinSizePreset !== 'custom',
                });
            });
            return filterDuplicatesByFolderPrefix(filtered, this.folderQuery);
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
            if (!Array.isArray(duplicates) || this.sortOption === 'none') {
                return duplicates; // No sorting, return as is
            }

            if (this.sortOption === 'reclaimable-desc') {
                return sortDuplicatesDeterministically(duplicates, {
                    sortBy: 'reclaimable',
                    direction: 'desc',
                });
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
            this.selectedExtension = '';
            this.persistTriagePreferences();
        },
        toggleExtensionFilter(ext) {
            if (typeof ext !== 'string' || !ext.trim()) {
                return;
            }
            this.selectedExtension = this.selectedExtension === ext ? '' : ext;
        },
        filterDuplicate(duplicate, options = {}) {
            if (!options.ignoreMinSize && this.minSizeBytes > 0) {
                const hasLargeEnoughCopy = Array.isArray(duplicate.files)
                    && duplicate.files.some(file => Number(file.size) >= this.minSizeBytes);
                if (!hasLargeEnoughCopy) {
                    return false;
                }
            }

            if (!options.ignoreCategory && this.selectedCategory !== 'all' && !matchesDuplicateCategory(duplicate, this.selectedCategory)) {
                return false;
            }

            if (!options.ignoreExtension && this.selectedExtension && !matchesDuplicateExtension(duplicate, this.selectedExtension)) {
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
        /**
         * Jump to the duplicate group with the largest reclaimable space.
         * @returns {boolean} True when a target group was opened.
         */
        jumpToLargestGroup() {
            const target = this.largestDuplicateGroup;
            if (!target) {
                return false;
            }
            this.openDuplicate(target);
            this.$nextTick(() => {
                this.scrollActiveDuplicateIntoView();
            });
            return true;
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
    inset-block-start: calc(100% + 4px);
    background-color: var(--color-main-background, #ffffff);
    background-image: linear-gradient(var(--color-main-background, #ffffff), var(--color-main-background, #ffffff)), linear-gradient(#22262c, #22262c);
    border: 1px solid var(--color-border-dark, var(--color-border));
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
    z-index: 2000;
    min-inline-size: 220px;
    max-inline-size: calc(100vw - 24px);
    padding-block: 6px;
    padding-inline: 0;
    box-sizing: border-box;
    opacity: 1;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
}

.sort-menu-section-title {
    padding-block: 6px 4px;
    padding-inline: 12px;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--color-text-maxcontrast);
    text-transform: uppercase;
    letter-spacing: 0.03em;
}

.sort-menu-divider {
    block-size: 1px;
    margin-block: 4px;
    margin-inline: 0;
    background-color: var(--color-border);
}

.sort-option {
    display: flex;
    align-items: center;
    inline-size: 100%;
    max-inline-size: 100%;
    min-inline-size: 44px;
    min-block-size: 44px;
    padding-block: 7px;
    padding-inline: 12px;
    border: none;
    background: transparent;
    color: var(--color-main-text);
    text-align: start;
    cursor: pointer;
    transition: background-color 0.2s;
    font-size: 0.9rem;
    line-height: 1.3;
    overflow-wrap: anywhere;
    box-sizing: border-box;
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
    gap: 4px;
    max-inline-size: 100%;
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

.filter-chip-count {
    font-size: 0.78em;
    color: var(--color-text-maxcontrast);
    font-variant-numeric: tabular-nums;
}

.filter-chip.active .filter-chip-count {
    color: var(--color-primary-text);
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

.folder-filter-row {
    display: flex;
    align-items: center;
    inline-size: 100%;
    max-inline-size: 100%;
    box-sizing: border-box;
}

.folder-filter-input {
    inline-size: 100%;
    max-inline-size: 100%;
    min-inline-size: 0;
    min-block-size: 44px;
    padding-block: 6px;
    padding-inline: 10px;
    margin: 0;
    border: 1px solid var(--color-border-dark, var(--color-border));
    border-radius: 6px;
    background-color: var(--color-main-background);
    color: var(--color-main-text);
    font-size: 0.85rem;
    line-height: 1.3;
    box-sizing: border-box;
}

.folder-filter-input:focus-visible {
    outline: 2px solid var(--color-primary-element, #0082c9);
    outline-offset: 2px;
}

.min-size-filter-row,
.min-copies-filter-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 8px;
    inline-size: 100%;
    max-inline-size: 100%;
    box-sizing: border-box;
}

.min-size-filter-label,
.min-copies-filter-label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--color-text-maxcontrast);
    line-height: 1.3;
    margin-block: 0;
    margin-inline: 0;
}

.min-size-filter-select,
.min-copies-filter-select {
    flex: 1 1 140px;
    max-inline-size: 100%;
    min-inline-size: 44px;
    min-block-size: 44px;
    padding-block: 6px;
    padding-inline: 10px;
    margin-block: 0;
    margin-inline: 0;
    border: 1px solid var(--color-border-dark, var(--color-border));
    border-radius: 6px;
    background-color: var(--color-main-background);
    color: var(--color-main-text);
    font-size: 0.85rem;
    line-height: 1.3;
    cursor: pointer;
    box-sizing: border-box;
}

.min-size-filter-select:hover,
.min-copies-filter-select:hover {
    border-color: var(--color-primary-element, #0082c9);
}

.min-size-filter-select:focus-visible,
.min-copies-filter-select:focus-visible {
    outline: 2px solid var(--color-primary-element, #0082c9);
    outline-offset: 2px;
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

.extension-insights-bar {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-block: 6px;
    padding-inline: 8px;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    background-color: var(--color-main-background);
    max-inline-size: 100%;
    box-sizing: border-box;
}

.extension-insights-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 4px 8px;
    inline-size: 100%;
    max-inline-size: 100%;
    box-sizing: border-box;
}

.extension-insights-label {
    font-size: 0.76rem;
    font-weight: 600;
    color: var(--color-text-maxcontrast);
    text-transform: uppercase;
    letter-spacing: 0.03em;
}

.largest-group-jump-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-inline-size: 44px;
    min-block-size: 44px;
    padding-block: 4px;
    padding-inline: 10px;
    margin-block: 0;
    margin-inline: 0;
    border: 1px solid var(--color-border);
    border-radius: 999px;
    background-color: var(--color-background-hover);
    color: var(--color-main-text);
    font-size: 0.78rem;
    font-weight: 600;
    line-height: 1.2;
    cursor: pointer;
    box-sizing: border-box;
    transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.largest-group-jump-button:hover,
.largest-group-jump-button.active {
    border-color: var(--color-primary-element, #0082c9);
    background-color: var(--color-primary-element-light);
    color: var(--color-primary-element);
}

.largest-group-jump-button:focus-visible {
    outline: 2px solid var(--color-primary-element, #0082c9);
    outline-offset: 2px;
}

.extension-insights-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    inline-size: 100%;
    max-inline-size: 100%;
    box-sizing: border-box;
}

.extension-insight-chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 1 1 auto;
    gap: 5px;
    min-inline-size: 44px;
    min-block-size: 44px;
    max-inline-size: 100%;
    padding-block: 6px;
    padding-inline: 10px;
    margin-block: 0;
    margin-inline: 0;
    border: 1px solid var(--color-border-dark, var(--color-border));
    border-radius: 6px;
    background-color: var(--color-background-hover);
    color: var(--color-main-text);
    font-size: 0.8rem;
    line-height: 1.2;
    cursor: pointer;
    box-sizing: border-box;
    transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.extension-insight-chip:hover {
    border-color: var(--color-primary-element, #0082c9);
}

.extension-insight-chip.active {
    background-color: var(--color-primary-element);
    border-color: var(--color-primary-element);
    color: var(--color-primary-text);
    font-weight: 600;
}

.extension-insight-chip:focus-visible {
    outline: 2px solid var(--color-primary-element, #0082c9);
    outline-offset: 2px;
}

.extension-insight-ext {
    font-weight: 700;
}

.extension-insight-size {
    font-weight: 500;
}

.extension-insight-pct {
    font-size: 0.74rem;
    color: var(--color-text-maxcontrast);
}

.extension-insight-chip.active .extension-insight-pct {
    color: var(--color-primary-text);
}

.active-filter-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    inline-size: 100%;
    max-inline-size: 100%;
    box-sizing: border-box;
}

.active-filter-chip {
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    max-inline-size: 100%;
    min-inline-size: 44px;
    min-block-size: 44px;
    padding-block: 6px;
    padding-inline: 10px;
    margin-block: 0;
    margin-inline: 0;
    border: 1px solid var(--color-primary-element, #0082c9);
    border-radius: 999px;
    background-color: var(--color-primary-element-light);
    color: var(--color-main-text);
    font-size: 0.8rem;
    font-weight: 500;
    line-height: 1.25;
    cursor: pointer;
    box-sizing: border-box;
    transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.active-filter-chip:hover {
    background-color: var(--color-background-hover);
    border-color: var(--color-primary-element-hover, #006aa3);
}

.active-filter-chip:focus-visible {
    outline: 2px solid var(--color-primary-element, #0082c9);
    outline-offset: 2px;
}

.active-filter-chip-label {
    overflow-wrap: anywhere;
    text-align: start;
}

.active-filter-chip-remove {
    flex-shrink: 0;
    font-weight: 700;
    line-height: 1;
}

.quick-filter-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    inline-size: 100%;
    max-inline-size: 100%;
    box-sizing: border-box;
}

.reset-filters-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 1 1 110px;
    min-inline-size: 44px;
    min-block-size: 44px;
    padding-block: 6px;
    padding-inline: 12px;
    margin: 0;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    background-color: transparent;
    color: var(--color-text-maxcontrast);
    font-size: 0.82rem;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    cursor: pointer;
    box-sizing: border-box;
    transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.reset-filters-button:hover {
    background-color: var(--color-background-hover);
    color: var(--color-main-text);
    border-color: var(--color-border-dark, var(--color-border));
}

.reset-filters-button:focus-visible {
    outline: 2px solid var(--color-primary-element, #0082c9);
    outline-offset: 2px;
}

.export-json-button,
.export-csv-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    flex: 1 1 110px;
    max-inline-size: 100%;
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

.export-json-button svg,
.export-csv-button svg {
    display: block;
    flex-shrink: 0;
}

.export-json-button:hover:not(:disabled),
.export-csv-button:hover:not(:disabled) {
    background-color: var(--color-background-hover);
    border-color: var(--color-primary-element, #0082c9);
}

.export-json-button:focus-visible,
.export-csv-button:focus-visible {
    outline: 2px solid var(--color-primary-element, #0082c9);
    outline-offset: 2px;
}

.export-json-button:disabled,
.export-csv-button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
}

.empty-duplicates-state {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    inline-size: 100%;
    max-inline-size: 100%;
    padding-block: 10px;
    padding-inline: 12px;
    box-sizing: border-box;
}

.empty-state-message {
    margin-block: 0;
    margin-inline: 0;
    color: var(--color-text-maxcontrast);
    font-size: 0.85rem;
    line-height: 1.4;
}

.empty-state-reset-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-inline-size: 44px;
    min-block-size: 44px;
    padding-block: 8px;
    padding-inline: 14px;
    margin-block: 0;
    margin-inline: 0;
    border: 1px solid var(--color-border-dark, var(--color-border));
    border-radius: 6px;
    background-color: var(--color-main-background);
    color: var(--color-main-text);
    font-size: 0.85rem;
    font-weight: 600;
    line-height: 1.2;
    cursor: pointer;
    box-sizing: border-box;
    transition: background-color 0.15s ease, border-color 0.15s ease;
}

.empty-state-reset-button:hover {
    background-color: var(--color-background-hover);
    border-color: var(--color-primary-element, #0082c9);
}

.empty-state-reset-button:focus-visible {
    outline: 2px solid var(--color-primary-element, #0082c9);
    outline-offset: 2px;
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

.section-group-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-inline-size: 22px;
    padding-block: 1px;
    padding-inline: 6px;
    margin-inline-start: 4px;
    border-radius: 999px;
    border: 1px solid var(--color-border-dark, var(--color-border));
    background-color: var(--color-background-dark);
    color: var(--color-main-text);
    font-size: 0.74rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    line-height: 1.3;
    white-space: nowrap;
}

.duplicate-section-nav :deep(.app-navigation-entry.active) .section-group-count {
    background-color: transparent;
    border-color: currentcolor;
    color: var(--color-primary-element-text);
}

.sr-only {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
}
</style>