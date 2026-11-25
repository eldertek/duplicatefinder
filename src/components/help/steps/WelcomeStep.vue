<template>
  <div class="welcome-container">
    <div class="welcome-content">
      <h1 class="welcome-title">{{ t('duplicatefinder', 'Welcome to Duplicate Finder!') }}</h1>
      <p class="welcome-description">{{ t('duplicatefinder', 'This guide will help you get started with finding and managing duplicate files.') }}</p>
    </div>
  </div>
</template>

<script>
export default {
  name: 'WelcomeStep'
}
</script>

<style scoped>
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
</style> 