<template>
  <div class="step-container">
    <h2 class="step-title">{{ t('duplicatefinder', 'Finding Duplicates') }}</h2>
    <div class="info-section">
      <div class="info-block">
        <h3>{{ t('duplicatefinder', 'Search Modes') }}</h3>
        <ul>
          <li>
            <strong>{{ t('duplicatefinder', 'Simple Search:') }}</strong>
            {{ t('duplicatefinder', 'Basic text search in file names') }}
          </li>
          <li>
            <strong>{{ t('duplicatefinder', 'Wildcard Search:') }}</strong>
            {{ t('duplicatefinder', 'Use * and ? to match patterns (e.g., IMG*.jpg)') }}
          </li>
          <li>
            <strong>{{ t('duplicatefinder', 'Regular Expression:') }}</strong>
            {{ t('duplicatefinder', 'Advanced pattern matching for precise searches') }}
          </li>
        </ul>
      </div>

      <div class="info-block">
        <h3>{{ t('duplicatefinder', 'Automatic Detection') }}</h3>
        <ul>
          <li>{{ t('duplicatefinder', 'Files are automatically scanned when uploaded or modified') }}</li>
          <li>{{ t('duplicatefinder', 'Background jobs regularly scan for new duplicates') }}</li>
          <li>{{ t('duplicatefinder', 'Manual scans can be triggered from settings') }}</li>
        </ul>
      </div>

      <div class="tip-box">
        <strong>{{ t('duplicatefinder', 'Quick Tip:') }}</strong>
        {{ t('duplicatefinder', 'Use the help icon next to the search bar for detailed examples of each search mode.') }}
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'FindingDuplicatesStep'
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

.info-block h3::before {
  content: "";
  display: inline-block;
  width: 4px;
  height: 24px;
  background: var(--color-primary-element);
  margin-right: 12px;
  border-radius: var(--border-radius);
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

.tip-box {
  background: var(--color-background-hover);
  border-radius: var(--border-radius);
  padding: 20px;
  margin-top: 32px;
}

.tip-box strong {
  color: var(--color-primary-element);
  margin-right: 8px;
}
</style> 