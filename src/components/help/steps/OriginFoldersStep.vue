<template>
  <div class="step-container">
    <h2 class="step-title">{{ t('duplicatefinder', 'Protected Folders (Origin Folders)') }}</h2>
    <div class="info-section">
      <div class="info-block">
        <h3>{{ t('duplicatefinder', 'What are Origin Folders?') }}</h3>
        <ul>
          <li>{{ t('duplicatefinder', 'Files in origin folders will never be marked as duplicates to be deleted') }}</li>
          <li>{{ t('duplicatefinder', 'Use this for folders containing your original or master files') }}</li>
          <li>{{ t('duplicatefinder', 'Ensures important files are always preserved') }}</li>
        </ul>
      </div>

      <div class="info-block">
        <h3>{{ t('duplicatefinder', 'How to Configure') }}</h3>
        <div class="settings-list">
          <div class="setting-item">
            <span class="setting-name">{{ t('duplicatefinder', '1. Access Settings') }}</span>
            <span class="setting-desc">{{ t('duplicatefinder', 'Navigate to Settings > Origin Folders') }}</span>
          </div>
          <div class="setting-item">
            <span class="setting-name">{{ t('duplicatefinder', '2. Add Folders') }}</span>
            <span class="setting-desc">{{ t('duplicatefinder', 'Use the file picker to select important folders') }}</span>
          </div>
          <div class="setting-item">
            <span class="setting-name">{{ t('duplicatefinder', '3. Manage List') }}</span>
            <span class="setting-desc">{{ t('duplicatefinder', 'Add or remove folders as needed') }}</span>
          </div>
        </div>
      </div>

      <div class="tip-box">
        <strong>{{ t('duplicatefinder', 'Pro Tip:') }}</strong>
        {{ t('duplicatefinder', 'Consider using origin folders for your photo library, important documents, or any other irreplaceable files.') }}
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'OriginFoldersStep'
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

.tip-box {
  background: var(--color-background-hover);
  border-radius: var(--border-radius);
  padding: 20px;
  margin-top: 32px;
  border-left: 4px solid var(--color-success);
}

.tip-box strong {
  color: var(--color-success);
  margin-right: 8px;
}
</style> 