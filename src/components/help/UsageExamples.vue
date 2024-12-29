<template>
  <div class="usage-examples">
    <div v-for="(section, index) in sections" :key="index" class="section">
      <h2 class="section-title">{{ section.title }}</h2>
      <div class="section-content">
        <div v-if="section.description" class="section-description">
          {{ section.description }}
        </div>
        
        <div v-for="(example, exIndex) in section.examples" :key="exIndex" class="example-block">
          <h3 class="example-title">{{ example.title }}</h3>
          
          <!-- Code Block -->
          <div v-if="example.code" class="code-block">
            <div v-for="(line, lineIndex) in example.code" :key="lineIndex" class="code-line">
              <span v-if="line.label" class="code-label">{{ line.label }}</span>
              <code>{{ line.command }}</code>
            </div>
          </div>

          <!-- Settings Block -->
          <div v-if="example.settings" class="settings-list">
            <div v-for="(setting, setIndex) in example.settings" :key="setIndex" class="setting-item">
              <span class="setting-name">{{ setting.name }}</span>
              <span class="setting-desc">{{ setting.description }}</span>
            </div>
          </div>

          <!-- List Block -->
          <ul v-if="example.list" class="feature-list">
            <li v-for="(item, itemIndex) in example.list" :key="itemIndex">
              {{ item }}
            </li>
          </ul>

          <!-- Note Block -->
          <div v-if="example.note" class="note">
            <strong>{{ t('duplicatefinder', 'Note:') }}</strong>
            {{ example.note }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'UsageExamples',
  data() {
    return {
      sections: [
        {
          title: t('duplicatefinder', 'Detecting Duplicates'),
          description: t('duplicatefinder', 'There are three main ways to detect duplicate files in your Nextcloud:'),
          examples: [
            {
              title: t('duplicatefinder', '1. Event-based Detection'),
              list: [
                t('duplicatefinder', 'Automatically scans for duplicates when files are uploaded or modified'),
                t('duplicatefinder', 'Provides real-time duplicate detection'),
                t('duplicatefinder', 'Can be disabled in settings if needed')
              ]
            },
            {
              title: t('duplicatefinder', '2. Background Job Detection'),
              settings: [
                {
                  name: t('duplicatefinder', 'Background Job Find Duplicates Interval'),
                  description: t('duplicatefinder', 'Set how often the system should scan for duplicates')
                }
              ],
              note: t('duplicatefinder', 'Runs automatically based on your configured interval')
            },
            {
              title: t('duplicatefinder', '3. Manual Command Detection'),
              code: [
                {
                  label: t('duplicatefinder', 'Full scan:'),
                  command: 'occ duplicates:find-all'
                },
                {
                  label: t('duplicatefinder', 'Scan user:'),
                  command: 'occ duplicates:find-all -u username'
                }
              ],
              note: t('duplicatefinder', 'Only available to administrators')
            }
          ]
        },
        {
          title: t('duplicatefinder', 'Advanced Search Features'),
          description: t('duplicatefinder', 'The app provides three different search modes to help you find specific duplicates:'),
          examples: [
            {
              title: t('duplicatefinder', 'Simple Search'),
              list: [
                t('duplicatefinder', 'Basic text search that looks for the exact text in file names'),
                t('duplicatefinder', 'Example: typing "vacation" will find all files with "vacation" in their name')
              ]
            },
            {
              title: t('duplicatefinder', 'Wildcard Search'),
              list: [
                t('duplicatefinder', 'Use * and ? as wildcards to match patterns in file names')
              ],
              code: [
                {
                  label: t('duplicatefinder', 'Match all JPG files starting with IMG:'),
                  command: 'IMG*.jpg'
                },
                {
                  label: t('duplicatefinder', 'Match NEF files with exact pattern:'),
                  command: 'DSC_????.NEF'
                },
                {
                  label: t('duplicatefinder', 'Match all PDF files:'),
                  command: '*.pdf'
                }
              ]
            },
            {
              title: t('duplicatefinder', 'Regular Expression Search'),
              list: [
                t('duplicatefinder', 'For advanced users, full regex pattern support for precise matching')
              ],
              code: [
                {
                  label: t('duplicatefinder', 'Match IMG_ followed by 4 digits:'),
                  command: '^IMG_\\d{4}\\.jpg$'
                },
                {
                  label: t('duplicatefinder', 'Match image files:'),
                  command: '\\.(jpg|jpeg|png)$'
                },
                {
                  label: t('duplicatefinder', 'Match IMG_ or DSC_ prefix:'),
                  command: '^(IMG|DSC)_.*'
                }
              ],
            }
          ]
        },
        {
          title: t('duplicatefinder', 'Managing Duplicates'),
          description: t('duplicatefinder', 'Once duplicates are detected, you have several options to manage them:'),
          examples: [
            {
              title: t('duplicatefinder', 'Individual Management'),
              list: [
                t('duplicatefinder', 'View duplicates in Unacknowledged and Acknowledged sections'),
                t('duplicatefinder', 'Compare file details and select which copies to delete'),
                t('duplicatefinder', 'Mark duplicates as acknowledged for better organization'),
                t('duplicatefinder', 'Recover deleted files from trash if needed')
              ]
            },
            {
              title: t('duplicatefinder', 'Bulk Operations'),
              list: [
                t('duplicatefinder', 'Use Bulk Delete to handle multiple duplicates at once'),
                t('duplicatefinder', 'Filter and select duplicates based on various criteria'),
                t('duplicatefinder', 'Preview selections before confirming deletion'),
                t('duplicatefinder', 'Efficiently manage large numbers of duplicates')
              ]
            }
          ]
        },
        {
          title: t('duplicatefinder', 'Advanced Settings'),
          description: t('duplicatefinder', 'Configure the app behavior through these advanced settings:'),
          examples: [
            {
              title: t('duplicatefinder', 'Performance Options'),
              settings: [
                {
                  name: t('duplicatefinder', 'Ignore Mounted Files'),
                  description: t('duplicatefinder', 'Skip external storage during scanning')
                },
                {
                  name: t('duplicatefinder', 'Disable Filesystem Events'),
                  description: t('duplicatefinder', 'Turn off automatic scanning on file changes')
                },
                {
                  name: t('duplicatefinder', 'Background Job Interval'),
                  description: t('duplicatefinder', 'Adjust frequency of automatic scans')
                }
              ]
            }
          ]
        }
      ]
    }
  }
}
</script>

