<template>
    <NcAppNavigation>
        <template #list>
            <!-- Search Bar -->
            <SearchBar @search="handleSearch" />

            <!-- Bulk Delete Button -->
            <NcAppNavigationItem :name="t('duplicatefinder', 'Bulk Delete')" 
                :active="activeView === 'bulk-delete'"
                @click="$emit('open-bulk-delete')">
                <template #icon>
                    <Delete :size="20" />
                </template>
            </NcAppNavigationItem>

            <!-- Settings Navigation Item -->
            <NcAppNavigationItem :name="t('duplicatefinder', 'Settings')" @click="$emit('open-settings')" :exact="true">
                <template #icon>
                    <Cog :size="20" />
                </template>
            </NcAppNavigationItem>

            <!-- Help Section -->
            <NcAppNavigationItem :name="t('duplicatefinder', 'Help')" 
                :allowCollapse="true" 
                :open="false">
                <template #icon>
                    <HelpCircle :size="20" />
                </template>
                <template>
                    <NcAppNavigationItem :name="t('duplicatefinder', 'Getting Started')"
                        @click="$emit('show-help', 'guide')">
                        <template #icon>
                            <School :size="20" />
                        </template>
                    </NcAppNavigationItem>

                    <NcAppNavigationItem :name="t('duplicatefinder', 'Usage Examples')"
                        @click="$emit('show-help', 'examples')">
                        <template #icon>
                            <PlayCircle :size="20" />
                        </template>
                    </NcAppNavigationItem>

                    <NcAppNavigationItem :name="t('duplicatefinder', 'FAQ')"
                        @click="$emit('show-help', 'faq')">
                        <template #icon>
                            <FrequentlyAskedQuestions :size="20" />
                        </template>
                    </NcAppNavigationItem>
                </template>
            </NcAppNavigationItem>

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
                    <button v-if="hasMoreAcknowledged" @click="loadMoreAcknowledgedDuplicates">
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
                    <button v-if="hasMoreUnacknowledged" @click="loadMoreUnacknowledgedDuplicates">
                        {{ t('duplicatefinder', 'Load More') }}
                    </button>
                </template>
            </NcAppNavigationItem>
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
import { fetchDuplicates } from '@/tools/api';

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
        FrequentlyAskedQuestions
    },
    props: {
        acknowledgedDuplicates: Array,
        unacknowledgedDuplicates: Array,
        currentDuplicateId: [String, Number],
        activeView: {
            type: String,
            default: 'details'
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
        }
    },
    data() {
        return {
            searchPattern: '',
            searchType: 'simple',
            acknowledgedPage: 1,
            unacknowledgedPage: 1,
            limit: 50,
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
            return this.unacknowledgedDuplicates.filter(duplicate => {
                return this.filterDuplicate(duplicate);
            });
        },
        filteredAcknowledgedDuplicates() {
            return this.acknowledgedDuplicates.filter(duplicate => {
                return this.filterDuplicate(duplicate);
            });
        }
    },
    methods: {
        handleSearch({ query, type }) {
            this.searchPattern = query;
            this.searchType = type;
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

.bulk-delete-container {
    padding: 4px 10px;
    border-bottom: 1px solid var(--color-border);
}

.bulk-delete-button {
    width: 100%;
    justify-content: left;
    padding: 10px;
    font-weight: normal;
}

/* Ajustement de la marge de la barre de recherche */
:deep(.search-container) {
    margin: 0.5rem 0;
}

/* Ajustement de l'espacement des éléments de navigation */
:deep(.app-navigation-entry) {
    padding: 3px 0;
}
</style>