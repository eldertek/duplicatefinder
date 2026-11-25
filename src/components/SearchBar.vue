<template>
	<div class="search-container">
		<div class="search-combined">
			<div class="search-wrapper">
				<input
					ref="searchInput"
					v-model="searchQuery"
					type="text"
					class="search-input"
					:placeholder="searchPlaceholder"
					:aria-label="searchPlaceholder"
					@input="onSearch"
					@keydown.esc="onInputEscape">
				<button
					type="button"
					class="search-type-toggle"
					:title="t('duplicatefinder', 'Search type')"
					:aria-label="t('duplicatefinder', 'Search type')"
					:aria-expanded="showTypeSelector ? 'true' : 'false'"
					aria-haspopup="listbox"
					@click="showTypeSelector = !showTypeSelector"
					@keydown.esc="showTypeSelector = false">
					<ChevronDown :size="16" />
				</button>
				<div
					v-if="showTypeSelector"
					class="search-type-dropdown"
					role="listbox"
					:aria-label="t('duplicatefinder', 'Search type')"
					@keydown.esc="showTypeSelector = false">
					<button
						type="button"
						role="option"
						class="search-type-option"
						:class="{ active: searchType === 'simple' }"
						:aria-selected="searchType === 'simple' ? 'true' : 'false'"
						@click="selectSearchType('simple')">
						{{ t('duplicatefinder', 'Simple search') }}
					</button>
					<button
						type="button"
						role="option"
						class="search-type-option"
						:class="{ active: searchType === 'wildcard' }"
						:aria-selected="searchType === 'wildcard' ? 'true' : 'false'"
						@click="selectSearchType('wildcard')">
						{{ t('duplicatefinder', 'Wildcard search (*, ?)') }}
					</button>
					<button
						type="button"
						role="option"
						class="search-type-option"
						:class="{ active: searchType === 'regex' }"
						:aria-selected="searchType === 'regex' ? 'true' : 'false'"
						@click="selectSearchType('regex')">
						{{ t('duplicatefinder', 'Regular expression') }}
					</button>
				</div>
			</div>
		</div>
	</div>
</template>

<script>
import ChevronDown from 'vue-material-design-icons/ChevronDown'

export default {
	name: 'SearchBar',
	components: {
		ChevronDown,
	},
	data() {
		return {
			searchQuery: '',
			searchType: 'simple',
			showTypeSelector: false,
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
		},
	},
	methods: {
		focus() {
			if (this.$refs.searchInput && typeof this.$refs.searchInput.focus === 'function') {
				this.$refs.searchInput.focus()
				if (typeof this.$refs.searchInput.select === 'function') {
					this.$refs.searchInput.select()
				}
			}
		},
		onInputEscape() {
			if (this.showTypeSelector) {
				this.showTypeSelector = false
				return
			}
			if (this.$refs.searchInput && typeof this.$refs.searchInput.blur === 'function') {
				this.$refs.searchInput.blur()
			}
		},
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
					RegExp(processedQuery)
				} catch (e) {
					processedQuery = this.escapeRegex(this.searchQuery)
				}
			} else {
				processedQuery = this.escapeRegex(processedQuery)
			}

			this.$emit('search', {
				query: processedQuery,
				type: this.searchType,
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
		},
	},
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
  box-sizing: border-box;
  padding-block: 0;
  padding-inline: 12px 44px;
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

.search-input:focus-visible {
  outline: 2px solid var(--color-primary-element, #0082c9);
  outline-offset: 2px;
}

.search-type-toggle {
  position: absolute;
  inset-inline-end: 2px;
  top: 50%;
  transform: translateY(-50%);
  width: 40px;
  height: 40px;
  min-width: 40px;
  min-height: 40px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--color-text-maxcontrast);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-radius: 50%;
  transition: background-color 0.2s ease;
}

.search-type-toggle:hover {
  background-color: var(--color-background-hover);
}

.search-type-toggle:focus-visible,
.search-type-option:focus-visible {
  outline: 2px solid var(--color-primary-element, #0082c9);
  outline-offset: -2px;
}

.search-type-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  inset-inline-end: 0;
  background-color: var(--color-main-background);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-large);
  box-shadow: 0 2px 8px var(--color-box-shadow);
  z-index: 9999;
  min-width: 200px;
  max-width: calc(100vw - 24px);
  overflow: hidden;
}

.search-type-option {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 44px;
  padding: 8px 12px;
  border: none;
  background: transparent;
  text-align: start;
  font-size: inherit;
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
