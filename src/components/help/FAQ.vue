<template>
  <div class="faq-container">
    <!-- Search Bar -->
    <div class="search-section">
      <NcTextField
        :value="searchQuery"
        @update:value="updateSearch"
        :label="t('duplicatefinder', 'Search FAQ')"
        :placeholder="t('duplicatefinder', 'Type to search...')"
        type="search">
        <template #right>
          <Magnify :size="20" />
        </template>
      </NcTextField>
    </div>

    <!-- Empty State -->
    <div v-if="filteredSections.length === 0" class="empty-state">
      <h3>{{ t('duplicatefinder', 'No results found') }}</h3>
      <p>{{ t('duplicatefinder', 'Try adjusting your search terms') }}</p>
    </div>

    <!-- FAQ Sections -->
    <div v-else class="faq-sections">
      <div v-for="(section, index) in filteredSections" 
           :key="index" 
           class="faq-section">
        <h2 class="section-title">{{ section.title }}</h2>
        
        <div class="questions-list">
          <div v-for="(qa, qaIndex) in section.items" 
               :key="qaIndex" 
               class="qa-item"
               :class="{ 'expanded': expandedItems.includes(qa.id) }"
               @click="toggleItem(qa.id)">
            
            <div class="question">
              <span class="question-text">{{ qa.question }}</span>
              <ChevronDown :size="20" 
                          class="expand-icon"
                          :class="{ 'rotated': expandedItems.includes(qa.id) }" />
            </div>
            
            <div v-show="expandedItems.includes(qa.id)" 
                 class="answer"
                 v-html="qa.answer">
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { NcTextField } from '@nextcloud/vue'
import Magnify from 'vue-material-design-icons/Magnify'
import ChevronDown from 'vue-material-design-icons/ChevronDown'

export default {
  name: 'FAQ',
  components: {
    NcTextField,
    Magnify,
    ChevronDown
  },
  data() {
    return {
      searchQuery: '',
      expandedItems: [],
      sections: [
        {
          title: t('duplicatefinder', 'General Questions'),
          items: [
            {
              id: 'what-is',
              question: t('duplicatefinder', 'What is Duplicate Finder?'),
              answer: t('duplicatefinder', 'Duplicate Finder is a Nextcloud app that helps you find and manage duplicate files in your cloud storage. It automatically scans your files and identifies duplicates based on their content.')
            },
            {
              id: 'how-works',
              question: t('duplicatefinder', 'How does it detect duplicates?'),
              answer: t('duplicatefinder', 'The app uses file content hashing to identify duplicates. This means files with identical content are detected as duplicates, regardless of their names or locations.')
            }
          ]
        },
        {
          title: t('duplicatefinder', 'Features & Usage'),
          items: [
            {
              id: 'protect-files',
              question: t('duplicatefinder', 'How can I protect important files from deletion?'),
              answer: t('duplicatefinder', 'Use the Origin Folders feature in settings. Files in these folders will never be marked as duplicates for deletion, ensuring your original files are always protected.')
            },
            {
              id: 'exclude-folders',
              question: t('duplicatefinder', 'Can I exclude certain folders from scanning?'),
              answer: t('duplicatefinder', 'Yes, you can exclude folders in two ways:<br>1. Add them to Excluded Folders in settings<br>2. Place a .nodupefinder file in any folder you want to exclude')
            },
            {
              id: 'recover-files',
              question: t('duplicatefinder', 'Can I recover deleted files?'),
              answer: t('duplicatefinder', 'Yes, all files deleted through Duplicate Finder can be recovered from your Nextcloud trash bin during the retention period set by your administrator.')
            }
          ]
        },
        {
          title: t('duplicatefinder', 'Technical & Performance'),
          items: [
            {
              id: 'performance-impact',
              question: t('duplicatefinder', 'Does it impact server performance?'),
              answer: t('duplicatefinder', 'The app is designed to minimize performance impact. It uses background jobs and can be configured to ignore mounted files. You can also adjust scanning intervals in settings.')
            },
            {
              id: 'storage-req',
              question: t('duplicatefinder', 'What are the storage requirements?'),
              answer: t('duplicatefinder', 'The app maintains a small database of file hashes. The storage impact is minimal and scales efficiently with your file count.')
            }
          ]
        },
        {
          title: t('duplicatefinder', 'Project & Support'),
          items: [
            {
              id: 'report-issue',
              question: t('duplicatefinder', 'How do I report issues or suggest features?'),
              answer: t('duplicatefinder', 'You can report issues and suggest features through our <a href="https://github.com/eldertek/duplicatefinder/issues" target="_blank" rel="noopener noreferrer">GitHub Issues</a> page.')
            },
            {
              id: 'contribute',
              question: t('duplicatefinder', 'Can I contribute to the project?'),
              answer: t('duplicatefinder', 'Yes! The project is open source under the AGPL license. Visit our <a href="https://github.com/eldertek/duplicatefinder" target="_blank" rel="noopener noreferrer">GitHub repository</a> to contribute.')
            }
          ]
        },
        {
          title: t('duplicatefinder', 'Search & Navigation'),
          items: [
            {
              id: 'search-features',
              question: t('duplicatefinder', 'How can I efficiently search for specific duplicates?'),
              answer: t('duplicatefinder', 'The app offers three powerful search modes:<br><br>' +
                '<strong>1. Simple Search:</strong><br>' +
                '• Perfect for basic text searches<br>' +
                '• Just type any part of the filename<br>' +
                '• Example: typing "vacation" finds all files containing that word<br><br>' +
                '<strong>2. Wildcard Search:</strong><br>' +
                '• Use * for multiple characters and ? for a single character<br>' +
                '• Great for finding patterns in filenames<br>' +
                '• Examples:<br>' +
                '  - IMG*.jpg finds all JPG files starting with IMG<br>' +
                '  - DSC_????.NEF finds NEF files with exactly 4 characters after DSC_<br><br>' +
                '<strong>3. Regular Expression Search:</strong><br>' +
                '• For advanced pattern matching<br>' +
                '• Supports full regex syntax<br>' +
                '• Examples:<br>' +
                '  - ^IMG_\\d{4}\\.jpg$ matches IMG_ followed by exactly 4 digits and .jpg<br>' +
                '  - \\.(jpg|jpeg|png)$ finds files ending in .jpg, .jpeg, or .png')
            },
            {
              id: 'search-tips',
              question: t('duplicatefinder', 'What are some tips for effective searching?'),
              answer: t('duplicatefinder', '• Start with simple search for basic queries<br>' +
                '• Use wildcards when you know part of the filename pattern<br>' +
                '• Switch to regex for complex pattern matching needs<br>' +
                '• Combine with filters to narrow down results<br>' +
                '• Check the help modal for pattern examples<br>' +
                '• Remember that search is case-insensitive')
            }
          ]
        }
      ]
    }
  },
  computed: {
    filteredSections() {
      const query = this.searchQuery.trim().toLowerCase()
      
      if (!query) {
        return this.sections
      }

      const searchInText = (text) => {
        return text.toLowerCase().includes(query)
      }

      const stripHtml = (html) => {
        const tmp = document.createElement('div')
        tmp.innerHTML = html
        return tmp.textContent || tmp.innerText || ''
      }

      return this.sections
        .map(section => {
          const matchedItems = section.items.filter(item => {
            return searchInText(item.question) || 
                   searchInText(stripHtml(item.answer))
          })

          if (matchedItems.length === 0) {
            return null
          }

          return {
            ...section,
            items: matchedItems
          }
        })
        .filter(section => section !== null)
    }
  },
  methods: {
    updateSearch(value) {
      // Ensure we're working with a string
      this.searchQuery = typeof value === 'string' ? value : ''
    },
    toggleItem(id) {
      const index = this.expandedItems.indexOf(id)
      if (index === -1) {
        this.expandedItems.push(id)
      } else {
        this.expandedItems.splice(index, 1)
      }
    }
  }
}
</script>

