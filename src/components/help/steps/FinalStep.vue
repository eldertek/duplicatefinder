<template>
  <div class="step-container">
    <div class="final-content">
      <h2 class="final-title">{{ t('duplicatefinder', "You're Ready!") }}</h2>
      <p class="final-description">
        {{ t('duplicatefinder', 'You can now start managing your duplicate files. Access settings anytime for more options.') }}
      </p>

      <div class="support-section">
        <h3 class="support-title">{{ t('duplicatefinder', 'Support the Project') }}</h3>
        <p class="support-subtitle">{{ t('duplicatefinder', 'Help us make Duplicate Finder even better!') }}</p>

        <div class="support-actions">
          <a href="https://github.com/eldertek/duplicatefinder" 
             target="_blank" 
             rel="noopener noreferrer" 
             class="support-action star-action">
            <div class="action-icon">⭐</div>
            <div class="action-content">
              <div class="action-title">{{ t('duplicatefinder', 'Star on GitHub') }}</div>
              <div class="action-description">{{ t('duplicatefinder', 'Show your support by starring the project') }}</div>
            </div>
          </a>

          <a href="https://github.com/eldertek/duplicatefinder/issues" 
             target="_blank" 
             rel="noopener noreferrer" 
             class="support-action feedback-action">
            <div class="action-icon">💡</div>
            <div class="action-content">
              <div class="action-title">{{ t('duplicatefinder', 'Share Feedback') }}</div>
              <div class="action-description">{{ t('duplicatefinder', 'Help us improve by sharing your ideas') }}</div>
            </div>
          </a>

          <a href="https://github.com/eldertek/duplicatefinder" 
             target="_blank" 
             rel="noopener noreferrer" 
             class="support-action contribute-action">
            <div class="action-icon">🚀</div>
            <div class="action-content">
              <div class="action-title">{{ t('duplicatefinder', 'Contribute') }}</div>
              <div class="action-description">{{ t('duplicatefinder', 'Join our community of developers') }}</div>
            </div>
          </a>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'FinalStep'
}
</script>

<style scoped>
.step-container {
  flex-grow: 1;
  padding: 40px;
  background: linear-gradient(var(--color-primary-element-light) 0%, transparent 100%);
}

.final-content {
  max-width: 800px;
  margin: 0 auto;
}

.final-title {
  font-size: 32px;
  font-weight: bold;
  color: var(--color-main-text);
  text-align: center;
  margin-bottom: 16px;
}

.final-description {
  font-size: 18px;
  line-height: 1.6;
  color: var(--color-text-maxcontrast);
  text-align: center;
  margin-bottom: 48px;
}

.support-section {
  background: var(--color-main-background);
  border-radius: var(--border-radius-large);
  padding: 32px;
  margin-bottom: 32px;
  box-shadow: var(--shadow-modal);
}

.support-title {
  font-size: 24px;
  font-weight: bold;
  color: var(--color-main-text);
  text-align: center;
  margin-bottom: 8px;
}

.support-subtitle {
  font-size: 16px;
  color: var(--color-text-maxcontrast);
  text-align: center;
  margin-bottom: 32px;
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
  text-decoration: none;
  transition: all 0.2s ease;
}

.support-action:hover {
  transform: translateX(8px);
  background: var(--color-main-background);
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

.resources-section {
  background: var(--color-main-background);
  border-radius: var(--border-radius-large);
  padding: 32px;
  box-shadow: var(--shadow-modal);
}

.resources-title {
  font-size: 24px;
  font-weight: bold;
  color: var(--color-main-text);
  text-align: center;
  margin-bottom: 24px;
}

.resources-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
}

.resource-item {
  display: flex;
  align-items: center;
  padding: 20px;
  background: var(--color-background-hover);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-large);
  text-decoration: none;
  transition: all 0.2s ease;
}

.resource-item:hover {
  transform: translateY(-4px);
  background: var(--color-main-background);
  border-color: var(--color-primary-element);
  box-shadow: var(--shadow-hover);
}

.resource-icon {
  font-size: 24px;
  margin-right: 16px;
  min-width: 32px;
  text-align: center;
}

.resource-content {
  flex-grow: 1;
}

.resource-title {
  color: var(--color-main-text);
  font-weight: bold;
  font-size: 16px;
  margin-bottom: 4px;
}

.resource-description {
  color: var(--color-text-maxcontrast);
  font-size: 14px;
}
</style> 