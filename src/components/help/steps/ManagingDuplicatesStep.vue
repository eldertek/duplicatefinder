<template>
  <div class="step-container">
    <h2 class="step-title">{{ t('duplicatefinder', 'Managing Duplicates') }}</h2>
    <div class="info-section">
      <div class="info-block">
        <h3>1. {{ t('duplicatefinder', 'Individual Management') }}</h3>
        <ul>
          <li>{{ t('duplicatefinder', 'View all duplicates in the "Unacknowledged" and "Acknowledged" sections') }}</li>
          <li>{{ t('duplicatefinder', 'Select which copies to delete while keeping the originals') }}</li>
          <li>{{ t('duplicatefinder', 'Mark duplicates as acknowledged to organize them better') }}</li>
        </ul>
      </div>

      <div class="info-block">
        <h3>2. {{ t('duplicatefinder', 'Bulk Operations') }}</h3>
        <ul>
          <li>{{ t('duplicatefinder', 'Use "Bulk Delete" feature to handle multiple duplicates at once') }}</li>
          <li>{{ t('duplicatefinder', 'Select multiple files for deletion in a single operation') }}</li>
          <li>{{ t('duplicatefinder', 'Review your selection before confirming deletion') }}</li>
        </ul>
      </div>

      <div class="note">
        <strong>{{ t('duplicatefinder', 'Note:') }}</strong>
        {{ t('duplicatefinder', 'All deleted files can be recovered from the Nextcloud trash bin during the retention period.') }}
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'ManagingDuplicatesStep'
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
</style> 