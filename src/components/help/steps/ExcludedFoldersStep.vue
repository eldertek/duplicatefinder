<template>
  <div class="step-container">
    <h2 class="step-title">{{ t('duplicatefinder', 'Excluded Folders') }}</h2>
    <div class="info-section">
      <div class="info-block">
        <h3>{{ t('duplicatefinder', 'Why Exclude Folders?') }}</h3>
        <ul>
          <li>{{ t('duplicatefinder', 'Files in these folders (and subfolders) will be ignored during duplicate detection') }}</li>
          <li>{{ t('duplicatefinder', 'Improves scanning performance by skipping unnecessary locations') }}</li>
          <li>{{ t('duplicatefinder', 'Useful for folders that intentionally contain duplicates') }}</li>
        </ul>
      </div>

      <div class="info-block">
        <h3>{{ t('duplicatefinder', 'Common Use Cases') }}</h3>
        <div class="use-cases">
          <div class="use-case">
            <span class="use-case-title">{{ t('duplicatefinder', 'Backup Folders') }}</span>
            <span class="use-case-desc">{{ t('duplicatefinder', 'Skip scanning backup directories that naturally contain duplicates') }}</span>
          </div>
          <div class="use-case">
            <span class="use-case-title">{{ t('duplicatefinder', 'Cache Directories') }}</span>
            <span class="use-case-desc">{{ t('duplicatefinder', 'Exclude temporary and cache folders') }}</span>
          </div>
          <div class="use-case">
            <span class="use-case-title">{{ t('duplicatefinder', 'Version Control') }}</span>
            <span class="use-case-desc">{{ t('duplicatefinder', 'Skip .git and other version control directories') }}</span>
          </div>
        </div>
      </div>

      <div class="info-block">
        <h3>{{ t('duplicatefinder', 'How to Configure') }}</h3>
        <div class="settings-list">
          <div class="setting-item">
            <span class="setting-name">{{ t('duplicatefinder', '1. Open Settings') }}</span>
            <span class="setting-desc">{{ t('duplicatefinder', 'Go to Settings > Excluded Folders') }}</span>
          </div>
          <div class="setting-item">
            <span class="setting-name">{{ t('duplicatefinder', '2. Select Folders') }}</span>
            <span class="setting-desc">{{ t('duplicatefinder', 'Use the file picker to choose folders to exclude') }}</span>
          </div>
          <div class="setting-item">
            <span class="setting-name">{{ t('duplicatefinder', '3. Review List') }}</span>
            <span class="setting-desc">{{ t('duplicatefinder', 'Manage your excluded folders list as needed') }}</span>
          </div>
        </div>
      </div>

      <div class="note">
        <strong>{{ t('duplicatefinder', 'Note:') }}</strong>
        {{ t('duplicatefinder', 'Excluding too many folders might cause you to miss actual duplicates. Use this feature judiciously.') }}
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'ExcludedFoldersStep'
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
  color: var(--color-primary-element);
  font-size: 20px;
  font-weight: bold;
  margin-bottom: 20px;
  display: flex;
  align-items: center;
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

.use-cases {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.use-case {
  background: var(--color-main-background);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  padding: 16px;
}

.use-case-title {
  display: block;
  color: var(--color-primary-element);
  font-weight: bold;
  margin-bottom: 8px;
}

.use-case-desc {
  display: block;
  color: var(--color-text-maxcontrast);
  font-size: 14px;
}

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

.note {
  background: var(--color-background-dark);
  border-left: 4px solid var(--color-warning);
  padding: 20px 24px;
  margin-top: 32px;
  border-radius: var(--border-radius);
  display: flex;
  align-items: center;
  color: var(--color-text-light);
}

.note strong {
  color: var(--color-warning);
  margin-right: 8px;
}
</style> 