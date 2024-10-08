<template>
    <NcAppNavigation>
        <template #list>
            <!-- Search Input -->
            <div class="search-container">
                <input type="text" v-model="searchQuery" @input="filterDuplicates" placeholder="Rechercher des doublons..." />
            </div>
            <!-- Navigation for Unacknowledged Duplicates -->
            <NcAppNavigationItem :name="t('duplicatefinder', 'Unacknowledged')" :allowCollapse="true" :open="true">
                <template #icon>
                    <CloseCircle :size="20" />
                </template>
                <template>
                    <div v-show="filteredUnacknowledgedDuplicates.length > 0">
                        <div v-for="duplicate in filteredUnacknowledgedDuplicates" :key="duplicate.id" class="duplicate-item">
                            <DuplicateListItem :duplicate="duplicate" :isActive="currentDuplicateId === duplicate.id"
                                @duplicate-selected="openDuplicate" />
                        </div>
                    </div>
                    <div v-show="filteredUnacknowledgedDuplicates.length === 0">
                        <p>{{ t('duplicatefinder', 'No unacknowledged duplicates found.') }}</p>
                    </div>
                    <button @click="loadMoreUnacknowledgedDuplicates">{{ t('duplicatefinder', 'Load More') }}</button>
                </template>
            </NcAppNavigationItem>
            <!-- Navigation for Acknowledged Duplicates -->
            <NcAppNavigationItem :name="t('duplicatefinder', 'Acknowledged')" :allowCollapse="true" :open="true">
                <template #icon>
                    <CheckCircle :size="20" />
                </template>
                <template>
                    <div v-show="filteredAcknowledgedDuplicates.length > 0">
                        <div v-for="duplicate in filteredAcknowledgedDuplicates" :key="duplicate.id" class="duplicate-item">
                            <DuplicateListItem :duplicate="duplicate" :isActive="currentDuplicateId === duplicate.id"
                                @duplicate-selected="openDuplicate" />
                        </div>
                    </div>
                    <div v-show="filteredAcknowledgedDuplicates.length === 0">
                        <p>{{ t('duplicatefinder', 'No acknowledged duplicates found.') }}</p>
                    </div>
                    <button @click="loadMoreAcknowledgedDuplicates">{{ t('duplicatefinder', 'Load More') }}</button>
                </template>
            </NcAppNavigationItem>
        </template>
    </NcAppNavigation>
</template>

<script>
import { NcAppNavigation, NcAppNavigationItem } from '@nextcloud/vue';
import DuplicateListItem from './DuplicateListItem.vue';
import CloseCircle from 'vue-material-design-icons/CloseCircle';
import CheckCircle from 'vue-material-design-icons/CheckCircle';
import { fetchDuplicates } from '@/tools/api';

export default {
    components: { DuplicateListItem, NcAppNavigation, NcAppNavigationItem, CheckCircle, CloseCircle },
    props: ['acknowledgedDuplicates', 'unacknowledgedDuplicates', 'currentDuplicateId'],
    data() {
        return {
            searchQuery: '',
            acknowledgedPage: 1,
            unacknowledgedPage: 1,
            limit: 50,
        };
    },
    computed: {
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
        filterDuplicate(duplicate) {
            const query = this.searchQuery.toLowerCase();
            const filePathMatch = duplicate.files.some(file => file.path && file.path.toLowerCase().includes(query));
            const excludeMatch = query.startsWith('!') && duplicate.files.some(file => (file.name && file.name.toLowerCase().includes(query.slice(1))) || (file.path && file.path.toLowerCase().includes(query.slice(1))));
            return (filePathMatch || excludeMatch);
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
        }
    }
};
</script>

<style scoped>
.search-container {
    padding: 10px;
    text-align: center;
}

.search-container input {
    width: 100%;
    padding: 5px;
    border-radius: 5px;
    border: 1px solid #ccc;
}

.duplicate-item {
    width: 100%;
}
</style>