<style scoped>
.faq-container {
  padding: 40px;
  max-width: 800px;
  margin: 0 auto;
}

.search-section {
  margin-bottom: 40px;
}

.faq-sections {
  display: flex;
  flex-direction: column;
  gap: 60px;
}

.faq-section {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.section-title {
  font-size: 28px;
  font-weight: bold;
  color: var(--color-main-text);
  padding-bottom: 16px;
  border-bottom: 2px solid var(--color-border);
  margin-bottom: 8px;
}

.questions-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.qa-item {
  background: var(--color-background-hover);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-large);
  overflow: hidden;
  transition: all 0.2s ease;
}

.qa-item:hover {
  border-color: var(--color-primary-element);
  transform: translateX(4px);
}

.question {
  padding: 20px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  user-select: none;
}

.question-text {
  font-weight: bold;
  color: var(--color-main-text);
  font-size: 16px;
  line-height: 1.5;
  padding-right: 24px;
}

.expand-icon {
  color: var(--color-primary-element);
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.expand-icon.rotated {
  transform: rotate(180deg);
}

.answer {
  padding: 0 24px 24px;
  color: var(--color-text-light);
  line-height: 1.6;
  font-size: 15px;
}

.answer :deep(a) {
  color: var(--color-primary-element);
  text-decoration: none;
  font-weight: bold;
  padding: 2px 4px;
  border-radius: var(--border-radius);
  transition: background-color 0.2s ease;
}

.answer :deep(a:hover) {
  text-decoration: none;
  background-color: var(--color-primary-element-light);
}

.qa-item.expanded {
  background: var(--color-main-background);
  box-shadow: var(--shadow-hover);
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: var(--color-text-maxcontrast);
}

.empty-state h3 {
  font-size: 20px;
  margin-bottom: 12px;
  color: var(--color-main-text);
}

.empty-state p {
  font-size: 16px;
}
</style> 