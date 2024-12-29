<template>
  <div class="onboarding-guide">
    <!-- Welcome Step -->
    <div v-if="currentStep === 0" class="welcome-container">
      <div class="welcome-content">
        <h1 class="welcome-title">{{ steps[0].title }}</h1>
        <p class="welcome-description">{{ steps[0].content }}</p>
      </div>
    </div>

    <!-- Other Steps -->
    <div v-else class="step-container">
      <h2 class="step-title">{{ steps[currentStep].title }}</h2>
      <div class="step-content" v-html="formattedContent"></div>
    </div>

    <!-- Navigation -->
    <div class="navigation-container">
      <!-- Progress -->
      <div class="progress-section">
        <NcProgressBar
          :value="((currentStep + 1) / steps.length) * 100"
          size="medium"
          class="progress-bar" />
        <span class="step-counter">
          {{ t('duplicatefinder', 'Step {step} of {total}', { step: currentStep + 1, total: steps.length }) }}
        </span>
      </div>

      <!-- Buttons -->
      <div class="button-section">
        <NcButton v-if="currentStep > 0"
          type="tertiary"
          @click="previousStep"
          class="nav-button">
          <template #icon>
            <ChevronLeft :size="20" />
          </template>
          {{ t('duplicatefinder', 'Previous') }}
        </NcButton>

        <NcButton
          type="primary"
          @click="currentStep === steps.length - 1 ? closeGuide() : nextStep()"
          class="nav-button">
          {{ currentStep === steps.length - 1 ? t('duplicatefinder', 'Get Started') : t('duplicatefinder', 'Next') }}
          <template #icon>
            <component :is="currentStep === steps.length - 1 ? 'Check' : 'ChevronRight'" :size="20" />
          </template>
        </NcButton>
      </div>
    </div>
  </div>
</template>

<script>
import { NcButton, NcProgressBar } from '@nextcloud/vue'
import ChevronLeft from 'vue-material-design-icons/ChevronLeft'
import ChevronRight from 'vue-material-design-icons/ChevronRight'
import Check from 'vue-material-design-icons/Check'

