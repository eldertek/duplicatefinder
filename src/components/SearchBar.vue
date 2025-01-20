<template>
  <div class="search-container">
    <div class="search-combined">
      <div class="search-wrapper">
        <input
          v-model="searchQuery"
          type="text"
          class="search-input"
          :placeholder="searchPlaceholder"
          @input="onSearch" />
        <div class="search-type-toggle" @click="showTypeSelector = !showTypeSelector">
          <ChevronDown :size="16" />
        </div>
        <div v-if="showTypeSelector" class="search-type-dropdown">
          <div 
            class="search-type-option" 
            :class="{ active: searchType === 'simple' }"
            @click="selectSearchType('simple')">
            {{ t('duplicatefinder', 'Simple search') }}
          </div>
          <div 
            class="search-type-option" 
            :class="{ active: searchType === 'wildcard' }"
            @click="selectSearchType('wildcard')">
            {{ t('duplicatefinder', 'Wildcard search (*, ?)') }}
          </div>
          <div 
            class="search-type-option" 
            :class="{ active: searchType === 'regex' }"
            @click="selectSearchType('regex')">
            {{ t('duplicatefinder', 'Regular expression') }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { NcTextField } from '@nextcloud/vue'
import ChevronDown from 'vue-material-design-icons/ChevronDown'

export default {
  name: 'SearchBar',
  components: {
    NcTextField,
    ChevronDown
  },
  data() {
    return {
      searchQuery: '',
      searchType: 'simple',
      showTypeSelector: false
    }
  },
  computed: {
    searchPlaceholder() {
      switch (this.searchType) {
        case 'wildcard':
          return t('duplicatefinder', 'Search with wildcards (e.g., IMG*.jpg)')
        case 'regex':
          return t('duplicatefinder', 'Search with regex (e.g., ^IMG_\\d{4}\\.jpg$)')
        default:
          return t('duplicatefinder', 'Search duplicates…')
      }
    }
  },
  methods: {
    selectSearchType(type) {
      this.searchType = type
      this.showTypeSelector = false
      this.onSearch()
    },
    onSearch() {
      let processedQuery = this.searchQuery

      if (this.searchType === 'wildcard') {
        processedQuery = this.wildcardToRegex(processedQuery)
      }

      if (this.searchType !== 'simple') {
        try {
          new RegExp(processedQuery)
        } catch (e) {
          processedQuery = this.escapeRegex(this.searchQuery)
        }
      } else {
        processedQuery = this.escapeRegex(processedQuery)
      }

      this.$emit('search', {
        query: processedQuery,
        type: this.searchType
      })
    },
    wildcardToRegex(pattern) {
      return pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.')
    },
    escapeRegex(string) {
      return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }
  }
}
</script>

<style scoped>
.search-container {
  margin: 1rem 0;
  width: 100%;
  position: relative;
}

.search-combined {
  width: 100%;
}

.search-wrapper {
  position: relative;
  width: 100%;
}

.search-input {
  width: 100%;
  height: 44px;
  padding: 0 34px 0 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-pill);
  background-color: var(--color-main-background);
  color: var(--color-main-text);
  font-size: var(--default-font-size);
  transition: all 0.2s ease;
}

.search-input:hover, .search-input:focus {
  border-color: var(--color-primary);
  outline: none;
}

.search-type-toggle {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  cursor: pointer;
  color: var(--color-text-maxcontrast);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border-radius: 50%;
  transition: background-color 0.2s ease;
}

.search-type-toggle:hover {
  background-color: var(--color-background-hover);
}

.search-type-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  background-color: var(--color-main-background);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-large);
  box-shadow: 0 2px 8px var(--color-box-shadow);
  z-index: 9999;
  min-width: 200px;
}

.search-type-option {
  padding: 8px 12px;
  cursor: pointer;
  color: var(--color-main-text);
  transition: background-color 0.2s ease;
}

.search-type-option:hover {
  background-color: var(--color-background-hover);
}

.search-type-option.active {
  background-color: var(--color-primary-element-light);
  color: var(--color-primary-text);
}
</style> 
