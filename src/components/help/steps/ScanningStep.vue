<template>
  <div class="step-container">
    <h2 class="step-title">{{ t('duplicatefinder', 'Scanning for Duplicates') }}</h2>
    <div class="info-section">
      <div class="info-block">
        <h3>1. {{ t('duplicatefinder', 'Using OCC command (admin only):') }}</h3>
        <div class="code-block">
          <div class="code-line">
            <span class="code-label">{{ t('duplicatefinder', 'Full scan:') }}</span>
            <code>occ duplicates:find-all</code>
          </div>
          <div class="code-line">
            <span class="code-label">{{ t('duplicatefinder', 'Scan specific user:') }}</span>
            <code>occ duplicates:find-all -u username</code>
          </div>
        </div>
      </div>

      <div class="info-block">
        <h3>2. {{ t('duplicatefinder', 'Using Duplicate Finder Settings (admin only):') }}</h3>
        <div class="settings-list">
          <div class="setting-item">
            <span class="setting-name">{{ t('duplicatefinder', '"Find all duplicates"') }}</span>
            <span class="setting-desc">{{ t('duplicatefinder', 'button in Advanced Settings') }}</span>
          </div>
          <div class="setting-item">
            <span class="setting-name">{{ t('duplicatefinder', '"Background Job Find Duplicates Interval"') }}</span>
            <span class="setting-desc">{{ t('duplicatefinder', 'configure automatic scanning interval') }}</span>
          </div>
          <div class="setting-item">
            <span class="setting-name">{{ t('duplicatefinder', '"Ignore Mounted Files"') }}</span>
            <span class="setting-desc">{{ t('duplicatefinder', 'exclude external storage from scanning') }}</span>
          </div>
          <div class="setting-item">
            <span class="setting-name">{{ t('duplicatefinder', '"Disable Filesystem Events"') }}</span>
            <span class="setting-desc">{{ t('duplicatefinder', 'turn off automatic scanning on file changes') }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'ScanningStep'
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
</style> 