export default {
  name: 'OnboardingGuide',
  components: {
    NcButton,
    NcProgressBar,
    ChevronLeft,
    ChevronRight,
    Check
  },
  props: {
    show: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {
      currentStep: 0,
      steps: [
        {
          title: t('duplicatefinder', 'Welcome to Duplicate Finder!'),
          content: t('duplicatefinder', 'This guide will help you get started with finding and managing duplicate files.')
        },
        {
          title: t('duplicatefinder', 'Finding Duplicates'),
          content: t('duplicatefinder', 'The app provides powerful search capabilities to help you find specific duplicates:') +
            '<div class="info-section">' +
            '<div class="info-block">' +
            '<h3>' + t('duplicatefinder', 'Search Modes') + '</h3>' +
            '<ul>' +
            '<li><strong>' + t('duplicatefinder', 'Simple Search:') + '</strong> ' + 
            t('duplicatefinder', 'Basic text search in file names') + '</li>' +
            '<li><strong>' + t('duplicatefinder', 'Wildcard Search:') + '</strong> ' + 
            t('duplicatefinder', 'Use * and ? to match patterns (e.g., IMG*.jpg)') + '</li>' +
            '<li><strong>' + t('duplicatefinder', 'Regular Expression:') + '</strong> ' + 
            t('duplicatefinder', 'Advanced pattern matching for precise searches') + '</li>' +
            '</ul>' +
            '</div>' +
            '<div class="info-block">' +
            '<h3>' + t('duplicatefinder', 'Automatic Detection') + '</h3>' +
            '<ul>' +
            '<li>' + t('duplicatefinder', 'Files are automatically scanned when uploaded or modified') + '</li>' +
            '<li>' + t('duplicatefinder', 'Background jobs regularly scan for new duplicates') + '</li>' +
            '<li>' + t('duplicatefinder', 'Manual scans can be triggered from settings') + '</li>' +
            '</ul>' +
            '</div>' +
            '<div class="tip-box">' +
            '<strong>' + t('duplicatefinder', 'Quick Tip:') + '</strong> ' +
            t('duplicatefinder', 'Use the help icon next to the search bar for detailed examples of each search mode.') +
            '</div>' +
            '</div>'
        },
        {
          title: t('duplicatefinder', 'Scanning for Duplicates'),
          content: t('duplicatefinder', 'The app automatically scans for duplicates when files are added or modified. You can configure and trigger scans in several ways:') +
            '<div class="info-section">' +
            '<div class="info-block">' +
            '<h3>1. Using OCC command (admin only):</h3>' +
            '<div class="code-block">' +
            '<div class="code-line">' +
            '<span class="code-label">Full scan:</span>' +
            '<code>occ duplicates:find-all</code>' +
            '</div>' +
            '<div class="code-line">' +
            '<span class="code-label">Scan specific user:</span>' +
            '<code>occ duplicates:find-all -u username</code>' +
            '</div>' +
            '</div>' +
            '</div>' +
            '<div class="info-block">' +
            '<h3>2. Using Duplicate Finder Settings (admin only):</h3>' +
            '<div class="settings-list">' +
            '<div class="setting-item">' +
            '<span class="setting-name">"Find all duplicates"</span>' +
            '<span class="setting-desc">button in Advanced Settings</span>' +
            '</div>' +
            '<div class="setting-item">' +
            '<span class="setting-name">"Background Job Find Duplicates Interval"</span>' +
            '<span class="setting-desc">configure automatic scanning interval</span>' +
            '</div>' +
            '<div class="setting-item">' +
            '<span class="setting-name">"Ignore Mounted Files"</span>' +
            '<span class="setting-desc">exclude external storage from scanning</span>' +
            '</div>' +
            '<div class="setting-item">' +
            '<span class="setting-name">"Disable Filesystem Events"</span>' +
            '<span class="setting-desc">turn off automatic scanning on file changes</span>' +
            '</div>' +
            '</div>' +
            '</div>' +
            '</div>'
        },
        {
          title: t('duplicatefinder', 'Managing Duplicates'),
          content: t('duplicatefinder', 'The app provides several ways to manage your duplicate files:') +
            '<div class="info-section">' +
            '<div class="info-block">' +
            '<h3>1. Individual Management:</h3>' +
            '<ul>' +
            '<li>View all duplicates in the "Unacknowledged" and "Acknowledged" sections</li>' +
            '<li>Select which copies to delete while keeping the originals</li>' +
            '<li>Mark duplicates as acknowledged to organize them better</li>' +
            '</ul>' +
            '</div>' +
            '<div class="info-block">' +
            '<h3>2. Bulk Operations:</h3>' +
            '<ul>' +
            '<li>Use "Bulk Delete" feature to handle multiple duplicates at once</li>' +
            '<li>Select multiple files for deletion in a single operation</li>' +
            '<li>Review your selection before confirming deletion</li>' +
            '</ul>' +
            '</div>' +
            '<div class="note">' +
            '<strong>Note:</strong> All deleted files can be recovered from the Nextcloud trash bin during the retention period.' +
            '</div>' +
            '</div>'
        },
        {
          title: t('duplicatefinder', 'Protected Folders (Origin Folders)'),
          content: t('duplicatefinder', 'Origin folders are essential for protecting your important files:') +
            '<div class="info-section">' +
            '<div class="info-block">' +
            '<ul>' +
            '<li>Files in origin folders will never be marked as duplicates to be deleted</li>' +
            '<li>Use this for folders containing your original or master files</li>' +
            '<li>Ensures important files are always preserved</li>' +
            '<li>Can be configured in Settings > Origin Folders</li>' +
            '<li>Easy to add/remove folders using the file picker</li>' +
            '</ul>' +
            '</div>' +
            '</div>'
        },
        {
          title: t('duplicatefinder', 'Excluded Folders'),
          content: t('duplicatefinder', 'Excluded folders help optimize the scanning process:') +
            '<div class="info-section">' +
            '<div class="info-block">' +
            '<ul>' +
            '<li>Files in these folders (and subfolders) will be ignored during duplicate detection</li>' +
            '<li>Useful for folders you don\'t want to scan (e.g., backup folders)</li>' +
            '<li>Helps improve scanning performance</li>' +
            '<li>Can be configured in Settings > Excluded Folders</li>' +
            '<li>Easily manage using the file picker</li>' +
            '</ul>' +
            '</div>' +
            '</div>'
        },
        {
          title: t('duplicatefinder', "You're Ready!"),
          content: '<div class="final-step">' +
            '<p class="final-description">' + t('duplicatefinder', 'You can now start managing your duplicate files. Access settings anytime for more options.') + '</p>' +
            '<div class="info-section">' +
            '<div class="info-block support-block">' +
            '<div class="support-header">' +
            '<div class="support-title">' + t('duplicatefinder', 'Support the Project') + '</div>' +
            '<div class="support-subtitle">' + t('duplicatefinder', 'Help us make Duplicate Finder even better!') + '</div>' +
            '</div>' +
            '<div class="support-actions">' +
            '<a href="https://github.com/eldertek/duplicatefinder" target="_blank" rel="noopener noreferrer" class="support-action star-action">' +
            '<span class="action-icon">⭐</span>' +
            '<div class="action-content">' +
            '<div class="action-title">' + t('duplicatefinder', 'Star on GitHub') + '</div>' +
            '<div class="action-description">' + t('duplicatefinder', 'Show your support by starring the project') + '</div>' +
            '</div>' +
            '</a>' +
            '<a href="https://github.com/eldertek/duplicatefinder/issues" target="_blank" rel="noopener noreferrer" class="support-action feedback-action">' +
            '<span class="action-icon">💡</span>' +
            '<div class="action-content">' +
            '<div class="action-title">' + t('duplicatefinder', 'Share Feedback') + '</div>' +
            '<div class="action-description">' + t('duplicatefinder', 'Help us improve by sharing your ideas') + '</div>' +
            '</div>' +
            '</a>' +
            '<a href="https://github.com/eldertek/duplicatefinder" target="_blank" rel="noopener noreferrer" class="support-action contribute-action">' +
            '<span class="action-icon">🚀</span>' +
            '<div class="action-content">' +
            '<div class="action-title">' + t('duplicatefinder', 'Contribute') + '</div>' +
            '<div class="action-description">' + t('duplicatefinder', 'Join our community of developers') + '</div>' +
            '</div>' +
            '</a>' +
            '</div>' +
            '</div>' +
            '</div>'
        }
      ]
    }
  },
  computed: {
    formattedContent() {
      return this.steps[this.currentStep].content
    }
  },
  methods: {
    nextStep() {
      if (this.currentStep < this.steps.length - 1) {
        this.currentStep++
      }
    },
    previousStep() {
      if (this.currentStep > 0) {
        this.currentStep--
      }
    },
    closeGuide() {
      this.$emit('close')
    }
  }
}
</script>

