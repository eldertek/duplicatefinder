<template>
  <div class="search-container">
    <div class="search-type-selector">
      <select v-model="searchType" class="search-type">
        <option value="simple">{{ t('duplicatefinder', 'Simple search') }}</option>
        <option value="wildcard">{{ t('duplicatefinder', 'Wildcard search (*, ?)') }}</option>
        <option value="regex">{{ t('duplicatefinder', 'Regular expression') }}</option>
      </select>
    </div>

    <div class="search-input-container">
      <input
        v-model="searchQuery"
        type="text"
        class="search-input"
        :placeholder="searchPlaceholder"
        @input="onSearch" />
    </div>
  </div>
</template>

<script>
import { NcTextField } from '@nextcloud/vue'
import Magnify from 'vue-material-design-icons/Magnify'

export default {
  name: 'SearchBar',
  components: {
    NcTextField,
    Magnify
  },
  data() {
    return {
      searchQuery: '',
      searchType: 'simple'
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
          return t('duplicatefinder', 'Search duplicates...')
      }
    }
  },
  methods: {
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
}

.search-type-selector {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.search-type {
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  background-color: var(--color-main-background);
}

.search-input-container {
  position: relative;
  width: 100%;
}

.search-input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  background-color: var(--color-main-background);
}
</style> 