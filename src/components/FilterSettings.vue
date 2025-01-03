<template>
    <div class="filter-settings">
        <div class="description">
            <div class="header">
                <FilterOutline :size="20" />
                {{ t('duplicatefinder', 'Configure filtering rules to ignore files during scan based on file hash or file name pattern.') }}
            </div>
        </div>

        <div class="filter-tabs">
            <NcButton :type="activeTab === 'hash' ? 'primary' : 'tertiary'" @click="activeTab = 'hash'">
                <template #icon>
                    <Fingerprint :size="20" />
                </template>
                {{ t('duplicatefinder', 'File Hash') }}
            </NcButton>
            <NcButton :type="activeTab === 'name' ? 'primary' : 'tertiary'" @click="activeTab = 'name'">
                <template #icon>
                    <FileOutline :size="20" />
                </template>
                {{ t('duplicatefinder', 'File Name Pattern') }}
            </NcButton>
        </div>

        <div class="filters-list">
            <div v-for="filter in currentFilters" :key="filter.id" class="filter-item">
                <NcButton type="tertiary" @click="removeFilter(filter)">
                    <template #icon>
                        <Delete :size="20" />
                    </template>
                </NcButton>
                <span class="filter-value">{{ filter.value }}</span>
                <span class="filter-type">
                    <template v-if="filter.type === 'hash'">
                        <Fingerprint :size="16" />
                    </template>
                    <template v-else>
                        <FileOutline :size="16" />
                    </template>
                    {{ filter.type }}
                </span>
            </div>
        </div>

        <div class="add-filter">
            <div class="input-group">
                <NcTextField
                    :value="newFilterValue"
                    :label="getInputLabel"
                    :placeholder="getPlaceholderText"
                    @input="updateFilterValue"
                />
                <NcButton @click="addFilter" :disabled="!newFilterValue">
                    <template #icon>
                        <Plus :size="20" />
                    </template>
                    {{ t('duplicatefinder', 'Add Filter') }}
                </NcButton>
            </div>
            <span class="helper-text" v-if="activeTab === 'name'">
                {{ t('duplicatefinder', 'You can use * as wildcard, e.g., *.tmp or backup_*.') }}
            </span>
        </div>
    </div>
</template>

<script>
import { showError, showSuccess } from '@nextcloud/dialogs'
import { NcButton, NcTextField } from '@nextcloud/vue'
import Delete from 'vue-material-design-icons/Delete'
import Plus from 'vue-material-design-icons/Plus'
import Fingerprint from 'vue-material-design-icons/Fingerprint'
import FileOutline from 'vue-material-design-icons/FileOutline'
import FilterOutline from 'vue-material-design-icons/FilterOutline'
import { loadFilters, saveFilter, deleteFilter } from '@/tools/api'

export default {
    name: 'FilterSettings',
    components: {
        NcButton,
        NcTextField,
        Delete,
        Plus,
        Fingerprint,
        FileOutline,
        FilterOutline,
    },
    data() {
        return {
            activeTab: 'hash',
            filters: [],
            newFilterValue: '',
        }
    },
    computed: {
        currentFilters() {
            return this.filters.filter(f => f.type === this.activeTab)
        },
        getPlaceholderText() {
            return this.activeTab === 'hash'
                ? t('duplicatefinder', 'e.g., a1b2c3d4e5f6...')
                : t('duplicatefinder', 'e.g., *.tmp or backup_*')
        },
        getInputLabel() {
            return this.activeTab === 'hash'
                ? t('duplicatefinder', 'File Hash')
                : t('duplicatefinder', 'File Name Pattern')
        }
    },
    methods: {
        updateFilterValue(event) {
            this.newFilterValue = event.target?.value || event
        },
        async addFilter() {
            if (!this.newFilterValue.trim()) {
                showError(t('duplicatefinder', 'Please enter a value'))
                return
            }

            try {
                await saveFilter({
                    type: this.activeTab,
                    value: this.newFilterValue.trim()
                })
                await this.loadFilters()
                this.newFilterValue = ''
            } catch (error) {
                console.error('Error adding filter:', error)
            }
        },
        async removeFilter(filter) {
            try {
                await deleteFilter(filter.id)
                await this.loadFilters()
            } catch (error) {
                console.error('Error removing filter:', error)
            }
        },
        async loadFilters() {
            try {
                this.filters = await loadFilters()
            } catch (error) {
                console.error('Error loading filters:', error)
            }
        }
    },
    mounted() {
        this.loadFilters()
    }
}
</script>

<style scoped>
.filter-settings {
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

.filter-tabs {
    display: flex;
    gap: 10px;
    margin-bottom: 20px;
}

.filters-list {
    margin: 20px 0;
}

.filter-item {
    display: flex;
    align-items: center;
    margin-bottom: 10px;
    padding: 8px;
    background-color: var(--color-background-hover);
    border-radius: var(--border-radius);
}

.filter-value {
    margin-left: 10px;
    flex-grow: 1;
    word-break: break-all;
}

.filter-type {
    padding: 2px 8px;
    background-color: var(--color-primary-element-light);
    border-radius: var(--border-radius);
    font-size: 0.8em;
}

.input-group {
    display: flex;
    gap: 10px;
    margin-bottom: 5px;
}

.helper-text {
    font-size: 0.9em;
    color: var(--color-text-maxcontrast);
}
</style> 