<style scoped>
.onboarding-guide {
  display: flex;
  flex-direction: column;
  min-height: 500px;
  max-width: 900px;
  margin: 0 auto;
  background-color: var(--color-main-background);
  border-radius: var(--border-radius-large);
  box-shadow: var(--shadow-modal);
}

/* Welcome Step */
.welcome-container {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  flex-grow: 1;
  padding: 80px 40px;
  text-align: center;
  background: linear-gradient(var(--color-primary-element-light) 0%, transparent 100%);
  border-radius: var(--border-radius-large) var(--border-radius-large) 0 0;
}

.welcome-content {
  max-width: 600px;
  background: var(--color-main-background);
  padding: 32px;
  border-radius: var(--border-radius-large);
  box-shadow: var(--shadow-modal);
}

.welcome-title {
  font-size: 32px;
  font-weight: bold;
  color: var(--color-main-text);
  margin-bottom: 24px;
  line-height: 1.2;
}

.welcome-description {
  font-size: 18px;
  line-height: 1.6;
  color: var(--color-text-maxcontrast);
}

/* Other Steps */
.step-container {
  flex-grow: 1;
  padding: 40px;
  background: var(--color-main-background);
  border-radius: var(--border-radius-large) var(--border-radius-large) 0 0;
}

/* Final Step specific styles */
.step-container:has(.support-block) {
  background: linear-gradient(var(--color-primary-element-light) 0%, transparent 100%);
  padding: 0;
}