<style scoped>
.usage-examples {
  padding: var(--spacing-3);
}

.section {
  margin-bottom: 48px;
}

.section:last-child {
  margin-bottom: 0;
}

.section-title {
  font-size: 24px;
  font-weight: bold;
  color: var(--color-main-text);
  margin-bottom: 24px;
  padding-bottom: 12px;
  border-bottom: 2px solid var(--color-border);
}

.section-description {
  font-size: 16px;
  color: var(--color-text-light);
  margin-bottom: 24px;
  line-height: 1.6;
}

.example-block {
  background: var(--color-background-hover);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-large);
  padding: 24px;
  margin-bottom: 24px;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.example-block:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-hover);
}

.example-title {
  color: var(--color-primary-element);
  font-size: 18px;
  font-weight: bold;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
}

.example-title::before {
  content: "";
  display: inline-block;
  width: 4px;
  height: 20px;
  background: var(--color-primary-element);
  margin-right: 12px;
  border-radius: var(--border-radius);
}

/* Code Block Styles */
.code-block {
  background: var(--color-background-dark);
  border-radius: var(--border-radius);
  padding: 16px;
  margin: 16px 0;
  border: 1px solid var(--color-border);
}

.code-line {
  display: flex;
  align-items: center;
  margin: 12px 0;
  font-family: var(--font-face-monospace);
}

.code-label {
  color: var(--color-text-maxcontrast);
  margin-right: 12px;
  min-width: 120px;
}

.code-line code {
  background: var(--color-main-background);
  color: var(--color-primary-element);
  padding: 6px 12px;
  border-radius: var(--border-radius);
  border: 1px solid var(--color-border);
  font-size: 14px;
}

/* Settings List Styles */
.settings-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.setting-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  background: var(--color-main-background);
  border-radius: var(--border-radius);
  border: 1px solid var(--color-border);
}

.setting-name {
  color: var(--color-primary-element);
  font-weight: bold;
  font-family: var(--font-face-monospace);
  font-size: 15px;
}

.setting-desc {
  color: var(--color-text-maxcontrast);
  font-size: 14px;
  margin-left: 16px;
  line-height: 1.4;
}

/* Feature List Styles */
.feature-list {
  margin: 16px 0;
  padding-left: 24px;
}

.feature-list li {
  margin: 12px 0;
  position: relative;
  list-style: none;
  padding-left: 28px;
  line-height: 1.5;
  color: var(--color-text-light);
}

.feature-list li::before {
  content: "•";
  color: var(--color-primary-element);
  position: absolute;
  left: 0;
  font-weight: bold;
  font-size: 20px;
}

/* Note Block Styles */
.note {
  background: var(--color-background-dark);
  border-left: 4px solid var(--color-primary-element);
  padding: 16px 20px;
  margin-top: 16px;
  border-radius: var(--border-radius);
  color: var(--color-text-light);
  font-size: 14px;
  line-height: 1.5;
}

.note strong {
  color: var(--color-primary-element);
  margin-right: 8px;
}
</style> 