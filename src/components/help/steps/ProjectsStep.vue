<template>
  <div class="step-container">
    <div class="step-content">
      <h2 class="step-title">{{ t('duplicatefinder', 'Working with Projects') }}</h2>
      
      <div class="info-block">
        <h3>{{ t('duplicatefinder', 'What are Projects?') }}</h3>
        <p>{{ t('duplicatefinder', 'Projects allow you to scan specific folders for duplicates instead of your entire storage. This is useful when you want to focus on cleaning up duplicates in particular areas of your Nextcloud.') }}</p>
      </div>

      <div class="feature-block">
        <h3>{{ t('duplicatefinder', 'Creating a Project') }}</h3>
        <ol class="steps-list">
          <li>{{ t('duplicatefinder', 'Go to Settings → Projects') }}</li>
          <li>{{ t('duplicatefinder', 'Click "Create New Project"') }}</li>
          <li>{{ t('duplicatefinder', 'Enter a name for your project') }}</li>
          <li>{{ t('duplicatefinder', 'Add one or more folders to include in the scan') }}</li>
          <li>{{ t('duplicatefinder', 'Click "Create Project"') }}</li>
        </ol>
        <div class="note">
          {{ t('duplicatefinder', 'You can select any folders from your Nextcloud storage. The scan will only look for duplicates within these folders.') }}
        </div>
      </div>

      <div class="feature-block">
        <h3>{{ t('duplicatefinder', 'Running a Project Scan') }}</h3>
        <ol class="steps-list">
          <li>{{ t('duplicatefinder', 'From the Projects section in Settings, click "Start Scan" on your project') }}</li>
          <li>{{ t('duplicatefinder', 'Alternatively, select your project from the navigation sidebar and click "Start Scan"') }}</li>
          <li>{{ t('duplicatefinder', 'Wait for the scan to complete - this may take some time depending on the number of files') }}</li>
        </ol>
      </div>

      <div class="feature-block">
        <h3>{{ t('duplicatefinder', 'Viewing Project Results') }}</h3>
        <ul class="feature-list">
          <li>{{ t('duplicatefinder', 'Click "View Results" on your project or select it from the navigation sidebar') }}</li>
          <li>{{ t('duplicatefinder', 'Browse through the duplicates found within your selected folders') }}</li>
          <li>{{ t('duplicatefinder', 'Use the same tools as with regular duplicates to manage and delete files') }}</li>
          <li>{{ t('duplicatefinder', 'Filter results by acknowledged/unacknowledged status') }}</li>
        </ul>
      </div>

      <div class="feature-block">
        <h3>{{ t('duplicatefinder', 'Managing Projects') }}</h3>
        <ul class="feature-list">
          <li>{{ t('duplicatefinder', 'Edit a project to change its name or included folders') }}</li>
          <li>{{ t('duplicatefinder', 'Delete a project when you no longer need it') }}</li>
          <li>{{ t('duplicatefinder', 'Create multiple projects for different areas of your storage') }}</li>
        </ul>
        <div class="note">
          {{ t('duplicatefinder', 'Deleting a project only removes the project configuration, not any of your files.') }}
        </div>
      </div>

      <div class="benefits-block">
        <h3>{{ t('duplicatefinder', 'Benefits of Using Projects') }}</h3>
        <ul class="benefits-list">
          <li>
            <span class="benefit-title">{{ t('duplicatefinder', 'Focused Scanning') }}</span>
            <span class="benefit-desc">{{ t('duplicatefinder', 'Target specific areas instead of your entire storage') }}</span>
          </li>
          <li>
            <span class="benefit-title">{{ t('duplicatefinder', 'Faster Results') }}</span>
            <span class="benefit-desc">{{ t('duplicatefinder', 'Scanning fewer files means quicker completion') }}</span>
          </li>
          <li>
            <span class="benefit-title">{{ t('duplicatefinder', 'Better Organization') }}</span>
            <span class="benefit-desc">{{ t('duplicatefinder', 'Organize your duplicate cleanup by projects') }}</span>
          </li>
          <li>
            <span class="benefit-title">{{ t('duplicatefinder', 'Targeted Cleanup') }}</span>
            <span class="benefit-desc">{{ t('duplicatefinder', 'Focus on cleaning up specific collections or folders') }}</span>
          </li>
        </ul>
      </div>

      <div class="navigation-buttons">
        <NcButton type="primary" @click="$emit('next')">
          {{ t('duplicatefinder', 'Next: Managing Duplicates') }}
          <template #icon>
            <ArrowRight :size="20" />
          </template>
        </NcButton>
      </div>
    </div>
  </div>
</template>

<script>
import { NcButton } from '@nextcloud/vue'
import ArrowRight from 'vue-material-design-icons/ArrowRight'

export default {
  name: 'ProjectsStep',
  components: {
    NcButton,
    ArrowRight
  }
}
</script>

<style scoped>
.step-container {
  flex-grow: 1;
  padding: 40px;
  background: var(--color-main-background);
}

.step-title {
  font-size: 28px;
  font-weight: bold;
  color: var(--color-main-text);
  margin-bottom: 32px;
  padding-bottom: 16px;
  border-bottom: 2px solid var(--color-border);
}

.info-block {
  margin-bottom: 32px;
  background: var(--color-background-hover);
  padding: 24px;
  border-radius: var(--border-radius-large);
  border-left: 4px solid var(--color-primary-element);
}

.info-block h3 {
  color: var(--color-primary-element);
  font-size: 20px;
  margin-bottom: 16px;
}

.info-block p {
  line-height: 1.6;
  color: var(--color-text-light);
}

.feature-block {
  margin-bottom: 32px;
  padding: 24px;
  background: var(--color-background-hover);
  border-radius: var(--border-radius-large);
}

.feature-block h3 {
  color: var(--color-main-text);
  font-size: 18px;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
}

.feature-block h3::before {
  content: "";
  display: inline-block;
  width: 4px;
  height: 18px;
  background: var(--color-primary-element);
  margin-right: 12px;
  border-radius: var(--border-radius);
}

.steps-list {
  margin: 0;
  padding-left: 24px;
}

.steps-list li {
  margin: 12px 0;
  position: relative;
  padding-left: 8px;
  line-height: 1.5;
  color: var(--color-text-light);
}

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

.benefits-block {
  margin-bottom: 32px;
  padding: 24px;
  background: var(--color-background-hover);
  border-radius: var(--border-radius-large);
}

.benefits-block h3 {
  color: var(--color-main-text);
  font-size: 18px;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
}

.benefits-block h3::before {
  content: "";
  display: inline-block;
  width: 4px;
  height: 18px;
  background: var(--color-primary-element);
  margin-right: 12px;
  border-radius: var(--border-radius);
}

.benefits-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.benefits-list li {
  background: var(--color-main-background);
  padding: 16px;
  border-radius: var(--border-radius);
  border: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
}

.benefit-title {
  color: var(--color-primary-element);
  font-weight: bold;
  margin-bottom: 8px;
}

.benefit-desc {
  color: var(--color-text-light);
  font-size: 14px;
}

.navigation-buttons {
  display: flex;
  justify-content: flex-end;
  margin-top: 40px;
}
</style>