.step-container:has(.support-block) .step-title {
  text-align: center;
  font-size: 32px;
  margin: 40px 0 16px;
  padding: 0;
  border: none;
}

.step-container:has(.support-block) .step-content {
  text-align: center;
  padding: 0 40px 40px;
}

.support-block {
  background: var(--color-main-background);
  border-radius: var(--border-radius-large);
  padding: 40px;
  margin: 32px auto;
  max-width: 600px;
  box-shadow: var(--shadow-modal);
}

.support-header {
  margin-bottom: 32px;
}

.support-header h3 {
  color: var(--color-main-text);
  font-size: 28px;
  margin-bottom: 12px;
  padding: 0;
}

.support-header h3::before {
  display: none;
}

.support-subtitle {
  color: var(--color-text-maxcontrast);
  font-size: 18px;
}

.support-actions {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.support-action {
  display: flex;
  align-items: center;
  padding: 20px;
  background: var(--color-background-hover);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-large);
  text-decoration: none !important;
  transition: all 0.2s ease;
}

.support-action:hover {
  transform: translateX(8px);
  background: var(--color-main-background) !important;
  border-color: var(--color-primary-element);
  box-shadow: var(--shadow-hover);
}

.action-icon {
  font-size: 32px;
  margin-right: 20px;
  min-width: 48px;
  text-align: center;
}

.action-content {
  text-align: left;
  flex-grow: 1;
}

.action-title {
  color: var(--color-main-text);
  font-weight: bold;
  font-size: 18px;
  margin-bottom: 4px;
}

.action-description {
  color: var(--color-text-maxcontrast);
  font-size: 14px;
}

.star-action .action-icon {
  color: #FFD700;
  text-shadow: 0 0 10px rgba(255, 215, 0, 0.3);
}

.feedback-action .action-icon {
  color: #4CAF50;
  text-shadow: 0 0 10px rgba(76, 175, 80, 0.3);
}

.contribute-action .action-icon {
  color: #2196F3;
  text-shadow: 0 0 10px rgba(33, 150, 243, 0.3);
}

/* Navigation */
.navigation-container {
  padding: 32px 40px;
  border-top: 1px solid var(--color-border);
  background: var(--color-main-background);
  border-radius: 0 0 var(--border-radius-large) var(--border-radius-large);
}

.progress-section {
  margin-bottom: 24px;
}

.progress-bar {
  margin-bottom: 12px;
  height: 6px;
}

.step-counter {
  display: block;
  text-align: center;
  color: var(--color-text-maxcontrast);
  font-size: 14px;
  margin-top: 8px;
}

.button-section {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}

.nav-button {
  min-width: 140px;
  font-weight: bold;
}

/* Links */
:deep(a) {
  color: var(--color-primary-element);
  text-decoration: none;
  font-weight: bold;
  padding: 4px 8px;
  border-radius: var(--border-radius);
  transition: background-color 0.2s ease;
}

:deep(a:hover) {
  background-color: var(--color-primary-element-light);
  text-decoration: none;
}

.code-block {
  background: var(--color-background-dark);
  border-radius: var(--border-radius);
  padding: 16px;
  margin: 16px 0;
}

.code-line {
  display: flex;
  align-items: center;
  margin: 8px 0;
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
  padding: 4px 8px;
  border-radius: var(--border-radius);
  border: 1px solid var(--color-border);
}

.settings-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.setting-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.setting-name {
  color: var(--color-primary-element);
  font-weight: bold;
  font-family: var(--font-face-monospace);
}

.setting-desc {
  color: var(--color-text-maxcontrast);
  font-size: 0.9em;
  margin-left: 16px;
}

.support-title {
  color: var(--color-main-text) !important;
  font-size: 32px !important;
  font-weight: bold !important;
  margin-bottom: 16px !important;
  text-align: center !important;
  padding: 0 !important;
  font-family: var(--font-face-default) !important;
}

.support-subtitle {
  color: var(--color-text-maxcontrast) !important;
  font-size: 20px !important;
  font-weight: normal !important;
  margin-bottom: 32px !important;
  text-align: center !important;
  padding: 0 !important;
  font-family: var(--font-face-default) !important;
}

.support-title::before,
.support-subtitle::before {
  display: none !important;
}

.step-title {
  font-size: 28px !important;
  font-weight: bold !important;
  color: var(--color-main-text) !important;
  margin-bottom: 32px !important;
  padding-bottom: 16px !important;
  border-bottom: 2px solid var(--color-border) !important;
  font-family: var(--font-face-default) !important;
}

.step-content {
  color: var(--color-text-light);
  line-height: 1.6;
}

/* Info Sections */
.info-section {
  margin: 32px 0;
}

.info-block {
  background: var(--color-background-hover);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-large);
  padding: 32px;
  margin-bottom: 24px;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.info-block:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-hover);
}

.info-block h3 {
  color: var(--color-primary-element) !important;
  font-size: 20px !important;
  font-weight: bold !important;
  margin-bottom: 20px !important;
  display: flex !important;
  align-items: center !important;
  font-family: var(--font-face-default) !important;
}

.info-block h3::before {
  content: "" !important;
  display: inline-block !important;
  width: 4px !important;
  height: 24px !important;
  background: var(--color-primary-element) !important;
  margin-right: 12px !important;
  border-radius: var(--border-radius) !important;
}

.info-block ul {
  margin: 0;
  padding-left: 24px;
}

.info-block li {
  margin: 16px 0;
  position: relative;
  list-style: none;
  padding-left: 28px;
  line-height: 1.5;
  color: var(--color-text-light);
}

.info-block li::before {
  content: "•";
  color: var(--color-primary-element);
  position: absolute;
  left: 0;
  font-weight: bold;
  font-size: 20px;
}

/* Code blocks */
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
  min-width: 140px;
}

.code-line code {
  background: var(--color-main-background);
  color: var(--color-primary-element);
  padding: 8px 12px;
  border-radius: var(--border-radius);
  border: 1px solid var(--color-border);
  font-size: 14px;
}

/* Note block */
.note {
  background: var(--color-background-dark);
  border-left: 4px solid var(--color-primary-element);
  padding: 20px 24px;
  margin-top: 32px;
  border-radius: var(--border-radius);
  display: flex;
  align-items: center;
  color: var(--color-text-light);
}

.note strong {
  color: var(--color-primary-element);
  margin-right: 8px;
}

/* Settings list */
.settings-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.setting-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
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

.final-step {
  text-align: center;
}

.final-description {
  font-size: 18px;
  color: var(--color-text-light);
  margin-bottom: 32px;
  line-height: 1.6;
}

.support-header {
  margin-bottom: 32px;
}

.support-title {
  color: var(--color-main-text) !important;
  font-size: 32px !important;
  font-weight: bold !important;
  margin-bottom: 16px !important;
  text-align: center !important;
  padding: 0 !important;
  font-family: var(--font-face-default) !important;
}

.support-subtitle {
  color: var(--color-text-maxcontrast) !important;
  font-size: 20px !important;
  font-weight: normal !important;
  margin-bottom: 32px !important;
  text-align: center !important;
  padding: 0 !important;
  font-family: var(--font-face-default) !important;
}

.guide-section {
  margin-top: 40px;
  padding: 40px;
  background: var(--color-main-background);
  border-radius: var(--border-radius-large) var(--border-radius-large) 0 0;
}

.guide-section h3 {
  font-size: 28px;
  font-weight: bold;
  color: var(--color-main-text);
  margin-bottom: 20px;
}

.feature-highlight {
  background: var(--color-background-hover);
  border-radius: var(--border-radius);
  padding: 20px;
  margin-bottom: 20px;
}

.feature-highlight h4 {
  font-size: 20px;
  font-weight: bold;
  color: var(--color-main-text);
  margin-bottom: 16px;
}

.feature-highlight ul {
  list-style: disc;
  padding-left: 20px;
}

.feature-highlight li {
  margin: 12px 0;
  color: var(--color-text-light);
}

.tip-box {
  background: var(--color-background-hover);
  border-radius: var(--border-radius);
  padding: 20px;
  margin-bottom: 20px;
}

.tip-box p {
  font-size: 18px;
  color: var(--color-text-light);
}

.tip-box strong {
  color: var(--color-primary-element);
  margin-right: 8px;
}
</style> 